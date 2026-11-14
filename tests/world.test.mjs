import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf, academyOf } from '../src/world/worldGen.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { ATTRS, OUTFIELD_ATTRS, GK_ATTRS } from '../src/data/attributes.js';
import { GROUP, squadDeficits } from '../src/career/squad.js';
import { teamRating } from '../src/engine/teamStrength.js';

const world = generateWorld(2026);
const all = Object.values(world.players);
const avg = (arr, f) => arr.reduce((s, x) => s + f(x), 0) / arr.length;

test('Świat: 126 klubów (ligi 1-3 i III liga) po 25 zawodników + 7 juniorów, deterministycznie z ziarna', () => {
  assert.equal(Object.keys(world.clubs).length, 126);
  for (const c of CLUBS_PL) {
    assert.equal(squadOf(world, c.id).length, 25);
    assert.equal(academyOf(world, c.id).length, 7);
  }
  const again = generateWorld(2026);
  assert.deepEqual(again.players['legia-1'], world.players['legia-1']);
  assert.notDeepEqual(generateWorld(2027).players['legia-1'], world.players['legia-1']);
});

test('Każdy zawodnik ma co najmniej 20 atrybutów (27) w skali 1-20 i pełny zestaw danych', () => {
  assert.ok(Object.keys(ATTRS).length >= 20);
  for (const p of all) {
    for (const a of Object.keys(ATTRS)) assert.ok(p.attr[a] >= 1 && p.attr[a] <= 20, `${p.id} ${a}`);
    for (const k of ['name', 'nat', 'age', 'birthDate', 'pos', 'foot', 'ovr', 'hidden', 'persona', 'morale', 'contract', 'wage', 'value', 'rep', 'traits', 'agent', 'season']) {
      assert.ok(p[k] !== undefined, `${p.id} brak ${k}`);
    }
    assert.ok(p.contract.until >= '2027-06-30');
  }
});

test('Bramkarze mają wyraźnie lepsze atrybuty bramkarskie niż zawodnicy z pola, napastnicy lepsze wykończenie', () => {
  const gk = all.filter((p) => p.pos === 'BR');
  const out = all.filter((p) => p.pos !== 'BR');
  for (const a of GK_ATTRS) assert.ok(avg(gk, (p) => p.attr[a]) > avg(out, (p) => p.attr[a]) + 4, a);
  for (const p of out) for (const a of GK_ATTRS) assert.ok(p.attr[a] <= 8, `${p.id} ${a}=${p.attr[a]}`);
  const st = all.filter((p) => p.pos === 'NAP');
  const cb = all.filter((p) => p.pos === 'ŚO');
  assert.ok(avg(st, (p) => p.attr.WYK) > avg(cb, (p) => p.attr.WYK) + 3);
  assert.ok(avg(cb, (p) => p.attr.ODB) > avg(st, (p) => p.attr.ODB) + 3);
  assert.ok(OUTFIELD_ATTRS.length === 22);
});

test('Poziom lig: najlepsza jedenastka ok. L+0.3, 1 Liga ok. 10', () => {
  for (const [tier, target] of [[1, 11.8], [2, 10.3], [3, 8.8]]) {
    const xi = CLUBS_PL.filter((c) => c.tier === tier && !c.parent)
      .flatMap((c) => [...squadOf(world, c.id)].sort((a, b) => b.ovr - a.ovr).slice(0, 11));
    const m = avg(xi, (p) => p.ovr);
    assert.ok(Math.abs(m - target) < 0.3, `liga ${tier}: ${m.toFixed(2)}`);
  }
});

test('Silniejszy klub ma silniejszą kadrę (Legia > Wisła Płock > Lechia Gdańsk > Sokół Kleczew)', () => {
  const s = (id) => teamRating(squadOf(world, id)).breakdown.base;
  assert.ok(s('legia') > s('wisla-plock'));
  assert.ok(s('wisla-plock') > s('lechia-gdansk') - 0.3);
  assert.ok(s('lechia-gdansk') > s('sokol-kleczew'));
});

test('Struktura kadry: min. 3 bramkarzy i brak braków na start', () => {
  for (const c of CLUBS_PL) {
    const sq = squadOf(world, c.id);
    assert.ok(sq.filter((p) => GROUP[p.pos] === 'GK').length >= 3);
    assert.deepEqual(squadDeficits(sq), [], c.id);
  }
});

test('Narodowości: Ekstraklasa ok. połowa Polaków, 2 Liga ok. 90 %; rezerwy i akademie głównie Polacy', () => {
  const share = (tier) => {
    const ps = CLUBS_PL.filter((c) => c.tier === tier && !c.parent).flatMap((c) => squadOf(world, c.id));
    return ps.filter((p) => p.nat === 'POL').length / ps.length;
  };
  assert.ok(share(1) > 0.42 && share(1) < 0.62, `EK ${share(1)}`);
  assert.ok(share(3) > 0.82, `2L ${share(3)}`);
  assert.ok(academyOf(world, 'legia').every((p) => p.nat === 'POL' && p.age <= 18));
  const res = squadOf(world, 'legia-ii');
  assert.ok(res.filter((p) => p.age <= 21).length >= 14);
});

test('Wiek, noga, reputacja, wartość i pensja w realnych zakresach', () => {
  for (const p of all) {
    assert.ok(p.age >= 16 && p.age <= 35);
    assert.ok(['L', 'P', 'LP'].includes(p.foot));
    assert.ok(p.rep >= 1 && p.rep <= 99);
  }
  const ek = CLUBS_PL.filter((c) => c.tier === 1).flatMap((c) => squadOf(world, c.id));
  const l2 = CLUBS_PL.filter((c) => c.tier === 3).flatMap((c) => squadOf(world, c.id));
  assert.ok(avg(ek, (p) => p.rep) > avg(l2, (p) => p.rep) + 8);
  assert.ok(avg(ek, (p) => p.wage) > avg(l2, (p) => p.wage) * 2);
  const lefts = all.filter((p) => p.side === 'L');
  assert.ok(lefts.filter((p) => p.foot !== 'P').length / lefts.length > 0.6);
});

test('Wydajność: cały świat w poniżej 400 ms', () => {
  const t0 = performance.now();
  generateWorld(99);
  assert.ok(performance.now() - t0 < 400);
});
