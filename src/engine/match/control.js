// Sterowanie meczem: zmiany (5 w 3 oknach, +1 i +1 okno w dogrywce, przerwa nie zużywa okna),
// zmiany taktyki (bezwładność), okrzyki (cooldown 8 min). Gracz, asystent gracza i AI rywala
// korzystają z tych samych funkcji, więc reguły obowiązują wszystkie strony. AI trenera: coach.js.

import { emit, ensureGoalkeeper } from './core.js';
import { onPitch, applyTacticChange, goalkeeper, fieldPlayers } from './teams.js';
import { INSTRUCTIONS } from '../../data/instructions.js';
import { SHOUTS, SHOUT_COOLDOWN, SHOUT_DURATION, K } from './constants.js';

const last = (x) => x.p.last ?? x.p.name;

/** Zmiana po wstrząśnieniu mózgu (protokół IFAB, tylko gdy rozgrywki go stosują: ctx.concussionSubs). */
export function isConcussionSub(M, T, out) {
  return !!M.ctx.concussionSubs && !!out?.injury && /wstrząśnienie/.test(out.injury.name) && T.concussionUsed < K.concussionMax;
}

/** Czy zmiana jest teraz możliwa; zwraca komunikat błędu albo null. opts.concussion: zmiana poza limitem. */
export function canSubstitute(M, side, outId, inId, opts = {}) {
  const T = M.teams[side];
  if (M.ended) return 'Mecz się zakończył.';
  const out = T.players.find((x) => x.id === outId && (x.on || x.injury) && !x.sentOff && !x.subbedOff);
  if (!out) return 'Tego zawodnika nie ma na boisku.';
  const inc = T.bench.find((x) => x.id === inId);
  if (!inc) return 'Tego zawodnika nie ma na ławce.';
  if (inc.sentOff) return 'Ten zawodnik dostał czerwoną kartkę na ławce.';
  if (opts.concussion) return isConcussionSub(M, T, out) ? null : 'Ta zmiana nie jest zmianą po wstrząśnieniu mózgu.';
  if (T.subsUsed >= T.subsLimit) return `Wykorzystano wszystkie zmiany (${T.subsLimit}).`;
  const breakTime = M.phase === 'break';
  const sameWindow = T.windowMinute === M.tick;
  if (!breakTime && !sameWindow && T.windowsUsed >= T.windowsLimit) return `Wykorzystano wszystkie okna zmian (${T.windowsLimit}).`;
  return null;
}

/** Czy drużyna może teraz zrobić zmianę (limit zmian i okien, bez wskazania zawodników). */
export function subsAvailable(M, T) {
  if (M.ended || T.subsUsed >= T.subsLimit) return 0;
  if (M.phase !== 'break' && T.windowMinute !== M.tick && T.windowsUsed >= T.windowsLimit) return 0;
  return T.subsLimit - T.subsUsed;
}

/** Wolny slot formacji (np. po wykluczeniu), gdy trzeba gdzieś ustawić wchodzącego. */
function freeSlot(T) {
  const taken = new Set(fieldPlayers(T).map((x) => `${x.slot?.pos}|${x.slot?.x}|${x.slot?.y}`));
  return T.formation.slots.find((s) => s.pos !== 'BR' && !taken.has(`${s.pos}|${s.x}|${s.y}`)) ?? T.formation.slots[T.formation.slots.length - 1];
}

/**
 * Zmiana zawodnika. opts: { by: 'user'|'ai'|'assistant', why: kod powodu, concussion, moveId }
 * moveId: zawodnik z boiska, który przechodzi na miejsce schodzącego, a wchodzący zajmuje jego slot.
 * Bramkarz rezerwowy zawsze staje w bramce; zawodnik z pola, który bronił awaryjnie, wraca na swoje miejsce.
 * Zdarzenie 'sub': { outId, inId, why, by, pos, gk, concussion, moveId, text }.
 */
export function substitute(M, side, outId, inId, reason = '', opts = {}) {
  const concussion = opts.concussion ?? isConcussionSub(M, M.teams[side], M.teams[side].players.find((x) => x.id === outId));
  const err = canSubstitute(M, side, outId, inId, { concussion });
  if (err) return { ok: false, error: err };
  const T = M.teams[side];
  const out = T.players.find((x) => x.id === outId);
  const inc = T.bench.find((x) => x.id === inId);
  if (concussion) {
    T.concussionUsed++;
    const O = M.teams[1 - side];
    O.subsLimit++; O.windowsLimit++; // rywal dostaje dodatkową zmianę i okno (protokół IFAB)
  } else {
    if (M.phase !== 'break' && T.windowMinute !== M.tick) { T.windowsUsed++; T.windowMinute = M.tick; M.halfCounts.windows++; }
    T.subsUsed++;
  }
  const keeper = goalkeeper(T);
  const outWasOn = out.on;
  out.on = false; out.subbedOff = true; out.minOff = M.minute;
  let slot = out.slot;
  const mover = opts.moveId ? fieldPlayers(T).find((x) => x.id === opts.moveId && x !== out && x.slot?.pos !== 'BR') : null;
  if (inc.p.pos === 'BR' && keeper && keeper !== out && keeper.p.pos !== 'BR') {
    // Rezerwowy bramkarz za zawodnika z pola: awaryjny bramkarz wraca na swoją pozycję
    slot = keeper.slot;
    keeper.slot = keeper.prevSlot ?? out.slot;
    keeper.prevSlot = null;
  } else if (inc.p.pos === 'BR' && !keeper) {
    // Bramkarz wykluczony: rezerwowy bramkarz wchodzi za zawodnika z pola i staje w bramce
    slot = { ...(T.formation.slots.find((s) => s.pos === 'BR') ?? { pos: 'BR', side: null, x: 50, y: 5 }) };
  } else if (out.slot?.pos === 'BR' && keeper && keeper !== out && inc.p.pos !== 'BR') {
    // Kontuzjowany bramkarz schodzi, w bramce już stoi zawodnik z pola: wchodzący gra w polu
    slot = keeper.prevSlot ?? freeSlot(T);
    keeper.prevSlot = null;
  } else if (mover) {
    slot = mover.slot;
    mover.slot = out.slot;
  }
  const same = (a, b) => a && b && a.pos === b.pos && a.x === b.x && a.y === b.y;
  if (!outWasOn && slot?.pos !== 'BR' && fieldPlayers(T).some((x) => x !== inc && same(x.slot, slot))) slot = freeSlot(T); // slot zajęty po przestawieniu
  inc.slot = slot; inc.on = true; inc.minOn = M.minute;
  T.bench = T.bench.filter((x) => x !== inc);
  T.players.push(inc);
  if (!goalkeeper(T)) ensureGoalkeeper(M, T);
  const by = opts.by ?? 'user';
  if (by === 'user') T.lastUserTick = M.tick;
  const why = opts.why ?? (concussion ? 'concussion' : null);
  emit(M, 'sub', side, inc, {
    outId: out.id, inId: inc.id, why, by, pos: inc.slot?.pos ?? null, gk: inc.p.pos === 'BR', concussion, moveId: mover?.id ?? null, atBreak: M.phase === 'break',
    text: `Zmiana: wchodzi ${last(inc)}, schodzi ${last(out)}${reason ? ` (${reason})` : ''}${mover ? `; ${last(mover)} przechodzi na pozycję ${out.slot?.pos}` : ''}.`,
  });
  return { ok: true };
}

/** Opis zmiany instrukcji dla relacji, np. „Nastawienie: Do przodu, Tempo: Szybkie”. */
export function describePatch(T, patch) {
  const parts = [];
  if (patch.formation || patch.drop) parts.push(`ustawienie ${T.shape ?? T.formation.name}`);
  for (const [k, v] of Object.entries(patch.instructions ?? {})) {
    const ins = INSTRUCTIONS.find((i) => i.id === k);
    const opt = ins?.options.find((o) => o.id === v);
    if (ins && opt) parts.push(`${ins.label.toLowerCase()}: ${opt.label}`);
  }
  return parts.join(', ');
}

/**
 * Zmiana taktyki. patch: { formation?, instructions?, drop? }. opts: { by, reason }.
 * Zdarzenie 'tactic': { patch, by, reason, formation, shape, cost, text }.
 */
export function changeTactics(M, side, patch, opts = {}) {
  const T = M.teams[side];
  const r = applyTacticChange(T, M, patch);
  const by = opts.by ?? 'user';
  if (by === 'user') T.lastUserTick = M.tick;
  const what = describePatch(T, patch);
  emit(M, 'tactic', side, null, {
    patch, by, reason: opts.reason ?? null, formation: T.formation.id, shape: T.shape ?? T.formation.name, cost: r.cost, atBreak: M.phase === 'break',
    text: `${what ? `Zmiana taktyki: ${what}` : 'Zmiana instrukcji taktycznych'}${opts.reason ? ` (${opts.reason})` : ''}.`,
  });
  return r;
}

export function canShout(M, side, id) {
  const T = M.teams[side];
  const s = SHOUTS[id];
  if (!s) return 'Nieznany okrzyk.';
  if (T.coachBanned) return 'Trener został odesłany na trybuny: okrzyki z linii bocznej są niemożliwe.';
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
