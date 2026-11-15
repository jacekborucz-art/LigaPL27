// Raport ogólny o drużynie od asystenta i głównego analityka (docs/raport-druzyny.md). Raport miesięczny (od 3. dnia
// miesiąca, nie w dniu meczu) i na żądanie (najwcześniej 14 dni po poprzednim). Części: podsumowanie, zalecenia, siła
// formacji na tle ligi, wyniki i gra, styl i taktyka, stałe fragmenty, głębia składu, zdrowie i obciążenia, młodzi,
// najbliżsi rywale. Każda część ma podpis członka sztabu i pewność zależną od jego atrybutów (asystent: ocena
// zawodników, analiza taktyczna; analityk: analiza danych, analiza wideo; trener bramkarzy, przygotowania fizycznego,
// młodzieży). Błąd jest deterministyczny (ziarno gry, klub, raport, temat): ten sam raport po odświeżeniu, nowy raport
// losuje błąd od nowa. Fakty (wyniki, tabela, kontuzje) są dokładne. Raport tylko czyta stan gry; zapisuje wyłącznie
// game.teamReport. Liczony tylko dla klubu gracza, więc kluby AI i balans meczów bez zmian. Wartości [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem, clubMatchOn } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { squadOf, academyOf } from '../world/worldGen.js';
import { clubById, CLUBS_PL } from '../data/clubs_pl.js';
import { ATTRS, POS_NAMES, ovrAt } from '../data/attributes.js';
import { FORMATIONS, formationById } from '../data/formations.js';
import { proficiency, posEff } from '../engine/positions.js';
import { teamRating } from '../engine/teamStrength.js';
import { standings } from '../season/standings.js';
import { compOfClub, compClubIds } from '../season/leagueComps.js';
import { anyClub, compLabel } from '../season/season.js';
import { staffOf, staffQ, staffLabel } from '../training/staff.js';
import { daysBetween, ageAt } from '../training/state.js';
import { loadSummary } from '../training/load.js';
import { teamCohesion } from '../training/cohesion.js';
import { userFamiliarity, describeFp, fingerprint } from '../training/scouting.js';
import { COH } from '../training/config.js';
import { GROUP, isAvailable } from './squad.js';
import { estimate, estimateSd, precisionOf, familiarity, ensureAssistantReport, AREP } from './assistantReport.js';
import { fmtDate } from '../ui/dom.js';

export const TREP = {
  version: 1,
  firstDay: 3, // raport miesięczny najwcześniej 3. dnia miesiąca (po raporcie rozwoju i raporcie asystenta)
  cooldown: 14, // raport na żądanie najwcześniej 14 dni po poprzednim
  skipAfterRequest: 7, // raport miesięczny nie przychodzi, gdy raport na żądanie powstał w ostatnich 7 dniach
  attrSd: 1.6, attrMax: 3, // atrybuty sztabu: jakość +- odchylenie z ziarna (średnia równa jakości)
  noise: { unit: 0.3, rival: 0.3, formation: 0.12, depth: 0.3, taker: 0.25 }, // część sd w punktach oceny
  formGain: 0.25, // propozycja innej formacji od przewagi ok. 0,25 pkt średniej oceny jedenastki
  gapDrop: 2, // luka w głębi składu: najlepszy zmiennik słabszy o 2 pkt albo bez nominalnej pozycji
  maxRecs: 5,
  keep: 3, // archiwum: 3 ostatnie raporty (bieżący i 2 starsze)
};

export const STAFF_ATTRS = {
  asystent: { OCE: 'Ocena zawodników', TAK: 'Analiza taktyczna' },
  analityk: { DAN: 'Analiza danych', WID: 'Analiza wideo' },
};

export const UNIT_NAMES = { GK: 'Bramkarz', DEF: 'Obrona', MID: 'Pomoc', ATT: 'Atak' };
const UNITS = ['GK', 'DEF', 'MID', 'ATT'];
const PREC_WORD = { exact: 'wysoka', approx: 'średnia', vague: 'niska' };
const ROLE_NAMES = { asystent: 'Asystent trenera', analityk: 'Główny analityk', fizyczny: 'Trener przygotowania fizycznego', bramkarze: 'Trener bramkarzy', mlodziez: 'Trener młodzieży' };
const num = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const pct = (v) => `${Math.round(v)} %`;
const r1 = (v) => Math.round(v * 10) / 10;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const dniWord = (n) => (n === 1 ? 'dzień' : 'dni');
const mecz = (n) => (n === 1 ? 'mecz' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'mecze' : 'meczów');

// ------------------------------------------------------------ Atrybuty sztabu
/**
 * Atrybuty asystenta (OCE, TAK) i analityka (DAN, WID) pochodne z jakości: q + d i q - d, d z ziarna (gra, klub, rola,
 * nazwisko), od -3 do 3. Średnia równa jakości, więc dotychczasowe efekty sztabu bez zmian. Ten sam wzór dla każdego klubu.
 */
export function staffAttrs(game, clubId, role) {
  const keys = Object.keys(STAFF_ATTRS[role] ?? {});
  if (!keys.length) return {};
  const s = staffOf(game, clubId)[role] ?? { q: 10 };
  const q = s.q ?? 10;
  const d = clamp(Math.round(new Rng(`sztab-atrybuty:${game?.seed}:${clubId}:${role}:${s.name ?? ''}`).gauss(0, TREP.attrSd)), -TREP.attrMax, TREP.attrMax);
  return { [keys[0]]: clamp(q + d, 1, 20), [keys[1]]: clamp(q - d, 1, 20) };
}

/** Jakości używane przez raport: atrybuty asystenta i analityka, jakość pozostałych ról. */
export function reportSkills(game, clubId = game.clubId) {
  return {
    ...staffAttrs(game, clubId, 'asystent'), ...staffAttrs(game, clubId, 'analityk'),
    fiz: staffQ(game, clubId, 'fizyczny'), gk: staffQ(game, clubId, 'bramkarze'), mlo: staffQ(game, clubId, 'mlodziez'),
  };
}

/** Jakość sekcji (1-20) z wag atrybutów (docs/raport-druzyny.md, rozdz. 3). */
export function sectionQ(sk) {
  return {
    units: 0.5 * sk.DAN + 0.5 * sk.OCE,
    gk: 0.4 * sk.DAN + 0.3 * sk.OCE + 0.3 * sk.gk,
    results: sk.DAN,
    tactics: 0.5 * sk.TAK + 0.5 * sk.WID,
    setPieces: sk.WID,
    depth: sk.OCE,
    depthGk: 0.6 * sk.OCE + 0.4 * sk.gk,
    health: 0.7 * sk.fiz + 0.3 * sk.OCE,
    youth: 0.6 * sk.mlo + 0.4 * sk.OCE,
    rivals: 0.6 * sk.WID + 0.4 * sk.DAN,
  };
}

const detectChance = (q) => clamp(AREP.detect.base + AREP.detect.perQ * q, AREP.detect.min, AREP.detect.max);

// ------------------------------------------------------------ Stan w zapisie
/**
 * Stan w zapisie: { v, club, cur (najnowszy raport), arch (starsze raporty, od najnowszego), prev (skrót poprzedniego),
 * month }. Archiwum razem z bieżącym: najwyżej TREP.keep raportów (decyzja właściciela z Nov 16, 2026). Migracja w miejscu.
 */
export function ensureTeamReport(game) {
  if (!game) return null;
  if (!game.teamReport || typeof game.teamReport !== 'object') game.teamReport = {};
  const s = game.teamReport;
  if (s.club !== (game.clubId ?? null)) Object.assign(s, { cur: null, arch: [], prev: null, month: null, club: game.clubId ?? null });
  s.v = TREP.version;
  s.cur ??= null; s.prev ??= null; s.month ??= null;
  s.arch = Array.isArray(s.arch) ? s.arch.slice(0, TREP.keep - 1) : [];
  return s;
}

/** Raporty w archiwum od najnowszego (bieżący pierwszy), najwyżej TREP.keep. */
export function reportList(game) {
  const s = ensureTeamReport(game);
  return s.cur ? [s.cur, ...s.arch] : [];
}

/** Czy można poprosić o nowy raport: { ok, from (data, od której można) }. */
export function canRequest(game) {
  const s = ensureTeamReport(game);
  const last = s.cur?.date;
  if (!last || !game.date) return { ok: true, from: null };
  const days = daysBetween(last, game.date);
  if (days >= TREP.cooldown) return { ok: true, from: null };
  const d = new Date(`${last}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + TREP.cooldown);
  return { ok: false, from: d.toISOString().slice(0, 10) };
}

/** Skrót raportu do porównania w kolejnym: siła formacji, miejsce, zgranie. */
function digest(r) {
  return { date: r.date, units: Object.fromEntries(r.units.rows.map((x) => [x.k, x.est])), pos: r.results.pos ?? null, coh: r.tactics.coh ?? null };
}

function store(game, r) {
  const s = ensureTeamReport(game);
  if (s.cur) { s.prev = digest(s.cur); s.arch = [s.cur, ...s.arch].slice(0, TREP.keep - 1); }
  s.cur = r;
  return r;
}

/** Raport na żądanie (przycisk w Kadra, Raport ogólny). Zwraca { ok, report, msg }. */
export function requestTeamReport(game) {
  if (!game?.world?.clubs?.[game.clubId]) return { ok: false, msg: 'Raport jest dostępny tylko w klubie.' };
  const c = canRequest(game);
  if (!c.ok) return { ok: false, msg: `Sztab przygotuje nowy raport najwcześniej ${fmtDate(c.from)}.` };
  const r = store(game, buildTeamReport(game, game.date, `${game.date}:z`));
  r.kind = 'request';
  return { ok: true, report: r };
}

// ------------------------------------------------------------ Dane pomocnicze
/** Kluby ligi klubu gracza ze stałą kadrą (III liga: grupa). */
function leagueClubs(game) {
  const club = clubById(game.clubId);
  const comp = compOfClub(club);
  let ids = comp ? compClubIds(comp) : [];
  if (!ids.length) ids = CLUBS_PL.filter((c) => c.tier === club?.tier).map((c) => c.id);
  return { comp, ids: ids.filter((id) => game.world.clubs[id] && squadOf(game.world, id).length) };
}

/** Średnia ocena jedenastki (dostępni zawodnicy, kształt formacji). */
const xiValue = (rating) => mean(rating.xi.map((x) => x.value));

/** Kształt formacji: liczba miejsc w grupach. */
function shapeOf(f) {
  const out = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const s of f.slots) out[GROUP[s.pos] ?? 'MID']++;
  return out;
}

const unitTone = (rank, n) => (rank <= Math.max(1, Math.round(n * 0.25)) ? 'good' : rank > n - Math.max(1, Math.round(n * 0.3)) ? 'bad' : 'info');
function rankWord(rank, n) {
  const q = n > 1 ? (rank - 1) / (n - 1) : 0;
  return q <= 0.12 ? 'najmocniejsza w lidze' : q <= 0.3 ? 'w czołówce ligi' : q <= 0.55 ? 'powyżej średniej ligi' : q <= 0.75 ? 'poniżej średniej ligi' : 'w dole ligi';
}
function rankText(rank, n, prec) {
  if (prec === 'exact') return `${rank}. miejsce w lidze z ${n}`;
  if (prec === 'approx') return `ok. ${Math.max(1, rank - 1)}.-${Math.min(n, rank + 1)}. miejsce w lidze`;
  return rankWord(rank, n);
}

// ------------------------------------------------------------ Raport
/**
 * Raport ogólny na dzień date (id: identyfikator raportu, ziarno błędu). Zwraca dane do widoku
 * (src/ui/teamReportView.js) i treść wiadomości. Nie zmienia stanu gry.
 */
export function buildTeamReport(game, date = game.date, id = date) {
  ensureAssistantReport(game);
  const st = ensureTeamReport(game);
  const clubId = game.clubId;
  const sk = reportSkills(game, clubId);
  const Q = sectionQ(sk);
  const sdOf = (q) => estimateSd(q, 1);
  const precOf = (q) => precisionOf(sdOf(q));
  const rng = (tag) => new Rng(`raport-druzyny:${game.seed}:${clubId}:${id}:${tag}`);
  const z = (tag) => rng(tag).gauss(0, 1);
  const sees = (tag, q) => rng(`widzi:${tag}`).chance(detectChance(q));
  const squad = squadOf(game.world, clubId);
  const staff = staffOf(game, clubId);
  const signer = (role) => ({ role, title: ROLE_NAMES[role], name: staff[role]?.name ?? ROLE_NAMES[role] });
  const sec = (by, q) => { const prec = precOf(q); return { by: signer(by), prec, word: PREC_WORD[prec], q: r1(q) }; };
  const prev = st.prev;

  // 1. Siła formacji na tle ligi (dostępni zawodnicy, ten sam kształt dla wszystkich klubów)
  const { comp, ids } = leagueClubs(game);
  const ratings = new Map(ids.map((cid) => [cid, teamRating(squadOf(game.world, cid))]));
  if (!ratings.has(clubId)) ratings.set(clubId, teamRating(squad));
  const n = ratings.size;
  const unitRows = UNITS.map((k) => {
    const q = k === 'GK' ? Q.gk : Q.units;
    const sd = TREP.noise.unit * sdOf(q);
    const est = [...ratings.entries()].map(([cid, r]) => ({ cid, v: r.zones[k], e: r.zones[k] + sd * z(`unit:${cid}:${k}`) }));
    const mine = est.find((x) => x.cid === clubId);
    const sorted = [...est].sort((a, b) => b.e - a.e);
    const rank = sorted.indexOf(mine) + 1;
    const lg = mean(est.map((x) => x.e));
    const top3 = mean(sorted.slice(0, 3).map((x) => x.e));
    const prec = precOf(q);
    const prevV = prev?.units?.[k];
    const trend = prevV == null || prec === 'vague' ? 0 : mine.e - prevV >= 0.3 ? 1 : mine.e - prevV <= -0.3 ? -1 : 0;
    return { k, label: UNIT_NAMES[k], est: r1(mine.e), lg: r1(lg), top3: r1(top3), rank, n, prec, word: PREC_WORD[prec], text: rankText(rank, n, prec), tone: unitTone(rank, n), trend, truth: r1(mine.v), trueRank: [...est].sort((a, b) => b.v - a.v).indexOf(mine) + 1, by: signer(k === 'GK' ? 'bramkarze' : 'analityk') };
  });
  const lo = Math.floor(Math.min(...unitRows.flatMap((x) => [x.est, x.lg])) - 1);
  const hi = Math.ceil(Math.max(...unitRows.flatMap((x) => [x.est, x.top3])) + 1);
  const overallEst = (cid) => mean(UNITS.map((k) => ratings.get(cid).zones[k] + TREP.noise.unit * sdOf(k === 'GK' ? Q.gk : Q.units) * z(`unit:${cid}:${k}`)));
  const paperRank = [...ratings.keys()].map((cid) => ({ cid, v: overallEst(cid) })).sort((a, b) => b.v - a.v).findIndex((x) => x.cid === clubId) + 1;
  const units = { ...sec('analityk', Q.units), rows: unitRows, scale: { lo, hi }, n };

  // 2. Wyniki i gra (fakty dokładne, interpretacja z błędem analityka)
  const rs = sec('analityk', Q.results);
  const table = comp ? standings((game.fixtures ?? []).filter((f) => f.comp === comp), compClubIds(comp)) : [];
  const row = table.find((x) => x.id === clubId) ?? null;
  const mine = (game.fixtures ?? []).filter((f) => f.played && f.result?.score && f.comp !== 'friendly' && (f.home === clubId || f.away === clubId) && f.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const leagueM = mine.filter((f) => f.comp === comp);
  const split = (home) => leagueM.filter((f) => (f.home === clubId) === home).reduce((s, f) => {
    const [a, b] = f.result.score; const gf = home ? a : b; const ga = home ? b : a;
    return { n: s.n + 1, pts: s.pts + (gf > ga ? 3 : gf === ga ? 1 : 0) };
  }, { n: 0, pts: 0 });
  const withStats = mine.filter((f) => f.result.stats?.shots);
  const side = (f) => (f.home === clubId ? 0 : 1);
  const avgStat = (key, own) => mean(withStats.map((f) => Number(f.result.stats[key]?.[own ? side(f) : 1 - side(f)]) || 0));
  const gfAll = mean(withStats.map((f) => f.result.score[side(f)]));
  const gaAll = mean(withStats.map((f) => f.result.score[1 - side(f)]));
  const resLines = [];
  if (row && row.played) {
    resLines.push(`Liga: ${row.pos}. miejsce, ${row.points} pkt w ${row.played} ${mecz(row.played)} (bilans ${row.wins}-${row.draws}-${row.losses}, bramki ${row.gf}:${row.ga}).`);
    const h = split(true); const a = split(false);
    if (h.n && a.n) resLines.push(`U siebie ${num(h.pts / h.n, 2)} pkt na mecz, na wyjeździe ${num(a.pts / a.n, 2)}.`);
  } else resLines.push('Sezon ligowy jeszcze się nie zaczął albo nie mamy rozegranych meczów ligowych.');
  const form = mine.slice(-5).map((f) => { const [a, b] = f.result.score; const gf = f.home === clubId ? a : b; const ga = f.home === clubId ? b : a; return gf > ga ? 'W' : gf < ga ? 'P' : 'R'; });
  let gameLine = null; let luck = null;
  if (withStats.length >= 3) {
    const xgF = avgStat('xg', true); const xgA = avgStat('xg', false);
    const shF = avgStat('shots', true); const shA = avgStat('shots', false); const poss = avgStat('possession', true);
    // Interpretacja: różnica xG z błędem analityka
    const dXg = (xgF - xgA) + 0.06 * sdOf(Q.results) * z('xg');
    if (rs.prec === 'exact') gameLine = `Średnio na mecz: strzały ${num(shF)}:${num(shA)}, xG ${num(xgF, 2)}:${num(xgA, 2)}, posiadanie ${pct(poss > 1 ? poss : poss * 100)} (${withStats.length} ${mecz(withStats.length)}).`;
    else if (rs.prec === 'approx') gameLine = `Średnio na mecz ok. ${Math.round(shF)} strzałów, rywale ok. ${Math.round(shA)}; xG ok. ${num(xgF)}:${num(xgA)}.`;
    else gameLine = dXg >= 0.3 ? 'Stwarzamy więcej sytuacji niż rywale.' : dXg <= -0.3 ? 'Rywale stwarzają więcej sytuacji niż my.' : 'Sytuacji stwarzamy mniej więcej tyle, co rywale.';
    const finish = (gfAll - xgF) * withStats.length + 1.2 * sdOf(Q.results) * 0.3 * z('fin');
    const keep = (xgA - gaAll) * withStats.length + 1.2 * sdOf(Q.results) * 0.3 * z('keep');
    if (finish >= 3) luck = 'Strzelamy więcej, niż wynika z sytuacji (xG): ta skuteczność raczej nie utrzyma się cały sezon.';
    else if (finish <= -3) luck = 'Marnujemy sytuacje: goli jest mniej, niż wynika z xG. Gra jest lepsza niż wyniki, warto zachować spokój.';
    else if (keep >= 3) luck = 'Tracimy mniej goli, niż wynika z sytuacji rywali: bramkarz i trochę szczęścia ratują wyniki.';
    else if (keep <= -3) luck = 'Tracimy więcej goli, niż wynika z sytuacji rywali: błędy w obronie albo pech.';
  }
  let paper = null; let verdict = null;
  if (row && row.played >= 4) {
    const diff = paperRank - row.pos;
    verdict = diff >= 3 ? 'punktujemy ponad stan' : diff <= -3 ? 'punktujemy poniżej możliwości kadry' : 'wyniki odpowiadają sile kadry';
    paper = `${rs.prec === 'vague' ? `Na papierze kadra jest ${rankWord(paperRank, n)}` : `Na papierze kadra na ok. ${paperRank}. miejsce`}; ${verdict}.`;
  }
  const results = { ...rs, pos: row?.played ? row.pos : null, played: row?.played ?? 0, pts: row?.played ? row.points : null, form, lines: [...resLines, gameLine, luck, paper].filter(Boolean), paperRank };

  // 3. Styl i taktyka
  const ts = sec('asystent', Q.tactics);
  const tac = game.tactics ?? {};
  const f = formationById(tac.formation);
  const coh = teamCohesion(game);
  const fam = userFamiliarity(game);
  const fitSd = TREP.noise.formation * sdOf(Q.tactics);
  // Kształty formacji (liczba obrońców, pomocników, napastników): ocena najlepszej jedenastki z błędem analizy
  const shapes = new Map();
  for (const x of FORMATIONS) { const k = shapeKey(x); if (!shapes.has(k)) shapes.set(k, { k, fs: [] }); shapes.get(k).fs.push(x); }
  const fits = [...shapes.values()].map((x) => { const v = xiValue(teamRating(squad, { shape: shapeOf(x.fs[0]) })); return { ...x, v, e: v + fitSd * z(`form:${x.k}`) }; });
  const curFit = fits.find((x) => x.k === shapeKey(f));
  const bestFit = [...fits].sort((a, b) => b.e - a.e)[0];
  const formGain = bestFit && curFit && bestFit.k !== curFit.k ? bestFit.e - curFit.e : 0;
  const fitNames = bestFit ? `${bestFit.fs[0].name}${bestFit.fs.length > 1 ? ' (albo podobne)' : ''}` : '';
  const tacLines = [`Ustawienie: ${f.name} (${f.nick}); ${describeFp({ ...fingerprint(tac), formation: f.id }).split(', ').slice(1).join(', ') || 'instrukcje wyważone'}.`];
  tacLines.push(`Zgranie: ${coh.label.toLowerCase()}${ts.prec === 'exact' ? ` (${num(coh.z)} na 100)` : ''}.`);
  let predict = null;
  if (fam.n >= 3) {
    const b = fam.base + 0.03 * sdOf(Q.tactics) * z('fam');
    predict = b >= 0.6 ? 'Rywale dobrze znają nasz schemat: gramy tak samo od kilku meczów.' : b >= 0.4 ? 'Nasz sposób gry staje się czytelny dla analityków rywali.' : 'Rywalom trudno nas rozczytać: plan zmienia się z meczu na mecz.';
    tacLines.push(predict);
  }
  if (formGain >= TREP.formGain) tacLines.push(`Kadra lepiej pasuje do ustawienia ${fitNames}: najlepsza jedenastka byłaby mocniejsza${ts.prec === 'exact' ? ` o ok. ${num(formGain)} pkt` : ''}.`);
  else tacLines.push(`Obecne ustawienie dobrze wykorzystuje kadrę.`);
  const tactics = { ...ts, by2: signer('analityk'), lines: tacLines, coh: coh.z, cohLabel: coh.label, predict: fam.n >= 3 ? fam.base : null, formSuggest: formGain >= TREP.formGain ? { id: bestFit.fs[0].id, name: fitNames, gain: r1(formGain) } : null };

  // 4. Stałe fragmenty
  const ss = sec('analityk', Q.setPieces);
  const c = game.training?.clubs?.[clubId];
  const sp = c?.sp ?? COH.spNeutral;
  const xiPl = (tac.xi ?? []).map((pid) => game.world.players[pid]).filter(Boolean);
  const takerSd = TREP.noise.taker * sdOf(Q.setPieces);
  const takers = xiPl.filter((p) => p.pos !== 'BR').map((p) => ({ p, e: (p.attr?.SFR ?? 8) + takerSd * z(`sfr:${p.id}`) })).sort((a, b) => b.e - a.e).slice(0, 2);
  const lgPl = ids.flatMap((cid) => squadOf(game.world, cid));
  const air = (ps) => mean(ps.filter((p) => ['ŚO', 'NAP'].includes(p.pos)).map((p) => p.attr?.GLO ?? 10));
  const airDiff = air(xiPl) - air(lgPl) + 0.1 * sdOf(Q.setPieces) * z('air');
  const spLines = [`Wyćwiczenie: ${sp >= 70 ? 'dobre' : sp >= 55 ? 'ponad przeciętne' : sp >= 45 ? 'przeciętne' : 'słabe'}${ss.prec === 'exact' ? ` (${Math.round(sp)} na 100)` : ''}.`];
  if (takers.length) spLines.push(`Najlepsi wykonawcy: ${takers.map((x) => `${x.p.name}${ss.prec === 'exact' ? ` (${Math.round(x.p.attr?.SFR ?? 8)})` : ''}`).join(', ')}.`);
  spLines.push(airDiff >= 0.8 ? 'W powietrzu mamy przewagę nad większością ligi: warto szukać goli po rożnych.' : airDiff <= -0.8 ? 'W grze głową jesteśmy słabsi od ligi: rywale będą szukać goli po stałych fragmentach.' : 'W grze w powietrzu jesteśmy na poziomie ligi.');
  const setPieces = { ...ss, sp: Math.round(sp), lines: spLines, weak: sp < 45 };

  // 5. Głębia składu (pozycje obecnego ustawienia)
  const ds = sec('asystent', Q.depth);
  const dsGk = precOf(Q.depthGk);
  const xiIds = new Set(tac.xi ?? []);
  const perceived = (p, pos) => {
    const q = pos === 'BR' ? Q.depthGk : Q.depth;
    const fm = familiarity(p, `${date.slice(0, 7)}-01`);
    const v = ovrAt(p.attr, pos) * posEff(proficiency(p, pos));
    return { v, e: v + TREP.noise.depth * sdOf(q) * (1 + 0.8 * (1 - fm)) * z(`depth:${p.id}:${pos}`) };
  };
  const posList = [];
  f.slots.forEach((s, i) => { const e = posList.find((x) => x.pos === s.pos); if (e) e.idx.push(i); else posList.push({ pos: s.pos, idx: [i] }); });
  const depthRows = posList.map(({ pos, idx }) => {
    const prec = pos === 'BR' ? dsGk : ds.prec;
    const starters = idx.map((i) => game.world.players[tac.xi?.[i]]).filter(Boolean);
    const cand = squad.filter((p) => !xiIds.has(p.id) && (pos === 'BR') === (p.pos === 'BR'))
      .map((p) => ({ p, ...perceived(p, pos), nat: proficiency(p, pos) >= 70 })).sort((a, b) => b.e - a.e);
    const backups = cand.filter((x) => x.e >= 4).slice(0, 2);
    const stE = starters.map((p) => perceived(p, pos).e);
    const ref = stE.length ? Math.min(...stE) : 0;
    const gap = !backups.length || !backups.some((x) => x.nat) || backups[0].e < ref - TREP.gapDrop;
    const show = (x) => {
      const d = ref - x.e;
      return { id: x.p.id, name: x.p.name, val: prec === 'exact' ? r1(x.e) : prec === 'approx' ? Math.round(x.e) : null, out: !isAvailable(x.p), nat: x.nat, w: d <= 0.7 ? 'podobny poziom' : d <= TREP.gapDrop ? 'trochę słabszy' : 'wyraźnie słabszy' };
    };
    return {
      pos, label: POS_NAMES[pos] ?? pos, prec,
      starters: starters.map((p) => { const e = perceived(p, pos).e; return { id: p.id, name: p.name, val: prec === 'exact' ? r1(e) : prec === 'approx' ? Math.round(e) : null, out: !isAvailable(p) }; }),
      backups: backups.map(show), gap,
      note: gap ? (!backups.length ? 'brak zmiennika' : !backups.some((x) => x.nat) ? 'brak zmiennika z tej pozycji' : 'zmiennik wyraźnie słabszy') : null,
    };
  });
  const depth = { ...ds, rows: depthRows, gaps: depthRows.filter((x) => x.gap && sees(`gap:${x.pos}`, x.pos === 'BR' ? Q.depthGk : Q.depth)).map((x) => x.pos) };
  for (const r of depthRows) if (r.gap && !depth.gaps.includes(r.pos)) { r.gap = false; r.note = null; } // przeoczona luka

  // 6. Zdrowie i obciążenia (szczegóły zawodników w raporcie asystenta)
  const hs = sec('fizyczny', Q.health);
  const injured = squad.filter((p) => p.injuryDays > 0).sort((a, b) => b.injuryDays - a.injuryDays);
  const healthy = squad.filter((p) => !(p.injuryDays > 0));
  const risky = healthy.filter((p) => (loadSummary(p.training ?? {}).acwr > 1.3 || (p.fresh ?? 95) < 70) && sees(`risk:${p.id}`, Q.health));
  const freshXI = mean(xiPl.map((p) => p.fresh ?? 95));
  const soon = (game.fixtures ?? []).filter((x) => !x.played && x.date > date && daysBetween(date, x.date) <= 14 && (x.home === clubId || x.away === clubId) && x.comp !== 'friendly');
  const hLines = [injured.length ? `Kontuzjowani (${injured.length}): ${injured.slice(0, 6).map((p) => `${p.name}, ok. ${p.injuryDays} ${dniWord(p.injuryDays)}`).join('; ')}.` : 'Nikt nie jest kontuzjowany.'];
  hLines.push(`Świeżość pierwszej jedenastki: ${hs.prec === 'vague' ? (freshXI >= 88 ? 'dobra' : freshXI >= 78 ? 'w normie' : 'niska') : pct(freshXI)}.`);
  hLines.push(risky.length ? `W strefie ryzyka (przeciążenie albo zmęczenie): ${risky.length} ${risky.length === 1 ? 'zawodnik' : 'zawodników'}${ensureAssistantReport(game).freq === 'off' ? `: ${risky.slice(0, 4).map((p) => p.name).join(', ')}` : '; nazwiska w raporcie asystenta'}.` : 'Nie widzę zawodników w strefie ryzyka.');
  hLines.push(soon.length >= 4 ? `W najbliższych 14 dniach ${soon.length} ${mecz(soon.length)}: potrzebna rotacja.` : `W najbliższych 14 dniach ${soon.length} ${mecz(soon.length)}.`);
  const health = { ...hs, injured: injured.length, risky: risky.length, congestion: soon.length, lines: hLines };

  // 7. Młodzi i rozwój (potencjał w ocenie sztabu, ten sam model co raport o zawodniku)
  const ys = sec('mlodziez', Q.youth);
  const young = squad.filter((p) => ageAt(p, date) <= 21);
  const teamMin = squad.reduce((s, p) => s + (p.season?.min ?? 0), 0);
  const youngMin = young.reduce((s, p) => s + (p.season?.min ?? 0), 0);
  const prospects = squad.filter((p) => ageAt(p, date) <= 23).map((p) => ({ p, e: estimate(game, p, 'POT') }))
    .filter((x) => !x.e.blind && x.e.v - x.p.ovr >= 1.5 && sees(`pot:${x.p.id}`, Q.youth)).sort((a, b) => (b.e.v - b.p.ovr) - (a.e.v - a.p.ovr)).slice(0, 3);
  const acad = academyOf(game.world, clubId).map((p) => ({ p, e: estimate(game, p, 'POT') })).filter((x) => !x.e.blind && x.e.v >= 11 && sees(`acad:${x.p.id}`, Q.youth)).sort((a, b) => b.e.v - a.e.v).slice(0, 2);
  const yLines = [`Do 21 lat w kadrze: ${young.length}; ${teamMin ? `grają ${pct(100 * youngMin / teamMin)} minut drużyny` : 'sezon jeszcze bez minut'}.`];
  if (prospects.length) yLines.push(`Największy zapas rozwoju: ${prospects.map((x) => `${x.p.name} (${ageAt(x.p, date)} l.${ys.prec !== 'vague' ? `, potencjał ${x.e.lo}-${x.e.hi}` : ''})`).join(', ')}.`);
  else yLines.push('Nie widzę w kadrze młodych z wyraźnym zapasem rozwoju.');
  if (acad.length) yLines.push(`W akademii wyróżnia się: ${acad.map((x) => x.p.name).join(', ')}.`);
  const lowMin = prospects.filter((x) => (x.p.season?.min ?? 0) < 0.25 * Math.max(1, mine.length) * 90 && mine.length >= 4);
  const youth = { ...ys, young: young.length, lines: yLines, lowMin: lowMin.map((x) => x.p.name) };

  // 8. Najbliżsi rywale (3 mecze o stawkę)
  const rv = sec('analityk', Q.rivals);
  const ourV = overallEst(clubId);
  const next = (game.fixtures ?? []).filter((x) => !x.played && x.date >= date && x.comp !== 'friendly' && (x.home === clubId || x.away === clubId) && (x.home && x.away))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const rivalRows = next.map((x) => {
    const opp = x.home === clubId ? x.away : x.home;
    const oc = clubById(opp) ?? anyClub(opp);
    const oSquad = game.world.clubs[opp] ? squadOf(game.world, opp) : [];
    const tr = table.find((t) => t.id === opp);
    let diff = null;
    if (oSquad.length) {
      const zs = ratings.get(opp)?.zones ?? teamRating(oSquad).zones;
      diff = ourV - mean(UNITS.map((k) => zs[k])) + TREP.noise.rival * sdOf(Q.rivals) * z(`rival:${opp}`);
    }
    const verdict = diff == null ? 'brak danych o kadrze, analiza przed meczem' : diff >= 1 ? 'jesteśmy faworytem' : diff <= -1 ? 'rywal jest mocniejszy' : 'mecz wyrównany';
    return {
      id: x.id, date: x.date, home: x.home === clubId, opp, name: oc?.name ?? opp, comp: compLabel(x), verdict,
      tone: diff == null ? 'info' : diff >= 1 ? 'good' : diff <= -1 ? 'bad' : 'warn',
      diff: diff != null && rv.prec === 'exact' ? r1(diff) : null, pos: tr?.played ? tr.pos : null, form: tr?.played ? tr.form : null,
    };
  });
  const rivals = { ...rv, rows: rivalRows };

  // 9. Zalecenia (asystent): najwyżej 5, od najważniejszych
  const recs = [];
  const add = (x) => recs.push({ tone: 'info', act: null, ...x });
  const weakUnit = [...unitRows].sort((a, b) => b.rank - a.rank)[0];
  const unitGaps = (k) => depth.gaps.filter((pos) => (GROUP[pos] ?? 'MID') === k);
  if (weakUnit && weakUnit.rank > n * 0.6) {
    const g = unitGaps(weakUnit.k);
    add({ id: 'sign', tone: 'bad', text: `Wzmocnić formację: ${weakUnit.label.toLowerCase()} (${weakUnit.text}).${g.length ? ` Luka także w głębi składu: ${g.join(', ')}.` : ''}`, why: 'najsłabsza formacja na tle ligi', act: { act: 'tab', tab: 'transfery', label: 'Transfery' } });
  }
  const otherGaps = depth.gaps.filter((pos) => !(weakUnit && weakUnit.rank > n * 0.6 && (GROUP[pos] ?? 'MID') === weakUnit.k));
  if (otherGaps.length) add({ id: 'depth', tone: 'warn', text: `Szukać zmiennika na pozycje: ${otherGaps.join(', ')}.`, why: 'uraz albo kartka podstawowego oznacza grę kimś spoza pozycji', act: { act: 'tab', tab: 'transfery', label: 'Transfery' } });
  if (health.congestion >= 4 || health.risky >= 4) add({ id: 'rotate', tone: 'warn', text: 'Rotować składem w najbliższych meczach, zwłaszcza w pucharze.', why: `${health.congestion} ${mecz(health.congestion)} w 14 dni, ${health.risky} w strefie ryzyka` });
  if (tactics.formSuggest) add({ id: 'formation', tone: 'info', text: `Rozważyć ustawienie ${tactics.formSuggest.name}.`, why: 'kadra lepiej obsadza jego pozycje', act: { act: 'tsub', s: 'tactics', label: 'Skład i taktyka' } });
  if (tactics.predict != null && tactics.predict >= 0.6) add({ id: 'predict', tone: 'warn', text: 'Zmienić plan na część meczów (ustawienie, pressing, linia obrony).', why: 'rywale znają nasz schemat', act: { act: 'tsub', s: 'tactics', label: 'Skład i taktyka' } });
  if (coh.z < 58) add({ id: 'cohesion', tone: 'warn', text: 'Akcent taktyczny w treningu na 1-2 tygodnie.', why: `zgranie ${coh.label.toLowerCase()}`, act: { act: 'tr-accent', v: 'taktyczny', label: 'Akcent: taktyczny' } });
  if (setPieces.weak) add({ id: 'setpieces', tone: 'info', text: 'Więcej zajęć ze stałych fragmentów.', why: 'słabe wyćwiczenie stałych fragmentów', act: { act: 'tr-accent', v: 'stale', label: 'Akcent: stałe fragmenty' } });
  if (youth.lowMin.length) add({ id: 'youth', tone: 'info', text: `Dać minuty młodym: ${youth.lowMin.join(', ')}.`, why: 'zapas rozwoju, a prawie nie grają' });
  const keyEnd = xiPl.filter((p) => p.contract?.until && !p.loan && daysBetween(date, p.contract.until) <= 183 && daysBetween(date, p.contract.until) >= 0);
  if (keyEnd.length) add({ id: 'contracts', tone: 'warn', text: `Przedłużyć kontrakty: ${keyEnd.map((p) => p.name).join(', ')}.`, why: 'podstawowi zawodnicy, umowa kończy się w ciągu pół roku', act: { act: 'tab', tab: 'transfery', label: 'Transfery' } });
  if (!recs.length) add({ id: 'keep', tone: 'good', text: 'Bez pilnych zmian: utrzymać kierunek.', why: 'kadra i wyniki bez wyraźnych problemów' });
  recs.splice(TREP.maxRecs);

  // 10. Podsumowanie (asystent)
  const strong = [...unitRows].sort((a, b) => a.rank - b.rank)[0];
  const sum = [];
  if (row?.played) sum.push(`Jesteśmy na ${row.pos}. miejscu z ${row.points} pkt${verdict ? `: ${verdict}` : ''}.`);
  else sum.push('Przed startem ligi: oceniamy kadrę i plan.');
  sum.push(`Najmocniejsza formacja: ${strong.label.toLowerCase()} (${strong.text}); najsłabsza: ${weakUnit.label.toLowerCase()} (${weakUnit.text}).`);
  if (depth.gaps.length) sum.push(`Brakuje zmienników na pozycjach: ${depth.gaps.join(', ')}.`);
  sum.push(`Najważniejsze teraz: ${recs[0].text.charAt(0).toLowerCase()}${recs[0].text.slice(1)}`);

  const asys = staff.asystent ?? { name: 'Asystent', q: 10 };
  const anal = staff.analityk ?? { name: 'Analityk', q: 10 };
  const all = [units, results, tactics, setPieces, depth, health, youth, rivals];
  const overall = mean(all.map((x) => x.q));
  const prec = precOf(overall);
  return {
    v: TREP.version, id, date, kind: 'monthly',
    authors: [
      { role: 'asystent', title: ROLE_NAMES.asystent, name: asys.name ?? 'Asystent', q: asys.q ?? 10, label: staffLabel(asys.q ?? 10), attrs: Object.entries(STAFF_ATTRS.asystent).map(([k, l]) => ({ k, l, v: sk[k] })) },
      { role: 'analityk', title: ROLE_NAMES.analityk, name: anal.name ?? 'Analityk', q: anal.q ?? 10, label: staffLabel(anal.q ?? 10), attrs: Object.entries(STAFF_ATTRS.analityk).map(([k, l]) => ({ k, l, v: sk[k] })) },
    ],
    confidence: { prec, word: PREC_WORD[prec] },
    summary: sum.join(' '), recs, units, results, tactics, setPieces, depth, health, youth, rivals,
  };
}

const shapeKey = (f) => { const s = shapeOf(f); return `${s.DEF}-${s.MID}-${s.ATT}`; };

/** Treść wiadomości w poczcie: podsumowanie, zalecenia, gdzie jest pełny raport. */
export function reportMessage(r) {
  const recs = r.recs.map((x) => `- ${x.text}`).join('\n');
  const body = `${r.summary}\n\nZalecenia\n${recs}\n\nPełny raport (siła formacji na tle ligi, wyniki i gra, styl, stałe fragmenty, głębia składu, zdrowie, młodzi, najbliżsi rywale): Kadra, Raport ogólny.\nPewność raportu: ${r.confidence.word} (${r.authors.map((a) => `${a.name}, ${a.title.toLowerCase()}`).join('; ')}).`;
  const [y, m] = r.date.split('-').map(Number);
  const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  return { subject: r.kind === 'request' ? `Raport ogólny o drużynie, ${fmtDate(r.date)}` : `Raport ogólny o drużynie: ${MONTHS[m - 1]} ${y}`, body };
}

// ------------------------------------------------------------ System dnia
export const TEAM_REPORT_SYSTEM = {
  id: 'teamReport', order: 98, // po treningu dnia (95) i raporcie asystenta (97)
  run(game, date) {
    if (!game?.world?.clubs?.[game.clubId]) return {};
    const st = ensureTeamReport(game);
    const month = date.slice(0, 7);
    if (st.month === month || Number(date.slice(8, 10)) < TREP.firstDay) return {};
    if (clubMatchOn(game, date)) return {}; // w dniu meczu raport czeka
    st.month = month;
    if (st.cur?.date && daysBetween(st.cur.date, date) < TREP.skipAfterRequest) return {};
    const r = store(game, buildTeamReport(game, date, date));
    const m = reportMessage(r);
    return { messages: [createMessage({ date, key: `trep:${date}`, category: 'staff', from: 'Asystent i główny analityk', priority: 'info', subject: m.subject, body: m.body, refs: { kind: 'teamReport' } })] };
  },
};

registerDailySystem(TEAM_REPORT_SYSTEM);
