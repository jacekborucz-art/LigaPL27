// Prośby do zarządu i weto zarządu (docs/finanse.md, rozdz. „Prośby do zarządu i weto”).
// Prośby: większy budżet transferowy, większy budżet płac, przesunięcie pieniędzy z budżetu transferowego do płac,
// niższy cel sezonu. Decyzja z punktacji S (zaufanie, tabela, saldo, wskaźnik płac, właściciel, kwota, okno, los),
// deterministycznie z ziarna gry, daty i rodzaju prośby. Odpowiedzi trafiają do poczty jako listy zarządu.
// Weto: zarząd nie zatwierdza kontraktów i kwot transferowych ponad progi (pensja, długość, koszt, premia, prowizja,
// odstępne). Te same progi obowiązują kluby AI (negocjacje, przedłużenia, zakupy). Wszystkie liczby [SZAC].
// Stan: game.board.requests (tworzony leniwie, stare zapisy działają bez zmian).

import { Rng, clamp } from '../core/rng.js';
import { createMessage, addMessages } from '../core/inbox.js';
import { registerDailySystem } from '../core/gameLoop.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { DOMESTIC } from '../config/calendar2026.js';
import { payLevel } from '../data/finanse_klubow.js';
import { squadOf } from '../world/worldGen.js';
import { standings } from '../season/standings.js';
import { GROUP } from './squad.js';
import { ensureBoard, tablePos, lastSeasonPos, seasonGoalFor } from './board.js';
import { SEASON_YEAR } from '../config/calendar2026.js';
import { ownerOf } from './owners.js';
import { wageBill, book, spendable } from './finance.js';
import { marketWage, estimateValue, MAX_YEARS, yearsLabel } from './negotiation.js';
import { fmtDate } from '../ui/dom.js';
import { LEAGUE_COMPS, compClubIds } from '../season/leagueComps.js';

// ------------------------------------------------------------ Stałe [SZAC]
export const REQ = {
  WEEK_DAYS: 7, // najwyżej jedna prośba w tygodniu
  PER_MONTH: 3, // i trzy w miesiącu kalendarzowym
  SAME_TYPE_DAYS: 30, // ta sama sprawa najwcześniej po 30 dniach
  AFTER_NO_DAYS: 60, // po odmowie
  AFTER_YES_DAYS: 90, // po zgodzie (także częściowej)
  PRE_WINDOW_DAYS: 30, // budżety: w oknie albo 30 dni przed jego otwarciem
  GOAL_DEADLINE: '11-01', // niższy cel: raz w sezonie, przed 1 listopada
  YES: 20, PARTIAL: 5, COND: -10, // progi S
  GOAL_YES: 10, // niższy cel: zgoda od S >= 10
  APPEAL_YES: 10, // odwołanie od weta: zgoda od S >= 10
  APPEALS_PER_SEASON: 2,
  COND_SHARE: 0.8, // warunkowa zgoda: 80 % kwoty po spełnieniu warunku
  WAGE_WEEKS_PER_ZL: 104, // przesunięcie: 1 mln zł transferów = 1 mln / 104 zł tygodniowo w płacach (2 lata)
  W_MAX: 0.8, W_HIGH: 0.7, W_LOW: 0.6, // wskaźnik płac do przychodów
  OWNER_COVER_WEALTH: 14, // właściciel dopłaca ponad limit płac od zasobności 14
  REF_BUDGET: 0.05, // budżet odniesienia przy zerowym budżecie: 5 % przychodów krajowych
  AI_SHARE: 0.25, // kluby AI w lipcu i styczniu proszą o +25 % budżetu transferowego
};
export const VETO = {
  SQUAD_X: 1.5, SQUAD_X_RICH: 1.8, MARKET_X: 1.3, RENEW_X: 1.15, // pensja: najwyższa w kadrze, rynkowa, obecna
  BUDGET_SHARE: 0.25, // pensja najwyżej 25 % tygodniowego budżetu płac
  TOTAL_SHARE: 0.15, // roczny koszt kontraktu (pensja i rozłożone premie) najwyżej 15 % rocznych przychodów z dopłatą właściciela
  FEE_VALUE_X: 2, FEE_WARN_X: 1.5, FEE_MIN: 1e6, // odstępne do wartości rynkowej (powyżej 1 mln zł)
  FEE_REVENUE: 0.4, // odstępne najwyżej 40 % przychodów krajowych (chyba że pokrywa skarbiec właściciela)
  SIGN_ON: 0.5, // premia za podpis najwyżej połowa pensji z pierwszego roku
  AGENT: 0.1, // prowizja najwyżej 10 % wartości kontraktu
};

export const REQ_TYPES = {
  transfer: { label: 'Większy budżet transferowy', short: 'budżet transferowy', gen: 'budżetu transferowego' },
  wage: { label: 'Większy budżet płac', short: 'budżet płac', gen: 'budżetu płac' },
  shift: { label: 'Przesunięcie do budżetu płac', short: 'przesunięcie pieniędzy do płac' },
  goal: { label: 'Niższy cel sezonu', short: 'niższy cel sezonu' },
};
export const VERDICT_LABELS = { yes: 'Zgoda', partial: 'Częściowa zgoda', cond: 'Zgoda warunkowa', no: 'Odmowa' };

// ------------------------------------------------------------ Pomocnicze
const SIGN = 'Zarząd klubu.';
const dayNo = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
export const addDaysIso = (iso, n) => new Date((dayNo(iso) + n) * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => dayNo(b) - dayNo(a);
const seasonOf = (iso) => { const [y, m] = iso.split('-').map(Number); return m >= 7 ? y : y - 1; };
const nextMonthStart = (iso) => { const [y, m] = iso.split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; };
const r100 = (x) => Math.round(x / 100) * 100;
const r10k = (x) => Math.round(x / 10000) * 10000;
const floor100 = (x) => Math.floor(x / 100) * 100;
const floor10k = (x) => Math.floor(x / 10000) * 10000;
const pct = (x) => `${Math.round(x * 100)} %`;

/** Kwota po polsku: 1,25 mln zł, 180 tys. zł, 900 zł. */
export function zl(n) {
  if (n < 0) return `-${zl(-n)}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace('.', ',')} mln zł`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} tys. zł`;
  return `${Math.round(n)} zł`;
}

/** Okno transferowe, w którym jest data, albo null. */
export function windowAt(date) { return (DOMESTIC.transferWindows ?? []).find((w) => date >= w.from && date <= w.to) ?? null; }
/** Najbliższe otwarcie okna po dacie (po zimowym oknie: 1 lipca następnego sezonu). */
export function nextWindowStart(date) {
  const w = (DOMESTIC.transferWindows ?? []).find((x) => x.from > date);
  return w ? w.from : `${seasonOf(date) + 1}-07-01`;
}
const windowKey = (date) => windowAt(date)?.from ?? `poza:${nextWindowStart(date)}`;

/** Stan próśb i wet w zapisie gry (leniwie, dla starych zapisów). */
export function ensureRequests(game) {
  // ensureBoard tworzy nowy obiekt zarządu: wołamy go tylko, gdy trzeba (inaczej zmiany zaufania trafiłyby do kopii)
  const B = game.board?.reviews && game.board.goal && game.board.goalClub === game.clubId ? game.board : ensureBoard(game);
  const R = (B.requests ??= {});
  R.log ??= []; // odpowiedzi zarządu (najnowsze pierwsze)
  R.conds ??= []; // warunkowe zgody
  R.vetoes ??= []; // weta (najnowsze pierwsze)
  R.overrides ??= {}; // zgody po odwołaniu: { [playerId]: { until, wage, years, signOn, agentFee, fee } }
  R.appeals ??= { season: null, count: 0, players: {} };
  R.goalSeason ??= null; // sezon, w którym obniżono już cel
  R.ownerPaid ??= {}; // { [sezon]: kwota dopłat właściciela do płac }
  return R;
}

// ------------------------------------------------------------ Wskaźnik płac
/** Przychód do wskaźnika płac: przychody krajowe plus średnia sprzedaż zawodników z ostatnich sezonów (bez dopłat). */
export function wageRevenue(c) {
  const sales = (c?.history ?? []).slice(-3).map((h) => h.in?.sales ?? 0);
  const avg = sales.length ? sales.reduce((a, b) => a + b, 0) / sales.length : 0;
  return Math.max(1, (c?.plan?.domestic ?? c?.base ?? 0) + avg);
}
/** W: roczne płace I drużyny do przychodu. weekly: tygodniowe płace (domyślnie obecne). */
export function wageRatio(game, clubId, weekly = null) {
  const c = game.finance?.clubs?.[clubId];
  const w = weekly ?? wageBill(game.world, clubId);
  return (w * 52) / wageRevenue(c);
}

// ------------------------------------------------------------ Punktacja prośby
function weeksLeft(date) { return Math.max(13, Math.ceil(daysBetween(date, `${seasonOf(date) + 1}-06-30`) / 7)); }

/** Budżet odniesienia dla kwot (procenty w presetach i składnik „wielkość prośby”). */
export function refBudget(c, type) {
  if (!c) return 1;
  if (type === 'wage') return Math.max(100, c.wageBudget);
  return Math.max(c.transferBudget, r10k((c.plan?.domestic ?? c.base ?? 0) * REQ.REF_BUDGET), 10000);
}

/** Koszt prośby dla salda: budżet transferowy w całości, płace do końca sezonu (co najmniej 13 tygodni). */
function requestCost(type, amount, date) {
  if (type === 'transfer') return amount;
  if (type === 'wage') return amount * weeksLeft(date);
  return 0;
}

/** Miejsca w tabeli wszystkich klubów (raz na ligę). */
function positionsAll(game) {
  const out = {};
  for (const comp of LEAGUE_COMPS) {
    const lf = (game.fixtures ?? []).filter((f) => f.comp === comp);
    if (!lf.some((f) => f.played)) continue;
    for (const r of standings(lf, compClubIds(comp))) out[r.id] = { pos: r.pos, played: r.played };
  }
  return out;
}

/**
 * Punktacja S prośby (docs/finanse.md). opts: { trust (50 dla klubów AI), pos: { pos, played }, goal, overshoot
 * (odwołanie od weta: zamiast wielkości kwoty), noRand }. Zwraca { S, parts, W }.
 */
export function requestScore(game, clubId, type, amount, date, opts = {}) {
  const c = game.finance?.clubs?.[clubId];
  const club = clubById(clubId) ?? { tier: 3 };
  const o = ownerOf(game, clubId) ?? { ambicja: 10, zasobnosc: 10 };
  const mine = clubId === game.clubId;
  const trust = opts.trust ?? (mine ? game.board?.trust ?? 50 : 50);
  const goal = opts.goal ?? (mine ? game.board?.goal : null) ?? seasonGoalFor(club);
  const t = opts.pos ?? (game.fixtures ? tablePos(game, clubId) : { pos: null, played: 0 });
  const parts = {};
  parts.trust = 0.6 * (trust - 50);
  const table = t.played >= 4 && t.pos ? clamp(3 * (goal.target - t.pos), -15, 15) : 0;
  // Niższy cel: zarząd łatwiej go obniża, gdy drużyna jest wyraźnie pod celem (realizm), trudniej, gdy idzie dobrze
  parts.table = type === 'goal' ? -table : table;
  const cost = opts.cost ?? requestCost(type, amount, date);
  const reserve = c?.plan ? (c.plan.wages + c.plan.ops) / 12 : 0;
  // Wolne pieniądze: saldo minus rezerwa na miesiąc kosztów i minus budżet transferowy już przyznany (wydany w planie)
  const committed = c ? Math.max(0, spendable(game.finance, clubId)) : 0;
  parts.money = cost > 0 && c ? clamp(10 * ((c.balance - reserve - committed) / cost - 1), -20, 15) : 0;
  let W = c ? wageRatio(game, clubId) : 0;
  if (c && (type === 'wage' || type === 'shift')) {
    const add = type === 'wage' ? amount : amount / REQ.WAGE_WEEKS_PER_ZL;
    W = wageRatio(game, clubId, Math.max(wageBill(game.world, clubId), c.wageBudget) + add);
  }
  parts.wage = type === 'wage' ? (W > REQ.W_MAX ? -40 : W > REQ.W_HIGH ? -15 : W < REQ.W_LOW ? 10 : 0) : 0;
  parts.owner = type === 'goal' ? -1.5 * (o.ambicja - 10) : (o.ambicja - 10) + 1.5 * (o.zasobnosc - 10);
  if (opts.overshoot != null) parts.size = -25 * opts.overshoot;
  else parts.size = type === 'goal' ? -5 : type === 'shift' ? 0 : -25 * (amount / refBudget(c, type));
  parts.window = type === 'goal' ? 0 : windowAt(date) ? 5 : -10;
  const rng = new Rng(opts.seed ?? `prosba:${game.seed}:${date}:${type}${mine ? '' : `:${clubId}`}`);
  parts.luck = opts.noRand ? 0 : -5 + 10 * rng.next();
  const S = Object.values(parts).reduce((a, b) => a + b, 0);
  return { S: Math.round(S * 10) / 10, parts, W, pos: t, goal };
}

/** Werdykt z punktacji: yes (pełna kwota), partial (część), cond (warunek), no. */
export function verdictOf(S) {
  if (S >= REQ.YES) return { verdict: 'yes', share: 1 };
  if (S >= REQ.PARTIAL) return { verdict: 'partial', share: 0.3 + 0.5 * (S - REQ.PARTIAL) / (REQ.YES - REQ.PARTIAL) };
  if (S >= REQ.COND) return { verdict: 'cond', share: REQ.COND_SHARE };
  return { verdict: 'no', share: 0 };
}

// ------------------------------------------------------------ Cel sezonu
const GOAL_LEVELS = { 1: [1, 3, 6, 12, 15], 2: [2, 6, 14, 15] };
const levelsOf = (tier) => GOAL_LEVELS[tier === 1 ? 1 : 2];
export function goalTextFor(tier, target) {
  let base;
  if (tier === 1) base = target <= 1 ? 'mistrzostwo Polski' : target <= 3 ? 'walka o mistrzostwo Polski' : target <= 6 ? 'miejsce dające grę w europejskich pucharach' : target <= 12 ? 'spokojne miejsce w środku tabeli' : 'utrzymanie w Ekstraklasie';
  else base = target <= 2 ? (tier === 2 ? 'awans do Ekstraklasy' : 'awans do 1 Ligi') : target <= 6 ? 'miejsce w strefie baraży o awans' : target <= 14 ? 'spokojny środek tabeli' : 'utrzymanie w lidze';
  return levelsOf(tier).includes(target) ? base : `${base}, co najmniej ${target}. miejsce`;
}
/** Cel o poziom niżej (np. puchary -> środek tabeli) albo null, gdy niżej już się nie da. */
export function lowerGoal(tier, target) {
  const next = levelsOf(tier).find((x) => x > target);
  return next ? { target: next, text: goalTextFor(tier, next) } : null;
}

// ------------------------------------------------------------ Dostępność próśb
/** Najbliższa data, od której wolno prosić; ok, gdy dziś. Zwraca { ok, from, text }. */
export function requestStatus(game, type, date = game.date) {
  const R = ensureRequests(game);
  const c = game.finance?.clubs?.[game.clubId];
  const blocks = [];
  const last = R.log[0];
  if (last && daysBetween(last.date, date) < REQ.WEEK_DAYS) blocks.push([addDaysIso(last.date, REQ.WEEK_DAYS), 'Zarząd przyjmuje najwyżej jedną prośbę w tygodniu.']);
  const month = date.slice(0, 7);
  if (R.log.filter((x) => x.date.slice(0, 7) === month).length >= REQ.PER_MONTH) blocks.push([nextMonthStart(date), 'Limit trzech próśb w miesiącu jest wyczerpany.']);
  const lastType = R.log.find((x) => x.type === type);
  if (lastType) {
    const days = lastType.verdict === 'no' ? REQ.AFTER_NO_DAYS : lastType.verdict === 'cond' ? REQ.SAME_TYPE_DAYS : REQ.AFTER_YES_DAYS;
    const until = addDaysIso(lastType.date, days);
    if (until > date) blocks.push([until, lastType.verdict === 'no' ? 'Po odmowie zarząd wraca do sprawy po 60 dniach.' : lastType.verdict === 'cond' ? 'Tę samą sprawę można zgłosić raz na 30 dni.' : 'Po zgodzie zarząd wraca do sprawy po 90 dniach.']);
  }
  if (type === 'transfer' || type === 'wage') {
    const open = windowAt(date);
    const next = nextWindowStart(date);
    if (!open && daysBetween(date, next) > REQ.PRE_WINDOW_DAYS) blocks.push([addDaysIso(next, -REQ.PRE_WINDOW_DAYS), 'O budżety można prosić w oknie transferowym albo w ciągu 30 dni przed jego otwarciem.']);
  }
  if (type === 'shift' && (c?.transferBudget ?? 0) < 100000) return { ok: false, from: null, text: 'Budżet transferowy jest za mały na przesunięcie (minimum 100 tys. zł).' };
  if (type === 'goal') {
    const season = seasonOf(date);
    if (R.goalSeason === season) return { ok: false, from: `${season + 1}-07-01`, text: 'Cel sezonu można obniżyć raz w sezonie.' };
    if (date >= `${season}-${REQ.GOAL_DEADLINE}`) return { ok: false, from: `${season + 1}-07-01`, text: 'Cel sezonu można obniżyć tylko przed 1 listopada.' };
    const club = clubById(game.clubId);
    if (!lowerGoal(club?.tier ?? 1, game.board.goal?.target ?? 15)) return { ok: false, from: null, text: 'Niższego celu niż utrzymanie nie ma.' };
  }
  if (!blocks.length) return { ok: true, from: date, text: 'Możesz złożyć prośbę.' };
  blocks.sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return { ok: false, from: blocks[0][0], text: blocks[0][1] };
}

/** Propozycje kwot: +10 %, +25 %, +50 % budżetu (przesunięcie: części budżetu transferowego). */
export function amountPresets(game, type) {
  const c = game.finance?.clubs?.[game.clubId];
  if (!c || type === 'goal') return [];
  if (type === 'shift') return [0.1, 0.25, 0.5].map((p) => ({ pct: p, amount: floor10k(c.transferBudget * p) })).filter((x) => x.amount >= 10000);
  const ref = refBudget(c, type);
  return [0.1, 0.25, 0.5].map((p) => ({ pct: p, amount: type === 'wage' ? r100(ref * p) : r10k(ref * p) }));
}

// ------------------------------------------------------------ Skutki zgody
function raiseGoal(game) {
  const B = game.board; const club = clubById(game.clubId);
  if (!B.goal || B.goal.target <= 1) return null;
  const target = B.goal.target - 1;
  B.goal = { ...B.goal, target, text: goalTextFor(club?.tier ?? 1, target), raisedByMoney: true };
  return B.goal;
}

/** Przyznaje kwotę (mutuje finanse klubu). Zwraca opis zmiany. */
function applyGrant(game, clubId, type, amount) {
  const c = game.finance.clubs[clubId];
  if (type === 'transfer') { c.transferBudget += amount; return `Budżet transferowy: ${zl(c.transferBudget)}.`; }
  if (type === 'wage') { c.wageBudget += amount; return `Budżet płac: ${zl(c.wageBudget)} tygodniowo.`; }
  if (type === 'shift') {
    const add = r100(amount / REQ.WAGE_WEEKS_PER_ZL);
    c.transferBudget = Math.max(0, c.transferBudget - amount); c.wageBudget += add;
    return `Budżet transferowy: ${zl(c.transferBudget)}, budżet płac: ${zl(c.wageBudget)} tygodniowo (+${zl(add)}).`;
  }
  return '';
}

/** Dopłata właściciela do płac ponad limit wskaźnika (ze skarbca). Zwraca kwotę albo 0, gdy nie stać. */
function ownerCover(game, type, amount, date) {
  const c = game.finance.clubs[game.clubId];
  const o = ownerOf(game, game.clubId);
  if (!o || o.zasobnosc < REQ.OWNER_COVER_WEALTH) return 0;
  const R = ensureRequests(game);
  const season = seasonOf(date);
  const cost = type === 'wage' ? amount * weeksLeft(date) : amount;
  const left = (c.plan?.skarbiec ?? 0) - (R.ownerPaid[season] ?? 0);
  if (cost <= 0 || left < cost) return 0;
  R.ownerPaid[season] = (R.ownerPaid[season] ?? 0) + cost;
  book(game.finance, game.clubId, date, 'in', 'owner', cost, 'Właściciel: dopłata do płac (prośba trenera)');
  return cost;
}

/** List zarządu. push: od razu do poczty (akcje gracza); bez push wiadomość wraca do systemu dnia. */
function letter(game, date, key, subject, body, priority = 'important', push = true) {
  const m = createMessage({ date, key, category: 'board', from: 'Zarząd klubu', priority, subject, body: `Panie Trenerze, ${body}\n\n${SIGN}` });
  if (push) game.inbox = addMessages(game.inbox ?? [], [m]).inbox;
  return m;
}

/** Krótkie powody odmowy z najbardziej ujemnych składników S. */
function reasons(game, sc, type, amount) {
  const c = game.finance.clubs[game.clubId];
  const txt = {
    trust: `zaufanie zarządu jest niskie (${game.board.trust} na 100)`,
    table: type === 'goal' ? 'drużyna radzi sobie dobrze, więc cel jest realny' : sc.pos?.pos ? `drużyna jest na ${sc.pos.pos}. miejscu, a cel to ${sc.goal.target}. miejsce` : 'wyniki są poniżej celu',
    money: `saldo klubu (${zl(c.balance)}) nie pozwala na taki wydatek`,
    wage: `płace pochłonęłyby ${pct(sc.W)} przychodów klubu`,
    owner: type === 'goal' ? 'właściciel ma ambitne plany i nie chce słyszeć o niższym celu' : 'właściciel nie chce dokładać pieniędzy',
    size: type === 'goal' ? 'zmiana celu w trakcie sezonu źle wygląda wobec kibiców' : `kwota ${zl(amount)} to ${pct(amount / refBudget(c, type))} obecnego budżetu`,
    window: 'okno transferowe jest zamknięte',
  };
  return Object.entries(sc.parts).filter(([k, v]) => v < -2 && txt[k]).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([k]) => txt[k]);
}

// ------------------------------------------------------------ Prośba gracza
/**
 * Prośba do zarządu. type: transfer | wage (kwota tygodniowa) | shift (kwota z budżetu transferowego) | goal.
 * Zwraca { ok, text, verdict?, granted?, entry? }. Mutuje finanse, zaufanie, cel i pocztę.
 */
export function askBoard(game, type, amount = 0, date = game.date) {
  if (!REQ_TYPES[type]) return { ok: false, text: 'Nieznana prośba.' };
  const R = ensureRequests(game);
  const B = game.board;
  const c = game.finance?.clubs?.[game.clubId];
  if (!c) return { ok: false, text: 'Brak danych o finansach klubu.' };
  amount = Math.max(0, Math.round(Number(amount) || 0));
  if (type !== 'goal' && amount <= 0) return { ok: false, text: 'Podaj kwotę.' };
  if (type === 'shift' && amount > c.transferBudget) return { ok: false, text: `Budżet transferowy wynosi ${zl(c.transferBudget)}. Nie można przesunąć więcej.` };
  const st = requestStatus(game, type, date);
  if (!st.ok) return { ok: false, text: `${st.text}${st.from ? ` Najbliższy termin: ${fmtDate(st.from)}.` : ''}` };

  const sc = requestScore(game, game.clubId, type, amount, date);
  const club = clubById(game.clubId);
  const before = refBudget(c, type);
  let { verdict, share } = verdictOf(sc.S);
  let note = '';
  let cover = 0;
  if (type === 'shift') {
    // Pieniądze już są w budżecie transferowym: zgoda, gdy budżet płac mieści się w limicie albo płace pokrywa bogaty właściciel
    const rich = (ownerOf(game, game.clubId)?.zasobnosc ?? 0) >= REQ.OWNER_COVER_WEALTH;
    verdict = sc.W <= REQ.W_MAX || rich ? 'yes' : 'no'; share = verdict === 'yes' ? 1 : 0;
    if (verdict === 'no') note = `Budżet płac po przesunięciu to ${pct(sc.W)} przychodów klubu bez dopłat właściciela, a limit to ${pct(REQ.W_MAX)}.`;
  } else if (type === 'goal') {
    verdict = sc.S >= REQ.GOAL_YES ? 'yes' : 'no'; share = verdict === 'yes' ? 1 : 0;
  } else if (type === 'wage' && sc.W > REQ.W_MAX && verdict !== 'no' && verdict !== 'cond') {
    cover = ownerCover(game, type, r100(amount * share), date);
    if (!cover) { verdict = 'no'; share = 0; note = `Płace pochłonęłyby ${pct(sc.W)} przychodów klubu, a limit to ${pct(REQ.W_MAX)}. Właściciel nie pokryje różnicy.`; }
  } else if (type === 'wage' && sc.W > REQ.W_MAX && verdict === 'cond') {
    const o = ownerOf(game, game.clubId);
    if ((o?.zasobnosc ?? 0) < REQ.OWNER_COVER_WEALTH) { verdict = 'no'; share = 0; note = `Płace pochłonęłyby ${pct(sc.W)} przychodów klubu, a limit to ${pct(REQ.W_MAX)}.`; }
  }

  const step = type === 'wage' ? 100 : 10000;
  const granted = verdict === 'yes' || verdict === 'partial' ? Math.round(amount * share / step) * step : 0;
  const trust0 = B.trust;
  let dTrust = 0;
  const t = sc.pos;
  if (B.trust < 35 || (t.played >= 4 && t.pos && t.pos >= (B.goal?.target ?? 99) + 4)) dTrust -= 2;
  if (verdict === 'no' && type !== 'shift') dTrust -= 1; // przesunięcie to reguła wskaźnika płac, bez kosztu zaufania
  B.trust = Math.round(clamp(B.trust + dTrust, 0, 100));

  const label = REQ_TYPES[type].short;
  const entry = { id: `${date}:${type}`, date, type, amount, verdict, granted, S: sc.S, trust: B.trust - trust0 };
  let body;
  let subject;
  if (type === 'goal') {
    if (verdict === 'yes') {
      const lower = lowerGoal(club?.tier ?? 1, B.goal.target);
      const old = B.goal.text;
      B.goal = { ...B.goal, target: lower.target, text: lower.text, lowered: true };
      R.goalSeason = seasonOf(date);
      subject = `Zarząd obniża cel sezonu: ${lower.text}`;
      body = `zarząd zgadza się zmienić cel sezonu. Zamiast „${old}” oczekujemy teraz: ${lower.text}. Drugi raz w tym sezonie celu nie zmienimy.`;
      entry.text = `Cel obniżony: ${lower.text}.`;
    } else {
      subject = 'Zarząd nie zmienia celu sezonu';
      const why = reasons(game, sc, type, 0);
      body = `zarząd nie zgadza się na niższy cel sezonu. Cel pozostaje bez zmian: ${B.goal.text}.${why.length ? ` Powody: ${why.join('; ')}.` : ''}`;
      entry.text = 'Cel bez zmian.';
    }
  } else if (verdict === 'yes' || verdict === 'partial') {
    const change = applyGrant(game, game.clubId, type, granted);
    const what = type === 'shift' ? `przesunięcie ${zl(granted)} z budżetu transferowego do płac` : `zwiększenie ${REQ_TYPES[type].gen} o ${zl(granted)}${type === 'wage' ? ' tygodniowo' : ''}`;
    subject = verdict === 'yes' ? `Zgoda zarządu: ${label}` : `Częściowa zgoda zarządu: ${label}`;
    body = verdict === 'yes' ? `zarząd zgadza się na ${what}. ${change}` : `zarząd przyznaje ${zl(granted)}${type === 'wage' ? ' tygodniowo' : ''} z ${zl(amount)}, o które Pan prosił. ${change}`;
    if (cover) body += ` Właściciel dopłaca do płac ${zl(cover)} ze swoich pieniędzy, bo płace przekraczają ${pct(REQ.W_MAX)} przychodów klubu.`;
    if (type !== 'shift' && granted > 0.2 * before) {
      const g = raiseGoal(game);
      if (g) { body += ` Pieniądze zobowiązują: oczekujemy teraz co najmniej ${g.target}. miejsca (${g.text}).`; entry.goalRaised = g.target; }
    }
    entry.text = `${verdict === 'yes' ? 'Przyznano' : 'Przyznano część'}: ${zl(granted)}${type === 'wage' ? ' tygodniowo' : ''}.`;
  } else if (verdict === 'cond') {
    const goal = B.goal?.target ?? 10;
    const top = Math.max(1, Math.min(goal, t.played >= 4 && t.pos ? t.pos : goal));
    const d28 = addDaysIso(date, 28); // pierwszy dzień miesiąca, nie wcześniej niż za 4 tygodnie
    const by = d28.endsWith('-01') ? d28 : nextMonthStart(d28);
    const sum = type === 'wage' ? r100(amount * share) : r10k(amount * share);
    const cond = { id: `${date}:${type}`, date, type, amount: sum, top, by, status: 'open', season: SEASON_YEAR };
    R.conds.unshift(cond); R.conds.length = Math.min(R.conds.length, 12);
    entry.cond = { top, by, amount: sum };
    subject = `Warunek zarządu: ${label}`;
    const after = condSeasonEnds(game, by) ? ' (jeśli sezon skończy się wcześniej, liczy się miejsce na koniec sezonu)' : '';
    body = `zarząd nie zwiększy teraz budżetu. Jeśli ${fmtDate(by)} drużyna będzie ${placeAt(top)}${after}, dostanie Pan ${zl(sum)}${type === 'wage' ? ' tygodniowo' : ''}.`;
    entry.text = `Warunek: ${placeGoal(top)} ${fmtDate(by)}, wtedy ${zl(sum)}.`;
  } else {
    subject = `Odmowa zarządu: ${label}`;
    const why = note ? [] : reasons(game, sc, type, amount);
    body = `zarząd nie zgadza się na ${label === 'przesunięcie pieniędzy do płac' ? 'przesunięcie pieniędzy do płac' : `większy ${label}`} (${zl(amount)}${type === 'wage' ? ' tygodniowo' : ''}).${note ? ` ${note}` : ''}${why.length ? ` Powody: ${why.join('; ')}.` : ''}`;
    entry.text = note || (why.length ? `Powód: ${why[0]}.` : 'Bez uzasadnienia w liście.');
  }
  const next = requestStatusAfter(entry);
  body += ` Do tej sprawy wrócimy najwcześniej ${fmtDate(next)}.`;
  if (dTrust) body += ` Zaufanie zarządu: ${B.trust} na 100 (${dTrust}).`;
  R.log.unshift(entry); R.log.length = Math.min(R.log.length, 30);
  letter(game, date, `prosba:${entry.id}`, subject, body);
  return { ok: true, verdict, granted, entry, text: `${VERDICT_LABELS[verdict]}. ${entry.text}` };
}

function requestStatusAfter(e) {
  const days = e.verdict === 'no' ? REQ.AFTER_NO_DAYS : e.verdict === 'cond' ? REQ.SAME_TYPE_DAYS : REQ.AFTER_YES_DAYS;
  return addDaysIso(e.date, days);
}

// Teksty warunku: „1. miejsce” zamiast „1. miejsce lub wyżej”
export const placeGoal = (top) => (top <= 1 ? '1. miejsce' : `${top}. miejsce lub wyżej`);
export const placeAt = (top) => (top <= 1 ? 'na 1. miejscu' : `na ${top}. miejscu lub wyżej`);
const condSeasonEnds = (game, by) => by >= `${SEASON_YEAR + 1}-07-01`;
const condSeasonOf = (c) => c.season ?? (Number(c.date.slice(0, 4)) - (c.date.slice(5, 7) < '07' ? 1 : 0));

/**
 * Miejsce do rozliczenia warunku. Warunek z poprzedniego sezonu (termin wypadł po zmianie sezonu): miejsce na koniec
 * tamtego sezonu z archiwum, nie z nowej, pustej tabeli (błąd: mistrz dostawał „15. miejsce”). Warunek z bieżącego
 * sezonu: tabela, ale dopiero po 4 meczach (wcześniej rozliczenie czeka). Zwraca { pos, final } albo null (czekaj).
 */
function condPosition(game, cond) {
  if (condSeasonOf(cond) < SEASON_YEAR) {
    const last = lastSeasonPos(game, game.clubId);
    return last ? { pos: last.pos, final: true } : { pos: null, final: true };
  }
  const t = tablePos(game, game.clubId);
  if (!t.pos || t.played < 4) return null;
  return { pos: t.pos, final: false };
}

/** Comiesięczne rozliczenie warunków (1. dnia miesiąca, po ocenie zarządu). */
export function checkConditions(game, date, { push = true } = {}) {
  const R = game.board?.requests;
  if (!R?.conds?.length) return [];
  const out = [];
  for (const cond of R.conds) {
    if (cond.status !== 'open' || date < cond.by) continue;
    const t = condPosition(game, cond);
    if (!t) continue; // za mało meczów w nowym sezonie: rozliczenie 1. dnia kolejnego miesiąca
    const where = t.final ? `zakończyła sezon na ${t.pos}. miejscu` : `jest na ${t.pos}. miejscu`;
    const label = REQ_TYPES[cond.type].short;
    const per = cond.type === 'wage' ? ' tygodniowo' : '';
    if (t.pos && t.pos <= cond.top) {
      let ok = true;
      if (cond.type === 'wage' && wageRatio(game, game.clubId, Math.max(wageBill(game.world, game.clubId), game.finance.clubs[game.clubId].wageBudget) + cond.amount) > REQ.W_MAX) ok = !!ownerCover(game, 'wage', cond.amount, date);
      if (ok) {
        cond.status = 'met';
        const change = applyGrant(game, game.clubId, cond.type, cond.amount);
        out.push(letter(game, date, `warunek:${cond.id}`, `Zarząd dotrzymuje słowa: ${label}`, `umawialiśmy się na ${placeGoal(cond.top)}, a drużyna ${where}. Zarząd dotrzymuje słowa: ${label} rośnie o ${zl(cond.amount)}${per}. ${change}`, 'important', push));
        continue;
      }
    }
    cond.status = 'failed';
    game.board.trust = Math.round(clamp(game.board.trust - 1, 0, 100));
    const placeTxt = t.pos ? where : 'nie zajęła wymaganego miejsca';
    out.push(letter(game, date, `warunek:${cond.id}`, `Bez podwyżki od zarządu: ${label}`, `umawialiśmy się na ${placeGoal(cond.top)}, a drużyna ${placeTxt}. Dlatego zarząd nie zwiększa budżetu (${zl(cond.amount)}${per}). Zaufanie zarządu: ${game.board.trust} na 100 (-1).`, 'info', push));
  }
  return out;
}

// ------------------------------------------------------------ Kluby AI
/** W lipcu i styczniu każdy klub AI „prosi” o +25 % budżetu transferowego; przy S >= 20 dostaje go. */
export function aiBudgetRequests(game, date) {
  const F = game.finance;
  if (!F || F.aiBoardPass === date) return 0;
  F.aiBoardPass = date;
  const pos = date.slice(5, 7) === '07' ? {} : positionsAll(game);
  let n = 0;
  for (const club of CLUBS_PL) {
    const c = F.clubs[club.id];
    if (club.id === game.clubId || !c || !game.world.clubs[club.id]) continue;
    const amount = r10k(refBudget(c, 'transfer') * REQ.AI_SHARE);
    if (amount <= 0) continue;
    const sc = requestScore(game, club.id, 'transfer', amount, date, { trust: 50, pos: pos[club.id] ?? { pos: null, played: 0 }, goal: seasonGoalFor(club) });
    if (sc.S >= REQ.YES) { c.transferBudget += amount; n++; }
  }
  return n;
}

// ------------------------------------------------------------ Weto: progi
/** Mnożnik progów z typu właściciela: miliarder 1,2, oszczędny 0,9, miasto i spółka 1,0, rezerwy 0,8. */
export function ownerScale(o) {
  if (!o) return 1;
  if (o.type === 'miliarder') return 1.2;
  if (o.type === 'klub') return 0.8;
  if (o.zasobnosc <= 6) return 0.9;
  return 1;
}
/** Najdłuższy kontrakt dla wieku: 33+ rok, 31-32 dwa, 29-30 trzy, do 28 pięć (bramkarze o rok dłużej). */
export function maxYearsFor(player) {
  const a = player?.age ?? 25;
  let y = a >= 33 ? 1 : a >= 31 ? 2 : a >= 29 ? 3 : MAX_YEARS;
  if (GROUP[player?.pos] === 'GK') y += 1;
  return Math.min(MAX_YEARS, y);
}

/** Dane klubu do progów weta (raz na klub; tanie przy pętlach AI). */
export function clubBoardData(game, clubId) {
  const c = game.finance?.clubs?.[clubId];
  const o = ownerOf(game, clubId);
  const s = ownerScale(o);
  const wages = (game.world?.clubs?.[clubId] ? squadOf(game.world, clubId) : []).filter((p) => !p.loan).map((p) => [p.id, p.contract?.wage ?? 0]).sort((a, b) => b[1] - a[1]);
  return {
    clubId, s, tier: clubById(clubId)?.tier ?? 1,
    squadX: o && o.zasobnosc >= 14 && o.ambicja >= 14 ? VETO.SQUAD_X_RICH : VETO.SQUAD_X,
    wages, wageBudget: c?.wageBudget ?? Infinity,
    domestic: c?.plan?.domestic ?? c?.base ?? Infinity, skarbiec: c?.plan?.skarbiec ?? 0,
    revenue: (c?.plan?.domestic ?? c?.base ?? Infinity) + (c?.plan?.owner ?? 0), // przychody krajowe i stała dopłata właściciela
  };
}

/**
 * Progi zarządu dla kontraktu i odstępnego za zawodnika. kind: sign | renew.
 * Zwraca { wage, wageWhy, top, market, years, total, signOnPct, agentPct, fee, feeWarn, feeRevenue, value, s, override }.
 */
export function boardCaps(game, clubId, player, kind = 'sign', data = null) {
  const d = data ?? clubBoardData(game, clubId);
  const top = d.wages.find(([id]) => id !== player.id)?.[1] ?? 0;
  const market = marketWage(player.ovr ?? 10, d.tier, false, payLevel(clubId));
  const cur = player.contract?.wage ?? 0;
  const squadCap = Math.max(d.squadX * top, VETO.MARKET_X * market, kind === 'renew' ? VETO.RENEW_X * cur : 0) * d.s;
  const budgetCap = VETO.BUDGET_SHARE * d.wageBudget * d.s;
  const value = estimateValue(player);
  const ovr = game.board?.requests?.overrides?.[player.id];
  const override = ovr && ovr.until >= (game.date ?? '') && clubId === game.clubId ? ovr : null;
  return {
    wage: floor100(Math.min(squadCap, budgetCap)), wageWhy: squadCap <= budgetCap ? (top * d.squadX * d.s >= squadCap ? 'squad' : 'market') : 'budget',
    top, market, wageBudget: d.wageBudget, cur,
    years: maxYearsFor(player), age: player.age ?? 25,
    total: Math.round(VETO.TOTAL_SHARE * (d.revenue ?? d.domestic) * d.s), totalPct: VETO.TOTAL_SHARE * d.s,
    signOnPct: VETO.SIGN_ON * d.s, agentPct: VETO.AGENT * d.s,
    value, fee: Math.max(VETO.FEE_MIN, VETO.FEE_VALUE_X * d.s * value), feeWarn: Math.max(VETO.FEE_MIN, VETO.FEE_WARN_X * d.s * value),
    feeRevenue: d.skarbiec > VETO.FEE_REVENUE * d.domestic * d.s ? d.skarbiec : VETO.FEE_REVENUE * d.domestic * d.s, feeRevenuePct: VETO.FEE_REVENUE * d.s,
    s: d.s, override,
  };
}

const contractCost = (o) => o.wage * 52 * o.years + (o.signOn ?? 0) + (o.agentFee ?? 0);
/** Roczny koszt kontraktu: pensja i premia za podpis z prowizją rozłożone na lata (limit weta). */
export const contractAnnual = (o) => o.wage * 52 + ((o.signOn ?? 0) + (o.agentFee ?? 0)) / Math.max(1, o.years ?? 1);

/** Naruszenia progów przez ofertę kontraktu. Zwraca listę { code, text, over } (pusta = zarząd zatwierdzi). */
export function contractIssues(caps, offer) {
  if (!caps || !offer) return [];
  const ov = caps.override;
  if (ov && offer.wage <= ov.wage && offer.years <= ov.years && (offer.signOn ?? 0) <= ov.signOn && (offer.agentFee ?? 0) <= ov.agentFee) return [];
  const out = [];
  const add = (code, over, text) => out.push({ code, over, text });
  if (offer.wage > caps.wage) {
    const ref = caps.wageWhy === 'budget' ? null : caps.wageWhy === 'squad' && caps.top > 0 ? caps.top : caps.market;
    const what = caps.wageWhy === 'budget' ? `to ${pct(offer.wage / caps.wageBudget)} tygodniowego budżetu płac (${zl(caps.wageBudget)})`
      : caps.wageWhy === 'squad' && caps.top > 0 ? `jest o ${pct(offer.wage / ref - 1)} wyższa od najwyższej w kadrze (${zl(ref)})` : `jest o ${pct(offer.wage / ref - 1)} wyższa od rynkowej (${zl(ref)})`;
    add('wage', offer.wage / caps.wage - 1, `Proponowana pensja ${zl(offer.wage)} tygodniowo ${what}. Zaakceptujemy najwyżej ${zl(caps.wage)}.`);
  }
  if (offer.years > caps.years) add('years', offer.years / caps.years - 1, `Zawodnik ma ${caps.age} lat. W tym wieku zarząd podpisze kontrakt najwyżej na ${yearsLabel(caps.years)}.`);
  const total = contractAnnual(offer);
  if (total > caps.total) add('total', total / caps.total - 1, `Roczny koszt kontraktu (pensja, premia za podpis i prowizja rozłożone na lata) to ${zl(total)}. Zaakceptujemy najwyżej ${zl(caps.total)} (${pct(caps.totalPct)} rocznych przychodów klubu).`);
  const signCap = Math.round(caps.signOnPct * offer.wage * 52);
  if ((offer.signOn ?? 0) > signCap) add('signOn', offer.signOn / Math.max(1, signCap) - 1, `Premia za podpis ${zl(offer.signOn)} przekracza ${pct(caps.signOnPct)} pensji z pierwszego roku. Zaakceptujemy najwyżej ${zl(signCap)}.`);
  const agentCap = Math.round(caps.agentPct * offer.wage * 52 * offer.years);
  if ((offer.agentFee ?? 0) > agentCap) add('agent', offer.agentFee / Math.max(1, agentCap) - 1, `Prowizja agenta ${zl(offer.agentFee)} przekracza ${pct(caps.agentPct)} wartości kontraktu. Zaakceptujemy najwyżej ${zl(agentCap)}.`);
  return out;
}

/** Naruszenia progów przez kwotę odstępnego: { issues, warn } (warn: ostrzeżenie bez weta). */
export function feeIssues(caps, fee) {
  const out = [];
  if (!caps || !(fee > 0) || (caps.override && fee <= (caps.override.fee ?? 0))) return { issues: out, warn: null };
  if (fee > caps.fee) out.push({ code: 'fee', over: fee / caps.fee - 1, text: `Kwota ${zl(fee)} jest ponad ${String(Math.round(VETO.FEE_VALUE_X * caps.s * 10) / 10).replace('.', ',')} raza wyższa od wartości rynkowej zawodnika (${zl(caps.value)}). Zaakceptujemy najwyżej ${zl(floor10k(caps.fee))}.` });
  if (fee > caps.feeRevenue) out.push({ code: 'feeRevenue', over: fee / caps.feeRevenue - 1, text: `Kwota ${zl(fee)} przekracza ${pct(caps.feeRevenuePct)} rocznych przychodów krajowych klubu. Zaakceptujemy najwyżej ${zl(floor10k(caps.feeRevenue))}.` });
  const warn = !out.length && fee > caps.feeWarn ? `Zarząd ostrzega: kwota ${zl(fee)} jest o ${pct(fee / caps.value - 1)} wyższa od wartości rynkowej zawodnika (${zl(caps.value)}).` : null;
  return { issues: out, warn };
}

/** Dopasowanie oferty klubu AI do progów: pensja, długość i koszt całego kontraktu (bez weta, po prostu w granicach). */
export function fitOfferToCaps(caps, offer) {
  if (!caps || !offer) return offer;
  const o = { ...offer, bonus: { ...(offer.bonus ?? {}) } };
  o.wage = Math.min(o.wage, caps.wage);
  o.years = Math.max(1, Math.min(o.years ?? 1, caps.years));
  o.signOn = Math.min(o.signOn ?? 0, Math.round(caps.signOnPct * o.wage * 52));
  o.agentFee = Math.min(o.agentFee ?? 0, Math.round(caps.agentPct * o.wage * 52 * o.years));
  if (contractAnnual(o) > caps.total) o.wage = Math.max(0, Math.floor((caps.total - ((o.signOn ?? 0) + (o.agentFee ?? 0)) / o.years) / 52 / 100) * 100);
  return o;
}

// ------------------------------------------------------------ Weto: zapis, list, odwołanie
/**
 * Zapisuje weto zarządu i wysyła list. kind: contract | fee. Zwraca { text, veto }.
 * Ten sam zawodnik i rodzaj tego samego dnia: jeden list.
 */
export function recordVeto(game, { playerId, kind = 'contract', issues, offer = null, fee = 0, date = game.date }) {
  const R = ensureRequests(game);
  const p = game.world.players[playerId];
  const head = kind === 'fee' ? 'zarząd nie zatwierdzi tej oferty transferowej.' : 'zarząd nie zatwierdzi tego kontraktu.';
  const text = `${head} ${issues.map((x) => x.text).join(' ')}`;
  const id = `${date}:${playerId}:${kind}`;
  let veto = R.vetoes.find((v) => v.id === id);
  const fields = { id, date, playerId, name: p?.name ?? playerId, kind, issues: issues.map(({ code, over, text: t }) => ({ code, over, text: t })), offer: offer ? { wage: offer.wage, years: offer.years, signOn: offer.signOn ?? 0, agentFee: offer.agentFee ?? 0 } : null, fee, status: 'open', window: windowKey(date) };
  if (veto) Object.assign(veto, fields);
  else { veto = fields; R.vetoes.unshift(veto); R.vetoes.length = Math.min(R.vetoes.length, 10); }
  letter(game, date, `weto:${id}`, `Weto zarządu: ${veto.name}`, text);
  return { text: `Panie Trenerze, ${text} ${SIGN}`, veto };
}

/** Czy można się odwołać od weta (raz na zawodnika w oknie, najwyżej dwa razy w sezonie). */
export function appealStatus(game, playerId, date = game.date) {
  const R = ensureRequests(game);
  const v = R.vetoes.find((x) => x.playerId === playerId && x.status === 'open');
  if (!v) return { ok: false, text: 'Nie ma weta, od którego można się odwołać.' };
  const season = seasonOf(date);
  const A = R.appeals.season === season ? R.appeals : { season, count: 0, players: {} };
  if (A.count >= REQ.APPEALS_PER_SEASON) return { ok: false, text: 'W tym sezonie wykorzystałeś już oba odwołania od weta.' };
  if (A.players[playerId] === windowKey(date)) return { ok: false, text: 'W sprawie tego zawodnika odwołanie było już rozpatrzone w tym oknie.' };
  return { ok: true, veto: v, left: REQ.APPEALS_PER_SEASON - A.count };
}

/** Odwołanie od weta: decyzja z S (przekroczenie progu zamiast wielkości kwoty). Zgoda -3 zaufania, odmowa -5. */
export function appealVeto(game, playerId, date = game.date) {
  const st = appealStatus(game, playerId, date);
  if (!st.ok) return { ok: false, approved: false, text: st.text };
  const R = game.board.requests;
  const v = st.veto;
  const season = seasonOf(date);
  if (R.appeals.season !== season) R.appeals = { season, count: 0, players: {} };
  R.appeals.count++; R.appeals.players[playerId] = windowKey(date);
  const overshoot = Math.max(0, ...v.issues.map((x) => x.over ?? 0));
  const cost = v.kind === 'fee' ? v.fee : v.offer ? contractCost(v.offer) : 0;
  const sc = requestScore(game, game.clubId, 'transfer', 0, date, { overshoot, cost, seed: `odwolanie:${game.seed}:${date}:${playerId}` });
  const approved = sc.S >= REQ.APPEAL_YES;
  const d = approved ? -3 : -5;
  game.board.trust = Math.round(clamp(game.board.trust + d, 0, 100));
  v.status = approved ? 'approved' : 'refused';
  v.appeal = { date, S: sc.S };
  if (approved) {
    const w = windowAt(date);
    const prev = R.overrides[playerId] ?? {};
    R.overrides[playerId] = {
      until: w ? w.to : addDaysIso(date, 30),
      wage: Math.max(prev.wage ?? 0, v.offer?.wage ?? 0), years: Math.max(prev.years ?? 0, v.offer?.years ?? 0),
      signOn: Math.max(prev.signOn ?? 0, v.offer?.signOn ?? 0), agentFee: Math.max(prev.agentFee ?? 0, v.offer?.agentFee ?? 0),
      fee: Math.max(prev.fee ?? 0, v.fee ?? 0),
    };
  }
  const what = v.kind === 'fee' ? `ofertę ${zl(v.fee)} za zawodnika` : 'warunki kontraktu';
  const body = approved
    ? `po ponownym rozpatrzeniu zarząd akceptuje ${what} (${v.name}). Zgoda obowiązuje do ${fmtDate(R.overrides[playerId].until)}. Liczymy, że ta decyzja się obroni. Zaufanie zarządu: ${game.board.trust} na 100 (${d}).`
    : `zarząd podtrzymuje weto (${v.name}). ${v.issues[0]?.text ?? ''} Zaufanie zarządu: ${game.board.trust} na 100 (${d}).`;
  letter(game, date, `odwolanie:${v.id}`, approved ? `Odwołanie przyjęte: ${v.name}` : `Odwołanie odrzucone: ${v.name}`, body);
  return { ok: true, approved, text: approved ? `Zarząd przyjął odwołanie (${v.name}). Zaufanie ${d}.` : `Zarząd odrzucił odwołanie (${v.name}). Zaufanie ${d}.` };
}

/** Weto odstępnego przy ofercie gracza (offerForPlayer). Zwraca { veto: true, text } albo { warn }. */
export function checkUserFee(game, player, fee) {
  if (!game.finance?.clubs?.[game.clubId]) return { veto: false, warn: null };
  const caps = boardCaps(game, game.clubId, player, 'sign');
  const r = feeIssues(caps, fee);
  if (r.issues.length) return { veto: true, text: recordVeto(game, { playerId: player.id, kind: 'fee', issues: r.issues, fee }).text };
  return { veto: false, warn: r.warn };
}

// ------------------------------------------------------------ System dnia
registerDailySystem({
  id: 'boardRequests', order: 51, // po zarządzie (careerSystem, order 50): warunki sprawdzane po ocenie miesiąca
  run(game, date) {
    if (!game.world || !game.season || !game.finance || !game.board) return {};
    const messages = date.endsWith('-01') ? checkConditions(game, date, { push: false }) : [];
    if (date.endsWith('-07-02') || date.endsWith('-01-02')) aiBudgetRequests(game, date);
    return { messages };
  },
});

