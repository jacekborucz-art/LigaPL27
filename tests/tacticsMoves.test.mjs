import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics } from '../src/engine/lineup.js';
import { locKey, parseLoc, sameLoc, playerAt, resolveMove, resolveTap } from '../src/ui/tacticsMoves.js';

const world = generateWorld(77);
const squad = squadOf(world, 'legia').map((p) => ({ ...p, injuryDays: 0, suspended: 0, callUp: null, onLoanOut: false }));
const byId = new Map(squad.map((p) => [p.id, p]));
const BENCH = 9;
const base = createTactics(squad, { benchSize: BENCH });
const ctx = { byId, benchSize: BENCH };
const outIds = () => squad.map((p) => p.id).filter((id) => !base.xi.includes(id) && !base.bench.includes(id));
const sorted = (a) => [...a].sort();

test('locKey i parseLoc są odwrotne, błędne klucze dają null', () => {
  for (const loc of [{ zone: 'xi', idx: 0 }, { zone: 'bench', idx: 7 }, { zone: 'out', id: 'p:1' }, { zone: 'benchAdd' }, { zone: 'outZone' }]) {
    assert.deepEqual(parseLoc(locKey(loc)), loc);
  }
  for (const bad of ['', 'xi:-1', 'xi:a', 'out:', 'foo', 'bench:1.5']) assert.equal(parseLoc(bad), null, bad);
  assert.ok(sameLoc({ zone: 'xi', idx: 2 }, { zone: 'xi', idx: 2 }));
  assert.ok(!sameLoc({ zone: 'xi', idx: 2 }, { zone: 'bench', idx: 2 }));
});

test('Ławka -> slot w jedenastce: zamiana, zawodnik z boiska siada na ławce w tym samym miejscu', () => {
  const r = resolveMove(base, { zone: 'bench', idx: 2 }, { zone: 'xi', idx: 5 }, ctx);
  assert.ok(r.ok);
  assert.equal(r.tactics.xi[5], base.bench[2]);
  assert.equal(r.tactics.bench[2], base.xi[5]);
  assert.equal(r.tactics.bench.length, base.bench.length);
  assert.match(r.text, /^Zamiana: /);
  assert.equal(base.xi[5], playerAt(base, { zone: 'xi', idx: 5 }), 'wejściowa taktyka bez zmian');
});

test('Slot -> slot: zamiana dwóch zawodników jedenastki', () => {
  const r = resolveMove(base, { zone: 'xi', idx: 3 }, { zone: 'xi', idx: 7 }, ctx);
  assert.ok(r.ok);
  assert.equal(r.tactics.xi[3], base.xi[7]);
  assert.equal(r.tactics.xi[7], base.xi[3]);
  assert.deepEqual(sorted(r.tactics.xi), sorted(base.xi));
});

test('Spoza kadry: na slot (zawodnik z boiska wypada z kadry), na ławkę i na wolne miejsce na ławce', () => {
  const id = outIds()[0];
  const r1 = resolveMove(base, { zone: 'out', id }, { zone: 'xi', idx: 4 }, ctx);
  assert.ok(r1.ok);
  assert.equal(r1.tactics.xi[4], id);
  assert.ok(!r1.tactics.bench.includes(base.xi[4]));

  const r2 = resolveMove(base, { zone: 'out', id }, { zone: 'bench', idx: 0 }, ctx);
  assert.ok(r2.ok);
  assert.equal(r2.tactics.bench[0], id);

  const short = { ...base, bench: base.bench.slice(0, BENCH - 2) };
  const r3 = resolveMove(short, { zone: 'out', id }, { zone: 'benchAdd' }, ctx);
  assert.ok(r3.ok);
  assert.equal(r3.tactics.bench.at(-1), id);
  assert.equal(r3.tactics.bench.length, BENCH - 1);

  const full = resolveMove(base, { zone: 'out', id }, { zone: 'benchAdd' }, ctx);
  assert.equal(full.ok, base.bench.length < BENCH);
});

test('Upuszczenie na zawodnika spoza kadry: on zajmuje miejsce przeciąganego', () => {
  const id = outIds()[0];
  const r = resolveMove(base, { zone: 'xi', idx: 6 }, { zone: 'out', id }, ctx);
  assert.ok(r.ok);
  assert.equal(r.tactics.xi[6], id);
  const rb = resolveMove(base, { zone: 'bench', idx: 1 }, { zone: 'out', id }, ctx);
  assert.ok(rb.ok);
  assert.equal(rb.tactics.bench[1], id);
});

test('Ławka -> lista spoza kadry: zdjęcie z ławki; jedenastka nie może zostawić pustego miejsca', () => {
  const r = resolveMove(base, { zone: 'bench', idx: 0 }, { zone: 'outZone' }, ctx);
  assert.ok(r.ok);
  assert.ok(!r.tactics.bench.includes(base.bench[0]));
  const x = resolveMove(base, { zone: 'xi', idx: 2 }, { zone: 'outZone' }, ctx);
  assert.equal(x.ok, false);
  assert.ok(x.reason.length > 10);
  assert.equal(resolveMove(base, { zone: 'xi', idx: 2 }, { zone: 'benchAdd' }, ctx).ok, false);
});

test('Niedostępny zawodnik nie wejdzie do jedenastki ani na ławkę (ten sam powód przy przeciąganiu i dotknięciach)', () => {
  const id = outIds()[0];
  const hurt = new Map(byId);
  hurt.set(id, { ...byId.get(id), injuryDays: 10 });
  const c = { byId: hurt, benchSize: BENCH };
  for (const dst of [{ zone: 'xi', idx: 1 }, { zone: 'bench', idx: 1 }, { zone: 'benchAdd' }]) {
    const r = resolveMove(base, { zone: 'out', id }, dst, c);
    assert.equal(r.ok, false);
    assert.match(r.reason, /kontuzja/);
  }
  const t = resolveTap(base, { zone: 'xi', idx: 1 }, { zone: 'out', id }, c);
  assert.equal(t.ok, false);
  assert.match(t.reason, /kontuzja/);
});

test('Ruchy bez skutku: to samo miejsce, puste źródło, spoza kadry na spoza kadry', () => {
  assert.equal(resolveMove(base, { zone: 'xi', idx: 1 }, { zone: 'xi', idx: 1 }, ctx).ok, false);
  const holes = { ...base, xi: base.xi.map((id, i) => (i === 9 ? null : id)) };
  assert.equal(resolveMove(holes, { zone: 'xi', idx: 9 }, { zone: 'xi', idx: 1 }, ctx).ok, false);
  const [a, b] = outIds();
  assert.equal(resolveMove(base, { zone: 'out', id: a }, { zone: 'out', id: b }, ctx).ok, false);
});

test('Dotknięcia: puste miejsce w jedenastce, potem zawodnik z ławki (ruch odwrotny)', () => {
  const holes = { ...base, xi: base.xi.map((id, i) => (i === 9 ? null : id)) };
  const benchId = holes.bench[3];
  const r = resolveTap(holes, { zone: 'xi', idx: 9 }, { zone: 'bench', idx: 3 }, ctx);
  assert.ok(r.ok);
  assert.equal(r.tactics.xi[9], benchId);
  assert.ok(!r.tactics.bench.includes(benchId));
  assert.equal(r.tactics.bench.length, holes.bench.length - 1);
});

test('Ról (kapitan, stałe fragmenty) nie zostawiamy zawodnikowi spoza jedenastki', () => {
  const capIdx = base.xi.indexOf(base.captain);
  const r = resolveMove(base, { zone: 'bench', idx: 0 }, { zone: 'xi', idx: capIdx }, ctx);
  assert.ok(r.ok);
  assert.equal(r.tactics.captain, null);
});
