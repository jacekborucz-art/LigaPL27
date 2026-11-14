// Testy odpraw dnia meczowego i studia (src/match/briefings.js, src/match/studio.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  preMatchBriefing, halftimeBriefing, postMatchBriefing, assistantAdvice, expectedTeamZ, halfSituation, preSituation,
  newSpeechMemory, closeMatchMemory, applyTrust, decayTrust, applyBriefing, getTrust, aiChooseSpeech, aiBriefing,
  MAX_TALKS, PERSONAS,
} from '../src/match/briefings.js';
import {
  preMatchStudio, postMatchStudio, odds1X2, suspensionRisk, nextYellowSuspends, HEADLINE_TEMPLATES, formatDate,
  postMatchMessages, preMatchMessages, matchStrength,
} from '../src/match/studio.js';
import { relationWith, applyOutcome } from '../src/career/negotiation.js';
import { outcomeProbs, expectedGoals } from '../src/engine/quickSim.js';
import { CATEGORIES } from '../src/core/inbox.js';

const CLUB = 'lech';
const pl = (id, persona, extra = {}) => ({
  id, name: `Zawodnik ${id}`, persona, clubId: CLUB, morale: 12, form: [6.6, 6.6, 6.6], traits: {}, hidden: {}, ...extra,
});
const team = () => PERSONAS.map((p) => pl(p, p));
const byId = (res, id) => res.players.find((x) => x.id === id);

// ---------------------------------------------------------------- odprawy

test('Odprawa jest deterministyczna i serializowalna', () => {
  const args = { players: team(), tone: 'demand', talks: [{ id: 'Ambitny', kind: 'demand' }], ctx: { rank: 0, pWin: 0.45, clubId: CLUB }, seed: 'mecz-1' };
  const a = preMatchBriefing(args);
  const b = preMatchBriefing(args);
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  const c = preMatchBriefing({ ...args, seed: 'mecz-2' });
  assert.notDeepEqual(a.engine.zStart, c.engine.zStart); // inne ziarno, inny szum
});

test('Różni zawodnicy reagują inaczej na tę samą przemowę', () => {
  const res = halftimeBriefing({ players: team(), tone: 'shout', ctx: { score: { for: 0, against: 0 }, clubId: CLUB }, seed: 's' });
  const z = res.engine.zStart;
  assert.ok(z.Narwaniec > z.Wrażliwy + 4, JSON.stringify(z));
  assert.notEqual(byId(res, 'Narwaniec').reaction, byId(res, 'Wrażliwy').reaction);
  assert.equal(res.engine.cardRisk.Narwaniec.mul, 1.3); // narwaniec po krzyku: ryzyko kartki do 75'
});

test('Krzyk pomaga przy przegrywaniu, ale szkodzi wrażliwym', () => {
  const behind = halfSituation({ score: { for: 0, against: 1 }, xgFor: 0.6, xgAgainst: 0.8 });
  const leading = halfSituation({ score: { for: 1, against: 0 }, xgFor: 0.8, xgAgainst: 0.6 });
  for (const persona of ['Ambitny', 'Lider', 'Narwaniec', 'Spokojny']) {
    const p = [pl(persona, persona)];
    assert.ok(expectedTeamZ(p, 'shout', behind) >= 4, persona);
    assert.ok(expectedTeamZ(p, 'shout', behind) > expectedTeamZ(p, 'calm', behind), persona);
    assert.ok(expectedTeamZ(p, 'shout', leading) < 0, persona);
  }
  const w = [pl('W', 'Wrażliwy')];
  assert.ok(expectedTeamZ(w, 'shout', behind) < expectedTeamZ(w, 'calm', behind));
  assert.ok(expectedTeamZ(w, 'shout', behind) < expectedTeamZ([pl('A', 'Ambitny')], 'shout', behind) - 4);
  const res = halftimeBriefing({ players: w, tone: 'shout', ctx: { score: { for: 0, against: 1 }, clubId: CLUB }, seed: 'x' });
  assert.ok(res.engine.nerves.W >= 1);
  assert.ok(['zdenerwowany', 'urazony'].includes(res.players[0].reaction));
});

test('Pamięć powtórzeń: ta sama przemowa w kolejnych meczach działa słabiej (x0,8)', () => {
  const ctx = { score: { for: 0, against: 1 }, clubId: CLUB };
  const fresh = halftimeBriefing({ players: team(), tone: 'demand', ctx, seed: 'p' });
  let memory = newSpeechMemory();
  for (let i = 0; i < 2; i++) memory = closeMatchMemory({ ...memory, current: ['demand'] });
  assert.equal(memory.last.length, 2);
  const tired = halftimeBriefing({ players: team(), tone: 'demand', ctx, memory, seed: 'p' });
  for (const id of PERSONAS) assert.ok(tired.engine.zStart[id] < fresh.engine.zStart[id], id);
  const p = [pl('L', 'Lider')];
  const sit = halfSituation(ctx);
  const ratio = expectedTeamZ(p, 'demand', sit, memory) / expectedTeamZ(p, 'demand', sit);
  assert.ok(Math.abs(ratio - 0.64) < 0.01, `ratio ${ratio}`);
  // pamięć trzyma tylko 3 mecze
  let m = newSpeechMemory();
  for (let i = 0; i < 5; i++) m = closeMatchMemory({ ...m, current: [`t${i}`] });
  assert.deepEqual(m.last, [['t2'], ['t3'], ['t4']]);
});

test('Krzyk obraca się przeciwko trenerowi: przy pewnym prowadzeniu i po nadużyciu', () => {
  const lead = halftimeBriefing({ players: team(), tone: 'shout', ctx: { score: { for: 2, against: 0 }, xgFor: 2.1, xgAgainst: 0.4, clubId: CLUB }, seed: 'b' });
  assert.equal(lead.team.backfire, true);
  assert.ok(lead.team.backfireText.includes('Krzyk'));
  assert.ok(Object.values(lead.relations).some((r) => r.trust < 50)); // zaufanie spada
  let memory = newSpeechMemory();
  memory = closeMatchMemory({ ...memory, current: ['shout'] });
  memory = closeMatchMemory({ ...memory, current: ['shout'] });
  const overuse = halftimeBriefing({ players: team(), tone: 'shout', ctx: { score: { for: 0, against: 2 }, clubId: CLUB }, memory, seed: 'b' });
  assert.equal(overuse.team.backfire, true);
  const first = halftimeBriefing({ players: team(), tone: 'shout', ctx: { score: { for: 0, against: 2 }, clubId: CLUB }, seed: 'b' });
  assert.equal(first.team.backfire, false);
});

test('Ta sama przemowa działa inaczej w innej sytuacji: pochwała przy 0:2 mimo przewagi xG', () => {
  const players = team();
  const unlucky = { score: { for: 0, against: 2 }, xgFor: 1.9, xgAgainst: 0.6 };
  const outplayed = { score: { for: 0, against: 2 }, xgFor: 0.3, xgAgainst: 1.8 };
  assert.equal(halfSituation(unlucky).key, 'pechowo');
  assert.equal(halfSituation(outplayed).key, 'zdominowani');
  const zU = (t) => expectedTeamZ(players, t, halfSituation(unlucky));
  const zO = (t) => expectedTeamZ(players, t, halfSituation(outplayed));
  assert.ok(zU('praise') > zU('shout'));
  assert.ok(zO('praise') < zO('shout'));
  const adv = assistantAdvice('half', players, unlucky);
  assert.equal(adv.tone, 'praise');
  assert.ok(adv.text.includes('Gramy lepiej'));
  assert.notEqual(assistantAdvice('half', players, outplayed).tone, 'praise');
});

test('Ranga derbów zwiększa efekt przemowy, a wrażliwych paraliżuje presja', () => {
  const a = [pl('A', 'Ambitny')];
  const w = [pl('W', 'Wrażliwy')];
  const league = preSituation({ rank: 0, pWin: 0.4 });
  const derby = preSituation({ rank: 2, pWin: 0.4 });
  assert.ok(expectedTeamZ(a, 'demand', derby) > expectedTeamZ(a, 'demand', league) + 1.5);
  assert.ok(expectedTeamZ(w, 'calm', derby) < expectedTeamZ(w, 'calm', league));
  const wBigGame = [pl('W2', 'Wrażliwy', { hidden: { WAZ: 16 } })]; // WAZ >= 14: zna wielkie mecze
  assert.ok(expectedTeamZ(wBigGame, 'calm', derby) > expectedTeamZ(wBigGame, 'calm', league));
  const res = preMatchBriefing({ players: w, tone: 'calm', ctx: { rank: 2, clubId: CLUB }, seed: 'd' });
  assert.equal(res.engine.nerves.W ?? 0, 0); // spokojna przemowa zdejmuje część nerwów
  const res2 = preMatchBriefing({ players: w, tone: 'demand', ctx: { rank: 2, clubId: CLUB }, seed: 'd' });
  assert.ok(res2.engine.nerves.W >= 1);
});

test('Rozmowy indywidualne: maksymalnie 3, jedna na zawodnika, tylko dozwolone w fazie', () => {
  const players = team();
  const talks = players.slice(0, 4).map((p) => ({ id: p.id, kind: 'encourage' }));
  assert.equal(MAX_TALKS, 3);
  assert.throws(() => preMatchBriefing({ players, tone: 'calm', talks, ctx: {} }), RangeError);
  assert.throws(() => preMatchBriefing({ players, tone: 'calm', talks: [{ id: 'Lider', kind: 'calm' }, { id: 'Lider', kind: 'demand' }], ctx: {} }), RangeError);
  assert.throws(() => preMatchBriefing({ players, tone: 'calm', talks: [{ id: 'Lider', kind: 'criticize' }], ctx: {} }), RangeError);
  const ok = preMatchBriefing({
    players, tone: 'calm', ctx: { atRisk: ['Narwaniec'], clubId: CLUB }, seed: 'k',
    talks: [{ id: 'Narwaniec', kind: 'cardWarning' }, { id: 'Wrażliwy', kind: 'encourage' }, { id: 'Ambitny', kind: 'freedom' }],
  });
  assert.ok(ok.engine.cardRisk.Narwaniec.mul < 1); // ostrzeżenie przed kartką działa
  assert.equal(byId(ok, 'Wrażliwy').talk.talkLabel, 'Podbuduj');
});

test('Gracz widzi reakcje bez liczb: ikona, etykieta i krótki tekst', () => {
  const allowed = new Set(['zmotywowany', 'spokojny', 'obojetny', 'zdenerwowany', 'urazony']);
  for (const tone of ['calm', 'praise', 'demand', 'shout', 'noPressure', 'defend']) {
    const res = halftimeBriefing({ players: team(), tone, talks: [{ id: 'Lider', kind: 'praise' }], ctx: { score: { for: 1, against: 1 }, clubId: CLUB }, seed: tone });
    for (const r of res.players) {
      assert.ok(allowed.has(r.reaction));
      for (const t of [r.text, r.label, r.talk?.text, r.talk?.quote].filter(Boolean)) {
        assert.ok(!/\d/.test(t), t);
        assert.ok(!t.includes('\u2014'), t);
      }
    }
    assert.ok(!/\d/.test(res.team.summary));
  }
});

// ---------------------------------------------------------------- relacja trener-zawodnik

test('Krytyka wrażliwego po dobrym meczu obniża zaufanie i zostawia urazę', () => {
  const w = pl('W', 'Wrażliwy');
  const ctx = { score: { for: 2, against: 0 }, ratings: { W: 7.6 }, clubId: CLUB, date: '2026-11-14' };
  const res = postMatchBriefing({ players: [w], tone: 'neutral', talks: [{ id: 'W', kind: 'criticize' }], ctx, seed: 'k' });
  const rel = res.relations.W;
  assert.ok(rel.trust < 50, `trust ${rel.trust}`);
  assert.ok(rel.grudge > 0);
  assert.equal(res.players[0].talk.reaction, 'urazony');
  assert.ok(res.morale.W.delta < 0);
  // zasłużona krytyka ambitnego po słabym meczu nie psuje relacji
  const a = pl('A', 'Ambitny');
  const resA = postMatchBriefing({ players: [a], tone: 'neutral', talks: [{ id: 'A', kind: 'criticize' }], ctx: { ...ctx, ratings: { A: 5.6 } }, seed: 'k' });
  assert.ok((resA.relations.A?.trust ?? 50) >= 50);
});

test('Zaufanie to jedno pole wspólne z negocjacjami: relations[clubId].trust', () => {
  const w = pl('W', 'Wrażliwy', { relations: { [CLUB]: { trust: 60 } } });
  assert.equal(getTrust(w, CLUB), 2); // (60 - 50) / 5
  const res = postMatchBriefing({ players: [w], tone: 'praise', talks: [{ id: 'W', kind: 'praise' }], ctx: { score: { for: 1, against: 0 }, ratings: { W: 7.4 }, clubId: CLUB }, seed: 'z' });
  const after = applyBriefing(w, res);
  assert.equal(after.relations[CLUB].trust, relationWith(after, CLUB).trust); // negocjacje czytają to samo pole
  assert.ok(after.relations[CLUB].trust > 60);
  assert.ok(after.morale > w.morale); // morale przez morale.js applyMorale
  assert.equal(w.relations[CLUB].trust, 60); // brak mutacji
  // negocjacje zmieniają to samo zaufanie i nie gubią pamięci odpraw
  const neg = applyOutcome(structuredClone(after), { clubId: CLUB, date: '2026-11-20', trustDelta: -10, kind: 'renew', refused: true });
  assert.equal(neg.relations[CLUB].trust, after.relations[CLUB].trust - 10);
  assert.ok(Array.isArray(neg.relations[CLUB].briefMem) && neg.relations[CLUB].briefMem.length > 0);
  assert.ok(Object.keys(after).every((k) => k !== 'trust')); // brak drugiego pola zaufania
});

test('Pamięć urazy: powtórzona krzywda boli mocniej, a niskie zaufanie nie wraca, dopóki trwa uraza', () => {
  const w = pl('W', 'Wrażliwy');
  const r1 = applyTrust(w, -2, 'post:criticize', { clubId: CLUB, date: '2026-11-01' });
  const w1 = { ...w, relations: { [CLUB]: r1 } };
  const r2 = applyTrust(w1, -2, 'post:criticize', { clubId: CLUB, date: '2026-11-08' });
  assert.equal(r1.trust, 40);
  assert.equal(r2.trust, 25); // druga krzywda x1,5
  const w2 = { ...w, relations: { [CLUB]: r2 } };
  assert.equal(decayTrust(w2, { clubId: CLUB, date: '2026-11-15' }).trust, 25); // uraza trzyma
  const healed = decayTrust({ ...w, relations: { [CLUB]: { trust: 30 } } }, { clubId: CLUB, weeks: 3 });
  assert.ok(healed.trust > 30 && healed.trust < 50); // bez urazy wraca ku 50
  const good = decayTrust({ ...w, relations: { [CLUB]: { trust: 80 } } }, { clubId: CLUB, weeks: 2 });
  assert.ok(good.trust < 80 && good.trust > 50); // dobra relacja też wygasa
  assert.ok(applyTrust({ ...w, relations: { [CLUB]: { trust: 98 } } }, 5, 'x', { clubId: CLUB }).trust <= 100);
});

test('Odprawa pomeczowa: pochwała po wygranej podnosi morale, krytyka po porażce dzieli szatnię', () => {
  const players = team();
  const win = postMatchBriefing({ players, tone: 'praise', ctx: { score: { for: 2, against: 0 }, xgFor: 1.8, xgAgainst: 0.7, clubId: CLUB }, seed: 'w' });
  assert.ok(Object.values(win.morale).every((m) => m.delta > 0));
  assert.equal(win.team.moraleTrend, 'up');
  const loss = postMatchBriefing({ players, tone: 'criticize', ctx: { score: { for: 0, against: 2 }, xgFor: 0.4, xgAgainst: 1.9, clubId: CLUB }, seed: 'w' });
  assert.ok(loss.morale.Ambitny.delta > loss.morale.Wrażliwy.delta);
  const derby = postMatchBriefing({ players, tone: 'praise', ctx: { score: { for: 2, against: 0 }, xgFor: 1.8, xgAgainst: 0.7, rank: 2, clubId: CLUB }, seed: 'w' });
  assert.ok(derby.morale.Lider.delta > win.morale.Lider.delta);
});

// Konferencja prasowa: tests/press.test.mjs

// ---------------------------------------------------------------- AI

test('AI wybiera przemowę zgodnie z sytuacją i osobowością trenera', () => {
  assert.equal(aiChooseSpeech('O', { phase: 'half', diff: -2 }), 'shout');
  assert.equal(aiChooseSpeech('S', { phase: 'half', diff: 1 }), 'defend');
  assert.equal(aiChooseSpeech('P', { phase: 'half', diff: -1, xgDiff: 0.9 }), 'praise'); // pechowo
  assert.equal(aiChooseSpeech('P', { phase: 'pre', pWin: 0.18 }), 'noPressure');
  assert.equal(aiChooseSpeech('O', { phase: 'post', diff: -2 }), 'criticize');
  assert.equal(aiChooseSpeech('S', { phase: 'post', diff: 1 }), 'focusNext');
  // pamięć powtórzeń działa też na AI
  let memory = newSpeechMemory();
  memory = closeMatchMemory({ ...memory, current: ['shout'] });
  memory = closeMatchMemory({ ...memory, current: ['shout'] });
  assert.equal(aiChooseSpeech('O', { phase: 'half', diff: -2, memory }), 'demand');
  const ai = aiBriefing({ coach: 'O', personaMix: { Spokojny: 6, Ambitny: 4, Wrażliwy: 3, Lider: 2, Narwaniec: 3 } }, { phase: 'half', diff: -2 }, 'ai1');
  assert.equal(ai.tone, 'shout');
  assert.ok(ai.zByPersona.Narwaniec > ai.zByPersona.Wrażliwy);
  assert.ok(ai.teamZ > 0);
});

// ---------------------------------------------------------------- studio

const POS = ['BR', 'BR', 'ŚO', 'ŚO', 'ŚO', 'BO', 'BO', 'DP', 'ŚP', 'ŚP', 'SP', 'SP', 'OP', 'NAP', 'NAP', 'SN', 'BO', 'ŚP'];
const squad = (pref, L) => POS.map((pos, i) => ({
  id: `${pref}${i}`, name: `${pref.toUpperCase()} Gracz${i}`, pos, ovr: L - i * 0.04, persona: 'Spokojny',
  yc: { league: i === 3 ? 3 : i === 4 ? 2 : i === 6 ? 7 : 0 }, fresh: 95, form: [6.8, 7], morale: 12,
  season: { g: pos === 'NAP' ? 6 : 0, a: 1, rating: 7 },
}));
const club = (id, name, L, extra = {}) => ({ id, name, region: 'krakow', prestige: 7, squad: squad(id.slice(0, 1), L), formation: '4-4-2', last5: ['W', 'R', 'W'], tactics: {}, coach: 'P', ...extra });
const studioCtx = (extra = {}) => ({
  date: '2026-11-14', competition: { type: 'league', name: 'Ekstraklasa' }, userClubId: 'wisla-krakow',
  home: club('wisla-krakow', 'Wisła Kraków', 11.8), away: club('cracovia', 'Cracovia', 11.2, { tactics: { pressing: 'wysoki', passing: 'krotkie' } }),
  weather: { type: 'deszcz', tempC: 6 }, pitch: 'dobra', referee: { name: 'Jan Sędzia', strictness: 1.25 }, stadium: { capacity: 33000 },
  board: { trust: 55 }, fans: { mood: 60 }, seed: 'st', ...extra,
});

test('Studio liczy szanse 1X2 modelem Poissona z quickSim: sumują się do 1', () => {
  const pre = preMatchStudio(studioCtx());
  const o = pre.odds;
  assert.ok(Math.abs(o.home + o.draw + o.away - 1) < 1e-9);
  assert.equal(o.pct.home + o.pct.draw + o.pct.away, 100);
  assert.ok(o.home > o.away); // mocniejszy gospodarz
  const H = matchStrength(studioCtx().home); const A = matchStrength(studioCtx().away);
  const { lH, lA } = expectedGoals(H, A);
  assert.ok(Math.abs(outcomeProbs(lH, lA).home - o.home) < 1e-12); // ten sam model co szybka symulacja
  const even = odds1X2({ ovr11: 12 }, { ovr11: 12 });
  assert.ok(even.home > 0.4 && even.home < 0.47 && even.draw > 0.25); // kalibracja ekspert 6.1 (e): 44/28/29
  assert.ok(pre.assistant.strength.notes.length > 0);
  assert.ok(pre.assistant.counters.some((c) => c.includes('pressing')));
});

test('Studio wypisuje zawodników zagrożonych pauzą za kartki', () => {
  const pre = preMatchStudio(studioCtx());
  const ids = pre.suspensionRisk.user.map((x) => x.id);
  assert.ok(ids.includes('w3') && ids.includes('w6')); // 3. i 7. żółta: następna to pauza
  assert.ok(!ids.includes('w4'));
  assert.ok(pre.assistant.warnings.some((w) => w.includes('kolejna żółta')));
  assert.deepEqual(pre.forBriefing.atRisk.sort(), ['w3', 'w6']);
  // UEFA od fazy ligowej: pauza po 4., 6., 8.; eliminacje: po 3., 5.
  assert.equal(nextYellowSuspends(3, 'uefa', 'main'), true);
  assert.equal(nextYellowSuspends(4, 'uefa', 'main'), false);
  assert.equal(nextYellowSuspends(2, 'uefa', 'q'), true);
  assert.equal(nextYellowSuspends(3, 'uefa', 'final'), false);
  assert.equal(suspensionRisk([{ id: 'x', yc: { cup: 3 } }], 'cup').length, 1);
});

test('Studio przedmeczowe: ranga, absencje, sędzia, frekwencja, data MMM D, YYYY', () => {
  const ctx = studioCtx();
  ctx.home.squad[5].injuryDays = 21;
  ctx.away.squad[2].suspended = 1;
  const pre = preMatchStudio(ctx);
  assert.equal(pre.date, '14 lis 2026');
  assert.equal(formatDate('2027-03-05'), '5 mar 2027');
  assert.equal(pre.preview.rank.level, 2);
  assert.ok(pre.preview.rank.tags.includes('derby'));
  assert.equal(pre.absences.home.injured[0].id, 'w5');
  assert.equal(pre.absences.away.suspended[0].id, 'c2');
  assert.ok(!pre.lineups.home.some((x) => x.id === 'w5'));
  assert.equal(pre.lineups.home.filter((x) => x.pos === 'BR').length, 1);
  assert.equal(pre.conditions.referee.label, 'Surowy');
  assert.ok(pre.conditions.referee.expectedYellows > 4.4);
  assert.ok(pre.conditions.attendance.expected <= 33000);
  assert.equal(pre.keyPlayers.opponent.length, 3);
  assert.ok(pre.expectations.notes.some((n) => n.includes('Derbów')));
  assert.equal(preMatchMessages(pre, { date: '2026-11-14' })[0].category, 'media');
});

test('Nagłówki: co najmniej 40 szablonów i brak powtórzeń w kolejnych 5 meczach', () => {
  assert.ok(HEADLINE_TEMPLATES.length >= 40);
  assert.ok(HEADLINE_TEMPLATES.every((h) => !h.text.includes('\u2014') && !h.text.includes(' - ')));
  assert.equal(new Set(HEADLINE_TEMPLATES.map((h) => h.id)).size, HEADLINE_TEMPLATES.length);
  let history = [];
  const perMatch = [];
  const events = [
    { min: 20, type: 'goal', side: 0, player: 'w13', name: 'W Gracz13', xg: 0.3 },
    { min: 88, type: 'goal', side: 0, player: 'w14', name: 'W Gracz14', xg: 0.4 },
  ];
  for (let m = 0; m < 8; m++) {
    const pre = preMatchStudio(studioCtx({ headlineHistory: history, date: '2026-11-14' }));
    const post = postMatchStudio({
      ...studioCtx({ headlineHistory: history, date: '2026-11-14' }), events, pre: pre.forPost,
      ratings: [{ id: 'w14', name: 'W Gracz14', side: 0, rating: 8.2 }],
    });
    history = post.headlineHistory;
    perMatch.push(history.at(-1));
    for (const h of [...pre.headlines, ...post.headlines]) assert.ok(!/\{\w+\}/.test(h.text), h.text);
  }
  for (let i = 0; i + 5 <= perMatch.length; i++) {
    const ids = perMatch.slice(i, i + 5).flat();
    assert.equal(new Set(ids).size, ids.length, `okno ${i}: ${ids.join(', ')}`);
  }
});

test('Studio pomeczowe: statystyki ze zdarzeń, VAR, zawodnik meczu, kontrowersje, tabela, pauzy i poczta', () => {
  const ctx = studioCtx();
  const pre = preMatchStudio(ctx);
  const events = [
    { min: 12, type: 'goal', side: 1, player: 'c13', name: 'C Gracz13', xg: 0.3 },
    { min: 30, type: 'yellow', side: 0, player: 'w3', name: 'W Gracz3' },
    { min: 38, type: 'goal', side: 0, player: 'w13', name: 'W Gracz13', xg: 0.2 },
    { min: 40, type: 'varOverturn', side: 0, cancelGoal: true, xg: 0.2 },
    { min: 54, type: 'penalty', side: 0 },
    { min: 55, type: 'goal', side: 0, player: 'w13', name: 'W Gracz13', penalty: true, xg: 0.78 },
    { min: 60, type: 'injury', side: 0, player: 'w9', name: 'W Gracz9', days: 14, injuryType: 'Skręcenie stawu skokowego' },
    { min: 70, type: 'red', side: 1, player: 'c3', name: 'C Gracz3' },
    { min: 88, type: 'goal', side: 0, player: 'w14', name: 'W Gracz14', xg: 0.4 },
    { type: 'pass', side: 0, count: 400 }, { type: 'passFail', side: 0, count: 80 },
  ];
  const post = postMatchStudio({
    ...ctx, events, pre: pre.forPost,
    ratings: [{ id: 'w14', name: 'W Gracz14', side: 0, rating: 8.1 }, { id: 'c13', name: 'C Gracz13', side: 1, rating: 7.4 }],
    tableBefore: [{ id: 'wisla-krakow', name: 'Wisła Kraków', pts: 20, gf: 18, ga: 12 }, { id: 'cracovia', name: 'Cracovia', pts: 23, gf: 16, ga: 10 }],
  });
  assert.equal(post.result.score, '2:1'); // gol anulowany przez VAR się nie liczy
  assert.equal(post.result.halftime, '0:1');
  assert.equal(post.stats.home.passes, 480);
  assert.equal(post.stats.home.passAccuracy, 83);
  assert.equal(post.motm.id, 'w14');
  const mins = post.keyMoments.map((k) => k.min);
  assert.deepEqual(mins, [...mins].sort((a, b) => a - b));
  assert.deepEqual(new Set(post.controversies.map((c) => c.kind)), new Set(['var', 'penalty', 'red']));
  assert.ok(post.reactions.board.delta > 0 && post.reactions.fans.delta > 0); // wygrane derby
  assert.equal(post.table.user.after, 1);
  assert.ok(post.suspensions.some((s) => s.id === 'c3' && s.reason === 'czerwona kartka'));
  assert.ok(post.suspensions.some((s) => s.id === 'w3' && s.reason === 'nadmiar żółtych kartek'));
  assert.equal(post.injuries[0].id, 'w9');
  assert.ok(post.headline.text.length > 0);
  assert.equal(post.forBriefing.clubId, 'wisla-krakow');
  const msgs = postMatchMessages(post, { date: '2026-11-14', matchId: 'm1' });
  assert.ok(msgs.every((m) => CATEGORIES[m.category]));
  assert.deepEqual(msgs.map((m) => m.category).sort(), ['board', 'media', 'staff']);
});

test('Studio po meczu pucharowym: zarząd i kibice rozpoznają trofeum i awans po karnych, rangę i szanse przed meczem', () => {
  const ctx = studioCtx();
  const pre = preMatchStudio(ctx);
  const events = [{ min: 20, type: 'goal', side: 0, player: 'w13', name: 'W Gracz13', xg: 0.3 }, { min: 70, type: 'goal', side: 1, player: 'c13', name: 'C Gracz13', xg: 0.3 }];
  const run = (tie) => postMatchStudio({ ...ctx, competition: { type: 'supercup', name: 'Superpuchar Polski', stage: 'final' }, events, pre: pre.forPost, ratings: [], tie });
  const tie = { kind: 'supercup', final: true, knockout: true, points: false, leg: null, title: 'Superpuchar Polski' };
  const trophy = run({ ...tie, outcome: 'trophy', won: true, shootout: [4, 3], pAdv: 0.45 });
  assert.ok(trophy.reactions.board.delta >= 4 && trophy.reactions.fans.delta >= 5, JSON.stringify(trophy.reactions));
  assert.match(trophy.reactions.board.text, /trofeum/);
  assert.equal(trophy.result.label, 'Zwycięstwo po rzutach karnych');
  assert.equal(trophy.result.score, '1:1, k. 4:3');
  assert.equal(trophy.result.decided, 'W');
  assert.ok(!trophy.headlines.some((h) => /remis|punkt/i.test(h.text)), trophy.headlines.map((h) => h.text).join(' | '));
  // Odpadnięcie faworyta po karnych w ćwierćfinale PP: rozczarowanie, ale nie jak po kompromitacji; przegrany finał jako słabszy: łagodnie
  const cup = { kind: 'cupQF', final: false, knockout: true, points: false, leg: null, title: 'Puchar Polski' };
  const outFav = run({ ...cup, outcome: 'out', won: false, shootout: [3, 4], pAdv: 0.8 });
  const outDog = run({ ...cup, outcome: 'out', won: false, shootout: [3, 4], pAdv: 0.3 });
  assert.ok(outFav.reactions.board.delta < outDog.reactions.board.delta && outFav.reactions.board.delta < 0);
  assert.match(outFav.reactions.fans.text, /rzutach karnych/);
  const advDog = run({ ...cup, outcome: 'adv', won: true, shootout: [5, 4], pAdv: 0.3 });
  assert.ok(advDog.reactions.board.delta > 0 && advDog.reactions.fans.delta > 0);
  assert.doesNotMatch(advDog.reactions.board.text, /wściekły|rozczarowany/);
});
