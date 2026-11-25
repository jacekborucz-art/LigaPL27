// Oferty klub-klub (docs/transfery.md, rozdz. „Oferty klub-klub”). Zapytanie o cenę w każdej chwili, odpowiedź zarządu
// klubu sprzedającego od razu i bez ponownego losowania (ziarno: gra, klub, zawodnik, okres): „nie na sprzedaż”
// (indeks istotności I >= 60) albo cena wywoławcza 1,05-1,25 x cena minimalna Res i preferencje klubu.
// Oferta gracza to pakiet: kwota stała, 2-3 raty, premie warunkowe (występy, awans, puchary europejskie), procent od
// następnej sprzedaży i termin przejścia (teraz, najbliższe okno, następny sezon). Klub rozważa ofertę 3-7 dni (data
// ukryta), odpowiedź z r = E / Res: zgoda, kontroferta, odrzucenie albo zerwanie rozmów. Zgoda klubów to porozumienie
// warunkowe: 14 dni na warunki osobiste z zawodnikiem (FIFA RSTP art. 18.3), potem istniejące rozmowy i namysł
// zawodnika (proposals.js). Kluby AI: ta sama funkcja resolveClubOffer w krótkiej pętli 3-4 rund w dniu odpowiedzi.
// Stan: game.market.cOffers (oferty gracza i klubów AI), game.market.inq (odpowiedzi na zapytania, 30 dni),
// game.market.instal (raty), game.market.bonuses (premie warunkowe), p.sellOn (procent od następnej sprzedaży).
// game.market.talks zostaje lustrem dla starszego kodu (accepted, counter, until). Wszystkie liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { createMessage, addMessages } from '../core/inbox.js';
import { addDays } from '../core/gameLoop.js';
import { clubById } from '../data/clubs_pl.js';
import { DOMESTIC, SEASON_END } from '../config/calendar2026.js';
import { marketValue } from '../world/playerGen.js';
import { squadOf } from '../world/worldGen.js';
import { GROUP, SQUAD_TARGETS, SQUAD_SIZE } from './squad.js';
import { askingPriceMultiplier, clubReputation } from './reputation.js';
import { book, spendable, wageBill } from './finance.js';
import { standings } from '../season/standings.js';
import { compOfClub, compClubIds } from '../season/leagueComps.js';
import { ownerOf } from './owners.js';
import { clubNegotiation } from './clubNegotiation.js';
import { rynMul, directorObjection, objectionText } from './director.js';
import { askingPrice, recentlyMoved, fmtZl, aiAfterAgreement } from './transfers.js';
import { hasOpenDeal, dealOf, pendingFees, stat } from './transferDeals.js';
import { userProposal, proposalsFor } from './proposals.js';
import { checkUserFee } from './boardRequests.js';
import { canSign } from './squadLimit.js';
import { onOfferRejected } from './moveWish.js';
import { personalityOf } from './personality.js';
import { canApproach } from './preContracts.js';
import { nextWindowOpen } from './wishMemory.js';
import { isPoolContracted } from './foreignPool.js';
import { fmtDate } from '../ui/dom.js';

export const CO = {
  // Indeks istotności I: miejsce w kadrze wg OVR, minuty, wychowanek, świeżo kupiony, brak zastępcy, cel, okres, właściciel
  rank: [40, 30, 20, 8, 8, 8], minutes: [[0.75, 15], [0.5, 7]], homegrown: 10, homegrownAge: 23, fresh: [240, 10],
  noRepl: 15, goal: 15, midSeason: 10, midRounds: 10, owner: { amb: 15, wealth: 15, pts: 5 },
  nfsI: 60, highI: 40, highMul: 1.25, // I >= 60 nie na sprzedaż, 40-60 tylko za bardzo dobrą cenę (Res x 1,25)
  exc: { mul: 2.2, p: 0.25, poor: 0.02 }, // nie na sprzedaż: oferta >= 2,2 x Res otwiera rozmowę z p = 25 % (+2 pp za punkt zasobności poniżej 10)
  // Res = V x rola x cel x zastępca x finanse x kupujący x okres x reputacja x błąd dyrektora (RYN)
  role: { key: 1.45, starter: 1.25, rotation: 1.05, reserve: 0.85, listed: 1.08, release: 0.4, homegrown: 0.1 },
  goalK: [1.15, 1.25], repl: { none: 1.3, has: 0.95 }, fin: { tight: 0.9, crisis: 0.8, rich: 1.08 },
  buyer: { rival: 1.2, rivalPlaces: 4, ekstra: 1.08, abroad: 0.97 }, period: { lastDays: 3, late: 1.1, surplus: 0.92 },
  floor: 0.55, floorShort: 0.25, shortCap: 0.6, shortMonths: 6, noise: 0.04, contest: 0.03, anchor: [1.05, 1.25],
  // Odpowiedź klubu: r = E / Res_eff
  accept: 1, grey: [0.97, 0.35], counter: 0.82, reject: 0.65, low: [[0.4, 60, 90], [0.65, 21, 45]], threeLow: [14, 30],
  c1: [0.45, 0.25], c2: 0.8, // kontroferta k: A_k = Res x (1 + (A0 / Res - 1) x (1 - c_k)), c_1 = 0,45 - 0,25 (q - 0,47), c_2 = 0,80
  think: { base: 3, owner: 1, obvious: -1, ownerFee: 1.5, lastDays: 4 }, // 3 + U(0..2) + U(0..2) dni
  userRounds: 3, clubCounters: 2, respondDays: 5, maxActive: 5, talkDays: 14, inqDays: 30, resetDays: 30, keepDays: 90,
  // Pakiet: raty (miesiące, część kwoty), dyskonto δ(t) i ryzyko kupującego ρ, premie x 0,6 wartości oczekiwanej, sell-on
  inst: { 1: [[0, 1]], 2: [[0, 0.6], [12, 0.4]], 3: [[0, 0.5], [12, 0.25], [24, 0.25]] },
  delta: [[0, 1], [6, 0.96], [12, 0.92], [24, 0.85]], risk: { thin: 0.03, crisis: 0.08 },
  bonusW: 0.6, appsN: 25, bonusDays: 730,
  sellOn: { min: 5, max: 30, g: [[21, 1.6], [24, 1.3], [27, 1], [30, 0.55], [99, 0.2]], pi: [[21, 0.6], [24, 0.6], [27, 0.5], [30, 0.35], [99, 0.1]], w: 0.8 },
  wish: { p: 0.25, days: 60, fairV: 1, overV: 1.25, shortMonths: 18, shortMul: 1.3 }, // prośba o odejście po odrzuconej uczciwej ofercie
  // Między porozumieniem a rejestracją (transferDeals.js, etap „Porozumienie klubów” z datą rejestracji)
  pre: { injuryDays: 42, cut: 0.15, perMonth: 0.1, maxCut: 0.5, sellerOk: 0.5, valueJump: 0.25, sellerReopen: 0.35, buyerReopen: 0.6, mind: 0.05, mindLong: 0.08, longDays: 60, moneyDays: 7 },
  ai: { rounds: 4, open: [0.85, 0.95], raise: 1.12, stretch: 1.25 }, // klub AI: pierwsza oferta 85-95 %, podbicie 12 %, zapas wyceny x1,25 (transfers.js aiMaxPay)
};

const round = (x, step = 10000) => Math.max(0, Math.round(x / step) * step);
const ceilTo = (x, step = 10000) => Math.max(0, Math.ceil(x / step) * step);
const groupOf = (p) => GROUP[p.pos] ?? 'MID';
const clubName = (id) => clubById(id)?.name ?? 'klub';
const dayNo = (date) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 864e5);
const daysBetween = (a, b) => dayNo(b) - dayNo(a);
const windowOn = (date) => (DOMESTIC.transferWindows ?? []).find((w) => date >= w.from && date <= w.to) ?? null;
const lerp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return pts.at(-1)[1];
};
const stepOf = (pts, age) => pts.find(([a]) => age <= a)?.[1] ?? pts.at(-1)[1];
const OPEN = new Set(['thinking', 'counter', 'agreed']);
const isAiClub = (game, id) => !!id && id !== game.clubId && !!game.world?.clubs?.[id];

/** Miesiące do końca kontraktu (0 bez kontraktu). */
export function monthsLeftOf(p, date) {
  const u = p?.contract?.until;
  if (!u) return 0;
  return Math.max(0, (Number(u.slice(0, 4)) - Number(date.slice(0, 4))) * 12 + Number(u.slice(5, 7)) - Number(date.slice(5, 7)));
}

/**
 * Klauzula odstępnego z kontraktu: liczba (zapis z rozmów) albo obiekt { amount, foreignOnly } (oferta z ekranu rozmów).
 * Klauzula tylko dla klubów zagranicznych nie dotyczy polskiego kupca (foreign = false). Zwraca kwotę albo 0.
 */
export function clauseAmount(contract, { foreign = false } = {}) {
  const c = contract?.clause;
  if (!c) return 0;
  const amount = typeof c === 'object' ? Number(c.amount) || 0 : Number(c) || 0;
  const only = typeof c === 'object' ? !!c.foreignOnly : !!contract.clauseForeignOnly;
  return only && !foreign ? 0 : Math.max(0, amount);
}

// ------------------------------------------------------------ Stan
export function ensureClubOffers(game) {
  const M = game.market;
  if (!M) return [];
  if (!Array.isArray(M.cOffers)) M.cOffers = [];
  M.coSeq ??= 0;
  M.inq ??= {};
  if (!Array.isArray(M.instal)) M.instal = [];
  if (!Array.isArray(M.bonuses)) M.bonuses = [];
  if (!M.coMigrated) migrateTalks(game);
  return M.cOffers;
}

/** Stary zapis: rozmowy z market.talks (accepted, counter, until) jako oferty gracza w nowym stanie. */
function migrateTalks(game) {
  const M = game.market;
  M.coMigrated = true;
  const date = game.date ?? '2026-07-01';
  for (const [pid, t] of Object.entries(M.talks ?? {})) {
    const p = game.world?.players?.[pid];
    if (!p || !t || !isAiClub(game, p.clubId) || isPoolContracted(p) || userOffer(game, pid)) continue;
    const base = { pid, name: p.name, seller: p.clubId, buyer: game.clubId, user: true, round: Math.max(1, t.rounds ?? 1), counters: t.counter ? 1 : 0, date, mode: 'now', regDate: null, log: [] };
    if (t.accepted) addRec(game, { ...base, status: 'agreed', fee: t.accepted, pkg: { fee: t.accepted, inst: 1, bonus: {}, sellOn: 0 }, talkUntil: addDays(date, CO.talkDays) });
    else if (t.until && t.until > date) addRec(game, { ...base, status: 'broken', until: t.until, pkg: { fee: 0, inst: 1, bonus: {}, sellOn: 0 } });
    else if (t.counter) addRec(game, { ...base, status: 'counter', pkg: { fee: Math.round(t.counter * 0.9), inst: 1, bonus: {}, sellOn: 0 }, counter: { fee: t.counter }, respondBy: addDays(date, CO.respondDays) });
  }
}

function addRec(game, r) {
  const M = game.market;
  const rec = { id: `co${++M.coSeq}-${r.pid}`, ...r };
  M.cOffers.push(rec);
  return rec;
}

/** Oferta gracza dla zawodnika (ostatnia rozmowa z klubem) albo null. */
export const userOffer = (game, pid) => (game.market?.cOffers ?? []).find((r) => r.user && r.pid === pid && r.buyer === game.clubId) ?? null;
/** Aktywne oferty gracza (klub rozważa, kontroferta, porozumienie). */
export const activeUserOffers = (game) => (game.market?.cOffers ?? []).filter((r) => r.user && r.buyer === game.clubId && OPEN.has(r.status));
/** Porozumienie klubów gracza w sprawie zawodnika (ważne okno rozmów z zawodnikiem) albo null. */
export function agreementOf(game, pid, date = game.date) {
  const r = userOffer(game, pid);
  return r && r.status === 'agreed' && (r.talkUntil ?? date) >= date ? r : null;
}
/** Czy rozmowy z klubem o tym zawodniku są wstrzymane (zerwanie po niskiej ofercie). */
export function talksBroken(game, pid, date = game.date) {
  const r = userOffer(game, pid);
  return !!(r && r.status === 'broken' && r.until > date);
}

/** Słownie, jak długo klub nie chce rozmawiać (bez dokładnej daty). */
export function breakWords(days) {
  return days <= 10 ? 'kilka dni' : days <= 45 ? 'kilka tygodni' : 'najbliższe miesiące';
}

/** Lustro w market.talks dla starszego kodu (karta, menu, pula zagraniczna, skauci). */
function syncTalk(game, rec) {
  const T = (game.market.talks ??= {});
  if (rec.status === 'agreed') T[rec.pid] = { rounds: rec.round, accepted: rec.fee, date: rec.date, co: rec.id };
  else if (rec.status === 'counter') T[rec.pid] = { rounds: rec.round, counter: rec.counter?.fee, date: rec.date, co: rec.id };
  else if (rec.status === 'broken') T[rec.pid] = { rounds: 0, until: rec.until, date: rec.date, co: rec.id };
  else if (rec.status === 'thinking') T[rec.pid] = { rounds: rec.round, date: rec.date, co: rec.id };
  else if (T[rec.pid]?.co === rec.id) delete T[rec.pid];
}

// ------------------------------------------------------------ Kontekst klubu (liczony raz w tygodniu)
const CTX = new WeakMap(); // game -> { wk, clubs: Map, tables: Map }
function weekCache(game, date) {
  const wk = Math.floor(dayNo(date) / 7);
  let c = CTX.get(game);
  if (!c || c.wk !== wk) { c = { wk, clubs: new Map(), tables: new Map() }; CTX.set(game, c); }
  return c;
}
/** Kasuje pamięć tygodnia (testy, edytor). */
export function clearClubOfferCache(game) { CTX.delete(game); }

function tableOf(game, comp, cache) {
  if (!comp) return null;
  if (!cache.tables.has(comp)) cache.tables.set(comp, standings((game.fixtures ?? []).filter((f) => f.comp === comp), compClubIds(comp)));
  return cache.tables.get(comp);
}

/** Pozycja i sytuacja klubu w tabeli: { pos, size, played, fight, mid }. */
function tableInfo(game, clubId, cache) {
  const club = clubById(clubId);
  const t = tableOf(game, compOfClub(club), cache);
  const i = t ? t.findIndex((r) => r.id === clubId) : -1;
  if (i < 0) return { pos: null, size: 0, played: 0, fight: false, mid: false, table: t };
  const row = t[i]; const size = t.length;
  let fight = false;
  if (row.played >= 5) {
    const top = t[Math.min(size - 1, (club?.tier ?? 1) === 4 ? 0 : 2)]; // walka o puchary albo awans: do 6 pkt od 3. miejsca (III liga: od 1.)
    const rel = Math.max(0, size - 3); // pierwsze miejsce spadkowe
    fight = row.points >= top.points - 6 || (i <= rel && row.points - (t[rel]?.points ?? 0) <= 4) || i > rel;
  }
  const mid = row.played >= 1 && (size - 1) * 2 - row.played >= CO.midRounds;
  return { pos: i + 1, size, played: row.played, fight, mid, table: t };
}

/** Kontekst klubu sprzedającego: kadra, miejsca, minuty, tabela, właściciel, finanse; info o zawodnikach. */
function clubCtx(game, clubId, date) {
  const cache = weekCache(game, date);
  if (cache.clubs.has(clubId)) return cache.clubs.get(clubId);
  const squad = squadOf(game.world, clubId).filter(Boolean).sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id));
  const maxMin = Math.max(0, ...squad.map((p) => p.season?.min ?? 0));
  const tab = tableInfo(game, clubId, cache);
  const own = ownerOf(game, clubId) ?? {};
  const avail = squad.filter((x) => !x.transfer);
  const groupN = {};
  for (const x of avail) groupN[groupOf(x)] = (groupN[groupOf(x)] ?? 0) + 1;
  const info = new Map();
  squad.forEach((p, r) => {
    const g = groupOf(p);
    const hist = p.history?.at(-1);
    const share = maxMin >= 450 ? (p.season?.min ?? 0) / maxMin : hist && hist.c === clubId ? clamp((hist.apps ?? 0) / 30, 0, 1) : r < 11 ? 0.8 : r < 16 ? 0.4 : 0.1;
    const peers = squad.filter((x) => x !== p && !x.transfer && groupOf(x) === g);
    const breaks = (groupN[g] ?? 0) - (p.transfer ? 0 : 1) < SQUAD_TARGETS[g].min || avail.length - (p.transfer ? 0 : 1) < SQUAD_SIZE.min;
    const noRepl = breaks || !peers.some((x) => x.ovr >= p.ovr - 1);
    const hasRepl = peers.some((x) => x.ovr >= p.ovr - 0.5);
    const homegrown = !p.lastMove && (p.age ?? 99) <= CO.homegrownAge;
    const fresh = !!p.lastMove && daysBetween(p.lastMove, date) < CO.fresh[0];
    let I = CO.rank[r] ?? 0;
    I += CO.minutes.find(([s]) => share >= s)?.[1] ?? 0;
    if (homegrown) I += CO.homegrown;
    if (fresh) I += CO.fresh[1];
    if (noRepl) I += CO.noRepl;
    if (tab.fight) I += CO.goal;
    if (tab.mid) I += CO.midSeason;
    if ((own.ambicja ?? 10) >= CO.owner.amb && tab.pos && tab.pos <= 3) I += CO.owner.pts;
    if ((own.zasobnosc ?? 10) >= CO.owner.wealth) I += CO.owner.pts;
    info.set(p.id, { r, share, starter: share >= 0.5 || r < 11, rotation: share >= 0.2 || r < 18, noRepl, hasRepl, homegrown, fresh, I });
  });
  const c = { squad, tab, own, info, size: squad.length, bill: null };
  cache.clubs.set(clubId, c);
  return c;
}

/** Indeks istotności zawodnika w klubie AI (0 dla innych). Liczony raz w tygodniu na klub. */
export function importance(game, p, date = game.date) {
  if (!p || !isAiClub(game, p.clubId)) return 0;
  return clubCtx(game, p.clubId, date).info.get(p.id)?.I ?? 0;
}

/** Nie na sprzedaż: indeks istotności I >= 60 (bez listy transferowej). Klauzulę sprawdza wywołujący. */
export function notForSaleI(game, p, date = game.date) {
  if (!p || !isAiClub(game, p.clubId) || game.market?.listed?.[p.id]) return false;
  return importance(game, p, date) >= CO.nfsI;
}

// ------------------------------------------------------------ Cena minimalna Res i cena wywoławcza A0
function finK(game, clubId) {
  const c = game.finance?.clubs?.[clubId];
  if (!c) return 1;
  if (c.balance < 0) return CO.fin.crisis;
  if (wageBill(game.world, clubId) > c.wageBudget || c.balance < c.wageBudget * 8) return CO.fin.tight;
  return (ownerOf(game, clubId)?.zasobnosc ?? 10) >= CO.owner.wealth ? CO.fin.rich : 1;
}

function buyerK(game, sellerId, buyerId, tab) {
  if (!buyerId || !clubById(buyerId)) return CO.buyer.abroad;
  const s = clubById(sellerId); const b = clubById(buyerId);
  if (s && b && compOfClub(s) === compOfClub(b) && tab.table) {
    const bi = tab.table.findIndex((r) => r.id === buyerId);
    if (bi >= 0 && tab.pos && Math.abs(bi + 1 - tab.pos) <= CO.buyer.rivalPlaces) return CO.buyer.rival;
  }
  return b.tier === 1 ? CO.buyer.ekstra : 1;
}

/**
 * Cena minimalna klubu sprzedającego (bez szumu) i cena wywoławcza. Zwraca { res, A0, V, I, N, listed }.
 * buyerId: klub kupujący (null: zagranica).
 */
export function reservePrice(game, p, buyerId = game.clubId, date = game.date) {
  const seller = p.clubId;
  const cx = clubCtx(game, seller, date);
  const inf = cx.info.get(p.id) ?? { r: 99, starter: false, rotation: false, noRepl: false, hasRepl: false, homegrown: false, I: 0 };
  const tier = clubById(seller)?.tier ?? 1;
  const V = marketValue(p, { tier, date });
  const listed = game.market?.listed?.[p.id] ?? null;
  const R = CO.role;
  let role = listed ? (listed.kind === 'release' ? R.release : R.listed) : inf.r < 3 ? R.key : inf.starter ? R.starter : inf.rotation ? R.rotation : R.reserve;
  if (!listed && inf.homegrown) role += R.homegrown;
  const goal = !listed && cx.tab.fight ? (inf.r < 3 ? CO.goalK[1] : CO.goalK[0]) : 1;
  const repl = inf.noRepl ? CO.repl.none : inf.hasRepl ? CO.repl.has : 1;
  const w = windowOn(date);
  const late = w && daysBetween(date, w.to) < CO.period.lastDays;
  const period = late ? (inf.noRepl ? CO.period.late : cx.size > 26 ? CO.period.surplus : 1) : 1;
  let res = V * role * goal * repl * finK(game, seller) * buyerK(game, seller, buyerId, cx.tab) * period * askingPriceMultiplier(p.rep ?? 30) * rynMul(game, seller, p.id, 'cena');
  const short = monthsLeftOf(p, date) < CO.shortMonths;
  if (short) res = Math.min(res, CO.shortCap * V);
  res = Math.max(res, (short ? CO.floorShort : CO.floor) * V);
  if (!listed && inf.r >= 3 && inf.I >= CO.highI && inf.I < CO.nfsI) res *= CO.highMul; // tylko za bardzo dobrą cenę (kluczowy ma już x1,45)
  const N = clubNegotiation(game, seller);
  let A0 = res * clamp(1.1 + 0.01 * (12 - N), CO.anchor[0], CO.anchor[1]);
  if (listed) { A0 = askingPrice(game, p); res = Math.max(Math.min(res, A0 / CO.anchor[0]), (short ? CO.floorShort : CO.floor) * V * (listed.kind === 'release' ? 0.5 : 1)); }
  return { res: Math.round(res), A0: round(A0), V, I: inf.I, N, listed: !!listed };
}

// ------------------------------------------------------------ Pakiet
/** Pakiet z danych formularza: { fee, inst (1-3), bonus: { apps, promo, euro }, sellOn (%), when }. */
export function normPkg(x = {}) {
  const n = (v) => Math.max(0, Math.round(Number(v) || 0));
  const inst = [1, 2, 3].includes(Number(x.inst)) ? Number(x.inst) : 1;
  const b = x.bonus ?? {};
  const bonus = {};
  for (const k of ['apps', 'promo', 'euro']) if (n(b[k]) > 0) bonus[k] = round(n(b[k]), 5000);
  const so = n(x.sellOn);
  return { fee: n(x.fee), inst, bonus, sellOn: so ? clamp(so, CO.sellOn.min, CO.sellOn.max) : 0, when: ['now', 'window', 'season'].includes(x.when) ? x.when : null };
}

/** Raty pakietu: [{ m (miesiące od rejestracji), amount }]. Pierwsza płatna przy rejestracji. */
export function scheduleOf(pkg) {
  const plan = CO.inst[pkg.inst] ?? CO.inst[1];
  let left = pkg.fee;
  return plan.map(([m, s], i) => { const a = i === plan.length - 1 ? left : round(pkg.fee * s, 1000); left -= a; return { m, amount: a }; });
}
/** Kwota płatna przy rejestracji (pierwsza rata albo całość). */
export const upfrontOf = (pkg) => (pkg ? scheduleOf(pkg)[0].amount : 0);

function buyerRisk(game, buyerId, fee) {
  const c = game.finance?.clubs?.[buyerId];
  if (!c) return 0;
  return c.balance < 0 ? CO.risk.crisis : c.balance < fee ? CO.risk.thin : 0;
}

/** Szansa spełnienia warunku premii (prognoza sprzedającego). */
function bonusChance(game, kind, p, buyerId, date) {
  const b = clubById(buyerId);
  if (!b) return 0;
  const tab = tableInfo(game, buyerId, weekCache(game, date));
  if (kind === 'apps') {
    const g = groupOf(p);
    const better = squadOf(game.world, buyerId).filter((x) => x && x.id !== p.id && groupOf(x) === g && x.ovr > p.ovr).length;
    const slots = { GK: 1, DEF: 4, MID: 4, ATT: 2 }[g];
    return better < slots ? 0.75 : better < slots * 2 ? 0.35 : 0.1;
  }
  if (kind === 'promo') {
    if (b.tier === 1) return 0;
    if (!tab.pos || tab.played < 5) return 0.2;
    return tab.pos <= 2 ? 0.45 : tab.pos <= tab.size / 2 ? 0.2 : 0.05;
  }
  if (b.tier !== 1) return 0.01;
  if (!tab.pos || tab.played < 5) return clubReputation(b) >= 55 ? 0.4 : 0.15;
  return tab.pos <= 3 ? 0.5 : tab.pos <= 6 ? 0.2 : 0.05;
}

/** Wartość procentu od następnej sprzedaży: s x V x g(wiek) x π(wiek) x 0,8. */
export function sellOnValue(pct, V, age) {
  const S = CO.sellOn;
  return (pct / 100) * V * stepOf(S.g, age) * stepOf(S.pi, age) * S.w;
}

/** Dyskonto raty płatnej za m miesięcy. */
export const deltaOf = (m) => lerp(CO.delta, m);

/**
 * Ekwiwalent gotówki pakietu dla sprzedającego: E = G + raty x δ(t) x (1 - ρ) + premie x P x 0,6 + sell-on.
 * Klub w potrzebie gotówki (finanse <= 0,9) liczy δ do kwadratu. Zwraca { E, G, inst, bonus, so, factor }.
 */
export function packageValue(game, pkg, { p, seller = p?.clubId, buyer = game.clubId, date = game.date, V = null } = {}) {
  const rho = buyerRisk(game, buyer, pkg.fee);
  const need = finK(game, seller) <= CO.fin.tight;
  let G = 0; let inst = 0;
  for (const { m, amount } of scheduleOf(pkg)) {
    if (!m) { G += amount; continue; }
    const d = deltaOf(m);
    inst += amount * (need ? d * d : d) * (1 - rho);
  }
  let bonus = 0;
  for (const [k, a] of Object.entries(pkg.bonus ?? {})) bonus += a * bonusChance(game, k, p, buyer, date) * CO.bonusW;
  const v = V ?? marketValue(p, { tier: clubById(seller)?.tier ?? 1, date });
  const so = pkg.sellOn ? sellOnValue(pkg.sellOn, v, p.age ?? 25) : 0;
  return { E: G + inst + bonus + so, G, inst, bonus, so, factor: pkg.fee ? (G + inst) / pkg.fee : 1 };
}

/** Kwota stała pakietu o tej samej strukturze, której ekwiwalent to A (kontroferta). */
function feeForValue(game, pkg, A, ctx) {
  const v = packageValue(game, pkg, ctx);
  return ceilTo((A - v.bonus - v.so) / Math.max(0.5, v.factor));
}

// ------------------------------------------------------------ Decyzja klubu
const periodKey = (date) => windowOn(date)?.from ?? `po-${nextWindowOpen(date)}`;

/** Ile ofert (gracza i klubów AI) jest teraz u klubu za tego zawodnika. */
function contestN(game, pid) {
  return (game.market?.cOffers ?? []).filter((r) => r.pid === pid && r.status === 'thinking').length;
}

/** Szansa wyjątku od „nie na sprzedaż” przy ofercie >= 2,2 x Res: 25 % (+2 pp za punkt zasobności właściciela poniżej 10). */
export function nfsExceptionChance(game, sellerId) {
  return clamp(CO.exc.p + CO.exc.poor * Math.max(0, 10 - (ownerOf(game, sellerId)?.zasobnosc ?? 10)), 0, 0.9);
}

/**
 * Odpowiedź klubu sprzedającego na pakiet (gracz i kluby AI, bez skutków). opts: { p, buyer, pkg, round, counters,
 * date, rng (szum Res), rngExc (wyjątek od „nie na sprzedaż”) }. Zwraca { verdict: 'accept'|'counter'|'reject'|'lowball'
 * |'nfs', r, res, resEff, A0, E, V, counterFee?, breakDays?, reason? }.
 */
export function resolveClubOffer(game, { p, buyer = game.clubId, pkg, round: rnd = 1, counters = 0, date = game.date, rng = null, rngExc = null }) {
  const seller = p.clubId;
  const R = reservePrice(game, p, buyer, date);
  const res = R.res * (1 + CO.contest * Math.max(0, contestN(game, p.id) - 1));
  const noise = rng ?? new Rng(`klub-oferta:${game.seed}:${seller}:${p.id}:${buyer ?? 'zagr'}:${rnd}:${periodKey(date)}`);
  const resEff = res * Math.exp(noise.gauss(0, CO.noise));
  const ctx = { p, seller, buyer, date, V: R.V };
  const val = packageValue(game, pkg, ctx);
  const out = { r: val.E / resEff, res: Math.round(res), resEff: Math.round(resEff), A0: Math.max(R.A0, round(res * CO.anchor[0])), E: Math.round(val.E), V: R.V, I: R.I };
  const clause = clauseAmount(p.contract, { foreign: !clubById(buyer) });
  if (clause && pkg.inst === 1 && pkg.fee >= clause) return { ...out, verdict: 'accept', reason: 'clause' };
  if (!R.listed && R.I >= CO.nfsI) {
    const exc = rngExc ?? new Rng(`nfs-wyjatek:${game.seed}:${seller}:${p.id}:${periodKey(date)}`);
    if (!(val.E >= CO.exc.mul * res && exc.chance(nfsExceptionChance(game, seller)))) return { ...out, verdict: 'nfs' };
    out.reason = 'exception';
  }
  if (out.r >= CO.accept || (out.r >= CO.grey[0] && noise.chance(CO.grey[1]))) return { ...out, verdict: 'accept' };
  if (out.r >= CO.counter) {
    if (counters >= CO.clubCounters) return { ...out, verdict: 'reject', reason: 'final' };
    const q = (clamp(R.N, 1, 20) - 1) / 19;
    const c = counters === 0 ? CO.c1[0] - CO.c1[1] * (q - 0.47) : CO.c2;
    const A = res * (1 + (out.A0 / res - 1) * (1 - c));
    return { ...out, verdict: 'counter', A: Math.round(A), counterFee: Math.max(pkg.fee + 10000, feeForValue(game, pkg, A, ctx)) };
  }
  if (out.r >= CO.reject) return { ...out, verdict: 'reject' };
  const [lo, hi] = out.r < CO.low[0][0] ? CO.low[0].slice(1) : CO.low[1].slice(1);
  return { ...out, verdict: 'lowball', breakDays: noise.int(lo, hi) };
}

/** Czas namysłu klubu: 3 + U(0..2) + U(0..2) dni (+1 decyzja właściciela, -1 oczywista zgoda, koniec okna krócej). */
export function thinkDays(game, { p, buyer, pkg, round: rnd = 1, date = game.date, now = true }) {
  const rng = new Rng(`klub-namysl:${game.seed}:${p.clubId}:${p.id}:${buyer ?? 'zagr'}:${rnd}:${date}`);
  let d = CO.think.base + rng.int(0, 2) + rng.int(0, 2);
  const R = reservePrice(game, p, buyer, date);
  if (pkg.fee > CO.think.ownerFee * R.V || R.I >= CO.nfsI) d += CO.think.owner;
  if (pkg.fee >= R.A0) d = Math.max(CO.think.base, d + CO.think.obvious);
  const w = now ? windowOn(date) : null;
  if (w && daysBetween(date, w.to) < CO.think.lastDays) d = Math.max(1, Math.min(d, daysBetween(date, w.to)));
  return d;
}

// ------------------------------------------------------------ Zapytanie o cenę
/**
 * Zapytanie gracza o zawodnika klubu AI: odpowiedź od razu, ważna 30 dni (bez ponownego losowania).
 * Zwraca { nfs, ask, prefs: [tekst], clause, pre (kontrakt kończy się w 6 mies.), text } albo { error }.
 */
export function inquire(game, pid, date = game.date) {
  ensureClubOffers(game);
  const p = game.world.players[pid];
  if (!p || !isAiClub(game, p.clubId) || isPoolContracted(p)) return { error: true, text: 'O tego zawodnika nie można zapytać klubu.' };
  const old = game.market.inq[pid];
  if (old && old.seller === p.clubId && daysBetween(old.date, date) < CO.inqDays && old.key === periodKey(date)) return old;
  const R = reservePrice(game, p, game.clubId, date);
  const nfs = notForSaleI(game, p, date);
  const clause = clauseAmount(p.contract);
  const prefs = [];
  if (finK(game, p.clubId) <= CO.fin.tight) prefs.push('woli całą kwotę od razu, bez rat');
  else prefs.push('raty są możliwe, pierwsza przy transferze');
  if ((p.age ?? 30) <= 23 && (p.hidden?.POT ?? p.ovr) - p.ovr >= 2) prefs.push('przyjmie procent od następnej sprzedaży');
  if (R.I >= CO.highI && R.I < CO.nfsI && !R.listed) prefs.push('ważny zawodnik: sprzeda tylko za bardzo dobrą cenę');
  const pre = canApproach(p, date);
  const a = { date, key: periodKey(date), seller: p.clubId, nfs, ask: nfs ? null : R.A0, prefs: nfs ? [] : prefs, clause, pre };
  const seller = clubName(p.clubId);
  a.text = nfs
    ? `${seller}: ${p.name} nie jest na sprzedaż.${clause ? ` Kontrakt ma klauzulę odstępnego ${fmtZl(clause)}.` : ' Ruszyć go może tylko wyjątkowa oferta.'}`
    : `Cena wywoławcza ${seller}: ok. ${fmtZl(R.A0)}. Warunki klubu: ${prefs.join('; ')}.`;
  if (pre) a.text += ` Kontrakt kończy się ${fmtDate(p.contract.until)}: możesz rozmawiać z zawodnikiem bez zgody klubu (umowa od 1 lipca).`;
  game.market.inq[pid] = a;
  stat(game, nfs ? 'coInqNfs' : 'coInq');
  return a;
}
/** Ważna odpowiedź na zapytanie (albo null). */
export function inquiryOf(game, pid, date = game.date) {
  const a = game.market?.inq?.[pid];
  const p = game.world?.players?.[pid];
  if (!a || !p || a.seller !== p.clubId || daysBetween(a.date, date) >= CO.inqDays || a.key !== periodKey(date)) return null;
  return a;
}

// ------------------------------------------------------------ Termin przejścia
/** Data rejestracji dla trybu: 'now' (null, okno otwarte), 'window' (otwarcie najbliższego okna), 'season' (1 lipca). */
export function regDateFor(mode, date) {
  if (mode === 'now') return windowOn(date) ? null : nextWindowOpen(date);
  if (mode === 'season') return `${SEASON_END.slice(0, 4)}-07-01`;
  return nextWindowOpen(date);
}
/** Data rejestracji porozumienia w dniu rozmów z zawodnikiem (null: od razu, okno otwarte). */
export function regDateOf(rec, date) {
  if (!rec) return null;
  if (rec.mode === 'now' || !rec.regDate) return windowOn(date) ? null : nextWindowOpen(date);
  return rec.regDate > date ? rec.regDate : null;
}
export const WHEN_LABELS = { now: 'teraz', window: 'najbliższe okno', season: 'następny sezon' };

/** Opis pakietu dla listów i karty. */
export function pkgText(pkg) {
  const parts = [fmtZl(pkg.fee)];
  if (pkg.inst > 1) parts.push(`w ${pkg.inst} ratach (${scheduleOf(pkg).map((x) => fmtZl(x.amount)).join(' + ')})`);
  const B = pkg.bonus ?? {};
  const bl = [B.apps ? `${fmtZl(B.apps)} za ${CO.appsN} występów` : '', B.promo ? `${fmtZl(B.promo)} za awans` : '', B.euro ? `${fmtZl(B.euro)} za grę w pucharach europejskich` : ''].filter(Boolean);
  if (bl.length) parts.push(`premie: ${bl.join(', ')}`);
  if (pkg.sellOn) parts.push(`${pkg.sellOn} % od następnej sprzedaży`);
  return parts.join(', ');
}
const regText = (rec) => (rec.mode === 'season' ? `Transfer od ${fmtDate(rec.regDate)} (następny sezon).` : rec.mode === 'window' ? `Transfer od ${fmtDate(rec.regDate)} (otwarcie okna).` : 'Transfer od razu po zgodzie zawodnika (w oknie transferowym).');

// ------------------------------------------------------------ Oferta gracza
const letter = (game, rec, kind, subject, body, priority = 'important') => createMessage({
  date: game.date, key: `klub-oferta:${rec.id}:${kind}:${rec.round}:${rec.counters ?? 0}`, category: 'transfers', from: 'Dyrektor sportowy', priority, subject, body,
  refs: { kind: 'clubOffer', pid: rec.pid, coId: rec.id },
});
function mail(game, msgs) { if (msgs.length) game.inbox = addMessages(game.inbox ?? [], msgs).inbox; }

/** Gotówka zarezerwowana w ofertach gracza (klub rozważa, kontroferta, porozumienie) bez propozycji i transakcji. */
export function offerReserve(game, clubId, exceptPid = null) {
  if (clubId !== game.clubId) return 0;
  let s = 0;
  for (const r of game.market?.cOffers ?? []) {
    if (!r.user || r.buyer !== clubId || !OPEN.has(r.status) || r.pid === exceptPid) continue;
    if (r.regDate && r.regDate > SEASON_END) continue; // następny sezon: budżet sprawdzany przy rejestracji
    if (hasOpenDeal(game, r.pid) || proposalsFor(game, r.pid).some((x) => x.to === clubId)) continue;
    s += upfrontOf(r.status === 'agreed' ? { ...r.pkg, fee: r.fee } : r.pkg);
  }
  return s;
}

/**
 * Oferta gracza dla klubu AI (pakiet). opts: { pkg (normPkg), dirOk (po sprzeciwie dyrektora), date }.
 * Zwraca { result: 'sent'|'accept'|'reject'|'director', text, rec?, objection?, veto? }.
 */
export function submitClubOffer(game, pid, pkgIn, opts = {}) {
  ensureClubOffers(game);
  const date = opts.date ?? game.date;
  const p = game.world.players[pid];
  if (!p || !isAiClub(game, p.clubId)) return { result: 'reject', text: 'Tego zawodnika nie można kupić.' };
  const pkg = normPkg(pkgIn);
  const seller = clubById(p.clubId);
  let rec = userOffer(game, pid);
  if (rec && rec.seller !== p.clubId) rec = null;
  if (rec?.status === 'broken' && rec.until > date) return { result: 'reject', text: `${seller.name} nie chce teraz rozmawiać. Wróć za ${breakWords(daysBetween(date, rec.until))}.` };
  if (rec?.status === 'thinking') return { result: 'reject', text: `${seller.name} rozważa już twoją ofertę.` };
  if (rec?.status === 'agreed') return { result: 'reject', text: `Masz już porozumienie z ${seller.name}. Rozmawiaj z zawodnikiem.` };
  if (recentlyMoved(p, date)) return { result: 'reject', text: 'Zawodnik dopiero dołączył do klubu. Klub nie sprzeda go tak szybko.' };
  if (p.loan) return { result: 'reject', text: `Zawodnik jest wypożyczony z ${clubName(p.loan.from)}. Klub wypożyczający nie może go sprzedać, a macierzysty sprzeda go po powrocie.` };
  if (hasOpenDeal(game, pid) || p.transfer) return { result: 'reject', text: 'Zawodnik jest w trakcie transferu do innego klubu.' };
  if (p.preContract) return { result: 'reject', text: `${p.name} ma już umowę od 1 lipca z innym klubem.` };
  if (userProposal(game, pid)) return { result: 'reject', text: `${p.name} rozważa twoją propozycję.` };
  if (!(pkg.fee > 0)) return { result: 'reject', text: 'Podaj kwotę odstępnego.' };
  const open = !!windowOn(date);
  const mode = pkg.when ?? (open ? 'now' : 'window');
  if (mode === 'now' && !open) return { result: 'reject', text: 'Okno transferowe jest zamknięte: wybierz transfer w najbliższym oknie albo od następnego sezonu.' };
  const regDate = mode === 'now' ? null : regDateFor(mode, date);
  if (regDate && p.contract?.until && regDate > p.contract.until) {
    return { result: 'reject', text: `Kontrakt ${p.name} kończy się ${fmtDate(p.contract.until)}, przed datą transferu. ${canApproach(p, date) ? 'Zaproponuj mu umowę od 1 lipca (bez odstępnego, karta zawodnika).' : 'Gdy zostanie mu 6 miesięcy kontraktu, zaproponujesz umowę od 1 lipca bez odstępnego.'}` };
  }
  if (!rec || !OPEN.has(rec.status)) {
    if (activeUserOffers(game).length >= CO.maxActive) return { result: 'reject', text: `Prowadzisz już ${CO.maxActive} rozmów z klubami. Zakończ którąś, zanim złożysz kolejną ofertę.` };
  }
  if (mode === 'now') { const cap = canSign(game); if (!cap.ok) return { result: 'reject', text: cap.text }; }
  const cash = upfrontOf(pkg);
  if ((!regDate || regDate <= SEASON_END) && spendable(game.finance, game.clubId) - (pendingFees(game, game.clubId) - offerReserve(game, game.clubId) + offerReserve(game, game.clubId, pid)) < cash) {
    return { result: 'reject', text: 'Kwota płatna przy transferze przekracza budżet transferowy albo saldo klubu.' };
  }
  const board = checkUserFee(game, p, pkg.fee); // weto zarządu: odstępne ponad progi
  if (board.veto) return { result: 'reject', veto: true, text: board.text };
  // Sprzeciw dyrektora sportowego z jego własnej wyceny, przy składaniu oferty (nie zdradza decyzji klubu)
  if (!opts.dirOk) {
    const obj = directorObjection(game, p, pkg.fee, 'buy');
    if (obj) {
      (game.market.dirObj ??= {})[`buy:${p.id}`] = { ...obj, seller: p.clubId, pkg, warn: board.warn ?? null };
      return { result: 'director', objection: obj, text: objectionText(game, obj, fmtZl) };
    }
  } else delete game.market.dirObj?.[`buy:${p.id}`];
  // Nowa rozmowa po zakończonej (ponad 30 dni) albo po przerwie: liczniki od zera
  if (rec && !OPEN.has(rec.status) && (daysBetween(rec.date, date) > CO.resetDays || rec.status === 'broken' || rec.status === 'lapsed' || rec.status === 'done')) rec = null;
  if (rec && rec.round >= CO.userRounds) return { result: 'reject', text: `${seller.name} nie przyjmie kolejnej oferty w tych rozmowach.` };
  if (!rec) rec = addRec(game, { pid, name: p.name, seller: p.clubId, buyer: game.clubId, user: true, round: 0, counters: 0, log: [] });
  Object.assign(rec, { pkg, mode, regDate, status: 'thinking', date, counter: rec.counter ?? null });
  rec.round++;
  rec.log.push({ date, kind: 'offer', fee: pkg.fee });
  // Klauzula odstępnego: klub musi przyjąć od razu (bez namysłu)
  const clause = clauseAmount(p.contract);
  if (clause && pkg.inst === 1 && pkg.fee >= clause) {
    agree(game, rec, pkg.fee, date);
    stat(game, 'coUserClause');
    const t = `${seller.name} przyjmuje ofertę: kwota pokrywa klauzulę odstępnego. Porozumienie klubów, rozmawiaj z zawodnikiem do ${fmtDate(rec.talkUntil)}.`;
    mail(game, [letter(game, rec, 'agreed', `${seller.name} przyjmuje ofertę za ${p.name}`, `${t} ${regText(rec)}`)]);
    return { result: 'accept', rec, text: `${t}${board.warn ? ` ${board.warn}` : ''}` };
  }
  rec.due = addDays(date, thinkDays(game, { p, buyer: game.clubId, pkg, round: rec.round, date, now: !regDate }));
  stat(game, 'coUserSent');
  syncTalk(game, rec);
  mail(game, [letter(game, rec, 'sent', `Wysłaliśmy ofertę do ${seller.name} za ${p.name}`, `Oferta: ${pkgText(pkg)}. ${regText(rec)} Klub rozważa ofertę, odpowiedź przyjdzie w ciągu kilku dni.`, 'info')]);
  return { result: 'sent', rec, text: `Oferta wysłana do ${seller.name}. Klub rozważa ofertę.${board.warn ? ` ${board.warn}` : ''}` };
}

function agree(game, rec, fee, date) {
  Object.assign(rec, { status: 'agreed', fee, talkUntil: addDays(date, CO.talkDays), date });
  rec.log.push({ date, kind: 'agreed', fee });
  syncTalk(game, rec);
}

/** Przerwa w rozmowach (zerwanie). */
export function breakTalks(game, pid, days, date = game.date) {
  ensureClubOffers(game);
  const p = game.world.players[pid];
  let rec = userOffer(game, pid);
  if (!rec && p) rec = addRec(game, { pid, name: p.name, seller: p.clubId, buyer: game.clubId, user: true, round: 0, counters: 0, log: [], pkg: normPkg({}) });
  if (!rec) return null;
  Object.assign(rec, { status: 'broken', until: addDays(date, days), date });
  syncTalk(game, rec);
  return rec;
}

/** Prośba o odejście po odrzuconej albo zawyżonej uczciwej ofercie (raz na 60 dni, 0,25 x ambicja). */
function maybeUpset(game, p, buyerId, v, date) {
  if (!p?.clubId || v.E < CO.wish.fairV * v.V) return;
  if (p.coUpset && daysBetween(p.coUpset, date) < CO.wish.days) return;
  const amb = personalityOf(p).traits.ambition ?? 10;
  const chance = CO.wish.p * (0.5 + amb / 20) * (monthsLeftOf(p, date) <= CO.wish.shortMonths ? CO.wish.shortMul : 1);
  if (!new Rng(`klub-oferta-uraza:${game.seed}:${p.id}:${date}`).chance(chance)) return;
  p.coUpset = date;
  stat(game, 'coUpset');
  const msgs = onOfferRejected(game, p, { buyerRep: clubById(buyerId) ? clubReputation(clubById(buyerId)) : 60, date });
  if (msgs?.length) mail(game, msgs);
}

/** Odpowiedź klubu na ofertę gracza w dniu decyzji. */
function resolveUser(game, rec, date, out) {
  const p = game.world.players[rec.pid];
  const seller = clubName(rec.seller);
  if (!p || p.clubId !== rec.seller || hasOpenDeal(game, rec.pid) || p.preContract) {
    rec.status = 'expired'; rec.date = date; syncTalk(game, rec);
    out.push(letter(game, rec, 'void', `Oferta za ${rec.name} jest nieaktualna`, `${rec.name} nie jest już do kupienia w ${seller}.`, 'info'));
    return;
  }
  const v = resolveClubOffer(game, { p, buyer: rec.buyer, pkg: rec.pkg, round: rec.round, counters: rec.counters, date });
  rec.date = date;
  rec.log.push({ date, kind: v.verdict, fee: v.counterFee ?? rec.pkg.fee });
  stat(game, `coUser_${v.verdict}`);
  const left = CO.userRounds - rec.round;
  if (v.verdict === 'accept') {
    agree(game, rec, rec.pkg.fee, date);
    out.push(letter(game, rec, 'agreed', `${seller} przyjmuje ofertę za ${p.name}`, `Porozumienie klubów: ${pkgText(rec.pkg)}. Masz czas do ${fmtDate(rec.talkUntil)} na uzgodnienie warunków osobistych z zawodnikiem (Transfery, karta zawodnika). ${regText(rec)}`));
    return;
  }
  if (v.verdict === 'counter') {
    rec.counters++;
    Object.assign(rec, { status: 'counter', counter: { fee: v.counterFee }, respondBy: addDays(date, CO.respondDays) });
    syncTalk(game, rec);
    if (v.counterFee > CO.wish.overV * v.V) maybeUpset(game, p, rec.buyer, v, date);
    out.push(letter(game, rec, 'counter', `${seller} przedstawił warunki za ${p.name}`, `Klub chce ${fmtZl(v.counterFee)} (pozostałe warunki bez zmian)${rec.counters >= CO.clubCounters ? ' i mówi, że to jego ostateczna cena' : ''}. Odpowiedz do ${fmtDate(rec.respondBy)}: przyjmij${left > 0 ? ', popraw ofertę' : ''} albo wycofaj się (Transfery, W toku).`));
    return;
  }
  if (v.verdict === 'nfs') {
    Object.assign(rec, { status: 'rejected', reason: 'nfs' }); syncTalk(game, rec);
    out.push(letter(game, rec, 'nfs', `${seller}: ${p.name} nie jest na sprzedaż`, `Klub odrzuca ofertę. ${p.name} jest dla niego zbyt ważny.`));
    return;
  }
  maybeUpset(game, p, rec.buyer, v, date);
  if (v.verdict === 'lowball') {
    breakTalks(game, rec.pid, v.breakDays, date);
    stat(game, 'coUserBreak');
    out.push(letter(game, rec, 'broken', `${seller} przerwał rozmowy o ${p.name}`, `Zdaniem klubu oferta była obraźliwie niska. ${seller} nie wróci do rozmów przez ${breakWords(v.breakDays)}.`));
    return;
  }
  if (left <= 0) {
    const days = new Rng(`klub-przerwa:${game.seed}:${rec.id}:${date}`).int(CO.threeLow[0], CO.threeLow[1]);
    breakTalks(game, rec.pid, days, date);
    out.push(letter(game, rec, 'broken', `${seller} kończy rozmowy o ${p.name}`, `Trzy oferty były za niskie. Klub wróci do rozmów za ${breakWords(days)}.`));
    return;
  }
  Object.assign(rec, { status: 'rejected', reason: v.reason ?? 'low' }); syncTalk(game, rec);
  out.push(letter(game, rec, 'rejected', `${seller} odrzuca ofertę za ${p.name}`, `${v.reason === 'final' ? 'Klub zostaje przy swojej ostatniej cenie.' : 'Kwota jest zdaniem klubu za niska.'} Możesz złożyć jeszcze ${left} ${left === 1 ? 'ofertę' : 'oferty'}.`));
}

/** Gracz odpowiada na kontrofertę: 'accept' (porozumienie) albo 'withdraw'. Zwraca { ok, text }. */
export function answerCounter(game, pid, action, date = game.date) {
  const rec = userOffer(game, pid);
  if (!rec || rec.status !== 'counter' || rec.respondBy < date) return { ok: false, text: 'Kontroferta jest już nieaktualna.' };
  const p = game.world.players[pid];
  const seller = clubName(rec.seller);
  if (action === 'withdraw') {
    Object.assign(rec, { status: 'withdrawn', date }); syncTalk(game, rec);
    return { ok: true, text: `Wycofano się z rozmów z ${seller} o ${rec.name}.` };
  }
  if (action !== 'accept') return { ok: false, text: 'Nieznana decyzja.' };
  const pkg = { ...rec.pkg, fee: rec.counter.fee };
  if ((!rec.regDate || rec.regDate <= SEASON_END) && spendable(game.finance, game.clubId) - (pendingFees(game, game.clubId) - offerReserve(game, game.clubId) + offerReserve(game, game.clubId, pid)) < upfrontOf(pkg)) return { ok: false, text: 'Kwota kontroferty przekracza budżet transferowy albo saldo klubu.' };
  const board = checkUserFee(game, p, pkg.fee);
  if (board.veto) return { ok: false, text: board.text };
  rec.pkg = pkg;
  agree(game, rec, pkg.fee, date);
  stat(game, 'coUserCounterYes');
  return { ok: true, text: `Porozumienie z ${seller}: ${pkgText(pkg)}. Rozmawiaj z zawodnikiem do ${fmtDate(rec.talkUntil)}.${board.warn ? ` ${board.warn}` : ''}` };
}

/** Gracz wycofuje ofertę, którą klub rozważa. */
export function withdrawClubOffer(game, pid, date = game.date) {
  const rec = userOffer(game, pid);
  if (!rec || !['thinking', 'counter'].includes(rec.status)) return { ok: false, text: 'Oferta jest już nieaktualna.' };
  Object.assign(rec, { status: 'withdrawn', date }); syncTalk(game, rec);
  return { ok: true, text: `Wycofano ofertę za ${rec.name}.` };
}

/** Porozumienie zamienione w propozycję i transakcję: koniec rozmów z klubem. */
export function markOfferDone(game, pid) {
  const rec = userOffer(game, pid);
  if (rec && rec.status === 'agreed') { rec.status = 'done'; rec.date = game.date; }
}

// ------------------------------------------------------------ Kluby AI
/**
 * Oferta klubu AI za zawodnika innego klubu AI: lekki rekord rozstrzygany w dniu odpowiedzi (3-7 dni, najpóźniej
 * koniec okna). ctx: { contract, maxWage, maxTotal, demand } z rozmów z zawodnikiem. Zwraca rekord albo null.
 */
export function aiClubOffer(game, buyer, p, { fee, maxPay, date = game.date, ...ctx }) {
  ensureClubOffers(game);
  if (!p?.clubId || (game.market.cOffers ?? []).some((r) => r.ai && r.pid === p.id && r.buyer === buyer.id && r.status === 'thinking')) return null;
  const rng = new Rng(`ai-oferta:${game.seed}:${buyer.id}:${p.id}:${date}`);
  const open = round(Math.min(maxPay, fee) * (CO.ai.open[0] + (CO.ai.open[1] - CO.ai.open[0]) * rng.next()));
  const pkg = normPkg({ fee: open });
  const w = windowOn(date);
  let due = addDays(date, thinkDays(game, { p, buyer: buyer.id, pkg, date }));
  if (w && due > w.to) due = w.to;
  stat(game, 'coAiSent');
  return addRec(game, { pid: p.id, name: p.name, seller: p.clubId, buyer: buyer.id, ai: true, status: 'thinking', pkg, maxPay, date, due, ctx });
}

/** Pętla 3-4 rund klubu AI w dniu odpowiedzi. Zwraca uzgodnioną kwotę albo null. */
export function aiLoop(game, rec, p, date) {
  let fee = rec.pkg.fee; let counters = 0; let n = 0; let agreed = null;
  for (n = 1; n <= CO.ai.rounds; n++) {
    const v = resolveClubOffer(game, { p, buyer: rec.buyer, pkg: { ...rec.pkg, fee }, round: n, counters, date });
    if (v.verdict === 'accept') { agreed = fee; break; }
    if (v.verdict === 'counter') {
      counters++;
      if (v.counterFee <= rec.maxPay) { agreed = v.counterFee; break; }
      const next = round(Math.min(rec.maxPay, (fee + v.counterFee) / 2));
      if (next <= fee) break;
      fee = next; continue;
    }
    if (v.verdict === 'reject' && v.reason !== 'final') {
      const next = round(Math.min(rec.maxPay, fee * CO.ai.raise));
      if (next <= fee * 1.01) break;
      fee = next; continue;
    }
    if (v.verdict !== 'nfs') maybeUpset(game, p, rec.buyer, v, date);
    break;
  }
  rec.rounds = Math.min(n, CO.ai.rounds);
  stat(game, `coAiRounds${rec.rounds}`);
  return agreed;
}

function resolveAi(game, rec, date) {
  const p = game.world.players[rec.pid];
  rec.date = date;
  if (!p || p.clubId !== rec.seller || !windowOn(date) || hasOpenDeal(game, rec.pid) || p.preContract || p.joinOn || !game.world.clubs[rec.buyer]) { rec.status = 'expired'; return; }
  const fee = aiLoop(game, rec, p, date);
  if (fee == null) { rec.status = 'rejected'; stat(game, 'coAiFail'); return; }
  rec.status = 'agreed'; rec.fee = fee;
  stat(game, 'coAiAgreed');
  const prop = aiAfterAgreement(game, rec, p, fee, date); // propozycja dla zawodnika (transfers.js)
  rec.status = prop ? 'done' : 'failed';
}

// ------------------------------------------------------------ Raty, premie, procent od sprzedaży (completeTransfer)
/**
 * Księgowanie pakietu przy rejestracji: zwraca kwotę płatną teraz, zapisuje kolejne raty i premie, ustawia procent
 * od następnej sprzedaży. from: klub sprzedający (null: zagranica albo wolny).
 */
export function bookPackage(game, { p, from, to, fee, pkg, date }) {
  if (!pkg || !from) return fee;
  ensureClubOffers(game);
  const M = game.market;
  const sched = scheduleOf({ ...pkg, fee });
  for (const x of sched.slice(1)) M.instal.push({ pid: p.id, name: p.name, payer: to, payee: from, amount: x.amount, due: addDays(date, Math.round(x.m * 30.44)), since: date });
  for (const [kind, amount] of Object.entries(pkg.bonus ?? {})) M.bonuses.push({ pid: p.id, name: p.name, payer: to, payee: from, kind, amount, n: kind === 'apps' ? CO.appsN : null, tier0: clubById(to)?.tier ?? null, since: date, until: addDays(date, CO.bonusDays) });
  if (pkg.sellOn) p.sellOn = { club: from, pct: pkg.sellOn, owner: to, since: date }; // po wypłacie starego (paySellOn)
  return sched[0].amount;
}

/**
 * Procent od sprzedaży przy kolejnej sprzedaży zawodnika (także AI-AI i za granicę): klub, który go kupił z tym
 * warunkiem, płaci pierwotnemu sprzedawcy pct x kwota. Zwraca wypłaconą kwotę.
 */
export function paySellOn(game, p, { from, fee, date }) {
  const so = p.sellOn;
  if (!so) return 0;
  delete p.sellOn;
  if (!(fee > 0) || so.owner !== from || so.club === from) return 0;
  const amount = round(fee * so.pct / 100, 1000);
  const F = game.finance;
  book(F, from, date, 'out', 'transfers', amount, `${p.name}: ${so.pct} % od sprzedaży dla ${clubName(so.club)}`);
  book(F, so.club, date, 'in', 'sales', amount, `${p.name}: ${so.pct} % od sprzedaży (${clubName(from)})`);
  stat(game, 'coSellOnPaid');
  if (game.clubId && (so.club === game.clubId || from === game.clubId)) {
    mail(game, [createMessage({ date, key: `sell-on:${p.id}:${date}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'info',
      subject: so.club === game.clubId ? `Procent od sprzedaży: ${p.name}` : `Płacimy procent od sprzedaży: ${p.name}`,
      body: so.club === game.clubId ? `${clubName(from)} sprzedał ${p.name}. Dostajemy ${so.pct} % kwoty: ${fmtZl(amount)}.` : `Sprzedaliśmy ${p.name}. ${clubName(so.club)} dostaje ${so.pct} % kwoty: ${fmtZl(amount)}.`, refs: { pid: p.id } })]);
  }
  return amount;
}

function payDay(game, date, out) {
  const M = game.market; const F = game.finance;
  if (M.instal?.length) {
    const keep = [];
    for (const x of M.instal) {
      if (x.due > date) { keep.push(x); continue; }
      book(F, x.payer, date, 'out', 'transfers', x.amount, `${x.name}: rata odstępnego dla ${clubName(x.payee)}`);
      book(F, x.payee, date, 'in', 'sales', x.amount, `${x.name}: rata od ${clubName(x.payer)}`);
      if (F.clubs[x.payer]) F.clubs[x.payer].transferBudget = Math.max(0, F.clubs[x.payer].transferBudget - x.amount);
      if (F.clubs[x.payee]) F.clubs[x.payee].transferBudget += Math.round(x.amount * 0.5);
      stat(game, 'coInstalPaid');
    }
    M.instal = keep;
  }
  if (!date.endsWith('-01') || !M.bonuses?.length) return;
  const keep = [];
  for (const b of M.bonuses) {
    const p = game.world.players[b.pid];
    if (!p || p.clubId !== b.payer || b.until < date) continue; // zawodnik odszedł albo termin minął: premia przepada
    let met = false;
    if (b.kind === 'apps') { const sp = (p.cl ?? []).at(-1); met = !!sp && sp.c === b.payer && !sp.t && (sp.m ?? 0) >= b.n; }
    else if (b.kind === 'promo') met = b.tier0 != null && (clubById(b.payer)?.tier ?? 9) < b.tier0;
    else if (b.kind === 'euro') met = (game.fixtures ?? []).some((f) => f.comp === 'uefa' && f.played && f.date >= b.since && (f.home === b.payer || f.away === b.payer));
    if (!met) { keep.push(b); continue; }
    const what = b.kind === 'apps' ? `${b.n} występów` : b.kind === 'promo' ? 'awans' : 'grę w pucharach europejskich';
    book(F, b.payer, date, 'out', 'transfers', b.amount, `${b.name}: premia za ${what} dla ${clubName(b.payee)}`);
    book(F, b.payee, date, 'in', 'sales', b.amount, `${b.name}: premia za ${what} (${clubName(b.payer)})`);
    stat(game, 'coBonusPaid');
    if (b.payer === game.clubId || b.payee === game.clubId) out.push(createMessage({ date, key: `premia-transfer:${b.pid}:${b.kind}:${date}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'info',
      subject: `Premia z transferu: ${b.name}`, body: `Warunek spełniony (${what}). ${b.payer === game.clubId ? `Płacimy ${clubName(b.payee)}` : `${clubName(b.payer)} płaci nam`} ${fmtZl(b.amount)}.`, refs: { pid: b.pid } }));
  }
  M.bonuses = keep;
}

// ------------------------------------------------------------ System dnia (transferSystem.js, przed propozycjami)
/** Dzień: odpowiedzi klubów, wygasłe kontroferty i porozumienia, raty i premie. Zwraca listy dla gracza. */
export function clubOffersDay(game, date) {
  ensureClubOffers(game);
  const out = [];
  payDay(game, date, out);
  for (const rec of game.market.cOffers) {
    if (rec.status === 'thinking' && rec.due <= date) {
      if (rec.ai) resolveAi(game, rec, date); else if (rec.buyer === game.clubId) resolveUser(game, rec, date, out); else rec.status = 'expired';
      continue;
    }
    if (!rec.user) continue;
    if (rec.buyer !== game.clubId && OPEN.has(rec.status)) { rec.status = 'expired'; syncTalk(game, rec); continue; } // trener zmienił klub
    if (rec.status === 'counter' && rec.respondBy < date) {
      Object.assign(rec, { status: 'expired', date }); syncTalk(game, rec);
      out.push(letter(game, rec, 'counterExpired', `Kontroferta ${clubName(rec.seller)} wygasła`, `Nie było odpowiedzi na warunki klubu w sprawie ${rec.name}. Możesz złożyć nową ofertę.`, 'info'));
    } else if (rec.status === 'agreed') {
      if (dealOf(game, rec.pid)?.to === game.clubId || game.world.players[rec.pid]?.clubId === game.clubId) { rec.status = 'done'; continue; }
      if (rec.talkUntil < date && !userProposal(game, rec.pid)) {
        Object.assign(rec, { status: 'lapsed', date }); syncTalk(game, rec);
        stat(game, 'coUserLapsed');
        out.push(letter(game, rec, 'lapsed', `Porozumienie z ${clubName(rec.seller)} w sprawie ${rec.name} wygasło`, `W ciągu ${CO.talkDays} dni nie było porozumienia z zawodnikiem, więc zgoda klubu wygasła. Możesz złożyć nową ofertę.`, 'info'));
      }
    } else if (rec.status === 'broken' && rec.until <= date && game.market.talks?.[rec.pid]?.co === rec.id) delete game.market.talks[rec.pid];
  }
  const keep = addDays(date, -CO.keepDays);
  game.market.cOffers = game.market.cOffers.filter((r) => OPEN.has(r.status) || (r.status === 'broken' && r.until > date) || (r.date ?? '') >= keep);
  for (const [pid, a] of Object.entries(game.market.inq)) if (daysBetween(a.date, date) >= CO.inqDays) delete game.market.inq[pid];
  return out;
}

/** Status oferty gracza dla UI (bez dat decyzji klubu): { k: tryb, text, tone }. */
export function offerStatus(game, rec, date = game.date) {
  if (!rec) return null;
  switch (rec.status) {
    case 'thinking': return { k: 'thinking', text: 'Klub rozważa ofertę', tone: 'info' };
    case 'counter': return { k: 'counter', text: `Kontroferta: ${fmtZl(rec.counter?.fee ?? 0)}, odpowiedz do ${fmtDate(rec.respondBy)}`, tone: 'warn' };
    case 'agreed': return { k: 'agreed', text: `Porozumienie klubów: rozmawiaj z zawodnikiem do ${fmtDate(rec.talkUntil)}`, tone: 'good' };
    case 'broken': return rec.until > date ? { k: 'broken', text: `Rozmowy wstrzymane na ${breakWords(daysBetween(date, rec.until))}`, tone: 'bad' } : null;
    case 'rejected': return { k: 'rejected', text: rec.reason === 'nfs' ? 'Klub odrzucił ofertę: nie na sprzedaż' : 'Klub odrzucił ofertę', tone: 'bad' };
    case 'lapsed': return { k: 'lapsed', text: 'Porozumienie wygasło', tone: 'bad' };
    case 'expired': return { k: 'expired', text: 'Oferta nieaktualna', tone: 'bad' };
    case 'withdrawn': return { k: 'withdrawn', text: 'Oferta wycofana', tone: 'info' };
    default: return null;
  }
}
