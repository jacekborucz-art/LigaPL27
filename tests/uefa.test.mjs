import test from 'node:test';
import assert from 'node:assert/strict';
import { createUefa, uefaDay, checkUefa, UCOMPS, leagueTable, simByStrength, drawPairs, countryOf, allocateEntrants } from '../src/season/uefa.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick } from '../src/season/season.js';
import { processDay, primaryAction, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { Rng } from '../src/core/rng.js';
import { quickKnockout } from '../src/engine/quickSim.js';
import { startMatchday, kickOff, skip, continueAfterBreak, finishMatchday } from '../src/match/matchday.js';
import '../src/season/dailySystems.js';

const DAY_OPTS = { isPolish: () => false, scorersFor: () => [] };
function runUefa(seed) {
  const U = createUefa(seed);
  for (let d = '2026-07-01'; d <= '2027-06-10'; d = addDays(d, 1)) uefaDay(U, d, DAY_OPTS);
  return U;
}

test('Przydział: 36 drużyn w każdej fazie ligowej, polskie kluby w swoich rundach, nikt dwa razy', () => {
  const e = allocateEntrants();
  const all = UCOMPS.flatMap((c) => Object.values(e[c]).flat());
  assert.equal(new Set(all).size, all.length);
  assert.ok(e.LM.Q2.includes('lech') && e.LM.Q2.includes('gornik-zabrze'));
  assert.ok(e.LE.Q3.includes('jagiellonia'));
  assert.ok(e.LK.Q2.includes('rakow') && e.LK.Q2.includes('gks-katowice'));
  assert.equal(e.LM.league.length + 7, 36);
});

test('40 sezonów pucharów w tle: zero naruszeń zasad losowania i kalendarza, każdy puchar ma zwycięzcę', () => {
  for (let s = 1; s <= 40; s++) {
    const U = runUefa(s);
    assert.deepEqual(checkUefa(U), [], `ziarno ${s}`);
    for (const c of UCOMPS) assert.ok(U.comps[c].champion, `${c} bez zwycięzcy (ziarno ${s})`);
    assert.equal(Object.values(U.matches).filter((m) => !m.played).length, 0);
  }
});

test('Przegrani eliminacji spadają do niższych pucharów (LM Q2 -> LE Q3, LE PO -> faza ligowa LK)', () => {
  const U = runUefa(5);
  const lmQ2losers = U.comps.LM.rounds.Q2.ties.map((t) => t.loser);
  assert.ok(lmQ2losers.every((id) => U.comps.LE.rounds.Q3.teams.includes(id)));
  const lePOlosers = U.comps.LE.rounds.PO.ties.map((t) => t.loser);
  assert.ok(lePOlosers.every((id) => U.comps.LK.league.teams.includes(id)));
  const lmPOlosers = U.comps.LM.rounds.PO.ties.map((t) => t.loser);
  assert.ok(lmPOlosers.every((id) => U.comps.LE.league.teams.includes(id)));
});

test('Dwumecz: zwycięzca zgodny z sumą bramek, karne tylko przy remisie w dwumeczu', () => {
  const U = runUefa(9);
  for (const c of UCOMPS) {
    for (const r of ['Q1', 'Q2', 'Q3', 'PO', 'KPO', 'R16', 'QF', 'SF']) {
      for (const t of U.comps[c].rounds[r]?.ties ?? []) {
        const [m1, m2] = t.legs.map((id) => U.matches[id]);
        const a = m1.result.score[0] + m2.result.score[1];
        const b = m1.result.score[1] + m2.result.score[0];
        if (a !== b) assert.equal(t.winner, a > b ? t.a : t.b);
        else assert.ok(m2.result.shootout, `${t.id}: remis w dwumeczu bez karnych`);
        if (a !== b) assert.equal(m2.result.shootout, null);
      }
    }
  }
});

test('Baraże fazy pucharowej: miejsca 9-24 grają, 1-8 czekają w 1/8 finału', () => {
  const U = runUefa(3);
  const table = leagueTable(U, 'LM');
  const kpo = U.comps.LM.rounds.KPO.ties.flatMap((t) => [t.a, t.b]);
  assert.deepEqual([...kpo].sort(), table.slice(8, 24).map((r) => r.id).sort());
  const r16 = U.comps.LM.rounds.R16.ties.flatMap((t) => [t.a, t.b]);
  for (const r of table.slice(0, 8)) assert.ok(r16.includes(r.id));
});

test('Losowanie par eliminacji omija kluby z jednego kraju', () => {
  const rng = new Rng('pary');
  const teams = createUefa(1).comps.LM.rounds.Q1.entrants;
  const pairs = drawPairs(teams, rng);
  assert.equal(pairs.length, teams.length / 2);
  assert.ok(pairs.every(([a, b]) => countryOf(a) !== countryOf(b)));
});

test('Model siły: silniejszy wygrywa częściej, rewanż z wynikiem pierwszego meczu liczy sumę bramek', () => {
  const rng = new Rng('sila');
  let w = 0;
  for (let i = 0; i < 400; i++) { const r = simByStrength('bayern', 'thun', rng); if (r.score[0] > r.score[1]) w++; }
  assert.ok(w > 280, `Bayern wygrał ${w}/400`);
  for (let i = 0; i < 200; i++) {
    const r = simByStrength('thun', 'bayern', rng, { firstLeg: [0, 3] });
    if (r.shootout) assert.equal(r.score[0] + 0, r.score[1] + 3); // karne tylko przy remisie w dwumeczu
    if (!r.extraTime) assert.notEqual(r.score[0] + 0, r.score[1] + 3);
  }
});

test('Szybka symulacja rewanżu (polskie kluby): dogrywka tylko przy remisie w dwumeczu', () => {
  const world = generateWorld(4);
  const H = { squad: squadOf(world, 'lech') }; const A = { squad: squadOf(world, 'rakow') };
  const rng = new Rng('rewanz');
  for (let i = 0; i < 300; i++) {
    const r = quickKnockout(H, A, {}, rng, { firstLeg: [1, 2] });
    const level90 = !r.extraTime;
    if (r.extraTime && !r.shootout) assert.notEqual(r.score[0] + 1, r.score[1] + 2);
    if (r.shootout) assert.equal(r.score[0] + 1, r.score[1] + 2);
    if (level90) assert.notEqual(r.score[0] + 1, r.score[1] + 2);
  }
});

function playSeason(clubId, seed, until = '2027-06-10') {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  processDay(g);
  while (g.date < until) {
    for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === clubId || x.away === clubId))) {
      const rng = new Rng(`gracz:${f.id}`); applyResult(g, f, playQuick(g, f, rng), rng);
    }
    g.date = addDays(g.date, 1); processDay(g);
  }
  return g;
}

function collisions(g) {
  const by = new Map();
  for (const f of g.fixtures) for (const c of [f.home, f.away]) { if (!c) continue; if (!by.has(c)) by.set(c, []); by.get(c).push(f.date); }
  const out = [];
  for (const [c, ds] of by) { ds.sort(); for (let i = 1; i < ds.length; i++) if ((new Date(ds[i]) - new Date(ds[i - 1])) / 864e5 < 2) out.push(`${c} ${ds[i - 1]} ${ds[i]}`); }
  return out;
}

test('Pełny sezon z pucharami: polskie kluby grają w terminach UEFA, zero kolizji, wszystko rozegrane, poniżej 15 s', () => {
  for (const [club, seed] of [['lech', 7], ['jagiellonia', 21], ['rakow', 13]]) {
    const t0 = performance.now();
    const g = playSeason(club, seed);
    assert.ok(performance.now() - t0 < 15000);
    assert.deepEqual(collisions(g), [], `${club} ${seed}`);
    assert.equal(g.fixtures.filter((f) => !f.played && f.home && f.away).length, 0);
    const U = g.season.uefa;
    assert.deepEqual(checkUefa(U), []);
    const mirrored = g.fixtures.filter((f) => f.comp === 'uefa');
    assert.ok(mirrored.length >= 10);
    for (const f of mirrored) {
      assert.equal(f.date, U.matches[f.id].date, `${f.id}: data UEFA zmieniona`);
      assert.deepEqual(U.matches[f.id].result.score, f.result.score);
    }
  }
});

test('Mecz UEFA gracza na żywo: rywal zagraniczny z kadrą, rewanż liczy dwumecz', () => {
  const g = playSeason('lech', 7, '2026-07-21');
  // Lech gra LM Q2: 22 lipca pierwszy mecz
  let a = primaryAction(g);
  while (a.kind !== 'play') { g.date = addDays(g.date, 1); processDay(g); a = primaryAction(g); }
  const f = a.match;
  assert.equal(f.comp, 'uefa');
  const S = startMatchday(g, f);
  assert.ok(S.pre.headlines.length);
  kickOff(g, S); skip(S); continueAfterBreak(S); skip(S);
  finishMatchday(g, S);
  assert.ok(f.played);
  // Dzień później: wynik w pucharach, rewanż wie o pierwszym meczu
  g.date = addDays(g.date, 1); processDay(g);
  assert.ok(g.season.uefa.matches[f.id].played);
  const leg2 = g.fixtures.find((x) => x.id === f.id.replace(/-1$/, '-2'));
  assert.deepEqual(leg2.knockout.firstLeg, [f.result.score[1], f.result.score[0]]);
});
