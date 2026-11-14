import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { quickMatch, outcomeProbs, expectedGoals } from '../src/engine/quickSim.js';
import { teamRating, tableConfidence } from '../src/engine/teamStrength.js';
import { registerModifier, unregisterModifier, listModifiers } from '../src/engine/modifiers.js';
import { afterMatchDelta, applyMorale, weeklyDrift, teamMorale } from '../src/career/morale.js';
import { statsFromEvents, checkStatsInvariants } from '../src/engine/matchStats.js';

// Kadra 22 zawodników na poziomie L: podstawowa jedenastka +0.3, ławka -0.5 (jak w generatorze eksperta).
function squad(L, tag, extra = {}) {
  const layout = [['BR', 3], ['ŚO', 4], ['BO', 4], ['ŚP', 5], ['BP', 3], ['NAP', 3]];
  const starters = { BR: 1, ŚO: 2, BO: 2, ŚP: 3, BP: 1, NAP: 2 };
  const out = [];
  for (const [pos, n] of layout) {
    for (let i = 0; i < n; i++) {
      out.push({ id: `${tag}-${pos}${i}`, pos, ovr: L + (i < starters[pos] ? 0.3 : -0.5), morale: 12, form: [6.6], fresh: 95, sharp: 80, ...extra });
    }
  }
  return out;
}

function run(home, away, n, ctx = {}, seed = 'kal') {
  const rng = new Rng(seed);
  const r = { h: 0, d: 0, a: 0, gH: 0, gA: 0 };
  for (let i = 0; i < n; i++) {
    const m = quickMatch(home, away, { refStrict: 1, ...ctx }, rng);
    r.gH += m.score[0]; r.gA += m.score[1];
    if (m.score[0] > m.score[1]) r.h++; else if (m.score[0] === m.score[1]) r.d++; else r.a++;
  }
  return { h: r.h / n, d: r.d / n, a: r.a / n, goals: (r.gH + r.gA) / n };
}

test('Deterministyczność: to samo ziarno daje ten sam mecz', () => {
  const H = { squad: squad(11, 'h') }; const A = { squad: squad(11, 'a') };
  const m1 = quickMatch(H, A, {}, new Rng('x'));
  const m2 = quickMatch(H, A, {}, new Rng('x'));
  assert.deepEqual(m1, m2);
});

test('Kalibracja: równe drużyny dają realne średnie (gole ok. 2,7, gospodarz ok. 44 %)', () => {
  const r = run({ squad: squad(11.5, 'h') }, { squad: squad(11.5, 'a') }, 12000);
  assert.ok(r.goals > 2.55 && r.goals < 2.9, `gole ${r.goals}`);
  assert.ok(r.h > 0.41 && r.h < 0.48, `wygrane gospodarza ${r.h}`);
  assert.ok(r.d > 0.24 && r.d < 0.31, `remisy ${r.d}`);
});

test('Uczciwość: silniejsza drużyna wygrywa częściej, przewaga rośnie z różnicą sił', () => {
  const eq = run({ squad: squad(11, 'h') }, { squad: squad(11, 'a') }, 4000);
  const plus1 = run({ squad: squad(12, 'h') }, { squad: squad(11, 'a') }, 4000);
  const plus2 = run({ squad: squad(13, 'h') }, { squad: squad(11, 'a') }, 4000);
  assert.ok(plus1.h > eq.h + 0.1 && plus2.h > plus1.h + 0.08, `${eq.h} ${plus1.h} ${plus2.h}`);
  assert.ok(plus2.a > 0.03, 'słabszy wciąż czasem wygrywa');
});

test('Miejsce spotkania: ta sama para, gospodarz ma przewagę', () => {
  const H = { squad: squad(11, 'h') }; const A = { squad: squad(11, 'a') };
  const p = outcomeProbs(...Object.values(expectedGoals(teamRating(H.squad), teamRating(A.squad))).slice(0, 2));
  const n = outcomeProbs(...Object.values(expectedGoals(teamRating(H.squad), teamRating(A.squad), { neutral: true })).slice(0, 2));
  assert.ok(p.home > p.away + 0.1);
  assert.ok(Math.abs(n.home - n.away) < 0.01);
  assert.ok(Math.abs(p.home + p.draw + p.away - 1) < 1e-9);
});

test('Kontuzje: brak 3 najlepszych zawodników obniża szanse', () => {
  const full = squad(11.5, 'h');
  const injured = full.map((p, i) => (['h-ŚP0', 'h-NAP0', 'h-ŚO0'].includes(p.id) ? { ...p, ovr: p.ovr + 1.5, injuryDays: 20 } : p));
  const healthy = injured.map((p) => ({ ...p, injuryDays: 0 }));
  const A = { squad: squad(11.5, 'a') };
  const r1 = run({ squad: healthy }, A, 4000);
  const r2 = run({ squad: injured }, A, 4000);
  assert.ok(r1.h > r2.h + 0.05, `zdrowi ${r1.h}, z kontuzjami ${r2.h}`);
});

test('Morale i forma podnoszą siłę drużyny', () => {
  const base = teamRating(squad(11, 'h')).zones.MID;
  const high = teamRating(squad(11, 'h', { morale: 18 })).zones.MID;
  const low = teamRating(squad(11, 'h', { morale: 4 })).zones.MID;
  const inForm = teamRating(squad(11, 'h', { form: [7.8, 7.5, 7.6] })).zones.MID;
  assert.ok(high > base && base > low);
  assert.ok(inForm > base);
  const rHigh = run({ squad: squad(11, 'h', { morale: 19 }) }, { squad: squad(11, 'a', { morale: 4 }) }, 4000);
  const rEq = run({ squad: squad(11, 'h') }, { squad: squad(11, 'a') }, 4000);
  assert.ok(rHigh.h > rEq.h + 0.04, `${rHigh.h} vs ${rEq.h}`);
});

test('Tabela: pewność siebie działa od 4. kolejki i jest ograniczona do +-0.15', () => {
  assert.equal(tableConfidence({ played: 3, points: 9 }, 11, 11.5), 0);
  assert.ok(tableConfidence({ played: 10, points: 30 }, 11, 11.5) <= 0.15);
  assert.ok(tableConfidence({ played: 10, points: 0 }, 11, 11.5) >= -0.15);
  assert.ok(tableConfidence({ played: 10, points: 25 }, 11, 11.5) > 0);
});

test('Bez bramkarza w kadrze: rywal strzela wyraźnie więcej', () => {
  const noGk = squad(11, 'h').map((p) => (p.pos === 'BR' ? { ...p, injuryDays: 10 } : p));
  const H = teamRating(noGk); const A = teamRating(squad(11, 'a'));
  const normal = expectedGoals(teamRating(squad(11, 'h')), A);
  const without = expectedGoals(H, A);
  assert.ok(without.lA > normal.lA + 0.8, `${normal.lA} -> ${without.lA}`);
});

test('Statystyki z modelu są spójne: gole <= celne <= strzały, strzelcy = gole, posiadanie = 100', () => {
  const rng = new Rng('spojnosc');
  for (let i = 0; i < 2000; i++) {
    const m = quickMatch({ squad: squad(11, 'h') }, { squad: squad(10.5, 'a') }, { refStrict: 1.1 }, rng);
    for (const s of [0, 1]) {
      assert.ok(m.score[s] <= m.onTarget[s] && m.onTarget[s] <= m.shots[s]);
      assert.equal(m.scorers[s].length, m.score[s]);
    }
    assert.equal(m.possession[0] + m.possession[1], 100);
  }
});

test('Rejestr modyfikatorów: nowa cecha działa bez zmiany silnika', () => {
  const before = teamRating(squad(11, 'h')).zones.MID;
  registerModifier({ id: 'testChemia', scope: 'player', label: 'Chemia', apply: (p) => (p.chemia ? 0.5 : 0) });
  try {
    assert.ok(listModifiers('player').includes('testChemia'));
    const after = teamRating(squad(11, 'h', { chemia: true }));
    assert.ok(Math.abs(after.zones.MID - before - 0.5) < 1e-9);
    assert.ok('testChemia' in after.breakdown);
  } finally {
    unregisterModifier('player', 'testChemia');
  }
  assert.equal(teamRating(squad(11, 'h', { chemia: true })).zones.MID, before);
});

test('Morale: wygrana podnosi, sensacja bardziej, derby mocniej, dryf ku 12, zakres 1-20', () => {
  assert.equal(afterMatchDelta({ result: 'W', strengthDiff: 0 }), 1.5);
  assert.equal(afterMatchDelta({ result: 'W', strengthDiff: -2 }), 2.5);
  assert.equal(afterMatchDelta({ result: 'L', strengthDiff: 2 }), -2.5);
  assert.equal(afterMatchDelta({ result: 'W', strengthDiff: 0, derby: true }), 3);
  assert.ok(afterMatchDelta({ result: 'D', strengthDiff: 0, played: true, rating: 8 }) > 0);
  assert.equal(applyMorale(19.5, 3), 20);
  assert.equal(applyMorale(2, -5), 1);
  assert.equal(weeklyDrift(15), 14.7);
  assert.equal(weeklyDrift(12.1), 12);
  assert.equal(teamMorale([{ morale: 10, minutes: 900 }, { morale: 14, minutes: 800 }]), 12);
});

test('Statystyki pełnego silnika liczone tylko ze zdarzeń, z kontrolą niezmienników', () => {
  const ev = [
    { type: 'pass', side: 0, count: 40 }, { type: 'passFail', side: 0, count: 8 },
    { type: 'possessionMinute', share: 0.6 }, { type: 'possessionMinute', share: 0.4 },
    { type: 'shotOn', side: 0, xg: 0.2 }, { type: 'save', side: 1 },
    { type: 'goal', side: 0, xg: 0.4 }, { type: 'shotOff', side: 1, xg: 0.05 },
    { type: 'corner', side: 0 }, { type: 'throwIn', side: 1, count: 3 }, { type: 'foul', side: 1 },
    { type: 'freeKick', side: 0 }, { type: 'offside', side: 1 }, { type: 'yellow', side: 1 },
  ];
  const s = statsFromEvents(ev);
  assert.equal(s[0].goals, 1);
  assert.equal(s[0].shots, 2);
  assert.equal(s[0].onTarget, 2);
  assert.equal(s[0].passAccuracy, 83);
  assert.equal(s[0].possession, 50);
  assert.equal(s[1].throwIns, 3);
  assert.deepEqual(checkStatsInvariants(s, [1, 0]), []);
  assert.ok(checkStatsInvariants(s, [2, 0]).length > 0, 'wynik niezgodny ze zdarzeniami musi zostać wykryty');
});
