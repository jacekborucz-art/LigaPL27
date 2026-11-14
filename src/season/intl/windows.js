// Okna FIFA i okresy turniejów reprezentacji na dowolny rok (docs/kalendarz-reprezentacji.md).
// Lata do 2030: daty z danych (src/data/reprezentacje.json, oknaFIFA). Później: wzorzec sezonu 2026/27
// przesunięty o pełne tygodnie, tak samo jak kalendarz ligi i pucharów UEFA (setSeasonYear), więc okna
// zawsze wypadają w tych samych miejscach względem kolejek ligowych i meczów pucharów.
//
// Rok nieparzysty: marzec (2 mecze), czerwiec (2), wrzesień-październik (4), listopad (2).
// Rok parzysty (turniej): marzec (2, baraże), przełom maja i czerwca (2 sparingi), turniej w VI-VII,
// wrzesień-październik (4), listopad (2). Rok podzielny przez 4: Euro; pozostałe parzyste: mistrzostwa świata.

import DATA from '../../data/reprezentacje.json' with { type: 'json' };

export const REAL_UNTIL = 2030;
export function addDaysIso(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dowIso = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 niedziela, 1 poniedziałek
/** Przesunięcie kalendarza o k lat w pełnych tygodniach (identyczne z setSeasonYear w calendar2026.js). */
export const weekShift = (k) => 7 * Math.round((365.2425 * k) / 7);
/** Turniej finałowy roku: EURO (rok podzielny przez 4), WC (pozostałe parzyste), null (nieparzyste). */
export const tournamentOf = (y) => (y % 2 ? null : y % 4 === 0 ? 'EURO' : 'WC');
export const TOUR_LEN = { EURO: 31, WC: 39 };

const TOUR_GEN = (y) => (tournamentOf(y) === 'EURO' ? `Euro ${y}` : `mistrzostw świata ${y}`);
const TOUR_INS = (y) => (tournamentOf(y) === 'EURO' ? `Euro ${y}` : `mistrzostwami świata ${y}`);
const LN_NAME = (y) => `Liga Narodów ${y}/${String(y + 1).slice(2)}`;

function noteFor(kind, y) {
  if (y % 2 === 0) {
    if (kind === 'mar') return `baraże ${TOUR_GEN(y)}, mecze towarzyskie`;
    if (kind === 'prep') return `mecze towarzyskie przed ${TOUR_INS(y)}`;
    if (kind === 'tour') return tournamentOf(y) === 'EURO' ? `Euro ${y}` : `mistrzostwa świata ${y}`;
    if (kind === 'sepoct') return `${LN_NAME(y)}, kolejki 1-4`;
    if (kind === 'nov') return `${LN_NAME(y)}, kolejki 5-6`;
  }
  const q = `eliminacje ${TOUR_GEN(y + 1)}`;
  if (kind === 'mar') return `ćwierćfinały i baraże Ligi Narodów, ${q}`;
  if (kind === 'jun') return `finały Ligi Narodów, ${q}`;
  return q;
}

// Wzorzec: [pierwszy dzień (poniedziałek), długość - 1, mecze, rok bazowy wzorca]
const BASE = { mar: ['2027-03-22', 8, 2, 2027], jun: ['2027-06-07', 8, 2, 2027], sepoct: ['2026-09-21', 15, 4, 2026], nov: ['2026-11-09', 8, 2, 2026] };
const KIND_ORDER = ['mar', 'jun', 'prep', 'tour', 'sepoct', 'nov'];

function generated(y) {
  const w = {};
  for (const [kind, [from, len, matches, by]] of Object.entries(BASE)) {
    const f = addDaysIso(from, weekShift(y - by));
    w[kind] = { from: f, to: addDaysIso(f, len), matches, kind };
  }
  const t = tournamentOf(y);
  if (t) {
    const prepFrom = addDaysIso(w.jun.from, -7);
    w.prep = { from: prepFrom, to: addDaysIso(prepFrom, 8), matches: 2, kind: 'prep' };
    delete w.jun;
    const start = addDaysIso(w.prep.to, t === 'EURO' ? 3 : 2);
    w.tour = { from: start, to: addDaysIso(start, TOUR_LEN[t] - 1), matches: null, kind: 'tour', tour: t };
  }
  return Object.values(w);
}

// Dane do 2030: okna ze źródeł. Okna oznaczone w danych jako „szacunek wg wzorca” zastępuje wzorzec gry
// (te same dni co kalendarz ligi i UEFA przesunięty o pełne tygodnie), żeby nie kolidowały z meczami pucharów.
function real(y) {
  const out = [];
  for (const o of DATA.oknaFIFA) {
    if (!o.od.startsWith(String(y)) || /^Szacunek wg wzorca/i.test(o.uwagi ?? '')) continue;
    const m = Number(o.od.slice(5, 7));
    const kind = o.mecze == null ? 'tour' : m <= 4 ? 'mar' : m <= 7 ? (y % 2 ? 'jun' : 'prep') : m <= 10 ? 'sepoct' : 'nov';
    out.push({ from: o.od, to: o.do, matches: o.mecze, kind, ...(kind === 'tour' ? { tour: tournamentOf(y) } : {}), real: true });
  }
  const tour = out.find((w) => w.kind === 'tour');
  for (const g of generated(y)) {
    if (out.some((w) => w.kind === g.kind) || (tour && g.kind === 'prep')) continue;
    if (y === 2026 && g.from < '2026-07-01') continue; // przed startem gry
    out.push(g);
  }
  // Rok turniejowy bez okna sparingowego w danych (2030): poniedziałek-wtorek, koniec min. 3 dni przed turniejem [SZAC]
  if (tour && !out.some((w) => w.kind === 'prep')) {
    let to = addDaysIso(tour.from, -3);
    while (dowIso(to) !== 2) to = addDaysIso(to, -1);
    out.push({ from: addDaysIso(to, -8), to, matches: 2, kind: 'prep' });
  }
  return out;
}

const CACHE = new Map();
/** Okna FIFA i okres turnieju w roku kalendarzowym y (od 2026: tylko okna od września 2026). */
export function yearWindows(y) {
  if (CACHE.has(y)) return CACHE.get(y);
  const list = (y <= REAL_UNTIL ? real(y) : generated(y))
    .map((w) => ({ key: w.from, year: y, real: false, ...w, note: noteFor(w.kind, y) }))
    .sort((a, b) => a.from.localeCompare(b.from) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  CACHE.set(y, list);
  return list;
}
export const windowOf = (y, kind) => yearWindows(y).find((w) => w.kind === kind) ?? null;
/** Okres turnieju finałowego (Euro, MŚ) w roku y albo null. */
export const tourPeriod = (y) => windowOf(y, 'tour');

/** Okna z meczami w sezonie klubowym s (od 1 lipca s do 30 czerwca s+1) dla kalendarza ligi. */
export function seasonWindows(s) {
  const from = `${s}-07-01`; const to = `${s + 1}-06-30`;
  return [...yearWindows(s), ...yearWindows(s + 1)]
    .filter((w) => w.matches && w.from >= from && w.to <= to)
    .map((w) => ({ from: w.from, to: w.to, matches: w.matches, sure: false, note: w.note, kind: w.kind }));
}

/** Okna z meczami, które mogą mieć znaczenie w danym dniu (powołania: od 4 dni przed do końca okna). */
export function windowsNear(date) {
  const y = Number(date.slice(0, 4));
  const lo = addDaysIso(date, -45); const hi = addDaysIso(date, 10);
  return [...yearWindows(y - 1), ...yearWindows(y)].filter((w) => w.matches && w.to >= lo && w.from <= hi);
}

/** Dni meczowe okna: 4 mecze (pt, pn, pt, pn) albo 2 mecze (pt, pn). */
export function windowDays(w) {
  const off = w.matches >= 4 ? [4, 7, 11, 14] : [4, 7];
  return off.map((o) => addDaysIso(w.from, o));
}
/** Baraże jednomeczowe w oknie: półfinał w czwartek, finał we wtorek. */
export const playoffDays = (w) => [addDaysIso(w.from, 3), addDaysIso(w.from, 8)];
/** Finały Ligi Narodów w czerwcowym oknie: półfinały śr i czw, mecz o 3. miejsce i finał w niedzielę. */
export const finalFourDays = (w) => [addDaysIso(w.from, 2), addDaysIso(w.from, 3), addDaysIso(w.from, 6)];
