// Pomiar sprawiedliwości licytacji (docs/negocjacje.md, rozdz. 15; docs/dyrektor-sportowy.md): klub AI z dyrektorem
// sportowym o danych atrybutach kontra „gracz-autopilot” z tymi samymi warunkami (ten sam klub, zawodnik, budżet
// i progi zarządu, różni je tylko sposób rozmów). Obie strony negocjują przez aiNegotiate, składają propozycje
// w kolejności z wagą sieci kontaktów (SIE, exp(0,04 (SIE - 10)), przy równych 50 %), wcześniejsza może raz poprawić
// w ciemno (blindRaise), potem zawodnik decyduje jak w proposals.js (weighProposals, acceptChance, „chce zmian”).
// Wynik: odsetek wygranych AI wg przedziałów atrybutu i średnia przepłata (pensja / żądanie - 1).
// Tabele: Negocjacje (NEG), Zarządzanie kadrą (KAD: premia za podpis i prowizja), Sieć kontaktów (SIE: kolejność),
// wszystkie atrybuty razem (NEG = KAD = SIE = X) wobec przeciętnego dyrektora (10), Znajomość rynku (RYN: strata
// wyboru kupującego przy błędzie wyceny sprzedającego i kupującego, w OVR, oraz cena wobec ceny bez błędu).
// Autopilot A: przeciętny dyrektor (wszystko 10, z poprawką w ciemno). Autopilot B: dawne AI (0,97, +10 %, bez poprawki).
// Użycie: node tools/negocjacje-fair.mjs [liczba prób na ziarno] [ziarna, np. 5,7,9] [skala dźwigni, domyślnie NEG.scale]
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { Rng } from '../src/core/rng.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { aiNegotiate } from '../src/career/negotiation.js';
import { negLevers, NEG } from '../src/career/clubNegotiation.js';
import { DIR } from '../src/career/director.js';
import { directorOf } from '../src/career/staffMarket.js';
import { blindRaise, weighProposals, acceptChance, THINK } from '../src/career/proposals.js';
import { boardCaps } from '../src/career/boardRequests.js';
import { wageRoom } from '../src/career/finance.js';
import { playerWillingness } from '../src/career/transfers.js';
import { effectiveAsk } from '../src/career/mindset.js';
import { payLevel } from '../src/data/finanse_klubow.js';
import { clubReputation } from '../src/career/reputation.js';
import { marketValue } from '../src/world/playerGen.js';
import { applySeasonState } from '../src/season/rollover.js';
import '../src/season/dailySystems.js';

const trials = Number(process.argv[2] ?? 3000);
const seeds = String(process.argv[3] ?? '5,7,9').split(',').map(Number);
if (process.argv[4]) NEG.scale = Number(process.argv[4]); // próba innej skali dźwigni (kalibracja)
const BUCKETS = [[1, 5], [6, 8], [9, 11], [12, 15], [16, 20]];
const clone = (p) => ({ ...p, relations: JSON.parse(JSON.stringify(p.relations ?? {})) });
const kadMul = (k) => 1 - DIR.kad.fee * (k - 10) / 10;
const sieW = (s) => Math.exp(DIR.sie.w * (s - 10));

function newGame(seed) {
  applySeasonState({});
  const g = { seed, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: 'widzew' }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 }); ensureCareer(g); processDay(g);
  g.date = '2026-07-15';
  return g;
}

/** Atrybut Negocjacje dyrektora klubu na czas jednej licytacji (clubNegotiation czyta dyrektora). */
function setNeg(g, clubId, n) {
  const d = directorOf(g, clubId);
  const old = d.a.NEG; d.a.NEG = n; d.adapt = null;
  return old;
}

/** Jedna strona: rozmowy i propozycja. a = { NEG, KAD, SIE } albo null (dawne stałe, autopilot B). */
function side(g, p, c, a, tag, i) {
  const caps = boardCaps(g, c.id, p, 'sign');
  const room = wageRoom(g.finance, g.world, c.id);
  const budget = { wage: Math.min(Math.max(500, room), caps.wage), maxYears: caps.years, total: caps.total };
  const pl = clone(p);
  if (!pl.contract) pl.contract = { wage: effectiveAsk(p, c.tier, payLevel(c)), until: g.date };
  const r = aiNegotiate({ kind: 'sign', player: pl, club: c, fromClub: p.clubId ? clubById(p.clubId) : null, date: g.date, rng: new Rng(`fair:${g.seed}:${i}:${tag}`), budget, neg: a ? a.NEG : null, feeMul: a ? kadMul(a.KAD) : 1 });
  if (r.result !== 'signed') return null;
  return { a, demand: r.demand, x: { pid: p.id, to: c.id, user: false, status: 'open', contract: r.contract, date: g.date, maxWage: budget.wage, maxTotal: caps.total, demand: a == null ? null : r.demand } };
}

function contest(g, p, c, aAi, aAuto, i, rng) {
  const a = side(g, p, c, aAi, 'ai', i);
  const b = side(g, p, c, aAuto, 'auto', i);
  if (!a || !b) return null;
  // Pierwszeństwo: szansa w / (w_a + w_b), wagi z sieci kontaktów (zero-sum, jak kolejność klubów w marketWeek)
  const wa = sieW(aAi.SIE); const wb = sieW(aAuto?.SIE ?? 10);
  const aiFirst = rng.chance(wa / (wa + wb));
  a.x.id = aiFirst ? 'n1-x' : 'n2-x'; b.x.id = aiFirst ? 'n2-x' : 'n1-x';
  const firstSide = aiFirst ? a : b;
  // Poprawka w ciemno klubu z wcześniejszą propozycją (atrybut tej strony; autopilot B bez poprawki)
  if (firstSide.a != null) {
    setNeg(g, c.id, firstSide.a.NEG);
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
      const wage = Math.round(((x.contract?.wage ?? 0) * negLevers(s.a?.NEG ?? null).raise) / 100) * 100;
      if (wage <= x.maxWage) { x.contract = { ...x.contract, wage }; ans = 'yes'; } else ans = 'no';
    }
    if (ans === 'yes') { winner = s; break; }
  }
  return { a, b, winner };
}

/** mode: 'NEG' | 'KAD' | 'SIE' | 'ALL' (atrybut AI = wylosowane X, reszta 10). */
function run(mode, autoA) {
  const res = BUCKETS.map(() => ({ n: 0, ai: 0, payAi: 0, nAi: 0, payAuto: 0, nAuto: 0, none: 0 }));
  for (const seed of seeds) {
    const g = newGame(seed);
    const rng = new Rng(`fair-proby:${seed}:${mode}`);
    const clubs = CLUBS_PL.filter((c) => g.world.clubs[c.id] && c.id !== g.clubId && c.tier <= 3 && directorOf(g, c.id));
    const pool = [...g.market.free.map((id) => g.world.players[id]).filter(Boolean),
      ...CLUBS_PL.filter((c) => c.tier <= 4 && g.world.clubs[c.id]).flatMap((c) => squadOf(g.world, c.id))];
    let done = 0;
    for (let i = 0; done < trials && i < trials * 20; i++) {
      const c = rng.pick(clubs);
      const p = rng.pick(pool);
      if (!p || p.clubId === c.id || (p.rep ?? 30) > clubReputation(c) + 15 || Math.abs((p.ovr ?? 10) - c.L) > 1.5) continue;
      if (playerWillingness(g, p, c.id).verdict === 'odmowa') continue;
      const x = rng.int(1, 20);
      const aAi = { NEG: 10, KAD: 10, SIE: 10 };
      if (mode === 'ALL') Object.assign(aAi, { NEG: x, KAD: x, SIE: x }); else aAi[mode] = x;
      const keep = setNeg(g, c.id, 10);
      const r = contest(g, p, c, aAi, autoA, i, rng);
      setNeg(g, c.id, keep);
      if (!r) continue;
      done++;
      const B = res[BUCKETS.findIndex(([lo, hi]) => x >= lo && x <= hi)];
      if (!r.winner) { B.none++; continue; }
      B.n++;
      if (r.winner === r.a) { B.ai++; B.payAi += r.a.x.contract.wage / r.a.demand - 1; B.nAi++; } else { B.payAuto += r.b.x.contract.wage / r.b.demand - 1; B.nAuto++; }
    }
  }
  return res;
}

/**
 * Znajomość rynku: kupujący wybiera 1 z 5 kandydatów (wynik = OVR - cena / 5 mln zł), cena wywoławcza z błędem
 * sprzedającego (RYN 10), kupujący widzi cenę z własnym błędem (RYN kupującego). Strata wyboru: o ile prawdziwy wynik
 * wybranego jest gorszy od najlepszego (OVR); cena: cena wybranego / cena bez błędu - 1.
 */
function rynTable() {
  const sig = (r) => DIR.ryn.s0 - DIR.ryn.s1 * (r - 1) / 19;
  const mul = (rng, s) => { const e = rng.gauss(0, s); return Math.exp(e - (s * s) / 2); };
  const out = [];
  for (const r of [1, 5, 10, 15, 20]) {
    let loss = 0; let price = 0; let n = 0;
    for (const seed of seeds) {
      const g = newGame(seed);
      const rng = new Rng(`fair-ryn:${seed}:${r}`);
      const pool = CLUBS_PL.filter((c) => c.tier >= 2 && c.tier <= 3 && g.world.clubs[c.id]).flatMap((c) => squadOf(g.world, c.id).map((p) => ({ p, fair: marketValue(p, { tier: c.tier, date: g.date }) * 1.45 })));
      for (let i = 0; i < trials; i++) {
        const cands = Array.from({ length: 5 }, () => rng.pick(pool)).map(({ p, fair }) => {
          const fee = fair * mul(rng, sig(10));
          return { p, fair, fee, seen: fee * mul(rng, sig(r)) };
        });
        const trueS = (x) => x.p.ovr - x.fee / 5e6;
        const best = cands.reduce((m, x) => (trueS(x) > trueS(m) ? x : m));
        const pick = cands.reduce((m, x) => (x.p.ovr - x.seen / 5e6 > m.p.ovr - m.seen / 5e6 ? x : m));
        loss += trueS(best) - trueS(pick); price += pick.fee / pick.fair - 1; n++;
      }
    }
    out.push({ r, loss: loss / n, price: price / n });
  }
  return out;
}

const pct = (x) => `${(100 * x).toFixed(1)} %`;
function print(label, res) {
  console.log(`\n${label}`);
  console.log('X AI    | licytacje | wygrane AI | przepłata AI | przepłata autopilota | różnica');
  const all = { n: 0, ai: 0 };
  for (const [k, [lo, hi]] of BUCKETS.entries()) {
    const B = res[k];
    all.n += B.n; all.ai += B.ai;
    const pa = B.nAi ? B.payAi / B.nAi : 0; const pb = B.nAuto ? B.payAuto / B.nAuto : 0;
    console.log(`${String(lo).padStart(2)}-${String(hi).padEnd(2)}   | ${String(B.n).padStart(9)} | ${pct(B.ai / Math.max(1, B.n)).padStart(10)} | ${pct(pa).padStart(12)} | ${pct(pb).padStart(20)} | ${((pa - pb) * 100).toFixed(2)} pp`);
  }
  console.log(`razem   | ${String(all.n).padStart(9)} | ${pct(all.ai / Math.max(1, all.n)).padStart(10)}`);
}

const AUTO = { NEG: 10, KAD: 10, SIE: 10 };
const only = process.env.FAIR_ONLY ? process.env.FAIR_ONLY.split(',') : ['NEG', 'KAD', 'SIE', 'ALL', 'B', 'RYN'];
const t0 = performance.now();
for (const mode of ['NEG', 'KAD', 'SIE', 'ALL']) {
  if (!only.includes(mode)) continue;
  print(`${mode === 'ALL' ? 'Wszystkie atrybuty (NEG = KAD = SIE = X)' : `Atrybut ${mode}`} AI wobec przeciętnego dyrektora (10), ${trials} prób na ziarno, ziarna ${seeds.join(', ')}`, run(mode, AUTO));
}
if (only.includes('B')) print('Negocjacje AI wobec dawnego AI (0,97, +10 %, bez poprawki)', run('NEG', null));
if (only.includes('RYN')) {
  console.log('\nZnajomość rynku kupującego (sprzedający RYN 10): strata wyboru w OVR i cena wybranego wobec ceny bez błędu');
  console.log('RYN | strata wyboru | cena wobec ceny bez błędu');
  for (const x of rynTable()) console.log(`${String(x.r).padStart(3)} | ${x.loss.toFixed(4).padStart(13)} | ${pct(x.price).padStart(10)}`);
}
console.log(`\n(${Math.round(performance.now() - t0)} ms)`);
