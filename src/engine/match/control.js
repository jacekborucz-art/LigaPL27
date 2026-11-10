// Sterowanie meczem: zmiany (5 w 3 oknach, +1 i +1 okno w dogrywce, przerwa nie zużywa okna),
// zmiany taktyki (bezwładność), okrzyki (cooldown 8 min) i AI trenera (ekspert 7.2).
// Gracz i AI korzystają z tych samych funkcji, więc reguły obowiązują obie strony.

import { emit, ensureGoalkeeper } from './core.js';
import { onPitch, applyTacticChange, goalkeeper } from './teams.js';
import { proficiency } from '../positions.js';
import { SHOUTS, SHOUT_COOLDOWN, SHOUT_DURATION } from './constants.js';

const last = (x) => x.p.last ?? x.p.name;

/** Czy zmiana jest teraz możliwa; zwraca komunikat błędu albo null. */
export function canSubstitute(M, side, outId, inId) {
  const T = M.teams[side];
  if (M.ended) return 'Mecz się zakończył.';
  if (T.subsUsed >= T.subsLimit) return `Wykorzystano wszystkie zmiany (${T.subsLimit}).`;
  const out = T.players.find((x) => x.id === outId && (x.on || x.injury) && !x.sentOff && !x.subbedOff);
  if (!out) return 'Tego zawodnika nie ma na boisku.';
  const inc = T.bench.find((x) => x.id === inId);
  if (!inc) return 'Tego zawodnika nie ma na ławce.';
  const breakTime = M.phase === 'break';
  const sameWindow = T.windowMinute === M.tick;
  if (!breakTime && !sameWindow && T.windowsUsed >= T.windowsLimit) return `Wykorzystano wszystkie okna zmian (${T.windowsLimit}).`;
  return null;
}

export function substitute(M, side, outId, inId, reason = '') {
  const err = canSubstitute(M, side, outId, inId);
  if (err) return { ok: false, error: err };
  const T = M.teams[side];
  const out = T.players.find((x) => x.id === outId);
  const inc = T.bench.find((x) => x.id === inId);
  if (M.phase !== 'break' && T.windowMinute !== M.tick) { T.windowsUsed++; T.windowMinute = M.tick; M.halfCounts.windows++; }
  T.subsUsed++;
  out.on = false; out.subbedOff = true; out.minOff = M.minute;
  inc.slot = out.slot; inc.on = true; inc.minOn = M.minute;
  T.bench = T.bench.filter((x) => x !== inc);
  T.players.push(inc);
  if (out.slot?.pos === 'BR' || !goalkeeper(T)) ensureGoalkeeper(M, T);
  emit(M, 'sub', side, inc, { outId: out.id, text: `Zmiana: wchodzi ${last(inc)}, schodzi ${last(out)}${reason ? ` (${reason})` : ''}.` });
  return { ok: true };
}

export function changeTactics(M, side, patch) {
  const T = M.teams[side];
  const r = applyTacticChange(T, M, patch);
  emit(M, 'tactic', side, null, { patch, text: patch.formation ? `Zmiana ustawienia na ${T.formation.name}.` : 'Zmiana instrukcji taktycznych.' });
  return r;
}

export function canShout(M, side, id) {
  const T = M.teams[side];
  const s = SHOUTS[id];
  if (!s) return 'Nieznany okrzyk.';
  if (M.minute < T.shoutReadyAt) return `Kolejny okrzyk możliwy za ${T.shoutReadyAt - M.minute} min.`;
  if (s.maxUses && (T.shoutUses[id] ?? 0) >= s.maxUses) return 'Ten okrzyk już nie zadziała w tym meczu.';
  return null;
}

export function shout(M, side, id) {
  const err = canShout(M, side, id);
  if (err) return { ok: false, error: err };
  const T = M.teams[side];
  const s = SHOUTS[id];
  T.shoutUses[id] = (T.shoutUses[id] ?? 0) + 1;
  T.shoutReadyAt = M.minute + SHOUT_COOLDOWN;
  T.shout = { ...s, id, until: M.minute + SHOUT_DURATION };
  for (const x of onPitch(T, M.minute)) {
    if (s.Z) x.Z += s.Z;
    if (s.calm && x.Z > 4) x.Z -= 2;
  }
  emit(M, 'shout', side, null, { shout: id, text: `Trener z linii bocznej: „${s.label}”` });
  return { ok: true };
}

// ------------------------------------------------------------ AI trenera (7.2)
const CHECKPOINTS = new Set([46, 55, 60, 65, 70, 75, 80, 85, 88, 95, 105, 115]);
const ATTACK_POS = new Set(['NAP', 'SN', 'OP']);

function bestSub(T, M, slotPos, prefer = null) {
  const cands = T.bench.filter((x) => !x.injury);
  if (!cands.length) return null;
  const score = (x) => x.p.ovr * (proficiency(x.p, slotPos) / 100) + (prefer && prefer.has(x.p.pos) ? 1 : 0);
  return cands.slice().sort((a, b) => score(b) - score(a))[0];
}

/** Decyzje AI w danej minucie. Zmienia tylko swoją drużynę i tylko zgodnie z regułami. */
export function aiDecide(M, side, { assistant = false } = {}) {
  const T = M.teams[side];
  const rng = M.rng;
  const diff = M.score[side] - M.score[1 - side];
  const xs = onPitch(T, M.minute);
  const late = (base) => base + (T.coach === 'O' ? -10 : T.coach === 'S' ? 5 : 0);

  // Kontuzja niegrywalna: zmiana natychmiast
  for (const x of T.players.filter((y) => y.injury && !y.injury.playable && !y.subbedOff && !y.sentOff && !y.handled)) {
    const sub = bestSub(T, M, x.slot.pos);
    x.handled = true;
    if (sub) substitute(M, side, x.id, sub.id, 'kontuzja');
  }
  const checkpoint = CHECKPOINTS.has(M.minute) || M.phase === 'break';
  if (!checkpoint) return;

  // Zmęczenie i ryzykowne kartki
  const subsWanted = [];
  for (const x of xs) {
    if (x.slot.pos === 'BR') continue;
    if (x.cond < 65 && M.minute >= 55) subsWanted.push([x, 'zmęczenie', 0.8]);
    else if (x.yc && ((x.p.attr?.AGR ?? 10) >= 13 || (x.p.hidden?.TMP ?? 10) >= 14) && M.minute >= 55) subsWanted.push([x, 'kartka', 0.5]);
    else if (x.injury?.playable && M.minute >= 46) subsWanted.push([x, 'uraz', 0.7]);
  }
  // Stan meczu
  if (diff < 0 && M.minute >= late(65)) {
    if (T.tactics.instructions.mentality < 1 && rng.chance(0.75) && M.minute - T.lastTacChange >= 10) changeTactics(M, side, { instructions: { mentality: diff <= -2 ? '2' : '1' } });
    const def = xs.filter((x) => ['DP', 'ŚP', 'ŚO'].includes(x.slot.pos)).sort((a, b) => a.cond - b.cond)[0];
    if (def && rng.chance(diff <= -2 ? 0.85 : 0.6)) subsWanted.push([def, 'ofensywna zmiana', 1, ATTACK_POS]);
  }
  if (diff > 0 && M.minute >= late(75)) {
    if (T.tactics.instructions.mentality > -1 && rng.chance(0.7) && M.minute - T.lastTacChange >= 10) changeTactics(M, side, { instructions: { mentality: '-1' } });
    if (M.minute >= 82 && T.tactics.instructions.timewasting !== 'on' && rng.chance(T.coach === 'O' ? 0.3 : 0.6)) changeTactics(M, side, { instructions: { timewasting: 'on' } });
    const att = xs.filter((x) => ATTACK_POS.has(x.slot.pos)).sort((a, b) => a.cond - b.cond)[0];
    if (att && rng.chance(0.5)) subsWanted.push([att, 'wzmocnienie obrony', 1, new Set(['DP', 'ŚO'])]);
  }
  if (diff === 0 && M.minute >= 70 && T.tactics.instructions.mentality === '0' && rng.chance(0.4) && M.minute - T.lastTacChange >= 10) {
    changeTactics(M, side, { instructions: { mentality: (M.teams[side].zones.ATT > M.teams[1 - side].zones.DEF) ? '1' : '-1' } });
  }
  // Plan zmian trenera (3-5 na mecz, średnio ok. 4): zmiany rotacyjne w typowych momentach
  if (T.plannedSubs == null) T.plannedSubs = rng.weighted([3, 4, 5], (n) => ({ 3: 0.25, 4: 0.4, 5: 0.35 })[n]);
  const rotation = { 60: 0.65, 65: 0.45, 70: 0.6, 75: 0.55, 80: 0.6, 85: 0.6, 88: 0.5 }[M.minute];
  if (rotation && T.subsUsed + subsWanted.length < T.plannedSubs && rng.chance(rotation)) {
    // Ile zmian na jedno wolne okno, żeby zmieścić plan w limicie 3 okien (podwójne zmiany)
    const windowsLeft = Math.max(1, T.windowsLimit - T.windowsUsed);
    const need = Math.min(2, Math.ceil((T.plannedSubs - T.subsUsed - subsWanted.length) / windowsLeft));
    const tired = xs.filter((x) => x.slot.pos !== 'BR' && !subsWanted.some(([y]) => y === x))
      .sort((a, b) => (a.cond + a.ev * 10) - (b.cond + b.ev * 10)).slice(0, need);
    for (const x of tired) subsWanted.push([x, 'zmiana taktyczna', 1]);
  }
  // Wykonanie zmian (najwyżej 2 na raz, żeby oszczędzać okna); asystent gracza robi to samo
  let done = 0;
  for (const [x, why, p, prefer] of subsWanted.sort((a, b) => a[0].cond - b[0].cond)) {
    if (done >= 2 || T.subsUsed >= T.subsLimit) break;
    if (M.minute < 60 && why === 'zmęczenie' && !assistant) continue;
    if (!rng.chance(p)) continue;
    const sub = bestSub(T, M, x.slot.pos, prefer);
    if (sub && substitute(M, side, x.id, sub.id, why).ok) done++;
  }
}
