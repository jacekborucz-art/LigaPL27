// Warianty 4-4-2, lekkie urazy (gra z bólem), oceny na żywo i dowolne ustawienie w osłabieniu
// (docs/taktyka-i-urazy.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics, checkTactics } from '../src/engine/lineup.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { FORMATIONS, formationById } from '../src/data/formations.js';
import {
  createMatch, step, resume, runToEnd, result, changeTactics, liveRatings, playerStates, previewShape, checkTacticPatch, knockEligible,
} from '../src/engine/match/match.js';
import { injure, sendOff, card } from '../src/engine/match/core.js';
import { fieldPlayers, tacticParams, updateZones } from '../src/engine/match/teams.js';
import { variant442, shortShape, matchState } from '../src/engine/match/coach.js';
import { KNOCK, K } from '../src/engine/match/constants.js';

const world = generateWorld(42);
const EK = CLUBS_PL.filter((c) => c.tier === 1);
const sq = Object.fromEntries(EK.map((c) => [c.id, squadOf(world, c.id)]));
const tac = Object.fromEntries(EK.map((c) => [c.id, createTactics(sq[c.id])]));
const tacF = (id, formation) => createTactics(sq[id], { formation });
const side = (id, extra = {}) => ({ club: clubById(id), squad: sq[id], tactics: tac[id], ai: true, coach: clubById(id).coach, ...extra });
const until = (M, min) => { while (M.minute < min && !M.ended) { if (M.phase === 'break') resume(M); else step(M); } };
const STRAIN = { cat: 'light', name: 'naciągnięcie mięśnia', days: 7, playable: true };
const BRUISE = { cat: 'light', name: 'stłuczenie', days: 2, playable: true };
const pair = (i) => { const h = EK[i % 18].id; let a = EK[(i * 7 + 3) % 18].id; if (a === h) a = EK[(i + 1) % 18].id; return [h, a]; };

test('Nowe formacje: 4-4-2 defensywne i ofensywne, te same role co 4-4-2, inne linie i efekty', () => {
  const base = formationById('442'); const def = formationById('442def'); const off = formationById('442off');
  assert.equal(def.name, '4-4-2 defensywne');
  assert.equal(off.name, '4-4-2 ofensywne');
  for (const f of [def, off]) {
    assert.equal(f.slots.length, 11);
    assert.deepEqual(f.slots.map((s) => s.pos), base.slots.map((s) => s.pos), `${f.id}: te same role`);
    assert.equal(f.family, '442');
  }
  const avgY = (f) => f.slots.slice(1).reduce((s, x) => s + x.y, 0) / 10;
  assert.ok(avgY(def) < avgY(base) - 5 && avgY(off) > avgY(base) + 3, 'niski blok niżej, ofensywne wyżej');
  const P = (f) => tacticParams(f, tac.legia.instructions);
  assert.ok(P(def).pActMul < 1 && P(def).D > 0 && P(def).oppPActMul < 1);
  assert.ok(P(off).pActMul > 1 && P(off).D < 0 && P(off).counterVulnMul > 1);
  assert.ok(FORMATIONS.some((f) => f.id === '442def') && FORMATIONS.some((f) => f.id === '442off'));
});

test('Warianty 4-4-2 grają inaczej: niski blok oddaje mniej strzałów i mniej strzela, ofensywne odwrotnie (300 meczów)', () => {
  const s = { '442def': [0, 0], 442: [0, 0], '442off': [0, 0] };
  for (let i = 0; i < 300; i++) {
    const [h, a] = pair(i);
    for (const f of Object.keys(s)) {
      const r = runToEnd(createMatch({ seed: `fk${i}`, home: side(h, { ai: false, tactics: tacF(h, f) }), away: side(a), ctx: {} }));
      s[f][0] += r.stats[0].shots; s[f][1] += r.stats[1].shots;
    }
  }
  assert.ok(s['442def'][1] < s[442][1] && s[442][1] < s['442off'][1], `strzały rywala ${JSON.stringify(s)}`);
  assert.ok(s['442def'][0] < s[442][0] && s[442][0] < s['442off'][0], `własne strzały ${JSON.stringify(s)}`);
});

test('AI wybiera warianty 4-4-2 w sensownych sytuacjach (pogoń, obrona wyniku, punkt z silniejszym)', () => {
  const M = createMatch({ seed: 'v442', home: side('legia', { tactics: tacF('legia', '442'), coach: 'P' }), away: side('lech'), ctx: {} });
  const T = M.teams[0];
  const st = (o) => ({ ...matchState(M, 0), ...o });
  assert.equal(variant442(T, st({ diff: -1, minute: 70 }))?.formation, '442off');
  assert.equal(variant442(T, st({ diff: 1, minute: 80 }))?.formation, '442def');
  assert.equal(variant442(T, st({ diff: 0, minute: 80, str: -1.5, ko: false }))?.formation, '442def');
  assert.equal(variant442(T, st({ diff: 0, minute: 40, str: 0 })), null);
  T.tactics.formation = '442off';
  assert.equal(variant442(T, st({ diff: 0, minute: 75, str: 0 }))?.formation, '442', 'po wyrównaniu powrót do równowagi');
  // Integracja: drużyna AI w 4-4-2 w pogoni i przy prowadzeniu
  let chase = 0; let protect = 0; const n = 40; // 40 meczów: mniejsza wrażliwość na przebieg losowania
  for (let i = 0; i < n; i++) {
    for (const [score, from, to] of [[[0, 1], 64, 80], [[1, 0], 70, 90]]) {
      const M2 = createMatch({ seed: `v442${i}`, home: side('legia', { tactics: tacF('legia', '442'), coach: 'P' }), away: side('lech'), ctx: {} });
      until(M2, from);
      if (M2.teams[0].tactics.formation !== '442' || fieldPlayers(M2.teams[0]).length < 11) continue;
      M2.score = [...score];
      const at = M2.events.length;
      while (M2.minute < to && !M2.ended) { if (M2.phase === 'break') resume(M2); else step(M2); M2.score = [...score]; }
      const fs = M2.events.slice(at).filter((e) => e.type === 'tactic' && e.side === 0).map((e) => e.formation);
      if (score[0] < score[1] && fs.includes('442off')) chase++;
      if (score[0] > score[1] && fs.includes('442def')) protect++;
    }
  }
  assert.ok(chase >= 0.6 * n, `pogoń 4-4-2 ofensywne ${chase}/${n}`);
  assert.ok(protect >= 0.5 * n, `obrona wyniku 4-4-2 defensywne ${protect}/${n}`);
});

test('Zmiana w rodzinie 4-4-2 kosztuje mniej spójności niż zmiana na inną formację', () => {
  const mk = () => { const M = createMatch({ seed: 'fam', home: side('legia', { ai: false, tactics: tacF('legia', '442') }), away: side('lech'), ctx: {} }); until(M, 30); return M; };
  const a = mk(); const b = mk();
  assert.equal(changeTactics(a, 0, { formation: '442def' }).cost, 5);
  assert.equal(changeTactics(b, 0, { formation: '4231' }).cost, 10);
});

test('Lekki uraz: gra z bólem, słabsza forma, stan x.knock i zdarzenie dla UI', () => {
  const M = createMatch({ seed: 'kn1', home: side('legia', { ai: false }), away: side('lech'), ctx: {} });
  until(M, 20);
  const T = M.teams[0];
  const x = T.players.find((y) => y.on && y.slot.pos === 'ŚP' || y.on && y.slot.pos === 'DP');
  const base0 = x.base;
  const from = M.events.length;
  injure(M, T, x, false, { injury: STRAIN });
  assert.ok(x.on && !x.sentOff, 'gra dalej');
  assert.equal(x.knock.type, 'strain');
  assert.equal(x.knock.since, 20);
  assert.equal(x.knock.aggravated, false);
  assert.ok(x.base < base0 - 0.5 * KNOCK.types.strain.pen * x.p.ovr);
  const e = M.events.slice(from).find((y) => y.type === 'injury');
  assert.equal(e.canContinue, true);
  assert.equal(e.knock, true);
  assert.equal(e.knockType, 'strain');
  const ps = playerStates(M, 0).find((y) => y.id === x.id);
  assert.equal(ps.knock?.name, 'naciągnięcie mięśnia', 'biały krzyżyk: knock na zawodniku na boisku');
  assert.equal(ps.on, true);
  // Szybsze zmęczenie
  const y = T.players.find((z) => z.on && z !== x && z.slot.pos === x.slot.pos);
  if (y) { y.cond = x.cond = 90; until(M, 30); assert.ok(x.cond < y.cond + 0.5, 'kulejący męczy się co najmniej tak samo'); }
});

test('Lekki uraz może się pogłębić: zawodnik schodzi, uraz średni; kolejny uraz grywalny też go pogłębia', () => {
  const save = KNOCK.types.strain.agg;
  try {
    KNOCK.types.strain.agg = 1; // pewne pogłębienie w następnej minucie
    const M = createMatch({ seed: 'kn2', home: side('legia', { ai: false }), away: side('lech'), ctx: {} });
    until(M, 25);
    const T = M.teams[0];
    const x = T.players.find((y) => y.on && y.slot.pos === 'NAP');
    injure(M, T, x, false, { injury: STRAIN });
    const from = M.events.length;
    until(M, 28);
    const e = M.events.slice(from).find((y) => y.type === 'injury' && y.pid === x.id);
    assert.ok(e?.aggravated, 'pogłębienie');
    assert.equal(e.canContinue, false);
    assert.equal(e.severity, 'medium');
    assert.equal(x.on, false);
    assert.equal(x.injury.cat, 'medium');
    assert.ok(x.injury.days >= 18);
    assert.equal(playerStates(M, 0).find((y) => y.id === x.id).knock, null, 'bez krzyżyka po zejściu');
    assert.equal(playerStates(M, 0).find((y) => y.id === x.id).injured, true);
  } finally { KNOCK.types.strain.agg = save; }
  const M = createMatch({ seed: 'kn3', home: side('legia', { ai: false }), away: side('lech'), ctx: {} });
  until(M, 25);
  const T = M.teams[0];
  const x = T.players.find((y) => y.on && y.slot.pos === 'ŚO');
  injure(M, T, x, false, { injury: BRUISE });
  injure(M, T, x, true, { injury: BRUISE });
  assert.equal(x.knock.aggravated, true);
  assert.equal(x.on, false);
});

test('Kilku lekko kontuzjowanych: kara drużyny rośnie, ale jest ograniczona (mniejsza niż brak zawodnika)', () => {
  const M = createMatch({ seed: 'kn4', home: side('legia', { ai: false }), away: side('lech'), ctx: {} });
  until(M, 10);
  const T = M.teams[0];
  const xs = fieldPlayers(T).filter((y) => y.slot.pos !== 'BR');
  const zoneSum = () => { updateZones(T, M); return T.zones.DEF + T.zones.MID + T.zones.ATT; };
  const pens = []; const sums = [zoneSum()];
  for (let i = 0; i < 6; i++) {
    xs[i].knock = { name: 'stłuczenie', type: 'contusion', since: 10, pre: false, aggravated: false, aggravatedAt: null, days: 1 };
    sums.push(zoneSum()); pens.push(T.knockPen);
  }
  assert.equal(pens[0], 0, 'jeden kulejący: bez kary drużyny');
  for (let i = 1; i < pens.length; i++) assert.ok(pens[i] >= pens[i - 1]);
  assert.ok(pens[2] > pens[1] - pens[0], 'kara rośnie szybciej niż liniowo');
  assert.ok(Math.max(...pens) <= KNOCK.teamMax && KNOCK.teamMax < K.shortHanded);
  assert.ok(sums[3] < sums[1], 'trzech kulejących osłabia strefy');
});

test('Po meczu: lekki uraz grany długo wydłuża przerwę; uraz sprzed meczu (gra z bólem) i knockEligible', () => {
  const M = createMatch({ seed: 'kn5', home: side('legia', { ai: false }), away: side('lech'), ctx: {} });
  until(M, 5);
  const T = M.teams[0];
  const x = T.players.find((y) => y.on && y.slot.pos === 'ŚO');
  const save = KNOCK.types.sprain.agg;
  KNOCK.types.sprain.agg = 0;
  try {
    injure(M, T, x, false, { injury: { cat: 'light', name: 'lekkie skręcenie kostki', days: 5, playable: true } });
    const r = runToEnd(M);
    const me = r.ratings.find((y) => y.id === x.id);
    assert.equal(me.knock.type, 'sprain');
    assert.ok(me.knock.minutes >= 80);
    assert.ok(me.injury.days > 5 && me.injury.days <= KNOCK.maxDays, `dni ${me.injury.days}`);
    assert.ok(r.injuries.some((y) => y.id === x.id));
  } finally { KNOCK.types.sprain.agg = save; }
  // Uraz sprzed meczu: tylko lekki i krótki; zawodnik z flagą playingInjured gra z krzyżykiem od 1. minuty
  const p = sq.legia.find((y) => y.id === tac.legia.xi[6]);
  const knocked = { ...p, injuryDays: 3, injury: { name: 'stłuczenie', days: 3, cat: 'light' }, playingInjured: true };
  assert.equal(knockEligible(knocked), true);
  assert.equal(knockEligible({ ...knocked, injuryDays: 20, injury: { name: 'uraz przywodziciela', days: 20, cat: 'medium' } }), false);
  assert.equal(knockEligible({ ...knocked, injury: { name: 'wstrząśnienie mózgu', days: 3, cat: 'light' } }), false);
  const squad = sq.legia.map((y) => (y.id === p.id ? knocked : y));
  assert.deepEqual(checkTactics(tac.legia, squad).errors.filter((e) => /kontuzjowany/.test(e)), []);
  const bad = sq.legia.map((y) => (y.id === p.id ? { ...knocked, injuryDays: 20, injury: { name: 'uraz przywodziciela', days: 20, cat: 'medium' } } : y));
  assert.ok(checkTactics(tac.legia, bad).errors.some((e) => /kontuzjowany/.test(e)));
  const M2 = createMatch({ seed: 'kn6', home: { ...side('legia', { ai: false }), squad }, away: side('lech'), ctx: {} });
  const xk = M2.teams[0].players.find((y) => y.id === p.id);
  assert.equal(xk.knock?.pre, true);
  assert.equal(playerStates(M2, 0).find((y) => y.id === p.id).knock.pre, true);
});

test('AI zmienia zawodnika z naciągnięciem mięśnia szybko, kulejących nie zostawia na boisku', () => {
  let quick = 0; let n = 0;
  for (let i = 0; i < 20; i++) {
    const M = createMatch({ seed: `kn7${i}`, home: side('legia'), away: side('lech'), ctx: {} });
    until(M, 20 + i);
    const T = M.teams[0];
    if (T.subsUsed >= T.subsLimit) continue;
    const x = T.players.find((y) => y.on && y.slot.pos === 'ŚP' || y.on && y.slot.pos === 'DP');
    if (!x || x.knock || x.injury) continue;
    const from = M.events.length;
    injure(M, T, x, false, { injury: STRAIN });
    until(M, M.minute + 3);
    n++;
    if (M.events.slice(from).some((e) => e.type === 'sub' && e.side === 0 && e.outId === x.id)) quick++;
  }
  assert.ok(n >= 15 && quick >= 0.7 * n, `szybka zmiana ${quick}/${n}`);
});

test('Oceny na żywo: ta sama skala co oceny końcowe, bez wpływu na przebieg meczu', () => {
  let diffSum = 0; let bias = 0; let cnt = 0;
  for (let i = 0; i < 20; i++) {
    const [h, a] = pair(i);
    const M1 = createMatch({ seed: `lr${i}`, home: side(h), away: side(a), ctx: {} });
    const M2 = createMatch({ seed: `lr${i}`, home: side(h), away: side(a), ctx: {} });
    let guard = 0;
    while (!M1.ended && guard++ < 400) {
      if (M1.phase === 'break') resume(M1); else step(M1);
      const lr = liveRatings(M1);
      for (const v of Object.values(lr)) assert.ok(v >= 3 && v <= 10);
    }
    runToEnd(M2);
    assert.deepEqual(M1.score, M2.score, 'wołanie liveRatings nie zmienia meczu');
    assert.equal(M1.events.length, M2.events.length);
    const live = liveRatings(M1);
    const r = result(M1);
    assert.deepEqual(Object.keys(live).sort(), r.ratings.map((x) => String(x.id)).sort());
    for (const x of r.ratings) { const d = live[x.id] - x.rating; diffSum += Math.abs(d); bias += d; cnt++; }
  }
  assert.ok(diffSum / cnt < 0.25, `średnia różnica ${diffSum / cnt}`);
  assert.ok(Math.abs(bias / cnt) < 0.06, `przesunięcie ${bias / cnt}`);
});

test('Oceny na żywo reagują na zdarzenia: gol podnosi ocenę strzelca', () => {
  const M = createMatch({ seed: 'lr-goal', home: side('legia', { ai: false }), away: side('lech'), ctx: {} });
  until(M, 30);
  const x = M.teams[0].players.find((y) => y.on && y.slot.pos === 'NAP');
  const before = liveRatings(M)[x.id];
  x.ev += 1.0; // gol wg RATING
  assert.ok(liveRatings(M)[x.id] >= before + 0.9);
});

test('Kartki per zawodnik dla UI: żółta, druga żółta, czerwona', () => {
  const M = createMatch({ seed: 'cards', home: side('legia', { ai: false }), away: side('lech'), ctx: { var: false } });
  until(M, 15);
  const T = M.teams[0];
  const [a, b, c] = fieldPlayers(T).filter((y) => y.slot.pos !== 'BR');
  card(M, T, a);
  card(M, T, b); card(M, T, b);
  sendOff(M, T, c, 'violent');
  const ps = new Map(playerStates(M, 0).map((y) => [y.id, y]));
  assert.equal(ps.get(a.id).card, 'yellow');
  assert.equal(ps.get(b.id).card, 'secondYellow');
  assert.equal(ps.get(c.id).card, 'red');
  assert.equal(ps.get(c.id).rc, 1);
  assert.equal(ps.get(c.id).on, false);
});

/** Gracz z 9 zawodnikami (dwie czerwone kartki). */
function nine(seed = 'free9') {
  const M = createMatch({ seed, home: side('legia', { ai: false }), away: side('lech'), ctx: { var: false } });
  until(M, 40);
  const T = M.teams[0];
  const reds = fieldPlayers(T).filter((y) => ['NAP', 'OP'].includes(y.slot.pos));
  for (const y of reds.slice(0, 2)) sendOff(M, T, y, 'violent');
  assert.equal(fieldPlayers(T).length, 9);
  return { M, T };
}

test('Dowolne ustawienie w osłabieniu (gracz): 5-4-1 w dziewięciu, pięciu obrońców, wybrane puste miejsca', () => {
  const { M, T } = nine();
  const xs = fieldPlayers(T);
  const gk = xs.find((y) => y.slot.pos === 'BR');
  const rest = xs.filter((y) => y !== gk);
  // 5-4-1: 0 BR, 1 WB, 2-4 ŚO, 5 WB, 6 BP, 7 ŚP, 8 ŚP, 9 BP, 10 NAP. Puste: oba środkowe pomocnicze (5-2-1)
  const order = [1, 2, 3, 4, 5, 6, 9, 10];
  const assign = { [gk.id]: 0 };
  rest.forEach((y, i) => { assign[y.id] = order[i]; });
  const pv = previewShape(M, 0, '541', { assign });
  assert.equal(pv.ok, true, pv.error);
  assert.deepEqual(pv.empty, [7, 8]);
  assert.equal(pv.need, 2);
  const evs = M.events.length;
  const r = changeTactics(M, 0, { formation: '541', assign });
  assert.equal(r.ok, true);
  for (const y of xs) assert.equal(playerStates(M, 0).find((s) => s.id === y.id).slotIdx, assign[y.id], 'każdy tam, gdzie go postawiono');
  assert.deepEqual(T.dropIdx, [7, 8]);
  assert.equal(T.shape, '5-2-1');
  const e = M.events.slice(evs).find((y) => y.type === 'tactic');
  assert.deepEqual(e.empty, [7, 8]);
  assert.equal(formationById('541').slots.filter((s, i) => ['ŚO', 'WB'].includes(s.pos) && Object.values(assign).includes(i)).length, 5, 'pięciu w obronie');
  // Puste miejsca zostają po kolejnej zmianie instrukcji i po zmianie zawodnika
  changeTactics(M, 0, { instructions: { mentality: '-1' } });
  assert.deepEqual(T.dropIdx, [7, 8]);
  until(M, 60);
  assert.equal(T.formation.id, '541');
});

test('Wybór pustych miejsc bez przypisania (empty) i walidacja błędów: nic się nie zmienia', () => {
  const { M, T } = nine('free9b');
  const n0 = M.events.length; const f0 = T.formation.id;
  let r = changeTactics(M, 0, { formation: '541', empty: [10] });
  assert.equal(r.ok, false);
  assert.match(r.error, /dokładnie 2/);
  r = changeTactics(M, 0, { formation: '541', empty: [0, 10] });
  assert.equal(r.ok, false);
  assert.match(r.error, /Bramka/);
  r = changeTactics(M, 0, { formation: 'xyz' });
  assert.equal(r.ok, false);
  const someone = fieldPlayers(T).find((y) => y.slot.pos !== 'BR');
  const other = fieldPlayers(T).find((y) => y.slot.pos !== 'BR' && y !== someone);
  r = changeTactics(M, 0, { formation: '541', assign: { [someone.id]: 3, [other.id]: 3 } });
  assert.equal(r.ok, false);
  assert.equal(checkTacticPatch(M, 0, { formation: '541', empty: [9] }) !== null, true);
  assert.equal(M.events.length, n0, 'bez zdarzenia');
  assert.equal(T.formation.id, f0);
  r = changeTactics(M, 0, { formation: '541', empty: [9, 10] });
  assert.equal(r.ok, true);
  assert.deepEqual(T.dropIdx, [9, 10]);
  assert.equal(T.shape, '5-3-0');
  assert.equal(fieldPlayers(T).filter((y) => y.slot.pos === 'BR').length, 1);
  // W dziesiątkę: jedno puste miejsce
  const M10 = createMatch({ seed: 'free10', home: side('legia', { ai: false }), away: side('lech'), ctx: { var: false } });
  until(M10, 30);
  sendOff(M10, M10.teams[0], fieldPlayers(M10.teams[0]).find((y) => y.slot.pos === 'NAP'), 'violent');
  assert.equal(changeTactics(M10, 0, { formation: '442def', empty: [9] }).ok, true);
  assert.equal(M10.teams[0].shape, '4-4-1');
  assert.deepEqual(M10.teams[0].dropIdx, [9]);
});

test('Ta sama funkcja działa dla AI: shortShape wybiera 5-3-1 przy obronie prowadzenia w dziesiątkę, 5-2-1 w dziewiątkę', () => {
  let five = 0; let n = 0;
  for (let i = 0; i < 12; i++) {
    const M = createMatch({ seed: `ai531${i}`, home: side('legia', { tactics: tacF('legia', '352') }), away: side('lech'), ctx: { var: false } });
    until(M, 75);
    const T = M.teams[0];
    if (fieldPlayers(T).length < 11 || T.tactics.formation === '541') continue;
    M.score = [1, 0];
    sendOff(M, T, fieldPlayers(T).find((y) => ['ŚP', 'DP'].includes(y.slot.pos)), 'violent');
    step(M);
    n++;
    if (T.formation.id === '541' && T.shape === '5-3-1') five++;
  }
  assert.ok(n >= 8 && five >= 0.75 * n, `5-3-1: ${five}/${n}`);
  const M = createMatch({ seed: 'ai521', home: side('legia', { tactics: tacF('legia', '352') }), away: side('lech'), ctx: { var: false } });
  until(M, 75);
  const T = M.teams[0];
  const st = { ...matchState(M, 0), diff: 1, minute: 80 };
  assert.deepEqual(shortShape(T, st, 2), { formation: '541', drop: ['BP', 'BP'] });
  // AI może też użyć jawnego przypisania (ta sama walidacja co u gracza)
  const O = M.teams[1];
  sendOff(M, O, fieldPlayers(O).find((y) => y.slot.pos !== 'BR'), 'violent');
  const empty = [10, 9, 6].slice(0, 11 - fieldPlayers(O).length);
  const r = changeTactics(M, 1, { formation: '541', empty }, { by: 'ai', reason: 'test' });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(O.dropIdx, empty.slice().sort((p, q) => p - q));
  assert.equal(M.events.at(-1).by, 'ai');
});

test('Determinizm z lekkimi urazami i nowymi formacjami', () => {
  const play = () => {
    const M = createMatch({ seed: 'det-kn', home: side('legia', { tactics: tacF('legia', '442def') }), away: side('lech', { tactics: tacF('lech', '442off') }), ctx: {} });
    until(M, 10);
    injure(M, M.teams[0], fieldPlayers(M.teams[0]).find((y) => y.slot.pos === 'NAP'), false, { injury: STRAIN });
    return runToEnd(M);
  };
  const a = play(); const b = play();
  assert.deepEqual(a.score, b.score);
  assert.deepEqual(a.ratings.map((x) => x.rating), b.ratings.map((x) => x.rating));
  assert.equal(a.events.length, b.events.length);
});
