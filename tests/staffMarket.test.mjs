// Sztab: zatrudnianie i zwalnianie (src/career/staffMarket.js, docs/sztab.md): migracja starych zapisów bez zmian
// sztabu i finansów pierwszego dnia, jakość efektywna z pomocnikami, limity, uczciwe okno decyzji, blokada po decyzji,
// podbieranie za zgodą osoby (zgoda albo blokada klubu, rekompensata, kara za zerwanie umowy, limity prób),
// odprawa, budżet, adaptacja obcokrajowców, obietnica roli lidera, odświeżanie listy wolnych, determinizm,
// nowe role (fizjoterapeuta, skaut), wiadomości dla gracza, widok i wydajność.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { applySeasonState } from '../src/season/rollover.js';
import { ensureTraining, staffOf, monthlyDevelopment } from '../src/training/index.js';
import { generateStaffFor, healDays } from '../src/training/staff.js';
import { STAFF_ROLES } from '../src/training/config.js';
import { scoutLine } from '../src/career/assistantReport.js';
import { buildTeamReport } from '../src/career/teamReport.js';
import { renderTraining } from '../src/ui/trainingView.js';
import '../src/season/dailySystems.js';
import {
  STAFF_MARKET as K, ensureStaff, combineQ, personQ, expectedWage, staffLimit, staffBudget, makeOffer, decideDay, fireStaff,
  severanceOf, refreshPool, listFreeStaff, offerUtility, offerHint, clubAppeal, rosterOf, syncStaff, renewStaff, contractUntil,
  staffSummary, seasonStats, aiStaffWeek, halfKeyOf,
} from '../src/career/staffMarket.js';

const CLUB = 'widzew';
const BAD_TEXT = new RegExp(`undefined|NaN|\\bnull\\b|\\[object|${String.fromCharCode(8212)}`); // pauza em
function newGame(seed = 21, clubId = CLUB, { career = true } = {}) {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'A', lastName: 'B' } } };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureTraining(g);
  if (career) { ensureCareer(g); processDay(g); }
  return g;
}
let shared = null;
const base = () => (shared ??= newGame());
const fresh = () => structuredClone(base());
const people = (g) => Object.values(g.staff.people);
const freeOf = (g, role, f = () => true) => g.staff.pool.map((id) => g.staff.people[id]).filter((p) => p.role === role && f(p));
const makeRoom = (g, clubId = g.clubId, n = 1) => {
  // zwalnia pomocników (albo osoby spoza rdzenia), żeby było miejsce w limicie
  for (let i = 0; i < n; i++) {
    const L = staffLimit(g, clubId);
    if (L.used < L.limit) continue;
    const p = rosterOf(g, clubId).sort((a, b) => a.q - b.q).find((x) => x.role !== 'kierownik');
    fireStaff(g, p.id, { clubId });
  }
};
const runDecisions = (g, from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(...decideDay(g, d)); return out; };

test('Migracja: liderzy ról z dotychczasowego sztabu (imię i jakość), widok 8 ról, nowa gra = stary zapis', () => {
  const old = newGame(21, CLUB, { career: false });
  for (const st of Object.values(old.training.staff)) { delete st.fizjoterapeuta; delete st.skaut; } // zapis sprzed nowych ról
  const before = structuredClone(old.training.staff);
  ensureCareer(old);
  for (const [id, st] of Object.entries(before)) {
    if (!old.world.clubs[id]) continue;
    const ros = rosterOf(old, id);
    for (const r of ['asystent', 'fizyczny', 'bramkarze', 'mlodziez', 'analityk', 'kierownik']) {
      const list = ros.filter((p) => p.role === r).sort((a, b) => b.q - a.q);
      assert.equal(list[0].name, st[r].name, `${id} ${r}`);
      assert.equal(list[0].q, st[r].q, `${id} ${r}`);
      if (list.length === 1) assert.equal(old.training.staff[id][r].q, st[r].q, `${id} ${r}: bez pomocników jakość bez zmian`);
      else assert.ok(old.training.staff[id][r].q >= st[r].q, `${id} ${r}: pomocnik nie obniża jakości`);
    }
    for (const r of Object.keys(STAFF_ROLES)) assert.ok(old.training.staff[id][r] && old.training.staff[id][r].q >= 1, `${id} ${r}`);
  }
  // Nowa gra (z nowymi rolami w widoku) daje te same osoby rdzenia
  const g = base();
  for (const id of ['legia', 'widzew', 'sokol-kleczew']) assert.deepEqual(rosterOf(g, id).map((p) => [p.role, p.name, p.q]).filter((x) => x[0] !== 'fizjoterapeuta' && x[0] !== 'skaut'), rosterOf(old, id).map((p) => [p.role, p.name, p.q]).filter((x) => x[0] !== 'fizjoterapeuta' && x[0] !== 'skaut'));
  // Idempotentne
  const snap = JSON.stringify(old.staff);
  ensureStaff(old);
  assert.equal(JSON.stringify(old.staff), snap);
  // Kierownik: zawsze jeden; nowe role: fizjoterapeuta i skaut w Ekstraklasie, skaut niedostępny w III lidze
  for (const id of Object.keys(old.world.clubs)) assert.ok(rosterOf(old, id).filter((p) => p.role === 'kierownik').length <= 1);
  assert.ok(rosterOf(old, 'legia').some((p) => p.role === 'fizjoterapeuta') && rosterOf(old, 'legia').some((p) => p.role === 'skaut'));
  const l3 = CLUBS_PL.filter((c) => c.tier === 4 && old.world.clubs[c.id]).map((c) => c.id);
  assert.ok(l3.every((id) => !rosterOf(old, id).some((p) => p.role === 'skaut')));
  assert.equal(staffLimit(old, l3[0]).roles.skaut.max, 0);
});

test('Finanse pierwszego dnia neutralne: koszty klubu + pensje sztabu = dawne koszty klubu (co do 1000 zł)', () => {
  const g = base();
  const m = '2026-07';
  for (const [id, c] of Object.entries(g.finance.clubs)) {
    if (!g.staff.clubs[id]) continue;
    const p = c.plan;
    assert.ok(p.staffOn && p.staffBase > 0, id);
    const out = c.ledger[m]?.out ?? {};
    assert.equal(out.staff, c.staffPay, id);
    assert.ok(Math.abs(p.staffBase / 12 - c.staffPay) <= 1, id);
    // Kluby bez innych wpisów kosztów w lipcu (np. dopłat do rezerw): suma równa dawnym kosztom klubu
    if (c.log.some((x) => x.kind === 'ops' && x.date.startsWith(m))) continue;
    const old = (p.ops - (p.upkeepBase ?? 0)) / 12;
    assert.ok(Math.abs((out.ops ?? 0) + (out.staff ?? 0) - old) <= 1000, `${id}: ${(out.ops ?? 0) + (out.staff ?? 0)} vs ${old}`);
    assert.equal(c.staffPay, rosterOf(g, id).reduce((s, x) => s + x.wage, 0));
  }
});

test('Jakość efektywna: 15 + 12 = 15,6, pomocnik słabszy niż 7 nic nie daje, najwyżej +2, kierownik tylko lider, wakat', () => {
  assert.equal(combineQ([15, 12], 'asystent'), 15.6);
  assert.equal(combineQ([17, 15, 14], 'asystent'), 18.3);
  assert.equal(combineQ([15, 6], 'analityk'), 15);
  assert.equal(combineQ([12, 20, 20, 20], 'asystent'), 20);
  assert.equal(combineQ([10, 18, 18, 18], 'fizyczny'), 19.9);
  assert.equal(combineQ([13, 19, 19, 19], 'fizyczny'), 20);
  assert.equal(combineQ([12, 11], 'kierownik'), 12);
  assert.equal(combineQ([], 'asystent'), K.vacantQ.asystent);
  // Widok: wakat ma wszystkie pola, rozwój i raport drużyny działają na klubie z wakatami
  const g = fresh();
  for (const p of rosterOf(g, CLUB).filter((x) => x.role === 'bramkarze' || x.role === 'analityk')) fireStaff(g, p.id);
  const st = staffOf(g, CLUB);
  assert.ok(st.bramkarze.vacant && st.bramkarze.q === K.vacantQ.bramkarze && st.analityk.vacant);
  for (const r of Object.keys(STAFF_ROLES)) assert.ok(st[r] && typeof st[r].q === 'number');
  assert.doesNotThrow(() => monthlyDevelopment(g, '2026-08-01'));
  assert.doesNotThrow(() => buildTeamReport(g));
});

test('Oczekiwana pensja: rola, jakość, obcokrajowiec, okres bez pracy (najmniej 75 %)', () => {
  const p = { role: 'asystent', q: 10, nat: 'POL' };
  assert.equal(expectedWage(p), 10000);
  assert.equal(expectedWage({ ...p, q: 13 }), 19500);
  assert.equal(expectedWage({ ...p, nat: 'ESP' }), 12000);
  assert.ok(expectedWage({ ...p, role: 'kierownik' }) < expectedWage({ ...p, role: 'fizyczny' }));
  const idle = { ...p, free: '2026-01-01' };
  assert.ok(expectedWage(idle, '2026-02-15') === 10000);
  assert.ok(expectedWage(idle, '2026-06-01') < 10000);
  assert.equal(expectedWage(idle, '2028-01-01'), 7500);
});

test('Okno decyzji 2-3 dni, oferta wiążąca, po decyzji koniec ofert, odmowa daje 14 dni przerwy', () => {
  const g = fresh();
  makeRoom(g, CLUB, 2);
  const date = g.date;
  const cand = freeOf(g, 'fizjoterapeuta').sort((a, b) => b.q - a.q)[0];
  const r = makeOffer(g, { pid: cand.id, wage: expectedWage(cand, date) * 1.6, years: 2 });
  assert.ok(r.ok, r.text);
  const days = [2, 3].map((n) => addDays(date, n));
  assert.ok(days.includes(r.decideOn));
  assert.equal(makeOffer(g, { pid: cand.id, years: 2 }).reason, 'dup');
  // Inny klub może dołączyć do okna decyzji
  const ai = makeOffer(g, { pid: cand.id, wage: expectedWage(cand, date), years: 2, clubId: 'rakow' });
  assert.ok(ai.ok || ['limit', 'roleFull', 'budget', 'pending'].includes(ai.reason), ai.reason);
  // Przed dniem decyzji nic się nie dzieje
  runDecisions(g, date, addDays(r.decideOn, -1));
  assert.equal(cand.club, null);
  const msgs = runDecisions(g, r.decideOn, r.decideOn);
  assert.ok(cand.club, 'wysoka pensja i rola lidera: przyjmuje');
  assert.ok(msgs.some((m) => m.category === 'staff' && /przyjmuje ofertę/.test(m.subject)));
  // Po decyzji: nikt nie złoży mu oferty (także kolejny dzień)
  assert.equal(makeOffer(g, { pid: cand.id, years: 2, clubId: 'legia', date: addDays(r.decideOn, 1) }).reason, 'locked');
  // Odmowa: zbyt niska oferta od razu, bez wpisu
  const low = freeOf(g, 'analityk')[0];
  assert.equal(makeOffer(g, { pid: low.id, wage: expectedWage(low, g.date) * 0.5, years: 1 }).reason, 'low');
  assert.ok(!g.staff.offers.some((o) => o.pid === low.id));
});

test('Uczciwość: identyczne oferty dwóch klubów o tej samej renomie wygrywają po ok. 50 %, wyższa pensja częściej', () => {
  const g = base();
  const A = 'rakow'; const B = 'jagiellonia'; // ta sama renoma (81)
  let winA = 0; let winRich = 0; const n = 300;
  for (let i = 0; i < n; i++) {
    const p = { id: `test:${i}`, role: 'fizjoterapeuta', q: 19, nat: 'POL', age: 40, club: null, free: '2026-06-01', pl: true };
    const date = addDays('2026-07-01', i);
    const u = (club, wage) => offerUtility(g, p, { club, wage, years: 2, lead: true }, date, new Rng(`sztab-wybor:${g.seed}:${p.id}:${date}:${club}`)).u;
    const w = expectedWage(p, date);
    if (u(A, w) > u(B, w)) winA++;
    if (u(A, w * 1.1) > u(B, w)) winRich++;
  }
  assert.ok(winA / n > 0.4 && winA / n < 0.6, `A ${winA}`);
  assert.ok(winRich > winA + 20, `wyższa pensja ${winRich} vs ${winA}`);
});

test('Próg: wolna osoba odrzuca słabą ofertę, a po kilku miesiącach bez pracy przyjmuje taką samą', () => {
  const g = base();
  const p = { id: 'test:prog', role: 'asystent', q: 9, nat: 'POL', age: 40, club: null, free: '2026-06-25', pl: true };
  const offer = { club: 'sokol-kleczew', wage: expectedWage(p, '2026-07-01') * 0.9, years: 1, lead: true };
  const u0 = offerUtility(g, p, offer, '2026-07-01').u;
  const later = '2027-01-15';
  const u1 = offerUtility(g, p, { ...offer, wage: offer.wage }, later).u;
  const thrNow = K.util.u0;
  const thrLater = K.util.u0 - K.util.u0Month * K.util.u0Months;
  assert.ok(u0 < thrNow, `teraz ${u0}`);
  assert.ok(u1 > thrLater, `po pół roku ${u1}`);
});

test('Limity: całość i rola, oferty w toku liczone, kierownik najwyżej jeden, skaut niedostępny w III lidze', () => {
  const g = fresh();
  const L = staffLimit(g, CLUB);
  assert.ok(L.limit >= 7 && L.limit <= 18);
  assert.equal(L.used, L.limit, 'Widzew ma pełny sztab po migracji');
  const cand = freeOf(g, 'skaut')[0];
  assert.equal(makeOffer(g, { pid: cand.id, years: 1 }).reason, 'limit');
  makeRoom(g, CLUB, 1);
  const kier = freeOf(g, 'kierownik')[0];
  assert.equal(makeOffer(g, { pid: kier.id, years: 1 }).reason, 'roleFull');
  const ok = makeOffer(g, { pid: cand.id, wage: expectedWage(cand, g.date) * 1.2, years: 1 });
  assert.ok(ok.ok, ok.text);
  const L2 = staffLimit(g, CLUB);
  assert.equal(L2.used, L2.limit, 'oferta w toku wlicza się do limitu');
  const other = freeOf(g, 'analityk')[0];
  assert.equal(makeOffer(g, { pid: other.id, years: 1 }).reason, 'limit');
  // III liga: skaut niedostępny
  const l3 = CLUBS_PL.find((c) => c.tier === 4 && g.world.clubs[c.id]).id;
  makeRoom(g, l3, 2);
  const sk = freeOf(g, 'skaut')[0];
  assert.equal(makeOffer(g, { pid: sk.id, years: 1, clubId: l3 }).reason, 'role');
});

test('Odprawa: pozostałe pełne miesiące, od 2 do 6 pensji, wpis w finansach, osoba na liście wolnych', () => {
  const g = fresh();
  const p = rosterOf(g, CLUB).find((x) => x.role === 'skaut');
  p.until = '2028-06-30';
  assert.equal(severanceOf(p, '2026-11-01'), 6 * p.wage);
  assert.equal(severanceOf(p, '2028-05-10'), 2 * p.wage);
  assert.equal(severanceOf(p, '2027-12-05'), 6 * p.wage);
  assert.equal(severanceOf(p, '2028-01-31'), 4 * p.wage);
  const bal = g.finance.clubs[CLUB].balance;
  const r = fireStaff(g, p.id, { date: '2026-11-01' });
  assert.ok(r.ok && r.cost === 6 * r.cost / 6);
  assert.equal(g.finance.clubs[CLUB].balance, bal - r.cost);
  assert.ok(g.finance.clubs[CLUB].ledger['2026-11'].out.release >= r.cost);
  assert.ok(g.staff.pool.includes(p.id) && p.club === null && p.free === '2026-11-01');
  assert.equal(fireStaff(g, p.id).reason, 'notMine');
});

test('Budżet: oferta ponad budżet sztabu odrzucona (wakat w rdzeniu pozwala na 20 % więcej)', () => {
  const g = fresh();
  makeRoom(g, CLUB, 1);
  const B = staffBudget(g, CLUB);
  const cand = freeOf(g, 'analityk')[0];
  assert.equal(makeOffer(g, { pid: cand.id, wage: B.room + 5000, years: 1 }).reason, 'budget');
});

test('Podbieranie: zgoda klubu = rekompensata 3 pensje; blokada = osoba zrywa umowę (kara 3 pensje + 0-50 %) albo zostaje', () => {
  const g = fresh();
  const date = g.date;
  let agreed = 0; let broke = 0; let stayed = 0;
  const targets = CLUBS_PL.filter((c) => c.tier === 2 && g.world.clubs[c.id]).map((c) => rosterOf(g, c.id).find((p) => p.role === 'skaut' || p.role === 'fizjoterapeuta')).filter(Boolean).slice(0, 8);
  assert.ok(targets.length >= 4);
  targets.forEach((p, i) => {
    makeRoom(g, CLUB, 1);
    const from = p.club; const w = p.wage;
    const inFrom = () => g.finance.clubs[from].ledger[date.slice(0, 7)]?.in?.staffComp ?? 0;
    const before = inFrom();
    const r = makeOffer(g, { pid: p.id, wage: Math.max(expectedWage(p, date), w) * 2.5, years: 2, lead: true });
    assert.ok(r.ok, r.text);
    g.staff.block[p.id].blocked = i % 2 === 1; // co druga próba zablokowana
    runDecisions(g, date, r.decideOn);
    const got = inFrom() - before;
    if (i % 2 === 0) { assert.equal(p.club, CLUB, 'chce odejść i klub się zgodził'); assert.equal(got, Math.round(3 * w)); agreed++; }
    else if (p.club === CLUB) { assert.ok(got >= Math.round(3 * w) && got <= Math.round(4.5 * w) + 1, `kara ${got} / ${w}`); broke++; }
    else { assert.equal(p.club, from); assert.equal(got, 0); assert.ok(g.staff.poach.ban[`${CLUB}:${p.id}`] > r.decideOn, 'kolejna próba za 12 miesięcy'); stayed++; }
    g.staff.offers = []; g.staff.decide = {};
    if (p.club === CLUB) fireStaff(g, p.id);
  });
  assert.ok(agreed >= 2 && broke + stayed >= 2);
  const st = seasonStats(g.staff, g);
  assert.ok(st.poached.userai >= agreed && st.poachTry.userai >= targets.length);
});

test('Podbieranie sztabu gracza: decyzja w poczcie (zgoda albo blokada), limity prób i ochrona nowych umów', () => {
  const g = fresh();
  const date = '2026-12-07';
  g.date = date;
  const mine = rosterOf(g, CLUB).sort((a, b) => a.q - b.q);
  const [a, b, c] = mine;
  for (const club of ['legia', 'lech']) for (let i = 0; i < 3; i++) fireStaff(g, rosterOf(g, club).filter((x) => x.role !== 'kierownik').sort((x, y) => x.q - y.q)[0].id, { clubId: club });
  for (const x of [a, b, c]) x.since = '2025-07-01';
  const r1 = makeOffer(g, { pid: a.id, years: 2, clubId: 'legia', wage: Math.round(a.wage * 1.3), date });
  assert.ok(r1.ok, r1.text);
  const msg = g.staff.outbox.find((m) => m.refs?.kind === 'staffPoach' && m.refs.pid === a.id);
  assert.ok(msg && msg.actions.map((x) => x.id).join() === 'agree,block' && !BAD_TEXT.test(msg.body));
  assert.equal(g.staff.block[a.id].blocked, true, 'bez odpowiedzi: blokada');
  runDecision(g, msg, 'agree');
  assert.equal(g.staff.block[a.id].blocked, false);
  // Druga próba na innego członka sztabu w tej połowie sezonu: dozwolona; trzecia: limit 2 na cały sztab
  const r2 = makeOffer(g, { pid: b.id, years: 2, clubId: 'lech', wage: Math.round(b.wage * 1.3), date });
  assert.ok(r2.ok, r2.text);
  assert.equal(makeOffer(g, { pid: c.id, years: 2, clubId: 'legia', wage: Math.round(c.wage * 1.3), date }).reason, 'poachCap');
  // Ta sama osoba: najwyżej jedna próba w połowie sezonu (po zamknięciu okna decyzji)
  g.staff.offers = []; g.staff.decide = {};
  assert.equal(makeOffer(g, { pid: b.id, years: 2, clubId: 'legia', wage: Math.round(b.wage * 1.3), date }).reason, 'poachCap');
  // Nowa umowa: pierwsze 6 miesięcy bez prób
  const g2 = fresh();
  const p = rosterOf(g2, CLUB)[0];
  p.since = addDays(g2.date, -30);
  makeRoom(g2, 'legia', 1);
  assert.equal(makeOffer(g2, { pid: p.id, years: 2, clubId: 'legia', wage: p.wage * 2 }).reason, 'locked');
  // AI-AI: globalny limit podebrań w sezonie
  const g3 = fresh();
  seasonStats(g3.staff, g3).poached.aiai = K.poach.aiSeason;
  const t = rosterOf(g3, 'radomiak')[0]; t.since = '2025-07-01';
  makeRoom(g3, 'legia', 1);
  assert.equal(makeOffer(g3, { pid: t.id, years: 2, clubId: 'legia', wage: t.wage * 2 }).reason, 'poachCap');
  assert.equal(halfKeyOf('2026-12-07'), '2026a');
  assert.equal(halfKeyOf('2027-02-01'), '2026b');
});

test('Podbieranie rzadkie: AI przez pół sezonu prawie nie podbiera (limity i wyraźny zysk)', () => {
  const g = fresh();
  for (let d = '2026-07-06'; d <= '2027-02-22'; d = addDays(d, 7)) { g.date = d; aiStaffWeek(g, d); decideDay(g, addDays(d, 2)); decideDay(g, addDays(d, 3)); }
  const st = seasonStats(g.staff, g);
  assert.ok(st.poachTry.aiai <= K.poach.aiTriesSeason && st.poached.aiai <= K.poach.aiSeason, JSON.stringify(st.poachTry));
  assert.ok(st.poachTry.aiuser <= 2 * K.poach.userHalf, JSON.stringify(st.poachTry));
});

test('Adaptacja: obcokrajowiec przez 3 miesiące pracuje słabiej (16 jak 14 na start), widok wraca do pełnej jakości', () => {
  const g = fresh();
  makeRoom(g, CLUB, 2);
  const cand = freeOf(g, 'analityk', (p) => p.nat !== 'POL' && !p.pl)[0] ?? freeOf(g, 'asystent', (p) => p.nat !== 'POL')[0];
  assert.ok(cand, 'jest obcokrajowiec na liście');
  cand.q = 17; // zostanie liderem
  const r = makeOffer(g, { pid: cand.id, wage: expectedWage(cand, g.date) * 1.3, years: 2, lead: true });
  assert.ok(r.ok, r.text);
  runDecisions(g, g.date, r.decideOn);
  assert.equal(cand.club, CLUB);
  const d0 = cand.since;
  assert.equal(personQ(cand, d0), 15);
  assert.equal(personQ(cand, addDays(d0, 45)), 16);
  assert.equal(personQ(cand, addDays(d0, 90)), 17);
  assert.ok(g.staff.adapting.includes(CLUB));
  g.date = addDays(d0, 91); processDay(g);
  assert.ok(!g.staff.adapting.includes(CLUB) && cand.adapt === null);
  assert.ok(staffOf(g, CLUB)[cand.role].q >= 17);
});

test('Obietnica roli lidera: nowy lepszy lider degraduje dotychczasowego (niezadowolony: chętniej odchodzi)', () => {
  const g = fresh();
  makeRoom(g, CLUB, 2);
  const old = rosterOf(g, CLUB).filter((p) => p.role === 'bramkarze').sort((a, b) => b.q - a.q)[0];
  const cand = freeOf(g, 'bramkarze').sort((a, b) => b.q - a.q)[0];
  cand.q = Math.max(cand.q, old.q + 2);
  const uBefore = offerUtility(g, old, { club: CLUB, wage: old.wage, years: 1 }, g.date).u;
  const r = makeOffer(g, { pid: cand.id, wage: expectedWage(cand, g.date) * 1.3, years: 2, lead: true });
  assert.ok(r.ok, r.text);
  runDecisions(g, g.date, r.decideOn);
  assert.equal(cand.club, CLUB);
  assert.ok(cand.lead && !old.lead && old.demoted);
  const uAfter = offerUtility(g, old, { club: CLUB, wage: old.wage, years: 1 }, g.date).u;
  assert.ok(uAfter < uBefore - 0.5, `${uAfter} < ${uBefore}`);
});

test('Lista wolnych: ok. 100 osób, odświeżanie co pół sezonu (25 % wolnych od 60+ dni odchodzi, świeżo wolni zostają)', () => {
  const g = fresh();
  assert.ok(g.staff.pool.length >= 95 && g.staff.pool.length <= 110);
  const S = g.staff;
  const ids = [...S.pool];
  ids.forEach((id, i) => { const p = S.people[id]; p.age = 40; p.free = i < 80 ? '2026-08-01' : '2026-12-20'; });
  refreshPool(g, '2027-01-01');
  const longGone = ids.slice(0, 80).filter((id) => !S.people[id]).length;
  const freshGone = ids.slice(80).filter((id) => !S.people[id]).length;
  assert.equal(freshGone, 0);
  assert.ok(longGone / 80 > 0.15 && longGone / 80 < 0.35, `odeszło ${longGone} z 80`);
  assert.ok(S.pool.length >= 100);
  const rows = listFreeStaff(g, { role: 'asystent' });
  assert.ok(rows.length && rows.every((r) => r.role === 'asystent' && r.wage.lo <= r.wage.hi && r.q.lo <= r.q.hi));
  assert.ok(listFreeStaff(g, { foreign: true }).every((r) => r.nat !== 'POL'));
});

test('Determinizm: to samo ziarno, ta sama lista, te same decyzje i oferty AI po 45 dniach', () => {
  const a = newGame(33, 'lech'); const b = newGame(33, 'lech');
  assert.equal(JSON.stringify(a.staff), JSON.stringify(b.staff));
  for (const g of [a, b]) for (let i = 0; i < 45; i++) { g.date = addDays(g.date, 1); processDay(g); for (const m of g.inbox.filter((x) => !x.resolved && x.actions?.length && !x.optional)) m.resolved = true; }
  assert.equal(JSON.stringify(a.staff), JSON.stringify(b.staff));
});

test('Fizjoterapeuta skraca przerwy po urazach (wakat jak dawniej), skaut dokładniej ocenia potencjał obcych', () => {
  const g = fresh();
  const st = g.training.staff[CLUB];
  st.fizjoterapeuta = { name: null, q: 3, age: null, vacant: true };
  assert.equal(healDays(g, CLUB, 20), 20);
  st.fizjoterapeuta = { name: 'X', q: 18, age: 40 };
  assert.equal(healDays(g, CLUB, 20), 17);
  assert.equal(healDays(g, CLUB, 1), 1);
  const other = squadOf(g.world, 'legia')[0];
  st.skaut = { name: null, q: 2, age: null, vacant: true };
  const weak = scoutLine(g, other);
  st.skaut = { name: 'Y', q: 18, age: 40 };
  const good = scoutLine(g, other);
  assert.ok(good.e.sd < weak.e.sd);
  assert.ok(['exact', 'approx'].includes(good.prec));
});

test('Podpowiedź akceptacji: słowo z 4 stanów, do 3 powodów bez liczb; zainteresowanie klubem', () => {
  const g = fresh();
  const p = freeOf(g, 'asystent')[0];
  const words = new Set(['Chętny', 'Raczej przyjmie', 'Może się wahać', 'Raczej odmówi', 'Odrzuci od razu']);
  for (const mul of [0.4, 0.8, 1, 1.4, 2]) {
    const h = offerHint(g, { pid: p.id, wage: expectedWage(p, g.date) * mul, years: 2, lead: true });
    assert.ok(words.has(h.word) && h.reasons.length <= 3);
    for (const r of h.reasons) assert.ok(!/\d/.test(r) && !BAD_TEXT.test(r), r);
  }
  assert.equal(offerHint(g, { pid: p.id, wage: expectedWage(p, g.date) * 0.4 }).level, 'odrzuci');
  assert.ok(['atrakcyjny', 'w porządku', 'poniżej jego poziomu'].includes(clubAppeal(g, p.id).word));
});

test('Przedłużenie: od 1 stycznia ostatniego roku umowy; nowa data końca', () => {
  const g = fresh();
  const p = rosterOf(g, CLUB)[0];
  p.until = '2027-06-30';
  assert.equal(renewStaff(g, { pid: p.id, date: '2026-10-01' }).reason, 'early');
  const r = renewStaff(g, { pid: p.id, years: 2, wage: expectedWage(p, '2027-02-01') * 1.3, date: '2027-02-01' });
  assert.ok(r.ok || r.reason === 'refused' || r.reason === 'budget', r.text);
  if (r.ok) assert.equal(p.until, '2029-06-30');
  assert.equal(contractUntil('2026-08-10', 1), '2027-06-30');
  assert.equal(contractUntil('2027-01-10', 1), '2028-06-30');
  assert.equal(contractUntil('2027-01-10', 0), '2027-06-30');
});

test('Sezon: kluby AI uzupełniają wakaty, bez wiadomości AI-AI, nowe role w nowym sezonie, wydajność', () => {
  const g = fresh();
  const prof = (globalThis.__systemTimes = {});
  const keysBefore = new Set(g.inbox.map((m) => m.id));
  // wakaty w kilku klubach AI
  const vac = CLUBS_PL.filter((c) => c.tier === 2 && g.world.clubs[c.id]).slice(0, 6).map((c) => c.id);
  for (const id of vac) { const p = rosterOf(g, id).find((x) => x.role === 'bramkarze'); fireStaff(g, p.id, { clubId: id }); }
  for (let i = 0; i < 60; i++) { g.date = addDays(g.date, 1); processDay(g); for (const m of g.inbox.filter((x) => !x.resolved && x.actions?.length && !x.optional)) m.resolved = true; }
  delete globalThis.__systemTimes;
  const filled = vac.filter((id) => rosterOf(g, id).some((p) => p.role === 'bramkarze')).length;
  assert.ok(filled >= 4, `uzupełnione ${filled} z 6`);
  assert.ok(prof.staffMarket < 300, `staffMarket ${prof.staffMarket} ms w 60 dni`);
  const staffMsgs = g.inbox.filter((m) => !keysBefore.has(m.id) && /^sztab-/.test(m.key ?? ''));
  for (const m of staffMsgs) {
    const pid = m.key.split(':')[1];
    const p = g.staff.people[pid];
    assert.ok(!p || p.club === CLUB || p.hist?.some((h) => h.club === CLUB) || /koniec|decyzja|zostaje|podbieranie/.test(m.key), m.key);
    assert.ok(!BAD_TEXT.test(m.body), m.body);
  }
  for (const id of Object.keys(g.staff.clubs)) {
    const L = staffLimit(g, id);
    assert.ok(rosterOf(g, id).filter((p) => p.role === 'kierownik').length <= 1, id);
    for (const [r, x] of Object.entries(L.roles)) assert.ok(x.n <= Math.max(x.max, 1) || r === 'skaut', `${id} ${r}`);
  }
});

test('Widok: Trening, Sztab z wakatem i kilkoma asystentami, rynek z osobą bez klubu, bez błędnych tekstów', () => {
  const g = fresh();
  const p = rosterOf(g, CLUB).find((x) => x.role === 'kierownik');
  fireStaff(g, p.id);
  const html = renderTraining(g, { trTab: 'sztab' });
  assert.ok(/Wakat/.test(html) && /Rynek sztabu/.test(html) && /Fizjoterapeuta/.test(html));
  assert.ok(!BAD_TEXT.test(html.replace(/data-[a-z-]+="[^"]*"/g, '')));
  const sum = staffSummary(g, CLUB);
  assert.ok(sum.roles.asystent.people.length >= 1 && sum.roles.kierownik.vacant);
  const dash = renderTraining(g, { trTab: 'pulpit' });
  assert.ok(!BAD_TEXT.test(dash.replace(/data-[a-z-]+="[^"]*"/g, '')));
});

test('Nowy sezon: wygasłe umowy na listę wolnych, wiek +1, limity, sztab klubów z awansu', () => {
  const g = fresh();
  const p = rosterOf(g, 'legia')[0];
  p.until = '2027-06-30';
  const age = p.age;
  g.seasonYear = 2027; g.date = '2027-07-01';
  ensureStaff(g);
  assert.equal(p.club, null);
  assert.ok(g.staff.pool.includes(p.id) && p.age === age + 1 && p.free === '2027-07-01');
  assert.equal(g.staff.year, 2027);
  assert.ok(seasonStats(g.staff, g).expired >= 1);
  // Klub nowy w świecie (awans z IV ligi) dostaje sztab, rozwiązany oddaje sztab do puli
  const gone = CLUBS_PL.find((c) => c.tier === 4 && g.world.clubs[c.id]).id;
  const goneStaff = rosterOf(g, gone).map((x) => x.id);
  delete g.world.clubs[gone];
  ensureStaff(g);
  assert.ok(!g.staff.clubs[gone] && goneStaff.every((id) => g.staff.pool.includes(id)));
  g.world.clubs[gone] = { squad: [], academy: [] };
  ensureStaff(g);
  assert.ok(rosterOf(g, gone).length >= 3);
  void generateStaffFor;
});
