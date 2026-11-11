// Ochrona przed powtórzeniem konferencji i odprawy przedmeczowej, gdy dzień meczowy zaczyna się od nowa
// (powrót ze zmiany składu albo odświeżenie strony): skutki liczą się dokładnie raz na mecz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, continueUntilStop, primaryAction } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { startMatchday, doPreBriefing, pressSetup, pressOpen, pressAnswer, pressSlot, mdDone, kickOff, skip, finishMatchday, closeMatchday } from '../src/match/matchday.js';
import '../src/season/dailySystems.js';

function gameAtMatch(seed) {
  const g = { seed, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: 'widzew' });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 });
  processDay(g);
  while (primaryAction(g).kind !== 'play') {
    if (primaryAction(g).kind === 'decide') g.inbox = g.inbox.map((m) => ({ ...m, resolved: true }));
    else continueUntilStop(g);
  }
  return g;
}

function finishConference(g, S, phase) {
  let conf = pressOpen(g, S, phase);
  for (let k = 0; k < 12 && conf && !pressSlot(S, phase).settled; k++) conf = pressAnswer(g, S, 0, phase);
  assert.ok(pressSlot(S, phase).settled, 'konferencja rozliczona');
}

test('Konferencja przedmeczowa nie powtarza się po ponownym wejściu w dzień meczowy', () => {
  const g = gameAtMatch(41);
  const f = primaryAction(g).match;
  const S1 = startMatchday(g, f);
  if (!pressSetup(g, S1, 'pre')) return; // mecz bez konferencji (np. sparing)
  finishConference(g, S1, 'pre');
  assert.ok(mdDone(g, f.id, 'press-pre'));
  const trust = g.board.trust;
  const inbox = g.inbox.length;
  // Gracz wraca do składu i znowu wchodzi w dzień meczowy
  const S2 = startMatchday(g, primaryAction(g).match);
  assert.equal(pressSetup(g, S2, 'pre'), null, 'drugiej konferencji przedmeczowej nie ma');
  assert.equal(g.board.trust, trust);
  assert.equal(g.inbox.length, inbox);
});

test('Odprawa przedmeczowa zmienia morale tylko raz na mecz', () => {
  const g = gameAtMatch(42);
  const f = primaryAction(g).match;
  const S1 = startMatchday(g, f);
  doPreBriefing(g, S1, 'demand', []);
  const after1 = Object.fromEntries(squadOf(g.world, 'widzew').map((p) => [p.id, p.morale]));
  const S2 = startMatchday(g, primaryAction(g).match);
  doPreBriefing(g, S2, 'demand', []);
  for (const p of squadOf(g.world, 'widzew')) assert.equal(p.morale, after1[p.id], `morale ${p.name} bez drugiego efektu`);
});

test('Konferencja pomeczowa nie powtarza się, a pierwsza sesja nadal pokazuje podsumowanie', () => {
  const g = gameAtMatch(43);
  const f = primaryAction(g).match;
  const S = startMatchday(g, f);
  doPreBriefing(g, S, 'calm', []);
  kickOff(g, S); skip(S); skip(S);
  finishMatchday(g, S);
  if (!pressSetup(g, S, 'post')) return;
  finishConference(g, S, 'post');
  assert.ok(pressSetup(g, S, 'post'), 'ta sama sesja: sala nadal dostępna do podsumowania');
  const trust = g.board.trust;
  closeMatchday(g, S);
  assert.equal(g.board.trust, trust, 'Dalej po konferencji nie dolicza pominięcia');
  // Nowa sesja tego samego meczu (np. stan sprzed zapisu): konferencji już nie ma
  const S2 = { ...S, pr: {} };
  assert.equal(pressSetup(g, S2, 'post'), null);
});
