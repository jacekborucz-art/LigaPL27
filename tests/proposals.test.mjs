// Namysł zawodnika przed podpisem (docs/transfery.md, rozdz. 10; docs/negocjacje.md, rozdz. 14):
// propozycje klubów, 2-5 dni namysłu, wybór najlepszej oferty, ostatnia runda gracza, koniec okna, stary zapis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { buildContract, normalizeOffer } from '../src/career/negotiation.js';
import { marketWeek } from '../src/career/transfers.js';
import { dealOf, pendingFees } from '../src/career/transferDeals.js';
import {
  THINK, thinkDays, makeProposal, submitUserProposal, proposalsFor, userProposal, thinkingUntil, proposalsDay,
  finishLastRound, withdrawProposal,
} from '../src/career/proposals.js';
import { startNegotiation, handleNegotiationAction, renderNegotiation } from '../src/ui/negotiationView.js';
import { handleTransferAction, renderTransfers } from '../src/ui/transfersView.js';
import { mailLinks } from '../src/ui/mailLinks.js';
import { collectTodo } from '../src/career/weeklyTodo.js';
import { playerTagList } from '../src/ui/playerTags.js';
import { applySeasonState } from '../src/season/rollover.js';
import '../src/season/dailySystems.js';

function newGame(clubId = 'widzew', seed = 61, date = '2026-07-01') {
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
const step = (g, n = 1) => { for (let i = 0; i < n; i++) { g.date = addDays(g.date, 1); processDay(g); } };
const contractFor = (g, wage, years = 2) => buildContract(normalizeOffer({ wage, years, role: 'rotacja' }), g.date);
/** Wolny zawodnik bez innych propozycji. */
const freeAgent = (g, i = 0) => g.market.free.map((id) => g.world.players[id]).filter((p) => p && !proposalsFor(g, p.id).length)[i];
/** Zawodnik klubu AI z Ekstraklasy (środek kadry). */
const clubPlayer = (g, club = 'piast') => squadOf(g.world, club).filter((p) => p.pos === 'ŚP' && !p.loan).sort((a, b) => a.ovr - b.ovr)[0];
/** Ustawienia odpowiedzi zawodnika na czas testu (THINK jest obiektem modułu). */
function withThink(over, fn) {
  const keep = { ...THINK };
  Object.assign(THINK, over);
  try { return fn(); } finally { Object.assign(THINK, keep); }
}
const YES = { pMin: 1, pMax: 1 };
const CHANGES = { pMin: 0, pMax: 0, changes: 1 };
const NO = { pMin: 0, pMax: 0, changes: 0 };

test('Namysł trwa 2-5 dni (3 + RNG od -1 do +2), to samo ziarno daje ten sam wynik', () => {
  const g = { seed: 7 };
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const d = thinkDays(g, `p${i}`, 'lech', '2026-07-10');
    assert.ok(d >= 2 && d <= 5, `namysł ${d}`);
    seen.add(d);
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
  assert.equal(thinkDays(g, 'p1', 'lech', '2026-07-10'), thinkDays(g, 'p1', 'lech', '2026-07-10'));
});

test('Propozycja: decyzja po namyśle, jedna na klub, odstępne zarezerwowane, zawodnik nie jest zajęty dla innych', () => {
  const g = newGame('widzew', 62, '2026-07-10');
  const p = clubPlayer(g);
  const before = pendingFees(g, 'lech');
  const x = makeProposal(g, { playerId: p.id, to: 'lech', fee: 400000, contract: contractFor(g, 6000) });
  assert.ok(x);
  assert.equal(x.decide, addDays(g.date, thinkDays(g, p.id, 'lech', g.date)));
  assert.equal(makeProposal(g, { playerId: p.id, to: 'lech', fee: 1, contract: contractFor(g, 9000) }), null, 'jedna propozycja na klub');
  assert.equal(pendingFees(g, 'lech'), before + 400000, 'odstępne w propozycji zarezerwowane');
  assert.equal(dealOf(g, p.id), null, 'propozycja to jeszcze nie transakcja');
  assert.equal(p.clubId, 'piast');
  // Druga propozycja (inny klub) dołącza do tej samej decyzji
  const y = makeProposal(g, { playerId: p.id, to: 'rakow', fee: 450000, contract: contractFor(g, 6500), date: addDays(g.date, 1) });
  assert.ok(y);
  assert.equal(y.decide, x.decide);
  assert.equal(thinkingUntil(g, p.id), x.decide);
});

test('W dniu decyzji zawodnik wybiera najlepszą ofertę; przegrany klub dostaje „wybrał inny klub”', () => {
  const g = newGame('widzew', 63, '2026-07-10');
  const p = freeAgent(g);
  const low = makeProposal(g, { playerId: p.id, to: 'stal-mielec', contract: contractFor(g, Math.round((p.askWage ?? 3000) * 0.9 / 100) * 100), kind: 'free' });
  const high = makeProposal(g, { playerId: p.id, to: 'lech', contract: contractFor(g, Math.round((p.askWage ?? 3000) * 1.6 / 100) * 100), kind: 'free' });
  assert.ok(low && high);
  withThink(YES, () => { while (g.date < low.decide) step(g); });
  assert.equal(high.status, 'accepted', 'lepsza oferta (pensja i klub) wygrywa');
  assert.equal(low.status, 'lost');
  assert.equal(low.end.winner, 'lech');
  assert.ok(high.u > low.u);
  const d = dealOf(g, p.id);
  assert.ok(d && d.to === 'lech' && d.stage === 'medical' && d.prop === high.id, 'transakcja od testów medycznych');
});

test('Kontroferta gracza w trakcie namysłu po propozycji klubu AI: zawodnik porównuje obie, gracz dostaje list', () => {
  const g = newGame('widzew', 64, '2026-07-10');
  const p = freeAgent(g, 1);
  const ai = makeProposal(g, { playerId: p.id, to: 'stal-mielec', contract: contractFor(g, Math.round((p.askWage ?? 3000) / 100) * 100), kind: 'free' });
  assert.ok(ai);
  step(g, 1);
  assert.ok(ai.status === 'open' || ai.decide <= g.date);
  const r = submitUserProposal(g, { playerId: p.id, contract: contractFor(g, Math.round((p.askWage ?? 3000) * 1.8 / 100) * 100), fromClub: null });
  assert.ok(r.ok, r.text);
  assert.equal(r.prop.decide, ai.decide, 'propozycja gracza dołącza do namysłu');
  assert.match(r.text, /odpowie ok\. \d{1,2} [a-zź]{3} \d{4}/);
  assert.ok(userProposal(g, p.id));
  // Karta zawodnika: twoja propozycja czeka (bez nowej oferty), status namysłu
  const html = renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id });
  assert.ok(html.includes('Wycofaj propozycję') && /Rozważa oferty/.test(html));
  assert.equal(handleTransferAction(g, 'tf-negotiate', { id: p.id }).negotiate, undefined, 'druga propozycja tego klubu zablokowana');
  withThink(YES, () => { while (g.date < ai.decide) step(g); });
  assert.equal(r.prop.status, 'accepted');
  assert.equal(ai.status, 'lost');
  assert.ok(g.inbox.some((m) => m.subject === `${p.name} przyjmuje twoją propozycję` && m.refs?.kind === 'proposal'));
  assert.ok(mailLinks(g, g.inbox.find((m) => m.refs?.kind === 'proposal')).some((l) => /W toku|Propozycje/.test(l.label)));
});

test('Gracz przegrywa z lepszą ofertą klubu AI: list „wybrał X”, odmowa blokuje rozmowy na 2 tygodnie', () => {
  const g = newGame('widzew', 65, '2026-07-10');
  const p = freeAgent(g, 2);
  const mine = makeProposal(g, { playerId: p.id, to: 'widzew', contract: contractFor(g, Math.round((p.askWage ?? 3000) * 0.8 / 100) * 100), kind: 'free' });
  makeProposal(g, { playerId: p.id, to: 'legia', contract: contractFor(g, Math.round((p.askWage ?? 3000) * 2.5 / 100) * 100), kind: 'free' });
  withThink(YES, () => { while (g.date < mine.decide) step(g); });
  assert.equal(mine.status, 'lost');
  assert.ok(g.inbox.some((m) => m.subject.startsWith(`${p.name} wybrał`)));
  // Odmowa (osobny zawodnik)
  const q = freeAgent(g, 3);
  const x = makeProposal(g, { playerId: q.id, to: 'widzew', contract: contractFor(g, 3000), kind: 'free' });
  withThink(NO, () => { while (g.date < x.decide) step(g); });
  assert.equal(x.status, 'rejected');
  assert.ok(g.inbox.some((m) => m.subject === `${q.name} odrzuca twoją propozycję`));
  assert.equal(q.relations.widzew.lockUntil, addDays(x.decide, THINK.refuseLockDays));
  assert.equal(startNegotiation(g, { kind: 'sign', playerId: q.id }).reason, 'locked');
});

test('Chce zmian: ostatnia runda rozmów (ultimatum), porozumienie to podpis od razu', () => {
  const g = newGame('widzew', 66, '2026-07-10');
  const p = freeAgent(g, 4);
  const x = makeProposal(g, { playerId: p.id, to: 'widzew', contract: contractFor(g, Math.round((p.askWage ?? 3000) / 100) * 100), kind: 'free' });
  withThink(CHANGES, () => { while (g.date < x.decide) step(g); });
  assert.equal(x.status, 'changes');
  assert.equal(x.deadline, addDays(x.decide, THINK.lastRoundDays));
  assert.ok(x.want.wage > x.contract.wage, 'zawodnik chce wyższej pensji');
  const m = g.inbox.find((y) => y.subject === `${p.name} chce zmian w kontrakcie`);
  assert.ok(m);
  assert.equal(mailLinks(g, m)[0].label, 'Ostatnia runda rozmów');
  assert.ok(collectTodo(g).some((t) => t.key === `namysl:${x.id}`), 'sprawa w liście Do zrobienia');
  const r = handleTransferAction(g, 'tf-lastround', { id: p.id });
  assert.ok(r.negotiate?.lastRound);
  const s = startNegotiation(g, { ...r.negotiate, limits: { maxWage: 1e7, maxSignOn: 1e8 } });
  assert.ok(s.ok, s.text);
  assert.equal(s.ng.counterType, 'ultimatum');
  assert.ok(/Ostatnia runda/.test(renderNegotiation(g, s.ng)));
  const done = handleNegotiationAction(g, s.ng, 'ng-take', {}, null).done;
  assert.equal(done.accepted, true);
  assert.equal(done.lastRound, x.id);
  const fin = finishLastRound(g, done.lastRound, done.contract, true);
  assert.ok(fin.ok, fin.text);
  assert.equal(x.status, 'accepted');
  const d = dealOf(g, p.id);
  assert.ok(d && d.stage === 'medical' && d.contract.wage === x.want.wage, 'podpis od razu: transakcja od testów medycznych');
});

test('Chce zmian: słabsza oferta kończy rozmowy (fiasko), brak odpowiedzi do terminu: propozycja wygasa', () => {
  const g = newGame('widzew', 67, '2026-07-10');
  const p = freeAgent(g, 5);
  const x = makeProposal(g, { playerId: p.id, to: 'widzew', contract: contractFor(g, Math.round((p.askWage ?? 3000) / 100) * 100), kind: 'free' });
  withThink(CHANGES, () => { while (g.date < x.decide) step(g); });
  const r = handleTransferAction(g, 'tf-lastround', { id: p.id });
  const s = startNegotiation(g, { ...r.negotiate, limits: { maxWage: 1e7, maxSignOn: 1e8 } });
  const res = handleNegotiationAction(g, s.ng, 'ng-propose', {}, { wage: String(x.contract.wage) });
  assert.equal(res.done.accepted, false);
  assert.equal(res.done.outcome.reason, 'ultimatum');
  finishLastRound(g, x.id, null, false);
  assert.equal(x.status, 'failed');
  assert.ok(p.relations.widzew.lockUntil > g.date, 'zwykłe skutki fiaska: blokada rozmów');
  assert.equal(dealOf(g, p.id), null);
  // Bez odpowiedzi do terminu
  const q = freeAgent(g, 6);
  const y = makeProposal(g, { playerId: q.id, to: 'widzew', contract: contractFor(g, Math.round((q.askWage ?? 3000) / 100) * 100), kind: 'free' });
  withThink(CHANGES, () => { while (g.date <= addDays(y.decide, THINK.lastRoundDays)) step(g); });
  assert.equal(y.status, 'expired');
  assert.ok(g.inbox.some((m) => m.subject === `Propozycja dla ${q.name} wygasła`));
});

test('Klub AI przy „chce zmian” podnosi pensję w budżecie albo rezygnuje', () => {
  const g = newGame('widzew', 68, '2026-07-10');
  const p = freeAgent(g, 7);
  const ok = makeProposal(g, { playerId: p.id, to: 'lech', contract: contractFor(g, 4000), kind: 'free', maxWage: 5000 });
  const q = freeAgent(g, 8);
  const no = makeProposal(g, { playerId: q.id, to: 'lech', contract: contractFor(g, 4000), kind: 'free', maxWage: 4100 });
  const last = ok.decide > no.decide ? ok.decide : no.decide;
  withThink(CHANGES, () => { while (g.date < last) step(g); });
  assert.equal(ok.status, 'accepted');
  assert.equal(ok.contract.wage, 4400);
  assert.equal(no.status, 'rejected');
});

test('Koniec okna: zawodnik z klubem decyduje najpóźniej w ostatnim dniu okna, wolny nie', () => {
  const g = newGame('widzew', 69, '2026-09-08');
  const p = clubPlayer(g, 'rakow');
  const x = makeProposal(g, { playerId: p.id, to: 'lech', fee: 300000, contract: contractFor(g, 6000) });
  assert.equal(x.decide, '2026-09-09', 'decyzja w ostatnim dniu okna');
  const f = freeAgent(g, 9);
  const y = makeProposal(g, { playerId: f.id, to: 'lech', contract: contractFor(g, 3000), kind: 'free' });
  assert.ok(y.decide > '2026-09-09', 'wolny zawodnik bez limitu okna');
  // Propozycja gracza w ostatnim dniu okna: odpowiedź od razu (systemy dnia już się wykonały)
  g.date = '2026-09-09';
  const q = clubPlayer(g, 'gornik-zabrze');
  const r = withThink(YES, () => submitUserProposal(g, { playerId: q.id, fee: 200000, contract: contractFor(g, 6000), fromClub: 'gornik-zabrze' }));
  assert.ok(r.ok);
  assert.equal(r.prop.status, 'accepted');
  assert.ok(dealOf(g, q.id)?.windowTo === '2026-09-09');
  assert.ok(g.inbox.some((m) => m.subject === `${q.name} przyjmuje twoją propozycję`));
});

test('Wycofanie propozycji gracza i znaczniki statusu (karta, kwadrat w Kadrze, W toku)', () => {
  const g = newGame('widzew', 70, '2026-07-10');
  const p = freeAgent(g, 10);
  const x = makeProposal(g, { playerId: p.id, to: 'widzew', contract: contractFor(g, 3000), kind: 'free' });
  const tags = playerTagList(g, p, { own: false });
  assert.ok(tags.some((t) => t.k === 'tr' && t.o && /Rozważa oferty/.test(t.title)));
  const html = renderTransfers(g, { tfTab: 'wtoku' });
  assert.ok(html.includes('Propozycje czekają na odpowiedź') && html.includes(p.name));
  assert.ok(withdrawProposal(g, x.id).ok);
  assert.equal(x.status, 'withdrawn');
  assert.equal(thinkingUntil(g, p.id), null);
  assert.ok(!html.includes('\u2014'));
});

test('Kluby AI w oknie składają propozycje zamiast od razu zakładać transakcje', () => {
  const g = newGame('widzew', 71, '2026-07-01');
  const { props } = marketWeek(g, '2026-07-06');
  assert.ok(props.length > 0, 'propozycje klubów AI');
  for (const x of props) assert.equal(dealOf(g, x.pid), null, 'bez natychmiastowej transakcji');
  g.date = '2026-07-06';
  step(g, 6);
  const deals = g.market.deals.filter((d) => d.prop);
  assert.ok(deals.length > 0, 'transakcje po namyśle');
  for (const d of deals) assert.ok(d.start > '2026-07-06' || g.market.pending.find((x) => x.id === d.prop)?.date < d.start);
});

test('Stary zapis bez propozycji: leniwa inicjalizacja, zapis i wczytanie dają ten sam przebieg', () => {
  const g = newGame('widzew', 72, '2026-07-12');
  delete g.market.pending; delete g.market.pendingSeq;
  step(g, 1);
  assert.ok(Array.isArray(g.market.pending));
  const p = freeAgent(g, 11);
  makeProposal(g, { playerId: p.id, to: 'widzew', contract: contractFor(g, 3000), kind: 'free' });
  const run = (reload) => {
    let h = structuredClone(g);
    if (reload) h = JSON.parse(JSON.stringify(h));
    for (let i = 0; i < 6; i++) { h.date = addDays(h.date, 1); proposalsDay(h, h.date); }
    return JSON.stringify(h.market.pending.find((x) => x.pid === p.id));
  };
  assert.equal(run(false), run(true));
  applySeasonState({});
});
