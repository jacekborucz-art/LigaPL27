// Edytor gry i datapack (docs/edytor.md). Gracz zmienia nazwy klubów, stadion, pojemność i finanse oraz dane
// zawodników (imię, nazwisko, narodowość, pozycja, data urodzenia, atrybuty, potencjał). Każda zmiana działa od razu
// w bieżącej grze i trafia do game.editor (datapack), który można zapisać do pliku i wczytać w innej grze.
//
// game.editor = { v: 1, seed, clubs: { [id]: { name, short, stadium, capacity, balance, transferBudget, wageBudget } },
//   players: { [id]: { first, last, nat, pos, birthDate, attrs: { POD: 12, ... }, pot } } } (tylko zmienione pola).
//
// Nazwa, skrót i stadion klubu żyją we wspólnych obiektach CLUBS_PL i CLUBS_L3 (stan modułu, nie zapis gry), więc
// applyPack() przy każdym wczytaniu gry przywraca oryginały i nakłada zmiany z game.editor, a restoreOriginals()
// czyści je przed ekranem startowym (inny zapis widzi oryginalne nazwy). Liczby (finanse, pojemność, atrybuty) są
// częścią zapisu gry: ustawiamy je raz, przy edycji albo imporcie.

import { CLUBS_PL } from '../data/clubs_pl.js';
import { CLUBS_L3 } from '../data/clubs_l3.js';
import { NAT_NAMES, EU } from '../data/names.js';
import { ATTRS, POS_NAMES, VARIANTS, ovrAt } from '../data/attributes.js';
import { clubFinanceData } from '../data/finanse_klubow.js';
import { offsetsFor } from '../training/development.js';
import { ageAt } from '../training/state.js';
import { marketValue } from '../world/playerGen.js';
import { infraOf, applyPlan, capacityOf } from './infrastructure.js';
import { stadiumCapacity } from './finance.js';

export const PACK_TYPE = 'ligapl27-datapack';
export const PACK_V = 1;
export const LIMITS = {
  name: 40, short: 5, stadium: 60,
  capMin: 500, capMax: 100000,
  balanceMin: -1e9, moneyMax: 1e10,
  attrMin: 1, attrMax: 20,
  ageMin: 15, ageMax: 45,
};
export const CLUB_FIELDS = ['name', 'short', 'stadium', 'capacity', 'balance', 'transferBudget', 'wageBudget'];
export const PLAYER_FIELDS = ['first', 'last', 'nat', 'pos', 'birthDate', 'attrs', 'pot'];
const STATIC = ['name', 'short', 'stadium'];
const ATTR_KEYS = Object.keys(ATTRS);

// Oryginalne wartości statycznych danych klubów: zdjęte raz, przy wczytaniu modułu (przed jakąkolwiek grą).
const known = () => [...CLUBS_PL, ...CLUBS_L3];
const ORIGINAL = new Map(known().map((c) => [c.id, { name: c.name, short: c.short, stadium: c.stadium ?? null }]));
const clubObj = (id) => known().find((c) => c.id === id) ?? null;

/** Przywraca oryginalne nazwy, skróty i stadiony wszystkich klubów. */
export function restoreOriginals() {
  for (const c of known()) {
    const o = ORIGINAL.get(c.id);
    if (!o) continue;
    c.name = o.name; c.short = o.short;
    if (o.stadium == null) delete c.stadium; else c.stadium = o.stadium;
  }
}

/** Oryginał statycznego pola klubu (do porównań i podpowiedzi w formularzu). */
export const originalOf = (id, field) => ORIGINAL.get(id)?.[field] ?? null;

/** Nakłada zmiany z game.editor na wspólne obiekty klubów (po przywróceniu oryginałów). Wołać przy wczytaniu gry. */
export function applyPack(game) {
  restoreOriginals();
  const E = game?.editor;
  if (!E?.clubs) return;
  for (const [id, o] of Object.entries(E.clubs)) {
    const c = clubObj(id);
    if (!c || !o) continue;
    if (typeof o.name === 'string' && o.name) c.name = o.name;
    if (typeof o.short === 'string' && o.short) c.short = o.short;
    if (typeof o.stadium === 'string') { if (o.stadium) c.stadium = o.stadium; else delete c.stadium; }
  }
}

export function ensureEditor(game) {
  if (!game.editor || typeof game.editor !== 'object') game.editor = { v: PACK_V, seed: game.seed, clubs: {}, players: {} };
  game.editor.clubs ??= {}; game.editor.players ??= {};
  game.editor.seed = game.seed;
  return game.editor;
}

// ------------------------------------------------------------ Walidacja
const clean = (s) => String(s).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();

/** Tekst: z formularza dowolny napis, z pliku tylko string. */
function text(v, { label, max, min = 1, allowEmpty = false }) {
  if (typeof v !== 'string') return { err: `${label}: oczekiwano tekstu.` };
  const s = clean(v);
  if (!s && allowEmpty) return { v: '' };
  if (s.length < min) return { err: min > 1 ? `${label}: co najmniej ${min} znaki.` : `${label}: pole nie może być puste.` };
  if (s.length > max) return { err: `${label}: najwyżej ${max} znaków.` };
  return { v: s };
}

/** Liczba: z formularza napis (spacje i przecinek dozwolone), z pliku number. */
function num(v, { label, min, max, int = true, form }) {
  let n = v;
  if (form) {
    const s = String(v ?? '').replace(/[\s ]/g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return { err: `${label}: wpisz liczbę.` };
    n = Number(s);
  }
  if (typeof n !== 'number' || !Number.isFinite(n)) return { err: `${label}: oczekiwano liczby.` };
  if (int && !Number.isInteger(n)) return { err: `${label}: liczba całkowita.` };
  if (n < min || n > max) return { err: `${label}: od ${fmt(min)} do ${fmt(max)}.` };
  return { v: int ? n : Math.round(n * 10) / 10 };
}
const fmt = (n) => n.toLocaleString('pl-PL');

/**
 * Sprawdza pola klubu. src: obiekt z polami (brakujące pomijane). form: wartości z formularza (napisy).
 * Zwraca { value, errors } (errors: { pole: komunikat }).
 */
export function checkClub(src, { form = false } = {}) {
  const value = {}; const errors = {};
  const put = (k, r) => { if (r.err) errors[k] = r.err; else value[k] = r.v; };
  if (src.name !== undefined) put('name', text(src.name, { label: 'Nazwa', max: LIMITS.name, min: 2 }));
  if (src.short !== undefined) {
    const r = text(src.short, { label: 'Nazwa skrócona', max: LIMITS.short, min: 2 });
    put('short', r.v && !/^[\p{L}\p{N}]+$/u.test(r.v) ? { err: 'Nazwa skrócona: tylko litery i cyfry.' } : r);
  }
  if (src.stadium !== undefined) put('stadium', text(src.stadium, { label: 'Nazwa stadionu', max: LIMITS.stadium, allowEmpty: true }));
  if (src.capacity !== undefined) put('capacity', num(src.capacity, { label: 'Pojemność stadionu', min: LIMITS.capMin, max: LIMITS.capMax, form }));
  if (src.balance !== undefined) put('balance', num(src.balance, { label: 'Saldo', min: LIMITS.balanceMin, max: LIMITS.moneyMax, form }));
  if (src.transferBudget !== undefined) put('transferBudget', num(src.transferBudget, { label: 'Budżet transferowy', min: 0, max: LIMITS.moneyMax, form }));
  if (src.wageBudget !== undefined) put('wageBudget', num(src.wageBudget, { label: 'Budżet płac', min: 0, max: LIMITS.moneyMax, form }));
  return { value, errors };
}

const validDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Sprawdza pola zawodnika (jak checkClub). date: dzień w grze, do kontroli wieku. */
export function checkPlayer(src, { form = false, date = null } = {}) {
  const value = {}; const errors = {};
  const put = (k, r) => { if (r.err) errors[k] = r.err; else value[k] = r.v; };
  if (src.first !== undefined) put('first', text(src.first, { label: 'Imię', max: LIMITS.name }));
  if (src.last !== undefined) put('last', text(src.last, { label: 'Nazwisko', max: LIMITS.name }));
  if (src.nat !== undefined) put('nat', typeof src.nat === 'string' && NAT_NAMES[src.nat] ? { v: src.nat } : { err: 'Narodowość: wybierz z listy.' });
  if (src.pos !== undefined) put('pos', typeof src.pos === 'string' && POS_NAMES[src.pos] ? { v: src.pos } : { err: 'Pozycja: wybierz z listy.' });
  if (src.birthDate !== undefined) {
    if (!validDate(src.birthDate)) errors.birthDate = 'Data urodzenia: format RRRR-MM-DD.';
    else {
      const age = date ? ageAt({ birthDate: src.birthDate }, date) : null;
      if (age != null && (age < LIMITS.ageMin || age > LIMITS.ageMax)) errors.birthDate = `Data urodzenia: wiek od ${LIMITS.ageMin} do ${LIMITS.ageMax} lat (teraz ${age}).`;
      else value.birthDate = src.birthDate;
    }
  }
  if (src.attrs !== undefined) {
    if (!src.attrs || typeof src.attrs !== 'object' || Array.isArray(src.attrs)) errors.attrs = 'Atrybuty: oczekiwano listy wartości.';
    else {
      const a = {};
      for (const k of ATTR_KEYS) {
        if (src.attrs[k] === undefined) continue;
        const r = num(src.attrs[k], { label: ATTRS[k].name, min: LIMITS.attrMin, max: LIMITS.attrMax, form });
        if (r.err) errors[`attr.${k}`] = r.err; else a[k] = r.v;
      }
      value.attrs = a;
    }
  }
  if (src.pot !== undefined) put('pot', num(src.pot, { label: 'Potencjał', min: LIMITS.attrMin, max: LIMITS.attrMax, int: false, form }));
  return { value, errors };
}

// ------------------------------------------------------------ Stan klubu i zawodnika
/** Pojemność stadionu w grze (z infrastrukturą, bez utrudnień budowy). */
export function clubCapacity(game, id) {
  if (game.infra && infraOf(game, id)) return capacityOf(game, id).full;
  return game.finance?.clubs?.[id]?.plan?.cap ?? stadiumCapacity(clubObj(id));
}

/** Bieżące wartości pól klubu (do formularza). */
export function clubValues(game, id) {
  const c = clubObj(id); const F = game.finance?.clubs?.[id];
  return {
    name: c?.name ?? id, short: c?.short ?? '', stadium: c?.stadium ?? '', capacity: clubCapacity(game, id),
    balance: F?.balance ?? null, transferBudget: F?.transferBudget ?? null, wageBudget: F?.wageBudget ?? null,
  };
}

/**
 * Pojemność: rozbudowa trybun w infrastrukturze (seats) = żądana pojemność minus pojemność z danych klubu,
 * potem przeliczenie planu sezonu (pojemność, frekwencja, bilety). Bez infrastruktury tylko plan.
 */
function setCapacity(game, id, cap) {
  const I = game.infra ? infraOf(game, id) : null;
  const plan = game.finance?.clubs?.[id]?.plan;
  if (I) {
    I.seats = cap - (clubFinanceData(clubObj(id)).pojemnosc ?? 0);
    if (plan) applyPlan(game, id);
  } else if (plan) {
    plan.cap = cap; plan.att = Math.min(plan.att, cap);
  }
}

/**
 * Zmiana klubu: values po checkClub. Ustawia pola w grze i zapisuje w datapacku tylko to, co się zmieniło.
 * Zwraca liczbę zmienionych pól.
 */
export function editClub(game, id, values) {
  const c = clubObj(id);
  if (!c) return 0;
  const E = ensureEditor(game);
  const rec = { ...(E.clubs[id] ?? {}) };
  const cur = clubValues(game, id);
  const F = game.finance?.clubs?.[id];
  let n = 0;
  for (const k of CLUB_FIELDS) {
    if (values[k] === undefined) continue;
    const v = values[k];
    if (STATIC.includes(k)) {
      if (v !== cur[k]) n++;
      if (k === 'stadium') { if (v) c.stadium = v; else delete c.stadium; } else c[k] = v;
      if (v === (ORIGINAL.get(id)?.[k] ?? '')) delete rec[k]; else rec[k] = v;
      continue;
    }
    if (k !== 'capacity' && !F) continue; // klub bez finansów w grze (np. III liga): tylko nazwy
    if (v === cur[k] && rec[k] === undefined) continue;
    if (v !== cur[k]) n++;
    if (k === 'capacity') setCapacity(game, id, v); else F[k] = v;
    rec[k] = v;
  }
  if (Object.keys(rec).length) E.clubs[id] = rec; else delete E.clubs[id];
  return n;
}

/** Bieżące wartości zawodnika (do formularza). */
export function playerValues(p) {
  return {
    first: p.first ?? String(p.name ?? '').split(' ')[0] ?? '', last: p.last ?? String(p.name ?? '').split(' ').slice(1).join(' '),
    nat: p.nat, pos: p.pos, birthDate: p.birthDate ?? '', attrs: { ...p.attr }, pot: p.hidden?.POT ?? p.ovr,
  };
}

/** OVR zawodnika liczony tak jak w grze (profil pozycji z wariantem, src/training/development.js). */
export const ovrOf = (p) => ovrAt(p.attr, p.pos, offsetsFor(p));

/** Zmiana zawodnika: values po checkPlayer. Przelicza OVR, wiek i wartość. Zwraca liczbę zmienionych pól. */
export function editPlayer(game, pid, values) {
  const p = game.world?.players?.[pid];
  if (!p) return 0;
  const E = ensureEditor(game);
  const rec = { ...(E.players[pid] ?? {}) };
  const cur = playerValues(p);
  let n = 0;
  for (const k of ['first', 'last', 'nat', 'pos', 'birthDate', 'pot']) {
    if (values[k] === undefined) continue;
    if (values[k] !== cur[k]) { n++; rec[k] = values[k]; }
  }
  if (values.attrs) {
    const a = { ...(rec.attrs ?? {}) };
    for (const [k, v] of Object.entries(values.attrs)) if (v !== p.attr[k]) { n++; a[k] = v; p.attr[k] = v; }
    if (Object.keys(a).length) rec.attrs = a;
  }
  if (!n) return 0; // nic się nie zmieniło (np. pełny datapack wczytany do tej samej gry)
  if (values.first !== undefined || values.last !== undefined) {
    p.first = values.first ?? cur.first; p.last = values.last ?? cur.last;
    p.name = `${p.first} ${p.last}`.trim();
  }
  if (values.nat !== undefined) { p.nat = values.nat; p.eu = EU.has(values.nat); }
  if (values.pos !== undefined && values.pos !== p.pos) {
    p.pos = values.pos;
    if (p.variant && !VARIANTS[p.pos]?.some((x) => x.name === p.variant)) p.variant = null; // wariant należy do pozycji
  }
  if (values.birthDate !== undefined) { p.birthDate = values.birthDate; p.age = ageAt(p, game.date); }
  if (values.pot !== undefined) { p.hidden ??= {}; p.hidden.POT = values.pot; }
  p.ovr = ovrOf(p);
  const club = p.clubId ? clubObj(p.clubId) : null; // zawodnicy z zagranicy mają wartość z własnego rynku
  if (club && p.contract) p.value = marketValue(p, { tier: Math.min(3, club.tier ?? 3), date: game.date });
  if (Object.keys(rec).length) E.players[pid] = rec; else delete E.players[pid];
  return n;
}

/** Usuwa klub z datapacku i przywraca oryginalną nazwę, skrót i stadion (liczby w grze zostają). */
export function resetClub(game, id) {
  const c = clubObj(id); const o = ORIGINAL.get(id);
  if (c && o) { c.name = o.name; c.short = o.short; if (o.stadium == null) delete c.stadium; else c.stadium = o.stadium; }
  if (game.editor?.clubs) delete game.editor.clubs[id];
}

/** Usuwa zawodnika z datapacku (jego obecne dane w grze zostają). */
export function resetPlayer(game, pid) {
  if (game.editor?.players) delete game.editor.players[pid];
}

/** Czyści cały datapack gry: nazwy klubów wracają do oryginału, liczby w grze zostają. */
export function clearPack(game) {
  game.editor = { v: PACK_V, seed: game.seed, clubs: {}, players: {} };
  applyPack(game);
}

// ------------------------------------------------------------ Plik datapacku
/**
 * Datapack do pliku JSON. Domyślnie tylko zmiany z edytora. full: wszystkie kluby z kadrą i wszyscy zawodnicy
 * świata gry z bieżącymi wartościami (w tym edytowane). Pola, które nie przeszłyby walidacji importu, są pomijane,
 * więc pełny plik zawsze da się wczytać. Pola club i ovr przy zawodniku są tylko do czytania (import je pomija).
 */
export function exportPack(game, now = new Date(), { full = false } = {}) {
  const E = ensureEditor(game);
  const head = { type: PACK_TYPE, v: PACK_V, seed: game.seed, created: now.toISOString(), full };
  if (!full) return { ...head, clubs: structuredClone(E.clubs), players: structuredClone(E.players) };
  const clubs = {}; const players = {};
  for (const id of Object.keys(game.world?.clubs ?? {})) {
    if (!clubObj(id)) continue;
    const cur = Object.fromEntries(Object.entries(clubValues(game, id)).filter(([, v]) => v != null && v !== ''));
    const { value } = checkClub(cur);
    if (Object.keys(value).length) clubs[id] = value;
  }
  for (const [id, p] of Object.entries(game.world?.players ?? {})) {
    if (!ID_RE.test(id)) continue;
    const cur = playerValues(p);
    if (!cur.birthDate) delete cur.birthDate;
    if (typeof cur.pot === 'number') cur.pot = Math.round(cur.pot * 10) / 10;
    const { value } = checkPlayer(cur);
    if (!Object.keys(value).length) continue;
    players[id] = { ...value, club: p.clubId ? (clubObj(p.clubId)?.name ?? p.clubId) : null, ovr: p.ovr };
  }
  return { ...head, clubs, players };
}

/** Nazwa pliku tylko ze znaków ASCII (polskie litery psują nazwę pobieranego pliku w Chromium). */
export const packFileName = (date, { full = false } = {}) => `LigaPL27-datapack${full ? '-pelny' : ''}-${String(date).replace(/[^0-9-]/g, '')}.json`;

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

/**
 * Odczyt i ścisła walidacja pliku datapacku. Nieznane klucze są pomijane, zła wartość znanego pola odrzuca plik.
 * Zwraca { seed, clubs, players } z wartościami po walidacji. Rzuca Error z polskim komunikatem.
 */
export function parsePack(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('Plik nie jest poprawnym JSON-em.'); }
  if (!isObj(d) || d.type !== PACK_TYPE) throw new Error('To nie jest datapack LigaPL 27 (zapis gry wczytasz z ekranu startowego).');
  if (d.v !== PACK_V) throw new Error(`Datapack ma wersję ${esc0(d.v)}, a gra obsługuje wersję ${PACK_V}.`);
  if (d.seed !== undefined && d.seed !== null && !Number.isFinite(d.seed)) throw new Error('Datapack: nieprawidłowe ziarno świata.');
  if (d.clubs !== undefined && !isObj(d.clubs)) throw new Error('Datapack: sekcja klubów ma zły format.');
  if (d.players !== undefined && !isObj(d.players)) throw new Error('Datapack: sekcja zawodników ma zły format.');
  const clubs = {}; const players = {};
  for (const [id, o] of Object.entries(d.clubs ?? {})) {
    if (!ID_RE.test(id) || !isObj(o)) throw new Error('Datapack: zły wpis klubu.');
    const src = Object.fromEntries(CLUB_FIELDS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
    const r = checkClub(src);
    const bad = Object.values(r.errors)[0];
    if (bad) throw new Error(`Klub ${id}: ${bad}`);
    if (Object.keys(r.value).length) clubs[id] = r.value;
  }
  for (const [id, o] of Object.entries(d.players ?? {})) {
    if (!ID_RE.test(id) || !isObj(o)) throw new Error('Datapack: zły wpis zawodnika.');
    const src = Object.fromEntries(PLAYER_FIELDS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
    const r = checkPlayer(src);
    const bad = Object.values(r.errors)[0];
    if (bad) throw new Error(`Zawodnik ${id}: ${bad}`);
    if (r.value.attrs && !Object.keys(r.value.attrs).length) delete r.value.attrs;
    if (Object.keys(r.value).length) players[id] = r.value;
  }
  return { seed: Number.isFinite(d.seed) ? d.seed : null, clubs, players };
}
const esc0 = (v) => String(v ?? 'brak').slice(0, 12);

/**
 * Nakłada datapack (po parsePack) na grę. Kluby zawsze (identyfikatory są wspólne dla wszystkich gier),
 * zawodnicy tylko z tego samego świata (to samo ziarno), bo są losowani z ziarna gry.
 * Zwraca { clubs, clubsSkipped, players, playersSkipped, otherWorld }.
 */
export function importPack(game, pack) {
  const out = { clubs: 0, clubsSkipped: 0, players: 0, playersSkipped: 0, otherWorld: false };
  for (const [id, v] of Object.entries(pack.clubs)) {
    if (!clubObj(id)) { out.clubsSkipped++; continue; }
    editClub(game, id, v); out.clubs++;
  }
  const ids = Object.keys(pack.players);
  if (ids.length && pack.seed !== game.seed) { out.otherWorld = true; out.playersSkipped = ids.length; return out; }
  for (const id of ids) {
    const p = game.world?.players?.[id];
    if (!p) { out.playersSkipped++; continue; }
    const v = pack.players[id];
    if (v.birthDate) {
      const age = ageAt({ birthDate: v.birthDate }, game.date);
      if (age < LIMITS.ageMin || age > LIMITS.ageMax) delete v.birthDate;
    }
    editPlayer(game, id, v); out.players++;
  }
  return out;
}

/** Polskie podsumowanie importu. */
export function importSummary(r) {
  const parts = [`Kluby: zastosowano ${r.clubs}${r.clubsSkipped ? `, pominięto ${r.clubsSkipped} (nieznane)` : ''}.`];
  if (r.otherWorld) parts.push(`Zawodnicy pominięci: inny świat gry (${r.playersSkipped}).`);
  else parts.push(`Zawodnicy: zastosowano ${r.players}${r.playersSkipped ? `, pominięto ${r.playersSkipped} (brak w tej grze)` : ''}.`);
  return parts.join(' ');
}

/** Liczba wpisów w datapacku gry. */
export const packCounts = (game) => ({ clubs: Object.keys(game.editor?.clubs ?? {}).length, players: Object.keys(game.editor?.players ?? {}).length });
