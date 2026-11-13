// Nagrody: podział Ekstraklasy za wynik sportowy, Puchar Polski według najdalszej rundy, UEFA (finał, zdobywca,
// wypłaty solidarnościowe). Model: docs/finanse.md, rozdz. 3.3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { meritTv, clubPlan, uefaPrize, PP_PRIZE, FIN } from '../src/career/finance.js';
import { ppPrizeDue, bookCupPrize, bookUefaWinner, uefaSolidarity } from '../src/career/prizes.js';
import { PP_ROUNDS } from '../src/season/cup.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { SEASON_YEAR } from '../src/config/calendar2026.js';

const M = 1e6;
const fakeF = (ids) => ({ clubs: Object.fromEntries(ids.map((id) => [id, { ledger: {}, log: [], balance: 0 }])) });
const prizeIn = (c) => Object.values(c.ledger).reduce((s, m) => s + (m.in.prize ?? 0), 0);

test('Ekstraklasa: wynik sportowy liniowo plus premia za podium, mistrz ok. 22,6 mln, razem ok. 1/3 z 301 mln', () => {
  const all = Array.from({ length: 18 }, (_, i) => meritTv(1, i + 1));
  assert.ok(all[0] >= 22.4 * M && all[0] <= 22.8 * M, `mistrz ${all[0]}`);
  assert.equal(all[1], 18.9 * M);
  assert.equal(all[2], 15.1 * M);
  assert.equal(all[3], 7.3 * M);
  assert.equal(all[17], 0.6 * M);
  for (let i = 1; i < 18; i++) assert.ok(all[i] <= all[i - 1], 'premia nie rośnie z miejscem');
  const sum = all.reduce((a, b) => a + b, 0);
  assert.ok(sum > 0.3 * 301.1 * M && sum < 0.36 * 301.1 * M, `suma ${sum}`); // 33,5 % puli
  assert.equal(FIN.RELEGATION_COMP, 1 * M);
});

test('1 Liga: ok. 1,5 mln zł z PZPN w części stałej, premia za miejsce tylko symboliczna', () => {
  assert.equal(FIN.TV_FIXED[2], 1.5 * M);
  assert.ok(meritTv(2, 1) <= 0.5 * M);
  assert.equal(meritTv(2, 10), 0);
  const club = CLUBS_PL.find((c) => c.tier === 2);
  const p = clubPlan(club);
  assert.equal(p.tv, 1.5 * M);
  assert.ok(p.merit < 0.1 * M);
});

test('Puchar Polski: łączna kwota według najdalszej rundy (także dla przegranego)', () => {
  const expectOut = { R64: 15000, R32: 45000, R16: 90000, QF: 190000, SF: 380000, F: 1000000 };
  // Klub wchodzi w 1/32 i odpada w rundzie r: suma wypłat = kwota za tę rundę
  for (const [out, amount] of Object.entries(expectOut)) {
    let sum = 0;
    for (const r of PP_ROUNDS.slice(PP_ROUNDS.indexOf('R64'), PP_ROUNDS.indexOf(out) + 1)) sum += ppPrizeDue(r, r !== out, r !== 'R64');
    assert.equal(sum, amount, `odpadnięcie w ${out}`);
  }
  // Zdobywca z 1/32: 5 mln
  let win = 0;
  for (const r of PP_ROUNDS.slice(1)) win += ppPrizeDue(r, true, r !== 'R64');
  assert.equal(win, 5 * M);
  assert.equal(PP_PRIZE.W, 5 * M);
  // Runda wstępna jak I runda [SZAC]; klub z pucharów UEFA wchodzi w 1/16
  assert.equal(ppPrizeDue('PRE', false, false), 15000);
  assert.equal(ppPrizeDue('PRE', true, false) + ppPrizeDue('R64', false, true), 15000);
  assert.equal(ppPrizeDue('R32', false, false), 45000);
});

test('Puchar Polski: księgowanie po meczu dla obu klubów', () => {
  const F = fakeF(['a', 'b', 'c']);
  const r1 = { id: 'x1', comp: 'pp', round: 'R64', date: '2026-08-20', home: 'a', away: 'c', result: { score: [2, 0] } };
  const r2 = { id: 'x2', comp: 'pp', round: 'R32', date: '2026-09-20', home: 'a', away: 'b', result: { score: [1, 1], shootout: [3, 4] } };
  const fx = [r1, r2];
  bookCupPrize(F, fx, r1);
  assert.equal(prizeIn(F.clubs.a), 45000, 'awans do 1/16 gwarantuje 45 tys.');
  assert.equal(prizeIn(F.clubs.c), 15000, 'odpadnięcie w I rundzie (1/32): 15 tys.');
  bookCupPrize(F, fx, r2);
  assert.equal(prizeIn(F.clubs.a), 45000, 'a odpada w 1/16: nadal 45 tys. łącznie');
  assert.equal(prizeIn(F.clubs.b), 90000, 'b (z pucharów UEFA) awansuje do 1/8: 90 tys.');
  assert.ok(F.clubs.c.log.some((l) => /odpadnięcie/.test(l.note)));
});

test('UEFA: finał LE 7 mln EUR, premie dla zdobywców, wypłaty solidarnościowe raz w sezonie', () => {
  assert.equal(uefaPrize('LE', 'F'), Math.round(7 * M * FIN.EUR / 1000) * 1000);
  assert.equal(uefaPrize('LE', 'W'), Math.round(6 * M * FIN.EUR / 1000) * 1000);
  assert.equal(uefaPrize('LK', 'W'), Math.round(3 * M * FIN.EUR / 1000) * 1000);
  assert.equal(uefaPrize('LM', 'W'), Math.round(6.5 * M * FIN.EUR / 1000) * 1000);
  const F = fakeF(['a', 'b']);
  const fin = { comp: 'uefa', ucomp: 'LK', round: 'F', date: '2027-05-26', home: 'a', away: 'b', result: { score: [0, 1] } };
  bookUefaWinner(F, fin);
  assert.equal(prizeIn(F.clubs.b), uefaPrize('LK', 'W'));
  assert.equal(prizeIn(F.clubs.a), 0);
  bookUefaWinner(F, { ...fin, round: 'SF' });
  assert.equal(prizeIn(F.clubs.b), uefaPrize('LK', 'W'), 'premia tylko po finale');

  const ek = CLUBS_PL.filter((c) => c.tier === 1).map((c) => c.id);
  const l1 = CLUBS_PL.find((c) => c.tier === 2).id;
  const [q, lp, np] = ek;
  const game = {
    finance: fakeF([q, lp, np, l1]),
    fixtures: [
      { comp: 'uefa', ucomp: 'LK', round: 'Q2', leg: 1, home: q, away: 'obcy' },
      { comp: 'uefa', ucomp: 'LE', round: 'Q3', leg: 1, home: lp, away: 'obcy' },
      { comp: 'uefa', ucomp: 'LE', round: 'league', md: 1, home: lp, away: 'obcy2' },
    ],
  };
  const day = `${SEASON_YEAR}-12-15`;
  assert.equal(uefaSolidarity(game, `${SEASON_YEAR}-12-14`), 0);
  assert.equal(uefaSolidarity(game, day), 2);
  assert.equal(prizeIn(game.finance.clubs[q]), uefaPrize('SOL', 'Q'));
  assert.equal(prizeIn(game.finance.clubs[lp]), 0, 'faza ligowa: bez wypłaty solidarnościowej');
  assert.equal(prizeIn(game.finance.clubs[np]), uefaPrize('SOL', 'NP'));
  assert.equal(prizeIn(game.finance.clubs[l1]), 0, '1 Liga: bez wypłaty');
  assert.equal(uefaSolidarity(game, day), 0, 'raz w sezonie');
});
