// Silnik rozgrywek reprezentacji na 100 lat (src/season/intl/engine.js): komplet turniejów każdego roku,
// formaty, gospodarze, przydział miejsc na MŚ, terminy w oknach FIFA, Elo, rozmiar zapisu, determinizm.
// Tylko silnik w tle (bez sezonu klubowego), żeby test był szybki.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNational, nationalDay } from '../src/season/national.js';
import { createIntl, intlDay, rateNt, confOf, FMT, WC_SLOTS, UEFA_TEAMS, BASE_ELO, lnTable } from '../src/season/intl/engine.js';
import { yearWindows, tourPeriod, addDaysIso } from '../src/season/intl/windows.js';
import { bindRatings, lFromElo } from '../src/season/intl/ratings.js';
import { euroGroupTable } from '../src/season/national.js';

/** Liga Narodów 2026/27 i eliminacje Euro 2028 z national.js (bez zawodników) i silnik do daty until. */
function runIntl(seed, until, onYearEnd) {
  const N = createNational(seed); const I = createIntl(seed); const history = [];
  const pol = [];
  for (let d = '2026-07-01'; d <= until; d = addDaysIso(d, 1)) {
    bindRatings(I.ratings);
    if (d <= '2027-12-31') { const ev = nationalDay(N, d, {}, { windows: [], onResult: (m) => rateNt(I, m) }); pol.push(...ev.played.filter((m) => m.home === 'POL' || m.away === 'POL').map((m) => m.date)); }
    const ev = intlDay(I, d, { N, history });
    pol.push(...ev.played.filter(({ m }) => m.h === 'POL' || m.a === 'POL').map(({ m }) => m.d));
    if (d.endsWith('-12-31')) onYearEnd?.(I, N, d);
    if (d === '2027-11-25') onYearEnd?.(I, N, d);
  }
  bindRatings(null);
  return { N, I, history, pol };
}

const EXPECT = (y) => {
  const out = [];
  if (y % 4 === 0) out.push('EURO', 'COPA', 'OFC'); else if (y % 2 === 0) out.push('WC');
  else { out.push('LN', 'GOLD'); if ((y - 2027) % 4 === 0) out.push('ASIA', 'AFCON'); }
  return out.sort();
};

test('100 lat rozgrywek: każdy rok ma swoje turnieje, formaty i przydział miejsc się zgadzają, zapis zostaje mały', () => {
  const t0 = performance.now();
  const checked = new Set(); let maxSize = 0; const issues = [];
  const { I, history, pol } = runIntl(3, '2126-12-31', (I, N, d) => {
    maxSize = Math.max(maxSize, JSON.stringify(I).length);
    for (const c of Object.values(I.comps)) {
      if (checked.has(c.key)) continue;
      if (c.key === 'UQ-2028' && d === '2027-11-25') {
        // Euro 2028: wyniki grup z national.js, zwycięzcy grup awansują
        for (const g of Object.keys(N.euro.groups)) assert.ok(c.direct.includes(euroGroupTable(N, g)[0].id), `zwycięzca grupy ${g}`);
        assert.equal(c.direct.length + c.hostSlots.length + c.paths.length, 24);
        checked.add(c.key);
      }
      if (c.st !== 'done') continue;
      checked.add(c.key);
      if (FMT[c.type]) {
        const f = FMT[c.type];
        assert.equal(c.teams.length, f.n, `${c.key}: drużyny`);
        assert.equal(new Set(c.teams).size, f.n, `${c.key}: bez powtórzeń`);
        assert.ok(c.teams.every((t) => !t.startsWith('@')), `${c.key}: baraże rozstrzygnięte`);
        assert.equal(Object.keys(c.groups).length, f.groups);
        for (const g of Object.values(c.groups)) assert.equal(g.length, 4);
        assert.equal(c.m.filter((m) => m.k === f.ko[0]).length, (f.groups * 2 + f.thirds) / 2, `${c.key}: pierwsza runda pucharowa`);
        // Gospodarze grają (Euro: najwyżej 2 miejsca zarezerwowane dla gospodarzy bez awansu z eliminacji)
        if (c.type === 'EURO') assert.ok(c.host.filter((h) => c.teams.includes(h)).length >= Math.min(2, c.host.length), `${c.key}: gospodarze`);
        else assert.ok(c.host.every((h) => c.teams.includes(h)), `${c.key}: gospodarze grają`);
        for (const m of c.m) assert.ok(m.d >= c.from && m.d <= c.to, `${c.key}: mecz ${m.d} w terminie turnieju`);
        if (c.type === 'WC' || c.type === 'EURO') { const t = tourPeriod(c.y); assert.equal(c.from, t.from); assert.equal(c.to, t.to); }
        if (c.type === 'WC') {
          const by = {}; for (const t of c.teams) by[confOf(t)] = (by[confOf(t)] ?? 0) + 1;
          assert.equal(by.UEFA, WC_SLOTS.UEFA, `${c.key}: UEFA ${by.UEFA}`);
          for (const cf of ['CAF', 'AFC', 'CONMEBOL', 'CONCACAF', 'OFC']) assert.ok(by[cf] >= WC_SLOTS[cf] && by[cf] <= WC_SLOTS[cf] + 2, `${c.key}: ${cf} ${by[cf]}`);
          for (const g of Object.values(c.groups)) for (const cf of ['CAF', 'AFC', 'CONMEBOL', 'CONCACAF', 'OFC']) if (g.filter((t) => confOf(t) === cf).length > 1) issues.push(`${c.key} grupa z dwiema drużynami ${cf}`);
        }
      }
      if (c.type === 'LN') {
        const all = [...c.leagues.A, ...c.leagues.B, ...c.leagues.C];
        assert.deepEqual([c.leagues.A.length, c.leagues.B.length, c.leagues.C.length], [18, 18, 18], c.key);
        assert.deepEqual([...all].sort(), [...UEFA_TEAMS].sort(), `${c.key}: wszystkie federacje UEFA`);
        for (const lg of ['A', 'B', 'C']) for (const r of lnTable(c, lg)) assert.equal(r.p, 6, `${c.key} ${r.id}: 6 meczów`);
      }
      if (c.type === 'UQ' && c.key !== 'UQ-2028') {
        const teams = Object.values(c.groups).flat();
        assert.equal(Object.keys(c.groups).length, 12);
        assert.equal(new Set(teams).size, teams.length);
        if (c.tour === 'EURO') assert.equal(teams.length, 54); else assert.equal(teams.length + c.hosts.filter((h) => confOf(h) === 'UEFA').length, 54);
      }
      if (c.type === 'UQ' || c.type === 'LN' || c.type === 'TOW') {
        const ws = [...yearWindows(Number(c.key.split('-')[1]) - 1), ...yearWindows(Number(c.key.split('-')[1])), ...yearWindows(Number(c.key.split('-')[1]) + 1)];
        for (const m of c.m) assert.ok(ws.some((w) => w.matches && m.d >= w.from && m.d <= w.to), `${c.key}: mecz ${m.d} w oknie FIFA`);
      }
      if (c.type === 'CQ') assert.equal(c.direct.length, WC_SLOTS[c.conf] - c.hosts.length, `${c.key}: miejsca`);
    }
  });
  const ms = performance.now() - t0;
  assert.ok(ms < 30000, `czas ${Math.round(ms)} ms`);
  assert.deepEqual(issues, []);
  // Każdy rok: oczekiwane rozgrywki z mistrzem, finalistą i półfinalistami
  for (let y = 2027; y <= 2126; y++) {
    const hs = history.filter((h) => h.year === y);
    assert.deepEqual(hs.map((h) => h.comp).sort(), EXPECT(y), `${y}`);
    for (const h of hs) {
      assert.ok(h.champion && h.runnerUp && h.champion !== h.runnerUp, `${y} ${h.comp}`);
      assert.equal(h.semis.length, 4, `${y} ${h.comp}: półfinaliści`);
      assert.ok(h.semis.includes(h.champion) && h.semis.includes(h.runnerUp));
      if (['EURO', 'WC', 'LN'].includes(h.comp)) assert.ok(h.poland && h.polandResult, `${y} ${h.comp}: wynik Polski`);
    }
  }
  assert.ok(history.find((h) => h.comp === 'EURO' && h.year === 2028).host.join() === 'ENG,IRL,SCO,WAL');
  assert.ok(history.find((h) => h.comp === 'EURO' && h.year === 2032).host.join() === 'ITA,TUR');
  assert.ok(history.find((h) => h.comp === 'WC' && h.year === 2030).host.join() === 'ESP,POR,MAR');
  assert.ok(history.find((h) => h.comp === 'WC' && h.year === 2034).host.join() === 'KSA');
  // Zapis: szczegóły tylko bieżących rozgrywek, historia krótka
  const sizeI = JSON.stringify(I).length; const sizeH = JSON.stringify(history).length;
  assert.ok(maxSize < 160000, `stan silnika maks. ${maxSize} B`);
  assert.ok(sizeH < 60000, `historia ${sizeH} B`);
  // Polska nigdy nie gra dwa razy w ciągu 2 dni
  const ps = [...pol].sort();
  for (let i = 1; i < ps.length; i++) assert.ok(Date.parse(ps[i]) - Date.parse(ps[i - 1]) >= 2 * 864e5, `Polska ${ps[i - 1]} i ${ps[i]}`);
  // Elo: L w granicach wzoru, rozrzut względem poziomu bazowego ograniczony
  const diffs = Object.keys(BASE_ELO).map((k) => I.ratings[k] - BASE_ELO[k]);
  const sd = Math.sqrt(diffs.reduce((s, x) => s + x * x, 0) / diffs.length);
  assert.ok(sd > 5 && sd < 90, `odchylenie Elo ${sd.toFixed(1)}`);
  for (const k of Object.keys(I.ratings)) { const L = lFromElo(I.ratings[k]); assert.ok(L >= 6.5 && L <= 17.5, `${k} L ${L}`); }
  console.log(`100 lat: ${Math.round(ms)} ms, stan ${sizeI} B (maks. ${maxSize} B), historia ${sizeH} B, ${history.length} wpisów, odchylenie Elo ${sd.toFixed(1)}`);
});

test('Determinizm: to samo ziarno daje te same turnieje i wyniki, inne ziarno inne', () => {
  const a = runIntl(5, '2032-12-31').history; const b = runIntl(5, '2032-12-31').history; const c = runIntl(6, '2032-12-31').history;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((h) => h.champion), c.map((h) => h.champion));
});

test('Elo: wyniki Polski zmieniają jej siłę, mecz o wysoką stawkę waży więcej', async () => {
  const { eloUpdate } = await import('../src/season/intl/ratings.js');
  const r = { POL: 1735, SWE: 1790, SMR: 860 };
  const d1 = eloUpdate(r, 'POL', 'SWE', [2, 0], { kind: 'WC', neutral: true });
  assert.ok(d1 > 0 && r.POL > 1735 && r.SWE < 1790);
  const r2 = { POL: 1735, SWE: 1790 };
  const d2 = eloUpdate(r2, 'POL', 'SWE', [2, 0], { kind: 'F', neutral: true });
  assert.ok(d1 > d2 * 2.5, 'MŚ ważniejsze niż sparing');
  const r3 = { POL: 1735, SMR: 860 };
  const d3 = eloUpdate(r3, 'POL', 'SMR', [1, 0], { kind: 'Q' });
  assert.ok(d3 > 0 && d3 < 1, 'zwycięstwo z najsłabszym prawie bez zmian');
});
