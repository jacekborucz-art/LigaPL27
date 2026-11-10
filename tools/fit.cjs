const { run } = require('./engine.cjs');
const N = 16000;
const pois = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
function outcome(lh, la, rho) {
  let hw = 0, d = 0, aw = 0;
  for (let i = 0; i < 11; i++) for (let j = 0; j < 11; j++) {
    let p = pois(lh, i) * pois(la, j);
    if (i === 0 && j === 0) p *= 1 - lh * la * rho; else if (i === 0 && j === 1) p *= 1 + lh * rho; else if (i === 1 && j === 0) p *= 1 + la * rho; else if (i === 1 && j === 1) p *= 1 - rho;
    if (i > j) hw += p; else if (i === j) d += p; else aw += p;
  }
  return [hw, d, aw].map(x => +x.toFixed(3));
}
console.log('league', JSON.stringify(run(N * 2, 11.5, 11.5, 0.6)));
const rows = [];
for (const d of [-4, -2, -1, 0, 1, 2, 4]) {
  const s = run(N, 11.5 + Math.max(0, d), 11.5 + Math.max(0, -d), 0);
  rows.push({ d, hg: s.hg, ag: s.ag, hw: s.hw, dr: s.d, aw: s.aw });
}
const base = rows.find(x => x.d === 0);
for (const x of rows) {
  const bH = x.d ? Math.log(x.hg / base.hg) / x.d : 0, bA = x.d ? -Math.log(x.ag / base.ag) / x.d : 0;
  const lh = base.hg * Math.exp(0.21 * x.d), la = base.ag * Math.exp(-0.21 * x.d);
  console.log(JSON.stringify(x), 'betaH', bH.toFixed(3), 'betaA', bA.toFixed(3), 'pois', outcome(lh, la, 0), 'DC rho-0.10', outcome(lh, la, -0.10));
}
