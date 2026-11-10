import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, continueUntilStop, primaryAction } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { squadOf } from '../src/world/worldGen.js';
import {
  startMatchday, preAdvice, doPreBriefing, kickOff, tick, halfAdvice, doHalfBriefing, continueAfterBreak, skip,
  finishMatchday, doPostBriefing, doPress, closeMatchday, halfInfo,
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
  assert.ok(S.press.length >= 2);
  const before = g.board.trust;
  const eff = doPress(g, S, Object.fromEntries(S.press.map((q) => [q.id, 0])));
  assert.ok(typeof eff.text === 'string');
  assert.ok(g.board.trust !== undefined && Math.abs(g.board.trust - before) <= 20);
  closeMatchday(g, S);
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
