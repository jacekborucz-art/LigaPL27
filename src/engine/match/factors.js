// Czyste funkcje czynników meczu (bez stanu, bez losowań), z których korzystają wpisy potoku
// (src/engine/pipeline.js) i silnik. Wzory przeniesione bez zmian z teams.js i core.js (krok 1 docs/walka-taktyk.md).

import { clamp, Rng } from '../../core/rng.js';
import { K, FATIGUE, SAT } from './constants.js';

const a = (p, k) => p.attr?.[k] ?? p.ovr ?? 10;

/** Oceny zawodnika w strefach z atrybutów (stałe na cały mecz). Etap attr. */
export function zoneRatings(p) {
  return {
    DEF: (3 * a(p, 'ODB') + 3 * a(p, 'UST') + 1.5 * a(p, 'GLO') + a(p, 'SIL') + a(p, 'SZY') + a(p, 'DEC') + 0.5 * a(p, 'OPA') + 0.5 * a(p, 'SKO') + 0.5 * a(p, 'AGR')) / 12,
    MID: (3 * a(p, 'POD') + 2 * a(p, 'DEC') + 2 * a(p, 'TEC') + 1.5 * a(p, 'WIZ') + 1.5 * a(p, 'PRA') + a(p, 'WYT') + a(p, 'ODB') + 0.5 * a(p, 'UST')) / 12.5,
    ATT: (3 * a(p, 'WYK') + 2 * a(p, 'RUC') + 1.5 * a(p, 'TEC') + 1.5 * a(p, 'DRY') + 1.5 * a(p, 'SZY') + a(p, 'OPA') + a(p, 'GLO') + 0.5 * a(p, 'DYS') + 0.5 * a(p, 'ZWI') + 0.5 * a(p, 'DOS')) / 13,
    GK: (3 * a(p, 'REF') + 2 * a(p, 'UST') + 1.5 * a(p, 'CHW') + 1.5 * a(p, 'JNJ') + a(p, 'WYJ') + a(p, 'OPA')) / 10,
  };
}

/** Kara kondycji do atrybutów: -(0,04 d + 0,008 d²) x tolerancja zawodnika, d = 85 - kondycja (FATIGUE). Etap live. */
export function condPenalty(x) {
  const d = FATIGUE.penFrom - x.cond;
  return d > 0 ? -(FATIGUE.penLin * d + FATIGUE.penQuad * d * d) * (x.fatK ?? 1) : 0;
}

/** Wagi rodzajów akcji ataku A wobec obrony D (plan A, plan D, podatność na kontry). Etap matchup. Klucze jak K.typeW. */
export function typeWeights(A, D) {
  const w = {};
  for (const t of Object.keys(K.typeW)) {
    let v = K.typeW[t] * (A.P.act[t] ?? 1) * (D.P.oppAct[t] ?? 1);
    if (t === 'KON') {
      v *= D.P.counterVulnMul;
      if (A.P.konVsAttack > 1 && (D.P.mentality >= 1 || D.P.line === 'high')) v *= A.P.konVsAttack / 1.2;
    }
    w[t] = v;
  }
  return w;
}

/** Kontry taktyczne (4.2): bonus do przełamania akcji danego rodzaju, maks. +-0.5. Etap matchup. */
export function counterBonus(A, D, type) {
  let b = 0;
  const tecA = A.avg('TEC');
  // Liczby z INSTR_NUM: 1 = cała drużyna (wysoki pressing, krótkie podania, twardy lub łagodny odbiór), ułamek od zawodników
  if (D.P.pressHigh && A.P.shortPass) b += D.P.pressHigh * A.P.shortPass * (tecA >= 12 ? 0.35 * Math.min(1, (tecA - 12) / 3) : -0.3 * Math.min(1, (12 - tecA) / 3));
  if (type === 'SKR') b += 0.25 * (A.P.W - D.P.W);
  if (type === 'KON' && A.P.konVsAttack > 1 && (D.P.line === 'high' || D.P.mentality >= 1)) {
    b += 0.4 * clamp(((A.pace?.team ?? A.avg('SZY')) - (D.pace?.team ?? D.avg('SZY')) + 3) / 6, 0, 1); // szybkość z kondycją
  }
  if (D.P.tackleHard && A.avg('DRY') >= 13) b -= 0.2 * D.P.tackleHard;
  if (D.P.tackleSoft) b += 0.2 * D.P.tackleSoft * clamp((A.avg('DRY') - 11) / 4, 0, 1);
  if (type === 'POZ' && D.P.DvsPOZ) b -= D.P.DvsPOZ;
  if (type === 'KON' && D.P.DvsKON) b -= D.P.DvsKON;
  if (A.P.brkPerTec) b += A.P.brkPerTec * (tecA - 11);
  if (A.P.brkPerAerial) b += A.P.brkPerAerial * ((A.avg('GLO') + A.avg('SIL')) / 2 - 11);
  return clamp(b, -0.5, 0.5);
}

export const onPitch = (T, minute = 0) => T.players.filter((x) => x.on && !x.sentOff && x.treatedUntil < minute);

/** Skala 1-20 na 0-1. */
const t01 = (v) => clamp(((v ?? 10) - 1) / 19, 0, 1);
/**
 * Głód goli zawodnika (SAT.w) bez ego: pracowitość, ambicja, profesjonalizm, przywództwo, regularność (0-1 względem wag).
 * Cechy charakteru z p.traits (career/personality.js), bez nich ukryte atrybuty albo środek skali.
 */
export function hungerOf(p) {
  const W = SAT.w; const tr = p.traits ?? {}; const h = p.hidden ?? {};
  return W.PRA * t01(a(p, 'PRA')) + W.amb * t01(tr.ambition) + W.prf * t01(tr.professionalism ?? h.PRF) + W.LID * t01(a(p, 'LID')) + W.KON * t01(h.KON);
}
/**
 * Głód goli drużyny H (0-1) w danej minucie: zawodnicy na boisku z wagą pozycji, ego tylko u ofensywnych, kapitan (E),
 * los na mecz (T.satLuck), szum co 15 min (osobne ziarno), okrzyk z SAT. Wynik w pamięci na minutę. Etap team (hunger).
 */
export function teamHunger(T, M) {
  if (T.satMin === M.minute) return T.satH;
  const xs = onPitch(T, M.minute);
  let sw = 0; let sh = 0;
  for (const x of xs) {
    const w = SAT.pos[x.slot.pos] ?? 1;
    const ego = SAT.egoPos.includes(x.slot.pos) ? t01(x.p.traits?.ego) : 0.5;
    sw += w; sh += w * ((x.hung ?? hungerOf(x.p)) + SAT.w.ego * ego);
  }
  let H = sw ? sh / sw : 0.5;
  H += SAT.cap * (T.capE ?? 0); // kapitan pilnuje koncentracji (docs/kapitan.md), zamiast premii za LID najlepszego lidera
  const blk = Math.floor(M.minute / SAT.noiseEvery);
  if (T.satBlk !== blk) { T.satBlk = blk; T.satNoise = clamp(new Rng(`glod:${T.satSeed}:${blk}`).gauss(0, SAT.noise), -SAT.noise * 2, SAT.noise * 2); }
  H += (T.satLuck ?? 0) + (T.satNoise ?? 0);
  if (T.shout?.hunger && M.minute < T.shout.until) H += T.shout.hunger;
  T.satMin = M.minute; T.satH = clamp(H, 0, 1);
  return T.satH;
}
