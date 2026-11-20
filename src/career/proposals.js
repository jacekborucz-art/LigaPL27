// Namysł zawodnika przed podpisem (docs/transfery.md, rozdz. 10; docs/negocjacje.md, rozdz. 14).
// Udane rozmowy (gracza i klubu AI) to propozycja złożona zawodnikowi, nie podpis. Zawodnik namyśla się 2-5 dni
// (3 dni + RNG od -1 do +2, ziarno: seed, zawodnik, klub, data), zawodnik z klubem najpóźniej do ostatniego dnia okna.
// W tym czasie może dostać propozycje innych klubów (jedna na klub). W dniu decyzji porównuje wszystkie wzorem
// użyteczności z prekontraktów (offerUtility, src/career/preContracts.js) i odpowiada: zgoda (transakcja od testów
// medycznych), odmowa, wybrał inny klub albo chce zmian (gracz: ostatnia runda rozmów, klub AI: podnosi pensję
// w budżecie albo rezygnuje). Odstępne propozycji w toku jest zarezerwowane (pendingFees). Stan: game.market.pending.
// Wszystkie liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { createMessage, addMessages } from '../core/inbox.js';
import { addDays } from '../core/gameLoop.js';
import { clubById } from '../data/clubs_pl.js';
import { DOMESTIC } from '../config/calendar2026.js';
import { clubReputation } from './reputation.js';
import { relationWith } from './negotiation.js';
import { offerUtility } from './preContracts.js';
import { spendable } from './finance.js';
import { canSign, squadCount } from './squadLimit.js';
import { startDeal, hasOpenDeal, pendingFees, stat, expectedRegistration } from './transferDeals.js';
import { isPoolContracted, poolSellerClub } from './foreignPool.js';
import { fmtZl } from './transfers.js';
import { fmtDate } from '../ui/dom.js';

export const THINK = {
  base: 3, min: -1, max: 2, // namysł 3 dni + RNG od -1 do +2 (2-5 dni)
  noise: 0.08, // szum użyteczności (jak w prekontraktach)
  accept: 0.78, slope: 0.4, pMin: 0.5, pMax: 0.92, // szansa zgody = clamp(0,78 + 0,4 x (U - U_odniesienia), 0,5; 0,92)
  changes: 0.6, // bez zgody: 60 % „chce zmian”, 40 % odmowa
  wantMin: 0.08, wantMax: 0.18, // „chce zmian”: pensja wyżej o 8-18 %
  lastRoundDays: 2, // termin na ostatnią rundę rozmów gracza
  aiRaise: 0.1, // klub AI przy „chce zmian”: pensja +10 %, jeśli mieści się w budżecie
  refuseLockDays: 14, // po odmowie zawodnik nie rozmawia z tym klubem 2 tygodnie
  freeRepGap: 15, freeStepDown: 0.4, // odniesienie wolnego zawodnika: klub o reputacji +15, minus 0,4 x gotowość do zejścia niżej
  listed: -0.2, unhappy: -0.3, // odniesienie zawodnika z klubem: wystawiony na listę, niezadowolony albo prosi o transfer
  keepDays: 60, // zamknięte propozycje zostają w zapisie 60 dni (lista ostatnich odpowiedzi)
};

const OPEN = new Set(['open', 'changes']);
const isOpen = (x) => OPEN.has(x.status);
const clubName = (id) => clubById(id)?.name ?? 'klub';
const windowOn = (date) => (DOMESTIC.transferWindows ?? []).find((w) => date >= w.from && date <= w.to) ?? null;

// ------------------------------------------------------------ Stan
export function ensureProposals(game) {
  const M = game.market;
  if (!M) return [];
  if (!Array.isArray(M.pending)) M.pending = [];
  M.pendingSeq ??= 0;
  return M.pending;
}
export const openProposals = (game) => (game.market?.pending ?? []).filter(isOpen);
/** Otwarte propozycje dla zawodnika (wszystkie kluby). */
export const proposalsFor = (game, pid) => (game.market?.pending ?? []).filter((x) => x.pid === pid && isOpen(x));
/** Otwarta propozycja klubu gracza dla zawodnika (albo null). */
export const userProposal = (game, pid) => (game.market?.pending ?? []).find((x) => x.pid === pid && x.to === game.clubId && x.user && isOpen(x)) ?? null;
/** Dzień decyzji zawodnika (najbliższa decyzja z otwartych propozycji) albo null, gdy się nie namyśla. */
export function thinkingUntil(game, pid) {
  let d = null;
  for (const x of proposalsFor(game, pid)) {
    const day = x.status === 'changes' ? x.deadline : x.decide;
    if (!d || day < d) d = day;
  }
  return d;
}

/** Długość namysłu w dniach (2-5) z ziarna gry, zawodnika, klubu i daty. */
export function thinkDays(game, pid, to, date) {
  return THINK.base + new Rng(`namysl:${game.seed}:${pid}:${to ?? 'z'}:${date}`).int(THINK.min, THINK.max);
}

const stateOf = (p) => (p.clubId ? 'club' : isPoolContracted(p) ? 'pool' : 'free');

// ------------------------------------------------------------ Złożenie propozycji
/**
 * Propozycja klubu dla zawodnika po udanych rozmowach. opts: { playerId, to, fee, contract, kind ('transfer'|'free'),
 * date, maxWage (klub AI: budżet pensji na drugą rundę), sale (oferta klubu AI za zawodnika gracza: id oferty) }.
 * Zwraca propozycję albo null (zawodnik zajęty albo ten klub już złożył propozycję).
 */
export function makeProposal(game, opts) {
  ensureProposals(game);
  const { playerId, to, fee = 0, contract, kind = 'transfer', maxWage = null, sale = null } = opts;
  const date = opts.date ?? game.date;
  const p = game.world.players[playerId];
  if (!p || !to || hasOpenDeal(game, playerId) || p.preContract) return null;
  const mine = proposalsFor(game, playerId);
  if (mine.some((x) => x.to === to)) return null; // jedna propozycja na klub
  const needsWindow = stateOf(p) !== 'free'; // zawodnik z klubem decyduje najpóźniej w ostatnim dniu okna
  // W trakcie namysłu nowa propozycja dołącza do tej samej decyzji; w trakcie ostatniej rundy gracza: dzień po terminie
  const waiting = mine.filter((x) => x.status === 'open').map((x) => x.decide).sort();
  const changes = mine.find((x) => x.status === 'changes');
  let decide = waiting[0] ?? (changes ? addDays(changes.deadline, 1) : addDays(date, thinkDays(game, playerId, to, date)));
  const w = needsWindow ? windowOn(date) : null;
  if (w && decide > w.to) decide = w.to;
  if (decide < date) decide = date;
  const M = game.market;
  const x = {
    id: `n${++M.pendingSeq}-${playerId}`, pid: playerId, name: p.name, pos: p.pos, to, user: to === game.clubId,
    from: p.clubId ?? null, fromState: stateOf(p), fee, contract, kind, date, decide, needsWindow,
    maxWage, sale, status: 'open', deadline: null, want: null, end: null,
  };
  M.pending.push(x);
  stat(game, x.user ? 'propsUser' : 'props');
  return x;
}

/**
 * Propozycja gracza po udanych rozmowach (ekran rozmów). Decyzja przypadająca na dziś (ostatni dzień okna)
 * zapada od razu, bo systemy dnia już się wykonały. Zwraca { ok, text, prop }.
 */
export function submitUserProposal(game, { playerId, fee = 0, contract, fromClub = null }) {
  const p = game.world.players[playerId];
  const prop = makeProposal(game, { playerId, to: game.clubId, fee, contract, kind: fromClub ? 'transfer' : 'free' });
  if (!prop) return { ok: false, text: `${p?.name ?? 'Zawodnik'} jest już w trakcie innej transakcji albo czeka na twoją odpowiedź.`, prop: null };
  if (prop.decide <= game.date) {
    resolveNow(game, playerId);
    return { ok: true, text: `Propozycja złożona. ${p.name} odpowiedział od razu, bo to ostatni dzień okna transferowego: sprawdź pocztę.`, prop };
  }
  return { ok: true, text: `Propozycja złożona. ${p.name} odpowie ok. ${fmtDate(prop.decide)}.`, prop };
}

/** Decyzje na dziś poza systemem dnia (np. ostatni dzień okna): listy trafiają od razu do poczty. */
export function resolveNow(game, pid = null) {
  const out = [];
  const due = new Set(openProposals(game).filter((x) => x.status === 'open' && x.decide <= game.date && (!pid || x.pid === pid)).map((x) => x.pid));
  for (const id of due) decidePlayer(game, id, game.date, out);
  if (out.length) game.inbox = addMessages(game.inbox ?? [], out).inbox;
  return out;
}

/** Gracz wycofuje swoją propozycję (bez skutków dla relacji). */
export function withdrawProposal(game, propId, date = game.date) {
  const x = (game.market?.pending ?? []).find((y) => y.id === propId && isOpen(y));
  if (!x || !x.user || x.to !== game.clubId) return { ok: false, text: 'Propozycja jest już nieaktualna.' };
  close(x, 'withdrawn', date);
  return { ok: true, text: `Wycofano propozycję dla ${x.name}.` };
}

// ------------------------------------------------------------ Decyzja zawodnika
function close(x, status, date, extra = {}) {
  x.status = status;
  x.end = { date, ...extra };
}

/** Widok oferty dla offerUtility (preContracts.js). Premia za podpis rozłożona na tygodnie kontraktu. */
function offerView(game, p, x) {
  const c = clubById(x.to) ?? { prestige: 3, tier: 1, L: 11 };
  const ct = x.contract ?? {};
  const wage = (ct.wage ?? 0) + (ct.signOn ?? 0) / Math.max(52, (ct.years ?? 2) * 52);
  return { wage, rep: clubReputation(c), L: c.L, prestige: c.prestige, tier: c.tier, europe: inEurope(game, x.to), foreign: false };
}
const inEurope = (game, id) => !!id && (game.fixtures ?? []).some((f) => f.comp === 'uefa' && (f.home === id || f.away === id));

/**
 * Użyteczność odniesienia: zostanie w obecnym klubie albo (wolny zawodnik) oferta, na którą może liczyć: klub
 * o reputacji o 15 wyższej od jego własnej, pensja jak oczekuje, pomniejszona o gotowość do zejścia niżej.
 */
export function referenceUtility(game, p, rng) {
  const st = stateOf(p);
  if (st === 'free') {
    const rep = (p.rep ?? 30) + THINK.freeRepGap;
    const tier = rep >= 60 ? 1 : rep >= 48 ? 2 : rep >= 38 ? 3 : 4;
    const u = offerUtility(p, { wage: p.askWage ?? p.wage ?? 1000, rep, L: p.ovr ?? 10, prestige: 3, tier, europe: false, foreign: false }, { noise: rng.gauss(0, THINK.noise) });
    return u - THINK.freeStepDown * Math.max(p.stepDown ?? 0, p.stepDownFree ?? 0);
  }
  const c = st === 'pool' ? poolSellerClub(p) : clubById(p.clubId) ?? { prestige: 3, tier: 2, L: 10 };
  const own = { wage: p.contract?.wage ?? 0, rep: clubReputation(c), L: c.L ?? p.abroad?.league ?? 10, prestige: c.prestige, tier: c.tier, europe: st === 'club' && inEurope(game, p.clubId), foreign: false, own: true };
  const trust = st === 'club' ? relationWith(p, p.clubId).trust : 50;
  let u = offerUtility(p, own, { trust, noise: rng.gauss(0, THINK.noise) });
  if (game.market?.listed?.[p.id] || game.market?.userListed?.[p.id]) u += THINK.listed;
  if (p.unhappy || p.transferRequest) u += THINK.unhappy;
  return u;
}

/** Czy propozycja jest wciąż możliwa. Zwraca powód nieaktualności albo null. */
function invalidReason(game, x, date) {
  const p = game.world.players[x.pid];
  if (!p) return 'gone';
  if (x.user && x.to !== game.clubId) return 'club'; // trener zmienił klub albo stracił pracę
  if (!game.world.clubs[x.to]) return 'gone';
  if (hasOpenDeal(game, x.pid) || p.preContract) return 'deal';
  if ((p.clubId ?? null) !== x.from || stateOf(p) !== x.fromState) return 'moved';
  if (x.needsWindow && !windowOn(date)) return 'window';
  return null;
}

const INVALID_TEXT = {
  gone: 'Zawodnik nie jest już na rynku.',
  deal: 'Zawodnik jest w trakcie innego transferu.',
  moved: 'Zawodnik zmienił klub.',
  window: 'Okno transferowe się zamknęło.',
  limit: 'Kadra jest pełna (limit kadry), więc propozycja została wycofana.',
  money: 'Brakuje pieniędzy na odstępne.',
};

/** Listy dla gracza (tylko jego propozycje i sprzedaż jego zawodników). */
function letter(game, x, kind, subject, body, priority = 'important') {
  const p = game.world.players[x.pid];
  const fromName = x.sale ? 'Dyrektor sportowy' : `Agent zawodnika ${p?.name ?? x.name}`;
  return createMessage({ date: game.date, key: `namysl${kind === 'changes' ? '-zmiany' : ''}:${x.pid}:${x.id}:${kind}`, category: 'transfers', from: fromName, priority, subject, body,
    refs: { kind: 'proposal', pid: x.pid, propId: x.id, ...(kind === 'changes' ? { lastRound: true } : {}) } });
}
const concerned = (game, x) => x.user || (x.from && x.from === game.clubId);

/** Odpowiedź zawodnika na propozycje (wszystkie otwarte w dniu decyzji). */
function decidePlayer(game, pid, date, out) {
  const P = game.market.pending;
  const p = game.world.players[pid];
  if (P.some((x) => x.pid === pid && x.status === 'changes')) return; // czeka na ostatnią rundę gracza
  const list = [];
  for (const x of P) {
    if (x.pid !== pid || x.status !== 'open') continue;
    const why = invalidReason(game, x, date);
    if (!why) { list.push(x); continue; }
    close(x, 'expired', date, { reason: why });
    stat(game, 'propsExpired');
    if (concerned(game, x) && why !== 'club') out.push(letter(game, x, 'expired', `Propozycja dla ${x.name} jest nieaktualna`, `${INVALID_TEXT[why]} ${x.user ? 'Twoja propozycja' : `Propozycja ${clubName(x.to)}`} przestała obowiązywać.`, 'info'));
  }
  if (!list.length || !p) return;
  const rng = new Rng(`namysl-decyzja:${game.seed}:${pid}:${date}`);
  const ref = referenceUtility(game, p, rng);
  const scored = list.map((x) => ({ x, u: offerUtility(p, offerView(game, p, x), { noise: rng.gauss(0, THINK.noise) }) }))
    .sort((a, b) => b.u - a.u || a.x.id.localeCompare(b.x.id));
  for (const { x, u } of scored) x.u = Math.round(u * 100) / 100;
  for (const { x, u } of scored) {
    const pYes = clamp(THINK.accept + THINK.slope * (u - ref), THINK.pMin, THINK.pMax);
    const r = rng.next();
    let ans = r < pYes ? 'yes' : r < pYes + (1 - pYes) * THINK.changes ? 'changes' : 'no';
    if (ans === 'changes' && !x.user) {
      // Klub AI: jak druga runda aiNegotiate, pensja +10 % w budżecie albo rezygnacja
      const wage = Math.round(((x.contract?.wage ?? 0) * (1 + THINK.aiRaise)) / 100) * 100;
      if (x.maxWage == null || wage <= x.maxWage) { x.contract = { ...x.contract, wage }; x.raised = true; ans = 'yes'; } else ans = 'no';
    }
    if (ans === 'yes') {
      const deal = accept(game, x, date, out);
      if (!deal) continue;
      for (const y of scored) if (y.x !== x && y.x.status === 'open') lose(game, y.x, x, date, out);
      return;
    }
    if (ans === 'changes') {
      askChanges(game, x, date, rng, out);
      for (const y of scored) if (y.x !== x && y.x.status === 'open') y.x.decide = addDays(x.deadline, 1);
      return;
    }
    refuse(game, x, date, out);
  }
}

/** Zgoda: transakcja od testów medycznych (warunki osobiste uzgodnione w rozmowach). Zwraca transakcję albo null. */
function accept(game, x, date, out) {
  const p = game.world.players[x.pid];
  const F = game.finance;
  const full = x.to === game.clubId ? !canSign(game).ok : squadCount(game, x.to).full;
  const money = x.fee && spendable(F, x.to) - (pendingFees(game, x.to) - x.fee) < x.fee;
  if (full || money) {
    const why = full ? 'limit' : 'money';
    close(x, 'expired', date, { reason: why });
    stat(game, 'propsExpired');
    if (concerned(game, x)) out.push(letter(game, x, 'expired', `Propozycja dla ${x.name} wycofana`, `${x.name} chciał przyjąć propozycję ${clubName(x.to)}, ale ${INVALID_TEXT[why].charAt(0).toLowerCase()}${INVALID_TEXT[why].slice(1)}`));
    return null;
  }
  close(x, 'accepted', date);
  const deal = startDeal(game, { playerId: x.pid, to: x.to, fee: x.fee, contract: x.contract, kind: x.kind, date, stage: 'medical', prop: x.id });
  if (!deal) { x.status = 'expired'; x.end.reason = 'deal'; return null; }
  x.end.deal = deal.id;
  stat(game, x.user ? 'propsUserYes' : 'propsYes');
  if (x.user) p.morale = clamp((p.morale ?? 12) + 2, 1, 20); // podpis: jak po udanych rozmowach (negocjacje.md, rozdz. 7)
  if (x.user) out.push(letter(game, x, 'yes', `${x.name} przyjmuje twoją propozycję`, `${x.name} zgodził się na warunki ${clubName(x.to)}${x.fee ? ` (odstępne ${fmtZl(x.fee)})` : ''}. Teraz testy medyczne, zgłoszenie spodziewane ${fmtDate(expectedRegistration(deal))}.`));
  else if (x.sale) out.push(letter(game, x, 'yes', `${x.name} zgodził się na warunki ${clubName(x.to)}`, `${x.name} przyjął propozycję ${clubName(x.to)}${x.raised ? ' po podwyżce pensji' : ''}. Teraz testy medyczne, spodziewane zgłoszenie: ${fmtDate(expectedRegistration(deal))}. Do zgłoszenia zawodnik zostaje u nas, od testów medycznych nie gra.`));
  return deal;
}

/** Zawodnik wybrał inny klub. */
function lose(game, x, winner, date, out) {
  close(x, 'lost', date, { winner: winner.to });
  stat(game, x.user ? 'propsUserLost' : 'propsLost');
  if (concerned(game, x)) out.push(letter(game, x, 'lost', `${x.name} wybrał ${clubName(winner.to)}`, x.user
    ? `${x.name} rozważył kilka propozycji i wybrał ofertę ${clubName(winner.to)}. Twoja propozycja jest nieaktualna.`
    : `${x.name} wybrał ofertę ${clubName(winner.to)}, a nie ${clubName(x.to)}.`));
}

/** Odmowa: zawodnik nie rozmawia z tym klubem przez 2 tygodnie (bez urazy). */
function refuse(game, x, date, out) {
  const p = game.world.players[x.pid];
  close(x, 'rejected', date);
  stat(game, x.user ? 'propsUserNo' : 'propsNo');
  const until = addDays(date, THINK.refuseLockDays);
  const rel = relationWith(p, x.to);
  if (!rel.lockUntil || rel.lockUntil < until) { rel.lockUntil = until; rel.lockReason = 'odmowa'; }
  p.relations = { ...(p.relations ?? {}), [x.to]: rel };
  if (x.user) out.push(letter(game, x, 'no', `${x.name} odrzuca twoją propozycję`, `Po namyśle ${x.name} nie przejdzie do ${clubName(x.to)}. Agent prosi, żeby nie wracać do rozmów przed ${fmtDate(until)}.`));
  else if (x.sale) out.push(letter(game, x, 'no', `${x.name} nie dogadał się z ${clubName(x.to)}`, `${x.name} odrzucił propozycję ${clubName(x.to)}. Zostaje w klubie.`));
}

/** Gracz: zawodnik chce zmian, ostatnia runda rozmów (pensja wyżej o 8-18 %), termin 2 dni (najpóźniej koniec okna). */
function askChanges(game, x, date, rng, out) {
  x.status = 'changes';
  let deadline = addDays(date, THINK.lastRoundDays);
  const w = x.needsWindow ? windowOn(date) : null;
  if (w && deadline > w.to) deadline = w.to;
  x.deadline = deadline;
  const c = x.contract ?? {};
  const wage = Math.ceil(((c.wage ?? 0) * (1 + THINK.wantMin + (THINK.wantMax - THINK.wantMin) * rng.next())) / 100) * 100;
  x.want = contractOffer({ ...c, wage });
  stat(game, 'propsUserChanges');
  out.push(letter(game, x, 'changes', `${x.name} chce zmian w kontrakcie`, `${x.name} jest blisko zgody, ale chce lepszych warunków: pensja ${fmtZl(wage)} tygodniowo zamiast ${fmtZl(c.wage ?? 0)}. To ostatnia runda rozmów. Odpowiedz do ${fmtDate(deadline)} (Transfery, W toku), potem propozycja wygaśnie. Słabsza oferta zakończy rozmowy.`));
}

/** Kontrakt z rozmów jako oferta dla ekranu rozmów (normalizeOffer). */
export function contractOffer(c = {}) {
  return {
    wage: c.wage ?? 0, years: c.years ?? 2, signOn: c.signOn ?? 0, bonus: { ...(c.bonus ?? {}) }, raise: c.raise ?? 0,
    clause: c.clause ? { amount: c.clause, foreignOnly: !!c.clauseForeignOnly } : null, relegationCut: c.relegationCut ?? 0,
    role: c.promise?.role ?? 'rotacja', agentFee: c.agentFee ?? 0,
  };
}

/**
 * Wynik ostatniej rundy gracza (ekran rozmów). ok: porozumienie (podpis od razu, transakcja od testów medycznych),
 * inaczej koniec propozycji. Inne propozycje: przy podpisie odrzucone, przy fiasku zawodnik decyduje następnego dnia.
 * Zwraca { ok, text }; listy dla gracza trafiają od razu do poczty.
 */
export function finishLastRound(game, propId, contract, ok, date = game.date) {
  const x = (game.market?.pending ?? []).find((y) => y.id === propId);
  if (!x || x.status !== 'changes') return { ok: false, text: 'Propozycja jest już nieaktualna.' };
  const out = [];
  const others = (game.market.pending ?? []).filter((y) => y.pid === x.pid && y !== x && y.status === 'open');
  if (!ok) {
    close(x, 'failed', date);
    stat(game, 'propsUserFailed');
    for (const y of others) if (y.decide > addDays(date, 1)) y.decide = addDays(date, 1);
    return { ok: false, text: `Rozmowy z ${x.name} zakończone bez porozumienia.` };
  }
  x.contract = contract ?? x.contract;
  x.status = 'open';
  const why = invalidReason(game, x, date);
  if (why) { close(x, 'expired', date, { reason: why }); return { ok: false, text: INVALID_TEXT[why] }; }
  const deal = accept(game, x, date, out);
  if (deal) for (const y of others) lose(game, y, x, date, out);
  if (out.length) game.inbox = addMessages(game.inbox ?? [], out).inbox;
  if (!deal) return { ok: false, text: `${x.name}: propozycja wycofana. ${out[0]?.body ?? ''}`.trim() };
  return { ok: true, text: `${x.name} podpisał kontrakt. Teraz testy medyczne, zgłoszenie spodziewane ${fmtDate(expectedRegistration(deal))}.` };
}

// ------------------------------------------------------------ System dnia (src/career/transferSystem.js)
/** Dzień: wygasłe ostatnie rundy, decyzje zawodników, porządki. Zwraca listy dla gracza. */
export function proposalsDay(game, date) {
  const P = ensureProposals(game);
  const out = [];
  for (const x of P) {
    if (x.status !== 'changes' || x.deadline >= date) continue;
    close(x, 'expired', date, { reason: 'lastRound' });
    stat(game, 'propsExpired');
    if (x.user && x.to === game.clubId) out.push(letter(game, x, 'expired', `Propozycja dla ${x.name} wygasła`, `Nie było odpowiedzi na prośbę o zmiany w kontrakcie. ${x.name} nie czeka dłużej.`, 'info'));
    for (const y of P) if (y.pid === x.pid && y.status === 'open' && y.decide > date) y.decide = date;
  }
  const due = new Set();
  for (const x of P) if (x.status === 'open' && x.decide <= date) due.add(x.pid);
  for (const pid of due) decidePlayer(game, pid, date, out);
  const keep = addDays(date, -THINK.keepDays);
  game.market.pending = P.filter((x) => isOpen(x) || (x.end?.date ?? x.date) >= keep);
  return out;
}

