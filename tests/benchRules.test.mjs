// Zasady składu ławki (docs/sklad-lawki.md): jeden rezerwowy bramkarz, pokrycie ról, te same zasady dla gracza i AI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { FORMATIONS } from '../src/data/formations.js';
import { createTactics, refreshTactics, autoPickBench, BENCH_ROLES } from '../src/engine/lineup.js';
import { aiPlanTactics } from '../src/match/aiPlan.js';
import { matchTactics } from '../src/match/matchday.js';
import { COMPETITIONS } from '../src/config/competitions.js';
import { isAvailable } from '../src/career/squad.js';
import { Rng } from '../src/core/rng.js';

const world = generateWorld(31);
const clubIds = [...new Set(Object.values(world.players).map((p) => p.clubId))].filter((id) => squadOf(world, id).length >= 18);

/** Kadra z jawnie wybranymi nieobecnościami (kontuzja, kartka, powołanie), bez zmiany świata. */
function scenario(clubId, seed, k) {
  const sq = squadOf(world, clubId).map((p) => ({ ...p, injuryDays: 0, suspended: 0, callUp: null }));
  const rng = new Rng(`lawka:${clubId}:${seed}`);
  for (let i = 0; i < k; i++) {
    const p = sq[rng.int(0, sq.length - 1)];
    [() => { p.injuryDays = 10; }, () => { p.suspended = 1; }, () => { p.callUp = 'POL'; }][i % 3]();
  }
  return sq;
}

function* cases() {
  for (const clubId of clubIds.slice(0, 40)) {
    for (const k of [0, 2, 4, 6]) {
      const squad = scenario(clubId, k, k);
      for (const benchSize of [7, 9, 12]) {
        const formation = FORMATIONS[(clubId.length + k + benchSize) % FORMATIONS.length].id;
        yield { clubId, k, squad, benchSize, formation, t: createTactics(squad, { formation, benchSize }) };
      }
    }
  }
}

const restOf = (squad, t) => squad.filter((p) => isAvailable(p) && !t.xi.includes(p.id) && !t.bench.includes(p.id));
const benchPlayers = (squad, t) => t.bench.map((id) => squad.find((p) => p.id === id));

test('Ławka 7 i 9: nigdy dwóch bramkarzy; ławka 12: drugi tylko, gdy nie ma już nikogo z pola', () => {
  let n = 0;
  for (const { squad, benchSize, t, clubId } of cases()) {
    const gks = benchPlayers(squad, t).filter((p) => p.pos === 'BR').length;
    if (benchSize <= 9) assert.ok(gks <= 1, `${clubId} ławka ${benchSize}: ${gks} bramkarzy`);
    if (gks >= 2) assert.ok(!restOf(squad, t).some((p) => p.pos !== 'BR'), `${clubId}: drugi bramkarz zamiast zawodnika z pola`);
    assert.ok(t.bench.length <= benchSize);
    assert.equal(new Set([...t.xi, ...t.bench]).size, t.xi.length + t.bench.length);
    n++;
  }
  assert.ok(n > 300);
});

test('Rezerwowy bramkarz zawsze, gdy jest dostępny', () => {
  for (const { squad, t, clubId } of cases()) {
    const gks = benchPlayers(squad, t).filter((p) => p.pos === 'BR').length;
    const left = squad.some((p) => isAvailable(p) && p.pos === 'BR' && !t.xi.includes(p.id));
    if (left) assert.equal(Math.min(gks, 1), 1, clubId);
  }
});

test('Pokrycie ról: ŚO, boczny obrońca, środek pomocy, skrzydło i napastnik, gdy dostępni (także ławka 7)', () => {
  for (const { squad, t, benchSize, clubId } of cases()) {
    const bench = benchPlayers(squad, t);
    const free = squad.filter((p) => isAvailable(p) && !t.xi.includes(p.id));
    for (const role of BENCH_ROLES) {
      if (!free.some((p) => role.includes(p.pos))) continue;
      assert.ok(bench.some((p) => role.includes(p.pos)), `${clubId} ławka ${benchSize}: brak roli ${role.join('/')}`);
    }
  }
});

test('Brak nominalnego ŚO: na ławkę wchodzi zawodnik, który zagra na środku obrony', () => {
  const squad = scenario(clubIds[0], 0, 0);
  const t0 = createTactics(squad, { benchSize: 9 });
  // wszyscy ŚO spoza jedenastki niedostępni
  const sq = squad.map((p) => (p.pos === 'ŚO' && !t0.xi.includes(p.id) ? { ...p, injuryDays: 5 } : p));
  const bench = autoPickBench(sq, t0.xi, 9).map((id) => sq.find((p) => p.id === id));
  assert.ok(!bench.some((p) => p.pos === 'ŚO'));
  assert.ok(bench.some((p) => p.pos === 'DP' || (p.alt?.ŚO ?? 0) >= 70), bench.map((p) => p.pos).join(' '));
  assert.equal(bench.filter((p) => p.pos === 'BR').length, 1);
});

test('Ławka powtarzalna: ten sam skład daje tę samą ławkę, kolejność kadry bez znaczenia', () => {
  for (const clubId of clubIds.slice(0, 10)) {
    const squad = scenario(clubId, 4, 4);
    const a = createTactics(squad, { benchSize: 9 });
    const b = createTactics(squad, { benchSize: 9 });
    assert.deepEqual(a.bench, b.bench);
    const c = autoPickBench([...squad].reverse(), a.xi, 9);
    assert.deepEqual([...c].sort(), [...a.bench].sort(), clubId);
  }
});

test('Gracz i AI: ta sama funkcja ławki (asystent gracza = klub AI z przeciętnym trenerem)', () => {
  for (const clubId of clubIds.slice(0, 10)) {
    const squad = scenario(clubId, 2, 2);
    for (const benchSize of [7, 9, 12]) {
      const user = createTactics(squad, { formation: '4231', benchSize });
      const ai = aiPlanTactics(squad, { formation: '4231', benchSize }).tactics;
      assert.deepEqual(ai.bench, user.bench);
      // dobry trener AI zmienia tylko instrukcje, ławka ta sama
      const good = aiPlanTactics(squad, { formation: '4231', benchSize, cq: { skl: 1 }, rng: new Rng('plan') }).tactics;
      assert.deepEqual(good.bench, user.bench);
    }
  }
});

test('Stary zapis: ręczna ławka gracza zostaje (nawet z dwoma bramkarzami), niedostępny od razu zastąpiony według zasad', () => {
  const squad = scenario(clubIds[1], 0, 0);
  const t = createTactics(squad, { benchSize: 9 });
  const free = squad.filter((p) => !t.xi.includes(p.id));
  const gks = free.filter((p) => p.pos === 'BR').slice(0, 2).map((p) => p.id);
  const others = free.filter((p) => p.pos !== 'BR' && p.pos !== 'ŚO').slice(0, 7).map((p) => p.id);
  const manual = { ...t, bench: [...gks, ...others] };
  assert.equal(manual.bench.length, 9);
  const r = refreshTactics(manual, squad, { benchSize: 9 });
  assert.deepEqual(r.tactics.bench, manual.bench);
  // jeden z ręcznie wybranych kontuzjowany: znika, a jego miejsce asystent od razu zajmuje według zasad (najpierw ŚO)
  const hurt = squad.map((p) => (p.id === others[0] ? { ...p, injuryDays: 3 } : p));
  const r2 = refreshTactics(manual, hurt, { benchSize: 9 });
  const kept = manual.bench.filter((id) => id !== others[0]);
  assert.equal(r2.tactics.bench.length, 9);
  for (const id of kept) assert.ok(r2.tactics.bench.includes(id));
  const added = squad.find((p) => p.id === r2.tactics.bench.find((id) => !kept.includes(id)));
  if (free.some((p) => p.pos === 'ŚO')) assert.equal(added.pos, 'ŚO');
  assert.ok(r2.changes.some((c) => c.includes('wchodzi na ławkę')));
});

test('Uzupełnianie od razu: wypada ŚO z ławki 9, wchodzi inny ŚO, pozostali wybrani zostają', () => {
  const squad = scenario(clubIds[3], 0, 0);
  const t = createTactics(squad, { benchSize: 9 });
  const cbs = squad.filter((p) => p.pos === 'ŚO' && !t.xi.includes(p.id));
  assert.ok(cbs.length >= 2, 'w kadrze co najmniej dwóch ŚO poza jedenastką');
  const onBench = cbs.find((p) => t.bench.includes(p.id));
  const hurt = squad.map((p) => (p.id === onBench.id ? { ...p, suspended: 1 } : p));
  const { tactics } = refreshTactics(t, hurt, { benchSize: 9 });
  assert.equal(tactics.bench.length, 9);
  assert.ok(!tactics.bench.includes(onBench.id));
  for (const id of t.bench) if (id !== onBench.id) assert.ok(tactics.bench.includes(id));
  assert.ok(benchPlayers(hurt, tactics).some((p) => p.pos === 'ŚO'));
});

test('Miejsce, którego gracz sam nie obsadził, zostaje puste (ławka 8 z 9 bez nieobecnych)', () => {
  const squad = scenario(clubIds[4], 0, 0);
  const t = createTactics(squad, { benchSize: 9 });
  const short = { ...t, bench: t.bench.slice(0, 8) };
  assert.deepEqual(refreshTactics(short, squad, { benchSize: 9 }).tactics.bench, short.bench);
});

test('Puchary UEFA: ławka 12 z dwoma rezerwowymi bramkarzami, gracz i AI tak samo; w kraju jeden', () => {
  for (const clubId of clubIds.slice(0, 20)) {
    const squad = scenario(clubId, 0, 0);
    const gkFree = squad.filter((p) => p.pos === 'BR').length - 1;
    const user = createTactics(squad, { benchSize: 12, benchGk: 2 });
    const ai = aiPlanTactics(squad, { formation: user.formation, benchSize: 12, benchGk: 2 }).tactics;
    assert.deepEqual(ai.bench, user.bench);
    const bench = benchPlayers(squad, user);
    assert.equal(bench.filter((p) => p.pos === 'BR').length, Math.min(2, gkFree), clubId);
    assert.equal(bench.length, 12);
    const free = squad.filter((p) => !user.xi.includes(p.id));
    for (const role of BENCH_ROLES) if (free.some((p) => role.includes(p.pos))) assert.ok(bench.some((p) => role.includes(p.pos)), `${clubId} ${role}`);
    const home = createTactics(squad, { benchSize: 12 });
    assert.ok(benchPlayers(squad, home).filter((p) => p.pos === 'BR').length <= 1 || !restOf(squad, home).some((p) => p.pos !== 'BR'));
  }
});

test('Krótka ławka: wybrani przez gracza zostają, asystent dobiera brakujących według zasad', () => {
  const squad = scenario(clubIds[2], 0, 0);
  const t = createTactics(squad, { benchSize: 9 });
  const free = squad.filter((p) => !t.xi.includes(p.id));
  const gk = free.find((p) => p.pos === 'BR').id;
  const nap = free.find((p) => p.pos === 'NAP')?.id;
  const manual = { ...t, bench: [gk, nap].filter(Boolean) };
  const { tactics } = refreshTactics(manual, squad, { benchSize: 9 });
  for (const id of manual.bench) assert.ok(tactics.bench.includes(id));
  const bench = benchPlayers(squad, tactics);
  assert.equal(bench.length, 9);
  assert.equal(bench.filter((p) => p.pos === 'BR').length, 1);
  if (free.some((p) => p.pos === 'ŚO')) assert.ok(bench.some((p) => p.pos === 'ŚO'));
});

test('Ławka 0 (ocena rywala w planie AI) i pusta kadra', () => {
  const squad = scenario(clubIds[0], 0, 0);
  assert.deepEqual(createTactics(squad, { benchSize: 0 }).bench, []);
  assert.deepEqual(autoPickBench([], [], 9), []);
});

test('Mecz UEFA w trybie asystenta: dwóch rezerwowych bramkarzy, mecz ligowy: jeden', () => {
  assert.equal(COMPETITIONS.uefa.benchGk, 2);
  assert.equal(COMPETITIONS.ekstraklasa.benchGk, undefined);
  const squad = scenario(clubIds[5], 0, 0);
  const game = { tactics: { ...createTactics(squad, { benchSize: 12 }), assistant: true } };
  const eu = matchTactics(game, squad, 12, COMPETITIONS.uefa.benchGk);
  assert.equal(benchPlayers(squad, eu).filter((p) => p.pos === 'BR').length, 2);
  const pl = matchTactics(game, squad, 12, COMPETITIONS.ekstraklasa.benchGk ?? 1);
  assert.equal(benchPlayers(squad, pl).filter((p) => p.pos === 'BR').length, 1);
});
