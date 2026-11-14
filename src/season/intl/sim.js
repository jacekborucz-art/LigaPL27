// Narzędzia silnika reprezentacji: szybka symulacja meczu z L (ten sam model co national.js), tabele,
// terminarze „każdy z każdym” i ligi szwajcarskiej, losowanie grup z koszyków, drabinka pucharowa.
// Mecz w zapisie zwartym: { i: id, d: data, h: gospodarz, a: gość, g?: grupa, k?: runda, l?: 1|2 (dwumecz),
// n?: 1 (teren neutralny), s?: [gole, gole] po rozegraniu, x?: 1 (dogrywka), p?: [karne, karne] }.

import { clamp } from '../../core/rng.js';
import { QS, sampleScore } from '../../engine/quickSim.js';
import { ntTeam, NT } from '../national.js';
import { WORLD_NT } from '../worldNations.js';

// Elo z danych: ostatnie kryterium kolejności w tabeli (stałe w czasie, więc tabela po sezonie się nie zmienia)
const STATIC_ELO = new Map([...WORLD_NT, ...NT].map((t) => [t.kod, t.elo]));
const sElo = (c) => STATIC_ELO.get(c) ?? 0;

export const L = (code) => ntTeam(code)?.L ?? 11;
export const elo = (code) => ntTeam(code)?.elo ?? 1400;
export const byElo = (list) => [...list].sort((a, b) => elo(b) - elo(a) || a.localeCompare(b));

const MU = [QS.MU_H * 0.92, QS.MU_A * 0.95];
const MU_N = [QS.MU_N * 0.95, QS.MU_N * 0.95];

/** Wynik po 90 minutach z siły L (model Poissona jak w national.js). */
export function simScore(h, a, neutral, rng) {
  const d = L(h) - L(a);
  const mu = neutral ? MU_N : MU;
  const lH = mu[0] * Math.exp(QS.BETA * d); const lA = mu[1] * Math.exp(-QS.BETA * d);
  return { score: sampleScore(lH, lA, rng), lH, lA, d };
}

/**
 * Rozgrywa mecz m (zapis zwarty). ko: mecz pucharowy (dogrywka i karne przy remisie).
 * first: rozegrany pierwszy mecz dwumeczu (rywale zamienieni), liczy się suma bramek.
 */
export function playMatch(m, rng, { ko = false, first = null } = {}) {
  const { score, lH, lA, d } = simScore(m.h, m.a, !!m.n, rng);
  const agg = () => (first ? [score[0] + first.s[1], score[1] + first.s[0]] : score);
  const level = () => { const [x, y] = agg(); return x === y; };
  if ((ko || first) && level()) {
    m.x = 1;
    score[0] += rng.poisson(lH / 3.3); score[1] += rng.poisson(lA / 3.3);
    if (level()) { const lose = rng.int(2, 4); m.p = rng.chance(clamp(0.5 + 0.03 * d, 0.38, 0.62)) ? [lose + 1, lose] : [lose, lose + 1]; }
  }
  m.s = score;
  return m;
}

/** Zwycięzca meczu pucharowego albo dwumeczu (first: pierwszy mecz, m: rewanż). */
export function winnerOf(m, first = null) {
  if (!m?.s) return null;
  const [x, y] = first ? [m.s[0] + first.s[1], m.s[1] + first.s[0]] : m.s;
  if (x !== y) return x > y ? m.h : m.a;
  if (m.p) return m.p[0] > m.p[1] ? m.h : m.a;
  return null;
}
export const loserOf = (m, first = null) => { const w = winnerOf(m, first); return w ? (w === m.h ? m.a : m.h) : null; };

// ------------------------------------------------------------ Tabele
const newRow = (id) => ({ id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
export function addResult(rows, h, a, s) {
  const x = rows.get(h); const y = rows.get(a);
  if (!x || !y) return;
  x.p++; y.p++; x.gf += s[0]; x.ga += s[1]; y.gf += s[1]; y.ga += s[0];
  if (s[0] > s[1]) { x.w++; y.l++; x.pts += 3; } else if (s[0] < s[1]) { y.w++; x.l++; y.pts += 3; } else { x.d++; y.d++; x.pts++; y.pts++; }
}
export const sortRows = (rows) => rows.map((r) => ({ ...r, gd: r.gf - r.ga }))
  .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || sElo(y.id) - sElo(x.id) || x.id.localeCompare(y.id))
  .map((r, i) => ({ ...r, pos: i + 1 }));
/** Tabela z meczów (zapis zwarty) dla listy drużyn. */
export function tableOf(teams, matches) {
  const rows = new Map(teams.map((t) => [t, newRow(t)]));
  for (const m of matches) if (m.s) addResult(rows, m.h, m.a, m.s);
  return sortRows([...rows.values()]);
}
/** Tabela z wierszy zapisanych w skrócie: { KOD: [m, w, r, p, bz, bs, pkt] }. */
export const tableFromPacked = (packed) => sortRows(Object.entries(packed).map(([id, [p, w, d, l, gf, ga, pts]]) => ({ id, p, w, d, l, gf, ga, pts })));
export function packRow(packed, h, a, s) {
  const x = packed[h]; const y = packed[a];
  x[0]++; y[0]++; x[4] += s[0]; x[5] += s[1]; y[4] += s[1]; y[5] += s[0];
  if (s[0] > s[1]) { x[1]++; y[3]++; x[6] += 3; } else if (s[0] < s[1]) { y[1]++; x[3]++; y[6] += 3; } else { x[2]++; y[2]++; x[6]++; y[6]++; }
}
/** Porównanie drużyn z różnych grup: punkty na mecz, bilans na mecz, gole na mecz. */
export const acrossGroups = (rows) => [...rows].sort((x, y) => y.pts / (y.p || 1) - x.pts / (x.p || 1) || (y.gd / (y.p || 1)) - (x.gd / (x.p || 1)) || y.gf / (y.p || 1) - x.gf / (x.p || 1) || sElo(y.id) - sElo(x.id));

// ------------------------------------------------------------ Terminarze
/** Każdy z każdym, mecz i rewanż (nieparzysta liczba: pauza). Zwraca kolejki: [[h, a], ...]. */
export function doubleRoundRobin(teams, rng) {
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
/** Grupa 4 drużyn w turnieju: 3 kolejki. */
export const GROUP4 = [[[0, 1], [2, 3]], [[0, 2], [3, 1]], [[3, 0], [1, 2]]];

/**
 * Liga szwajcarska 18 drużyn (Liga Narodów od 2028/29 [SZAC]): 3 koszyki po 6, każda drużyna gra z 2 rywalami
 * z każdego koszyka (raz u siebie, raz na wyjeździe), razem 6 meczów. Kolejka = skojarzenie wszystkich 18 drużyn.
 */
export function swiss18(teams, rng) {
  const pots = [0, 1, 2].map((i) => rng.shuffle(teams.slice(i * 6, i * 6 + 6)));
  const intra = pots.map((p) => {
    const even = []; const odd = [];
    for (let i = 0; i < 6; i++) (i % 2 ? odd : even).push([p[i], p[(i + 1) % 6]]);
    return [even, odd];
  });
  const inter = (P, Q) => {
    const pi = rng.shuffle([0, 1, 2, 3, 4, 5]);
    return [P.map((t, i) => [t, Q[pi[i]]]), P.map((t, i) => [Q[pi[(i + 1) % 6]], t])];
  };
  const [p0, p1, p2] = pots;
  const a = inter(p0, p1); const b = inter(p0, p2); const c = inter(p1, p2);
  const rounds = [[...a[0], ...intra[2][0]], [...a[1], ...intra[2][1]], [...b[0], ...intra[1][0]], [...b[1], ...intra[1][1]], [...c[0], ...intra[0][0]], [...c[1], ...intra[0][1]]];
  return rng.shuffle(rounds);
}

// ------------------------------------------------------------ Losowanie grup
/**
 * Losowanie grup z koszyków. teams: drużyny od najsilniejszej (koszyk k = kolejne nGroups drużyn).
 * fixed: { indeksGrupy: kod } (np. gospodarze w A1). ok(grupa, kod): dodatkowy warunek (np. konfederacje).
 */
export function drawGroups(teams, nGroups, rng, { fixed = {}, ok = () => true } = {}) {
  const fixedSet = new Set(Object.values(fixed));
  const rest = teams.filter((t) => !fixedSet.has(t));
  const size = Math.ceil(teams.length / nGroups);
  for (let attempt = 0; attempt < 300; attempt++) {
    const groups = Array.from({ length: nGroups }, (_, i) => (fixed[i] ? [fixed[i]] : []));
    const strict = attempt < 250;
    let pos = 0; let failed = false;
    for (let pot = 0; pot < size && !failed; pot++) {
      const free = groups.map((g, i) => i).filter((i) => groups[i].length === pot);
      const potTeams = rng.shuffle(rest.slice(pos, pos + free.length));
      pos += free.length;
      for (const t of potTeams) {
        const cand = groups.map((g, i) => i).filter((i) => groups[i].length === pot && (!strict || ok(groups[i], t)));
        if (!cand.length) { failed = true; break; }
        groups[rng.pick(cand)].push(t);
      }
    }
    if (!failed && pos >= rest.length) return groups;
  }
  throw new Error('Losowanie grup: brak rozwiązania');
}

// ------------------------------------------------------------ Drabinka
/** Kolejność rozstawienia w drabince o rozmiarze n (1 i 2 spotykają się dopiero w finale). */
export function seedOrder(n) {
  let s = [1, 2];
  while (s.length < n) { const m = s.length * 2 + 1; s = s.flatMap((x) => [x, m - x]); }
  return s;
}
/**
 * Pary pierwszej rundy pucharowej z rozstawionych drużyn (lista od najlepszej), bez meczów drużyn z tej samej grupy.
 * groupOf(kod) -> grupa.
 */
export function bracketPairs(seeded, groupOf) {
  const order = seedOrder(seeded.length).map((k) => seeded[k - 1]);
  const pairs = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  for (let i = 0; i < pairs.length; i++) {
    if (groupOf(pairs[i][0]) !== groupOf(pairs[i][1])) continue;
    for (let j = pairs.length - 1; j >= 0; j--) {
      if (j === i) continue;
      const [a, b] = pairs[i]; const [c, d] = pairs[j];
      if (groupOf(a) !== groupOf(d) && groupOf(c) !== groupOf(b)) { pairs[i] = [a, d]; pairs[j] = [c, b]; break; }
    }
  }
  return pairs;
}
