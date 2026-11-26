import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, continueUntilStop, primaryAction } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { squadOf } from '../src/world/worldGen.js';
import {
  startMatchday, preAdvice, doPreBriefing, kickOff, tick, halfAdvice, doHalfBriefing, continueAfterBreak, skip,
  finishMatchday, doPostBriefing, doPress, pressOpen, closeMatchday, halfInfo,
} from '../src/match/matchday.js';
import '../src/season/dailySystems.js';

function newGame(clubId, seed) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  processDay(g);
  while (primaryAction(g).kind !== 'play') {
    if (primaryAction(g).kind === 'decide') g.inbox = g.inbox.map((m) => ({ ...m, resolved: true }));
    else continueUntilStop(g);
  }
  return g;
}

test('Pełny dzień meczowy krok po kroku: studio, odprawy, mecz z przerwą, studio pomeczowe, konferencja', () => {
  const g = newGame('widzew', 11);
  const f = primaryAction(g).match;
  const S = startMatchday(g, f);
  // Studio przedmeczowe
  assert.ok(S.pre.odds.home + S.pre.odds.draw + S.pre.odds.away > 0.99);
  assert.ok(S.pre.headlines.length >= 1);
  assert.ok(S.pre.assistant);
  // Odprawa przedmeczowa
  const adv = preAdvice(g, S);
  assert.ok(adv.tone);
  const pre = doPreBriefing(g, S, adv.tone, adv.talks.slice(0, 2).map((t) => ({ id: t.id, kind: t.kind })));
  assert.ok(pre.players.length >= 11);
  assert.ok(pre.players.every((p) => typeof p.text === 'string' && !/\d/.test(p.label)));
  // 1. połowa minuta po minucie
  const M = kickOff(g, S);
  let guard = 0;
  while (S.step === 'live1' && guard++ < 80) tick(S);
  assert.equal(S.step, 'break');
  const h = halfInfo(S);
  assert.ok(h.stats[0].passes > 50);
  // Odprawa w przerwie zmienia zaangażowanie zawodników na boisku
  const hadv = halfAdvice(g, S);
  doHalfBriefing(g, S, hadv.tone, []);
  continueAfterBreak(S);
  assert.equal(M.half, 2);
  skip(S);
  assert.equal(S.step, 'fulltime');
  // Koniec: wynik zapisany w terminarzu, studio pomeczowe, wiadomości
  const post = finishMatchday(g, S);
  assert.ok(f.played && f.result);
  assert.equal(`${f.result.score[0]}:${f.result.score[1]}`, post.result.score);
  assert.ok(post.reactions.board.text);
  assert.ok(g.inbox.some((m) => m.key?.startsWith(`studio:${f.id}`)));
  // Odprawa pomeczowa i konferencja
  const postB = doPostBriefing(g, S, 'focusNext', []);
  assert.ok(postB.players.length >= 11);
  const conf = pressOpen(g, S);
  assert.ok(conf.queue.filter((q) => !q.officer).length >= 3, 'co najmniej 3 pytania dziennikarzy');
  assert.ok(conf.room.length >= 4 && conf.room.every((j) => j.name && j.outlet));
  const before = g.board.trust;
  const eff = doPress(g, S);
  assert.equal(eff.mode, 'answered');
  assert.ok(eff.headline?.text && eff.headline.outlet);
  assert.ok(g.board.trust !== undefined && Math.abs(g.board.trust - before) <= 5);
  assert.ok(g.inbox.some((m) => m.key === `prasa:${f.id}`), 'nagłówek konferencji w poczcie');
  assert.equal(g.press.last.mode, 'answered');
  const trust = g.board.trust;
  closeMatchday(g, S); // konferencja już rozliczona: zamknięcie nie dolicza presji drugi raz
  assert.equal(g.board.trust, trust);
  assert.ok(g.speechMemory.last.length >= 1);
  // Po meczu pętla dni idzie dalej
  assert.notEqual(primaryAction(g).kind, 'play');
});

test('Ten sam mecz z tymi samymi decyzjami daje ten sam wynik (deterministyczność)', () => {
  const run = () => {
    const g = newGame('lech', 22);
    const S = startMatchday(g, primaryAction(g).match);
    doPreBriefing(g, S, 'calm', []);
    kickOff(g, S);
    skip(S);
    doHalfBriefing(g, S, 'demand', []);
    continueAfterBreak(S);
    skip(S);
    return finishMatchday(g, S).result.score;
  };
  assert.equal(run(), run());
});

test('Odprawa ma wpływ: zaangażowanie z odprawy trafia do silnika', () => {
  const g = newGame('pogon-szczecin', 33);
  const S = startMatchday(g, primaryAction(g).match);
  const res = doPreBriefing(g, S, 'demand', []);
  const M = kickOff(g, S);
  const T = M.teams[S.userSide];
  const x = T.players[3];
  assert.equal(x.Z, res.engine.zStart[x.id]);
});

test('Dane dla silnika i ze silnika: temperatura, kara za czerwoną z powodu, walkower, zawodnik w zdarzeniach studia', async () => {
  const { engineWeather } = await import('../src/match/matchday.js');
  const { fromEngineResult, walkoverScore, RED_BAN } = await import('../src/season/season.js');
  assert.equal(engineWeather({ type: 'slonce', tempC: 34 }, 'dobra').tempC, 34);
  const base = { score: [1, 0], ratings: [{ id: 'a', side: 0, minutes: 90, rating: 6.5, g: 1, a: 0, yc: 0, rc: 0 }, { id: 'b', side: 1, minutes: 70, rating: 5, g: 0, a: 0, yc: 0, rc: 1 }], events: [{ type: 'red', pid: 'b', side: 1, reasonCode: 'violent' }], stats: [{ shots: 1, onTarget: 1, possession: 50, xg: 1 }, { shots: 0, onTarget: 0, possession: 50, xg: 0 }], extraTime: false };
  const res = fromEngineResult(base);
  assert.equal(res.players[1][0].redReason, 'violent');
  assert.equal(RED_BAN.violent, 3);
  assert.deepEqual(walkoverScore({ score: [1, 0], abandoned: { side: 1, minute: 70 } }), [3, 0]);
  assert.deepEqual(walkoverScore({ score: [0, 4], abandoned: { side: 0, minute: 70 } }), [0, 4]);
  assert.deepEqual(walkoverScore({ score: [2, 2], abandoned: null }), [2, 2]);
  // Pełny dzień meczowy: zdarzenia w studiu mają zawodnika (pauzy po czerwonej kartce)
  const g = newGame('widzew', 11);
  const S = startMatchday(g, primaryAction(g).match);
  doPreBriefing(g, S, preAdvice(g, S).tone, []);
  kickOff(g, S);
  assert.equal(S.M.ctx.concussionSubs, false);
  skip(S); if (S.step === 'break') { doHalfBriefing(g, S, 'calm', []); continueAfterBreak(S); skip(S); }
  const post = finishMatchday(g, S);
  for (const x of post.suspensions) assert.ok(x.id, JSON.stringify(x));
});

test('Studio pomeczowe: miejsce przed meczem i po nim takie jak w tabeli ligi (punkty, nie bilans bramek)', async () => {
  const { standings } = await import('../src/season/standings.js');
  const { compClubIds } = await import('../src/season/leagueComps.js');
  const { applyResultToTable } = await import('../src/match/studio.js');
  const g = newGame('widzew', 11);
  const f = primaryAction(g).match;
  const table = () => standings(g.fixtures.filter((x) => x.comp === f.comp), compClubIds(f.comp));
  const before = table().find((r) => r.id === g.clubId).pos;
  const S = startMatchday(g, f);
  doPreBriefing(g, S, preAdvice(g, S).tone, []);
  kickOff(g, S);
  skip(S); if (S.step === 'break') { doHalfBriefing(g, S, 'calm', []); continueAfterBreak(S); skip(S); }
  const post = finishMatchday(g, S);
  assert.equal(post.table.user.before, before);
  assert.equal(post.table.user.after, table().find((r) => r.id === g.clubId).pos);
  // Zapasowe liczenie (bez tabeli po meczu) bierze punkty z pola points tabeli ligi
  const rows = applyResultToTable([{ id: 'a', name: 'A', points: 10, gf: 2, ga: 9 }, { id: 'b', name: 'B', points: 4, gf: 9, ga: 2 }], null, null, 0, 0);
  assert.equal(rows[0].id, 'a', 'więcej punktów wyżej mimo gorszego bilansu');
});
