// Nacisk zarządu przy zbyt dużej kadrze (docs/limit-kadry.md). System dnia „squadLimit” (po systemie kariery).
//
// Klub gracza: kadra ponad limitem zarządu -> wiadomość z decyzją i 14 dni (jednorazowo +7 za cenę zaufania).
// Po terminie zarząd działa w ustalonej kolejności:
//   1) w oknie transferowym wystawia najsłabszych nienietykalnych na listę transferową (80 % wartości) i czeka 7 dni;
//   2) potem (albo od razu poza oknem): młodszych do 23 lat wypożycza, pozostałych sprzedaje taniej (60 % wartości)
//      klubom AI, a gdy to niemożliwe, rozwiązuje kontrakt, ale tylko gdy klub stać na odprawę;
//   3) gdy nic się nie da zrobić, wraca do sprawy w kolejnym oknie (albo za 30 dni).
// Nietykalni: kapitan, pierwsza jedenastka, 5 najlepszych, sprowadzeni w ostatnich 120 dniach, wypożyczeni do klubu,
// wychowankowie do 21 lat i do 3 zawodników osłoniętych przez trenera. W czerwcu zarząd czeka na koniec kontraktów.
// Kluby AI: ta sama liczba i te same progi; ponad limitem wystawiają nadmiar na listę, po 21 dniach rozwiązują kontrakty.
// Stan: game.squadLimit = { case, log, ai } (tworzony leniwie, stare zapisy działają bez migracji).

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { registerDecision } from '../core/decisions.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { DOMESTIC } from '../config/calendar2026.js';
import { fmtDate } from '../ui/dom.js';
import { ensureBoard } from './board.js';
import { spendable, wageRoom } from './finance.js';
import { aiNegotiate } from './negotiation.js';
import { clubReputation } from './reputation.js';
import { completeTransfer, releasePlayer, releaseCost, playerWillingness, inWindow, fmtZl } from './transfers.js';
import { canLoanTo } from './loans.js'; // limity PZPN liczby wypożyczeń (docs/wypozyczenia.md)
import {
  squadCount, boardTargets, YOUTH_EXEMPT_AGE, PRESSURE_DAYS, LISTING_DAYS, EXTENSION_DAYS, KEEP_MAX,
  BOARD_LIST_PRICE, CUT_PRICE, LOAN_MAX_AGE,
} from './squadLimit.js';

// Zmiany zaufania zarządu (0-100) [SZAC]
export const TRUST = { resolved: 1, extend: -2, listed: -3, forced: -2, stalled: -1 };
const LIMIT_REASON = 'Nadmiar w kadrze (limit)';
const AI_GRACE = PRESSURE_DAYS + LISTING_DAYS; // klub AI: tyle samo czasu co gracz, zanim zwolni zawodników

const round = (x, step = 10000) => Math.max(step, Math.round(x / step) * step);
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
const playersWord = (n) => (n === 1 ? 'zawodnika' : 'zawodników');
const fewPl = (n) => n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
export const ageWord = (n) => (n === 1 ? '1 rok' : fewPl(n) ? `${n} lata` : `${n} lat`);
const pName = (p) => `${p.name} (${p.pos}, ${ageWord(p.age)}, ocena ${Math.round(p.ovr)})`;
const boardMsg = (date, o) => createMessage({ date, category: 'board', from: 'Zarząd', priority: 'info', ...o });

export function ensureSquadLimit(game) {
  const S = (game.squadLimit ??= {});
  S.case ??= null; S.log ??= []; S.ai ??= {};
  return S;
}

function adjustTrust(game, delta) {
  const B = ensureBoard(game);
  B.trust = Math.round(clamp(B.trust + delta, 0, 100));
  return B.trust;
}

function nextWindowStart(date) {
  return DOMESTIC.transferWindows.filter((w) => w.from > date).sort((a, b) => a.from.localeCompare(b.from))[0]?.from ?? null;
}

/** Stan dla interfejsu: liczby, sprawa zarządu, kogo zarząd wskaże, ile dni zostało. */
export function limitStatus(game) {
  const S = ensureSquadLimit(game);
  const st = squadCount(game, game.clubId);
  const c = S.case?.clubId === game.clubId ? S.case : null;
  const targets = st.over > 0 ? boardTargets(game, game.clubId, st.over, { keep: c?.keep ?? [] }) : [];
  return { ...st, case: c, targets, daysLeft: c ? Math.max(0, daysBetween(game.date, c.deadline)) : null };
}

/** Osłona zawodnika przed działaniem zarządu (najwyżej KEEP_MAX). Zwraca { ok, text }. */
export function toggleKeep(game, playerId) {
  const c = ensureSquadLimit(game).case;
  const p = game.world.players[playerId];
  if (!c || c.clubId !== game.clubId || !p) return { ok: false, text: 'Zarząd nie prowadzi teraz sprawy limitu kadry.' };
  if (c.keep.includes(playerId)) { c.keep = c.keep.filter((id) => id !== playerId); return { ok: true, text: `${p.name} nie jest już osłonięty. Zarząd może go wskazać.` }; }
  if (c.keep.length >= KEEP_MAX) return { ok: false, text: `Możesz osłonić najwyżej ${KEEP_MAX} zawodników.` };
  c.keep.push(playerId);
  return { ok: true, text: `${p.name} jest osłonięty. Zarząd wskaże kolejnego zawodnika z listy.` };
}

// ------------------------------------------------------------ Wiadomości
function pressureMessage(game, c, st, date) {
  const targets = boardTargets(game, game.clubId, st.over, { date, keep: c.keep });
  const names = targets.map(pName).join(', ') || 'brak zawodników, których zarząd może ruszyć';
  return boardMsg(date, {
    key: `limit-kadry:${c.id}`, priority: 'important',
    subject: `Za duża kadra: ${st.counted} przy limicie ${st.soft}`,
    body: [
      `Do limitu liczy się ${st.counted} zawodników, a limit zarządu to ${st.soft} (maksimum ${st.hard}). Nie liczą się wychowankowie do ${YOUTH_EXEMPT_AGE} lat (${st.exempt.length}) ani zawodnicy wypożyczeni do innych klubów.`,
      `Zarząd oczekuje redukcji o ${st.over} ${playersWord(st.over)} do ${fmtDate(c.deadline)}. Możesz sprzedać, wypożyczyć albo rozwiązać kontrakt w zakładce Transfery.`,
      `Jeśli kadra nadal będzie za duża, zarząd wystawi na listę transferową za ${Math.round(BOARD_LIST_PRICE * 100)} % wartości: ${names}. Tydzień później wypożyczy młodszych, sprzeda pozostałych taniej (${Math.round(CUT_PRICE * 100)} % wartości) albo rozwiąże kontrakty, jeśli klub stać na odprawy.`,
      `Zarząd nie ruszy kapitana, pierwszej jedenastki, pięciu najlepszych ani zawodników sprowadzonych w ostatnich 120 dniach. W zakładce Transfery możesz osłonić do ${KEEP_MAX} innych zawodników.`,
    ].join('\n\n'),
    actions: [
      { id: 'self', label: 'Zajmę się tym' },
      ...(c.extended ? [] : [{ id: 'extend', label: `Poproś o ${EXTENSION_DAYS} dni więcej` }]),
      { id: 'board', label: 'Niech zarząd zdecyduje teraz' },
    ],
    refs: { kind: 'squadLimit', caseId: c.id },
  });
}

function openCase(game, date, st) {
  const S = ensureSquadLimit(game);
  const c = { id: `${game.clubId}:${date}`, clubId: game.clubId, opened: date, deadline: addDays(date, PRESSURE_DAYS), stage: 'warn', extended: false, keep: [], listed: [], acted: [] };
  S.case = c;
  return pressureMessage(game, c, st, date);
}

/** Zdejmuje z listy zawodników, których wystawił zarząd (o ile trener nie zmienił ceny). */
function dropBoardListings(game, c) {
  for (const { id, price } of c.listed) if (game.market.userListed[id] === price) delete game.market.userListed[id];
}

function closeCase(game, date, c, { quiet = false } = {}) {
  const S = ensureSquadLimit(game);
  const byCoach = c.stage === 'warn';
  dropBoardListings(game, c);
  S.log = [{ id: c.id, opened: c.opened, closed: date, stage: c.stage, acted: c.acted }, ...S.log].slice(0, 10);
  S.case = null;
  if (quiet) return [];
  if (byCoach) adjustTrust(game, TRUST.resolved);
  const st = squadCount(game, game.clubId);
  return [boardMsg(date, {
    key: `limit-kadry-ok:${c.id}`,
    subject: 'Kadra w limicie zarządu',
    body: `Kadra liczy teraz ${st.counted} zawodników przy limicie ${st.soft}.${byCoach ? ` Zarząd docenia, że sprawa została załatwiona przed terminem (zaufanie +${TRUST.resolved}).` : ''}${c.listed.length ? ' Zawodnicy wystawieni przez zarząd zostali zdjęci z listy transferowej.' : ''}`,
  })];
}

// ------------------------------------------------------------ Działania zarządu
function aiClubs(game) {
  return CLUBS_PL.filter((c) => c.id !== game.clubId && game.world.clubs[c.id]);
}

/** Wypożyczenie do końca sezonu do klubu z tej samej albo niższej ligi, który ma miejsce w kadrze i w budżecie płac. */
function tryLoan(game, p, date) {
  const tier = clubById(game.clubId)?.tier ?? 1;
  const wage = p.contract?.wage ?? 0;
  const cands = aiClubs(game).filter((c) => { const s = squadCount(game, c.id); return c.tier >= tier && s.counted < s.soft && wageRoom(game.finance, game.world, c.id) >= wage && canLoanTo(game, p, c.id, date); })
    .sort((a, b) => Math.abs(a.L - p.ovr) - Math.abs(b.L - p.ovr) || a.id.localeCompare(b.id));
  for (const c of cands.slice(0, 6)) {
    if (playerWillingness(game, p, c.id).verdict === 'odmowa') continue;
    const e = completeTransfer(game, { playerId: p.id, to: c.id, kind: 'loan', loanShare: 100, date });
    e.board = true;
    return { kind: 'loan', id: p.id, name: p.name, to: c.id, text: `${pName(p)}: wypożyczenie do ${c.name} do końca sezonu (${c.name} płaci całą pensję).` };
  }
  return null;
}

/** Sprzedaż po obniżonej cenie klubowi AI, który ma pieniądze i miejsce w kadrze. */
function trySale(game, p, date) {
  const fee = round((p.value ?? 0) * CUT_PRICE);
  const from = clubById(game.clubId);
  const cands = aiClubs(game).filter((c) => !squadCount(game, c.id).full && spendable(game.finance, c.id) >= fee && clubReputation(c) >= (p.rep ?? 30) - 25)
    .sort((a, b) => Math.abs(a.L - p.ovr) - Math.abs(b.L - p.ovr) || a.id.localeCompare(b.id));
  for (const c of cands.slice(0, 5)) {
    if (playerWillingness(game, p, c.id).verdict === 'odmowa') continue;
    const rng = new Rng(`limit-kadry:${game.seed}:${date}:${p.id}:${c.id}`);
    const neg = aiNegotiate({ kind: 'sign', player: p, club: c, fromClub: from, date, rng, budget: { wage: Math.max(p.contract.wage * 1.6, wageRoom(game.finance, game.world, c.id) + p.contract.wage) } });
    if (neg.result !== 'signed') continue;
    const line = `${pName(p)}: sprzedaż do ${c.name} za ${fmtZl(fee)} (wartość ${fmtZl(p.value)}).`;
    const e = completeTransfer(game, { playerId: p.id, to: c.id, fee, contract: neg.contract, kind: 'transfer', date });
    e.board = true;
    return { kind: 'sale', id: p.id, name: p.name, to: c.id, fee, text: line };
  }
  return null;
}

/** Rozwiązanie kontraktu, tylko gdy klub stać na odprawę (budżet transferowy i saldo). Odprawa idzie z budżetu transferowego. */
function tryRelease(game, p, date, clubId = game.clubId) {
  const cost = releaseCost(game, p);
  if (spendable(game.finance, clubId) < cost) return null;
  const line = `${pName(p)}: rozwiązanie kontraktu, odprawa ${fmtZl(cost)}.`;
  releasePlayer(game, p.id);
  const fc = game.finance.clubs[clubId];
  if (fc) fc.transferBudget = Math.max(0, fc.transferBudget - cost);
  if (game.market.history[0]?.playerId === p.id) game.market.history[0].board = true;
  return { kind: 'release', id: p.id, name: p.name, cost, text: line };
}

/** Kolejka działań etapu 2. Zwraca { done: [...], failed: [nazwiska] }. */
function forcedActions(game, date, need, keep) {
  const queue = boardTargets(game, game.clubId, 99, { date, keep });
  const window = inWindow(date);
  const done = []; const failed = [];
  for (const p of queue) {
    if (done.length >= need) break;
    const fit = !(p.injuryDays > 0);
    let r = null;
    if (window && fit && p.age <= LOAN_MAX_AGE) r = tryLoan(game, p, date);
    if (!r && window && fit) r = trySale(game, p, date);
    if (!r) r = tryRelease(game, p, date);
    if (r) done.push(r); else failed.push(p.name);
  }
  return { done, failed };
}

/**
 * Działanie zarządu po terminie (albo od razu, gdy trener tak zdecydował: delegated).
 * Zwraca wiadomości do poczty.
 */
export function boardAct(game, date, delegated = false) {
  const S = ensureSquadLimit(game);
  const c = S.case;
  if (!c) return [];
  const st = squadCount(game, game.clubId);
  if (st.over <= 0) return closeCase(game, date, c);
  // Etap 1: lista transferowa (tylko w oknie i tylko gdy trener sam nie oddał decyzji zarządowi)
  if (c.stage === 'warn' && !delegated && inWindow(date)) {
    const targets = boardTargets(game, game.clubId, st.over, { date, keep: c.keep });
    if (targets.length) {
      for (const p of targets) {
        const price = round((p.value ?? 0) * BOARD_LIST_PRICE);
        game.market.userListed[p.id] = price;
        c.listed.push({ id: p.id, price });
        p.morale = clamp((p.morale ?? 12) - 1, 1, 20); // zawodnik wie, że klub chce go sprzedać
      }
      const trust = adjustTrust(game, TRUST.listed);
      c.stage = 'listed';
      c.deadline = addDays(date, LISTING_DAYS);
      return [boardMsg(date, {
        key: `limit-kadry-lista:${c.id}`, priority: 'important',
        subject: `Zarząd wystawił ${targets.length} ${playersWord(targets.length)} na listę transferową`,
        body: `Termin minął, a kadra wciąż liczy ${st.counted} zawodników przy limicie ${st.soft}.\n\nNa liście transferowej: ${targets.map((p) => `${pName(p)} za ${fmtZl(game.market.userListed[p.id])}`).join(', ')}.\n\nOferty trafią do twojej poczty i to ty je przyjmujesz. Jeśli do ${fmtDate(c.deadline)} kadra nadal będzie za duża, zarząd wypożyczy młodszych, sprzeda pozostałych za ${Math.round(CUT_PRICE * 100)} % wartości albo rozwiąże kontrakty, jeśli klub stać na odprawy.\n\nZaufanie zarządu: ${TRUST.listed} (teraz ${trust}).`,
      })];
    }
  }
  // Etap 2: wypożyczenie, sprzedaż taniej, rozwiązanie kontraktu
  const firstForced = c.stage === 'warn' || c.stage === 'listed';
  const { done, failed } = forcedActions(game, date, st.over, c.keep);
  c.acted.push(...done.map(({ kind, id, name, fee, cost, to }) => ({ kind, id, name, fee, cost, to, date })));
  let trustDelta = 0;
  if (firstForced && !delegated) trustDelta += (c.stage === 'warn' ? TRUST.listed : 0) + TRUST.forced;
  const after = squadCount(game, game.clubId);
  if (!done.length && !firstForced) trustDelta += TRUST.stalled;
  const trust = trustDelta ? adjustTrust(game, trustDelta) : ensureBoard(game).trust;
  const lines = done.map((d) => d.text);
  const head = delegated ? 'Zgodnie z twoją decyzją zarząd zajął się nadmiarem w kadrze.' : `Termin minął, a kadra liczyła ${st.counted} zawodników przy limicie ${st.soft}.`;
  const trustLine = trustDelta ? `\n\nZaufanie zarządu: ${trustDelta} (teraz ${trust}).` : '';
  if (after.over <= 0) {
    closeCase(game, date, c, { quiet: true });
    return [boardMsg(date, {
      key: `limit-kadry-dzialania:${c.id}:${date}`, priority: 'important',
      subject: 'Zarząd zmniejszył kadrę',
      body: `${head}\n\n${lines.join('\n')}\n\nKadra liczy teraz ${after.counted} zawodników. Sprawa zamknięta.${trustLine}`,
    })];
  }
  c.stage = 'waiting';
  c.deadline = inWindow(date) ? addDays(date, LISTING_DAYS) : nextWindowStart(date) ?? addDays(date, 30);
  const why = failed.length ? `Bez rozwiązania: ${failed.slice(0, 6).join(', ')}${inWindow(date) ? ' (brak chętnych klubów, a odprawy przekraczają budżet transferowy).' : ' (okno transferowe jest zamknięte, a odprawy przekraczają budżet transferowy).'}` : 'Zarząd nie znalazł zawodników, których mógłby ruszyć (wszyscy są nietykalni albo pozycja spadłaby poniżej minimum).';
  return [boardMsg(date, {
    key: `limit-kadry-dzialania:${c.id}:${date}`, priority: 'important',
    subject: done.length ? `Zarząd zmniejszył kadrę o ${done.length}, wciąż ${after.over} ponad limit` : 'Zarząd nie zdołał zmniejszyć kadry',
    body: `${head}\n\n${lines.length ? `${lines.join('\n')}\n\n` : ''}${why}\n\nKadra liczy ${after.counted} zawodników przy limicie ${after.soft}. Zarząd wróci do sprawy ${fmtDate(c.deadline)}. Nowe transfery są możliwe tylko do maksimum ${after.hard}.${trustLine}`,
  })];
}

registerDecision('squadLimit', (game, m, action) => {
  const c = ensureSquadLimit(game).case;
  const date = game.date;
  if (!c || c.id !== m.refs?.caseId) return [boardMsg(date, { subject: 'Limit kadry', body: 'Sprawa jest już nieaktualna.' })];
  if (action === 'extend' && !c.extended) {
    c.extended = true;
    c.deadline = addDays(c.deadline, EXTENSION_DAYS);
    const trust = adjustTrust(game, TRUST.extend);
    return [boardMsg(date, { subject: 'Zarząd daje więcej czasu', body: `Nowy termin redukcji kadry: ${fmtDate(c.deadline)}. Więcej przedłużeń nie będzie.\n\nZaufanie zarządu: ${TRUST.extend} (teraz ${trust}).` })];
  }
  if (action === 'board') return boardAct(game, date, true);
  return [boardMsg(date, { subject: 'Limit kadry: czekamy na ruch trenera', body: `Termin: ${fmtDate(c.deadline)}. Stan kadry i listę zawodników, których wskaże zarząd, widzisz w zakładce Transfery i na Pulpicie.` })];
});

// ------------------------------------------------------------ Dzień
function userDay(game, date) {
  const S = ensureSquadLimit(game);
  let c = S.case;
  if (c && c.clubId !== game.clubId) { S.case = c = null; } // zmiana klubu: sprawa poprzedniego klubu przepada
  const st = squadCount(game, game.clubId);
  const june = date.slice(5, 7) === '06'; // koniec sezonu: kontrakty wygasają 30 czerwca, zarząd czeka
  if (!c) return st.over > 0 && !june ? [openCase(game, date, st)] : [];
  if (st.over <= 0) return closeCase(game, date, c);
  if (june) { if (c.deadline <= date) c.deadline = addDays(date, 1); return []; }
  const out = [];
  if (c.stage === 'warn' && date === addDays(c.deadline, -3)) {
    const targets = boardTargets(game, game.clubId, st.over, { date, keep: c.keep });
    out.push(boardMsg(date, {
      key: `limit-kadry-przyp:${c.id}:${c.deadline}`, priority: 'important',
      subject: `Limit kadry: zostały 3 dni (${st.counted}/${st.soft})`,
      body: `Do ${fmtDate(c.deadline)} kadra musi zmniejszyć się o ${st.over} ${playersWord(st.over)}. Potem zarząd zajmie się: ${targets.map(pName).join(', ') || 'nikim (wszyscy nietykalni)'}.`,
    }));
  }
  if (date >= c.deadline) out.push(...boardAct(game, date, false));
  return out;
}

/** Kluby AI: ta sama zasada. Nadmiar na listę, po 21 dniach rozwiązanie kontraktu (gdy stać), ponad maksimum od razu. */
export function aiSquadLimitDay(game, date) {
  const S = ensureSquadLimit(game);
  const M = game.market;
  for (const club of aiClubs(game)) {
    const st = squadCount(game, club.id);
    if (st.over <= 0) { delete S.ai[club.id]; continue; }
    if (!S.ai[club.id]) S.ai[club.id] = date;
    const targets = boardTargets(game, club.id, st.over, { date });
    for (const p of targets) {
      const l = M.listed[p.id];
      if (!l || l.kind === 'loan') M.listed[p.id] = { kind: 'sale', reasons: [LIMIT_REASON], since: date, club: club.id };
      else if (!l.reasons.includes(LIMIT_REASON)) l.reasons = [...l.reasons, LIMIT_REASON];
    }
    const overHard = st.counted - st.hard;
    if (overHard <= 0 && daysBetween(S.ai[club.id], date) < AI_GRACE) continue;
    let left = overHard > 0 ? overHard : st.over;
    for (const p of targets) {
      if (left <= 0) break;
      if (overHard > 0) { releasePlayer(game, p.id); left--; continue; }
      if (tryRelease(game, p, date, club.id)) left--;
    }
  }
}

registerDailySystem({
  id: 'squadLimit', order: 52,
  run(game, date) {
    if (!game.world || !game.season || !game.market || !game.finance) return {};
    const messages = userDay(game, date);
    if (new Date(`${date}T12:00:00Z`).getUTCDay() === 1) aiSquadLimitDay(game, date);
    return { messages };
  },
});
