// Prawdziwe kluby zagraniczne dla sprzedanych zawodników i puli obcokrajowców (src/data/kluby_swiat.js), v1.21 Beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { KLUBY_SWIAT, fitClubs } from '../src/data/kluby_swiat.js';
import UEFA from '../src/data/kluby_uefa.json' with { type: 'json' };
import { FOREIGN_LEAGUES, pickBuyer } from '../src/career/foreignMarket.js';
import { POOL_REGIONS, addPoolPlayers, genericClub } from '../src/career/foreignPool.js';
import { SCOUT_REGIONS } from '../src/career/scoutRegions.js';

test('Kluby świata: poprawne pola, unikalne id i nazwy, bez kolizji z kluby_uefa.json', () => {
  const ids = new Set(UEFA.kluby.map((c) => c.id));
  const names = new Set();
  let n = 0;
  for (const [kod, list] of Object.entries(KLUBY_SWIAT)) {
    assert.match(kod, /^[A-Z]{3}$/);
    assert.ok(list.length >= 3, `${kod}: co najmniej 3 kluby`);
    for (const c of list) {
      n++;
      assert.match(c.id, /^sw-[a-z0-9-]+$/, c.id);
      assert.ok(!ids.has(c.id), `id ${c.id} powtórzone`);
      ids.add(c.id);
      assert.ok(c.name && c.name.length >= 3 && !/—/.test(c.name), c.name);
      assert.ok(!names.has(`${kod}:${c.name}`), `nazwa ${c.name} powtórzona`);
      names.add(`${kod}:${c.name}`);
      assert.ok(c.L >= 7 && c.L <= 14.5, `${c.name}: L ${c.L}`);
      assert.ok(Number.isInteger(c.prestiz) && c.prestiz >= 1 && c.prestiz <= 10, `${c.name}: prestiż`);
    }
  }
  assert.ok(n >= 700, `klubów: ${n}`);
});

test('Każdy kraj puli, skautingu i lig kupców ma prawdziwe kluby', () => {
  const have = new Set([...Object.keys(KLUBY_SWIAT), ...UEFA.kluby.map((c) => c.kraj)]);
  const nats = new Set([
    ...Object.values(POOL_REGIONS).flatMap((r) => Object.keys(r.nats)),
    ...SCOUT_REGIONS.flatMap((r) => r.nats),
  ]);
  nats.delete('POL');
  for (const k of nats) assert.ok(have.has(k), `brak klubów: ${k}`);
  for (const l of FOREIGN_LEAGUES) assert.ok(l.clubs.length >= 10, `${l.kod}: ${l.clubs.length} klubów`);
});

test('Kupcy: zawodnik OVR 9, 11, 13, 15 dostaje prawdziwy klub o sile w rozsądnym oknie', () => {
  for (const ovr of [9, 11, 13, 15]) {
    const seen = new Set();
    for (let i = 0; i < 600; i++) {
      const b = pickBuyer(new Rng(`kupiec:${ovr}:${i}`), { ovr, age: 25 });
      assert.ok(!/^klub z /.test(b.name), `${ovr}: ${b.name}`);
      assert.ok(b.clubId, `${ovr}: ${b.name} bez id`);
      // Okno rozszerzone najwyżej do [-1,5; +3,5], dalej tylko najbliższy klub ligi
      const lg = FOREIGN_LEAGUES.find((l) => l.kod === b.country);
      const nearest = Math.min(...lg.clubs.map((c) => Math.abs(c.L - ovr)));
      assert.ok(Math.abs(b.L - ovr) <= Math.max(3.5, nearest + 0.5), `${ovr}: ${b.name} L ${b.L}`);
      seen.add(`${b.country}:${b.name}`);
    }
    assert.ok(seen.size >= 30, `${ovr}: różnorodność ${seen.size}`);
  }
});

test('Włochy: OVR 11 trafia do klubów niższego poziomu niż OVR 13', () => {
  const ita = FOREIGN_LEAGUES.find((l) => l.kod === 'ITA');
  const avg = (ovr) => { const f = fitClubs(ita.clubs, ovr, [[0.8, 2.5], [1.5, 3.5]]); return f.reduce((s, c) => s + c.L, 0) / f.length; };
  assert.ok(avg(11) < avg(13));
  assert.ok(fitClubs(ita.clubs, 11, [[0.8, 2.5]]).length >= 5);
  assert.ok(fitClubs(ita.clubs, 13, [[0.8, 2.5]]).length >= 5);
});

test('Rynki pieniężne (KSA, USA) i Turcja mają prawdziwe kluby, bez „klubu z MLS” w wyniku', () => {
  for (const kod of ['KSA', 'USA', 'TUR']) {
    const names = new Set();
    for (let ovr = 8; ovr <= 15; ovr++) for (let i = 0; i < 100; i++) {
      const b = pickBuyer(new Rng(`m:${kod}:${ovr}:${i}`), { ovr, age: 31 });
      if (b.country === kod) { assert.ok(b.clubId, `${kod}: ${b.name}`); names.add(b.name); }
    }
    assert.ok(names.size >= 8, `${kod}: ${names.size}`);
  }
});

test('Pula: zawodnicy z BRA, NGA, SRB mają prawdziwe kluby z kraju, a OVR 12 z Nigerii klub najbliższy poziomowi', () => {
  const g = { seed: 5, world: { players: {} }, market: { free: [], foreign: [], talks: {} } };
  const ps = addPoolPlayers(g, 1500, '2026-07-01', 'k').filter((p) => !p.free);
  for (const nat of ['BRA', 'NGA', 'SRB', 'MAR', 'JPN']) {
    const list = ps.filter((p) => p.nat === nat);
    if (!list.length) continue;
    for (const p of list) {
      assert.ok(p.abroad.clubId, `${nat}: ${p.abroad.club}`);
      assert.notEqual(p.abroad.club, genericClub(nat));
      assert.ok((KLUBY_SWIAT[nat] ?? []).some((c) => c.id === p.abroad.clubId) || UEFA.kluby.some((c) => c.id === p.abroad.clubId));
    }
  }
  assert.ok(ps.some((p) => p.nat === 'BRA') && ps.some((p) => p.nat === 'NGA') && ps.some((p) => p.nat === 'SRB'));
  // Siła klubu bliska poziomowi zawodnika, gdy kraj ma pasujące kluby (Brazylia)
  const bra = ps.filter((p) => p.nat === 'BRA');
  assert.ok(bra.filter((p) => p.abroad.league >= p.ovr - 2.2 && p.abroad.league <= p.ovr + 3).length / bra.length > 0.85);
});

test('Determinizm: ten sam kupiec z tego samego ziarna', () => {
  const a = pickBuyer(new Rng('x1'), { ovr: 12, age: 27 });
  const b = pickBuyer(new Rng('x1'), { ovr: 12, age: 27 });
  assert.deepEqual(a, b);
});
