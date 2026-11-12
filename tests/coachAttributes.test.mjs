// Trenerzy AI z atrybutami 1-20 (src/career/coaches.js, docs/trener-ai-atrybuty.md): generowanie, stały punkt
// + dyspozycja dnia, waga meczu, kierunek i granice efektów, zgodność ze starym zapisem, średni trener = AI sprzed zmian.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { randomName } from '../src/data/names.js';
import { createTactics } from '../src/engine/lineup.js';
import { createMatch, runToEnd } from '../src/engine/match/match.js';
import { quickMatch } from '../src/engine/quickSim.js';
import { aiBriefing } from '../src/match/briefings.js';
import { aiPlanTactics } from '../src/match/aiPlan.js';
import { aiStimFor } from '../src/training/aiClubs.js';
import { renderClubView } from '../src/ui/clubView.js';
import {
  COACH, COACH_KEYS, generateCoach, coachOf, ensureCoaches, matchCoach, quickCoachTerm, assistantProfile, replaceCoach,
  coachesNewSeason, coachSkill, coachSeen, trainingSkill, headCoachName, coachBlurb,
} from '../src/career/coaches.js';

const world = generateWorld(42);
const EK = CLUBS_PL.filter((c) => c.tier === 1);
const sq = Object.fromEntries(EK.map((c) => [c.id, squadOf(world, c.id)]));
const prof = (v, keys = COACH_KEYS) => ({ a: Object.fromEntries(COACH_KEYS.map((k) => [k, keys.includes(k) ? v : COACH.neutral])) });

test('Generowanie: deterministyczne, atrybuty 1-20, to samo nazwisko co dawniej, lepsze kluby mają średnio lepszych trenerów', () => {
  const a = generateCoach(7, 'legia'); const b = generateCoach(7, 'legia');
  assert.deepEqual(a, b);
  const n = randomName('POL', new Rng('trener-glowny:7:legia'));
  assert.equal(a.name, `${n.first} ${n.last}`, 'stary zapis pokazuje tego samego trenera');
  for (const k of COACH_KEYS) assert.ok(Number.isInteger(a.a[k]) && a.a[k] >= 1 && a.a[k] <= 20);
  // Średnia Ekstraklasy blisko punktu neutralnego (średni trener = AI sprzed atrybutów), czołówka wyżej niż dół tabeli
  let all = 0; let cnt = 0; let top = 0; let bottom = 0; let n2 = 0;
  for (let seed = 1; seed <= 30; seed++) {
    for (const c of EK) { const p = generateCoach(seed, c.id); for (const k of COACH_KEYS) { all += p.a[k]; cnt++; } }
    const avg = (id) => COACH_KEYS.reduce((s, k) => s + generateCoach(seed, id).a[k], 0) / 5;
    top += avg('legia') + avg('lech'); bottom += avg('radomiak') + avg('wieczysta'); n2 += 2;
  }
  assert.ok(Math.abs(all / cnt - COACH.neutral) < 0.6, `średnia Ekstraklasy ${(all / cnt).toFixed(2)}`);
  assert.ok(top / n2 > bottom / n2 + 2, `czołówka ${(top / n2).toFixed(1)}, dół ${(bottom / n2).toFixed(1)}`);
  const l2 = CLUBS_PL.filter((c) => c.tier === 3).map((c) => generateCoach(3, c.id));
  assert.ok(l2.some((p) => COACH_KEYS.some((k) => p.a[k] >= 8)), 'rozrzut: także w 2 Lidze zdarzają się dobre atrybuty');
});

test('Stary zapis: profile tworzone przy pierwszym użyciu, zapis JSON, widok klubu z kartą trenera', () => {
  const g = { seed: 11, clubId: 'widzew', date: '2026-08-01', world: generateWorld(11), fixtures: [] };
  assert.equal(g.coaches, undefined);
  const p = coachOf(g, 'legia');
  assert.ok(p && g.coaches.legia === p, 'profil zapisany w grze');
  ensureCoaches(g);
  assert.equal(g.coaches.widzew, undefined, 'klub gracza bez profilu: trenerem jest gracz');
  assert.ok(Object.keys(g.coaches).length >= 50);
  const copy = JSON.parse(JSON.stringify(g.coaches));
  assert.deepEqual(copy.legia, p);
  assert.equal(headCoachName(g, 'legia'), p.name);
  const html = renderClubView({ ...g, training: { staff: { widzew: { analityk: { q: 15 } } } } }, 'legia');
  assert.ok(html.includes('class="clv-attrs clv-attrs--exact"') && html.includes(p.name), 'analityk 15: dokładne oceny');
  assert.ok(html.includes(coachBlurb(p)));
  const vague = renderClubView({ ...g, training: { staff: { widzew: { analityk: { q: 5 } } } } }, 'legia');
  assert.ok(vague.includes('clv-attrs--vague') && !/<em>\d+<\/em>/.test(vague), 'słaby analityk: tylko słowa');
  // Klub spoza świata gry (III liga, zagraniczny): profil z ziarna, bez zapisu
  const eph = coachOf(g, 'wigry');
  assert.ok(eph?.a && !g.coaches.wigry);
});

test('Dyspozycja dnia i waga meczu: stały punkt + kilka procent losu, wielki mecz wzmacnia odpornych i osłabia nerwowych', () => {
  const p = prof(14);
  const forms = [];
  for (let i = 0; i < 400; i++) {
    const mc = matchCoach(p, { rank: 0, rng: new Rng(`f${i}`) });
    forms.push(mc.form);
    assert.ok(Math.abs(mc.form) <= COACH.formMax + 1e-9);
    for (const k of ['tak', 'skl', 'mot', 'pre']) assert.ok(mc[k] >= -1 && mc[k] <= 1);
  }
  const sd = Math.sqrt(forms.reduce((s, f) => s + f * f, 0) / forms.length);
  assert.ok(sd > 0.3 && sd < 0.6, `rozrzut dyspozycji ${sd.toFixed(2)} pkt atrybutu (ok. 5 % skali)`);
  assert.deepEqual(matchCoach(p, { rng: new Rng('x') }), matchCoach(p, { rng: new Rng('x') }), 'deterministycznie z ziarna');
  const base = matchCoach(p).tak;
  assert.ok(Math.abs(base - coachSkill(14)) < 1e-3);
  const calm = { a: { ...p.a, PRE: 18 } }; const nervous = { a: { ...p.a, PRE: 4 } };
  assert.ok(matchCoach(calm, { rank: 3 }).tak > matchCoach(calm, { rank: 0 }).tak + 0.2, 'finał: odporny trener decyduje lepiej');
  assert.ok(matchCoach(nervous, { rank: 3 }).tak < matchCoach(nervous, { rank: 0 }).tak - 0.2, 'finał: nerwowy trener decyduje gorzej');
  assert.equal(matchCoach(nervous, { rank: 0 }).tak, matchCoach(p, { rank: 0 }).tak, 'zwykły mecz: presja bez znaczenia');
  assert.equal(matchCoach(null), null);
});

function play(i, home, away, rank = 0) {
  const side = (id, cq) => ({ club: clubById(id), squad: sq[id], tactics: createTactics(sq[id]), ai: true, coach: clubById(id).coach, coachQ: cq });
  return createMatch({ seed: `ca${i}`, home: side(home.id, home.cq), away: side(away.id, away.cq), ctx: { rank, refStrict: 1 } });
}

test('Silnik: trener neutralny (s = 0) gra dokładnie jak AI bez profilu; błędy tylko u słabego taktyka', () => {
  const zero = { tak: 0, skl: 0, mot: 0, pre: 0 };
  for (let i = 0; i < 6; i++) {
    const a = runToEnd(play(i, { id: 'legia' }, { id: 'piast' }));
    const b = runToEnd(play(i, { id: 'legia', cq: zero }, { id: 'piast', cq: zero }));
    assert.deepEqual(b.score, a.score);
    assert.equal(b.events.length, a.events.length);
  }
  const MISTAKE = /długie piłki za plecy|cofamy się pod własne|zwalniamy grę|długie piłki do napastnika/;
  const count = (tak) => {
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const M = play(100 + i, { id: EK[i % 18].id, cq: { tak, skl: 0, mot: 0, pre: 0 } }, { id: EK[(i + 5) % 18].id });
      runToEnd(M);
      n += M.events.filter((e) => e.type === 'tactic' && e.side === 0 && MISTAKE.test(e.reason ?? '')).length;
    }
    return n;
  };
  assert.equal(count(0.8), 0, 'dobry taktyk nie popełnia błędów z katalogu');
  assert.ok(count(-0.8) >= 8, 'słaby taktyk czasem koryguje plan błędnie');
});

test('Szybka symulacja: przesunięcie stref ograniczone, monotoniczne, dobry trener wygrywa częściej na tych samych kadrach', () => {
  const t = (v) => quickCoachTerm(matchCoach(prof(v)));
  assert.equal(t(COACH.neutral), 0);
  assert.ok(t(20) <= COACH.quick + 1e-9 && t(1) >= -COACH.quick - 1e-9);
  assert.ok(t(16) > t(12) && t(12) > t(8));
  assert.equal(quickCoachTerm(null), 0);
  let g = 0; let b = 0; const n = 6000;
  for (let i = 0; i < n; i++) {
    const s = sq[EK[i % 18].id]; const goodHome = i % 2 === 0;
    const r = quickMatch({ squad: s, coachTerm: goodHome ? t(16) : t(8) }, { squad: s, coachTerm: goodHome ? t(8) : t(16) }, {}, new Rng(`q${i}`));
    const pts = (x) => (r.score[x] > r.score[1 - x] ? 3 : r.score[x] === r.score[1 - x] ? 1 : 0);
    g += pts(goodHome ? 0 : 1); b += pts(goodHome ? 1 : 0);
  }
  const diff = (g - b) / n;
  // Pełny silnik [SYM]: 16 kontra 8 na tych samych kadrach ok. +0,17 pkt na mecz; trener nie dominuje nad kadrą
  assert.ok(diff > 0.08 && diff < 0.3, `różnica ${diff.toFixed(3)} pkt na mecz`);
});

test('Plan przedmeczowy: średni trener jak dotąd, słaby myli się w ocenie zawodników, dobry dobiera plan pod rywala', () => {
  const s = sq.legia; const o = sq.piast;
  assert.deepEqual(aiPlanTactics(s, { cq: { skl: 0 }, rng: new Rng('p') }).tactics, createTactics(s));
  assert.deepEqual(aiPlanTactics(s, { cq: null, rng: new Rng('p') }).tactics, createTactics(s));
  let changedXi = 0; let bad = 0; let good = 0;
  for (let i = 0; i < 60; i++) {
    const w = aiPlanTactics(s, { cq: { skl: -0.8 }, rng: new Rng(`w${i}`), oppSquad: o });
    if (w.tactics.xi.join() !== createTactics(s).xi.join()) changedXi++;
    if (w.plan?.kind === 'bad') bad++;
    const p = aiPlanTactics(s, { cq: { skl: 0.8 }, rng: new Rng(`g${i}`), oppSquad: o });
    if (p.plan?.kind === 'good') { good++; assert.ok(p.tactics.instructions.passing === 'short' || p.tactics.instructions.pressing === 'high'); }
    assert.deepEqual(p.tactics.xi, createTactics(s).xi, 'dobry trener wybiera najlepszą jedenastkę');
  }
  assert.ok(changedXi >= 15, `słaby trener zmienia jedenastkę w ${changedXi}/60`);
  assert.ok(bad >= 6 && bad <= 30, `chybiony plan ${bad}/60`);
  assert.ok(good >= 8 && good <= 32, `trafny plan ${good}/60`);
});

test('Odprawy AI: motywacja zmienia wybór tonu i siłę odprawy, przy s = 0 bez zmian', () => {
  const mix = { Spokojny: 6, Ambitny: 4, Wrażliwy: 3, Lider: 2, Narwaniec: 3 };
  const ctx = { phase: 'half', diff: -1, xgDiff: 0.6, pWin: 0.4 };
  assert.deepEqual(aiBriefing({ coach: 'O', personaMix: mix, mot: 0 }, ctx, 's1'), aiBriefing({ coach: 'O', personaMix: mix }, ctx, 's1'));
  let hi = 0; let lo = 0; let mid = 0;
  for (let i = 0; i < 80; i++) {
    hi += aiBriefing({ coach: 'O', personaMix: mix, mot: 0.8 }, ctx, `m${i}`).teamZ;
    mid += aiBriefing({ coach: 'O', personaMix: mix, mot: 0 }, ctx, `m${i}`).teamZ;
    lo += aiBriefing({ coach: 'O', personaMix: mix, mot: -0.8 }, ctx, `m${i}`).teamZ;
  }
  assert.ok(hi > mid && mid > lo, `zaangażowanie: ${(hi / 80).toFixed(2)} > ${(mid / 80).toFixed(2)} > ${(lo / 80).toFixed(2)}`);
});

test('Trening AI: metodyka zmienia bodziec rozwojowy klubu AI, klub gracza bez wpływu', () => {
  const g = { seed: 5, clubId: 'widzew', world: generateWorld(5), coaches: {} };
  const p = squadOf(g.world, 'legia').find((x) => x.pos !== 'BR');
  p.aiTr = { dp: 4, dd: 0 };
  g.training = { clubs: { legia: { aiStim: { out: { TEC: 2, POD: 2 }, gk: {}, dpOut: 4, dpGk: 0 } } } };
  const sum = (tre) => { coachOf(g, 'legia').a.TRE = tre; return Object.values(aiStimFor(g, p)).reduce((a, b) => a + b, 0); };
  assert.ok(sum(18) > sum(10.5) && sum(10.5) > sum(3));
  assert.ok(sum(20) <= 4 * (1 + COACH.train.stim) + 1e-9, 'efekt ograniczony');
  assert.equal(trainingSkill(g, 'widzew'), 0);
  assert.equal(trainingSkill(null, 'legia'), 0);
});

test('Zmiana trenera i nowy sezon: nowy profil z kolejnym numerem, starzenie i doświadczenie w granicach skali', () => {
  const g = { seed: 9, clubId: 'widzew', world: generateWorld(9) };
  ensureCoaches(g);
  const old = { ...g.coaches.lech, a: { ...g.coaches.lech.a } };
  const next = replaceCoach(g, 'lech', '2026-10-01');
  assert.equal(next.n, 1);
  assert.notEqual(next.name, old.name);
  assert.ok(['O', 'S', 'P'].includes(next.style), 'nowy trener przynosi własny styl gry (docs/trenerzy-i-wlasciciele.md)');
  assert.equal(g.coachLog[0].out, old.name);
  assert.equal(replaceCoach(g, 'widzew', '2026-10-01'), null, 'gracza nie da się wymienić');
  const g2 = { seed: 9, clubId: 'widzew', world: generateWorld(9) };
  ensureCoaches(g2);
  assert.deepEqual(replaceCoach(g2, 'lech', '2026-10-01'), next, 'deterministycznie');
  const before = JSON.parse(JSON.stringify(g.coaches));
  coachesNewSeason(g, 2027);
  for (const [id, p] of Object.entries(g.coaches)) {
    assert.equal(p.age, before[id].age + 1);
    const d = COACH_KEYS.reduce((s, k) => s + Math.abs(p.a[k] - before[id].a[k]), 0);
    assert.ok(d <= 1, 'najwyżej jeden atrybut o 1 na sezon');
    for (const k of COACH_KEYS) assert.ok(p.a[k] >= 1 && p.a[k] <= 20);
  }
});

test('Asystent gracza i widoczność ocen: jakość ze sztabu, dokładność od analityka', () => {
  const a = assistantProfile(17);
  assert.ok(COACH_KEYS.every((k) => a.a[k] === 13), 'asystent Legii (17) jak dobry trener Ekstraklasy');
  assert.ok(matchCoach(a).tak > 0 && matchCoach(assistantProfile(5)).tak < 0);
  // Średni asystent Ekstraklasy (sztab ok. 13) jest średnim trenerem: pasywny gracz bez przewagi nad AI
  assert.ok(Math.abs(assistantProfile(13.2).a.TAK - COACH.neutral) <= 1);
  assert.deepEqual(coachSeen(13, 16), { lo: 13, hi: 13, mid: 13, text: '13' });
  for (let v = 1; v <= 20; v++) {
    const r = coachSeen(v, 10);
    assert.ok(r.lo <= v && v <= r.hi && r.hi - r.lo <= 3, `przedział ${r.text} zawiera ${v}`);
    assert.ok(!/\d/.test(coachSeen(v, 5).text), 'słaby analityk: słowo, bez liczby');
  }
});
