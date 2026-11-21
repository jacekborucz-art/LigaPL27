// Pamięć prośby o transfer (src/career/wishMemory.js, docs/transfery.md rozdz. 4): podwyżka nie zeruje na pewno,
// odrzucona oferta to jeden rzut (cicha prośba, rozczarowany, spokojny), czas spokoju, oferta marzeń, obietnica.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { clubReputation } from '../src/career/reputation.js';
import { applyOutcome, relationWith, currentGrudge } from '../src/career/negotiation.js';
import { offerRejected, openWish, reactToWish, requestsWeek, requestsMonth, monthlyHazard, rejectTriggerP } from '../src/career/moveWish.js';
import {
  MEM, settleMonths, forcedQ, settleFactor, memoryFactor, rejectOdds, raiseCalmChance, noteRenewal, reconcileChance,
  hazardMemFactor, nextWindowOpen, wishStateText, memOf,
} from '../src/career/wishMemory.js';
import { playerTagList } from '../src/ui/playerTags.js';
import { applySeasonState } from '../src/season/rollover.js';
import { DOMESTIC } from '../src/config/calendar2026.js';
import '../src/season/dailySystems.js';

let cache = null;
function newGame(date = '2026-07-20') {
  applySeasonState({});
  if (!cache) {
    const g0 = { seed: 77, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
    g0.world = generateWorld(77);
    g0.season = createSeason(77, { playerClub: 'widzew' });
    g0.fixtures = g0.season.fixtures;
    g0.tactics = createTactics(squadOf(g0.world, 'widzew'), { benchSize: 12 });
    ensureCareer(g0);
    processDay(g0);
    cache = JSON.stringify(g0);
  }
  const g = JSON.parse(cache);
  g.date = date;
  return g;
}
const T = (over = {}) => ({ greed: 10, ambition: 10, loyalty: 10, ego: 10, patience: 10, temper: 10, professionalism: 10, homeTies: 10, risk: 10, playTime: 10, security: 10, ...over });
const repW = () => clubReputation(clubById('widzew'));
function player(g, i = 3, traits = {}) {
  const p = squadOf(g.world, 'widzew').sort((a, b) => b.ovr - a.ovr)[i];
  p.traits = T(traits); p.age = 25; delete p.moveWish; delete p.wishMemory; p.transferRequest = false;
  p.contract = { ...p.contract, until: '2029-06-30', signedOn: '2026-07-01' };
  return p;
}
const renew = (p, date, wage) => applyOutcome(p, { kind: 'renew', clubId: p.clubId, date, accepted: true, contract: { wage, until: '2030-06-30', signed: date, bonus: {}, promise: { role: 'rotacja' } } }, { seed: 77 });

test('Wzory: czas spokoju D i q, fSpokój, pamięć odmów, lojalny kontra ambitny', () => {
  const g = newGame();
  const loyal = player(g, 3, { loyalty: 18, patience: 16, ambition: 6 });
  const amb = player(g, 4, { loyalty: 4, patience: 6, ambition: 18, ego: 16 });
  assert.equal(settleMonths(player(g, 5)), 9);
  assert.ok(settleMonths(loyal) > settleMonths(amb));
  assert.ok(settleMonths(amb) >= 4 && settleMonths(loyal) <= 14);
  assert.ok(forcedQ(amb) < forcedQ(loyal));
  // Tuż po przedłużeniu fSpokój = 0,2, po D miesiącach 1
  renew(loyal, '2026-08-01', 30000);
  assert.ok(Math.abs(settleFactor(loyal, '2026-08-01') - 0.2) < 1e-9);
  assert.equal(settleFactor(loyal, '2027-12-01'), 1);
  // Pamięć: dwie odmowy w 12 miesiącach. Ambitnego złoszczą (>1), lojalnego uspokajają (<1)
  for (const p of [loyal, amb]) p.wishMemory = { ...(p.wishMemory ?? {}), rejects: ['2026-08-05', '2026-12-05'] };
  assert.ok(memoryFactor(amb, '2027-01-10') > 1 && memoryFactor(loyal, '2027-01-10') < 1);
  assert.equal(memoryFactor(amb, '2028-06-01'), 1, 'odmowy sprzed roku się nie liczą');
  const ctx = { buyerRep: repW() + 15, clubRep: repW(), date: '2027-01-10' };
  const pa = rejectOdds(amb, { ...ctx, P0: rejectTriggerP(amb, { clubRep: repW() }) });
  const pl = rejectOdds(loyal, { ...ctx, P0: rejectTriggerP(loyal, { clubRep: repW() }) });
  assert.ok(pa.Pc > pl.Pc && pa.Pc <= MEM.maxPc);
  assert.ok(pa.Pr >= 0 && pa.Pc + pa.Pr <= 1);
});

test('Brak pętli: po podwyżce kolejna odrzucona oferta nie daje deterministycznie prośby', () => {
  let asks = 0; let disappointed = 0; let calm = 0; let n = 0;
  const g = newGame('2026-08-10');
  const ps = squadOf(g.world, 'widzew').filter((p) => !p.loan && p.contract).slice(0, 24);
  for (const p of ps) {
    p.age = 25; delete p.moveWish; delete p.wishMemory; p.transferRequest = false;
    // Prośba, podwyżka (rzut uspokojenia), potem nowa duża oferta 6 tygodni później
    openWish(g, p, '2026-07-21', 'oferta');
    renew(p, '2026-07-25', Math.round((p.contract.wage ?? 10000) * 1.25));
    if (p.moveWish) continue; // podwyżka nie uspokoiła: inny test
    n++;
    const r = offerRejected(g, p, { buyerRep: repW() + 20, date: '2026-09-05' });
    if (r.state === 'cicha') asks++; else if (r.state === 'rozczarowany') disappointed++; else if (r.state === 'spokojny') calm++;
  }
  assert.ok(n >= 5, `za mało uspokojonych podwyżką (${n})`);
  assert.ok(asks < n, 'nie każdy prosi od razu po podwyżce');
  assert.ok(calm + disappointed > 0);
  // Podwyżka przy prośbie nie zeruje na pewno: szansa z przedziału 0,1-0,85, druga w 12 miesiącach x0,5 (chciwy x0,7)
  const p = player(g, 6, { greed: 10, ambition: 10 });
  const c1 = raiseCalmChance(p, 10000, 12000, '2026-08-01');
  assert.ok(Math.abs(c1 - 0.45) < 1e-9);
  p.wishMemory = { raises: ['2026-03-01'] };
  assert.ok(Math.abs(raiseCalmChance(p, 10000, 12000, '2026-08-01') - c1 * 0.5) < 1e-9);
  p.traits = T({ greed: 16 });
  assert.ok(Math.abs(raiseCalmChance(p, 10000, 12000, '2026-08-01') - raiseCalmChance({ ...p, wishMemory: {} }, 10000, 12000, '2026-08-01') * 0.7) < 1e-9);
});

test('Podwyżka przy prośbie: sukces skraca spokój do D x q, porażka zostawia prośbę i zapisuje podwyżkę; rozmowa po podwyżce +0,1', () => {
  const g = newGame();
  let ok = 0; let fail = 0;
  for (const p of squadOf(g.world, 'widzew').filter((x) => !x.loan && x.contract).slice(0, 20)) {
    delete p.wishMemory; delete p.moveWish;
    openWish(g, p, '2026-07-20', 'hazard');
    const r = noteRenewal(p, '2026-07-25', { oldWage: 10000, newWage: 11000, seed: 77 });
    assert.ok(r.forced && r.chance > 0 && r.chance < 1);
    assert.equal(memOf(p).lastRaise, '2026-07-25');
    if (r.calmed) {
      ok++;
      assert.equal(p.moveWish, undefined);
      const s = memOf(p).settle;
      assert.ok(s.forced && s.months >= MEM.minSettle && s.months <= settleMonths(p) * 1.1 + 1e-9);
    } else {
      fail++;
      assert.equal(p.moveWish.raised, '2026-07-25');
    }
  }
  assert.ok(ok > 0 && fail > 0, `oba wyniki występują (${ok}/${fail})`);
});

test('Jeden rzut na 30 dni: kolejna oferta tylko eskaluje (rozczarowany prosi po cichu)', () => {
  const g = newGame('2026-07-20');
  const p = player(g, 3);
  const r1 = offerRejected(g, p, { buyerRep: repW() + 20, date: '2026-07-20' });
  assert.ok(['cicha', 'rozczarowany', 'spokojny'].includes(r1.state));
  assert.equal(memOf(p).lastRoll, '2026-07-20');
  if (p.moveWish) { delete p.moveWish; p.wishMemory.mood = 'spokojny'; p.wishMemory.calmUntil = '2026-12-01'; }
  const mood = memOf(p).mood;
  const r2 = offerRejected(g, p, { buyerRep: repW() + 20, date: '2026-08-05' });
  assert.equal(memOf(p).lastRoll, '2026-07-20', 'bez drugiego rzutu');
  assert.equal(memOf(p).rejects.length, 2);
  if (mood === 'rozczarowany') assert.equal(r2.state, 'cicha'); else assert.equal(r2.state, 'spokojny');
  // Rozczarowany w ciągu 30 dni: eskalacja do cichej prośby
  const q = player(g, 5);
  q.wishMemory = { lastRoll: '2026-07-20', mood: 'rozczarowany', moodSince: '2026-07-20', rejects: ['2026-07-20'] };
  const r3 = offerRejected(g, q, { buyerRep: repW() + 20, date: '2026-07-30' });
  assert.equal(r3.state, 'cicha');
  assert.equal(q.moveWish.stage, 'cicha');
  assert.equal(r3.messages.length, 1);
  // Po 30 dniach: nowy rzut
  const s = player(g, 6);
  s.wishMemory = { lastRoll: '2026-06-01', mood: 'spokojny', calmUntil: '2026-12-01', rejects: [] };
  offerRejected(g, s, { buyerRep: repW() + 20, date: '2026-07-20' });
  assert.equal(memOf(s).lastRoll, '2026-07-20');
});

test('„Poczekam do lata”: oferta w ostatnich 10 dniach okna, rozczarowany czeka do otwarcia okna, potem ryzyko x2', () => {
  const g = newGame();
  const end = DOMESTIC.transferWindows[0].to;
  const late = addDays(end, -4);
  const p = player(g, 3);
  const base = { P0: 0.4, buyerRep: repW() + 15, clubRep: repW() };
  const a = rejectOdds(p, { ...base, date: addDays(end, -30) });
  const b = rejectOdds(p, { ...base, date: late });
  assert.ok(b.late && !a.late);
  assert.ok(Math.abs(b.Pc - a.Pc * MEM.latePc) < 1e-9);
  assert.ok(b.Pr > a.Pr);
  // Szukamy zawodnika, który po ofercie w ostatnich dniach okna jest rozczarowany
  let q = null;
  for (const x of squadOf(g.world, 'widzew').filter((y) => !y.loan && y.contract)) {
    delete x.wishMemory; delete x.moveWish; x.age = 25;
    if (offerRejected(g, x, { buyerRep: repW() + 15, date: late }).state === 'rozczarowany') { q = x; break; }
  }
  assert.ok(q, 'ktoś jest rozczarowany');
  const open = nextWindowOpen(late);
  assert.equal(q.wishMemory.waitUntil, open);
  assert.equal(hazardMemFactor(q, addDays(open, -10)), 0, 'do otwarcia okna bez prośby z ryzyka');
  assert.equal(monthlyHazard(q, { clubRep: repW(), share: 0.2, games: 10, month: 12, date: addDays(open, -10) }), 0);
  const inWin = addDays(open, 2);
  assert.ok(Math.abs(hazardMemFactor(q, inWin) - 2 * settleFactor(q, inWin) * memoryFactor(q, inWin)) < 1e-9);
  assert.match(wishStateText(q, late), /Rozczarowany, ale zostaje \(czeka do okna/);
});

test('Oferta marzeń: przebija czas spokoju, zostawia urazę; kolejna działa słabiej (0,7)', () => {
  const g = newGame('2026-08-10');
  const p = player(g, 3);
  p.age = 26;
  renew(p, '2026-08-01', 40000);
  const ctx = { P0: 0.4, buyerRep: repW() + 30, clubRep: repW(), date: '2026-08-10' };
  const normal = rejectOdds(p, { ...ctx, buyerRep: repW() + 15 });
  const dream = rejectOdds(p, ctx);
  assert.ok(dream.dream && !normal.dream);
  assert.ok(dream.f.fS >= 0.8 && normal.f.fS < 0.3);
  assert.ok(dream.Pc > normal.Pc * 3);
  const g0 = currentGrudge(relationWith(p, 'widzew'), '2026-08-10');
  offerRejected(g, p, { buyerRep: repW() + 30, date: '2026-08-10' });
  delete p.moveWish;
  assert.equal(memOf(p).dream, '2026-08-10');
  assert.ok(currentGrudge(relationWith(p, 'widzew'), '2026-08-10') >= g0 + MEM.dream.grudge - 0.01);
  const again = rejectOdds(p, { ...ctx, date: '2026-09-15' });
  assert.ok(!again.dream);
  assert.ok(Math.abs(again.f.fS - Math.max(settleFactor(p, '2026-09-15'), 0.8 * 0.7)) < 1e-9);
  assert.equal(rejectOdds({ ...p, age: 31 }, ctx).dream, false, 'oferta marzeń tylko 24-29 lat');
});

test('Obietnica: stan „czeka” bez ryzyka; brak oferty do końca okna = rozczarowany bez kary, list w poczcie', () => {
  const g = newGame('2026-08-03');
  const p = player(g, 3);
  openWish(g, p, '2026-08-03', 'oferta');
  const r = reactToWish(g, p.id, 'promise', '2026-08-03');
  assert.ok(r.ok && p.moveWish.promise);
  assert.equal(p.moveWish.promise.until, DOMESTIC.transferWindows[0].to);
  assert.doesNotMatch(r.text, /\d{4}-\d{2}-\d{2}/, 'data po polsku');
  assert.equal(offerRejected(g, p, { buyerRep: repW() + 20, date: '2026-08-10' }).state, 'prosba', 'z prośbą bez nowego rzutu');
  assert.equal(playerTagList(g, p).find((t) => t.k === 'mw')?.title.startsWith('Czeka do okna'), true);
  const mor = p.morale;
  const out = requestsWeek(g, addDays(p.moveWish.promise.until, 5));
  assert.equal(p.moveWish, undefined);
  assert.equal(memOf(p).mood, 'rozczarowany');
  assert.equal(p.morale, mor, 'wygaśnięcie bez kary');
  assert.ok(out.some((m) => /zostaje po oknie bez oferty/.test(m.subject)));
  // Obietnica w ostatnich 10 dniach okna: do końca następnego okna
  const q = player(g, 4);
  const late = addDays(DOMESTIC.transferWindows[0].to, -3);
  openWish(g, q, late, 'oferta');
  g.date = late;
  reactToWish(g, q.id, 'promise', late);
  assert.equal(q.moveWish.promise.until, DOMESTIC.transferWindows[1].to);
});

test('Gaśnięcie: rozczarowany co miesiąc może się pogodzić; spokój mija po terminie', () => {
  const g = newGame('2026-10-01');
  const loyal = { traits: T({ loyalty: 18, patience: 18, ambition: 4 }) };
  const amb = { traits: T({ loyalty: 4, patience: 4, ambition: 18 }) };
  assert.ok(reconcileChance(loyal) > reconcileChance(amb));
  assert.ok(Math.abs(reconcileChance({ traits: T() }) - 0.25) < 1e-9);
  const ps = squadOf(g.world, 'widzew').filter((p) => !p.loan).slice(0, 12);
  for (const p of ps) { delete p.moveWish; p.traits = T({ loyalty: 16, patience: 16 }); p.wishMemory = { mood: 'rozczarowany', moodSince: '2026-09-20', rejects: [] }; }
  const calm = ps[0];
  calm.wishMemory = { mood: 'spokojny', moodSince: '2026-06-01', calmUntil: '2026-09-30', rejects: [] };
  let d = '2026-10-01';
  for (let i = 0; i < 6; i++) { requestsMonth(g, d); d = addDays(d, 31).slice(0, 8) + '01'; }
  const still = ps.slice(1).filter((p) => p.wishMemory?.mood === 'rozczarowany').length;
  assert.ok(still < ps.length - 1, 'część się pogodziła');
  assert.equal(calm.wishMemory.mood, undefined, 'spokój po terminie znika');
});

test('Rozmowa: częściowy sukces zamienia cichą prośbę w rozczarowanie', () => {
  const g = newGame('2026-07-20');
  const seen = new Set();
  for (const p of squadOf(g.world, 'widzew').filter((x) => !x.loan && x.contract)) {
    delete p.wishMemory; delete p.moveWish; p.transferRequest = false;
    openWish(g, p, '2026-07-20', 'hazard');
    const r = reactToWish(g, p.id, 'talk', '2026-07-21');
    if (/dał się przekonać/.test(r.text)) { seen.add('ok'); assert.equal(p.moveWish, undefined); }
    else if (/rozczarowany/.test(r.text)) { seen.add('part'); assert.equal(p.moveWish, undefined); assert.equal(memOf(p).mood, 'rozczarowany'); }
    else { seen.add('fail'); assert.equal(p.moveWish.stage, 'cicha'); }
    assert.equal(memOf(p).lastTalk, '2026-07-21');
  }
  assert.ok(seen.has('part'), `wyniki: ${[...seen]}`);
});

test('Stary zapis bez pamięci: domyślne czynniki, odrzucona oferta tworzy pamięć; zawodnik bez klubu i kontraktu', () => {
  const g = newGame('2026-07-20');
  const p = player(g, 3);
  delete p.wishMemory;
  assert.deepEqual(memOf(p), {});
  assert.equal(memoryFactor(p, '2026-07-20'), 1);
  assert.equal(settleFactor(p, '2026-07-20'), 1, 'kontrakt startowy się nie liczy');
  assert.equal(hazardMemFactor(p, '2026-07-20'), 1);
  assert.equal(wishStateText(p, '2026-07-20'), null);
  offerRejected(g, p, { buyerRep: repW() + 20, date: '2026-07-20' });
  assert.ok(Array.isArray(p.wishMemory.rejects));
  const free = { id: 'x1', name: 'Wolny', clubId: null, traits: T() };
  assert.deepEqual(offerRejected(g, free, { buyerRep: 99, date: '2026-07-20' }), { state: null, messages: [] });
  assert.equal(settleFactor(free, '2026-07-20'), 1);
  assert.equal(wishStateText(free, '2026-07-20'), null);
  const r = noteRenewal({ id: 'x2', traits: T() }, '2026-07-20', {});
  assert.equal(r.calmed, true);
});

test('Kluby AI: te same zasady (rzut po odrzuconej ofercie, podwyżka bez pewności)', () => {
  const g = newGame('2026-07-20');
  const states = new Set();
  const ai = CLUBS_PL.filter((c) => c.tier === 1 && c.id !== 'widzew').slice(0, 6);
  for (const c of ai) {
    const rep = clubReputation(c);
    for (const p of squadOf(g.world, c.id).filter((x) => !x.loan && x.contract).slice(0, 6)) {
      delete p.wishMemory; delete p.moveWish;
      states.add(offerRejected(g, p, { buyerRep: rep + 20, date: '2026-07-20' }).state);
    }
  }
  assert.ok(states.has('spokojny') && states.has('rozczarowany'), [...states].join());
  // aiReact: przedłużenie z bonusem przechodzi przez rzut uspokojenia (statystyki raiseCalmed / raiseFailed)
  for (const c of CLUBS_PL.filter((x) => x.tier <= 2 && x.id !== 'widzew')) {
    for (const p of squadOf(g.world, c.id).filter((x) => !x.loan && x.contract)) { delete p.moveWish; openWish(g, p, '2026-07-22', 'hazard'); }
  }
  const st = Object.values(g.market.tstats).reduce((a, s) => ({ ok: a.ok + (s.raiseCalmed ?? 0), no: a.no + (s.raiseFailed ?? 0) }), { ok: 0, no: 0 });
  assert.ok(st.ok > 0 && st.no > 0, JSON.stringify(st));
});

test('Czytelność: opis w karcie i znacznik rozczarowanego tylko u gracza', () => {
  const g = newGame('2026-08-10');
  const p = player(g, 3);
  renew(p, '2026-08-01', 50000);
  assert.match(wishStateText(p, '2026-08-10', (d) => d), /Spokojny do 2027-0\d-\d\d po nowym kontrakcie\. Ostatnio dostał podwyżkę \(2026-08-01\)/);
  p.wishMemory.mood = 'rozczarowany';
  assert.equal(playerTagList(g, p).find((t) => t.k === 'mr')?.label, '?');
  const other = squadOf(g.world, 'legia')[0];
  other.wishMemory = { mood: 'rozczarowany' };
  assert.equal(playerTagList(g, other).some((t) => t.k === 'mr'), false, 'cudzy zawodnik: prywatne');
});
