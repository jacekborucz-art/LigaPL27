// Bierna gra, runda 3 (Nov 27, 2026, docs/bierna-gra.md rozdz. 10): losowe przygotowanie pod rywala, przewaga AI
// w analizie, kontrplan trenera AI, autorytet zależny od ligi i wyłącznik PASSIVE.r3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PREP, prepOdds, rollPrep, aiScoutAdvantage, userExperience } from '../src/training/prep.js';
import { PASSIVE, SCOUT } from '../src/training/scouting.js';
import { AUTH, authorityTerm } from '../src/career/authority.js';

// Minimalna gra: sztab z jakością (staffA czyta game.training.staff[club][rola].q)
function fakeGame({ asst = 10, analyst = 8, matches = 0 } = {}) {
  const staff = (q) => ({ q, a: null });
  return {
    seed: 7, clubId: 'user', date: '2026-09-01',
    manager: { career: { tot: { n: matches } } },
    training: { staff: { user: { asystent: staff(asst), analityk: staff(analyst) }, 'stal-stalowa-wola': { asystent: staff(8), analityk: staff(5) } } },
  };
}

test('Runda 3: szanse przygotowania rosną z doświadczeniem trenera i jakością asystenta', () => {
  const fresh = prepOdds(fakeGame({ matches: 0 }), 'user', 'self');
  const vet = prepOdds(fakeGame({ matches: 400 }), 'user', 'self');
  assert.deepEqual(fresh, { gain: 0.55, loss: 0.15 });
  assert.deepEqual(vet, { gain: 0.75, loss: 0.05 });
  assert.equal(userExperience(fakeGame({ matches: 150 })), 0.5);
  const a20 = prepOdds(fakeGame({ asst: 20 }), 'user', 'asst');
  const a5 = prepOdds(fakeGame({ asst: 5 }), 'user', 'asst');
  assert.deepEqual(a20, { gain: 0.5, loss: 0.2 });
  assert.deepEqual(a5, { gain: 0.25, loss: 0.45 });
  assert.ok(fresh.gain > a20.gain, 'własna praca trenera daje lepsze szanse niż najlepszy asystent');
});

test('Runda 3: wynik przygotowania jest losowy, stały dla meczu, strata mniejsza niż zysk', () => {
  const g = fakeGame({ analyst: 8 });
  const base = Math.max(PREP.base, 0.04 + 0.006 * 8);
  const kinds = { gain: 0, none: 0, loss: 0 };
  let gain = 0; let loss = 0;
  for (let d = 1; d <= 400; d++) {
    const date = `2027-${String(1 + (d % 12)).padStart(2, '0')}-${String(1 + (d % 28)).padStart(2, '0')}x${d}`;
    const r = rollPrep(g, 'user', date, 'self');
    assert.deepEqual(r, rollPrep(g, 'user', date, 'self'), 'to samo ziarno, ten sam wynik');
    kinds[r.kind]++;
    if (r.kind === 'gain') { assert.ok(r.v >= base * PREP.gain[0] - 1e-3 && r.v <= base * PREP.gain[1] + 1e-3); gain += r.v; }
    if (r.kind === 'loss') { assert.ok(r.v < 0 && -r.v <= base * PREP.loss[1] + 1e-3); loss -= r.v; }
    if (r.kind === 'none') assert.equal(r.v, 0);
  }
  assert.ok(kinds.gain > 180 && kinds.gain < 260, `zysk ok. 55 %: ${JSON.stringify(kinds)}`);
  assert.ok(kinds.loss > 30 && kinds.loss < 95, `strata ok. 15 %: ${JSON.stringify(kinds)}`);
  assert.ok(loss / kinds.loss < gain / kinds.gain, 'średnia strata mniejsza niż średni zysk');
});

test('Runda 3: przewaga AI w analizie rywala gracza: 0 w Ekstraklasie, w niższych ligach od 0 do granicy', () => {
  const g = fakeGame();
  assert.equal(aiScoutAdvantage(g, 'legia', '2026-09-01'), 0);
  const vals = Array.from({ length: 300 }, (_, i) => aiScoutAdvantage(g, 'stal-stalowa-wola', `d${i}`));
  const X = PREP.adv[3];
  assert.ok(vals.every((v) => v >= 0 && v <= X));
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  assert.ok(mean > X * 0.25 && mean < X * 0.42, `średnio ok. X/3: ${mean}`);
  assert.ok(vals.filter((v) => v < X * 0.25).length > vals.length * 0.4, 'zwykle mało');
});

test('Runda 3: autorytet waży więcej w niższych ligach, Ekstraklasa bez zmian, wyłącznik przywraca stare wartości', () => {
  assert.equal(authorityTerm(0.1, 9, 1), authorityTerm(0.1, 9));
  assert.ok(authorityTerm(0.1, 7, 3) < authorityTerm(0.1, 7, 1));
  assert.ok(authorityTerm(0, 7, 4) >= AUTH.min * AUTH.dep[4] - 1e-9);
  assert.ok(authorityTerm(0.95, 7, 4) > authorityTerm(0.95, 7, 1));
  PASSIVE.r3 = false;
  try {
    assert.equal(authorityTerm(0.1, 7, 4), authorityTerm(0.1, 7));
  } finally { PASSIVE.r3 = true; }
  assert.equal(SCOUT.edgeMaxR2, 0.4);
});
