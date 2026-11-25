import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { Rng } from '../src/core/rng.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { runDecision } from '../src/core/decisions.js';
import { squadDeficits } from '../src/career/squad.js';
import { squadCount } from '../src/career/squadLimit.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { createFinance, seasonSummary, spendable } from '../src/career/finance.js';
import {
  offerForPlayer, askingPrice, notForSale, completeTransfer, releasePlayer, releaseCost, answerIncoming, loanIn, marketWeek, createMarket,
} from '../src/career/transfers.js';
import { boardMonth, ensureBoard } from '../src/career/board.js';
import { reservePrice, resolveClubOffer, normPkg, userOffer, clubOffersDay } from '../src/career/clubOffers.js'; // oferty klub-klub
import { coachFired } from '../src/career/jobMarket.js';
import '../src/season/dailySystems.js';

function newGame(clubId, seed, date = '2026-07-01') {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  while (g.date < date) { g.date = addDays(g.date, 1); processDay(g); }
  return g;
}

function playUntil(g, until) {
  while (g.date < until) {
    for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === g.clubId || x.away === g.clubId))) {
      const rng = new Rng(`gracz:${f.id}`); applyResult(g, f, playQuick(g, f, rng), rng);
    }
    g.date = addDays(g.date, 1); processDay(g);
  }
}

test('Sezon bez decyzji gracza: żaden klub nie bankrutuje, kadry 22-30 bez braków, rynek działa', () => {
  const g = newGame('widzew', 5);
  playUntil(g, '2027-06-20');
  for (const c of CLUBS_PL) {
    if (!g.world.clubs[c.id]) continue;
    const f = g.finance.clubs[c.id];
    assert.ok(f.balance >= 0, `${c.id}: saldo ${f.balance}`);
    const sq = squadOf(g.world, c.id);
    // Górna granica jak w limicie kadry (docs/limit-kadry.md): wychowankowie do 21 lat się nie liczą
    const cnt = squadCount(g, c.id);
    assert.ok(sq.length >= 22 && (sq.length <= 30 || cnt.counted <= cnt.hard), `${c.id}: kadra ${sq.length} (liczonych ${cnt.counted}, maksimum ${cnt.hard})`);
    assert.deepEqual(squadDeficits(sq).filter((n) => n.scope === 'squad'), [], c.id);
    assert.ok(sq.every((p) => p.clubId === c.id), `${c.id}: zawodnik z innym clubId`);
  }
  assert.ok(g.market.history.filter((h) => h.fee > 0).length >= 10, 'za mało transferów');
  const s = seasonSummary(g.finance.clubs.widzew);
  assert.ok(s.in.tickets > 0 && s.in.tv > 0 && s.out.wages > 0);
  // Nikt nie jest w dwóch kadrach naraz
  const seen = new Set();
  for (const c of Object.values(g.world.clubs)) for (const id of c.squad) { assert.ok(!seen.has(id), id); seen.add(id); }
});

test('Oferta za zawodnika: klub rozważa kilka dni; zbyt niska odrzucona, blisko ceny kontroferta, cena przyjęta; najważniejsi nie na sprzedaż; poza oknem też', () => {
  const g = newGame('widzew', 6, '2026-07-05');
  g.finance.clubs.widzew.transferBudget = 5e8; g.finance.clubs.widzew.balance = 5e8;
  const sq = squadOf(g.world, 'rakow').sort((a, b) => b.ovr - a.ovr);
  const calm = { gauss: () => 0, chance: () => false, int: (a) => a, next: () => 0.5 }; // bez szumu
  const star = sq.find((p) => !p.contract.clause && notForSale(g, p));
  if (star) assert.equal(resolveClubOffer(g, { p: star, pkg: normPkg({ fee: reservePrice(g, star).res * 1.5 }), rng: calm, rngExc: calm }).verdict, 'nfs');
  const p = sq.find((x) => x.pos === 'ŚP' && !notForSale(g, x) && !g.market.listed[x.id]); // pomocnik: sprzedaż nie łamie minimum grupy
  const { res } = reservePrice(g, p);
  const at = (m) => resolveClubOffer(g, { p, pkg: normPkg({ fee: res * m }), rng: calm }).verdict;
  assert.ok(['reject', 'lowball'].includes(at(0.5)));
  assert.equal(at(0.9), 'counter');
  assert.equal(at(1.05), 'accept');
  // Oferta: odpowiedź po namyśle klubu (3-7 dni), bez daty w odpowiedzi
  const r = offerForPlayer(g, p.id, Math.round(res * 1.3 / 10000) * 10000, { dirOk: true });
  assert.equal(r.result, 'sent', r.text);
  assert.doesNotMatch(r.text, /\d{4}|\d+ (sty|lut|mar|kwi|maj|cze|lip|sie|wrz|paź|lis|gru)/);
  let d = g.date; let n = 0;
  while (userOffer(g, p.id).status === 'thinking' && n < 10) { d = addDays(d, 1); n++; g.date = d; clubOffersDay(g, d); }
  assert.ok(n >= 3 && n <= 7, `namysł ${n} dni`);
  assert.equal(userOffer(g, p.id).status, 'agreed');
  assert.equal(g.market.talks[p.id].accepted, Math.round(res * 1.3 / 10000) * 10000);
  // Poza oknem: oferta możliwa, transfer w najbliższym oknie
  g.date = '2026-10-10';
  const q = sq.find((x) => x !== p && !notForSale(g, x) && !g.market.listed[x.id] && x.contract.until > '2027-03-01');
  const o = offerForPlayer(g, q.id, Math.round(reservePrice(g, q).res / 10000) * 10000, { dirOk: true });
  assert.equal(o.result, 'sent', o.text);
  assert.equal(userOffer(g, q.id).regDate, '2027-02-01');
});

test('Transfer: zawodnik zmienia klub, odstępne trafia do sprzedającego, kupujący płaci', () => {
  const g = newGame('widzew', 7, '2026-07-05');
  const p = squadOf(g.world, 'piast')[12];
  const before = [g.finance.clubs.widzew.balance, g.finance.clubs.piast.balance];
  completeTransfer(g, { playerId: p.id, to: 'widzew', fee: 300000, contract: { wage: 5000, until: '2029-06-30', signOn: 20000, agentFee: 10000 } });
  assert.equal(p.clubId, 'widzew');
  assert.ok(g.world.clubs.widzew.squad.includes(p.id) && !g.world.clubs.piast.squad.includes(p.id));
  assert.equal(g.finance.clubs.widzew.balance, before[0] - 330000);
  assert.equal(g.finance.clubs.piast.balance, before[1] + 300000);
  assert.equal(g.market.history[0].playerId, p.id);
});

test('Rozwiązanie kontraktu: koszt połowy pozostałej pensji, zawodnik wolny', () => {
  const g = newGame('widzew', 8, '2026-07-05');
  const p = squadOf(g.world, 'widzew')[24];
  const cost = releaseCost(g, p);
  const bal = g.finance.clubs.widzew.balance;
  releasePlayer(g, p.id);
  assert.equal(p.clubId, null);
  assert.ok(g.market.free.includes(p.id));
  assert.equal(g.finance.clubs.widzew.balance, bal - cost);
});

test('Oferta klubu AI za zawodnika gracza: przyjęcie to propozycja i namysł, potem transakcja (zgłoszenie po kilku dniach), odrzucenie zamyka ofertę', () => {
  const g = newGame('widzew', 9, '2026-07-06');
  const p = squadOf(g.world, 'widzew')[5];
  const o1 = { id: 'of-test-1', kind: 'incoming', playerId: p.id, from: 'legia', fee: 2e6, status: 'open', date: g.date, expires: addDays(g.date, 6) };
  g.market.offers.unshift(o1);
  const r = answerIncoming(g, o1.id, 'accept');
  assert.ok(r.text);
  if (r.deal) {
    // Najpierw namysł zawodnika (src/career/proposals.js), potem transfer jako proces (src/career/transferDeals.js):
    // do zgłoszenia zawodnik zostaje w klubie
    assert.equal(o1.status, 'accepted');
    assert.equal(p.clubId, 'widzew');
    const x = g.market.pending.find((y) => y.pid === p.id && y.to === 'legia');
    assert.ok(x && x.status === 'open' && x.sale === o1.id);
    for (let i = 0; i < 6 && x.status === 'open'; i++) { g.date = addDays(g.date, 1); processDay(g); }
    assert.notEqual(x.status, 'open', 'odpowiedź po 2-5 dniach');
    const d = g.market.deals.find((y) => y.pid === p.id && y.prop === x.id);
    if (x.status === 'accepted') {
      assert.ok(d && d.to === 'legia');
      for (let i = 0; i < 6 && !d.end; i++) { g.date = addDays(g.date, 1); processDay(g); }
      assert.ok(d.end, 'transakcja zamknięta po kilku dniach');
      if (d.end.result === 'registered') assert.equal(p.clubId, 'legia'); else assert.equal(p.clubId, 'widzew');
    } else assert.equal(p.clubId, 'widzew');
  } else assert.equal(o1.status, 'failed');
  const q = squadOf(g.world, 'widzew')[6];
  const o2 = { id: 'of-test-2', kind: 'incoming', playerId: q.id, from: 'lech', fee: 1e6, status: 'open', date: g.date, expires: addDays(g.date, 6) };
  g.market.offers.unshift(o2);
  answerIncoming(g, o2.id, 'reject');
  assert.equal(o2.status, 'rejected');
  assert.equal(q.clubId, 'widzew');
});

test('Wypożyczenie: wymaga okna i co najmniej 50 % pensji, gracz płaci część pensji', () => {
  const g = newGame('legia', 10, '2026-07-06');
  marketWeek(g, g.date);
  const cand = Object.entries(g.market.listed).find(([, l]) => l.kind === 'loan')?.[0];
  if (!cand) return; // brak kandydata w tym ziarnie
  const p = g.world.players[cand];
  const wage = p.contract.wage;
  assert.equal(loanIn(g, cand, 25).ok, false);
  const r = loanIn(g, cand, 75);
  if (r.ok) { assert.equal(p.clubId, 'legia'); assert.equal(p.contract.wage, Math.round(wage * 0.75 / 100) * 100); assert.ok(p.loan); }
});

test('Zarząd: niskie zaufanie jesienią kończy się zwolnieniem (trener bez klubu); przyjęta oferta zmienia klub', () => {
  const g = newGame('widzew', 11, '2026-07-02');
  playUntil(g, '2026-10-20');
  ensureBoard(g);
  g.board.trust = 5;
  const r = boardMonth(g, '2026-11-01');
  assert.equal(r.fired, true);
  // Zwolnienie: stan bez pracy (src/career/jobMarket.js), ostatni klub dostaje trenera tymczasowego
  const msgs = coachFired(g, '2026-11-01');
  assert.ok(msgs.some((m) => /rozwiązuje umowę/.test(m.subject)));
  assert.equal(g.manager.job.status, 'unemployed');
  assert.ok(g.coaches.widzew?.caretaker, 'ostatni klub prowadzi trener tymczasowy');
  const target = 'korona';
  runDecision(g, { refs: { kind: 'jobOffer', jobClubs: [target] } }, target);
  assert.equal(g.clubId, target);
  assert.equal(g.manager.job.status, 'employed');
  assert.ok(g.tactics.xi.length === 11);
  assert.ok(g.board.trust >= 38 && g.board.trust <= 70, `zaufanie na start z reputacji: ${g.board.trust}`);
});

test('Finanse: przychód bazowy pokrywa płace, budżet płac i transferowy dodatni', () => {
  const world = generateWorld(12);
  const F = createFinance(world);
  for (const [id, c] of Object.entries(F.clubs)) {
    assert.ok(c.base > 0 && c.wageBudget > 0, id);
    assert.ok(spendable(F, id) >= 0);
  }
  const g = { seed: 1, clubId: 'widzew', date: '2026-07-01', world };
  createMarket(g);
  // 65 wolnych z Polski (126 klubów z kadrami) i wolni z puli zawodników z zagranicy (src/career/foreignPool.js)
  assert.equal(g.market.free.length, 65 + g.market.foreign.filter((id) => world.players[id].free).length);
  assert.ok(g.market.free.every((id) => world.players[id].clubId === null && world.players[id].askWage > 0));
});
