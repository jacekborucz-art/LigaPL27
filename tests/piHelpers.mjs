// Pomocnicze dla tests/playerInstr.test.mjs (plik bez .test.mjs, nie uruchamia się sam).
// Złoty zestaw meczów: bez instrukcji indywidualnych silnik musi dać identyczny dziennik zdarzeń i stan RNG jak
// przed ich wprowadzeniem (skróty zapisane w teście, zebrane tym kodem przed zmianą silnika Nov 18, 2026).
// Pomiar A/B: te same ziarna z instrukcją i bez niej.

import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics } from '../src/engine/lineup.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { formationById } from '../src/data/formations.js';
import { PLAYER_INSTRUCTIONS } from '../src/data/playerInstructions.js';
import { createMatch, step, resume, runToEnd, changeTactics } from '../src/engine/match/match.js';
import { hashString } from '../src/core/rng.js';

export const world = generateWorld(42);
export const EK = CLUBS_PL.filter((c) => c.tier === 1);
export const sq = Object.fromEntries(EK.map((c) => [c.id, squadOf(world, c.id)]));
const PASS = ['short', 'mixed', 'long'];
const PRESS = ['low', 'mid', 'high'];
const TACK = ['soft', 'normal', 'hard'];
const WEATHER = [{}, { conv: 1.06, foul: 1.08, inj: 1.05, dys: 1.15, fat: 1, act: 1, tempC: 12 }, { conv: 1, foul: 1, inj: 1, fat: 1.3, act: 1, dys: 1, tempC: 30 }];

function tacticsFor(id, i, shift) {
  const t = createTactics(sq[id]);
  return { ...t, instructions: { ...t.instructions, passing: PASS[(i + shift) % 3], pressing: PRESS[(i * 2 + shift) % 3], tackling: TACK[(i + 2 * shift) % 3] } };
}

/** Mecz nr i z grupy: 'user' (bez AI, zmiana taktyki w 30. min) albo 'ai' (obie drużyny AI). Zwraca M. */
export function goldenMatch(group, i) {
  const h = EK[i % 18].id; const a = EK[(i * 5 + 7) % 18 === i % 18 ? (i + 1) % 18 : (i * 5 + 7) % 18].id;
  const ai = group === 'ai';
  const side = (id, shift) => ({ club: clubById(id), squad: sq[id], tactics: tacticsFor(id, i, shift), ai, coach: clubById(id).coach });
  const M = createMatch({ seed: `gold:${group}:${i}`, home: side(h, 0), away: side(a, 1), ctx: { rank: i % 4, weather: WEATHER[i % 3], refStrict: 0.9 + 0.05 * (i % 5) } });
  if (ai) { runToEnd(M); return M; }
  let guard = 0;
  while (!M.ended && guard++ < 400) {
    if (M.phase === 'break') { resume(M); continue; }
    step(M);
    if (M.minute === 30 && M.elapsed === 30) {
      changeTactics(M, 0, { instructions: { passing: PASS[(i + 1) % 3], tackling: TACK[(i + 1) % 3], pressing: PRESS[(i + 2) % 3] } });
      changeTactics(M, 1, { instructions: { passing: PASS[i % 3], tackling: TACK[(i + 2) % 3] } });
    }
  }
  return M;
}

/** Skrót meczu: dziennik zdarzeń i końcowy stan RNG meczu. */
export function matchHash(M) {
  return (hashString(JSON.stringify(M.events)) ^ hashString(String(M.rng.state))) >>> 0;
}

export function goldenHashes(group, n = 50) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(matchHash(goldenMatch(group, i)).toString(16));
  return out;
}

// ------------------------------------------------------------ Pomiar A/B
const baseTac = Object.fromEntries(EK.map((c) => [c.id, createTactics(sq[c.id])]));

/** Instrukcja dla wszystkich zawodników jedenastki, których pozycja na to pozwala: { [id]: { [instr]: lv } }. */
export function allEligible(t, id, lv) {
  const def = PLAYER_INSTRUCTIONS.find((d) => d.id === id);
  const f = formationById(t.formation);
  const out = {};
  t.xi.forEach((pid, i) => { if (pid && def.pos.includes(f.slots[i].pos)) out[pid] = { [id]: lv }; });
  return out;
}

const SHOTS = new Set(['shotOn', 'shotOff', 'shotBlocked', 'post']);
const pairOf = (i) => [EK[i % 18].id, EK[(i * 7 + 3) % 18 === i % 18 ? (i + 1) % 18 : (i * 7 + 3) % 18].id];

/**
 * n meczów Ekstraklasy bez AI (ziarna piab0, piab1, ...), gospodarze z instrukcją variant = [instr, lv] dla wszystkich uprawnionych
 * z jedenastki albo bez instrukcji (null). Zwraca dla każdego meczu statystyki drużyny i liczniki zawodników gospodarzy.
 */
export function abRun(n, variant) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const [h, a] = pairOf(i);
    const th = variant ? { ...baseTac[h], playerInstr: allEligible(baseTac[h], variant[0], variant[1]) } : baseTac[h];
    const M = createMatch({ seed: `piab${i}`, home: { club: clubById(h), squad: sq[h], tactics: th, ai: false }, away: { club: clubById(a), squad: sq[a], tactics: baseTac[a], ai: false }, ctx: {} });
    const r = runToEnd(M);
    const t = r.stats;
    const pl = {};
    const P = (id) => pl[id] ?? (pl[id] = { kp: 0, sh: 0, dys: 0, foul: 0, yc: 0, off: 0, tk: 0, cond: null });
    let konA = 0;
    for (const e of M.events) {
      const kind = SHOTS.has(e.type) ? e.kind : e.type === 'goal' && !e.ownGoal && !e.provisional ? e.how : null;
      if (e.side === 1 && kind === 'KON') konA++;
      if (e.side !== 0 || e.pid == null) continue;
      if (e.type === 'keyPass') P(e.pid).kp++;
      if (kind) { P(e.pid).sh++; if (kind === 'DYS') P(e.pid).dys++; }
      if (e.type === 'foul') P(e.pid).foul++;
      if (e.type === 'yellow') P(e.pid).yc++;
      if (e.type === 'offside') P(e.pid).off++;
      if (['tackle', 'interception', 'clearance'].includes(e.type)) P(e.pid).tk++;
    }
    for (const x of M.teams[0].players) if (x.on && !x.sentOff) P(x.id).cond = x.cond;
    out.push({ h, poss: t[0].possession, acc: t[0].passAccuracy, sh: t[0].shots, shA: t[1].shots, fouls: t[0].fouls, yc: t[0].yellow, konA, pl });
  }
  return out;
}

/** Średnie na mecz z abRun: drużyna i zawodnicy, którzy w wariancie [instr, lv] mają instrukcję (kpI, shI, ..., condI). */
export function abMetrics(run, variant) {
  const s = { poss: 0, acc: 0, sh: 0, shA: 0, konA: 0, fouls: 0, yc: 0, kpI: 0, shI: 0, dysI: 0, foulI: 0, ycI: 0, offI: 0, tkI: 0, condI: 0 };
  for (const m of run) {
    for (const k of ['poss', 'acc', 'sh', 'shA', 'konA', 'fouls', 'yc']) s[k] += m[k];
    const I = Object.keys(allEligible(baseTac[m.h], variant[0], variant[1]));
    let c = 0; let cn = 0;
    for (const id of I) {
      const p = m.pl[id];
      if (!p) continue;
      s.kpI += p.kp; s.shI += p.sh; s.dysI += p.dys; s.foulI += p.foul; s.ycI += p.yc; s.offI += p.off; s.tkI += p.tk;
      if (p.cond != null) { c += p.cond; cn++; }
    }
    s.condI += cn ? c / cn : 0;
  }
  for (const k of Object.keys(s)) s[k] /= run.length;
  return s;
}
