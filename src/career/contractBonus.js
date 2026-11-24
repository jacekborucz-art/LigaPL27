// Premie z kontraktów zawodników (docs/finanse.md, sekcja „Premie z kontraktów”): po każdym meczu o stawkę kwota
// z umowy zawodnika (gol, asysta, czyste konto, występ) trafia do należności klubu, w którym zagrał (wypożyczony: klub
// przyjmujący). Klub płaci raz w miesiącu (1.) wydatkiem „Premie zawodników”, także na minusie, jak pensje.
// Dane: game.finance.clubs[id].bonusDue (należność w zł), p.season.bonus (suma sezonu zawodnika w tej drużynie).

import { GROUP } from './squad.js';

/** Mnożniki rozgrywek i progi minut. Mnożniki UEFA [SZAC]. */
export const CONTRACT_BONUS = {
  league: 1, pp: 1, ppFinal: 1.5, super: 1, uefa: 1.5, uefaKnockout: 2, // mnożnik kwoty z kontraktu
  fullMinutes: 45, // od tylu minut pełna premia za występ i prawo do czystego konta
  partAppShare: 0.5, // premia za występ krócej niż fullMinutes
  csPos: ['BR', 'ŚO', 'BO', 'WB'], // czyste konto liczy się bramkarzowi i obrońcom
  uefaKnockoutRounds: ['KPO', 'R16', 'QF', 'SF', 'F'], // faza pucharowa UEFA (reszta: faza ligowa i eliminacje)
};

/**
 * Premie domyślne (ułamek pensji tygodniowej) dla kontraktu bez ustalonych premii: zawodnicy z generatora świata
 * i kontrakty zawarte bez negocjacji premii (Nov 24, 2026). Gol jak w ofercie AI (negotiation.js), do tego asysta
 * i czyste konto [SZAC]. Kontrakt z negocjacji (contract.bonus) zostaje bez zmian, także z zerami.
 */
export const DEFAULT_BONUS = {
  goal: { ATT: 0.1, MID: 0.06, DEF: 0.04, GK: 0 },
  assist: { ATT: 0.04, MID: 0.04, DEF: 0.02, GK: 0 },
  cleanSheet: { ATT: 0, MID: 0, DEF: 0.03, GK: 0.04 },
  app: 0.02,
};
const round10 = (x) => Math.round(x / 10) * 10;

/** Premie z kontraktu zawodnika: ustalone (contract.bonus) albo domyślne z pensji. Bez kontraktu: null. */
export function contractBonusOf(p) {
  const c = p?.contract;
  if (!c) return null;
  if (c.bonus) return c.bonus;
  const w = c.wage ?? 0;
  const g = GROUP[p.pos] ?? 'MID';
  const D = DEFAULT_BONUS;
  return { goal: round10(w * D.goal[g]), assist: round10(w * D.assist[g]), cleanSheet: round10(w * D.cleanSheet[g]), app: round10(w * D.app) };
}

/** Mnożnik premii dla meczu (f.comp, f.round, f.ucomp). */
export function bonusMultiplier(f) {
  if (f.comp === 'uefa') return CONTRACT_BONUS.uefaKnockoutRounds.includes(f.round) ? CONTRACT_BONUS.uefaKnockout : CONTRACT_BONUS.uefa;
  if (f.comp === 'pp') return f.round === 'F' ? CONTRACT_BONUS.ppFinal : CONTRACT_BONUS.pp;
  if (f.comp === 'super') return CONTRACT_BONUS.super;
  return CONTRACT_BONUS.league;
}

/** Gole stracone przez drużynę s w 90 minutach (z dogrywką: ze zdarzeń meczu, jeśli są). */
function concededIn90(f, res, s) {
  const total = res.score?.[1 - s] ?? 1;
  if (!res.extraTime || !total || !res.ev) return total;
  let n = 0;
  for (const e of res.ev) if ((e[1] === 'g' || e[1] === 'p' || e[1] === 'o') && e[2] === 1 - s && e[0] < 91) n++;
  return n;
}

/**
 * Kontekst premii jednej drużyny meczu albo null (sparing, druga drużyna klubu, klub bez finansów).
 * Liczony raz na drużynę, potem bonusFor() dla każdego zawodnika.
 */
export function bonusContext(game, f, res, s, clubId, clubObj) {
  if (f.comp === 'friendly' || clubObj?.parent) return null;
  const c = game.finance?.clubs?.[clubId];
  if (!c) return null;
  return { c, mul: bonusMultiplier(f), clean: concededIn90(f, res, s) === 0 };
}

/** Premia zawodnika za mecz (zł) z jego kontraktu; x = statystyki meczu { minutes, g, a }. */
export function bonusFor(ctx, p, x) {
  const b = contractBonusOf(p);
  if (!b || !x || !(x.minutes > 0)) return 0;
  const B = CONTRACT_BONUS;
  let sum = (b.goal ?? 0) * (x.g ?? 0) + (b.assist ?? 0) * (x.a ?? 0);
  sum += (b.app ?? 0) * (x.minutes >= B.fullMinutes ? 1 : B.partAppShare);
  if (ctx.clean && x.minutes >= B.fullMinutes && B.csPos.includes(p.pos)) sum += b.cleanSheet ?? 0;
  return Math.round(sum * ctx.mul);
}

/** Dopisuje premię zawodnika do należności klubu i do jego sezonu (ss: obiekt statystyk sezonu). */
export function accrueBonus(ctx, p, x, ss) {
  const amount = bonusFor(ctx, p, x);
  if (!amount) return;
  ctx.c.bonusDue = (ctx.c.bonusDue ?? 0) + amount;
  if (ss) ss.bonus = (ss.bonus ?? 0) + amount;
}

