// Kariera trenera (docs/kariera-trenera.md): punkty reputacji, nasycenie i progi lig, kary, odznaki, trofea
// (zasada 12 meczów), migracja starych zapisów, brak podwójnego liczenia, reputacja trenerów AI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CAREER, BADGE_IDS, BADGE_NAMES, repGain, repLoss, repSat, boardStartTrust, patienceMul, fireThreshold, reachOf,
  ensureCareerHistory, careerScan, careerSeasonEnd, careerSummary, careerMonth, coachOfMonth, coachOfSeason, pendingUnlocks, markUnlocksSeen,
  aiCoachRep, aiCoachSeasonEnd, careerLeave, careerJoin,
} from '../src/career/coachCareer.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { Rng } from '../src/core/rng.js';
import { generateWorld } from '../src/world/worldGen.js';
import { ensureCoaches } from '../src/career/coaches.js';

const TIER2 = CLUBS_PL.filter((c) => c.tier === 2 && !c.parent).map((c) => c.id);
const TIER1 = CLUBS_PL.filter((c) => c.tier === 1 && !c.parent).map((c) => c.id);
const L3 = CLUBS_PL.find((c) => c.tier === 4 && !c.parent);

/** Minimalna gra bez świata: klub, terminarz, sezon. */
function mini(clubId = 'widzew', { rep = 30, date = '2026-07-01' } = {}) {
  const g = { seed: 7, clubId, date, season: { seasonId: '2026/27' }, fixtures: [], inbox: [], manager: { rep, history: [{ club: clubId, from: date }], fired: 0 }, board: { goal: { target: 12, text: 'środek tabeli', rank: 10 }, fansMood: 55 } };
  ensureCareerHistory(g);
  return g;
}
let fid = 0;
const fx = (g, o) => { const f = { id: `t${++fid}`, played: true, time: '18:00', ...o }; g.fixtures.push(f); return f; };
const league = (g, date, opp, gf, ga, home = true) => fx(g, { date, comp: 'ekstraklasa', home: home ? g.clubId : opp, away: home ? opp : g.clubId, result: { score: home ? [gf, ga] : [ga, gf] } });

test('Reputacja: nasycenie, próg ligi (25 % nadwyżki), trofea bez progu, kary rosną z marką', () => {
  assert.equal(repSat(10), 1);
  assert.ok(Math.abs(repSat(60) - 0.5) < 1e-9);
  assert.equal(repSat(95), 0.25);
  // III liga (próg 35): 30 + 9 x 0,8 = 37,2, nad progiem 25 %: 35 + 2,2 x 0,25
  assert.ok(Math.abs(repGain(30, 9, 4) - 35.55) < 1e-9);
  assert.ok(Math.abs(repGain(30, 9, 4, { noCap: true }) - 37.2) < 1e-9);
  assert.ok(Math.abs(repGain(40, 4, 4) - (40 + 4 * 0.7 * 0.25)) < 1e-9, 'nad progiem tylko 25 %');
  assert.ok(Math.abs(repGain(50, 6, 1) - 53.6) < 1e-9, 'Ekstraklasa: próg 85, nasycenie 0,6');
  assert.ok(Math.abs(repLoss(50, 6) - 43.4) < 1e-9, 'kara x (0,6 + rep/100)');
  assert.ok(Math.abs(repLoss(10, 6) - 5.8) < 1e-9);
  assert.equal(repLoss(2, 8), 0);
  assert.equal(repGain(99, 16, 1, { noCap: true }), 100);
  assert.deepEqual(CAREER.caps, { 1: 85, 2: 62, 3: 48, 4: 35, 5: 35 });
  assert.equal(reachOf(30), 50);
});

test('Zarząd: zaufanie na start z reputacji, cierpliwość, próg zwolnienia z popularności (granice)', () => {
  assert.equal(boardStartTrust(21, 35), 55); // rep = 0,6 x LC: jak dawniej 55
  assert.equal(boardStartTrust(80, 40), 69);
  assert.equal(boardStartTrust(0, 95), 45);
  assert.equal(boardStartTrust(100, 0), 75);
  assert.equal(patienceMul(30, 50), 1, 'trener na poziomie klubu: bez zmian');
  assert.ok(Math.abs(patienceMul(50, 50) - 0.8) < 1e-9, 'znane nazwisko: cierpliwszy zarząd');
  assert.equal(patienceMul(10, 90), 1.15);
  assert.equal(fireThreshold(50), 18);
  assert.equal(fireThreshold(100), 15);
  assert.equal(fireThreshold(0), 21);
  assert.ok(fireThreshold(-500) <= 22 && fireThreshold(500) >= 12);
});

test('Odznaki: 20 identyfikatorów w ustalonej kolejności, nazwy bez pauzy em', () => {
  assert.deepEqual(BADGE_IDS, ['mp_ekstraklasa', 'mp_1liga', 'mp_2liga', 'mp_3liga', 'puchar_polski', 'superpuchar_polski', 'liga_mistrzow', 'liga_europy',
    'liga_konferencji', 'superpuchar_europy', 'awans', 'utrzymanie_beniaminek', 'cel_ponad_plan', 'mecze_100', 'mecze_250', 'mecze_500',
    'seria_bez_porazki', 'sensacja', 'trener_miesiaca', 'trener_sezonu']);
  for (const id of BADGE_IDS) { assert.ok(BADGE_NAMES[id], id); assert.ok(!BADGE_NAMES[id].includes('\u2014')); }
});

test('Mecze: bilans, serie, rekordy, punkty za wygraną z silniejszym; ten sam mecz nie liczy się drugi raz', () => {
  const g = mini('widzew');
  league(g, '2026-07-20', 'legia', 2, 0, false); // wygrana z faworytem na wyjeździe
  league(g, '2026-07-27', 'korona', 1, 1);
  league(g, '2026-08-03', 'lech', 0, 3, false);
  const before = g.manager.rep;
  careerScan(g, '2026-08-04');
  const s = careerSummary(g);
  assert.deepEqual([s.matches.n, s.matches.w, s.matches.d, s.matches.l, s.matches.gf, s.matches.ga], [3, 1, 1, 1, 3, 4]);
  assert.ok(g.manager.rep > before, 'wygrana z faworytem podnosi reputację');
  careerScan(g, '2026-08-04');
  careerScan(g, '2026-08-05');
  assert.equal(careerSummary(g).matches.n, 3, 'bez dublowania');
  const rec = Object.fromEntries(s.records.map((r) => [r.key, r]));
  assert.equal(rec.bigWin.value, '2:0');
  assert.equal(rec.bigLoss.value, '0:3');
  assert.ok(s.repLog.some((e) => /silniejszym/.test(e.text)));
  // Sensacja: wygrana przy oczekiwanych punktach do 0,8 (Widzew na wyjeździe z Legią: 0,69)
  assert.equal(s.badges.sensacja?.count, 1);
});

test('Odznaki meczowe: seria 10 meczów ligowych bez porażki, 100 meczów, kolejka odblokowań', () => {
  const g = mini('widzew');
  for (let i = 0; i < 10; i++) league(g, `2026-08-${String(i + 1).padStart(2, '0')}`, 'korona', 1, 1);
  careerScan(g, '2026-08-31');
  assert.equal(careerSummary(g).badges.seria_bez_porazki?.count, 1);
  league(g, '2026-09-01', 'korona', 0, 1);
  for (let i = 0; i < 10; i++) league(g, `2026-09-${String(i + 2).padStart(2, '0')}`, 'korona', 2, 1);
  careerScan(g, '2026-09-30');
  assert.equal(careerSummary(g).badges.seria_bez_porazki.count, 2, 'po porażce nowa seria liczy się od zera');
  let d = new Date('2026-10-01T12:00:00Z');
  for (let i = 0; i < 79; i++) { league(g, d.toISOString().slice(0, 10), 'korona', 1, 0); d.setUTCDate(d.getUTCDate() + 1); }
  careerScan(g, '2027-06-30');
  const s = careerSummary(g);
  assert.equal(s.matches.n, 100);
  assert.equal(s.badges.mecze_100?.count, 1);
  const p = pendingUnlocks(g);
  assert.ok(p.some((u) => u.badgeId === 'mecze_100' && u.count === 1 && u.clubName));
  const ser = p.filter((u) => u.badgeId === 'seria_bez_porazki').map((u) => u.count);
  assert.deepEqual(ser, ser.map((_, i) => i + 1), 'licznik rośnie z każdym zdobyciem');
  markUnlocksSeen(g);
  assert.equal(pendingUnlocks(g).length, 0);
});

test('Trofeum: finał Pucharu Polski po 12 meczach daje odznakę i punkty bez progu, wcześniej nie', () => {
  const late = mini('widzew');
  fx(late, { date: '2027-05-02', comp: 'pp', round: 'F', home: 'widzew', away: 'legia', neutral: true, result: { score: [1, 0] } });
  careerScan(late, '2027-05-03');
  assert.equal(careerSummary(late).trophies.length, 0, 'trener z jednym meczem w sezonie nie dostaje trofeum');
  const g = mini('widzew');
  for (let i = 0; i < 12; i++) league(g, `2026-08-${String(i + 1).padStart(2, '0')}`, 'korona', 1, 1);
  fx(g, { date: '2027-05-02', comp: 'pp', round: 'F', home: 'widzew', away: 'legia', neutral: true, result: { score: [1, 0] } });
  const before = g.manager.rep;
  careerScan(g, '2027-05-03');
  const s = careerSummary(g);
  assert.equal(s.trophies.length, 1);
  assert.equal(s.trophies[0].badgeId, 'puchar_polski');
  assert.ok(g.manager.rep - before > 3, 'Puchar Polski: +4 x nasycenie');
  // Superpuchar: wystarczy prowadzić mecz
  const h = mini('widzew');
  fx(h, { date: '2026-07-12', comp: 'super', round: 'F', home: 'widzew', away: 'lech', neutral: true, result: { score: [1, 1], shootout: [5, 4] } });
  careerScan(h, '2026-07-13');
  assert.equal(careerSummary(h).badges.superpuchar_polski?.count, 1);
});

test('Puchar: awans kosztem klubu dwie ligi wyżej to sensacja, odpadnięcie z dużo niższą ligą to kara', () => {
  const g = mini(L3.id, { rep: 15 });
  fx(g, { date: '2026-08-20', comp: 'pp', round: 'R64', home: L3.id, away: TIER2[0], result: { score: [2, 2], shootout: [4, 3] } });
  careerScan(g, '2026-08-21');
  assert.equal(careerSummary(g).badges.sensacja?.count, 1);
  const h = mini('legia', { rep: 60 });
  fx(h, { date: '2026-08-20', comp: 'pp', round: 'R64', home: L3.id, away: 'legia', result: { score: [1, 0] } });
  const r0 = h.manager.rep;
  careerScan(h, '2026-08-21');
  assert.ok(h.manager.rep < r0 - 2, 'odpadnięcie z III ligą: -2 x (0,6 + rep/100)');
});

test('Koniec sezonu: mistrzostwo 1 Ligi z awansem, cel, odznaki sezonu, wiersz sezonu i próg ligi', () => {
  const id = TIER2[3];
  const g = mini(id, { rep: 30 });
  g.board.goal = { target: 6, rank: 6, text: 'baraże' };
  for (let i = 0; i < 30; i++) league(g, `2026-${String(8 + Math.floor(i / 28)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, TIER2[(i % 10) + 5], 2, 0);
  for (const f of g.fixtures) f.comp = 'liga1';
  const table = [id, ...TIER2.filter((x) => x !== id)];
  const res = { tables: { 1: TIER1, 2: table, 3: [] }, rows: { 2: table.map((x, i) => ({ id: x, points: 80 - i })) }, groupTables: {}, cup: {}, uefa: {} };
  const moves = { promoted: { 1: [id, table[1]], 2: [], 3: [], 4: [] }, relegated: { 2: [], 3: [], 4: [], 5: [] } };
  const before = g.manager.rep;
  careerSeasonEnd(g, '2027-07-01', { res, moves, goal: g.board.goal });
  const s = careerSummary(g);
  const row = s.seasons[0];
  assert.equal(row.pos, 1);
  assert.equal(row.promoted, true);
  assert.equal(row.achieved, 'exceeded');
  for (const b of ['mp_1liga', 'awans', 'cel_ponad_plan']) assert.ok(row.trophies.includes(b), b);
  assert.ok(s.trophies.some((t) => t.badgeId === 'mp_1liga'));
  assert.ok(g.manager.rep - before > 8, `awans i tytuł: ${g.manager.rep - before}`);
  assert.equal(coachOfSeason({ ...g }, id, res, moves), row.trophies.includes('trener_sezonu'));
  // Ta sama ścieżka przy reputacji nad progiem 1 Ligi (62): awans daje mało
  const h = mini(id, { rep: 70 });
  for (const f of g.fixtures) h.fixtures.push({ ...f, id: `h${f.id}` });
  const r0 = h.manager.rep;
  careerSeasonEnd(h, '2027-07-01', { res, moves, goal: g.board.goal });
  assert.ok(h.manager.rep - r0 < g.manager.rep - before, 'nad progiem ligi przyrost wolniejszy');
});

test('Spadek, zwolnienie i rezygnacja: kary i blizny jako tekst (bez odznak)', () => {
  const g = mini('korona', { rep: 40 });
  for (let i = 0; i < 9; i++) league(g, `2026-08-${String(i + 1).padStart(2, '0')}`, 'legia', 0, 2);
  careerScan(g, '2026-08-20');
  const r0 = g.manager.rep;
  careerLeave(g, '2026-10-01', 'zwolnienie');
  assert.ok(r0 - g.manager.rep >= 6, 'zwolnienie: -6 x (0,6 + rep/100)');
  const s = careerSummary(g);
  assert.ok(s.scars.some((x) => /Zwolnienie/.test(x.text)));
  assert.ok(s.seasons.some((x) => x.fired && x.clubId === 'korona'));
  assert.ok(s.stints[0].to === '2026-10-01' && s.stints[0].why === 'zwolnienie');
  assert.equal(Object.keys(s.badges).filter((b) => !BADGE_IDS.includes(b)).length, 0, 'brak odznak negatywnych');
  careerJoin(g, 'widzew', '2026-11-01');
  assert.equal(careerSummary(g).stints.length, 2);
});

test('Trener miesiąca: najlepsze punkty na mecz w lidze w miesiącu (co najmniej 3 mecze), deterministycznie', () => {
  const g = mini('widzew');
  for (let i = 0; i < 3; i++) league(g, `2026-10-${String(5 + i * 7).padStart(2, '0')}`, TIER1[i + 5], 3, 0);
  fx(g, { date: '2026-10-06', comp: 'ekstraklasa', home: 'legia', away: 'lech', result: { score: [1, 1] } });
  assert.equal(coachOfMonth(g, '2026-10'), true);
  fx(g, { date: '2026-10-08', comp: 'ekstraklasa', home: 'rakow', away: 'lech', result: { score: [5, 0] } });
  fx(g, { date: '2026-10-15', comp: 'ekstraklasa', home: 'rakow', away: 'legia', result: { score: [5, 0] } });
  fx(g, { date: '2026-10-22', comp: 'ekstraklasa', home: 'rakow', away: 'korona', result: { score: [5, 0] } });
  assert.equal(coachOfMonth(g, '2026-10'), false, 'Raków: 3 wygrane i lepszy bilans bramek');
  const msgs = careerMonth(g, '2026-11-01');
  assert.ok(Array.isArray(msgs));
});

test('Migracja starego zapisu: sezony, trofea z archiwum, mecze z historii, zwolnienia; bez podwójnego liczenia', () => {
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push({ id: `old${i}`, d: `2026-${String(8 + Math.floor(i / 6)).padStart(2, '0')}-${String((i % 6) * 4 + 1).padStart(2, '0')}`, c: 'ekstraklasa', h: 'lech', a: TIER1[(i % 10) + 2], s: [2, 1], me: 'lech' });
  rows.push({ id: 'oldF', d: '2027-05-02', c: 'pp', r: 'F', h: 'lech', a: 'legia', s: [1, 0], n: 1, me: 'lech' });
  const cur = [{ id: 'now1', d: '2027-07-20', c: 'ekstraklasa', h: 'lech', a: 'legia', s: [1, 0], me: 'lech' }];
  const g = {
    seed: 3, clubId: 'lech', date: '2027-08-01', season: { seasonId: '2027/28' }, inbox: [],
    fixtures: [{ id: 'now1', date: '2027-07-20', comp: 'ekstraklasa', home: 'lech', away: 'legia', played: true, result: { score: [1, 0] } }],
    history: { m: { '2026/27': rows, '2027/28': cur } },
    archive: [{ season: '2026/27', champion: 'lech', cup: 'lech', uefa: {}, tables: { 2: [] }, promoted: { 1: [], 2: [], 3: [], 4: [] }, relegated: { 2: [], 3: [], 4: [], 5: [] } }],
    manager: { rep: 44, fired: 1, history: [{ club: 'lech', from: '2026-07-01' }], seasons: [{ season: '2026/27', club: 'lech', tier: 1, pos: 1, target: 3 }] },
    board: { goal: { target: 3, text: 'mistrzostwo' } },
  };
  const C = ensureCareerHistory(g);
  assert.equal(C.reconstructed, true);
  const s = careerSummary(g);
  assert.equal(s.matches.n, 32);
  assert.equal(s.seasons[0].reconstructed, true);
  assert.equal(s.seasons[0].pos, 1);
  assert.equal(s.seasons[0].w, undefined, 'kontrakt widoku: bez pól wewnętrznych');
  assert.deepEqual(s.trophies.map((t) => t.badgeId).sort(), ['mp_ekstraklasa', 'puchar_polski']);
  assert.ok(s.scars.some((x) => /Zwolnienia/.test(x.text)));
  assert.equal(pendingUnlocks(g).length, 0, 'odtworzone odznaki bez animacji');
  assert.equal(g.manager.rep, 44, 'reputacja z zapisu bez zmian');
  // Drugie wywołanie i dzienny przegląd: nic się nie dubluje
  ensureCareerHistory(g);
  careerScan(g, '2027-08-01');
  const s2 = careerSummary(g);
  assert.equal(s2.matches.n, 32);
  assert.equal(s2.trophies.length, 2);
  assert.equal(s2.seasons.at(-1).achieved, 'running');
});

test('Migracja prawdziwego zapisu (jeśli plik jest dostępny): podsumowanie kariery bez błędów', () => {
  const dir = '/tmp/claude-0/-home-user-manager-pilkarski/584043b7-e82f-5eaa-9098-3a9c71e14a63/scratchpad';
  for (const f of ['save-oct.json', 'save-lech-jul.json']) {
    const p = `${dir}/${f}`;
    if (!fs.existsSync(p)) continue;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const g = raw.game ?? raw;
    delete g.manager?.career;
    ensureCareerHistory(g);
    const s = careerSummary(g);
    assert.ok(s.rep.value >= 0 && s.rep.value <= 100, f);
    assert.ok(s.matches.n >= 0 && Array.isArray(s.seasons) && s.seasons.length >= 1, f);
    const n = s.matches.n;
    ensureCareerHistory(g);
    assert.equal(careerSummary(g).matches.n, n, `${f}: idempotentne`);
  }
});

test('Trenerzy AI: reputacja startowa z atrybutów i ligi, 10 sezonów wydarzeń w granicach 0-100 bez inflacji', () => {
  const g = { seed: 4, clubId: 'widzew', date: '2026-07-01', world: generateWorld(4) };
  ensureCoaches(g);
  const byTier = (t) => Object.entries(g.coaches).filter(([id, p]) => CLUBS_PL.find((c) => c.id === id)?.tier === t && !p.caretaker).map(([, p]) => aiCoachRep(p, t));
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const start = [1, 2, 3, 4].map((t) => avg(byTier(t)));
  assert.ok(start[0] > start[1] && start[1] > start[2] && start[2] > start[3], `kolejność lig: ${start.map(Math.round)}`);
  assert.ok(start[0] >= 35 && start[0] <= 60, `Ekstraklasa ${start[0]}`);
  const rng = new Rng('ai-rep');
  for (let y = 0; y < 10; y++) {
    const tables = {}; const groupTables = {};
    for (const t of [1, 2, 3]) tables[t] = rng.shuffle(CLUBS_PL.filter((c) => c.tier === t && !c.parent).map((c) => c.id));
    for (const gr of [1, 2, 3, 4]) groupTables[gr] = rng.shuffle(CLUBS_PL.filter((c) => c.tier === 4 && c.group === gr && !c.parent).map((c) => c.id));
    const moves = { promoted: { 1: tables[2].slice(0, 2), 2: tables[3].slice(0, 2), 3: [1, 2, 3, 4].map((gr) => groupTables[gr][0]), 4: [] }, relegated: { 2: tables[1].slice(-3), 3: tables[2].slice(-3), 4: tables[3].slice(-4), 5: [] } };
    aiCoachSeasonEnd(g, { tables, groupTables, cup: { winner: tables[1][2] }, uefa: {} }, moves, () => 30);
  }
  const end = [1, 2, 3, 4].map((t) => avg(byTier(t)));
  for (const p of Object.values(g.coaches)) assert.ok(p.rep >= 0 && p.rep <= 100);
  for (let t = 0; t < 4; t++) assert.ok(Math.abs(end[t] - start[t]) <= 12, `liga ${t + 1}: ${start[t].toFixed(1)} -> ${end[t].toFixed(1)}`);
});
