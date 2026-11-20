// Współczynniki UEFA (5 sezonów) klubów i krajów: dane z rankingu UEFA (src/data/ranking_uefa.json, sezony
// 2022/23-2025/26) i wyniki z gry (od sezonu 2026/27). Zasady UEFA od 2024/25 (docs/kluby_uefa.md, rozdz. Ranking UEFA):
//  - współczynnik klubu = max(suma własnych punktów z 5 sezonów, 20 % pięcioletniego współczynnika jego kraju);
//  - współczynnik kraju = suma 5 współczynników sezonowych; sezon = punkty wszystkich klubów kraju podzielone przez
//    liczbę klubów kraju w pucharach (obcięte do 3 miejsc po przecinku);
//  - mecz: zwycięstwo 2 pkt, remis 1 pkt; w eliminacjach (Q1-PO) połowa i tylko dla kraju;
//  - klub odpadły w eliminacjach dostaje stałe punkty za ostatnią przegraną rundę (tylko klub, nie kraj);
//  - premie za fazę ligową i fazę pucharową (BONUS niżej) liczą się klubowi i krajowi.
// Zapis: game.uefaCoef = { v, seasons: ['2022/23', ...], clubs: { id: [5] }, countries: { kod: [5] }, prev }.
// Ostatni sezon okna to sezon bieżący: w trakcie liczony na żywo z game.season.uefa, zapisywany przy końcu sezonu
// (closeSeason), potem okno przesuwa się o rok (shiftWindow). prev: sezon, który właśnie wypadł z okna (potrzebny do
// rankingu po poprzednim sezonie: rozstawienia w bieżącym sezonie, lista dostępu w następnym).
// Współczynniki nie zmieniają siły drużyn (L), tylko rozstawienia, przydział miejsc i rankingi.

import RANK from '../data/ranking_uefa.json' with { type: 'json' };
import { UCOMPS, ORDER, leagueTable, countryOf, setCoefSource, COUNTRY_NAMES } from './uefa.js';

export const QUAL_ROUNDS = ['Q1', 'Q2', 'Q3', 'PO'];
/**
 * Punkty premiowe (system UEFA od 2024/25). Pewne z danych właściciela (plik rankingu, sezon 2026/27 w trakcie):
 * udział w fazie ligowej LM 6 pkt (PSG i Real po 4 kolejkach 14 pkt), brak premii za sam udział w LE i LK (Lech 1 pkt
 * po remisie, Ararat-Armenia 0), stałe punkty klubów odpadłych w eliminacjach (Valletta Q2 1,5, GKS Q3 2,0,
 * Raków i Górnik PO 2,5), punkty z eliminacji tylko dla kraju (Polska 3,600 = 18 pkt / 5 klubów).
 * [SZAC] dopasowane do sezonu 2024/25 z pliku (Liverpool 29,5, Barcelona 36,25, Arsenal 36, Inter 40,25, PSG 33,5,
 * Man Utd 32,5, Tottenham 32,25, Chelsea 30): miejsca 1-8 fazy ligowej (25 - miejsce) * 0,25 pkt i premia za
 * bezpośredni awans do 1/8; premia za 1/4, 1/2 i finał: LM 1,5, LE 1, LK 0. Klub z baraży nie dostaje premii za 1/8.
 */
export const BONUS = {
  league: { LM: 6, LE: 0, LK: 0 },
  top8: (pos) => (25 - pos) * 0.25,
  round: { LM: 1.5, LE: 1, LK: 0 },
  qualOut: { Q1: 1, Q2: 1.5, Q3: 2, PO: 2.5 },
};
/** Punkty kraju za klub spoza symulacji (odpada w eliminacjach: zwykle jedno zwycięstwo albo dwa remisy) [SZAC]. */
export const GHOST_PTS = 1;
/** Przegrany dwumecz z przejściem do innych rozgrywek (regulamin UEFA, jak w europe.js). */
const DROPS = new Set(['LM:Q1', 'LM:Q2', 'LM:Q3', 'LM:PO', 'LE:Q3', 'LE:PO']);
/** Kraje zawieszone przez UEFA: bez punktów w kolejnych sezonach. */
export const SUSPENDED = new Set(Object.entries(RANK.countries).filter(([, c]) => c.seasons[4] == null).map(([k]) => k));
/**
 * Pierwszy przydział miejsc w grze (sezon 2027/28) wynika z rankingu po sezonie 2025/26 (okno 2021/22-2025/26);
 * plik nie ma sezonu 2021/22, więc pozycja Polski z danych: 12. miejsce (docs/ekspert_sedzia.md, B6; docs/sila-lig-europy.md).
 */
export const ACCESS_RANK_FALLBACK = { season: '2025/26', POL: 12 };

export const RANKING_DATA = RANK;
export const COUNTRY_LABELS = Object.fromEntries(Object.entries(RANK.countries).map(([k, c]) => [k, c.name]));
for (const [k, v] of Object.entries(COUNTRY_NAMES)) COUNTRY_LABELS[k] ??= v;

const r3 = (x) => Math.round(x * 1000) / 1000;
const trunc3 = (x) => Math.floor(x * 1000 + 1e-6) / 1000;
const sum = (arr) => r3(arr.reduce((a, b) => a + (b ?? 0), 0));
export const nextSeasonLabel = (s) => { const y = Number(s.slice(0, 4)) + 1; return `${y}/${String((y + 1) % 100).padStart(2, '0')}`; };

// ------------------------------------------------------------ Punkty sezonu z rozgrywek w grze
const cache = new WeakMap();

/**
 * Punkty sezonu: { clubs: Map(id -> pkt), countries: Map(kod -> współczynnik sezonowy), entrants: Map(kod -> liczba
 * klubów), alive: Map(kod -> kluby jeszcze w grze) }. Kraj bez klubów w grze nie ma wartości (fallback w closeSeason).
 */
export function seasonPoints(U) {
  if (!U) return { clubs: new Map(), countries: new Map(), entrants: new Map(), alive: new Map(), raw: new Map() };
  const played = Object.values(U.matches).reduce((n, m) => n + (m.played ? 1 : 0), 0);
  const drawn = UCOMPS.reduce((n, c) => n + ORDER[c].filter((r) => U.comps[c].rounds[r].drawn).length, 0);
  const sig = `${played}:${drawn}`;
  const hit = cache.get(U);
  if (hit?.sig === sig) return hit.res;
  const club = new Map(); const nat = new Map();
  const add = (map, k, v) => { if (v) map.set(k, (map.get(k) ?? 0) + v); };
  const both = (id, v) => { add(club, id, v); add(nat, countryOf(id), v); };
  // Kluby w pucharach (wejścia bezpośrednie do wszystkich rund i rozgrywek)
  const clubs = new Set();
  for (const c of UCOMPS) for (const r of ORDER[c]) for (const id of U.comps[c].rounds[r].entrants) clubs.add(id);
  for (const id of clubs) if (!club.has(id)) club.set(id, 0);
  // Mecze
  for (const m of Object.values(U.matches)) {
    if (!m.played) continue;
    const q = QUAL_ROUNDS.includes(m.round);
    const [a, b] = m.result.score;
    for (const [id, gf, ga] of [[m.home, a, b], [m.away, b, a]]) {
      const p = gf > ga ? 2 : gf === ga ? 1 : 0;
      if (q) add(nat, countryOf(id), p / 2);
      else both(id, p);
    }
  }
  // Premie: faza ligowa, miejsca 1-8, kolejne rundy fazy pucharowej
  const inLeague = new Set();
  for (const c of UCOMPS) {
    const L = U.comps[c].league;
    if (!L) continue;
    for (const id of L.teams) { inLeague.add(id); both(id, BONUS.league[c]); }
    if (U.comps[c].rounds.league.done) for (const row of leagueTable(U, c).slice(0, 8)) both(row.id, BONUS.top8(row.pos) + BONUS.round[c]);
    for (const r of ['QF', 'SF', 'F']) for (const id of U.comps[c].rounds[r].teams ?? []) both(id, BONUS.round[c]);
  }
  // Odpadli w eliminacjach (bez fazy ligowej): punkty za ostatnią przegraną rundę, tylko klub
  const out = new Set();
  const lostQ = new Map();
  for (const c of UCOMPS) {
    for (const r of ORDER[c]) {
      const R = U.comps[c].rounds[r];
      for (const t of R.ties) {
        if (!t.loser) continue;
        if (QUAL_ROUNDS.includes(r) && QUAL_ROUNDS.indexOf(r) >= QUAL_ROUNDS.indexOf(lostQ.get(t.loser) ?? 'Q1')) lostQ.set(t.loser, r);
        if (!DROPS.has(`${c}:${r}`)) out.add(t.loser);
      }
    }
    if (U.comps[c].rounds.league.done) for (const row of leagueTable(U, c).slice(24)) out.add(row.id);
  }
  for (const [id, r] of lostQ) if (!inLeague.has(id)) add(club, id, BONUS.qualOut[r]);
  // Współczynnik sezonowy kraju: punkty / liczba klubów
  const entrants = new Map(); const alive = new Map();
  for (const id of clubs) {
    const cc = countryOf(id);
    entrants.set(cc, (entrants.get(cc) ?? 0) + 1);
    if (!out.has(id)) alive.set(cc, (alive.get(cc) ?? 0) + 1);
  }
  // Gra symuluje tylko część klubów małych i średnich federacji (156 zagranicznych zamiast ok. 230). Dzielnik to
  // prawdziwa liczba klubów kraju w pucharach (plik UEFA, kolumna „Kluby 26/27”); brakujące kluby to słabsze kluby,
  // które w rzeczywistości odpadają w eliminacjach: po GHOST_PTS pkt kraju każdy [SZAC]. Bez tego kraj z jednym
  // klubem w grze dostawałby pełne punkty tego klubu (np. Islandia 11,5 za sezon) i rósłby w rankingu.
  const countries = new Map([...entrants].map(([cc, n]) => {
    const real = Math.max(n, RANK.countries[cc]?.entrants ?? 0);
    return [cc, trunc3(((nat.get(cc) ?? 0) + (real - n) * GHOST_PTS) / real)];
  }));
  for (const [cc, n] of entrants) entrants.set(cc, Math.max(n, RANK.countries[cc]?.entrants ?? 0));
  for (const [k, v] of club) club.set(k, r3(v));
  const res = { clubs: club, countries, entrants, alive, raw: nat };
  cache.set(U, { sig, res });
  return res;
}

// ------------------------------------------------------------ Stan w zapisie
/** Okno na start gry: sezony 2022/23-2025/26 z pliku, sezon 2026/27 z gry (pusty). */
export function initialCoef() {
  const clubs = {}; const countries = {};
  for (const [k, c] of Object.entries(RANK.clubs)) clubs[k] = [...c.seasons.slice(0, 4), null];
  for (const [k, c] of Object.entries(RANK.countries)) countries[k] = [...c.seasons.slice(0, 4), null];
  return { v: 1, seasons: [...RANK.meta.sezony], clubs, countries, prev: null };
}

/** Okno z zapisu albo startowe (bez zmiany gry, np. do widoku w sezonie 2026/27). */
export const coefState = (game) => game?.uefaCoef ?? initialCoef();

/**
 * Stare zapisy: okno startowe i przesunięcia za sezony rozegrane przed wprowadzeniem współczynników. Sezon 2026/27
 * spoza zapisu (puchary sezonu już zastąpione nowymi): punkty z pliku UEFA (stan Nov 5, 2026) [uproszczenie];
 * późniejsze sezony bez wyników: kraje średnią z okna, kluby bez punktów.
 */
export function ensureUefaCoef(game) {
  if (!game) return null;
  if (!game.uefaCoef) {
    const C = initialCoef();
    const year = game.seasonYear ?? 2026;
    for (let y = 2026; y < year; y++) {
      const label = C.seasons[4];
      if (label === '2026/27') {
        for (const [k, c] of Object.entries(RANK.clubs)) if (c.seasons[4] != null) (C.clubs[k] ??= [null, null, null, null, null])[4] = c.seasons[4];
        for (const [k, c] of Object.entries(RANK.countries)) C.countries[k][4] = c.seasons[4];
      } else {
        fillCountryFallback(C);
      }
      shiftWindow(C);
    }
    game.uefaCoef = C;
  }
  applyCoefSource(game);
  return game.uefaCoef;
}

/** Kraj bez klubów w pucharach w grze: średnia z czterech wcześniejszych sezonów okna [SZAC]; zawieszony: brak. */
function fillCountryFallback(C) {
  for (const [cc, arr] of Object.entries(C.countries)) {
    if (arr[4] != null || SUSPENDED.has(cc)) continue;
    const xs = arr.slice(0, 4).filter((x) => x != null);
    arr[4] = xs.length ? trunc3(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  }
}

/** Koniec sezonu: punkty bieżącego sezonu z rozgrywek w grze trafiają do ostatniej kolumny okna. */
export function closeSeason(C, U) {
  const S = seasonPoints(U);
  for (const [id, v] of S.clubs) (C.clubs[id] ??= [null, null, null, null, null])[4] = v;
  for (const [cc, v] of S.countries) if (!SUSPENDED.has(cc)) (C.countries[cc] ??= [null, null, null, null, null])[4] = v;
  fillCountryFallback(C);
  return C;
}

/** Przesunięcie okna o rok: najstarszy sezon do prev, nowy sezon (pusty) na końcu. */
export function shiftWindow(C) {
  const pick = (obj) => Object.fromEntries(Object.entries(obj).filter(([, a]) => a[0] != null).map(([k, a]) => [k, a[0]]));
  C.prev = { season: C.seasons[0], clubs: pick(C.clubs), countries: pick(C.countries) };
  C.seasons = [...C.seasons.slice(1), nextSeasonLabel(C.seasons[4])];
  for (const obj of [C.clubs, C.countries]) {
    for (const [k, a] of Object.entries(obj)) {
      obj[k] = [...a.slice(1), null];
      if (obj === C.clubs && obj[k].every((x) => x == null) && !RANK.clubs[k]) delete obj[k];
    }
  }
  return C;
}

// ------------------------------------------------------------ Współczynniki i rankingi
/** Suma kraju i współczynniki klubów dla wartości sezonów (tablice po 5; null = brak). */
export function computeCoefs(clubVals, countryVals) {
  const totals = new Map(Object.entries(countryVals).map(([cc, a]) => [cc, sum(a)]));
  const threshold = (cc) => trunc3(0.2 * (totals.get(cc) ?? 0));
  const clubs = new Map();
  for (const [k, a] of Object.entries(clubVals)) {
    const cc = RANK.clubs[k]?.country ?? countryOf(k);
    const own = sum(a);
    clubs.set(k, { own, threshold: threshold(cc), coef: Math.max(own, threshold(cc)), country: cc });
  }
  return { totals, clubs, threshold };
}

/** Wartości okna z bieżącym sezonem liczonym na żywo (gdy U podane) albo zerowym (start sezonu). */
export function windowValues(C, U, { live = true } = {}) {
  const S = live && U ? seasonPoints(U) : null;
  const clubs = {}; const countries = {};
  for (const [k, a] of Object.entries(C.clubs)) clubs[k] = [...a.slice(0, 4), S ? S.clubs.get(k) ?? a[4] ?? null : a[4] ?? null];
  if (S) for (const [k, v] of S.clubs) clubs[k] ??= [null, null, null, null, v];
  for (const [k, a] of Object.entries(C.countries)) countries[k] = [...a.slice(0, 4), S ? (SUSPENDED.has(k) ? null : S.countries.get(k) ?? a[4] ?? null) : a[4] ?? null];
  if (S) for (const [k, v] of S.countries) countries[k] ??= [null, null, null, null, v];
  return { clubs, countries };
}

/** Ranking po poprzednim sezonie: sezon, który wypadł z okna, i cztery zakończone sezony (bez bieżącego). */
export function startWindowValues(C) {
  if (!C.prev) return null;
  const clubs = {}; const countries = {};
  const keys = new Set([...Object.keys(C.clubs), ...Object.keys(C.prev.clubs)]);
  for (const k of keys) clubs[k] = [C.prev.clubs[k] ?? null, ...(C.clubs[k] ?? [null, null, null, null]).slice(0, 4)];
  for (const k of new Set([...Object.keys(C.countries), ...Object.keys(C.prev.countries)])) countries[k] = [C.prev.countries[k] ?? null, ...(C.countries[k] ?? [null, null, null, null]).slice(0, 4)];
  return { clubs, countries };
}

/** Kolejność krajów: suma, potem ostatni sezon (jak UEFA). */
export function rankCountries(countryVals, totals) {
  return Object.keys(countryVals).sort((a, b) => totals.get(b) - totals.get(a) || (countryVals[b][4] ?? 0) - (countryVals[a][4] ?? 0) || a.localeCompare(b));
}

/** Pozycja Polski (albo innego kraju) w rankingu z podanych wartości. */
export function countryRank(countryVals, cc = 'POL') {
  const { totals } = computeCoefs({}, countryVals);
  return rankCountries(countryVals, totals).indexOf(cc) + 1;
}

/** Ustawia źródło współczynników do rozstawień (uefa.js): ranking po poprzednim sezonie albo dane startowe. */
export function applyCoefSource(game) {
  const W = game?.uefaCoef ? startWindowValues(game.uefaCoef) : null;
  if (!W) { setCoefSource(null); return; }
  const { totals, clubs } = computeCoefs(W.clubs, W.countries);
  setCoefSource({ clubs: new Map([...clubs].map(([k, v]) => [k, v.coef])), countries: totals });
}

/**
 * Pozycja Polski do listy dostępu na sezon po bieżącym: UEFA dzieli miejsca w sezonie N wg rankingu po sezonie N-2,
 * czyli rankingu z początku kończącego się sezonu (prev + 4 zakończone sezony okna).
 */
export function accessRankForNext(C) {
  const W = startWindowValues(C);
  if (!W) return { rank: ACCESS_RANK_FALLBACK.POL, season: ACCESS_RANK_FALLBACK.season, coef: null };
  const { totals } = computeCoefs({}, W.countries);
  return { rank: countryRank(W.countries), season: C.seasons[3], coef: totals.get('POL') ?? 0 };
}

/**
 * Tabele do widoku: kraje i kluby z pozycją teraz i na początku sezonu (bieżący sezon = 0).
 * nameOf(id): nazwa klubu w grze (polskie kluby: nazwy wyświetlane w grze); kluby spoza gry: nazwa z rankingu UEFA.
 */
export function rankingTables(game, { nameOf = null } = {}) {
  const C = coefState(game);
  const U = game?.season?.uefa ?? null;
  const now = windowValues(C, U);
  const start = windowValues(C, null, { live: false });
  for (const k of Object.keys(now.clubs)) start.clubs[k] ??= [...now.clubs[k].slice(0, 4), null];
  for (const k of Object.keys(now.countries)) start.countries[k] ??= [...now.countries[k].slice(0, 4), null];
  const A = computeCoefs(now.clubs, now.countries);
  const B = computeCoefs(start.clubs, start.countries);
  const S = seasonPoints(U);
  const cOrder = rankCountries(now.countries, A.totals);
  const cStart = rankCountries(start.countries, B.totals);
  const countries = cOrder.map((cc, i) => ({
    code: cc, name: COUNTRY_LABELS[cc] ?? cc, vals: now.countries[cc], total: A.totals.get(cc), place: i + 1, startPlace: cStart.indexOf(cc) + 1,
    clubs: S.entrants.get(cc) ?? 0, alive: S.alive.get(cc) ?? 0,
  }));
  const ord = (M, vals) => [...M.keys()].sort((a, b) => M.get(b).coef - M.get(a).coef || M.get(b).own - M.get(a).own || (vals[b][4] ?? 0) - (vals[a][4] ?? 0) || String(a).localeCompare(String(b)));
  const keep = (k) => now.clubs[k].some((x) => x != null) || RANK.clubs[k];
  const order = ord(A.clubs, now.clubs).filter(keep);
  const startOrder = ord(B.clubs, start.clubs).filter(keep);
  const clubs = order.map((k, i) => {
    const r = A.clubs.get(k);
    const inGame = !k.startsWith('x-');
    return { key: k, id: inGame ? k : null, name: (inGame && nameOf?.(k)) || RANK.clubs[k]?.name || k, country: r.country, vals: now.clubs[k], own: r.own, threshold: r.threshold, coef: r.coef, place: i + 1, startPlace: startOrder.indexOf(k) + 1 };
  });
  return { seasons: C.seasons, countries, clubs, live: !!U };
}
