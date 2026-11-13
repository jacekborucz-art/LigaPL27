// Prośby o transfer (docs/transfery.md, rozdz. 4). Dwie drogi: zdarzenie (klub odrzucił ofertę wyraźnie większego
// klubu albo ofertę z zagranicy z dużo wyższą pensją) i miesięczne ryzyko (hazard) z reputacji, minut, odmowy
// przedłużenia, wieku, charakteru i pory roku. Przebieg p.moveWish: 'cicha' (agent daje znać, morale -1), po 4
// tygodniach bez reakcji 'oficjalna' (p.transferRequest = true). Reakcje gracza: lista transferowa, obietnica zgody
// na dobrą ofertę, podwyżka (przedłużenie z bonusem do chęci pozostania), rozmowa, odmowa.
// Kluby AI: 60 % lista transferowa (0,95 wartości), 30 % podwyżka i przedłużenie, 10 % nic. Liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { createMessage } from '../core/inbox.js';
import { registerDecision } from '../core/decisions.js';
import { addDays } from '../core/gameLoop.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { squadOf } from '../world/worldGen.js';
import { clubReputation } from './reputation.js';
import { personalityOf } from './personality.js';
import { relationWith, aiNegotiate, monthsBetween } from './negotiation.js';
import { boardCaps } from './boardRequests.js';
import { noteAttention } from './attention.js';
import { windowOf, fmtZl } from './transfers.js';
import { hasOpenDeal, stat } from './transferDeals.js';
import { DOMESTIC, GAME_START } from '../config/calendar2026.js';

export const WISH = {
  base: 0.0008, // spec 0,003; kalibracja do 15-25 próśb w Ekstraklasie na sezon (tools/transfery-kalibracja.mjs)
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
/** Szansa prośby po odrzuconej ofercie. ctx: { clubRep, contractSignedRecently }. */
export function rejectTriggerP(p, { clubRep, recentContract = false }) {
  const t = traitsOf(p);
  const age = p.age ?? 25;
  return clamp(0.25 + 0.03 * (t.ambition - 10) + 0.02 * (t.ego - 10) - 0.03 * (t.loyalty - 10)
    + ((p.rep ?? 30) - clubRep > 15 ? 0.15 : 0) + (age >= 21 && age <= 27 ? 0.1 : 0) - (recentContract ? 0.15 : 0), 0, 1);
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
  let h = WISH.base * fRep * fBench * fStall * fAge * fTrait * fMonth;
  if (p.lastMove && ctx.date && daysBetween(p.lastMove, ctx.date) < WISH.recentDays) h *= 0.2;
  return clamp(h, 0, WISH.cap);
}

/** Szansa uspokojenia zawodnika rozmową. */
export function calmChance(p, trust = 50) {
  const t = traitsOf(p);
  return clamp(0.35 + 0.03 * (t.loyalty - 10) - 0.03 * (t.ambition - 10) + 0.004 * (trust - 50), 0.05, 0.9);
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
    if (neg.result === 'signed') { p.contract = { ...neg.contract, signedOn: date }; p.wage = p.contract.wage; p.renewRefused = false; clearWish(p); return; }
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
 * Klub (gracza albo AI) odrzucił ofertę. Prośba możliwa, gdy kupiec ma reputację >= klub + 10 albo oferuje
 * z zagranicy pensję >= 1,5 obecnej. ctx: { buyerRep, foreignWage, date }. Zwraca wiadomości.
 */
export function onOfferRejected(game, p, { buyerRep = 0, foreignWage = 0, date = game.date } = {}) {
  if (!p?.clubId || p.moveWish || p.preContract || p.loan) return [];
  const clubRep = repOfClub(p.clubId);
  const big = buyerRep >= clubRep + 10 || (foreignWage && foreignWage >= 1.5 * (p.contract?.wage ?? Infinity));
  if (!big) return [];
  const recent = !!p.contract?.signedOn && p.contract.signedOn !== GAME_START && monthsBetween(p.contract.signedOn, date) < 6; // kontrakty startowe się nie liczą
  const P = rejectTriggerP(p, { clubRep, recentContract: recent });
  if (!new Rng(`prosba-odrzucenie:${game.seed}:${p.id}:${date}`).chance(P)) return [];
  return openWish(game, p, date, 'oferta');
}

// ------------------------------------------------------------ Miesiąc i tydzień
function clubGames(game) {
  const n = {};
  for (const f of game.fixtures ?? []) if (f.played) { n[f.home] = (n[f.home] ?? 0) + 1; n[f.away] = (n[f.away] ?? 0) + 1; }
  return n;
}

/** 1. dnia miesiąca: nowe prośby z ryzyka miesięcznego i wycofanie próśb po zamkniętym oknie. */
export function requestsMonth(game, date) {
  const out = [];
  const games = clubGames(game);
  const month = Number(date.slice(5, 7));
  const ym = date.slice(0, 7);
  const inWin = !!windowOf(date);
  for (const c of CLUBS_PL) {
    if (!game.world.clubs[c.id] || c.tier > 3) continue;
    const clubRep = clubReputation(c);
    const n = games[c.id] ?? 0;
    for (const p of squadOf(game.world, c.id)) {
      if (p.moveWish) {
        // Po zamkniętym oknie bez oferty: 30 % w miesiącu, że zawodnik odpuszcza
        if (!inWin && !p.moveWish.promise && new Rng(`prosba-koniec:${game.seed}:${p.id}:${ym}`).chance(WISH.withdraw)) {
          const mine = p.clubId === game.clubId;
          clearWish(p);
          if (mine) out.push(msg(date, { key: `prosba-koniec:${p.id}:${ym}`, priority: 'info', from: `Agent zawodnika ${p.name}`, subject: `${p.name} nie prosi już o transfer`, body: `Okno transferowe minęło bez oferty. ${p.name} skupia się na grze dla klubu.` }));
        }
        continue;
      }
      if (hasOpenDeal(game, p.id)) continue;
      const share = n ? (p.season?.min ?? 0) / (n * 90) : 1;
      const h = monthlyHazard(p, { clubRep, share, games: n, month, date });
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

/** Najbliższy koniec okna (dla obietnicy). */
function nextWindowEnd(date) {
  const w = (DOMESTIC.transferWindows ?? []).find((x) => x.to >= date);
  return w?.to ?? addDays(date, 120);
}

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
      W.reacted = 'promise'; W.promise = { minFee: round(p.value ?? 0), until: nextWindowEnd(date), since: date };
      mor(M.promise);
      return { ok: true, text: `Obiecałeś zgodę na ofertę większego klubu od ${fmtZl(W.promise.minFee)} (do ${W.promise.until}). Złamana obietnica mocno uderzy w zaufanie.` };
    }
    case 'talk': {
      if (W.talked && daysBetween(W.talked, date) < WISH.talkDays) return { ok: false, text: `Rozmawiałeś z ${p.name} niedawno. Kolejna rozmowa za ${WISH.talkDays - daysBetween(W.talked, date)} dni.` };
      W.talked = date;
      noteAttention(p, date);
      const trust = relationWith(p, game.clubId).trust;
      if (new Rng(`prosba-rozmowa:${game.seed}:${p.id}:${date}`).chance(calmChance(p, trust))) {
        clearWish(p); p.unhappy = false; mor(M.calmed);
        return { ok: true, text: `${p.name} dał się przekonać. Zostaje i nie prosi już o transfer.` };
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
 * i zdarzenie prośby. Zwraca { broken, messages }.
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
    return { broken: true, messages: [] };
  }
  return { broken: false, messages: onOfferRejected(game, p, { buyerRep, foreignWage, date }) };
}

registerDecision('moveWish', (game, m, action) => {
  const r = reactToWish(game, m.refs.pid, action);
  return [createMessage({ date: game.date, category: 'players', from: 'Dyrektor sportowy', priority: 'info', subject: 'Prośba o transfer', body: r.text || 'Bez zmian.' })];
});
