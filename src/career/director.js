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
import { clubById } from '../data/clubs_pl.js';
import { marketValue } from '../world/playerGen.js';
import { askingPriceMultiplier } from './reputation.js';

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

// ------------------------------------------------------------ Sprzeciw dyrektora wobec transakcji trenera

export const OBJ = {
  thr: 0.25, // próg: kupno o ponad 25 % drożej niż uczciwa cena, sprzedaż o ponad 25 % poniżej wartości
  p0: 0.1, slope: 1.4, pMax: 0.9, // szansa na progu 10 %, +14 pp na każde 10 % ponad próg, najwyżej 90 %
  kad: [0.5, 0.05], // x (0,5 + 0,05 KAD): KAD 1 x0,55, KAD 10 x1, KAD 20 x1,5 (najwyżej 95 %)
  // Renegocjacja: szansa 45 % + 3 pp na punkt NEG ponad 10 (15-80 %), zmiana kwoty 5-15 % (lepszy negocjator
  // bliżej 15 %), po porażce druga strona zostaje przy swojej kwocie, rzadko (8 %) wycofuje się z rozmów
  reneg: { base: 0.45, neg: 0.03, min: 0.15, max: 0.8, r: [0.05, 0.15], sd: 0.25, quit: 0.08 },
  trust: [[1, 3], [0.5, 2], [0, 1]], // nalegam: zaufanie zarządu -1, przy różnicy od 50 % -2, od 100 % -3
  log: 20, // historia sprzeciwów (game.board.requests.dirLog)
};

const roundFee = (x) => (x >= 100000 ? Math.round(x / 10000) * 10000 : Math.max(1000, Math.round(x / 1000) * 1000));

/**
 * Uczciwa cena zawodnika według dyrektora klubu gracza (jego wycena z błędem RYN, ten sam mechanizm co w klubach AI).
 * Kupno: cena, jakiej spodziewa się po klubie sprzedającym (wartość x 1,45 albo x 1,08 z listy, x reputacja), czyli
 * wzór ceny wywoławczej bez błędu sprzedającego; sprzedaż: wartość rynkowa w lidze klubu gracza. Bez cudzych ofert.
 */
export function directorFairPrice(game, p, kind = 'buy', date = game?.date) {
  const clubId = game.clubId;
  const err = rynMul(game, clubId, p.id, 'ocena');
  if (kind === 'sell') return roundFee(marketValue(p, { tier: clubById(clubId)?.tier ?? 1, date }) * err);
  const listed = game.market?.listed?.[p.id];
  const mul = listed ? (listed.kind === 'release' ? 0.4 : 1.08) : 1.45;
  return roundFee(marketValue(p, { tier: clubById(p.clubId)?.tier ?? 1, date }) * mul * askingPriceMultiplier(p.rep ?? 30) * err);
}

/** Różnica ceny wobec wyceny dyrektora: kupno fee / ref - 1 (przepłata), sprzedaż 1 - fee / ref (poniżej wartości). */
export const objectionGap = (kind, fee, ref) => (kind === 'buy' ? fee / ref - 1 : 1 - fee / ref);

/** Szansa sprzeciwu przy danej różnicy i atrybucie KAD (0 poniżej progu). */
export function objectionChance(gap, kad = 10) {
  if (!(gap > OBJ.thr)) return 0;
  return Math.min(0.95, clamp(OBJ.p0 + OBJ.slope * (gap - OBJ.thr), 0, OBJ.pMax) * (OBJ.kad[0] + OBJ.kad[1] * clamp(kad, 1, 20)));
}

/**
 * Czy dyrektor klubu gracza sprzeciwia się transakcji trenera. kind: 'buy' (kupno z odstępnym) | 'sell' (sprzedaż).
 * Jeden rzut na zawodnika, rodzaj i dyrektora w pół sezonu: szansa rośnie z różnicą, więc zmiana kwoty o złotówkę nie
 * losuje od nowa. Wakat i gra bez stanu sztabu: brak sprzeciwu (zostaje weto zarządu). Zwraca opis albo null.
 */
export function directorObjection(game, p, fee, kind = 'buy') {
  const clubId = game?.clubId;
  if (!p || !(fee > 0) || !clubId || !tracked(game, clubId)) return null;
  const d = directorOf(game, clubId);
  if (!d) return null;
  const ref = directorFairPrice(game, p, kind);
  const gap = objectionGap(kind, fee, ref);
  const chance = objectionChance(gap, directorAttr(game, clubId, 'KAD'));
  if (!chance) return null;
  const u = new Rng(`dyrektor-sprzeciw:${game.seed}:${kind}:${p.id}:${d.id}:${halfKeyOf(game.date)}`).next();
  if (u >= chance) return null;
  return { kind, pid: p.id, fee, ref, gap: Math.round(gap * 1000) / 1000, dir: d.id, name: d.name, date: game.date };
}

/** Tekst sprzeciwu (uzasadnienie dyrektora, bez cudzych ofert). zl: formatowanie kwot. */
export function objectionText(game, obj, zl) {
  const p = game.world?.players?.[obj.pid];
  const who = p?.name ?? 'zawodnik';
  const z = Math.round(obj.gap * 100);
  return obj.kind === 'buy'
    ? `Trenerze, według mnie ${who} jest wart ok. ${zl(obj.ref)}. Płacimy ${zl(obj.fee)}, czyli o ${z} % za dużo.`
    : `Trenerze, według mnie ${who} jest wart ok. ${zl(obj.ref)}. Sprzedajemy go za ${zl(obj.fee)}, czyli o ${z} % poniżej jego wartości.`;
}

/**
 * Renegocjacja dyrektora (Negocjacje + los): kupno niższe odstępne, sprzedaż wyższe, o 5-15 %. Zwraca
 * { ok: true, fee, r } albo { ok: false, quit } (quit: druga strona wycofuje się z rozmów).
 */
export function directorRenegotiate(game, obj) {
  const R = OBJ.reneg;
  const neg = directorAttr(game, game.clubId, 'NEG');
  const rng = new Rng(`dyrektor-renegocjacja:${game.seed}:${obj.kind}:${obj.pid}:${obj.fee}:${obj.dir}:${game.date}`);
  const chance = clamp(R.base + R.neg * (neg - 10), R.min, R.max);
  if (!rng.chance(chance)) return { ok: false, quit: rng.chance(R.quit), chance };
  const x = clamp(0.5 + R.neg * (neg - 10) + rng.gauss(0, R.sd), 0, 1);
  const r = R.r[0] + (R.r[1] - R.r[0]) * x;
  const fee = roundFee(obj.kind === 'buy' ? obj.fee * (1 - r) : obj.fee * (1 + r));
  return { ok: true, fee, r: Math.abs(fee / obj.fee - 1), chance };
}

/** Kara zaufania za „nalegam” (różnica od 50 %: -2, od 100 %: -3). */
export const insistPenalty = (gap) => OBJ.trust.find(([g]) => gap >= g)?.[1] ?? 1;

/**
 * Zapis sprzeciwu w historii zarządu (game.board.requests.dirLog, najnowsze pierwsze) i kara zaufania przy „nalegam”.
 * action: 'back' | 'reneg' | 'insist'. Zwraca { entry, dTrust }.
 */
export function logObjection(game, obj, action, { result = null, fee = obj.fee } = {}) {
  const B = game.board;
  let dTrust = 0;
  if (action === 'insist' && B) {
    dTrust = -insistPenalty(obj.gap);
    B.trust = Math.round(clamp((B.trust ?? 50) + dTrust, 0, 100));
  }
  const p = game.world?.players?.[obj.pid];
  const entry = { date: game.date, kind: obj.kind, pid: obj.pid, name: p?.name ?? obj.pid, fee, asked: obj.fee, ref: obj.ref, gap: obj.gap, dir: obj.name, action, result, trust: dTrust };
  if (B) {
    B.requests ??= {};
    const L = (B.requests.dirLog ??= []);
    L.unshift(entry); L.length = Math.min(L.length, OBJ.log);
  }
  return { entry, dTrust };
}
