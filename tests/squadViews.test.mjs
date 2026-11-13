// Kadra > Zawodnicy: widoki Przegląd, Atrybuty i forma, Statystyki (tabele z sortowaniem).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { renderSquadList } from '../src/ui/squadView.js';
import { OUTFIELD_ATTRS, GK_ATTRS } from '../src/data/attributes.js';

const world = generateWorld(9);
const squad = squadOf(world, 'widzew').map((p, i) => ({ ...p, season: { apps: 5, min: 450, g: i % 4, a: i % 3, yc: 0, rc: 0, rating: 6.5, motm: 0, cs: 0 } }));
const game = { season: { seasonId: '2026/27' } };

test('Trzy widoki: przełącznik, wiersz na zawodnika, kolumny atrybutów i statystyk', () => {
  const over = renderSquadList(squad, { game });
  assert.equal((over.match(/data-act="sqview"/g) ?? []).length, 3);
  assert.ok(over.includes('class="sqa"'), 'panel podsumowania');
  const attrs = renderSquadList(squad, { view: 'attrs', game });
  assert.equal((attrs.match(/<tr data-pid=/g) ?? []).length, squad.length);
  for (const k of [...OUTFIELD_ATTRS, ...GK_ATTRS]) assert.ok(attrs.includes(`data-k="${k}"`), `kolumna ${k}`);
  const stats = renderSquadList(squad, { view: 'stats', game });
  assert.ok(stats.includes('Sezon 2026/27') && stats.includes('Razem'));
});

test('Sortowanie po kolumnie: gole malejąco, nazwisko rosnąco', () => {
  const html = renderSquadList(squad, { view: 'stats', sort: { k: 'g', dir: 'desc' }, game });
  const ids = [...html.matchAll(/<tr data-pid="([^"]+)"/g)].map((m) => m[1]);
  const goals = ids.map((id) => squad.find((p) => p.id === id).season.g);
  assert.deepEqual(goals, [...goals].sort((a, b) => b - a));
  const byName = renderSquadList(squad, { view: 'attrs', sort: { k: 'name', dir: 'asc' }, game });
  const names = [...byName.matchAll(/<tr data-pid="([^"]+)"/g)].map((m) => squad.find((p) => p.id === m[1]).name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'pl')));
});
