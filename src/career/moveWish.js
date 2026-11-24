// Prośby o transfer (docs/transfery.md, rozdz. 4). Dwie drogi: zdarzenie (klub odrzucił ofertę wyraźnie większego
// klubu albo ofertę z zagranicy z dużo wyższą pensją) i miesięczne ryzyko (hazard) z reputacji, minut, odmowy
// przedłużenia, wieku, charakteru i pory roku. Przebieg p.moveWish: 'cicha' (agent daje znać, morale -1), po 4
// tygodniach bez reakcji 'oficjalna' (p.transferRequest = true). Reakcje gracza: lista transferowa, obietnica zgody
// na dobrą ofertę, podwyżka (przedłużenie z bonusem do chęci pozostania), rozmowa, odmowa.
// Kluby AI: 60 % lista transferowa (0,95 wartości), 30 % podwyżka i przedłużenie, 10 % nic. Liczby [SZAC].
// Pamięć (src/career/wishMemory.js): odrzucona oferta to jeden rzut (cicha prośba, rozczarowany, spokojny),
// najwyżej raz na 30 dni; czas spokoju po nowym kontrakcie, pamięć odmów, oferta marzeń, „poczekam do lata”.

import { Rng, clamp } from '../core/rng.js';
import { directorFrom } from './director.js'; // podpis dyrektora sportowego klubu gracza (docs/dyrektor-sportowy.md)
import { createMessage } from '../core/inbox.js';
import { fmtDate } from '../ui/dom.js';
import { registerDecision } from '../core/decisions.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { squadOf } from '../world/worldGen.js';
import { clubReputation } from './reputation.js';
import { personalityOf } from './personality.js';
import { relationWith, aiNegotiate, currentGrudge, applyPromiseCheck, ROLE_LABELS } from './negotiation.js';
import {
  MEM, memOf, ensureMem, rejectOdds, noteReject, canRoll, hazardMemFactor, reconcileChance, noteRenewal,
  talkRaiseBonus, nextWindowOpen, nextWindowEnd, lateInWindow, addMonths, inAcclim,
} from './wishMemory.js';
import { boardCaps } from './boardRequests.js';
import { noteAttention } from './attention.js';
import { windowOf, fmtZl } from './transfers.js';
import { hasOpenDeal, stat } from './transferDeals.js';

export const WISH = {
  baseLow: 0.0008, // 1 Liga i niżej: osobna baza (decyzja właściciela: 60-85 próśb na sezon we wszystkich ligach)
  base: 0.0012, // spec 0,003; kalibracja do 15-25 próśb w Ekstraklasie na sezon (tools/transfery-kalibracja.mjs); 0,0008 przed pamięcią (wishMemory.js)
  cap: 0.08, quietDays: 28, withdraw: 0.3, recentDays: 180, talkDays: 14,
  morale: { open: -1, list: 2, promise: 1, refuse: -3, broken: -2.5, calmed: 1, talkFail: -1 },
  ai: { list: 0.6, renew: 0.3 }, // reszta: klub ignoruje prośbę
  listPrice: 0.95, refusePenalty: -0.15, stayBonus: 0.15,
};

const round = (x, step = 10000) => Math.round(x / step) * step;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const repOfClub = (id) => (clubById(id) ? clubReputation(clubById(id)) : 35);
const traitsOf = (p) => personalityOf(p).traits;

// ------------------------------------------------------------ Wzory
/**
 * P0: bazowa szansa cichej prośby po odrzuconej ofercie (bez dawnego członu -0,15 za świeży kontrakt: czas spokoju
 * liczy teraz fSpokój w wishMemory.js). ctx: { clubRep }.
 */
export function rejectTriggerP(p, { clubRep }) {
  const t = traitsOf(p);
  const age = p.age ?? 25;
  return clamp(0.25 + 0.03 * (t.ambition - 10) + 0.02 * (t.ego - 10) - 0.03 * (t.loyalty - 10)
    + ((p.rep ?? 30) - clubRep > 15 ? 0.15 : 0) + (age >= 21 && age <= 27 ? 0.1 : 0), 0, 1);
}

/** Miesięczne ryzyko prośby (hazard). ctx: { clubRep, share, games, month, date }. */
export function monthlyHazard(p, ctx) {
  if (p.preContract || p.loan) return 0;
  const t = traitsOf(p);
  const age = p.age ?? 25;
  const fRep = 1 + Math.max(0, (p.rep ?? 30) - ctx.clubRep - 10) / 10;
  const fBench = ctx.games >= 6 && ctx.share < 0.35 ? 2.5 : 1;
  const fStall = p.renewRefused ? 3 : 1;
  const fAge = age >= 21 && age <= 27 ? 1.5 : age >= 31 ? 0.5 : 1;
  const fTrait = Math.max(0, 1 + 0.08 * (t.ambition - 10)) * Math.max(0, 1 - 0.05 * (t.loyalty - 10)) * (p.unhappy ? 2 : 1);
  const fMonth = [6, 7, 8, 1, 2].includes(ctx.month) ? 2 : 0.5;
  let h = ((ctx.tier ?? 1) >= 2 ? WISH.baseLow : WISH.base) * fRep * fBench * fStall * fAge * fTrait * fMonth;
  if (p.lastMove && ctx.date && daysBetween(p.lastMove, ctx.date) < WISH.recentDays) h *= 0.2;
  h *= hazardMemFactor(p, ctx.date); // fSpokój x fPamięć, czekanie na okno, rozczarowany w oknie x2 (wishMemory.js)
  return clamp(h, 0, WISH.cap);
}

/** Szansa uspokojenia zawodnika rozmową (+0,1 do 60 dni po podwyżce, gdy podana data). */
export function calmChance(p, trust = 50, date = null) {
  const t = traitsOf(p);
  return clamp(0.35 + 0.03 * (t.loyalty - 10) - 0.03 * (t.ambition - 10) + 0.004 * (trust - 50) + (date ? talkRaiseBonus(p, date) : 0), 0.05, 0.9);
}

// ------------------------------------------------------------ Otwarcie i zamknięcie
const msg = (date, o) => createMessage({ date, category: 'players', priority: 'important', ...o });

function wishLetter(game, p, date) {
  const why = p.moveWish.why === 'oferta' ? 'Odrzucenie oferty bardzo go zabolało.' : 'Uważa, że czas na zmianę klubu.';
  return msg(date, {
    key: `prosba:${p.id}:${p.moveWish.since}`, from: `Agent zawodnika ${p.name}`,
    subject: `Agent: ${p.name} chciałby zmienić klub`,
    body: `Agent ${p.name} (${p.pos}, ${p.age} lat) daje znać, że zawodnik myśli o odejściu. ${why} Na razie to rozmowa w cztery oczy. Jeśli nie zareagujesz w ciągu 4 tygodni, ${p.name} oficjalnie poprosi o transfer.\n\nMożesz wystawić go na listę transferową, obiecać zgodę na dobrą ofertę większego klubu, porozmawiać z nim albo odmówić. Podwyżkę zaproponujesz w karcie zawodnika (Transfery, Kontrakty).`,
    actions: [{ id: 'list', label: 'Wystaw na listę' }, { id: 'promise', label: 'Obiecaj zgodę na dobrą ofertę' }, { id: 'talk', label: 'Porozmawiaj' }, { id: 'refuse', label: 'Odmów' }],
    refs: { kind: 'moveWish', pid: p.id, since: p.moveWish.since }, optional: true,
  });
}

/** Otwiera prośbę (etap cichy). Zwraca wiadomości (dla zawodnika gracza). */
export function openWish(game, p, date, why = 'hazard') {
  if (!p || p.moveWish || p.preContract || hasOpenDeal(game, p.id) || !p.clubId) return [];
  p.moveWish = { stage: 'cicha', since: date, why, club: p.clubId };
  if (p.wishMemory) { const m = p.wishMemory; delete m.mood; delete m.moodSince; delete m.calmUntil; delete m.waitUntil; }
  p.morale = clamp((p.morale ?? 12) + WISH.morale.open, 1, 20);
  stat(game, 'requests');
  stat(game, `requests_${why}`);
  if (clubById(p.clubId)?.tier === 1) stat(game, 'requestsEk');
  if (p.clubId === game.clubId) { stat(game, 'requestsUser'); return [wishLetter(game, p, date)]; }
  aiReact(game, p, date);
  return [];
}

export function clearWish(p) {
  delete p.moveWish;
  p.transferRequest = false;
}

/** Reakcja klubu AI na prośbę. */
function aiReact(game, p, date) {
  const rng = new Rng(`prosba-ai:${game.seed}:${p.id}:${date}`);
  const r = rng.next();
  const W = p.moveWish;
  if (r < WISH.ai.list) { listForSale(game, p, date); W.reacted = 'list'; return; }
  if (r < WISH.ai.list + WISH.ai.renew && p.contract) {
    const c = clubById(p.clubId);
    const caps = boardCaps(game, c.id, p, 'renew');
    const neg = aiNegotiate({ kind: 'renew', player: { ...p, renewRefused: false }, club: c, date, rng: rng.fork('renew'), ctx: { stayBonus: WISH.stayBonus, forceRenew: true }, budget: { wage: Math.min(p.contract.wage * 1.5, caps.wage), maxYears: caps.years, total: caps.total } });
    if (neg.result === 'signed') {
      const oldWage = p.contract.wage ?? 0;
      p.contract = { ...neg.contract, signedOn: date }; p.wage = p.contract.wage; p.renewRefused = false;
      // Ten sam rzut uspokojenia co u gracza: podwyżka nie zeruje prośby na pewno (wishMemory.js)
      if (noteRenewal(p, date, { oldWage, newWage: p.contract.wage, seed: game.seed }).calmed) { stat(game, 'raiseCalmed'); return; }
      stat(game, 'raiseFailed');
    }
    listForSale(game, p, date); W.reacted = 'list'; return;
  }
  W.reacted = 'ignore';
  p.unhappy = true;
}

function listForSale(game, p, date) {
  game.market.listed[p.id] = { kind: 'sale', reasons: ['Prosi o transfer'], since: date, club: p.clubId, price: round((p.value ?? 0) * WISH.listPrice) };
}

// ------------------------------------------------------------ Zdarzenie: odrzucona oferta
/**
 * Klub (gracza albo AI) odrzucił ofertę. Liczy się, gdy kupiec ma reputację >= klub + 10 albo oferuje z zagranicy
 * pensję >= 1,5 obecnej. Jeden rzut (najwyżej raz na 30 dni): u < Pc: cicha prośba; u < Pc + Pr: rozczarowany,
 * ale zostaje (morale -2, bez listu); reszta: spokojny (4-8 miesięcy, kolejne oferty x0,5). W ciągu 30 dni od rzutu
 * kolejna oferta tylko eskaluje stan: rozczarowany prosi po cichu o transfer. Oferta marzeń (24-29 lat, kupiec
 * >= klub + 25) przebija czas spokoju i zostawia urazę. ctx: { buyerRep, foreignWage, date }.
 * Zwraca { state: null|'cicha'|'rozczarowany'|'spokojny'|'prosba', messages }.
 */
export function offerRejected(game, p, { buyerRep = 0, foreignWage = 0, date = game.date } = {}) {
  const none = { state: null, messages: [] };
  if (!p?.clubId || p.preContract || p.loan) return none;
  const clubRep = repOfClub(p.clubId);
  const wageJump = !!foreignWage && foreignWage >= 1.5 * (p.contract?.wage ?? Infinity);
  if (buyerRep < clubRep + 10 && !wageJump) return none;
  if (p.moveWish) { noteReject(p, date); return { state: 'prosba', messages: [] }; }
  const mem0 = memOf(p);
  if (!canRoll(p, date)) { // w ciągu 30 dni od rzutu: tylko eskalacja istniejącego stanu
    noteReject(p, date);
    if (mem0.mood === 'rozczarowany' && !inAcclim(p, date)) { // w okresie aklimatyzacji bez eskalacji
      stat(game, 'escalated');
      const messages = openWish(game, p, date, 'oferta');
      return { state: p.moveWish ? 'cicha' : 'rozczarowany', messages };
    }
    return { state: mem0.mood ?? null, messages: [] };
  }
  const odds = rejectOdds(p, { P0: rejectTriggerP(p, { clubRep }), buyerRep, clubRep, wageJump, date });
  noteReject(p, date); // po policzeniu szans: pamięć liczy wcześniejsze odmowy
  const mem = ensureMem(p);
  mem.lastRoll = date;
  if (odds.dream) { // przepadła oferta marzeń: zawodnik pamięta i ma urazę do klubu (rozmowy o przedłużeniu)
    mem.dream = date; mem.grudge = date;
    const rel = relationWith(p, p.clubId);
    rel.grudge = Math.round((currentGrudge(rel, date) + MEM.dream.grudge) * 10) / 10; rel.grudgeDate = date;
    p.relations = { ...(p.relations || {}), [p.clubId]: rel };
    stat(game, 'dream');
  }
  const rng = new Rng(`prosba-odrzucenie:${game.seed}:${p.id}:${date}`);
  const u = rng.next();
  if (u < odds.Pc) {
    const messages = openWish(game, p, date, 'oferta');
    if (p.moveWish) return { state: 'cicha', messages };
  }
  if (u < odds.Pc + odds.Pr || mem.mood === 'rozczarowany') { // rozczarowany nie uspokaja się od kolejnej odmowy
    if (mem.mood !== 'rozczarowany') { mem.moodSince = date; p.morale = clamp((p.morale ?? 12) + MEM.moodMorale, 1, 20); stat(game, 'disappointed'); }
    mem.mood = 'rozczarowany'; delete mem.calmUntil;
    if (odds.late) mem.waitUntil = nextWindowOpen(date); // „poczekam do lata”
    return { state: 'rozczarowany', messages: [] };
  }
  mem.mood = 'spokojny'; mem.moodSince = date;
  mem.calmUntil = addMonths(date, rng.int(MEM.calmMonths[0], MEM.calmMonths[1]));
  delete mem.waitUntil;
  stat(game, 'calm');
  return { state: 'spokojny', messages: [] };
}

/** Jak offerRejected, zwraca same wiadomości (dla klubów AI i starych wywołań). */
export function onOfferRejected(game, p, ctx = {}) { return offerRejected(game, p, ctx).messages; }

// ------------------------------------------------------------ Miesiąc i tydzień
function clubGames(game) {
  const n = {};
  for (const f of game.fixtures ?? []) if (f.played) { n[f.home] = (n[f.home] ?? 0) + 1; n[f.away] = (n[f.away] ?? 0) + 1; }
  return n;
}

/** Nastrój bez prośby: spokój mija, rozczarowany godzi się z klubem (szansa w miesiącu z charakteru). */
function moodMonth(game, p, date, ym) {
  const m = p.wishMemory;
  if (!m?.mood) return;
  if (m.mood === 'spokojny' && !(m.calmUntil > date)) { delete m.mood; delete m.moodSince; delete m.calmUntil; return; }
  if (m.mood === 'rozczarowany' && m.moodSince < date && new Rng(`prosba-pogodzenie:${game.seed}:${p.id}:${ym}`).chance(reconcileChance(p))) {
    delete m.mood; delete m.moodSince; delete m.waitUntil;
    stat(game, 'reconciled');
  }
}

/**
 * Obietnica roli z kontraktu (career/negotiation.js evaluatePromise): 1. dnia miesiąca udział w minutach meczów klubu
 * z ostatniego miesiąca. Miesiąc bez meczów klubu albo z kontuzją zawodnika się nie liczy. Słaby miesiąc: ostrzeżenie,
 * 3 słabe miesiące: obietnica złamana. Złamana obietnica kończy okres aklimatyzacji, a zawodnik prosi o odejście
 * z szansą z charakteru (0,5 + ambicja i chęć gry, od 0,2 do 0,9) [SZAC]. Gracz dostaje wiadomości o swoich zawodnikach.
 */
function promiseMonth(game, p, clubId, clubGamesN, date) {
  const pr = p.contract?.promise;
  if (!pr || pr.broken || p.loan) return [];
  const minNow = p.season?.min ?? 0;
  const seen = pr.seen ?? { min: minNow, g: clubGamesN };
  const dMin = minNow >= seen.min ? minNow - seen.min : minNow; // nowy sezon: statystyki od zera
  const dG = clubGamesN >= seen.g ? clubGamesN - seen.g : clubGamesN;
  const skip = !pr.seen || dG === 0 || p.injuryDays > 0;
  p.contract = { ...p.contract, promise: { ...pr, seen: { min: minNow, g: clubGamesN } } };
  if (skip) return [];
  const r = applyPromiseCheck(p, clubId, date, clamp(dMin / (dG * 90), 0, 1));
  if (!r) return [];
  const out = [];
  const mine = clubId === game.clubId;
  if (mine && (r.type === 'promiseWarning' || r.type === 'promiseBroken')) {
    const role = ROLE_LABELS[p.contract.promise.role] ?? p.contract.promise.role;
    out.push(msg(date, { key: `obietnica:${p.id}:${date}`, from: r.speaker ?? `Agent zawodnika ${p.name}`, priority: r.type === 'promiseBroken' ? 'important' : 'info',
      subject: r.type === 'promiseBroken' ? `${p.name}: złamana obietnica roli` : `${p.name} przypomina o obietnicy roli`,
      body: `${r.text ?? ''}

W kontrakcie: ${role}. ${r.type === 'promiseBroken' ? 'Trzeci słaby miesiąc: obietnica złamana, zaufanie i morale spadają, a zawodnik może poprosić o odejście.' : `Słaby miesiąc (${p.contract.promise.strikes} z 3). Po trzecim obietnica będzie złamana.`}` }));
  }
  if (r.type === 'promiseBroken') {
    const t = traitsOf(p);
    const chance = clamp(0.5 + 0.03 * (t.ambition - 10) + 0.03 * ((t.playTime ?? 10) - 10), 0.2, 0.9);
    if (new Rng(`obietnica-prosba:${game.seed}:${p.id}:${date}`).chance(chance)) out.push(...openWish(game, p, date, 'obietnica'));
  }
  return out;
}

/** 1. dnia miesiąca: nowe prośby z ryzyka miesięcznego i wycofanie próśb po zamkniętym oknie. */
export function requestsMonth(game, date) {
  const out = [];
  const games = clubGames(game);
  const month = Number(date.slice(5, 7));
  const ym = date.slice(0, 7);
  const inWin = !!windowOf(date);
  for (const c of CLUBS_PL) {
    if (!game.world.clubs[c.id] || c.tier > 4) continue;
    const clubRep = clubReputation(c);
    const n = games[c.id] ?? 0;
    for (const p of squadOf(game.world, c.id)) {
      out.push(...promiseMonth(game, p, c.id, n, date)); // obietnica roli z kontraktu: rozliczenie miesiąca
      if (p.moveWish) {
        // Po zamkniętym oknie bez oferty: 30 % w miesiącu, że zawodnik odpuszcza
        if (!inWin && !p.moveWish.promise && new Rng(`prosba-koniec:${game.seed}:${p.id}:${ym}`).chance(WISH.withdraw)) {
          const mine = p.clubId === game.clubId;
          clearWish(p);
          if (mine) out.push(msg(date, { key: `prosba-koniec:${p.id}:${ym}`, priority: 'info', from: `Agent zawodnika ${p.name}`, subject: `${p.name} nie prosi już o transfer`, body: `Okno transferowe minęło bez oferty. ${p.name} skupia się na grze dla klubu.` }));
        }
        continue;
      }
      moodMonth(game, p, date, ym);
      if (hasOpenDeal(game, p.id)) continue;
      const share = n ? (p.season?.min ?? 0) / (n * 90) : 1;
      const h = monthlyHazard(p, { clubRep, share, games: n, month, date, tier: c.tier });
      if (h > 0 && new Rng(`prosba-transfer:${game.seed}:${p.id}:${ym}`).chance(h)) out.push(...openWish(game, p, date, 'hazard'));
    }
  }
  return out;
}

/** Poniedziałek: etap cichy przechodzi w oficjalny po 4 tygodniach bez reakcji; kluby AI odnawiają wystawienie. */
export function requestsWeek(game, date) {
  const out = [];
  const inWin = !!windowOf(date);
  for (const c of CLUBS_PL) {
    if (!game.world.clubs[c.id]) continue;
    for (const p of squadOf(game.world, c.id)) {
      const W = p.moveWish;
      if (!W) continue;
      if (W.club !== p.clubId) { clearWish(p); continue; }
      // Obietnica bez oferty do końca okna wygasa bez kary: zawodnik zostaje, ale jest rozczarowany
      if (W.promise && !W.promise.broken && date > W.promise.until) {
        const mine = p.clubId === game.clubId;
        clearWish(p); p.unhappy = false;
        const m = ensureMem(p);
        m.mood = 'rozczarowany'; m.moodSince = date; delete m.calmUntil; delete m.waitUntil;
        stat(game, 'promiseExpired');
        if (mine) out.push(msg(date, { key: `prosba-obietnica-koniec:${p.id}:${W.since}`, priority: 'info', from: `Agent zawodnika ${p.name}`, subject: `${p.name} zostaje po oknie bez oferty`, body: `Okno transferowe minęło i nie przyszła oferta, na którą się umawialiście. Obietnica wygasła. ${p.name} zostaje w klubie, ale jest rozczarowany i w następnym oknie znów może myśleć o odejściu.`, refs: { kind: 'moveWishInfo', pid: p.id } }));
        continue;
      }
      if (W.stage === 'oficjalna') p.transferRequest = true; // po końcu sezonu flaga jest zerowana, prośba trwa
      if (W.stage === 'cicha' && !W.reacted && daysBetween(W.since, date) >= WISH.quietDays) {
        W.stage = 'oficjalna'; W.official = date; p.transferRequest = true; p.unhappy = true;
        if (p.clubId === game.clubId) out.push(msg(date, { key: `prosba-oficjalna:${p.id}:${W.since}`, from: 'Dyrektor sportowy', subject: `${p.name} oficjalnie prosi o transfer`, body: `${p.name} złożył oficjalną prośbę o transfer. Media już o tym piszą. Wystaw go na listę, obiecaj zgodę na dobrą ofertę albo spróbuj go przekonać rozmową lub podwyżką.`, refs: { kind: 'moveWishInfo', pid: p.id } }));
      }
      if (inWin && p.clubId !== game.clubId && W.reacted === 'list' && !game.market.listed[p.id]) listForSale(game, p, date);
    }
  }
  return out;
}

// ------------------------------------------------------------ Reakcje gracza
export const WISH_ACTIONS = { list: 'Wystaw na listę', promise: 'Obiecaj zgodę na dobrą ofertę', talk: 'Porozmawiaj', refuse: 'Odmów', raise: 'Zaproponuj podwyżkę' };

/**
 * Reakcja gracza na prośbę: 'list' | 'promise' | 'talk' | 'refuse' | 'raise'. Zwraca { ok, text, negotiate? }.
 * 'raise' zwraca negotiate (rozmowa o przedłużeniu z bonusem do chęci pozostania), ekran rozmów otwiera UI.
 */
export function reactToWish(game, pid, action, date = game.date) {
  const p = game.world.players[pid];
  const W = p?.moveWish;
  if (!p || p.clubId !== game.clubId) return { ok: false, text: 'To nie jest zawodnik twojej drużyny.' };
  if (!W) return { ok: false, text: `${p.name} nie prosi o transfer.` };
  const M = WISH.morale;
  const mor = (d) => { p.morale = clamp((p.morale ?? 12) + d, 1, 20); };
  switch (action) {
    case 'list': {
      const price = round(p.value ?? 0);
      game.market.userListed[p.id] = game.market.userListed[p.id] ?? price;
      W.reacted = 'list'; mor(M.list);
      return { ok: true, text: `${p.name} jest na liście transferowej za ${fmtZl(game.market.userListed[p.id])}. Zawodnik docenia uczciwość (morale +${M.list}).` };
    }
    case 'promise': {
      W.reacted = 'promise'; // stan „czeka”: bez rzutów i ryzyka do końca okna (w ostatnich 10 dniach: następnego)
      W.promise = { minFee: round(p.value ?? 0), until: nextWindowEnd(lateInWindow(date) ? nextWindowOpen(date) : date), since: date };
      mor(M.promise);
      return { ok: true, text: `Obiecałeś zgodę na ofertę większego klubu od ${fmtZl(W.promise.minFee)} (do ${fmtDate(W.promise.until)}). Złamana obietnica mocno uderzy w zaufanie.` };
    }
    case 'talk': {
      if (W.talked && daysBetween(W.talked, date) < WISH.talkDays) return { ok: false, text: `Rozmawiałeś z ${p.name} niedawno. Kolejna rozmowa za ${WISH.talkDays - daysBetween(W.talked, date)} dni.` };
      W.talked = date;
      noteAttention(p, date);
      ensureMem(p).lastTalk = date;
      const trust = relationWith(p, game.clubId).trust;
      const cc = calmChance(p, trust, date); // +0,1 do 60 dni po podwyżce
      const u = new Rng(`prosba-rozmowa:${game.seed}:${p.id}:${date}`).next();
      if (u < cc) {
        clearWish(p); p.unhappy = false; mor(M.calmed);
        return { ok: true, text: `${p.name} dał się przekonać. Zostaje i nie prosi już o transfer.` };
      }
      if (W.stage === 'cicha' && u < cc * 1.5) { // częściowy sukces: zostaje, ale jest rozczarowany
        clearWish(p);
        const m = ensureMem(p);
        m.mood = 'rozczarowany'; m.moodSince = date; delete m.calmUntil;
        return { ok: true, text: `${p.name} wycofuje prośbę i zostaje, ale jest rozczarowany. W następnym oknie znów może myśleć o odejściu.` };
      }
      mor(M.talkFail);
      return { ok: true, text: `${p.name} wysłuchał, ale nie zmienił zdania.` };
    }
    case 'refuse': {
      W.reacted = 'refuse'; mor(M.refuse);
      if (W.stage === 'cicha') { W.stage = 'oficjalna'; W.official = date; }
      p.transferRequest = true; p.unhappy = true;
      return { ok: true, text: `Odmówiłeś. ${p.name} jest zły (morale ${M.refuse}) i oficjalnie prosi o transfer. Dopóki prośba trwa, gra trochę słabiej.` };
    }
    case 'raise':
      return { ok: true, text: '', negotiate: { kind: 'renew', playerId: p.id, stayBonus: WISH.stayBonus } };
    default:
      return { ok: false, text: 'Nieznana reakcja.' };
  }
}

/**
 * Gracz odrzucił ofertę za zawodnika z prośbą: złamana obietnica (oferta >= obiecanej kwoty od większego klubu)
 * i zdarzenie prośby (offerRejected). Zwraca { broken, messages, state }.
 */
export function onUserRejected(game, p, { buyerRep = 0, fee = 0, foreignWage = 0, date = game.date } = {}) {
  const W = p.moveWish;
  if (W?.promise && !W.promise.broken && fee >= W.promise.minFee && buyerRep > repOfClub(p.clubId)) {
    W.promise.broken = true;
    p.morale = clamp((p.morale ?? 12) + WISH.morale.broken, 1, 20);
    const rel = relationWith(p, p.clubId);
    rel.brokenPromises++; rel.trust = clamp(rel.trust - 20, 0, 100);
    p.relations = { ...(p.relations || {}), [p.clubId]: rel };
    p.unhappy = true; p.transferRequest = true; W.stage = 'oficjalna';
    return { broken: true, messages: [], state: 'oficjalna' };
  }
  const r = offerRejected(game, p, { buyerRep, foreignWage, date });
  return { broken: false, messages: r.messages, state: r.state };
}

registerDecision('moveWish', (game, m, action) => {
  const r = reactToWish(game, m.refs.pid, action);
  return [createMessage({ date: game.date, category: 'players', from: directorFrom(game), priority: 'info', subject: 'Prośba o transfer', body: r.text || 'Bez zmian.' })];
});
