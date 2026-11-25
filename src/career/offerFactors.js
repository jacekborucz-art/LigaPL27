// Klocki decyzji zawodnika: jak zawodnik ocenia ofertę klubu (prekontrakty, namysł przed podpisem, odniesienie).
// Początek pakietu „Psychika zawodnika” (docs/negocjacje.md, rozdz. 16). Ocena to suma czynników:
//   U = suma po czynnikach weight(p, cechy, preferencje, mindset) x value(p, oferta, ctx)  (+ szum u wywołującego).
// Te same czynniki działają dla gracza i klubów AI: przewaga AI wynika tylko z rozmów (atrybut Negocjacje).
//
// Jak dodać klocek:
//  1. Dopisz obiekt do OFFER_FACTORS (na końcu, kolejność sumowania ma znaczenie dla powtarzalności wyników):
//     { id, label, cap: 0.3, weight(p, t, pr, m, ctx) -> liczba, value(p, o, ctx) -> liczba, why?(v) -> tekst }.
//     t: cechy (personality.js), pr: elementPrefs, m: mindset ({ key }), ctx: { trust, wageRef }.
//  2. value zwraca 0, gdy brakuje danych (zawodnik bez klubu, bez kontraktu, oferta z zagranicy).
//  3. Dane klubu potrzebne do value dopisz do widoku oferty w wywołujących (offerView w preContracts.js
//     i proposals.js, referenceUtility), nie licz ich w czynniku (czynnik nie zna stanu gry).
//  4. Żaden czynnik poza pieniędzmi nie przekracza ±0,3 (cap). Po dodaniu przekalibruj THINK.accept/slope
//     (proposals.js) tak, żeby odsetek zgód został podobny, i dopisz test w tests/offerFactors.test.mjs.
// Liczby [SZAC].

import { clamp } from '../core/rng.js';
import { clubById } from '../data/clubs_pl.js';
import { personalityOf, computeMindset, elementPrefs } from './personality.js';
import { expectedRole, ROLE_RANK } from './negotiation.js';

const ambW = (t) => clamp(1 + 0.05 * (t.ambition - 10), 0.3, 1.7);

/** Chęć wyjazdu za granicę 0-1 z charakteru i nastawienia. */
export function abroadWish(p) {
  const { traits: t } = personalityOf(p);
  const m = computeMindset(p, t, {});
  if (m.key === 'zagranica') return 1;
  return clamp(0.5 + 0.05 * (t.ambition - 10) + 0.03 * (t.risk - 10) - 0.05 * (t.homeTies - 10), 0, 1);
}

/**
 * Region rodzinny zawodnika (region klubu z danych, clubs_pl.js): polski zawodnik, pierwszy klub w historii
 * (wychowanek albo klub, w którym zaczynał w grze). Zagraniczny albo bez klubu i historii: null.
 */
export function homeRegionOf(p) {
  if (!p || (p.nat ?? 'POL') !== 'POL') return null;
  const first = p.cl?.[0]?.c ?? p.career?.[0]?.from ?? p.career?.[0]?.to ?? p.clubId ?? null;
  return (first && clubById(first)?.region) || null;
}

/** Zapas gotówki klubu w miesiącach kosztów (płace i utrzymanie). */
const monthsOf = (c) => c.balance / Math.max(1, ((c.plan?.wages ?? 0) + (c.plan?.ops ?? 0)) / 12);
const medianCache = new WeakMap(); // finanse -> { date, m }: mediana zapasu wszystkich klubów w danym dniu
function medianMonths(F, date) {
  const e = medianCache.get(F);
  if (e && e.date === date) return e.m;
  const xs = Object.values(F.clubs ?? {}).filter((c) => c?.plan).map(monthsOf).sort((a, b) => a - b);
  const m = xs.length ? xs[Math.floor((xs.length - 1) / 2)] : 1;
  medianCache.set(F, { date, m });
  return m;
}

/**
 * Stabilność klubu -1..1 względem innych klubów w tym samym dniu: zapas gotówki wobec mediany wszystkich klubów
 * (ln(zapas / mediana) / ln 4, mediana w sezonie spada z ok. 2,3 do ok. 1 miesiąca) i zmiany trenera w ostatnich
 * 12 miesiącach (+0,1 bez zmiany, -0,3 za każdą, najwyżej 2). Średnio ok. 0. Brak danych: 0. [SZAC]
 */
export function clubStability(game, clubId, date = game?.date) {
  const c = game?.finance?.clubs?.[clubId];
  if (!c?.plan) return 0;
  const med = Math.max(0.1, medianMonths(game.finance, date));
  const money = clamp(Math.log(Math.max(0.1, monthsOf(c)) / med) / Math.log(4), -1, 1);
  let changes = 0;
  if (date) {
    const since = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
    for (const e of game.coachLog ?? []) if (e.club === clubId && e.date >= since && e.date <= date && !e.outCt && e.why !== 'na stałe') changes++;
  }
  return clamp(money + 0.1 - 0.3 * Math.min(2, changes), -1, 1);
}

/**
 * Rejestr czynników. Pierwsze sześć (legacy) to dawny wzór offerUtility bez zmiany liczb:
 * U = moneyW ln(wage/wageRef) + 0,03 (rep klubu - rep zawodnika) ambW + 0,25 roleW (rola - 2) + 0,3 Europa
 *     + (zagranica ? 0,5 chęć wyjazdu) + (własny klub ? 0,04 (lojalność - 10) + 0,004 (zaufanie - 50)).
 * Oferta o: { wage, rep, L?, prestige?, tier?, europe, foreign, own, region?, stab?, first? }.
 */
export const OFFER_FACTORS = [
  { id: 'money', label: 'Pieniądze', legacy: true,
    weight: (p, t, pr) => pr.moneyW,
    value: (p, o, c) => Math.log(Math.max(100, o.wage) / c.wageRef),
    why: (v) => (v > 0.1 ? 'lepsze pieniądze' : null) },
  { id: 'prestige', label: 'Prestiż klubu', legacy: true,
    weight: (p, t) => ambW(t),
    value: (p, o) => 0.03 * (o.rep - (p.rep ?? 30)),
    why: (v) => (v > 0.15 ? 'mocniejszy klub' : null) },
  { id: 'role', label: 'Rola w drużynie', legacy: true,
    weight: (p, t, pr) => 0.25 * pr.roleW,
    value: (p, o, c) => (ROLE_RANK[expectedRole(p, { L: o.L, prestige: o.prestige ?? 5, tier: o.tier ?? 1, rep: o.rep }, c.t)] ?? 2) - 2,
    why: (v) => (v > 0 ? 'większa rola' : null) },
  { id: 'europe', label: 'Puchary europejskie', legacy: true,
    weight: () => 0.3,
    value: (p, o) => (o.europe ? 1 : 0),
    why: (v) => (v ? 'gra w Europie' : null) },
  { id: 'abroad', label: 'Wyjazd za granicę', legacy: true,
    weight: () => 0.5,
    value: (p, o) => (o.foreign ? abroadWish(p) : 0),
    why: (v) => (v > 0.5 ? 'chce wyjechać' : null) },
  { id: 'loyalty', label: 'Lojalność wobec klubu', legacy: true,
    weight: () => 1,
    value: (p, o, c) => (o.own ? 0.04 * (c.t.loyalty - 10) + 0.004 * (c.trust - 50) : 0),
    why: (v) => (v > 0.1 ? 'przywiązanie do klubu' : null) },
  // ---- Nowe klocki (Nov 20, 2026)
  { id: 'home', label: 'Miasto i rodzina', cap: 0.3,
    // Przywiązanie 1-20: -0,18 do +0,2; nastawienie „Chce wrócić do domu” dla klubu z regionu: +0,1
    weight: (p, t, pr, m, c) => 0.02 * (t.homeTies - 10) + (c.homeMindset ? 0.1 : 0),
    value: (p, o, c) => (c.home && o.region && o.region === c.home ? 1 : 0),
    why: (v) => (v ? 'blisko domu' : null) },
  { id: 'stability', label: 'Stabilność klubu', cap: 0.3,
    // Lęk przed niepewnością 4-20: waga 0-0,3; wartość -1..1 (clubStability)
    weight: (p, t) => 0.3 * clamp((t.security - 4) / 16, 0, 1),
    value: (p, o) => clamp(o.stab ?? 0, -1, 1),
    why: (v) => (v > 0.3 ? 'pewny pracodawca' : v < -0.3 ? 'niepewny klub' : null) },
  { id: 'first', label: 'Pierwszeństwo oferty', cap: 0.3,
    // Propozycja złożona najwcześniej (spośród rozważanych): +0,05 x (1 + 0,1 (cierpliwość - 10)), 0-0,1
    weight: (p, t) => 0.05 * clamp(1 + 0.1 * (t.patience - 10), 0, 2),
    value: (p, o) => (o.first ? 1 : 0),
    why: (v) => (v ? 'pierwsza oferta' : null) },
  // ---- Termin przejścia (Nov 25, 2026, docs/negocjacje.md „Decyzja zawodnika przy transferze”)
  { id: 'timing', label: 'Termin przejścia', cap: 0.3,
    // o.timing: -0,3..+0,4 z sytuacji zawodnika i terminu (playerMind.js timingValue, liczy wywołujący): mało gra albo
    // prosi o transfer, woli szybko; podstawowy z długim kontraktem albo w walce o cel woli później; kończy mu się kontrakt, woli lato
    weight: () => 1,
    value: (p, o) => (Number.isFinite(o.timing) ? o.timing : 0),
    why: (v) => (v > 0.1 ? 'dobry termin przejścia' : v < -0.1 ? 'zły termin przejścia' : null) },
];
export const LEGACY_FACTORS = OFFER_FACTORS.filter((f) => f.legacy).map((f) => f.id);

/**
 * Ocena oferty: { u, parts: [{ id, w, v, part }] } (bez szumu). ctx: { trust = 50, only (lista id czynników) }.
 * Zawodnik bez klubu i kontraktu: wageRef z oczekiwanej pensji, czynniki bez danych dają 0.
 */
export function scoreOffer(p, o, ctx = {}) {
  const { traits: t } = personalityOf(p);
  const m = computeMindset(p, t, { clubForeign: !!o.foreign });
  const pr = elementPrefs(t, m.key, p);
  const home = homeRegionOf(p);
  const atHome = !!(home && o.region === home);
  const c = {
    t, trust: ctx.trust ?? 50, wageRef: Math.max(500, p.contract?.wage ?? p.askWage ?? 1000), home,
    // „Chce wrócić do domu”: oferta klubu z regionu rodzinnego dla zawodnika, który gra gdzie indziej (nie przy pozostaniu)
    homeMindset: atHome && !o.own && clubById(p.clubId)?.region !== home && computeMindset(p, t, { homeClub: true, clubForeign: !!o.foreign }).key === 'powrotDoDomu',
  };
  const only = ctx.only ? new Set(ctx.only) : null;
  let u = 0;
  const parts = [];
  for (const f of OFFER_FACTORS) {
    if (only && !only.has(f.id)) continue;
    const w = f.weight(p, t, pr, m, c);
    const v = f.value(p, o, c);
    let part = w * v;
    if (f.cap != null) part = clamp(part, -f.cap, f.cap);
    u += part;
    parts.push({ id: f.id, w, v, part });
  }
  return { u, parts };
}
