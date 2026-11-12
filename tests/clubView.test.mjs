// Widok innego klubu: kadra ze statystykami, terminarz, trener i sztab, bez budżetu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureTraining } from '../src/training/index.js';
import { renderClubView, headCoachName, hasClubView } from '../src/ui/clubView.js';
import { clubFixtures } from '../src/season/history.js';

function game(seed = 7) {
  const g = { seed, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: 'widzew' });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 });
  ensureTraining(g);
  return g;
}

test('Widok klubu: kadra, terminarz, trener i sztab, bez budżetu i płac', () => {
  const g = game();
  assert.ok(hasClubView(g, 'legia'));
  const html = renderClubView(g, 'legia');
  assert.ok(html.includes(headCoachName(g, 'legia')), 'trener prowadzący');
  assert.ok(html.includes('Sztab szkoleniowy'));
  assert.equal((html.match(/data-act="extplayer"/g) ?? []).length, squadOf(g.world, 'legia').length, 'każdy zawodnik z linkiem do profilu');
  assert.ok(!/budżet|Budżet|płace|Płace/.test(html), 'bez budżetu i płac');
  assert.ok(clubFixtures(g, 'legia').length > 0 && clubFixtures(g, 'legia').every((r) => r.h === 'legia' || r.a === 'legia'));
});

test('Trener prowadzący: stałe imię dla AI, profil gracza w jego klubie', () => {
  const g = game(11);
  assert.equal(headCoachName(g, 'lech'), headCoachName(g, 'lech'));
  g.manager = { profile: { firstName: 'Jan', lastName: 'Testowy' } };
  assert.equal(headCoachName(g, 'widzew'), 'Jan Testowy');
});
