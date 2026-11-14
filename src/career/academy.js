// Akademia: trener przenosi wychowanka do pierwszego składu (menu zawodnika albo przycisk w profilu).
// Wychowanek dostaje pierwszy zawodowy kontrakt (pensja rynkowa jak przy awansie z akademii na koniec sezonu,
// src/season/rollover.js) do 30 czerwca za 3 lata. Do 21 lat nie liczy się do limitu kadry (src/career/squadLimit.js).
// Na koniec sezonu nadal działa automat: 19-latkowie z akademii przechodzą do kadry albo odchodzą z klubu.

import { clubById } from '../data/clubs_pl.js';
import { marketWage } from './negotiation.js';
import { payLevel } from '../data/finanse_klubow.js';

export const ACADEMY_PROMOTE = { minAge: 16, years: 3, maxSquad: 40 };

/** Czy wychowanka pid można dziś przenieść do pierwszego składu: { ok, text }. */
export function canPromote(game, pid) {
  const W = game?.world;
  const club = W?.clubs?.[game.clubId];
  const p = W?.players?.[pid];
  if (!p || !club?.academy?.includes(pid)) return { ok: false, text: 'Zawodnik nie jest w akademii twojego klubu.' };
  if ((p.age ?? 0) < ACADEMY_PROMOTE.minAge) return { ok: false, text: `Do pierwszego składu od ${ACADEMY_PROMOTE.minAge} lat.` };
  if (club.squad.length >= ACADEMY_PROMOTE.maxSquad) return { ok: false, text: `Kadra ma już ${club.squad.length} zawodników.` };
  return { ok: true, text: null };
}

/** Przenosi wychowanka do pierwszego składu. Zwraca { ok, text }. */
export function promoteYouth(game, pid) {
  const chk = canPromote(game, pid);
  if (!chk.ok) return chk;
  const W = game.world;
  const club = W.clubs[game.clubId];
  const p = W.players[pid];
  const c = clubById(game.clubId);
  const tier = Math.min(4, c?.tier ?? 3);
  club.academy = club.academy.filter((x) => x !== pid);
  club.squad.push(pid);
  p.squad = 'A';
  p.clubId = game.clubId;
  const y = Number(game.date.slice(0, 4)) + (game.date.slice(5) > '06-30' ? 1 : 0) + ACADEMY_PROMOTE.years - 1;
  p.contract = { wage: marketWage(p.ovr, tier, false, payLevel(c)), until: `${y}-06-30`, clause: 0, signedOn: game.date };
  p.wage = p.contract.wage;
  return { ok: true, text: `${p.name} w pierwszym składzie. Kontrakt do 30 czerwca ${y}.` };
}
