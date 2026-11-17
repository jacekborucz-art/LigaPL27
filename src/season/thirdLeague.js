// Grywalna III liga w starych zapisach (docs/iii-liga.md, migracja przy wczytaniu).
// Zapis sprzed grywalnej III ligi nie ma kadr klubów III ligi ani ich terminarza. Przy wczytaniu:
// 1. grupy III ligi wyrównane do 18 (stare zapisy losowały grupę spadkowiczów z 2 Ligi),
// 2. kluby III ligi bez kadry dostają kadrę (deterministycznie z ziarna gry), finanse i trenera,
// 3. terminarz 4 grup na cały bieżący sezon; mecze sprzed dnia wczytania rozgrywa szybka symulacja (tylko wyniki
//    i statystyki, bez finansów i bez skutków zdrowotnych), więc tabele są pełne, a sezon toczy się dalej normalnie.
// Najprostsza odporna wersja: ten sam terminarz co w nowej grze, nic nie czeka na kolejny sezon.

import { Rng } from '../core/rng.js';
import { CLUBS_PL } from '../data/clubs_pl.js';
import { generateClubSquad } from '../world/worldGen.js';
import { applyLeagueState, balanceGroups } from './leagues.js';
import { isL3Comp } from './leagueComps.js';
import { thirdLeagueFixtures, playQuick, applyResult } from './season.js';
import { initClub } from '../career/finance.js';
import { pruneSuspWhy } from './suspension.js';

/** Uzupełnia zapis o grywalną III ligę. Zwraca { squads, fixtures, simulated } (liczby) albo null, gdy nic nie trzeba. */
export function ensureThirdLeague(game) {
  if (!game?.world || !game.season || !Array.isArray(game.fixtures)) return null;
  if (game.leagueState && balanceGroups(game.leagueState)) applyLeagueState(game);
  const missing = CLUBS_PL.filter((c) => c.tier === 4 && !game.world.clubs[c.id]);
  const hasL3 = game.fixtures.some((f) => isL3Comp(f.comp));
  if (!missing.length && hasL3) return null;
  const date = game.date ?? '2026-07-01';
  // Kadry
  for (const c of missing) {
    const { players, academy } = generateClubSquad(c, new Rng(`iii-liga:${game.seed}:${c.id}`), date);
    for (const p of [...players, ...academy]) {
      if (game.world.players[p.id]) p.id = `${p.id}-l3`;
      p.clubId = c.id;
      game.world.players[p.id] = p;
    }
    game.world.clubs[c.id] = { squad: players.map((p) => p.id), academy: academy.map((p) => p.id) };
    if (game.finance?.clubs && !game.finance.clubs[c.id]) game.finance.clubs[c.id] = initClub(game.world, c);
  }
  let simulated = 0; let added = 0;
  if (!hasL3) {
    const fx = thirdLeagueFixtures(new Rng(`sezon:${game.seed}:${game.seasonYear ?? 2026}:iii-liga`));
    added = fx.length;
    game.fixtures.push(...fx);
    game.fixtures.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    // Mecze z minionych dni: szybka symulacja, bez finansów (f.fin) i bez kontuzji czy pauz na dziś
    const past = fx.filter((f) => f.date < date).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const touched = new Set();
    for (const f of past) {
      const rng = new Rng(`iii-liga-wynik:${game.seed}:${f.id}`);
      if (f.home === game.clubId || f.away === game.clubId) { f.played = true; f.result = { score: [0, 0] }; f.fin = true; continue; }
      applyResult(game, f, playQuick(game, f, rng), rng);
      f.fin = true; simulated++;
      touched.add(f.home); touched.add(f.away);
    }
    for (const id of touched) {
      for (const pid of game.world.clubs[id]?.squad ?? []) {
        const p = game.world.players[pid];
        if (!p) continue;
        p.injuryDays = 0; p.injury = null; p.susp = {}; pruneSuspWhy(p); p.fresh = 95; delete p.matchDebt;
      }
    }
  }
  return { squads: missing.length, fixtures: added, simulated };
}
