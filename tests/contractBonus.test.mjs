// Premie z kontraktów (src/career/contractBonus.js, docs/finanse.md): naliczanie po meczu, sparingi, czyste konto,
// miesięczna wypłata, wypożyczeni, mnożniki UEFA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, playQuick, applyResult } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { financeDay, FIN_LABELS } from '../src/career/finance.js';
import { createLoan, loanTerms } from '../src/career/loans.js';
import { applySeasonState } from '../src/season/rollover.js';
import { bonusMultiplier, CONTRACT_BONUS } from '../src/career/contractBonus.js';
import { Rng } from '../src/core/rng.js';
import '../src/season/dailySystems.js';

function newGame(clubId = 'widzew', seed = 21) {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  for (const p of Object.values(g.world.players)) if (p.contract) p.contract.bonus = { goal: 0, assist: 0, cleanSheet: 0, app: 0 };
  return g;
}
/** Mecz ligowy klubu jako gospodarza, wynik z szybkiej symulacji z wymuszonym wynikiem i statystykami. */
function played(g, clubId, { comp, round, score = [1, 0], tweak } = {}) {
  const f = g.fixtures.find((x) => x.home === clubId && !x.played && x.comp !== 'friendly' && x.comp !== 'pp');
  const res = playQuick(g, f, new Rng('t'));
  res.score = score;
  for (const s of [0, 1]) for (const x of res.players[s]) { x.minutes = 90; x.g = 0; x.a = 0; x.yc = 0; x.rc = 0; }
  tweak?.(res, g);
  const ff = comp ? { ...f, comp, round } : f;
  if (comp === 'friendly') { ff.id = f.id; }
  applyResult(g, ff, res, new Rng('r'));
  return { f: ff, res };
}
const P = (g, id) => g.world.players[id];
const setB = (g, id, b) => { P(g, id).contract.bonus = { goal: 0, assist: 0, cleanSheet: 0, app: 0, ...b }; };

test('Gol i występ w meczu ligowym: klub zawodnika dostaje należność z jego kontraktu', () => {
  const g = newGame();
  let id;
  played(g, 'widzew', { tweak: (res) => {
    const x = res.players[0].find((y) => P(g, y.id).pos !== 'BR' && !['ŚO', 'BO', 'WB'].includes(P(g, y.id).pos));
    id = x.id; x.g = 1; x.a = 1; setB(g, id, { goal: 1000, assist: 400, app: 300, cleanSheet: 9999 });
  } });
  assert.equal(g.finance.clubs.widzew.bonusDue, 1000 + 400 + 300);
  assert.equal(P(g, id).season.bonus, 1700);
  assert.ok(!g.finance.clubs.legia.bonusDue);
});

test('Sparing nie daje premii', () => {
  const g = newGame();
  played(g, 'widzew', { comp: 'friendly', tweak: (res) => { const x = res.players[0][3]; x.g = 1; setB(g, x.id, { goal: 1000, app: 300 }); } });
  assert.ok(!g.finance.clubs.widzew.bonusDue);
});

test('Czyste konto: tylko bramkarz i obrońcy z co najmniej 45 minutami, gdy drużyna nie straciła gola', () => {
  const g = newGame();
  const ids = {};
  played(g, 'widzew', { score: [1, 0], tweak: (res) => {
    const xs = res.players[0];
    const gk = xs.find((y) => P(g, y.id).pos === 'BR');
    const def = xs.filter((y) => ['ŚO', 'BO', 'WB'].includes(P(g, y.id).pos));
    const att = xs.find((y) => !['BR', 'ŚO', 'BO', 'WB'].includes(P(g, y.id).pos));
    ids.gk = gk.id; ids.d1 = def[0].id; ids.d2 = def[1].id; ids.att = att.id;
    def[1].minutes = 30; // za krótko na czyste konto i połowa premii za występ
    for (const k of Object.values(ids)) setB(g, k, { cleanSheet: 1000, app: 200 });
  } });
  assert.equal(P(g, ids.gk).season.bonus, 1200);
  assert.equal(P(g, ids.d1).season.bonus, 1200);
  assert.equal(P(g, ids.d2).season.bonus, 100);
  assert.equal(P(g, ids.att).season.bonus, 200);
  assert.equal(g.finance.clubs.widzew.bonusDue, 1200 + 1200 + 100 + 200);
  // Gospodarz stracił gola: bramkarz gości (nie stracił) ma czyste konto, gospodarza nie
  const h = newGame();
  const hid = {};
  played(h, 'widzew', { score: [0, 1], tweak: (res) => {
    hid.hg = res.players[0].find((y) => P(h, y.id).pos === 'BR').id; hid.ag = res.players[1].find((y) => P(h, y.id).pos === 'BR').id;
    setB(h, hid.hg, { cleanSheet: 1000 }); setB(h, hid.ag, { cleanSheet: 1000 });
  } });
  assert.ok(!P(h, hid.hg).season.bonus);
  assert.equal(P(h, hid.ag).season.bonus, 1000);
});

test('Miesięczna wypłata: wydatek "Premie zawodników" i zerowanie należności, także na minusie', () => {
  const g = newGame();
  const c = g.finance.clubs.widzew;
  c.bonusDue = 7000; c.balance = -1000;
  financeDay(g.finance, g.world, '2026-09-01');
  assert.equal(c.bonusDue, 0);
  assert.equal(c.ledger['2026-09'].out.bonus, 7000);
  assert.equal(FIN_LABELS.bonus, 'Premie zawodników');
});

test('Wypożyczony: premię płaci klub przyjmujący', () => {
  const g = newGame();
  const p = squadOf(g.world, 'legia').sort((a, b) => a.ovr - b.ovr)[2];
  createLoan(g, p.id, 'widzew', loanTerms(g, p, { share: 60, type: 'sezon', fee: 0 }));
  setB(g, p.id, { app: 500 });
  played(g, 'widzew', { tweak: (res) => {
    const x = res.players[0].find((y) => y.id !== p.id && P(g, y.id).pos === p.pos) ?? res.players[0][5];
    x.id = p.id;
  } });
  assert.equal(g.finance.clubs.widzew.bonusDue, 500);
  assert.ok(!g.finance.clubs.legia.bonusDue);
});

test('Mnożniki rozgrywek: liga 1, finał Pucharu Polski 1,5, UEFA faza ligowa 1,5, faza pucharowa UEFA 2', () => {
  assert.equal(bonusMultiplier({ comp: 'ekstraklasa' }), 1);
  assert.equal(bonusMultiplier({ comp: 'pp', round: 'QF' }), 1);
  assert.equal(bonusMultiplier({ comp: 'pp', round: 'F' }), CONTRACT_BONUS.ppFinal);
  assert.equal(bonusMultiplier({ comp: 'super' }), 1);
  assert.equal(bonusMultiplier({ comp: 'uefa', round: 'league' }), 1.5);
  assert.equal(bonusMultiplier({ comp: 'uefa', round: 'Q2' }), 1.5);
  assert.equal(bonusMultiplier({ comp: 'uefa', round: 'R16' }), 2);
  assert.equal(bonusMultiplier({ comp: 'uefa', round: 'F' }), 2);
});
