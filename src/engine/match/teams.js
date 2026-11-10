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
  };
}

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

function lerpParams(from, to, w) {
  if (w >= 1) return to;
  const out = { ...to };
  for (const k of Object.keys(to)) {
    if (typeof to[k] === 'number' && typeof from[k] === 'number') out[k] = from[k] + (to[k] - from[k]) * w;
    else if (to[k] && typeof to[k] === 'object') {
      out[k] = {};
      for (const t of Object.keys(to[k])) out[k][t] = from[k][t] + (to[k][t] - from[k][t]) * w;
    }
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
    tac: { from: params, to: params, t0: 0, adapt: 0 }, P: params,
    shout: null, shoutReadyAt: 0, shoutUses: {},
    takers: { penalty: cfg.tactics.penalty, freeKick: cfg.tactics.freeKick, corner: cfg.tactics.corner, captain: cfg.tactics.captain },
    zones: { DEF: 10, MID: 10, ATT: 10, GK: 10, SPA: 10, SPD: 10 },
    gkMods: { goalMul: 1 }, threat: 0,
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
  T.P = lerpParams(T.tac.from, T.tac.to, w);
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

/** Zmiana taktyki w trakcie meczu z bezwładnością i kosztem spójności (4.3). */
export function applyTacticChange(T, M, patch) {
  const newTactics = { ...T.tactics, ...patch, instructions: { ...T.tactics.instructions, ...(patch.instructions || {}) } };
  const formation = formationById(newTactics.formation);
  const atBreak = M.phase === 'break' || M.minute === 0;
  let cost = 0;
  if (newTactics.formation !== T.tactics.formation) cost += 10;
  for (const k of Object.keys(patch.instructions || {})) if (patch.instructions[k] !== T.tactics.instructions?.[k]) cost += 5;
  if (M.minute - T.lastTacChange < 10) cost *= 2;
  const adapt = clamp(6 - 0.2 * ((T.avg?.('DEC') ?? 10) - 10), 3, 8);
  T.tac = { from: T.P, to: tacticParams(formation, newTactics.instructions), t0: M.minute, adapt: atBreak ? 0 : adapt };
  if (!atBreak) { T.S = Math.max(30, T.S - cost); T.lastTacChange = M.minute; }
  if (formation.id !== T.formation.id) {
    // Zawodnicy zostają, sloty nowej formacji przypisane po kolei według pozycji
    const xs = onPitch(T, M.minute);
    const slots = formation.slots.slice();
    for (const x of xs) {
      let best = 0; let bestV = -1;
      slots.forEach((s, i) => { if (!s) return; const v = proficiency(x.p, s.pos, s.side) + (x.slot.pos === 'BR' && s.pos === 'BR' ? 1000 : 0); if (v > bestV) { bestV = v; best = i; } });
      x.slot = slots[best]; slots[best] = null;
    }
  }
  T.formation = formation;
  T.tactics = newTactics;
  return { cost, adapt: atBreak ? 0 : adapt };
}
