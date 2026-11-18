// Instrukcje indywidualne, etap 2 (interfejs, src/ui/playerInstrView.js): okno zawodnika tylko z instrukcjami dla jego
// pozycji, tabela N zawodników x 7 instrukcji z polami „nie dotyczy”, znacznik przy nazwisku i na boisku, zapis
// ustawień w taktyce, menu zawodnika w meczu i zmiana w meczu przez changeTactics (koszt zgrania). Bez q, u i piReport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics, refreshTactics } from '../src/engine/lineup.js';
import { formationById } from '../src/data/formations.js';
import { clubById } from '../src/data/clubs_pl.js';
import { PLAYER_INSTRUCTIONS, PI_IDS, playerInstrCount } from '../src/data/playerInstructions.js';
import { createMatch, step, changeTactics, checkTacticPatch } from '../src/engine/match/match.js';
import { fieldPlayers } from '../src/engine/match/teams.js';
import { renderTactics } from '../src/ui/tacticsView.js';
import { matchMenuItems } from '../src/ui/matchdayView.js';
import {
  piPlayerHtml, piTableHtml, piMarker, piSummary, piWith, piWithout, piPatch, piRowsFromTactics, piFor, teamValueLabel, PI_FILTERS,
} from '../src/ui/playerInstrView.js';

const world = generateWorld(3);
const squad = squadOf(world, 'legia').map((p) => ({ ...p }));
const base = createTactics(squad, { benchSize: 9 });
const f = formationById(base.formation);
const attr = (name, data) => `data-act="pi-${name}"${Object.entries(data).map(([k, v]) => ` data-${k}="${v}"`).join('')}`;
const rows = piRowsFromTactics(squad, base);
const clean = (html) => {
  assert.doesNotMatch(html, /undefined|NaN|null/, 'bez undefined, NaN, null');
  assert.doesNotMatch(html, /—/, 'bez pauzy em');
  assert.doesNotMatch(html, /piReport|"q"|jakość wykonania/i, 'bez ukrytej jakości');
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /\b[A-ZĄĆĘŁŃÓŚŹŻ]{4,}\b/, 'bez etykiet wielkimi literami');
};
const rowsIn = (html) => [...html.matchAll(/<div class="pi-row[^"]*" data-k="(\w+)">/g)].map((m) => m[1]);

test('Okno zawodnika: tylko instrukcje dla jego pozycji, „Jak drużyna” z wartością drużyny, ogólne opisy', () => {
  const exp = { BR: ['pass'], ŚO: ['pass', 'tackle', 'press'], NAP: ['pass', 'dribble', 'shoot', 'tackle', 'run', 'press'], BO: ['pass', 'dribble', 'cross', 'tackle', 'run', 'press'] };
  for (const [pos, ids] of Object.entries(exp)) {
    const p = squad.find((x) => x.pos === pos);
    assert.ok(p, `zawodnik ${pos}`);
    const html = piPlayerHtml({ row: { id: p.id, p, slotPos: null, zone: 'out' }, instructions: base.instructions, attr });
    assert.deepEqual(rowsIn(html), ids, pos);
    clean(html);
    assert.match(html, new RegExp(p.name));
    assert.match(html, /Przywróć jak drużyna<\/button>/);
    assert.match(html, /data-act="pi-reset"[^>]* disabled>Przywróć/, 'bez instrukcji: reset wyłączony');
    assert.match(html, /Wszyscy zawodnicy/);
    assert.match(html, /Gotowe/);
  }
  // Miejsce w składzie liczy się jak pozycja zawodnika (np. ŚO na DP: Pozycja i strzały z dystansu)
  const cb = squad.find((x) => x.pos === 'ŚO');
  const asDm = piPlayerHtml({ row: { id: cb.id, p: cb, slotPos: 'DP', zone: 'xi' }, instructions: base.instructions, attr });
  assert.deepEqual(rowsIn(asDm), ['pass', 'shoot', 'tackle', 'run', 'press']);
  assert.match(asDm, /W składzie na pozycji DP, nominalnie ŚO/);
  // Wartość drużyny przy „Jak drużyna” i opcja równa drużynie wyłączona (tak gra już cała drużyna)
  const ins = { ...base.instructions, tackling: 'hard', passing: 'short' };
  const html = piPlayerHtml({ row: { id: cb.id, p: cb, slotPos: null, zone: 'out' }, entry: { press: 1 }, instructions: ins, attr });
  assert.match(html, /Jak drużyna<small>teraz: twarda<\/small>/);
  assert.match(html, /Jak drużyna<small>teraz: krótkie<\/small>/);
  assert.match(html, /data-k="tackle" data-v="1" aria-pressed="false" disabled/);
  assert.match(html, /data-k="press" data-v="1" aria-pressed="true"/);
  assert.match(html, /<div class="pi-row is-set" data-k="press">/);
  assert.match(html, /Odbiór piłki wyżej\. Ryzyko: zmęczenie i faule\./, 'opis zysku i ryzyka wybranej opcji');
  assert.doesNotMatch(html, /data-act="pi-reset"[^>]* disabled/, 'z instrukcją: reset aktywny');
  assert.equal(teamValueLabel('dribble', ins), 'normalnie');
});

test('Tabela: N zawodników x 7 instrukcji, pola „nie dotyczy”, nadpisania podświetlone, filtry i widok telefonu', () => {
  const map = { [base.xi[5]]: { tackle: 1, press: 1 } };
  const html = piTableHtml({ rows, map, instructions: base.instructions, attr });
  clean(html);
  const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
  const trs = [...table.matchAll(/<tr class="pit-row[^"]*">([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  assert.equal(trs.length, squad.length, 'wszyscy zawodnicy kadry');
  for (const [i, tr] of trs.entries()) {
    const sel = (tr.match(/<select class="pit-sel"/g) ?? []).length;
    const na = (tr.match(/class="pit-na"/g) ?? []).length;
    assert.equal(sel + na, PI_IDS.length, `wiersz ${i}: 7 kolumn`);
    assert.equal(sel, PLAYER_INSTRUCTIONS.filter((d) => piFor(d.id, rows[i])).length);
    if (rows[i].p.pos === 'BR' && !rows[i].slotPos) assert.equal(na, 6, 'bramkarz: tylko podania');
  }
  assert.equal((table.match(/<th scope="col"/g) ?? []).length, 8, 'nazwisko i 7 instrukcji');
  assert.ok(table.includes('nie dotyczy'));
  // Kolejność: pierwszy skład (miejsce slotu), ławka, reszta
  assert.deepEqual(rows.slice(0, 11).map((r) => r.id), base.xi);
  assert.deepEqual(rows.slice(0, 11).map((r) => r.slotPos), f.slots.map((s) => s.pos));
  assert.deepEqual(new Set(rows.slice(11, 11 + base.bench.length).map((r) => r.id)), new Set(base.bench));
  assert.match(table, /Pierwszy skład[\s\S]*Ławka rezerwowych[\s\S]*Poza kadrą meczową/);
  // Nadpisanie: komórka podświetlona, wybrana opcja, znacznik przy nazwisku
  assert.equal((table.match(/<td class="is-set">/g) ?? []).length, 2);
  assert.match(table, /<option value="1" selected>Twardy<\/option>/);
  assert.match(table, /Instrukcje: odbiór twardy, pressing więcej/);
  assert.match(html, /Przywróć wszystkim jak drużyna/);
  assert.doesNotMatch(html, /data-act="pi-resetAll" disabled/);
  assert.match(piTableHtml({ rows, map: {}, instructions: base.instructions, attr }), /data-act="pi-resetAll" disabled/);
  // Filtry pozycji: chipy i przefiltrowane wiersze
  assert.deepEqual(PI_FILTERS.map(([, l]) => l), ['Wszyscy', 'BR', 'Obrona', 'Pomoc', 'Atak', 'Skład', 'Ławka']);
  const gk = piTableHtml({ rows, map, instructions: base.instructions, filter: 'GK', attr });
  assert.equal((gk.match(/<tr class="pit-row/g) ?? []).length, rows.filter((r) => (r.slotPos ?? r.p.pos) === 'BR').length);
  const xi = piTableHtml({ rows, map, instructions: base.instructions, filter: 'xi', attr });
  assert.equal((xi.match(/<tr class="pit-row/g) ?? []).length, 11);
  assert.match(xi, /data-act="pi-filter" data-f="xi" aria-pressed="true"/);
  // Telefon: jedna instrukcja naraz (wybór chipem) i lista zawodników, których dotyczy, z trzema przyciskami
  const one = piTableHtml({ rows, map, instructions: base.instructions, pick: 'cross', attr });
  const list = one.slice(one.indexOf('<ul class="pit-list">'), one.indexOf('</ul>', one.indexOf('<ul class="pit-list">')));
  const items = (list.match(/<li class="pit-item/g) ?? []).length;
  assert.equal(items, rows.filter((r) => piFor('cross', r)).length);
  assert.equal((list.match(/data-act="pi-set"/g) ?? []).length, items * 3);
  assert.match(one, /data-act="pi-pick" data-k="cross" aria-pressed="true"/);
  assert.match(one, /nie dotyczy \d+ zawodników z tej listy/);
});

test('Znacznik: ikona z opisem w title i aria-label przy nazwisku i na boisku, bez instrukcji brak', () => {
  assert.equal(piMarker(null), '');
  assert.equal(piMarker({}), '');
  assert.equal(piSummary({ tackle: 1, press: 1, pass: -1 }), 'podania krótsze, odbiór twardy, pressing więcej');
  const m = piMarker({ tackle: 1, press: 1 });
  assert.match(m, /role="img" aria-label="Instrukcje: odbiór twardy, pressing więcej" title="Instrukcje: odbiór twardy, pressing więcej"><svg/);
  const id = base.xi[5]; const benchId = base.bench[0];
  const t = { ...base, playerInstr: { [id]: { tackle: 1, press: 1 }, [benchId]: { pass: -1 } } };
  const html = renderTactics({ squad, tactics: t, sel: null, benchSize: 9 });
  clean(html.replace(/null/g, ''));
  assert.match(html, /Instrukcje indywidualne \(2\)<\/button>/);
  assert.match(html, /data-act="pi-table"/);
  assert.match(html, /class="pi-mark slot-btn__pi"[^>]*aria-label="Instrukcje: odbiór twardy, pressing więcej"/, 'na boisku');
  assert.match(html, /aria-label="[^"]*, instrukcje: odbiór twardy, pressing więcej"/, 'opis w etykiecie miejsca na boisku');
  assert.equal((html.match(/class="pi-mark"/g) ?? []).length, 2, 'w listach: zawodnik z XI i z ławki');
  const none = renderTactics({ squad, tactics: base, sel: null, benchSize: 9 });
  assert.doesNotMatch(none, /pi-mark/);
  assert.match(none, /Instrukcje indywidualne \(0\)/);
});

test('Ustawienia przed meczem: zmiana i reset w g.tactics.playerInstr, zachowane przy odświeżeniu składu', () => {
  const g = { tactics: { ...base, playerInstr: {} } };
  const a = base.xi[5]; const b = base.xi[6];
  g.tactics = { ...g.tactics, playerInstr: piWith(g.tactics.playerInstr, a, 'tackle', 1) };
  g.tactics = { ...g.tactics, playerInstr: piWith(g.tactics.playerInstr, a, 'press', -1) };
  g.tactics = { ...g.tactics, playerInstr: piWith(g.tactics.playerInstr, b, 'pass', 1) };
  assert.deepEqual(g.tactics.playerInstr, { [a]: { tackle: 1, press: -1 }, [b]: { pass: 1 } });
  assert.equal(playerInstrCount(g.tactics.playerInstr), 2);
  g.tactics = { ...g.tactics, playerInstr: piWith(g.tactics.playerInstr, a, 'press', 0) };
  assert.deepEqual(g.tactics.playerInstr[a], { tackle: 1 }, '„Jak drużyna” usuwa klucz');
  g.tactics = { ...g.tactics, playerInstr: piWith(g.tactics.playerInstr, b, 'pass', 0) };
  assert.ok(!(b in g.tactics.playerInstr), 'pusty wpis znika');
  assert.deepEqual(piWith({}, a, 'nieznana', 1), {}, 'nieznana instrukcja ignorowana');
  assert.deepEqual(piWith({}, a, 'pass', 2), {}, 'tylko -1 i 1');
  const before = g.tactics.playerInstr;
  g.tactics = { ...g.tactics, playerInstr: piWithout(g.tactics.playerInstr, a) };
  assert.deepEqual(g.tactics.playerInstr, {});
  assert.deepEqual(before, { [a]: { tackle: 1 } }, 'wejście bez zmian');
  const kept = refreshTactics({ ...base, playerInstr: { [a]: { tackle: 1 } } }, squad, { benchSize: 9 }).tactics;
  assert.deepEqual(kept.playerInstr, { [a]: { tackle: 1 } });
});

test('Mecz: opcja w menu zawodnika i zmiana ze szkicu okna przez changeTactics z kosztem zgrania', () => {
  // Menu: opcja tylko na życzenie (zawodnik gracza na boisku albo na ławce), z obecnymi instrukcjami w podpowiedzi
  assert.ok(!matchMenuItems({ mine: true, on: true }).some((x) => x.act === 'pi'));
  const it = matchMenuItems({ manage: true, mine: true, on: true, pi: 'odbiór twardy' }).find((x) => x.act === 'pi');
  assert.equal(it.label, 'Instrukcje zawodnika');
  assert.equal(it.hint, 'Teraz: odbiór twardy');
  assert.equal(matchMenuItems({ mine: true, onBench: true, pi: true }).find((x) => x.act === 'pi').hint, 'Podania, odbiór, pressing i inne');

  const side = (id) => ({ club: clubById(id), squad: squadOf(world, id), tactics: createTactics(squadOf(world, id), { benchSize: 9 }), ai: false });
  const M = createMatch({ seed: 'pi-ui', home: side('legia'), away: side('lech') });
  while (M.minute < 25) step(M);
  const T = M.teams[0];
  const cb = fieldPlayers(T).filter((x) => x.slot.pos === 'ŚO');
  const ids = [...T.players, ...T.bench].filter((x) => !x.sentOff).map((x) => x.id);
  // Szkic okna: dwóch obrońców, potem cofnięcie jednego
  let draft = { ...(T.tactics.playerInstr ?? {}) };
  draft = piWith(draft, cb[0].id, 'tackle', -1);
  draft = piWith(draft, cb[1].id, 'press', 1);
  let patch = piPatch(T.tactics.playerInstr, draft, ids);
  assert.deepEqual(patch, { [cb[0].id]: { tackle: -1 }, [cb[1].id]: { press: 1 } });
  assert.equal(checkTacticPatch(M, 0, { playerInstr: patch }), null);
  const S0 = T.S;
  const r = changeTactics(M, 0, { playerInstr: patch });
  assert.ok(r.ok);
  assert.equal(r.cost, 4, 'ok. 2 za zawodnika');
  assert.equal(T.S, S0 - 4);
  assert.deepEqual(T.tactics.playerInstr, { [cb[0].id]: { tackle: -1 }, [cb[1].id]: { press: 1 } });
  // Kolejny szkic: reset wszystkich (null) i zawodnik spoza kadry pominięty
  draft = {};
  patch = piPatch(T.tactics.playerInstr, { ...draft, obcy: { tackle: 1 } }, ids);
  assert.deepEqual(patch, { [cb[0].id]: null, [cb[1].id]: null });
  while (M.phase !== 'break') step(M);
  const Sb = T.S;
  const r2 = changeTactics(M, 0, { playerInstr: patch });
  assert.ok(r2.ok);
  assert.equal(r2.adapt, 0);
  assert.equal(T.S, Sb, 'w przerwie bez kosztu zgrania');
  assert.deepEqual(T.tactics.playerInstr, {});
  // Zmiana jednej instrukcji przy innych bez zmian: do silnika idzie tylko zmieniony klucz
  assert.deepEqual(piPatch({ a: { tackle: 1, press: 1 } }, { a: { tackle: 1 } }), { a: { press: 0 } });
  assert.deepEqual(piPatch({ a: { tackle: 1 } }, { a: { tackle: 1 } }), {});
});
