// Trening klubów AI dzień po dniu (docs/trening-ai.md). Kluby AI realizują plan asystenta (plan.js, autoDay)
// dla własnego terminarza, z akcentem tygodnia według typu trenera, i dostają skutki zajęć z tych samych wzorów
// co klub gracza (sessions.js): zmęczenie i regeneracja, ostrość, morale, urazy treningowe, bodziec rozwojowy,
// stałe fragmenty, zgranie formacji, obóz przygotowawczy. Różnice wobec klubu gracza (świadome uproszczenia):
//  - bez dziennika obciążeń 28 dni: ACWR klubu AI = 1 (plan asystenta trzyma obciążenie w normie),
//  - „ciężkie nogi” jedną liczbą na klub (wszyscy robią te same zajęcia),
//  - bodziec rozwojowy: rozkład na atrybuty na klub, udział zawodnika w zajęciach osobno (p.aiTr),
//  - bez programu powrotu po kontuzji i programu dla młodych (narzędzia gracza).
// Koszt: ok. 1300 zawodników x kilka działań na liczbach dziennie.

import { Rng, clamp } from '../core/rng.js';
import { addDays } from '../core/gameLoop.js';
import { applyMorale } from '../career/morale.js';
import { clubById } from '../data/clubs_pl.js';
import { squadOf } from '../world/worldGen.js';
import { SESSIONS, INTENSITY, GK_SESSION, GK_JOIN, LOAD, CAMP, staffMul, AI_PLAN } from './config.js';
import { ageAt } from './state.js';
import { staffQ } from './staff.js';
import { dayContext, autoDay } from './plan.js';
import { campWindow, halfOf, halfKey, baseFactor, aiCampChoice } from './camps.js';
import { aiSessionToClub } from './cohesion.js';
import { fatigueMul, regenMul, trainingInjuryChance } from './load.js';
import { rollTrainingInjury } from './sessions.js';
import { offsetsFor } from './development.js';

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Akcent i poziom obciążeń planu klubu AI (typ trenera z danych klubu). */
export function aiPlanFor(clubId) {
  const coach = clubById(clubId)?.coach ?? 'P';
  return { clubId, accent: AI_PLAN.accent[coach] ?? 'zrownowazony', load: AI_PLAN.load };
}

/** Daty meczów wszystkich klubów (jeden przebieg po terminarzu na dzień): clubId -> { all, official, friendly }. */
const setsCache = new WeakMap();
export function allClubSets(game) {
  const fx = game.fixtures || [];
  const hit = setsCache.get(fx);
  if (hit && hit.date === game.date && hit.n === fx.length) return hit.map;
  const raw = new Map();
  for (const f of fx) {
    if (!f.date) continue;
    for (const id of [f.home, f.away]) {
      if (!id) continue;
      let r = raw.get(id);
      if (!r) raw.set(id, (r = { all: new Set(), off: new Set() }));
      r.all.add(f.date);
      if (f.comp !== 'friendly') r.off.add(f.date);
    }
  }
  const map = new Map();
  for (const [id, r] of raw) {
    const all = [...r.all].sort();
    map.set(id, { all, official: [...r.off].sort(), friendly: new Set(all.filter((d) => !r.off.has(d))) });
  }
  setsCache.set(fx, { date: game.date, n: fx.length, map });
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
    const plan = c.aiPlan ?? (c.aiPlan = aiPlanFor(clubId));
    const day = autoDay(game, date, ctx, plan);
    c.legs = r3((c.legs ?? 0) * LOAD.legsDecay);
    if (day.kind === 'match' || day.kind === 'off') continue;
    const campQ = camp?.q ?? 0;
    const fitQ = staffQ(game, clubId, 'fizyczny');
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
    // Rezerwowi po meczu: trening uzupełniający zamiast regeneracji (jak w planie gracza)
    const subs = ctx.role === 'MD+1' && day.sessions.length
      ? sessionStim({ type: 'gierki', int: 'mid' }, campQ, !!camp) : null;
    const restDay = day.kind === 'rest';
    for (const p of squadOf(game.world, clubId)) {
      if (p.injuryDays > 0) continue;
      let list = p.callUp || p.onLoanOut ? null : team;
      let sess = list ? day.sessions : null;
      if (list && subs && p.lastMatch !== yesterday) { list = [subs, ...team.slice(1)]; sess = [{ type: 'gierki', int: 'mid' }, ...day.sessions.slice(1)]; }
      let morale = restDay ? 0.15 : 0;
      if (list && list.length) {
        const age = ageAt(p, date);
        const gk = p.pos === 'BR';
        let fresh = p.fresh ?? 95;
        let dp = 0; let dev = false;
        for (const s of list) {
          const swap = gk && s.gkSwap;
          if (s.def.recover) fresh += staffMul.recover(fitQ) * regenMul(p, age);
          else fresh -= s.I.fat * s.def.fat * fatigueMul(p, age) * (1 - CAMP.inCamp.fatigue * campQ) * (swap ? 0.7 : 1);
          const sharp = p.sharp ?? 70;
          if (sharp < LOAD.sharpTrainCap) p.sharp = Math.min(LOAD.sharpTrainCap, sharp + s.I.sharp * s.def.sharp * sharpMul);
          dp += gk ? s.gk.dp : s.out.dp;
          if (s.def.dev >= 0.5) dev = true;
          morale += s.def.morale + s.I.morale;
        }
        const tr = p.aiTr ?? (p.aiTr = { dp: 0, dd: 0 });
        tr.dp = r2(tr.dp + dp);
        if (dev && age <= AI_PLAN.focusMaxAge) { tr.dd++; fresh -= AI_PLAN.focusFresh; }
        if (camp) morale += CAMP.inCamp.morale * campQ;
        p.fresh = Math.round(clamp(fresh, 20, 100 - (p.matchDebt ?? 0)));
        const chance = trainingInjuryChance(p, { sessions: sess, age, acwr: 1, fitQ, campQ, baseMul: injuryMul, fresh: p.fresh, mode: 'normal' });
        if (chance > 0 && rng.next() < chance) {
          const inj = rollTrainingInjury(p, rng);
          p.injuryDays = inj.days;
          p.injury = { ...inj, since: date, training: true };
        }
      }
      if (morale) p.morale = applyMorale(p.morale ?? 12, morale);
    }
  }
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
