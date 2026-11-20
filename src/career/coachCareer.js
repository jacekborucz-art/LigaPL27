// TYMCZASOWY STUB: ZASTĄPI logika z gałęzi kariery (src/career/coachCareer.js).
// Udostępnia kontrakt API używany przez widok Kariera (src/ui/careerView.js), z prostymi wartościami
// wyliczonymi z istniejącego zapisu (manager.rep, manager.seasons, manager.history, board).
// Przy scaleniu prawdziwy plik z gałęzi logiki zastępuje ten w całości.

import { clubById, leagueLabel, LEAGUE_NAMES } from '../data/clubs_pl.js';

export const BADGE_IDS = [
  'mp_ekstraklasa', 'mp_1liga', 'mp_2liga', 'mp_3liga', 'puchar_polski', 'superpuchar_polski',
  'liga_mistrzow', 'liga_europy', 'liga_konferencji', 'superpuchar_europy', 'awans', 'utrzymanie_beniaminek',
  'cel_ponad_plan', 'mecze_100', 'mecze_250', 'mecze_500', 'seria_bez_porazki', 'sensacja', 'trener_miesiaca', 'trener_sezonu',
];

/** Dopilnowuje struktury historii kariery w zapisie (stub: tylko miejsce na zalążek). */
export function ensureCareerHistory(game) {
  game.manager ??= {};
  game.manager.careerStub ??= { pending: [] };
  return game.manager.careerStub;
}

const REP_LABELS = [[75, 'Legenda trenerów'], [60, 'Wpływowy'], [45, 'Ceniony'], [30, 'Znany w lidze'], [15, 'Początkujący'], [0, 'Nieznany']];
const repLabel = (v) => REP_LABELS.find(([m]) => v >= m)[1];
const popLabel = (v) => (v >= 70 ? 'Uwielbiany' : v >= 50 ? 'Lubiany' : v >= 30 ? 'Obojętny' : 'Krytykowany');

const seasonRow = (s) => {
  const c = clubById(s.club);
  const goal = s.target != null ? `miejsce ${s.target} lub wyżej` : null;
  return {
    season: s.season, clubId: s.club, clubName: c?.name ?? s.club, league: LEAGUE_NAMES[s.tier] ?? '', pos: s.pos ?? null,
    round: null, goal, achieved: s.target == null || s.pos == null ? 'met' : s.pos < s.target ? 'exceeded' : s.pos === s.target ? 'met' : 'missed',
    trophies: [], promoted: false, relegated: false, fired: false, reconstructed: true,
  };
};

export function careerSummary(game) {
  const M = game.manager ?? {};
  const club = clubById(game.clubId);
  const p = M.profile;
  const name = p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Trener' : 'Trener';
  const unemployed = M.job?.status === 'unemployed';
  const rep = Math.round(M.rep ?? 0);
  const fans = Math.round(game.board?.fansMood ?? 50);
  const seasons = (M.seasons ?? []).map(seasonRow);
  const stints = (M.history ?? []).map((h) => ({ clubId: h.club, clubName: clubById(h.club)?.name ?? h.club, from: h.from, to: h.to ?? null, league: '', why: '', matches: null, trophies: [] }));
  const base = {
    name, age: p?.age ?? null,
    club: club && !unemployed ? { id: club.id, name: club.name, tier: club.tier, league: leagueLabel(club) } : null,
    unemployed,
    rep: { value: rep, label: repLabel(rep), trend: 0, reach: null, peak: rep, history: seasons.map((s) => ({ season: s.season, value: rep })) },
    pop: { fans, media: 50, fansLabel: popLabel(fans), mediaLabel: popLabel(50), trendFans: 0, trendMedia: 0, history: [] },
    matches: { n: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, ppm: 0 },
    seasons, trophies: [], badges: {}, records: [], stints, scars: [], repLog: [],
  };
  return { ...base, ...(M.careerStub?.summary ?? {}) }; // careerStub.summary: nadpisanie do testów wyglądu
}

/** Nowe odznaki do pokazania w oknie odblokowania (stub: z zapisu testowego). */
export function pendingUnlocks(game) {
  return game.manager?.careerStub?.pending ?? [];
}

export function markUnlocksSeen(game) {
  if (game.manager?.careerStub) game.manager.careerStub.pending = [];
}
