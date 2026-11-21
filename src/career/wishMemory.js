// Pamięć zawodnika o odrzuconych ofertach i podwyżkach (docs/transfery.md, rozdz. 4). Zamiast „podwyżka = reset,
// oferta = start” zawodnik pamięta: kiedy ostatnio przedłużył kontrakt (czas spokoju), ile ofert klub odrzucił
// w ostatnim roku, czy przepadła mu oferta marzeń i czy czeka do następnego okna.
// p.wishMemory = { rejects: [daty], lastRoll, lastRaise, raises: [daty], lastTalk, calmUntil, mood, moodSince,
// dream, grudge, waitUntil, settle: { from, months, forced } }. Brak pola (stary zapis) = brak wspomnień.
// mood: 'spokojny' (przyjął odmowę, do calmUntil kolejne oferty x0,5), 'rozczarowany' (zostaje, ale pamięta,
// morale -2, w następnym oknie ryzyko prośby x2). Stan „czeka” to prośba z obietnicą (p.moveWish.promise).
// Moduł bez zależności od negotiation.js i moveWish.js (oba go importują). Wszystkie liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { personalityOf } from './personality.js';
import { DOMESTIC, GAME_START } from '../config/calendar2026.js';

export const MEM = {
  rollDays: 30, // najwyżej jeden rzut na zawodnika na 30 dni; kolejna oferta tylko eskaluje stan
  maxPc: 0.65,
  calmMonths: [4, 8], calmOffer: 0.5, // spokojny: kolejne oferty x0,5
  lateDays: 10, latePc: 0.6, latePr: 1.5, // „poczekam do lata”: oferta w ostatnich 10 dniach okna
  dream: { ageMin: 24, ageMax: 29, gap: 25, settle: 0.8, jump: 1.3, later: 0.7, grudge: 10 },
  minSettle: 2, // najkrótszy spokój po podwyżce wymuszonej prośbą (miesiące)
  windowHazard: 2, // rozczarowany w oknie transferowym
  talkAfterRaise: 0.1, talkRaiseDays: 60,
  moodMorale: -2,
};

const DAY = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
const monthsF = (a, b) => daysBetween(a, b) / 30.44;
const traitsOf = (p) => personalityOf(p).traits;

/** Dzień + n miesięcy (koniec miesiąca przycięty). */
export function addMonths(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.trunc(n));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  const extra = Math.round((n - Math.trunc(n)) * 30);
  return new Date(d.getTime() + extra * DAY).toISOString().slice(0, 10);
}

/** Pamięć bez zmiany zawodnika (stary zapis: pusta). */
export function memOf(p) { return p?.wishMemory ?? {}; }

/** Pamięć do zapisu (tworzy pole). */
export function ensureMem(p) {
  if (!p.wishMemory) p.wishMemory = {};
  const m = p.wishMemory;
  m.rejects = m.rejects ?? [];
  m.raises = m.raises ?? [];
  return m;
}

// ------------------------------------------------------------ Okna
/** Okno transferowe w dniu (albo null). */
export function windowAt(date) { return (DOMESTIC.transferWindows ?? []).find((w) => date >= w.from && date <= w.to) ?? null; }

/** Otwarcie następnego okna po dacie (lato 1 lipca, zima 1 lutego, gdy kalendarz jeszcze go nie zna). */
export function nextWindowOpen(date) {
  const w = (DOMESTIC.transferWindows ?? []).find((x) => x.from > date);
  if (w) return w.from;
  const y = Number(date.slice(0, 4));
  return date < `${y}-07-01` ? `${y}-07-01` : `${y + 1}-02-01`;
}

/** Koniec najbliższego okna (trwającego albo następnego). */
export function nextWindowEnd(date) {
  const w = (DOMESTIC.transferWindows ?? []).find((x) => x.to >= date);
  if (w) return w.to;
  const y = Number(date.slice(0, 4));
  return date <= `${y}-02-26` ? `${y}-02-26` : date <= `${y}-09-09` ? `${y}-09-09` : `${y + 1}-02-26`;
}

/** Ostatnie dni okna („poczekam do lata”). */
export function lateInWindow(date) {
  const w = windowAt(date);
  return !!w && daysBetween(date, w.to) < MEM.lateDays;
}

// ------------------------------------------------------------ Czas spokoju po przedłużeniu
/** D: ile miesięcy zawodnik jest spokojny po nowym kontrakcie. */
export function settleMonths(p) {
  const t = traitsOf(p);
  return clamp(9 + 0.5 * (t.loyalty - 10) + 0.3 * (t.patience - 10) - 0.4 * (t.ambition - 10), 4, 14);
}

/** q: skrócenie spokoju, gdy podwyżkę wymusiła prośba o transfer. */
export function forcedQ(p) {
  const t = traitsOf(p);
  return clamp(0.6 + 0.04 * (t.greed - 10) - 0.05 * (t.ambition - 10), 0.25, 1.1);
}

/** Ostatni kontrakt: zapisany spokój albo data podpisu kontraktu (kontrakty startowe się nie liczą). */
export function settleInfo(p) {
  const s = memOf(p).settle;
  const c = p?.contract;
  const signed = c ? (c.signedOn ?? c.signed ?? null) : null;
  const sig = signed && signed !== GAME_START ? signed : null;
  if (s && (!sig || s.from >= sig)) return s;
  if (sig) return { from: sig, months: settleMonths(p) };
  return null;
}

/** fSpokój = 1 - 0,8 x max(0, 1 - m/D); m = miesiące od kontraktu. */
export function settleFactor(p, date) {
  const s = settleInfo(p);
  if (!s || !date || !(s.months > 0)) return 1;
  const m = Math.max(0, monthsF(s.from, date));
  return 1 - 0.8 * Math.max(0, 1 - m / s.months);
}

// ------------------------------------------------------------ Pamięć odrzuconych ofert
/** n: odrzucone oferty w 12 miesiącach przed datą (starsze niż 6 miesięcy z wagą 1/2). */
export function rejectCount(p, date) {
  let n = 0;
  for (const d of memOf(p).rejects ?? []) {
    const days = daysBetween(d, date);
    if (days < 0 || days > 365) continue;
    n += days > 182 ? 0.5 : 1;
  }
  return n;
}

/** fPamięć = clamp(1 + n x k, 0,3, 2): ambitnych i próżnych kolejne odmowy złoszczą, lojalnych i cierpliwych uspokajają. */
export function memoryFactor(p, date) {
  if (!date) return 1;
  const n = rejectCount(p, date);
  if (!n) return 1;
  const t = traitsOf(p);
  const k = 0.04 * (t.ambition - 10) + 0.03 * (t.ego - 10) - 0.04 * (t.loyalty - 10) - 0.02 * (t.patience - 10);
  return clamp(1 + n * k, 0.3, 2);
}

/** fSkok: o ile większy jest kupiec (i pensja z zagranicy). */
export function jumpFactor(buyerRep, clubRep, wageJump = false) {
  return clamp(0.5 + (buyerRep - clubRep) / 30, 0.4, 1.6) * (wageJump ? 1.2 : 1);
}

/** Oferta marzeń: 24-29 lat, kupiec >= reputacja klubu + 25. */
export function isDreamOffer(p, buyerRep, clubRep) {
  const age = p.age ?? 25;
  return age >= MEM.dream.ageMin && age <= MEM.dream.ageMax && buyerRep >= clubRep + MEM.dream.gap;
}

/** Szansa „rozczarowany, ale zostaje” przed przemnożeniem przez (1 - Pc). */
export function disappointBase(p) {
  const t = traitsOf(p);
  return clamp(0.3 + 0.02 * (t.ambition - 10) + 0.015 * (t.ego - 10) - 0.02 * (t.loyalty - 10), 0.1, 0.5);
}

/**
 * Szanse po odrzuconej ofercie. ctx: { P0, buyerRep, clubRep, wageJump, date }.
 * Zwraca { Pc (cicha prośba), Pr (rozczarowany), dream, late, f: czynniki }.
 */
export function rejectOdds(p, { P0, buyerRep = 0, clubRep = 35, wageJump = false, date }) {
  const m = memOf(p);
  let fS = settleFactor(p, date);
  let fJ = jumpFactor(buyerRep, clubRep, wageJump);
  const dreamLevel = isDreamOffer(p, buyerRep, clubRep);
  const dream = dreamLevel && !m.dream;
  if (dreamLevel) {
    const w = dream ? 1 : MEM.dream.later; // po przepadłej ofercie marzeń kolejna działa słabiej (0,7)
    fS = Math.max(fS, MEM.dream.settle * w);
    fJ *= 1 + (MEM.dream.jump - 1) * w;
  }
  const fM = memoryFactor(p, date);
  const late = lateInWindow(date);
  const fP = late ? MEM.latePc : 1;
  const fCalm = m.mood === 'spokojny' && m.calmUntil > date ? MEM.calmOffer : 1;
  const Pc = clamp(P0 * fS * fM * fJ * fP * fCalm, 0, MEM.maxPc);
  const Pr = clamp(disappointBase(p) * (1 - Pc) * (late ? MEM.latePr : 1), 0, 1 - Pc);
  return { Pc, Pr, dream, late, f: { fS, fM, fJ, fP, fCalm } };
}

/** Zapisuje odrzuconą ofertę w pamięci (najwyżej 8 ostatnich). */
export function noteReject(p, date) {
  const m = ensureMem(p);
  m.rejects = [...m.rejects.filter((d) => daysBetween(d, date) <= 365), date].slice(-8);
}

/** Rzut możliwy (ostatni co najmniej 30 dni temu). */
export const canRoll = (p, date) => !memOf(p).lastRoll || daysBetween(memOf(p).lastRoll, date) >= MEM.rollDays;

// ------------------------------------------------------------ Ryzyko miesięczne
/**
 * Mnożnik ryzyka miesięcznego z pamięci: fSpokój x fPamięć, 0 przed otwarciem okna, na które zawodnik czeka,
 * x2 dla rozczarowanego w oknie transferowym.
 */
export function hazardMemFactor(p, date) {
  if (!date) return 1;
  const m = memOf(p);
  if (m.waitUntil && date < m.waitUntil) return 0;
  const fMood = m.mood === 'rozczarowany' && windowAt(date) ? MEM.windowHazard : 1;
  return settleFactor(p, date) * memoryFactor(p, date) * fMood;
}

/** Szansa pogodzenia się rozczarowanego w miesiącu. */
export function reconcileChance(p) {
  const t = traitsOf(p);
  return clamp(0.25 + 0.02 * (t.loyalty - 10) + 0.02 * (t.patience - 10) - 0.02 * (t.ambition - 10), 0.05, 0.6);
}

// ------------------------------------------------------------ Podwyżka i nowy kontrakt
/** Podwyżki w 12 miesiącach przed datą. */
const raisesIn12 = (p, date) => (memOf(p).raises ?? []).filter((d) => { const x = daysBetween(d, date); return x >= 0 && x <= 365; }).length;

/**
 * Szansa, że podwyżka uspokoi zawodnika z prośbą: clamp(0,3 + 0,05 (chciwość - 10) - 0,04 (ambicja - 10)
 * + 0,15 x wzrost/20 %, 0,1, 0,85); druga podwyżka w 12 miesiącach x0,5 (chciwy x0,7).
 */
export function raiseCalmChance(p, oldWage, newWage, date) {
  const t = traitsOf(p);
  const inc = oldWage > 0 ? Math.max(0, newWage / oldWage - 1) : 0.2;
  let c = clamp(0.3 + 0.05 * (t.greed - 10) - 0.04 * (t.ambition - 10) + 0.15 * (inc / 0.2), 0.1, 0.85);
  if (raisesIn12(p, date) > 0) c *= t.greed >= 14 ? 0.7 : 0.5;
  return c;
}

/**
 * Nowy kontrakt (przedłużenie) zawodnika. Bez prośby: spokój D miesięcy. Z prośbą (podwyżka wymuszona):
 * rzut uspokojenia; sukces: prośba znika, spokój D x q (min. 2 mies.); porażka: prośba zostaje (podwyżka zapisana).
 * Mutuje zawodnika. Zwraca { forced, calmed, chance }.
 */
export function noteRenewal(p, date, { oldWage = 0, newWage = 0, seed = '' } = {}) {
  const m = ensureMem(p);
  const forced = !!p.moveWish;
  const chance = forced ? raiseCalmChance(p, oldWage, newWage, date) : 1;
  const calmed = forced ? new Rng(`prosba-podwyzka:${seed}:${p.id}:${date}`).chance(chance) : true;
  if (newWage > oldWage) { m.lastRaise = date; m.raises = [...m.raises.filter((d) => daysBetween(d, date) <= 365), date].slice(-6); }
  if (calmed) {
    const D = settleMonths(p);
    m.settle = { from: date, months: forced ? Math.max(MEM.minSettle, D * forcedQ(p)) : D, forced };
    delete p.moveWish; p.transferRequest = false;
    if (forced) p.unhappy = false;
    delete m.mood; delete m.moodSince; delete m.calmUntil; delete m.waitUntil;
  } else {
    p.moveWish.raised = date;
  }
  return { forced, calmed, chance };
}

/** Rozmowa: +0,1 do szansy, gdy od podwyżki minęło najwyżej 60 dni. */
export function talkRaiseBonus(p, date) {
  const r = memOf(p).lastRaise;
  return r && daysBetween(r, date) >= 0 && daysBetween(r, date) <= MEM.talkRaiseDays ? MEM.talkAfterRaise : 0;
}

// ------------------------------------------------------------ Czytelność
/**
 * Krótki opis nastroju do karty zawodnika (zawodnik gracza). null, gdy nie ma nic do powiedzenia.
 * fmt: funkcja formatująca datę (fmtDate z ui/dom.js).
 */
export function wishStateText(p, date, fmt = (d) => d) {
  const m = memOf(p);
  const W = p.moveWish;
  const parts = [];
  if (W?.promise && !W.promise.broken) parts.push(`Czeka do okna: obiecałeś zgodę na transfer (do ${fmt(W.promise.until)})`);
  else if (W) parts.push(W.stage === 'oficjalna' ? 'Oficjalnie prosi o transfer' : 'Agent sygnalizuje chęć odejścia');
  else if (m.mood === 'rozczarowany') parts.push(`Rozczarowany, ale zostaje${m.waitUntil && date && m.waitUntil > date ? ` (czeka do okna ${fmt(m.waitUntil)})` : ''}`);
  else if (m.mood === 'spokojny' && date && m.calmUntil > date) parts.push(`Spokojny do ${fmt(m.calmUntil)}: przyjął odrzucenie oferty`);
  else {
    const s = settleInfo(p);
    if (s && date && s.months > 0) {
      const until = addMonths(s.from, s.months);
      if (until > date) parts.push(`Spokojny do ${fmt(until)} po nowym kontrakcie`);
    }
  }
  if (m.lastRaise && date && daysBetween(m.lastRaise, date) <= 120 && daysBetween(m.lastRaise, date) >= 0) parts.push(`Ostatnio dostał podwyżkę (${fmt(m.lastRaise)})`);
  if (m.dream && m.grudge) parts.push('Pamięta przepadłą ofertę marzeń');
  return parts.length ? parts.join('. ') : null;
}
