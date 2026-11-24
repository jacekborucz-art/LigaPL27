// Wolni zawodnicy poza oknem (docs/transfery.md, rozdz. „Wolni zawodnicy poza oknem”). Zawodnik, który został wolny
// po zamknięciu ostatniego okna (FIFA RSTP art. 6.1), może się dogadać z klubem w każdej chwili, ale dołącza dopiero
// w pierwszym dniu najbliższego okna transferowego. Do tego dnia jest bez klubu, nie gra, nie dostaje pensji i jest
// zarezerwowany dla klubu (inne kluby nie mogą go podpisać). Rezerwacja liczy się do limitu kadry (squadLimit.js).
// W dniu dołączenia: limit kadry, poważna kontuzja, testy medyczne; przy porażce umowa wygasa bez kosztów, a zawodnik
// wraca do wolnych. Kluby AI poza oknem podpisują wolnych tylko przy wyraźnej potrzebie (poniedziałki).
// Stan: game.market.joins (umowy w toku), p.joinOn = { clubId, date } (szybkie sprawdzenie „zajęty”). Liczby [SZAC].

import { Rng } from '../core/rng.js';
import { createMessage } from '../core/inbox.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { DOMESTIC } from '../config/calendar2026.js';
import { squadOf } from '../world/worldGen.js';
import { GROUP, MATCH_MIN, SQUAD_TARGETS, squadDeficits } from './squad.js';
import { squadCount } from './squadLimit.js';
import { wageRoom } from './finance.js';
import { payLevel } from '../data/finanse_klubow.js';
import { completeTransfer, playerWillingness } from './transfers.js';
import { hasOpenDeal, stat } from './transferDeals.js';
import { makeProposal } from './proposals.js';
import { aiNegotiate } from './negotiation.js';
import { boardCaps } from './boardRequests.js';
import { clubNegotiation } from './clubNegotiation.js';
import { kadFeeMul } from './director.js';
import { effectiveAsk } from './mindset.js';
import { scoutBlocked } from './foreignPool.js';
import { nextWindowOpen } from './wishMemory.js';
import { fmtDate } from '../ui/dom.js';

export const LATE_JOIN = {
  medFail: 0.03, medFailOld: 0.06, oldAge: 32, // testy medyczne w dniu dołączenia: 3 %, powyżej 32 lat 6 %
  injuryDays: 90, // poważna kontuzja przed dołączeniem (ponad ok. 90 dni przerwy): klub wycofuje się bez kosztów
  // Klub AI poza oknem, tylko przy wyraźnej potrzebie: tygodniowa szansa wg poziomu ligi
  // (podniesione na prośbę właściciela, Nov 24, 2026: cel ok. 4-10 podpisów na ligę w sezonie)
  chance: { 1: 0.12, 2: 0.2, 3: 0.2, 4: 0.12 },
  gkChance: 0.4, gkFit: 2, // mniej niż 2 zdrowych bramkarzy: ok. 40 % tygodniowo
  longInjury: 14, // „zdrowy” bramkarz przy ocenie potrzeby: bez kontuzji dłuższej niż 14 dni
  thinInjury: 28, // długa kontuzja (ponad 4 tygodnie) zostawia grupę poniżej minimum kadry (SQUAD_TARGETS.min)
  ovrBar: 0.9, maxAge: 36, // poziom: co najmniej 90 % mediany grupy w klubie, wiek do 36 lat
};

const groupOf = (p) => GROUP[p.pos] ?? 'MID';
const windowOn = (date) => (DOMESTIC.transferWindows ?? []).find((w) => date >= w.from && date <= w.to) ?? null;
const clubName = (id) => clubById(id)?.name ?? 'klub';

// ------------------------------------------------------------ Kto i kiedy
/** Wolny zawodnik bez klubu od dnia po zamknięciu ostatniego okna: poza oknem dołączy dopiero w następnym (FIFA RSTP art. 6.1). */
export function lateFree(game, p, date = game.date) {
  if (windowOn(date) || !p.freeSince) return false;
  if (p.scout) return false; // wolny kandydat skauta jest bez klubu od dawna: można go zgłosić w każdej chwili (FIFA RSTP art. 6.1)
  const last = (DOMESTIC.transferWindows ?? []).filter((w) => w.to < date).map((w) => w.to).sort().at(-1);
  return !!last && p.freeSince > last;
}

/** Dzień dołączenia: pierwszy dzień najbliższego okna transferowego. */
export const joinDateFor = (date) => nextWindowOpen(date);

/** Umowy w toku (stary zapis: pusta lista). */
export function ensureJoins(game) {
  const M = game.market;
  if (!M) return [];
  if (!Array.isArray(M.joins)) M.joins = [];
  syncJoinWages(game);
  return M.joins;
}
/**
 * Pensje czekających na dołączenie zarezerwowane w budżecie płac klubu (game.finance.clubs[id].joinWages, odejmowane
 * w wageRoom, src/career/finance.js): gracz i AI nie zarezerwują zawodników ponad budżet płac.
 */
function syncJoinWages(game) {
  const F = game.finance?.clubs;
  if (!F) return;
  const sum = {};
  for (const j of game.market?.joins ?? []) sum[j.to] = (sum[j.to] ?? 0) + (j.contract?.wage ?? 0);
  for (const [id, c] of Object.entries(F)) {
    if (sum[id]) c.joinWages = sum[id];
    else if (c.joinWages !== undefined) delete c.joinWages;
  }
}
/** Umowa w toku zawodnika albo null. */
export const joinOf = (game, pid) => (game.market?.joins ?? []).find((j) => j.pid === pid) ?? null;
/** Ilu zawodników czeka na dołączenie do klubu (liczą się do limitu kadry). */
export const joinsTo = (game, clubId) => (game.market?.joins ?? []).filter((j) => j.to === clubId).length;

/** Opis umowy w toku dla UI: „Dołączy do X DD mmm RRRR” (albo null). */
export function joinStatusText(game, p) {
  const j = p?.joinOn;
  if (!j) return null;
  return j.clubId === game.clubId ? `Dołączy do twojego klubu ${fmtDate(j.date)} (otwarcie okna)` : `Dołączy do ${clubName(j.clubId)} ${fmtDate(j.date)} (otwarcie okna)`;
}

// ------------------------------------------------------------ Rezerwacja
/**
 * Porozumienie z wolnym zawodnikiem poza oknem (propozycja przyjęta, src/career/proposals.js): zawodnik zostaje bez
 * klubu, zarezerwowany dla klubu do pierwszego dnia okna. Zwraca umowę { pid, name, pos, to, date, since, contract, prop }.
 */
export function reserveJoin(game, p, { to, contract, date = game.date, prop = null }) {
  const J = ensureJoins(game);
  const j = { pid: p.id, name: p.name, pos: p.pos, to, date: joinDateFor(date), since: date, contract, prop };
  J.push(j);
  p.joinOn = { clubId: to, date: j.date };
  syncJoinWages(game);
  stat(game, to === game.clubId ? 'lateJoinsUser' : 'lateJoins');
  return j;
}

/** List do gracza po porozumieniu: zawodnik dołączy w dniu otwarcia okna. */
export function joinAgreedMessage(game, j, date = game.date) {
  return createMessage({ date, key: `dolaczy:${j.pid}:${j.date}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'important',
    subject: `Umowa z ${j.name}: dołączy ${fmtDate(j.date)}`,
    body: `${j.name} przyjął twoją propozycję. Został wolny po zamknięciu okna transferowego, więc zgłosimy go dopiero w pierwszym dniu okna: ${fmtDate(j.date)}. Do tego dnia nie gra i nie dostaje pensji, a kontrakt i pensja zaczną się w dniu dołączenia. Inne kluby nie mogą go już podpisać. Miejsce w kadrze jest zarezerwowane (liczy się do limitu kadry), a jego pensja jest już odliczona od wolnego budżetu płac. Przed dołączeniem przejdzie testy medyczne.`,
    refs: { kind: 'lateJoin', pid: j.pid } });
}

function dropJoin(game, j) {
  game.market.joins = (game.market.joins ?? []).filter((x) => x !== j);
  const p = game.world.players[j.pid];
  if (p?.joinOn) delete p.joinOn;
  syncJoinWages(game);
}

// ------------------------------------------------------------ Dzień dołączenia (src/career/transferSystem.js, codziennie)
const VOID_TEXT = {
  gone: (j) => `${j.name} nie jest już na rynku. Umowa wygasła.`,
  moved: (j) => `${j.name} podpisał kontrakt gdzie indziej. Umowa wygasła.`,
  limit: (j, c) => `Kadra jest pełna (limit kadry ${c.counted - 1}/${c.hard}), więc umowa wygasła bez kosztów. ${j.name} wraca na listę wolnych zawodników.`,
  injury: (j, c, p) => `${j.name} ma poważną kontuzję (ok. ${Math.round(p.injuryDays)} dni przerwy). Klub wycofał się z umowy bez kosztów. ${j.name} wraca na listę wolnych zawodników.`,
  medical: (j) => `${j.name} nie przeszedł testów medycznych. Umowa wygasła bez kosztów. ${j.name} wraca na listę wolnych zawodników.`,
};

/** Szansa niezaliczenia testów medycznych w dniu dołączenia. */
export const joinMedicalFail = (p) => ((p.age ?? 25) > LATE_JOIN.oldAge ? LATE_JOIN.medFailOld : LATE_JOIN.medFail);

/**
 * Dzień: zawodnicy z umową na dziś dołączają (completeTransfer jak wolny zawodnik) albo umowa wygasa (limit kadry,
 * poważna kontuzja, testy medyczne; zawodnik wraca do wolnych od dziś). Zwraca listy dla gracza.
 */
export function joinsDay(game, date) {
  const J = game.market?.joins;
  if (!J?.length) return [];
  const W = game.world; const out = [];
  for (const j of [...J]) {
    if (j.date > date) continue;
    const p = W.players[j.pid];
    const user = j.to === game.clubId;
    let why = !p ? 'gone' : p.clubId || p.joinOn?.clubId !== j.to ? 'moved' : !W.clubs[j.to] ? 'club' : null;
    const c = why ? null : squadCount(game, j.to); // liczy już tego zawodnika (rezerwacja)
    if (!why && c.counted > c.hard) why = 'limit';
    if (!why && (p.injuryDays ?? 0) > LATE_JOIN.injuryDays) why = 'injury';
    if (!why && new Rng(`dolaczenie:${game.seed}:${j.pid}:${j.date}`).chance(joinMedicalFail(p))) why = 'medical';
    dropJoin(game, j);
    if (why) {
      stat(game, `lateVoid_${why}`);
      if (p && !p.clubId) {
        p.freeSince = date; // wraca do wolnych: bez klubu od dziś
        if (!game.market.free.includes(p.id)) game.market.free.push(p.id);
      }
      if (user && why !== 'club') out.push(createMessage({ date, key: `dolaczenie-nie:${j.pid}:${j.date}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'important', subject: `${j.name} nie dołączy do ${clubName(j.to)}`, body: VOID_TEXT[why](j, c, p), refs: { kind: 'lateJoin', pid: j.pid } }));
      continue;
    }
    // Kontrakt i pensja od dnia dołączenia
    const ct = j.contract ?? {};
    const contract = { ...ct, signed: date, agreed: j.since, ...(ct.promise ? { promise: { ...ct.promise, since: date } } : {}) };
    const e = completeTransfer(game, { playerId: j.pid, to: j.to, fee: 0, contract, kind: 'free', date });
    e.late = true;
    stat(game, user ? 'lateJoinedUser' : 'lateJoined');
    if (user) out.push(createMessage({ date, key: `dolaczyl:${j.pid}:${date}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'important', subject: `Oficjalnie: ${j.name} zawodnikiem klubu ${clubName(j.to)}`, body: `Otworzyło się okno transferowe. ${j.name} przeszedł testy medyczne, jest zgłoszony do rozgrywek i może grać od najbliższego meczu. Kontrakt i pensja obowiązują od dziś.`, refs: { kind: 'lateJoin', pid: j.pid } }));
  }
  return out;
}

// ------------------------------------------------------------ Kluby AI poza oknem (poniedziałki)
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Wyraźna potrzeba klubu: mniej niż 2 zdrowych bramkarzy (gk), brak w kadrze (minimum grupy, squadDeficits) albo
 * długie kontuzje zostawiają grupę poniżej minimum na mecz (ponad 14 dni) albo poniżej minimum kadry (ponad 42 dni). Zwraca { group, gk } albo null.
 */
export function lateNeed(squad) {
  const fit = (p) => !(p.injuryDays > LATE_JOIN.longInjury);
  if (squad.filter((p) => groupOf(p) === 'GK' && fit(p)).length < LATE_JOIN.gkFit) return { group: 'GK', gk: true };
  const d = squadDeficits(squad).find((n) => n.scope === 'squad' && n.group !== 'ALL');
  if (d) return { group: d.group, gk: false };
  const fitLong = (p) => !(p.injuryDays > LATE_JOIN.thinInjury);
  for (const g of ['DEF', 'MID', 'ATT']) if (squad.filter((p) => groupOf(p) === g && fit(p)).length < MATCH_MIN[g] || squad.filter((p) => groupOf(p) === g && fitLong(p)).length < SQUAD_TARGETS[g].min) return { group: g, gk: false };
  return null;
}

/**
 * Poniedziałek poza oknem: klub AI z wyraźną potrzebą (lateNeed) z tygodniową szansą wg ligi (LATE_JOIN.chance,
 * bramkarz LATE_JOIN.gkChance) składa propozycję wolnemu zawodnikowi z jego grupy: poziom co najmniej 90 % mediany
 * grupy, wiek do 36 lat, oczekiwana pensja (askWage, bez zniżek) w wolnym budżecie płac. Dalej jak w oknie: namysł
 * zawodnika (proposals.js); zwykły wolny dołącza od razu (transakcja), wolny po zamknięciu okna w dniu otwarcia okna.
 * Zwraca nowe propozycje.
 */
export function aiLateWeek(game, date) {
  if (windowOn(date)) return [];
  const W = game.world; const M = game.market;
  const busy = (p) => p.transfer || p.preContract || p.joinOn || hasOpenDeal(game, p.id); // jak busy w aiBuy (transfers.js)
  const free = (M.free ?? []).map((id) => W.players[id]).filter((p) => p && !p.clubId && !busy(p) && (p.age ?? 99) <= LATE_JOIN.maxAge);
  if (!free.length) return [];
  const waiting = new Set((M.pending ?? []).filter((x) => x.status === 'open' || x.status === 'changes').map((x) => x.to));
  const taken = new Set();
  const props = [];
  for (const c of CLUBS_PL) {
    const chance = LATE_JOIN.chance[c.tier];
    if (!chance || c.id === game.clubId || !W.clubs[c.id] || waiting.has(c.id)) continue;
    const squad = squadOf(W, c.id);
    const need = lateNeed(squad);
    if (!need) continue;
    const rng = new Rng(`wolni-poza-oknem:${game.seed}:${c.id}:${date}`);
    if (!rng.chance(need.gk ? LATE_JOIN.gkChance : chance)) continue;
    if (squadCount(game, c.id).full) continue;
    const room = wageRoom(game.finance, W, c.id); // pensje czekających na dołączenie już odjęte (joinWages)
    const bar = LATE_JOIN.ovrBar * median(squad.filter((p) => groupOf(p) === need.group).map((p) => p.ovr));
    const ask = (p) => p.askWage ?? effectiveAsk(p, c.tier, payLevel(c));
    const pool = free.filter((p) => !taken.has(p.id) && groupOf(p) === need.group && p.ovr >= bar && ask(p) <= room && !scoutBlocked(p, c.id, date))
      .sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id)).slice(0, 5);
    for (const p of pool) {
      if (playerWillingness(game, p, c.id).verdict === 'odmowa') continue;
      const caps = boardCaps(game, c.id, p, 'sign');
      const budget = Math.min(room, caps.wage);
      const neg = aiNegotiate({ kind: 'sign', player: { ...p, contract: { wage: ask(p), until: date } }, club: c, fromClub: null, date, rng, budget: { wage: budget, maxYears: caps.years, total: caps.total }, neg: clubNegotiation(game, c.id), feeMul: kadFeeMul(game, c.id) });
      if (neg.result !== 'signed') continue;
      const prop = makeProposal(game, { playerId: p.id, to: c.id, fee: 0, contract: neg.contract, kind: 'free', date, maxWage: budget, maxTotal: caps.total, demand: neg.demand });
      if (!prop) continue;
      taken.add(p.id);
      props.push(prop);
      stat(game, 'lateAiProps');
      break;
    }
  }
  return props;
}
