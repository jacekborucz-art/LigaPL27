// Moduł treningu: rejestruje system dnia (po regeneracji z season.js) i modyfikatory silnika.
// Zasada rozbudowy bez przebudowy (PLAN 4.1): pętla dni i silnik nie znają treningu.
//  - dzień: plan i zajęcia klubu gracza (sessions.js),
//  - poniedziałek: zbiorczy krok klubów AI (zgranie, urazy treningowe) i porządki,
//  - 1. dzień miesiąca: rozwój i spadek całego świata + raport dla gracza (development.js).
// Modyfikatory: zgranie, analiza rywala, obciążenie (ciężkie nogi, przeciążenie), stałe fragmenty.

import { Rng } from '../core/rng.js';
import { registerDailySystem, unregisterDailySystem } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { registerModifier, unregisterModifier } from '../engine/modifiers.js';
import { isAvailable } from '../career/squad.js';
import { squadOf } from '../world/worldGen.js';
import { INJURY_TYPES } from '../engine/match/constants.js';
import { fmtDate } from '../ui/dom.js';
import { LOAD, staffMul } from './config.js';
import { ensureTraining, attachTraining, activeGame, weekdayIdx, daysBetween } from './state.js';
import { staffQ, reportPrecision } from './staff.js';
import { pruneOverrides } from './plan.js';
import { aiCampBase, halfOf, halfKey, baseFactor, baseTerm } from './camps.js';
import { addDays } from '../core/gameLoop.js';
import { processUserDay } from './sessions.js';
import { monthlyDevelopment } from './development.js';
import { cohesionTerm, prepTerm, setPieceEdge, aiWeeklyCohesion, weeklyCohesionDecay } from './cohesion.js';
import { legsTerm, overloadTerm } from './load.js';

// Forma bazowa po okresie przygotowawczym: jedna liczba na klub i dzień (pamięć podręczna, tanio w meczu)
const campCache = new Map();
export function campTerm(game, p) {
  const c = game?.training?.clubs?.[p.clubId];
  const cb = c?.cb;
  if (!cb) return 0;
  const k = `${p.clubId}:${cb.key}`;
  let e = campCache.get(k);
  if (!e || e.date !== game.date) {
    e = { date: game.date, v: baseTerm(cb.base, baseFactor(cb.start, game.date)) };
    campCache.set(k, e);
  }
  return e.v;
}

const MONTHS_PL = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const msg = (date, from, priority, subject, body, key) => createMessage({ date, key, category: 'staff', from, subject, body, priority });

/** Tygodniowy krok: kluby AI (zgranie, urazy na treningu), zapominanie, ostrzeżenia o obciążeniu. */
export function weeklyStep(game, date, rng) {
  const T = game.training;
  const messages = [];
  const from = date.slice(0, 10);
  const matches = {};
  for (const f of game.fixtures || []) {
    if (!f.played || f.date >= from || daysBetween(f.date, from) > 7) continue;
    matches[f.home] = (matches[f.home] ?? 0) + 1;
    if (f.away) matches[f.away] = (matches[f.away] ?? 0) + 1;
  }
  const half = halfOf(date);
  const key = halfKey(half);
  for (const clubId of Object.keys(game.world.clubs)) {
    if (clubId === game.clubId) continue;
    aiWeeklyCohesion(game, clubId, matches[clubId] ?? 0);
    // Obóz klubu AI: jedna decyzja na rundę, według prestiżu i ligi
    const c = T.clubs[clubId];
    if (c.cb?.key !== key) {
      const cb = aiCampBase(game, clubId, half);
      if (date >= addDays(cb.start, -10)) c.cb = cb;
    }
    // Urazy na treningu w klubie AI: ta sama średnia co u gracza (0,15 % na zawodnika na dzień, 5 dni)
    const pool = squadOf(game.world, clubId).filter(isAvailable);
    const lambda = pool.length * 5 * LOAD.injBase * staffMul.inj(staffQ(game, clubId, 'fizyczny'));
    const k = rng.poisson(lambda);
    for (let i = 0; i < k && pool.length; i++) {
      const p = rng.weighted(pool, (x) => 1.5 - 0.05 * (x.hidden?.ODP ?? 10));
      if (p.injuryDays > 0) continue;
      const cat = rng.next() < LOAD.injuryCats.light ? 'light' : 'medium';
      const [name, lo, hi] = rng.pick(INJURY_TYPES[cat]);
      const days = rng.int(lo, hi);
      p.injuryDays = days;
      p.injury = { name, days, cat, since: date, training: true };
    }
  }
  const c = T.clubs[game.clubId];
  if (c) {
    weeklyCohesionDecay(c);
    if (c.prep && c.prep.date < date) c.prep = null;
    const over = squadOf(game.world, game.clubId).filter((p) => (p.training?.acwr ?? 1) > 1.5 && !(p.injuryDays > 0));
    if (over.length) {
      messages.push(msg(date, 'Trener przygotowania fizycznego', 'info', 'Przeciążeni zawodnicy',
        `Obciążenie z ostatnich 7 dni przekracza 1,5 raza średnią z 28 dni: ${over.map((p) => `${p.name} (${p.training.acwr.toFixed(2)})`).join(', ')}. Ryzyko urazu jest 2-4 razy wyższe, a forma spada. Proponuję lżejszy trening albo odpoczynek.`,
        `acwr:${date}`));
    }
  }
  pruneOverrides(game);
  return messages;
}

function reportBody(report, game) {
  const q = staffQ(game, game.clubId, 'asystent');
  const prec = reportPrecision(q);
  const fmt = (r) => {
    if (prec === 'vague') return `${r.name}`;
    const d = prec === 'exact' ? `${r.d > 0 ? '+' : ''}${r.d.toFixed(1)}` : r.d > 0 ? 'w górę' : 'w dół';
    const attrs = prec === 'exact' && r.attrs.length ? ` (${r.attrs.map(([a, v]) => `${a} ${v > 0 ? '+' : ''}${v}`).join(', ')})` : '';
    return `${r.name}: ${d}${attrs}`;
  };
  const up = report.rows.filter((r) => r.d > 0 || (r.d === 0 && r.trend > 0)).slice(0, 5);
  const down = report.rows.filter((r) => r.d < 0 || (r.d === 0 && r.trend < 0)).sort((a, b) => a.d - b.d || a.trend - b.trend).slice(0, 5);
  const lines = [
    up.length ? `Rosną: ${up.map(fmt).join('; ')}.` : 'W tym miesiącu nikt wyraźnie nie urósł.',
    down.length ? `Spadają: ${down.map(fmt).join('; ')}.` : 'Nikt wyraźnie nie stracił formy fizycznej.',
  ];
  if (report.spurts.length) lines.push(`Skok rozwojowy: ${report.spurts.map((s) => s.name).join(', ')}. Ich potencjał wyraźnie wzrósł.`);
  if (prec !== 'exact') lines.push(prec === 'approx' ? 'Raport jest przybliżony (lepszy asystent poda dokładne liczby).' : 'Asystent ocenia rozwój tylko ogólnie.');
  return lines.join('\n');
}

/** Miesięczny krok rozwoju i raport dla gracza. */
export function monthlyStep(game, date) {
  const T = game.training;
  const report = monthlyDevelopment(game, date);
  T.reports = [report, ...(T.reports ?? [])].slice(0, 6);
  if (!game.world.clubs[game.clubId]) return [];
  const [y, m] = report.month.split('-').map(Number);
  const prevMonth = MONTHS_PL[(m + 10) % 12];
  return [msg(date, 'Asystent trenera', 'info', `Raport rozwoju: ${prevMonth} ${m === 1 ? y - 1 : y}`, reportBody(report, game), `devrep:${report.month}`)];
}

export const DAILY_SYSTEM = {
  id: 'training', order: 95,
  run(game, date) {
    if (!game?.world || !game.clubId) return {};
    const T = ensureTraining(game);
    const rng = new Rng(`trening:${game.seed}:${date}`);
    const messages = [];
    if (game.world.clubs[game.clubId]) messages.push(...processUserDay(game, date, rng));
    if (weekdayIdx(date) === 0 && T.lastWeek !== date) { messages.push(...weeklyStep(game, date, rng)); T.lastWeek = date; }
    if (date.slice(0, 7) !== T.lastMonth) { messages.push(...monthlyStep(game, date)); T.lastMonth = date.slice(0, 7); }
    return { messages };
  },
};

export const MODIFIERS = [
  { id: 'trainingCohesion', scope: 'player', label: 'Zgranie drużyny', apply: (p) => cohesionTerm(activeGame(), p) },
  { id: 'trainingPrep', scope: 'player', label: 'Analiza rywala', apply: (p) => prepTerm(activeGame(), p) },
  { id: 'trainingLoad', scope: 'player', label: 'Obciążenie treningowe', apply: (p) => (p.training ? legsTerm(p.training) + overloadTerm(p.training) : 0) },
  { id: 'trainingCamp', scope: 'player', label: 'Forma bazowa (obóz)', apply: (p) => campTerm(activeGame(), p) },
  {
    id: 'trainingSetPieces', scope: 'player', label: 'Stałe fragmenty (trening)',
    enabled: (ctx) => !ctx.inMatch, // w pełnym silniku działa przez dane wejściowe (trainingMatchInput)
    apply: (p) => { const c = activeGame()?.training?.clubs?.[p.clubId]; return c ? 0.05 * setPieceEdge(c) : 0; },
  },
];

let installed = false;
export function installTraining() {
  registerDailySystem(DAILY_SYSTEM);
  for (const m of MODIFIERS) registerModifier(m);
  installed = true;
}
export function uninstallTraining() {
  unregisterDailySystem(DAILY_SYSTEM.id);
  for (const m of MODIFIERS) unregisterModifier(m.scope, m.id);
  installed = false;
}
export const isInstalled = () => installed;

installTraining();

export { ensureTraining, attachTraining, fmtDate };
export { teamCohesion, trainingMatchInput, cohesionLabel } from './cohesion.js';
export { weekPlan, planDay, autoDay, dayContext, heavyBeforeMatch, setSession, removeSession, setRestDay, resetDay, resetWeek, PHASES, ROLE_LABELS } from './plan.js';
export { developPlayer, monthlyDevelopment, focusAttrs } from './development.js';
export { loadSummary, acwrLabel, trainingInjuryChance } from './load.js';
export { staffOf, staffQ, staffLabel } from './staff.js';
export { sessionPreview, processUserDay } from './sessions.js';
export { campWindow, campCost, campPreview, campStarts, bookCamp, cancelCamp, bookingFor, campOn, estimateBase, aiCampChoice, aiCampBase, halfOf, halfKey, HALF_NAMES, officialDates } from './camps.js';
export { friendlyPeriod, friendlyDates, friendlyOpponents, createFriendly, cancelFriendly, clubFriendlies, levelText } from './friendlies.js';
export { matchSets } from './plan.js';
