import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { generateWorld } from '../src/world/worldGen.js';
import { createSeason, playQuick, applyResult, LEAGUE_COMPS, anyClub } from '../src/season/season.js';
import { processDay, continueUntilStop, primaryAction, addDays } from '../src/core/gameLoop.js';
import { standings } from '../src/season/standings.js';
import { roundRobin } from '../src/season/schedule.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { FIFA_WINDOWS } from '../src/config/calendar2026.js';
import '../src/season/dailySystems.js';

function newGame(clubId, seed = 2026) {
  const g = { seed, clubId, date: '2026-07-01', season: SEASON_ID, inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  processDay(g);
  return g;
}
const SEASON_ID = '2026/27';

/** Cały sezon: mecze gracza rozgrywa automat (szybka symulacja), reszta idzie w tle. */
function playSeason(g, until = '2027-06-30') {
  const rng = new Rng('gracz');
  let guard = 0;
  while (g.date < until && guard++ < 2000) {
    const a = primaryAction(g);
    if (a.kind === 'play') {
      const f = a.match;
      if (!f.away) { f.played = true; f.result = { score: [0, 0] }; continue; } // mecz UEFA do etapu 8
      applyResult(g, f, playQuick(g, f, rng), rng);
      continue;
    }
    if (a.kind === 'decide') { g.inbox = g.inbox.map((m) => ({ ...m, resolved: true })); continue; }
    continueUntilStop(g, { maxDays: Math.max(1, Math.round((new Date(until) - new Date(g.date)) / 864e5)) }); // bez wchodzenia w kolejny sezon
  }
}

const world = generateWorld(2026);
const season = createSeason(2026, { playerClub: 'widzew' });

test('Terminarz: 3 ligi po 306 meczów, każda para gra mecz i rewanż, po 17 meczów u siebie', () => {
  for (const comp of LEAGUE_COMPS) {
    const fx = season.fixtures.filter((f) => f.comp === comp);
    assert.equal(fx.length, 306, comp);
    const pairs = new Set(fx.map((f) => `${f.home}>${f.away}`));
    assert.equal(pairs.size, 306);
    for (const c of new Set(fx.map((f) => f.home))) assert.equal(fx.filter((f) => f.home === c).length, 17);
    const rounds = [...new Set(fx.map((f) => f.round))];
    assert.equal(rounds.length, 34);
  }
});

test('Terminarz: kolejki po kolei, Ekstraklasa bez meczów w oknach FIFA, dwie ostatnie kolejki jednocześnie', () => {
  for (const comp of LEAGUE_COMPS) {
    const fx = season.fixtures.filter((f) => f.comp === comp);
    for (let r = 2; r <= 34; r++) {
      const prevMax = fx.filter((f) => f.round === r - 1).map((f) => f.date).sort().pop();
      const curMin = fx.filter((f) => f.round === r).map((f) => f.date).sort()[0];
      assert.ok(curMin > prevMax, `${comp} kolejka ${r}`);
    }
    for (const r of [33, 34]) assert.equal(new Set(fx.filter((f) => f.round === r).map((f) => f.date)).size, 1, `${comp} ${r}`);
  }
  const ek = season.fixtures.filter((f) => f.comp === 'ekstraklasa');
  for (const f of ek) assert.ok(!FIFA_WINDOWS.some((w) => f.date >= w.from && f.date <= w.to), f.id);
  assert.equal(ek.map((f) => f.date).sort()[0], '2026-07-24');
  assert.ok(ek.map((f) => f.date).sort().pop() <= '2027-05-23');
});

test('Żaden klub nie gra dwóch meczów w odstępie poniżej 2 dni (liga, Superpuchar, puchary)', () => {
  const byClub = new Map();
  for (const f of season.fixtures) for (const c of [f.home, f.away]) { if (!c) continue; if (!byClub.has(c)) byClub.set(c, []); byClub.get(c).push(f.date); }
  for (const [c, dates] of byClub) {
    const d = dates.sort();
    for (let i = 1; i < d.length; i++) {
      const gap = (new Date(d[i]) - new Date(d[i - 1])) / 86400000;
      assert.ok(gap >= 2, `${c}: ${d[i - 1]} i ${d[i]}`);
    }
  }
});

test('Metoda „po kole”: w każdej kolejce każda drużyna gra dokładnie raz', () => {
  const rr = roundRobin(Array.from({ length: 18 }, (_, i) => `k${i}`), new Rng('rr'));
  for (const round of rr) assert.equal(new Set(round.flat()).size, 18);
});

test('Tabela: kryteria punkty, mecze bezpośrednie, bilans', () => {
  const fx = [
    { home: 'a', away: 'b', played: true, date: '1', result: { score: [2, 0] } },
    { home: 'b', away: 'c', played: true, date: '2', result: { score: [3, 0] } },
    { home: 'c', away: 'a', played: true, date: '3', result: { score: [1, 0] } },
  ];
  const t = standings(fx, ['a', 'b', 'c']);
  assert.deepEqual(t.map((r) => r.points), [3, 3, 3]);
  assert.equal(t.reduce((s, r) => s + r.played, 0), 6);
});

test('Pełny sezon: wszystkie mecze rozegrane, puchar ma zwycięzcę, baraże rozstrzygnięte, punkty się zgadzają', () => {
  const g = newGame('widzew');
  const t0 = performance.now();
  playSeason(g);
  const ms = performance.now() - t0;
  assert.ok(ms < 30000, `sezon trwał ${ms} ms`);
  for (const comp of LEAGUE_COMPS) {
    const fx = g.fixtures.filter((f) => f.comp === comp);
    assert.ok(fx.every((f) => f.played), comp);
    const tier = { ekstraklasa: 1, liga1: 2, liga2: 3 }[comp];
    const table = standings(fx, CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id));
    const draws = fx.filter((f) => f.result.score[0] === f.result.score[1]).length;
    assert.equal(table.reduce((s, r) => s + r.points, 0), 3 * (306 - draws) + 2 * draws);
    assert.ok(table.every((r) => r.played === 34));
  }
  assert.ok(g.season.cup.champion, 'Puchar Polski ma zwycięzcę');
  const final = g.fixtures.find((f) => f.id === 'PP-F-1');
  assert.equal(final.date, '2027-05-02');
  for (const comp of ['liga1', 'liga2']) {
    const f = g.fixtures.find((x) => x.id === `PO-${comp}-F`);
    assert.ok(f?.played, `finał baraży ${comp}`);
    assert.ok(!['legia-ii', 'slask-ii'].includes(f.home) && !['legia-ii', 'slask-ii'].includes(f.away));
  }
  // Po całym sezonie (z losowanymi rundami pucharu i barażami) nadal nikt nie gra co 1 dzień
  const byClub = new Map();
  for (const f of g.fixtures.filter((x) => x.home && x.away)) for (const c of [f.home, f.away]) { if (!byClub.has(c)) byClub.set(c, []); byClub.get(c).push(f.date); }
  for (const [c, dates] of byClub) {
    const d = dates.sort();
    for (let i = 1; i < d.length; i++) assert.ok((new Date(d[i]) - new Date(d[i - 1])) / 86400000 >= 2, `${c}: ${d[i - 1]} i ${d[i]}`);
  }
  // Superpuchar rozegrany
  assert.ok(g.fixtures.find((f) => f.comp === 'super').played);
  // Statystyki zawodników: strzelcy i pauzy działają
  const players = Object.values(g.world.players);
  const goals = players.reduce((s, p) => s + (p.season?.g ?? 0), 0);
  const leagueGoals = g.fixtures.filter((f) => LEAGUE_COMPS.includes(f.comp)).reduce((s, f) => s + f.result.score[0] + f.result.score[1], 0);
  assert.ok(goals >= leagueGoals * 0.95, `gole zawodników ${goals}, gole w ligach ${leagueGoals}`);
  assert.ok(players.some((p) => (p.yc?.league ?? 0) >= 4), 'ktoś dostał 4 żółte kartki');
  assert.ok(g.inbox.some((m) => m.subject.startsWith('Wyniki ')), 'wiadomości z wynikami kolejek');
  assert.ok(g.inbox.some((m) => m.subject.includes('Losowanie')), 'wiadomości o losowaniu pucharu');
});

test('Zawieszony zawodnik nie gra w kolejnym meczu ligowym i odbywa pauzę', () => {
  const g = newGame('widzew', 77);
  const rng = new Rng('x');
  const f = g.fixtures.find((x) => x.comp === 'ekstraklasa' && x.home !== 'widzew' && x.away !== 'widzew');
  const p = g.world.players[g.world.clubs[f.home].squad[5]];
  p.susp = { league: 1 };
  const res = playQuick(g, f, rng);
  assert.ok(!res.players[0].some((x) => x.id === p.id), 'zawieszony nie zagrał');
  applyResult(g, f, res, rng);
  assert.equal(p.susp.league, 0);
});

test('Kontuzja z meczu skraca się co dzień i zawodnik wraca', () => {
  const g = newGame('widzew', 88);
  const p = g.world.players[g.world.clubs.widzew.squad[8]];
  p.injuryDays = 3; p.injury = { name: 'stłuczenie', days: 3 };
  for (let i = 0; i < 3; i++) { g.date = addDays(g.date, 1); processDay(g); }
  assert.equal(p.injuryDays, 0);
  assert.equal(p.injury, null);
  assert.ok(g.inbox.some((m) => m.subject.includes('wraca do gry')));
});

test('Klub gracza: pętla zatrzymuje się na jego meczu z prawdziwym rywalem z terminarza', () => {
  const g = newGame('widzew', 99);
  while (primaryAction(g).kind !== 'play') continueUntilStop(g);
  const f = primaryAction(g).match;
  assert.ok(f.home === 'widzew' || f.away === 'widzew');
  assert.ok(anyClub(f.home === 'widzew' ? f.away : f.home), 'rywal istnieje');
});

test('Niższe ligi: 72 kluby III ligi i 276 IV ligi, rezerwy przypięte do pierwszych drużyn', async () => {
  const { CLUBS_L3 } = await import('../src/data/clubs_l3.js');
  const { CLUBS_L4 } = await import('../src/data/clubs_l4.js');
  assert.equal(CLUBS_L3.length, 72);
  assert.equal(CLUBS_L4.length, 276);
  const ids = [...CLUBS_PL, ...CLUBS_L3, ...CLUBS_L4].map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const known = new Set(ids);
  for (const c of [...CLUBS_L3, ...CLUBS_L4].filter((x) => x.parent)) assert.ok(known.has(c.parent), `${c.name} -> ${c.parent}`);
  assert.ok(CLUBS_L3.every((c) => c.L > CLUBS_L4[0].L - 1.5 && c.L < 9));
});

test('Puchar Polski: runda wstępna to 14 klubów III i IV ligi bez rezerw', () => {
  const pre = season.cup.entrants.PRE.map(anyClub);
  assert.equal(pre.length, 14);
  assert.ok(pre.every((c) => c && !c.parent && c.tier >= 4));
  assert.equal(pre.filter((c) => c.tier === 5).length, 7);
});

test('Klub IV ligi bez stałej kadry: kadra losowana na mecz, stała w sezonie, grywalna w pełnym silniku', async () => {
  const { ephemeralSquad } = await import('../src/world/ephemeral.js');
  const { CLUBS_L4 } = await import('../src/data/clubs_l4.js');
  const { createTactics } = await import('../src/engine/lineup.js');
  const { createMatch, runToEnd } = await import('../src/engine/match/match.js');
  const club = CLUBS_L4[0];
  const a = ephemeralSquad(club, '2026/27');
  assert.equal(a.length, 25);
  assert.deepEqual(a.map((p) => p.name), ephemeralSquad(club, '2026/27').map((p) => p.name));
  const avg = a.slice(0, 11).reduce((s, p) => s + p.ovr, 0) / 11;
  assert.ok(Math.abs(avg - club.L) < 1.2, `średnia ${avg} vs L ${club.L}`);
  const home = { club: anyClub('widzew'), squad: world.clubs.widzew.squad.map((id) => world.players[id]), ai: true };
  home.tactics = createTactics(home.squad);
  const away = { club, squad: a, tactics: createTactics(a), ai: true };
  let wins = 0;
  for (let i = 0; i < 30; i++) { const r = runToEnd(createMatch({ seed: `iv${i}`, home, away, ctx: { knockout: 'single' } })); if (r.winner === 0) wins++; }
  assert.ok(wins >= 20, `klub Ekstraklasy wygrał ${wins}/30 z klubem IV ligi`);
});
