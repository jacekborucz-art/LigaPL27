// Strzałki ruchu, interfejs (docs/strzalki-ruchu.md): tryb strzałek na boisku składu, kompas tylko z dozwolonymi
// kierunkami, warstwa SVG pod żetonami (kierunek względem strony zawodnika), legenda, ostrzeżenie o obu bocznych
// obrońcach, „Ruch” w oknie zawodnika i w tabeli (7 kolumn), przyciąganie do 8 kierunków i zmiana w meczu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics } from '../src/engine/lineup.js';
import { formationById } from '../src/data/formations.js';
import { clubById } from '../src/data/clubs_pl.js';
import { PI_IDS, arrowsFor } from '../src/data/playerInstructions.js';
import { createMatch, step, changeTactics } from '../src/engine/match/match.js';
import { renderTactics } from '../src/ui/tacticsView.js';
import { piPlayerHtml, piTableHtml, piRowsFromTactics, piWithDir, piPatch, piSummary, piChangeText, piDirsFor } from '../src/ui/playerInstrView.js';
import { arrowsSvg, arrowVec, compassHtml, compassCell, snapDir, fbWarning } from '../src/ui/arrowsView.js';

const world = generateWorld(3);
const squad = squadOf(world, 'legia').map((p) => ({ ...p }));
const base = createTactics(squad, { benchSize: 9, formation: '4231' });
const f = formationById(base.formation);
const idx = (pos) => f.slots.map((s, i) => [s, i]).filter(([s]) => s.pos === pos).map(([, i]) => i);
const [lbI, rbI] = idx('BO');
const lb = base.xi[lbI]; const rb = base.xi[rbI];
const clean = (html) => {
  assert.doesNotMatch(html, /undefined|NaN/, 'bez undefined i NaN');
  assert.doesNotMatch(html, /—/, 'bez pauzy em');
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /\b[A-ZĄĆĘŁŃÓŚŹŻ]{4,}\b/, 'bez etykiet wielkimi literami');
};
const attr = (name, data) => `data-act="pi-${name}"${Object.entries(data).map(([k, v]) => ` data-${k}="${v}"`).join('')}`;

test('Ekran składu: przełącznik Strzałki, tryb bez przeciągania, strzałki SVG pod żetonami zawsze widoczne', () => {
  const t = { ...base, playerInstr: { [lb]: { run: 1, lat: -1 }, [rb]: { lat: -1 } } };
  const off = renderTactics({ squad, tactics: t, sel: null, benchSize: 9 });
  clean(off.replace(/null/g, ''));
  assert.match(off, /data-act="tarrows" aria-pressed="false"[^>]*>.*Strzałki \(2\)<\/button>/s);
  // Strzałki widać także poza trybem: SVG przed żetonami (pod nimi), znaczniki w defs, linie bez skalowania grubości
  const pitch = off.slice(off.indexOf('<div class="pitch2'), off.indexOf('</div>', off.indexOf('<div class="pitch2')));
  assert.ok(pitch.indexOf('<svg class="pa"') < pitch.indexOf('slot-btn'), 'warstwa pod żetonami');
  assert.match(pitch, /viewBox="0 0 68 100" preserveAspectRatio="none"/);
  assert.match(pitch, /<defs><marker id="tpa-run"/);
  assert.equal((pitch.match(/class="pa__l pa__l--/g) ?? []).length, 2);
  assert.match(pitch, /pa__l--run[^>]*marker-end="url\(#tpa-run\)"/);
  assert.match(pitch, /pa__l--lat/);
  assert.match(off, /class="pa-legend"/, 'legenda pod boiskiem');
  assert.match(off, /data-act="tslot"/, 'poza trybem: zwykłe przeciąganie i wybór');
  assert.match(off, /aria-label="BO: [^"]*ruch skos do środka/, 'opis ruchu w etykiecie zawodnika');
  // Tryb strzałek: zawodnicy otwierają kompas, bez atrybutów przeciągania
  const on = renderTactics({ squad, tactics: t, sel: null, benchSize: 9, arrows: { on: true, pick: null } });
  const pitchOn = on.slice(on.indexOf('<div class="pitch2'), on.indexOf('</svg>') + 6) + on.slice(on.indexOf('slot-btn'), on.indexOf('<p class="tac__msg'));
  assert.match(on, /<div class="tac is-arrows/);
  assert.match(on, /data-act="tarrows" aria-pressed="true"/);
  assert.doesNotMatch(pitchOn, /data-drag=/, 'bez przeciągania zawodników na boisku');
  assert.equal((on.match(/data-act="tarrow-pick"/g) ?? []).length, 11);
  assert.match(on, /data-act="tarrow-pick" data-idx="0"[^>]*aria-disabled="true"/, 'bramkarz bez strzałek');
  assert.match(on, /Strzałki: dotknij zawodnika/);
});

test('Kompas: tylko dozwolone kierunki pozycji, przyciski z opisem, środek „brak ruchu”', () => {
  for (const pos of ['BO', 'DP', 'OP', 'NAP']) {
    const i = idx(pos)[0];
    const html = renderTactics({ squad, tactics: base, sel: null, benchSize: 9, arrows: { on: true, pick: i } });
    const comp = html.slice(html.indexOf('<div class="acomp"'), html.indexOf('</div>', html.indexOf('acomp__cap')));
    const dirs = [...comp.matchAll(/data-act="tarrow-set" data-id="[^"]+" data-d="(\w*)"/g)].map((m) => m[1]);
    assert.deepEqual(dirs.filter(Boolean), arrowsFor(pos), pos);
    assert.ok(dirs.includes(''), `${pos}: brak ruchu`);
    assert.match(comp, /role="dialog"/);
    assert.match(comp, /data-act="tarrow-close"/);
    clean(comp);
  }
  // Środkowy obrońca i bramkarz: bez kompasu
  const cb = renderTactics({ squad, tactics: base, sel: null, benchSize: 9, arrows: { on: true, pick: idx('ŚO')[0] } });
  assert.doesNotMatch(cb, /class="acomp"/);
  // Obecny kierunek zaznaczony
  const c = compassHtml({ name: 'Nowak', pos: 'BO', x: 15, dirs: arrowsFor('BO'), cur: 'fi', attr: (d) => `data-x="${d}"` });
  assert.match(c, /class="acomp__b is-on" data-x="fi" data-dir="fi" aria-pressed="true" aria-label="Skos do środka \(teraz\)"/);
});

test('Kierunek względem strony: do środka u lewego w prawo, u prawego w lewo; kompas i przeciąganie', () => {
  assert.ok(arrowVec('i', 15).dx > 0 && arrowVec('i', 85).dx < 0);
  assert.ok(arrowVec('o', 15).dx < 0 && arrowVec('o', 85).dx > 0);
  assert.ok(arrowVec('f', 50).dy > 0 && arrowVec('b', 50).dy < 0);
  // SVG: do środka u lewego obrońcy kończy się na prawo od startu
  const svg = arrowsSvg([{ x: 15, y: 26, dir: 'i' }, { x: 85, y: 26, dir: 'i' }], { map: (x, y) => [x, 100 - y] });
  const ds = [...svg.matchAll(/class="pa__l[^"]*" d="M([\d.]+) [\d.]+L([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(ds[0][1] > ds[0][0] && ds[1][1] < ds[1][0]);
  // Kompas: lewy obrońca, skos do środka w prawym górnym rogu; prawy w lewym górnym; na poziomym boisku do przodu w prawo
  assert.deepEqual([compassCell('fi', 15).c, compassCell('fi', 15).r], [3, 1]);
  assert.deepEqual([compassCell('fi', 85).c, compassCell('fi', 85).r], [1, 1]);
  assert.deepEqual([compassCell('f', 50).lc, compassCell('f', 50).lr], [3, 2]);
  // Przeciągnięcie na PC przyciągane do 8 kierunków
  assert.equal(snapDir(0, -50, 15), 'f');
  assert.equal(snapDir(40, -38, 15), 'fi', 'lewy: w górę i w prawo');
  assert.equal(snapDir(40, -38, 85), 'fo', 'prawy: w górę i w prawo');
  assert.equal(snapDir(-50, 4, 15), 'o');
  assert.equal(snapDir(0, 60, 50), 'b');
  assert.equal(snapDir(30, 30, 15), null, 'w tył i w bok: brak takiego kierunku');
  assert.equal(snapDir(50, 0, 50, true), 'f', 'poziome boisko w meczu');
});

test('Ostrzeżenie o obu bocznych obrońcach do przodu (bez blokady), asekuracja je wyłącza', () => {
  assert.match(fbWarning([{ pos: 'BO', dir: 'f' }, { pos: 'BO', dir: 'fo' }]), /ryzyko kontry/);
  assert.equal(fbWarning([{ pos: 'BO', dir: 'f' }, { pos: 'BO', dir: 'i' }]), '');
  assert.equal(fbWarning([{ pos: 'BO', dir: 'f' }]), '');
  const t = { ...base, playerInstr: { [lb]: { run: 1 }, [rb]: { run: 1, lat: 1 } } };
  const html = renderTactics({ squad, tactics: t, sel: null, benchSize: 9 });
  assert.match(html, /<p class="tac__msg is-msg is-warn" role="status">Obaj boczni obrońcy idą do przodu/);
});

test('Ruch w oknie zawodnika i w tabeli: kierunek zamiast osobnej kolumny lat (tabela 7 kolumn)', () => {
  const rows = piRowsFromTactics(squad, base);
  const row = rows.find((r) => r.id === lb);
  const html = piPlayerHtml({ row, entry: { run: 1, lat: -1 }, instructions: base.instructions, attr });
  clean(html);
  assert.match(html, /<div class="pi-row is-set" data-k="run">[\s\S]*?Ruch/);
  const dirs = [...html.matchAll(/data-act="pi-dir" data-id="[^"]+" data-d="(\w*)"/g)].map((m) => m[1]);
  assert.deepEqual(dirs, ['', ...piDirsFor(row)]);
  assert.match(html, /data-d="fi" aria-pressed="true"/);
  assert.match(html, /underlap/, 'opis roli dla pozycji');
  assert.doesNotMatch(html, /data-k="lat"/, 'bez osobnego wiersza lat');
  // Tabela: nadal 7 kolumn instrukcji, „Ruch” jako lista kierunków
  const map = { [lb]: { run: 1, lat: -1 } };
  const tbl = piTableHtml({ rows, map, instructions: base.instructions, attr });
  const table = tbl.slice(tbl.indexOf('<table'), tbl.indexOf('</table>'));
  assert.equal((table.match(/<th scope="col"/g) ?? []).length, PI_IDS.length + 1);
  assert.equal(PI_IDS.length, 7);
  assert.match(table, /<th scope="col"><span>Ruch<\/span>/);
  assert.match(table, /data-k="run"[^>]*>[\s\S]*?<option value="fi" selected>Skos do środka<\/option>/);
  assert.match(table, /Instrukcje: ruch skos do środka/);
  // Telefon: Ruch jako lista wyboru
  const one = piTableHtml({ rows, map, instructions: base.instructions, pick: 'run', attr });
  assert.match(one.slice(one.indexOf('pit-one')), /<select class="pit-sel" data-id="[^"]+" data-k="run"/);
  // Zapis: run i lat razem
  assert.deepEqual(piWithDir({}, 'a', 'fo'), { a: { run: 1, lat: 1 } });
  assert.deepEqual(piWithDir({ a: { run: 1, lat: 1, tackle: 1 } }, 'a', 'b'), { a: { run: -1, tackle: 1 } });
  assert.deepEqual(piWithDir({ a: { run: 1 } }, 'a', ''), {});
  assert.equal(piSummary({ run: -1, press: 1 }), 'ruch cofnięcie, pressing więcej');
});

test('Mecz: strzałka ze szkicu okna idzie przez changeTactics (run i lat), opis kolejki i relacji', () => {
  const side = (id) => ({ club: clubById(id), squad: squadOf(world, id), tactics: createTactics(squadOf(world, id), { benchSize: 9, formation: '4231' }), ai: false });
  const M = createMatch({ seed: 'arr-ui', home: side('legia'), away: side('lech') });
  while (M.minute < 20) step(M);
  const T = M.teams[0];
  const bo = T.players.find((x) => x.on && x.slot.pos === 'BO');
  const draft = piWithDir(T.tactics.playerInstr, bo.id, 'i');
  const patch = piPatch(T.tactics.playerInstr, draft, [bo.id]);
  assert.deepEqual(patch, { [bo.id]: { lat: -1 } });
  assert.equal(piChangeText(patch[bo.id], draft[bo.id]), 'ruch do środka');
  const S0 = T.S;
  const r = changeTactics(M, 0, { playerInstr: patch });
  assert.ok(r.ok && r.cost === 2 && T.S === S0 - 2, 'koszt zgrania jak instrukcja');
  assert.match(M.events.at(-1).text, /ruch: do środka/);
  step(M);
  assert.equal(bo.pi.dir, 'i');
  // Usunięcie strzałki: oba klucze jak drużyna
  const back = piPatch(T.tactics.playerInstr, piWithDir(T.tactics.playerInstr, bo.id, ''), [bo.id]);
  assert.deepEqual(back, { [bo.id]: null });
});
