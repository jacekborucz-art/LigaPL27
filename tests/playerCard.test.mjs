// Karta zawodnika wspólna dla Kadra > Skład i taktyka i okna „Zmiany i taktyka” w meczu (src/ui/playerCard.js)
// oraz opcje menu zawodnika w meczu (matchMenuItems w src/ui/matchdayView.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics } from '../src/engine/lineup.js';
import { renderPlayerCard, cardFact, barFactHtml, WIDE_CARD } from '../src/ui/playerCard.js';
import { renderTactics } from '../src/ui/tacticsView.js';
import { matchMenuItems } from '../src/ui/matchdayView.js';

const world = generateWorld(3);
const squad = squadOf(world, 'legia').map((p) => ({ ...p }));
const tactics = createTactics(squad, { benchSize: 9 });
const field = squad.find((p) => p.pos !== 'BR');
const keeper = squad.find((p) => p.pos === 'BR');
const facts = [cardFact('W meczu', 'Na boisku: ŚO'), cardFact('Stan', 'Uraz', true), cardFact('Kondycja', barFactHtml(71.6))];

test('Karta w meczu na PC: pływające okno z paskiem, zamknięcie przez data-md, bez przypinania', () => {
  const html = renderPlayerCard(field, { wide: true, cls: 'md-pcard', closeAttrs: 'data-md="pcardClose"', facts });
  assert.match(html, /^<dialog class="tdet tcard md-pcard" open data-card="0"/);
  assert.match(html, /class="tcard__bar"/);
  assert.match(html, /data-tcard-grip/);
  assert.doesNotMatch(html, /tcard__pin/);
  assert.equal((html.match(/data-md="pcardClose"/g) ?? []).length, 2); // pasek i nagłówek
  assert.doesNotMatch(html, /data-act=/); // akcje Kadry nie trafiają do meczu
  assert.match(html, /<div class="is-bad"><dt>Stan<\/dt><dd>Uraz<\/dd><\/div>/);
  assert.match(html, /<i data-b="mid" style="width:72%"><\/i><\/span>72%/);
  assert.match(html, /class="tdet__groups"/);
  assert.match(html, /class="pmap/);
  assert.ok(!html.includes(String.fromCharCode(8212)));
  assert.equal(WIDE_CARD, '(min-width: 1100px)');
});

test('Karta na telefonie: arkusz bez paska; bramkarz na PC: atrybuty w dwóch kolumnach', () => {
  const phone = renderPlayerCard(field, { closeAttrs: 'data-md="pcardClose"', facts });
  assert.match(phone, /^<dialog class="tdet" open/);
  assert.doesNotMatch(phone, /tcard/);
  assert.match(phone, /<h3 id="tdet-h">/);
  const gk = renderPlayerCard(keeper, { wide: true, facts });
  assert.match(gk, /tdet__groups--gk/);
});

test('Kadra korzysta z tej samej karty: przypinanie i zamykanie przez data-act jak dotąd', () => {
  const pid = tactics.xi[2];
  const pc = renderTactics({ squad, tactics, sel: null, benchSize: 9, wide: true, cards: [{ id: pid, pinned: false, slot: 1 }] });
  assert.match(pc, /<dialog class="tdet tcard" open data-card="1"/);
  assert.match(pc, /data-act="tcardpin" data-id="[^"]+" aria-pressed="false"/);
  assert.match(pc, /<dt>Świeżość<\/dt>/);
  assert.match(pc, /<dt>Ostrość<\/dt>/);
});

test('Menu zawodnika w oknie „Zmiany i taktyka”: karta zawodnika, wybór do zmiany, bez statystyk meczu', () => {
  const on = matchMenuItems({ manage: true, mine: true, on: true, takers: [['penalty', 'Rzuty karne', true]] });
  assert.deepEqual(on.filter((x) => !x.sep).map((x) => x.label), ['Zmień zawodnika', 'Karta zawodnika', 'Stałe fragmenty']);
  assert.equal(on.find((x) => x.label === 'Karta zawodnika').act, 'card');
  assert.equal(on[0].act, 'mmSel');
  assert.equal(on.find((x) => x.label === 'Stałe fragmenty').items[0].checked, true);
  const planned = matchMenuItems({ manage: true, mine: true, onBench: true, planned: true });
  assert.equal(planned[0].disabled, 'Już w zaplanowanej zmianie');
  assert.equal(matchMenuItems({ manage: true, mine: true, onBench: true, hurt: true })[0].disabled, 'Uraz');
  assert.equal(matchMenuItems({ manage: true, mine: true, on: true, subWhy: 'Okna zmian wykorzystane' })[0].disabled, 'Okna zmian wykorzystane');
  // Rywal i składy obok relacji: karta i statystyki meczu, zmiana otwiera okno zmian
  assert.deepEqual(matchMenuItems({ mine: false, on: true }).map((x) => x.label), ['Karta zawodnika', 'Statystyki meczu']);
  const live = matchMenuItems({ mine: true, on: true });
  assert.equal(live[0].act, 'sub');
  assert.equal(matchMenuItems({ played: false }).find((x) => x.act === 'stats').hint, 'Jeszcze nie grał');
});
