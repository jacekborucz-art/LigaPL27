// Grywalna III liga (docs/iii-liga.md): kadry, terminarz 4 grup, ruchy między ligami, rezerwy, IV liga, stary zapis.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Rng } from '../src/core/rng.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, playQuick, applyResult, thirdLeagueDates, compClubIds, L3_COMPS } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { CLUBS_L3 } from '../src/data/clubs_l3.js';
import { CLUBS_L4 } from '../src/data/clubs_l4.js';
import { computeMoves, validateTiers, reserveMayPlayIn, l3GroupFor, applyLeagueState, balanceGroups } from '../src/season/leagues.js';
import { applySeasonState } from '../src/season/rollover.js';
import { ensureThirdLeague } from '../src/season/thirdLeague.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { createCup } from '../src/season/cup.js';
import { clubFinanceData } from '../src/data/finanse_klubow.js';
import { FIFA_WINDOWS } from '../src/config/calendar2026.js';
import '../src/season/dailySystems.js';

applySeasonState({});
const world = generateWorld(4);
const season = createSeason(4, { playerClub: 'wigry' });

test('Nowa gra: 72 kluby III ligi ze stałymi kadrami, 4 grupy po 18', () => {
  const l3 = CLUBS_PL.filter((c) => c.tier === 4);
  assert.equal(l3.length, 72);
  for (const g of [1, 2, 3, 4]) assert.equal(l3.filter((c) => c.group === g).length, 18, `grupa ${g}`);
  for (const c of l3) {
    const sq = squadOf(world, c.id);
    assert.equal(sq.length, 25, c.id);
    assert.ok(sq.every((p) => p.clubId === c.id && p.contract?.wage > 0), c.id);
  }
});

test('Dane właściciela: nazwy oficjalne, barwy, stadion i pojemność; id bez zmian', () => {
  const by = Object.fromEntries(CLUBS_L3.map((c) => [c.id, c]));
  assert.equal(by['ks-troszyn'].name, 'KS CK Troszyn');
  assert.equal(by['lks-lomza'].name, 'ŁKS 1926 Łomża');
  assert.equal(by['weszlo-warszawa'].name, 'KTS Weszło Warszawa');
  assert.equal(by['kks-kalisz'].name, 'KKS 1925 Kalisz');
  assert.ok(CLUBS_L3.every((c) => c.stadium && c.cap > 0 && c.colors.every((x) => /^#[0-9A-F]{6}$/.test(x))));
  assert.deepEqual(by['jagiellonia-ii'].colors, ['#FFD100', '#C8102E']); // żółto-czerwone
  assert.equal(clubFinanceData(by['widzew-ii']).pojemnosc, 18018);
});

test('Siła III ligi: najlepsza drużyna słabsza od średniej 2 Ligi', () => {
  const top = (id) => { const xs = squadOf(world, id).sort((a, b) => b.ovr - a.ovr).slice(0, 14); return xs.reduce((s, p) => s + p.ovr, 0) / xs.length; };
  const l2 = CLUBS_PL.filter((c) => c.tier === 3).map((c) => top(c.id));
  const avg2 = l2.reduce((a, b) => a + b, 0) / l2.length;
  const best3 = Math.max(...CLUBS_PL.filter((c) => c.tier === 4).map((c) => top(c.id)));
  assert.ok(best3 < avg2, `III liga ${best3.toFixed(2)} vs 2 Liga ${avg2.toFixed(2)}`);
});

test('Terminarz III ligi: 4 grupy po 34 kolejki i 306 meczów, weekendy, bez kolizji w 2 dniach', () => {
  for (const comp of L3_COMPS) {
    const fx = season.fixtures.filter((f) => f.comp === comp);
    assert.equal(fx.length, 306, comp);
    assert.equal(new Set(fx.map((f) => f.round)).size, 34);
    assert.equal(new Set(fx.map((f) => `${f.home}>${f.away}`)).size, 306);
    for (const id of compClubIds(comp)) assert.equal(fx.filter((f) => f.home === id).length, 17);
    for (let r = 2; r <= 34; r++) {
      const prev = fx.filter((f) => f.round === r - 1).map((f) => f.date).sort().pop();
      assert.ok(fx.filter((f) => f.round === r).every((f) => f.date > prev), `${comp} kolejka ${r}`);
    }
  }
  const dates = thirdLeagueDates();
  assert.equal(dates.length, 34);
  assert.ok(dates[0] >= '2026-07-31' && dates.at(-1) <= '2027-06-06');
  assert.ok(!dates.some((d) => d > '2026-11-30' && d < '2027-02-26'), 'przerwa zimowa');
  // Mecze w soboty i niedziele (środa tylko, gdy brakuje weekendów)
  const l3 = season.fixtures.filter((f) => f.comp.startsWith('liga3-'));
  const dow = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
  assert.ok(l3.filter((f) => ![0, 6].includes(dow(f.date))).length <= 9 * 4 * 3);
  void FIFA_WINDOWS;
  const by = new Map();
  for (const f of season.fixtures) for (const c of [f.home, f.away]) { if (!c) continue; if (!by.has(c)) by.set(c, []); by.get(c).push(f.date); }
  for (const [c, ds] of by) { ds.sort(); for (let i = 1; i < ds.length; i++) assert.ok((new Date(ds[i]) - new Date(ds[i - 1])) / 864e5 >= 2, `${c}: ${ds[i - 1]} ${ds[i]}`); }
});

test('Puchar Polski: klub gracza z III ligi gra w rundzie wstępnej, rezerwy nie', () => {
  const cup = createCup(CLUBS_PL.filter((c) => c.tier <= 3), CLUBS_PL.filter((c) => c.tier === 4), CLUBS_L4.filter((c) => c.tier === 5), new Rng('pp'), { playerClub: 'ks-troszyn' });
  assert.equal(cup.entrants.PRE.length, 14);
  assert.ok(cup.entrants.PRE.includes('ks-troszyn'));
  assert.ok(cup.entrants.PRE.every((id) => !clubById(id)?.parent && !CLUBS_L4.find((c) => c.id === id)?.parent));
  assert.ok(season.cup.entrants.PRE.includes('wigry'));
});

/** Tabele na sztywno: kolejność z danych (grupa III ligi wg siły). */
function fakeTables() {
  const t = (tier) => CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id);
  const groupTables = Object.fromEntries([1, 2, 3, 4].map((g) => [g, CLUBS_PL.filter((c) => c.tier === 4 && c.group === g).sort((a, b) => b.L - a.L || a.id.localeCompare(b.id)).map((c) => c.id)]));
  return { tables: { 1: t(1), 2: t(2), 3: t(3) }, groupTables };
}

test('Koniec sezonu (stary zapis bez IV ligi, D1): po 18 w ligach 1-3 i w każdej grupie III ligi, IV liga uzupełnia grupy z województw', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const { tables, groupTables } = fakeTables();
    const m = computeMoves(tables, {}, groupTables, new Rng(`ruchy:${seed}`));
    const tiers = Object.fromEntries(Object.entries(m.tiers).filter(([, t]) => t <= 4));
    assert.deepEqual(validateTiers(tiers, m.groups), [], seed);
    // Zwycięzcy grup awansują (pierwsi uprawnieni), co najmniej miejsca 15-18 spadają
    for (const g of [1, 2, 3, 4]) {
      const first = groupTables[g].find((id) => !clubById(id).parent || reserveMayPlayIn(3, m.tiers[clubById(id).parent]));
      assert.equal(m.tiers[first], 3, `zwycięzca grupy ${g}`);
      for (const id of groupTables[g].slice(14)) assert.equal(m.tiers[id], 5, `${id} spada`);
    }
    assert.ok(m.promoted[4].length >= 16);
    for (const id of m.promoted[4]) {
      const c = CLUBS_L4.find((x) => x.id === id);
      assert.ok(c, id);
      assert.equal(c.l3group, m.groups[id], `${id}: grupa z województwa`);
    }
    // Baraż symulowany (bez meczów): zwycięzca z wicemistrzów albo z 13.-14. miejsca 2 Ligi
    assert.equal(m.l3Playoff.length, 2);
    for (const x of m.l3Playoff) assert.ok([x.keeper, x.challenger].includes(x.winner));
  }
});

test('Koniec sezonu w karierze z IV ligą (docs/iv-liga.md): dokładnie 4 mistrzów województw na grupę III ligi, baraż przy wolnym miejscu', async () => {
  const { loadLevel6 } = await import('../src/data/level6.js');
  const F = await import('../src/season/fourthLeague.js');
  const { VOIVODESHIPS } = await import('../src/data/voivodeships.js');
  await loadLevel6();
  const g = { seed: 12, clubId: null, season: createSeason(12, { l4Seed: 12 }) };
  F.playFourthLeagueUntil(g, '2027-06-30');
  const l4 = F.fourthLeagueResults(g);
  for (const seed of ['a', 'b']) {
    const { tables, groupTables } = fakeTables();
    const m = computeMoves(tables, {}, groupTables, new Rng(`ruchy:${seed}`), { l4 });
    assert.deepEqual(validateTiers(Object.fromEntries(Object.entries(m.tiers).filter(([, t]) => t <= 4)), m.groups), [], seed);
    for (const g3 of [1, 2, 3, 4]) {
      const champs = VOIVODESHIPS.filter((v) => v.l3group === g3).map((v) => l4.tables[v.key].find(F.l4Eligible));
      assert.equal(champs.length, 4);
      for (const id of champs) { assert.equal(m.tiers[id], 4, id); assert.equal(m.groups[id], g3, `${id}: grupa z województwa`); }
      // Bez zwycięzców baraży IV ligi (brak meczów baraży): z IV ligi tylko 4 mistrzów, chyba że brakuje miejsc do 18
      const fromL4 = m.promoted[4].filter((id) => m.groups[id] === g3);
      assert.deepEqual(fromL4.sort(), champs.slice().sort(), `grupa ${g3}`);
    }
    assert.equal(m.l4Up.length, 16);
  }
  applySeasonState({});
});

test('Spadkowicze z 2 Ligi trafiają do grupy swojego województwa, grupa odsyła więcej do IV ligi', () => {
  const { tables, groupTables } = fakeTables();
  // 2 Liga: cztery ostatnie miejsca to kluby z jednego regionu (Kraków/Małopolska: grupa IV)
  const south = ['hutnik', 'podhale', 'sandecja'].filter((id) => tables[3].includes(id));
  const t3 = [...tables[3].filter((id) => !south.includes(id)), ...south];
  const m = computeMoves({ ...tables, 3: t3 }, {}, groupTables, new Rng('region'));
  for (const id of south) assert.equal(m.groups[id], l3GroupFor(clubById(id)));
  const down4 = groupTables[4].filter((id) => m.tiers[id] === 5).length;
  assert.ok(down4 > 4, `grupa IV: ${down4} spadków (zmienna liczba: więcej spadkowiczów z 2 Ligi w grupie)`);
  assert.deepEqual(validateTiers(Object.fromEntries(Object.entries(m.tiers).filter(([, t]) => t <= 4)), m.groups), []);
});

test('Rezerwy: nie awansują na poziom pierwszej drużyny, następny klub zajmuje ich miejsce', () => {
  const { tables, groupTables } = fakeTables();
  // Śląsk (pierwsza drużyna rezerw z 2 Ligi) w 2 Lidze: rezerwy III ligi z tą samą pierwszą drużyną nie mogą wejść do 2 Ligi
  const res = CLUBS_PL.find((c) => c.tier === 4 && c.parent);
  const parent = res.parent;
  const g = res.group;
  // rodzic w 2 Lidze (zamiast pierwszego klubu 2 Ligi), rezerwy na 1. miejscu grupy
  const t1 = tables[1].filter((x) => x !== parent); const t2 = tables[2].filter((x) => x !== parent);
  const t3 = [parent, ...tables[3].slice(1)];
  const fill = (arr, from) => [...arr, ...from.filter((x) => !arr.includes(x))].slice(0, 18);
  const tt = { 1: fill(t1, tables[2]), 2: fill(t2.filter((x) => !t1.includes(x)), tables[3].slice(1)), 3: t3 };
  const gt = { ...groupTables, [g]: [res.id, ...groupTables[g].filter((x) => x !== res.id)] };
  const m = computeMoves(tt, {}, gt, new Rng('rez'));
  if (m.tiers[parent] >= 3) {
    assert.notEqual(m.tiers[res.id], 3, 'rezerwy nie w lidze pierwszej drużyny');
    assert.equal(m.tiers[gt[g][1]], 3, 'awansuje następny klub');
  }
  assert.ok(!reserveMayPlayIn(3, 3) && reserveMayPlayIn(4, 3) && reserveMayPlayIn(3, 2));
});

test('Stary zapis bez III ligi: kadry, finanse, terminarz grup i tabele z rozegranymi kolejkami', () => {
  const file = '/tmp/claude-0/-home-user-manager-pilkarski/584043b7-e82f-5eaa-9098-3a9c71e14a63/scratchpad/save-oct.json';
  let g;
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    g = raw.game ?? raw;
  } else {
    // Zapis „sprzed” III ligi zbudowany na miejscu: bez kadr III ligi i bez jej meczów
    g = { seed: 9, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
    g.world = generateWorld(9); g.season = createSeason(9, { playerClub: 'widzew' }); g.fixtures = g.season.fixtures;
    for (const c of CLUBS_PL.filter((x) => x.tier === 4)) { for (const id of [...g.world.clubs[c.id].squad, ...g.world.clubs[c.id].academy]) delete g.world.players[id]; delete g.world.clubs[c.id]; }
    g.fixtures = g.fixtures.filter((f) => !f.comp.startsWith('liga3-')); g.season.fixtures = g.fixtures;
    g.date = '2026-10-20';
  }
  applySeasonState(g);
  assert.ok(!g.fixtures.some((f) => f.comp.startsWith('liga3-')));
  const r = ensureThirdLeague(g);
  ensureCareer(g);
  assert.equal(r.squads, 72);
  assert.equal(r.fixtures, 4 * 306);
  for (const c of CLUBS_PL.filter((x) => x.tier === 4)) {
    assert.ok(squadOf(g.world, c.id).length >= 22, c.id);
    assert.ok(g.finance.clubs[c.id]?.plan, c.id);
  }
  const past = g.fixtures.filter((f) => f.comp.startsWith('liga3-') && f.date < g.date);
  assert.ok(past.length > 0 && past.every((f) => f.played && f.result));
  assert.ok(g.fixtures.filter((f) => f.comp.startsWith('liga3-') && f.date >= g.date).every((f) => !f.played));
  assert.equal(ensureThirdLeague(g), null, 'drugie wczytanie nic nie zmienia');
  for (let i = 0; i < 4; i++) { g.date = addDays(g.date, 1); processDay(g); }
  // Wyniki i JSON
  assert.ok(JSON.parse(JSON.stringify(g)).fixtures.length === g.fixtures.length);
  applySeasonState({});
});

test('Stary zapis po sezonie: grupy wyrównane do 18 (spadkowicze z 2 Ligi z losową grupą)', () => {
  const S = { tiers: {}, groups: {} };
  // 4 spadkowicze z 2 Ligi w grupie I i 4 awanse z grupy III (jak w zapisie sprzed grywalnej III ligi)
  const down = CLUBS_PL.filter((c) => c.tier === 3 && !c.parent).slice(0, 4).map((c) => c.id);
  const up = CLUBS_PL.filter((c) => c.tier === 4 && c.group === 3 && !c.parent).slice(0, 4).map((c) => c.id);
  for (const id of down) { S.tiers[id] = 4; S.groups[id] = 1; }
  for (const id of up) S.tiers[id] = 3;
  const moved = balanceGroups(S);
  assert.ok(moved >= 4);
  applyLeagueState({ leagueState: S });
  for (const g of [1, 2, 3, 4]) assert.equal(CLUBS_PL.filter((c) => c.tier === 4 && c.group === g).length, 18, `grupa ${g}`);
  applySeasonState({});
});

test('Sezon z klubem z III ligi: baraże rozegrane w terminarzu, mecz gracza w grupie', () => {
  applySeasonState({});
  const g = { seed: 12, clubId: 'wigry', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(12); g.season = createSeason(12, { playerClub: 'wigry' }); g.fixtures = g.season.fixtures;
  ensureCareer(g); processDay(g);
  while (g.date < '2027-06-25') {
    for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === g.clubId || x.away === g.clubId))) { const rng = new Rng(`g:${f.id}`); applyResult(g, f, playQuick(g, f, rng), rng); }
    for (const m of g.inbox.filter((x) => !x.resolved && x.actions?.length && !x.optional)) m.resolved = true;
    g.date = addDays(g.date, 1); processDay(g);
  }
  const mine = g.fixtures.filter((f) => f.comp === 'liga3-1' && (f.home === 'wigry' || f.away === 'wigry'));
  assert.equal(mine.length, 34);
  assert.ok(mine.every((f) => f.played));
  const po = g.fixtures.filter((f) => f.comp === 'playoff-liga3');
  assert.equal(po.length, 6, 'dwa półfinały i dwa dwumecze');
  assert.ok(po.every((f) => f.played));
  const ties = g.season.playoffs.liga3.ties;
  for (const t of ties) assert.ok([t.keeper, t.challenger].includes(g.season.playoffs.winners[`${t.id}-2`]));
  const leg2 = po.filter((f) => f.leg === 2);
  assert.ok(leg2.every((f) => Array.isArray(f.knockout.firstLeg)));
  applySeasonState({});
});
