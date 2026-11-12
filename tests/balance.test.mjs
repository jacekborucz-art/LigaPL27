// Balans gracz kontra AI (docs/balans.md): pasywny trener nie może mieć przewagi tylko dlatego, że jego klub
// prowadzi gracz. Testy są tanie: porównują składniki siły w dniu meczu, skalę ocen i organiczną trudność.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, playQuick, applyResult, fromEngineResult, squadFor } from '../src/season/season.js';
import { processDay, continueUntilStop, primaryAction, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { teamRating } from '../src/engine/teamStrength.js';
import { createMatch, runToEnd } from '../src/engine/match/match.js';
import { clubById } from '../src/data/clubs_pl.js';
import '../src/season/dailySystems.js';
import { attachTraining } from '../src/training/index.js';
import { prepTerm } from '../src/training/cohesion.js';
import { managerThreat } from '../src/career/threat.js';
import { boardGoal, seasonGoalFor } from '../src/career/board.js';
import { matchTactics } from '../src/match/matchday.js';

const SEED = 4242;
function newGame(clubId, seed = SEED) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId));
  processDay(g);
  return g;
}

/** Pasywny gracz: same „Dalej”, mecze gracza szybką symulacją (tanio), decyzje odrzucone. */
function playUntil(g, until) {
  const rng = new Rng(`pasywny:${g.seed}`);
  let guard = 0;
  while (g.date < until && guard++ < 3000) {
    const a = primaryAction(g);
    if (a.kind === 'play') { applyResult(g, a.match, playQuick(g, a.match, rng), rng); continue; }
    if (a.kind === 'decide') { g.inbox = g.inbox.map((m) => ({ ...m, resolved: true })); continue; }
    continueUntilStop(g, { maxDays: 1 });
  }
}

const TRAINING_TERMS = ['sharp', 'trainingCohesion', 'trainingPrep', 'trainingLoad', 'trainingCamp', 'trainingSetPieces'];

test('Pasywny gracz: składniki treningu w dniu meczu podobne jak w tym samym klubie pod AI', () => {
  const club = 'widzew';
  const until = '2026-09-10';
  const date = (g) => g.fixtures.filter((f) => f.date >= until && (f.home === club || f.away === club) && f.comp === 'ekstraklasa').map((f) => f.date).sort()[0];
  const probe = (g) => {
    const d = date(g);
    playUntil(g, d);
    const saved = g.date; g.date = d; attachTraining(g);
    const b = teamRating(squadFor(g, club, 'ekstraklasa')).breakdown;
    g.date = saved;
    return Object.fromEntries(TRAINING_TERMS.map((k) => [k, b[k] ?? 0]));
  };
  const user = probe(newGame(club));
  const ai = probe(newGame('slask-ii')); // inny klub gracza, Widzew prowadzi AI
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  const diff = sum(user) - sum(ai);
  assert.ok(Math.abs(diff) < 0.15, `gracz ${JSON.stringify(user)} AI ${JSON.stringify(ai)} różnica ${diff.toFixed(3)}`);
  assert.ok(ai.trainingPrep > 0, 'klub AI też analizuje rywala');
});

test('Skala ocen: oceny z pełnego silnika po przeliczeniu mają średnią jak mecze w tle', () => {
  const w = generateWorld(9);
  const clubs = ['legia', 'widzew', 'gks-katowice', 'piast', 'motor', 'lech'];
  let eng = 0; let n = 0; let quick = 0; let nq = 0;
  const g = { seed: 9, clubId: 'slask-ii', date: '2026-08-01', world: w, fixtures: [] };
  for (let k = 0; k < 24; k++) {
    const H = clubById(clubs[k % 6]); const A = clubById(clubs[(k + 1 + (k >> 2)) % 6]);
    if (H === A) continue;
    const cfg = (c) => { const sq = squadOf(w, c.id); return { club: c, squad: sq, tactics: createTactics(sq), ai: true }; };
    const r = runToEnd(createMatch({ seed: `skala:${k}`, home: cfg(H), away: cfg(A), ctx: { rank: 0, refStrict: 1 } }));
    for (const side of fromEngineResult(r).players) for (const x of side) { eng += x.rating * Math.min(90, x.minutes); n += Math.min(90, x.minutes); }
    const f = { id: `q${k}`, comp: 'ekstraklasa', home: H.id, away: A.id, date: g.date };
    const q = playQuick(g, f, new Rng(`q:${k}`));
    for (const side of q.players) for (const x of side) { quick += x.rating; nq++; }
  }
  const dm = eng / n - quick / nq;
  assert.ok(Math.abs(dm) < 0.12, `średnia silnik ${(eng / n).toFixed(2)}, w tle ${(quick / nq).toFixed(2)}`);
});

test('Organiczna trudność: drużyna grająca ponad stan jest groźna, przeciętna nie', () => {
  const mk = (pointsPerGame) => {
    const fixtures = [];
    const opps = ['legia', 'lech', 'rakow', 'jagiellonia', 'pogon-szczecin', 'wieczysta', 'piast', 'slask', 'motor', 'korona'];
    let pts = 0;
    opps.forEach((o, i) => {
      const want = Math.round(pointsPerGame * (i + 1)) - pts;
      const score = want >= 3 ? [2, 0] : want >= 1 ? [1, 1] : [0, 1];
      pts += score[0] > score[1] ? 3 : score[0] === score[1] ? 1 : 0;
      fixtures.push({ id: `t${i}`, comp: 'ekstraklasa', home: 'gks-katowice', away: o, date: addDays('2026-08-01', 7 * i), played: true, result: { score } });
    });
    return { clubId: 'gks-katowice', date: '2026-10-15', fixtures, manager: { seasons: [] }, archive: [] };
  };
  assert.equal(managerThreat(mk(1.1)), 0, 'gra na miarę kadry: brak reakcji świata');
  assert.ok(managerThreat(mk(2.6)) > 0.8, 'seria zwycięstw słabego klubu: rywale traktują go poważnie');
  // Rywal groźnej drużyny analizuje ją staranniej niż zwykłego rywala
  const g = newGame('gks-katowice');
  playUntil(g, '2026-07-20');
  const f = g.fixtures.find((x) => x.comp === 'ekstraklasa' && (x.home === 'gks-katowice' || x.away === 'gks-katowice') && !x.played);
  const oppId = f.home === 'gks-katowice' ? f.away : f.home;
  g.training.staff[oppId].analityk.q = 12;
  g.date = f.date;
  const p = squadOf(g.world, oppId)[0];
  const calm = prepTerm(g, p);
  assert.ok(calm > 0.1 && calm < 0.12, `analiza rywala AI ${calm}`);
  g.archive = [{ champion: 'gks-katowice', cup: null }];
  g.date = addDays(f.date, 0); g.fixtures = [...g.fixtures]; // nowy dzień w pamięci podręcznej
  const wary = prepTerm({ ...g }, p);
  assert.ok(wary > calm * 1.2, `po tytule rywale przygotowują się lepiej: ${calm} -> ${wary}`);
});

test('Organiczna trudność: po sezonie ponad stan zarząd podnosi cel, po sezonie w normie nie', () => {
  const club = clubById('widzew');
  const base = seasonGoalFor(club);
  const after = (pos) => boardGoal({ manager: { seasons: [{ club: 'widzew', tier: club.tier, pos, target: base.target }] } }, club);
  assert.equal(after(base.target).target, base.target);
  assert.equal(after(base.target - 1).target, base.target);
  const champ = after(1);
  assert.ok(champ.target < base.target && champ.raised, JSON.stringify(champ));
});

test('Skład gracza: zastępca kontuzjowanego wraca na ławkę, gdy zawodnik wyzdrowieje; zmiany gracza zostają', () => {
  const g = newGame('widzew');
  const squad = () => squadOf(g.world, 'widzew');
  const star = g.tactics.xi[4];
  const p = g.world.players[star];
  p.injuryDays = 10;
  g.tactics = matchTactics(g, squad(), 12);
  const sub = g.tactics.xi[4];
  assert.notEqual(sub, star);
  p.injuryDays = 0;
  g.tactics = matchTactics(g, squad(), 12);
  assert.equal(g.tactics.xi[4], star, 'po powrocie gra podstawowy zawodnik');
  assert.ok(g.tactics.bench.includes(sub));
  // Ten sam scenariusz, ale gracz sam wybrał zastępcę na inne miejsce: asystent nie cofa decyzji
  p.injuryDays = 10;
  g.tactics = matchTactics(g, squad(), 12);
  const sub2 = g.tactics.xi[4];
  const other = g.tactics.bench.find((id) => id !== star && g.world.players[id].pos !== 'BR');
  g.tactics = { ...g.tactics, xi: g.tactics.xi.map((id, i) => (i === 4 ? other : id)), bench: g.tactics.bench.filter((id) => id !== other).concat(sub2) };
  p.injuryDays = 0;
  g.tactics = matchTactics(g, squad(), 12);
  assert.equal(g.tactics.xi[4], other);
  // Skład wybierany przez asystenta przed każdym meczem (jak w klubach AI)
  g.tactics = { ...g.tactics, assistant: true };
  const auto = matchTactics(g, squad(), 12);
  assert.ok(auto.assistant && auto.xi.includes(star));
});

test('Odprawa pomeczowa AI: kluby AI dostają morale z odprawy tym samym modelem co gracz', () => {
  const g = newGame('slask-ii');
  const f = { id: 'bal-po', comp: 'ekstraklasa', home: 'legia', away: 'widzew', date: g.date, played: false };
  const res = playQuick(g, f, new Rng('po-meczu'));
  res.score = [3, 0]; // wygrana gospodarzy: trener AI chwali albo każe myśleć o kolejnym meczu
  const before = new Map(squadOf(g.world, 'legia').map((p) => [p.id, p.morale ?? 12]));
  applyResult(g, f, res, new Rng('po-meczu-zapis'));
  const tone = g.aiSpeech.legia.last.at(-1)[0];
  assert.ok(['post:praise', 'post:focusNext'].includes(tone), tone);
  assert.ok(g.aiSpeech.widzew.last.length === 1);
  const xi = res.players[0].map((x) => x.id);
  const gain = xi.reduce((s, id) => s + g.world.players[id].morale - before.get(id), 0) / xi.length;
  assert.ok(gain > 1.5, `morale zwycięzców +${gain.toFixed(2)} (mecz + odprawa)`);
});

// Gra bierna (docs/bierna-gra.md): zamierzona różnica. Pasywny gracz (ta sama taktyka w każdym meczu) ma kończyć
// sezon wyraźnie pod tym samym klubem prowadzonym przez AI (pomiar: ok. 6-10 pkt), a gracz zmieniający plan pod rywala
// ma być blisko AI. Tani strażnik: premia rywala w dniu meczu za rozpracowany schemat, zaskoczenie przy zmianie planu.
test('Gra bierna: rywale AI rozpracowują stały schemat gracza, urozmaicony plan jest blisko neutralnego', async () => {
  const { recordMatch, scoutEdge, SCOUT } = await import('../src/training/scouting.js');
  const g = newGame('widzew');
  const opp = 'lech';
  g.training.staff[opp].analityk.q = 13; // przeciętny analityk Ekstraklasy
  for (let k = 0; k < 8; k++) recordMatch(g, `bal-${k}`, addDays('2026-07-20', 7 * k), g.tactics);
  const passive = scoutEdge(g, opp, 'widzew');
  assert.ok(passive >= 0.15 && passive <= SCOUT.edgeMax, `pasywny: premia rywala ${passive}`);
  const h = newGame('widzew');
  h.training.staff[opp].analityk.q = 13;
  const plans = [{}, { pressing: 'high', mentality: '1' }, { pressing: 'low', line: 'low', mentality: '-1' }];
  for (let k = 0; k < 8; k++) recordMatch(h, `bal-${k}`, addDays('2026-07-20', 7 * k), { ...h.tactics, instructions: { ...h.tactics.instructions, ...plans[k % 3] } });
  const varied = scoutEdge(h, opp, 'widzew');
  assert.ok(Math.abs(varied) < 0.06, `urozmaicony plan: premia rywala ${varied}`);
});

// Runda 2 (docs/bierna-gra.md, rozdz. 9): trener, który nic nie robi, traci szatnię; trafna praca daje lekką premię,
// większą w mocniejszej kadrze; trener AI neutralny. Pomiar sezonów: pasywny średnio ponad 10 pkt pod AI.
test('Gra bierna: autorytet trenera w granicach zamierzonego balansu', async () => {
  const { AUTH, authorityTerm, authorityOf, authorityWeek, logEngage } = await import('../src/career/authority.js');
  const g = newGame('widzew');
  for (let k = 0; k < 12; k++) { const d = addDays('2026-08-03', 7 * k); logEngage(g, 'pressSkip', addDays(d, -3)); authorityWeek(g, d); }
  const passive = authorityTerm(authorityOf(g, 'widzew'), clubById('widzew').L);
  assert.ok(passive <= -0.2 && passive >= AUTH.min, `pasywny: ${passive}`);
  const engaged = authorityTerm(0.9, clubById('widzew').L);
  assert.ok(engaged > 0.1 && engaged <= AUTH.max, `zaangażowany: ${engaged}`);
  assert.ok(authorityTerm(0.9, clubById('legia').L) > authorityTerm(0.9, clubById('gks-katowice').L));
  assert.equal(authorityTerm(authorityOf(g, 'legia')), 0, 'trener AI neutralny');
});
