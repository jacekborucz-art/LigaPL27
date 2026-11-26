// Długi klubów i zaległości wobec zawodników (Nov 26, 2026; ekspert prawa sportowego i ekspert finansów klubów,
// docs/wlasciciele-i-dlugi.md). Te same zasady dla gracza i klubów AI. Liczby [SZAC], przepisy [DO SPRAWDZENIA].
// - Co miesiąc (1.): saldo poniżej -0,5 miesięcznych kosztów (płace i koszty klubu): ostrzeżenie; poniżej -1 przez
//   2 miesiące z rzędu: zaległości (licznik miesięcy). Pełna spłata (saldo co najmniej zero) zeruje licznik od razu.
// - Od 2. miesiąca zaległości: wezwania zawodników do zapłaty (termin do 15. dnia kolejnego miesiąca, FIFA RSTP
//   art. 14bis) i zakaz transferowy (bez zgłaszania nowych zawodników; squadLimit.js). Po terminie co miesiąc
//   (16.) każdy zawodnik może rozwiązać kontrakt z winy klubu: 35 %, gwiazda +20 pp, z agentem +10 pp, lojalny
//   -15 pp, +15 pp za każdy kolejny miesiąc, najwyżej 90 %. Zawodnik jest wolny (zgłoszenie także poza oknem),
//   klub dopisuje do długu 3 miesięczne pensje odszkodowania.
// - Od 4. miesiąca: -3 punkty w tabeli ligi co 2 miesiące (game.season.deductions, standings.js).
// - Licencja (Ekstraklasa, 1 Liga, 2 Liga): 31 marca ostrzeżenie, 30 czerwca zaległości = brak licencji: Ekstraklasa
//   -6 punktów w kolejnym sezonie, niżej spadek o 1 klasę; drugi sezon z rzędu: 2 klasy (najniżej III liga).
// - Kadra poniżej 18 zawodników (2 bramkarzy): awaryjne uzupełnienie z drugiej drużyny (2 klasy słabsi) albo juniorzy
//   (3 klasy słabsi), tanie kontrakty.
// - Właściciel pokrywa dług na start sezonu (gracz i AI, jak dotąd), a długi klubów AI także co miesiąc; najwyżej
//   3 sezony z rzędu ze sporą dopłatą do długu (ponad 15 % rocznych kosztów), potem odmawia (do wyjścia na plus na
//   start sezonu albo zmiany właściciela). Miasto po wycofaniu wsparcia nie dopłaca.
// Zapis: game.debt = { clubs: { id: stan zaległości }, bail: { id: dopłaty }, lic: { id: licencja }, carry, events, stats }.

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { clubById } from '../data/clubs_pl.js';
import { SEASON, SEASON_YEAR, SEASON_END } from '../config/calendar2026.js';
import { SQUAD_LAYOUT, squadOf } from '../world/worldGen.js';
import { genPlayer } from '../world/playerGen.js';
import { GROUP, squadDeficits } from './squad.js';
import { book, wageBill } from './finance.js';
import { personalityOf } from './personality.js';
import { reservesOf } from './reserves.js';
import { compOfClub } from '../season/leagueComps.js';
import { setPointDeductions } from '../season/standings.js';
import { spellsOf, syncSpell } from '../season/history.js';
import { fmtDate } from '../ui/dom.js';

export const DEBT = {
  warn: 0.5, start: 1, startMonths: 2, // saldo w miesięcznych kosztach: ostrzeżenie, próg zaległości, miesiące z rzędu
  noticeMonth: 2, deadlineDay: 15, // wezwania od 2. miesiąca zaległości, termin: 15. dzień kolejnego miesiąca
  quit: { base: 0.35, star: 0.2, agent: 0.1, loyal: -0.15, perMonth: 0.15, max: 0.9, starShare: 0.3, loyalty: 14 },
  compMonths: 3, // odszkodowanie dla zawodnika: 3 miesięczne pensje jako dług klubu
  banMonth: 2, pointsFrom: 4, pointsEvery: 2, points: 3,
  licence: { maxTier: 3, ekPoints: 6, lowestTier: 4 },
  // Dopłaty do długów klubów AI działają stale (AI wydaje mniej rozsądnie niż gracz; do czasu lepszej logiki wydatków AI,
  // Nov 26, 2026); po sezonie z dopłatą właściciel z małą szansą odmawia (pAny + p x ciężkie sezony z rzędu, maks. pMax)
  bail: { pAny: 0.008, p: 0.05, pMax: 0.15, heavy: 0.15 }, // pAny: każdy klub z dopłatą w sezonie; razem ok. 1 klub w tarapatach na 3-6 sezonów (symulacja)
  fill: { total: 18, gk: 2, reserves: 2, juniors: 3 },
  sale: { listed: 2, disc: [0.10, 0.20] }, // klub AI w zaległościach: do 2 najdroższych na liście transferowej, taniej o 10-20 % (Nov 26, 2026)
  TIER_L: { 1: 11.5, 2: 10, 3: 8.5, 4: 7.5, 5: 6.5, 6: 5.5, 7: 4.5 }, // siła ligi (jak LEAGUE_L w rollover.js) i niższych klas
};

const groupOf = (p) => GROUP[p.pos] ?? 'MID';
const monthsWord = (n) => `${n} ${n === 1 ? 'miesiąc' : n >= 2 && n <= 4 ? 'miesiące' : 'miesięcy'}`;
const zl = (v) => `${(Math.round(v / 100000) / 10).toLocaleString('pl-PL')} mln zł`;
const nameOf = (id) => clubById(id)?.name ?? id;

export function ensureDebt(game) {
  const D = (game.debt ??= {});
  D.clubs ??= {}; D.bail ??= {}; D.lic ??= {}; D.carry ??= {}; D.events ??= []; D.stats ??= {};
  return D;
}
const stat = (D, k, n = 1) => { const s = (D.stats[SEASON] ??= {}); s[k] = (s[k] ?? 0) + n; };
const event = (D, e) => { D.events.unshift(e); D.events.length = Math.min(D.events.length, 150); };

/** Miesięczne koszty klubu: pensje zawodników (tygodniowe x 52 / 12) i koszty klubu z planu sezonu. */
export function monthlyCost(game, clubId) {
  const c = game.finance?.clubs?.[clubId];
  if (!c) return 0;
  return wageBill(game.world, clubId) * 52 / 12 + (c.plan?.ops ?? 0) / 12;
}

/** Stan zaległości klubu do widoku: { months, below, ban, deadline, warn } albo null. */
export const arrearsOf = (game, clubId) => game.debt?.clubs?.[clubId] ?? null;
export const transferBan = (game, clubId) => !!game.debt?.clubs?.[clubId]?.ban;
/** Klub bez licencji po tym sezonie (decyzja z 30 czerwca). */
export const licenceFailed = (game, clubId) => { const L = game.debt?.lic?.[clubId]; return !!(L?.fail && L.y === SEASON_YEAR); };

// ------------------------------------------------------------ Dopłaty właściciela do długów (kluby AI)
/**
 * 1. dnia miesiąca: długi klubów AI pokrywa właściciel (a rezerw pierwsza drużyna) z zapasem na miesiąc pensji.
 * Sezon z dopłatą do długu ponad 15 % rocznych kosztów jest „ciężki”; po każdym takim sezonie właściciel z małą szansą
 * (0,8 % przy każdej dopłacie + 5 % x ciężkie sezony z rzędu, maks. 15 %) odmawia dalszych dopłat (do wyjścia klubu na plus albo zmiany właściciela). Miasto po wycofaniu wsparcia nie dopłaca.
 */
export function ownerBailouts(game, date) {
  const D = ensureDebt(game);
  const F = game.finance;
  for (const [id, c] of Object.entries(F.clubs)) {
    const cushion = Math.round((c.plan?.wages ?? 0) / 12 / 1000) * 1000;
    if (id === game.clubId || c.balance >= cushion) continue;
    const need = cushion - c.balance; const inDebt = c.balance < 0;
    const parent = clubById(id)?.parent;
    if (!parent) {
      const b = (D.bail[id] ??= { y: SEASON_YEAR, sum: 0, heavy: 0 });
      if (b.off || game.ownerOverride?.[id]?.withdrawn) { if (inDebt) c.transferBudget = 0; continue; }
      if (inDebt) { b.sum += -c.balance; b.y = SEASON_YEAR; }
    }
    if (parent && F.clubs[parent]) book(F, parent, date, 'out', 'ops', need, `Dopłata do rezerw (${clubById(id).name})`);
    book(F, id, date, 'in', 'owner', need, parent ? 'Dopłata pierwszej drużyny' : 'Dopłata właściciela do długów');
    if (inDebt) c.transferBudget = 0;
  }
}

/** Nowy sezon: podsumowanie dopłat (ciężkie sezony z rzędu, odmowa po 3), powrót właściciela po wyjściu na plus. */
function closeBailouts(game, oldCosts, startCover = {}) {
  const D = ensureDebt(game);
  // Dług pokryty przez właściciela na start kończącego się sezonu (rollover) liczy się do tamtego sezonu
  for (const [id, v] of Object.entries(D.startCover ?? {})) if (v > 0) (D.bail[id] ??= { y: SEASON_YEAR, sum: 0, heavy: 0 }).sum += v;
  for (const [id, b] of Object.entries(D.bail)) {
    const cost = oldCosts[id] ?? 0;
    const heavy = cost > 0 && b.sum > DEBT.bail.heavy * cost;
    const bailed = b.sum > 0;
    b.heavy = heavy ? (b.heavy ?? 0) + 1 : 0;
    b.sum = 0;
    const pRefuse = bailed ? DEBT.bail.pAny + (heavy ? Math.min(DEBT.bail.pMax, DEBT.bail.p * b.heavy) : 0) : 0;
    if (pRefuse > 0 && !b.off && new Rng(`odmowa-doplat:${game.seed}:${id}:${SEASON_YEAR}`).chance(pRefuse)) { b.off = true; stat(D, 'bailRefused'); } // rzadkie tarapaty klubu AI
    const bal = game.finance.clubs[id]?.balance ?? 0;
    if (b.off && bal >= 0 && !heavy) { b.off = false; b.heavy = 0; }
  }
  D.startCover = startCover; // pokrycie z tego startu sezonu: do podsumowania za rok
}

// ------------------------------------------------------------ Ujemne punkty
/** Ujemne punkty w tabeli ligi klubu w bieżącym sezonie (game.season.deductions). */
export function addDeduction(game, clubId, pts) {
  const comp = compOfClub(clubById(clubId));
  if (!comp || !game.season) return null;
  const all = (game.season.deductions ??= {});
  const m = (all[comp] ??= {});
  m[clubId] = (m[clubId] ?? 0) + pts;
  setPointDeductions(all);
  return comp;
}

// ------------------------------------------------------------ Uzupełnienie kadry
/**
 * Awaryjne uzupełnienie kadry do 18 zawodników (w tym 2 bramkarzy): z drugiej drużyny (2 klasy słabsi), a bez niej
 * juniorzy (3 klasy słabsi), tanie kontrakty do końca kolejnego sezonu. Zgłoszenie własnych zawodników nie jest
 * transferem, więc działa też przy zakazie transferowym. total: liczba zawodników (1 lipca przy zakazie jak zwykłe
 * uzupełnienie: 23 w klubie AI, 18 u gracza). Zwraca dodanych zawodników.
 */
export function emergencySquadFill(game, clubId, date, rng = new Rng(`awaryjna-kadra:${game.seed}:${clubId}:${date}`), total = DEBT.fill.total) {
  const W = game.world; const c = clubById(clubId);
  if (!c || !W.clubs[clubId]) return [];
  const tier = Math.min(4, c.tier ?? 4);
  const fromRes = !!reservesOf(game, clubId).id;
  const k = fromRes ? DEBT.fill.reserves : DEBT.fill.juniors;
  const L = DEBT.TIER_L[tier + k] ?? 4.5;
  const until = `${SEASON_YEAR + 2}-06-30`;
  const added = [];
  for (let guard = 1, sq = squadOf(W, clubId); guard <= 30; guard++, sq = squadOf(W, clubId)) {
    const gk = sq.filter((p) => groupOf(p) === 'GK').length;
    if (sq.length >= total && gk >= DEBT.fill.gk) break;
    const need = gk < DEBT.fill.gk ? 'GK' : squadDeficits(sq).find((n) => n.scope === 'squad' && n.group !== 'ALL' && n.group !== 'GK')?.group ?? rng.pick(['DEF', 'MID', 'ATT', 'MID', 'DEF']);
    const [pos, side] = rng.pick(SQUAD_LAYOUT.filter(([x]) => (GROUP[x] ?? 'MID') === need));
    const p = genPlayer(rng, { id: `${clubId}-z${date.replaceAll('-', '')}-${guard}`, L, pos, age: fromRes ? rng.int(18, 22) : rng.int(17, 19), slotOffset: 0, nat: 'POL', tier: Math.min(4, tier + k), side: side ?? null, club: c, date });
    if (W.players[p.id]) p.id = `${p.id}-${rng.int(100, 999)}`;
    p.contract.until = until; p.contract.clause = 0;
    p.clubId = clubId; p.squad = 'A'; p.emergency = fromRes ? 'rezerwy' : 'juniorzy';
    p.cl = [{ c: clubId, f: date, m: 0, g: 0 }];
    W.players[p.id] = p; W.clubs[clubId].squad.push(p.id);
    added.push(p);
  }
  if (added.length) stat(ensureDebt(game), 'filled', added.length);
  return added;
}

// ------------------------------------------------------------ Rozwiązania kontraktów z winy klubu
/** Szansa, że zawodnik rozwiąże kontrakt w tym miesiącu (po terminie wezwania). extra: miesiące ponad 3. */
export function quitChance(p, { star = false, extra = 0 } = {}) {
  const Q = DEBT.quit;
  const per = personalityOf(p);
  let x = Q.base + (star ? Q.star : 0) + (per.agent && per.agent !== 'brak' ? Q.agent : 0) + ((per.traits?.loyalty ?? 10) >= Q.loyalty ? Q.loyal : 0) + Q.perMonth * Math.max(0, extra);
  return clamp(x, 0, Q.max);
}

/** Zawodnik rozwiązuje kontrakt z winy klubu: wolny (także poza oknem), klub dopisuje 3 pensje odszkodowania. */
export function terminateForCause(game, p, date) {
  const cid = p.clubId; const W = game.world;
  spellsOf(p);
  const comp = Math.round((p.contract?.wage ?? 0) * 52 / 12 * DEBT.compMonths / 1000) * 1000;
  if (comp) book(game.finance, cid, date, 'out', 'arrearsComp', comp, `${p.name}: odszkodowanie (rozwiązanie kontraktu z winy klubu)`);
  if (W.clubs[cid]) W.clubs[cid].squad = W.clubs[cid].squad.filter((id) => id !== p.id);
  game.market.history.unshift({ date, playerId: p.id, name: p.name, pos: p.pos, from: cid, to: null, fee: 0, kind: 'release', cause: 'zaległości' });
  p.askWage = p.contract?.wage ?? p.askWage ?? 0; p.contract = null; p.wage = 0; p.clubId = null; p.free = true; p.freeSince = date; p.justCause = date;
  delete p.moveWish; delete p.preContract; delete p.sellOn; p.transferRequest = false;
  syncSpell(p, date);
  delete game.market.listed[p.id]; delete game.market.userListed?.[p.id];
  if (!game.market.free.includes(p.id)) game.market.free.push(p.id);
  return comp;
}

function terminations(game, clubId, s, date) {
  const W = game.world;
  // Wezwania wysłali zawodnicy z kontraktem sprzed zaległości (nowi, także z awaryjnego uzupełnienia, znają sytuację)
  const squad = squadOf(W, clubId).filter((p) => p && p.contract && !p.loan && !p.emergency && !((p.contract.signedOn ?? '') >= s.since));
  const top = new Set([...squad].sort((a, b) => b.ovr - a.ovr).slice(0, Math.ceil(squad.length * DEBT.quit.starShare)).map((p) => p.id));
  const extra = s.months - 3;
  const gone = []; let comp = 0;
  for (const p of squad) {
    const rng = new Rng(`zaleglosci:${game.seed}:${clubId}:${p.id}:${date}`);
    if (!rng.chance(quitChance(p, { star: top.has(p.id), extra }))) continue;
    comp += terminateForCause(game, p, date);
    gone.push(p);
  }
  const added = gone.length ? emergencySquadFill(game, clubId, date) : [];
  return { gone, comp, added };
}

// ------------------------------------------------------------ Miesiąc i dzień
function clearArrears(game, D, id, date, out) {
  const s = D.clubs[id];
  delete D.clubs[id];
  if (!s?.months) return;
  stat(D, 'paid');
  event(D, { date, club: id, kind: 'paid' });
  if (id === game.clubId) out.push(boardMsg(date, `zaleglosci-splata:${id}:${date}`, 'Zaległości wobec zawodników spłacone', `Klub spłacił zaległości w pensjach. ${s.ban ? 'Zakaz transferowy przestaje obowiązywać. ' : ''}Wezwania zawodników są nieaktualne.`, 'important'));
}

const boardMsg = (date, key, subject, body, priority = 'important') => createMessage({ date, key, category: 'board', from: 'Zarząd', priority, subject, body });

/** 1. dnia miesiąca: ostrzeżenie, początek zaległości, wezwania i zakaz transferowy, ujemne punkty. */
/**
 * Sprzedaż przymusowa (klub AI w zaległościach): co miesiąc na liście transferowej najwyżej DEBT.sale.listed najdroższych
 * zawodników klubu (bez wypożyczonych i świeżo zgłoszonych awaryjnie), cena wartość x (1 - 10..20 %). Kupcy biorą ich
 * w oknie jak innych z listy (transfers.js aiBuy). Zwraca liczbę nowo wystawionych.
 */
export function distressSale(game, clubId, date) {
  const M = game.market;
  if (!M?.listed || clubId === game.clubId) return 0;
  const squad = squadOf(game.world, clubId).filter((p) => !p.loan && !p.emergency && !p.transfer && (p.value ?? 0) > 0);
  const already = squad.filter((p) => M.listed[p.id]?.distress).length;
  const room = DEBT.sale.listed - already;
  if (room <= 0) return 0;
  const rng = new Rng(`sprzedaz-dlug:${game.seed}:${clubId}:${date}`);
  let n = 0;
  for (const p of squad.filter((x) => !M.listed[x.id]).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, room)) {
    const disc = DEBT.sale.disc[0] + rng.next() * (DEBT.sale.disc[1] - DEBT.sale.disc[0]);
    M.listed[p.id] = { kind: 'sale', reasons: ['Klub ma zaległości w pensjach'], since: date, club: clubId, price: Math.round(((p.value ?? 0) * (1 - disc)) / 10000) * 10000, distress: true };
    n++;
  }
  if (n) stat(ensureDebt(game), 'distressListed', n);
  return n;
}

export function debtMonth(game, date) {
  const D = ensureDebt(game);
  const F = game.finance;
  const out = [];
  for (const [id, c] of Object.entries(F.clubs)) {
    if (!game.world.clubs[id] || clubById(id)?.parent) continue; // rezerwy: płaci pierwsza drużyna
    const bal = c.balance;
    if (bal >= 0) { if (D.clubs[id]) clearArrears(game, D, id, date, out); continue; }
    const cost = Math.max(1, monthlyCost(game, id));
    let s = D.clubs[id];
    if (!s && bal >= -DEBT.warn * cost) continue;
    s ??= (D.clubs[id] = { below: 0, months: 0 });
    const mine = id === game.clubId;
    if (bal < -DEBT.warn * cost && !s.warned) {
      s.warned = date;
      if (mine && !s.months) out.push(boardMsg(date, `zaleglosci-ostrzezenie:${id}:${date}`, 'Klubowi brakuje pieniędzy na pensje', `Saldo klubu (${zl(bal)}) jest poniżej połowy miesięcznych kosztów (${zl(cost)}). Jeśli przez 2 miesiące z rzędu dług przekroczy miesięczne koszty, klub nie wypłaci pensji w terminie: zawodnicy będą mogli wezwać klub do zapłaty, a potem odejść, a związek nałoży zakaz transferowy i kary punktowe.\n\nSprzedaj zawodnika, obniż płace albo poproś zarząd o pieniądze.`, 'important'));
    }
    if (!s.months) {
      if (bal < -DEBT.start * cost) s.below++; else s.below = 0;
      if (s.below < DEBT.startMonths) continue;
      s.months = 1; s.since = date;
      stat(D, 'arrears'); event(D, { date, club: id, kind: 'arrears' });
      if (mine) out.push(boardMsg(date, `zaleglosci-start:${id}:${date}`, 'Zaległości w pensjach zawodników', `Klub nie wypłacił pensji w terminie (saldo ${zl(bal)}, miesięczne koszty ${zl(cost)}). Za miesiąc zawodnicy mogą wezwać klub do zapłaty, a związek nałoży zakaz transferowy. Spłata zaległości (saldo co najmniej zero) kończy problem od razu.`, 'urgent'));
      continue;
    }
    s.months++;
    if (!mine) distressSale(game, id, date); // klub AI sprzedaje najdroższych, żeby spłacić zaległości
    if (s.months === DEBT.noticeMonth) {
      const [y, m] = date.split('-').map(Number);
      s.deadline = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-${String(DEBT.deadlineDay).padStart(2, '0')}`;
      s.notice = date; s.ban = true;
      stat(D, 'bans'); event(D, { date, club: id, kind: 'ban' });
      if (mine) out.push(boardMsg(date, `zaleglosci-wezwania:${id}:${date}`, 'Zawodnicy wzywają klub do zapłaty. Zakaz transferowy', `Klub zalega z pensjami od ${monthsWord(s.months)}. Zawodnicy wysłali wezwania do zapłaty: klub ma czas do ${fmtDate(s.deadline)}. Po tym terminie każdy z nich może rozwiązać kontrakt z winy klubu i odejść za darmo (klub zapłaci mu jeszcze 3 pensje odszkodowania).\n\nDo spłaty zaległości obowiązuje zakaz transferowy: nie zgłosisz nowych zawodników. Od 4. miesiąca zaległości: 3 punkty kary co 2 miesiące.`, 'urgent'));
    }
    if (s.months >= DEBT.pointsFrom && (s.months - DEBT.pointsFrom) % DEBT.pointsEvery === 0) {
      const comp = addDeduction(game, id, DEBT.points);
      if (comp) {
        s.pts = (s.pts ?? 0) + DEBT.points;
        stat(D, 'points', DEBT.points); event(D, { date, club: id, kind: 'points', n: DEBT.points });
        if (mine) out.push(boardMsg(date, `zaleglosci-punkty:${id}:${date}`, `Kara: minus ${DEBT.points} punkty w tabeli`, `Związek odjął drużynie ${DEBT.points} punkty za zaległości wobec zawodników (${monthsWord(s.months)}). Kolejna kara za 2 miesiące, jeśli klub nie spłaci długu.`, 'important'));
      }
    }
  }
  return out;
}

/** Codziennie: spłata zaległości, rozwiązania kontraktów (15.), kontrole licencyjne (31 marca, 30 czerwca). */
export function debtDay(game, date) {
  const D = ensureDebt(game);
  const out = [];
  for (const [id, s] of Object.entries(D.clubs)) {
    const c = game.finance.clubs[id];
    if (!c || !game.world.clubs[id]) { delete D.clubs[id]; continue; }
    if (c.balance >= 0) { clearArrears(game, D, id, date, out); continue; }
    // Po terminie wezwań (do 15. dnia), od 16. dnia co miesiąc
    if (s.months >= DEBT.noticeMonth + 1 && s.deadline && date > s.deadline && date.endsWith(`-${String(DEBT.deadlineDay + 1).padStart(2, '0')}`)) {
      const r = terminations(game, id, s, date);
      if (r.gone.length) {
        stat(D, 'terminations', r.gone.length); event(D, { date, club: id, kind: 'term', n: r.gone.length });
        if (id === game.clubId) {
          out.push(createMessage({ date, key: `zaleglosci-odejscia:${id}:${date}`, category: 'players', from: 'Dyrektor sportowy', priority: 'urgent',
            subject: `Zawodnicy rozwiązali kontrakty z winy klubu (${r.gone.length})`,
            body: `Po terminie wezwań odeszli: ${r.gone.map((p) => `${p.name} (${p.pos})`).join(', ')}. Są wolnymi zawodnikami i mogą podpisać umowę z każdym klubem, także poza oknem. Odszkodowania (3 pensje) zwiększają dług klubu o ${zl(r.comp)}.${r.added.length ? `\n\nKadrę uzupełniono awaryjnie (${r.added[0].emergency === 'rezerwy' ? 'zawodnicy drugiej drużyny' : 'juniorzy'}): ${r.added.map((p) => `${p.name} (${p.pos}, ${p.age} lat)`).join(', ')}.` : ''}\n\nKolejne odejścia możliwe 16. dnia każdego miesiąca do spłaty zaległości.` }));
        }
      }
    }
  }
  const lic = licenceDay(game, date);
  if (lic) out.push(...lic);
  return out;
}

/** Kontrole licencyjne: 31 marca ostrzeżenie, 30 czerwca decyzja (zaległości = brak licencji). */
function licenceDay(game, date) {
  const y = SEASON_YEAR;
  const march = date === `${y + 1}-03-31`; const june = date === SEASON_END;
  if (!march && !june) return null;
  const D = ensureDebt(game);
  const out = [];
  for (const [id] of Object.entries(game.finance.clubs)) {
    const c = clubById(id);
    if (!c || c.parent || c.tier > DEBT.licence.maxTier || !game.world.clubs[id]) continue;
    const s = D.clubs[id];
    const owing = (s?.months ?? 0) > 0;
    const L = D.lic[id];
    if (march) {
      if (!owing) continue;
      D.lic[id] = { ...(L?.y === y ? L : {}), y, warn: date, last: L?.last ?? null };
      stat(D, 'licWarn'); event(D, { date, club: id, kind: 'licWarn' });
      if (id === game.clubId) out.push(boardMsg(date, `licencja-ostrzezenie:${id}:${y}`, 'Licencja na kolejny sezon zagrożona', `Komisja licencyjna sprawdziła zobowiązania na 31 marca: klub zalega z pensjami. Jeśli zaległości nie zostaną spłacone do ${fmtDate(SEASON_END)}, klub nie dostanie licencji (${c.tier === 1 ? 'Ekstraklasa: minus 6 punktów w kolejnym sezonie, przy drugiej odmowie z rzędu spadek o 2 klasy' : 'spadek o klasę niżej'}).`, 'urgent'));
      continue;
    }
    if (!owing) {
      if (L?.y === y && L.warn && !L.fail) { L.ok = date; if (id === game.clubId) out.push(boardMsg(date, `licencja-ok:${id}:${y}`, 'Licencja przyznana', 'Klub spłacił zaległości przed terminem. Komisja licencyjna przyznała licencję na kolejny sezon.', 'info')); }
      continue;
    }
    const repeat = (D.lic[id]?.last ?? null) === y - 1;
    D.lic[id] = { ...(L?.y === y ? L : {}), y, fail: date, last: y, repeat };
    stat(D, 'licFail'); event(D, { date, club: id, kind: 'licFail', repeat });
    if (id === game.clubId) {
      const drop = licenceDrop(c.tier, repeat);
      const what = drop ? `klub spada o ${drop === 1 ? 'jedną klasę' : `${drop} klasy`} niżej` : `drużyna zaczyna kolejny sezon z ${DEBT.licence.ekPoints} punktami kary`;
      out.push(boardMsg(date, `licencja-odmowa:${id}:${y}`, 'Brak licencji na kolejny sezon', `Klub nie spłacił zaległości wobec zawodników do ${fmtDate(SEASON_END)}. Komisja licencyjna odmówiła licencji${repeat ? ' drugi sezon z rzędu' : ''}: ${what}. Klub bez licencji nie zagra też w europejskich pucharach.`, 'urgent'));
    }
  }
  return out;
}

/** O ile klas spada klub bez licencji (Ekstraklasa przy pierwszej odmowie: 0, kara punktowa). */
export function licenceDrop(tier, repeat) {
  const n = tier === 1 ? (repeat ? 2 : 0) : repeat ? 2 : 1;
  return Math.max(0, Math.min(n, DEBT.licence.lowestTier - tier));
}

/** Koniec sezonu (rollover, przed ruchami lig): { drops: { id: klasy }, points: { id: punkty } } dla klubów bez licencji. */
export function licenceVerdicts(game, oldYear) {
  const D = game.debt;
  const drops = {}; const points = {};
  for (const [id, L] of Object.entries(D?.lic ?? {})) {
    if (L.y !== oldYear || !L.fail) continue;
    const c = clubById(id);
    if (!c) continue;
    const n = licenceDrop(c.tier, L.repeat);
    if (n) drops[id] = n; else if (c.tier === 1) points[id] = DEBT.licence.ekPoints;
  }
  return { drops, points };
}

/**
 * Nowy sezon (rollover, po finansach i nowym terminarzu): dopłaty do długów podsumowane, długi spłacone przez nowego
 * właściciela kończą zaległości, kara punktowa Ekstraklasy za brak licencji, ujemne punkty w nowej tabeli.
 */
export function debtNewSeason(game, date, { oldCosts = {}, licPoints = {}, startCover = {} } = {}) {
  const D = ensureDebt(game);
  closeBailouts(game, oldCosts, startCover);
  const out = [];
  for (const id of Object.keys(D.clubs)) {
    const c = game.finance.clubs[id];
    if (!c || !game.world.clubs[id]) delete D.clubs[id];
    else if (c.balance >= 0) clearArrears(game, D, id, date, out);
  }
  for (const [id, pts] of Object.entries(licPoints)) {
    if (!addDeduction(game, id, pts)) continue;
    event(D, { date, club: id, kind: 'licPoints', n: pts });
  }
  setPointDeductions(game.season?.deductions ?? null);
  return out;
}

registerDailySystem({
  id: 'arrears', order: 52,
  run(game, date) {
    if (!game.world || !game.finance || !game.market) return {};
    const messages = date.endsWith('-01') ? debtMonth(game, date) : [];
    messages.push(...debtDay(game, date));
    return { messages };
  },
});

export { addDays };
