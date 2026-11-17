// Instrukcje indywidualne zawodników w pełnym silniku (docs/instrukcje-indywidualne.md).
// Zasada: parametry drużyny (tacticParams) bez zmian; zawodnik z instrukcją inną niż drużyna dodaje
// w * (efekt zawodnika - efekt drużyny), w = 1/10, więc 10 zawodników z tą samą instrukcją daje dokładnie
// instrukcję drużyny. Część efektów działa tylko na tego zawodnika (x.pi): kto fauluje, kartki, odbiory,
// strzały, asysty, spalone, zmęczenie i przesunięcie udziału stref (Pozycja).
// Jakość wykonania q i modyfikator konfliktu u losowane raz na mecz z osobnego strumienia
// new Rng(`pi:${seed}:${side}:${pid}`) (nigdy RNG meczu). Zysk x q, koszt x (2 - q). Wartości są ukryte
// przed graczem: nie trafiają do zdarzeń ani do zapisu (T.piReport tylko dla testów).
// Bez instrukcji indywidualnych nic się nie liczy (T.piOn = false), mecz jest identyczny jak wcześniej.

import { Rng, clamp } from '../../core/rng.js';
import { INSTRUCTIONS } from '../../data/instructions.js';
import { PLAYER_INSTRUCTIONS, playerInstruction, teamLevel, cleanPlayerInstrMap, cleanPlayerInstr } from '../../data/playerInstructions.js';
import { INSTR_NUM } from './constants.js';

/** Wartości balansowe [SZAC], pomiar A/B w docs/instrukcje-indywidualne.md. */
export const PI = {
  w: 0.1, // waga zawodnika w parametrach drużyny (10 zawodników = instrukcja drużyny)
  // Parametry liczone dla każdego zawodnika osobno (x.pi), nie w sumie drużyny
  perPlayer: new Set(['fatMul', 'fatMidMul', 'yellowPerFoul', 'redPerFoul']),
  // Efekty „drużynowe” (jak 10 zawodników) instrukcji bez odpowiednika w taktyce drużyny; poziom 0 = brak efektu
  fx: {
    dribble: { 1: { brk: 0.15, counterVulnMul: 1.2, passAcc: -0.02, penDrawMul: 1.3 }, [-1]: { brk: -0.08, counterVulnMul: 0.92, passAcc: 0.01, penDrawMul: 0.85 } },
    shoot: { 1: { act: { DYS: 1.5, POZ: 0.93 } }, [-1]: { act: { DYS: 0.6, POZ: 1.04 } } },
    cross: { 1: { act: { SKR: 1.35, POZ: 0.92 }, brkPerAerial: 0.03, passAcc: -0.015 }, [-1]: { act: { SKR: 0.75, POZ: 1.05 } } },
    run: { 1: { counterVulnMul: 1.4, offsideMul: 1.3 }, [-1]: { counterVulnMul: 0.8, offsideMul: 0.85, D: 0.1 } },
  },
  // Efekty tylko dla zawodnika (mnożniki wag losowania i zmęczenia), względem poziomu 0
  micro: {
    tackleW: { tackle: { 1: 1.15, [-1]: 0.88 }, press: { 1: 1.08, [-1]: 0.95 } },
    fat: { dribble: { 1: 1.03, [-1]: 1 }, cross: { 1: 1.04, [-1]: 0.98 }, run: { 1: 1.08, [-1]: 0.95 } },
    dysW: { 1: 1.8, [-1]: 0.4 }, shotW: { 1: 1.1, [-1]: 0.95 },
    skrA: { 1: 1.6, [-1]: 0.6 }, othA: { 1: 0.92, [-1]: 1.04 },
    offW: { 1: 1.3, [-1]: 0.75 },
    shift: 0.15, shiftMax: 0.25, // Pozycja: udział strefy DEF -> ATT (do przodu), ATT -> DEF (z tyłu)
  },
  // Jakość wykonania q: inteligencja (DEC, WIZ, UST z wagami instrukcji) ok. 50-60 % zmienności
  q: {
    base: 0.96, attr: 0.08, mean: 10.6, sd: 2.3, form: 0.05, morale: 0.01, noise: 0.064, min: 0.6, max: 1.2,
    rain: 0.06, wind: 0.06, heat: 0.06, calm: 0.03, nervous: -0.05, hothead: 1.5,
  },
  intel: {
    pass: { DEC: 0.4, WIZ: 0.5, UST: 0.1 }, dribble: { DEC: 0.6, WIZ: 0.3, UST: 0.1 }, shoot: { DEC: 0.7, WIZ: 0.2, UST: 0.1 },
    cross: { DEC: 0.4, WIZ: 0.5, UST: 0.1 }, tackle: { DEC: 0.4, UST: 0.6 }, run: { DEC: 0.3, WIZ: 0.2, UST: 0.5 },
    press: { DEC: 0.4, WIZ: 0.1, UST: 0.5 },
  },
  // Atrybuty wykonania (zysk); dobre atrybuty też lekko zmniejszają koszt
  skill: {
    pass: ['POD', 'TEC', 'WIZ'], dribble: ['DRY', 'ZWI', 'TEC'], shoot: ['DYS'], cross: ['DOS', 'SZY', 'WYT'],
    tackle: ['ODB', 'SIL'], run: ['WYT', 'SZY', 'PRA'], press: ['PRA', 'WYT', 'AGR'],
  },
  // Konflikt z planem drużyny: w ok. 25-30 % meczów lekki bonus (do +10 %), poza tym lekka kara (do -15 %)
  conflict: { pBonus: 0.28, pStatus: 0.08, bonus: 0.10, pen: 0.10, minScale: 0.6, maxScale: 1.5 },
  cohesion: 3, cohesionMax: 2, // młody albo nowy w konflikcie z planem: sufit spójności drużyny w meczu -3 za zawodnika
  changeCost: 2, changeCostMax: 6, // koszt zgrania przy zmianie w meczu (w przerwie bez kosztu)
};

const GOOD = {
  pos: 1, oppPos: -1, pActMul: 1, D: 1, counterVulnMul: -1, oppPActMul: -1, foulMul: -1, penMul: -1, brk: 1, brkPerTec: 1,
  brkPerAerial: 1, setPieceD: 1, DvsPOZ: 1, DvsKON: 1, oppOffsideMul: 1, redMul: -1, passAcc: 1, pressHigh: 1,
  tackleHard: 1, tackleSoft: -1, tacFoulMul: 1, offsideMul: -1, penDrawMul: 1, yellowPerFoul: -1, redPerFoul: -1,
  fatMul: -1, fatMidMul: -1,
};
const isMulKey = (k) => k.endsWith('Mul') || k === 'yellowPerFoul' || k === 'redPerFoul';
const MID4 = new Set(['DP', 'ŚP', 'OP', 'BP']);

// ------------------------------------------------------------ Efekty instrukcji
const fxCache = new Map();
/** Efekt instrukcji na danym poziomie jako lista [klucz, wartość, mnożnikowy] (act.X, oppAct.X rozwinięte). */
function fxList(def, level) {
  const key = `${def.id}:${level}`;
  if (fxCache.has(key)) return fxCache.get(key);
  let eff = {};
  if (def.team) {
    const optId = Object.keys(def.team.levels).find((k) => def.team.levels[k] === level);
    const opt = INSTRUCTIONS.find((i) => i.id === def.team.id)?.options.find((o) => o.id === optId);
    eff = { ...(opt?.effect ?? {}), ...(INSTR_NUM[def.team.id]?.[optId] ?? {}) };
  } else eff = PI.fx[def.id]?.[level] ?? {};
  const out = [];
  for (const [k, v] of Object.entries(eff)) {
    if (k === 'act' || k === 'oppAct') for (const [t, m] of Object.entries(v)) out.push([`${k}.${t}`, m, true]);
    else if (typeof v === 'number') out.push([k, v, isMulKey(k)]);
  }
  fxCache.set(key, out);
  return out;
}

function fxValue(def, level, k) {
  const e = fxList(def, level).find((r) => r[0] === k);
  return e ? e[1] : null;
}

const goodOf = (k) => (k.startsWith('act.') ? 1 : k.startsWith('oppAct.') ? -1 : GOOD[k] ?? 0);

/**
 * Przesunięcie parametrów drużyny od zawodników z instrukcjami innymi niż drużyna.
 * entries: [{ id, lv (poziom zawodnika), tl (poziom drużyny), b (mnożnik zysku), c (mnożnik kosztu), pw (waga pozycji) }].
 * Zwraca { add, mul, act, oppAct } (mul i act jako gotowe mnożniki) albo null. Bez parametrów zawodnika (PI.perPlayer).
 */
const diffCache = new Map();
/** Różnice efektu poziomu zawodnika i drużyny: [[grupa (add|mul|act|oppAct), klucz, d, dobry kierunek], ...] (pamięć podręczna). */
function diffList(def, lv, tl) {
  const key = `${def.id}:${lv}:${tl}`;
  let out = diffCache.get(key);
  if (out) return out;
  out = [];
  const P = fxList(def, lv); const T0 = fxList(def, tl);
  const keys = new Set([...P.map((r) => r[0]), ...T0.map((r) => r[0])]);
  for (const k of keys) {
    if (PI.perPlayer.has(k)) continue;
    const act = k.startsWith('act.'); const opp = k.startsWith('oppAct.');
    const mul = isMulKey(k) || act || opp;
    const vp = fxValue(def, lv, k) ?? (mul ? 1 : 0); const vt = fxValue(def, tl, k) ?? (mul ? 1 : 0);
    const d = mul ? vp / vt - 1 : vp - vt;
    if (!d) continue;
    out.push([act ? 'act' : opp ? 'oppAct' : mul ? 'mul' : 'add', act ? k.slice(4) : opp ? k.slice(7) : k, d, goodOf(k)]);
  }
  diffCache.set(key, out);
  return out;
}

export function teamShift(entries) {
  const acc = { add: {}, mul: {}, act: {}, oppAct: {} };
  let any = false;
  for (const e of entries) {
    const def = playerInstruction(e.id);
    if (!def || e.lv === e.tl) continue;
    const w = PI.w * (e.pw ?? 1); const b = e.b ?? 1; const c = e.c ?? 1;
    for (const [g, k, d, good] of diffList(def, e.lv, e.tl)) {
      const v = w * d * (!good ? 1 : good * d > 0 ? b : c);
      any = true;
      acc[g][k] = (acc[g][k] ?? 0) + v;
    }
  }
  if (!any) return null;
  const add = acc.add; const mulAcc = acc.mul; const actAcc = acc.act; const oppAcc = acc.oppAct;
  const fin = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, 1 + v]));
  return { add, mul: fin(mulAcc), act: fin(actAcc), oppAct: fin(oppAcc) };
}

/**
 * Parametry drużyny z przesunięciem od zawodników (bufor out, bez alokacji co minutę). Gdy parametry drużyny są stałe
 * (koniec przejścia między taktykami) i przesunięcie się nie zmieniło, wynik z poprzedniej minuty (memo: { base, S }).
 * Bufor bez dodatkowych pól: ten sam kształt obiektu co parametry drużyny (szybki dostęp w silniku).
 */
export function applyShift(base, S, out, stable = false, memo = null) {
  if (memo) {
    if (stable && memo.base === base && memo.S === S) return out;
    memo.base = stable ? base : null; memo.S = S;
  }
  // Klucze w tej samej kolejności co parametry drużyny (ten sam kształt obiektu co bufor przejścia taktyki)
  for (const k in base) {
    if (k === 'act' || k === 'oppAct') {
      const o = out[k] ?? (out[k] = {}); const src = base[k]; const m = S[k];
      for (const t in src) o[t] = src[t] * (m[t] ?? 1);
    } else out[k] = base[k];
  }
  for (const k in S.add) out[k] = (base[k] ?? 0) + S.add[k];
  for (const k in S.mul) out[k] = (base[k] ?? 1) * S.mul[k];
  return out;
}

// ------------------------------------------------------------ Jakość wykonania i konflikt
const attr = (p, k) => p.attr?.[k] ?? p.ovr ?? 10;
const avgAttr = (p, ks) => ks.reduce((s, k) => s + attr(p, k), 0) / ks.length;

/** Pogoda z ctx.weather (type z dnia meczowego; bez typu z mnożników silnika). */
export function weatherKind(w = {}) {
  const t = w.type;
  return {
    rain: t === 'deszcz' || t === 'snieg' || (!t && (w.dys ?? 1) > 1 && (w.foul ?? 1) > 1),
    wind: t === 'wiatr' || (!t && (w.dys ?? 1) < 1),
    heat: (w.tempC ?? 0) > 28 || (w.fat ?? 1) >= 1.25,
  };
}

/** Losowania zawodnika na mecz (raz, osobny strumień): szum jakości i dwa losowania konfliktu dla każdej instrukcji. */
function drawsOf(T, x) {
  if (x.piDraw) return x.piDraw;
  const r = new Rng(`pi:${T.piSeed}:${T.side}:${x.id}`);
  const noise = {}; const conf = {};
  for (const d of PLAYER_INSTRUCTIONS) noise[d.id] = r.gauss(0, 1);
  for (const d of PLAYER_INSTRUCTIONS) conf[d.id] = [r.next(), r.next()];
  x.piDraw = { noise, conf };
  return x.piDraw;
}

/** Jakość wykonania instrukcji id na poziomie level (0.6-1.2); bez nowych losowań przy kolejnych wywołaniach. */
export function qualityOf(T, x, id, level) {
  const Q = PI.q; const p = x.p; const ctx = T.piCtx?.ctx ?? {};
  let I = 0;
  for (const [k, w] of Object.entries(PI.intel[id])) I += w * attr(p, k);
  let q = Q.base + Q.attr * (I - Q.mean) / Q.sd;
  q += Q.form * (x.dayForm ?? 0) + Q.morale * ((p.morale ?? 12) - 12);
  const wk = weatherKind(ctx.weather);
  if (level === 1) {
    if (wk.rain && (id === 'pass' || id === 'cross' || id === 'dribble' || id === 'shoot')) q -= id === 'pass' || id === 'cross' ? Q.rain : Q.rain * 0.8;
    if (wk.wind && (id === 'pass' || id === 'cross' || id === 'shoot')) q -= id === 'shoot' ? Q.wind * 0.8 : Q.wind;
    if (wk.heat && (id === 'press' || id === 'run')) q -= id === 'press' ? Q.heat : Q.heat / 2;
  }
  let sd = Q.noise;
  if ((ctx.rank ?? 0) >= 2) {
    if (p.persona === 'Spokojny') q += Q.calm;
    else if (p.persona === 'Wrażliwy') q += Q.nervous;
    else if (p.persona === 'Narwaniec' && (id === 'tackle' || id === 'press')) sd *= Q.hothead;
  }
  q += sd * drawsOf(T, x).noise[id];
  return clamp(q, Q.min, Q.max);
}

/** Czy instrukcja zawodnika jest sprzeczna z planem drużyny. */
export function isConflict(id, level, instr = {}) {
  const def = playerInstruction(id);
  if (def?.team) { const tl = teamLevel(id, instr); return tl !== 0 && level === -tl; }
  const m = Number(instr.mentality ?? 0);
  if (id === 'run') return (level === 1 && m <= -1) || (level === -1 && m >= 1);
  if (id === 'dribble') return level === 1 && m <= -1;
  if (id === 'shoot' || id === 'cross') return level === 1 && instr.passing === 'short';
  return false;
}

const DAY = 86400000;
/** Pozycja zawodnika w szatni (-2..2): lider, kapitan, gwiazda, pewniak, morale; nowy, młody, słabe morale, pogoda. */
export function statusOf(T, x) {
  const p = x.p; const c = T.piCtx ?? {}; const ctx = c.ctx ?? {};
  let s = 0;
  if (p.persona === 'Lider') s += 1;
  if (T.takers?.captain === x.id) s += 1;
  if (c.repHi != null && (p.rep ?? 0) >= c.repHi) s += 0.5;
  if (c.minHi > 0 && (p.season?.min ?? 0) >= 0.6 * c.minHi) s += 0.5;
  if (isNewcomer(p, ctx.date)) s -= 1;
  if ((p.age ?? 25) <= 20) s -= 0.5;
  const mo = p.morale ?? 12;
  if (mo <= 8) s -= 0.5; else if (mo >= 16) s += 0.25;
  if (c.teamMorale != null) s += c.teamMorale >= 14 ? 0.5 : c.teamMorale <= 9 ? -0.5 : 0;
  const wk = weatherKind(ctx.weather);
  if (wk.rain || wk.wind) s -= 0.5;
  return clamp(s, -2, 2);
}

/** Nowy w klubie: przyszedł (p.lastMove) w ciągu 90 dni przed meczem (ctx.date). */
function isNewcomer(p, date) {
  if (!p.lastMove || !date) return false;
  const d = (Date.parse(date) - Date.parse(p.lastMove)) / DAY;
  return d >= 0 && d < 90;
}

/** Modyfikator konfliktu (-0.15..+0.10) z losowań zawodnika i jego pozycji w szatni. */
export function conflictOf(T, x, id) {
  const C = PI.conflict; const s = statusOf(T, x);
  const [r1, r2] = drawsOf(T, x).conf[id];
  const pB = clamp(C.pBonus + C.pStatus * s, 0.08, 0.55);
  if (r1 < pB) return C.bonus * r2;
  return -C.pen * r2 * clamp(1 - 0.25 * s, C.minScale, C.maxScale);
}

// ------------------------------------------------------------ Zawodnik
/**
 * Efekty instrukcji jednego zawodnika na jego obecnej pozycji (x.slot.pos) albo null.
 * { devs (do sumy drużyny), fat, foulW, yc, rc, tackleW, dysW, shotW, skrA, othA, offW, fwd, back, share, cohesion }.
 */
export function playerPI(T, x) {
  const o = T.tactics.playerInstr?.[x.id];
  if (!o || !x.slot) return null;
  const pos = x.slot.pos; const ti = T.tactics.instructions ?? {};
  const pi = { devs: [], fat: 1, foulW: 1, yc: 1, rc: 1, tackleW: 1, dysW: 1, shotW: 1, skrA: 1, othA: 1, offW: 1, fwd: 0, back: 0, share: null, cohesion: false };
  const rep = T.piReport;
  const mu = PI.micro;
  let conflictAny = false;
  for (const def of PLAYER_INSTRUCTIONS) {
    const lv = o[def.id];
    if (!lv || !def.pos.includes(pos)) continue;
    const tl = teamLevel(def.id, ti);
    if (lv === tl) continue;
    const q = qualityOf(T, x, def.id, lv);
    const conf = isConflict(def.id, lv, ti);
    const u = conf ? conflictOf(T, x, def.id) : 0;
    const af = clamp(1 + 0.08 * (avgAttr(x.p, PI.skill[def.id]) - 12), 0.5, 1.5);
    let cf = clamp(1 - 0.5 * (af - 1), 0.6, 1.4);
    if (def.id === 'tackle') cf = clamp(cf + 0.05 * (attr(x.p, 'AGR') - 11) - 0.05 * (attr(x.p, 'OPA') - 11), 0.6, 1.5);
    const b = q * af * (1 + u); const c = (2 - q) * cf * (1 - u);
    const pw = def.posWeight?.[pos] ?? 1;
    pi.devs.push({ id: def.id, lv, tl, b, c, pw });
    (rep[x.id] ?? (rep[x.id] = {}))[def.id] = { q, u, conflict: conf };
    if (conf) conflictAny = true;
    // Mnożnik zawodnika: r (surowy) skalowany zyskiem albo kosztem; good: czy wzrost to zysk
    const sc = (r, good) => { const d = (r - 1) * pw; return 1 + d * (good * d > 0 ? b : c); };
    const ratio = (k) => (fxValue(def, lv, k) ?? 1) / (fxValue(def, tl, k) ?? 1);
    const rel = (tbl) => (tbl[lv] ?? 1) / (tbl[tl] ?? 1);
    if (def.id === 'tackle') {
      pi.foulW *= sc(ratio('foulMul'), -1); pi.yc *= sc(ratio('yellowPerFoul'), -1); pi.rc *= sc(ratio('redPerFoul'), -1);
      pi.tackleW *= sc(rel(mu.tackleW.tackle), 1);
    } else if (def.id === 'press') {
      pi.fat *= sc(ratio('fatMul'), -1); pi.foulW *= sc(ratio('foulMul'), -1); pi.tackleW *= sc(rel(mu.tackleW.press), 1);
    } else if (def.id === 'pass') {
      if (MID4.has(pos)) pi.fat *= sc(ratio('fatMidMul'), -1);
    } else if (def.id === 'shoot') {
      pi.dysW *= sc(mu.dysW[lv], 1); pi.shotW *= sc(mu.shotW[lv], 1);
    } else if (def.id === 'cross') {
      pi.skrA *= sc(mu.skrA[lv], 1); pi.othA *= sc(mu.othA[lv], 1); pi.fat *= sc(mu.fat.cross[lv], -1);
    } else if (def.id === 'dribble') {
      pi.fat *= sc(mu.fat.dribble[lv], -1);
    } else if (def.id === 'run') {
      pi.offW *= sc(mu.offW[lv], -1); pi.fat *= sc(mu.fat.run[lv], -1);
      const f = Math.min(mu.shiftMax, mu.shift * b);
      if (lv === 1) pi.fwd = f; else pi.back = f;
    }
  }
  if (!pi.devs.length) return null;
  // Młody albo nowy zawodnik w konflikcie z planem lekko psuje zgranie; lidera, kapitana i gwiazdę szatnia akceptuje
  const p = x.p; const c = T.piCtx ?? {};
  const respected = p.persona === 'Lider' || T.takers?.captain === x.id || (c.repHi != null && (p.rep ?? 0) >= c.repHi);
  pi.cohesion = conflictAny && !respected && ((p.age ?? 25) <= 21 || isNewcomer(p, c.ctx?.date));
  return pi;
}

/** Udział zawodnika w strefach z przesunięciem Pozycja (do przodu: DEF -> ATT, z tyłu: ATT -> DEF). */
export function shiftedShare(share, pi) {
  if (pi.share && pi.share.base === share) return pi.share.v;
  const f = pi.fwd; const g = pi.back;
  let v = share;
  if (f) v = { DEF: share.DEF * (1 - f), MID: share.MID, ATT: share.ATT + f * share.DEF };
  else if (g) v = { DEF: share.DEF + g * share.ATT, MID: share.MID, ATT: share.ATT * (1 - g) };
  pi.share = { base: share, v };
  return v;
}

// ------------------------------------------------------------ Drużyna
/** Kontekst drużyny dla instrukcji (raz na mecz, tylko gdy są instrukcje): reputacja i minuty w kadrze. */
function teamCtx(T) {
  const c = T.piCtx;
  if (c.repHi !== undefined) return c;
  const all = [...T.players, ...T.bench].map((x) => x.p);
  c.repHi = all.length ? all.reduce((s, p) => s + (p.rep ?? 0), 0) / all.length + 10 : null;
  c.minHi = all.reduce((m, p) => Math.max(m, p.season?.min ?? 0), 0);
  if (c.minHi < 450) c.minHi = 0; // początek sezonu: nikt nie jest jeszcze pewniakiem
  return c;
}

/**
 * Przeliczenie efektów instrukcji drużyny (co minutę, tanio: tylko gdy zmieni się skład z instrukcjami,
 * pozycje albo taktyka). Ustawia x.pi, T.piShift i T.sCap (sufit spójności).
 */
export function refreshPI(T) {
  const map = T.tactics.playerInstr ?? {};
  // Podpis bez napisów: wersja taktyki i zawodnicy z instrukcjami na boisku z pozycjami (tanio co minutę)
  const sig = T.piSigArr ?? (T.piSigArr = []);
  let n = 0; let same = T.piSig === T.piVer;
  for (const x of T.players) {
    if (!(x.on && !x.sentOff && map[x.id])) continue;
    const pos = x.slot?.pos;
    if (sig[n] !== x || sig[n + 1] !== pos) { same = false; sig[n] = x; sig[n + 1] = pos; }
    n += 2;
  }
  if (sig.length !== n) { same = false; sig.length = n; }
  if (same) return;
  T.piSig = T.piVer;
  teamCtx(T);
  const entries = [];
  let coh = 0;
  for (const x of T.players) {
    x.pi = x.on && !x.sentOff && map[x.id] ? playerPI(T, x) : null;
    if (x.pi) { for (const e of x.pi.devs) entries.push(e); if (x.pi.cohesion) coh++; }
  }
  for (const x of T.bench) x.pi = null;
  T.piShift = entries.length ? teamShift(entries) : null;
  T.sCap = 100 - PI.cohesion * Math.min(coh, PI.cohesionMax);
}

/** Wyłączenie instrukcji (brak nadpisań): wszystko jak bez instrukcji. */
export function clearPI(T) {
  for (const x of [...T.players, ...T.bench]) x.pi = null;
  T.piShift = null; T.piSig = null; T.piSigArr = null; T.sCap = 100;
}

/**
 * Walidacja zmiany instrukcji indywidualnych w meczu: komunikat błędu albo null.
 * patch: { [id]: { pass: -1|0|1|null, ... } | null } (null: wszystkie jak drużyna).
 */
export function validatePlayerInstr(T, patch) {
  if (typeof patch !== 'object' || Array.isArray(patch) || patch === null) return 'Nieprawidłowe instrukcje indywidualne.';
  const all = new Map([...T.players, ...T.bench].map((x) => [String(x.id), x]));
  for (const [pid, o] of Object.entries(patch)) {
    const x = all.get(String(pid));
    if (!x) return 'Instrukcje indywidualne: tego zawodnika nie ma w kadrze meczowej.';
    if (x.sentOff) return 'Ten zawodnik został wykluczony z gry.';
    if (o === null) continue;
    if (typeof o !== 'object' || Array.isArray(o)) return 'Nieprawidłowe instrukcje indywidualne.';
    for (const [k, v] of Object.entries(o)) {
      const def = playerInstruction(k);
      if (!def) return 'Nieznana instrukcja indywidualna.';
      if (!(v === -1 || v === 0 || v === 1 || v === null)) return `${def.label}: nieprawidłowa wartość.`;
      if (v && !def.pos.includes(x.p.pos) && !(x.slot && def.pos.includes(x.slot.pos))) return `${def.label}: ta instrukcja nie dotyczy pozycji zawodnika.`;
    }
  }
  return null;
}

/** Nowa mapa nadpisań po zmianie (klucz 0/null: jak drużyna, zawodnik null: wszystkie jak drużyna) i liczba zmienionych. */
export function mergePlayerInstr(cur = {}, patch = {}) {
  const out = { ...cur };
  let changed = 0;
  for (const [pid, o] of Object.entries(patch)) {
    const prev = cur[pid] ?? null;
    const next = o === null ? null : cleanPlayerInstr({ ...(prev ?? {}), ...o });
    if (next) out[pid] = next; else delete out[pid];
    if (JSON.stringify(prev) !== JSON.stringify(next)) changed++;
  }
  return { map: cleanPlayerInstrMap(out), changed };
}
