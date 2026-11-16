// Stan modułu treningu w zapisie gry (czysty JSON):
//   game.training  = { v, createdAt, lastMonth, lastWeek, staff, clubs, overrides, settings, reports, hist, lastClubMatch }
//   player.training = { focus, pos, prog, mode, log[28], logDate, acwr, legs, know, rh, minSeen, lastSeen, rtp, ovrHist[], stim{} }
// player.training mają tylko zawodnicy klubu gracza (kadra i akademia), więc zapis rośnie o ok. 30 małych obiektów.
// ensureTraining() działa też dla starych zapisów (migracja w miejscu, idempotentna).

import { addDays } from '../core/gameLoop.js';
import { squadOf, academyOf } from '../world/worldGen.js';
import { generateStaffFor } from './staff.js';
import { COH, LOAD } from './config.js';

export const TRAINING_VERSION = 1;

// Aktywna gra dla modyfikatorów silnika (rejestr modyfikatorów nie przekazuje stanu gry).
// Ustawiana przy każdym dniu gry, przy otwarciu ekranu treningu i przy przygotowaniu meczu.
let ACTIVE = null;
export function attachTraining(game) { ACTIVE = game ?? null; return game; }
export function activeGame() { return ACTIVE; }

const DAY = 86400000;
// Daty liczone wiele razy dziennie (plan dnia klubu gracza i 53 klubów AI): mała pamięć podręczna
const tCache = new Map();
const t = (iso) => {
  let v = tCache.get(iso);
  if (v === undefined) {
    if (tCache.size > 4096) tCache.clear();
    v = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    tCache.set(iso, v);
  }
  return v;
};
export const daysBetween = (a, b) => Math.round((t(b) - t(a)) / DAY);
export const weekdayIdx = (iso) => (new Date(t(iso)).getUTCDay() + 6) % 7; // 0 = poniedziałek
const monCache = new Map();
export const mondayOf = (iso) => {
  let v = monCache.get(iso);
  if (v === undefined) {
    if (monCache.size > 4096) monCache.clear();
    v = addDays(iso, -weekdayIdx(iso));
    monCache.set(iso, v);
  }
  return v;
};

/** Wiek w danym dniu z daty urodzenia (gdy jest), inaczej pole age. */
export function ageAt(p, date) {
  if (!p.birthDate || !date) return p.age ?? 25;
  const y = +date.slice(0, 4) - +p.birthDate.slice(0, 4);
  return date.slice(5) >= p.birthDate.slice(5) ? y : y - 1;
}

export function defaultPlayerTraining(p, date, { inSeason = false } = {}) {
  const base = inSeason ? LOAD.baselineDay + 10 : LOAD.baselineDay;
  return {
    focus: null, pos: null, prog: null, mode: 'normal',
    log: Array(28).fill(base), logDate: date, acwr: 1, legs: 0,
    know: 60, rh: 0.5, minSeen: p.season?.min ?? 0, lastSeen: p.lastMatch ?? null,
    rtp: 0, inj: (p.injuryDays ?? 0) > 0, injLen: p.injury?.days ?? 0, ovrHist: [p.ovr], stim: {},
  };
}

/** Kadra i akademia klubu gracza. */
export function userPlayers(game) {
  return [...squadOf(game.world, game.clubId), ...academyOf(game.world, game.clubId)];
}

/** Daty meczów klubu (posortowane, bez duplikatów). */
export function clubMatchDates(game, clubId = game.clubId) {
  const out = [];
  for (const f of game.fixtures || []) if (f.date && (f.home === clubId || f.away === clubId)) out.push(f.date);
  return [...new Set(out)].sort();
}

/** Inicjalizacja i migracja stanu treningu. Wywołanie wielokrotne niczego nie psuje. */
export function ensureTraining(game) {
  if (!game?.world) return null;
  attachTraining(game);
  const date = game.date ?? '2026-07-01';
  let T = game.training;
  if (!T || T.v !== TRAINING_VERSION) {
    T = game.training = {
      v: TRAINING_VERSION, createdAt: date, lastMonth: date.slice(0, 7), lastWeek: mondayOf(date),
      staff: {}, clubs: {}, overrides: {}, settings: { accent: 'zrownowazony', load: 'normalna' },
      reports: [], hist: {}, lastClubMatch: null, notes: {},
    };
  }
  const inSeason = (game.fixtures || []).some((f) => f.played && (f.home === game.clubId || f.away === game.clubId));
  for (const clubId of Object.keys(game.world.clubs)) {
    if (!T.staff[clubId]) T.staff[clubId] = generateStaffFor(game, clubId);
    else if (!T.staff[clubId].kierownik) T.staff[clubId].kierownik = generateStaffFor(game, clubId).kierownik; // stare zapisy: kierownik drużyny z ziarna gry
    if (!T.clubs[clubId]) {
      const mine = clubId === game.clubId;
      const form = mine ? (game.tactics?.formation ?? '4231') : '4231';
      T.clubs[clubId] = {
        form, fam: { [form]: COH.famStartCurrent + (inSeason ? 10 : 0) }, instr: 60, instrSnap: mine ? { ...(game.tactics?.instructions ?? {}) } : null,
        sp: COH.spNeutral, prep: null, z: 0, lastMatch: null,
      };
      if (!mine) T.clubs[clubId].z = aiClubZ(T.clubs[clubId]);
    }
  }
  for (const p of userPlayers(game)) if (!p.training) p.training = defaultPlayerTraining(p, date, { inSeason });
  return T;
}

/** Zgranie klubu AI (jedna liczba, odświeżana raz w tygodniu). */
export function aiClubZ(c) {
  const fam = c.fam[c.form] ?? COH.famMin;
  return Math.round((0.65 * fam + 0.35 * c.instr) * 10) / 10;
}
