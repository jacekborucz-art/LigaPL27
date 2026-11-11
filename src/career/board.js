// Zarząd i posada trenera (etap 9): cel sezonu, comiesięczna ocena (miejsce wobec celu, finanse, kibice),
// zaufanie 0-100, zwolnienie, oferty pracy z innych klubów, reputacja trenera.

import { Rng, clamp } from '../core/rng.js';
import { CLUBS_PL, clubById, LEAGUE_NAMES } from '../data/clubs_pl.js';
import { COMPETITIONS } from '../config/competitions.js';
import { standings } from '../season/standings.js';
import { SEASON_YEAR } from '../config/calendar2026.js';
import { clubReputation } from './reputation.js';

const TIER_COMP = { 1: 'ekstraklasa', 2: 'liga1', 3: 'liga2' };

/** Cel sezonu z siły kadry na tle ligi (ranking siły L). */
export function seasonGoalFor(club) {
  const rivals = CLUBS_PL.filter((c) => c.tier === club.tier && !c.parent).sort((a, b) => b.L - a.L);
  const rank = rivals.findIndex((c) => c.id === club.id) + 1;
  if (club.tier === 1) {
    if (rank <= 3) return { rank, target: 3, text: 'walka o mistrzostwo Polski' };
    if (rank <= 6) return { rank, target: 6, text: 'miejsce dające grę w europejskich pucharach' };
    if (rank <= 12) return { rank, target: 12, text: 'spokojne miejsce w środku tabeli' };
    return { rank, target: 15, text: 'utrzymanie w Ekstraklasie' };
  }
  if (rank <= 3) return { rank, target: 2, text: club.tier === 2 ? 'awans do Ekstraklasy' : 'awans do 1 Ligi' };
  if (rank <= 8) return { rank, target: 6, text: 'miejsce w strefie baraży o awans' };
  if (rank <= 14) return { rank, target: 14, text: 'spokojny środek tabeli' };
  return { rank, target: 15, text: 'utrzymanie w lidze' };
}

const GOAL_TEXT = {
  1: [[1, 'obrona mistrzostwa Polski'], [3, 'walka o mistrzostwo Polski'], [6, 'miejsce dające grę w europejskich pucharach'], [12, 'spokojne miejsce w środku tabeli'], [99, 'utrzymanie w Ekstraklasie']],
};
function goalText(tier, target, base) {
  if (tier !== 1) return target <= 2 ? (tier === 2 ? 'awans do Ekstraklasy' : 'awans do 1 Ligi') : target <= 6 ? 'miejsce w strefie baraży o awans' : base.text;
  return GOAL_TEXT[1].find(([t]) => target <= t)[1];
}

/**
 * Cel sezonu z historią trenera w klubie (organiczna trudność, docs/balans.md): po sezonie wyraźnie ponad stan
 * zarząd i kibice oczekują więcej. Cel przesuwa się w połowie drogi do miejsca z poprzedniego sezonu w tej samej lidze.
 * Trener, który kończy w okolicy celu, dostaje zwykły cel z siły kadry.
 */
export function boardGoal(game, club) {
  const base = seasonGoalFor(club);
  const last = (game.manager?.seasons ?? []).filter((x) => x.club === club.id && x.tier === club.tier).at(-1);
  if (!last?.pos || last.pos >= base.target - 1) return base;
  const target = Math.max(1, Math.round((base.target + last.pos) / 2));
  const lastTitle = club.tier === 1 && last.pos === 1;
  return { ...base, target, raised: true, text: lastTitle && target <= 2 ? 'obrona mistrzostwa Polski' : goalText(club.tier, Math.max(2, target), base) };
}

export function ensureBoard(game) {
  const club = clubById(game.clubId);
  game.board = { trust: 60, fansMood: 55, ...(game.board ?? {}) };
  if (!game.board.goal || game.board.goalClub !== game.clubId) { game.board.goal = seasonGoalFor(club); game.board.goalClub = game.clubId; }
  game.board.reviews = game.board.reviews ?? [];
  // Nowa gra może mieć już manager.profile (imię, nazwisko, narodowość, wiek z kreatora): uzupełniamy brakujące pola
  const M = game.manager ?? {};
  if (M.rep == null || !M.history || M.fired == null) {
    game.manager = { rep: Math.round(clubReputation(club) * 0.6), history: [{ club: game.clubId, from: game.date }], fired: 0, ...M };
  }
  return game.board;
}

function tablePos(game, clubId) {
  const club = clubById(clubId);
  const comp = TIER_COMP[club.tier];
  const t = standings(game.fixtures.filter((f) => f.comp === comp), CLUBS_PL.filter((c) => c.tier === club.tier).map((c) => c.id));
  const row = t.find((r) => r.id === clubId);
  return { pos: row?.pos ?? null, played: row?.played ?? 0, size: t.length };
}

export const trustLabel = (t) => (t >= 75 ? 'Pełne zaufanie' : t >= 55 ? 'Zadowolony' : t >= 40 ? 'Cierpliwy' : t >= 25 ? 'Zaniepokojony' : 'Na krawędzi');

/**
 * Comiesięczna ocena zarządu. Zwraca { review, fired, offers } (oferty = kluby proponujące pracę).
 */
export function boardMonth(game, date) {
  const B = ensureBoard(game);
  const club = clubById(game.clubId);
  const { pos, played } = tablePos(game, game.clubId);
  const fin = game.finance?.clubs?.[game.clubId];
  let delta = 0; const notes = [];
  if (played >= 4 && pos) {
    const diff = B.goal.target - pos;
    delta += clamp(diff * 1.1, -7, 6);
    notes.push(diff >= 0 ? `Drużyna jest na ${pos}. miejscu, zgodnie z celem (${B.goal.text}).` : `Drużyna jest na ${pos}. miejscu, poniżej celu (${B.goal.text}).`);
  }
  if (fin) {
    if (fin.balance < 0) { delta -= 4; notes.push('Klub ma ujemne saldo. Zarząd oczekuje oszczędności.'); }
    else if (fin.balance > fin.start * 1.1) { delta += 1; notes.push('Finanse są w dobrym stanie.'); }
  }
  delta += clamp((B.fansMood - 55) * 0.06, -3, 3);
  if (B.fansMood < 35) notes.push('Kibice są coraz bardziej niezadowoleni.');
  B.trust = Math.round(clamp(B.trust + delta, 0, 100));
  const review = { date, trust: B.trust, delta: Math.round(delta * 10) / 10, pos, notes };
  B.reviews.unshift(review); B.reviews.length = Math.min(B.reviews.length, 12);
  const M = game.manager;
  M.rep = Math.round(clamp(M.rep + (B.trust - 55) * 0.02 + (pos && pos <= 3 && played >= 8 ? 0.4 : 0), 5, 95) * 10) / 10;
  const fired = B.trust < 18 && date >= `${SEASON_YEAR}-10-01` && date <= `${SEASON_YEAR + 1}-04-30` && played >= 8;
  let offers = [];
  if (fired) { M.fired++; offers = jobOffers(game, date, true); }
  else if (new Rng(`praca:${game.seed}:${date}`).chance(0.12)) offers = jobOffers(game, date, false);
  return { review, fired, offers, label: trustLabel(B.trust), club: club.name };
}

/** Kluby, które proponują pracę: po zwolnieniu niżej, przy dobrych wynikach wyżej niż obecny klub. */
export function jobOffers(game, date, afterFiring) {
  const rng = new Rng(`oferty-pracy:${game.seed}:${date}`);
  const rep = game.manager.rep;
  const cur = clubReputation(clubById(game.clubId));
  const cands = CLUBS_PL.filter((c) => !c.parent && c.tier <= 3 && c.id !== game.clubId && game.world.clubs[c.id]).map((c) => {
    const g = seasonGoalFor(c); const t = tablePos(game, c.id);
    return { c, rep: clubReputation(c), under: t.pos ? t.pos - g.target : 0 };
  });
  const pool = afterFiring
    ? cands.filter((x) => x.rep <= rep + 5 && x.under > 0)
    : cands.filter((x) => x.rep > cur + 4 && x.rep <= rep + 10 && x.under >= 3);
  let list = rng.shuffle(pool).sort((a, b) => b.under - a.under).slice(0, 3);
  if (afterFiring && !list.length) list = rng.shuffle(cands.filter((x) => x.c.tier === 3)).slice(0, 2);
  return list.map((x) => ({ clubId: x.c.id, name: x.c.name, league: LEAGUE_NAMES[x.c.tier] }));
}

export { tablePos, COMPETITIONS };
