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
    id: 'run', label: 'Pozycja', pos: ['BO', 'WB', 'DP', 'ŚP', 'BP'], team: null,
    options: [
      { v: -1, label: 'Z tyłu', hint: 'Pewniejsza obrona i mniej kontr rywala. Ryzyko: mniej ludzi w ataku.' },
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
export const playerInstruction = (id) => PLAYER_INSTRUCTIONS.find((d) => d.id === id) ?? null;

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
  for (const id of PI_IDS) if (o[id] === -1 || o[id] === 1) out[id] = o[id];
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
