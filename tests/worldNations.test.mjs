// Reprezentacje CONMEBOL, CONCACAF i OFC (src/season/worldNations.js): komplet członków, strefy, siła, spójność z reprezentacje.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FEDERATIONS, WORLD_NT, worldTeam, federationTeams, topTeams } from '../src/season/worldNations.js';
import { ntName, ntTeam } from '../src/season/national.js';
import BASE from '../src/data/reprezentacje.json' with { type: 'json' };

test('Federacje: 10 CONMEBOL, 41 CONCACAF (3 strefy), 13 OFC, kody bez powtórzeń', () => {
  assert.equal(federationTeams('CONMEBOL').length, 10);
  assert.equal(federationTeams('CONCACAF').length, 41);
  assert.deepEqual(['NAFU', 'UNCAF', 'CFU'].map((z) => federationTeams('CONCACAF', { zone: z }).length), [3, 7, 31]);
  assert.equal(federationTeams('OFC').length, 13);
  assert.equal(federationTeams('OFC', { onlyFifa: true }).length, 11);
  assert.equal(new Set(WORLD_NT.map((t) => t.kod)).size, WORLD_NT.length);
  for (const [k, F] of Object.entries(FEDERATIONS)) assert.equal(F.czlonkowie.length, federationTeams(k).length, k);
  assert.ok(!worldTeam('AUS'), 'Australia gra w AFC');
});

test('Siła L w skali gry i spójna z reprezentacje.json', () => {
  for (const t of WORLD_NT) assert.ok(t.L >= 6.5 && t.L <= 17, `${t.kod} ${t.L}`);
  const base = new Map(BASE.reprezentacje.map((t) => [t.kod, t]));
  for (const t of WORLD_NT) if (base.has(t.kod)) assert.equal(t.L, base.get(t.kod).L, t.kod);
  assert.deepEqual(topTeams('CONMEBOL', 2).map((t) => t.kod), ['ARG', 'BRA']);
  assert.equal(topTeams('OFC', 1)[0].kod, 'NZL');
  assert.ok(worldTeam('NZL').L > worldTeam('TGA').L && worldTeam('MEX').L > worldTeam('AIA').L);
});

test('Nazwy i dane dostępne przez national.js (ntName, ntTeam)', () => {
  assert.equal(ntName('NZL'), 'Nowa Zelandia');
  assert.equal(ntName('POL'), 'Polska');
  assert.equal(ntTeam('JAM').konfederacja, 'CONCACAF');
  assert.equal(ntTeam('ARG').konfederacja, 'CONMEBOL');
});
