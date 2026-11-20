// Skauting zagraniczny (docs/skauting.md): skauci jadą za granicę po kandydatów o zadanym profilu.
// Stan: game.scoutOps (game.scouting zajmuje analiza rywali, src/training/scouting.js).
// - Skauci to osoby sztabu (game.staff.people, rola skaut) z 5 atrybutami (DOS doświadczenie, OCE ocena zawodnika,
//   RYN wiedza o rynku, SIE sieć kontaktów, CHA ocena charakteru) i regionami p.reg (src/career/scoutRegions.js).
// - Lista ok. 50 wolnych skautów (scoutOps.pool), odświeżana 1 lipca i 1 stycznia z nierównym miksem regionów;
//   każdego można zatrudnić na stałe (oferta jak w sztabie) albo wziąć na jedną misję (opłata z góry i prowizja).
// - Misja: region, pozycja, wiek, poziom względem kadry, kwota i pensja, status, 1-6 tygodni. Skaut klubu jest w tym
//   czasie nieobecny w sztabie (syncStaff), potem odpoczywa (1 dzień na tydzień wyjazdu).
// - Wynik: dopiero po powrocie gra losuje zdarzenia i kandydatów (0-7) wokół profilu; raport z błędem zależnym od
//   skauta (wydmuszki). Kandydaci są prawdziwymi zawodnikami z puli zagranicznej (p.scout), 14 dni wyłączności
//   zlecającego, potem mogą zniknąć (45 % podpisuje gdzie indziej, 35 % schodzi z rynku, 20 % zostaje na rynku).
// - Kluby AI: te same wzory (parytet), jedna misja na okno z szansą zależną od ligi.
// Wszystkie liczby [SZAC] (kalibracja: tools/scoutsim.mjs).

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { clubById, CLUBS_PL } from '../data/clubs_pl.js';
import { DOMESTIC } from '../config/calendar2026.js';
import { NAT_NAMES, randomName, hasNamePool } from '../data/names.js';
import { ATTRS, OFF } from '../data/attributes.js';
import { SQUAD_LAYOUT, squadOf } from '../world/worldGen.js';
import { marketValue } from '../world/playerGen.js';
import { attrsAround } from '../training/staff.js';
import { daysBetween } from '../training/state.js';
import { SCOUT_REGIONS, SCOUT_REGION, SCOUT_REGION_KEYS, scoutRegionsFor, regionBand, bestRegion, REGION_POPULARITY } from './scoutRegions.js';
import { ensureStaff, rosterOf, syncStaff, expectedWage, makeOffer, fireStaff, checkOffer, roleCap, staffLimit } from './staffMarket.js';
import { book, spendable, wageRoom } from './finance.js';
import { clubReputation } from './reputation.js';
import { genPoolPlayerFor, foreignAskingPrice, poolClubLabel, genericClub, POOL } from './foreignPool.js';
import { marketWage } from './negotiation.js';
import { hasOpenDeal } from './transferDeals.js';
import { playerWillingness } from './transfers.js';
import { acclimPlan } from './acclimatization.js';
import { GROUP } from './squad.js';
import { fmtDate } from '../ui/dom.js';

export { SCOUT_REGIONS };

/** Liczby skautingu [SZAC] (docs/skauting.md). */
export const SCOUT = {
  weeks: [1, 2, 4, 6],
  T: { 1: 0.17, 2: 0.55, 4: 0.85, 6: 1.0 }, // faktor wyjazdu: krótki wyjazd to mało obejrzanych meczów (kalibracja: 1 tydzień 0,17)
  lambda: 6.0, dMul: 0.6, shape: 3, maxN: 7, // lambda = 6 s T (1 - 0,6 D); liczba ~ Poisson z rozrzutem (Gamma, kształt 3)
  ev: { zaulek: 0.09, mecz: 0.18, agent: 0.15, uraz: 0.10, short: 0.5 }, // zdarzenia na tydzień (1 tydzień: połowa)
  sW: { dos: 0.30, reg: 0.40, sie: 0.15, oce: 0.15 }, // wagi skuteczności s (region ważniejszy niż w projekcie: ekspert wyraźnie przed siecią kontaktów)
  restPerWeek: 1, cancelDays: 2, refund: 0.5,
  freeShare: 0.5, // szansa, że kandydat jest wolny (decyzja właściciela Nov 20, 2026: losowo, bez wyboru w zleceniu) [SZAC]
  excl: 14, valid: { free: 28, contract: 42 }, validMax: 98, afterWindow: 14, freeze: 7,
  outcome: { signed: 0.45, gone: 0.35 }, // reszta (20 %): zwykły rynek
  repeatDays: 14, satDays: 56, satMul: 0.7, maxActive: 3, tries: 12,
  pool: { size: 50, idle: 60, leave: 0.25, specialists: 2, qMean: 9, qSd: 4, qMin: 3, qMax: 19, gamma: 0.7, homeNat: 0.7 },
  fee: { mul: 1.6, low: 1.3 }, // opłata freelancera: 1,6 pensji miesięcznej na 4,3 tygodnia; klub poniżej progu renomy x1,3
  comm: { min: 3, max: 8 }, // prowizja freelancera w % kwoty transferu (wolny: ryczałt 3 tygodniówki x c / 5 %)
  rep: { permQ: 15, eliteQ: 16, eliteRep: 45, freeGap: 20 }, // renoma: q 15+ na stałe od progu 4,5 q - 2; elita od 45
  ai: { chance: { 1: 0.35, 2: 0.20, 3: 0.05 }, minQ: 8, weeks: 4, ageFrom: 20, ageTo: 29 },
  keepMissions: 30, keepCands: 60,
};
export const SCOUT_LEVELS = { starter: 'Do składu', wzmocnienie: 'Wzmocnienie', perspektywa: 'Perspektywa' };
export const SCOUT_POSITIONS = ['BR', 'ŚO', 'BO', 'WB', 'DP', 'ŚP', 'OP', 'BP', 'SN', 'NAP'];
const CONTRACTS = ['free', 'contract', 'any'];
const LC = { DOS: 'dos', OCE: 'oce', RYN: 'ryn', SIE: 'sie', CHA: 'cha' };

const r100 = (v) => Math.round(v / 100) * 100;
const r10k = (v) => Math.max(0, Math.round(v / 10000) * 10000);
const fmtK = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace('.', ',')} mln zł` : `${Math.round(v / 1000).toLocaleString('pl-PL')} tys. zł`);
const isMonday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay() === 1;
const seasonKey = (date) => { const y = +date.slice(0, 4); return String(+date.slice(5, 7) >= 7 ? y : y - 1); };
const tierOf = (clubId) => clubById(clubId)?.tier ?? 4;
const A = (p, k) => p?.a?.[k] ?? p?.q ?? 10;
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// ------------------------------------------------------------ Wzory (czyste)

/**
 * Indeksy skauta w regionie: K znajomość regionu, R efektywna znajomość (sieć kontaktów częściowo zastępuje region),
 * s skuteczność wyjazdu, k trafność profilu kandydatów, a dokładność raportu (wszystko 0-1 poza K i R).
 */
export function scoutIndex(p, region) {
  const K = p?.reg?.[region] ?? 0;
  const sie = A(p, 'SIE');
  const R = clamp(Math.max(K, 0.65 * sie) + (K > 0 ? 0.1 * sie : 0), 0, 20);
  const w = SCOUT.sW;
  const s = (w.dos * A(p, 'DOS') + w.reg * R + w.sie * sie + w.oce * A(p, 'OCE')) / 20;
  const k = (0.4 * A(p, 'OCE') + 0.3 * R + 0.3 * A(p, 'DOS')) / 20;
  const a = (0.5 * A(p, 'OCE') + 0.5 * R) / 20;
  return { K, R, s, k, a };
}

/** Oczekiwana liczba kandydatów: 6 s T (1 - 0,6 D), nasycenie regionu x0,7. */
export const missionLambda = (s, weeks, D, sat = false) => SCOUT.lambda * s * (SCOUT.T[weeks] ?? 0.5) * (1 - SCOUT.dMul * D) * (sat ? SCOUT.satMul : 1);

/** Gamma(kształt) metodą Marsaglii i Tsanga (kształt < 1: wzmocnienie potęgą jednostajnej). */
export function gammaSample(rng, shape) {
  if (shape < 1) { let u = 0; while (u === 0) u = rng.next(); return gammaSample(rng, shape + 1) * u ** (1 / shape); }
  const d = shape - 1 / 3; const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 100; i++) {
    let x; let v;
    do { x = rng.gauss(0, 1); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng.next();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return shape;
}

/** Liczba kandydatów przed zdarzeniami: Poisson z rozrzutem (Gamma), więc słaby skaut często wraca bez nikogo. */
export function drawCount(rng, lambda) {
  if (lambda <= 0) return 0;
  const g = gammaSample(rng, SCOUT.shape) / SCOUT.shape;
  return rng.poisson(lambda * g);
}

/** Szansa co najmniej jednego kandydata (do podpowiedzi zlecenia): 1 - (1 + lambda / kształt)^-kształt. */
export const chanceAny = (lambda) => (lambda <= 0 ? 0 : 1 - (1 + lambda / SCOUT.shape) ** -SCOUT.shape);

/** Średni wpływ zdarzeń na liczbę kandydatów na tydzień (mecz +1, agent +1, ślepy zaułek -2). */
const evMean = (weeks) => weeks * (weeks === 1 ? SCOUT.ev.short : 1) * (SCOUT.ev.mecz + SCOUT.ev.agent - 2 * SCOUT.ev.zaulek);

/** Prowizja freelancera w %: 3 % przy q 8 do 8 % przy q 20 (krok 0,5). */
export const commissionPct = (q) => clamp(Math.round((3 + 5 * (q - 8) / 12) * 2) / 2, SCOUT.comm.min, SCOUT.comm.max);

/** Próg renomy klubu dla skauta na stałe: 4,5 q - 2 (jak przy sztabie). */
const repNeed = (q) => 4.5 * q - 2;

/**
 * Opłata freelancera za misję (bez kosztów podróży): 1,6 x pensja / 4,3 x tygodnie x premia regionu;
 * klub poniżej progu renomy (o 20 niższego niż na stałe) płaci x1,3.
 */
export function freelanceFee(game, p, weeks, clubId = game.clubId) {
  const w = expectedWage(p, game.date);
  const low = clubRep(clubId) < repNeed(p.q) - SCOUT.rep.freeGap;
  return r100(SCOUT.fee.mul * w * weeks / 4.3 * (low ? SCOUT.fee.low : 1));
}

const clubRep = (clubId) => { const c = clubById(clubId); return c ? clubReputation(c) : 20; };

// ------------------------------------------------------------ Stan

/** Leniwa inicjalizacja game.scoutOps (stary zapis: raz, lista wolnych skautów z dnia wczytania). */
export function ensureScoutOps(game) {
  if (!game?.world) return null;
  if (!game.staff) ensureStaff(game);
  if (!game.staff) return null;
  let S = game.scoutOps;
  if (!S || S.v !== 1) S = game.scoutOps = { v: 1, seq: 0, pool: [], refresh: null, missions: [], cands: {}, aiIdx: {}, ai: {}, stats: {}, outbox: [] };
  S.cands ??= {}; S.aiIdx ??= {}; S.ai ??= {}; S.stats ??= {}; S.outbox ??= []; S.missions ??= [];
  if (!S.refresh) refreshScoutPool(game, game.date ?? '2026-07-01', { initial: true });
  return S;
}

function statsOf(game, date) {
  const S = game.scoutOps;
  const k = seasonKey(date);
  if (!S.stats[k]) {
    S.stats[k] = { user: { missions: 0, cands: 0, empty: 0, trips: 0, commissions: 0, signed: 0, busts: 0 }, ai: { missions: 0, cands: 0, empty: 0, signed: 0, busts: 0 } };
    const ks = Object.keys(S.stats).sort();
    for (const old of ks.slice(0, Math.max(0, ks.length - 10))) delete S.stats[old];
  }
  return S.stats[k];
}
const side = (game, clubId) => (clubId && clubId === game.clubId ? 'user' : 'ai');

// ------------------------------------------------------------ Lista wolnych skautów

/** Nowy wolny skaut (osoba sztabu w game.staff.people, poza pulą sztabu). */
function makeFreeScout(game, rng, date, weights, { specialist = false, initial = false } = {}) {
  const St = game.staff;
  St.seq = (St.seq ?? 0) + 1;
  const id = `st:${St.seq}`;
  const P = SCOUT.pool;
  const q = clamp(Math.round(rng.gauss(P.qMean, P.qSd)), P.qMin, P.qMax);
  const region = rng.weighted(SCOUT_REGION_KEYS, (k) => (weights[k] ?? 1) * (REGION_POPULARITY[k] ?? 1));
  const R = SCOUT_REGION[region];
  const natRegion = R.nats.filter(hasNamePool);
  const nat = rng.chance(P.homeNat) && natRegion.length ? rng.weighted(natRegion, (n) => R.w[n]) : 'POL';
  const nm = randomName(nat, rng);
  const age = rng.int(30, 64);
  const p = { id, name: `${nm.first} ${nm.last}`, nat, age, role: 'skaut', q, a: attrsAround(q, 'skaut', `${game.seed}:${id}`), wage: 0, until: null, since: null, club: null, free: addDays(date, -rng.int(0, initial ? 150 : 30)), coach: null, adapt: null, pl: nat === 'POL', lead: false, demoted: null, hist: [], scoutPool: true };
  const regRng = new Rng(`skaut-regiony:${game.seed}:${id}`);
  // Region z miksu odświeżenia jest najlepszym regionem skauta; specjalista zna go na 17-19
  const reg = scoutRegionsFor({ nat, q }, `${game.seed}:${id}`, { rng: regRng, weights, best: specialist ? regRng.int(17, 19) : undefined });
  const top = bestRegion(reg);
  if (top && top[0] !== region && !reg[region]) { reg[region] = top[1]; delete reg[top[0]]; }
  else if (top && top[0] !== region) { const v = reg[region]; reg[region] = top[1]; reg[top[0]] = v; }
  p.reg = reg;
  St.people[id] = p;
  return p;
}

/**
 * Odświeżenie listy wolnych skautów (1 lipca, 1 stycznia; start gry): zatrudnieni znikają z listy, część wolnych od
 * 60+ dni odchodzi (25 %), lista wraca do 50 osób. Miks regionów nowych osób: waga regionu x Gamma(0,7) z ziarna
 * odświeżenia, więc raz przychodzi wielu ekspertów od Bałkanów, raz od Ameryki Południowej. Dwóch to specjaliści.
 */
export function refreshScoutPool(game, date, { initial = false } = {}) {
  const S = game.scoutOps; const St = game.staff;
  const rng = new Rng(`skauci:${game.seed}:${date}`);
  const busy = new Set(S.missions.filter((m) => m.status === 'w toku').map((m) => m.scoutId));
  const keep = [];
  for (const id of S.pool) {
    const p = St.people[id];
    if (!p || p.club || p.role !== 'skaut') continue;
    const idle = p.free ? daysBetween(p.free, date) : 999;
    const pending = St.decide?.[id] || St.offers?.some((o) => o.pid === id) || busy.has(id);
    if (!initial && !pending && idle >= SCOUT.pool.idle && rng.chance(SCOUT.pool.leave)) { delete St.people[id]; continue; }
    keep.push(id);
  }
  S.pool = keep;
  const weights = Object.fromEntries(SCOUT_REGION_KEYS.map((k) => [k, gammaSample(rng, SCOUT.pool.gamma)]));
  let n = 0;
  while (S.pool.length < SCOUT.pool.size) {
    const p = makeFreeScout(game, rng, date, weights, { specialist: n < SCOUT.pool.specialists, initial });
    S.pool.push(p.id); n++;
  }
  S.refresh = date;
  S.mix = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, Math.round(v * 100) / 100]));
}

/** Wolni skauci: lista skautingu i wolni skauci z puli sztabu. */
function freeScoutPeople(game) {
  const S = game.scoutOps; const St = game.staff;
  const ids = new Set([...S.pool, ...(St.pool ?? [])]);
  const out = [];
  for (const id of ids) {
    const p = St.people[id];
    if (p && !p.club && p.role === 'skaut') { if (!p.reg) p.reg = scoutRegionsFor(p, `${game.seed}:${p.id}`); out.push(p); }
  }
  return out;
}

/** Skauci klubu (z regionami). */
export function clubScouts(game, clubId) {
  return rosterOf(game, clubId).filter((p) => p.role === 'skaut').map((p) => { if (!p.reg) p.reg = scoutRegionsFor(p, `${game.seed}:${p.id}`); return p; });
}

const activeMissions = (game, clubId) => game.scoutOps.missions.filter((m) => m.status === 'w toku' && (clubId == null || m.club === clubId));

// ------------------------------------------------------------ Profil zlecenia

/** Cel zlecenia z kadry klubu: { ovr, pot, best } (starter: mediana pierwszej jedenastki na pozycji, wzmocnienie: najlepszy + 0,5, perspektywa: najlepszy - 1,5 z potencjałem najlepszy + 1). */
export function missionTarget(game, clubId, pos, level) {
  const sq = squadOf(game.world, clubId);
  const xi = [...sq].sort((a, b) => b.ovr - a.ovr).slice(0, 11);
  const xiMed = xi.length ? xi[Math.floor(xi.length / 2)].ovr : tierL(clubId);
  const at = sq.filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr);
  const best = at[0]?.ovr ?? xiMed - 0.5;
  const inXi = xi.filter((p) => p.pos === pos).map((p) => p.ovr);
  const starter = inXi.length ? inXi[Math.floor((inXi.length - 1) / 2)] : best - 0.3;
  if (level === 'wzmocnienie') return { ovr: best + 0.5, pot: null, best };
  if (level === 'perspektywa') return { ovr: best - 1.5, pot: best + 1, best };
  return { ovr: starter, pot: null, best };
}
const tierL = (clubId) => ({ 1: 11, 2: 10, 3: 9.2, 4: 8 })[tierOf(clubId)] ?? 9;

/** Wartość typowego zawodnika celu (cena do porównania z maksymalną kwotą). */
function targetValue(game, ovr, age, pot) {
  const until = `${+game.date.slice(0, 4) + 2}-06-30`;
  return marketValue({ ovr, age, hidden: { POT: pot ?? ovr }, contract: { until } }, { tier: 1, date: game.date }) * 1.2;
}

/** Oczekiwana pensja tygodniowa kandydata w Polsce (wolny: żądanie, z kontraktem: więcej niż za granicą). */
export function candidateWage(p) {
  if (p.free) return p.askWage ?? marketWage(p.ovr, 1, true, 1);
  return r100(Math.max((p.contract?.wage ?? 0) * 1.15, marketWage(p.ovr, 1, true, 1) * 0.8));
}

/**
 * Trudność profilu D (0-0,95): poziom ponad medianę regionu, kwota poniżej wartości celu, pensja poniżej rynku,
 * młody z potencjałem, kontrakt (kontakty z klubami) albo wolny (łatwiej).
 */
export function missionDifficulty(game, order, target) {
  const R = SCOUT_REGION[order.region];
  const c = effCenter(target.ovr, R);
  const age = Math.round((order.ageFrom + order.ageTo) / 2);
  let D = 0.2 + 0.25 * clamp(c - R.Lmed, -1.5, 4) / 1.5;
  if (order.contract !== 'free' && order.maxFee > 0) {
    const v = targetValue(game, c, age, target.pot);
    if (order.maxFee < v) D += 0.3 * (1 - order.maxFee / v);
  }
  const w = marketWage(c, 1, true, 1) * 0.85;
  if (order.maxWage > 0 && order.maxWage < w) D += 0.2 * (1 - order.maxWage / w);
  if (order.level === 'perspektywa' || order.ageTo <= 21) D += 0.15;
  if (order.contract === 'contract') D += 0.1;
  if (order.contract === 'free') D -= 0.05;
  return clamp(D, 0, 0.95);
}

/** Środek poziomu kandydatów: powyżej szczytu regionu tylko częściowo (region nie ma lepszych do ściągnięcia). */
const effCenter = (c, R) => (c > R.Lmax ? R.Lmax + 0.3 * (c - R.Lmax) : c);

/** Normalizacja zlecenia z UI (liczby, granice). */
export function normalizeOrder(o = {}) {
  const ageFrom = clamp(Math.round(Number(o.ageFrom) || 18), 16, 38);
  let ageTo = clamp(Math.round(Number(o.ageTo) || 30), 16, 38);
  const level = SCOUT_LEVELS[o.level] ? o.level : 'starter';
  if (level === 'perspektywa') ageTo = Math.min(ageTo, 21);
  return {
    scoutId: o.scoutId ?? null, freeScoutId: o.freeScoutId ?? null, region: o.region, pos: o.pos, ageFrom, ageTo: Math.max(ageFrom, ageTo), level,
    maxFee: Math.max(0, Math.round(Number(o.maxFee) || 0)), maxWage: Math.max(0, Math.round(Number(o.maxWage) || 0)),
    contract: 'any', /* bez wyboru wolny albo z kontraktem (decyzja właściciela) */ weeks: SCOUT.weeks.includes(Number(o.weeks)) ? Number(o.weeks) : null,
  };
}
const orderKey = (o) => [o.region, o.pos, o.ageFrom, o.ageTo, o.level, o.contract].join('|');

/** Koszt wyjazdu (start + tygodnie x podróż regionu), bez opłaty freelancera. */
export const travelCost = (region, weeks) => (SCOUT_REGION[region] ? SCOUT_REGION[region].start + weeks * SCOUT_REGION[region].travel : 0);

// ------------------------------------------------------------ Zlecenie: wycena i start

/** Skaut zlecenia: { p, freelance } albo { error }. */
function scoutFor(game, order, clubId) {
  const St = game.staff;
  if (order.freeScoutId) {
    const p = St.people[order.freeScoutId];
    if (!p || p.role !== 'skaut' || p.club) return { error: 'Tego skauta nie ma już na liście wolnych.' };
    return { p, freelance: true };
  }
  const p = St.people[order.scoutId];
  if (!p || p.role !== 'skaut' || p.club !== clubId) return { error: 'Wybierz skauta z klubu albo wolnego skauta na zlecenie.' };
  return { p, freelance: false };
}

/** Powód, dla którego skaut nie może wyjechać (albo null). */
function scoutBusy(game, p, date) {
  if (p.mission) return `${p.name} jest w podróży do ${fmtDate(p.away ?? date)}.`;
  if (p.busyUntil && p.busyUntil > date) return `${p.name} odpoczywa po wyjeździe do ${fmtDate(p.busyUntil)}.`;
  return null;
}

/** Elita (q 16+) nie pracuje dla klubów z renomą poniżej 45. */
const eliteRefuses = (p, clubId) => p.q >= SCOUT.rep.eliteQ && clubRep(clubId) < SCOUT.rep.eliteRep;

/** Pełna wycena zlecenia (wspólna dla gracza i AI): { ok, text, cost, fee, returnDate, chance, expected, reasons, calc }. */
function quote(game, raw, clubId, { ai = false } = {}) {
  const S = game.scoutOps; const date = game.date;
  const o = normalizeOrder(raw);
  const fail = (text, extra = {}) => ({ ok: false, text, cost: extra.cost ?? 0, returnDate: extra.returnDate ?? null, chance: extra.chance ?? 'niska', expected: extra.expected ?? 0, reasons: extra.reasons ?? [], order: o });
  if (!SCOUT_REGION[o.region]) return fail('Wybierz region.');
  if (!SCOUT_POSITIONS.includes(o.pos)) return fail('Wybierz pozycję.');
  if (!o.weeks) return fail('Wybierz czas wyjazdu: 1, 2, 4 albo 6 tygodni.');
  if (!clubById(clubId) || !game.world.clubs[clubId]) return fail('Brak klubu.');
  const who = scoutFor(game, o, clubId);
  if (who.error) return fail(who.error);
  const { p, freelance } = who;
  const R = SCOUT_REGION[o.region];
  const fee = freelance ? freelanceFee(game, p, o.weeks, clubId) : 0;
  const cost = travelCost(o.region, o.weeks) + fee;
  const returnDate = addDays(date, 7 * o.weeks);
  const ix = scoutIndex(p, o.region);
  const target = missionTarget(game, clubId, o.pos, o.level);
  const D = missionDifficulty(game, o, target);
  const sat = S.missions.some((m) => m.club === clubId && m.region === o.region && m.pos === o.pos && m.status !== 'odwołana' && daysBetween(m.start, date) < SCOUT.satDays);
  const lambda = missionLambda(ix.s, o.weeks, D, sat);
  const lamEv = Math.max(0, lambda + evMean(o.weeks));
  const pAny = chanceAny(lamEv);
  const chance = pAny >= 0.75 ? 'wysoka' : pAny >= 0.45 ? 'średnia' : 'niska';
  const expected = Math.round(Math.min(SCOUT.maxN, lamEv));
  const reasons = [];
  if (ix.K >= 15) reasons.push('skaut jest ekspertem od tego regionu');
  else if (ix.K === 0) reasons.push(A(p, 'SIE') >= 14 ? 'region poza wiedzą skauta, pomoże sieć kontaktów' : 'region poza wiedzą skauta, słabsza skuteczność');
  else if (ix.K < 10) reasons.push('skaut zna region tylko podstawowo');
  if (o.weeks === 1) reasons.push('krótki wyjazd: mało obejrzanych meczów');
  if (D >= 0.6) reasons.push(o.level === 'perspektywa' || o.ageTo <= 21 ? 'młody, dobry i tani to rzadki profil' : 'trudny profil: wysoki poziom za niewielkie pieniądze');
  else if (effCenter(target.ovr, R) < target.ovr - 0.2) reasons.push('w tym regionie rzadko są zawodnicy na taki poziom');
  if (sat) reasons.push('ten region i pozycja były niedawno przeszukane');
  if (A(p, 'DOS') <= 7) reasons.push('mało doświadczony skaut');
  const base = { cost, fee, returnDate, chance, expected, reasons: reasons.slice(0, 3), order: o, calc: { ...ix, D, lambda, sat, target, cEff: effCenter(target.ovr, R) }, p, freelance };
  // Warunki (gracz i AI)
  const busy = scoutBusy(game, p, date);
  if (busy) return { ...fail(busy, base), calc: base.calc };
  if (eliteRefuses(p, clubId)) return fail(`${p.name} pracuje tylko dla klubów z większą renomą.`, base);
  const act = activeMissions(game, clubId);
  if (!ai) {
    const own = clubScouts(game, clubId).length;
    const cap = Math.min(SCOUT.maxActive, own + 1);
    if (act.length >= cap) return fail(`Najwięcej misji naraz: ${cap} (skauci klubu i jeden na zlecenie).`, base);
    if (freelance && act.some((m) => m.freelance)) return fail('Jedna misja na zlecenie naraz. Poczekaj na powrót skauta.', base);
    const k = orderKey(o);
    const twin = S.missions.find((m) => m.club === clubId && m.key === k && m.status !== 'odwołana' && daysBetween(m.start, date) < SCOUT.repeatDays);
    if (twin) return fail(`Takie samo zlecenie było ${fmtDate(twin.start)}. Powtórzysz je po 14 dniach.`, base);
  }
  if (o.ageTo < o.ageFrom) return fail('Wiek od musi być mniejszy niż wiek do.', base);
  const c = game.finance?.clubs?.[clubId];
  if (c && c.balance < cost) return fail('Saldo klubu nie pokryje kosztów wyjazdu.', base);
  return { ...base, ok: true, text: `Wyjazd możliwy: ${fmtK(cost)}, powrót ${fmtDate(returnDate)}.` };
}

/** Podgląd zlecenia gracza: { ok, text, cost, returnDate, chance, expected, reasons }. */
export function missionQuote(game, order) {
  if (!ensureScoutOps(game)) return { ok: false, text: 'Brak danych gry.', cost: 0, returnDate: null, chance: 'niska', expected: 0, reasons: [] };
  const q = quote(game, order ?? {}, game.clubId);
  return { ok: q.ok, text: q.text, cost: q.cost, returnDate: q.returnDate, chance: q.chance, expected: q.expected, reasons: q.reasons };
}

/** Utworzenie misji z wyceny (gracz i AI). */
function createMission(game, q, clubId) {
  const S = game.scoutOps; const date = game.date;
  const { p, freelance, order: o, calc } = q;
  S.seq++;
  const id = `m${S.seq}`;
  const end = addDays(date, 7 * o.weeks);
  const m = {
    id, club: clubId, scoutId: p.id, scoutName: p.name, freelance, region: o.region, pos: o.pos, ageFrom: o.ageFrom, ageTo: o.ageTo,
    level: o.level, maxFee: o.maxFee, maxWage: o.maxWage, contract: o.contract, weeks: o.weeks, start: date, end, status: 'w toku',
    cost: q.cost, fee: q.fee, pct: freelance ? commissionPct(p.q) : null, key: orderKey(o),
    calc: { s: r3(calc.s), k: r3(calc.k), a: r3(calc.a), R: r3(calc.R), K: calc.K, D: r3(calc.D), lambda: r3(calc.lambda), sat: calc.sat, c: r3(calc.cEff), pot: calc.target.pot != null ? r3(calc.target.pot) : null },
    events: [{ date, kind: 'wyjazd', text: `Wyjazd: ${SCOUT_REGION[o.region].label}.` }], result: null,
  };
  S.missions.push(m);
  p.mission = id; p.away = end; p.busyUntil = addDays(end, SCOUT.restPerWeek * o.weeks);
  if (!freelance) syncStaff(game, clubId, date); // skaut klubu nieobecny w sztabie
  if (q.cost) book(game.finance, clubId, date, 'out', 'scouts', q.cost, `Wyjazd skauta: ${SCOUT_REGION[o.region].label} (${p.name})`);
  const st = statsOf(game, date)[side(game, clubId)];
  st.missions++;
  if (side(game, clubId) === 'user') st.trips += q.cost;
  return m;
}
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Start misji gracza: { ok, text, missionId }. */
export function startMission(game, order) {
  if (!ensureScoutOps(game)) return { ok: false, text: 'Brak danych gry.', missionId: null };
  const q = quote(game, order ?? {}, game.clubId);
  if (!q.ok) return { ok: false, text: q.text, missionId: null };
  const m = createMission(game, q, game.clubId);
  const R = SCOUT_REGION[m.region];
  (game.scoutOps.outbox ??= []).push({ kind: 'start', mission: m.id, date: game.date });
  return { ok: true, text: `${m.scoutName} wyjeżdża: ${R.label}, ${m.pos}, ${m.weeks} ${weeksWord(m.weeks)}. Koszt ${fmtK(m.cost)}, powrót ${fmtDate(m.end)}.`, missionId: m.id };
}
const weeksWord = (n) => (n === 1 ? 'tydzień' : n < 5 ? 'tygodnie' : 'tygodni');
const yearsWord = (n) => `${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'lata' : 'lat'}`;

/** Skaut wraca z wyjazdu (koniec albo odwołanie). */
function scoutBack(game, m, date, rest = true) {
  const p = game.staff.people[m.scoutId];
  if (!p) return;
  if (p.mission === m.id) { p.mission = null; p.away = null; p.busyUntil = rest ? addDays(date, SCOUT.restPerWeek * m.weeks) : date; }
  if (!m.freelance && p.club) syncStaff(game, p.club, date);
}

/** Odwołanie misji gracza: w pierwszych 2 dniach zwrot 50 % kosztów, później bez zwrotu. Zwraca { ok, text }. */
export function cancelMission(game, missionId) {
  const S = ensureScoutOps(game);
  const m = S?.missions.find((x) => x.id === missionId);
  if (!m || m.club !== game.clubId) return { ok: false, text: 'Nie ma takiej misji.' };
  if (m.status !== 'w toku') return { ok: false, text: 'Ta misja już się zakończyła.' };
  const date = game.date;
  const early = daysBetween(m.start, date) < SCOUT.cancelDays;
  const back = early ? Math.round(m.cost * SCOUT.refund) : 0;
  if (back) {
    book(game.finance, m.club, date, 'out', 'scouts', -back, `Zwrot za odwołany wyjazd skauta (${m.scoutName})`);
    statsOf(game, date).user.trips -= back;
  }
  m.status = 'odwołana';
  m.events.push({ date, kind: 'powrot', text: early ? 'Wyjazd odwołany, połowa kosztów wróciła.' : 'Wyjazd odwołany, koszty nie wracają.' });
  scoutBack(game, m, date, false);
  return { ok: true, text: early ? `Wyjazd odwołany. Zwrot ${fmtK(back)}.` : 'Wyjazd odwołany. Koszty nie wracają (zwrot połowy tylko w pierwszych 2 dniach).' };
}

// ------------------------------------------------------------ Zdarzenia i kandydaci

const EV_TEXT = {
  mecz: (R) => `Dobry mecz w regionie ${R.label}: jeden zawodnik zwrócił uwagę skauta.`,
  agent: () => 'Agent polecił zawodnika z kontraktem (cena może być wyższa).',
  uraz: () => 'Jeden z obserwowanych zawodników doznał kontuzji.',
  zaulek: () => 'Ślepy zaułek: dwa tropy okazały się chybione.',
};

/** Zdarzenia tygodnia k misji (ziarno misji i tygodnia, niezależne od dnia sprawdzenia). */
export function weekEvents(game, m, k) {
  const rng = new Rng(`skauting:${game.seed}:${m.id}:w${k}`);
  const f = m.weeks === 1 ? SCOUT.ev.short : 1;
  const out = [];
  for (const kind of ['zaulek', 'mecz', 'agent', 'uraz']) if (rng.chance(SCOUT.ev[kind] * f)) out.push(kind);
  return out;
}

/**
 * Kandydaci misji (po powrocie): liczba z rozkładu (lambda z chwili zlecenia) i zdarzeń, potem każdy kandydat
 * losowany wokół środka profilu z rozrzutem zależnym od skauta (do 12 prób: wiek, kwota i pensja z tolerancją 10 %).
 * Zwraca { n, players: [{ p, flags }] } (gracze jeszcze poza światem gry).
 */
export function rollCandidates(game, m, scout) {
  const rng = new Rng(`skauting:${game.seed}:${m.id}`);
  const ev = { mecz: 0, agent: 0, uraz: 0, zaulek: 0 };
  for (const e of m.events) if (ev[e.kind] != null) ev[e.kind]++;
  const base = drawCount(rng, m.calc.lambda);
  const n = clamp(base + ev.mecz + ev.agent - 2 * ev.zaulek, 0, SCOUT.maxN);
  const R = SCOUT_REGION[m.region];
  const k = m.calc.k;
  const sd = 1.2 * (1 - 0.6 * k);
  const shift = -0.5 * (1 - k) * 1.2;
  const players = [];
  const layout = SQUAD_LAYOUT.filter(([x]) => x === m.pos);
  for (let i = 0; i < n; i++) {
    const flags = { mecz: i < ev.mecz, agent: i >= ev.mecz && i < ev.mecz + ev.agent };
    let got = null;
    for (let t = 0; t < SCOUT.tries && !got; t++) {
      const status = flags.agent ? 'contract' : rng.chance(SCOUT.freeShare) ? 'free' : 'contract'; // decyzja właściciela: gracz nie wybiera, wynik zero-jedynkowy (polecenie agenta: zawodnik z kontraktem)
      const target = m.calc.c + shift + rng.gauss(0, sd) + (flags.mecz ? 0.4 : 0);
      const age = rng.int(m.ageFrom, m.ageTo);
      const nat = rng.weighted(R.nats, (x) => R.w[x]);
      const [pos, sd2] = rng.pick(layout.length ? layout : [[m.pos]]);
      let pot = null;
      if (m.calc.pot != null) pot = [Math.max(0.3, m.calc.pot + shift + rng.gauss(0, sd) - target), 0];
      if (pot) pot[1] = pot[0] + 0.6;
      // Dopasowanie poziomu: 3 próby generatora z poprawką L (ten sam strumień, deterministycznie)
      let L = target + 0.1; let best = null;
      for (let j = 0; j < 3; j++) {
        const id = `skaut-${m.id}-${i + 1}`;
        const p = genPoolPlayerFor(rng, id, game.date, { L, age, pos, side: sd2 ?? null, nat, status, pot, band: 'skaut' });
        const d = p.ovr - target;
        if (!best || Math.abs(d) < Math.abs(best.ovr - target)) best = p;
        if (Math.abs(d) <= 0.3) break;
        L -= d;
      }
      const p = best;
      if (flags.agent && p.abroad) p.abroad.priceMul = Math.round(p.abroad.priceMul * 1.1 * 100) / 100;
      const price = p.free ? 0 : foreignAskingPrice(game, p);
      if (!p.free && m.maxFee > 0 && price > m.maxFee * 1.1) continue; // kwota 0: bez limitu
      if (m.maxWage > 0 && candidateWage(p) > m.maxWage * 1.1) continue;
      got = p;
    }
    if (got) players.push({ p: got, flags });
  }
  if (ev.uraz && players.length) {
    const x = players[rng.int(0, players.length - 1)];
    const days = rng.int(28, 120);
    x.p.injuryDays = days;
    x.p.injury = { cat: days > 42 ? 'severe' : 'medium', name: days > 42 ? 'uraz barku' : 'naderwanie mięśnia dwugłowego', days, playable: false, since: game.date };
    x.flags.uraz = true;
  }
  return { n: players.length, rolled: n, players };
}

const WILL = ['Raczej nie', 'Wahający się', 'Raczej tak', 'Chętny'];
const ADAPT = ['niskie', 'średnie', 'wysokie'];

/** Prawdziwe ryzyko adaptacji (0-2) z czasu aklimatyzacji (acclimatization.js) i regionu. */
function adaptationLevel(game, p, clubId, region) {
  const days = acclimPlan(game, p, { fromAbroad: true, date: game.date, clubId }).days;
  const score = days / 110 + ((SCOUT_REGION[region]?.adapt ?? 0.4) - 0.4) * 0.4;
  return score < 0.95 ? 0 : score < 1.2 ? 1 : 2;
}

/** Prawdziwa chęć przyjścia (0-3) z modelu negocjacji (willingnessToJoin przez playerWillingness). */
function willingnessLevel(game, p, clubId) {
  try {
    const s = playerWillingness(game, p, clubId).score ?? 0.5;
    return s >= 0.7 ? 3 : s >= 0.5 ? 2 : s >= 0.3 ? 1 : 0;
  } catch { return 1; }
}

/**
 * Raport o kandydacie z błędem skauta: ocena i potencjał (przedziały), wydmuszka (prawdziwy poziom o 1,5-3 niżej
 * niż w raporcie) z szansą 0,30 (1 - a)^1,5 albo niedoceniony z połową tej szansy, mocne i słabe strony z atrybutów
 * z błędem, cena i pensja (przedział z wiedzy o rynku), chęć (błąd z wiedzy o rynku), adaptacja (błąd z oceny charakteru).
 */
export function makeReport(game, m, scout, p, flags = {}) {
  const rng = new Rng(`skauting-raport:${game.seed}:${m.id}:${p.id}`);
  const a = m.calc.a;
  const sigma = 0.5 + 2.5 * (1 - a);
  const pb = 0.30 * (1 - a) ** 1.5;
  const u = rng.next();
  const shift = u < pb ? 1.5 + 1.5 * rng.next() : u < pb * 1.5 ? -(1.5 + 1.5 * rng.next()) : 0;
  const ovrSeen = clamp(p.ovr + shift + rng.gauss(0, 0.35 * sigma), 1, 20);
  const hw = 0.3 + 0.3 * sigma;
  const lo = clamp(Math.round(ovrSeen - hw), 1, 20); const hi = clamp(Math.max(lo, Math.round(ovrSeen + hw)), 1, 20);
  const potTrue = p.hidden?.POT ?? p.ovr;
  const potSeen = clamp(Math.max(ovrSeen, potTrue + shift + rng.gauss(0, 0.5 * sigma)), 1, 20);
  const phw = 0.5 + 0.35 * sigma;
  const plo = clamp(Math.max(lo, Math.round(potSeen - phw)), 1, 20); const phi = clamp(Math.max(plo, Math.round(potSeen + phw)), 1, 20);
  const confScore = a + rng.gauss(0, 0.05);
  const confidence = confScore >= 0.72 ? 'wysoka' : confScore >= 0.5 ? 'średnia' : 'niska';
  // Mocne i słabe strony: atrybuty ważne na pozycji, widziane z błędem
  const off = OFF[p.pos] ?? {};
  const keys = Object.keys(off).filter((x) => off[x] > 0 && p.attr?.[x] != null);
  const seen = keys.map((x) => [x, p.attr[x] + shift + rng.gauss(0, sigma) - (p.ovr + off[x])]).sort((x, y) => y[1] - x[1]);
  const strengths = seen.slice(0, 2).filter((x) => x[1] > -0.5).map((x) => ATTRS[x[0]].name);
  const weaknesses = seen.slice(-2).filter((x) => x[1] < 0.5).reverse().map((x) => ATTRS[x[0]].name);
  if (plo - hi >= 2 && strengths.length < 3) strengths.push('Duży potencjał');
  if (confidence === 'niska') weaknesses.push('Mało obejrzanych meczów');
  // Cena i pensja: przedział o szerokości 5 % + 35 % (1 - wiedza o rynku / 20)
  const ryn = A(scout, 'RYN'); const cha = A(scout, 'CHA');
  const width = 0.05 + 0.35 * (1 - ryn / 20);
  const range = (v, round) => {
    if (!v) return [0, 0];
    const c = v * (1 + rng.gauss(0, width / 4));
    return [round(c * (1 - width / 2)), round(c * (1 + width / 2))];
  };
  const price = p.free ? 0 : foreignAskingPrice(game, p);
  const priceRange = range(price, r10k);
  const wageRange = range(candidateWage(p), r100);
  let will = willingnessLevel(game, p, m.club);
  if (rng.chance(0.5 * (1 - ryn / 20))) will = clamp(will + (rng.chance(0.5) ? 1 : -1), 0, 3);
  let adapt = adaptationLevel(game, p, m.club, m.region);
  if (rng.chance(0.5 * (1 - cha / 20))) adapt = clamp(adapt + (rng.chance(0.5) ? 1 : -1), 0, 2);
  // Uwagi skauta
  const notes = [];
  if (flags.mecz) notes.push('Wypatrzony w dobrym meczu, który obserwowałem na miejscu.');
  if (flags.agent) notes.push('Polecenie agenta: klub zna jego wartość i liczy na dobrą cenę.');
  if (flags.uraz || p.injuryDays > 0) notes.push(`Teraz leczy kontuzję, wróci za ok. ${Math.max(1, Math.round((p.injuryDays ?? 0) / 7))} tyg.`);
  if (p.free) notes.push('Bez klubu: podpisze bez odstępnego.');
  if (confidence === 'niska') notes.push('Widziałem go w niewielu meczach i nie ręczę za ocenę.');
  else if (confidence === 'wysoka' && !notes.length) notes.push('Widziałem go kilka razy, ocena jest pewna.');
  if (ADAPT[adapt] === 'wysokie') notes.push('Może mieć kłopot z aklimatyzacją w Polsce.');
  if (!notes.length) notes.push('Solidny kandydat zgodny z profilem zlecenia.');
  return {
    ovrRange: [lo, hi], potRange: [plo, phi], seenOvr: Math.round(ovrSeen * 10) / 10, bust: shift > 0 ? 1 : shift < 0 ? -1 : 0, confidence,
    priceRange, wageRange, willingness: WILL[will], adaptation: ADAPT[adapt], strengths: strengths.slice(0, 3), weaknesses: weaknesses.slice(0, 3),
    note: notes.slice(0, 2).join(' '), free: !!p.free, clubLabel: p.free ? 'bez klubu' : poolClubLabel(p),
  };
}

/**
 * Ukryta ocena (decyzja właściciela Nov 20, 2026): kandydat ze skautingu klubu gracza, dopóki jest kandydatem
 * (raport nie wygasł w zwykły rynek) i nie podpisał kontraktu w Polsce. Widoki Transferów pokazują wtedy zamiast
 * OVR i atrybutów ikonę lornetki; ocenę zna tylko skaut (zdanie w raporcie, scoutOpinion). Kluby AI bez zmian.
 */
export const scoutHidden = (game, p) => !!p?.scout && !!game && p.scout.club === game.clubId && !p.scout.released && !p.clubId;

/**
 * Ocena skauta jako jego zdanie (raport w poczcie i karta kandydata w Skautingu), z przedziałów raportu. Słabsza
 * pewność to ostrożniejsze, bardziej mgliste słowa. r: { ovrRange, potRange, confidence }.
 */
export function scoutOpinion(r) {
  const [lo, hi] = r?.ovrRange ?? [];
  if (lo == null) return 'Nie zdążyłem go dobrze ocenić.';
  const phi = r.potRange?.[1] ?? hi;
  const lvl = lo === hi ? `${lo}` : `${lo}-${hi}`;
  const grows = phi > hi;
  if (r.confidence === 'wysoka') return `Moim zdaniem to zawodnik na poziomie ok. ${lvl}${grows ? `, potencjał do ${phi}` : ', bez dużego zapasu na rozwój'}.`;
  if (r.confidence === 'średnia') return `Wygląda mi na zawodnika na poziomie ok. ${lvl}${grows ? `, potencjał może sięgnąć ${phi}` : ', raczej bez dużego zapasu na rozwój'}.`;
  return `Trudno mi go dobrze ocenić. Chyba gra mniej więcej na poziomie ${lvl}${grows ? `, może rozwinąć się do ok. ${phi}, ale to tylko przeczucie` : ''}.`;
}

/** Termin ważności raportu: wolni 4 tygodnie, z kontraktem 6; poza oknem 14 dni po otwarciu najbliższego, najwyżej 14 tygodni. */
export function candidateUntil(date, free) {
  const base = addDays(date, free ? SCOUT.valid.free : SCOUT.valid.contract);
  const max = addDays(date, SCOUT.validMax);
  const windows = transferWindows();
  if (windows.some((w) => base >= w.from && base <= w.to)) return base;
  const next = windows.filter((w) => w.from > base).sort((x, y) => x.from.localeCompare(y.from))[0];
  const shifted = next ? addDays(next.from, SCOUT.afterWindow) : base;
  return shifted < max ? (shifted > base ? shifted : base) : max;
}
/** Okna transferowe bieżącego sezonu (kalendarz) i następne letnie (1 lipca - 1 września). */
function transferWindows() {
  const out = [...(DOMESTIC.transferWindows ?? [])];
  const last = out.map((w) => w.from).sort().at(-1);
  if (last) { const y = +last.slice(0, 4) + (+last.slice(5, 7) >= 7 ? 1 : 0); out.push({ from: `${y}-07-01`, to: `${y}-09-01` }); }
  return out;
}

/** Koniec misji: kandydaci, raport (gracz) albo lista wyłączności (AI). Zwraca wiadomości. */
function finishMission(game, m, date) {
  const S = game.scoutOps; const W = game.world; const M = game.market;
  const scout = game.staff.people[m.scoutId] ?? { q: 10, a: {} };
  m.events.push({ date, kind: 'powrot', text: 'Powrót do klubu, raport w poczcie.' });
  const { players, rolled } = rollCandidates(game, m, scout);
  const user = m.club === game.clubId;
  const st = statsOf(game, date)[user ? 'user' : 'ai'];
  const ids = [];
  for (const { p, flags } of players) {
    let id = p.id; let k = 0;
    while (W.players[id] && k < 50) id = `${p.id}-${++k}`;
    p.id = id;
    const rep = makeReport(game, m, scout, p, flags);
    const found = date;
    const until = candidateUntil(date, p.free);
    p.scout = { club: m.club, mission: m.id, found, excl: addDays(found, SCOUT.excl), until, pct: m.pct, commUntil: m.pct ? addDays(found, 365) : null, scout: m.scoutName };
    W.players[id] = p;
    if (user) {
      (M.foreign ??= []).push(id);
      if (p.free) M.free.push(id);
    } else (S.aiIdx[m.club] ??= []).push(id);
    S.cands[id] = { pid: id, mission: m.id, club: m.club, found, excl: p.scout.excl, until, seen: false, watched: true, state: 'active', goneText: null, snap: { name: p.name, nat: p.nat, age: p.age, pos: p.pos }, rep: user ? rep : { seenOvr: rep.seenOvr } };
    if (rep.bust > 0) st.busts++;
    ids.push(id);
  }
  st.cands += ids.length;
  if (!ids.length) st.empty++;
  m.status = 'zakończona';
  m.result = { n: ids.length, candidates: ids, rolled };
  scoutBack(game, m, date, true);
  if (!user) return [];
  return [reportMessage(game, m, ids, date)];
}

function reportMessage(game, m, ids, date) {
  const S = game.scoutOps; const R = SCOUT_REGION[m.region];
  const head = `${m.scoutName} wrócił z wyjazdu (${R.label}, ${m.weeks} ${weeksWord(m.weeks)}). Zlecenie: ${m.pos}, ${m.ageFrom}-${m.ageTo} lat, ${lowerFirst(SCOUT_LEVELS[m.level])}.`;
  const evs = m.events.filter((e) => ['mecz', 'agent', 'uraz', 'zaulek'].includes(e.kind)).map((e) => `- ${e.text}`);
  const lines = ids.map((id) => {
    const c = S.cands[id]; const r = c.rep;
    const price = r.free ? 'wolny' : `cena ${fmtK(r.priceRange[0])} do ${fmtK(r.priceRange[1])}`;
    return `- ${c.snap.pos} ${c.snap.name}, ${yearsWord(c.snap.age)}, ${NAT_NAMES[c.snap.nat] ?? c.snap.nat}, ${price}. ${r.willingness}. ${scoutOpinion(r)}`;
  });
  const body = ids.length
    ? `${head}\n\nKandydaci (${ids.length}):\n${lines.join('\n')}${evs.length ? `\n\nZ dziennika wyjazdu:\n${evs.join('\n')}` : ''}\n\nKarty kandydatów są w Transfery, Skauting, Kandydaci. Moja ocena to szacunek: dokładnie poznasz zawodnika po transferze. Raporty są ważne kilka tygodni, potem kandydaci mogą zniknąć z rynku.`
    : `${head}\n\nSkaut wrócił bez kandydatów.${evs.length ? `\n\nZ dziennika wyjazdu:\n${evs.join('\n')}` : ''}\n\nMożliwe przyczyny: krótki wyjazd, trudny profil albo region poza wiedzą skauta. Możesz powtórzyć zlecenie po 14 dniach albo zmienić profil.`;
  return createMessage({
    date, key: `scout-report:${m.id}`, category: 'transfers', from: m.scoutName, priority: 'important',
    subject: ids.length ? `Raport skauta: ${ids.length} ${ids.length === 1 ? 'kandydat' : ids.length < 5 ? 'kandydaci' : 'kandydatów'} (${R.label})` : `Raport skauta: bez kandydatów (${R.label})`,
    body, refs: { kind: 'scoutReport', missionId: m.id },
  });
}

/** Zdarzenia tygodnia w trakcie misji (dni start + 7 k). Ważne zdarzenia długiej misji gracza: krótka wiadomość. */
function missionWeek(game, m, date) {
  const k = daysBetween(m.start, date) / 7;
  if (!Number.isInteger(k) || k < 1 || k > m.weeks) return [];
  if (m.events.some((e) => e.week === k)) return [];
  const R = SCOUT_REGION[m.region];
  const out = [];
  for (const kind of weekEvents(game, m, k)) {
    const text = EV_TEXT[kind](R);
    m.events.push({ date, kind, text, week: k });
    if (m.club === game.clubId && m.weeks >= 4 && (kind === 'agent' || kind === 'uraz') && k < m.weeks) {
      out.push(createMessage({ date, key: `scout-event:${m.id}:${k}:${kind}`, category: 'transfers', from: m.scoutName, priority: 'info', subject: `Wieści od skauta (${R.label})`, body: `${text} Powrót ${fmtDate(m.end)}.`, refs: { kind: 'scoutEvent', missionId: m.id } }));
    }
  }
  if (!m.events.some((e) => e.week === k)) m.events.push({ date, kind: 'tydzien', text: `Tydzień ${k}: obserwacje bez niespodzianek.`, week: k, quiet: true });
  return out;
}

// ------------------------------------------------------------ Wygasanie kandydatów

const frozen = (game, p) => !!(p.transfer || hasOpenDeal(game, p.id) || game.market?.talks?.[p.id]?.accepted);

/** Kandydat znika z gry (nigdy nie grał w Polsce). */
function dropPlayer(game, pid) {
  const M = game.market; const W = game.world;
  if (Array.isArray(M?.foreign)) M.foreign = M.foreign.filter((x) => x !== pid);
  if (Array.isArray(M?.free)) M.free = M.free.filter((x) => x !== pid);
  if (M?.talks) delete M.talks[pid];
  delete W.players[pid];
}

/** Dzień: kandydaci po terminie ważności (gracz) i po wyłączności (AI). Zwraca wiadomości. */
function expiryDay(game, date) {
  const S = game.scoutOps; const W = game.world;
  const out = [];
  for (const c of Object.values(S.cands)) {
    const p = W.players[c.pid];
    if (c.state !== 'active') continue;
    if (!p || p.clubId) { // podpisał w Polsce (albo zniknął innym torem)
      c.state = p?.clubId === c.club ? 'signed' : 'gone';
      if (c.state === 'gone') c.goneText = p?.clubId ? `Podpisał kontrakt z klubem ${clubById(p.clubId)?.name ?? ''}.` : 'Zniknął z rynku.';
      c.goneDate = date;
      if (c.club !== game.clubId) delete S.cands[c.pid];
      continue;
    }
    const ai = c.club !== game.clubId;
    const due = ai ? c.excl : c.until;
    if (due >= date) continue;
    if (frozen(game, p)) { if (!ai) c.until = p.scout.until = addDays(date, SCOUT.freeze); else c.excl = p.scout.excl = addDays(date, SCOUT.freeze); continue; } // transakcja w toku: termin zamrożony
    const u = new Rng(`skauting-wygasa:${game.seed}:${c.pid}`).next();
    const O = SCOUT.outcome;
    if (u < O.signed + O.gone) {
      const signed = u < O.signed;
      c.state = 'gone'; c.goneDate = date;
      c.goneText = signed ? `Przeszedł do ${genericClub(p.abroad?.country ?? p.nat).replace(/^klub /, 'klubu ')}.` : p.free ? 'Wyjechał do ligi poza naszym zasięgiem i nie jest już na rynku.' : 'Zostaje w swoim klubie i nie jest już na rynku.';
      dropPlayer(game, c.pid);
      if (!ai && c.watched) out.push(createMessage({ date, key: `scout-gone:${c.pid}`, category: 'transfers', from: 'Dział skautingu', priority: 'info', subject: signed ? `${c.snap.name} podpisał kontrakt gdzie indziej` : `${c.snap.name} nie jest już na rynku`, body: `${c.snap.name} (${c.snap.pos}, ${NAT_NAMES[c.snap.nat] ?? c.snap.nat}) z raportu skauta. ${c.goneText}` }));
    } else {
      // Zwykły rynek: kandydat zostaje w puli zagranicznej jako zawodnik widoczny dla wszystkich
      p.scout.released = true; p.scout.excl = date;
      const M = game.market; // kandydat AI dopiero teraz na rynku (gracz: już był, także po utracie klubu przez trenera)
      if (!(M.foreign ??= []).includes(c.pid)) M.foreign.push(c.pid);
      if (p.free && !M.free.includes(c.pid)) M.free.push(c.pid);
      c.state = 'pool'; c.goneText = 'Raport wygasł. Zawodnik jest dalej na zwykłym rynku (Transfery, Rynek).';
      if (!ai && c.watched) out.push(createMessage({ date, key: `scout-pool:${c.pid}`, category: 'transfers', from: 'Dział skautingu', priority: 'info', subject: `${c.snap.name}: raport skauta wygasł`, body: `${c.snap.name} (${c.snap.pos}) nie ma już wyłączności dla nas. Jest dalej na rynku i mogą się nim zainteresować inne kluby.` }));
    }
    if (ai) delete S.cands[c.pid];
  }
  // Indeks AI i porządki listy gracza: usunięci z listy i najstarsi zakończeni ponad 60 wpisów
  for (const [club, list] of Object.entries(S.aiIdx)) { const l = list.filter((id) => S.cands[id]); if (l.length) S.aiIdx[club] = l; else delete S.aiIdx[club]; }
  const mine = () => Object.values(S.cands).filter((c) => c.club === game.clubId);
  for (const c of mine()) if (!c.watched && c.state !== 'active') delete S.cands[c.pid];
  const done = mine().filter((c) => c.state !== 'active').sort((x, y) => (x.goneDate ?? x.found).localeCompare(y.goneDate ?? y.found));
  for (const c of done.slice(0, Math.max(0, mine().length - SCOUT.keepCands))) delete S.cands[c.pid];
  return out;
}

// ------------------------------------------------------------ Kluby AI

/** Okres misji AI: lato (1 czerwca - 3 sierpnia) i zima (1-29 stycznia), więc kandydaci wracają przed końcem okna. */
function aiPeriod(date) {
  const md = date.slice(5);
  if (md >= '06-01' && md <= '08-03') return `${date.slice(0, 4)}-lato`;
  if (md >= '01-01' && md <= '01-29') return `${date.slice(0, 4)}-zima`;
  return null;
}

/** Pozycja do wzmocnienia klubu AI: najsłabszy najlepszy zawodnik na pozycji (los przy remisie). */
function aiNeedPos(game, clubId, rng) {
  const sq = squadOf(game.world, clubId);
  let best = null;
  for (const pos of SCOUT_POSITIONS) {
    const top = sq.filter((p) => p.pos === pos).reduce((mx, p) => Math.max(mx, p.ovr), 0);
    const v = top + rng.next() * 0.3;
    if (!best || v < best.v) best = { pos, v };
  }
  return best?.pos ?? 'ŚP';
}

/** Poniedziałek w okresie misji: klub AI z dobrym skautem (q 8+) raz na okres wysyła go z szansą zależną od ligi. */
function aiMissionsWeek(game, date) {
  const S = game.scoutOps;
  const period = aiPeriod(date);
  if (!period) return;
  for (const c of CLUBS_PL) {
    if (c.id === game.clubId || !game.world.clubs[c.id] || c.tier > 3 || c.parent || S.ai[c.id] === period) continue;
    S.ai[c.id] = period;
    const rng = new Rng(`skauting-ai:${game.seed}:${c.id}:${period}`);
    if (!rng.chance(SCOUT.ai.chance[c.tier] ?? 0)) continue;
    const scouts = clubScouts(game, c.id).filter((p) => p.q >= SCOUT.ai.minQ && !scoutBusy(game, p, date)).sort((a, b) => b.q - a.q || a.id.localeCompare(b.id));
    const p = scouts[0];
    if (!p) continue;
    const region = bestRegion(p.reg)?.[0] ?? rng.pick(SCOUT_REGION_KEYS);
    const F = game.finance;
    const money = F?.clubs?.[c.id] ? spendable(F, c.id) * POOL.aiMoney : 0;
    const pos = aiNeedPos(game, c.id, rng);
    const wage = Math.max(marketWage(missionTarget(game, c.id, pos, 'wzmocnienie').ovr, 1, true, 1), F?.clubs?.[c.id] ? wageRoom(F, game.world, c.id) : 0);
    const q = quote(game, { scoutId: p.id, region, pos, ageFrom: SCOUT.ai.ageFrom, ageTo: SCOUT.ai.ageTo, level: 'wzmocnienie', maxFee: Math.round(money), maxWage: Math.round(wage * 1.2), contract: 'any', weeks: SCOUT.ai.weeks }, c.id, { ai: true });
    if (q.ok) createMission(game, q, c.id);
  }
}

// ------------------------------------------------------------ System dnia

/** Dzień skautingu (kolejność 52.5, przed transferami 53: kandydat istnieje w dniu transakcji). */
export function scoutOpsDay(game, date) {
  const S = ensureScoutOps(game);
  if (!S) return [];
  const out = [];
  if ((date.endsWith('-07-01') || date.endsWith('-01-01')) && S.refresh !== date) refreshScoutPool(game, date);
  for (const m of S.missions) {
    if (m.status !== 'w toku') continue;
    if (date < m.end) out.push(...missionWeek(game, m, date));
    else { out.push(...missionWeek(game, m, m.end)); out.push(...finishMission(game, m, date)); }
  }
  if (Object.keys(S.cands).length) out.push(...expiryDay(game, date));
  if (isMonday(date)) aiMissionsWeek(game, date);
  // Misje AI po końcu: bez historii (statystyki w scoutOps.stats); misje gracza: ostatnie 30
  S.missions = S.missions.filter((m) => m.status === 'w toku' || m.club === game.clubId);
  if (S.missions.length > SCOUT.keepMissions) {
    const done = S.missions.filter((m) => m.status !== 'w toku');
    const drop = new Set(done.slice(0, S.missions.length - SCOUT.keepMissions).map((m) => m.id));
    S.missions = S.missions.filter((m) => !drop.has(m.id));
  }
  out.push(...flushOutbox(game, date));
  return out;
}
/** Zdarzenia spoza systemu dnia (start misji gracza, podpisanie kandydata w transfers.js): wiadomości i statystyki. */
function flushOutbox(game, date) {
  const S = game.scoutOps;
  if (!S.outbox?.length) return [];
  const out = [];
  for (const e of S.outbox) {
    if (e.kind === 'start') {
      const m = S.missions.find((x) => x.id === e.mission);
      if (!m || m.club !== game.clubId) continue;
      out.push(createMessage({ date: e.date ?? date, key: `scout-start:${m.id}`, category: 'transfers', from: m.scoutName, priority: 'info', subject: `Skaut wyjechał: ${SCOUT_REGION[m.region].label}`, body: `${m.scoutName} szuka zawodnika: ${m.pos}, ${m.ageFrom}-${m.ageTo} lat, ${lowerFirst(SCOUT_LEVELS[m.level])}${m.maxFee ? `, do ${fmtK(m.maxFee)}` : ''}. Powrót ${fmtDate(m.end)}. Koszt wyjazdu ${fmtK(m.cost)}${m.freelance ? ` (z opłatą skauta na zlecenie; prowizja przy podpisaniu ${String(m.pct).replace('.', ',')} %)` : ''}.`, refs: { kind: 'scoutStart', missionId: m.id } }));
    } else if (e.kind === 'signed') {
      if (!e.own) continue; // kandydat podpisał z innym klubem niż zlecający
      const st = statsOf(game, e.date ?? date)[e.to === game.clubId ? 'user' : 'ai'];
      st.signed++;
      if (e.to === game.clubId && e.amount) {
        statsOf(game, e.date ?? date).user.commissions += e.amount;
        out.push(createMessage({ date: e.date ?? date, key: `scout-commission:${e.pid}`, category: 'transfers', from: 'Dział finansów', priority: 'info', subject: `Prowizja skauta: ${e.name}`, body: `Za podpisanie ${e.name} skaut ${e.scout ?? ''} otrzymał prowizję ${fmtK(e.amount)} (${String(e.pct).replace('.', ',')} %${e.fee ? ' kwoty transferu' : ', ryczałt przy wolnym zawodniku'}).`.replace('skaut  ', 'skaut ') }));
      }
    }
  }
  S.outbox = [];
  return out;
}

registerDailySystem({
  id: 'scoutOps', order: 52.5,
  run(game, date) {
    if (!game.world || !game.season || !game.market || !game.finance) return {};
    return { messages: scoutOpsDay(game, date) };
  },
});

// ------------------------------------------------------------ Akcje gracza

/** Zatrudnienie wolnego skauta na stałe: oferta jak w sztabie (limit, budżet, decyzja po 2-3 dniach). */
export function hireScout(game, freeScoutId, mode = 'permanent') {
  if (!ensureScoutOps(game)) return { ok: false, text: 'Brak danych gry.' };
  if (mode !== 'permanent') return { ok: false, text: 'Skauta na jedną misję wybierasz w zleceniu wyjazdu.' };
  const p = game.staff.people[freeScoutId];
  if (!p || p.role !== 'skaut' || p.club) return { ok: false, text: 'Tego skauta nie ma już na liście wolnych.' };
  const ok = permanentCheck(game, p);
  if (!ok.ok) return ok;
  const wage = expectedWage(p, game.date);
  const r = makeOffer(game, { pid: p.id, wage, years: 2 });
  if (!r.ok) return { ok: false, text: r.text };
  return { ok: true, text: `Oferta dla ${p.name}: ${fmtK(wage)} miesięcznie, umowa na 2 lata. Decyzja do ${fmtDate(r.decideOn)}.` };
}

/** Czy wolny skaut przyjmie pracę na stałe w klubie (renoma, elita) i czy klub może złożyć ofertę (limit, budżet). */
function permanentCheck(game, p, clubId = game.clubId) {
  if (!roleCap(clubId, 'skaut')) return { ok: false, text: 'W tej lidze klub nie zatrudnia skautów na stałe. Możesz wziąć skauta na zlecenie.' };
  if (eliteRefuses(p, clubId)) return { ok: false, text: `${p.name} pracuje tylko dla klubów z renomą co najmniej ${SCOUT.rep.eliteRep}.` };
  if (p.q >= SCOUT.rep.permQ && clubRep(clubId) < repNeed(p.q)) return { ok: false, text: `Na stałe ${p.name} wybiera kluby z większą renomą (ok. ${Math.round(repNeed(p.q))}, nasza ${Math.round(clubRep(clubId))}).` };
  const c = checkOffer(game, { pid: p.id, wage: expectedWage(p, game.date), years: 2, clubId });
  return c.ok ? { ok: true, text: 'Możesz złożyć ofertę.' } : { ok: false, text: c.text };
}

/** Zwolnienie skauta (odprawa jak w sztabie); skaut w podróży dopiero po powrocie. */
export function fireScout(game, scoutId) {
  if (!ensureScoutOps(game)) return { ok: false, text: 'Brak danych gry.' };
  const p = game.staff.people[scoutId];
  if (!p || p.role !== 'skaut' || p.club !== game.clubId) return { ok: false, text: 'Ten skaut nie pracuje w Twoim klubie.' };
  if (p.mission) return { ok: false, text: `${p.name} jest w podróży. Zwolnisz go po powrocie (${fmtDate(p.away ?? game.date)}).` };
  const r = fireStaff(game, scoutId);
  return { ok: r.ok, text: r.text };
}

/** Obserwowanie kandydata (on) albo usunięcie z listy (off). */
export function watchCandidate(game, pid, on) {
  const S = ensureScoutOps(game);
  const c = S?.cands?.[pid];
  if (!c || c.club !== game.clubId) return { ok: false, text: 'Nie ma takiego kandydata.' };
  c.watched = !!on; c.seen = true;
  return { ok: true, text: on ? `${c.snap.name} na liście obserwowanych.` : `${c.snap.name} usunięty z listy.` };
}

/** Wszyscy nowi kandydaci gracza obejrzani. */
export function markCandidatesSeen(game) {
  const S = ensureScoutOps(game);
  if (!S) return;
  for (const c of Object.values(S.cands)) if (c.club === game.clubId) c.seen = true;
}

// ------------------------------------------------------------ Dane dla UI

const regionsOf = (p) => Object.entries(p.reg ?? {}).filter(([k]) => SCOUT_REGION[k]).sort((a, b) => b[1] - a[1]).map(([key, level]) => ({ key, label: SCOUT_REGION[key].label, level, band: regionBand(level) }));
const attrsOf = (p) => Object.fromEntries(Object.entries(LC).map(([K, k]) => [k, A(p, K)]));

function scoutStatus(p, date) {
  if (p.mission && p.away && date < p.away) return { status: 'w podróży', busyUntil: p.away };
  if (p.busyUntil && p.busyUntil > date) return { status: 'odpoczynek', busyUntil: p.busyUntil };
  return { status: 'w klubie', busyUntil: null };
}

/** Następne odświeżenie listy wolnych skautów (1 lipca albo 1 stycznia). */
const nextRefresh = (date) => (date.slice(5) < '07-01' ? `${date.slice(0, 4)}-07-01` : `${+date.slice(0, 4) + 1}-01-01`);

/** Widok skautingu dla klubu gracza (czyste dane dla UI, docs/skauting.md rozdz. 8). */
export function scoutingView(game) {
  const S = ensureScoutOps(game);
  const empty = { scouts: [], staffSlots: { used: 0, max: 0 }, costs: { wagesMonthly: 0, tripsSeason: 0, commissionsSeason: 0 }, missions: [], candidates: [], freeScouts: [], refreshDate: null, newCandidates: 0 };
  if (!S || !game.clubId) return empty;
  const date = game.date; const clubId = game.clubId; const W = game.world;
  const mine = clubScouts(game, clubId);
  const scouts = mine.map((p) => ({ id: p.id, name: p.name, nat: p.nat, age: p.age, contractUntil: p.until ?? null, wage: p.wage ?? 0, attrs: attrsOf(p), regions: regionsOf(p), ...scoutStatus(p, date), missionId: p.mission ?? null }));
  const st = statsOf(game, date).user;
  const missions = S.missions.filter((m) => m.club === clubId).slice().reverse().map((m) => ({
    id: m.id, scoutId: m.scoutId, scoutName: m.scoutName, freelance: m.freelance, region: m.region, regionLabel: SCOUT_REGION[m.region]?.label ?? m.region,
    pos: m.pos, ageFrom: m.ageFrom, ageTo: m.ageTo, level: m.level, maxFee: m.maxFee, maxWage: m.maxWage, contract: m.contract, weeks: m.weeks,
    start: m.start, end: m.end, status: m.status, cost: m.cost,
    events: m.events.filter((e) => !e.quiet).map((e) => ({ date: e.date, kind: e.kind, text: e.text })),
    result: m.result ? { n: m.result.n, candidates: [...m.result.candidates] } : null,
  }));
  const candidates = [];
  let fresh = 0;
  for (const c of Object.values(S.cands).filter((x) => x.club === clubId && x.watched !== false).sort((a, b) => b.found.localeCompare(a.found) || a.pid.localeCompare(b.pid))) {
    const p = W.players[c.pid];
    const r = c.rep ?? {};
    let state = c.state === 'active' || c.state === 'pool' ? (c.seen ? 'obserwowany' : 'nowy') : c.state === 'signed' ? 'podpisał' : 'zniknął';
    let goneText = c.goneText ?? null;
    if (c.state === 'pool' && !p) { state = 'zniknął'; goneText = 'Zniknął z rynku.'; }
    if (p?.clubId) { state = p.clubId === clubId ? 'podpisał' : 'zniknął'; if (p.clubId !== clubId) goneText = `Podpisał kontrakt z klubem ${clubById(p.clubId)?.name ?? ''}.`; }
    if (state === 'nowy') fresh++;
    candidates.push({
      pid: c.pid, missionId: c.mission, name: c.snap.name, nat: c.snap.nat, age: p?.age ?? c.snap.age, pos: c.snap.pos,
      ovrRange: r.ovrRange ?? null, potRange: r.potRange ?? null, confidence: r.confidence ?? 'niska', priceRange: r.priceRange ?? [0, 0], wageRange: r.wageRange ?? [0, 0],
      willingness: r.willingness ?? 'Wahający się', adaptation: r.adaptation ?? 'średnie', strengths: r.strengths ?? [], weaknesses: r.weaknesses ?? [], note: r.note ?? '', opinion: scoutOpinion(r),
      free: p ? !!p.free && !p.clubId : !!r.free, clubLabel: p && !p.clubId ? (p.free ? 'bez klubu' : poolClubLabel(p)) : r.clubLabel ?? '', injuredDays: p?.injuryDays ?? 0,
      until: c.state === 'active' ? c.until : null, state, goneText,
    });
  }
  const freeScouts = freeScoutPeople(game).sort((a, b) => b.q - a.q || a.id.localeCompare(b.id)).map((p) => {
    const missionOk = missionCheck(game, p);
    return {
      id: p.id, name: p.name, nat: p.nat, age: p.age, attrs: attrsOf(p), regions: regionsOf(p), wageMonthly: expectedWage(p, date),
      missionFees: Object.fromEntries(SCOUT.weeks.map((w) => [w, freelanceFee(game, p, w)])), commissionPct: commissionPct(p.q),
      permanentOk: permanentCheck(game, p), missionOk,
    };
  });
  return {
    // staffFree: wolne miejsca w całym sztabie (z ofertami w toku); przy pełnym sztabie nie ma miejsca na skauta na stałe
    scouts, staffSlots: (() => { const L = staffLimit(game, clubId); return { used: mine.length, max: roleCap(clubId, 'skaut'), staffFree: L.free, staffUsed: L.used, staffLimit: L.limit }; })(),
    costs: { wagesMonthly: mine.reduce((s, p) => s + (p.wage ?? 0), 0), tripsSeason: Math.max(0, st.trips), commissionsSeason: st.commissions },
    missions, candidates, freeScouts, refreshDate: nextRefresh(date), newCandidates: fresh,
  };
}

/** Czy wolnego skauta można wziąć na misję (bez wyboru regionu i profilu). */
function missionCheck(game, p) {
  const date = game.date;
  const busy = scoutBusy(game, p, date);
  if (busy) return { ok: false, text: busy };
  if (eliteRefuses(p, game.clubId)) return { ok: false, text: `Pracuje tylko dla klubów z renomą co najmniej ${SCOUT.rep.eliteRep}.` };
  const act = activeMissions(game, game.clubId);
  if (act.some((m) => m.freelance)) return { ok: false, text: 'Jedna misja na zlecenie naraz.' };
  const cap = Math.min(SCOUT.maxActive, clubScouts(game, game.clubId).length + 1);
  if (act.length >= cap) return { ok: false, text: `Najwięcej misji naraz: ${cap}.` };
  const low = clubRep(game.clubId) < repNeed(p.q) - SCOUT.rep.freeGap;
  return { ok: true, text: low ? 'Na zlecenie: klub poniżej jego oczekiwań, opłata o 30 % wyższa.' : 'Na zlecenie: opłata z góry i prowizja przy podpisaniu.' };
}

/** Region kraju w zasięgu skautingu (do opisu w UI). */
export const regionLabelOfNat = (nat) => SCOUT_REGIONS.find((r) => r.nats.includes(nat))?.label ?? null;
