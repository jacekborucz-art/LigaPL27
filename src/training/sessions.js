// Zajęcia treningowe klubu gracza dzień po dniu: zmęczenie (świeżość), ostrość, obciążenie, bodziec
// rozwojowy, morale, zgranie, nauka pozycji, urazy treningowe, program powrotu i program dla młodych.
// Koszt: ok. 25 zawodników x 1-2 zajęcia, kilka działań na liczbach.

import { clamp } from '../core/rng.js';
import { addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { applyMorale } from '../career/morale.js';
import { proficiency } from '../engine/positions.js';
import { INJURY_TYPES } from '../engine/match/constants.js';
import { squadOf } from '../world/worldGen.js';
import { fmtDate } from '../ui/dom.js';
import { SESSIONS, INTENSITY, GK_SESSION, GK_JOIN, LOAD, COH, staffMul, PROGRAMS } from './config.js';
import { ageAt, defaultPlayerTraining, clubMatchDates, daysBetween } from './state.js';
import { dayContext, planDay } from './plan.js';
import { staffQ } from './staff.js';
import { shiftLog, addLoad, loadSummary, fatigueMul, regenMul, trainingInjuryChance } from './load.js';
import { applySessionToClub, applyClubMatch, syncTacticsChange } from './cohesion.js';
import { focusAttrs } from './development.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;
const LEARN_CAP = 90;

/** Przewidywane skutki zajęć na przeciętnego zawodnika (ekran „Trening”, tabela wpływu). */
export function sessionPreview(game, type, int, clubId = game.clubId) {
  const def = SESSIONS[type];
  const I = INTENSITY[def.noIntensity ? 'low' : int];
  const fitQ = staffQ(game, clubId, 'fizyczny');
  const tac = staffMul.tac(staffQ(game, clubId, 'asystent'));
  return {
    fresh: def.recover ? r1(staffMul.recover(fitQ)) : -r1(I.fat * def.fat),
    load: Math.round(I.load * def.load),
    injury: Math.round(LOAD.injBase * I.inj * def.inj * staffMul.inj(fitQ) * 10000) / 100, // % na zawodnika
    dev: r1(I.dev * def.dev),
    sharp: r1(I.sharp * def.sharp),
    legs: r1(Math.max(0, I.legs * def.legs)),
    morale: Math.round((def.morale + I.morale) * 100) / 100,
    fam: def.fam ? r1(def.fam * I.fam * tac) : 0,
    instr: def.instr ? r1(def.instr * I.fam * tac) : 0,
    sp: def.sp ? r1(def.sp * I.fam * tac) : 0,
    prep: def.prep ? staffMul.prep(staffQ(game, clubId, 'analityk')) : 0,
    attrs: def.attrs,
  };
}

function rollTrainingInjury(p, rng) {
  const r = rng.next();
  const odpShift = (p.hidden?.ODP ?? 10) >= 15 ? 0.05 : 0;
  const cat = r < LOAD.injuryCats.light + odpShift ? 'light' : r < 1 - LOAD.injuryCats.severe ? 'medium' : 'severe';
  const [name, lo, hi] = rng.pick(INJURY_TYPES[cat]);
  return { name, days: rng.int(lo, hi), cat };
}

const msg = (date, from, priority, subject, body, key) => createMessage({ date, key, category: 'staff', from, subject, body, priority });

/** Zawodnicy, którzy zagrali w meczu klubu z danego dnia: id -> minuty (z różnicy minut sezonu). */
function newMatchMinutes(squad, matchDate) {
  const out = new Map();
  for (const p of squad) {
    const t = p.training;
    if (!t || p.lastMatch !== matchDate) continue;
    out.set(p.id, Math.max(0, (p.season?.min ?? 0) - (t.minSeen ?? 0)));
  }
  return out;
}

/**
 * Dzień treningowy klubu gracza. Wywoływany przez system dnia po regeneracji z season.js.
 * Zwraca listę wiadomości do skrzynki.
 */
export function processUserDay(game, date, rng) {
  const T = game.training;
  const clubId = game.clubId;
  const c = T.clubs[clubId];
  const messages = [];
  const dates = clubMatchDates(game);
  const ctx = dayContext(game, date, dates);
  const day = planDay(game, date, ctx);
  const camp = ctx.phase === 'oboz';
  const fitQ = staffQ(game, clubId, 'fizyczny');
  const tac = staffMul.tac(staffQ(game, clubId, 'asystent'));
  const squad = squadOf(game.world, clubId);
  syncTacticsChange(game);

  // Mecze klubu od ostatniego dnia: zgranie formacji, instrukcji, rytm i znajomość systemu
  if (T.lastClubMatch == null) {
    T.lastClubMatch = (game.fixtures || []).filter((f) => f.played && f.date < date && (f.home === clubId || f.away === clubId)).map((f) => f.date).sort().pop() ?? '';
  } else {
    const played = (game.fixtures || []).filter((f) => f.played && f.date > T.lastClubMatch && f.date < date && (f.home === clubId || f.away === clubId)).map((f) => f.date).sort();
    for (const md of played) {
      applyClubMatch(c, game.tactics?.formation ?? c.form, newMatchMinutes(squad, md), squad);
      T.lastClubMatch = md;
    }
  }

  const nextFix = ctx.next ? (game.fixtures || []).find((f) => f.date === ctx.next && (f.home === clubId || f.away === clubId)) : null;
  const nextMatch = nextFix ? { date: nextFix.date, opp: nextFix.home === clubId ? nextFix.away : nextFix.home } : null;
  for (const s of day.sessions) applySessionToClub(game, clubId, s, date, nextMatch);

  const injuries = [];
  let freshSum = 0; let acwrSum = 0; let n = 0;
  const yesterday = addDays(date, -1);
  for (const p of squad) {
    const t = p.training ?? (p.training = defaultPlayerTraining(p, date, { inSeason: true }));
    const age = ageAt(p, date);
    shiftLog(t, date);
    // Obciążenie meczowe (mecz klubu gracza rozgrywa się po dniu gry, więc dopisujemy je następnego dnia)
    const dm = (p.season?.min ?? 0) - (t.minSeen ?? 0);
    if (dm < 0) t.minSeen = p.season?.min ?? 0;
    else if (dm > 0) {
      if (p.lastMatch) addLoad(t, p.lastMatch, LOAD.matchLoad * dm / 90);
      t.minSeen += dm;
    }
    t.legs = Math.round((t.legs ?? 0) * LOAD.legsDecay * 1000) / 1000;

    if (p.injuryDays > 0) {
      t.inj = true; t.injLen = Math.max(t.injLen ?? 0, p.injury?.days ?? p.injuryDays); t.legs = 0;
      t.acwr = loadSummary(t).acwr;
      continue;
    }
    if (t.inj) {
      t.inj = false; t.returnedAt = date;
      if ((t.injLen ?? 0) >= LOAD.rtpFrom && (t.prog === 'powrot' || fitQ >= 8)) {
        t.rtp = LOAD.rtpDays;
        if (t.prog !== 'powrot') t.progAuto = true;
      }
      t.injLen = 0;
    }

    // Zajęcia zawodnika: plan drużyny z wyjątkami (powołanie, rezerwowi po meczu, tryb, program powrotu)
    let sessions = p.callUp || p.onLoanOut ? [] : day.sessions;
    if (day.auto && ctx.role === 'MD+1' && p.lastMatch !== yesterday && sessions.length) {
      sessions = [{ type: 'gierki', int: 'mid' }, ...sessions.slice(1)]; // trening uzupełniający dla rezerwowych
    }
    if (t.mode === 'rest') sessions = sessions.filter((x) => SESSIONS[x.type].noIntensity);
    const modeMul = t.mode === 'light' ? 0.5 : 1;
    if (t.rtp > 0) {
      sessions = sessions.map((x) => (x.int === 'high' ? { ...x, int: 'mid' } : x));
      t.rtp--;
      p.sharp = Math.min(100, (p.sharp ?? 70) + 2);
      if (!t.rtp && t.progAuto) { t.progAuto = false; if (t.prog === 'powrot') t.prog = null; }
    }

    let fresh = p.fresh ?? 95;
    let load = 0;
    let morale = 0;
    let devDay = false;
    let tactical = false;
    const stim = t.stim ?? (t.stim = {});
    for (const x of sessions) {
      const def = SESSIONS[x.type];
      const I = INTENSITY[x.int] ?? INTENSITY.mid;
      const gkSwap = p.pos === 'BR' && !GK_JOIN.has(x.type);
      if (def.recover) {
        fresh += staffMul.recover(fitQ) * regenMul(p, age);
        t.legs = Math.max(0, t.legs + def.legs);
      } else {
        fresh -= I.fat * def.fat * fatigueMul(p, age) * modeMul * (camp ? 0.9 : 1) * (gkSwap ? 0.7 : 1);
        t.legs += Math.max(0, I.legs * def.legs * modeMul * (gkSwap ? 0.6 : 1));
      }
      load += I.load * def.load * modeMul;
      const sharp = p.sharp ?? 70;
      if (sharp < LOAD.sharpTrainCap) p.sharp = Math.min(LOAD.sharpTrainCap, sharp + I.sharp * def.sharp * modeMul);
      const attrs = gkSwap ? GK_SESSION.attrs : def.attrs;
      const dp = I.dev * (gkSwap ? GK_SESSION.dev : def.dev) * modeMul * (camp && def.group === 'phys' ? 1.25 : 1);
      if (dp > 0 && attrs.length) {
        for (const a of attrs) stim[a] = r3((stim[a] ?? 0) + dp / attrs.length);
        if (def.dev >= 0.5) devDay = true;
      }
      morale += def.morale + I.morale;
      if (def.know) t.know = Math.min(100, (t.know ?? COH.knowNew) + def.know * I.fam * tac * modeMul);
      if (x.type === 'taktyka') tactical = true;
    }
    // Akcent indywidualny i program dla młodych: dodatkowe 20-30 minut po zajęciach
    if (devDay) {
      const fa = focusAttrs(t.focus);
      if (fa.length) {
        for (const a of fa) stim[a] = r3((stim[a] ?? 0) + (0.4 * modeMul) / fa.length);
        fresh -= 2 * modeMul; load += 5 * modeMul;
      }
      if (t.prog === 'mlodzi' && age <= PROGRAMS.mlodzi.maxAge) {
        for (const a of ['TEC', 'POD', 'DEC']) stim[a] = r3((stim[a] ?? 0) + 0.1);
        fresh -= 2; load += 6;
      }
      // Nauka nowej pozycji (biegłość rośnie do 90, nigdy bramka)
      if (t.pos && t.pos !== p.pos && t.pos !== 'BR' && p.pos !== 'BR') {
        const cur = Math.max(proficiency({ ...p, alt: {} }, t.pos), p.alt?.[t.pos] ?? 0);
        if (cur < LEARN_CAP) {
          const gain = 0.22 * tac * (0.85 + 0.015 * (p.attr?.DEC ?? 10)) * (tactical ? 1.6 : 1) * modeMul;
          const next = Math.min(LEARN_CAP, r3(cur + gain));
          p.alt = { ...(p.alt ?? {}), [t.pos]: next };
          if (next >= LEARN_CAP) {
            messages.push(msg(date, 'Asystent trenera', 'info', `${p.name} opanował nową pozycję`, `${p.name} gra już jako ${t.pos} na poziomie 90 % (więcej da tylko gra w meczach). Kończymy indywidualne zajęcia na tej pozycji.`, `pos:${p.id}:${t.pos}`));
            t.pos = null;
          }
        } else t.pos = null;
      } else if (t.pos) t.pos = null;
    }
    if (day.kind === 'rest') morale += 0.15;
    if (day.kind === 'off') load += LOAD.offDayLoad;

    p.fresh = Math.round(clamp(fresh, 20, 100));
    t.log[27] = r1(t.log[27] + load);
    const sum = loadSummary(t);
    t.acwr = sum.acwr;
    if (sum.acwr > 1.5) morale -= 0.1; // przetrenowanie: zmęczenie psychiczne
    if (morale) p.morale = applyMorale(p.morale ?? 12, morale);

    // Uraz na treningu
    if (sessions.length) {
      const chance = trainingInjuryChance(p, {
        sessions, age, acwr: sum.acwr, fitQ, camp, rtp: t.rtp > 0, fresh: p.fresh, mode: t.mode,
        returning: t.returnedAt && daysBetween(t.returnedAt, date) <= 14,
      });
      if (chance > 0 && rng.next() < chance) {
        const inj = rollTrainingInjury(p, rng);
        p.injuryDays = inj.days;
        p.injury = { ...inj, since: date, training: true };
        t.inj = true; t.injLen = inj.days;
        injuries.push(p.name);
        messages.push(msg(date, 'Sztab medyczny', inj.days > 7 ? 'important' : 'info', `Uraz na treningu: ${p.name}`,
          `${p.name}: ${inj.name} na treningu. Przerwa potrwa ok. ${inj.days} dni (powrót ok. ${fmtDate(addDays(date, inj.days))}).${sum.acwr > 1.3 ? ` Obciążenie z ostatnich 7 dni było o ${Math.round((sum.acwr - 1) * 100)} % wyższe niż zwykle.` : ''}`,
          `trinj:${p.id}:${date}`));
      }
    }
    freshSum += p.fresh; acwrSum += t.acwr; n++;
  }
  T.hist[date] = {
    s: day.sessions.map((x) => ({ ...x })), role: ctx.role, kind: day.kind, inj: injuries,
    fresh: n ? Math.round(freshSum / n) : null, acwr: n ? Math.round((acwrSum / n) * 100) / 100 : null,
  };
  return messages;
}
