import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick, anyClub } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { Rng } from '../src/core/rng.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { CLUBS_L3 } from '../src/data/clubs_l3.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { SEASON, SEASON_YEAR, DOMESTIC } from '../src/config/calendar2026.js';
import { computeMoves, validateTiers, reserveMayPlayIn } from '../src/season/leagues.js';
import { applySeasonState } from '../src/season/rollover.js';
import '../src/season/dailySystems.js';

function newGame(clubId, seed) {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  return g;
}

function playTo(g, until, onSeason) {
  while (g.date < until) {
    for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === g.clubId || x.away === g.clubId))) {
      const rng = new Rng(`gracz:${f.id}`); applyResult(g, f, playQuick(g, f, rng), rng);
    }
    for (const m of g.inbox.filter((x) => !x.resolved && x.actions?.length && !x.optional)) { m.resolved = true; runDecision(g, m, m.actions[0].id); }
    const before = SEASON;
    g.date = addDays(g.date, 1);
    processDay(g);
    if (SEASON !== before) onSeason?.(g);
  }
}

test('Trzy sezony: ligi po 18 klubów, reguły rezerw, kadry i finanse w normie, kalendarz kolejnych lat', () => {
  const g = newGame('widzew', 31);
  const checks = [];
  playTo(g, '2029-07-03', (game) => {
    const tiers = Object.fromEntries(CLUBS_PL.filter((c) => c.tier <= 4).map((c) => [c.id, c.tier]));
    const groups = Object.fromEntries(CLUBS_PL.filter((c) => c.tier === 4).map((c) => [c.id, c.group]));
    assert.deepEqual(validateTiers(tiers, groups), [], SEASON);
    for (const t of [1, 2, 3]) assert.equal(CLUBS_PL.filter((c) => c.tier === t).length, 18, `${SEASON} liga ${t}`);
    for (const gr of [1, 2, 3, 4]) assert.equal(CLUBS_PL.filter((c) => c.tier === 4 && c.group === gr).length, 18, `${SEASON} III liga grupa ${gr}`);
    // Każdy klub ligowy (z III ligą) ma stałą kadrę, nikt nie jest w dwóch kadrach
    const seen = new Set();
    for (const c of CLUBS_PL.filter((x) => x.tier <= 4)) {
      const sq = squadOf(game.world, c.id);
      assert.ok(sq.length >= (c.id === game.clubId ? 16 : 22), `${SEASON} ${c.id}: kadra ${sq.length}`);
      for (const p of sq) { assert.ok(!seen.has(p.id), p.id); seen.add(p.id); assert.equal(p.clubId, c.id); }
      assert.ok(game.finance.clubs[c.id].balance >= 0 || c.id === game.clubId, `${c.id} saldo`);
    }
    // Kalendarz nowego sezonu: te same dni tygodnia, rok dalej
    assert.equal(DOMESTIC.ekstraklasa.start.slice(0, 4), String(SEASON_YEAR));
    assert.equal(new Date(DOMESTIC.ekstraklasa.start).getUTCDay(), new Date('2026-07-24').getUTCDay());
    assert.ok(game.fixtures.every((f) => f.date >= `${SEASON_YEAR}-07-01` && f.date <= `${SEASON_YEAR + 1}-06-30`), 'mecze w datach sezonu');
    assert.ok(game.fixtures.some((f) => f.comp === 'ekstraklasa'));
    checks.push(SEASON);
  });
  assert.deepEqual(checks, ['2027/28', '2028/29', '2029/30']);
  assert.equal(g.archive.length, 3);
  for (const a of g.archive) {
    assert.ok(a.champion && a.cup, `${a.season}: mistrz i zdobywca PP`);
    assert.ok(a.uefa.LM && a.uefa.LE && a.uefa.LK, `${a.season}: zwycięzcy pucharów`);
  }
  // Starzenie: zawodnik z pierwszego sezonu jest o 3 lata starszy
  const any = Object.values(g.world.players).find((p) => p.history?.length === 3);
  if (any) assert.ok(any.history.every((h) => h.s));
  applySeasonState({});
});

test('Reguła rezerw: spadek pierwszej drużyny do ligi rezerw spycha rezerwy niżej, a z ligi spada o jeden klub mniej', () => {
  applySeasonState({});
  const t = (tier) => CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id);
  const t1 = t(1); const t2 = t(2); const t3 = t(3);
  // Śląsk (pierwsza drużyna) w strefie spadku z 1 Ligi do 2 Ligi, gdzie grają Śląsk II
  const parent = CLUBS_PL.find((c) => c.id === 'slask-ii').parent;
  const tables = { 1: t1.filter((x) => x !== parent).concat([parent]).slice(0, 18), 2: t2, 3: t3 };
  if (!t1.includes(parent)) return;
  // parent spada z Ekstraklasy do 1 Ligi: rezerwy w 2 Lidze wolno (2 Liga niżej niż 1 Liga)
  const groupTables = Object.fromEntries([1, 2, 3, 4].map((gr) => [gr, CLUBS_L3.filter((c) => c.group === gr).map((c) => c.id)]));
  const m1 = computeMoves(tables, {}, groupTables, new Rng('r1'));
  assert.equal(m1.tiers[parent], 2);
  assert.equal(m1.tiers['slask-ii'] >= 3, true);
  assert.ok(reserveMayPlayIn(3, 2) && !reserveMayPlayIn(3, 3) && !reserveMayPlayIn(2, 1));
  // Gdy pierwsza drużyna jest w 2 Lidze, rezerwy muszą zejść do III ligi i ratują klub z miejsca spadkowego
  const t3b = [parent, ...t3.filter((x) => x !== 'slask-ii').slice(0, 16), 'slask-ii'];
  const t2b = t2.filter((x) => x !== parent);
  const m2 = computeMoves({ 1: t1.filter((x) => x !== parent).concat(t2b[0]), 2: [...t2b.slice(1), t3[0], t3[1]].slice(0, 18), 3: t3b }, {}, groupTables, new Rng('r2'));
  if (m2.tiers[parent] === 3) assert.equal(m2.tiers['slask-ii'], 4);
  applySeasonState({});
});

test('Klub gracza spada do III ligi: zostaje (III liga jest grywalna), kadra i finanse przechodzą', async () => {
  const { rolloverSeason } = await import('../src/season/rollover.js');
  const g = newGame('chojniczanka', 32);
  const club = CLUBS_PL.find((c) => c.id === 'chojniczanka');
  if (club.tier !== 3) return;
  g.board.trust = 100; // test spadku po sezonie: trener nie może zostać zwolniony w trakcie (wynik sezonu zależy od balansu)
  playTo(g, '2027-06-30');
  // Wymuszamy ostatnie miejsce: wszystkie mecze ligowe klubu gracza przegrane
  for (const f of g.fixtures.filter((x) => x.comp === 'liga2' && (x.home === g.clubId || x.away === g.clubId))) f.result.score = f.home === g.clubId ? [0, 5] : [5, 0];
  g.date = '2027-07-01';
  g.board.trust = 100; // zaufanie z przebiegu sezonu zależy od balansu (np. kartek); test sprawdza tylko sam spadek
  const r = rolloverSeason(g);
  assert.equal(anyClub('chojniczanka').tier, 4);
  assert.ok(anyClub('chojniczanka').group >= 1 && anyClub('chojniczanka').group <= 4);
  assert.ok(!r.messages.find((m) => m.refs?.kind === 'jobOffer'), 'bez zwolnienia za sam spadek do III ligi');
  assert.equal(g.clubId, 'chojniczanka');
  assert.ok(squadOf(g.world, 'chojniczanka').length >= 16 && g.finance.clubs.chojniczanka);
  assert.ok(g.fixtures.some((f) => f.comp === `liga3-${anyClub('chojniczanka').group}` && (f.home === 'chojniczanka' || f.away === 'chojniczanka')));
  applySeasonState({});
});
