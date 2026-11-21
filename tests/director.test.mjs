// Dyrektor sportowy w sztabie (docs/dyrektor-sportowy.md, src/career/staffMarket.js, src/career/director.js):
// migracja z dawnego atrybutu Negocjacje (rozkład bez zmian), wakat (zarząd, 5), gracz zatrudnia, zwalnia, podbiera
// i przedłuża, kluby AI obsadzają wakaty, widełki pensji w rozmowach (pokrycie, szerokość z RYN, bez cudzych ofert),
// sprawiedliwość (kolejność z wagą sieci kontaktów zero-sum, błąd wyceny bez przesunięcia, premie i prowizje),
// wypożyczenia (sieć kontaktów), podpis listów, datapack v6, widoki bez błędnych tekstów.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { Rng } from '../src/core/rng.js';
import { clubNegotiation, negMean, negSeason } from '../src/career/clubNegotiation.js';
import { openNegotiation, aiNegotiate } from '../src/career/negotiation.js';
import { makeProposal } from '../src/career/proposals.js';
import { askLoanOffers } from '../src/career/loans.js';
import {
  directorOf, makeOffer, decideDay, fireStaff, renewStaff, staffSummary, staffBudget, listFreeStaff, listClubStaff,
  expectedWage, STAFF_MARKET as K, staffLimit, staffMarketDay,
} from '../src/career/staffMarket.js';
import {
  directorAttr, directorFrom, directorWageHint, hintHalfWidth, rynMul, rynSigma, weightedOrder, sieWeight, kadFeeMul, DIR,
} from '../src/career/director.js';
import { checkStaff, peopleValues, editStaff, exportPack, parsePack, importPack, PACK_V } from '../src/career/editor.js';
import { askBoard, requestStatus, directorScore } from '../src/career/boardRequests.js';
import { boardRequestsPanel } from '../src/ui/boardRequestsView.js';
import { renderTraining } from '../src/ui/trainingView.js';
import { startNegotiation, renderNegotiation } from '../src/ui/negotiationView.js';
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
const fresh = () => structuredClone(shared ??= newGame());
const runDays = (g, n) => { for (let i = 0; i < n; i++) { g.date = addDays(g.date, 1); processDay(g); } };
const vacate = (g, id) => { const d = directorOf(g, id); g.staff.people[d.id].club = null; delete g.staff.dir[id]; g.staff.dirPool.push(d.id); };
const clubsWithSquad = (g) => CLUBS_PL.filter((c) => g.world.clubs[c.id] && c.tier <= 4);

test('Migracja: każdy klub z kadrą ma dyrektora, Negocjacje = dawny atrybut (rozkład bez zmian), 4 atrybuty 1-20', () => {
  const all = { 1: [], 2: [], 3: [], 4: [] }; const want = { 1: [], 2: [], 3: [], 4: [] };
  for (const seed of [31, 32]) {
    const g = seed === 31 ? fresh() : newGame(seed);
    for (const c of clubsWithSquad(g)) {
      const d = directorOf(g, c.id);
      assert.ok(d && d.role === 'dyrektor' && d.club === c.id, c.id);
      assert.deepEqual(Object.keys(d.a).sort(), ['KAD', 'NEG', 'RYN', 'SIE']);
      for (const v of Object.values(d.a)) assert.ok(Number.isInteger(v) && v >= 1 && v <= 20);
      assert.ok(d.age >= 38 && d.age <= 62 && d.until >= '2027-06-30' && d.until <= '2029-06-30');
      // Ta sama wartość co dawne leniwe losowanie (gra bez stanu sztabu)
      assert.equal(clubNegotiation(g, c.id), clubNegotiation({ seed, seasonYear: 2026 }, c.id), c.id);
      assert.equal(g.clubNeg[c.id].n, d.a.NEG, 'zapas clubNeg');
      all[c.tier].push(d.a.NEG); want[c.tier].push(negMean(c.id));
    }
    assert.ok(g.staff.dirPool.length >= K.director.pool.min && g.staff.dirPool.length <= K.director.pool.max);
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (const t of [1, 2, 3, 4]) assert.ok(Math.abs(mean(all[t]) - mean(want[t])) < 1.2, `poziom ${t}: ${mean(all[t])} wobec ${mean(want[t])}`);
  assert.ok(mean(all[1]) > mean(all[4]));
});

test('Pensja dyrektora: wzór sztabu x mnożnik ligi (Ekstraklasa q 10 ok. 9 tys. zł, q 17 ok. 43 tys.), w budżecie sztabu', () => {
  const p = { role: 'dyrektor', q: 10, nat: 'POL' };
  assert.equal(expectedWage(p, null, { club: 'legia' }), 9000);
  assert.ok(Math.abs(expectedWage({ ...p, q: 17 }, null, { club: 'legia' }) - 43000) < 1000);
  assert.ok(expectedWage(p, null, { club: clubsWithSquad(fresh()).find((c) => c.tier === 4).id }) < 4000);
  const g = fresh();
  const d = directorOf(g, g.clubId);
  const B = staffBudget(g);
  const roster = Object.values(g.staff.people).filter((x) => x.club === g.clubId && x.role !== 'dyrektor').reduce((s, x) => s + x.wage, 0);
  assert.equal(B.pay, roster + d.wage);
  assert.equal(g.finance.clubs[g.clubId].staffPay, B.pay);
  // Poza limitem osób sztabu
  assert.equal(staffLimit(g).staff, Object.values(g.staff.clubs[g.clubId]).length);
});

test('Wakat: zarząd (5), klub AI bez dyrektora składa ofertę wolnemu dyrektorowi i obsadza stanowisko', () => {
  const g = fresh();
  const id = 'lech';
  const d = directorOf(g, id);
  g.staff.people[d.id].club = null; delete g.staff.dir[id]; g.staff.dirPool.push(d.id); // dyrektor odszedł
  assert.equal(clubNegotiation(g, id), K.vacantQ.dyrektor);
  assert.equal(directorAttr(g, id, 'RYN'), 5);
  // Poniedziałek: oferta, potem decyzja po 2-3 dniach
  while (new Date(`${g.date}T12:00:00Z`).getUTCDay() !== 1) runDays(g, 1);
  runDays(g, 1);
  assert.ok(g.staff.offers.some((o) => o.club === id && o.role === 'dyrektor') || directorOf(g, id), 'oferta klubu AI');
  runDays(g, 14);
  assert.ok(directorOf(g, id), 'klub AI ma nowego dyrektora');
  assert.ok(clubNegotiation(g, id) >= 1 && clubNegotiation(g, id) <= 20);
});

test('Gracz nie zatrudnia, nie zwalnia, nie podbiera i nie przedłuża dyrektora: decyduje zarząd; podgląd w Sztabie', () => {
  const g = fresh();
  const d = directorOf(g, g.clubId);
  assert.equal(directorFrom(g), `${d.name}, dyrektor sportowy`);
  assert.ok(g.inbox.some((m) => m.from === `${d.name}, dyrektor sportowy` && /Dyrektor sportowy:/.test(m.subject)), 'list przedstawiający dyrektora');
  assert.equal(fireStaff(g, d.id).reason, 'dirOwner');
  g.date = `${d.until.slice(0, 4)}-02-01`;
  assert.equal(renewStaff(g, { pid: d.id, years: 2 }).reason, 'dirOwner');
  g.date = '2027-01-10';
  const free = listFreeStaff(g, { role: 'dyrektor' });
  assert.ok(free.length >= 10, 'lista wolnych dyrektorów do podglądu');
  assert.equal(makeOffer(g, { pid: free[0].id, years: 2 }).reason, 'dirOwner');
  const other = listClubStaff(g, { role: 'dyrektor' })[0];
  assert.equal(makeOffer(g, { pid: other.id, years: 2 }).reason, 'dirOwner', 'bez podbierania dyrektorów');
  // Widok: tylko podgląd i prośba do zarządu
  const html = renderTraining(g, { trTab: 'sztab' });
  const card = html.slice(html.indexOf('id="st-role-dyrektor"'), html.indexOf('</section>', html.indexOf('id="st-role-dyrektor"')));
  assert.ok(card.includes('Poproś zarząd o zmianę dyrektora') && card.includes('data-sub="zarzad"'));
  assert.ok(!card.includes('st-fire-ask') && !card.includes('st-renew'), 'bez Zwolnij i Przedłuż');
  assert.ok(!BAD_TEXT.test(html.replace(/<[^>]+>/g, ' ')), 'bez błędnych tekstów');
  const pc = renderTraining(g, { trTab: 'sztab', trStaff: 'rynek', trStaffPerson: free[0].id });
  assert.match(pc, /Tylko podgląd/);
  assert.ok(!pc.includes('data-act="st-offer"'));
  // List 1 maja bez dyrektora (umowę przedłuża zarząd)
  g.date = `${d.until.slice(0, 4)}-05-01`;
  assert.ok(!staffMarketDay(g, g.date).some((m) => m.refs?.kind === 'staffRenew' && m.refs.pid === d.id));
});

test('Prośba do zarządu o zmianę dyrektora: zgoda (odprawa, kandydat albo wybór zarządu, list), odmowa z powodem i odstęp', () => {
  // Zgoda: wysokie zaufanie, słaby dyrektor
  const g = fresh();
  g.date = '2026-09-07';
  const d = directorOf(g, g.clubId);
  d.a = { NEG: 4, RYN: 4, SIE: 4, KAD: 4 }; d.q = 4; d.since = '2024-07-01';
  g.board.trust = 95;
  const free = listFreeStaff(g, { role: 'dyrektor' }).sort((a, b) => a.wage.mid - b.wage.mid);
  const cand = free[0];
  assert.equal(requestStatus(g, 'director').ok, true);
  const bal = g.finance.clubs[g.clubId].balance;
  const r = askBoard(g, 'director', 0, g.date, { candidate: cand.id });
  assert.equal(r.verdict, 'yes', r.text);
  const now = directorOf(g, g.clubId);
  assert.ok(now && now.id !== d.id);
  assert.ok(g.staff.dirPool.includes(d.id), 'poprzedni na liście wolnych');
  assert.ok(g.finance.clubs[g.clubId].balance < bal, 'odprawa z kasy klubu');
  const m = g.inbox.find((x) => x.key === `prosba:${g.date}:director`);
  assert.ok(m && m.from === 'Zarząd klubu' && m.body.includes(now.name));
  assert.ok(now.id === cand.id || /kandydat/.test(m.body), 'kandydat zatrudniony albo wyjaśnienie');
  // Odstęp po zgodzie (90 dni) i w tygodniu
  assert.equal(requestStatus(g, 'director', '2026-09-08').ok, false);
  // Odmowa: niskie zaufanie, świetny dyrektor, cierpliwy właściciel
  const h = fresh();
  h.date = '2026-09-07';
  const e = directorOf(h, h.clubId);
  e.a = { NEG: 19, RYN: 19, SIE: 19, KAD: 19 }; e.q = 19;
  h.board.trust = 10;
  const sc = directorScore(h, h.date);
  assert.ok(sc.S < 10 && sc.parts.quality < 0 && sc.parts.trust < 0);
  const n = askBoard(h, 'director', 0, h.date);
  assert.equal(n.verdict, 'no');
  assert.equal(directorOf(h, h.clubId).id, e.id);
  const mn = h.inbox.find((x) => x.key === `prosba:${h.date}:director`);
  assert.match(mn.body, /Powody: /);
  assert.equal(requestStatus(h, 'director', '2026-10-20').ok, false, 'po odmowie 60 dni');
  assert.equal(requestStatus(h, 'director', '2026-11-07').ok, true);
  // Widok Klub > Zarząd: karta prośby z listą kandydatów
  const html = boardRequestsPanel(h, {});
  assert.ok(html.includes('Zmiana dyrektora sportowego') && html.includes('id="brDir"'));
  assert.ok(!BAD_TEXT.test(html.replace(/<[^>]+>/g, ' ')));
});

test('Zarząd sam obsadza wakat dyrektora w klubie gracza (list), a 1 lipca może zmienić dyrektora jak w klubach AI', () => {
  const g = fresh();
  const d = directorOf(g, g.clubId);
  g.staff.people[d.id].club = null; delete g.staff.dir[g.clubId]; g.staff.dirPool.push(d.id); // dyrektor odszedł
  assert.equal(directorFrom(g), 'Zarząd');
  assert.equal(requestStatus(g, 'director').ok, false, 'bez dyrektora nie ma o co prosić');
  while (new Date(`${g.date}T12:00:00Z`).getUTCDay() !== 0) runDays(g, 1);
  runDays(g, 1);
  const now = directorOf(g, g.clubId);
  assert.ok(now, 'zarząd zatrudnił dyrektora');
  assert.ok(g.inbox.some((m) => m.category === 'board' && m.subject === `Nowy dyrektor sportowy: ${now.name}`));
  // 1 lipca: przy spadku szansa zmiany 25 %; w kilku ziarnach zarząd zmienia też dyrektora klubu gracza, z listem
  let changed = 0;
  for (const seed of [41, 42, 43, 44, 45, 46, 47, 48]) {
    const h = structuredClone(g); h.seed = seed; h.staff.dirYear = {};
    const before = directorOf(h, h.clubId).id;
    const msgs = negSeason(h, 2027, { relegated: new Set([h.clubId]) });
    if (directorOf(h, h.clubId).id !== before) {
      changed++;
      assert.ok(msgs.some((m) => m.key === `dyrektor-zarzad:${h.clubId}:2027` && m.category === 'board'));
    }
  }
  assert.ok(changed >= 1, 'zarząd zmienia dyrektora gracza jak w klubach AI');
});


test('Widełki pensji: pokrycie 85-95 %, szerokość z Znajomości rynku, ten sam przedział w oknie 30 dni, bez cudzych ofert', () => {
  const g = fresh();
  const d = directorOf(g, g.clubId);
  const club = { ...clubById(g.clubId) };
  const players = CLUBS_PL.filter((c) => c.tier <= 2 && c.id !== g.clubId && g.world.clubs[c.id]).flatMap((c) => squadOf(g.world, c.id));
  const cover = (ryn) => {
    d.a.RYN = ryn;
    let inside = 0; let n = 0; let width = 0;
    for (const p of players) {
      const r = openNegotiation({ kind: 'sign', player: p, club, fromClub: clubById(p.clubId), date: g.date, rng: new Rng(`t:${p.id}`), mode: 'player' });
      if (!r.ok) continue;
      const min = r.session.d.hidden.minOwn;
      const h = directorWageHint(g, { playerId: p.id, min });
      n++; width += (h.hi - h.lo) / min;
      if (min >= h.lo && min <= h.hi) inside++;
    }
    return { share: inside / n, width: width / n, n };
  };
  const c1 = cover(1); const c10 = cover(10); const c20 = cover(20);
  for (const c of [c1, c10, c20]) assert.ok(c.share >= 0.85 && c.share <= 0.95 && c.n > 300, JSON.stringify(c));
  assert.ok(c1.width > c10.width && c10.width > c20.width, `${c1.width} ${c10.width} ${c20.width}`);
  assert.ok(Math.abs(hintHalfWidth(1) - 0.25) < 1e-9 && Math.abs(hintHalfWidth(10) - 0.15) < 1e-9 && Math.abs(hintHalfWidth(20) - 0.06) < 1e-9);
  // Okno 30 dni: ten sam środek; nowy dyrektor albo nowe okno: nowa ocena
  d.a.RYN = 12;
  const a = directorWageHint(g, { playerId: 'x1', min: 5000, date: '2026-07-02' });
  const b = directorWageHint(g, { playerId: 'x1', min: 5000, date: '2026-07-03' });
  assert.deepEqual([a.lo, a.hi], [b.lo, b.hi]);
  // Cudze oferty nie wpływają: minimum bez konkurencji, podpowiedź nie czyta propozycji innych klubów
  const p = players.find((x) => openNegotiation({ kind: 'sign', player: x, club, fromClub: clubById(x.clubId), date: g.date, rng: new Rng('r'), mode: 'player' }).ok);
  const base = openNegotiation({ kind: 'sign', player: p, club, fromClub: clubById(p.clubId), date: g.date, rng: new Rng('r'), mode: 'player' }).session.d.hidden;
  for (const wage of [1000, 50000]) {
    const withRival = openNegotiation({ kind: 'sign', player: p, club, fromClub: clubById(p.clubId), date: g.date, rng: new Rng('r'), mode: 'player', ctx: { rival: { club: clubById('legia'), wage } } }).session.d.hidden;
    assert.equal(withRival.minOwn, base.minOwn);
  }
  const h0 = directorWageHint(g, { playerId: p.id, min: base.minOwn });
  makeProposal(g, { playerId: p.id, to: 'legia', contract: { wage: 99999, years: 2 }, kind: 'transfer', fee: 1e6 });
  assert.deepEqual(directorWageHint(g, { playerId: p.id, min: base.minOwn }), h0);
  // Wakat: szersze widełki (zarząd)
  vacate(g, g.clubId);
  assert.equal(directorWageHint(g, { playerId: p.id, min: 5000 }).name, null);
  assert.ok(Math.abs(directorWageHint(g, { playerId: p.id, min: 5000 }).x - hintHalfWidth(5)) < 1e-9);
});

test('Ekran rozmów: blok dyrektora sportowego z przedziałem (fmt zł), przy wakacie „Zarząd”', () => {
  const g = fresh();
  const d = directorOf(g, g.clubId);
  const ids = squadOf(g.world, 'legia').map((p) => p.id);
  let ng = null;
  for (const id of ids) { const r = startNegotiation(g, { kind: 'sign', playerId: id, fromClub: 'legia', limits: { maxWage: 1e7, maxSignOn: 1e8 } }); if (r.ok) { ng = r.ng; break; } }
  assert.ok(ng?.dirHint);
  const html = renderNegotiation(g, ng);
  assert.ok(html.includes(`Dyrektor sportowy (${d.name})`));
  assert.match(html, /zawodnik zgodzi się prawdopodobnie przy [\d\s ]+-[\d\s ]+zł tygodniowo/);
  assert.ok(!BAD_TEXT.test(html.replace(/<[^>]+>/g, ' ')));
  vacate(g, g.clubId);
  for (const id of ids) { const r = startNegotiation(g, { kind: 'sign', playerId: id, fromClub: 'legia', limits: { maxWage: 1e7, maxSignOn: 1e8 } }); if (r.ok) { ng = r.ng; break; } }
  assert.match(renderNegotiation(g, ng), /Zarząd \(brak dyrektora sportowego\)/);
});

test('Sprawiedliwość: kolejność z wagą sieci kontaktów (zero-sum), błąd wyceny bez przesunięcia, premie i prowizje', () => {
  // Kolejność: szansa bycia pierwszym = waga / suma wag; równe wagi: zwykłe tasowanie
  const rng = new Rng('kolejnosc');
  const items = ['a', 'b', 'c'];
  const w = { a: Math.exp(DIR.sie.w * 10), b: 1, c: 1 };
  let firstA = 0; let firstEq = 0;
  for (let i = 0; i < 20000; i++) {
    if (weightedOrder(rng, items, (x) => w[x])[0] === 'a') firstA++;
    if (weightedOrder(rng, items, () => 1)[0] === 'a') firstEq++;
  }
  const want = w.a / (w.a + 2);
  assert.ok(Math.abs(firstA / 20000 - want) < 0.015, `${firstA / 20000} wobec ${want}`);
  assert.ok(Math.abs(firstEq / 20000 - 1 / 3) < 0.015);
  const g = fresh();
  assert.equal(sieWeight(g, 'nieznany'), 1);
  // Błąd wyceny: średnio 1 (bez przesunięcia), mniejszy rozrzut przy lepszym dyrektorze
  const d = directorOf(g, 'lech');
  const stats = (ryn) => {
    d.a.RYN = ryn;
    const xs = Array.from({ length: 4000 }, (_, i) => rynMul(g, 'lech', `p${i}`));
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    return { m, sd };
  };
  const s1 = stats(1); const s20 = stats(20);
  assert.ok(Math.abs(s1.m - 1) < 0.015 && Math.abs(s20.m - 1) < 0.01, `${s1.m} ${s20.m}`);
  assert.ok(s1.sd > 0.17 && s20.sd < 0.07, `${s1.sd} ${s20.sd}`);
  assert.equal(rynSigma({ seed: 1 }, 'lech'), 0, 'gra bez stanu sztabu: bez błędu');
  // Premie i prowizje: od 1,09 do 0,90, przy 10 bez zmian; mniejsza prowizja w ofercie klubu AI
  d.a.KAD = 10; assert.equal(kadFeeMul(g, 'lech'), 1);
  d.a.KAD = 20; assert.ok(Math.abs(kadFeeMul(g, 'lech') - 0.9) < 1e-9);
  const p = squadOf(g.world, 'legia').find((x) => x.ovr > 8);
  const fee = (m) => aiNegotiate({ kind: 'sign', player: { ...p, relations: {} }, club: clubById('lech'), fromClub: clubById('legia'), date: g.date, rng: new Rng('kad'), budget: { wage: 1e7 }, neg: 10, feeMul: m });
  const a = fee(1); const b = fee(0.9);
  if (a.contract && b.contract && a.rounds === 1 && b.rounds === 1) assert.ok(b.contract.agentFee <= a.contract.agentFee);
});

test('Wypożyczenia: lepsza sieć kontaktów szybciej i więcej propozycji (wakat wolniej)', () => {
  const g = fresh();
  g.date = '2026-08-03';
  const d = directorOf(g, g.clubId);
  const p = squadOf(g.world, g.clubId).filter((x) => x.age <= 23).sort((a, b) => a.ovr - b.ovr)[0];
  const due = (sie) => {
    const h = structuredClone(g);
    h.staff.people[d.id].a.SIE = sie;
    const r = askLoanOffers(h, p.id, { type: 'season', share: 60 });
    assert.ok(r.ok, r.text);
    return h.market.loanAsks[p.id];
  };
  const lo = due(1); const mid = due(10); const hi = due(20);
  assert.ok(hi.due <= mid.due && mid.due <= lo.due);
  assert.equal(hi.step, 1); assert.equal(mid.step, 0); assert.equal(lo.step, -1);
  assert.match(askLoanOffers(structuredClone(g), p.id, { type: 'season', share: 60 }).text, new RegExp(`Dyrektor sportowy ${d.name} szuka klubu`));
});

test('Datapack v6: dyrektor w sekcji staff (NEG, RYN, SIE, KAD), walidacja, wczytanie w innej grze', () => {
  assert.equal(PACK_V, 6);
  const g = fresh();
  const pv = peopleValues(g, 'legia');
  assert.equal(pv.staff.dyrektor.length, 1);
  assert.deepEqual(Object.keys(pv.staff.dyrektor[0].a).sort(), ['KAD', 'NEG', 'RYN', 'SIE']);
  assert.ok(checkStaff({ dyrektor: [{ name: 'A B' }, { name: 'C D' }] }).errors.staff, 'najwyżej jeden dyrektor');
  assert.ok(checkStaff({ dyrektor: [{ a: { TAK: 5 } }] }).errors['dyrektor.0.a'], 'tylko atrybuty dyrektora');
  const v = checkStaff({ dyrektor: [{ name: 'Jan Dyrektor', age: 50, a: { NEG: 19, RYN: 18, SIE: 17, KAD: 16 } }] }).value;
  assert.ok(editStaff(g, 'legia', v) >= 1);
  const d = directorOf(g, 'legia');
  assert.equal(d.name, 'Jan Dyrektor'); assert.equal(d.a.NEG, 19); assert.equal(d.q, 18);
  assert.equal(clubNegotiation(g, 'legia'), 19);
  // Klub z wakatem: plik daje nowego dyrektora
  fireStaff(g, directorOf(g, 'lech').id, { clubId: 'lech' });
  editStaff(g, 'lech', checkStaff({ dyrektor: [{ name: 'Ola Nowa', a: { NEG: 3, RYN: 3, SIE: 3, KAD: 3 } }] }).value);
  assert.equal(directorOf(g, 'lech')?.name, 'Ola Nowa');
  const pk = parsePack(JSON.stringify(exportPack(g)));
  const friend = newGame(33);
  importPack(friend, pk);
  assert.equal(directorOf(friend, 'legia')?.name, 'Jan Dyrektor');
  assert.equal(clubNegotiation(friend, 'legia'), 19);
  // Plik v5 (bez dyrektora) wczytuje się bez zmian
  const v5 = JSON.parse(JSON.stringify(exportPack(g)));
  v5.v = 5;
  for (const c of Object.values(v5.clubs ?? {})) if (c.staff) delete c.staff.dyrektor;
  assert.ok(parsePack(JSON.stringify(v5)));
});

test('Sezon: 1 lipca zmiany dyrektorów w klubach AI, kluby z kadrą zawsze z dyrektorem, lista wolnych 12-16, dzień gry', () => {
  const g = fresh();
  g.date = '2026-12-31';
  runDays(g, 1); // 1 stycznia: odświeżenie listy wolnych dyrektorów
  assert.equal(g.staff.last.dirRefresh, '2027-01-01');
  assert.ok(g.staff.dirPool.length >= K.director.pool.min && g.staff.dirPool.length <= K.director.pool.max);
  const msgs = staffMarketDay(g, g.date);
  assert.ok(Array.isArray(msgs));
  const sum = staffSummary(g);
  assert.equal(sum.roles.dyrektor.max, 1);
  assert.ok(sum.roles.dyrektor.people.length === 1 && sum.roles.dyrektor.people[0].canRenew !== undefined);
});
