// Zgranie drużyny: znajomość formacji (osobno dla każdej), znajomość instrukcji, znajomość systemu
// przez zawodnika i rytm (regularna gra). Rośnie na treningu taktycznym i w meczach, spada przy zmianie
// formacji, zmianie instrukcji i rotacji składu. Do silnika trafia na dwa sposoby, bez zmian w silniku:
//  1) start spójności S (cfg.cohesion) = 70 + 0.3 * zgranie (ekspert 4.3),
//  2) modyfikator zawodnika w rejestrze: 0.008 pkt za punkt zgrania ponad 65 (od -0.4 do +0.28).
// Stałe fragmenty i analiza rywala to osobne, małe składniki (modyfikatory i dane wejściowe meczu).

import { clamp } from '../core/rng.js';
import { COH, SESSIONS, INTENSITY, staffMul } from './config.js';
import { staffQ } from './staff.js';
import { aiClubZ } from './state.js';

const W = COH.weights;
const r1 = (v) => Math.round(v * 10) / 10;

export function cohesionLabel(z) {
  return z >= 85 ? 'Znakomite' : z >= 72 ? 'Dobre' : z >= 58 ? 'Przeciętne' : z >= 45 ? 'Słabe' : 'Bardzo słabe';
}

const famOf = (c, form) => c.fam[form] ?? COH.famMin + 6;

/** Zgranie zawodnika klubu gracza (0-100). */
export function playerZ(c, p, form) {
  const t = p.training;
  return W.fam * famOf(c, form) + W.instr * c.instr + W.know * (t?.know ?? COH.knowNew) + W.rhythm * 100 * (t?.rh ?? 0.3);
}

/** Wpływ zgrania na zawodnika w punktach atrybutu (modyfikator rejestru). */
export function cohesionTerm(game, p) {
  const c = game?.training?.clubs?.[p.clubId];
  if (!c) return 0;
  const z = p.clubId === game.clubId ? playerZ(c, p, game.tactics?.formation ?? c.form) : c.z;
  return clamp(COH.perPoint * (z - COH.neutral), COH.min, COH.max);
}

/** Zgranie drużyny: liczba 0-100, składniki i start spójności S dla silnika. */
export function teamCohesion(game, clubId = game.clubId, tactics = clubId === game.clubId ? game.tactics : null) {
  const c = game?.training?.clubs?.[clubId];
  if (!c) return { z: 50, parts: null, sStart: 85, label: cohesionLabel(50) };
  if (clubId !== game.clubId || !tactics) {
    const z = c.z || aiClubZ(c);
    return { z, parts: { fam: famOf(c, c.form), instr: c.instr }, sStart: COH.sStart(z), label: cohesionLabel(z) };
  }
  const form = tactics.formation ?? c.form;
  const xi = (tactics.xi || []).map((id) => game.world.players[id]).filter(Boolean);
  const avg = (f) => (xi.length ? xi.reduce((s, p) => s + f(p), 0) / xi.length : 0);
  const parts = {
    fam: r1(famOf(c, form)), instr: r1(c.instr),
    know: r1(avg((p) => p.training?.know ?? COH.knowNew)), rhythm: r1(100 * avg((p) => p.training?.rh ?? 0.3)),
  };
  const z = r1(W.fam * parts.fam + W.instr * parts.instr + W.know * parts.know + W.rhythm * parts.rhythm);
  return { z, parts, sStart: COH.sStart(z), label: cohesionLabel(z), term: Math.round(clamp(COH.perPoint * (z - COH.neutral), COH.min, COH.max) * 100) / 100 };
}

/** Efekt zajęć na zgranie klubu (raz na zajęcia, nie na zawodnika). */
export function applySessionToClub(game, clubId, session, date, nextMatch) {
  const c = game.training.clubs[clubId];
  const def = SESSIONS[session.type];
  const tac = staffMul.tac(staffQ(game, clubId, 'asystent'));
  const im = INTENSITY[session.int].fam;
  const form = clubId === game.clubId ? game.tactics?.formation ?? c.form : c.form;
  if (def.fam) c.fam[form] = Math.min(100, famOf(c, form) + def.fam * im * tac);
  if (def.instr) c.instr = Math.min(100, c.instr + def.instr * im * tac);
  if (def.sp) c.sp = Math.min(100, c.sp + def.sp * im * tac);
  if (def.prep && nextMatch && nextMatch.date > date) {
    const v = staffMul.prep(staffQ(game, clubId, 'analityk'));
    if (!c.prep || c.prep.date !== nextMatch.date || c.prep.v < v) c.prep = { date: nextMatch.date, opp: nextMatch.opp, v: Math.round(v * 1000) / 1000 };
  }
}

/** Zmiana formacji albo instrukcji przez gracza: zgranie instrukcji spada o 7 za każdą zmienioną. */
export function syncTacticsChange(game) {
  const c = game.training.clubs[game.clubId];
  const t = game.tactics;
  if (!c || !t) return 0;
  if (t.formation && c.form !== t.formation) {
    c.form = t.formation;
    if (c.fam[t.formation] == null) c.fam[t.formation] = COH.famStartOther;
  }
  const snap = c.instrSnap ?? {};
  let changed = 0;
  for (const [k, v] of Object.entries(t.instructions ?? {})) if (snap[k] !== undefined && snap[k] !== v) changed++;
  if (changed) c.instr = Math.max(COH.famMin, c.instr - COH.instrChange * changed);
  c.instrSnap = { ...(t.instructions ?? {}) };
  return changed;
}

/** Mecz klubu: zgranie formacji +4, instrukcji +2, zawodnicy: znajomość systemu i rytm. */
export function applyClubMatch(c, form, played = null, players = []) {
  c.fam[form] = Math.min(100, famOf(c, form) + COH.famMatch);
  c.instr = Math.min(100, c.instr + COH.instrMatch);
  if (!played) return;
  for (const p of players) {
    const t = p.training;
    if (!t) continue;
    const min = played.get(p.id) ?? 0;
    t.rh = Math.round((0.6 * (t.rh ?? 0.3) + 0.4 * Math.min(1, min / 90)) * 1000) / 1000;
    if (min > 0) t.know = Math.min(100, (t.know ?? COH.knowNew) + COH.knowMatch * Math.min(1, min / 90));
  }
}

/** Tygodniowy krok zgrania: zapominanie nieużywanych formacji i stałych fragmentów. */
export function weeklyCohesionDecay(c) {
  for (const f of Object.keys(c.fam)) if (f !== c.form) c.fam[f] = Math.max(COH.famMin, c.fam[f] - COH.famWeekDecay);
  c.sp = c.sp > COH.spNeutral ? Math.max(COH.spNeutral, c.sp - COH.spDecayWeek) : c.sp;
}

/** Klub AI: jeden zbiorczy krok tygodniowy (trening taktyczny + mecze z tego tygodnia). */
export function aiWeeklyCohesion(game, clubId, matches) {
  const c = game.training.clubs[clubId];
  weeklyCohesionDecay(c);
  const tac = staffMul.tac(staffQ(game, clubId, 'asystent'));
  c.fam[c.form] = Math.min(100, famOf(c, c.form) + COH.aiFamWeek * tac + COH.famMatch * matches);
  c.instr = Math.min(100, c.instr + (COH.aiInstr - c.instr) * 0.25);
  c.z = aiClubZ(c);
}

/** Bonus z analizy wideo rywala (tylko w dniu meczu, na który była analiza). */
export function prepTerm(game, p) {
  const c = game?.training?.clubs?.[p.clubId];
  return c?.prep && c.prep.date === game.date ? c.prep.v : 0;
}

/** Przesunięcie stałych fragmentów: SFR wykonawców od -0.6 do +1.2 (poziom wyćwiczenia 0-100). */
export function setPieceEdge(c) {
  return c ? clamp(((c.sp ?? 50) - COH.spNeutral) / 50 * 1.2, -0.6, 1.2) : 0;
}

/**
 * Dane wejściowe meczu w pełnym silniku: start spójności S i kadra z wyćwiczonymi stałymi fragmentami.
 * Użycie (koordynator): Object.assign(cfg, trainingMatchInput(game, clubId, cfg)).
 */
export function trainingMatchInput(game, clubId, cfg = {}) {
  const c = game?.training?.clubs?.[clubId];
  if (!c) return {};
  if (clubId === game.clubId) syncTacticsChange(game);
  const tactics = clubId === game.clubId ? cfg.tactics ?? game.tactics : null;
  const coh = teamCohesion(game, clubId, tactics);
  const d = setPieceEdge(c);
  const out = { cohesion: coh.sStart };
  if (cfg.squad && Math.abs(d) >= 0.05) {
    out.squad = cfg.squad.map((p) => ({
      ...p,
      attr: { ...p.attr, SFR: (p.attr?.SFR ?? 8) + d, ...(p.pos === 'BR' ? { WYJ: (p.attr?.WYJ ?? 8) + d * 0.5 } : {}) },
    }));
  }
  return out;
}
