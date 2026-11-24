// Okres aklimatyzacji po zmianie klubu: nowy zawodnik nie prosi o transfer po kilku kolejkach
// (src/career/wishMemory.js ACCLIM, acclimUntil; src/career/moveWish.js; docs/transfery.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { acclimUntil, inAcclim, ACCLIM } from '../src/career/wishMemory.js';
import { offerRejected, monthlyHazard } from '../src/career/moveWish.js';

function newGame(seed = 21) {
  applySeasonState({});
  const g = { seed, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: 'widzew' }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 }); ensureCareer(g); processDay(g);
  return g;
}
const months = (a, b) => (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / (30.44 * 864e5);

test('Długość aklimatyzacji: 3-8 miesięcy, zimą do końca rundy wiosennej, stała dla zawodnika', () => {
  const g = newGame();
  for (const p of squadOf(g.world, 'widzew')) {
    p.lastMove = '2026-08-20';
    const u = acclimUntil(p);
    const m = months(p.lastMove, u);
    assert.ok(m >= ACCLIM.min - 0.05 && m <= ACCLIM.max + 0.05, `${p.name}: ${m.toFixed(1)}`);
    assert.equal(acclimUntil(p), u);
    p.lastMove = '2027-01-25';
    assert.ok(acclimUntil(p) >= '2027-05-31', 'zimą cała runda wiosenna');
  }
  assert.equal(acclimUntil({ id: 'x' }), null, 'bez zmiany klubu: brak okresu');
});

test('W okresie aklimatyzacji: bez prośby z ryzyka miesięcznego i po odrzuconych ofertach (poza ofertą marzeń)', () => {
  const g = newGame();
  const base = squadOf(g.world, 'widzew').filter((p) => (p.age ?? 25) >= 21 && (p.age ?? 25) <= 27);
  let freshWish = 0; let oldWish = 0; let freshDisappointed = 0;
  for (let i = 0; i < 160; i++) {
    for (const fresh of [true, false]) {
      const p = structuredClone(base[i % base.length]);
      p.id = `${p.id}-t${i}-${fresh}`; p.clubId = 'widzew'; delete p.moveWish; delete p.wishMemory;
      p.lastMove = fresh ? '2026-08-01' : '2025-07-01';
      p.contract = { ...(p.contract ?? {}), signed: p.lastMove, wage: p.contract?.wage ?? 10000 };
      g.world.players[p.id] = p;
      const r = offerRejected(g, p, { buyerRep: 95, foreignWage: 0, date: '2026-08-20' }); // dużo większy kupiec, 3 tygodnie po podpisie
      if (fresh) { assert.ok(inAcclim(p, '2026-08-20')); if (p.moveWish) freshWish++; if (r.state === 'rozczarowany') freshDisappointed++; }
      else if (p.moveWish) oldWish++;
      if (fresh) assert.equal(monthlyHazard(p, { clubRep: 40, share: 0.1, games: 8, month: 8, date: '2026-08-20', tier: 1 }), 0);
    }
  }
  assert.ok(oldWish >= 8, `zawodnicy z długim stażem nadal proszą (${oldWish})`);
  assert.ok(freshWish <= oldWish * 0.2, `świeżo kupieni rzadko (${freshWish} wobec ${oldWish})`);
  assert.ok(freshDisappointed < 60, `rozczarowanie rzadkie (${freshDisappointed})`);
});
