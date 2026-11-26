// Edytor: kluby IV ligi (barwy, stadion, pojemność), datapack v8 (docs/edytor.md, docs/iv-liga.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureTraining } from '../src/training/index.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { CLUBS_L4 } from '../src/data/clubs_l4.js';
import { level6SaveData } from '../src/data/level6.js';
import { applyLeagueState, knownClub } from '../src/season/leagues.js';
import {
  applyPack, restoreOriginals, checkClub, editClub, exportPack, parsePack, importPack, resetClub, clearPack, PACK_V, LIMITS,
} from '../src/career/editor.js';
import { renderEditor, newEditorState, handleEditorAction, clubListHtml, editorL4Clubs } from '../src/ui/editorView.js';
import { crestHtml } from '../src/ui/crest.js';

function game(seed = 7, l4 = false) {
  const g = { seed, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: 'widzew', ...(l4 ? { l4Seed: seed } : {}) });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 });
  ensureTraining(g);
  ensureCareer(g);
  return g;
}
const G = game();
const GL4 = game(7, true);
const ID = 'piast-zmigrod'; // dolnośląska: barwy #FFFFFF i #C8102E, bez stadionu i pojemności w danych
const ID2 = 'gks-mirkow-dlugoleka'; // ma stadion „Boisko GKS Mirków”, pojemność 180
const club = (id) => CLUBS_L4.find((c) => c.id === id);
const edit = (g, id, raw) => {
  const r = checkClub(raw, { form: true });
  assert.deepEqual(r.errors, {});
  return editClub(g, id, r.value);
};

test('IV liga: zakładka z listą klubów, wyszukiwaniem i grupą w opisie', () => {
  const g = structuredClone(G);
  const ed = { ...newEditorState(), tier: 5 };
  const list = clubListHtml(g, ed);
  assert.match(list, /data-id="piast-zmigrod"/);
  assert.match(list, /IV liga, grupa dolnośląska/);
  assert.equal((list.match(/class="ed-row"/g) ?? []).length, CLUBS_L4.length);
  const found = clubListHtml(g, { ...ed, q: 'zmigrod' });
  assert.match(found, /Piast Żmigród/); assert.doesNotMatch(found, /Chrobry/);
  assert.match(renderEditor(g, ed), /data-t="5"[^>]*>IV liga</);
  assert.doesNotMatch(clubListHtml(g, { ...ed, tier: 1 }), /piast-zmigrod/); // Ekstraklasa bez IV ligi
});

test('IV liga: kariera z season.l4 pokazuje skład grup, razem z klubem z poziomu 6', () => {
  const g = structuredClone(GL4);
  assert.ok(g.season.l4);
  assert.equal(editorL4Clubs(g).length, g.season.l4.groups.flatMap((x) => x.ids).length);
  const sd = level6SaveData({ id: 'klub-testowy-l6', name: 'Klub Testowy', colors: 'zielono-biale' }, 'opolska');
  g.leagueState = { year: 2026, tiers: { 'klub-testowy-l6': 5 }, groups: {}, extra: { 'klub-testowy-l6': sd } };
  g.season.l4.groups.find((x) => x.voiv === 'opolska').ids.push('klub-testowy-l6');
  try {
    applyLeagueState(g);
    const names = editorL4Clubs(g).map((c) => c.id);
    assert.ok(names.includes('klub-testowy-l6'));
    assert.match(clubListHtml(g, { ...newEditorState(), tier: 5, q: 'testowy' }), /IV liga, grupa opolska/);
  } finally { applyLeagueState({}); applyPack({}); }
});

test('IV liga: walidacja barw, stadionu i pojemności', () => {
  const ok = checkClub({ colors: ['#2e8a4e', ' #ffffff '], stadium: '', cap: '1 200' }, { form: true });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.value, { colors: ['#2E8A4E', '#FFFFFF'], stadium: '', cap: 1200 });
  for (const bad of [['red', '#FFFFFF'], ['#12345', '#FFFFFF'], ['#GGGGGG', '#FFFFFF'], ['#FFFFFF'], '#FFFFFF', [123, '#FFFFFF'], ['#FFFFFF', '#FFFFFF', '#000000', '#111111', '#222222'], ['#FFFFFF', '#FFFFFF', 'zielony']]) {
    assert.ok(checkClub({ colors: bad }, { form: true }).errors.colors, `odrzucone ${JSON.stringify(bad)}`);
  }
  assert.match(checkClub({ colors: ['#FFFFFF', 'zielony'] }).errors.colors, /Barwa 2/);
  // barwa 3 i 4: opcjonalne (puste pomijane)
  assert.deepEqual(checkClub({ colors: ['#111111', '#222222', '#333333', '#444444'] }).value.colors, ['#111111', '#222222', '#333333', '#444444']);
  assert.deepEqual(checkClub({ colors: ['#111111', '#222222', '', ''] }).value.colors, ['#111111', '#222222']);
  assert.ok(checkClub({ cap: '99' }, { form: true }).errors.cap);
  assert.ok(checkClub({ cap: String(LIMITS.capMax + 1) }, { form: true }).errors.cap);
  assert.ok(checkClub({ cap: 'dużo' }, { form: true }).errors.cap);
  assert.equal(checkClub({ cap: '100' }, { form: true }).value.cap, 100);
  assert.equal(checkClub({ cap: '' }, { form: true }).value.cap, null); // puste pole: wartość z danych
  assert.ok(checkClub({ stadium: 'x'.repeat(LIMITS.stadium + 1) }, { form: true }).errors.stadium);
});

test('IV liga: edycja, zapis w datapacku, tarcza i przywrócenie oryginału', () => {
  const g = structuredClone(G);
  const c = club(ID);
  const before = [...c.colors];
  assert.equal(edit(g, ID, { colors: ['#112233', '#445566'], stadium: 'Stadion Testowy', cap: '2500' }), 3);
  assert.deepEqual(c.colors, ['#112233', '#445566']);
  assert.equal(c.stadium, 'Stadion Testowy'); assert.equal(c.cap, 2500);
  assert.deepEqual(g.editor.clubs[ID], { colors: ['#112233', '#445566'], stadium: 'Stadion Testowy', cap: 2500 });
  assert.match(crestHtml(c, { size: 24, hidden: true }), /#112233/);
  assert.equal(edit(g, ID, { colors: ['#112233', '#445566'], stadium: 'Stadion Testowy', cap: '2500' }), 0); // bez zmian
  // nowa gra z innym datapackiem: oryginały
  restoreOriginals();
  assert.deepEqual(c.colors, before); assert.equal(c.stadium, undefined); assert.equal(c.cap, undefined);
  // wczytanie gry nakłada zmiany
  applyPack(g);
  assert.deepEqual(c.colors, ['#112233', '#445566']); assert.equal(c.cap, 2500);
  // Przywróć oryginał
  resetClub(g, ID);
  assert.deepEqual(c.colors, before); assert.equal(c.stadium, undefined); assert.equal(c.cap, undefined);
  assert.equal(g.editor.clubs[ID], undefined);
  restoreOriginals();
});

test('IV liga: zmiana z powrotem na oryginał usuwa wpis, klub z danymi stadionu i pojemności', () => {
  const g = structuredClone(G);
  const c = club(ID2);
  assert.equal(c.cap, 180);
  edit(g, ID2, { colors: c.colors, stadium: 'Inny', cap: '3000' });
  assert.deepEqual(g.editor.clubs[ID2], { stadium: 'Inny', cap: 3000 });
  edit(g, ID2, { colors: c.colors, stadium: 'Boisko GKS Mirków', cap: '' }); // puste pole: pojemność z danych
  assert.equal(c.cap, 180); assert.equal(g.editor.clubs[ID2], undefined);
  edit(g, ID2, { stadium: '' }); // pusta nazwa stadionu zostaje jako zmiana
  assert.equal(c.stadium, undefined); assert.deepEqual(g.editor.clubs[ID2], { stadium: '' });
  clearPack(g);
  assert.equal(c.stadium, 'Boisko GKS Mirków'); assert.equal(c.cap, 180);
  restoreOriginals();
});

test('IV liga: eksport, import do nowej gry, plik bez nowych pól', () => {
  const g = structuredClone(G);
  const orig = [...club(ID).colors];
  edit(g, ID, { colors: ['#ABCDEF', '#123456'], stadium: 'Arena Żmigród', cap: '1500' });
  for (const full of [false, true]) {
    const pack = exportPack(g, new Date('2026-11-26T10:00:00Z'), { full });
    assert.equal(pack.v, PACK_V);
    assert.deepEqual(pack.clubs[ID], { colors: ['#ABCDEF', '#123456'], stadium: 'Arena Żmigród', cap: 1500 });
    assert.equal(Object.keys(pack.clubs).filter((id) => CLUBS_L4.some((c) => c.id === id)).length, 1); // tylko zmieniony klub IV ligi
    restoreOriginals();
    assert.deepEqual(club(ID).colors, orig);
    const g2 = structuredClone(G);
    const r = importPack(g2, parsePack(JSON.stringify(pack)));
    assert.equal(r.clubsSkipped, 0);
    assert.deepEqual(club(ID).colors, ['#ABCDEF', '#123456']);
    assert.equal(club(ID).stadium, 'Arena Żmigród'); assert.equal(club(ID).cap, 1500);
    assert.deepEqual(g2.editor.clubs[ID], { colors: ['#ABCDEF', '#123456'], stadium: 'Arena Żmigród', cap: 1500 });
    restoreOriginals();
    applyPack(g2); // zapis gry z datapackiem
    assert.deepEqual(club(ID).colors, ['#ABCDEF', '#123456']);
    restoreOriginals();
  }
  // plik bez nowych pól (v7 z samą nazwą klubu z kadrą) wczytuje się bez zmian w IV lidze
  const old = { type: 'ligapl27-datapack', v: 7, seed: G.seed, clubs: { legia: { name: 'Legia Stara' }, [ID]: { stadium: 'Stary Stadion' } }, players: {} };
  const p = parsePack(JSON.stringify(old));
  assert.deepEqual(p.clubs[ID], { stadium: 'Stary Stadion' });
  // starszy plik nie ma pól v8: colors i cap są pomijane jak nieznane klucze (nawet niepoprawne)
  assert.deepEqual(parsePack(JSON.stringify({ ...old, v: 6, clubs: { [ID]: { colors: ['#000'], cap: 1 } } })).clubs, {});
  const g3 = structuredClone(G);
  importPack(g3, p);
  assert.equal(club(ID).stadium, 'Stary Stadion'); assert.deepEqual(club(ID).colors, orig);
  restoreOriginals();
  // zły kolor w pliku odrzuca plik z nazwą klubu
  const bad = { type: 'ligapl27-datapack', v: PACK_V, clubs: { [ID]: { colors: ['#FFFFFF', 'czerwony'] } } };
  assert.throws(() => parsePack(JSON.stringify(bad)), new RegExp(`Klub ${ID}: Barwa 2`));
  assert.throws(() => parsePack(JSON.stringify({ ...bad, clubs: { [ID]: { cap: 50 } } })), /Pojemność stadionu/);
});

test('IV liga: klub z poziomu 6 (leagueState.extra) wraca do barw z zapisu', () => {
  const g = structuredClone(G);
  const sd = level6SaveData({ id: 'klub-testowy-l6', name: 'Klub Testowy', colors: 'zielono-biale' }, 'opolska');
  g.leagueState = { year: 2026, tiers: { 'klub-testowy-l6': 5 }, groups: {}, extra: { 'klub-testowy-l6': sd } };
  try {
    applyLeagueState(g);
    const c = knownClub('klub-testowy-l6');
    const orig = [...c.colors];
    assert.deepEqual(orig, ['#00843D', '#FFFFFF']);
    edit(g, 'klub-testowy-l6', { colors: ['#010203', '#0A0B0C'], stadium: 'Stadion L6', cap: '700' });
    assert.deepEqual(c.colors, ['#010203', '#0A0B0C']);
    const pack = exportPack(g, new Date('2026-11-26T10:00:00Z'), { full: true });
    assert.deepEqual(pack.clubs['klub-testowy-l6'].colors, ['#010203', '#0A0B0C']);
    applyLeagueState(g); applyPack(g); // wczytanie zapisu: klub tworzony od nowa, zmiany z datapacku
    assert.deepEqual(knownClub('klub-testowy-l6').colors, ['#010203', '#0A0B0C']);
    assert.equal(knownClub('klub-testowy-l6').cap, 700);
    resetClub(g, 'klub-testowy-l6');
    assert.deepEqual(knownClub('klub-testowy-l6').colors, orig);
    assert.equal(knownClub('klub-testowy-l6').stadium, undefined);
  } finally { applyLeagueState({}); applyPack({}); }
});

test('IV liga: formularz i akcje edytora', () => {
  const g = structuredClone(G);
  const ed = { ...newEditorState(), tab: 'clubs', tier: 5, club: ID };
  const html = renderEditor(g, ed);
  for (const id of ['ed-l4-c1', 'ed-l4-c1t', 'ed-l4-c2', 'ed-l4-c2t', 'ed-l4-stadium', 'ed-l4-cap']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /type="color"/); assert.match(html, /data-act="ed-save-l4"/);
  assert.doesNotMatch(html, /data-act="ed-reset-l4"/); assert.doesNotMatch(html, /ed-save-club|Kadra \(/); // bez kadry, finansów i rywali
  // formularz czyta pola z DOM (atrapa)
  const fields = { 'ed-l4-c1t': '#aa0000', 'ed-l4-c2t': '#0000bb', 'ed-l4-stadium': 'Stadion <b>', 'ed-l4-cap': '1 000' };
  const root = { querySelector: (s) => (fields[s.slice(1)] !== undefined ? { value: fields[s.slice(1)] } : null) };
  const r = handleEditorAction(g, ed, 'ed-save-l4', { id: ID }, root);
  assert.equal(r.save, true);
  assert.deepEqual(club(ID).colors, ['#AA0000', '#0000BB']);
  const after = renderEditor(g, ed);
  assert.match(after, /data-act="ed-reset-l4"/);
  assert.doesNotMatch(after, /Stadion <b>/); assert.match(after, /Stadion &lt;b&gt;/); // esc()
  // błąd: szkic zostaje, pola oznaczone
  fields['ed-l4-c1t'] = 'zielony';
  const bad = handleEditorAction(g, ed, 'ed-save-l4', { id: ID }, root);
  assert.equal(bad.save, undefined); assert.ok(ed.errors.colors);
  assert.match(renderEditor(g, ed), /aria-invalid="true"/);
  assert.deepEqual(club(ID).colors, ['#AA0000', '#0000BB']); // bez zmiany w grze
  assert.equal(handleEditorAction(g, ed, 'ed-reset-l4', { id: ID }, root).save, true);
  assert.deepEqual(club(ID).colors, ['#FFFFFF', '#C8102E', '#00843D']); // oryginał z listy właściciela (3. barwa opcjonalna)
  restoreOriginals();
});
