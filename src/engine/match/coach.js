// AI trenera w meczu (docs/ekspert_futbol.md 7.2, docs/sytuacje-meczowe.md, docs/ai-trener.md). Ta sama logika
// prowadzi rywala, asystenta gracza („Pokaż wynik”) i podpowiedzi asystenta w trakcie meczu (assistantSuggest).
// Trener widzi tylko to, co widzi trener na ławce: wynik (w dwumeczu sumę), minutę, liczebność, kartki,
// kondycję, urazy, ławkę, przebieg gry (strzały, groźne sytuacje, posiadanie, skąd biorą się okazje)
// i sposób gry rywala (z opóźnieniem rozpoznania). Zmienia tylko swoją drużynę i tylko przez
// substitute/changeTactics/shout, na tych samych zasadach co gracz. Wartości balansowe [SZAC].

import { substitute, changeTactics, subsAvailable, isConcussionSub, shout, canShout } from './control.js';
import { setCoachHooks } from './core.js';
import { goalkeeper, fieldPlayers, slotFit, reslot, assignSlots, shapeSlots } from './teams.js';
import { proficiency } from '../positions.js';
import { formationById } from '../../data/formations.js';
import { K, KNOCK, COACHQ } from './constants.js';
import { unlimitedSubs } from './rules.js';
import { clamp } from '../../core/rng.js';

const CHECKPOINTS = new Set([46, 55, 60, 65, 70, 75, 80, 85, 88, 95, 100, 105, 110, 115, 119]);
// Przegląd planu w 1. połowie: trener reaguje, gdy plan wyraźnie nie działa (nie tylko w przerwie) [SZAC]
const REVIEW_H1 = new Set([25, 35]);
const ATT = new Set(['NAP', 'SN', 'OP', 'SP']);
const DEF_ROLE = new Set(['ŚO', 'BO', 'WB', 'DP']);
const BACK = new Set(['ŚO', 'BO', 'WB']);
const BACK3 = new Set(['352', '343', '532', '541']);
const CENTRAL = new Set(['DP', 'ŚP', 'OP']);
const MANAGED = ['mentality', 'tempo', 'pressing', 'line', 'passing', 'timewasting', 'tackling', 'marking', 'counter'];
// Ustawienia przy pogoni za wynikiem (1: umiarkowanie, 2: trójka z tyłu) i przy obronie wyniku [SZAC]
const ATTACK1 = { 4141: '4231', 4231: '442', 442: '442', '442def': '442def', '442off': '442off', '442d': '442', 4321: '4231', 433: '433', 352: '352', 343: '343', 532: '352', 541: '442' };
const ATTACK2 = { 4141: '343', 4231: '343', 442: '343', '442def': '343', '442off': '343', '442d': '343', 4321: '343', 433: '343', 352: '343', 343: '343', 532: '352', 541: '352' };
const DEFEND_MID = { 4231: '4141', 433: '4141', 442: '4141', '442def': '4141', '442off': '4141', '442d': '4141', 4321: '4141', 4141: '4141', 352: '532', 343: '532', 532: '532', 541: '541' };
// Dodatkowy środkowy pomocnik, gdy przegrywamy środek pola (tylko w przerwie, tylko gdy zawodnicy pasują) [SZAC]
const MID_PLUS = { 442: '4231', '442def': '4141', '442off': '4231', 343: '352', 541: '532', 4231: '442d', 433: '442d', 4141: '442d' };
// Warianty 4-4-2 (te same role, inna wysokość linii): zmiana bez zmian personalnych (docs/taktyka-i-urazy.md)
const FAMILY_442 = new Set(['442', '442def', '442off']);
const DEEP = new Set(['541', '532', '442def']);

// Osobowość trenera (T.coach: O ofensywny, S ostrożny, P pragmatyczny). alert: szansa, że w punkcie oceny
// trener zareaguje na sposób gry rywala (style) albo na przebieg meczu (flow); upór losowany raz na mecz [SZAC].
const ALERT = { P: { style: 0.7, flow: 0.65 }, O: { style: 0.45, flow: 0.6 }, S: { style: 0.45, flow: 0.55 } };
const STUBBORN = { P: 0.1, O: 0.2, S: 0.3 };
const MAX_ADJ = 4; // korekty planu z przebiegu meczu na mecz (uparty trener: 2)
const KEY_COOLDOWN = 15; // ta sama instrukcja zmieniana z przebiegu meczu najwcześniej po 15 min (bez przestawiania tam i z powrotem)

const attr = (x, k) => x.p.attr?.[k] ?? x.p.ovr ?? 10;

// ------------------------------------------------------------ Umiejętności trenera (docs/trener-ai-atrybuty.md)
// T.cq: { tak, skl, mot, pre } (od -1 do 1) z atrybutów trenera, dyspozycji dnia i wagi meczu (career/coaches.js).
// Bez profilu (gracz, testy silnika) s = 0, czyli dokładnie zachowanie AI sprzed atrybutów (te same losowania).
// Asystent gracza: T.assistantCq z jakości asystenta w sztabie (przy przejęciu drużyny i w podpowiedziach).
const NO_CQ = { tak: 0, skl: 0, mot: 0, pre: 0 };
const cqOf = (T) => T.cq ?? (T.ai ? null : T.assistantCq) ?? NO_CQ;
/** Kluczowy moment: końcówka na styku (od 75. min, różnica najwyżej 1 gol), dogrywka, gra w osłabieniu lub przewadze. */
const keyMoment = (st) => !!st && (st.et || st.men !== 0 || (st.minute >= 75 && Math.abs(st.diff) <= 1));
/** Umiejętność taktyczna trenera w tej chwili meczu: TAK, w kluczowych momentach z odpornością na presję (PRE). */
export function tacSkill(T, st = null) {
  const c = cqOf(T);
  if (c === NO_CQ) return 0;
  return clamp(c.tak + (keyMoment(st) ? COACHQ.keyMoment * COACHQ.pressure * c.pre : 0), -1, 1);
}
/** Szansa p przesunięta umiejętnością s z siłą k: p x (1 + k s). Przy s = 0 bez zmian. */
const pAdj = (p, s, k) => (s ? clamp(p * (1 + k * s), 0.02, 0.99) : p);
const condAdj = (x) => (x.cond < 85 ? -0.04 * (85 - x.cond) : 0);
const chaseAt = (T, b) => b + (T.coach === 'O' ? -10 : T.coach === 'S' ? 5 : 0);
const protectAt = (T, b) => b + (T.coach === 'O' ? 7 : T.coach === 'S' ? -10 : 0);

// ------------------------------------------------------------ Stan meczu oczami trenera
/**
 * diff: różnica bramek (w dwumeczu suma z pierwszego meczu), men: przewaga liczebna (+) lub osłabienie (-),
 * str: różnica siły drużyn sprzed meczu (z atutem boiska), mom: momentum ostatnich 10 minut (-1..1).
 */
export function matchState(M, side) {
  const T = M.teams[side]; const O = M.teams[1 - side];
  const fl = M.ctx.knockout?.firstLeg;
  const diff = M.score[side] - M.score[1 - side] + (fl ? fl[side] - fl[1 - side] : 0);
  const atBreak = M.phase === 'break';
  const et = M.half >= 3 || (atBreak && M.extraTime && M.half === 2);
  const lastTen = M.momentum.slice(-10);
  const mom = lastTen.length ? lastTen.reduce((s, v) => s + v, 0) / lastTen.length / 100 * (side === 0 ? 1 : -1) : 0;
  return {
    diff, et, atBreak, halftime: atBreak && M.half === 1, ko: M.rules.decider !== 'none', minute: M.minute,
    friendly: M.rules.friendly, pens: M.rules.decider === 'penalties',
    added: M.half % 2 === 0 && M.elapsed > M.length, men: fieldPlayers(T).length - fieldPlayers(O).length,
    str: T.strDiff ?? 0, mom, heat: (M.ctx.weather?.fat ?? 1) >= 1.25,
  };
}

/**
 * Plan trenera na mecz: ustawienia wyjściowe (u gracza bieżące) z korektami z przebiegu meczu (T.adj).
 * Korekty znikają, gdy asystent przejmuje drużynę od gracza (nowe ustawienia wyjściowe).
 */
export function planInstr(T) {
  const base = T.ai ? (T.baseInstr ?? T.tactics.instructions) : T.tactics.instructions;
  const out = { ...base };
  if (T.ai && T.adj && T.adjBase === T.baseInstr) for (const [k, a] of Object.entries(T.adj)) out[k] = a.v;
  return out;
}

/** Docelowe instrukcje dla stanu meczu (od planu trenera; extra: nowe korekty planu z tego punktu oceny). */
export function desiredInstructions(T, st, extra = null) {
  const b = extra ? { ...planInstr(T), ...extra } : planInstr(T);
  const m = Number(b.mentality ?? 0);
  const w = {};
  let reason = null;
  if (st.diff < 0) {
    if (st.minute >= chaseAt(T, st.diff <= -2 ? 60 : 65) || (st.men > 0 && st.minute >= 30) || (st.halftime && st.diff <= -2)
      || (st.diff <= -2 && st.minute >= chaseAt(T, 40))) {
      reason = 'gonimy wynik';
      w.mentality = String(Math.max(m, 1)); w.timewasting = 'off';
      if ((st.diff <= -2 && st.minute >= 60) || st.minute >= 80 || st.et) { w.mentality = '2'; w.tempo = 'fast'; w.pressing = st.men < 0 ? 'mid' : 'high'; }
      if (st.minute >= 85 || st.added) { w.mentality = '2'; w.passing = 'long'; w.line = 'high'; }
    }
  } else if (st.diff > 0) {
    if (st.minute >= protectAt(T, st.diff >= 2 ? 70 : 75)) {
      reason = 'bronimy wyniku';
      w.mentality = String(Math.min(m, st.men > 0 ? 0 : -1));
      if (st.diff === 1) w.tempo = 'slow';
      if (st.minute >= 82 || st.added) w.timewasting = 'on';
      if (st.diff === 1 && (st.minute >= 85 || st.added) && st.men <= 0 && (st.mom < -0.2 || T.coach === 'S')) {
        w.mentality = '-2'; w.line = 'low'; w.pressing = 'low'; reason = 'murujemy bramkę';
      }
      if (st.men > 0) w.passing = 'short'; // w przewadze trzymamy piłkę
    }
  } else if (st.men > 0 && st.minute >= 20) {
    reason = 'rywal w osłabieniu'; w.mentality = String(Math.max(m, 1)); w.pressing = 'high';
    if (st.minute >= 70) { w.mentality = '2'; w.tempo = 'fast'; }
  } else if (st.ko) {
    if (st.et && st.minute >= 112 && st.str < -0.5) { reason = 'gramy na rzuty karne'; w.mentality = String(Math.min(m, -1)); }
    else if (!st.et && st.minute >= 85 && st.str < 0) { reason = st.pens ? 'bez ryzyka przed rzutami karnymi' : 'bez ryzyka przed dogrywką'; w.mentality = String(Math.min(m, 0)); }
  } else if (st.minute >= 70 && st.str > 1) {
    reason = 'faworyt szuka gola'; w.mentality = String(Math.max(m, 1));
  } else if (st.minute >= 80 && st.str < -1) {
    reason = 'bierzemy punkt'; w.mentality = String(Math.min(m, -1));
  }
  if (st.men > 0 && st.diff <= 0 && st.minute >= 20) {
    w.pressing = 'high'; // rywal w dziesiątkę: wyżej i szybciej, niech biega
    if (Number(w.mentality ?? m) < 1) w.mentality = '1';
  }
  if (st.men < 0 && (st.diff >= 0 || !reason)) {
    // W osłabieniu zwarty blok i kontry; przy niekorzystnym wyniku do czasu pogoni (bez „powrotu do planu” w 10)
    w.pressing = 'low'; w.counter = 'yes';
    if (Number(w.mentality ?? m) > -1) w.mentality = '-1';
    reason = reason ?? 'gra w osłabieniu';
  }
  if (st.friendly && w.timewasting === 'on') delete w.timewasting; // w sparingu nikt nie gra na czas
  for (const k of MANAGED) if (!(k in w) && b[k] != null) w[k] = b[k];
  return { w, reason };
}

function instrPatch(T, w) {
  const out = {};
  for (const [k, v] of Object.entries(w)) if (v != null && T.tactics.instructions?.[k] !== v) out[k] = v;
  return out;
}

/** Kształt w osłabieniu: które pozycje zostają puste (np. 4-4-2 bez napastnika = 4-4-1). */
export function shortShape(T, st, k = 11 - fieldPlayers(T).length) {
  if (k <= 0) return null;
  const back3 = BACK3.has(T.tactics.formation);
  if (st.diff < 0 && st.minute >= 55) return back3 ? { formation: '352', drop: ['DP', 'ŚP', 'ŚP'].slice(0, k) } : { formation: '442d', drop: ['OP', 'ŚP', 'DP'].slice(0, k) };
  const deep = { formation: '442def', drop: ['NAP', 'SP', 'SP'].slice(0, k) };
  if (st.diff > 0 && st.minute >= 70) {
    // Obrona prowadzenia w osłabieniu: piątka obrońców (5-3-1 w dziesiątkę, 5-2-1 w dziewiątkę), gdy zawodnicy
    // pasują do takiego ustawienia; w innym razie niski blok 4-4-1 (4-3-1)
    const five = { formation: '541', drop: ['SP', 'SP', 'NAP'].slice(0, k) };
    return back3 || shapeFit(T, five.formation, five.drop) >= 0.97 * shapeFit(T, deep.formation, deep.drop) ? five : deep;
  }
  if (back3) return { formation: '532', drop: ['NAP', 'ŚP', 'NAP'].slice(0, k) };
  // Niski blok 4-4-1 przy prowadzeniu lub przeciw silniejszemu, zwykłe 4-4-1 przy remisie z równym lub słabszym
  return st.diff > 0 || st.str < 0 ? deep : { formation: '442', drop: ['NAP', 'SP', 'ŚP'].slice(0, k) };
}

/**
 * Wariant 4-4-2 dla stanu meczu (bez zmian personalnych): pogoń za wynikiem -> 4-4-2 ofensywne,
 * obrona prowadzenia albo remis z silniejszym pod koniec -> 4-4-2 defensywne. Tylko w pełnym składzie.
 * Zwraca { formation, reason } albo null.
 */
export function variant442(T, st) {
  const f = T.tactics.formation;
  if (!FAMILY_442.has(f) || fieldPlayers(T).length < 11) return null;
  let to = null; let reason = null;
  if (st.diff < 0) {
    if (st.minute >= chaseAt(T, st.diff <= -2 ? 60 : 65) || (st.diff <= -2 && st.halftime) || st.et) { to = '442off'; reason = 'gonimy wynik: wyżej linie, skrzydłowi do przodu'; }
    else if (f === '442def') { to = '442'; reason = 'straciliśmy gola: wychodzimy z niskiego bloku'; }
  } else if (st.diff > 0) {
    const late = st.minute >= protectAt(T, st.diff >= 2 ? 75 : 72);
    if (late && (st.diff === 1 || T.coach === 'S' || st.mom < -0.15)) { to = '442def'; reason = 'bronimy wyniku: niski blok, dwie linie po czterech'; }
    else if (f === '442off') { to = '442'; reason = 'prowadzimy: wracamy do równowagi'; }
  } else if (st.minute >= 75 && st.str < -1 && !st.ko) {
    to = '442def'; reason = 'bierzemy punkt z silniejszym: niski blok';
  } else if (f === '442off' && st.minute < 85 && st.str <= 1) {
    to = '442'; reason = 'wyrównaliśmy: wracamy do równowagi';
  }
  return to && to !== f ? { formation: to, reason } : null;
}

// ------------------------------------------------------------ Obraz meczu z ławki
// Liczniki na minutę z dziennika zdarzeń (tylko to, co widać: strzały, groźne sytuacje, skąd się biorą,
// podania). Czytane leniwie w punktach oceny, każde zdarzenie raz na mecz.
const XG = 0; const SH = 1; const BIG = 2; const KON = 3; const DYS = 4; const SP = 5; const PS = 6; const PSOK = 7;
const SHOT_EV = new Set(['shotOn', 'shotOff', 'shotBlocked', 'post', 'goal']);
const BIG_XG = 0.25; // groźna sytuacja [SZAC]

function observe(M) {
  const o = M.obs ?? (M.obs = { i: 0, rows: [] });
  const ev = M.events;
  for (; o.i < ev.length; o.i++) {
    const e = ev[o.i];
    const t = e.type;
    if (e.side == null || (t !== 'pass' && t !== 'passFail' && !SHOT_EV.has(t)) || e.ownGoal) continue;
    const row = o.rows[e.t] ?? (o.rows[e.t] = new Float64Array(16));
    const b = e.side * 8;
    const n = e.count ?? 1;
    if (t === 'pass') { row[b + PS] += n; row[b + PSOK] += n; continue; }
    if (t === 'passFail') { row[b + PS] += n; continue; }
    const xg = e.xg ?? 0;
    row[b + XG] += xg; row[b + SH]++;
    if (xg >= BIG_XG) row[b + BIG]++;
    const kind = e.kind ?? (e.how === 'HEAD' ? 'SKR' : e.how);
    if (kind === 'KON') row[b + KON]++;
    else if (kind === 'DYS') row[b + DYS]++;
    else if (kind === 'SP' || kind === 'FK') row[b + SP]++;
  }
  return o;
}

/**
 * Przebieg meczu oczami trenera strony side w ostatnich `span` minutach: xG, strzały i groźne sytuacje
 * (F: nasze, A: rywala), strzały rywala z kontr, z dystansu i ze stałych fragmentów, podania, posiadanie, momentum.
 */
export function flowView(M, side, span = 20) {
  const o = observe(M);
  const to = M.tick; const from = Math.max(1, to - span + 1);
  const f = side * 8; const a = (1 - side) * 8;
  const v = { span: to - from + 1, xgF: 0, xgA: 0, shF: 0, shA: 0, bigF: 0, bigA: 0, konA: 0, dysA: 0, spA: 0, psF: 0, okF: 0, psA: 0, okA: 0, poss: 0.5, mom: 0 };
  let pn = 0; let poss = 0; let mom = 0;
  for (let t = from; t <= to; t++) {
    const r = o.rows[t];
    if (r) {
      v.xgF += r[f + XG]; v.xgA += r[a + XG]; v.shF += r[f + SH]; v.shA += r[a + SH]; v.bigF += r[f + BIG]; v.bigA += r[a + BIG];
      v.konA += r[a + KON]; v.dysA += r[a + DYS]; v.spA += r[a + SP];
      v.psF += r[f + PS]; v.okF += r[f + PSOK]; v.psA += r[a + PS]; v.okA += r[a + PSOK];
    }
    const ph = M.possession[t - 1];
    if (ph != null) { poss += side === 0 ? ph : 1 - ph; pn++; }
    const mv = M.momentum[t - 1];
    if (mv != null) mom += (side === 0 ? mv : -mv) / 100;
  }
  if (pn) { v.poss = poss / pn; v.mom = mom / pn; }
  return v;
}

/** Ustawienie rywala tak, jak widzi je ławka: zmiana jest rozpoznana dopiero po `lag` minutach. */
export function seenTactics(M, O, lag = 8) {
  const log = O.tacLog ?? [{ min: -99, formation: O.tactics.formation, instr: O.tactics.instructions }];
  let r = log[0];
  for (const e of log) if (e.min <= M.minute - lag) r = e;
  return r;
}

/** Osobowość trenera w tym meczu (upór, czas rozpoznania), losowana raz z RNG meczu. Podpowiedź: bez losowania. */
function mindOf(T, rng, advice) {
  const s = tacSkill(T);
  // Dobry taktyk szybciej rozpoznaje zmiany rywala (4-8 min) i rzadziej jest uparty, słaby wolniej (8-12 min)
  if (advice) return { stubborn: false, lag: Math.max(3, 5 - Math.round(COACHQ.lag * s)), used: 0 };
  if (!T.mind) T.mind = { stubborn: rng.chance(pAdj(STUBBORN[T.coach] ?? 0.15, s, -COACHQ.stubborn)), lag: rng.int(6, 10) - Math.round(COACHQ.lag * s), used: 0 };
  return T.mind;
}

/** Punkt przeglądu planu poza punktami kontrolnymi: 25. i 35. minuta, przerwa na schłodzenie w upale. */
function reviewPoint(M) {
  if (M.half === 1 && REVIEW_H1.has(M.elapsed)) return true;
  const w = M.ctx.weather ?? {};
  return M.half <= 2 && M.elapsed === 30 && !!(w.cooling || (w.tempC ?? 0) >= K.coolingTempC);
}

const stepDown = { high: 'mid', mid: 'low', low: 'low' };
const boldness = (val) => ({ low: -1, mid: 0, high: 1 }[val] ?? Number(val ?? 0));
const avgOf = (xs, f) => (xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : 0);

/**
 * Korekty planu z przebiegu meczu (nie z wyniku): siły zawodników, kartki, sposób gry rywala, obraz gry,
 * walka o środek pola. Nic nie zmienia; zwraca { set, reason, keys, formation, formationReason } albo null.
 * Każda korekta ma efekt w silniku (tacticParams, counterBonus): docs/ai-trener.md.
 */
function reviewAdjust(M, T, st, rng, advice, mind) {
  if (M.ended || st.et) return null;
  const O = M.teams[1 - T.side];
  const plan = planInstr(T);
  const min = st.minute;
  const adj = T.ai && T.adjBase === T.baseInstr ? (T.adj ?? {}) : {};
  const cands = [];
  const s = tacSkill(T, st);
  let v = null; let seen = null; let pinned = false;
  const add = (key, val, reason, kind) => {
    if (plan[key] === val || cands.some((c) => c.key === key)) return;
    if (!advice && adj[key] && min - adj[key].min < KEY_COOLDOWN) return;
    cands.push({ key, v: val, reason, kind });
  };
  const xs = fieldPlayers(T).filter((x) => x.slot && x.slot.pos !== 'BR');
  const legs = avgOf(xs, (x) => x.cond);
  const fit = (st.heat ? 3 : 0);
  const lateChase = st.diff < 0 && min >= 70;
  const mentality = Number(plan.mentality ?? 0);

  // 1. Siły: wysoki pressing i szybkie tempo kosztują kondycję (fatMul); poniżej ok. 70 rośnie ryzyko urazu
  if (!lateChase && (min >= 50 || (st.halftime && st.heat))) {
    if (plan.pressing === 'high' && legs < 76 + fit) add('pressing', 'mid', 'zmęczenie: niższy pressing', 'legs');
    if (plan.tempo === 'fast' && legs < 74 + fit) add('tempo', 'normal', 'zmęczenie: wolniejsze tempo', 'legs');
  }
  // 2. Kartki: kilku ukaranych obrońców lub pomocników, łagodniej w odbiorze (mniej fauli i drugich żółtych)
  const booked = xs.filter((x) => x.yc);
  const bookedDef = booked.filter((x) => DEF_ROLE.has(x.slot.pos)).length;
  if (min < 78 && !lateChase) {
    if (plan.tackling !== 'soft' && (bookedDef >= 2 || booked.length >= 3)) add('tackling', 'soft', 'kilku zawodników z kartkami: ostrożniej w odbiorze', 'cards');
    else if (plan.tackling === 'hard' && bookedDef >= 1) add('tackling', 'normal', 'obrońca z kartką: bez twardych wejść', 'cards');
  }
  if (fieldPlayers(T).length < 11 && st.men < 0) return finish(); // w osłabieniu plan ustala reorganizacja
  // 3. Sposób gry rywala (widoczny z ławki, rozpoznany z opóźnieniem)
  seen = seenTactics(M, O, mind.lag);
  const so = seen.instr ?? {};
  const tec = T.avg?.('TEC') ?? 11;
  if (min >= 15 || st.atBreak) {
    if (so.pressing === 'high' && plan.passing === 'short' && tec < 12) add('passing', 'mixed', 'rywal pressuje wysoko: grajmy prościej', 'style');
    else if (so.pressing === 'high' && plan.passing !== 'short' && tec >= 12.3) add('passing', 'short', 'rywal pressuje wysoko: rozgrywamy krótko przez pressing', 'style');
    if ((Number(so.mentality ?? 0) >= 1 || so.line === 'high') && plan.counter === 'no') add('counter', 'yes', 'rywal gra wysoko: szybkie kontry za plecy', 'style');
    if ((so.passing === 'long' || Number(so.mentality ?? 0) >= 2) && plan.line === 'high') add('line', 'mid', so.passing === 'long' ? 'rywal gra długimi piłkami: niżej linia obrony' : 'rywal rzuca się do ataku: niżej linia obrony', 'style');
    const deep = Number(so.mentality ?? 0) <= -1 || so.line === 'low' || DEEP.has(seen.formation);
    if (deep && st.diff === 0 && min >= 25 && min <= 80 && st.str > -1) {
      if (plan.passing !== 'short' && tec >= 11.5) add('passing', 'short', 'rywal się cofnął: cierpliwie, krótkimi podaniami', 'style');
      else if (plan.pressing !== 'high' && legs >= 80) add('pressing', 'high', 'rywal się cofnął: odbieramy piłkę wysoko', 'style');
    }
    if (so.passing === 'short' && plan.pressing !== 'high' && legs >= 80 && min < 70) {
      const all = flowView(M, T.side, M.tick);
      if (all.psA >= 80 && all.okA / all.psA < 0.79) add('pressing', 'high', 'rywal myli się w rozegraniu: wysoki pressing', 'style');
    }
  }
  // 4. Obraz gry: rywal przeważa, my bez sytuacji, odzyskana kontrola
  if ((min >= 20 && min <= 78) || st.halftime) {
    v = flowView(M, T.side, st.halftime ? M.tick : 20);
    const k = v.span / 20;
    pinned = (v.xgA - v.xgF >= 0.35 + 0.15 * k && v.shA >= v.shF + 2 + k) || (v.bigA >= 1 + k && v.xgA >= v.xgF + 0.3)
      || (v.mom <= -0.12 && v.xgA >= v.xgF + 0.15); // momentum 20 min: -0,12 to ok. 5 % najgorszych okresów
    if (pinned && st.diff >= 0 && st.diff <= 1) {
      if (v.konA >= 2 && v.konA >= 0.4 * v.shA && plan.line !== 'low') add('line', stepDown[plan.line ?? 'mid'], 'dostajemy kontry: cofamy linię obrony', 'flow');
      else if (v.dysA >= 3 && v.dysA >= 0.5 * v.shA && plan.line === 'low') add('line', 'mid', 'rywal strzela z dystansu: wyżej linia obrony', 'flow');
      else if (v.spA >= 3 && plan.marking === 'man') add('marking', 'zone', 'groźne stałe fragmenty: krycie strefowe', 'flow');
      // Ostrożny trener cofa się (w silniku nastawienie -1 prawie nie broni); dobry taktyk częściej wybiera pressing
      else if (T.coach === 'S' && !(s > 0 && plan.pressing !== 'high' && legs >= 78 && v.poss < 0.47 && rng.chance(COACHQ.correct * s))) {
        if (mentality > -1) add('mentality', String(mentality - 1), 'rywal przeważa: cofamy się i zagęszczamy środek', 'flow');
        else if (st.diff > 0 && plan.line !== 'low') add('line', 'low', 'rywal przeważa: niski blok', 'flow');
      } else if (plan.pressing !== 'high' && legs >= 78 && (T.coach === 'O' || v.poss < 0.47)) {
        add('pressing', 'high', T.coach === 'O' ? 'rywal przeważa: wyżej pressing, odbieramy inicjatywę' : 'rywal ma piłkę: wyżej pressing', 'flow');
      } else if (T.coach === 'P' && st.diff > 0 && mentality > -1) {
        add('mentality', String(mentality - 1), 'rywal przeważa: zabezpieczamy prowadzenie', 'flow');
      } else if (plan.tempo === 'fast') add('tempo', 'normal', 'rywal przeważa: uspokajamy grę', 'flow');
    }
    const toothless = v.poss >= 0.56 && v.xgF < 0.12 + 0.12 * k && v.shF <= 2 + 2 * k;
    if (toothless && st.diff === 0 && min >= 25 && min <= 75) {
      if (T.coach !== 'S' && mentality <= 0) add('mentality', String(mentality + 1), 'dużo piłki, mało sytuacji: więcej ludzi w ataku', 'flow');
      else if (plan.passing !== 'short' && tec >= 12) add('passing', 'short', 'dużo piłki, mało sytuacji: cierpliwie rozgrywamy', 'flow');
    }
    // Zagrożenie minęło, a remis nas nie urządza: ostrożne korekty wracają do planu wyjściowego
    if (!pinned && st.diff === 0 && v.xgF >= v.xgA + 0.3 && v.mom >= 0.1) {
      const base = T.baseInstr ?? {};
      for (const key of ['mentality', 'line']) {
        const a = adj[key];
        if (a?.kind === 'flow' && min - a.min >= 20 && base[key] != null && boldness(a.v) < boldness(base[key])) {
          add(key, base[key], 'opanowaliśmy mecz: wracamy do planu', 'revert');
        }
      }
    }
  }
  // Słaby taktyk (s < 0) czasem koryguje plan błędnie: decyzje, które w silniku kosztują punkty (docs/trener-ai-atrybuty.md)
  if (!advice && s < 0 && rng.chance(COACHQ.mistake * -s)) mistake();
  return finish();

  function mistake() {
    const front = (key, val, reason) => {
      if (plan[key] === val || (adj[key] && min - adj[key].min < KEY_COOLDOWN)) return false;
      const i = cands.findIndex((c) => c.key === key);
      if (i >= 0) cands.splice(i, 1);
      cands.unshift({ key, v: val, reason, kind: 'mistake' });
      return true;
    };
    const so = seen?.instr ?? {};
    if (so.pressing === 'high' && front('passing', 'long', 'rywal pressuje wysoko: długie piłki za plecy obrońców')) return;
    if (pinned && st.diff >= 0 && mentality > -1) {
      front('line', 'low', 'rywal przeważa: cofamy się pod własne pole karne');
      front('mentality', String(mentality - 1), 'rywal przeważa: cofamy się pod własne pole karne');
      return;
    }
    if (st.diff === 0 && min >= 25 && min <= 75 && front('tempo', 'slow', 'remis nas urządza: zwalniamy grę')) return;
    if (min <= 75) front('passing', 'long', 'gramy prościej: długie piłki do napastnika');
  }

  function finish() {
    // Szansa reakcji wg osobowości; uparty trener reaguje rzadziej i wcześniej kończy korekty
    const limit = (mind.stubborn ? 2 : MAX_ADJ) - mind.used;
    const out = [];
    for (const c of cands) {
      if (out.length >= 2 || (!advice && out.length >= limit)) break;
      const a = ALERT[T.coach] ?? ALERT.P;
      if (c.kind === 'mistake') { out.push(c); continue; }
      // Trafność: dobry taktyk częściej robi korekty, które w silniku pomagają, i rzadziej te, które szkodzą
      const val = worth(c, plan);
      const p = pAdj(c.kind === 'style' ? a.style : c.kind === 'legs' ? 0.8 : c.kind === 'cards' ? 0.6 : c.kind === 'revert' ? 0.5 : a.flow, val < 0 ? -s : s, COACHQ.alert);
      if (!advice && !rng.chance(mind.stubborn ? p * 0.5 : p)) continue;
      out.push(c);
    }
    // Przegrany środek pola w przerwie: dodatkowy środkowy pomocnik (za darmo w przerwie), gdy zawodnicy pasują
    let formation = null;
    if (st.halftime && st.diff > -2 && fieldPlayers(T).length >= 11 && v && v.poss < 0.42 && v.xgA >= v.xgF && (advice || mind.used + out.length < (mind.stubborn ? 2 : MAX_ADJ))) {
      const target = MID_PLUS[T.tactics.formation];
      const oppCentral = formationById(seen.formation).slots.filter((x) => CENTRAL.has(x.pos)).length;
      if (target && oppCentral > T.central && (advice || rng.chance(pAdj((ALERT[T.coach] ?? ALERT.P).flow, s, COACHQ.alert))) && shapeFit(T, target) >= 0.98 * currentFit(T)) formation = target;
    }
    if (!out.length && !formation) return null;
    const set = Object.fromEntries(out.map((c) => [c.key, c.v]));
    return { set, cands: out, reason: out.map((c) => c.reason).join('; ') || null, formation, formationReason: 'przegrywamy środek pola: dodatkowy środkowy pomocnik' };
  }
}

/**
 * Wartość korekty w silniku (pomiary docs/ai-trener.md i docs/trener-ai-atrybuty.md): +1 pomaga (wysoki pressing,
 * krótkie albo prostsze rozegranie przeciw pressingowi, kontratak, odważniej przy jałowej przewadze, powrót do planu),
 * -1 szkodzi (cofnięcie nastawienia, wolne tempo, długie piłki), 0 bez wyraźnego efektu (linia, krycie, zmęczenie, kartki).
 */
function worth(c, plan) {
  if (c.kind === 'revert') return 1;
  if (c.kind === 'legs' || c.kind === 'cards') return 0;
  const k = c.key; const v = c.v;
  if (k === 'pressing') return v === 'high' ? 1 : 0;
  if (k === 'passing') return v === 'long' ? -1 : 1;
  if (k === 'counter') return v === 'yes' ? 1 : -1;
  if (k === 'mentality') return Number(v) > Number(plan.mentality ?? 0) ? 1 : -1;
  if (k === 'tempo') return v === 'slow' ? -1 : 0;
  return 0;
}

function currentFit(T) { return fieldPlayers(T).reduce((s, x) => s + (x.slot ? slotFit(x, x.slot) : 0), 0); }
/** Suma dopasowania zawodników z boiska do slotów innej formacji (bez zmiany stanu), drop: pozycje puste w osłabieniu. */
function shapeFit(T, fid, drop = []) {
  const xs = fieldPlayers(T);
  const { slots } = shapeSlots(formationById(fid), drop, xs.length);
  let sum = 0;
  for (const [x, i] of assignSlots(xs, slots)) sum += slotFit(x, slots[i]);
  return sum;
}

/** Zapis korekt planu (po wykonaniu zmiany): pamięć dla histerezy i limitu korekt. */
function commitAdj(T, adjust, minute) {
  if (T.adjBase !== T.baseInstr || !T.adj) { T.adj = {}; T.adjBase = T.baseInstr; }
  for (const c of adjust.cands) T.adj[c.key] = { v: c.v, min: minute, kind: c.kind, reason: c.reason };
  if (T.mind) T.mind.used += adjust.cands.length + (adjust.formation ? 1 : 0);
}

// ------------------------------------------------------------ Wybór zawodników
// Zmiany rotacyjne (sparing): zawodnik, który już zszedł, wraca tylko wtedy, gdy na ławce nie ma nikogo innego
const benchPool = (T, reserved) => {
  const xs = T.bench.filter((b) => !b.injury && !b.sentOff && !reserved.has(b));
  return xs.some((b) => b.rolledOff) && xs.some((b) => !b.rolledOff) ? xs.filter((b) => !b.rolledOff) : xs;
};

/**
 * Najlepsze zastępstwo za schodzącego: wprost na jego slot albo z przesunięciem zawodnika z boiska
 * (np. defensywny pomocnik cofa się na środek obrony, a wchodzący pomocnik zajmuje jego miejsce).
 * Bramkarza zastępuje tylko bramkarz; bramkarz rezerwowy nie wchodzi w pole.
 */
export function pickReplacement(T, out, { prefer = null, reserved = new Set(), slot = out?.slot } = {}) {
  if (!slot) return null;
  if (slot.pos === 'BR') {
    const gks = benchPool(T, reserved).filter((b) => b.p.pos === 'BR');
    return gks.length ? { inc: gks.reduce((a, b) => (b.R.GK > a.R.GK ? b : a)), move: null } : null;
  }
  const bench = benchPool(T, reserved).filter((b) => b.p.pos !== 'BR');
  if (!bench.length) return null;
  const bonus = (b) => (prefer?.has(b.p.pos) ? 4 : 0) + condAdj(b);
  const field = fieldPlayers(T).filter((y) => y !== out && y.slot && y.slot.pos !== 'BR' && !reserved.has(y));
  let best = null; let bestV = -Infinity;
  for (const b of bench) {
    const v = slotFit(b, slot) + bonus(b);
    if (v > bestV) { bestV = v; best = { inc: b, move: null }; }
  }
  // Przesunięcia sprawdzamy tylko, gdy na ławce nie ma nikogo z naturalną lub pokrewną pozycją
  if (proficiency(best.inc.p, slot.pos, slot.side) >= 85) return best;
  for (const b of bench) {
    for (const y of field) {
      const mv = slotFit(y, slot) + slotFit(b, y.slot) - slotFit(y, y.slot) + bonus(b) - 0.3;
      if (mv > bestV) { bestV = mv; best = { inc: b, move: y }; }
    }
  }
  return best;
}

/** Zawodnik z pola najmniej potrzebny w tym stanie meczu (np. napastnik przy obronie wyniku). */
export function leastNeeded(T, st, reserved = new Set(), except = null) {
  const xs = fieldPlayers(T).filter((y) => y !== except && y.slot?.pos !== 'BR' && !reserved.has(y));
  if (!xs.length) return null;
  const backs = xs.filter((y) => BACK.has(y.slot.pos)).length;
  const score = (y) => slotFit(y, y.slot) + condAdj(y)
    + (st.diff >= 0 && ATT.has(y.slot.pos) ? -3 : 0)
    + (st.diff < 0 && DEF_ROLE.has(y.slot.pos) && backs > 3 ? -2 : 0)
    + (st.diff < 0 && ATT.has(y.slot.pos) ? 2 : 0)
    + (y.yc ? -1 : 0) + (y.knock && !y.knock.aggravated ? -2 : 0);
  return xs.reduce((a, b) => (score(b) < score(a) ? b : a));
}

function lowest(xs, key) { return xs.length ? xs.reduce((a, b) => (key(b) < key(a) ? b : a)) : null; }

// ------------------------------------------------------------ Plan decyzji
const ADVICE_RNG = { chance: () => true };

/**
 * Plan decyzji trenera bez wykonywania: [{ type: 'sub', outId, inId, moveId, why, text, concussion },
 * { type: 'tactic', patch, reason }]. advice = true: bez losowania i bez punktów kontrolnych (podpowiedź).
 */
function plan(M, side, rng, advice) {
  const T = M.teams[side];
  if (M.ended) return [];
  const st = matchState(M, side);
  const s = tacSkill(T, st);
  const subs = [];
  const tactic = { patch: null, reason: null, urgent: false };
  const reserved = new Set();
  let left = subsAvailable(M, T);
  const addSub = (out, repl, why, text, extra = {}) => {
    reserved.add(out); reserved.add(repl.inc); if (repl.move) reserved.add(repl.move);
    if (!extra.concussion) left--;
    subs.push({ type: 'sub', out, inc: repl.inc, move: repl.move, why, text, ...extra });
  };
  const mergeTactic = (patch, reason, urgent = false) => {
    if (!patch || (!patch.formation && !patch.drop && !Object.keys(patch.instructions ?? {}).length)) return;
    const p = tactic.patch ?? {};
    tactic.patch = { ...p, ...patch, instructions: { ...(p.instructions ?? {}), ...(patch.instructions ?? {}) } };
    if (!Object.keys(tactic.patch.instructions).length) delete tactic.patch.instructions;
    tactic.reason = tactic.reason ?? reason;
    tactic.urgent = tactic.urgent || urgent;
  };

  // 1. Pilne: kontuzje bez możliwości gry, bramkarz z pola w bramce
  for (const x of T.injuredOff) {
    if (x.subbedOff || x.sentOff || reserved.has(x)) continue;
    const conc = isConcussionSub(M, T, x);
    if (!conc && left <= 0) continue;
    const repl = pickReplacement(T, x, { reserved });
    if (repl) addSub(x, repl, conc ? 'concussion' : 'injury', conc ? 'zmiana po wstrząśnieniu mózgu' : 'kontuzja', { concussion: conc });
  }
  const keeper = goalkeeper(T);
  if (keeper && keeper.p.pos !== 'BR' && left > 0) {
    const gk = benchPool(T, reserved).filter((b) => b.p.pos === 'BR').sort((a, b) => b.R.GK - a.R.GK)[0];
    const injGk = T.injuredGk && !T.injuredGk.subbedOff ? T.injuredGk : null;
    if (gk) {
      const out = injGk ?? leastNeeded(T, st, reserved, keeper);
      if (out) addSub(out, { inc: gk, move: null }, 'gk', injGk ? 'kontuzja bramkarza' : 'rezerwowy bramkarz do bramki');
    } else if (injGk) {
      const repl = pickReplacement(T, injGk, { reserved, slot: keeper.prevSlot ?? injGk.slot });
      if (repl && repl.inc.p.pos !== 'BR') addSub(injGk, { inc: repl.inc, move: null }, 'injury', 'kontuzja bramkarza, w bramce zawodnik z pola');
    }
  }

  // 1b. Lekkie urazy (gra z bólem): ryzykowny uraz (naciągnięcie, skręcenie) albo kilku kulejących naraz,
  // trener zmienia od razu; pojedyncze stłuczenie czeka na przerwę lub punkt kontrolny (planSubs)
  if (left > 0) knockSubs(M, T, st, rng, advice, { reserved, addSub, left: () => left });

  // 2. Reakcje na czerwone kartki i osłabienie po kontuzji
  const reacts = T.react.filter((r) => !(T.lastUserTick >= r.tick));
  const ownRed = reacts.find((r) => r.kind === 'ownRed');
  const injShort = reacts.find((r) => r.kind === 'injury' && !r.gk);
  const oppRed = reacts.find((r) => r.kind === 'oppRed');
  const menAfter = fieldPlayers(T).length + subs.filter((s) => !s.out.on).length;
  if ((ownRed || injShort) && menAfter < 11 && rng.chance(pAdj(0.95, s, COACHQ.act))) {
    // Za wykluczonego obrońcę: napastnik schodzi, wchodzi obrońca (gdy prowadzimy lub remis i jest zapas zmian)
    if (ownRed && !ownRed.gk && BACK.has(ownRed.pos) && st.minute < 85 && (st.diff >= 0 || (ownRed.pos === 'ŚO' && st.minute < 70))
      && left > (st.minute < 75 ? 1 : 0)) {
      const atk = fieldPlayers(T).filter((y) => ATT.has(y.slot?.pos) && !reserved.has(y));
      const def = benchPool(T, reserved).filter((b) => BACK.has(b.p.pos)).sort((a, b) => (b.p.pos === ownRed.pos) - (a.p.pos === ownRed.pos) || b.p.ovr - a.p.ovr)[0];
      if (atk.length >= 2 && def) {
        const out = lowest(atk, (y) => slotFit(y, y.slot) + condAdj(y));
        addSub(out, { inc: def, move: null }, 'redReshape', 'reorganizacja po czerwonej kartce');
      }
    }
    const k = 11 - menAfter;
    const sh = shortShape(T, { ...st, men: st.men }, k);
    const d = desiredInstructions(T, { ...st, men: Math.min(st.men, -1) });
    mergeTactic({ formation: sh.formation, drop: sh.drop, instructions: instrPatch(T, d.w) },
      ownRed ? `czerwona kartka: gra w ${menAfter}` : `kontuzja bez zmiany: gra w ${menAfter}`, true);
  }
  if (oppRed && rng.chance(pAdj(0.8, s, COACHQ.act))) {
    const d = desiredInstructions(T, st);
    mergeTactic({ instructions: instrPatch(T, d.w) }, d.reason ?? 'rywal w osłabieniu', true);
  }

  // 3. Punkty kontrolne i przeglądy planu: instrukcje (wynik, przebieg meczu, rywal), zmiany taktyczne, rotacja
  const addedCheck = M.half % 2 === 0 && M.elapsed === M.length + 1;
  const goalReact = reacts.some((r) => r.kind === 'goal') && st.minute >= 60;
  const checkpoint = advice || st.atBreak || (CHECKPOINTS.has(M.minute) && M.elapsed <= M.length) || addedCheck;
  const review = checkpoint || (reviewPoint(M) && M.elapsed <= M.length);
  if (review || goalReact) {
    // Bez nerwowego przestawiania: korekty z przebiegu meczu najwcześniej 10 min po poprzedniej zmianie (koszt x2)
    const calm = advice || st.atBreak || M.minute - T.lastTacChange >= 10;
    const adjust = review && calm ? reviewAdjust(M, T, st, rng, advice, mindOf(T, rng, advice)) : null;
    const d = desiredInstructions(T, st, adjust?.set);
    const patch = instrPatch(T, d.w);
    if (patch.timewasting === 'on' && !rng.chance(T.coach === 'O' ? 0.3 : 0.6)) delete patch.timewasting;
    const fromAdj = !!adjust && Object.keys(patch).some((k) => k in adjust.set && d.w[k] === adjust.set[k]);
    if (Object.keys(patch).length && calm && (fromAdj || rng.chance(pAdj(0.75, s, COACHQ.act)))) {
      if (fromAdj && !advice) commitAdj(T, adjust, M.minute);
      const why = fromAdj && d.reason ? `${d.reason}; ${adjust.reason}` : fromAdj ? adjust.reason : d.reason;
      mergeTactic({ instructions: patch }, why ?? 'powrót do planu');
    }
    if (adjust?.formation && fieldPlayers(T).length >= 11 && !tactic.patch?.formation) {
      if (!advice && !fromAdj) commitAdj(T, { cands: [], formation: adjust.formation }, M.minute);
      mergeTactic({ formation: adjust.formation }, adjust.formationReason);
      if (tactic.reason !== adjust.formationReason) tactic.reason = `${tactic.reason}; ${adjust.formationReason}`;
    }
    // Warianty 4-4-2 bez zmian personalnych: gonimy -> ofensywne, bronimy -> defensywne
    if (!tactic.patch?.formation && (advice || st.atBreak || M.minute - T.lastTacChange >= 10)) {
      const v = variant442(T, st);
      if (v && (advice || rng.chance(pAdj(T.mind?.stubborn ? 0.4 : 0.75, s, COACHQ.act)))) mergeTactic({ formation: v.formation }, v.reason);
    }
    // W osłabieniu kształt dopasowany do wyniku (np. 4-4-1 -> 4-3-2 przy pogoni)
    if (fieldPlayers(T).length < 11 && !tactic.patch?.formation) {
      const sh = shortShape(T, st);
      if (sh && (sh.formation !== T.tactics.formation || sh.drop.join() !== (T.dropPos ?? []).join())
        && (advice || st.atBreak || M.minute - T.lastTacChange >= 10) && rng.chance(pAdj(0.6, s, COACHQ.act))) {
        mergeTactic({ formation: sh.formation, drop: sh.drop }, st.diff < 0 ? 'w osłabieniu, ale gonimy wynik' : 'w osłabieniu bronimy się');
      }
    }
  }
  if (checkpoint && left > 0) {
    const sctx = { reserved, addSub, mergeTactic, left: () => left };
    if (st.friendly) friendlySubs(M, T, st, rng, advice, sctx);
    else planSubs(M, T, st, rng, advice, sctx);
  }

  const out = [...subs.map((s) => ({
    type: 'sub', outId: s.out.id, inId: s.inc.id, moveId: s.move?.id ?? null, why: s.why, text: s.text, concussion: !!s.concussion,
    outName: s.out.p.name, inName: s.inc.p.name, outPos: s.out.slot?.pos ?? null, inPos: s.inc.p.pos,
  }))];
  if (tactic.patch) out.push({ type: 'tactic', patch: tactic.patch, reason: tactic.reason, urgent: tactic.urgent });
  return out;
}

/**
 * Zmiany za zawodników grających z bólem poza punktami kontrolnymi (zaraz po urazie albo w kolejnym przeglądzie).
 * Ryzyko pogłębienia rośnie z typem urazu (KNOCK.types[].agg), więc naciągnięcie i skręcenie trener zmienia zwykle
 * od razu, stłuczenie zostawia do przerwy, chyba że kulejących jest kilku (kara drużyny) [SZAC].
 * Przed 70. minutą jedna zmiana zostaje w zapasie, chyba że uraz jest ryzykowny. W ostatnich minutach gra dalej.
 */
function knockSubs(M, T, st, rng, advice, ctx) {
  const { reserved } = ctx;
  const xs = fieldPlayers(T).filter((x) => x.knock && !x.knock.aggravated && x.slot && !reserved.has(x));
  if (!xs.length) return;
  const risk = (x) => KNOCK.types[x.knock.type]?.agg ?? 0;
  xs.sort((a, b) => risk(b) - risk(a));
  const several = xs.length >= 2;
  const late = !st.et && st.minute >= 86;
  const reserve = !st.atBreak && st.minute < 70 ? 1 : 0;
  let made = 0;
  for (const x of xs) {
    if (ctx.left() <= 0 || late) break;
    const risky = risk(x) >= 0.002 || st.friendly; // w sparingu nikt nie gra z bólem
    if (x.slot.pos === 'BR' && !T.bench.some((b) => b.p.pos === 'BR' && !b.injury && !b.sentOff)) continue;
    if (!risky && !(several && made === 0)) continue;
    if (!risky && ctx.left() - reserve <= 0) continue;
    if (!advice && !rng.chance(pAdj(risky ? 0.85 : 0.6, tacSkill(T, st), COACHQ.subs))) continue;
    const repl = pickReplacement(T, x, { reserved });
    if (!repl) continue;
    ctx.addSub(x, repl, 'injury', `uraz: ${x.knock.name}${several ? ', kilku zawodników gra z bólem' : ''}`);
    made++;
  }
}

/** Zmiany w punkcie kontrolnym: urazy z bólem, zmęczenie, kartki, taktyka wg wyniku, rotacja; grupowanie w oknach. */
function planSubs(M, T, st, rng, advice, ctx) {
  const min = st.minute;
  const atBreak = st.atBreak;
  const openWindow = !atBreak && T.windowMinute !== M.tick;
  const windowsLeft = T.windowsLimit - T.windowsUsed;
  const { reserved } = ctx;
  const xs = fieldPlayers(T).filter((x) => !reserved.has(x) && x.slot);
  const cands = [];
  // Dobry taktyk wcześniej widzi zmęczenie (próg kondycji + 4 s), słaby zmienia zmęczonych później
  const tiredThr = 70 + (st.heat ? 4 : 0) + (min >= 75 ? 3 : 0) + COACHQ.tired * tacSkill(T, st);
  const hot = (x) => x.yc && DEF_ROLE.has(x.slot.pos) && (attr(x, 'AGR') >= 13 || (x.p.hidden?.TMP ?? 10) >= 14);
  for (const x of xs) {
    if (x.slot.pos === 'BR') {
      if (((x.knock && !x.knock.aggravated) || x.injury?.playable) && x.p.pos === 'BR' && (atBreak || min >= 46)) cands.push({ x, why: 'injury', text: 'uraz bramkarza', prio: 0.85, p: 0.5 });
      continue;
    }
    const hurt = (x.knock && !x.knock.aggravated) || x.injury?.playable;
    if (hurt && (atBreak || min >= 46)) cands.push({ x, why: 'injury', text: x.knock ? `uraz: ${x.knock.name}` : 'uraz', prio: 0.9, p: x.knock?.type === 'contusion' ? 0.55 : 0.8 });
    else if (x.cond < tiredThr && (min >= 55 || st.et)) cands.push({ x, why: 'tired', text: 'zmęczenie', prio: 0.6 + (tiredThr - x.cond) / 30, p: 0.8 });
    else if (hot(x) && (min >= 55 || st.halftime) && !x.bookChecked) {
      if (!advice) x.bookChecked = true; // trener ocenia ryzyko raz (w przerwie albo po 55. minucie)
      cands.push({ x, why: 'booked', text: 'zagrożony drugą żółtą kartką', prio: 0.55, p: atBreak ? 0.35 : 0.5 });
    }
    else if (x.ev < -0.8 && (min >= 60 || st.halftime)) cands.push({ x, why: 'form', text: 'słaba gra', prio: 0.4, p: atBreak ? 0.3 : 0.4 });
  }
  const taken = new Set(cands.map((c) => c.x));
  const full = fieldPlayers(T).length >= 11;
  // Pogoń za wynikiem: defensywny gracz schodzi, wchodzi napastnik (lub przewaga liczebna przy remisie)
  const chasing = st.diff < 0 || (st.diff === 0 && st.men > 0 && min >= 55 && !st.ko);
  if (chasing && (T.chaseSubs ?? 0) < (st.diff <= -2 ? 3 : 2) && (min >= chaseAt(T, st.diff <= -2 ? 60 : 65) || (st.halftime && st.diff <= -2))) {
    const backs = xs.filter((y) => y.slot.pos === 'ŚO').length;
    const allOut = st.diff <= -2 || min >= 78 || st.et;
    const f = T.tactics.formation;
    const kind = allOut && min >= 75 && full ? 'attack2' : 'attack1';
    const target = full ? (kind === 'attack2' ? ATTACK2 : ATTACK1)[f] : null;
    let pool;
    if (target && target !== f) {
      // Nowe ustawienie ma więcej miejsc w ataku: schodzi defensywny gracz
      pool = xs.filter((y) => !taken.has(y) && (['DP', 'ŚP'].includes(y.slot.pos) || (y.slot.pos === 'ŚO' && backs >= 3) || (y.slot.pos === 'BO' && min >= 80)));
    } else {
      // Ustawienie już ofensywne: świeży napastnik za zmęczonego lub słabego zawodnika z przodu
      pool = xs.filter((y) => !taken.has(y) && ATT.has(y.slot.pos));
    }
    const order = { DP: 0, ŚO: 1, BO: 2, ŚP: 3 };
    const sorted = pool.sort((a, b) => ((order[a.slot.pos] ?? 4) - (order[b.slot.pos] ?? 4)) || (slotFit(a, a.slot) + condAdj(a)) - (slotFit(b, b.slot) + condAdj(b)));
    sorted.slice(0, allOut && min >= 70 ? 2 : 1).forEach((x, i) => {
      cands.push({ x, why: 'chase', text: target && target !== f ? 'ofensywna zmiana' : 'świeży zawodnik w ataku', prio: 1 - 0.1 * i, p: i ? 0.5 : st.diff <= -2 ? 0.85 : 0.65, prefer: ATT, shape: target && target !== f ? kind : null });
      taken.add(x);
    });
  }
  // Obrona wyniku: napastnik lub skrzydłowy schodzi, wchodzi obrońca lub defensywny pomocnik
  if (st.diff > 0 && (T.protectSubs ?? 0) < 2 && min >= protectAt(T, st.diff >= 2 ? 70 : 75)) {
    const x = lowest(xs.filter((y) => ATT.has(y.slot.pos) && !taken.has(y)), (y) => y.cond + 10 * y.ev);
    if (x) {
      cands.push({ x, why: 'protect', text: 'wzmocnienie obrony', prio: 0.9, p: st.diff === 1 ? 0.6 : 0.35, prefer: new Set(['DP', 'ŚO', 'BO', 'WB']), shape: st.diff === 1 && min >= 80 ? 'defend' : null });
      taken.add(x);
    }
  }
  // Doliczony czas przy prowadzeniu: zmiana na czas (zawodnik schodzi powoli)
  if (st.diff > 0 && st.added) {
    const x = lowest(xs.filter((y) => ATT.has(y.slot.pos) && !taken.has(y)), (y) => y.cond);
    if (x) { cands.push({ x, why: 'timewasting', text: 'gra na czas', prio: 0.5, p: 0.5 }); taken.add(x); }
  }
  // Bramkarz od rzutów karnych tuż przed serią
  const pgk = penaltyKeeperCand(M, T, st, reserved);
  if (pgk) cands.push(pgk);
  // Rotacja wg planu trenera (3-5 zmian w meczu, średnio ok. 4)
  const rotation = { 60: 0.65, 65: 0.45, 70: 0.6, 75: 0.55, 80: 0.6, 85: 0.6, 88: 0.5, 95: 0.4, 105: 0.6 }[min];
  const planned = T.plannedSubs ?? 4;
  if (!advice && rotation && !atBreak && T.subsUsed + cands.length < planned && rng.chance(rotation)) {
    const windowsLeftNow = Math.max(1, windowsLeft);
    const need = Math.min(2, Math.ceil((planned - T.subsUsed - cands.length) / windowsLeftNow));
    xs.filter((y) => y.slot.pos !== 'BR' && !taken.has(y)).sort((a, b) => (a.cond + a.ev * 10) - (b.cond + b.ev * 10)).slice(0, need)
      .forEach((x) => { cands.push({ x, why: 'rotation', text: 'zmiana taktyczna', prio: 0.3, p: 1 }); taken.add(x); });
  }
  if (!cands.length) return;
  cands.sort((a, b) => b.prio - a.prio);
  // Zapas na kontuzję: przed 80. minutą zostaje jedna zmiana; ostatniego okna nie otwieramy bez pilnej potrzeby
  const urgent = cands.some((c) => c.prio >= 0.9);
  if (!advice && openWindow && windowsLeft <= 1 && min < 80 && !st.et && !urgent) return;
  const keep = !advice && !atBreak && !st.et && min < 80 && !(openWindow && windowsLeft <= 1) ? 1 : 0;
  const maxNow = Math.min(3, ctx.left() - keep);
  if (maxNow <= 0) return;
  let made = 0;
  const shapes = [];
  const s = tacSkill(T, st);
  for (const c of cands) {
    if (made >= maxNow) break;
    // Plan trenera (3-5 zmian) obejmuje też zmiany taktyczne; ponad plan tylko uraz, bramkarz i pogoń przy -2
    const cap = planned + (c.why === 'injury' || c.why === 'penaltyGk' ? 2 : c.why === 'chase' && st.diff <= -2 ? 1 : 0);
    if (!advice && T.subsUsed + made >= cap) continue;
    if (!rng.chance(c.p < 1 ? pAdj(c.p, s, COACHQ.subs) : c.p)) continue;
    const repl = pickReplacement(T, c.x, { prefer: c.prefer, reserved });
    if (!repl) continue;
    if (c.prefer && !c.prefer.has(repl.inc.p.pos) && c.why !== 'protect') continue; // brak napastnika na ławce: bez zmiany
    ctx.addSub(c.x, repl, c.why, c.text);
    made++;
    if (c.shape) shapes.push([c.shape, repl.inc]);
  }
  // Grupowanie: skoro okno i tak się otwiera, dokładamy zaplanowane zmiany (podwójna lub potrójna zmiana)
  if (!advice && made && openWindow && min >= 60) {
    const extra = xs.filter((y) => y.slot.pos !== 'BR' && !reserved.has(y)).sort((a, b) => (a.cond + a.ev * 10) - (b.cond + b.ev * 10));
    for (const x of extra) {
      if (made >= maxNow || T.subsUsed + made >= planned) break;
      const repl = pickReplacement(T, x, { reserved });
      if (!repl) break;
      ctx.addSub(x, repl, 'rotation', 'zmiana taktyczna');
      made++;
    }
  }
  if (shapes.length && full) {
    const [kind, inc] = shapes[0];
    const f = T.tactics.formation;
    const target = kind === 'attack2' ? ATTACK2[f] : kind === 'attack1' ? ATTACK1[f]
      : BACK.has(inc.p.pos) ? '541' : DEFEND_MID[f];
    if (target && target !== f) ctx.mergeTactic({ formation: target }, kind === 'defend' ? 'zamykamy wynik' : 'więcej napastników');
  } else if (shapes.length && !full) {
    const sh = shortShape(T, st);
    if (sh) ctx.mergeTactic({ formation: sh.formation, drop: sh.drop }, 'zmiana ustawienia w osłabieniu');
  }
}

/**
 * Bramkarz od rzutów karnych tuż przed serią (119-120' dogrywki; przy umówionej serii bez dogrywki w doliczonym
 * czasie 2. połowy): rezerwowy ma średnio o 1,5 lepsze REF i JNJ [SZAC]. Kandydat do zmiany albo null.
 */
function penaltyKeeperCand(M, T, st, reserved) {
  const due = (st.ko && st.et && M.half === 4 && st.minute >= 119) || (st.pens && M.half === 2 && st.added);
  if (!due || st.diff !== 0) return null;
  const gk = goalkeeper(T);
  const spec = benchPool(T, reserved).filter((b) => b.p.pos === 'BR').sort((a, b) => (attr(b, 'REF') + attr(b, 'JNJ')) - (attr(a, 'REF') + attr(a, 'JNJ')))[0];
  if (gk && spec && (attr(spec, 'REF') + attr(spec, 'JNJ')) / 2 >= (attr(gk, 'REF') + attr(gk, 'JNJ')) / 2 + 1.5) {
    return { x: gk, why: 'penaltyGk', text: 'bramkarz od rzutów karnych', prio: 2, p: 0.7 };
  }
  return null;
}

// ------------------------------------------------------------ Sparing (docs/sparingi-i-karne.md)
// Plan rotacji [SZAC]: szansa na „dwie jedenastki” wg okresu (wcześnie latem najczęściej), liczba zmian w przerwie
// przy rotacji stopniowej, szansa zmiany bramkarza w przerwie, minuta, od której wchodzą pozostali rezerwowi.
export const FRIENDLY_AI = {
  twoXi: { lato: 0.6, zima: 0.45, fifa: 0.3, other: 0.45 }, twoXiBench: 8,
  htStaggered: [4, 7], htStandard: 3, gkHt: { two_xi: 0.85, staggered: 0.6 },
  starterOut: { 60: 0.5, 65: 0.4, 70: 0.6, 75: 0.85 }, keepOn: 1, // do 75' schodzą prawie wszyscy z wyjściowej jedenastki
  restFrom: 70, restP: 0.7, tired: 72, debtHigh: 20,
};

/**
 * Plan rotacji drużyny w sparingu, raz na mecz: two_xi (dwie jedenastki: wymiana w przerwie), staggered (część
 * w przerwie, reszta 60-75'), match (jak w meczu o punkty). Asystent gracza bierze M.rules.rotation, AI wybiera sam
 * ('auto'): wg reguły zmian, okresu (M.rules.period) i liczby rezerwowych. Podpowiedź (advice) bez losowania.
 */
function friendlyPlan(M, T, rng, advice) {
  if (T.fplan) return T.fplan;
  let kind = T.ai && !T.assistant ? 'auto' : M.rules.rotation;
  const benchN = T.bench.filter((b) => !b.injury && !b.sentOff && b.p.pos !== 'BR').length;
  if (kind === 'two_xi' && !unlimitedSubs(M)) kind = 'staggered'; // przy 5 zmianach dwóch jedenastek nie ma
  if (kind === 'auto') {
    const pTwo = FRIENDLY_AI.twoXi[M.rules.period] ?? FRIENDLY_AI.twoXi.other;
    const two = unlimitedSubs(M) && benchN >= FRIENDLY_AI.twoXiBench && (advice ? true : rng.chance(pTwo));
    kind = two ? 'two_xi' : 'staggered';
  }
  const [lo, hi] = FRIENDLY_AI.htStaggered;
  const ht = kind === 'two_xi' ? 10 : kind === 'staggered' ? (unlimitedSubs(M) ? (advice ? Math.round((lo + hi) / 2) : rng.int(lo, hi)) : FRIENDLY_AI.htStandard) : 0;
  const plan = { kind, ht };
  if (!advice) T.fplan = plan;
  return plan;
}

/**
 * Kogo trener sparingu oszczędza najpierw: dług meczowy (p.matchDebt), niska świeżość, brak ostrości po urazie
 * (p.sharp), wiek 31+, zawodnik z wyjściowej jedenastki (minuty), żółta kartka bez znaczenia. Wyżej = schodzi wcześniej.
 */
function protectScore(x, M) {
  const p = x.p;
  return (p.matchDebt ?? 0) / 10 + Math.max(0, 80 - x.cond) / 8 + Math.max(0, 60 - (p.sharp ?? 70)) / 10
    + ((p.age ?? 25) >= 31 ? 1 : 0) + (M.minute - (x.minOn ?? M.minute)) / 45 + (x.knock && !x.knock.aggravated ? 3 : 0) + 0.05 * (p.ovr ?? 10);
}

/**
 * Zmiany w sparingu: w przerwie masowa wymiana (dwie jedenastki: cała jedenastka, rotacja stopniowa: 4-7 zawodników,
 * często bramkarz), po przerwie schodzą pozostali z wyjściowego składu (60-75'), zmęczeni i z długiem meczowym,
 * a od 70' minuty dostają rezerwowi, którzy jeszcze nie grali (młodzież). Limity zmian i okien jak w regułach meczu.
 */
function friendlySubs(M, T, st, rng, advice, ctx) {
  const plan = friendlyPlan(M, T, rng, advice);
  if (plan.kind === 'match') { planSubs(M, T, st, rng, advice, ctx); return; }
  const { reserved } = ctx;
  const min = st.minute;
  const xs = fieldPlayers(T).filter((x) => !reserved.has(x) && x.slot && x.slot.pos !== 'BR');
  const byProtect = (a, b) => protectScore(b, M) - protectScore(a, M);
  const outs = [];
  const take = (x, why, text) => { outs.push({ x, why, text }); };
  if (st.halftime) {
    const n = Math.min(plan.ht, Math.max(0, ctx.left() - (unlimitedSubs(M) ? 0 : 2)));
    xs.slice().sort(byProtect).slice(0, n).forEach((x) => take(x, 'rotation', plan.kind === 'two_xi' ? 'druga jedenastka' : 'rotacja w przerwie'));
    const gk = goalkeeper(T);
    const p = FRIENDLY_AI.gkHt[plan.kind] ?? 0;
    if (gk && gk.p.pos === 'BR' && !reserved.has(gk) && benchPool(T, reserved).some((b) => b.p.pos === 'BR') && outs.length < ctx.left() && rng.chance(p)) {
      take(gk, 'rotation', 'zmiana bramkarza w przerwie');
    }
  } else {
    const pgk = penaltyKeeperCand(M, T, st, reserved);
    if (pgk) take(pgk.x, pgk.why, pgk.text);
    // Zmęczeni i z wysokim długiem meczowym schodzą bez względu na plan
    for (const x of xs) {
      if (x.cond < FRIENDLY_AI.tired || ((x.p.matchDebt ?? 0) >= FRIENDLY_AI.debtHigh && min >= 55)) take(x, 'tired', 'oszczędzamy zawodnika');
    }
    // Pozostali z wyjściowej jedenastki (rotacja stopniowa) schodzą między 60. a 75. minutą
    const pOut = FRIENDLY_AI.starterOut[min];
    if (pOut && plan.kind === 'staggered') {
      const starters = xs.filter((x) => x.minOn === 0 && !x.prevMins && !outs.some((o) => o.x === x)).sort(byProtect);
      const n = min >= 75 ? Math.max(0, starters.length - FRIENDLY_AI.keepOn) : Math.round(starters.length * pOut);
      starters.slice(0, n).forEach((x) => take(x, 'rotation', 'zmiana zaplanowana'));
    }
    // Minuty dla rezerwowych, którzy jeszcze nie grali (często młodzież)
    if (min >= FRIENDLY_AI.restFrom && CHECK_REST.has(min)) {
      const fresh = benchPool(T, reserved).filter((b) => b.p.pos !== 'BR' && b.minOn === null).length;
      const left = xs.filter((x) => !outs.some((o) => o.x === x)).sort(byProtect);
      for (let i = 0; i < Math.min(fresh - outs.length, left.length); i++) if (rng.chance(FRIENDLY_AI.restP)) take(left[i], 'rotation', 'minuty dla rezerwowych');
    }
  }
  let made = 0;
  for (const o of outs) {
    if (ctx.left() <= 0) break;
    if (reserved.has(o.x)) continue; // już przesunięty na inną pozycję przy wcześniejszej zmianie
    if (!unlimitedSubs(M) && !st.atBreak && made >= 3) break;
    const repl = pickReplacement(T, o.x, { reserved });
    if (!repl) continue;
    ctx.addSub(o.x, repl, o.why, o.text);
    made++;
  }
}
const CHECK_REST = new Set([70, 75, 80, 85]);

// ------------------------------------------------------------ Wykonanie
function execute(M, side, actions, by) {
  const T = M.teams[side];
  let shuffle = false;
  for (const a of actions) {
    if (a.type !== 'sub') continue;
    const r = substitute(M, side, a.outId, a.inId, a.text, { by, why: a.why, moveId: a.moveId, concussion: a.concussion || undefined });
    if (r.ok && (a.moveId || ['chase', 'protect', 'redReshape', 'gk'].includes(a.why))) shuffle = true;
    if (r.ok && a.why === 'chase') T.chaseSubs = (T.chaseSubs ?? 0) + 1;
    if (r.ok && a.why === 'protect') T.protectSubs = (T.protectSubs ?? 0) + 1;
  }
  const t = actions.find((a) => a.type === 'tactic');
  if (t) changeTactics(M, side, t.patch, { by, reason: t.reason });
  else if ((shuffle || (T.dropIdx.length && fieldPlayers(T).length >= 11)) && by !== 'user') reslot(T); // przestawienie bez kosztu
}

/**
 * Okrzyk z linii bocznej (te same okrzyki, limity i przerwy co u gracza): po golu, w pogoni, przy obronie
 * prowadzenia pod presją, w słabszym momencie po przerwie [SZAC].
 */
function aiShout(M, T, st, rng) {
  if (T.coachBanned || M.phase !== 'play') return;
  const scored = M.score[T.side] > (T.seenGoals ?? 0);
  T.seenGoals = M.score[T.side];
  const ok = (id) => !canShout(M, T.side, id);
  let id = null; let p = 0;
  if (scored && ok('brawo')) { id = 'brawo'; p = 0.35; }
  else if (st.diff < 0 && st.minute >= 75 && ok('naprzod')) { id = 'naprzod'; p = T.coach === 'S' ? 0.2 : 0.3; }
  else if (st.diff === 1 && st.minute >= 80 && st.mom < -0.1 && ok('uwaga')) { id = 'uwaga'; p = T.coach === 'O' ? 0.3 : 0.5; }
  else if (st.diff < 0 && st.minute >= 50 && st.minute < 75 && st.mom < -0.1 && ok('walka')) { id = 'walka'; p = 0.2; }
  if (id && rng.chance(pAdj(p, cqOf(T).mot, COACHQ.shoutP))) shout(M, T.side, id);
}

/** Decyzje AI (rywal albo asystent gracza) w danej minucie. Zmienia tylko swoją drużynę i tylko zgodnie z regułami. */
export function aiDecide(M, side) {
  const T = M.teams[side];
  // Szybkie wyjście: trener myśli tylko w punktach kontrolnych i przeglądach planu, w przerwie
  // i po zdarzeniach (kartka, gol, uraz)
  const busy = T.react.length || T.injuredOff.length || M.phase === 'break'
    || (CHECKPOINTS.has(M.minute) && M.elapsed <= M.length) || (M.half % 2 === 0 && M.elapsed === M.length + 1)
    || (M.elapsed <= M.length && reviewPoint(M)) || goalkeeper(T)?.p.pos !== 'BR';
  if (!busy) return;
  const actions = plan(M, side, M.rng, false);
  if (actions.length) execute(M, side, actions, T.assistant ? 'assistant' : 'ai');
  if (!M.ended) aiShout(M, T, matchState(M, side), M.rng);
  T.react.length = 0;
  if (T.injuredOff.length) T.injuredOff = T.injuredOff.filter((x) => !x.subbedOff);
}

/**
 * Podpowiedź asystenta dla gracza (np. po czerwonej kartce lub kontuzji): lista działań bez wykonywania
 * i bez losowania. Każde działanie można wykonać przez applySuggestion.
 */
export function assistantSuggest(M, side) {
  return plan(M, side, ADVICE_RNG, true);
}

/** Wykonuje działanie z assistantSuggest (zmiana albo taktyka) jako decyzję gracza. */
export function applySuggestion(M, side, action) {
  if (action.type === 'sub') {
    return substitute(M, side, action.outId, action.inId, action.text, { by: 'user', why: action.why, moveId: action.moveId, concussion: action.concussion || undefined });
  }
  if (action.type === 'tactic') { changeTactics(M, side, action.patch, { by: 'user', reason: action.reason }); return { ok: true }; }
  return { ok: false, error: 'Nieznane działanie.' };
}

/** Hak silnika: bramkarz AI wykluczony lub kontuzjowany; rezerwowy bramkarz od razu, jeśli pozwalają limity. */
function onGoalkeeperLost(M, T, cause) {
  if (!subsAvailable(M, T)) return false;
  const gk = T.bench.filter((b) => b.p.pos === 'BR' && !b.injury && !b.sentOff).sort((a, b) => b.R.GK - a.R.GK)[0];
  if (!gk) return false;
  const st = matchState(M, T.side);
  const out = cause === 'injury' && T.injuredGk && !T.injuredGk.subbedOff ? T.injuredGk : leastNeeded(T, st);
  if (!out) return false;
  const text = cause === 'injury' ? 'kontuzja bramkarza' : 'rezerwowy bramkarz za wykluczonego';
  return substitute(M, T.side, out.id, gk.id, text, { by: T.assistant ? 'assistant' : 'ai', why: 'gk' }).ok;
}

setCoachHooks({ onGoalkeeperLost });
