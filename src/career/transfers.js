// Rynek transferowy (etap 9, poziom średni, PLAN 2.5): listy (transferowa, do wypożyczenia, wolni,
// wyszukiwarka), oferty gracza dla klubów AI i odpowiedzi klubów, oferty klubów AI za zawodników gracza,
// transfery między klubami AI, wolni zawodnicy, rozwiązanie kontraktu, przedłużenia AI.
// Kontrakt z zawodnikiem negocjuje ekran rozmów (src/ui/negotiationView.js) albo aiNegotiate.

import { Rng, clamp } from '../core/rng.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { DOMESTIC, SEASON_END, SEASON_YEAR } from '../config/calendar2026.js';
import { genPlayer, marketValue } from '../world/playerGen.js';
import { SQUAD_LAYOUT, squadOf, academyOf } from '../world/worldGen.js';
import { pickNationality } from '../data/names.js';
import { GROUP, SQUAD_TARGETS, SQUAD_SIZE, transferListCandidates, squadDeficits } from './squad.js';
import { askingPriceMultiplier, willingnessToJoin, clubReputation } from './reputation.js';
import { aiNegotiate, marketWage } from './negotiation.js';
import { payLevel } from '../data/finanse_klubow.js';
import { book, spendable, wageRoom, wageBill } from './finance.js';

export { SEASON_END };
const round = (x, step = 5000) => Math.round(x / step) * step;
const groupOf = (p) => GROUP[p.pos] ?? 'MID';
const isAi = (game, clubId) => clubId && clubId !== game.clubId && !!game.world.clubs[clubId];

export function windowOf(date) { return DOMESTIC.transferWindows.find((w) => date >= w.from && date <= w.to) ?? null; }
export const inWindow = (date) => !!windowOf(date);

// ------------------------------------------------------------ Stan rynku
export function createMarket(game) {
  const M = { listed: {}, free: [], offers: [], talks: {}, history: [], userListed: {}, lastRefresh: null };
  game.market = M;
  addFreeAgents(game, 45, game.date ?? '2026-07-01', SEASON_YEAR === 2026 ? 'start' : `lato-${SEASON_YEAR}`);
  return M;
}

/** Wolni zawodnicy: bez klubu, oczekują tylko pensji i premii za podpis. */
export function addFreeAgents(game, n, date, tag, { imports = false } = {}) {
  const rng = new Rng(`wolni:${game.seed}:${tag}`);
  for (let i = 0; i < n; i++) {
    // imports: zawodnicy z zagranicy (koniec kontraktu w innej lidze), poziom czołówki Ekstraklasy [SZAC]
    const tier = imports ? 1 : rng.weighted([1, 2, 3], (t) => [0.25, 0.4, 0.35][t - 1]);
    const L = imports ? 12.3 + rng.gauss(0, 0.8) : { 1: 10.6, 2: 9.4, 3: 8.2 }[tier] + rng.gauss(0, 0.7);
    const [pos, side] = rng.pick(SQUAD_LAYOUT);
    const age = imports ? rng.int(22, 30) : rng.weighted([19, 21, 23, 25, 27, 29, 31, 33, 35], (a) => (a >= 29 ? 1.4 : 1));
    const club = { id: 'wolny', tier, prestige: 2, L };
    let nat = pickNationality(tier, rng);
    if (imports) while (nat === 'POL') nat = pickNationality(1, rng);
    const p = genPlayer(rng, { id: `wolny-${tag}-${i + 1}`, L, pos, age, slotOffset: imports ? -0.3 : -0.4, nat, tier, side: side ?? null, club, date });
    p.clubId = null; p.free = true;
    p.askWage = p.contract.wage; p.contract = null; p.wage = 0;
    game.world.players[p.id] = p;
    game.market.free.push(p.id);
  }
}

// ------------------------------------------------------------ Ceny i dostępność
function clubTier(clubId) { return clubById(clubId)?.tier ?? 1; }

/** Trzech najlepszych w klubie AI nie jest na sprzedaż (chyba że klauzula odstępnego). */
export function notForSale(game, p) {
  if (!isAi(game, p.clubId) || game.market.listed[p.id]) return false;
  const top = squadOf(game.world, p.clubId).sort((a, b) => b.ovr - a.ovr).slice(0, 3).map((x) => x.id);
  return top.includes(p.id);
}

export function askingPrice(game, p) {
  if (!p.clubId) return 0;
  if (p.clubId === game.clubId) return game.market.userListed[p.id] ?? round(p.value * 1.3);
  const listed = game.market.listed[p.id];
  const value = marketValue(p, { tier: clubTier(p.clubId), date: game.date });
  const mul = listed ? (listed.kind === 'release' ? 0.4 : 1.08) : 1.45;
  let price = round(value * mul * askingPriceMultiplier(p.rep ?? 30));
  if (notForSale(game, p) && p.contract?.clause) price = p.contract.clause;
  return price;
}

/** Czy odejście zawodnika zostawiłoby klub poniżej minimum grupy pozycji. */
function breaksMinimum(game, p) {
  const sq = squadOf(game.world, p.clubId);
  const g = groupOf(p);
  return sq.filter((x) => groupOf(x) === g).length - 1 < SQUAD_TARGETS[g].min || sq.length - 1 < SQUAD_SIZE.min;
}

/** Zgoda zawodnika na przejście (strona zawodnika, przed rozmową o kontrakcie). */
export function playerWillingness(game, p, toClubId = game.clubId, offerWage = null) {
  const to = clubById(toClubId) ?? { prestige: 3, tier: 1 };
  const from = p.clubId ? clubById(p.clubId) ?? { prestige: 2, tier: 3 } : { prestige: 2, tier: clubTier(toClubId) + 1 };
  const inEurope = (id) => (game.fixtures ?? []).some((f) => f.comp === 'uefa' && (f.home === id || f.away === id));
  const monthsLeft = p.contract?.until ? Math.max(0, (Number(p.contract.until.slice(0, 4)) - Number(game.date.slice(0, 4))) * 12 + Number(p.contract.until.slice(5, 7)) - Number(game.date.slice(5, 7))) : 0;
  const squad = squadOf(game.world, toClubId);
  const better = squad.filter((x) => groupOf(x) === groupOf(p) && x.ovr > p.ovr).length;
  return willingnessToJoin({
    player: { rep: p.rep ?? 30, age: p.age, persona: p.persona, wage: p.contract?.wage ?? p.askWage ?? marketWage(p.ovr, clubTier(toClubId), false, payLevel(toClubId)), monthsLeft, unhappy: !!p.unhappy },
    from, to, offerWage, toTier: to.tier, fromTier: from.tier ?? 3, toEurope: inEurope(toClubId), fromEurope: p.clubId ? inEurope(p.clubId) : false,
    starter: better < ({ GK: 1, DEF: 4, MID: 4, ATT: 2 })[groupOf(p)],
  });
}

// ------------------------------------------------------------ Oferty gracza dla klubów AI
/**
 * Oferta odstępnego za zawodnika klubu AI. Zwraca { result: 'accept'|'counter'|'reject', price, counter?, text }.
 * Po trzech odrzuceniach klub zrywa rozmowy na 14 dni.
 */
export function offerForPlayer(game, playerId, fee) {
  const p = game.world.players[playerId];
  const date = game.date;
  if (!p || !isAi(game, p.clubId)) return { result: 'reject', text: 'Tego zawodnika nie można kupić.' };
  if (!inWindow(date)) return { result: 'reject', text: 'Okno transferowe jest zamknięte. Transfer możliwy w następnym oknie.' };
  const t = game.market.talks[playerId] ?? { rounds: 0, until: null };
  if (t.until && date < t.until) return { result: 'reject', text: `Klub nie chce rozmawiać do ${t.until}.` };
  if (recentlyMoved(p, date)) return { result: 'reject', text: 'Zawodnik dopiero dołączył do klubu. Klub nie sprzeda go w tym oknie.' };
  if (spendable(game.finance, game.clubId) < fee) return { result: 'reject', text: 'Kwota przekracza budżet transferowy albo saldo klubu.' };
  const seller = clubById(p.clubId);
  if (notForSale(game, p) && !p.contract?.clause) return { result: 'reject', text: `${seller.name}: zawodnik nie jest na sprzedaż.` };
  let price = askingPrice(game, p);
  if (breaksMinimum(game, p)) price = round(price * 1.3);
  t.rounds++; t.date = date;
  game.market.talks[playerId] = t;
  if (fee >= price) { t.accepted = fee; return { result: 'accept', price, text: `${seller.name} przyjmuje ofertę ${fmtZl(fee)}. Możesz rozmawiać z zawodnikiem o kontrakcie.` }; }
  if (t.rounds >= 3) { t.until = addDaysIso(date, 14); t.rounds = 0; return { result: 'reject', text: `${seller.name} kończy rozmowy. Trzy oferty były za niskie. Spróbuj za 2 tygodnie.` }; }
  if (fee >= price * 0.82) { t.counter = price; return { result: 'counter', price, counter: price, text: `${seller.name} chce ${fmtZl(price)}.` }; }
  return { result: 'reject', price, text: `${seller.name} odrzuca ofertę jako zbyt niską.` };
}

// ------------------------------------------------------------ Przeprowadzenie transferu
/**
 * Przenosi zawodnika. kind: 'transfer' | 'free' | 'loan'. contract: { wage, until, ... } (z negocjacji).
 * Księguje odstępne, premię za podpis i prowizję. Zwraca wpis historii.
 */
export function completeTransfer(game, { playerId, to, fee = 0, contract, kind = 'transfer', date = game.date, loanShare = 0 }) {
  const W = game.world; const p = W.players[playerId];
  const from = p.clubId;
  if (from && W.clubs[from]) W.clubs[from].squad = W.clubs[from].squad.filter((id) => id !== playerId);
  if (kind === 'free') game.market.free = game.market.free.filter((id) => id !== playerId);
  W.clubs[to].squad.push(playerId);
  if (kind === 'loan') {
    p.loan = { from, until: SEASON_END, share: loanShare, wage: p.contract.wage };
    p.contract = { ...p.contract, wage: Math.round(p.contract.wage * loanShare / 10000) * 100 };
  } else {
    p.contract = { ...contract, signedOn: date };
    delete p.loan;
  }
  p.clubId = to; p.free = false; p.wage = p.contract.wage; p.squad = 'A'; p.lastMove = date;
  delete p.askWage; delete p.transferRequest; p.unhappy = false; p.renewRefused = false;
  delete game.market.listed[playerId]; delete game.market.userListed[playerId]; delete game.market.talks[playerId];
  const F = game.finance;
  if (fee) { book(F, to, date, 'out', 'transfers', fee, `${p.name} (${clubById(from)?.name ?? 'wolny'})`); book(F, from, date, 'in', 'sales', fee, `${p.name} do ${clubById(to)?.name}`); if (F.clubs[to]) F.clubs[to].transferBudget = Math.max(0, F.clubs[to].transferBudget - fee); if (F.clubs[from]) F.clubs[from].transferBudget += Math.round(fee * 0.5); }
  if (contract?.signOn) book(F, to, date, 'out', 'signOn', contract.signOn);
  if (contract?.agentFee) book(F, to, date, 'out', 'agents', contract.agentFee);
  const entry = { date, playerId, name: p.name, pos: p.pos, from, to, fee, kind };
  game.market.history.unshift(entry);
  p.career = [...(p.career ?? []), { date, from, to, fee, kind }];
  return entry;
}

/** Wypożyczenie do końca sezonu: gracz płaci część pensji (50-100 %). Klub zgadza się na młodych z małą liczbą minut. */
export function loanIn(game, playerId, share) {
  const p = game.world.players[playerId];
  if (!p || !isAi(game, p.clubId)) return { ok: false, text: 'Tego zawodnika nie można wypożyczyć.' };
  if (!inWindow(game.date)) return { ok: false, text: 'Okno transferowe jest zamknięte.' };
  const listed = game.market.listed[playerId]?.kind === 'loan';
  if (!listed && (p.age > 21 || notForSale(game, p))) return { ok: false, text: `${clubById(p.clubId).name} nie wypożycza tego zawodnika.` };
  if (share < (listed ? 50 : 75)) return { ok: false, text: `${clubById(p.clubId).name} chce, żebyś płacił co najmniej ${listed ? 50 : 75} % pensji.` };
  if (Math.round(p.contract.wage * share / 100) > wageRoom(game.finance, game.world, game.clubId)) return { ok: false, text: 'Brakuje miejsca w budżecie płac.' };
  if (playerWillingness(game, p).verdict === 'odmowa') return { ok: false, text: `${p.name} nie chce przejść na wypożyczenie do twojego klubu.` };
  completeTransfer(game, { playerId, to: game.clubId, kind: 'loan', loanShare: share });
  return { ok: true, text: `${p.name} dołącza na wypożyczenie do końca sezonu. Płacisz ${share} % pensji.` };
}

/** Rozwiązanie kontraktu za porozumieniem: połowa pozostałej pensji. Zawodnik trafia do wolnych. */
export function releaseCost(game, p) {
  const weeks = Math.max(0, (new Date(p.contract.until) - new Date(game.date)) / (7 * 86400000));
  return Math.round(weeks * p.contract.wage * 0.5 / 1000) * 1000;
}
export function releasePlayer(game, playerId) {
  const p = game.world.players[playerId];
  const cost = releaseCost(game, p);
  book(game.finance, p.clubId, game.date, 'out', 'release', cost, `${p.name}: rozwiązanie kontraktu`);
  game.world.clubs[p.clubId].squad = game.world.clubs[p.clubId].squad.filter((id) => id !== playerId);
  game.market.history.unshift({ date: game.date, playerId, name: p.name, pos: p.pos, from: p.clubId, to: null, fee: 0, kind: 'release' });
  p.askWage = p.contract.wage; p.contract = null; p.wage = 0; p.clubId = null; p.free = true;
  delete game.market.listed[playerId]; delete game.market.userListed[playerId];
  game.market.free.push(playerId);
  return cost;
}

// ------------------------------------------------------------ Listy dla gracza
export function marketLists(game) {
  const W = game.world;
  const listed = Object.entries(game.market.listed).map(([id, l]) => ({ p: W.players[id], ...l })).filter((x) => x.p && x.p.clubId && x.p.clubId !== game.clubId);
  return {
    transfer: listed.filter((x) => x.kind !== 'loan'),
    loan: listed.filter((x) => x.kind === 'loan'),
    free: game.market.free.map((id) => W.players[id]).filter(Boolean).map((p) => ({ p, kind: 'free', reasons: ['Wolny zawodnik'] })),
  };
}

export function searchPlayers(game, { pos = 'all', maxPrice = Infinity, maxAge = 99, minOvr = 0, tier = 'all', text = '' } = {}, limit = 60) {
  const out = [];
  const q = text.trim().toLowerCase();
  for (const c of CLUBS_PL) {
    if (c.id === game.clubId || !game.world.clubs[c.id] || (tier !== 'all' && c.tier !== Number(tier))) continue;
    for (const p of squadOf(game.world, c.id)) {
      if (pos !== 'all' && groupOf(p) !== pos) continue;
      if (p.age > maxAge || p.ovr < minOvr || (q && !p.name.toLowerCase().includes(q))) continue;
      const price = askingPrice(game, p);
      if (price > maxPrice) continue;
      out.push({ p, price, nfs: notForSale(game, p) && !p.contract?.clause });
    }
  }
  return out.sort((a, b) => b.p.ovr - a.p.ovr).slice(0, limit);
}

// ------------------------------------------------------------ Klub AI: tydzień w oknie
function playerView(p, date) {
  return { ...p, contractUntil: p.contract?.until, wage: p.contract?.wage ?? 0, minutesShare: (p.season?.min ?? 0) / Math.max(90, (p.season?.apps ?? 0) * 90 + 900) };
}

/** Wystawienia klubów AI (sprzedaż, wypożyczenie, zwolnienie). */
export function refreshListings(game, date) {
  const M = game.market;
  for (const id of Object.keys(M.listed)) { const p = game.world.players[id]; if (!p?.clubId || p.clubId === game.clubId) delete M.listed[id]; }
  for (const c of CLUBS_PL) {
    if (c.id === game.clubId || !game.world.clubs[c.id]) continue;
    const squad = squadOf(game.world, c.id).map((p) => playerView(p, date));
    const wb = game.finance.clubs[c.id]?.wageBudget;
    for (const x of transferListCandidates(squad, { L: c.L, rep: clubReputation(c), wageBudget: wb }, { date, inWindow: true, seasonEnd: SEASON_END })) {
      if (recentlyMoved(game.world.players[x.id], date)) continue;
      if (!M.listed[x.id]) M.listed[x.id] = { kind: x.kind, reasons: x.reasons, since: date, club: c.id };
    }
  }
  M.lastRefresh = date;
}

/** Jeden zakup klubu AI: wzmocnienie najsłabszej grupy z listy, wolnych albo słabszych klubów. */
function aiBuy(game, club, date, rng, log) {
  const W = game.world; const F = game.finance;
  const squad = squadOf(W, club.id);
  const needs = squadDeficits(squad).filter((n) => n.scope === 'squad');
  const groups = needs.length ? needs.map((n) => n.group).filter((g) => g !== 'ALL') : ['GK', 'DEF', 'MID', 'ATT'];
  const g = needs.length ? groups[0] ?? rng.pick(['DEF', 'MID', 'ATT']) : rng.pick(groups);
  const inGroup = squad.filter((p) => groupOf(p) === g).sort((a, b) => a.ovr - b.ovr);
  const bar = needs.length ? 0 : (inGroup[Math.floor(inGroup.length / 2)]?.ovr ?? 0);
  const money = spendable(F, club.id);
  const room = wageRoom(F, W, club.id) + (squad.length > 26 ? inGroup[0]?.contract?.wage ?? 0 : 0);
  const pool = [];
  for (const id of game.market.free) { const p = W.players[id]; if (p && groupOf(p) === g && p.ovr > bar) pool.push({ p, fee: 0 }); }
  for (const [id, l] of Object.entries(game.market.listed)) {
    const p = W.players[id];
    if (!p || l.kind === 'loan' || p.clubId === club.id || p.clubId === game.clubId || groupOf(p) !== g || p.ovr <= bar || (p.clubId && breaksMinimum(game, p))) continue;
    const fee = askingPrice(game, p);
    if (fee <= money) pool.push({ p, fee });
  }
  // Zakup z niższej ligi: najlepsi zawodnicy słabszych klubów (spoza ich trójki najlepszych), cena wywoławcza x1,45
  if (club.tier < 3 || pool.length < 2) {
    for (const c of CLUBS_PL) {
      if (c.tier !== club.tier + 1 && !(c.tier === club.tier && rng.chance(0.3))) continue;
      if (c.id === club.id || c.id === game.clubId || !W.clubs[c.id] || c.parent === club.id) continue;
      for (const p of squadOf(W, c.id)) {
        if (groupOf(p) !== g || p.ovr <= bar + 0.3 || recentlyMoved(p, date) || notForSale(game, p) || breaksMinimum(game, p) || game.market.listed[p.id]) continue;
        const fee = askingPrice(game, p);
        if (fee <= money * 0.7) pool.push({ p, fee });
      }
    }
  }
  if (!pool.length) return null;
  const pick = pool.sort((a, b) => (b.p.ovr - b.fee / 5e6) - (a.p.ovr - a.fee / 5e6))[0];
  const p = pick.p;
  if (playerWillingness(game, p, club.id).verdict === 'odmowa') return null;
  const neg = aiNegotiate({ kind: 'sign', player: { ...p, contract: p.contract ?? { wage: p.askWage, until: date } }, club: { ...club, name: club.name }, fromClub: p.clubId ? clubById(p.clubId) : null, date, rng, budget: { wage: Math.max(500, room) } });
  if (neg.result !== 'signed') return null;
  const entry = completeTransfer(game, { playerId: p.id, to: club.id, fee: pick.fee, contract: neg.contract, kind: pick.fee || p.clubId ? 'transfer' : 'free', date });
  log.push(entry);
  return entry;
}

/** Klub AI pozbywa się nadmiaru (ponad 30) i uzupełnia braki akademią, gdy rynek nie pomógł. */
function aiBalance(game, club, date) {
  const W = game.world;
  let squad = squadOf(W, club.id);
  while (squad.length > SQUAD_SIZE.max) {
    const g = (x) => groupOf(x);
    const counts = {}; for (const x of squad) counts[g(x)] = (counts[g(x)] ?? 0) + 1;
    const out = [...squad].filter((x) => counts[g(x)] > SQUAD_TARGETS[g(x)].min).sort((a, b) => a.ovr - b.ovr || b.age - a.age)[0];
    if (!out) break;
    releasePlayer(game, out.id);
    squad = squadOf(W, club.id);
  }
  for (const need of squadDeficits(squad).filter((n) => n.scope === 'squad')) {
    const acad = academyOf(W, club.id).filter((x) => need.group === 'ALL' || groupOf(x) === need.group).sort((a, b) => b.ovr - a.ovr);
    for (const x of acad.slice(0, need.missing)) {
      W.clubs[club.id].academy = W.clubs[club.id].academy.filter((id) => id !== x.id);
      W.clubs[club.id].squad.push(x.id);
      x.squad = 'A';
    }
  }
}

/** Oferty klubów AI za zawodników gracza (do decyzji w poczcie). */
function aiOffersForUser(game, date, rng) {
  const W = game.world; const out = [];
  const mine = squadOf(W, game.clubId);
  const open = game.market.offers.filter((o) => o.status === 'open' && o.kind === 'incoming');
  if (open.length >= 3) return out;
  for (const p of rng.shuffle([...mine]).slice(0, 8)) {
    if (open.some((o) => o.playerId === p.id) || p.loan) continue;
    const listed = game.market.userListed[p.id];
    const interest = (listed ? 0.35 : 0.035) * (p.ovr >= 12 ? 1.4 : 1);
    if (!rng.chance(interest)) continue;
    const buyers = CLUBS_PL.filter((c) => c.id !== game.clubId && game.world.clubs[c.id] && clubReputation(c) >= (p.rep ?? 30) - 15 && spendable(game.finance, c.id) > p.value * 0.8);
    if (!buyers.length) continue;
    const buyer = rng.pick(buyers);
    const fee = round((listed ?? p.value) * (0.85 + rng.next() * 0.27));
    if (fee > spendable(game.finance, buyer.id)) continue;
    const offer = { id: `of-${date}-${p.id}`, kind: 'incoming', playerId: p.id, from: buyer.id, fee, status: 'open', date, expires: addDaysIso(date, 6) };
    game.market.offers.unshift(offer);
    out.push(offer);
    if (out.length >= 2) break;
  }
  return out;
}

/** Tydzień rynku: wystawienia, zakupy AI, równowaga kadr, oferty dla gracza. Zwraca { moves, offers }. */
export function marketWeek(game, date) {
  const rng = new Rng(`rynek:${game.seed}:${date}`);
  refreshListings(game, date);
  const moves = [];
  for (const c of rng.shuffle(CLUBS_PL.filter((x) => x.id !== game.clubId && game.world.clubs[x.id]))) {
    if (rng.chance(0.4)) aiBuy(game, c, date, rng, moves);
    aiBalance(game, c, date);
  }
  const offers = aiOffersForUser(game, date, rng);
  return { moves, offers };
}

/** Odpowiedź na ofertę klubu AI za zawodnika gracza. action: 'accept' | 'reject' | 'more'. */
export function answerIncoming(game, offerId, action) {
  const o = game.market.offers.find((x) => x.id === offerId);
  if (!o || o.status !== 'open') return { text: 'Oferta jest już nieaktualna.' };
  const p = game.world.players[o.playerId];
  const buyer = clubById(o.from);
  const rng = new Rng(`odp:${o.id}:${action}`);
  if (o.expires < game.date || p.clubId !== game.clubId) { o.status = 'expired'; return { text: 'Oferta wygasła.' }; }
  if (!inWindow(game.date)) { o.status = 'expired'; return { text: 'Okno transferowe jest zamknięte.' }; }
  if (action === 'reject') {
    o.status = 'rejected';
    if (clubReputation(buyer) > clubReputation(clubById(game.clubId)) + 10 && p.persona === 'Ambitny') { p.morale = clamp((p.morale ?? 12) - 2, 1, 20); return { text: `Odrzucono ofertę ${buyer.name}. ${p.name} jest rozczarowany.` }; }
    return { text: `Odrzucono ofertę ${buyer.name} za ${p.name}.` };
  }
  if (action === 'more') {
    if (rng.chance(0.55) && o.fee * 1.15 <= spendable(game.finance, o.from)) { o.fee = round(o.fee * 1.15); o.raised = true; return { text: `${buyer.name} podnosi ofertę do ${fmtZl(o.fee)}.`, reopen: true }; }
    o.status = 'withdrawn';
    return { text: `${buyer.name} wycofuje ofertę za ${p.name}.` };
  }
  const neg = aiNegotiate({ kind: 'sign', player: p, club: buyer, fromClub: clubById(game.clubId), date: game.date, rng, budget: { wage: Math.max(p.contract.wage * 1.6, wageRoom(game.finance, game.world, o.from) + p.contract.wage) } });
  if (neg.result !== 'signed') { o.status = 'failed'; return { text: `${p.name} nie dogadał się z ${buyer.name}. Zostaje w klubie.` }; }
  completeTransfer(game, { playerId: p.id, to: o.from, fee: o.fee, contract: neg.contract, kind: 'transfer' });
  o.status = 'accepted';
  return { text: `${p.name} przechodzi do ${buyer.name} za ${fmtZl(o.fee)}.`, sold: true };
}

// ------------------------------------------------------------ Przedłużenia klubów AI
/** Raz w miesiącu od stycznia: kluby AI przedłużają kontrakty ważnych zawodników kończące się latem. */
export function aiRenewals(game, date) {
  const rng = new Rng(`przedluzenia:${game.seed}:${date}`);
  let renewed = 0;
  for (const c of CLUBS_PL) {
    if (c.id === game.clubId || !game.world.clubs[c.id]) continue;
    const squad = squadOf(game.world, c.id);
    const cutoff = [...squad].sort((a, b) => b.ovr - a.ovr)[17]?.ovr ?? 0;
    for (const p of squad) {
      if (p.contract?.until !== SEASON_END || p.renewRefused || p.ovr < cutoff - 0.3 || p.age >= 34 || p.loan) continue;
      const r = aiNegotiate({ kind: 'renew', player: p, club: c, date, rng, budget: { wage: p.contract.wage * 1.35 } });
      if (r.result === 'signed') { p.contract = { ...r.contract, signedOn: date }; p.wage = p.contract.wage; renewed++; } else p.renewRefused = true;
    }
  }
  return renewed;
}

// ------------------------------------------------------------ Pomocnicze
/** Zawodnik, który niedawno zmienił klub, nie jest sprzedawany ponownie (120 dni). */
export function recentlyMoved(p, date) {
  if (!p?.lastMove) return false;
  return (new Date(`${date}T12:00:00Z`) - new Date(`${p.lastMove}T12:00:00Z`)) / 86400000 < 120;
}
export function fmtZl(n) {
  if (n < 0) return `-${fmtZl(-n)}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace('.', ',')} mln zł`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} tys. zł`;
  return `${Math.round(n)} zł`;
}
function addDaysIso(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export { wageBill };
