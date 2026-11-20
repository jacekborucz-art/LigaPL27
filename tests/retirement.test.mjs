// Koniec kariery: ogłoszenie 1 marca i prawdziwe minuty (src/career/retirement.js, docs/PLAN.md 2.5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/world/worldGen.js';
import { announceRetirements, minutesShares } from '../src/career/retirement.js';
import { openNegotiation } from '../src/career/negotiation.js';
import { Rng } from '../src/core/rng.js';

const game = () => ({ seed: 9, clubId: 'widzew', date: '2027-03-01', world: generateWorld(9), inbox: [] });

test('Udział w grze z prawdziwych minut: najwięcej grający ma 1, bez minut 0,5', () => {
  const g = game();
  const ids = g.world.clubs.widzew.squad;
  assert.equal(minutesShares(g, 'widzew')[ids[0]], 0.5, 'brak danych');
  g.world.players[ids[0]].season = { min: 2000 }; g.world.players[ids[1]].season = { min: 500 };
  const s = minutesShares(g, 'widzew');
  assert.equal(s[ids[0]], 1); assert.equal(s[ids[1]], 0.25); assert.equal(s[ids[2]], 0);
});

test('1 marca: zawodnik kończący kontrakt ogłasza koniec kariery, wiadomość tylko dla klubu gracza, decyzja raz', () => {
  const g = game();
  const [a, b] = g.world.clubs.widzew.squad.map((id) => g.world.players[id]);
  a.age = 40; a.contract.until = '2027-06-30'; // od 40 lat koniec kariery pewny
  b.age = 40; b.contract.until = '2028-06-30'; // kontrakt dłuższy: decyduje na koniec sezonu, nie 1 marca
  const o = g.world.players[g.world.clubs.legia.squad[0]]; o.age = 40; o.contract.until = '2027-06-30';
  const msgs = announceRetirements(g, '2027-03-01');
  assert.ok(a.retiring && !b.retiring && o.retiring);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].subject, /po sezonie kończy karierę/);
  assert.equal(announceRetirements(g, '2027-03-01').length, 0, 'bez powtórki');
  const r = openNegotiation({ kind: 'renew', player: a, club: { id: 'widzew', tier: 1, prestige: 7, L: 11.5 }, date: '2027-03-02', rng: new Rng('x'), ctx: {} });
  assert.match(r.text ?? '', /kończy karierę/);
});
