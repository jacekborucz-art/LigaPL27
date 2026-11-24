// Lista życzeń gracza: moduł (src/career/wishlist.js), zakładka w Transferach, menu i przyciski.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { renderTransfers, handleTransferAction, transferCardHtml } from '../src/ui/transfersView.js';
import { playerMenu } from '../src/ui/playerMenus.js';
import { add, remove, has, list, count, toggle } from '../src/career/wishlist.js';
import { poolList } from '../src/career/foreignPool.js';
import '../src/season/dailySystems.js';

function newGame(clubId = 'widzew', seed = 21) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  return g;
}
const other = (g, i = 0) => squadOf(g.world, 'legia')[i];
const clean = (html, what) => {
  assert.ok(!html.includes('undefined') && !html.includes('NaN'), `undefined/NaN: ${what}`);
  assert.ok(!html.includes('\u2014'), `długi myślnik: ${what}`);
};

test('Dodanie i usunięcie: lista leniwa, bez duplikatów, data dodania', () => {
  const g = newGame();
  delete g.market.wishlist; // stary zapis bez pola
  assert.equal(count(g), 0);
  assert.deepEqual(list(g), []);
  const p = other(g);
  assert.equal(add(g, p.id).ok, true);
  assert.equal(add(g, p.id).ok, true); // drugi raz nie dubluje
  assert.equal(g.market.wishlist.length, 1);
  assert.deepEqual(g.market.wishlist[0], { id: p.id, added: g.date });
  assert.equal(has(g, p.id), true);
  assert.equal(remove(g, p.id).ok, true);
  assert.equal(has(g, p.id), false);
  assert.equal(count(g), 0);
  assert.equal(toggle(g, p.id).ok, true);
  assert.equal(has(g, p.id), true);
  toggle(g, p.id);
  assert.equal(has(g, p.id), false);
});

test('Własny zawodnik wypożyczony do innego klubu nie trafia na listę życzeń', () => {
  const g = newGame();
  const p = squadOf(g.world, g.clubId)[5];
  p.loan = { from: g.clubId, until: '2027-06-30' }; p.clubId = 'lech';
  assert.equal(add(g, p.id).ok, false);
  assert.equal(has(g, p.id), false);
});

test('Nie da się dodać własnego zawodnika ani nieistniejącego', () => {
  const g = newGame();
  assert.equal(add(g, squadOf(g.world, g.clubId)[0].id).ok, false);
  assert.equal(add(g, 'nie-ma-takiego').ok, false);
  assert.equal(count(g), 0);
});

test('Zawodnik, który trafi do klubu gracza albo zniknie ze świata, jest usuwany z listy', () => {
  const g = newGame();
  const a = other(g, 0); const b = other(g, 1); const c = other(g, 2);
  add(g, a.id); add(g, b.id); add(g, c.id);
  a.clubId = g.clubId; // transfer do klubu gracza
  delete g.world.players[b.id]; // zniknął ze świata
  assert.deepEqual(list(g).map((x) => x.p.id), [c.id]);
  assert.equal(g.market.wishlist.length, 1);
  assert.equal(remove(g, b.id).ok, true); // usuwanie nieistniejącego nie rzuca błędu
});

test('Akcje tf-wl, tf-wl-del i tf-wl-scout', () => {
  const g = newGame();
  const p = other(g);
  assert.equal(handleTransferAction(g, 'tf-wl', { id: p.id }).save, true);
  assert.equal(has(g, p.id), true);
  handleTransferAction(g, 'tf-wl', { id: p.id });
  assert.equal(has(g, p.id), false);
  add(g, p.id);
  handleTransferAction(g, 'tf-wl-del', { id: p.id });
  assert.equal(has(g, p.id), false);
  const r = handleTransferAction(g, 'tf-wl-scout', {});
  assert.equal(r.ui.tfTab, 'skauting');
  assert.equal(r.ui.skTab, 'kandydaci');
});

test('Zakładka: pusta lista z podpowiedzią, sekcja skautów i przejście do Skautingu', () => {
  const g = newGame();
  const html = renderTransfers(g, { tfList: 'wishlist' });
  clean(html, 'pusta');
  assert.match(html, /Lista życzeń jest pusta/);
  assert.match(html, /Do listy życzeń/);
  assert.match(html, /Obserwowani przez skautów: <b>\d+<\/b>/);
  assert.match(html, /data-act="tf-wl-scout"/);
  assert.ok(!/<table class="xl">/.test(html));
});

test('Zakładka: zawodnik z klubu, wolny i z zagranicy bez undefined i NaN, z licznikiem i przyciskami', () => {
  const g = newGame();
  const club = other(g);
  const free = g.world.players[g.market.free[0]];
  const abroad = poolList(g).find((p) => !p.free) ?? poolList(g)[0];
  assert.ok(club && free && abroad);
  g.market.listed[club.id] = { kind: 'transfer', reasons: ['Nadmiar zawodników na pozycji'], since: g.date, club: club.clubId };
  club.injuryDays = 5;
  for (const p of [club, free, abroad]) add(g, p.id);
  const html = renderTransfers(g, { tfList: 'wishlist' });
  clean(html, 'z danymi');
  assert.match(html, /Lista życzeń \(3\)/);
  assert.match(html, /<table class="xl">/);
  for (const p of [club, free, abroad]) {
    assert.ok(html.includes(`data-act="tf-wl-del" data-id="${p.id}"`), `Usuń ${p.id}`);
    assert.ok(html.includes(`data-act="tf-open" data-id="${p.id}"`), `Otwórz ${p.id}`);
  }
  assert.match(html, /wolny zawodnik/);
  assert.match(html, /na liście transferowej/);
  assert.match(html, /kontuzja, 5 dni/);
  assert.match(html, /Obserwowani przez skautów/);
  // sortowanie po dacie dodania i filtr pozycji nie psują widoku
  clean(renderTransfers(g, { tfList: 'wishlist', tfSort: { k: 'added', dir: 'asc' } }), 'sort added');
  clean(renderTransfers(g, { tfList: 'wishlist', tfSort: { k: 'will', dir: 'asc' }, tfPos: 'all' }), 'sort will');
  clean(renderTransfers(g, { tfList: 'wishlist', tfPos: 'GK' }), 'filtr pozycji');
});

test('Przyciski w karcie, w okienku i w menu pod prawym przyciskiem (tylko cudzy zawodnik)', () => {
  const g = newGame();
  const p = other(g);
  let card = renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id });
  assert.match(card, /data-act="tf-wl"[^>]*>Do listy życzeń</);
  add(g, p.id);
  card = renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id });
  assert.match(card, /data-act="tf-wl"[^>]*>Usuń z listy życzeń</);
  assert.match(transferCardHtml(g, p), /data-act="tf-wl"[^>]*>Usuń z listy życzeń</);
  const m = playerMenu(g, p.id, { view: 'transfers' });
  assert.ok(m.items.some((i) => i.label === 'Usuń z listy życzeń' && i.run.steps[0].act === 'tf-wl'));
  remove(g, p.id);
  assert.ok(playerMenu(g, p.id, { view: 'transfers' }).items.some((i) => i.label === 'Do listy życzeń'));
  const own = squadOf(g.world, g.clubId)[0];
  assert.ok(!transferCardHtml(g, own).includes('tf-wl'));
  assert.ok(!playerMenu(g, own.id, { view: 'squad' }).items.some((i) => /listy życzeń/.test(i.label ?? '')));
});
