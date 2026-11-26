// Długi i zaległości wobec zawodników (src/career/arrears.js, docs/wlasciciele-i-dlugi.md): dług -> miesiące
// zaległości -> wezwania i zakaz transferowy -> spłata w terminie zatrzymuje zawodników -> po terminie rozwiązania
// kontraktów z winy klubu; ujemne punkty w tabeli; brak licencji -> spadek; awaryjne uzupełnienie kadry (rezerwy
// 2 klasy słabsze, juniorzy 3 klasy słabsi); dopłaty właściciela do długów; stary zapis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { createSeason } from '../src/season/season.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { standings, setPointDeductions } from '../src/season/standings.js';
import { computeMoves } from '../src/season/leagues.js';
import { compOfClub, compClubIds } from '../src/season/leagueComps.js';
import { canSign, squadCount } from '../src/career/squadLimit.js';
import { lateFree } from '../src/career/lateJoins.js';
import { reservesOf } from '../src/career/reserves.js';
import {
  DEBT, ensureDebt, monthlyCost, debtMonth, debtDay, distressSale, quitChance, emergencySquadFill, licenceVerdicts, licenceDrop, ownerBailouts, debtNewSeason,
} from '../src/career/arrears.js';
import '../src/season/dailySystems.js';

const newGame = (seed = 4, clubId = 'widzew') => {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'A', lastName: 'B' } } };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  return g;
};
const debtTo = (g, id, months) => { g.finance.clubs[id].balance = -months * monthlyCost(g, id); };
const subjects = (msgs) => msgs.map((m) => m.subject);

test('Dług -> ostrzeżenie -> zaległości po 2 miesiącach -> wezwania i zakaz transferowy (gracz i AI)', () => {
  const g = newGame();
  for (const id of ['widzew', 'lech']) debtTo(g, id, 2);
  const m1 = debtMonth(g, '2026-09-01');
  assert.ok(subjects(m1).includes('Klubowi brakuje pieniędzy na pensje'));
  assert.equal(g.debt.clubs.widzew.below, 1); assert.equal(g.debt.clubs.widzew.months, 0);
  const m2 = debtMonth(g, '2026-10-01');
  assert.equal(g.debt.clubs.widzew.months, 1);
  assert.ok(subjects(m2).includes('Zaległości w pensjach zawodników'));
  assert.equal(canSign(g).ok, true, 'w 1. miesiącu bez zakazu');
  const m3 = debtMonth(g, '2026-11-01');
  const s = g.debt.clubs.widzew;
  assert.equal(s.months, 2); assert.equal(s.ban, true); assert.equal(s.deadline, '2026-12-15');
  assert.ok(subjects(m3).some((x) => x.includes('Zakaz transferowy')));
  const cs = canSign(g);
  assert.equal(cs.ok, false); assert.ok(cs.ban && /Zakaz transferowy/.test(cs.text));
  assert.equal(squadCount(g, 'lech').full, true, 'klub AI też ma zakaz');
  assert.equal(squadCount(g, 'lech').room, 0);
  assert.equal(squadCount(g, 'legia').full, false);
});

test('Spłata w terminie zatrzymuje zawodników i znosi zakaz; po terminie zawodnicy odchodzą (wolni, odszkodowanie 3 pensje)', () => {
  const g = newGame();
  debtTo(g, 'widzew', 2);
  for (const d of ['2026-09-01', '2026-10-01', '2026-11-01']) debtMonth(g, d);
  const before = squadOf(g.world, 'widzew').length;
  g.finance.clubs.widzew.balance = 0; // pełna spłata
  const paid = debtDay(g, '2026-11-20');
  assert.ok(subjects(paid).includes('Zaległości wobec zawodników spłacone'));
  assert.equal(g.debt.clubs.widzew, undefined);
  assert.equal(canSign(g).ok, true);
  // Ponownie dług: tym razem po terminie
  debtTo(g, 'widzew', 2);
  for (const d of ['2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01']) debtMonth(g, d);
  const s = g.debt.clubs.widzew;
  assert.equal(s.months, 3); assert.equal(s.deadline, '2027-03-15');
  assert.deepEqual(debtDay(g, '2027-03-15').filter((m) => /rozwiązali/.test(m.subject)), [], 'do 15. dnia: termin trwa');
  assert.equal(squadOf(g.world, 'widzew').length, before);
  const bal0 = g.finance.clubs.widzew.balance;
  const out = debtDay(g, '2027-03-16');
  const msg = out.find((m) => /rozwiązali kontrakty/.test(m.subject));
  assert.ok(msg, 'po terminie: odejścia');
  const gone = g.market.history.filter((e) => e.cause === 'zaległości' && e.from === 'widzew');
  assert.ok(gone.length >= 3 && gone.length < before, `odeszło ${gone.length} z ${before}`);
  const p = g.world.players[gone[0].playerId];
  assert.equal(p.clubId, null); assert.equal(p.free, true); assert.ok(g.market.free.includes(p.id));
  assert.equal(lateFree(g, p, '2027-03-16'), false, 'zgłoszenie także poza oknem');
  assert.ok(g.finance.clubs.widzew.balance < bal0, 'odszkodowania zwiększają dług');
  // Kadra uzupełniona awaryjnie do 18 (2 bramkarzy)
  const sq = squadOf(g.world, 'widzew');
  assert.ok(sq.length >= 18 && sq.filter((x) => x.pos === 'BR').length >= 2);
  // Nowi (awaryjni) nie odchodzą w kolejnym miesiącu
  debtMonth(g, '2027-04-01');
  debtDay(g, '2027-04-16');
  assert.ok(squadOf(g.world, 'widzew').filter((x) => x.emergency).length >= 1);
});

test('Szansa odejścia: 35 %, gwiazda +20, agent +10, lojalny -15, +15 za miesiąc, najwyżej 90 %', () => {
  const p = { id: 'x', traits: { loyalty: 10 }, agent: 'brak' };
  assert.ok(Math.abs(quitChance(p) - 0.35) < 1e-9);
  assert.ok(Math.abs(quitChance(p, { star: true }) - 0.55) < 1e-9);
  assert.ok(Math.abs(quitChance({ ...p, agent: 'rekin' }) - 0.45) < 1e-9);
  assert.ok(Math.abs(quitChance({ ...p, traits: { loyalty: 15 } }) - 0.2) < 1e-9);
  assert.ok(Math.abs(quitChance(p, { extra: 2 }) - 0.65) < 1e-9);
  assert.equal(quitChance({ ...p, agent: 'rekin' }, { star: true, extra: 5 }), DEBT.quit.max);
});

test('Ujemne punkty od 4. miesiąca co 2 miesiące, widoczne w tabeli ligi', () => {
  const g = newGame();
  debtTo(g, 'lech', 3);
  for (const d of ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01']) debtMonth(g, d);
  assert.equal(g.debt.clubs.lech.months, 4);
  const comp = compOfClub(clubById('lech'));
  assert.equal(g.season.deductions[comp].lech, 3);
  const row = standings(g.fixtures.filter((f) => f.comp === comp), compClubIds(comp)).find((r) => r.id === 'lech');
  assert.equal(row.points, -3); assert.equal(row.deducted, 3);
  debtMonth(g, '2027-01-01');
  assert.equal(g.season.deductions[comp].lech, 3, '5. miesiąc: bez nowej kary');
  debtMonth(g, '2027-02-01');
  assert.equal(g.season.deductions[comp].lech, 6, '6. miesiąc: kolejne 3 punkty');
  // Nowy sezon bez kar: tabela bez odjętych punktów
  setPointDeductions(null);
  assert.equal(standings(g.fixtures.filter((f) => f.comp === comp), compClubIds(comp)).find((r) => r.id === 'lech').points, 0);
});

test('Licencja: zaległości 30 czerwca = brak licencji; Ekstraklasa -6 pkt, niżej spadek, drugi raz 2 klasy', () => {
  const g = newGame();
  ensureDebt(g);
  const l1 = CLUBS_PL.filter((c) => c.tier === 2 && !c.parent)[0].id;
  for (const id of ['lech', l1]) g.debt.clubs[id] = { months: 3, below: 2 };
  g.finance.clubs.lech.balance = -1e7; g.finance.clubs[l1].balance = -1e6;
  debtDay(g, '2027-03-31');
  assert.ok(g.debt.lic.lech.warn && g.debt.lic[l1].warn);
  debtDay(g, '2027-06-30');
  assert.ok(g.debt.lic.lech.fail && g.debt.lic[l1].fail);
  const v = licenceVerdicts(g, 2026);
  assert.deepEqual(v.points, { lech: DEBT.licence.ekPoints });
  assert.deepEqual(v.drops, { [l1]: 1 });
  assert.equal(licenceDrop(1, true), 2); assert.equal(licenceDrop(2, true), 2); assert.equal(licenceDrop(3, true), 1);
  // Ruchy lig: zwycięzca 1 Ligi bez licencji spada do 2 Ligi zamiast awansu
  const tables = { 1: CLUBS_PL.filter((c) => c.tier === 1).map((c) => c.id), 2: CLUBS_PL.filter((c) => c.tier === 2).map((c) => c.id), 3: CLUBS_PL.filter((c) => c.tier === 3).map((c) => c.id) };
  const leader = tables[2].find((id) => !clubById(id).parent);
  const mv = computeMoves(tables, {}, {}, new Rng('ligi'), { licence: { [leader]: 1 } });
  assert.equal(mv.tiers[leader], 3);
  assert.ok(!mv.promoted[1].includes(leader) && mv.relegated[3].includes(leader));
  assert.equal(mv.relegated[3].length, 3, 'nadal 3 spadkowiczów z 1 Ligi');
  // Drugi raz z rzędu z Ekstraklasy: 2 klasy niżej, najlepszy spadkowicz 1 Ligi zostaje
  const top = tables[1][0];
  const mv2 = computeMoves(tables, {}, {}, new Rng('ligi'), { licence: { [top]: 2 } });
  assert.equal(mv2.tiers[top], 3);
  assert.ok(mv2.notes.some((n) => n.kind === 'reprieve' && n.tier === 2));
  const t2 = Object.values(mv2.tiers).filter((t) => t === 2).length;
  const t2base = Object.values(computeMoves(tables, {}, {}, new Rng('ligi')).tiers).filter((t) => t === 2).length;
  assert.equal(t2, t2base, 'liczba drużyn w 1 Lidze bez zmian');
  // Nowy sezon: kara punktowa Ekstraklasy w nowej tabeli
  debtNewSeason(g, '2027-07-01', { licPoints: v.points });
  assert.equal(g.season.deductions[compOfClub(clubById('lech'))].lech, DEBT.licence.ekPoints);
});

test('Awaryjne uzupełnienie: z rezerw 2 klasy słabsi, bez rezerw juniorzy 3 klasy słabsi, do 18 zawodników i 2 bramkarzy', () => {
  const g = newGame();
  const withRes = CLUBS_PL.find((c) => c.tier === 1 && reservesOf(g, c.id).id)?.id;
  const noRes = CLUBS_PL.find((c) => c.tier === 1 && !c.parent && !reservesOf(g, c.id).id)?.id;
  assert.ok(withRes && noRes, `${withRes} / ${noRes}`);
  const strip = (id) => { const C = g.world.clubs[id]; C.squad = C.squad.filter((pid) => g.world.players[pid].pos !== 'BR').slice(0, 8); };
  strip(withRes); strip(noRes);
  const a = emergencySquadFill(g, withRes, '2026-10-01');
  const b = emergencySquadFill(g, noRes, '2026-10-01');
  for (const id of [withRes, noRes]) {
    const sq = squadOf(g.world, id);
    assert.ok(sq.length >= 18 && sq.filter((p) => p.pos === 'BR').length >= 2, `${id}: ${sq.length}`);
  }
  assert.ok(a.every((p) => p.emergency === 'rezerwy' && p.age >= 18 && p.age <= 22));
  assert.ok(b.every((p) => p.emergency === 'juniorzy' && p.age >= 17 && p.age <= 19));
  const avg = (xs) => xs.reduce((s, p) => s + p.ovr, 0) / xs.length;
  const first = avg(squadOf(g.world, 'legia').slice(0, 8));
  assert.ok(avg(a) < first - 1.5 && avg(b) < avg(a), `rezerwy ${avg(a).toFixed(2)}, juniorzy ${avg(b).toFixed(2)}, kadra ${first.toFixed(2)}`);
  assert.ok(a.every((p) => p.contract.wage < 20000), 'tanie kontrakty');
});

test('Dopłaty właściciela do długów klubów AI: najwyżej 3 ciężkie sezony z rzędu, gracz bez comiesięcznych dopłat', () => {
  const g = newGame();
  const id = 'lech';
  const c = g.finance.clubs[id];
  c.balance = -5e6;
  ownerBailouts(g, '2026-08-01');
  assert.ok(c.balance >= 0, 'właściciel pokrywa dług');
  assert.ok(g.debt.bail[id].sum >= 5e6 - 1);
  g.finance.clubs.widzew.balance = -1e6;
  ownerBailouts(g, '2026-08-01');
  assert.equal(g.finance.clubs.widzew.balance, -1e6, 'klub gracza: bez comiesięcznych dopłat');
  // 3 ciężkie sezony: odmowa
  const cost = c.plan.wages + c.plan.ops;
  for (let i = 0; i < 3; i++) { g.debt.bail[id].sum = cost; c.balance = -1; debtNewSeason(g, `${2027 + i}-07-01`, { oldCosts: { [id]: cost } }); }
  assert.equal(g.debt.bail[id].off, true);
  c.balance = -3e6;
  ownerBailouts(g, '2029-08-01');
  assert.equal(c.balance, -3e6, 'po odmowie dług zostaje');
});

test('Stary zapis bez stanu długów: system dnia działa, brak zaległości przy dodatnim saldzie', () => {
  const g = newGame();
  delete g.debt;
  assert.deepEqual(debtMonth(g, '2026-08-01'), []);
  assert.deepEqual(debtDay(g, '2026-08-02'), []);
  assert.deepEqual(g.debt.clubs, {});
});

test('Klub AI w zaległościach wystawia najdroższych zawodników taniej, klub gracza nie', () => {
  const g = newGame();
  const ai = CLUBS_PL.find((c) => c.tier === 1 && c.id !== g.clubId && g.world.clubs[c.id]).id;
  const n = distressSale(g, ai, '2026-10-01');
  assert.equal(n, DEBT.sale.listed);
  const listed = squadOf(g.world, ai).filter((p) => g.market.listed[p.id]?.distress);
  const top = squadOf(g.world, ai).filter((p) => !p.loan).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 2).map((p) => p.id).sort();
  assert.deepEqual(listed.map((p) => p.id).sort(), top, 'najdrożsi');
  for (const p of listed) assert.ok(g.market.listed[p.id].price <= p.value * 0.9 + 10000 && g.market.listed[p.id].price >= p.value * 0.8 - 10000, 'taniej o 10-20 %');
  assert.equal(distressSale(g, ai, '2026-11-01'), 0, 'najwyżej 2 naraz');
  assert.equal(distressSale(g, g.clubId, '2026-10-01'), 0, 'klub gracza decyduje sam');
});
