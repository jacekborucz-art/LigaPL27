// Nagrody pucharowe (docs/finanse.md, rozdz. 3.3): Puchar Polski według najdalszej rundy, premia UEFA dla zdobywcy
// pucharu, wypłaty solidarnościowe UEFA. Kwoty w src/career/finance.js (PP_PRIZE, uefaPrize).
import { book, uefaPrize, PP_PRIZE } from './finance.js';
import { PP_ROUNDS, PP_NAMES, winnerOf } from '../season/cup.js';
import { UCOMP_NAMES } from '../season/uefa.js';
import { clubById } from '../data/clubs_pl.js';
import { SEASON_YEAR } from '../config/calendar2026.js';

/**
 * Kwota do wypłaty po meczu Pucharu Polski. Łącznie klub dostaje PP_PRIZE[najdalsza runda] (zdobywca: W).
 * Klub, który grał już we wcześniejszej rundzie, ma wypłacone PP_PRIZE[round] (za awans do tej rundy).
 */
export function ppPrizeDue(round, won, playedEarlier) {
  const i = PP_ROUNDS.indexOf(round);
  if (i < 0) return 0;
  const reached = won ? (round === 'F' ? 'W' : PP_ROUNDS[i + 1]) : round;
  return Math.max(0, (PP_PRIZE[reached] ?? 0) - (playedEarlier ? PP_PRIZE[round] ?? 0 : 0));
}

/** Wypłata dla obu klubów po rozegranym meczu PP (zwycięzca: przyrost do kolejnej rundy, przegrany: wyrównanie). */
export function bookCupPrize(F, fixtures, f) {
  const w = winnerOf(f);
  if (!w) return;
  const i = PP_ROUNDS.indexOf(f.round);
  for (const id of [f.home, f.away]) {
    if (!F.clubs[id]) continue;
    const earlier = fixtures.some((x) => x.comp === 'pp' && x !== f && (x.home === id || x.away === id) && PP_ROUNDS.indexOf(x.round) < i);
    const won = id === w;
    const note = won ? (f.round === 'F' ? 'Puchar Polski: zdobycie trofeum' : `Puchar Polski: awans (${PP_NAMES[PP_ROUNDS[i + 1]]})`) : `Puchar Polski: odpadnięcie (${PP_NAMES[f.round]})`;
    book(F, id, f.date, 'in', 'prize', ppPrizeDue(f.round, won, earlier), note);
  }
}

/** Premia UEFA dla zdobywcy LM, LE albo LK (po finale). */
export function bookUefaWinner(F, f) {
  if (f.round !== 'F' || f.ucomp === 'SEU') return;
  const w = winnerOf(f);
  if (w && F.clubs[w]) book(F, w, f.date, 'in', 'prize', uefaPrize(f.ucomp, 'W'), `${UCOMP_NAMES[f.ucomp] ?? f.label}: premia za zdobycie pucharu`);
}

export const SOLIDARITY_DAY = '12-15'; // wypłata solidarnościowa w połowie grudnia [SZAC]
const MAIN = new Set(['league', 'KPO', 'R16', 'QF', 'SF', 'F']);

/**
 * Wypłaty solidarnościowe UEFA raz w sezonie (15 grudnia): klub, który odpadł w eliminacjach (nie zagrał w fazie
 * ligowej), 0,26 mln EUR; klub Ekstraklasy bez pucharów ok. 0,1 mln EUR [SZAC]. Zwraca liczbę wpisów.
 */
export function uefaSolidarity(game, date) {
  const F = game.finance;
  if (!F || date !== `${SEASON_YEAR}-${SOLIDARITY_DAY}` || F.solidarity === SEASON_YEAR) return 0;
  F.solidarity = SEASON_YEAR;
  const seen = new Map(); // klub -> czy zagrał w fazie głównej
  for (const f of game.fixtures ?? []) {
    if (f.comp !== 'uefa' || f.ucomp === 'SEU') continue;
    for (const id of [f.home, f.away]) seen.set(id, (seen.get(id) ?? false) || MAIN.has(f.round));
  }
  let n = 0;
  for (const id of Object.keys(F.clubs)) {
    if (seen.has(id)) {
      if (seen.get(id)) continue;
      book(F, id, date, 'in', 'prize', uefaPrize('SOL', 'Q'), 'UEFA: wypłata solidarnościowa (eliminacje)'); n++;
    } else if (clubById(id)?.tier === 1) {
      book(F, id, date, 'in', 'prize', uefaPrize('SOL', 'NP'), 'UEFA: wypłata solidarnościowa dla klubów bez pucharów'); n++;
    }
  }
  return n;
}
