// Finanse klubów (etap 9, poziom średni). Gospodarka liczona względem rachunku płac klubu, żeby skala była
// spójna z pensjami w świecie gry (ok. 1/6 rzeczywistych): przychód bazowy ok. 1,35 x roczne płace.
// Źródła: bilety (z frekwencji i rangi meczu), TV, sponsorzy, pozostałe (koszulki, catering), nagrody
// (Puchar Polski, UEFA, miejsce w lidze), sprzedaż zawodników. Koszty: pensje co tydzień, koszty klubu
// co miesiąc, transfery, premie za podpis, prowizje. Klub AI nie wydaje ponad budżet, więc nie bankrutuje.
// Wszystkie liczby oznaczone [SZAC] to założenia do kalibracji.

import { clamp } from '../core/rng.js';
import { CLUBS_PL } from '../data/clubs_pl.js';

export const FIN = {
  REVENUE_X_WAGES: 1.35, // [SZAC] przychód bazowy do rocznych płac
  SHARE: { tv: 0.30, sponsor: 0.27, tickets: 0.25, other: 0.18 }, // udział źródeł w przychodzie bazowym [SZAC]
  OPS: 0.17, // koszty klubu (sztab, stadion, podróże, akademia) jako część przychodu bazowego, rocznie [SZAC]
  HOME_GAMES: 17,
  WAGE_BUDGET_X: { 1: 1.08, 2: 1.07, 3: 1.05 }, // budżet płac do obecnych płac [SZAC]
  ECON: 0.08, // skala realnych kwot (nagrody UEFA) do gospodarki gry [SZAC]
  EUR: 4.25,
};

// Nagrody UEFA w mln EUR (rząd wielkości z sezonów 2024-2026) [SZAC]
const UEFA_PRIZE = {
  LM: { Q1: 0.4, Q2: 0.5, Q3: 0.6, PO: 1.0, league: 18.6, win: 2.1, draw: 0.7, KPO: 1.0, R16: 11, QF: 12.5, SF: 15, F: 18.5 },
  LE: { Q3: 0.48, PO: 0.6, league: 4.31, win: 0.45, draw: 0.15, KPO: 0.3, R16: 1.75, QF: 3, SF: 4.5, F: 7 },
  LK: { Q1: 0.2, Q2: 0.35, Q3: 0.45, PO: 0.6, league: 3.17, win: 0.4, draw: 0.13, KPO: 0.2, R16: 0.8, QF: 1.3, SF: 2.5, F: 3.5 },
};
export const uefaPrize = (comp, key) => Math.round((UEFA_PRIZE[comp]?.[key] ?? 0) * 1e6 * FIN.EUR * FIN.ECON / 1000) * 1000;
// Puchar Polski: premia za awans do rundy (zł) [SZAC]
export const PP_PRIZE = { R64: 40000, R32: 80000, R16: 120000, QF: 200000, SF: 300000, F: 450000, W: 700000 };

/** Pojemność stadionu (tylko do frekwencji i wyświetlania) z prestiżu i ligi. [SZAC] */
export function stadiumCapacity(club) {
  if (!club) return 5000;
  if (club.tier === 1) return Math.round((7000 + club.prestige * 2600) / 500) * 500;
  if (club.tier === 2) return Math.round((3000 + club.prestige * 1400) / 500) * 500;
  if (club.tier === 3) return Math.round((1500 + club.prestige * 700) / 500) * 500;
  return 2000;
}

const wageBill = (world, clubId) => (world.clubs[clubId]?.squad ?? []).reduce((s, id) => s + (world.players[id]?.contract?.wage ?? 0), 0);
const monthKey = (iso) => iso.slice(0, 7);

/** Finanse klubu na start sezonu. */
function initClub(world, club) {
  const wages = wageBill(world, club.id);
  const base = Math.round(wages * 52 * FIN.REVENUE_X_WAGES);
  const balance = Math.round(base * (0.08 + club.prestige * 0.015) / 10000) * 10000;
  return {
    base, balance, start: balance,
    transferBudget: Math.round(Math.max(0, balance * 0.45) / 10000) * 10000,
    wageBudget: Math.round(wages * (FIN.WAGE_BUDGET_X[club.tier] ?? 1.05) / 100) * 100,
    ledger: {}, // { '2026-08': { in: { tickets, tv, ... }, out: { wages, ops, ... } } }
    log: [],
  };
}

export function createFinance(world) {
  const clubs = {};
  for (const c of CLUBS_PL) if (world.clubs[c.id]) clubs[c.id] = initClub(world, c);
  return { clubs, processed: {} };
}

/** Zapis przychodu (kind w 'in') lub kosztu (kind w 'out'). */
export function book(F, clubId, date, dir, kind, amount, note = null) {
  const c = F.clubs[clubId];
  if (!c || !amount) return;
  const m = (c.ledger[monthKey(date)] ??= { in: {}, out: {} });
  m[dir][kind] = (m[dir][kind] ?? 0) + Math.round(amount);
  c.balance += dir === 'in' ? Math.round(amount) : -Math.round(amount);
  if (note) { c.log.unshift({ date, dir, kind, amount: Math.round(amount), note }); c.log.length = Math.min(c.log.length, 40); }
}

/** Frekwencja meczu (0-1) z rangi, formy i miejsca w tabeli. [SZAC] */
export function attendanceFill(f, homeRow, awayClub) {
  let fill = 0.62;
  if (f.comp === 'uefa') fill = 0.92;
  else if (f.comp === 'pp') fill = f.round === 'F' ? 1 : 0.45 + (['QF', 'SF'].includes(f.round) ? 0.25 : 0);
  else if (f.comp === 'super') fill = 0.8;
  if (homeRow) fill += clamp((homeRow.form?.filter((x) => x === 'W').length ?? 0) * 0.03 - (homeRow.pos > 12 ? 0.06 : 0), -0.1, 0.15);
  if (awayClub?.prestige >= 8) fill += 0.1;
  if (f.derby) fill += 0.15;
  return clamp(fill, 0.25, 1);
}

/** Wpływy z meczu dla gospodarza (bilety z frekwencji). Finał PP na neutralnym stadionie dzielony po połowie. */
export function matchIncome(F, f, fill) {
  const home = F.clubs[f.home];
  const per = (c) => (c ? (c.base * FIN.SHARE.tickets) / FIN.HOME_GAMES : 0);
  const rank = f.comp === 'uefa' ? 1.35 : f.comp === 'pp' ? (f.round === 'F' ? 1.5 : 0.6) : f.comp === 'super' ? 1 : 1;
  if (f.neutral) return [per(home) * rank * fill / 0.62 / 2, per(F.clubs[f.away]) * rank * fill / 0.62 / 2];
  return [per(home) * rank * fill / 0.62, 0];
}

/** Co tydzień (poniedziałek): pensje. Co miesiąc (1.): TV, sponsorzy, pozostałe, koszty klubu. */
export function financeDay(F, world, date) {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  for (const [id, c] of Object.entries(F.clubs)) {
    if (dow === 1) book(F, id, date, 'out', 'wages', wageBill(world, id));
    if (date.endsWith('-01')) {
      book(F, id, date, 'in', 'tv', (c.base * FIN.SHARE.tv) / 12);
      book(F, id, date, 'in', 'sponsor', (c.base * FIN.SHARE.sponsor) / 12);
      book(F, id, date, 'in', 'other', (c.base * FIN.SHARE.other) / 12);
      book(F, id, date, 'out', 'ops', (c.base * FIN.OPS) / 12);
    }
  }
}

export function monthSummary(c, month) {
  const m = c.ledger[month] ?? { in: {}, out: {} };
  const sum = (o) => Object.values(o).reduce((s, x) => s + x, 0);
  return { month, in: m.in, out: m.out, income: sum(m.in), expense: sum(m.out), net: sum(m.in) - sum(m.out) };
}

export function seasonSummary(c) {
  const tot = { in: {}, out: {} };
  for (const m of Object.values(c.ledger)) for (const d of ['in', 'out']) for (const [k, v] of Object.entries(m[d])) tot[d][k] = (tot[d][k] ?? 0) + v;
  const sum = (o) => Object.values(o).reduce((s, x) => s + x, 0);
  return { ...tot, income: sum(tot.in), expense: sum(tot.out), net: sum(tot.in) - sum(tot.out) };
}

export const FIN_LABELS = {
  tickets: 'Bilety', tv: 'Prawa TV', sponsor: 'Sponsorzy', other: 'Koszulki, catering, inne', prize: 'Nagrody', sales: 'Sprzedaż zawodników', loans: 'Wypożyczenia',
  wages: 'Pensje', ops: 'Koszty klubu', transfers: 'Transfery', signOn: 'Premie za podpis', agents: 'Prowizje agentów', release: 'Rozwiązania kontraktów',
};

/** Ile klub może dziś wydać (budżet transferowy ograniczony saldem). */
export function spendable(F, clubId) {
  const c = F.clubs[clubId];
  if (!c) return 0;
  return Math.max(0, Math.min(c.transferBudget, c.balance));
}
/** Wolne miejsce w budżecie płac (tygodniowo). */
export function wageRoom(F, world, clubId) {
  const c = F.clubs[clubId];
  return c ? Math.max(0, c.wageBudget - wageBill(world, clubId)) : 0;
}
export { wageBill };
