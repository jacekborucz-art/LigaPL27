// Kod pozycji bocznego pomocnika: BP (dawniej SP, mylony ze ŚP). Migracja starych zapisów i datapacków.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSITIONS, migratePosCodes, normPos, POS_CODES_V } from '../src/engine/positions.js';
import { POS_NAMES } from '../src/data/attributes.js';
import { FORMATIONS } from '../src/data/formations.js';
import { parsePack, PACK_TYPE } from '../src/career/editor.js';

test('boczny pomocnik ma kod BP, kodu SP nie ma wśród pozycji', () => {
  assert.ok(POSITIONS.includes('BP'));
  assert.ok(!POSITIONS.includes('SP'));
  assert.equal(POS_NAMES.BP, 'Boczny pomocnik');
  assert.equal(POS_NAMES.SP, undefined);
  for (const f of FORMATIONS) for (const s of f.slots) assert.notEqual(s.pos, 'SP', f.id);
});

test('migracja zapisu: pozycje SP -> BP, stałe fragmenty i id meczów bez zmian', () => {
  const g = {
    seed: 1,
    world: { players: {
      a: { id: 'a', pos: 'SP', side: 'L', alt: { SP: 70 }, training: { pos: 'SP', focus: null } },
      b: { id: 'b', pos: 'BO', alt: { WB: 80, SP: 75 }, training: { pos: null } },
    } },
    market: { history: [{ playerId: 'a', pos: 'SP', from: 'x', to: 'y' }] },
    training: { reports: [{ rows: [{ id: 'a', pos: 'SP' }] }] },
    editor: { players: { a: { pos: 'SP' } } },
    sums: { SP: { n: 1 }, ŚP: { n: 2 } },
    fixtures: [{ id: 'SP-2026', comp: 'super' }, { id: 'SP-2026-07-02-x', comp: 'friendly' }],
    live: { events: [{ type: 'shotOn', kind: 'SP' }, { type: 'sub', outPos: 'SP', inPos: 'NAP' }], plan: { drop: ['NAP', 'SP'] } },
    table: [{ id: 'x', pos: 3 }],
    inbox: [{ body: 'Jan Kowalski (SP): Legia -> Lech' }, { body: 'Ofert za Jana (SP, 21 lat)' }, { body: 'Mecz SP-2026' }],
  };
  const n = migratePosCodes(g);
  assert.ok(n > 0);
  const P = g.world.players;
  assert.equal(P.a.pos, 'BP');
  assert.deepEqual(P.a.alt, { BP: 70 });
  assert.equal(P.a.training.pos, 'BP');
  assert.deepEqual(Object.keys(P.b.alt), ['WB', 'BP']);
  assert.equal(g.market.history[0].pos, 'BP');
  assert.equal(g.training.reports[0].rows[0].pos, 'BP');
  assert.equal(g.editor.players.a.pos, 'BP');
  assert.deepEqual(Object.keys(g.sums), ['BP', 'ŚP']);
  assert.equal(g.fixtures[0].id, 'SP-2026');
  assert.equal(g.fixtures[1].id, 'SP-2026-07-02-x');
  assert.equal(g.live.events[0].kind, 'SP');
  assert.equal(g.live.events[1].outPos, 'BP');
  assert.deepEqual(g.live.plan.drop, ['NAP', 'BP']);
  assert.equal(g.table[0].pos, 3);
  assert.equal(g.inbox[0].body, 'Jan Kowalski (BP): Legia -> Lech');
  assert.equal(g.inbox[1].body, 'Ofert za Jana (BP, 21 lat)');
  assert.equal(g.inbox[2].body, 'Mecz SP-2026');
  assert.equal(g.posCodes, POS_CODES_V);
  // jednorazowo: druga migracja nic nie robi
  g.world.players.a.pos = 'SP';
  assert.equal(migratePosCodes(g), 0);
  assert.equal(g.world.players.a.pos, 'SP');
});

test('datapack ze starym kodem SP: zawodnik dostaje BP', () => {
  assert.equal(normPos('SP'), 'BP');
  assert.equal(normPos('ŚP'), 'ŚP');
  const pack = parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, seed: 7, players: { p1: { pos: 'SP' }, p2: { pos: 'BP' } } }));
  assert.equal(pack.players.p1.pos, 'BP');
  assert.equal(pack.players.p2.pos, 'BP');
});
