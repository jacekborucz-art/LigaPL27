import test from 'node:test';
import { scoutEdge } from '../src/training/scouting.js';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { generateWorld, squadOf, academyOf } from '../src/world/worldGen.js';
import { createSeason, playQuick, applyResult } from '../src/season/season.js';
import { processDay, continueUntilStop, primaryAction, advanceDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { teamRating } from '../src/engine/teamStrength.js';
import { createMatch } from '../src/engine/match/match.js';
import { proficiency } from '../src/engine/positions.js';
import { clubById } from '../src/data/clubs_pl.js';
import '../src/season/dailySystems.js';
import * as TR from '../src/training/index.js';
import { ACCENTS, LOAD_LEVELS, SESSIONS, DEV } from '../src/training/config.js';
import { mondayOf } from '../src/training/state.js';
import { applyClubMatch, syncTacticsChange, cohesionTerm, prepTerm } from '../src/training/cohesion.js';
import { legsTerm, overloadTerm } from '../src/training/load.js';
import { renderTraining, handleTrainingAction, isTrainingAction } from '../src/ui/trainingView.js';

const SEED = 2026;
function newGame(clubId = 'widzew', seed = SEED) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId));
  processDay(g);
  return g;
}

/** Gra do daty: mecze gracza szybką symulacją, reszta w tle. */
function playUntil(g, until) {
  const rng = new Rng(`gracz:${g.seed}`);
  let guard = 0;
  while (g.date < until && guard++ < 3000) {
    const a = primaryAction(g);
    if (a.kind === 'play') {
      const f = a.match;
      if (!f.away || !f.home) { f.played = true; f.result = { score: [0, 0] }; continue; }
      applyResult(g, f, playQuick(g, f, rng), rng);
      continue;
    }
    if (a.kind === 'decide') { g.inbox = g.inbox.map((m) => ({ ...m, resolved: true })); continue; }
    continueUntilStop(g, { maxDays: 1 });
  }
}

const STAFF = (q) => ({ asystent: q, fizyczny: q, bramkarze: q, mlodziez: q, analityk: q });
const sum = (p, attrs) => attrs.reduce((s, a) => s + p.attr[a], 0);
const TECH = ['TEC', 'POD', 'DRY', 'DOS'];
const PHYS = ['SZY', 'ZWI', 'WYT', 'SKO'];
const world = generateWorld(77);
const youngsters = Object.values(world.players).filter((p) => p.age <= 19 && p.pos !== 'BR').slice(0, 80);
const veterans = Object.values(world.players).filter((p) => p.pos !== 'BR').slice(0, 80);

function runMonths(players, months, ctxFn) {
  const rng = new Rng('mies');
  const out = players.map((p) => structuredClone(p));
  for (let m = 0; m < months; m++) for (const p of out) TR.developPlayer(p, { date: '2027-01-01', rng, ...ctxFn(p) });
  return out;
}

test('Inicjalizacja: sztab dla każdego klubu (1-20, bogate kluby lepsze), stan zawodników gracza, idempotentna', () => {
  const g = newGame();
  const T = g.training;
  for (const id of Object.keys(g.world.clubs)) {
    for (const r of ['asystent', 'fizyczny', 'bramkarze', 'mlodziez', 'analityk']) {
      const q = T.staff[id][r].q;
      assert.ok(q >= 1 && q <= 20, `${id} ${r}`);
    }
  }
  const avgQ = (id) => Object.values(T.staff[id]).reduce((s, x) => s + x.q, 0) / 5;
  assert.ok(avgQ('legia') > avgQ('sokol-kleczew') + 4);
  for (const p of [...squadOf(g.world, 'widzew'), ...academyOf(g.world, 'widzew')]) assert.ok(p.training && p.training.log.length === 28);
  const before = JSON.stringify(T.staff);
  TR.ensureTraining(g);
  assert.equal(JSON.stringify(g.training.staff), before);
  // Stary zapis bez treningu w połowie sezonu: migracja w miejscu
  const old = newGame('lech', 5);
  delete old.training;
  for (const p of Object.values(old.world.players)) delete p.training;
  TR.ensureTraining(old);
  assert.ok(old.training.clubs.lech && squadOf(old.world, 'lech').every((p) => p.training));
});

test('Deterministyczność: to samo ziarno daje ten sam trening, urazy i rozwój', () => {
  const a = newGame('rakow', 31); const b = newGame('rakow', 31);
  playUntil(a, '2026-08-20'); playUntil(b, '2026-08-20');
  assert.equal(JSON.stringify(a.training), JSON.stringify(b.training));
  const sq = (g) => squadOf(g.world, 'rakow').map((p) => [p.attr, p.fresh, p.injuryDays, p.training.log]);
  assert.deepEqual(sq(a), sq(b));
});

test('Plan tygodnia: nigdy ciężki trening dzień przed meczem (każdy akcent i poziom obciążeń)', () => {
  const g = newGame('jagiellonia');
  for (const accent of Object.keys(ACCENTS)) {
    for (const load of Object.keys(LOAD_LEVELS)) {
      g.training.settings = { accent, load };
      for (let d = '2026-07-02'; d < '2027-06-01'; d = addDays(d, 1)) {
        assert.equal(TR.heavyBeforeMatch(g, d), false, `${accent}/${load} ${d}`);
      }
    }
  }
});

test('Plan tygodnia: dzień meczu, regeneracja po meczu, rozruch przed meczem, mikrocykl 2 meczów bez ciężkich zajęć', () => {
  const g = newGame('widzew');
  const dates = [...new Set(g.fixtures.filter((f) => f.home === 'widzew' || f.away === 'widzew').map((f) => f.date))].sort();
  for (const md of dates.slice(0, 15)) {
    assert.equal(TR.planDay(g, md).kind, 'match');
    const after = TR.planDay(g, addDays(md, 1));
    if (after.kind !== 'match') assert.equal(after.sessions[0].type, 'regeneracja', md);
  }
  // Dwa mecze w odstępie 3 dni: tylko regeneracja i lekkie zajęcia
  for (let i = 1; i < dates.length; i++) {
    const gap = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
    if (gap !== 3) continue;
    for (const d of [addDays(dates[i - 1], 1), addDays(dates[i - 1], 2)]) {
      assert.ok(TR.planDay(g, d).sessions.every((x) => x.int !== 'high'), d);
    }
  }
  const pre = TR.planDay(g, addDays(dates[3], -1));
  assert.ok(pre.sessions.some((x) => x.type === 'rozruch' || x.type === 'taktyka' || x.type === 'stale'));
});

test('Okresy: obóz przygotowawczy w lipcu przed ligą, urlop po sezonie i zimą', () => {
  const g = newGame('widzew');
  assert.equal(TR.dayContext(g, '2026-07-06').phase, 'oboz');
  assert.equal(TR.dayContext(g, '2027-06-25').phase, 'urlop');
  assert.ok(['urlop', 'oboz'].includes(TR.dayContext(g, '2026-12-28').phase));
  const camp = TR.planDay(g, '2026-07-07');
  assert.ok(camp.sessions.length >= 1);
});

test('Ręczna edycja dnia: typ i intensywność, bez zmian w przeszłości i w dniu meczu, powrót do planu asystenta', () => {
  const g = newGame('widzew');
  const d = '2026-07-15';
  assert.ok(TR.setSession(g, d, 0, { type: 'wytrzymalosc', int: 'high' }));
  assert.deepEqual(TR.planDay(g, d).sessions[0], { type: 'wytrzymalosc', int: 'high' });
  assert.equal(TR.planDay(g, d).auto, false);
  assert.equal(TR.setSession(g, '2026-06-30', 0, { type: 'sila' }), false);
  const md = g.fixtures.find((f) => f.home === 'widzew' || f.away === 'widzew').date;
  assert.equal(TR.setSession(g, md, 0, { type: 'sila' }), false);
  assert.equal(TR.setSession(g, d, 0, { type: 'nieznane' }), false);
  assert.ok(TR.resetDay(g, d));
  assert.equal(TR.planDay(g, d).auto, true);
});

test('Rozwój: trening techniki podnosi atrybuty techniczne młodego zawodnika szybciej niż brak treningu', () => {
  const techStim = { TEC: 4, POD: 4, DRY: 4, DOS: 4 }; // 16 zajęć techniki w miesiącu
  const trained = runMonths(youngsters, 12, () => ({ staff: STAFF(10), stim: { ...techStim }, minShare: 0.6 }));
  const idle = runMonths(youngsters, 12, () => ({ staff: STAFF(10), stim: {}, minShare: 0.6 }));
  const gain = (arr) => arr.reduce((s, p, i) => s + sum(p, TECH) - sum(youngsters[i], TECH), 0) / arr.length;
  assert.ok(gain(trained) > 1.5 * gain(idle) && gain(trained) > 0.8, `trening ${gain(trained)} vs ${gain(idle)}`);
  const ovr = (arr) => arr.reduce((s, p, i) => s + p.ovr - youngsters[i].ovr, 0) / arr.length;
  assert.ok(ovr(trained) > ovr(idle));
  for (const p of trained) for (const a of Object.keys(p.attr)) assert.ok(p.attr[a] >= 1 && p.attr[a] <= 20);
});

test('Spadek: zawodnik 33-letni traci cechy fizyczne, 30-latek zyskuje mentalnie', () => {
  const old = runMonths(veterans, 12, () => ({ staff: STAFF(10), stim: null, minShare: 0.8, age: 33 }));
  const physLoss = old.reduce((s, p, i) => s + sum(p, PHYS) - sum(veterans[i], PHYS), 0) / old.length;
  assert.ok(physLoss < -2, `spadek fizyczny ${physLoss}`);
  const mature = runMonths(veterans, 12, () => ({ staff: STAFF(10), stim: null, minShare: 0.8, age: 30 }));
  const ment = DEV.mentalAttrs;
  const mentGain = mature.reduce((s, p, i) => s + sum(p, ment) - sum(veterans[i], ment), 0) / mature.length;
  assert.ok(mentGain > 0.4, `mentalne ${mentGain}`);
  // Lepszy trener przygotowania fizycznego spowalnia spadek
  const goodFit = runMonths(veterans, 12, () => ({ staff: { ...STAFF(10), fizyczny: 20 }, stim: null, minShare: 0.8, age: 33 }));
  const loss2 = goodFit.reduce((s, p, i) => s + sum(p, PHYS) - sum(veterans[i], PHYS), 0) / goodFit.length;
  assert.ok(loss2 > physLoss);
});

test('Sztab: lepsi trenerzy przyspieszają rozwój młodych', () => {
  const good = runMonths(youngsters, 12, () => ({ staff: STAFF(18), stim: null, minShare: 0.6 }));
  const bad = runMonths(youngsters, 12, () => ({ staff: STAFF(4), stim: null, minShare: 0.6 }));
  const ovr = (arr) => arr.reduce((s, p, i) => s + p.ovr - youngsters[i].ovr, 0) / arr.length;
  assert.ok(ovr(good) > ovr(bad) * 1.25, `${ovr(good)} vs ${ovr(bad)}`);
});

test('Rozwój: minuty i profesjonalizm mają znaczenie, POT jest sufitem, skoki rozwojowe tylko do 21 lat', () => {
  const play = runMonths(youngsters, 12, () => ({ staff: STAFF(10), stim: null, minShare: 1 }));
  const bench = runMonths(youngsters, 12, () => ({ staff: STAFF(10), stim: null, minShare: 0 }));
  const ovr = (arr) => arr.reduce((s, p, i) => s + p.ovr - youngsters[i].ovr, 0) / arr.length;
  assert.ok(ovr(play) > ovr(bench));
  const rng = new Rng('skok');
  let spurts = 0; let oldSpurts = 0;
  for (let i = 0; i < 4000; i++) {
    const p = structuredClone(youngsters[i % youngsters.length]);
    if (TR.developPlayer(p, { date: '2027-01-01', rng, staff: STAFF(20), stim: null, minShare: 0.6, age: 18 }).spurt) spurts++;
    const q = structuredClone(veterans[i % veterans.length]);
    if (TR.developPlayer(q, { date: '2027-01-01', rng, staff: STAFF(20), stim: null, minShare: 0.6, age: 25 }).spurt) oldSpurts++;
  }
  assert.ok(spurts > 0 && spurts < 40, `skoki ${spurts}`);
  assert.equal(oldSpurts, 0);
});

test('Przetrenowanie zwiększa ryzyko urazu, obniża formę, a ciężki tydzień podnosi ACWR', () => {
  const p = { hidden: { ODP: 10 }, attr: { WYT: 10 } };
  const base = { sessions: [{ type: 'gierki', int: 'mid' }], age: 25, acwr: 1.0, fitQ: 10, fresh: 95 };
  const ok = TR.trainingInjuryChance(p, base);
  const over = TR.trainingInjuryChance(p, { ...base, acwr: 1.8 });
  const high = TR.trainingInjuryChance(p, { ...base, sessions: [{ type: 'gierki', int: 'high' }] });
  assert.ok(over > 2 * ok && high > 1.8 * ok);
  assert.ok(Math.abs(ok - 0.0015 * 1.2) < 1e-9, 'ekspert 8.1: 0,15 % na dzień');
  // Tydzień podwójnych, ciężkich treningów w klubie gracza
  const g = newGame('widzew');
  for (let i = 1; i <= 8; i++) {
    const d = addDays(g.date, i);
    TR.setSession(g, d, 0, { type: 'wytrzymalosc', int: 'high' });
    TR.setSession(g, d, 1, { type: 'gierki', int: 'high' });
  }
  for (let i = 0; i < 8; i++) advanceDay(g);
  const fit = squadOf(g.world, 'widzew').filter((x) => !(x.injuryDays > 0));
  const avg = fit.reduce((s, x) => s + x.training.acwr, 0) / fit.length;
  assert.ok(avg > 1.3, `ACWR ${avg}`);
  assert.ok(fit.some((x) => overloadTerm(x.training) < 0));
  assert.ok(fit.reduce((s, x) => s + x.fresh, 0) / fit.length < 85, 'ciężki tydzień męczy');
});

test('Regeneracja po meczu przywraca świeżość szybciej niż trening', () => {
  const g = newGame('widzew');
  playUntil(g, '2026-07-24');
  const md = g.date;
  assert.equal(primaryAction(g).kind, 'play');
  const f = primaryAction(g).match;
  applyResult(g, f, playQuick(g, f, new Rng('m')), new Rng('m'));
  const played = squadOf(g.world, 'widzew').filter((p) => p.lastMatch === md && !(p.injuryDays > 0));
  const snapshot = structuredClone(g);
  TR.attachTraining(g);
  advanceDay(g); // plan asystenta: regeneracja
  const alt = snapshot;
  TR.setSession(alt, addDays(md, 1), 0, { type: 'wytrzymalosc', int: 'high' });
  advanceDay(alt);
  const fr = (game) => played.reduce((s, p) => s + game.world.players[p.id].fresh, 0) / played.length;
  assert.ok(fr(g) > fr(alt) + 15, `${fr(g)} vs ${fr(alt)}`);
  assert.ok(fr(g) >= 78); // dzień po meczu: dług meczowy ogranicza świeżość do ok. 85 (pełnia po 48-72 h)
  assert.equal(g.training.hist[addDays(md, 1)].s[0].type, 'regeneracja');
});

test('Zgranie: trening taktyczny je podnosi, zmiana formacji i instrukcji obniża, rotacja obniża rytm', () => {
  const g = newGame('widzew');
  const z0 = TR.teamCohesion(g).z;
  for (let i = 1; i <= 6; i++) TR.setSession(g, addDays(g.date, i), 0, { type: 'taktyka', int: 'high' });
  for (let i = 0; i < 6; i++) advanceDay(g);
  const z1 = TR.teamCohesion(g).z;
  assert.ok(z1 > z0 + 3, `${z0} -> ${z1}`);
  g.tactics = { ...g.tactics, formation: '352' };
  const z2 = TR.teamCohesion(g).z;
  assert.ok(z2 < z1 - 8, `zmiana formacji ${z1} -> ${z2}`);
  const c = g.training.clubs.widzew;
  const instr0 = c.instr;
  g.tactics = { ...g.tactics, instructions: { ...g.tactics.instructions, pressing: 'high', passing: 'long' } };
  assert.equal(syncTacticsChange(g), 2);
  assert.ok(c.instr <= instr0 - 14);
  // Rotacja: zawodnicy bez minut tracą rytm
  const sq = squadOf(g.world, 'widzew');
  const rh0 = sq[0].training.rh;
  applyClubMatch(c, '352', new Map(), sq);
  assert.ok(sq[0].training.rh < rh0);
});

test('Zgranie realnie wpływa na siłę: teamRating i strefy w pełnym silniku', () => {
  const g = newGame('widzew');
  const squad = squadOf(g.world, 'widzew');
  const c = g.training.clubs.widzew;
  const setZ = (v) => { c.fam[g.tactics.formation] = v; c.instr = v; for (const p of squad) { p.training.know = v; p.training.rh = v / 100; } };
  setZ(100);
  const hi = teamRating(squad);
  const hiIn = TR.trainingMatchInput(g, 'widzew', { squad, tactics: g.tactics });
  setZ(30);
  const lo = teamRating(squad);
  const loIn = TR.trainingMatchInput(g, 'widzew', { squad, tactics: g.tactics });
  for (const z of ['DEF', 'MID', 'ATT']) assert.ok(hi.zones[z] - lo.zones[z] > 0.4, z);
  assert.ok(hi.breakdown.trainingCohesion > 0 && lo.breakdown.trainingCohesion < 0);
  assert.ok(hiIn.cohesion > loIn.cohesion);
  const opp = squadOf(g.world, 'legia');
  const mk = (inp) => {
    setZ(inp === hiIn ? 100 : 30);
    return createMatch({
      seed: 'z', home: { club: clubById('widzew'), squad, tactics: g.tactics, ai: true, coach: 'P', cohesion: inp.cohesion },
      away: { club: clubById('legia'), squad: opp, tactics: createTactics(opp), ai: true, coach: 'P' }, ctx: {},
    });
  };
  const Mh = mk(hiIn); const Ml = mk(loIn);
  assert.ok(Mh.teams[0].S > Ml.teams[0].S);
  assert.ok(Mh.teams[0].zones.MID - Ml.teams[0].zones.MID > 0.5, `${Mh.teams[0].zones.MID} vs ${Ml.teams[0].zones.MID}`);
});

test('Nauka nowej pozycji: biegłość rośnie do maks. 90, bramki nie da się nauczyć', () => {
  const g = newGame('widzew');
  const p = squadOf(g.world, 'widzew').find((x) => x.pos === 'ŚO');
  const start = proficiency(p, 'DP');
  p.training.pos = 'DP';
  p.training.mode = 'normal';
  playUntil(g, '2027-01-31');
  assert.ok(proficiency(p, 'DP') > start);
  assert.ok(proficiency(p, 'DP') <= 90);
  assert.ok(p.alt.DP <= 90);
  const r = handleTrainingAction(g, 'tr-pos', { id: p.id, v: 'BR' });
  assert.ok(r.save);
  assert.equal(p.training.pos, null);
});

test('Stałe fragmenty: trening podnosi poziom, wykonawcy mają wyższe SFR i silnik wyższą strefę SPA', () => {
  const g = newGame('widzew');
  const c = g.training.clubs.widzew;
  const sp0 = c.sp;
  for (let i = 1; i <= 5; i++) TR.setSession(g, addDays(g.date, i), 0, { type: 'stale', int: 'high' });
  for (let i = 0; i < 5; i++) advanceDay(g);
  assert.ok(c.sp > sp0 + 15);
  const squad = squadOf(g.world, 'widzew');
  const inp = TR.trainingMatchInput(g, 'widzew', { squad, tactics: g.tactics });
  assert.ok(inp.squad[3].attr.SFR > squad[3].attr.SFR);
  const opp = squadOf(g.world, 'legia');
  const mk = (sq) => createMatch({ seed: 'sf', home: { club: clubById('widzew'), squad: sq, tactics: g.tactics, ai: true }, away: { club: clubById('legia'), squad: opp, tactics: createTactics(opp), ai: true }, ctx: {} });
  assert.ok(mk(inp.squad).teams[0].zones.SPA > mk(squad).teams[0].zones.SPA);
});

test('Analiza wideo rywala: mały bonus tylko w dniu najbliższego meczu', () => {
  const g = newGame('widzew');
  playUntil(g, '2026-07-23');
  const c = g.training.clubs.widzew;
  assert.ok(c.prep && c.prep.v >= 0.04 && c.prep.v <= 0.17, JSON.stringify(c.prep));
  const p = squadOf(g.world, 'widzew')[0];
  const saved = g.date;
  g.date = c.prep.date;
  // Do analizy dochodzi premia za przewidywalność rywala AI (docs/bierna-gra.md, scouting.js), mała i ograniczona
  const edge = scoutEdge(g, 'widzew', c.prep.opp);
  assert.ok(Math.abs(edge) <= 0.08, `premia za schemat rywala ${edge}`);
  assert.equal(prepTerm(g, p), c.prep.v + edge);
  g.date = addDays(c.prep.date, 1);
  assert.equal(prepTerm(g, p), 0);
  g.date = saved;
});

test('Ciężkie nogi: mocny trening dzień przed meczem obniża siłę, plan asystenta nie', () => {
  const g = newGame('widzew');
  playUntil(g, '2026-07-21');
  const md = g.fixtures.find((f) => (f.home === 'widzew' || f.away === 'widzew') && f.date >= g.date).date;
  const heavy = structuredClone(g);
  for (let d = addDays(g.date, 1); d < md; d = addDays(d, 1)) TR.setSession(heavy, d, 0, { type: 'sila', int: 'high' });
  while (g.date < md) advanceDay(g);
  TR.attachTraining(heavy);
  while (heavy.date < md) advanceDay(heavy);
  const xi = (game) => game.tactics.xi.map((id) => game.world.players[id]).filter((p) => p && !(p.injuryDays > 0));
  const term = (game) => xi(game).reduce((s, p) => s + legsTerm(p.training), 0) / xi(game).length;
  assert.equal(term(g), 0);
  assert.ok(term(heavy) < -0.1, `${term(heavy)}`);
});

test('Kluby AI: tygodniowy krok podnosi zgranie, urazy treningowe w podobnej skali, raport miesięczny dla gracza', () => {
  const g = newGame('widzew');
  const z0 = g.training.clubs.legia.z;
  playUntil(g, '2026-09-02');
  assert.ok(g.training.clubs.legia.z > z0);
  const aiInj = Object.values(g.world.players).filter((p) => p.clubId !== 'widzew' && p.injury?.training).length;
  assert.ok(aiInj > 0);
  const rep = g.inbox.find((m) => m.key === 'devrep:2026-09');
  assert.ok(rep && rep.subject.startsWith('Raport rozwoju'));
  assert.ok(!/—/.test(rep.body));
  assert.ok(g.training.reports[0].rows.length >= 25);
});

test('Ekran Trening: każda zakładka renderuje się, akcje „tr-” zmieniają plan i trening indywidualny', () => {
  const g = newGame('legia');
  playUntil(g, '2026-08-05');
  let ui = {};
  const act = (a, ds) => { const r = handleTrainingAction(g, a, ds); ui = { ...ui, ...r.ui }; return r; };
  assert.ok(isTrainingAction('tr-day') && !isTrainingAction('trole') && !isTrainingAction('tab'));
  for (const tab of ['tydzien', 'zawodnicy', 'obciazenia', 'sztab', 'rozwoj']) {
    act('tr-tab', { tab });
    const html = renderTraining(g, ui);
    assert.ok(html.includes('Trening') && !/undefined|NaN|\[object/.test(html), tab);
    assert.ok(!/—/.test(html), 'bez półpauz i myślników');
  }
  act('tr-tab', { tab: 'tydzien' });
  const d = addDays(g.date, 2);
  act('tr-day', { date: d });
  const r = act('tr-type', { date: d, slot: '0', type: 'szybkosc' });
  if (TR.dayContext(g, d).role !== 'MD') {
    assert.ok(r.save);
    assert.equal(TR.planDay(g, d).sessions[0].type, 'szybkosc');
    assert.ok(renderTraining(g, ui).includes('Edycja dnia'));
  }
  act('tr-accent', { v: 'fizyczny' });
  assert.equal(g.training.settings.accent, 'fizyczny');
  const p = squadOf(g.world, 'legia')[4];
  act('tr-focus', { id: p.id, v: 'tech' });
  act('tr-mode', { id: p.id, v: 'light' });
  act('tr-prog', { id: p.id, v: 'zly' });
  assert.equal(p.training.focus, 'tech');
  assert.equal(p.training.mode, 'light');
  assert.equal(p.training.prog, null);
  act('tr-week', { w: '1' });
  assert.equal(ui.trWeek, 1);
  act('tr-tab', { tab: 'zawodnicy' }); act('tr-player', { id: p.id });
  assert.ok(renderTraining(g, ui).includes(p.name));
});

test('Zapis: stan treningu jest mały i przechodzi przez JSON', () => {
  const g = newGame('widzew');
  playUntil(g, '2026-09-15');
  const json = JSON.stringify(g.training);
  assert.ok(json.length < 260 * 1024, `${json.length} B`); // 126 klubów z kadrami (z III ligą), było 120 KB przy 54
  const back = JSON.parse(JSON.stringify(g));
  TR.ensureTraining(back);
  assert.equal(TR.teamCohesion(back).z, TR.teamCohesion(g).z);
  TR.attachTraining(g);
});

test('Katalog zajęć: każde zajęcie ma liczby i opis, sesje regeneracyjne nie męczą', () => {
  const g = newGame('widzew');
  for (const [id, s] of Object.entries(SESSIONS)) {
    assert.ok(s.name && s.text, id);
    for (const int of ['low', 'mid', 'high']) {
      const pv = TR.sessionPreview(g, id, int);
      for (const k of ['fresh', 'load', 'injury', 'dev', 'sharp']) assert.ok(Number.isFinite(pv[k]), `${id} ${k}`);
    }
  }
  assert.ok(TR.sessionPreview(g, 'regeneracja', 'low').fresh > 0);
  assert.ok(TR.sessionPreview(g, 'wytrzymalosc', 'high').fresh < TR.sessionPreview(g, 'wytrzymalosc', 'low').fresh);
});

test('Wydajność: narzut treningu (klub gracza i kluby AI) w rozsądnych granicach', () => {
  const half = (seed) => {
    const g = newGame('widzew', seed);
    const t0 = process.cpuUsage(); // czas procesora tego procesu: odporny na równoległe pliki testów
    playUntil(g, '2026-12-20');
    const t = process.cpuUsage(t0);
    return (t.user + t.system) / 1000;
  };
  half(3); // rozgrzewka JIT
  const base = []; const train = [];
  // 3 próby na zmianę; minimum z prób tłumi szum, gdy inne pliki testów liczą się równolegle
  for (let i = 0; i < 3; i++) {
    TR.uninstallTraining(); base.push(half(4));
    TR.installTraining(); train.push(half(4));
  }
  const ratio = Math.min(...train) / Math.min(...base);
  const extra = Math.min(...train) - Math.min(...base);
  // Narzut względny albo bezwzględny (pół sezonu): reszta gry przyspiesza, więc sam stosunek bywa mylący
  // Obozy (także klubów AI), forma bazowa i sparingi zwiększyły zakres treningu; pilnujemy narzutu bezwzględnego.
  // Od docs/trening-ai.md codzienny plan realizują też 53 kluby AI (ok. 1300 zawodników, ok. 1-2 ms na dzień).
  assert.ok(ratio < 1.6 || extra < 1000, `trening x${ratio.toFixed(2)} (${Math.min(...base).toFixed(0)} ms -> ${Math.min(...train).toFixed(0)} ms)`);
});

test('Modyfikatory: zawodnicy bez stanu treningu (kluby zagraniczne) dostają 0', () => {
  const g = newGame('widzew');
  TR.attachTraining(g);
  const foreign = { id: 'x', clubId: 'real-madryt', ovr: 15, attr: {} };
  assert.equal(cohesionTerm(g, foreign), 0);
  assert.equal(prepTerm(g, foreign), 0);
  for (const m of TR.MODIFIERS) assert.equal(m.apply(foreign, {}), 0, m.id);
});
