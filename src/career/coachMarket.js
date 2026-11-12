// Rynek trenerów klubów AI (docs/trenerzy-i-wlasciciele.md): zwolnienia oceniane po każdym meczu przez pryzmat
// właściciela (src/career/owners.js), trener tymczasowy (asystent), potem nowy trener z puli wolnych trenerów
// albo podebrany z niższej ligi, przegląd po sezonie, wiadomości w poczcie (kategoria Media).
// Sezon trenera: dopasowanie stylu do kadry, chemia z szatnią (los raz na sezon) i efekt nowej miotły jako
// przesunięcie atrybutów w meczu (profile.boost, career/coaches.js matchCoach).
// Klub gracza: bez zmian (o posadzie gracza decyduje zarząd, src/career/board.js). Wszystkie liczby [SZAC],
// kalibracja do liczby zmian trenerów w polskich ligach w dokumencie.

import { Rng, clamp } from '../core/rng.js';
import { createMessage } from '../core/inbox.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { CLUBS_PL, clubById, LEAGUE_NAMES } from '../data/clubs_pl.js';
import { NATIONALITIES, randomName } from '../data/names.js';
import { SEASON_YEAR } from '../config/calendar2026.js';
import { standings } from '../season/standings.js';
import { winnerOf } from '../season/cup.js';
import { squadOf } from '../world/worldGen.js';
import { staffOf, staffQ } from '../training/staff.js';
import { seasonGoalFor } from './board.js';
import { book } from './finance.js';
import { applyMorale } from './morale.js';
import { fmtDate } from '../ui/dom.js';
import { ownerOf } from './owners.js';
import { COACH, COACH_KEYS, COACH_STYLES, coachOf, coachAvg, coachLevelFor, replaceCoach } from './coaches.js';

const TIER_COMP = { 1: 'ekstraklasa', 2: 'liga1', 3: 'liga2' };
const LEAGUE_COMPS = new Set(Object.values(TIER_COMP));

/** Liczby rynku trenerów [SZAC]. Kalibracja: docs/trenerzy-i-wlasciciele.md, rozdz. 5. */
export const MARKET = {
  // Ocena po meczu ligowym: presja C (punkty) wobec progu właściciela
  startRound: 3, // przed 3. kolejką nikt nie zwalnia
  lateRounds: 4, // ostatnie 4 kolejki: zmiana tylko w strefie spadkowej (ratownik), poza nią x0,3
  conf: 12, // tabela w pełni miarodajna od 12. kolejki
  gapW: 2.4, // za każde miejsce poniżej oczekiwań
  ambitionShift: 0.2, // ambitny właściciel oczekuje miejsca wyżej: (ambicja - 10) x 0,2 miejsca
  drop: 9, nearDrop: 3, // strefa spadkowa i miejsce nad nią
  formRef: 1.25, formW: 8, // ostatnie 5 meczów: za każdy punkt na mecz poniżej 1,25
  streakW: 3, // porażki z rzędu od trzeciej
  winlessW: 1.5, // mecze bez wygranej od piątego
  cupShock: 9, cupShockLower: 6, uefaShock: 5, shockDays: 35, // odpadnięcie z pucharu (od niższej ligi więcej), wygasa liniowo
  fansW: 8, // presja kibiców (heat 0-100) x 0,08 x media/10
  honeyMatches: 8, // pierwsze mecze nowego trenera: presja x (0,35 + 0,65 x mecze/8)
  minMatches: 4, // nowy trener nie jest zwalniany przed 4. meczem o punkty
  thr: 23, thrPat: 1.1, thrTemper: 0.3, thrNoise: 0.22, // próg = 23 + 1,1 (cierpliwość - 10) - 0,3 (temperament - 10), los x temperament
  thrTier: { 1: 1.5, 2: -2.5, 3: -1.3 }, // 1 Liga: walka o awans i tani trenerzy, więcej zmian; Ekstraklasa ostrożniej (odprawy)
  winter: { date: '12-18', thr: -3 }, // przerwa zimowa: przegląd z niższym progiem (czas na nowego trenera przed obozem)
  credit: 2, longTenure: 0, // kapitał: cel wykonany w poprzednim sezonie; premia za staż ponad 2 lata wyłączona (kalibracja wieloletnia)
  span: 12, hMax: 0.4, hPow: 1.5, // szansa zwolnienia po meczu: 0,4 x ((C - próg) / 12)^1,5
  // Trener tymczasowy (dni) wg typu właściciela; wiosną część prowadzi zespół do końca sezonu
  caretaker: { miasto: [7, 20], spolka: [6, 16], klub: [10, 30], miliarder: [2, 8], prywatny: [3, 12] },
  caretakerToEnd: 0.35, caretakerStays: 0.15,
  // Przegląd po sezonie (2 czerwca)
  summer: { relegated: 0.5, perGap: 0.07, gapFrom: 2, base: 0.11, poached: 0.1, caretaker: 0.75, promoted: 0.03 },
  // Zatrudnianie: poziom klubu + ambicja i pieniądze właściciela; ocena kandydata z błędem
  hire: { ambition: 0.08, wealth: 0.1, reach: 1.2, over: 0.6, judgeSd: 0.6, judgeTemper: 0.06, poachP: 0.3, rescueS: 0.7, foreign: { 1: 0.5, 2: 0.15, 3: 0 } },
  // Pula wolnych trenerów
  pool: { start: 44, perSeason: 12, mean: 8.4, sd: 1.6, attrSd: 1.6, foreign: 0.3, maxAge: 68, gone: 0.5 },
  // Odprawa: 3 miesięczne pensje; pensja trenera 2,5 % rocznych płac I drużyny, najmniej wg ligi (zł / mies.)
  pay: { share: 0.025, min: { 1: 30000, 2: 15000, 3: 8000 }, months: 3 },
  bounceMorale: 0.4, // nowa miotła: jednorazowo morale kadry
};

const FOREIGN = ['POR', 'ESP', 'DEN', 'SWE', 'CRO', 'SVK', 'CZE', 'GER', 'NED', 'NOR', 'SRB', 'SVN', 'ROU', 'ITA', 'AUT', 'UKR'].filter((c) => NATIONALITIES.includes(c));
const STYLE_W = { O: 0.35, P: 0.4, S: 0.25 };
const tierOf = (id) => clubById(id)?.tier ?? 4;
const nameOf = (id) => clubById(id)?.name ?? id;
const seasonYear = (game) => game.seasonYear ?? SEASON_YEAR;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const r1 = (v) => Math.round(v * 10) / 10;
const plural = (n, a, b, c) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

// ------------------------------------------------------------ Stan

/** Tworzy lub uzupełnia game.coachMarket (stary zapis: pusta historia, pula z ziarna). */
export function ensureCoachMarket(game) {
  const M = (game.coachMarket ??= { v: 1, pool: null, seq: 0, clubs: {}, stats: {}, news: true });
  if (!M.pool) M.pool = Array.from({ length: MARKET.pool.start }, (_, i) => poolCoach(game, `start:${i}`, { age: null }));
  M.clubs ??= {}; M.stats ??= {};
  return M;
}

function statsOf(game) {
  const M = ensureCoachMarket(game);
  const y = seasonYear(game);
  return (M.stats[y] ??= { inSeason: { 1: 0, 2: 0, 3: 0 }, summer: { 1: 0, 2: 0, 3: 0 }, left: { 1: 0, 2: 0, 3: 0 }, fans: 0, byMonth: {}, hires: { pool: 0, poached: 0, caretaker: 0 } });
}

/** Nowy trener w puli wolnych trenerów (deterministycznie z ziarna gry i klucza). */
export function poolCoach(game, key, { age = null, mean = null } = {}) {
  const P = MARKET.pool;
  const rng = new Rng(`trener-pula:${game.seed}:${key}`);
  const foreign = rng.chance(P.foreign);
  const nat = foreign ? FOREIGN[rng.int(0, FOREIGN.length - 1)] : 'POL';
  const nm = randomName(nat, rng);
  const style = rng.weighted(Object.keys(STYLE_W), (k) => STYLE_W[k]);
  const m = (mean ?? P.mean) + (foreign ? 0.5 : 0) + rng.gauss(0, P.sd);
  const a = {};
  for (const k of COACH_KEYS) a[k] = clamp(Math.round(m + (COACH.gen.styleBonus[style] === k ? 1 : 0) + rng.gauss(0, P.attrSd)), 1, 20);
  const lastTier = m >= 10 ? 1 : m >= 8.5 ? 2 : 3;
  return { id: `pula:${key}`, name: `${nm.first} ${nm.last}`, nat, style, age: age ?? rng.int(36, 64), a, lastTier, hist: [], v: 2, free: null };
}

// ------------------------------------------------------------ Sezon trenera: dopasowanie, chemia, nowa miotła

/** Profil kadry: technika i gra do przodu wobec gry w obronie i siły (dodatnie: kadra ofensywna). */
function squadLean(game, clubId) {
  const xs = squadOf(game.world, clubId).filter((p) => p.pos !== 'BR').sort((a, b) => b.ovr - a.ovr).slice(0, 14);
  if (!xs.length) return 0;
  const avg = (keys) => xs.reduce((s, p) => s + keys.reduce((t, k) => t + (p.attr?.[k] ?? 10), 0) / keys.length, 0) / xs.length;
  return avg(['TEC', 'DRY', 'WYK', 'SZY', 'WIZ', 'RUC']) - avg(['ODB', 'UST', 'SIL', 'PRA', 'AGR', 'SKO']);
}

/**
 * Dopasowanie trenera do kadry na sezon (punkty atrybutu): styl wobec profilu kadry (ofensywny trener w kadrze
 * technicznej zyskuje, ostrożny w kadrze silnej w obronie) plus chemia z szatnią, losowana raz na sezon.
 */
export function seasonFit(game, clubId, p, year = seasonYear(game)) {
  const S = COACH.season;
  const lean = clamp(squadLean(game, clubId) / 1.5, -1, 1);
  const style = p.style === 'O' ? lean : p.style === 'S' ? -lean : 0;
  const chem = clamp(new Rng(`trener-chemia:${game.seed}:${clubId}:${p.id ?? p.name}:${year}`).gauss(0, S.chemSd), -S.chemMax, S.chemMax);
  return { style: r1(style * S.styleFit), chem: r1(chem) };
}

/** Przesunięcie sezonowe trenera na dziś (dopasowanie + chemia + nowa miotła), w punktach atrybutu. */
function updateBoost(game, clubId, p, date) {
  const S = COACH.season;
  const y = seasonYear(game);
  if (p.fitY !== y) { const f = seasonFit(game, clubId, p, y); p.fitY = y; p.fit = f.style + f.chem; }
  const d = p.n && p.from && !p.caretaker ? daysBetween(p.from, date) : 99999;
  const bounce = d >= 0 && d < S.bounceDays ? S.bounce * (1 - d / S.bounceDays) : 0;
  p.boost = r1(clamp((p.fit ?? 0) + bounce, -S.max, S.max));
}

// ------------------------------------------------------------ Ocena sytuacji klubu

function tablesFor(game) {
  const t = {};
  for (const tier of [1, 2, 3]) {
    const comp = TIER_COMP[tier];
    t[tier] = standings(game.fixtures.filter((f) => f.comp === comp), CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id));
  }
  return t;
}

const resOf = (f, id) => { const [a, b] = f.result.score; const me = f.home === id ? a : b; const op = f.home === id ? b : a; return me > op ? 'W' : me < op ? 'L' : 'D'; };

/**
 * Presja na trenera klubu AI: { C, parts, pos, size, target, played, left, inDrop }. Liczona przez pryzmat właściciela
 * (ambicja przesuwa oczekiwane miejsce, media ważą presję kibiców).
 */
export function coachPressure(game, clubId, tables, date, p = coachOf(game, clubId)) {
  const K = MARKET;
  const club = clubById(clubId);
  const o = ownerOf(game, clubId);
  const table = tables[club.tier] ?? [];
  const row = table.find((r) => r.id === clubId);
  const size = table.length || 18;
  const dropFrom = size - (club.tier === 3 ? 4 : 3) + 1;
  const goal = seasonGoalFor(club);
  const target = Math.max(1, goal.target - (o.ambicja - 10) * K.ambitionShift);
  const comp = TIER_COMP[club.tier];
  const lf = game.fixtures.filter((f) => f.comp === comp && f.played && (f.home === clubId || f.away === clubId)).sort((a, b) => a.date.localeCompare(b.date));
  const played = lf.length;
  const total = (size - 1) * 2;
  const conf = Math.min(1, played / K.conf);
  const pos = row?.pos ?? Math.round(size / 2);
  const parts = {};
  parts.table = K.gapW * Math.max(0, pos - target) * conf;
  parts.drop = (pos >= dropFrom ? K.drop : pos === dropFrom - 1 ? K.nearDrop : 0) * conf;
  const last5 = lf.slice(-5);
  const ppg = last5.length ? last5.reduce((s, f) => s + ({ W: 3, D: 1, L: 0 })[resOf(f, clubId)], 0) / last5.length : K.formRef;
  parts.form = K.formW * Math.max(0, K.formRef - ppg) * (last5.length / 5) * (1 + 0.04 * (o.temperament - 10));
  let lost = 0; let winless = 0;
  for (let i = lf.length - 1; i >= 0; i--) { if (resOf(lf[i], clubId) !== 'L') break; lost++; }
  for (let i = lf.length - 1; i >= 0; i--) { if (resOf(lf[i], clubId) === 'W') break; winless++; }
  parts.streak = K.streakW * Math.max(0, lost - 2) + K.winlessW * Math.max(0, winless - 4);
  const st = ensureCoachMarket(game).clubs[clubId];
  parts.shock = (st?.shocks ?? []).reduce((s, x) => s + x.v * Math.max(0, 1 - daysBetween(x.date, date) / K.shockDays), 0);
  parts.fans = (game.fans?.clubs?.[clubId]?.heat ?? 0) * K.fansW / 100 * o.media / 10;
  let C = Object.values(parts).reduce((s, v) => s + v, 0);
  // Nowy trener: okres ochronny (porywczy właściciel krótszy)
  // Okres ochronny tylko dla zatrudnionych w trakcie sezonu (latem trener ma okres przygotowawczy)
  const cm = coachMatches(game, clubId, p);
  const summerHire = p?.from && ['06', '07'].includes(p.from.slice(5, 7));
  if (cm < K.honeyMatches && !summerHire) C *= Math.min(1, 0.35 + 0.65 * cm / K.honeyMatches + 0.02 * Math.max(0, o.temperament - 10));
  return { C: r1(C), parts, pos, size, target: r1(target), played, left: total - played, inDrop: pos >= dropFrom, goal };
}

/** Mecze o punkty klubu od początku pracy trenera (tylko bieżący terminarz). */
export function coachMatches(game, clubId, p = coachOf(game, clubId)) {
  const from = p?.from ?? '0000';
  return game.fixtures.filter((f) => f.played && f.date >= from && f.comp !== 'friendly' && (f.home === clubId || f.away === clubId)).length;
}

/** Próg właściciela: cierpliwość podnosi, porywczość obniża, kapitał trenera (cel wykonany, długi staż) podnosi. */
export function ownerThreshold(game, clubId, p, date) {
  const K = MARKET;
  const o = ownerOf(game, clubId);
  let thr = K.thr + (K.thrTier[tierOf(clubId)] ?? 0) + K.thrPat * (o.cierpliwosc - 10) - K.thrTemper * (o.temperament - 10);
  if (p?.credit) thr += K.credit;
  if (p?.from && daysBetween(p.from, date) > 730) thr += K.longTenure;
  return thr;
}

/** Szansa zwolnienia po meczu. rng: los właściciela (nastrój dnia: rozrzut zależny od temperamentu). */
export function fireChance(game, clubId, pr, date, rng = null, shift = 0) {
  const K = MARKET;
  const o = ownerOf(game, clubId);
  const p = coachOf(game, clubId);
  if (pr.played < K.startRound) return 0;
  if (p?.n && p.from && coachMatches(game, clubId, p) < K.minMatches) return 0;
  const thr = ownerThreshold(game, clubId, p, date) + shift + (rng ? rng.gauss(0, K.thrNoise * o.temperament) : 0);
  const x = (pr.C - thr) / K.span;
  if (x <= 0) return 0;
  let h = K.hMax * Math.min(1, x) ** K.hPow;
  if (pr.left < K.lateRounds && !pr.inDrop) h *= 0.3;
  if (pr.left <= 1) h = 0;
  return h * (0.85 + 0.015 * o.zasobnosc);
}

// ------------------------------------------------------------ Zwolnienie, tymczasowy, zatrudnienie

function caretakerProfile(game, clubId, date, rng) {
  const st = staffOf(game, clubId).asystent;
  const q = staffQ(game, clubId, 'asystent');
  const A = COACH.assistant;
  const v = A.base + A.perQ * q + (A.tier[tierOf(clubId)] ?? 0) - 0.5;
  const a = {};
  for (const k of COACH_KEYS) a[k] = clamp(Math.round(v + rng.gauss(0, 1.2)), 1, 20);
  const nm = st?.name ?? (() => { const n = randomName('POL', rng); return `${n.first} ${n.last}`; })();
  return { id: `tymczasowy:${clubId}:${date}`, name: nm, nat: 'POL', style: clubById(clubId)?.coach ?? 'P', age: st?.age ?? rng.int(32, 55), a, caretaker: true, hist: [], v: 2 };
}

function coachPay(game, clubId) {
  const plan = game.finance?.clubs?.[clubId]?.plan;
  const P = MARKET.pay;
  return Math.round(Math.max(P.min[tierOf(clubId)] ?? 8000, (plan?.wages ?? 0) * P.share / 12) / 1000) * 1000;
}

const notable = (game, clubId) => {
  const c = clubById(clubId); const me = clubById(game.clubId);
  return !!c && !c.parent && (c.tier === me?.tier || (c.tier === 1 && c.prestige >= 7));
};
const media = (date, key, subject, body) => createMessage({ date, key, category: 'media', from: 'Media', priority: 'info', subject, body });

function closeHist(p, clubId, date, why) {
  const h = (p.hist ??= []);
  h.unshift({ club: clubId, from: p.from ?? null, to: date, why });
  p.hist = h.slice(0, 6);
}

/**
 * Zwolnienie trenera klubu AI: trener trafia do puli wolnych trenerów, zespół przejmuje asystent jako trener
 * tymczasowy, klub płaci odprawę. opts: { why: 'wyniki'|'kibice'|'po sezonie'|'odejście', pr, rng, toEnd }.
 * Zwraca { out, caretaker, messages } albo null.
 */
export function fireCoach(game, clubId, date, opts = {}) {
  if (!game?.world?.clubs?.[clubId] || clubId === game.clubId) return null;
  const M = ensureCoachMarket(game);
  const rng = opts.rng ?? new Rng(`zwolnienie:${game.seed}:${clubId}:${date}`);
  const old = coachOf(game, clubId);
  const why = opts.why ?? 'wyniki';
  const messages = [];
  if (old && !old.caretaker) {
    if (!opts.poached) closeHist(old, clubId, date, why);
    // Podebrany trener przechodzi do innego klubu (hireCoach), pozostali trafiają do puli wolnych trenerów
    if (!opts.poached) M.pool.push({ ...old, id: old.id ?? `${clubId}#${old.n ?? 0}`, lastClub: clubId, lastTier: tierOf(clubId), free: date, caretaker: false, boost: 0, fit: 0, fitY: null, credit: false });
    const comp = MARKET.pay.months * coachPay(game, clubId);
    if (game.finance?.clubs?.[clubId] && why !== 'odejście') book(game.finance, clubId, date, 'out', 'ops', comp, `Odprawa dla trenera (${old.name})`);
  }
  const S = statsOf(game);
  const t = tierOf(clubId);
  if (old?.caretaker) { /* koniec zastępstwa: bez liczenia */ } else if (why === 'odejście') S.left[t] = (S.left[t] ?? 0) + 1;
  else if (opts.summer) S.summer[t] = (S.summer[t] ?? 0) + 1;
  else { S.inSeason[t] = (S.inSeason[t] ?? 0) + 1; const m = date.slice(0, 7); S.byMonth[m] = (S.byMonth[m] ?? 0) + 1; }
  if (why === 'kibice') S.fans++;
  (M.clubs[clubId] ??= {}).shocks = [];
  if (opts.direct) return { out: old, caretaker: null, messages: [] }; // po sezonie: od razu nowy trener (hireCoach)
  const o = ownerOf(game, clubId);
  const [d0, d1] = MARKET.caretaker[o.type] ?? MARKET.caretaker.prywatny;
  const ct = caretakerProfile(game, clubId, date, rng);
  ct.until = opts.toEnd ? null : addDays(date, rng.int(d0, d1));
  replaceCoach(game, clubId, date, ct, why);
  const pr = opts.pr;
  if (notable(game, clubId) && !opts.quiet && old && !old.caretaker) {
    const reason = why === 'kibice' ? 'po presji kibiców' : why === 'odejście' ? 'po sezonie' : why === 'po sezonie' ? 'po rozczarowującym sezonie' : pr ? `przy ${pr.pos}. miejscu w tabeli` : 'po słabych wynikach';
    const verb = why === 'odejście' ? 'odchodzi z klubu' : 'nie jest już trenerem klubu';
    messages.push(media(date, `trener-out:${clubId}:${date}`, `${nameOf(clubId)}: ${old.name} ${why === 'odejście' ? 'odchodzi' : 'zwolniony'}`,
      `${old.name} ${verb} ${nameOf(clubId)} ${reason}.${old.from ? ` Prowadził zespół od ${fmtDate(old.from)}.` : ''} ${opts.toEnd ? `Do końca sezonu drużynę poprowadzi asystent ${ct.name}.` : `Tymczasowo drużynę poprowadzi asystent ${ct.name}.`}`));
  }
  return { out: old, caretaker: ct, messages };
}


/** Poziom trenera, na jakiego stać klub: poziom ligi i prestiżu, ambicja i pieniądze właściciela. */
export function hireLevel(game, clubId) {
  const o = ownerOf(game, clubId);
  const H = MARKET.hire;
  return coachLevelFor(clubId) + H.ambition * (o.ambicja - 10) + H.wealth * (o.zasobnosc - 10);
}

/**
 * Zatrudnienie nowego trenera: kandydaci z puli wolnych trenerów (do poziomu klubu + 2) i czasem trenerzy klubów
 * niższej ligi; właściciel ocenia z błędem (porywczy bardziej losowo), w walce o utrzymanie woli ostrożnego trenera.
 * Zwraca { coach, from, messages }.
 */
export function hireCoach(game, clubId, date, { rng = null, inDrop = false, quiet = false } = {}) {
  if (!game?.world?.clubs?.[clubId] || clubId === game.clubId) return null;
  const M = ensureCoachMarket(game);
  rng ??= new Rng(`zatrudnienie:${game.seed}:${clubId}:${date}`);
  const H = MARKET.hire;
  const o = ownerOf(game, clubId);
  const L = hireLevel(game, clubId);
  const t = tierOf(clubId);
  const cands = M.pool.filter((c) => coachAvg(c) <= L + H.reach && c.lastClub !== clubId).map((c) => ({ c, src: null }));
  if (rng.chance(H.poachP)) {
    for (const [id, p] of Object.entries(game.coaches ?? {})) {
      if (id === clubId || id === game.clubId || p.caretaker || tierOf(id) <= t || clubById(id)?.parent) continue;
      const avg = coachAvg(p);
      if (avg >= L - 0.5 && avg <= L + H.reach && p.credit) cands.push({ c: p, src: id });
    }
  }
  const sd = H.judgeSd + H.judgeTemper * o.temperament;
  let best = null; let bestScore = -Infinity;
  for (const x of cands) {
    // Lepszy trener niż poziom klubu jest drogi i rzadko chce przyjść: nadwyżka liczy się w ocenie tylko w 40 %
    const avg = coachAvg(x.c);
    const foreign = x.c.nat && x.c.nat !== 'POL' ? (H.foreign[t] ?? 0) + (o.type === 'miliarder' ? 0.3 : 0) : 0;
    const score = avg - H.over * Math.max(0, avg - L) + rng.gauss(0, sd) + (inDrop && x.c.style === 'S' ? H.rescueS : 0) + foreign - (x.src ? 0.3 : 0);
    if (score > bestScore) { bestScore = score; best = x; }
  }
  const S = statsOf(game);
  let next; let from = null;
  if (!best) {
    next = poolCoach(game, `nowy:${clubId}:${date}`, { mean: L - 0.5 });
    S.hires.pool++;
  } else if (best.src) {
    from = best.src;
    const src = game.coaches[best.src];
    closeHist(src, best.src, date, 'odejście');
    next = { ...src, hist: [...src.hist] };
    S.hires.poached++;
  } else {
    next = best.c;
    M.pool = M.pool.filter((c) => c !== best.c);
    from = best.c.lastClub ?? null;
    S.hires.pool++;
  }
  next = { ...next, caretaker: false, until: null, free: null, credit: false, fitY: null, boost: 0, lastClub: undefined };
  const prev = coachOf(game, clubId);
  replaceCoach(game, clubId, date, next, 'zatrudnienie');
  // Nowa miotła: jednorazowo morale kadry (badania: efekt zmiany trenera jest mały i krótki, docs rozdz. 2.6)
  for (const id of game.world.clubs[clubId].squad) { const pl = game.world.players[id]; if (pl) pl.morale = applyMorale(pl.morale ?? 12, MARKET.bounceMorale); }
  updateBoost(game, clubId, next, date);
  const messages = [];
  if (best?.src) {
    // Klub, któremu podebrano trenera: asystent tymczasowo, potem własne poszukiwania
    fireCoach(game, best.src, date, { why: 'odejście', rng: rng.fork('podebrany'), quiet: true, poached: true, summer: !!quiet });
  }
  if (notable(game, clubId) && !quiet) {
    const was = from ? ` Ostatnio pracował w klubie ${nameOf(from)}.` : best ? ' Był bez pracy.' : '';
    const nat = next.nat && next.nat !== 'POL' ? ' Szkoleniowiec z zagranicy.' : '';
    messages.push(media(date, `trener-in:${clubId}:${date}`, `${nameOf(clubId)}: nowy trener ${next.name}`,
      `${next.name} (${next.age} ${plural(next.age, 'rok', 'lata', 'lat')}) został trenerem klubu ${nameOf(clubId)}${prev?.caretaker ? ` po okresie, w którym drużynę prowadził ${prev.name}` : ''}. Styl: ${COACH_STYLES[next.style] ?? 'pragmatyczny'}.${was}${nat}`));
  }
  return { coach: next, from, messages };
}

/** Trener tymczasowy na stałe (dobre wyniki w czasie zastępstwa). */
function keepCaretaker(game, clubId, date) {
  const p = coachOf(game, clubId);
  p.caretaker = false; p.until = null;
  statsOf(game).hires.caretaker++;
  const log = (game.coachLog ??= []);
  log.unshift({ date, club: clubId, out: null, in: p.name, why: 'na stałe' });
  return notable(game, clubId) ? [media(date, `trener-in:${clubId}:${date}`, `${nameOf(clubId)}: ${p.name} zostaje na dłużej`, `${p.name}, dotąd trener tymczasowy, poprowadzi zespół ${nameOf(clubId)} na stałe.`)] : [];
}

// ------------------------------------------------------------ Puchary: odpadnięcie jako wstrząs

function cupShocks(game, date) {
  const M = ensureCoachMarket(game);
  for (const f of game.fixtures) {
    if (f.date !== date || !f.played || (f.comp !== 'pp' && f.comp !== 'uefa')) continue;
    const w = winnerOf(f);
    if (f.comp === 'uefa' && !(f.leg === 2 || (!f.leg && f.round !== 'league'))) continue;
    for (const id of [f.home, f.away]) {
      if (id === game.clubId || !game.world.clubs[id]) continue;
      let lost = w && w !== id;
      if (f.comp === 'uefa' && f.leg === 2) {
        const first = game.fixtures.find((x) => x.comp === 'uefa' && x.leg === 1 && x.round === f.round && x.ucomp === f.ucomp && x.home === f.away && x.away === f.home && x.played);
        if (first) { const goals = (fx, c) => (fx.home === c ? fx.result.score[0] : fx.result.score[1]); const me = goals(first, id) + goals(f, id); const op = goals(first, id === f.home ? f.away : f.home) + goals(f, id === f.home ? f.away : f.home); lost = me < op || (me === op && w !== id); }
      }
      if (!lost) continue;
      const o = ownerOf(game, id);
      const opp = id === f.home ? f.away : f.home;
      const v = f.comp === 'uefa' ? MARKET.uefaShock * (1 + 0.08 * (o.ambicja - 10)) : (tierOf(opp) > tierOf(id) ? MARKET.cupShock : MARKET.cupShockLower * Math.max(0.2, (o.ambicja - 6) / 8));
      ((M.clubs[id] ??= {}).shocks ??= []).push({ date, v: r1(v), comp: f.comp });
    }
  }
}

// ------------------------------------------------------------ Dzień

/** Kluby AI, które grały mecz ligowy wczoraj (ocena właściciela dzień po meczu). */
function playedYesterday(game, date) {
  const y = addDays(date, -1);
  const out = new Set();
  for (const f of game.fixtures) if (f.date === y && f.played && LEAGUE_COMPS.has(f.comp)) { out.add(f.home); out.add(f.away); }
  return out;
}

/** System dnia rynku trenerów. Zwraca wiadomości do poczty. */
export function coachMarketDay(game, date) {
  if (!game.world || !game.fixtures) return [];
  ensureCoachMarket(game);
  const messages = [];
  // Sezon trenera: dopasowanie i nowa miotła (codziennie, tanio)
  for (const [id, p] of Object.entries(game.coaches ?? {})) if (id !== game.clubId && game.world.clubs[id]) updateBoost(game, id, p, date);
  cupShocks(game, addDays(date, -1));
  const y = seasonYear(game);
  // Przegląd po sezonie (po ostatniej kolejce wszystkich lig, przed barażami o awans z niższych lig)
  if (date === `${y + 1}-06-02`) messages.push(...summerReview(game, date));
  // Koniec zastępstwa: zatrudnienie nowego trenera
  let tables = null;
  for (const [id, p] of Object.entries(game.coaches ?? {})) {
    if (!p.caretaker || id === game.clubId || !game.world.clubs[id] || !p.until || p.until > date) continue;
    tables ??= tablesFor(game);
    const rng = new Rng(`zastepstwo:${game.seed}:${id}:${date}`);
    const cm = coachMatches(game, id, p);
    const lf = game.fixtures.filter((f) => f.played && f.date >= p.from && LEAGUE_COMPS.has(f.comp) && (f.home === id || f.away === id));
    const ppg = lf.length ? lf.reduce((s, f) => s + ({ W: 3, D: 1, L: 0 })[resOf(f, id)], 0) / lf.length : 0;
    if (cm >= 2 && rng.chance(ppg >= 1.8 ? 0.5 : MARKET.caretakerStays * (ppg >= 1.3 ? 1 : 0.3))) { messages.push(...keepCaretaker(game, id, date)); continue; }
    const pr = coachPressure(game, id, tables, date, p);
    messages.push(...(hireCoach(game, id, date, { rng, inDrop: pr.inDrop })?.messages ?? []));
  }
  // Ocena po meczu; w przerwie zimowej jeden przegląd wszystkich klubów
  const winter = date === `${y}-${MARKET.winter.date}`;
  const played = winter ? new Set(Object.keys(game.world.clubs)) : playedYesterday(game, date);
  if (!played.size) return messages;
  tables ??= tablesFor(game);
  for (const id of played) {
    if (id === game.clubId || !game.world.clubs[id] || clubById(id)?.tier > 3 || clubById(id)?.parent) continue;
    const p = coachOf(game, id);
    if (!p || p.caretaker) continue;
    const pr = coachPressure(game, id, tables, date, p);
    const rng = new Rng(`ocena-trenera:${game.seed}:${id}:${date}`);
    const h = fireChance(game, id, pr, date, rng, winter ? MARKET.winter.thr : 0);
    if (!h || !rng.chance(h)) continue;
    const toEnd = date >= `${y + 1}-04-15` && rng.chance(MARKET.caretakerToEnd);
    const r = fireCoach(game, id, date, { why: 'wyniki', pr, rng, toEnd });
    if (r) messages.push(...r.messages);
  }
  return messages;
}

/**
 * Przegląd po sezonie (2 czerwca): spadek, sezon wyraźnie poniżej oczekiwań, trener tymczasowy do zastąpienia,
 * odejście trenera po udanym sezonie (lepsza oferta, koniec umowy). Kapitał trenera na kolejny sezon (cel wykonany).
 */
export function summerReview(game, date) {
  const tables = tablesFor(game);
  const S = MARKET.summer;
  const messages = [];
  const changes = [];
  for (const tier of [1, 2, 3]) {
    const t = tables[tier] ?? [];
    for (const row of t) {
      const id = row.id;
      if (id === game.clubId || !game.world.clubs[id] || clubById(id)?.parent) continue;
      const p = coachOf(game, id);
      if (!p) continue;
      const o = ownerOf(game, id);
      const rng = new Rng(`po-sezonie:${game.seed}:${id}:${date}`);
      const pr = coachPressure(game, id, tables, date, p);
      const relegated = pr.inDrop;
      const gap = row.pos - pr.target;
      p.credit = gap <= 0;
      const impatience = 1 + 0.06 * (10 - o.cierpliwosc) + 0.03 * (o.temperament - 10);
      let pFire = 0; let why = 'po sezonie';
      if (p.caretaker) pFire = S.caretaker;
      else if (relegated) pFire = S.relegated * impatience;
      else if (gap >= S.gapFrom) pFire = Math.min(0.6, S.perGap * gap * impatience);
      else if (tier > 1 && row.pos <= 2) pFire = S.promoted;
      else pFire = S.base * impatience;
      let leave = 0;
      if (!p.caretaker && gap <= -3 && tier > 1) leave = S.poached; // udany sezon: trener odchodzi do lepszego klubu
      if (p.caretaker) {
        if (!rng.chance(pFire)) { keepCaretaker(game, id, date); continue; }
        const r = hireCoach(game, id, date, { rng, inDrop: false, quiet: true });
        if (r) changes.push({ id, out: p.name, in: r.coach.name, why: 'tymczasowy' });
        continue;
      }
      if (rng.chance(Math.max(0, pFire))) {
        const r = fireCoach(game, id, date, { why, rng, summer: true, quiet: true, direct: true });
        const h = r && hireCoach(game, id, date, { rng: rng.fork('nowy'), quiet: true });
        if (h) changes.push({ id, out: r.out?.name, in: h.coach.name, why });
      } else if (leave && rng.chance(leave)) {
        const r = fireCoach(game, id, date, { why: 'odejście', rng, summer: true, quiet: true, direct: true });
        const h = r && hireCoach(game, id, date, { rng: rng.fork('nowy'), quiet: true });
        if (h) changes.push({ id, out: r.out?.name, in: h.coach.name, why: 'odejście' });
      }
    }
  }
  const me = clubById(game.clubId)?.tier;
  const mine = changes.filter((c) => notable(game, c.id));
  if (mine.length) {
    messages.push(media(date, `karuzela:${date}`, `Karuzela trenerska po sezonie (${mine.length})`,
      `${mine.map((c) => `${nameOf(c.id)}: ${c.out ?? 'trener tymczasowy'} -> ${c.in}${c.why === 'odejście' ? ' (trener odszedł)' : ''}`).join('\n')}\n\nZmiany w ${LEAGUE_NAMES[me] ?? 'lidze'} i w czołowych klubach Ekstraklasy.`));
  }
  return messages;
}

/** Nowy sezon (rollover 1 lipca): trenerzy w puli starsi, część odchodzi z zawodu, nowi trenerzy w puli. */
export function coachMarketNewSeason(game, year) {
  const M = ensureCoachMarket(game);
  const P = MARKET.pool;
  const rng = new Rng(`pula-sezon:${game.seed}:${year}`);
  M.pool = M.pool.filter((c) => {
    c.age = (c.age ?? 50) + 1;
    if (c.age >= P.maxAge) return false;
    const idle = c.free ? daysBetween(c.free, `${year}-07-01`) : 365;
    return !(idle > 700 && rng.chance(P.gone));
  });
  for (let i = 0; i < P.perSeason; i++) M.pool.push(poolCoach(game, `${year}:${i}`, { age: rng.int(33, 46), mean: P.mean - 0.6 }));
  // Historia statystyk: najwyżej 10 sezonów
  const ys = Object.keys(M.stats).sort();
  for (const k of ys.slice(0, Math.max(0, ys.length - 10))) delete M.stats[k];
}

/** Szansa, że właściciel ulegnie żądaniu kibiców (media 10: 0,45, media 18: 0,65, rezerwy: 0). */
export function fansSackP(game, clubId) {
  if (clubById(clubId)?.parent || !game?.world?.clubs?.[clubId]) return 0;
  return clamp(0.2 + 0.025 * ownerOf(game, clubId).media, 0, 0.8);
}

/** Zgłoszenie z modułu kibiców: żądanie zwolnienia trenera, zarząd ulega (career/fans.js). */
export function fansSackCoach(game, clubId, date) {
  return fireCoach(game, clubId, date, { why: 'kibice' });
}

registerDailySystem({
  id: 'coachMarket', order: 57,
  run(game, date) {
    if (!game.season || !game.fixtures || !game.world) return {};
    return { messages: coachMarketDay(game, date) };
  },
});
