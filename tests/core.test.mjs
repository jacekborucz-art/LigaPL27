// Testy etapu 0: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng, hashString } from '../src/core/rng.js';
import { CLUBS_PL, clubsInTier, clubById } from '../src/data/clubs_pl.js';
import { COMPETITIONS, RESERVES } from '../src/config/competitions.js';
import { UEFA, DOMESTIC, inFifaWindow } from '../src/config/calendar2026.js';
import { parseImport, SAVE_VERSION } from '../src/core/store.js';

test('RNG jest deterministyczny i odtwarzalny ze stanu', () => {
  const a = new Rng(12345);
  const b = new Rng(12345);
  const seqA = Array.from({ length: 50 }, () => a.next());
  assert.deepEqual(seqA, Array.from({ length: 50 }, () => b.next()));
  const snap = a.toJSON();
  const next = a.next();
  assert.equal(Rng.fromJSON(snap).next(), next);
  assert.equal(hashString('lech'), hashString('lech'));
});

test('RNG: rozkłady mają poprawne średnie', () => {
  const r = new Rng('kalibracja');
  const n = 20000;
  let sum = 0; let sumG = 0; let sumP = 0;
  for (let i = 0; i < n; i++) { sum += r.next(); sumG += r.gauss(10, 2); sumP += r.poisson(1.35); }
  assert.ok(Math.abs(sum / n - 0.5) < 0.01);
  assert.ok(Math.abs(sumG / n - 10) < 0.05);
  assert.ok(Math.abs(sumP / n - 1.35) < 0.03);
});

test('3 ligi po 18 drużyn, unikalne id', () => {
  for (const t of [1, 2, 3]) assert.equal(clubsInTier(t).length, 18, `liga ${t}`);
  assert.equal(new Set(CLUBS_PL.map((c) => c.id)).size, 54);
});

test('Średnie siły lig zgodne z założeniami eksperta', () => {
  const avg = (t) => clubsInTier(t).reduce((s, c) => s + c.L, 0) / 18;
  assert.ok(Math.abs(avg(1) - 11.5) < 0.1, `EK ${avg(1)}`);
  assert.ok(Math.abs(avg(2) - 10.0) < 0.1, `1L ${avg(2)}`);
  assert.ok(Math.abs(avg(3) - 8.5) < 0.1, `2L ${avg(3)}`);
});

test('Rezerwy: rodzic istnieje, gra wyżej, a rezerwy nie wyżej niż 2 Liga', () => {
  const reserves = CLUBS_PL.filter((c) => c.parent);
  assert.deepEqual(reserves.map((c) => c.id).sort(), ['legia-ii', 'slask-ii']);
  for (const r of reserves) {
    const parent = clubById(r.parent);
    assert.ok(parent, r.id);
    assert.ok(r.tier > parent.tier);
    assert.ok(r.tier <= RESERVES.reserveMaxTier);
  }
});

test('Reguły meczu: 5 zmian, 3 okna, brak młodzieżowca', () => {
  for (const key of ['ekstraklasa', 'liga1', 'liga2', 'pucharPolski', 'uefa']) {
    assert.equal(COMPETITIONS[key].maxSubs, 5);
    assert.equal(COMPETITIONS[key].subWindows, 3);
    assert.equal(COMPETITIONS[key].youthRule, undefined);
  }
  assert.equal(COMPETITIONS.ekstraklasa.var, true);
  assert.equal(COMPETITIONS.liga1.var, false);
});

test('Kalendarz UEFA: rundy w kolejności i rewanż po pierwszym meczu', () => {
  const order = ['Q1', 'Q2', 'Q3', 'PO', 'league', 'KPO', 'R16', 'QF', 'SF', 'F'];
  for (const [comp, rounds] of Object.entries(UEFA)) {
    let last = '';
    for (const key of order) {
      const v = rounds[key];
      if (!v) continue;
      const dates = Array.isArray(v) ? v : [v];
      for (const d of dates) {
        assert.ok(d > last, `${comp} ${key} ${d} po ${last}`);
        last = d;
      }
    }
  }
  const pp = DOMESTIC.pucharPolski.rounds.map((r) => r.date);
  assert.deepEqual(pp, [...pp].sort());
});

test('Import zapisu: odrzuca złe pliki z czytelnym komunikatem', () => {
  assert.throws(() => parseImport('nie json'), /JSON/);
  assert.throws(() => parseImport(JSON.stringify({ version: 99, game: { seed: 1 } })), /wersję/);
  assert.throws(() => parseImport(JSON.stringify({ version: SAVE_VERSION })), /ziarna/);
  const ok = parseImport(JSON.stringify({ version: SAVE_VERSION, game: { seed: 7, clubId: 'lech' } }));
  assert.equal(ok.game.seed, 7);
});

test('Żaden mecz klubowy UEFA ani Puchar Polski nie wypada w oknie FIFA', () => {
  for (const [comp, rounds] of Object.entries(UEFA)) {
    for (const [key, v] of Object.entries(rounds)) {
      for (const d of (Array.isArray(v) ? v : [v])) assert.ok(!inFifaWindow(d), `${comp} ${key} ${d}`);
    }
  }
  for (const r of DOMESTIC.pucharPolski.rounds) assert.ok(!inFifaWindow(r.date), `PP ${r.id}`);
});

test('Tryb offline: każdy plik gry jest na liście sw.js (uruchom npm run sw po dodaniu pliku)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const sw = fs.readFileSync('sw.js', 'utf8');
  const missing = walk('src').filter((f) => /\.(js|css|json)$/.test(f)).map((f) => `./${f.split(path.sep).join('/')}`).filter((f) => !sw.includes(`'${f}'`));
  assert.deepEqual(missing, []);
});
