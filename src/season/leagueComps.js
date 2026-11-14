// Rozgrywki ligowe: Ekstraklasa, 1 Liga, 2 Liga i 4 grupy III ligi (comp 'liga3-1' ... 'liga3-4').
// Jedno miejsce na mapowanie klub -> rozgrywki i rozgrywki -> kluby (wcześniej TIER_COMP w wielu plikach).
import { CLUBS_PL } from '../data/clubs_pl.js';
import { COMPETITIONS, L3_GROUPS } from '../config/competitions.js';

export const TIER_COMP = { 1: 'ekstraklasa', 2: 'liga1', 3: 'liga2' };
export const L3_COMPS = L3_GROUPS.map((g) => `liga3-${g}`);
export const LEAGUE_COMPS = [...Object.values(TIER_COMP), ...L3_COMPS];
export const isL3Comp = (comp) => typeof comp === 'string' && comp.startsWith('liga3-');

/** Rozgrywki ligowe klubu (obiekt klubu albo null). */
export function compOfClub(club) {
  if (!club) return null;
  if (club.tier === 4) return club.group ? `liga3-${club.group}` : null;
  return TIER_COMP[club.tier] ?? null;
}
/** Poziom rozgrywek (1-4). */
export const compTier = (comp) => COMPETITIONS[comp]?.tier ?? null;
/** Kluby ligi (ten sam poziom, w III lidze ta sama grupa) w bieżącym sezonie. */
export function compClubIds(comp) {
  const C = COMPETITIONS[comp];
  if (!C?.tier) return [];
  return CLUBS_PL.filter((c) => c.tier === C.tier && (C.group == null || c.group === C.group)).map((c) => c.id);
}
/** Wszystkie rozgrywki ligowe danego poziomu (III liga: 4 grupy). */
export const compsOfTier = (tier) => (tier === 4 ? L3_COMPS : TIER_COMP[tier] ? [TIER_COMP[tier]] : []);
