// Edytor gry i datapack: src/career/editor.js, src/ui/editorView.js (docs/edytor.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureTraining } from '../src/training/index.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { clubById } from '../src/data/clubs_pl.js';
import { capacityOf } from '../src/career/infrastructure.js';
import { ovrAt } from '../src/data/attributes.js';
import { offsetsFor } from '../src/training/development.js';
import {
  applyPack, restoreOriginals, checkClub, checkPlayer, editClub, editPlayer, exportPack, parsePack, importPack,
  packFileName, resetClub, clearPack, PACK_TYPE,
} from '../src/career/editor.js';
import { renderEditor, newEditorState, handleEditorAction, findPlayers, LIST_CAP } from '../src/ui/editorView.js';
import { sysDialogHtml } from '../src/ui/sysMenu.js';

function game(seed = 7) {
  const g = { seed, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: 'widzew' });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 });
  ensureTraining(g);
  ensureCareer(g);
  return g;
}
const G = game();
const G2 = game(99);

test('Opcje: przycisk Edytor', () => {
  assert.match(sysDialogHtml('options', { theme: 'auto' }), /data-act="sys-editor"/);
});

test('Nazwa klubu: zmiana w grze, po applyPack i przywrócenie dla innej gry', () => {
  const g = structuredClone(G);
  const orig = clubById('legia').name;
  const r = checkClub({ name: '  Legia   Testowa ', short: 'LTS', stadium: 'Stadion Testowy' }, { form: true });
  assert.deepEqual(r.errors, {});
  editClub(g, 'legia', r.value);
  assert.equal(clubById('legia').name, 'Legia Testowa');
  assert.deepEqual(g.editor.clubs.legia, { name: 'Legia Testowa', short: 'LTS', stadium: 'Stadion Testowy' });
  restoreOriginals();
  assert.equal(clubById('legia').name, orig);
  assert.equal(clubById('legia').stadium, undefined);
  applyPack(g); // wczytanie tej gry
  assert.equal(clubById('legia').name, 'Legia Testowa');
  assert.equal(clubById('legia').short, 'LTS');
  applyPack(structuredClone(G)); // inna gra bez datapacku
  assert.equal(clubById('legia').name, orig);
  applyPack(g);
  resetClub(g, 'legia');
  assert.equal(clubById('legia').name, orig);
  assert.equal(g.editor.clubs.legia, undefined);
  restoreOriginals();
});

test('Finanse i pojemność: plan sezonu i infrastruktura spójne', () => {
  const g = structuredClone(G);
  const r = checkClub({ capacity: '30 000', balance: '-2500000', transferBudget: '1000000', wageBudget: '90000' }, { form: true });
  assert.deepEqual(r.errors, {});
  editClub(g, 'lech', r.value);
  assert.equal(capacityOf(g, 'lech').full, 30000);
  assert.equal(g.finance.clubs.lech.plan.cap, 30000);
  assert.ok(g.finance.clubs.lech.plan.att <= 30000);
  assert.equal(g.finance.clubs.lech.balance, -2500000);
  assert.equal(g.finance.clubs.lech.transferBudget, 1000000);
  assert.equal(g.finance.clubs.lech.wageBudget, 90000);
  assert.deepEqual(g.editor.clubs.lech, { capacity: 30000, balance: -2500000, transferBudget: 1000000, wageBudget: 90000 });
  restoreOriginals();
});

test('Walidacja: zakresy, puste nazwy, typy', () => {
  const c = checkClub({ name: ' ', short: 'L!', capacity: '100', balance: '-2000000000', transferBudget: '-1', wageBudget: 'abc' }, { form: true });
  assert.deepEqual(Object.keys(c.errors).sort(), ['balance', 'capacity', 'name', 'short', 'transferBudget', 'wageBudget']);
  assert.ok(checkClub({ name: 'x'.repeat(41) }).errors.name);
  assert.ok(checkClub({ capacity: 100001 }).errors.capacity);
  assert.ok(checkClub({ capacity: '20000' }).errors.capacity, 'z pliku liczba, nie napis');
  const p = checkPlayer({ first: '', attrs: { POD: '21', DRY: '0', WYK: '12.5', TEC: '15' }, pot: '25', nat: 'XXX', pos: 'GK', birthDate: '2030-02-31' }, { form: true, date: '2026-07-01' });
  for (const k of ['first', 'attr.POD', 'attr.DRY', 'attr.WYK', 'pot', 'nat', 'pos', 'birthDate']) assert.ok(p.errors[k], k);
  assert.equal(p.errors['attr.TEC'], undefined);
  assert.ok(checkPlayer({ birthDate: '2020-01-01' }, { date: '2026-07-01' }).errors.birthDate, 'za młody');
});

test('Zawodnik: atrybut zmienia OVR (funkcja gry), dane osobowe i wiek', () => {
  const g = structuredClone(G);
  const p = squadOf(g.world, 'widzew').find((x) => x.pos === 'NAP');
  const before = p.ovr;
  const r = checkPlayer({ first: 'Jan', last: 'Edytowany', nat: 'ESP', birthDate: '2000-03-15', attrs: { WYK: '20', RUC: '20', OPA: '20' }, pot: '19.5' }, { form: true, date: g.date });
  assert.deepEqual(r.errors, {});
  editPlayer(g, p.id, r.value);
  assert.equal(p.name, 'Jan Edytowany');
  assert.equal(p.nat, 'ESP');
  assert.equal(p.age, 26);
  assert.equal(p.hidden.POT, 19.5);
  assert.equal(p.attr.WYK, 20);
  assert.equal(p.ovr, ovrAt(p.attr, p.pos, offsetsFor(p)));
  assert.ok(p.ovr > before, 'wyższy OVR');
  assert.deepEqual(g.editor.players[p.id].attrs, Object.fromEntries(['WYK', 'RUC', 'OPA'].filter((k) => r.value.attrs[k] !== undefined).map((k) => [k, 20])));
});

test('Datapack: eksport i import (round trip), nazwa pliku ASCII', () => {
  const g = structuredClone(G);
  const p = squadOf(g.world, 'legia')[0];
  editClub(g, 'rakow', checkClub({ name: 'Raków Nowy', stadium: 'Arena', capacity: '12000' }, { form: true }).value);
  editPlayer(g, p.id, checkPlayer({ last: 'Kowalski', attrs: { POD: '18' } }, { form: true }).value);
  const pack = exportPack(g, new Date('2026-11-14T10:00:00Z'));
  assert.equal(pack.type, PACK_TYPE);
  assert.equal(pack.v, 1);
  assert.equal(pack.seed, g.seed);
  restoreOriginals();
  const g2 = structuredClone(G); // ten sam świat
  const r = importPack(g2, parsePack(JSON.stringify(pack)));
  assert.equal(r.clubs, 1);
  assert.equal(r.players, 1);
  assert.equal(clubById('rakow').name, 'Raków Nowy');
  assert.equal(clubById('rakow').stadium, 'Arena');
  assert.equal(capacityOf(g2, 'rakow').full, 12000);
  assert.equal(g2.world.players[p.id].last, 'Kowalski');
  assert.equal(g2.world.players[p.id].attr.POD, 18);
  assert.deepEqual(g2.editor.clubs.rakow, g.editor.clubs.rakow);
  assert.match(packFileName('2026-10-20'), /^LigaPL27-datapack-2026-10-20\.json$/);
  assert.ok(/^[\x20-\x7e]+$/.test(packFileName(g.date)));
  restoreOriginals();
});

test('Import: nieznane klucze pominięte, zły typ i złe wartości odrzucone', () => {
  const ok = parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, seed: 7, hack: '<script>', clubs: { legia: { name: 'Legia X', evil: 1, colors: ['#000'] } }, players: {} }));
  assert.deepEqual(ok.clubs.legia, { name: 'Legia X' });
  assert.throws(() => parsePack('nie json'), /JSON/);
  assert.throws(() => parsePack(JSON.stringify({ version: 1, game: { seed: 1 } })), /To nie jest datapack/);
  assert.throws(() => parsePack(JSON.stringify({ type: PACK_TYPE, v: 2 })), /wersję/);
  assert.throws(() => parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, clubs: { legia: { capacity: 5 } } })), /Pojemność/);
  assert.throws(() => parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, players: { x: { attrs: { POD: 30 } } } })), /Podania/);
  assert.throws(() => parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, clubs: [] })), /format/);
  const g = structuredClone(G);
  const r = importPack(g, parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, seed: 7, clubs: { 'nie-ma-takiego': { name: 'Klub' } } })));
  assert.equal(r.clubsSkipped, 1);
  restoreOriginals();
});

test('Import: zawodnicy pominięci w innym świecie gry, kluby zastosowane', () => {
  const g = structuredClone(G);
  const p = squadOf(g.world, 'legia')[0];
  editClub(g, 'piast', { name: 'Piast Nowy' });
  editPlayer(g, p.id, { attrs: { POD: 1 } });
  const pack = exportPack(g);
  restoreOriginals();
  const other = structuredClone(G2);
  const before = other.world.players[p.id] ? other.world.players[p.id].attr.POD : null;
  const r = importPack(other, parsePack(JSON.stringify(pack)));
  assert.equal(r.otherWorld, true);
  assert.equal(r.players, 0);
  assert.equal(r.playersSkipped, 1);
  assert.equal(r.clubs, 1);
  assert.equal(clubById('piast').name, 'Piast Nowy');
  if (before != null) assert.equal(other.world.players[p.id].attr.POD, before);
  clearPack(other);
  assert.notEqual(clubById('piast').name, 'Piast Nowy');
  restoreOriginals();
});

test('Widok edytora: zakładki, formularz klubu i zawodnika, zapis przez akcje, escape tekstu', () => {
  const g = structuredClone(G);
  const ed = newEditorState();
  let html = renderEditor(g, ed);
  for (const t of ['Kluby', 'Zawodnicy', 'Datapack', 'Wróć do gry']) assert.ok(html.includes(t), t);
  assert.ok(!/—/.test(html), 'bez pauz');
  handleEditorAction(g, ed, 'ed-club', { id: 'legia' });
  html = renderEditor(g, ed);
  assert.match(html, /id="ed-name"/);
  assert.match(html, /data-act="ed-cplayer"/);
  // Zapis z „formularza”: obiekt z querySelector jak w DOM
  const fields = { 'ed-name': '<b>Legia</b>', 'ed-short': 'LEG', 'ed-stadium': '', 'ed-capacity': '31000', 'ed-balance': '1000000', 'ed-tb': '0', 'ed-wb': '50000' };
  const root = { querySelector: (sel) => ({ value: fields[sel.slice(1)] ?? '' }) };
  const r = handleEditorAction(g, ed, 'ed-save-club', { id: 'legia' }, root);
  assert.equal(r.save, true);
  html = renderEditor(g, ed);
  assert.ok(html.includes('&lt;b&gt;Legia&lt;/b&gt;') && !html.includes('<b>Legia</b>'), 'nazwa w HTML przez esc');
  fields['ed-capacity'] = '5';
  const bad = handleEditorAction(g, ed, 'ed-save-club', { id: 'legia' }, root);
  assert.ok(!bad.save && ed.errors.capacity);
  assert.match(renderEditor(g, ed), /aria-invalid="true"/);
  ed.tab = 'players'; ed.pq = 'a';
  const found = findPlayers(g, { q: '' });
  assert.ok(found.rows.length <= LIST_CAP && found.total > LIST_CAP);
  handleEditorAction(g, ed, 'ed-player', { id: found.rows[0].id });
  assert.match(renderEditor(g, ed), /id="ed-a-POD"/);
  ed.tab = 'pack';
  assert.match(renderEditor(g, ed), /data-act="ed-export"/);
  restoreOriginals();
});

test('Pełny datapack: wszystkie kluby i zawodnicy, wczytuje się bez błędów, przywraca wartości', () => {
  const g = structuredClone(G);
  const pid = squadOf(g.world, 'legia')[0].id ?? squadOf(g.world, 'legia')[0];
  const p = g.world.players[typeof pid === 'string' ? pid : pid.id];
  const before = { ...p.attr };
  editPlayer(g, p.id, { attrs: { [Object.keys(before)[0]]: 20 } });
  const full = exportPack(g, new Date('2026-07-01T00:00:00Z'), { full: true });
  assert.equal(full.full, true);
  assert.equal(Object.keys(full.players).length, Object.keys(g.world.players).length);
  assert.ok(Object.keys(full.clubs).length >= 54);
  assert.equal(full.players[p.id].attrs[Object.keys(before)[0]], 20, 'edytowana wartość w pełnym pliku');
  assert.ok(full.clubs.legia.name && full.clubs.legia.capacity);
  assert.match(packFileName('2026-07-01', { full: true }), /^LigaPL27-datapack-pelny-2026-07-01\.json$/);
  const parsed = parsePack(JSON.stringify(full));
  assert.equal(Object.keys(parsed.players).length, Object.keys(full.players).length, 'żaden zawodnik nie odpada w walidacji');
  // Ten sam świat bez zmian: import nic nie zmienia i nie zaśmieca datapacku
  const g2 = structuredClone(g);
  const packBefore = JSON.stringify(g2.editor);
  importPack(g2, parsed);
  assert.equal(JSON.stringify(g2.editor), packBefore);
  // Kopia gry sprzed edycji dostaje wartość z pełnego pliku
  const g3 = structuredClone(G);
  importPack(g3, parsed);
  assert.equal(g3.world.players[p.id].attr[Object.keys(before)[0]], 20);
  restoreOriginals();
});
