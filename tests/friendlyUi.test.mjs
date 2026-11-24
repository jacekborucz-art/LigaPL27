// Sparingi i seria rzutów karnych w grze (docs/sparingi-i-karne.md, rozdz. 6 i „Wdrożenie UI”): zasady sparingu
// przy planowaniu i zmianie, ekran treningu, ctx silnika z dnia meczowego (ławka 14, zasady, pauza przed serią,
// Superpuchar od razu na karne), okno kolejności strzelców i seria, druga jedenastka w przerwie. Bez DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { resolveMove } from '../src/ui/tacticsMoves.js';
import { createFinance } from '../src/career/finance.js';
import '../src/season/dailySystems.js';
import * as TR from '../src/training/index.js';
import { setFriendlyRules, friendlyRuleTags, friendlyRulesOf, normalizeFriendlyRules } from '../src/training/friendlies.js';
import { renderTraining, handleTrainingAction } from '../src/ui/trainingView.js';
import {
  startMatchday, kickOff, tick, skip, finishMatchday, knockoutCtx, matchTacticsFor, FRIENDLY_BENCH, syncFriendlyBench, shootoutSetup,
  previewShootoutOrder, confirmShootout, endShootout, secondEleven, applySecondEleven, liveRatings, keeperReminder,
} from '../src/match/matchday.js';
import { shootoutCandidates } from '../src/engine/match/match.js';

function newGame(clubId = 'widzew', seed = 2026) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.finance = createFinance(g.world);
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  processDay(g);
  return g;
}

/** Pierwszy sparing z remisem (rywale z listy na ten dzień, każdy to inne ziarno meczu): S w pauzie przed serią. */
function drawnFriendly(g, rules) {
  for (const d of TR.friendlyDates(g, { days: 40, limit: 40 })) {
    for (const o of TR.friendlyOpponents(g, d.date)) {
      const r = TR.createFriendly(g, d.date, o.id, rules);
      if (!r.ok) continue;
      const S = startMatchday(g, r.fixture);
      kickOff(g, S);
      let guard = 0;
      while (S.step === 'live1' && guard++ < 80) tick(S);
      skip(S);
      if (S.step === 'shootoutPrep') return { S, f: r.fixture };
      TR.cancelFriendly(g, r.fixture.id);
    }
  }
  throw new Error('brak sparingu z remisem');
}

test('Zasady sparingu: zapis przy planowaniu, walidacja, zmiana przed meczem', () => {
  const g = newGame();
  const d = TR.friendlyDates(g, { days: 60, limit: 60 })[2];
  const opps = TR.friendlyOpponents(g, d.date);
  // Błędne wartości: nic nie trafia do terminarza
  const n0 = g.fixtures.length;
  assert.equal(TR.createFriendly(g, d.date, opps[0].id, { decider: 'golden_goal' }).ok, false);
  assert.equal(TR.createFriendly(g, d.date, opps[0].id, { subs: 99 }).ok, false);
  assert.equal(TR.createFriendly(g, d.date, opps[0].id, { rotation: 'x' }).ok, false);
  assert.equal(g.fixtures.length, n0);
  // Domyślne i własne zasady
  const r = TR.createFriendly(g, d.date, opps[0].id, { decider: 'et_penalties', subs: 'rolling' });
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.fixture.friendlyRules, { decider: 'et_penalties', subs: 'rolling', rotation: 'auto', period: d.period.kind });
  assert.deepEqual(friendlyRuleTags(r.fixture), ['Zmiany powrotne', 'Remis: dogrywka']);
  // Zmiana części zasad: reszta zostaje, okres też
  const s = setFriendlyRules(g, r.fixture.id, { rotation: 'two_xi' });
  assert.ok(s.ok, s.error);
  assert.deepEqual(r.fixture.friendlyRules, { decider: 'et_penalties', subs: 'rolling', rotation: 'two_xi', period: d.period.kind });
  assert.equal(setFriendlyRules(g, r.fixture.id, { subs: 'all' }).ok, false);
  assert.equal(r.fixture.friendlyRules.subs, 'rolling', 'błąd niczego nie zmienia');
  assert.equal(setFriendlyRules(g, 'SP-nie-ma', { subs: 'standard' }).ok, false);
  // Rozegrany albo dzisiejszy: bez zmian
  r.fixture.played = true;
  assert.equal(setFriendlyRules(g, r.fixture.id, { subs: 'standard' }).ok, false);
  r.fixture.played = false;
  // Stary zapis bez zasad: wartości domyślne
  assert.deepEqual(friendlyRulesOf({ comp: 'friendly' }), { decider: 'none', subs: 'unlimited', rotation: 'auto', period: null });
  assert.deepEqual(normalizeFriendlyRules(undefined).rules, { decider: 'none', subs: 'unlimited', rotation: 'auto' });
});

test('Ekran treningu: przełączniki zasad, „Umów” z wybranymi zasadami, znaczniki i edycja zaplanowanego', () => {
  const g = newGame();
  const ui = { trTab: 'sparingi' };
  const d = TR.friendlyDates(g, { days: 60, limit: 60 })[1];
  Object.assign(ui, handleTrainingAction(g, 'tr-fr-date', { date: d.date }).ui);
  Object.assign(ui, handleTrainingAction(g, 'tr-fr-rule', { k: 'decider', v: 'penalties' }).ui);
  Object.assign(ui, handleTrainingAction(g, 'tr-fr-rule', { k: 'subs', v: 'rolling' }).ui);
  assert.deepEqual(handleTrainingAction(g, 'tr-fr-rule', { k: 'subs', v: 'hack' }).ui, {}, 'nieznana wartość');
  let html = renderTraining(g, ui);
  for (const t of ['Bez rozstrzygnięcia', 'Od razu karne', 'Dogrywka i karne', 'Standardowe 5', 'Bez limitu', 'Powrotne', 'Automatycznie', 'Dwie jedenastki', 'Zmiany stopniowe', 'Jak w meczu o punkty']) assert.ok(html.includes(t), t);
  assert.match(html, /data-act="tr-fr-add"[^>]*data-decider="penalties" data-subs="rolling" data-rotation="auto"/);
  const opp = TR.friendlyOpponents(g, d.date)[0];
  const add = handleTrainingAction(g, 'tr-fr-add', { date: d.date, opp: opp.id, decider: 'penalties', subs: 'rolling', rotation: 'auto' });
  assert.ok(add.save);
  const f = g.fixtures.find((x) => x.comp === 'friendly' && x.away === opp.id);
  assert.equal(f.friendlyRules.decider, 'penalties');
  Object.assign(ui, add.ui);
  html = renderTraining(g, ui);
  assert.ok(html.includes('Remis: karne') && html.includes('Zmiany powrotne'), 'znaczniki w terminarzu');
  // Edycja zaplanowanego sparingu
  Object.assign(ui, handleTrainingAction(g, 'tr-fr-edit', { id: f.id, open: 'false' }).ui);
  assert.equal(ui.trFrEdit, f.id);
  assert.ok(renderTraining(g, ui).includes('data-act="tr-fr-set"'));
  const set = handleTrainingAction(g, 'tr-fr-set', { id: f.id, k: 'decider', v: 'none' });
  assert.ok(set.save);
  assert.equal(f.friendlyRules.decider, 'none');
  Object.assign(ui, handleTrainingAction(g, 'tr-fr-edit', { id: f.id, open: 'true' }).ui);
  assert.equal(ui.trFrEdit, null);
});

test('Dzień meczowy sparingu: ławka 14 u obu drużyn, zasady i pauza przed serią w ctx silnika', () => {
  const g = newGame();
  const d = TR.friendlyDates(g, { days: 60, limit: 60 })[0];
  const opp = TR.friendlyOpponents(g, d.date)[0];
  const { fixture: f } = TR.createFriendly(g, d.date, opp.id, { decider: 'et_penalties', subs: 'rolling', rotation: 'staggered' });
  const leagueBench = g.tactics.bench.length;
  const S = startMatchday(g, f);
  const benchBefore = [...g.tactics.bench];
  assert.equal(S.benchSize, FRIENDLY_BENCH);
  const t = matchTacticsFor(g, S);
  assert.ok(g.tactics.bench.length > leagueBench && g.tactics.bench.length <= FRIENDLY_BENCH, 'dobrani rezerwowi są na ławce gracza');
  assert.deepEqual(t.bench, g.tactics.bench, 'ławka gracza zostaje w jego kolejności');
  const M = kickOff(g, S);
  assert.equal(M.ctx.shootoutPrep, true);
  assert.deepEqual([M.rules.friendly, M.rules.decider, M.rules.subs, M.rules.reentry, M.rules.rotation, M.rules.period], [true, 'et_penalties', 'rolling', true, 'staggered', d.period.kind]);
  assert.equal(M.teams[S.userSide].bench.length, t.bench.length);
  assert.equal(M.teams[1 - S.userSide].bench.length, FRIENDLY_BENCH);
  assert.deepEqual(g.tactics.bench, benchBefore, 'ustawienia gracza bez zmian po starcie meczu');
  // Oceny na żywo z silnika
  while (S.step === 'live1') tick(S);
  assert.ok(Object.keys(liveRatings(S)).length >= 22);
});

test('Ławka przed sparingiem: 14 miejsc do swobodnej rotacji, po sparingu powrót do limitu ligi', () => {
  const g = newGame();
  const d = TR.friendlyDates(g, { days: 60, limit: 60 })[0];
  const opp = TR.friendlyOpponents(g, d.date)[0];
  const { fixture: f } = TR.createFriendly(g, d.date, opp.id, {});
  const squad = squadOf(g.world, g.clubId);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const before = [...g.tactics.bench];
  assert.ok(before.length <= 12);
  assert.equal(syncFriendlyBench(g, f, 12), true);
  assert.ok(g.tactics.bench.length > before.length && g.tactics.bench.length <= FRIENDLY_BENCH);
  assert.equal(g.tactics.friendlyFor, f.id);
  assert.deepEqual(g.tactics.bench.slice(0, before.length), before, 'ławka gracza na początku');
  assert.deepEqual(g.tactics.friendlyExtra, g.tactics.bench.slice(before.length));
  assert.equal(syncFriendlyBench(g, f, 12), false, 'raz na mecz');
  // Zamiana dodatkowego rezerwowego z zawodnikiem z jedenastki
  const ex = g.tactics.friendlyExtra[0];
  const idx = g.tactics.bench.indexOf(ex);
  const r = resolveMove(g.tactics, { zone: 'bench', idx }, { zone: 'xi', idx: 5 }, { byId, benchSize: FRIENDLY_BENCH });
  if (r.ok) {
    g.tactics = r.tactics;
    assert.ok(g.tactics.xi.includes(ex));
    assert.ok(matchTacticsFor(g, { comp: 'friendly' }).xi.includes(ex));
  }
  // Usunięty z ławki nie wraca przy kolejnej synchronizacji tego samego sparingu
  const gone = g.tactics.friendlyExtra.find((id) => g.tactics.bench.includes(id));
  g.tactics = { ...g.tactics, bench: g.tactics.bench.filter((id) => id !== gone) };
  syncFriendlyBench(g, f, 12);
  assert.ok(!g.tactics.bench.includes(gone));
  assert.ok(matchTacticsFor(g, { comp: 'friendly' }).bench.length <= FRIENDLY_BENCH, 'mecz do 14');
  // Po sparingu: dodatkowi odpadają, zmiany gracza zostają
  const kept = g.tactics.bench.filter((id) => !g.tactics.friendlyExtra.includes(id));
  const lg = g.fixtures.find((x) => x.comp === 'ekstraklasa' && (x.home === g.clubId || x.away === g.clubId));
  assert.equal(syncFriendlyBench(g, lg, 12), true);
  assert.deepEqual(g.tactics.bench, kept.slice(0, 12));
  assert.ok(g.tactics.bench.length <= 12);
  assert.equal(g.tactics.friendlyExtra, undefined);
  assert.equal(g.tactics.friendlyFor, undefined);
  assert.equal(syncFriendlyBench(g, lg, 12), false);
  // Limit ligi mniejszy od ławki: nadmiar od końca
  g.tactics = { ...g.tactics, bench: [...g.tactics.bench, ...squad.map((p) => p.id).filter((id) => !g.tactics.xi.includes(id) && !g.tactics.bench.includes(id))].slice(0, 12) };
  syncFriendlyBench(g, lg, 9);
  assert.equal(g.tactics.bench.length, 9);
});

test('Rozstrzygnięcie remisu w ctx: Superpuchar od razu karne, puchar, dwumecz, liga', () => {
  assert.equal(knockoutCtx({ knockout: 'penaltiesOnly' }), 'penaltiesOnly');
  assert.equal(knockoutCtx({ knockout: 'single' }), 'single');
  const fl = [2, 1];
  const k = knockoutCtx({ knockout: { firstLeg: fl } });
  assert.deepEqual(k, { firstLeg: [2, 1] });
  assert.notEqual(k.firstLeg, fl, 'kopia');
  assert.equal(knockoutCtx({ knockout: null }), false);
  assert.equal(knockoutCtx({}), false);
  // Superpuchar w dniu meczowym: silnik zna „od razu karne” i pauzę przed serią
  const g = newGame();
  const lg = g.fixtures.find((x) => x.comp === 'ekstraklasa' && (x.home === g.clubId || x.away === g.clubId));
  const sup = { ...lg, id: 'SUPER-test', comp: 'super', round: 'F', knockout: 'penaltiesOnly' };
  const S = startMatchday(g, sup);
  const M = kickOff(g, S);
  assert.equal(M.rules.decider, 'penalties');
  assert.equal(M.rules.friendly, false);
  const L = startMatchday(g, lg);
  assert.equal(kickOff(g, L).rules.decider, 'none');
  assert.equal(keeperReminder(L), null);
});

test('Seria rzutów karnych w sparingu: okno kolejności, kolejność gracza w silniku, strzały, wynik w terminarzu', () => {
  const g = newGame('widzew', 77);
  const { S, f } = drawnFriendly(g, { decider: 'penalties', subs: 'unlimited' });
  const M = S.M;
  assert.equal(M.phase, 'shootoutPrep');
  const setup = shootoutSetup(S);
  assert.ok(setup.mine.available);
  assert.equal(setup.n, setup.mine.n);
  assert.ok(setup.keepers.some((x) => x.natural && x.id === setup.naturalKeeperId));
  // Propozycja asystenta (kolejność automatyczna) = podgląd z pełnej listy
  const all = setup.mine.players.map((x) => x.id);
  assert.deepEqual(previewShootoutOrder(all, setup.naturalKeeperId, setup.n).order, setup.mine.suggested);
  // Własna kolejność: odwrócona piątka, inny bramkarz serii (zawodnik z pola)
  const mine = [...all].reverse();
  const keeper = setup.keepers.find((x) => !x.natural).id;
  const pv = previewShootoutOrder(mine, keeper, setup.n);
  assert.ok(pv.order.includes(keeper), 'bramkarz serii zawsze strzela');
  const bad = confirmShootout(S, ['nie-ma'], null);
  assert.equal(bad.ok, false);
  assert.equal(S.step, 'shootoutPrep', 'błąd niczego nie zmienia');
  const r = confirmShootout(S, pv.order, keeper);
  assert.ok(r.ok, r.error);
  assert.equal(S.step, 'shootout');
  assert.deepEqual(M.shootout.order[S.userSide], pv.order, 'silnik strzela w kolejności z okna');
  assert.equal(M.shootout.keepers[S.userSide], keeper);
  const kicks = M.events.filter((e) => e.type === 'shootoutKick');
  assert.equal(kicks.length, r.kicks.length);
  assert.ok(kicks.length >= 6 && kicks.every((e) => e.text));
  assert.equal(shootoutCandidates(M, 0).available, false);
  endShootout(S);
  assert.equal(S.step, 'fulltime');
  finishMatchday(g, S);
  assert.ok(f.played && f.result.shootout, 'wynik serii w terminarzu');
  assert.deepEqual(f.result.shootout, M.shootout.goals);
  assert.ok(renderTraining(g, { trTab: 'sparingi' }).includes(`(k. ${M.shootout.goals[0]}:${M.shootout.goals[1]})`), 'wynik serii na liście sparingów');
});

test('Wyjście w pauzie przed serią: asystent ustala kolejność, mecz kończy się serią', () => {
  const g = newGame('widzew', 78);
  const { S, f } = drawnFriendly(g, { decider: 'penalties' });
  assert.equal(S.step, 'shootoutPrep');
  finishMatchday(g, S);
  assert.ok(S.M.ended && S.result.shootout && f.result.shootout);
});

test('Przerwa sparingu: druga jedenastka asystenta wg planu rotacji, zmiany powrotne na ławce', () => {
  const g = newGame('widzew', 79);
  const d = TR.friendlyDates(g, { days: 60, limit: 60 })[0];
  const opp = TR.friendlyOpponents(g, d.date)[0];
  const { fixture: f } = TR.createFriendly(g, d.date, opp.id, { subs: 'rolling', rotation: 'two_xi' });
  const S = startMatchday(g, f);
  kickOff(g, S);
  assert.deepEqual(secondEleven(S), [], 'poza przerwą nic');
  while (S.step === 'live1') tick(S);
  assert.equal(S.step, 'break');
  const list = secondEleven(S);
  assert.ok(list.length >= 8, `${list.length} zmian`);
  assert.ok(list.every((a) => a.type === 'sub' && a.outName && a.inName));
  const keep = list.slice(1); // gracz zostawia jednego zawodnika na boisku
  const T = S.M.teams[S.userSide];
  const r = applySecondEleven(S, keep);
  assert.equal(r.done + r.errors.length, keep.length);
  assert.ok(r.done >= keep.length - 1);
  assert.ok(T.players.some((x) => x.id === list[0].outId && x.on), 'odznaczony gra dalej');
  // Zmiany powrotne: zmienieni są na ławce i mogą wrócić
  const back = T.bench.filter((x) => x.rolledOff > 0);
  assert.equal(back.length, r.done);
  assert.ok(Object.keys(liveRatings(S)).some((id) => back.some((x) => x.id === id)), 'oceny także dla zmienionych na ławce');
});
