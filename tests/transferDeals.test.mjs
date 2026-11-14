// Transfer jako proces, prekontrakty, nastawienie D, prośby o transfer, kupcy z zagranicy (docs/transfery.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { Rng } from '../src/core/rng.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { isAvailable } from '../src/career/squad.js';
import { squadCount } from '../src/career/squadLimit.js';
import { willingnessToJoin } from '../src/career/reputation.js';
import { openNegotiation } from '../src/career/negotiation.js';
import { offerForPlayer, answerIncoming, addFreeAgents } from '../src/career/transfers.js';
import { startDeal, planDays, DEAL_DAYS, medicalOutcome, MEDICAL, dealOf, cancelDeal, expectedRegistration } from '../src/career/transferDeals.js';
import { canApproach, preOpensOn, signThreshold, offerUtility, checkUserPre, signUserPre, applyPreContracts, earlyPrice, aiPreProposals, PRE } from '../src/career/preContracts.js';
import { stepDownOf, dFree, tauOf, effectiveAsk, suitcaseEffect } from '../src/career/mindset.js';
import { monthlyHazard, rejectTriggerP, calmChance, reactToWish, openWish, onUserRejected, requestsWeek, WISH } from '../src/career/moveWish.js';
import { buyerRep, FOREIGN_LEAGUES, FOREIGN, pickBuyer, foreignChance } from '../src/career/foreignMarket.js';
import { renderTransfers, handleTransferAction } from '../src/ui/transfersView.js';
import { applySeasonState } from '../src/season/rollover.js';
import '../src/season/dailySystems.js';

function newGame(clubId = 'widzew', seed = 41, date = '2026-07-01') {
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
const total = (p, foreign) => p.terms + p.medical + p.announce + (foreign ? p.travel : 0);
const midSquad = (g, clubId) => squadOf(g.world, clubId).filter((p) => p.pos === 'ŚP').sort((a, b) => a.ovr - b.ovr)[0];

// ------------------------------------------------------------ Transakcje
test('Czasy etapów: krajowy 2-4 dni, zagraniczny 5-9, wolny 1-4, AI-AI 1-3; to samo ziarno to ten sam plan', () => {
  for (let i = 0; i < 200; i++) {
    const r = (t) => planDays(t, new Rng(`plan:${t}:${i}`));
    const dom = total(r('domestic')); const fo = total(r('foreign'), true); const fr = total(r('free')); const ai = total(r('ai'));
    assert.ok(dom >= 2 && dom <= 4, `krajowy ${dom}`);
    assert.ok(fo >= 5 && fo <= 9, `zagraniczny ${fo}`);
    assert.ok(fr >= 1 && fr <= 4, `wolny ${fr}`);
    assert.ok(ai >= 1 && ai <= 3, `AI ${ai}`);
  }
  assert.deepEqual(planDays('foreign', new Rng('deal:1:d1-x')), planDays('foreign', new Rng('deal:1:d1-x')));
  assert.equal(DEAL_DAYS.domestic.medical[0], 1);
});

test('Transfer gracza po rozmowach: testy medyczne, zawodnik nie gra (hold), zostaje w starym klubie do zgłoszenia', () => {
  const g = newGame('widzew', 42, '2026-07-10');
  const p = midSquad(g, 'piast');
  const d = startDeal(g, { playerId: p.id, to: 'widzew', fee: 300000, contract: { wage: 5000, until: '2029-06-30' }, kind: 'transfer', stage: 'medical' });
  assert.ok(d);
  assert.equal(p.clubId, 'piast');
  assert.equal(p.transfer.hold, true);
  assert.equal(isAvailable(p), false, 'po testach medycznych nie gra w starym klubie');
  assert.ok(squadCount(g, 'widzew').counted >= squadOf(g.world, 'widzew').length - squadCount(g, 'widzew').exempt.length + 1, 'zawodnik w drodze liczy się do limitu');
  assert.equal(startDeal(g, { playerId: p.id, to: 'lech', fee: 1, kind: 'transfer' }), null, 'druga transakcja na tego samego zawodnika');
  assert.equal(offerForPlayer(g, p.id, 5e6).result, 'reject', 'brak innych ofert przy otwartej transakcji');
  const reg = expectedRegistration(d);
  assert.ok(reg > g.date && reg <= addDays(g.date, 4));
  step(g, 6);
  assert.ok(d.end, 'transakcja zamknięta');
  if (d.end.result === 'registered') { assert.equal(p.clubId, 'widzew'); assert.ok(!p.transfer); assert.ok(g.inbox.some((m) => /Oficjalnie:/.test(m.subject))); }
  else { assert.equal(p.clubId, 'piast'); assert.ok(g.inbox.some((m) => /upadł/.test(m.subject))); }
});

test('Testy medyczne: wzór ryzyka (ODP, uraz, wiek), kupiec AI wycofuje się przy długim urazie; wynik deterministyczny', () => {
  const g = newGame('widzew', 43, '2026-07-10');
  const p = midSquad(g, 'piast');
  p.hidden.ODP = 2; p.injuryDays = 40; p.age = 32;
  const d = startDeal(g, { playerId: p.id, to: 'lech', fee: 300000, contract: { wage: 5000, until: '2029-06-30' }, kind: 'transfer' });
  const pFail = MEDICAL.base + MEDICAL.perOdp * 8 + MEDICAL.injured + MEDICAL.veteran;
  assert.ok(Math.abs(pFail - 0.252) < 1e-9);
  const r1 = medicalOutcome(g, d); const r2 = medicalOutcome(g, d);
  assert.equal(r1, r2);
  assert.ok(['ok', 'renegotiate', 'fail', 'withdraw'].includes(r1));
  // Statystycznie: kupiec AI przy urazie > 28 dni wycofuje się w ok. 70 %
  let w = 0;
  for (let i = 0; i < 300; i++) if (medicalOutcome({ ...g, seed: i }, d) === 'withdraw') w++;
  assert.ok(w > 170 && w < 250, `wycofania ${w}`);
});

test('Ostatni dzień okna: transakcja na etapie warunków upada, po testach medycznych zawodnik jest zgłaszany', () => {
  const g = newGame('widzew', 44, '2026-08-31');
  const a = midSquad(g, 'piast');
  const b = squadOf(g.world, 'korona').filter((p) => p.pos === 'ŚO').sort((x, y) => x.ovr - y.ovr)[0];
  const early = startDeal(g, { playerId: a.id, to: 'widzew', fee: 100000, contract: { wage: 4000, until: '2029-06-30' }, kind: 'transfer', stage: 'terms', date: '2026-09-01' });
  const late = startDeal(g, { playerId: b.id, to: 'widzew', fee: 100000, contract: { wage: 4000, until: '2029-06-30' }, kind: 'transfer', stage: 'medical', date: '2026-09-01' });
  early.plan.terms = 3; early.due = '2026-09-04';
  late.plan.medical = 3; late.due = '2026-09-04';
  step(g, 1); // 2026-09-01: ostatni dzień okna
  assert.equal(early.end?.result, 'failed');
  assert.equal(early.end.reason, 'deadline');
  assert.ok(late.end, 'transakcja po testach rozstrzygnięta w dniu zamknięcia okna');
  if (late.end.result === 'registered') { assert.equal(b.clubId, 'widzew'); assert.equal(late.lastMinute, true); }
});

test('Gracz wycofuje się ze sprzedaży: zawodnik rozczarowany, zostaje w klubie', () => {
  const g = newGame('widzew', 45, '2026-07-10');
  const p = squadOf(g.world, 'widzew')[6];
  const mor = p.morale ?? 12;
  const d = startDeal(g, { playerId: p.id, to: 'lech', fee: 500000, contract: { wage: 6000, until: '2029-06-30' }, kind: 'transfer' });
  const r = cancelDeal(g, d.id);
  assert.ok(r.ok);
  assert.equal(d.end.reason, 'seller');
  assert.ok((p.morale ?? 12) <= mor - 1);
  assert.ok(!p.transfer);
  assert.equal(p.clubId, 'widzew');
});

test('Zapis i wczytanie w trakcie transakcji: ten sam przebieg', () => {
  const run = (roundTrip) => {
    let g = newGame('widzew', 46, '2026-07-10');
    const p = midSquad(g, 'zaglebie-lubin');
    startDeal(g, { playerId: p.id, to: 'widzew', fee: 200000, contract: { wage: 4000, until: '2029-06-30' }, kind: 'transfer', stage: 'terms' });
    step(g, 1);
    if (roundTrip) g = JSON.parse(JSON.stringify(g));
    step(g, 6);
    return JSON.stringify({ deal: g.market.deals.find((d) => d.pid === p.id), club: g.world.players[p.id].clubId });
  };
  assert.equal(run(false), run(true));
});

test('Oferta klubu AI przyjęta przez gracza: transakcja, kluby AI w sezonie kupują przez transakcje (bez natychmiastowych ruchów)', () => {
  const g = newGame('widzew', 47, '2026-07-06');
  const p = squadOf(g.world, 'widzew')[7];
  g.market.offers.unshift({ id: 'of-t', kind: 'incoming', playerId: p.id, from: 'lech', fee: 2e6, status: 'open', date: g.date, expires: addDays(g.date, 6) });
  const r = answerIncoming(g, 'of-t', 'accept');
  if (r.deal) {
    assert.equal(p.clubId, 'widzew');
    assert.ok(dealOf(g, p.id));
    step(g, 1);
    assert.ok(g.inbox.some((m) => /Porozumienie z/.test(m.subject)), 'list o porozumieniu');
  }
  step(g, 30);
  const regs = g.market.deals.filter((d) => d.end?.result === 'registered');
  assert.ok(regs.length >= 5, `zgłoszone transakcje ${regs.length}`);
  for (const d of regs) assert.ok(d.end.date > d.start || d.type === 'ai', `${d.id}: zgłoszenie po starcie`);
});

// ------------------------------------------------------------ Prekontrakty
test('Prekontrakt: rozmowy od 6 miesięcy przed końcem kontraktu (kontrakt do Jun 30: od Jan 1)', () => {
  const p = { clubId: 'lech', contract: { until: '2027-06-30', wage: 5000 } };
  assert.equal(preOpensOn(p), '2027-01-01');
  assert.equal(canApproach(p, '2026-12-31'), false);
  assert.equal(canApproach(p, '2027-01-01'), true);
  assert.equal(canApproach({ ...p, preContract: { club: 'x' } }, '2027-02-01'), false);
  assert.equal(canApproach({ ...p, contract: { until: '2028-06-30' } }, '2027-02-01'), false);
  // Próg podpisu spada z miesiącami i z nastawieniem D
  assert.ok(Math.abs(signThreshold('2027-01-05') - 0.6) < 1e-9);
  assert.ok(Math.abs(signThreshold('2027-04-05') - 0.36) < 1e-9);
  assert.ok(Math.abs(signThreshold('2027-04-05', 0.5) - 0.16) < 1e-9);
});

test('Użyteczność oferty: wyższa pensja, większy klub i gra w pucharach podnoszą U', () => {
  const g = newGame('widzew', 48);
  const p = squadOf(g.world, 'piast')[10];
  const base = { wage: p.contract.wage, rep: 70, L: 11.5, tier: 1, europe: false, foreign: false };
  const u0 = offerUtility(p, base);
  assert.ok(offerUtility(p, { ...base, wage: p.contract.wage * 1.5 }) > u0);
  assert.ok(offerUtility(p, { ...base, rep: 85 }) > u0);
  assert.ok(offerUtility(p, { ...base, europe: true }) > u0);
});

test('Prekontrakt gracza: limit 4 umów, blokada przedłużenia, przejście 1 lipca; zagranica: zawodnik zostaje w świecie gry', () => {
  const g = newGame('widzew', 49, '2027-01-10');
  const ends = Object.values(g.world.players).filter((p) => p.clubId && p.clubId !== 'widzew' && clubById(p.clubId)?.tier <= 2 && p.contract?.until === '2027-06-30' && !p.loan);
  assert.ok(ends.length >= 6);
  const signed = [];
  for (const p of ends.slice(0, 5)) {
    const r = signUserPre(g, p.id, { wage: 5000, years: 2, signOn: 10000, agentFee: 5000 });
    if (r.ok) signed.push(p);
  }
  assert.equal(signed.length, PRE.userMax);
  assert.match(checkUserPre(g, ends[5]).text, /limit/);
  const p = signed[0];
  assert.equal(p.preContract.club, 'widzew');
  assert.equal(p.preContract.start, '2027-07-01');
  assert.equal(p.preContract.contract.until, '2029-06-30');
  const neg = openNegotiation({ kind: 'renew', player: p, club: clubById(p.clubId), date: g.date, mode: 'ai' });
  assert.equal(neg.ok, false);
  assert.equal(neg.reason, 'preContract');
  assert.equal(offerForPlayer(g, p.id, 1e7).result, 'reject');
  // Zawodnik z prekontraktem za granicę
  const q = squadOf(g.world, 'lech').find((x) => x.contract?.until === '2027-06-30' && !x.preContract);
  q.preContract = { club: null, foreign: { country: 'TUR', countryName: 'Turcja', name: 'Galatasaray', clubId: null, rep: 43 }, start: '2027-07-01', signedOn: g.date, contract: { wage: 20000, until: '2029-06-30', years: 2 } };
  const bal = g.finance.clubs.widzew.balance;
  const rep = applyPreContracts(g, '2027-07-01');
  assert.equal(p.clubId, 'widzew');
  assert.ok(g.world.clubs.widzew.squad.includes(p.id));
  assert.equal(p.contract.until, '2029-06-30');
  assert.ok(!p.preContract);
  assert.ok(g.finance.clubs.widzew.balance < bal, 'premia za podpis i prowizja 1 lipca');
  assert.equal(rep.in.length, PRE.userMax);
  assert.equal(q.clubId, null);
  assert.equal(q.abroad.club, 'Galatasaray');
  assert.ok(g.world.players[q.id], 'zawodnik zostaje w świecie (historia)');
  assert.ok(!g.world.clubs.lech.squad.includes(q.id));
});

test('Prekontrakt: wcześniejszy transfer zimą (cena wartość x 0,25 x miesiące/6), propozycje klubów AI w styczniu i list do gracza', () => {
  const g = newGame('widzew', 50, '2027-02-01');
  const p = squadOf(g.world, 'piast').find((x) => x.contract?.until === '2027-06-30');
  assert.equal(earlyPrice(g, p, '2027-02-01'), Math.round(p.value * 0.25 * 4 / 6 / 5000) * 5000);
  const h = newGame('widzew', 51, '2027-01-01');
  const out = aiPreProposals(h, '2027-01-01');
  assert.ok(h.market.pre.offers.length >= 10, `propozycje ${h.market.pre.offers.length}`);
  const mine = h.market.pre.offers.filter((o) => h.world.players[o.pid]?.clubId === 'widzew');
  assert.equal(out.filter((m) => /pyta o/.test(m.subject)).length, mine.length, 'art. 18.3: gracz wie o każdym zapytaniu');
});

// ------------------------------------------------------------ Nastawienie D
test('Nastawienie D: wiek, czas bez klubu, charakter; obniża próg odmowy i żądanie płacowe', () => {
  assert.equal(tauOf(20), 3); assert.equal(tauOf(25), 5); assert.equal(tauOf(30), 4); assert.equal(tauOf(33), 2.5);
  assert.ok(Math.abs(dFree(5, 25) - 0.6 * (1 - Math.exp(-1))) < 1e-9);
  const p = { id: 'x', age: 33, ovr: 11, persona: 'Spokojny', hidden: { POT: 11 }, traits: { greed: 10, ambition: 10, loyalty: 10, ego: 10, patience: 10, temper: 10, professionalism: 10, homeTies: 10, risk: 10, playTime: 10, security: 10 } };
  const r = stepDownOf(p, { monthsFree: 6 });
  assert.ok(Math.abs(r.D - Math.round((0.2 + 0.05 + dFree(6, 33)) * 100) / 100) < 1e-9);
  assert.equal(stepDownOf({ ...p, persona: 'Ambitny', age: 22, hidden: { POT: 15 } }).D, 0);
  // Zawodnik o wysokiej reputacji odmawia słabemu klubowi, po długim czasie bez klubu już nie
  const ctx = { player: { rep: 58, age: 30, persona: 'Lider', wage: 20000, free: true }, from: { prestige: 2, tier: 2 }, to: { prestige: 2, tier: 2 }, toTier: 2, fromTier: 2 };
  assert.equal(willingnessToJoin(ctx).score, 0, 'twarda odmowa przy D = 0');
  const w = willingnessToJoin({ ...ctx, player: { ...ctx.player, stepDown: 0.8 } });
  assert.notEqual(w.verdict, 'odmowa');
  assert.ok(w.reasons.includes('Długo bez klubu, obniżył wymagania'));
  // Efektywne żądanie: nie mniej niż 0,6 rynku
  const fa = { ovr: 11, askWage: 30000, stepDownFree: 0.5 };
  assert.equal(effectiveAsk(fa, 1), Math.round(Math.max(0.6 * 11800, 30000 * (1 - 0.45 * 0.5)) / 100) * 100 || effectiveAsk(fa, 1));
  assert.ok(effectiveAsk(fa, 1) < 30000);
  // Spakowana walizka: profesjonalista bez spadku, mało profesjonalny słabiej gra
  assert.ok(suitcaseEffect({ ...p, persona: 'Spokojny', traits: { ...p.traits, professionalism: 4 } }) < 0);
  assert.ok(suitcaseEffect({ ...p, persona: 'Spokojny', traits: { ...p.traits, professionalism: 16 } }) > 0);
});

test('Wolni zawodnicy mają datę od kiedy są bez klubu (p.freeSince)', () => {
  const g = newGame('widzew', 52);
  addFreeAgents(g, 3, '2026-08-10', 'test-wolni');
  for (const id of g.market.free.slice(-3)) assert.equal(g.world.players[id].freeSince, '2026-08-10');
});

// ------------------------------------------------------------ Prośby o transfer
test('Prośba o transfer: wzory ryzyka, reakcje gracza, złamana obietnica', () => {
  const g = newGame('widzew', 53, '2026-07-20');
  const p = squadOf(g.world, 'widzew').sort((a, b) => b.ovr - a.ovr)[3];
  p.traits = { ...p.traits, ambition: 10, loyalty: 10, ego: 10 };
  p.age = 25;
  const h = monthlyHazard(p, { clubRep: 60, share: 0.2, games: 10, month: 7, date: g.date });
  assert.ok(h > 0 && h <= WISH.cap);
  assert.equal(monthlyHazard({ ...p, preContract: { club: 'x' } }, { clubRep: 60, share: 0.2, games: 10, month: 7, date: g.date }), 0);
  assert.ok(monthlyHazard(p, { clubRep: 60, share: 0.2, games: 10, month: 7, date: g.date }) > monthlyHazard(p, { clubRep: 60, share: 0.9, games: 10, month: 10, date: g.date }));
  assert.ok(Math.abs(rejectTriggerP({ ...p, rep: 40 }, { clubRep: 60 }) - 0.35) < 1e-9);
  assert.ok(calmChance(p, 80) > calmChance(p, 20));
  const msgs = openWish(g, p, g.date, 'hazard');
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].subject, /chciałby zmienić klub/);
  assert.equal(p.moveWish.stage, 'cicha');
  // Bez reakcji po 4 tygodniach prośba oficjalna
  requestsWeek(g, addDays(g.date, 28));
  assert.equal(p.moveWish.stage, 'oficjalna');
  assert.equal(p.transferRequest, true);
  // Obietnica i jej złamanie
  const r = reactToWish(g, p.id, 'promise');
  assert.ok(r.ok && p.moveWish.promise);
  const mor = p.morale;
  const b = onUserRejected(g, p, { buyerRep: 99, fee: p.moveWish.promise.minFee + 10000 });
  assert.equal(b.broken, true);
  assert.ok(p.morale < mor);
  assert.ok(p.relations.widzew.brokenPromises >= 1);
  // Lista: morale +2
  const m2 = p.morale;
  reactToWish(g, p.id, 'list');
  assert.equal(p.morale, Math.min(20, m2 + 2));
  assert.ok(g.market.userListed[p.id] > 0);
});

// ------------------------------------------------------------ Zagranica
test('Kupcy z zagranicy: ligi co najmniej Ekstraklasa - 0,5 i rynki pieniężne; reputacja kupca 30 + 9 (L - 11)', () => {
  const codes = FOREIGN_LEAGUES.map((l) => l.kod);
  for (const k of ['ENG', 'GER', 'TUR', 'KSA', 'USA']) assert.ok(codes.includes(k), k);
  assert.ok(!codes.includes('POL'));
  assert.ok(FOREIGN_LEAGUES.every((l) => l.Lliga >= 11.5));
  assert.equal(buyerRep(14.5), Math.round(30 + 9 * 3.5));
  const p = { id: 'x', ovr: 12, age: 24, rep: 50, value: 3e6, contract: { wage: 20000 }, season: { apps: 10, rating: 7.2 } };
  const b1 = pickBuyer(new Rng('k1'), p); const b2 = pickBuyer(new Rng('k1'), p);
  assert.deepEqual(b1, b2);
  assert.ok(b1.name.length > 3);
  assert.ok(Math.abs(foreignChance(p) - FOREIGN.pBase * (1 + 10 / 15) * 1.5 * 1.5) < 1e-9);
});

test('Sprzedaż za granicę: oferta w Ofertach, przyjęcie, zawodnik wyjeżdża (p.abroad), klub dostaje pieniądze', () => {
  const g = newGame('widzew', 54, '2026-07-07');
  const p = squadOf(g.world, 'widzew').sort((a, b) => b.ovr - a.ovr)[4];
  g.market.offers.unshift({ id: 'of-z', kind: 'incoming', playerId: p.id, from: null, foreign: { country: 'TUR', countryName: 'Turcja', name: 'klub z ligi tureckiej', clubId: null, rep: 43, repU: 68, wage: p.contract.wage * 2 }, fee: 2e6, status: 'open', date: g.date, expires: addDays(g.date, 6) });
  const html = renderTransfers(g, { tfTab: 'oferty' });
  assert.match(html, /klub z ligi tureckiej/);
  const r = answerIncoming(g, 'of-z', 'accept');
  assert.equal(r.deal, true);
  const d = dealOf(g, p.id);
  assert.ok(d.foreign && d.kind === 'abroad');
  const bal = g.finance.clubs.widzew.balance;
  step(g, 12);
  assert.ok(d.end);
  if (d.end.result === 'registered') {
    assert.equal(p.clubId, null);
    assert.equal(p.abroad.country, 'TUR');
    assert.ok(g.finance.clubs.widzew.balance > bal - 1e6);
    assert.equal(g.market.history.find((h) => h.playerId === p.id)?.kind, 'abroad');
  }
});

// ------------------------------------------------------------ Widok
test('Zakładka W toku, znaczniki i przycisk „Umowa od 1 lipca” na karcie zawodnika z kończącym się kontraktem', () => {
  const g = newGame('widzew', 55, '2027-01-12');
  const t = squadOf(g.world, 'piast').find((x) => x.contract?.until === '2027-06-30' && !x.preContract);
  const html = renderTransfers(g, { tfTab: 'rynek', tfPlayer: t.id });
  assert.match(html, /data-act="tf-pre"/);
  assert.match(html, /Umowa od 1 lipca/);
  const r = handleTransferAction(g, 'tf-pre', { id: t.id });
  assert.equal(r.negotiate?.pre, true);
  assert.equal(r.negotiate.fee, 0);
  const q = squadOf(g.world, 'korona')[12];
  startDeal(g, { playerId: q.id, to: 'widzew', fee: 100000, contract: { wage: 3000, until: '2029-06-30' }, kind: 'transfer', stage: 'medical' });
  const w = renderTransfers(g, { tfTab: 'wtoku' });
  assert.match(w, /td-deal/);
  assert.match(w, /td-bar/);
  assert.match(w, /Spodziewane zgłoszenie/);
  // Własny zawodnik z prekontraktem: znacznik w Kontraktach
  const mine = squadOf(g.world, 'widzew').find((x) => x.contract?.until === '2027-06-30');
  if (mine) {
    mine.preContract = { club: 'lech', foreign: null, start: '2027-07-01', signedOn: g.date, contract: { wage: 9000, until: '2029-06-30', years: 2 } };
    assert.match(renderTransfers(g, { tfTab: 'kontrakty' }), /porozumienie z Lech Poznań od 1 lip 2027/);
  }
});

test('Stary zapis bez transakcji i prekontraktów: leniwa inicjalizacja, dzień gry działa', () => {
  const g = newGame('widzew', 56, '2026-07-15');
  delete g.market.deals; delete g.market.pre; delete g.market.dealSeq; delete g.market.tstats;
  for (const p of Object.values(g.world.players)) { delete p.freeSince; delete p.stepDown; }
  ensureCareer(g);
  assert.ok(Array.isArray(g.market.deals) && Array.isArray(g.market.pre.offers));
  step(g, 10);
  assert.ok(g.market.deals.length > 0);
});

test('Liga: kluby AI nie przekraczają maksimum kadry z transakcjami w toku', () => {
  const g = newGame('widzew', 57, '2026-07-01');
  step(g, 45);
  for (const c of CLUBS_PL) if (c.id !== 'widzew' && g.world.clubs[c.id]) assert.ok(squadCount(g, c.id).counted <= squadCount(g, c.id).hard, c.id);
  applySeasonState({});
});
