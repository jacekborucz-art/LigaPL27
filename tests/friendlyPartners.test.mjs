// Rywale sparingów: dłuższa lista (do 16 polskich i 8 zagranicznych), wyższe ligi i kluby z regionu,
// zagranica tylko dla Ekstraklasy i 1 Ligi (poza obozem); src/training/friendlies.js friendlyOpponents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { friendlyDates, friendlyOpponents } from '../src/training/friendlies.js';
import { clubById } from '../src/data/clubs_pl.js';
import { FRIENDLY } from '../src/training/config.js';

function newGame(clubId) {
  const g = { seed: 21, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(21); g.season = createSeason(21, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 9 }); ensureCareer(g);
  return g;
}

test('Ekstraklasa: do 16 polskich (także z niższych lig i regionu) i do 8 zagranicznych', () => {
  const g = newGame('widzew');
  const l = friendlyOpponents(g, friendlyDates(g)[2].date);
  const pl = l.filter((o) => !o.foreign); const fo = l.filter((o) => o.foreign);
  assert.ok(pl.length > 6 && pl.length <= FRIENDLY.maxPolish, `polskie ${pl.length}`);
  assert.ok(fo.length > 4 && fo.length <= FRIENDLY.maxForeign, `zagraniczne ${fo.length}`);
  assert.ok(pl.some((o) => clubById(o.id).tier > 1), 'kluby z niższych lig');
  assert.ok(!fo.some((o) => /Białoruś/.test(o.where)), 'bez klubów z Białorusi');
  assert.equal(new Set(l.map((o) => o.id)).size, l.length);
});

test('III liga: wyższa liga tylko o jedną albo z regionu, bez rywali z zagranicy poza obozem', () => {
  const g = newGame('chelmianka');
  const me = clubById('chelmianka');
  const l = friendlyOpponents(g, friendlyDates(g)[2].date);
  assert.ok(l.length > 6, `rywale ${l.length}`);
  for (const o of l) {
    const c = clubById(o.id);
    assert.ok(!o.foreign, `${o.name}: zagranica tylko dla Ekstraklasy i 1 Ligi`);
    assert.ok(c.tier >= me.tier - 1 || c.region === me.region, `${o.name}: liga ${c.tier}`);
  }
});

test('Obóz za granicą w kolejnych sezonach: polskie kluby na obozie i goście z niższej europejskiej półki dla słabszego', async () => {
  const { applySeasonState } = await import('../src/season/rollover.js');
  const { campWindow } = await import('../src/training/camps.js');
  for (const y of [2026, 2029]) {
    applySeasonState({ seasonYear: y });
    for (const club of ['chelmianka', 'arka']) {
      const g = newGame(club); g.seasonYear = y; g.date = `${y + 1}-01-05`;
      const w = campWindow(g, 'winter');
      g.training.camps = [{ half: 'winter', key: w.key, dest: 'turcja', from: `${y + 1}-02-09`, to: `${y + 1}-02-15`, days: 7 }];
      const l = friendlyOpponents(g, `${y + 1}-02-12`);
      assert.ok(l.filter((o) => !o.foreign).length >= 4, `${club} ${y}: polskie kluby na obozie`);
      assert.ok(l.filter((o) => o.foreign).length >= 4, `${club} ${y}: goście z zagranicy`);
      if (club === 'chelmianka') assert.ok(l.filter((o) => o.foreign && /Dużo silniejszy/.test(o.level)).length <= 1, 'najwyżej jeden wyraźnie silniejszy');
    }
  }
  applySeasonState({ seasonYear: 2026 });
});
