// Sztab na skali 1-12 (decyzja właściciela, v1.23 Beta, docs/sztab-atrybuty.md): wszystkie role poza fizjoterapeutą
// i dyrektorem sportowym mają atrybuty i jakość najwyżej 12 (generowanie, lista wolnych, rozwój, migracja zapisu,
// edytor i datapack), a efekty w grze liczą się na skali 1-20 (12 jak dawne 17). Wartości w widokach w liczbach całkowitych.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import '../src/season/dailySystems.js';
import { STAFF_CAP, staffEff, staffShown, staffRescale, staffCap, isCappedRole, staffMul } from '../src/training/config.js';
import { staffLabel, staffA, rescalePerson, roleAttrKeys } from '../src/training/staff.js';
import { ensureStaff, staffNewSeason, rosterOf, expectedWage, combineQ, seenQuality, directorOf } from '../src/career/staffMarket.js';
import { checkStaff, parsePack, rescaleStaffClubs } from '../src/career/editor.js';
import { renderTraining } from '../src/ui/trainingView.js';
import { renderStaff } from '../src/ui/staffView.js';
import { renderClubView } from '../src/ui/clubView.js';

function newGame(seed = 43, clubId = 'widzew') {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'A', lastName: 'B' } } };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g); processDay(g);
  return g;
}
let shared = null;
const fresh = () => structuredClone(shared ??= newGame());
const within = (p) => p.q <= staffCap(p.role) && Object.values(p.a ?? {}).every((v) => v >= 1 && v <= staffCap(p.role));

test('Skala: 12 działa jak dawne 17, przeliczenie starych wartości i przycięcie do 12; fizjoterapeuta i dyrektor bez zmian', () => {
  assert.equal(STAFF_CAP, 12);
  assert.equal(staffEff('asystent', 12), 17); assert.equal(staffEff('asystent', 1), 1);
  assert.equal(staffEff('fizjoterapeuta', 18), 18); assert.equal(staffEff('dyrektor', 18), 18);
  for (let q = 1; q <= 12; q++) assert.equal(staffRescale('analityk', Math.round(staffEff('analityk', q))), q, `q ${q}`);
  assert.equal(staffRescale('asystent', 20), 12); assert.equal(staffRescale('asystent', 17), 12); assert.equal(staffRescale('asystent', 10), 7);
  assert.equal(staffShown('asystent', 20), 12);
  assert.ok(isCappedRole('skaut') && !isCappedRole('fizjoterapeuta') && !isCappedRole('dyrektor'));
  // Sens skali: 12 i 10 to bardzo dobry sztab w Polsce, efekt 12 jak dawne 17
  assert.equal(staffLabel(12, 'asystent'), 'Bardzo dobry'); assert.equal(staffLabel(9, 'asystent'), 'Dobry'); assert.equal(staffLabel(3, 'asystent'), 'Bardzo słaby');
  assert.equal(staffLabel(17, 'fizjoterapeuta'), 'Klasa światowa');
  assert.equal(staffMul.dev(staffEff('asystent', 12)), staffMul.dev(17));
  // Pensja: jakość 12 to najwyższa pensja asystenta w Polsce (jak dawne 17), nie spada
  assert.equal(expectedWage({ role: 'asystent', q: 12, nat: 'POL' }), 47700);
  assert.ok(expectedWage({ role: 'asystent', q: 12, nat: 'POL' }) > expectedWage({ role: 'asystent', q: 11, nat: 'POL' }));
});

test('Generowanie: kluby, lista wolnych i wolni skauci najwyżej 12 (fizjoterapeuci i dyrektorzy do 20), rozkład lig zachowany', () => {
  const g = fresh();
  const all = Object.values(g.staff.people);
  for (const p of all) assert.ok(within(p), `${p.role} ${p.q} ${JSON.stringify(p.a)}`);
  const capped = all.filter((p) => isCappedRole(p.role) && p.club);
  assert.ok(capped.some((p) => p.q === 12), 'najlepsi mają 12');
  assert.ok(all.some((p) => p.role === 'fizjoterapeuta' && p.q > 12) || all.some((p) => p.role === 'dyrektor' && p.q > 12), 'skala 1-20 zostaje');
  // Legia ma lepszy sztab niż klub III ligi, a widok w grze (skala efektów) jak dawniej
  const avg = (id) => { const xs = rosterOf(g, id).filter((p) => isCappedRole(p.role)); return xs.reduce((s, p) => s + p.q, 0) / xs.length; };
  const l3 = Object.keys(g.world.clubs).find((id) => rosterOf(g, id).length && id.includes('kleczew')) ?? 'sokol-kleczew';
  assert.ok(avg('legia') > avg(l3) + 2);
  assert.ok(g.training.staff.legia.asystent.q > 12, 'efekt na skali 1-20');
  assert.ok(g.training.staff.legia.asystent.qs <= 12, 'jakość roli do pokazania najwyżej 12');
  // Ocena kandydata z rynku: przedział na skali roli
  for (const id of g.staff.pool.slice(0, 40)) { const p = g.staff.people[id]; const s = seenQuality(g, p); assert.ok(s.hi <= staffCap(p.role) && s.lo >= 1); }
  assert.ok(combineQ([12, 12, 12], 'asystent') <= 12);
});

test('Rozwój: atrybuty nie rosną ponad 12, tempo jak dotąd (szansa / 1,45)', () => {
  const g = fresh();
  for (const p of Object.values(g.staff.people)) { p.age = 30; if (isCappedRole(p.role)) { for (const k of roleAttrKeys(p.role)) p.a[k] = 12; p.q = 12; } }
  for (let y = 0; y < 4; y++) { g.seasonYear = 2027 + y; staffNewSeason(g, `${2027 + y}-07-01`); }
  for (const p of Object.values(g.staff.people)) assert.ok(within(p), `${p.role} ${p.q}`);
  // Młodzi (do 45 lat) rosną średnio wolniej o czynnik 1,45 na skali 1-12
  const h = fresh(); let up = 0; let n = 0;
  for (const p of Object.values(h.staff.people)) if (isCappedRole(p.role) && p.q <= 8) { p.age = 30; n++; p.q0 = p.q; }
  h.seasonYear = 2027; staffNewSeason(h, '2027-07-01');
  for (const p of Object.values(h.staff.people)) if (p.q0 != null && p.q > p.q0) up++;
  assert.ok(up / n > 0.12 && up / n < 0.30, `rośnie ${up} z ${n}`);
});

test('Migracja starego zapisu: skala 1-20 przeliczona (17 -> 12, wyżej przycięte), q znów średnią, efekty w grze bez zmian', () => {
  const g = fresh();
  const before = structuredClone(g.training.staff[g.clubId]);
  for (const p of Object.values(g.staff.people)) {
    if (!isCappedRole(p.role)) continue;
    for (const k of roleAttrKeys(p.role)) p.a[k] = Math.round(staffEff(p.role, p.a[k]));
    p.q = Math.round(Object.values(p.a).reduce((s, x) => s + x, 0) / Object.values(p.a).length);
  }
  const top = rosterOf(g, 'legia').find((p) => p.role === 'asystent');
  top.a = { TAK: 20, OCE: 19, MOT: 18 }; top.q = 19;
  g.staff.attrs = 2;
  ensureStaff(g);
  assert.equal(g.staff.attrs, 3);
  for (const p of Object.values(g.staff.people)) assert.ok(within(p), `${p.role} ${p.q}`);
  assert.deepEqual(top.a, { TAK: 12, OCE: 12, MOT: 12 }); assert.equal(top.q, 12);
  for (const r of Object.keys(before)) assert.ok(Math.abs(g.training.staff[g.clubId][r].q - before[r].q) <= 1, `${r} ${g.training.staff[g.clubId][r].q} ${before[r].q}`);
  // Drugie wywołanie nic nie zmienia
  const snap = JSON.stringify(g.staff); ensureStaff(g); assert.equal(JSON.stringify(g.staff), snap);
  const p = { role: 'kierownik', q: 15, a: { DOK: 16, ORG: 15, LOG: 14 } };
  rescalePerson(p); assert.deepEqual(p.a, { DOK: 11, ORG: 11, LOG: 10 }); assert.equal(p.q, 11);
});

test('Edytor i datapack: role sztabu do 12 (fizjoterapeuta i dyrektor do 20), plik v6 przeliczony przy wczytaniu', () => {
  assert.ok(checkStaff({ analityk: [{ a: { RYW: 13 } }] }).errors['analityk.0.a.RYW']);
  assert.deepEqual(checkStaff({ analityk: [{ a: { RYW: 12, DAN: 1, WID: 7 } }] }).errors, {});
  assert.deepEqual(checkStaff({ fizjoterapeuta: [{ q: 18 }], dyrektor: [{ a: { NEG: 19 } }] }).errors, {});
  const v6 = { type: 'ligapl27-datapack', v: 6, seed: 1, clubs: { legia: { staff: { asystent: [{ name: 'Jan Nowak', age: 40, q: 15, a: { TAK: 17, OCE: 15, MOT: 13 } }], fizjoterapeuta: [{ name: 'Ewa Nowak', age: 40, q: 15, a: { LEC: 17, REH: 15, PRF: 13 } }] } } }, players: {} };
  const pk = parsePack(JSON.stringify(v6));
  assert.deepEqual(pk.clubs.legia.staff.asystent[0].a, { TAK: 12, OCE: 11, MOT: 9 });
  assert.equal(pk.clubs.legia.staff.asystent[0].q, 11);
  assert.deepEqual(pk.clubs.legia.staff.fizjoterapeuta[0].a, { LEC: 17, REH: 15, PRF: 13 });
  assert.deepEqual(rescaleStaffClubs({ x: { name: 'a' } }), { x: { name: 'a' } });
});

test('Widoki: jakość i atrybuty sztabu w liczbach całkowitych (Trening, Sztab, karta klubu)', () => {
  const g = fresh();
  const plain = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const sztab = plain(renderTraining(g, { trTab: 'sztab', trStaff: 'moj' }));
  assert.ok(!/Atrybuty roli:[^.]*\d+,\d/.test(sztab), 'atrybuty roli bez przecinka');
  assert.ok(!/jakość \d+,\d/.test(sztab));
  const panel = plain(renderTraining(g, { trTab: 'panel' }));
  assert.ok(/średnio \d+,\d \/ 12/.test(panel));
  const rynek = plain(renderStaff(g, { trStaff: 'rynek' }));
  assert.ok(rynek.includes('Skala jakości: 1-12'));
  const club = plain(renderClubView(g, 'legia'));
  assert.ok(!/\b\d+,\d\b/.test(club.replace(/\d+,\d+ (mln|tys)/g, '')), 'karta klubu i trenera bez części po przecinku');
  assert.ok(directorOf(g, g.clubId));
  assert.ok(staffA(g, g.clubId, 'asystent', 'TAK') >= 1);
});
