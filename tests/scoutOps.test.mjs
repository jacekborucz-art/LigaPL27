// Skauting zagraniczny (src/career/scoutOps.js, src/career/scoutRegions.js, docs/skauting.md): regiony, skauci
// z 5 atrybutami, zlecenia, wyprawy, kandydaci z błędem raportu, wygasanie, finanse, kluby AI, edytor i datapack v5.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { Rng } from '../src/core/rng.js';
import { NAT_NAMES, randomName, hasNamePool, NATIONALITIES } from '../src/data/names.js';
import { SCOUT_REGIONS, SCOUT_REGION, scoutRegionOf } from '../src/career/scoutRegions.js';
import {
  SCOUT, scoutingView, missionQuote, startMission, cancelMission, hireScout, fireScout, watchCandidate, markCandidatesSeen,
  missionLambda, weekEvents, rollCandidates, makeReport, scoutIndex, commissionPct, candidateUntil, ensureScoutOps, candidateWage,
} from '../src/career/scoutOps.js';
import { addPoolPlayers, topUpPool, poolCandidates, POOL, scoutBlocked, scoutCommission, foreignAskingPrice } from '../src/career/foreignPool.js';
import { completeTransfer } from '../src/career/transfers.js';
import { startDeal } from '../src/career/transferDeals.js';
import { migrateScoutAttrs, qFromAttrs, roleAttrKeys } from '../src/training/staff.js';
import { rosterOf, ensureStaff } from '../src/career/staffMarket.js';
import { parsePack, importPack, peopleValues, exportPack, checkStaff, PACK_V } from '../src/career/editor.js';
import { mailLinks } from '../src/ui/mailLinks.js';
import { mailRelevant } from '../src/core/mailFilter.js';
import { GROUP } from '../src/career/squad.js';
import '../src/season/dailySystems.js';

const CLUB = 'widzew';
function newGame(seed = 31, clubId = CLUB) {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'A', lastName: 'B' } } };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g); processDay(g);
  return g;
}
let shared = null;
const fresh = () => structuredClone(shared ??= newGame());
const step = (g, n = 1) => { for (let i = 0; i < n; i++) { g.date = addDays(g.date, 1); processDay(g); } };
const bare = { seed: 4242, date: '2026-07-06', world: { players: {} } };
/** Wyprawa bez świata gry: zdarzenia tygodni i kandydaci (tylko generator). */
function trip(id, { s = 0.6, k = s, weeks = 4, D = 0.4, c = 10.8, maxFee = 0, maxWage = 0, contract = 'any', ageFrom = 20, ageTo = 28, pot = null, game = bare } = {}) {
  const m = { id, weeks, contract, maxFee, maxWage, ageFrom, ageTo, pos: 'ŚP', region: 'balkany', events: [], calc: { lambda: missionLambda(s, weeks, D), k, c, pot } };
  for (let w = 1; w <= weeks; w++) for (const kind of weekEvents(game, m, w)) m.events.push({ kind });
  return rollCandidates(game, m, null);
}
const stats = (runs, opts) => {
  let zero = 0; let sum = 0; let dev = 0; let off = 0; let n = 0;
  for (let i = 0; i < runs; i++) {
    const r = trip(`t${i}`, opts);
    if (!r.players.length) zero++;
    sum += r.players.length;
    for (const { p } of r.players) { dev += (p.ovr - (opts.c ?? 10.8)) ** 2; off += p.ovr - (opts.c ?? 10.8); n++; }
  }
  return { p0: zero / runs, mean: sum / runs, sd: Math.sqrt(dev / Math.max(1, n)), bias: off / Math.max(1, n) };
};
/** Zlecenie dla pierwszego skauta klubu gracza w jego najlepszym regionie. */
const ownOrder = (g, extra = {}) => {
  const v = scoutingView(g);
  const s = v.scouts[0];
  return { scoutId: s.id, region: s.regions[0].key, pos: 'ŚP', ageFrom: 20, ageTo: 28, level: 'starter', maxFee: 3000000, maxWage: 60000, contract: 'any', weeks: 2, ...extra };
};
const rich = (g, x = 5e7) => { const c = g.finance.clubs[g.clubId]; c.transferBudget = x; c.balance = Math.max(c.balance, x); };
const scoutsCost = (g, clubId = g.clubId) => Object.values(g.finance.clubs[clubId].ledger).reduce((s, m) => s + (m.out.scouts ?? 0), 0);

test('Regiony: 12 regionów, kraje z pulami imion i nazwami, bez powtórzeń; NATIONALITIES bez zmian', () => {
  assert.equal(SCOUT_REGIONS.length, 12);
  const seen = new Set();
  for (const r of SCOUT_REGIONS) {
    assert.ok(r.key && r.label && r.short && r.nats.length, r.key);
    assert.ok(r.Lmax > r.Lmed && r.Lmax <= 12.8, `bez gwiazd: ${r.key}`); // nie zawyżać polskiej piłki
    for (const n of r.nats) {
      assert.ok(!seen.has(n), `kraj w jednym regionie: ${n}`); seen.add(n);
      assert.ok(hasNamePool(n), `pula imion: ${n}`);
      assert.ok(NAT_NAMES[n], `nazwa kraju: ${n}`);
      assert.equal(scoutRegionOf(n), r.key);
    }
  }
  assert.ok(!seen.has('POL') && !seen.has('RUS'));
  for (const n of ['JPN', 'KOR', 'AUS', 'USA', 'MEX', 'CAN', 'EGY', 'IRN', 'KSA', 'CRC', 'HON', 'JAM', 'PAN', 'UZB', 'BFA', 'GAM', 'ZAM', 'RSA', 'KEN']) assert.ok(hasNamePool(n), n);
  const nm = randomName('JPN', new Rng(3));
  assert.ok(!/ski$|czyk$|wicz$/.test(nm.last), `japońskie nazwisko: ${nm.last}`);
  assert.equal(NATIONALITIES.length, 77, 'lista narodowości klubów zagranicznych i sędziów bez zmian');
});

test('Generator puli bez zmian po refaktorze (genPoolPlayerFor): te same ziarna, ci sami zawodnicy', () => {
  const g = { seed: 61, world: { players: {} }, market: { free: [], foreign: [], talks: {} } };
  const a = addPoolPlayers(g, 40, '2026-07-01', 't');
  const h = JSON.stringify(a);
  // Migawka generowania puli. Do v1.20 Beta (commit d3d6658) skrót był identyczny jak przed skautingiem (4195643369).
  // Od v1.21 Beta kluby zagraniczne pochodzą też z src/data/kluby_swiat.js (zawsze prawdziwy klub), więc nazwy klubów
  // i dalsze losowania puli się zmieniły; skrót przeliczony świadomie, determinizm (to samo ziarno, ta sama pula) bez zmian.
  let x = 7; for (const ch of h) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  assert.equal(a.length, 40);
  assert.equal(x, 1960701819);
  const g2 = { seed: 61, world: { players: {} }, market: { free: [], foreign: [], talks: {} } };
  assert.equal(JSON.stringify(addPoolPlayers(g2, 40, '2026-07-01', 't')), h, 'to samo ziarno, ta sama pula');
});

test('Determinizm: to samo zlecenie i id misji daje ten sam wynik, inny id inny', () => {
  const pick = (r) => r.players.map(({ p }) => [p.name, p.ovr, p.age, p.free]);
  assert.deepEqual(pick(trip('m7', { s: 0.7, weeks: 6, D: 0.2 })), pick(trip('m7', { s: 0.7, weeks: 6, D: 0.2 })));
  const many = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(pick(trip(`m${i}`, { s: 0.7, weeks: 6, D: 0.2 })))));
  assert.ok(many.size >= 10, 'inne misje, inni kandydaci');
});

test('Statystyka: słabszy skaut częściej wraca bez nikogo, dłuższy wyjazd daje więcej, cele kalibracji', () => {
  const weak = stats(800, { s: 0.3, weeks: 2, D: 0.4 });
  const strong = stats(800, { s: 0.8, weeks: 2, D: 0.4 });
  assert.ok(weak.mean < strong.mean && weak.p0 > strong.p0, `słaby ${weak.mean}/${weak.p0}, silny ${strong.mean}/${strong.p0}`);
  const w1 = stats(800, { s: 0.6, weeks: 1, D: 0.4 });
  const w4 = stats(800, { s: 0.6, weeks: 4, D: 0.4 });
  const w6 = stats(800, { s: 0.85, weeks: 6, D: 0.2 });
  assert.ok(w1.mean < w4.mean);
  assert.ok(w1.p0 >= 0.48 && w1.p0 <= 0.7, `1 tydzień: ${w1.p0}`);
  assert.ok(w4.p0 >= 0.1 && w4.p0 <= 0.28, `4 tygodnie: ${w4.p0}`);
  assert.ok(w6.p0 <= 0.12, `silny 6 tygodni: ${w6.p0}`);
  // Trudny profil: mniej kandydatów
  assert.ok(stats(800, { s: 0.6, weeks: 4, D: 0.85 }).mean < w4.mean);
});

test('Sieć kontaktów częściowo zastępuje region: sieć 18 lepsza od sieci 8, gorsza od eksperta', () => {
  const sc = (reg, sie) => ({ q: 12, a: { DOS: 12, OCE: 12, RYN: 12, SIE: sie, CHA: 12 }, reg });
  const ex = scoutIndex(sc({ balkany: 17 }, 12), 'balkany');
  const n18 = scoutIndex(sc({}, 18), 'balkany');
  const n8 = scoutIndex(sc({}, 8), 'balkany');
  assert.ok(ex.s > n18.s && n18.s > n8.s, `${ex.s} ${n18.s} ${n8.s}`);
  assert.ok(ex.a > n18.a && n18.a > n8.a);
  const N = (ix) => stats(600, { s: ix.s, k: ix.k, weeks: 4, D: 0.4 }).mean;
  assert.ok(N(ex) > N(n8));
});

test('Rozrzut kandydatów maleje z jakością skauta, słaby częściej przywozi słabszych', () => {
  const weak = stats(600, { s: 0.7, k: 0.3, weeks: 6, D: 0.2 });
  const good = stats(600, { s: 0.7, k: 0.9, weeks: 6, D: 0.2 });
  assert.ok(good.sd < weak.sd, `odchylenie ${good.sd} < ${weak.sd}`);
  assert.ok(weak.bias < good.bias, `przesunięcie ${weak.bias} < ${good.bias}`);
  assert.ok(weak.bias < 0);
});

test('Granice: 0-7 kandydatów, wiek w zleceniu, cena i pensja w limicie (+10 %), wolni z żądaniem, reszta z klubem za granicą', () => {
  for (let i = 0; i < 300; i++) {
    const r = trip(`b${i}`, { s: 0.9, weeks: 6, D: 0.1, maxFee: 1500000, maxWage: 20000, ageFrom: 19, ageTo: 23 });
    assert.ok(r.players.length >= 0 && r.players.length <= SCOUT.maxN);
    for (const { p } of r.players) {
      assert.ok(p.age >= 19 && p.age <= 23, `wiek ${p.age}`);
      if (p.free) assert.ok(p.askWage > 0 && !p.abroad && !p.contract);
      else { assert.ok(p.abroad?.club && p.contract?.wage > 0); assert.ok(foreignAskingPrice(bare, p) <= 1500000 * 1.1, 'kwota'); }
      assert.ok(candidateWage(p) <= 20000 * 1.1, 'pensja');
      assert.ok(p.pos === 'ŚP' && p.foreignPool);
    }
  }
  const free = trip('f1', { s: 0.9, weeks: 6, D: 0.1, contract: 'free' });
  assert.ok(free.players.every(({ p }) => p.free));
  // „Wolny lub z kontraktem”: losowo, w wielu wyjazdach są oba rodzaje
  const all = Array.from({ length: 40 }, (_, i) => trip(`f${i}`, { s: 0.9, weeks: 6, D: 0.1 }).players).flat();
  assert.ok(all.some(({ p }) => p.free) && all.some(({ p }) => !p.free));
});

test('Raport: błąd rośnie przy słabej ocenie i regionie, wydmuszki zgodne ze wzorem 0,30 (1 - a)^1,5', () => {
  const g = fresh();
  let p0 = null;
  for (let k = 0; !p0; k++) p0 = trip(`r1-${k}`, { s: 0.8, weeks: 6, D: 0.1, game: { ...bare, seed: g.seed, date: g.date } }).players[0]?.p;
  const rep = (a, i) => makeReport(g, { id: `rep${i}`, club: g.clubId, region: 'balkany', calc: { a } }, { q: 10, a: { RYN: 10, CHA: 10 } }, { ...p0, id: `x${i}` }, {});
  let bustW = 0; let bustS = 0; let errW = 0; let errS = 0; const n = 600;
  for (let i = 0; i < n; i++) {
    const w = rep(0.3, i); const s = rep(0.9, i);
    if (w.bust > 0) bustW++; if (s.bust > 0) bustS++;
    errW += Math.abs(w.seenOvr - p0.ovr); errS += Math.abs(s.seenOvr - p0.ovr);
    for (const r of [w, s]) {
      assert.ok(r.ovrRange[0] <= r.ovrRange[1] && r.potRange[0] <= r.potRange[1]);
      assert.ok(['niska', 'średnia', 'wysoka'].includes(r.confidence));
      assert.ok(['Chętny', 'Raczej tak', 'Wahający się', 'Raczej nie'].includes(r.willingness));
      assert.ok(['niskie', 'średnie', 'wysokie'].includes(r.adaptation));
      assert.ok(r.priceRange[0] <= r.priceRange[1] && r.wageRange[0] <= r.wageRange[1]);
    }
  }
  assert.ok(errW > errS * 2, `błąd ${errW / n} vs ${errS / n}`);
  const fw = 0.30 * 0.7 ** 1.5; const fs = 0.30 * 0.1 ** 1.5;
  assert.ok(Math.abs(bustW / n - fw) < 0.05, `wydmuszki słaby ${bustW / n} vs ${fw}`);
  assert.ok(bustS / n < 0.03, `wydmuszki silny ${bustS / n} vs ${fs}`);
});

test('Migracja skauta: 3 atrybuty na 5, jakość bez zmian, 1-20; stary zapis bez scoutOps działa', () => {
  for (const q of [2, 5, 10, 14, 19]) {
    for (const [pot, ocu, ryn] of [[q, q, q], [q + 2, q - 1, q - 1], [q - 2, q + 1, q + 1]]) {
      const a = migrateScoutAttrs({ POT: pot, OCU: ocu, RYN: ryn }, q, 50, `k${q}${pot}`);
      assert.deepEqual(Object.keys(a).sort(), ['CHA', 'DOS', 'OCE', 'RYN', 'SIE']);
      assert.equal(qFromAttrs(a), Math.max(1, Math.min(20, q)), `q ${q}`);
      for (const v of Object.values(a)) assert.ok(v >= 1 && v <= 20);
    }
  }
  // Stary zapis: skauci z POT/OCU/RYN i bez game.scoutOps
  const g = fresh();
  const scouts = Object.values(g.staff.people).filter((p) => p.role === 'skaut' && p.club);
  const qs = scouts.map((p) => p.q);
  for (const p of scouts) { p.a = { POT: p.q + 1, OCU: p.q - 1, RYN: p.q }; delete p.reg; }
  g.staff.attrs = 1; delete g.scoutOps;
  ensureStaff(g);
  scouts.forEach((p, i) => {
    assert.equal(p.q, qs[i]);
    assert.deepEqual(Object.keys(p.a).sort(), roleAttrKeys('skaut').sort());
    assert.ok(p.reg && Object.keys(p.reg).length >= 1 && Object.keys(p.reg).every((k) => SCOUT_REGION[k]));
  });
  step(g, 2);
  const v = scoutingView(g);
  assert.ok(g.scoutOps && v.freeScouts.length >= SCOUT.pool.size);
});

test('Lista wolnych skautów: ok. 50 osób, 5 cech, regiony, opłaty, prowizja 3-8 %; odświeżenie 1 stycznia', () => {
  const g = fresh();
  const v = scoutingView(g);
  assert.ok(v.freeScouts.length >= 50);
  for (const s of v.freeScouts) {
    assert.deepEqual(Object.keys(s.attrs).sort(), ['cha', 'dos', 'oce', 'ryn', 'sie']);
    assert.ok(s.regions.length >= 1 && s.regions.length <= 3);
    assert.ok(s.missionFees[1] < s.missionFees[2] && s.missionFees[4] < s.missionFees[6]);
    assert.ok(s.commissionPct >= 3 && s.commissionPct <= 8);
    assert.ok(typeof s.permanentOk.ok === 'boolean' && s.permanentOk.text && typeof s.missionOk.ok === 'boolean');
  }
  assert.equal(commissionPct(8), 3); assert.equal(commissionPct(20), 8); assert.equal(commissionPct(2), 3);
  assert.ok(v.freeScouts.some((s) => s.regions[0].level >= 17), 'specjaliści');
  assert.equal(v.refreshDate, '2027-01-01');
  const before = new Set(g.scoutOps.pool);
  g.date = '2026-12-31'; step(g, 1);
  assert.equal(g.scoutOps.refresh, '2027-01-01');
  assert.ok(g.scoutOps.pool.length >= SCOUT.pool.size);
  assert.ok(g.scoutOps.pool.some((id) => !before.has(id)), 'nowi skauci po odświeżeniu');
});

test('Zlecenie: wycena, koszt raz w finansach, nieobecność skauta w sztabie, raport w poczcie z odnośnikiem', () => {
  const g = fresh(); rich(g);
  const o = ownOrder(g);
  const q = missionQuote(g, o);
  assert.ok(q.ok, q.text);
  assert.ok(q.cost > 0 && q.returnDate === addDays(g.date, 14) && ['niska', 'średnia', 'wysoka'].includes(q.chance) && q.expected >= 0 && Array.isArray(q.reasons));
  const cost0 = scoutsCost(g);
  const r = startMission(g, o);
  assert.ok(r.ok && r.missionId, r.text);
  assert.equal(scoutsCost(g) - cost0, q.cost, 'koszt zaksięgowany raz');
  const v = scoutingView(g);
  assert.equal(v.scouts.find((s) => s.id === o.scoutId).status, 'w podróży');
  assert.equal(v.missions[0].status, 'w toku');
  const others = rosterOf(g, g.clubId).filter((p) => p.role === 'skaut' && p.id !== o.scoutId);
  if (!others.length) assert.equal(g.training.staff[g.clubId].skaut.vacant, true, 'jedyny skaut w podróży: wakat');
  // Drugi raz ten sam skaut: zajęty
  assert.equal(missionQuote(g, o).ok, false);
  step(g, 14);
  const v2 = scoutingView(g);
  const m = v2.missions.find((x) => x.id === r.missionId);
  assert.equal(m.status, 'zakończona');
  assert.ok(m.result && m.result.n === m.result.candidates.length);
  assert.equal(scoutsCost(g) - cost0, q.cost, 'bez kolejnych kosztów');
  assert.equal(v2.scouts.find((s) => s.id === o.scoutId).status, 'odpoczynek');
  assert.ok(!g.training.staff[g.clubId].skaut.vacant, 'skaut wrócił do sztabu');
  const msg = g.inbox.find((x) => x.refs?.kind === 'scoutReport' && x.refs.missionId === r.missionId);
  assert.ok(msg && msg.category === 'transfers' && msg.priority === 'important');
  assert.ok(mailRelevant(g, msg));
  assert.ok(mailLinks(g, msg).some((l) => l.run.steps.some((s) => s.sub === 'skauting')));
  assert.ok(mailLinks(g, msg).some((l) => l.run.steps.some((s) => s.act === 'sk-tab' && s.t === 'kandydaci')), 'odnośnik od razu do zakładki Kandydaci');
  assert.match(msg.body, /(Moim zdaniem|Wygląda mi|Trudno mi)/); // ocena jako zdanie skauta
  assert.ok(!/ocena \d+-\d+, potencjał/.test(msg.body));
  assert.equal(v2.newCandidates, v2.candidates.filter((c) => c.state === 'nowy').length);
  for (const c of v2.candidates) {
    assert.ok(g.world.players[c.pid] && g.market.foreign.includes(c.pid), 'kandydat na rynku z zagranicy');
    if (c.free) assert.ok(g.market.free.includes(c.pid));
    assert.ok(c.until > g.date && c.ovrRange.length === 2 && c.note);
  }
  markCandidatesSeen(g);
  assert.equal(scoutingView(g).newCandidates, 0);
});

test('Limity: jedna misja na skauta, najwyżej skauci + 1 na zlecenie, to samo zlecenie po 14 dniach, elita nie dla małych klubów', () => {
  const g = fresh(); rich(g);
  const o = ownOrder(g);
  assert.ok(startMission(g, o).ok);
  const v = scoutingView(g);
  const fs = v.freeScouts.filter((s) => s.missionOk.ok);
  const f1 = startMission(g, { ...o, scoutId: null, freeScoutId: fs[0].id, region: 'iberia' });
  assert.ok(f1.ok, f1.text);
  const f2 = missionQuote(g, { ...o, scoutId: null, freeScoutId: fs[1].id, region: 'azja' });
  assert.equal(f2.ok, false);
  // To samo zlecenie: po odwołaniu nadal blokada 14 dni (bez przelosowania)
  const g2 = fresh(); rich(g2);
  const o2 = ownOrder(g2, { weeks: 1 });
  const a = startMission(g2, o2); cancelMission(g2, a.missionId);
  step(g2, 3);
  const twin = missionQuote(g2, o2);
  assert.ok(twin.ok, 'odwołane zlecenie nie blokuje (zwrot połowy był w 2 dniach)');
  const b = startMission(g2, o2); assert.ok(b.ok);
  step(g2, 9);
  const again = missionQuote(g2, o2);
  assert.equal(again.ok, false); assert.match(again.text, /14 dniach/);
  // Elita (q 16+) nie pracuje dla klubów z renomą poniżej 45
  const g3 = newGame(31, 'sokol-kleczew');
  ensureScoutOps(g3);
  const St = g3.staff;
  const elite = Object.values(St.people).find((p) => p.role === 'skaut' && !p.club && p.q >= 16);
  if (elite) {
    const r = missionQuote(g3, { freeScoutId: elite.id, region: 'balkany', pos: 'ŚP', ageFrom: 20, ageTo: 28, level: 'starter', maxFee: 0, maxWage: 0, contract: 'free', weeks: 2 });
    assert.equal(r.ok, false);
  }
});

test('Odwołanie: w pierwszych 2 dniach zwrot 50 %, później bez zwrotu; skaut wraca', () => {
  const g = fresh(); rich(g);
  const o = ownOrder(g, { weeks: 4 });
  const c0 = scoutsCost(g);
  const r = startMission(g, o);
  const cost = scoutsCost(g) - c0;
  const x = cancelMission(g, r.missionId);
  assert.ok(x.ok);
  assert.equal(scoutsCost(g) - c0, cost - Math.round(cost * 0.5));
  assert.equal(scoutingView(g).scouts.find((s) => s.id === o.scoutId).status, 'w klubie');
  const g2 = fresh(); rich(g2);
  const o2 = ownOrder(g2, { weeks: 4 });
  const c1 = scoutsCost(g2);
  const r2 = startMission(g2, o2);
  const cost2 = scoutsCost(g2) - c1;
  step(g2, 3);
  cancelMission(g2, r2.missionId);
  assert.equal(scoutsCost(g2) - c1, cost2, 'po 2 dniach bez zwrotu');
  assert.equal(cancelMission(g2, r2.missionId).ok, false);
});

test('Prowizja freelancera: % kwoty przy transferze, ryczałt przy wolnym, raz; skaut klubu bez prowizji', () => {
  const g = fresh(); rich(g);
  const date = g.date;
  const mk = (free, pct) => {
    let p = null;
    for (let k = 0; !p; k++) p = trip(`c${free}${pct}-${k}`, { s: 0.9, weeks: 6, D: 0.1, contract: free ? 'free' : 'contract', game: { ...bare, seed: g.seed, date } }).players[0]?.p;
    p.scout = { club: g.clubId, mission: 'mX', found: date, excl: addDays(date, 14), until: addDays(date, 42), pct, commUntil: pct ? addDays(date, 365) : null, scout: 'Test' };
    g.world.players[p.id] = p; g.market.foreign.push(p.id); if (p.free) g.market.free.push(p.id);
    return p;
  };
  const p1 = mk(false, 6);
  const c0 = scoutsCost(g);
  completeTransfer(g, { playerId: p1.id, to: g.clubId, fee: 1000000, contract: { wage: 20000, until: '2029-06-30' } });
  assert.equal(scoutsCost(g) - c0, 60000);
  assert.equal(scoutCommission({ scout: { pct: 5 } }, 0, 20000), 60000, 'ryczałt: 3 tygodniówki x 5 % / 5 %');
  const p2 = mk(true, 4);
  completeTransfer(g, { playerId: p2.id, to: g.clubId, fee: 0, contract: { wage: 10000, until: '2028-06-30' }, kind: 'free' });
  assert.equal(scoutsCost(g) - c0, 60000 + 24000);
  const p3 = mk(false, null);
  completeTransfer(g, { playerId: p3.id, to: g.clubId, fee: 500000, contract: { wage: 10000, until: '2028-06-30' } });
  assert.equal(scoutsCost(g) - c0, 84000, 'skaut klubu: bez prowizji');
  step(g, 1);
  assert.ok(g.inbox.some((m) => m.key === `scout-commission:${p1.id}`));
  assert.equal(scoutingView(g).costs.commissionsSeason, 84000);
});

test('Pula zagraniczna: uzupełnienie nie usuwa kandydatów skautów i liczy 100 bez nich; wyłączność 14 dni dla klubów AI', () => {
  const g = fresh(); rich(g);
  const date = g.date;
  const ids = [];
  for (let i = 0; i < 6; i++) {
    let p = null;
    for (let k = 0; !p; k++) p = trip(`u${i}-${k}`, { s: 0.9, weeks: 6, D: 0.1, game: { ...bare, seed: g.seed, date } }).players.find(({ p: x }) => !x.free)?.p;
    p.id = `skaut-test-${i}`;
    p.scout = { club: g.clubId, mission: 'mT', found: date, excl: addDays(date, 14), until: addDays(date, 120), pct: null };
    g.world.players[p.id] = p; g.market.foreign.push(p.id); ids.push(p.id);
  }
  topUpPool(g, addDays(date, 5), 'test-skaut');
  for (const id of ids) assert.ok(g.market.foreign.includes(id) && g.world.players[id], 'kandydat zostaje');
  assert.equal(g.market.foreign.filter((id) => !ids.includes(id)).length, POOL.size);
  const sp = g.world.players[ids[0]];
  assert.ok(scoutBlocked(sp, 'legia', date) && !scoutBlocked(sp, g.clubId, date) && !scoutBlocked(sp, 'legia', addDays(date, 15)));
  // Klub AI nie widzi kandydata w czasie wyłączności (wiele dni, bo poolCandidates losuje 10 %)
  const groupOf = (p) => GROUP[p.pos] ?? 'MID';
  for (let d = 0; d < 60; d++) {
    const list = poolCandidates(g, { id: 'legia', tier: 1 }, addDays(date, d % 10), { group: 'MID', bar: 0, money: 5e7, groupOf });
    assert.ok(!list.some((x) => ids.includes(x.p.id)));
  }
});

test('Wygasanie: 45 % podpisuje gdzie indziej, 35 % schodzi z rynku, 20 % zostaje na rynku; transakcja w toku zamraża', () => {
  // Rozkład losu wygasania (ziarno gry i zawodnika)
  let a = 0; let b = 0; const n = 4000;
  for (let i = 0; i < n; i++) { const u = new Rng(`skauting-wygasa:9:p${i}`).next(); if (u < 0.45) a++; else if (u < 0.8) b++; }
  assert.ok(Math.abs(a / n - 0.45) < 0.03 && Math.abs(b / n - 0.35) < 0.03);
  // Termin ważności: w oknie bez zmian, poza oknem 14 dni po otwarciu najbliższego okna, najwyżej 14 tygodni
  applySeasonState({});
  assert.equal(candidateUntil('2026-07-10', true), '2026-08-07');
  const late = candidateUntil('2026-08-20', false);
  assert.ok(late > '2026-09-01' && late <= addDays('2026-08-20', 98));
  // Pełny przebieg w grze
  const g = fresh(); rich(g);
  const o = ownOrder(g, { weeks: 6, contract: 'free', maxFee: 0 });
  const r = startMission(g, o);
  step(g, 42);
  const cands = scoutingView(g).candidates;
  if (!cands.length) return;
  const keep = cands[0].pid;
  const P = g.world.players[keep];
  startDeal(g, { playerId: keep, to: g.clubId, fee: 0, contract: { wage: P.askWage, until: '2028-06-30' }, kind: 'free', stage: 'medical' });
  const until = g.scoutOps.cands[keep].until;
  g.date = addDays(until, -1);
  for (let i = 0; i < 3; i++) { g.date = addDays(g.date, 1); processDay(g); }
  const v = scoutingView(g);
  for (const c of v.candidates) {
    if (c.pid === keep) { assert.ok(['obserwowany', 'nowy', 'podpisał'].includes(c.state), `zamrożony: ${c.state}`); continue; }
    assert.ok(['zniknął', 'obserwowany', 'nowy'].includes(c.state));
    if (c.state === 'zniknął') assert.ok(c.goneText && !g.world.players[c.pid]);
  }
  assert.ok(r.ok);
});

test('Kluby AI: te same wzory, misje w oknie z szansą zależną od ligi, kandydaci tylko w zasięgu pieniędzy', () => {
  const g = fresh();
  g.date = '2026-07-05'; // poniedziałek 6 lipca w kolejnym kroku
  step(g, 1);
  const ai = g.scoutOps.missions.filter((m) => m.club !== g.clubId);
  const st = g.scoutOps.stats['2026'].ai;
  assert.ok(st.missions >= 3 && st.missions <= 22, `misje AI: ${st.missions}`);
  for (const m of ai) {
    assert.equal(m.weeks, SCOUT.ai.weeks);
    assert.ok(m.calc.lambda > 0 && m.cost > 0);
    assert.ok(m.maxFee <= g.finance.clubs[m.club].transferBudget + 1);
  }
  // Raz na okres: kolejny poniedziałek bez nowych misji AI
  const n0 = st.missions;
  step(g, 7);
  assert.equal(g.scoutOps.stats['2026'].ai.missions, n0);
  step(g, 25);
  const idx = g.scoutOps.aiIdx;
  const ids = Object.values(idx).flat();
  for (const id of ids) {
    const c = g.scoutOps.cands[id];
    assert.ok(c && c.club !== g.clubId && !g.market.foreign.includes(id), 'kandydat AI poza listami rynku w czasie wyłączności');
  }
  // Zakup AI tylko w granicach POOL.aiMoney wolnych środków
  for (const [club, list] of Object.entries(idx)) {
    const out = poolCandidates(g, { id: club, tier: 1 }, g.date, { group: 'MID', bar: 0, money: 1000, groupOf: (p) => GROUP[p.pos] ?? 'MID' });
    assert.ok(out.every((x) => x.fee <= 1000 * POOL.aiMoney));
    assert.ok(list.length);
  }
});

test('Zatrudnienie i zwolnienie skauta: oferta jak w sztabie, skaut w podróży nie do zwolnienia, obserwowanie', () => {
  const g = fresh(); rich(g);
  const v = scoutingView(g);
  const s = v.scouts[0];
  startMission(g, ownOrder(g));
  assert.equal(fireScout(g, s.id).ok, false);
  const cand = v.freeScouts.find((x) => x.permanentOk.ok);
  if (cand) { const r = hireScout(g, cand.id, 'permanent'); assert.ok(r.ok, r.text); assert.match(r.text, /Decyzja do/); }
  assert.equal(hireScout(g, 'brak', 'permanent').ok, false);
  step(g, 15);
  const c = scoutingView(g).candidates[0];
  if (c) {
    assert.ok(watchCandidate(g, c.pid, false).ok);
    assert.ok(!scoutingView(g).candidates.some((x) => x.pid === c.pid));
    assert.ok(watchCandidate(g, c.pid, true).ok);
    assert.equal(scoutingView(g).candidates.find((x) => x.pid === c.pid).state, 'obserwowany');
  }
  const f = fireScout(g, s.id);
  assert.ok(f.ok, f.text);
});

test('Edytor i datapack v5: plik v4 ze starymi atrybutami skauta wczytuje się, v5 z regionami, zły region odrzuca plik', () => {
  const g = fresh();
  const id = 'legia';
  const sk = peopleValues(g, id).staff.skaut;
  assert.ok(sk?.length && sk[0].reg && Object.keys(sk[0].a).length === 5);
  assert.ok(PACK_V >= 5); // v6: dyrektor sportowy (docs/dyrektor-sportowy.md)
  const v4 = { type: 'ligapl27-datapack', v: 4, seed: 1, clubs: { [id]: { staff: { skaut: [{ name: 'Jan Skaut', age: 50, a: { POT: 14, OCU: 11, RYN: 11 } }] } } }, players: {} };
  const pk = parsePack(JSON.stringify(v4));
  const a = pk.clubs[id].staff.skaut[0].a;
  assert.deepEqual(Object.keys(a).sort(), ['CHA', 'DOS', 'OCE', 'RYN', 'SIE']);
  assert.equal(qFromAttrs(a), 12);
  importPack(g, pk);
  assert.equal(peopleValues(g, id).staff.skaut[0].q, 12);
  const v5 = { type: 'ligapl27-datapack', v: 5, seed: 1, clubs: { [id]: { staff: { skaut: [{ name: 'Ana Skaut', age: 44, a: { DOS: 15, OCE: 14, RYN: 13, SIE: 16, CHA: 12 }, reg: { amerykaPd: 18, iberia: 11 } }] } } }, players: {} };
  importPack(g, parsePack(JSON.stringify(v5)));
  const now = peopleValues(g, id).staff.skaut[0];
  assert.deepEqual(now.reg, { amerykaPd: 18, iberia: 11 });
  assert.equal(now.q, 14);
  const full = exportPack(g, new Date('2026-11-20T10:00:00Z'), { full: true });
  assert.deepEqual(full.clubs[id].staff.skaut[0].reg, { amerykaPd: 18, iberia: 11 });
  const bad = (reg) => { const d = structuredClone(v5); d.clubs[id].staff.skaut[0].reg = reg; return () => parsePack(JSON.stringify(d)); };
  assert.throws(bad({ marsjanie: 10 }), /region/);
  assert.throws(bad({ azja: 25 }));
  assert.throws(bad({ azja: 5, balkany: 5, iberia: 5, skandynawia: 5 }), /najwyżej 3/);
  assert.ok(Object.keys(checkStaff({ skaut: [{ a: { POT: 10 } }] }).errors).length, 'stary klucz w pliku v5 odrzucony');
  assert.ok(Object.keys(checkStaff({ asystent: [{ reg: { azja: 10 } }] }).errors).length, 'regiony tylko dla skauta');
});
