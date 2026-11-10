// Reputacja zawodnika (0-100) i jej wpływ na transfery.
// Lepsi zawodnicy rzadziej chcą iść do słabszych klubów, żądają więcej i kosztują więcej.
// Wszystkie liczby to wartości balansowe [SZAC], do strojenia w testach sezonu.

import { clamp } from '../core/rng.js';

export const REP_LEVELS = [
  { min: 85, label: 'Światowa gwiazda' },
  { min: 70, label: 'Gwiazda w Europie' },
  { min: 55, label: 'Uznany w Europie' },
  { min: 40, label: 'Znany w Polsce' },
  { min: 25, label: 'Znany lokalnie' },
  { min: 0, label: 'Nieznany' },
];

export function reputationLabel(r) {
  return REP_LEVELS.find((l) => r >= l.min).label;
}

// Punkty kontrolne OVR -> reputacja bazowa (interpolacja liniowa).
// 2 Liga ok. 8,5 -> 22; 1 Liga 10 -> 30; Ekstraklasa 11,5 -> 40; reprezentant 14 -> 58; elita 16,5 -> 82.
const OVR_CURVE = [[5, 5], [8.5, 22], [10, 30], [11.5, 40], [13, 50], [14, 58], [15.5, 70], [16.5, 82], [18, 95]];

export function baseFromOvr(ovr) {
  if (ovr <= OVR_CURVE[0][0]) return OVR_CURVE[0][1];
  for (let i = 1; i < OVR_CURVE.length; i++) {
    const [x1, y1] = OVR_CURVE[i];
    const [x0, y0] = OVR_CURVE[i - 1];
    if (ovr <= x1) return y0 + ((ovr - x0) / (x1 - x0)) * (y1 - y0);
  }
  return OVR_CURVE[OVR_CURVE.length - 1][1];
}

// Reputacja klubu zależy od marki (prestiż 1-10) i od ligi, w której klub teraz gra.
const TIER_REP = { 1: 25, 2: 12, 3: 0 };

/** Reputacja klubu 0-100. Na start z prestiżu i ligi, potem aktualizowana wynikami (club.rep). */
export function clubReputation(club) {
  return club.rep ?? Math.min(100, club.prestige * 7 + (TIER_REP[club.tier ?? 1] ?? 0));
}

/**
 * Reputacja docelowa: do niej zawodnik dąży co miesiąc.
 * p: { ovr, age, caps, titles, europeApps, avgRating, apps }
 */
export function targetReputation(p, club) {
  let t = baseFromOvr(p.ovr);
  t += Math.min(15, 1.5 * Math.sqrt(p.caps || 0)); // reprezentacja
  t += Math.min(8, 2 * (p.titles || 0)); // trofea
  t += Math.min(5, 0.25 * (p.europeApps || 0)); // mecze w pucharach
  if ((p.apps || 0) >= 8 && p.avgRating) t += clamp((p.avgRating - 6.7) * 8, -6, 8); // forma sezonu
  t += 0.15 * (clubReputation(club) - t); // klub "podnosi" albo "obniża" rozpoznawalność
  if (p.age < 21) t -= 4; // młody: mniej znany niż wskazuje talent
  return clamp(t, 1, 99);
}

/** Startowa reputacja przy generowaniu świata (z małym szumem). */
export function initialReputation(p, club, rng) {
  return Math.round(clamp(targetReputation(p, club) + (rng ? rng.gauss(0, 3) : 0), 1, 99));
}

/** Miesięczna aktualizacja z bezwładnością + zdarzenia (gol w derbach, powołanie, czerwona za przemoc). */
export function monthlyUpdate(rep, p, club, events = 0) {
  const target = targetReputation(p, club);
  return Math.round(clamp(rep + 0.12 * (target - rep) + events, 1, 99) * 10) / 10;
}

export const REP_EVENTS = {
  goalInFinal: 2, goalInEurope: 0.6, motmEurope: 0.8, firstCap: 2, goalForCountry: 1,
  titleWon: 3, longInjuryMonth: -0.5, violentRed: -1.5, relegated: -2,
};

/**
 * Czy zawodnik chce przejść do klubu. Strona zawodnika (zgoda klubu sprzedającego liczona osobno).
 * ctx: { player:{rep, age, persona, wage, monthsLeft, unhappy}, from, to, offerWage,
 *        toTier, fromTier, toEurope, fromEurope, starter }
 * Zwraca: { score 0-1, verdict, wageDemand, reasons[] }
 */
export function willingnessToJoin(ctx) {
  const { player, from, to } = ctx;
  const reasons = [];
  const toRep = clubReputation(to);
  const fromRep = clubReputation(from);
  // Jak bardzo zawodnik "przerasta" klub docelowy. Weterani patrzą mniej na reputację, a bardziej na pieniądze.
  const ageW = player.age >= 31 ? 0.6 : player.age <= 23 ? 0.85 : 1;
  const ambW = player.persona === 'Ambitny' ? 1.4 : player.persona === 'Spokojny' ? 0.8 : 1;
  const gap = (player.rep - toRep) * ageW * ambW;
  const step = (toRep - fromRep) * ageW; // awans albo regres względem obecnego klubu

  // Twarda odmowa: klub wyraźnie poniżej poziomu zawodnika.
  if (gap > 30) {
    return {
      score: 0, verdict: 'odmowa', wageDemand: null,
      reasons: ['Nie rozważa przejścia: reputacja klubu jest dużo niższa niż jego'],
    };
  }

  let s = 0;
  s += -gap / 25; // główny czynnik
  s += clamp(step / 80, -0.6, 0.6);
  if (gap > 10) reasons.push('Uważa ten klub za zbyt słaby dla siebie');
  if (step > 10) reasons.push('Przejście byłoby dla niego krokiem w górę');

  const tierDiff = (ctx.toTier ?? 1) - (ctx.fromTier ?? 1);
  if (tierDiff > 0) {
    s -= 0.35 * tierDiff * Math.max(0.5, player.rep / 40) * ageW; // im lepszy, tym bardziej nie chce niżej
    reasons.push('Nie chce grać w niższej lidze');
  }
  if (tierDiff < 0) s += 0.3;
  if (ctx.toEurope && !ctx.fromEurope) { s += 0.35; reasons.push('Kusi go gra w europejskich pucharach'); }
  if (!ctx.toEurope && ctx.fromEurope && player.rep >= 45) { s -= 0.3; reasons.push('Straciłby grę w pucharach'); }
  if (ctx.starter === false && player.rep >= 45) { s -= 0.4; reasons.push('Obawia się, że nie będzie grał regularnie'); }
  if (ctx.starter === true) s += 0.2;
  if (player.monthsLeft != null && player.monthsLeft <= 6) s += 0.25;
  if (player.unhappy) { s += 0.4; reasons.push('Jest niezadowolony w obecnym klubie'); }

  // Żądanie płacowe rośnie z różnicą reputacji: słabszy klub musi dopłacić.
  const premium = 1.1 + Math.max(0, gap) * 0.025 + Math.max(0, -step) * 0.006;
  const wageDemand = Math.round((player.wage * premium) / 100) * 100;
  if (ctx.offerWage != null) {
    const w = ctx.offerWage / wageDemand;
    const moneyCap = player.age >= 31 ? 0.8 : 0.6; // weteranom pieniądze znaczą więcej
    s += clamp(2.2 * (w - 1), -1.5, moneyCap); // pieniądze pomagają, ale nie kupią wszystkiego
    if (w < 0.95) reasons.push('Oferowana pensja jest za niska');
  }

  const score = 1 / (1 + Math.exp(-2 * s));
  const verdict = score >= 0.7 ? 'chętny' : score >= 0.45 ? 'otwarty' : score >= 0.2 ? 'niechętny' : 'odmowa';
  return { score: Math.round(score * 100) / 100, verdict, wageDemand, reasons };
}

/** Mnożnik ceny wywoławczej klubu sprzedającego: znanych zawodników trudniej wyciągnąć. */
export function askingPriceMultiplier(rep) {
  return 1 + 0.012 * Math.max(0, rep - 35);
}

/** Mnożnik wartości rynkowej z reputacji (obok OVR, wieku i kontraktu). */
export function valueMultiplier(rep) {
  return clamp(0.75 + rep / 100, 0.8, 1.6);
}
