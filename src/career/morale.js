// Morale zawodnika (1-20, start 12) i drużyny. Wpływa na siłę w meczu:
// 0.04*(morale-10) punktu atrybutu (teamStrength.conditionTerms). Tabela zdarzeń:
// docs/ekspert_futbol.md 9.6, rozszerzona o ocenę meczową i minuty. Wartości [SZAC].

import { clamp } from '../core/rng.js';

export const MORALE = { MIN: 1, MAX: 20, START: 12, DRIFT_TARGET: 12, DRIFT_WEEK: 0.3, DRIFT_WEEK_LEADER: 0.5 };

/**
 * Zmiana morale zawodnika po meczu.
 * m: { result: 'W'|'D'|'L', strengthDiff (nasza siła - rywala), derby, lossStreak, played, minutes,
 *      rating, benchedStreak, isRegular }
 */
export function afterMatchDelta(m) {
  let d = 0;
  if (m.tie) d += tieDelta(m.tie, m.strengthDiff ?? 0);
  else {
    if (m.result === 'W') d += m.strengthDiff < -1 ? 2.5 : 1.5;
    if (m.result === 'L') d -= m.strengthDiff > 1 ? 2.5 : 1.5;
    if (m.result === 'D') d += m.strengthDiff < -1 ? 0.6 : m.strengthDiff > 1 ? -0.6 : 0;
  }
  if (m.derby) d += m.result === 'W' ? 1.5 : m.result === 'L' ? -1.5 : 0; // razem z wynikiem daje +-3
  if (m.result === 'L' && (m.lossStreak ?? 0) >= 3) d -= 2;
  if (m.played && m.rating) d += clamp(0.3 * (m.rating - 6.6), -0.6, 0.6); // własny występ
  if (!m.played && m.isRegular && (m.benchedStreak ?? 0) >= 3) d -= 1; // ważny zawodnik bez gry
  return Math.round(d * 100) / 100;
}

/**
 * Morale po meczu rozstrzygającym (tieMood z season/cup.js; panel psycholog + trener) [SZAC]: trofeum daje euforię,
 * awans po karnych ulgę, przegrany finał żal, odpadnięcie faworyta boli bardziej niż odpadnięcie słabszego.
 */
function tieDelta(t, sd) {
  if (t.won) {
    if (t.legSplit) return 0.8; // awans mimo przegranego rewanżu
    let d = sd < -1 ? 2.5 : 1.5;
    if (t.promoted) d = 2.5 + 3;
    if (t.trophy) d += t.uefa ? 3 : t.super ? 1 : 2;
    if (t.pens && !t.trophy) d += 0.5;
    return d;
  }
  if (t.final) return -2.5 - (t.pens ? 0.5 : 1);
  if (t.legSplit) return -1; // wygrany rewanż, ale odpadnięcie
  if (t.pens) return -1.2;
  if (sd > 1) return -2.5 - (t.early ? 0.5 : 0);
  if (sd < -1) return -0.8;
  return -1.5;
}

export const EVENT_DELTA = {
  newContract: 3, transferRequestRefused: -3, contractRefused: -3, brokenPromise: -2.5,
  nationalCallUp: 1, nationalGoal: 1, awardMotm: 0.5, publicPraise: 1, publicCriticism: -1.5,
};

export function applyMorale(value, delta) {
  return clamp(Math.round((value + delta) * 100) / 100, MORALE.MIN, MORALE.MAX);
}

/** Tygodniowy dryf ku 12 (szybszy, gdy w drużynie jest lider). */
export function weeklyDrift(value, hasLeader = false) {
  const step = hasLeader ? MORALE.DRIFT_WEEK_LEADER : MORALE.DRIFT_WEEK;
  if (Math.abs(value - MORALE.DRIFT_TARGET) <= step) return MORALE.DRIFT_TARGET;
  return value + (value < MORALE.DRIFT_TARGET ? step : -step);
}

/** Morale drużyny: średnia 18 zawodników z największą liczbą minut. */
export function teamMorale(players) {
  const top = [...players].sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0)).slice(0, 18);
  if (!top.length) return MORALE.START;
  return Math.round((top.reduce((s, p) => s + (p.morale ?? MORALE.START), 0) / top.length) * 10) / 10;
}

export function moraleLabel(v) {
  return v >= 17 ? 'Znakomite' : v >= 14 ? 'Dobre' : v >= 10 ? 'Przeciętne' : v >= 6 ? 'Słabe' : 'Bardzo słabe';
}
