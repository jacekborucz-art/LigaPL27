// Drużyny w trakcie meczu: zawodnicy na boisku i ławce, strefy siły (6.1 a),
// parametry taktyki z danych formacji i instrukcji (z bezwładnością 4.3), kondycja i spójność.

import { formationById } from '../../data/formations.js';
import { INSTRUCTIONS } from '../../data/instructions.js';
import { proficiency, posEff, goalkeeperSlotModifiers } from '../positions.js';
import { evaluate } from '../modifiers.js';
import { clamp } from '../../core/rng.js';
import { K, ROLE_SHARE, ZONE_N, FATIGUE_ROLE } from './constants.js';

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

function mkPlayer(p, slot, side, rng, ctx, Z = 0) {
  const dayForm = rng.gauss(0, Math.max(0.2, 0.9 - 0.035 * (p.hidden?.KON ?? 10)));
  const waz = ctx.rank >= 2 ? 0.04 * ((p.hidden?.WAZ ?? 10) - 10) : 0;
  return {
    id: p.id, p, slot, side, R: zoneRatings(p), base: evaluate('player', p, { inMatch: true }).total + dayForm + waz,
    cond: p.fresh ?? 95, on: !!slot, sentOff: false, subbedOff: false, injury: null, treatedUntil: -1,
    Z, yc: 0, minOn: slot ? 0 : null, minOff: null,
    ev: 0, g: 0, ast: 0, sh: 0, sot: 0, kp: 0, tk: 0, saves: 0, fouls: 0, offs: 0,
    fit: null, prevSlot: null, bookChecked: false,
  };
}

// Pamięć dopasowania zawodnika do slotu: indeks pozycji * 3 + strona (brak, L, P)
const POS_IDX = { BR: 0, ŚO: 1, BO: 2, WB: 3, DP: 4, ŚP: 5, OP: 6, SP: 7, SN: 8, NAP: 9 };
const FIT_N = 30;

// ------------------------------------------------------------ Parametry taktyki
const NEUTRAL_ACT = () => ({ POZ: 1, SKR: 1, KON: 1, DYS: 1 });

/** Łączy efekty formacji i wybranych instrukcji w jeden zestaw liczb dla silnika. */
export function tacticParams(formation, instructions) {
  const P = {
    pActMul: 1, D: 0, counterVulnMul: formation.counterVuln ?? 1, fatMul: 1, fatMidMul: 1, pos: 0,
    act: { ...NEUTRAL_ACT(), ...formation.act }, oppPos: 0, oppPActMul: 1, oppAct: NEUTRAL_ACT(),
    foulMul: 1, yellowPerFoul: 1, redPerFoul: 1, penMul: 1, oppInjuryMul: 1, brk: 0, setPieceD: 0,
    DvsPOZ: 0, DvsKON: 0, addedTime: 0, yellowPerMin: 0, oppOffsideMul: 1, redMul: 1, konVsAttack: 1,
    brkPerTec: 0, brkPerAerial: 0, W: formation.W ?? 1, timewasting: false,
  };
  for (const ins of INSTRUCTIONS) {
    const opt = ins.options.find((o) => o.id === instructions?.[ins.id]) ?? ins.options.find((o) => o.id === ins.default);
    if (opt?.onlyWhenLeading) P.timewasting = true;
    for (const [k, v] of Object.entries(opt?.effect ?? {})) {
      if (k === 'act' || k === 'oppAct') for (const [t, m] of Object.entries(v)) P[k][t] *= m;
      else if (k === 'konVsAttack') P.konVsAttack = v;
      else if (k.endsWith('Mul') || k === 'yellowPerFoul' || k === 'redPerFoul') P[k] *= v;
      else P[k] = (P[k] ?? 0) + v;
    }
  }
  P.mentality = Number(instructions?.mentality ?? 0);
  P.passing = instructions?.passing ?? 'mixed';
  P.pressing = instructions?.pressing ?? 'mid';
  P.line = instructions?.line ?? 'mid';
  P.tackling = instructions?.tackling ?? 'normal';
  return P;
}

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
  return out;
}

// ------------------------------------------------------------ Drużyna
export function buildTeam(side, cfg, rng, ctx) {
  const byId = new Map(cfg.squad.map((p) => [p.id, p]));
  const formation = formationById(cfg.tactics.formation);
  const z = cfg.zStart || {};
  const players = cfg.tactics.xi
    .map((id, i) => (byId.get(id) ? mkPlayer(byId.get(id), formation.slots[i], side, rng, ctx, z[id] ?? 0) : null))
    .filter(Boolean);
  const bench = cfg.tactics.bench.map((id) => byId.get(id)).filter(Boolean).map((p) => mkPlayer(p, null, side, rng, ctx, z[p.id] ?? 0));
  const params = tacticParams(formation, cfg.tactics.instructions);
  return {
    side, club: cfg.club, ai: !!cfg.ai, coach: cfg.coach ?? 'P',
    tactics: { ...cfg.tactics }, formation, players, bench,
    subsUsed: 0, windowsUsed: 0, windowMinute: null, subsLimit: 5, windowsLimit: 3,
    S: clamp(cfg.cohesion ?? 85, 30, 100), lastTacChange: -99,
    tac: { from: params, to: params, t0: 0, adapt: 0, buf: {} }, P: params,
    shout: null, shoutReadyAt: 0, shoutUses: {},
    takers: { penalty: cfg.tactics.penalty, freeKick: cfg.tactics.freeKick, corner: cfg.tactics.corner, captain: cfg.tactics.captain },
    zones: { DEF: 10, MID: 10, ATT: 10, GK: 10, SPA: 10, SPD: 10 },
    gkMods: { goalMul: 1 }, threat: 0,
    react: [], injuredOff: [], dropPos: [], dropIdx: [], shape: formation.name, concussionUsed: 0,
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

/** Efektywna wartość zawodnika w strefie: posEff * R + przesunięcia stanu. */
function eff(x, zone) {
  const prof = proficiency(x.p, x.slot.pos, x.slot.side);
  const condPen = x.cond < 85 ? -0.04 * (85 - x.cond) : 0;
  return posEff(prof) * x.R[zone] + x.base + 0.035 * x.Z + condPen;
}

/** Przeliczenie stref drużyny (co minutę, tanio: 11 zawodników). */
export function updateZones(T, M) {
  const w = T.tac.adapt ? Math.min(1, (M.minute - T.tac.t0) / T.tac.adapt) : 1;
  T.P = lerpParams(T.tac.from, T.tac.to, w, T.tac.buf);
  const xs = onPitch(T, M.minute);
  const missing = 11 - xs.length;
  const cohesion = (100 - T.S) * 0.015;
  const zones = { DEF: 0, MID: 0, ATT: 0 };
  for (const x of xs) {
    const share = ROLE_SHARE[x.slot.pos] ?? ROLE_SHARE.ŚP;
    for (const zn of ['DEF', 'MID', 'ATT']) if (share[zn]) zones[zn] += share[zn] * eff(x, zn);
  }
  // Strefa = średnia ważona udziałami ról całej formacji (11 slotów), z łagodnym wpływem kształtu
  // formacji (wykładnik 0.15). Brakujący zawodnicy obniżają licznik i dają karę za osłabienie.
  const fs = formationShares(T.formation);
  for (const zn of ['DEF', 'MID', 'ATT']) {
    zones[zn] = (zones[zn] / fs[zn]) * (fs[zn] / ZONE_N[zn]) ** 0.15 - missing * K.shortHanded - cohesion;
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
  T.avg = (k) => xs.reduce((s, x) => s + a(x.p, k), 0) / Math.max(1, xs.length);
}

/** Kondycja zawodników i odbudowa spójności co minutę. */
export function updateCondition(T, M) {
  const P = T.P;
  for (const x of onPitch(T, M.minute)) {
    const role = FATIGUE_ROLE[x.slot.pos] ?? 1;
    const mid = ['DP', 'ŚP', 'OP', 'SP'].includes(x.slot.pos) ? P.fatMidMul : 1;
    const dK = 0.22 * P.fatMul * mid * role * (1.4 - 0.04 * a(x.p, 'WYT')) * (M.ctx.weather?.fat ?? 1) * ((x.p.age ?? 25) >= 31 ? 1.1 : 1);
    x.cond = Math.max(20, x.cond - dK);
    x.Z *= 0.97;
  }
  T.S = Math.min(100, T.S + 1 + 0.05 * ((T.avg?.('LID') ?? 10) - 10));
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

/** Bezpłatne przestawienie zawodników na sloty bieżącego kształtu (po zmianach personalnych AI). */
export function reslot(T) {
  const xs = fieldPlayers(T);
  const { slots, dropIdx } = shapeSlots(T.formation, T.dropPos ?? [], xs.length);
  const at = assignSlots(xs, slots);
  for (const [x, i] of at) x.slot = slots[i];
  T.dropIdx = dropIdx;
  T.shape = shapeLabel(T.formation, dropIdx);
}

/**
 * Zmiana taktyki w trakcie meczu z bezwładnością i kosztem spójności (4.3).
 * patch: { formation?, instructions?, drop?: ['NAP', ...] pozycje zostawiane puste przy grze w osłabieniu }
 */
export function applyTacticChange(T, M, patch) {
  const newTactics = { ...T.tactics, ...patch, instructions: { ...T.tactics.instructions, ...(patch.instructions || {}) } };
  delete newTactics.drop;
  const formation = formationById(newTactics.formation);
  const atBreak = M.phase === 'break' || M.minute === 0;
  let cost = 0;
  const dropChanged = patch.drop && patch.drop.join() !== (T.dropPos ?? []).join();
  if (newTactics.formation !== T.tactics.formation) cost += 10;
  else if (dropChanged) cost += 5; // przesunięcie zawodników w tej samej formacji
  for (const k of Object.keys(patch.instructions || {})) if (patch.instructions[k] !== T.tactics.instructions?.[k]) cost += 5;
  if (M.minute - T.lastTacChange < 10) cost *= 2;
  const adapt = clamp(6 - 0.2 * ((T.avg?.('DEC') ?? 10) - 10), 3, 8);
  const from = T.P === T.tac.buf ? { ...T.P, act: { ...T.P.act }, oppAct: { ...T.P.oppAct } } : T.P; // kopia, bo bufor się zmienia
  T.tac = { from, to: tacticParams(formation, newTactics.instructions), t0: M.minute, adapt: atBreak ? 0 : adapt, buf: {} };
  if (!atBreak && cost) { T.S = Math.max(30, T.S - cost); T.lastTacChange = M.minute; }
  T.formation = formation;
  T.tactics = newTactics;
  if (patch.drop) T.dropPos = patch.drop.slice();
  if (patch.formation || patch.drop) reslot(T);
  T.tacLog?.push({ min: M.minute, formation: newTactics.formation, instr: newTactics.instructions });
  return { cost, adapt: atBreak ? 0 : adapt };
}
