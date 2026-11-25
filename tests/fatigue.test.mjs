// Zmęczenie w meczu: wolniejsi zawodnicy, błędy obrony, więcej fauli (FATIGUE w src/engine/match/constants.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics, assign } from '../src/engine/lineup.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { createMatch, runToEnd } from '../src/engine/match/match.js';
import { condSpeed, hungerOf, teamHunger, fatigueTolerance } from '../src/engine/match/teams.js';
import { shout } from '../src/engine/match/match.js';
import { SAT } from '../src/engine/match/constants.js';

const world = generateWorld(42);
const EK = CLUBS_PL.filter((c) => c.tier === 1);
const sq = Object.fromEntries(EK.map((c) => [c.id, squadOf(world, c.id)]));
const tac = Object.fromEntries(EK.map((c) => [c.id, createTactics(sq[c.id])]));
const side = (id, fresh = null) => ({ club: clubById(id), squad: fresh == null ? sq[id] : sq[id].map((p) => ({ ...p, fresh })), tactics: tac[id], ai: true, coach: clubById(id).coach });

function series(n, awayFresh) {
  const s = { err: 0, foulsAway: 0, homeW: 0 };
  for (let i = 0; i < n; i++) {
    const h = EK[i % 18].id; const a = EK[(i + 7) % 18].id;
    const r = runToEnd(createMatch({ seed: `zm${i}`, home: side(h), away: side(a, awayFresh) }));
    s.err += r.events.filter((e) => e.type === 'defError' && e.side === 1).length;
    s.foulsAway += r.stats[1].fouls;
    s.homeW += r.score[0] > r.score[1];
  }
  return s;
}

test('Szybkość spada z kondycją poniżej 85', () => {
  assert.equal(condSpeed(95), 1);
  assert.equal(condSpeed(85), 1);
  assert.ok(condSpeed(60) < 0.85 && condSpeed(60) > 0.8);
  assert.ok(condSpeed(20) >= 0.5);
});

test('Świeże składy: na starcie szybkość równa atrybutom, brak dodatkowego ryzyka błędów', () => {
  const M = createMatch({ seed: 'start', home: side('legia', 95), away: side('lech', 95) });
  for (const T of M.teams) {
    assert.ok(Math.abs(T.pace.att - T.pace.attRaw) < 1e-9 && Math.abs(T.pace.def - T.pace.defRaw) < 1e-9);
    assert.ok(T.errF < 1.05, `czynnik błędów ${T.errF}`);
  }
});

test('Zmęczeni goście: więcej błędów w obronie, więcej fauli, częściej przegrywają (400 meczów)', () => {
  const fresh = series(400, 95);
  const tired = series(400, 62);
  assert.ok(tired.err > fresh.err * 3 && tired.err >= 20, `błędy obrony: świeży ${fresh.err}, zmęczeni ${tired.err}`);
  assert.ok(tired.foulsAway > fresh.foulsAway * 1.05, `faule: świeży ${fresh.foulsAway}, zmęczeni ${tired.foulsAway}`);
  assert.ok(tired.homeW > fresh.homeW * 1.15, `wygrane gospodarzy: ${fresh.homeW} -> ${tired.homeW}`);
});

test('Napastnik na środku obrony popełnia błędy częściej niż nominalny obrońca', () => {
  const count = (swap) => {
    let n = 0;
    for (let i = 0; i < 300; i++) {
      const id = 'pogon-szczecin';
      let t = tac[id];
      if (swap) {
        const cbSlot = t.xi.findIndex((pid) => world.players[pid]?.pos === 'ŚO');
        const striker = sq[id].find((p) => p.pos === 'NAP' && !t.xi.includes(p.id));
        assert.ok(cbSlot >= 0 && striker, 'jest ŚO w składzie i napastnik poza nim');
        t = assign(t, { type: 'xi', idx: cbSlot }, striker.id);
      }
      const r = runToEnd(createMatch({ seed: `poza${i}`, home: { ...side('legia') }, away: { ...side(id), tactics: t } }));
      n += r.events.filter((e) => e.type === 'defError' && e.side === 1).length;
    }
    return n;
  };
  const natural = count(false); const swapped = count(true);
  // Próg 1,5: ok. 10 błędów na 300 meczów to mała próbka, a zmiana ławki (docs/sklad-lawki.md) przesuwa losowanie
  // (przed nią 10 i 24, po niej 11 i 22)
  assert.ok(swapped > natural * 1.5, `błędy: nominalny ŚO ${natural}, napastnik na ŚO ${swapped}`);
});

test('Nasycenie golami: głód goli z pracowitości, ambicji, profesjonalizmu, przywództwa i regularności; okrzyk go podnosi', () => {
  const base = sq[EK[0].id][0];
  const lazy = { ...base, attr: { ...base.attr, PRA: 4, LID: 4 }, traits: { ...(base.traits ?? {}), ambition: 4, professionalism: 4, ego: 4 }, hidden: { ...base.hidden, KON: 4, PRF: 4 } };
  const hungry = { ...base, attr: { ...base.attr, PRA: 18, LID: 18 }, traits: { ...(base.traits ?? {}), ambition: 18, professionalism: 18, ego: 18 }, hidden: { ...base.hidden, KON: 18, PRF: 18 } };
  assert.ok(hungerOf(hungry) > hungerOf(lazy) + 0.5, `${hungerOf(lazy)} ${hungerOf(hungry)}`);
  const M = createMatch({ seed: 'glod', home: side(EK[0].id), away: side(EK[1].id) });
  M.minute = 60; const T = M.teams[0];
  const h0 = teamHunger(T, M);
  assert.ok(h0 > 0 && h0 < 1);
  assert.equal(teamHunger(T, M), h0, 'w danej minucie ta sama wartość');
  const r = shout(M, 0, 'nieodpuszczamy');
  assert.ok(r.ok, r.error);
  M.minute = 61;
  assert.ok(teamHunger(T, M) > h0 + 0.15, 'okrzyk podnosi głód goli');
  assert.ok(T.shout.drain > 0, 'okrzyk kosztuje kondycję');
  assert.ok(SAT.slack2 < 1 && SAT.smax > 0);
});

test('Tolerancja zmęczenia: pracowity i wytrzymały znosi zmęczenie lepiej', () => {
  const base = sq[EK[0].id][3];
  const avg = (p) => { let s = 0; for (let i = 0; i < 40; i++) s += fatigueTolerance(p, `t${i}`); return s / 40; };
  const strong = { ...base, attr: { ...base.attr, PRA: 18, WYT: 18, OPA: 16 } };
  const weak = { ...base, attr: { ...base.attr, PRA: 4, WYT: 5, OPA: 6 } };
  assert.ok(avg(strong) < 0.8 && avg(weak) > 1.2, `${avg(strong)} ${avg(weak)}`);
});
