// Warunki meczu dla silnika (krok 2 „Walki taktyk”, docs/walka-taktyk.md rozdz. 7): podróż gości, frekwencja meczu
// w tle, derby i presja tabeli w końcówce sezonu. Ten sam kontekst dostaje pełny silnik (match/matchday.js kickOff)
// i mecz w tle (season.js playQuick), więc oba liczą warunki tak samo (wpisy etapu match w engine/pipeline.js).

import { clamp } from '../core/rng.js';
import { clubById } from '../data/clubs_pl.js';
import { voivOfData } from '../data/voivodeships.js';
import { anyClub } from './season.js';
import { rivalry } from '../career/fans.js';
import { standings, zonesFor } from './standings.js';
import { LEAGUE_COMPS, compClubIds } from './leagueComps.js';
import { COMPETITIONS } from '../config/competitions.js';
import { COND } from '../engine/engine2.js';

/** Stolice województw (szer., dł. geogr.): przybliżona odległość między klubami z różnych województw. */
const VOIV_XY = {
  dolnoslaska: [51.11, 17.03], 'kujawsko-pomorska': [53.1, 18.2], lubelska: [51.25, 22.57], lubuska: [52.3, 15.4],
  lodzka: [51.76, 19.46], malopolska: [50.06, 19.94], mazowiecka: [52.23, 21.01], opolska: [50.67, 17.93],
  podkarpacka: [50.04, 22.0], podlaska: [53.13, 23.16], pomorska: [54.35, 18.65], slaska: [50.26, 19.02],
  swietokrzyska: [50.87, 20.63], 'warminsko-mazurska': [53.78, 20.48], wielkopolska: [52.41, 16.93], zachodniopomorska: [53.43, 14.55],
};
/** Podróż gości w km (drogą, ok. 1,2 x linia prosta): ten sam region 10, to samo województwo 60, zagranica 1000 [SZAC]. */
export function travelKm(homeId, awayId) {
  const H = anyClub(homeId); const A = anyClub(awayId);
  if (!H || !A || H.foreign || A.foreign || !clubById(homeId) || !clubById(awayId)) return 1000;
  if (H.region && H.region === A.region) return 10;
  const vh = voivOfData(H); const va = voivOfData(A);
  if (!vh || !va) return COND.hfa.travelKm * 0.75;
  if (vh === va) return 60;
  const [la1, lo1] = VOIV_XY[vh] ?? [52, 19]; const [la2, lo2] = VOIV_XY[va] ?? [52, 19];
  const r = Math.PI / 180;
  const d = 2 * 6371 * Math.asin(Math.sqrt(Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2));
  return Math.round(1.2 * d);
}

/** Zapełnienie stadionu w meczu w tle (jak studio attendance, bez nastroju kibiców i pogody): 0,2-1. [SZAC] */
export function quickFill(homeId, rank = 0, pos = null) {
  const H = anyClub(homeId);
  let fill = 0.5 + [0, 0.05, 0.2, 0.35][rank ?? 0] + 0.02 * ((H?.prestige ?? 5) - 5);
  if (pos && pos <= 3) fill += 0.05;
  return clamp(fill, 0.2, 1);
}

/**
 * Presja tabeli (0-1) klubu w ostatnich COND.pressure.rounds kolejkach: najbliższa linia strefy (tytuł, puchary,
 * awans, baraże, utrzymanie) z wagą i bliskością punktową; im bliżej końca, tym mocniej. Poza ligą: 0.
 * rows: tabela (standings) rozgrywek, posortowana.
 */
export function tablePressure(rows, clubId, tier) {
  const R = COND.pressure.rounds;
  const n = rows.length;
  const q = rows.findIndex((r) => r.id === clubId);
  if (q < 0 || n < 4) return 0;
  const total = 2 * (n - 1);
  const left = total - rows[q].played;
  if (left < 1 || left > R) return 0;
  const late = (R + 1 - left) / R;
  const reach = 1.5 * left + 2; // bliskość: różnica punktów, przy której walka jeszcze trwa
  const pts = rows[q].points; const pos = q + 1;
  let P = 0;
  const line = (b, w) => { // granica między miejscem b i b + 1
    if (b < 1 || b >= n) return;
    const gap = pos <= b ? pts - rows[b].points : rows[b - 1].points - pts;
    P = Math.max(P, w * clamp(1 - gap / reach, 0, 1));
  };
  const W = COND.pressure.w;
  if (tier === 1) line(1, W.title);
  for (const z of zonesFor(tier, n)) {
    if (z.kind === 'down' || z.kind === 'playoff-down') line(z.from - 1, W[z.kind]);
    else line(z.to, W[z.kind] ?? W.up);
  }
  return P * late;
}

/**
 * Warunki meczu z terminarza: { derby (0-3), travelKm, attendance (0-1, mecz w tle), tier (gospodarza), pressure: [gosp., gość] }.
 * cache: Map rozgrywki -> tabela (ta sama co w season.js playQuick).
 */
export function fixtureConditions(game, f, rank = 0, cache = new Map()) {
  const H = anyClub(f.home);
  const out = { derby: f.comp === 'friendly' ? 0 : rivalry(f.home, f.away), travelKm: f.neutral ? 0 : travelKm(f.home, f.away), tier: H?.tier ?? null, pressure: [0, 0], attendance: 0.6 };
  let pos = null;
  if (LEAGUE_COMPS.includes(f.comp)) {
    if (!cache.has(f.comp)) cache.set(f.comp, standings(game.fixtures.filter((x) => x.comp === f.comp), compClubIds(f.comp)));
    const rows = cache.get(f.comp);
    const tier = COMPETITIONS[f.comp]?.tier ?? H?.tier;
    out.pressure = [tablePressure(rows, f.home, tier), tablePressure(rows, f.away, tier)];
    pos = (rows.findIndex((r) => r.id === f.home) + 1) || null;
  }
  out.attendance = quickFill(f.home, rank, pos);
  return out;
}
