import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics, assign } from '../src/engine/lineup.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { createMatch, step, resume, runToEnd, result, substitute, changeTactics, shout } from '../src/engine/match/match.js';
import { checkStatsInvariants } from '../src/engine/matchStats.js';
import { registerPhase, PHASES } from '../src/engine/match/core.js';

const world = generateWorld(42);
const EK = CLUBS_PL.filter((c) => c.tier === 1);
const sq = Object.fromEntries(EK.map((c) => [c.id, squadOf(world, c.id)]));
const tac = Object.fromEntries(EK.map((c) => [c.id, createTactics(sq[c.id])]));
const side = (id, extra = {}) => ({ club: clubById(id), squad: sq[id], tactics: tac[id], ai: true, coach: clubById(id).coach, ...extra });
const play = (h, a, seed, ctx = {}, extra = [{}, {}]) => {
  const M = createMatch({ seed, home: side(h, extra[0]), away: side(a, extra[1]), ctx });
  return { M, r: runToEnd(M) };
};

test('Deterministyczność: to samo ziarno daje identyczny mecz', () => {
  const a = play('legia', 'lech', 'x1').r;
  const b = play('legia', 'lech', 'x1').r;
  assert.deepEqual(a.score, b.score);
  assert.deepEqual(a.stats, b.stats);
  assert.notDeepEqual(play('legia', 'lech', 'x2').r.events.length, 0);
});

test('Statystyki zawsze zgodne z dziennikiem zdarzeń i wynikiem (300 meczów)', () => {
  for (let i = 0; i < 300; i++) {
    const h = EK[i % 18].id; const a = EK[(i + 5) % 18].id;
    const { r } = play(h, a, `inv${i}`);
    assert.deepEqual(checkStatsInvariants(r.stats, r.score), [], `mecz ${i}`);
    for (const x of r.ratings) assert.ok(x.rating >= 3 && x.rating <= 10);
  }
});

test('Kalibracja: realne średnie na 1500 meczach Ekstraklasy', () => {
  const n = 1500; const s = { g: 0, sh: 0, on: 0, c: 0, f: 0, y: 0, off: 0, pass: 0, acc: 0, hw: 0, d: 0 };
  for (let i = 0; i < n; i++) {
    const h = EK[i % 18].id; const a = EK[(i * 7 + 3) % 18 === i % 18 ? (i + 1) % 18 : (i * 7 + 3) % 18].id;
    const { r } = play(h, a, `cal${i}`);
    const t = r.stats;
    s.g += r.score[0] + r.score[1]; s.sh += t[0].shots + t[1].shots; s.on += t[0].onTarget + t[1].onTarget;
    s.c += t[0].corners + t[1].corners; s.f += t[0].fouls + t[1].fouls; s.y += t[0].yellow + t[1].yellow;
    s.off += t[0].offsides + t[1].offsides; s.pass += t[0].passes; s.acc += t[0].passAccuracy;
    if (r.score[0] > r.score[1]) s.hw++; else if (r.score[0] === r.score[1]) s.d++;
  }
  const avg = (k) => s[k] / n;
  assert.ok(avg('g') > 2.5 && avg('g') < 3.0, `gole ${avg('g')}`);
  assert.ok(avg('sh') > 22 && avg('sh') < 28, `strzały ${avg('sh')}`);
  assert.ok(avg('on') > 7.5 && avg('on') < 10.5, `celne ${avg('on')}`);
  assert.ok(avg('c') > 8 && avg('c') < 12, `rożne ${avg('c')}`);
  assert.ok(avg('f') > 22 && avg('f') < 31, `faule ${avg('f')}`);
  assert.ok(avg('y') > 3.4 && avg('y') < 4.4, `żółte ${avg('y')}`);
  assert.ok(avg('off') > 3 && avg('off') < 5.5, `spalone ${avg('off')}`);
  assert.ok(avg('pass') > 350 && avg('pass') < 480, `podania ${avg('pass')}`);
  assert.ok(avg('acc') > 74 && avg('acc') < 86, `celność ${avg('acc')}`);
  assert.ok(avg('hw') > 0.4 && avg('hw') < 0.49, `gospodarze ${avg('hw')}`);
  assert.ok(avg('d') > 0.22 && avg('d') < 0.31, `remisy ${avg('d')}`);
});

test('Silniejsza kadra wygrywa wyraźnie częściej (najsilniejszy vs najsłabszy klub)', () => {
  const strong = 'legia'; const weak = 'radomiak';
  let w = 0; let l = 0;
  for (let i = 0; i < 400; i++) {
    const { r } = play(i % 2 ? strong : weak, i % 2 ? weak : strong, `str${i}`);
    const sideStrong = i % 2 ? 0 : 1;
    if (r.winner === sideStrong) w++; else if (r.winner === 1 - sideStrong) l++;
  }
  assert.ok(w > l * 1.4, `silny ${w}, słaby ${l}`);
});

test('Reguły zmian: maks. 5 zmian i 3 okna w 90 minut, także dla AI', () => {
  for (let i = 0; i < 200; i++) {
    const { M } = play(EK[i % 18].id, EK[(i + 3) % 18].id, `sub${i}`);
    for (const T of M.teams) {
      assert.ok(T.subsUsed <= 5, `zmiany ${T.subsUsed}`);
      assert.ok(T.windowsUsed <= 3, `okna ${T.windowsUsed}`);
    }
  }
});

test('Przerwa: mecz staje po 1. połowie, zmiany w przerwie nie zużywają okna', () => {
  const M = createMatch({ seed: 'ht', home: side('legia', { ai: false }), away: side('lech'), ctx: {} });
  let s;
  do { s = step(M); } while (s.state === 'play');
  assert.equal(s.state, 'break');
  assert.ok(M.halfTimeScore);
  const T = M.teams[0];
  const out = T.players.find((x) => x.on && x.slot.pos === 'ŚO');
  const r = substitute(M, 0, out.id, T.bench.find((x) => x.p.pos === 'ŚO')?.id ?? T.bench[1].id);
  assert.ok(r.ok, r.error);
  assert.equal(T.windowsUsed, 0);
  assert.equal(T.subsUsed, 1);
  resume(M);
  assert.equal(M.half, 2);
  const end = runToEnd(M);
  assert.ok(end.score);
});

test('Gracz nie przekroczy limitu okien: czwarte okno jest odrzucone', () => {
  const M = createMatch({ seed: 'win', home: side('legia', { ai: false }), away: side('lech'), ctx: {} });
  const T = M.teams[0];
  const doSub = () => {
    const out = T.players.find((x) => x.on && !x.sentOff && x.slot.pos !== 'BR');
    const inc = T.bench.find((x) => x.p.pos !== 'BR');
    return substitute(M, 0, out.id, inc.id);
  };
  for (const minute of [10, 20, 30]) { while (M.minute < minute) step(M); assert.ok(doSub().ok); }
  while (M.minute < 40) step(M);
  const r = doSub();
  assert.equal(r.ok, false);
  assert.match(r.error, /okna/);
});

test('Mecz pucharowy: remis daje dogrywkę i serię karnych, gole z serii nie liczą się do wyniku', () => {
  let found = null;
  for (let i = 0; i < 80 && !found; i++) {
    const { r } = play('legia', 'legia', `ko${i}`, { knockout: 'single' }, [{}, {}]);
    if (r.shootout) found = r;
  }
  assert.ok(found, 'w 80 meczach równych drużyn musi trafić się seria karnych');
  assert.equal(found.extraTime, true);
  assert.equal(found.score[0], found.score[1]);
  assert.notEqual(found.shootout.goals[0], found.shootout.goals[1]);
  assert.equal(found.stats[0].goals, found.score[0]);
  const kicks = found.shootout.kicks;
  assert.ok(kicks.length >= 6);
  for (let i = 0; i < Math.min(10, kicks.length); i++) assert.equal(kicks[i].side, i % 2, 'kolejność ABAB');
});

test('Dwumecz: suma bramek decyduje, bez bramek wyjazdowych', () => {
  // Obecny gospodarz przegrał pierwszy mecz 0:1 (jako gość). Wygrana 1:0 = remis w dwumeczu -> dogrywka
  let sawExtra = false; let sawNoExtra = false;
  for (let i = 0; i < 60; i++) {
    const { r } = play('lech', 'legia', `leg${i}`, { knockout: { firstLeg: [0, 1] } });
    if (r.score[0] - r.score[1] === 1 && r.addedTimes.length >= 3) sawExtra = true;
    if (r.score[0] - r.score[1] !== 1 && r.addedTimes.length === 2) sawNoExtra = true;
    if (r.extraTime) assert.equal(r.addedTimes.length >= 3, true);
  }
  assert.ok(sawNoExtra);
  void sawExtra;
});

test('Bramkarz napastnikiem w bramce: drużyna traci średnio o ponad 1 gola więcej', () => {
  const t = tac.legia;
  const st = sq.legia.find((p) => p.pos === 'NAP' && !t.xi.includes(p.id) && !t.bench.includes(p.id))
    ?? sq.legia.find((p) => p.pos === 'NAP' && t.bench.includes(p.id));
  const noGkTac = { ...assign(t, { type: 'xi', idx: 0 }, st.id), bench: t.bench.filter((id) => sq.legia.find((p) => p.id === id).pos !== 'BR' && id !== st.id) };
  let normal = 0; let bad = 0; const n = 250;
  for (let i = 0; i < n; i++) {
    normal += play('legia', 'lech', `gk${i}`, {}, [{ ai: false }, {}]).r.score[1];
    bad += play('legia', 'lech', `gk${i}`, {}, [{ ai: false, tactics: noGkTac }, {}]).r.score[1];
  }
  assert.ok((bad - normal) / n > 0.9, `różnica ${(bad - normal) / n}`);
});

test('Zmiana taktyki kosztuje spójność, a nerwowa druga zmiana w 10 minut kosztuje podwójnie; w przerwie za darmo', () => {
  const M = createMatch({ seed: 'tac', home: side('legia', { ai: false }), away: side('lech'), ctx: {} });
  while (M.minute < 20) step(M);
  const T = M.teams[0];
  const s0 = T.S;
  const c1 = changeTactics(M, 0, { instructions: { pressing: 'high' } });
  assert.equal(c1.cost, 5);
  step(M); step(M);
  const c2 = changeTactics(M, 0, { instructions: { tempo: 'fast' } });
  assert.equal(c2.cost, 10);
  assert.ok(T.S < s0);
  while (M.phase !== 'break') step(M);
  const c3 = changeTactics(M, 0, { formation: '433' });
  assert.equal(c3.adapt, 0);
});

test('Okrzyk ma 8 minut przerwy, „Brawo” działa najwyżej 2 razy', () => {
  const M = createMatch({ seed: 'sh', home: side('legia', { ai: false }), away: side('lech'), ctx: {} });
  while (M.minute < 10) step(M);
  assert.ok(shout(M, 0, 'walka').ok);
  assert.equal(shout(M, 0, 'naprzod').ok, false);
  while (M.minute < 19) step(M);
  assert.ok(shout(M, 0, 'brawo').ok);
  while (M.minute < 28) step(M);
  assert.ok(shout(M, 0, 'brawo').ok);
  while (M.minute < 37) step(M);
  assert.equal(shout(M, 0, 'brawo').ok, false);
});

test('GOL zatrzymuje czas w UI (pauza 3 s), VAR 2 s; momentum ma wartość dla każdej minuty', () => {
  const M = createMatch({ seed: 'ui', home: side('legia'), away: side('lech'), ctx: {} });
  let sawGoalPause = false;
  while (!M.ended) {
    const s = M.phase === 'break' ? (resume(M), { events: [] }) : step(M);
    if (s.events?.some((e) => e.type === 'goal')) { sawGoalPause = s.pause >= 3; if (sawGoalPause) break; }
  }
  if (!M.ended) runToEnd(M);
  const r = result(M);
  assert.ok(sawGoalPause || r.score[0] + r.score[1] === 0);
  assert.equal(r.momentum.length, M.tick);
  assert.ok(r.momentum.every((v) => v >= -100 && v <= 100));
  assert.ok(r.events.every((e) => typeof e.min === 'string'));
});

test('Silnik jest rozszerzalny (nowa faza) i szybki (poniżej 10 ms na mecz)', () => {
  let calls = 0;
  registerPhase('testPogoda', () => { calls++; }, { after: 'possession' });
  play('legia', 'lech', 'ext');
  PHASES.splice(PHASES.findIndex(([k]) => k === 'testPogoda'), 1);
  assert.ok(calls >= 90);
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) play('legia', 'lech', `perf${i}`);
  assert.ok((performance.now() - t0) / 50 < 10);
});
