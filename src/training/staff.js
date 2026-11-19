// Sztab szkoleniowy: 6 ról z jakością 1-20 (asystent, przygotowanie fizyczne, bramkarze, młodzież, analityk,
// kierownik drużyny). Kierownik drużyny (ostatni w kolejności losowania, więc pozostałe role bez zmian) odpowiada
// za sprawy organizacyjne na liście „Do zrobienia” (src/career/weeklyTodo.js).
// Na start każdy klub dostaje sztab zależny od prestiżu i ligi (deterministycznie z ziarna gry).
// Wpływ jakości na trening, rozwój, urazy i raporty: STAFF_ROLES i staffMul w config.js.

import { Rng, clamp } from '../core/rng.js';
import { clubById } from '../data/clubs_pl.js';
import { randomName } from '../data/names.js';
import { STAFF_ROLES, staffMul, ROLE_ATTRS } from './config.js';

export const ROLE_IDS = Object.keys(STAFF_ROLES);

/** Jakość sztabu na start: 3 + 1.3 * prestiż + premia ligi + szum. Legia ok. 17, mały klub 2 Ligi ok. 5. [SZAC] */
export function generateStaffFor(game, clubId) {
  const club = clubById(clubId);
  const parent = club?.parent ? clubById(club.parent) : null;
  const prestige = parent ? Math.max(1, parent.prestige - 3) : club?.prestige ?? 4;
  const tierBonus = { 1: 1, 2: 0, 3: -1, 4: -2 }[club?.tier] ?? 0;
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

// ------------------------------------------------------------ Atrybuty osób sztabu (docs/sztab-atrybuty.md)
export const roleAttrKeys = (role) => Object.keys(ROLE_ATTRS[role] ?? {});

/**
 * Efektywny atrybut roli w klubie: jakość roli (lider i pomocnicy) plus odchylenie atrybutu d z widoku
 * game.training.staff (career/staffMarket.js syncStaff). Bez odchyleń (klub bez stałej kadry, wakat) jakość roli.
 */
export const staffA = (game, clubId, role, key) => {
  const s = staffOf(game, clubId)[role];
  const q = s?.q ?? 10;
  return clamp(Math.round((q + (s?.d?.[key] ?? 0)) * 10) / 10, 1, 20);
};

/** Jakość osoby z atrybutów: średnia, zaokrąglona (1-20). */
export function qFromAttrs(a) {
  const v = Object.values(a ?? {});
  return v.length ? clamp(Math.round(v.reduce((s, x) => s + x, 0) / v.length), 1, 20) : 10;
}

/**
 * Atrybuty wokół jakości q (deterministycznie z klucza): odchylenia sumują się do zera, więc średnia to dokładnie q
 * (gdy żaden atrybut nie trafi w granicę 1 albo 20). Profil osoby: mocna i słabsza strona, rozrzut do 3 punktów [SZAC].
 */
export function attrsAround(q, role, key) {
  const keys = roleAttrKeys(role);
  if (!keys.length) return {};
  const rng = new Rng(`sztab-atrybuty-osoby:${key}`);
  const base = clamp(Math.round(q), 1, 20);
  const d = keys.map(() => clamp(Math.round(rng.gauss(0, 1.8)), Math.max(-3, 1 - base), Math.min(3, 20 - base)));
  // Suma odchyleń do zera: różnicę rozkładamy po kolei (w granicach 1-20)
  let diff = d.reduce((s, x) => s + x, 0);
  for (let i = 0; diff !== 0 && i < 40; i++) {
    const k = i % d.length;
    const step = diff > 0 ? -1 : 1;
    if (base + d[k] + step < 1 || base + d[k] + step > 20) continue;
    d[k] += step; diff += step;
  }
  return Object.fromEntries(keys.map((k, i) => [k, clamp(base + d[i], 1, 20)]));
}

/** Uzupełnia atrybuty osoby (stare zapisy, nowe osoby) i ustawia q jako ich średnią. */
export function ensurePersonAttrs(p, key) {
  const keys = roleAttrKeys(p.role);
  if (!keys.length) return p;
  if (!p.a || keys.some((k) => typeof p.a[k] !== 'number')) p.a = { ...attrsAround(p.q ?? 10, p.role, key), ...(p.a ?? {}) };
  for (const k of Object.keys(p.a)) if (!keys.includes(k)) delete p.a[k];
  p.q = qFromAttrs(p.a);
  return p;
}

/** Zmiana jakości osoby (edytor, stary datapack): wszystkie atrybuty przesunięte o tyle samo, profil zostaje. */
export function shiftPersonQ(p, q) {
  const keys = roleAttrKeys(p.role);
  if (!keys.length || !p.a) { p.q = q; return p; }
  for (let i = 0; i < 3 && qFromAttrs(p.a) !== q; i++) {
    const d = q - qFromAttrs(p.a);
    for (const k of keys) p.a[k] = clamp(p.a[k] + d, 1, 20);
  }
  p.q = qFromAttrs(p.a);
  return p;
}

export function staffLabel(q) {
  return q >= 17 ? 'Klasa światowa' : q >= 14 ? 'Bardzo dobry' : q >= 11 ? 'Dobry' : q >= 8 ? 'Przeciętny' : q >= 5 ? 'Słaby' : 'Bardzo słaby';
}

// Fizjoterapeuta (src/career/staffMarket.js): klub bez tej roli w widoku (stary zapis przed migracją) jak wakat
const PHYSIO_VACANT = 3;
const physioA = (game, clubId, key) => (staffOf(game, clubId).fizjoterapeuta ? staffA(game, clubId, 'fizjoterapeuta', key) : PHYSIO_VACANT);
export const SEVERE_DAYS = 28; // ciężki uraz: rehabilitacja zamiast leczenia

/** Długość przerwy po urazie z fizjoterapeutą klubu (najmniej 1 dzień): leczenie, przy ciężkim urazie rehabilitacja. */
export function healDays(game, clubId, days) {
  if (!days || days <= 0) return days;
  return Math.max(1, Math.round(days * staffMul.heal(physioA(game, clubId, days > SEVERE_DAYS ? 'REH' : 'LEC'))));
}

/** Mnożnik ryzyka urazu na treningu od fizjoterapeuty klubu (profilaktyka). */
export const physioInjMul = (game, clubId) => staffMul.physio(physioA(game, clubId, 'PRF'));

/** Dokładność raportów: dokładny (od 14), przybliżony (8-13), ogólny (poniżej 8). */
export function reportPrecision(q) {
  return q >= 14 ? 'exact' : q >= 8 ? 'approx' : 'vague';
}
