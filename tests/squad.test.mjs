import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import {
  decideRetirement, transferListCandidates, squadDeficits, planDeficitFill, SQUAD_TARGETS,
} from '../src/career/squad.js';

const rng = new Rng('emerytury');
const pl = (id, pos, ovr, extra = {}) => ({ id, pos, ovr, age: 26, wage: 10000, contractUntil: '2028-06-30', ...extra });

function squad() {
  const s = [];
  ['BR', 'BR', 'BR'].forEach((p, i) => s.push(pl(`gk${i}`, p, 11 - i)));
  for (let i = 0; i < 8; i++) s.push(pl(`d${i}`, i % 2 ? 'ŚO' : 'BO', 12 - i * 0.3));
  for (let i = 0; i < 8; i++) s.push(pl(`m${i}`, i % 2 ? 'ŚP' : 'BP', 12 - i * 0.3));
  for (let i = 0; i < 5; i++) s.push(pl(`a${i}`, 'NAP', 12 - i * 0.4));
  return s;
}

function retireRate(player, ctx, n = 4000) {
  let k = 0;
  for (let i = 0; i < n; i++) if (decideRetirement(player, ctx, rng).retire) k++;
  return k / n;
}

test('Koniec kariery: decyzja 0/1, zwykle w okolicach 33-36 lat', () => {
  const ctx = { leagueL: 11.5, minutesShare: 0.6, hasContractNextSeason: true };
  const r = decideRetirement(pl('x', 'ŚP', 11, { age: 34 }), ctx, rng);
  assert.equal(typeof r.retire, 'boolean');
  assert.equal(retireRate(pl('x', 'ŚP', 11, { age: 29 }), ctx), 0);
  const r33 = retireRate(pl('x', 'ŚP', 11, { age: 33 }), ctx);
  const r36 = retireRate(pl('x', 'ŚP', 11, { age: 36 }), ctx);
  assert.ok(r33 > 0.1 && r33 < 0.35, `33 lata: ${r33}`);
  assert.ok(r36 > 0.7, `36 lat: ${r36}`);
  assert.equal(decideRetirement(pl('x', 'ŚP', 11, { age: 40 }), ctx, rng).retire, true);
});

test('Bramkarz gra dłużej, a słaby zawodnik bez kontraktu kończy wcześniej', () => {
  const ctx = { leagueL: 11.5, minutesShare: 0.6, hasContractNextSeason: true };
  assert.ok(retireRate(pl('g', 'BR', 11, { age: 35 }), ctx) < retireRate(pl('f', 'ŚP', 11, { age: 35 }), ctx));
  const weak = { leagueL: 11.5, minutesShare: 0.1, hasContractNextSeason: false };
  assert.ok(retireRate(pl('w', 'ŚP', 9, { age: 33 }), weak) > 0.5);
  assert.ok(retireRate(pl('s', 'ŚP', 13, { age: 34 }), ctx) < retireRate(pl('n', 'ŚP', 10.5, { age: 34 }), ctx));
});

test('Lista transferowa: nadmiar i słabi idą na sprzedaż, młodzi bez gry do wypożyczenia', () => {
  const s = squad();
  s.push(pl('a5', 'NAP', 9.0)); // 6. napastnik, słaby
  s.push(pl('kid', 'ŚP', 9.5, { age: 19, minutesShare: 0.05 }));
  s.push(pl('moody', 'ŚO', 11.5, { unhappy: true }));
  const list = transferListCandidates(s, { L: 11.5 }, { date: '2026-07-10', inWindow: true });
  const byId = Object.fromEntries(list.map((x) => [x.id, x]));
  assert.equal(byId.a5?.kind, 'sale');
  assert.equal(byId.kid?.kind, 'loan');
  assert.equal(byId.moody?.kind, 'sale');
  assert.ok(byId.moody.reasons.includes('Chce odejść'));
  assert.equal(byId.gk0, undefined); // nie sprzedaje podstawowych bramkarzy
});

test('Nigdy nie wystawia tylu zawodników, by grupa spadła poniżej minimum (bramkarze!)', () => {
  const s = squad().map((p) => ({ ...p, unhappy: true })); // wszyscy chcą odejść
  const list = transferListCandidates(s, { L: 11.5 }, { date: '2026-07-10', inWindow: true });
  const leaving = new Set(list.filter((x) => x.kind !== 'loan').map((x) => x.id));
  const left = s.filter((p) => !leaving.has(p.id));
  const gk = left.filter((p) => p.pos === 'BR').length;
  assert.ok(gk >= SQUAD_TARGETS.GK.min, `bramkarzy zostało ${gk}`);
});

test('Zwolnienie: stary i słaby zawodnik w oknie dostaje rozwiązanie kontraktu', () => {
  const s = squad();
  s.push(pl('old', 'ŚO', 9.0, { age: 33, wage: 25000 }));
  const list = transferListCandidates(s, { L: 11.5 }, { date: '2026-07-10', inWindow: true });
  assert.equal(list.find((x) => x.id === 'old')?.kind, 'release');
});

test('Braki meczowe: najpierw bramkarze, potem pozostali', () => {
  const s = squad();
  s[0].injuryDays = 20; s[1].suspended = 1; // 2 z 3 bramkarzy niedostępni
  for (let i = 0; i < 4; i++) s[3 + i].injuryDays = 10; // 4 obrońców kontuzjowanych
  const needs = squadDeficits(s);
  assert.equal(needs[0].group, 'GK');
  assert.equal(needs[0].missing, 1);
  assert.ok(needs.some((n) => n.group === 'DEF'));
});

test('Uzupełnianie: rezerwy, akademia, wolni zawodnicy, a na końcu zawodnik czasowy', () => {
  const needs = [
    { scope: 'match', group: 'GK', missing: 2 },
    { scope: 'match', group: 'DEF', missing: 2 },
  ];
  const pools = {
    reserves: [pl('rgk', 'BR', 8)],
    academy: [pl('ydef', 'ŚO', 8.5, { age: 18 })],
    freeAgents: [pl('fdef', 'BO', 9.5, { age: 31 })],
    inWindow: false,
  };
  const plan = planDeficitFill(needs, pools);
  assert.deepEqual(plan.map((a) => a.type), ['promoteReserve', 'generateTemporary', 'promoteAcademy', 'signFreeAgent']);
  assert.equal(plan[1].group, 'GK');
});

test('Zawsze da się zebrać 2 bramkarzy na mecz, nawet bez rezerw i akademii', () => {
  const s = squad();
  s[0].injuryDays = 30; s[1].injuryDays = 30; s[2].suspended = 2;
  const plan = planDeficitFill(squadDeficits(s), { reserves: [], academy: [], freeAgents: [], inWindow: false });
  assert.equal(plan.filter((a) => a.group === 'GK').length, 2);
});
