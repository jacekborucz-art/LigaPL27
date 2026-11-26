// Pewne rozstrzygnięcia w tabeli: mistrz, awans, baraże, spadek (src/season/standings.js clinchTags; Nov 26, 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { clinchTags, zonesFor } from '../src/season/standings.js';

/** Tabela z punktów i liczby meczów do końca (nierozegrane mecze między kolejnymi parami drużyn). */
function league(points, left) {
  const rows = points.map((p, i) => ({ id: `k${i + 1}`, points: p, pos: i + 1 }));
  const fixtures = [{ home: 'k1', away: 'k2', played: true }];
  rows.forEach((r, i) => { for (let j = 0; j < left; j++) fixtures.push({ home: r.id, away: `x${i}-${j}`, played: false }); });
  return { rows, fixtures };
}
const pts18 = [80, 60, 58, 57, 50, 49, 48, 45, 44, 43, 42, 40, 38, 36, 35, 20, 18, 10];

test('Ekstraklasa: pewny mistrz tylko, gdy nikt nie może dogonić; pewny spadek tylko, gdy nie da się uciec', () => {
  const { rows, fixtures } = league(pts18, 3); // 9 punktów do zdobycia
  const t = clinchTags(rows, fixtures, zonesFor(1), { champion: true });
  assert.equal(t.get('k1')?.kind, 'champ', '80 pkt, drugi najwyżej 69');
  assert.equal(t.get('k18')?.kind, 'down', '10 pkt, najwyżej 19, a 15. ma już 35');
  assert.equal(t.get('k17')?.kind, 'down', '18 + 9 = 27 < 35');
  assert.equal(t.get('k16')?.kind, 'down', '20 + 9 = 29 < 35');
  assert.ok(!t.get('k15') && !t.get('k2'));
  const close = league([60, 52, ...pts18.slice(2)], 3);
  assert.ok(!clinchTags(close.rows, close.fixtures, zonesFor(1), { champion: true }).get('k1'), 'remis punktowy możliwy: jeszcze nie');
});

test('1 Liga: awans, baraże (co najmniej), rezerwy bez awansu; po sezonie końcowa kolejność', () => {
  const { rows, fixtures } = league([80, 75, 50, 49, 48, 47, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19], 2); // 6 pkt
  const t = clinchTags(rows, fixtures, zonesFor(2));
  assert.equal(t.get('k1')?.kind, 'up');
  assert.equal(t.get('k2')?.kind, 'up');
  for (const id of ['k3', 'k4', 'k5', 'k6']) assert.equal(t.get(id)?.kind, 'playoff', id);
  assert.ok(!t.get('k7'));
  const res = clinchTags(rows, fixtures, zonesFor(2), { eligible: (id) => id !== 'k2' });
  assert.ok(!res.get('k2'), 'rezerwy nie awansują');
  assert.equal(res.get('k3')?.kind, 'playoff', 'trzeci walczy jeszcze o awans bezpośredni');
  assert.equal(res.get('k7')?.kind, undefined);
  const end = league([50, 50, 40, 40, 40, 40, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 21, 21], 0);
  const e = clinchTags(end.rows, end.fixtures, zonesFor(2));
  assert.equal(e.get('k2')?.kind, 'up', 'po sezonie równe punkty rozstrzyga kolejność tabeli');
  assert.equal(e.get('k6')?.kind, 'playoff');
  assert.equal(e.get('k16')?.kind, 'down');
});

test('Przed sezonem i na początku bez tagów', () => {
  const rows = pts18.map((p, i) => ({ id: `k${i + 1}`, points: 0, pos: i + 1 }));
  assert.equal(clinchTags(rows, [], zonesFor(1), { champion: true }).size, 0);
  const { rows: r2, fixtures } = league(pts18.map(() => 3), 30);
  assert.equal(clinchTags(r2, fixtures, zonesFor(2)).size, 0);
});
