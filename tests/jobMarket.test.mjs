// Rynek pracy trenera (docs/kariera-trenera.md rozdz. 6): stan bez pracy (brak meczów gracza, ostatni klub prowadzi AI),
// wakaty, aplikacje (limity, karencja, determinizm), oferty gwarantowane po 60 i 120 dniach, rezygnacja, masowe aplikowanie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick } from '../src/season/season.js';
import { Rng } from '../src/core/rng.js';
import { processDay, addDays, clubMatchOn, primaryAction, isUnemployed } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { fireCoach } from '../src/career/coachMarket.js';
import { clubById } from '../src/data/clubs_pl.js';
import { clubReputation } from '../src/career/reputation.js';
import { jobState, applyJob, withdrawApplication, resign, canResign, enterUnemployment, jobMarketDay, jobChances, JOB } from '../src/career/jobMarket.js';
import { careerSummary } from '../src/career/coachCareer.js';
import { applySeasonState } from '../src/season/rollover.js';
import '../src/season/dailySystems.js';

function newGame(clubId, seed, date = '2026-07-02') {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  while (g.date < date) {
    g.date = addDays(g.date, 1);
    processDay(g);
    for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === clubId || x.away === clubId))) {
      if (!f.home || !f.away) { f.played = true; f.result = { score: [1, 0] }; continue; }
      const rng = new Rng(`gracz:${f.id}`); applyResult(g, f, playQuick(g, f, rng), rng);
    }
  }
  return g;
}
const days = (g, n) => { for (let i = 0; i < n; i++) { g.date = addDays(g.date, 1); processDay(g); } };

test('Bez pracy: brak meczów gracza, ostatni klub prowadzi AI (mecze, trener), game.clubId zostaje', () => {
  const g = newGame('korona', 21, '2026-09-10');
  const msgs = enterUnemployment(g, g.date, 'zwolnienie');
  assert.ok(msgs.some((m) => /rozwiązuje umowę/.test(m.subject)));
  assert.ok(isUnemployed(g));
  assert.equal(g.clubId, 'korona');
  assert.ok(g.coaches.korona?.caretaker, 'trener tymczasowy w ostatnim klubie');
  assert.equal(careerSummary(g).unemployed, true);
  assert.equal(careerSummary(g).club, null);
  const from = g.date;
  for (let i = 0; i < 40; i++) {
    assert.equal(clubMatchOn(g, g.date), null);
    assert.notEqual(primaryAction(g).kind, 'play');
    g.date = addDays(g.date, 1); processDay(g);
    assert.equal(g.clubId, 'korona', 'po dniu ostatni klub wraca do zapisu');
  }
  const mine = g.fixtures.filter((f) => (f.home === 'korona' || f.away === 'korona') && f.date >= from && f.date < g.date && f.home && f.away);
  assert.ok(mine.length >= 4 && mine.every((f) => f.played), 'mecze ostatniego klubu rozgrywa AI');
  assert.ok(g.coaches.korona && !g.coaches.korona.caretaker, 'klub zatrudnił trenera');
  assert.ok(!g.inbox.some((m) => m.refs?.kind === 'incomingOffer' && !m.resolved && m.date > from), 'bez decyzji o zawodnikach dawnego klubu');
  const js = jobState(g);
  assert.equal(js.status, 'unemployed');
  assert.equal(js.days, 40);
  assert.equal(js.lastClub.id, 'korona');
});

test('Aplikacje: najwyżej 3 aktywne, nowa co 3 dni, karencja 90 dni po odmowie, wycofanie, determinizm', () => {
  const g = newGame('korona', 22, '2026-09-20');
  enterUnemployment(g, g.date, 'zwolnienie');
  const rep = g.manager.rep;
  // Wakaty: kluby w zasięgu (zwolnieni trenerzy AI) i jeden daleko poza zasięgiem
  const near = Object.keys(g.world.clubs).filter((id) => clubById(id) && !clubById(id).parent && clubById(id).tier >= 2 && clubById(id).tier <= 3 && clubReputation(clubById(id)) <= rep / 0.6 && id !== 'korona').slice(0, 4);
  for (const id of [...near, 'legia']) { fireCoach(g, id, g.date, { why: 'wyniki' }); g.coaches[id].until = addDays(g.date, 20); }
  assert.ok(jobState(g).vacancies.length >= 5);
  assert.equal(jobChances(g, 'legia').label, 'niska');
  assert.ok(applyJob(g, 'legia').ok);
  assert.equal(applyJob(g, near[0]).ok, false, 'odstęp 3 dni');
  assert.ok(jobState(g).canApplyFrom);
  g.date = addDays(g.date, JOB.gapDays);
  assert.ok(applyJob(g, near[0]).ok);
  g.date = addDays(g.date, JOB.gapDays);
  assert.ok(applyJob(g, near[1]).ok);
  g.date = addDays(g.date, JOB.gapDays);
  assert.equal(applyJob(g, near[2]).ok, false, 'najwyżej 3 aktywne');
  assert.ok(withdrawApplication(g, near[1]).ok);
  assert.ok(applyJob(g, near[2]).ok);
  // Legia: poza zasięgiem, odmowa bez rozmowy i karencja
  const clone = structuredClone(g);
  const out1 = []; const out2 = [];
  for (let i = 0; i < 25; i++) {
    g.date = addDays(g.date, 1); clone.date = g.date;
    out1.push(...jobMarketDay(g, g.date).map((m) => m.subject));
    out2.push(...jobMarketDay(clone, clone.date).map((m) => m.subject));
  }
  assert.deepEqual(out1, out2, 'ten sam przebieg aplikacji dla tej samej gry');
  assert.deepEqual(g.manager.job.apps.map((a) => a.state), clone.manager.job.apps.map((a) => a.state));
  const leg = g.manager.job.apps.find((a) => a.clubId === 'legia');
  assert.equal(leg.state, 'odmowa');
  assert.ok(g.manager.job.refused.legia > g.date);
  assert.equal(applyJob(g, 'legia').ok, false, 'karencja 90 dni');
  assert.ok(g.manager.job.apps.every((a) => ['odmowa', 'oferta', 'rozmowa', 'czeka'].includes(a.state)));
});

test('Masowe aplikowanie: 6 aplikacji w 30 dni obniża popularność w mediach', () => {
  const g = newGame('korona', 23, '2026-09-05');
  enterUnemployment(g, g.date, 'rezygnacja', { inSeason: true });
  const ids = Object.keys(g.world.clubs).filter((id) => clubById(id) && !clubById(id).parent && id !== 'korona').slice(0, 6);
  for (const id of ids) { fireCoach(g, id, g.date, { why: 'wyniki' }); g.coaches[id].until = addDays(g.date, 40); }
  const m0 = g.manager.career.pop.media;
  for (const id of ids) {
    const r = applyJob(g, id);
    assert.ok(r.ok, r.text);
    g.manager.job.apps.forEach((a) => { if (a.clubId !== id) a.state = 'odmowa'; }); // limit aktywnych nie blokuje testu
    g.date = addDays(g.date, JOB.gapDays);
  }
  assert.ok(m0 - g.manager.career.pop.media >= 1.9, `media ${m0} -> ${g.manager.career.pop.media}`);
});

test('Oferty gwarantowane: po 60 dniach dwa kluby w zasięgu, po 120 dniach klub III ligi; przyjęcie zmienia klub', () => {
  const g = newGame('korona', 24, '2026-09-01');
  enterUnemployment(g, g.date, 'zwolnienie');
  const J = g.manager.job;
  J.since = addDays(g.date, -JOB.fallback1);
  const a = jobMarketDay(g, g.date).find((m) => m.refs?.kind === 'jobOffer');
  assert.ok(a && a.refs.source === 'gwarantowana' && a.refs.jobClubs.length >= 1);
  assert.equal(jobMarketDay(g, g.date).filter((m) => m.refs?.kind === 'jobOffer').length, 0, 'raz na okres bez pracy');
  J.since = addDays(g.date, -JOB.fallback2);
  const b = jobMarketDay(g, g.date).find((m) => m.refs?.kind === 'jobOffer');
  assert.ok(b && clubById(b.refs.jobClubs[0]).tier === 4, 'po 120 dniach III liga');
  g.inbox.push(b);
  const target = b.refs.jobClubs[0];
  runDecision(g, b, target);
  assert.equal(g.clubId, target);
  assert.equal(isUnemployed(g), false);
  assert.equal(g.coaches[target], undefined, 'gracz jest trenerem nowego klubu');
  assert.ok(g.coaches.korona, 'stary klub ma trenera AI');
  const s = careerSummary(g);
  assert.equal(s.club.id, target);
  assert.equal(s.stints.at(-1).clubId, target);
  assert.ok(s.stints.some((x) => x.clubId === 'korona' && x.to && x.why === 'zwolnienie'));
});

test('Rezygnacja: po 6 miesiącach albo po sezonie; w trakcie sezonu kosztuje reputację', () => {
  const g = newGame('korona', 25, '2026-09-01');
  assert.equal(canResign(g).ok, false);
  assert.equal(resign(g).ok, false);
  g.manager.career.stints.at(-1).from = '2026-01-01';
  assert.equal(canResign(g).ok, true);
  const r0 = g.manager.rep;
  const r = resign(g);
  assert.ok(r.ok, r.text);
  assert.ok(isUnemployed(g));
  assert.ok(g.manager.rep < r0);
  assert.ok(careerSummary(g).scars.some((x) => /Rezygnacja/.test(x.text)));
  assert.ok(g.inbox.some((m) => /Odchodzisz/.test(m.subject)));
  assert.equal(applyJob(g, 'korona').ok, false, 'do ostatniego klubu nie wracasz od razu');
});

test('Sezon bez pracy: koniec sezonu i nowy terminarz bez klubu gracza, oferty gwarantowane, zanik reputacji', () => {
  const g = newGame('stal-mielec', 26, '2026-07-03');
  enterUnemployment(g, g.date, 'zwolnienie');
  const rep0 = g.manager.rep;
  days(g, 366);
  assert.ok(g.date >= '2027-07-01');
  assert.equal(g.archive.at(-1).user, null, 'archiwum sezonu bez drużyny gracza');
  assert.equal(g.clubId, 'stal-mielec');
  assert.ok(g.coaches['stal-mielec'] && !g.fixtures.some((f) => f.date < g.date && !f.played && f.home && f.away && (f.home === 'stal-mielec' || f.away === 'stal-mielec')));
  assert.ok(g.inbox.some((m) => m.refs?.kind === 'jobOffer' && m.refs.source === 'gwarantowana'));
  assert.ok(g.manager.rep < rep0, 'długie bezrobocie obniża reputację');
  assert.ok(g.manager.rep >= 0.6 * g.manager.career.rep.peak - 1e-9, 'nie niżej niż 0,6 szczytu');
});

test('Odejście zamyka decyzje dawnego klubu; wycofanie aplikacji nie kasuje oferty agenta z kilkoma klubami', () => {
  const g = newGame('korona', 27, '2026-09-01');
  // Decyzja dawnego klubu w poczcie (np. sztab): po odejściu nie blokuje Dalej i nie da się jej podjąć
  g.inbox.unshift({ id: 'qa-dec', key: 'qa-dec', date: g.date, category: 'staff', from: 'Sztab', subject: 'Decyzja klubu', body: '', priority: 'important', actions: [{ id: 'a', label: 'Tak' }], read: false, resolved: false, refs: { kind: 'staffRenew' } });
  g.inbox = [...enterUnemployment(g, g.date, 'zwolnienie'), ...g.inbox];
  assert.ok(g.inbox.find((m) => m.id === 'qa-dec').resolved, 'decyzja dawnego klubu zamknięta');
  assert.notEqual(primaryAction(g).kind, 'decide');
  // Oferta agenta (dwa kluby) i aplikacja do jednego z nich
  const ids = Object.keys(g.world.clubs).filter((id) => clubById(id) && !clubById(id).parent && clubById(id).tier >= 3 && id !== 'korona').slice(0, 2);
  for (const id of ids) { fireCoach(g, id, g.date, { why: 'wyniki' }); g.coaches[id].until = addDays(g.date, 20); }
  g.manager.job.since = addDays(g.date, -JOB.fallback1);
  const offer = jobMarketDay(g, g.date).find((m) => m.refs?.kind === 'jobOffer');
  assert.ok(offer);
  g.inbox.unshift(offer);
  const target = offer.refs.jobClubs.find((id) => ids.includes(id)) ?? ids[0];
  assert.ok(applyJob(g, target).ok);
  assert.ok(withdrawApplication(g, target).ok);
  assert.equal(g.inbox.find((m) => m.id === offer.id).resolved, false, 'oferta agenta zostaje');
});
