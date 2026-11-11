// Przebieg meczu: minuty, przerwy, doliczony czas (z wydarzeń), dogrywka, seria rzutów karnych,
// oceny zawodników i wynik. Interfejs dla UI: createMatch, step, resume, runToEnd, result.

import { createMatch, emit, runPhases, minuteLabel } from './core.js';
import { substitute, changeTactics, shout, canSubstitute, canShout, subsAvailable } from './control.js';
import { aiDecide, assistantSuggest, applySuggestion, matchState } from './coach.js';
import { goalkeeper, fieldPlayers, planShape, validateTacticPatch, knockEligible, slotIndex } from './teams.js';
import { statsFromEvents } from '../matchStats.js';
import { RATING, K, KNOCK } from './constants.js';
import { clamp } from '../../core/rng.js';

export { createMatch, substitute, changeTactics, shout, canSubstitute, canShout, minuteLabel, subsAvailable, assistantSuggest, applySuggestion, matchState };
export { knockEligible };

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
  const prevEvents = M.events.length;
  runPhases(M);
  coolingBreak(M);
  for (const T of M.teams) if (T.ai) aiDecide(M, T.side);
  if (M.abandoned) { finish(M); const ev = M.events.slice(from); return { events: ev, pause: 0, state: 'ended' }; }
  // Zdarzenia w doliczonym czasie (gol, VAR, poważna kontuzja) wydłużają go o minutę, najwyżej o K.addedExtraMax
  if (M.added !== null && M.elapsed > M.length && (M.addedExtra ?? 0) < K.addedExtraMax
    && M.events.slice(prevEvents).some((e) => (e.type === 'goal' && !e.provisional) || e.type === 'varOverturn' || (e.type === 'injury' && !e.canContinue))) {
    M.added++; M.addedExtra = (M.addedExtra ?? 0) + 1;
  }
  if (M.elapsed === M.length) {
    M.added = addedTime(M);
    M.addedTimes.push(M.added);
    if (M.added > 0) emit(M, 'addedTime', null, null, { added: M.added, text: `Sędzia dolicza ${M.added} min.` });
  }
  if (M.added !== null && M.elapsed >= M.length + M.added) { M.addedExtra = 0; endHalf(M); }
  const events = M.events.slice(from);
  const pause = Math.max(0, ...events.map((e) => e.pause ?? 0));
  return { events, pause, state: M.ended ? 'ended' : M.phase };
}

/** Przerwa na schłodzenie w upale (ok. 30. min każdej połowy) [SZAC: próg ctx.weather.tempC >= 32 albo cooling]. */
function coolingBreak(M) {
  const w = M.ctx.weather ?? {};
  if (!(w.cooling || (w.tempC ?? 0) >= K.coolingTempC) || M.half > 2 || M.elapsed !== 30) return;
  M.halfCounts.tw += K.coolingAdded;
  for (const T of M.teams) for (const x of fieldPlayers(T)) x.cond = Math.min(100, x.cond + 2);
  emit(M, 'coolingBreak', null, null, { text: 'Przerwa na schłodzenie: zawodnicy piją, trenerzy przekazują uwagi.', pause: 2 });
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
  for (const s of assistantFor) handOver(M.teams[s]);
  for (const s of assistantFor) if (M.phase !== 'break' && !M.ended) aiDecide(M, s);
  let guard = 0;
  while (!M.ended && guard++ < 400) {
    if (M.phase === 'break') resume(M);
    else step(M);
  }
  return result(M);
}

/** Do końca bieżącej połowy (pomija minuty, zatrzymuje się w przerwie). */
export function runToBreak(M, { assistantFor = [] } = {}) {
  const prev = assistantFor.map((s) => [M.teams[s].ai, M.teams[s].assistant]);
  for (const s of assistantFor) handOver(M.teams[s]);
  // Zaległe reakcje (np. czerwona kartka obejrzana na żywo, na którą gracz nie zareagował) asystent obsługuje od razu
  for (const s of assistantFor) if (M.phase !== 'break' && !M.ended) aiDecide(M, s);
  let guard = 0;
  while (!M.ended && M.phase !== 'break' && guard++ < 200) step(M);
  assistantFor.forEach((s, i) => { [M.teams[s].ai, M.teams[s].assistant] = prev[i]; });
}

/** Drużyna gracza przechodzi pod asystenta: jego punktem wyjścia są obecne instrukcje gracza. */
function handOver(T) {
  if (!T.ai) { T.ai = true; T.assistant = true; T.baseInstr = { ...T.tactics.instructions }; }
}

// ------------------------------------------------------------ Rzuty karne po dogrywce (A6)
function shootout(M) {
  // Uprawnieni: zawodnicy na boisku na koniec dogrywki, także chwilowo opatrywani (Law 10). Kolejność wg umiejętności,
  // bramkarz strzela na końcu i nie jest wyłączany przy wyrównaniu liczebności.
  const kickSkill = (x) => (x.p.attr?.WYK ?? 10) + (x.p.attr?.OPA ?? 10) + (x.p.attr?.SFR ?? 10);
  const takers = M.teams.map((T) => {
    const gk = goalkeeper(T);
    return fieldPlayers(T).filter((x) => x !== gk).sort((a, b) => kickSkill(b) - kickSkill(a)).concat(gk ? [gk] : []);
  });
  const n = Math.min(takers[0].length, takers[1].length); // wyrównanie liczebności
  for (const t of takers) { const gk = t[t.length - 1]; if (t.length > n) { t.length = n - 1; t.push(gk); } }
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
    const outcome = scored ? 'goal' : G && M.rng.next() < 0.65 ? 'saved' : 'missed';
    kicks.push({ side, pid: x.id, scored, outcome, gkId: G?.id ?? null, round: round + 1, suddenDeath: round >= 5 });
    const how = scored ? 'gol' : outcome === 'saved' ? `obronił ${G.p.last ?? G.p.name}` : 'pudło';
    emit(M, 'shootoutKick', side, x, { scored, outcome, gkId: G?.id ?? null, round: round + 1, suddenDeath: round >= 5, text: `${x.p.last ?? x.p.name}: ${how} (${goals[0]}:${goals[1]}).` });
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
  M.shootout = { goals, kicks, suddenDeath: kicks.length > 10 };
}

// ------------------------------------------------------------ Koniec i oceny
/** Zwycięzca (strona) według bieżącego wyniku, po serii karnych według serii; null przy remisie. */
function leader(M) {
  if (M.score[0] !== M.score[1]) return M.score[0] > M.score[1] ? 0 : 1;
  return M.shootout ? (M.shootout.goals[0] > M.shootout.goals[1] ? 0 : 1) : null;
}

/** Minuty zawodnika do minuty `end` (wykluczony gra do końca w statystyce minut, jak w ocenach). */
const minutesOf = (x, end) => (x.minOff ?? end) - x.minOn;

/** Ocena bez szumu: ta sama skala i te same składniki co ocena końcowa (6.1 d). */
function ratingNoNoise(x, T, M, end, winner) {
  const mins = minutesOf(x, end);
  let ev = x.ev;
  if (M.score[1 - T.side] === 0 && mins >= 60) ev += RATING.cleanSheet[x.slot?.pos] ?? 0;
  if (winner !== null) ev += winner === T.side ? RATING.win : RATING.loss;
  return { ev, mins };
}

/**
 * Oceny na żywo { [idZawodnika]: ocena 3.0-10.0 } dla wszystkich, którzy weszli na boisko (obie drużyny).
 * Skala i składniki jak w result(): zdarzenia, czyste konto od 60 min, premia za bieżące prowadzenie, krótki
 * występ (< 20 min) x0,6. Bez losowego szumu (result() dodaje N(0, 0,2)), bez zużycia RNG, koszt O(liczba zawodników):
 * można wołać po każdej minucie.
 */
export function liveRatings(M) {
  const out = {};
  const winner = leader(M);
  for (const T of M.teams) {
    for (const x of T.players) {
      if (x.minOn === null) continue;
      const { ev, mins } = ratingNoNoise(x, T, M, M.minute, winner);
      out[x.id] = Math.round(clamp(mins < 20 ? 6 + 0.6 * ev : 6 + ev, 3, 10) * 10) / 10;
    }
  }
  return out;
}

/** Podsumowanie lekkiego urazu zawodnika do minuty `end` (minuty gry z bólem). */
function knockInfo(x, end) {
  const k = x.knock;
  if (!k) return null;
  const from = Math.max(k.since, x.minOn ?? k.since);
  const to = k.aggravatedAt ?? x.minOff ?? end;
  return { name: k.name, type: k.type, since: k.since, pre: k.pre, aggravated: k.aggravated, aggravatedAt: k.aggravatedAt, minutes: x.minOn === null ? 0 : Math.max(0, to - from) };
}

/**
 * Uraz po meczu: lekki uraz grany z bólem wydłuża przerwę o KNOCK.types[typ].ext dni za każde pełne 30 min
 * (najwyżej KNOCK.maxDays). Uraz sprzed meczu bez pogłębienia: nowy wpis tylko wtedy, gdy przerwa się wydłuża.
 */
function injuryAfter(x, end) {
  const k = x.knock;
  if (!k || k.aggravated || (x.injury && !x.injury.playable)) return x.injury;
  const info = knockInfo(x, end);
  const ext = (KNOCK.types[k.type]?.ext ?? 0) * Math.floor(info.minutes / 30);
  if (!k.pre) return { ...x.injury, days: Math.min(KNOCK.maxDays, Math.max(x.injury.days, x.injury.days + ext)) };
  if (!ext || info.minutes === 0) return null;
  return { cat: 'light', name: k.name, days: Math.min(KNOCK.maxDays, k.days + ext), playable: true, pre: true };
}

/** Kartka zawodnika dla UI: null | 'yellow' | 'secondYellow' | 'red'. */
function cardOf(x) {
  if (x.sentOff) return x.redCode === 'second' ? 'secondYellow' : 'red';
  return x.yc ? 'yellow' : null;
}

/**
 * Stan zawodników drużyny dla UI meczu (boisko, ławka, zmienieni), tani do wołania co minutę.
 * Każdy wpis: { id, name, pos (rola na slocie albo pozycja naturalna), slotIdx (indeks slotu formacji, -1 poza boiskiem),
 * x, y (współrzędne slotu), on (gra teraz, także opatrywany), treated, bench, subbedOff, sentOff,
 * card: null|'yellow'|'secondYellow'|'red', yc: 0|1, rc: 0|1, knock: null | { name, type, since, pre, minutes }
 * (biały krzyżyk: knock !== null i on), injured: uraz bez możliwości gry, cond, rating (liveRatings) }.
 */
export function playerStates(M, side) {
  const T = M.teams[side];
  const rt = liveRatings(M);
  const row = (x, bench) => {
    const on = !!x.on && !x.sentOff && !x.subbedOff;
    const k = x.knock && !x.knock.aggravated ? knockInfo(x, M.minute) : null;
    return {
      id: x.id, name: x.p.name, pos: (on ? x.slot?.pos : null) ?? x.p.pos, slotIdx: on ? slotIndex(T, x) : -1,
      x: on ? x.slot?.x ?? null : null, y: on ? x.slot?.y ?? null : null,
      on, treated: on && x.treatedUntil >= M.minute, bench, subbedOff: !!x.subbedOff, sentOff: !!x.sentOff,
      card: cardOf(x), yc: x.yc ? 1 : 0, rc: x.sentOff ? 1 : 0,
      knock: k, injured: !!x.injury && !x.injury.playable, cond: Math.round(x.cond), rating: rt[x.id] ?? null,
    };
  };
  return [...T.players.map((x) => row(x, false)), ...T.bench.map((x) => row(x, true))];
}

/**
 * Podgląd ustawienia przed zmianą (gracz w oknie „Zmiany i taktyka”, także w osłabieniu): formationId,
 * opts { assign: { [id]: indeksSlotu }, empty: [indeksSlotu] }. Zwraca { ok, error?, assign, empty, shape,
 * need (ile miejsc musi zostać pustych), slots: [{ i, pos, side, x, y, playerId|null }] }. Nic nie zmienia.
 */
export function previewShape(M, side, formationId, opts = {}) {
  const T = M.teams[side];
  const need = 11 - fieldPlayers(T).length;
  const r = planShape(T, formationId, opts);
  if (!r.ok) return { ok: false, error: r.error, need };
  const who = new Map([...r.at].map(([x, i]) => [i, x.id]));
  return {
    ok: true, assign: r.assign, empty: r.empty, shape: r.shape, need,
    slots: r.formation.slots.map((s, i) => ({ i, pos: s.pos, side: s.side, x: s.x, y: s.y, playerId: who.get(i) ?? null })),
  };
}

/** Sprawdzenie zmiany taktyki bez wykonywania: komunikat błędu albo null. */
export function checkTacticPatch(M, side, patch) {
  return validateTacticPatch(M.teams[side], patch);
}

function finish(M) {
  M.ended = true;
  M.phase = 'ended';
  emit(M, 'end', null, null, { text: `Koniec meczu. ${M.score[0]}:${M.score[1]}${M.shootout ? `, karne ${M.shootout.goals[0]}:${M.shootout.goals[1]}` : ''}.` });
}

/** Wynik meczu: wszystko liczone z dziennika zdarzeń i stanu zawodników. */
export function result(M) {
  const stats = statsFromEvents(M.events);
  const end = M.minute;
  const winner = leader(M);
  const ratings = [];
  for (const T of M.teams) {
    for (const x of T.players) {
      if (x.minOn === null) continue;
      const r0 = ratingNoNoise(x, T, M, end, winner);
      const mins = r0.mins;
      let ev = r0.ev;
      ev += M.rng.gauss(0, RATING.noise);
      const rating = mins < 20 ? 6 + 0.6 * ev : 6 + ev;
      ratings.push({
        id: x.id, side: T.side, name: x.p.name, pos: x.slot?.pos ?? x.p.pos, minutes: Math.max(0, mins),
        rating: Math.round(clamp(rating, 3, 10) * 10) / 10, g: x.g, a: x.ast, sh: x.sh, sot: x.sot, kp: x.kp, tk: x.tk,
        saves: x.saves, fouls: x.fouls, yc: x.yc, rc: x.sentOff ? 1 : 0, cond: Math.round(x.cond), injury: injuryAfter(x, end), Z: Math.round(x.Z * 10) / 10,
        knock: knockInfo(x, end), card: cardOf(x),
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
    abandoned: M.abandoned ? { ...M.abandoned } : null,
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
