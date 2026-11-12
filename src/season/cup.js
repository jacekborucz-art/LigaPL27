// Puchar Polski 2026/27 i Superpuchar. Mecze jednomeczowe, gospodarz z niższej ligi,
// dogrywka i karne (PP), w Superpucharze od razu karne. Losowanie kolejnej rundy dzień po
// ostatnim meczu poprzedniej. Rezerwy nie grają w PP.
// Format (docs/ekspert_sedzia.md B4): runda wstępna (14 drużyn z III ligi), 1/32 (54 drużyny:
// 13 z Ekstraklasy bez pucharowiczów UEFA, 18 z 1 Ligi, 16 z 2 Ligi, 7 z rundy wstępnej),
// 1/16 (27 + 5 pucharowiczów UEFA), 1/8, 1/4, 1/2, finał na PGE Narodowym.

import { DOMESTIC, POLISH_EUROPE_2026 } from '../config/calendar2026.js';
import { addDays } from '../core/gameLoop.js';

export const PP_ROUNDS = ['PRE', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];
export const PP_NAMES = { PRE: 'runda wstępna', R64: '1/32 finału', R32: '1/16 finału', R16: '1/8 finału', QF: 'ćwierćfinał', SF: 'półfinał', F: 'finał' };

const roundCfg = (id) => DOMESTIC.pucharPolski.rounds.find((r) => r.id === id);

/** Stan pucharu na start sezonu (uczestnicy rund). */
export function createCup(clubsPl, clubsL3, clubsL4 = [], rng = null) {
  const europe = new Set(POLISH_EUROPE_2026.map((e) => e.club));
  const ek = clubsPl.filter((c) => c.tier === 1 && !europe.has(c.id)).map((c) => c.id);
  const l1 = clubsPl.filter((c) => c.tier === 2).map((c) => c.id);
  const l2 = clubsPl.filter((c) => c.tier === 3 && !c.parent).map((c) => c.id);
  // Runda wstępna: 7 najsilniejszych klubów III ligi + 7 zdobywców pucharów wojewódzkich
  // (liderzy losowych grup IV ligi). Rezerwy nie grają w Pucharze Polski.
  const l3 = clubsL3.filter((c) => !c.parent).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  const groups4 = [...new Set(clubsL4.map((c) => c.group))];
  const pickedGroups = (rng ? rng.shuffle(groups4) : groups4).slice(0, 7);
  const l4 = pickedGroups.map((g) => clubsL4.find((c) => c.group === g && !c.parent)).filter(Boolean);
  // Rozmiar rundy wstępnej tak, żeby w 1/16 finału grały 32 drużyny (zwycięzcy 1/32 + kluby z pucharów UEFA)
  const preWinners = Math.max(0, (32 - europe.size) * 2 - (ek.length + l1.length + l2.length));
  const nL4 = Math.min(l4.length, preWinners);
  const pre = [...l3.slice(0, preWinners * 2 - nL4), ...l4.slice(0, nL4)].map((c) => c.id);
  return {
    entrants: { PRE: pre, R64: [...ek, ...l1, ...l2], R32: [...europe] },
    drawn: [],
    winners: {},
    champion: null,
  };
}

/** Losowanie rundy: pary, gospodarz z niższej ligi (przy tej samej lidze kolejność losowania). */
/** gapOk(clubIds, date): oba kluby mają co najmniej 2 dni przerwy od innych meczów. */
export function drawRound(cup, roundId, tierOf, rng, gapOk = () => true) {
  const prev = PP_ROUNDS[PP_ROUNDS.indexOf(roundId) - 1];
  const teams = [...(cup.entrants[roundId] ?? []), ...(prev ? cup.winners[prev] ?? [] : [])];
  if (teams.length % 2) throw new Error(`Nieparzysta liczba drużyn w rundzie ${roundId}: ${teams.length}`);
  const order = rng.shuffle(teams);
  const cfg = roundCfg(roundId);
  const fixtures = [];
  for (let i = 0; i < order.length; i += 2) {
    let [h, a] = [order[i], order[i + 1]];
    if (roundId !== 'F' && tierOf(a) > tierOf(h)) [h, a] = [a, h];
    // Dzień w oknie rundy z zachowaniem przerwy dla obu klubów (najpierw najwcześniejszy pasujący)
    const days = [];
    if (cfg.window) for (let d = cfg.window[0]; d <= cfg.window[1]; d = addDays(d, 1)) days.push(d);
    const day = days.find((d) => gapOk([h, a], d)) ?? cfg.date;
    fixtures.push({
      id: `PP-${roundId}-${i / 2 + 1}`, comp: 'pp', round: roundId, date: roundId === 'F' ? cfg.date : day,
      time: roundId === 'F' ? '16:00' : ['17:00', '18:00', '20:30'][(i / 2) % 3], home: h, away: a, played: false,
      neutral: roundId === 'F', knockout: 'single', venue: roundId === 'F' ? 'PGE Narodowy' : null,
    });
  }
  cup.drawn.push(roundId);
  return fixtures;
}

/** Zwycięzca meczu pucharowego (wynik, a przy remisie seria karnych). */
export function winnerOf(f) {
  const r = f.result;
  if (!r) return null;
  if (r.score[0] !== r.score[1]) return r.score[0] > r.score[1] ? f.home : f.away;
  if (r.shootout) return r.shootout[0] > r.shootout[1] ? f.home : f.away;
  return null;
}

/** Superpuchar: mistrz vs zdobywca PP poprzedniego sezonu, zawsze na PGE Narodowym w Warszawie (teren neutralny), przy remisie od razu karne. */
export function superCupFixture(champion = 'lech', cupWinner = 'gornik-zabrze') {
  return {
    id: `SP-${DOMESTIC.superpuchar.date.slice(0, 4)}`, comp: 'super', round: 'F', date: DOMESTIC.superpuchar.date, time: '20:15',
    home: champion, away: cupWinner, played: false, knockout: 'penaltiesOnly', neutral: true, venue: 'PGE Narodowy',
  };
}
