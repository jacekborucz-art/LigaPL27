// Transfer jako proces (docs/transfery.md, rozdz. 1): porozumienie klubów, warunki osobiste, testy medyczne,
// certyfikat ITC i podróż (tylko zagranica), ogłoszenie, zgłoszenie. Do zgłoszenia zawodnik zostaje w starym klubie
// na starej pensji; od testów medycznych nie gra (p.transfer.hold). Ostatnim krokiem jest completeTransfer
// (src/career/transfers.js) albo completeAbroad (sprzedaż za granicę).
// Czasy etapów losowane raz przy założeniu transakcji z ziarna Rng(`deal:${seed}:${id}`), więc są takie same
// po zapisie i wczytaniu. Wszystkie liczby [SZAC], kalibracja: tools/transfery-kalibracja.mjs.

import { Rng, clamp } from '../core/rng.js';
import { createMessage } from '../core/inbox.js';
import { addDays } from '../core/gameLoop.js';
import { clubById } from '../data/clubs_pl.js';
import { DOMESTIC, SEASON } from '../config/calendar2026.js';
import { clubReputation } from './reputation.js';
import { personalityOf } from './personality.js';
import { aiNegotiate } from './negotiation.js';
import { book, wageRoom } from './finance.js';
import { boardCaps } from './boardRequests.js';
import { spellsOf, syncSpell } from '../season/history.js';
import { completeTransfer, addFreeAgents, fmtZl } from './transfers.js';
import { playerStage, moveRepEvent } from './reputationSystem.js'; // transfer do większej sceny (docs/reputacja.md)
import { spendable } from './finance.js';
import { marketValue } from '../world/playerGen.js';
import { squadCount } from './squadLimit.js';
import { CO, upfrontOf, offerReserve, paySellOn } from './clubOffers.js'; // pakiet oferty klub-klub, porozumienie z datą rejestracji
import { fmtDate } from '../ui/dom.js';

export const DEAL_STAGES = ['agreed', 'terms', 'medical', 'travel', 'announce', 'registered'];
export const STAGE_LABELS = {
  agreed: 'Porozumienie klubów', terms: 'Warunki osobiste', medical: 'Testy medyczne',
  travel: 'Certyfikat ITC i podróż', announce: 'Ogłoszenie', registered: 'Zgłoszony',
};
export const FAIL_LABELS = {
  terms: 'brak porozumienia z zawodnikiem', medical: 'testy medyczne', deadline: 'koniec okna transferowego',
  withdrawn: 'jedna ze stron wycofała się', seller: 'klub sprzedający wycofał się',
  injury: 'kontuzja przed rejestracją', mind: 'zawodnik zmienił zdanie', money: 'brak pieniędzy', limit: 'limit kadry',
  ban: 'zakaz transferowy',
};
// Czasy etapów w dniach [min, max]. Transfer krajowy 2-4 dni, zagraniczny 5-9, wolny zawodnik 1-4, AI-AI 1-3.
export const DEAL_DAYS = {
  domestic: { terms: [1, 2], medical: [1, 1], travel: [0, 0], announce: [0, 1] },
  foreign: { terms: [2, 4], medical: [1, 1], travel: [1, 3], announce: [1, 1] },
  free: { terms: [0, 2], medical: [1, 1], travel: [0, 0], announce: [0, 1] },
  ai: { terms: [0, 1], medical: [1, 1], travel: [0, 0], announce: [0, 1] },
};
export const DEADLINE_FAIL = { domestic: 0.05, foreign: 0.12 };
export const MEDICAL = { base: 0.01, perOdp: 0.004, injured: 0.2, veteran: 0.01, renegotiate: 0.5, feeCut: 0.15, injuredWithdraw: 0.7, injuredDays: 28 };

const round = (x, step = 5000) => Math.round(x / step) * step;
const STAGE_I = Object.fromEntries(DEAL_STAGES.map((s, i) => [s, i]));
const windowOn = (date) => (DOMESTIC.transferWindows ?? []).find((w) => date >= w.from && date <= w.to) ?? null;

// ------------------------------------------------------------ Stan
export function ensureDeals(game) {
  const M = game.market;
  if (!M) return [];
  if (!Array.isArray(M.deals)) M.deals = [];
  if (!M.dealSeq) M.dealSeq = 0;
  return M.deals;
}
export const openDeals = (game) => (game.market?.deals ?? []).filter((d) => !d.end);
export const dealOf = (game, pid) => (game.market?.deals ?? []).find((d) => d.pid === pid && !d.end) ?? null;
export const hasOpenDeal = (game, pid) => !!dealOf(game, pid);
/**
 * Odstępne w otwartych transakcjach i w propozycjach w toku (namysł zawodnika, src/career/proposals.js),
 * w których klub kupuje: zarezerwowane w budżecie.
 */
export const pendingFees = (game, clubId) => openDeals(game).filter((d) => d.to === clubId).reduce((s, d) => s + cashOf(d), 0)
  + (game.market?.pending ?? []).filter((x) => x.to === clubId && (x.status === 'open' || x.status === 'changes')).reduce((s, x) => s + cashOf(x), 0)
  + offerReserve(game, clubId); // oferty gracza u klubów (clubOffers.js)
/** Gotówka płatna przy rejestracji: pierwsza rata pakietu (clubOffers.js) albo całe odstępne. */
export const cashOf = (x) => (x?.pkg ? upfrontOf({ ...x.pkg, fee: x.fee || 0 }) : x?.fee || 0);
/** Liczba zawodników w drodze do klubu (liczą się do limitu kadry). */
export const pendingIn = (game, clubId) => openDeals(game).filter((d) => d.to === clubId).length;

/** Statystyki sezonu do kalibracji (game.market.tstats[SEASON]). */
export function stat(game, key, n = 1) {
  const M = game.market; if (!M) return;
  M.tstats ??= {};
  const s = (M.tstats[SEASON] ??= {});
  s[key] = (s[key] ?? 0) + n;
}

const clubName = (id) => clubById(id)?.name ?? 'klub';
export const buyerName = (d) => (d.foreign ? d.foreign.name : d.to ? clubName(d.to) : 'klub');
/** Klub sprzedający: polski albo zagraniczny (d.origin, pula foreignPool.js). */
export const sellerName = (d) => (d.origin ? d.origin.name : d.from ? clubName(d.from) : 'wolny zawodnik');
const repOf = (id) => (clubById(id) ? clubReputation(clubById(id)) : 35);
const isUserDeal = (game, d) => d.to === game.clubId || d.from === game.clubId;

// ------------------------------------------------------------ Plan
function draw(rng, [a, b]) { return a === b ? a : rng.int(a, b); }

/** Plan etapów: { terms, medical, travel, announce } w dniach. */
export function planDays(type, rng) {
  const D = DEAL_DAYS[type] ?? DEAL_DAYS.domestic;
  return { terms: draw(rng, D.terms), medical: draw(rng, D.medical), travel: draw(rng, D.travel), announce: draw(rng, D.announce) };
}

/** Data zakończenia etapu (dni od początku etapu). */
function dueFor(d, stage, from) { return addDays(from, d.plan[stage] ?? 0); }

/** Spodziewana data zgłoszenia przy obecnym etapie. */
export function expectedRegistration(d) {
  if (d.end) return d.end.date;
  let date = d.due;
  for (let i = STAGE_I[d.stage] + 1; i < STAGE_I.registered; i++) date = addDays(date, d.plan[DEAL_STAGES[i]] ?? 0);
  return date;
}

/** Etapy, przez które przechodzi transakcja (bez podróży dla transferów krajowych). */
export function dealStages(d) { return DEAL_STAGES.filter((s) => s !== 'travel' || d.foreign || d.origin); }

// ------------------------------------------------------------ Założenie transakcji
/**
 * Zakłada transakcję. opts: { playerId, to (id klubu albo null przy sprzedaży za granicę), fee, contract,
 * kind: 'transfer'|'free'|'abroad', foreign: { country, name, clubId?, rep, wage }|null, stage: 'terms'|'medical',
 * needsTerms (kupiec AI negocjuje kontrakt na końcu etapu warunków), date, early (wcześniejszy transfer prekontraktu),
 * prop (id propozycji, po której zawodnik się zgodził: src/career/proposals.js) }.
 * Zwraca transakcję albo null (zawodnik ma już otwartą transakcję).
 */
export function startDeal(game, opts) {
  ensureDeals(game);
  const { playerId, to = null, fee = 0, contract = null, kind = 'transfer', foreign = null, needsTerms = false, early = false, prop = null, pkg = null, regDate = null } = opts;
  const date = opts.date ?? game.date;
  const p = game.world.players[playerId];
  if (!p || hasOpenDeal(game, playerId)) return null;
  const M = game.market;
  const id = `d${++M.dealSeq}-${playerId}`;
  const user = to === game.clubId || p.clubId === game.clubId;
  // Kupno z klubu zagranicznego (pula src/career/foreignPool.js): etap certyfikatu ITC i podróży jak przy sprzedaży za granicę
  const origin = opts.origin ?? (!p.clubId && kind !== 'free' && p.foreignPool && p.abroad && p.contract
    ? { country: p.abroad.country, countryName: p.abroad.countryName ?? p.abroad.country, name: p.abroad.club, clubId: p.abroad.clubId ?? null } : null);
  const type = foreign || origin ? 'foreign' : kind === 'free' ? 'free' : user ? 'domestic' : 'ai';
  const plan = planDays(type, new Rng(`deal:${game.seed}:${id}`));
  // Porozumienie z datą rejestracji (oferta klub-klub poza oknem albo od następnego sezonu, clubOffers.js): etap
  // „Porozumienie klubów” do dnia rejestracji; pieniądze i miejsce w kadrze zarezerwowane, zawodnik gra w starym klubie
  const deferred = !!regDate && regDate > date;
  const d = {
    id, pid: playerId, name: p.name, pos: p.pos, from: p.clubId ?? null, to, fee, contract, kind, foreign, origin, type, needsTerms, early,
    start: date, stage: deferred ? 'agreed' : opts.stage ?? 'terms', due: null, plan, renegotiated: false, end: null, windowTo: kind === 'free' || deferred ? null : windowOn(date)?.to ?? null,
    ...(prop ? { prop } : {}), // po propozycji i namyśle zawodnika (src/career/proposals.js)
    ...(pkg ? { pkg } : {}), // pakiet: raty, premie, procent od sprzedaży (clubOffers.js)
    ...(deferred ? { deferred: { regDate, v0: marketValue(p, { tier: clubById(p.clubId)?.tier ?? 1, date }) } } : {}),
  };
  // Kupiec AI z małą liczbą dni do końca okna: etapy skrócone, żeby zdążyć (zgłoszenie najpóźniej w ostatnim dniu)
  if (type === 'ai' && d.windowTo) {
    let over = Math.max(0, Math.round((Date.parse(addDays(date, plan.terms + plan.medical + plan.announce)) - Date.parse(d.windowTo)) / 86400000));
    for (const k of ['terms', 'announce', 'medical']) { const cut = Math.min(over, plan[k]); plan[k] -= cut; over -= cut; }
  }
  d.due = deferred ? regDate : dueFor(d, d.stage, date);
  M.deals.push(d);
  p.transfer = { deal: id, hold: STAGE_I[d.stage] >= STAGE_I.medical };
  stat(game, 'deals');
  // Zawodnik cieszy się z przejścia do wyraźnie większego klubu
  const toRep = foreign ? foreign.repU ?? foreign.rep + 25 : repOf(to);
  if (d.from && toRep >= repOf(d.from) + 10) p.morale = clamp((p.morale ?? 12) + 1, 1, 20);
  if (user && d.stage === 'terms') d.msgs = [agreedMessage(game, d, date)];
  return d;
}

// ------------------------------------------------------------ Wiadomości (tylko transakcje gracza)
const dealMsg = (date, d, key, subject, body, priority = 'info') => createMessage({ date, key: `deal:${d.id}:${key}`, category: 'transfers', from: 'Dyrektor sportowy', priority, subject, body, refs: { kind: 'deal', dealId: d.id, pid: d.pid } });

function agreedMessage(game, d, date) {
  const selling = d.from === game.clubId;
  const other = selling ? buyerName(d) : sellerName(d);
  return dealMsg(date, d, 'agreed', `Porozumienie z ${other} w sprawie ${d.name}`,
    `${selling ? `${other} kupuje ${d.name}` : `Kupujemy ${d.name} z ${other}`}${d.fee ? ` za ${fmtZl(d.fee)}` : ''}. Teraz warunki osobiste i testy medyczne. Spodziewane zgłoszenie: ${fmtDate(expectedRegistration(d))}.${selling ? ' Do zgłoszenia zawodnik zostaje u nas, od testów medycznych nie gra.' : ''}`);
}

// ------------------------------------------------------------ Przebieg
function setStage(game, d, stage, date) {
  d.stage = stage;
  d.due = dueFor(d, stage, date);
  const p = game.world.players[d.pid];
  if (p?.transfer) p.transfer.hold = STAGE_I[stage] >= STAGE_I.medical;
}

function closeDeal(game, d, result, reason, date, out) {
  d.end = { result, reason: reason ?? null, date };
  const p = game.world.players[d.pid];
  if (p && p.transfer?.deal === d.id) delete p.transfer;
  if (result === 'failed') {
    stat(game, 'failed');
    stat(game, `failed_${reason}`);
    if (isUserDeal(game, d)) out.push(dealMsg(date, d, 'failed', `Transfer ${d.name} upadł (${FAIL_LABELS[reason] ?? reason})`, failText(game, d, reason), 'important'));
  }
}

function failText(game, d, reason) {
  const other = d.from === game.clubId ? buyerName(d) : sellerName(d);
  const t = {
    terms: `${d.name} nie dogadał się z ${buyerName(d)} co do kontraktu.`,
    medical: `${d.name} nie przeszedł testów medycznych w ${buyerName(d)}.`,
    deadline: `Okno transferowe się zamknęło, zanim transakcja z ${other} dotarła do testów medycznych.`,
    withdrawn: `${other} wycofał się z transakcji.`,
    seller: `${sellerName(d)} wstrzymał transfer.`,
    injury: `${d.name} doznał poważnej kontuzji przed rejestracją, a ${sellerName(d)} nie zgodził się obniżyć kwoty. ${buyerName(d)} wycofał się bez kosztów.`,
    mind: `${d.name} zmienił zdanie przed rejestracją i zostaje w ${sellerName(d)}.`,
    money: `${buyerName(d)} nie miał w dniu rejestracji pieniędzy na pierwszą ratę, także po tygodniu odroczenia.`,
    limit: `W dniu rejestracji kadra ${buyerName(d)} była pełna (limit kadry).`,
    ban: `${buyerName(d)} ma zakaz transferowy za zaległości wobec zawodników i nie może zgłosić nowego zawodnika.`,
  }[reason] ?? 'Transakcja nie doszła do skutku.';
  return `${t} ${d.from === game.clubId ? 'Zawodnik zostaje w klubie.' : 'Zawodnik zostaje w swoim klubie.'}`;
}

/** Kupiec AI negocjuje kontrakt na końcu etapu warunków osobistych. Zwraca true przy porozumieniu. */
function settleTerms(game, d, date) {
  const p = game.world.players[d.pid];
  if (d.foreign) {
    // Oferta z zagranicy: wyższa pensja, decyduje charakter zawodnika
    const t = personalityOf(p).traits;
    const pAccept = clamp(0.75 + 0.05 * (t.ambition - 10) - 0.05 * (t.homeTies - 10) + (p.age >= 30 ? 0.1 : 0) + (p.transferRequest ? 0.2 : 0), 0.2, 0.98);
    return new Rng(`deal:${game.seed}:${d.id}:terms`).chance(pAccept);
  }
  const buyer = clubById(d.to);
  if (!buyer) return false;
  const caps = boardCaps(game, d.to, p, 'sign');
  const wage = p.contract?.wage ?? 0;
  const neg = aiNegotiate({ kind: 'sign', player: p, club: buyer, fromClub: clubById(d.from), date, rng: new Rng(`deal:${game.seed}:${d.id}:terms`), budget: { wage: Math.min(caps.wage, Math.max(wage * 1.6, wageRoom(game.finance, game.world, d.to) + wage)), maxYears: caps.years, total: caps.total } });
  if (neg.result !== 'signed') return false;
  d.contract = neg.contract;
  return true;
}

/** Testy medyczne: zwraca 'ok' | 'renegotiate' | 'fail' | 'withdraw'. */
export function medicalOutcome(game, d) {
  const p = game.world.players[d.pid];
  const rng = new Rng(`deal:${game.seed}:${d.id}:medical`);
  const buyerAi = d.to !== game.clubId;
  if (buyerAi && (p.injuryDays ?? 0) > MEDICAL.injuredDays && rng.chance(MEDICAL.injuredWithdraw)) return 'withdraw';
  const odp = p.hidden?.ODP ?? 10;
  const pFail = MEDICAL.base + MEDICAL.perOdp * Math.max(0, 10 - odp) + ((p.injuryDays ?? 0) > 0 ? MEDICAL.injured : 0) + (p.age >= 31 ? MEDICAL.veteran : 0);
  if (!rng.chance(pFail)) return 'ok';
  return rng.chance(MEDICAL.renegotiate) ? 'renegotiate' : 'fail';
}

/** Zgłoszenie: zawodnik przechodzi do nowego klubu (albo wyjeżdża za granicę). */
function register(game, d, date, out, lastMinute = false) {
  const p = game.world.players[d.pid];
  const S0 = p ? playerStage(game, p) : 0;
  if (d.foreign) completeAbroad(game, d, date);
  else {
    const e = completeTransfer(game, { playerId: d.pid, to: d.to, fee: d.fee, contract: d.contract, kind: d.kind === 'free' ? 'free' : 'transfer', date, fromName: d.origin?.name ?? null, pkg: d.pkg ?? null });
    if (d.early) e.early = true;
  }
  if (lastMinute) d.lastMinute = true;
  if (p && d.from) moveRepEvent(game, p, S0); // tylko zmiana klubu (wolny zawodnik nie ma sceny do porównania)
  closeDeal(game, d, 'registered', null, date, out);
  if (d.foreign) {
    stat(game, 'abroad'); if (clubById(d.from)?.tier === 1) stat(game, 'abroadEk'); if (d.from === game.clubId) stat(game, 'abroadUser');
    // Pieniądze ze sprzedaży wracają na rynek: co druga sprzedaż to jeden zawodnik z zagranicy (poziom Ekstraklasy) w wolnych
    if (new Rng(`deal:${game.seed}:${d.id}:import`).chance(0.5)) addFreeAgents(game, 1, date, `zast-${d.id}`, { imports: true });
  }
  if (isUserDeal(game, d)) {
    const into = d.to === game.clubId;
    out.push(dealMsg(date, d, 'registered', `Oficjalnie: ${p.name} zawodnikiem klubu ${into ? clubName(d.to) : buyerName(d)}`,
      `${lastMinute ? 'Zgłoszony w ostatniej chwili. ' : ''}${into ? `${p.name} jest zgłoszony do rozgrywek i może grać od najbliższego meczu.` : `${p.name} odchodzi${d.fee ? ` za ${fmtZl(d.fee)}` : ''}. Pieniądze są już na koncie klubu.`}`, 'important'));
  }
}

/** Sprzedaż za granicę: zawodnik opuszcza polski rynek, zostaje w świecie gry (historia). */
export function completeAbroad(game, d, date = game.date) {
  const W = game.world; const p = W.players[d.pid];
  const from = p.clubId;
  spellsOf(p);
  if (from && W.clubs[from]) W.clubs[from].squad = W.clubs[from].squad.filter((id) => id !== p.id);
  const M = game.market;
  delete M.listed[p.id]; delete M.userListed[p.id]; delete M.talks[p.id];
  const F = game.finance;
  paySellOn(game, p, { from, fee: d.fee, date }); // procent od sprzedaży dla poprzedniego sprzedawcy (clubOffers.js)
  if (d.fee && F.clubs[from]) { book(F, from, date, 'in', 'sales', d.fee, `${p.name} do ${d.foreign.name}`); F.clubs[from].transferBudget += Math.round(d.fee * 0.5); }
  p.clubId = null; p.contract = null; p.wage = 0; p.free = false; p.squad = null; p.lastMove = date;
  p.abroad = { country: d.foreign.country, club: d.foreign.name, clubId: d.foreign.clubId ?? null, since: date };
  syncSpell(p, date);
  delete p.transferRequest; delete p.moveWish; delete p.preContract; delete p.transfer; p.unhappy = false; p.renewRefused = false;
  const entry = { date, playerId: p.id, name: p.name, pos: p.pos, from, to: d.foreign.clubId ?? null, toName: d.foreign.name, country: d.foreign.country, fee: d.fee, kind: 'abroad' };
  M.history.unshift(entry);
  p.career = [...(p.career ?? []), { date, from, to: d.foreign.clubId ?? null, fee: d.fee, kind: 'abroad', toName: d.foreign.name }];
  return entry;
}

/** Przejście etapu. */
function advance(game, d, date, out) {
  const p = game.world.players[d.pid];
  const user = isUserDeal(game, d);
  switch (d.stage) {
    case 'agreed': {
      if (!d.deferred) { setStage(game, d, 'terms', d.due); return; }
      // Dzień rejestracji porozumienia z datą: sprawdzenia przed rejestracją, potem testy medyczne i zgłoszenie w oknie
      if (preRegistration(game, d, date, out) !== 'ok') return;
      d.windowTo = windowOn(date)?.to ?? null;
      setStage(game, d, 'medical', date);
      return;
    }
    case 'terms': {
      if (d.needsTerms && !settleTerms(game, d, date)) return closeDeal(game, d, 'failed', 'terms', date, out);
      setStage(game, d, 'medical', d.due);
      return;
    }
    case 'medical': {
      const r = medicalOutcome(game, d);
      if (r === 'withdraw') return closeDeal(game, d, 'failed', 'withdrawn', date, out);
      if (r === 'fail') return closeDeal(game, d, 'failed', 'medical', date, out);
      if (r === 'renegotiate') { d.fee = round(d.fee * (1 - MEDICAL.feeCut)); d.renegotiated = true; }
      if (user) out.push(dealMsg(date, d, 'medical', `${p.name} przeszedł testy medyczne`, r === 'renegotiate'
        ? `Testy wykazały drobny problem zdrowotny. ${buyerName(d)} obniżył kwotę o ${Math.round(MEDICAL.feeCut * 100)} %: teraz ${fmtZl(d.fee)}. Transakcja idzie dalej.`
        : `${p.name} przeszedł testy medyczne w ${buyerName(d)}. Spodziewane zgłoszenie: ${fmtDate(expectedRegistration({ ...d, stage: d.foreign || d.origin ? 'travel' : 'announce', due: addDays(d.due, d.plan[d.foreign || d.origin ? 'travel' : 'announce']) }))}.`));
      setStage(game, d, d.foreign || d.origin ? 'travel' : 'announce', d.due);
      return;
    }
    case 'travel':
      if (user) out.push(dealMsg(date, d, 'travel', `${p.name} jest już w mieście`, `${p.name} dotarł do ${buyerName(d)}. Federacja wydała certyfikat ITC, został tylko podpis i ogłoszenie.`));
      setStage(game, d, 'announce', d.due);
      return;
    case 'announce':
      register(game, d, date, out);
      return;
    default:
  }
}

/**
 * Porozumienie z datą rejestracji, dzień rejestracji (clubOffers.js CO.pre): limit kadry, kontuzja od 6 tygodni
 * (obniżka 15 % + 10 % za miesiąc, najwyżej 50 %, sprzedawca zgadza się w 50 %, inaczej kupujący wycofuje się), zmiana
 * wartości o ponad 25 % (raz: wzrost, sprzedawca żąda więcej w 35 %; spadek, kupujący prosi o obniżkę w 60 %), zawodnik
 * zmienia zdanie (5 %, przy ponad 60 dniach czekania 8 %), brak pieniędzy (odroczenie o 7 dni, potem upadek).
 * Zwraca 'ok' | 'wait' | 'fail'.
 */
function preRegistration(game, d, date, out) {
  const P = CO.pre; const D = d.deferred;
  const p = game.world.players[d.pid];
  const user = isUserDeal(game, d);
  const note = (key, subject, body) => { if (user) out.push(dealMsg(date, d, key, subject, body)); };
  const fail = (why) => { closeDeal(game, d, 'failed', why, date, out); stat(game, `coPre_${why}`); return 'fail'; };
  if (d.to) { const sc = squadCount(game, d.to); if (sc.counted > sc.hard) return fail('limit'); }
  if (!D.checked) {
    D.checked = true;
    const rng = new Rng(`deal:${game.seed}:${d.id}:przed-rejestracja`);
    const inj = p.injuryDays ?? 0;
    if (inj >= P.injuryDays) {
      const cut = Math.min(P.maxCut, P.cut + P.perMonth * Math.floor((inj - P.injuryDays) / 30));
      if (!rng.chance(P.sellerOk)) return fail('injury');
      d.fee = round(d.fee * (1 - cut)); d.renegotiated = true;
      note('pre-injury', `${d.name}: kwota obniżona po kontuzji`, `${d.name} ma poważną kontuzję (ok. ${Math.round(inj)} dni przerwy). ${sellerName(d)} zgodził się obniżyć kwotę o ${Math.round(cut * 100)} %: teraz ${fmtZl(d.fee)}.`);
    }
    const ratio = marketValue(p, { tier: clubById(d.from)?.tier ?? 1, date }) / Math.max(1, D.v0);
    if (Math.abs(ratio - 1) > P.valueJump) {
      if (ratio > 1 && rng.chance(P.sellerReopen)) {
        const fee = round(d.fee * (1 + (ratio - 1) / 2));
        if (d.to && spendable(game.finance, d.to) - (pendingFees(game, d.to) - cashOf(d)) < cashOf({ ...d, fee })) return fail('seller');
        note('pre-value', `${sellerName(d)} żąda więcej za ${d.name}`, `Wartość zawodnika wyraźnie wzrosła od porozumienia. ${sellerName(d)} otworzył rozmowy i dostanie ${fmtZl(fee)} zamiast ${fmtZl(d.fee)}.`);
        d.fee = fee;
      } else if (ratio < 1 && rng.chance(P.buyerReopen)) {
        const fee = round(d.fee * (1 - (1 - ratio) / 2));
        note('pre-value', `Niższa kwota za ${d.name}`, `Wartość zawodnika wyraźnie spadła od porozumienia. ${buyerName(d)} wynegocjował ${fmtZl(fee)} zamiast ${fmtZl(d.fee)}.`);
        d.fee = fee;
      }
    }
    const long = (Date.parse(date) - Date.parse(d.start)) / 864e5 > P.longDays;
    if (rng.chance(long ? P.mindLong : P.mind)) return fail('mind');
  }
  const cash = cashOf(d);
  if (d.to && spendable(game.finance, d.to) - (pendingFees(game, d.to) - cash) < cash) {
    if (D.moneyWait) return fail('money');
    D.moneyWait = true;
    d.due = addDays(date, P.moneyDays);
    note('pre-money', `Rejestracja ${d.name} odroczona`, `Brakuje pieniędzy na kwotę płatną przy transferze (${fmtZl(cash)}). Rejestracja odroczona o ${P.moneyDays} dni, potem transfer upadnie.`);
    return 'wait';
  }
  return 'ok';
}

/** Czy transakcja jest wciąż możliwa (zawodnik na miejscu, klub istnieje). */
function stillValid(game, d) {
  const p = game.world.players[d.pid];
  if (!p) return false;
  if ((p.clubId ?? null) !== d.from) return false;
  if (d.to && !game.world.clubs[d.to]) return false;
  return true;
}

/** Dzień transakcji: etapy, koniec okna. Zwraca wiadomości dla gracza. */
export function dealsDay(game, date) {
  ensureDeals(game);
  const out = [];
  for (const d of game.market.deals) {
    if (d.end) continue;
    if (d.msgs) { out.push(...d.msgs); delete d.msgs; }
    if (!stillValid(game, d)) { closeDeal(game, d, 'failed', 'withdrawn', date, out); continue; }
    if (d.to && game.debt?.clubs?.[d.to]?.ban) { closeDeal(game, d, 'failed', 'ban', date, out); continue; } // zakaz transferowy (arrears.js)
    let guard = 0;
    while (!d.end && d.due <= date && guard++ < 8) advance(game, d, date, out);
    if (d.end || !d.windowTo || date < d.windowTo) continue;
    // Ostatni dzień okna (albo transakcja zaczęta po przetworzeniu ostatniego dnia)
    if (STAGE_I[d.stage] < STAGE_I.medical) { closeDeal(game, d, 'failed', 'deadline', date, out); continue; }
    const pFail = d.foreign || d.origin ? DEADLINE_FAIL.foreign : DEADLINE_FAIL.domestic;
    if (new Rng(`deal:${game.seed}:${d.id}:deadline`).chance(pFail)) closeDeal(game, d, 'failed', 'deadline', date, out);
    else register(game, d, date, out, true);
  }
  // Zakończone transakcje trzymamy 60 dni (zakładka W toku pokazuje ostatnie wyniki)
  game.market.deals = game.market.deals.filter((d) => !d.end || d.end.date >= addDays(date, -60));
  return out;
}

/**
 * Gracz wycofuje się z transakcji. Jako sprzedający: zawodnik rozczarowany (morale -2, szansa na niezadowolenie).
 * Zwraca { ok, text }.
 */
export function cancelDeal(game, dealId, date = game.date) {
  const d = (game.market.deals ?? []).find((x) => x.id === dealId && !x.end);
  if (!d) return { ok: false, text: 'Transakcja jest już zamknięta.' };
  if (!isUserDeal(game, d)) return { ok: false, text: 'To nie jest transakcja twojego klubu.' };
  if (d.stage === 'announce') return { ok: false, text: 'Za późno: transfer jest już ogłaszany.' };
  const p = game.world.players[d.pid];
  const out = [];
  const seller = d.from === game.clubId;
  closeDeal(game, d, 'failed', seller ? 'seller' : 'withdrawn', date, out);
  let extra = '';
  if (seller && p) {
    p.morale = clamp((p.morale ?? 12) - 2, 1, 20);
    const t = personalityOf(p).traits;
    if (new Rng(`deal:${game.seed}:${d.id}:seller`).chance(clamp(0.3 + 0.03 * (t.ambition - 10), 0, 1))) { p.unhappy = true; extra = ' Zawodnik jest niezadowolony.'; }
    else extra = ' Zawodnik jest rozczarowany.';
  }
  return { ok: true, text: `Wycofano się z transakcji: ${d.name}.${extra}` };
}

export { STAGE_I };
