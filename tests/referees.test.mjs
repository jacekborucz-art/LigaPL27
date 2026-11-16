import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { Rng } from '../src/core/rng.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { applySeasonState } from '../src/season/rollover.js';
import { ensureReferees, refOf, refListFor, refStrictFor, clubWoj, matchReferee, observerMark, REF_CFG, REAL_REF_SURNAMES } from '../src/career/referees.js';
import '../src/season/dailySystems.js';

function newGame(clubId, seed) {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  return g;
}

function playTo(g, until) {
  while (g.date < until) {
    for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === g.clubId || x.away === g.clubId))) {
      const rng = new Rng(`gracz:${f.id}`); applyResult(g, f, playQuick(g, f, rng), rng);
    }
    for (const m of g.inbox.filter((x) => !x.resolved && x.actions?.length && !x.optional)) { m.resolved = true; runDecision(g, m, m.actions[0].id); }
    g.date = addDays(g.date, 1);
    processDay(g);
  }
}

test('Pula sędziów: listy 20/22/22/72, fikcyjne nazwiska bez powtórek, wyżej lepsi, deterministycznie z ziarna', () => {
  const a = ensureReferees({ seed: 11 });
  const b = ensureReferees({ seed: 11 });
  assert.deepEqual(a.list, b.list);
  assert.deepEqual([1, 2, 3, 4].map((l) => a.list.filter((r) => r.l === l).length), REF_CFG.sizes);
  assert.equal(new Set(a.list.map((r) => r.n)).size, a.list.length);
  const old = ['Bartosz Frankowski', 'Szymon Marciniak', 'Daniel Stefański', 'Paweł Raczkowski', 'Marek Wierzbicki'];
  for (const r of a.list) {
    assert.ok(!REAL_REF_SURNAMES.has(r.n.split(' ').pop()), r.n);
    assert.ok(!old.includes(r.n));
    assert.ok(r.a.length === 7 && r.a.every((v) => v >= 1 && v <= 20));
    assert.ok(r.e >= 1 && r.e <= 20 && r.s >= 0.7 && r.s <= 1.4 && r.w);
  }
  const q = (l) => { const xs = a.list.filter((r) => r.l === l); return xs.reduce((s, r) => s + r.a[0], 0) / xs.length; };
  assert.ok(q(1) > q(2) && q(2) > q(3) && q(3) > q(4));
  // każde województwo ma sędziów na liście III ligi
  assert.equal(new Set(a.list.filter((r) => r.l === 4).map((r) => r.w)).size, 16);
  // normalizacja: średnia surowość dla silnika na każdej liście = 1,0
  for (const l of [1, 2, 3, 4]) {
    const xs = a.list.filter((r) => r.l === l).map((r) => r.s / a.norm[l]);
    assert.ok(Math.abs(xs.reduce((s, x) => s + x, 0) / xs.length - 1) < 1e-9);
  }
  assert.notDeepEqual(ensureReferees({ seed: 12 }).list.map((r) => r.n), a.list.map((r) => r.n));
});

test('Stary zapis bez sędziów: pula powstaje, mecz gracza ma sędziego z listy', () => {
  const g = newGame('legia', 5);
  delete g.refs;
  const f = g.fixtures.find((x) => x.comp === 'ekstraklasa' && (x.home === 'legia' || x.away === 'legia'));
  const ref = matchReferee(g, f);
  assert.ok(g.refs.list.length === 136);
  assert.equal(refOf(g, f.ref).l, 1);
  assert.equal(ref.name, refOf(g, f.ref).n);
  assert.ok(ref.strictness > 0.5 && ref.strictness < 1.6);
});

test('Nota obserwatora: skala 6,0 do 10,0 z krokiem 0,1, średnio ok. 8,2 do 8,4', () => {
  const R = ensureReferees({ seed: 3 });
  const xs = [];
  for (const r of R.list) for (let i = 0; i < 20; i++) xs.push(observerMark(r, { id: `t${i}`, comp: ['ekstraklasa', 'liga1', 'liga2', 'liga3-1'][r.l - 1], home: 'a', away: 'b' }, 3).mark);
  for (const m of xs) { assert.ok(m >= 6 && m <= 10); assert.equal(Math.round(m * 10) / 10, m); }
  const avg = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(avg > 8.1 && avg < 8.45, `średnia ${avg}`);
});

test('Pełny sezon: każdy polski mecz ma sędziego z właściwej listy, bez województwa klubów, równe obciążenie', () => {
  const g = newGame('widzew', 7);
  playTo(g, '2027-06-29');
  const R = g.refs;
  const pl = g.fixtures.filter((f) => f.played && refListFor(f));
  assert.ok(pl.length > 1900, `meczów ${pl.length}`);
  let wojHit = 0; let wrongList = 0;
  for (const f of pl) {
    const r = refOf(g, f.ref);
    assert.ok(r, `brak sędziego ${f.id}`);
    const L = refListFor(f);
    if (r.l !== L) wrongList++;
    if (r.w === clubWoj(f.home) || r.w === clubWoj(f.away)) wojHit++;
  }
  assert.ok(wrongList / pl.length < 0.02, `spoza listy ${wrongList}`);
  assert.ok(wojHit / pl.length < 0.01, `z województwa klubu ${wojHit}`);
  // Superpuchar i finał PP: lista Ekstraklasy
  for (const f of pl.filter((x) => x.comp === 'super' || (x.comp === 'pp' && x.round === 'F'))) assert.equal(refOf(g, f.ref).l, 1);
  // obciążenie: każdy sędzia listy prowadzi mecze, rozrzut umiarkowany
  for (const l of [1, 2, 3, 4]) {
    const ns = R.list.filter((r) => r.l === l).map((r) => R.st[r.id]?.[1] ?? 0);
    const avg = ns.reduce((s, x) => s + x, 0) / ns.length;
    assert.ok(Math.min(...ns) >= avg * 0.6 && Math.max(...ns) <= avg * 1.5, `lista ${l}: ${Math.min(...ns)}-${Math.max(...ns)} średnio ${avg}`);
  }
  // ten sam sędzia z tym samym klubem nie w 4 kolejnych meczach klubu (liga), poza rzadkimi wyjątkami
  const byClub = new Map();
  for (const f of pl.filter((x) => x.comp === 'ekstraklasa').sort((a, b) => a.date.localeCompare(b.date))) for (const c of [f.home, f.away]) { if (!byClub.has(c)) byClub.set(c, []); byClub.get(c).push(f.ref); }
  let rep = 0; let n = 0;
  for (const refs of byClub.values()) for (let i = 1; i < refs.length; i++) { n++; if (refs.slice(Math.max(0, i - 3), i).includes(refs[i])) rep++; }
  assert.ok(rep / n < 0.02, `powtórki ${rep}/${n}`);
  // ekspozycja na surowość w lidze: średnio ok. 1,0
  for (const comp of ['ekstraklasa', 'liga1', 'liga2']) {
    const xs = pl.filter((f) => f.comp === comp).map((f) => refStrictFor(g, f));
    const avg = xs.reduce((s, x) => s + x, 0) / xs.length;
    assert.ok(Math.abs(avg - 1) < 0.04, `${comp} surowość ${avg}`);
  }
  // noty obserwatora: każdy oceniony mecz ma notę, statystyki sezonu się zgadzają
  const marks = Object.values(R.st).reduce((s, x) => s + x[1], 0);
  assert.equal(marks, pl.filter((f) => f.comp !== 'friendly').length);
});
