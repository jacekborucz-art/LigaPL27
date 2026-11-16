// Rezerwy: delegowanie i powołania (model A), zasady PZPN i właściciela, kartki per klasa, awaria, eskalacja (docs/rezerwy.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, playQuick, applyResult, squadFor, suspKey } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { SEASON } from '../src/config/calendar2026.js';
import { dissolveDropped } from '../src/season/leagues.js';
import { clubById } from '../src/data/clubs_pl.js';
import { pickXI } from '../src/engine/teamStrength.js';
import {
  RSV, ensureReserves, migrateCards, reservesOf, canDelegate, requestDelegation, canCallUp, requestCallUp, forceRequest,
  cancelDelegation, delegationsFor, playerTeamThisWeekend, reasonsText, eligibility, familySquad, emergencyFor, emergencyFill,
  escalationChance, seniorStatus, promoteReserve, weekendKey, statsOf, coachMood,
} from '../src/career/reserves.js';
import '../src/season/dailySystems.js';

// Ziarno 3: Legia II (2 Liga) gra w sobotę 1 sierpnia 12:00 (liga2-2-9), Legia w niedzielę 2 sierpnia 14:45 (ekstraklasa-2-4)
function newGame(clubId = 'widzew', seed = 3) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  processDay(g);
  ensureReserves(g).list = [];
  return g;
}
const P = (g, id) => g.world.players[id];
const squad = (g, id) => squadOf(g.world, id);
const fx = (g, id) => g.fixtures.find((f) => f.id === id);
const resFix = (g) => fx(g, 'liga2-2-9'); // Legia II, sobota
const legFix = (g) => fx(g, 'ekstraklasa-2-4'); // Legia, niedziela
const field = (g, club) => squad(g, club).filter((p) => p.pos !== 'BR').sort((a, b) => a.ovr - b.ovr);
const gks = (g, club) => squad(g, club).filter((p) => p.pos === 'BR');
function playWith(g, f, side, ids, minutes = 90) {
  const rng = new Rng(`t:${f.id}`);
  const res = playQuick(g, f, rng);
  res.players[side] = res.players[side].filter((x) => !ids.includes(x.id)).slice(0, 11 - ids.length);
  for (const id of ids) res.players[side].push({ id, minutes, g: 0, a: 0, yc: 0, rc: 0, rating: 6.5 });
  applyResult(g, f, res, rng);
  return res;
}

test('Rezerwy: klub bez grywalnych rezerw nie ma funkcji (powód po polsku)', () => {
  const g = newGame();
  assert.equal(reservesOf(g, 'legia').ok, true);
  assert.equal(reservesOf(g, 'legia').id, 'legia-ii');
  const pog = reservesOf(g, 'pogon-szczecin');
  assert.equal(pog.ok, false);
  assert.match(pog.reason, /IV lidze/);
  assert.equal(reservesOf(g, 'motor').ok, false);
  const p = squad(g, 'pogon-szczecin')[10];
  assert.deepEqual(canDelegate(g, p.id, resFix(g).id).reasons, ['noReserves']);
  assert.match(reasonsText(['noReserves', 'weekend']), /grywalnych rezerw.*jedna drużyna na weekend/);
});

test('Delegowanie: zawodnik zostaje w kadrze klubu, gra w rezerwach, statystyki raz w meczu rezerw (grupa D)', () => {
  const g = newGame();
  g.date = '2026-07-27';
  const p = field(g, 'legia')[0];
  const r = requestDelegation(g, { pid: p.id, fixtureId: resFix(g).id });
  assert.equal(r.status, 'accepted', r.reason);
  assert.ok(r.warnings.includes('missesFirstTeam'), 'ostrzeżenie: nie zagra w weekend w pierwszej drużynie');
  assert.ok(g.world.clubs.legia.squad.includes(p.id) && p.clubId === 'legia', 'kontrakt i kadra bez zmian');
  assert.ok(!g.world.clubs['legia-ii'].squad.includes(p.id));
  assert.equal(delegationsFor(g, resFix(g).id).length, 1);
  assert.equal(playerTeamThisWeekend(g, p.id, resFix(g).date).team, 'legia-ii');
  assert.equal(playerTeamThisWeekend(g, p.id, '2026-07-29').team, 'legia-ii', 'od wtorku: najbliższy weekend');
  // kadra Legii w ten weekend: zablokowany; kadra Legii II na mecz: jest (guest)
  assert.ok(squadFor(g, 'legia', 'ekstraklasa', legFix(g)).find((x) => x.id === p.id).teamBlock);
  assert.ok(squadFor(g, 'legia-ii', 'liga2', resFix(g)).find((x) => x.id === p.id)?.guest);
  const apps0 = p.season?.apps ?? 0;
  const side = resFix(g).home === 'legia-ii' ? 0 : 1;
  playWith(g, resFix(g), side, [p.id]);
  assert.equal(p.season.apps ?? 0, apps0, 'mecz rezerw nie liczy się do sezonu drużyny kontraktu');
  assert.equal(p.season.oth.apps, 1);
  assert.equal(p.st.D[0], 1);
  assert.ok(!p.st.L, 'bez wpisu w lidze klubu');
  assert.equal(g.reserves.list.length, 0, 'przydział zamknięty po meczu');
  assert.equal(p.rsv.wk.t, 'legia-ii');
  // niedziela: ten sam weekend, pierwsza drużyna niedostępna
  assert.equal(squadFor(g, 'legia', 'ekstraklasa', legFix(g)).find((x) => x.id === p.id).teamBlock, 'weekend');
  const pl = playWith(g, legFix(g), legFix(g).home === 'legia' ? 0 : 1, []);
  assert.ok(!pl.players[legFix(g).home === 'legia' ? 0 : 1].some((x) => x.id === p.id), 'nie zagrał dwa razy w weekend');
  assert.equal(statsOf(g).viol, 0);
});

test('Zasada weekendu: po meczu pierwszej drużyny w piątek nie gra w rezerwach w niedzielę; odwołanie przydziału', () => {
  const g = newGame();
  const p = field(g, 'legia')[1];
  const wk = weekendKey(resFix(g).date);
  p.rsv = { s: SEASON, h1: 1, h2: 0, lo: 0, wk: { k: wk, t: 'legia' } };
  g.date = '2026-07-27';
  assert.ok(canDelegate(g, p.id, resFix(g).id).reasons.includes('weekend'));
  const q = field(g, 'legia')[2];
  assert.equal(requestDelegation(g, { pid: q.id, fixtureId: resFix(g).id }).status, 'accepted');
  assert.equal(cancelDelegation(g, { pid: q.id, fixtureId: resFix(g).id }).ok, true);
  assert.equal(g.reserves.list.length, 0);
  assert.ok(!squadFor(g, 'legia', 'ekstraklasa', legFix(g)).find((x) => x.id === q.id).teamBlock);
});

test('PZPN 48 h: ponad 45 minut blokuje mecz drugiej drużyny przez 48 h; do 45 minut i bramkarz bez blokady', () => {
  const g = newGame();
  const f = { id: 'T-48', comp: 'liga2', home: 'legia-ii', away: 'olimpia-elblag', date: '2026-08-07', time: '18:00', played: false };
  const p = field(g, 'legia')[3];
  p.rsv = { s: SEASON, h1: 1, h2: 0, lo: 0, last: { t: 'legia', end: '2026-08-05T22:25', min: 90 } };
  assert.ok(eligibility(g, p, 'legia-ii', f, 'runtime').includes('rest48'));
  p.rsv.last.min = 40;
  assert.ok(!eligibility(g, p, 'legia-ii', f, 'runtime').includes('rest48'));
  const gk = gks(g, 'legia')[2];
  gk.rsv = { s: SEASON, h1: 1, h2: 0, lo: 0, last: { t: 'legia', end: '2026-08-05T22:25', min: 90 } };
  assert.ok(!eligibility(g, gk, 'legia-ii', f, 'runtime').includes('rest48'), 'bramkarz bez 48 h');
  p.rsv.last = { t: 'legia', end: '2026-08-05T18:00', min: 90 }; // 48 h minęło
  assert.ok(!eligibility(g, p, 'legia-ii', f, 'runtime').includes('rest48'));
});

test('PZPN 23+: 5 meczów jesienią, 3 od stycznia; 22 lata i młodsi bez limitu; plakietka tylko ostrzega', () => {
  const g = newGame();
  const f = { id: 'T-S', comp: 'liga2', home: 'legia-ii', away: 'olimpia-elblag', date: '2026-10-10', time: '15:00', played: false };
  const fs = { ...f, id: 'T-W', date: '2027-03-13' };
  const old = field(g, 'legia').find((p) => p.age >= 24);
  const young = field(g, 'legia').find((p) => p.age <= 21);
  old.rsv = { s: SEASON, h1: 4, h2: 0, lo: 0 };
  assert.ok(!eligibility(g, old, 'legia-ii', f, 'runtime').includes('senior5'));
  old.rsv.h1 = 5;
  assert.ok(eligibility(g, old, 'legia-ii', f, 'runtime').includes('senior5'));
  assert.ok(!eligibility(g, old, 'legia', f, 'runtime').length, 'w pierwszej drużynie bez blokady');
  const st = seniorStatus(g, old.id, '2026-10-10');
  assert.equal(st.text, '23+: 5/5 meczów');
  assert.equal(st.blocked, true);
  old.rsv.h2 = 2;
  assert.ok(!eligibility(g, old, 'legia-ii', fs, 'runtime').includes('senior3'));
  old.rsv.h2 = 3;
  assert.ok(eligibility(g, old, 'legia-ii', fs, 'runtime').includes('senior3'));
  young.rsv = { s: SEASON, h1: 12, h2: 9, lo: 0 };
  assert.ok(!eligibility(g, young, 'legia-ii', f, 'runtime').length, '22 lata i młodsi bez limitu');
  assert.ok(!eligibility(g, young, 'legia-ii', fs, 'runtime').length);
  assert.equal(seniorStatus(g, young.id).text, null);
});

test('Limity: 5 z pierwszej drużyny w kadrze rezerw, 3 seniorów w jedenastce, 3 z rezerw w górę', () => {
  const g = newGame();
  g.date = '2026-07-27';
  const rf = resFix(g);
  const cands = field(g, 'legia').slice(0, 6);
  for (const p of cands.slice(0, 5)) assert.equal(requestDelegation(g, { pid: p.id, fixtureId: rf.id }).status, 'accepted');
  const r6 = requestDelegation(g, { pid: cands[5].id, fixtureId: rf.id });
  assert.equal(r6.status, 'refused');
  assert.ok(r6.reasons.includes('limitDown'));
  // seniorzy ponad 3: tylko ławka, poza jedenastką
  for (const p of cands.slice(0, 5)) { P(g, p.id).age = 28; P(g, p.id).birthDate = '1998-03-01'; P(g, p.id).ovr = 15; }
  const sq = familySquad(g, 'legia-ii', 'liga2', squad(g, 'legia-ii'), rf);
  const guests = sq.filter((p) => p.guest);
  assert.equal(guests.length, 5);
  assert.equal(guests.filter((p) => p.benchOnly).length, 2);
  const xi = pickXI(sq).xi.map((x) => x.player);
  assert.equal(xi.filter((p) => p.guest).length, 3);
  // w górę: najwyżej 3 zawodników rezerw
  const lf = legFix(g);
  const res = field(g, 'legia-ii').slice(-4);
  for (const p of res.slice(0, 3)) assert.equal(requestCallUp(g, { pid: p.id, fixtureId: lf.id }).status, 'accepted');
  assert.ok(canCallUp(g, res[3].id, lf.id).reasons.includes('limitUp'));
});

test('Minima: pierwsza drużyna 18 dostępnych (2 BR), rezerwy 14 własnych (2 BR)', () => {
  const g = newGame();
  g.date = '2026-07-27';
  const lg = field(g, 'legia');
  // Legia: 25 zawodników; zostaw 18 dostępnych
  const out = lg.slice(-7);
  for (const p of out) p.injuryDays = 30;
  assert.ok(canDelegate(g, lg[0].id, resFix(g).id).reasons.includes('firstMin'));
  for (const p of out) p.injuryDays = 0;
  assert.ok(!canDelegate(g, lg[0].id, resFix(g).id).reasons.includes('firstMin'));
  const rs = field(g, 'legia-ii');
  const rout = rs.slice(0, 25 - 14); // zostaje 14 (z bramkarzami)
  for (const p of rout) p.injuryDays = 30;
  assert.ok(canCallUp(g, rs.at(-1).id, legFix(g).id).reasons.includes('resMin'));
});

test('Zgoda trenera rezerw: odpowiedź od razu; prośba późna 30 %, ważny mecz i bramkarz 60 %; twarda odmowa przy przepisach', () => {
  const g = newGame();
  const rf = resFix(g);
  g.date = '2026-07-31'; // piątek 09:00, mecz rezerw w sobotę 12:00: 27 h (późno, ale przed terminem 24 h)
  let late = 0; let ok = 0;
  for (const p of field(g, 'legia').slice(0, 5)) {
    const r = requestDelegation(g, { pid: p.id, fixtureId: rf.id, by: 'ai' });
    assert.ok(r.status === 'accepted' || r.status === 'refused');
    if (r.status === 'refused') { late++; assert.equal(r.chance, RSV.refuseLate); assert.deepEqual(r.reasons, ['late']); assert.equal(r.hard, false); } else ok++;
  }
  assert.equal(late + ok, 5);
  // ten sam zawodnik i mecz: ta sama odpowiedź (bez „klikania do skutku”)
  const p0 = field(g, 'legia')[0];
  cancelDelegation(g, { pid: p0.id, fixtureId: rf.id });
  delete g.reserves.refused[`${p0.id}:${rf.id}`];
  const a = requestDelegation(g, { pid: p0.id, fixtureId: rf.id }).status;
  cancelDelegation(g, { pid: p0.id, fixtureId: rf.id });
  delete g.reserves.refused[`${p0.id}:${rf.id}`];
  assert.equal(requestDelegation(g, { pid: p0.id, fixtureId: rf.id }).status, a);
  // po terminie 24 h: twarda odmowa
  g.date = '2026-08-01';
  const r = requestDelegation(g, { pid: field(g, 'legia')[8].id, fixtureId: rf.id });
  assert.equal(r.hard, true);
  assert.ok(r.reasons.includes('deadline'));
  assert.ok(g.inbox.some((m) => m.from === 'Trener rezerw' && m.subject.includes('odmowa')), 'odpowiedź w poczcie');
});

test('Kartki per klasa: pauza z Ekstraklasy nie obowiązuje i nie odlicza się w 2 Lidze, czerwona tylko w swojej lidze', () => {
  const g = newGame();
  g.date = '2026-07-27';
  const p = field(g, 'legia')[4];
  p.susp = { ekstraklasa: 2 };
  assert.equal(requestDelegation(g, { pid: p.id, fixtureId: resFix(g).id }).status, 'accepted', 'pauza z EK nie blokuje rezerw (PZPN)');
  const inRes = squadFor(g, 'legia-ii', 'liga2', resFix(g)).find((x) => x.id === p.id);
  assert.ok(!(inRes.suspended > 0));
  assert.ok(squadFor(g, 'legia', 'ekstraklasa', legFix(g)).find((x) => x.id === p.id).suspended === 2);
  const side = resFix(g).home === 'legia-ii' ? 0 : 1;
  const rng = new Rng('k');
  const res = playQuick(g, resFix(g), rng);
  res.players[side] = [...res.players[side].slice(0, 10), { id: p.id, minutes: 90, g: 0, a: 0, yc: 0, rc: 1, rating: 5, redReason: 'violent' }];
  applyResult(g, resFix(g), res, rng);
  assert.equal(p.susp.ekstraklasa, 2, 'mecz 2 Ligi nie odlicza pauzy z Ekstraklasy');
  assert.equal(p.susp.liga2, 3, 'czerwona w 2 Lidze: pauza tylko w 2 Lidze');
  assert.equal(suspKey('liga2'), 'liga2');
  assert.equal(suspKey('liga3-2'), 'liga3');
  assert.equal(suspKey('pp'), 'cup');
  // Legia gra w EK: pauza z 2 Ligi nie obowiązuje; pauza z EK odbyta
  playWith(g, legFix(g), legFix(g).home === 'legia' ? 0 : 1, []);
  assert.equal(p.susp.ekstraklasa, 1);
  assert.equal(p.susp.liga2, 3);
  // Zawodnik rezerw ukarany w EK (powołany) odbywa pauzę, gdy Legia gra w EK
  const r0 = field(g, 'legia-ii')[0];
  r0.susp = { ekstraklasa: 1 };
  const next = g.fixtures.find((f) => f.comp === 'ekstraklasa' && !f.played && (f.home === 'legia' || f.away === 'legia'));
  playWith(g, next, next.home === 'legia' ? 0 : 1, []);
  assert.equal(r0.susp.ekstraklasa, 0);
});

test('Baraże: klucz klasy ligi (pauza ligowa obowiązuje i się odbywa), stare zapisy: migracja kartek', () => {
  assert.equal(suspKey('playoff-liga1', 'wisla-krakow'), clubById('wisla-krakow').tier === 2 ? 'liga1' : suspKey('playoff-liga1', 'wisla-krakow'));
  const g = newGame();
  const l1 = Object.keys(g.world.clubs).filter((id) => clubById(id)?.tier === 2 && !clubById(id).parent);
  const f = { id: 'PO-liga1-SF1', comp: 'playoff-liga1', round: 'SF', date: '2027-06-03', time: '18:00', home: l1[0], away: l1[1], played: false, knockout: 'single' };
  g.fixtures.push(f);
  g.season.playoffs.liga1 = { direct: [], semis: [[l1[0], l1[1]]] };
  assert.equal(suspKey(f.comp, l1[0]), 'liga1');
  const p = squad(g, l1[0])[6];
  p.susp = { liga1: 1 };
  assert.equal(squadFor(g, l1[0], f.comp, f).find((x) => x.id === p.id).suspended, 1, 'pauza ligowa w barażu');
  const rng = new Rng('po');
  const res = playQuick(g, f, rng);
  assert.ok(!res.players[0].some((x) => x.id === p.id));
  applyResult(g, f, res, rng);
  assert.equal(p.susp.liga1, 0, 'baraż odbywa pauzę ligową');
  // migracja: 'league' do klasy klubu zawodnika
  const a = squad(g, 'legia')[3]; const b = squad(g, 'legia-ii')[3];
  a.yc = { league: 3, cup: 1 }; a.susp = { league: 1 };
  b.yc = { league: 2 };
  g.reserves.v = 0;
  ensureReserves(g);
  assert.deepEqual(a.yc, { cup: 1, ekstraklasa: 3 });
  assert.deepEqual(a.susp, { ekstraklasa: 1 });
  assert.deepEqual(b.yc, { liga2: 2 });
  migrateCards(g); // drugi raz bez zmian
  assert.deepEqual(a.yc, { cup: 1, ekstraklasa: 3 });
});

test('Puchar Polski: kto zagrał w PP w jednej drużynie, nie gra w PP drugiej; po odpadnięciu najwyżej 3', () => {
  const g = newGame();
  const f = { id: 'T-PP', comp: 'pp', home: 'legia-ii', away: 'olimpia-elblag', date: '2026-09-23', time: '18:00', played: false };
  const ps = field(g, 'legia').slice(0, 5);
  for (const p of ps) p.rsv = { s: SEASON, h1: 1, h2: 0, lo: 0, pp: 'legia' };
  assert.ok(eligibility(g, ps[0], 'legia-ii', f, 'runtime').includes('ppOther'));
  // Legia odpadła
  g.fixtures.push({ id: 'T-PP0', comp: 'pp', home: 'legia', away: 'olimpia-elblag', date: '2026-09-01', time: '18:00', played: true, result: { score: [0, 1] } });
  assert.ok(!eligibility(g, ps[0], 'legia-ii', f, 'runtime').length);
  g.reserves.ppMoved = { 'legia-ii': ps.slice(0, 3).map((p) => p.id) };
  assert.ok(eligibility(g, ps[3], 'legia-ii', f, 'runtime').includes('ppLimit'));
  assert.ok(!eligibility(g, ps[0], 'legia-ii', f, 'runtime').length, 'już przeniesiony gra dalej');
});

test('Awaria: mniej niż 2 zdrowych bramkarzy albo mniej niż 18 dostępnych w ciągu 48 h; bez odmowy; wyjątek bramkarza w weekendzie', () => {
  const g = newGame();
  const lf = legFix(g); const rf = resFix(g);
  g.date = '2026-07-27';
  assert.equal(emergencyFor(g, 'legia', lf.id).emergency, false, 'poza oknem 48 h');
  // sobota: Legia II gra o 12:00, bramkarz rezerw 90 minut
  g.date = '2026-08-01';
  const [gk1, gk2] = gks(g, 'legia').sort((a, b) => b.ovr - a.ovr);
  const rgk = gks(g, 'legia-ii').sort((a, b) => b.ovr - a.ovr)[0];
  const rfield = field(g, 'legia-ii').at(-1);
  const side = rf.home === 'legia-ii' ? 0 : 1;
  playWith(g, rf, side, [rgk.id, rfield.id]);
  assert.equal(rgk.rsv.wk.t, 'legia-ii');
  // kontuzje bramkarzy Legii: zostaje jeden zdrowy
  gk2.injuryDays = 20; for (const p of gks(g, 'legia').filter((p) => p !== gk1 && p !== gk2)) p.injuryDays = 20;
  const em = emergencyFor(g, 'legia', lf.id);
  assert.equal(em.emergency, true); assert.equal(em.gk, true); assert.equal(em.squad, false);
  // zawodnik z pola po meczu rezerw w sobotę: bez wyjątku (i bez awarii pola)
  assert.ok(canCallUp(g, rfield.id, lf.id).reasons.includes('weekend'));
  // bramkarz: wyjątek, bez odmowy, mimo terminu i minimum rezerw
  const mood0 = coachMood(g, 'legia-ii');
  const r = requestCallUp(g, { pid: rgk.id, fixtureId: lf.id });
  assert.equal(r.status, 'accepted', r.reason);
  assert.equal(r.emergency, true);
  assert.ok(r.warnings.includes('gkException'));
  assert.equal(coachMood(g, 'legia-ii'), mood0 - RSV.moodEmergency);
  const sq = squadFor(g, 'legia', 'ekstraklasa', lf);
  assert.ok(sq.find((x) => x.id === rgk.id && x.guest && !x.teamBlock), 'bramkarz rezerw w kadrze Legii w niedzielę');
  assert.equal(emergencyFor(g, 'legia', lf.id).gk, false, 'awaria bramkarza usunięta');
  // drugi bramkarz w awarii: limit 1
  const rgk2 = gks(g, 'legia-ii').find((p) => p !== rgk);
  assert.equal(canCallUp(g, rgk2.id, lf.id).emergency, false, 'po uzupełnieniu bramkarza zwykła prośba');
  const side2 = lf.home === 'legia' ? 0 : 1;
  playWith(g, lf, side2, [rgk.id]);
  assert.equal(rgk.st.D[0], 1, 'mecz w pierwszej drużynie zapisany w grupie D');
  assert.equal(statsOf(g).viol, 0, 'wyjątek bramkarza nie jest naruszeniem');
});

test('Awaria pola: 17 dostępnych to awaria, 18 nie; do 5 z rezerw, potem 2 juniorów akademii; rezerwy dostają bramkarza akademii', () => {
  const g = newGame();
  const lf = legFix(g);
  g.date = '2026-08-01';
  const lg = field(g, 'legia');
  const hurt = lg.slice(-7); // 25 - 7 = 18 dostępnych
  for (const p of hurt) p.injuryDays = 20;
  assert.equal(emergencyFor(g, 'legia', lf.id).emergency, false, '18 dostępnych: bez awarii');
  lg[0].injuryDays = 20;
  const em = emergencyFor(g, 'legia', lf.id);
  assert.equal(em.squad, true); assert.equal(em.available.total, 17);
  // junior akademii dopiero, gdy zabraknie zawodników rezerw
  const acad = g.world.clubs.legia.academy.map((id) => P(g, id)).find((p) => p.pos !== 'BR' && p.age >= 17);
  assert.ok(canCallUp(g, acad.id, lf.id).reasons.includes('academyOrder'));
  const out = emergencyFill(g, 'legia', { by: 'ai' });
  assert.ok(out.some((x) => x.status === 'accepted'));
  assert.equal(emergencyFor(g, 'legia', lf.id).emergency, false);
  // większy brak: 5 z rezerw, potem 2 juniorów
  const g2 = newGame();
  g2.date = '2026-08-01';
  for (const p of field(g2, 'legia').slice(-12)) p.injuryDays = 20; // 13 dostępnych
  for (const p of field(g2, 'legia-ii').slice(0, 20)) p.injuryDays = 20; // w rezerwach 2 zdrowych z pola
  const out2 = emergencyFill(g2, 'legia', { by: 'ai' }).filter((x) => x.status === 'accepted');
  const list = g2.reserves.list.filter((d) => d.fixtureId === legFix(g2).id);
  assert.equal(list.filter((d) => !d.acad).length, 2);
  assert.equal(list.filter((d) => d.acad).length, 2, 'najwyżej 2 juniorów akademii z pola');
  assert.equal(out2.length, 4);
  // bramkarz: rezerwy, którym zostaje mniej niż 2 bramkarzy, dostają bramkarza akademii
  const g3 = newGame();
  g3.date = '2026-08-01';
  for (const p of gks(g3, 'legia').slice(1)) p.injuryDays = 20;
  const rg = gks(g3, 'legia-ii');
  for (const p of rg.slice(2)) p.injuryDays = 20; // rezerwy mają 2 zdrowych
  const r3 = requestCallUp(g3, { pid: rg[0].id, fixtureId: legFix(g3).id });
  assert.equal(r3.status, 'accepted');
  assert.ok(r3.refill, 'rezerwy dostały bramkarza akademii');
  const d = g3.reserves.list.find((x) => x.pid === r3.refill);
  assert.equal(d.to, 'legia-ii'); assert.equal(P(g3, r3.refill).pos, 'BR');
  assert.ok(squadFor(g3, 'legia-ii', 'liga2', resFix(g3)).some((x) => x.id === r3.refill));
});

test('Eskalacja do dyrektora sportowego: tylko po odmowie, szansa z autorytetu i zaufania, koszt zaufania, raz na 30 dni', () => {
  const g = newGame('legia');
  g.board = { trust: 60 };
  g.authority = { v: 0.7, club: 'legia' };
  assert.equal(escalationChance(g, 'legia'), (35 + 28 + 12) / 100);
  g.authority.v = 0; g.board.trust = 0;
  assert.equal(escalationChance(g, 'legia'), 0.35);
  g.authority.v = 1; g.board.trust = 100;
  assert.equal(escalationChance(g, 'legia'), 0.9, 'najwyżej 90 %');
  g.authority.v = 0.7; g.board.trust = 60;
  const rf = resFix(g);
  g.date = '2026-07-31';
  // bez odmowy: eskalacja niemożliwa
  const any = field(g, 'legia')[0];
  assert.deepEqual(forceRequest(g, { pid: any.id, fixtureId: rf.id }).reasons, ['notRefused']);
  // twarda odmowa: eskalacja nie działa
  const old = field(g, 'legia').find((p) => p.age >= 24);
  old.rsv = { s: SEASON, h1: 5, h2: 0, lo: 0 };
  assert.equal(forceRequest(g, { pid: old.id, fixtureId: rf.id }).hard, true);
  // znajdź miękką odmowę (prośba późna)
  let refused = null;
  for (const p of field(g, 'legia').slice(0, 14)) {
    if (p === old) continue;
    const r = requestDelegation(g, { pid: p.id, fixtureId: rf.id });
    if (r.status === 'refused' && !r.hard) { refused = p; break; }
    if (r.status === 'accepted') cancelDelegation(g, { pid: p.id, fixtureId: rf.id });
  }
  assert.ok(refused, 'jest odmowa trenera rezerw');
  const trust0 = g.board.trust;
  const mood0 = coachMood(g, 'legia-ii');
  const e = forceRequest(g, { pid: refused.id, fixtureId: rf.id });
  if (e.status === 'accepted') {
    assert.equal(g.board.trust, trust0 - 2);
    assert.equal(coachMood(g, 'legia-ii'), mood0 - RSV.moodForce);
    assert.equal(g.reserves.forceOk.legia, g.date);
  } else {
    assert.equal(g.board.trust, trust0 - 4);
    assert.deepEqual(e.reasons, ['escalationRejected']);
  }
  assert.equal(e.chance, 0.75);
  // kolejna eskalacja przed upływem 30 dni: odmowa
  g.reserves.refused[`${field(g, 'legia')[15].id}:${rf.id}`] = { date: g.date, kind: 'down', by: 'user' };
  assert.deepEqual(forceRequest(g, { pid: field(g, 'legia')[15].id, fixtureId: rf.id }).reasons, ['forceCooldown']);
  // po zatwierdzonej eskalacji: +20 pp szansy odmowy przez 14 dni
  g.reserves.forceOk.legia = g.date;
  const p2 = field(g, 'legia')[16];
  const r2 = requestDelegation(g, { pid: p2.id, fixtureId: rf.id });
  if (r2.status === 'refused' && !r2.hard) assert.ok(r2.reasons.includes('afterForce'));
});

test('Przeniesienie na stałe w górę: kontrakt pierwszej drużyny bez lastMove; rozwiązanie rezerw nie kasuje delegowanych', () => {
  const g = newGame();
  const y = field(g, 'legia-ii').find((p) => p.age <= 21 && !p.lastMove);
  const r = promoteReserve(g, y.id);
  assert.equal(r.ok, true, r.text);
  assert.equal(y.clubId, 'legia');
  assert.ok(g.world.clubs.legia.squad.includes(y.id) && !g.world.clubs['legia-ii'].squad.includes(y.id));
  assert.ok(!y.lastMove, 'bez lastMove (wychowanek w limicie)');
  g.reserves.promoted[`${SEASON}:legia`] = RSV.promoteMax;
  assert.equal(promoteReserve(g, field(g, 'legia-ii')[5].id).ok, false);
  // delegowany zawodnik i rozwiązanie rezerw (IV liga)
  g.date = '2026-07-27';
  const p = field(g, 'legia')[2];
  assert.equal(requestDelegation(g, { pid: p.id, fixtureId: resFix(g).id }).status, 'accepted');
  const c = clubById('legia-ii'); const t0 = c.tier;
  c.tier = 5;
  try {
    dissolveDropped(g, '2027-07-01');
    g.date = '2026-07-28';
    processDay(g);
  } finally { c.tier = t0; }
  assert.ok(g.world.players[p.id] && g.world.clubs.legia.squad.includes(p.id), 'zawodnik zostaje w Legii');
  assert.equal(g.reserves.list.length, 0, 'przydział wygasł');
  assert.equal(reservesOf(g, 'legia').ok, false);
});

test('Parytet AI: kluby AI delegują w poniedziałki i powołują w awarii, bez podwójnej gry w weekend', () => {
  const g = newGame('widzew', 5);
  const rng = new Rng('gracz');
  while (g.date < '2026-09-30') {
    for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === g.clubId || x.away === g.clubId))) applyResult(g, f, playQuick(g, f, rng), rng);
    g.date = addDays(g.date, 1); processDay(g);
  }
  const st = statsOf(g);
  assert.ok(st.aiDown > 10, `delegowania AI: ${st.aiDown}`);
  assert.equal(st.viol, 0, 'nikt nie zagrał w dwóch drużynach klubu w jeden weekend');
  assert.equal(st.viol48, 0, 'nikt nie złamał 48 h');
  // każdy delegowany został w kadrze swojego klubu
  for (const p of Object.values(g.world.players)) if (p.season?.oth?.apps) assert.ok(g.world.clubs[p.clubId]?.squad.includes(p.id) || g.world.clubs[p.clubId]?.academy.includes(p.id));
  // Widzew (gracz) ma rezerwy, ale AI nie decyduje za gracza
  assert.ok(!Object.values(g.world.players).some((p) => p.clubId === 'widzew' && p.season?.oth?.apps));
});
