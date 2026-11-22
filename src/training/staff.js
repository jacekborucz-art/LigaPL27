// Sztab szkoleniowy: 6 ról z jakością 1-20 (asystent, przygotowanie fizyczne, bramkarze, młodzież, analityk,
// kierownik drużyny). Kierownik drużyny (ostatni w kolejności losowania, więc pozostałe role bez zmian) odpowiada
// za sprawy organizacyjne na liście „Do zrobienia” (src/career/weeklyTodo.js).
// Na start każdy klub dostaje sztab zależny od prestiżu i ligi (deterministycznie z ziarna gry).
// Wpływ jakości na trening, rozwój, urazy i raporty: STAFF_ROLES i staffMul w config.js.

import { Rng, clamp } from '../core/rng.js';
import { clubById } from '../data/clubs_pl.js';
import { randomName } from '../data/names.js';
import { STAFF_ROLES, staffMul, ROLE_ATTRS, staffCap, isCappedRole, staffShown, staffRescale, STAFF_EFF } from './config.js';
import { scoutRegionsFor } from '../career/scoutRegions.js';

export const ROLE_IDS = Object.keys(STAFF_ROLES);

/**
 * Jakość sztabu na start: 3 + 1.3 * prestiż + premia ligi + szum. Legia ok. 17, mały klub 2 Ligi ok. 5. [SZAC]
 * Skala efektów 1-20 (widok game.training.staff); osoby sztabu dostają ją przeliczoną na skalę roli (1-12,
 * staffRescale w career/staffMarket.js buildClub).
 */
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
 * (gdy żaden atrybut nie trafi w granicę 1 albo najwyższej wartości roli). Profil osoby: mocna i słabsza strona,
 * rozrzut do 3 punktów (role ze skalą 1-12: do 2 punktów, odchylenie 1,8 / 1,45) [SZAC].
 */
export function attrsAround(q, role, key, { legacy = false } = {}) {
  const keys = roleAttrKeys(role);
  if (!keys.length) return {};
  const small = isCappedRole(role) && !legacy; // legacy: stary zapis na skali 1-20 (przed przeliczeniem, rescalePerson)
  const cap = small ? staffCap(role) : 20;
  const sd = small ? 1.8 / STAFF_EFF : 1.8;
  const dMax = small ? 2 : 3;
  const rng = new Rng(`sztab-atrybuty-osoby:${key}`);
  const base = clamp(Math.round(q), 1, cap);
  const d = keys.map(() => clamp(Math.round(rng.gauss(0, sd)), Math.max(-dMax, 1 - base), Math.min(dMax, cap - base)));
  // Suma odchyleń do zera: różnicę rozkładamy po kolei (w granicach 1 - najwyższa wartość roli)
  let diff = d.reduce((s, x) => s + x, 0);
  for (let i = 0; diff !== 0 && i < 40; i++) {
    const k = i % d.length;
    const step = diff > 0 ? -1 : 1;
    if (base + d[k] + step < 1 || base + d[k] + step > cap) continue;
    d[k] += step; diff += step;
  }
  return Object.fromEntries(keys.map((k, i) => [k, clamp(base + d[i], 1, cap)]));
}

/**
 * Skaut: dawne 3 atrybuty (POT ocena potencjału, OCU ocena umiejętności, RYN znajomość rynków) na 5 nowych
 * (docs/sztab-atrybuty.md, docs/skauting.md). Odchylenia od jakości q: OCE = 0,6 dPOT + 0,4 dOCU, RYN bez zmian,
 * DOS z wieku ((wiek - 45) / 6, do 3 punktów), SIE i CHA z ziarna (do 3 punktów). Suma odchyleń wraca do zera,
 * więc jakość (średnia) zostaje. Deterministyczne z klucza (zapis: ziarno i id osoby; datapack: imię).
 */
export function migrateScoutAttrs(old, q, age, key) {
  const base = clamp(Math.round(q ?? 10), 1, 20);
  const d0 = (k) => (typeof old?.[k] === 'number' ? old[k] - base : 0);
  const rng = new Rng(`skaut-migracja:${key}`);
  const lim = (x) => clamp(Math.round(x), Math.max(-3, 1 - base), Math.min(3, 20 - base));
  const d = {
    DOS: lim(clamp(((age ?? 45) - 45) / 6, -3, 3)),
    OCE: lim(0.6 * d0('POT') + 0.4 * d0('OCU')),
    RYN: lim(d0('RYN')),
    SIE: lim(rng.gauss(0, 1.5)),
    CHA: lim(rng.gauss(0, 1.5)),
  };
  // Suma odchyleń do zera: najpierw sieć, charakter i doświadczenie, potem oceny (w granicach 1-20)
  const order = ['SIE', 'CHA', 'DOS', 'OCE', 'RYN'];
  let diff = Object.values(d).reduce((s, x) => s + x, 0);
  for (let i = 0; diff !== 0 && i < 60; i++) {
    const k = order[i % order.length];
    const step = diff > 0 ? -1 : 1;
    if (base + d[k] + step < 1 || base + d[k] + step > 20) continue;
    d[k] += step; diff += step;
  }
  return Object.fromEntries(Object.entries(d).map(([k, x]) => [k, clamp(base + x, 1, 20)]));
}

/** Skaut bez regionów (stary zapis, nowa osoba): 1-3 regiony z ziarna osoby (career/scoutRegions.js). */
export function ensureScoutReg(p, key) {
  if (p?.role === 'skaut' && (!p.reg || typeof p.reg !== 'object')) p.reg = scoutRegionsFor(p, key);
  return p;
}

/** Uzupełnia atrybuty osoby (stare zapisy, nowe osoby) i ustawia q jako ich średnią (w granicach skali roli; legacy: 1-20). */
export function ensurePersonAttrs(p, key, { legacy = false } = {}) {
  const keys = roleAttrKeys(p.role);
  if (!keys.length) return p;
  if (p.role === 'skaut' && p.a && (typeof p.a.POT === 'number' || typeof p.a.OCU === 'number')) p.a = migrateScoutAttrs(p.a, p.q, p.age, key);
  ensureScoutReg(p, key);
  if (!p.a || keys.some((k) => typeof p.a[k] !== 'number')) p.a = { ...attrsAround(p.q ?? 10, p.role, key, { legacy }), ...(p.a ?? {}) };
  for (const k of Object.keys(p.a)) if (!keys.includes(k)) delete p.a[k];
  const cap = legacy ? 20 : staffCap(p.role);
  for (const k of keys) p.a[k] = clamp(p.a[k], 1, cap);
  p.q = qFromAttrs(p.a);
  return p;
}

/**
 * Stara osoba sztabu (zapis sprzed skali 1-12) na skalę roli: każdy atrybut przeliczony (x 11/16, 17 -> 12,
 * zaokrąglenie), wyżej przycięty do 12, jakość znów średnią. Fizjoterapeuta i dyrektor bez zmian. Efekty w grze
 * (skala 1-20 przez staffEff) zostają takie same z dokładnością do zaokrąglenia.
 */
export function rescalePerson(p) {
  if (!p || !isCappedRole(p.role)) return p;
  const keys = roleAttrKeys(p.role);
  if (p.a && keys.length) {
    for (const k of keys) if (typeof p.a[k] === 'number') p.a[k] = staffRescale(p.role, p.a[k]);
    p.q = qFromAttrs(p.a);
  } else if (typeof p.q === 'number') p.q = staffRescale(p.role, p.q);
  return p;
}

/** Zmiana jakości osoby (edytor, stary datapack): wszystkie atrybuty przesunięte o tyle samo, profil zostaje. */
export function shiftPersonQ(p, q) {
  const keys = roleAttrKeys(p.role);
  const cap = staffCap(p.role);
  q = clamp(q, 1, cap);
  if (!keys.length || !p.a) { p.q = q; return p; }
  for (let i = 0; i < 3 && qFromAttrs(p.a) !== q; i++) {
    const d = q - qFromAttrs(p.a);
    for (const k of keys) p.a[k] = clamp(p.a[k] + d, 1, cap);
  }
  p.q = qFromAttrs(p.a);
  return p;
}

/**
 * Słowna ocena jakości na skali roli. Role ze skalą 1-12 (bez roli: też ta skala): 10+ bardzo dobry (najlepsze
 * sztaby w Polsce), 8+ dobry, 6+ przeciętny, 4+ słaby. Fizjoterapeuta i dyrektor sportowy (1-20): dawne progi.
 */
export function staffLabel(q, role = null) {
  if (role === 'fizjoterapeuta' || role === 'dyrektor') return q >= 17 ? 'Klasa światowa' : q >= 14 ? 'Bardzo dobry' : q >= 11 ? 'Dobry' : q >= 8 ? 'Przeciętny' : q >= 5 ? 'Słaby' : 'Bardzo słaby';
  return q >= 10 ? 'Bardzo dobry' : q >= 8 ? 'Dobry' : q >= 6 ? 'Przeciętny' : q >= 4 ? 'Słaby' : 'Bardzo słaby';
}

/** Słowna ocena roli z wartości na skali efektów (widok game.training.staff, staffA). */
export const staffLabelEff = (e, role) => staffLabel(staffShown(role, e), role);

/** Jakość roli w klubie na skali roli (1-12, fizjoterapeuta 1-20) do pokazania graczowi, z jedną cyfrą po przecinku. */
export function staffShownQ(game, clubId, role) {
  const s = staffOf(game, clubId)[role];
  if (typeof s?.qs === 'number') return s.qs;
  return Math.round(staffShown(role, s?.q ?? 10) * 10) / 10;
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
