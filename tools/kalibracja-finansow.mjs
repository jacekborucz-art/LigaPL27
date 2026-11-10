// Kalibracja płacowości klubów (pole pay w src/data/finanse_klubow.js): node tools/kalibracja-finansow.mjs [liczba ziaren]
// Dla każdego klubu liczy rachunek płac kadry przy płacowości 1 (pensje rynkowe z marketWage) na kilku światach
// i proponuje pay = docelowe płace zawodników / płace rynkowe. Docelowe płace zawodników: 85 % płac I drużyny
// (zawodnicy i sztab, Grant Thornton), bo sztab jest w kosztach klubu (finance.js, FIN.STAFF). Raport pokazuje też
// obecne dopasowanie (rachunek płac z aktualnym pay względem celu) i średnie pensje miesięczne w ligach.
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { FINANSE_KLUBOW } from '../src/data/finanse_klubow.js';
import { marketWage } from '../src/career/negotiation.js';
import { FIN } from '../src/career/finance.js';

const seeds = Number(process.argv[2] ?? 4);
const acc = {};
const all = { 1: [], 2: [], 3: [] };
for (let s = 1; s <= seeds; s++) {
  const w = generateWorld(1000 + s);
  for (const c of CLUBS_PL) {
    const sq = squadOf(w, c.id);
    const market = sq.reduce((x, p) => x + marketWage(p.ovr, c.tier, p.nat !== 'POL' && c.tier === 1, 1), 0);
    const actual = sq.reduce((x, p) => x + p.contract.wage, 0);
    const a = (acc[c.id] ??= { market: 0, actual: 0, top: 0 });
    a.market += market / seeds; a.actual += actual / seeds; a.top += Math.max(...sq.map((p) => p.contract.wage)) / seeds;
    for (const p of sq) all[c.tier].push(p.contract.wage);
  }
}
const fmt = (x) => `${(x / 1e6).toFixed(1)}`;
console.log('klub\ttier\tcel(mln/rok)\tobecnie(mln/rok)\tdopas.\tpay\tsugerowany pay\ttop pensja/mies.');
for (const c of CLUBS_PL) {
  const d = FINANSE_KLUBOW[c.id]; const a = acc[c.id];
  const target = d.place * 1e6 * FIN.PLAYERS_SHARE / 52;
  console.log([c.id.padEnd(18), c.tier, fmt(target * 52), fmt(a.actual * 52), (a.actual / target).toFixed(2), d.pay, (Math.round(target / a.market * 20) / 20).toFixed(2), Math.round(a.top * 52 / 12 / 1000) + ' tys.'].join('\t'));
}
for (const t of [1, 2, 3]) {
  const xs = all[t].sort((a, b) => a - b);
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  const m = (x) => Math.round(x * 52 / 12 / 100) * 100;
  console.log(`liga ${t}: średnia pensja ${m(avg)} zł/mies., mediana ${m(xs[xs.length >> 1])}, 90. centyl ${m(xs[Math.floor(xs.length * 0.9)])}, max ${m(xs.at(-1))}`);
}
