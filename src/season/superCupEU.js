// Superpuchar Europy: zwycięzca Ligi Mistrzów kontra zwycięzca Ligi Europy poprzedniego sezonu,
// jeden mecz w sierpniu na neutralnym, dużym stadionie w Europie, przy remisie od razu rzuty karne
// (regulamin UEFA od 2021: bez dogrywki). Szczegóły: docs/superpuchar-europy.md.
import { Rng, clamp } from '../core/rng.js';
import { anyClub } from './season.js';

/** Stadiony wyznaczone przez UEFA (prawdziwe). 2026: mecz PSG - Aston Villa, 12 sierpnia 2026, Salzburg. */
export const SUPER_CUP_EU_REAL = {
  2026: { stadium: 'Red Bull Arena', city: 'Salzburg', country: 'Austria', cap: 30000 },
  2027: { stadium: 'Johan Cruyff ArenA', city: 'Amsterdam', country: 'Holandia', cap: 55000 },
  2028: { stadium: 'Astana Arena', city: 'Astana', country: 'Kazachstan', cap: 30000 },
};

/**
 * Duże stadiony europejskie na kolejne edycje (od 2029, losowane bez powtórki w ciągu 6 lat).
 * Pojemności przybliżone (zaokrąglone do tysięcy).
 */
export const BIG_STADIUMS = [
  { stadium: 'Wembley', city: 'Londyn', country: 'Anglia', cap: 90000 },
  { stadium: 'Camp Nou', city: 'Barcelona', country: 'Hiszpania', cap: 99000 },
  { stadium: 'Santiago Bernabéu', city: 'Madryt', country: 'Hiszpania', cap: 83000 },
  { stadium: 'Signal Iduna Park', city: 'Dortmund', country: 'Niemcy', cap: 81000 },
  { stadium: 'Stade de France', city: 'Saint-Denis (Paryż)', country: 'Francja', cap: 80000 },
  { stadium: 'Allianz Arena', city: 'Monachium', country: 'Niemcy', cap: 75000 },
  { stadium: 'San Siro', city: 'Mediolan', country: 'Włochy', cap: 75000 },
  { stadium: 'Stadion Olimpijski im. Atatürka', city: 'Stambuł', country: 'Turcja', cap: 75000 },
  { stadium: 'Olympiastadion', city: 'Berlin', country: 'Niemcy', cap: 74000 },
  { stadium: 'Old Trafford', city: 'Manchester', country: 'Anglia', cap: 74000 },
  { stadium: 'Stadio Olimpico', city: 'Rzym', country: 'Włochy', cap: 70000 },
  { stadium: 'Estadio Metropolitano', city: 'Madryt', country: 'Hiszpania', cap: 70000 },
  { stadium: 'Puskás Aréna', city: 'Budapeszt', country: 'Węgry', cap: 67000 },
  { stadium: 'Estádio da Luz', city: 'Lizbona', country: 'Portugalia', cap: 65000 },
  { stadium: 'Tottenham Hotspur Stadium', city: 'Londyn', country: 'Anglia', cap: 62000 },
  { stadium: 'Veltins-Arena', city: 'Gelsenkirchen', country: 'Niemcy', cap: 62000 },
  { stadium: 'PGE Narodowy', city: 'Warszawa', country: 'Polska', cap: 58000 },
  { stadium: 'Johan Cruyff ArenA', city: 'Amsterdam', country: 'Holandia', cap: 55000 },
];

/** Zwycięzcy pucharów sezonu 2025/26 (gospodarz i gość pierwszej edycji w grze). */
export const HOLDERS_2026 = { LM: 'paris-sg', LE: 'aston-villa' };
export const SUPER_CUP_EU_TIME = '21:00';
/** Premie UEFA (mln euro): stała kwota od 2024: zdobywca 5, finalista 4 (Wikipedia, „UEFA Super Cup”). */
export const SUPER_CUP_EU_PRIZE = { participation: 4, win: 1 };

const SEED = 'superpuchar-europy';
const RECENT = 6;
const memo = new Map();

/** Stadion edycji: prawdziwy do 2028, potem losowanie (stałe dla danego roku) bez powtórki z ostatnich 6 lat. */
export function superCupEUVenue(year) {
  if (SUPER_CUP_EU_REAL[year]) return SUPER_CUP_EU_REAL[year];
  if (memo.has(year)) return memo.get(year);
  const recent = new Set();
  for (let y = year - RECENT; y < year; y++) if (y >= 2026) recent.add(superCupEUVenue(y).stadium);
  const pool = BIG_STADIUMS.filter((s) => !recent.has(s.stadium));
  const v = new Rng(`${SEED}:${year}`).pick(pool.length ? pool : BIG_STADIUMS);
  memo.set(year, v);
  return v;
}
export const venueLabel = (v) => `${v.stadium}, ${v.city}`;

/** Data: środa między 9 a 15 sierpnia (2026: 12 sierpnia, 2027: 11 sierpnia, jak u UEFA). */
export function superCupEUDate(year) {
  const d = new Date(Date.UTC(year, 7, 9));
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Mecz edycji danego roku. holders: { LM, LE } (zwycięzcy poprzedniego sezonu). */
export function createSuperCupEU(year, holders = HOLDERS_2026) {
  const home = holders?.LM ?? null; const away = holders?.LE ?? null;
  if (!home || !away || home === away) return null;
  return { id: `SEU-${year}`, year, date: superCupEUDate(year), time: SUPER_CUP_EU_TIME, home, away, venue: superCupEUVenue(year), played: false, result: null, winner: null };
}

/** Wpis terminarza, gdy gra polski klub z kadrą w grze (mecz na żywo albo szybka symulacja jak inne mecze UEFA). */
export function superCupEUFixture(sc) {
  return {
    id: sc.id, comp: 'uefa', ucomp: 'SEU', round: 'F', date: sc.date, time: sc.time, home: sc.home, away: sc.away,
    played: false, neutral: true, venue: venueLabel(sc.venue), knockout: 'penaltiesOnly', label: 'Superpuchar Europy',
  };
}

/** Szybki mecz bez polskich klubów: siła L obu drużyn (uefaL), remis -> rzuty karne. */
export function simulateSuperCupEU(sc, uefaL, simByStrength) {
  const rng = new Rng(`${SEED}:mecz:${sc.id}`);
  const res = simByStrength(sc.home, sc.away, rng, { neutral: true });
  let shootout = null;
  if (res.score[0] === res.score[1]) {
    const p = clamp(0.5 + 0.03 * (uefaL(sc.home) - uefaL(sc.away)), 0.38, 0.62);
    const lose = rng.int(2, 4);
    shootout = rng.chance(p) ? [lose + 1, lose] : [lose, lose + 1];
  }
  return { score: res.score, extraTime: false, shootout };
}

/** Zapis wyniku i zwycięzcy. */
export function settleSuperCupEU(sc, result) {
  sc.played = true;
  sc.result = { score: [...result.score], shootout: result.shootout ?? null };
  const [a, b] = result.score;
  sc.winner = a !== b ? (a > b ? sc.home : sc.away) : result.shootout ? (result.shootout[0] > result.shootout[1] ? sc.home : sc.away) : null;
  return sc;
}

/** Tekst wyniku do wiadomości i widoku pucharów. */
export function superCupEULine(sc) {
  const n = (id) => anyClub(id)?.name ?? id;
  if (!sc.played) return `${n(sc.home)} - ${n(sc.away)}`;
  const [a, b] = sc.result.score;
  return `${n(sc.home)} ${a}:${b} ${n(sc.away)}${sc.result.shootout ? ` (karne ${sc.result.shootout[0]}:${sc.result.shootout[1]})` : ''}`;
}
