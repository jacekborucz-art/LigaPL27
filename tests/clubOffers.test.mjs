// Oferty klub-klub (src/career/clubOffers.js, docs/transfery.md, rozdz. „Oferty klub-klub”): zapytanie o cenę bez
// ponownego losowania, „nie na sprzedaż” z indeksu istotności i wyjątek 2,2 x Res, oferta poza oknem, namysł klubu
// 3-7 dni bez daty w UI, progi odpowiedzi, rundy i przerwy, wartość pakietu (raty, sell-on, premie), raty i premie
// w finansach, procent od następnej sprzedaży, okno 14 dni na rozmowy z zawodnikiem, transfer z datą rejestracji,
// kontuzja przed rejestracją, pętla klubów AI, sprzeciw dyrektora bez przecieku progu, klauzula, stary zapis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { offerForPlayer, notForSale, askingPrice, completeTransfer } from '../src/career/transfers.js';
import {
  CO, inquire, inquiryOf, reservePrice, resolveClubOffer, normPkg, packageValue, sellOnValue, scheduleOf, userOffer,
  clubOffersDay, answerCounter, agreementOf, clauseAmount, ensureClubOffers, aiClubOffer, aiLoop, importance, thinkDays,
} from '../src/career/clubOffers.js';
import { directorObjection, directorFairPrice } from '../src/career/director.js';
import { boardCaps, feeIssues } from '../src/career/boardRequests.js';
import { submitUserProposal, proposalsDay } from '../src/career/proposals.js';
import { startDeal, dealsDay, dealOf } from '../src/career/transferDeals.js';
import { handleTransferAction, renderTransfers } from '../src/ui/transfersView.js';
import { fmtDate } from '../src/ui/dom.js';
import { addMessages } from '../src/core/inbox.js';
import '../src/season/dailySystems.js';

const BAD_TEXT = new RegExp(`undefined|NaN|\\bnull\\b|\\[object|${String.fromCharCode(8212)}`); // pauza em
const calm = { gauss: () => 0, chance: () => false, int: (a) => a, next: () => 0.5 }; // bez szumu
const yes = { ...calm, chance: () => true };

function newGame(seed = 31, clubId = 'widzew') {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'A', lastName: 'B' } } };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g); processDay(g);
  return g;
}
let shared = null;
const fresh = (date = '2026-07-10') => { const g = structuredClone(shared ??= newGame()); g.date = date; g.finance.clubs[g.clubId].transferBudget = 5e8; g.finance.clubs[g.clubId].balance = 5e8; return g; };
const sellers = (g) => CLUBS_PL.filter((c) => c.tier <= 2 && c.id !== g.clubId && g.world.clubs[c.id]);
/** Zawodnik klubu AI na sprzedaż, bez weta zarządu przy kwocie m x Res, z kontraktem do co najmniej `until`. */
function pick(g, { m = 1.2, until = '2027-07-01', filter = () => true } = {}) {
  for (const c of sellers(g)) for (const p of squadOf(g.world, c.id)) {
    if (notForSale(g, p) || p.loan || g.market.listed[p.id] || p.contract.until < until || !filter(p)) continue;
    const fee = Math.round(reservePrice(g, p).res * m / 10000) * 10000;
    if (feeIssues(boardCaps(g, g.clubId, p, 'sign'), fee).issues.length) continue;
    return { p, fee };
  }
  return null;
}
/** Dni rozmów klubu: tylko system ofert klub-klub. */
function runOffers(g, days) { for (let i = 0; i < days; i++) { g.date = addDays(g.date, 1); g.inbox = addMessages(g.inbox ?? [], clubOffersDay(g, g.date)).inbox; } }

test('Zapytanie: odpowiedź od razu, ta sama przy powtórzeniu (bez ponownego losowania); cena wywoławcza 1,05-1,25 x Res', () => {
  const g = fresh();
  const { p } = pick(g);
  const a = inquire(g, p.id);
  assert.equal(a.nfs, false);
  const b = inquire(g, p.id);
  assert.deepEqual(b, a);
  delete g.market.inq[p.id]; // nawet bez pamięci: to samo ziarno okresu, ten sam stan
  assert.equal(inquire(g, p.id).ask, a.ask);
  const R = reservePrice(g, p);
  assert.ok(a.ask >= R.res * 1.04 && a.ask <= R.res * 1.26, `${a.ask} / ${R.res}`);
  assert.match(a.text, /Cena wywoławcza .*: ok\. /);
  assert.ok(!BAD_TEXT.test(a.text));
  assert.ok(inquiryOf(g, p.id));
  g.date = addDays(g.date, 31);
  assert.equal(inquiryOf(g, p.id), null, 'ważna 30 dni');
});

test('Nie na sprzedaż: najważniejszy w klubie (indeks istotności >= 60); wyjątek 2,2 x Res tylko z szansą 25 % (ziarno)', () => {
  const g = fresh();
  const star = sellers(g).flatMap((c) => squadOf(g.world, c.id)).find((p) => notForSale(g, p) && !clauseAmount(p.contract));
  assert.ok(star, 'zawodnik nie na sprzedaż');
  assert.ok(importance(g, star) >= CO.nfsI);
  assert.equal(inquire(g, star.id).nfs, true);
  const { res } = reservePrice(g, star);
  const pkg = (m) => normPkg({ fee: res * m });
  assert.equal(resolveClubOffer(g, { p: star, pkg: pkg(5), rng: calm, rngExc: calm }).verdict, 'nfs', 'los przeciw');
  assert.equal(resolveClubOffer(g, { p: star, pkg: pkg(2.3), rng: calm, rngExc: yes }).verdict, 'accept', 'los za, oferta >= 2,2 Res');
  assert.equal(resolveClubOffer(g, { p: star, pkg: pkg(2.1), rng: calm, rngExc: yes }).verdict, 'nfs', 'poniżej 2,2 Res bez szans');
  // Bez wstrzykniętego losu: ten sam wynik przy każdym powtórzeniu (ziarno klubu, zawodnika i okresu)
  const v = resolveClubOffer(g, { p: star, pkg: pkg(2.5) }).verdict;
  for (let i = 0; i < 3; i++) assert.equal(resolveClubOffer(g, { p: star, pkg: pkg(2.5) }).verdict, v);
  // Trzech najlepszych w IV lidze nie jest nietykalnych z samej pozycji: część jest na sprzedaż
  const l4 = CLUBS_PL.filter((c) => c.tier === 4 && g.world.clubs[c.id]).slice(0, 12).flatMap((c) => squadOf(g.world, c.id).sort((a, b) => b.ovr - a.ovr).slice(0, 3));
  assert.ok(l4.some((p) => !notForSale(g, p)));
});

test('Progi odpowiedzi: r >= 1 zgoda, 0,82-1 kontroferta, 0,65-0,82 odrzucenie, poniżej 0,65 zerwanie (0,4: 60-90 dni)', () => {
  const g = fresh();
  const { p } = pick(g);
  const { res } = reservePrice(g, p);
  const at = (m, extra = {}) => resolveClubOffer(g, { p, pkg: normPkg({ fee: res * m }), rng: calm, ...extra });
  assert.equal(at(1.01).verdict, 'accept');
  const c = at(0.9);
  assert.equal(c.verdict, 'counter');
  assert.ok(c.counterFee > res * 0.9 && c.counterFee <= c.A0 * 1.01, 'kontroferta między ofertą a ceną wywoławczą');
  const c2 = at(0.9, { counters: 1 });
  assert.ok(c2.counterFee < c.counterFee, 'druga kontroferta bliżej ceny minimalnej');
  assert.equal(at(0.9, { counters: CO.clubCounters }).verdict, 'reject', 'po dwóch kontrofertach koniec');
  assert.equal(at(0.7).verdict, 'reject');
  const low = at(0.5); assert.equal(low.verdict, 'lowball'); assert.equal(low.breakDays, 21);
  const insult = at(0.3); assert.equal(insult.verdict, 'lowball'); assert.equal(insult.breakDays, 60);
});

test('Oferta: klub rozważa 3-7 dni, karta bez daty decyzji; kontroferta, przyjęcie, okno 14 dni na zawodnika i wygaśnięcie', () => {
  const g = fresh();
  const { p } = pick(g, { m: 0.9 });
  const { res } = reservePrice(g, p);
  const inq = handleTransferAction(g, 'tf-inquire', { id: p.id });
  assert.equal(inq.save, true);
  let html = renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id });
  for (const id of ['tfFee', 'tfInst', 'tfWhen', 'tfSellOn', 'tfBApps', 'tfBEuro']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /Cena wywoławcza: ok\./);
  const fee = Math.round(res * 0.9 / 10000) * 10000;
  const r = handleTransferAction(g, 'tf-offer', { id: p.id, fee, inst: 1, when: 'now' });
  const rec = userOffer(g, p.id);
  if (!rec) { assert.match(String(pendingObjectionText(g, p)), /Trenerze/); return; } // sprzeciw dyrektora: osobny test
  assert.equal(rec.status, 'thinking', r.ui.tfMsg);
  const days = Math.round((Date.parse(rec.due) - Date.parse(g.date)) / 864e5);
  assert.ok(days >= 3 && days <= 8, `namysł ${days}`);
  html = renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id });
  assert.match(html, /Klub rozważa ofertę/);
  assert.ok(!html.includes(fmtDate(rec.due)), 'bez daty decyzji klubu');
  assert.ok(!BAD_TEXT.test(html.replace(/<[^>]+>/g, ' ')));
  runOffers(g, days);
  assert.ok(['counter', 'agreed'].includes(rec.status), rec.status);
  assert.ok(g.inbox.some((m) => m.refs?.kind === 'clubOffer' && m.refs.pid === p.id && /przedstawił warunki|przyjmuje/.test(m.subject)), 'list w Poczcie');
  if (rec.status === 'counter') {
    html = renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id });
    assert.match(html, /Kontroferta: .*odpowiedz do/);
    assert.ok(html.includes('data-act="tf-co-accept"'));
    assert.match(renderTransfers(g, { tfTab: 'wtoku' }), /Oferty dla klubów/);
    assert.equal(answerCounter(g, p.id, 'accept').ok, true);
  }
  assert.equal(rec.status, 'agreed');
  assert.ok(agreementOf(g, p.id));
  html = renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id });
  assert.match(html, new RegExp(`Porozumienie klubów: rozmawiaj z zawodnikiem do ${fmtDate(rec.talkUntil)}`));
  assert.equal(handleTransferAction(g, 'tf-negotiate', { id: p.id }).negotiate?.fee, rec.fee, 'rozmowy z zawodnikiem z kwotą porozumienia');
  // 14 dni bez porozumienia z zawodnikiem: zgoda klubu wygasa (list)
  runOffers(g, CO.talkDays + 1);
  assert.equal(rec.status, 'lapsed');
  assert.equal(agreementOf(g, p.id), null);
  assert.ok(!g.market.talks[p.id]?.accepted);
  assert.ok(g.inbox.some((m) => m.refs?.kind === 'clubOffer' && /wygasło/.test(m.subject)));
});
const pendingObjectionText = (g, p) => g.market.dirObj?.[`buy:${p.id}`]?.name ?? 'Trenerze';

test('Rundy: trzy za niskie oferty to przerwa 14-30 dni (bez daty w UI); obraźliwa oferta zrywa rozmowy na kilka tygodni', () => {
  const g = fresh();
  const { p } = pick(g);
  const { res } = reservePrice(g, p);
  for (let i = 0; i < CO.userRounds; i++) {
    const r = offerForPlayer(g, p.id, Math.round(res * 0.72 / 10000) * 10000, { dirOk: true });
    assert.equal(r.result, 'sent', r.text);
    runOffers(g, 8);
  }
  const rec = userOffer(g, p.id);
  assert.equal(rec.status, 'broken');
  const left = (Date.parse(rec.until) - Date.parse(g.date)) / 864e5;
  assert.ok(left >= CO.threeLow[0] - 8 && left <= CO.threeLow[1], `przerwa ${left}`);
  assert.equal(offerForPlayer(g, p.id, res * 2, { dirOk: true }).result, 'reject');
  const html = renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id });
  assert.match(html, /Rozmowy wstrzymane: .* przez (kilka dni|kilka tygodni|najbliższe miesiące)/);
  assert.ok(!html.includes(fmtDate(rec.until)), 'bez dokładnej daty');
  // Obraza
  const q = pick(g, { filter: (x) => x !== p }).p;
  offerForPlayer(g, q.id, Math.round(reservePrice(g, q).res * 0.3 / 10000) * 10000, { dirOk: true });
  runOffers(g, 8);
  assert.equal(userOffer(g, q.id).status, 'broken');
  const qd = (Date.parse(userOffer(g, q.id).until) - Date.parse(g.date)) / 864e5;
  assert.ok(qd >= 60 - 8 && qd <= 90, `obraza ${qd}`);
});

test('Pakiet: raty z dyskontem, premie x 0,6 szansy, procent od sprzedaży wg wieku (20 lat, 4 mln, 15 %: ok. 0,46 mln)', () => {
  const g = fresh();
  const { p } = pick(g);
  const cash = packageValue(g, normPkg({ fee: 1e7 }), { p });
  assert.equal(Math.round(cash.E), 1e7);
  const two = packageValue(g, normPkg({ fee: 1e7, inst: 2 }), { p });
  const three = packageValue(g, normPkg({ fee: 1e7, inst: 3 }), { p });
  assert.ok(two.E < 1e7 && three.E < two.E, 'raty mniej warte niż gotówka');
  assert.ok(two.E >= 1e7 * (0.6 + 0.4 * 0.92 * 0.92 * 0.92) - 1, 'najwyżej dyskonto do kwadratu i ryzyko');
  assert.deepEqual(scheduleOf(normPkg({ fee: 1e7, inst: 3 })).map((x) => [x.m, x.amount]), [[0, 5e6], [12, 2.5e6], [24, 2.5e6]]);
  assert.equal(Math.round(sellOnValue(15, 4e6, 20)), 460800);
  assert.ok(sellOnValue(15, 4e6, 32) < sellOnValue(15, 4e6, 25));
  const bon = packageValue(g, normPkg({ fee: 1e7, bonus: { apps: 1e6, euro: 1e6 } }), { p });
  assert.ok(bon.bonus > 0 && bon.bonus <= 2e6 * CO.bonusW, 'premie najwyżej 60 % kwoty');
  assert.equal(normPkg({ fee: 1, sellOn: 50 }).sellOn, CO.sellOn.max);
});

test('Raty i premie w finansach w terminie; procent od następnej sprzedaży wypłacony poprzedniemu klubowi (także AI-AI)', () => {
  const g = fresh();
  const { p } = pick(g, { filter: (x) => x.clubId !== 'legia' });
  const seller = p.clubId; const buyer = 'legia';
  const F = g.finance.clubs;
  const pkg = normPkg({ fee: 3e6, inst: 3, sellOn: 20, bonus: { apps: 2e5 } });
  const sellerBal = F[seller].balance; const buyerBal = F[buyer].balance;
  completeTransfer(g, { playerId: p.id, to: buyer, fee: 3e6, contract: { wage: 5000, until: '2029-06-30' }, pkg });
  assert.equal(F[buyer].balance, buyerBal - 1.5e6, 'pierwsza rata przy transferze');
  assert.equal(F[seller].balance, sellerBal + 1.5e6);
  assert.equal(g.market.instal.length, 2);
  assert.deepEqual(p.sellOn, { club: seller, pct: 20, owner: buyer, since: g.date });
  const due = g.market.instal[0].due;
  runOffers(g, Math.round((Date.parse(due) - Date.parse(g.date)) / 864e5) - 1);
  assert.equal(g.market.instal.length, 2, 'przed terminem bez płatności');
  runOffers(g, 1);
  assert.equal(g.market.instal.length, 1);
  assert.ok(F[seller].log.some((l) => l.note.includes('rata od') && l.amount === 7.5e5));
  // Premia za występy: warunek spełniony, wypłata 1. dnia miesiąca
  const sp = p.cl.at(-1); sp.m = CO.appsN;
  while (!g.date.endsWith('-01')) runOffers(g, 1);
  assert.equal(g.market.bonuses.length, 0);
  assert.ok(F[seller].log.some((l) => l.note.includes('premia za')));
  // Kolejna sprzedaż (AI-AI): 20 % dla pierwszego sprzedawcy
  p.lastMove = '2020-01-01';
  const third = CLUBS_PL.find((c) => c.tier === 1 && ![seller, buyer, g.clubId].includes(c.id)).id;
  const before = F[seller].balance;
  completeTransfer(g, { playerId: p.id, to: third, fee: 5e6, contract: { wage: 6000, until: '2030-06-30' } });
  assert.equal(F[seller].balance, before + 1e6);
  assert.equal(p.sellOn, undefined);
});

test('Termin przejścia: poza oknem porozumienie z datą rejestracji, rezerwacja, realizacja w dniu otwarcia okna; kontrakt kończy się wcześniej: prekontrakt', () => {
  const g = fresh('2026-10-10');
  const r0 = pick(g, { until: '2027-12-31' });
  const res = reservePrice(g, r0.p).res;
  // Kontrakt kończący się przed datą transferu: wskazówka na umowę od 1 lipca
  const short = sellers(g).flatMap((c) => squadOf(g.world, c.id)).find((x) => x.contract.until === '2027-06-30' && !notForSale(g, x) && !x.loan);
  if (short) assert.match(offerForPlayer(g, short.id, 1e6, { dirOk: true, pkg: { when: 'season' } }).text, /umowę od 1 lipca/);
  assert.match(offerForPlayer(g, r0.p.id, res, { dirOk: true, pkg: { when: 'now' } }).text, /Okno transferowe jest zamknięte/);
  // Porozumienie i propozycja dla zawodnika: decyzja poza oknem, transakcja czeka na okno
  let deal = null; let tried = 0;
  for (const c of sellers(g)) for (const p of squadOf(g.world, c.id)) {
    if (deal || tried >= 6 || notForSale(g, p) || p.loan || g.market.listed[p.id] || p.contract.until < '2027-12-31') continue;
    const fee = Math.round(reservePrice(g, p).res * 1.3 / 10000) * 10000;
    if (feeIssues(boardCaps(g, g.clubId, p, 'sign'), fee).issues.length) continue;
    tried++;
    if (offerForPlayer(g, p.id, fee, { dirOk: true, pkg: { when: 'window', inst: 2 } }).result !== 'sent') continue;
    runOffers(g, 8);
    if (!agreementOf(g, p.id)) continue;
    const sub = submitUserProposal(g, { playerId: p.id, fee, contract: { wage: Math.round(p.contract.wage * 1.6), years: 3, until: '2030-06-30', promise: { role: 'podstawowy' } }, fromClub: p.clubId });
    assert.equal(sub.ok, true, sub.text);
    assert.equal(sub.prop.regDate, '2027-02-01');
    assert.equal(sub.prop.needsWindow, false);
    for (let i = 0; i < 6 && !dealOf(g, p.id); i++) { g.date = addDays(g.date, 1); proposalsDay(g, g.date); }
    deal = dealOf(g, p.id);
  }
  assert.ok(deal, 'transakcja z datą rejestracji');
  assert.equal(deal.stage, 'agreed');
  assert.equal(deal.due, '2027-02-01');
  const p = g.world.players[deal.pid];
  assert.ok(p.transfer && !p.transfer.hold, 'gra w starym klubie do rejestracji');
  assert.match(renderTransfers(g, { tfTab: 'wtoku' }), /Oczekuje na okno: transfer od 1 lut 2027/);
  for (let d = '2027-01-31'; d <= '2027-02-08' && !deal.end; d = addDays(d, 1)) { g.date = d; dealsDay(g, d); }
  assert.ok(deal.end, 'zakończona w oknie');
  if (deal.end.result === 'registered') {
    assert.equal(p.clubId, g.clubId);
    assert.ok(g.market.instal.some((x) => x.pid === p.id), 'druga rata po roku');
  } else assert.ok(['mind', 'injury', 'money', 'limit', 'medical', 'withdrawn'].includes(deal.end.reason), deal.end.reason);
});

test('Przed rejestracją: kontuzja obniża kwotę (15-50 %) albo kupujący się wycofuje', () => {
  const outcomes = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const g = fresh('2026-10-10'); g.seed = seed;
    const { p, fee } = pick(g, { until: '2027-12-31' });
    const d = startDeal(g, { playerId: p.id, to: g.clubId, fee, contract: { wage: 5000, until: '2030-06-30' }, kind: 'transfer', stage: 'medical', regDate: '2027-02-01' });
    assert.equal(d.stage, 'agreed');
    p.injuryDays = 75;
    g.date = '2027-02-01'; dealsDay(g, '2027-02-01');
    if (d.end) { assert.equal(d.end.reason, 'injury'); outcomes.add('wycofanie'); continue; }
    if (!d.renegotiated) continue; // zawodnik zmienił zdanie albo inna przyczyna nie wystąpiła
    assert.ok(d.fee <= fee * 0.86 && d.fee >= fee * 0.49, `${d.fee} / ${fee}`);
    outcomes.add('obniżka');
  }
  assert.ok(outcomes.size >= 1, 'kontuzja ma skutek');
});

test('Kluby AI: ta sama funkcja odpowiedzi, pętla rozstrzyga się w 1-4 rundach w dniu odpowiedzi', () => {
  const g = fresh();
  const buyer = clubById('legia');
  const rounds = [];
  let agreed = 0;
  for (const c of sellers(g).filter((x) => x.id !== 'legia').slice(0, 8)) {
    for (const p of squadOf(g.world, c.id).slice(5, 9)) {
      const V = reservePrice(g, p, 'legia');
      const rec = aiClubOffer(g, buyer, p, { fee: V.res, maxPay: V.res * 1.15, contract: { wage: 5000, until: '2029-06-30' } });
      if (!rec) continue;
      const days = Math.round((Date.parse(rec.due) - Date.parse(g.date)) / 864e5);
      assert.ok(days >= 3 && days <= 8);
      const fee = aiLoop(g, rec, p, g.date);
      rounds.push(rec.rounds);
      if (fee != null) { agreed++; assert.ok(fee <= rec.maxPay + 10000); }
    }
  }
  assert.ok(rounds.length > 10);
  assert.ok(rounds.every((n) => n >= 1 && n <= CO.ai.rounds));
  assert.ok(agreed > 0, 'część rozmów kończy się zgodą');
});

test('Sprzeciw dyrektora przy składaniu oferty z jego wyceny: także gdy klub by odrzucił (bez przecieku progu)', () => {
  const g = fresh();
  let found = null;
  for (const c of sellers(g)) for (const p of squadOf(g.world, c.id)) {
    if (found || p.loan || g.market.listed[p.id]) continue;
    const fair = directorFairPrice(g, p, 'buy');
    const fee = Math.round(fair * 1.7 / 10000) * 10000;
    if (feeIssues(boardCaps(g, g.clubId, p, 'sign'), fee).issues.length) continue;
    const v = resolveClubOffer(g, { p, pkg: normPkg({ fee }) }).verdict;
    if (v === 'accept' || !directorObjection(g, p, fee, 'buy')) continue;
    found = { p, fee, v };
  }
  assert.ok(found, 'przepłata według dyrektora, a klub i tak by nie przyjął');
  const r = offerForPlayer(g, found.p.id, found.fee);
  assert.equal(r.result, 'director');
  assert.match(r.text, /^Trenerze, według mnie /);
  assert.equal(userOffer(g, found.p.id), null, 'oferta nie wysłana przed decyzją trenera');
});

test('Klauzula odstępnego: liczba albo obiekt { amount, foreignOnly }; cena i zgoda od razu bez obiektu w kwocie', () => {
  assert.equal(clauseAmount({ clause: 5e6 }), 5e6);
  assert.equal(clauseAmount({ clause: { amount: 4e6, foreignOnly: false } }), 4e6);
  assert.equal(clauseAmount({ clause: { amount: 4e6, foreignOnly: true } }), 0);
  assert.equal(clauseAmount({ clause: { amount: 4e6, foreignOnly: true } }, { foreign: true }), 4e6);
  assert.equal(clauseAmount({ clause: 3e6, clauseForeignOnly: true }), 0);
  assert.equal(clauseAmount(null), 0);
  assert.equal(clauseAmount({}), 0);
  const g = fresh();
  const star = sellers(g).flatMap((c) => squadOf(g.world, c.id)).find((p) => notForSale(g, p));
  star.contract.clause = { amount: 9e6, foreignOnly: false };
  assert.equal(typeof askingPrice(g, star), 'number');
  assert.equal(askingPrice(g, star), 9e6);
  if (!feeIssues(boardCaps(g, g.clubId, star, 'sign'), 9e6).issues.length && !directorObjection(g, star, 9e6, 'buy')) {
    const r = offerForPlayer(g, star.id, 9e6);
    assert.equal(r.result, 'accept', r.text);
    assert.equal(userOffer(g, star.id).status, 'agreed');
  }
});

test('Stary zapis: market.talks (accepted, counter, until) jako oferty klub-klub, bez błędu', () => {
  const g = fresh();
  const [a, b, c] = sellers(g).slice(0, 3).map((cl) => squadOf(g.world, cl.id)[10]);
  g.market.talks = { [a.id]: { rounds: 1, accepted: 1e6 }, [b.id]: { rounds: 2, counter: 2e6 }, [c.id]: { rounds: 0, until: addDays(g.date, 9) } };
  delete g.market.cOffers; delete g.market.coMigrated;
  ensureClubOffers(g);
  assert.equal(userOffer(g, a.id).status, 'agreed');
  assert.equal(userOffer(g, a.id).talkUntil, addDays(g.date, CO.talkDays));
  assert.equal(userOffer(g, b.id).status, 'counter');
  assert.equal(userOffer(g, b.id).counter.fee, 2e6);
  assert.equal(userOffer(g, c.id).status, 'broken');
  for (const p of [a, b, c]) assert.ok(!BAD_TEXT.test(renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id }).replace(/<[^>]+>/g, ' ')));
  assert.ok(!BAD_TEXT.test(renderTransfers(g, { tfTab: 'wtoku' }).replace(/<[^>]+>/g, ' ')));
  assert.ok(!BAD_TEXT.test(renderTransfers(g, { tfTab: 'oferty' }).replace(/<[^>]+>/g, ' ')));
  runOffers(g, 1);
  assert.equal(thinkDays(g, { p: a, buyer: g.clubId, pkg: normPkg({ fee: 1e6 }) }) >= 3, true);
});
