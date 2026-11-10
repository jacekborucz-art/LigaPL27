// Obozy przygotowawcze: letni (lipiec, przed ligą) i zimowy (styczeń, przerwa zimowa).
// Gracz wybiera kierunek, długość (5-14 dni) i termin w przerwie bez meczów o punkty; koszt zależy od
// przychodu klubu i trafia do finansów jako 'camps'. Okres przygotowawczy buduje „formę bazową”:
// dzień obozu daje q punktów (jakość kierunku w danej porze), dzień treningu w klubie 0,45 latem i 0,3 zimą.
// Forma bazowa = punkty / cel (0,3-1,1) działa przez 3 tygodnie od startu rundy i wygasa przez kolejne 3:
// modyfikator siły 0,4 * (forma - 1), wolniejsza ostrość i więcej urazów treningowych przy braku przygotowania.
// Kluby AI jadą na obóz same, według prestiżu i ligi (jedno losowanie na klub i rundę).

import { Rng, clamp } from '../core/rng.js';
import { addDays } from '../core/gameLoop.js';
import { SEASON_YEAR, SEASON_START, DOMESTIC } from '../config/calendar2026.js';
import { clubById } from '../data/clubs_pl.js';
import { book, wageBill, FIN } from '../career/finance.js';
import { CAMP } from './config.js';
import { daysBetween } from './state.js';

const TIER_COMP = { 1: 'ekstraklasa', 2: 'liga1', 3: 'liga2' };
const r1000 = (v) => Math.round(v / 1000) * 1000;

/** Daty meczów o punkty klubu (bez sparingów), posortowane. */
export function officialDates(game, clubId = game.clubId) {
  const out = [];
  for (const f of game.fixtures || []) if (f.date && f.comp !== 'friendly' && (f.home === clubId || f.away === clubId)) out.push(f.date);
  return [...new Set(out)].sort();
}

/** Która runda się przygotowuje: lato do końca września, potem zima. */
export const halfOf = (date) => (date < `${SEASON_YEAR}-10-01` ? 'summer' : 'winter');
export const halfKey = (half) => `${SEASON_YEAR}-${half === 'summer' ? 'L' : 'Z'}`;
export const HALF_NAMES = { summer: 'Obóz letni', winter: 'Obóz zimowy' };

function springStartFor(tier) {
  return DOMESTIC[TIER_COMP[tier]]?.springStart ?? DOMESTIC.ekstraklasa.springStart;
}

/**
 * Okno obozu: { half, key, open (początek przygotowań), start (pierwszy mecz rundy), from, to (możliwe dni obozu), prepDays }.
 * official: daty meczów o punkty (opcjonalnie, dla wydajności).
 */
export function campWindow(game, half, clubId = game.clubId, official = officialDates(game, clubId)) {
  const tier = clubById(clubId)?.tier ?? 1;
  let open; let start;
  if (half === 'summer') {
    open = SEASON_START;
    start = official.find((d) => d > SEASON_START) ?? DOMESTIC[TIER_COMP[tier]]?.start ?? addDays(SEASON_START, 23);
  } else {
    const ny = `${SEASON_YEAR + 1}-01-01`;
    const lastAutumn = [...official].reverse().find((d) => d < ny) ?? DOMESTIC.lowerAutumnEnd ?? `${SEASON_YEAR}-12-14`;
    start = official.find((d) => d >= ny) ?? springStartFor(tier);
    open = [addDays(lastAutumn, 12), `${SEASON_YEAR + 1}-01-02`, addDays(start, -40)].sort().pop();
  }
  const from = addDays(open, 1);
  const to = addDays(start, -2);
  const prepDays = Math.max(0, Math.min(half === 'summer' ? 30 : 24, daysBetween(open, start)));
  return { half, key: halfKey(half), open, start, from, to, prepDays, length: Math.max(0, daysBetween(from, to) + 1) };
}

/** Przychód bazowy klubu (skala budżetu): z finansów albo z rachunku płac. */
export function clubBudgetBase(game, clubId) {
  return game.finance?.clubs?.[clubId]?.base ?? Math.round(wageBill(game.world, clubId) * 52 * FIN.REVENUE_X_WAGES);
}

const clubTierOf = (id) => clubById(id)?.tier;
export function campCost(game, clubId, dest, days) {
  const d = CAMP.dests[dest];
  if (!d) return 0;
  const tier = game.world?.clubs?.[clubId] ? (clubTierOf(clubId) ?? 1) : 1;
  const standard = Math.min(1.3, Math.max(0.8, clubBudgetBase(game, clubId) / 60e6)); // budżet ok. 60 mln zł = standard 1,0
  const mul = ({ 1: 1, 2: 0.65, 3: 0.45 }[tier] ?? 0.45) * (tier === 1 ? standard : 1);
  return Math.max(5000, r1000(d.perDay * days * mul));
}

/** Szacowana forma bazowa (0,3-1,1) dla obozu: punkty z obozu i z treningu w klubie przez resztę okresu. */
export function estimateBase(half, dest, days, prepDays) {
  const q = dest ? CAMP.dests[dest]?.q[half] ?? 0 : 0;
  const homeDays = Math.max(0, prepDays - (dest ? days : 0)) * 0.75; // ok. 3 z 4 dni w klubie to trening
  const pts = (dest ? days * q : 0) + homeDays * CAMP.homeRate[half];
  return clamp(pts / CAMP.target(prepDays), CAMP.baseMin, CAMP.baseMax);
}

/** Wpływ formy bazowej na siłę (pkt atrybutu) w danym dniu od startu rundy. */
export function baseFactor(start, date) {
  const d = daysBetween(start, date);
  if (d < 0) return 0;
  if (d <= CAMP.fullDays) return 1;
  return Math.max(0, 1 - (d - CAMP.fullDays) / CAMP.fadeDays);
}
export const baseTerm = (base, factor) => (factor ? CAMP.effect * (base - 1) * factor : 0);

/** Rezerwacja obozu klubu gracza na daną rundę (lub null). */
export function bookingFor(game, key) {
  return (game.training?.camps ?? []).find((c) => c.key === key && !c.cancelled) ?? null;
}

/** Obóz gracza trwający w danym dniu (lub null). */
export function campOn(game, date) {
  for (const c of game.training?.camps ?? []) if (!c.cancelled && date >= c.from && date <= c.to) return c;
  return null;
}

/** Możliwe daty startu obozu o danej długości w oknie (co 2 dni, najwyżej 12). */
export function campStarts(game, half, days) {
  const w = campWindow(game, half);
  const out = [];
  let d = [w.from, addDays(game.date, 1)].sort().pop();
  for (; addDays(d, days - 1) <= w.to && out.length < 12; d = addDays(d, 2)) out.push(d);
  return out;
}

/** Rezerwacja obozu. Zwraca { ok, error?, camp? }. */
export function bookCamp(game, { half, dest, days, from }) {
  const T = game.training;
  const def = CAMP.dests[dest];
  days = Number(days);
  if (!def) return { ok: false, error: 'Nieznany kierunek obozu.' };
  if (!(days >= CAMP.minDays && days <= 14)) return { ok: false, error: 'Obóz trwa od 5 do 14 dni.' };
  const w = campWindow(game, half);
  if (bookingFor(game, w.key)) return { ok: false, error: 'Ten obóz jest już zarezerwowany. Najpierw go odwołaj.' };
  const to = addDays(from, days - 1);
  if (!from || from <= game.date) return { ok: false, error: 'Obóz musi zacząć się w przyszłości.' };
  if (from < w.from || to > w.to) return { ok: false, error: 'Obóz musi zmieścić się w przerwie bez meczów o punkty.' };
  const clash = (game.fixtures || []).some((f) => f.comp !== 'friendly' && (f.home === game.clubId || f.away === game.clubId) && f.date >= from && f.date <= to);
  if (clash) return { ok: false, error: 'W tym terminie drużyna gra mecz o punkty.' };
  const cost = campCost(game, game.clubId, dest, days);
  const fin = game.finance?.clubs?.[game.clubId];
  if (fin && fin.balance < cost) return { ok: false, error: 'Klub nie ma tylu pieniędzy na koncie.' };
  const camp = { key: w.key, half, dest, days, from, to, cost, q: def.q[half], bookedOn: game.date, place: def.name };
  if (game.finance) book(game.finance, game.clubId, game.date, 'out', 'camps', cost, `${HALF_NAMES[half]}: ${def.name}`);
  T.camps = [...(T.camps ?? []).filter((c) => c.key !== w.key), camp].slice(-6);
  return { ok: true, camp };
}

/** Odwołanie obozu przed wyjazdem (koszt wraca na konto). */
export function cancelCamp(game, key) {
  const c = bookingFor(game, key);
  if (!c || c.from <= game.date) return { ok: false, error: 'Tego obozu nie da się już odwołać.' };
  if (game.finance) book(game.finance, game.clubId, game.date, 'out', 'camps', -c.cost, `Odwołany obóz: ${c.place}`);
  c.cancelled = true;
  return { ok: true };
}

/** Przewidywane skutki obozu (ekran „Obozy”). */
export function campPreview(game, half, dest, days) {
  const w = campWindow(game, half);
  const base = estimateBase(half, dest, days, w.prepDays);
  const none = estimateBase(half, null, 0, w.prepDays);
  const q = dest ? CAMP.dests[dest].q[half] : 0;
  return {
    window: w, base, none, q,
    cost: dest ? campCost(game, game.clubId, dest, days) : 0,
    term: baseTerm(base, 1), noneTerm: baseTerm(none, 1),
    inCamp: {
      injury: 1 - CAMP.inCamp.injury * q, dev: 1 + CAMP.inCamp.dev * q, fatigue: 1 - CAMP.inCamp.fatigue * q,
      cohesion: 1 + CAMP.inCamp.cohesion * q, morale: CAMP.inCamp.morale * q,
    },
  };
}

/** Wybór obozu przez klub AI: zależny od prestiżu i ligi (deterministyczny). */
export function aiCampChoice(game, clubId, half) {
  const club = clubById(clubId);
  const rng = new Rng(`oboz:${game.seed}:${halfKey(half)}:${clubId}`);
  const tier = club?.tier ?? 3;
  const money = (club?.prestige ?? 3) + (tier === 1 ? 2 : tier === 2 ? 0 : -2) + rng.gauss(0, 1.2);
  let dest = null; let days = 0;
  if (half === 'winter') {
    if (money >= 9) { dest = rng.chance(0.75) ? 'turcja' : 'hiszpania'; days = rng.int(10, 14); }
    else if (money >= 6) { dest = 'turcja'; days = rng.int(8, 12); }
    else if (money >= 3.5) { dest = rng.chance(0.5) ? 'turcja' : 'polska'; days = rng.int(7, 10); }
    else if (rng.chance(0.6)) { dest = 'polska'; days = 7; }
  } else if (money >= 7) { dest = rng.chance(0.6) ? 'austria' : 'slowenia'; days = rng.int(8, 12); }
  else if (money >= 4) { dest = rng.chance(0.5) ? 'slowenia' : 'polska'; days = rng.int(7, 10); }
  else if (rng.chance(0.6)) { dest = 'polska'; days = 7; }
  return { dest, days };
}

/** Klub AI: forma bazowa na rundę (jedna liczba), liczona raz na rundę w kroku tygodniowym. */
export function aiCampBase(game, clubId, half) {
  const tier = clubById(clubId)?.tier ?? 1;
  const start = half === 'summer' ? DOMESTIC[TIER_COMP[tier]]?.start ?? addDays(SEASON_START, 23) : springStartFor(tier);
  const prepDays = half === 'summer' ? Math.min(30, daysBetween(SEASON_START, start)) : 24;
  const { dest, days } = aiCampChoice(game, clubId, half);
  return { key: halfKey(half), base: Math.round(estimateBase(half, dest, days, prepDays) * 100) / 100, start, dest, days };
}
