// Pomocnicze dla tests/enginePipeline.test.mjs (plik bez .test.mjs, nie uruchamia się sam).
// Złoty zestaw „bit w bit” projektu Walka taktyk (docs/walka-taktyk.md, krok 1): pełny silnik ze stałymi ziarnami
// (różne kluby i ligi, pogoda, sędzia, frekwencja, ranga, instrukcje drużynowe i indywidualne, gra poza pozycją,
// zmęczeni i z urazem, AI w meczu włączone i wyłączone, zmiany i okrzyki), teamRating, lineupRating, quickMatch
// i krótki przebieg sezonu z dniem meczowym gracza. Skróty zebrane tym kodem PRZED przeniesieniem czynników
// do potoku etapów (Nov 27, 2026); każda zmiana liczb silnika zmienia skrót.

import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics } from '../src/engine/lineup.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { FORMATIONS } from '../src/data/formations.js';
import { INSTRUCTIONS } from '../src/data/instructions.js';
import { PLAYER_INSTRUCTIONS } from '../src/data/playerInstructions.js';
import { createMatch, step, resume, runToEnd, changeTactics, substitute, shout, result } from '../src/engine/match/match.js';
import { registerPhase } from '../src/engine/match/core.js';
import { teamRating, lineupRating, tableConfidence } from '../src/engine/teamStrength.js';
import { quickMatch, quickKnockout } from '../src/engine/quickSim.js';
import { Rng, hashString } from '../src/core/rng.js';
import { matchCoach, generateCoach } from '../src/career/coaches.js';
import { createSeason, playQuick, applyResult } from '../src/season/season.js';
import { standings } from '../src/season/standings.js';
import { processDay, continueUntilStop, primaryAction } from '../src/core/gameLoop.js';
import { startMatchday, doPreBriefing, kickOff, skip, doHalfBriefing, continueAfterBreak, finishMatchday, closeMatchday } from '../src/match/matchday.js';
import '../src/season/dailySystems.js';
import * as TR from '../src/training/index.js';
import * as CS from '../src/career/careerSystem.js';

const h32 = (s) => (hashString(s) >>> 0).toString(16);
const num = (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v);

// Sonda co minutę (po fazie drużyn): strefy, spójność, kapitan, parametry taktyki i stan zawodników.
// Nie losuje i niczego nie zmienia, więc mecz idzie tak samo jak bez niej.
registerPhase('goldenProbe', (M) => {
  if (!M.__probe) return;
  const row = M.teams.map((T) => [
    T.zones.DEF, T.zones.MID, T.zones.ATT, T.zones.GK, T.zones.SPA, T.zones.SPD, T.S, T.capES, T.knockPen,
    T.errF, T.defTired, T.central, T.pace?.team, T.pace?.att, T.pace?.def, T.P.pActMul, T.P.D, T.P.act.KON,
    T.players.map((x) => [x.base, x.cond, x.Z, x.on ? 1 : 0]),
  ]);
  M.__probe.push(JSON.stringify(row, num));
}, { after: 'teams' });

const PASS = ['short', 'mixed', 'long'];
const WEATHER = [
  {},
  { conv: 1.06, foul: 1.08, inj: 1.05, dys: 1.15, fat: 1, act: 1, tempC: 12, type: 'deszcz' },
  { conv: 1, foul: 1, inj: 1.1, fat: 1.1, act: 0.92, dys: 1, tempC: -2, type: 'snieg' },
  { conv: 1, foul: 1, inj: 1, fat: 1.3, act: 1, dys: 1, tempC: 33, type: 'slonce' },
  { conv: 1, foul: 1, inj: 1.2, fat: 1.15, act: 1, dys: 0.85, tempC: 8, type: 'wiatr' },
];

let W = null;
const world = () => (W ??= generateWorld(7));
const clubsWithSquad = () => CLUBS_PL.filter((c) => world().clubs[c.id] && squadOf(world(), c.id).length >= 16);

/** Kadra z odmienionym stanem (kopie zawodników): świeżość, ostrość, morale, forma, gra z urazem, WAZ, KON. */
function variedSquad(clubId, rng, prefix) {
  return squadOf(world(), clubId).map((p0) => {
    const p = { ...p0, id: `${prefix}${p0.id}`, hidden: { ...(p0.hidden ?? {}) } };
    const r = rng.next();
    if (r < 0.15) p.fresh = 55 + rng.int(0, 30);
    else if (r < 0.25) p.sharp = 30 + rng.int(0, 30);
    if (rng.next() < 0.5) p.morale = rng.int(3, 20);
    if (rng.next() < 0.5) p.form = Array.from({ length: rng.int(1, 5) }, () => 5 + rng.int(0, 30) / 10);
    if (rng.next() < 0.3) p.hidden.WAZ = rng.int(1, 20);
    if (rng.next() < 0.2) p.hidden.KON = rng.int(1, 20);
    if (rng.next() < 0.06) { p.injuryDays = 2; p.injury = { cat: 'light', name: rng.next() < 0.5 ? 'stłuczenie uda' : 'naciągnięcie mięśnia' }; p.playingInjured = true; }
    return p;
  });
}

function randomInstr(rng) {
  const out = {};
  for (const ins of INSTRUCTIONS) if (rng.next() < 0.55) out[ins.id] = rng.pick(ins.options).id;
  return out;
}

/** Instrukcje indywidualne dla kilku zawodników jedenastki (tylko tam, gdzie pozycja na to pozwala). */
function randomPI(rng, tactics, squad, formation) {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const out = {};
  tactics.xi.forEach((id, i) => {
    if (!id || rng.next() > 0.35) return;
    const pos = formation.slots[i]?.pos ?? byId.get(id)?.pos;
    const ok = PLAYER_INSTRUCTIONS.filter((d) => d.pos.includes(pos));
    if (!ok.length) return;
    const d = rng.pick(ok);
    out[id] = { [d.id]: rng.next() < 0.5 ? -1 : 1 };
  });
  return out;
}

function side(clubId, rng, prefix, { ai, i }) {
  const squad = variedSquad(clubId, rng, prefix);
  const formation = rng.pick(FORMATIONS);
  let tactics = createTactics(squad, { formation: formation.id, instructions: randomInstr(rng) });
  if (rng.next() < 0.5) tactics = { ...tactics, playerInstr: randomPI(rng, tactics, squad, formation) };
  // Gra poza pozycją: zamiana dwóch zawodników z pola, czasem zawodnik z pola w bramce
  const xi = tactics.xi.slice();
  if (rng.next() < 0.45) { const a = rng.int(1, 10); const b = rng.int(1, 10); [xi[a], xi[b]] = [xi[b], xi[a]]; }
  if (i % 23 === 5) { [xi[0], xi[9]] = [xi[9], xi[0]]; }
  tactics = { ...tactics, xi };
  // Gra z bólem: zawodnik jedenastki z lekkim urazem sprzed meczu (kopia, świat bez zmian)
  if (rng.next() < 0.3) {
    const p = squad.find((q) => q.id === xi[rng.int(1, 10)]);
    if (p) Object.assign(p, { injuryDays: 2, injury: { cat: 'light', name: 'stłuczenie uda' }, playingInjured: true });
  }
  const club = { ...clubById(clubId), id: `${prefix}${clubId}` };
  const cfg = { club, squad, tactics, ai, coach: clubById(clubId).coach ?? 'P' };
  if (rng.next() < 0.6) cfg.cohesion = 40 + rng.int(0, 60);
  if (rng.next() < 0.5) cfg.zStart = Object.fromEntries(squad.map((p) => [p.id, rng.int(-3, 3)]));
  if (rng.next() < 0.5) cfg.captainId = rng.pick(xi);
  if (rng.next() < 0.5) cfg.teamMorale = rng.int(6, 18);
  if (ai && rng.next() < 0.7) cfg.coachQ = matchCoach(generateCoach(7, clubId, { n: i % 3 }), { rank: i % 4, rng });
  if (!ai && rng.next() < 0.5) cfg.assistantQ = matchCoach(generateCoach(8, clubId, { n: 1 }), { rank: i % 4, rng });
  return cfg;
}

/** Mecz nr i: grupa wg i % 3 (0: obie AI, 1: gracz z AI, zmiany i okrzyki, 2: obie bez AI). */
export function goldenMatch(i) {
  const clubs = clubsWithSquad();
  const rng = new Rng(`golden-cfg:${i}`);
  const h = clubs[(i * 7) % clubs.length].id;
  let a = clubs[(i * 13 + 5) % clubs.length].id;
  if (a === h) a = clubs[(i * 13 + 6) % clubs.length].id;
  const grp = i % 3;
  const home = side(h, rng, 'h', { ai: grp === 0, i });
  const away = side(a, rng, 'a', { ai: grp !== 2, i });
  const ko = i % 11 === 3 ? 'single' : i % 11 === 7 ? { firstLeg: [rng.int(0, 2), rng.int(0, 2)] } : i % 19 === 4 ? 'penaltiesOnly' : false;
  const ctx = {
    neutral: i % 9 === 4, rank: i % 4, var: i % 5 !== 2, refStrict: 0.7 + 0.05 * (i % 14), attendance: (i % 10) / 10,
    weather: WEATHER[i % WEATHER.length], date: `2026-${String(8 + (i % 4)).padStart(2, '0')}-1${i % 9}`, knockout: ko,
    stakes: (i % 6) / 5,
  };
  const M = createMatch({ seed: `golden:${i}`, home, away, ctx });
  M.__probe = [];
  if (grp === 0) { runToEnd(M); return M; }
  let guard = 0;
  while (!M.ended && guard++ < 400) {
    if (M.phase === 'break') { resume(M); continue; }
    if (M.phase === 'shootoutPrep') { step(M); continue; }
    step(M);
    if (M.elapsed === 20 && M.half === 1) shout(M, 0, ['naprzod', 'walka', 'uwaga', 'nieodpuszczamy'][i % 4]);
    if (M.minute === 30 && M.elapsed === 30) {
      changeTactics(M, 0, { instructions: { passing: PASS[(i + 1) % 3], pressing: ['low', 'mid', 'high'][i % 3] } });
      if (grp === 2) changeTactics(M, 1, { formation: FORMATIONS[(i * 3) % FORMATIONS.length].id });
    }
    if (M.minute === 61 && M.half === 2 && M.elapsed === 16) {
      for (const s of grp === 2 ? [0, 1] : [0]) {
        const T = M.teams[s];
        const out = T.players.find((x) => x.on && !x.sentOff && x.slot?.pos !== 'BR');
        const inn = T.bench.find((x) => !x.on && !x.sentOff && x.p.pos !== 'BR');
        if (out && inn) substitute(M, s, out.id, inn.id);
      }
    }
  }
  return M;
}

/** Skrót meczu: dziennik zdarzeń, stan RNG, wynik z ocenami, sonda co minutę i końcowy stan zawodników. */
export function matchDigest(M) {
  const res = result(M);
  const fin = M.teams.map((T) => T.players.concat(T.bench).map((x) => [x.id, x.base, x.cond, x.Z, x.ev]));
  return [
    h32(JSON.stringify(M.events)), String(M.rng.state), `${M.score[0]}:${M.score[1]}`,
    h32(JSON.stringify(res, num)), h32((M.__probe ?? []).join('\n')), h32(JSON.stringify(fin, num)),
  ].join('|');
}

/** Siła drużyn bez meczu: teamRating (różne kształty, tabela, trener), lineupRating, breakdown. */
export function ratingDigests() {
  const clubs = clubsWithSquad();
  const out = [];
  clubs.forEach((c, i) => {
    const rng = new Rng(`golden-rating:${i}`);
    const squad = variedSquad(c.id, rng, 'r');
    const shapes = [undefined, { GK: 1, DEF: 5, MID: 3, ATT: 2 }, { GK: 1, DEF: 3, MID: 5, ATT: 2 }];
    const tt = tableConfidence({ played: 3 + (i % 20), points: (i * 7) % 40 }, 10 + (i % 5) / 2, 10);
    const r = teamRating(squad, { shape: shapes[i % 3], tableTerm: tt, coachTerm: ((i % 7) - 3) / 20 });
    const t = createTactics(squad, { formation: FORMATIONS[i % FORMATIONS.length].id });
    const byId = new Map(squad.map((p) => [p.id, p]));
    const f = FORMATIONS.find((x) => x.id === t.formation);
    const entries = t.xi.map((id, k) => ({ player: byId.get(id), slot: f.slots[(k + (i % 2)) % 11] })).filter((e) => e.player);
    const l = lineupRating(entries.slice(0, 11 - (i % 3 === 2 ? 1 : 0)), squad, { tableTerm: tt });
    out.push(h32(JSON.stringify([r.zones, r.gkMods, r.breakdown, r.xi.map((x) => [x.player.id, x.value, x.prof]), r.missing.length, l.zones, l.breakdown], num)));
  });
  return out;
}

/** Mecze w tle (quickMatch, quickKnockout) na tych samych kadrach. */
export function quickDigests(n = 120) {
  const clubs = clubsWithSquad();
  const out = [];
  for (let i = 0; i < n; i++) {
    const rng = new Rng(`golden-quick:${i}`);
    const h = clubs[(i * 5) % clubs.length].id; const a = clubs[(i * 11 + 3) % clubs.length].id;
    const home = { squad: variedSquad(h, rng, 'qh'), tableTerm: ((i % 9) - 4) / 30, coachTerm: ((i % 5) - 2) / 25, qsMul: i % 4 === 1 ? 1.03 : undefined };
    const away = { squad: variedSquad(a, rng, 'qa'), tableTerm: ((i % 7) - 3) / 30 };
    const ctx = { neutral: i % 6 === 1, refStrict: 0.8 + (i % 6) / 10, aggression: [1, 1 + (i % 3) / 10] };
    const r = i % 8 === 3 ? quickKnockout(home, away, ctx, rng, 'single') : quickMatch(home, away, ctx, rng);
    const { _teams, ...rest } = r;
    out.push(h32(JSON.stringify(rest, num)) + `|${rng.state}`);
  }
  return out;
}

/**
 * Krótki przebieg sezonu (systemy dnia, mecze w tle, dzień meczowy gracza w pełnym silniku) do daty `until`.
 * Skrót: wyniki meczów, tabele lig i stan zawodników klubu gracza (forma, morale, świeżość, ostrość).
 */
export function seasonDigest({ club = 'widzew', seed = 5, until = '2026-08-20', full = 2 } = {}) {
  const g = { seed, clubId: club, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: club, l4Seed: seed });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, club));
  TR.ensureTraining?.(g); CS.ensureCareer?.(g);
  const rng = new Rng(`golden-season:${seed}`);
  const user = [];
  let left = full; let guard = 0;
  processDay(g);
  while (g.date < until && guard++ < 5000) {
    const a = primaryAction(g);
    if (a.kind === 'play') {
      const f = a.match;
      if (f.comp === 'friendly' || !f.away || !f.home) { f.played = true; f.result = { score: [1, 1] }; continue; }
      if (left-- > 0) {
        const S = startMatchday(g, f);
        doPreBriefing(g, S, 'calm', []);
        const M = kickOff(g, S);
        skip(S);
        if (S.step === 'break') { doHalfBriefing(g, S, 'demand', []); continueAfterBreak(S); skip(S); }
        while (S.step !== 'fulltime' && !M.ended && guard++ < 5000) skip(S);
        const post = finishMatchday(g, S);
        closeMatchday(g, S);
        user.push(matchDigest(M), post.result.score);
      } else applyResult(g, f, playQuick(g, f, rng), rng);
      continue;
    }
    if (a.kind === 'decide') { g.inbox = g.inbox.map((m) => ({ ...m, resolved: true })); continue; }
    continueUntilStop(g, { maxDays: 1 });
  }
  const comps = [...new Set(g.fixtures.map((f) => f.comp))].sort();
  const tables = comps.map((c) => [c, standings(g.fixtures.filter((f) => f.comp === c && f.played), [...new Set(g.fixtures.filter((f) => f.comp === c).flatMap((f) => [f.home, f.away]))])]);
  const results = g.fixtures.filter((f) => f.played).map((f) => [f.id, f.result?.score, f.result?.scorers ?? null]);
  const mine = squadOf(g.world, club).map((p) => [p.id, p.form, p.morale, p.fresh, p.sharp, p.ovr]);
  return { date: g.date, user, tables: h32(JSON.stringify(tables, num)), results: h32(JSON.stringify(results, num)), squad: h32(JSON.stringify(mine, num)), played: results.length };
}

export { h32 };
export const N_MATCHES = 210;
