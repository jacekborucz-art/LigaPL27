// Rozwój i spadek (ekspert 9.5) z realnym wpływem treningu. Raz w miesiącu dla całego świata
// (ok. 1700 zawodników x 27 atrybutów, poniżej 10 ms). Przyrost w punktach OVR:
//   g = rate(wiek) * (POT - OVR) / 12 * minuty * profesjonalizm * sztab * trening * program
// rozdzielany na atrybuty według profilu pozycji i bodźców z zajęć (akcenty treningu).
// Atrybuty są liczbami całkowitymi; ułamek przyrostu zaokrąglamy losowo (wartość oczekiwana bez zmian),
// więc w zapisie nie trzeba trzymać ułamków dla 1700 zawodników.

import { Rng, clamp } from '../core/rng.js';
import { OFF, VARIANTS, OUTFIELD_ATTRS, GK_ATTRS, ATTRS, ovrAt } from '../data/attributes.js';
import { DEV, staffMul } from './config.js';
import { staffOf } from './staff.js';
import { developmentMods } from '../career/infrastructure.js';
import { ageAt } from './state.js';
import { squadOf, academyOf } from '../world/worldGen.js';
import { aiStimFor, resetAiStim } from './aiClubs.js';

export function offsetsFor(p) {
  const v = p.variant ? VARIANTS[p.pos]?.find((x) => x.name === p.variant) : null;
  return v ? { ...OFF[p.pos], ...v.set } : OFF[p.pos];
}

const GK_SET = new Set(GK_ATTRS);
const weightOf = (off) => (off >= 3 ? 4 : off > 0 ? 2 : off === 0 ? 1 : 0);
const baseCache = new Map();

/** Wagi przyrostu atrybutów dla pozycji: profil OVR (++ 4, + 2, 0 1), atrybuty poza profilem 0.5. */
function baseWeights(p) {
  const key = `${p.pos}:${p.variant ?? ''}`;
  if (baseCache.has(key)) return baseCache.get(key);
  const off = offsetsFor(p);
  const gk = p.pos === 'BR';
  const list = gk ? [...GK_ATTRS, ...OUTFIELD_ATTRS] : OUTFIELD_ATTRS;
  const ovrSet = new Set(gk ? [...GK_ATTRS, 'UST', 'DEC', 'OPA'] : OUTFIELD_ATTRS);
  const w = {};
  let relevant = 0;
  for (const a of list) {
    const ow = ovrSet.has(a) ? weightOf(off[a] ?? 0) : 0;
    if (ow > 0) relevant++;
    w[a] = gk && !ovrSet.has(a) ? 0.15 : Math.max(0.5, ow);
  }
  const out = { list, w, relevant };
  baseCache.set(key, out);
  return out;
}

/** Atrybuty dla akcentu indywidualnego: grupa (tech, mental, phys, gk) albo pojedynczy atrybut. */
export function focusAttrs(focus) {
  if (!focus) return [];
  if (ATTRS[focus]) return [focus];
  return Object.keys(ATTRS).filter((k) => ATTRS[k].group === focus);
}

/** Losowe zaokrąglenie: 12 + 0.3 daje 13 z szansą 30 %. */
function stochastic(v, rng) {
  const f = Math.floor(v);
  return f + (rng.next() < v - f ? 1 : 0);
}

/**
 * Miesięczny rozwój jednego zawodnika (czysta funkcja na obiekcie zawodnika).
 * ctx: { date, staff: {asystent, fizyczny, bramkarze, mlodziez} (jakości 1-20),
 *        stim: { atrybut: punkty } | null (null = standardowy plan: akademia, stary zapis), minShare 0-1, rng }
 * Zwraca { before, after, delta: { atrybut: zmiana }, spurt }.
 */
export function developPlayer(p, ctx) {
  const rng = ctx.rng;
  const age = ctx.age ?? ageAt(p, ctx.date);
  const st = ctx.staff;
  const gk = p.pos === 'BR';
  const before = p.ovr;
  const pot = p.hidden?.POT ?? p.ovr;
  const prf = p.hidden?.PRF ?? 10;
  const { list, w, relevant } = baseWeights(p);

  // Bodziec treningowy z miesiąca: suma i udział każdego atrybutu
  const stim = ctx.stim;
  let S = 0;
  if (stim) for (const k in stim) S += stim[k];
  const standard = !stim;
  const trainMul = standard ? 1 : clamp(DEV.trainMin + (1 - DEV.trainMin) * (S / DEV.refStim), DEV.trainMin, DEV.trainMax);

  // Budżet przyrostu (punkty OVR w miesiącu)
  const minShare = ctx.minShare ?? 0.6;
  let minMul = 0.6 + 0.4 * Math.min(1, minShare / 0.6);
  const youth = age <= 21;
  const prog = p.training?.prog;
  if (youth && prog === 'mlodzi') minMul = Math.max(minMul, 0.85);
  // Atrybuty sztabu (docs/sztab-atrybuty.md); bez nich (testy, stare wywołania) jakość roli
  const sa = (k, role) => st[k] ?? st[role] ?? 10;
  const staffDev = gk ? staffMul.gk(sa('gkDev', 'bramkarze')) : staffMul.dev((st.asystent + sa('fizDev', 'fizyczny')) / 2);
  const youthQ = p.squad === 'Y' ? sa('aka', 'mlodziez') : sa('roz', 'mlodziez'); // akademia albo młodzi w kadrze
  const youthMul = youth ? staffMul.youth(youthQ) : 1;
  const progMul = youth && prog === 'mlodzi' ? 1.1 + 0.01 * sa('roz', 'mlodziez') : 1;
  const infraMul = ctx.infra ? ctx.infra.dev * (youth ? ctx.infra.youth : 1) : 1; // baza treningowa i akademia (career/infrastructure.js)
  const g = DEV.rate(age) * Math.max(0, pot - p.ovr) / 12 * minMul * (0.8 + 0.02 * prf) * staffDev * youthMul * trainMul * progMul * infraMul;

  const delta = {};
  if (g > 0) {
    const P = g * relevant;
    const n = list.length;
    const focusExtra = {};
    if (standard && p.training?.focus) for (const a of focusAttrs(p.training.focus)) focusExtra[a] = 2;
    let sum = 0;
    const share = {};
    for (const a of list) {
      const f = standard ? 1 + (focusExtra[a] ?? 0) : S > 0 ? ((stim[a] ?? 0) / S) * n : 0;
      share[a] = w[a] * (1 + DEV.focusStrength * f);
      sum += share[a];
    }
    for (const a of list) delta[a] = (P * share[a]) / sum;
  }

  // Spadek i dojrzewanie
  const declinePrf = 1.2 - 0.02 * prf;
  const fit = staffMul.decline(sa('fizDev', 'fizyczny')); // rozwój motoryki
  let physStim = 0;
  if (stim) for (const a of DEV.physAttrs) physStim += stim[a] ?? 0;
  const physRatio = standard ? 1 : physStim / (DEV.refStim * 0.2);
  const physTrain = clamp(1.2 - 0.2 * physRatio, 0.75, 1.2);
  const phys = DEV.physDecline(age) * declinePrf * fit * physTrain;
  const general = DEV.generalDecline(age) * declinePrf * fit;
  if (!gk) {
    for (const a of DEV.physAttrs) delta[a] = (delta[a] ?? 0) - phys;
    if (general) for (const a of OUTFIELD_ATTRS) if (ATTRS[a].group !== 'mental') delta[a] = (delta[a] ?? 0) - general;
  } else if (age >= DEV.gkDeclineFrom) {
    const d = 0.02 * (age - DEV.gkDeclineFrom + 1) * declinePrf * fit;
    for (const a of ['REF', 'JNJ', 'WYJ']) delta[a] = (delta[a] ?? 0) - d;
    for (const a of DEV.physAttrs) delta[a] = (delta[a] ?? 0) - phys * 0.5;
  }
  const mg = DEV.mentalGrowth(age) * staffMul.tac(sa('mental', 'asystent')); // praca z zawodnikami
  if (mg) for (const a of DEV.mentalAttrs) delta[a] = (delta[a] ?? 0) + mg;

  // Zastosowanie z losowym zaokrągleniem i limitem POT + 3
  const cap = Math.min(20, Math.ceil(pot + DEV.capOverPot));
  const changes = {};
  for (const a of Object.keys(delta)) {
    const d = delta[a];
    if (!d || (!gk && GK_SET.has(a))) continue;
    const cur = p.attr[a];
    let v = stochastic(cur + d, rng);
    if (d > 0) v = Math.min(v, Math.max(cur, cap));
    v = clamp(v, 1, 20);
    if (v !== cur) { changes[a] = v - cur; p.attr[a] = v; }
  }
  // Skok rozwojowy: rzadki, tylko do 21 lat (3 % na sezon, częściej z dobrym trenerem młodzieży)
  let spurt = false;
  if (youth && rng.next() < (DEV.spurtSeason / 12) * staffMul.spurt(sa('tal', 'mlodziez')) && pot < 20) { // wyławianie talentów
    p.hidden.POT = Math.min(20, Math.round((pot + DEV.spurtPot) * 10) / 10);
    spurt = true;
  }
  if (Object.keys(changes).length) p.ovr = ovrAt(p.attr, p.pos, offsetsFor(p));
  return { before, after: p.ovr, delta: changes, spurt };
}

/** Udział minut zawodnika w meczach klubu w sezonie (do mnożnika minut). */
function clubMatchCounts(game) {
  const out = {};
  for (const f of game.fixtures || []) {
    if (!f.played) continue;
    out[f.home] = (out[f.home] ?? 0) + 1;
    if (f.away) out[f.away] = (out[f.away] ?? 0) + 1;
  }
  return out;
}

// Jakości ról i atrybuty użyte w rozwoju (docs/sztab-atrybuty.md); widok bez atrybutów: jakość roli
const qOf = (s) => {
  const A = (role, k) => (s[role]?.q ?? 10) + (s[role]?.d?.[k] ?? 0); // jakość roli + odchylenie atrybutu
  return {
    asystent: s.asystent.q, fizyczny: s.fizyczny.q, bramkarze: s.bramkarze.q, mlodziez: s.mlodziez.q, analityk: s.analityk.q,
    gkDev: 0.6 * A('bramkarze', 'TEC') + 0.4 * A('bramkarze', 'NOG'), fizDev: A('fizyczny', 'MTR'), mental: A('asystent', 'MOT'),
    roz: A('mlodziez', 'ROZ'), aka: A('mlodziez', 'AKA'), tal: A('mlodziez', 'TAL'),
  };
};

/**
 * Miesięczny krok rozwoju dla wszystkich klubów ze stałą kadrą.
 * Zwraca raport dla klubu gracza: { month, rows, spurts }.
 */
export function monthlyDevelopment(game, date) {
  const rng = new Rng(`rozwoj:${game.seed}:${date.slice(0, 7)}`);
  const counts = clubMatchCounts(game);
  const report = { month: date.slice(0, 7), date, rows: [], spurts: [] };
  for (const clubId of Object.keys(game.world.clubs)) {
    const st = qOf(staffOf(game, clubId));
    const infra = developmentMods(game, clubId);
    const mine = clubId === game.clubId;
    const games = counts[clubId] ?? 0;
    for (const p of [...squadOf(game.world, clubId), ...academyOf(game.world, clubId)]) {
      const academy = p.squad === 'Y';
      const t = p.training;
      // Klub gracza: bodziec z zajęć zawodnika; klub AI: z planu klubu i udziału w zajęciach (aiClubs.js)
      const stim = academy ? null : mine ? (t ? t.stim ?? {} : null) : aiStimFor(game, p);
      if (p.aiTr) { if (mine) delete p.aiTr; else { p.aiTr.dp = 0; p.aiTr.dd = 0; } }
      const minShare = academy ? 0.5 : games ? (p.season?.min ?? 0) / (90 * games) : 0.6;
      const before = mine ? { ...p.attr } : null;
      const r = developPlayer(p, { date, staff: st, stim, minShare, rng, infra });
      if (t) {
        t.stim = {};
        t.ovrHist = [...(t.ovrHist ?? []), p.ovr].slice(-13);
      }
      if (mine) {
        report.rows.push({
          id: p.id, name: p.name, pos: p.pos, age: ageAt(p, date), academy, from: r.before, to: r.after,
          d: Math.round((r.after - r.before) * 10) / 10,
          attrs: Object.entries(r.delta).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 4),
          trend: Object.keys(before).reduce((s, k) => s + (p.attr[k] - before[k]), 0),
        });
        if (r.spurt) report.spurts.push({ id: p.id, name: p.name });
      }
    }
    if (!mine) resetAiStim(game, clubId);
  }
  report.rows.sort((a, b) => b.d - a.d || b.trend - a.trend);
  return report;
}
