// Silnik rozgrywek reprezentacji na dowolną liczbę lat (docs/kalendarz-reprezentacji.md).
// Po części zapisanej na sztywno w national.js (Liga Narodów 2026/27, grupy eliminacji Euro 2028) przejmuje:
// baraże i turniej Euro 2028, kolejne edycje Ligi Narodów (od 2028/29: 3 ligi po 18), eliminacje Euro i MŚ
// (UEFA szczegółowo, pozostałe konfederacje w tle), baraże interkontynentalne, mistrzostwa świata (48 drużyn),
// Copa América, Puchar Narodów Afryki, Puchar Azji, Złoty Puchar CONCACAF, Puchar Narodów Oceanii, sparingi Polski.
//
// Stan gry: game.intl = { seed, ratings, comps, hosts, plan, planned, lnNext, polHome }.
// Historia: game.intlHistory (krótkie wpisy na każdą edycję, bez meczów).
// Szczegółowe mecze trzymamy tylko dla rozgrywek trwających i zakończonych w poprzednim roku.

import { Rng } from '../../core/rng.js';
import DATA from '../../data/reprezentacje.json' with { type: 'json' };
import { WORLD_NT } from '../worldNations.js';
import { NT, ntTeam, ntName, lnGroupTable, euroGroupTable, tieWinner, NT_COMP_NAMES } from '../national.js';
import { yearWindows, windowOf, tourPeriod, tournamentOf, windowDays, playoffDays, finalFourDays, addDaysIso, dowIso, TOUR_LEN } from './windows.js';
import { eloUpdate, regressRatings, bindRatings } from './ratings.js';
import { playMatch, winnerOf, loserOf, tableOf, tableFromPacked, packRow, acrossGroups, doubleRoundRobin, GROUP4, swiss18, drawGroups, bracketPairs, byElo, elo, L } from './sim.js';
import { hostsFor } from './hosts.js';
import { fmtDate } from '../../ui/dom.js';

// ------------------------------------------------------------ Drużyny
export const UEFA_TEAMS = NT.filter((t) => t.konfederacja === 'UEFA').map((t) => t.kod);
export const BASE_ELO = (() => {
  const r = {};
  for (const t of WORLD_NT) r[t.kod] = t.elo;
  for (const t of NT) r[t.kod] = t.elo;
  return r;
})();
export const confOf = (code) => (code?.startsWith('@UQ') ? 'UEFA' : code?.startsWith('@') ? null : ntTeam(code)?.konfederacja ?? null);
const fifaMember = (code) => ntTeam(code)?.czlonekFIFA !== false;
const CONF_TEAMS = {};
export function confTeams(conf, { fifa = true } = {}) {
  const k = `${conf}:${fifa}`;
  if (!CONF_TEAMS[k]) {
    const list = conf === 'UEFA' ? UEFA_TEAMS : WORLD_NT.filter((t) => t.konfederacja === conf).map((t) => t.kod);
    CONF_TEAMS[k] = list.filter((c) => !fifa || fifaMember(c));
  }
  return CONF_TEAMS[k];
}

export const COMP_NAME = {
  EURO: 'Euro', WC: 'Mistrzostwa świata', COPA: 'Copa América', AFCON: 'Puchar Narodów Afryki', ASIA: 'Puchar Azji',
  GOLD: 'Złoty Puchar CONCACAF', OFC: 'Puchar Narodów Oceanii', LN: 'Liga Narodów', TOW: 'Mecz towarzyski',
};
export const CONF_NAME = { UEFA: 'Europa (UEFA)', CONMEBOL: 'Ameryka Południowa (CONMEBOL)', CONCACAF: 'Ameryka Północna i Środkowa (CONCACAF)', CAF: 'Afryka (CAF)', AFC: 'Azja (AFC)', OFC: 'Oceania (OFC)' };
export const FMT = {
  EURO: { n: 24, groups: 6, thirds: 4, ko: ['R16', 'QF', 'SF', 'F'], third: false, kind: 'CT' },
  WC: { n: 48, groups: 12, thirds: 8, ko: ['R32', 'R16', 'QF', 'SF', 'F'], third: true, kind: 'WC' },
  COPA: { n: 16, groups: 4, thirds: 0, ko: ['QF', 'SF', 'F'], third: true, len: 25, kind: 'CT', conf: 'CONMEBOL' },
  AFCON: { n: 24, groups: 6, thirds: 4, ko: ['R16', 'QF', 'SF', 'F'], third: true, len: 29, kind: 'CT', conf: 'CAF' },
  ASIA: { n: 24, groups: 6, thirds: 4, ko: ['R16', 'QF', 'SF', 'F'], third: false, len: 30, kind: 'CT', conf: 'AFC' },
  GOLD: { n: 16, groups: 4, thirds: 0, ko: ['QF', 'SF', 'F'], third: false, len: 23, kind: 'CT', conf: 'CONCACAF' },
  OFC: { n: 8, groups: 2, thirds: 0, ko: ['SF', 'F'], third: false, len: 14, kind: 'CT', conf: 'OFC' },
};
export const ROUND_NAME = { R32: '1/16 finału', R16: '1/8 finału', QF: 'ćwierćfinał', SF: 'półfinał', 3: 'mecz o 3. miejsce', F: 'finał', PSF: 'półfinał baraży', PF: 'finał baraży' };
export const STAGE_LABEL = { Q: 'eliminacje', PO: 'baraże', G: 'faza grupowa', R32: '1/16 finału', R16: '1/8 finału', QF: 'ćwierćfinał', SF: 'półfinał', 4: '4. miejsce', 3: '3. miejsce', 2: 'finał', 1: 'mistrzostwo' };
const STAGE_ORDER = ['Q', 'PO', 'G', 'R32', 'R16', 'QF', 'SF', '4', '3', '2', '1'];
export const stageRank = (s) => STAGE_ORDER.indexOf(String(s));
// Miejsca na MŚ (48 drużyn) z gospodarzami w puli swojej konfederacji, baraż interkontynentalny 2 [SZAC]
export const WC_SLOTS = { UEFA: 16, CAF: 9, AFC: 8, CONMEBOL: 6, CONCACAF: 6, OFC: 1 };
const IC_SLOTS = { CAF: 1, AFC: 1, CONMEBOL: 1, CONCACAF: 2, OFC: 1 };
const CQ_GROUPS = { CONMEBOL: 1, CAF: 9, AFC: 8, CONCACAF: 6, OFC: 2 };
const LETTERS = 'ABCDEFGHIJKL';
export const tourKey = (y) => (tournamentOf(y) ? `${tournamentOf(y)}-${y}` : null);
export const tourName = (key) => { const [t, y] = key.split('-'); return `${COMP_NAME[t]} ${y}`; };
// Formy do zdań: „awans na mistrzostwa świata 2030”, „zagra na mistrzostwach świata 2030”
export const tourAcc = (key) => { const [t, y] = key.split('-'); return t === 'WC' ? `mistrzostwa świata ${y}` : `${COMP_NAME[t]} ${y}`; };
const tourLoc = (key) => { const [t, y] = key.split('-'); return t === 'WC' ? `mistrzostwach świata ${y}` : `${COMP_NAME[t]} ${y}`; };
const CHAMP_TITLE = { WC: 'Mistrz świata', EURO: 'Mistrz Europy', COPA: 'Zwycięzca Copa América', AFCON: 'Zwycięzca Pucharu Narodów Afryki', ASIA: 'Zwycięzca Pucharu Azji', GOLD: 'Zwycięzca Złotego Pucharu CONCACAF', OFC: 'Zwycięzca Pucharu Narodów Oceanii' };

/** Nazwa drużyny albo opis miejsca z baraży. */
export function intlName(code) {
  if (!code?.startsWith('@')) return ntName(code);
  const [kind, , path] = code.slice(1).split('-');
  if (kind === 'UQ') return `Zwycięzca baraży UEFA, ścieżka ${path}`;
  if (kind === 'IC') return `Zwycięzca baraży interkontynentalnych ${path}`;
  return code;
}
const isPh = (c) => c?.startsWith('@');

/** Grupa meczu do opisu: w Lidze Narodów od 2028/29 grupą jest liga. */
export const groupLabel = (m) => (m.group ? (m.comp === 'LN' && m.key ? `liga ${m.group}` : `grupa ${m.group}`) : '');

/** Opis rozgrywek meczu (format national.js, także mecze silnika z asNt). */
export function compLabel(m) {
  if (!m.key && NT_COMP_NAMES[m.comp]) return NT_COMP_NAMES[m.comp];
  const y = Number(m.key?.split('-').at(-1));
  const rd = m.round === 'AB' ? 'baraż A/B' : m.round === 'BC' ? 'baraż B/C' : ROUND_NAME[m.round] ?? '';
  if (m.comp === 'LN') return `Liga Narodów ${y}/${String(y + 1).slice(2)}${rd ? `, ${rd}` : ''}`;
  if (m.comp === 'UQ') return `Eliminacje: ${tourAcc(tourKey(y))}${rd ? `, ${rd}` : ''}`;
  if (m.comp === 'IC') return `Baraże interkontynentalne MŚ ${y}${rd ? `, ${rd}` : ''}`;
  if (m.comp === 'TOW') return 'Mecz towarzyski';
  return `${COMP_NAME[m.comp] ?? m.comp} ${y}${rd ? `, ${rd}` : ''}`;
}

// ------------------------------------------------------------ Kalendarz edycji
const firstOnOrAfter = (iso, dow) => { let d = iso; while (dowIso(d) !== dow) d = addDaysIso(d, 1); return d; };
const CONT_YEARS = {
  ASIA: (y) => y >= 2027 && (y - 2027) % 4 === 0,
  AFCON: (y) => y >= 2027 && (y - 2027) % 4 === 0,
  GOLD: (y) => y >= 2027 && y % 2 === 1,
  COPA: (y) => y >= 2028 && y % 4 === 0,
  OFC: (y) => y >= 2028 && y % 4 === 0,
};
/** Daty turnieju kontynentalnego w roku y [SZAC poza Pucharem Azji 2027]. */
export function contDates(type, y) {
  const len = FMT[type].len;
  let from;
  if (type === 'ASIA') from = firstOnOrAfter(`${y}-01-07`, 4); // czwartek; 2027: 7 stycznia
  else if (type === 'COPA' || type === 'OFC') from = firstOnOrAfter(addDaysIso(windowOf(y, 'prep').to, type === 'COPA' ? 8 : 6), type === 'COPA' ? 5 : 6);
  else from = firstOnOrAfter(addDaysIso(windowOf(y, 'jun').to, type === 'AFCON' ? 4 : 2), 6); // AFCON i Złoty Puchar: sobota po czerwcowym oknie
  return { from, to: addDaysIso(from, len - 1), len };
}
/** Daty turnieju finałowego Euro albo MŚ. */
function tourDates(y) { const t = tourPeriod(y); return { from: t.from, to: t.to, len: Math.round((Date.parse(t.to) - Date.parse(t.from)) / 864e5) + 1 }; }

const ORDER = { year: 0, ln26: 1, ln: 2, ic: 3, uq28: 4, uq: 5, cq: 6, tour: 7, cont: 8, fr: 9 };
/** Zdarzenia roku y (tworzenie rozgrywek, losowania, sparingi Polski, porządki roczne). */
export function eventsOfYear(y) {
  const ev = [{ at: `${y}-01-01`, kind: 'year', y }];
  if (y % 2 === 0 && y >= 2028) ev.push({ at: `${y}-02-10`, kind: 'ln', y });
  if (y % 2 === 0 && y + 2 >= 2030) {
    ev.push({ at: `${y}-12-06`, kind: 'uq', T: y + 2 });
    if (tournamentOf(y + 2) === 'WC') ev.push({ at: `${y}-12-06`, kind: 'cq', T: y + 2 });
  }
  if (y === 2027) { ev.push({ at: '2027-06-20', kind: 'ln26' }); ev.push({ at: '2027-11-20', kind: 'uq28' }); }
  if (y % 2 === 1) {
    if (tournamentOf(y + 1) === 'WC') ev.push({ at: `${y}-12-01`, kind: 'ic', T: y + 1 });
    ev.push({ at: `${y}-12-02`, kind: 'tour', T: y + 1 });
  }
  for (const type of Object.keys(CONT_YEARS)) {
    for (const e of [y, y + 1]) {
      if (!CONT_YEARS[type](e)) continue;
      const at = addDaysIso(contDates(type, e).from, -150);
      if (at.startsWith(String(y))) ev.push({ at, kind: 'cont', type, y: e });
    }
  }
  if (y >= 2027) for (const w of yearWindows(y)) if (w.matches) ev.push({ at: addDaysIso(w.from, -12), kind: 'fr', y, w: w.key });
  return ev.sort((a, b) => a.at.localeCompare(b.at) || ORDER[a.kind] - ORDER[b.kind]);
}

// ------------------------------------------------------------ Stan
export function createIntl(seed, start = '2026-07-01') {
  const I = { v: 1, seed: String(seed), start, ratings: { ...BASE_ELO }, comps: {}, hosts: {}, plan: [], planned: 0, lnNext: null, polHome: 0 };
  const y0 = Number(start.slice(0, 4));
  for (const y of [y0, y0 + 1]) planYear(I, y, start);
  return I;
}
function planYear(I, y, notBefore = null) {
  if (I.planned >= y) return;
  for (const e of eventsOfYear(y)) if (!notBefore || e.at >= notBefore) I.plan.push(e);
  I.plan.sort((a, b) => a.at.localeCompare(b.at) || ORDER[a.kind] - ORDER[b.kind]);
  I.planned = y;
}
const hosts = (I, key) => hostsFor(I.hosts, I.seed, key, confOf);

function addMatch(c, m) {
  c.m.push(m);
  return m;
}
const MK = { LN: 'LN', UQ: 'Q', CQ: 'Q', IC: 'PO', TOW: 'F', WC: 'WC' };
const eloKind = (c, m) => (c.type === 'UQ' && m.k ? 'PO' : MK[c.type] ?? 'CT');

/** Jeden dzień silnika. ctx: { N: game.national, history: game.intlHistory }. Zwraca zdarzenia do wiadomości. */
export function intlDay(I, date, ctx = {}) {
  const ev = { played: [], news: [], draws: [] };
  bindRatings(I.ratings);
  while (I.plan.length && I.plan[0].at <= date) runEvent(I, I.plan.shift(), date, ctx, ev);
  for (const c of Object.values(I.comps)) if (c.at && c.at <= date) step(I, c, date, ctx, ev);
  return ev;
}

function runEvent(I, e, date, ctx, ev) {
  switch (e.kind) {
    case 'year': return yearly(I, e.y, date, ctx);
    case 'ln': return lnCreate(I, e.y, ctx, ev);
    case 'ln26': return ln26Done(I, ctx, ev);
    case 'uq28': return uqCreate(I, 2028, ctx, ev);
    case 'uq': return uqCreate(I, e.T, ctx, ev);
    case 'cq': for (const conf of Object.keys(CQ_GROUPS)) cqCreate(I, conf, e.T); return null;
    case 'ic': return icCreate(I, e.T, ev);
    case 'tour': return tourCreate(I, tournamentOf(e.T), e.T, ev);
    case 'cont': return tourCreate(I, e.type, e.y, ev);
    case 'fr': return friendlies(I, e.y, e.w, ctx);
    default: return null;
  }
}

function yearly(I, y, date, ctx) {
  planYear(I, y + 1);
  if (y > 2027) regressRatings(I.ratings, BASE_ELO, 0.15);
  // Szczegóły tylko dla bieżącego i poprzedniego roku; starsze rozgrywki zostają w historii
  const cut = `${y - 1}-01-01`;
  for (const [k, c] of Object.entries(I.comps)) if (c.st === 'done' && (c.end ?? '0') < cut) delete I.comps[k];
  if (ctx.N && y >= 2030 && Object.keys(ctx.N.matches ?? {}).length) ctx.N.matches = {};
}

function step(I, c, date, ctx, ev) {
  const rng = new Rng(`intl:${I.seed}:${c.key}:${date}`);
  // Zabezpieczenie: nierozstrzygnięte miejsce z baraży w dniu startu turnieju -> najsilniejsza drużyna spoza turnieju
  if (FMT[c.type] && c.teams.some(isPh) && date >= c.from) {
    for (const ph of c.teams.filter(isPh)) {
      const pool = ph.startsWith('@UQ') ? UEFA_TEAMS : Object.keys(IC_SLOTS).flatMap((cf) => confTeams(cf));
      resolvePlaceholder(I, ph, byElo(pool).find((t) => !c.teams.includes(t)));
    }
  }
  if (c.m) {
    for (const m of c.m) {
      if (m.d !== date || m.s || isPh(m.h) || isPh(m.a)) continue;
      playMatch(m, rng, { ko: !!m.o, first: m.l === 2 ? c.m[m.f] : null });
      eloUpdate(I.ratings, m.h, m.a, m.s, { kind: eloKind(c, m), neutral: !!m.n });
      ev.played.push({ c, m });
    }
  }
  STEP[c.type]?.(I, c, date, rng, ctx, ev);
  c.at = c.st === 'done' ? null : nextAt(c, date);
}
function nextAt(c, date) {
  let best = null;
  for (const m of c.m ?? []) if (!m.s && m.d > date && (!best || m.d < best)) best = m.d;
  if (c.type === 'CQ' && c.j < c.dates.length) best = !best || c.dates[c.j] < best ? c.dates[c.j] : best;
  return best;
}
const roundDone = (c, pred) => c.m.filter(pred).every((m) => m.s);

// ------------------------------------------------------------ Liga Narodów
/** Ligi 2028/29 z wyników 2026/27 (docs/reprezentacje.md, przejście do formatu 3 x 18; national.js). */
export function leaguesFrom2026(N) {
  const t = (g) => lnGroupTable(N, g).map((r) => r.id);
  const rows = (g) => lnGroupTable(N, g);
  const across = (list) => [...list].sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
  const A = ['A1', 'A2', 'A3', 'A4']; const B = ['B1', 'B2', 'B3', 'B4']; const C = ['C1', 'C2', 'C3', 'C4'];
  const tw = (tie) => tieWinner(N, tie); const tl = (tie) => (tw(tie) === tie.a ? tie.b : tie.a);
  const a3 = across(A.map((g) => rows(g)[2])).map((r) => r.id); const a4 = across(A.map((g) => rows(g)[3])).map((r) => r.id);
  const lA = [...A.flatMap((g) => t(g).slice(0, 2)), ...a3.slice(0, 2), ...B.map((g) => t(g)[0]), ...N.ln.ko.ab.map(tw)];
  const lB = [...a4.slice(2), ...N.ln.ko.ab.map(tl), ...B.map((g) => t(g)[2]), ...C.map((g) => t(g)[0]), ...N.ln.ko.bc.map(tw)];
  const lC = [...N.ln.ko.bc.map(tl), ...C.flatMap((g) => t(g).slice(2)), ...['D1', 'D2'].flatMap(t)];
  return { A: lA, B: lB, C: lC };
}
/** Ranking Ligi Narodów 2026/27 do baraży Euro 2028: zwycięzcy grup (A, B, C, D), potem kolejne miejsca. */
export function lnRank26(N) {
  const groups = Object.keys(N.ln.groups);
  const out = [];
  for (let pos = 0; pos < 4; pos++) {
    for (const lg of ['A', 'B', 'C', 'D']) {
      const rows = groups.filter((g) => g[0] === lg).map((g) => lnGroupTable(N, g)[pos]).filter(Boolean);
      out.push(...rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf).map((r) => r.id));
    }
  }
  return out;
}
function lnRankFor(I, T, ctx) {
  const c = I.comps[`LN-${T - 2}`];
  if (c?.rank) return c.rank;
  if (T - 2 === 2026 && ctx.N?.ln?.ko) return lnRank26(ctx.N);
  return byElo(UEFA_TEAMS);
}

function lnCreate(I, y, ctx, ev) {
  let leagues = I.lnNext;
  if (!leagues && y === 2028 && ctx.N?.ln?.ko && [...ctx.N.ln.ko.ab, ...ctx.N.ln.ko.bc].every((t) => tieWinner(ctx.N, t))) leagues = leaguesFrom2026(ctx.N);
  if (!leagues) { const s = byElo(UEFA_TEAMS); leagues = { A: s.slice(0, 18), B: s.slice(18, 36), C: s.slice(36, 54) }; }
  const key = `LN-${y}`;
  const c = { key, type: 'LN', y, leagues, m: [], st: 'L', out: {} };
  const rng = new Rng(`ln:${I.seed}:${y}`);
  const days = [...windowDays(windowOf(y, 'sepoct')), ...windowDays(windowOf(y, 'nov'))];
  for (const lg of ['A', 'B', 'C']) {
    swiss18(byElo(leagues[lg]), rng).forEach((pairs, r) => pairs.forEach(([h, a]) => addMatch(c, { d: days[r], h, a, g: lg, r: r + 1 })));
  }
  I.comps[key] = c; I.lnNext = null;
  c.at = days[0];
  const pl = Object.entries(leagues).find(([, t]) => t.includes('POL'))?.[0];
  ev.news.push({ key: `${key}:draw`, from: 'UEFA', subject: `Liga Narodów ${y}/${String(y + 1).slice(2)}: losowanie`, body: pl ? `Polska gra w lidze ${pl}. Rywale w fazie ligowej: ${c.m.filter((m) => m.g === pl && (m.h === 'POL' || m.a === 'POL')).map((m) => ntName(m.h === 'POL' ? m.a : m.h)).join(', ')}. Mecze we wrześniu, październiku i listopadzie.` : 'Losowanie fazy ligowej zakończone.' });
}
export const lnTable = (c, lg) => tableOf(c.leagues[lg], c.m.filter((m) => m.g === lg));

const tie = (c, k, a, b, dates, extra = {}) => { const m1 = addMatch(c, { d: dates[0], h: a, a: b, k, l: 1, ...extra }); const i1 = c.m.length - 1; addMatch(c, { d: dates[1], h: b, a, k, l: 2, f: i1, ...extra }); return [i1, i1 + 1]; };
const tieWin = (c, t) => winnerOf(c.m[t[1]], c.m[t[0]]);
const tieLose = (c, t) => loserOf(c.m[t[1]], c.m[t[0]]);

const STEP = {
  LN(I, c, date, rng, ctx, ev) {
    if (c.st === 'L' && roundDone(c, (m) => m.g)) {
      const T = Object.fromEntries(['A', 'B', 'C'].map((lg) => [lg, lnTable(c, lg).map((r) => r.id)]));
      c.rank = [...T.A, ...T.B, ...T.C];
      const mar = windowDays(windowOf(c.y + 1, 'mar'));
      const qf = [[7, 0], [6, 1], [5, 2], [4, 3]].map(([x, y]) => tie(c, 'QF', T.A[x], T.A[y], mar));
      const ab = [[3, 14], [2, 15]].map(([b, a]) => tie(c, 'AB', T.B[b], T.A[a], mar));
      const bc = [[3, 14], [2, 15]].map(([cc, b]) => tie(c, 'BC', T.C[cc], T.B[b], mar));
      c.ko = { qf, ab, bc };
      c.st = 'KO';
      const pol = polLn(c);
      ev.draws.push({ key: c.key, kind: 'LNKO' });
      ev.news.push({ key: `${c.key}:ko`, from: 'UEFA', subject: `Liga Narodów: koniec fazy ligowej`, body: pol ? `Polska: liga ${pol.lg}, ${pol.pos}. miejsce. ${pol.next}` : '' });
      return;
    }
    if (c.st === 'KO' && c.ko.qf.concat(c.ko.ab, c.ko.bc).every((t) => c.m[t[1]].s)) {
      const T = { A: c.rank.slice(0, 18), B: c.rank.slice(18, 36), C: c.rank.slice(36) };
      I.lnNext = {
        A: [...T.A.slice(0, 14), ...T.B.slice(0, 2), ...c.ko.ab.map((t) => tieWin(c, t))],
        B: [...T.A.slice(16), ...c.ko.ab.map((t) => tieLose(c, t)), ...T.B.slice(4, 14), ...T.C.slice(0, 2), ...c.ko.bc.map((t) => tieWin(c, t))],
        C: [...c.ko.bc.map((t) => tieLose(c, t)), ...T.B.slice(16), ...T.C.slice(4)],
      };
      for (const t of c.ko.qf) c.out[tieLose(c, t)] = c.m[t[1]].d;
      const w = c.ko.qf.map((t) => tieWin(c, t));
      const ff = finalFourDays(windowOf(c.y + 1, 'jun'));
      addMatch(c, { d: ff[0], h: w[0], a: w[3], k: 'SF', o: 1, n: 1 });
      addMatch(c, { d: ff[1], h: w[1], a: w[2], k: 'SF', o: 1, n: 1 });
      c.st = 'F';
      const pl = Object.entries(I.lnNext).find(([, t]) => t.includes('POL'))?.[0];
      if (pl) ev.news.push({ key: `${c.key}:next`, from: 'UEFA', subject: 'Liga Narodów: awanse i spadki', body: `W następnej edycji Ligi Narodów Polska zagra w lidze ${pl}.` });
      return;
    }
    if (c.st === 'F') {
      const sf = c.m.filter((m) => m.k === 'SF');
      if (sf.every((m) => m.s) && !c.m.some((m) => m.k === 'F')) {
        const ff = finalFourDays(windowOf(c.y + 1, 'jun'));
        addMatch(c, { d: ff[2], h: loserOf(sf[0]), a: loserOf(sf[1]), k: '3', o: 1, n: 1 });
        addMatch(c, { d: ff[2], h: winnerOf(sf[0]), a: winnerOf(sf[1]), k: 'F', o: 1, n: 1 });
        return;
      }
      const f = c.m.find((m) => m.k === 'F');
      if (f?.s && c.m.find((m) => m.k === '3').s) {
        c.champion = winnerOf(f); c.runnerUp = loserOf(f); c.semis = sf.flatMap((m) => [m.h, m.a]);
        c.third = winnerOf(c.m.find((m) => m.k === '3'));
        finish(I, c, date, ctx, ev);
      }
    }
  },
};

function polLn(c) {
  const lg = ['A', 'B', 'C'].find((x) => c.leagues[x].includes('POL'));
  if (!lg) return null;
  const pos = lnTable(c, lg).findIndex((r) => r.id === 'POL') + 1;
  const next = lg === 'A' ? (pos <= 8 ? 'Awans do ćwierćfinału.' : pos >= 17 ? 'Spadek do ligi B.' : pos >= 15 ? 'Baraż o utrzymanie w lidze A.' : 'Utrzymanie w lidze A.')
    : lg === 'B' ? (pos <= 2 ? 'Awans do ligi A.' : pos <= 4 ? 'Baraż o awans do ligi A.' : pos >= 17 ? 'Spadek do ligi C.' : pos >= 15 ? 'Baraż o utrzymanie w lidze B.' : 'Utrzymanie w lidze B.')
      : (pos <= 2 ? 'Awans do ligi B.' : pos <= 4 ? 'Baraż o awans do ligi B.' : 'Gra w lidze C.');
  return { lg, pos, next };
}

/** Liga Narodów 2026/27 (national.js) do historii po finale. */
function ln26Done(I, ctx) {
  const N = ctx.N;
  if (!N?.ln?.champion || !ctx.history || ctx.history.some((h) => h.comp === 'LN' && h.year === 2027)) return;
  const sf = (N.ln.finals?.sf ?? []).map((id) => N.matches[id]).filter(Boolean);
  const f = N.matches['LNF-F'];
  const g = Object.entries(N.ln.groups).find(([, t]) => t.includes('POL'));
  const rows = g ? lnGroupTable(N, g[0]) : [];
  const r = rows.find((x) => x.id === 'POL');
  const polMs = Object.values(N.matches).filter((m) => m.played && m.comp.startsWith('LN') && (m.home === 'POL' || m.away === 'POL'));
  const rec = record(polMs.map((m) => ({ h: m.home, a: m.away, s: m.result.score, p: m.result.shootout })), 'POL');
  ctx.history.push({
    year: 2027, comp: 'LN', edition: '2026/27', host: null, champion: N.ln.champion, runnerUp: f ? (f.home === N.ln.champion ? f.away : f.home) : null,
    semis: sf.flatMap((m) => [m.home, m.away]),
    ...(g ? { polandResult: `liga ${g[0][0]}, grupa ${g[0]}, ${r?.pos ?? '?'}. miejsce`, poland: { stage: `${g[0][0]}${r?.pos ?? ''}`, record: rec.record, gf: rec.gf, ga: rec.ga } } : {}),
  });
}

// ------------------------------------------------------------ Eliminacje UEFA (Euro, MŚ)
function uqCreate(I, T, ctx, ev) {
  const type = tournamentOf(T);
  const key = `UQ-${T}`;
  if (I.comps[key]) return;
  const H = hosts(I, `${type}-${T}`);
  const c = { key, type: 'UQ', T, tour: type, hosts: H, m: [], st: 'G', groups: {} };
  const rng = new Rng(`uq:${I.seed}:${T}`);
  if (T === 2028) {
    // Grupy Euro 2028 rozegrane w national.js: tabele zapisane tutaj, mecze zostają w game.national
    const N = ctx.N;
    if (!N?.euro?.groups) return;
    c.groups = { ...N.euro.groups };
    c.tables = Object.fromEntries(Object.keys(c.groups).map((g) => [g, Object.fromEntries(euroGroupTable(N, g).map((r) => [r.id, [r.p, r.w, r.d, r.l, r.gf, r.ga, r.pts]]))]));
    I.comps[key] = c;
    uqQualify(I, c, ctx, ev, '2027-11-20');
    c.at = nextAt(c, '2027-11-20');
    return;
  }
  const teams = UEFA_TEAMS.filter((t) => type !== 'WC' || !H.includes(t));
  const ln = I.comps[`LN-${T - 2}`];
  const busy = new Set(ln?.ko ? [...ln.ko.qf, ...ln.ko.ab, ...ln.ko.bc].flatMap((t) => [ln.m[t[0]].h, ln.m[t[0]].a]) : []);
  const n5 = Math.max(0, Math.min(12, teams.length - 48)); const n4 = 12 - n5;
  const four = teams.filter((t) => busy.has(t)).slice(0, 4 * n4);
  const rest = rng.shuffle(teams.filter((t) => !four.includes(t)));
  while (four.length < 4 * n4 && rest.length) four.push(rest.pop());
  const five = teams.filter((t) => !four.includes(t));
  const apart = (g, t) => !(H.includes(t) && g.some((x) => H.includes(x)));
  const g5 = n5 ? drawGroups(byElo(five), n5, rng, { ok: apart }) : [];
  const g4 = drawGroups(byElo(four), n4, rng, { ok: apart });
  const y = T - 1;
  const days = [...windowDays(windowOf(y, 'mar')), ...windowDays(windowOf(y, 'jun')), ...windowDays(windowOf(y, 'sepoct')), ...windowDays(windowOf(y, 'nov'))];
  [...g5, ...g4].forEach((g, gi) => {
    const L1 = LETTERS[gi];
    c.groups[L1] = g;
    const rounds = doubleRoundRobin(g, rng);
    const off = rounds.length >= 10 ? 0 : 10 - rounds.length;
    rounds.forEach((pairs, r) => pairs.forEach(([h, a]) => addMatch(c, { d: days[off + r], h, a, g: L1, r: r + 1 })));
  });
  I.comps[key] = c;
  c.at = nextAt(c, `${T - 2}-12-06`);
  const pg = Object.entries(c.groups).find(([, t]) => t.includes('POL'));
  ev.draws.push({ key, kind: 'UQ' });
  ev.news.push({ key: `${key}:draw`, from: 'UEFA', subject: `Losowanie eliminacji: ${tourAcc(`${type}-${T}`)}`, body: pg ? `Polska trafiła do grupy ${pg[0]}: ${pg[1].filter((t) => t !== 'POL').map(ntName).join(', ')}. Mecze w ${T - 1} roku${pg[1].length === 4 ? ' od września' : ' od marca'}.` : `Gospodarze turnieju (${H.map(ntName).join(', ')}) mają zapewniony awans.` });
}
export const uqTable = (c, g) => (c.tables ? tableFromPacked(c.tables[g]) : tableOf(c.groups[g], c.m.filter((m) => m.g === g)));

function uqQualify(I, c, ctx, ev, date) {
  const tables = Object.keys(c.groups).map((g) => uqTable(c, g));
  const W = acrossGroups(tables.map((t) => t[0])).map((r) => r.id);
  const R = acrossGroups(tables.map((t) => t[1])).map((r) => r.id);
  let direct; let hostSlots = []; let paths;
  if (c.tour === 'EURO') {
    direct = [...W, ...R.slice(0, 8)];
    hostSlots = byElo(c.hosts.filter((h) => !direct.includes(h))).slice(0, Math.min(2, c.hosts.length));
    paths = 24 - direct.length - hostSlots.length;
  } else {
    const slots = WC_SLOTS.UEFA - c.hosts.filter((h) => confOf(h) === 'UEFA').length;
    direct = W.slice(0, Math.min(12, slots));
    paths = slots - direct.length;
  }
  const taken = new Set([...direct, ...hostSlots]);
  const pool = [...R, ...W, ...lnRankFor(I, c.T, ctx)].filter((t, i, a) => !taken.has(t) && a.indexOf(t) === i && !(c.tour === 'WC' && c.hosts.includes(t)));
  const chosen = byElo(pool.slice(0, 4 * paths));
  const mar = playoffDays(windowOf(c.T, 'mar'));
  c.direct = direct; c.hostSlots = hostSlots; c.paths = [];
  for (let p = 0; p < paths; p++) {
    const seeds = [chosen[p], chosen[2 * paths - 1 - p], chosen[2 * paths + p], chosen[4 * paths - 1 - p]];
    const id = LETTERS[p];
    c.paths.push({ id, teams: seeds });
    addMatch(c, { d: mar[0], h: seeds[0], a: seeds[3], k: 'PSF', o: 1, path: id });
    addMatch(c, { d: mar[0], h: seeds[1], a: seeds[2], k: 'PSF', o: 1, path: id });
  }
  c.st = paths ? 'PO' : 'done';
  if (!paths) c.end = date;
  // Polska
  const pg = Object.entries(c.groups).find(([, t]) => t.includes('POL'));
  if (pg) {
    const pos = uqTable(c, pg[0]).findIndex((r) => r.id === 'POL') + 1;
    const k = `${c.tour}-${c.T}`; const name = tourAcc(k);
    const inPath = c.paths.find((p) => p.teams.includes('POL'));
    const txt = direct.includes('POL') ? `Polska awansowała na ${name} (${pos}. miejsce w grupie ${pg[0]}).`
      : hostSlots.includes('POL') ? `Polska zagra na ${tourLoc(k)} jako gospodarz (${pos}. miejsce w grupie ${pg[0]}).`
        : inPath ? `Polska zagra w marcowych barażach o awans na ${name} (ścieżka ${inPath.id}).` : `Polska nie awansowała na ${name} (${pos}. miejsce w grupie ${pg[0]}).`;
    ev.news.push({ key: `${c.key}:pol`, from: 'Reprezentacja Polski', priority: 'important', subject: direct.includes('POL') || hostSlots.includes('POL') ? `Awans na ${name}` : inPath ? 'Polska w barażach' : `Bez awansu na ${name}`, body: txt });
  }
}

STEP.UQ = function uqStep(I, c, date, rng, ctx, ev) {
  if (c.st === 'G' && roundDone(c, (m) => m.g)) { uqQualify(I, c, ctx, ev, date); return; }
  if (c.st !== 'PO') return;
  for (const p of c.paths) {
    if (p.winner) continue;
    const sf = c.m.filter((m) => m.k === 'PSF' && m.path === p.id);
    const f = c.m.find((m) => m.k === 'PF' && m.path === p.id);
    if (!f && sf.every((m) => m.s)) {
      // Gospodarz finału: zwycięzca półfinału z drużyną rozstawioną z numerem 1 [SZAC]
      addMatch(c, { d: playoffDays(windowOf(c.T, 'mar'))[1], h: winnerOf(sf[0]), a: winnerOf(sf[1]), k: 'PF', o: 1, path: p.id });
    } else if (f?.s) {
      p.winner = winnerOf(f);
      resolvePlaceholder(I, `@${c.key}-${p.id}`, p.winner);
      if (p.teams.includes('POL')) {
        const name = tourAcc(`${c.tour}-${c.T}`);
        ev.news.push({ key: `${c.key}:po:pol`, from: 'Reprezentacja Polski', priority: 'important', subject: p.winner === 'POL' ? `Awans na ${name}` : `Bez awansu na ${name}`, body: p.winner === 'POL' ? `Polska wygrała baraże (ścieżka ${p.id}) i zagra na ${tourLoc(`${c.tour}-${c.T}`)}.` : `Polska odpadła w barażach (ścieżka ${p.id}). Awans: ${ntName(p.winner)}.` });
      }
    }
  }
  if (c.paths.every((p) => p.winner)) { c.st = 'done'; c.end = date; }
};

// ------------------------------------------------------------ Eliminacje MŚ pozostałych konfederacji (w tle)
function cqCreate(I, conf, T) {
  const key = `CQ-${conf}-${T}`;
  if (I.comps[key]) return;
  const H = hosts(I, `WC-${T}`).filter((h) => confOf(h) === conf);
  const teams = byElo(confTeams(conf).filter((t) => !H.includes(t)));
  const rng = new Rng(`cq:${I.seed}:${key}`);
  const G = Math.min(CQ_GROUPS[conf], Math.max(1, Math.floor(teams.length / 4)));
  const groups = G === 1 ? [teams] : drawGroups(teams, G, rng);
  const y = T - 1;
  const days = [...windowDays(windowOf(y, 'mar')), ...windowDays(windowOf(y, 'jun')), ...windowDays(windowOf(y, 'sepoct')), ...windowDays(windowOf(y, 'nov'))];
  const c = { key, type: 'CQ', conf, T, hosts: H, st: 'G', j: 0, dates: days, final: conf === 'OFC', m: [],
    groups: groups.map((t) => ({ t, r: Object.fromEntries(t.map((x) => [x, [0, 0, 0, 0, 0, 0, 0]])) })) };
  c.at = days[0];
  I.comps[key] = c;
}
const cqRounds = (I, c, gi) => doubleRoundRobin(c.groups[gi].t, new Rng(`cq-r:${I.seed}:${c.key}:${gi}`));
STEP.CQ = function cqStep(I, c, date, rng) {
  if (c.st !== 'G' || c.dates[c.j] !== date) return;
  const D = c.dates.length - (c.final ? 1 : 0);
  if (c.j < D) {
    c.groups.forEach((g, gi) => {
      const rounds = cqRounds(I, c, gi);
      rounds.forEach((pairs, r) => {
        if (Math.floor((r * D) / rounds.length) !== c.j) return;
        for (const [h, a] of pairs) {
          const m = playMatch({ h, a }, rng);
          packRow(g.r, h, a, m.s);
          eloUpdate(I.ratings, h, a, m.s, { kind: 'Q' });
        }
      });
    });
  }
  c.j++;
  if (c.j === D && c.final) {
    const w = c.groups.map((g) => tableFromPacked(g.r)[0].id);
    addMatch(c, { d: c.dates[D], h: w[0], a: w[1], k: 'F', o: 1, n: 1 });
  }
  if (c.j >= c.dates.length) {
    const tabs = c.groups.map((g) => tableFromPacked(g.r));
    const order = [];
    const f = c.m.find((m) => m.k === 'F');
    if (f) order.push(winnerOf(f), loserOf(f));
    const maxLen = Math.max(...tabs.map((t) => t.length));
    for (let p = 0; p < maxLen; p++) order.push(...acrossGroups(tabs.map((t) => t[p]).filter(Boolean)).map((r) => r.id).filter((id) => !order.includes(id)));
    const slots = WC_SLOTS[c.conf] - c.hosts.length;
    c.direct = order.slice(0, Math.max(0, slots));
    c.ic = order.slice(Math.max(0, slots), Math.max(0, slots) + IC_SLOTS[c.conf]);
    c.st = 'done'; c.end = date;
  }
};
export const cqTable = (c, gi) => tableFromPacked(c.groups[gi].r);

// ------------------------------------------------------------ Baraże interkontynentalne
function icCreate(I, T, ev) {
  const key = `IC-${T}`;
  if (I.comps[key]) return;
  let teams = Object.keys(IC_SLOTS).flatMap((conf) => I.comps[`CQ-${conf}-${T}`]?.ic ?? []);
  if (teams.length < 6) {
    const taken = new Set([...teams, ...Object.keys(IC_SLOTS).flatMap((conf) => I.comps[`CQ-${conf}-${T}`]?.direct ?? [])]);
    teams.push(...byElo(Object.keys(IC_SLOTS).flatMap((conf) => confTeams(conf))).filter((t) => !taken.has(t)).slice(0, 6 - teams.length));
  }
  teams = byElo(teams);
  const c = { key, type: 'IC', T, teams, m: [], st: 'SF', seeds: teams.slice(0, 2), host: hosts(I, `WC-${T}`) };
  const d = playoffDays(windowOf(T, 'mar'));
  addMatch(c, { d: d[0], h: teams[2], a: teams[5], k: 'PSF', o: 1, n: 1, path: '2' });
  addMatch(c, { d: d[0], h: teams[3], a: teams[4], k: 'PSF', o: 1, n: 1, path: '1' });
  c.at = d[0];
  I.comps[key] = c;
  ev.draws.push({ key, kind: 'IC' });
}
STEP.IC = function icStep(I, c, date) {
  const sf = c.m.filter((m) => m.k === 'PSF');
  if (c.st === 'SF' && sf.every((m) => m.s)) {
    const d = playoffDays(windowOf(c.T, 'mar'))[1];
    addMatch(c, { d, h: c.seeds[0], a: winnerOf(sf.find((m) => m.path === '1')), k: 'PF', o: 1, n: 1, path: '1' });
    addMatch(c, { d, h: c.seeds[1], a: winnerOf(sf.find((m) => m.path === '2')), k: 'PF', o: 1, n: 1, path: '2' });
    c.st = 'F';
    return;
  }
  if (c.st === 'F' && c.m.filter((m) => m.k === 'PF').every((m) => m.s)) {
    for (const m of c.m.filter((x) => x.k === 'PF')) resolvePlaceholder(I, `@IC-${c.T}-${m.path}`, winnerOf(m));
    c.winners = c.m.filter((m) => m.k === 'PF').map((m) => winnerOf(m));
    c.st = 'done'; c.end = date;
  }
};

function resolvePlaceholder(I, ph, code) {
  for (const c of Object.values(I.comps)) {
    if (!FMT[c.type] || !c.teams?.includes(ph)) continue;
    c.teams = c.teams.map((t) => (t === ph ? code : t));
    for (const g of Object.keys(c.groups)) c.groups[g] = c.groups[g].map((t) => (t === ph ? code : t));
    for (const m of c.m) { if (m.h === ph) m.h = code; if (m.a === ph) m.a = code; }
  }
}

// ------------------------------------------------------------ Turnieje finałowe (Euro, MŚ, kontynentalne)
function participants(I, type, y, H, rng) {
  const fmt = FMT[type];
  if (type === 'EURO') {
    const q = I.comps[`UQ-${y}`];
    if (q?.direct) return [...q.direct, ...q.hostSlots, ...q.paths.map((p) => p.winner ?? `@UQ-${y}-${p.id}`)];
    return [...H, ...byElo(UEFA_TEAMS)];
  }
  if (type === 'WC') {
    const q = I.comps[`UQ-${y}`];
    const list = [...H];
    if (q?.direct) list.push(...q.direct, ...q.paths.map((p) => p.winner ?? `@UQ-${y}-${p.id}`));
    for (const conf of Object.keys(CQ_GROUPS)) list.push(...(I.comps[`CQ-${conf}-${y}`]?.direct ?? []));
    const ic = I.comps[`IC-${y}`];
    list.push(...(ic?.winners ?? ['@IC-' + y + '-1', '@IC-' + y + '-2']));
    return list;
  }
  // Turnieje kontynentalne: eliminacje nie są symulowane, awans według siły z losowym rozrzutem [SZAC]
  const noisy = (list) => list.map((t) => [t, elo(t) + rng.gauss(0, 70)]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  if (type === 'COPA') {
    const guests = noisy(confTeams('CONCACAF')).slice(0, 6);
    return [...H, ...confTeams('CONMEBOL').filter((t) => !H.includes(t)), ...guests];
  }
  const pool = confTeams(fmt.conf, { fifa: type !== 'GOLD' }).filter((t) => !H.includes(t));
  return [...H, ...noisy(pool).slice(0, fmt.n - H.length)];
}

function tourCreate(I, type, y, ev) {
  const key = `${type}-${y}`;
  if (I.comps[key]) return;
  const fmt = FMT[type];
  const rng = new Rng(`turniej:${I.seed}:${key}`);
  const H = hosts(I, key);
  let teams = participants(I, type, y, H, rng).filter((t, i, a) => a.indexOf(t) === i);
  if (teams.length < fmt.n) teams.push(...byElo(confTeams(fmt.conf ?? 'UEFA')).filter((t) => !teams.includes(t)).slice(0, fmt.n - teams.length));
  if (teams.length < fmt.n) teams.push(...byElo(Object.keys(BASE_ELO)).filter((t) => !teams.includes(t)).slice(0, fmt.n - teams.length));
  teams = teams.slice(0, fmt.n);
  const { from, to, len } = fmt.len ? contDates(type, y) : tourDates(y);
  const qualifiedHosts = H.filter((h) => teams.includes(h));
  const fixed = Object.fromEntries(qualifiedHosts.slice(0, fmt.groups).map((h, i) => [i, h]));
  const ph = teams.filter(isPh);
  const sorted = [...byElo(teams.filter((t) => !isPh(t))), ...ph];
  // MŚ: najwyżej jedna drużyna z konfederacji w grupie (UEFA: dwie); miejsce z baraży interkontynentalnych
  // liczy się jako każda konfederacja, z której może przyjść zwycięzca tej ścieżki
  const ic = I.comps[`IC-${y}`];
  const confs = (t) => {
    if (!t.startsWith('@IC')) return [confOf(t)];
    const p = t.split('-')[2]; const sf = ic?.m.find((m) => m.k === 'PSF' && m.path === p);
    return [...new Set([ic?.seeds[Number(p) - 1], sf?.h, sf?.a].filter(Boolean).map(confOf))];
  };
  const ok = type === 'WC' ? (g, t) => confs(t).every((cf) => {
    const n = g.filter((x) => confs(x).includes(cf)).length;
    return cf === 'UEFA' ? n < 2 : n < 1;
  }) : () => true;
  const groups = drawGroups(sorted, fmt.groups, rng, { fixed, ok });
  const c = { key, type, y, host: H, from, to, len, teams, groups: {}, m: [], st: 'G', out: {} };
  const days = tourSchedule(fmt, len);
  groups.forEach((g, gi) => {
    const L1 = LETTERS[gi];
    c.groups[L1] = g;
    GROUP4.forEach((pairs, md) => pairs.forEach(([x, z]) => {
      let h = g[x]; let a = g[z];
      if (H.includes(a) && !H.includes(h)) [h, a] = [a, h];
      addMatch(c, { d: addDaysIso(from, days.md[md] + (gi % days.spread)), h, a, g: L1, r: md + 1, ...(H.includes(h) ? {} : { n: 1 }) });
    }));
  });
  I.comps[key] = c;
  c.at = from;
  ev.draws.push({ key, kind: 'TOUR' });
  if (type === 'EURO' || type === 'WC') {
    const pg = Object.entries(c.groups).find(([, t]) => t.includes('POL'));
    ev.news.push({ key: `${key}:draw`, from: type === 'EURO' ? 'UEFA' : 'FIFA', subject: `Losowanie grup: ${tourName(key)}`, body: pg ? `Polska zagra w grupie ${pg[0]}: ${pg[1].filter((t) => t !== 'POL').map(intlName).join(', ')}. Turniej od ${fmtDate(from)} do ${fmtDate(to)}, gospodarze: ${H.map(ntName).join(', ')}.` : `Gospodarze: ${H.map(ntName).join(', ')}. Turniej od ${fmtDate(from)} do ${fmtDate(to)}.` });
  }
}

/** Dni meczów turnieju: kolejki grupowe, rundy pucharowe (finał ostatniego dnia), mecz o 3. miejsce dzień wcześniej. */
export function tourSchedule(fmt, len) {
  const G = Math.round(len * 0.42);
  const md = [0, 1, 2].map((k) => Math.round((k * G) / 3));
  const spread = Math.max(1, Math.round(G / 3) - 1);
  const R = fmt.ko.length;
  const ko = fmt.ko.map((_, r) => (r === R - 1 ? len - 1 : G + 1 + Math.round((r * (len - 1 - (G + 1))) / (R - 1))));
  return { md, spread, ko, third: len - 2 };
}

function tourStep(I, c, date, rng, ctx, ev) {
  const fmt = FMT[c.type];
  const days = tourSchedule(fmt, c.len);
  if (c.st === 'G') {
    if (!roundDone(c, (m) => m.g)) return;
    const tabs = Object.keys(c.groups).map((g) => [g, tableOf(c.groups[g], c.m.filter((m) => m.g === g))]);
    const groupOf = new Map(tabs.flatMap(([g, t]) => t.map((r) => [r.id, g])));
    const W = acrossGroups(tabs.map(([, t]) => t[0])).map((r) => r.id);
    const R2 = acrossGroups(tabs.map(([, t]) => t[1])).map((r) => r.id);
    const T3 = acrossGroups(tabs.map(([, t]) => t[2])).map((r) => r.id).slice(0, fmt.thirds);
    const seeded = [...W, ...R2, ...T3];
    for (const t of c.teams) if (!seeded.includes(t)) c.out[t] = lastMatch(c, t);
    c.st = 'KO'; c.r = 0;
    koRound(c, bracketPairs(seeded, (t) => groupOf.get(t)), days);
    return;
  }
  if (c.st !== 'KO') return;
  const k = fmt.ko[c.r];
  if (!roundDone(c, (m) => m.k === k || (k === 'F' && m.k === '3'))) return;
  const ms = c.m.filter((m) => m.k === k);
  for (const m of ms) c.out[loserOf(m)] = m.d;
  if (k === 'F') {
    const f = ms[0];
    c.champion = winnerOf(f); c.runnerUp = loserOf(f);
    c.semis = c.m.filter((m) => m.k === 'SF').flatMap((m) => [m.h, m.a]);
    const third = c.m.find((m) => m.k === '3');
    if (third) { c.third = winnerOf(third); c.out[loserOf(third)] = third.d; c.out[c.third] = third.d; }
    c.out[c.champion] = f.d;
    finish(I, c, date, ctx, ev);
    return;
  }
  const winners = ms.map((m) => winnerOf(m));
  c.r++;
  const pairs = [];
  for (let i = 0; i < winners.length; i += 2) pairs.push([winners[i], winners[i + 1]]);
  if (fmt.ko[c.r] === 'F' && fmt.third) {
    const losers = ms.map((m) => loserOf(m));
    for (const l of losers) delete c.out[l];
    addMatch(c, { d: addDaysIso(c.from, days.third), h: losers[0], a: losers[1], k: '3', o: 1, ...neutral(c, losers[0], losers[1]) });
  }
  koRound(c, pairs, days);
}
const neutral = (c, h, a) => (c.host?.includes(h) || c.host?.includes(a) ? {} : { n: 1 });
function koRound(c, pairs, days) {
  const k = FMT[c.type].ko[c.r];
  const spread = pairs.length >= 8 ? 4 : pairs.length >= 2 ? 2 : 1;
  for (let i = 0; i < pairs.length; i++) {
    let [h, a] = pairs[i];
    if (c.host?.includes(a) && !c.host.includes(h)) [h, a] = [a, h];
    addMatch(c, { d: addDaysIso(c.from, days.ko[c.r] + (k === 'F' ? 0 : Math.floor((i * spread) / pairs.length))), h, a, k, o: 1, ...neutral(c, h, a) });
  }
}
const lastMatch = (c, t) => c.m.filter((m) => m.h === t || m.a === t).map((m) => m.d).sort().at(-1);
for (const t of Object.keys(FMT)) STEP[t] = tourStep;

// ------------------------------------------------------------ Sparingi Polski
function polBusy(I, ctx, from, to) {
  const out = [];
  for (const c of Object.values(I.comps)) for (const m of c.m ?? []) if ((m.h === 'POL' || m.a === 'POL') && m.d >= from && m.d <= to) out.push(m.d);
  for (const m of Object.values(ctx.N?.matches ?? {})) if ((m.home === 'POL' || m.away === 'POL') && m.date >= from && m.date <= to) out.push(m.date);
  // Polska w finałach Ligi Narodów: finał albo mecz o 3. miejsce (dopisywany po półfinałach)
  for (const c of Object.values(I.comps)) if (c.type === 'LN' && c.st === 'F' && c.m.some((m) => m.k === 'SF' && (m.h === 'POL' || m.a === 'POL'))) out.push(finalFourDays(windowOf(c.y + 1, 'jun'))[2]);
  // Polska w barażach (mecze dopiero po półfinałach) i w turnieju: termin zajęty
  for (const c of Object.values(I.comps)) if ((c.type === 'UQ' || c.type === 'IC') && c.paths?.some((p) => p.teams.includes('POL') && !p.winner)) out.push(...playoffDays(windowOf(c.T, 'mar')));
  return out;
}
function friendlies(I, y, wkey, ctx) {
  const w = yearWindows(y).find((x) => x.key === wkey);
  if (!w?.matches) return;
  const busy = polBusy(I, ctx, addDaysIso(w.from, -1), addDaysIso(w.to, 1));
  const near = (d) => busy.some((b) => Math.abs(Date.parse(b) - Date.parse(d)) <= 864e5);
  const free = windowDays(w).filter((d) => !near(d)).slice(0, Math.max(0, w.matches - busy.length));
  if (!free.length) return;
  const key = `TOW-${y}`;
  const c = I.comps[key] ?? (I.comps[key] = { key, type: 'TOW', y, m: [], st: 'open' });
  c.st = 'open';
  const rng = new Rng(`sparing:${I.seed}:${w.key}`);
  const lp = L('POL');
  const used = new Set(c.m.filter((m) => m.d >= w.from).flatMap((m) => [m.h, m.a]));
  for (const d of free) {
    const uefa = rng.chance(0.6);
    const pool = (uefa ? UEFA_TEAMS : ['CONMEBOL', 'CONCACAF', 'CAF', 'AFC'].flatMap((cf) => confTeams(cf)))
      .filter((t) => t !== 'POL' && !used.has(t) && Math.abs(L(t) - lp) <= 2.5);
    const busyT = new Set(Object.values(I.comps).flatMap((x) => (x.m ?? []).filter((m) => Math.abs(Date.parse(m.d) - Date.parse(d)) <= 864e5).flatMap((m) => [m.h, m.a])));
    const opts = pool.filter((t) => !busyT.has(t));
    if (!opts.length) continue;
    const opp = rng.pick(opts);
    used.add(opp);
    I.polHome ^= 1;
    addMatch(c, I.polHome ? { d, h: 'POL', a: opp } : { d, h: opp, a: 'POL' });
  }
  c.at = nextAt(c, addDaysIso(w.from, -12));
  c.end = c.m.at(-1)?.d;
}
STEP.TOW = function towStep(I, c, date) { if (c.m.every((m) => m.s)) { c.st = 'done'; c.end = date; } };

// ------------------------------------------------------------ Historia
function record(ms, code) {
  let w = 0; let d = 0; let l = 0; let gf = 0; let ga = 0;
  for (const m of ms) {
    if (!m.s) continue;
    const [x, y] = m.h === code ? m.s : [m.s[1], m.s[0]];
    gf += x; ga += y;
    if (x > y) w++; else if (x < y) l++; else d++;
  }
  return { record: `${w}-${d}-${l}`, gf, ga };
}
/** Etap Polski w turnieju c (kod z STAGE_LABEL). */
function polStage(c) {
  if (c.champion === 'POL') return '1';
  if (c.runnerUp === 'POL') return '2';
  if (c.third === 'POL') return '3';
  const ko = c.m.filter((m) => m.k && (m.h === 'POL' || m.a === 'POL'));
  if (!ko.length) return 'G';
  const last = ko.sort((a, b) => a.d.localeCompare(b.d)).at(-1);
  return last.k === '3' ? '4' : last.k;
}

function finish(I, c, date, ctx, ev) {
  c.st = 'done'; c.end = date;
  const entry = { year: c.type === 'LN' ? c.y + 1 : c.y, comp: c.type, host: c.host ?? null, champion: c.champion, runnerUp: c.runnerUp, semis: c.semis ?? [] };
  if (c.type === 'LN') {
    entry.edition = `${c.y}/${String(c.y + 1).slice(2)}`;
    const pl = polLn(c);
    if (pl) {
      const ms = c.m.filter((m) => m.h === 'POL' || m.a === 'POL');
      const qf = c.ko.qf.find((t) => [c.m[t[0]].h, c.m[t[0]].a].includes('POL'));
      const fin = c.m.find((m) => (m.k === 'F' || m.k === '3') && (m.h === 'POL' || m.a === 'POL'));
      const stage = c.champion === 'POL' ? '1' : c.runnerUp === 'POL' ? '2' : c.third === 'POL' ? '3' : fin ? '4' : qf ? 'QF' : `${pl.lg}${pl.pos}`;
      entry.poland = { stage, ...record(ms, 'POL') };
      entry.polandResult = `liga ${pl.lg}, ${pl.pos}. miejsce${stage === '1' ? ', zwycięstwo w Lidze Narodów' : stage === '2' ? ', finał' : stage === '3' ? ', 3. miejsce w finałach' : stage === '4' ? ', 4. miejsce w finałach' : stage === 'QF' ? ', ćwierćfinał' : ''}`;
    }
  } else if (c.type === 'EURO' || c.type === 'WC') {
    if (c.teams.includes('POL')) {
      const stage = polStage(c);
      entry.poland = { stage, ...record(c.m.filter((m) => m.h === 'POL' || m.a === 'POL'), 'POL') };
      entry.polandResult = STAGE_LABEL[stage];
    } else {
      const q = I.comps[`UQ-${c.y}`];
      const path = q?.paths?.find((p) => p.teams.includes('POL'));
      const pg = q && Object.entries(q.groups).find(([, t]) => t.includes('POL'));
      const pos = pg ? uqTable(q, pg[0]).findIndex((r) => r.id === 'POL') + 1 : null;
      const qms = c.y === 2028 ? Object.values(ctx.N?.matches ?? {}).filter((m) => m.comp === 'EQ' && m.played && (m.home === 'POL' || m.away === 'POL')).map((m) => ({ h: m.home, a: m.away, s: m.result.score }))
        : (q?.m ?? []).filter((m) => m.h === 'POL' || m.a === 'POL');
      if (pg) {
        entry.poland = { stage: path ? 'PO' : 'Q', ...record(qms, 'POL') };
        entry.polandResult = path ? `baraże (ścieżka ${path.id})` : `eliminacje, ${pos}. miejsce w grupie ${pg[0]}`;
      }
    }
  }
  ctx.history?.push(entry);
  const title = c.type === 'LN' ? `Zwycięzca Ligi Narodów ${entry.edition}` : `${CHAMP_TITLE[c.type]} ${c.y}`;
  const f = c.m.find((m) => m.k === 'F');
  const fin = `${ntName(f.h)} - ${ntName(f.a)} ${f.s[0]}:${f.s[1]}${f.p ? ` (karne ${f.p[0]}:${f.p[1]})` : f.x ? ' (po dogrywce)' : ''}`;
  ev.news.push({ key: `${c.key}:champion`, from: c.type === 'WC' ? 'FIFA' : c.type === 'EURO' || c.type === 'LN' ? 'UEFA' : 'Reprezentacje świata', priority: 'info',
    subject: `${title}: ${ntName(c.champion)}`, body: `Finał: ${fin}.${c.host ? ` Gospodarze: ${c.host.map(ntName).join(', ')}.` : ''}${entry.polandResult ? ` Polska: ${entry.polandResult}.` : ''}`, champ: true, type: c.type });
}

// ------------------------------------------------------------ Dla powołań i widoków
/** Data, po której zawodnicy reprezentacji wracają z turnieju (ostatni mecz) albo null, gdy drużyna gra dalej. */
export function teamDone(I, key, team) {
  const c = I?.comps?.[key];
  if (!c || !c.teams?.includes(team)) return '0000-00-00';
  if (c.out?.[team]) return c.out[team];
  if (c.st === 'done') return c.end;
  return null;
}
/** Zgrupowania turniejowe w okolicy daty: okno sparingów przed Euro/MŚ i turnieje kontynentalne (7 dni przed startem). */
export function intlCamps(I, date) {
  const out = [];
  for (const c of Object.values(I?.comps ?? {})) {
    if (!FMT[c.type] || c.type === 'EURO' || c.type === 'WC') continue;
    const from = addDaysIso(c.from, -7);
    if (date < addDaysIso(from, -5) || date > addDaysIso(c.to, 2)) continue;
    out.push({ key: `T:${c.key}`, from, to: addDaysIso(c.from, -1), matches: 0, kind: 'cont', teams: c.teams, tour: c.key, tourTeams: c.teams, tourEnd: c.to, title: tourName(c.key) });
  }
  return out;
}
/** Okno sparingów przed turniejem z danymi turnieju (zawodnicy uczestników zostają do odpadnięcia). */
export function withTournament(I, w) {
  if (w.kind !== 'prep') return w;
  const key = tourKey(w.year);
  const c = I?.comps?.[key];
  return c ? { ...w, tour: key, tourTeams: c.teams, tourEnd: c.to, title: `zgrupowanie przed turniejem ${tourName(key)}` } : w;
}

/** Mecz silnika w formacie national.js (widoki, wiadomości, statystyki zawodników). */
export const matchId = (c, m) => `${c.key}:${c.m.indexOf(m)}`;
export function asNt(c, m) {
  return { id: matchId(c, m), comp: c.type, key: c.key, group: m.g ?? null, md: m.r ?? null, round: m.k ?? null, leg: m.l ?? null, date: m.d, home: m.h, away: m.a,
    neutral: !!m.n, played: !!m.s, result: m.s ? { score: m.s, extraTime: !!m.x, shootout: m.p ?? null } : null, path: m.path ?? null };
}
export function intlTeamMatches(I, code) {
  const out = [];
  for (const c of Object.values(I?.comps ?? {})) for (const m of c.m ?? []) if (m.h === code || m.a === code) out.push(asNt(c, m));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Nadrabianie silnika dla zapisu bez game.intl: od startu gry do dnia przed datą, z Elo meczów national.js. */
export function catchUpIntl(I, N, from, until, history) {
  const byDate = new Map();
  for (const m of Object.values(N?.matches ?? {})) if (m.played) { if (!byDate.has(m.date)) byDate.set(m.date, []); byDate.get(m.date).push(m); }
  for (let d = from; d < until; d = addDaysIso(d, 1)) {
    bindRatings(I.ratings);
    for (const m of byDate.get(d) ?? []) rateNt(I, m);
    intlDay(I, d, { N, history });
  }
}
/** Elo po meczu z national.js (Liga Narodów 2026/27, eliminacje Euro 2028). */
export function rateNt(I, m) {
  if (!m.result) return;
  eloUpdate(I.ratings, m.home, m.away, m.result.score, { kind: m.comp === 'EQ' ? 'Q' : 'LN', neutral: !!m.neutral });
}
void DATA; void TOUR_LEN;
