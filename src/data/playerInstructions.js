// Instrukcje indywidualne zawodników (docs/instrukcje-indywidualne.md). Katalog dla interfejsu i silnika:
// opcje, pozycje, na których instrukcja działa, powiązanie z instrukcją drużyny i krótkie opisy zysku i ryzyka.
// Zapis w taktyce: game.tactics.playerInstr = { [idZawodnika]: { pass: -1|1, dribble: ..., ... } }, tylko nadpisania;
// brak wpisu albo brak klucza = „Jak drużyna”. Liczby efektów w silniku: src/engine/match/playerInstr.js.

const FIELD = ['ŚO', 'BO', 'WB', 'DP', 'ŚP', 'OP', 'BP', 'SN', 'NAP'];

/**
 * id: klucz w zapisie, label: nazwa w oknie instrukcji, pos: pozycje (slot w meczu albo pozycja zawodnika),
 * team: instrukcja drużyny o tym samym znaczeniu i poziomy jej opcji (-1, 0, +1) albo null,
 * options: [{ v: -1|1, label, hint }] (opcja 0 = „Jak drużyna”), posWeight: słabszy efekt na pozycji (DP przy strzałach).
 */
export const PLAYER_INSTRUCTIONS = [
  {
    id: 'pass', label: 'Podania', pos: ['BR', ...FIELD], posWeight: { BR: 0.5 }, // bramkarz rzadziej rozgrywa w polu
    team: { id: 'passing', levels: { short: -1, mixed: 0, long: 1 } },
    options: [
      { v: -1, label: 'Krótsze', hint: 'Dłużej przy piłce i mniej strat. Ryzyko: straty pod pressingiem przy słabej technice.' },
      { v: 1, label: 'Dłuższe', hint: 'Szybciej do przodu i więcej kontr. Ryzyko: mniej celnych podań i krótsze posiadanie.' },
    ],
  },
  {
    id: 'dribble', label: 'Drybling', pos: ['BO', 'WB', 'ŚP', 'OP', 'BP', 'SN', 'NAP'], team: null,
    options: [
      { v: -1, label: 'Mniej', hint: 'Mniej strat i kontr rywala. Ryzyko: rzadziej mija rywala i wymusza faul.' },
      { v: 1, label: 'Więcej', hint: 'Częściej mija rywala i wymusza faule. Ryzyko: straty i kontry rywala.' },
    ],
  },
  {
    id: 'shoot', label: 'Strzały z dystansu', pos: ['DP', 'ŚP', 'OP', 'BP', 'SN', 'NAP'], posWeight: { DP: 0.5 }, team: null,
    options: [
      { v: -1, label: 'Mniej', hint: 'Cierpliwie szuka lepszej sytuacji. Ryzyko: mniej strzałów.' },
      { v: 1, label: 'Więcej', hint: 'Więcej strzałów z daleka. Ryzyko: słabsze sytuacje i mniej podań do przodu.' },
    ],
  },
  {
    id: 'cross', label: 'Dośrodkowania', pos: ['BO', 'WB', 'BP', 'SN'], team: null,
    options: [
      { v: -1, label: 'Mniej', hint: 'Więcej gry środkiem. Ryzyko: rzadziej szuka głów kolegów w polu karnym.' },
      { v: 1, label: 'Więcej', hint: 'Więcej wrzutek w pole karne. Ryzyko: mniej gry środkiem, straty i zmęczenie.' },
    ],
  },
  {
    id: 'tackle', label: 'Odbiór', pos: FIELD,
    team: { id: 'tackling', levels: { soft: -1, normal: 0, hard: 1 } },
    options: [
      { v: -1, label: 'Łagodny', hint: 'Mniej fauli i kartek. Ryzyko: słabsza obrona.' },
      { v: 1, label: 'Twardy', hint: 'Więcej odbiorów. Ryzyko: faule, kartki i rzuty karne.' },
    ],
  },
  {
    // Ruch w fazie ataku: składowa pionowa strzałki na boisku (docs/strzalki-ruchu.md); pozioma to klucz lat (PI_LAT)
    id: 'run', label: 'Ruch', pos: ['BO', 'WB', 'DP', 'ŚP', 'OP', 'BP', 'SN', 'NAP'], team: null,
    options: [
      { v: -1, label: 'Cofnięcie', hint: 'Pewniejsza obrona i mniej kontr rywala. Ryzyko: mniej ludzi w ataku.' },
      { v: 1, label: 'Do przodu', hint: 'Więcej ludzi w ataku. Ryzyko: kontry rywala, zmęczenie i spalone.' },
    ],
  },
  {
    id: 'press', label: 'Pressing', pos: FIELD,
    team: { id: 'pressing', levels: { low: -1, mid: 0, high: 1 } },
    options: [
      { v: -1, label: 'Mniej', hint: 'Mniej biegania i mniej zmęczenia. Ryzyko: rywal dłużej przy piłce.' },
      { v: 1, label: 'Więcej', hint: 'Odbiór piłki wyżej. Ryzyko: zmęczenie i faule.' },
    ],
  },
];

export const PI_IDS = PLAYER_INSTRUCTIONS.map((d) => d.id);
export const PI_TEAM_LABEL = 'Jak drużyna';

/**
 * Ruch w poziomie (docs/strzalki-ruchu.md): ustawiany tylko strzałką (arrow: true), bez własnej kolumny w tabeli
 * i bez osobnego wiersza w oknie zawodnika (tam „Ruch” pokazuje kierunek). -1 do środka, 1 szeroko (względem strony zawodnika).
 */
export const PI_LAT = {
  id: 'lat', label: 'Ruch w poziomie', arrow: true, pos: ['BO', 'WB', 'ŚP', 'OP', 'BP', 'SN', 'NAP'], team: null,
  options: [
    { v: -1, label: 'Do środka', hint: 'Schodzi do środka pola.' },
    { v: 1, label: 'Szeroko', hint: 'Trzyma się linii bocznej.' },
  ],
};
/** Wszystkie klucze zapisu (7 instrukcji i lat): czyszczenie, porównania, zmiany w meczu. */
export const PI_KEYS = [...PI_IDS, PI_LAT.id];
export const playerInstruction = (id) => PLAYER_INSTRUCTIONS.find((d) => d.id === id) ?? (id === PI_LAT.id ? PI_LAT : null);

// ------------------------------------------------------------ Strzałki ruchu (docs/strzalki-ruchu.md)
/** Kierunki strzałki: składowa pionowa run (1 do przodu, -1 cofnięcie) i pozioma lat (-1 do środka, 1 szeroko). */
export const ARROW_DIRS = [
  { id: 'f', run: 1, lat: 0, label: 'Do przodu' },
  { id: 'fi', run: 1, lat: -1, label: 'Skos do środka' },
  { id: 'fo', run: 1, lat: 1, label: 'Skos na zewnątrz' },
  { id: 'i', run: 0, lat: -1, label: 'Do środka' },
  { id: 'o', run: 0, lat: 1, label: 'Szeroko' },
  { id: 'b', run: -1, lat: 0, label: 'Cofnięcie' },
];
/** Dozwolone kierunki na pozycji (BR i ŚO: brak). Boczny obrońca w czwórce bez ruchu na zewnątrz (strzałka poza boisko);
 * wybieg wzdłuż linii to „do przodu”. Na zewnątrz tylko wahadłowy (WB), czyli przy trójce środkowych obrońców. */
export const ARROW_POS = {
  BO: ['f', 'fi', 'i', 'b'], WB: ['f', 'fo', 'fi', 'i', 'b'], DP: ['f', 'b'], ŚP: ['f', 'fi', 'fo', 'i', 'o', 'b'],
  OP: ['f', 'b', 'o', 'fo'], BP: ['f', 'i', 'fi', 'o', 'b'], SN: ['f', 'i', 'fi', 'o', 'b'], NAP: ['f', 'o', 'b'],
};
/** Opis zysku i ryzyka kierunku (ogólny, bez prognozy dla zawodnika); rola zależy od pozycji (_: domyślny). */
const FB_FI = 'Wbiega środkiem obok skrzydłowego (underlap). Ryzyko: odsłonięta flanka, kontry rywala i zmęczenie.';
const FB_FO = 'Obiega skrzydłowego (overlap) i dośrodkowuje. Ryzyko: kontry rywala za plecami i zmęczenie.';
const W_F = 'Wbiega za linię obrony, więcej szybkich ataków. Ryzyko: kontry rywala, zmęczenie i spalone.';
const W_FI = 'Ścina do środka za linię obrony i szuka strzału. Ryzyko: mniej dośrodkowań, węższa gra i spalone.';
const W_I = 'Schodzi do środka na lepszą nogę i szuka strzału. Ryzyko: mniej dośrodkowań, węższa gra i więcej dośrodkowań rywala.';
const ARROW_HINT = {
  f: { _: 'Wbiega do przodu i daje więcej ludzi w ataku. Ryzyko: kontry rywala, zmęczenie i spalone.', BP: W_F, SN: W_F,
    NAP: 'Gra na plecach obrońców. Ryzyko: spalone i zmęczenie.', OP: 'Cień napastnika, dochodzi do sytuacji w polu karnym. Ryzyko: luka w środku pola i kontry rywala.' },
  fi: { _: 'Wbiega w półprzestrzeń, więcej gry kombinacyjnej. Ryzyko: kontry rywala i zmęczenie.', BO: FB_FI, WB: FB_FI, BP: W_FI, SN: W_FI },
  fo: { _: 'Wybiega do przodu przy linii bocznej i dośrodkowuje. Ryzyko: kontry rywala i zmęczenie.', BO: FB_FO, WB: FB_FO },
  i: { _: 'Schodzi do środka, dłużej przy piłce i więcej krótkich podań. Ryzyko: węższa gra i mniej dośrodkowań.',
    BO: 'Odwrócony boczny obrońca: wchodzi do środka pola i pomaga w rozegraniu. Ryzyko: odsłonięta flanka, kontry i dośrodkowania rywala.',
    WB: 'Odwrócony wahadłowy: wchodzi do środka pola i pomaga w rozegraniu. Ryzyko: odsłonięta flanka, kontry i dośrodkowania rywala.', BP: W_I, SN: W_I },
  o: { _: 'Trzyma się linii bocznej, rozciąga obronę i dośrodkowuje. Ryzyko: mniej gry środkiem, krócej przy piłce i więcej biegania.',
    NAP: 'Gra w kanale między obrońcami, schodzi do boku i dośrodkowuje. Ryzyko: mniej strzałów i mniej ludzi w polu karnym.' },
  b: { _: 'Cofa się po piłkę i pewniej asekuruje. Ryzyko: mniej ludzi w ataku.', DP: 'Opada między środkowych obrońców przy rozegraniu. Ryzyko: mniej ludzi w środku pola i w ataku.',
    NAP: 'Fałszywa dziewiątka: cofa się po piłkę i rozgrywa. Ryzyko: mniej strzałów i mniej ludzi w polu karnym.' },
};
export const arrowDir = (id) => ARROW_DIRS.find((d) => d.id === id) ?? null;
/** Kierunek z instrukcji zawodnika ({ run, lat }) albo null (brak albo para spoza 6 kierunków). */
export function arrowOf(o) {
  const run = o?.run === 1 || o?.run === -1 ? o.run : 0;
  const lat = o?.lat === 1 || o?.lat === -1 ? o.lat : 0;
  if (!run && !lat) return null;
  return ARROW_DIRS.find((d) => d.run === run && d.lat === lat)?.id ?? null;
}
/** Instrukcje { run, lat } (0 = jak drużyna) dla kierunku; brak kierunku: obie 0. */
export function arrowToInstr(dir) {
  const d = arrowDir(dir);
  return { run: d?.run ?? 0, lat: d?.lat ?? 0 };
}
/** Dozwolone kierunki na pozycji (id w kolejności ARROW_DIRS). */
export const arrowsFor = (pos) => ARROW_DIRS.filter((d) => (ARROW_POS[pos] ?? []).includes(d.id)).map((d) => d.id);
export const arrowAllowed = (pos, dir) => !!dir && (ARROW_POS[pos] ?? []).includes(dir);
export const arrowLabel = (dir) => arrowDir(dir)?.label ?? PI_TEAM_LABEL;
export const arrowHint = (dir, pos) => ARROW_HINT[dir]?.[pos] ?? ARROW_HINT[dir]?._ ?? '';

/** Czy instrukcja działa na tej pozycji (BR, ŚO, ... ). */
export function piAllowed(id, pos) {
  const d = playerInstruction(id);
  return !!d && d.pos.includes(pos);
}

/** Poziom instrukcji drużyny dla danej instrukcji indywidualnej (-1, 0, +1); 0 dla instrukcji bez odpowiednika. */
export function teamLevel(id, instructions) {
  const d = playerInstruction(id);
  if (!d?.team) return 0;
  return d.team.levels[instructions?.[d.team.id]] ?? 0;
}

/**
 * Czyste nadpisania jednego zawodnika: tylko znane instrukcje z wartością -1 albo 1 (0, null, inne: „Jak drużyna”).
 * Zwraca obiekt albo null, gdy nic nie zostaje.
 */
export function cleanPlayerInstr(o) {
  if (!o || typeof o !== 'object') return null;
  const out = {};
  for (const id of PI_KEYS) if (o[id] === -1 || o[id] === 1) out[id] = o[id];
  return Object.keys(out).length ? out : null;
}

/** Czysta mapa nadpisań taktyki; validIds (Set albo null): tylko zawodnicy z kadry. Stare zapisy: brak pola = {}. */
export function cleanPlayerInstrMap(map, validIds = null) {
  const out = {};
  for (const [pid, o] of Object.entries(map ?? {})) {
    if (validIds && !validIds.has(pid)) continue;
    const c = cleanPlayerInstr(o);
    if (c) out[pid] = c;
  }
  return out;
}

/** Ilu zawodników ma co najmniej jedną instrukcję indywidualną (licznik w przycisku interfejsu). */
export const playerInstrCount = (map) => Object.keys(map ?? {}).length;
