// Pieniądze właściciela na sezon (Nov 24, 2026; konsultacja z ekspertem od finansów klubów, docs/finanse.md).
// Dopłata i skarbiec z danych klubu (src/data/finanse_klubow.js) są bazą, a od 2. sezonu właściciel daje bazę x M:
// M = 1 + nastrój (los z pamięcią) + wyniki + liga (awans, spadek) + puchary + ambicja, zacisk, sufit zasobności.
// Skarbiec (rezerwa) zmienia się o połowę tego co dopłata. Te same zasady dla gracza i klubów AI. Liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { ownerOf } from './owners.js';

export const OWNER_FUND = {
  sdBase: 0.08, sdTemp: 0.008, sdMin: 0.04, sdMax: 0.16, // los: porywczy właściciel daje mniej przewidywalnie
  memory: 0.5, // nastrój właściciela: połowa zeszłorocznego przechodzi na kolejny sezon (passa 2-3 sezony)
  result: { above: 0.08, met: 0.04, missed: -0.06, disaster: -0.1 }, // wynik wobec oczekiwanego miejsca
  ambition: 0.006, // ambitny dokłada więcej (po porażce tylko przy zasobności > 8)
  promoted: 0.2, relegated: { prywatny: -0.1, miliarder: -0.1, spolka: -0.15, miasto: -0.1, klub: -0.1 },
  poorRelegated: -0.08, // dodatkowo przy zasobności <= 8: biedny właściciel po spadku częściej się wycofuje
  europe: 0.05, // klub w pucharach europejskich
  clamp: [0.75, 1.3], billionaireMax: 1.5, cityMax: 1.15,
  cityCrisis: { p: 0.05, hit: -0.15 }, // kryzys budżetu miasta
  cityGrowth: 0.05, // miasto po przejęciu klubu (src/career/ownership.js): dopłata rośnie najwyżej o 5 % na rok
  wealthCap: [[5, 1.0], [8, 1.1], [12, 1.2]], // zasobność <= 5: najwyżej 1,0 (nie ma z czego dołożyć)
  skarbiecShare: 0.5,
};

/**
 * Wynik sezonu wobec oczekiwań: miejsce w tabeli wobec miejsca z siły klubu w tej tabeli (ułamek tabeli).
 * table: identyfikatory klubów w kolejności końcowej; strength: id -> siła (L). Zwraca 'above'|'met'|'missed'|'disaster'.
 */
export function seasonVerdict(clubId, table, strength) {
  const n = table?.length ?? 0;
  const pos = n ? table.indexOf(clubId) : -1;
  if (pos < 0) return 'met';
  const exp = [...table].sort((a, b) => (strength(b) ?? 0) - (strength(a) ?? 0)).indexOf(clubId);
  const d = (exp - pos) / n; // dodatnie: wyżej niż oczekiwano
  return d >= 0.2 ? 'above' : d >= -0.1 ? 'met' : d >= -0.3 ? 'missed' : 'disaster';
}

/**
 * Mnożnik pieniędzy właściciela na nowy sezon. ctx: { verdict, promoted, relegated, europe, year }.
 * Zapisuje nastrój w game.ownerMood[clubId]. Zwraca { mul, skarbiecMul, why: [opisy] }.
 */
export function ownerSeasonMul(game, clubId, ctx) {
  const o = ownerOf(game, clubId);
  if (!o) return { mul: 1, skarbiecMul: 1, why: [] };
  const F = OWNER_FUND;
  const rng = new Rng(`wlasciciel-sezon:${game.seed}:${clubId}:${ctx.year}`);
  const city = o.type === 'miasto';
  const sd = clamp(F.sdBase + F.sdTemp * ((o.temperament ?? 10) - 10), F.sdMin, F.sdMax) * (city ? 0.5 : 1);
  const moods = (game.ownerMood ??= {});
  const mood = Math.round((F.memory * (moods[clubId] ?? 0) + rng.gauss(0, sd)) * 1000) / 1000;
  moods[clubId] = mood;
  const why = [];
  let m = 1 + mood;
  if (!city) {
    const r = F.result[ctx.verdict] ?? 0;
    m += r;
    if (r > 0) why.push('wynik sezonu powyżej oczekiwań');
    else if (r < 0) why.push(ctx.verdict === 'disaster' ? 'sezon dużo poniżej oczekiwań' : 'sezon poniżej oczekiwań');
    const amb = F.ambition * ((o.ambicja ?? 10) - 10);
    if (amb > 0 && (r >= 0 || (o.zasobnosc ?? 10) > 8)) { m += amb; if (amb >= 0.03) why.push('ambicje właściciela'); }
    else if (amb < 0) m += amb;
  }
  if (ctx.promoted) { m += F.promoted; why.push('awans'); }
  if (ctx.relegated) {
    m += F.relegated[o.type] ?? -0.1;
    if ((o.zasobnosc ?? 10) <= 8 && !city) m += F.poorRelegated;
    why.push('spadek');
  }
  if (ctx.europe) { m += F.europe; why.push('puchary europejskie'); }
  let crisis = false;
  if (city && rng.chance(F.cityCrisis.p)) { m += F.cityCrisis.hit; why.push('cięcia w budżecie miasta'); crisis = true; }
  if (Math.abs(mood) >= 0.08) why.push(mood > 0 ? 'dobry nastrój właściciela' : 'właściciel ostrożniej wydaje');
  let hi = o.type === 'miliarder' ? F.billionaireMax : city ? F.cityMax : F.clamp[1];
  const ov = game.ownerOverride?.[clubId];
  if (city && ov?.type === 'miasto' && ov.since) hi = Math.max(F.clamp[0], Math.min(hi, 1 + F.cityGrowth * Math.max(0, ctx.year - ov.since)));
  m = clamp(m, F.clamp[0], hi);
  for (const [w, cap] of F.wealthCap) if ((o.zasobnosc ?? 10) <= w) { m = Math.min(m, cap); break; }
  const mul = Math.round(m * 100) / 100;
  return { mul, skarbiecMul: Math.round((1 + F.skarbiecShare * (mul - 1)) * 100) / 100, why, crisis };
}
