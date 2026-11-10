import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateEuropeanSpots } from '../src/season/europeAccess.js';

const table = ['lech', 'gornik-zabrze', 'jagiellonia', 'rakow', 'gks-katowice', 'pogon-szczecin', 'legia', 'widzew'];
const short = (r) => r.map((x) => `${x.club}:${x.comp}:${x.entry}`);
const cup = (winner, runnerUp) => ({ winner, runnerUp });

test('Przykład użytkownika: Lech mistrz i zdobywca PP gra w LM, przegrany finał PP gra w LE', () => {
  const r = allocateEuropeanSpots(table, cup('lech', 'widzew'), 15);
  assert.deepEqual(short(r), [
    'lech:LM:Q2', 'gornik-zabrze:LM:Q2', 'widzew:LE:Q3', 'jagiellonia:LK:Q2', 'rakow:LK:Q2',
  ]);
  assert.equal(r[2].via, 'finalista Pucharu Polski');
  assert.equal(r.filter((x) => x.club === 'lech').length, 1);
});

test('Finalista z 1 Ligi też dostaje miejsce po zdobywcy PP', () => {
  const r = allocateEuropeanSpots(table, cup('lech', 'lechia-gdansk'), 15);
  assert.equal(r.find((x) => x.comp === 'LE').club, 'lechia-gdansk');
});

test('Obaj finaliści mają miejsca z ligi: LE dla najwyżej sklasyfikowanego klubu bez kwalifikacji', () => {
  const r = allocateEuropeanSpots(table, cup('lech', 'gornik-zabrze'), 15);
  assert.deepEqual(short(r).slice(2), ['jagiellonia:LE:Q3', 'rakow:LK:Q2', 'gks-katowice:LK:Q2']);
  assert.equal(r[2].via, 'miejsce po zdobywcy PP');
});

test('Finalista z miejscem LK: dostaje LE, a LK przechodzi niżej w tabeli', () => {
  // Górnik (2.) wygrywa PP, Raków (4.) przegrywa finał
  const r = allocateEuropeanSpots(table, cup('gornik-zabrze', 'rakow'), 15);
  assert.deepEqual(short(r), [
    'lech:LM:Q2', 'gornik-zabrze:LM:Q2', 'rakow:LE:Q3', 'jagiellonia:LK:Q2', 'gks-katowice:LK:Q2',
  ]);
});

test('Tryb UEFA (cupFallback league) odtwarza prawdziwy przydział 2026/27', () => {
  const r = allocateEuropeanSpots(table, cup('gornik-zabrze', 'rakow'), 15, undefined, { cupFallback: 'league' });
  assert.deepEqual(short(r), [
    'lech:LM:Q2', 'gornik-zabrze:LM:Q2', 'jagiellonia:LE:Q3', 'rakow:LK:Q2', 'gks-katowice:LK:Q2',
  ]);
  assert.equal(r[0].path, 'champions');
  assert.equal(r[1].path, 'league');
});

test('Zdobywca PP z dalszego miejsca bierze LE, miejsca LK idą do 3. i 4. drużyny', () => {
  const r = allocateEuropeanSpots(table, cup('legia', 'lech'), 15);
  assert.deepEqual(short(r).slice(2), ['legia:LE:Q3', 'jagiellonia:LK:Q2', 'rakow:LK:Q2']);
});

test('Zdobywca PP z 1 Ligi dostaje miejsce w LE', () => {
  const r = allocateEuropeanSpots(table, cup('lechia-gdansk', 'lech'), 15);
  assert.equal(r.find((x) => x.comp === 'LE').club, 'lechia-gdansk');
  assert.equal(r.length, 5);
});

test('Klub bez prawa gry jest pomijany, a miejsce przechodzi dalej', () => {
  const r = allocateEuropeanSpots(table, cup('gornik-zabrze', 'legia'), 15, (id) => id !== 'jagiellonia');
  assert.deepEqual(short(r).slice(2), ['legia:LE:Q3', 'rakow:LK:Q2', 'gks-katowice:LK:Q2']);
});

test('Nigdy dwa miejsca dla jednego klubu, przy każdym rankingu i kombinacji finału', () => {
  const ids = [...table, 'lechia-gdansk'];
  for (const rank of [8, 12, 15, 20, 40]) {
    for (const w of ids) {
      for (const ru of ids) {
        if (w === ru) continue;
        const r = allocateEuropeanSpots(table, cup(w, ru), rank);
        assert.equal(new Set(r.map((x) => x.club)).size, r.length, `ranking ${rank}, ${w} vs ${ru}`);
      }
    }
  }
  assert.equal(allocateEuropeanSpots(table, cup(null, null), 12)[0].entry, 'PO');
});
