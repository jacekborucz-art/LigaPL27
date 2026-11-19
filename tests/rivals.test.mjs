// Najwięksi rywale klubu w edytorze i datapacku (src/data/kibice.js, src/career/editor.js, docs/edytor.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureTraining } from '../src/training/index.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { rivalry } from '../src/career/fans.js';
import { isDerby } from '../src/match/studio.js';
import { clubById } from '../src/data/clubs_pl.js';
import {
  editRival, rivalsOf, checkClub, exportPack, parsePack, importPack, applyPack, restoreOriginals, PACK_V,
} from '../src/career/editor.js';
import { renderEditor, newEditorState, handleEditorAction } from '../src/ui/editorView.js';

function newGame(seed = 5) {
  const g = { seed, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: 'widzew' }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 9 });
  ensureTraining(g); ensureCareer(g);
  return g;
}

test('Edytor: nowy rywal działa w obie strony, zmiana intensywności i usunięcie (także derby z regionu)', () => {
  restoreOriginals();
  const g = newGame();
  assert.equal(rivalry('legia', 'lech'), 2, 'dane gry');
  assert.equal(rivalry('korona', 'pogon-szczecin'), 0);
  assert.equal(editRival(g, 'korona', 'pogon-szczecin', 3), 1);
  assert.equal(rivalry('pogon-szczecin', 'korona'), 3, 'w obie strony');
  assert.equal(rivalsOf(g, 'pogon-szczecin').korona, 3);
  assert.equal(editRival(g, 'korona', 'pogon-szczecin', 3), 0, 'bez zmiany');
  // Derby z regionu (Warszawa) bez wpisu: usunięcie zapisuje 0
  assert.equal(rivalry('legia', 'polonia-warszawa'), 2);
  editRival(g, 'legia', 'polonia-warszawa', 0);
  assert.equal(rivalry('legia', 'polonia-warszawa'), 0);
  assert.equal(isDerby(clubById('legia'), clubById('polonia-warszawa')), false, 'bez derby po usunięciu');
  // Powrót do wartości z danych gry usuwa wpis z datapacku
  editRival(g, 'legia', 'lech', 3); assert.equal(rivalry('legia', 'lech'), 3);
  editRival(g, 'legia', 'lech', 2); assert.equal(g.editor.rivals['legia|lech'], undefined);
  // Zapis gry: po wczytaniu (applyPack) rywale wracają
  restoreOriginals(); assert.equal(rivalry('korona', 'pogon-szczecin'), 0);
  applyPack(g); assert.equal(rivalry('korona', 'pogon-szczecin'), 3);
  restoreOriginals();
});

test('Datapack v4: rywale w pliku, wczytanie w innej grze, walidacja, starszy plik bez rywali', () => {
  restoreOriginals();
  const g = newGame();
  editRival(g, 'radomiak', 'lech', 2);
  const full = exportPack(g, new Date('2026-11-19T10:00:00Z'), { full: true });
  assert.equal(full.v, PACK_V); assert.ok(PACK_V >= 4);
  assert.equal(full.clubs.radomiak.rivals.lech, 2);
  assert.equal(full.clubs.lech.rivals.radomiak, 2);
  const changes = exportPack(g, new Date('2026-11-19T10:00:00Z'));
  assert.equal(changes.clubs.radomiak.rivals.lech, 2, 'eksport zmian też ma rywali');
  restoreOriginals();
  const other = newGame(9);
  assert.equal(rivalry('radomiak', 'lech'), 0);
  importPack(other, parsePack(JSON.stringify(full)));
  assert.equal(rivalry('radomiak', 'lech'), 2);
  assert.equal(rivalry('legia', 'lech'), 2, 'pełny plik nie psuje danych gry');
  assert.ok(Object.keys(checkClub({ rivals: { nieznany: 2 } }).errors).length);
  assert.ok(Object.keys(checkClub({ rivals: { lech: 5 } }).errors).length);
  assert.deepEqual(checkClub({ rivals: { lech: 0 } }).errors, {});
  const v3 = { type: 'ligapl27-datapack', v: 3, seed: 1, clubs: { legia: { name: 'Legia Warszawa' } }, players: {} };
  assert.doesNotThrow(() => parsePack(JSON.stringify(v3)));
  restoreOriginals();
});

test('Formularz klubu: sekcja rywali, zapis zmienionej intensywności i nowego rywala', () => {
  restoreOriginals();
  const g = newGame();
  const ed = newEditorState(); handleEditorAction(g, ed, 'ed-club', { id: 'cracovia' });
  const html = renderEditor(g, ed);
  assert.match(html, /Najwięksi rywale/);
  assert.match(html, /id="ed-rv-wisla-krakow"/);
  const vals = { 'ed-rv-wisla-krakow': '2', 'ed-rv-hutnik': '1', 'ed-rv-new': 'jagiellonia', 'ed-rv-new-v': '1' };
  const root = { querySelector: (sel) => { const id = sel.slice(1); return id in vals ? { value: vals[id] } : null; } };
  const r = handleEditorAction(g, ed, 'ed-save-rivals', { id: 'cracovia' }, root);
  assert.ok(r.save);
  assert.equal(rivalry('cracovia', 'wisla-krakow'), 2);
  assert.equal(rivalry('cracovia', 'jagiellonia'), 1);
  restoreOriginals();
});
