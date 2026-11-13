// Mapa pozycji w karcie zawodnika: 14 miejsc, biegłość z silnika, pozycja nominalna, kara za złą stronę.
import test from 'node:test';
import assert from 'node:assert/strict';
import { positionGrid, positionMapHtml, profBand } from '../src/ui/positionMap.js';
import { proficiency } from '../src/engine/positions.js';

const lb = { pos: 'BO', side: 'L', alt: {} };

test('14 miejsc, nominalna 100% w złotym pierścieniu, zła strona słabsza', () => {
  const g = positionGrid(lb);
  assert.equal(g.length, 14);
  const nat = g.filter((x) => x.natural);
  assert.equal(nat.length, 1);
  assert.equal(nat[0].v, 100);
  const right = g.find((x) => x.pos === 'BO' && x.side === 'P');
  assert.equal(right.v, Math.round(proficiency(lb, 'BO', 'P')));
  assert.ok(right.v < 100);
  for (const x of g) assert.equal(x.v, Math.round(proficiency(lb, x.pos, x.side)), `${x.pos} ${x.side}`);
  const html = positionMapHtml(lb);
  assert.equal((html.match(/class="pmap__ring"/g) ?? []).length, 1);
  assert.equal((html.match(/class="pmap__dot"/g) ?? []).length, 14);
});

test('Pasma: optymalna, dobra, słaba, nie gra', () => {
  assert.deepEqual([100, 85, 84, 70, 69, 50, 49, 8].map(profBand), ['opt', 'opt', 'ok', 'ok', 'weak', 'weak', 'no', 'no']);
});
