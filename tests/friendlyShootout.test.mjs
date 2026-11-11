// Sparingi i seria rzutów karnych (docs/sparingi-i-karne.md): zasady sparingu (rozstrzygnięcie remisu, zmiany bez
// limitu i rotacyjne), zmiany AI w przerwie sparingu, kolejność strzelców w serii, pauza przed serią, determinizm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics } from '../src/engine/lineup.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import {
  createMatch, step, resume, runToEnd, substitute, canSubstitute, subsAvailable, assistantSuggest, playerStates,
  matchRules, setShootoutOrder, shootoutCandidates, startShootout, result,
} from '../src/engine/match/match.js';
import { fieldPlayers, goalkeeper } from '../src/engine/match/teams.js';
import { injure } from '../src/engine/match/core.js';

const world = generateWorld(42);
const EK = CLUBS_PL.filter((c) => c.tier === 1);
const sq = Object.fromEntries(EK.map((c) => [c.id, squadOf(world, c.id)]));
const tac = (id, benchSize = 12) => createTactics(sq[id], { benchSize });
const side = (id, extra = {}) => ({ club: clubById(id), squad: sq[id], tactics: tac(id, extra.benchSize ?? 12), ai: true, coach: clubById(id).coach, ...extra });
const until = (M, min) => { while (M.minute < min && !M.ended) { if (M.phase === 'break') resume(M); else step(M); } };
const toHalfTime = (M) => { while (M.phase !== 'break' && !M.ended) step(M); };
/** Do końca meczu albo do pauzy przed serią rzutów karnych. */
const playToPrep = (M) => { let g = 0; while (!M.ended && M.phase !== 'shootoutPrep' && g++ < 400) { if (M.phase === 'break') resume(M); else step(M); } };
const friendly = (seed, rules, home = {}, away = {}) => createMatch({ seed, home: side('legia', home), away: side('lech', away), ctx: { friendlyRules: rules } });
const strip = (r) => JSON.stringify({ ...r, events: r.events.filter((e) => e.type !== 'shootoutPrep') });

/** Pierwszy mecz pucharowy (Legia z Legią, częste remisy), który dochodzi do serii; pauza przed serią. */
function shootoutMatch(prefix, ctx = { knockout: 'single' }) {
  for (let i = 0; i < 200; i++) {
    const M = createMatch({ seed: `${prefix}${i}`, home: side('legia'), away: side('legia'), ctx: { ...ctx, shootoutPrep: true } });
    playToPrep(M);
    if (M.phase === 'shootoutPrep') return { M, seed: `${prefix}${i}` };
  }
  throw new Error('brak meczu z serią rzutów karnych');
}

test('Zasady meczu: sparing z ustawień gracza, mecze o stawkę bez zmian', () => {
  assert.deepEqual(
    (({ friendly, decider, subs, reentry }) => ({ friendly, decider, subs, reentry }))(matchRules({ friendly: true })),
    { friendly: true, decider: 'none', subs: 'unlimited', reentry: false },
  );
  const r = matchRules({ friendlyRules: { decider: 'et_penalties', subs: 'rolling', rotation: 'two_xi' } });
  assert.equal(r.decider, 'et_penalties'); assert.equal(r.reentry, true); assert.equal(r.rotation, 'two_xi');
  assert.equal(matchRules({ friendlyRules: { decider: 'zle', subs: 'zle' } }).decider, 'none', 'nieznana wartość: domyślna');
  assert.equal(matchRules({}).decider, 'none');
  assert.equal(matchRules({ knockout: 'single' }).decider, 'et_penalties');
  assert.equal(matchRules({ knockout: { firstLeg: [1, 0] } }).decider, 'et_penalties');
  assert.equal(matchRules({ knockout: 'penaltiesOnly' }).decider, 'penalties');
  assert.equal(matchRules({ knockout: 'single' }).subs, 'standard');
  const M = createMatch({ seed: 'std', home: side('legia'), away: side('lech'), ctx: {} });
  assert.equal(M.teams[0].subsLimit, 5); assert.equal(M.teams[0].windowsLimit, 3);
});

test('Sparing bez limitu: 11 zmian w wielu oknach plus zmiana za kontuzjowanego; zmieniony nie wraca', () => {
  const M = friendly('unl', { subs: 'unlimited' }, { ai: false, benchSize: 14 });
  const T = M.teams[0];
  assert.equal(subsAvailable(M, T), T.bench.length, 'tyle zmian, ilu rezerwowych');
  const outs = fieldPlayers(T).filter((x) => x.slot.pos !== 'BR');
  let made = 0;
  for (const [i, x] of outs.entries()) {
    until(M, 10 + i * 7); // osobne okno co kilka minut (w meczu o stawkę najwyżej 3)
    const inc = T.bench.find((b) => b.p.pos !== 'BR');
    const r = substitute(M, 0, x.id, inc.id);
    assert.ok(r.ok, r.error); made++;
  }
  const gkIn = T.bench.find((b) => b.p.pos === 'BR');
  assert.ok(substitute(M, 0, goalkeeper(T).id, gkIn.id).ok);
  made++;
  assert.equal(made, 11);
  assert.ok(T.windowsUsed > 3, `okna: ${T.windowsUsed}`);
  // Kontuzja po 11 zmianach: jest jeszcze rezerwowy, więc zmiana możliwa
  const victim = fieldPlayers(T).find((x) => x.slot.pos !== 'BR');
  injure(M, T, victim, false, { injury: { cat: 'medium', name: 'uraz przywodziciela', days: 20, playable: false } });
  const spare = T.bench.find((b) => b.p.pos !== 'BR' && !b.subbedOff);
  if (spare) assert.ok(substitute(M, 0, victim.id, spare.id).ok);
  // Zmieniony zawodnik nie wraca (reguła 'unlimited')
  const gone = outs[0];
  assert.ok(gone.subbedOff);
  assert.equal(canSubstitute(M, 0, fieldPlayers(T).find((x) => x.slot.pos !== 'BR').id, gone.id), 'Tego zawodnika nie ma na ławce.');
  runToEnd(M);
  assert.equal(M.ended, true);
});

test('Zmiany rotacyjne: zmieniony wraca, minuty się sumują, kontuzjowany nie wraca', () => {
  const M = friendly('roll', { subs: 'rolling' }, { ai: false });
  const T = M.teams[0];
  const a = fieldPlayers(T).find((x) => x.slot.pos === 'ŚP' || x.slot.pos === 'DP');
  const b = T.bench.find((x) => x.p.pos !== 'BR');
  until(M, 30);
  assert.ok(substitute(M, 0, a.id, b.id).ok);
  assert.ok(T.bench.includes(a), 'zmieniony wraca na ławkę');
  assert.equal(a.subbedOff, false);
  until(M, 60);
  const r2 = substitute(M, 0, b.id, a.id);
  assert.ok(r2.ok, r2.error);
  const ev = M.events.filter((e) => e.type === 'sub' && e.side === 0);
  assert.equal(ev[0].outToBench, true);
  assert.equal(ev[1].reentry, true);
  // Kontuzjowany bez możliwości gry schodzi na stałe
  const c = fieldPlayers(T).find((x) => x.slot.pos !== 'BR' && x !== a);
  injure(M, T, c, false, { injury: { cat: 'medium', name: 'uraz przywodziciela', days: 20, playable: false } });
  const d = T.bench.find((x) => x.p.pos !== 'BR' && x !== b && x.minOn === null);
  assert.ok(substitute(M, 0, c.id, d.id).ok);
  assert.ok(!T.bench.includes(c));
  assert.equal(canSubstitute(M, 0, d.id, c.id), 'Tego zawodnika nie ma na ławce.');
  const states = playerStates(M, 0);
  assert.equal(states.find((s) => s.id === b.id).bench, true);
  assert.ok(states.find((s) => s.id === b.id).minutes >= 29);
  const r = runToEnd(M);
  const mins = (id) => r.ratings.find((x) => x.id === id)?.minutes;
  assert.ok(Math.abs(mins(a.id) - (30 + (M.minute - 60))) <= 1, `minuty a: ${mins(a.id)}`);
  assert.ok(Math.abs(mins(b.id) - 30) <= 1, `minuty b: ${mins(b.id)}`);
  assert.equal(new Set(r.ratings.map((x) => x.id)).size, r.ratings.length, 'każdy zawodnik raz w ocenach');
});

test('Rozstrzygnięcie remisu w sparingu: brak, od razu karne, dogrywka i karne', () => {
  const seen = { none: 0, penalties: 0, et_penalties: 0 };
  for (const decider of Object.keys(seen)) {
    for (let i = 0; i < 40; i++) {
      const M = createMatch({ seed: `dec${i}`, home: side('legia'), away: side('legia'), ctx: { friendlyRules: { decider } } });
      const r = runToEnd(M);
      if (r.score[0] !== r.score[1]) { assert.equal(r.shootout, null); if (decider !== 'et_penalties') assert.equal(r.extraTime, false); continue; }
      seen[decider]++;
      if (decider === 'none') { assert.equal(r.shootout, null); assert.equal(r.extraTime, false); assert.equal(r.winner, null); }
      if (decider === 'penalties') { assert.ok(r.shootout); assert.equal(r.extraTime, false); assert.ok(M.minute < 100); assert.notEqual(r.winner, null); }
      if (decider === 'et_penalties') { assert.equal(r.extraTime, true); }
    }
  }
  for (const [k, v] of Object.entries(seen)) assert.ok(v > 0, `brak remisu dla ${k}`);
});

test('Superpuchar (knockout penaltiesOnly): przy remisie od razu karne, bez dogrywki', () => {
  let found = 0;
  for (let i = 0; i < 40 && found < 3; i++) {
    const r = runToEnd(createMatch({ seed: `sp${i}`, home: side('legia'), away: side('legia'), ctx: { knockout: 'penaltiesOnly' } }));
    if (r.score[0] !== r.score[1]) continue;
    found++;
    assert.ok(r.shootout); assert.equal(r.extraTime, false);
  }
  assert.ok(found > 0);
});

test('AI w sparingu: masowe zmiany w przerwie, różnorodnie; w meczu o punkty bez zmian w przerwie', () => {
  const ht = []; const kinds = new Set(); let comp = 0;
  for (let i = 0; i < 30; i++) {
    const M = createMatch({ seed: `ht${i}`, home: side(EK[i % 18].id), away: side(EK[(i + 5) % 18].id), ctx: { friendlyRules: { subs: 'unlimited', period: 'lato' } } });
    toHalfTime(M); resume(M);
    for (const s of [0, 1]) {
      ht.push(M.events.filter((e) => e.type === 'sub' && e.side === s && e.atBreak).length);
      kinds.add(M.teams[s].fplan.kind);
    }
    const C = createMatch({ seed: `ht${i}`, home: side(EK[i % 18].id), away: side(EK[(i + 5) % 18].id), ctx: {} });
    toHalfTime(C); resume(C);
    comp += C.events.filter((e) => e.type === 'sub' && e.atBreak).length;
  }
  const avg = ht.reduce((s, v) => s + v, 0) / ht.length;
  assert.ok(avg >= 5, `średnio ${avg} zmian w przerwie`);
  assert.ok(Math.max(...ht) >= 10, 'czasem cała druga jedenastka');
  assert.ok(new Set(ht).size >= 3, 'różna liczba zmian');
  assert.deepEqual([...kinds].sort(), ['staggered', 'two_xi']);
  assert.ok(comp / 60 < 1, `mecz o punkty: ${comp / 60} zmian w przerwie na drużynę`);
});

test('AI w sparingu: zawodnik z dużym długiem meczowym gra krócej', () => {
  let debtMin = 0; let baseMin = 0; let n = 0;
  for (let i = 0; i < 24; i++) {
    const club = EK[i % 18].id;
    const t = tac(club);
    const pid = t.xi[6];
    const squad = sq[club].map((p) => (p.id === pid ? { ...p, matchDebt: 30, fresh: 70 } : p));
    const mk = (s) => createMatch({ seed: `debt${i}`, home: { ...side(club), squad: s, tactics: t }, away: side(EK[(i + 7) % 18].id), ctx: { friendlyRules: { subs: 'unlimited' } } });
    const rd = runToEnd(mk(squad)); const rb = runToEnd(mk(sq[club]));
    debtMin += rd.ratings.find((x) => x.id === pid).minutes; baseMin += rb.ratings.find((x) => x.id === pid).minutes; n++;
  }
  assert.ok(debtMin / n <= 50, `z długiem średnio ${debtMin / n} min`);
  assert.ok(debtMin < baseMin, `z długiem ${debtMin / n}, bez ${baseMin / n}`);
});

test('Asystent w przerwie sparingu podpowiada wymianę składu, nie zmieniając meczu', () => {
  const M = friendly('adv', { subs: 'unlimited', rotation: 'two_xi' }, { ai: false });
  toHalfTime(M);
  const before = JSON.stringify(playerStates(M, 0));
  const s = assistantSuggest(M, 0).filter((a) => a.type === 'sub');
  assert.ok(s.length >= 9, `podpowiedzi: ${s.length}`);
  assert.equal(new Set(s.map((a) => a.inId)).size, s.length);
  assert.equal(JSON.stringify(playerStates(M, 0)), before);
});

test('Zmiany zaplanowane przed sparingiem: druga jedenastka po przerwie, niewykonalna zmiana pominięta', () => {
  const t = tac('legia');
  const plan = t.xi.slice(1, 4).map((outId, i) => ({ at: 'HT', outId, inId: t.bench.filter((id) => sq.legia.find((p) => p.id === id).pos !== 'BR')[i] }));
  plan.push({ at: 70, outId: t.xi[5], inId: 'nie-ma-takiego' });
  const M = createMatch({ seed: 'plan', home: side('legia', { ai: false }), away: side('lech'), ctx: { friendlyRules: { subs: 'unlimited', plannedSubs: { 0: plan } } } });
  toHalfTime(M); resume(M);
  const ev = M.events.filter((e) => e.type === 'sub' && e.side === 0 && e.by === 'plan');
  assert.equal(ev.length, 3);
  assert.ok(ev.every((e) => e.atBreak));
  until(M, 71);
  const sk = M.events.find((e) => e.type === 'plannedSubSkipped');
  assert.ok(sk?.error);
  runToEnd(M);
  assert.equal(M.ended, true);
});

test('Seria rzutów karnych: kolejność gracza respektowana, bramkarz w serii do wyboru', () => {
  const { M } = shootoutMatch('ord');
  assert.equal(M.phase, 'shootoutPrep');
  assert.ok(M.events.some((e) => e.type === 'shootoutPrep'));
  const c = shootoutCandidates(M, 0);
  assert.equal(c.available, true);
  assert.equal(c.players.length, fieldPlayers(M.teams[0]).length);
  assert.ok(c.players.every((p) => p.pct >= 40 && p.pct <= 95 && p.kick > 0));
  const order = [...c.suggested].reverse();
  const r = setShootoutOrder(M, 0, order);
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.final, order.slice(0, c.n));
  // Zmiany po końcu dogrywki niemożliwe
  const T = M.teams[0];
  const anyOn = fieldPlayers(T)[1]; const anyBench = T.bench.find((b) => !b.sentOff);
  if (anyBench) assert.match(canSubstitute(M, 0, anyOn.id, anyBench.id), /Przed serią/);
  assert.ok(startShootout(M).ok);
  assert.equal(M.ended, true);
  const res = result(M);
  const mine = res.shootout.kicks.filter((k) => k.side === 0).map((k) => k.pid);
  assert.deepEqual(res.shootout.order[0], r.final);
  mine.forEach((pid, k) => assert.equal(pid, r.final[k % r.final.length], `strzał ${k + 1}`));
  // Bramkarz w serii: zawodnik z pola (Law 10)
  const { M: M2 } = shootoutMatch('kpr');
  const field = fieldPlayers(M2.teams[1]).find((x) => x.slot.pos !== 'BR');
  assert.ok(setShootoutOrder(M2, 1, null, { keeperId: field.id }).ok);
  startShootout(M2);
  assert.ok(M2.shootout.kicks.filter((k) => k.side === 0).every((k) => k.gkId === field.id));
  assert.equal(M2.shootout.keepers[1], field.id);
});

test('Seria rzutów karnych: walidacja listy strzelców', () => {
  const { M } = shootoutMatch('val');
  const T = M.teams[0];
  const ids = fieldPlayers(T).map((x) => x.id);
  const bench = T.bench[0];
  const subbed = T.players.find((x) => x.subbedOff);
  assert.match(setShootoutOrder(M, 0, [ids[0], bench.id]).error, /tylko zawodnicy, którzy są na boisku/);
  if (subbed) assert.match(setShootoutOrder(M, 0, [subbed.id]).error, /tylko zawodnicy, którzy są na boisku/);
  assert.match(setShootoutOrder(M, 0, [ids[0], ids[0]]).error, /dwa razy/);
  assert.match(setShootoutOrder(M, 0, 'abc').error, /listę/);
  assert.match(setShootoutOrder(M, 0, null, { keeperId: bench.id }).error, /bramce/);
  assert.equal(T.shootoutOrder ?? null, null, 'błędna lista nic nie zmienia');
  // Lista krótsza: reszta automatycznie, bramkarz serii zawsze strzela
  const r = setShootoutOrder(M, 0, [ids[3]]);
  assert.equal(r.final[0], ids[3]);
  assert.ok(r.final.includes(goalkeeper(T).id));
  assert.equal(r.final.length, shootoutCandidates(M, 0).n);
  // Bez serii w sparingu bez rozstrzygnięcia
  const F = friendly('nodec', { decider: 'none' });
  assert.match(setShootoutOrder(F, 0, []).error, /nie ma serii/);
  assert.equal(shootoutCandidates(F, 0).available, false);
  // Po serii nic się nie da zmienić
  startShootout(M);
  assert.match(setShootoutOrder(M, 0, null).error, /już się odbyła/);
});

test('Seria rzutów karnych: bez wyboru kolejność automatyczna, pauza nie zmienia wyniku (puchar i dwumecz UEFA)', () => {
  for (const ctx of [{ knockout: 'single' }, { knockout: { firstLeg: [1, 1] } }]) {
    const { M, seed } = shootoutMatch(`auto${JSON.stringify(ctx).length}`, ctx);
    const sugg = [0, 1].map((s) => shootoutCandidates(M, s).suggested);
    startShootout(M);
    assert.deepEqual(M.shootout.order, sugg, 'kolejność automatyczna = podpowiedź');
    // Ten sam mecz bez pauzy: identyczny wynik (poza zdarzeniem pauzy)
    const plain = runToEnd(createMatch({ seed, home: side('legia'), away: side('legia'), ctx }));
    assert.equal(strip(result(M)), strip(plain));
  }
});

test('Zgodność wstecz: krok po pauzie rozgrywa serię, runToEnd przechodzi przez pauzę', () => {
  const { M } = shootoutMatch('bc');
  const r = step(M);
  assert.equal(r.state, 'ended');
  assert.ok(r.events.some((e) => e.type === 'shootoutKick'));
  const { M: M2 } = shootoutMatch('bc2');
  const res = runToEnd(M2);
  assert.ok(res.shootout);
});

test('Determinizm sparingu: to samo ziarno i te same zasady dają ten sam mecz', () => {
  const rules = { subs: 'rolling', decider: 'et_penalties', period: 'zima' };
  const a = runToEnd(createMatch({ seed: 'det', home: side('legia'), away: side('legia'), ctx: { friendlyRules: rules } }));
  const b = runToEnd(createMatch({ seed: 'det', home: side('legia'), away: side('legia'), ctx: { friendlyRules: rules } }));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('AI w sparingu: zawodnik ze stłuczeniem schodzi od razu (nikt nie gra z bólem)', () => {
  let subbed = 0;
  for (let i = 0; i < 10; i++) {
    const M = friendly(`knock${i}`, { subs: 'unlimited' });
    until(M, 20);
    const T = M.teams[0];
    const x = fieldPlayers(T).find((y) => y.slot.pos !== 'BR' && !y.knock);
    injure(M, T, x, false, { injury: { cat: 'light', name: 'stłuczenie', days: 2, playable: true } });
    step(M); step(M);
    if (x.subbedOff) subbed++;
  }
  assert.ok(subbed >= 8, `zmienieni: ${subbed}/10`);
});
