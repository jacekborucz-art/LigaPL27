// Trening klubów AI dzień po dniu (docs/trening-ai.md). Kluby AI realizują plan asystenta (plan.js, autoDay)
// dla własnego terminarza, z akcentem tygodnia według typu trenera, i dostają skutki zajęć z tych samych wzorów
// co klub gracza (sessions.js): zmęczenie i regeneracja, ostrość, morale, urazy treningowe, bodziec rozwojowy,
// stałe fragmenty, zgranie formacji, obóz przygotowawczy. Różnice wobec klubu gracza (świadome uproszczenia):
//  - obciążenie bez dziennika 28 dni: średnie wykładnicze 7 i 28 dni (ten sam ACWR, mniej danych w zapisie),
//  - „ciężkie nogi” jedną liczbą na klub (wszyscy robią te same zajęcia),
//  - bodziec rozwojowy: rozkład na atrybuty na klub, udział zawodnika w zajęciach osobno (p.aiTr),
//  - program powrotu po dłuższym urazie jak automatyczny program gracza (ryzyko x0,7, ostrość +2), bez obniżania
//    intensywności; bez programu dla młodych (narzędzie gracza).
// Koszt: ok. 1300 zawodników x kilka działań na liczbach dziennie.

import { Rng, clamp } from '../core/rng.js';
import { addDays } from '../core/gameLoop.js';
import { applyMorale } from '../career/morale.js';
import { clubById } from '../data/clubs_pl.js';
import { squadOf } from '../world/worldGen.js';
import { SESSIONS, INTENSITY, GK_SESSION, GK_JOIN, LOAD, CAMP, staffMul, AI_PLAN } from './config.js';
import { staffQ } from './staff.js';
import { dayContext, autoDay } from './plan.js';
import { campWindow, halfOf, halfKey, baseFactor, aiCampChoice } from './camps.js';
import { aiSessionToClub } from './cohesion.js';
import { fatigueMul, regenMul, trainingInjuryChance, overloadTerm } from './load.js';
import { rollTrainingInjury } from './sessions.js';
import { offsetsFor } from './development.js';

const r2 = (v) => Math.round(v * 100) / 100;
/** Liczba z cyfr napisu (bez tworzenia podnapisów). */
function digits(str, from, to) {
  let v = 0;
  for (let i = from; i < to; i++) v = v * 10 + (str.charCodeAt(i) - 48);
  return v;
}
const r3 = (v) => Math.round(v * 1000) / 1000;

const planCache = new Map();
/** Akcent i poziom obciążeń planu klubu AI (typ trenera z danych klubu). */
export function aiPlanFor(clubId) {
  const coach = clubById(clubId)?.coach ?? 'P';
  return { clubId, accent: AI_PLAN.accent[coach] ?? 'zrownowazony', load: AI_PLAN.load };
}

/** Daty meczów klubów ze stałą kadrą (jeden przebieg po terminarzu na dzień): clubId -> { all, official, friendly }. */
const setsCache = new WeakMap();
const uniqSorted = (xs) => {
  xs.sort();
  let n = 0;
  for (let i = 0; i < xs.length; i++) if (!n || xs[i] !== xs[n - 1]) xs[n++] = xs[i];
  xs.length = n;
  return xs;
};
/** Suma kontrolna dat terminarza (przełożone mecze zmieniają datę bez zmiany długości listy). */
function datesSig(fx) {
  let h = fx.length;
  for (let i = 0; i < fx.length; i++) {
    const d = fx[i].date;
    if (d) h = (h * 31 + d.charCodeAt(3) * 1000 + d.charCodeAt(6) * 100 + d.charCodeAt(8) * 10 + d.charCodeAt(9)) | 0;
  }
  return h;
}
export function allClubSets(game) {
  const fx = game.fixtures || [];
  const hit = setsCache.get(fx);
  const sig = datesSig(fx);
  if (hit && hit.sig === sig && hit.n === fx.length && hit.world === game.world) return hit.map;
  const raw = new Map();
  for (const id of Object.keys(game.world.clubs)) raw.set(id, { all: [], off: [] });
  for (const f of fx) {
    if (!f.date) continue;
    const h = raw.get(f.home); const a = raw.get(f.away);
    if (!h && !a) continue;
    const official = f.comp !== 'friendly';
    if (h) { h.all.push(f.date); if (official) h.off.push(f.date); }
    if (a) { a.all.push(f.date); if (official) a.off.push(f.date); }
  }
  const map = new Map();
  for (const [id, r] of raw) {
    const all = uniqSorted(r.all);
    const official = uniqSorted(r.off);
    const friendly = new Set();
    if (official.length < all.length) { const off = new Set(official); for (const d of all) if (!off.has(d)) friendly.add(d); }
    map.set(id, { all, official, friendly });
  }
  setsCache.set(fx, { sig, n: fx.length, world: game.world, map });
  return map;
}

const NO_SETS = { all: [], official: [], friendly: new Set() };

/**
 * Obóz klubu AI w danej rundzie: ten sam wybór co forma bazowa (aiCampChoice), termin na końcu okna
 * przygotowań (ostatnie dni przed meczem o punkty). Zwraca { key, from, to, q } albo { key } bez obozu.
 */
export function aiCampFor(game, clubId, date, sets) {
  const c = game.training.clubs[clubId];
  const half = halfOf(date);
  const key = halfKey(half);
  if (c.aiCamp?.key === key) return c.aiCamp;
  const { dest, days } = aiCampChoice(game, clubId, half);
  const w = campWindow(game, half, clubId, sets.official);
  let camp = { key };
  if (dest && days && w.length >= CAMP.minDays) {
    const len = Math.min(days, w.length);
    const from = addDays(w.to, -(len - 1));
    camp = { key, from, to: w.to, q: CAMP.dests[dest].q[half], dest };
  }
  c.aiCamp = camp;
  return camp;
}

/** Akcent indywidualny młodego zawodnika AI: najsłabszy kluczowy atrybut pozycji (profil „++”). */
export function aiFocusAttr(p) {
  const off = offsetsFor(p);
  let best = null; let bv = Infinity;
  for (const a in off) {
    if (off[a] < 3) continue;
    const v = p.attr?.[a] ?? 10;
    if (v < bv) { bv = v; best = a; }
  }
  return best;
}

/** Bodziec zajęć dla pełnego uczestnika: { dp, attrs } dla zawodnika z pola i dla bramkarza. */
function sessionStim(x, campQ, camp) {
  const def = SESSIONS[x.type];
  const I = INTENSITY[x.int] ?? INTENSITY.mid;
  const campDev = (1 + CAMP.inCamp.dev * campQ) * (camp && def.group === 'phys' ? 1.1 : 1);
  const gkSwap = !GK_JOIN.has(x.type);
  return {
    def, I, gkSwap,
    out: { dp: I.dev * def.dev * campDev, attrs: def.attrs },
    gk: { dp: I.dev * (gkSwap ? GK_SESSION.dev : def.dev) * campDev, attrs: gkSwap ? GK_SESSION.attrs : def.attrs },
  };
}

function addStim(acc, s) {
  if (!(s.dp > 0) || !s.attrs.length) return 0;
  const per = s.dp / s.attrs.length;
  for (const a of s.attrs) acc[a] = r3((acc[a] ?? 0) + per);
  return s.dp;
}

/**
 * Skutki zajęć dnia dla pełnego uczestnika: zmęczenie (przed mnożnikiem zawodnika), regeneracja (przed mnożnikiem
 * zawodnika), ostrość, bodziec, morale i suma ryzyka urazu. Te same składniki co pętla zajęć w sessions.js.
 */
function profileOf(list, gk, campQ, rec, sharpMul) {
  const o = { fat: 0, rec: 0, sharp: 0, dp: 0, dev: false, morale: 0, inj: 0, load: 0 };
  for (const s of list) {
    const swap = gk && s.gkSwap;
    if (s.def.recover) o.rec += rec;
    else o.fat += s.I.fat * s.def.fat * (1 - CAMP.inCamp.fatigue * campQ) * (swap ? 0.7 : 1);
    o.sharp += s.I.sharp * s.def.sharp * sharpMul;
    o.dp += gk ? s.gk.dp : s.out.dp;
    if (s.def.dev >= 0.5) o.dev = true;
    o.morale += s.def.morale + s.I.morale;
    o.inj += s.I.inj * s.def.inj;
    o.load += s.I.load * s.def.load;
  }
  return o;
}

/** Stan rozwojowy klubu AI w miesiącu (rozkład bodźca dla pełnego uczestnika). */
function stimState(c) {
  return c.aiStim ?? (c.aiStim = { out: {}, gk: {}, dpOut: 0, dpGk: 0 });
}

/**
 * Dzień treningowy wszystkich klubów AI. Wywoływany przez system dnia po dniu klubu gracza.
 */
export function processAiDay(game, date) {
  const T = game.training;
  const rng = new Rng(`trening-ai:${game.seed}:${date}`);
  const setsMap = allClubSets(game);
  const yesterday = addDays(date, -1);
  const dY = digits(date, 0, 4); const dMD = digits(date, 5, 7) * 100 + digits(date, 8, 10);
  // Wiek jak ageAt (state.js), bez cięcia napisów dla 1300 zawodników dziennie
  const ageOf = (p) => {
    const b = p.birthDate;
    if (!b) return p.age ?? 25;
    return dY - digits(b, 0, 4) - (dMD >= digits(b, 5, 7) * 100 + digits(b, 8, 10) ? 0 : 1);
  };
  const injCtx = { sessionMul: 0, age: 25, acwr: 1, fitQ: 10, campQ: 0, baseMul: 1, fresh: 100, mode: 'normal', rtp: false, returning: false };
  const today = Math.round(Date.UTC(dY, digits(date, 5, 7) - 1, digits(date, 8, 10)) / 86400000);
  const half = halfOf(date);
  const key = halfKey(half);
  for (const clubId of Object.keys(game.world.clubs)) {
    if (clubId === game.clubId) continue;
    const c = T.clubs[clubId];
    if (!c) continue;
    const sets = setsMap.get(clubId) ?? NO_SETS;
    const ac = aiCampFor(game, clubId, date, sets);
    const camp = ac.from && date >= ac.from && date <= ac.to ? { ...ac, half } : null;
    const ctx = dayContext(game, date, sets, camp);
    const plan = planCache.get(clubId) ?? planCache.set(clubId, aiPlanFor(clubId)).get(clubId);
    const day = autoDay(game, date, ctx, plan);
    c.legs = r3((c.legs ?? 0) * LOAD.legsDecay);
    if (day.kind === 'match' || day.kind === 'off') continue;
    const campQ = camp?.q ?? 0;
    const fitQ = staffQ(game, clubId, 'fizyczny');
    // Akcent indywidualny dla młodych tylko w klubach z dobrym trenerem młodzieży (decyzja gracza)
    const youthFocus = staffQ(game, clubId, 'mlodziez') >= AI_PLAN.focusMinYouthQ;
    const tac = staffMul.tac(staffQ(game, clubId, 'asystent'));
    // Forma bazowa (obóz): brak przygotowania wolniej buduje ostrość i podnosi ryzyko urazu przez 6 tygodni
    const f = c.cb && c.cb.key === key ? baseFactor(c.cb.start, date) : 0;
    const lack = f ? Math.max(0, 1 - c.cb.base) * f : 0;
    const sharpMul = 1 - 0.5 * lack;
    const injuryMul = 1 + CAMP.injuryPenalty * lack;

    const team = day.sessions.map((x) => sessionStim(x, campQ, !!camp));
    const st = stimState(c);
    for (let i = 0; i < team.length; i++) {
      const s = team[i];
      aiSessionToClub(c, day.sessions[i], tac, campQ);
      st.dpOut = r3(st.dpOut + addStim(st.out, s.out));
      st.dpGk = r3(st.dpGk + addStim(st.gk, s.gk));
      c.legs = r3(Math.max(0, c.legs + (s.def.recover ? s.def.legs : s.I.legs * s.def.legs)));
    }
    // Skutki dnia dla pełnego uczestnika (z pola, bramkarz) i dla rezerwowych po meczu, którzy zamiast
    // regeneracji mają trening uzupełniający (jak w planie gracza). Na zawodnika zostają tylko mnożniki osobiste.
    const rec = staffMul.recover(fitQ);
    const prof = (list, gk) => profileOf(list, gk, campQ, rec, sharpMul);
    const subsList = ctx.role === 'MD+1' && team.length ? [sessionStim({ type: 'gierki', int: 'mid' }, campQ, !!camp), ...team.slice(1)] : null;
    const P = { out: prof(team, false), gk: prof(team, true), subsOut: subsList && prof(subsList, false), subsGk: subsList && prof(subsList, true) };
    const restMorale = day.kind === 'rest' ? 0.15 : 0;
    const campMorale = camp ? CAMP.inCamp.morale * campQ : 0;
    for (const p of squadOf(game.world, clubId)) {
      const tr = p.aiTr ?? (p.aiTr = newAiTr(p, today));
      if (p.injuryDays > 0) { tr.il = Math.max(tr.il ?? 0, p.injury?.days ?? p.injuryDays); continue; }
      if (tr.il) { // powrót po urazie: program powrotu po dłuższym urazie (jak automatyczny program gracza)
        tr.ret = today;
        if (tr.il >= LOAD.rtpFrom && fitQ >= 8) tr.rtp = today + LOAD.rtpDays;
        tr.il = 0;
      }
      // Obciążenie meczowe (minuty od ostatniego dnia z zajęciami)
      const min = p.season?.min ?? 0;
      let load = 0;
      if (tr.m == null || min < tr.m) tr.m = min;
      else if (min > tr.m) { load += LOAD.matchLoad * (min - tr.m) / 90; tr.m = min; }
      const gk = p.pos === 'BR';
      const pr = !team.length || p.callUp || p.onLoanOut ? null
        : subsList && p.lastMatch !== yesterday ? (gk ? P.subsGk : P.subsOut) : (gk ? P.gk : P.out);
      let morale = restMorale;
      if (pr) {
        const age = ageOf(p);
        const rtp = tr.rtp > today;
        let fresh = (p.fresh ?? 95) - pr.fat * fatigueMul(p, age) + pr.rec * regenMul(p, age);
        let sharp = p.sharp ?? 70;
        if (rtp) sharp = Math.min(100, sharp + 2);
        if (sharp < LOAD.sharpTrainCap && pr.sharp) sharp = Math.min(LOAD.sharpTrainCap, sharp + pr.sharp);
        p.sharp = sharp;
        tr.dp = r2(tr.dp + pr.dp);
        load += pr.load;
        if (pr.dev && youthFocus && age <= AI_PLAN.focusMaxAge) { tr.dd++; fresh -= AI_PLAN.focusFresh; load += 5; }
        p.fresh = Math.round(clamp(fresh, 20, 100 - (p.matchDebt ?? 0)));
        morale += pr.morale + campMorale;
        updateLoad(tr, today, load);
        const acwr = aiAcwr(tr);
        if (acwr > 1.5) morale -= 0.1; // przetrenowanie: zmęczenie psychiczne
        if (pr.inj > 0) {
          injCtx.sessionMul = pr.inj; injCtx.age = age; injCtx.acwr = acwr; injCtx.fitQ = fitQ; injCtx.campQ = campQ;
          injCtx.baseMul = injuryMul; injCtx.fresh = p.fresh; injCtx.rtp = rtp; injCtx.returning = !rtp && tr.ret != null && today - tr.ret <= 14;
          if (rng.next() < trainingInjuryChance(p, injCtx)) {
            const inj = rollTrainingInjury(p, rng);
            p.injuryDays = inj.days;
            p.injury = { ...inj, since: date, training: true };
            tr.il = inj.days;
          }
        }
      } else updateLoad(tr, today, load);
      if (morale) p.morale = applyMorale(p.morale ?? 12, morale);
    }
  }
}

// Obciążenie zawodnika AI: średnie wykładnicze z 7 i 28 dni (ten sam stosunek ostrego do przewlekłego co dziennik
// 28 dni gracza, bez trzymania dziennika). Dni bez wpisu (mecz, urlop, uraz) liczą się jako zero.
const LA = 2 / (7 + 1); const LC = 2 / (28 + 1);
function newAiTr(p, today) {
  return { dp: 0, dd: 0, a: LOAD.baselineDay, c: LOAD.baselineDay, m: p.season?.min ?? 0, d: today };
}
function updateLoad(tr, today, load) {
  const gap = today - (tr.d ?? today);
  if (gap > 1) { tr.a *= (1 - LA) ** (gap - 1); tr.c *= (1 - LC) ** (gap - 1); }
  if (gap >= 1) { tr.a += (load - tr.a) * LA; tr.c += (load - tr.c) * LC; } else { tr.a += load * LA; tr.c += load * LC; }
  tr.a = Math.round(tr.a * 10) / 10; tr.c = Math.round(tr.c * 10) / 10; tr.d = today;
}
/** ACWR zawodnika AI (ostre do przewlekłego). */
export const aiAcwr = (tr) => (tr && tr.c > 1 ? tr.a / tr.c : 1);
const ovr = { acwr: 1 };
/** Kara za przeciążenie zawodnika AI: ten sam wzór co u gracza (overloadTerm). */
export function aiOverload(p) {
  if (!p.aiTr) return 0;
  ovr.acwr = aiAcwr(p.aiTr);
  return overloadTerm(ovr);
}

/**
 * Bodziec z miesiąca dla zawodnika AI (do developPlayer): rozkład klubu przeskalowany do udziału zawodnika
 * w zajęciach plus akcent indywidualny młodych. null = brak danych (stary zapis): standardowy plan.
 */
export function aiStimFor(game, p) {
  const tr = p.aiTr;
  const st = game.training?.clubs?.[p.clubId]?.aiStim;
  if (!tr || !st) return null;
  const gk = p.pos === 'BR';
  const base = gk ? st.gk : st.out;
  const full = gk ? st.dpGk : st.dpOut;
  const k = full > 0 ? tr.dp / full : 0;
  const stim = {};
  for (const a in base) stim[a] = base[a] * k;
  if (tr.dd) {
    const a = aiFocusAttr(p);
    if (a) stim[a] = (stim[a] ?? 0) + AI_PLAN.focusStim * tr.dd;
  }
  return stim;
}

/** Po miesięcznym rozwoju: nowy miesiąc bodźców klubu AI. */
export function resetAiStim(game, clubId) {
  const c = game.training?.clubs?.[clubId];
  if (c) c.aiStim = { out: {}, gk: {}, dpOut: 0, dpGk: 0 };
}
