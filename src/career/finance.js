// Finanse klubów (etap 9, kalibracja do realiów 2025/26). Model i źródła: docs/finanse.md.
// Przychody z danych klubu (src/data/finanse_klubow.js): prawa TV i centralny podział ligi (część stała, ranking
// historyczny, premia za miejsce), sponsorzy i komercja, dzień meczowy (pojemność, frekwencja, przychód na widza),
// dopłaty właściciela lub miasta, nagrody (Puchar Polski, UEFA w realnych kwotach), sprzedaż zawodników.
// Koszty: pensje zawodników co tydzień, koszty klubu co miesiąc (sztab, administracja, akademia, stadion, podróże),
// transfery, premie za podpis, prowizje. Bogaty właściciel uzupełnia saldo na start sezonu (skarbiec),
// a długi klubów AI pokrywa właściciel (careerSystem.js), więc żaden klub AI nie bankrutuje.
// Wszystkie liczby oznaczone [SZAC] to założenia do kalibracji.

import { clamp } from '../core/rng.js';
import { CLUBS_PL } from '../data/clubs_pl.js';
import { clubFinanceData, EUR_PLN } from '../data/finanse_klubow.js';

const M = 1e6;
export const FIN = {
  EUR: EUR_PLN,
  REVENUE_X_WAGES: 1.35, // tylko awaryjnie (klub bez finansów): przychód do rocznych płac [SZAC]
  ECON: 1, // nagrody UEFA w pełnych kwotach (gospodarka gry w realnej skali)
  HOME_GAMES: 17,
  PLAYERS_SHARE: 0.85, // zawodnicy w płacach I drużyny (reszta to sztab) [SZAC]
  STAFF: 0.5, // pozostałe pensje (sztab, administracja, rezerwy, młodzież) do płac zawodników; GT 2025/26: 78/14/8 % [SZAC]
  OTHER_COSTS: { 1: 0.3, 2: 0.25, 3: 0.25, 4: 0.25 }, // koszty stadionu, meczów, podróży, akademii do przychodów krajowych [SZAC]
  SPONSOR_SHARE: 0.75, // część komercji od sponsorów, reszta to koszulki, catering i inne [SZAC]
  // Centralny podział ligi (Ekstraklasa SA 2025/26: 8 222 700 zł części stałej, mistrz 22,6 mln za wynik, 4,4 mln za ranking)
  TV_FIXED: { 1: 8.22 * M, 2: 2.0 * M, 3: 0.4 * M, 4: 0 }, // 1 i 2 Liga [SZAC]
  TV_RANKING: 4.4 * M, // ranking historyczny dla prestiżu 10, skala (prestiż/10)^1,5 [SZAC]
  MERIT: { 1: [22.6 * M, 0.82], 2: [1.5 * M, 0.85], 3: [0.3 * M, 0.85] }, // [premia mistrza, spadek na miejsce] [SZAC poza mistrzem EK]
  RELEGATION_COMP: 1.0 * M, // rekompensata dla spadkowiczów z Ekstraklasy (2025/26)
  // Zmiana ligi względem danych klubu: komercja, frekwencja, ceny, płace [SZAC]
  K_KOM: { 1: 1, 2: 0.55, 3: 0.3, 4: 0.15 },
  K_ATT: { 1: 1, 2: 0.75, 3: 0.55, 4: 0.4 },
  K_PRICE: { 1: 1, 2: 0.7, 3: 0.5, 4: 0.4 },
  K_WAGE: { 1: 1, 2: 0.4, 3: 0.15, 4: 0.08 },
  START_BALANCE: 0.15, // saldo na start gry jako część rocznych przychodów krajowych [SZAC]
  TRANSFER_SHARE: 0.6, // część wolnego salda na transfery [SZAC]
  TRANSFER_SHARE_RICH: 0.85, // klub z bogatym właścicielem (skarbiec) [SZAC]
  TRANSFER_CAP: 0.25, // budżet transferowy najwyżej 1/4 rocznych przychodów krajowych plus skarbiec właściciela [SZAC]
  RELEGATION_WAGE_CUT: 0.3, // obniżka pensji po spadku, gdy kontrakt nie ma własnej klauzuli [SZAC]
  WAGE_BUDGET_X: 1.05, // budżet płac do docelowych płac [SZAC]
  SURPLUS_CAP: 0.5, // klub AI trzyma najwyżej pół rocznych przychodów krajowych (plus skarbiec właściciela) [SZAC]
  SURPLUS_SPEND: 0.5, // z nadwyżki ponad ten próg połowa idzie co sezon na długi i inwestycje [SZAC]
  ATT_RANK: { uefa: 1.35, super: 1.1 }, // frekwencja meczu względem średniej ligowej [SZAC]
  PRICE_RANK: { uefa: 1.4, pp: 0.6, ppF: 1.2, super: 1 }, // cena biletu względem ligowej [SZAC]
};

// Nagrody UEFA w mln EUR. Faza ligowa i premie za mecz: cykl 2024-27 (LM 18,62 + 2,1 za wygraną i 0,7 za remis,
// LE 4,31 + 0,45/0,15, LK 3,17 + 0,4/0,133). Eliminacje: 175 tys. EUR za rozegraną rundę (2025/26) plus kwota
// za odpadnięcie (LK: Q1 0,15, Q2 0,35, Q3 0,55, PO 0,75), rozłożone na rundy. Fazy pucharowe w LE i LK [SZAC].
const UEFA_PRIZE = {
  LM: { Q1: 0.5, Q2: 0.6, Q3: 0.7, PO: 1.0, league: 18.62, win: 2.1, draw: 0.7, KPO: 1.0, R16: 11, QF: 12.5, SF: 15, F: 18.5 },
  LE: { Q1: 0.33, Q2: 0.38, Q3: 0.5, PO: 0.6, league: 4.31, win: 0.45, draw: 0.15, KPO: 0.3, R16: 1.75, QF: 2.5, SF: 4, F: 6 },
  LK: { Q1: 0.33, Q2: 0.38, Q3: 0.38, PO: 0.38, league: 3.17, win: 0.4, draw: 0.133, KPO: 0.2, R16: 0.8, QF: 1.3, SF: 2.5, F: 4 },
};
export const uefaPrize = (comp, key) => Math.round((UEFA_PRIZE[comp]?.[key] ?? 0) * 1e6 * FIN.EUR * FIN.ECON / 1000) * 1000;
// Puchar Polski: premia dla zwycięzcy meczu danej rundy (zł). PZPN 2025/26: pula 10 mln zł, zdobywca 5 mln zł
// (tu 1 mln za awans do finału i 4 mln za wygranie finału), finalista 1 mln zł. Wcześniejsze rundy [SZAC].
export const PP_PRIZE = { PRE: 30000, R64: 60000, R32: 100000, R16: 170000, QF: 300000, SF: 1000000, W: 4000000 };

const tierOf = (club) => Math.min(4, Math.max(1, club?.tier ?? 3));
const ratio = (K, t, t0) => (K[t] ?? K[4]) / (K[t0] ?? K[4]);

/** Pojemność stadionu (dane klubu, a dla nieznanych szacunek z prestiżu i ligi). */
export function stadiumCapacity(club) {
  if (!club) return 5000;
  const d = clubFinanceData(club);
  if (d?.pojemnosc) return d.pojemnosc;
  if (club.tier === 1) return Math.round((7000 + club.prestige * 2600) / 500) * 500;
  if (club.tier === 2) return Math.round((3000 + club.prestige * 1400) / 500) * 500;
  if (club.tier === 3) return Math.round((1500 + club.prestige * 700) / 500) * 500;
  return 2000;
}

/** Premia z centralnego podziału za miejsce w lidze (zł). */
export function meritTv(tier, pos) {
  const m = FIN.MERIT[tier];
  return m ? Math.round(m[0] * m[1] ** (pos - 1) / 1000) * 1000 : 0;
}
const meritAvg = (tier, n = 18) => Array.from({ length: n }, (_, i) => meritTv(tier, i + 1)).reduce((a, b) => a + b, 0) / n;

const wageBill = (world, clubId) => (world.clubs[clubId]?.squad ?? []).reduce((s, id) => s + (world.players[id]?.contract?.wage ?? 0), 0);
const monthKey = (iso) => iso.slice(0, 7);
const r1000 = (x) => Math.round(x / 1000) * 1000;

/**
 * Plan sezonu klubu z danych: roczne przychody i koszty, parametry dnia meczowego, właściciel.
 * Kwoty przeliczone na ligę, w której klub gra teraz (spadek: mniej sponsorów, widzów i płac).
 */
export function clubPlan(club) {
  const d = clubFinanceData(club);
  const t = tierOf(club); const t0 = d.liga ?? t;
  const att = Math.min(d.pojemnosc, Math.round(d.frekwencja * ratio(FIN.K_ATT, t, t0)));
  const perFan = Math.round(d.naKibica * ratio(FIN.K_PRICE, t, t0));
  const kom = d.komercja * M * ratio(FIN.K_KOM, t, t0);
  const tvFixed = (FIN.TV_FIXED[t] ?? 0) + (t === 1 ? FIN.TV_RANKING * ((club.prestige ?? 5) / 10) ** 1.5 : 0);
  const plan = {
    tier: t,
    cap: d.pojemnosc, att, perFan,
    tv: r1000(tvFixed), // co miesiąc
    merit: r1000(meritAvg(t)), // oczekiwana premia za miejsce (po sezonie)
    sponsor: r1000(kom * FIN.SPONSOR_SHARE),
    other: r1000(kom * (1 - FIN.SPONSOR_SHARE)),
    tickets: r1000(att * perFan * FIN.HOME_GAMES),
    owner: r1000((d.wlasciciel?.doplata ?? 0) * M),
    wages: r1000(d.place * M * FIN.PLAYERS_SHARE * ratio(FIN.K_WAGE, t, t0)), // docelowe płace zawodników (rocznie)
    skarbiec: r1000((d.wlasciciel?.skarbiec ?? 0) * M),
    ownerType: d.wlasciciel?.typ ?? 'miasto', ownerName: d.wlasciciel?.kto ?? '', sponsorLevel: d.sponsor ?? 1,
  };
  plan.domestic = plan.tv + plan.merit + plan.sponsor + plan.other + plan.tickets;
  plan.ops = r1000(plan.wages * FIN.STAFF + plan.domestic * (FIN.OTHER_COSTS[t] ?? 0.25));
  plan.net = plan.domestic + plan.owner - plan.wages - plan.ops;
  return plan;
}

/** Budżet transferowy z salda: część nadwyżki ponad miesięczne koszty, z limitem zależnym od klasy klubu. */
function transferBudgetOf(c, balance) {
  const reserve = (c.plan.wages + c.plan.ops) / 12;
  const share = c.plan.skarbiec > 0 ? FIN.TRANSFER_SHARE_RICH : FIN.TRANSFER_SHARE;
  const cap = c.plan.domestic * FIN.TRANSFER_CAP + c.plan.skarbiec;
  return Math.round(Math.min(cap, Math.max(0, balance - reserve) * share) / 10000) * 10000;
}

/**
 * Finanse klubu na start sezonu. opts.balance: saldo przeniesione z poprzedniego sezonu (bez niego saldo startowe
 * z przychodów). opts.date: dzień startu sezonu; wtedy bogaty właściciel uzupełnia saldo do skarbca (wpis 'owner').
 */
export function initClub(world, club, opts = {}) {
  const plan = clubPlan(club);
  const wages = wageBill(world, club.id);
  const c = {
    base: plan.domestic, plan, tier: plan.tier,
    balance: 0, start: 0, transferBudget: 0, wageBudget: 0,
    ledger: {}, // { '2026-08': { in: { tickets, tv, ... }, out: { wages, ops, ... } } }
    log: [],
  };
  if (opts.balance != null) {
    c.balance = Math.round(opts.balance);
    if (opts.date && plan.skarbiec > c.balance) {
      const add = plan.skarbiec - c.balance;
      bookOne(c, opts.date, 'in', 'owner', add, `${plan.ownerName || 'Właściciel'}: pieniądze na nowy sezon`);
    }
    // Klub AI z dużą nadwyżką spłaca zadłużenie i inwestuje (stadion, baza, akademia), zamiast trzymać gotówkę [SZAC]
    const cap = plan.domestic * FIN.SURPLUS_CAP + plan.skarbiec;
    if (opts.ai && opts.date && c.balance > cap) bookOne(c, opts.date, 'out', 'invest', (c.balance - cap) * FIN.SURPLUS_SPEND, 'Spłata zadłużenia i inwestycje w infrastrukturę');
  } else {
    c.balance = Math.max(Math.round(plan.domestic * FIN.START_BALANCE / 10000) * 10000, plan.skarbiec);
  }
  c.start = c.balance;
  c.transferBudget = transferBudgetOf(c, c.balance);
  // Budżet płac: docelowe płace z danych, a przy wolnej gotówce do +25 % (klub inwestuje w kadrę) [SZAC]
  const free = Math.max(0, c.balance - (plan.wages + plan.ops) / 12);
  const extra = clamp(free / Math.max(1, plan.wages) * 0.25, 0, 0.25);
  c.wageBudget = Math.round(Math.max(wages, plan.wages / 52 * (1 + extra)) * FIN.WAGE_BUDGET_X / 100) * 100;
  return c;
}

export function createFinance(world) {
  const clubs = {};
  for (const c of CLUBS_PL) if (world.clubs[c.id]) clubs[c.id] = initClub(world, c);
  return { clubs, processed: {} };
}

function bookOne(c, date, dir, kind, amount, note) {
  const m = (c.ledger[monthKey(date)] ??= { in: {}, out: {} });
  m[dir][kind] = (m[dir][kind] ?? 0) + Math.round(amount);
  c.balance += dir === 'in' ? Math.round(amount) : -Math.round(amount);
  if (note) { c.log.unshift({ date, dir, kind, amount: Math.round(amount), note }); c.log.length = Math.min(c.log.length, 40); }
}

/** Zapis przychodu (kind w 'in') lub kosztu (kind w 'out'). */
export function book(F, clubId, date, dir, kind, amount, note = null) {
  const c = F.clubs[clubId];
  if (!c || !amount) return;
  bookOne(c, date, dir, kind, amount, note);
}

/**
 * Frekwencja meczu (0-1 pojemności). Z finansami gospodarza (homeFin) punktem wyjścia jest realna średnia
 * frekwencja klubu, bez nich 62 % pojemności. Ranga meczu, forma, rywal i derby zmieniają ją procentowo. [SZAC]
 */
export function attendanceFill(f, homeRow, awayClub, homeFin = null) {
  const base = homeFin?.plan ? homeFin.plan.att / Math.max(1, homeFin.plan.cap) : 0.62;
  let mul = 1;
  if (f.comp === 'uefa') mul = FIN.ATT_RANK.uefa;
  else if (f.comp === 'pp') mul = f.round === 'F' ? 3 : 0.7 + (['QF', 'SF'].includes(f.round) ? 0.35 : 0);
  else if (f.comp === 'super') mul = FIN.ATT_RANK.super;
  if (homeRow) mul += clamp((homeRow.form?.filter((x) => x === 'W').length ?? 0) * 0.03 - 0.05 - (homeRow.pos > 12 ? 0.08 : 0), -0.15, 0.12);
  if (awayClub?.prestige >= 8) mul += 0.12;
  if (f.derby) mul += 0.2;
  return clamp(base * mul, 0.08, 1);
}

/** Wpływy z meczu dla gospodarza: widzowie x przychód na widza x ranga. Finał PP (neutralny) dzielony po połowie. */
export function matchIncome(F, f, fill) {
  const home = F.clubs[f.home];
  const rank = f.comp === 'uefa' ? FIN.PRICE_RANK.uefa : f.comp === 'pp' ? (f.round === 'F' ? FIN.PRICE_RANK.ppF : FIN.PRICE_RANK.pp) : f.comp === 'super' ? FIN.PRICE_RANK.super : 1;
  if (f.neutral) {
    const cap = 58000; // PGE Narodowy
    const per = (c) => (c?.plan ? cap * fill * c.plan.perFan * rank / 2 : 0);
    return [per(home), per(F.clubs[f.away])];
  }
  if (!home?.plan) return [0, 0];
  return [home.plan.cap * fill * home.plan.perFan * rank, 0];
}

/** Co tydzień (poniedziałek): pensje. Co miesiąc (1.): TV, sponsorzy, pozostałe, dopłaty właściciela, koszty klubu. */
export function financeDay(F, world, date) {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  for (const [id, c] of Object.entries(F.clubs)) {
    if (dow === 1) book(F, id, date, 'out', 'wages', wageBill(world, id));
    if (date.endsWith('-01')) {
      const p = c.plan ?? { tv: c.base * 0.3, sponsor: c.base * 0.27, other: c.base * 0.18, owner: 0, ops: c.base * 0.17 };
      book(F, id, date, 'in', 'tv', p.tv / 12);
      book(F, id, date, 'in', 'sponsor', p.sponsor / 12);
      book(F, id, date, 'in', 'other', p.other / 12);
      book(F, id, date, 'in', 'owner', p.owner / 12);
      book(F, id, date, 'out', 'ops', p.ops / 12);
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
  tickets: 'Dzień meczowy', tv: 'Prawa TV i podział ligi', sponsor: 'Sponsorzy', other: 'Koszulki, catering, inne', owner: 'Właściciel i dotacje',
  prize: 'Nagrody', sales: 'Sprzedaż zawodników', loans: 'Wypożyczenia',
  wages: 'Pensje', ops: 'Koszty klubu', transfers: 'Transfery', signOn: 'Premie za podpis', agents: 'Prowizje agentów', release: 'Rozwiązania kontraktów',
  invest: 'Spłata długów i inwestycje', camps: 'Obozy przygotowawcze', fines: 'Kary PZPN',
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
