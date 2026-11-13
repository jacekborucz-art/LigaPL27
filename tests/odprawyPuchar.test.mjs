// Przemowy w meczach pucharowych (panel psycholog + trener, docs/odprawy-kontekst.md): ranga wg rundy, dwumecz,
// mecz o wszystko, finał, odprawa i morale po rozstrzygnięciu (karne, dwumecz, trofeum), te same zasady dla AI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compRank, tieMood, moodResult } from '../src/season/cup.js';
import { preSituation, halfSituation, preMatchBriefing, postMatchBriefing, aiBriefing } from '../src/match/briefings.js';
import { afterMatchDelta } from '../src/career/morale.js';

test('Ranga wg rundy i stanu dwumeczu', () => {
  assert.deepEqual(['R64', 'R32', 'QF', 'SF', 'F'].map((round) => compRank({ comp: 'pp', round })), [0, 1, 1, 2, 3]);
  assert.equal(compRank({ comp: 'super', round: 'F' }), 2);
  assert.equal(compRank({ comp: 'uefa', round: 'Q1' }), 1);
  assert.equal(compRank({ comp: 'uefa', round: 'SF' }), 3);
  assert.equal(compRank({ comp: 'uefa', round: 'QF', knockout: { firstLeg: [1, 1] } }), 3, 'rewanż na styku: +1');
  assert.equal(compRank({ comp: 'uefa', round: 'QF', knockout: { firstLeg: [0, 3] } }), 0, 'dwumecz rozstrzygnięty');
  assert.equal(compRank({ comp: 'playoff-liga1', round: 'F' }), 3);
  assert.equal(compRank({ comp: 'ekstraklasa', round: 5 }), null);
});

test('Przed meczem: flagi dwumeczu, meczu o wszystko, finału i pułapki', () => {
  assert.ok(preSituation({ ko: { decider: true, agg: -1 } }).flags.includes('aggBehind1'));
  assert.ok(preSituation({ ko: { decider: true, agg: 2 } }).flags.includes('aggLead2plus'));
  assert.ok(preSituation({ ko: { decider: true, single: true } }).flags.includes('singleKO'));
  assert.ok(preSituation({ ko: { decider: true, single: true, final: true } }).flags.includes('final'));
  assert.ok(preSituation({ pWin: 0.7, ko: { decider: true, single: true, trap: true } }).flags.includes('trap'));
  // Słabszy w meczu o wszystko: „bez presji” działa, faworyt w pułapce: lepiej wymagać niż chwalić
  const team = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, persona: 'Spokojny', morale: 12 }));
  const avg = (ctx, tone) => { const r = preMatchBriefing({ players: team, tone, ctx, seed: 's' }); return Object.values(r.engine.zStart).reduce((a, b) => a + b, 0) / team.length; };
  const dog = { pWin: 0.2, ko: { decider: true, single: true } };
  assert.ok(avg(dog, 'noPressure') > avg({ pWin: 0.2 }, 'noPressure'));
  const trap = { pWin: 0.75, ko: { decider: true, single: true, trap: true } };
  assert.ok(avg(trap, 'demand') > avg(trap, 'praise'));
});

test('Przerwa w rewanżu: stan z dwumeczu, remis w dwumeczu zapowiada dogrywkę', () => {
  // prowadzimy 1:0, ale pierwszy mecz przegrany 0:2: szatnia przegrywa
  const h = halfSituation({ score: { for: 1, against: 0 }, ko: { decider: true, agg: -2 } });
  assert.equal(h.stateIdx, 2); assert.equal(h.behindBy, 1); assert.equal(h.diff, 1);
  const lv = halfSituation({ score: { for: 0, against: 0 }, ko: { decider: true, agg: 0 } });
  assert.ok(lv.etLooming);
  const done = halfSituation({ score: { for: 2, against: 0 }, rank: 2, ko: { decider: true, agg: 2 } });
  assert.equal(done.rank, 0, 'dwumecz rozstrzygnięty');
});

test('Trener AI: ten sam stan dwumeczu w przerwie i ta sama ranga co gracz', () => {
  const team = { coach: 'O', personaMix: { Spokojny: 10, Ambitny: 5 } };
  const lead = aiBriefing(team, { phase: 'half', diff: 1, xgDiff: 0 }, 'x');
  const behind = aiBriefing(team, { phase: 'half', diff: 1, xgDiff: 0, ko: { decider: true, agg: -2 } }, 'x');
  assert.notEqual(lead.tone, behind.tone, `${lead.tone} / ${behind.tone}`);
  assert.ok(['shout', 'demand'].includes(behind.tone), behind.tone);
});

test('Po meczu: seria karnych i dwumecz liczą się jako rozstrzygnięcie (gracz i AI, odprawa i morale)', () => {
  const sc = { comp: 'super', round: 'F', home: 'a', away: 'b', result: { score: [1, 1], shootout: [4, 3] } };
  assert.equal(moodResult(sc, 0), 'W'); assert.equal(moodResult(sc, 1), 'L');
  const t = tieMood(sc, 0);
  assert.ok(t.won && t.trophy && t.pens && t.super);
  const leg = { comp: 'uefa', round: 'QF', leg: 2, home: 'a', away: 'b', knockout: { firstLeg: [0, 2] }, result: { score: [1, 0] } };
  assert.equal(moodResult(leg, 0), 'L', 'wygrany rewanż, odpadnięcie w dwumeczu');
  assert.ok(tieMood(leg, 1).legSplit && tieMood(leg, 1).won);
  // morale bazowe: trofeum > awans > awans mimo przegranego rewanżu > 0 > odpadnięcie po karnych > przegrany finał
  const d = (tie, sd = 0) => afterMatchDelta({ tie, strengthDiff: sd });
  const trophy = d(t); const adv = d({ won: true }); const split = d({ won: true, legSplit: true });
  const outPens = d({ won: false, pens: true }); const lostFinal = d({ won: false, final: true });
  assert.ok(trophy > adv && adv > split && split > 0 && outPens < 0 && lostFinal < outPens, [trophy, adv, split, outPens, lostFinal].join());
  assert.ok(d({ won: false }, 2) < d({ won: false }, -2), 'odpadnięcie faworyta boli bardziej');
  // odprawa pomeczowa: pochwała po trofeum zdobytym w karnych działa jak po wygranej, nie jak po remisie
  const team = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, persona: 'Spokojny', morale: 12 }));
  const m = (ctx) => { const r = postMatchBriefing({ players: team, tone: 'praise', ctx, seed: 'z' }); return Object.values(r.morale).reduce((a, x) => a + x.delta, 0) / team.length; };
  const draw = m({ score: { for: 1, against: 1 }, rank: 2 });
  const won = m({ score: { for: 1, against: 1 }, rank: 2, decided: 'W' });
  assert.ok(won > draw + 0.4, `${won} vs ${draw}`);
  assert.ok(m({ score: { for: 2, against: 0 }, rank: 3 }) > m({ score: { for: 2, against: 0 }, rank: 1 }), 'finał: emocje mocniejsze');
  assert.ok(m({ score: { for: 2, against: 0 }, rank: 2, firstLeg: true }) < m({ score: { for: 2, against: 0 }, rank: 2 }), 'pierwszy mecz dwumeczu słabiej');
});
