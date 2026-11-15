import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baseFromOvr, targetReputationV2, willingnessToJoin, askingPriceMultiplier, reputationLabel, clubStage, stepReputation,
  generatedReputation, roleShare, clubReputation, REP,
} from '../src/career/reputation.js';
import {
  ensureReputation, reputationInput, playerStage, applyClubRep, reputationSeasonEnd, REPUTATION_SYSTEM,
} from '../src/career/reputationSystem.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { Rng } from '../src/core/rng.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { applySeasonState } from '../src/season/rollover.js';
import '../src/season/dailySystems.js';

const legia = { prestige: 10, tier: 1 };
const lech = { prestige: 10, tier: 1 };
const radomiak = { prestige: 5, tier: 1 };
const sokol = { prestige: 2, tier: 3 };
const lechia = { prestige: 8, tier: 2 };

const star = { rep: 70, age: 27, persona: 'Ambitny', wage: 60000 };
const ekRegular = { rep: 40, age: 26, persona: 'Spokojny', wage: 15000 };
const veteran = { rep: 58, age: 33, persona: 'Spokojny', wage: 30000 };

test('Reputacja rośnie z OVR i odpowiada poziomom lig', () => {
  assert.ok(baseFromOvr(8.5) < baseFromOvr(10));
  assert.ok(baseFromOvr(11.5) < baseFromOvr(14));
  assert.equal(Math.round(baseFromOvr(11.5)), 40);
  assert.equal(reputationLabel(72), 'Gwiazda w Europie');
});

test('Reprezentant ma wyższą reputację niż zawodnik o tym samym OVR bez kadry', () => {
  const base = { ovr: 13, age: 26, pos: 'ŚP', m: 0.8, S: clubStage(legia) };
  assert.ok(targetReputationV2({ ...base, caps: 30 }).t > targetReputationV2({ ...base, caps: 0 }).t + 5);
});

// ------------------------------------------------------------ Reputacja dynamiczna (docs/reputacja.md)
// Kluby testowe: średni klub EK (prestiż 6), Legia (P5 25 z prestiżu), 1 Liga, 2 Liga, III liga
const korona = { id: 't-korona', tier: 1, prestige: 6, coef: 4 };
const legiaS = clubStage({ id: 'legia', tier: 1, prestige: 10 });
const reg = (o) => ({ m: 0.8, n: 28, avg: 6.9, ga90: 0, pos: 'BR', min: 2400, caps: 0, age: 25, ...o });
const T = (c, S) => targetReputationV2({ ...c, S }).t;

test('Reputacja docelowa odpowiada tabeli z propozycji (tolerancja 2)', () => {
  const kor = clubStage(korona);
  const rows = [
    [reg({ ovr: 11.9 }), kor, 48], // podstawa średniego klubu EK
    [reg({ ovr: 9.7, m: 0.2, n: 6, min: 600 }), kor, 27], // ławka średniego klubu EK
    [reg({ ovr: 10, m: 0.15, n: 5, min: 450 }), legiaS, 29], // ławka Legii
    [reg({ ovr: 12.6 }), legiaS, 53], // podstawa Legii
    [reg({ ovr: 10.3 }), clubStage({ id: 't-1l', tier: 2, prestige: 5.4 }), 32],
    [reg({ ovr: 8.6 }), clubStage({ id: 't-2l', tier: 3, prestige: 3.6 }), 22],
    [reg({ ovr: 7.6 }), clubStage({ id: 't-3l', tier: 4, prestige: 2.9 }), 15],
    [reg({ ovr: 7, m: 0, n: 0, avg: null, min: 0, age: 17 }), legiaS, 9], // junior Legii bez minut
    [reg({ ovr: 16.5, caps: 20, recentCaps: 8, avg: 7.3, ntL: 14 }), kor, 65], // reprezentant w średnim klubie EK
  ];
  for (const [c, S, want] of rows) assert.ok(Math.abs(T(c, S) - want) <= 2, `${c.ovr}: ${T(c, S).toFixed(1)} zamiast ${want}`);
});

test('Scena: Polak potrzebuje klubu na poziomie Ligi Mistrzów, żeby mieć 85+', () => {
  const star = reg({ ovr: 16.5, caps: 40, recentCaps: 8, avg: 7.3, euroApps: 12, troph: 6, ntL: 14 });
  assert.ok(T(star, clubStage(korona)) < 70, 'średni klub EK');
  const lech = clubById('lech');
  assert.ok(T(star, clubStage(lech)) < 75, 'Lech na start (P5 31)');
  const dynasty = { countryCoef: { POL: 55 }, repState: { clubPts: { lech: [26, 26, 26, 26, 26] } } }; // P5 130
  assert.ok(T(star, clubStage(lech, dynasty)) > 85, 'Lech po latach w LM');
  // Ten sam zawodnik w zagranicznym klubie z czołówki (L 16,6, współczynnik 147,5)
  assert.ok(T(star, clubStage({ id: 'bayern', foreign: true, L: 16.6, prestige: 10 })) > 95);
});

test('Tempo: wzrost 10 % luki na miesiąc, spadek 6 % (sława się klei)', () => {
  assert.equal(REP.rise, 0.1); assert.equal(REP.fall, 0.06);
  assert.equal(stepReputation(50, 60), 51);
  assert.equal(stepReputation(50, 40), 49.4);
  assert.ok(stepReputation(50, 50, 2, 70) > stepReputation(50, 50, 2, 10), 'zdarzenie waży więcej na większej scenie');
  assert.ok(stepReputation(99, 120) <= 99 && stepReputation(1, -5) >= 1);
});

test('Rezerwowy traci reputację: mniej minut, niższy cel', () => {
  const kor = clubStage(korona);
  assert.ok(T(reg({ ovr: 11, m: 0.1, n: 3, min: 300 }), kor) < T(reg({ ovr: 11 }), kor) - 8);
  assert.ok(roleShare(0) > roleShare(12) && roleShare(12) > roleShare(20));
});

test('Generator: reputacja z tego samego wzoru, światy z tym samym ziarnem identyczne', () => {
  const a = generateWorld(77); const b = generateWorld(77);
  for (const id of Object.keys(a.players).slice(0, 400)) assert.equal(a.players[id].rep, b.players[id].rep);
  const L = a.clubs.legia;
  const top = L.squad.map((id) => a.players[id]).sort((x, y) => y.ovr - x.ovr);
  assert.ok(Math.abs(top[0].rep - generatedReputation(top[0], clubStage(clubById('legia')), { m: 0.8 })) <= 7);
  // Akademia wyraźnie poniżej podstawy klubu
  const acad = L.academy.map((id) => a.players[id]);
  const mean = (xs) => xs.reduce((s, x) => s + x.rep, 0) / xs.length;
  assert.ok(mean(acad) < mean(top.slice(0, 11)) - 15);
});

/** Gra testowa: świat, sezon, systemy dnia; mecze klubu gracza szybką symulacją do daty. */
function newGame(seed, clubId = 'widzew') {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 }); ensureCareer(g); processDay(g);
  return g;
}
function playUntil(g, until) {
  while (g.date < until) {
    for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === g.clubId || x.away === g.clubId))) { const rng = new Rng(`t${f.id}`); applyResult(g, f, playQuick(g, f, rng), rng); }
    for (const m of g.inbox.filter((x) => !x.resolved && x.actions?.length && !x.optional)) { m.resolved = true; runDecision(g, m, m.actions[0].id); }
    g.date = addDays(g.date, 1); processDay(g);
  }
}

test('Równowaga: pierwsza aktualizacja (1 sierpnia) bez skoku, deterministycznie, ten sam wzór dla gracza i AI', () => {
  const g = newGame(11);
  const before = Object.fromEntries(Object.values(g.world.players).map((p) => [p.id, p.rep]));
  assert.equal(g.repState.lastMonth, '2026-07');
  playUntil(g, '2026-07-31');
  const copy = structuredClone(g);
  playUntil(g, '2026-08-01');
  const d = Object.values(g.world.players).filter((p) => before[p.id] != null).map((p) => Math.abs(p.rep - before[p.id])).sort((a, b) => a - b);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  assert.ok(mean < 1.5, `średnia zmiana ${mean}`);
  assert.ok(d[Math.floor(d.length * 0.95)] < 4, `p95 ${d[Math.floor(d.length * 0.95)]}`);
  // Determinizm: ten sam dzień na kopii stanu daje te same liczby
  playUntil(copy, '2026-08-01');
  for (const id of Object.keys(copy.world.players).slice(0, 500)) assert.equal(copy.world.players[id].rep, g.world.players[id].rep, id);
  // Gracz i AI: wejście do wzoru nie zależy od tego, który klub prowadzi gracz
  const p = squadOf(g.world, 'legia')[0];
  const ctx = { k: 1, games: {}, prevGames: {}, priors: {}, S: playerStage(g, p) };
  assert.deepEqual(reputationInput(g, p, ctx), reputationInput({ ...g, clubId: 'legia' }, p, ctx));
});

test('Stary zapis: ensureReputation nie zmienia p.rep, pierwsza aktualizacja w kolejnym miesiącu', () => {
  const g = newGame(12);
  delete g.repState;
  for (const p of Object.values(g.world.players)) { p.rep = 33; delete p.repD; delete p.repY; }
  g.date = '2026-10-14';
  ensureReputation(g);
  assert.equal(g.repState.lastMonth, '2026-10');
  assert.equal(g.repState.clubPts.lech?.length, 5, 'renoma europejska z danych');
  assert.deepEqual(REPUTATION_SYSTEM.run(g, '2026-10-20'), {});
  assert.ok(Object.values(g.world.players).every((p) => p.rep === 33));
  REPUTATION_SYSTEM.run(g, '2026-11-01');
  const best = squadOf(g.world, 'legia').sort((a, b) => b.ovr - a.ovr)[0];
  assert.ok(best.rep > 33 && best.rep < 33 + 0.1 * 40, `łagodnie w górę: ${best.rep}`);
});

test('Koniec sezonu: mistrz zyskuje markę krajową, zawodnicy trofea; marka działa po wczytaniu (club.rep)', () => {
  const g = newGame(13);
  ensureReputation(g);
  const champ = 'radomiak';
  for (const p of squadOf(g.world, champ).slice(0, 15)) p.st = { L: [30, 2500, 3, 2, 2070, 30, 2, 0] };
  const t1 = CLUBS_PL.filter((c) => c.tier === 1).map((c) => c.id);
  const table = [champ, ...t1.filter((id) => id !== champ)];
  reputationSeasonEnd(g, { tables: { 1: table, 2: [], 3: [] }, groupTables: {}, cup: { winner: null }, uefa: {} }, { relegated: {} });
  assert.ok(g.repState.brand[champ] > 2, `marka ${g.repState.brand[champ]}`);
  const p = squadOf(g.world, champ)[0];
  assert.deepEqual(p.tro, [[2026, 3]]);
  assert.ok(p.repEv >= 2, 'zdarzenie: mistrzostwo');
  const base = clubReputation(clubById(champ));
  applyClubRep(g);
  assert.ok(clubReputation(clubById(champ)) > base);
  applySeasonState({}); // nowa gra: marka z danych
  assert.equal(clubReputation(clubById(champ)), base);
});

test('Gwiazda odmawia klubowi z 2 Ligi nawet za duże pieniądze', () => {
  const r = willingnessToJoin({ player: star, from: legia, to: sokol, offerWage: 300000, fromTier: 1, toTier: 3 });
  assert.equal(r.verdict, 'odmowa');
});

test('Gwiazda niechętnie idzie do słabszego klubu Ekstraklasy, a dopłata tylko częściowo pomaga', () => {
  const base = { player: star, from: legia, to: radomiak, fromTier: 1, toTier: 1, fromEurope: true, toEurope: false };
  const low = willingnessToJoin({ ...base, offerWage: 60000 });
  const high = willingnessToJoin({ ...base, offerWage: 200000 });
  assert.ok(['odmowa', 'niechętny'].includes(low.verdict), low.verdict);
  assert.ok(high.score > low.score);
  assert.ok(high.score < 0.7, `za łatwo: ${high.score}`);
  assert.ok(low.wageDemand > star.wage * 1.3);
});

test('Średniak z Ekstraklasy chętnie przechodzi do większego klubu z pucharami', () => {
  const r = willingnessToJoin({
    player: ekRegular, from: radomiak, to: lech, offerWage: 20000, fromTier: 1, toTier: 1, toEurope: true, starter: true,
  });
  assert.equal(r.verdict, 'chętny');
});

test('Weteran jest bardziej elastyczny niż gwiazda w szczycie kariery', () => {
  const ctx = { from: legia, to: lechia, fromTier: 1, toTier: 2 };
  const vet = willingnessToJoin({ ...ctx, player: veteran, offerWage: veteran.wage * 1.6 });
  const young = willingnessToJoin({ ...ctx, player: { ...veteran, age: 26 }, offerWage: veteran.wage * 1.6 });
  assert.ok(vet.score > young.score);
  assert.notEqual(young.verdict, 'chętny'); // reprezentant w sile wieku nie schodzi chętnie do 1 Ligi
});

test('Niezadowolenie i końcówka kontraktu zwiększają szansę zgody', () => {
  const ctx = { player: ekRegular, from: lech, to: radomiak, offerWage: 18000, fromTier: 1, toTier: 1 };
  const plain = willingnessToJoin(ctx);
  const unhappy = willingnessToJoin({ ...ctx, player: { ...ekRegular, unhappy: true, monthsLeft: 4 } });
  assert.ok(unhappy.score > plain.score + 0.15);
});

test('Znanego zawodnika trudniej wykupić: klub żąda więcej', () => {
  assert.equal(askingPriceMultiplier(30), 1);
  assert.ok(askingPriceMultiplier(70) > 1.4);
});
