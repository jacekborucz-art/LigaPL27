// Reprezentacje w tle (PLAN 5.5-5.6): Liga Narodów 2026/27 (grupy, ćwierćfinały i baraże w marcu,
// Final Four w czerwcu), losowanie i mecze eliminacji Euro 2028, powołania zawodników z naszego świata
// w oknach FIFA ze skutkami: nieobecność w klubie, minuty i gole w kadrze, zmęczenie, ryzyko urazu, morale.

import { Rng, clamp } from '../core/rng.js';
import { QS, sampleScore } from '../engine/quickSim.js';
import DATA from '../data/reprezentacje.json' with { type: 'json' };

export const NT = DATA.reprezentacje.filter((t) => t.status === 'aktywna');
const BY_CODE = new Map(NT.map((t) => [t.kod, t]));
const BY_NAME = new Map(NT.map((t) => [t.nazwa, t.kod]));
export const ntName = (code) => BY_CODE.get(code)?.nazwa ?? code;
export const ntTeam = (code) => BY_CODE.get(code) ?? null;
export const FIFA_WINDOWS_ALL = DATA.oknaFIFA.map((o) => ({ from: o.od, to: o.do, matches: o.mecze }));
const UEFA_CODES = NT.filter((t) => t.konfederacja === 'UEFA').map((t) => t.kod);
export const NT_COMP_NAMES = { LN: 'Liga Narodów', LNQF: 'Liga Narodów, ćwierćfinał', LNAB: 'Liga Narodów, baraż A/B', LNBC: 'Liga Narodów, baraż B/C', LNF: 'Liga Narodów, Final Four', EQ: 'Eliminacje Euro 2028' };

const KO_DATES = ['2027-03-25', '2027-03-28'];
const FINALS = { SF: ['2027-06-09', '2027-06-10'], third: '2027-06-13', F: '2027-06-13' };
const LN_DRAW = '2026-11-20';
const EURO_DRAW = '2026-12-06';

// ------------------------------------------------------------ Tworzenie
export function createNational(seed) {
  const N = { seed: String(seed), matches: {}, ln: { groups: {}, ko: null, finals: null }, euro: { groups: null }, callups: {}, windows: {} };
  for (const [g, names] of Object.entries(DATA.ligaNarodow2026.grupy)) N.ln.groups[g] = names.map((n) => BY_NAME.get(n));
  for (const m of DATA.ligaNarodow2026.terminarz) {
    const h = BY_NAME.get(m.gospodarz); const a = BY_NAME.get(m.gosc);
    const id = `LN-${m.grupa}-${m.kolejka}-${h}-${a}`;
    N.matches[id] = { id, comp: 'LN', group: m.grupa, md: m.kolejka, date: m.data, home: h, away: a, played: false, result: null };
  }
  return N;
}

// ------------------------------------------------------------ Mecz
const MU = [QS.MU_H * 0.92, QS.MU_A * 0.95];
function simNt(N, m, rng) {
  const lh = ntTeam(m.home)?.L ?? 11; const la = ntTeam(m.away)?.L ?? 11;
  const mu = m.neutral ? [QS.MU_N * 0.95, QS.MU_N * 0.95] : MU;
  const d = lh - la;
  const lH = mu[0] * Math.exp(QS.BETA * d); const lA = mu[1] * Math.exp(-QS.BETA * d);
  const score = sampleScore(lH, lA, rng);
  let extraTime = false; let shootout = null;
  const fl = m.leg === 2 ? firstLeg(N, m) : null;
  const level = () => (fl ? score[0] + fl[0] === score[1] + fl[1] : score[0] === score[1]);
  if ((m.knockout || fl) && level()) {
    extraTime = true;
    score[0] += rng.poisson(lH / 3.3); score[1] += rng.poisson(lA / 3.3);
    if (level()) { const lose = rng.int(2, 4); shootout = rng.chance(clamp(0.5 + 0.03 * d, 0.38, 0.62)) ? [lose + 1, lose] : [lose, lose + 1]; }
  }
  return { score, extraTime, shootout };
}
function firstLeg(N, m) {
  const m1 = N.matches[m.id.replace(/-2$/, '-1')];
  return m1?.played ? [m1.result.score[1], m1.result.score[0]] : null;
}

// ------------------------------------------------------------ Tabele
export function groupTable(N, matches, teams) {
  const rows = new Map(teams.map((t) => [t, { id: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  for (const m of matches) {
    if (!m.played) continue;
    const [a, b] = m.result.score; const h = rows.get(m.home); const w = rows.get(m.away);
    if (!h || !w) continue;
    h.p++; w.p++; h.gf += a; h.ga += b; w.gf += b; w.ga += a;
    if (a > b) { h.w++; w.l++; h.pts += 3; } else if (a < b) { w.w++; h.l++; w.pts += 3; } else { h.d++; w.d++; h.pts++; w.pts++; }
  }
  return [...rows.values()].map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || (ntTeam(y.id)?.elo ?? 0) - (ntTeam(x.id)?.elo ?? 0))
    .map((r, i) => ({ ...r, pos: i + 1 }));
}
export function lnGroupTable(N, g) {
  return groupTable(N, Object.values(N.matches).filter((m) => m.comp === 'LN' && m.group === g), N.ln.groups[g]);
}
const rankAcross = (rows) => [...rows].sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);

// ------------------------------------------------------------ Fazy pucharowe LN i eliminacje Euro
function addTie(N, comp, idx, a, b, dates, extra = {}) {
  const id = `${comp}-${idx}`;
  N.matches[`${id}-1`] = { id: `${id}-1`, comp, leg: 1, date: dates[0], home: a, away: b, played: false, result: null, tie: id, ...extra };
  N.matches[`${id}-2`] = { id: `${id}-2`, comp, leg: 2, date: dates[1], home: b, away: a, played: false, result: null, tie: id, ...extra };
  return { id, a, b };
}

function lnKnockoutDraw(N, rng) {
  const t = (g) => lnGroupTable(N, g);
  const A = ['A1', 'A2', 'A3', 'A4'].map(t); const B = ['B1', 'B2', 'B3', 'B4'].map(t); const C = ['C1', 'C2', 'C3', 'C4'].map(t);
  // Ćwierćfinały: zwycięzca grupy z drugim zespołem innej grupy (losowanie z ochroną grupy)
  const winners = A.map((x) => x[0].id); let runners = A.map((x) => x[1].id);
  for (let k = 0; k < 100; k++) { runners = rng.shuffle(runners); if (runners.every((r, i) => !N.ln.groups[`A${i + 1}`].includes(r))) break; }
  const qf = winners.map((w, i) => addTie(N, 'LNQF', i + 1, runners[i], w, KO_DATES));
  const a3 = rankAcross(A.map((x) => x[2])); const a4 = rankAcross(A.map((x) => x[3]));
  const abTop = rng.shuffle([...a3.slice(2), ...a4.slice(0, 2)].map((r) => r.id));
  const bSecond = rng.shuffle(B.map((x) => x[1].id));
  const ab = abTop.map((a, i) => addTie(N, 'LNAB', i + 1, bSecond[i], a, KO_DATES));
  const bFourth = rng.shuffle(B.map((x) => x[3].id)); const cSecond = rng.shuffle(C.map((x) => x[1].id));
  const bc = bFourth.map((b, i) => addTie(N, 'LNBC', i + 1, cSecond[i], b, KO_DATES));
  N.ln.ko = { qf, ab, bc };
}

function tieWinner(N, tie) {
  const m1 = N.matches[`${tie.id}-1`]; const m2 = N.matches[`${tie.id}-2`];
  if (!m1.played || !m2.played) return null;
  const a = m1.result.score[0] + m2.result.score[1]; const b = m1.result.score[1] + m2.result.score[0];
  if (a !== b) return a > b ? tie.a : tie.b;
  return m2.result.shootout && m2.result.shootout[1] > m2.result.shootout[0] ? tie.a : tie.b;
}

function lnFinals(N, rng) {
  const w = rng.shuffle(N.ln.ko.qf.map((t) => tieWinner(N, t)));
  const sf = [0, 1].map((i) => { const id = `LNF-SF${i + 1}`; N.matches[id] = { id, comp: 'LNF', round: 'SF', date: FINALS.SF[i], home: w[2 * i], away: w[2 * i + 1], neutral: true, knockout: true, played: false, result: null }; return id; });
  N.ln.finals = { sf };
}
function singleWinner(m) {
  const [a, b] = m.result.score;
  if (a !== b) return [a > b ? m.home : m.away, a > b ? m.away : m.home];
  return m.result.shootout[0] > m.result.shootout[1] ? [m.home, m.away] : [m.away, m.home];
}

/** Losowanie eliminacji Euro 2028: drużyny grające w marcu w LN -> 6 grup po 4, pozostałe -> 6 grup po 5. */
function euroDraw(N, rng) {
  const busy = new Set(Object.values(N.matches).filter((m) => ['LNQF', 'LNAB', 'LNBC'].includes(m.comp)).flatMap((m) => [m.home, m.away]));
  const all = UEFA_CODES.filter((c) => BY_CODE.get(c));
  const byStrength = (list) => [...list].sort((a, b) => (ntTeam(b).elo ?? 0) - (ntTeam(a).elo ?? 0));
  const four = byStrength(all.filter((c) => busy.has(c))); const five = byStrength(all.filter((c) => !busy.has(c)));
  const groups = {};
  const fill = (list, size, letters) => {
    const pots = Array.from({ length: size }, (_, i) => rng.shuffle(list.slice(i * 6, (i + 1) * 6)));
    letters.forEach((L, gi) => { groups[L] = pots.map((p) => p[gi]).filter(Boolean); });
  };
  fill(five, 5, ['A', 'B', 'C', 'D', 'E', 'F']);
  fill(four, 4, ['G', 'H', 'I', 'J', 'K', 'L']);
  N.euro.groups = groups;
  const terms = DATA.eliminacjeEuro2028.terminy.filter((t) => t.kolejka).map((t) => t.do);
  for (const [g, teams] of Object.entries(groups)) {
    const rounds = roundRobin(teams, rng);
    const dates = teams.length === 5 ? terms : terms.slice(2, 8);
    rounds.forEach((pairs, r) => pairs.forEach(([h, a]) => {
      const id = `EQ-${g}-${r + 1}-${h}-${a}`;
      N.matches[id] = { id, comp: 'EQ', group: g, md: r + 1, date: dates[r], home: h, away: a, played: false, result: null };
    }));
  }
}
/** Każdy z każdym, mecz i rewanż (dla nieparzystej liczby drużyn jedna pauzuje w kolejce). */
function roundRobin(teams, rng) {
  const list = rng.shuffle([...teams]); if (list.length % 2) list.push(null);
  const n = list.length; const half = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) { const a = list[i]; const b = list[n - 1 - i]; if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]); }
    half.push(pairs);
    list.splice(1, 0, list.pop());
  }
  return [...half, ...half.map((p) => p.map(([a, b]) => [b, a]))];
}
export function euroGroupTable(N, g) {
  return groupTable(N, Object.values(N.matches).filter((m) => m.comp === 'EQ' && m.group === g), N.euro.groups[g]);
}

// ------------------------------------------------------------ Powołania
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
function callScore(p) {
  const form = p.form?.length ? p.form.reduce((s, x) => s + x, 0) / p.form.length - 6.5 : 0;
  return p.ovr + 0.3 * form;
}

/** Wybór zawodników z naszego świata do kadr w oknie (senior, dla Polski też U21). */
export function selectCallups(players, rng) {
  const byNat = new Map();
  for (const p of players) {
    if (p.injuryDays > 7 || p.squad === 'Y' || (p.age ?? 25) < 17 || (p.age ?? 25) > 36) continue;
    if (!byNat.has(p.nat)) byNat.set(p.nat, []);
    byNat.get(p.nat).push(p);
  }
  const out = [];
  for (const [nat, list] of byNat) {
    const team = ntTeam(nat);
    if (!team) continue;
    // Polska: zawodnik Ekstraklasy ma realną szansę od ok. 13,0; inne kraje: od L kadry - 1,5 (model eksperta)
    const thr = nat === 'POL' ? 13.0 : team.L - 1.5;
    const max = nat === 'POL' ? 6 : 8;
    const chosen = list.map((p) => ({ p, s: callScore(p) })).filter((x) => rng.chance(sigmoid((x.s - thr) * 2.2) * 0.95)).sort((a, b) => b.s - a.s).slice(0, max);
    for (const x of chosen) out.push({ id: x.p.id, team: nat, u21: false, score: Math.round(x.s * 10) / 10 });
    if (nat === 'POL') {
      const taken = new Set(chosen.map((x) => x.p.id));
      const u21 = list.filter((p) => !taken.has(p.id) && (p.age ?? 30) <= 21).map((p) => ({ p, s: callScore(p) }))
        .filter((x) => rng.chance(sigmoid((x.s - 10.8) * 2) * 0.9)).sort((a, b) => b.s - a.s).slice(0, 8);
      for (const x of u21) out.push({ id: x.p.id, team: 'POL', u21: true, score: Math.round(x.s * 10) / 10 });
    }
  }
  return out;
}

const SCORE_W = { NAP: 3, SN: 2, OP: 2, SP: 1.4, ŚP: 1, DP: 0.6, WB: 0.5, BO: 0.4, ŚO: 0.35, BR: 0 };
/** Minuty i gole powołanych w meczu kadry (spójnie z wynikiem). */
function assignPlay(N, m, called, players, rng) {
  for (const side of [0, 1]) {
    const code = side === 0 ? m.home : m.away;
    const team = ntTeam(code);
    const mine = called.filter((c) => c.team === code && !c.u21).map((c) => players[c.id]).filter(Boolean);
    if (!mine.length) continue;
    const playedNow = [];
    for (const p of mine) {
      const start = rng.chance(sigmoid((callScore(p) - team.L) * 1.2));
      const minutes = start ? (rng.chance(0.75) ? 90 : rng.int(55, 80)) : rng.chance(0.35) ? rng.int(10, 30) : 0;
      if (!minutes) continue;
      p.intl = p.intl ?? { caps: 0, goals: 0, team: code };
      p.intl.caps++; p.ntMinutes = (p.ntMinutes ?? 0) + minutes;
      playedNow.push({ p, minutes });
    }
    // Gole drużyny: część dla naszych zawodników wg pozycji i minut, reszta dla kolegów spoza naszej gry
    const goals = m.result.score[side];
    const wMine = playedNow.reduce((s, x) => s + (SCORE_W[x.p.pos] ?? 0.5) * x.minutes / 90, 0);
    const wRest = 11 * 1.2;
    for (let g = 0; g < goals; g++) {
      if (!playedNow.length || !rng.chance(wMine / (wMine + wRest))) continue;
      const x = rng.weighted(playedNow, (y) => (SCORE_W[y.p.pos] ?? 0.5) * y.minutes);
      x.p.intl.goals++; x.p.ntGoals = (x.p.ntGoals ?? 0) + 1;
      (m.result.ourScorers ??= []).push({ id: x.p.id, name: x.p.name, team: code });
    }
  }
}

// ------------------------------------------------------------ Dzień
/**
 * Jeden dzień reprezentacji. players: game.world.players. Zwraca zdarzenia do wiadomości:
 * { announced: [{window, list}], started, released: [{window, list}], played: [mecze], draws: [...] }.
 */
export function nationalDay(N, date, players) {
  const out = { announced: [], released: [], played: [], draws: [] };
  const rng = new Rng(`kadry:${N.seed}:${date}`);
  for (const w of FIFA_WINDOWS_ALL) {
    const key = w.from;
    const st = N.windows[key] ?? (N.windows[key] = { status: 'pending' });
    if (st.status === 'pending' && date >= addDaysIso(w.from, -4) && date <= w.to) {
      st.list = selectCallups(Object.values(players), rng);
      st.status = 'announced';
      out.announced.push({ window: w, list: st.list });
    }
    if (st.status === 'announced' && date >= w.from && date <= w.to) {
      for (const c of st.list) { const p = players[c.id]; if (p) p.callUp = { team: c.team, u21: c.u21, from: w.from, to: w.to }; }
      st.status = 'active';
    }
    if (st.status === 'active' && date > w.to) {
      for (const c of st.list) {
        const p = players[c.id];
        if (!p) continue;
        const far = ntTeam(c.team)?.konfederacja !== 'UEFA';
        const mins = p.ntMinutes ?? (c.u21 || far ? rng.int(0, 150) : 0); // U21 i kadry spoza Europy: mecze poza naszą symulacją
        p.fresh = clamp(Math.round((p.fresh ?? 90) - 15 - Math.min(15, mins / 12) - (far ? 10 : 0)), 35, 100);
        p.morale = clamp((p.morale ?? 12) + 1 + Math.min(2, p.ntGoals ?? 0), 1, 20);
        if (c.u21) { p.intlU21 = (p.intlU21 ?? 0) + (mins > 0 ? 1 : 0); }
        if (far) { p.intl = p.intl ?? { caps: 0, goals: 0, team: c.team }; p.intl.caps += mins > 0 ? 1 : 0; }
        c.minutes = mins; c.goals = p.ntGoals ?? 0;
        if (rng.chance(0.03) && !(p.injuryDays > 0)) {
          const days = rng.int(5, 24);
          p.injuryDays = days; p.injury = { name: rng.pick(['uraz mięśnia uda', 'skręcenie stawu skokowego', 'stłuczenie kolana']), days, cat: days > 14 ? 'medium' : 'light', since: date, nt: true };
          c.injury = p.injury;
        }
        delete p.callUp; delete p.ntMinutes; delete p.ntGoals;
      }
      st.status = 'done';
      out.released.push({ window: w, list: st.list });
    }
  }
  // Losowania
  if (!N.ln.ko && date >= LN_DRAW) { lnKnockoutDraw(N, new Rng(`ln-ko:${N.seed}`)); out.draws.push('LNKO'); }
  if (!N.euro.groups && date >= EURO_DRAW && N.ln.ko) { euroDraw(N, new Rng(`euro:${N.seed}`)); out.draws.push('EURO'); }
  if (N.ln.ko && !N.ln.finals && N.ln.ko.qf.every((t) => tieWinner(N, t)) && date > KO_DATES[1]) { lnFinals(N, new Rng(`ln-f:${N.seed}`)); out.draws.push('LNF'); }
  if (N.ln.finals && !N.ln.finals.final && N.ln.finals.sf.every((id) => N.matches[id].played) && date > FINALS.SF[1]) {
    const [w1, l1] = singleWinner(N.matches[N.ln.finals.sf[0]]); const [w2, l2] = singleWinner(N.matches[N.ln.finals.sf[1]]);
    N.matches['LNF-3'] = { id: 'LNF-3', comp: 'LNF', round: '3', date: FINALS.third, home: l1, away: l2, neutral: true, knockout: true, played: false, result: null };
    N.matches['LNF-F'] = { id: 'LNF-F', comp: 'LNF', round: 'F', date: FINALS.F, home: w1, away: w2, neutral: true, knockout: true, played: false, result: null };
    N.ln.finals.final = 'LNF-F';
  }
  // Mecze dnia
  const called = Object.values(N.windows).filter((s) => s.status === 'active').flatMap((s) => s.list);
  for (const m of Object.values(N.matches)) {
    if (m.date !== date || m.played) continue;
    m.result = simNt(N, m, rng);
    m.played = true;
    assignPlay(N, m, called, players, rng);
    out.played.push(m);
  }
  if (N.ln.finals?.final && N.matches['LNF-F'].played && !N.ln.champion) N.ln.champion = singleWinner(N.matches['LNF-F'])[0];
  return out;
}

function addDaysIso(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export function teamMatches(N, code) {
  return Object.values(N.matches).filter((m) => m.home === code || m.away === code).sort((a, b) => a.date.localeCompare(b.date));
}
