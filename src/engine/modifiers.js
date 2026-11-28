// Rejestr modyfikatorów: jeden potok czynników meczu (docs/walka-taktyk.md). Stan zawodnika, pozycja, drużyna,
// warunki meczu i starcie planów zamieniają się tu na liczby dla silnika. Silnik (pełny i szybki) nie zna
// poszczególnych cech; pyta rejestr o kanał albo o sumę. Nowy czynnik (np. murawa, derby, chemia) to jeden wpis.
//
// Etapy w kolejności potoku (STAGES): attr (atrybuty w strefach), slot (pozycja i strona), player (stan zawodnika
// przed meczem), live (stan w meczu co minutę), team (drużyna), plan (taktyka), matchup (starcie planów),
// match (warunki meczu), rng (losowania silnika: zostają w silniku, w tej samej kolejności).
//
// Wpis: { id, stage, label, group, range: [min, max], when: 'start'|'minute'|'change'|'action',
//         channel?: 'pts' (domyślnie), channels?: [...] (wpis zwracający obiekt kanałów),
//         order?: liczba (kolejność w etapie, domyślnie 0; równe: kolejność rejestracji),
//         mode?: 'match' (tylko pełny silnik, ctx.inMatch) | 'quick' (tylko mecze w tle i raporty) | brak (oba),
//         enabled?: (ctx) => boolean, apply(subject, ctx) -> liczba albo { kanał: liczba } }
// Zgodność wstecz: stary zapis { id, scope: 'player'|'team'|'match', label, apply } działa dalej (scope = etap,
// wynik to punkty atrybutu w kanale 'pts'). Brak label: id, brak group: etap, brak range: null.
// range jest w kroku 1 dokumentacyjny (wartości nie są przycinane, żeby wyniki zostały bit w bit).
// Kanały (CHANNELS): sumy (pts, zone.*, brk, cap, hunger, hfa, home) i iloczyny (act.*, conv, foul, fat, inj, ...).
// Wynik każdego wpisu trafia do rozbicia (parts i chParts), więc raport asystenta, studio i M.ledger
// mogą pokazać, skąd wzięła się siła drużyny i przebieg meczu.

import { clamp } from '../core/rng.js';
import { ENGINE2, STATE, onEngine2Change, tierMul, tierOf } from './engine2.js';

export const STAGES = ['attr', 'slot', 'player', 'live', 'team', 'plan', 'matchup', 'match', 'rng'];

/** Sposób łączenia wkładów w kanale: 'sum' (od 0) albo 'prod' (od 1). Nieznany kanał: suma. */
export const CHANNELS = {
  pts: 'sum', 'zone.DEF': 'sum', 'zone.MID': 'sum', 'zone.ATT': 'sum', 'zone.GK': 'sum', 'zone.all': 'sum', 'zone.field': 'sum',
  brk: 'sum', cap: 'sum', hunger: 'sum', hfa: 'sum', home: 'sum',
  'act.POZ': 'prod', 'act.SKR': 'prod', 'act.KON': 'prod', 'act.DYS': 'prod', act: 'prod', dys: 'prod', pAct: 'prod',
  fat: 'prod', foul: 'prod', card: 'prod', red: 'prod', pen: 'prod', penCard: 'prod', tacCard: 'prod',
  conv: 'prod', inj: 'prod', pos: 'prod', err: 'prod',
  // Krok 2 (warunki): różnica klas i rozrzut dyspozycji dnia (iloczyny), murawa: celność podań i przełamanie wg rodzaju akcji (sumy)
  gap: 'prod', dfMul: 'prod', passAcc: 'sum', 'brk.POZ': 'sum', 'brk.SKR': 'sum', 'brk.KON': 'sum', 'brk.DYS': 'sum',
};
export const channelKind = (ch) => CHANNELS[ch] ?? 'sum';

const WHEN = { attr: 'start', slot: 'change', player: 'start', live: 'minute', team: 'minute', plan: 'change', matchup: 'change', match: 'start', rng: 'start' };
const registry = Object.fromEntries(STAGES.map((s) => [s, []]));
const EMPTY = Object.freeze({});
// Skompilowane listy wpisów etapu dla kanału (szybka ścieżka silnika); czyszczone przy każdej zmianie rejestru
let compiled = {};

function normalize(mod) {
  const stage = mod.stage ?? mod.scope;
  if (!mod?.id || !registry[stage] || typeof mod.apply !== 'function') throw new Error(`Nieprawidłowy modyfikator: ${mod?.id}`);
  mod.stage = stage;
  mod.scope ??= stage; // stare wywołania unregisterModifier(scope, id)
  mod.label ??= mod.id;
  mod.group ??= stage;
  if (mod.range === undefined) mod.range = null;
  mod.when ??= WHEN[stage];
  mod.channel ??= 'pts';
  mod.channels ??= [mod.channel];
  mod.order ??= 0;
  mod.mode ??= null;
  return mod;
}

export function registerModifier(mod) {
  normalize(mod);
  const list = registry[mod.stage];
  const i = list.findIndex((m) => m.id === mod.id);
  if (i >= 0) list[i] = mod;
  else {
    // Wstawienie stabilne według order (równe order: kolejność rejestracji, jak dawniej)
    let at = list.length;
    while (at > 0 && list[at - 1].order > mod.order) at--;
    list.splice(at, 0, mod);
  }
  compiled = {}; version++;
  return mod;
}

export function unregisterModifier(stage, id) {
  const list = registry[stage];
  if (!list) return;
  const i = list.findIndex((m) => m.id === id);
  if (i >= 0) list.splice(i, 1);
  compiled = {}; version++;
}

/** Wyłącznik wpisu bez wyrejestrowania (testy, porównania A/B, przyszłe przełączniki etapów). */
export function setModifierEnabled(stage, id, on) {
  const m = registry[stage]?.find((x) => x.id === id);
  if (!m) return false;
  m.off = !on;
  compiled = {}; version++;
  return true;
}

export function listModifiers(stage) {
  return (registry[stage] ?? []).map((m) => m.id);
}

/** Pełne wpisy (wszystkie etapy albo jeden), do testów i dokumentacji. */
export function modifierEntries(stage = null) {
  return (stage ? [stage] : STAGES).flatMap((s) => registry[s].slice());
}

export function getModifier(stage, id) {
  return registry[stage]?.find((m) => m.id === id) ?? null;
}

/**
 * Wszystkie wpisy etapu: { total, parts, ch, chParts }.
 * total i parts: kanał 'pts' (punkty atrybutu, jak dawniej; parts[id] = liczba). ch: wartość każdego innego kanału
 * po złożeniu (suma od 0 albo iloczyn od 1, w kolejności wpisów). chParts[id][kanał]: wkład wpisu w kanały inne
 * niż pts (wpis zwracający obiekt: także pts). Suma parts = total; złożenie chParts = ch.
 */
export function evaluate(stage, subject, ctx = {}) {
  let total = 0;
  const parts = {};
  let out = null; // { ch, chParts } dopiero przy pierwszym kanale innym niż pts
  const list = compiledFor(stage, '*', ctx.inMatch);
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.enabled && !m.enabled(ctx)) continue;
    const r = m.apply(subject, ctx, parts); // parts: wkłady wcześniejszych wpisów (granice pul stanu, krok 2)
    if (typeof r !== 'object' || r === null) {
      const v = Number(r) || 0;
      if (m.channel === 'pts') { parts[m.id] = v; total += v; continue; }
      out ??= { ch: {}, chParts: {} };
      addChannel(out, m.id, m.channel, v);
      continue;
    }
    out ??= { ch: {}, chParts: {} };
    for (const k in r) {
      const n = Number(r[k]);
      const v = Number.isNaN(n) ? (channelKind(k) === 'prod' ? 1 : 0) : n;
      if (k === 'pts') { parts[m.id] = (parts[m.id] ?? 0) + v; total += v; (out.chParts[m.id] ??= {}).pts = v; continue; }
      addChannel(out, m.id, k, v);
    }
  }
  return { total, parts, ch: out?.ch ?? EMPTY, chParts: out?.chParts ?? EMPTY };
}

function addChannel(out, id, k, v) {
  (out.chParts[id] ??= {})[k] = v;
  out.ch[k] = channelKind(k) === 'prod' ? (out.ch[k] ?? 1) * v : (out.ch[k] ?? 0) + v;
}

/**
 * Wpisy etapu włączone w danym trybie (pełny silnik albo mecze w tle) dla kanału ('*': wszystkie kanały), w kolejności
 * potoku. Lista jest ważna do następnej zmiany rejestru (registryVersion); dla szybkich ścieżek silnika.
 */
export function entriesFor(stage, ch, inMatch) { return compiledFor(stage, ch, inMatch); }
let version = 0;
/** Numer wersji rejestru (rośnie przy każdej rejestracji, usunięciu i wyłączeniu wpisu). */
export const registryVersion = () => version;
/** Unieważnia skompilowane listy i pamięci potoku (zmiana wyłączników ENGINE2, src/engine/engine2.js). */
export function bumpRegistry() { compiled = {}; version++; }
onEngine2Change(bumpRegistry);

function compiledFor(stage, ch, inMatch) {
  const mode = inMatch ? 'match' : 'quick';
  const byCh = (compiled[stage] ??= { match: {}, quick: {} })[mode];
  let list = byCh[ch];
  if (!list) {
    list = byCh[ch] = registry[stage].filter((m) => !m.off && (!m.mode || m.mode === mode) && (ch === '*' || m.channels.includes(ch)));
    list.prod = channelKind(ch) === 'prod';
    list.needsParts = list.some((m) => m.needsParts); // wpis granic (krok 2) czyta wkłady wcześniejszych wpisów
  }
  return list;
}

/**
 * Szybka ścieżka silnika: wartość jednego kanału (suma od 0 albo iloczyn od 1, w kolejności wpisów), bez alokacji.
 * Ta sama liczba co evaluate(...).ch[kanał] (dla 'pts': total).
 */
export function channel(stage, ch, subject, ctx = EMPTY) {
  const list = compiledFor(stage, ch, ctx.inMatch);
  if (list.needsParts && ch === 'pts') return evaluate(stage, subject, ctx).total;
  const prod = list.prod;
  let acc = prod ? 1 : 0;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.enabled && !m.enabled(ctx)) continue;
    const r = m.apply(subject, ctx);
    const v = r !== null && typeof r === 'object' ? Number(r[ch]) : Number(r);
    if (prod) acc *= Number.isNaN(v) ? 1 : v; else acc += v || 0;
  }
  return acc;
}

/**
 * Wkłady wpisów do jednego kanału po kolei (out[i], ids[i]); zwraca ich liczbę. Silnik dodaje je kolejno do swojej
 * wartości (a + w1 + w2 ...), żeby kolejność działań zmiennoprzecinkowych była ta sama co przed potokiem.
 */
export function channelTerms(stage, ch, subject, ctx, out, ids = null) {
  const list = compiledFor(stage, ch, ctx.inMatch);
  let n = 0;
  if (list.needsParts && ch === 'pts') {
    const { parts } = evaluate(stage, subject, ctx);
    for (const id in parts) { out[n] = parts[id]; if (ids) ids[n] = id; n++; }
    return n;
  }
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.enabled && !m.enabled(ctx)) continue;
    const r = m.apply(subject, ctx);
    out[n] = (r !== null && typeof r === 'object' ? Number(r[ch]) : Number(r)) || 0;
    if (ids) ids[n] = m.id;
    n++;
  }
  return n;
}

// ------------------------------------------------------------ Etap player: stan zawodnika (docs/ekspert_futbol.md 2.3)
// Kolejność rejestracji = kolejność dodawania (bit w bit z wcześniejszą sumą). Dalsze wpisy etapu: trening
// (training/index.js), autorytet (career/authority.js), głowa w transferze (career/mindset.js), aklimatyzacja
// (career/acclimatization.js), dyspozycja dnia i WAZ (engine/pipeline.js, order 90 i 91: na końcu sumy).
// Krok 2 (ENGINE2.state, src/engine/engine2.js): mocniejsza ostrość, świeżość do -1,4, gra z urazem w punktach,
// nowe wpisy „na gazie” i powrót po kontuzji, granice pul (wpis statePool na końcu stanu, przed dyspozycją dnia).
registerModifier({
  id: 'form', stage: 'player', group: 'psyche', label: 'Forma', range: [-0.5, 0.5],
  apply: (p) => (Array.isArray(p.form) && p.form.length
    ? clamp(0.25 * (p.form.reduce((a, b) => a + b, 0) / p.form.length - 6.6), -0.5, 0.5) : 0),
});
registerModifier({
  id: 'morale', stage: 'player', group: 'psyche', label: 'Morale', range: [-0.36, 0.4], // morale 1-20 (granica w puli psychiki)
  apply: (p) => 0.04 * ((p.morale ?? 12) - 10),
});
registerModifier({
  id: 'sharp', stage: 'player', group: 'body', label: 'Ostrość meczowa', range: [-1.2, 0],
  apply: (p) => {
    if (ENGINE2.state) { const d = STATE.sharp.from - (p.sharp ?? 80); return d > 0 ? -(STATE.sharp.lin * d + STATE.sharp.quad * d * d) : 0; }
    return (p.sharp ?? 80) < 60 ? -0.02 * (60 - p.sharp) : 0;
  },
});
registerModifier({
  id: 'fresh', stage: 'player', group: 'body', label: 'Świeżość', range: [-3.4, 0], // krok 2: do -1,4 i pula ciała
  // krok 1: w meczu liczy się bieżąca kondycja (etap live); krok 2 (state): także w meczu, w puli ciała (teams.js startCond)
  enabled: (ctx) => !ctx.inMatch || ENGINE2.state,
  apply: (p) => ((p.fresh ?? 95) < 85 ? -(ENGINE2.state ? STATE.fresh.k : 0.04) * (85 - p.fresh) : 0),
});
registerModifier({
  id: 'playingInjured', stage: 'player', group: 'body', label: 'Gra z urazem', range: [-0.9, 0],
  // cechy fizyczne -15 %: dawniej w procentach ovr (silniejszy tracił więcej), krok 2: stała liczba punktów
  apply: (p) => (p.playingInjured ? (ENGINE2.state ? -STATE.injuredPts : -0.045 * p.ovr) : 0),
});

// Pamięć „na gazie” na tablicę ocen (applyResult tworzy nową tablicę p.fh po każdym meczu, więc stara wartość wygasa sama)
const FIRE = new WeakMap();
/** „Na gazie”: seria ostatnich ocen ponad własną średnią (p.fh, 10 meczów), malejący zwrot; słaby mecz zeruje serię. */
export function onFireOf(p) {
  const h = p.fh; const F = STATE.onFire;
  if (!Array.isArray(h) || h.length < F.minGames) return 0;
  let v = FIRE.get(h);
  if (v !== undefined) return v;
  let s = 0;
  for (const e of h) s += e[0];
  const bar = s / h.length + F.margin;
  let k = 0;
  for (let i = h.length - 1; i >= 0 && h[i][0] >= bar; i--) k++;
  v = k ? F.max * (1 - Math.exp(-k / F.tau)) : 0;
  FIRE.set(h, v);
  return v;
}
/** Powrót po kontuzji (p.rust z dziennej regeneracji: { days, n, left }): kara maleje z każdym rozegranym meczem. */
export function rustOf(p) {
  const r = p.rust;
  if (!r || !(r.left > 0)) return 0;
  const R = STATE.rust;
  return -Math.min(R.max, R.base + R.perDay * r.days) * (r.left / r.n);
}
registerModifier({
  id: 'onFire', stage: 'player', group: 'psyche', label: 'Na gazie (seria dobrych meczów)', range: [0, 0.35],
  enabled: () => ENGINE2.state, apply: (p) => onFireOf(p),
});
registerModifier({
  id: 'rust', stage: 'player', group: 'body', label: 'Powrót po kontuzji', range: [-0.8, 0],
  enabled: () => ENGINE2.state, apply: (p) => rustOf(p),
});

/** Wpisy pul stanu zawodnika (granice STATE w engine2.js). */
export const STATE_POOLS = { psyche: ['form', 'morale', 'onFire'], body: ['sharp', 'fresh', 'rust'], acclim: ['acclim'] };
const poolSum = (parts, ids) => { let s = 0; for (const id of ids) s += parts[id] ?? 0; return s; };
/**
 * Granice stanu: psychika +0,7 / -0,8, ciało 0 / -1,5, aklimatyzacja 0 / -0,6, suma +1,0 / -2,0, potem mnożnik
 * niższych lig (x1,00 ... x1,20). Wynik: poprawka do sumy wpisów pul (rozbicie pokazuje wkłady i tę poprawkę osobno).
 */
export function statePoolTerm(p, ctx, parts) {
  if (!parts) return 0;
  const ps = poolSum(parts, STATE_POOLS.psyche); const bo = poolSum(parts, STATE_POOLS.body); const ac = poolSum(parts, STATE_POOLS.acclim);
  const t = clamp(clamp(ps, ...STATE.psyche) + clamp(bo, ...STATE.body) + clamp(ac, ...STATE.acclim), ...STATE.total) * tierMul(tierOf(ctx, p));
  return t - (ps + bo + ac);
}
registerModifier({
  id: 'statePool', stage: 'player', group: 'limits', label: 'Granice stanu i poziom ligi', range: [-0.6, 2.4], order: 89, needsParts: true,
  enabled: () => ENGINE2.state, apply: (p, ctx, parts) => statePoolTerm(p, ctx, parts),
});
