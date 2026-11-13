// Kontekst odprawy: teksty przemów dopasowane do meczu (docs/odprawy-kontekst.md).
// Sprawdza, że w pucharze i sparingu nie ma mowy o punktach, w zwykłej kolejce o pucharze i trofeum,
// bez derbów o derbach, bez dwumeczu o rewanżu, a każdy kontekst ma własne teksty. Efekty przemów bez zmian.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  briefingContext, toneQuote, toneQuotes, TONES, POST_TONES, preMatchBriefing, halftimeBriefing, postMatchBriefing, assistantAdvice,
} from '../src/match/briefings.js';
import { expectations, boardExpectation, pickHeadlines, matchRank, hasPoints } from '../src/match/studio.js';

const CLUB = 'widzew';
const T = (o) => ({ tier: 1, played: 30, total: 34, leaderPts: 60, secondPts: 58, relFrom: 16, dropPts: 30, targetTo: 4, targetPts: 50, ...o });

// Reprezentatywne mecze każdego kontekstu
const FIX = {
  friendly: { type: 'friendly', title: 'Sparing: Rywal' },
  friendlyStrong: { type: 'friendly', title: 'Sparing: Rywal', pWin: 0.1, pLose: 0.7 },
  leagueNormal: { type: 'league', title: 'Ekstraklasa, 3. kolejka', table: T({ played: 2, pos: 1, points: 6, leaderPts: 6, secondPts: 6, dropPts: 0 }) },
  leagueTitle: { type: 'league', title: 'Ekstraklasa, 31. kolejka', table: T({ pos: 2, points: 58, oppPos: 1, oppPoints: 60 }), tags: ['title'] },
  leagueRelegation: { type: 'league', title: 'Ekstraklasa, 31. kolejka', table: T({ pos: 17, points: 28, oppPos: 15, oppPoints: 30 }) },
  leaguePromotion: { type: 'league', title: '1 Liga, 30. kolejka', table: T({ tier: 2, pos: 4, points: 50, targetTo: 6, targetPts: 48, leaderPts: 58 }) },
  leagueDeadRubber: { type: 'league', title: 'Ekstraklasa, 32. kolejka', table: T({ played: 31, pos: 9, points: 45, dropPts: 25, targetPts: 58, leaderPts: 70 }) },
  derby: { type: 'league', title: 'Ekstraklasa, 10. kolejka', tags: ['derby'], table: T({ played: 9, pos: 8, points: 13 }) },
  bigRival: { type: 'league', title: 'Ekstraklasa, 10. kolejka', rivalry: 2, table: T({ played: 9, pos: 8, points: 13 }) },
  muchWeaker: { type: 'league', title: 'Ekstraklasa, 10. kolejka', pWin: 0.7, pLose: 0.1, table: T({ played: 9, pos: 3, points: 19 }) },
  muchStronger: { type: 'league', title: 'Ekstraklasa, 10. kolejka', pWin: 0.12, pLose: 0.65, table: T({ played: 9, pos: 13, points: 9 }) },
  cupEarly: { type: 'cup', round: 'R32', title: 'Puchar Polski, 1/16 finału' },
  cupEarlyWeak: { type: 'cup', round: 'R64', title: 'Puchar Polski, 1/32 finału', pWin: 0.72, pLose: 0.08 },
  cupSemi: { type: 'cup', round: 'SF', title: 'Puchar Polski, półfinał' },
  cupFinal: { type: 'cup', round: 'F', stage: 'final', venue: 'neutral', title: 'Puchar Polski, finał' },
  supercup: { type: 'supercup', round: 'F', stage: 'final', venue: 'neutral', title: 'Superpuchar Polski' },
  uefaQ1: { type: 'uefa', round: 'Q1', leg: 1, title: 'Liga Konferencji, 1. runda eliminacji, 1. mecz' },
  uefaQ2: { type: 'uefa', round: 'Q2', leg: 2, firstLeg: [0, 1], title: 'Liga Konferencji, 2. runda eliminacji, 2. mecz' },
  uefaQ2ahead: { type: 'uefa', round: 'Q2', leg: 2, firstLeg: [2, 0], title: 'Liga Konferencji, 2. runda eliminacji, 2. mecz' },
  uefaLeague: { type: 'uefa', round: 'league', title: 'Liga Konferencji, faza ligowa' },
  playoffFinal: { type: 'cup', playoff: true, round: 'F', stage: 'final', title: 'Baraże o awans, finał' },
};
const ctxOf = (name) => briefingContext({ pWin: 0.4, pLose: 0.33, venue: 'home', ...FIX[name] });

const SEEDS = Array.from({ length: 30 }, (_, i) => `s${i}`);
/** Wszystkie teksty fazy w kontekście (wszystkie tony, wiele ziaren, kilka wyników). */
function allTexts(c, phase) {
  const out = new Set();
  const tones = Object.keys(phase === 'post' ? POST_TONES : TONES);
  const states = phase === 'half' ? [[1, 0], [2, 0], [0, 0], [0, 1], [0, 2]] : phase === 'post' ? ['W', 'D', 'L'] : [null];
  const outcomes = phase !== 'post' ? [null] : !c.knockout || c.leg?.n === 1 ? [null]
    : c.kind === 'playoffFinal' ? ['promoted', 'pout'] : c.final ? ['trophy', 'lostFinal'] : ['adv', 'out'];
  for (const t of tones) for (const st of states) for (const oc of outcomes) for (const seed of SEEDS) {
    const opts = { phase, seed };
    if (phase === 'half') opts.score = { for: st[0], against: st[1] };
    if (phase === 'post') opts.result = st;
    out.add(toneQuote(t, { ...c, outcome: oc }, opts));
  }
  return [...out];
}
const every = (name, phases = ['pre', 'half', 'post']) => phases.flatMap((ph) => allTexts(ctxOf(name), ph));

function assertNone(texts, re, why) {
  const bad = texts.filter((t) => re.test(t));
  assert.equal(bad.length, 0, `${why}: ${bad.join(' | ')}`);
}

test('Klasyfikator: rodzaj meczu, stawka, różnica sił, rywal i dwumecz', () => {
  const k = (n) => ctxOf(n);
  assert.equal(k('friendly').key, 'friendly');
  assert.equal(k('leagueNormal').key, 'league');
  assert.equal(k('leagueNormal').stake, null); // lider po 2 kolejkach nie gra „o mistrzostwo”
  assert.equal(k('leagueTitle').stake, 'title');
  assert.equal(k('leagueRelegation').stake, 'relegation');
  assert.ok(k('leagueRelegation').six);
  assert.equal(k('leaguePromotion').stake, 'promotion');
  assert.equal(k('leagueDeadRubber').stake, 'deadRubber');
  assert.equal(k('derby').rival, 'derby');
  assert.equal(k('bigRival').rival, 'rival');
  assert.equal(k('muchWeaker').gap, 'muchWeaker');
  assert.equal(k('muchStronger').gap, 'muchStronger');
  assert.equal(k('cupEarly').kind, 'cupEarly');
  assert.equal(k('cupSemi').kind, 'cupSemi');
  assert.equal(k('cupFinal').kind, 'cupFinal');
  assert.ok(k('cupFinal').final);
  assert.equal(k('supercup').et, 'pens');
  assert.equal(k('cupEarly').et, 'et');
  assert.equal(k('uefaQ1').leg.n, 1);
  assert.equal(k('uefaQ2').key, 'leg2Behind');
  assert.equal(k('uefaQ2ahead').key, 'leg2Ahead');
  assert.ok(k('uefaLeague').points);
  assert.ok(!k('cupEarly').points && !k('friendly').points && !k('supercup').points && !k('uefaQ1').points);
  assert.equal(k('playoffFinal').kind, 'playoffFinal');
  assert.match(k('uefaQ2').label, /Po pierwszym meczu przegrywamy 0:1/);
  assert.match(k('cupSemi').label, /Puchar Polski, półfinał/);
});

test('Puchar, finał, Superpuchar, sparing, dwumecz UEFA i baraż: bez punktów i kolejki', () => {
  for (const n of ['friendly', 'friendlyStrong', 'cupEarly', 'cupEarlyWeak', 'cupSemi', 'cupFinal', 'supercup', 'uefaQ1', 'uefaQ2', 'uefaQ2ahead', 'playoffFinal']) {
    assertNone(every(n), /3 pkt|trzy punkty|punkt|kolejk/i, `${n}: tekst o punktach`);
  }
});

test('Zwykła kolejka ligowa: bez pucharu, trofeum, finału, dwumeczu, baraży, mistrzostwa i spadku', () => {
  for (const n of ['leagueNormal', 'muchWeaker', 'muchStronger']) {
    assertNone(every(n), /puchar|trofeum|finał|dwumecz|rewanż|baraż|mistrzost|spad|utrzyman|awans/i, `${n}: tekst spoza ligi`);
  }
});

test('Derby i rywal tylko wtedy, gdy mecz tego dotyczy', () => {
  for (const n of Object.keys(FIX).filter((x) => x !== 'derby')) assertNone(every(n), /derb|rywal zza miedzy/i, `${n}: derby bez derbów`);
  for (const n of Object.keys(FIX).filter((x) => x !== 'bigRival' && x !== 'derby')) assertNone(every(n, ['pre']), /z tym rywalem|kibice czekają na ten mecz/i, `${n}: wielki rywal bez rywalizacji`);
  const pre = allTexts(ctxOf('derby'), 'pre');
  assert.ok(pre.filter((t) => /derb/i.test(t)).length >= 4, 'derby: teksty o derbach');
  assert.ok(pre.some((t) => /kartk|sprowokować|głową|lodu/i.test(t)), 'derby: emocje pod kontrolą');
});

test('Rewanż i dwumecz tylko w dwumeczu; finał i trofeum tylko w finale', () => {
  for (const n of ['friendly', 'leagueNormal', 'leagueTitle', 'derby', 'cupEarly', 'cupSemi', 'cupFinal', 'supercup', 'uefaLeague', 'playoffFinal']) {
    assertNone(every(n), /rewanż|dwumecz|pierwszego meczu|pierwszym meczu/i, `${n}: rewanż bez dwumeczu`);
  }
  for (const n of ['friendly', 'leagueNormal', 'leagueTitle', 'cupEarly', 'cupSemi', 'uefaQ1', 'uefaLeague', 'playoffFinal']) {
    assertNone(every(n), /trofeum/i, `${n}: trofeum poza finałem`);
  }
  for (const n of ['cupFinal', 'supercup']) assert.ok(allTexts(ctxOf(n), 'pre').filter((t) => /trofeum|finał|superpuchar/i.test(t)).length >= 3, `${n}: mowa o trofeum`);
  assert.ok(allTexts(ctxOf('uefaQ1'), 'pre').some((t) => /rewanż|dwumecz/i.test(t)));
  assert.ok(allTexts(ctxOf('uefaQ2'), 'pre').some((t) => /odrobić|stratę|gonić/i.test(t)));
  assert.ok(allTexts(ctxOf('uefaQ2ahead'), 'pre').some((t) => /zaliczk|przewag/i.test(t)));
});

test('Sparing mówi o sprawdzianie, minutach i zdrowiu; zero pucharu, awansu i stawki tabeli', () => {
  const texts = every('friendly');
  assertNone(texts, /puchar|trofeum|awans|spad|mistrzost|derb/i, 'sparing');
  const pre = allTexts(ctxOf('friendly'), 'pre');
  assert.ok(pre.every((t) => /sparing|kontroln|trening|założe|sprawdz|ćwicz|zdrow|wynik|składzie|obron|minut/i.test(t)), pre.join(' | '));
  assert.ok(pre.some((t) => /zdrow|starć|fauli|wślizg/i.test(t)), 'sparing: bez ryzyka urazów');
  assert.ok(pre.some((t) => /minut/i.test(t)), 'sparing: minuty dla zawodników');
});

test('Wyraźnie słabszy rywal: przestroga przed lekceważeniem; wyraźnie silniejszy: dyscyplina i nic do stracenia', () => {
  const weak = allTexts(ctxOf('muchWeaker'), 'pre');
  assert.ok(weak.filter((t) => /lekceważ|faworyt|papierze|wygra się sam|nadziei/i.test(t)).length >= 6, weak.join(' | '));
  const strong = allTexts(ctxOf('muchStronger'), 'pre');
  assert.ok(strong.filter((t) => /faworyt|silniejsz|nie stawia|lepszy skład|mocniejsz/i.test(t)).length >= 6, strong.join(' | '));
  assertNone(strong, /jesteśmy faworytem|jesteśmy mocniejsi/i, 'silniejszy rywal: my nie jesteśmy faworytem');
  assertNone(weak, /nie macie nic do stracenia|nikt na nas nie stawia/i, 'słabszy rywal: to my jesteśmy faworytem');
});

test('Stawka w lidze: mistrzostwo, utrzymanie, awans i mecz bez stawki mają własne teksty', () => {
  assert.ok(allTexts(ctxOf('leagueTitle'), 'pre').some((t) => /mistrzost|tytuł/i.test(t)));
  assert.ok(allTexts(ctxOf('leagueRelegation'), 'pre').some((t) => /utrzyman|spaść|tabela/i.test(t)));
  assert.ok(allTexts(ctxOf('leaguePromotion'), 'pre').some((t) => /awans/i.test(t)));
  assert.ok(allTexts(ctxOf('leagueDeadRubber'), 'pre').some((t) => /nic się nie zmieni|niewiele się już zmieni|meczów o nic|nic nie musimy/i.test(t)));
  assertNone(every('leagueRelegation'), /mistrzost|awans/i, 'utrzymanie');
  assertNone(every('leagueTitle'), /spaść|utrzyman/i, 'mistrzostwo');
});

test('Każdy kontekst ma własny zestaw tekstów przemów', () => {
  const sig = (n) => JSON.stringify(Object.keys(TONES).map((t) => SEEDS.map((s) => toneQuote(t, ctxOf(n), { seed: s })).sort()));
  const names = Object.keys(FIX);
  const sigs = new Map(names.map((n) => [n, sig(n)]));
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) assert.notEqual(sigs.get(names[i]), sigs.get(names[j]), `${names[i]} i ${names[j]} mają te same teksty`);
  }
});

test('Teksty: bez myślników, bez znaczników, w cudzysłowie, deterministyczne', () => {
  for (const n of Object.keys(FIX)) {
    for (const t of every(n)) {
      assert.ok(!/[\u2014\u2013]/.test(t) && !t.includes(' - '), t);
      assert.ok(!/\[|\]|\{|\}|undefined|null/.test(t), t);
      assert.ok(t.startsWith('„') && t.endsWith('”'), t);
      assert.ok(t.length <= 260, t);
    }
  }
  const c = ctxOf('cupSemi');
  assert.equal(toneQuote('calm', c, { seed: 'x' }), toneQuote('calm', c, { seed: 'x' }));
  assert.equal(toneQuote('calm', null), TONES.calm.quote); // bez kontekstu: stały cytat
});

// ---------------------------------------------------------------- odprawa: cytat, odpowiedzi, asystent, efekty

const pl = (id, persona, extra = {}) => ({ id, name: id, persona, traits: {}, form: [6.8], morale: 12, ...extra });
const team = () => ['Spokojny', 'Ambitny', 'Wrażliwy', 'Lider', 'Narwaniec'].map((p) => pl(p, p));

test('Odprawa przedmeczowa: cytat z kontekstu, a efekty dla silnika bez zmian', () => {
  const c = ctxOf('cupEarly');
  for (const tone of Object.keys(TONES)) {
    const ctx = { rank: 1, pWin: 0.5, clubId: CLUB };
    const a = preMatchBriefing({ players: team(), tone, ctx, seed: 'pp' });
    const b = preMatchBriefing({ players: team(), tone, ctx: { ...ctx, context: c }, seed: 'pp' });
    assert.deepEqual(b.engine, a.engine);
    assert.deepEqual(b.players.map((p) => p.reaction), a.players.map((p) => p.reaction));
    assert.equal(b.quote, toneQuotes('pre', c, { seed: 'pp' })[tone].quote); // ekran i wynik to ten sam cytat
    assert.ok(!/punkt/i.test(b.quote), b.quote);
  }
  const talks = [{ id: 'Lider', kind: 'encourage' }];
  const h0 = halftimeBriefing({ players: team(), tone: 'calm', talks, ctx: { score: { for: 0, against: 0 }, clubId: CLUB }, seed: 'h' });
  const h1 = halftimeBriefing({ players: team(), tone: 'calm', talks, ctx: { score: { for: 0, against: 0 }, clubId: CLUB, context: c }, seed: 'h' });
  assert.deepEqual(h1.engine, h0.engine);
  assert.match(h1.quote, /dogrywk/);
  const p0 = postMatchBriefing({ players: team(), tone: 'focusNext', ctx: { score: { for: 0, against: 1 }, clubId: CLUB }, seed: 'p' });
  const p1 = postMatchBriefing({ players: team(), tone: 'focusNext', ctx: { score: { for: 0, against: 1 }, clubId: CLUB, context: { ...c, outcome: 'out' } }, seed: 'p' });
  assert.deepEqual(p1.morale, p0.morale);
  assert.match(p1.quote, /rozgrywkach się skończyła/);
});

test('Asystent: uzasadnienie zgodne z meczem (sparing, faworyt, derby)', () => {
  const players = team();
  const fr = assistantAdvice('pre', players, { pWin: 0.4, clubId: CLUB, context: ctxOf('friendly') });
  assert.match(fr.text, /sparing/i);
  assertNone([fr.text], /punkt|puchar|trofeum/i, 'asystent w sparingu');
  const d = assistantAdvice('pre', players, { pWin: 0.4, rank: 2, clubId: CLUB, context: ctxOf('derby') });
  assert.match(d.text, /derbach/);
  const w = assistantAdvice('pre', players, { pWin: 0.7, clubId: CLUB, context: ctxOf('muchWeaker') });
  assert.match(w.text, /słabszy|lekceważ/);
  assertNone([w.text], /nie mają nic do stracenia/, 'faworyt nie ma „nic do stracenia”');
});

// ---------------------------------------------------------------- studio: oczekiwania, etykieta, nagłówki

test('Oczekiwania zarządu i nagłówki: bez „trzech punktów” w pucharze, Superpucharze i sparingu', () => {
  const comps = [
    { type: 'friendly' }, { type: 'cup', round: 'R32' }, { type: 'cup', round: 'SF' }, { type: 'cup', round: 'F', stage: 'final' },
    { type: 'supercup', stage: 'final' }, { type: 'uefa', round: 'Q1', leg: 1 }, { type: 'uefa', round: 'Q1', leg: 2 }, { type: 'cup', playoff: true, round: 'F', stage: 'final' },
  ];
  for (const comp of comps) {
    for (const pWin of [0.2, 0.4, 0.5, 0.7]) assert.ok(!/punkt/i.test(boardExpectation(pWin, comp)), JSON.stringify(comp));
    assert.equal(hasPoints(comp), false);
  }
  assert.match(boardExpectation(0.6, { type: 'cup', round: 'F', stage: 'final' }), /trofeum/);
  assert.match(boardExpectation(0.6, { type: 'cup', playoff: true, round: 'F', stage: 'final' }), /awansu do wyższej ligi/);
  assert.match(boardExpectation(0.5, { type: 'league' }), /trzy punkty/); // liga bez zmian
  assert.ok(hasPoints({ type: 'uefa', round: 'league' }));
  const exp = expectations({ pWin: 0.5, pDraw: 0.25, rank: { tags: [] }, comp: 'cup', competition: { type: 'supercup', stage: 'final' } });
  assert.match(exp.board, /trofeum/);
  // nagłówki: w pucharze żadnego o punktach ani kolejce
  const vars = { home: 'A', away: 'B', user: 'A', opp: 'B', comp: 'Pucharu' };
  for (let i = 0; i < 40; i++) {
    for (const h of pickHeadlines('pre', ['derby', 'favAway', 'cup'], vars, { seed: `n${i}`, n: 3, points: false })) assert.ok(!/punkt|kolejk/i.test(h.text), h.text);
  }
  // sparing nie jest „meczem ligowym”
  assert.equal(matchRank({ competition: { type: 'friendly' }, home: { id: 'a' }, away: { id: 'b' } }).label, 'Sparing');
});
