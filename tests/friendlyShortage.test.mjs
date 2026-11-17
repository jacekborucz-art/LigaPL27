// Sparing bez 11 zawodników z bramkarzem (powołania do reprezentacji, kontuzje) w dniu meczu jest odwoływany.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { createFinance } from '../src/career/finance.js';
import '../src/season/dailySystems.js';
import * as TR from '../src/training/index.js';
import { friendlyShortage, cancelShortFriendlies } from '../src/training/friendlies.js';

function newGame(clubId = 'widzew', seed = 2026) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.finance = createFinance(g.world);
  g.tactics = createTactics(squadOf(g.world, g.clubId), { benchSize: 12 });
  processDay(g);
  return g;
}
function planFriendly(g) {
  for (const d of TR.friendlyDates(g, { days: 40, limit: 40 })) {
    for (const o of TR.friendlyOpponents(g, d.date)) {
      const r = TR.createFriendly(g, d.date, o.id);
      if (r.ok) return r.fixture;
    }
  }
  throw new Error('brak terminu sparingu');
}

test('Sparing: pełna kadra gra, 9 dostępnych po powołaniach odwołuje mecz z wiadomością, bez bramkarza też', () => {
  const g = newGame();
  const f = planFriendly(g);
  assert.equal(friendlyShortage(g, f), null);
  const squad = squadOf(g.world, g.clubId);
  // Powołania: zostaje 9 zawodników (w tym bramkarz)
  const keep = new Set([squad.find((p) => p.pos === 'BR').id, ...squad.filter((p) => p.pos !== 'BR').slice(0, 8).map((p) => p.id)]);
  for (const p of squad) if (!keep.has(p.id)) p.callUp = { team: 'POL', from: f.date, to: f.date };
  assert.deepEqual(friendlyShortage(g, f), { n: 9, gk: true });
  assert.equal(cancelShortFriendlies(g, '2000-01-01').length, 0, 'inny dzień: bez zmian');
  const msgs = cancelShortFriendlies(g, f.date);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].subject, /^Sparing odwołany/);
  assert.match(msgs[0].body, /tylko 9 zawodników/);
  assert.ok(!g.fixtures.some((x) => x.id === f.id), 'sparing usunięty z terminarza');
  assert.ok(!/undefined|NaN|—/.test(msgs[0].body + msgs[0].subject));

  // Bez bramkarza: 11 zawodników z pola to za mało
  for (const p of squad) delete p.callUp;
  const f2 = planFriendly(g);
  for (const p of squad) if (p.pos === 'BR') p.injuryDays = 10;
  assert.equal(friendlyShortage(g, f2).gk, false);
  for (const p of squad) if (p.pos === 'BR') p.injuryDays = 0;

  // Gracz może odwołać sparing także w dniu meczu (przed rozpoczęciem), po dniu meczu już nie
  const today = g.date;
  g.date = f2.date;
  assert.ok(TR.cancelFriendly(g, f2.id).ok);
  const f3 = { ...f2, id: 'SP-test-old', date: today };
  g.fixtures.push(f3);
  assert.equal(TR.cancelFriendly(g, f3.id).ok, false);
});
