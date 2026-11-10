// Szybka symulacja meczów w tle (bez minut). Lekka, ale oparta na wyliczeniu:
// siła dostępnej jedenastki w strefach, forma, morale, ostrość, świeżość, kontuzje i pauzy,
// miejsce meczu, pewność siebie z tabeli, sędzia. Wynik losujemy z rozkładu Poissona
// o średnich wyliczonych z tych sił (tak jak w prawdziwej piłce: lepszy częściej wygrywa,
// ale nie zawsze). Stałe dopasowane do pełnego silnika: docs/ekspert_futbol.md 6.1 (e).
// Każda statystyka wynika z modelu: strzały z xG, celne z goli i strzałów, posiadanie z różnicy w pomocy.

import { clamp } from '../core/rng.js';
import { teamRating } from './teamStrength.js';

export const QS = {
  BETA: 0.225, MU_H: 1.50, MU_A: 1.19, MU_N: 1.34, RHO: -0.10,
  XG_PER_SHOT: 0.108, // ok. 2,72 gola / 25 strzałów
  ON_TARGET_NON_GOAL: 0.28,
  CORNERS_PER_SHOT: 0.4,
  YELLOW_H: 1.89, YELLOW_A: 2.43, RED: 0.095, INJ: 0.45, // razem ok. 4,3 żółtej (Ekstraklasa)
};

/** Średnie bramek z sił stref (wzór eksperta). */
export function expectedGoals(H, A, ctx = {}) {
  const atk = (T) => 0.55 * T.ATT + 0.45 * T.MID;
  const def = (T) => 0.65 * T.DEF + 0.35 * T.MID;
  const dH = 0.75 * (atk(H.zones) - def(A.zones)) + 0.15 * (H.zones.MID - A.zones.MID) + 0.10 * (H.zones.FIN - A.zones.GK);
  const dA = 0.75 * (atk(A.zones) - def(H.zones)) + 0.15 * (A.zones.MID - H.zones.MID) + 0.10 * (A.zones.FIN - H.zones.GK);
  const muH = ctx.neutral ? QS.MU_N : QS.MU_H;
  const muA = ctx.neutral ? QS.MU_N : QS.MU_A;
  // Rywal bez prawdziwego bramkarza: każdy celny strzał wpada częściej (positions.js).
  const lH = muH * Math.exp(QS.BETA * dH) * (H.qsMul ?? 1) * A.gkMods.goalMul;
  const lA = muA * Math.exp(QS.BETA * dA) * (A.qsMul ?? 1) * H.gkMods.goalMul;
  return { lH, lA, dH, dA };
}

function poissonPmf(k, l) {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
}

/** Losowanie wyniku z korektą Dixona-Colesa (więcej realistycznych remisów 0:0 i 1:1). */
export function sampleScore(lH, lA, rng, rho = QS.RHO) {
  const tau = (x, y) => {
    if (x === 0 && y === 0) return 1 - lH * lA * rho;
    if (x === 0 && y === 1) return 1 + lH * rho;
    if (x === 1 && y === 0) return 1 + lA * rho;
    if (x === 1 && y === 1) return 1 - rho;
    return 1;
  };
  const cells = [];
  let total = 0;
  for (let x = 0; x <= 10; x++) {
    for (let y = 0; y <= 10; y++) {
      const p = poissonPmf(x, lH) * poissonPmf(y, lA) * tau(x, y);
      cells.push([x, y, p]);
      total += p;
    }
  }
  let r = rng.next() * total;
  for (const [x, y, p] of cells) {
    r -= p;
    if (r <= 0) return [x, y];
  }
  return [0, 0];
}

/** Prawdopodobieństwa 1X2 z tego samego modelu (studio przedmeczowe, oczekiwania zarządu). */
export function outcomeProbs(lH, lA, rho = QS.RHO) {
  let h = 0; let d = 0; let a = 0;
  for (let x = 0; x <= 10; x++) {
    for (let y = 0; y <= 10; y++) {
      let p = poissonPmf(x, lH) * poissonPmf(y, lA);
      if (x === 0 && y === 0) p *= 1 - lH * lA * rho;
      else if (x === 0 && y === 1) p *= 1 + lH * rho;
      else if (x === 1 && y === 0) p *= 1 + lA * rho;
      else if (x === 1 && y === 1) p *= 1 - rho;
      if (x > y) h += p; else if (x === y) d += p; else a += p;
    }
  }
  const s = h + d + a;
  return { home: h / s, draw: d / s, away: a / s };
}

function binomial(n, p, rng) {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng.next() < p) k++;
  return k;
}

const SCORER_W = { ATT: 3, MID: 1.2, DEF: 0.35, GK: 0 };
function pickScorers(team, goals, rng) {
  const out = [];
  for (let i = 0; i < goals; i++) {
    const s = rng.weighted(team.xi, (x) => SCORER_W[x.group] * Math.max(1, x.player.attr?.WYK ?? x.player.ovr));
    out.push(s.player.id);
  }
  return out;
}

/**
 * Jeden mecz w tle.
 * home/away: { squad, qsMul?, tableTerm? }; ctx: { neutral, refStrict (0.7-1.4), aggression [h,a] }
 * Zwraca wynik, statystyki wynikające z modelu i rozbicie sił (do raportu i testów).
 */
export function quickMatch(home, away, ctx, rng) {
  const H = { ...teamRating(home.squad, { tableTerm: home.tableTerm }), qsMul: home.qsMul };
  const A = { ...teamRating(away.squad, { tableTerm: away.tableTerm }), qsMul: away.qsMul };
  const { lH, lA, dH, dA } = expectedGoals(H, A, ctx);
  const [gH, gA] = sampleScore(lH, lA, rng);

  const shotsFor = (l, g) => Math.max(g, rng.poisson(l / QS.XG_PER_SHOT));
  const sH = shotsFor(lH, gH);
  const sA = shotsFor(lA, gA);
  const onH = gH + binomial(sH - gH, QS.ON_TARGET_NON_GOAL, rng);
  const onA = gA + binomial(sA - gA, QS.ON_TARGET_NON_GOAL, rng);
  const possH = Math.round(clamp(100 / (1 + Math.exp(-0.20 * (H.zones.MID - A.zones.MID))) + rng.gauss(0, 2), 25, 75));
  const ref = ctx.refStrict ?? 1;
  const [agH, agA] = ctx.aggression ?? [1, 1];

  return {
    score: [gH, gA],
    xg: [Math.round(lH * 100) / 100, Math.round(lA * 100) / 100],
    shots: [sH, sA],
    onTarget: [onH, onA],
    possession: [possH, 100 - possH],
    corners: [rng.poisson(sH * QS.CORNERS_PER_SHOT), rng.poisson(sA * QS.CORNERS_PER_SHOT)],
    yellow: [rng.poisson(QS.YELLOW_H * ref * agH), rng.poisson(QS.YELLOW_A * ref * agA)],
    red: [rng.poisson(QS.RED * ref ** 1.5 * agH), rng.poisson(QS.RED * ref ** 1.5 * agA)],
    scorers: [pickScorers(H, gH, rng), pickScorers(A, gA, rng)],
    injuries: [rng.poisson(QS.INJ), rng.poisson(QS.INJ)],
    model: { lH, lA, dH, dA, home: H.breakdown, away: A.breakdown, missing: [H.missing.length, A.missing.length] },
    xi: [H.xi.map((x) => x.player.id), A.xi.map((x) => x.player.id)],
    _teams: [H, A],
  };
}

/**
 * Mecz pucharowy w tle. mode: 'single' (remis -> dogrywka -> karne), 'penaltiesOnly' (remis -> karne).
 * Dogrywka: 30 minut, średnie goli 1/3 meczu i lekko niższe (zmęczenie). Karne: szansa z różnicy sił.
 */
export function quickKnockout(home, away, ctx, rng, mode = 'single') {
  const r = quickMatch(home, away, ctx, rng);
  // Rewanż dwumeczu: mode = { firstLeg: [gole obecnego gospodarza, gole gościa] }, liczy się suma bramek
  const fl = mode?.firstLeg ?? [0, 0];
  const level = () => r.score[0] + fl[0] === r.score[1] + fl[1];
  if (!level()) return r;
  const { lH, lA, dH, dA } = r.model;
  if (mode === 'single' || mode?.firstLeg) {
    const eH = rng.poisson(lH / 3.3); const eA = rng.poisson(lA / 3.3);
    r.extraTime = true;
    r.score = [r.score[0] + eH, r.score[1] + eA];
    r.scorers[0].push(...pickScorers(r._teams[0], eH, rng));
    r.scorers[1].push(...pickScorers(r._teams[1], eA, rng));
    if (!level()) return r;
  }
  // Seria rzutów karnych: lepsza drużyna ma lekką przewagę
  const pH = Math.min(0.62, Math.max(0.38, 0.5 + 0.03 * (dH - dA)));
  const homeWins = rng.chance(pH);
  const loser = rng.int(2, 4);
  const winner = loser + 1;
  r.shootout = homeWins ? [winner, loser] : [loser, winner];
  return r;
}
