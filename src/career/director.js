// Dyrektor sportowy: wpływ atrybutów na grę (docs/dyrektor-sportowy.md). Osoba, rynek i zmiany: staffMarket.js.
// Zasady: gracz i kluby AI te same; gracz negocjuje sam (dyrektor nie prowadzi za niego rozmów), oferty są tajne.
// Każdy atrybut działa jako odchylenie od 10 (10 = dawne zachowanie gry), wakat: 5 (obowiązki przejmuje zarząd).
// Gra bez stanu sztabu (narzędzia, testy bez świata): wszystkie efekty neutralne. Wszystkie liczby [SZAC].
//   NEG Negocjacje: clubNegotiation.js (rozmowy klubów AI).
//   RYN Znajomość rynku: kluby AI: błąd wyceny bez przesunięcia (cena wywoławcza sprzedającego, ocena ceny przez
//       kupującego); gracz: widełki pensji zawodnika w rozmowach (tylko informacja).
//   SIE Sieć kontaktów: szukanie klubu na wypożyczenie (czas i liczba propozycji), kolejność klubów AI na rynku.
//   KAD Zarządzanie kadrą i płacami: spór z trenerem rezerw, premie za podpis i prowizje w ofertach klubów AI.

import { Rng, clamp } from '../core/rng.js';
import { registerMailHook } from '../core/gameLoop.js';
import { directorOf, personAttr, STAFF_MARKET, halfKeyOf } from './staffMarket.js';

export const DIR = {
  // Widełki pensji dla gracza: połowa szerokości x (25 % przy RYN 1, 15 % przy 10, 6 % przy 20, liniowo pomiędzy);
  // środek = minimum x (1 + b), b ~ N(0; x / 1,645) obcięte do ±1,5x, więc minimum leży w przedziale w ok. 90 %
  // przypadków (obcięcie do ±x dawałoby prawie 100 %); ziarno: gra, zawodnik, dyrektor, okno 30 dni
  hint: { w1: 0.25, w10: 0.15, w20: 0.06, z: 1.645, trunc: 1.5, days: 30 },
  ryn: { s0: 0.2, s1: 0.15 }, // błąd wyceny klubu AI: s = 0,20 - 0,15 q, q = (RYN - 1) / 19
  sie: { step: 6, w: 0.025 }, // wypożyczenia: co 6 punktów od 10 jeden dzień i jedna propozycja; kolejność: exp(0,025 (SIE - 10)) (plan 0,04: najlepszy dyrektor +4,3 pp, kalibracja)
  kad: { esc: 0.015, fee: 0.1 }, // spór rezerw: +1,5 pp na punkt; premie i prowizje x (1 - 0,10 (KAD - 10) / 10)
};

/** Czy klub ma stan dyrektora (gra z rynkiem sztabu, klub z kadrą). */
const tracked = (game, clubId) => !!(game?.staff?.dirInit?.[clubId] && game.world?.clubs?.[clubId]);

/** Atrybut dyrektora klubu (adaptacja obcokrajowca obniża), wakat: 5, gra bez stanu sztabu: 10 (neutralnie). */
export function directorAttr(game, clubId, key) {
  if (!tracked(game, clubId)) return 10;
  const p = directorOf(game, clubId);
  return p ? personAttr(p, key, game.date) : STAFF_MARKET.vacantQ.dyrektor;
}

/** Podpis listów „Dyrektor sportowy” w klubie gracza: imię i nazwisko dyrektora, przy wakacie „Zarząd”. */
export function directorFrom(game) {
  const id = game?.clubId;
  if (!id || !tracked(game, id)) return 'Dyrektor sportowy';
  const p = directorOf(game, id);
  return p ? `${p.name}, dyrektor sportowy` : 'Zarząd';
}

/** Podmiot zdania w tekstach („Jan Kowalski szuka klubu”, przy wakacie „Zarząd szuka klubu”). */
export function directorWho(game) {
  const id = game?.clubId;
  if (!id || !tracked(game, id)) return 'Dyrektor sportowy';
  const p = directorOf(game, id);
  return p ? `Dyrektor sportowy ${p.name}` : 'Zarząd';
}

// Listy wysłane w systemach dnia z nadawcą „Dyrektor sportowy” dostają podpis dyrektora klubu gracza
registerMailHook((game, messages) => {
  if (!messages.some((m) => m?.from === 'Dyrektor sportowy')) return;
  const from = directorFrom(game);
  if (from === 'Dyrektor sportowy') return;
  for (const m of messages) if (m?.from === 'Dyrektor sportowy') m.from = from;
});

// ------------------------------------------------------------ RYN: widełki pensji dla gracza i błąd wyceny AI

/** Połowa szerokości widełek z atrybutu Znajomość rynku (1-20). */
export function hintHalfWidth(ryn) {
  const H = DIR.hint;
  const r = clamp(ryn ?? 10, 1, 20);
  return r <= 10 ? H.w1 + (H.w10 - H.w1) * (r - 1) / 9 : H.w10 + (H.w20 - H.w10) * (r - 10) / 10;
}

const dayNo = (date) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000);

/**
 * Podpowiedź dyrektora w rozmowach: „zawodnik zgodzi się prawdopodobnie przy lo-hi zł tygodniowo”.
 * min: minimum zawodnika z jego własnego żądania (bez cudzych ofert, negotiation.js hidden.minOwn). Tylko informacja,
 * bez wpływu na rozmowy. Zwraca { lo, hi, x, name (null przy wakacie), ryn } albo null (brak klubu, brak minimum).
 */
export function directorWageHint(game, { playerId, min, date = game?.date } = {}) {
  const clubId = game?.clubId;
  if (!clubId || !(min > 0) || !date) return null;
  const p = tracked(game, clubId) ? directorOf(game, clubId) : null;
  const ryn = directorAttr(game, clubId, 'RYN');
  const x = hintHalfWidth(ryn);
  const H = DIR.hint;
  const rng = new Rng(`dyrektor-widelki:${game.seed}:${playerId}:${p?.id ?? 'zarzad'}:${Math.floor(dayNo(date) / H.days)}`);
  const b = clamp(rng.gauss(0, x / H.z), -H.trunc * x, H.trunc * x);
  const c = min * (1 + b);
  return { lo: Math.max(100, Math.floor(c * (1 - x) / 100) * 100), hi: Math.ceil(c * (1 + x) / 100) * 100, x, name: p?.name ?? null, ryn };
}

/** Odchylenie błędu wyceny klubu z atrybutu Znajomość rynku: s = 0,20 - 0,15 q. Gra bez stanu sztabu: 0. */
export function rynSigma(game, clubId) {
  if (!tracked(game, clubId)) return 0;
  const q = (clamp(directorAttr(game, clubId, 'RYN'), 1, 20) - 1) / 19;
  return DIR.ryn.s0 - DIR.ryn.s1 * q;
}

/**
 * Mnożnik błędu wyceny (średnio 1, bez przesunięcia): exp(e - s²/2), e ~ N(0; s). Stały dla pary klub-zawodnik
 * w pół sezonu i dla danego dyrektora (nowy dyrektor = nowa ocena). kind: 'cena' (sprzedający) albo 'ocena' (kupujący).
 */
export function rynMul(game, clubId, playerId, kind = 'cena') {
  const s = rynSigma(game, clubId);
  if (!s) return 1;
  const d = directorOf(game, clubId)?.id ?? 'zarzad';
  const e = new Rng(`dyrektor-ryn:${kind}:${game.seed}:${clubId}:${playerId}:${d}:${halfKeyOf(game.date)}`).gauss(0, s);
  return Math.exp(e - (s * s) / 2);
}

// ------------------------------------------------------------ SIE: wypożyczenia i kolejność na rynku

/** Przesunięcie z sieci kontaktów: +1 od 16, -1 do 4 (co 6 punktów od 10). */
export const sieStep = (sie) => Math.trunc((clamp(sie ?? 10, 1, 20) - 10) / DIR.sie.step);

/** Waga klubu AI w kolejności zakupów (pierwszeństwo w spornych celach): exp(0,04 (SIE - 10)). */
export const sieWeight = (game, clubId) => Math.exp(DIR.sie.w * (directorAttr(game, clubId, 'SIE') - 10));

/**
 * Kolejność klubów z wagami (losowanie bez zwracania, szansa bycia pierwszym = waga / suma wag, czyli zero-sum).
 * Przy równych wagach to zwykłe tasowanie.
 */
export function weightedOrder(rng, items, weightOf) {
  return items.map((it) => ({ it, k: -Math.log(1 - rng.next()) / Math.max(1e-9, weightOf(it)) })).sort((a, b) => a.k - b.k).map((x) => x.it);
}

// ------------------------------------------------------------ KAD: rezerwy, premie i prowizje

/** Szansa dyrektora w sporze z trenerem rezerw: +1,5 pp na punkt Zarządzania kadrą ponad 10 (poniżej 10: mniej). */
export const kadEscalation = (game, clubId) => DIR.kad.esc * (directorAttr(game, clubId, 'KAD') - 10);

/** Mnożnik premii za podpis i prowizji w ofertach klubu AI: 1 - 0,10 (KAD - 10) / 10 (od 1,09 do 0,90). */
export const kadFeeMul = (game, clubId) => 1 - DIR.kad.fee * (directorAttr(game, clubId, 'KAD') - 10) / 10;
