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
  packFileName, resetClub, clearPack, PACK_TYPE, PACK_V,
  peopleValues, checkCoach, checkOwner, checkStaff, editCoach, editOwner, editStaff,
  EDIT_SQUAD, squadSize, releaseToFree, joinFromFree, checkNewPlayer, createFreePlayer, checkReferee, editReferee, refValues,
} from '../src/career/editor.js';
import { coachOf } from '../src/career/coaches.js';
import { ensureReferees } from '../src/career/referees.js';
import { proficiency } from '../src/engine/positions.js';
import { GAME_VERSION } from '../src/config/version.js';
import { ownerOf } from '../src/career/owners.js';
import { renderEditor, newEditorState, handleEditorAction, findPlayers, LIST_CAP } from '../src/ui/editorView.js';
import { sysDialogHtml } from '../src/ui/sysMenu.js';
import { crestHtml } from '../src/ui/crest.js';

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
  assert.equal(pack.v, PACK_V); assert.equal(pack.game, GAME_VERSION);
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
  assert.throws(() => parsePack(JSON.stringify({ type: PACK_TYPE, v: 99 })), /nowszej gry/);
  assert.throws(() => parsePack(JSON.stringify({ type: PACK_TYPE, v: 0 })), /nieznaną wersję/);
  // Wersja 1 (starsze pliki) wczytuje się bez błędu
  assert.equal(parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, seed: 7, clubs: { legia: { name: 'Legia Stara' } } })).clubs.legia.name, 'Legia Stara');
  assert.throws(() => parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, clubs: { legia: { capacity: 5 } } })), /Pojemność/);
  assert.throws(() => parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, players: { x: { attrs: { POD: 30 } } } })), /Podania/);
  assert.throws(() => parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, clubs: [] })), /format/);
  const g = structuredClone(G);
  const r = importPack(g, parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, seed: 7, clubs: { 'nie-ma-takiego': { name: 'Klub' } } })));
  assert.equal(r.clubsSkipped, 1);
  restoreOriginals();
});

test('Nazwy klubów kariery: zapisane w grze przy pierwszym wczytaniu, potem nakładane z zapisu (zmiana nazw w aktualizacji nie rusza kariery)', () => {
  restoreOriginals();
  const orig = clubById('legia').name;
  const g = structuredClone(G);
  delete g.names;
  applyPack(g);
  assert.equal(g.names.legia[0], orig, 'zapis dostaje nazwy z chwili wczytania');
  assert.ok(Object.keys(g.names).length > 54, 'także kluby III i IV ligi');
  g.names.legia = ['Legia Stara Nazwa', 'LSN']; // jak gdyby aktualizacja gry zmieniła nazwę po zapisie
  const saved = JSON.parse(JSON.stringify(g)); // plik JSON zapisu
  applyPack(saved);
  assert.equal(clubById('legia').name, 'Legia Stara Nazwa');
  assert.equal(clubById('legia').short, 'LSN');
  applyPack(structuredClone(G)); // inna gra: jej własne nazwy
  assert.equal(clubById('legia').name, orig);
  restoreOriginals();
});

test('Własny herb klubu: zapis w datapacku, eksport, wczytanie u kolegi, pierwszeństwo przed tarczą', () => {
  restoreOriginals();
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.ok(checkClub({ crest: 'data:text/html;base64,AAAA' }).errors.crest);
  assert.ok(checkClub({ crest: 'javascript:alert(1)' }).errors.crest);
  const g = structuredClone(G);
  const r = checkClub({ crest: PNG });
  assert.deepEqual(r.errors, {});
  assert.equal(editClub(g, 'legia', r.value), 1);
  assert.equal(g.editor.clubs.legia.crest, PNG);
  assert.ok(crestHtml(clubById('legia')).includes(PNG));
  const file = JSON.stringify(exportPack(g));
  restoreOriginals();
  assert.ok(!crestHtml(clubById('legia')).includes('data:image'), 'inna gra bez herbu z pliku');
  const friend = structuredClone(G);
  importPack(friend, parsePack(file));
  assert.ok(crestHtml(clubById('legia')).includes(PNG), 'herb z pliku mimo ukrytych herbów datapacku');
  const full = exportPack(g, new Date(), { full: true });
  assert.equal(full.clubs.legia.crest, PNG, 'pełny datapack też niesie herb');
  editClub(friend, 'legia', { crest: '' });
  assert.ok(!crestHtml(clubById('legia')).includes('data:image'));
  restoreOriginals();
});

test('Trener, sztab i właściciel klubu: edycja, walidacja, datapack i wczytanie w innej grze', () => {
  restoreOriginals();
  const g = structuredClone(G);
  const id = 'legia';
  const cur = peopleValues(g, id);
  assert.ok(cur.coach && cur.owner && cur.staff, 'klub AI ma trenera, właściciela i sztab');
  assert.equal(peopleValues(g, 'widzew').coach, null, 'trener klubu gracza to gracz');
  assert.ok(checkCoach({ a: { TAK: 25 } }).errors['a.TAK']);
  assert.ok(checkOwner({ ambicja: 0 }).errors.ambicja);
  assert.ok(checkStaff({ nieznana: [] }).errors.staff);
  assert.ok(checkStaff({ asystent: [{ q: '30' }] }, { form: true }).errors['asystent.0.q']);
  assert.equal(editCoach(g, id, checkCoach({ name: 'Jan Trener', age: 50, style: 'O', a: { TAK: 20, PRE: 1 } }).value), 5 - (cur.coach.style === 'O' ? 1 : 0) - (cur.coach.a.TAK === 20 ? 1 : 0) - (cur.coach.a.PRE === 1 ? 1 : 0) - (cur.coach.age === 50 ? 1 : 0));
  assert.equal(g.coaches[id].name, 'Jan Trener');
  assert.equal(g.coaches[id].a.TAK, 20);
  assert.ok(editOwner(g, id, checkOwner({ name: 'Pan Prezes', cierpliwosc: 20 }).value) >= 1);
  assert.equal(g.owners[id].name, 'Pan Prezes');
  const role = Object.keys(cur.staff)[0];
  assert.ok(editStaff(g, id, checkStaff({ [role]: [{ name: 'Adam Sztabowy', q: 20 }] }).value) >= 1);
  const person = Object.values(g.staff.people).find((p) => p.club === id && p.role === role && p.name === 'Adam Sztabowy');
  assert.ok(person && person.q === 20);
  assert.equal(g.training.staff[id][role].name !== undefined, true, 'widok sztabu przeliczony');
  const file = JSON.stringify(exportPack(g));
  const pk = parsePack(file);
  assert.equal(pk.clubs[id].coach.name, 'Jan Trener');
  // Kolega w innym świecie gry: trener, właściciel i sztab z pliku
  const friend = structuredClone(G2);
  importPack(friend, pk);
  assert.equal(coachOf(friend, id).name, 'Jan Trener');
  assert.equal(ownerOf(friend, id).cierpliwosc, 20);
  assert.ok(Object.values(friend.staff.people).some((p) => p.club === id && p.name === 'Adam Sztabowy' && p.q === 20));
  // Pełny datapack niesie ludzi wszystkich klubów i wczytuje się bez błędów
  const full = parsePack(JSON.stringify(exportPack(g, new Date(), { full: true })));
  assert.equal(full.clubs[id].owner.name, 'Pan Prezes');
  assert.throws(() => parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, clubs: { legia: { coach: { a: { MOT: 99 } } } } })), /Motywacja/);
  restoreOriginals();
});

test('Pozycje dodatkowe zawodnika: edycja, biegłość w silniku, datapack i walidacja', () => {
  const g = structuredClone(G);
  const p = Object.values(g.world.players).find((x) => x.clubId === 'legia' && x.pos === 'ŚP');
  assert.ok(p);
  assert.ok(checkPlayer({ alt: { BR: 90 } }).errors.alt, 'bez bramki jako pozycji dodatkowej');
  assert.ok(checkPlayer({ alt: { NAP: 95 } }).errors.alt, 'najwyżej 90 %');
  assert.ok(checkPlayer({ alt: { XX: 90 } }).errors.alt);
  const before = proficiency(p, 'NAP');
  assert.ok(editPlayer(g, p.id, checkPlayer({ alt: { NAP: 90, OP: 90 } }).value) >= 1);
  assert.equal(proficiency(p, 'NAP'), 90);
  assert.ok(proficiency(p, 'NAP') > before);
  assert.deepEqual(g.editor.players[p.id].alt, { NAP: 90, OP: 90 });
  const pk = parsePack(JSON.stringify(exportPack(g)));
  assert.deepEqual(pk.players[p.id].alt, { NAP: 90, OP: 90 });
  const g2 = structuredClone(G);
  importPack(g2, pk);
  assert.equal(proficiency(g2.world.players[p.id], 'NAP'), 90);
  editPlayer(g, p.id, checkPlayer({ alt: {} }).value);
  assert.equal(proficiency(p, 'NAP'), before, 'usunięcie pozycji dodatkowej');
  restoreOriginals();
});

test('Kadra w edytorze: do wolnych i z wolnych, limit 21-32, przeniesienia w datapacku', () => {
  restoreOriginals();
  const g = structuredClone(G);
  const id = 'legia';
  const n0 = squadSize(g, id);
  const squad = [...g.world.clubs[id].squad];
  const p = g.world.players[squad.find((x) => !g.world.players[x].loan)];
  assert.equal(releaseToFree(g, p.id), '');
  assert.equal(p.clubId, null);
  assert.ok(g.market.free.includes(p.id));
  assert.equal(squadSize(g, id), n0 - 1);
  assert.equal(g.editor.players[p.id].team, null);
  assert.equal(joinFromFree(g, p.id, 'lech'), '');
  assert.equal(p.clubId, 'lech');
  assert.ok(!g.market.free.includes(p.id));
  assert.ok(p.contract?.until > g.date);
  assert.equal(g.editor.players[p.id].team, 'lech');
  // Minimum: do 21 zawodników, potem odmowa
  for (const x of [...g.world.clubs[id].squad]) { if (squadSize(g, id) <= EDIT_SQUAD.min) break; if (!g.world.players[x].loan) releaseToFree(g, x); }
  assert.equal(squadSize(g, id), EDIT_SQUAD.min);
  const last = g.world.clubs[id].squad.find((x) => !g.world.players[x].loan);
  assert.match(releaseToFree(g, last), /minimum/);
  // Maksimum: do 32
  const free = [...g.market.free];
  for (const x of free) { if (squadSize(g, 'rakow') >= EDIT_SQUAD.max) break; joinFromFree(g, x, 'rakow'); }
  assert.equal(squadSize(g, 'rakow'), EDIT_SQUAD.max);
  const left = g.market.free.find((x) => !g.world.players[x].clubId);
  assert.match(joinFromFree(g, left, 'rakow'), /maksimum/);
  // Datapack w tym samym świecie: przeniesienie zawodnika
  const g2 = structuredClone(G);
  const r = importPack(g2, parsePack(JSON.stringify(exportPack(g))));
  assert.equal(g2.world.players[p.id].clubId, 'lech');
  assert.ok(squadSize(g2, 'rakow') <= EDIT_SQUAD.max && squadSize(g2, id) >= EDIT_SQUAD.min);
  assert.ok(r.players > 0);
  restoreOriginals();
});

test('Nowy wolny zawodnik: narodowość z całego świata, datapack w innym świecie gry z klubem', () => {
  restoreOriginals();
  const g = structuredClone(G);
  assert.ok(checkNewPlayer({ first: 'A', last: 'B', nat: 'XXX', pos: 'ŚP', age: '20', level: '10' }, { form: true }).errors.nat);
  const r = checkNewPlayer({ first: 'Kofi', last: 'Mensah', nat: 'EGY', pos: 'NAP', age: '22', level: '12' }, { form: true });
  assert.deepEqual(r.errors, {});
  const p = createFreePlayer(g, r.value);
  assert.equal(p.nat, 'EGY');
  assert.equal(p.name, 'Kofi Mensah');
  assert.ok(g.market.free.includes(p.id) && !p.clubId);
  assert.ok(p.ovr > 8 && p.ovr < 16, `OVR ${p.ovr} blisko poziomu 12`);
  assert.equal(joinFromFree(g, p.id, 'legia'), '');
  const pk = parsePack(JSON.stringify(exportPack(g)));
  assert.equal(pk.created[p.id].team, 'legia');
  const friend = structuredClone(G2); // inny świat gry
  const res = importPack(friend, pk);
  assert.equal(res.created, 1);
  const q = friend.world.players[p.id];
  assert.equal(q.name, 'Kofi Mensah');
  assert.equal(q.clubId, 'legia');
  assert.deepEqual(q.attr, p.attr);
  restoreOriginals();
});

test('Sędziowie w edytorze: atrybuty, surowość, datapack w innym świecie gry', () => {
  const g = structuredClone(G); ensureReferees(g);
  const r = g.refs.list[0];
  assert.ok(checkReferee({ a: [1, 2, 3] }).errors.a);
  assert.ok(checkReferee({ s: 2 }).errors.s);
  assert.ok(checkReferee({ a: [20, 20, 20, 20, 20, 20, 21] }).errors['a.6']);
  const normBefore = g.refs.norm[r.l];
  const v = checkReferee({ name: 'Jan Gwizdek', age: '40', a: ['20', '20', '20', '20', '20', '20', '20'], e: '18', s: '1.4' }, { form: true });
  assert.deepEqual(v.errors, {});
  assert.ok(editReferee(g, r.id, v.value) > 0);
  assert.equal(r.n, 'Jan Gwizdek');
  assert.equal(refValues(g, r).age, 40);
  assert.ok(g.refs.norm[r.l] > normBefore, 'surowość zmienia średnią listy');
  const friend = structuredClone(G2); ensureReferees(friend);
  importPack(friend, parsePack(JSON.stringify(exportPack(g))));
  const f = friend.refs.list.find((x) => x.id === r.id);
  assert.equal(f.n, 'Jan Gwizdek');
  assert.deepEqual(f.a, [20, 20, 20, 20, 20, 20, 20]);
  restoreOriginals();
});

test('Kontuzja w edytorze: rodzaj i dni, gra z bólem przy lekkich, wyleczenie, datapack', () => {
  const g = structuredClone(G);
  const p = Object.values(g.world.players).find((x) => x.clubId === 'legia' && !(x.injuryDays > 0));
  assert.ok(checkPlayer({ injury: { name: 'zerwanie więzadła krzyżowego', days: '400' } }, { form: true }).errors.injury);
  assert.ok(checkPlayer({ injury: 'x' }).errors.injury);
  const r = checkPlayer({ injury: { name: 'zerwanie więzadła krzyżowego', days: '200' } }, { form: true });
  assert.deepEqual(r.errors, {});
  assert.equal(editPlayer(g, p.id, r.value), 1);
  assert.equal(p.injuryDays, 200);
  assert.equal(p.injury.cat, 'severe');
  assert.equal(p.injury.playable, false);
  editPlayer(g, p.id, checkPlayer({ injury: { name: 'stłuczenie', days: 3 } }).value);
  assert.equal(p.injury.playable, true, 'lekki uraz: gra z bólem');
  const pk = parsePack(JSON.stringify(exportPack(g)));
  assert.deepEqual(pk.players[p.id].injury, { name: 'stłuczenie', days: 3 });
  const g2 = structuredClone(G);
  importPack(g2, pk);
  assert.equal(g2.world.players[p.id].injuryDays, 3);
  editPlayer(g, p.id, checkPlayer({ injury: null }).value);
  assert.equal(p.injuryDays, 0);
  assert.equal(p.injury, null);
  restoreOriginals();
});

test('Datapack: po wczytaniu pliku tarcze w barwach zamiast herbów, gra bez pliku z herbami', () => {
  const legia = clubById('legia');
  restoreOriginals();
  assert.match(crestHtml(legia), /<img /);
  const g = structuredClone(G);
  importPack(g, parsePack(JSON.stringify({ type: PACK_TYPE, v: 1, seed: 7, clubs: { legia: { name: 'Legia' } } })));
  assert.equal(g.editor.packLoaded, true);
  assert.match(crestHtml(legia), /<svg /);
  restoreOriginals();
  assert.match(crestHtml(legia), /<img /);
  applyPack(g); // wczytanie zapisu z datapackiem
  assert.match(crestHtml(legia), /<svg /);
  applyPack(structuredClone(G)); // inna gra bez pliku
  assert.match(crestHtml(legia), /<img /);
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
  assert.equal(g2.editor.packLoaded, true, 'znacznik wczytanego pliku (tarcze zamiast herbów)');
  delete g2.editor.packLoaded;
  assert.equal(JSON.stringify(g2.editor), packBefore);
  restoreOriginals();
  // Kopia gry sprzed edycji dostaje wartość z pełnego pliku
  const g3 = structuredClone(G);
  importPack(g3, parsed);
  assert.equal(g3.world.players[p.id].attr[Object.keys(before)[0]], 20);
  restoreOriginals();
});

test('Profil wolnego zawodnika (bez kontraktu) otwiera się bez błędu', async () => {
  const { renderPlayerProfile } = await import('../src/ui/squadView.js');
  const g = structuredClone(G);
  const p = Object.values(g.world.players).find((x) => !x.clubId) ?? Object.values(g.world.players)[0];
  const free = { ...p, clubId: null, contract: null };
  const html = renderPlayerProfile(free, { leagueOvrs: [10, 11, 12], clubName: 'Wolny zawodnik', date: g.date, game: g, foreign: true, back: { act: 'extback', label: 'Wróć' } });
  assert.match(html, /Wolny zawodnik, bez kontraktu/);
});

test('Nowa kariera z datapackiem: świat z ziarna pliku, zawodnicy i kluby z pliku od startu (inny klub gracza)', () => {
  const src = game(31);
  const pid = squadOf(src.world, 'lech')[0].id;
  editPlayer(src, pid, { first: 'Paczka', last: 'Testowa', attrs: { POD: 19 } });
  editClub(src, 'lech', { name: 'Lech Paczkowy' });
  const pack = parsePack(JSON.stringify(exportPack(src, new Date('2026-11-18T10:00:00Z'), { full: true })));
  restoreOriginals();
  // Nowa gra jak w app.js newGame: ziarno z pliku, inny klub gracza, potem importPack
  const g = { seed: pack.seed, clubId: 'legia', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(g.seed);
  g.season = createSeason(g.seed, { playerClub: 'legia' });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'legia'), { benchSize: 12 });
  ensureTraining(g); ensureCareer(g);
  const r = importPack(g, pack);
  assert.equal(r.otherWorld, false);
  assert.ok(r.players > 0);
  const p = g.world.players[pid];
  assert.equal(p.name, 'Paczka Testowa');
  assert.equal(p.attr.POD, 19);
  assert.equal(p.clubId, 'lech', 'ten sam skład klubu co w pliku');
  assert.equal(clubById('lech').name, 'Lech Paczkowy');
  restoreOriginals();
});
