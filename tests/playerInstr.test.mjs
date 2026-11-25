// Instrukcje indywidualne zawodników (docs/instrukcje-indywidualne.md): złoty test, determinizm, osobne strumienie,
// jakość wykonania, konflikt, kierunek efektów (A/B), równoważność z instrukcją drużyny, zapis taktyki, zmiany w meczu,
// reguła AI i wydajność.
import test from 'node:test';
import assert from 'node:assert/strict';
import { goldenHashes, matchHash, abRun, abMetrics, allEligible, sq, EK, world } from './piHelpers.mjs';
import { AI_RULES } from '../src/engine/match/coach.js';
import { createMatch, step, resume, runToEnd, result, changeTactics, checkTacticPatch } from '../src/engine/match/match.js';
import { tacticParams, fieldPlayers } from '../src/engine/match/teams.js';
import { teamShift, applyShift, qualityOf, conflictOf, statusOf, PI } from '../src/engine/match/playerInstr.js';
import { PLAYER_INSTRUCTIONS, cleanPlayerInstrMap, piAllowed, teamLevel } from '../src/data/playerInstructions.js';
import { createTactics, refreshTactics } from '../src/engine/lineup.js';
import { matchTactics } from '../src/match/matchday.js';
import { formationById } from '../src/data/formations.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { squadOf } from '../src/world/worldGen.js';
import { Rng } from '../src/core/rng.js';

// Skróty meczów sprzed instrukcji indywidualnych (Nov 18, 2026, tests/piHelpers.mjs przed zmianą silnika)
// Wzorce przeliczone po celowych zmianach silnika (żółte -15%, kara zmęczenia z tolerancją, krycie zmęczonej obrony przy stałych fragmentach, Nov 25, 2026)
const GOLD = {
  user: [
    '5234c068', '3826b215', '883fda8c', '7b179cf1', '8d30037', '2860d6c2', 'f7db251e', '9cbb0558', '83e75735', 'c9340e3c',
    '2221f8cf', '71d74805', '4810e36', 'e955e38b', '73bf8acf', 'f9d7806d', 'a667554f', 'f00215bc', 'f9968d8e', '2a8f2a0a',
    'c65f8cb7', 'c9207507', '90fe28ef', '93a0b944', '5daf5735', '34a84b25', '45e7bc5b', 'cdf40436', '6fefe980', 'abb22045',
    'b514ac05', '7372b340', '5e778232', '51cd8141', '55230baa', '9cedaef', 'd6258b7b', '35469569', '51ce96ec', '520e6770',
    '5df8cf8b', '4036f82e', '94fbf632', 'd6a2cf4d', '40e9fa55', 'aa672728', '9c934941', 'e0b220c6', '36852ba8', 'd1644980',
  ],
  ai: [
    'b89c3308', '2437b59d', '438143f3', 'a74d43e', '8e0dfcea', '93e38323', 'a7a30f03', 'fccae89f', '5496d5ed', '97d258a5',
    '6677e92d', 'd7a3e7b9', '3e84e97e', 'a705ae8b', '7aac84d7', 'f740b572', '58b552d0', 'c3f325ea', '45b393a', '59b41071',
    '8a539863', '840ccc96', 'fcea51e1', '714b36f1', 'e6fa7529', '3cc6935d', '8193569c', 'bba818e6', 'be0be41c', '10190e83',
    '4c3362a6', '80d74a54', '9343017f', '6875af1a', 'bccf575d', '7a486251', 'ef65bb93', 'd164978c', 'f76bad3e', '45d5a21',
    '6b52c39f', '96d9f4cc', 'c33e4a93', 'ae6faac2', 'c6e793e4', '58ecc2a9', '9e030ed6', '8ca5a9af', 'cf3f1495', '3de002bd',
  ],
};

const tac = Object.fromEntries(EK.map((c) => [c.id, createTactics(sq[c.id])]));
const side = (id, extra = {}) => ({ club: clubById(id), squad: sq[id], tactics: tac[id], ai: false, coach: clubById(id).coach, ...extra });
const withPI = (id, playerInstr, extra = {}) => side(id, { tactics: { ...tac[id], playerInstr }, ...extra });
const slotOf = (id, pid) => formationById(tac[id].formation).slots[tac[id].xi.indexOf(pid)];

test('Złoty test: bez instrukcji indywidualnych dziennik zdarzeń i stan RNG jak przed zmianą (50 + 50 meczów)', () => {
  assert.deepEqual(goldenHashes('user'), GOLD.user, 'mecze bez AI, ze zmianą instrukcji drużyny w 30. min');
  AI_RULES.softTackleBooked = false; // reguła AI v1 to celowa zmiana zachowania trenera AI
  try { assert.deepEqual(goldenHashes('ai'), GOLD.ai, 'mecze AI bez nowej reguły'); } finally { AI_RULES.softTackleBooked = true; }
});

test('Instrukcja równa instrukcji drużyny nic nie zmienia; instrukcje nie zużywają RNG meczu przy tworzeniu', () => {
  const pid = tac.legia.xi[3];
  const level = teamLevel('tackle', tac.legia.instructions); // 0: normalny odbiór
  assert.equal(level, 0);
  for (const seed of ['eq1', 'eq2', 'eq3']) {
    const a = createMatch({ seed, home: side('legia'), away: side('lech') });
    const b = createMatch({ seed, home: withPI('legia', { [pid]: { tackle: 1, press: 1 } }), away: side('lech') });
    assert.equal(a.rng.state, b.rng.state, 'tworzenie meczu z instrukcjami bez losowań z RNG meczu');
    runToEnd(a);
    const c = createMatch({ seed, home: withPI('legia', { [tac.legia.xi[0]]: { tackle: 0 } }), away: side('lech') });
    runToEnd(c);
    assert.equal(matchHash(c), matchHash(a), 'pusta instrukcja: identyczny mecz');
  }
});

test('Determinizm: to samo ziarno i te same instrukcje dają identyczny mecz', () => {
  const pi = allEligible(tac.legia, 'press', 1);
  const run = () => { const M = createMatch({ seed: 'det-pi', home: withPI('legia', pi), away: withPI('lech', allEligible(tac.lech, 'run', 1)) }); runToEnd(M); return M; };
  const a = run(); const b = run();
  assert.equal(matchHash(a), matchHash(b));
  assert.deepEqual(a.teams[0].piReport, b.teams[0].piReport);
});

test('Osobne strumienie: jakość zawodnika zależy tylko od meczu, strony i zawodnika', () => {
  const [p1, p2] = [tac.legia.xi[5], tac.legia.xi[6]];
  const qOf = (pi, seed = 'str1') => {
    const M = createMatch({ seed, home: withPI('legia', pi), away: side('lech') });
    return M.teams[0].piReport[p1].press.q;
  };
  const alone = qOf({ [p1]: { press: 1 } });
  assert.equal(qOf({ [p1]: { press: 1 }, [p2]: { press: 1, tackle: 1 } }), alone, 'inni zawodnicy z instrukcjami nie zmieniają jakości');
  assert.notEqual(qOf({ [p1]: { press: 1 } }, 'str2'), alone, 'inny mecz: inna dyspozycja');
});

test('Jakość wykonania: średnio 0.9-1.0, zakres 0.6-1.2, inteligencja ok. 50-60 % zmienności, mądrzejsi wyżej', () => {
  const ids = CLUBS_PL.filter((c) => c.tier <= 2).map((c) => c.id);
  for (const id of ['pass', 'tackle', 'run']) {
    const rows = [];
    for (const cid of ids) {
      for (const p of squadOf(world, cid)) {
        for (let s = 0; s < 3; s++) {
          const r = new Rng(`df:${p.id}:${s}`);
          const x = { id: p.id, p, dayForm: r.gauss(0, Math.max(0.2, 0.9 - 0.035 * (p.hidden?.KON ?? 10))) };
          const T = { piSeed: `q${s}`, side: 0, piCtx: { ctx: { weather: {}, rank: 0 } }, takers: {} };
          let I = 0; for (const [k, w] of Object.entries(PI.intel[id])) I += w * (p.attr?.[k] ?? 10);
          rows.push([I, qualityOf(T, x, id, 1)]);
        }
      }
    }
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const qs = rows.map((r) => r[1]); const Is = rows.map((r) => r[0]);
    const mq = mean(qs); const mI = mean(Is);
    const sq2 = mean(qs.map((v) => (v - mq) ** 2)); const sI2 = mean(Is.map((v) => (v - mI) ** 2));
    const r2 = mean(rows.map(([i, q]) => (i - mI) * (q - mq))) ** 2 / (sq2 * sI2);
    assert.ok(mq >= 0.9 && mq <= 1.0, `${id}: średnia q ${mq}`);
    assert.ok(Math.min(...qs) >= 0.6 && Math.max(...qs) <= 1.2, `${id}: zakres`);
    assert.ok(r2 >= 0.45 && r2 <= 0.65, `${id}: udział inteligencji ${r2}`);
    const sd = Math.sqrt(sI2);
    const hi = mean(rows.filter((r) => r[0] >= mI + sd).map((r) => r[1])); const lo = mean(rows.filter((r) => r[0] <= mI - sd).map((r) => r[1]));
    assert.ok(hi > lo + 0.15, `${id}: mądrzy ${hi}, słabsi ${lo}`);
  }
});

test('Konflikt z planem drużyny: średnio lekka kara (od -0,03 do 0), ok. 25-30 % bonusu, lider częściej na plus', () => {
  const us = []; const lid = []; const fresh = [];
  for (const cid of CLUBS_PL.filter((c) => c.tier === 1).map((c) => c.id)) {
    for (const p of squadOf(world, cid)) {
      for (let s = 0; s < 4; s++) {
        const T = { piSeed: `c${s}`, side: 0, piCtx: { ctx: { weather: {}, date: '2026-09-01' }, teamMorale: 12, repHi: 1000, minHi: 0 }, takers: {} };
        const x = { id: p.id, p };
        us.push(conflictOf(T, x, 'tackle'));
        lid.push(conflictOf(T, { id: p.id, p: { ...p, persona: 'Lider', age: 30, lastMove: null } }, 'tackle'));
        fresh.push(conflictOf(T, { id: p.id, p: { ...p, persona: 'Wrażliwy', age: 19, lastMove: '2026-08-15', morale: 7 } }, 'tackle'));
      }
    }
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const pos = us.filter((u) => u > 0).length / us.length;
  assert.ok(mean(us) >= -0.03 && mean(us) <= 0, `średnio ${mean(us)}`);
  assert.ok(pos >= 0.22 && pos <= 0.34, `bonus w ${pos}`);
  assert.ok(Math.min(...us, ...lid, ...fresh) >= -0.15 - 1e-12 && Math.max(...us, ...lid, ...fresh) <= 0.1 + 1e-12);
  assert.ok(mean(lid) > mean(us) && mean(us) > mean(fresh), `lider ${mean(lid)}, zwykły ${mean(us)}, nowy młody ${mean(fresh)}`);
  const T = { piCtx: { ctx: {} }, takers: { captain: 'k' } };
  assert.ok(statusOf(T, { id: 'k', p: { persona: 'Lider' } }) > statusOf(T, { id: 'n', p: { age: 19, morale: 6 } }));
});

test('10 zawodników z tą samą instrukcją = instrukcja drużyny (parametry silnika, 1e-9)', () => {
  const f = formationById('4231');
  const cases = [
    ['pass', 'passing', 'mixed', 'short'], ['pass', 'passing', 'mixed', 'long'], ['pass', 'passing', 'short', 'long'],
    ['tackle', 'tackling', 'normal', 'hard'], ['tackle', 'tackling', 'hard', 'soft'], ['press', 'pressing', 'mid', 'high'], ['press', 'pressing', 'high', 'low'],
  ];
  for (const [id, team, from, to] of cases) {
    const def = PLAYER_INSTRUCTIONS.find((d) => d.id === id);
    const P0 = tacticParams(f, { [team]: from, pressing: team === 'pressing' ? from : 'high', marking: 'man' });
    const P1 = tacticParams(f, { [team]: to, pressing: team === 'pressing' ? to : 'high', marking: 'man' });
    const entries = Array.from({ length: 10 }, () => ({ id, lv: def.team.levels[to], tl: def.team.levels[from], b: 1, c: 1, pw: 1 }));
    const P = applyShift(P0, teamShift(entries), {});
    for (const [k, v] of Object.entries(P1)) {
      if (PI.perPlayer.has(k) || typeof v !== 'number') continue;
      assert.ok(Math.abs(P[k] - v) < 1e-9, `${id} ${from}->${to}: ${k} ${P[k]} != ${v}`);
    }
    for (const g of ['act', 'oppAct']) for (const [t, v] of Object.entries(P1[g])) assert.ok(Math.abs(P[g][t] - v) < 1e-9, `${id}: ${g}.${t}`);
  }
});

test('Kierunek efektów każdej instrukcji (A/B na tych samych ziarnach, 300 meczów)', () => {
  const N = 300;
  const base = abRun(N, null);
  const d = (v) => { const a = abMetrics(base, v); const b = abMetrics(abRun(N, v), v); return Object.fromEntries(Object.keys(a).map((k) => [k, b[k] - a[k]])); };
  const expect = {
    'pass:-1': (x) => x.poss > 1.5 && x.acc > 1.5,
    'pass:1': (x) => x.acc < -3 && x.poss < -1.5 && x.condI > 0.3,
    'dribble:-1': (x) => x.acc > 0.2 && x.konA < 0,
    'dribble:1': (x) => x.acc < -0.6 && x.condI < -0.3 && x.konA > 0,
    'shoot:-1': (x) => x.dysI < -0.4,
    'shoot:1': (x) => x.dysI > 0.4,
    'cross:-1': (x) => x.kpI < -0.1 && x.condI > 0.2,
    'cross:1': (x) => x.kpI > 0.15 && x.condI < -0.3,
    'tackle:-1': (x) => x.foulI < -0.6 && x.ycI < -0.2,
    'tackle:1': (x) => x.foulI > 1 && x.ycI > 0.25 && x.shA < 0,
    'run:-1': (x) => x.condI > 0.5 && x.offI < 0 && x.shA < 0,
    'run:1': (x) => x.condI < -0.8 && x.offI > 0 && x.konA > 0.15 && x.sh > 0.5,
    'press:-1': (x) => x.condI > 1 && x.poss < -1,
    'press:1': (x) => x.condI < -2 && x.poss > 1,
  };
  for (const def of PLAYER_INSTRUCTIONS) {
    for (const o of def.options) {
      const key = `${def.id}:${o.v}`;
      const x = d([def.id, o.v]);
      assert.ok(expect[key](x), `${key}: ${JSON.stringify(Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Math.round(v * 1000) / 1000])))}`);
    }
  }
});

test('Zapis taktyki: pole przechodzi przez createTactics, refreshTactics i dzień meczowy; stare zapisy bez pola', () => {
  const squad = sq.legia;
  const [a, b] = [squad[2].id, squad[7].id];
  const pi = { [a]: { tackle: -1, bad: 3 }, [b]: { run: 1 }, 'obcy-1': { press: 1 } };
  const t = createTactics(squad, { playerInstr: pi });
  assert.deepEqual(t.playerInstr, { [a]: { tackle: -1 }, [b]: { run: 1 } }, 'tylko znane instrukcje i zawodnicy z kadry');
  assert.deepEqual(createTactics(squad).playerInstr, {});
  const old = { ...t }; delete old.playerInstr;
  assert.deepEqual(refreshTactics(old, squad).tactics.playerInstr, {}, 'stary zapis: brak instrukcji');
  // Kontuzjowany zostaje (wraca do gry z instrukcją), odchodzący z klubu znika
  const injured = squad.map((p) => (p.id === a ? { ...p, injuryDays: 10 } : p)).filter((p) => p.id !== b);
  assert.deepEqual(refreshTactics(t, injured).tactics.playerInstr, { [a]: { tackle: -1 } });
  const game = { tactics: t };
  assert.deepEqual(matchTactics(game, squad, 12).playerInstr, t.playerInstr, 'dzień meczowy (skład gracza)');
  const game2 = { tactics: { ...t, assistant: true } };
  assert.deepEqual(matchTactics(game2, squad, 12).playerInstr, t.playerInstr, 'dzień meczowy (skład wybiera asystent)');
  assert.deepEqual(cleanPlayerInstrMap({ x: { pass: 0, dribble: null } }), {});
  assert.ok(piAllowed('pass', 'BR') && !piAllowed('tackle', 'BR') && !piAllowed('cross', 'ŚO') && piAllowed('run', 'DP'));
});

test('Zmiana w meczu: walidacja, koszt zgrania, przerwa bez kosztu, bez nowych losowań i bez dryfu RNG', () => {
  const M = createMatch({ seed: 'chg', home: side('legia'), away: side('lech') });
  while (M.minute < 20) step(M);
  const T = M.teams[0];
  const def = fieldPlayers(T).filter((x) => x.slot.pos === 'ŚO');
  const st = M.rng.state; const n = M.events.length;
  const bad = [
    [{ playerInstr: { nikt: { tackle: -1 } } }, /kadrze/],
    [{ playerInstr: { [def[0].id]: { lot: 1 } } }, /Nieznana/],
    [{ playerInstr: { [def[0].id]: { tackle: 2 } } }, /wartość/],
    [{ playerInstr: { [def[0].id]: { cross: 1 } } }, /pozycji/],
    [{ playerInstr: [1] }, /Nieprawidłowe/],
  ];
  for (const [patch, re] of bad) {
    assert.match(checkTacticPatch(M, 0, patch), re);
    const r = changeTactics(M, 0, patch);
    assert.equal(r.ok, false);
  }
  assert.equal(M.events.length, n, 'błędna zmiana: bez zdarzeń');
  const S0 = T.S;
  const r = changeTactics(M, 0, { playerInstr: { [def[0].id]: { tackle: -1 }, [def[1].id]: { tackle: -1, press: 1 } } });
  assert.ok(r.ok);
  assert.equal(r.cost, 4, '2 za zawodnika');
  assert.equal(T.S, S0 - 4);
  assert.equal(M.rng.state, st, 'zmiana instrukcji nie losuje z RNG meczu');
  const e = M.events[M.events.length - 1];
  assert.equal(e.type, 'tactic');
  assert.match(e.text, /instrukcje indywidualne/);
  assert.match(e.text, /odbiór łagodny/);
  step(M);
  const draw = def[0].piDraw; const q0 = T.piReport[def[0].id].tackle.q;
  assert.ok(draw && def[0].pi.foulW < 1, 'łagodny odbiór: rzadziej fauluje');
  // Powrót i ponowne ustawienie: ta sama jakość (zapisane losowania), koszt do 6
  while (M.minute < 32) step(M);
  const r2 = changeTactics(M, 0, { playerInstr: { [def[0].id]: null, [def[1].id]: { press: 0 } } });
  assert.ok(r2.ok && r2.cost === 4);
  assert.deepEqual(T.tactics.playerInstr, { [def[1].id]: { tackle: -1 } });
  const many = Object.fromEntries(fieldPlayers(T).filter((x) => x.slot.pos !== 'BR').slice(0, 5).map((x) => [x.id, { press: -1 }]));
  while (M.minute < 44) step(M);
  assert.equal(changeTactics(M, 0, { playerInstr: many }).cost, 6, 'najwyżej 6');
  while (M.phase !== 'break') step(M);
  const Sb = T.S;
  const r3 = changeTactics(M, 0, { playerInstr: { [def[0].id]: { tackle: -1 } } });
  assert.equal(T.S, Sb, 'w przerwie bez kosztu');
  assert.ok(r3.ok);
  resume(M); step(M);
  assert.equal(def[0].piDraw, draw, 'bez nowego losowania');
  assert.equal(T.piReport[def[0].id].tackle.q, q0, 'ta sama jakość');
  // Wszystko jak drużyna: silnik wraca do stanu bez instrukcji
  changeTactics(M, 0, { playerInstr: Object.fromEntries(Object.keys(T.tactics.playerInstr).map((id) => [id, null])) });
  assert.equal(T.piOn, false);
  assert.ok(T.players.every((x) => !x.pi));
});

test('Ukryta jakość: q i konflikt nie trafiają do zdarzeń ani wyniku', () => {
  const M = createMatch({ seed: 'hid', home: withPI('legia', allEligible(tac.legia, 'tackle', 1), { teamMorale: 8 }), away: side('lech'), ctx: { rank: 2, weather: { type: 'deszcz', dys: 1.15, foul: 1.08 }, date: '2026-10-01' } });
  const r = runToEnd(M);
  assert.ok(Object.keys(M.teams[0].piReport).length >= 8);
  const json = JSON.stringify(r) + JSON.stringify(M.events);
  assert.ok(!/piReport|"q":|conflict|jakość/i.test(json));
  assert.ok(result(M).ratings.length > 0);
});

test('Młody w konflikcie z planem lekko obniża zgranie drużyny; kapitan nie', () => {
  const t = { ...tac.legia, instructions: { ...tac.legia.instructions, tackling: 'hard' } };
  const pid = t.xi.find((id) => id !== t.captain && slotOf('legia', id)?.pos === 'ŚO');
  const young = sq.legia.map((p) => (p.id === pid ? { ...p, age: 19, persona: 'Spokojny', rep: 0 } : p));
  const mk = (who) => createMatch({ seed: 'coh', home: { club: clubById('legia'), squad: young, tactics: { ...t, playerInstr: { [who]: { tackle: -1 } } }, ai: false }, away: side('lech') });
  assert.equal(mk(pid).teams[0].sCap, 100 - PI.cohesion);
  assert.equal(mk(t.captain).teams[0].sCap, 100);
});

test('AI v1: obrońca z żółtą kartką od 60. minuty gra łagodnie w odbiorze (ta sama ścieżka changeTactics)', () => {
  let individual = 0;
  for (const seed of ['ai1', 'ai2', 'ai3', 'ai4', 'ai5', 'ai6']) {
    const M = createMatch({ seed, home: side('legia', { ai: true }), away: side('lech', { ai: true }) });
    while (M.minute < 58 && !M.ended) { if (M.phase === 'break') resume(M); else step(M); }
    const T = M.teams[0];
    const x = fieldPlayers(T).find((y) => y.slot.pos === 'ŚO' && !y.yc);
    if (!x) continue;
    x.yc = 1;
    while (M.minute < 61 && !M.ended) { if (M.phase === 'break') resume(M); else step(M); }
    if (!x.on || x.subbedOff || x.sentOff) continue; // trener mógł go zmienić (zagrożony drugą żółtą)
    const soft = T.tactics.instructions.tackling === 'soft' || T.tactics.playerInstr[x.id]?.tackle === -1;
    assert.ok(soft, `${seed}: ${x.id} bez łagodnego odbioru`);
    if (T.tactics.playerInstr[x.id]?.tackle === -1) {
      individual++;
      assert.ok(M.events.some((e) => e.type === 'tactic' && e.side === 0 && e.patch.playerInstr?.[x.id] && e.by === 'ai'));
    }
  }
  assert.ok(individual >= 2, `instrukcja indywidualna w ${individual} meczach`);
});

test('Wydajność: instrukcje prawie nie spowalniają meczu (poniżej 10 ms na mecz jak test silnika)', () => {
  const pi = { ...allEligible(tac.legia, 'press', 1), ...allEligible(tac.legia, 'run', 1) };
  for (const id of Object.keys(pi)) pi[id] = { ...pi[id], tackle: 1, pass: -1 };
  const piB = allEligible(tac.lech, 'dribble', 1);
  const time = (withInstr) => {
    const t0 = performance.now();
    for (let i = 0; i < 40; i++) {
      runToEnd(createMatch({ seed: `perfpi${i}`, home: withInstr ? withPI('legia', pi, { ai: true }) : side('legia', { ai: true }), away: withInstr ? withPI('lech', piB, { ai: true }) : side('lech', { ai: true }) }));
    }
    return (performance.now() - t0) / 40;
  };
  time(true); time(false); // rozgrzewka
  // Najlepszy z trzech pomiarów na przemian (pełny npm test obciąża procesor); próg 10 ms sprawdza test silnika
  let a = Infinity; let b = Infinity;
  for (let k = 0; k < 3; k++) { a = Math.min(a, time(false)); b = Math.min(b, time(true)); }
  assert.ok(b < a * 1.3 + 1, `${b.toFixed(1)} ms z instrukcjami, ${a.toFixed(1)} ms bez`);
});
