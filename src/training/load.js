// Obciążenie i zdrowie: dziennik obciążeń z 28 dni (AU), proporcja ostrego do przewlekłego (ACWR),
// ryzyko urazu na treningu, „ciężkie nogi” po mocnych zajęciach, zmęczenie zależne od wieku i wytrzymałości.
// Wszystko to krótkie, tanie funkcje na jednym zawodniku.

import { clamp } from '../core/rng.js';
import { LOAD, INTENSITY, SESSIONS, staffMul } from './config.js';
import { daysBetween } from './state.js';

/** Przesuwa dziennik obciążeń do dnia `date` (dopisuje zera za dni bez wpisu). */
export function shiftLog(t, date) {
  if (!t.logDate) { t.logDate = date; return; }
  const n = daysBetween(t.logDate, date);
  if (n <= 0) return;
  if (n >= 28) t.log = Array(28).fill(0);
  else t.log = [...t.log.slice(n), ...Array(n).fill(0)];
  t.logDate = date;
}

/** Dodaje obciążenie w danym dniu (np. mecz z wczoraj). */
export function addLoad(t, date, au) {
  const back = daysBetween(date, t.logDate);
  if (back < 0 || back > 27) return;
  t.log[27 - back] = Math.round((t.log[27 - back] + au) * 10) / 10;
}

/** Suma z 7 dni (ostre), średnia tygodniowa z 28 dni (przewlekłe) i ich proporcja. */
export function loadSummary(t) {
  const log = t?.log ?? [];
  let a7 = 0; let a28 = 0;
  for (let i = 0; i < log.length; i++) { a28 += log[i]; if (i >= log.length - 7) a7 += log[i]; }
  const chronic = a28 / 4;
  const acwr = chronic > 1 ? a7 / chronic : 1;
  return { acute: Math.round(a7), chronic: Math.round(chronic), acwr: Math.round(acwr * 100) / 100 };
}

export function acwrLabel(r) {
  if (r < 0.7) return { id: 'low', text: 'Za małe obciążenie' };
  if (r <= 1.3) return { id: 'ok', text: 'Optymalne' };
  if (r <= 1.5) return { id: 'warn', text: 'Podwyższone ryzyko' };
  return { id: 'bad', text: 'Przeciążenie' };
}

/** Mnożnik zmęczenia zawodnika: wytrzymałość i wiek. */
export function fatigueMul(p, age) {
  const wyt = p.attr?.WYT ?? 10;
  return clamp(1.3 - 0.03 * wyt, 0.7, 1.25) * (age >= 33 ? 1.2 : age >= 30 ? 1.1 : 1);
}

/** Szybkość regeneracji: wytrzymałość i wiek (31+ wolniej, jak w season.js). */
export function regenMul(p, age) {
  return (0.8 + 0.02 * (p.attr?.WYT ?? 10)) * (age >= 31 ? 0.85 : 1);
}

/**
 * Szansa urazu na treningu w danym dniu (ekspert 8.1: 0,15 % na dzień, x2 przy intensywnym).
 * ctx: { sessions | sessionMul, age, acwr, fitQ, campQ, baseMul, rtp, fresh, mode, returning }
 */
export function trainingInjuryChance(p, ctx) {
  let sessionMul = ctx.sessionMul ?? 0; // kluby AI podają gotową sumę dla zajęć dnia (aiClubs.js)
  if (ctx.sessionMul == null) for (const x of ctx.sessions) sessionMul += INTENSITY[x.int].inj * SESSIONS[x.type].inj;
  if (sessionMul <= 0) return 0;
  const odp = p.hidden?.ODP ?? 10;
  const mODP = 1.5 - 0.05 * odp;
  const mAge = ctx.age >= 33 ? 1.3 : ctx.age >= 30 ? 1.15 : 1;
  const mAcwr = LOAD.acwrMul(ctx.acwr ?? 1) * (1 - 0.3 * (ctx.campQ ?? 0)); // obóz: lepsze warunki i opieka
  const mFresh = (ctx.fresh ?? 100) < 70 ? 1.4 : 1;
  const mRtp = ctx.rtp ? 0.7 : ctx.returning ? 1.3 : 1;
  const mMode = ctx.mode === 'light' ? 0.6 : 1;
  return LOAD.injBase * sessionMul * mODP * mAge * mAcwr * mFresh * mRtp * mMode * (ctx.baseMul ?? 1) * staffMul.inj(ctx.fitQ ?? 10);
}

/** Kara „ciężkich nóg” w punktach atrybutu (modyfikator silnika). */
export function legsTerm(t) {
  const legs = t?.legs ?? 0;
  return legs > LOAD.legsFree ? -LOAD.legsPenalty * (legs - LOAD.legsFree) : 0;
}

/** Kara za przeciążenie (ACWR ponad 1.3): spadek formy do -0.3 punktu. */
export function overloadTerm(t) {
  const r = t?.acwr ?? 1;
  if (r <= LOAD.overloadFrom) return 0;
  return -Math.min(LOAD.overloadMax, 0.6 * (r - LOAD.overloadFrom));
}
