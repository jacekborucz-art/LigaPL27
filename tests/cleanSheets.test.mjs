// Czyste konta bramkarzy: liczone po meczu o punkty (bramkarz co najmniej 60 minut, drużyna bez straconego gola),
// w statystykach sezonu (Kadra) i w podziale na rozgrywki (karta zawodnika); src/season/season.js, src/season/history.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, playQuick, applyResult } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { statObj, sumStats } from '../src/season/history.js';
import { playerStatsHtml } from '../src/ui/playerStatsView.js';
import { Rng } from '../src/core/rng.js';
import '../src/season/dailySystems.js';

test('Czyste konta: tyle, ile meczów o punkty bez straconego gola, w sezonie i w podziale na rozgrywki', () => {
  applySeasonState({});
  const g = { seed: 21, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(21); g.season = createSeason(21, { playerClub: 'widzew' }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 9 }); ensureCareer(g); processDay(g);
  const rng = new Rng('czyste-konta');
  while (g.date < '2026-10-31') {
    for (const f of g.fixtures) if (!f.played && f.date === g.date && (f.home === g.clubId || f.away === g.clubId) && f.away) applyResult(g, f, playQuick(g, f, rng), rng);
    g.inbox = g.inbox.map((m) => ({ ...m, resolved: true }));
    g.date = addDays(g.date, 1); processDay(g);
  }
  const mine = g.fixtures.filter((f) => f.played && f.comp !== 'friendly' && (f.home === 'widzew' || f.away === 'widzew'));
  const clean = mine.filter((f) => f.result.score[f.home === 'widzew' ? 1 : 0] === 0).length;
  const gks = squadOf(g.world, 'widzew').filter((p) => p.pos === 'BR');
  const cs = gks.reduce((s, p) => s + (p.season?.cs ?? 0), 0);
  assert.ok(mine.length >= 8, `rozegrane mecze: ${mine.length}`);
  assert.ok(clean > 0, 'są mecze bez straconego gola');
  assert.ok(cs >= clean - 1 && cs <= clean, `czyste konta bramkarzy ${cs}, mecze bez straconego gola ${clean}`);
  const st = gks.reduce((s, p) => s + statObj(sumStats(Object.values(p.st ?? {}))).cs, 0);
  assert.equal(st, cs, 'podział na rozgrywki zgadza się z sezonem');
  const outfield = squadOf(g.world, 'widzew').filter((p) => p.pos !== 'BR').reduce((s, p) => s + (p.season?.cs ?? 0), 0);
  assert.equal(outfield, 0, 'tylko bramkarze');
  const gk = gks.sort((a, b) => (b.season?.cs ?? 0) - (a.season?.cs ?? 0))[0];
  assert.match(playerStatsHtml(gk, g), /CK<\/abbr>/);
  assert.doesNotMatch(playerStatsHtml(squadOf(g.world, 'widzew').find((p) => p.pos === 'NAP'), g), /CK<\/abbr>/);
});
