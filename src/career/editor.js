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
import { rivalKey, setRivalOverrides, baseRivalry, listedRivalsOf } from '../data/kibice.js';
import { NAT_NAMES, EU } from '../data/names.js';
import { ATTRS, POS_NAMES, VARIANTS, ovrAt } from '../data/attributes.js';
import { clubFinanceData, payLevel } from '../data/finanse_klubow.js';
import { marketWage } from './negotiation.js';
import { offsetsFor } from '../training/development.js';
import { ageAt } from '../training/state.js';
import { marketValue } from '../world/playerGen.js';
import { infraOf, applyPlan, capacityOf } from './infrastructure.js';
import { stadiumCapacity } from './finance.js';
import { normPos, POSITIONS } from '../engine/positions.js';
import { INJURY_TYPES } from '../engine/match/constants.js';
import { GAME_VERSION } from '../config/version.js';
import { coachOf, COACH_KEYS, COACH_ATTRS, COACH_STYLES } from './coaches.js';
import { ownerOf, OWNER_KEYS } from './owners.js';
import { rosterOf, syncStaff, STAFF_ROLE_IDS, directorOf, ensureEditorDirector } from './staffMarket.js';
import { roleAttrKeys, ensurePersonAttrs, shiftPersonQ, qFromAttrs, migrateScoutAttrs } from '../training/staff.js';
import { SCOUT_REGION } from './scoutRegions.js';
import { ROLE_ATTRS, DIRECTOR_ROLE, staffCap, isCappedRole, staffRescale } from '../training/config.js';
import { completeTransfer, editorRelease } from './transfers.js';
import { computeNorm, REF_ATTRS } from './referees.js';
import { genPlayer } from '../world/playerGen.js';
import { Rng, clamp } from '../core/rng.js';

export const PACK_TYPE = 'ligapl27-datapack';
// Wersje pliku datapacku (eksport zawsze w najnowszej, import każdej od PACK_V_MIN, starsze pliki bez błędu):
//   1  v1.18 Beta: kluby (nazwa, skrót, stadion, pojemność, finanse) i zawodnicy (dane, atrybuty, potencjał)
//   2  v1.19 Beta: herb klubu, trener, sztab i właściciel klubu, pozycje dodatkowe zawodnika (alt);
//      tylko nowe pola, plik w wersji 1 wczytuje się bez zmian
//   3  v1.19 Beta: atrybuty osób sztabu (staff: { rola: [{ name, age, q, a: { atrybut: 1-20 } }] }, docs/sztab-atrybuty.md);
//      plik bez atrybutów (v1, v2): jakość q przesuwa cały profil osoby, jak dotąd
//   4  v1.19 Beta: najwięksi rywale klubu (rivals: { id klubu: intensywność 0-3 }, 0 = bez rywalizacji); tylko nowe pole
//   5  v1.20 Beta: skaut z 5 atrybutami (DOS, OCE, RYN, SIE, CHA zamiast POT, OCU, RYN) i regionami
//      (reg: { region: 1-20 }, najwyżej 3, docs/skauting.md); plik v4 przelicza stare atrybuty skauta (MIGRATE[4])
//   6  v1.23 Beta: dyrektor sportowy w sekcji staff (rola 'dyrektor', najwyżej 1 osoba, atrybuty NEG, RYN, SIE, KAD,
//      docs/dyrektor-sportowy.md); tylko nowa rola, plik v5 wczytuje się bez zmian
//   7  v1.23 Beta: sztab poza fizjoterapeutą i dyrektorem na skali 1-12 (q i atrybuty, docs/sztab-atrybuty.md);
//      plik v1-v6: wartości tych ról przeliczone ze skali 1-20 (x 11/16, 17 -> 12) i przycięte do 12 (MIGRATE[6])
export const PACK_V = 7;
export const PACK_V_MIN = 1;
export const SCOUT_REG_MAX = 3; // regionów na skauta w pliku
/** Skaut w pliku v1-v4: stare atrybuty (POT, OCU, RYN) na 5 nowych; odchylenia sieci i charakteru z imienia osoby. */
function migrateScoutEntry(o) {
  if (!isObj(o) || !isObj(o.a) || (o.a.POT === undefined && o.a.OCU === undefined)) return o;
  const vals = ['POT', 'OCU', 'RYN'].map((k) => o.a[k]).filter((x) => typeof x === 'number');
  const q = typeof o.q === 'number' ? o.q : vals.length ? Math.round(vals.reduce((s, x) => s + x, 0) / vals.length) : 10;
  return { ...o, a: migrateScoutAttrs(o.a, q, typeof o.age === 'number' ? o.age : 45, `datapack:${String(o.name ?? '')}`) };
}
/** Sekcja klubów pliku: skauci przeliczeni na 5 atrybutów (dane gracza bez zmian poza atrybutami skautów). */
export function migrateScoutClubs(clubs) {
  if (!isObj(clubs)) return clubs;
  const out = {};
  for (const [id, c] of Object.entries(clubs)) {
    out[id] = isObj(c) && isObj(c.staff) && Array.isArray(c.staff.skaut) ? { ...c, staff: { ...c.staff, skaut: c.staff.skaut.map(migrateScoutEntry) } } : c;
  }
  return out;
}
/** Migracje starszych plików do bieżącej wersji: MIGRATE[v] zamienia plik z wersji v na v + 1. */
const MIGRATE = {
  1: (d) => d, // wersja 2 tylko dodaje pola
  2: (d) => d, // wersja 3 tylko dodaje atrybuty sztabu (bez nich działa sama jakość)
  3: (d) => d, // wersja 4 tylko dodaje rywali klubu
  4: (d) => ({ ...d, clubs: migrateScoutClubs(d.clubs) }), // wersja 5: skaut z 5 atrybutami i regionami
  5: (d) => d, // wersja 6 tylko dodaje dyrektora sportowego w sekcji staff
  6: (d) => ({ ...d, clubs: rescaleStaffClubs(d.clubs) }), // wersja 7: sztab na skali 1-12
};
/** Sekcja klubów pliku v1-v6: jakość i atrybuty sztabu (poza fizjoterapeutą i dyrektorem) na skali 1-12. */
export function rescaleStaffClubs(clubs) {
  if (!isObj(clubs)) return clubs;
  const one = (role, o) => {
    if (!isObj(o) || !isCappedRole(role)) return o;
    const out = { ...o };
    if (typeof o.q === 'number') out.q = staffRescale(role, o.q);
    if (isObj(o.a)) out.a = Object.fromEntries(Object.entries(o.a).map(([k, x]) => [k, typeof x === 'number' ? staffRescale(role, x) : x]));
    return out;
  };
  const out = {};
  for (const [id, c] of Object.entries(clubs)) {
    if (!isObj(c) || !isObj(c.staff)) { out[id] = c; continue; }
    out[id] = { ...c, staff: Object.fromEntries(Object.entries(c.staff).map(([role, list]) => [role, Array.isArray(list) ? list.map((o) => one(role, o)) : list])) };
  }
  return out;
}
export const LIMITS = {
  name: 40, short: 5, stadium: 60,
  capMin: 500, capMax: 100000,
  balanceMin: -1e9, moneyMax: 1e10,
  attrMin: 1, attrMax: 20,
  ageMin: 15, ageMax: 45,
};
export const CLUB_FIELDS = ['name', 'short', 'stadium', 'crest', 'capacity', 'balance', 'transferBudget', 'wageBudget', 'rivals'];
export const RIVALS_MAX = 12; // rywali na klub w pliku
export const PLAYER_FIELDS = ['first', 'last', 'nat', 'pos', 'birthDate', 'attrs', 'pot', 'alt', 'injury', 'team'];
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
  setRivalOverrides({}); // rywalizacje tylko z danych gry
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
  setRivalOverrides(E?.rivals); // najwięksi rywale z edytora (data/kibice.js)
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
  if ((game.editor.v ?? PACK_V) < 5) game.editor.clubs = migrateScoutClubs(game.editor.clubs); // skauci z 5 atrybutami
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
  if (src.rivals !== undefined) put('rivals', checkRivals(src.rivals));
  return { value, errors };
}

/** Rywale klubu z pliku: { id klubu: 0-3 } (0 = bez rywalizacji), znane kluby, najwyżej RIVALS_MAX. */
function checkRivals(o) {
  if (!isObj(o)) return { err: 'Rywale: zły format.' };
  const e = Object.entries(o);
  if (e.length > RIVALS_MAX) return { err: `Rywale: najwyżej ${RIVALS_MAX} klubów.` };
  const v = {};
  for (const [id, x] of e) {
    if (!clubObj(id)) return { err: `Rywale: nieznany klub ${String(id).slice(0, 30)}.` };
    if (!Number.isInteger(x) || x < 0 || x > 3) return { err: 'Rywale: intensywność od 0 do 3.' };
    v[id] = x;
  }
  return { v };
}

/**
 * Rywalizacja pary klubów (edytor, datapack): intensywność 0-3 (0 = bez rywalizacji, także zamiast derby z regionu).
 * Wartość równa danym gry usuwa nadpisanie. Zwraca 1 przy zmianie, inaczej 0.
 */
export function editRival(game, id, other, v) {
  if (!clubObj(id) || !clubObj(other) || id === other || !Number.isInteger(v) || v < 0 || v > 3) return 0;
  const E = ensureEditor(game);
  const key = rivalKey(id, other);
  const cur = E.rivals?.[key];
  const base = baseRivalry(id, other);
  const sameAsBase = v === base && (v > 0 || !sameRegion(id, other));
  if (sameAsBase) { if (cur === undefined) return 0; delete E.rivals[key]; }
  else { if (cur === v) return 0; (E.rivals ??= {})[key] = v; }
  setRivalOverrides(E.rivals);
  return 1;
}
const sameRegion = (a, b) => { const A = clubObj(a); const B = clubObj(b); return !!(A?.region && A.region === B?.region && !A.parent && !B.parent); };

/** Rywale klubu do formularza i pliku: lista z danych gry i edytora plus usunięte pary (0). */
export function rivalsOf(game, id) {
  const out = Object.fromEntries(listedRivalsOf(id).map((x) => [x.id, x.v]));
  for (const [k, v] of Object.entries(game.editor?.rivals ?? {})) {
    const [a, b] = k.split('|');
    if (v === 0 && (a === id || b === id)) out[a === id ? b : a] = 0;
  }
  return out;
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
  if (src.injury !== undefined) { // kontuzja: null = zdrowy, albo { name, days }
    if (src.injury === null) value.injury = null;
    else if (!isObj(src.injury)) errors.injury = 'Kontuzja: zły format.';
    else {
      const nm = text(src.injury.name, { label: 'Rodzaj kontuzji', max: INJ_NAME_MAX, min: 2 });
      const d = num(src.injury.days, { label: 'Dni kontuzji', min: 1, max: INJ_DAYS_MAX, form });
      if (nm.err) errors.injury = nm.err; else if (d.err) errors.injury = d.err; else value.injury = { name: nm.v, days: d.v };
    }
  }
  if (src.team !== undefined) { // klub z edytora (przeniesienie), null = wolny zawodnik
    put('team', src.team === null ? { v: null } : typeof src.team === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(src.team) ? { v: src.team } : { err: 'Klub: zły identyfikator.' });
  }
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
    if (k === 'rivals') { for (const [o, x] of Object.entries(v)) n += editRival(game, id, o, x); continue; } // pary w game.editor.rivals
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
// staff { rola: [{ name, age, q }, ...] } (osoby w kolejności sztabu klubu, więc plik działa też w innym świecie gry);
// skaut ma też reg { region: 1-20 } (najwyżej 3 regiony z SCOUT_REGIONS, src/career/scoutRegions.js).
// Trener i właściciel to obecni ludzie klubu w chwili wczytania pliku. Trener klubu gracza to gracz (bez edycji).
export const OWNER_LABELS = { cierpliwosc: 'Cierpliwość', ambicja: 'Ambicja', temperament: 'Temperament', media: 'Wrażliwość na media', zasobnosc: 'Zasobność' };
export const PERSON_AGE = { min: 18, max: 85 };
const COACH_LABELS = Object.fromEntries(COACH_KEYS.map((k) => [k, COACH_ATTRS[k].name]));

function attrs1to20(src, keys, labels, form, errors, prefix, max = 20) {
  const a = {};
  for (const k of keys) {
    if (src[k] === undefined) continue;
    const r = num(src[k], { label: labels[k], min: 1, max, form });
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
    // Dyrektor sportowy (datapack v6): najwyżej jedna osoba
    if (!(STAFF_ROLE_IDS.includes(role) || role === DIRECTOR_ROLE) || !Array.isArray(list) || list.length > (role === DIRECTOR_ROLE ? 1 : 12)) { errors.staff = 'Sztab: zły wpis roli.'; continue; }
    value[role] = list.map((o, i) => {
      const v = {};
      if (!isObj(o)) { errors[`${role}.${i}`] = 'Sztab: zły wpis osoby.'; return v; }
      const put = (k, r) => { if (r.err) errors[`${role}.${i}.${k}`] = r.err; else v[k] = r.v; };
      if (o.name !== undefined) put('name', personName(o.name));
      if (o.age !== undefined) put('age', personAge(o.age, form));
      // Skala roli (datapack v7): 1-12, fizjoterapeuta i dyrektor sportowy 1-20
      const cap = staffCap(role);
      if (o.q !== undefined) put('q', num(o.q, { label: 'Jakość', min: 1, max: cap, form }));
      // Atrybuty roli (datapack v3, docs/sztab-atrybuty.md): każdy 1-12 (fizjoterapeuta, dyrektor 1-20), tylko klucze tej roli
      if (o.a !== undefined) {
        if (!isObj(o.a)) errors[`${role}.${i}.a`] = 'Atrybuty sztabu: oczekiwano listy wartości.';
        else {
          const keys = roleAttrKeys(role);
          const bad = Object.keys(o.a).find((k) => !keys.includes(k));
          if (bad) errors[`${role}.${i}.a`] = `Atrybuty sztabu: nieznany atrybut ${String(bad).slice(0, 6)} w roli ${role}.`;
          else v.a = attrs1to20(o.a, keys, Object.fromEntries(keys.map((k) => [k, ROLE_ATTRS[role][k].name])), form, errors, `${role}.${i}.a.`, cap);
        }
      }
      // Regiony skauta (datapack v5): nieznany region, poziom spoza 1-20 albo więcej niż 3 regiony odrzucają wpis
      if (o.reg !== undefined) {
        if (role !== 'skaut' || !isObj(o.reg)) errors[`${role}.${i}.reg`] = 'Regiony: tylko skaut, oczekiwano listy regionów.';
        else {
          const ks = Object.keys(o.reg);
          const bad = ks.find((k) => !SCOUT_REGION[k]);
          if (bad) errors[`${role}.${i}.reg`] = `Regiony: nieznany region ${String(bad).slice(0, 14)}.`;
          else if (ks.length > SCOUT_REG_MAX) errors[`${role}.${i}.reg`] = `Regiony: najwyżej ${SCOUT_REG_MAX}.`;
          else v.reg = attrs1to20(o.reg, ks, Object.fromEntries(ks.map((k) => [k, SCOUT_REGION[k].label])), form, errors, `${role}.${i}.reg.`);
        }
      }
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
  const dir = directorOf(game, id); // dyrektor sportowy (datapack v6)
  for (const p of [...rosterOf(game, id), ...(dir ? [dir] : [])]) ((staff ??= {})[p.role] ??= []).push({ name: p.name, age: p.age, q: p.q, ...(p.a ? { a: { ...p.a } } : {}), ...(p.role === 'skaut' && p.reg ? { reg: { ...p.reg } } : {}) });
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
    // Dyrektor sportowy: klub z wakatem dostaje nową osobę z pliku (datapack v6)
    const ppl = role === DIRECTOR_ROLE ? [list.length ? directorOf(game, id) ?? ensureEditorDirector(game, id) : null].filter(Boolean) : roster.filter((p) => p.role === role);
    list.forEach((o, i) => {
      const p = ppl[i];
      if (!p) return;
      for (const k of ['name', 'age']) if (o[k] !== undefined && o[k] !== p[k]) { p[k] = o[k]; n++; }
      ensurePersonAttrs(p, `${game.seed}:${p.id}`);
      // Atrybuty (datapack v3, formularz) mają pierwszeństwo; sama jakość (datapack v1-v2) przesuwa cały profil osoby
      const keys = roleAttrKeys(p.role);
      if (o.a && keys.some((k) => o.a[k] !== undefined)) {
        for (const k of keys) if (o.a[k] !== undefined && o.a[k] !== p.a[k]) { p.a[k] = o.a[k]; n++; }
        p.q = qFromAttrs(p.a);
      } else if (o.q !== undefined && o.q !== p.q) { shiftPersonQ(p, o.q); n++; }
      // Regiony skauta (datapack v5): cały zestaw z pliku zastępuje dotychczasowy
      if (p.role === 'skaut' && o.reg && Object.keys(o.reg).length && JSON.stringify(o.reg) !== JSON.stringify(p.reg ?? {})) { p.reg = { ...o.reg }; n++; }
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
    injury: p.injuryDays > 0 ? { name: String(p.injury?.name ?? 'uraz').slice(0, INJ_NAME_MAX), days: Math.min(INJ_DAYS_MAX, p.injuryDays) } : null,
  };
}

// ------------------------------------------------------------ Kontuzja zawodnika
// p.injuryDays: dni do powrotu (maleją co dzień, src/season/season.js), p.injury: { cat, name, days, playable, since }.
// Rodzaje z silnika meczu (INJURY_TYPES): lekkie pozwalają grać z bólem, jak kontuzja z meczu albo treningu.
export const INJ_DAYS_MAX = 365;
const INJ_NAME_MAX = 60;
export const INJURY_LIST = Object.entries(INJURY_TYPES).flatMap(([cat, list]) => list.map(([name, lo, hi, playable]) => ({ cat, name, lo, hi, playable })));
/** Kontuzja z edytora: rodzaj z listy silnika (inna nazwa: kategoria z liczby dni, bez gry z bólem). */
export function injuryFrom(name, days, date) {
  const t = INJURY_LIST.find((x) => x.name === name);
  const cat = t?.cat ?? (days <= 14 ? 'light' : days <= 42 ? 'medium' : 'severe');
  return { cat, name, days, playable: !!t?.playable, since: date, editor: true };
}
const sameInjury = (a, b) => (a?.name ?? null) === (b?.name ?? null) && (a?.days ?? 0) === (b?.days ?? 0);

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
  if (values.injury !== undefined && !sameInjury(values.injury, cur.injury)) {
    n++;
    const v = values.injury;
    if (v) { p.injuryDays = v.days; p.injury = injuryFrom(v.name, v.days, game.date); } else { p.injuryDays = 0; p.injury = null; }
    rec.injury = v;
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
  const extra = { newPlayers: exportCreated(game), refs: structuredClone(E.refs ?? {}) }; // nowi zawodnicy i sędziowie (created to data pliku)
  if (!full) {
    const clubs = structuredClone(E.clubs);
    for (const k of Object.keys(E.rivals ?? {})) for (const id of k.split('|')) if (clubObj(id)) (clubs[id] ??= {}).rivals = rivalsOf(game, id); // rywale z edytora
    return { ...head, clubs, players: structuredClone(E.players), ...extra };
  }
  for (const r of game.refs?.list ?? []) extra.refs[r.id] = refValues(game, r); // pełny: wszyscy sędziowie
  const clubs = {}; const players = {};
  for (const id of Object.keys(game.world?.clubs ?? {})) {
    if (!clubObj(id)) continue;
    const cur = Object.fromEntries(Object.entries(clubValues(game, id)).filter(([, v]) => v != null && v !== ''));
    const { value } = checkClub(cur);
    const rv = rivalsOf(game, id); // najwięksi rywale (dane gry i edytor; 0 = usunięta rywalizacja)
    if (Object.keys(rv).length) value.rivals = Object.fromEntries(Object.entries(rv).slice(0, RIVALS_MAX));
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
    if (!cur.injury) delete cur.injury; // zdrowy: pole pominięte
    const { value } = checkPlayer(cur);
    if (!Object.keys(value).length) continue;
    players[id] = { ...value, club: p.clubId ? (clubObj(p.clubId)?.name ?? p.clubId) : null, ovr: p.ovr };
  }
  return { ...head, clubs, players, ...extra };
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
  // Nowi zawodnicy z edytora: pełne dane (działają w każdym świecie gry)
  // created w nagłówku to data pliku (tekst); pliki z pierwszego wydania v1.19 miały tu nowych zawodników (obiekt)
  const fresh = d.newPlayers !== undefined ? d.newPlayers : (isObj(d.created) ? d.created : undefined);
  if (fresh !== undefined && !isObj(fresh)) throw new Error('Datapack: sekcja nowych zawodników ma zły format.');
  const created = {};
  for (const [id, o] of Object.entries(fresh ?? {})) {
    if (!ID_RE.test(id) || !isObj(o)) throw new Error('Datapack: zły wpis nowego zawodnika.');
    const src = Object.fromEntries(PLAYER_FIELDS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
    const r = checkPlayer(src);
    const bad = Object.values(r.errors)[0];
    if (bad) throw new Error(`Nowy zawodnik ${id}: ${bad}`);
    for (const k of ['first', 'last', 'nat', 'pos', 'birthDate']) if (r.value[k] === undefined) throw new Error(`Nowy zawodnik ${id}: brak pola ${k}.`);
    created[id] = r.value;
  }
  // Sędziowie (identyfikatory r1, r2... są w każdej grze)
  if (d.refs !== undefined && !isObj(d.refs)) throw new Error('Datapack: sekcja sędziów ma zły format.');
  const refs = {};
  for (const [id, o] of Object.entries(d.refs ?? {})) {
    if (!/^r\d{1,4}$/.test(id)) throw new Error('Datapack: zły wpis sędziego.');
    const r = checkReferee(o);
    const bad = Object.values(r.errors)[0];
    if (bad) throw new Error(`Sędzia ${id}: ${bad}`);
    refs[id] = r.value;
  }
  return { seed: Number.isFinite(d.seed) ? d.seed : null, clubs, players, created, refs };
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
  // Sędziowie: w każdym świecie gry
  out.refs = 0;
  for (const [id, v] of Object.entries(pack.refs ?? {})) if (game.refs?.list?.some((r) => r.id === id)) { editReferee(game, id, v); out.refs++; }
  out.created = 0; out.squadSkipped = 0;
  // Najpierw zawodnicy świata gry (zwolnienia z kadry robią miejsce), potem nowi zawodnicy z edytora
  const ids = Object.keys(pack.players);
  if (ids.length && pack.seed !== game.seed) { out.otherWorld = true; out.playersSkipped = ids.length; }
  else { importWorldPlayers(game, pack, ids, out); fixAcademyAges(game, out); }
  // Nowi zawodnicy z edytora: w każdym świecie gry (już obecni w grze: bez zmian)
  for (const [id, v] of Object.entries(pack.created ?? {})) {
    if (game.world?.players?.[id] || !game.market) continue;
    const age = clamp(ageAt({ birthDate: v.birthDate }, game.date), LIMITS.ageMin, LIMITS.ageMax);
    createFreePlayer(game, { first: v.first, last: v.last, nat: v.nat, pos: v.pos, age, level: 10 }, id);
    const vals = { ...v };
    if (ageAt({ birthDate: v.birthDate }, game.date) !== age) delete vals.birthDate;
    editPlayer(game, id, vals);
    delete game.editor.players[id]; // dane nowego zawodnika żyją w sekcji created
    out.created++;
    if (v.team && joinFromFree(game, id, v.team)) out.squadSkipped++;
  }
  return out;
}

/** Zawodnicy świata gry z datapacku (to samo ziarno): dane, potem zmiany kadry (zwolnienia przed dołączeniami). */
function importWorldPlayers(game, pack, ids, out) {
  const joins = [];
  for (const id of ids) {
    const p = game.world?.players?.[id];
    if (!p) { out.playersSkipped++; continue; }
    const v = pack.players[id];
    if (v.birthDate) {
      const age = ageAt({ birthDate: v.birthDate }, game.date);
      if (age < LIMITS.ageMin || age > LIMITS.ageMax) delete v.birthDate;
    }
    editPlayer(game, id, v); out.players++;
    // Przeniesienie z edytora (team: klub albo null = wolny), z limitami kadry
    if (v.team !== undefined && (p.clubId ?? null) !== v.team) {
      const why = p.clubId ? releaseToFree(game, id) : '';
      if (why) out.squadSkipped++;
      else if (v.team) joins.push([id, v.team]); // dołączenie po wszystkich zwolnieniach (miejsce w pełnej kadrze)
    }
  }
  for (const [id, team] of joins) if (joinFromFree(game, id, team)) out.squadSkipped++;
}

/**
 * Akademia po datapacku: na miejscu juniora (<klub>-a1 ... -a7) może stać dorosły zawodnik (np. 32-latek), bo plik
 * zmienia dane, a nie miejsce w klubie. Zawodnik od ACADEMY_AGE lat przechodzi do pierwszej drużyny (kontrakt
 * rynkowy, 3 lata, 30+: 2 lata, 33+: rok), a gdy kadra jest pełna (EDIT_SQUAD.max), zostaje wolnym zawodnikiem.
 * Ta sama granica co na koniec sezonu (src/season/rollover.js: 19-latkowie opuszczają akademię).
 */
export const ACADEMY_AGE = 19;
function fixAcademyAges(game, out) {
  out.academyUp = 0; out.academyFree = 0;
  const W = game.world;
  for (const [cid, club] of Object.entries(W?.clubs ?? {})) {
    const c = clubObj(cid);
    for (const id of [...(club.academy ?? [])]) {
      const p = W.players[id];
      if (!p || (p.age ?? 0) < ACADEMY_AGE) continue;
      club.academy = club.academy.filter((x) => x !== id);
      p.clubId = cid;
      if (club.squad.length < EDIT_SQUAD.max) {
        club.squad.push(id); p.squad = 'A';
        const years = p.age >= 33 ? 1 : p.age >= 30 ? 2 : 3;
        p.contract = { wage: marketWage(p.ovr, Math.min(4, c?.tier ?? 3), false, payLevel(c)), until: `${seasonEndYear(game.date) + years - 1}-06-30`, clause: 0, signedOn: game.date };
        p.wage = p.contract.wage;
        out.academyUp++;
      } else { editorRelease(game, id); out.academyFree++; }
      recordTeam(game, id);
    }
  }
}

/** Polskie podsumowanie importu. */
export function importSummary(r) {
  const parts = [`Kluby: zastosowano ${r.clubs}${r.clubsSkipped ? `, pominięto ${r.clubsSkipped} (nieznane)` : ''}.`];
  if (r.otherWorld) parts.push(`Zawodnicy pominięci: inny świat gry (${r.playersSkipped}).`);
  else parts.push(`Zawodnicy: zastosowano ${r.players}${r.playersSkipped ? `, pominięto ${r.playersSkipped} (brak w tej grze)` : ''}.`);
  if (r.created) parts.push(`Nowi zawodnicy: ${r.created}.`);
  if (r.refs) parts.push(`Sędziowie: ${r.refs}.`);
  if (r.academyUp || r.academyFree) parts.push(`Dorośli zawodnicy z miejsc akademii: ${r.academyUp ?? 0} do pierwszej drużyny${r.academyFree ? `, ${r.academyFree} do wolnych (pełna kadra)` : ''}.`);
  if (r.squadSkipped) parts.push(`Zmiany kadry pominięte przez limit ${EDIT_SQUAD.min}-${EDIT_SQUAD.max} zawodników: ${r.squadSkipped}.`);
  return parts.join(' ');
}

/** Liczba wpisów w datapacku gry. */
export const packCounts = (game) => ({ clubs: Object.keys(game.editor?.clubs ?? {}).length, players: Object.keys(game.editor?.players ?? {}).length });
