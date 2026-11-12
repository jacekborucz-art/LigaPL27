// Historia meczów drużyny gracza, statystyki zawodników w podziale na rozgrywki i historia klubowa
// (src/season/history.js, docs/historia-i-statystyki.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { Rng } from '../src/core/rng.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { completeTransfer, releasePlayer } from '../src/career/transfers.js';
import { applySeasonState } from '../src/season/rollover.js';
import {
  statGroup, statObj, sumStats, spellsOf, syncSpell, ensureHistory, recordTeamMatch, teamFixtures, historySeasons,
  venueOf, recordOf, archivePlayerSeason, matchRow,
} from '../src/season/history.js';
import { playerStatsHtml } from '../src/ui/playerStatsView.js';
import { fixturesPanelBody, renderFixtures } from '../src/ui/fixturesView.js';
import '../src/season/dailySystems.js';

function newGame(clubId, seed) {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  return g;
}

function playTo(g, until) {
  while (g.date < until) {
    for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && x.home && x.away && (x.home === g.clubId || x.away === g.clubId))) {
      const rng = new Rng(`gracz:${f.id}`); applyResult(g, f, playQuick(g, f, rng), rng);
    }
    for (const m of g.inbox.filter((x) => !x.resolved && x.actions?.length && !x.optional)) { m.resolved = true; runDecision(g, m, m.actions[0].id); }
    g.date = addDays(g.date, 1);
    processDay(g);
  }
}

/** Wynik meczu do applyResult: jeden zawodnik gospodarzy z golem i oceną. */
const resFor = (pid, { g = 1, a = 0, rating = 7.5, minutes = 90, score = [1, 0] } = {}) => ({
  score, scorers: [g ? [pid] : [], []], shootout: null, extraTime: false, stats: {},
  players: [[{ id: pid, minutes, g, a, yc: 0, rc: 0, rating }], []], strengthDiff: 0,
});

test('Grupy rozgrywek: liga z barażami, Puchar Polski z Superpucharem, UEFA, sparingi, kadra', () => {
  assert.equal(statGroup('ekstraklasa'), 'L');
  assert.equal(statGroup('liga2'), 'L');
  assert.equal(statGroup('playoff-liga1'), 'L');
  assert.equal(statGroup('pp'), 'P');
  assert.equal(statGroup('super'), 'P');
  assert.equal(statGroup('uefa'), 'E');
  assert.equal(statGroup('friendly'), 'T');
  assert.equal(statGroup('NT'), 'R');
});

test('Statystyki zawodnika osobno dla ligi, pucharów, Europy i sparingów; sparing nie wchodzi do p.season', () => {
  const g = newGame('widzew', 11);
  const opp = 'legia';
  const p = squadOf(g.world, 'widzew')[5];
  const mk = (id, comp, extra = {}) => ({ id, comp, round: 1, date: '2026-07-05', time: '18:00', home: 'widzew', away: opp, played: false, ...extra });
  const rng = new Rng('t');
  applyResult(g, mk('T1', 'friendly', { label: 'Sparing: X' }), resFor(p.id, { rating: 8 }), rng);
  applyResult(g, mk('L1', 'ekstraklasa'), resFor(p.id, { g: 2, a: 1, rating: 8.2 }), rng);
  applyResult(g, mk('L2', 'ekstraklasa'), resFor(p.id, { g: 0, rating: 6.4, minutes: 30 }), rng);
  applyResult(g, mk('S1', 'super', { knockout: 'penaltiesOnly' }), resFor(p.id, { g: 0, rating: 6.0 }), rng);
  applyResult(g, mk('E1', 'uefa', { ucomp: 'LK', label: 'Liga Konferencji, 1. runda eliminacji' }), resFor(p.id, { g: 1, rating: 7.0 }), rng);
  const L = statObj(p.st.L);
  assert.deepEqual([L.apps, L.min, L.g, L.a], [2, 120, 2, 1]);
  assert.equal(L.avg, 7.3);
  assert.equal(statObj(p.st.P).apps, 1, 'Superpuchar w grupie Puchar Polski');
  assert.equal(statObj(p.st.E).g, 1);
  assert.equal(statObj(p.st.T).apps, 1, 'sparing liczony osobno');
  assert.equal(p.season.apps, 4, 'mecze o punkty bez sparingu');
  // Historia klubowa: mecze o punkty bez sparingu
  const sp = spellsOf(p).at(-1);
  assert.equal(sp.c, 'widzew'); assert.equal(sp.m, 4); assert.equal(sp.g, 3);
  // Historia meczów drużyny gracza: każdy mecz raz, z miejscem i rozgrywkami
  const rows = g.history.m['2026/27'];
  assert.deepEqual(rows.map((r) => r.id), ['T1', 'L1', 'L2', 'S1', 'E1']);
  assert.equal(rows.find((r) => r.id === 'E1').u, 'LK');
  applyResult(g, g.fixtures.find((f) => f.id === 'L1') ?? mk('L1', 'ekstraklasa'), resFor(p.id), rng);
  assert.equal(g.history.m['2026/27'].filter((r) => r.id === 'L1').length, 1, 'bez duplikatów');
});

test('Miejsce meczu: u siebie, wyjazd, teren neutralny; wynik z perspektywy gracza, rzuty karne', () => {
  const g = { clubId: 'widzew', season: { seasonId: '2026/27' }, date: '2026-09-01', fixtures: [] };
  const f = (id, home, away, score, { result = {}, ...extra } = {}) => ({ id, comp: 'pp', round: 'R32', date: '2026-08-20', home, away, played: true, result: { score, ...result }, ...extra });
  recordTeamMatch(g, f('A', 'widzew', 'legia', [2, 1]));
  recordTeamMatch(g, f('B', 'lech', 'widzew', [0, 3]));
  recordTeamMatch(g, f('C', 'widzew', 'lech', [1, 1], { neutral: true, result: { shootout: [3, 4] } }));
  recordTeamMatch(g, f('D', 'lech', 'legia', [1, 0])); // nie mecz gracza
  const rows = teamFixtures(g, '2026/27');
  assert.deepEqual(rows.map((r) => r.venue), ['H', 'A', 'N']);
  assert.deepEqual(rows.map((r) => r.res), ['W', 'W', 'R']);
  assert.deepEqual([rows[1].gf, rows[1].ga], [3, 0]);
  assert.equal(rows[2].decider.kind, 'so');
  assert.equal(rows[2].decider.won, false);
  assert.equal(venueOf(matchRow({ id: 'x', home: 'a', away: 'widzew', neutral: true }, 'widzew')), 'N');
  const rec = recordOf(rows);
  assert.deepEqual([rec.n, rec.w, rec.d, rec.l, rec.gf, rec.ga], [3, 2, 1, 0, 6, 2]);
});

test('Historia klubowa: transfer, wypożyczenie i rozwiązanie kontraktu zamykają i otwierają okresy', () => {
  const g = newGame('widzew', 12);
  g.date = '2026-08-10';
  const [a, b] = squadOf(g.world, 'legia');
  completeTransfer(g, { playerId: a.id, to: 'widzew', fee: 100000, contract: { wage: 5000, until: '2029-06-30', clause: 0 } });
  assert.deepEqual(a.cl.map((s) => [s.c, s.f, s.t ?? null, !!s.l]), [['legia', null, '2026-08-10', false], ['widzew', '2026-08-10', null, false]]);
  completeTransfer(g, { playerId: b.id, to: 'widzew', kind: 'loan', loanShare: 100 });
  assert.equal(b.cl.at(-1).l, 1, 'wypożyczenie oznaczone');
  g.date = '2026-08-20';
  releasePlayer(g, a.id);
  assert.equal(a.cl.at(-1).t, '2026-08-20', 'po rozwiązaniu brak otwartego okresu');
  assert.equal(syncSpell(a, '2026-08-21'), null);
  // Stary zapis: okresy odtworzone z p.career
  const c = squadOf(g.world, 'lech')[3];
  delete c.cl;
  c.career = [{ date: '2026-07-20', from: 'pogon-szczecin', to: 'lech', fee: 0, kind: 'transfer' }];
  assert.deepEqual(spellsOf(c).map((s) => [s.c, s.f, s.t ?? null]), [['pogon-szczecin', null, '2026-07-20'], ['lech', '2026-07-20', null]]);
});

test('Koniec sezonu: historia meczów zostaje, statystyki do p.history z podziałem, wypożyczony wraca, kadra w grupie R', () => {
  const g = newGame('widzew', 31);
  playTo(g, '2026-08-25');
  const loaned = squadOf(g.world, 'widzew').find((p) => (p.st?.L?.[0] ?? 0) > 0);
  completeTransfer(g, { playerId: loaned.id, to: 'legia', kind: 'loan', loanShare: 100 });
  playTo(g, '2027-07-03');
  const played26 = g.history.m['2026/27'];
  // Pełny sezon w jednym klubie: co najmniej 34 mecze; po zmianie pracy zimą mniej (nowy klub ma swój terminarz)
  assert.ok(played26.length >= (g.manager.history.length === 1 ? 34 : 25), `mecze sezonu: ${played26.length}`);
  // Każdy mecz w historii to mecz klubu, który trener wtedy prowadził (także po zmianie pracy w trakcie sezonu)
  // Dzień zwolnienia włącznie: mecz tego dnia gra jeszcze stary klub (decyzja o nowej pracy przychodzi po meczu)
  const ledAt = (club, d) => (g.manager.history ?? []).some((h) => h.club === club && h.from <= d && (!h.to || d <= h.to));
  for (const r of played26) assert.ok(r.s && (r.h === r.me || r.a === r.me) && ledAt(r.me, r.d), `${r.id} ${r.me} ${r.d}`);
  if (g.manager.history.length === 1) assert.equal(played26.filter((r) => r.c === 'ekstraklasa' || r.c === 'liga1' || r.c === 'liga2').length, 34);
  assert.deepEqual(historySeasons(g).slice(0, 2), ['2027/28', '2026/27']);
  const cur = teamFixtures(g);
  assert.ok(cur.length && cur.every((r) => !r.played || r.d >= '2027-07-01'), 'bieżący sezon: nowy terminarz');
  // Wiersz historii zawodnika: sezon zakończony (nie nowy), klub z końca sezonu, podział na grupy
  const row = loaned.history.at(-1);
  assert.equal(row.s, '2026/27');
  assert.equal(row.c, 'legia', 'wiersz należy do klubu z wypożyczenia');
  assert.equal(row.l, 1);
  assert.ok(row.x.L[0] > 0);
  assert.equal(loaned.st, undefined, 'nowy sezon od zera');
  assert.equal(loaned.clubId, 'widzew', 'powrót z wypożyczenia');
  assert.deepEqual(loaned.cl.slice(-2).map((s) => [s.c, !!s.l, s.t ?? null]), [['legia', true, '2027-07-01'], ['widzew', false, null]]);
  // Reprezentacja: występy w grupie R zgadzają się z licznikiem występów w kadrze
  const nt = Object.values(g.world.players).filter((p) => p.intl?.caps);
  assert.ok(nt.length > 10, `reprezentanci: ${nt.length}`);
  for (const p of nt) {
    const apps = statObj(sumStats([...(p.history ?? []).map((h) => h.x?.R), p.st?.R].filter(Boolean))).apps;
    assert.equal(apps, p.intl.caps, p.name);
  }
  assert.ok(nt.some((p) => (p.history ?? []).some((h) => h.x?.R?.[5] > 0)), 'mecze kadr UEFA mają oceny');
  // Widoki renderują się dla danych po końcu sezonu
  assert.match(renderFixtures(g, { season: '2026/27' }), /Terminarz i wyniki/);
  assert.match(fixturesPanelBody(g), /Dziś/);
  assert.match(playerStatsHtml(loaned, g), /wypożyczenie/);
});

test('Stary zapis: brak magazynu historii i statystyk w grupach, widoki działają', () => {
  const g = newGame('widzew', 44);
  playTo(g, '2026-08-20');
  delete g.history;
  const p = squadOf(g.world, 'widzew').find((x) => x.season?.apps > 0);
  delete p.st; delete p.cl;
  p.history = [{ s: '2025/26', c: 'widzew', apps: 20, g: 3, a: 2, r: 6.8 }];
  ensureHistory(g);
  const mine = g.fixtures.filter((f) => f.played && (f.home === 'widzew' || f.away === 'widzew'));
  assert.equal(g.history.m['2026/27'].length, mine.length, 'bieżący sezon z terminarza');
  const html = playerStatsHtml(p, g);
  assert.match(html, /Bez podziału/);
  assert.match(html, /2025\/26/);
  assert.match(html, /wcześniej - obecnie/);
  archivePlayerSeason(p, '2026/27');
  assert.equal(p.history.at(-1).apps, p.season.apps);
  assert.equal(p.history.at(-1).x, undefined, 'bez podziału, gdy brak p.st');
});
