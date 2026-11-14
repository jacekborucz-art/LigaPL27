// Organiczna trudność: świat gry reaguje na sukcesy trenera, bez suwaka i bez ukrytych premii dla AI.
// threat (0-1) mówi, na ile rywale traktują drużynę gracza jako groźną: rośnie, gdy drużyna punktuje
// wyraźnie ponad stan kadry w tym sezonie, gdy w poprzednim sezonie skończyła wysoko ponad cel
// albo zdobyła trofeum. Trener przeciętnego klubu, który gra na miarę kadry, ma threat = 0.
// Skutki (docs/balans.md):
//  - kluby AI przygotowują się do meczu z groźnym rywalem staranniej (ta sama analiza wideo, co u gracza,
//    skalowana jakością ich analityka; training/cohesion.js prepTerm),
//  - zarząd po udanym sezonie podnosi cel na kolejny (board.js seasonGoalFor z historią).

import { clamp } from '../core/rng.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { standings } from '../season/standings.js';

import { compOfClub, compClubIds } from '../season/leagueComps.js';
const LEAGUE_L = { 1: 11.5, 2: 10, 3: 8.5, 4: 7.7 };

export const THREAT = {
  minGames: 6, // od tylu meczów ligowych liczy się bieżący sezon
  ppgFree: 0.25, ppgFull: 0.85, // nadwyżka punktów na mecz ponad oczekiwania: od 0,25 rośnie, przy 0,85 pełne zagrożenie [SZAC]
  lastSeasonPerPlace: 0.12, // każde miejsce ponad cel zarządu w poprzednim sezonie [SZAC]
  title: 0.35, cup: 0.15, // trofea z poprzedniego sezonu [SZAC]
  prepMul: 1.0, // analiza rywala AI przeciw groźnej drużynie: do x2 [SZAC]
};

/** Oczekiwane punkty na mecz z siły kadry na tle ligi (ten sam wzór co pewność siebie z tabeli). */
export function expectedPpg(clubL, leagueL) {
  return clamp(1.37 + 0.55 * (clubL - leagueL), 0.5, 2.5);
}

const cache = new WeakMap();

/** Zagrożenie ze strony drużyny gracza (0-1), liczone raz na dzień gry. */
export function managerThreat(game) {
  if (!game?.clubId || !game.fixtures) return 0;
  const hit = cache.get(game);
  if (hit && hit.date === game.date && hit.clubId === game.clubId) return hit.v;
  let v = 0;
  const club = clubById(game.clubId);
  const comp = compOfClub(club);
  if (club && comp) {
    const table = standings(game.fixtures.filter((f) => f.comp === comp), compClubIds(comp));
    const row = table.find((r) => r.id === game.clubId);
    if (row && row.played >= THREAT.minGames) {
      const over = row.points / row.played - expectedPpg(club.L, LEAGUE_L[club.tier]);
      v += clamp((over - THREAT.ppgFree) / (THREAT.ppgFull - THREAT.ppgFree), 0, 1);
    }
  }
  const last = (game.manager?.seasons ?? []).at(-1);
  if (last && last.club === game.clubId && last.target) v += Math.max(0, last.target - last.pos) * THREAT.lastSeasonPerPlace;
  const arch = (game.archive ?? []).at(-1);
  if (arch) {
    if (arch.champion === game.clubId) v += THREAT.title;
    if (arch.cup === game.clubId) v += THREAT.cup;
  }
  v = Math.round(clamp(v, 0, 1) * 100) / 100;
  cache.set(game, { date: game.date, clubId: game.clubId, v });
  return v;
}
