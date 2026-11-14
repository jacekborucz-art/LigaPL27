// Calibration sim for minute-based engine (simplified team model)
const C = {
  ticksHalf: 45, stoppage1: [1, 3], stoppage2: [3, 6],
  posK: 0.20, posHome: 0.02,
  pAction: 0.37, kCreate: 0.05,
  typeW: { POZ: 0.50, SKR: 0.22, KON: 0.13, DYS: 0.15 },
  breakBase: { POZ: -0.15, SKR: -0.25, KON: 0.35, DYS: 1.6 }, kBreak: 0.15,
  failCorner: { POZ: 0.34, SKR: 0.50, KON: 0.20, DYS: 0.40 },
  failOffside: { POZ: 0.11, SKR: 0.05, KON: 0.20, DYS: 0.0 },
  penPerAction: 0.0082,
  xg: { POZ: [[0.62, 0.03, 0.08], [0.28, 0.09, 0.22], [0.10, 0.25, 0.55]],
        SKR: [[0.60, 0.03, 0.07], [0.32, 0.08, 0.18], [0.08, 0.22, 0.45]],
        KON: [[0.40, 0.04, 0.10], [0.38, 0.10, 0.25], [0.22, 0.25, 0.60]],
        DYS: [[0.85, 0.01, 0.04], [0.15, 0.04, 0.08]] },
  cornerShot: 0.30, cornerXg: [0.04, 0.14],
  foulTick: 0.27, foulDefShare: 0.78, dangerFK: 0.14, fkDirect: 0.45, fkXgD: [0.04, 0.09], fkCrossShot: 0.30, fkXgC: [0.05, 0.15],
  yellowPerFoul: 0.14, redPerFoul: 0.003, otherYellowTick: 0.0032,
  homeCreate: 1.15, awayCreate: 0.90, homeCardMul: 0.88, awayCardMul: 1.15,
  ogPerMatch: 0.08, offsideTick: 0.032, saveCorner: 0.30, penConv: 0.78,
  fatigue: 0.0018, // per minute zone erosion fraction scaled by (20-WYT)/10
  kFin: 0.05,
};
const r = Math.random;
const sig = x => 1 / (1 + Math.exp(-x));
const uni = (a, b) => a + (b - a) * r();
function pickW(obj) { let s = 0; for (const k in obj) s += obj[k]; let x = r() * s; for (const k in obj) { x -= obj[k]; if (x <= 0) return k; } return Object.keys(obj)[0]; }
function drawXg(table) { let x = r(); for (const [p, a, b] of table) { if ((x -= p) <= 0) return uni(a, b); } const l = table[table.length - 1]; return uni(l[1], l[2]); }

const ROLES = ['BR','ŚO','ŚO','BO','BO','DP','ŚP','ŚP','BP','BP','NAP'];
const SHOOTW = { BR: 0, 'ŚO': 0.5, BO: 0.5, DP: 0.6, 'ŚP': 1.2, BP: 1.6, OP: 1.8, NAP: 3.2 };
const FINOFF = { BR: -6, 'ŚO': -3, BO: -2.5, DP: -1.5, 'ŚP': -0.5, BP: 0.5, OP: 1, NAP: 2.5 };
const FOULW = { BR: 0.1, 'ŚO': 1.4, BO: 1.2, DP: 1.5, 'ŚP': 1.0, BP: 0.8, OP: 0.7, NAP: 0.9 };

function team(L, sd = 0) {
  const q = L + (sd ? (r() + r() + r() - 1.5) * sd * 2 : 0);
  return { L: q, DEF: q, MID: q, ATT: q, GK: q + 1, players: ROLES.map(role => ({ role, yc: 0, off: false, fin: q + FINOFF[role] })) };
}

function simMatch(H, A, st) {
  const T = [H, A]; T.forEach(t => t.players.forEach(p => { p.yc = 0; p.off = false; }));
  const g = [0, 0];
  const s = { shots: 0, sot: 0, corners: 0, fouls: 0, yel: 0, red: 0, pens: 0, offs: 0, xg: 0, g2h: 0 };
  const total = 90 + Math.round(uni(...C.stoppage1)) + Math.round(uni(...C.stoppage2));
  for (let m = 1; m <= total; m++) {
    const half2 = m > 45 + 2;
    const fat = t => 1 - C.fatigue * Math.max(0, m - 30) * 0.5; // simple
    const men = t => t.players.filter(p => !p.off).length;
    const eff = (t, z) => t[z] * fat(t) - (11 - men(t)) * 0.9;
    const pH = Math.min(0.75, Math.max(0.25, sig(C.posK * (eff(H, 'MID') - eff(A, 'MID')) + C.posHome)));
    const ai = r() < pH ? 0 : 1, at = T[ai], df = T[1 - ai];
    // fouls
    if (r() < C.foulTick) {
      const fi = r() < C.foulDefShare ? 1 - ai : ai, ft = T[fi];
      s.fouls++;
      const cand = {}; ft.players.forEach((p, i) => { if (!p.off) cand[i] = FOULW[p.role] * (p.yc ? 0.4 : 1); });
      const p = ft.players[+pickW(cand)];
      const cm = fi === 0 ? C.homeCardMul : C.awayCardMul;
      if (r() < C.redPerFoul * cm) { p.off = true; s.red++; }
      else if (r() < C.yellowPerFoul * cm * (p.yc ? 0.7 : 1)) { s.yel++; if (p.yc) { p.off = true; s.red++; } else p.yc = 1; }
      if (fi !== ai && r() < C.dangerFK) setPiece(at, df, ai, 'FK');
    }
    if (r() < C.otherYellowTick) s.yel++;
    if (r() < C.offsideTick) s.offs++;
    // action
    const cMul = ai === 0 ? C.homeCreate : C.awayCreate;
    let gs = 1, dShift = 0;
    if (m > 65 && g[0] !== g[1]) { const leading = g[ai] > g[1 - ai]; gs = leading ? 0.85 : 1.12; dShift = leading ? -0.3 : 0.4; }
    const A_ = 0.55 * eff(at, 'ATT') + 0.45 * eff(at, 'MID'), D_ = 0.65 * eff(df, 'DEF') + 0.35 * eff(df, 'MID') - dShift;
    if (r() < C.pAction * gs * cMul * (1 + 0.004 * Math.max(0, m - 55)) * Math.exp(C.kCreate * (A_ - D_))) {
      const type = pickW(C.typeW);
      if (r() < C.penPerAction) { s.pens++; s.shots++; const xg = C.penConv; s.xg += xg; if (r() < xg) { goal(ai); s.sot++; } else if (r() < 0.6) s.sot++; continue; }
      if (r() < sig(C.breakBase[type] + C.kBreak * (A_ - D_))) shot(at, df, ai, drawXg(C.xg[type]));
      else {
        if (r() < C.failCorner[type]) corner(at, df, ai);
        else if (r() < C.failOffside[type]) s.offs++;
      }
    }
    if (r() < C.ogPerMatch / 95) goal(ai);
    function goal(i) { g[i]++; if (half2) s.g2h++; }
    function corner(at, df, ai) { s.corners++; if (r() < C.cornerShot) shot(at, df, ai, uni(...C.cornerXg), true); }
    function setPiece(at, df, ai) { if (r() < C.fkDirect) shot(at, df, ai, uni(...C.fkXgD)); else if (r() < C.fkCrossShot) shot(at, df, ai, uni(...C.fkXgC), true); }
    function shot(at, df, ai, xg, header) {
      s.shots++; s.xg += xg;
      const w = {}; at.players.forEach((p, i) => { if (!p.off) w[i] = SHOOTW[p.role] * (header && (p.role === 'ŚO') ? 3 : 1); });
      const p = at.players[+pickW(w)];
      const pg = Math.min(0.95, xg * Math.exp(C.kFin * (p.fin - df.GK)));
      if (r() < pg) { s.sot++; goal(ai); return; }
      const x = r();
      if (x < 0.28) { s.sot++; if (r() < C.saveCorner) corner(at, df, ai); } else if (x < 0.55 && !header) { if (r() < 0.33) corner(at, df, ai); }
    }
  }
  s.hg = g[0]; s.ag = g[1];
  return s;
}

function run(N, levelH, levelA, sd) {
  const agg = { shots: 0, sot: 0, corners: 0, fouls: 0, yel: 0, red: 0, pens: 0, offs: 0, xg: 0, g2h: 0, hg: 0, ag: 0, hw: 0, d: 0, aw: 0 };
  const hist = {};
  for (let i = 0; i < N; i++) {
    const H = team(levelH, sd), A = team(levelA, sd);
    const s = simMatch(H, A);
    for (const k in s) agg[k] += s[k];
    if (s.hg > s.ag) agg.hw++; else if (s.hg === s.ag) agg.d++; else agg.aw++;
    const tg = s.hg + s.ag; hist[tg] = (hist[tg] || 0) + 1;
  }
  const out = {}; for (const k in agg) out[k] = +(agg[k] / N).toFixed(3);
  out.goals = +(out.hg + out.ag).toFixed(3);
  out.goalsPerShot = +(out.goals / out.shots).toFixed(3);
  out.share2h = +(out.g2h / out.goals).toFixed(3);
  out.over25 = +(Object.entries(hist).filter(([k]) => +k >= 3).reduce((a, [, v]) => a + v, 0) / N).toFixed(3);
  return out;
}
module.exports = { run, simMatch, team, C };
if (require.main === module) {
  const N = +process.argv[2] || 20000;
  console.log('league sd0.6 L11.5', run(N, 11.5, 11.5, 0.6));
  console.log('equal', run(N, 11.5, 11.5, 0));
  for (const d of [1, 2, 4]) console.log('home +' + d, JSON.stringify((({hg,ag,hw,d:dr,aw})=>({hg,ag,hw,dr,aw}))(run(N/2, 11.5 + d, 11.5, 0))));
  for (const d of [1, 2, 4]) console.log('away +' + d, JSON.stringify((({hg,ag,hw,d:dr,aw})=>({hg,ag,hw,dr,aw}))(run(N/2, 11.5, 11.5 + d, 0))));
}
