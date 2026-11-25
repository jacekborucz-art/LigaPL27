// Kapitan (docs/kapitan.md): siła B, forma psychiczna M, efekt E; wicekapitan w meczu; mniej fauli i kartek w derbach
// przy dobrym kapitanie; morale po porażkach i dryf tygodniowy; koszt złego wyboru opaski.
import test from 'node:test';
import assert from 'node:assert/strict';
import { captainPower, captainBase, captainMind, captainEffect, baseStakes, CAPTAIN } from '../src/engine/captain.js';
import { autoRoles, createTactics } from '../src/engine/lineup.js';
import { createMatch, step, runToEnd, substitute } from '../src/engine/match/match.js';
import { sendOff } from '../src/engine/match/core.js';
import { afterMatchDelta, weeklyDrift, applyMorale } from '../src/career/morale.js';
import { captainWeek, noteCaptain, clubCaptain, fixtureStakes, CAPT } from '../src/career/captaincy.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { clubById } from '../src/data/clubs_pl.js';

const mk = (id, o = {}) => ({
  id, name: id, clubId: 'K', age: 27, ovr: 12, morale: 12, persona: 'Spokojny',
  attr: { LID: 10, OPA: 10, ...(o.attr ?? {}) }, hidden: { KON: 10, PRF: 10, ...(o.hidden ?? {}) }, traits: { professionalism: 10, ...(o.traits ?? {}) },
  season: { min: 900 }, ...Object.fromEntries(Object.entries(o).filter(([k]) => !['attr', 'hidden', 'traits'].includes(k))),
});
const leader = (id = 'L', o = {}) => mk(id, { persona: 'Lider', age: 30, morale: 15, attr: { LID: 18, OPA: 16 }, hidden: { KON: 15 }, traits: { professionalism: 16 }, ...o });

test('Siła kapitana: lider z dobrym morale daje wysokie E, słaby przywódca niskie, lider w kryzysie ujemne', () => {
  const good = captainPower(leader());
  assert.ok(good.B > 0.8 && good.E >= 0.6, `dobry kapitan ${JSON.stringify(good)}`);
  const weak = captainPower(mk('W', { attr: { LID: 6, OPA: 8 }, age: 22 }));
  assert.ok(weak.B < 0.45 && weak.E < 0.2, `słaby kapitan ${JSON.stringify(weak)}`);
  // Lider z niskim morale albo z prośbą o transfer: M < 0,6, efekt ujemny
  const sad = captainPower(leader('S', { morale: 5 }));
  assert.ok(sad.M < 0.6 && sad.E < 0, `lider bez morale ${JSON.stringify(sad)}`);
  const wish = captainPower(leader('T', { morale: 12, moveWish: { stage: 'cicha' } }));
  assert.ok(wish.E < 0 && wish.E >= -CAPTAIN.negMax, `lider chce odejść ${JSON.stringify(wish)}`);
  // Świeżo złamana obietnica (14 dni) obniża formę psychiczną, starsza już nie
  const br = leader('B', { contract: { promise: { broken: true, brokenAt: '2026-10-01' } } });
  assert.ok(captainMind(br, '2026-10-10') < captainMind(br, '2026-11-10'));
  // Młody kapitan: C x0,75
  const kid = leader('Y', { age: 19 });
  assert.ok(Math.abs(captainPower(kid).C - 0.75 * captainBase(kid) * captainMind(kid)) < 1e-9);
  assert.equal(captainEffect(0.25, 0.8), 0);
  assert.equal(captainEffect(1, 1), 1);
  assert.equal(captainEffect(0.5, 0.3), -0.5);
});

test('Stawka meczu: derby 1,0, rywal 0,8, ranga 3 0,9, puchar 0,7, zwykły mecz 0,15', () => {
  assert.equal(baseStakes({ derby: true }), 1);
  assert.equal(baseStakes({ rival: true, rank: 2 }), 0.8);
  assert.equal(baseStakes({ rank: 3 }), 0.9);
  assert.equal(baseStakes({ knockout: 'single' }), 0.7);
  assert.equal(baseStakes({}), 0.15);
  assert.equal(baseStakes({ stakes: 0.4, derby: true }), 0.4);
  assert.equal(fixtureStakes({ comp: 'league', home: 'wisla-krakow', away: 'cracovia' }, 2), 1);
  assert.equal(fixtureStakes({ comp: 'friendly', home: 'wisla-krakow', away: 'cracovia' }, 0), 0);
});

test('Asystent wybiera kapitana z najwyższym C (siła x forma psychiczna)', () => {
  const sq = [mk('A', { attr: { LID: 14 } }), leader('B', { morale: 4 }), leader('C', { age: 31, morale: 13 })];
  assert.equal(autoRoles(sq, ['A', 'B', 'C']).captain, 'C');
});

const world = generateWorld(42);
const sq = { cracovia: squadOf(world, 'cracovia'), 'wisla-krakow': squadOf(world, 'wisla-krakow') };
const tac = { cracovia: createTactics(sq.cracovia), 'wisla-krakow': createTactics(sq['wisla-krakow']) };
const side = (id, extra = {}) => ({ club: clubById(id), squad: sq[id], tactics: tac[id], ai: true, coach: clubById(id).coach, ...extra });

test('Wicekapitan: po zejściu kapitana 2 minuty bez kapitana, potem najwyższe C na boisku x0,6; czerwona kapitana kosztuje zgranie', () => {
  const M = createMatch({ seed: 'kap-zmiana', home: { ...side('cracovia'), ai: false }, away: side('wisla-krakow'), ctx: { rank: 2, derby: true } });
  const T = M.teams[0];
  assert.ok(T.capX && T.capX.on);
  assert.equal(T.capE, T.capX.capE);
  while (M.minute < 30) step(M);
  const cap = T.capX;
  const inc = T.bench.find((x) => x.p.pos !== 'BR');
  assert.ok(substitute(M, 0, cap.id, inc.id).ok);
  step(M);
  assert.equal(T.capE, 0, 'szok po zejściu kapitana');
  step(M); step(M);
  const dep = T.players.filter((x) => x.on && !x.sentOff && x !== cap).reduce((b, x) => (x.capC > b.capC ? x : b));
  assert.ok(Math.abs(T.capE - CAPTAIN.deputy * dep.capE) < 1e-12, 'wicekapitan x0,6');
  // Kapitan poza jedenastką od początku: wicekapitan od pierwszej minuty
  const bench = tac.cracovia.bench.find((id) => sq.cracovia.find((p) => p.id === id)?.pos !== 'BR');
  const M2 = createMatch({ seed: 'kap-lawka', home: side('cracovia', { captainId: bench }), away: side('wisla-krakow'), ctx: {} });
  const T2 = M2.teams[0];
  const dep2 = T2.players.reduce((b, x) => (x.capC > b.capC ? x : b));
  assert.ok(Math.abs(T2.capE - CAPTAIN.deputy * dep2.capE) < 1e-12);
  // Czerwona kartka kapitana: spójność -5, potem 2 minuty bez kapitana
  const M3 = createMatch({ seed: 'kap-czerwona', home: { ...side('cracovia'), ai: false }, away: side('wisla-krakow'), ctx: { rank: 2 } });
  const T3 = M3.teams[0];
  step(M3);
  const s0 = T3.S;
  sendOff(M3, T3, T3.capX, 'violent');
  assert.equal(T3.S, s0 - CAPTAIN.redS);
  step(M3);
  assert.equal(T3.capE, 0);
});

test('Derby: kapitan E=0,9 wobec E=0,2 (te same ziarna): mniej fauli i kartek', () => {
  const run = (E, ctx, n) => {
    let fouls = 0; let cards = 0;
    for (let i = 0; i < n; i++) {
      const M = createMatch({ seed: `kap-derby:${i}`, home: side('cracovia'), away: side('wisla-krakow'), ctx });
      M.teams[0].capX.capE = E;
      runToEnd(M);
      for (const e of M.events) {
        if (e.side !== 0) continue;
        if (e.type === 'foul') fouls++;
        if ((e.type === 'yellow' || e.type === 'red') && !e.bench) cards++;
      }
    }
    return { fouls, cards };
  };
  const hi = run(0.9, { rank: 2, derby: true }, 400); const lo = run(0.2, { rank: 2, derby: true }, 400);
  assert.ok(hi.fouls < 0.97 * lo.fouls, `faule ${hi.fouls} wobec ${lo.fouls}`);
  assert.ok(hi.cards < lo.cards, `kartki ${hi.cards} wobec ${lo.cards}`);
});

test('Morale: porażka boli mniej przy dobrym kapitanie, bardziej przy kapitanie w kryzysie; wygrana z rywalem cieszy bardziej', () => {
  const base = afterMatchDelta({ result: 'L', strengthDiff: 0 });
  const good = afterMatchDelta({ result: 'L', strengthDiff: 0, capE: 0.9 });
  const bad = afterMatchDelta({ result: 'L', strengthDiff: 0, capE: -0.5 });
  assert.ok(good > base && base > bad, `${good} ${base} ${bad}`);
  assert.ok(afterMatchDelta({ result: 'L', strengthDiff: 0, lossStreak: 4, capE: 0.7 }) > afterMatchDelta({ result: 'L', strengthDiff: 0, lossStreak: 4, capE: 0.5 }));
  assert.ok(afterMatchDelta({ result: 'W', strengthDiff: 0, rival: true, capE: 0.9 }) > afterMatchDelta({ result: 'W', strengthDiff: 0, rival: true }));
  assert.equal(afterMatchDelta({ result: 'W', strengthDiff: 0, capE: 0.9 }), 1.5, 'zwykła wygrana bez premii kapitana');
  // 4 porażki z rzędu i 3 tygodnie: kapitan E 0,75 wobec E 0,15
  const after = (E) => {
    let m = 12;
    for (let k = 1; k <= 4; k++) { m = weeklyDrift(m, E); m = applyMorale(m, afterMatchDelta({ result: 'L', strengthDiff: 0, lossStreak: k, capE: E })); }
    for (let w = 0; w < 3; w++) m = weeklyDrift(m, E);
    return m;
  };
  const d = after(0.75) - after(0.15);
  assert.ok(d >= 0.8 && d <= 1.4, `różnica morale ${d}`);
});

test('Dryf tygodniowy: dobry kapitan szybciej podnosi niskie morale, kapitan w kryzysie spowalnia i szybciej gasi dobre nastroje', () => {
  assert.equal(weeklyDrift(15), 14.7);
  assert.equal(weeklyDrift(12.1), 12);
  assert.ok(weeklyDrift(8, 1) > weeklyDrift(8, 0) && weeklyDrift(8, 0) > weeklyDrift(8, -0.5));
  assert.ok(weeklyDrift(8, -0.5) - 8 >= 0.2 - 1e-12);
  assert.ok(weeklyDrift(15, -0.5) < weeklyDrift(15, 0.8));
  assert.equal(weeklyDrift(15, 0.8), 14.7, 'dobry kapitan nie gasi dobrych nastrojów');
});

/** Mały klub K: lider, słaby kandydat na kapitana, weterani i reszta kadry. */
function club(capId = 'W') {
  const ps = [leader('L'), mk('W', { attr: { LID: 6, OPA: 8 }, age: 22 }), mk('V1', { age: 32 }), mk('V2', { age: 31 }), mk('X1'), mk('X2'), mk('Kid', { age: 19, attr: { LID: 12 } })];
  return { clubId: 'K', date: '2026-11-02', tactics: { captain: capId }, world: { clubs: { K: { squad: ps.map((p) => p.id) } }, players: Object.fromEntries(ps.map((p) => [p.id, p])) } };
}
const mondays = (n, from = '2026-11-02') => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T12:00:00Z`) + i * 7 * 864e5).toISOString().slice(0, 10));

test('Naturalny lider bez opaski traci morale co tydzień, po 6 tygodniach jest niezadowolony; z opaską bez kary', () => {
  const g = club('W');
  const L = g.world.players.L;
  for (const d of mondays(5)) captainWeek(g, d);
  assert.equal(L.morale, 15 + 5 * CAPT.snub);
  assert.ok(!L.unhappy);
  captainWeek(g, '2026-12-07');
  assert.ok(L.unhappy && L.capSnub === 6);
  // Gracz oddaje opaskę liderowi: kara znika, niezadowolenie z tego powodu też
  noteCaptain(g, 'L', '2026-12-08');
  captainWeek(g, '2026-12-14');
  assert.ok(!L.unhappy && !L.capSnub);
  assert.equal(clubCaptain(g, 'K').id, 'L');
  const g2 = club('L');
  for (const d of mondays(3)) captainWeek(g2, d);
  assert.equal(g2.world.players.L.morale, 15);
});

test('Młody kapitan: weterani tracą morale raz w miesiącu; częste zmiany opaski kosztują całą kadrę', () => {
  const g = club('Kid');
  captainWeek(g, '2026-11-02'); // pierwszy poniedziałek miesiąca
  captainWeek(g, '2026-11-09');
  assert.equal(g.world.players.V1.morale, 12 + CAPT.youngVets);
  assert.equal(g.world.players.X1.morale, 12);
  const h = club('L');
  captainWeek(h, '2026-11-02');
  noteCaptain(h, 'X1', '2026-11-03');
  captainWeek(h, '2026-11-09');
  assert.equal(h.world.players.X2.morale, 12, 'jedna zmiana bez kary');
  noteCaptain(h, 'L', '2026-11-20');
  captainWeek(h, '2026-11-23');
  assert.equal(h.world.players.X2.morale, 12 + CAPT.change, 'druga zmiana w 6 tygodni');
});
