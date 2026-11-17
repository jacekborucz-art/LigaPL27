// Rozmowa indywidualna jako dialog: warianty tekstów, podejście trenera, przebieg okna i oznaczenie odbytej rozmowy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { approachMod, variantCount, coachOptions, openingLines, situationOf } from '../src/career/talkDialog.js';
import { talkToPlayer } from '../src/career/teamTalks.js';
import { renderTalks, handleTalkAction } from '../src/ui/talksView.js';
import { createSeason } from '../src/season/season.js';
import { createTactics } from '../src/engine/lineup.js';

function game(seed = 3) {
  const g = { seed, clubId: 'widzew', date: '2026-08-10', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: 'widzew' });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 });
  return g;
}

test('Dużo wariantów tekstów i trzy podejścia z różnymi zdaniami', () => {
  const v = variantCount();
  assert.ok(v.open >= 40 && v.coach >= 40 && v.close >= 30, JSON.stringify(v));
  const g = game();
  const p = squadOf(g.world, 'widzew')[0];
  const opts = coachOptions(g, p, 'demand');
  assert.deepEqual(opts.map((o) => o.approach), ['wsparcie', 'rzeczowo', 'stanowczo']);
  assert.equal(new Set(opts.map((o) => o.line)).size, 3);
  assert.ok(openingLines(g, p, situationOf(p)).line.length > 5);
});

test('Podejście: wrażliwy lepiej przyjmuje wsparcie niż stanowczość, wpływ ograniczony', () => {
  assert.ok(approachMod('Wrażliwy', 'encourage', 'wsparcie') > approachMod('Wrażliwy', 'encourage', 'stanowczo'));
  assert.ok(approachMod('Ambitny', 'demand', 'stanowczo') > approachMod('Ambitny', 'demand', 'wsparcie'));
  for (const per of ['Spokojny', 'Ambitny', 'Wrażliwy', 'Lider', 'Narwaniec']) for (const k of ['praise', 'encourage', 'demand', 'role', 'future', 'warn']) for (const a of ['wsparcie', 'rzeczowo', 'stanowczo']) {
    assert.ok(Math.abs(approachMod(per, k, a)) <= 1);
  }
  assert.equal(approachMod('Wrażliwy', 'encourage', null), 0, 'szybka rozmowa z menu bez zmian');
  const run = (ap) => { const g = game(9); const p = squadOf(g.world, 'widzew')[5]; p.persona = 'Wrażliwy'; p.morale = 8; const before = p.morale; talkToPlayer(g, p.id, 'encourage', { approach: ap }); return p.morale - before; };
  assert.ok(run('wsparcie') > run('stanowczo'));
});

test('Okno rozmowy: temat, podejście, wynik; po rozmowie wiersz z etykietą „Rozmowa odbyta”', () => {
  const g = game(4);
  const p = squadOf(g.world, 'widzew')[3];
  let ui = handleTalkAction(g, 'tt-open', { id: p.id }).ui;
  assert.equal(ui.ttDlg.step, 'topic');
  assert.ok(renderTalks(g, ui).includes('O czym chcesz porozmawiać?'));
  ui = handleTalkAction(g, 'tt-topic', { id: p.id, k: 'role' }).ui;
  const html = renderTalks(g, ui);
  assert.equal((html.match(/data-act="tt-say"/g) ?? []).length, 3);
  const r = handleTalkAction(g, 'tt-say', { id: p.id, k: 'role', ap: 'rzeczowo' });
  assert.ok(r.save && r.ui.ttDlg.step === 'done' && r.ui.ttDlg.result.closing);
  const after = renderTalks(g, r.ui);
  assert.ok(after.includes('Reakcja:') && after.includes('Zakończ rozmowę'));
  const list = renderTalks(g, {});
  const row = list.split(`data-pid="${p.id}"`)[1].split('</li>')[0];
  assert.ok(row.includes('Rozmowa odbyta') && !row.includes('data-act="tt-open"') && !/Za \d+ dni/.test(list));
});

test('Asystent rozmawia z czekającymi: lepszy asystent działa mocniej, bez zmiany zaufania, rozmowa liczy się w tygodniu', () => {
  const gain = (mot) => {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const g = game(20 + i); const p = squadOf(g.world, 'widzew')[4]; p.morale = 7;
      const trust = p.relations?.widzew?.trust;
      talkToPlayer(g, p.id, 'encourage', { assistant: mot });
      assert.equal(p.relations?.widzew?.trust, trust, 'zaufanie do trenera bez zmian');
      sum += p.morale - 7;
    }
    return sum;
  };
  assert.ok(gain(18) > gain(3), 'lepszy asystent podnosi morale bardziej');
  const g = game(4);
  for (const p of squadOf(g.world, 'widzew').slice(0, 6)) p.morale = 6; // niskie morale: polecani do rozmowy
  const html = renderTalks(g, {});
  assert.match(html, /data-act="tt-assist"/);
  const r = handleTalkAction(g, 'tt-assist', {});
  assert.match(r.ui.ttResult, /^Asystent porozmawiał z \d+ zawodnik/);
  assert.ok(r.save);
  assert.doesNotMatch(renderTalks(g, {}), /data-act="tt-assist"/, 'po rozmowach nikt nie czeka');
  assert.ok(!/undefined|NaN|—/.test(renderTalks(g, r.ui)));
});
