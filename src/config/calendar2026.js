// Kluczowe daty sezonu 2026/27. Źródło: docs/ekspert_sedzia.md (B1-B7).
// sure: true = potwierdzone w kilku źródłach; false = pojedyncze źródło albo założenie.
// Daty UEFA i finałów są stałe (priorytet 1-2), harmonogram ligi układa się wokół nich.

export const GAME_START = '2026-07-01'; // start kariery (pierwszy sezon)
// Sezon bieżący: wartości „żywe” (ES modules), przestawiane przez setSeasonYear() na kolejne lata.
export let SEASON = '2026/27';
export let SEASON_YEAR = 2026;
export let SEASON_START = '2026-07-01';
export let SEASON_END = '2027-06-30';

export const DOMESTIC = {
  superpuchar: { date: '2026-07-17', sure: false, note: 'mistrz 2025/26 vs zdobywca PP 2025/26' },
  ekstraklasa: { start: '2026-07-24', autumnEnd: '2026-12-14', springStart: '2027-01-29', end: '2027-05-22', sure: true },
  lowerAutumnEnd: '2026-12-14',
  // 1L i 2L: start, koniec i baraże 1L ze źródeł; start wiosny i baraże 2L to założenia.
  liga1: { start: '2026-07-24', springStart: '2027-02-26', end: '2027-05-29', playoffSemis: '2027-06-03', playoffFinal: '2027-06-06', sure: false },
  liga2: { start: '2026-07-24', springStart: '2027-03-05', end: '2027-05-29', playoffSemis: '2027-06-02', playoffFinal: '2027-06-05', sure: false },
  pucharPolski: {
    rounds: [
      { id: 'PRE', date: '2026-08-05', window: ['2026-08-04', '2026-08-06'], sure: false },
      { id: 'R64', date: '2026-09-02', window: ['2026-09-01', '2026-09-03'], sure: true },
      { id: 'R32', date: '2026-10-28', window: ['2026-10-27', '2026-10-29'], sure: true },
      { id: 'R16', date: '2026-12-02', window: ['2026-12-01', '2026-12-03'], sure: true },
      { id: 'QF', date: '2027-03-03', window: ['2027-03-02', '2027-03-04'], sure: true },
      { id: 'SF', date: '2027-04-07', window: ['2027-04-06', '2027-04-08'], sure: true },
      { id: 'F', date: '2027-05-02', window: ['2027-05-02', '2027-05-02'], sure: true, venue: 'PGE Narodowy' },
    ],
  },
  transferWindows: [
    { from: '2026-07-01', to: '2026-09-01', sure: false },
    { from: '2027-02-01', to: '2027-02-26', sure: false },
  ],
};

// Dni meczowe UEFA. Każdy wpis: [pierwszy mecz, rewanż] albo jedna data.
export const UEFA = {
  LM: {
    Q1: ['2026-07-08', '2026-07-15'], Q2: ['2026-07-22', '2026-07-29'], Q3: ['2026-08-05', '2026-08-11'],
    PO: ['2026-08-19', '2026-08-26'],
    // 2. kolejka: Oct 14 (źródła podawały Sep 30 albo Oct 13-14; Sep 30 wypada w połączonym oknie FIFA Sep 21 - Oct 6).
    league: ['2026-09-09', '2026-10-14', '2026-10-21', '2026-11-04', '2026-11-25', '2026-12-09', '2027-01-20', '2027-01-27'],
    KPO: ['2027-02-17', '2027-02-24'], R16: ['2027-03-10', '2027-03-17'], QF: ['2027-04-07', '2027-04-14'],
    SF: ['2027-04-28', '2027-05-05'], F: '2027-06-05',
  },
  LE: {
    // Q1/Q2 LE nie zostały potwierdzone w źródłach; polski klub wchodzi od Q3, przegrani LM Q2 też trafiają do LE Q3.
    Q3: ['2026-08-06', '2026-08-13'],
    PO: ['2026-08-20', '2026-08-27'],
    league: ['2026-09-17', '2026-10-15', '2026-10-22', '2026-11-05', '2026-11-26', '2026-12-10', '2027-01-21', '2027-01-28'],
    KPO: ['2027-02-18', '2027-02-25'], R16: ['2027-03-11', '2027-03-18'], QF: ['2027-04-08', '2027-04-15'],
    SF: ['2027-04-29', '2027-05-06'], F: '2027-05-26',
  },
  LK: {
    Q1: ['2026-07-09', '2026-07-16'], Q2: ['2026-07-23', '2026-07-30'], Q3: ['2026-08-06', '2026-08-13'],
    PO: ['2026-08-20', '2026-08-27'],
    league: ['2026-10-15', '2026-10-22', '2026-11-05', '2026-11-26', '2026-12-10', '2026-12-17'],
    KPO: ['2027-02-18', '2027-02-25'], R16: ['2027-03-11', '2027-03-18'], QF: ['2027-04-08', '2027-04-15'],
    SF: ['2027-04-29', '2027-05-06'], F: '2027-06-02',
  },
};

// Polskie kluby w pucharach 2026/27 (wg raportu sędziego, weryfikuje agent UEFA).
export const POLISH_EUROPE_2026 = [
  { club: 'lech', comp: 'LM', entry: 'Q2', path: 'champions' },
  { club: 'gornik-zabrze', comp: 'LM', entry: 'Q2', path: 'league' },
  { club: 'jagiellonia', comp: 'LE', entry: 'Q3' },
  { club: 'rakow', comp: 'LK', entry: 'Q2' },
  { club: 'gks-katowice', comp: 'LK', entry: 'Q2' },
];

// Okna FIFA 2026/27 (docs/reprezentacje.md). Ekstraklasa w nich nie gra; 1L i 2L wg terminarza.
export const FIFA_WINDOWS = [
  { from: '2026-09-21', to: '2026-10-06', matches: 4, sure: true, note: 'połączone okno, LN kolejki 1-4' },
  { from: '2026-11-09', to: '2026-11-17', matches: 2, sure: true, note: 'LN kolejki 5-6' },
  { from: '2027-03-22', to: '2027-03-30', matches: 2, sure: false, note: 'ćwierćfinały i baraże LN, eliminacje Euro 2028' },
  { from: '2027-06-07', to: '2027-06-15', matches: 2, sure: false, note: 'finały LN, eliminacje Euro 2028' },
];

export const inFifaWindow = (iso) => FIFA_WINDOWS.some((w) => iso >= w.from && iso <= w.to);

// ------------------------------------------------------------ Kolejne sezony
// Daty sezonu 2026/27 są wzorcem. Kolejny sezon to przesunięcie o pełne tygodnie (te same dni tygodnia),
// okna FIFA z danych reprezentacji (docs/reprezentacje.md), polskie kluby w pucharach z europeAccess.
const BASE = JSON.parse(JSON.stringify({ DOMESTIC, UEFA, POLISH_EUROPE_2026, FIFA_WINDOWS }));
const shiftIso = (iso, days) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
function shiftDeep(v, days) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return shiftIso(v, days);
  if (Array.isArray(v)) return v.map((x) => shiftDeep(x, days));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shiftDeep(x, days)]));
  return v;
}
const replaceContents = (target, src) => { for (const k of Object.keys(target)) delete target[k]; Object.assign(target, src); };

/**
 * Ustawia kalendarz sezonu rozpoczynającego się w roku y. windows: okna FIFA z danych reprezentacji
 * [{ from, to, matches }]; polishEurope: [{ club, comp, entry, path? }] (z kwalifikacji po poprzednim sezonie).
 */
export function setSeasonYear(y, { windows = null, polishEurope = null } = {}) {
  const k = y - 2026;
  const days = 7 * Math.round((365.2425 * k) / 7);
  SEASON_YEAR = y;
  SEASON = `${y}/${String(y + 1).slice(2)}`;
  SEASON_START = `${y}-07-01`;
  SEASON_END = `${y + 1}-06-30`;
  replaceContents(DOMESTIC, shiftDeep(BASE.DOMESTIC, days));
  replaceContents(UEFA, shiftDeep(BASE.UEFA, days));
  const fifa = k === 0 ? BASE.FIFA_WINDOWS : (windows ?? shiftDeep(BASE.FIFA_WINDOWS, days)).filter((w) => w.from >= SEASON_START && w.to <= SEASON_END && w.matches);
  FIFA_WINDOWS.length = 0; FIFA_WINDOWS.push(...fifa.map((w) => ({ sure: false, note: '', ...w })));
  POLISH_EUROPE_2026.length = 0; POLISH_EUROPE_2026.push(...(k === 0 && !polishEurope ? BASE.POLISH_EUROPE_2026 : polishEurope ?? []));
}
