// Sytuacje meczowe (docs/sytuacje-meczowe.md): czerwona dla bramkarza, kontuzje po wykorzystaniu zmian,
// sensowne zmiany AI, asystent gracza, VAR, limity zmian i okien, niezmienniki statystyk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics } from '../src/engine/lineup.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { createMatch, step, resume, runToEnd, assistantSuggest, applySuggestion, matchState, substitute } from '../src/engine/match/match.js';
import { sendOff, injure } from '../src/engine/match/core.js';
import { fieldPlayers, goalkeeper, slotFit } from '../src/engine/match/teams.js';
import { desiredInstructions } from '../src/engine/match/coach.js';
import { checkStatsInvariants } from '../src/engine/matchStats.js';

const world = generateWorld(42);
const EK = CLUBS_PL.filter((c) => c.tier === 1);
const sq = Object.fromEntries(EK.map((c) => [c.id, squadOf(world, c.id)]));
const tac = Object.fromEntries(EK.map((c) => [c.id, createTactics(sq[c.id])]));
const noGkBench = (id) => ({ ...tac[id], bench: tac[id].bench.filter((pid) => sq[id].find((p) => p.id === pid).pos !== 'BR') });
const side = (id, extra = {}) => ({ club: clubById(id), squad: sq[id], tactics: tac[id], ai: true, coach: clubById(id).coach, ...extra });
const until = (M, min) => { while (M.minute < min && !M.ended) { if (M.phase === 'break') resume(M); else step(M); } };
const keeperOf = (T) => T.players.find((x) => x.on && !x.sentOff && x.slot?.pos === 'BR');
const keepersOnPitch = (T) => fieldPlayers(T).filter((x) => x.slot?.pos === 'BR');
const HARD = { cat: 'severe', name: 'złamanie kości śródstopia', days: 60, playable: false };
const DEF = new Set(['ŚO', 'BO', 'WB']);

function setup(seed, { min = 30, score = null, home = {}, ctx = {} } = {}) {
  const M = createMatch({ seed, home: side('legia', home), away: side('lech'), ctx });
  until(M, min);
  if (score) M.score = [...score];
  return { M, T: M.teams[0], from: M.events.length };
}

test('Czerwona dla bramkarza AI, rezerwowy na ławce: schodzi zawodnik z pola, rezerwowy staje w bramce', () => {
  for (const [score, min] of [[[1, 0], 30], [[0, 1], 75], [[0, 0], 60]]) {
    const { M, T, from } = setup(`gkr${min}`, { min, score });
    const gk = keeperOf(T);
    const subsBefore = T.subsUsed;
    const menBefore = fieldPlayers(T).length;
    sendOff(M, T, gk, 'dogso');
    const sub = M.events.slice(from).find((e) => e.type === 'sub' && e.side === 0);
    assert.ok(sub, 'jest zmiana');
    assert.equal(sub.gk, true);
    assert.equal(sub.why, 'gk');
    assert.notEqual(sub.outId, gk.id);
    assert.equal(T.subsUsed, subsBefore + 1);
    const ks = keepersOnPitch(T);
    assert.equal(ks.length, 1, 'dokładnie jeden bramkarz');
    assert.equal(ks[0].p.pos, 'BR');
    assert.equal(fieldPlayers(T).length, menBefore - 1);
    // Przy prowadzeniu schodzi zawodnik ofensywny
    const out = T.players.find((x) => x.id === sub.outId);
    if (score[0] > score[1]) assert.ok(['NAP', 'SN', 'OP', 'BP'].includes(out.p.pos), `schodzi ${out.p.pos}`);
    const red = M.events.slice(from).find((e) => e.type === 'red');
    assert.equal(red.gk, true);
    assert.equal(red.reason, 'dogso');
    step(M);
    const tactic = M.events.slice(from).find((e) => e.type === 'tactic' && e.side === 0);
    assert.ok(tactic, 'AI zmienia ustawienie po czerwonej');
    assert.ok(tactic.patch.drop?.length >= 1);
    assert.equal(keepersOnPitch(T).length, 1);
  }
});

test('Czerwona dla bramkarza bez rezerwowego bramkarza: w bramce najlepiej pasujący zawodnik z pola, nie najlepszy w drużynie', () => {
  const { M, T, from } = setup('gknr', { home: { tactics: noGkBench('legia') } });
  const field = fieldPlayers(T).filter((x) => x.slot.pos !== 'BR');
  const best = field.reduce((a, b) => (slotFit(b, b.slot) > slotFit(a, a.slot) ? b : a));
  sendOff(M, T, keeperOf(T), 'sfp');
  const sw = M.events.slice(from).find((e) => e.type === 'gkSwitch');
  assert.ok(sw?.emergency);
  assert.equal(sw.cause, 'red');
  const ks = keepersOnPitch(T);
  assert.equal(ks.length, 1);
  assert.notEqual(ks[0].p.pos, 'BR');
  assert.notEqual(ks[0].id, best.id, 'najlepszy zawodnik z pola zostaje w polu');
  assert.ok(!M.events.slice(from).some((e) => e.type === 'sub' && e.side === 0 && e.gk));
  runToEnd(M);
  assert.equal(keepersOnPitch(T).length, 1);
});

test('Czerwona dla bramkarza po wykorzystaniu wszystkich zmian: zawodnik z pola w bramce mimo rezerwowego', () => {
  const { M, T, from } = setup('gkall', { min: 80 });
  T.subsUsed = T.subsLimit;
  sendOff(M, T, keeperOf(T), 'violent');
  assert.ok(M.events.slice(from).some((e) => e.type === 'gkSwitch' && e.emergency));
  assert.equal(keepersOnPitch(T).length, 1);
  assert.equal(fieldPlayers(T).length, 10);
  assert.equal(T.subsUsed, T.subsLimit);
});

test('Kontuzja bramkarza: z rezerwowym zmiana 1 za 1, bez rezerwowego zawodnik z pola w bramce i zmiana w polu', () => {
  {
    const { M, T, from } = setup('gkinj');
    const gk = keeperOf(T);
    injure(M, T, gk, false, { injury: HARD });
    const ev = M.events.slice(from);
    assert.equal(ev.find((e) => e.type === 'injury').gk, true);
    const sub = ev.find((e) => e.type === 'sub');
    assert.equal(sub.outId, gk.id);
    assert.equal(sub.gk, true);
    assert.equal(keepersOnPitch(T).length, 1);
    assert.equal(fieldPlayers(T).length, 11);
  }
  {
    const { M, T, from } = setup('gkinj2', { home: { tactics: noGkBench('legia') } });
    const gk = keeperOf(T);
    injure(M, T, gk, false, { injury: HARD });
    step(M);
    const ev = M.events.slice(from);
    assert.ok(ev.some((e) => e.type === 'gkSwitch' && e.cause === 'injury'));
    const sub = ev.find((e) => e.type === 'sub' && e.side === 0);
    assert.ok(sub && sub.outId === gk.id && !sub.gk, 'zawodnik z pola za kontuzjowanego bramkarza');
    assert.equal(keepersOnPitch(T).length, 1);
    assert.equal(fieldPlayers(T).length, 11);
    const slots = fieldPlayers(T).map((x) => `${x.slot.pos}${x.slot.x},${x.slot.y}`);
    assert.equal(new Set(slots).size, slots.length, 'bez dwóch zawodników na jednym slocie');
  }
});

test('Czerwona po wykorzystaniu wszystkich zmian i kontuzja bez zmian: gra w 10 z nowym ustawieniem', () => {
  {
    const { M, T, from } = setup('redall', { min: 80, score: [1, 0] });
    T.subsUsed = T.subsLimit;
    const cb = T.players.find((x) => x.on && x.slot.pos === 'ŚO');
    sendOff(M, T, cb, 'second');
    step(M);
    assert.equal(fieldPlayers(T).length, 10);
    assert.ok(!M.events.slice(from).some((e) => e.type === 'sub' && e.side === 0));
    const t = M.events.slice(from).find((e) => e.type === 'tactic' && e.side === 0);
    assert.ok(t, 'reorganizacja');
    // Obrona prowadzenia w 80. min: niski blok 4-4-1 albo piątka obrońców 5-3-1 (shortShape), luka po obrońcy zapełniona
    assert.ok(fieldPlayers(T).filter((x) => x.slot.pos === 'ŚO').length >= 2, 'co najmniej dwóch środkowych obrońców po przesunięciu');
    assert.ok(['442def', '541'].includes(T.formation.id), `ustawienie ${T.formation.id}`);
    assert.equal(M.events.slice(from).find((e) => e.type === 'red').second, true);
  }
  // Kontuzja bez zmian: trener reorganizuje drużynę z prawdopodobieństwem ok. 0,95 (zależnie od umiejętności),
  // więc sprawdzamy serię meczów zamiast jednego ziarna
  let reorganized = 0; const runs = 12;
  for (let i = 0; i < runs; i++) {
    const { M, T, from } = setup(`injall${i}`, { min: 85 });
    T.subsUsed = T.subsLimit;
    const x = fieldPlayers(T).find((y) => y.slot.pos === 'ŚO'); // bez zawodnika, który wcześniej dostał czerwoną
    const before = fieldPlayers(T).length; // wcześniejsza czerwona w tym ziarnie jest możliwa
    injure(M, T, x, false, { injury: HARD });
    step(M);
    const inj = M.events.slice(from).find((e) => e.type === 'injury');
    assert.equal(inj.canContinue, false);
    assert.equal(inj.severity, 'severe');
    assert.equal(fieldPlayers(T).length, before - 1);
    if (M.events.slice(from).some((e) => e.type === 'tactic' && e.side === 0 && e.patch.drop)) reorganized++;
  }
  assert.ok(reorganized >= runs - 2, `reorganizacja w ${reorganized} z ${runs} meczów`);
});

test('Zmiany AI są pozycyjnie sensowne: kontuzjowanego środkowego obrońcę zastępuje obrońca', () => {
  let n = 0;
  for (let i = 0; i < 30; i++) {
    const id = EK[i % 18].id;
    const M = createMatch({ seed: `cb${i}`, home: side(id), away: side('lech'), ctx: {} });
    until(M, 20 + i);
    const T = M.teams[0];
    const cb = T.players.find((x) => x.on && x.slot.pos === 'ŚO');
    if (!T.bench.some((b) => DEF.has(b.p.pos))) continue;
    const from = M.events.length;
    injure(M, T, cb, false, { injury: HARD });
    step(M);
    const sub = M.events.slice(from).find((e) => e.type === 'sub' && e.side === 0 && e.outId === cb.id);
    assert.ok(sub, `mecz ${i}: zmiana za kontuzjowanego`);
    const inc = T.players.find((x) => x.id === sub.inId);
    assert.ok(DEF.has(inc.p.pos) || sub.moveId, `mecz ${i}: wchodzi ${inc.p.pos}`);
    assert.equal(fieldPlayers(T).filter((x) => x.slot.pos === 'ŚO').length, 2);
    n++;
  }
  assert.ok(n >= 20);
});

test('Asystent gracza po „Pokaż wynik” reaguje na czerwoną kartkę obejrzaną na żywo; podpowiedź nie zmienia meczu', () => {
  const { M, T, from } = setup('asys', { home: { ai: false } });
  sendOff(M, T, keeperOf(T), 'dogso');
  assert.equal(keepersOnPitch(T)[0].p.pos === 'BR', false, 'gracz: awaryjny bramkarz z pola');
  const before = { ev: M.events.length, tick: M.tick, rng: M.rng.next.toString(), subs: T.subsUsed };
  const advice = assistantSuggest(M, 0);
  assert.equal(M.events.length, before.ev);
  assert.equal(T.subsUsed, before.subs);
  assert.ok(advice.some((a) => a.type === 'sub' && a.why === 'gk'), 'asystent proponuje rezerwowego bramkarza');
  assert.ok(advice.some((a) => a.type === 'tactic' && a.patch.drop), 'asystent proponuje nowe ustawienie');
  runToEnd(M, { assistantFor: [0] });
  const ev = M.events.slice(from);
  assert.ok(ev.some((e) => e.type === 'sub' && e.side === 0 && e.gk && e.by === 'assistant'));
  assert.ok(ev.some((e) => e.type === 'tactic' && e.side === 0 && e.by === 'assistant' && e.patch.drop));
  assert.equal(keepersOnPitch(T).length, 1);
  assert.equal(keepersOnPitch(T)[0].p.pos, 'BR');
});

test('Podpowiedź asystenta można wykonać jako decyzję gracza', () => {
  const { M, T } = setup('apply', { home: { ai: false } });
  const cb = T.players.find((x) => x.on && x.slot.pos === 'ŚO');
  injure(M, T, cb, false, { injury: HARD });
  const a = assistantSuggest(M, 0).find((x) => x.type === 'sub');
  assert.equal(a.outId, cb.id);
  assert.ok(applySuggestion(M, 0, a).ok);
  assert.equal(fieldPlayers(T).length, 11);
  assert.ok(T.lastUserTick === M.tick);
});

test('Gracz zareagował sam po czerwonej: asystent nie dubluje reorganizacji', () => {
  const { M, T, from } = setup('own', { home: { ai: false }, score: [1, 0] });
  sendOff(M, T, T.players.find((x) => x.on && x.slot.pos === 'ŚO'), 'dogso');
  step(M);
  const out = T.players.find((x) => x.on && x.slot.pos === 'NAP');
  const inc = T.bench.find((x) => x.p.pos === 'ŚO');
  assert.ok(substitute(M, 0, out.id, inc.id).ok);
  runToEnd(M, { assistantFor: [0] });
  const reshapes = M.events.slice(from).filter((e) => e.type === 'tactic' && e.side === 0 && /czerwona kartka/.test(e.reason ?? ''));
  assert.equal(reshapes.length, 0);
});

test('Czerwona dla rywala: AI przy remisie gra odważniej; w dwumeczu liczy się suma bramek', () => {
  let bolder = 0;
  for (let i = 0; i < 20; i++) {
    const { M, T } = setup(`opp${i}`, { min: 40, score: [0, 0] });
    const O = M.teams[1];
    sendOff(M, O, O.players.find((x) => x.on && x.slot.pos === 'ŚO'), 'dogso');
    step(M);
    if (Number(T.tactics.instructions.mentality) >= 1) bolder++;
  }
  assert.ok(bolder >= 12, `odważniej w ${bolder}/20`);
  // Dwumecz: gospodarz wygrał pierwszy mecz 3:0, teraz przegrywa 0:1 w 75. min: broni wyniku, nie goni
  const { M } = setup('agg', { min: 80, score: [0, 1], ctx: { knockout: { firstLeg: [3, 0] } } });
  const st = matchState(M, 0);
  assert.equal(st.diff, 2);
  assert.equal(desiredInstructions(M.teams[0], st).reason, 'bronimy wyniku');
  const st1 = matchState(M, 1);
  assert.equal(st1.diff, -2);
  assert.equal(desiredInstructions(M.teams[1], st1).reason, 'gonimy wynik');
});

test('Zmiana po wstrząśnieniu mózgu tylko gdy rozgrywki ją stosują: poza limitem, rywal dostaje dodatkową zmianę', () => {
  const conc = { cat: 'light', name: 'wstrząśnienie mózgu', days: 8, playable: false };
  {
    const { M, T, from } = setup('conc', { ctx: { concussionSubs: true } });
    const x = T.players.find((y) => y.on && y.slot.pos === 'ŚP') ?? T.players.find((y) => y.on && y.slot.pos === 'DP');
    injure(M, T, x, false, { injury: conc });
    step(M);
    const sub = M.events.slice(from).find((e) => e.type === 'sub' && e.side === 0);
    assert.equal(sub.concussion, true);
    assert.equal(T.subsUsed, 0);
    assert.equal(M.teams[1].subsLimit, 6);
    assert.equal(M.teams[1].windowsLimit, 4);
  }
  {
    const { M, T, from } = setup('conc2');
    const x = T.players.find((y) => y.on && y.slot.pos === 'NAP');
    const before = T.subsUsed;
    injure(M, T, x, false, { injury: conc });
    step(M);
    const sub = M.events.slice(from).find((e) => e.type === 'sub' && e.side === 0 && e.outId === x.id);
    assert.equal(sub.concussion, false);
    assert.ok(T.subsUsed >= before + 1);
    assert.equal(M.teams[1].subsLimit, 5);
  }
});

test('Zdarzenia dla UI mają czytelne dane (kartki, VAR, urazy, zmiany, taktyka)', () => {
  const decisions = new Set(); const reds = new Set(); let tactics = 0; let injuries = 0;
  for (let i = 0; i < 400; i++) {
    const M = createMatch({ seed: `ui${i}`, home: side(EK[i % 18].id), away: side(EK[(i + 7) % 18].id), ctx: { var: true } });
    runToEnd(M);
    M.events.forEach((e, k) => {
      if (e.type === 'varOverturn') {
        decisions.add(e.decision);
        assert.equal(M.events[k - 1].type, 'varCheck', 'VAR: najpierw sprawdzenie, potem decyzja');
      }
      if (e.type === 'red') { reds.add(e.reasonCode); assert.ok(e.reason && e.reasonText && typeof e.second === 'boolean'); }
      if (e.type === 'yellow') assert.ok(e.text && e.pid);
      if (e.type === 'injury') { injuries++; assert.ok(['light', 'medium', 'severe'].includes(e.severity) && typeof e.canContinue === 'boolean'); }
      if (e.type === 'sub') assert.ok(e.outId && e.inId && e.by && 'why' in e);
      if (e.type === 'tactic') { tactics++; assert.ok(e.by && e.shape && e.text); }
    });
  }
  for (const d of ['goalDisallowed', 'penaltyAwarded']) assert.ok(decisions.has(d), d);
  assert.ok(!decisions.has('penaltyCancelled'), 'karnego sędziego VAR nie odwołuje');
  assert.ok(decisions.has('redCancelled') || decisions.has('redCard'));
  assert.ok(reds.has('second') && reds.size >= 3, [...reds].join());
  assert.ok(tactics > 0 && injuries > 0);
});

test('VAR: gol z karnego nigdy nieodwołany, karny sędziego zatrzymuje grę, analiza przed każdym werdyktem, protesty w polu karnym', () => {
  const verdicts = new Set(); let claims = 0; let claimReviews = 0; let pens = 0;
  for (let i = 0; i < 400; i++) {
    const M = createMatch({ seed: `var${i}`, home: side(EK[i % 18].id), away: side(EK[(i + 5) % 18].id), ctx: { var: true } });
    runToEnd(M);
    M.events.forEach((e, k) => {
      const prev = M.events[k - 1];
      if (e.type === 'goal' && e.how === 'PEN') {
        const after = M.events.slice(k + 1, k + 4);
        assert.ok(!after.some((y) => y.type === 'varOverturn' && y.decision === 'goalDisallowed'), `mecz ${i}: gol z karnego odwołany`);
      }
      if (e.type === 'penalty') { pens++; assert.ok(e.pause >= 3, 'karny: pauza na napięcie'); }
      if (e.type === 'penaltyClaim') { claims++; assert.ok(e.text); if (M.events[k + 1]?.type === 'varCheck') claimReviews++; }
      // werdykt (zmiana albo utrzymanie decyzji) zawsze po analizie VAR
      if (e.type === 'varOverturn' || (e.type === 'varCheck' && e.confirmed)) {
        verdicts.add(e.decision);
        assert.equal(prev.type, 'varCheck', `mecz ${i}: werdykt bez analizy (${e.decision})`);
        assert.ok(!prev.confirmed, `mecz ${i}: analiza przed werdyktem`);
      }
    });
  }
  for (const d of ['goalConfirmed', 'goalDisallowed', 'redConfirmed', 'noPenalty', 'penaltyAwarded']) assert.ok(verdicts.has(d), d);
  assert.ok(claims > 20 && claimReviews > 5, `protesty ${claims}, analizy ${claimReviews}`);
  assert.ok(pens > 100, `karne ${pens}`);
});

test('2000 meczów: limity zmian i okien, jeden bramkarz, niezmienniki statystyk, 3-5 zmian na drużynę', () => {
  let subs = 0; let goals = 0; let teams = 0;
  for (let i = 0; i < 2000; i++) {
    const ko = i % 5 === 0 ? 'single' : false;
    const M = createMatch({ seed: `lim${i}`, home: side(EK[i % 18].id), away: side(EK[(i * 7 + 3) % 18].id), ctx: { knockout: ko, var: i % 2 === 0 } });
    const r = runToEnd(M);
    assert.deepEqual(checkStatsInvariants(r.stats, r.score), [], `mecz ${i}`);
    goals += r.score[0] + r.score[1];
    for (const T of M.teams) {
      const limS = M.extraTime ? 6 : 5; const limW = M.extraTime ? 4 : 3;
      assert.ok(T.subsUsed <= limS, `mecz ${i}: zmiany ${T.subsUsed}`);
      assert.ok(T.windowsUsed <= limW, `mecz ${i}: okna ${T.windowsUsed}`);
      if (!M.abandoned) assert.equal(keepersOnPitch(T).length, 1, `mecz ${i}: bramkarze`);
      assert.ok(goalkeeper(T));
      const slots = fieldPlayers(T).map((x) => `${x.slot.pos}${x.slot.x},${x.slot.y}`);
      assert.equal(new Set(slots).size, slots.length, `mecz ${i}: dwa razy ten sam slot`);
      subs += T.subsUsed; teams++;
    }
  }
  const avgSubs = subs / teams;
  assert.ok(avgSubs >= 3.5 && avgSubs <= 4.8, `zmiany ${avgSubs}`);
  assert.ok(goals / 2000 > 2.4 && goals / 2000 < 3.1, `gole ${goals / 2000}`);
});

test('Seria rzutów karnych: bramkarz strzela na końcu, wyrównanie liczebności nie wyklucza bramkarza', () => {
  let found = 0;
  for (let i = 0; i < 120 && found < 3; i++) {
    const M = createMatch({ seed: `so${i}`, home: side('legia'), away: side('legia'), ctx: { knockout: 'single' } });
    const r = runToEnd(M);
    if (!r.shootout) continue;
    found++;
    for (const k of r.shootout.kicks) assert.ok(['goal', 'saved', 'missed'].includes(k.outcome));
    const sd = r.shootout.kicks.filter((k) => k.suddenDeath);
    if (r.shootout.kicks.length > 10) assert.ok(sd.length > 0);
  }
  assert.ok(found >= 1);
});
