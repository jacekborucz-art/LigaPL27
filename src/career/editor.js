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
import { CLUBS_L4 } from '../data/clubs_l4.js';
import { setCrestsHidden } from '../data/clubNames.js';
import { NAT_NAMES, EU } from '../data/names.js';
import { ATTRS, POS_NAMES, VARIANTS, ovrAt } from '../data/attributes.js';
import { clubFinanceData } from '../data/finanse_klubow.js';
import { offsetsFor } from '../training/development.js';
import { ageAt } from '../training/state.js';
import { marketValue } from '../world/playerGen.js';
import { infraOf, applyPlan, capacityOf } from './infrastructure.js';
import { stadiumCapacity } from './finance.js';
import { normPos, POSITIONS } from '../engine/positions.js';
import { GAME_VERSION } from '../config/version.js';
import { coachOf, COACH_KEYS, COACH_ATTRS, COACH_STYLES } from './coaches.js';
import { ownerOf, OWNER_KEYS } from './owners.js';
import { rosterOf, syncStaff, STAFF_ROLE_IDS } from './staffMarket.js';
import { completeTransfer, editorRelease } from './transfers.js';
import { computeNorm, REF_ATTRS } from './referees.js';
import { genPlayer } from '../world/playerGen.js';
import { Rng } from '../core/rng.js';

export const PACK_TYPE = 'ligapl27-datapack';
// Wersje pliku datapacku (eksport zawsze w najnowszej, import każdej od PACK_V_MIN, starsze pliki bez błędu):
//   1  v1.18 Beta: kluby (nazwa, skrót, stadion, pojemność, finanse) i zawodnicy (dane, atrybuty, potencjał)
//   2  v1.19 Beta: herb klubu, trener, sztab i właściciel klubu, pozycje dodatkowe zawodnika (alt);
//      tylko nowe pola, plik w wersji 1 wczytuje się bez zmian
export const PACK_V = 2;
export const PACK_V_MIN = 1;
/** Migracje starszych plików do bieżącej wersji: MIGRATE[v] zamienia plik z wersji v na v + 1. */
const MIGRATE = {
  1: (d) => d, // wersja 2 tylko dodaje pola
};
export const LIMITS = {
  name: 40, short: 5, stadium: 60,
  capMin: 500, capMax: 100000,
  balanceMin: -1e9, moneyMax: 1e10,
  attrMin: 1, attrMax: 20,
  ageMin: 15, ageMax: 45,
};
export const CLUB_FIELDS = ['name', 'short', 'stadium', 'crest', 'capacity', 'balance', 'transferBudget', 'wageBudget'];
export const PLAYER_FIELDS = ['first', 'last', 'nat', 'pos', 'birthDate', 'attrs', 'pot', 'alt'];
// Pozycje dodatkowe (p.alt: biegłość 0-90 %, jak nauka pozycji na treningu, src/engine/positions.js): bez bramki
export const ALT_POSITIONS = POSITIONS.filter((x) => x !== 'BR');
export const ALT_MAX = 90; // pozycja dodatkowa nigdy nie daje pełnej biegłości naturalnej (LEARNED_CAP)
const sameAlt = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());
const STATIC = ['name', 'short', 'stadium', 'crest'];
// Własny herb klubu w datapacku: obrazek wpisany w plik (data URL), więc działa u każdego, kto wczyta plik
export const CREST_MAX = 120000; // znaków; herb z edytora (128 px) ma kilka do kilkunastu tysięcy
const CREST_RE = /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
const ATTR_KEYS = Object.keys(ATTRS);

// Oryginalne wartości statycznych danych klubów: zdjęte raz, przy wczytaniu modułu (przed jakąkolwiek grą).
const known = () => [...CLUBS_PL, ...CLUBS_L3];
// Wszystkie polskie kluby (także IV liga z rezerwami): nazwy kariery zapisane w grze (game.names)
const allClubs = () => [...CLUBS_PL, ...CLUBS_L3, ...CLUBS_L4];
const ORIGINAL = new Map(allClubs().map((c) => [c.id, { name: c.name, short: c.short, stadium: c.stadium ?? null }]));
const clubObj = (id) => known().find((c) => c.id === id) ?? null;

/** Przywraca oryginalne nazwy, skróty i stadiony wszystkich klubów. */
export function restoreOriginals() {
  setCrestsHidden(false);
  for (const c of allClubs()) {
    const o = ORIGINAL.get(c.id);
    if (!o) continue;
    c.name = o.name; c.short = o.short;
    if (o.stadium == null) delete c.stadium; else c.stadium = o.stadium;
    delete c.crest; // własny herb tylko z datapacku gry
  }
}

/** Nazwy i skróty wszystkich klubów w tej chwili, { id: [nazwa, skrót] } (zapis kariery i plik JSON zapisu). */
export const clubNamesSnapshot = () => Object.fromEntries(allClubs().map((c) => [c.id, [c.name, c.short]]));

/**
 * Kariera zachowuje nazwy klubów, z którymi grała: przy pierwszym wczytaniu (albo starcie) zapisujemy je w grze,
 * a później nakładamy z zapisu, więc kolejna zmiana nazw w aktualizacji gry nie zmienia kariery ani jej pliku JSON.
 * Kluby spoza zapisu (nowe w aktualizacji) mają nazwy z danych gry.
 */
export function applySavedNames(game) {
  if (!game || typeof game !== 'object' || !game.world) return;
  if (!game.names || typeof game.names !== 'object') { game.names = clubNamesSnapshot(); return; }
  for (const c of allClubs()) {
    const n = game.names[c.id];
    if (!Array.isArray(n)) continue;
    if (typeof n[0] === 'string' && n[0]) c.name = n[0];
    if (typeof n[1] === 'string' && n[1]) c.short = n[1];
  }
}

/** Oryginał statycznego pola klubu (do porównań i podpowiedzi w formularzu). */
export const originalOf = (id, field) => ORIGINAL.get(id)?.[field] ?? null;

/** Nakłada zmiany z game.editor na wspólne obiekty klubów (po przywróceniu oryginałów). Wołać przy wczytaniu gry. */
export function applyPack(game) {
  restoreOriginals();
  applySavedNames(game);
  const E = game?.editor;
  setCrestsHidden(!!E?.packLoaded); // gra z wczytanym datapackiem: tarcze w barwach zamiast herbów
  if (!E?.clubs) return;
  for (const [id, o] of Object.entries(E.clubs)) {
    const c = clubObj(id);
    if (!c || !o) continue;
    if (typeof o.name === 'string' && o.name) c.name = o.name;
    if (typeof o.short === 'string' && o.short) c.short = o.short;
    if (typeof o.stadium === 'string') { if (o.stadium) c.stadium = o.stadium; else delete c.stadium; }
    if (typeof o.crest === 'string' && CREST_RE.test(o.crest)) c.crest = o.crest;
  }
}

export function ensureEditor(game) {
  if (!game.editor || typeof game.editor !== 'object') game.editor = { v: PACK_V, seed: game.seed, clubs: {}, players: {} };
  game.editor.clubs ??= {}; game.editor.players ??= {};
  game.editor.v = PACK_V; // datapack w zapisie gry: nowe pola są dodatkami, więc zapis ze starszej wersji pasuje bez zmian
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
  if (src.crest !== undefined) {
    const s = src.crest;
    put('crest', s === '' ? { v: '' }
      : typeof s !== 'string' || !CREST_RE.test(s) ? { err: 'Herb: obrazek WEBP, PNG albo JPG.' }
        : s.length > CREST_MAX ? { err: 'Herb: obrazek jest za duży.' } : { v: s });
  }
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
  if (src.alt !== undefined) {
    if (!isObj(src.alt)) errors.alt = 'Pozycje dodatkowe: oczekiwano listy pozycji.';
    else {
      const a = {};
      for (const [k0, v] of Object.entries(src.alt)) {
        const k = normPos(k0);
        if (!ALT_POSITIONS.includes(k)) { errors.alt = `Pozycje dodatkowe: nieznana pozycja ${String(k0).slice(0, 6)}.`; continue; }
        const r = num(v, { label: `Dopasowanie do pozycji ${k}`, min: 0, max: ALT_MAX, int: false, form });
        if (r.err) errors.alt = r.err; else if (r.v > 0) a[k] = r.v;
      }
      value.alt = a;
    }
  }
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
    name: c?.name ?? id, short: c?.short ?? '', stadium: c?.stadium ?? '', crest: c?.crest ?? '', capacity: clubCapacity(game, id),
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
      if (k === 'stadium' || k === 'crest') { if (v) c[k] = v; else delete c[k]; } else c[k] = v;
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

// ------------------------------------------------------------ Trener, sztab i właściciel klubu
// W datapacku przy klubie: coach { name, age, style, a: { TAK, ... } }, owner { name, cierpliwosc, ... },
// staff { rola: [{ name, age, q }, ...] } (osoby w kolejności sztabu klubu, więc plik działa też w innym świecie gry).
// Trener i właściciel to obecni ludzie klubu w chwili wczytania pliku. Trener klubu gracza to gracz (bez edycji).
export const OWNER_LABELS = { cierpliwosc: 'Cierpliwość', ambicja: 'Ambicja', temperament: 'Temperament', media: 'Wrażliwość na media', zasobnosc: 'Zasobność' };
export const PERSON_AGE = { min: 18, max: 85 };
const COACH_LABELS = Object.fromEntries(COACH_KEYS.map((k) => [k, COACH_ATTRS[k].name]));

function attrs1to20(src, keys, labels, form, errors, prefix) {
  const a = {};
  for (const k of keys) {
    if (src[k] === undefined) continue;
    const r = num(src[k], { label: labels[k], min: 1, max: 20, form });
    if (r.err) errors[`${prefix}${k}`] = r.err; else a[k] = r.v;
  }
  return a;
}
const personName = (v) => text(v, { label: 'Imię i nazwisko', max: LIMITS.name, min: 2 });
const personAge = (v, form) => num(v, { label: 'Wiek', min: PERSON_AGE.min, max: PERSON_AGE.max, form });

/** Sprawdza trenera { name, age, style, a }. Zwraca { value, errors } (errors: a.TAK itd. dla atrybutów). */
export function checkCoach(src, { form = false } = {}) {
  const value = {}; const errors = {};
  if (!isObj(src)) return { value, errors: { coach: 'Trener: zły format.' } };
  const put = (k, r) => { if (r.err) errors[k] = r.err; else value[k] = r.v; };
  if (src.name !== undefined) put('name', personName(src.name));
  if (src.age !== undefined) put('age', personAge(src.age, form));
  if (src.style !== undefined) put('style', typeof src.style === 'string' && COACH_STYLES[src.style] ? { v: src.style } : { err: 'Styl: wybierz z listy.' });
  if (src.a !== undefined) {
    if (!isObj(src.a)) errors.a = 'Atrybuty trenera: oczekiwano listy wartości.';
    else value.a = attrs1to20(src.a, COACH_KEYS, COACH_LABELS, form, errors, 'a.');
  }
  return { value, errors };
}

/** Sprawdza właściciela { name, cierpliwosc, ambicja, temperament, media, zasobnosc }. */
export function checkOwner(src, { form = false } = {}) {
  const value = {}; const errors = {};
  if (!isObj(src)) return { value, errors: { owner: 'Właściciel: zły format.' } };
  if (src.name !== undefined) { const r = text(src.name, { label: 'Właściciel', max: LIMITS.name, min: 2 }); if (r.err) errors.name = r.err; else value.name = r.v; }
  Object.assign(value, attrs1to20(src, OWNER_KEYS, OWNER_LABELS, form, errors, ''));
  return { value, errors };
}

/** Sprawdza sztab { rola: [{ name, age, q }] }. Błędy: rola.numer.pole. */
export function checkStaff(src, { form = false } = {}) {
  const value = {}; const errors = {};
  if (!isObj(src)) return { value, errors: { staff: 'Sztab: zły format.' } };
  for (const [role, list] of Object.entries(src)) {
    if (!STAFF_ROLE_IDS.includes(role) || !Array.isArray(list) || list.length > 12) { errors.staff = 'Sztab: zły wpis roli.'; continue; }
    value[role] = list.map((o, i) => {
      const v = {};
      if (!isObj(o)) { errors[`${role}.${i}`] = 'Sztab: zły wpis osoby.'; return v; }
      const put = (k, r) => { if (r.err) errors[`${role}.${i}.${k}`] = r.err; else v[k] = r.v; };
      if (o.name !== undefined) put('name', personName(o.name));
      if (o.age !== undefined) put('age', personAge(o.age, form));
      if (o.q !== undefined) put('q', num(o.q, { label: 'Jakość', min: 1, max: 20, form }));
      return v;
    });
  }
  return { value, errors };
}

/** Obecni ludzie klubu (do formularza i pełnego datapacku): { coach, owner, staff }. Kluby bez kadry: null. */
export function peopleValues(game, id) {
  if (!game.world?.clubs?.[id]) return { coach: null, owner: null, staff: null };
  const co = id === game.clubId ? null : coachOf(game, id);
  const ow = ownerOf(game, id);
  let staff = null;
  for (const p of rosterOf(game, id)) ((staff ??= {})[p.role] ??= []).push({ name: p.name, age: p.age, q: p.q });
  return {
    coach: co ? { name: co.name, age: co.age, style: co.style, a: { ...co.a } } : null,
    owner: ow ? { name: ow.name, ...Object.fromEntries(OWNER_KEYS.map((k) => [k, ow[k]])) } : null,
    staff,
  };
}

/** Zapis sekcji ludzi klubu w datapacku (pełne bieżące wartości sekcji). */
function recordPeople(game, id, key) {
  const E = ensureEditor(game);
  const val = peopleValues(game, id)[key];
  const rec = { ...(E.clubs[id] ?? {}) };
  if (val) rec[key] = val; else delete rec[key];
  if (Object.keys(rec).length) E.clubs[id] = rec; else delete E.clubs[id];
}

/** Zmiana trenera klubu AI (values po checkCoach). Zwraca liczbę zmienionych pól. */
export function editCoach(game, id, v) {
  if (id === game.clubId || !game.world?.clubs?.[id]) return 0;
  const co = coachOf(game, id);
  if (!co) return 0;
  let n = 0;
  for (const k of ['name', 'age', 'style']) if (v[k] !== undefined && v[k] !== co[k]) { co[k] = v[k]; n++; }
  for (const [k, x] of Object.entries(v.a ?? {})) if (co.a?.[k] !== x) { co.a[k] = x; n++; }
  if (n) recordPeople(game, id, 'coach');
  return n;
}

/** Zmiana właściciela klubu (values po checkOwner). Typ właściciela zostaje (zależą od niego finanse). */
export function editOwner(game, id, v) {
  if (!game.world?.clubs?.[id]) return 0;
  const ow = ownerOf(game, id);
  if (!ow) return 0;
  let n = 0;
  for (const k of ['name', ...OWNER_KEYS]) if (v[k] !== undefined && v[k] !== ow[k]) { ow[k] = v[k]; n++; }
  if (n) recordPeople(game, id, 'owner');
  return n;
}

/** Zmiana osób sztabu (values po checkStaff): i-ta osoba roli w kolejności sztabu klubu. Nadmiarowe wpisy pomijane. */
export function editStaff(game, id, v) {
  if (!game.world?.clubs?.[id]) return 0;
  const roster = rosterOf(game, id);
  let n = 0;
  for (const [role, list] of Object.entries(v)) {
    const ppl = roster.filter((p) => p.role === role);
    list.forEach((o, i) => {
      const p = ppl[i];
      if (!p) return;
      for (const k of ['name', 'age', 'q']) if (o[k] !== undefined && o[k] !== p[k]) { p[k] = o[k]; n++; }
    });
  }
  if (n) { syncStaff(game, id); recordPeople(game, id, 'staff'); }
  return n;
}

// ------------------------------------------------------------ Kadra: wolni zawodnicy do klubu i z klubu
// Edytor zmienia dane gry, nie decyzje klubów: bez opłat i negocjacji, ale z limitem kadry pierwszej drużyny.
export const EDIT_SQUAD = { min: 21, max: 32 };
export const squadSize = (game, clubId) => game.world?.clubs?.[clubId]?.squad?.length ?? 0;
/** Koniec sezonu (rok) dla daty, np. 2026-10-01 -> 2027. */
const seasonEndYear = (date) => Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) >= 7 ? 1 : 0);

/** Czy zawodnika można przenieść z kadry do wolnych (tekst powodu albo ''). */
export function releaseBlock(game, pid) {
  const p = game.world?.players?.[pid];
  if (!p?.clubId || !game.world.clubs[p.clubId]) return 'Zawodnik nie ma klubu.';
  if (p.loan) return 'Zawodnik jest wypożyczony: najpierw zakończ wypożyczenie w grze.';
  const n = squadSize(game, p.clubId);
  if (n <= EDIT_SQUAD.min) return `Kadra ma ${n} zawodników, a minimum to ${EDIT_SQUAD.min}.`;
  return '';
}
/** Czy wolnego zawodnika można dodać do kadry klubu (tekst powodu albo ''). */
export function joinBlock(game, pid, clubId) {
  const p = game.world?.players?.[pid];
  if (!p || p.clubId || !game.market?.free?.includes(pid)) return 'To nie jest wolny zawodnik.';
  if (!game.world.clubs[clubId]) return 'Ten klub nie ma kadry w grze.';
  const n = squadSize(game, clubId);
  if (n >= EDIT_SQUAD.max) return `Kadra ma ${n} zawodników, a maksimum to ${EDIT_SQUAD.max}.`;
  return '';
}
function recordTeam(game, pid) {
  const E = ensureEditor(game);
  if (E.created?.[pid]) return; // nowy zawodnik: klub zapisuje się przy nim w sekcji created
  E.players[pid] = { ...(E.players[pid] ?? {}), team: game.world.players[pid].clubId ?? null };
}
/** Zawodnik z kadry do wolnych (bez kosztów). Zwraca '' albo powód odmowy. */
export function releaseToFree(game, pid) {
  const why = releaseBlock(game, pid);
  if (why) return why;
  editorRelease(game, pid);
  recordTeam(game, pid);
  return '';
}
/** Wolny zawodnik do kadry klubu: kontrakt do końca następnego sezonu, pensja jak jego oczekiwania. */
export function joinFromFree(game, pid, clubId) {
  const why = joinBlock(game, pid, clubId);
  if (why) return why;
  const p = game.world.players[pid];
  const wage = Math.max(1000, Math.round((p.askWage || 0) / 100) * 100);
  completeTransfer(game, { playerId: pid, to: clubId, kind: 'free', contract: { wage, until: `${seasonEndYear(game.date) + 1}-06-30`, clause: 0 } });
  recordTeam(game, pid);
  return '';
}

/** Wolni zawodnicy do dodania (najwyżej cap, od najwyższego OVR), z wyszukiwaniem po imieniu i nazwisku. */
export function freeAgents(game, q = '', cap = 60) {
  const f = String(q).toLowerCase().trim();
  const all = (game.market?.free ?? []).map((id) => game.world.players[id]).filter((p) => p && !p.clubId && (!f || String(p.name).toLowerCase().includes(f)));
  all.sort((a, b) => b.ovr - a.ovr);
  return { total: all.length, rows: all.slice(0, cap) };
}

// ------------------------------------------------------------ Nowy wolny zawodnik (narodowość z całego świata)
export const NEW_LEVEL = { min: 3, max: 18 };
const tierForLevel = (L) => (L >= 11 ? 1 : L >= 9.5 ? 2 : L >= 8 ? 3 : 4);

/** Sprawdza dane nowego zawodnika: { first, last, nat, pos, age, level }. */
export function checkNewPlayer(src, { form = false } = {}) {
  const r = checkPlayer({ first: src.first, last: src.last, nat: src.nat, pos: src.pos }, { form });
  const put = (k, x) => { if (x.err) r.errors[k] = x.err; else r.value[k] = x.v; };
  for (const k of ['first', 'last']) if (!r.value[k] && !r.errors[k]) r.errors[k] = `${k === 'first' ? 'Imię' : 'Nazwisko'}: pole nie może być puste.`;
  put('age', num(src.age, { label: 'Wiek', min: LIMITS.ageMin, max: LIMITS.ageMax, form }));
  put('level', num(src.level, { label: 'Poziom', min: NEW_LEVEL.min, max: NEW_LEVEL.max, int: false, form }));
  return r;
}

/** Tworzy wolnego zawodnika (atrybuty losowane z poziomu i pozycji, jak u wolnych zawodników w grze). */
export function createFreePlayer(game, v, id = `ed-${Date.now().toString(36)}-${(ensureEditor(game).seq = (game.editor.seq ?? 0) + 1)}`) {
  const rng = new Rng(`edytor-zawodnik:${id}`);
  const L = v.level; const tier = tierForLevel(L);
  const p = genPlayer(rng, { id, L, pos: v.pos, age: v.age, nat: v.nat, tier, club: { id: 'wolny', tier, prestige: 2, L }, date: game.date });
  p.first = v.first; p.last = v.last; p.name = `${v.first} ${v.last}`.trim(); p.nat = v.nat; p.eu = EU.has(v.nat);
  p.clubId = null; p.free = true; p.askWage = p.contract?.wage ?? 1000; p.contract = null; p.wage = 0; p.freeSince = game.date;
  game.world.players[id] = p;
  game.market.free.push(id);
  const E = ensureEditor(game);
  (E.created ??= {})[id] = 1;
  return p;
}

/** Nowi zawodnicy z edytora do pliku: pełne dane (działają w każdym świecie gry) i klub. */
function exportCreated(game) {
  const out = {};
  for (const id of Object.keys(game.editor?.created ?? {})) {
    const p = game.world?.players?.[id];
    if (!p) continue;
    const cur = playerValues(p);
    if (!cur.birthDate) delete cur.birthDate;
    if (typeof cur.pot === 'number') cur.pot = Math.round(cur.pot * 10) / 10;
    const { value } = checkPlayer(cur);
    out[id] = { ...value, team: p.clubId ?? null };
  }
  return out;
}

// ------------------------------------------------------------ Sędziowie
export const REF_LIMITS = { ageMin: 20, ageMax: 60, strictMin: 0.7, strictMax: 1.4 };
/** Bieżące wartości sędziego (do formularza i datapacku). */
export function refValues(game, r) {
  return { name: r.n, age: Number(game.date.slice(0, 4)) - r.b, a: [...r.a], e: r.e, s: r.s };
}
/** Sprawdza sędziego { name, age, a: [7 atrybutów], e, s }. Błędy atrybutów: a.0 ... a.6. */
export function checkReferee(src, { form = false } = {}) {
  const value = {}; const errors = {};
  if (!isObj(src)) return { value, errors: { ref: 'Sędzia: zły format.' } };
  const put = (k, r) => { if (r.err) errors[k] = r.err; else value[k] = r.v; };
  if (src.name !== undefined) put('name', personName(src.name));
  if (src.age !== undefined) put('age', num(src.age, { label: 'Wiek', min: REF_LIMITS.ageMin, max: REF_LIMITS.ageMax, form }));
  if (src.a !== undefined) {
    if (!Array.isArray(src.a) || src.a.length !== REF_ATTRS.length) errors.a = `Atrybuty sędziego: oczekiwano ${REF_ATTRS.length} wartości.`;
    else {
      value.a = src.a.map((x, i) => { const r = num(x, { label: REF_ATTRS[i], min: 1, max: 20, form }); if (r.err) errors[`a.${i}`] = r.err; return r.v; });
    }
  }
  if (src.e !== undefined) put('e', num(src.e, { label: 'Doświadczenie', min: 1, max: 20, form }));
  if (src.s !== undefined) {
    const r = num(src.s, { label: 'Surowość', min: REF_LIMITS.strictMin, max: REF_LIMITS.strictMax, int: false, form });
    put('s', r.err ? r : { v: Math.round(r.v * 100) / 100 });
  }
  return { value, errors };
}
/** Zmiana sędziego (values po checkReferee). Surowość zmienia średnią listy (normalizacja dla silnika). */
export function editReferee(game, rid, v) {
  const R = game.refs; const r = R?.list?.find((x) => x.id === rid);
  if (!r) return 0;
  let n = 0;
  if (v.name !== undefined && v.name !== r.n) { r.n = v.name; n++; }
  if (v.age !== undefined) { const b = Number(game.date.slice(0, 4)) - v.age; if (b !== r.b) { r.b = b; n++; } }
  if (v.a) v.a.forEach((x, i) => { if (x !== undefined && x !== r.a[i]) { r.a[i] = x; n++; } });
  if (v.e !== undefined && v.e !== r.e) { r.e = v.e; n++; }
  if (v.s !== undefined && v.s !== r.s) { r.s = v.s; n++; R.norm = computeNorm(R); }
  if (n) { const E = ensureEditor(game); (E.refs ??= {})[rid] = refValues(game, r); }
  return n;
}

/** Bieżące wartości zawodnika (do formularza). */
export function playerValues(p) {
  return {
    first: p.first ?? String(p.name ?? '').split(' ')[0] ?? '', last: p.last ?? String(p.name ?? '').split(' ').slice(1).join(' '),
    nat: p.nat, pos: p.pos, birthDate: p.birthDate ?? '', attrs: { ...p.attr }, pot: p.hidden?.POT ?? p.ovr,
    alt: Object.fromEntries(Object.entries(p.alt ?? {}).filter(([k, v]) => k !== p.pos && ALT_POSITIONS.includes(k) && v > 0).map(([k, v]) => [k, Math.min(ALT_MAX, Math.round(v * 10) / 10)])),
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
  if (values.alt !== undefined) {
    const pos = values.pos ?? p.pos;
    const alt = Object.fromEntries(Object.entries(values.alt).filter(([k]) => k !== pos)); // pozycja główna to 100 %
    if (!sameAlt(alt, cur.alt)) { n++; p.alt = alt; rec.alt = alt; }
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
  if (c && o) { c.name = o.name; c.short = o.short; if (o.stadium == null) delete c.stadium; else c.stadium = o.stadium; delete c.crest; }
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
  const head = { type: PACK_TYPE, v: PACK_V, game: GAME_VERSION, seed: game.seed, created: now.toISOString(), full };
  if (!full) return { ...head, clubs: structuredClone(E.clubs), players: structuredClone(E.players) };
  const clubs = {}; const players = {};
  for (const id of Object.keys(game.world?.clubs ?? {})) {
    if (!clubObj(id)) continue;
    const cur = Object.fromEntries(Object.entries(clubValues(game, id)).filter(([, v]) => v != null && v !== ''));
    const { value } = checkClub(cur);
    const ppl = peopleValues(game, id); // trener, właściciel i sztab z bieżącymi wartościami
    if (ppl.coach) { const r = checkCoach(ppl.coach); if (!Object.keys(r.errors).length) value.coach = r.value; }
    if (ppl.owner) { const r = checkOwner(ppl.owner); if (!Object.keys(r.errors).length) value.owner = r.value; }
    if (ppl.staff) { const r = checkStaff(ppl.staff); if (!Object.keys(r.errors).length) value.staff = r.value; }
    if (Object.keys(value).length) clubs[id] = value;
  }
  for (const [id, p] of Object.entries(game.world?.players ?? {})) {
    if (!ID_RE.test(id)) continue;
    const cur = playerValues(p);
    if (!cur.birthDate) delete cur.birthDate;
    if (typeof cur.pot === 'number') cur.pot = Math.round(cur.pot * 10) / 10;
    if (!Object.keys(cur.alt).length) delete cur.alt; // bez pozycji dodatkowych: pole pominięte
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
  if (!Number.isInteger(d.v) || d.v < PACK_V_MIN) throw new Error(`Datapack ma nieznaną wersję ${esc0(d.v)}, a gra obsługuje wersje od ${PACK_V_MIN} do ${PACK_V}.`);
  if (d.v > PACK_V) throw new Error(`Datapack ma wersję ${d.v} z nowszej gry, a ta gra obsługuje wersje od ${PACK_V_MIN} do ${PACK_V}. Zaktualizuj grę.`);
  for (let v = d.v; v < PACK_V; v++) d = MIGRATE[v](d); // starszy plik: migracja do bieżącej wersji
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
    // Trener, właściciel i sztab klubu
    for (const [k, check] of [['coach', checkCoach], ['owner', checkOwner], ['staff', checkStaff]]) {
      if (o[k] === undefined) continue;
      const p = check(o[k]);
      const e = Object.values(p.errors)[0];
      if (e) throw new Error(`Klub ${id}: ${e}`);
      r.value[k] = p.value;
    }
    if (Object.keys(r.value).length) clubs[id] = r.value;
  }
  for (const [id, o] of Object.entries(d.players ?? {})) {
    if (!ID_RE.test(id) || !isObj(o)) throw new Error('Datapack: zły wpis zawodnika.');
    const src = Object.fromEntries(PLAYER_FIELDS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
    if (src.pos !== undefined) src.pos = normPos(src.pos); // starsze datapacki: SP (boczny pomocnik) -> BP
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
  ensureEditor(game).packLoaded = true; setCrestsHidden(true); // od wczytania pliku: tarcze w barwach zamiast herbów
  for (const [id, v] of Object.entries(pack.clubs)) {
    if (!clubObj(id)) { out.clubsSkipped++; continue; }
    editClub(game, id, v); out.clubs++;
    if (v.coach) editCoach(game, id, v.coach);
    if (v.owner) editOwner(game, id, v.owner);
    if (v.staff) editStaff(game, id, v.staff);
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
