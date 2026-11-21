// Wypożyczenia (docs/wypozyczenia.md): rodzaje i terminy, limity PZPN i FIFA, opłata, podział pensji, obietnica minut,
// opcja i obowiązek wykupu, prawo pierwokupu, klauzula odwołania, zakaz gry przeciwko klubowi macierzystemu.
// Gracz wypożycza do klubu (loanIn) i z klubu (prośba o propozycje, prośby klubów AI), kluby AI wypożyczają między sobą.
// Wypożyczony zawodnik jest w kadrze klubu wypożyczającego, kontrakt zostaje w klubie macierzystym: lista
// world.clubs[macierzysty].loaned i p.loan.from. Pensję dzielą oba kluby (finance.js wageBill).
// Powroty sprawdzane codziennie (system 'loans'), koniec sezonu: rollover.js wywołuje returnLoansAtRollover.
// Liczby oznaczone [SZAC] to założenia do kalibracji.

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { registerDecision } from '../core/decisions.js';
import { CLUBS_PL, clubById, leagueLabel } from '../data/clubs_pl.js';
import { DOMESTIC, SEASON_END } from '../config/calendar2026.js';
import { payLevel } from '../data/finanse_klubow.js';
import { squadOf } from '../world/worldGen.js';
import { GROUP, SQUAD_TARGETS, SQUAD_SIZE, isLoanedOut } from './squad.js';
import { book, spendable, wageRoom } from './finance.js';
import { squadCount, canSign } from './squadLimit.js';
import { marketWage, aiNegotiate } from './negotiation.js';
import { boardCaps, clubBoardData, feeIssues, checkUserFee } from './boardRequests.js';
import { spellsOf, syncSpell } from '../season/history.js';
import { completeTransfer, playerWillingness, askingPrice, notForSale, windowOf, fmtZl, breaksMinimum as breaksMinimumShared } from './transfers.js';
import { fmtDate } from '../ui/dom.js';
import { directorAttr, directorWho, sieStep } from './director.js'; // dyrektor sportowy: sieć kontaktów, podpis (docs/dyrektor-sportowy.md)

export { isLoanedOut };

export const LOAN = {
  MAX_OUT: 8, // PZPN od Jul 1, 2025: najwyżej 8 zawodników wypożyczonych z klubu naraz
  MAX_IN: 8, // i 8 wypożyczonych do klubu
  MAX_PAIR: 4, // najwyżej 4 do tego samego klubu
  EXEMPT_AGE: 21, // [SZAC] zwolnienie z limitu do 21 lat i wychowankowie (FIFA); w PZPN niepotwierdzone
  FREE_FEE_AGE: 21, // do 21 lat bez opłaty za wypożyczenie [SZAC]
  FEE: 0.1, // opłata za sezon: domyślnie 10 % wartości (kluby AI 5-15 %) [SZAC]
  PROMISE: 0.5, // obiecany udział w minutach (część minut zespołu) [SZAC]
  PROMISE_GAMES: 8, // sprawdzenie obietnicy po 8 meczach klubu wypożyczającego
  PROMISE_GAP: 0.15, // tolerancja: udział niższy niż obietnica minus 0,15 daje prawo przerwania
  DECIDE_DAYS: 30, // opcja wykupu: decyzja w ostatnich 30 dniach wypożyczenia
  ROFR_DAYS: 30, // prawo pierwokupu: w trakcie wypożyczenia i 30 dni po nim
  ROFR_MATCH_DAYS: 3, // 3 dni na wyrównanie oferty
  RECALL_X: 0.05, // odwołanie: zwrot części opłaty i 5 % wartości zawodnika [SZAC]
  NO_PARENT_CUT: 10, // zakaz gry przeciwko klubowi macierzystemu: wypożyczający płaci ok. 10 pkt mniej pensji [SZAC]
  RECALL_CUT: 5, // klauzula odwołania: wypożyczający płaci 5 pkt mniej [SZAC]
  ROFR_ADD: 5, // prawo pierwokupu: wypożyczający płaci 5 pkt więcej [SZAC]
  OBLIGATION_APPS: { runda: 8, sezon: 15, rok: 15 }, // domyślny warunek obowiązku wykupu (występy)
  AI_CHANCE: 0.3, // klub AI z potrzebą na pozycji bierze zawodnika z listy do wypożyczenia (na tydzień okna)
  YOUNG_BONUS: 0.3, // młody bez gry chętniej idzie na wypożyczenie (nastawienie)
  OFFER_DAYS: 6, // ważność propozycji wypożyczenia
  REQUEST_CHANCE: 0.05, // klub AI pyta o młodego rezerwowego gracza (na zawodnika i tydzień okna) [SZAC]
  STAY_DAYS: 45, // wypożyczony do klubu gracza mówi, czy chce zostać, ok. 6 tygodni przed końcem wypożyczenia [SZAC]
};
export const LOAN_TYPE_NAMES = { runda: 'na rundę', sezon: 'do końca sezonu', rok: 'na rok' };
const STARTERS = { GK: 1, DEF: 4, MID: 4, ATT: 2 };

const groupOf = (p) => GROUP[p.pos] ?? 'MID';
const name = (id) => clubById(id)?.name ?? 'klub';
const isAiClub = (game, id) => !!id && id !== game.clubId && !!game.world.clubs[id] && !!clubById(id);
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
const r100 = (x) => Math.round(x / 100) * 100;
const r10k = (x) => Math.round(x / 10000) * 10000;
const msg = (date, o) => createMessage({ date, category: 'transfers', from: 'Dyrektor sportowy', priority: 'info', ...o });
const pct = (x) => `${Math.round(x * 100)} %`;

// ------------------------------------------------------------ Terminy
/** Rodzaje wypożyczenia w oknie: latem runda albo sezon, zimą runda (do końca sezonu) albo rok. */
export function loanTypesFor(date) {
  const w = windowOf(date);
  if (!w) return [];
  return w === DOMESTIC.transferWindows[0] ? ['runda', 'sezon'] : ['runda', 'rok'];
}

/**
 * Koniec wypożyczenia: runda z lata do dnia przed zimowym oknem, sezon do 30 czerwca, z zimy runda do 30 czerwca,
 * rok do dnia przed kolejnym zimowym oknem. Poza oknem null.
 */
export function loanUntil(type, date) {
  const [summer, winter] = DOMESTIC.transferWindows;
  const w = windowOf(date);
  if (!w) return null;
  if (w === summer) return type === 'runda' ? addDays(winter.from, -1) : SEASON_END;
  return type === 'rok' ? addDays(winter.from, 363) : SEASON_END; // kolejne zimowe okno o 52 tygodnie później [SZAC]
}

/** Opłata za wypożyczenie: do 21 lat zero, później część wartości za sezon (runda: połowa). */
export function loanFee(p, type, k = LOAN.FEE) {
  if ((p.age ?? 25) <= LOAN.FREE_FEE_AGE) return 0;
  return r10k((p.value ?? 0) * k * (type === 'runda' ? 0.5 : 1));
}

/** Warunki wypożyczenia z formularza albo z liczby (stary podpis loanIn: część pensji w %). */
export function loanTerms(game, p, raw = {}, date = game.date) {
  if (typeof raw === 'number') raw = { share: raw };
  const types = loanTypesFor(date);
  const type = types.includes(raw.type) ? raw.type : (types[types.length - 1] ?? raw.type ?? 'sezon');
  const share = clamp(Math.round(Number(raw.share ?? 100) / 5) * 5, 0, 100);
  const optionFee = Math.max(0, Number(raw.option?.fee ?? raw.optionFee) || 0);
  const oblFee = Math.max(0, Number(raw.obligation?.fee ?? raw.obligationFee) || 0);
  const stayUp = !!(raw.obligation?.stayUp ?? raw.stayUp);
  return {
    type, share,
    fee: raw.fee != null && raw.fee !== '' ? Math.max(0, Math.round(Number(raw.fee) || 0)) : loanFee(p, type),
    option: optionFee > 0 && !(oblFee > 0) ? { fee: optionFee } : null,
    obligation: oblFee > 0 ? { fee: oblFee, apps: stayUp ? 0 : Number(raw.obligation?.apps ?? raw.apps) || LOAN.OBLIGATION_APPS[type] || 15, stayUp } : null,
    firstRefusal: !!raw.firstRefusal, recall: !!raw.recall, noParent: !!raw.noParent,
    promise: raw.promise != null ? clamp(Number(raw.promise) || 0, 0, 1) : LOAN.PROMISE,
  };
}

/** Kontrakt po wykupie (obowiązek: ustalony przy podpisie). Pensja co najmniej dotychczasowa. [SZAC] */
export function contractAfter(p, to, until, fullWage = p.loan?.wage ?? p.contract?.wage ?? 0) {
  const tier = clubById(to)?.tier ?? 1;
  const wage = r100(Math.max(fullWage, marketWage(p.ovr ?? 10, tier, p.nat !== 'POL' && tier === 1, payLevel(to)) * 0.95));
  const years = (p.age ?? 25) <= 23 ? 4 : (p.age ?? 25) <= 29 ? 3 : (p.age ?? 25) <= 32 ? 2 : 1;
  return { wage, until: `${Number(until.slice(0, 4)) + years}-06-30`, clause: 0, years };
}

// ------------------------------------------------------------ Rekord wypożyczenia i lista klubu macierzystego
/** Rekord p.loan (wywołuje completeTransfer przy kind 'loan'). Dopisuje zawodnika do listy klubu macierzystego. */
export function makeLoan(game, p, { from, to, date, share = 100, ...t } = {}) {
  const type = t.type ?? 'sezon';
  let until = t.until ?? loanUntil(type, date) ?? SEASON_END;
  if (p.contract?.until && p.contract.until < until) until = p.contract.until;
  const L = {
    from, start: date, until, type, share: clamp(Number(share) || 0, 0, 100), fee: t.fee ?? 0, wage: p.contract?.wage ?? 0,
    option: t.option ?? null, obligation: t.obligation ?? null, firstRefusal: !!t.firstRefusal, recall: !!t.recall, noParent: !!t.noParent,
    promise: t.promise ?? LOAN.PROMISE, minutes: 0, apps: 0, games: 0, seen: { min: p.season?.min ?? 0, apps: p.season?.apps ?? 0 }, tier: clubById(to)?.tier ?? null,
  };
  if (L.obligation && !L.obligation.contract) L.obligation = { ...L.obligation, contract: contractAfter(p, to, until, L.wage) };
  const W = game.world;
  if (from && W.clubs[from]) { const list = (W.clubs[from].loaned ??= []); if (!list.includes(p.id)) list.push(p.id); }
  return L;
}

/** Usuwa zawodnika z listy wypożyczonych klubu macierzystego. */
export function dropLoanIndex(world, p) {
  const c = p?.loan?.from && world.clubs[p.loan.from];
  if (c?.loaned) c.loaned = c.loaned.filter((id) => id !== p.id);
}

/** Stary zapis: pełny rekord p.loan (sezon do 30 czerwca) i lista klubu macierzystego. */
function normalizeLoan(p, date) {
  const L = p.loan;
  if (L.type) return L;
  L.type = 'sezon'; L.start = L.start ?? p.lastMove ?? date; L.until = L.until ?? SEASON_END;
  L.share = L.share ?? 100; L.fee = L.fee ?? 0; L.wage = L.wage ?? p.contract?.wage ?? 0;
  L.option = L.option ?? null; L.obligation = L.obligation ?? null;
  L.firstRefusal = !!L.firstRefusal; L.recall = !!L.recall; L.noParent = !!L.noParent;
  L.promise = L.promise ?? LOAN.PROMISE; L.minutes = L.minutes ?? 0; L.apps = L.apps ?? 0; L.games = L.games ?? 0;
  L.seen = L.seen ?? { min: p.season?.min ?? 0, apps: p.season?.apps ?? 0 };
  return L;
}

/** Leniwa migracja (stare zapisy) i odbudowa list wypożyczonych. Raz na zapis, potem tylko gdy lista zniknęła. */
export function ensureLoans(game) {
  if (!game.world || !game.market) return;
  if (game.market.loansV === 1) return;
  const W = game.world;
  for (const c of Object.values(W.clubs)) c.loaned = [];
  for (const p of Object.values(W.players)) {
    if (!p.loan) continue;
    normalizeLoan(p, game.date ?? SEASON_END);
    const c = W.clubs[p.loan.from];
    if (c && !c.loaned.includes(p.id)) c.loaned.push(p.id);
  }
  game.market.loansV = 1;
}

/** Wszyscy wypożyczeni (z list klubów macierzystych). */
export function allLoaned(game) {
  const out = [];
  for (const [cid, c] of Object.entries(game.world.clubs)) for (const id of c.loaned ?? []) { const p = game.world.players[id]; if (isLoanedOut(p, cid)) out.push(p); }
  return out;
}

/** Zawodnicy klubu wypożyczeni do innych klubów. */
export function loansOut(game, clubId) {
  return (game.world.clubs[clubId]?.loaned ?? []).map((id) => game.world.players[id]).filter((p) => isLoanedOut(p, clubId));
}
export const loansIn = (game, clubId) => squadOf(game.world, clubId).filter((p) => p.loan);

/** Zwolnienie z limitu liczby wypożyczeń: do 21 lat albo wychowanek klubu macierzystego (pierwszy okres w historii). [SZAC] */
export function loanExempt(p, parentId) {
  if ((p.age ?? 99) <= LOAN.EXEMPT_AGE) return true;
  return spellsOf(p)[0]?.c === parentId;
}

/** Liczniki limitów PZPN: { out, in } (bez zwolnionych) i wszystkie. */
export function loanCounts(game, clubId) {
  const out = loansOut(game, clubId); const inn = loansIn(game, clubId);
  return { out: out.filter((p) => !loanExempt(p, clubId)).length, in: inn.filter((p) => !loanExempt(p, p.loan.from)).length, outAll: out.length, inAll: inn.length };
}
const pairCount = (game, from, to) => loansOut(game, from).filter((p) => p.clubId === to).length;

/** Powód, dla którego wypożyczenie z obecnego klubu zawodnika do klubu to jest niemożliwe (albo null). */
export function loanBlockers(game, p, to, terms, date = game.date) {
  const from = p.clubId;
  if (p.loan) return 'Zawodnik jest już wypożyczony. Przepisy FIFA zabraniają dalszego wypożyczania.';
  if (!windowOf(date)) return 'Okno transferowe jest zamknięte.';
  const until = loanUntil(terms.type, date);
  if (!until) return 'Ten rodzaj wypożyczenia nie jest możliwy w tym oknie.';
  if (!p.contract?.until || p.contract.until < until) return `Kontrakt zawodnika kończy się ${p.contract?.until ? fmtDate(p.contract.until) : 'wcześniej'}, przed końcem wypożyczenia.`;
  if (from === to) return 'To ten sam klub.';
  const exempt = loanExempt(p, from);
  if (!exempt && loanCounts(game, from).out >= LOAN.MAX_OUT) return `${name(from)} ma już ${LOAN.MAX_OUT} zawodników wypożyczonych do innych klubów (limit PZPN).`;
  if (to && !exempt && loanCounts(game, to).in >= LOAN.MAX_IN) return `${name(to)} ma już ${LOAN.MAX_IN} wypożyczonych zawodników (limit PZPN).`;
  if (to && pairCount(game, from, to) >= LOAN.MAX_PAIR) return `Z ${name(from)} do ${name(to)} wypożyczono już ${LOAN.MAX_PAIR} zawodników (limit PZPN dla jednego klubu).`;
  return null;
}
/** Zarząd (squadLimitSystem.js): czy można wypożyczyć do klubu na domyślnych warunkach. */
export const canLoanTo = (game, p, to, date = game.date) => !loanBlockers(game, p, to, loanTerms(game, p, { share: 100 }, date), date);

// ------------------------------------------------------------ Ocena zawodnika
function rankInGroup(game, p, clubId) {
  return squadOf(game.world, clubId).filter((x) => x.id !== p.id && groupOf(x) === groupOf(p) && x.ovr > p.ovr).length;
}
/** Rezerwowy w klubie: poza najlepszymi w grupie pozycji (1 bramkarz, 4 obrońców, 4 pomocników, 2 napastników). */
export const isBench = (game, p, clubId = p.clubId) => rankInGroup(game, p, clubId) >= STARTERS[groupOf(p)];
const groupMedian = (game, clubId, g, skip = null) => {
  const xs = squadOf(game.world, clubId).filter((x) => x.id !== skip && groupOf(x) === g).map((x) => x.ovr).sort((a, b) => a - b);
  return xs.length ? xs[Math.floor(xs.length / 2)] : 0;
};
/** Odejście zostawiłoby klub poniżej minimum grupy pozycji albo kadry. */
// Minimum kadry: wspólne sprawdzenie z transfers.js (liczy też zawodników w trakcie transferu, transferDeals.js)
const breaksMinimum = (game, p) => breaksMinimumShared(game, p);

/** Nastawienie do wypożyczenia: jak do transferu, a młody rezerwowy (do 21 lat) chętniej (+0,3). */
export function loanWillingness(game, p, to) {
  const w = playerWillingness(game, p, to);
  if (!((p.age ?? 25) <= 21 && p.clubId && isBench(game, p))) return w;
  const score = Math.min(1, w.score + LOAN.YOUNG_BONUS);
  return { ...w, score, verdict: score >= 0.7 ? 'chętny' : score >= 0.45 ? 'otwarty' : score >= 0.2 ? 'niechętny' : 'odmowa', reasons: [...w.reasons, 'Chce grać regularnie, wypożyczenie mu to da'] };
}

/** Klub AI wypożycza: młody (do 21 lat, poza trójką najlepszych) albo z listy do wypożyczenia. Minimalna część pensji. */
export function lenderTerms(game, p, terms) {
  const listed = game.market.listed[p.id]?.kind === 'loan';
  const club = name(p.clubId);
  if (!listed && ((p.age ?? 25) > 21 || notForSale(game, p))) return { ok: false, text: `${club} nie wypożycza tego zawodnika.` };
  const min = (listed ? 50 : 75) - (terms.noParent ? LOAN.NO_PARENT_CUT : 0) - (terms.recall ? LOAN.RECALL_CUT : 0) + (terms.firstRefusal ? LOAN.ROFR_ADD : 0);
  if (terms.share < min) return { ok: false, min, text: `${club} chce, żebyś płacił co najmniej ${min} % pensji.` };
  const price = askingPrice(game, p);
  if (terms.option && terms.option.fee < price) return { ok: false, min, text: `${club} zgodzi się na opcję wykupu za co najmniej ${fmtZl(price)}.` };
  if (terms.obligation && terms.obligation.fee < r10k(price * 0.9)) return { ok: false, min, text: `${club} zgodzi się na obowiązek wykupu za co najmniej ${fmtZl(r10k(price * 0.9))}.` };
  return { ok: true, min, text: '' };
}

// ------------------------------------------------------------ Zawarcie wypożyczenia
/** Wypożyczenie zawodnika do klubu to (bez sprawdzania warunków). Księguje opłatę. Zwraca wpis historii. */
export function createLoan(game, playerId, to, terms, date = game.date) {
  const p = game.world.players[playerId];
  const from = p.clubId;
  const entry = completeTransfer(game, { playerId, to, kind: 'loan', loanShare: terms.share, loan: terms, date });
  if (terms.fee) {
    book(game.finance, to, date, 'out', 'loans', terms.fee, `${p.name}: opłata za wypożyczenie`);
    book(game.finance, from, date, 'in', 'loans', terms.fee, `${p.name}: opłata za wypożyczenie do ${name(to)}`);
  }
  entry.until = p.loan.until;
  return entry;
}

/** Gracz wypożycza zawodnika klubu AI (dawny loanIn: drugi argument to część pensji w % albo warunki). */
export function requestLoanIn(game, playerId, raw = {}) {
  const p = game.world.players[playerId];
  if (!p || !isAiClub(game, p.clubId)) return { ok: false, text: 'Tego zawodnika nie można wypożyczyć.' };
  if (!windowOf(game.date)) return { ok: false, text: 'Okno transferowe jest zamknięte.' };
  const cap = canSign(game);
  if (!cap.ok) return { ok: false, text: cap.text };
  const terms = loanTerms(game, p, raw);
  const block = loanBlockers(game, p, game.clubId, terms);
  if (block) return { ok: false, text: block };
  const lend = lenderTerms(game, p, terms);
  if (!lend.ok) return { ok: false, text: lend.text };
  if (Math.round(p.contract.wage * terms.share / 100) > wageRoom(game.finance, game.world, game.clubId)) return { ok: false, text: 'Brakuje miejsca w budżecie płac.' };
  if (terms.fee > spendable(game.finance, game.clubId)) return { ok: false, text: `Opłata za wypożyczenie (${fmtZl(terms.fee)}) przekracza budżet transferowy.` };
  if (loanWillingness(game, p, game.clubId).verdict === 'odmowa') return { ok: false, text: `${p.name} nie chce przejść na wypożyczenie do twojego klubu.` };
  createLoan(game, p.id, game.clubId, terms);
  const L = p.loan;
  return { ok: true, text: `${p.name} dołącza na wypożyczenie ${LOAN_TYPE_NAMES[L.type]} (do ${fmtDate(L.until)}). Płacisz ${L.share} % pensji${L.fee ? `, opłata ${fmtZl(L.fee)}` : ''}.${L.obligation ? ` Obowiązek wykupu za ${fmtZl(L.obligation.fee)}.` : ''}` };
}

// ------------------------------------------------------------ Propozycje dla zawodników gracza
const weekOf = (date) => Math.floor(Date.parse(`${date}T12:00:00Z`) / (7 * 86400000));

/** Kluby AI, które wezmą zawodnika: ta sama albo niższa liga, potrzeba na pozycji, miejsce w kadrze i w płacach. */
function loanProposals(game, p, terms, date, rng, max = 3) {
  const F = game.finance; const W = game.world;
  const tier = clubById(p.clubId)?.tier ?? 1;
  const g = groupOf(p);
  const cands = [];
  for (const c of CLUBS_PL) {
    if (!isAiClub(game, c.id) || c.parent || c.tier < tier || c.tier > 4) continue;
    const st = squadCount(game, c.id);
    if (st.full || st.total >= SQUAD_SIZE.max - 1 || loanBlockers(game, p, c.id, terms, date)) continue;
    const grp = squadOf(W, c.id).filter((x) => groupOf(x) === g);
    const median = groupMedian(game, c.id, g);
    if (p.ovr < median - 1.5) continue; // za słaby dla tego klubu [SZAC]
    const need = (grp.length < SQUAD_TARGETS[g].target ? 1 : 0) + (p.ovr >= median - 0.3 ? 1 : 0) + (c.tier > tier ? 0.5 : 0);
    if (need < 1) continue;
    cands.push({ c, need: need + rng.next() * 0.8 });
  }
  const out = [];
  for (const { c } of cands.sort((a, b) => b.need - a.need)) {
    if (out.length >= max) break;
    const full = p.contract.wage;
    let share = clamp(Math.round((terms.share + rng.pick([-15, -10, -5, 0, 0, 5]) - (terms.noParent ? LOAN.NO_PARENT_CUT : 0) - (terms.recall ? LOAN.RECALL_CUT : 0)) / 5) * 5, 25, 100);
    const room = wageRoom(F, W, c.id);
    if (full * share / 100 > room) share = Math.floor(room / Math.max(1, full) * 20) * 5;
    if (share < 25) continue;
    if (loanWillingness(game, p, c.id).verdict === 'odmowa') continue;
    const money = spendable(F, c.id);
    const fee = Math.min(loanFee(p, terms.type, 0.05 + rng.next() * 0.1), r10k(money * 0.3));
    const value = p.value ?? 0;
    const option = terms.option && terms.option.fee <= value * 1.6 ? terms.option : null;
    const obligation = terms.obligation && terms.obligation.fee <= Math.min(money, value * 1.3) ? terms.obligation : null;
    out.push({ c: c.id, terms: { ...terms, share, fee: Math.max(0, fee), option, obligation }, dropped: [terms.option && !option ? 'opcji wykupu' : null, terms.obligation && !obligation ? 'obowiązku wykupu' : null].filter(Boolean) });
  }
  return out;
}

/** Gracz prosi o propozycje wypożyczenia własnego zawodnika: za 1-3 dni przyjdzie 1-3 propozycji. */
export function askLoanOffers(game, playerId, raw = {}) {
  const p = game.world.players[playerId];
  if (!p || p.clubId !== game.clubId) return { ok: false, text: 'To nie jest zawodnik twojej kadry.' };
  if (p.loan) return { ok: false, text: 'Zawodnik jest wypożyczony do twojego klubu: przepisy FIFA zabraniają dalszego wypożyczania.' };
  const w = windowOf(game.date);
  if (!w) return { ok: false, text: 'Okno transferowe jest zamknięte. Propozycje wypożyczenia zbierzesz w następnym oknie.' };
  const terms = loanTerms(game, p, raw);
  const block = loanBlockers(game, p, null, terms);
  if (block) return { ok: false, text: block };
  const asks = (game.market.loanAsks ??= {});
  if (asks[p.id]) return { ok: false, text: `${directorWho(game)} już szuka klubu dla ${p.name}.` };
  const rng = new Rng(`wyp-oferty:${game.seed}:${p.id}:${weekOf(game.date)}`);
  // Sieć kontaktów dyrektora: co 6 punktów od 10 dzień szybciej i jedna propozycja więcej (wakat: wolniej), director.js
  const step = sieStep(directorAttr(game, game.clubId, 'SIE'));
  let due = addDays(game.date, clamp(rng.int(1, 3) - step, 1, 4));
  if (due > w.to) due = w.to;
  asks[p.id] = { terms, date: game.date, due, step };
  return { ok: true, text: `${directorWho(game)} szuka klubu dla ${p.name}. Propozycje przyjdą najpóźniej ${fmtDate(due)}.` };
}
export function cancelLoanAsk(game, playerId) {
  delete game.market.loanAsks?.[playerId];
  return { ok: true, text: 'Zrezygnowano z szukania klubu.' };
}

function offerLetter(game, p, offers, date, { ask = true } = {}) {
  const lines = offers.map((o) => {
    const t = o.terms;
    const extra = [t.fee ? `opłata ${fmtZl(t.fee)}` : 'bez opłaty', t.option ? `opcja wykupu ${fmtZl(t.option.fee)}` : null, t.obligation ? `obowiązek wykupu ${fmtZl(t.obligation.fee)}` : null, t.recall ? 'klauzula odwołania' : null, t.noParent ? 'zakaz gry przeciwko nam' : null].filter(Boolean).join(', ');
    return `${name(o.from)} (${leagueLabel(clubById(o.from))}): ${LOAN_TYPE_NAMES[t.type]}, płaci ${t.share} % pensji, ${extra}.${o.dropped?.length ? ` Nie zgadza się na warunek ${o.dropped.join(' ani ')}.` : ''}`;
  });
  return createMessage({
    date, key: `wyp-propozycje:${offers[0].id}`, category: 'transfers', from: ask ? 'Dyrektor sportowy' : name(offers[0].from), priority: 'important',
    subject: ask ? `Propozycje wypożyczenia: ${p.name} (${offers.length})` : `${name(offers[0].from)} chce wypożyczyć ${p.name}`,
    body: `${ask ? `Kluby, które wezmą ${p.name} (${p.pos}, ${p.age} lat) na wypożyczenie:` : `${name(offers[0].from)} pyta o wypożyczenie ${p.name} (${p.pos}, ${p.age} lat). U nas gra mało, tam miałby regularne minuty.`}\n\n${lines.join('\n')}\n\nResztę pensji płaci nasz klub. Propozycje są ważne do ${fmtDate(offers[0].expires)}. Szczegóły: Transfery, Kontrakty, Wypożyczeni z klubu.`,
    actions: [...offers.map((o) => ({ id: o.id, label: offers.length > 1 ? `Przyjmij: ${name(o.from)}` : 'Przyjmij' })), { id: 'reject', label: offers.length > 1 ? 'Odrzuć wszystkie' : 'Odrzuć' }],
    refs: { kind: 'loanOffers', offerId: offers[0].id, ids: offers.map((o) => o.id) }, optional: true,
  });
}

function storeOffers(game, p, props, date, ask) {
  const offers = props.map((x) => ({ id: `wyp-${date}-${p.id}-${x.c}`, kind: 'loanOut', playerId: p.id, from: x.c, terms: x.terms, dropped: x.dropped, status: 'open', date, expires: addDays(date, LOAN.OFFER_DAYS), ask }));
  game.market.offers.unshift(...offers);
  return offers;
}

/** Otwarte propozycje wypożyczenia zawodnika gracza. */
export const openLoanOffers = (game, playerId = null) => game.market.offers.filter((o) => o.kind === 'loanOut' && o.status === 'open' && (!playerId || o.playerId === playerId) && o.expires >= game.date);

/** Przyjęcie propozycji wypożyczenia zawodnika gracza. */
export function acceptLoanOffer(game, offerId, date = game.date) {
  const o = game.market.offers.find((x) => x.id === offerId && x.kind === 'loanOut');
  if (!o || o.status !== 'open') return { ok: false, text: 'Propozycja jest już nieaktualna.' };
  const p = game.world.players[o.playerId];
  const fail = (text) => { o.status = 'expired'; return { ok: false, text }; };
  if (o.expires < date) return fail('Propozycja wygasła.');
  if (!p || p.clubId !== game.clubId) return fail('Zawodnik nie należy już do twojej kadry.');
  if (!game.world.clubs[o.from]) return fail('Klub nie gra już w rozgrywkach.');
  const block = loanBlockers(game, p, o.from, o.terms, date);
  if (block) return { ok: false, text: block };
  if (squadCount(game, o.from).full) return fail(`${name(o.from)} wycofuje propozycję: nie ma miejsca w kadrze.`);
  if (loanWillingness(game, p, o.from).verdict === 'odmowa') return fail(`${p.name} nie chce iść na wypożyczenie do ${name(o.from)}.`);
  createLoan(game, p.id, o.from, o.terms, date);
  o.status = 'accepted';
  for (const x of game.market.offers) if (x !== o && x.kind === 'loanOut' && x.playerId === p.id && x.status === 'open') x.status = 'rejected';
  delete game.market.loanAsks?.[p.id];
  const L = p.loan;
  return { ok: true, squad: true, text: `${p.name} odchodzi na wypożyczenie do ${name(o.from)} do ${fmtDate(L.until)}. ${name(o.from)} płaci ${L.share} % pensji (${fmtZl(p.contract.wage)} tygodniowo), resztę (${fmtZl(L.wage - p.contract.wage)}) płacisz ty.${L.fee ? ` Opłata: ${fmtZl(L.fee)}.` : ''}` };
}
export function rejectLoanOffers(game, ids) {
  for (const o of game.market.offers) if (ids.includes(o.id) && o.status === 'open') o.status = 'rejected';
  return { ok: true, text: 'Odrzucono propozycje wypożyczenia.' };
}

// ------------------------------------------------------------ Wykup, pierwokup
/** Klub AI kupiłby zawodnika: OVR co najmniej mediana grupy, kwota w budżecie i w progach zarządu, porozumienie z zawodnikiem. */
export function aiWouldBuy(game, p, clubId, fee, date = game.date) {
  if (!isAiClub(game, clubId)) return null;
  if (p.ovr < groupMedian(game, clubId, groupOf(p), p.id)) return null;
  if (fee > spendable(game.finance, clubId)) return null;
  const cb = clubBoardData(game, clubId);
  const full = p.loan?.wage ?? p.contract?.wage ?? 0;
  const pl = { ...p, contract: { ...(p.contract ?? {}), wage: full } };
  const caps = boardCaps(game, clubId, pl, 'sign', cb);
  if (feeIssues(caps, fee).issues.length) return null;
  const room = wageRoom(game.finance, game.world, clubId) + (p.clubId === clubId ? p.contract?.wage ?? 0 : 0);
  const neg = aiNegotiate({ kind: 'sign', player: pl, club: clubById(clubId), fromClub: clubById(p.loan?.from ?? p.clubId), date, rng: new Rng(`wyp-wykup:${game.seed}:${p.id}:${clubId}:${date}`), budget: { wage: Math.min(caps.wage, Math.max(full, room)), maxYears: caps.years, total: caps.total } });
  return neg.result === 'signed' ? neg.contract : null;
}

/** Gracz korzysta z opcji wykupu (w ostatnich 30 dniach). Transfer następuje w dniu końca wypożyczenia. */
export function exerciseOption(game, playerId, date = game.date) {
  const p = game.world.players[playerId];
  const L = p?.loan;
  if (!L || p.clubId !== game.clubId || !L.option) return { ok: false, text: 'Brak opcji wykupu.' };
  if (L.exercised) return { ok: false, text: 'Opcja wykupu jest już zgłoszona.' };
  if (daysBetween(date, L.until) > LOAN.DECIDE_DAYS) return { ok: false, text: `Z opcji wykupu skorzystasz w ostatnich ${LOAN.DECIDE_DAYS} dniach wypożyczenia (od ${fmtDate(addDays(L.until, -LOAN.DECIDE_DAYS))}).` };
  const fee = L.option.fee;
  if (fee > spendable(game.finance, game.clubId)) return { ok: false, text: `Kwota wykupu (${fmtZl(fee)}) przekracza budżet transferowy albo saldo klubu.` };
  const board = checkUserFee(game, p, fee);
  if (board.veto) return { ok: false, text: board.text };
  const full = L.wage;
  const pl = { ...p, contract: { ...p.contract, wage: full } };
  const caps = boardCaps(game, game.clubId, pl, 'sign');
  const neg = aiNegotiate({ kind: 'sign', player: pl, club: clubById(game.clubId), fromClub: clubById(L.from), date, rng: new Rng(`wyp-opcja:${game.seed}:${p.id}:${date}`), budget: { wage: Math.min(caps.wage, Math.max(full, wageRoom(game.finance, game.world, game.clubId) + p.contract.wage)), maxYears: caps.years, total: caps.total } });
  if (neg.result !== 'signed') return { ok: false, text: `${p.name} nie zgodził się na warunki kontraktu, które mieszczą się w budżecie płac.` };
  L.exercised = { date, contract: neg.contract };
  return { ok: true, text: `Zgłoszono wykup ${p.name} za ${fmtZl(fee)}. Transfer nastąpi ${fmtDate(addDays(L.until, 1))}. Kontrakt: ${fmtZl(neg.contract.wage)} tygodniowo do ${fmtDate(neg.contract.until)}.` };
}

/**
 * Prawo pierwokupu: klub macierzysty przyjął ofertę klubu buyerId za zawodnika z prawem pierwokupu (w trakcie
 * wypożyczenia i 30 dni po nim). Klub AI z prawem wyrównuje od razu, gdy kupiłby zawodnika na zasadach opcji. Gracz
 * dostaje list z „Wyrównaj ofertę” i ma 3 dni; do tego czasu transfer czeka. Zwraca { blocked, matched?, pending?, text? }.
 */
export function firstRefusal(game, p, buyerId, fee, date = game.date, contract = null) {
  const R = p?.rofr;
  if (!R) return { blocked: false };
  if (R.until < date || !game.world.clubs[R.club]) { delete p.rofr; return { blocked: false }; }
  if (R.club === buyerId || p.clubId === R.club) return { blocked: false };
  const holder = R.club;
  delete p.rofr; // jedno użycie
  if (holder === game.clubId) {
    const o = { id: `pierwokup-${date}-${p.id}`, kind: 'rofr', playerId: p.id, from: p.clubId, buyer: buyerId, fee, contract, status: 'open', date, expires: addDays(date, LOAN.ROFR_MATCH_DAYS) };
    game.market.offers.unshift(o);
    (game.market.loanMail ??= []).push(createMessage({
      date, key: `pierwokup:${o.id}`, category: 'transfers', from: name(p.clubId), priority: 'important',
      subject: `Prawo pierwokupu: ${p.name}`,
      body: `${name(p.clubId)} przyjął ofertę ${name(buyerId)} za ${p.name}: ${fmtZl(fee)}. Masz prawo pierwokupu: możesz wyrównać ofertę do ${fmtDate(o.expires)}. Potem zawodnik przejdzie do ${name(buyerId)}.`,
      actions: [{ id: 'match', label: 'Wyrównaj ofertę' }, { id: 'pass', label: 'Zrezygnuj' }], refs: { kind: 'loanRofr', offerId: o.id }, optional: true,
    }));
    return { blocked: true, pending: true };
  }
  if (squadCount(game, holder).full) return { blocked: false };
  const c = aiWouldBuy(game, p, holder, fee, date);
  if (!c) return { blocked: false };
  completeTransfer(game, { playerId: p.id, to: holder, fee, contract: c, kind: 'transfer', date });
  return { blocked: true, matched: holder, text: `${name(holder)} skorzystał z prawa pierwokupu i wyrównał ofertę ${name(buyerId)}: ${p.name} przechodzi do ${name(holder)} za ${fmtZl(fee)}.` };
}

/** Gracz wyrównuje ofertę (prawo pierwokupu). */
export function matchFirstRefusal(game, offerId, date = game.date) {
  const o = game.market.offers.find((x) => x.id === offerId && x.kind === 'rofr');
  if (!o || o.status !== 'open') return { ok: false, text: 'Termin na wyrównanie oferty minął.' };
  const p = game.world.players[o.playerId];
  if (!p || p.clubId !== o.from) { o.status = 'expired'; return { ok: false, text: 'Zawodnik zmienił już klub.' }; }
  const cap = canSign(game);
  if (!cap.ok) return { ok: false, text: cap.text };
  if (o.fee > spendable(game.finance, game.clubId)) return { ok: false, text: `Kwota ${fmtZl(o.fee)} przekracza budżet transferowy albo saldo klubu.` };
  const board = checkUserFee(game, p, o.fee);
  if (board.veto) return { ok: false, text: board.text };
  const caps = boardCaps(game, game.clubId, p, 'sign');
  const neg = aiNegotiate({ kind: 'sign', player: p, club: clubById(game.clubId), fromClub: clubById(p.clubId), date, rng: new Rng(`wyp-pierwokup:${game.seed}:${p.id}:${date}`), budget: { wage: Math.min(caps.wage, Math.max(p.contract.wage, wageRoom(game.finance, game.world, game.clubId))), maxYears: caps.years, total: caps.total } });
  if (neg.result !== 'signed') return { ok: false, text: `${p.name} nie zgodził się na warunki kontraktu w twoim budżecie płac.` };
  completeTransfer(game, { playerId: p.id, to: game.clubId, fee: o.fee, contract: neg.contract, kind: 'transfer', date });
  o.status = 'matched';
  return { ok: true, squad: true, text: `Wyrównano ofertę: ${p.name} przechodzi do twojego klubu za ${fmtZl(o.fee)}.` };
}

/** Termin minął albo gracz zrezygnował: transfer do klubu, który złożył ofertę. */
function passFirstRefusal(game, o, date) {
  o.status = 'passed';
  const p = game.world.players[o.playerId];
  if (!p || p.clubId !== o.from || !isAiClub(game, o.buyer) || squadCount(game, o.buyer).full || spendable(game.finance, o.buyer) < o.fee || !o.contract) return null;
  completeTransfer(game, { playerId: p.id, to: o.buyer, fee: o.fee, contract: o.contract, kind: 'transfer', date });
  return `${p.name} przechodzi z ${name(o.from)} do ${name(o.buyer)} za ${fmtZl(o.fee)}.`;
}

// ------------------------------------------------------------ Koniec wypożyczenia
function conversion(game, p, L) {
  const b = p.clubId;
  if (!isAiClub(game, b) && b !== game.clubId) return null;
  if (!clubById(b) || clubById(b).tier > 4) return null;
  if (L.exercised && L.option) return { fee: L.option.fee, contract: L.exercised.contract, kind: 'opcja' };
  const o = L.obligation;
  if (!o) return null;
  const met = o.stayUp ? (clubById(b).tier <= (L.tier ?? 9)) : L.apps >= (o.apps ?? 0);
  return met ? { fee: o.fee, contract: o.contract ?? contractAfter(p, b, L.until, L.wage), kind: 'obowiązek' } : null;
}

/**
 * Koniec wypożyczenia: powrót do klubu macierzystego albo wykup (opcja zgłoszona, obowiązek spełniony).
 * why: 'koniec' | 'odwołanie' | 'przerwane' | 'odesłany' | 'spadek'. Zwraca wiadomości do poczty.
 */
export function endLoan(game, p, date, { why = 'koniec', quiet = false } = {}) {
  const W = game.world;
  const L = normalizeLoan(p, date);
  const parent = L.from; const borrower = p.clubId;
  const userSide = parent === game.clubId ? 'parent' : borrower === game.clubId ? 'borrower' : null;
  const conv = why === 'koniec' ? conversion(game, p, L) : null;
  const share = L.games ? L.minutes / (L.games * 90) : 0;
  if (W.clubs[borrower]) W.clubs[borrower].squad = W.clubs[borrower].squad.filter((id) => id !== p.id);
  dropLoanIndex(W, p);
  p.contract = { ...p.contract, wage: L.wage }; p.wage = L.wage;
  delete p.loan; delete p.loanBlock;
  const out = [];
  const say = (subject, body, priority = 'info') => { if (!quiet && userSide) out.push(msg(date, { key: `wyp-koniec:${p.id}:${date}`, subject, body, priority })); };
  if (!W.clubs[parent] || !clubById(parent)) {
    p.clubId = null; p.free = true; p.askWage = L.wage; p.contract = null; p.wage = 0; p.freeSince = date;
    if (!game.market.free.includes(p.id)) game.market.free.push(p.id);
    syncSpell(p, date);
    return out;
  }
  W.clubs[parent].squad.push(p.id); p.clubId = parent; p.squad = 'A';
  if (conv && W.clubs[borrower]) {
    completeTransfer(game, { playerId: p.id, to: borrower, fee: conv.fee, contract: conv.contract, kind: 'transfer', date });
    say(`Wykup po wypożyczeniu: ${p.name}`, `${name(borrower)} wykupuje ${p.name} z ${name(parent)} za ${fmtZl(conv.fee)} (${conv.kind === 'opcja' ? 'opcja wykupu' : 'obowiązek wykupu spełniony'}). Kontrakt do ${fmtDate(p.contract.until)}, ${fmtZl(p.contract.wage)} tygodniowo.`, 'important');
    return out;
  }
  syncSpell(p, date);
  if (L.firstRefusal && W.clubs[borrower]) p.rofr = { club: borrower, until: addDays(date, LOAN.ROFR_DAYS) };
  let mood = '';
  if (share > 0.6) { p.morale = clamp((p.morale ?? 12) + 1, 1, 20); mood = ' Wraca podbudowany regularną grą.'; }
  const bench = isBench(game, p, parent);
  if (bench) { p.morale = clamp((p.morale ?? 12) - 1, 1, 20); mood += ' Widzi, że u nas nie ma pewnego miejsca, i chce porozmawiać o swojej roli (Kadra, Rozmowy).'; }
  const how = { koniec: 'koniec wypożyczenia', 'odwołanie': 'odwołanie z wypożyczenia', przerwane: 'przerwanie wypożyczenia', 'odesłany': 'wcześniejszy powrót za porozumieniem', spadek: 'klub wypożyczający spadł do III ligi' }[why] ?? why;
  if (userSide === 'parent') {
    say(`${p.name} wraca z wypożyczenia`, `${p.name} wraca z ${name(borrower)} (${how}). Bilans: ${L.apps} meczów, ${pct(share)} minut zespołu.${mood}`, bench ? 'important' : 'info');
  } else if (userSide === 'borrower') {
    say(`${p.name} wraca do ${name(parent)}`, `${p.name} wraca do ${name(parent)} (${how}). U nas: ${L.apps} meczów.${L.option && !L.exercised ? ' Nie skorzystano z opcji wykupu.' : ''}${L.obligation ? ' Warunek obowiązku wykupu nie został spełniony.' : ''}${p.rofr ? ` Prawo pierwokupu obowiązuje do ${fmtDate(p.rofr.until)}.` : ''}`);
  }
  return out;
}

/** Koniec sezonu (rollover.js): powroty wypożyczeń do 30 czerwca i wypożyczeń z udziałem klubów spadających do IV ligi. */
export function returnLoansAtRollover(game, oldEnd, newStart) {
  ensureLoans(game);
  const names = [];
  for (const p of allLoaned(game)) {
    const L = normalizeLoan(p, newStart);
    const gone = !clubById(p.clubId) || clubById(p.clubId).tier > 4 || !clubById(L.from) || clubById(L.from).tier > 4;
    if (L.until > oldEnd && !gone) continue;
    if (p.clubId === game.clubId || L.from === game.clubId) names.push(p.name);
    endLoan(game, p, newStart, { quiet: true, why: L.until > oldEnd ? 'spadek' : 'koniec' });
  }
  return names;
}

/** Koszt odwołania: zwrot części opłaty za niewykorzystany okres i 5 % wartości zawodnika. */
export function recallCost(p, date) {
  const L = p.loan;
  const total = Math.max(1, daysBetween(L.start, L.until));
  const left = clamp(daysBetween(date, L.until) / total, 0, 1);
  return r10k((L.fee ?? 0) * left + (p.value ?? 0) * LOAN.RECALL_X);
}
const winterWindow = (date) => windowOf(date) === DOMESTIC.transferWindows[1];
/** Najbliższe okno transferowe (od) po dacie albo koniec sezonu. */
function nextWindowStart(date) { return DOMESTIC.transferWindows.find((w) => w.from > date)?.from ?? null; }

/** Klub macierzysty gracza odwołuje zawodnika (klauzula, tylko zimowe okno). */
export function recallLoan(game, playerId, date = game.date) {
  const p = game.world.players[playerId];
  if (!isLoanedOut(p, game.clubId)) return { ok: false, text: 'Ten zawodnik nie jest wypożyczony z twojego klubu.' };
  const L = normalizeLoan(p, date);
  if (!L.recall) return { ok: false, text: 'Umowa nie ma klauzuli odwołania. Wcześniejszy powrót tylko za porozumieniem.' };
  if (!winterWindow(date)) return { ok: false, text: 'Z klauzuli odwołania skorzystasz tylko w zimowym oknie transferowym.' };
  const cost = recallCost(p, date);
  const borrower = p.clubId;
  if (cost) { book(game.finance, game.clubId, date, 'out', 'loans', cost, `${p.name}: odwołanie z wypożyczenia`); book(game.finance, borrower, date, 'in', 'loans', cost, `${p.name}: odwołanie przez ${name(game.clubId)}`); }
  endLoan(game, p, date, { why: 'odwołanie', quiet: true });
  return { ok: true, squad: true, text: `${p.name} wraca z ${name(borrower)}. Koszt odwołania: ${fmtZl(cost)}.` };
}

/**
 * Przerwanie wypożyczenia zawodnika gracza: bez kosztów po niedotrzymaniu obietnicy minut, inaczej za porozumieniem
 * (klub AI zgadza się, gdy zawodnik mało gra; zwrot części opłaty). Poza oknem powrót w najbliższym oknie.
 */
export function terminateLoan(game, playerId, date = game.date) {
  const p = game.world.players[playerId];
  if (!isLoanedOut(p, game.clubId)) return { ok: false, text: 'Ten zawodnik nie jest wypożyczony z twojego klubu.' };
  const L = normalizeLoan(p, date);
  const borrower = p.clubId;
  const share = L.games ? L.minutes / (L.games * 90) : 0;
  let cost = 0;
  if (!L.breach) {
    if (!windowOf(date)) return { ok: false, text: 'Za porozumieniem wypożyczenie przerwiesz tylko w oknie transferowym.' };
    if (share >= 0.5 && L.games >= 3) return { ok: false, text: `${name(borrower)} nie zgadza się: ${p.name} gra regularnie (${pct(share)} minut).` };
    cost = r10k((L.fee ?? 0) * clamp(daysBetween(date, L.until) / Math.max(1, daysBetween(L.start, L.until)), 0, 1));
  }
  if (windowOf(date)) {
    if (cost) { book(game.finance, game.clubId, date, 'out', 'loans', cost, `${p.name}: przerwanie wypożyczenia`); book(game.finance, borrower, date, 'in', 'loans', cost); }
    endLoan(game, p, date, { why: 'przerwane', quiet: true });
    return { ok: true, squad: true, text: `${p.name} wraca z ${name(borrower)}.${cost ? ` Zwrot opłaty: ${fmtZl(cost)}.` : ''}` };
  }
  const next = nextWindowStart(date);
  const until = next ? addDays(next, -1) : L.until;
  if (until < L.until) L.until = until;
  L.ending = true;
  return { ok: true, text: `Wypożyczenie ${p.name} kończy się ${fmtDate(L.until)}: powrót możliwy w najbliższym oknie transferowym.` };
}

/** Gracz odsyła wypożyczonego do klubu macierzystego (za porozumieniem, w oknie). Opłata nie wraca. */
export function sendBackLoan(game, playerId, date = game.date) {
  const p = game.world.players[playerId];
  if (!p?.loan || p.clubId !== game.clubId) return { ok: false, text: 'Ten zawodnik nie jest wypożyczony do twojego klubu.' };
  if (!windowOf(date)) return { ok: false, text: 'Wcześniejszy powrót tylko w oknie transferowym.' };
  const from = p.loan.from;
  endLoan(game, p, date, { why: 'odesłany', quiet: true });
  return { ok: true, squad: true, text: `${p.name} wraca do ${name(from)}. Opłata za wypożyczenie nie jest zwracana.` };
}

// ------------------------------------------------------------ Klub AI: tydzień okna
/** Kluby AI z potrzebą na pozycji biorą zawodników z listy do wypożyczenia i młodych rezerwowych wyżej notowanych klubów. */
export function aiLoansWeek(game, date, rng) {
  const W = game.world; const F = game.finance;
  const types = loanTypesFor(date);
  if (!types.length) return [];
  const pool = [];
  for (const [id, l] of Object.entries(game.market.listed)) { const p = W.players[id]; if (l.kind === 'loan' && p && isAiClub(game, p.clubId) && !p.loan) pool.push(p); }
  // Młodzi rezerwowi klubów Ekstraklasy i 1 Ligi, których kluby chętnie wypożyczą [SZAC]
  for (const c of CLUBS_PL) {
    if (!isAiClub(game, c.id) || c.tier > 2) continue;
    for (const p of squadOf(W, c.id)) if ((p.age ?? 25) <= 21 && !p.loan && !game.market.listed[p.id] && isBench(game, p, c.id) && rng.chance(0.85)) pool.push(p);
  }
  const moves = [];
  const used = new Set();
  const tryLoan = (p, c) => {
    const type = rng.pick(types);
    const same = clubById(p.clubId).tier === c.tier;
    const value = p.value ?? 0;
    const opt = rng.next();
    const terms = loanTerms(game, p, {
      type, share: same ? 50 + 5 * rng.int(0, 5) : 100, fee: loanFee(p, type, 0.05 + rng.next() * 0.1),
      ...(opt < 0.15 ? { optionFee: r10k(value * (1.1 + rng.next() * 0.3)) } : opt < 0.2 ? { obligationFee: r10k(value * (0.9 + rng.next() * 0.2)) } : {}),
      firstRefusal: rng.chance(0.1), recall: rng.chance(0.15), noParent: same && rng.chance(0.2), promise: 0.4,
    }, date);
    if (loanBlockers(game, p, c.id, terms, date)) return false;
    // Część pensji: niższa liga 100 %, ta sama 50-75 %; gdy nie mieści się w budżecie płac, klub macierzysty dopłaca
    // (najmniej 25 % po stronie wypożyczającego) [SZAC]
    const room = wageRoom(F, W, c.id);
    if (p.contract.wage * terms.share / 100 > room) terms.share = Math.floor(room / Math.max(1, p.contract.wage) * 20) * 5;
    if (terms.share < 25 || terms.fee > spendable(F, c.id)) return false;
    if (terms.obligation && terms.obligation.fee > spendable(F, c.id)) terms.obligation = null;
    if (loanWillingness(game, p, c.id).verdict === 'odmowa') return false;
    const parent = p.clubId;
    moves.push(createLoan(game, p.id, c.id, terms, date));
    used.add(p.id);
    // Klub macierzysty uzupełnia kadrę najlepszym juniorem z akademii (od 17 lat), gdy spadła poniżej celu [SZAC]
    const club = W.clubs[parent];
    if (club && squadOf(W, parent).length < SQUAD_SIZE.target) {
      const kid = (club.academy ?? []).map((id) => W.players[id]).filter((x) => x && (x.age ?? 0) >= 17).sort((a, b) => b.ovr - a.ovr)[0];
      if (kid) { club.academy = club.academy.filter((id) => id !== kid.id); club.squad.push(kid.id); kid.squad = 'A'; }
    }
    return true;
  };
  // Miejsce w kadrze: poniżej limitu zarządu (z zapasem) i najwyżej 28 zawodników razem z młodzieżowcami [SZAC]
  const roomIn = (c) => { const st = squadCount(game, c.id); return st.counted < st.soft - 1 && st.total < SQUAD_SIZE.max - 1; };
  const borrowers = CLUBS_PL.filter((x) => isAiClub(game, x.id) && !x.parent && x.tier <= 4);
  // 1. Klub z potrzebą na pozycji (szansa 0,3 na tydzień): grupa poniżej celu albo zawodnik co najmniej na poziomie
  // mediany grupy (Ekstraklasa: do 0,8 poniżej, bo bierze młodych z silniejszych klubów) [SZAC]
  for (const c of rng.shuffle(borrowers)) {
    if (!rng.chance(LOAN.AI_CHANCE) || !roomIn(c)) continue;
    const squad = squadOf(W, c.id);
    const short = new Set(Object.keys(SQUAD_TARGETS).filter((g) => squad.filter((x) => groupOf(x) === g).length < SQUAD_TARGETS[g].target));
    const median = Object.fromEntries(Object.keys(SQUAD_TARGETS).map((g) => [g, groupMedian(game, c.id, g)]));
    const cands = pool.filter((p) => !used.has(p.id) && p.clubId !== c.id && (clubById(p.clubId)?.tier ?? 9) <= c.tier
      && (short.has(groupOf(p)) ? p.ovr >= median[groupOf(p)] - 1.5 : p.ovr >= median[groupOf(p)] - (c.tier === 1 ? 1.2 : 0.2)) && !breaksMinimum(game, p)).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
    for (const p of cands) if (tryLoan(p, c)) break;
  }
  // 2. Klub Ekstraklasy albo 1 Ligi szuka gry dla młodego rezerwowego w niższej lidze (szansa 0,2 na tydzień) [SZAC]
  for (const parent of rng.shuffle(CLUBS_PL.filter((x) => isAiClub(game, x.id) && x.tier <= 2))) {
    if (!rng.chance(0.2)) continue;
    const p = rng.shuffle(pool.filter((x) => x.clubId === parent.id && !used.has(x.id) && (x.age ?? 25) <= 21 && !breaksMinimum(game, x)))[0];
    if (!p) continue;
    for (const c of rng.shuffle(borrowers.filter((x) => x.tier > parent.tier && roomIn(x))).slice(0, 6)) {
      if (p.ovr < groupMedian(game, c.id, groupOf(p)) - 0.5) continue;
      if (tryLoan(p, c)) break;
    }
  }
  return moves;
}

/** Kluby AI pytają o młodych rezerwowych gracza (list z propozycją). */
function aiLoanRequests(game, date, rng) {
  const out = [];
  const open = new Set(game.market.offers.filter((o) => o.kind === 'loanOut' && o.status === 'open').map((o) => o.playerId));
  for (const p of squadOf(game.world, game.clubId)) {
    if (out.length >= 2) break;
    if ((p.age ?? 25) > 21 || p.loan || open.has(p.id) || game.market.loanAsks?.[p.id] || !isBench(game, p, game.clubId)) continue;
    if ((game.tactics?.xi ?? []).includes(p.id) || !rng.chance(LOAN.REQUEST_CHANCE)) continue;
    const terms = loanTerms(game, p, { share: 100, fee: 0 }, date);
    const props = loanProposals(game, p, terms, date, rng, 1);
    if (!props.length) continue;
    const offers = storeOffers(game, p, props, date, false);
    out.push(offerLetter(game, p, offers, date, { ask: false }));
  }
  return out;
}

// ------------------------------------------------------------ Dzień
/**
 * Co dalej po wypożyczeniu (zawodnik wypożyczony do klubu gracza, raz, LOAN.STAY_DAYS przed końcem): chęć pozostania
 * z morale, minut wobec obietnicy, poziomu klubu wobec klubu macierzystego, wieku i losu [SZAC]. Chce zostać: prosi
 * o rozmowę o wykupie (albo o umowę, gdy kontrakt w klubie macierzystym kończy się razem z wypożyczeniem).
 * Nie chce: wraca do klubu macierzystego (rozmowy o nowym kontrakcie, chęć odejścia albo walka o skład).
 * Zapis: p.loan.stay = { want, date, plan }. Tylko informacja i powód rozmowy, bez zmiany zasad transferu.
 */
export function loanStayNotice(game, p, L, date) {
  const rng = new Rng(`wyp-pozostanie:${game.seed}:${p.id}:${L.start}`);
  const share = L.games ? L.minutes / (L.games * 90) : L.promise;
  const prest = (id) => clubById(id)?.prestige ?? 5;
  const age = p.age ?? 25;
  const score = 0.12 * ((p.morale ?? 12) - 12) + 1.5 * (share - L.promise) + 0.12 * (prest(game.clubId) - prest(L.from))
    + (age >= 30 ? 0.2 : age <= 21 ? -0.1 : 0) + rng.gauss(0, 0.6);
  const want = score > 0;
  const ends = !!p.contract?.until && p.contract.until <= addDays(L.until, 1); // kontrakt w klubie macierzystym kończy się z wypożyczeniem
  const plan = want ? 'stay' : ends ? 'free' : rng.pick(['renew', 'leave', 'return']);
  L.stay = { want, date, plan };
  const parent = name(L.from);
  const stats = `U nas: ${L.apps} meczów, ${pct(share)} minut.`;
  let body;
  if (want && ends) body = `${p.name} dobrze czuje się w klubie i chciałby zostać. Jego kontrakt z ${parent} kończy się razem z wypożyczeniem, ${fmtDate(L.until)}: potem jako wolny zawodnik może podpisać umowę z nami. ${stats}`;
  else if (want && L.option) body = `${p.name} chciałby zostać u nas na stałe i pyta, czy skorzystamy z opcji wykupu (${fmtZl(L.option.fee)}, decyzja w ostatnich ${LOAN.DECIDE_DAYS} dniach wypożyczenia). ${stats}`;
  else if (want) body = `${p.name} chciałby zostać u nas na stałe i pyta, czy go wykupimy. Kontrakt ma z ${parent}, więc decyzja o transferze należy do nich: jeśli chcesz go zatrzymać, złóż ofertę w oknie transferowym. ${stats}`;
  else body = `${p.name} raczej nie jest zainteresowany pozostaniem. Po wypożyczeniu (${fmtDate(L.until)}) ${{
    free: `jego kontrakt z ${parent} się kończy i rozgląda się za nowym klubem`,
    renew: `wraca do ${parent}, z którym rozmawia o nowym kontrakcie`,
    leave: `wraca do ${parent}, ale chce stamtąd odejść i szuka nowego klubu`,
    return: `wraca do ${parent} i chce tam walczyć o miejsce w składzie`,
  }[plan]}. ${stats}`;
  return msg(date, { key: `wyp-przyszlosc:${p.id}:${L.start}`, from: `Agent zawodnika ${p.name}`, subject: want ? `${p.name} chce zostać po wypożyczeniu` : `${p.name} po wypożyczeniu wraca do ${parent}`, body, priority: want ? 'important' : 'info' });
}

function loansDay(game, date) {
  const out = [];
  const prev = addDays(date, -1);
  const games = new Map();
  for (const f of game.fixtures ?? []) {
    if (f.date !== prev || !f.played || f.comp === 'friendly') continue;
    for (const id of [f.home, f.away]) games.set(id, (games.get(id) ?? 0) + 1);
  }
  const today = (game.fixtures ?? []).filter((f) => f.date === date && !f.played);
  for (const p of allLoaned(game)) {
    const L = normalizeLoan(p, date);
    // Minuty i występy w klubie wypożyczającym (przyrost statystyk sezonu, po zerowaniu od nowa)
    const s = p.season ?? {};
    const dMin = (s.min ?? 0) >= L.seen.min ? (s.min ?? 0) - L.seen.min : (s.min ?? 0);
    const dApps = (s.apps ?? 0) >= L.seen.apps ? (s.apps ?? 0) - L.seen.apps : (s.apps ?? 0);
    L.minutes += dMin; L.apps += dApps; L.seen = { min: s.min ?? 0, apps: s.apps ?? 0 };
    if (prev >= L.start) L.games += games.get(p.clubId) ?? 0;
    if (L.until < date) { out.push(...endLoan(game, p, date)); continue; }
    // Zakaz gry przeciwko klubowi macierzystemu: niedostępny w dniu meczu z nim (squad.js isAvailable)
    if (L.noParent && today.some((f) => (f.home === p.clubId && f.away === L.from) || (f.home === L.from && f.away === p.clubId))) p.loanBlock = date; else delete p.loanBlock;
    // Obietnica minut: po 8 meczach klubu wypożyczającego
    if (!L.checked && L.games >= LOAN.PROMISE_GAMES) {
      L.checked = true;
      const share = L.minutes / (L.games * 90);
      if (share < L.promise - LOAN.PROMISE_GAP) {
        L.breach = date;
        if (L.from === game.clubId) {
          out.push(createMessage({ date, key: `wyp-minuty:${p.id}:${L.start}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'important', subject: `${p.name} mało gra na wypożyczeniu`,
            body: `${name(p.clubId)} obiecał ${pct(L.promise)} minut, a ${p.name} grał ${pct(share)} (${L.apps} meczów z ${L.games}). Możesz przerwać wypożyczenie bez kosztów. ${windowOf(date) ? 'Zawodnik wróci od razu.' : 'Zawodnik wróci w najbliższym oknie transferowym.'}`,
            actions: [{ id: 'end', label: 'Przerwij wypożyczenie' }, { id: 'keep', label: 'Niech zostanie' }], refs: { kind: 'loanBreach', playerId: p.id }, optional: true }));
        } else if (isAiClub(game, L.from) && (p.age ?? 25) <= 23) {
          // Klub AI ściąga młodego, który nie gra (w najbliższym oknie) [SZAC]
          const next = nextWindowStart(date);
          if (windowOf(date)) { out.push(...endLoan(game, p, date, { why: 'przerwane' })); continue; }
          if (next && addDays(next, -1) < L.until) { L.until = addDays(next, -1); L.ending = true; }
          if (p.clubId === game.clubId) out.push(msg(date, { key: `wyp-minuty-ai:${p.id}:${L.start}`, subject: `${name(L.from)} przerywa wypożyczenie ${p.name}`, body: `${name(L.from)} obiecano ${pct(L.promise)} minut, ${p.name} grał ${pct(share)}. Klub macierzysty korzysta z prawa przerwania: zawodnik wraca ${fmtDate(addDays(L.until, 1))}.`, priority: 'important' }));
        }
      }
    }
    // Opcja wykupu: decyzja w ostatnich 30 dniach
    if (L.option && !L.decided && daysBetween(date, L.until) <= LOAN.DECIDE_DAYS) {
      L.decided = true;
      if (p.clubId === game.clubId) {
        out.push(createMessage({ date, key: `wyp-opcja:${p.id}:${L.start}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'important', subject: `Opcja wykupu: ${p.name}`,
          body: `Wypożyczenie ${p.name} kończy się ${fmtDate(L.until)}. Możesz go wykupić z ${name(L.from)} za ${fmtZl(L.option.fee)} (kwota ustalona przy wypożyczeniu). Bilans u nas: ${L.apps} meczów, ${pct(L.games ? L.minutes / (L.games * 90) : 0)} minut. Decyzja do ${fmtDate(L.until)}.`,
          actions: [{ id: 'buy', label: `Wykup za ${fmtZl(L.option.fee)}` }, { id: 'skip', label: 'Nie wykupuj' }], refs: { kind: 'loanOption', playerId: p.id }, optional: true }));
      } else if (isAiClub(game, p.clubId)) {
        const c = aiWouldBuy(game, p, p.clubId, L.option.fee, date);
        if (c) {
          L.exercised = { date, contract: c };
          if (L.from === game.clubId) out.push(msg(date, { key: `wyp-opcja-ai:${p.id}:${L.start}`, subject: `${name(p.clubId)} wykupi ${p.name}`, body: `${name(p.clubId)} korzysta z opcji wykupu ${p.name} za ${fmtZl(L.option.fee)}. Transfer nastąpi ${fmtDate(addDays(L.until, 1))}.`, priority: 'important' }));
        }
      }
    }
    // Wypożyczony do klubu gracza: przed końcem wypożyczenia mówi, czy chce zostać (nie pyta o swój kontrakt,
    // bo kontrakt jest w klubie macierzystym)
    if (p.clubId === game.clubId && L.from !== game.clubId && !L.obligation && !L.exercised && !L.stay && daysBetween(date, L.until) <= LOAN.STAY_DAYS) {
      const m = loanStayNotice(game, p, L, date);
      if (m) out.push(m);
    }
  }
  // Prośby gracza o propozycje
  for (const [pid, a] of Object.entries(game.market.loanAsks ?? {})) {
    if (a.due > date) continue;
    delete game.market.loanAsks[pid];
    const p = game.world.players[pid];
    if (!p || p.clubId !== game.clubId || p.loan) continue;
    const terms = loanTerms(game, p, a.terms, date);
    const n = clamp(new Rng(`wyp-n:${game.seed}:${pid}:${weekOf(a.date)}`).int(1, 3) + (a.step ?? 0), 1, 5); // sieć kontaktów dyrektora
    const props = windowOf(date) ? loanProposals(game, p, terms, date, new Rng(`wyp-oferty:${game.seed}:${pid}:${weekOf(a.date)}`), n) : [];
    if (!props.length) {
      out.push(msg(date, { key: `wyp-brak:${pid}:${date}`, subject: `Brak chętnych na wypożyczenie ${p.name}`, body: `Żaden klub nie zgłosił się po ${p.name} na tych warunkach. Spróbuj z niższą częścią pensji albo bez opcji i obowiązku wykupu.`, priority: 'important' }));
      continue;
    }
    out.push(offerLetter(game, p, storeOffers(game, p, props, date, true), date));
  }
  // Prawo pierwokupu: 3 dni minęły
  for (const o of game.market.offers) {
    if (o.kind !== 'rofr' || o.status !== 'open' || o.expires >= date) continue;
    const t = passFirstRefusal(game, o, date);
    if (t) out.push(msg(date, { key: `pierwokup-koniec:${o.id}`, subject: 'Prawo pierwokupu wygasło', body: t }));
  }
  return out;
}

registerDailySystem({
  id: 'loans', order: 1,
  run(game, date) {
    if (!game.world || !game.market || !game.finance) return {};
    ensureLoans(game);
    return { messages: loansDay(game, date) };
  },
});

/** Tydzień okna (po rynku transferowym): wypożyczenia między klubami AI i prośby o zawodników gracza. */
registerDailySystem({
  id: 'loanMarket', order: 52,
  run(game, date) {
    if (!game.world || !game.market || !game.finance) return {};
    const messages = [...(game.market.loanMail ?? [])];
    game.market.loanMail = [];
    const w = windowOf(date);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (w && dow === 1) {
      const rng = new Rng(`wypozyczenia:${game.seed}:${date}`);
      const moves = aiLoansWeek(game, date, rng);
      messages.push(...aiLoanRequests(game, date, rng));
      if (moves.length) messages.push(createMessage({ date, key: `wyp-rynek:${date}`, category: 'transfers', from: 'Rynek transferowy', priority: 'info', subject: `Wypożyczenia tygodnia (${moves.length})`, body: moves.slice(0, 14).map((x) => `${x.name} (${x.pos}): ${name(x.from)} -> ${name(x.to)}, ${fmtDate(x.until)}`).join('\n') }));
    }
    return { messages };
  },
});

// ------------------------------------------------------------ Decyzje z poczty
const reply = (game, text) => [msg(game.date, { subject: 'Wypożyczenie', body: text })];
registerDecision('loanOffers', (game, m, action) => (action === 'reject' ? reply(game, rejectLoanOffers(game, m.refs.ids ?? [m.refs.offerId]).text) : reply(game, acceptLoanOffer(game, action).text)));
registerDecision('loanOption', (game, m, action) => (action === 'buy' ? reply(game, exerciseOption(game, m.refs.playerId).text) : []));
registerDecision('loanBreach', (game, m, action) => (action === 'end' ? reply(game, terminateLoan(game, m.refs.playerId).text) : []));
registerDecision('loanRofr', (game, m, action) => {
  if (action === 'match') return reply(game, matchFirstRefusal(game, m.refs.offerId).text);
  const o = game.market.offers.find((x) => x.id === m.refs.offerId);
  if (!o || o.status !== 'open') return [];
  const t = passFirstRefusal(game, o, game.date);
  return t ? reply(game, t) : [];
});
