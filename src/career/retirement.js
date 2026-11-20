// Koniec kariery (docs/PLAN.md 2.5): zawodnik kończący kontrakt decyduje 1 marca i ogłasza to w wiadomości
// („Po sezonie kończy karierę”); pozostali decydują na koniec sezonu (src/season/rollover.js). Decyzja ostateczna (0/1).
// Ogłoszony koniec kariery: brak przedłużenia, brak umowy od 1 lipca, odejście 1 lipca.
// Czynnik „mało gry”: prawdziwe minuty w sezonie wobec najczęściej grającego zawodnika kadry (minutesShare).
import { Rng } from '../core/rng.js';
import { registerDailySystem } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { clubById } from '../data/clubs_pl.js';
import { decideRetirement } from './squad.js';

export const LEAGUE_L = { 1: 11.5, 2: 10, 3: 8.5, 4: 7.5 }; // średni poziom ligi (jak w rollover.js) [SZAC]
export const ANNOUNCE_DAY = '03-01';

/** Udział w grze 0-1: minuty zawodnika w sezonie wobec najczęściej grającego w kadrze klubu (brak danych: 0,5). */
export function minutesShares(game, clubId) {
  const ids = game.world.clubs[clubId]?.squad ?? [];
  const mins = ids.map((id) => game.world.players[id]?.season?.min ?? 0);
  const max = Math.max(0, ...mins);
  const out = {};
  ids.forEach((id, i) => { out[id] = max > 0 ? mins[i] / max : 0.5; });
  return out;
}

/** 1 marca: decyzja zawodników od 31 lat, którym kontrakt kończy się z końcem sezonu. Zwraca wiadomości. */
export function announceRetirements(game, date) {
  const Y = Number(date.slice(0, 4));
  const end = `${Y}-06-30`;
  const out = [];
  for (const [cid, club] of Object.entries(game.world?.clubs ?? {})) {
    const c = clubById(cid);
    if (!c) continue;
    const shares = minutesShares(game, cid);
    for (const id of club.squad ?? []) {
      const p = game.world.players[id];
      if (!p || (p.age ?? 0) < 31 || p.loan || p.retireDecided === Y || !p.contract?.until || p.contract.until > end) continue;
      p.retireDecided = Y;
      const rng = new Rng(`emerytura-marzec:${game.seed}:${id}:${Y}`);
      const ret = decideRetirement(p, { leagueL: LEAGUE_L[c.tier] ?? 7.5, minutesShare: shares[id] ?? 0.5, hasContractNextSeason: false, longInjuryDays: p.injuryDays }, rng);
      if (!ret.retire) continue;
      p.retiring = { year: Y, date };
      if (cid === game.clubId) {
        out.push(createMessage({ date, key: `kariera-koniec:${id}:${Y}`, category: 'players', from: 'Kierownik drużyny', priority: 'important',
          subject: `${p.name} po sezonie kończy karierę`,
          body: `${p.name} (${p.pos}, ${p.age} lat) ogłosił, że po tym sezonie kończy karierę. Do 30 czerwca jest twoim zawodnikiem, ale nie przedłuży kontraktu. Powody: ${ret.reasons.join(', ').toLowerCase() || 'wiek'}.` }));
      }
    }
  }
  return out;
}

registerDailySystem({
  id: 'retirement', order: 54,
  run(game, date) {
    if (!game.world || date.slice(5) !== ANNOUNCE_DAY) return {};
    return { messages: announceRetirements(game, date) };
  },
});
