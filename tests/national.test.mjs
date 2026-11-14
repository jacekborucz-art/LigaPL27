import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/world/worldGen.js';
import { addDays } from '../src/core/gameLoop.js';
import { isAvailable } from '../src/career/squad.js';
import { createNational, nationalDay, lnGroupTable, euroGroupTable } from '../src/season/national.js';

function run(seed, until = '2027-06-20', onDay) {
  const world = generateWorld(seed);
  const N = createNational(seed);
  for (let d = '2026-07-01'; d <= until; d = addDays(d, 1)) { nationalDay(N, d, world.players); onDay?.(d, world, N); }
  return { N, world };
}

test('Liga Narodów: każda drużyna gra 6 meczów w grupie (liga D: 4), potem faza pucharowa i Final Four', () => {
  const { N } = run(1);
  for (const g of Object.keys(N.ln.groups)) {
    for (const r of lnGroupTable(N, g)) assert.equal(r.p, g.startsWith('D') ? 4 : 6, `${g} ${r.id}`);
  }
  assert.equal(N.ln.ko.qf.length, 4);
  assert.equal(N.ln.ko.ab.length, 4);
  assert.equal(N.ln.ko.bc.length, 4);
  assert.ok(N.ln.champion);
  assert.equal(Object.values(N.matches).filter((m) => m.date <= '2027-06-20' && !m.played).length, 0);
});

test('Eliminacje Euro 2028: 12 grup, 54 drużyny, każda raz; grupy 4-zespołowe dla grających w marcu w LN', () => {
  const { N } = run(2);
  const all = Object.values(N.euro.groups).flat();
  assert.equal(Object.keys(N.euro.groups).length, 12);
  assert.equal(all.length, 54);
  assert.equal(new Set(all).size, 54);
  const march = new Set(Object.values(N.matches).filter((m) => ['LNQF', 'LNAB', 'LNBC'].includes(m.comp)).flatMap((m) => [m.home, m.away]));
  for (const [g, teams] of Object.entries(N.euro.groups)) {
    if (teams.length === 4) assert.ok(teams.every((t) => march.has(t)), g);
    const rows = euroGroupTable(N, g);
    assert.equal(rows.length, teams.length);
  }
});

test('Powołania: zawodnik niedostępny dla klubu tylko w czasie okna, wraca zmęczony, jedna kadra na okno', () => {
  let checked = 0;
  run(3, '2026-10-10', (d, world, N) => {
    const st = N.windows['2026-09-21'];
    if (d === '2026-09-25') {
      assert.equal(st.status, 'active');
      assert.ok(st.list.length > 5);
      assert.equal(new Set(st.list.map((c) => c.id)).size, st.list.length);
      for (const c of st.list) assert.equal(isAvailable(world.players[c.id]), false);
      checked++;
    }
    if (d === '2026-10-07') {
      assert.equal(st.status, 'done');
      for (const c of st.list) assert.ok(!world.players[c.id].callUp);
      assert.ok(st.list.some((c) => world.players[c.id].intl?.caps > 0));
      checked++;
    }
  });
  assert.equal(checked, 2);
});

test('Czerwiec 2027: drużyny z turnieju finałowego LN nie grają w tych samych dniach eliminacji Euro (grupy po 4 jesienią)', () => {
  const { N } = run(31, '2027-12-31');
  const ms = Object.values(N.matches).filter((m) => m.date >= '2027-01-01' && m.date <= '2027-12-31');
  for (const [g, teams] of Object.entries(N.euro.groups)) {
    if (teams.length !== 4) continue;
    const gm = ms.filter((m) => m.comp === 'EQ' && m.group === g);
    assert.equal(gm.length, 12, `grupa ${g}`);
    assert.ok(gm.every((m) => m.date >= '2027-09-01'), `grupa ${g}: mecze od września`);
  }
  // żadna drużyna nie gra dwóch meczów w odstępie krótszym niż 2 dni
  const byTeam = {};
  for (const m of ms) for (const t of [m.home, m.away]) (byTeam[t] ??= []).push(m.date);
  const day = (d) => Date.parse(`${d}T12:00:00Z`) / 86400000;
  for (const [t, ds] of Object.entries(byTeam)) {
    ds.sort();
    for (let i = 1; i < ds.length; i++) assert.ok(day(ds[i]) - day(ds[i - 1]) >= 2, `${t}: ${ds[i - 1]} i ${ds[i]}`);
  }
});
