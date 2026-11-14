// Akademia: trener przenosi wychowanka do pierwszego składu (src/career/academy.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/world/worldGen.js';
import { canPromote, promoteYouth } from '../src/career/academy.js';
import { playerMenu } from '../src/ui/playerMenus.js';

const game = () => ({ seed: 5, clubId: 'widzew', date: '2026-10-20', world: generateWorld(5), inbox: [] });

test('Wychowanek przechodzi do pierwszego składu z kontraktem do 30 czerwca za 3 sezony', () => {
  const g = game();
  const club = g.world.clubs.widzew;
  const pid = club.academy.find((id) => g.world.players[id].age >= 16);
  assert.ok(pid);
  const n = club.squad.length;
  const r = promoteYouth(g, pid);
  assert.equal(r.ok, true, r.text);
  assert.ok(!club.academy.includes(pid) && club.squad.includes(pid));
  assert.equal(club.squad.length, n + 1);
  const p = g.world.players[pid];
  assert.equal(p.squad, 'A');
  assert.equal(p.contract.until, '2029-06-30');
  assert.ok(p.contract.wage > 0);
  assert.equal(promoteYouth(g, pid).ok, false, 'drugi raz nie');
});

test('Menu zawodnika z akademii: pozycja „Przenieś do pierwszego składu”; za młody wyłączony', () => {
  const g = game();
  const pid = g.world.clubs.widzew.academy[0];
  const m = playerMenu(g, pid, { view: 'squad' });
  const it = m.items.find((x) => x.label === 'Przenieś do pierwszego składu');
  assert.ok(it);
  g.world.players[pid].age = 15;
  assert.equal(canPromote(g, pid).ok, false);
  assert.ok(playerMenu(g, pid, { view: 'squad' }).items.find((x) => x.label === 'Przenieś do pierwszego składu').disabled);
  assert.equal(canPromote(g, g.world.clubs.legia.academy[0]).ok, false, 'cudza akademia');
});
