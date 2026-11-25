// System dnia „transfers” (kolejność 53: po karierze 50, sponsorach 51 i limicie kadry 52, przed aklimatyzacją 92).
// Nastawienie zawodników (poniedziałki), prośby o transfer (1. dnia miesiąca i poniedziałki), prekontrakty
// (propozycje 1. dnia Jan-May, decyzje w poniedziałki Jan-Jun, wcześniejsze transfery zimą), kupcy z zagranicy
// (poniedziałki w oknie), pula zawodników z zagranicy (uzupełnienie przed oknem), decyzje zawodników po namyśle
// (propozycje klubów, codziennie przed transakcjami), umowy wolnych poza oknem (dołączenie w dniu otwarcia okna,
// codziennie; kluby AI poza oknem w poniedziałki, src/career/lateJoins.js), odpowiedzi klubów na oferty klub-klub z ratami
// i premiami (codziennie, src/career/clubOffers.js) i przebieg transakcji (codziennie). Spec: docs/transfery.md.

import { registerDailySystem } from '../core/gameLoop.js';
import { windowOf } from './transfers.js';
import { ensureDeals, dealsDay } from './transferDeals.js';
import { ensurePre, aiPreProposals, preDecisions, earlySales } from './preContracts.js';
import { mindsetWeek, retireFreeAgents } from './mindset.js';
import { requestsMonth, requestsWeek } from './moveWish.js';
import { foreignWeek } from './foreignMarket.js';
import { ensureForeignPool, foreignPoolDay } from './foreignPool.js';
import { ensureProposals, proposalsDay } from './proposals.js'; // namysł zawodnika przed podpisem (docs/transfery.md, rozdz. 10)
import { ensureJoins, joinsDay, aiLateWeek } from './lateJoins.js'; // wolni zawodnicy poza oknem (docs/transfery.md)
import { ensureClubOffers, clubOffersDay } from './clubOffers.js'; // oferty klub-klub: odpowiedzi klubów, raty, premie (docs/transfery.md)

/** Leniwa inicjalizacja (stare zapisy). */
export function ensureTransferState(game) {
  if (!game.market) return;
  ensureDeals(game);
  ensurePre(game);
  ensureProposals(game); // stary zapis: brak game.market.pending
  ensureJoins(game); // stary zapis: brak game.market.joins
  ensureForeignPool(game); // zawodnicy z zagranicy: stary zapis dostaje pulę raz (foreignPool.js)
  ensureClubOffers(game); // stary zapis: market.talks jako oferty klub-klub
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
  out.push(...joinsDay(game, date)); // umowy wolnych poza oknem: dołączenie w pierwszym dniu okna
  if (!w && dow === 1) aiLateWeek(game, date); // kluby AI poza oknem: wolni zawodnicy tylko przy wyraźnej potrzebie
  out.push(...clubOffersDay(game, date)); // odpowiedzi klubów na oferty (gracz i AI), raty i premie z transferów
  out.push(...proposalsDay(game, date)); // przed transakcjami: zgoda w ostatnim dniu okna zdąży na zgłoszenie
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
