// Puchary UEFA 2026/27 w tle: Liga Mistrzów, Liga Europy, Liga Konferencji.
// Pełne rozgrywki od eliminacji: losowania (rozstawienie, ochrona krajowa), dwumecze, fazy ligowe
// (36 drużyn, koszyki), baraże fazy pucharowej, drabinka do finału. Przegrani eliminacji spadają
// do niższych rozgrywek jak w regulaminie UEFA (LM Q1 -> LK Q2, LM Q2 -> LE Q3, LM Q3 -> LE PO,
// LM PO -> faza ligowa LE, LE Q3 -> LK PO, LE PO -> faza ligowa LK).
// Mecze bez polskich klubów: szybki model z siły L. Mecze polskich klubów trafiają do game.fixtures
// (comp 'uefa') i grają się jak każdy mecz klubu z kadrą (gracz: pełny silnik na żywo).
// PLAN 5.4. Struktura eliminacji uproszczona do par 14/14 (opis w docs/PLAN.md, 5.4).

import { Rng, clamp } from '../core/rng.js';
import { UEFA } from '../config/calendar2026.js';
import { POLISH_EUROPE_2026 } from '../config/calendar2026.js';
import { QS, sampleScore } from '../engine/quickSim.js';
import DATA from '../data/kluby_uefa.json' with { type: 'json' };
import { applyNamesDeep } from '../data/clubNames.js';
applyNamesDeep(DATA); // nazwy do publikacji (prawdziwe w clubNames.js)

export const UCOMPS = ['LM', 'LE', 'LK'];
export const UCOMP_NAMES = { LM: 'Liga Mistrzów', LE: 'Liga Europy', LK: 'Liga Konferencji' };
export const ROUND_NAMES = {
  Q1: '1. runda eliminacji', Q2: '2. runda eliminacji', Q3: '3. runda eliminacji', PO: 'runda play-off',
  league: 'faza ligowa', KPO: 'baraże fazy pucharowej', R16: '1/8 finału', QF: 'ćwierćfinał', SF: 'półfinał', F: 'finał',
};
export const ROUND_SHORT = { Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', PO: 'Play-off', league: 'Faza ligowa', KPO: 'Baraże', R16: '1/8', QF: '1/4', SF: '1/2', F: 'Finał' };

// ------------------------------------------------------------ Kluby zagraniczne
const PALETTE = [['#C8102E', '#FFFFFF'], ['#0055A5', '#FFFFFF'], ['#111111', '#FFFFFF'], ['#FFFFFF', '#14213D'], ['#6A1B9A', '#FFFFFF'], ['#FFD100', '#111111'], ['#E35205', '#FFFFFF'], ['#00A3E0', '#FFFFFF'], ['#7A0019', '#FFD100'], ['#0B3D91', '#FFD100']];
const STOP = new Set(['FC', 'AFC', 'SK', 'SC', 'AC', 'AS', 'CF', 'FK', 'NK', 'HNK', 'GNK', 'KF', 'SL', 'PFC', 'CFR', 'RB', 'BK', 'IF', 'FF', 'KRC', 'RSC', 'SV', 'SSC', 'OGC', 'RC', 'CD', 'SD', 'UD', 'KAA', 'KV', 'AZ', 'PSV', 'NAC', 'TSG', 'VfB', 'VfL', 'Real', 'Club', 'Sporting', '1.']);
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function shortOf(name) {
  const words = name.replace(/[.'’]/g, ' ').split(/\s+/).filter(Boolean);
  const main = words.find((w) => !STOP.has(w) && w.length > 2) ?? words[0];
  return main.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3).toUpperCase();
}

// ------------------------------------------------------------ Skala siły klubów (docs/sila-lig-europy.md)
// Jedna skala L dla Ekstraklasy i klubów zagranicznych, zakotwiczona na trzech punktach [SZAC, rozdz. 3]:
//   najsilniejsza liga (Premier League): przeciętny klub ok. 14.6, czołówka 16.0-16.6;
//   Ekstraklasa: przeciętny klub 11.5, czołówka (Lech, Legia, Raków) 12.4-12.6 (kalibracja krajowa, bez zmian);
//   najsłabsza liga (San Marino): przeciętny klub ok. 6.5, mistrz ok. 8.0 (Gibraltar, Andora: mistrz ok. 9).
// Przelicznik z rankingów Elo: 1 punkt L to ok. 100 pkt Elo, Lech (ok. 1600 Elo) = 12.6.
// L z pliku danych powstało ze współczynnika klubowego UEFA (5 sezonów). Współczynnik zaniża kluby ze środka
// Europy, które rzadko grają w fazach ligowych, a polskie kluby mają go zawyżonego ostatnimi sezonami w LK.
// Porównanie z Elo (rozdz. 3.3) i z wynikami polskich klubów 2021-2026 (rozdz. 2) daje dla klubów zagranicznych
// z przedziału L 10.5-13.5 niedoszacowanie 0.3-1.0; elita i najsłabsze kluby są na miejscu. Korekta niżej
// (+0.3, dobrana do bilansu dwumeczów polskich klubów z ligami równymi) dotyczy tylko klubów zagranicznych:
// polskie L zostają, liga krajowa się nie zmienia.
export const STRENGTH_SCALE = {
  top: { league: 'ENG', avgL: 14.6, bestL: 16.6, note: 'Premier League: przeciętny klub i czołówka' },
  ekstraklasa: { league: 'POL', avgL: 11.5, topL: 12.6, note: 'Ekstraklasa: średnia ligi i czołowe kluby' },
  bottom: { league: 'SMR', avgL: 6.5, bestL: 8.0, note: 'San Marino: przeciętny klub i mistrz' },
  eloPerL: 100, anchorElo: { lech: 1600 },
};
/** Korekta siły klubu zagranicznego (punkty L) względem L z pliku danych, kształt trapezu. */
export const FOREIGN_ADJ_MAX = 0.3;
export function foreignStrengthAdj(L) {
  if (L <= 9.5 || L >= 16.5) return 0;
  if (L < 10.5) return FOREIGN_ADJ_MAX * (L - 9.5);
  if (L <= 13.5) return FOREIGN_ADJ_MAX;
  return FOREIGN_ADJ_MAX * (16.5 - L) / 3;
}
const strengthOf = (k) => Math.round((k.L + foreignStrengthAdj(k.L)) * 10) / 10;

export const UEFA_CLUBS = DATA.kluby.map((k) => ({
  id: k.id, name: k.nazwa, short: shortOf(k.nazwa), tier: 0, foreign: true, country: k.kraj, coef: k.wspolczynnik,
  L: strengthOf(k), Lbase: k.L, prestige: k.prestiz, coach: k.trener, colors: PALETTE[hash(k.id) % PALETTE.length], label2026: k.rozgrywki2026,
}));
const byId = new Map(UEFA_CLUBS.map((c) => [c.id, c]));
const POLISH = new Map(DATA.polskieKlubyUEFA2026.map((k) => [k.id, k]));
export const COUNTRY_NAMES = Object.fromEntries(DATA.kraje.map((k) => [k.kod, k.nazwa]));
/** Współczynnik krajowy UEFA (suma 5 sezonów) na start gry. */
export const COUNTRY_COEF_2026 = Object.fromEntries(DATA.kraje.map((k) => [k.kod, k.wspolczynnik ?? 0]));
COUNTRY_NAMES.POL = COUNTRY_NAMES.POL ?? 'Polska';
export const uefaClub = (id) => byId.get(id) ?? null;
export const HOLDER_2026 = 'paris-sg';

// ------------------------------------------------------------ Struktura rozgrywek
// Każda runda: kolejka dat (UEFA[comp][round]), skąd przychodzą drużyny i ile wchodzi bezpośrednio.
export const ORDER = {
  LM: ['Q1', 'Q2', 'Q3', 'PO', 'league', 'KPO', 'R16', 'QF', 'SF', 'F'],
  LE: ['Q3', 'PO', 'league', 'KPO', 'R16', 'QF', 'SF', 'F'],
  LK: ['Q1', 'Q2', 'Q3', 'PO', 'league', 'KPO', 'R16', 'QF', 'SF', 'F'],
};
const FEEDS = {
  LM: { Q2: [['LM', 'Q1', 'W']], Q3: [['LM', 'Q2', 'W']], PO: [['LM', 'Q3', 'W']], league: [['LM', 'PO', 'W']] },
  LE: { Q3: [['LM', 'Q2', 'L']], PO: [['LE', 'Q3', 'W'], ['LM', 'Q3', 'L']], league: [['LE', 'PO', 'W'], ['LM', 'PO', 'L']] },
  LK: { Q2: [['LK', 'Q1', 'W'], ['LM', 'Q1', 'L']], Q3: [['LK', 'Q2', 'W']], PO: [['LK', 'Q3', 'W'], ['LE', 'Q3', 'L']], league: [['LK', 'PO', 'W'], ['LE', 'PO', 'L']] },
};
const KO_FEEDS = { KPO: 'league', R16: 'KPO', QF: 'R16', SF: 'QF', F: 'SF' };
export const LEAGUE_FORMAT = { LM: { pots: 4, perPot: 2 }, LE: { pots: 4, perPot: 2 }, LK: { pots: 6, perPot: 1 } };

/**
 * Liczba drużyn wchodzących do każdej rundy (bez zwycięzców i przegranych z innych rund). Rozmiary odwzorowują
 * listę dostępu UEFA (docs/sila-lig-europy.md, rozdz. 5): faza ligowa LK prawie w całości z eliminacji
 * (w rzeczywistości 0 bezpośrednich miejsc), LE ok. połowa bezpośrednio, LM 29 bezpośrednio.
 * Kontrola: LE: 18 + 11 zwycięzców PO (8 + 7 z LE Q3 + 7 przegranych LM Q3 = 22) + 7 przegranych LM PO = 36;
 * LK: Q1 8 -> 4; Q2 9 + 4 + 7 przegranych LM Q1 = 20 -> 10; Q3 10 + 10 = 20 -> 10; PO 13 + 10 + 7 przegranych
 * LE Q3 = 30 -> 15; faza ligowa 10 + 15 + 11 przegranych LE PO = 36. W LK Q3 wchodzą kluby z lig średnich
 * (jak w rzeczywistości), więc Q3 nie składa się z samych zwycięzców słabych par Q2.
 */
export const ENTRY_SLOTS = {
  LM: { league: 29, PO: 7, Q3: 7, Q2: 7, Q1: 14 },
  LE: { league: 18, PO: 8, Q3: 7 },
  LK: { league: 10, PO: 13, Q3: 10, Q2: 9, Q1: 8 },
};
// Gdy w rundzie brak miejsca (np. wszedł do niej polski klub), najsłabszy wg współczynnika schodzi do rundy niżej.
const ENTRY_FALLBACK = {
  'LM:league': 'LM:PO', 'LM:PO': 'LM:Q3', 'LM:Q3': 'LM:Q2', 'LM:Q2': 'LM:Q1', 'LM:Q1': 'LK:Q1',
  'LE:league': 'LE:PO', 'LE:PO': 'LE:Q3', 'LE:Q3': 'LK:Q3',
  'LK:league': 'LK:PO', 'LK:PO': 'LK:Q3', 'LK:Q3': 'LK:Q2', 'LK:Q2': 'LK:Q1', 'LK:Q1': null,
};
const ENTRY_DATA = new Map(DATA.kluby.map((k) => [k.id, k.wejscie2026 ?? null]));

/** Runda wejścia polskiego klubu w strukturze gry (LE Q1/Q2 -> Q3, bo LE nie ma tych rund). */
export function polishEntryRound(x) {
  let r = x.entry === 'LP' ? 'league' : x.entry;
  if (x.comp === 'LE' && ['Q1', 'Q2'].includes(r)) r = 'Q3';
  return ENTRY_SLOTS[x.comp]?.[r] ? r : null;
}

/**
 * Przydział klubów do rund wejścia. Każdy klub zagraniczny ma rundę, od której naprawdę zaczął sezon 2026/27
 * (pole wejscie2026 w kluby_uefa.json: kto przechodził eliminacje LM, kto LE PO, kto LK PO). Dzięki temu polskie
 * kluby trafiają w eliminacjach na rywali o realnej sile, a nie tylko na kluby odpadłe w eliminacjach.
 * Polskie kluby wchodzą pierwsze; nadmiar w rundzie (najniższy współczynnik) schodzi rundę niżej (ENTRY_FALLBACK).
 */
export function allocateEntrants(polish = POLISH_EUROPE_2026) {
  const e = { LM: {}, LE: {}, LK: {} };
  for (const comp of Object.keys(ENTRY_SLOTS)) for (const r of Object.keys(ENTRY_SLOTS[comp])) e[comp][r] = [];
  for (const x of polish) {
    const r = polishEntryRound(x);
    if (!r || UCOMPS.some((c) => Object.values(e[c]).some((l) => l.includes(x.club)))) continue;
    e[x.comp][r].push(x.club);
  }
  const byCoef = (a, b) => coefOf(b) - coefOf(a);
  const incoming = new Map();
  for (const key of Object.keys(ENTRY_FALLBACK)) { // kolejność kluczy: każda runda zapasowa jest dalej na liście
    const [comp, r] = key.split(':');
    const cands = [...(incoming.get(key) ?? []), ...UEFA_CLUBS.filter((c) => ENTRY_DATA.get(c.id) === key).map((c) => c.id)].sort(byCoef);
    const free = Math.max(0, ENTRY_SLOTS[comp][r] - e[comp][r].length);
    e[comp][r].push(...cands.slice(0, free));
    const fb = ENTRY_FALLBACK[key];
    if (fb) incoming.set(fb, [...(incoming.get(fb) ?? []), ...cands.slice(free)]);
  }
  // Wolne miejsca (np. mniej polskich klubów niż zwykle): pozostałe kluby, najsłabsze do najniższych rund
  const used = new Set(UCOMPS.flatMap((c) => Object.values(e[c]).flat()));
  const rest = UEFA_CLUBS.filter((c) => !used.has(c.id)).map((c) => c.id).sort(byCoef);
  for (const key of Object.keys(ENTRY_FALLBACK).reverse()) {
    const [comp, r] = key.split(':');
    while (e[comp][r].length < ENTRY_SLOTS[comp][r] && rest.length) e[comp][r].push(rest.pop());
  }
  return e;
}

// ------------------------------------------------------------ Pomocnicze
export const countryOf = (id) => (POLISH.has(id) || !byId.has(id) ? 'POL' : byId.get(id).country);
export function coefOf(id) { return byId.get(id)?.coef ?? POLISH.get(id)?.wspolczynnik ?? 5; }
const datesOf = (comp, round) => [].concat(UEFA[comp][round] ?? []);
const TIMES = ['21:00', '18:45'];

function newMatch(U, m) {
  U.matches[m.id] = { played: false, result: null, ...m };
  return U.matches[m.id];
}

// ------------------------------------------------------------ Losowania
// Ścieżka mistrzów w uproszczeniu: kluby z najsłabszych lig (współczynnik kraju poniżej progu) losujemy osobno,
// jak w prawdziwych eliminacjach, gdzie mistrzowie małych federacji grają między sobą. Bez tego rozstawione polskie
// kluby w późnych rundach eliminacji trafiały zbyt często na takie kluby i za łatwo wchodziły do faz ligowych,
// a w fazie ligowej LK brakowało słabych mistrzów (docs/sila-lig-europy.md, rozdz. 5).
export const MINNOW_COEF = 15;
const isMinnow = (id) => (COUNTRY_COEF_2026[countryOf(id)] ?? 0) < MINNOW_COEF;

/**
 * Pary eliminacji i fazy pucharowej: rozstawieni vs nierozstawieni, bez klubów z jednego kraju.
 * paths: osobno kluby z małych federacji i reszta (gdy obie grupy mają co najmniej 2 drużyny).
 */
export function drawPairs(teams, rng, { seeded = true, paths = true } = {}) {
  if (paths) {
    const small = teams.filter(isMinnow); const main = teams.filter((t) => !isMinnow(t));
    if (small.length >= 2 && main.length >= 2) {
      if (small.length % 2) { const s = [...small].sort((a, b) => coefOf(b) - coefOf(a))[0]; small.splice(small.indexOf(s), 1); main.push(s); }
      return [...drawPairs(small, rng, { seeded, paths: false }), ...drawPairs(main, rng, { seeded, paths: false })];
    }
  }
  const list = [...teams].sort((a, b) => coefOf(b) - coefOf(a));
  const half = list.length / 2;
  const top = list.slice(0, half); const bottom = list.slice(half);
  for (let t = 0; t < 400; t++) {
    const s = rng.shuffle([...top]); const u = rng.shuffle([...bottom]);
    const pairs = seeded ? s.map((x, i) => [x, u[i]]) : (() => { const all = rng.shuffle([...list]); return Array.from({ length: half }, (_, i) => [all[2 * i], all[2 * i + 1]]); })();
    if (t > 300 || pairs.every(([a, b]) => countryOf(a) !== countryOf(b))) return pairs;
  }
  return null;
}

/**
 * Losowanie fazy ligowej (szwajcarskiej). pots: tablica koszyków, perPot: rywale z każdego koszyka.
 * Zasady: brak rywala z tego samego kraju, maks. 2 rywali z jednego kraju, równo meczów u siebie i na wyjeździe.
 * Zwraca listę meczów [home, away, md].
 */
export function drawLeaguePhase(pots, perPot, rng, nMd) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const edges = tryEdges(pots, perPot, rng);
    if (!edges) continue;
    const oriented = perPot === 2 ? edges : orientEuler(edges, rng);
    const mds = assignMatchdays(oriented, nMd, rng);
    if (mds) return mds;
  }
  throw new Error('Losowanie fazy ligowej nie powiodło się');
}

function tryEdges(pots, perPot, rng) {
  const edges = [];
  const opp = new Map(pots.flat().map((t) => [t, []]));
  const ok = (a, b) => {
    if (a === b || countryOf(a) === countryOf(b)) return false;
    const ca = countryOf(b); const cb = countryOf(a);
    return opp.get(a).filter((x) => countryOf(x) === ca).length < 2 && opp.get(b).filter((x) => countryOf(x) === cb).length < 2;
  };
  const add = (list) => { for (const [h, a] of list) { edges.push([h, a]); opp.get(h).push(a); opp.get(a).push(h); } };
  for (let i = 0; i < pots.length; i++) {
    for (let j = i; j < pots.length; j++) {
      let done = false;
      for (let t = 0; t < 200 && !done; t++) {
        const P = rng.shuffle([...pots[i]]); const Q = rng.shuffle([...pots[j]]);
        const n = P.length; const cand = [];
        if (perPot === 2 && i === j) for (let k = 0; k < n; k++) cand.push([P[k], P[(k + 1) % n]]); // cykl w koszyku
        else if (perPot === 2) for (let k = 0; k < n; k++) cand.push([P[k], Q[k]], [Q[(k + 1) % n], P[k]]); // cykl między koszykami
        else if (i === j) for (let k = 0; k < n; k += 2) cand.push([P[k], P[k + 1]]);
        else for (let k = 0; k < n; k++) cand.push([P[k], Q[k]]);
        // sprawdzenie łącznie z już wylosowanymi parami
        const snapshot = new Map([...opp].map(([k, v]) => [k, [...v]]));
        let good = true;
        for (const [h, a] of cand) {
          if (!ok(h, a)) { good = false; break; }
          opp.get(h).push(a); opp.get(a).push(h);
        }
        for (const [k, v] of snapshot) opp.set(k, v);
        if (good) { add(cand); done = true; }
      }
      if (!done) return null;
    }
  }
  return edges;
}

/** Orientacja krawędzi po cyklu Eulera: każda drużyna tyle samo meczów u siebie co na wyjeździe. */
function orientEuler(edges, rng) {
  const adj = new Map();
  edges.forEach(([a, b], i) => {
    for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push([y, i]); }
  });
  const used = new Array(edges.length).fill(false);
  const out = [];
  for (const start of rng.shuffle([...adj.keys()])) {
    const stack = [start];
    while (stack.length) {
      const v = stack[stack.length - 1];
      const list = adj.get(v);
      while (list.length && used[list[list.length - 1][1]]) list.pop();
      if (!list.length) { stack.pop(); continue; }
      const [w, i] = list.pop();
      used[i] = true;
      out.push([v, w]);
      stack.push(w);
    }
  }
  return out;
}

/** Rozkład meczów na kolejki: w każdej kolejce każda drużyna gra dokładnie raz. */
function assignMatchdays(edges, nMd, rng) {
  const remaining = [...edges];
  const result = [];
  for (let md = 1; md <= nMd; md++) {
    const match = perfectMatching(remaining, rng);
    if (!match) return null;
    for (const e of match) { result.push([e[0], e[1], md]); remaining.splice(remaining.indexOf(e), 1); }
  }
  return remaining.length ? null : result;
}

function perfectMatching(edges, rng) {
  const teams = [...new Set(edges.flat())];
  const inc = new Map(teams.map((t) => [t, []]));
  for (const e of rng.shuffle([...edges])) { inc.get(e[0]).push(e); inc.get(e[1]).push(e); }
  const taken = new Set(); const chosen = [];
  let steps = 0;
  const dfs = () => {
    if (++steps > 20000) return false;
    let best = null; let bestN = Infinity;
    for (const t of teams) {
      if (taken.has(t)) continue;
      const n = inc.get(t).filter((e) => !taken.has(e[0]) && !taken.has(e[1])).length;
      if (n < bestN) { best = t; bestN = n; }
    }
    if (best === null) return true;
    if (bestN === 0) return false;
    for (const e of inc.get(best)) {
      if (taken.has(e[0]) || taken.has(e[1])) continue;
      taken.add(e[0]); taken.add(e[1]); chosen.push(e);
      if (dfs()) return true;
      taken.delete(e[0]); taken.delete(e[1]); chosen.pop();
    }
    return false;
  };
  return dfs() ? chosen : null;
}

/** Tabela fazy ligowej (UEFA: punkty, bilans, gole, gole na wyjeździe, zwycięstwa, współczynnik). */
export function leagueTable(U, comp) {
  const L = U.comps[comp].league;
  const rows = new Map(L.teams.map((id) => [id, { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, awayGf: 0, awayW: 0, pts: 0, form: [] }]));
  for (const id of L.matches) {
    const m = U.matches[id];
    if (!m.played) continue;
    const [g0, g1] = m.result.score;
    const h = rows.get(m.home); const a = rows.get(m.away);
    h.p++; a.p++; h.gf += g0; h.ga += g1; a.gf += g1; a.ga += g0; a.awayGf += g1;
    if (g0 > g1) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
    else if (g0 < g1) { a.w++; a.awayW++; h.l++; a.pts += 3; h.form.push('L'); a.form.push('W'); }
    else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
  }
  const list = [...rows.values()].map((r) => ({ ...r, gd: r.gf - r.ga }));
  list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || y.awayGf - x.awayGf || y.w - x.w || y.awayW - x.awayW || coefOf(y.id) - coefOf(x.id));
  return list.map((r, i) => ({ ...r, pos: i + 1 }));
}

// ------------------------------------------------------------ Tworzenie
export function createUefa(seed, { holder = HOLDER_2026 } = {}) {
  const entrants = allocateEntrants();
  const U = { seed: String(seed), holder, comps: {}, matches: {}, scorers: {}, draws: [], countryPts: {} };
  for (const comp of UCOMPS) {
    U.comps[comp] = { rounds: {}, league: null, champion: null };
    for (const r of ORDER[comp]) {
      U.comps[comp].rounds[r] = { entrants: [...(entrants[comp][r] ?? [])], teams: null, ties: [], drawn: false, done: false, drawDate: null };
    }
  }
  return U;
}

// ------------------------------------------------------------ Gotowość i daty
function roundObj(U, comp, r) { return U.comps[comp].rounds[r]; }
function feedersOf(comp, r) {
  if (FEEDS[comp][r]) return FEEDS[comp][r];
  if (KO_FEEDS[r]) return [[comp, KO_FEEDS[r], 'W']];
  const i = ORDER[comp].indexOf(r);
  return i > 0 && r !== 'league' ? [[comp, ORDER[comp][i - 1], 'W']] : [];
}

/** Ostatni dzień meczów rundy (z kalendarza UEFA). */
export function lastDateOf(comp, r) { return datesOf(comp, r).at(-1); }
export function firstDateOf(comp, r) { return datesOf(comp, r)[0]; }

function readyToDraw(U, comp, r, date) {
  const R = roundObj(U, comp, r);
  if (R.drawn) return false;
  const feeds = feedersOf(comp, r);
  for (const [c, fr] of feeds) {
    if (!roundObj(U, c, fr).done) return false;
    if (date <= lastDateOf(c, fr)) return false;
  }
  return date < firstDateOf(comp, r);
}

function teamsFor(U, comp, r) {
  const out = [...roundObj(U, comp, r).entrants];
  for (const [c, fr, wl] of FEEDS[comp][r] ?? []) {
    for (const t of roundObj(U, c, fr).ties) out.push(wl === 'W' ? t.winner : t.loser);
  }
  return out;
}

// ------------------------------------------------------------ Wykonanie losowań
function makeTie(U, comp, r, a, b, idx, { neutral = false } = {}) {
  const [d1, d2] = datesOf(comp, r);
  const id = `${comp}-${r}-${idx + 1}`;
  const time = TIMES[idx % 2];
  const tie = { id, comp, round: r, a, b, legs: [], winner: null, loser: null };
  if (r === 'F') {
    newMatch(U, { id: `${id}`, comp, round: r, leg: null, date: d1, time: '21:00', home: a, away: b, neutral: true, tie: id });
    tie.legs = [id];
  } else {
    newMatch(U, { id: `${id}-1`, comp, round: r, leg: 1, date: d1, time, home: a, away: b, tie: id });
    newMatch(U, { id: `${id}-2`, comp, round: r, leg: 2, date: d2, time, home: b, away: a, tie: id });
    tie.legs = [`${id}-1`, `${id}-2`];
  }
  void neutral;
  return tie;
}

function doDraw(U, comp, r, date) {
  const rng = new Rng(`uefa:${U.seed}:${comp}:${r}`);
  const R = roundObj(U, comp, r);
  R.drawn = true; R.drawDate = date;
  const draw = { comp, round: r, date, pairs: [], pots: null };
  if (['Q1', 'Q2', 'Q3', 'PO'].includes(r)) {
    R.teams = teamsFor(U, comp, r);
    // Ścieżka mistrzów: cała LM i późne rundy LE/LK; w LK Q1-Q2 kluby z małych federacji grają z wszystkimi.
    const pairs = drawPairs(R.teams, rng, { paths: comp === 'LM' || ['Q3', 'PO'].includes(r) });
    R.ties = pairs.map((p, i) => { const [a, b] = rng.chance(0.5) ? p : [p[1], p[0]]; return makeTie(U, comp, r, a, b, i); });
    draw.pairs = pairs.map(([s, u]) => ({ seeded: s, unseeded: u }));
    draw.seeded = pairs.map((p) => p[0]); draw.unseeded = pairs.map((p) => p[1]);
  } else if (r === 'league') {
    const teams = teamsFor(U, comp, r);
    const { pots: nPots, perPot } = LEAGUE_FORMAT[comp];
    const sorted = [...teams].sort((a, b) => (comp === 'LM' && a === U.holder ? -1 : comp === 'LM' && b === U.holder ? 1 : coefOf(b) - coefOf(a)));
    const size = teams.length / nPots;
    const pots = Array.from({ length: nPots }, (_, i) => sorted.slice(i * size, (i + 1) * size));
    const nMd = datesOf(comp, 'league').length;
    const games = drawLeaguePhase(pots, perPot, rng, nMd);
    const dates = datesOf(comp, 'league');
    const L = { teams, pots, matches: [] };
    games.sort((x, y) => x[2] - y[2]).forEach(([h, a, md], i) => {
      const id = `${comp}-L${md}-${h}-${a}`;
      newMatch(U, { id, comp, round: 'league', md, leg: null, date: dates[md - 1], time: TIMES[i % 2], home: h, away: a });
      L.matches.push(id);
    });
    U.comps[comp].league = L;
    R.teams = teams;
    draw.pots = pots;
    draw.opponents = Object.fromEntries(teams.map((t) => [t, games.filter((g) => g[0] === t || g[1] === t).map((g) => ({ opp: g[0] === t ? g[1] : g[0], home: g[0] === t, md: g[2] }))]));
  } else if (r === 'KPO') {
    const table = leagueTable(U, comp);
    const pos = (n) => table[n - 1].id;
    const groups = [[[9, 10], [23, 24]], [[11, 12], [21, 22]], [[13, 14], [19, 20]], [[15, 16], [17, 18]]];
    let idx = 0;
    R.teams = table.slice(8, 24).map((x) => x.id);
    R.groups = [];
    for (const [s, u] of groups) {
      const un = rng.shuffle(u.map(pos));
      s.map(pos).forEach((seed, i) => {
        R.ties.push(makeTie(U, comp, r, un[i], seed, idx++)); // rozstawiony gra rewanż u siebie
        draw.pairs.push({ seeded: seed, unseeded: un[i] });
      });
      R.groups.push(s.map(pos));
    }
    R.direct = table.slice(0, 8).map((x) => x.id);
  } else if (r === 'R16') {
    const table = leagueTable(U, comp);
    const K = roundObj(U, comp, 'KPO');
    // KPO: tie 0-1 = grupa 9/10, 2-3 = 11/12, 4-5 = 13/14, 6-7 = 15/16
    const kpoW = (g) => [K.ties[2 * g].winner, K.ties[2 * g + 1].winner];
    const seedGroups = [[[1, 2], 3], [[7, 8], 0], [[3, 4], 2], [[5, 6], 1]];
    const half = [[], []];
    let idx = 0;
    for (const [[s1, s2], g] of seedGroups) {
      const ws = rng.shuffle(kpoW(g));
      [s1, s2].forEach((s, i) => half[i].push([ws[i], table[s - 1].id]));
    }
    R.teams = [...table.slice(0, 8).map((x) => x.id), ...K.ties.map((t) => t.winner)];
    for (const [a, b] of [...half[0], ...half[1]]) {
      R.ties.push(makeTie(U, comp, r, a, b, idx++));
      draw.pairs.push({ seeded: b, unseeded: a });
    }
  } else {
    // QF, SF, F: drabinka ustalona (zwycięzcy kolejnych par), kolejność meczów losowana
    const prev = roundObj(U, comp, KO_FEEDS[r]).ties;
    R.teams = prev.map((t) => t.winner);
    for (let i = 0; i < prev.length / 2; i++) {
      let [a, b] = [prev[2 * i].winner, prev[2 * i + 1].winner];
      if (rng.chance(0.5)) [a, b] = [b, a];
      R.ties.push(makeTie(U, comp, r, a, b, i));
      draw.pairs.push({ seeded: a, unseeded: b });
    }
  }
  U.draws.push(draw);
  return draw;
}

// ------------------------------------------------------------ Mecze w tle (bez kadr)
function lambdas(home, away, neutral) {
  const d = (uefaL(home) - uefaL(away));
  const mu = neutral ? [QS.MU_N, QS.MU_N] : [QS.MU_H, QS.MU_A];
  return [mu[0] * Math.exp(QS.BETA * d), mu[1] * Math.exp(-QS.BETA * d)];
}
export function uefaL(id) { return byId.get(id)?.L ?? POLISH.get(id)?.Lwzor ?? 11; }

/** Szybki mecz z siły L; firstLeg: [gole obecnego gospodarza, gole gościa] z 1. meczu (rewanż). */
export function simByStrength(home, away, rng, { neutral = false, knockout = false, firstLeg = null } = {}) {
  const [lH, lA] = lambdas(home, away, neutral);
  const score = sampleScore(lH, lA, rng);
  const level = (s) => (firstLeg ? s[0] + firstLeg[0] === s[1] + firstLeg[1] : s[0] === s[1]);
  let extraTime = false; let shootout = null;
  if ((knockout || firstLeg) && level(score)) {
    extraTime = true;
    score[0] += rng.poisson(lH / 3.3); score[1] += rng.poisson(lA / 3.3);
    if (level(score)) {
      const p = clamp(0.5 + 0.03 * (uefaL(home) - uefaL(away)), 0.38, 0.62);
      const lose = rng.int(2, 4);
      shootout = rng.chance(p) ? [lose + 1, lose] : [lose, lose + 1];
    }
  }
  return { score, extraTime, shootout, xg: [Math.round(lH * 100) / 100, Math.round(lA * 100) / 100] };
}

// ------------------------------------------------------------ Rozstrzyganie
function tieDone(U, tie) {
  const ms = tie.legs.map((id) => U.matches[id]);
  if (!ms.every((m) => m.played)) return false;
  if (ms.length === 1) {
    const m = ms[0]; const [g0, g1] = m.result.score;
    const homeWins = g0 > g1 || (g0 === g1 && m.result.shootout && m.result.shootout[0] > m.result.shootout[1]);
    tie.winner = homeWins ? m.home : m.away; tie.loser = homeWins ? m.away : m.home;
    tie.agg = [g0, g1];
  } else {
    const [m1, m2] = ms;
    const aggA = m1.result.score[0] + m2.result.score[1];
    const aggB = m1.result.score[1] + m2.result.score[0];
    let aWins = aggA > aggB;
    if (aggA === aggB) aWins = !!m2.result.shootout && m2.result.shootout[1] > m2.result.shootout[0];
    tie.winner = aWins ? tie.a : tie.b; tie.loser = aWins ? tie.b : tie.a;
    tie.agg = [aggA, aggB];
    tie.shootout = m2.result.shootout ? [m2.result.shootout[1], m2.result.shootout[0]] : null;
  }
  return true;
}

function updateRoundsDone(U) {
  for (const comp of UCOMPS) {
    for (const r of ORDER[comp]) {
      const R = roundObj(U, comp, r);
      if (!R.drawn || R.done) continue;
      if (r === 'league') {
        R.done = U.comps[comp].league.matches.every((id) => U.matches[id].played);
      } else {
        R.done = R.ties.every((t) => t.winner || tieDone(U, t));
        if (R.done && r === 'F') U.comps[comp].champion = R.ties[0].winner;
      }
    }
  }
}

/** Ustawia dane rewanżu (wynik 1. meczu) dla meczów czekających. */
export function firstLegFor(U, m) {
  if (m.leg !== 2) return null;
  const m1 = U.matches[m.id.replace(/-2$/, '-1')];
  if (!m1?.played) return null;
  return [m1.result.score[1], m1.result.score[0]]; // obecny gospodarz był gościem w 1. meczu
}

// ------------------------------------------------------------ Punkty do rankingu krajów (sezon)
function addCountryPoints(U, m) {
  const [g0, g1] = m.result.score;
  const q = ['Q1', 'Q2', 'Q3', 'PO'].includes(m.round);
  const win = q ? 1 : 2; const draw = q ? 0.5 : 1;
  for (const [id, gf, ga] of [[m.home, g0, g1], [m.away, g1, g0]]) {
    const c = countryOf(id);
    const pts = gf > ga ? win : gf === ga ? draw : 0;
    U.countryPts[c] = Math.round(((U.countryPts[c] ?? 0) + pts) * 100) / 100;
  }
}

/** Zapis wyniku meczu pucharowego (z szybkiego modelu albo z meczu polskiego klubu). */
export function recordResult(U, id, result, scorers = []) {
  const m = U.matches[id];
  if (!m || m.played) return;
  m.played = true;
  m.result = { score: [...result.score], extraTime: !!result.extraTime, shootout: result.shootout ?? null };
  for (const s of scorers) {
    const k = `${m.comp}:${s.id}`;
    const row = U.scorers[k] ?? (U.scorers[k] = { id: s.id, name: s.name, club: s.club, comp: m.comp, g: 0 });
    row.g++;
  }
  addCountryPoints(U, m);
}

/** Lista meczów dnia (wszystkie rozgrywki). */
export function matchesOn(U, date) { return Object.values(U.matches).filter((m) => m.date === date); }

/**
 * Dzień UEFA: rozstrzyga zakończone dwumecze, robi losowania gotowych rund, gra mecze dnia bez polskich klubów.
 * isPolish(id): czy klub ma kadrę w grze (te mecze gra kalendarz krajowy). scorersFor(clubId, n, rng): strzelcy.
 * Zwraca { draws, played } do wiadomości i lustrzanych meczów.
 */
export function uefaDay(U, date, { isPolish, scorersFor }) {
  updateRoundsDone(U);
  const draws = [];
  for (let pass = 0; pass < 3; pass++) {
    for (const comp of UCOMPS) {
      for (const r of ORDER[comp]) if (readyToDraw(U, comp, r, date)) draws.push(doDraw(U, comp, r, date));
    }
  }
  const rng = new Rng(`uefa-dzien:${U.seed}:${date}`);
  const played = [];
  for (const m of matchesOn(U, date)) {
    if (m.played || isPolish(m.home) || isPolish(m.away)) continue;
    const ko = m.round === 'F' ? { knockout: true, neutral: true } : m.leg === 2 ? { firstLeg: firstLegFor(U, m) } : {};
    const res = simByStrength(m.home, m.away, rng, ko);
    const sc = [...scorersFor(m.home, res.score[0], rng), ...scorersFor(m.away, res.score[1], rng)];
    recordResult(U, m.id, res, sc);
    played.push(m);
  }
  updateRoundsDone(U);
  return { draws, played };
}

/** Niezmienniki kalendarza UEFA (test): każda drużyna raz na kolejkę, rundy po kolei, daty z konfiguracji. */
export function checkUefa(U) {
  const errors = [];
  for (const comp of UCOMPS) {
    const L = U.comps[comp].league;
    if (L) {
      if (L.teams.length !== 36) errors.push(`${comp}: faza ligowa ma ${L.teams.length} drużyn`);
      const nMd = datesOf(comp, 'league').length;
      for (const t of L.teams) {
        const ms = L.matches.map((id) => U.matches[id]).filter((m) => m.home === t || m.away === t);
        if (ms.length !== nMd) errors.push(`${comp}: ${t} ma ${ms.length} meczów`);
        if (new Set(ms.map((m) => m.md)).size !== nMd) errors.push(`${comp}: ${t} gra dwa razy w kolejce`);
        const home = ms.filter((m) => m.home === t).length;
        if (home !== nMd / 2) errors.push(`${comp}: ${t} ma ${home} meczów u siebie`);
        if (ms.some((m) => countryOf(m.home) === countryOf(m.away))) errors.push(`${comp}: ${t} gra z klubem z tego samego kraju`);
        const per = {};
        for (const m of ms) { const c = countryOf(m.home === t ? m.away : m.home); per[c] = (per[c] ?? 0) + 1; }
        if (Object.values(per).some((n) => n > 2)) errors.push(`${comp}: ${t} ma ponad 2 rywali z jednego kraju`);
      }
    }
    for (const r of ORDER[comp]) {
      const R = roundObj(U, comp, r);
      if (!R.drawn) continue;
      for (const [c, fr] of feedersOf(comp, r)) {
        if (R.drawDate <= lastDateOf(c, fr)) errors.push(`${comp} ${r}: losowanie przed końcem ${c} ${fr}`);
      }
      if (R.drawDate >= firstDateOf(comp, r)) errors.push(`${comp} ${r}: losowanie po pierwszym meczu`);
      const ids = r === 'league' ? (L?.matches ?? []) : R.ties.flatMap((t) => t.legs);
      for (const id of ids) {
        const m = U.matches[id];
        if (!datesOf(comp, r).includes(m.date)) errors.push(`${m.id}: data ${m.date} spoza kalendarza UEFA`);
      }
      if (r !== 'league') {
        const teams = R.ties.flatMap((t) => [t.a, t.b]);
        if (new Set(teams).size !== teams.length) errors.push(`${comp} ${r}: drużyna w dwóch parach`);
      }
    }
  }
  const all = new Map();
  for (const m of Object.values(U.matches)) for (const t of [m.home, m.away]) { if (!all.has(t)) all.set(t, []); all.get(t).push(m.date); }
  for (const [t, ds] of all) {
    ds.sort();
    for (let i = 1; i < ds.length; i++) {
      if ((new Date(ds[i]) - new Date(ds[i - 1])) / 86400000 < 2) errors.push(`${t}: mecze ${ds[i - 1]} i ${ds[i]}`);
    }
  }
  return errors;
}

/** Wszystkie rundy, w których klub brał udział (do ekranu klubu i wiadomości). */
export function clubPath(U, clubId) {
  const out = [];
  for (const comp of UCOMPS) {
    for (const r of ORDER[comp]) {
      const R = roundObj(U, comp, r);
      if (r === 'league' && U.comps[comp].league?.teams.includes(clubId)) out.push({ comp, round: r });
      else if (R.ties.some((t) => t.a === clubId || t.b === clubId)) out.push({ comp, round: r, tie: R.ties.find((t) => t.a === clubId || t.b === clubId) });
    }
  }
  return out;
}
