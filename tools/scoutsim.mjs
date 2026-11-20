// Kalibracja skautingu zagranicznego (docs/skauting.md, rozdz. 9): Monte Carlo generatora kandydatów po siatce
// skuteczności skauta s, długości wyjazdu, trudności profilu D i znajomości regionu. Wynik: odsetek pustych wyjazdów,
// średnia liczba kandydatów, średni błąd oceny, odsetek wydmuszek i porównanie z celami projektu.
// Użycie: node tools/scoutsim.mjs [liczba prób na punkt siatki, domyślnie 2000]
//         node tools/scoutsim.mjs sezon [klub] [ziarno]  (jeden sezon gry: bot gracza z 3 misjami, misje i zakupy AI)

import { Rng } from '../src/core/rng.js';
import { SCOUT, missionLambda, weekEvents, rollCandidates, scoutIndex } from '../src/career/scoutOps.js';

if (process.argv[2] === 'sezon') { await seasonRun(process.argv[3] ?? 'widzew', Number(process.argv[4] ?? 5)); process.exit(0); }
const RUNS = Number(process.argv[2] ?? 2000);
const game = { seed: 4242, date: '2026-07-06', world: { players: {} } };

/** Jedna wyprawa: zdarzenia tygodni i kandydaci (bez limitu kwoty, więc liczy się sam generator). */
function trip(i, s, weeks, D, k = s, c = 10.8) {
  const m = { id: `sim${i}`, weeks, contract: 'any', maxFee: 0, maxWage: 0, ageFrom: 20, ageTo: 28, pos: 'ŚP', region: 'balkany', events: [], calc: { lambda: missionLambda(s, weeks, D), k, c, pot: null } };
  for (let w = 1; w <= weeks; w++) for (const kind of weekEvents(game, m, w)) m.events.push({ kind });
  return rollCandidates(game, m, null);
}

function point(s, weeks, D, runs = RUNS) {
  let zero = 0; let sum = 0; let err = 0; let n = 0; let below = 0;
  const c = 10.8;
  for (let i = 0; i < runs; i++) {
    const r = trip(`${s}-${weeks}-${D}-${i}`, s, weeks, D, s, c);
    if (!r.players.length) zero++;
    sum += r.players.length;
    for (const { p } of r.players) { err += Math.abs(p.ovr - c); n++; if (p.ovr < c - 0.3) below++; }
  }
  return { p0: zero / runs, mean: sum / runs, err: n ? err / n : 0, below: n ? below / n : 0 };
}

const pct = (x) => `${(100 * x).toFixed(1)} %`;
const f2 = (x) => x.toFixed(2);

console.log(`Skauting: siatka Monte Carlo, ${RUNS} prób na punkt (T = ${JSON.stringify(SCOUT.T)}, kształt ${SCOUT.shape})\n`);
console.log('s     tyg.  D     P(0)     śr. N  |ovr-cel|  poniżej celu');
for (const s of [0.3, 0.45, 0.6, 0.75, 0.9]) {
  for (const weeks of SCOUT.weeks) {
    for (const D of [0.2, 0.5, 0.8]) {
      const r = point(s, weeks, D, Math.max(200, Math.round(RUNS / 4)));
      console.log(`${s.toFixed(2)}  ${weeks}     ${D.toFixed(1)}   ${pct(r.p0).padStart(7)}  ${f2(r.mean).padStart(5)}  ${f2(r.err).padStart(8)}  ${pct(r.below).padStart(8)}`);
    }
  }
}

// Region: ekspert, obcy z dużą siecią kontaktów, obcy z małą siecią (ten sam skaut poza tym)
const sc = (reg, sie) => ({ q: 12, a: { DOS: 12, OCE: 12, RYN: 12, SIE: sie, CHA: 12 }, reg });
const rows = [['ekspert (region 17, sieć 12)', sc({ balkany: 17 }, 12)], ['obcy region, sieć 18', sc({}, 18)], ['obcy region, sieć 8', sc({}, 8)]];
console.log('\nZnajomość regionu (4 tygodnie, D 0,4):');
for (const [label, p] of rows) {
  const ix = scoutIndex(p, 'balkany');
  const r = point(ix.s, 4, 0.4);
  console.log(`  ${label.padEnd(32)} s ${f2(ix.s)}  R ${ix.R.toFixed(1)}  P(0) ${pct(r.p0)}  śr. N ${f2(r.mean)}`);
}

// Wydmuszki: szansa 0,30 (1 - a)^1,5 (a: dokładność raportu)
console.log('\nWydmuszki (prawdziwy poziom niższy o 1,5-3):');
for (const a of [0.3, 0.45, 0.6, 0.75, 0.9]) console.log(`  a ${a.toFixed(2)}: ${pct(0.30 * (1 - a) ** 1.5)}, sigma atrybutów ${(0.5 + 2.5 * (1 - a)).toFixed(2)}`);

// Cele projektu (docs/skauting.md, rozdz. 9)
const T = [
  ['1 tydzień, średni skaut (s 0,6, D 0,4): P(0) 55-65 %', point(0.6, 1, 0.4).p0, 0.55, 0.65],
  ['4 tygodnie, średni skaut (s 0,6, D 0,4): P(0) 15-25 %', point(0.6, 4, 0.4).p0, 0.15, 0.25],
  ['6 tygodni, silny skaut (s 0,85, D 0,2): P(0) 3-8 %', point(0.85, 6, 0.2).p0, 0.03, 0.08],
  ['słaby skaut, 1 tydzień (s 0,4, D 0,5): P(0) ok. 55-75 %', point(0.4, 1, 0.5).p0, 0.55, 0.75],
];
const mix = [[0.6, 2, 0.4], [0.6, 4, 0.4], [0.7, 4, 0.3], [0.5, 4, 0.5], [0.75, 6, 0.3], [0.55, 2, 0.5]].map(([s, w, D]) => point(s, w, D, Math.round(RUNS / 2)).mean);
T.push(['typowe misje gracza: średnio ok. 2,4 kandydata (2,0-2,8)', mix.reduce((x, y) => x + y, 0) / mix.length, 2.0, 2.8]);
console.log('\nCele kalibracji:');
for (const [label, v, lo, hi] of T) console.log(`  ${v >= lo && v <= hi ? 'OK ' : 'POZA'} ${label}: ${label.includes('średnio') ? f2(v) : pct(v)}`);

/** Sezon w grze: bot gracza (3 misje: lipiec, październik, styczeń), misje i zakupy klubów AI, koszty, wydmuszki. */
async function seasonRun(clubId, seed) {
  const pct = (x) => `${(100 * x).toFixed(1)} %`;
  const { generateWorld, squadOf } = await import('../src/world/worldGen.js');
  const { createSeason, applyResult, playQuick } = await import('../src/season/season.js');
  const { processDay, addDays } = await import('../src/core/gameLoop.js');
  const { createTactics } = await import('../src/engine/lineup.js');
  const { ensureCareer } = await import('../src/career/careerSystem.js');
  const { runDecision } = await import('../src/core/decisions.js');
  await import('../src/season/dailySystems.js');
  const SO = await import('../src/career/scoutOps.js');
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 }); ensureCareer(g); processDay(g);
  const plan = { '2026-07-01': { weeks: 4, level: 'starter' }, '2026-10-05': { weeks: 2, level: 'starter' }, '2027-01-04': { weeks: 4, level: 'wzmocnienie', free: true } };
  const user = []; const t0 = performance.now();
  while (g.date < '2027-06-30') {
    const p = plan[g.date];
    if (p) {
      const v = SO.scoutingView(g);
      const sc = v.scouts.find((x) => x.status === 'w klubie');
      const fr = v.freeScouts.find((x) => x.missionOk.ok && x.regions[0].level >= 14);
      const who = p.free || !sc ? { freeScoutId: fr?.id } : { scoutId: sc.id };
      const region = p.free || !sc ? fr?.regions[0].key : sc.regions[0].key;
      // Pozycja: najsłabszy najlepszy zawodnik na pozycjach pierwszej jedenastki (gracz łata dziurę w składzie)
      const sq = squadOf(g.world, clubId);
      const pos = ['ŚO', 'BO', 'DP', 'ŚP', 'OP', 'SN', 'NAP'].map((x) => [x, Math.max(0, ...sq.filter((q) => q.pos === x).map((q) => q.ovr))]).sort((a, b) => a[1] - b[1])[user.length % 2][0];
      const c = g.finance.clubs[clubId];
      const order = { ...who, region, pos, ageFrom: 20, ageTo: 29, level: p.level, maxFee: Math.round(Math.min(c.transferBudget, c.balance) * 0.6), maxWage: 0, contract: 'any', weeks: p.weeks };
      const r = SO.startMission(g, order);
      user.push({ date: g.date, ok: r.ok, id: r.missionId, text: r.text, target: SO.missionTarget(g, clubId, pos, p.level).ovr });
    }
    for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === g.clubId || x.away === g.clubId))) { const rng = new Rng('g' + f.id); applyResult(g, f, playQuick(g, f, rng), rng); }
    for (const m of g.inbox.filter((m) => !m.resolved && m.actions?.length && !m.optional)) { m.resolved = true; runDecision(g, m, m.actions[0].id); }
    g.date = addDays(g.date, 1); processDay(g);
  }
  const st = g.scoutOps.stats['2026'];
  console.log(`Sezon 2026/27, ${clubId}, ziarno ${seed} (${Math.round(performance.now() - t0)} ms)`);
  let worth = 0; let n = 0;
  for (const u of user) {
    const m = g.scoutOps.missions.find((x) => x.id === u.id);
    const ids = m?.result?.candidates ?? [];
    const pl = ids.map((id) => g.world.players[id]).filter(Boolean);
    const good = pl.filter((p) => p.ovr >= u.target - 0.3).length;
    if (good) worth++; n += ids.length;
    console.log(`  misja ${u.date}: ${u.ok ? '' : `odmowa: ${u.text}`}${m ? `${m.region} ${m.pos} ${m.weeks} tyg., koszt ${m.cost} zł, s ${m.calc.s}, D ${m.calc.D}, lambda ${m.calc.lambda}: ${ids.length} kandydatów (wylosowano ${m.result?.rolled}, zdarzenia ${m.events.filter((e) => !e.quiet).map((e) => e.kind).join(' ')}), wartych oferty (ovr >= cel ${u.target.toFixed(1)} - 0,3): ${good}` : ''}`);
  }
  const ok = user.filter((u) => u.ok).length;
  console.log(`  gracz: misje ${st.user.missions}, kandydaci ${st.user.cands} (średnio ${(n / Math.max(1, ok)).toFixed(2)}), puste ${st.user.empty}, misje z kandydatem wartym oferty ${pct(worth / Math.max(1, ok))}, koszty wyjazdów ${st.user.trips} zł, prowizje ${st.user.commissions} zł`);
  console.log(`  kluby AI: misje ${st.ai.missions}, kandydaci ${st.ai.cands}, puste ${st.ai.empty}, podpisani przez zlecających ${st.ai.signed}, wydmuszki ${pct(st.ai.busts / Math.max(1, st.ai.cands))}`);
  console.log(`  wydmuszki gracza ${pct(st.user.busts / Math.max(1, st.user.cands))}; lista wolnych skautów ${g.scoutOps.pool.length}`);
  const scoutCost = Object.values(g.finance.clubs[clubId].ledger).reduce((x, m) => x + (m.out.scouts ?? 0), 0);
  console.log(`  finanse gracza (kategoria Skauci): ${scoutCost} zł`);
}
