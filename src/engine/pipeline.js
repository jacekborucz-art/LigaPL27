// Wbudowane wpisy potoku silnika (docs/walka-taktyk.md, krok 1): czynniki, które wcześniej siedziały w teams.js,
// core.js i teamStrength.js, przeniesione do rejestru (src/engine/modifiers.js) BEZ ZMIANY LICZB.
// Silnik czyta gotowe wartości: etapy start (attr, player, match) raz na mecz, slot po zmianie miejsca zawodnika,
// live i team raz na minutę (updateZones), matchup po zmianie stanu drużyn (znacznik T.zv). Rejestr nie losuje;
// losowania (etap rng) zostają w silniku w tej samej kolejności (np. dyspozycja dnia w mkPlayer).
// Wkład, który silnik dodaje do swojej wartości, idzie po kolei (channelTerms), żeby kolejność działań
// zmiennoprzecinkowych była ta sama co przed potokiem.

import { registerModifier, evaluate, channel, channelTerms, entriesFor } from './modifiers.js';
import { proficiency, posEff, errorMul } from './positions.js';
import { K } from './match/constants.js';
import { CAPTAIN } from './captain.js';
import { zoneRatings, condPenalty, typeWeights, counterBonus, teamHunger } from './match/factors.js';


// ------------------------------------------------------------ attr: atrybuty w strefach (wagi stref)
registerModifier({
  id: 'zoneRatings', stage: 'attr', group: 'attr', label: 'Atrybuty w strefach (wagi)', range: [1, 20],
  channels: ['zone.DEF', 'zone.MID', 'zone.ATT', 'zone.GK'],
  apply: (p) => { const z = zoneRatings(p); return { 'zone.DEF': z.DEF, 'zone.MID': z.MID, 'zone.ATT': z.ATT, 'zone.GK': z.GK }; },
});

// ------------------------------------------------------------ slot: pozycja i strona (positions.js)
// subject: zawodnik (p), ctx: slot { pos, side, prof? } (prof: biegłość policzona już przez wywołującego)
registerModifier({
  id: 'position', stage: 'slot', group: 'position', label: 'Gra poza pozycją: skuteczność', range: [0.55, 1], channel: 'pos',
  apply: (p, slot) => posEff(slot.prof ?? proficiency(p, slot.pos, slot.side)),
});
registerModifier({
  id: 'positionErrors', stage: 'slot', group: 'position', label: 'Gra poza pozycją: błędy w obronie', range: [1, 2.2], channel: 'err',
  apply: (p, slot) => errorMul(proficiency(p, slot.pos, slot.side), true),
});

// ------------------------------------------------------------ player: dyspozycja dnia i ranga x WAZ (tylko w meczu)
// Na końcu sumy etapu (order 90, 91): ta sama kolejność dodawania co dawniej (stan + dayForm + waz).
// Losowanie dyspozycji zostaje w mkPlayer (etap rng: kolejność losowań bez zmian); wpis podaje wylosowaną liczbę.
registerModifier({
  id: 'dayForm', stage: 'player', group: 'rng', label: 'Dyspozycja dnia (los)', range: [-2.6, 2.6], order: 90,
  mode: 'match', enabled: (ctx) => ctx.dayForm !== undefined,
  apply: (p, ctx) => ctx.dayForm,
});
registerModifier({
  id: 'waz', stage: 'player', group: 'psyche', label: 'Ważne mecze (ranga x WAZ)', range: [-0.36, 0.4], order: 91,
  mode: 'match',
  apply: (p, ctx) => (ctx.rank >= 2 ? 0.04 * ((p.hidden?.WAZ ?? 10) - 10) : 0),
});

// ------------------------------------------------------------ live: stan w meczu (co minutę), subject: zawodnik meczowy x
registerModifier({
  id: 'engagement', stage: 'live', group: 'psyche', label: 'Zaangażowanie w meczu (Z)', range: [-0.5, 0.5],
  apply: (x) => 0.035 * x.Z,
});
registerModifier({
  id: 'condition', stage: 'live', group: 'body', label: 'Kondycja w meczu', range: [-55, 0], // bez granicy (krok 2)
  apply: (x) => condPenalty(x),
});

// ------------------------------------------------------------ team: drużyna
// Pełny silnik (ctx.inMatch, subject: drużyna T, ctx.M, ctx.xs): kanał zone.field odejmowany od stref DEF/MID/ATT po kolei
registerModifier({
  id: 'shortHanded', stage: 'team', group: 'shape', label: 'Gra w osłabieniu', range: [-3.6, 0], channel: 'zone.field', mode: 'match',
  apply: (T, ctx) => -((11 - ctx.xs.length) * K.shortHanded),
});
registerModifier({
  id: 'cohesion', stage: 'team', group: 'team', label: 'Spójność w meczu', range: [-1.05, 0], channel: 'zone.field', mode: 'match',
  apply: (T) => -((100 - T.S) * 0.015),
});
registerModifier({
  id: 'knocks', stage: 'team', group: 'body', label: 'Kilku grających z bólem', range: [-0.6, 0], channel: 'zone.field', mode: 'match',
  apply: (T) => -T.knockPen,
});
registerModifier({
  id: 'captain', stage: 'team', group: 'team', label: 'Kapitan przy stawce (E x S)', range: [-1, 1], channel: 'cap', mode: 'match',
  apply: (T, ctx) => {
    const M = ctx.M;
    let S = T.capS0;
    if (M.minute >= CAPTAIN.lateFrom && Math.abs(M.score[0] - M.score[1]) <= 1) S = Math.max(S, CAPTAIN.stakes.late);
    return S >= CAPTAIN.sFrom ? T.capE * S : 0;
  },
});
registerModifier({
  id: 'hunger', stage: 'team', group: 'psyche', label: 'Głód goli drużyny (H)', range: [0, 1], channel: 'hunger', mode: 'match', when: 'action',
  apply: (T, ctx) => teamHunger(T, ctx.M), // leniwie, z pamięcią na minutę; zależy od wyniku w trakcie minuty
});
// Mecze w tle i raporty (teamStrength.js, subject: { xi, squad }, ctx z teamRating): zone.all do wszystkich stref
registerModifier({
  id: 'tableConfidence', stage: 'team', group: 'conditions', label: 'Pewność siebie z tabeli', range: [-0.15, 0.15], channel: 'zone.all', mode: 'quick',
  apply: (s, ctx) => ctx.tableTerm || 0,
});
registerModifier({
  id: 'coachDecisions', stage: 'team', group: 'coach', label: 'Decyzje trenera w meczu w tle', range: [-0.3, 0.3], channel: 'zone.all', mode: 'quick',
  apply: (s, ctx) => ctx.coachTerm || 0,
});
registerModifier({
  id: 'shortHandedQuick', stage: 'team', group: 'shape', label: 'Niepełny skład (mecz w tle)', range: [-9.9, 0], channel: 'zone.field', mode: 'quick',
  apply: (s) => -(Math.max(0, 11 - s.xi.length) * 0.9),
});

// ------------------------------------------------------------ matchup: starcie planów (subject { A, D }: atak i obrona)
registerModifier({
  id: 'typeMix', stage: 'matchup', group: 'counters', label: 'Rodzaje akcji: plan wobec planu rywala', range: [0, 1.5],
  channels: ['act.POZ', 'act.SKR', 'act.KON', 'act.DYS'], enabled: (ctx) => ctx.type == null,
  apply: (s) => { const w = typeWeights(s.A, s.D); return { 'act.POZ': w.POZ, 'act.SKR': w.SKR, 'act.KON': w.KON, 'act.DYS': w.DYS }; },
});
registerModifier({
  id: 'counters', stage: 'matchup', group: 'counters', label: 'Kontry taktyczne (przełamanie)', range: [-0.5, 0.5], channel: 'brk',
  enabled: (ctx) => ctx.type != null,
  apply: (s, ctx) => counterBonus(s.A, s.D, ctx.type),
});

// ------------------------------------------------------------ match: warunki meczu (subject i ctx: kontekst meczu)
registerModifier({
  id: 'weather', stage: 'match', group: 'conditions', label: 'Pogoda i murawa', range: [0.85, 1.7],
  channels: ['conv', 'foul', 'fat', 'inj', 'act', 'dys'],
  apply: (c) => {
    const w = c.weather ?? {};
    return { conv: w.conv ?? 1, foul: w.foul ?? 1, fat: w.fat ?? 1, inj: w.inj ?? 1, act: w.act ?? 1, dys: w.dys ?? 1 };
  },
});
registerModifier({
  id: 'referee', stage: 'match', group: 'conditions', label: 'Sędzia (surowość)', range: [0.7, 1.4],
  channels: ['foul', 'card', 'red', 'pen', 'penCard', 'tacCard'],
  apply: (c) => {
    const r = c.refStrict;
    return { foul: 1.1 - 0.1 * r, card: r, red: Math.sqrt(r), pen: 0.85 + 0.15 * r, penCard: 0.1 * r, tacCard: Math.sqrt(r) };
  },
});
registerModifier({
  id: 'rank', stage: 'match', group: 'conditions', label: 'Ranga meczu (faule, kartki)', range: [1, 1.15], channels: ['foul', 'card'],
  apply: (c) => ({ foul: c.rank >= 2 ? 1.1 : 1, card: c.rank >= 2 ? 1.15 : 1 }),
});
registerModifier({
  id: 'crowd', stage: 'match', group: 'conditions', label: 'Kibice i atut boiska', range: [0, 1], channels: ['hfa', 'home'],
  apply: (c) => ({ hfa: c.neutral ? 0 : 0.7 + 0.3 * c.attendance, home: c.neutral ? 0 : 0.3 }),
});

// ------------------------------------------------------------ Odczyt dla silnika
const MATCH_CTX = Object.freeze({ inMatch: true });

/** Oceny w strefach zawodnika (etap attr), raz na mecz. */
export function attrZones(p) {
  // Suma kanałów zone.* wpisów etapu (od 0, w kolejności wpisów; jak evaluate(...).ch), bez alokacji rozbicia
  const R = { DEF: 0, MID: 0, ATT: 0, GK: 0 };
  for (const m of entriesFor('attr', 'zone.DEF', true)) {
    if (m.enabled && !m.enabled(MATCH_CTX)) continue;
    const r = m.apply(p, MATCH_CTX);
    R.DEF += r['zone.DEF'] ?? 0; R.MID += r['zone.MID'] ?? 0; R.ATT += r['zone.ATT'] ?? 0; R.GK += r['zone.GK'] ?? 0;
  }
  return R;
}

/** Mnożnik skuteczności zawodnika na slocie (etap slot, kanał pos). */
export const slotEff = (p, slot) => channel('slot', 'pos', p, slot);

/**
 * Wartości etapu slot dla zawodnika meczowego (x.mxPos, x.mxErr), liczone ponownie tylko po zmianie slotu
 * (nowy obiekt, inna pozycja albo strona).
 */
export function slotMx(x) {
  const s = x.slot;
  if (x.mxS !== s || x.mxP !== s.pos || x.mxSd !== s.side) {
    x.mxS = s; x.mxP = s.pos; x.mxSd = s.side;
    x.mxPos = channel('slot', 'pos', x.p, s);
    x.mxErr = channel('slot', 'err', x.p, s);
  }
  return x;
}

/** Stan zawodnika na start meczu (etap player z dyspozycją dnia i WAZ): { total, parts }. */
export function playerBase(p, rank, dayForm) {
  return evaluate('player', p, { inMatch: true, rank, dayForm });
}

/** Wkłady etapu live zawodnika x w tej minucie do x.live (kolejno), x.liveN: ich liczba, x.liveIds: wpisy. */
export function liveFill(x) {
  x.liveN = channelTerms('live', 'pts', x, MATCH_CTX, x.live, x.liveIds);
}
const liveTmp = [];
/** v + kolejne wkłady etapu live liczone teraz (akcja w trakcie minuty, np. strzał). */
export function liveAdd(v, x) {
  const n = channelTerms('live', 'pts', x, MATCH_CTX, liveTmp);
  for (let i = 0; i < n; i++) v += liveTmp[i];
  return v;
}

/** Wkłady etapu team do stref z pola w tej minucie (T.tTerms, T.tIds, T.tN). */
export function teamFill(T) {
  T.tN = channelTerms('team', 'zone.field', T, T.mctx, T.tTerms, T.tIds);
}

/** Kapitan przy stawce E x S (etap team, kanał cap) dla drużyny T w meczu M. */
export function captainTerm(T, M) {
  T.mctx.M = M;
  return channel('team', 'cap', T, T.mctx);
}

/** Głód goli drużyny H w tej minucie (etap team, kanał hunger). */
export const hungerNow = (T, M) => { T.mctx.M = M; return channel('team', 'hunger', T, T.mctx); };

const MU_MIX = Object.freeze({ inMatch: true, type: null });
const ACT = Object.keys(K.typeW).map((t) => [t, `act.${t}`]);
const MU_TYPE = Object.freeze(Object.fromEntries(Object.keys(K.typeW).map((t) => [t, Object.freeze({ inMatch: true, type: t })])));
function matchupCache(A, D) {
  const c = A.mu;
  if (c.av !== A.zv || c.dv !== D.zv || c.s.D !== D) {
    c.av = A.zv; c.dv = D.zv; c.s.A = A; c.s.D = D; c.w = null;
    for (const t in c.b) c.b[t] = undefined;
  }
  return c;
}
/** Wagi rodzajów akcji ataku A wobec obrony D (etap matchup), gotowe na czas stanu drużyn. Klucze jak K.typeW. */
export function matchupWeights(A, D) {
  const c = matchupCache(A, D);
  if (!c.w) {
    // Iloczyn kanałów act.* wpisów etapu (od 1, w kolejności wpisów; jak evaluate(...).ch), bez alokacji rozbicia
    const w = {};
    for (const [t] of ACT) w[t] = 1;
    let any = false;
    for (const m of entriesFor('matchup', 'act.POZ', true)) {
      if (m.enabled && !m.enabled(MU_MIX)) continue;
      const r = m.apply(c.s, MU_MIX);
      for (const [t, k] of ACT) w[t] *= r[k] ?? 1;
      any = true;
    }
    if (!any) for (const [t] of ACT) w[t] = K.typeW[t]; // wpis wyłączony: wagi bazowe rodzajów akcji
    c.w = w;
  }
  return c.w;
}
/** Bonus kontr taktycznych do przełamania akcji typu `type` (etap matchup, kanał brk). */
export function matchupBrk(A, D, type) {
  const c = matchupCache(A, D);
  let v = c.b[type];
  if (v === undefined) v = c.b[type] = channel('matchup', 'brk', c.s, MU_TYPE[type]);
  return v;
}
export const newMatchupCache = () => ({ av: -1, dv: -1, w: null, b: {}, s: { A: null, D: null } });

/**
 * Warunki meczu (etap match) raz na mecz: wartości każdego wpisu pod nazwami, które czyta core.js, w tej samej
 * kolejności mnożenia co dawniej. Wyłączony wpis: wartość neutralna.
 */
export function matchFactors(ctx) {
  const ev = evaluate('match', ctx, ctx);
  const P = ev.chParts;
  const g = (id, k, d) => P[id]?.[k] ?? d;
  return {
    wConv: g('weather', 'conv', 1), wFoul: g('weather', 'foul', 1), wFat: g('weather', 'fat', 1), wInj: g('weather', 'inj', 1),
    wAct: g('weather', 'act', 1), wDys: g('weather', 'dys', 1),
    refFoul: g('referee', 'foul', 1), refCard: g('referee', 'card', 1), refRed: g('referee', 'red', 1), refPen: g('referee', 'pen', 1),
    refPenCard: g('referee', 'penCard', 0.1), refTacCard: g('referee', 'tacCard', 1),
    rankFoul: g('rank', 'foul', 1), rankCard: g('rank', 'card', 1),
    hfa: g('crowd', 'hfa', 0), home: g('crowd', 'home', 0),
    ch: ev.ch, parts: P,
  };
}

// ------------------------------------------------------------ Rozbicie zrealizowane w meczu (M.ledger), bez wpływu na wynik
/**
 * Pusty dziennik wkładów: na drużynę minuty, minuty zawodników, sumy wkładów etapu live i team (tablice w kolejności
 * wpisów, ids obok), kapitan, kontry. Etap player liczy się na końcu z minut zawodnika (x.lgMin) i jego parts.
 */
export function newLedger(mx) {
  const side = () => ({ minutes: 0, playerMinutes: 0, live: [], liveIds: [], team: [], teamIds: [], cap: 0, brk: 0, brkN: 0, types: {} });
  return { match: mx.parts, sides: [side(), side()] };
}
/** Minuta gry drużyny T (po updateZones): tanio, same dodawania liczb. */
export function ledgerMinute(M, T, xs) {
  const L = M.ledger?.sides[T.side];
  if (!L) return;
  L.minutes++; L.playerMinutes += xs.length;
  const lv = L.live;
  for (const x of xs) {
    x.lgMin = (x.lgMin ?? 0) + 1;
    for (let i = 0; i < x.liveN; i++) lv[i] = (lv[i] ?? 0) + x.live[i];
    if (x.liveN > L.liveIds.length) L.liveIds = x.liveIds.slice(0, x.liveN);
  }
  for (let i = 0; i < T.tN; i++) L.team[i] = (L.team[i] ?? 0) + T.tTerms[i];
  if (T.tN > L.teamIds.length) L.teamIds = T.tIds.slice(0, T.tN);
  L.cap += T.capES;
}
/** Akcja ataku: rodzaj i bonus kontr, który naprawdę zadziałał. */
export function ledgerAction(M, side, type, brk) {
  const L = M.ledger?.sides[side];
  if (!L) return;
  L.brk += brk; L.brkN++;
  L.types[type] = (L.types[type] ?? 0) + 1;
}
/**
 * Średnie z dziennika na drużynę: wkład etapów player i live na zawodnika i minutę (perPlayerMinute, pkt atrybutu),
 * etapu team na minutę (perMinute: zone.field i kapitan E x S), średni bonus kontr w akcjach i liczba akcji wg rodzaju,
 * warunki meczu (match: wartości wpisów etapu match).
 */
export function ledgerSummary(M) {
  if (!M.ledger) return null;
  return M.ledger.sides.map((L, side) => {
    const pts = {};
    for (const x of [...M.teams[side].players, ...M.teams[side].bench]) {
      if (!x.lgMin) continue;
      for (const id in x.parts) pts[id] = (pts[id] ?? 0) + x.parts[id] * x.lgMin;
    }
    L.liveIds.forEach((id, i) => { pts[id] = (pts[id] ?? 0) + (L.live[i] ?? 0); });
    const per = (v, n) => (n ? v / n : 0);
    const perMinute = Object.fromEntries(L.teamIds.map((id, i) => [id, per(L.team[i] ?? 0, L.minutes)]));
    perMinute.captain = per(L.cap, L.minutes);
    return {
      minutes: L.minutes,
      perPlayerMinute: Object.fromEntries(Object.entries(pts).map(([k, v]) => [k, per(v, L.playerMinutes)])),
      perMinute, counters: per(L.brk, L.brkN), actions: { ...L.types }, match: M.ledger.match,
    };
  });
}

