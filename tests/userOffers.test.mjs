// Oferty klubów AI za zawodników z listy transferowej gracza: okazja przyciąga chętnych, za drogo odstrasza
// (src/career/transfers.js aiOffersForUser, USER_OFFERS; docs/transfery.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { marketWeek, USER_OFFERS } from '../src/career/transfers.js';
import '../src/season/dailySystems.js';

function newGame(seed) {
  applySeasonState({});
  const g = { seed, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: 'widzew' }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 }); ensureCareer(g); processDay(g);
  return g;
}
const MONDAYS = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17'];

/** Liczba ofert z Polski za 3 dobrych zawodników wystawionych za mult x wartość (każda oferta od razu odrzucona). */
function offersAt(seed, mult) {
  const g = newGame(seed);
  const good = squadOf(g.world, 'widzew').sort((a, b) => b.ovr - a.ovr).slice(2, 5);
  for (const p of good) g.market.userListed[p.id] = Math.round(p.value * mult);
  const fees = [];
  for (const d of MONDAYS) {
    g.date = d;
    for (const o of marketWeek(g, d).offers) { if (good.some((p) => p.id === o.playerId)) fees.push(o.fee / g.market.userListed[o.playerId]); o.status = 'rejected'; }
  }
  return fees;
}

test('Okazja przyciąga więcej ofert niż cena powyżej wartości; za okazję kluby płacą co najmniej cenę z listy', () => {
  let cheap = 0; let dear = 0; const cheapFees = [];
  for (const seed of [3, 7, 11]) { const c = offersAt(seed, 0.7); cheap += c.length; cheapFees.push(...c); dear += offersAt(seed, 1.3).length; }
  assert.ok(cheap > dear * 1.5, `70 %: ${cheap}, 130 %: ${dear}`);
  assert.ok(cheap >= 9, `dobrzy zawodnicy ze zniżką dostają oferty (${cheap})`);
  assert.ok(cheapFees.every((f) => f >= 0.999), `oferty za okazję >= cena (${cheapFees.map((f) => f.toFixed(2)).join(' ')})`);
  assert.ok(USER_OFFERS.cap <= 0.7 && USER_OFFERS.openMax >= 4);
});
