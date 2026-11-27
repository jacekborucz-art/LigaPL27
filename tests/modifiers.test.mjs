// Rejestr modyfikatorów jako jeden potok etapów (src/engine/modifiers.js, src/engine/pipeline.js, docs/walka-taktyk.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGES, CHANNELS, registerModifier, unregisterModifier, setModifierEnabled, listModifiers, modifierEntries, getModifier,
  evaluate, channel, channelTerms,
} from '../src/engine/modifiers.js';
import { matchFactors, ledgerSummary } from '../src/engine/pipeline.js';
import '../src/training/index.js';
import '../src/career/authority.js';
import '../src/career/mindset.js';
import '../src/career/acclimatization.js';
import { teamRating } from '../src/engine/teamStrength.js';
import { createMatch, runToEnd } from '../src/engine/match/match.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics } from '../src/engine/lineup.js';
import { clubById } from '../src/data/clubs_pl.js';

const WHEN = ['start', 'minute', 'change', 'action'];
const world = generateWorld(3);
const squad = squadOf(world, 'lech');
const player = (o = {}) => ({ id: 'x', pos: 'ŚP', ovr: 12, morale: 15, form: [7.2, 6.8], sharp: 40, fresh: 70, attr: {}, hidden: { WAZ: 16 }, ...o });

test('Każdy wpis potoku ma etap, opis po polsku, grupę, zakres [min, max] i chwilę liczenia', () => {
  const all = modifierEntries();
  assert.ok(all.length >= 30, `wpisów: ${all.length}`);
  const ids = new Set();
  for (const m of all) {
    assert.ok(STAGES.includes(m.stage), `${m.id}: etap ${m.stage}`);
    assert.ok(typeof m.label === 'string' && m.label.length >= 3 && m.label !== m.id, `${m.id}: label`);
    assert.ok(typeof m.group === 'string' && m.group, `${m.id}: group`);
    assert.ok(Array.isArray(m.range) && m.range.length === 2 && m.range.every(Number.isFinite) && m.range[0] <= m.range[1], `${m.id}: range`);
    assert.ok(WHEN.includes(m.when), `${m.id}: when ${m.when}`);
    assert.ok(m.channels.length >= 1 && m.channels.every((c) => typeof c === 'string'), `${m.id}: kanały`);
    assert.ok(!ids.has(m.id), `${m.id}: powtórzone id`);
    ids.add(m.id);
  }
  // Czynniki rozproszone wcześniej po silniku mają swoje wpisy w etapach z architektury
  const at = (id) => all.find((m) => m.id === id)?.stage;
  assert.equal(at('zoneRatings'), 'attr');
  assert.equal(at('position'), 'slot');
  assert.equal(at('dayForm'), 'player');
  assert.equal(at('condition'), 'live');
  assert.equal(at('cohesion'), 'team');
  assert.equal(at('counters'), 'matchup');
  assert.equal(at('weather'), 'match');
  assert.equal(at('referee'), 'match');
  assert.equal(at('crowd'), 'match');
  for (const c of Object.values(CHANNELS)) assert.ok(c === 'sum' || c === 'prod');
});

test('Suma rozbicia = suma: parts daje total, chParts składa się w ch, szybka ścieżka daje te same liczby', () => {
  for (const ctx of [{}, { inMatch: true, rank: 3, dayForm: 0.37 }]) {
    for (const p of [player(), player({ playingInjured: true, morale: 4 }), ...squad.slice(0, 8)]) {
      const r = evaluate('player', p, ctx);
      const sum = Object.values(r.parts).reduce((s, v) => s + v, 0);
      assert.equal(sum, r.total, 'suma części w kolejności wpisów = total');
      assert.equal(channel('player', 'pts', p, ctx), r.total, 'channel = evaluate');
      const out = [];
      const n = channelTerms('player', 'pts', p, ctx, out);
      assert.equal(out.slice(0, n).reduce((s, v) => s + v, 0), r.total);
    }
  }
  const inMatch = evaluate('player', player(), { inMatch: true, rank: 3, dayForm: 0.37 });
  assert.equal(inMatch.parts.dayForm, 0.37);
  assert.ok(Math.abs(inMatch.parts.waz - 0.24) < 1e-12);
  assert.equal(evaluate('player', player(), {}).parts.dayForm, undefined, 'poza meczem bez dyspozycji dnia');
  // Iloczyny etapu match: chParts składa się w ch
  const ctx = { neutral: false, rank: 2, refStrict: 1.2, attendance: 0.5, weather: { conv: 1.06, foul: 1.08, inj: 1.05, dys: 1.15 } };
  const m = evaluate('match', ctx, ctx);
  const foul = ['weather', 'referee', 'rank'].reduce((s, id) => s * m.chParts[id].foul, 1);
  assert.equal(m.ch.foul, foul);
  assert.equal(channel('match', 'foul', ctx, ctx), m.ch.foul);
  // Sumy etapu team (mecze w tle): zone.all = pewność z tabeli + decyzje trenera
  const t = evaluate('team', { xi: [], squad: [] }, { tableTerm: 0.1, coachTerm: -0.04 });
  assert.equal(t.ch['zone.all'], t.chParts.tableConfidence['zone.all'] + t.chParts.coachDecisions['zone.all']);
});

test('Wyłączenie wpisu zmienia wynik tylko o jego wkład; włączenie przywraca liczby bit w bit', () => {
  const p = player();
  const before = evaluate('player', p, {});
  assert.ok(setModifierEnabled('player', 'morale', false));
  try {
    const off = evaluate('player', p, {});
    assert.ok(Math.abs(before.total - off.total - before.parts.morale) < 1e-12);
    assert.equal(off.parts.morale, undefined);
  } finally { setModifierEnabled('player', 'morale', true); }
  assert.equal(evaluate('player', p, {}).total, before.total);

  // Siła drużyny: wpis pewności z tabeli dodaje dokładnie swój wkład do każdej strefy
  const r0 = teamRating(squad, { tableTerm: 0.12 });
  setModifierEnabled('team', 'tableConfidence', false);
  let r1;
  try { r1 = teamRating(squad, { tableTerm: 0.12 }); } finally { setModifierEnabled('team', 'tableConfidence', true); }
  for (const k of ['GK', 'DEF', 'MID', 'ATT', 'FIN']) assert.ok(Math.abs(r0.zones[k] - r1.zones[k] - 0.12) < 1e-9, k);
  assert.equal(r1.breakdown.table, 0);
  assert.deepEqual(teamRating(squad, { tableTerm: 0.12 }).zones, r0.zones);

  // Unregister i ponowna rejestracja tego samego wpisu: te same liczby
  const entry = getModifier('player', 'sharp');
  unregisterModifier('player', 'sharp');
  try {
    assert.ok(!listModifiers('player').includes('sharp'));
    assert.ok(Math.abs(before.total - evaluate('player', p, {}).total - before.parts.sharp) < 1e-12);
  } finally { registerModifier(entry); }
  // Ponowna rejestracja stawia wpis na końcu swojej grupy order (jak dawniej), więc suma tylko z dokładnością do bitu
  assert.ok(Math.abs(evaluate('player', p, {}).total - before.total) < 1e-12);

  // Warunki meczu: wyłączona pogoda daje mnożniki neutralne, sędzia zostaje
  const ctx = { neutral: false, rank: 0, refStrict: 1.3, attendance: 0.4, weather: { conv: 1.06, fat: 1.3 } };
  setModifierEnabled('match', 'weather', false);
  let mx;
  try { mx = matchFactors(ctx); } finally { setModifierEnabled('match', 'weather', true); }
  assert.equal(mx.wConv, 1); assert.equal(mx.wFat, 1); assert.equal(mx.refCard, 1.3);
  assert.equal(matchFactors(ctx).wFat, 1.3);
});

test('Stary zapis wpisu (scope, label, apply bez nowych pól) działa jak dawniej', () => {
  const old = registerModifier({ id: 'testStary', scope: 'player', label: 'Stary wpis', apply: (p) => (p.stary ? 0.25 : 0) });
  try {
    assert.equal(old.stage, 'player');
    assert.equal(old.group, 'player');
    assert.equal(old.range, null);
    assert.equal(old.channel, 'pts');
    const before = teamRating(squad).zones.MID;
    const after = teamRating(squad.map((p) => ({ ...p, stary: true })));
    assert.ok(Math.abs(after.zones.MID - before - 0.25) < 1e-9);
    assert.equal(after.breakdown.testStary, 0.25);
    // Bez label: opis = id
    const bare = registerModifier({ id: 'testBezOpisu', scope: 'team', apply: () => 0 });
    assert.equal(bare.label, 'testBezOpisu');
    unregisterModifier('team', 'testBezOpisu');
  } finally { unregisterModifier('player', 'testStary'); }
  assert.ok(!listModifiers('player').includes('testStary'));
  assert.throws(() => registerModifier({ id: 'zly', scope: 'nieznany', apply: () => 0 }));
});

test('M.ledger: zrealizowany wkład wpisów w meczu, bez wpływu na wynik', () => {
  const side = (id, pre) => { const sq = squadOf(world, id).map((p) => ({ ...p, id: pre + p.id })); return { club: { ...clubById(id), id: pre + id }, squad: sq, tactics: createTactics(sq, { instructions: { counter: 'yes', line: 'high' } }), ai: true }; };
  const cfg = () => ({ seed: 'ledger:1', home: side('lech', 'h'), away: side('legia', 'a'), ctx: { rank: 2, refStrict: 1.1, weather: { conv: 1.06, fat: 1.1 } } });
  const A = createMatch(cfg()); runToEnd(A);
  const B = createMatch(cfg()); B.ledger = null; runToEnd(B);
  assert.equal(JSON.stringify(A.events), JSON.stringify(B.events));
  assert.equal(A.rng.state, B.rng.state);
  const L = ledgerSummary(A);
  assert.equal(L.length, 2);
  for (const s of L) {
    assert.ok(s.minutes >= 90);
    for (const k of ['form', 'dayForm', 'condition', 'engagement']) assert.ok(k in s.perPlayerMinute, k);
    assert.ok(s.perPlayerMinute.condition <= 0);
    assert.ok('cohesion' in s.perMinute && 'captain' in s.perMinute);
    assert.ok(Math.abs(s.counters) <= 0.5);
    assert.equal(s.match.weather.conv, 1.06);
  }
  assert.equal(ledgerSummary(B), null);
});
