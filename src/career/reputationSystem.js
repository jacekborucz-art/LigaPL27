// Dynamiczna reputacja zawodników i klubów (docs/reputacja.md). Raz w miesiącu każdy zawodnik zbliża się do celu
// z OVR, roli (minuty), formy, kadry, trofeów i pucharów, ograniczonego „sceną” klubu (liga, renoma europejska,
// marka krajowa). Raz w roku (koniec sezonu) kluby dostają punkty UEFA (P5) i nową markę krajową z wyników.
// Ten sam wzór dla zawodników gracza i AI. Liczby [SZAC] w src/career/reputation.js (REP).
//
// Zapis: game.repState = { v, lastMonth, clubPts: { klub: [punkty UEFA 5 ostatnich sezonów, od najnowszego] },
//   brand: { klub: odchylenie marki krajowej od prestiżu i ligi }, games: { klub: mecze o punkty w minionym sezonie } }
// Pola zawodnika: p.rep (0,1 dokładności), p.repD (zmiana w ostatnim miesiącu), p.repY (reputacja na start sezonu),
//   p.repEv (zdarzenia miesiąca, kasowane przy aktualizacji), p.tro ([[rok sezonu, punkty trofeów]]), p.rs (scena
//   zawodnika bez polskiego klubu, z generatora), p.intl.tn (turnieje finałowe z występem).

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { GAME_START, SEASON_YEAR } from '../config/calendar2026.js';
import { knownClub } from '../season/leagues.js';
import { ntTeam } from '../season/national.js';
import { uefaClub, clubPath, UCOMPS } from '../season/uefa.js';
import { seasonGoalFor } from './board.js';
import {
  clubStage, clubBaseReputation, startClubPoints, euroRenown, clubP5, targetReputationV2, stepReputation, roleShare,
  reputationLabel, addRepEvent, REP_LEVELS, TROPHY_PTS, TROPHY_W, LEAGUE_VIS, REP,
} from './reputation.js';

const seasonId = (y) => `${y}/${String(y + 1).slice(2)}`;
const CLUB_G = ['L', 'P', 'E'];
const BIG_JUMP = 5; // wiadomość dla gracza: zmiana o 5 punktów w miesiącu albo nowy poziom
const MATCH_K = 3; // pseudo-mecze przy udziale minut (mało danych: rola z miejsca w kadrze) [SZAC]

/** Stan reputacji w zapisie (wzorzec ensureX: stare zapisy dostają stan bez zmiany p.rep). */
export function ensureReputation(game) {
  if (!game?.world) return null;
  const R = (game.repState ??= { v: 1, lastMonth: (game.date ?? GAME_START).slice(0, 7), clubPts: {}, brand: {}, games: {} });
  R.clubPts ??= {}; R.brand ??= {}; R.games ??= {}; R.lvl ??= {};
  if (!R.seeded) {
    // Renoma europejska na start: punkty z danych rozłożone równo na 5 sezonów (z czasem wypierane przez wyniki)
    for (const c of CLUBS_PL) {
      const pts = startClubPoints(c);
      if (pts > 0 && !R.clubPts[c.id]) R.clubPts[c.id] = Array(5).fill(Math.round((pts / 5) * 100) / 100);
    }
    R.seeded = true;
  }
  return R;
}

// ------------------------------------------------------------ Marka krajowa klubów
const touched = new Set();
/** Nakłada markę krajową z zapisu na obiekty klubów (club.rep); wywoływane przy wczytaniu i przełomie sezonu. */
export function applyClubRep(game) {
  for (const c of touched) delete c.rep;
  touched.clear();
  for (const [id, d] of Object.entries(game?.repState?.brand ?? {})) {
    const c = knownClub(id);
    if (!c || !d) continue;
    c.rep = Math.round(clamp(clubBaseReputation(c) + d, 1, 100));
    touched.add(c);
  }
}

// ------------------------------------------------------------ Scena zawodnika
function abroadClub(a) {
  const u = a.clubId ? uefaClub(a.clubId) : null;
  return { id: a.clubId ?? 'zagranica', foreign: true, L: a.league ?? u?.L ?? 12, rep: a.rep ?? (u ? Math.min(100, u.prestige * 7 + 25) : undefined), prestige: u?.prestige ?? 3, coef: u?.coef };
}

/** Scena, na której zawodnik jest widoczny: obecny klub, klub zagraniczny, a bez klubu ostatni klub. */
export function playerStage(game, p) {
  const c = p.clubId ? clubById(p.clubId) : null;
  if (c) return clubStage(c, game);
  if (p.abroad) return clubStage(abroadClub(p.abroad), game);
  const last = p.cl?.length ? clubById(p.cl[p.cl.length - 1].c) : null;
  if (last) return clubStage(last, game);
  return p.rs ?? LEAGUE_VIS[4];
}

// ------------------------------------------------------------ Dane wejściowe zawodnika
const blank = () => [0, 0, 0, 0, 0, 0, 0, 0];
function addInto(out, a, w = 1) { if (a) for (let i = 0; i < out.length; i++) out[i] += (a[i] ?? 0) * w; }

/** Mecze o punkty rozegrane przez kluby w bieżącym sezonie (bez sparingów). */
function clubGames(game) {
  const out = {};
  for (const f of game.fixtures ?? []) {
    if (!f.played || f.comp === 'friendly') continue;
    out[f.home] = (out[f.home] ?? 0) + 1;
    if (f.away) out[f.away] = (out[f.away] ?? 0) + 1;
  }
  return out;
}

/** Oczekiwany udział minut z miejsca w kadrze po OVR (akademia 0). */
function rolePriors(game) {
  const out = {};
  for (const [cid, club] of Object.entries(game.world.clubs)) {
    club.squad.map((id) => game.world.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).forEach((p, i) => { out[p.id] = roleShare(i); });
  }
  return out;
}

/**
 * Wejście do targetReputationV2 z bieżącego sezonu (p.st) i poprzedniego (ostatni wiersz p.history, waga
 * (12 - miesiące sezonu) / 12), czyli okno ok. 12 miesięcy; kadra i puchary z 24 miesięcy.
 */
export function reputationInput(game, p, { k, games, prevGames, priors, S }) {
  const y = SEASON_YEAR;
  const w1 = (12 - k) / 12;
  const h = p.history ?? [];
  const r1 = h.length && h[h.length - 1].s === seasonId(y - 1) ? h[h.length - 1] : null;
  const r2row = h.find((r) => r.s === seasonId(y - 2)) ?? null;
  const st = p.st ?? {};
  const cur = blank(); const prev = blank();
  for (const g of CLUB_G) { addInto(cur, st[g]); addInto(prev, r1?.x?.[g]); }
  const mins = cur[1] + w1 * prev[1];
  const g90 = cur[2] + cur[3] + w1 * (prev[2] + prev[3]);
  const nR = cur[5] + w1 * prev[5];
  const avg = nR > 0 ? (cur[4] + w1 * prev[4]) / 10 / nR : null;
  const nGames = (p.clubId ? games[p.clubId] ?? 0 : 0) + (r1 ? w1 * (prevGames[r1.c] ?? 34) : 0);
  const m0 = p.squad === 'Y' || !p.clubId ? 0 : priors[p.id] ?? 0.4;
  const m = Math.min(1, (mins / 90 + MATCH_K * m0) / (nGames + MATCH_K));
  const app = (row, g) => row?.x?.[g]?.[0] ?? 0;
  const recentCaps = (st.R?.[0] ?? 0) + app(r1, 'R') + w1 * app(r2row, 'R');
  const euroApps = (st.E?.[0] ?? 0) + app(r1, 'E') + w1 * app(r2row, 'E');
  let troph = 0;
  for (const [yr, pts] of p.tro ?? []) troph += pts * (TROPHY_W[y - yr - 1] ?? 0);
  const ntL = recentCaps >= 3 ? ntTeam(p.intl?.team ?? p.nat)?.L ?? null : null;
  return {
    ovr: p.ovr, age: p.age, pos: p.pos, m, avg, n: nR, ga90: mins > 0 ? g90 / (mins / 90) : null, min: mins,
    caps: p.intl?.caps ?? 0, recentCaps, tourn: p.intl?.tn ?? 0, troph, euroApps, S, ntL,
  };
}

// ------------------------------------------------------------ Miesięczna aktualizacja
/** Aktualizacja reputacji wszystkich zawodników. Zwraca zmiany w kadrze gracza (do wiadomości). */
export function monthlyReputation(game, date) {
  const R = ensureReputation(game);
  const month = date.slice(0, 7);
  const rng = new Rng(`rep:${game.seed}:${month}`);
  const k = (Number(month.slice(5)) + 5) % 12; // miesiące bieżącego sezonu (lipiec 0, czerwiec 11)
  const ctx = { k, games: clubGames(game), prevGames: R.games, priors: rolePriors(game) };
  const mine = new Set(game.world.clubs[game.clubId]?.squad ?? []);
  const changes = [];
  const W = game.world.players;
  for (const id of Object.keys(W)) {
    const p = W[id];
    if (!p || p.ovr == null) continue;
    const S = playerStage(game, p);
    const { t } = targetReputationV2(reputationInput(game, p, { ...ctx, S }));
    const old = p.rep ?? t;
    const ev = p.repEv ?? 0;
    delete p.repEv;
    p.rep = stepReputation(old, t, ev, S, rng.gauss(0, REP.noise));
    const d = Math.round((p.rep - old) * 10) / 10;
    if (d) p.repD = d; else delete p.repD;
    if (k === 0 || p.repY == null) p.repY = k === 0 ? p.rep : old;
    if (!mine.has(id)) continue;
    // Wiadomość: skok o 5 punktów albo nowy poziom (co najmniej 1 punkt za progiem, żeby nie migało na granicy)
    const lvl = levelIndex(p.rep);
    const known = R.lvl[id] ?? levelIndex(old);
    const past = Math.abs(p.rep - REP_LEVELS[lvl].min) >= 1 && (lvl === 0 || Math.abs(p.rep - REP_LEVELS[lvl - 1].min) >= 1);
    const newLevel = lvl !== known && past;
    if (newLevel || lvl === known) R.lvl[id] = lvl;
    if (newLevel || Math.abs(Math.round(p.rep) - Math.round(old)) >= BIG_JUMP) changes.push({ p, old, newLevel });
  }
  for (const id of Object.keys(R.lvl)) if (!mine.has(id)) delete R.lvl[id];
  return changes;
}

const levelIndex = (r) => REP_LEVELS.findIndex((l) => r >= l.min);
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
function changeMessage(game, date, changes) {
  const lines = changes.sort((a, b) => b.p.rep - a.p.rep).map(({ p, old, newLevel }) => {
    const to = reputationLabel(p.rep);
    const diff = Math.round(p.rep) - Math.round(old);
    const sign = diff > 0 ? `+${diff}` : String(diff);
    return newLevel
      ? `${p.name}: ${p.rep > old ? 'awans na poziom' : 'spadek na poziom'} „${lc(to)}” (reputacja ${Math.round(p.rep)}).`
      : `${p.name}: reputacja ${Math.round(p.rep)} (${sign} w miesiącu).`;
  });
  return createMessage({
    date, key: `rep:${date.slice(0, 7)}`, category: 'staff', from: 'Asystent trenera', priority: 'info',
    subject: changes.length === 1 ? `Reputacja: ${changes[0].p.name}` : `Reputacja zawodników: ${changes.length} wyraźne zmiany`,
    body: `${lines.join('\n')}\n\nReputacja rośnie z grą w podstawie, formą, występami w kadrze, trofeami i pucharami. Wpływa na żądania płacowe, ceny i oferty innych klubów.`,
  });
}

// ------------------------------------------------------------ Koniec sezonu
/** Punkty UEFA klubu w sezonie: wygrana 2, remis 1 (eliminacje połowa) + faza ligowa LM 4, LE 2, LK 1, runda pucharowa +1. */
export function seasonUefaPoints(U, clubId) {
  if (!U) return 0;
  let pts = 0;
  for (const m of Object.values(U.matches ?? {})) {
    if (!m.played || !m.result?.score || (m.home !== clubId && m.away !== clubId)) continue;
    const q = ['Q1', 'Q2', 'Q3', 'PO'].includes(m.round);
    const [a, b] = m.home === clubId ? m.result.score : [m.result.score[1], m.result.score[0]];
    pts += a > b ? (q ? 1 : 2) : a === b ? (q ? 0.5 : 1) : 0;
  }
  const BONUS = { LM: 4, LE: 2, LK: 1 };
  for (const x of clubPath(U, clubId)) {
    if (x.round === 'league') pts += BONUS[x.comp] ?? 0;
    else if (['KPO', 'R16', 'QF', 'SF', 'F'].includes(x.round)) pts += 1;
  }
  return pts;
}

/**
 * Przełom sezonu (z rolloverSeason, przed archiwizacją statystyk i zmianą lig): mecze klubów, punkty P5,
 * marka krajowa, trofea i zdarzenia zawodników (mistrzostwo, król strzelców, spadek).
 */
export function reputationSeasonEnd(game, res, moves) {
  const R = ensureReputation(game);
  const W = game.world;
  const year = SEASON_YEAR; // sezon kończący się
  R.games = clubGames(game);
  // Renoma europejska (P5)
  const U = game.season?.uefa;
  for (const c of CLUBS_PL) {
    if (!W.clubs[c.id]) continue;
    const pts = seasonUefaPoints(U, c.id);
    const arr = R.clubPts[c.id];
    if (!arr && !pts) continue;
    R.clubPts[c.id] = [pts, ...(arr ?? [])].slice(0, 5);
    if (!R.clubPts[c.id].some((x) => x)) delete R.clubPts[c.id];
  }
  // Marka krajowa: miejsce wobec oczekiwań (ranking siły w lidze), trofea, renoma europejska
  const champion = res.tables?.[1]?.[0] ?? null;
  const cup = res.cup?.winner ?? null;
  for (const c of CLUBS_PL) {
    if (c.parent || !W.clubs[c.id]) continue;
    const table = c.tier === 4 ? res.groupTables?.[c.group] : res.tables?.[c.tier];
    const pos = (table ?? []).indexOf(c.id) + 1;
    if (!pos) continue;
    const exp = seasonGoalFor(c).rank || pos;
    const term = clamp(0.8 * (exp - pos) + (c.id === champion ? 4 : 0) + (c.id === cup ? 2 : 0) + 0.3 * euroRenown(clubP5(c, game)), -10, 12);
    const d = (R.brand[c.id] ?? 0) + 0.25 * (term - (R.brand[c.id] ?? 0));
    if (Math.abs(d) >= 0.05) R.brand[c.id] = Math.round(d * 100) / 100; else delete R.brand[c.id];
  }
  // Trofea i zdarzenia zawodników (tylko ci, którzy grali w sezonie o punkty)
  const played = (p) => CLUB_G.some((g) => (p.st?.[g]?.[0] ?? 0) > 0);
  const squad = (id) => (W.clubs[id]?.squad ?? []).map((x) => W.players[x]).filter((p) => p && played(p));
  const award = (id, pts) => { for (const p of squad(id)) { p.tro = [...(p.tro ?? []).filter(([yr]) => year - yr < 3), [year, pts]]; } };
  if (champion) { award(champion, TROPHY_PTS.champion); for (const p of squad(champion)) addRepEvent(p, 'title'); }
  if (cup && W.clubs[cup]) award(cup, TROPHY_PTS.cup);
  for (const comp of UCOMPS) { const w = res.uefa?.[comp]; if (w && W.clubs[w]) award(w, TROPHY_PTS[comp]); }
  for (const t of [1, 2, 3, 4]) {
    let best = null; let tie = false;
    for (const c of CLUBS_PL.filter((x) => x.tier === t)) for (const p of squad(c.id)) {
      const g = p.st?.L?.[2] ?? 0;
      if (!best || g > best.g) { best = { p, g }; tie = false; } else if (g === best.g) tie = true;
    }
    if (best && best.g >= 5 && !tie) addRepEvent(best.p, 'topScorer');
  }
  for (const list of Object.values(moves?.relegated ?? {})) for (const id of list ?? []) for (const p of squad(id)) addRepEvent(p, 'relegated');
}

/** Transfer do większej sceny: + 0,25 x różnica scen (0-4). Wywoływane przy zgłoszeniu transferu. */
export function moveRepEvent(game, p, S0) {
  const S1 = playerStage(game, p);
  const v = clamp(0.25 * (S1 - S0), 0, 4);
  if (v > 0) addRepEvent(p, 'move', v);
}

// ------------------------------------------------------------ System dnia
export const REPUTATION_SYSTEM = {
  id: 'reputation', order: 96, // po treningu (95), który robi miesięczny rozwój OVR
  run(game, date) {
    if (!game?.world || !game.clubId) return {};
    const R = ensureReputation(game);
    const month = date.slice(0, 7);
    if (R.lastMonth === month) return {};
    R.lastMonth = month;
    const changes = monthlyReputation(game, date);
    return changes.length ? { messages: [changeMessage(game, date, changes)] } : {};
  },
};
registerDailySystem(REPUTATION_SYSTEM);
