// Zawodnicy z zagranicy na rynku (src/career/foreignPool.js, docs/transfery.md rozdz. 9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import {
  POOL, POOL_REGIONS, BANDS, addPoolPlayers, topUpPool, foreignPoolDay, ensureForeignPool, isPoolContracted, poolList,
  foreignAskingPrice, offerForForeign, poolSellerClub, regionOf, upcomingWindow, leagueL, poolCandidates,
} from '../src/career/foreignPool.js';
import { offerForPlayer, playerWillingness, askingPrice, marketLists } from '../src/career/transfers.js';
import { startDeal, dealOf, dealStages } from '../src/career/transferDeals.js';
import { renderTransfers, handleTransferAction } from '../src/ui/transfersView.js';
import { startNegotiation, renderNegotiation } from '../src/ui/negotiationView.js';
import { GROUP } from '../src/career/squad.js';
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
/** Lekki stan gry do generowania puli bez świata ligi. */
const bare = (seed) => ({ seed, world: { players: {} }, market: { free: [], foreign: [], talks: {} } });
const rich = (g, x = 5e7) => { const c = g.finance.clubs[g.clubId]; c.transferBudget = x; c.balance = Math.max(c.balance, x); };
const cheapest = (g) => poolList(g).filter((p) => !p.free).sort((a, b) => foreignAskingPrice(g, a) - foreignAskingPrice(g, b))[0];

test('Nowa gra: 100 zawodników z zagranicy, ok. 45 wolnych w market.free, reszta z kontraktem w klubie zagranicznym', () => {
  const g = newGame();
  const ids = g.market.foreign;
  assert.equal(ids.length, POOL.size);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith('zag-')));
  assert.ok(g.market.foreignPoolV1);
  const ps = ids.map((id) => g.world.players[id]);
  const free = ps.filter((p) => p.free);
  const con = ps.filter((p) => !p.free);
  assert.ok(free.length >= 33 && free.length <= 57, `wolnych ${free.length}`);
  assert.ok(free.every((p) => g.market.free.includes(p.id) && p.clubId === null && !p.contract && p.askWage > 0 && p.freeSince));
  for (const p of con) {
    assert.ok(isPoolContracted(p), p.id);
    assert.equal(p.clubId, null);
    assert.ok(p.foreignPool);
    for (const k of ['country', 'club', 'league', 'since']) assert.ok(p.abroad[k] != null, `${p.id} abroad.${k}`);
    const years = Number(p.contract.until.slice(0, 4)) - 2026;
    assert.ok(years >= 1 && years <= 3, `${p.id} kontrakt ${p.contract.until}`);
    assert.ok(p.contract.wage >= 500);
    assert.ok(!g.market.free.includes(p.id));
  }
  assert.ok(ps.every((p) => p.nat !== 'POL'));
  assert.equal(marketLists(g).abroad.length, 100);
});

test('Skład puli: regiony, poziomy, wolni i kontrakty zgodne z ustawieniami (1000 zawodników)', () => {
  const g = bare(7);
  const ps = addPoolPlayers(g, 1000, '2026-07-01', 'proba');
  const share = (f) => ps.filter(f).length / ps.length;
  const regionShare = {};
  for (const [r, cfg] of Object.entries(POOL_REGIONS)) regionShare[r] = share((p) => cfg.nats[p.nat] != null);
  for (const [r, cfg] of Object.entries(POOL_REGIONS)) assert.ok(Math.abs(regionShare[r] - cfg.w) < 0.04, `${r}: ${regionShare[r]} zamiast ${cfg.w}`);
  assert.ok(share((p) => p.nat === 'ESP') < 0.07 && share((p) => p.nat === 'POR') < 0.07);
  assert.ok(Math.abs(share((p) => p.free) - POOL.free) < 0.04, `wolnych ${share((p) => p.free)}`);
  assert.ok(share((p) => p.free && p.poolBand === 'czolowka') < 0.1, 'najlepsi zwykle z kontraktem');
  for (const b of BANDS) assert.ok(Math.abs(share((p) => p.poolBand === b.key) - b.w) < 0.05, b.key);
  const avg = (k) => { const xs = ps.filter((p) => p.poolBand === k); return xs.reduce((s, p) => s + p.ovr, 0) / xs.length; };
  assert.ok(avg('czolowka') > avg('srodek') && avg('srodek') > avg('mlodzi'));
  const young = ps.filter((p) => p.poolBand === 'mlodzi');
  assert.ok(young.every((p) => p.age >= 18 && p.age <= 21));
  assert.ok(young.filter((p) => p.hidden.POT >= p.ovr + 2).length / young.length > 0.9, 'młodzi mają wyższy potencjał');
  // Klub: zawsze prawdziwy (kluby_uefa.json i kluby_swiat.js), opis ligi tylko dla kraju bez klubów (v1.21 Beta)
  const con = ps.filter((p) => !p.free);
  assert.ok(con.every((p) => p.abroad.clubId && !/^klub z ligi /.test(p.abroad.club)));
  assert.ok(con.filter((p) => p.nat === 'BRA').every((p) => p.abroad.clubId.startsWith('sw-bra-')));
  assert.ok(con.some((p) => p.abroad.club === 'Hajduk Split' || p.abroad.club === 'HNK Rijeka' || p.abroad.club === 'Dinamo Zagrzeb'));
  assert.equal(regionOf('BRA'), 'amerykaPd');
  assert.equal(regionOf('ESP'), 'inne');
  assert.ok(leagueL('ESP') > leagueL('GHA'));
});

test('Pula deterministyczna: to samo ziarno to ci sami zawodnicy, inne ziarno to inni', () => {
  const a = addPoolPlayers(bare(11), 30, '2026-07-01', 'start');
  const b = addPoolPlayers(bare(11), 30, '2026-07-01', 'start');
  const c = addPoolPlayers(bare(12), 30, '2026-07-01', 'start');
  assert.deepEqual(a.map((p) => [p.id, p.name, p.nat, p.ovr, p.abroad?.club ?? null]), b.map((p) => [p.id, p.name, p.nat, p.ovr, p.abroad?.club ?? null]));
  assert.notDeepEqual(a.map((p) => p.name), c.map((p) => p.name));
  assert.equal(a[0].id, 'zag-start-1');
});

test('Cena: słabsze ligi sprzedają taniej (x1,0-1,15 wartości), mocniejsze oraz Hiszpania i Portugalia drożej (x1,3-1,5)', () => {
  const g = bare(21);
  g.date = '2026-07-01';
  const ps = addPoolPlayers(g, 400, '2026-07-01', 'ceny').filter((p) => !p.free);
  for (const p of ps) {
    const m = p.abroad.priceMul;
    if (['ESP', 'POR', 'BRA', 'ARG'].includes(p.nat)) assert.ok(m >= 1.3 && m <= 1.5, `${p.nat} ${m}`);
    if (leagueL(p.nat) < 10.5) assert.ok(m >= 1.0 && m <= 1.15, `${p.nat} ${m}`);
    assert.ok(foreignAskingPrice(g, p) >= 25000);
  }
});

test('Uzupełnienie przed oknem: wraca do 100, odchodzą podpisani, ok. 15 % z kontraktem zostaje za granicą', () => {
  const g = newGame('widzew', 62, '2027-01-24');
  assert.equal(upcomingWindow('2027-01-25')?.from, '2027-02-01');
  assert.equal(upcomingWindow('2027-01-24'), null);
  assert.equal(upcomingWindow('2026-12-01'), null);
  const ids = [...g.market.foreign];
  // Trzech wolnych podpisuje klub (poza pulą), jeden z kontraktem trafia do polskiego klubu
  const freeIds = ids.filter((id) => g.world.players[id].free).slice(0, 3);
  for (const id of freeIds) { g.world.players[id].clubId = 'lech'; g.market.free = g.market.free.filter((x) => x !== id); }
  const con = ids.filter((id) => !g.world.players[id].free);
  g.world.players[con[0]].clubId = 'legia';
  const added = foreignPoolDay(g, '2027-01-25');
  assert.equal(g.market.foreign.length, POOL.size);
  assert.equal(g.market.foreignTop, '2027-02-01');
  const gone = con.slice(1).filter((id) => !g.market.foreign.includes(id));
  assert.ok(gone.length >= 2 && gone.length <= 18, `odpłynęło ${gone.length}`);
  assert.ok(gone.every((id) => !g.world.players[id]), 'zawodnicy, którzy zostali za granicą, znikają ze świata');
  assert.ok(g.world.players[con[0]], 'zawodnik w polskim klubie zostaje w świecie gry');
  assert.equal(added, 4 + gone.length);
  assert.ok(g.market.foreign.some((id) => id.startsWith('zag-2027-02-01-')));
  // Drugi raz w tym samym oknie nic się nie dzieje
  assert.equal(foreignPoolDay(g, '2027-01-26'), 0);
  assert.equal(foreignPoolDay(g, '2027-02-03'), 0);
});

test('Uzupełnienie: wygasły kontrakt za granicą zamienia zawodnika w wolnego; w toku rozmów nikt nie znika', () => {
  const g = newGame('widzew', 63, '2027-01-24');
  const con = g.market.foreign.filter((id) => !g.world.players[id].free);
  const exp = g.world.players[con[0]];
  exp.contract.until = '2026-12-31';
  for (const id of con.slice(1)) g.market.talks[id] = { rounds: 1, accepted: 100000 };
  topUpPool(g, '2027-01-25', 'test');
  assert.ok(exp.free && !exp.contract && !exp.abroad && g.market.free.includes(exp.id));
  assert.ok(g.market.foreign.includes(exp.id));
  assert.ok(con.slice(1).every((id) => g.market.foreign.includes(id)));
});

test('Oferta za zawodnika z kontraktem za granicą: odrzucenie, kontroferta, przyjęcie, przerwa po trzech odrzuceniach, okno', () => {
  const g = newGame('widzew', 64, '2026-07-10');
  rich(g);
  const p = cheapest(g);
  const price = foreignAskingPrice(g, p);
  assert.equal(askingPrice(g, p), price);
  const low = offerForForeign(g, p.id, Math.round(price * 0.5));
  assert.equal(low.result, 'reject');
  const mid = offerForForeign(g, p.id, Math.round(price * 0.9));
  assert.equal(mid.result, 'counter');
  assert.equal(mid.counter, price);
  const ok = offerForPlayer(g, p.id, price); // offerForPlayer przekazuje do offerForForeign
  assert.equal(ok.result, 'accept');
  assert.equal(g.market.talks[p.id].accepted, price);
  assert.match(ok.text, /przyjmuje ofertę/);
  // Inny zawodnik: trzy za niskie oferty to przerwa 14 dni
  const q = poolList(g).filter((x) => !x.free && x.id !== p.id).sort((a, b) => foreignAskingPrice(g, a) - foreignAskingPrice(g, b))[0];
  for (let i = 0; i < 2; i++) offerForForeign(g, q.id, 10000);
  const third = offerForForeign(g, q.id, 10000);
  assert.match(third.text, /kończy rozmowy/);
  assert.match(offerForForeign(g, q.id, foreignAskingPrice(g, q)).text, /nie chce rozmawiać/);
  // Poza oknem
  g.date = '2026-10-10';
  assert.match(offerForForeign(g, q.id, 1e7).text, /Okno transferowe jest zamknięte/);
  // Wolny z puli nie jest „z kontraktem”
  const f = poolList(g).find((x) => x.free);
  assert.equal(offerForForeign(g, f.id, 100000).result, 'reject');
});

test('Budżet i weto zarządu blokują ofertę za granicę', () => {
  const g = newGame('widzew', 65, '2026-07-10');
  const p = cheapest(g);
  const c = g.finance.clubs[g.clubId];
  c.transferBudget = 0;
  assert.match(offerForForeign(g, p.id, foreignAskingPrice(g, p)).text, /budżet/);
  rich(g, 1e9);
  const top = poolList(g).filter((x) => !x.free).sort((a, b) => b.value - a.value)[0];
  const r = offerForForeign(g, top.id, top.value * 8);
  assert.equal(r.result, 'reject');
  assert.ok(r.veto, 'kwota wielokrotnie ponad wartość: weto zarządu');
});

test('Po zgodzie klubu: rozmowy z zawodnikiem (fromClub to klub zagraniczny), transakcja z podróżą, zawodnik w klubie, odstępne zaksięgowane', () => {
  const g = newGame('widzew', 66, '2026-07-10');
  rich(g);
  const p = cheapest(g);
  const club = p.abroad.club;
  const price = foreignAskingPrice(g, p);
  assert.equal(offerForForeign(g, p.id, price).result, 'accept');
  // Zawodnik chce rozmawiać (nastawienie liczone z reputacji ligi, nie jak wolny)
  const w = playerWillingness(g, p);
  assert.ok(w.verdict && w.verdict !== 'odmowa', w.verdict);
  const r = handleTransferAction(g, 'tf-negotiate', { id: p.id });
  assert.ok(r.negotiate, r.ui?.tfMsg);
  assert.equal(r.negotiate.fee, price);
  assert.equal(r.negotiate.fromClub.name, club);
  const s = startNegotiation(g, r.negotiate);
  assert.ok(s.ok, s.text);
  assert.equal(s.ng.fromClubName, club);
  assert.ok(s.ng.fromClub);
  const html = renderNegotiation(g, s.ng);
  assert.ok(html.includes('Kwota transferu'));
  assert.ok(html.includes(club.replace(/&/g, '&amp;')));
  // Jak w app.js po przyjęciu warunków: transakcja od testów medycznych
  const contract = { wage: Math.round(p.contract.wage * 1.2 / 100) * 100, until: '2029-06-30', years: 3 };
  const d = startDeal(g, { playerId: p.id, to: g.clubId, fee: price, contract, kind: s.ng.fromClub ? 'transfer' : 'free', stage: 'medical' });
  assert.ok(d);
  assert.equal(d.type, 'foreign');
  assert.equal(d.origin.name, club);
  assert.ok(dealStages(d).includes('travel'));
  assert.ok(renderTransfers(g, { tfTab: 'wtoku' }).includes(club.replace(/&/g, '&amp;')));
  const out0 = g.finance.clubs.widzew.log.length;
  step(g, 10);
  assert.ok(d.end, 'transakcja zakończona');
  assert.equal(d.end.result, 'registered', `wynik ${d.end.reason}`);
  assert.equal(p.clubId, 'widzew');
  assert.ok(g.world.clubs.widzew.squad.includes(p.id));
  assert.equal(p.abroad, undefined);
  assert.ok(!g.market.foreign.includes(p.id));
  assert.equal(p.contract.wage, contract.wage);
  const booked = g.finance.clubs.widzew.log.slice(0, g.finance.clubs.widzew.log.length - out0 + 5).find((e) => e.kind === 'transfers' && e.dir === 'out' && e.note.includes(p.name));
  assert.ok(booked, 'odstępne zaksięgowane jako wydatek');
  assert.equal(booked.amount, d.fee);
  assert.ok(booked.note.includes(club));
  const h = g.market.history.find((x) => x.playerId === p.id);
  assert.equal(h.from, null);
  assert.equal(h.fromName, club);
  assert.ok(renderTransfers(g, { tfTab: 'oferty' }).includes(`z ${club.replace(/&/g, '&amp;')}`));
});

test('Wolny zawodnik z puli podpisuje się jak zwykły wolny', () => {
  const g = newGame('widzew', 67, '2026-07-10');
  const f = poolList(g).find((x) => x.free);
  const r = handleTransferAction(g, 'tf-negotiate', { id: f.id });
  assert.ok(r.negotiate);
  assert.equal(r.negotiate.fromClub, null);
  assert.equal(r.negotiate.fee, 0);
  const d = startDeal(g, { playerId: f.id, to: g.clubId, fee: 0, contract: { wage: f.askWage, until: '2028-06-30', years: 2 }, kind: 'free', stage: 'medical' });
  assert.equal(d.type, 'free');
  assert.equal(d.origin, null);
  step(g, 6);
  assert.equal(f.clubId, 'widzew');
  assert.ok(!g.market.free.includes(f.id) && !g.market.foreign.includes(f.id));
});

test('Klub AI rzadko kupuje z puli: kandydaci tylko z kontraktem, w grupie pozycji, za co najwyżej połowę środków', () => {
  const g = newGame('widzew', 68, '2026-07-10');
  const groupOf = (p) => GROUP[p.pos] ?? 'MID';
  let hits = 0; let tries = 0;
  for (let i = 0; i < 200; i++) {
    const date = addDays('2026-07-01', i % 60);
    const club = { id: ['lech', 'legia', 'rakow', 'pogon', 'jagiellonia'][i % 5] };
    const list = poolCandidates(g, club, `${date}-${i}`, { group: 'MID', bar: 9, money: 2e7, groupOf });
    tries++;
    if (list.length) hits++;
    for (const x of list) {
      assert.ok(!x.p.free && groupOf(x.p) === 'MID' && x.p.ovr > 9.3);
      assert.ok(x.fee <= 2e7 * POOL.aiMoney);
    }
  }
  assert.ok(hits / tries > 0.03 && hits / tries < 0.2, `udział ${hits / tries}`);
});

test('Widok Rynek > Z zagranicy: kolumny, filtr regionu, karta zawodnika z klubem zagranicznym i formularzem oferty', () => {
  const g = newGame('widzew', 69, '2026-07-10');
  const html = renderTransfers(g, { tfTab: 'rynek', tfList: 'abroad' });
  assert.ok(html.includes('data-l="abroad"') && html.includes('Z zagranicy'));
  for (const t of ['Narodowość', 'Klub (kraj)', 'Pensja', 'Ameryka Południowa', 'Afryka', 'Bałkany', 'Bliski Wschód', 'Inne', 'wolny']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('Pokazano 80 z 100'));
  const r = handleTransferAction(g, 'tf-region', { r: 'afryka' });
  assert.equal(r.ui.tfRegion, 'afryka');
  const af = renderTransfers(g, { tfTab: 'rynek', tfList: 'abroad', tfRegion: 'afryka' });
  const n = poolList(g, 'afryka').length;
  assert.ok(af.includes(`${n} zawodnik`));
  assert.ok(!af.includes('Brazylia</td>'));
  const p = cheapest(g);
  const card = renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id });
  assert.ok(card.includes('data-act="tf-offer"'));
  assert.ok(card.includes('<small>Klub</small>'));
  assert.ok(card.includes(p.abroad.countryName));
  assert.ok(!card.includes('wolny zawodnik'));
  assert.ok(!card.includes('id="tfShare"'), 'klub zagraniczny nie wypożycza');
  const off = handleTransferAction(g, 'tf-offer', { id: p.id, fee: 10000 });
  assert.ok(off.ui.tfMsg);
});

test('Stary zapis bez puli: leniwe utworzenie raz (flaga foreignPoolV1), dzień gry działa', () => {
  const g = newGame('widzew', 70, '2026-08-20');
  for (const id of g.market.foreign) { delete g.world.players[id]; }
  g.market.free = g.market.free.filter((id) => g.world.players[id]);
  delete g.market.foreign; delete g.market.foreignPoolV1; delete g.market.foreignTop;
  ensureCareer(g);
  assert.equal(g.market.foreign.length, 100);
  assert.ok(g.market.foreignPoolV1);
  assert.ok(g.market.foreign.every((id) => id.startsWith('zag-2026-08-20-')));
  assert.equal(g.market.foreignTop, '2026-07-01', 'pula w trakcie okna liczy się jako uzupełnienie tego okna');
  ensureForeignPool(g);
  assert.equal(g.market.foreign.length, 100);
  step(g, 2);
  assert.ok(g.market.foreign.length <= 100);
});

test('Nastawienie zawodnika z kontraktem za granicą liczone z ligi (poolSellerClub), słaba liga chętniej', () => {
  const g = newGame('widzew', 71, '2026-07-10');
  const con = poolList(g).filter((p) => !p.free);
  for (const p of con) {
    const s = poolSellerClub(p);
    assert.ok(s.rep > 0 && s.tier >= 1 && s.tier <= 3 && s.name === p.abroad.club);
    assert.ok(['chętny', 'otwarty', 'niechętny', 'odmowa'].includes(playerWillingness(g, p).verdict));
  }
});

test('Wolni bez klubu przez dłuższy czas znikają z listy, w ich miejsce od razu pojawiają się nowi (liczba bez zmian)', async () => {
  const { retireFreeAgents, freeLeaveChance } = await import('../src/career/mindset.js');
  assert.equal(freeLeaveChance({ age: 25 }, 1), 0, 'pierwsze miesiące bez zmian');
  assert.ok(freeLeaveChance({ age: 25 }, 6) > freeLeaveChance({ age: 25 }, 3), 'im dłużej bez klubu, tym większa szansa');
  assert.ok(freeLeaveChance({ age: 31 }, 4) > freeLeaveChance({ age: 24 }, 4), 'starsi szybciej');
  const g = newGame();
  const before = g.market.free.length;
  // wszyscy wolni od 8 miesięcy bez klubu
  for (const id of g.market.free) g.world.players[id].freeSince = '2026-03-01';
  const old = new Set(g.market.free);
  const r = retireFreeAgents(g, '2026-11-01');
  assert.ok(r.left >= 5, `zniknęło ${r.left}`);
  assert.equal(g.market.free.length, Math.min(before, 150), 'liczba wolnych bez zmian (do limitu rynku)');
  const fresh = g.market.free.filter((id) => !old.has(id));
  assert.equal(fresh.length, r.added);
  for (const id of fresh) assert.equal(g.world.players[id].freeSince, '2026-11-01');
  for (const id of old) if (!g.market.free.includes(id)) assert.ok(!g.world.players[id], 'zniknięty usunięty ze świata');
  assert.ok(g.market.foreign.every((id) => g.world.players[id]), 'pula bez usuniętych');
});
