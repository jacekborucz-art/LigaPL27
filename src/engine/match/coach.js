// AI trenera w meczu (docs/ekspert_futbol.md 7.2, docs/sytuacje-meczowe.md). Ta sama logika prowadzi
// rywala, asystenta gracza („Pokaż wynik”) i podpowiedzi asystenta w trakcie meczu (assistantSuggest).
// Trener widzi tylko to, co widzi trener na ławce: wynik (w dwumeczu sumę), minutę, liczebność, kartki,
// kondycję, urazy i ławkę. Zmienia tylko swoją drużynę i tylko przez substitute/changeTactics.
// Wartości balansowe [SZAC].

import { substitute, changeTactics, subsAvailable, isConcussionSub } from './control.js';
import { setCoachHooks } from './core.js';
import { goalkeeper, fieldPlayers, slotFit, reslot } from './teams.js';
import { proficiency } from '../positions.js';

const CHECKPOINTS = new Set([46, 55, 60, 65, 70, 75, 80, 85, 88, 95, 100, 105, 110, 115, 119]);
const ATT = new Set(['NAP', 'SN', 'OP', 'SP']);
const DEF_ROLE = new Set(['ŚO', 'BO', 'WB', 'DP']);
const BACK = new Set(['ŚO', 'BO', 'WB']);
const BACK3 = new Set(['352', '343', '532', '541']);
const MANAGED = ['mentality', 'tempo', 'pressing', 'line', 'passing', 'timewasting'];
// Ustawienia przy pogoni za wynikiem (1: umiarkowanie, 2: trójka z tyłu) i przy obronie wyniku [SZAC]
const ATTACK1 = { 4141: '4231', 4231: '442', 442: '442', '442d': '442', 4321: '4231', 433: '433', 352: '352', 343: '343', 532: '352', 541: '442' };
const ATTACK2 = { 4141: '343', 4231: '343', 442: '343', '442d': '343', 4321: '343', 433: '343', 352: '343', 343: '343', 532: '352', 541: '352' };
const DEFEND_MID = { 4231: '4141', 433: '4141', 442: '4141', '442d': '4141', 4321: '4141', 4141: '4141', 352: '532', 343: '532', 532: '532', 541: '541' };

const attr = (x, k) => x.p.attr?.[k] ?? x.p.ovr ?? 10;
const condAdj = (x) => (x.cond < 85 ? -0.04 * (85 - x.cond) : 0);
const chaseAt = (T, b) => b + (T.coach === 'O' ? -10 : T.coach === 'S' ? 5 : 0);
const protectAt = (T, b) => b + (T.coach === 'O' ? 7 : T.coach === 'S' ? -10 : 0);

// ------------------------------------------------------------ Stan meczu oczami trenera
/**
 * diff: różnica bramek (w dwumeczu suma z pierwszego meczu), men: przewaga liczebna (+) lub osłabienie (-),
 * str: różnica siły drużyn sprzed meczu (z atutem boiska), mom: momentum ostatnich 10 minut (-1..1).
 */
export function matchState(M, side) {
  const T = M.teams[side]; const O = M.teams[1 - side];
  const fl = M.ctx.knockout?.firstLeg;
  const diff = M.score[side] - M.score[1 - side] + (fl ? fl[side] - fl[1 - side] : 0);
  const atBreak = M.phase === 'break';
  const et = M.half >= 3 || (atBreak && M.extraTime && M.half === 2);
  const lastTen = M.momentum.slice(-10);
  const mom = lastTen.length ? lastTen.reduce((s, v) => s + v, 0) / lastTen.length / 100 * (side === 0 ? 1 : -1) : 0;
  return {
    diff, et, atBreak, halftime: atBreak && M.half === 1, ko: !!M.ctx.knockout, minute: M.minute,
    added: M.half % 2 === 0 && M.elapsed > M.length, men: fieldPlayers(T).length - fieldPlayers(O).length,
    str: T.strDiff ?? 0, mom, heat: (M.ctx.weather?.fat ?? 1) >= 1.25,
  };
}

/** Docelowe instrukcje dla stanu meczu (od ustawień wyjściowych trenera). */
export function desiredInstructions(T, st) {
  const b = T.baseInstr ?? T.tactics.instructions;
  const m = Number(b.mentality ?? 0);
  const w = {};
  let reason = null;
  if (st.diff < 0) {
    if (st.minute >= chaseAt(T, st.diff <= -2 ? 60 : 65) || (st.men > 0 && st.minute >= 30) || (st.halftime && st.diff <= -2)) {
      reason = 'gonimy wynik';
      w.mentality = String(Math.max(m, 1)); w.timewasting = 'off';
      if ((st.diff <= -2 && st.minute >= 60) || st.minute >= 80 || st.et) { w.mentality = '2'; w.tempo = 'fast'; w.pressing = st.men < 0 ? 'mid' : 'high'; }
      if (st.minute >= 85 || st.added) { w.mentality = '2'; w.passing = 'long'; w.line = 'high'; }
    }
  } else if (st.diff > 0) {
    if (st.minute >= protectAt(T, st.diff >= 2 ? 70 : 75)) {
      reason = 'bronimy wyniku';
      w.mentality = String(Math.min(m, st.men > 0 ? 0 : -1));
      if (st.diff === 1) w.tempo = 'slow';
      if (st.minute >= 82 || st.added) w.timewasting = 'on';
      if (st.diff === 1 && (st.minute >= 85 || st.added) && st.men <= 0 && (st.mom < -0.2 || T.coach === 'S')) {
        w.mentality = '-2'; w.line = 'low'; w.pressing = 'low'; reason = 'murujemy bramkę';
      }
      if (st.men > 0) w.passing = 'short'; // w przewadze trzymamy piłkę
    }
  } else if (st.men > 0 && st.minute >= 20) {
    reason = 'rywal w osłabieniu'; w.mentality = String(Math.max(m, 1)); w.pressing = 'high';
    if (st.minute >= 70) { w.mentality = '2'; w.tempo = 'fast'; }
  } else if (st.ko) {
    if (st.et && st.minute >= 112 && st.str < -0.5) { reason = 'gramy na rzuty karne'; w.mentality = String(Math.min(m, -1)); }
    else if (!st.et && st.minute >= 85 && st.str < 0) { reason = 'bez ryzyka przed dogrywką'; w.mentality = String(Math.min(m, 0)); }
  } else if (st.minute >= 70 && st.str > 1) {
    reason = 'faworyt szuka gola'; w.mentality = String(Math.max(m, 1));
  } else if (st.minute >= 80 && st.str < -1) {
    reason = 'bierzemy punkt'; w.mentality = String(Math.min(m, -1));
  }
  if (st.men > 0 && st.diff <= 0 && st.minute >= 20) {
    w.pressing = 'high'; // rywal w dziesiątkę: wyżej i szybciej, niech biega
    if (Number(w.mentality ?? m) < 1) w.mentality = '1';
  }
  if (st.men < 0 && st.diff >= 0) {
    w.pressing = 'low'; w.counter = 'yes';
    if (Number(w.mentality ?? m) > -1) w.mentality = '-1';
    reason = reason ?? 'gra w osłabieniu';
  }
  for (const k of MANAGED) if (!(k in w) && b[k] != null) w[k] = b[k];
  return { w, reason };
}

function instrPatch(T, w) {
  const out = {};
  for (const [k, v] of Object.entries(w)) if (v != null && T.tactics.instructions?.[k] !== v) out[k] = v;
  return out;
}

/** Kształt w osłabieniu: które pozycje zostają puste (np. 4-4-2 bez napastnika = 4-4-1). */
export function shortShape(T, st, k = 11 - fieldPlayers(T).length) {
  if (k <= 0) return null;
  const back3 = BACK3.has(T.tactics.formation);
  if (st.diff < 0 && st.minute >= 55) return back3 ? { formation: '352', drop: ['DP', 'ŚP', 'ŚP'].slice(0, k) } : { formation: '442d', drop: ['OP', 'ŚP', 'DP'].slice(0, k) };
  return back3 ? { formation: '532', drop: ['NAP', 'ŚP', 'NAP'].slice(0, k) } : { formation: '442', drop: ['NAP', 'SP', 'ŚP'].slice(0, k) };
}

// ------------------------------------------------------------ Wybór zawodników
const benchPool = (T, reserved) => T.bench.filter((b) => !b.injury && !b.sentOff && !reserved.has(b));

/**
 * Najlepsze zastępstwo za schodzącego: wprost na jego slot albo z przesunięciem zawodnika z boiska
 * (np. defensywny pomocnik cofa się na środek obrony, a wchodzący pomocnik zajmuje jego miejsce).
 * Bramkarza zastępuje tylko bramkarz; bramkarz rezerwowy nie wchodzi w pole.
 */
export function pickReplacement(T, out, { prefer = null, reserved = new Set(), slot = out?.slot } = {}) {
  if (!slot) return null;
  if (slot.pos === 'BR') {
    const gks = benchPool(T, reserved).filter((b) => b.p.pos === 'BR');
    return gks.length ? { inc: gks.reduce((a, b) => (b.R.GK > a.R.GK ? b : a)), move: null } : null;
  }
  const bench = benchPool(T, reserved).filter((b) => b.p.pos !== 'BR');
  if (!bench.length) return null;
  const bonus = (b) => (prefer?.has(b.p.pos) ? 4 : 0) + condAdj(b);
  const field = fieldPlayers(T).filter((y) => y !== out && y.slot && y.slot.pos !== 'BR' && !reserved.has(y));
  let best = null; let bestV = -Infinity;
  for (const b of bench) {
    const v = slotFit(b, slot) + bonus(b);
    if (v > bestV) { bestV = v; best = { inc: b, move: null }; }
  }
  // Przesunięcia sprawdzamy tylko, gdy na ławce nie ma nikogo z naturalną lub pokrewną pozycją
  if (proficiency(best.inc.p, slot.pos, slot.side) >= 85) return best;
  for (const b of bench) {
    for (const y of field) {
      const mv = slotFit(y, slot) + slotFit(b, y.slot) - slotFit(y, y.slot) + bonus(b) - 0.3;
      if (mv > bestV) { bestV = mv; best = { inc: b, move: y }; }
    }
  }
  return best;
}

/** Zawodnik z pola najmniej potrzebny w tym stanie meczu (np. napastnik przy obronie wyniku). */
export function leastNeeded(T, st, reserved = new Set(), except = null) {
  const xs = fieldPlayers(T).filter((y) => y !== except && y.slot?.pos !== 'BR' && !reserved.has(y));
  if (!xs.length) return null;
  const backs = xs.filter((y) => BACK.has(y.slot.pos)).length;
  const score = (y) => slotFit(y, y.slot) + condAdj(y)
    + (st.diff >= 0 && ATT.has(y.slot.pos) ? -3 : 0)
    + (st.diff < 0 && DEF_ROLE.has(y.slot.pos) && backs > 3 ? -2 : 0)
    + (st.diff < 0 && ATT.has(y.slot.pos) ? 2 : 0)
    + (y.yc ? -1 : 0);
  return xs.reduce((a, b) => (score(b) < score(a) ? b : a));
}

function lowest(xs, key) { return xs.length ? xs.reduce((a, b) => (key(b) < key(a) ? b : a)) : null; }

// ------------------------------------------------------------ Plan decyzji
const ADVICE_RNG = { chance: () => true };

/**
 * Plan decyzji trenera bez wykonywania: [{ type: 'sub', outId, inId, moveId, why, text, concussion },
 * { type: 'tactic', patch, reason }]. advice = true: bez losowania i bez punktów kontrolnych (podpowiedź).
 */
function plan(M, side, rng, advice) {
  const T = M.teams[side];
  if (M.ended) return [];
  const st = matchState(M, side);
  const subs = [];
  const tactic = { patch: null, reason: null, urgent: false };
  const reserved = new Set();
  let left = subsAvailable(M, T);
  const addSub = (out, repl, why, text, extra = {}) => {
    reserved.add(out); reserved.add(repl.inc); if (repl.move) reserved.add(repl.move);
    if (!extra.concussion) left--;
    subs.push({ type: 'sub', out, inc: repl.inc, move: repl.move, why, text, ...extra });
  };
  const mergeTactic = (patch, reason, urgent = false) => {
    if (!patch || (!patch.formation && !patch.drop && !Object.keys(patch.instructions ?? {}).length)) return;
    const p = tactic.patch ?? {};
    tactic.patch = { ...p, ...patch, instructions: { ...(p.instructions ?? {}), ...(patch.instructions ?? {}) } };
    if (!Object.keys(tactic.patch.instructions).length) delete tactic.patch.instructions;
    tactic.reason = tactic.reason ?? reason;
    tactic.urgent = tactic.urgent || urgent;
  };

  // 1. Pilne: kontuzje bez możliwości gry, bramkarz z pola w bramce
  for (const x of T.injuredOff) {
    if (x.subbedOff || x.sentOff || reserved.has(x)) continue;
    const conc = isConcussionSub(M, T, x);
    if (!conc && left <= 0) continue;
    const repl = pickReplacement(T, x, { reserved });
    if (repl) addSub(x, repl, conc ? 'concussion' : 'injury', conc ? 'zmiana po wstrząśnieniu mózgu' : 'kontuzja', { concussion: conc });
  }
  const keeper = goalkeeper(T);
  if (keeper && keeper.p.pos !== 'BR' && left > 0) {
    const gk = benchPool(T, reserved).filter((b) => b.p.pos === 'BR').sort((a, b) => b.R.GK - a.R.GK)[0];
    const injGk = T.injuredGk && !T.injuredGk.subbedOff ? T.injuredGk : null;
    if (gk) {
      const out = injGk ?? leastNeeded(T, st, reserved, keeper);
      if (out) addSub(out, { inc: gk, move: null }, 'gk', injGk ? 'kontuzja bramkarza' : 'rezerwowy bramkarz do bramki');
    } else if (injGk) {
      const repl = pickReplacement(T, injGk, { reserved, slot: keeper.prevSlot ?? injGk.slot });
      if (repl && repl.inc.p.pos !== 'BR') addSub(injGk, { inc: repl.inc, move: null }, 'injury', 'kontuzja bramkarza, w bramce zawodnik z pola');
    }
  }

  // 2. Reakcje na czerwone kartki i osłabienie po kontuzji
  const reacts = T.react.filter((r) => !(T.lastUserTick >= r.tick));
  const ownRed = reacts.find((r) => r.kind === 'ownRed');
  const injShort = reacts.find((r) => r.kind === 'injury' && !r.gk);
  const oppRed = reacts.find((r) => r.kind === 'oppRed');
  const menAfter = fieldPlayers(T).length + subs.filter((s) => !s.out.on).length;
  if ((ownRed || injShort) && menAfter < 11 && rng.chance(0.95)) {
    // Za wykluczonego obrońcę: napastnik schodzi, wchodzi obrońca (gdy prowadzimy lub remis i jest zapas zmian)
    if (ownRed && !ownRed.gk && BACK.has(ownRed.pos) && st.minute < 85 && (st.diff >= 0 || (ownRed.pos === 'ŚO' && st.minute < 70))
      && left > (st.minute < 75 ? 1 : 0)) {
      const atk = fieldPlayers(T).filter((y) => ATT.has(y.slot?.pos) && !reserved.has(y));
      const def = benchPool(T, reserved).filter((b) => BACK.has(b.p.pos)).sort((a, b) => (b.p.pos === ownRed.pos) - (a.p.pos === ownRed.pos) || b.p.ovr - a.p.ovr)[0];
      if (atk.length >= 2 && def) {
        const out = lowest(atk, (y) => slotFit(y, y.slot) + condAdj(y));
        addSub(out, { inc: def, move: null }, 'redReshape', 'reorganizacja po czerwonej kartce');
      }
    }
    const k = 11 - menAfter;
    const sh = shortShape(T, { ...st, men: st.men }, k);
    const d = desiredInstructions(T, { ...st, men: Math.min(st.men, -1) });
    mergeTactic({ formation: sh.formation, drop: sh.drop, instructions: instrPatch(T, d.w) },
      ownRed ? `czerwona kartka: gra w ${menAfter}` : `kontuzja bez zmiany: gra w ${menAfter}`, true);
  }
  if (oppRed && rng.chance(0.8)) {
    const d = desiredInstructions(T, st);
    mergeTactic({ instructions: instrPatch(T, d.w) }, d.reason ?? 'rywal w osłabieniu', true);
  }

  // 3. Punkty kontrolne: instrukcje, zmiany taktyczne, rotacja
  const addedCheck = M.half % 2 === 0 && M.elapsed === M.length + 1;
  const goalReact = reacts.some((r) => r.kind === 'goal') && st.minute >= 60;
  const checkpoint = advice || st.atBreak || (CHECKPOINTS.has(M.minute) && M.elapsed <= M.length) || addedCheck;
  if (checkpoint || goalReact) {
    const d = desiredInstructions(T, st);
    const patch = instrPatch(T, d.w);
    if (patch.timewasting === 'on' && !rng.chance(T.coach === 'O' ? 0.3 : 0.6)) delete patch.timewasting;
    if (Object.keys(patch).length && (advice || st.atBreak || M.minute - T.lastTacChange >= 10) && rng.chance(0.75)) {
      mergeTactic({ instructions: patch }, d.reason ?? 'powrót do planu');
    }
    // W osłabieniu kształt dopasowany do wyniku (np. 4-4-1 -> 4-3-2 przy pogoni)
    if (fieldPlayers(T).length < 11 && !tactic.patch?.formation) {
      const sh = shortShape(T, st);
      if (sh && (sh.formation !== T.tactics.formation || sh.drop.join() !== (T.dropPos ?? []).join())
        && (advice || st.atBreak || M.minute - T.lastTacChange >= 10) && rng.chance(0.6)) {
        mergeTactic({ formation: sh.formation, drop: sh.drop }, st.diff < 0 ? 'w osłabieniu, ale gonimy wynik' : 'w osłabieniu bronimy się');
      }
    }
  }
  if (checkpoint && left > 0) planSubs(M, T, st, rng, advice, { reserved, addSub, mergeTactic, left: () => left });

  const out = [...subs.map((s) => ({
    type: 'sub', outId: s.out.id, inId: s.inc.id, moveId: s.move?.id ?? null, why: s.why, text: s.text, concussion: !!s.concussion,
    outName: s.out.p.name, inName: s.inc.p.name, outPos: s.out.slot?.pos ?? null, inPos: s.inc.p.pos,
  }))];
  if (tactic.patch) out.push({ type: 'tactic', patch: tactic.patch, reason: tactic.reason, urgent: tactic.urgent });
  return out;
}

/** Zmiany w punkcie kontrolnym: urazy z bólem, zmęczenie, kartki, taktyka wg wyniku, rotacja; grupowanie w oknach. */
function planSubs(M, T, st, rng, advice, ctx) {
  const min = st.minute;
  const atBreak = st.atBreak;
  const openWindow = !atBreak && T.windowMinute !== M.tick;
  const windowsLeft = T.windowsLimit - T.windowsUsed;
  const { reserved } = ctx;
  const xs = fieldPlayers(T).filter((x) => !reserved.has(x) && x.slot);
  const cands = [];
  const tiredThr = 70 + (st.heat ? 4 : 0) + (min >= 75 ? 3 : 0);
  const hot = (x) => x.yc && DEF_ROLE.has(x.slot.pos) && (attr(x, 'AGR') >= 13 || (x.p.hidden?.TMP ?? 10) >= 14);
  for (const x of xs) {
    if (x.slot.pos === 'BR') {
      if (x.injury?.playable && x.p.pos === 'BR' && (atBreak || min >= 46)) cands.push({ x, why: 'injury', text: 'uraz bramkarza', prio: 0.85, p: 0.5 });
      continue;
    }
    if (x.injury?.playable && (atBreak || min >= 46)) cands.push({ x, why: 'injury', text: 'uraz', prio: 0.9, p: 0.7 });
    else if (x.cond < tiredThr && (min >= 55 || st.et)) cands.push({ x, why: 'tired', text: 'zmęczenie', prio: 0.6 + (tiredThr - x.cond) / 30, p: 0.8 });
    else if (hot(x) && (min >= 55 || st.halftime) && !x.bookChecked) {
      if (!advice) x.bookChecked = true; // trener ocenia ryzyko raz (w przerwie albo po 55. minucie)
      cands.push({ x, why: 'booked', text: 'zagrożony drugą żółtą kartką', prio: 0.55, p: atBreak ? 0.35 : 0.5 });
    }
    else if (x.ev < -0.8 && (min >= 60 || st.halftime)) cands.push({ x, why: 'form', text: 'słaba gra', prio: 0.4, p: atBreak ? 0.3 : 0.4 });
  }
  const taken = new Set(cands.map((c) => c.x));
  const full = fieldPlayers(T).length >= 11;
  // Pogoń za wynikiem: defensywny gracz schodzi, wchodzi napastnik (lub przewaga liczebna przy remisie)
  const chasing = st.diff < 0 || (st.diff === 0 && st.men > 0 && min >= 55 && !st.ko);
  if (chasing && (T.chaseSubs ?? 0) < (st.diff <= -2 ? 3 : 2) && (min >= chaseAt(T, st.diff <= -2 ? 60 : 65) || (st.halftime && st.diff <= -2))) {
    const backs = xs.filter((y) => y.slot.pos === 'ŚO').length;
    const allOut = st.diff <= -2 || min >= 78 || st.et;
    const f = T.tactics.formation;
    const kind = allOut && min >= 75 && full ? 'attack2' : 'attack1';
    const target = full ? (kind === 'attack2' ? ATTACK2 : ATTACK1)[f] : null;
    let pool;
    if (target && target !== f) {
      // Nowe ustawienie ma więcej miejsc w ataku: schodzi defensywny gracz
      pool = xs.filter((y) => !taken.has(y) && (['DP', 'ŚP'].includes(y.slot.pos) || (y.slot.pos === 'ŚO' && backs >= 3) || (y.slot.pos === 'BO' && min >= 80)));
    } else {
      // Ustawienie już ofensywne: świeży napastnik za zmęczonego lub słabego zawodnika z przodu
      pool = xs.filter((y) => !taken.has(y) && ATT.has(y.slot.pos));
    }
    const order = { DP: 0, ŚO: 1, BO: 2, ŚP: 3 };
    const sorted = pool.sort((a, b) => ((order[a.slot.pos] ?? 4) - (order[b.slot.pos] ?? 4)) || (slotFit(a, a.slot) + condAdj(a)) - (slotFit(b, b.slot) + condAdj(b)));
    sorted.slice(0, allOut && min >= 70 ? 2 : 1).forEach((x, i) => {
      cands.push({ x, why: 'chase', text: target && target !== f ? 'ofensywna zmiana' : 'świeży zawodnik w ataku', prio: 1 - 0.1 * i, p: i ? 0.5 : st.diff <= -2 ? 0.85 : 0.65, prefer: ATT, shape: target && target !== f ? kind : null });
      taken.add(x);
    });
  }
  // Obrona wyniku: napastnik lub skrzydłowy schodzi, wchodzi obrońca lub defensywny pomocnik
  if (st.diff > 0 && (T.protectSubs ?? 0) < 2 && min >= protectAt(T, st.diff >= 2 ? 70 : 75)) {
    const x = lowest(xs.filter((y) => ATT.has(y.slot.pos) && !taken.has(y)), (y) => y.cond + 10 * y.ev);
    if (x) {
      cands.push({ x, why: 'protect', text: 'wzmocnienie obrony', prio: 0.9, p: st.diff === 1 ? 0.6 : 0.35, prefer: new Set(['DP', 'ŚO', 'BO', 'WB']), shape: st.diff === 1 && min >= 80 ? 'defend' : null });
      taken.add(x);
    }
  }
  // Doliczony czas przy prowadzeniu: zmiana na czas (zawodnik schodzi powoli)
  if (st.diff > 0 && st.added) {
    const x = lowest(xs.filter((y) => ATT.has(y.slot.pos) && !taken.has(y)), (y) => y.cond);
    if (x) { cands.push({ x, why: 'timewasting', text: 'gra na czas', prio: 0.5, p: 0.5 }); taken.add(x); }
  }
  // Bramkarz od rzutów karnych tuż przed serią
  if (st.ko && st.et && M.half === 4 && min >= 119 && st.diff === 0) {
    const gk = goalkeeper(T);
    const spec = benchPool(T, reserved).filter((b) => b.p.pos === 'BR').sort((a, b) => (attr(b, 'REF') + attr(b, 'JNJ')) - (attr(a, 'REF') + attr(a, 'JNJ')))[0];
    if (gk && spec && (attr(spec, 'REF') + attr(spec, 'JNJ')) / 2 >= (attr(gk, 'REF') + attr(gk, 'JNJ')) / 2 + 1.5) {
      cands.push({ x: gk, why: 'penaltyGk', text: 'bramkarz od rzutów karnych', prio: 2, p: 0.7 });
    }
  }
  // Rotacja wg planu trenera (3-5 zmian w meczu, średnio ok. 4)
  const rotation = { 60: 0.65, 65: 0.45, 70: 0.6, 75: 0.55, 80: 0.6, 85: 0.6, 88: 0.5, 95: 0.4, 105: 0.6 }[min];
  const planned = T.plannedSubs ?? 4;
  if (!advice && rotation && !atBreak && T.subsUsed + cands.length < planned && rng.chance(rotation)) {
    const windowsLeftNow = Math.max(1, windowsLeft);
    const need = Math.min(2, Math.ceil((planned - T.subsUsed - cands.length) / windowsLeftNow));
    xs.filter((y) => y.slot.pos !== 'BR' && !taken.has(y)).sort((a, b) => (a.cond + a.ev * 10) - (b.cond + b.ev * 10)).slice(0, need)
      .forEach((x) => { cands.push({ x, why: 'rotation', text: 'zmiana taktyczna', prio: 0.3, p: 1 }); taken.add(x); });
  }
  if (!cands.length) return;
  cands.sort((a, b) => b.prio - a.prio);
  // Zapas na kontuzję: przed 80. minutą zostaje jedna zmiana; ostatniego okna nie otwieramy bez pilnej potrzeby
  const urgent = cands.some((c) => c.prio >= 0.9);
  if (!advice && openWindow && windowsLeft <= 1 && min < 80 && !st.et && !urgent) return;
  const keep = !advice && !atBreak && !st.et && min < 80 && !(openWindow && windowsLeft <= 1) ? 1 : 0;
  const maxNow = Math.min(3, ctx.left() - keep);
  if (maxNow <= 0) return;
  let made = 0;
  const shapes = [];
  for (const c of cands) {
    if (made >= maxNow) break;
    // Plan trenera (3-5 zmian) obejmuje też zmiany taktyczne; ponad plan tylko uraz, bramkarz i pogoń przy -2
    const cap = planned + (c.why === 'injury' || c.why === 'penaltyGk' ? 2 : c.why === 'chase' && st.diff <= -2 ? 1 : 0);
    if (!advice && T.subsUsed + made >= cap) continue;
    if (!rng.chance(c.p)) continue;
    const repl = pickReplacement(T, c.x, { prefer: c.prefer, reserved });
    if (!repl) continue;
    if (c.prefer && !c.prefer.has(repl.inc.p.pos) && c.why !== 'protect') continue; // brak napastnika na ławce: bez zmiany
    ctx.addSub(c.x, repl, c.why, c.text);
    made++;
    if (c.shape) shapes.push([c.shape, repl.inc]);
  }
  // Grupowanie: skoro okno i tak się otwiera, dokładamy zaplanowane zmiany (podwójna lub potrójna zmiana)
  if (!advice && made && openWindow && min >= 60) {
    const extra = xs.filter((y) => y.slot.pos !== 'BR' && !reserved.has(y)).sort((a, b) => (a.cond + a.ev * 10) - (b.cond + b.ev * 10));
    for (const x of extra) {
      if (made >= maxNow || T.subsUsed + made >= planned) break;
      const repl = pickReplacement(T, x, { reserved });
      if (!repl) break;
      ctx.addSub(x, repl, 'rotation', 'zmiana taktyczna');
      made++;
    }
  }
  if (shapes.length && full) {
    const [kind, inc] = shapes[0];
    const f = T.tactics.formation;
    const target = kind === 'attack2' ? ATTACK2[f] : kind === 'attack1' ? ATTACK1[f]
      : BACK.has(inc.p.pos) ? '541' : DEFEND_MID[f];
    if (target && target !== f) ctx.mergeTactic({ formation: target }, kind === 'defend' ? 'zamykamy wynik' : 'więcej napastników');
  } else if (shapes.length && !full) {
    const sh = shortShape(T, st);
    if (sh) ctx.mergeTactic({ formation: sh.formation, drop: sh.drop }, 'zmiana ustawienia w osłabieniu');
  }
}

// ------------------------------------------------------------ Wykonanie
function execute(M, side, actions, by) {
  const T = M.teams[side];
  let shuffle = false;
  for (const a of actions) {
    if (a.type !== 'sub') continue;
    const r = substitute(M, side, a.outId, a.inId, a.text, { by, why: a.why, moveId: a.moveId, concussion: a.concussion || undefined });
    if (r.ok && (a.moveId || ['chase', 'protect', 'redReshape', 'gk'].includes(a.why))) shuffle = true;
    if (r.ok && a.why === 'chase') T.chaseSubs = (T.chaseSubs ?? 0) + 1;
    if (r.ok && a.why === 'protect') T.protectSubs = (T.protectSubs ?? 0) + 1;
  }
  const t = actions.find((a) => a.type === 'tactic');
  if (t) changeTactics(M, side, t.patch, { by, reason: t.reason });
  else if ((shuffle || (T.dropIdx.length && fieldPlayers(T).length >= 11)) && by !== 'user') reslot(T); // przestawienie bez kosztu
}

/** Decyzje AI (rywal albo asystent gracza) w danej minucie. Zmienia tylko swoją drużynę i tylko zgodnie z regułami. */
export function aiDecide(M, side) {
  const T = M.teams[side];
  // Szybkie wyjście: trener myśli tylko w punktach kontrolnych, w przerwie i po zdarzeniach (kartka, gol, uraz)
  const busy = T.react.length || T.injuredOff.length || M.phase === 'break'
    || (CHECKPOINTS.has(M.minute) && M.elapsed <= M.length) || (M.half % 2 === 0 && M.elapsed === M.length + 1)
    || goalkeeper(T)?.p.pos !== 'BR';
  if (!busy) return;
  const actions = plan(M, side, M.rng, false);
  if (actions.length) execute(M, side, actions, T.assistant ? 'assistant' : 'ai');
  T.react.length = 0;
  if (T.injuredOff.length) T.injuredOff = T.injuredOff.filter((x) => !x.subbedOff);
}

/**
 * Podpowiedź asystenta dla gracza (np. po czerwonej kartce lub kontuzji): lista działań bez wykonywania
 * i bez losowania. Każde działanie można wykonać przez applySuggestion.
 */
export function assistantSuggest(M, side) {
  return plan(M, side, ADVICE_RNG, true);
}

/** Wykonuje działanie z assistantSuggest (zmiana albo taktyka) jako decyzję gracza. */
export function applySuggestion(M, side, action) {
  if (action.type === 'sub') {
    return substitute(M, side, action.outId, action.inId, action.text, { by: 'user', why: action.why, moveId: action.moveId, concussion: action.concussion || undefined });
  }
  if (action.type === 'tactic') { changeTactics(M, side, action.patch, { by: 'user', reason: action.reason }); return { ok: true }; }
  return { ok: false, error: 'Nieznane działanie.' };
}

/** Hak silnika: bramkarz AI wykluczony lub kontuzjowany; rezerwowy bramkarz od razu, jeśli pozwalają limity. */
function onGoalkeeperLost(M, T, cause) {
  if (!subsAvailable(M, T)) return false;
  const gk = T.bench.filter((b) => b.p.pos === 'BR' && !b.injury && !b.sentOff).sort((a, b) => b.R.GK - a.R.GK)[0];
  if (!gk) return false;
  const st = matchState(M, T.side);
  const out = cause === 'injury' && T.injuredGk && !T.injuredGk.subbedOff ? T.injuredGk : leastNeeded(T, st);
  if (!out) return false;
  const text = cause === 'injury' ? 'kontuzja bramkarza' : 'rezerwowy bramkarz za wykluczonego';
  return substitute(M, T.side, out.id, gk.id, text, { by: T.assistant ? 'assistant' : 'ai', why: 'gk' }).ok;
}

setCoachHooks({ onGoalkeeperLost });
