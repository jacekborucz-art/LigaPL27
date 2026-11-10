import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proficiency, posEff, errorMul, goalkeeperSlotModifiers, assessLineup, validateLineup,
} from '../src/engine/positions.js';

const p = (id, pos, extra = {}) => ({ id, name: id, pos, side: 'P', ...extra });
const XI = () => [
  { player: p('gk', 'BR'), slot: { pos: 'BR' } },
  { player: p('lb', 'BO', { side: 'L' }), slot: { pos: 'BO', side: 'L' } },
  { player: p('cb1', 'ŚO'), slot: { pos: 'ŚO' } },
  { player: p('cb2', 'ŚO'), slot: { pos: 'ŚO' } },
  { player: p('rb', 'BO'), slot: { pos: 'BO', side: 'P' } },
  { player: p('dm', 'DP'), slot: { pos: 'DP' } },
  { player: p('cm', 'ŚP'), slot: { pos: 'ŚP' } },
  { player: p('am', 'OP'), slot: { pos: 'OP' } },
  { player: p('lw', 'SN', { side: 'L' }), slot: { pos: 'SN', side: 'L' } },
  { player: p('rw', 'SN'), slot: { pos: 'SN', side: 'P' } },
  { player: p('st', 'NAP'), slot: { pos: 'NAP' } },
];

test('Biegłość: naturalna 100, pokrewna wysoka, odległa niska', () => {
  assert.equal(proficiency(p('a', 'ŚO'), 'ŚO'), 100);
  assert.ok(proficiency(p('a', 'DP'), 'ŚP') >= 80);
  assert.ok(proficiency(p('a', 'NAP'), 'ŚO') <= 30);
  assert.ok(proficiency(p('a', 'NAP'), 'BR') <= 10);
  assert.ok(proficiency(p('a', 'BR'), 'NAP') <= 15);
});

test('Zła strona boiska obniża biegłość, obunożny nie traci', () => {
  const right = p('a', 'BO', { side: 'P' });
  assert.ok(proficiency(right, 'BO', 'L') < proficiency(right, 'BO', 'P'));
  assert.equal(proficiency(p('b', 'BO', { side: 'LP' }), 'BO', 'L'), 100);
});

test('Nauka pozycji pomaga, ale nie daje pełnej biegłości ani bramkarza z zawodnika z pola', () => {
  assert.equal(proficiency(p('a', 'NAP', { alt: { ŚO: 100 } }), 'ŚO'), 90);
  assert.ok(proficiency(p('a', 'NAP', { alt: { BR: 100 } }), 'BR') <= 10);
});

test('Mnożnik skuteczności spada z biegłością, a ryzyko błędów rośnie (mocniej w obronie)', () => {
  assert.equal(posEff(100), 1);
  assert.ok(posEff(85) > 0.92 && posEff(85) < 0.97);
  assert.ok(posEff(20) < 0.7);
  assert.ok(errorMul(20, true) > errorMul(20, false));
  assert.equal(errorMul(100, true), 1);
});

test('Zawodnik z pola w bramce: bardzo duża kara dla drużyny', () => {
  const nat = goalkeeperSlotModifiers(p('gk', 'BR'));
  const emergency = goalkeeperSlotModifiers(p('st', 'NAP', { attr: { SKO: 10 } }));
  assert.equal(nat.goalMul, 1);
  assert.ok(emergency.goalMul >= 1.7);
  assert.ok(emergency.longShotMul > 1.4);
});

test('Prawidłowy skład: brak kar i ostrzeżeń', () => {
  const r = assessLineup(XI());
  assert.equal(r.structurePenalty, 0);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.gk.natural, true);
});

test('"Cheat" 1: napastnik w bramce, a bramkarz w ataku. Obaj tracą, a drużyna dostaje dużą karę', () => {
  const xi = XI();
  xi[0] = { player: p('st', 'NAP'), slot: { pos: 'BR' } };
  xi[10] = { player: p('gk', 'BR'), slot: { pos: 'NAP' } };
  const r = assessLineup(xi);
  assert.equal(r.gk.natural, false);
  assert.ok(r.gk.goalMul >= 1.7);
  assert.ok(r.players.find((x) => x.id === 'gk').eff < 0.7);
  assert.ok(r.warnings.some((w) => w.includes('w bramce')));
});

test('"Cheat" 2: sami napastnicy w obronie. Kara za biegłość i za brak struktury', () => {
  const xi = XI().map((e, i) => (i >= 1 && i <= 4 ? { player: p(`f${i}`, 'NAP'), slot: e.slot } : e));
  const r = assessLineup(xi);
  assert.ok(r.structurePenalty > 0.3, `kara ${r.structurePenalty}`);
  assert.ok(r.players.filter((x) => x.err > 1.8).length === 4);
});

test('"Cheat" 3: formacja z 1 obrońcą dostaje dodatkową karę za strukturę', () => {
  const xi = XI();
  xi[2] = { player: p('x1', 'NAP'), slot: { pos: 'NAP' } };
  xi[3] = { player: p('x2', 'NAP'), slot: { pos: 'NAP' } };
  xi[4] = { player: p('x3', 'OP'), slot: { pos: 'OP' } };
  const r = assessLineup(xi);
  assert.ok(r.structurePenalty >= 1.2);
  assert.ok(r.warnings.some((w) => w.includes('Za mało obrońców')));
});

test('Walidacja: dokładnie 1 bramkarz, 11 zawodników, bez zawieszonych i duplikatów', () => {
  assert.deepEqual(validateLineup(XI()), []);
  const twoGk = XI(); twoGk[10] = { player: p('gk2', 'BR'), slot: { pos: 'BR' } };
  assert.ok(validateLineup(twoGk).some((e) => e.includes('jeden bramkarz')));
  const susp = XI(); susp[5].player.suspended = 1;
  assert.ok(validateLineup(susp).some((e) => e.includes('zawieszony')));
  const dup = XI(); dup[6] = { player: dup[5].player, slot: { pos: 'ŚP' } };
  assert.ok(validateLineup(dup).some((e) => e.includes('dwa razy')));
  assert.ok(validateLineup(XI().slice(0, 10)).some((e) => e.includes('11')));
});
