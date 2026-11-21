// Rynek transferowy (etap 9, poziom średni, PLAN 2.5): listy (transferowa, do wypożyczenia, wolni,
// wyszukiwarka), oferty gracza dla klubów AI i odpowiedzi klubów, oferty klubów AI za zawodników gracza,
// transfery między klubami AI, wolni zawodnicy, rozwiązanie kontraktu, przedłużenia AI.
// Kontrakt z zawodnikiem negocjuje ekran rozmów (src/ui/negotiationView.js) albo aiNegotiate. Udane rozmowy to
// propozycja dla zawodnika, który namyśla się 2-5 dni (src/career/proposals.js), potem transakcja (transferDeals.js).

import { Rng } from '../core/rng.js';
import { addMessages } from '../core/inbox.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { l3GroupFor } from '../season/leagues.js';
import { DOMESTIC, SEASON_END, SEASON_YEAR } from '../config/calendar2026.js';
import { genPlayer, marketValue } from '../world/playerGen.js';
import { SQUAD_LAYOUT, squadOf, academyOf } from '../world/worldGen.js';
import { pickNationality } from '../data/names.js';
import { GROUP, SQUAD_TARGETS, SQUAD_SIZE, transferListCandidates, squadDeficits } from './squad.js';
import { askingPriceMultiplier, willingnessToJoin, clubReputation } from './reputation.js';
import { aiNegotiate, marketWage } from './negotiation.js';
import { payLevel } from '../data/finanse_klubow.js';
import { book, spendable, wageRoom, wageBill } from './finance.js';
import { squadCount, canSign, boardTargets } from './squadLimit.js';
import { spellsOf, syncSpell } from '../season/history.js';
import { boardCaps, clubBoardData, feeIssues, checkUserFee } from './boardRequests.js'; // weto zarządu (docs/finanse.md)
import { makeLoan, dropLoanIndex, requestLoanIn, firstRefusal } from './loans.js'; // wypożyczenia (docs/wypozyczenia.md)
import { startDeal, hasOpenDeal, pendingFees, stat } from './transferDeals.js'; // transfer jako proces (docs/transfery.md)
import { ensureForeignPool, isPoolContracted, foreignAskingPrice, poolSellerClub, poolCandidates, offerForForeign, poolList, scoutBlocked, scoutCommission, scoutedGroup } from './foreignPool.js'; // zawodnicy z zagranicy (docs/transfery.md, rozdz. 9)
import { onOfferRejected, onUserRejected } from './moveWish.js';
import { effectiveAsk } from './mindset.js';
import { makeProposal, proposalsFor, resolveNow } from './proposals.js'; // namysł zawodnika przed podpisem (docs/transfery.md, rozdz. 10)
import { clubNegotiation, contestPenalty } from './clubNegotiation.js'; // ukryty atrybut Negocjacje klubów AI (docs/negocjacje.md, rozdz. 15)
import { rynMul, kadFeeMul, sieWeight, weightedOrder, directorObjection, objectionText, directorRenegotiate, logObjection, insistPenalty, directorWho } from './director.js'; // dyrektor sportowy: rynek, kadra, sieć (docs/dyrektor-sportowy.md)
import { fmtDate } from '../ui/dom.js';

export { SEASON_END };
const round = (x, step = 5000) => Math.round(x / step) * step;
const groupOf = (p) => GROUP[p.pos] ?? 'MID';
const isAi = (game, clubId) => clubId && clubId !== game.clubId && !!game.world.clubs[clubId];

export function windowOf(date) { return DOMESTIC.transferWindows.find((w) => date >= w.from && date <= w.to) ?? null; }
export const inWindow = (date) => !!windowOf(date);

// ------------------------------------------------------------ Stan rynku
export function createMarket(game) {
  const M = { listed: {}, free: [], offers: [], talks: {}, history: [], userListed: {}, lastRefresh: null, foreign: [], pending: [] };
  game.market = M;
  addFreeAgents(game, 65, game.date ?? '2026-07-01', SEASON_YEAR === 2026 ? 'start' : `lato-${SEASON_YEAR}`); // 126 klubów z kadrami (było 45 przy 54)
  ensureForeignPool(game); // 100 zawodników z zagranicy (src/career/foreignPool.js)
  return M;
}

/** Wolni zawodnicy: bez klubu, oczekują tylko pensji i premii za podpis. */
export function addFreeAgents(game, n, date, tag, { imports = false } = {}) {
  const rng = new Rng(`wolni:${game.seed}:${tag}`);
  for (let i = 0; i < n; i++) {
    // imports: zawodnicy z zagranicy (koniec kontraktu w innej lidze), poziom czołówki Ekstraklasy [SZAC]
    // Poziomy jak ligi z kadrami; od grywalnej III ligi także jej poziom (ok. 1/5 wolnych) [SZAC]
    const tier = imports ? 1 : rng.weighted([1, 2, 3, 4], (t) => [0.2, 0.33, 0.29, 0.18][t - 1]);
    const L = imports ? 12.3 + rng.gauss(0, 0.8) : { 1: 10.6, 2: 9.4, 3: 8.2, 4: 7.4 }[tier] + rng.gauss(0, 0.7);
    const [pos, side] = rng.pick(SQUAD_LAYOUT);
    const age = imports ? rng.int(22, 30) : rng.weighted([19, 21, 23, 25, 27, 29, 31, 33, 35], (a) => (a >= 29 ? 1.4 : 1));
    const club = { id: 'wolny', tier, prestige: 2, L };
    let nat = pickNationality(tier, rng);
    if (imports) while (nat === 'POL') nat = pickNationality(1, rng);
    const p = genPlayer(rng, { id: `wolny-${tag}-${i + 1}`, L, pos, age, slotOffset: imports ? -0.3 : -0.4, nat, tier, side: side ?? null, club, date });
    p.clubId = null; p.free = true;
    p.askWage = p.contract.wage; p.contract = null; p.wage = 0; p.freeSince = date;
    game.world.players[p.id] = p;
    game.market.free.push(p.id);
  }
}

// ------------------------------------------------------------ Ceny i dostępność
function clubTier(clubId) { return clubById(clubId)?.tier ?? 1; }

/** Trzech najlepszych w klubie AI nie jest na sprzedaż (chyba że klauzula odstępnego). */
export function notForSale(game, p) {
  if (!isAi(game, p.clubId) || game.market.listed[p.id]) return false;
  const top = squadOf(game.world, p.clubId).sort((a, b) => b.ovr - a.ovr).slice(0, 3).map((x) => x.id);
  return top.includes(p.id);
}

export function askingPrice(game, p) {
  if (isPoolContracted(p)) return foreignAskingPrice(game, p); // klub zagraniczny (foreignPool.js)
  if (!p.clubId) return 0;
  if (p.clubId === game.clubId) return game.market.userListed[p.id] ?? round(p.value * 1.3);
  const listed = game.market.listed[p.id];
  const value = marketValue(p, { tier: clubTier(p.clubId), date: game.date });
  const mul = listed ? (listed.kind === 'release' ? 0.4 : 1.08) : 1.45;
  // Znajomość rynku dyrektora klubu (RYN): błąd wyceny bez przesunięcia, stały w pół sezonu (director.js)
  let price = listed?.price ?? round(value * mul * askingPriceMultiplier(p.rep ?? 30) * rynMul(game, p.clubId, p.id, 'cena')); // price: prośba o transfer (moveWish.js)
  if (notForSale(game, p) && p.contract?.clause) price = p.contract.clause;
  return price;
}

/** Czy odejście zawodnika zostawiłoby klub poniżej minimum grupy pozycji (z odejściami w toku, transferDeals.js). */
export function breaksMinimum(game, p) {
  const sq = squadOf(game.world, p.clubId).filter((x) => !x.transfer || x.id === p.id);
  const g = groupOf(p);
  return sq.filter((x) => groupOf(x) === g).length - 1 < SQUAD_TARGETS[g].min || sq.length - 1 < SQUAD_SIZE.min;
}

/** Zgoda zawodnika na przejście (strona zawodnika, przed rozmową o kontrakcie). */
export function playerWillingness(game, p, toClubId = game.clubId, offerWage = null) {
  const to = clubById(toClubId) ?? { prestige: 3, tier: 1 };
  const abroad = isPoolContracted(p); // kontrakt za granicą: reputacja i poziom z ligi (foreignPool.js)
  const from = p.clubId ? clubById(p.clubId) ?? { prestige: 2, tier: 3 } : abroad ? poolSellerClub(p) : { prestige: 2, tier: clubTier(toClubId) + 1 };
  const inEurope = (id) => (game.fixtures ?? []).some((f) => f.comp === 'uefa' && (f.home === id || f.away === id));
  const monthsLeft = p.contract?.until ? Math.max(0, (Number(p.contract.until.slice(0, 4)) - Number(game.date.slice(0, 4))) * 12 + Number(p.contract.until.slice(5, 7)) - Number(game.date.slice(5, 7))) : 0;
  const squad = squadOf(game.world, toClubId);
  const better = squad.filter((x) => groupOf(x) === groupOf(p) && x.ovr > p.ovr).length;
  return willingnessToJoin({
    player: { rep: p.rep ?? 30, age: p.age, persona: p.persona, wage: p.contract?.wage ?? p.askWage ?? marketWage(p.ovr, clubTier(toClubId), false, payLevel(toClubId)), monthsLeft, unhappy: !!p.unhappy, stepDown: p.stepDown ?? 0, free: !p.clubId && !abroad },
    from, to, offerWage, toTier: to.tier, fromTier: from.tier ?? 3, toEurope: inEurope(toClubId), fromEurope: p.clubId ? inEurope(p.clubId) : false,
    starter: better < ({ GK: 1, DEF: 4, MID: 4, ATT: 2 })[groupOf(p)],
  });
}

// ------------------------------------------------------------ Oferty gracza dla klubów AI
/**
 * Oferta odstępnego za zawodnika klubu AI. Zwraca { result: 'accept'|'counter'|'reject'|'director', price, counter?, text }.
 * Po trzech odrzuceniach klub zrywa rozmowy na 14 dni. 'director': klub przyjąłby ofertę, ale dyrektor sportowy klubu
 * gracza sprzeciwia się przepłacie (objection, decyzja trenera w answerDirector; docs/dyrektor-sportowy.md, rozdz. 9).
 * opts: { dirOk: decyzja po sprzeciwie (bez ponownego sprzeciwu), agreed: kwota uzgodniona przez dyrektora (klub ją przyjmuje) }.
 */
export function offerForPlayer(game, playerId, fee, opts = {}) {
  const p = game.world.players[playerId];
  const date = game.date;
  if (isPoolContracted(p)) return offerForForeign(game, playerId, fee); // klub zagraniczny (foreignPool.js)
  if (!p || !isAi(game, p.clubId)) return { result: 'reject', text: 'Tego zawodnika nie można kupić.' };
  if (!inWindow(date)) return { result: 'reject', text: 'Okno transferowe jest zamknięte. Transfer możliwy w następnym oknie.' };
  const t = game.market.talks[playerId] ?? { rounds: 0, until: null };
  if (t.until && date < t.until) return { result: 'reject', text: `Klub nie chce rozmawiać do ${t.until}.` };
  if (recentlyMoved(p, date)) return { result: 'reject', text: 'Zawodnik dopiero dołączył do klubu. Klub nie sprzeda go w tym oknie.' };
  if (p.loan) return { result: 'reject', text: `Zawodnik jest wypożyczony z ${clubById(p.loan.from)?.name ?? 'innego klubu'}. Klub wypożyczający nie może go sprzedać, a macierzysty sprzeda go po powrocie.` };
  if (hasOpenDeal(game, p.id)) return { result: 'reject', text: 'Zawodnik jest w trakcie transferu do innego klubu.' };
  if (p.preContract) return { result: 'reject', text: `${p.name} ma już umowę od 1 lipca z innym klubem.` };
  const mine = proposalsFor(game, p.id).find((x) => x.to === game.clubId);
  if (mine) return { result: 'reject', text: `${p.name} rozważa twoją propozycję. Odpowie do ${fmtDate(mine.status === 'changes' ? mine.deadline : mine.decide)}.` };
  const cap = canSign(game);
  if (!cap.ok) return { result: 'reject', text: cap.text };
  if (spendable(game.finance, game.clubId) - pendingFees(game, game.clubId) < fee) return { result: 'reject', text: 'Kwota przekracza budżet transferowy albo saldo klubu.' };
  const board = checkUserFee(game, p, fee); // weto zarządu: odstępne ponad progi (list w poczcie, odwołanie w zakładce Klub)
  if (board.veto) return { result: 'reject', veto: true, text: board.text };
  const seller = clubById(p.clubId);
  if (notForSale(game, p) && !p.contract?.clause) return { result: 'reject', text: `${seller.name}: zawodnik nie jest na sprzedaż.` };
  let price = askingPrice(game, p);
  if (breaksMinimum(game, p)) price = round(price * 1.3);
  if (opts.agreed) price = Math.min(price, fee); // kwota wynegocjowana przez dyrektora sportowego
  // Sprzeciw dyrektora sportowego przy wyraźnej przepłacie (weto zarządu ma pierwszeństwo, bez dublowania)
  if (fee >= price && !opts.dirOk) {
    const obj = directorObjection(game, p, fee, 'buy');
    if (obj) {
      (game.market.dirObj ??= {})[`buy:${p.id}`] = { ...obj, seller: p.clubId, warn: board.warn ?? null };
      return { result: 'director', price, objection: obj, text: objectionText(game, obj, fmtZl) };
    }
  }
  if (opts.dirOk) delete game.market.dirObj?.[`buy:${p.id}`];
  t.rounds++; t.date = date;
  game.market.talks[playerId] = t;
  if (fee >= price) { t.accepted = fee; return { result: 'accept', price, text: `${seller.name} przyjmuje ofertę ${fmtZl(fee)}. Możesz rozmawiać z zawodnikiem o kontrakcie.${board.warn ? ` ${board.warn}` : ''}` }; }
  const rejected = () => onOfferRejected(game, p, { buyerRep: clubReputation(clubById(game.clubId)), date }); // prośba o transfer (moveWish.js)
  if (t.rounds >= 3) { t.until = addDaysIso(date, 14); t.rounds = 0; rejected(); return { result: 'reject', text: `${seller.name} kończy rozmowy. Trzy oferty były za niskie. Spróbuj za 2 tygodnie.` }; }
  if (fee >= price * 0.82) { t.counter = price; return { result: 'counter', price, counter: price, text: `${seller.name} chce ${fmtZl(price)}.` }; }
  rejected();
  return { result: 'reject', price, text: `${seller.name} odrzuca ofertę jako zbyt niską.` };
}

// ------------------------------------------------------------ Przeprowadzenie transferu
/**
 * Przenosi zawodnika. kind: 'transfer' | 'free' | 'loan'. contract: { wage, until, ... } (z negocjacji).
 * loan: warunki wypożyczenia (src/career/loans.js loanTerms); bez nich wypożyczenie do końca sezonu.
 * Księguje odstępne, premię za podpis i prowizję. Zwraca wpis historii.
 */
export function completeTransfer(game, { playerId, to, fee = 0, contract, kind = 'transfer', date = game.date, loanShare = 0, loan = null, fromName = null }) {
  const W = game.world; const p = W.players[playerId];
  const from = p.clubId;
  // Zawodnik z zagranicy (foreignPool.js): klub sprzedający poza Polską, odstępne tylko po stronie kupującego
  const origin = !from && p.abroad ? { name: fromName ?? p.abroad.club, country: p.abroad.country } : null;
  if (p.foreignPool) { game.market.foreign = (game.market.foreign ?? []).filter((id) => id !== playerId); stat(game, origin ? 'poolBought' : 'poolFree'); if (to === game.clubId) stat(game, 'poolUser'); }
  delete p.abroad;
  spellsOf(p); // historia klubowa: okres w dotychczasowym klubie (leniwie), zamknięcie niżej
  if (from && W.clubs[from]) W.clubs[from].squad = W.clubs[from].squad.filter((id) => id !== playerId);
  if (kind === 'free') game.market.free = game.market.free.filter((id) => id !== playerId);
  W.clubs[to].squad.push(playerId);
  if (kind === 'loan') {
    p.loan = makeLoan(game, p, { ...(loan ?? {}), share: loan?.share ?? loanShare, from, to, date });
    p.contract = { ...p.contract, wage: Math.round(p.loan.wage * p.loan.share / 10000) * 100 };
  } else {
    p.contract = { ...contract, signedOn: date };
    if (p.loan) dropLoanIndex(W, p);
    delete p.loan;
  }
  p.clubId = to; p.free = false; p.wage = p.contract.wage; p.squad = 'A'; p.lastMove = date;
  syncSpell(p, date);
  delete p.askWage; delete p.transferRequest; p.unhappy = false; p.renewRefused = false;
  delete p.transfer; delete p.moveWish; delete p.preContract; delete p.freeSince; delete p.stepDown; delete p.stepDownFree;
  delete game.market.listed[playerId]; delete game.market.userListed[playerId]; delete game.market.talks[playerId];
  const F = game.finance;
  // Skauting (scoutOps.js): kandydat z raportu skauta; zlecający klub płaci freelancerowi prowizję (12 miesięcy od raportu)
  if (p.scout && !p.scout.signed && kind !== 'loan') {
    const s = p.scout; const own = s.club === to;
    s.signed = date; s.signedTo = to;
    const amount = own && s.pct && date <= (s.commUntil ?? '') ? scoutCommission(p, fee, p.contract?.wage) : 0;
    if (amount) book(F, to, date, 'out', 'scouts', amount, `Prowizja skauta (${p.name})`);
    if (game.scoutOps) (game.scoutOps.outbox ??= []).push({ kind: 'signed', pid: playerId, name: p.name, to, own, fee, amount, pct: s.pct, scout: s.scout, date });
  }
  if (fee) { book(F, to, date, 'out', 'transfers', fee, `${p.name} (${clubById(from)?.name ?? origin?.name ?? 'wolny'})`); book(F, from, date, 'in', 'sales', fee, `${p.name} do ${clubById(to)?.name}`); if (F.clubs[to]) F.clubs[to].transferBudget = Math.max(0, F.clubs[to].transferBudget - fee); if (F.clubs[from]) F.clubs[from].transferBudget += Math.round(fee * 0.5); }
  if (contract?.signOn) book(F, to, date, 'out', 'signOn', contract.signOn);
  if (contract?.agentFee) book(F, to, date, 'out', 'agents', contract.agentFee);
  const entry = { date, playerId, name: p.name, pos: p.pos, from, to, fee, kind, ...(origin ? { fromName: origin.name, country: origin.country } : {}) };
  game.market.history.unshift(entry);
  p.career = [...(p.career ?? []), { date, from, to, fee, kind, ...(origin ? { fromName: origin.name } : {}) }];
  return entry;
}

/** Wypożyczenie do klubu gracza (src/career/loans.js): terms to część pensji w % albo warunki (rodzaj, opcja, obowiązek...). */
export function loanIn(game, playerId, terms) {
  return requestLoanIn(game, playerId, terms);
}

/** Rozwiązanie kontraktu za porozumieniem: połowa pozostałej pensji. Zawodnik trafia do wolnych. */
export function releaseCost(game, p) {
  const weeks = Math.max(0, (new Date(p.contract.until) - new Date(game.date)) / (7 * 86400000));
  return Math.round(weeks * p.contract.wage * 0.5 / 1000) * 1000;
}
export function releasePlayer(game, playerId) {
  const p = game.world.players[playerId];
  spellsOf(p);
  const cost = releaseCost(game, p);
  book(game.finance, p.clubId, game.date, 'out', 'release', cost, `${p.name}: rozwiązanie kontraktu`);
  game.world.clubs[p.clubId].squad = game.world.clubs[p.clubId].squad.filter((id) => id !== playerId);
  game.market.history.unshift({ date: game.date, playerId, name: p.name, pos: p.pos, from: p.clubId, to: null, fee: 0, kind: 'release' });
  p.askWage = p.contract.wage; p.contract = null; p.wage = 0; p.clubId = null; p.free = true; p.freeSince = game.date;
  delete p.moveWish; delete p.preContract; p.transferRequest = false;
  syncSpell(p, game.date); // historia klubowa: koniec okresu w klubie
  delete game.market.listed[playerId]; delete game.market.userListed[playerId];
  game.market.free.push(playerId);
  return cost;
}

/**
 * Edytor (src/career/editor.js): zawodnik z kadry do wolnych zawodników, bez kosztów i bez wpisu w historii rynku
 * (zmiana danych gry, nie decyzja klubu). Limity kadry sprawdza edytor.
 */
export function editorRelease(game, playerId) {
  const p = game.world.players[playerId];
  if (!p?.clubId) return false;
  spellsOf(p);
  const C = game.world.clubs[p.clubId];
  if (C) C.squad = C.squad.filter((id) => id !== playerId);
  p.askWage = p.contract?.wage || p.askWage || 0; p.contract = null; p.wage = 0; p.clubId = null; p.free = true; p.freeSince = game.date;
  delete p.moveWish; delete p.preContract; delete p.transfer; p.transferRequest = false;
  syncSpell(p, game.date); // historia klubowa: koniec okresu w klubie
  delete game.market.listed[playerId]; delete game.market.userListed[playerId]; delete game.market.talks?.[playerId];
  if (!game.market.free.includes(playerId)) game.market.free.push(playerId);
  return true;
}

// ------------------------------------------------------------ Listy dla gracza
export function marketLists(game) {
  const W = game.world;
  const listed = Object.entries(game.market.listed).map(([id, l]) => ({ p: W.players[id], ...l })).filter((x) => x.p && x.p.clubId && x.p.clubId !== game.clubId);
  return {
    transfer: listed.filter((x) => x.kind !== 'loan'),
    loan: listed.filter((x) => x.kind === 'loan'),
    free: game.market.free.map((id) => W.players[id]).filter(Boolean).map((p) => ({ p, kind: 'free', reasons: ['Wolny zawodnik'] })),
    abroad: poolList(game).map((p) => ({ p, kind: p.free ? 'free' : 'abroad', reasons: [] })), // z zagranicy (foreignPool.js)
  };
}

export function searchPlayers(game, { pos = 'all', maxPrice = Infinity, maxAge = 99, minOvr = 0, tier = 'all', text = '' } = {}, limit = 60) {
  const out = [];
  const q = text.trim().toLowerCase();
  for (const c of CLUBS_PL) {
    if (c.id === game.clubId || !game.world.clubs[c.id] || (tier !== 'all' && c.tier !== Number(tier))) continue;
    for (const p of squadOf(game.world, c.id)) {
      if (pos !== 'all' && groupOf(p) !== pos) continue;
      if (p.age > maxAge || p.ovr < minOvr || (q && !p.name.toLowerCase().includes(q))) continue;
      const price = askingPrice(game, p);
      if (price > maxPrice) continue;
      out.push({ p, price, nfs: notForSale(game, p) && !p.contract?.clause });
    }
  }
  return out.sort((a, b) => b.p.ovr - a.p.ovr).slice(0, limit);
}

// ------------------------------------------------------------ Klub AI: tydzień w oknie
function playerView(p, date) {
  return { ...p, contractUntil: p.contract?.until, wage: p.contract?.wage ?? 0, minutesShare: (p.season?.min ?? 0) / Math.max(90, (p.season?.apps ?? 0) * 90 + 900) };
}

/** Wystawienia klubów AI (sprzedaż, wypożyczenie, zwolnienie). */
export function refreshListings(game, date) {
  const M = game.market;
  for (const id of Object.keys(M.listed)) { const p = game.world.players[id]; if (!p?.clubId || p.clubId === game.clubId) delete M.listed[id]; }
  for (const c of CLUBS_PL) {
    if (c.id === game.clubId || !game.world.clubs[c.id]) continue;
    const squad = squadOf(game.world, c.id).map((p) => playerView(p, date));
    const wb = game.finance.clubs[c.id]?.wageBudget;
    for (const x of transferListCandidates(squad, { L: c.L, rep: clubReputation(c), wageBudget: wb }, { date, inWindow: true, seasonEnd: SEASON_END })) {
      if (recentlyMoved(game.world.players[x.id], date) || game.world.players[x.id]?.loan) continue; // wypożyczonego nie wystawia klub wypożyczający
      if (!M.listed[x.id]) M.listed[x.id] = { kind: x.kind, reasons: x.reasons, since: date, club: c.id };
    }
  }
  M.lastRefresh = date;
}

/** Jeden zakup klubu AI: wzmocnienie najsłabszej grupy z listy, wolnych albo słabszych klubów. */
function aiBuy(game, club, date, rng, log) {
  const W = game.world; const F = game.finance;
  if (squadCount(game, club.id).full) return null; // limit kadry: te same progi co dla gracza (docs/limit-kadry.md)
  const squad = squadOf(W, club.id);
  const needs = squadDeficits(squad).filter((n) => n.scope === 'squad');
  const groups = needs.length ? needs.map((n) => n.group).filter((g) => g !== 'ALL') : ['GK', 'DEF', 'MID', 'ATT'];
  const sg = needs.length ? null : scoutedGroup(game, club.id, date, groupOf); // kandydat z misji skauta klubu (scoutOps.js)
  const g = needs.length ? groups[0] ?? rng.pick(['DEF', 'MID', 'ATT']) : sg ?? rng.pick(groups);
  const inGroup = squad.filter((p) => groupOf(p) === g).sort((a, b) => a.ovr - b.ovr);
  const bar = needs.length ? 0 : (inGroup[Math.floor(inGroup.length / 2)]?.ovr ?? 0);
  const money = spendable(F, club.id) - pendingFees(game, club.id); // odstępne w otwartych transakcjach jest zarezerwowane
  const room = wageRoom(F, W, club.id) + (squad.length > 26 ? inGroup[0]?.contract?.wage ?? 0 : 0);
  const pool = [];
  const busy = (p) => p.transfer || p.preContract || hasOpenDeal(game, p.id); // transakcja w toku albo umowa od 1 lipca (namysł nie zajmuje)
  for (const id of game.market.free) { const p = W.players[id]; if (p && groupOf(p) === g && p.ovr > bar && !busy(p) && !scoutBlocked(p, club.id, date)) pool.push({ p, fee: 0 }); } // kandydat skauta innego klubu: wyłączność 14 dni
  for (const [id, l] of Object.entries(game.market.listed)) {
    const p = W.players[id];
    if (!p || l.kind === 'loan' || p.clubId === club.id || p.clubId === game.clubId || groupOf(p) !== g || p.ovr <= bar || busy(p) || (p.value ?? 0) * 0.5 > money || (p.clubId && breaksMinimum(game, p))) continue;
    const fee = askingPrice(game, p);
    if (fee <= money) pool.push({ p, fee });
  }
  // Zakup z niższej ligi: najlepsi zawodnicy słabszych klubów (spoza ich trójki najlepszych), cena wywoławcza x1,45.
  // III liga (72 kluby) tylko z grupy regionu kupującego: tańsze przeszukiwanie i realny zasięg skautingu
  if (club.tier < 3 || pool.length < 2) {
    const region = l3GroupFor(club);
    for (const c of CLUBS_PL) {
      if (c.tier !== club.tier + 1 && !(c.tier === club.tier && rng.chance(0.3))) continue;
      if (c.tier === 4 && c.group !== (club.tier === 4 ? club.group : region)) continue;
      if (c.id === club.id || c.id === game.clubId || !W.clubs[c.id] || c.parent === club.id) continue;
      for (const p of squadOf(W, c.id)) {
        if (groupOf(p) !== g || p.ovr <= bar + 0.3 || p.loan || recentlyMoved(p, date) || notForSale(game, p) || busy(p) || breaksMinimum(game, p) || game.market.listed[p.id]) continue;
        const fee = askingPrice(game, p);
        if (fee <= money * 0.7) pool.push({ p, fee });
      }
    }
  }
  // Rzadko: zawodnik z kontraktem za granicą (pula foreignPool.js), za co najwyżej połowę wolnych środków
  pool.push(...poolCandidates(game, club, date, { group: g, bar, money, groupOf }));
  // Weto zarządu klubu AI: odstępne ponad progi (te same co dla gracza)
  const cb = clubBoardData(game, club.id);
  const allowed = pool.filter((x) => !x.fee || !feeIssues(boardCaps(game, club.id, x.p, 'sign', cb), x.fee).issues.length);
  pool.length = 0; pool.push(...allowed);
  if (!pool.length) return null;
  // Najlepszy z chętnych: odmowa najlepszego nie blokuje zakupu (pięciu pierwszych; braki w kadrze, np. bramkarz po powrocie z wypożyczenia)
  // Przy braku w kadrze także pensja w zasięgu budżetu płac (inaczej rozmowy z najlepszym upadają co tydzień)
  const asks = (x) => (x.p.contract?.wage ?? effectiveAsk(x.p, club.tier, payLevel(club))) <= Math.max(500, room) * 1.1;
  // Zawodnik, który już rozważa propozycje (gracza albo innych klubów AI), jest mniej atrakcyjny: klub woli cel bez
  // licytacji. Kara za każdą propozycję w toku: max(0; 0,8 - 0,05 x (Negocjacje - 10) + N(0; 0,6)) OVR, ziarno: gra,
  // zawodnik, klub, data (clubNegotiation.js) [SZAC]; bez kary kilka klubów brało tego samego wolnego
  const contested = new Map();
  for (const x of game.market.pending ?? []) if (x.status === 'open' || x.status === 'changes') contested.set(x.pid, (contested.get(x.pid) ?? 0) + 1);
  const penOf = new Map();
  const pen = (id) => {
    const n = contested.get(id);
    if (!n) return 0;
    if (!penOf.has(id)) penOf.set(id, n * contestPenalty(game, id, club.id, date));
    return penOf.get(id);
  };
  // Kupujący ocenia cenę z błędem (Znajomość rynku dyrektora, bez przesunięcia): przepłaca albo trafia okazję
  const score = (x) => x.p.ovr - (x.fee * rynMul(game, club.id, x.p.id, 'ocena')) / 5e6 - pen(x.p.id);
  const rank = (a, b) => score(b) - score(a);
  // Brak w kadrze: najpierw najlepsi z tych, na których klub stać (wcześniej drodzy wolni wypierali tanich z ośmiu kandydatów)
  const ordered = needs.length ? [...pool.filter(asks).sort(rank).slice(0, 8), ...pool.filter((x) => !asks(x)).sort(rank).slice(0, 3)]
    : pool.sort(rank).slice(0, 5);
  // Brak w kadrze: po nieudanych rozmowach z pierwszym kandydatem klub próbuje z kolejnymi (do trzech w tygodniu)
  const willing = ordered.filter((x) => playerWillingness(game, x.p, club.id).verdict !== 'odmowa').slice(0, needs.length ? 3 : 1);
  let pick = null; let neg = null; let caps = null;
  const nego = clubNegotiation(game, club.id);
  const feeMul = kadFeeMul(game, club.id); // premie za podpis i prowizje: Zarządzanie kadrą i płacami dyrektora
  for (const x of willing) {
    caps = boardCaps(game, club.id, x.p, 'sign', cb);
    neg = aiNegotiate({ kind: 'sign', player: { ...x.p, contract: x.p.contract ?? { wage: effectiveAsk(x.p, club.tier, payLevel(club)), until: date } }, club: { ...club, name: club.name }, fromClub: x.p.clubId ? clubById(x.p.clubId) : isPoolContracted(x.p) ? poolSellerClub(x.p) : null, date, rng, budget: { wage: Math.min(Math.max(500, room), caps.wage), maxYears: caps.years, total: caps.total }, neg: nego, feeMul });
    if (neg.result === 'signed') { pick = x; break; }
  }
  if (!pick) return null;
  const p = pick.p;
  if (p.clubId && firstRefusal(game, p, club.id, pick.fee, date, neg.contract).blocked) return null; // prawo pierwokupu (loans.js)
  // Propozycja dla zawodnika: namysł 2-5 dni, potem transakcja (proposals.js, transferDeals.js). Budżet pensji
  // zostaje w propozycji na drugą rundę, gdy zawodnik zechce zmian
  const prop = makeProposal(game, { playerId: p.id, to: club.id, fee: pick.fee, contract: neg.contract, kind: pick.fee || p.clubId ? 'transfer' : 'free', date, maxWage: Math.min(Math.max(500, room), caps.wage), maxTotal: caps.total, demand: neg.demand });
  if (prop) log.push(prop);
  return prop;
}

/** Klub AI pozbywa się nadmiaru ponad maksimum kadry (limit kadry, src/career/squadLimit.js) i uzupełnia braki akademią. */
function aiBalance(game, club, date) {
  const W = game.world;
  for (let st = squadCount(game, club.id); st.counted > st.hard; st = squadCount(game, club.id)) {
    const out = boardTargets(game, club.id, 1, { date })[0];
    if (!out) break;
    releasePlayer(game, out.id);
  }
  const squad = squadOf(W, club.id);
  for (const need of squadDeficits(squad).filter((n) => n.scope === 'squad')) {
    const acad = academyOf(W, club.id).filter((x) => need.group === 'ALL' || groupOf(x) === need.group).sort((a, b) => b.ovr - a.ovr);
    for (const x of acad.slice(0, need.missing)) {
      W.clubs[club.id].academy = W.clubs[club.id].academy.filter((id) => id !== x.id);
      W.clubs[club.id].squad.push(x.id);
      x.squad = 'A';
    }
  }
}

/** Oferty klubów AI za zawodników gracza (do decyzji w poczcie). */
function aiOffersForUser(game, date, rng) {
  const W = game.world; const out = [];
  const mine = squadOf(W, game.clubId);
  const open = game.market.offers.filter((o) => o.status === 'open' && o.kind === 'incoming');
  if (open.length >= 3) return out;
  const fullClubs = new Set(CLUBS_PL.filter((c) => c.id !== game.clubId && game.world.clubs[c.id] && squadCount(game, c.id).full).map((c) => c.id));
  for (const p of rng.shuffle([...mine]).slice(0, 8)) {
    if (open.some((o) => o.playerId === p.id) || p.loan || p.preContract || hasOpenDeal(game, p.id)) continue;
    const listed = game.market.userListed[p.id];
    const interest = (listed ? 0.35 : 0.035) * (p.ovr >= 12 ? 1.4 : 1);
    if (!rng.chance(interest)) continue;
    const buyers = CLUBS_PL.filter((c) => c.id !== game.clubId && game.world.clubs[c.id] && !fullClubs.has(c.id) && clubReputation(c) >= (p.rep ?? 30) - 15 && spendable(game.finance, c.id) > p.value * 0.8);
    if (!buyers.length) continue;
    const buyer = rng.pick(buyers);
    const fee = round((listed ?? p.value) * (0.85 + rng.next() * 0.27));
    if (fee > spendable(game.finance, buyer.id) - pendingFees(game, buyer.id)) continue;
    const offer = { id: `of-${date}-${p.id}`, kind: 'incoming', playerId: p.id, from: buyer.id, fee, status: 'open', date, expires: addDaysIso(date, 6) };
    game.market.offers.unshift(offer);
    out.push(offer);
    if (out.length >= 2) break;
  }
  return out;
}

/**
 * Tydzień rynku: wystawienia, zakupy AI (propozycje dla zawodników), równowaga kadr, oferty dla gracza.
 * Zwraca { moves (transakcje klubów AI zaczęte w ostatnim tygodniu), props (nowe propozycje AI), offers }.
 */
export function marketWeek(game, date) {
  const rng = new Rng(`rynek:${game.seed}:${date}`);
  refreshListings(game, date);
  const props = [];
  // Klub AI z propozycją w toku czeka na odpowiedź zawodnika (namysł 2-5 dni) przed kolejnym zakupem;
  // odpowiedź przypadająca na dziś (system transferów po rynku) nie wstrzymuje zakupu
  const waiting = new Set((game.market.pending ?? []).filter((x) => (x.status === 'open' && x.decide > date) || x.status === 'changes').map((x) => x.to));
  // Klub, któremu w ostatnim tygodniu zawodnik odmówił albo wybrał inny klub, szuka dalej już w tym tygodniu
  // (wcześniej przy zajętym zawodniku wybierał od razu innego) [SZAC]
  const since = addDaysIso(date, -7);
  const retry = new Set((game.market.pending ?? []).filter((x) => !x.user && x.end && x.end.date >= since && ['lost', 'rejected', 'expired'].includes(x.status)).map((x) => x.to));
  // Kolejność klubów: losowanie z wagą sieci kontaktów dyrektora (exp(0,04 (SIE - 10)), zero-sum, director.js)
  for (const c of weightedOrder(rng, CLUBS_PL.filter((x) => x.id !== game.clubId && game.world.clubs[x.id]), (x) => sieWeight(game, x.id))) {
    // Brak w kadrze (np. bramkarz po powrocie z wypożyczenia): klub szuka co tydzień, inaczej co ok. 2,5 tygodnia
    const gap = squadDeficits(squadOf(game.world, c.id)).some((n) => n.scope === 'squad');
    // III liga kupuje rzadziej (ok. co 5 tygodni) i tanio (mały budżet), docs/iii-liga.md
    if (!waiting.has(c.id) && (rng.chance(c.tier === 4 ? 0.2 : 0.4) || gap || retry.has(c.id) || game.scoutOps?.aiIdx?.[c.id]?.length)) aiBuy(game, c, date, rng, props); // kandydaci skautów klubu: co tydzień
    aiBalance(game, c, date);
  }
  const offers = aiOffersForUser(game, date, rng);
  const moves = (game.market.deals ?? []).filter((d) => d.prop && d.start >= since && d.start < date && d.to && d.to !== game.clubId && d.from !== game.clubId);
  return { moves, props, offers };
}

/** Odpowiedź na ofertę klubu AI za zawodnika gracza. action: 'accept' | 'reject' | 'more'. */
export function answerIncoming(game, offerId, action) {
  const o = game.market.offers.find((x) => x.id === offerId);
  if (!o || o.status !== 'open') return { text: 'Oferta jest już nieaktualna.' };
  const p = game.world.players[o.playerId];
  const buyer = o.foreign ? { name: o.foreign.name } : clubById(o.from); // kupiec z zagranicy (foreignMarket.js)
  const buyerRep = o.foreign ? o.foreign.rep : clubReputation(buyer);
  const rng = new Rng(`odp:${o.id}:${action}`);
  if (o.expires < game.date || p.clubId !== game.clubId) { o.status = 'expired'; return { text: 'Oferta wygasła.' }; }
  if (!inWindow(game.date)) { o.status = 'expired'; return { text: 'Okno transferowe jest zamknięte.' }; }
  if (hasOpenDeal(game, p.id)) { o.status = 'expired'; return { text: `${p.name} jest już w trakcie innej transakcji.` }; }
  if (action === 'reject') {
    o.status = 'rejected';
    if (o.pre) return { text: `Odrzucono ofertę ${buyer.name}. ${p.name} odejdzie do nich latem.` };
    // Prośba o transfer po odrzuceniu dużej oferty, złamana obietnica (src/career/moveWish.js)
    const r = onUserRejected(game, p, { buyerRep, fee: o.fee, foreignWage: o.foreign?.wage ?? 0, date: game.date });
    if (r.messages.length) game.inbox = addMessages(game.inbox ?? [], r.messages).inbox;
    if (r.broken) return { text: `Odrzucono ofertę ${buyer.name}. ${p.name} przypomina twoją obietnicę i jest wściekły. Oficjalnie prosi o transfer.` };
    // Reakcja zawodnika z jednego rzutu (src/career/wishMemory.js): cicha prośba, rozczarowany albo spokojny
    const more = r.messages.length ? ` ${p.name} poprosił agenta o rozmowę o odejściu.`
      : r.state === 'rozczarowany' ? ` ${p.name} jest rozczarowany, ale zostaje.${p.wishMemory?.waitUntil > game.date ? ' Mówi, że poczeka do następnego okna.' : ''}`
        : r.state === 'spokojny' ? ` ${p.name} przyjmuje decyzję spokojnie.` : '';
    return { text: `Odrzucono ofertę ${buyer.name} za ${p.name}.${more}` };
  }
  if (action === 'more') {
    if (rng.chance(0.55) && (o.foreign || o.fee * 1.15 <= spendable(game.finance, o.from))) { o.fee = round(o.fee * 1.15); o.raised = true; return { text: `${buyer.name} podnosi ofertę do ${fmtZl(o.fee)}.`, reopen: true }; }
    o.status = 'withdrawn';
    return { text: `${buyer.name} wycofuje ofertę za ${p.name}.` };
  }
  // Sprzeciw dyrektora sportowego: sprzedaż wyraźnie poniżej wartości (decyzja trenera w answerDirector)
  if (!o.pre && !o.dirOk) {
    const obj = directorObjection(game, p, o.fee, 'sell');
    if (obj) {
      (game.market.dirObj ??= {})[`sell:${o.id}`] = { ...obj, offerId: o.id };
      return { director: true, key: `sell:${o.id}`, objection: obj, text: objectionText(game, obj, fmtZl) };
    }
  }
  delete game.market.dirObj?.[`sell:${o.id}`];
  // Przyjęcie: transakcja w toku (porozumienie, warunki osobiste, testy medyczne, zgłoszenie; src/career/transferDeals.js)
  const ok = (d) => { o.status = 'accepted'; o.deal = d?.id ?? null; return { text: `Porozumienie z ${buyer.name} w sprawie ${p.name} (${fmtZl(o.fee)}). Teraz warunki osobiste i testy medyczne. Do zgłoszenia zawodnik zostaje w klubie.`, deal: true }; };
  if (o.foreign) return ok(startDeal(game, { playerId: p.id, to: null, fee: o.fee, kind: 'abroad', foreign: o.foreign, needsTerms: true }));
  if (squadCount(game, o.from).full) { o.status = 'withdrawn'; return { text: `${buyer.name} wycofuje ofertę: nie ma miejsca w kadrze (limit kadry).` }; }
  if (o.pre && p.preContract?.club === o.from) return ok(startDeal(game, { playerId: p.id, to: o.from, fee: o.fee, contract: { ...p.preContract.contract, signedOn: game.date }, kind: 'transfer', early: true }));
  const caps = boardCaps(game, o.from, p, 'sign');
  const maxWage = Math.min(caps.wage, Math.max(p.contract.wage * 1.6, wageRoom(game.finance, game.world, o.from) + p.contract.wage));
  const neg = aiNegotiate({ kind: 'sign', player: p, club: buyer, fromClub: clubById(game.clubId), date: game.date, rng, budget: { wage: maxWage, maxYears: caps.years, total: caps.total }, neg: clubNegotiation(game, o.from), feeMul: kadFeeMul(game, o.from) });
  if (neg.result !== 'signed') { o.status = 'failed'; return { text: `${p.name} nie dogadał się z ${buyer.name}. Zostaje w klubie.` }; }
  const rofr = firstRefusal(game, p, o.from, o.fee, game.date, neg.contract); // prawo pierwokupu klubu, w którym był wypożyczony (loans.js)
  if (rofr.blocked) { o.status = 'accepted'; return { text: rofr.text ?? `${p.name}: transfer czeka na decyzję klubu z prawem pierwokupu.`, sold: !!rofr.matched }; }
  // Propozycja klubu AI dla zawodnika: namysł 2-5 dni (proposals.js), potem testy medyczne i zgłoszenie
  const prop = makeProposal(game, { playerId: p.id, to: o.from, fee: o.fee, contract: neg.contract, kind: 'transfer', maxWage, maxTotal: caps.total, demand: neg.demand, sale: o.id });
  if (!prop) { o.status = 'failed'; return { text: `${p.name} jest już w trakcie innej transakcji.` }; }
  o.status = 'accepted'; o.prop = prop.id;
  if (prop.decide <= game.date) { resolveNow(game, p.id); return { text: `Porozumienie z ${buyer.name} w sprawie ${p.name} (${fmtZl(o.fee)}). To ostatni dzień okna: zawodnik odpowiedział od razu, sprawdź pocztę.`, deal: true }; }
  return { text: `Porozumienie z ${buyer.name} w sprawie ${p.name} (${fmtZl(o.fee)}). Zawodnik rozważa warunki osobiste i odpowie do ${fmtDate(prop.decide)}. Potem testy medyczne. Do zgłoszenia zawodnik zostaje w klubie.`, deal: true };
}

// ------------------------------------------------------------ Sprzeciw dyrektora sportowego: decyzja trenera
/** Sprzeciw w toku (z dzisiaj) dla klucza buy:<zawodnik> albo sell:<oferta>; starszy jest usuwany. */
export function pendingObjection(game, key) {
  const x = game.market?.dirObj?.[key];
  if (!x) return null;
  if (x.date !== game.date) { delete game.market.dirObj[key]; return null; }
  return x;
}

/**
 * Decyzja trenera po sprzeciwie dyrektora (docs/dyrektor-sportowy.md, rozdz. 9). key: buy:<zawodnik> | sell:<oferta>.
 * action: 'back' (wycofuję się), 'reneg' (dyrektor renegocjuje: kwota lepsza o 5-15 % albo druga strona zostaje przy
 * swojej, rzadko się wycofuje), 'insist' (transakcja idzie dalej, zaufanie zarządu -1, przy dużej różnicy więcej).
 * Zwraca { text, ok, done (sprawa zamknięta), tried (po nieudanej renegocjacji), deal, sold, reopen }.
 */
export function answerDirector(game, key, action) {
  const obj = pendingObjection(game, key);
  if (!obj) return { ok: false, done: true, reopen: key.startsWith('sell:'), text: key.startsWith('sell:') ? 'Ta sprawa jest już nieaktualna. Oferta czeka na twoją odpowiedź.' : 'Ta sprawa jest już nieaktualna. Złóż ofertę jeszcze raz.' };
  const p = game.world.players[obj.pid];
  const who = directorWho(game);
  const buy = obj.kind === 'buy';
  const o = buy ? null : game.market.offers.find((x) => x.id === obj.offerId);
  const other = buy ? clubById(obj.seller)?.name ?? 'Klub' : o ? offerBuyerName(o) : 'Kupiec';
  const close = () => { delete game.market.dirObj[key]; };
  if (!buy && (!o || o.status !== 'open')) { close(); return { ok: false, done: true, text: 'Oferta jest już nieaktualna.' }; }
  if (action === 'back') {
    logObjection(game, obj, 'back');
    close();
    return buy
      ? { ok: true, done: true, text: `Wycofujesz ofertę za ${p.name}. ${who} uważa, że to rozsądna decyzja.` }
      : { ok: true, done: true, reopen: true, text: `Nie przyjmujesz oferty ${other} za ${p.name}. Oferta czeka na odpowiedź do ${fmtDate(o.expires)}.` };
  }
  if (action === 'insist') {
    const { dTrust } = logObjection(game, obj, 'insist');
    close();
    const tail = ` Zaufanie zarządu: ${game.board?.trust ?? 50} na 100 (${dTrust}).`;
    if (buy) {
      const r = offerForPlayer(game, obj.pid, obj.fee, { dirOk: true });
      return { ...r, ok: r.result === 'accept', done: true, text: `Nalegasz mimo sprzeciwu dyrektora. ${r.text}${tail}` };
    }
    o.dirOk = true;
    const r = answerIncoming(game, o.id, 'accept');
    return { ...r, ok: true, done: true, text: `Nalegasz mimo sprzeciwu dyrektora. ${r.text}${tail}` };
  }
  if (action !== 'reneg' || obj.tried) return { ok: false, text: 'Nieznana decyzja.' };
  const r = directorRenegotiate(game, obj);
  if (r.ok && !buy && !o.foreign && r.fee > spendable(game.finance, o.from) - pendingFees(game, o.from)) Object.assign(r, { ok: false, quit: false }); // kupca nie stać
  if (r.ok) {
    logObjection(game, obj, 'reneg', { result: 'ok', fee: r.fee });
    close();
    const pct = `${Math.round(r.r * 100)} %`;
    if (buy) {
      const a = offerForPlayer(game, obj.pid, r.fee, { dirOk: true, agreed: true });
      return { ...a, ok: a.result === 'accept', done: true, text: `${who} wynegocjował ${fmtZl(r.fee)} zamiast ${fmtZl(obj.fee)} (o ${pct} mniej). ${a.text}` };
    }
    o.fee = r.fee; o.dirOk = true;
    const a = answerIncoming(game, o.id, 'accept');
    return { ...a, ok: true, done: true, text: `${who} wynegocjował ${fmtZl(r.fee)} zamiast ${fmtZl(obj.fee)} (o ${pct} więcej). ${a.text}` };
  }
  if (r.quit) {
    logObjection(game, obj, 'reneg', { result: 'quit' });
    close();
    if (buy) {
      const t = game.market.talks[obj.pid] ?? { rounds: 0 };
      t.until = addDaysIso(game.date, 14); t.rounds = 0; delete t.counter;
      game.market.talks[obj.pid] = t;
      return { ok: false, done: true, text: `${other} nie zgodził się na niższą kwotę i zrywa rozmowy o ${p.name}. Spróbuj za 2 tygodnie.` };
    }
    o.status = 'withdrawn';
    return { ok: false, done: true, text: `${other} nie zgodził się podnieść kwoty i wycofuje ofertę za ${p.name}.` };
  }
  logObjection(game, obj, 'reneg', { result: 'fail' });
  obj.tried = true;
  return { ok: false, tried: true, text: `${other} nie zmienia zdania i zostaje przy kwocie ${fmtZl(obj.fee)}. Możesz się wycofać albo nalegać (zaufanie zarządu -${insistPenalty(obj.gap)}).` };
}

/** Nazwa kupca z oferty (klub z Polski albo z zagranicy). */
export const offerBuyerName = (o) => (o.foreign ? o.foreign.name : clubById(o.from)?.name ?? 'klub');

// ------------------------------------------------------------ Przedłużenia klubów AI
/** Raz w miesiącu od stycznia: kluby AI przedłużają kontrakty ważnych zawodników kończące się latem. */
export function aiRenewals(game, date) {
  const rng = new Rng(`przedluzenia:${game.seed}:${date}`);
  let renewed = 0;
  for (const c of CLUBS_PL) {
    if (c.id === game.clubId || !game.world.clubs[c.id]) continue;
    const squad = squadOf(game.world, c.id);
    const cutoff = [...squad].sort((a, b) => b.ovr - a.ovr)[17]?.ovr ?? 0;
    let cb = null; // progi zarządu klubu (weto), liczone raz na klub
    for (const p of squad) {
      if (p.contract?.until !== SEASON_END || p.renewRefused || p.retiring || p.ovr < cutoff - 0.3 || p.age >= 34 || p.loan || p.preContract || p.transfer) continue;
      const caps = boardCaps(game, c.id, p, 'renew', cb ??= clubBoardData(game, c.id));
      // Dyrektor sportowy klubu: Negocjacje i Zarządzanie kadrą (premie, prowizje), docs/dyrektor-sportowy.md
      const r = aiNegotiate({ kind: 'renew', player: p, club: c, date, rng, budget: { wage: Math.min(p.contract.wage * 1.35, caps.wage), maxYears: caps.years, total: caps.total }, neg: clubNegotiation(game, c.id), feeMul: kadFeeMul(game, c.id) });
      if (r.result === 'signed') { p.contract = { ...r.contract, signedOn: date }; p.wage = p.contract.wage; renewed++; } else p.renewRefused = true;
    }
  }
  return renewed;
}

// ------------------------------------------------------------ Pomocnicze
/** Zawodnik, który niedawno zmienił klub, nie jest sprzedawany ponownie (120 dni). */
export function recentlyMoved(p, date) {
  if (!p?.lastMove) return false;
  return (new Date(`${date}T12:00:00Z`) - new Date(`${p.lastMove}T12:00:00Z`)) / 86400000 < 120;
}
export function fmtZl(n) {
  if (n < 0) return `-${fmtZl(-n)}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace('.', ',')} mln zł`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} tys. zł`;
  return `${Math.round(n)} zł`;
}
function addDaysIso(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export { wageBill };
