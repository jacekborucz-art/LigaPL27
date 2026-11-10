// Kadry „na żądanie” dla klubów bez stałej kadry (III liga w Pucharze Polski, kluby zagraniczne).
// Deterministyczne z ziarna klubu i sezonu: ten sam klub w tym samym sezonie ma tych samych zawodników.
// Po meczu kadra nie jest zapisywana (PLAN 1); trwałe są tylko kartki i kontuzje (osobna mapa).

import { Rng } from '../core/rng.js';
import { SQUAD_LAYOUT } from './worldGen.js';
import { genPlayer } from './playerGen.js';
import { pickNationality } from '../data/names.js';

const cache = new Map();

export function ephemeralSquad(club, season, { nat = null, date = '2026-07-01' } = {}) {
  const key = `${club.id}:${season}`;
  if (cache.has(key)) return cache.get(key);
  const rng = new Rng(`efemeryczna:${key}`);
  const tier = club.tier >= 4 ? 3 : club.tier ?? 1;
  const players = SQUAD_LAYOUT.map(([pos, side], i) => {
    const role = i < 11 ? -0.1 : i < 18 ? -0.9 : -1.4;
    const age = rng.int(19, 32);
    const n = nat ?? (club.tier >= 4 ? (rng.chance(0.95) ? 'POL' : pickNationality(3, rng)) : 'POL');
    return genPlayer(rng, { id: `${club.id}-e${i + 1}`, L: club.L, pos, age, slotOffset: role, nat: n, tier, side: side ?? null, club, date });
  });
  if (cache.size > 200) cache.clear();
  cache.set(key, players);
  return players;
}
