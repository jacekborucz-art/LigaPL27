// Pomiar sprawiedliwości licytacji (docs/negocjacje.md, rozdz. 15): klub AI z atrybutem Negocjacje N kontra
// „gracz-autopilot” z tymi samymi warunkami (ten sam klub, zawodnik, budżet i progi zarządu, różni je tylko sposób
// rozmów). Obie strony negocjują przez aiNegotiate, składają propozycje w losowej kolejności (pierwszeństwo oferty),
// wcześniejsza może raz poprawić w ciemno (blindRaise), potem zawodnik decyduje jak w proposals.js (weighProposals,
// acceptChance, „chce zmian”). Wynik: odsetek wygranych AI wg przedziałów N i średnia przepłata (pensja / żądanie - 1).
// Autopilot A: przeciętny negocjator (N = 10, z poprawką w ciemno). Autopilot B: dawne AI (0,97, +10 %, bez poprawki).
// Użycie: node tools/negocjacje-fair.mjs [liczba prób na ziarno] [ziarna, np. 5,7,9] [skala dźwigni, domyślnie NEG.scale]
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { Rng } from '../src/core/rng.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { aiNegotiate } from '../src/career/negotiation.js';
import { clubNegotiation, negLevers, NEG } from '../src/career/clubNegotiation.js';
import { blindRaise, weighProposals, acceptChance, THINK } from '../src/career/proposals.js';
import { boardCaps } from '../src/career/boardRequests.js';
import { wageRoom } from '../src/career/finance.js';
import { playerWillingness } from '../src/career/transfers.js';
import { effectiveAsk } from '../src/career/mindset.js';
import { payLevel } from '../src/data/finanse_klubow.js';
import { clubReputation } from '../src/career/reputation.js';
import { applySeasonState } from '../src/season/rollover.js';
import '../src/season/dailySystems.js';

const trials = Number(process.argv[2] ?? 3000);
const seeds = String(process.argv[3] ?? '5,7,9').split(',').map(Number);
if (process.argv[4]) NEG.scale = Number(process.argv[4]); // próba innej skali dźwigni (kalibracja)
const BUCKETS = [[1, 5], [6, 8], [9, 11], [12, 15], [16, 20]];
const clone = (p) => ({ ...p, relations: JSON.parse(JSON.stringify(p.relations ?? {})) });

function newGame(seed) {
  applySeasonState({});
  const g = { seed, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: 'widzew' }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 }); ensureCareer(g); processDay(g);
  g.date = '2026-07-15';
  return g;
}

/** Jedna strona: rozmowy i propozycja. neg = null: dawne stałe (autopilot B). */
function side(g, p, c, neg, tag, i) {
  const caps = boardCaps(g, c.id, p, 'sign');
  const room = wageRoom(g.finance, g.world, c.id);
  const budget = { wage: Math.min(Math.max(500, room), caps.wage), maxYears: caps.years, total: caps.total };
  const pl = clone(p);
  if (!pl.contract) pl.contract = { wage: effectiveAsk(p, c.tier, payLevel(c)), until: g.date };
  const r = aiNegotiate({ kind: 'sign', player: pl, club: c, fromClub: p.clubId ? clubById(p.clubId) : null, date: g.date, rng: new Rng(`fair:${g.seed}:${i}:${tag}`), budget, neg });
  if (r.result !== 'signed') return null;
  return { neg, demand: r.demand, x: { pid: p.id, to: c.id, user: false, status: 'open', contract: r.contract, date: g.date, maxWage: budget.wage, maxTotal: caps.total, demand: neg == null ? null : r.demand } };
}

function contest(g, p, c, nAi, autoNeg, i, rng) {
  const a = side(g, p, c, nAi, 'ai', i);
  const b = side(g, p, c, autoNeg, 'auto', i);
  if (!a || !b) return null;
  const aiFirst = rng.chance(0.5);
  a.x.id = aiFirst ? 'n1-x' : 'n2-x'; b.x.id = aiFirst ? 'n2-x' : 'n1-x';
  const firstSide = aiFirst ? a : b;
  // Poprawka w ciemno klubu z wcześniejszą propozycją (atrybut tej strony; autopilot B bez poprawki)
  if (firstSide.neg != null) {
    g.clubNeg[c.id].n = firstSide.neg;
    blindRaise(g, firstSide.x, `2026-07-${String(10 + (i % 18)).padStart(2, '0')}`);
  }
  const prng = new Rng(`fair-decyzja:${g.seed}:${i}`);
  const { ref, scored } = weighProposals(g, p, [a.x, b.x], prng);
  let winner = null;
  for (const { x, u } of scored) {
    const s = x === a.x ? a : b;
    const pYes = acceptChance(u, ref);
    const r = prng.next();
    let ans = r < pYes ? 'yes' : r < pYes + (1 - pYes) * THINK.changes ? 'changes' : 'no';
    if (ans === 'changes') {
      const wage = Math.round(((x.contract?.wage ?? 0) * negLevers(s.neg).raise) / 100) * 100;
      if (wage <= x.maxWage) { x.contract = { ...x.contract, wage }; ans = 'yes'; } else ans = 'no';
    }
    if (ans === 'yes') { winner = s; break; }
  }
  return { a, b, winner };
}

function run(autoNeg) {
  const res = BUCKETS.map(() => ({ n: 0, ai: 0, payAi: 0, nAi: 0, payAuto: 0, nAuto: 0, none: 0 }));
  for (const seed of seeds) {
    const g = newGame(seed);
    const rng = new Rng(`fair-proby:${seed}`);
    const clubs = CLUBS_PL.filter((c) => g.world.clubs[c.id] && c.id !== g.clubId && c.tier <= 3);
    const pool = [...g.market.free.map((id) => g.world.players[id]).filter(Boolean),
      ...CLUBS_PL.filter((c) => c.tier <= 4 && g.world.clubs[c.id]).flatMap((c) => squadOf(g.world, c.id))];
    for (const c of clubs) clubNegotiation(g, c.id);
    let done = 0;
    for (let i = 0; done < trials && i < trials * 20; i++) {
      const c = rng.pick(clubs);
      const p = rng.pick(pool);
      if (!p || p.clubId === c.id || (p.rep ?? 30) > clubReputation(c) + 15 || Math.abs((p.ovr ?? 10) - c.L) > 1.5) continue;
      if (playerWillingness(g, p, c.id).verdict === 'odmowa') continue;
      const nAi = rng.int(1, 20);
      const keep = g.clubNeg[c.id].n;
      const r = contest(g, p, c, nAi, autoNeg, i, rng);
      g.clubNeg[c.id].n = keep;
      if (!r) continue;
      done++;
      const B = res[BUCKETS.findIndex(([lo, hi]) => nAi >= lo && nAi <= hi)];
      if (!r.winner) { B.none++; continue; }
      B.n++;
      if (r.winner === r.a) { B.ai++; B.payAi += r.a.x.contract.wage / r.a.demand - 1; B.nAi++; } else { B.payAuto += r.b.x.contract.wage / r.b.demand - 1; B.nAuto++; }
    }
  }
  return res;
}

const pct = (x) => `${(100 * x).toFixed(1)} %`;
for (const [label, autoNeg] of [['Autopilot A (przeciętny negocjator, N = 10)', 10], ['Autopilot B (dawne AI: 0,97, +10 %, bez poprawki)', null]]) {
  const t0 = performance.now();
  const res = run(autoNeg);
  console.log(`\n${label}, ${trials} prób na ziarno, ziarna ${seeds.join(', ')} (${Math.round(performance.now() - t0)} ms)`);
  console.log('N AI    | licytacje | wygrane AI | przepłata AI | przepłata autopilota | różnica');
  let all = { n: 0, ai: 0 };
  for (const [k, [lo, hi]] of BUCKETS.entries()) {
    const B = res[k];
    all.n += B.n; all.ai += B.ai;
    const pa = B.nAi ? B.payAi / B.nAi : 0; const pb = B.nAuto ? B.payAuto / B.nAuto : 0;
    console.log(`${String(lo).padStart(2)}-${String(hi).padEnd(2)}   | ${String(B.n).padStart(9)} | ${pct(B.ai / Math.max(1, B.n)).padStart(10)} | ${pct(pa).padStart(12)} | ${pct(pb).padStart(20)} | ${((pa - pb) * 100).toFixed(2)} pp`);
  }
  console.log(`razem   | ${String(all.n).padStart(9)} | ${pct(all.ai / Math.max(1, all.n)).padStart(10)}`);
}
