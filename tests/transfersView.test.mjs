// Ekran Transfery: układ podzakładek (tabele, panele, kafelki), sortowanie i zachowane haki data-act.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { renderTransfers, handleTransferAction, TF_TABS } from '../src/ui/transfersView.js';
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
const G = newGame();
const count = (html, re) => (html.match(re) ?? []).length;

test('Każda podzakładka renderuje się w opakowaniu .tfx z zakładkami i bez długich myślników', () => {
  for (const [k] of TF_TABS) {
    const html = renderTransfers(G, { tfTab: k });
    assert.match(html, /^<div class="tfx" data-tab="/);
    assert.equal(count(html, /data-act="tf-tab"/g), TF_TABS.length);
    assert.ok(!html.includes('\u2014'), `długi myślnik w zakładce ${k}`);
    assert.ok(!html.includes('undefined') && !html.includes('NaN'), `undefined/NaN w zakładce ${k}`);
  }
});

test('Rynek: tabela z sortowanymi nagłówkami, wiersze z data-pid i tf-open, filtry list i pozycji', () => {
  const html = renderTransfers(G, {});
  assert.match(html, /<table class="xl">/);
  assert.ok(count(html, /data-act="tf-sort" data-s="m"/g) >= 8);
  assert.match(html, /aria-sort="descending"><button data-act="tf-sort" data-s="m" data-k="ovr" data-dir="asc"/);
  assert.equal(count(html, /data-act="tf-list"/g), 4);
  assert.equal(count(html, /data-act="tf-pos"/g), 5);
  const rows = count(html, /<tr data-pid="/g);
  assert.equal(rows, count(html, /<th scope="row" class="xl__nm"><button data-act="tf-open"/g));
  assert.match(html, /class="tf-limit"/);
  assert.match(html, /class="tf-kpis"/);
});

test('Rynek: sortowanie wg wieku rosnąco układa wiersze od najmłodszego', () => {
  const html = renderTransfers(G, { tfList: 'free', tfSort: { k: 'age', dir: 'asc' } });
  const ids = [...html.matchAll(/<tr data-pid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 1);
  const ages = ids.map((id) => G.world.players[id].age);
  assert.deepEqual(ages, [...ages].sort((a, b) => a - b));
  assert.match(html, /aria-sort="ascending"><button data-act="tf-sort" data-s="m" data-k="age" data-dir="desc"/);
});

test('Wyszukiwarka zachowuje formularz data-tf-search z polami filtrów', () => {
  const html = renderTransfers(G, { tfList: 'search', tfFilter: { maxAge: '23' } });
  assert.match(html, /<form class="tf-search" data-tf-search>/);
  for (const n of ['text', 'maxPrice', 'maxAge', 'minOvr', 'tier']) assert.match(html, new RegExp(`name="${n}"`));
  assert.match(html, /data-act="tf-search"/);
  for (const [, id] of html.matchAll(/<tr data-pid="([^"]+)"/g)) assert.ok(G.world.players[id].age <= 23);
});

test('tf-sort zapisuje sortowanie rynku i kontraktów osobno', () => {
  assert.deepEqual(handleTransferAction(G, 'tf-sort', { s: 'm', k: 'price', dir: 'asc' }).ui, { tfSort: { k: 'price', dir: 'asc' } });
  assert.deepEqual(handleTransferAction(G, 'tf-sort', { s: 'c', k: 'wage', dir: 'desc' }).ui, { tfCSort: { k: 'wage', dir: 'desc' } });
  assert.deepEqual(handleTransferAction(G, 'tf-sort', { s: 'c', k: 'wage', dir: 'zle' }).ui, { tfCSort: { k: 'wage', dir: 'desc' } });
});

test('Kontrakty: cała kadra w tabeli, domyślnie wg końca kontraktu, suma płac w stopce', () => {
  const html = renderTransfers(G, { tfTab: 'kontrakty' });
  const squad = squadOf(G.world, G.clubId);
  const ids = [...html.matchAll(/<tr data-pid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, squad.length);
  const until = ids.map((id) => G.world.players[id].contract.until);
  assert.deepEqual(until, [...until].sort());
  assert.match(html, /<tfoot>/);
  assert.match(html, /Kończące się kontrakty/);
});

test('Karta cudzego zawodnika: oferta z #tfFee i tf-offer, powrót tf-close; własny: przedłużenie, lista, rozwiązanie', () => {
  const other = Object.values(G.world.players).find((p) => p.clubId && p.clubId !== G.clubId && p.age > 23);
  const html = renderTransfers(G, { tfPlayer: other.id });
  assert.match(html, /data-act="tf-close"/);
  assert.match(html, /class="tf-ch" data-pid="/);
  assert.ok(/id="tfFee"/.test(html) || /nie chce|Kadra pełna|nie na sprzedaż/i.test(html));
  const own = squadOf(G.world, G.clubId).find((p) => !p.loan);
  const mine = renderTransfers(G, { tfTab: 'kontrakty', tfPlayer: own.id });
  assert.match(mine, /data-act="tf-list-own"|data-act="tf-unlist"/);
  assert.match(mine, /data-act="tf-release"/);
  assert.match(mine, /Przedłużenie kontraktu/);
  const confirm = renderTransfers(G, { tfTab: 'kontrakty', tfPlayer: own.id, tfConfirm: own.id });
  assert.match(confirm, /data-act="tf-release-ok"/);
});

test('Oferty: przychodząca oferta ma przyciski tf-answer, karta zawodnika otwiera się także tu', () => {
  const own = squadOf(G.world, G.clubId)[0];
  const other = Object.keys(G.world.clubs).find((id) => id !== G.clubId);
  G.market.offers.push({ id: 'o-test', kind: 'incoming', status: 'open', playerId: own.id, from: other, fee: 1_000_000, expires: '2026-07-10' });
  G.market.userListed[own.id] = 900_000;
  const html = renderTransfers(G, { tfTab: 'oferty' });
  assert.equal(count(html, /data-act="tf-answer" data-o="o-test"/g), 3);
  assert.match(html, /Twoi zawodnicy na liście transferowej <span>1<\/span>/);
  assert.match(renderTransfers(G, { tfTab: 'oferty', tfPlayer: own.id }), /data-act="tf-close"/);
  G.market.offers.pop(); delete G.market.userListed[own.id];
});

test('Klub > Finanse i Zarząd: kafelki z barwą znaczeniową i panele', async () => {
  const { renderClubHub } = await import('../src/ui/klubView.js');
  const fin = renderClubHub(G, { kTab: 'finanse' });
  assert.equal(count(fin, /class="tf-kpi" data-m="/g), 4);
  assert.match(fin, /Przychody w sezonie/);
  assert.match(fin, /Miesiąc po miesiącu/);
  const board = renderClubHub(G, { kTab: 'zarzad' });
  assert.equal(count(board.split('<aside class="klub-side br">')[0], /class="tf-kpi" data-m="/g), 4); // bez panelu próśb do zarządu
  assert.match(board, /Oceny zarządu/);
  assert.match(board, /Kibice/);
});
