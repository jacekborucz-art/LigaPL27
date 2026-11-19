// Atrybuty członków sztabu: profil osoby, jakość z atrybutów, efekty w grze, edytor i datapack v3
// (src/training/staff.js, src/career/staffMarket.js, src/career/editor.js, docs/sztab-atrybuty.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { ensureTraining } from '../src/training/index.js';
import { ROLE_ATTRS } from '../src/training/config.js';
import { attrsAround, qFromAttrs, staffA, staffQ, healDays, physioInjMul, roleAttrKeys, SEVERE_DAYS } from '../src/training/staff.js';
import { rosterOf, syncStaff, ensureStaff, staffNewSeason } from '../src/career/staffMarket.js';
import { assistantProfile } from '../src/career/coaches.js';
import { checkStaff, editStaff, exportPack, parsePack, importPack, peopleValues, PACK_V } from '../src/career/editor.js';
import { renderTraining } from '../src/ui/trainingView.js';
import '../src/season/dailySystems.js';

const CLUB = 'widzew';
function newGame(seed = 21) {
  applySeasonState({});
  const g = { seed, clubId: CLUB, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'A', lastName: 'B' } } };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: CLUB }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, CLUB), { benchSize: 12 });
  ensureTraining(g); ensureCareer(g); processDay(g);
  return g;
}
let shared = null;
const fresh = () => structuredClone(shared ??= newGame());

test('Każda rola ma 3 atrybuty z opisem wpływu na grę', () => {
  for (const [role, attrs] of Object.entries(ROLE_ATTRS)) {
    assert.equal(Object.keys(attrs).length, 3, role);
    for (const a of Object.values(attrs)) assert.ok(a.name && a.text.length > 10, role);
  }
});

test('Profil wokół jakości: średnia równa jakości, 1-20, deterministyczny, także przy 1 i 20', () => {
  for (const q of [1, 2, 5, 10, 15, 19, 20]) {
    for (const role of Object.keys(ROLE_ATTRS)) {
      const a = attrsAround(q, role, `t:${q}:${role}`);
      assert.equal(qFromAttrs(a), q, `${role} q${q}`);
      for (const v of Object.values(a)) assert.ok(v >= 1 && v <= 20);
      assert.deepEqual(attrsAround(q, role, `t:${q}:${role}`), a);
    }
  }
});

test('Każda osoba sztabu ma atrybuty roli, a jakość to ich średnia; stary zapis dostaje je bez zmiany jakości', () => {
  const g = fresh();
  const all = Object.values(g.staff.people);
  assert.ok(all.length > 500);
  for (const p of all) {
    assert.deepEqual(Object.keys(p.a).sort(), roleAttrKeys(p.role).sort(), p.role);
    assert.equal(p.q, qFromAttrs(p.a));
  }
  // Stary zapis: osoby bez atrybutów, jakość zostaje
  const old = fresh();
  const qs = Object.fromEntries(Object.values(old.staff.people).map((p) => [p.id, p.q]));
  for (const p of Object.values(old.staff.people)) delete p.a;
  delete old.staff.attrs;
  ensureStaff(old);
  for (const p of Object.values(old.staff.people)) assert.equal(p.q, qs[p.id], p.id);
  assert.equal(old.training.staff[CLUB].asystent.q, g.training.staff[CLUB].asystent.q, 'jakość roli bez zmian');
});

test('Efekty czytają atrybut: rehabilitacja tylko ciężkie urazy, profilaktyka ryzyko, równe atrybuty = jakość', () => {
  const g = fresh();
  const physio = rosterOf(g, CLUB).find((p) => p.role === 'fizjoterapeuta');
  assert.ok(physio, 'fizjoterapeuta w sztabie');
  for (const x of rosterOf(g, CLUB).filter((p) => p.role === 'fizjoterapeuta')) x.a = { LEC: 3, REH: 3, PRF: 3 };
  physio.a = { LEC: 3, REH: 20, PRF: 3 }; physio.q = qFromAttrs(physio.a);
  syncStaff(g, CLUB);
  const light = healDays(g, CLUB, 20); const severe = healDays(g, CLUB, 100);
  assert.equal(light, 20, 'słabe leczenie: lekki uraz bez skrócenia');
  assert.ok(severe < 90, `świetna rehabilitacja skraca ciężki uraz (${severe})`);
  assert.ok(SEVERE_DAYS === 28);
  const before = physioInjMul(g, CLUB);
  physio.a.PRF = 20; physio.q = qFromAttrs(physio.a); syncStaff(g, CLUB);
  assert.ok(physioInjMul(g, CLUB) < before, 'profilaktyka zmniejsza ryzyko');
  // Równe atrybuty: atrybut = jakość roli
  for (const x of rosterOf(g, CLUB)) { const q = x.q; for (const k of roleAttrKeys(x.role)) x.a[k] = q; }
  syncStaff(g, CLUB);
  for (const role of Object.keys(ROLE_ATTRS)) for (const k of roleAttrKeys(role)) assert.equal(staffA(g, CLUB, role, k), staffQ(g, CLUB, role), `${role} ${k}`);
});

test('Asystent w meczu: taktyka z analizy taktycznej, skład z oceny zawodników, motywacja z pracy z zawodnikami', () => {
  const prof = assistantProfile({ q: 12, d: { TAK: 4, OCE: -4, MOT: 0 } }, 1);
  assert.ok(prof.a.TAK > prof.a.MOT && prof.a.MOT > prof.a.SKL);
  assert.deepEqual(assistantProfile(12, 1).a, assistantProfile({ q: 12 }, 1).a, 'sama jakość jak dotąd');
});

test('Rozwój sztabu w nowym sezonie zmienia atrybuty, a jakość idzie za nimi', () => {
  const g = fresh();
  const before = Object.fromEntries(Object.values(g.staff.people).map((p) => [p.id, { ...p.a }]));
  g.seasonYear = 2027; staffNewSeason(g, '2027-07-01');
  let changed = 0;
  for (const p of Object.values(g.staff.people)) {
    if (!before[p.id]) continue;
    assert.equal(p.q, qFromAttrs(p.a));
    if (JSON.stringify(p.a) !== JSON.stringify(before[p.id])) changed++;
  }
  assert.ok(changed > 20, `rozwój części osób (${changed})`);
});

test('Edytor i datapack: atrybuty w pliku v3, stary plik z samą jakością przesuwa profil, zły atrybut odrzucony', () => {
  const g = fresh();
  const id = 'legia';
  const cur = peopleValues(g, id).staff;
  assert.ok(cur.asystent[0].a.TAK >= 1, 'formularz i eksport mają atrybuty');
  // Formularz: atrybuty
  const form = checkStaff({ asystent: [{ name: 'Jan Nowak', age: '44', a: { TAK: '18', OCE: '12', MOT: '9' } }] }, { form: true });
  assert.deepEqual(form.errors, {});
  editStaff(g, id, form.value);
  const lead = peopleValues(g, id).staff.asystent[0];
  assert.deepEqual(lead.a, { TAK: 18, OCE: 12, MOT: 9 });
  assert.equal(lead.q, 13);
  // Eksport v3 z atrybutami i import w innej grze
  const pk = exportPack(g, new Date('2026-11-19T10:00:00Z'), { full: true });
  assert.equal(pk.v, PACK_V); assert.equal(PACK_V, 3);
  const other = newGame(77);
  importPack(other, parsePack(JSON.stringify(pk)));
  assert.deepEqual(peopleValues(other, id).staff.asystent[0].a, { TAK: 18, OCE: 12, MOT: 9 });
  // Stary datapack v2: tylko jakość, profil osoby przesunięty
  const prev = peopleValues(other, id).staff.fizyczny[0];
  const v2 = { type: 'ligapl27-datapack', v: 2, seed: 1, clubs: { [id]: { staff: { fizyczny: [{ name: prev.name, age: prev.age, q: Math.min(20, prev.q + 2) }] } } }, players: {} };
  importPack(other, parsePack(JSON.stringify(v2)));
  const now = peopleValues(other, id).staff.fizyczny[0];
  assert.equal(now.q, Math.min(20, prev.q + 2));
  const diff = (x) => Object.keys(x.a).map((k) => x.a[k] - prev.a[k]);
  assert.ok(diff(now).every((d) => d >= 0), 'cały profil w górę');
  // Zły atrybut i wartość spoza skali
  assert.ok(Object.keys(checkStaff({ asystent: [{ a: { REG: 10 } }] }).errors).length);
  assert.ok(Object.keys(checkStaff({ asystent: [{ a: { TAK: 25 } }] }).errors).length);
  assert.throws(() => parsePack(JSON.stringify({ type: 'ligapl27-datapack', v: 4, clubs: {}, players: {} })), /nowszej gry/);
});

test('Widok Trening, Sztab: atrybuty roli i wpływ na grę bez pustych wartości', () => {
  const g = fresh();
  const html = renderTraining(g, { trTab: 'sztab' });
  assert.match(html, /Atrybuty roli: analiza taktyczna/);
  assert.match(html, /rehabilitacja|po ciężkim urazie/);
  assert.doesNotMatch(html, /undefined|NaN/);
  assert.ok(CLUBS_PL.length);
});
