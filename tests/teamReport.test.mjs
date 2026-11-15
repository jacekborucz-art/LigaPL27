// Raport ogólny o drużynie (src/career/teamReport.js, docs/raport-druzyny.md): dokładność rośnie z jakością sztabu,
// raport jest deterministyczny, ma wszystkie części, raport miesięczny i na żądanie działają z odstępem, stary zapis
// i zawodnicy bez kontraktu nie psują raportu, widok nie ma pustych wartości ani pauz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { ensureTraining } from '../src/training/index.js';
import { Rng } from '../src/core/rng.js';
import { runDecision } from '../src/core/decisions.js';
import '../src/season/dailySystems.js';
import {
  TREP, STAFF_ATTRS, staffAttrs, buildTeamReport, ensureTeamReport, requestTeamReport, canRequest, reportMessage, TEAM_REPORT_SYSTEM, reportList,
} from '../src/career/teamReport.js';
import { renderTeamReport } from '../src/ui/teamReportView.js';

const CLUB = 'widzew';
const BAD_TEXT = /undefined|NaN|\bnull\b|\[object|\u2014/;
function newGame(seed = 21, clubId = CLUB) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId));
  ensureTraining(g);
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
const setAll = (g, q) => { for (const r of Object.keys(g.training.staff[g.clubId])) g.training.staff[g.clubId][r].q = q; };

let shared = null;
const played = () => { if (!shared) { shared = newGame(); playTo(shared, '2026-09-20'); } return shared; };

test('atrybuty asystenta i analityka: średnia równa jakości, deterministyczne, w skali 1-20', () => {
  const g = newGame();
  for (const role of Object.keys(STAFF_ATTRS)) {
    const q = g.training.staff[g.clubId][role].q;
    const a = staffAttrs(g, g.clubId, role);
    const v = Object.values(a);
    assert.equal(v.length, 2);
    for (const x of v) assert.ok(x >= 1 && x <= 20);
    if (q >= 4 && q <= 17) assert.equal(v[0] + v[1], 2 * q);
    assert.deepEqual(staffAttrs(g, g.clubId, role), a);
  }
  assert.deepEqual(staffAttrs(g, g.clubId, 'fizyczny'), {});
});

test('raport ma wszystkie części, podpisy i zalecenia; bez pustych wartości', () => {
  const g = played();
  const r = buildTeamReport(g, g.date, 'test');
  for (const k of ['units', 'results', 'tactics', 'setPieces', 'depth', 'health', 'youth', 'rivals']) {
    assert.ok(r[k], k);
    assert.ok(['exact', 'approx', 'vague'].includes(r[k].prec), k);
    assert.ok(r[k].by?.name, k);
  }
  assert.equal(r.units.rows.length, 4);
  assert.ok(r.depth.rows.length >= 6);
  assert.ok(r.recs.length >= 1 && r.recs.length <= TREP.maxRecs);
  assert.ok(r.results.played > 0);
  assert.ok(r.summary.length > 40);
  assert.equal(r.authors.length, 2);
  const html = renderTeamReport({ ...g, teamReport: { ...ensureTeamReport(g), cur: r } });
  assert.doesNotMatch(html, BAD_TEXT);
  assert.doesNotMatch(reportMessage(r).body, BAD_TEXT);
  assert.match(html, /Siła formacji na tle ligi/);
  assert.match(html, /Głębia składu/);
});

test('ten sam raport po odświeżeniu (deterministyczny), inny identyfikator losuje błąd od nowa', () => {
  const g = played();
  setAll(g, 6);
  const a = buildTeamReport(g, g.date, 'r1');
  const b = buildTeamReport(g, g.date, 'r1');
  assert.deepEqual(a, b);
  const c = buildTeamReport(g, g.date, 'r2');
  assert.notDeepEqual(a.units.rows.map((x) => x.est), c.units.rows.map((x) => x.est));
});

test('dokładność rośnie z jakością sztabu: błąd siły formacji i miejsca w lidze', () => {
  const g = played();
  const err = (q) => {
    setAll(g, q);
    let e = 0; let rk = 0; let n = 0;
    for (let i = 0; i < 25; i++) {
      const r = buildTeamReport(g, g.date, `dokl:${i}`);
      for (const x of r.units.rows) { e += Math.abs(x.est - x.truth); rk += Math.abs(x.rank - x.trueRank); n++; }
    }
    return { e: e / n, rk: rk / n, r: buildTeamReport(g, g.date, 'dokl:0') };
  };
  const lo = err(5); const hi = err(18);
  assert.ok(hi.e < lo.e * 0.5, `błąd ${hi.e} vs ${lo.e}`);
  assert.ok(hi.rk < lo.rk, `miejsce ${hi.rk} vs ${lo.rk}`);
  assert.equal(hi.r.confidence.prec, 'exact');
  assert.equal(lo.r.confidence.prec, 'vague');
  // Słaby sztab nie podaje liczb w sile formacji
  assert.ok(lo.r.units.rows.every((x) => !/\d+\. miejsce/.test(x.text)));
  setAll(g, 12);
});

test('raport miesięczny od 3. dnia, nie w dniu meczu, raz w miesiącu; żądanie z odstępem 14 dni', () => {
  const g = played();
  const msgs = g.inbox.filter((m) => m.key?.startsWith('trep:'));
  assert.ok(msgs.length >= 3, `raporty: ${msgs.length}`);
  const months = msgs.map((m) => m.date.slice(0, 7));
  assert.equal(new Set(months).size, months.length);
  for (const m of msgs) {
    assert.ok(Number(m.date.slice(8, 10)) >= TREP.firstDay);
    assert.ok(!g.fixtures.some((f) => f.date === m.date && (f.home === g.clubId || f.away === g.clubId)));
    assert.equal(m.refs?.kind, 'teamReport');
  }
  const st = ensureTeamReport(g);
  st.cur.date = addDays(g.date, -3);
  assert.equal(canRequest(g).ok, false);
  assert.equal(requestTeamReport(g).ok, false);
  st.cur.date = addDays(g.date, -TREP.cooldown);
  const r = requestTeamReport(g);
  assert.equal(r.ok, true);
  assert.equal(st.cur.kind, 'request');
  assert.ok(st.prev?.units?.GK != null);
  assert.equal(canRequest(g).ok, false);
});

test('stary zapis bez stanu raportu, zmiana klubu i zawodnik bez kontraktu', () => {
  const g = newGame(5);
  delete g.teamReport;
  const st = ensureTeamReport(g);
  assert.equal(st.cur, null);
  assert.match(renderTeamReport(g), /Poproś o nowy raport/);
  // Zawodnik bez kontraktu i bez danych sezonu w kadrze
  const p = squadOf(g.world, g.clubId)[3];
  delete p.contract; delete p.season; delete p.training;
  const r = requestTeamReport(g);
  assert.equal(r.ok, true);
  assert.doesNotMatch(renderTeamReport(g), BAD_TEXT);
  g.clubId = 'lech';
  assert.equal(ensureTeamReport(g).cur, null);
  // Klub bez stałej kadry (np. po zwolnieniu): system nic nie robi
  assert.deepEqual(TEAM_REPORT_SYSTEM.run({ ...g, clubId: 'brak' }, '2026-08-05'), {});
});

test('archiwum: 3 ostatnie raporty od najnowszego, porównanie i wybór starszego raportu', () => {
  const g = newGame(9);
  playTo(g, '2026-10-10'); // raporty z lipca, sierpnia, września i października
  const st = ensureTeamReport(g);
  assert.ok(g.inbox.filter((m) => m.key?.startsWith('trep:')).length >= 4);
  const list = reportList(g);
  assert.equal(list.length, TREP.keep);
  assert.equal(st.arch.length, TREP.keep - 1);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].date > list[i].date);
  const html = renderTeamReport(g);
  assert.match(html, /Porównanie raportów/);
  assert.match(html, /data-act="trep-sel"/);
  assert.doesNotMatch(html, BAD_TEXT);
  const old = renderTeamReport(g, { sel: 2 });
  assert.match(old, /Raport archiwalny/);
  assert.doesNotMatch(old, BAD_TEXT);
  // Zły indeks: najnowszy raport
  assert.doesNotMatch(renderTeamReport(g, { sel: 7 }), /Raport archiwalny/);
  // Stary zapis z jednym raportem bez archiwum
  delete st.arch;
  assert.equal(reportList(g).length, 1);
  assert.doesNotMatch(renderTeamReport(g), /Porównanie raportów/);
});
