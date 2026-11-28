// Walka taktyk, krok 2 (docs/walka-taktyk.md rozdz. 7, src/engine/engine2.js): wyłączniki, granice stanu zawodnika,
// warunki meczu, naprawione pułapki potoku i mecze w tle jak pełny silnik.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE2, ENGINE2_OFF, setEngine2, STATE, COND, TIER_MUL, BAL } from '../src/engine/engine2.js';
import { evaluate, registerModifier, unregisterModifier, setModifierEnabled, onFireOf, rustOf, STATE_POOLS } from '../src/engine/modifiers.js';
import { matchFactors, attrZones, terrainHfa, ledgerSummary } from '../src/engine/pipeline.js';
import { createMatch, runToEnd, step } from '../src/engine/match/match.js';
import { expectedGoals, quickMatch, QS } from '../src/engine/quickSim.js';
import { tablePressure, travelKm, quickFill } from '../src/season/conditions.js';
import { injuryReturn, rustDecay } from '../src/season/season.js';
import { stakesTerm, derbyTerms } from '../src/engine/pipeline.js';
import { teamRating } from '../src/engine/teamStrength.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics } from '../src/engine/lineup.js';
import { clubById } from '../src/data/clubs_pl.js';
import { Rng } from '../src/core/rng.js';
import { goldenMatch, matchDigest, ratingDigests, quickDigests, seasonDigest, h32, N_MATCHES } from './pipelineGolden.mjs';
import '../src/training/index.js';
import '../src/career/acclimatization.js';

const ALL = { pipeFix: true, state: true, conditions: true, unify: true, balance: true };
const OFF = { ...ENGINE2_OFF };
function withFlags(flags, fn) {
  const keep = { ...ENGINE2 };
  setEngine2(flags);
  try { return fn(); } finally { setEngine2(keep); }
}
const world = generateWorld(3);
const side = (id, pre, extra = {}) => {
  const sq = squadOf(world, id).map((p) => ({ ...p, id: pre + p.id }));
  return { club: { ...clubById(id), id: pre + id }, squad: sq, tactics: createTactics(sq), ai: true, ...extra };
};
const pl = (o = {}) => ({ id: 'x', pos: 'ŚP', ovr: 12, clubId: 'lech', morale: 12, form: [], sharp: 80, fresh: 95, attr: {}, hidden: {}, ...o });
const poolOf = (r, ids) => ids.reduce((s, id) => s + (r.parts[id] ?? 0), 0);

test('Wszystkie wyłączniki false: złote skróty kroku 1 bit w bit (mecze, siła drużyn, mecze w tle, krótki sezon)', () => {
  const GOLD = JSON.parse(fs.readFileSync(new URL('./enginePipeline.step1.golden.json', import.meta.url), 'utf8'));
  withFlags(OFF, () => {
    const diff = [];
    for (let i = 0; i < N_MATCHES; i++) {
      const d = matchDigest(goldenMatch(i));
      const got = `${h32(d)} ${d.split('|')[2]}`;
      if (got !== GOLD.matches[i]) diff.push(i);
    }
    assert.deepEqual(diff, [], `mecze różne od kroku 1: ${diff.slice(0, 10)}`);
    assert.equal(h32(ratingDigests().join('|')), GOLD.ratings);
    assert.equal(h32(quickDigests().join('|')), GOLD.quick);
    const s = seasonDigest();
    assert.equal(h32(JSON.stringify(s)), GOLD.season.hash);
  });
});

test('Stan zawodnika: pule psychiki, ciała, aklimatyzacji i suma mają granice (mnożnik ligi tylko na ciało i aklimatyzację)', () => {
  const rng = new Rng('granice');
  for (let i = 0; i < 400; i++) {
    const tier = 1 + (i % 5);
    const p = pl({
      morale: rng.int(1, 20), form: Array.from({ length: 5 }, () => 4 + rng.next() * 5), sharp: rng.int(30, 100), fresh: rng.int(35, 100),
      fh: Array.from({ length: 10 }, (_, k) => [k > 6 ? 8.5 : 6 + rng.next(), '2026-09-01']),
      rust: rng.next() < 0.3 ? { days: rng.int(10, 120), n: 3, left: rng.int(1, 3) } : undefined,
      acclim: rng.next() < 0.3 ? { level: rng.int(0, 100), club: 'lech' } : undefined,
    });
    for (const inMatch of [false, true]) {
      const r = evaluate('player', p, { tier, inMatch });
      const raw = poolOf(r, [...STATE_POOLS.psyche, ...STATE_POOLS.body, ...STATE_POOLS.acclim]);
      const eff = raw + (r.parts.statePool ?? 0);
      const m = TIER_MUL[tier];
      assert.ok(eff <= STATE.total[1] + 1e-9 && eff >= STATE.total[0] * m - 1e-9, `suma ${eff} (liga ${tier})`);
      assert.ok(r.parts.statePool !== undefined);
    }
  }
  // Psychika: forma, morale i „na gazie” razem najwyżej +0,6 (po QA; krok 2: +0,7), w każdej lidze bez mnożnika
  const hot = pl({ morale: 20, form: [9, 9, 9, 9, 9], fh: Array.from({ length: 10 }, (_, k) => [k >= 5 ? 9 : 6, 'd']) });
  const r = evaluate('player', hot, { tier: 1 });
  assert.ok(poolOf(r, STATE_POOLS.psyche) > 1, 'surowe wkłady psychiki ponad granicą');
  assert.ok(Math.abs(poolOf(r, STATE_POOLS.psyche) + r.parts.statePool - STATE.psyche[1]) < 1e-9);
  const r4 = evaluate('player', hot, { tier: 4 });
  assert.ok(Math.abs(poolOf(r4, STATE_POOLS.psyche) + r4.parts.statePool - STATE.psyche[1]) < 1e-9, 'psychika bez mnożnika ligi');
  // Dołek (forma -0,5, morale -0,36): -0,86, poniżej granicy kroku 2 (-0,8), w IV lidze bez mnożnika
  const low = pl({ morale: 1, form: [4, 4, 4, 4, 4] });
  const l4 = evaluate('player', low, { tier: 5 });
  const lowRaw = poolOf(l4, STATE_POOLS.psyche);
  assert.ok(lowRaw < -0.8 && Math.abs(lowRaw + l4.parts.statePool - Math.max(lowRaw, STATE.psyche[0])) < 1e-9, 'dołek bez mnożnika ligi');
  // Ciało: bez ostrości, zmęczony i po długiej kontuzji najwyżej -1,5 (poza meczem)
  const sore = pl({ morale: 10, sharp: 30, fresh: 40, rust: { days: 90, n: 4, left: 4 } });
  const s = evaluate('player', sore, { tier: 1 });
  assert.ok(Math.abs(poolOf(s, STATE_POOLS.body) + s.parts.statePool - -1.5) < 1e-9);
  // III liga: ta sama sytuacja x1,15
  const s4 = evaluate('player', sore, { tier: 4 });
  assert.ok(Math.abs(poolOf(s4, STATE_POOLS.body) + s4.parts.statePool - -1.5 * 1.15) < 1e-9);
});

test('Na gazie, powrót po kontuzji, ostrość i gra z urazem w punktach', () => {
  const fh = (rs) => rs.map((x) => [x, 'd']);
  assert.equal(onFireOf(pl({ fh: fh([6.5, 6.5, 6.5]) })), 0, 'za mało meczów');
  const one = onFireOf(pl({ fh: fh([6.2, 6.4, 6.3, 6.5, 6.4, 7.4]) }));
  const three = onFireOf(pl({ fh: fh([6.2, 6.4, 6.3, 6.5, 6.4, 7.6, 7.5, 7.4]) }));
  assert.ok(one > 0 && three > one && three <= STATE.onFire.max, `seria ${one} ${three}`);
  assert.ok(three - one < one, 'malejący zwrot');
  assert.equal(onFireOf(pl({ fh: fh([6.2, 6.4, 6.3, 6.5, 6.4, 7.6, 7.5, 5.9]) })), 0, 'słaby ostatni mecz zeruje serię');
  const r = (left) => rustOf(pl({ rust: { days: 60, n: 4, left } }));
  assert.ok(r(4) < r(2) && r(2) < 0 && Math.abs(r(4) + 0.8) < 1e-9);
  assert.equal(rustOf(pl({ rust: { days: 60, n: 4, left: 0 } })), 0);
  const sharp = (v) => evaluate('player', pl({ sharp: v }), { tier: 1 }).parts.sharp;
  assert.ok(sharp(30) < -1 && sharp(30) > -1.2 && sharp(80) === 0, `ostrość 30: ${sharp(30)}`);
  withFlags(OFF, () => assert.ok(Math.abs(sharp(30) + 0.6) < 1e-9, 'krok 1: ostrość 30 = -0,6'));
  const inj = (ovr) => evaluate('player', pl({ ovr, playingInjured: true }), {}).parts.playingInjured;
  assert.equal(inj(8), inj(16));
  assert.equal(inj(12), -STATE.injuredPts);
});

test('Warunki meczu: wartość terenu, derby, murawa i presja tabeli w granicach', () => {
  const base = { neutral: false, rank: 0, refStrict: 1, attendance: 0.6, weather: {} };
  assert.equal(terrainHfa({ ...base, neutral: true }), 0);
  const far = terrainHfa({ ...base, attendance: 1, travelKm: 800, pitch: 'sztuczna', tier: 5 });
  const near = terrainHfa({ ...base, attendance: 0.2, travelKm: 10, tier: 1 });
  assert.ok(far <= 1.32 + 1e-9 && near > 0.5 && far > near, `${near} ${far}`);
  const mx0 = matchFactors(base);
  const mxD = matchFactors({ ...base, derby: 3 });
  assert.ok(mxD.wFoul > mx0.wFoul && mxD.refCard > mx0.refCard && mxD.gap < 1 && mxD.dfMul > 1);
  const mxP = matchFactors({ ...base, pitch: 'zla' });
  assert.ok(mxP.passAcc < 0 && mxP.brk.POZ < 0 && mxP.brk.SKR > 0);
  // Presja: tylko w ostatnich 6 kolejkach, 0-1, bliska walka o utrzymanie mocniej niż środek tabeli
  const rows = (played) => Array.from({ length: 18 }, (_, i) => ({ id: `k${i}`, played, points: 70 - 3 * i - (i >= 14 ? 0 : 1) }));
  assert.equal(tablePressure(rows(20), 'k15', 1), 0);
  const late = rows(33);
  const low = tablePressure(late, 'k15', 1); const mid = tablePressure(late, 'k8', 1);
  assert.ok(low > 0 && low <= 1 && low > mid, `${low} ${mid}`);
  assert.equal(travelKm('legia', 'polonia-warszawa'), 10);
  assert.ok(travelKm('pogon-szczecin', 'stal-rzeszow') > 600);
  assert.ok(quickFill('legia', 3) > quickFill('legia', 0));
});

test('Pułapki potoku (pipeFix): tryb wpisu w etapie match, nowy wpis warunków bez zmian w core.js, wyłącznik w trakcie meczu', () => {
  // Wpis mode 'quick' nie wchodzi do pełnego silnika, wpis bez trybu wchodzi i działa przez sumę kanału
  registerModifier({ id: 'testQuickOnly', stage: 'match', label: 'Test tylko w tle', range: [1, 2], mode: 'quick', channels: ['conv'], apply: () => ({ conv: 2 }) });
  registerModifier({ id: 'testCond', stage: 'match', label: 'Test warunku', range: [1, 1.5], channels: ['conv'], apply: () => ({ conv: 1.5 }) });
  try {
    const M = createMatch({ seed: 'k2', home: side('lech', 'h'), away: side('legia', 'a'), ctx: { refStrict: 1 } });
    assert.equal(M.mx.wConv, 1.5);
    assert.equal(matchFactors({ refStrict: 1 }, false).wConv, 3);
    // Wyłączenie wpisu w trakcie meczu działa od następnej minuty
    for (let i = 0; i < 10; i++) step(M);
    setModifierEnabled('match', 'testCond', false);
    step(M);
    assert.equal(M.mx.wConv, 1);
  } finally { unregisterModifier('match', 'testQuickOnly'); unregisterModifier('match', 'testCond'); }
  // Wpis etapu attr tylko z jedną strefą też się liczy; bez wpisów strefy neutralne (ovr), nie 0
  const p = pl({ attr: { ODB: 14 } });
  const a0 = attrZones(p);
  registerModifier({ id: 'testAtt', stage: 'attr', label: 'Test strefy ataku', range: [0, 1], channels: ['zone.ATT'], apply: () => ({ 'zone.ATT': 0.5 }) });
  try { const a1 = attrZones(p); assert.ok(Math.abs(a1.ATT - a0.ATT - 0.5) < 1e-12 && a1.DEF === a0.DEF); } finally { unregisterModifier('attr', 'testAtt'); }
  setModifierEnabled('attr', 'zoneRatings', false);
  try { assert.deepEqual(attrZones(p), { DEF: 12, MID: 12, ATT: 12, GK: 12 }); } finally { setModifierEnabled('attr', 'zoneRatings', true); }
  withFlags(OFF, () => {
    setModifierEnabled('attr', 'zoneRatings', false);
    try { assert.deepEqual(attrZones(p), { DEF: 0, MID: 0, ATT: 0, GK: 0 }, 'krok 1: strefy 0'); } finally { setModifierEnabled('attr', 'zoneRatings', true); }
  });
});

test('M.ledger widzi karę lekkiego urazu w meczu (pipeFix)', () => {
  let found = false;
  for (let i = 0; i < 60 && !found; i++) {
    const M = createMatch({ seed: `uraz:${i}`, home: side('lech', 'h'), away: side('legia', 'a'), ctx: { refStrict: 1 } });
    runToEnd(M);
    if (!M.events.some((e) => e.type === 'injury' && e.knock)) continue;
    const L = ledgerSummary(M);
    found = L.some((s) => s.perPlayerMinute.knockInMatch < 0);
  }
  assert.ok(found, 'w 60 meczach musi zdarzyć się lekki uraz z karą w dzienniku');
});

test('Mecze w tle (unify): przy typowej wartości terenu te same średnie goli co dawny model; derby zbliżają drużyny', () => {
  const H = { zones: { ATT: 13, MID: 12, DEF: 12, GK: 12, FIN: 12 }, gkMods: { goalMul: 1 } };
  const A = { zones: { ATT: 11, MID: 11, DEF: 11, GK: 11, FIN: 11 }, gkMods: { goalMul: 1 } };
  const old = withFlags(OFF, () => expectedGoals(H, A, {}));
  const ref = withFlags({ balance: false }, () => expectedGoals(H, A, { mx: { hfa: QS.HFA_REF, gap: 1, pen: 1 } }));
  assert.ok(Math.abs(old.lH - ref.lH) < 1e-9 && Math.abs(old.lA - ref.lA) < 1e-9);
  // balance: średnia goli meczu w tle x BAL.qsGoals (za pełnym silnikiem), derby x kanał act
  const bal = expectedGoals(H, A, { mx: { hfa: QS.HFA_REF, gap: 1, pen: 1 } });
  assert.ok(Math.abs(bal.lH - ref.lH * BAL.qsGoals) < 1e-9);
  const derby = expectedGoals(H, A, { mx: { hfa: QS.HFA_REF, gap: 0.82, pen: 1 } });
  assert.ok(derby.lH / derby.lA < ref.lH / ref.lA);
  const noFans = expectedGoals(H, A, { mx: { hfa: 0.6, gap: 1, pen: 1 } });
  assert.ok(noFans.lH < ref.lH && noFans.lA > ref.lA);
  // Mecz w tle liczy ten sam etap match (sędzia, ranga): ranga 2 daje więcej kartek
  const sq = squadOf(world, 'lech'); const sq2 = squadOf(world, 'legia');
  let y0 = 0; let y2 = 0;
  for (let i = 0; i < 400; i++) {
    y0 += quickMatch({ squad: sq }, { squad: sq2 }, { refStrict: 1, rank: 0 }, new Rng(`y:${i}`)).yellow.reduce((a, b) => a + b, 0);
    y2 += quickMatch({ squad: sq }, { squad: sq2 }, { refStrict: 1, rank: 2 }, new Rng(`y:${i}`)).yellow.reduce((a, b) => a + b, 0);
  }
  assert.ok(y2 > y0 * 1.1, `${y0} ${y2}`);
  assert.deepEqual(Object.keys(ALL), Object.keys(ENGINE2));
  assert.ok(COND.hfa.base > 0);
});

test('Poprawki po QA: stawka meczu x WAZ i opanowanie (presja, granica +-0,4, mnożnik ligi), bez pewności z tabeli przy unify', () => {
  const p = (waz, opa) => pl({ hidden: { WAZ: waz }, attr: { OPA: opa } });
  const C = COND.stakes;
  // Presja tabeli 0,5 bez rangi: połowa stawki; ranga 2: pełna; bez stawki: 0
  const full = stakesTerm(p(15, 14), { rank: 2, tier: 1 });
  assert.ok(Math.abs(full - (C.waz * 5 + C.opa * 4)) < 1e-12, `pełna stawka ${full}`);
  assert.ok(Math.abs(stakesTerm(p(15, 14), { rank: 0, pressure: 0.5, tier: 1 }) - full / 2) < 1e-12, 'presja 0,5');
  assert.equal(stakesTerm(p(15, 14), { rank: 0, pressure: 0, tier: 1 }), 0);
  // Granica +-0,4 przy skrajnych cechach
  assert.equal(stakesTerm(p(20, 20), { rank: 2, tier: 1 }), C.cap);
  assert.equal(stakesTerm(p(1, 1), { rank: 3, tier: 1 }), -C.cap);
  // Mnożnik ligi: po QA psychika bez mnożnika (COND.stakes.tier false); krok 2: x mnożnik
  assert.equal(stakesTerm(p(15, 14), { rank: 2, tier: 4 }), full);
  C.tier = true;
  try { assert.ok(Math.abs(stakesTerm(p(15, 14), { rank: 2, tier: 4 }) - full * TIER_MUL[4]) < 1e-12); } finally { C.tier = false; }
  // Krok 1 (conditions false): tylko ranga 2+ x 0,04 x (WAZ - 10)
  withFlags({ conditions: false }, () => {
    assert.ok(Math.abs(stakesTerm(p(15, 14), { rank: 2 }) - 0.2) < 1e-12);
    assert.equal(stakesTerm(p(15, 14), { rank: 0, pressure: 1 }), 0);
  });
  // Pewność siebie z tabeli: przy unify wyłączona (liczy ją pula psychiki), bez unify jak w kroku 1
  const sq = squadOf(world, 'lech');
  const withT = (on) => withFlags({ unify: on }, () => teamRating(sq, { tableTerm: 0.15 }).breakdown.table);
  assert.equal(withT(true), 0);
  assert.equal(withT(false), 0.15);
});

test('Poprawki po QA: rdza zamiast drugiej kary ostrości, wygasa z meczami i z czasem, nie powstaje bez state', () => {
  const back = (days) => pl({ injury: { name: 'uraz', days }, injuryDays: 0, sharp: 55 });
  // state: rdza bez ostrości 30
  const a = back(40); injuryReturn(a, '2026-09-01');
  assert.deepEqual(a.rust, { days: 40, n: 3, left: 3, at: '2026-09-01' });
  assert.equal(a.sharp, 55, 'bez ostrości 30 przy state');
  // state false: jak krok 1 (ostrość 30, bez rdzy)
  const b = back(40);
  withFlags({ state: false }, () => injuryReturn(b, '2026-09-01'));
  assert.equal(b.rust, undefined); assert.equal(b.sharp, 30);
  // Krótka przerwa: bez rdzy
  const c = back(7); injuryReturn(c, '2026-09-01'); assert.equal(c.rust, undefined);
  // Wygasanie z czasem: co STATE.rust.decayDays dni bez meczu jeden mecz mniej, potem koniec
  const d = STATE.rust.decayDays;
  const add = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
  rustDecay(a, add('2026-09-01', d - 1)); assert.equal(a.rust.left, 3, 'przed terminem bez zmian');
  rustDecay(a, add('2026-09-01', d)); assert.equal(a.rust.left, 2);
  rustDecay(a, add('2026-09-01', 2 * d)); assert.equal(a.rust.left, 1);
  rustDecay(a, add('2026-09-01', 3 * d)); assert.equal(a.rust, undefined, 'po ostatnim terminie rdza znika');
  // Przerwa letnia (60 dni bez meczu): po 4 terminach nie zostaje nic
  const e = back(90); injuryReturn(e, '2026-06-01');
  for (let k = 1; k <= 60; k++) if (e.rust) rustDecay(e, add('2026-06-01', k));
  assert.equal(e.rust, undefined);
  // Zapis bez daty (sprzed poprawki): liczenie od dziś
  const f = pl({ rust: { days: 30, n: 3, left: 2 } }); rustDecay(f, '2026-10-01'); assert.equal(f.rust.at, '2026-10-01');
  // rustOf: n = 0 albo brak n bez kary (bez NaN)
  assert.equal(rustOf(pl({ rust: { days: 60, n: 0, left: 2 } })), 0);
  assert.equal(rustOf(pl({ rust: { days: 60, left: 2 } })), 0);
});

test('Poprawki po QA: derby bez podwójnej rangi, mnożnik ligi poziomu 6, frekwencja bez NaN, balance', () => {
  const base = { neutral: false, refStrict: 1, attendance: 0.6, weather: {}, tier: 1 };
  // Derby rangi 2: wpis rank neutralny (ranga wynika z derbów), faule i kartki tylko z wpisu derby
  const d2 = matchFactors({ ...base, rank: 2, derby: 2 });
  assert.deepEqual(d2.parts.rank, { foul: 1, card: 1 });
  const t = derbyTerms({ derby: 2, tier: 1 });
  assert.ok(Math.abs(d2.foul - t.foul) < 1e-12 && Math.abs(d2.card - t.card) < 1e-12);
  assert.ok(t.act < 1 && t.gap < 1 && t.foul > 1 && t.card > t.foul);
  // Ranga 2 bez derbów: jak dotąd
  assert.deepEqual(matchFactors({ ...base, rank: 2 }).parts.rank, { foul: 1.1, card: 1.15 });
  COND.derby.rankOff = false;
  try { setEngine2({}); assert.deepEqual(matchFactors({ ...base, rank: 2, derby: 2 }).parts.rank, { foul: 1.1, card: 1.15 }); } finally { COND.derby.rankOff = true; setEngine2({}); }
  assert.equal(TIER_MUL[6], 1.2);
  withFlags({ conditions: false }, () => {
    const mx = matchFactors({ neutral: false, refStrict: 1, rank: 0, weather: {} });
    assert.ok(Number.isFinite(mx.hfa) && Math.abs(mx.hfa - (0.7 + 0.3 * 0.6)) < 1e-12, 'brak frekwencji: 0,6');
  });
  // balance: mnożniki pełnego silnika tylko przy wyłączniku
  const mk = () => createMatch({ seed: 'bal', home: side('lech', 'h'), away: side('legia', 'a'), ctx: { refStrict: 1, attendance: 0.6 } });
  assert.equal(mk().yMul, BAL.yellow);
  withFlags({ balance: false }, () => { const M = mk(); assert.equal(M.yMul, 1); assert.equal(M.gs.smax, 0.4); });
});
