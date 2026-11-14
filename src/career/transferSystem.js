// System dnia „transfers” (kolejność 53: po karierze 50, sponsorach 51 i limicie kadry 52, przed aklimatyzacją 92).
// Nastawienie zawodników (poniedziałki), prośby o transfer (1. dnia miesiąca i poniedziałki), prekontrakty
// (propozycje 1. dnia Jan-May, decyzje w poniedziałki Jan-Jun, wcześniejsze transfery zimą), kupcy z zagranicy
// (poniedziałki w oknie), pula zawodników z zagranicy (uzupełnienie przed oknem) i przebieg transakcji (codziennie). Spec: docs/transfery.md.

import { registerDailySystem } from '../core/gameLoop.js';
import { windowOf } from './transfers.js';
import { ensureDeals, dealsDay } from './transferDeals.js';
import { ensurePre, aiPreProposals, preDecisions, earlySales } from './preContracts.js';
import { mindsetWeek, retireFreeAgents } from './mindset.js';
import { requestsMonth, requestsWeek } from './moveWish.js';
import { foreignWeek } from './foreignMarket.js';
import { ensureForeignPool, foreignPoolDay } from './foreignPool.js';

/** Leniwa inicjalizacja (stare zapisy). */
export function ensureTransferState(game) {
  if (!game.market) return;
  ensureDeals(game);
  ensurePre(game);
  ensureForeignPool(game); // zawodnicy z zagranicy: stary zapis dostaje pulę raz (foreignPool.js)
}

export function transfersDay(game, date) {
  ensureTransferState(game);
  const out = [];
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const month = Number(date.slice(5, 7));
  const first = date.endsWith('-01');
  const w = windowOf(date);
  foreignPoolDay(game, date); // uzupełnienie puli z zagranicy przed oknem
  if (dow === 1) mindsetWeek(game, date);
  if (first) { retireFreeAgents(game, date); out.push(...requestsMonth(game, date)); }
  if (dow === 1) out.push(...requestsWeek(game, date));
  if (first && month >= 1 && month <= 5) out.push(...aiPreProposals(game, date));
  if (dow === 1 && month >= 1 && month <= 6) out.push(...preDecisions(game, date));
  if (w && dow === 1) out.push(...earlySales(game, date));
  if (w && (dow === 1 || date === w.from)) out.push(...foreignWeek(game, date));
  out.push(...dealsDay(game, date));
  return out;
}

registerDailySystem({
  id: 'transfers', order: 53,
  run(game, date) {
    if (!game.world || !game.market || !game.season) return {};
    return { messages: transfersDay(game, date) };
  },
});
