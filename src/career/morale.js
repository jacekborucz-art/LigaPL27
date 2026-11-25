// Morale zawodnika (1-20, start 12) i drużyny. Wpływa na siłę w meczu:
// 0.04*(morale-10) punktu atrybutu (teamStrength.conditionTerms). Tabela zdarzeń:
// docs/ekspert_futbol.md 9.6, rozszerzona o ocenę meczową i minuty. Wartości [SZAC].

import { clamp } from '../core/rng.js';

export const MORALE = { MIN: 1, MAX: 20, START: 12, DRIFT_TARGET: 12, DRIFT_WEEK: 0.3 };

// Kapitan (docs/kapitan.md, E z src/engine/captain.js): porażka x(1 - 0,1 E), wygrana z rywalem x(1 + 0,15 E), seria 3+ porażek
// -2 (przy E >= 0,6: -1,9), dryf w górę 0,3 + 0,1 E (E < 0: 0,3 + 0,1 E, min 0,2, a dryf w dół o 0,1 szybszy). [SZAC]
// Kalibracja (projekt: 0,2 / 0,2 / -1,5 dawał ok. 2,2-3 pkt różnicy): 4 porażki z rzędu i 3 tygodnie, E 0,75 wobec 0,15: +1,2 morale.
export const CAPTAIN_MORALE = { loss: 0.1, win: 0.15, streak: 2, streakSoft: 1.9, streakE: 0.6, drift: 0.1, driftNeg: 0.1, driftMin: 0.2, downNeg: 0.1 };

/**
 * Zmiana morale zawodnika po meczu.
 * m: { result: 'W'|'D'|'L', strengthDiff (nasza siła - rywala), derby, rival (mecz z rywalem), lossStreak, played, minutes,
 *      rating, benchedStreak, isRegular, capE (efekt kapitana klubu, docs/kapitan.md) }
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
  const E = m.capE ?? 0;
  const CM = CAPTAIN_MORALE;
  if (m.result === 'L' && (m.lossStreak ?? 0) >= 3) d -= E >= CM.streakE ? CM.streakSoft : CM.streak;
  // Kapitan: porażka boli mniej przy dobrym kapitanie (bardziej przy kapitanie w kryzysie), wygrana z rywalem cieszy bardziej
  if (E && m.result === 'L' && d < 0) d *= 1 - CM.loss * E;
  if (E && m.result === 'W' && d > 0 && (m.derby || m.rival)) d *= 1 + CM.win * E;
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

/**
 * Tygodniowy dryf ku 12. capE: efekt kapitana klubu (docs/kapitan.md): dobry kapitan przyspiesza powrót z niskiego morale,
 * kapitan w kryzysie (E < 0) go spowalnia i szybciej gasi dobre nastroje.
 */
export function weeklyDrift(value, capE = 0) {
  const CM = CAPTAIN_MORALE;
  const up = capE >= 0 ? MORALE.DRIFT_WEEK + CM.drift * capE : Math.max(CM.driftMin, MORALE.DRIFT_WEEK + CM.driftNeg * capE);
  const step = value < MORALE.DRIFT_TARGET ? up : MORALE.DRIFT_WEEK + (capE < 0 ? CM.downNeg : 0);
  if (Math.abs(value - MORALE.DRIFT_TARGET) <= step) return MORALE.DRIFT_TARGET;
  return value + (value < MORALE.DRIFT_TARGET ? step : -step);
}

// ------------------------------------------------------------ Historia morale (docs/historia-morale.md)
// p.moraleHist: morale w poniedziałki (przed tygodniowym dryfem, czyli stan po minionym tygodniu), najstarsze pierwsze,
// najwyżej WEEKS wpisów. Tylko informacja dla gracza: balans gry bez zmian. Stare zapisy: brak historii = brak trendu.
export const MORALE_HIST = { WEEKS: 8, TREND: 1, FAST_DROP: 4 };

/** Wpis tygodnia (poniedziałek, przed dryfem). */
export function recordMoraleWeek(p) {
  const h = p.moraleHist ?? [];
  h.push(Math.round((p.morale ?? MORALE.START) * 10) / 10);
  if (h.length > MORALE_HIST.WEEKS) h.splice(0, h.length - MORALE_HIST.WEEKS);
  p.moraleHist = h;
}

/**
 * Trend morale: obecne wobec wpisu sprzed 1-2 tygodni (przedostatni poniedziałek; przy jednym wpisie ostatni).
 * Zwraca { d, dir: 'up'|'down'|'flat', fast } albo null bez historii. fast: spadek o FAST_DROP i więcej.
 */
export function moraleTrend(p) {
  const h = p?.moraleHist;
  if (!h?.length) return null;
  const ref = h.length >= 2 ? h[h.length - 2] : h[h.length - 1];
  const d = Math.round(((p.morale ?? MORALE.START) - ref) * 10) / 10;
  return { d, dir: d >= MORALE_HIST.TREND ? 'up' : d <= -MORALE_HIST.TREND ? 'down' : 'flat', fast: d <= -MORALE_HIST.FAST_DROP };
}

/** Szybki spadek morale (do raportów, Rozmów i listy zadań). */
export const moraleFalling = (p) => !!moraleTrend(p)?.fast;

/** Seria do wykresu: wpisy tygodniowe i obecna wartość na końcu. */
export const moraleSeries = (p) => [...(p?.moraleHist ?? []), Math.round((p?.morale ?? MORALE.START) * 10) / 10];

/** Trend morale drużyny (te same 18 osób co teamMorale): obecna średnia wobec średniej z tych samych wpisów. */
export function teamMoraleTrend(players) {
  const top = [...players].filter((p) => p.moraleHist?.length).sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0)).slice(0, 18);
  if (top.length < 5) return null;
  const now = top.reduce((s, p) => s + (p.morale ?? MORALE.START), 0) / top.length;
  const was = top.reduce((s, p) => s + (p.moraleHist.length >= 2 ? p.moraleHist[p.moraleHist.length - 2] : p.moraleHist[p.moraleHist.length - 1]), 0) / top.length;
  const d = Math.round((now - was) * 10) / 10;
  return { d, dir: d >= 0.8 ? 'up' : d <= -0.8 ? 'down' : 'flat' };
}

/**
 * Skutek rozmowy tydzień później (Kadra > Rozmowy): wpis rozmowy w game.talks.log dostaje m7 = morale po 7 dniach.
 * Wywoływane codziennie (season.js, system recovery).
 */
export function talkFollowUp(game, date) {
  const t = Date.parse(`${date}T12:00:00Z`);
  for (const x of game.talks?.log ?? []) {
    if (x.kind !== 'talk' || x.m7 != null || x.m0 == null) continue;
    if ((t - Date.parse(`${x.date}T12:00:00Z`)) / 864e5 < 7) continue;
    const p = game.world?.players?.[x.playerId];
    x.m7 = p && p.clubId === game.clubId ? Math.round((p.morale ?? MORALE.START) * 10) / 10 : -1; // -1: odszedł z klubu
  }
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
