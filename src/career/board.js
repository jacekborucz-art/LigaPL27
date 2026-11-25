// Zarząd i posada trenera (etap 9): cel sezonu, comiesięczna ocena (miejsce wobec celu, finanse, kibice, prasa),
// zaufanie 0-100, zwolnienie, oferty pracy z innych klubów, reputacja trenera.

import { Rng, clamp } from '../core/rng.js';
import { CLUBS_PL, clubById, leagueLabel } from '../data/clubs_pl.js';
import { compOfClub, compClubIds } from '../season/leagueComps.js';
import { COMPETITIONS } from '../config/competitions.js';
import { standings } from '../season/standings.js';
import { SEASON_YEAR } from '../config/calendar2026.js';
import { clubReputation } from './reputation.js';
import { pressBoardTerm } from '../match/press.js';
import { boardDeltaMul, fireThreshold, CAREER } from './coachCareer.js'; // reputacja i popularność trenera (docs/kariera-trenera.md)

/** Cel sezonu z siły kadry na tle ligi (ranking siły L; w III lidze na tle grupy). */
export function seasonGoalFor(club) {
  const rivals = CLUBS_PL.filter((c) => c.tier === club.tier && (club.tier !== 4 || c.group === club.group) && !c.parent).sort((a, b) => b.L - a.L);
  const rank = rivals.findIndex((c) => c.id === club.id) + 1;
  if (club.tier === 4) {
    if (rank <= 2) return { rank, target: 2, text: 'awans do 2 Ligi albo baraże o awans' };
    if (rank <= 5) return { rank, target: 4, text: 'miejsce w czołówce grupy' };
    if (rank <= 12) return { rank, target: 10, text: 'spokojny środek tabeli' };
    return { rank, target: 14, text: 'utrzymanie w III lidze' };
  }
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
export function goalText(tier, target, base) {
  if (tier === 4) return target <= 1 ? 'awans do 2 Ligi' : target <= 2 ? 'awans do 2 Ligi albo baraże o awans' : target <= 4 ? 'miejsce w czołówce grupy' : base.text;
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
  return { ...base, target, raised: true, text: lastTitle && target <= 2 ? 'obrona mistrzostwa Polski' : goalText(club.tier, club.tier === 4 ? target : Math.max(2, target), base) };
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
  const comp = compOfClub(clubById(clubId));
  if (!comp) return { pos: null, played: 0, size: 0 };
  const t = standings(game.fixtures.filter((f) => f.comp === comp), compClubIds(comp));
  const row = t.find((r) => r.id === clubId);
  return { pos: row?.pos ?? null, played: row?.played ?? 0, size: t.length };
}

/**
 * Miejsce klubu na koniec poprzedniego sezonu z archiwum (po zmianie sezonu bieżąca tabela jest pusta).
 * Szuka we wszystkich ligach, bo po awansie albo spadku klub gra już gdzie indziej. Zwraca { pos, tier, season } albo null.
 */
function lastSeasonPos(game, clubId) {
  const last = game.archive?.at(-1);
  if (!last) return null;
  for (const t of [1, 2, 3]) {
    const i = (last.tables?.[t] ?? []).findIndex((r) => r.id === clubId);
    if (i >= 0) return { pos: i + 1, tier: t, season: last.season };
  }
  for (const rows of Object.values(last.l3 ?? {})) {
    const i = rows.findIndex((r) => r.id === clubId);
    if (i >= 0) return { pos: i + 1, tier: 4, season: last.season };
  }
  return null;
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
  // Prasa: klimat w mediach z ostatniego miesiąca i relacje trenera z dziennikarzami (src/match/press.js) [SZAC]
  const press = pressBoardTerm(game.press, date);
  delta += press.delta;
  notes.push(...press.notes);
  delta = boardDeltaMul(game, delta); // znane nazwisko: cierpliwszy zarząd; trener lubiany przez kibiców: łagodniejsza ocena
  B.trust = Math.round(clamp(B.trust + delta, 0, 100));
  const review = { date, trust: B.trust, delta: Math.round(delta * 10) / 10, pos, notes };
  B.reviews.unshift(review); B.reviews.length = Math.min(B.reviews.length, 12);
  // Reputacja trenera zmienia się w karierze (src/career/coachCareer.js: forma miesiąca, wydarzenia sezonu), nie tutaj.
  // Próg zwolnienia zależy od popularności trenera u kibiców (12-22, przy 50: 18). Oferty pracy: src/career/jobMarket.js.
  const cur = game.manager?.career?.cur;
  const coachN = cur?.clubId === game.clubId ? cur.n : played; // nowy trener w trakcie sezonu: najpierw kilka meczów
  const fired = B.trust < fireThreshold(game.manager?.career?.pop?.fans) && date >= `${SEASON_YEAR}-10-01` && date <= `${SEASON_YEAR + 1}-04-30` && played >= 8 && coachN >= CAREER.board.newMatches;
  return { review, fired, offers: [], label: trustLabel(B.trust), club: club.name };
}

/** Kluby, które proponują pracę: po zwolnieniu niżej, przy dobrych wynikach wyżej niż obecny klub. */
export function jobOffers(game, date, afterFiring) {
  const rng = new Rng(`oferty-pracy:${game.seed}:${date}`);
  const rep = game.manager.rep;
  const cur = clubReputation(clubById(game.clubId));
  const cands = CLUBS_PL.filter((c) => !c.parent && c.tier <= 4 && c.id !== game.clubId && game.world.clubs[c.id]).map((c) => {
    const g = seasonGoalFor(c); const t = tablePos(game, c.id);
    return { c, rep: clubReputation(c), under: t.pos ? t.pos - g.target : 0 };
  });
  const pool = afterFiring
    ? cands.filter((x) => x.rep <= rep + 5 && x.under > 0)
    : cands.filter((x) => x.rep > cur + 4 && x.rep <= rep + 10 && x.under >= 3);
  let list = rng.shuffle(pool).sort((a, b) => b.under - a.under).slice(0, 3);
  if (afterFiring && !list.length) list = rng.shuffle(cands.filter((x) => x.c.tier === 3 || (x.c.tier === 4 && x.rep <= rep + 5))).slice(0, 2);
  return list.map((x) => ({ clubId: x.c.id, name: x.c.name, league: leagueLabel(x.c) }));
}

export { tablePos, lastSeasonPos, COMPETITIONS };
