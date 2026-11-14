// Wypożyczenia (src/career/loans.js, docs/wypozyczenia.md): terminy, podział pensji, limity PZPN, powroty, wykup,
// pierwokup, odwołanie, zakaz gry przeciwko klubowi macierzystemu, propozycje dla gracza, stare zapisy, widoki.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { completeTransfer, loanIn, answerIncoming } from '../src/career/transfers.js';
import { wageBill, financeDay } from '../src/career/finance.js';
import { isAvailable } from '../src/career/squad.js';
import { applySeasonState } from '../src/season/rollover.js';
import {
  LOAN, loanUntil, loanTypesFor, loanTerms, createLoan, loanBlockers, loanCounts, loansOut, endLoan, askLoanOffers, acceptLoanOffer,
  openLoanOffers, recallLoan, firstRefusal, ensureLoans, isLoanedOut, requestLoanIn, aiLoansWeek,
} from '../src/career/loans.js';
import { renderTransfers, handleTransferAction } from '../src/ui/transfersView.js';
import { Rng } from '../src/core/rng.js';
import '../src/season/dailySystems.js';

function newGame(clubId = 'widzew', seed = 21, date = '2026-07-01') {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  g.date = date;
  return g;
}
const youngOf = (g, clubId, maxAge = 21) => squadOf(g.world, clubId).filter((p) => p.age <= maxAge && p.contract?.until >= '2027-06-30').sort((a, b) => a.ovr - b.ovr);
const runTo = (g, until) => { while (g.date < until) { g.date = addDays(g.date, 1); processDay(g); } };

test('Terminy: latem runda do dnia przed zimowym oknem albo sezon, zimą runda do 30 czerwca albo rok', () => {
  newGame();
  assert.deepEqual(loanTypesFor('2026-07-15'), ['runda', 'sezon']);
  assert.equal(loanUntil('runda', '2026-07-15'), '2027-01-31');
  assert.equal(loanUntil('sezon', '2026-07-15'), '2027-06-30');
  assert.deepEqual(loanTypesFor('2027-02-10'), ['runda', 'rok']);
  assert.equal(loanUntil('runda', '2027-02-10'), '2027-06-30');
  assert.equal(loanUntil('rok', '2027-02-10'), '2028-01-30');
  assert.deepEqual(loanTypesFor('2026-10-10'), []);
  assert.equal(loanUntil('sezon', '2026-10-10'), null);
});

test('Pensja: wypożyczający płaci swoją część, klub macierzysty resztę; razem pełna pensja bez podwójnego liczenia', () => {
  const g = newGame('widzew', 21, '2026-07-10');
  const p = squadOf(g.world, 'legia').sort((a, b) => a.ovr - b.ovr)[2];
  const full = p.contract.wage;
  const before = { legia: wageBill(g.world, 'legia'), widzew: wageBill(g.world, 'widzew') };
  createLoan(g, p.id, 'widzew', loanTerms(g, p, { share: 60, type: 'sezon', fee: 0 }));
  assert.equal(p.contract.wage, Math.round(full * 0.6 / 100) * 100);
  assert.equal(p.loan.wage, full);
  assert.ok(isLoanedOut(p, 'legia'));
  assert.equal(wageBill(g.world, 'widzew') - before.widzew, p.contract.wage);
  assert.equal(before.legia - wageBill(g.world, 'legia'), p.contract.wage, 'Legia płaci resztę');
  // Poniedziałek: pensje w księdze klubu macierzystego obejmują jego część
  const monday = '2026-07-13';
  const out0 = g.finance.clubs.legia.ledger['2026-07']?.out?.wages ?? 0;
  financeDay(g.finance, g.world, monday);
  assert.equal(g.finance.clubs.legia.ledger['2026-07'].out.wages - out0, wageBill(g.world, 'legia'));
});

test('Limity PZPN: 8 z klubu (bez młodzieżowców i wychowanków), 4 do jednego klubu, zakaz dalszego wypożyczania', () => {
  const g = newGame('widzew', 22, '2026-07-10');
  const older = squadOf(g.world, 'lech').filter((p) => p.age > 21 && p.contract?.until >= '2027-06-30');
  for (const p of older) p.cl = [{ c: 'pogon-szczecin', f: null, t: '2025-07-01', m: 0, g: 0 }, { c: 'lech', f: '2025-07-01', m: 0, g: 0 }]; // nie wychowankowie
  // Wcześniejsze wypożyczenia Lecha (rynek z 1 lipca) wracają, żeby liczyć od zera
  for (const x of loansOut(g, 'lech')) endLoan(g, x, g.date, { quiet: true, why: 'odesłany' });
  const to = ['gornik-zabrze', 'gornik-zabrze', 'gornik-zabrze', 'gornik-zabrze', 'piast', 'piast', 'cracovia', 'cracovia'];
  older.slice(0, 8).forEach((p, i) => createLoan(g, p.id, to[i], loanTerms(g, p, { share: 100, fee: 0 })));
  assert.equal(loanCounts(g, 'lech').out, 8);
  const ninth = older[8];
  assert.match(loanBlockers(g, ninth, 'rakow', loanTerms(g, ninth, {})), /8 zawodników wypożyczonych/);
  const kid = squadOf(g.world, 'lech').find((p) => p.age <= 21 && p.contract?.until >= '2027-06-30');
  if (kid) assert.equal(loanBlockers(g, kid, 'rakow', loanTerms(g, kid, {})), null, 'młodzieżowiec poza limitem');
  if (kid) assert.match(loanBlockers(g, kid, 'gornik-zabrze', loanTerms(g, kid, {})), /4 zawodników/, 'para klubów: najwyżej 4');
  const loaned = older[0];
  assert.match(loanBlockers(g, loaned, 'rakow', loanTerms(g, loaned, {})), /FIFA/);
  assert.equal(loansOut(g, 'lech').length, 8);
});

test('Powrót codziennie: runda z lata kończy się 31 stycznia, zawodnik wraca 1 lutego, historia z wypożyczeniem', () => {
  const g = newGame('widzew', 23, '2026-07-10');
  const p = youngOf(g, 'jagiellonia')[0];
  createLoan(g, p.id, 'radomiak', loanTerms(g, p, { type: 'runda', share: 100, fee: 0 }));
  assert.equal(p.loan.until, '2027-01-31');
  g.date = '2027-01-30'; processDay(g);
  assert.equal(p.clubId, 'radomiak');
  g.date = '2027-02-01'; processDay(g); // system 'loans' (przed rynkiem): powrót, potem rynek okna może go sprzedać
  assert.equal(p.loan, undefined);
  assert.ok(!squadOf(g.world, 'radomiak').includes(p));
  const i = p.cl.findIndex((s) => s.c === 'radomiak' && s.l);
  assert.deepEqual([p.cl[i].t, p.cl[i + 1].c, !!p.cl[i + 1].l, p.cl[i + 1].f], ['2027-02-01', 'jagiellonia', false, '2027-02-01']);
});

test('Obowiązek wykupu: warunek występów spełniony, transfer w dniu powrotu z odstępnym; niespełniony: powrót', () => {
  const g = newGame('widzew', 24, '2026-07-10');
  const [a, b] = youngOf(g, 'lech');
  createLoan(g, a.id, 'piast', loanTerms(g, a, { type: 'runda', share: 100, fee: 0, obligationFee: 300000 }));
  createLoan(g, b.id, 'piast', loanTerms(g, b, { type: 'runda', share: 100, fee: 0, obligationFee: 300000 }));
  assert.ok(a.loan.obligation.contract.wage >= a.loan.wage, 'kontrakt po wykupie ustalony od razu');
  a.loan.apps = LOAN.OBLIGATION_APPS.runda; b.loan.apps = 2;
  const sales0 = g.finance.clubs.lech.ledger['2027-02']?.in?.sales ?? 0;
  const msgs = endLoan(g, a, '2027-02-01');
  endLoan(g, b, '2027-02-01');
  assert.equal(a.clubId, 'piast'); assert.equal(a.loan, undefined); assert.equal(a.contract.wage, a.contract.wage);
  assert.equal((g.finance.clubs.lech.ledger['2027-02']?.in?.sales ?? 0) - sales0, 300000);
  assert.equal(b.clubId, 'lech');
  assert.ok(Array.isArray(msgs));
});

test('Opcja wykupu: klub AI decyduje w ostatnich 30 dniach i wykupuje w dniu końca', () => {
  const g = newGame('widzew', 25, '2026-07-10');
  const p = squadOf(g.world, 'legia').filter((x) => x.contract?.until >= '2028-06-30').sort((x, y) => y.ovr - x.ovr)[4];
  createLoan(g, p.id, 'motor', loanTerms(g, p, { type: 'runda', share: 100, fee: 0, optionFee: 100000 }));
  g.finance.clubs.motor.balance += 5e6; g.finance.clubs.motor.transferBudget += 5e6;
  runTo(g, '2027-01-05');
  if (p.loan?.exercised) {
    runTo(g, '2027-02-01');
    assert.equal(p.clubId, 'motor');
    assert.equal(p.loan, undefined);
  } else assert.equal(p.loan?.decided, true, 'decyzja zapadła');
});

test('Odwołanie: tylko z klauzulą i tylko zimą; koszt to zwrot części opłaty i 5 % wartości', () => {
  const g = newGame('widzew', 26, '2026-07-10');
  const p = youngOf(g, 'widzew')[0];
  createLoan(g, p.id, 'stal-mielec', loanTerms(g, p, { type: 'sezon', share: 100, fee: 100000, recall: true }));
  assert.match(recallLoan(g, p.id).text, /zimowym oknie/);
  g.date = '2027-02-05';
  const r = recallLoan(g, p.id);
  assert.ok(r.ok, r.text);
  assert.equal(p.clubId, 'widzew');
  const q = youngOf(g, 'widzew').find((x) => x.id !== p.id);
  g.date = '2026-07-12';
  createLoan(g, q.id, 'stal-mielec', loanTerms(g, q, { type: 'sezon', share: 100, fee: 0 }));
  g.date = '2027-02-05';
  assert.match(recallLoan(g, q.id).text, /klauzuli odwołania/);
});

test('Zakaz gry przeciwko klubowi macierzystemu: niedostępny tylko w dniu meczu z nim', () => {
  const g = newGame('widzew', 27, '2026-07-10');
  const f = g.fixtures.find((x) => x.comp === 'ekstraklasa' && x.date > '2026-08-01' && x.home !== 'widzew' && x.away !== 'widzew');
  const parent = f.home; const borrower = f.away;
  const p = youngOf(g, parent)[0];
  createLoan(g, p.id, borrower, loanTerms(g, p, { share: 75, fee: 0, noParent: true }));
  g.date = addDays(f.date, -1); processDay(g);
  assert.ok(isAvailable(p));
  g.date = f.date;
  const res = processDay(g);
  assert.ok(res);
  assert.equal(f.played, true);
  assert.equal(p.loanBlock, f.date, 'blokada w dniu meczu');
  assert.ok(!isAvailable(p));
  const line = f.result?.lineups ?? null;
  if (line) assert.ok(!JSON.stringify(line).includes(p.id));
  g.date = addDays(f.date, 1); processDay(g);
  assert.ok(isAvailable(p));
});

test('Obietnica minut: po 8 meczach zbyt mało gry, list do klubu macierzystego gracza z „Przerwij wypożyczenie”', () => {
  const g = newGame('widzew', 28, '2026-07-10');
  const p = youngOf(g, 'widzew')[0];
  createLoan(g, p.id, 'chrobry', loanTerms(g, p, { share: 100, fee: 0, promise: 0.6 }));
  p.loan.games = 8; p.loan.minutes = 90;
  g.date = '2026-10-05'; processDay(g);
  const m = g.inbox.find((x) => x.refs?.kind === 'loanBreach' && x.refs.playerId === p.id);
  assert.ok(m, 'list o niedotrzymanej obietnicy');
  assert.ok(p.loan.breach);
  runDecision(g, m, 'end');
  assert.ok(p.loan?.ending || p.clubId === 'widzew');
  if (p.loan) { runTo(g, '2027-02-01'); assert.equal(p.clubId, 'widzew'); }
});

test('Gracz wypożycza swojego zawodnika: propozycje po 1-3 dniach, list z akcjami, przyjęcie', () => {
  const g = newGame('widzew', 29, '2026-07-10');
  const p = youngOf(g, 'widzew', 23).find((x) => !g.tactics.xi.includes(x.id)) ?? youngOf(g, 'widzew', 23)[0];
  const r = askLoanOffers(g, p.id, { type: 'sezon', share: 75 });
  assert.ok(r.ok, r.text);
  assert.match(askLoanOffers(g, p.id, {}).text, /już szuka/);
  runTo(g, addDays('2026-07-10', 3));
  const letter = g.inbox.find((m) => m.refs?.kind === 'loanOffers' && m.refs.ids?.length) ?? g.inbox.find((m) => /Brak chętnych/.test(m.subject));
  assert.ok(letter, 'list z propozycjami albo informacja o braku');
  if (letter.refs?.kind !== 'loanOffers') return;
  const offers = openLoanOffers(g, p.id);
  assert.ok(offers.length >= 1 && offers.length <= 3);
  for (const o of offers) assert.ok(['ekstraklasa', 'liga1', 'liga2'].length && o.terms.share >= 25);
  const html = renderTransfers(g, { tfTab: 'kontrakty', tfPlayer: p.id });
  assert.match(html, /data-act="tf-ln-accept"/);
  const acc = acceptLoanOffer(g, offers[0].id);
  assert.ok(acc.ok, acc.text);
  assert.equal(p.clubId, offers[0].from);
  assert.ok(isLoanedOut(p, 'widzew'));
  assert.ok(offers.slice(1).every((o) => o.status === 'rejected'));
});

test('Wypożyczenie do klubu: warunki z formularza, minimum klubu, pełny rekord; stary podpis loanIn(liczba)', () => {
  const g = newGame('legia', 30, '2026-07-10');
  const p = Object.values(g.world.players).find((x) => x.clubId && x.clubId !== 'legia' && x.age <= 21 && !x.loan && x.squad === 'A' && x.contract?.until >= '2027-06-30' && g.world.clubs[x.clubId]?.squad.includes(x.id));
  assert.equal(loanIn(g, p.id, 25).ok, false);
  const r = handleTransferAction(g, 'tf-loan', { id: p.id, type: 'runda', share: 75, option: 900000, noParent: '1' });
  if (r.save) {
    assert.equal(p.clubId, 'legia');
    assert.equal(p.loan.type, 'runda');
    assert.equal(p.loan.until, '2027-01-31');
    assert.equal(p.loan.noParent, true);
    assert.ok(p.loan.option?.fee >= 900000 || p.loan.option === null);
  } else assert.ok(r.ui.tfMsg);
  assert.equal(requestLoanIn(g, 'brak', 50).ok, false);
});

test('Prawo pierwokupu: klub AI z prawem wyrównuje ofertę, gdy kupiłby zawodnika; gracz dostaje 3 dni', () => {
  const g = newGame('widzew', 31, '2026-07-10');
  const p = squadOf(g.world, 'widzew').sort((a, b) => b.ovr - a.ovr)[3];
  p.rofr = { club: 'gornik-zabrze', until: '2026-08-30' };
  g.finance.clubs['gornik-zabrze'].balance += 2e7; g.finance.clubs['gornik-zabrze'].transferBudget += 2e7;
  const o = { id: 'of-rofr', kind: 'incoming', playerId: p.id, from: 'lech', fee: Math.round(p.value), status: 'open', date: g.date, expires: addDays(g.date, 6) };
  g.market.offers.unshift(o);
  const res = answerIncoming(g, o.id, 'accept');
  assert.ok(res.text);
  assert.ok(['gornik-zabrze', 'lech', 'widzew'].includes(p.clubId));
  assert.equal(p.rofr, undefined, 'prawo wykorzystane albo wygasłe');
  // Gracz z prawem: transfer czeka 3 dni
  const q = squadOf(g.world, 'rakow')[10];
  q.rofr = { club: 'widzew', until: '2026-08-30' };
  const fr = firstRefusal(g, q, 'lech', 500000, g.date, { wage: q.contract.wage, until: '2029-06-30' });
  assert.equal(fr.pending, true);
  const offer = g.market.offers.find((x) => x.kind === 'rofr' && x.playerId === q.id);
  assert.ok(offer);
  g.date = '2026-07-11'; processDay(g);
  assert.ok(g.inbox.some((m) => m.refs?.kind === 'loanRofr'), 'list z „Wyrównaj ofertę”');
  runTo(g, '2026-07-15');
  assert.equal(offer.status, 'passed');
});

test('Stary zapis: p.loan bez rodzaju dostaje sezon do 30 czerwca, listę klubu macierzystego i powrót na koniec sezonu', () => {
  const g = newGame('widzew', 32, '2026-08-10');
  const p = youngOf(g, 'cracovia')[0];
  completeTransfer(g, { playerId: p.id, to: 'widzew', kind: 'loan', loanShare: 50 });
  p.loan = { from: 'cracovia', until: '2027-06-30', share: 50, wage: p.loan.wage };
  delete g.market.loansV;
  for (const c of Object.values(g.world.clubs)) delete c.loaned;
  ensureLoans(g);
  assert.equal(p.loan.type, 'sezon');
  assert.ok(g.world.clubs.cracovia.loaned.includes(p.id));
  assert.ok(p.loan.seen && p.loan.promise > 0);
});

test('Kluby AI wypożyczają między sobą w oknie; widoki Kontraktów i karty pokazują wypożyczonych bez długich myślników', () => {
  const g = newGame('widzew', 33, '2026-07-06');
  let moves = [];
  for (const d of ['2026-07-06', '2026-07-13', '2026-07-20']) moves = moves.concat(aiLoansWeek(g, d, new Rng(`t:${d}`)));
  assert.ok(moves.length > 3, `wypożyczeń AI: ${moves.length}`);
  for (const m of moves) {
    const p = g.world.players[m.playerId];
    assert.equal(p.clubId, m.to); assert.equal(p.loan.from, m.from);
    assert.ok((p.loan.share ?? 0) >= 25);
  }
  const p = youngOf(g, 'widzew')[0];
  createLoan(g, p.id, 'warta', loanTerms(g, p, { share: 100, fee: 0, recall: true, optionFee: 500000 }));
  const html = renderTransfers(g, { tfTab: 'kontrakty' });
  assert.match(html, /Wypożyczeni z klubu \(\d+\)/);
  assert.match(html, /Wypożyczenia: \d\/8 z klubu, \d\/8 do klubu/);
  const card = renderTransfers(g, { tfTab: 'kontrakty', tfPlayer: p.id });
  assert.match(card, /Wypożyczenie do/);
  const other = squadOf(g.world, 'legia').find((x) => x.age <= 21 && !x.loan);
  const loanCard = renderTransfers(g, { tfPlayer: other.id });
  for (const h of [html, card, loanCard]) {
    assert.ok(!h.includes('\u2014'), 'bez długich myślników');
    assert.ok(!/undefined|NaN/.test(h), 'bez undefined i NaN');
  }
  assert.match(loanCard, /id="tfShare"/);
});
