// Konferencja prasowa (src/match/press.js, docs/konferencja-prasowa.md): klimat prasy, sala, dopytania,
// pominięcie, pamięć prasy i granice wpływu na morale.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIMATES, PRESS_LIMITS, PRESS_LIMITS_PRE, pressState, pickClimate, openConference, answerQuestion, currentQuestion, walkOut,
  conferenceEffects, skipEffects, nextPressState, nextPressStatePre, pressMoraleDelta, effectWords, progress,
  openCase, decideCase, priorOffences, DISCIPLINE, pressBoardTerm,
} from '../src/match/press.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, continueUntilStop, primaryAction } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { startMatchday, doPreBriefing, kickOff, skip, finishMatchday, doPostBriefing, pressSetup, closeMatchday } from '../src/match/matchday.js';
import '../src/season/dailySystems.js';

const BASE = {
  gameSeed: '7', clubId: 'widzew', clubName: 'Widzew Łódź', oppName: 'Lech Poznań', region: 'lodz', prestige: 6, tier: 1, coach: 'Nowak',
  userHome: true, date: '2026-08-01', season: '2026/27', res: 'R', gf: 1, ga: 1, margin: 0, pts: 1, expPts: 1.2, xgFor: 1.1, xgAgainst: 1.0,
  last5: ['W', 'R', 'P', 'W', 'R'], winStreak: 0, lossStreak: 0, boardTrust: 60, fansMood: 55, position: 8, goalTarget: 6, roundsPlayed: 4,
  worst: { id: 'p2', name: 'Jan Słaby' }, star: { id: 'p1', name: 'Adam Gwiazda' }, rumour: { id: 'p1', name: 'Adam Gwiazda' },
};
const CRISIS = { ...BASE, prestige: 10, res: 'P', gf: 0, ga: 3, margin: -3, pts: 0, expPts: 2.1, last5: ['P', 'P', 'P', 'R', 'P'], lossStreak: 3, boardTrust: 30, fansMood: 30, position: 14, goalTarget: 3, roundsPlayed: 10 };
const DREAM = { ...BASE, prestige: 4, res: 'W', gf: 3, ga: 0, margin: 3, pts: 3, expPts: 0.8, last5: ['W', 'W', 'W', 'W', 'R'], winStreak: 4, boardTrust: 80, position: 2, goalTarget: 12, roundsPlayed: 10 };

const share = (ctx, state = {}, n = 300) => {
  const c = { agresywna: 0, neutralna: 0, pozytywna: 0 };
  for (let i = 0; i < n; i++) c[pickClimate(ctx, state, `s${i}`).climate]++;
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n]));
};

test('Klimat prasy zależy od kontekstu, ale zostaje losowy', () => {
  const crisis = share(CRISIS);
  const dream = share(DREAM);
  const mid = share(BASE);
  assert.ok(crisis.agresywna > 0.6, `kryzys: agresywna ${crisis.agresywna}`);
  assert.ok(dream.pozytywna > 0.6, `seria zwycięstw: pozytywna ${dream.pozytywna}`);
  assert.ok(mid.neutralna > 0.3 && mid.agresywna > 0.05 && mid.pozytywna > 0.05, JSON.stringify(mid));
  assert.ok(crisis.pozytywna > 0, 'nawet w kryzysie zdarza się życzliwa sala');
  // Derby wzmacniają, wielki klub jest pod większą presją
  assert.ok(share({ ...BASE, prestige: 10 }).agresywna > share({ ...BASE, prestige: 3 }).agresywna);
  // Dobre relacje z mediami łagodzą
  assert.ok(share(BASE, { relation: 90 }).agresywna < share(BASE, { relation: 15 }).agresywna);
  // Pominięta konferencja wraca
  assert.ok(share(BASE, { last: { mode: 'skipped' } }).agresywna > mid.agresywna);
  const r = pickClimate(CRISIS, {}, 'x');
  assert.ok(r.reasons.length >= 1 && r.reasons.every((t) => typeof t === 'string' && !/\d\.\d/.test(t)));
});

test('Narracja trwa: obecny klimat dostaje premię, dopóki nie wygaśnie', () => {
  const p0 = pickClimate(BASE, { climate: 'agresywna', left: 0 }, 'n').probs.agresywna;
  const p1 = pickClimate(BASE, { climate: 'agresywna', left: 2 }, 'n').probs.agresywna;
  assert.ok(p1 > p0 + 0.1, `${p0} -> ${p1}`);
  const s1 = nextPressState({}, { mode: 'answered', media: 0 }, { climate: 'agresywna', seed: 'a' });
  assert.ok(s1.left >= 2 && s1.left <= 4 && s1.streak === 1);
  const s2 = nextPressState(s1, { mode: 'answered', media: 0 }, { climate: 'agresywna', seed: 'a' });
  assert.equal(s2.left, s1.left - 1);
  assert.equal(s2.streak, 2);
});

test('Deterministyczność: to samo ziarno daje ten sam klimat, salę i pytania', () => {
  const a = openConference(CRISIS, {}, null, 'm1');
  const b = openConference(CRISIS, {}, null, 'm1');
  assert.deepEqual(a, b);
  const many = new Set(Array.from({ length: 20 }, (_, i) => openConference(BASE, {}, null, `m${i}`).queue.map((q) => q.id).join()));
  assert.ok(many.size > 3, 'różne mecze dają różne pytania');
  // Ten sam lokalny dziennikarz wraca co mecz
  const loc = (seed) => openConference(BASE, {}, { climate: 'neutralna' }, seed).room.find((r) => r.id === 'lokalne');
  assert.deepEqual(loc('x1'), loc('x2'));
  assert.match(loc('x1').outlet, /Łódź/);
});

test('Sala: rzecznik, słowo wstępne i 3-5 pytań od nazwanych dziennikarzy', () => {
  for (const climate of Object.keys(CLIMATES)) {
    const conf = openConference(CRISIS, {}, { climate }, `k-${climate}`);
    assert.ok(conf.officer.name && conf.intro.includes('pyta'));
    assert.equal(conf.queue[0].officer, true);
    const js = conf.queue.filter((q) => !q.officer);
    assert.equal(js.length, climate === 'agresywna' ? 4 : 3);
    // Nawet zwykły mecz bez kontekstu daje pełną salę pytań
    for (const res of ['W', 'R', 'P']) {
      const plain = { gameSeed: '1', clubId: 'motor', res, margin: res === 'W' ? 1 : res === 'P' ? -1 : 0, xgFor: 1, xgAgainst: 1 };
      for (let i = 0; i < 10; i++) {
        const pc = openConference(plain, {}, { climate }, `p${i}`);
        assert.equal(pc.queue.filter((q) => !q.officer).length, climate === 'agresywna' ? 4 : 3);
        assert.ok(pc.intro.includes(climate === 'agresywna' ? '4 pytania' : '3 pytania'));
        assert.equal(new Set(pc.room.map((j) => j.name.split(' ').pop())).size, pc.room.length, 'bez powtórzonych nazwisk');
      }
    }
    assert.ok(js.every((q) => q.by?.name && q.by.outlet && q.answers.length >= 3 && !q.text.includes('{')));
    assert.ok(js.every((q) => q.answers.every((a) => a.toneLabel)));
    let c = conf;
    while (!c.done) c = answerQuestion(c, 2);
    const n = c.queue.filter((q) => !q.officer).length;
    assert.ok(n >= 3 && n <= 5, `pytań ${n}`);
  }
});

test('Dopytanie zależy od poprzedniej odpowiedzi (tego samego dziennikarza)', () => {
  const ctx = { ...BASE, res: 'P', gf: 0, ga: 1, margin: -1, pts: 0 };
  let found = 0;
  for (let i = 0; i < 40 && found < 3; i++) {
    const conf = openConference(ctx, {}, { climate: 'neutralna' }, `f${i}`);
    const at = conf.queue.findIndex((q) => q.id === 'loss-why');
    if (at < 0) continue;
    found++;
    const go = (pick) => { let c = conf; while (c.idx < at) c = answerQuestion(c, 0); return answerQuestion(c, pick); };
    const hard = go(2); // „Niektórzy zawodnicy nie dali z siebie wszystkiego.”
    const nq = currentQuestion(hard);
    assert.equal(nq.id, 'who-blame');
    assert.equal(nq.by.id, conf.queue[at].by.id);
    assert.ok(nq.answers.some((a) => a.text.includes('Jan Słaby')));
    const soft = go(1);
    assert.notEqual(currentQuestion(soft)?.id, 'who-blame');
    // Wskazanie zawodnika z nazwiska: jego morale w dół, nagłówek o tym
    let c = answerQuestion(hard, 0);
    while (!c.done) c = answerQuestion(c, 1);
    const eff = conferenceEffects(c);
    assert.ok(eff.players.find((p) => p.id === 'p2').d < 0);
  }
  assert.ok(found >= 3);
});

test('Pominięcie konferencji: presja działa bez osłony, media zapamiętują', () => {
  const agr = skipEffects(CRISIS, 'agresywna');
  const neu = skipEffects(BASE, 'neutralna');
  const pos = skipEffects(DREAM, 'pozytywna');
  assert.equal(agr.mode, 'skipped');
  assert.equal(agr.teamMorale, CLIMATES.agresywna.base);
  assert.equal(neu.teamMorale, 0);
  assert.ok(pos.teamMorale > 0 && pos.teamMorale < CLIMATES.pozytywna.base, 'dobra prasa działa słabiej bez trenera');
  assert.ok(agr.media < neu.media && neu.media < 0 && pos.media < 0);
  assert.ok(agr.headline.text.length > 10);
  // Osłona: trener, który bierze winę na siebie, łagodzi agresywną prasę
  const conf = openConference(CRISIS, {}, { climate: 'agresywna' }, 'osl');
  let shield = conf;
  while (!shield.done) {
    const q = currentQuestion(shield);
    const best = q.answers.reduce((b, a) => (['spokojny', 'pewny'].includes(a.tone) ? a : b), q.answers[0]);
    shield = answerQuestion(shield, best.i);
  }
  assert.ok(conferenceEffects(shield).teamMorale > agr.teamMorale);
  // Złamana obietnica bez konferencji też kosztuje
  const broken = skipEffects(CRISIS, 'agresywna', { promises: [{ kind: 'winNext' }] });
  assert.ok(broken.fans < agr.fans && /obiecał/.test(broken.headline.text));
});

test('Wpływ na morale, zarząd i kibiców jest ograniczony', () => {
  const ctxs = [BASE, CRISIS, DREAM, { ...CRISIS, derby: true, controversy: true, againstUs: true, redUser: { id: 'p3', name: 'Ostry' } }];
  for (let i = 0; i < 120; i++) {
    const ctx = ctxs[i % ctxs.length];
    let c = openConference(ctx, { promises: [{ kind: 'winNext' }] }, null, `b${i}`);
    let k = 0;
    while (!c.done) c = answerQuestion(c, (i + k++) % (currentQuestion(c).answers.length));
    if (i % 7 === 0) c = walkOut(openConference(ctx, {}, null, `w${i}`));
    const e = conferenceEffects(c);
    assert.ok(e.teamMorale >= PRESS_LIMITS.teamMorale[0] && e.teamMorale <= PRESS_LIMITS.teamMorale[1], `${e.teamMorale}`);
    assert.ok(e.board >= PRESS_LIMITS.board[0] && e.board <= PRESS_LIMITS.board[1]);
    assert.ok(e.fans >= PRESS_LIMITS.fans[0] && e.fans <= PRESS_LIMITS.fans[1]);
    assert.ok(e.players.every((p) => p.d >= PRESS_LIMITS.player[0] && p.d <= PRESS_LIMITS.player[1]));
    assert.ok(effectWords(e).every((w) => !/\d/.test(w.t.replace(/\d+\./g, ''))), 'skutki słowami, bez liczb');
  }
  // Osobowość: wrażliwy odczuwa nagonkę mocniej, spokojny słabiej
  assert.ok(pressMoraleDelta(-1, 'Wrażliwy') < pressMoraleDelta(-1, 'Ambitny'));
  assert.ok(pressMoraleDelta(-1, 'Spokojny') > pressMoraleDelta(-1, 'Ambitny'));
  assert.ok(pressMoraleDelta(PRESS_LIMITS.teamMorale[0], 'Wrażliwy') >= -2.25);
});

test('Wyjście z sali i pamięć prasy (obietnice, unikanie mediów)', () => {
  const conf = openConference(BASE, {}, { climate: 'agresywna' }, 'wo');
  const out = walkOut(answerQuestion(conf, 0));
  const e = conferenceEffects(out);
  assert.equal(e.mode, 'walkout');
  assert.ok(e.media <= -4 && /konferencj/.test(e.headline.text));
  // Obietnica zwycięstwa wraca po porażce
  const st = nextPressState({}, { mode: 'answered', media: 0, promisesAdd: [{ kind: 'winNext', text: 'zwycięstwo w kolejnym meczu' }] }, { climate: 'neutralna', season: '2026/27' });
  assert.equal(st.promises.length, 1);
  let hits = 0;
  for (let i = 0; i < 30; i++) if (openConference({ ...BASE, res: 'P', margin: -1, pts: 0 }, st, null, `pb${i}`).queue.some((q) => q.id === 'promise-broken')) hits++;
  assert.ok(hits >= 24, `pytanie o obietnicę ${hits}/30`);
  // Po kolejnym meczu obietnica „na następny mecz” wygasa, cel sezonu zostaje do końca sezonu
  const st2 = nextPressState(st, { mode: 'answered', media: 0, promisesAdd: [{ kind: 'season', text: 'mistrzostwo', target: 1, season: '2026/27' }] }, { climate: 'neutralna', season: '2026/27' });
  assert.deepEqual(st2.promises.map((p) => p.kind), ['season']);
  assert.equal(nextPressState(st2, { mode: 'skipped', media: -2 }, { climate: 'neutralna', season: '2027/28' }).promises.length, 0);
  // Po pominięciu pierwsze pytanie: unika pan mediów?
  const after = nextPressState({}, { mode: 'skipped', media: -4 }, { climate: 'agresywna' });
  let sk = 0;
  for (let i = 0; i < 20; i++) if (openConference(BASE, after, null, `sk${i}`).queue.some((q) => q.id === 'skipped')) sk++;
  assert.ok(sk >= 14, `pytanie o nieobecność ${sk}/20`);
  assert.ok(after.relation < 50);
  const conf3 = openConference(BASE, {}, { climate: 'neutralna' }, 'pr');
  assert.deepEqual(progress(conf3), { total: 3, current: 0, last: false });
});

test('Stare zapisy: stan prasy tworzy się leniwie i naprawia złe pola', () => {
  const g = {};
  const s = pressState(g);
  assert.equal(s.climate, 'neutralna');
  assert.equal(s.relation, 50);
  assert.deepEqual(s.promises, []);
  const g2 = { press: { climate: 'zła', relation: 'x', promises: null } };
  assert.equal(pressState(g2).climate, 'neutralna');
  assert.equal(g2.press.relation, 50);
  assert.ok(Array.isArray(g2.press.promises));
});

test('Dzień meczowy: Dalej bez konferencji też zmienia morale kadry wg klimatu prasy', () => {
  const g = { seed: 31, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(31);
  g.season = createSeason(31, { playerClub: 'widzew' });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 });
  processDay(g);
  while (primaryAction(g).kind !== 'play') {
    if (primaryAction(g).kind === 'decide') g.inbox = g.inbox.map((m) => ({ ...m, resolved: true }));
    else continueUntilStop(g);
  }
  delete g.press; // stary zapis
  const S = startMatchday(g, primaryAction(g).match);
  doPreBriefing(g, S, 'calm', []);
  kickOff(g, S); skip(S); skip(S);
  finishMatchday(g, S);
  doPostBriefing(g, S, 'focusNext', []);
  const room = pressSetup(g, S);
  assert.ok(room && CLIMATES[room.climate.climate]);
  assert.deepEqual(pressSetup(g, S), room, 'leniwie, raz na mecz');
  const ids = g.world.clubs.widzew.squad;
  const before = ids.map((id) => g.world.players[id].morale ?? 12);
  closeMatchday(g, S);
  assert.equal(g.press.last.mode, 'skipped');
  assert.ok(g.inbox.some((m) => m.key === `prasa:${S.f.id}`));
  const after = ids.map((id) => g.world.players[id].morale ?? 12);
  const diff = after.map((v, i) => v - before[i]);
  if (room.climate.climate === 'neutralna') assert.ok(diff.every((d) => Math.abs(d) < 1e-9));
  else assert.ok(diff.some((d) => Math.abs(d) > 0) && diff.every((d) => d >= -1.3 && d <= 0.5), JSON.stringify(diff));
});

// ---------------------------------------------------------------- Konferencja przedmeczowa

const PRE = { ...BASE, phase: 'pre', pts: undefined, res: undefined, gf: undefined, ga: undefined, margin: undefined, oppStar: 'Jan Snajper', absent: 'Piotr Kontuzja', refName: 'Marek Gwizdek', comp: 'ekstraklasa', matchId: 'm-pre' };

test('Konferencja przedmeczowa: pytania przed meczem, bez słowa wstępnego, deterministycznie', () => {
  for (const climate of Object.keys(CLIMATES)) {
    const conf = openConference(PRE, {}, { climate }, `pre-${climate}`, 'pre');
    assert.equal(conf.phase, 'pre');
    assert.ok(conf.queue.every((q) => !q.officer));
    assert.equal(conf.queue.length, climate === 'agresywna' ? 4 : 3);
    assert.ok(conf.queue.every((q) => !['win-key', 'loss-why', 'draw', 'opp', 'lineup', 'next'].includes(q.id)), conf.queue.map((q) => q.id).join());
    assert.ok(conf.queue.every((q) => !q.text.includes('{') && q.by?.name));
    assert.match(conf.intro, /przed meczem/);
  }
  assert.deepEqual(openConference(PRE, {}, null, 'x', 'pre'), openConference(PRE, {}, null, 'x', 'pre'));
  let derby = 0;
  for (let i = 0; i < 20; i++) if (openConference({ ...PRE, derby: true }, {}, null, `d${i}`, 'pre').queue.some((q) => q.id === 'pre-derby')) derby++;
  assert.ok(derby >= 16, `derby ${derby}/20`);
  // Bez wyniku klimat liczy się z formy, tabeli i relacji (nie z punktów)
  assert.ok(!pickClimate(PRE, {}, 'p').factors.some((f) => /oczekiwa|słabszym/.test(f.text) && !/zarządu/.test(f.text)));
});

test('Konferencja przedmeczowa: mniejszy wpływ, obietnica wraca po meczu, pominięcie kosztuje mało', () => {
  for (let i = 0; i < 60; i++) {
    let c = openConference(PRE, {}, null, `pb${i}`, 'pre');
    let k = 0;
    while (!c.done) c = answerQuestion(c, (i + k++) % currentQuestion(c).answers.length);
    const e = conferenceEffects(c);
    assert.equal(e.phase, 'pre');
    assert.ok(e.teamMorale >= PRESS_LIMITS_PRE.teamMorale[0] && e.teamMorale <= PRESS_LIMITS_PRE.teamMorale[1], `${e.teamMorale}`);
    assert.ok(Math.abs(e.board) <= 3 && Math.abs(e.fans) <= 4);
  }
  // „Wygramy” przed meczem: obietnica zostaje do konferencji po meczu
  let c = openConference(PRE, {}, { climate: 'neutralna' }, 'obiet', 'pre');
  const first = currentQuestion(c);
  assert.equal(first.id, 'pre-expect');
  c = answerQuestion(c, 0);
  while (!c.done) c = answerQuestion(c, 1);
  const e = conferenceEffects(c);
  assert.equal(e.promisesAdd[0].kind, 'winNext');
  const st = nextPressStatePre(pressState({}), e, { date: '2026-08-01', matchId: 'm-pre' });
  assert.equal(st.promises[0].kind, 'winNext');
  assert.equal(st.climate, 'neutralna', 'przedmeczowa nie zmienia narracji');
  let hits = 0;
  for (let i = 0; i < 20; i++) if (openConference({ ...BASE, res: 'P', margin: -1, pts: 0 }, st, null, `po${i}`).queue.some((q) => q.id === 'promise-broken')) hits++;
  assert.ok(hits >= 16);
  const skipA = skipEffects(PRE, 'agresywna', {}, 'pre');
  const skipPost = skipEffects(BASE, 'agresywna', {}, 'post');
  assert.ok(skipA.teamMorale < 0 && skipA.teamMorale > skipPost.teamMorale && skipA.media > skipPost.media);
  assert.equal(skipEffects(PRE, 'neutralna', {}, 'pre').teamMorale, 0);
});

// ---------------------------------------------------------------- Dyscyplina

test('Słowa o sędziach: wniosek tylko po mocnej wypowiedzi, wycofanie się go unika', () => {
  const ctx = { ...BASE, res: 'P', gf: 0, ga: 1, margin: -1, pts: 0, controversy: true, againstUs: true, refName: 'Jan Sędzia', comp: 'ekstraklasa', matchId: 'm1' };
  let found = 0;
  for (let i = 0; i < 60 && found < 3; i++) {
    const conf = openConference(ctx, {}, { climate: 'neutralna' }, `r${i}`);
    const at = conf.queue.findIndex((q) => q.id === 'referee');
    if (at < 0) continue;
    found++;
    const go = (pick, follow) => { let c = conf; while (c.idx < at) c = answerQuestion(c, 0); c = answerQuestion(c, pick); if (follow != null && currentQuestion(c)?.id === 'ref-bias') c = answerQuestion(c, follow); while (!c.done) c = answerQuestion(c, 0); return conferenceEffects(c); };
    assert.equal(go(0).fine, false, 'bez komentarza do sędziów: bez sprawy');
    const hard = go(1, 1);
    assert.ok(hard.fine && hard.ref >= 2);
    const kase = openCase(hard, ctx, 's');
    assert.equal(kase.tier, 1);
    assert.equal(kase.body, 'Komisja Ligi Ekstraklasy');
    assert.ok(kase.days >= 3 && kase.days <= 6);
    const back = go(1, 0); // „Tego nie powiedziałem”
    assert.equal(back.fine, false, 'wycofanie się łagodzi sprawę');
    assert.equal(openCase(hard, { ...ctx, comp: 'uefa' }), null);
    assert.equal(openCase(hard, { ...ctx, comp: 'liga2', tier: 3 }).body, 'Komisja Dyscyplinarna PZPN');
  }
  assert.ok(found >= 3);
});

test('Decyzja komisji: upomnienie albo kara w realnych widełkach, recydywa podnosi karę', () => {
  const run = (tier, severity, history = []) => Array.from({ length: 400 }, (_, i) => decideCase({ id: `c${i}`, date: '2026-10-01', tier, severity }, history, '2026-10-05', 'x'));
  const first = run(1, 1);
  const fines = first.filter((d) => d.outcome === 'kara');
  const share = fines.length / first.length;
  assert.ok(share > 0.18 && share < 0.45, `kary przy pierwszym przewinieniu ${share}`);
  assert.ok(first.some((d) => d.outcome === 'upomnienie') && first.some((d) => d.outcome === 'umorzenie'));
  assert.ok(fines.every((d) => d.amount >= DISCIPLINE.fine[1][0] && d.amount <= DISCIPLINE.fine[1][1]));
  const hist = [{ date: '2026-09-01', outcome: 'kara', amount: 10000 }, { date: '2026-09-20', outcome: 'upomnienie' }];
  const repeat = run(1, 2, hist);
  const rf = repeat.filter((d) => d.outcome === 'kara');
  assert.ok(rf.length / repeat.length > 0.9);
  const mean = (l) => l.reduce((s, d) => s + d.amount, 0) / l.length;
  assert.ok(mean(rf) > mean(fines) * 1.5);
  assert.ok(rf.every((d) => d.amount <= DISCIPLINE.cap[1]));
  assert.ok(run(3, 3, hist).every((d) => d.amount <= DISCIPLINE.cap[3]));
  assert.ok(mean(run(2, 1).filter((d) => d.amount)) < mean(fines));
  assert.ok(rf.every((d) => d.trust === DISCIPLINE.trust.karaRecydywa));
  // Stare przewinienia (ponad rok) się nie liczą
  assert.equal(priorOffences([{ date: '2025-01-01', outcome: 'kara' }], '2026-10-01'), 0);
  assert.deepEqual(decideCase({ id: 'a', date: '2026-10-01', tier: 1, severity: 1 }, [], '2026-10-04', 's'), decideCase({ id: 'a', date: '2026-10-01', tier: 1, severity: 1 }, [], '2026-10-04', 's'));
});

test('Prasa w ocenie zarządu: zła prasa obniża, dobra podnosi, z limitem i opisem', () => {
  const log = (climate, n, mode = 'answered') => Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(5 + i * 7).padStart(2, '0')}`, climate, mode }));
  const bad = pressBoardTerm({ log: log('agresywna', 4, 'skipped'), relation: 20 }, '2026-10-31');
  assert.equal(bad.delta, -2.5);
  assert.ok(bad.notes.some((n) => /suchej nitki/.test(n)) && bad.notes.some((n) => /unika konferencji/.test(n)));
  const good = pressBoardTerm({ log: log('pozytywna', 3), relation: 70 }, '2026-10-31');
  assert.ok(good.delta > 0.8 && good.delta <= 1.5);
  assert.ok(good.notes.some((n) => /Dobra prasa/.test(n)));
  assert.deepEqual(pressBoardTerm({ log: log('agresywna', 3) }, '2027-01-31'), { delta: 0, notes: [] }, 'stare wpisy się nie liczą');
  assert.deepEqual(pressBoardTerm(undefined, '2026-10-31'), { delta: 0, notes: [] }, 'stary zapis bez prasy');
});

test('Dzień meczowy z konferencją przedmeczową, decyzja komisji po kilku dniach i ocena zarządu', async () => {
  const { addDays } = await import('../src/core/gameLoop.js');
  const { boardMonth } = await import('../src/career/board.js');
  const { leaveStudio, pressOpen, doPress, pressSlot } = await import('../src/match/matchday.js');
  const g = { seed: 47, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(47);
  g.season = createSeason(47, { playerClub: 'widzew' });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 });
  processDay(g);
  while (primaryAction(g).kind !== 'play') {
    if (primaryAction(g).kind === 'decide') g.inbox = g.inbox.map((m) => ({ ...m, resolved: true }));
    else continueUntilStop(g);
  }
  delete g.press;
  const S = startMatchday(g, primaryAction(g).match);
  // Konferencja przedmeczowa: osobna sesja, rozliczona raz
  const conf = pressOpen(g, S, 'pre');
  assert.equal(conf.phase, 'pre');
  const pre = doPress(g, S, [], 'pre');
  assert.equal(pre.phase, 'pre');
  assert.ok(g.inbox.some((m) => m.key === `prasa-przed:${S.f.id}`));
  assert.equal(leaveStudio(g, S), pre, 'przejście do odprawy nie dolicza drugi raz');
  assert.equal(g.press.pre.mode, 'answered');
  assert.equal(pressSlot(S, 'post').settled, false);
  // Sprawa dyscyplinarna: decyzja po terminie, kara w księdze i niższe zaufanie
  const st = g.press;
  st.discipline = [{ date: addDays(g.date, -30), outcome: 'kara', amount: 10000 }, { date: addDays(g.date, -10), outcome: 'upomnienie' }];
  st.cases = [{ id: 'test:post', matchId: 'test', date: g.date, days: 3, severity: 3, tier: 1, body: 'Komisja Ligi Ekstraklasy', quote: 'Te decyzje kosztowały nas punkty.', phase: 'post', opp: 'Lech Poznań' }];
  const trust = g.board.trust;
  const fin = g.finance?.clubs?.widzew;
  processDay(g, addDays(g.date, 2));
  assert.equal(g.press.cases.length, 1, 'przed terminem bez decyzji');
  processDay(g, addDays(g.date, 3));
  assert.equal(g.press.cases.length, 0);
  const verdict = g.inbox.find((m) => m.key === 'komisja:test:post');
  assert.ok(verdict, 'wiadomość z decyzją');
  const last = g.press.discipline.at(-1);
  assert.equal(last.outcome, 'kara');
  assert.ok(last.amount > 0 && last.amount <= DISCIPLINE.cap[1]);
  assert.match(verdict.subject, /Kara za wypowiedź o sędziach/);
  assert.ok(g.board.trust <= trust - 2);
  if (fin) {
    assert.ok((fin.ledger[addDays(g.date, 3).slice(0, 7)]?.out?.fines ?? 0) >= last.amount, 'kara w księdze (Kary PZPN)');
    assert.ok(fin.log.some((l) => l.kind === 'fines' && l.amount === last.amount && /sędziach/.test(l.note)));
  }
  // Ocena zarządu czyta klimat prasy
  g.press.log = [{ date: addDays(g.date, -3), climate: 'agresywna', mode: 'skipped' }, { date: addDays(g.date, -10), climate: 'agresywna', mode: 'skipped' }];
  g.press.relation = 30;
  const r = boardMonth(g, addDays(g.date, 1));
  assert.ok(r.review.notes.some((n) => /suchej nitki|krytyczna/.test(n)), r.review.notes.join(' | '));
});

test('Konferencja po meczu pucharowym: pytania o rozstrzygnięcie, nie o remis (Superpuchar po karnych, odpadnięcie, pierwszy mecz dwumeczu)', () => {
  const KO = { ...BASE, knockout: true, points: false, resScore: 'R', gf: 1, ga: 1, margin: 0 };
  const cases = [
    [{ ...KO, comp: 'super', res: 'W', outcome: 'trophy', so: 'W', pens: '4:3', final: true, kind: 'supercup', title: 'Superpuchar Polski' }, 'ko-trophy'],
    [{ ...KO, comp: 'pp', res: 'W', outcome: 'adv', so: 'W', pens: '5:4', kind: 'cupQF', title: 'Puchar Polski' }, 'ko-shootout'],
    [{ ...KO, comp: 'pp', res: 'P', outcome: 'out', so: 'P', pens: '2:4', kind: 'cupSemi', title: 'Puchar Polski' }, 'ko-shootout'],
    [{ ...KO, comp: 'pp', res: 'P', outcome: 'lostFinal', so: null, gf: 0, ga: 1, final: true, kind: 'cupFinal', title: 'Puchar Polski' }, 'ko-final-lost'],
    [{ ...KO, comp: 'uefa', res: 'R', outcome: null, leg: 1, kind: 'uefaKO', title: 'Liga Konferencji' }, 'ko-leg1'],
  ];
  for (const [ctx, first] of cases) {
    for (let i = 0; i < 25; i++) {
      const conf = openConference(ctx, {}, null, `ko${i}`);
      const qs = conf.queue.filter((q) => !q.officer);
      assert.equal(qs[0].id, first, `${ctx.kind} ${ctx.outcome}: ${qs.map((q) => q.id)}`);
      assert.ok(!qs.some((q) => ['draw', 'win-key', 'win-big', 'win-lucky', 'loss-why', 'loss-heavy', 'loss-unlucky'].includes(q.id)), qs.map((q) => q.id).join());
      const opening = conf.queue[0];
      assert.ok(opening.officer && !opening.answers.some((a) => /punkt|remis/i.test(a.text)), opening.answers.map((a) => a.text).join(' | '));
      for (const q of qs) assert.ok(!/\{\w+\}/.test(q.text) && !/punkt/i.test(q.text), q.text);
    }
  }
});
