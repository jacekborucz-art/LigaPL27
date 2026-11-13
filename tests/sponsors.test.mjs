// Umowy sponsorskie (src/career/sponsors.js, docs/finanse.md rozdz. Sponsorzy) i zakładka Klub > Sponsorzy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { clubById } from '../src/data/clubs_pl.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { stadiumCapacity } from '../src/career/finance.js';
import { SEASON_YEAR } from '../src/config/calendar2026.js';
import { seasonGoalFor } from '../src/career/board.js';
import { ensureSponsors, slotShares, aiVariant, attractiveness, makeOffer, signOffer, sponsorsDay, SP } from '../src/career/sponsors.js';
import { Rng } from '../src/core/rng.js';
import { sponsorsView, handleSponsorAction } from '../src/ui/sponsorsView.js';
import { handleClubAction, isClubAction } from '../src/ui/klubView.js';
import '../src/season/dailySystems.js';

function newGame(clubId = 'widzew', seed = 5) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  return g;
}
const step = (g, n = 1) => { for (let i = 0; i < n; i++) { g.date = addDays(g.date, 1); processDay(g); } };
const sponsorIn = (g, id, month) => g.finance.clubs[id].ledger[month]?.in?.sponsor ?? 0;
const sumOf = (S) => S.contracts.reduce((s, c) => s + c.annual, 0);

const G = newGame();

test('Start gry: umowy każdego klubu sumują się do plan.sponsor, wygasają w ciągu 1-3 sezonów', () => {
  const st = G.sponsors;
  assert.ok(Object.keys(st.clubs).length >= 50);
  for (const [id, S] of Object.entries(st.clubs)) {
    assert.equal(sumOf(S), G.finance.clubs[id].plan.sponsor, id);
    for (const c of S.contracts) {
      assert.ok(c.end >= `${SEASON_YEAR + 1}-06-30` && c.end <= `${SEASON_YEAR + 3}-06-30`, `${id} ${c.slot} ${c.end}`);
      assert.ok(c.start <= G.date && c.name && c.industry && ['fixed', 'bonus', 'long'].includes(c.variant));
    }
    assert.ok(S.contracts.some((c) => c.slot === 'main') && S.contracts.some((c) => c.slot === 'partners'), id);
  }
  // Wygasanie rozłożone w czasie
  const ends = new Set(Object.values(st.clubs).flatMap((S) => S.contracts.filter((c) => c.slot !== 'partners').map((c) => c.end)));
  assert.ok(ends.size >= 3);
});

test('Miejsca: nazwa stadionu tylko przy dużym stadionie, stadion miejski za połowę, reszta do pakietu partnerów', () => {
  for (const id of Object.keys(G.sponsors.clubs)) {
    const club = clubById(id); const plan = G.finance.clubs[id].plan;
    const s = slotShares(club, plan);
    assert.ok(Math.abs(Object.values(s).reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.equal(s.main, 0.4);
    if (stadiumCapacity(club) < SP.NAMING_MIN_CAP) assert.equal(s.naming, 0, id);
    else assert.equal(s.naming, plan.ownerType === 'miasto' ? 0.05 : 0.1, id);
    assert.equal(G.sponsors.clubs[id].contracts.some((c) => c.slot === 'naming'), s.naming > 0, id);
  }
});

test('Wpływy co miesiąc z umów zamiast płaskiej kwoty, bez podwójnego księgowania', () => {
  const g = newGame('korona', 7);
  assert.equal(sponsorIn(g, 'korona', '2026-07'), g.finance.clubs.korona.plan.sponsor / 12);
  step(g, 31); // 1 sierpnia
  assert.equal(g.date, '2026-08-01');
  const S = g.sponsors.clubs.korona;
  const expected = S.contracts.reduce((s, c) => s + Math.round(c.annual / 12), 0);
  const prem = g.finance.clubs.korona.log.filter((l) => l.date.startsWith('2026-08') && /Premia sponsora/.test(l.note)).reduce((s, l) => s + l.amount, 0);
  assert.equal(sponsorIn(g, 'korona', '2026-08') - prem, expected);
  step(g, 1);
  assert.equal(sponsorIn(g, 'korona', '2026-08') - prem, expected, 'drugi dzień miesiąca bez nowych wpływów');
});

test('Stary zapis bez game.sponsors: umowy tworzą się leniwie, bieżący miesiąc nie jest liczony drugi raz', () => {
  const g = newGame('lech', 9);
  step(g, 20);
  delete g.sponsors; g.finance.sponsorContracts = false;
  const before = sponsorIn(g, 'lech', '2026-07');
  step(g, 1);
  assert.ok(g.sponsors?.clubs?.lech);
  assert.equal(sponsorIn(g, 'lech', '2026-07'), before);
  assert.equal(sumOf(g.sponsors.clubs.lech), g.finance.clubs.lech.plan.sponsor);
  // Widok też inicjuje stan
  delete g.sponsors;
  const html = sponsorsView(g, {});
  assert.ok(g.sponsors && /Suma umów rocznie/.test(html));
});

test('Wariant AI według celu: mistrzostwo z premiami, utrzymanie długoterminowy, reszta stała kwota', () => {
  const ids = Object.keys(G.sponsors.clubs);
  for (const id of ids) {
    const t = seasonGoalFor(clubById(id)).target;
    assert.equal(aiVariant(clubById(id)), t <= 3 ? 'bonus' : t >= 15 ? 'long' : 'fixed');
  }
  assert.ok(ids.some((id) => aiVariant(clubById(id)) === 'bonus') && ids.some((id) => aiVariant(clubById(id)) === 'long'));
});

test('Oferta: trzy warianty z wartością w granicach i atrakcyjność 0,75-1,40', () => {
  for (const id of Object.keys(G.sponsors.clubs)) {
    const a = attractiveness(G, id);
    assert.ok(a >= 0.75 && a <= 1.4, `${id} ${a}`);
  }
  G.board.fansMood = 95;
  const hi = attractiveness(G, G.clubId);
  G.board.fansMood = 15;
  assert.ok(attractiveness(G, G.clubId) < hi);
  G.board.fansMood = 55;
  const o = makeOffer(G, G.clubId, 'main', G.date, 'Test.', new Rng('t'));
  const pool = G.finance.clubs[G.clubId].plan.sponsor;
  assert.ok(o.value >= 0.4 * pool * 0.75 * 0.92 - 1000 && o.value <= 0.4 * pool * 1.4 * 1.08 + 1000);
  const { fixed, bonus, long } = o.variants;
  assert.ok(Math.abs(fixed.annual - o.value) <= 1000 && Math.abs(bonus.annual - o.value * 0.75) <= 1000 && Math.abs(long.annual - o.value * 0.9) <= 1000);
  assert.deepEqual(Object.keys(bonus.bonuses).sort(), ['cup', 'title', 'top3', 'uefaLeague']);
  assert.ok(Math.abs(bonus.bonuses.title - o.value * 0.4) <= 1000);
  assert.deepEqual(fixed.relegation, { cut: 0.5, terminate: true });
  assert.deepEqual(long.relegation, { cut: 0.3, terminate: false });
  assert.equal(long.growth, 0.03);
  assert.ok(fixed.years >= 2 && long.years <= 5 && bonus.years >= 2);
});

test('Wygasła umowa: oferta w poczcie i zakładce, wybór wariantu w zakładce Klub > Sponsorzy', () => {
  const g = newGame('legia', 11);
  const S = g.sponsors.clubs.legia;
  const main = S.contracts.find((c) => c.slot === 'main');
  main.end = '2026-06-30'; S.season = SEASON_YEAR - 1; // wymuszamy przegląd umów jak 1 lipca
  step(g, 1);
  const o = S.offers.find((x) => x.slot === 'main');
  assert.ok(o, 'oferta na wolne miejsce sponsora głównego');
  const m = g.inbox.find((x) => x.refs?.kind === 'sponsorOffer' && x.refs.offerId === o.id);
  assert.ok(m && !m.resolved && m.optional && m.actions.length === 3);
  const html = sponsorsView(g, {});
  assert.equal((html.match(/data-act="sp-pick"/g) ?? []).length, 3);
  assert.ok(!/undefined|NaN|\u2014/.test(html), 'bez błędów i półpauz w tekście');
  assert.ok(isClubAction('sp-pick'));
  const r = handleClubAction(g, 'sp-pick', { o: o.id, v: 'bonus' });
  assert.ok(r.save && /Podpisano umowę/.test(r.ui.kMsg));
  const c = S.contracts.find((x) => x.slot === 'main');
  assert.equal(c.variant, 'bonus');
  assert.ok(c.bonuses.title > 0 && c.end >= `${SEASON_YEAR + 2}-06-30`);
  assert.ok(g.inbox.find((x) => x.id === m.id).resolved, 'wiadomość rozstrzygnięta');
  assert.match(handleSponsorAction(g, 'sp-pick', { o: o.id, v: 'fixed' }).ui.kMsg, /nieaktualna/);
});

test('Brak decyzji przez 14 dni: zarząd podpisuje wariant ze stałą kwotą; decyzja z poczty też działa', () => {
  const g = newGame('pogon-szczecin', 12);
  const S = g.sponsors.clubs['pogon-szczecin'];
  for (const slot of ['sleeve', 'kit']) S.contracts.find((c) => c.slot === slot).end = '2026-06-30';
  S.season = SEASON_YEAR - 1;
  step(g, 1);
  const [o1, o2] = ['sleeve', 'kit'].map((slot) => S.offers.find((x) => x.slot === slot));
  assert.ok(o1 && o2);
  const m2 = g.inbox.find((x) => x.refs?.offerId === o2.id);
  runDecision(g, m2, 'long');
  assert.equal(S.contracts.find((c) => c.slot === 'kit').variant, 'long');
  step(g, 15);
  const c1 = S.contracts.find((c) => c.slot === 'sleeve');
  assert.equal(c1.variant, 'fixed');
  assert.equal(S.offers.length, 0);
  assert.ok(g.inbox.some((x) => /Zarząd podpisał umowę/.test(x.subject)));
});

function fixedContracts(g, id) {
  const S = g.sponsors.clubs[id];
  const mk = (slot, variant, relegation, annual) => ({ id: `t-${slot}`, slot, name: `Firma ${slot}`, industry: 'test', annual, years: 3, start: '2025-07-01', end: '2029-06-30', variant, growth: 0, bonuses: {}, relegation, paid: g.date.slice(0, 7), bonusPaid: {} });
  S.contracts = [
    mk('main', 'long', { cut: 0.3, terminate: false }, 1000000),
    mk('sleeve', 'bonus', { cut: 0.4, terminate: false }, 500000),
    mk('kit', 'fixed', { cut: 0.5, terminate: true }, 400000),
    mk('partners', 'fixed', { cut: 0.3, terminate: false }, 800000),
  ];
  return S;
}

test('Spadek: obniżki z klauzul, zerwania tylko przy klauzuli rozwiązania, pakiet partnerów -30 %', () => {
  const g = newGame('lks', 13);
  const S = fixedContracts(g, 'lks');
  S.tier = clubById('lks').tier - 1; S.season = SEASON_YEAR - 1; // klub grał wyżej: spadek
  const out = sponsorsDay(g, g.date);
  const by = (slot) => S.contracts.find((c) => c.slot === slot);
  assert.equal(by('main').annual, 700000);
  assert.equal(by('sleeve').annual, 300000);
  assert.equal(by('partners').annual, 560000);
  const kit = by('kit');
  assert.ok(!kit || kit.annual === 200000 || kit.id !== 't-kit', 'umowa stała: -50 % albo zerwanie i nowa umowa');
  assert.ok(S.log.some((l) => /Spadek/.test(l.text)));
  assert.ok(out.some((m) => m.subject === 'Sponsorzy po spadku'));
});

test('Awans: klauzula +50 % dla sponsora głównego i rękawa, oferty na kończące się miejsca w ciągu 14 dni', () => {
  const g = newGame('korona', 14);
  const S = fixedContracts(g, 'korona');
  S.contracts.find((c) => c.slot === 'kit').end = `${SEASON_YEAR + 1}-06-30`;
  S.tier = clubById('korona').tier + 1; S.season = SEASON_YEAR - 1;
  sponsorsDay(g, g.date);
  assert.equal(S.contracts.find((c) => c.slot === 'main').annual, 1500000);
  assert.equal(S.contracts.find((c) => c.slot === 'sleeve').annual, 750000);
  assert.equal(S.contracts.find((c) => c.slot === 'partners').annual, 800000);
  const q = S.queue.find((x) => x.slot === 'kit');
  assert.ok(q && q.date > g.date && q.date <= addDays(g.date, 14));
  step(g, 14);
  assert.ok(S.offers.some((o) => o.slot === 'kit') || S.contracts.find((c) => c.slot === 'kit').id !== 't-kit');
});

test('Premia sponsora za Puchar Polski trafia do księgi jako sponsor z opisem', () => {
  const g = newGame('jagiellonia', 15);
  const S = g.sponsors.clubs.jagiellonia;
  S.contracts.find((c) => c.slot === 'main').bonuses = { cup: 300000 };
  g.sponsors.cup = null;
  g.fixtures.push({ id: 'PP-F-test', comp: 'pp', round: 'F', date: g.date, home: 'jagiellonia', away: 'legia', played: true, fin: true, neutral: true, result: { score: [2, 1] } });
  const before = sponsorIn(g, 'jagiellonia', g.date.slice(0, 7));
  sponsorsDay(g, g.date);
  assert.equal(sponsorIn(g, 'jagiellonia', g.date.slice(0, 7)) - before, 300000);
  assert.ok(g.finance.clubs.jagiellonia.log.some((l) => /^Premia sponsora: /.test(l.note)));
  assert.equal(S.bonus[SEASON_YEAR], 300000);
  sponsorsDay(g, g.date);
  assert.equal(sponsorIn(g, 'jagiellonia', g.date.slice(0, 7)) - before, 300000, 'premia raz w sezonie');
});

test('Kluby AI: oferty podpisywane od razu, sezon symulacji zostawia sensowne umowy', () => {
  const g = newGame('widzew', 16);
  step(g, 120);
  for (const [id, S] of Object.entries(g.sponsors.clubs)) {
    if (id !== g.clubId) assert.equal(S.offers.length, 0, id);
    const pool = g.finance.clubs[id].plan.sponsor;
    const sum = sumOf(S);
    assert.ok(sum > pool * 0.5 && sum < pool * 1.6, `${id}: ${sum} wobec ${pool}`);
  }
  assert.ok(ensureSponsors(g) === g.sponsors);
  const mine = g.sponsors.clubs[g.clubId];
  const o = makeOffer(g, g.clubId, 'extra', g.date, 'Test.', new Rng('x'));
  mine.offers.push(o);
  const c = signOffer(g, g.clubId, o.id, 'fixed', g.date);
  assert.ok(c && mine.contracts.filter((x) => x.slot === 'extra').includes(c), 'partner dodatkowy dochodzi do umów');
});
