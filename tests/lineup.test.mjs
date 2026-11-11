import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { FORMATIONS, formationById } from '../src/data/formations.js';
import { INSTRUCTIONS, defaultInstructions } from '../src/data/instructions.js';
import {
  createTactics, assign, checkTactics, refreshTactics, changeFormation, setInstruction, lineupEntries, autoPickXI,
} from '../src/engine/lineup.js';
import { proficiency } from '../src/engine/positions.js';

const world = generateWorld(77);
const squad = squadOf(world, 'legia');
const byId = new Map(squad.map((p) => [p.id, p]));

test('12 formacji, każda ma 11 slotów i dokładnie jednego bramkarza', () => {
  assert.equal(FORMATIONS.length, 12);
  for (const f of FORMATIONS) {
    assert.equal(f.slots.length, 11, f.id);
    assert.equal(f.slots.filter((s) => s.pos === 'BR').length, 1, f.id);
    for (const s of f.slots) assert.ok(s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100);
  }
});

test('Instrukcje: każda ma domyślną opcję, opis i efekt dla silnika', () => {
  for (const i of INSTRUCTIONS) {
    assert.ok(i.options.some((o) => o.id === i.default), i.id);
    for (const o of i.options) assert.ok(o.text.length > 5 && typeof o.effect === 'object');
  }
  assert.equal(Object.keys(defaultInstructions()).length, INSTRUCTIONS.length);
});

test('Asystent ustawia poprawny skład w każdej formacji (bez błędów, bramkarz w bramce)', () => {
  for (const f of FORMATIONS) {
    const t = createTactics(squad, { formation: f.id });
    const r = checkTactics(t, squad);
    assert.deepEqual(r.errors, [], f.id);
    assert.equal(byId.get(t.xi[0]).pos, 'BR');
    assert.equal(t.bench.length, 12);
    assert.ok(t.captain && t.penalty && t.freeKick && t.corner);
    const avgProf = lineupEntries(t, byId).reduce((s, e) => s + proficiency(e.player, e.slot.pos, e.slot.side), 0) / 11;
    assert.ok(avgProf >= 80, `${f.id}: średnia biegłość ${avgProf}`);
  }
});

test('Zamiana: zawodnik z ławki na boisko zamienia się miejscem, nie ma duplikatów', () => {
  const t = createTactics(squad);
  const benchId = t.bench[3];
  const outId = t.xi[5];
  const t2 = assign(t, { type: 'xi', idx: 5 }, benchId);
  assert.equal(t2.xi[5], benchId);
  assert.ok(t2.bench.includes(outId));
  assert.equal(new Set([...t2.xi, ...t2.bench]).size, t2.xi.length + t2.bench.length);
  const t3 = assign(t2, { type: 'xi', idx: 9 }, t2.xi[2]); // zamiana dwóch zawodników z jedenastki
  assert.equal(t3.xi[9], t2.xi[2]);
  assert.equal(t3.xi[2], t2.xi[9]);
});

test('Walidacja blokuje zawieszonego, kontuzjowanego i za dużą ławkę', () => {
  const t = createTactics(squad);
  const susp = squad.map((p) => (p.id === t.xi[4] ? { ...p, suspended: 1 } : p.id === t.xi[6] ? { ...p, injuryDays: 9 } : p));
  const r = checkTactics(t, susp);
  assert.ok(r.errors.some((e) => e.includes('zawieszony')));
  assert.ok(r.errors.some((e) => e.includes('kontuzjowany')));
  const backupGk = squad.find((p) => p.pos === 'BR' && p.id !== t.xi[0]).id;
  const twoGk = assign(t, { type: 'xi', idx: 10 }, backupGk);
  const fixed = { ...twoGk, xi: twoGk.xi.map((id, i) => (i === 0 ? id : id)) };
  assert.ok(checkTactics(fixed, squad, { benchSize: 9 }).errors.some((e) => e.includes('najwyżej 9')));
});

test('Gra poza pozycją jest dozwolona, ale ostrzega i obniża siłę', () => {
  const t = createTactics(squad);
  const before = checkTactics(t, squad);
  const st = squad.find((p) => p.pos === 'NAP' && !t.xi.slice(1, 5).includes(p.id));
  const t2 = assign(t, { type: 'xi', idx: 2 }, st.id); // napastnik na środek obrony
  const after = checkTactics(t2, squad);
  assert.ok(after.warnings.some((w) => w.includes('poza pozycją')));
  assert.ok(after.rating.zones.DEF < before.rating.zones.DEF);
});

test('Asystent przed meczem zastępuje kontuzjowanych i opisuje zmiany', () => {
  const t = createTactics(squad);
  const hurt = squad.map((p) => (p.id === t.xi[3] ? { ...p, injuryDays: 14 } : p));
  const { tactics, changes } = refreshTactics(t, hurt);
  assert.ok(!tactics.xi.includes(t.xi[3]));
  assert.ok(tactics.xi.every(Boolean));
  assert.ok(changes.some((c) => c.includes('wypada')) && changes.some((c) => c.includes('wchodzi')));
  assert.deepEqual(checkTactics(tactics, hurt).errors, []);
});

test('Zmiana formacji zachowuje wybranych zawodników; instrukcje są walidowane', () => {
  const t = createTactics(squad, { formation: '4231' });
  const t2 = changeFormation(t, squad, '352');
  assert.equal(t2.formation, '352');
  assert.deepEqual(new Set(t2.xi), new Set(t.xi));
  assert.equal(setInstruction(t2, 'pressing', 'high').instructions.pressing, 'high');
  assert.throws(() => setInstruction(t2, 'pressing', 'ultra'));
});

test('Bez bramkarzy asystent stawia w bramce najbardziej skocznego zawodnika z pola', () => {
  const noGk = squad.map((p) => (p.pos === 'BR' ? { ...p, injuryDays: 20 } : p));
  const xi = autoPickXI(noGk, formationById('442'));
  const gk = noGk.find((p) => p.id === xi[0]);
  assert.notEqual(gk.pos, 'BR');
  const maxSko = Math.max(...noGk.filter((p) => p.pos !== 'BR').map((p) => p.attr.SKO));
  assert.equal(gk.attr.SKO, maxSko);
});
