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
import { offerRejected, monthlyHazard, requestsMonth } from '../src/career/moveWish.js';

function newGame(seed = 21) {
  applySeasonState({});
  const g = { seed, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: 'widzew' }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 }); ensureCareer(g); processDay(g);
  return g;
}
const months = (a, b) => (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / (30.44 * 864e5);

test('Długość aklimatyzacji: co najmniej rok (12-16 miesięcy), stała dla zawodnika', () => {
  const g = newGame();
  for (const p of squadOf(g.world, 'widzew')) {
    for (const from of ['2026-08-20', '2027-01-25']) {
      p.lastMove = from;
      const u = acclimUntil(p);
      const m = months(from, u);
      assert.ok(m >= ACCLIM.min - 0.05 && m <= ACCLIM.max + 0.05, `${p.name}: ${m.toFixed(1)}`);
      assert.equal(acclimUntil(p), u);
    }
  }
  assert.equal(acclimUntil({ id: 'x' }), null, 'bez zmiany klubu: brak okresu');
});

test('Złamana obietnica roli kończy aklimatyzację: 3 słabe miesiące, wiadomości dla gracza, prośba możliwa', () => {
  const g = newGame();
  const p = squadOf(g.world, 'widzew')[20];
  p.lastMove = '2026-07-05';
  p.contract = { ...p.contract, signed: '2026-07-05', promise: { role: 'podstawowy', since: '2026-07-05', strikes: 0, kept: 0, broken: false } };
  p.season = { ...(p.season ?? {}), min: 0 };
  assert.ok(inAcclim(p, '2026-10-01'));
  const mails = [];
  let games = 0;
  for (const d of ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01']) {
    games += 4; // klub gra, zawodnik nie
    g.fixtures = [...Array(games)].map((_, i) => ({ played: true, home: 'widzew', away: 'lks', date: '2026-07-20', id: `x${i}` }));
    mails.push(...requestsMonth(g, d).filter((m) => String(m.key ?? '').startsWith(`obietnica:${p.id}`)));
  }
  assert.ok(p.contract.promise.broken, 'obietnica złamana');
  assert.equal(inAcclim(p, '2026-12-02'), false, 'koniec aklimatyzacji');
  assert.ok(mails.some((m) => /złamana obietnica/.test(m.subject)), mails.map((m) => m.subject).join(' | '));
  assert.ok(mails.some((m) => /przypomina o obietnicy/.test(m.subject)));
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
