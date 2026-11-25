// Kapitan drużyny (docs/kapitan.md): siła kapitana B z atrybutów i charakteru, forma psychiczna M, siła C = B x M
// i efektywna siła E (-0,5..1) używana w meczu (silnik), w meczach w tle i w morale (career/captaincy.js, morale.js).
// Liczone wyłącznie z pól zawodnika (bez importów z career/), więc tak samo dla gracza i klubów AI. Wartości [SZAC].

import { clamp } from '../core/rng.js';

export const CAPTAIN = {
  // Siła B (0-1): przywództwo, opanowanie, profesjonalizm, regularność, doświadczenie, osobowość lidera
  w: { LID: 0.35, OPA: 0.15, PRF: 0.15, KON: 0.10, DOS: 0.10, lider: 0.15 },
  dosFrom: 21, dosSpan: 9, // doświadczenie: 21 lat = 0, 30+ = 1
  young: 21, youngMul: 0.75, // kapitan poniżej 21 lat: C x 0,75 (brak autorytetu)
  // Forma psychiczna M (0,3-1,1): morale, złamana obietnica (14 dni), chęć odejścia, niezadowolenie, forma 5 meczów
  m: { base: 0.5, per: 0.05, ref: 6, min: 0.5, max: 1.1 },
  brokenDays: 14, broken: -0.15, wish: -0.25, unhappy: -0.15,
  form: { k: 0.05, ref: 6.6, cap: 0.1 },
  M: [0.3, 1.1],
  neg: 0.6, eFrom: 0.25, negMax: 0.5, // M < 0,6: efekt ujemny do -0,5; inaczej E = (C - 0,25) / 0,75
  // Mecz (silnik, docs/kapitan.md)
  deputy: 0.6, shock: 2, // wicekapitan x0,6; zejście kapitana: 2 min bez kapitana
  stakes: { derby: 1.0, rival: 0.8, rank2: 0.7, rank3: 0.9, cup: 0.7, late: 0.6, base: 0.15 }, sFrom: 0.5, lateFrom: 75,
  foul: 0.10, card: 0.05, passErr: 0.06, nerves: 0.5, // przy stawce S >= 0,5: faule x(1 - 0,10 E S), kartka za faul x(1 - 0,05 E S),
  // straty przy podaniu i błędy obrony x(1 - 0,06 E S), nerwy przed meczem (ujemne zaangażowanie) x(1 - 0,5 E S)
  pos: 0.03, // mniej strat: logit posiadania + 0,03 x (E S gospodarzy - E S gości)
  goalLoss: 0.25, goalLossNeg: 0.3, regen: 0.10, regenMin: 5, // po straconym golu
  redS: 5, // czerwona kartka kapitana: spójność drużyny -5 (z 100) jednorazowo
};

/** Skala 1-20 na 0-1 (atrybuty /20). */
const a20 = (v) => clamp((v ?? 10) / 20, 0, 1);

/** Siła kapitana B (0-1) z atrybutów i charakteru zawodnika. */
export function captainBase(p) {
  const W = CAPTAIN.w; const h = p.hidden ?? {};
  const dos = clamp(((p.age ?? 25) - CAPTAIN.dosFrom) / CAPTAIN.dosSpan, 0, 1);
  return W.LID * a20(p.attr?.LID) + W.OPA * a20(p.attr?.OPA) + W.PRF * a20(p.traits?.professionalism ?? h.PRF) + W.KON * a20(h.KON)
    + W.DOS * dos + (p.persona === 'Lider' ? W.lider : 0);
}

const DAY = 864e5;
/** Forma psychiczna M (0,3-1,1): morale, świeżo złamana obietnica, chęć odejścia, niezadowolenie, forma z 5 meczów. */
export function captainMind(p, date = null) {
  const K = CAPTAIN;
  let M = clamp(K.m.base + K.m.per * ((p.morale ?? 12) - K.m.ref), K.m.min, K.m.max);
  const br = p.contract?.promise?.brokenAt;
  if (br && date && (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${br}T12:00:00Z`)) / DAY <= K.brokenDays) M += K.broken;
  if (p.moveWish || p.transferRequest) M += K.wish;
  if (p.unhappy) M += K.unhappy;
  const f = p.form;
  if (f?.length) M += clamp(K.form.k * (f.reduce((s, v) => s + v, 0) / f.length - K.form.ref), -K.form.cap, K.form.cap);
  return clamp(M, K.M[0], K.M[1]);
}

/** Efektywna siła E z C i M: przy M < 0,6 ujemna (kapitan w kryzysie szkodzi), inaczej (C - 0,25) / 0,75. */
export function captainEffect(C, M) {
  const K = CAPTAIN;
  if (M < K.neg) return -clamp(K.negMax * (K.neg - M) / (K.neg - K.M[0]), 0, K.negMax);
  return clamp((C - K.eFrom) / (1 - K.eFrom), 0, 1);
}

/** Kapitan z zawodnika: { B, M, C, E }. date (ISO) tylko do świeżości złamanej obietnicy. */
export function captainPower(p, date = null) {
  if (!p) return { B: 0, M: 1, C: 0, E: 0 };
  const B = captainBase(p);
  const M = captainMind(p, date);
  const C = clamp(B * M * ((p.age ?? 25) < CAPTAIN.young ? CAPTAIN.youngMul : 1), 0, 1);
  return { B, M, C, E: captainEffect(C, M) };
}

/**
 * Stawka meczu S (0-1) przed meczem z kontekstu: jawne ctx.stakes (dzień meczowy) albo derby, rywal, ranga, puchar.
 * Końcówka na styku (min >= 75, różnica <= 1) liczy się w meczu (silnik).
 */
export function baseStakes(ctx = {}) {
  if (Number.isFinite(ctx.stakes)) return ctx.stakes;
  const S = CAPTAIN.stakes;
  let s = S.base;
  if (ctx.derby) s = Math.max(s, S.derby);
  if (ctx.rival) s = Math.max(s, S.rival);
  if (ctx.rank >= 3) s = Math.max(s, S.rank3); else if (ctx.rank >= 2) s = Math.max(s, S.rank2);
  if (ctx.knockout) s = Math.max(s, S.cup);
  return s;
}
