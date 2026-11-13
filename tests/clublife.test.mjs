import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays, forgetMessages } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { createMessage, pruneInbox, canDelete } from '../src/core/inbox.js';
import { evaluate } from '../src/engine/modifiers.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { completeTransfer, addFreeAgents } from '../src/career/transfers.js';
import { acclimPlan } from '../src/career/acclimatization.js';
import { holdMeeting, canHoldMeeting, talkToPlayer, TALK_COOLDOWN } from '../src/career/teamTalks.js';
import '../src/season/dailySystems.js';

function newGame(clubId, seed) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  return g;
}
const msg = (date, o = {}) => createMessage({ date, category: 'staff', from: 'Test', subject: 's', body: 'b', ...o });

test('Poczta: porządki nie ruszają decyzji, usunięta wiadomość nie wraca', () => {
  const inbox = [
    { ...msg('2026-07-01', { key: 'a' }), read: true },
    { ...msg('2026-07-01', { key: 'b', actions: [{ id: 'x', label: 'X' }] }) },
    { ...msg('2026-09-01', { key: 'c' }), read: true },
    { ...msg('2026-07-02', { key: 'd', priority: 'urgent' }) },
  ];
  const r = pruneInbox(inbox, '2026-09-10', 'old', 30);
  assert.deepEqual(r.inbox.map((m) => m.key), ['b', 'c', 'd']);
  assert.ok(!canDelete(inbox[1]) && !canDelete(inbox[3]));
  const g = newGame('widzew', 41);
  g.inbox = inbox;
  forgetMessages(g, r);
  g.date = '2026-09-10';
  // Ten sam klucz wysłany ponownie przez system nie wraca do skrzynki
  const before = g.inbox.length;
  g.inbox = g.inbox; processDay(g);
  assert.ok(!g.inbox.some((m) => m.key === 'a'));
  assert.ok(g.inbox.length >= before);
});

test('Automatyczne porządki: stare przeczytane informacje znikają po 45 dniach', () => {
  const inbox = [{ ...msg('2026-07-01', { key: 'x' }), read: true }, { ...msg('2026-08-20', { key: 'y' }), read: true }];
  const r = pruneInbox(inbox, '2026-09-01', 'auto');
  assert.deepEqual(r.inbox.map((m) => m.key), ['y']);
  assert.deepEqual(r.removed, ['x']);
});

test('Aklimatyzacja: transfer z Polski krótszy niż z zagranicy, daleka kultura najdłuższa; kara znika z czasem', () => {
  const g = newGame('widzew', 42);
  const p = squadOf(g.world, 'piast')[10];
  const dom = acclimPlan(g, p, { fromAbroad: false, date: '2026-07-10', clubId: 'widzew' }).days;
  const eu = acclimPlan(g, { ...p, nat: 'ESP' }, { fromAbroad: true, date: '2026-07-10', clubId: 'widzew' }).days;
  const far = acclimPlan(g, { ...p, nat: 'BRA' }, { fromAbroad: true, date: '2026-07-10', clubId: 'widzew' }).days;
  const slav = acclimPlan(g, { ...p, nat: 'SVK' }, { fromAbroad: true, date: '2026-07-10', clubId: 'widzew' }).days;
  assert.ok(dom < slav && slav < eu && eu < far, `${dom} ${slav} ${eu} ${far}`);
  completeTransfer(g, { playerId: p.id, to: 'widzew', fee: 100000, contract: { wage: 5000, until: '2029-06-30' } });
  g.date = addDays(g.date, 1); processDay(g);
  assert.ok(p.acclim && p.acclim.level < 50);
  const pen0 = evaluate('player', p, {}).parts.acclim;
  assert.ok(pen0 < -0.2);
  for (let i = 0; i < 80 && p.acclim; i++) { g.date = addDays(g.date, 1); processDay(g); }
  assert.ok(!p.acclim, 'po ok. 6 tygodniach zaaklimatyzowany');
  assert.equal(evaluate('player', p, {}).parts.acclim, 0);
});

test('Aklimatyzacja: zawodnik z zagranicy (wolny) startuje niżej', () => {
  const g = newGame('legia', 43);
  addFreeAgents(g, 5, g.date, 'test-import', { imports: true });
  const id = g.market.free.find((x) => x.startsWith('wolny-test-import'));
  completeTransfer(g, { playerId: id, to: 'legia', fee: 0, contract: { wage: 20000, until: '2028-06-30' }, kind: 'free' });
  g.date = addDays(g.date, 1); processDay(g);
  const p = g.world.players[id];
  assert.ok(p.acclim.level < 20);
  assert.ok(p.acclim.reasons.includes('Przyjazd z zagranicy'));
});

test('Zebranie drużyny: raz w tygodniu, pochwała po dobrej serii działa lepiej niż po słabej', () => {
  const run = (results) => {
    const g = newGame('widzew', 44);
    const mine = g.fixtures.filter((f) => f.comp === 'ekstraklasa' && (f.home === 'widzew' || f.away === 'widzew')).slice(0, 5);
    for (const f of mine) { f.played = true; const win = results === 'W'; f.result = { score: (f.home === 'widzew') === win ? [2, 0] : [0, 2] }; }
    const before = squadOf(g.world, 'widzew').reduce((s, p) => s + (p.morale ?? 12), 0);
    const r = holdMeeting(g, 'praise');
    assert.ok(r.ok);
    assert.equal(canHoldMeeting(g), false);
    assert.equal(holdMeeting(g, 'praise').ok, false);
    return squadOf(g.world, 'widzew').reduce((s, p) => s + (p.morale ?? 12), 0) - before;
  };
  assert.ok(run('W') > run('L'));
});

test('Rozmowy indywidualne: bez limitu dla kadry, z jednym zawodnikiem raz w tygodniu; krytyka rani wrażliwego bardziej', () => {
  const g = newGame('widzew', 45);
  const sq = squadOf(g.world, 'widzew');
  for (let i = 0; i < 10; i++) assert.ok(talkToPlayer(g, sq[i].id, 'encourage').ok, `rozmowa ${i + 1}`);
  assert.equal(talkToPlayer(g, sq[0].id, 'encourage').ok, false, 'ten sam zawodnik w tym samym tygodniu');
  const d = new Date(`${g.date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + TALK_COOLDOWN); g.date = d.toISOString().slice(0, 10);
  assert.ok(talkToPlayer(g, sq[0].id, 'encourage').ok, 'po tygodniu znowu można');
  const g2 = newGame('widzew', 46);
  const a = squadOf(g2.world, 'widzew')[3]; const b = squadOf(g2.world, 'widzew')[4];
  a.persona = 'Wrażliwy'; b.persona = 'Ambitny'; a.morale = 12; b.morale = 12;
  a.form = [6.0, 6.1]; b.form = [6.0, 6.1];
  talkToPlayer(g2, a.id, 'demand'); talkToPlayer(g2, b.id, 'demand');
  assert.ok(a.morale < b.morale, `${a.morale} vs ${b.morale}`);
});
