// Sztab szkoleniowy: 5 ról z jakością 1-20 (asystent, przygotowanie fizyczne, bramkarze, młodzież, analityk).
// Na start każdy klub dostaje sztab zależny od prestiżu i ligi (deterministycznie z ziarna gry).
// Wpływ jakości na trening, rozwój, urazy i raporty: STAFF_ROLES i staffMul w config.js.

import { Rng, clamp } from '../core/rng.js';
import { clubById } from '../data/clubs_pl.js';
import { randomName } from '../data/names.js';
import { STAFF_ROLES } from './config.js';

export const ROLE_IDS = Object.keys(STAFF_ROLES);

/** Jakość sztabu na start: 3 + 1.3 * prestiż + premia ligi + szum. Legia ok. 17, mały klub 2 Ligi ok. 5. [SZAC] */
export function generateStaffFor(game, clubId) {
  const club = clubById(clubId);
  const parent = club?.parent ? clubById(club.parent) : null;
  const prestige = parent ? Math.max(1, parent.prestige - 3) : club?.prestige ?? 4;
  const tierBonus = { 1: 1, 2: 0, 3: -1 }[club?.tier] ?? 0;
  const rng = new Rng(`sztab:${game.seed}:${clubId}`);
  const out = {};
  for (const role of ROLE_IDS) {
    const q = clamp(Math.round(3 + 1.3 * prestige + tierBonus + rng.gauss(0, 1.8)), 1, 20);
    const n = randomName('POL', rng);
    out[role] = { name: `${n.first} ${n.last}`, q, age: rng.int(31, 62) };
  }
  // Młode kluby z mocną akademią (rezerwy dużych klubów) mają lepszego trenera młodzieży
  if (parent) out.mlodziez.q = clamp(out.mlodziez.q + 4, 1, 20);
  return out;
}

const NEUTRAL = Object.fromEntries(ROLE_IDS.map((r) => [r, { q: 10 }]));

/** Sztab klubu (dla klubów bez stałej kadry: neutralny, jakość 10). */
export function staffOf(game, clubId) {
  return game?.training?.staff?.[clubId] ?? NEUTRAL;
}

export const staffQ = (game, clubId, role) => staffOf(game, clubId)[role]?.q ?? 10;

export function staffLabel(q) {
  return q >= 17 ? 'Klasa światowa' : q >= 14 ? 'Bardzo dobry' : q >= 11 ? 'Dobry' : q >= 8 ? 'Przeciętny' : q >= 5 ? 'Słaby' : 'Bardzo słaby';
}

/** Dokładność raportów: dokładny (od 14), przybliżony (8-13), ogólny (poniżej 8). */
export function reportPrecision(q) {
  return q >= 14 ? 'exact' : q >= 8 ? 'approx' : 'vague';
}
