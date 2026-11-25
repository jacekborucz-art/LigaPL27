// Drużyny w trakcie meczu: zawodnicy na boisku i ławce, strefy siły (6.1 a),
// parametry taktyki z danych formacji i instrukcji (z bezwładnością 4.3), kondycja i spójność.

import { formationById, FORMATIONS } from '../../data/formations.js';
import { INSTRUCTIONS } from '../../data/instructions.js';
import { proficiency, posEff, goalkeeperSlotModifiers, errorMul } from '../positions.js';
import { evaluate } from '../modifiers.js';
import { clamp, Rng } from '../../core/rng.js';
import { K, ROLE_SHARE, ZONE_N, FATIGUE_ROLE, KNOCK, FATIGUE, INSTR_NUM } from './constants.js';
import { cleanPlayerInstrMap } from '../../data/playerInstructions.js';
import { refreshPI, clearPI, applyShift, shiftedShare, validatePlayerInstr, mergePlayerInstr, PI } from './playerInstr.js';

const a = (p, k) => p.attr?.[k] ?? p.ovr ?? 10;

/** Oceny zawodnika w strefach z atrybutów (stałe na cały mecz). */
export function zoneRatings(p) {
  return {
    DEF: (3 * a(p, 'ODB') + 3 * a(p, 'UST') + 1.5 * a(p, 'GLO') + a(p, 'SIL') + a(p, 'SZY') + a(p, 'DEC') + 0.5 * a(p, 'OPA') + 0.5 * a(p, 'SKO') + 0.5 * a(p, 'AGR')) / 12,
    MID: (3 * a(p, 'POD') + 2 * a(p, 'DEC') + 2 * a(p, 'TEC') + 1.5 * a(p, 'WIZ') + 1.5 * a(p, 'PRA') + a(p, 'WYT') + a(p, 'ODB') + 0.5 * a(p, 'UST')) / 12.5,
    ATT: (3 * a(p, 'WYK') + 2 * a(p, 'RUC') + 1.5 * a(p, 'TEC') + 1.5 * a(p, 'DRY') + 1.5 * a(p, 'SZY') + a(p, 'OPA') + a(p, 'GLO') + 0.5 * a(p, 'DYS') + 0.5 * a(p, 'ZWI') + 0.5 * a(p, 'DOS')) / 13,
    GK: (3 * a(p, 'REF') + 2 * a(p, 'UST') + 1.5 * a(p, 'CHW') + 1.5 * a(p, 'JNJ') + a(p, 'WYJ') + a(p, 'OPA')) / 10,
  };
}

// ------------------------------------------------------------ Lekkie urazy (gra z bólem)
/** Kod typu lekkiego urazu z nazwy (KNOCK.types); nieznany lekki uraz liczy się jak stłuczenie. */
export function knockTypeOf(name = '') {
  for (const [code, t] of Object.entries(KNOCK.types)) if (name.startsWith(t.name)) return code;
  return 'contusion';
}

/**
 * Czy zawodnik z urazem sprzed meczu może zagrać z bólem (decyzja gracza lub AI, flaga p.playingInjured):
 * lekki uraz (bez wstrząśnienia mózgu) z przerwą najwyżej KNOCK.preDays dni.
 */
export function knockEligible(p) {
  const days = p?.injuryDays ?? 0;
  if (!(days > 0) || days > KNOCK.preDays) return false;
  if ((p.injury?.cat ?? 'light') !== 'light') return false;
  return !/wstrząśnienie/.test(p.injury?.name ?? '');
}

/**
 * Stan lekkiego urazu na zawodniku meczowym (x.knock), czytany przez UI (biały krzyżyk na ikonie):
 * { name, type: contusion|strain|sprain, since: minuta, pre: uraz sprzed meczu, aggravated, aggravatedAt, days }.
 */
export function makeKnock(name, minute, { pre = false, days = 0 } = {}) {
  return { name, type: knockTypeOf(name), since: minute, pre, aggravated: false, aggravatedAt: null, days };
}

function mkPlayer(p, slot, side, rng, ctx, Z = 0) {
  const dayForm = rng.gauss(0, Math.max(0.2, 0.9 - 0.035 * (p.hidden?.KON ?? 10)));
  const waz = ctx.rank >= 2 ? 0.04 * ((p.hidden?.WAZ ?? 10) - 10) : 0;
  // Uraz sprzed meczu, z którym zawodnik gra z bólem: kara do formy daje modyfikator playingInjured (modifiers.js)
  const knock = p.playingInjured && p.injuryDays > 0 ? makeKnock(p.injury?.name ?? 'stłuczenie', 0, { pre: true, days: p.injuryDays }) : null;
  return {
    id: p.id, p, slot, side, R: zoneRatings(p), base: evaluate('player', p, { inMatch: true }).total + dayForm + waz, dayForm,
    cond: p.fresh ?? 95, on: !!slot, sentOff: false, subbedOff: false, injury: null, treatedUntil: -1,
    Z, yc: 0, minOn: slot ? 0 : null, minOff: null,
    ev: 0, g: 0, ast: 0, sh: 0, sot: 0, kp: 0, tk: 0, saves: 0, fouls: 0, offs: 0,
    fit: null, prevSlot: null, bookChecked: false, knock, slotIdx: -1, redCode: null,
    pi: null, piDraw: null, // instrukcje indywidualne (playerInstr.js): efekty i losowania na mecz
  };
}

// Pamięć dopasowania zawodnika do slotu: indeks pozycji * 3 + strona (brak, L, P)
const POS_IDX = { BR: 0, ŚO: 1, BO: 2, WB: 3, DP: 4, ŚP: 5, OP: 6, BP: 7, SN: 8, NAP: 9 };
const FIT_N = 30;

// ------------------------------------------------------------ Parametry taktyki
const NEUTRAL_ACT = () => ({ POZ: 1, SKR: 1, KON: 1, DYS: 1 });

/** Łączy efekty formacji i wybranych instrukcji w jeden zestaw liczb dla silnika. */
/** Dodaje efekty (instrukcji albo formacji, ten sam słownik) do parametrów taktyki. */
function addEffect(P, effect) {
  for (const [k, v] of Object.entries(effect ?? {})) {
    if (k === 'act' || k === 'oppAct') for (const [t, m] of Object.entries(v)) P[k][t] *= m;
    else if (k === 'konVsAttack') P.konVsAttack = v;
    else if (k.endsWith('Mul') || k === 'yellowPerFoul' || k === 'redPerFoul') P[k] *= v;
    else P[k] = (P[k] ?? 0) + v;
  }
}

export function tacticParams(formation, instructions) {
  const P = {
    pActMul: 1, D: 0, counterVulnMul: formation.counterVuln ?? 1, fatMul: 1, fatMidMul: 1, pos: 0,
    act: { ...NEUTRAL_ACT(), ...formation.act }, oppPos: 0, oppPActMul: 1, oppAct: NEUTRAL_ACT(),
    foulMul: 1, yellowPerFoul: 1, redPerFoul: 1, penMul: 1, oppInjuryMul: 1, brk: 0, setPieceD: 0,
    DvsPOZ: 0, DvsKON: 0, addedTime: 0, yellowPerMin: 0, oppOffsideMul: 1, redMul: 1, konVsAttack: 1,
    brkPerTec: 0, brkPerAerial: 0, W: formation.W ?? 1, timewasting: false,
    // Liczby dawnych porównań tekstu (INSTR_NUM) i parametry instrukcji indywidualnych (spalone, wymuszone karne)
    passVolMul: 1, passAcc: 0, shortPass: 0, pressHigh: 0, tackleHard: 0, tackleSoft: 0, tacFoulMul: 1, offsideMul: 1, penDrawMul: 1,
  };
  addEffect(P, formation.fx); // efekty strukturalne formacji (np. niski blok 4-4-2), docs/taktyka-i-urazy.md
  for (const ins of INSTRUCTIONS) {
    const opt = ins.options.find((o) => o.id === instructions?.[ins.id]) ?? ins.options.find((o) => o.id === ins.default);
    if (opt?.onlyWhenLeading) P.timewasting = true;
    addEffect(P, opt?.effect);
    addEffect(P, INSTR_NUM[ins.id]?.[opt?.id]);
  }
  P.mentality = Number(instructions?.mentality ?? 0);
  P.passing = instructions?.passing ?? 'mixed';
  P.pressing = instructions?.pressing ?? 'mid';
  P.line = instructions?.line ?? 'mid';
  P.tackling = instructions?.tackling ?? 'normal';
  return P;
}

// Liczby z dawnych porównań tekstu (INSTR_NUM): przy zmianie taktyki przełączają się od razu, jak wcześniej teksty
const NOLERP = ['passVolMul', 'passAcc', 'shortPass', 'pressHigh', 'tackleHard', 'tackleSoft', 'tacFoulMul'];

/** Parametry w trakcie przejścia między taktykami; wynik zapisywany do bufora (bez alokacji co minutę). */
function lerpParams(from, to, w, out) {
  if (w >= 1) return to;
  for (const k of Object.keys(to)) {
    const tv = to[k]; const fv = from[k];
    if (typeof tv === 'number' && typeof fv === 'number') out[k] = fv + (tv - fv) * w;
    else if (tv && typeof tv === 'object') {
      const o = out[k] && out[k] !== tv ? out[k] : (out[k] = {});
      for (const t of Object.keys(tv)) o[t] = fv[t] + (tv[t] - fv[t]) * w;
    } else out[k] = tv;
  }
  for (const k of NOLERP) out[k] = to[k];
  return out;
}

// ------------------------------------------------------------ Drużyna
export function buildTeam(side, cfg, rng, ctx, seed = 'mecz') {
  const byId = new Map(cfg.squad.map((p) => [p.id, p]));
  // Instrukcje indywidualne (tylko nadpisania); stare taktyki bez pola: brak instrukcji
  const playerInstr = cleanPlayerInstrMap(cfg.tactics.playerInstr);
  const formation = formationById(cfg.tactics.formation);
  const z = cfg.zStart || {};
  const players = cfg.tactics.xi
    .map((id, i) => {
      if (!byId.get(id)) return null;
      const x = mkPlayer(byId.get(id), formation.slots[i], side, rng, ctx, z[id] ?? 0);
      x.slotIdx = i;
      x.fatK = fatigueTolerance(x.p, seed);
      return x;
    })
    .filter(Boolean);
  const bench = cfg.tactics.bench.map((id) => byId.get(id)).filter(Boolean).map((p) => { const x = mkPlayer(p, null, side, rng, ctx, z[p.id] ?? 0); x.fatK = fatigueTolerance(p, seed); return x; });
  const params = tacticParams(formation, cfg.tactics.instructions);
  return {
    side, club: cfg.club, ai: !!cfg.ai, coach: cfg.coach ?? 'P',
    // Umiejętności trenera w tym meczu (career/coaches.js matchCoach) i asystenta gracza; brak: zachowanie neutralne
    cq: cfg.coachQ ?? null, assistantCq: cfg.assistantQ ?? null,
    tactics: { ...cfg.tactics, playerInstr }, formation, players, bench,
    subsUsed: 0, windowsUsed: 0, windowMinute: null, subsLimit: 5, windowsLimit: 3,
    S: clamp(cfg.cohesion ?? 85, 30, 100), lastTacChange: -99,
    tac: { from: params, to: params, t0: 0, adapt: 0, buf: {} }, P: params, Pbase: params,
    // Instrukcje indywidualne (playerInstr.js): piOn tylko przy nadpisaniach; sCap: sufit spójności w meczu
    // Wszystkie pola od początku (stały kształt obiektu drużyny: szybki dostęp w silniku)
    piOn: Object.keys(playerInstr).length > 0, piVer: 0, piSig: null, piSigArr: null, piShift: null, piBuf: {}, piMemo: { base: null, S: null },
    piReport: {}, sCap: 100, piSeed: String(seed), piCen: 0,
    piCtx: { ctx, teamMorale: cfg.teamMorale ?? null },
    shout: null, shoutReadyAt: 0, shoutUses: {},
    takers: { penalty: cfg.tactics.penalty, freeKick: cfg.tactics.freeKick, corner: cfg.tactics.corner, captain: cfg.tactics.captain },
    zones: { DEF: 10, MID: 10, ATT: 10, GK: 10, SPA: 10, SPD: 10 },
    gkMods: { goalMul: 1 }, threat: 0,
    react: [], injuredOff: [], dropPos: [], dropIdx: [], emptyIdx: null, emptyFor: null, shape: formation.name, concussionUsed: 0,
    knocked: 0, knockPen: 0,
    str0: 0, strDiff: 0, baseInstr: null, plannedSubs: 4, chaseSubs: 0, protectSubs: 0, lastUserTick: -1,
    assistant: false, injuredGk: null, staffYellow: 0, coachBanned: false, penMissed: [], central: 0, avg: null,
    // Historia ustawień widoczna z ławki rywala (coach.js czyta ją z opóźnieniem rozpoznania)
    tacLog: [{ min: -99, formation: cfg.tactics.formation, instr: { ...cfg.tactics.instructions } }],
  };
}

const shareCache = new Map();
/** Suma udziałów ról w strefach dla formacji (stała dla danej formacji). */
export function formationShares(formation) {
  if (!shareCache.has(formation.id)) {
    const sum = { DEF: 0, MID: 0, ATT: 0 };
    for (const s of formation.slots) for (const zn of ['DEF', 'MID', 'ATT']) sum[zn] += ROLE_SHARE[s.pos]?.[zn] ?? 0;
    shareCache.set(formation.id, sum);
  }
  return shareCache.get(formation.id);
}

export const onPitch = (T, minute = 0) => T.players.filter((x) => x.on && !x.sentOff && x.treatedUntil < minute);
export const goalkeeper = (T) => T.players.find((x) => x.on && !x.sentOff && x.slot?.pos === 'BR');

/** Tolerancja zmęczenia zawodnika na mecz (FATIGUE.tol): stała z atrybutów + los z osobnego ziarna (bez zmiany losowań meczu). */
export function fatigueTolerance(p, seed) {
  const T = FATIGUE.tol;
  const pra = a(p, 'PRA'); const wyt = a(p, 'WYT');
  const sd = Math.max(T.sdMin, T.sd0 - T.sdK * ((pra + wyt) / 2 - 10));
  const k = 1 - T.pra * (pra - 10) - T.opa * (a(p, 'OPA') - 10) - T.wyt * (wyt - 10) + new Rng(`zmeczenie:${seed}:${p.id}`).gauss(0, sd);
  return clamp(k, T.min, T.max);
}
/** Kara kondycji do atrybutów: -(0,04 d + 0,008 d²) x tolerancja zawodnika, d = 85 - kondycja (FATIGUE). */
export function condPenalty(x) {
  const d = FATIGUE.penFrom - x.cond;
  return d > 0 ? -(FATIGUE.penLin * d + FATIGUE.penQuad * d * d) * (x.fatK ?? 1) : 0;
}

/** Efektywna wartość zawodnika w strefie: posEff * R + przesunięcia stanu. */
function eff(x, zone) {
  const prof = proficiency(x.p, x.slot.pos, x.slot.side);
  const condPen = condPenalty(x);
  return posEff(prof) * x.R[zone] + x.base + 0.035 * x.Z + condPen;
}

const ATT_LINE = new Set(['NAP', 'SN', 'BP', 'OP']);
const DEF_LINE = new Set(['ŚO', 'BO', 'WB']);
/** Mnożnik szybkości od bieżącej kondycji (FATIGUE.speedLoss za punkt poniżej 85). */
export const condSpeed = (cond) => (cond >= FATIGUE.speedFrom ? 1 : Math.max(0.5, 1 - FATIGUE.speedLoss * (FATIGUE.speedFrom - cond)));
/** Szybkość zawodnika w tej minucie (atrybut SZY razy kondycja). */
export const paceOf = (x) => a(x.p, 'SZY') * condSpeed(x.cond);
/** Ryzyko błędu obrońcy: gra poza pozycją (errorMul) razy zmęczenie. 1 = brak dodatkowego ryzyka. */
export function errFactor(x) {
  const tired = x.cond < FATIGUE.errFrom ? 1 + FATIGUE.errPerPt * (FATIGUE.errFrom - x.cond) : 1;
  return errorMul(proficiency(x.p, x.slot.pos, x.slot.side), true) * tired;
}
const avgOf = (xs, f, dflt) => (xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : dflt);

/** Szybkość linii i ryzyko błędów obrony (co minutę). Używane w core.js: kontry, tempo akcji, błędy, faule. */
function updatePace(T, xs) {
  const team = avgOf(xs.filter((x) => x.slot.pos !== 'BR'), paceOf, 10);
  const att = xs.filter((x) => ATT_LINE.has(x.slot.pos));
  const def = xs.filter((x) => DEF_LINE.has(x.slot.pos) || x.slot.pos === 'DP');
  const raw = (x) => a(x.p, 'SZY');
  const teamRaw = avgOf(xs.filter((x) => x.slot.pos !== 'BR'), raw, 10);
  T.pace = { team, att: avgOf(att, paceOf, team), def: avgOf(def, paceOf, team), attRaw: avgOf(att, raw, teamRaw), defRaw: avgOf(def, raw, teamRaw) };
  T.errF = avgOf(def, errFactor, 1);
  T.defTired = def.length ? def.filter((x) => x.cond < FATIGUE.foulFrom).length / def.length : 0;
}

/** Przeliczenie stref drużyny (co minutę, tanio: 11 zawodników). */
export function updateZones(T, M) {
  const w = T.tac.adapt ? Math.min(1, (M.minute - T.tac.t0) / T.tac.adapt) : 1;
  T.P = T.Pbase = lerpParams(T.tac.from, T.tac.to, w, T.tac.buf);
  // Instrukcje indywidualne: przesunięcie parametrów drużyny o 1/10 na zawodnika (bez instrukcji nic się nie liczy)
  if (T.piOn) {
    refreshPI(T);
    if (T.piShift) T.P = applyShift(T.Pbase, T.piShift, T.piBuf, T.Pbase !== T.tac.buf, T.piMemo);
  }
  const xs = onPitch(T, M.minute);
  const missing = 11 - xs.length;
  const cohesion = (100 - T.S) * 0.015;
  // Kilku lekko kontuzjowanych naraz: partnerzy asekurują i biegają za nich, drużyna traci organizację.
  // Kara od drugiego zawodnika, rośnie szybciej niż liniowo, ograniczona (KNOCK.teamMax < kara za brak zawodnika).
  let knocked = 0;
  for (const x of xs) if (x.knock && !x.knock.aggravated) knocked++;
  T.knocked = knocked;
  T.knockPen = knocked >= 2 ? Math.min(KNOCK.teamMax, KNOCK.team * (knocked - 1) ** KNOCK.teamExp) : 0;
  const zones = { DEF: 0, MID: 0, ATT: 0 };
  for (const x of xs) {
    let share = ROLE_SHARE[x.slot.pos] ?? ROLE_SHARE.ŚP;
    if (x.pi && x.pi.moves) share = shiftedShare(share, x.pi); // Ruch: do przodu, z tyłu, do środka (strzałki)
    for (const zn of ['DEF', 'MID', 'ATT']) if (share[zn]) zones[zn] += share[zn] * eff(x, zn);
  }
  // Strefa = średnia ważona udziałami ról całej formacji (11 slotów), z łagodnym wpływem kształtu
  // formacji (wykładnik 0.15). Brakujący zawodnicy obniżają licznik i dają karę za osłabienie.
  const fs = formationShares(T.formation);
  for (const zn of ['DEF', 'MID', 'ATT']) {
    zones[zn] = (zones[zn] / fs[zn]) * (fs[zn] / ZONE_N[zn]) ** 0.15 - missing * K.shortHanded - cohesion - T.knockPen;
  }
  const gk = goalkeeper(T);
  if (gk && gk.p.pos === 'BR') { zones.GK = eff(gk, 'GK'); T.gkMods = { goalMul: 1 }; }
  else {
    zones.GK = gk ? gk.R.GK + gk.base : 3;
    const mods = goalkeeperSlotModifiers(gk?.p ?? { pos: 'NAP' });
    T.gkMods = { ...mods, goalMul: 1 + (mods.goalMul - 1) * 0.5 }; // reszta kary wynika z niskich atrybutów bramkarskich
  }
  const top = (arr, n, f) => arr.map(f).sort((p, q) => q - p).slice(0, n);
  const field = xs.filter((x) => x.slot.pos !== 'BR');
  const aerial = top(field, 3, (x) => (a(x.p, 'GLO') + a(x.p, 'SKO')) / 2);
  const taker = field.find((x) => x.id === T.takers.corner) ?? field[0];
  zones.SPA = 0.5 * (aerial.reduce((s, v) => s + v, 0) / Math.max(1, aerial.length)) + 0.5 * (taker ? a(taker.p, 'SFR') : 8);
  const defA = top(field, 4, (x) => (a(x.p, 'GLO') + a(x.p, 'SKO') + a(x.p, 'UST')) / 3);
  zones.SPD = 0.7 * (defA.reduce((s, v) => s + v, 0) / Math.max(1, defA.length)) + 0.3 * (gk ? a(gk.p, 'WYJ') : 4) + T.P.setPieceD;
  T.zones = zones;
  T.central = xs.filter((x) => ['DP', 'ŚP', 'OP'].includes(x.slot.pos)).length;
  if (T.piOn) T.central += T.piCen; // strzałki: do środka więcej ludzi w środku pola, szeroko mniej
  updatePace(T, xs);
  T.avg = (k) => xs.reduce((s, x) => s + a(x.p, k), 0) / Math.max(1, xs.length);
}

/** Kondycja zawodników i odbudowa spójności co minutę. */
export function updateCondition(T, M) {
  const P = T.P;
  for (const x of onPitch(T, M.minute)) {
    const role = FATIGUE_ROLE[x.slot.pos] ?? 1;
    const mid = ['DP', 'ŚP', 'OP', 'BP'].includes(x.slot.pos) ? P.fatMidMul : 1;
    const dK = 0.22 * P.fatMul * mid * role * (1.4 - 0.04 * a(x.p, 'WYT')) * (M.ctx.weather?.fat ?? 1) * ((x.p.age ?? 25) >= 31 ? 1.1 : 1)
      * (x.knock && !x.knock.aggravated ? KNOCK.fatigue : 1) * (x.pi?.fat ?? 1);
    x.cond = Math.max(20, x.cond - dK);
    x.Z *= 0.97;
  }
  T.S = Math.min(T.sCap ?? 100, T.S + 1 + 0.05 * ((T.avg?.('LID') ?? 10) - 10));
}

// ------------------------------------------------------------ Ustawienie zawodników na slotach
/** Zawodnicy na boisku łącznie z opatrywanymi (bez wykluczonych i zmienionych). */
export const fieldPlayers = (T) => T.players.filter((x) => x.on && !x.sentOff);

/** Dopasowanie zawodnika do slotu: biegłość na pozycji razy jego siła w strefach tej roli. */
export function slotFit(x, slot) {
  if (slot.pos === 'BR') return x.p.pos === 'BR' ? x.R.GK : 0.6 * x.R.GK;
  const key = (POS_IDX[slot.pos] ?? 5) * 3 + (slot.side === 'L' ? 1 : slot.side === 'P' ? 2 : 0);
  const fit = x.fit ?? (x.fit = new Array(FIT_N).fill(NaN));
  let v = fit[key];
  if (v !== v) { // NaN: jeszcze nie liczone
    const sh = ROLE_SHARE[slot.pos] ?? ROLE_SHARE.ŚP;
    const z = (sh.DEF * x.R.DEF + sh.MID * x.R.MID + sh.ATT * x.R.ATT) / (sh.DEF + sh.MID + sh.ATT);
    v = fit[key] = posEff(proficiency(x.p, slot.pos, slot.side)) * z;
  }
  return v;
}

/** Linie formacji z nazwy (np. 4-2-3-1) i kolejności slotów (bez bramkarza). */
function lineOf(formation) {
  const digits = (/^[\d-]+/.exec(formation.name)?.[0] ?? '').split('-').map(Number).filter(Boolean);
  const out = [];
  digits.forEach((n, li) => { for (let k = 0; k < n; k++) out.push(li); });
  return out; // indeks = numer slotu - 1
}

/** Etykieta kształtu po opuszczeniu slotów, np. 4-4-2 bez napastnika -> 4-4-1. */
export function shapeLabel(formation, dropIdx = []) {
  if (!dropIdx.length) return formation.name;
  const lines = lineOf(formation);
  const digits = (/^[\d-]+/.exec(formation.name)?.[0] ?? '').split('-').map(Number).filter(Boolean);
  for (const i of dropIdx) if (lines[i - 1] != null) digits[lines[i - 1]]--;
  return digits.join('-');
}

/** Sloty formacji (kopie) z pustymi miejscami dla opuszczonych pozycji, gdy drużyna gra w osłabieniu. */
export function shapeSlots(formation, dropPos = [], n = 11) {
  const slots = formation.slots.map((s) => ({ ...s }));
  const dropIdx = [];
  for (const pos of dropPos) {
    if (slots.length - dropIdx.length <= n) break;
    for (let i = slots.length - 1; i > 0; i--) {
      if (slots[i] && slots[i].pos === pos && !dropIdx.includes(i)) { dropIdx.push(i); break; }
    }
  }
  for (const i of dropIdx) {
    const pos = slots[i].pos;
    slots[i] = null;
    const left = slots.filter((s) => s && s.pos === pos);
    if (left.length === 1 && !left[0].side) left[0].x = 50; // samotny napastnik lub środkowy wraca na środek
  }
  return { slots, dropIdx };
}

/**
 * Przypisanie zawodników do slotów: bramkarz zostaje w bramce, reszta zachłannie po najlepszym
 * dopasowaniu, potem poprawa przez zamiany par i przejście na wolny slot. Działa dla 7-11 zawodników.
 */
export function assignSlots(xs, slots) {
  const at = new Map();
  const S = slots.length;
  const taken = new Uint8Array(S);
  let pool = xs;
  const gi = slots.findIndex((s) => s && s.pos === 'BR');
  const keeper = xs.find((x) => x.slot?.pos === 'BR');
  if (gi >= 0 && keeper) { at.set(keeper, gi); taken[gi] = 1; pool = xs.filter((x) => x !== keeper); }
  const field = [];
  for (let i = 0; i < S; i++) if (slots[i] && slots[i].pos !== 'BR') field.push(i);
  const P = pool.length;
  const fit = new Float64Array(P * S);
  for (let k = 0; k < P; k++) for (const i of field) fit[k * S + i] = slotFit(pool[k], slots[i]);
  // Zachłannie: najlepsza para zawodnik-slot spośród wolnych, P razy (P <= 10, bez sortowania)
  const pos = new Int16Array(P).fill(-1);
  for (let round = 0; round < P; round++) {
    let bk = -1; let bi = -1; let bv = -Infinity;
    for (let k = 0; k < P; k++) {
      if (pos[k] >= 0) continue;
      for (const i of field) if (!taken[i] && fit[k * S + i] > bv) { bv = fit[k * S + i]; bk = k; bi = i; }
    }
    if (bk < 0) break;
    pos[bk] = bi; taken[bi] = 1;
  }
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let a2 = 0; a2 < P; a2++) {
      if (pos[a2] < 0) continue;
      for (let b = a2 + 1; b < P; b++) {
        if (pos[b] < 0) continue;
        const ia = pos[a2]; const ib = pos[b];
        if (fit[a2 * S + ib] + fit[b * S + ia] > fit[a2 * S + ia] + fit[b * S + ib] + 1e-9) { pos[a2] = ib; pos[b] = ia; improved = true; }
      }
      for (const i of field) {
        if (taken[i]) continue;
        if (fit[a2 * S + i] > fit[a2 * S + pos[a2]] + 1e-9) { taken[pos[a2]] = 0; pos[a2] = i; taken[i] = 1; improved = true; }
      }
    }
    if (!improved) break;
  }
  for (let k = 0; k < P; k++) if (pos[k] >= 0) at.set(pool[k], pos[k]);
  return at;
}

/** Kopie slotów formacji z pustymi miejscami pod podanymi indeksami (samotny środkowy wraca na środek). */
function slotsWithEmpty(formation, emptyIdx) {
  const slots = formation.slots.map((s) => ({ ...s }));
  for (const i of emptyIdx) slots[i] = null;
  for (const i of emptyIdx) {
    const pos = formation.slots[i].pos;
    const left = slots.filter((s) => s && s.pos === pos);
    if (left.length === 1 && !left[0].side) left[0].x = 50;
  }
  return slots;
}

/** Ustawia zawodników na slotach (Map zawodnik -> indeks) i zapisuje kształt drużyny. */
function placeAll(T, slots, at, formation) {
  for (const [x, i] of at) {
    x.slot = slots[i];
    x.slotIdx = i;
    if (slots[i].pos !== 'BR') x.prevSlot = null;
  }
  const used = new Set(at.values());
  const empty = [];
  for (let i = 0; i < slots.length; i++) if (!used.has(i)) empty.push(i);
  T.dropIdx = empty;
  T.shape = shapeLabel(formation, empty);
}

/** Bezpłatne przestawienie zawodników na sloty bieżącego kształtu (po zmianach personalnych AI). */
export function reslot(T) {
  const xs = fieldPlayers(T);
  let slots;
  if (T.emptyIdx?.length && T.emptyFor === T.formation.id) {
    // Puste miejsca wybrane ręcznie (gracz albo AI): zostają, dopóki liczba zawodników na to pozwala
    slots = slotsWithEmpty(T.formation, T.emptyIdx.slice(0, Math.max(0, T.formation.slots.length - xs.length)));
  } else slots = shapeSlots(T.formation, T.dropPos ?? [], xs.length).slots;
  placeAll(T, slots, assignSlots(xs, slots), T.formation);
}

const isInt = (v) => Number.isInteger(v);

/** Indeks slotu formacji, na którym stoi zawodnik (-1: poza boiskiem). Używa x.slotIdx, gdy jest aktualny. */
export function slotIndex(T, x) {
  if (!x.slot) return -1;
  const fs = T.formation.slots;
  const s = fs[x.slotIdx];
  if (s && s.pos === x.slot.pos && s.side === x.slot.side && s.y === x.slot.y) return x.slotIdx;
  let best = -1; let bd = Infinity;
  for (let i = 0; i < fs.length; i++) {
    if (fs[i].pos !== x.slot.pos || fs[i].side !== x.slot.side) continue;
    const d = Math.abs(fs[i].y - x.slot.y) + Math.abs(fs[i].x - x.slot.x);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/**
 * Plan ustawienia na formacji bez zmiany stanu (podgląd w UI, walidacja, gracz i AI).
 * opts.assign: { [idZawodnika]: indeksSlotu } (dowolny zawodnik na dowolnym slocie, także częściowo),
 * opts.empty: [indeksSlotu] sloty, które zostają puste (dokładnie 11 - liczba zawodników na boisku).
 * Zawodnicy bez przypisania trafiają na pozostałe sloty wg dopasowania (assignSlots).
 * Zwraca { ok: true, formation, slots, at: Map(zawodnik -> indeks), assign: { id: indeks }, empty, shape }
 * albo { ok: false, error } (komunikat po polsku).
 */
export function planShape(T, formationId = T.formation.id, { assign = null, empty = null } = {}) {
  if (!FORMATIONS.some((f) => f.id === formationId)) return { ok: false, error: 'Nieznane ustawienie.' };
  const formation = formationById(formationId);
  const xs = fieldPlayers(T);
  const S = formation.slots.length;
  const gi = formation.slots.findIndex((s) => s.pos === 'BR');
  const need = S - xs.length;
  if (need < 0) return { ok: false, error: 'Za dużo zawodników na boisku.' };
  let forced = null;
  if (empty != null) {
    if (!Array.isArray(empty) || !empty.every(isInt) || new Set(empty).size !== empty.length || empty.some((i) => i < 0 || i >= S)) {
      return { ok: false, error: 'Puste miejsca: podaj różne numery slotów formacji.' };
    }
    if (empty.includes(gi)) return { ok: false, error: 'Bramka nie może zostać pusta.' };
    if (empty.length !== need) {
      return { ok: false, error: `Przy ${xs.length} zawodnikach na boisku puste ${need === 1 ? 'musi zostać dokładnie 1 miejsce' : `muszą zostać dokładnie ${need} miejsca`}.` };
    }
    forced = empty.slice();
  }
  const at = new Map();
  if (assign != null) {
    if (typeof assign !== 'object' || Array.isArray(assign)) return { ok: false, error: 'Nieprawidłowe przypisanie zawodników.' };
    const byId = new Map(xs.map((x) => [String(x.id), x]));
    const taken = new Set();
    for (const [id, i] of Object.entries(assign)) {
      const x = byId.get(String(id));
      if (!x) return { ok: false, error: 'Przypisany zawodnik nie gra teraz na boisku.' };
      if (!isInt(i) || i < 0 || i >= S) return { ok: false, error: 'Nieprawidłowy numer slotu.' };
      if (taken.has(i)) return { ok: false, error: 'Dwóch zawodników na jednym miejscu.' };
      if (forced?.includes(i)) return { ok: false, error: 'Zawodnik przypisany do miejsca, które ma zostać puste.' };
      taken.add(i); at.set(x, i);
    }
    if (!forced && at.size === xs.length) forced = [...Array(S).keys()].filter((i) => !taken.has(i));
  }
  const slots = slotsWithEmpty(formation, forced ?? []);
  const rest = xs.filter((x) => !at.has(x));
  if (rest.length) {
    const free = slots.map((s, i) => (s && ![...at.values()].includes(i) ? s : null));
    for (const [x, i] of assignSlots(rest, free)) at.set(x, i);
  }
  if (![...at.values()].includes(gi)) return { ok: false, error: 'Ktoś musi stanąć w bramce.' };
  if (at.size !== xs.length) return { ok: false, error: 'Nie wszyscy zawodnicy mają miejsce na boisku.' };
  const used = new Set(at.values());
  const emptyOut = [...Array(S).keys()].filter((i) => !used.has(i));
  return {
    ok: true, formation, slots, at, empty: emptyOut, shape: shapeLabel(formation, emptyOut),
    assign: Object.fromEntries([...at].map(([x, i]) => [x.id, i])),
  };
}

/** Walidacja zmiany taktyki: komunikat błędu albo null (formacja, puste miejsca, przypisanie zawodników). */
export function validateTacticPatch(T, patch = {}) {
  if (patch.formation != null && !FORMATIONS.some((f) => f.id === patch.formation)) return 'Nieznane ustawienie.';
  if (patch.playerInstr != null) {
    const e = validatePlayerInstr(T, patch.playerInstr);
    if (e) return e;
  }
  if (patch.assign == null && patch.empty == null) return null;
  const r = planShape(T, patch.formation ?? T.formation.id, { assign: patch.assign ?? null, empty: patch.empty ?? null });
  return r.ok ? null : r.error;
}

/**
 * Zmiana taktyki w trakcie meczu z bezwładnością i kosztem spójności (4.3).
 * patch: { formation?, instructions?, drop?: ['NAP', ...] pozycje zostawiane puste przy grze w osłabieniu,
 *          assign?: { [id]: indeksSlotu } dowolny zawodnik na dowolnym slocie, empty?: [indeksSlotu] puste miejsca }
 * Zwraca { ok, cost, adapt } albo { ok: false, error } (nic się nie zmienia).
 */
export function applyTacticChange(T, M, patch) {
  const err = validateTacticPatch(T, patch);
  if (err) return { ok: false, error: err, cost: 0, adapt: 0 };
  const manual = patch.assign != null || patch.empty != null;
  const plan = manual ? planShape(T, patch.formation ?? T.formation.id, { assign: patch.assign ?? null, empty: patch.empty ?? null }) : null;
  const newTactics = { ...T.tactics, ...patch, instructions: { ...T.tactics.instructions, ...(patch.instructions || {}) } };
  delete newTactics.drop; delete newTactics.assign; delete newTactics.empty;
  // Instrukcje indywidualne: scalenie z dotychczasowymi (zawodnik null albo klucz 0/null: jak drużyna)
  const pim = patch.playerInstr != null ? mergePlayerInstr(T.tactics.playerInstr, patch.playerInstr) : null;
  newTactics.playerInstr = pim ? pim.map : (T.tactics.playerInstr ?? {});
  const formation = formationById(newTactics.formation);
  const atBreak = M.phase === 'break' || M.minute === 0;
  let cost = 0;
  const dropChanged = patch.drop && patch.drop.join() !== (T.dropPos ?? []).join();
  const moved = plan && [...plan.at].some(([x, i]) => slotIndex(T, x) !== i);
  if (newTactics.formation !== T.tactics.formation) cost += formation.family && formation.family === T.formation.family ? 5 : 10; // w rodzinie 4-4-2 te same role
  else if (dropChanged || moved) cost += 5; // przesunięcie zawodników w tej samej formacji
  for (const k of Object.keys(patch.instructions || {})) if (patch.instructions[k] !== T.tactics.instructions?.[k]) cost += 5;
  if (pim?.changed) cost += Math.min(PI.changeCostMax, PI.changeCost * pim.changed); // ok. 2 za zawodnika, najwyżej 6
  if (M.minute - T.lastTacChange < 10) cost *= 2;
  const adapt = clamp(6 - 0.2 * ((T.avg?.('DEC') ?? 10) - 10), 3, 8);
  const cur = T.Pbase ?? T.P; // parametry drużyny bez przesunięcia od instrukcji indywidualnych
  const from = cur === T.tac.buf ? { ...cur, act: { ...cur.act }, oppAct: { ...cur.oppAct } } : cur; // kopia, bo bufor się zmienia
  T.tac = { from, to: tacticParams(formation, newTactics.instructions), t0: M.minute, adapt: atBreak ? 0 : adapt, buf: {} };
  if (!atBreak && cost) { T.S = Math.max(30, T.S - cost); T.lastTacChange = M.minute; }
  T.formation = formation;
  T.tactics = newTactics;
  // Przeliczenie efektów instrukcji indywidualnych (z zapisanych jakości, bez nowych losowań) od następnej minuty
  T.piVer = (T.piVer ?? 0) + 1;
  T.piOn = Object.keys(newTactics.playerInstr).length > 0;
  if (!T.piOn) clearPI(T);
  if (plan) {
    // Ręczne ustawienie: dokładnie te sloty puste, zawodnicy tam, gdzie wskazano
    T.emptyIdx = plan.empty.slice(); T.emptyFor = formation.id;
    T.dropPos = plan.empty.map((i) => formation.slots[i].pos);
    placeAll(T, plan.slots, plan.at, formation);
  } else {
    if (patch.formation || patch.drop) { T.emptyIdx = null; T.emptyFor = null; }
    if (patch.drop) T.dropPos = patch.drop.slice();
    if (patch.formation || patch.drop) reslot(T);
  }
  T.tacLog?.push({ min: M.minute, formation: newTactics.formation, instr: newTactics.instructions });
  return { ok: true, cost, adapt: atBreak ? 0 : adapt };
}
