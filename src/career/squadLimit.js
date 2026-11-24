// Limit kadry (docs/limit-kadry.md): ilu zawodników klub może mieć w pierwszej drużynie.
// Moduł czysty, bez wiadomości i pętli dni: liczenie, limity ligi, zgoda na transfer, ochrona i kolejka zawodników,
// na których zarząd może działać. Nacisk zarządu i działania po terminie: src/career/squadLimitSystem.js.
//
// Zasada w skrócie:
// - liczą się wszyscy zawodnicy pierwszej drużyny, także wypożyczeni DO klubu;
// - nie liczą się wychowankowie do 21 lat (nigdy nie zmienili klubu) i akademia; wypożyczeni Z klubu są w innej kadrze;
// - limit zarządu (miękki): ponad nim zarząd daje 14 dni na redukcję; maksimum (twarde): ponad nim nie ma nowych transferów;
// - gra w pucharach UEFA i kryzys kadrowy (za mało zdrowych na mecz) podnoszą oba progi o 2.

import { clubById } from '../data/clubs_pl.js';
import { squadOf } from '../world/worldGen.js';
import { GROUP, SQUAD_TARGETS, squadDeficits } from './squad.js';

export const SQUAD_LIMITS = {
  1: { soft: 28, hard: 30 },
  2: { soft: 27, hard: 29 },
  3: { soft: 26, hard: 28 },
  4: { soft: 26, hard: 28 }, // III liga jak 2 Liga [SZAC]
};
export const YOUTH_EXEMPT_AGE = 21; // wychowanek do 21 lat nie liczy się do limitu (jak lista B UEFA)
export const EUROPE_BONUS = 2; // gra w pucharach: więcej meczów, szersza kadra
export const EMERGENCY_BONUS = 2; // kryzys kadrowy: zarząd zgadza się na awaryjne wzmocnienie
export const PRESSURE_DAYS = 14; // czas dla trenera na redukcję
export const LISTING_DAYS = 7; // po wystawieniu na listę zarząd czeka jeszcze tydzień
export const EXTENSION_DAYS = 7; // jednorazowa prośba o więcej czasu
export const KEEP_MAX = 3; // ilu zawodników trener może osłonić przed zarządem
export const KEY_PLAYERS = 5; // najlepsi w kadrze (rdzeń) są nietykalni
export const RECENT_DAYS = 120; // zawodnik niedawno sprowadzony jest nietykalny (jak recentlyMoved w transfers.js)
export const BOARD_LIST_PRICE = 0.8; // cena na liście transferowej wystawionej przez zarząd (część wartości)
export const CUT_PRICE = 0.6; // sprzedaż po obniżonej cenie (część wartości)
export const LOAN_MAX_AGE = 23; // wypożyczenie dla młodszych zawodników

const groupOf = (p) => GROUP[p.pos] ?? 'MID';
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);

/** Wychowanek do 21 lat: nigdy nie zmienił klubu (brak lastMove) i nie jest wypożyczony. Nie liczy się do limitu. */
export function isExempt(p) {
  return !!p && (p.age ?? 99) <= YOUTH_EXEMPT_AGE && !p.lastMove && !p.loan;
}

// Kluby z meczami UEFA w terminarzu: zbiór liczony raz na dzień i długość terminarza (126 klubów, 2500 meczów)
const euroCache = new WeakMap();
function inEurope(game, clubId) {
  const fx = game.fixtures ?? [];
  const hit = euroCache.get(game);
  if (hit && hit.date === game.date && hit.n === fx.length && hit.fx === fx) return hit.set.has(clubId);
  const set = new Set();
  for (const f of fx) if (f.comp === 'uefa') { set.add(f.home); set.add(f.away); }
  euroCache.set(game, { date: game.date, n: fx.length, fx, set });
  return set.has(clubId);
}

/** Progi klubu: { tier, soft, hard, europe, emergency }. */
export function squadLimitOf(game, clubId) {
  const tier = Math.min(4, Math.max(1, clubById(clubId)?.tier ?? 3));
  const base = SQUAD_LIMITS[tier];
  const europe = inEurope(game, clubId);
  const emergency = squadDeficits(squadOf(game.world, clubId).filter(Boolean)).some((n) => n.scope === 'match');
  const bonus = (europe ? EUROPE_BONUS : 0) + (emergency ? EMERGENCY_BONUS : 0);
  return { tier, soft: base.soft + bonus, hard: base.hard + bonus, europe, emergency };
}

/**
 * Stan kadry wobec limitu: { counted, exempt[], total, soft, hard, over (ponad limit zarządu), room (wolne miejsca do
 * maksimum), full, europe, emergency }.
 */
export function squadCount(game, clubId) {
  const squad = squadOf(game.world, clubId).filter(Boolean);
  const exempt = squad.filter(isExempt);
  // Zawodnicy w drodze do klubu (transakcja w toku, src/career/transferDeals.js) liczą się już do limitu
  const incoming = (game.market?.deals ?? []).filter((d) => d.to === clubId && !d.end).length;
  // Wolni zawodnicy z umową poza oknem (dołączą w dniu otwarcia okna, src/career/lateJoins.js) też się liczą
  const joining = (game.market?.joins ?? []).filter((j) => j.to === clubId).length;
  const counted = squad.length - exempt.length + incoming + joining;
  const lim = squadLimitOf(game, clubId);
  return { ...lim, counted, exempt, total: squad.length, over: Math.max(0, counted - lim.soft), room: Math.max(0, lim.hard - counted), full: counted >= lim.hard };
}

/**
 * Czy klub może dziś podpisać jeszcze jednego zawodnika (transfer, wypożyczenie, wolny zawodnik).
 * Każdy nowy zawodnik liczy się do limitu. Zwraca { ok, warn, text, count }: warn = podpis przekroczy limit zarządu.
 */
export function canSign(game, clubId = game.clubId) {
  const c = squadCount(game, clubId);
  const extra = [c.europe ? 'gra w pucharach' : '', c.emergency ? 'kryzys kadrowy' : ''].filter(Boolean).join(', ');
  const who = `Do limitu liczą się wszyscy zawodnicy pierwszej drużyny, także wypożyczeni do klubu, bez wychowanków do ${YOUTH_EXEMPT_AGE} lat.`;
  if (c.full) {
    return { ok: false, warn: false, count: c, text: `Limit kadry: ${c.counted}/${c.hard}${extra ? ` (${extra})` : ''}. Zarząd nie zgodzi się na kolejny transfer. ${who} Najpierw sprzedaj, wypożycz albo rozwiąż kontrakt.` };
  }
  if (c.counted + 1 > c.soft) {
    return { ok: true, warn: true, count: c, text: `Po tym podpisie kadra będzie liczyła ${c.counted + 1} zawodników przy limicie zarządu ${c.soft}. Zarząd da ${PRESSURE_DAYS} dni na redukcję. Maksimum: ${c.hard}.` };
  }
  return { ok: true, warn: false, count: c, text: '' };
}

/**
 * Nietykalni dla zarządu: kapitan, pierwsza jedenastka, rdzeń (5 najlepszych), niedawno sprowadzeni (120 dni),
 * wypożyczeni do klubu, wychowankowie do 21 lat i zawodnicy osłonięci przez trenera (keep).
 * Zwraca Map id -> powód.
 */
export function protectedPlayers(game, clubId, date = game.date, keep = []) {
  const out = new Map();
  const squad = squadOf(game.world, clubId).filter(Boolean);
  const mine = clubId === game.clubId;
  const t = mine ? game.tactics ?? {} : {};
  const top = [...squad].sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id)).slice(0, mine ? KEY_PLAYERS : 3);
  for (const p of squad) {
    if (mine && t.captain === p.id) out.set(p.id, 'kapitan');
    else if (mine && (t.xi ?? []).includes(p.id)) out.set(p.id, 'pierwsza jedenastka');
    else if (top.includes(p)) out.set(p.id, 'kluczowy zawodnik');
    else if (p.loan) out.set(p.id, 'wypożyczony do klubu');
    else if (isExempt(p)) out.set(p.id, `wychowanek do ${YOUTH_EXEMPT_AGE} lat`);
    else if (p.lastMove && daysBetween(p.lastMove, date) < RECENT_DAYS) out.set(p.id, 'niedawno sprowadzony');
    else if (keep.includes(p.id)) out.set(p.id, 'osłonięty przez trenera');
  }
  return out;
}

/**
 * Kolejka zawodników, na których zarząd może działać: najsłabsi pierwsi (potem starsi, potem droższe pensje),
 * bez nietykalnych i bez zejścia poniżej minimum grupy pozycji. n: ilu zawodników trzeba wskazać.
 */
export function boardTargets(game, clubId, n, { date = game.date, keep = [] } = {}) {
  if (n <= 0) return [];
  const squad = squadOf(game.world, clubId).filter(Boolean);
  const prot = protectedPlayers(game, clubId, date, keep);
  const left = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of squad) left[groupOf(p)]++;
  const out = [];
  const order = squad.filter((p) => !prot.has(p.id))
    .sort((a, b) => a.ovr - b.ovr || b.age - a.age || (b.contract?.wage ?? 0) - (a.contract?.wage ?? 0) || a.id.localeCompare(b.id));
  for (const p of order) {
    const g = groupOf(p);
    if (left[g] - 1 < SQUAD_TARGETS[g].min) continue;
    left[g]--;
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
}
