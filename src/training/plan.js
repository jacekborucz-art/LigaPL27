// Plan tygodnia: dni względem meczów (MD, MD+1, MD-1 ...), szablony mikrocykli dla 1 i 2 meczów w tygodniu,
// obóz przygotowawczy i urlop, plan asystenta oraz ręczne zmiany gracza.
// Plan asystenta liczy się na bieżąco z terminarza (nic nie trzeba zapisywać), a w zapisie są tylko
// ręczne zmiany gracza (game.training.overrides[data]). Przełożony mecz od razu zmienia plan.

import { addDays } from '../core/gameLoop.js';
import { SESSIONS, INT_ORDER, ACCENTS, LOAD_LEVELS } from './config.js';
import { clubMatchDates, daysBetween, weekdayIdx, mondayOf } from './state.js';
import { staffQ } from './staff.js';
import { officialDates, campOn } from './camps.js';

export const ROLE_LABELS = {
  MD: 'Dzień meczowy', 'MD+1': 'Dzień po meczu', 'MD+2': 'Drugi dzień po meczu', 'MD±1': 'Między meczami',
  'MD-1': 'Dzień przed meczem', 'MD-2': 'Dwa dni przed meczem', 'MD-3': 'Trzy dni przed meczem', 'MD-4': 'Cztery dni przed meczem',
  TR: 'Tydzień bez meczu', OBOZ: 'Obóz przygotowawczy', URLOP: 'Urlop',
};
export const PHASES = { sezon: 'Sezon', oboz: 'Okres przygotowawczy', przerwa: 'Przerwa w rozgrywkach', urlop: 'Urlop' };

export const MAX_SESSIONS = 3;
const s = (type, int = 'mid') => ({ type, int: SESSIONS[type]?.noIntensity ? 'low' : int });

/** Daty meczów klubu: wszystkie, o punkty i sparingi (liczone raz na dzień albo tydzień). */
export function matchSets(game) {
  const all = clubMatchDates(game);
  const official = officialDates(game);
  const off = new Set(official);
  return { all, official, friendly: new Set(all.filter((d) => !off.has(d))) };
}

function around(dates, date) {
  let prev = null; let next = null;
  for (const d of dates) {
    if (d < date) prev = d;
    else { next = d; break; }
  }
  return { prev, next, a: prev ? daysBetween(prev, date) : Infinity, b: next ? daysBetween(date, next) : Infinity };
}

function roleFor(a, b) {
  if (b === 0) return 'MD';
  if (a === 1 && b === 1) return 'MD±1';
  if (a === 1) return 'MD+1';
  if (b === 1) return 'MD-1';
  if (b === 2) return 'MD-2';
  if (a === 2) return 'MD+2';
  if (b === 3) return 'MD-3';
  if (b === 4) return 'MD-4';
  return 'TR';
}
const NEAR = new Set(['MD', 'MD±1', 'MD+1', 'MD-1']);

/**
 * Kontekst dnia: dni od ostatniego meczu (a) i do następnego (b), także sparingu; oa, ob: tylko mecze o punkty.
 * Sparing jest dniem meczowym (z rozruchem dzień wcześniej i regeneracją dzień później), ale nie przerywa
 * okresu przygotowawczego ani mikrocyklu przed meczem o punkty. Zarezerwowany obóz to zawsze okres „oboz”.
 */
export function dayContext(game, date, sets = matchSets(game)) {
  if (Array.isArray(sets)) sets = { all: sets, official: sets, friendly: new Set() };
  const all = around(sets.all, date);
  const off = around(sets.official, date);
  const { a, b } = all;
  const m = +date.slice(5, 7);
  const window = (m >= 6 && m <= 8) || m === 12 || m <= 2;
  let phase = 'sezon';
  if (off.a >= 10 && off.b >= 10) phase = window ? (off.b <= 24 ? 'oboz' : 'urlop') : 'przerwa';
  const camp = campOn(game, date);
  if (camp) phase = 'oboz';
  let role = roleFor(a, b);
  const friendlyNear = (all.next && sets.friendly.has(all.next)) || (all.prev && sets.friendly.has(all.prev));
  if (!NEAR.has(role) && friendlyNear) {
    role = roleFor(off.a, off.b);
    if (NEAR.has(role) && role !== 'MD+1' && role !== 'MD-1') role = 'TR';
  }
  if (!NEAR.has(role) && phase === 'oboz') role = 'OBOZ';
  if (!NEAR.has(role) && phase === 'urlop') role = 'URLOP';
  return {
    date, a, b, oa: off.a, ob: off.b, prev: all.prev, next: all.next, role, phase, camp,
    friendly: b === 0 && sets.friendly.has(date),
    matchesInWeek: sets.all.filter((d) => d >= mondayOf(date) && d <= addDays(mondayOf(date), 6)).length,
  };
}

// Tydzień bez meczu (np. przerwa na reprezentację): pełny mikrocykl rozwojowy
const FREE_WEEK = [s('sila', 'high'), s('technika'), s('wytrzymalosc', 'high'), s('taktyka'), s('gierki'), s('szybkosc'), null];
// Obóz: pierwsza część buduje bazę, druga podnosi intensywność; drugi trening w wybrane dni
const CAMP_EARLY = [[s('wytrzymalosc'), s('technika', 'low')], [s('sila')], [s('gierki'), s('taktyka', 'low')], [s('regeneracja', 'low')], [s('wytrzymalosc')], [s('gierki')], null];
const CAMP_LATE = [[s('wytrzymalosc', 'high'), s('technika', 'low')], [s('sila', 'high'), s('taktyka', 'low')], [s('gierki', 'high')], [s('regeneracja', 'low')], [s('szybkosc'), s('taktyka')], [s('gierki', 'high'), s('stale', 'low')], null];

function shift(int, by) {
  const i = Math.max(0, Math.min(2, INT_ORDER.indexOf(int) + by));
  return INT_ORDER[i];
}

/** Plan asystenta na dzień (bez ręcznych zmian). Zwraca { kind, sessions, role, phase, auto: true }. */
export function autoDay(game, date, ctx = dayContext(game, date)) {
  const T = game.training ?? {};
  const accent = ACCENTS[T.settings?.accent] ?? ACCENTS.zrownowazony;
  const loadShift = LOAD_LEVELS[T.settings?.load]?.shift ?? 0;
  const asst = staffQ(game, game.clubId, 'asystent');
  const analyst = staffQ(game, game.clubId, 'analityk');
  const wd = weekdayIdx(date);
  let sessions = [];
  let kind = 'train';
  switch (ctx.role) {
    case 'MD': kind = 'match'; break;
    case 'URLOP': kind = 'off'; break;
    case 'OBOZ': {
      const day = ((ctx.ob ?? ctx.b) >= 17 ? CAMP_EARLY : CAMP_LATE)[wd];
      if (day) sessions = day.map((x) => ({ ...x })); else kind = 'rest';
      break;
    }
    case 'MD+1': sessions = [s('regeneracja', 'low')]; if (ctx.b <= 2 && analyst >= 5) sessions.push(s('wideo')); break;
    case 'MD±1': sessions = [s('regeneracja', 'low'), s('wideo')]; break;
    case 'MD-1': sessions = [s(ctx.a === 2 ? 'rozruch' : accent['MD-1'], 'low')]; if (analyst >= 5) sessions.push(s('wideo')); break;
    case 'MD-2':
      sessions = ctx.a === 2 ? [s('taktyka', 'low')] : [s(accent['MD-2'], 'mid')];
      if (ctx.a !== 2 && asst >= 12 && sessions[0].type !== 'stale') sessions.push(s('stale', 'low'));
      if (analyst < 5 || asst >= 9) sessions.push(s('odprawa'));
      break;
    case 'MD+2': if (ctx.b === 3) sessions = [s('technika', 'mid')]; else kind = 'rest'; break;
    case 'MD-3': sessions = [s(accent['MD-3'], 'high')]; break;
    case 'MD-4': sessions = [s(accent['MD-4'], 'high')]; break;
    default: {
      const d = FREE_WEEK[wd];
      if (d) sessions = [{ ...d }]; else kind = 'rest';
    }
  }
  // Poziom obciążeń gracza przesuwa intensywność; dzień przed i po meczu są chronione
  const protectedRole = ['MD-1', 'MD+1', 'MD±1'].includes(ctx.role);
  sessions = sessions.map((x) => {
    let int = x.int;
    if (!protectedRole && !SESSIONS[x.type].noIntensity && x.type !== 'regeneracja') int = shift(int, loadShift);
    if (ctx.role === 'MD-1' || ctx.role === 'MD±1') int = 'low';
    if (ctx.role === 'MD-2' && int === 'high') int = 'mid';
    return { type: x.type, int };
  });
  return { date, kind, sessions, role: ctx.role, phase: ctx.phase, auto: true };
}

/** Plan dnia z ręczną zmianą gracza (jeśli jest). Dzień meczu zawsze jest meczem. */
export function planDay(game, date, ctx = dayContext(game, date)) {
  const auto = autoDay(game, date, ctx);
  const ov = game.training?.overrides?.[date];
  if (!ov || auto.kind === 'match') return auto;
  return { ...auto, kind: ov.sessions.length ? 'train' : 'rest', sessions: ov.sessions.map((x) => ({ ...x })), auto: false };
}

/** Siedem dni tygodnia od poniedziałku (do ekranu „Trening”). */
export function weekPlan(game, monday = mondayOf(game.date)) {
  const dates = matchSets(game);
  const fixtures = (game.fixtures || []).filter((f) => f.home === game.clubId || f.away === game.clubId);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const ctx = dayContext(game, date, dates);
    const day = planDay(game, date, ctx);
    return {
      ...day, ctx,
      match: day.kind === 'match' ? fixtures.find((f) => f.date === date) ?? null : null,
      past: date < game.date, today: date === game.date, editable: date > game.date && day.kind !== 'match',
      hist: game.training?.hist?.[date] ?? null,
    };
  });
}

/** Sprawdza, czy plan stawia ciężki trening dzień przed meczem (raport asystenta, testy). */
export function heavyBeforeMatch(game, date) {
  const ctx = dayContext(game, date);
  if (ctx.b !== 1) return false;
  return planDay(game, date, ctx).sessions.some((x) => x.int === 'high' && !SESSIONS[x.type].noIntensity);
}

// ------------------------------------------------------------ Ręczna edycja dnia
function validSession(x) {
  return x && SESSIONS[x.type] && INT_ORDER.includes(x.int);
}

/** Ustawia zajęcia w dniu (slot 0 lub 1). Zwraca true, gdy plan się zmienił. */
export function setSession(game, date, slot, patch) {
  if (date <= game.date) return false;
  const ctx = dayContext(game, date);
  if (ctx.role === 'MD') return false;
  const T = game.training;
  const cur = planDay(game, date, ctx).sessions;
  const next = cur.map((x) => ({ ...x }));
  const base = next[slot] ?? { type: 'technika', int: 'mid' };
  const merged = { ...base, ...patch };
  if (SESSIONS[merged.type]?.noIntensity) merged.int = 'low';
  if (!validSession(merged)) return false;
  if (slot >= next.length) next.push(merged); else next[slot] = merged;
  T.overrides[date] = { sessions: next.slice(0, MAX_SESSIONS) };
  return true;
}

export function removeSession(game, date, slot) {
  if (date <= game.date) return false;
  const cur = planDay(game, date).sessions.filter((_, i) => i !== slot);
  game.training.overrides[date] = { sessions: cur };
  return true;
}

export function setRestDay(game, date) {
  if (date <= game.date || dayContext(game, date).role === 'MD') return false;
  game.training.overrides[date] = { sessions: [] };
  return true;
}

export function resetDay(game, date) {
  if (!game.training.overrides[date]) return false;
  delete game.training.overrides[date];
  return true;
}

export function resetWeek(game, monday) {
  let changed = false;
  for (let i = 0; i < 7; i++) changed = resetDay(game, addDays(monday, i)) || changed;
  return changed;
}

/** Usuwa ręczne zmiany z przeszłości (porządek w zapisie). */
export function pruneOverrides(game) {
  const T = game.training;
  for (const d of Object.keys(T.overrides)) if (d < game.date) delete T.overrides[d];
  for (const d of Object.keys(T.hist)) if (daysBetween(d, game.date) > 35) delete T.hist[d];
}
