// Reputacja zawodnika (0-100) i jej wpływ na transfery.
// Lepsi zawodnicy rzadziej chcą iść do słabszych klubów, żądają więcej i kosztują więcej.
// Wszystkie liczby to wartości balansowe [SZAC], do strojenia w testach sezonu.

import { clamp } from '../core/rng.js';
import UEFA_DATA from '../data/kluby_uefa.json' with { type: 'json' };
import { applyNamesDeep } from '../data/clubNames.js';
applyNamesDeep(UEFA_DATA); // nazwy do publikacji (prawdziwe w clubNames.js)

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

/** Marka krajowa bez wyników: prestiż i liga (skala, na której skalibrowane są transfery). */
export function clubBaseReputation(club) {
  return Math.min(100, club.prestige * 7 + (TIER_REP[club.tier ?? 1] ?? 0));
}

/** Reputacja klubu 0-100. Na start z prestiżu i ligi, potem z wyników sezonów (club.rep, docs/reputacja.md). */
export function clubReputation(club) {
  return club.rep ?? clubBaseReputation(club);
}

// ------------------------------------------------------------ Reputacja dynamiczna (docs/reputacja.md)
// Wszystkie liczby [SZAC], kalibracja: tools/multiseason.mjs (rozkład reputacji per liga, inflacja w 10 sezonach).
export const REP = {
  rise: 0.10, // wzrost: 10 % luki do celu na miesiąc (decyzja właściciela)
  fall: 0.06, // spadek: 6 % luki na miesiąc, sława się „klei” (decyzja właściciela)
  surplus: 0.2, // nad kolanem sceny zostaje 20 % nadwyżki (decyzja właściciela)
  stagePull: 0.1, // gra w dużym klubie dosypuje 10 % różnicy do sceny
  noise: 0.4, // miesięczny szum medialny (odchylenie)
  addCap: 18, // suma dodatków (forma, kadra, trofea, puchary)
};
/** Widoczność ligi (ta sama skala co p.rep): 1 Liga, 2 Liga, III liga, IV liga. Ekstraklasa ze współczynnika Polski. */
export const LEAGUE_VIS = { 2: 26, 3: 17, 4: 10, 5: 6 };
export const POL_COEF_BASE = 35;
/** Gole i asysty na 90 minut przeciętnego zawodnika pozycji (bramkarz tylko przez ocenę). */
export const GA_EXPECTED = { NAP: 0.45, SN: 0.40, OP: 0.35, BP: 0.30, ŚP: 0.15, WB: 0.12, DP: 0.08, BO: 0.08, ŚO: 0.05, BR: 0 };
/** Punkty trofeów (okno 3 sezonów z wagą 1 / 0,6 / 0,3). */
export const TROPHY_PTS = { champion: 3, cup: 1.5, LK: 4, LE: 6, LM: 10 };
export const TROPHY_W = [1, 0.6, 0.3];

// Renoma europejska na start: współczynnik klubu z danych UEFA, inne polskie kluby z prestiżu (Legia 25, Wisła 20)
const POLISH_COEF = new Map(UEFA_DATA.polskieKlubyUEFA2026.map((k) => [k.id, k.wspolczynnik]));
const FOREIGN_COEF = new Map(UEFA_DATA.kluby.map((k) => [k.id, k.wspolczynnik]));
export function startClubPoints(club) {
  if (!club) return 0;
  if (POLISH_COEF.has(club.id)) return POLISH_COEF.get(club.id);
  if (FOREIGN_COEF.has(club.id)) return FOREIGN_COEF.get(club.id);
  if (club.coef != null) return club.coef;
  return Math.max(0, ((club.prestige ?? 0) - 5) * 5);
}

/** Renoma europejska K z punktów UEFA klubu z 5 sezonów (P5). */
export const euroRenown = (P5) => 10 * Math.log(1 + Math.max(0, P5) / 10);

/** Punkty P5 klubu: dynamiczne z game.repState (polskie kluby), inaczej dane startowe. */
export function clubP5(club, game = null) {
  const pts = game?.repState?.clubPts?.[club?.id];
  return pts ? pts.reduce((a, b) => a + b, 0) : startClubPoints(club);
}

const isForeignClub = (club) => !!club && (club.foreign || club.id === 'zagranica' || String(club.id).startsWith('zagranica:'));

/**
 * Scena S: widoczność klubu i ligi w skali europejskiej (ta sama skala co p.rep).
 * S = widoczność ligi + renoma europejska klubu + marka krajowa.
 */
export function clubStage(club, game = null) {
  if (!club) return LEAGUE_VIS[4];
  if (isForeignClub(club)) {
    const V = 30 + 9 * ((club.L ?? 11) - 11);
    const B = clamp(0.1 * ((club.rep ?? clubBaseReputation({ prestige: club.prestige ?? 3, tier: 1 })) - 60), -3, 4);
    return V + euroRenown(clubP5(club, game)) + B;
  }
  const tier = club.tier ?? 1;
  const coef = game?.countryCoef?.POL ?? POL_COEF_BASE;
  const V = tier === 1 ? 39 + 0.25 * (coef - POL_COEF_BASE) : LEAGUE_VIS[tier] ?? LEAGUE_VIS[5];
  const B = clamp(0.1 * (clubReputation(club) - 60), -3, 4);
  return V + euroRenown(clubP5(club, game)) + B;
}

/** Kolano kadry: reprezentant z siłą kadry L (Polska 14 -> 57, Francja 16,6 -> 80). */
export const ntKnee = (L) => 30 + 9 * ((L ?? 11) - 11);

/**
 * Reputacja docelowa (czysta funkcja, wejście z gotowymi liczbami). Do niej zawodnik dąży co miesiąc.
 * c: { ovr, age, pos, m (udział minut 0-1), avg (średnia ocen albo null), n (liczba ocen), ga90, min (minuty),
 *      caps, recentCaps (24 mies.), tourn (turnieje finałowe), troph (punkty trofeów), euroApps (24 mies.),
 *      S (scena), ntL (siła kadry L albo null) }
 * Zwraca { t, X, S, C }.
 */
export function targetReputationV2(c) {
  const A = baseFromOvr(c.ovr);
  const R = -7 + 11 * Math.min(1, (c.m ?? 0) / 0.65);
  const n = c.n ?? 0;
  const form = c.avg != null && n > 0 ? clamp((c.avg - 6.7) * 8 * n / (n + 8), -6, 8) : 0;
  const ga = c.ga90 != null ? clamp(8 * (c.ga90 - (GA_EXPECTED[c.pos] ?? 0.15)), -2, 4) * Math.min(1, (c.min ?? 0) / 1500) : 0;
  const caps = c.caps ?? 0;
  const N = Math.min(10, 1.5 * Math.sqrt(caps)) + Math.min(4, 2 * (c.tourn ?? 0));
  const T = Math.min(8, c.troph ?? 0);
  const euro = c.euroApps ?? 0;
  const Eu = Math.min(6, 0.3 * euro);
  const Ag = c.age <= 20 ? -4 : c.age === 21 ? -2 : 0;
  const X = A + R + Math.min(REP.addCap, form + ga + N + T + Eu) + Ag;
  const S = c.S;
  let C = S + 6 + Math.min(4, 0.3 * euro);
  const rc = c.recentCaps ?? 0;
  if (rc >= 3 && c.ntL != null) { const w = Math.min(1, rc / 8); C = Math.max(C, w * ntKnee(c.ntL) + (1 - w) * C); }
  let t = X <= C ? X : C + REP.surplus * (X - C);
  t += REP.stagePull * Math.max(0, S - t);
  return { t: clamp(t, 1, 99), X, S, C };
}

/** Miesięczny krok: asymetria wzrostu i spadku, zdarzenia ważone sceną, szum medialny. */
export function stepReputation(rep, target, ev = 0, S = 40, noise = 0) {
  const k = target > rep ? REP.rise : REP.fall;
  const v = rep + k * (target - rep) + ev * (0.6 + S / 100) + noise;
  return Math.round(clamp(v, 1, 99) * 10) / 10;
}

/** Zdarzenia miesiąca (punkty reputacji przed wagą sceny), zbierane w p.repEv i doliczane przy aktualizacji [SZAC]. */
export const REP_EVENTS = {
  hatTrick: 1, cupFinalGoal: 1.5, euroFinalGoal: 3, euroGoal: 0.4, euroGoalMain: 0.6, euroMotm: 0.6,
  firstCap: 2, ntGoal: 0.8, tournamentGoal: 2, title: 2, topScorer: 3, violentRed: -1.5, scandal: -1, relegated: -2,
};

/** Zapisuje zdarzenie zawodnikowi (mult: np. derby x1,5; transfer: wartość podana wprost w mult przy key 'move'). */
export function addRepEvent(p, key, mult = 1) {
  if (!p) return;
  const v = key === 'move' ? mult : (REP_EVENTS[key] ?? 0) * mult;
  if (!v) return;
  p.repEv = Math.round(((p.repEv ?? 0) + v) * 100) / 100;
}

/** Zdarzenia meczu o punkty (z applyResult): hat-trick, gole w finałach i pucharach, zawodnik meczu, czerwona za przemoc. */
export function matchRepEvents(p, f, x) {
  if (x.g >= 3) addRepEvent(p, 'hatTrick', f.derby ? 1.5 : 1);
  if (f.comp === 'pp' && f.round === 'F' && x.g) addRepEvent(p, 'cupFinalGoal');
  if (f.comp === 'uefa') {
    if (x.g) {
      if (f.round === 'F') addRepEvent(p, 'euroFinalGoal');
      else addRepEvent(p, ['Q1', 'Q2', 'Q3', 'PO'].includes(f.round) ? 'euroGoal' : 'euroGoalMain', x.g);
    }
    if (x.motm) addRepEvent(p, 'euroMotm');
  }
  if (x.rc && x.redReason === 'violent') addRepEvent(p, 'violentRed');
}

/** Oczekiwany udział minut z miejsca w kadrze po OVR (generator i zawodnicy bez danych): 1-11, 12-16, 17+. */
export const roleShare = (rank) => (rank < 11 ? 0.8 : rank < 16 ? 0.4 : 0.12);

/** Reputacja nowego zawodnika: ten sam wzór co co miesiąc, wejścia oczekiwane (forma 6,7, bez trofeów). */
export function generatedReputation(p, S, { m = 0.4, noise = 0 } = {}) {
  const { t } = targetReputationV2({ ovr: p.ovr, age: p.age, pos: p.pos, m, avg: null, n: 0, ga90: null, min: 0, caps: p.intl?.caps ?? 0, S });
  return Math.round(clamp(t + noise, 1, 99));
}

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
  // Nastawienie D (src/career/mindset.js): długo bez klubu albo bez ofert zawodnik obniża wymagania
  const D = clamp(player.stepDown ?? 0, 0, 1);
  const gap = (player.rep - toRep) * ageW * ambW - 25 * D;
  const step = (toRep - fromRep) * ageW; // awans albo regres względem obecnego klubu

  // Twarda odmowa: klub wyraźnie poniżej poziomu zawodnika.
  if (gap > 30 + 20 * D) {
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
    s -= 0.35 * tierDiff * Math.max(0.5, player.rep / 40) * ageW * (1 - D); // im lepszy, tym bardziej nie chce niżej
    if (D < 0.6) reasons.push('Nie chce grać w niższej lidze');
  }
  if (D >= 0.25) reasons.push(player.free ? 'Długo bez klubu, obniżył wymagania' : 'Brak ofert, obniżył wymagania');
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
