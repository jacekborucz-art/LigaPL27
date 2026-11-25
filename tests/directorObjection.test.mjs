// Dyrektor sportowy, ciąg dalszy (docs/dyrektor-sportowy.md, rozdz. 9 i 10): sprzeciw wobec transakcji trenera
// (rzadki przy rozsądnej cenie, częsty przy dużej przepłacie, renegocjacja zależna od Negocjacji, nalegam kosztuje
// zaufanie, bez dostępu do tajnych ofert, list i okno decyzji) oraz rotacja dyrektorów (podebrania, rezygnacje,
// zwolnienia przez właściciela: częstości, listy do gracza, stary zapis).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { runDecision } from '../src/core/decisions.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { offerForPlayer, answerIncoming, answerDirector, pendingObjection, askingPrice, notForSale } from '../src/career/transfers.js';
import { userOffer, talksBroken, reservePrice } from '../src/career/clubOffers.js'; // oferta klub-klub: klub rozważa ofertę kilka dni
import { boardCaps, feeIssues } from '../src/career/boardRequests.js';
import {
  directorObjection, directorFairPrice, directorRenegotiate, objectionChance, insistPenalty, OBJ,
} from '../src/career/director.js';
import { directorOf, staffMarketDay, decideDay } from '../src/career/staffMarket.js';
import { directorRotationWeek, directorResigns, ownerFiresDirector, aiPoachDirector, rotationStats, ROT } from '../src/career/directorRotation.js';
import { clubReputation } from '../src/career/reputation.js';
import { handleTransferAction, renderTransfers } from '../src/ui/transfersView.js';
import { Rng } from '../src/core/rng.js';

const reputationOf = (id) => clubReputation(clubById(id));
import '../src/season/dailySystems.js';

const BAD_TEXT = new RegExp(`undefined|NaN|\\bnull\\b|\\[object|${String.fromCharCode(8212)}`); // pauza em
function newGame(seed = 31, clubId = 'widzew') {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'A', lastName: 'B' } } };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g); processDay(g);
  return g;
}
let shared = null;
const fresh = () => { const g = structuredClone(shared ??= newGame()); g.date = '2026-07-10'; g.finance.clubs[g.clubId].transferBudget = 5e7; g.finance.clubs[g.clubId].balance = 5e7; return g; };
const sellers = (g) => CLUBS_PL.filter((c) => c.tier <= 2 && c.id !== g.clubId && g.world.clubs[c.id]);

/** Pierwszy zawodnik AI, przy którego kupnie za cenę x mnożnik dyrektor się sprzeciwia (bez weta zarządu). */
function findObjection(g, mul = 1.5) {
  for (const c of sellers(g)) {
    for (const p of squadOf(g.world, c.id)) {
      if (notForSale(g, p) || p.loan) continue;
      const fee = Math.round(askingPrice(g, p) * mul / 10000) * 10000;
      if (feeIssues(boardCaps(g, g.clubId, p, 'sign'), fee).issues.length) continue;
      if (directorObjection(g, p, fee, 'buy')) return { p, fee };
    }
  }
  return null;
}

test('Sprzeciw: przy cenie klubu bardzo rzadki, przy dużej przepłacie częsty; szansa rośnie z różnicą i z KAD', () => {
  const g = fresh();
  const users = CLUBS_PL.filter((c) => c.tier === 1).slice(0, 8).map((c) => c.id);
  const res = {};
  for (const u of users) {
    g.clubId = u;
    for (const c of sellers(g)) for (const p of squadOf(g.world, c.id)) {
      if (notForSale(g, p)) continue;
      const price = reservePrice(g, p, u).res; // cena klubu: jego minimum (dyrektor liczy z tej samej wyceny, Nov 25, 2026)
      for (const m of [1, 2]) {
        const fee = price * m;
        if (feeIssues(boardCaps(g, u, p, 'sign'), fee).issues.length) continue; // weto zarządu ma pierwszeństwo
        res[m] ??= { n: 0, o: 0 }; res[m].n++;
        if (directorObjection(g, p, fee, 'buy')) res[m].o++;
      }
    }
  }
  const rate = (m) => res[m].o / res[m].n;
  assert.ok(rate(1) < 0.05, `cena klubu: ${rate(1)}`);
  assert.ok(rate(2) > 0.6, `dwa razy cena klubu: ${rate(2)}`);
  // Szansa: zero do progu, rośnie z różnicą i atrybutem Zarządzanie kadrą
  assert.equal(objectionChance(OBJ.thr, 10), 0);
  assert.ok(objectionChance(0.5, 10) > objectionChance(0.3, 10));
  assert.ok(objectionChance(0.5, 20) > objectionChance(0.5, 10) && objectionChance(0.5, 10) > objectionChance(0.5, 1));
  assert.ok(objectionChance(5, 20) <= 0.95);
  // Sprzedaż: oferty klubów AI (0,85-1,12 wartości) rzadko, sprzedaż za pół wartości często
  g.clubId = 'widzew';
  let low = 0; let fair = 0; let n = 0;
  for (const u of users) {
    g.clubId = u;
    for (const p of squadOf(g.world, u)) { n++; if (directorObjection(g, p, Math.round(p.value * 0.95), 'sell')) fair++; if (directorObjection(g, p, Math.round(p.value * 0.45), 'sell')) low++; }
  }
  assert.ok(fair / n < 0.04, `sprzedaż za wartość: ${fair / n}`);
  assert.ok(low / n > 0.35, `sprzedaż za pół wartości: ${low / n}`);
});

test('Sprzeciw: jeden rzut (zmiana kwoty nie losuje od nowa), wakat i gra bez sztabu bez sprzeciwu, bez cudzych ofert', () => {
  const g = fresh();
  const x = findObjection(g, 1.6);
  assert.ok(x, 'zawodnik ze sprzeciwem');
  // Wyższa kwota: sprzeciw zostaje (szansa rośnie, ten sam rzut)
  assert.ok(directorObjection(g, x.p, x.fee * 1.1, 'buy'));
  // Tajne oferty innych klubów nie zmieniają wyceny ani decyzji dyrektora
  const before = JSON.stringify([directorFairPrice(g, x.p, 'buy'), directorObjection(g, x.p, x.fee, 'buy')]);
  const other = CLUBS_PL.find((c) => c.tier === 1 && c.id !== g.clubId && c.id !== x.p.clubId);
  (g.market.pending ??= []).push({ id: 'tajna', pid: x.p.id, to: other.id, fee: x.fee * 3, status: 'open', decide: addDays(g.date, 3), contract: { wage: 99999 } });
  g.market.offers.push({ id: 'tajna-o', kind: 'outgoing', playerId: x.p.id, from: other.id, fee: x.fee * 3, status: 'open' });
  g.market.talks[x.p.id] = { rounds: 1, counter: x.fee * 2 };
  assert.equal(JSON.stringify([directorFairPrice(g, x.p, 'buy'), directorObjection(g, x.p, x.fee, 'buy')]), before);
  const r = offerForPlayer(g, x.p.id, x.fee);
  assert.equal(r.result, 'director');
  assert.ok(!r.text.includes(other.name), 'bez nazwy klubu z tajną ofertą');
  assert.match(r.text, /^Trenerze, według mnie .* jest wart ok\. .*Płacimy .*, czyli o \d+ % za dużo\.$/);
  // Wakat: obowiązki zarządu, bez sprzeciwu (zostaje weto); gra bez stanu sztabu: bez sprzeciwu
  const d = directorOf(g, g.clubId);
  g.staff.people[d.id].club = null; delete g.staff.dir[g.clubId];
  assert.equal(directorObjection(g, x.p, x.fee * 2, 'buy'), null);
  assert.equal(directorObjection({ ...g, staff: undefined }, x.p, x.fee * 2, 'buy'), null);
});

test('Kupno: okno sprzeciwu w karcie, wycofanie bez kary, nalegam (zaufanie -1, więcej przy dużej przepłacie, zapis), renegocjacja', () => {
  const g = fresh();
  const x = findObjection(g, 1.6);
  const key = `buy:${x.p.id}`;
  // Ekran: panel sprzeciwu z trzema decyzjami zamiast formularza oferty
  const a = handleTransferAction(g, 'tf-offer', { id: x.p.id, fee: x.fee });
  assert.equal(a.ui.tfMsg, null);
  const html = renderTransfers(g, { tfTab: 'rynek', tfPlayer: x.p.id });
  for (const act of ['reneg', 'insist', 'back']) assert.ok(html.includes(`data-act="tf-dir" data-k="${key}" data-a="${act}"`), act);
  assert.ok(html.includes('Sprzeciw dyrektora sportowego') && !html.includes('id="tfFee"'));
  assert.ok(!BAD_TEXT.test(html.replace(/<[^>]+>/g, ' ')), 'bez błędnych tekstów');
  // Wycofanie: bez kary, bez porozumienia
  const t0 = g.board.trust;
  const b = handleTransferAction(g, 'tf-dir', { k: key, a: 'back' });
  assert.match(b.ui.tfMsg, /Wycofujesz ofertę/);
  assert.equal(g.board.trust, t0);
  assert.ok(!g.market.talks[x.p.id]?.accepted && !userOffer(g, x.p.id));
  assert.equal(pendingObjection(g, key), null);
  assert.equal(g.board.requests.dirLog[0].action, 'back');
  // Nalegam: transakcja idzie dalej, zaufanie spada (kara z różnicy)
  assert.equal(offerForPlayer(g, x.p.id, x.fee).result, 'director');
  const obj = pendingObjection(g, key);
  const c = answerDirector(g, key, 'insist');
  assert.equal(c.result, 'sent', 'oferta idzie do klubu, który rozważa ją kilka dni');
  assert.equal(userOffer(g, x.p.id).status, 'thinking');
  assert.equal(userOffer(g, x.p.id).pkg.fee, x.fee);
  assert.equal(g.board.trust, t0 - insistPenalty(obj.gap));
  assert.match(c.text, /Zaufanie zarządu: \d+ na 100 \(-\d\)/);
  assert.equal(g.board.requests.dirLog[0].action, 'insist');
  assert.equal(g.board.requests.dirLog[0].trust, -insistPenalty(obj.gap));
  assert.equal(insistPenalty(0.3), 1); assert.equal(insistPenalty(0.6), 2); assert.equal(insistPenalty(1.2), 3);
  // Panel zarządu: historia sprzeciwów
  // Renegocjacja (nowa gra, ten sam zawodnik): niższa kwota albo druga strona zostaje przy swojej
  const g2 = fresh();
  assert.equal(offerForPlayer(g2, x.p.id, x.fee).result, 'director');
  const t2 = g2.board.trust;
  const r = answerDirector(g2, key, 'reneg');
  if (r.done && r.ok) {
    const fee = userOffer(g2, x.p.id).pkg.fee; // niższa oferta, klub ją rozważa
    assert.ok(fee < x.fee && fee >= x.fee * 0.84);
    assert.equal(g2.board.trust, t2);
  } else if (r.tried) {
    assert.ok(pendingObjection(g2, key).tried);
    assert.equal(answerDirector(g2, key, 'reneg').ok, false, 'drugiej renegocjacji nie ma');
    assert.equal(answerDirector(g2, key, 'back').done, true);
  } else assert.ok(talksBroken(g2, x.p.id), 'klub zrywa rozmowy');
  // Sprawa z wczoraj jest nieaktualna
  const g3 = fresh();
  offerForPlayer(g3, x.p.id, x.fee);
  g3.date = addDays(g3.date, 1);
  assert.equal(answerDirector(g3, key, 'insist').ok, false);
});

test('Renegocjacja zależy od Negocjacji dyrektora (szansa i wielkość 5-15 %), porażka rzadko kończy rozmowy', () => {
  const g = fresh();
  const d = directorOf(g, g.clubId);
  const run = (neg) => {
    d.a = { ...d.a, NEG: neg }; d.adapt = null;
    let ok = 0; let quit = 0; let sum = 0; const N = 3000;
    for (let i = 0; i < N; i++) {
      const r = directorRenegotiate(g, { kind: i % 2 ? 'buy' : 'sell', pid: `p${i}`, fee: 1_000_000 + i * 10_000, dir: d.id });
      if (r.ok) { ok++; sum += r.r; assert.ok(r.r >= 0.04 && r.r <= 0.16, `zmiana ${r.r}`); } else if (r.quit) quit++;
    }
    return { ok: ok / N, r: sum / ok, quit: quit / (N - ok) };
  };
  const lo = run(1); const mid = run(10); const hi = run(20);
  assert.ok(lo.ok < mid.ok && mid.ok < hi.ok, `szanse ${lo.ok} ${mid.ok} ${hi.ok}`);
  assert.ok(Math.abs(mid.ok - OBJ.reneg.base) < 0.04);
  assert.ok(hi.r > lo.r, 'lepszy negocjator wyciąga więcej');
  assert.ok(hi.quit < 0.15 && lo.quit < 0.15, 'druga strona rzadko się wycofuje');
});

test('Sprzedaż: sprzeciw przy ofercie poniżej wartości, list dyrektora z decyzją, nalegam idzie dalej, wycofanie przywraca ofertę', () => {
  const g = fresh();
  let o = null; let r = null;
  for (const p of squadOf(g.world, g.clubId)) {
    o = { id: `of-t-${p.id}`, kind: 'incoming', playerId: p.id, from: 'legia', fee: Math.round(p.value * 0.4 / 10000) * 10000, status: 'open', date: g.date, expires: addDays(g.date, 6) };
    g.market.offers.unshift(o);
    r = answerIncoming(g, o.id, 'accept');
    if (r.director) break;
    o.status = 'withdrawn';
  }
  assert.ok(r?.director, 'oferta ze sprzeciwem');
  assert.match(r.text, /Sprzedajemy go za .*, czyli o \d+ % poniżej jego wartości\./);
  assert.equal(o.status, 'open');
  // Poczta: list z trzema decyzjami, wycofanie zostawia ofertę otwartą
  const mail = { id: 'm1', refs: { kind: 'incomingOffer', offerId: o.id }, resolved: true };
  g.inbox = [mail];
  const letters = runDecision(g, mail, 'accept');
  assert.equal(letters.length, 1);
  assert.deepEqual(letters[0].actions.map((a) => a.id), ['reneg', 'insist', 'back']);
  assert.match(letters[0].subject, /^Sprzeciw dyrektora sportowego: /);
  assert.ok(!BAD_TEXT.test(letters[0].body));
  const back = runDecision(g, letters[0], 'back');
  assert.match(back[0].body, /Oferta czeka na odpowiedź do/);
  assert.equal(o.status, 'open');
  assert.equal(g.inbox[0].resolved, false, 'list z ofertą znów czeka na decyzję');
  // Ekran Oferty: panel sprzeciwu przy ofercie
  answerIncoming(g, o.id, 'accept');
  const html = renderTransfers(g, { tfTab: 'oferty' });
  assert.ok(html.includes(`data-k="sell:${o.id}" data-a="insist"`));
  assert.ok(!BAD_TEXT.test(html.replace(/<[^>]+>/g, ' ')));
  // Nalegam: sprzedaż idzie dalej (propozycja dla zawodnika), zaufanie spada
  const t0 = g.board.trust;
  const gap = pendingObjection(g, `sell:${o.id}`).gap;
  const c = handleTransferAction(g, 'tf-dir', { k: `sell:${o.id}`, a: 'insist' });
  assert.match(c.ui.tfMsg, /^Nalegasz mimo sprzeciwu dyrektora\./);
  assert.notEqual(o.status, 'open');
  assert.equal(g.board.trust, t0 - insistPenalty(gap));
  assert.equal(g.board.requests.dirLog[0].kind, 'sell');
});

test('Rotacja: rezygnacje i zwolnienia przez właściciela rzadkie (ok. 2-3 % i 2 % na klub w sezonie), podebrania kilka w kraju', () => {
  // Rezygnacje i zwolnienia: 3 sezony tygodni (wakaty obsadza staffMarketDay w poniedziałek)
  let resign = 0; let fire = 0; let clubs = 0;
  for (const seed of [1, 2, 3]) {
    const g = fresh();
    g.seed = `rot${seed}`;
    clubs = Object.keys(g.staff.dirInit).length;
    let date = '2026-07-13'; // poniedziałek
    for (let w = 0; w < 52; w++) {
      g.date = date;
      staffMarketDay(g, date);
      directorRotationWeek(g, date);
      date = addDays(date, 7);
    }
    const st = rotationStats(g, 2026);
    resign += st.resign; fire += st.fire;
  }
  const er = ROT.resign * clubs * 3; const ef = ROT.fire * clubs * 3;
  assert.ok(resign > er * 0.4 && resign < er * 1.8, `rezygnacje ${resign} wobec ${er}`);
  assert.ok(fire > ef * 0.3 && fire < ef * 1.9, `zwolnienia ${fire} wobec ${ef}`);
});

test('Rotacja: list przy rezygnacji i zwolnieniu dyrektora gracza, następca od zarządu, media z ligi, stary zapis', () => {
  const g = fresh();
  g.date = '2026-09-14';
  const d = directorOf(g, g.clubId);
  const m = directorResigns(g, g.clubId, g.date, 'rodzina');
  assert.equal(m[0].from, `${d.name}, dyrektor sportowy`);
  assert.match(m[0].subject, /^Dyrektor sportowy rezygnuje: /);
  assert.equal(directorOf(g, g.clubId), null);
  assert.equal(g.staff.people[d.id], undefined, 'odchodzi z polskiej piłki');
  const next = staffMarketDay(g, '2026-09-21'); // poniedziałek: zarząd obsadza wakat
  const nd = directorOf(g, g.clubId);
  assert.ok(nd && next.some((x) => x.subject === `Nowy dyrektor sportowy: ${nd.name}`));
  // Zwolnienie przez właściciela: odprawa, nowy dyrektor od razu, list z powodem
  g.date = '2026-10-05';
  nd.since = '2025-07-01';
  const bal = g.finance.clubs[g.clubId].balance;
  const f = ownerFiresDirector(g, g.clubId, g.date, 'oszczednosci');
  assert.match(f[0].subject, /^Zarząd zwalnia dyrektora sportowego: /);
  assert.match(f[0].body, /Decyzja nie wynika z Pańskiej prośby/);
  assert.ok(directorOf(g, g.clubId) && directorOf(g, g.clubId).id !== nd.id);
  assert.ok(g.finance.clubs[g.clubId].balance < bal, 'odprawa');
  assert.ok(g.staff.dirPool.includes(nd.id), 'zwolniony na liście wolnych');
  for (const x of [...m, ...next, ...f]) assert.ok(!BAD_TEXT.test(`${x.subject} ${x.body}`), x.subject);
  // Klub AI: wiadomość w Mediach z kluczem „dyrektor:” (filtr ligi gracza)
  const ai = CLUBS_PL.find((c) => c.tier === 1 && c.id !== g.clubId).id;
  const mm = ownerFiresDirector(g, ai, g.date, 'konflikt');
  assert.ok(mm[0].key.startsWith(`dyrektor:${ai}:`) && mm[0].category === 'media');
  assert.equal(directorOf(g, ai), null);
  const st = rotationStats(g, 2026);
  assert.deepEqual([st.resign, st.fire], [1, 2]);
  // Stary zapis bez liczników i historii
  const old = fresh();
  delete old.staff.dirRot; delete old.staff.dirLog; delete old.board.requests?.dirLog;
  assert.deepEqual(rotationStats(old, 2026), { poachTry: 0, poach: 0, resign: 0, fire: 0 });
  old.date = '2026-07-13';
  assert.ok(Array.isArray(directorRotationWeek(old, old.date)));
});

test('Rotacja: klub AI podbiera dyrektora z klubu o niższej reputacji (zgoda osoby, rekompensata albo blokada), list do gracza', () => {
  const g = newGame(31, 'puszcza'); // klub gracza z niską reputacją (Widzew: żaden klub w Polsce nie ma o 15 punktów więcej)
  g.date = '2026-07-13';
  // Jedynym możliwym celem jest dyrektor gracza: pozostali dopiero zatrudnieni (pierwsze 6 miesięcy bez prób)
  for (const id of Object.keys(g.staff.dir)) if (id !== g.clubId) g.staff.people[g.staff.dir[id]].since = g.date;
  const d = directorOf(g, g.clubId);
  d.a = { NEG: 14, RYN: 14, SIE: 14, KAD: 14 }; d.q = 14;
  const out = aiPoachDirector(g, g.date, new Rng('test-podbieranie'));
  const offer = g.staff.offers.find((o) => o.pid === d.id);
  assert.ok(offer, 'oferta dla dyrektora gracza');
  const buyer = offer.club;
  assert.ok(reputationOf(buyer) >= reputationOf(g.clubId) + 15, 'klub o wyższej reputacji');
  assert.ok(offer.wage >= Math.round(d.wage * 1.15 / 100) * 100);
  assert.equal(out.length, 1);
  assert.equal(out[0].from, 'Zarząd klubu');
  assert.match(out[0].body, new RegExp(`${clubById(buyer).name} złożył ofertę naszemu dyrektorowi sportowemu ${d.name}`));
  assert.ok(!out[0].actions?.length, 'decyduje zarząd, nie trener');
  assert.equal(typeof g.staff.block[d.id].blocked, 'boolean');
  // Decyzja osoby po 2-3 dniach: przejście (rekompensata albo kara) albo zostaje
  const msgs = decideDay(g, g.staff.decide[d.id]);
  if (d.club === buyer) {
    assert.equal(rotationStats(g, 2026).poach, 1);
    assert.ok(msgs.some((m) => m.from === 'Zarząd klubu' && m.subject.includes(d.name)));
  } else assert.equal(d.club, g.clubId);
  assert.equal(rotationStats(g, 2026).poachTry, 1);
});
