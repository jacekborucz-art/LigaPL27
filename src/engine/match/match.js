// Przebieg meczu: minuty, przerwy, doliczony czas (z wydarzeń), dogrywka, seria rzutów karnych,
// oceny zawodników i wynik. Interfejs dla UI: createMatch, step, resume, runToEnd, result.

import { createMatch, emit, runPhases, minuteLabel } from './core.js';
import { aiDecide, substitute, changeTactics, shout, canSubstitute, canShout } from './control.js';
import { onPitch, goalkeeper } from './teams.js';
import { statsFromEvents } from '../matchStats.js';
import { RATING } from './constants.js';
import { clamp } from '../../core/rng.js';

export { createMatch, substitute, changeTactics, shout, canSubstitute, canShout, minuteLabel };

const HALVES = { 1: 45, 2: 45, 3: 15, 4: 15 };

/** Doliczony czas z tego, co się wydarzyło w połowie (sędzia, A5). */
function addedTime(M) {
  const c = M.halfCounts;
  const twMul = M.teams.some((T) => T.P.timewasting && M.score[T.side] > M.score[1 - T.side]) ? 1.5 : 0;
  const ev = 0.4 * c.goals + 0.4 * c.windows + 0.5 * c.injuries + 1.0 * c.var + 0.15 * c.cards + c.tw + twMul;
  const r = M.rng.int(0, 1);
  if (M.half === 1) return clamp(Math.round(1 + ev + r), 1, 8);
  if (M.half === 2) return clamp(Math.round(2.5 + ev + r), 2, 10);
  return clamp(Math.round(ev * 0.5 + r), 0, 3);
}

function isLevel(M) {
  const ko = M.ctx.knockout;
  if (!ko) return false;
  if (ko === 'single') return M.score[0] === M.score[1];
  // Dwumecz: obecny gospodarz był gościem w pierwszym meczu; suma bramek, bez bramek wyjazdowych
  const [a, b] = ko.firstLeg;
  return M.score[0] + a === M.score[1] + b;
}

/**
 * Jedna minuta. Zwraca { events (nowe), pause: sekundy (GOL 3 s, VAR 2 s), state: 'play'|'break'|'ended' }.
 * W przerwie (po połowie) trzeba wywołać resume(M), żeby grać dalej (odprawa w przerwie).
 */
export function step(M) {
  if (M.ended) return { events: [], state: 'ended' };
  if (M.phase === 'break') return { events: [], state: 'break' };
  const from = M.events.length;
  M.tick++; M.elapsed++;
  const base = { 1: 0, 2: 45, 3: 90, 4: 105 }[M.half];
  M.minute = base + Math.min(M.elapsed, M.length);
  runPhases(M);
  for (const T of M.teams) if (T.ai) aiDecide(M, T.side);
  if (M.elapsed === M.length) {
    M.added = addedTime(M);
    M.addedTimes.push(M.added);
    if (M.added > 0) emit(M, 'addedTime', null, null, { added: M.added, text: `Sędzia dolicza ${M.added} min.` });
  }
  if (M.added !== null && M.elapsed >= M.length + M.added) endHalf(M);
  const events = M.events.slice(from);
  const pause = Math.max(0, ...events.map((e) => e.pause ?? 0));
  return { events, pause, state: M.ended ? 'ended' : M.phase };
}

function endHalf(M) {
  const h = M.half;
  if (h === 1) {
    M.halfTimeScore = [...M.score];
    emit(M, 'half', null, null, { text: 'Koniec pierwszej połowy.' });
    M.phase = 'break'; return;
  }
  if (h === 2 && isLevel(M)) {
    emit(M, 'half', null, null, { text: 'Koniec regulaminowego czasu gry. Będzie dogrywka.' });
    M.extraTime = true;
    for (const T of M.teams) { T.subsLimit += 1; T.windowsLimit += 1; }
    M.phase = 'break'; return;
  }
  if (h === 3) { emit(M, 'half', null, null, { text: 'Koniec pierwszej połowy dogrywki.' }); M.phase = 'break'; return; }
  if (h === 4 && isLevel(M)) { emit(M, 'half', null, null, { text: 'Koniec dogrywki. Rzuty karne!' }); shootout(M); }
  finish(M);
}

/** Wznowienie po przerwie (po odprawie). */
export function resume(M) {
  if (M.phase !== 'break' || M.ended) return;
  for (const T of M.teams) if (T.ai) aiDecide(M, T.side);
  M.half++; M.elapsed = 0; M.added = null; M.length = HALVES[M.half];
  M.halfCounts = { goals: 0, windows: 0, injuries: 0, var: 0, cards: 0, tw: 0 };
  M.phase = 'play';
  emit(M, 'kickoff', null, null, { text: M.half === 2 ? 'Początek drugiej połowy.' : M.half === 3 ? 'Początek dogrywki.' : 'Początek drugiej połowy dogrywki.' });
}

/**
 * Do końca meczu bez oglądania („Pokaż wynik od razu”).
 * Drużyna gracza przechodzi pod asystenta (te same reguły co AI).
 */
export function runToEnd(M, { assistantFor = [] } = {}) {
  for (const s of assistantFor) M.teams[s].ai = true;
  let guard = 0;
  while (!M.ended && guard++ < 400) {
    if (M.phase === 'break') resume(M);
    else step(M);
  }
  return result(M);
}

/** Do końca bieżącej połowy (pomija minuty, zatrzymuje się w przerwie). */
export function runToBreak(M, { assistantFor = [] } = {}) {
  const prev = assistantFor.map((s) => M.teams[s].ai);
  for (const s of assistantFor) M.teams[s].ai = true;
  let guard = 0;
  while (!M.ended && M.phase !== 'break' && guard++ < 200) step(M);
  assistantFor.forEach((s, i) => { M.teams[s].ai = prev[i]; });
}

// ------------------------------------------------------------ Rzuty karne po dogrywce (A6)
function shootout(M) {
  const takers = M.teams.map((T) => onPitch(T, M.minute).slice()
    .sort((a, b) => ((b.p.attr?.WYK ?? 10) + (b.p.attr?.OPA ?? 10) + (b.p.attr?.SFR ?? 10)) - ((a.p.attr?.WYK ?? 10) + (a.p.attr?.OPA ?? 10) + (a.p.attr?.SFR ?? 10))));
  const n = Math.min(takers[0].length, takers[1].length); // wyrównanie liczebności
  for (const t of takers) t.length = n;
  const goals = [0, 0];
  const kicks = [];
  let round = 0;
  const kick = (side) => {
    const T = M.teams[side]; const G = goalkeeper(M.teams[1 - side]);
    const x = takers[side][round % n];
    const skill = ((x.p.attr?.WYK ?? 10) + (x.p.attr?.OPA ?? 10) + (x.p.attr?.SFR ?? 10)) / 3;
    const keep = G ? ((G.p.attr?.REF ?? 4) + (G.p.attr?.JNJ ?? 4)) / 2 : 3;
    const pressure = round >= 5 ? 0.02 * ((x.p.attr?.OPA ?? 10) - 10) : 0;
    const p = clamp(0.72 * Math.exp(0.03 * (skill - keep)) + pressure, 0.4, 0.95);
    const scored = M.rng.next() < p;
    if (scored) goals[side]++;
    kicks.push({ side, pid: x.id, scored });
    emit(M, 'shootoutKick', side, x, { scored, text: `${x.p.last ?? x.p.name}: ${scored ? 'gol' : 'pudło'} (${goals[0]}:${goals[1]}).` });
    void T;
  };
  // 5 serii ABAB z wcześniejszym rozstrzygnięciem, potem nagła śmierć
  for (round = 0; round < 5; round++) {
    kick(0);
    if (goals[0] > goals[1] + (5 - round)) break;
    if (goals[1] > goals[0] + (5 - round - 1)) break;
    kick(1);
    if (goals[0] > goals[1] + (5 - round - 1) || goals[1] > goals[0] + (5 - round - 1)) break;
  }
  if (goals[0] === goals[1]) {
    for (round = 5; round < 60; round++) {
      kick(0); kick(1);
      if (goals[0] !== goals[1]) break;
    }
  }
  M.shootout = { goals, kicks };
}

// ------------------------------------------------------------ Koniec i oceny
function finish(M) {
  M.ended = true;
  M.phase = 'ended';
  emit(M, 'end', null, null, { text: `Koniec meczu. ${M.score[0]}:${M.score[1]}${M.shootout ? `, karne ${M.shootout.goals[0]}:${M.shootout.goals[1]}` : ''}.` });
}

/** Wynik meczu: wszystko liczone z dziennika zdarzeń i stanu zawodników. */
export function result(M) {
  const stats = statsFromEvents(M.events);
  const end = M.minute;
  const winner = M.score[0] !== M.score[1] ? (M.score[0] > M.score[1] ? 0 : 1)
    : M.shootout ? (M.shootout.goals[0] > M.shootout.goals[1] ? 0 : 1) : null;
  const ratings = [];
  for (const T of M.teams) {
    const conceded = M.score[1 - T.side];
    for (const x of T.players) {
      if (x.minOn === null) continue;
      const mins = (x.minOff ?? (x.sentOff ? end : end)) - x.minOn;
      let ev = x.ev;
      if (conceded === 0 && mins >= 60) ev += RATING.cleanSheet[x.slot?.pos] ?? 0;
      if (winner !== null) ev += winner === T.side ? RATING.win : RATING.loss;
      ev += M.rng.gauss(0, RATING.noise);
      const rating = mins < 20 ? 6 + 0.6 * ev : 6 + ev;
      ratings.push({
        id: x.id, side: T.side, name: x.p.name, pos: x.slot?.pos ?? x.p.pos, minutes: Math.max(0, mins),
        rating: Math.round(clamp(rating, 3, 10) * 10) / 10, g: x.g, a: x.ast, sh: x.sh, sot: x.sot, kp: x.kp, tk: x.tk,
        saves: x.saves, fouls: x.fouls, yc: x.yc, rc: x.sentOff ? 1 : 0, cond: Math.round(x.cond), injury: x.injury, Z: Math.round(x.Z * 10) / 10,
      });
    }
  }
  const sorted = ratings.slice().sort((a, b) => b.rating - a.rating || (b.side === winner) - (a.side === winner));
  return {
    score: [...M.score],
    halfTimeScore: M.halfTimeScore,
    extraTime: M.extraTime,
    shootout: M.shootout ? { goals: [...M.shootout.goals], kicks: M.shootout.kicks } : null,
    winner,
    addedTimes: M.addedTimes,
    stats,
    ratings,
    motm: sorted[0]?.id ?? null,
    injuries: ratings.filter((r) => r.injury).map((r) => ({ id: r.id, side: r.side, ...r.injury })),
    cards: M.events.filter((e) => e.type === 'yellow' || e.type === 'red').map((e) => ({ id: e.pid, side: e.side, type: e.type, min: e.min })),
    momentum: M.momentum,
    events: M.events.filter((e) => !['pass', 'passFail', 'possessionMinute', 'throwIn', 'goalKick', 'freeKick'].includes(e.type)),
  };
}
