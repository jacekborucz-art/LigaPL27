// Pieniądze właściciela na sezon: baza z danych x mnożnik (nastrój z pamięcią, wynik, awans, spadek, puchary),
// zacisk i sufit zasobności, miasto stabilniejsze (src/career/ownerFunding.js, docs/finanse.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/world/worldGen.js';
import { ownerSeasonMul, seasonVerdict, OWNER_FUND } from '../src/career/ownerFunding.js';
import { ownerOf } from '../src/career/owners.js';
import { initClub } from '../src/career/finance.js';
import { clubById, CLUBS_PL } from '../src/data/clubs_pl.js';

const game = (seed = 3) => ({ seed, date: '2027-07-01' }); // bez świata: właściciel z danych klubu (ownerOf)
const WORLD = generateWorld(3);

test('Wynik sezonu wobec oczekiwań z siły klubu', () => {
  const L = { a: 14, b: 12, c: 10, d: 8, e: 6 };
  const s = (id) => L[id];
  assert.equal(seasonVerdict('d', ['d', 'a', 'b', 'c', 'e'], s), 'above');
  assert.equal(seasonVerdict('b', ['a', 'b', 'c', 'd', 'e'], s), 'met');
  assert.equal(seasonVerdict('a', ['b', 'c', 'd', 'e', 'a'], s), 'disaster');
});

test('Awans daje więcej, spadek mniej, zakres i sufit zasobności, nastrój z pamięcią', () => {
  const ids = CLUBS_PL.filter((c) => c.tier <= 3).map((c) => c.id);
  let up = 0; let down = 0; let n = 0;
  for (const id of ids) {
    const base = { verdict: 'met', year: 2027 };
    const g1 = game(); const g2 = game(); const g3 = game();
    const m0 = ownerSeasonMul(g1, id, base).mul;
    const mp = ownerSeasonMul(g2, id, { ...base, promoted: true }).mul;
    const mr = ownerSeasonMul(g3, id, { ...base, relegated: true }).mul;
    const o = ownerOf(g1, id);
    const hi = o.type === 'miliarder' ? OWNER_FUND.billionaireMax : o.type === 'miasto' ? OWNER_FUND.cityMax : OWNER_FUND.clamp[1];
    for (const m of [m0, mp, mr]) assert.ok(m >= OWNER_FUND.clamp[0] - 1e-9 && m <= hi + 1e-9, `${id}: ${m}`);
    if (o.zasobnosc <= 5) assert.ok(mp <= 1.0, `${id}: biedny właściciel nie dokłada (${mp})`);
    if (mp > m0) up++; if (mr < m0) down++; n++;
    assert.ok(typeof g1.ownerMood[id] === 'number', 'nastrój zapisany');
  }
  assert.ok(up > n * 0.6 && down > n * 0.8, `awans ${up}/${n}, spadek ${down}/${n}`);
});

test('Miasto ma mniejszy rozrzut niż właściciel prywatny; initClub stosuje mnożnik do dopłaty i skarbca', () => {
  const spread = (type) => {
    const ms = [];
    for (let y = 2027; y < 2067; y++) for (const c of CLUBS_PL.filter((x) => x.tier <= 2)) {
      const g = game(); if (ownerOf(g, c.id).type !== type) continue;
      ms.push(ownerSeasonMul(g, c.id, { verdict: 'met', year: y }).mul);
    }
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
    return Math.sqrt(ms.reduce((a, b) => a + (b - avg) ** 2, 0) / ms.length);
  };
  assert.ok(spread('miasto') < spread('prywatny'), `miasto ${spread('miasto').toFixed(3)} < prywatny ${spread('prywatny').toFixed(3)}`);
  const c = clubById('widzew');
  const base = initClub(WORLD, c, { balance: 0, date: '2027-07-01' }).plan;
  const more = initClub(WORLD, c, { balance: 0, date: '2027-07-01', ownerMul: { mul: 1.2, skarbiecMul: 1.1 } }).plan;
  assert.ok(Math.abs(more.owner - base.owner * 1.2) < 2000 && Math.abs(more.skarbiec - base.skarbiec * 1.1) < 2000);
  assert.equal(more.ownerMul, 1.2);
});
