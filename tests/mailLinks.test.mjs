// Odnośniki w wiadomościach Poczty (src/ui/mailLinks.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/world/worldGen.js';
import { mailLinks } from '../src/ui/mailLinks.js';

const g = { seed: 3, clubId: 'widzew', date: '2026-10-20', world: generateWorld(3), inbox: [] };
const own = g.world.clubs.widzew.squad[0];
const other = g.world.clubs.legia.squad[0];
const labels = (m) => mailLinks(g, m).map((l) => l.label);

test('Wiadomość o własnym zawodniku: profil, rozmowa i karta transferowa', () => {
  assert.deepEqual(labels({ key: `prosba:${own}:2026-10-01` }), ['Profil zawodnika', 'Porozmawiaj z zawodnikiem', 'Karta transferowa']);
  const run = mailLinks(g, { key: `prosba:${own}:x` })[0].run;
  assert.deepEqual(run.steps.at(-1), { act: 'player', id: own });
});

test('Zawodnik innego klubu: karta zawodnika na rynku', () => {
  assert.deepEqual(labels({ key: `pre-pyta:${other}` }), ['Karta zawodnika', 'W toku']);
});

test('Rodzaje bez zawodnika: kontrakty, sponsorzy, sztab, obozy, reprezentacje', () => {
  assert.deepEqual(labels({ key: 'kontrakty:2027' }), ['Kontrakty']);
  assert.deepEqual(labels({ key: 'sponsor-oferta:1' }), ['Sponsorzy']);
  assert.deepEqual(labels({ key: 'sztab-wakat:asystent' }), ['Sztab']);
  assert.deepEqual(labels({ key: 'oboz:2026' }), ['Obozy']);
  assert.deepEqual(labels({ key: 'callups:w1' }), ['Reprezentacje']);
});

test('Bez odnośników: wiadomości bez klucza i raporty z własnymi przyciskami', () => {
  assert.deepEqual(labels({ key: null }), []);
  assert.deepEqual(labels({ key: 'welcome' }), []);
  assert.deepEqual(labels({ key: `x:${own}`, refs: { kind: 'matchReport' } }), []);
});
