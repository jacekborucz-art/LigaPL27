// Szybka symulacja meczów w tle (bez minut). Lekka, ale oparta na wyliczeniu:
// siła dostępnej jedenastki w strefach, forma, morale, ostrość, świeżość, kontuzje i pauzy,
// miejsce meczu, pewność siebie z tabeli, sędzia. Wynik losujemy z rozkładu Poissona
// o średnich wyliczonych z tych sił (tak jak w prawdziwej piłce: lepszy częściej wygrywa,
// ale nie zawsze). Stałe dopasowane do pełnego silnika: docs/ekspert_futbol.md 6.1 (e).
// Każda statystyka wynika z modelu: strzały z xG, celne z goli i strzałów, posiadanie z różnicy w pomocy.

import { clamp } from '../core/rng.js';
import { teamRating } from './teamStrength.js';
import { matchFactors } from './pipeline.js';
import { ENGINE2 } from './engine2.js';

export const QS = {
  BETA: 0.225, MU_H: 1.50, MU_A: 1.19, MU_N: 1.34, RHO: -0.10,
  // Nachylenie dla meczów klubowych z kadrami ze świata gry: dopasowane do pełnego silnika, który rozstrzyga mecze
  // gracza (docs/balans.md: silnik dawał ok. 11 % większą przewagę lepszym; 0.225 -> 0.25). BETA zostaje dla
  // modeli z własną kalibracją (puchary UEFA z ratingami klubów zagranicznych, reprezentacje).
  BETA_CLUB: 0.25,
  XG_PER_SHOT: 0.108, // ok. 2,72 gola / 25 strzałów
  ON_TARGET_NON_GOAL: 0.28,
  CORNERS_PER_SHOT: 0.4,
  CAP: 0.025, // kapitan w meczu o stawkę (season.js playQuick): średnie goli x exp(+-0,025 x S x różnica E), docs/kapitan.md
  YELLOW_H: 1.16, YELLOW_A: 1.49, RED: 0.038, INJ: 0.19, // żółte -15% jak w pełnym silniku (Nov 25, 2026); INJ: kontuzje na drużynę (Nov 25, 2026: 0,45 -> 0,19 na prośbę właściciela, ok. 0,38 na mecz, mniej niż pełny silnik 0,52); kartki -10%, potem -20% w meczach w tle (Nov 17, 2026); RED to bezpośrednie czerwone, drugie żółte dochodzą w playQuick (razem ok. 0,15/mecz jak pełny silnik)
  // Krok 2 (ENGINE2.unify, docs/walka-taktyk.md rozdz. 7): atut boiska z wartości terenu jak w pełnym silniku (wpis terrain):
  // średnie goli MU_C x exp(+-HFA_K x hfa); przy hfa = HFA_REF (typowa wartość dawnego modelu, 0,7 + 0,3 x 0,6) dawne MU_H i MU_A.
  MU_C: Math.sqrt(1.5 * 1.19), HFA_REF: 0.88, HFA_K: 0.5 * Math.log(1.5 / 1.19) / 0.88,
  PEN_SHARE: 0.08, // udział karnych w golach: surowość sędziego zmienia liczbę karnych (kanał pen) jak w pełnym silniku
  // Zawodnik z pola w bramce: część kary goalMul. Pomiar [SYM] (Nov 28, 2026): pełny silnik (połowa goalMul + niska ocena
  // bramkarska) traci 2,09 razy więcej goli, mecz w tle z całą karą 2,06 razy, z połową 1,59 razy: zostaje cała kara
  GK_SHARE: 1,
};

/** Średnie bramek z sił stref (wzór eksperta). */
export function expectedGoals(H, A, ctx = {}) {
  const atk = (T) => 0.55 * T.ATT + 0.45 * T.MID;
  const def = (T) => 0.65 * T.DEF + 0.35 * T.MID;
  const dH = 0.75 * (atk(H.zones) - def(A.zones)) + 0.15 * (H.zones.MID - A.zones.MID) + 0.10 * (H.zones.FIN - A.zones.GK);
  const dA = 0.75 * (atk(A.zones) - def(H.zones)) + 0.15 * (A.zones.MID - H.zones.MID) + 0.10 * (A.zones.FIN - H.zones.GK);
  const mx = ctx.mx;
  if (ENGINE2.unify || (mx && ENGINE2.conditions)) {
    // Krok 2: warunki z tego samego etapu match co pełny silnik (ctx.mx = matchFactors). Derby: mniejsza różnica klas
    // (gap); unify: atut boiska z terenu, sędzia przez karne, bramkarz z pola jak w pełnym silniku
    const gap = ENGINE2.conditions ? mx?.gap ?? 1 : 1;
    const eH = gap * dH; const eA = gap * dA;
    let muH = ctx.neutral ? QS.MU_N : QS.MU_H; let muA = ctx.neutral ? QS.MU_N : QS.MU_A;
    let pen = 1; let gm = (m) => m;
    if (ENGINE2.unify) {
      const hfa = ctx.neutral ? 0 : mx?.hfa ?? QS.HFA_REF;
      if (!ctx.neutral) { muH = QS.MU_C * Math.exp(QS.HFA_K * hfa); muA = QS.MU_C * Math.exp(-QS.HFA_K * hfa); }
      pen = 1 + QS.PEN_SHARE * ((mx?.pen ?? 1) - 1);
      gm = (m) => 1 + (m - 1) * QS.GK_SHARE;
    }
    const lH = muH * Math.exp(QS.BETA_CLUB * eH) * (H.qsMul ?? 1) * gm(A.gkMods.goalMul) * pen;
    const lA = muA * Math.exp(QS.BETA_CLUB * eA) * (A.qsMul ?? 1) * gm(H.gkMods.goalMul) * pen;
    return { lH, lA, dH, dA };
  }
  const muH = ctx.neutral ? QS.MU_N : QS.MU_H;
  const muA = ctx.neutral ? QS.MU_N : QS.MU_A;
  // Rywal bez prawdziwego bramkarza: każdy celny strzał wpada częściej (positions.js).
  const lH = muH * Math.exp(QS.BETA_CLUB * dH) * (H.qsMul ?? 1) * A.gkMods.goalMul;
  const lA = muA * Math.exp(QS.BETA_CLUB * dA) * (A.qsMul ?? 1) * H.gkMods.goalMul;
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
 * home/away: { squad, qsMul?, tableTerm?, coachTerm? (decyzje trenera, punkty atrybutu) }; ctx: { neutral, refStrict (0.7-1.4), aggression [h,a] }
 * Zwraca wynik, statystyki wynikające z modelu i rozbicie sił (do raportu i testów).
 */
export function quickMatch(home, away, ctx, rng) {
  // Krok 2: warunki meczu (etap match potoku, jak w pełnym silniku) i kontekst drużyny dla stanu zawodników:
  // ranga (stawka x WAZ), poziom ligi, presja tabeli. Bez wyłączników ENGINE2: jak w kroku 1.
  const k2 = ENGINE2.unify || ENGINE2.conditions;
  if (k2 && !ctx.mx) ctx = { ...ctx, mx: matchFactors({ refStrict: 1, rank: 0, ...ctx }, false) };
  const tc = (s) => (k2 ? { tableTerm: s.tableTerm, coachTerm: s.coachTerm, rank: ctx.rank ?? 0, tier: s.tier, pressure: s.pressure ?? 0 } : { tableTerm: s.tableTerm, coachTerm: s.coachTerm });
  const H = { ...teamRating(home.squad, tc(home)), qsMul: home.qsMul };
  const A = { ...teamRating(away.squad, tc(away)), qsMul: away.qsMul };
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
  // Kartki (krok 2, unify): kanały fauli i kartek etapu match (sędzia, ranga, derby, murawa) jak w pełnym silniku
  const mx = ctx.mx;
  const yMul = ENGINE2.unify && mx ? mx.foul * mx.card : ref;
  const rMul = ENGINE2.unify && mx ? mx.foul * mx.card * mx.red : ref ** 1.5;

  return {
    score: [gH, gA],
    xg: [Math.round(lH * 100) / 100, Math.round(lA * 100) / 100],
    shots: [sH, sA],
    onTarget: [onH, onA],
    possession: [possH, 100 - possH],
    corners: [rng.poisson(sH * QS.CORNERS_PER_SHOT), rng.poisson(sA * QS.CORNERS_PER_SHOT)],
    yellow: [rng.poisson(QS.YELLOW_H * yMul * agH), rng.poisson(QS.YELLOW_A * yMul * agA)],
    red: [rng.poisson(QS.RED * rMul * agH), rng.poisson(QS.RED * rMul * agA)],
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
    r.regScore = [...r.score]; // wynik po 90 minutach (raport meczu: gole dogrywki to końcówka listy strzelców)
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
