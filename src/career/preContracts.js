// Prekontrakty (docs/transfery.md, rozdz. 2). FIFA RSTP art. 18.3: zawodnik może podpisać umowę z innym klubem,
// gdy do końca jego kontraktu zostało najwyżej 6 miesięcy (kontrakty do Jun 30: od Jan 1); obecny klub trzeba
// o rozmowach poinformować. Propozycje składają: gracz (rozmowy w trybie „Umowa od Jul 1”), kluby AI z Polski
// (1. dnia miesiąca Jan-May, gdy brakuje im zawodników na przyszły sezon) i wirtualne kluby zagraniczne.
// Zawodnik decyduje w poniedziałki od stycznia: użyteczność ofert (z ofertą własnego klubu) wobec progu, który
// z miesiącami spada. Podpisany prekontrakt blokuje inne oferty i przedłużenie; 1 lipca zawodnik przechodzi
// do nowego klubu (rollover, przed wygaśnięciem kontraktów). Liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { createMessage } from '../core/inbox.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { payLevel } from '../data/finanse_klubow.js';
import { SEASON_END, SEASON_YEAR } from '../config/calendar2026.js';
import { squadOf } from '../world/worldGen.js';
import { GROUP, SQUAD_TARGETS } from './squad.js';
import { clubReputation } from './reputation.js';
import { marketWage, relationWith, monthsBetween, addDays } from './negotiation.js';
import { scoreOffer, abroadWish, clubStability } from './offerFactors.js'; // klocki decyzji zawodnika
import { boardCaps } from './boardRequests.js';
import { squadLimitOf, isExempt } from './squadLimit.js';
import { book, spendable } from './finance.js';
import { windowOf, playerWillingness, breaksMinimum, fmtZl } from './transfers.js';
import { hasOpenDeal, startDeal, stat, completeAbroad, pendingFees } from './transferDeals.js';
import { pickBuyer, foreignTarget } from './foreignMarket.js';
import { spellsOf, syncSpell } from '../season/history.js';
import { fmtDate } from '../ui/dom.js';

export const PRE = {
  months: 6, // FIFA RSTP art. 18.3
  userMax: 4, // gracz: najwyżej 4 aktywne prekontrakty
  foreignRep: 45, pForeign: 0.8, // wirtualne kluby zagraniczne: zawodnicy z reputacją >= 45, szansa w miesiącu
  warnGap: 0.15, // ostrzeżenie „rozmawia z X”, gdy oferta jest blisko progu
  early: { chance: 0.25, factor: 0.25 }, // zimą wcześniejszy transfer do klubu z prekontraktem: cena wartość x 0,25 x miesiące/6
  offerWeeks: 8, // propozycja ważna 8 tygodni
};

const round = (x, step = 5000) => Math.round(x / step) * step;
const groupOf = (p) => GROUP[p.pos] ?? 'MID';
const isAi = (game, id) => id && id !== game.clubId && !!game.world.clubs[id];

export function ensurePre(game) {
  const M = game.market;
  if (!M.pre || !Array.isArray(M.pre.offers)) M.pre = { offers: [], warned: {} };
  M.pre.warned ??= {};
  return M.pre;
}

/** Początek nowego kontraktu (Jul 1 po końcu sezonu). */
export const preStart = () => `${SEASON_YEAR + 1}-07-01`;

/** Data, od której zawodnik może rozmawiać z innymi klubami (6 miesięcy przed końcem kontraktu). */
export function preOpensOn(p) {
  const u = p.contract?.until;
  if (!u) return null;
  // Dzień po końcu kontraktu minus 6 miesięcy: kontrakt do Jun 30 otwiera rozmowy 1 stycznia
  const end = new Date(`${u}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCMonth(end.getUTCMonth() - PRE.months);
  return end.toISOString().slice(0, 10);
}

/** Czy inny klub może dziś proponować zawodnikowi umowę od 1 lipca. */
export function canApproach(p, date) {
  if (!p?.contract?.until || p.loan || p.preContract || p.retiring || !p.clubId) return false;
  if (p.contract.until > SEASON_END) return false; // kontrakt kończy się dopiero po tym sezonie
  return date >= preOpensOn(p) && date <= p.contract.until;
}

export const userPreContracts = (game) => Object.values(game.world.players).filter((p) => p.preContract?.club === game.clubId);

/** Kadra gracza na przyszły sezon: kontrakty po Jun 30 i prekontrakty (bez wychowanków do 21 lat). */
export function nextSeasonCount(game) {
  const mine = squadOf(game.world, game.clubId).filter((p) => !p.loan && p.contract?.until > SEASON_END && !p.preContract && !isExempt(p)).length;
  return mine + userPreContracts(game).length;
}

/** Czy gracz może zaproponować zawodnikowi umowę od 1 lipca. Zwraca { ok, text }. */
export function checkUserPre(game, p, date = game.date) {
  if (!p || p.clubId === game.clubId) return { ok: false, text: 'To twój zawodnik.' };
  if (p.preContract) return { ok: false, text: `${p.name} ma już umowę od 1 lipca z innym klubem.` };
  if (!canApproach(p, date)) return { ok: false, text: `Rozmowy o umowie od 1 lipca najwcześniej ${PRE.months} miesięcy przed końcem kontraktu${p.contract?.until ? ` (od ${fmtDate(preOpensOn(p))})` : ''}.` };
  if (hasOpenDeal(game, p.id)) return { ok: false, text: 'Zawodnik jest w trakcie transferu.' };
  if (userPreContracts(game).length >= PRE.userMax) return { ok: false, text: `Masz już ${PRE.userMax} umowy od 1 lipca. To limit.` };
  const hard = squadLimitOf(game, game.clubId).hard;
  if (nextSeasonCount(game) + 1 > hard) return { ok: false, text: `Kadra na przyszły sezon byłaby za duża (maksimum ${hard}).` };
  return { ok: true, text: '' };
}

// ------------------------------------------------------------ Użyteczność ofert
export { abroadWish };

/**
 * Użyteczność oferty dla zawodnika: suma klocków decyzji (src/career/offerFactors.js) plus szum.
 * o: { wage, rep, L?, tier?, prestige?, europe, foreign, own, region?, stab?, first? }.
 * Dawny wzór (pieniądze, prestiż, rola, Europa, zagranica, lojalność) bez zmiany liczb, nowe klocki: miasto i rodzina,
 * stabilność klubu, pierwszeństwo oferty (każdy najwyżej ±0,3).
 */
export function offerUtility(p, o, { trust = 50, noise = 0, only = null } = {}) {
  return scoreOffer(p, o, { trust, only }).u + noise;
}

/** Próg podpisu: 0,6 - 0,08 x miesiące od 1 stycznia - 0,4 x D (nastawienie, src/career/mindset.js). */
export function signThreshold(date, D = 0) {
  const months = Math.max(0, Number(date.slice(5, 7)) - 1);
  return 0.6 - 0.08 * months - 0.4 * D;
}

const inEurope = (game, id) => (game.fixtures ?? []).some((f) => f.comp === 'uefa' && (f.home === id || f.away === id));

function offerView(game, o, first = false) {
  if (o.foreign) return { wage: o.wage, rep: o.foreign.repU ?? o.foreign.rep + 25, L: o.foreign.L ?? 12, tier: 1, europe: false, foreign: true, first };
  const c = clubById(o.to);
  return { wage: o.wage, rep: clubReputation(c), L: c.L, prestige: c.prestige, tier: c.tier, europe: inEurope(game, c.id), foreign: false, region: c.region, stab: clubStability(game, c.id), first };
}

function ownView(game, p) {
  const c = clubById(p.clubId);
  return { wage: p.contract?.wage ?? 0, rep: clubReputation(c), L: c.L, prestige: c.prestige, tier: c.tier, europe: inEurope(game, c.id), foreign: false, own: true, region: c.region, stab: clubStability(game, c.id) };
}

// ------------------------------------------------------------ Propozycje klubów AI i zagranicy
const buyerLabel = (o) => (o.foreign ? o.foreign.name : clubById(o.to)?.name ?? 'klub');

function addOffer(game, p, o, date, out) {
  const P = ensurePre(game);
  const offer = { id: `pre-${date}-${p.id}-${o.to ?? 'z'}`, pid: p.id, to: o.to ?? null, foreign: o.foreign ?? null, wage: o.wage, years: o.years, date, status: 'open' };
  P.offers.push(offer);
  stat(game, o.foreign ? 'preOffersForeign' : 'preOffers');
  if (p.clubId === game.clubId) {
    out.push(createMessage({ date, key: `pre-pyta:${offer.id}`, category: 'transfers', from: `Agent zawodnika ${p.name}`, priority: 'important',
      subject: `Agent: ${buyerLabel(offer)} pyta o ${p.name}`,
      body: `Zgodnie z przepisami informujemy, że ${buyerLabel(offer)} rozmawia z ${p.name} o umowie od 1 lipca. Kontrakt zawodnika kończy się ${fmtDate(p.contract.until)}, więc może podpisać umowę z innym klubem bez kwoty odstępnego. Jeśli chcesz go zatrzymać, zaproponuj przedłużenie (Transfery, Kontrakty).`,
      refs: { kind: 'preInfo', pid: p.id } }));
  }
  return offer;
}

/** Braki klubu na przyszły sezon: grupy pozycji z liczbą zawodników z kontraktem po Jun 30 poniżej celu. */
export function nextSeasonNeeds(game, clubId, preByClub = null) {
  const n = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of squadOf(game.world, clubId)) if (!p.loan && p.contract?.until > SEASON_END && !p.preContract) n[groupOf(p)]++;
  // preByClub: zawodnicy z prekontraktem według klubu (aiPreProposals liczy raz zamiast skanu wszystkich dla każdego klubu)
  for (const p of preByClub ? (preByClub.get(clubId) ?? []) : Object.values(game.world.players)) if (p.preContract?.club === clubId) n[groupOf(p)]++;
  return Object.keys(n).map((g) => ({ g, missing: SQUAD_TARGETS[g].target - n[g] })).filter((x) => x.missing > 0).sort((a, b) => b.missing - a.missing);
}

/** 1. dnia miesiąca (Jan-May): każdy klub AI z brakami na przyszły sezon składa najwyżej jedną propozycję. */
export function aiPreProposals(game, date) {
  const P = ensurePre(game);
  const out = [];
  const W = game.world;
  // Kandydaci: zawodnicy z kontraktem do końca sezonu, z którymi wolno rozmawiać
  const pool = [];
  for (const c of CLUBS_PL) {
    if (!W.clubs[c.id] || c.tier > 4) continue;
    for (const p of squadOf(W, c.id)) if (canApproach(p, date) && !hasOpenDeal(game, p.id) && !p.transfer) pool.push(p);
  }
  const offered = new Set(P.offers.filter((o) => o.status === 'open').map((o) => `${o.pid}:${o.to}`));
  const openCount = new Map();
  for (const o of P.offers) if (o.status === 'open') openCount.set(o.pid, (openCount.get(o.pid) ?? 0) + 1);
  const rng = new Rng(`prekontrakt-ai:${game.seed}:${date}`);
  // Prekontrakty według klubu (pętla niżej ich nie zmienia: addOffer składa tylko propozycje)
  const preByClub = new Map();
  for (const p of Object.values(W.players)) {
    const cl = p.preContract?.club;
    if (cl == null) continue;
    if (!preByClub.has(cl)) preByClub.set(cl, []);
    preByClub.get(cl).push(p);
  }
  for (const c of rng.shuffle(CLUBS_PL.filter((x) => isAi(game, x.id) && x.tier <= 4))) {
    const need = nextSeasonNeeds(game, c.id, preByClub)[0];
    if (!need) continue;
    const rep = clubReputation(c);
    const cands = pool.filter((p) => p.clubId !== c.id && groupOf(p) === need.g && !offered.has(`${p.id}:${c.id}`) && (openCount.get(p.id) ?? 0) < 2 && clubById(p.clubId)?.parent !== c.id && c.parent !== p.clubId
      && p.ovr >= c.L - 1.2 && p.ovr <= c.L + 1.2 && (p.rep ?? 30) <= rep + 15 && p.age <= 33)
      .sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id));
    for (const p of rng.shuffle(cands.slice(0, 4))) { // kilku kandydatów: kluby nie biją się wszystkie o tego samego
      if (playerWillingness(game, p, c.id).verdict === 'odmowa') continue;
      const caps = boardCaps(game, c.id, p, 'sign');
      const wage = Math.min(caps.wage, round(Math.max(marketWage(p.ovr, c.tier, false, payLevel(c)), (p.contract?.wage ?? 0) * 1.1), 100));
      if (wage < (p.contract?.wage ?? 0) * 0.8) continue;
      addOffer(game, p, { to: c.id, wage, years: Math.min(caps.years, p.age <= 25 ? 3 : 2) }, date, out);
      offered.add(`${p.id}:${c.id}`);
      openCount.set(p.id, (openCount.get(p.id) ?? 0) + 1);
      break;
    }
  }
  // Kluby zagraniczne: zawodnicy z reputacją >= 45
  for (const p of pool) {
    if ((p.rep ?? 0) < PRE.foreignRep || !foreignTarget(p)) continue;
    const r = new Rng(`prekontrakt-z:${game.seed}:${p.id}:${date}`);
    if (!r.chance(PRE.pForeign)) continue;
    const b = pickBuyer(r, p);
    const wage = round((p.contract?.wage ?? 3000) * (1.4 + r.next() * 1.1), 100);
    addOffer(game, p, { to: null, foreign: { country: b.country, countryName: b.countryName, name: b.name, clubId: b.clubId, rep: b.rep, repU: b.repU, L: b.L }, wage, years: p.age <= 27 ? 3 : 2 }, date, out);
  }
  return out;
}

// ------------------------------------------------------------ Decyzje zawodników
/** Czy klub AI zaproponuje przedłużenie (te same kryteria co aiRenewals w transfers.js: 18 najlepszych, do 33 lat). */
function aiWouldRenew(game, p) {
  if (p.age >= 34) return false;
  const cutoff = [...squadOf(game.world, p.clubId)].sort((a, b) => b.ovr - a.ovr)[17]?.ovr ?? 0;
  return p.ovr >= cutoff - 0.3;
}

/** Poniedziałki Jan-Jun: zawodnik porównuje oferty (z ofertą własnego klubu) i podpisuje najlepszą powyżej progu. */
export function preDecisions(game, date) {
  const P = ensurePre(game);
  const out = [];
  const byPid = new Map();
  for (const o of P.offers) {
    if (o.status !== 'open') continue;
    if (addDays(o.date, PRE.offerWeeks * 7) < date) { o.status = 'expired'; continue; }
    if (!byPid.has(o.pid)) byPid.set(o.pid, []);
    byPid.get(o.pid).push(o);
  }
  for (const [pid, offers] of byPid) {
    const p = game.world.players[pid];
    if (!p || !canApproach(p, date) || hasOpenDeal(game, pid)) { for (const o of offers) o.status = 'expired'; continue; }
    const rng = new Rng(`prekontrakt:${game.seed}:${pid}:${date}`);
    const trust = relationWith(p, p.clubId).trust;
    // Oferta własnego klubu: gracz może przedłużyć w każdej chwili; klub AI przedłuża tylko ważnych (aiRenewals),
    // pozostali zawodnicy AI nie mają propozycji pozostania
    const ownOffer = !p.renewRefused && (p.clubId === game.clubId || aiWouldRenew(game, p));
    const own = ownOffer ? offerUtility(p, ownView(game, p), { trust, noise: rng.gauss(0, 0.08) }) : -Infinity;
    let best = null; let bestU = -Infinity;
    // Pierwszeństwo oferty: najwcześniej złożona z kilku (klocek „first”, offerFactors.js)
    const earliest = offers.length > 1 ? offers.reduce((a, b) => (b.date < a.date ? b : a)) : null;
    for (const o of offers) {
      if (o.to && (!game.world.clubs[o.to] || !(clubById(o.to)?.tier <= 4))) { o.status = 'expired'; continue; }
      const u = offerUtility(p, offerView(game, o, o === earliest && offers.some((x) => x.date > o.date)), { noise: rng.gauss(0, 0.08) });
      o.u = Math.round(u * 100) / 100;
      if (u > bestU) { best = o; bestU = u; }
    }
    if (!best) continue;
    const T = signThreshold(date, p.stepDown ?? 0);
    if (bestU >= T && bestU > own) { signPre(game, p, best, date, out); continue; }
    // Ostatnia szansa dla gracza: zawodnik poważnie rozmawia z innym klubem
    const key = `${pid}:${best.id}`;
    if (p.clubId === game.clubId && bestU >= T - PRE.warnGap && !P.warned[key]) {
      P.warned[key] = date;
      out.push(createMessage({ date, key: `pre-rozmawia:${key}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'important',
        subject: `${p.name} rozmawia z ${buyerLabel(best)}`,
        body: `${p.name} jest bliski porozumienia z ${buyerLabel(best)} w sprawie umowy od 1 lipca. To ostatnia szansa na przedłużenie kontraktu.`, refs: { kind: 'preInfo', pid } }));
    }
  }
  return out;
}

/** Podpisanie prekontraktu przez zawodnika. */
export function signPre(game, p, o, date, out = []) {
  const P = ensurePre(game);
  const start = preStart();
  const sy = SEASON_YEAR + 1;
  const contract = { wage: o.wage, until: `${sy + o.years}-06-30`, years: o.years, signed: date, clause: 0, signOn: o.signOn ?? 0, agentFee: o.agentFee ?? round(0.07 * o.wage * 52, 1000) };
  p.preContract = { club: o.to ?? null, foreign: o.foreign ?? null, start, signedOn: date, contract };
  o.status = 'signed';
  for (const x of P.offers) if (x.pid === p.id && x.status === 'open') x.status = 'rejected';
  stat(game, 'pre');
  const ek = clubById(p.clubId)?.tier === 1 || clubById(o.to)?.tier === 1; // prekontrakt „w Ekstraklasie”: sprzedający albo kupujący
  if (ek) stat(game, 'preEk');
  if (o.foreign) { stat(game, 'preForeign'); if (ek) stat(game, 'preForeignEk'); }
  if (p.clubId === game.clubId) {
    out.push(createMessage({ date, key: `pre-podpisal:${p.id}:${date}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'important',
      subject: `${p.name} podpisał umowę z ${buyerLabel(o)} od ${fmtDate(start)}`,
      body: `${p.name} odejdzie ${fmtDate(start)} bez kwoty odstępnego. Do końca sezonu jest naszym zawodnikiem. Zimą możemy go sprzedać wcześniej tylko do ${buyerLabel(o)}.`, refs: { kind: 'preInfo', pid: p.id } }));
  }
  return p.preContract;
}

/** Prekontrakt gracza po udanych rozmowach (kontrakt z ekranu rozmów). Zwraca { ok, text }. */
export function signUserPre(game, pid, contract, date = game.date) {
  const p = game.world.players[pid];
  const chk = checkUserPre(game, p, date);
  if (!chk.ok) return chk;
  const years = contract.years ?? 2;
  const sy = SEASON_YEAR + 1;
  p.preContract = { club: game.clubId, foreign: null, start: preStart(), signedOn: date, contract: { ...contract, until: `${sy + years}-06-30`, signed: date } };
  for (const x of ensurePre(game).offers) if (x.pid === pid && x.status === 'open') x.status = 'rejected';
  stat(game, 'pre'); stat(game, 'preUser');
  if (clubById(p.clubId)?.tier === 1) stat(game, 'preEk');
  return { ok: true, text: `${p.name} podpisał umowę od ${fmtDate(preStart())}. Do tego dnia gra w ${clubById(p.clubId)?.name ?? 'swoim klubie'}.` };
}

// ------------------------------------------------------------ Wcześniejszy transfer zimą
/** Cena wcześniejszego transferu: wartość x 0,25 x miesiące do końca kontraktu / 6. */
export function earlyPrice(game, p, date = game.date) {
  const months = clamp(monthsBetween(date, p.contract?.until ?? date), 0, 6);
  return round((p.value ?? 0) * PRE.early.factor * months / 6);
}

const needy = (game, clubId, p) => squadOf(game.world, clubId).filter((x) => groupOf(x) === groupOf(p)).length < SQUAD_TARGETS[groupOf(p)].target;

/** Poniedziałki w zimowym oknie: klub z prekontraktem może kupić zawodnika wcześniej. Zwraca wiadomości. */
export function earlySales(game, date) {
  const w = windowOf(date);
  if (!w || Number(date.slice(5, 7)) > 6) return [];
  const out = [];
  for (const p of Object.values(game.world.players)) {
    const pc = p.preContract;
    if (!pc?.club || !p.clubId || pc.club === game.clubId || hasOpenDeal(game, p.id) || !isAi(game, pc.club)) continue;
    if (!new Rng(`prekontrakt-zima:${game.seed}:${p.id}:${date}`).chance(PRE.early.chance) || !needy(game, pc.club, p)) continue;
    if (p.clubId !== game.clubId && breaksMinimum(game, p)) continue;
    const fee = earlyPrice(game, p, date);
    if (spendable(game.finance, pc.club) - pendingFees(game, pc.club) < fee) continue;
    if (p.clubId === game.clubId) {
      if (game.market.offers.some((o) => o.status === 'open' && o.playerId === p.id)) continue;
      const offer = { id: `of-${date}-${p.id}-pre`, kind: 'incoming', playerId: p.id, from: pc.club, fee, status: 'open', date, expires: addDays(date, 6), pre: true };
      game.market.offers.unshift(offer);
      out.push(createMessage({ date, key: `oferta:${offer.id}:${fee}`, category: 'transfers', from: clubById(pc.club).name, priority: 'important',
        subject: `${clubById(pc.club).name} chce ${p.name} już teraz: ${fmtZl(fee)}`,
        body: `${p.name} ma już umowę z ${clubById(pc.club).name} od ${fmtDate(pc.start)}. Klub chce go mieć od razu i proponuje ${fmtZl(fee)} (wartość ${fmtZl(p.value)}). Oferta ważna do ${fmtDate(offer.expires)}.`,
        actions: [{ id: 'accept', label: 'Przyjmij' }, { id: 'reject', label: 'Odrzuć' }], refs: { kind: 'incomingOffer', offerId: offer.id }, optional: true }));
      continue;
    }
    startDeal(game, { playerId: p.id, to: pc.club, fee, contract: { ...pc.contract, signedOn: date }, kind: 'transfer', early: true, date });
  }
  return out;
}

/** Gracz ściąga zimą zawodnika, z którym ma prekontrakt. Zwraca { ok, text }. */
export function earlyBuy(game, pid, date = game.date) {
  const p = game.world.players[pid];
  if (!p?.preContract || p.preContract.club !== game.clubId) return { ok: false, text: 'Nie masz z tym zawodnikiem umowy od 1 lipca.' };
  if (!windowOf(date)) return { ok: false, text: 'Okno transferowe jest zamknięte.' };
  if (hasOpenDeal(game, pid)) return { ok: false, text: 'Transakcja już trwa.' };
  const fee = earlyPrice(game, p, date);
  if (spendable(game.finance, game.clubId) - pendingFees(game, game.clubId) < fee) return { ok: false, text: 'Brakuje pieniędzy w budżecie transferowym.' };
  startDeal(game, { playerId: pid, to: game.clubId, fee, contract: { ...p.preContract.contract, signedOn: date }, kind: 'transfer', early: true, stage: 'medical', date });
  return { ok: true, text: `${clubById(p.clubId)?.name ?? 'Klub'} zgadza się na wcześniejszy transfer za ${fmtZl(fee)}. ${p.name} przechodzi testy medyczne.` };
}

// ------------------------------------------------------------ 1 lipca
/**
 * Rollover: zawodnicy z prekontraktem przechodzą do nowych klubów, zanim wygasną ich kontrakty.
 * Wywoływane w rolloverSeason po ustawieniu lig nowego sezonu. Zwraca listę ruchów gracza (raport).
 */
export function applyPreContracts(game, date) {
  const W = game.world;
  const report = { in: [], out: [] };
  for (const p of Object.values(W.players)) {
    const pc = p.preContract;
    if (!pc) continue;
    delete p.preContract;
    const from = p.clubId;
    if (pc.foreign) {
      if (!from) continue;
      const e = completeAbroad(game, { pid: p.id, foreign: pc.foreign, fee: 0 }, date);
      e.kind = 'pre';
      if (from === game.clubId) report.out.push(`${p.name} (${pc.foreign.name})`);
      continue;
    }
    const to = pc.club;
    if (!W.clubs[to] || (clubById(to)?.tier ?? 9) > 4) continue; // klub spadł do IV ligi: umowa nieważna
    spellsOf(p);
    if (from && W.clubs[from]) W.clubs[from].squad = W.clubs[from].squad.filter((id) => id !== p.id);
    if (!from) game.market.free = game.market.free.filter((id) => id !== p.id);
    W.clubs[to].squad.push(p.id);
    p.clubId = to; p.free = false; p.squad = 'A'; p.lastMove = date;
    p.contract = { ...pc.contract, signedOn: date, promise: { role: 'rotacja', since: date, strikes: 0, kept: 0, broken: false } };
    p.wage = p.contract.wage;
    delete p.askWage; delete p.moveWish; p.transferRequest = false; p.unhappy = false; p.renewRefused = false;
    syncSpell(p, date);
    const F = game.finance;
    if (pc.contract.signOn) book(F, to, date, 'out', 'signOn', pc.contract.signOn, `${p.name}: premia za podpis`);
    if (pc.contract.agentFee) book(F, to, date, 'out', 'agents', pc.contract.agentFee, `${p.name}: prowizja agenta`);
    game.market.history.unshift({ date, playerId: p.id, name: p.name, pos: p.pos, from, to, fee: 0, kind: 'pre' });
    p.career = [...(p.career ?? []), { date, from, to, fee: 0, kind: 'pre' }];
    if (to === game.clubId) report.in.push(`${p.name} (${p.pos})`);
    else if (from === game.clubId) report.out.push(`${p.name} (${clubById(to)?.name ?? ''})`);
  }
  ensurePre(game).offers = [];
  game.market.pre.warned = {};
  return report;
}
