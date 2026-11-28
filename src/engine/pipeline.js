// Wbudowane wpisy potoku silnika (docs/walka-taktyk.md, krok 1): czynniki, które wcześniej siedziały w teams.js,
// core.js i teamStrength.js, przeniesione do rejestru (src/engine/modifiers.js) BEZ ZMIANY LICZB.
// Silnik czyta gotowe wartości: etapy start (attr, player, match) raz na mecz, slot po zmianie miejsca zawodnika,
// live i team raz na minutę (updateZones), matchup po zmianie stanu drużyn (znacznik T.zv). Rejestr nie losuje;
// losowania (etap rng) zostają w silniku w tej samej kolejności (np. dyspozycja dnia w mkPlayer).
// Wkład, który silnik dodaje do swojej wartości, idzie po kolei (channelTerms), żeby kolejność działań
// zmiennoprzecinkowych była ta sama co przed potokiem.

import { registerModifier, evaluate, channel, channelTerms, entriesFor, registryVersion } from './modifiers.js';
import { ENGINE2, COND, tierMul } from './engine2.js';
import { clamp } from '../core/rng.js';
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
// Krok 2 (ENGINE2.conditions): stawka = max(ranga 2+, presja tabeli 0-1) x psychika (WAZ i opanowanie OPA), granica
// +-0,4, x mnożnik ligi; ENGINE2.unify: także w meczach w tle (ranga z quickRank). Wyłączone: jak w kroku 1.
export function stakesTerm(p, ctx) {
  if (!ENGINE2.conditions) return ctx.rank >= 2 ? 0.04 * ((p.hidden?.WAZ ?? 10) - 10) : 0;
  const S = ctx.rank >= 2 ? 1 : ctx.pressure || 0;
  if (!S) return 0;
  const waz = p.hidden?.WAZ ?? 10;
  const C = COND.stakes;
  const opa = p.attr?.OPA ?? p.ovr ?? 10;
  return clamp(S * (C.waz * (waz - 10) + C.opa * (opa - 10)), -C.cap, C.cap) * tierMul(ctx.tier);
}
registerModifier({
  id: 'waz', stage: 'player', group: 'psyche', label: 'Stawka meczu (ranga, presja tabeli) x WAZ i opanowanie', range: [-0.48, 0.48], order: 91,
  enabled: (ctx) => ctx.inMatch || ENGINE2.unify, // krok 1: tylko pełny silnik (dawny mode 'match')
  apply: (p, ctx) => stakesTerm(p, ctx),
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
  // krok 2 (unify): wyłączone; pewność siebie liczy pula psychiki (forma, morale, „na gazie”), jak w pełnym silniku
  enabled: () => !ENGINE2.unify,
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
    // penCard: krok 1 szansa 0,1 x r; krok 2 (pipeFix) mnożnik r, a 0,1 dokłada matchFactors (neutralny kanał = 1)
    return { foul: 1.1 - 0.1 * r, card: r, red: Math.sqrt(r), pen: 0.85 + 0.15 * r, penCard: ENGINE2.pipeFix ? r : 0.1 * r, tacCard: Math.sqrt(r) };
  },
});
registerModifier({
  id: 'rank', stage: 'match', group: 'conditions', label: 'Ranga meczu (faule, kartki)', range: [1, 1.15], channels: ['foul', 'card'],
  apply: (c) => ({ foul: c.rank >= 2 ? 1.1 : 1, card: c.rank >= 2 ? 1.15 : 1 }),
});
registerModifier({
  id: 'crowd', stage: 'match', group: 'conditions', label: 'Kibice i atut boiska', range: [0, 1], channels: ['hfa', 'home'],
  enabled: () => !ENGINE2.conditions, // krok 2: zastąpione wartością terenu (terrain)
  apply: (c) => ({ hfa: c.neutral ? 0 : 0.7 + 0.3 * c.attendance, home: c.neutral ? 0 : 0.3 }),
});

// Krok 2 (ENGINE2.conditions): warunki meczu. Kontekst c: attendance 0-1, travelKm (podróż gości), pitch (murawa
// z matchday.js), derby (intensywność 0-3, career/fans.js rivalry), tier (poziom ligi gospodarza), neutral.
/** Atut boiska jako jedna wartość terenu (0 na neutralnym): frekwencja, podróż gości, murawa znana gospodarzom. */
export function terrainHfa(c) {
  if (c.neutral) return 0;
  const H = COND.hfa;
  const travel = clamp((c.travelKm ?? H.travelKm * 0.75) / H.travelKm, 0, 1);
  return (H.base + H.fill * (c.attendance ?? 0.8) + H.travel * travel + (H.pitch[c.pitch] ?? 0)) * tierMul(c.tier);
}
registerModifier({
  id: 'terrain', stage: 'match', group: 'conditions', label: 'Atut boiska (frekwencja, podróż, murawa)', range: [0, 1.32], channels: ['hfa', 'home'],
  enabled: () => ENGINE2.conditions,
  apply: (c) => { const h = terrainHfa(c); return { hfa: h, home: COND.home * h / 0.88 }; },
});
registerModifier({
  id: 'derby', stage: 'match', group: 'conditions', label: 'Derby (faule, kartki, mniejsza różnica klas)', range: [0.78, 1.25],
  channels: ['foul', 'card', 'gap', 'dfMul'], enabled: (c) => ENGINE2.conditions && c.derby > 0,
  apply: (c) => {
    const v = Math.min(3, c.derby) * tierMul(c.tier); const D = COND.derby;
    return { foul: 1 + D.foul * v, card: 1 + D.card * v, gap: 1 - D.gap * v, dfMul: 1 + D.dayForm * v };
  },
});
registerModifier({
  id: 'pitch', stage: 'match', group: 'conditions', label: 'Murawa (technika, krótkie podania, walka)', range: [-0.14, 1.07],
  channels: ['passAcc', 'brk.POZ', 'brk.SKR', 'foul'], enabled: (c) => ENGINE2.conditions && !!COND.pitch[c.pitch],
  apply: (c) => {
    const P = COND.pitch[c.pitch]; const m = tierMul(c.tier);
    return { passAcc: (P.passAcc ?? 0) * m, 'brk.POZ': (P.brkPOZ ?? 0) * m, 'brk.SKR': (P.brkSKR ?? 0) * m, foul: 1 + ((P.foul ?? 1) - 1) * m };
  },
});

// ------------------------------------------------------------ Odczyt dla silnika
const MATCH_CTX = Object.freeze({ inMatch: true });

/** Oceny w strefach zawodnika (etap attr), raz na mecz. */
export function attrZones(p) {
  // Suma kanałów zone.* wpisów etapu (od 0, w kolejności wpisów; jak evaluate(...).ch), bez alokacji rozbicia.
  // Krok 2 (pipeFix): wszystkie wpisy etapu (także z jednym kanałem stref); bez wpisów: wartość neutralna (ovr).
  const R = { DEF: 0, MID: 0, ATT: 0, GK: 0 };
  let any = false;
  for (const m of entriesFor('attr', ENGINE2.pipeFix ? '*' : 'zone.DEF', true)) {
    if (m.enabled && !m.enabled(MATCH_CTX)) continue;
    const r = m.apply(p, MATCH_CTX);
    if (r === null || typeof r !== 'object') continue;
    R.DEF += r['zone.DEF'] ?? 0; R.MID += r['zone.MID'] ?? 0; R.ATT += r['zone.ATT'] ?? 0; R.GK += r['zone.GK'] ?? 0;
    any = true;
  }
  if (!any && ENGINE2.pipeFix) { const v = p.ovr ?? 10; R.DEF = v; R.MID = v; R.ATT = v; R.GK = v; }
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
  const fix = ENGINE2.pipeFix;
  if (x.mxS !== s || x.mxP !== s.pos || x.mxSd !== s.side || (fix && x.mxV !== registryVersion())) {
    x.mxS = s; x.mxP = s.pos; x.mxSd = s.side;
    let c = s;
    if (fix) {
      // Krok 2: kontekst pełnego silnika (inMatch), żeby pole mode wpisów etapu slot działało jak w innych etapach
      c = (x.mxC ??= { pos: null, side: null, prof: undefined, inMatch: true });
      c.pos = s.pos; c.side = s.side;
      x.mxV = registryVersion();
    }
    x.mxPos = channel('slot', 'pos', x.p, c);
    x.mxErr = channel('slot', 'err', x.p, c);
  }
  return x;
}

/**
 * Stan zawodnika na start meczu (etap player z dyspozycją dnia i stawką x WAZ): { total, parts }.
 * t: kontekst drużyny w meczu { rank, tier, pressure } (krok 2: poziom ligi i presja tabeli).
 */
export function playerBase(p, t, dayForm) {
  return evaluate('player', p, { inMatch: true, rank: t.rank, dayForm, tier: t.tier, pressure: t.pressure });
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
  if (c.av !== A.zv || c.dv !== D.zv || c.s.D !== D || (ENGINE2.pipeFix && c.rv !== registryVersion())) {
    c.av = A.zv; c.dv = D.zv; c.s.A = A; c.s.D = D; c.w = null; c.rv = registryVersion();
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
    if (ENGINE2.pipeFix) {
      // Krok 2: wszystkie wpisy z dowolnym kanałem act.*; wagi bazowe K.typeW, gdy nie działa wpis typeMix (który je zawiera)
      let base = false;
      for (const m of entriesFor('matchup', '*', true)) {
        if (!m.channels.some((k) => k.startsWith('act.'))) continue;
        if (m.enabled && !m.enabled(MU_MIX)) continue;
        const r = m.apply(c.s, MU_MIX);
        if (r === null || typeof r !== 'object') continue;
        for (const [t, k] of ACT) w[t] *= r[k] ?? 1;
        if (m.id === 'typeMix') base = true;
      }
      if (!base) for (const [t] of ACT) w[t] *= K.typeW[t];
      c.w = w;
      return c.w;
    }
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
export function matchFactors(ctx, inMatch = true) {
  const fix = ENGINE2.pipeFix;
  // Krok 2 (pipeFix): kontekst z inMatch (pole mode wpisów działa jak w innych etapach); mecze w tle: inMatch false
  const ev = fix ? evaluate('match', ctx, { ...ctx, inMatch }) : evaluate('match', ctx, ctx);
  const P = ev.chParts; const ch = ev.ch;
  const c = (k, d) => ch[k] ?? d;
  // Kanały warunków dodanych w kroku 2 (suma kanału): różnica klas, rozrzut dyspozycji dnia, murawa
  const extra = {
    gap: c('gap', 1), dfMul: c('dfMul', 1), passAcc: c('passAcc', 0),
    brk: { POZ: c('brk.POZ', 0), SKR: c('brk.SKR', 0), KON: c('brk.KON', 0), DYS: c('brk.DYS', 0) },
  };
  if (fix) {
    // Silnik czyta sumę kanału (iloczyn wszystkich wpisów), więc nowy wpis warunków działa bez zmian w core.js.
    // Mnożniki ułożone tak, że wzory w core.js (wFoul x rankFoul x refFoul) dają iloczyn kanału.
    // penCard: szansa kartki za faul w polu karnym = 0,1 x kanał (sędzia zwraca surowość)
    return {
      wConv: c('conv', 1), wFoul: c('foul', 1), wFat: c('fat', 1), wInj: c('inj', 1), wAct: c('act', 1), wDys: c('dys', 1),
      refFoul: 1, refCard: c('card', 1), refRed: c('red', 1), refPen: c('pen', 1),
      refPenCard: 0.1 * c('penCard', 1), refTacCard: c('tacCard', 1),
      rankFoul: 1, rankCard: 1,
      hfa: c('hfa', 0), home: c('home', 0), foul: c('foul', 1), card: c('card', 1), red: c('red', 1), pen: c('pen', 1),
      ...extra, ch, parts: P,
    };
  }
  const g = (id, k, d) => P[id]?.[k] ?? d;
  return {
    wConv: g('weather', 'conv', 1), wFoul: g('weather', 'foul', 1), wFat: g('weather', 'fat', 1), wInj: g('weather', 'inj', 1),
    wAct: g('weather', 'act', 1), wDys: g('weather', 'dys', 1),
    refFoul: g('referee', 'foul', 1), refCard: g('referee', 'card', 1), refRed: g('referee', 'red', 1), refPen: g('referee', 'pen', 1),
    refPenCard: g('referee', 'penCard', 0.1), refTacCard: g('referee', 'tacCard', 1),
    // Krok 2 bez pipeFix: derby i murawa dochodzą do mnożników rangi (faule, kartki)
    rankFoul: g('rank', 'foul', 1) * g('derby', 'foul', 1) * g('pitch', 'foul', 1), rankCard: g('rank', 'card', 1) * g('derby', 'card', 1),
    hfa: g('crowd', 'hfa', g('terrain', 'hfa', 0)), home: g('crowd', 'home', g('terrain', 'home', 0)),
    foul: c('foul', 1), card: c('card', 1), red: c('red', 1), pen: c('pen', 1),
    ...extra, ch, parts: P,
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
    if (x.kPen) L.knock = (L.knock ?? 0) + x.kPen; // kara lekkiego urazu w meczu (krok 2, pipeFix)
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
    if (L.knock) pts.knockInMatch = -L.knock;
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

