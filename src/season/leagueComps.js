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

// Rejestr kartek i pauz ligowych per klasa rozgrywkowa (Regulamin 1-3 Ligi PZPN art. 13 ust. 4-5, Regulamin
// Dyscyplinarny art. 20 par. 1): Ekstraklasa, 1 Liga, 2 Liga i III liga (wszystkie grupy) osobno. Baraże liczą się do
// klasy klubu (baraż o 2 Ligę: klub III ligi w 'liga3', klub 2 Ligi w 'liga2'). Puchar Polski 'cup', UEFA 'uefa'.
export const CLASS_KEYS = { 1: 'ekstraklasa', 2: 'liga1', 3: 'liga2', 4: 'liga3' };
export const LEAGUE_CLASS_KEYS = Object.values(CLASS_KEYS);
/** Klucz klasy dla poziomu ligi (1-4); null poza ligami z kadrami. */
export const classKeyOfTier = (tier) => CLASS_KEYS[tier] ?? null;
/** Rozgrywki z regułami kartek klasy (COMPETITIONS): liga, a dla III ligi pierwsza grupa (te same progi). */
export const rulesCompOfClass = (key) => (key === 'liga3' ? L3_COMPS[0] : key && LEAGUE_CLASS_KEYS.includes(key) ? key : null);
/**
 * Klucz rejestru kartek dla meczu w rozgrywkach comp; clubTier potrzebny w barażach (klasa klubu).
 * Liga: klasa ligi. Baraże: klasa klubu (bez niej klasa ligi, z której są baraże). PP 'cup', reszta bez zmian.
 */
export function classKeyOfComp(comp, clubTier = null) {
  if (typeof comp !== 'string') return comp;
  if (isL3Comp(comp)) return 'liga3';
  if (comp === 'ekstraklasa' || comp === 'liga1' || comp === 'liga2') return comp;
  if (comp.startsWith('playoff-')) return classKeyOfTier(clubTier) ?? comp.slice(8);
  if (comp === 'pp') return 'cup';
  return comp;
}
