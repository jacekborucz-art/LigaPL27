// Trening klubów AI (docs/trening-ai.md): kluby AI realizują codzienny plan asystenta z tymi samymi wzorami
// co klub gracza. Testy pilnują, że AI trenuje naprawdę (zmęczenie, ostrość, urazy, rozwój, stałe fragmenty),
// że wzory są wspólne i że ani gracz z planem domyślnym, ani AI nie mają przewagi z samego treningu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, playQuick, applyResult, squadFor } from '../src/season/season.js';
import { processDay, continueUntilStop, primaryAction, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { teamRating } from '../src/engine/teamStrength.js';
import { OFF } from '../src/data/attributes.js';
import '../src/season/dailySystems.js';
import * as TR from '../src/training/index.js';
import { AI_PLAN, SESSIONS, INTENSITY } from '../src/training/config.js';
import { allClubSets, aiStimFor } from '../src/training/aiClubs.js';
import { trainingInjuryChance } from '../src/training/load.js';

function newGame(clubId = 'widzew', seed = 4242) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId));
  processDay(g);
  return g;
}

/** Pasywny gracz: same „Dalej”, mecze gracza szybką symulacją, decyzje odrzucone. */
function playUntil(g, until, onDay) {
  const rng = new Rng(`pasywny:${g.seed}`);
  let guard = 0;
  while (g.date < until && guard++ < 3000) {
    const a = primaryAction(g);
    if (a.kind === 'play') { applyResult(g, a.match, playQuick(g, a.match, rng), rng); continue; }
    if (a.kind === 'decide') { g.inbox = g.inbox.map((m) => ({ ...m, resolved: true })); continue; }
    continueUntilStop(g, { maxDays: 1 });
    onDay?.(g);
  }
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

test('Plan klubu AI: akcent według typu trenera, normalne obciążenia, plan asystenta dla własnego terminarza', () => {
  assert.deepEqual(TR.aiPlanFor('legia'), { clubId: 'legia', accent: AI_PLAN.accent.O, load: 'normalna' });
  assert.equal(TR.aiPlanFor('widzew').accent, 'zrownowazony');
  const g = newGame('widzew');
  playUntil(g, '2026-08-20');
  const sets = allClubSets(g).get('legia');
  // Nigdy ciężkich zajęć dzień przed meczem i zawsze dzień meczu bez zajęć
  for (let d = '2026-08-21'; d < '2026-10-01'; d = addDays(d, 1)) {
    const ctx = TR.dayContext(g, d, sets, null);
    const day = TR.autoDay(g, d, ctx, TR.aiPlanFor('legia'));
    if (ctx.role === 'MD') assert.equal(day.kind, 'match');
    if (ctx.b === 1) assert.ok(day.sessions.every((x) => x.int !== 'high'), `${d} ${JSON.stringify(day.sessions)}`);
  }
});

test('Kluby AI trenują naprawdę: zajęcia męczą, budują ostrość i bodziec rozwojowy, stałe fragmenty z zajęć', () => {
  const g = newGame('widzew');
  playUntil(g, '2026-09-20');
  // Każdy klub AI ma w miesiącu bodziec z zajęć, a zawodnicy udział w nim
  const ai = Object.keys(g.world.clubs).filter((id) => id !== 'widzew');
  for (const id of ai) {
    const st = g.training.clubs[id].aiStim;
    assert.ok(st && st.dpOut > 0, `${id}: brak bodźca z zajęć`);
  }
  const p = squadOf(g.world, 'legia').find((x) => !(x.injuryDays > 0));
  assert.ok(p.aiTr && p.aiTr.dp > 0);
  // Klub z dobrym asystentem (q >= 12) ćwiczy stałe fragmenty dwa dni przed meczem, jak plan gracza
  const strong = ai.filter((id) => TR.staffQ(g, id, 'asystent') >= 12);
  assert.ok(strong.length, 'są kluby z dobrym asystentem');
  assert.ok(mean(strong.map((id) => g.training.clubs[id].sp)) > 50, 'stałe fragmenty ponad poziom neutralny');
  // Dzień z zajęciami zmienia świeżość zawodnika AI (zmęczenie albo regeneracja), dzień meczu nie
  const before = new Map(Object.values(g.world.players).filter((x) => x.clubId && x.clubId !== 'widzew').map((x) => [x.id, x.fresh]));
  const day = g.date;
  TR.processAiDay(g, day);
  const changed = [...before].filter(([id, f]) => g.world.players[id].fresh !== f).length;
  assert.ok(changed > 100, `zmiana świeżości u ${changed} zawodników AI`);
});

test('Wspólny wzór urazu: suma ryzyka zajęć podana przez klub AI daje to samo co lista zajęć gracza', () => {
  const p = { hidden: { ODP: 9 } };
  const sessions = [{ type: 'sila', int: 'high' }, { type: 'stale', int: 'low' }];
  const sessionMul = sessions.reduce((s, x) => s + INTENSITY[x.int].inj * SESSIONS[x.type].inj, 0);
  const ctx = { age: 31, acwr: 1.4, fitQ: 12, campQ: 0.5, baseMul: 1.2, fresh: 65, mode: 'normal', returning: true };
  assert.equal(trainingInjuryChance(p, { ...ctx, sessions }), trainingInjuryChance(p, { ...ctx, sessionMul }));
});

test('Rozwój AI: bodziec z planu (nie stały mnożnik), akcent młodych na najsłabszy kluczowy atrybut', () => {
  const g = newGame('widzew');
  let userS = null; let aiS = null;
  playUntil(g, '2026-10-31', (gg) => {
    if (gg.date !== '2026-10-31') return;
    // Ostatni dzień miesiąca: bodźce przed miesięcznym krokiem rozwoju
    const regular = (x) => x.pos !== 'BR' && (x.season?.apps ?? 0) >= 5;
    userS = mean(squadOf(gg.world, 'widzew').filter(regular).map((x) => Object.values(x.training.stim).reduce((s, v) => s + v, 0)));
    const pClubs = Object.keys(gg.world.clubs).filter((id) => id !== 'widzew' && TR.aiPlanFor(id).accent === 'zrownowazony');
    aiS = mean(pClubs.flatMap((id) => squadOf(gg.world, id).filter((x) => regular(x) && x.age > AI_PLAN.focusMaxAge))
      .map((x) => Object.values(aiStimFor(gg, x) ?? {}).reduce((s, v) => s + v, 0)));
  });
  assert.ok(userS > 8 && aiS > 8, `bodziec gracza ${userS}, AI ${aiS}`);
  assert.ok(Math.abs(aiS - userS) / userS < 0.25, `ten sam plan, podobny bodziec: gracz ${userS.toFixed(1)}, AI ${aiS.toFixed(1)}`);
  // Młody zawodnik AI ma akcent na kluczowy atrybut pozycji i dodatkowy bodziec za to
  const young = Object.values(g.world.players).find((x) => x.clubId && x.clubId !== 'widzew' && x.squad !== 'Y' && x.pos !== 'BR' && x.age <= 19 && x.aiTr?.dd > 0);
  if (young) {
    const a = TR.aiFocusAttr(young);
    const off = { ...OFF[young.pos] };
    assert.ok(off[a] >= 3 || young.variant, `${young.pos}: ${a}`);
  }
  // Stary zapis bez stanu AI: rozwój standardowy (null), bez błędu
  const p = squadOf(g.world, 'legia')[0];
  const saved = p.aiTr; delete p.aiTr;
  assert.equal(aiStimFor(g, p), null);
  p.aiTr = saved;
});

test('Balans: w dniu meczu klub AI i klub gracza z planem domyślnym mają podobną świeżość, ostrość i składniki treningu', () => {
  const g = newGame('widzew');
  const rows = { user: [], ai: [] };
  const probe = (gg) => {
    // Początek dnia meczowego (stan po poprzednim dniu): tak samo dla gracza i klubów AI
    const next = addDays(gg.date, 1);
    for (const f of gg.fixtures) {
      if (f.date !== next || f.comp !== 'ekstraklasa') continue;
      for (const id of [f.home, f.away]) {
        const r = teamRating(squadFor(gg, id, f.comp));
        const xi = r.xi.map((x) => x.player);
        const b = r.breakdown;
        (id === 'widzew' ? rows.user : rows.ai).push({
          fresh: mean(xi.map((x) => x.fresh ?? 95)), sharp: mean(xi.map((x) => x.sharp ?? 70)),
          load: b.trainingLoad ?? 0, sp: b.trainingSetPieces ?? 0, coh: b.trainingCohesion ?? 0,
        });
      }
    }
  };
  playUntil(g, '2026-11-30', probe);
  const m = (side, k) => mean(rows[side].map((x) => x[k]));
  assert.ok(rows.user.length >= 8 && rows.ai.length > 100);
  assert.ok(Math.abs(m('user', 'fresh') - m('ai', 'fresh')) < 3, `świeżość gracz ${m('user', 'fresh')} AI ${m('ai', 'fresh')}`);
  assert.ok(Math.abs(m('user', 'sharp') - m('ai', 'sharp')) < 4, `ostrość gracz ${m('user', 'sharp')} AI ${m('ai', 'sharp')}`);
  const terms = (side) => m(side, 'load') + m(side, 'sp') + m(side, 'coh');
  assert.ok(Math.abs(terms('user') - terms('ai')) < 0.08, `składniki treningu gracz ${terms('user').toFixed(3)} AI ${terms('ai').toFixed(3)}`);
  // AI ma też koszt treningu: ciężkie nogi i przeciążenie liczą się dla zawodników AI
  assert.ok(m('ai', 'load') < 0, 'obciążenie treningowe AI nie jest darmowe');
});

test('Urazy treningowe AI: ta sama skala co u gracza z planem domyślnym (na zawodnika i dzień)', () => {
  const g = newGame('widzew');
  const seen = new Set(); const count = { user: 0, ai: 0 };
  let days = 0;
  playUntil(g, '2027-03-31', (gg) => {
    days++;
    for (const p of Object.values(gg.world.players)) {
      if (!p.clubId || !p.injury?.training || p.injury.since !== gg.date) continue;
      const k = `${p.id}:${gg.date}`;
      if (seen.has(k)) continue;
      seen.add(k);
      count[p.clubId === 'widzew' ? 'user' : 'ai']++;
    }
  });
  const nAi = Object.keys(g.world.clubs).length - 1;
  const perUser = count.user; const perAi = count.ai / nAi;
  assert.ok(perAi > 4, `urazy na klub AI: ${perAi.toFixed(1)}`);
  // Jeden sezon jednego klubu jest losowy: pilnujemy tylko skali (gracz bez obozu ma trochę więcej urazów)
  assert.ok(perUser < 3 * perAi + 4 && perAi < 3 * perUser + 4, `gracz ${perUser}, AI ${perAi.toFixed(1)} na klub`);
});

test('Zapis: stan treningu zawodnika AI jest mały, przechodzi przez JSON, a gra toczy się dalej', () => {
  const g = newGame('widzew');
  playUntil(g, '2026-08-15');
  const tr = squadOf(g.world, 'legia').find((p) => p.aiTr).aiTr;
  assert.ok(JSON.stringify(tr).length < 120, JSON.stringify(tr));
  const back = JSON.parse(JSON.stringify(g));
  TR.ensureTraining(back);
  playUntil(back, '2026-09-05');
  assert.ok(squadOf(back.world, 'legia').some((p) => p.aiTr?.dp > 0));
  TR.attachTraining(g);
});

test('Deterministyczność: to samo ziarno daje ten sam trening klubów AI', () => {
  const run = () => {
    const g = newGame('widzew', 77);
    playUntil(g, '2026-08-31');
    return squadOf(g.world, 'lech').map((p) => `${p.fresh}:${p.sharp}:${p.injuryDays ?? 0}:${p.aiTr?.dp}`).join('|');
  };
  assert.equal(run(), run());
});
