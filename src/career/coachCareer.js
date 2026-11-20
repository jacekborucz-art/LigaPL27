// Kariera trenera (docs/kariera-trenera.md): reputacja z wydarzeń (punkty x nasycenie x próg ligi, kary, forma
// miesiąca, zanik do 0,6 szczytu), popularność u kibiców i w mediach, historia sezonów, trofea (zasada 12 meczów),
// rekordy, okresy pracy w klubach, odznaki (20) i blizny (spadki, zwolnienia, rezygnacje: tylko tekst).
// Te same punkty wydarzeń dostają trenerzy AI na koniec sezonu (coach.rep, parytet). Wszystkie liczby [SZAC].
//
// Zapis: game.manager.career = { v, seasons, trophies, awards, records, stints, scars, rep, pop, tot, run, cur, mon,
//   seen, press, lastSuccess, reconstructed }. Wartość reputacji to nadal game.manager.rep (zgodność ze starym kodem).

import { clamp } from '../core/rng.js';
import { clubById, leagueLabel, LEAGUE_NAMES } from '../data/clubs_pl.js';
import { compOfClub, compClubIds, LEAGUE_COMPS } from '../season/leagueComps.js';
import { standings } from '../season/standings.js';
import { anyClub } from '../season/season.js';
import { winnerOf, isDecider, tieWinner } from '../season/cup.js';
import { SEASON } from '../config/calendar2026.js';
import { clubReputation } from './reputation.js';
import { expectedPoints, rivalry } from './fans.js';
import { seasonGoalFor } from './board.js';
import { createMessage } from '../core/inbox.js';
import { coachAvg } from './coaches.js';
import { fmtDate } from '../ui/dom.js';

// ------------------------------------------------------------ Liczby [SZAC]
export const CAREER = {
  caps: { 1: 85, 2: 62, 3: 48, 4: 35, 5: 35 }, // próg miękki reputacji wg poziomu ligi klubu
  over: 0.25, // nad progiem zostaje 25 % przyrostu
  ev: {
    title: { 1: 9, 2: 2, 3: 1.5, 4: 1 }, // mistrz ligi (III liga: mistrz grupy)
    promo: { 1: 6, 2: 5, 3: 4, 4: 3 }, // awans DO ligi o tym numerze
    pp: 4, super: 1.5, LM: 16, LE: 11, LK: 8, SEU: 3, ppFinalLost: 1.5,
    stage: { league: 1.5, KPO: 1.5, R16: 2.5, QF: 4, SF: 6, F: 8 }, stageMul: { LM: 1, LE: 0.7, LK: 0.5 }, qual: 0.5, qualMax: 2,
    goalMet: 1, perPlace: 0.6, perPlaceMax: 4, underdogStay: 2.5,
    upsetWin: 0.35, upsetDraw: 0.15, upsetCap: 3, cupUpset: 0.5, derbyWin: 0.15, shockLoss: -0.25, shockCap: -2,
  },
  pen: { relegFav: 8, relegDog: 4, fired: 6, firedEarly: 3, earlyMatches: 8, belowFrom: 5, perBelow: 0.5, belowMax: 5, cupOut2: 2, cupOut1: 0.8, euroOut: 1.5, resign: 3 },
  form: { ref: 1.4, w: 0.5, max: 0.6, minMatches: 3 },
  decay: { floor: 0.6, idleMonths: 12, idle: 0.15, jobless: 0.4, joblessMonths: 6 },
  pop: { carry: 0.35, moodW: 0.04, run5w: 1.2, run5l: -1.5, derby: 1.2, flair: 0.4, flairFans: 0.5, flairMedia: 0.3, press: 0.3, walkout: -2, loyalFrom: 12, loyal: 0.25, loyalMax: 12, champion: [4, 3], cup: [2, 2], promo: [1, 1], releg: [-8, -5], massApply: -2, leftEarly: -8 },
  // Zaufanie na start: 55 jak dawniej przy trenerze na poziomie klubu (projekt: 45, korekta kalibracji),
  // zwolnienie dopiero po 6 meczach trenera w klubie w sezonie (nowy trener w trakcie sezonu)
  // Cierpliwość: neutralna, gdy reputacja trenera odpowiada klubowi (rep = 0,6 x reputacja klubu), więc odsetek
  // zwolnień bez zmian wobec dawnego modelu; trener ponad klub dostaje więcej czasu, poniżej mniej
  board: { trust0: 55, trustW: 0.25, trustMin: 45, trustMax: 75, newMatches: 6, patBase: 1, patW: 0.01, patMin: 0.8, patMax: 1.15, fansCalm: 70, fansCalmMul: 0.9, fireBase: 18, fireW: 0.06, fireMin: 12, fireMax: 22 },
  trophyMatches: 12, // trofeum liczy się po co najmniej 12 meczach o stawkę z klubem w sezonie (superpuchary: wystarczy prowadzić mecz)
  // Kalibracja: premie startowe ligi 9/5/1/-3 (projekt: 6/3/0/-3), bez zaniku na sezon (projekt -1,8: średnie spadały o 5-8 w 8 sezonach)
  ai: { start: { 1: 9, 2: 5, 3: 1, 4: -3 }, startW: 6, startRef: 4, seasonDecay: 0, idleMonth: 0.4, hireW: 0.04 },
  min: 5, // reputacja gracza nie spada poniżej 5 (jak dawniej w board.js)
};

export const BADGE_IDS = ['mp_ekstraklasa', 'mp_1liga', 'mp_2liga', 'mp_3liga', 'puchar_polski', 'superpuchar_polski', 'liga_mistrzow', 'liga_europy',
  'liga_konferencji', 'superpuchar_europy', 'awans', 'utrzymanie_beniaminek', 'cel_ponad_plan', 'mecze_100', 'mecze_250', 'mecze_500',
  'seria_bez_porazki', 'sensacja', 'trener_miesiaca', 'trener_sezonu'];
/** Odznaki będące trofeami (gablota, tabela trofeów). */
export const TROPHY_BADGES = new Set(['mp_ekstraklasa', 'mp_1liga', 'mp_2liga', 'mp_3liga', 'puchar_polski', 'superpuchar_polski', 'liga_mistrzow', 'liga_europy', 'liga_konferencji', 'superpuchar_europy']);
const TITLE_BADGE = { 1: 'mp_ekstraklasa', 2: 'mp_1liga', 3: 'mp_2liga', 4: 'mp_3liga' };
const UEFA_BADGE = { LM: 'liga_mistrzow', LE: 'liga_europy', LK: 'liga_konferencji', SEU: 'superpuchar_europy' };
const COMP_OF_BADGE = { mp_ekstraklasa: 'ekstraklasa', mp_1liga: 'liga1', mp_2liga: 'liga2', mp_3liga: 'liga3', puchar_polski: 'pp', superpuchar_polski: 'super', liga_mistrzow: 'LM', liga_europy: 'LE', liga_konferencji: 'LK', superpuchar_europy: 'superEU' };
export const BADGE_NAMES = {
  mp_ekstraklasa: 'Mistrzostwo Polski', mp_1liga: 'Mistrz 1 Ligi', mp_2liga: 'Mistrz 2 Ligi', mp_3liga: 'Mistrz III ligi', puchar_polski: 'Puchar Polski',
  superpuchar_polski: 'Superpuchar Polski', liga_mistrzow: 'Liga Mistrzów', liga_europy: 'Liga Europy', liga_konferencji: 'Liga Konferencji',
  superpuchar_europy: 'Superpuchar Europy', awans: 'Awans', utrzymanie_beniaminek: 'Utrzymanie beniaminka', cel_ponad_plan: 'Cel ponad plan',
  mecze_100: '100 meczów', mecze_250: '250 meczów', mecze_500: '500 meczów', seria_bez_porazki: 'Seria bez porażki', sensacja: 'Sensacja',
  trener_miesiaca: 'Trener miesiąca', trener_sezonu: 'Trener sezonu',
};
const MATCH_MILESTONES = [[100, 'mecze_100'], [250, 'mecze_250'], [500, 'mecze_500']];

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const nameOf = (id) => anyClub(id)?.name ?? clubById(id)?.name ?? id ?? '';
const tierOf = (id) => clubById(id)?.tier ?? anyClub(id)?.tier ?? 4;
const seasonKey = (game) => game.season?.seasonId ?? SEASON;
const isLeague = (comp) => LEAGUE_COMPS.includes(comp) || String(comp).startsWith('playoff');
const competitive = (f) => f && f.comp !== 'friendly' && f.comp !== 'NT' && f.home && f.away;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const addDaysIso = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const unemployed = (game) => game?.manager?.job?.status === 'unemployed';

// ------------------------------------------------------------ Etykiety
export const COACH_REP_LEVELS = [
  [85, 'Trener światowej klasy'], [70, 'Znany w Europie'], [55, 'Czołówka w Polsce'], [40, 'Znany w Polsce'], [25, 'Znany w regionie'], [0, 'Anonimowy'],
];
export const coachRepLabel = (r) => COACH_REP_LEVELS.find(([m]) => (r ?? 0) >= m)[1];
export const fansLabel = (v) => (v >= 80 ? 'Idol kibiców' : v >= 65 ? 'Lubiany' : v >= 45 ? 'Akceptowany' : v >= 30 ? 'Krytykowany' : 'Nielubiany');
export const mediaLabel = (v) => (v >= 80 ? 'Gwiazda mediów' : v >= 65 ? 'Medialny' : v >= 45 ? 'Rozpoznawalny' : v >= 30 ? 'Mało znany' : 'Nieobecny w mediach');
/** Zasięg trenera: kluby o reputacji do rep / 0,6 są osiągalne. */
export const reachOf = (rep) => r1((rep ?? 0) / 0.6);

// ------------------------------------------------------------ Model reputacji (wspólny dla gracza i AI)
export const repSat = (rep) => clamp(1.1 - rep / 100, 0.25, 1);
export const repCap = (tier) => CAREER.caps[tier] ?? CAREER.caps[4];

/**
 * Przyrost z wydarzenia: pts x nasycenie, powyżej progu ligi tylko 25 % nadwyżki (bez progu: trofea i Europa).
 * Zwraca nową reputację (0-100).
 */
export function repGain(rep, pts, tier, { noCap = false } = {}) {
  const g = pts * repSat(rep);
  if (noCap) return clamp(rep + g, 0, 100);
  const cap = repCap(tier);
  if (rep >= cap) return clamp(rep + g * CAREER.over, 0, 100);
  if (rep + g <= cap) return clamp(rep + g, 0, 100);
  return clamp(cap + (rep + g - cap) * CAREER.over, 0, 100);
}
/** Kara: bez nasycenia, większa marka traci więcej (x 0,6 + rep/100). */
export const repLoss = (rep, pts) => clamp(rep - pts * (0.6 + rep / 100), 0, 100);

// ------------------------------------------------------------ Zarząd i popularność (efekty)
const B = CAREER.board;
/** Zaufanie zarządu na start w nowym klubie: znane nazwisko dostaje więcej kredytu. */
export const boardStartTrust = (rep, clubRep) => Math.round(clamp(B.trust0 + B.trustW * (rep - 0.6 * clubRep), B.trustMin, B.trustMax));
/** Mnożnik ujemnych ocen zarządu (cierpliwość wobec marki trenera na tle klubu). */
export const patienceMul = (rep, clubRep) => clamp(B.patBase - B.patW * (rep - 0.6 * clubRep), B.patMin, B.patMax);
/** Próg zaufania, poniżej którego zarząd zwalnia (kibice-sympatycy chronią trenera). */
export const fireThreshold = (fans) => clamp(B.fireBase - B.fireW * ((fans ?? 50) - 50), B.fireMin, B.fireMax);
/** Ujemna zmiana zaufania w miesiącu po uwzględnieniu reputacji i popularności. */
export function boardDeltaMul(game, delta) {
  if (delta >= 0) return delta;
  const C = game.manager?.career;
  const fans = C?.pop?.fans ?? 50;
  const club = clubById(game.clubId);
  const rep = game.manager?.rep ?? 30;
  return delta * patienceMul(rep, club ? clubReputation(club) : rep / 0.6) * (fans >= B.fansCalm ? B.fansCalmMul : 1);
}

// ------------------------------------------------------------ Stan
function blankCur(season, clubId, date) {
  return { season, clubId, from: date, n: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, lg: { n: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }, up: 0, down: 0, cup: null, euroTitle: {} };
}
const blankTot = () => ({ n: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
const blankRun = () => ({ w: 0, u: 0, lu: 0, cs: 0, l: 0 });

/** Kariera z zapisu albo nowa (stary zapis: odtworzenie z historii, docs/kariera-trenera.md rozdz. 5). Idempotentne. */
export function ensureCareerHistory(game) {
  if (!game) return null;
  const M = (game.manager ??= {});
  if (M.rep == null) M.rep = game.clubId && clubById(game.clubId) ? Math.round(clubReputation(clubById(game.clubId)) * 0.6) : 15;
  M.history ??= game.clubId ? [{ club: game.clubId, from: game.date }] : [];
  M.fired ??= 0;
  if (M.career?.v) return fillCareer(game, M.career);
  M.career = reconstruct(game);
  return M.career;
}

function fillCareer(game, C) {
  C.seasons ??= []; C.trophies ??= []; C.awards ??= []; C.records ??= {}; C.stints ??= []; C.scars ??= [];
  C.rep ??= { peak: game.manager.rep, log: [], hist: [], seasonStart: game.manager.rep };
  C.rep.log ??= []; C.rep.hist ??= []; C.rep.peak ??= game.manager.rep; C.rep.seasonStart ??= game.manager.rep; C.rep.label ??= coachRepLabel(game.manager.rep);
  C.pop ??= { fans: 50, media: startMedia(game.manager.rep), hist: [] };
  C.pop.hist ??= []; C.pop.seasonStart ??= { fans: C.pop.fans, media: C.pop.media };
  C.tot ??= blankTot(); C.run ??= blankRun(); C.seen ??= []; C.mon ??= null;
  C.cur ??= game.clubId && !unemployed(game) ? blankCur(seasonKey(game), game.clubId, game.date) : null;
  return C;
}
const startMedia = (rep) => Math.round(clamp(25 + 0.6 * (rep ?? 15), 10, 80));

// ------------------------------------------------------------ Wpisy: reputacja, popularność, odznaki
function repLog(C, date, delta, text) {
  if (Math.abs(delta) < 0.05) return;
  C.rep.log.unshift({ date, delta: r1(delta), text });
  if (C.rep.log.length > 40) C.rep.log.length = 40;
}

/** Wydarzenie reputacji gracza (pts > 0: przyrost z nasyceniem i progiem ligi, pts < 0: kara). Zwraca zmianę. */
export function careerRep(game, date, pts, text, { tier = null, noCap = false, raw = false } = {}) {
  const M = game.manager; const C = M.career;
  const before = M.rep;
  if (raw) M.rep = clamp(M.rep + pts, 0, 100);
  else if (pts >= 0) M.rep = repGain(M.rep, pts, tier ?? tierOf(game.clubId), { noCap });
  else M.rep = repLoss(M.rep, -pts);
  M.rep = r2(Math.max(Math.min(before, CAREER.min), M.rep));
  C.rep.peak = Math.max(C.rep.peak ?? 0, M.rep);
  repLog(C, date, M.rep - before, text);
  return M.rep - before;
}

function popAdd(C, fans = 0, media = 0) {
  C.pop.fans = r1(clamp(C.pop.fans + fans, 0, 100));
  C.pop.media = r1(clamp(C.pop.media + media, 0, 100));
}

/** Odznaka (zdobycie z sezonem i klubem). Zwraca wiadomość o odblokowaniu albo null. */
function award(game, badgeId, date, clubId, { seen = false, reconstructed = false, season = null, comp = null } = {}) {
  const C = game.manager.career;
  const s = season ?? seasonKey(game);
  C.awards.push({ badgeId, season: s, clubId: clubId ?? null, clubName: clubId ? nameOf(clubId) : '', date, seen, ...(reconstructed ? { reconstructed: true } : {}) });
  if (TROPHY_BADGES.has(badgeId)) C.trophies.push({ id: `${COMP_OF_BADGE[badgeId]}:${s}:${clubId}`, badgeId, comp: comp ?? COMP_OF_BADGE[badgeId], season: s, clubId, date, ...(reconstructed ? { reconstructed: true } : {}) });
  if (seen) return null;
  const n = C.awards.filter((a) => a.badgeId === badgeId).length;
  return createMessage({ date, key: `odznaka:${badgeId}:${s}:${n}`, category: 'board', from: 'Kariera trenera', priority: TROPHY_BADGES.has(badgeId) ? 'important' : 'info',
    subject: `${BADGE_NAMES[badgeId]}${n > 1 ? ` (${n}. raz)` : ''}`,
    body: `${TROPHY_BADGES.has(badgeId) && !C.trophies.slice(0, -1).length ? 'Pierwsze trofeum w karierze. ' : ''}Nowa odznaka w karierze: ${BADGE_NAMES[badgeId]}${clubId ? `, ${nameOf(clubId)}` : ''}, sezon ${s}. Zobacz gablotę w zakładce Klub, Kariera.` });
}

/** Zmiana poziomu reputacji (etykieta): wiadomość w Poczcie. */
function repLevel(game, date) {
  const C = game.manager.career;
  const now = coachRepLabel(game.manager.rep);
  const was = C.rep.label;
  C.rep.label = now;
  if (!was || was === now) return [];
  const up = COACH_REP_LEVELS.findIndex(([, l]) => l === now) < COACH_REP_LEVELS.findIndex(([, l]) => l === was);
  return [createMessage({ date, key: `reputacja-poziom:${date}`, category: 'media', from: 'Media', priority: 'info', subject: `Reputacja trenera: ${now.toLowerCase()}`,
    body: up ? `Twoje nazwisko znaczy coraz więcej: ${now.toLowerCase()} (wcześniej: ${was.toLowerCase()}). Zasięg ofert pracy rośnie.` : `Twoja pozycja w zawodzie słabnie: ${now.toLowerCase()} (wcześniej: ${was.toLowerCase()}).` })];
}

/** Mecze o stawkę z klubem w bieżącym sezonie (zasada trofeum). */
function seasonMatchesWith(C, clubId) { return C.cur?.clubId === clubId ? C.cur.n : 0; }

// ------------------------------------------------------------ Mecze: dzienny hook
/** Wynik meczu z perspektywy klubu: { gf, ga, res 'W'|'D'|'L', home }. */
function sideOf(f, clubId) {
  const home = f.home === clubId;
  const [a, b] = f.result.score;
  const gf = home ? a : b; const ga = home ? b : a;
  return { gf, ga, res: gf > ga ? 'W' : gf < ga ? 'L' : 'D', home, opp: home ? f.away : f.home };
}

/**
 * Nowe rozegrane mecze klubu gracza (od ostatniego przeglądu, bez dublowania po wczytaniu zapisu): bilans, serie,
 * rekordy, punkty reputacji za mecze, popularność, trofea w dniu finału, odznaki meczowe. Zwraca wiadomości.
 */
export function careerScan(game, date) {
  const C = game.manager?.career;
  const clubId = game.clubId;
  if (!C || !clubId || unemployed(game) || !game.fixtures) return [];
  const key = seasonKey(game);
  if (!C.cur || C.cur.season !== key || C.cur.clubId !== clubId) C.cur = blankCur(key, clubId, C.cur?.clubId === clubId ? C.cur.from : date);
  const seen = new Set(C.seen);
  const since = C.stintFrom ?? '';
  const list = game.fixtures.filter((f) => f.played && f.result?.score && competitive(f) && (f.home === clubId || f.away === clubId) && f.date <= date && f.date >= since && !seen.has(f.id))
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
  const msgs = [];
  for (const f of list) { C.seen.push(f.id); msgs.push(...countMatch(game, f, clubId)); }
  if (C.seen.length > 200) C.seen = C.seen.slice(-200);
  return msgs;
}

function countMatch(game, f, clubId) {
  const C = game.manager.career; const E = CAREER.ev; const P = CAREER.pop;
  const cur = C.cur; const s = sideOf(f, clubId);
  const msgs = [];
  const tier = tierOf(clubId);
  const add = (o) => { o.n++; o.gf += s.gf; o.ga += s.ga; if (s.res === 'W') o.w++; else if (s.res === 'L') o.l++; else o.d++; };
  add(cur); add(C.tot);
  const league = isLeague(f.comp) && !String(f.comp).startsWith('playoff');
  if (league) { add(cur.lg); cur.lg.pts += s.res === 'W' ? 3 : s.res === 'D' ? 1 : 0; }
  // Miesiąc (forma, gra efektowna, trener miesiąca)
  const m = f.date.slice(0, 7);
  if (!C.mon || C.mon.m !== m) C.mon = { m, n: 0, pts: 0, gf: 0, lgN: 0, lgGf: 0 };
  C.mon.n++; C.mon.pts += s.res === 'W' ? 3 : s.res === 'D' ? 1 : 0;
  if (league) { C.mon.lgN++; C.mon.lgGf += s.gf; }
  // Serie
  const R = C.run;
  R.w = s.res === 'W' ? R.w + 1 : 0; R.l = s.res === 'L' ? R.l + 1 : 0; R.u = s.res !== 'L' ? R.u + 1 : 0; R.cs = s.ga === 0 ? R.cs + 1 : 0;
  if (league) R.lu = s.res !== 'L' ? R.lu + 1 : 0;
  if (R.w === 5) popAdd(C, P.run5w, 0);
  if (R.l === 5) popAdd(C, P.run5l, 0);
  if (league && R.lu === 10) { const x = award(game, 'seria_bez_porazki', f.date, clubId); if (x) msgs.push(x); }
  // Rekordy
  const rec = C.records; const opp = s.opp;
  const keep = (k, v, o, better) => { if (!rec[k] || better(v, rec[k].v)) rec[k] = { v, ...o }; };
  const detail = { opp, oppName: nameOf(opp), date: f.date, clubId, score: `${s.gf}:${s.ga}` };
  if (s.res === 'W') keep('bigWin', s.gf - s.ga, detail, (a, b) => a > b);
  if (s.res === 'L') keep('bigLoss', s.ga - s.gf, detail, (a, b) => a > b);
  keep('mostGoals', s.gf, detail, (a, b) => a > b);
  keep('winRun', R.w, { to: f.date, clubId }, (a, b) => a > b);
  keep('unbeaten', R.u, { to: f.date, clubId }, (a, b) => a > b);
  if (league) keep('leagueUnbeaten', R.lu, { to: f.date, clubId }, (a, b) => a > b);
  keep('cleanRun', R.cs, { to: f.date, clubId }, (a, b) => a > b);
  // Oczekiwania (siła kadr) i reputacja za mecz
  const exp = expectedPoints(clubId, opp, s.home, !!f.neutral);
  if (s.res === 'W') keep('upset', r2(exp), detail, (a, b) => a < b);
  if (league) {
    if (exp <= 1.0 && s.res !== 'L' && cur.up < E.upsetCap) { const v = Math.min(s.res === 'W' ? E.upsetWin : E.upsetDraw, E.upsetCap - cur.up); cur.up += v; careerRep(game, f.date, v, `${s.res === 'W' ? 'Wygrana' : 'Remis'} z silniejszym rywalem (${nameOf(opp)})`); }
    if (exp >= 2.2 && s.res === 'L' && cur.down > E.shockCap) { const v = Math.max(E.shockLoss, E.shockCap - cur.down); cur.down += v; careerRep(game, f.date, v, `Porażka z dużo słabszym rywalem (${nameOf(opp)})`, { raw: true }); }
  }
  const riv = rivalry(clubId, opp);
  if (riv >= 1 && s.res !== 'D') { popAdd(C, s.res === 'W' ? P.derby : -P.derby, 0); if (s.res === 'W') careerRep(game, f.date, E.derbyWin, `Wygrane derby z ${nameOf(opp)}`); }
  // Sensacja: wygrana przy oczekiwanych punktach do 0,8 albo pucharowy awans kosztem klubu o 2 poziomy wyżej
  const decider = isDecider(f); const tw = decider ? tieWinner(f) ?? winnerOf(f) : null;
  const giantCup = f.comp === 'pp' && tw === clubId && tierOf(opp) <= tier - 2;
  if ((s.res === 'W' && exp <= 0.8) || giantCup) { const x = award(game, 'sensacja', f.date, clubId); if (x) msgs.push(x); }
  // Puchary: wygrana z faworytem, odpadnięcie z niżej notowanym, finał, trofea
  if (decider && tw) {
    const won = tw === clubId;
    if (f.comp === 'pp') {
      cur.cup = f.round;
      if (won && exp <= 1.0) careerRep(game, f.date, E.cupUpset, `Awans w Pucharze Polski kosztem ${nameOf(opp)}`);
      if (!won && tierOf(opp) >= tier + 2) careerRep(game, f.date, -CAREER.pen.cupOut2, `Odpadnięcie z Pucharu Polski z ${nameOf(opp)} (dwie ligi niżej)`);
      else if (!won && tierOf(opp) === tier + 1) careerRep(game, f.date, -CAREER.pen.cupOut1, `Odpadnięcie z Pucharu Polski z ${nameOf(opp)} (liga niżej)`);
      if (f.round === 'F') {
        if (won) msgs.push(...trophy(game, 'puchar_polski', f, clubId, E.pp, 'Puchar Polski', CAREER.pop.cup));
        else careerRep(game, f.date, E.ppFinalLost, 'Finał Pucharu Polski');
      }
    } else if (f.comp === 'super' && won) msgs.push(...trophy(game, 'superpuchar_polski', f, clubId, E.super, 'Superpuchar Polski', [1, 1], true));
    else if (f.comp === 'uefa') {
      if (f.ucomp === 'SEU' && won) msgs.push(...trophy(game, 'superpuchar_europy', f, clubId, E.SEU, 'Superpuchar Europy', [2, 2], true));
      else if (f.round === 'F' && won && E[f.ucomp]) { cur.euroTitle[f.ucomp] = true; msgs.push(...trophy(game, UEFA_BADGE[f.ucomp], f, clubId, E[f.ucomp], BADGE_NAMES[UEFA_BADGE[f.ucomp]], [5, 6])); }
      else if (!won && ['Q1', 'Q2', 'Q3', 'PO'].includes(f.round) && exp >= 1.9) careerRep(game, f.date, -CAREER.pen.euroOut, `Odpadnięcie z eliminacji z ${nameOf(opp)}`);
    }
  }
  // Mecze w karierze
  for (const [n, id] of MATCH_MILESTONES) if (C.tot.n === n) { const x = award(game, id, f.date, clubId); if (x) msgs.push(x); }
  return msgs;
}

/** Trofeum z dnia finału (zasada 12 meczów, superpuchary: wystarczy prowadzić mecz). */
function trophy(game, badgeId, f, clubId, pts, label, [fans, media], single = false) {
  const C = game.manager.career;
  if (!single && seasonMatchesWith(C, clubId) < CAREER.trophyMatches) return [];
  careerRep(game, f.date, pts, label, { noCap: true });
  popAdd(C, fans, media);
  C.lastSuccess = f.date;
  const x = award(game, badgeId, f.date, clubId);
  return x ? [x] : [];
}

// ------------------------------------------------------------ Miesiąc
/**
 * Pierwszy dzień miesiąca: składnik formy (zamiast starego wzoru z zaufania zarządu), zanik reputacji, popularność
 * (nastroje kibiców, gra efektowna, lojalność, bezrobocie), trener miesiąca. Zwraca wiadomości.
 */
export function careerMonth(game, date) {
  const C = ensureCareerHistory(game);
  const M = game.manager;
  const msgs = [];
  const prevM = addDaysIso(date, -1).slice(0, 7);
  const job = M.job;
  const out = unemployed(game);
  const mon = C.mon?.m === prevM ? C.mon : null;
  const F = CAREER.form; const P = CAREER.pop; const D = CAREER.decay;
  if (!out && game.clubId) {
    if (mon && mon.n >= F.minMatches) {
      const v = clamp((mon.pts / mon.n - F.ref) * F.w, -F.max, F.max);
      if (v > 0) careerRep(game, date, v, 'Forma w miesiącu');
      else if (v < 0) careerRep(game, date, v, 'Forma w miesiącu', { raw: true });
    }
    popAdd(C, ((game.board?.fansMood ?? 55) - 55) * P.moodW, 0);
    // Gra efektowna: gole w lidze ponad średnią ligi
    const comp = compOfClub(clubById(game.clubId));
    if (mon && mon.lgN >= 2 && comp) {
      const lf = game.fixtures.filter((f) => f.comp === comp && f.played && f.result?.score && f.date.slice(0, 7) === prevM);
      const avg = lf.length ? lf.reduce((s, f) => s + f.result.score[0] + f.result.score[1], 0) / (lf.length * 2) : 0;
      if (mon.lgGf / mon.lgN >= avg + P.flair) popAdd(C, P.flairFans, P.flairMedia);
    }
    // Lojalność: po 12 miesiącach w klubie
    const st = C.stints.at(-1);
    if (st && !st.to && daysBetween(st.from, date) >= P.loyalFrom * 30 && (st.loyal ?? 0) < P.loyalMax) { st.loyal = r2((st.loyal ?? 0) + P.loyal); popAdd(C, P.loyal, 0); }
    const tm = coachOfMonth(game, prevM);
    if (tm) { const x = award(game, 'trener_miesiaca', date, game.clubId); if (x) msgs.push(x); }
  } else if (out) {
    popAdd(C, (50 - C.pop.fans) * 0.05, -0.3); // bez klubu: kibice zapominają, media mniej piszą
  }
  // Zanik reputacji (nie niżej niż 0,6 szczytu)
  const floor = Math.max(CAREER.min, D.floor * (C.rep.peak ?? M.rep));
  if (M.rep > floor) {
    let dec = 0;
    const since = C.lastSuccess ?? C.stints[0]?.from ?? date;
    if (daysBetween(since, date) >= D.idleMonths * 30) dec += D.idle;
    if (out && job?.since && daysBetween(job.since, date) > D.joblessMonths * 30) dec += D.jobless;
    if (dec) { const before = M.rep; M.rep = r2(Math.max(floor, M.rep - dec)); repLog(C, date, M.rep - before, out ? 'Długo bez pracy' : 'Długo bez sukcesu'); }
  }
  msgs.push(...repLevel(game, date));
  return msgs;
}

/**
 * Trener miesiąca w lidze klubu gracza: najlepsze punkty na mecz w lidze w miesiącu (co najmniej 3 mecze), przy
 * remisie bilans bramek i gole. Zwraca true, gdy wygrał gracz (mecze od początku pracy w klubie).
 */
export function coachOfMonth(game, month) {
  const clubId = game.clubId; const comp = compOfClub(clubById(clubId));
  if (!comp) return false;
  const from = game.manager.career?.stintFrom ?? '';
  const by = new Map();
  for (const f of game.fixtures) {
    if (f.comp !== comp || !f.played || !f.result?.score || f.date.slice(0, 7) !== month) continue;
    for (const id of [f.home, f.away]) {
      if (id === clubId && f.date < from) continue;
      const s = sideOf(f, id); const o = by.get(id) ?? { id, n: 0, pts: 0, gd: 0, gf: 0 };
      o.n++; o.pts += s.res === 'W' ? 3 : s.res === 'D' ? 1 : 0; o.gd += s.gf - s.ga; o.gf += s.gf; by.set(id, o);
    }
  }
  const xs = [...by.values()].filter((o) => o.n >= 3).sort((a, b) => b.pts / b.n - a.pts / a.n || b.gd - a.gd || b.gf - a.gf);
  return !!xs.length && xs[0].id === clubId;
}

// ------------------------------------------------------------ Koniec sezonu
/**
 * Koniec sezonu (rollover, przed zmianą lig i terminarza): wiersz sezonu, mistrzostwo, awans, cel zarządu, Europa,
 * kary, odznaki sezonu, trener sezonu. ctx: { res, moves, goal } (goal: cel zarządu w sezonie). Zwraca wiadomości.
 */
export function careerSeasonEnd(game, date, { res, moves, goal }) {
  const C = ensureCareerHistory(game);
  const M = game.manager;
  const msgs = [];
  const clubId = game.clubId;
  const key = seasonKey(game);
  if (clubId && !unemployed(game)) {
    msgs.push(...careerScan(game, date));
    const club = clubById(clubId); const tier = club.tier; const E = CAREER.ev; const P = CAREER.pen;
    const table = tier === 4 ? res.groupTables?.[club.group] ?? [] : res.tables?.[tier] ?? [];
    const pos = table.indexOf(clubId) + 1 || null;
    const target = goal?.target ?? seasonGoalFor(club).target;
    const n = seasonMatchesWith(C, clubId);
    const ok = n >= CAREER.trophyMatches;
    const promoted = !!moves.promoted?.[tier - 1]?.includes(clubId);
    const relegated = !!moves.relegated?.[tier + 1]?.includes(clubId);
    const before = C.rep.seasonStart ?? M.rep;
    const badges = [];
    const give = (id) => { badges.push(id); const x = award(game, id, date, clubId); if (x) msgs.push(x); };
    if (ok && pos === 1) {
      careerRep(game, date, E.title[tier], `Mistrzostwo: ${leagueLabel(club)}`, { noCap: true });
      popAdd(C, ...(tier === 1 ? CAREER.pop.champion : [2, 1]));
      C.lastSuccess = date;
      give(TITLE_BADGE[tier]);
    }
    if (ok && promoted) {
      careerRep(game, date, E.promo[tier - 1] ?? 3, `Awans do ${LEAGUE_NAMES[tier - 1] ?? 'wyższej ligi'}`, { tier });
      popAdd(C, ...CAREER.pop.promo);
      C.lastSuccess = date;
      give('awans');
    }
    const underdog = (goal?.target ?? 0) >= 14 || (goal?.rank ?? 0) > table.length - 4;
    const newcomer = !!game.archive?.at(-1)?.promoted?.[tier]?.includes(clubId);
    if (ok && pos) {
      if (pos <= target) careerRep(game, date, E.goalMet, 'Cel zarządu wykonany', { tier });
      if (pos < target) careerRep(game, date, Math.min(E.perPlaceMax, (target - pos) * E.perPlace), `Miejsce ponad cel (${pos}. przy celu ${target}.)`, { tier });
      if (!relegated && underdog && pos <= target) careerRep(game, date, E.underdogStay, 'Utrzymanie z jednym z najsłabszych zespołów', { tier });
      if (target - pos >= 3) give('cel_ponad_plan');
      if (!relegated && (newcomer || underdog) && !promoted) give('utrzymanie_beniaminek');
      const below = pos - target;
      if (below >= P.belowFrom) careerRep(game, date, -Math.min(P.belowMax, P.perBelow * (below - P.belowFrom + 1)), `Sezon daleko poniżej celu (${pos}. przy celu ${target}.)`);
    }
    if (relegated && n >= CAREER.pen.earlyMatches) {
      careerRep(game, date, -(underdog ? P.relegDog : P.relegFav), `Spadek: ${leagueLabel(club)}`);
      popAdd(C, ...CAREER.pop.releg);
      scar(game, date, clubId, `Spadek z ${club.name} (${leagueLabel(club)}, ${key})`);
    }
    // Europa: najwyższy etap (bez tytułu) i przebyte rundy eliminacji
    msgs.push(...euroSeason(game, date, clubId));
    if (ok && coachOfSeason(game, clubId, res, moves)) give('trener_sezonu');
    const lg = C.cur?.lg ?? { n: 0 };
    if (lg.n >= 10) { const ppm = r2(lg.pts / lg.n); if (!C.records.bestPpm || ppm > C.records.bestPpm.v) C.records.bestPpm = { v: ppm, season: key, clubId }; }
    const allBadges = C.awards.filter((a) => a.season === key && a.clubId === clubId && !a.badgeId.startsWith('mecze_')).map((a) => a.badgeId);
    C.seasons.push(seasonRow(game, { season: key, clubId, pos, target, goalText: goal?.text, promoted, relegated, badges: [...new Set(allBadges)], repDelta: r1(M.rep - before) }));
  }
  // Reputacja i popularność: punkt na wykresie sezonów, start nowego sezonu
  C.rep.hist.push({ season: key, value: r1(M.rep) }); C.rep.hist = C.rep.hist.slice(-30);
  C.pop.hist.push({ season: key, fans: r1(C.pop.fans), media: r1(C.pop.media) }); C.pop.hist = C.pop.hist.slice(-30);
  C.rep.seasonStart = M.rep; C.pop.seasonStart = { fans: C.pop.fans, media: C.pop.media };
  C.cur = null; C.seen = [];
  msgs.push(...repLevel(game, date));
  return msgs;
}

function euroSeason(game, date, clubId) {
  const C = game.manager.career; const E = CAREER.ev;
  const fx = game.fixtures.filter((f) => f.comp === 'uefa' && f.ucomp !== 'SEU' && f.played && (f.home === clubId || f.away === clubId) && f.date >= (C.stintFrom ?? ''));
  if (!fx.length) return [];
  let best = 0; let bestTxt = ''; let qual = 0;
  for (const f of fx) {
    if (C.cur?.euroTitle?.[f.ucomp]) continue;
    const v = (E.stage[f.round] ?? 0) * (E.stageMul[f.ucomp] ?? 0.5);
    if (v > best) { best = v; bestTxt = `${BADGE_NAMES[UEFA_BADGE[f.ucomp]]}: ${f.round === 'league' || f.round === 'KPO' ? 'faza ligowa' : f.round === 'F' ? 'finał' : f.round === 'SF' ? 'półfinał' : f.round === 'QF' ? 'ćwierćfinał' : '1/8 finału'}`; }
    if (['Q1', 'Q2', 'Q3', 'PO'].includes(f.round) && isDecider(f) && tieWinner(f) === clubId) qual += E.qual;
  }
  if (best) careerRep(game, date, best, bestTxt, { noCap: true });
  if (qual) careerRep(game, date, Math.min(E.qualMax, qual), 'Przebyte rundy eliminacji europejskich', { noCap: true });
  if (best >= 4) popAdd(C, 1, 2);
  return [];
}

/**
 * Trener sezonu w lidze (deterministycznie): kandydaci to mistrz i kluby z awansem z tej ligi (w III lidze z grupy);
 * wygrywa największe miejsce ponad cel z siły kadry (seasonGoalFor), potem lepsze miejsce i więcej punktów.
 */
export function coachOfSeason(game, clubId, res, moves) {
  const club = clubById(clubId); const tier = club.tier;
  const table = tier === 4 ? res.groupTables?.[club.group] ?? [] : res.tables?.[tier] ?? [];
  if (!table.length) return false;
  const up = new Set(moves.promoted?.[tier - 1] ?? []);
  const cands = table.map((id, i) => ({ id, pos: i + 1 })).filter((x) => x.pos === 1 || up.has(x.id));
  const rows = tier === 4 ? res.groupRows?.[club.group] : res.rows?.[tier];
  const pts = (id) => rows?.find((r) => r.id === id)?.points ?? 0;
  cands.sort((a, b) => (seasonGoalFor(clubById(b.id)).target - b.pos) - (seasonGoalFor(clubById(a.id)).target - a.pos) || a.pos - b.pos || pts(b.id) - pts(a.id) || a.id.localeCompare(b.id));
  return cands[0]?.id === clubId;
}

function seasonRow(game, o) {
  const C = game.manager.career; const club = clubById(o.clubId);
  const cur = C.cur ?? blankCur(o.season, o.clubId, game.date);
  const achieved = o.fired ? 'missed' : o.pos == null ? 'missed' : o.target - o.pos >= 3 ? 'exceeded' : o.pos <= o.target ? 'met' : 'missed';
  return {
    season: o.season, clubId: o.clubId, clubName: club?.name ?? o.clubId, tier: club?.tier ?? null, league: club ? leagueLabel(club) : '',
    pos: o.pos, round: cur.lg.n, target: o.target ?? null, goal: o.goalText ?? '', achieved, w: cur.w, d: cur.d, l: cur.l, gf: cur.gf, ga: cur.ga, n: cur.n,
    pts: cur.lg.pts, cup: cur.cup, trophies: o.badges ?? [], promoted: !!o.promoted, relegated: !!o.relegated, fired: !!o.fired,
    repDelta: o.repDelta ?? null, repEnd: r1(game.manager.rep), ...(o.partial ? { partial: true } : {}), ...(o.reconstructed ? { reconstructed: true } : {}),
  };
}

function scar(game, date, clubId, text) {
  const C = game.manager.career;
  C.scars.push({ date, season: seasonKey(game), clubName: clubId ? nameOf(clubId) : '', text });
}

// ------------------------------------------------------------ Zmiana klubu
/**
 * Odejście z klubu (zwolnienie, rezygnacja, przyjęta oferta). why: 'zwolnienie' | 'rezygnacja' | 'oferta'.
 * Liczy zaległe mecze, zamyka okres pracy, w trakcie sezonu zapisuje częściowy wiersz sezonu, kary i blizny.
 */
export function careerLeave(game, date, why, { inSeason = true } = {}) {
  const C = ensureCareerHistory(game);
  const clubId = game.clubId;
  if (!clubId) return [];
  const msgs = careerScan(game, date);
  const st = C.stints.at(-1);
  const P = CAREER.pen;
  if (why === 'zwolnienie') {
    careerRep(game, date, -P.fired, `Zwolnienie z ${nameOf(clubId)}`);
    if (st && (st.matches ?? 0) + (C.cur?.clubId === clubId ? C.cur.n : 0) < P.earlyMatches) careerRep(game, date, -P.firedEarly, 'Zwolnienie po kilku meczach');
    scar(game, date, clubId, `Zwolnienie z ${nameOf(clubId)}${C.cur?.lg?.n ? ` po ${C.cur.lg.n} kolejkach` : ''}`);
    if (!inSeason) { const row = C.seasons.at(-1); if (row?.clubId === clubId) row.fired = true; }
  } else if (why === 'rezygnacja') {
    if (inSeason) careerRep(game, date, -P.resign, `Rezygnacja w trakcie sezonu (${nameOf(clubId)})`);
    scar(game, date, clubId, `Rezygnacja z pracy w ${nameOf(clubId)}${inSeason ? ' w trakcie sezonu' : ' po sezonie'}`);
  }
  if (st && !st.to) {
    st.to = date; st.why = why;
    if (C.cur?.clubId === clubId) { st.matches = (st.matches ?? 0) + C.cur.n; st.w = (st.w ?? 0) + C.cur.w; st.d = (st.d ?? 0) + C.cur.d; st.l = (st.l ?? 0) + C.cur.l; }
    if (daysBetween(st.from, date) < 365 && why !== 'zwolnienie') st.fansLeft = CAREER.pop.leftEarly; // kibice starego klubu (tylko zapis)
  }
  if (inSeason && C.cur?.clubId === clubId && C.cur.n > 0) {
    const club = clubById(clubId); const comp = compOfClub(club);
    const t = comp ? standings(game.fixtures.filter((f) => f.comp === comp), compClubIds(comp)) : [];
    const pos = t.find((r) => r.id === clubId)?.pos ?? null;
    const g = game.board?.goal;
    const badges = [...new Set(C.awards.filter((a) => a.season === seasonKey(game) && a.clubId === clubId && !a.badgeId.startsWith('mecze_')).map((a) => a.badgeId))];
    C.seasons.push(seasonRow(game, { season: seasonKey(game), clubId, pos, target: g?.target, goalText: g?.text, badges, fired: why === 'zwolnienie', partial: true, repDelta: null }));
  }
  C.cur = null; C.seen = []; C.run = blankRun(); C.stintFrom = null;
  return msgs;
}

/** Nowy klub: okres pracy, popularność u kibiców (35 % odchylenia przechodzi), licznik sezonu. */
export function careerJoin(game, clubId, date, why = 'oferta') {
  const C = ensureCareerHistory(game);
  const club = clubById(clubId);
  C.pop.fans = r1(50 + CAREER.pop.carry * (C.pop.fans - 50));
  C.stints.push({ clubId, clubName: club?.name ?? clubId, from: date, to: null, tier: club?.tier ?? null, league: club ? leagueLabel(club) : '', why: null, how: why, matches: 0, w: 0, d: 0, l: 0 });
  C.cur = blankCur(seasonKey(game), clubId, date); C.seen = []; C.run = blankRun(); C.stintFrom = date;
}

// ------------------------------------------------------------ Popularność z konferencji prasowych
const pressKey = (e, pre) => `${pre ? 'r' : 'p'}|${e.date}|${e.matchId ?? ''}|${e.mode ?? ''}|${e.headline ?? ''}`;
/** Konferencje (game.press.log i preLog z polami fans i media): 30 % składowych, wyjście z sali -2 w mediach. */
export function careerPress(game, { prime = false } = {}) {
  const C = game.manager?.career; const S = game.press;
  if (!C || !S) return;
  const keys = new Set(C.pressKeys ?? []);
  for (const [list, pre] of [[S.log, false], [S.preLog, true]]) {
    for (const e of list ?? []) {
      if (!e?.date) continue;
      const k = pressKey(e, pre);
      if (keys.has(k)) continue;
      keys.add(k);
      if (prime) continue;
      if (e.mode === 'walkout') popAdd(C, 0, CAREER.pop.walkout);
      if (e.fans || e.media) popAdd(C, (e.fans ?? 0) * CAREER.pop.press, (e.media ?? 0) * CAREER.pop.press);
    }
  }
  C.pressKeys = [...keys].slice(-30);
}

// ------------------------------------------------------------ Masowe aplikowanie (rynek pracy)
export function careerMassApply(game, date) {
  const C = ensureCareerHistory(game);
  popAdd(C, 0, CAREER.pop.massApply);
  repLog(C, date, 0, 'Media: trener rozsyła aplikacje do wielu klubów');
}

// ------------------------------------------------------------ Odczyt dla widoków
/** Data w rekordach po polsku (20 paź 2026); brak daty: pusty tekst. */
const dDate = (iso) => (iso ? fmtDate(iso) : '');
export function careerRecords(game) {
  const C = ensureCareerHistory(game); const R = C.records;
  const out = [];
  const t = C.tot;
  out.push({ key: 'matches', label: 'Mecze w karierze', value: t.n, detail: `${t.w} zwycięstw, ${t.d} remisów, ${t.l} porażek, bramki ${t.gf}:${t.ga}` });
  if (R.bigWin) out.push({ key: 'bigWin', label: 'Najwyższe zwycięstwo', value: R.bigWin.score, detail: `${R.bigWin.oppName}, ${dDate(R.bigWin.date)}` });
  if (R.bigLoss) out.push({ key: 'bigLoss', label: 'Najwyższa porażka', value: R.bigLoss.score, detail: `${R.bigLoss.oppName}, ${dDate(R.bigLoss.date)}` });
  if (R.winRun?.v) out.push({ key: 'winRun', label: 'Najdłuższa seria zwycięstw', value: R.winRun.v, detail: `${nameOf(R.winRun.clubId)}, do ${dDate(R.winRun.to)}` });
  if (R.unbeaten?.v) out.push({ key: 'unbeaten', label: 'Najdłuższa seria bez porażki', value: R.unbeaten.v, detail: `${nameOf(R.unbeaten.clubId)}, do ${dDate(R.unbeaten.to)}` });
  if (R.leagueUnbeaten?.v) out.push({ key: 'leagueUnbeaten', label: 'Najdłuższa seria bez porażki w lidze', value: R.leagueUnbeaten.v, detail: `${nameOf(R.leagueUnbeaten.clubId)}, do ${dDate(R.leagueUnbeaten.to)}` });
  if (R.cleanRun?.v) out.push({ key: 'cleanRun', label: 'Najdłuższa seria bez straconego gola', value: R.cleanRun.v, detail: `${nameOf(R.cleanRun.clubId)}, do ${dDate(R.cleanRun.to)}` });
  if (R.mostGoals?.v) out.push({ key: 'mostGoals', label: 'Najwięcej goli w meczu', value: R.mostGoals.v, detail: `${R.mostGoals.score} z ${R.mostGoals.oppName}, ${dDate(R.mostGoals.date)}` });
  if (R.upset) out.push({ key: 'upset', label: 'Największa niespodzianka', value: R.upset.score, detail: `${R.upset.oppName}, ${dDate(R.upset.date)} (oczekiwane ${String(R.upset.v).replace('.', ',')} pkt)` });
  if (R.bestPpm) out.push({ key: 'bestPpm', label: 'Najlepszy sezon (punkty na mecz w lidze)', value: String(R.bestPpm.v).replace('.', ','), detail: `${nameOf(R.bestPpm.clubId)}, ${R.bestPpm.season}` });
  const now = game.date;
  const longest = C.stints.map((s) => ({ s, d: daysBetween(s.from, s.to ?? now) })).sort((a, b) => b.d - a.d)[0];
  if (longest) out.push({ key: 'longestStint', label: 'Najdłuższa praca w jednym klubie', value: longest.d, detail: `${longest.s.clubName}, ${longest.d} dni` });
  const tiers = [...C.stints.map((s) => s.tier), ...C.seasons.map((s) => s.tier)].filter((x) => x != null);
  if (tiers.length) { const top = Math.min(...tiers); out.push({ key: 'topLeague', label: 'Najwyższa liga', value: top, detail: LEAGUE_NAMES[top] ?? 'III liga' }); }
  out.push({ key: 'peakRep', label: 'Najwyższa reputacja', value: Math.round(C.rep.peak ?? game.manager.rep), detail: coachRepLabel(C.rep.peak ?? game.manager.rep) });
  return out;
}

/** Odznaki: liczniki z historii zdobyć. */
export function badgeCounts(game) {
  const C = ensureCareerHistory(game);
  const out = {};
  for (const a of C.awards) {
    const o = (out[a.badgeId] ??= { count: 0, last: null });
    o.count++;
    o.last = { season: a.season, clubId: a.clubId, clubName: a.clubName };
  }
  return out;
}

export function pendingUnlocks(game) {
  const C = ensureCareerHistory(game);
  const counts = {};
  const out = [];
  for (const a of C.awards) {
    counts[a.badgeId] = (counts[a.badgeId] ?? 0) + 1;
    if (!a.seen) out.push({ badgeId: a.badgeId, season: a.season, clubName: a.clubName, count: counts[a.badgeId] });
  }
  return out;
}
export function markUnlocksSeen(game) {
  const C = ensureCareerHistory(game);
  for (const a of C.awards) a.seen = true;
}

/** Podsumowanie kariery dla widoku Kariera (kontrakt API: docs/kariera-trenera.md rozdz. 8). */
export function careerSummary(game) {
  const C = ensureCareerHistory(game);
  const M = game.manager;
  const out = unemployed(game);
  const club = !out && game.clubId ? clubById(game.clubId) : null;
  const p = M.profile;
  const age = p?.birthYear ? (game.seasonYear ?? 2026) - p.birthYear : p?.age ?? null;
  const t = C.tot;
  const seasons = C.seasons.map((s) => ({ season: s.season, clubId: s.clubId, clubName: s.clubName, league: s.league, pos: s.pos, round: s.round, goal: s.goal, achieved: s.achieved, trophies: s.trophies ?? [], promoted: !!s.promoted, relegated: !!s.relegated, fired: !!s.fired, reconstructed: !!s.reconstructed }));
  if (club && C.cur?.clubId === club.id) {
    const comp = compOfClub(club);
    const tab = comp ? standings((game.fixtures ?? []).filter((f) => f.comp === comp), compClubIds(comp)) : [];
    const row = tab.find((r) => r.id === club.id);
    const key = seasonKey(game);
    seasons.push({ season: key, clubId: club.id, clubName: club.name, league: leagueLabel(club), pos: row?.played ? row.pos : null, round: C.cur.lg.n, goal: game.board?.goal?.text ?? '', achieved: 'running',
      trophies: [...new Set(C.awards.filter((a) => a.season === key && a.clubId === club.id && !a.badgeId.startsWith('mecze_')).map((a) => a.badgeId))], promoted: false, relegated: false, fired: false, reconstructed: false });
  }
  const repHist = [...C.rep.hist, { season: seasonKey(game), value: r1(M.rep) }];
  const popHist = [...C.pop.hist, { season: seasonKey(game), fans: r1(C.pop.fans), media: r1(C.pop.media) }];
  return {
    name: p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Trener' : 'Trener', age,
    club: club ? { id: club.id, name: club.name, tier: club.tier, league: leagueLabel(club) } : null, unemployed: out,
    rep: { value: r1(M.rep), label: coachRepLabel(M.rep), trend: r1(M.rep - (C.rep.seasonStart ?? M.rep)), reach: reachOf(M.rep), peak: r1(C.rep.peak ?? M.rep), history: repHist },
    pop: { fans: r1(C.pop.fans), media: r1(C.pop.media), fansLabel: fansLabel(C.pop.fans), mediaLabel: mediaLabel(C.pop.media), trendFans: r1(C.pop.fans - (C.pop.seasonStart?.fans ?? C.pop.fans)), trendMedia: r1(C.pop.media - (C.pop.seasonStart?.media ?? C.pop.media)), history: popHist },
    matches: { n: t.n, w: t.w, d: t.d, l: t.l, gf: t.gf, ga: t.ga, ppm: t.n ? r2((3 * t.w + t.d) / t.n) : 0 },
    seasons,
    trophies: C.trophies.map((x) => ({ badgeId: x.badgeId, comp: x.comp, season: x.season, clubId: x.clubId, clubName: nameOf(x.clubId), date: x.date })),
    badges: badgeCounts(game),
    records: careerRecords(game),
    stints: C.stints.map((s) => ({ clubId: s.clubId, clubName: s.clubName, from: s.from, to: s.to, league: s.league, why: s.why ?? null, matches: (s.matches ?? 0) + (!s.to && C.cur?.clubId === s.clubId ? C.cur.n : 0), trophies: [...new Set(C.trophies.filter((x) => x.clubId === s.clubId && (!s.from || x.date >= s.from) && (!s.to || x.date <= s.to)).map((x) => x.badgeId))] })),
    scars: C.scars.map((s) => ({ date: s.date, season: s.season, clubName: s.clubName, text: s.text })),
    repLog: C.rep.log.slice(0, 20).map((e) => ({ date: e.date, delta: e.delta, text: e.text })),
  };
}

// ------------------------------------------------------------ Migracja starych zapisów
/** Odtworzenie kariery z manager.seasons, manager.history, game.history i game.archive (reconstructed: true). */
function reconstruct(game) {
  const M = game.manager;
  const C = { v: 1, seasons: [], trophies: [], awards: [], records: {}, stints: [], scars: [], tot: blankTot(), run: blankRun(), seen: [], mon: null, cur: null, reconstructed: true,
    rep: { peak: M.rep, log: [], hist: [], seasonStart: M.rep }, pop: { fans: 50, media: startMedia(M.rep), hist: [] } };
  C.pop.seasonStart = { fans: C.pop.fans, media: C.pop.media };
  M.career = C;
  const H = game.history?.m ?? {};
  const cur = seasonKey(game);
  const rowsOf = (season, clubId) => (H[season] ?? []).filter((r) => r.me === clubId && r.s && r.c !== 'friendly' && r.c !== 'NT' && r.h && r.a);
  const fake = (r) => ({ id: r.id, date: r.d, comp: r.c, round: r.r, home: r.h, away: r.a, neutral: !!r.n, ucomp: r.u, result: { score: r.s, ...(r.so ? { shootout: r.so } : {}) } });
  // Okresy pracy
  for (const h of M.history ?? []) {
    const club = clubById(h.club);
    C.stints.push({ clubId: h.club, clubName: club?.name ?? h.club, from: h.from, to: h.to ?? null, tier: club?.tier ?? null, league: club ? leagueLabel(club) : '', why: h.to ? 'nieznany' : null, matches: 0, w: 0, d: 0, l: 0, reconstructed: true });
  }
  // Mecze (bilans, serie, rekordy, sensacje, kamienie milowe): wszystkie sezony z historii, od najstarszego
  const seasons = Object.keys(H).sort();
  for (const s of seasons) {
    const rows = (H[s] ?? []).filter((r) => r.s && r.c !== 'friendly' && r.c !== 'NT' && r.h && r.a && r.me).sort((a, b) => (a.d + (a.t ?? '')).localeCompare(b.d + (b.t ?? '')));
    for (const r of rows) {
      const f = fake(r); const s2 = sideOf(f, r.me);
      const add = (o) => { o.n++; o.gf += s2.gf; o.ga += s2.ga; if (s2.res === 'W') o.w++; else if (s2.res === 'L') o.l++; else o.d++; };
      add(C.tot);
      const st = C.stints.find((x) => x.clubId === r.me && (!x.from || r.d >= x.from) && (!x.to || r.d <= x.to)) ?? C.stints.find((x) => x.clubId === r.me);
      // Otwarty okres w bieżącym sezonie liczy licznik sezonu (C.cur), wcześniejsze mecze trafiają do okresu
      if (st && !(s === cur && !st.to && r.me === game.clubId)) { st.matches++; if (s2.res === 'W') st.w++; else if (s2.res === 'L') st.l++; else st.d++; }
      const league = isLeague(r.c) && !String(r.c).startsWith('playoff');
      const R = C.run;
      R.w = s2.res === 'W' ? R.w + 1 : 0; R.l = s2.res === 'L' ? R.l + 1 : 0; R.u = s2.res !== 'L' ? R.u + 1 : 0; R.cs = s2.ga === 0 ? R.cs + 1 : 0;
      if (league) R.lu = s2.res !== 'L' ? R.lu + 1 : 0;
      const rec = C.records;
      const keep = (k, v, o, better) => { if (!rec[k] || better(v, rec[k].v)) rec[k] = { v, ...o }; };
      const detail = { opp: s2.opp, oppName: nameOf(s2.opp), date: r.d, clubId: r.me, score: `${s2.gf}:${s2.ga}` };
      if (s2.res === 'W') keep('bigWin', s2.gf - s2.ga, detail, (a, b) => a > b);
      if (s2.res === 'L') keep('bigLoss', s2.ga - s2.gf, detail, (a, b) => a > b);
      keep('mostGoals', s2.gf, detail, (a, b) => a > b);
      keep('winRun', R.w, { to: r.d, clubId: r.me }, (a, b) => a > b);
      keep('unbeaten', R.u, { to: r.d, clubId: r.me }, (a, b) => a > b);
      if (league) keep('leagueUnbeaten', R.lu, { to: r.d, clubId: r.me }, (a, b) => a > b);
      keep('cleanRun', R.cs, { to: r.d, clubId: r.me }, (a, b) => a > b);
      const exp = expectedPoints(r.me, s2.opp, s2.home, !!r.n);
      if (s2.res === 'W') keep('upset', r2(exp), detail, (a, b) => a < b);
      if (league && R.lu === 10) award(game, 'seria_bez_porazki', r.d, r.me, { seen: true, reconstructed: true, season: s });
      const tw = isDecider(f) ? tieWinner(f) ?? winnerOf(f) : null;
      if ((s2.res === 'W' && exp <= 0.8) || (r.c === 'pp' && tw === r.me && tierOf(s2.opp) <= tierOf(r.me) - 2)) award(game, 'sensacja', r.d, r.me, { seen: true, reconstructed: true, season: s });
      if (r.c === 'super' && tw === r.me) award(game, 'superpuchar_polski', r.d, r.me, { seen: true, reconstructed: true, season: s });
      if (r.c === 'uefa' && r.u === 'SEU' && tw === r.me) award(game, 'superpuchar_europy', r.d, r.me, { seen: true, reconstructed: true, season: s });
      for (const [n, id] of MATCH_MILESTONES) if (C.tot.n === n) award(game, id, r.d, r.me, { seen: true, reconstructed: true, season: s });
    }
  }
  // Zamknięte sezony z manager.seasons i archiwum (trofea, awanse, spadki, cele)
  const mseasons = M.seasons ?? [];
  for (let i = 0; i < mseasons.length; i++) {
    const x = mseasons[i];
    const a = (game.archive ?? []).find((y) => y.season === x.season);
    const rows = rowsOf(x.season, x.club);
    const ok = !rows.length || rows.length >= CAREER.trophyMatches; // bez historii meczów: dane z archiwum wystarczą
    const badges = [];
    const give = (id, date) => { badges.push(id); award(game, id, date, x.club, { seen: true, reconstructed: true, season: x.season }); };
    const end = `${x.season.slice(0, 4) * 1 + 1}-06-30`;
    const club = clubById(x.club);
    let promoted = false; let relegated = false;
    if (a) {
      const champ = x.tier === 4 ? a.l3?.[club?.group ?? a.user?.group]?.[0]?.id : x.tier === 1 ? a.champion : a.tables?.[x.tier]?.[0]?.id;
      const isChamp = x.pos === 1 && (champ == null || champ === x.club);
      if (ok && isChamp && TITLE_BADGE[x.tier]) give(TITLE_BADGE[x.tier], end);
      promoted = !!a.promoted?.[x.tier - 1]?.includes(x.club);
      relegated = !!a.relegated?.[x.tier + 1]?.includes(x.club);
      if (ok && promoted) give('awans', end);
      if (ok && a.cup === x.club) give('puchar_polski', end);
      for (const k of ['LM', 'LE', 'LK']) if (ok && a.uefa?.[k] === x.club) give(UEFA_BADGE[k], end);
      if (relegated) C.scars.push({ date: null, season: x.season, clubName: club?.name ?? x.club, text: `Spadek z ${club?.name ?? x.club} (sezon ${x.season})` });
    } else if (x.pos === 1 && TITLE_BADGE[x.tier]) give(TITLE_BADGE[x.tier], end);
    if (x.target && x.pos && x.target - x.pos >= 3) give('cel_ponad_plan', end);
    const prev = mseasons[i - 1];
    const newcomer = prev && prev.club === x.club && prev.tier === x.tier + 1;
    if (x.pos && !relegated && !promoted && (newcomer || (x.target ?? 0) >= 14)) give('utrzymanie_beniaminek', end);
    for (const r of rows) if (r.c === 'super' || (r.c === 'uefa' && r.u === 'SEU')) { const aw = C.awards.find((w) => w.season === x.season && w.date === r.d && (w.badgeId === 'superpuchar_polski' || w.badgeId === 'superpuchar_europy')); if (aw) badges.push(aw.badgeId); }
    const w = rows.filter((r) => sideOf(fake(r), x.club).res === 'W').length; const l = rows.filter((r) => sideOf(fake(r), x.club).res === 'L').length;
    const lgRows = rows.filter((r) => isLeague(r.c) && !String(r.c).startsWith('playoff'));
    const pts = lgRows.reduce((s, r) => s + ({ W: 3, D: 1, L: 0 })[sideOf(fake(r), x.club).res], 0);
    if (lgRows.length >= 10) { const ppm = r2(pts / lgRows.length); if (!C.records.bestPpm || ppm > C.records.bestPpm.v) C.records.bestPpm = { v: ppm, season: x.season, clubId: x.club }; }
    const ppOut = rows.filter((r) => r.c === 'pp').map((r) => r.r);
    C.seasons.push({ season: x.season, clubId: x.club, clubName: club?.name ?? x.club, tier: x.tier, league: club ? (x.tier === club.tier ? leagueLabel(club) : LEAGUE_NAMES[x.tier] ?? 'III liga') : LEAGUE_NAMES[x.tier] ?? '',
      pos: x.pos ?? null, round: lgRows.length, target: x.target ?? null, goal: '', achieved: x.target && x.pos ? (x.target - x.pos >= 3 ? 'exceeded' : x.pos <= x.target ? 'met' : 'missed') : 'missed',
      w, d: rows.length - w - l, l, gf: rows.reduce((s, r) => s + sideOf(fake(r), x.club).gf, 0), ga: rows.reduce((s, r) => s + sideOf(fake(r), x.club).ga, 0), n: rows.length, pts,
      cup: ppOut.at(-1) ?? null, trophies: [...new Set(badges)], promoted, relegated, fired: false, repDelta: null, repEnd: null, reconstructed: true });
    if (promoted || badges.some((b) => TROPHY_BADGES.has(b))) C.lastSuccess = end;
  }
  if ((M.fired ?? 0) > 0) C.scars.push({ date: null, season: null, clubName: '', text: `Zwolnienia przed zapisem historii kariery: ${M.fired}` });
  // Bieżący sezon: licznik od początku pracy w obecnym klubie (bez dublowania: te mecze trafiają do seen)
  if (game.clubId && !unemployed(game)) {
    const open = C.stints.filter((s) => s.clubId === game.clubId && !s.to).at(-1);
    if (!open) C.stints.push({ clubId: game.clubId, clubName: clubById(game.clubId)?.name ?? game.clubId, from: game.date, to: null, tier: clubById(game.clubId)?.tier ?? null, league: leagueLabel(clubById(game.clubId)), why: null, matches: 0, w: 0, d: 0, l: 0 });
    const since = open?.from ?? game.date;
    C.stintFrom = since;
    C.cur = blankCur(cur, game.clubId, since);
    for (const r of rowsOf(cur, game.clubId).filter((r) => r.d >= since)) {
      const f = fake(r); const s2 = sideOf(f, game.clubId);
      const add = (o) => { o.n++; o.gf += s2.gf; o.ga += s2.ga; if (s2.res === 'W') o.w++; else if (s2.res === 'L') o.l++; else o.d++; };
      add(C.cur);
      if (isLeague(r.c) && !String(r.c).startsWith('playoff')) { add(C.cur.lg); C.cur.lg.pts += s2.res === 'W' ? 3 : s2.res === 'D' ? 1 : 0; }
      if (r.c === 'pp') C.cur.cup = r.r;
      C.seen.push(r.id);
    }
    // Trofea bieżącego sezonu już rozegrane (finały przed wczytaniem): z terminarza
    for (const f of game.fixtures ?? []) {
      if (!f.played || !f.result?.score || !(f.home === game.clubId || f.away === game.clubId) || f.date < since || C.seen.includes(f.id)) continue;
      if (competitive(f)) C.seen.push(f.id); // mecze bez wiersza historii: nie liczymy drugi raz
    }
    for (const f of game.fixtures ?? []) {
      if (!f.played || !(f.home === game.clubId || f.away === game.clubId) || f.date < since) continue;
      const won = (isDecider(f) ? tieWinner(f) ?? winnerOf(f) : null) === game.clubId;
      if (!won) continue;
      if (f.comp === 'pp' && f.round === 'F' && C.cur.n >= CAREER.trophyMatches) award(game, 'puchar_polski', f.date, game.clubId, { seen: true, reconstructed: true });
      if (f.comp === 'uefa' && f.round === 'F' && UEFA_BADGE[f.ucomp] && f.ucomp !== 'SEU' && C.cur.n >= CAREER.trophyMatches) award(game, UEFA_BADGE[f.ucomp], f.date, game.clubId, { seen: true, reconstructed: true });
    }
    // Superpuchar bieżącego sezonu: wiersz historii już przeszedł wyżej (pętla sezonów), więc tylko gdy brak historii
  }
  C.rep.hist = [];
  C.reconstructed = mseasons.length > 0 || C.tot.n > 0;
  if (!C.reconstructed) for (const st of C.stints) delete st.reconstructed;
  careerPress(game, { prime: true }); // konferencje sprzed zapisu kariery nie zmieniają popularności
  return C;
}

// ------------------------------------------------------------ Trenerzy AI: reputacja (parytet)
const AI = CAREER.ai;
/** Reputacja trenera AI (leniwie): 6 x (średnia atrybutów - 4) + premia za ligę ostatniego klubu. */
export function aiCoachRep(p, tier = null) {
  if (!p) return 0;
  if (p.rep == null) {
    const t = p.lastTier ?? tier ?? 3;
    p.rep = r1(clamp(AI.startW * (coachAvg(p) - AI.startRef) + (AI.start[t] ?? -3), 1, 90));
    p.repPeak = p.rep;
  }
  return p.rep;
}
function aiAdd(p, pts, tier, opts = {}) {
  aiCoachRep(p, tier);
  p.rep = r1(pts >= 0 ? repGain(p.rep, pts, tier, opts) : repLoss(p.rep, -pts));
  p.repPeak = Math.max(p.repPeak ?? p.rep, p.rep);
}
/** Zwolnienie trenera AI (wyniki, kibice, po sezonie): ta sama kara co u gracza. */
export function aiCoachFired(p, tier) { if (p && !p.caretaker) aiAdd(p, -CAREER.pen.fired, tier); }

/**
 * Koniec sezonu dla trenerów AI (przed zmianą lig): mistrzostwo, awans, puchary, cel z siły kadry, spadek, zanik.
 * matchesOf(clubId, p): mecze trenera w sezonie (trofeum po 12 meczach).
 */
export function aiCoachSeasonEnd(game, res, moves, matchesOf) {
  const E = CAREER.ev; const P = CAREER.pen;
  for (const [id, p] of Object.entries(game.coaches ?? {})) {
    const club = clubById(id);
    if (!club || club.parent || club.tier > 4 || p.caretaker || id === game.clubId) continue;
    const tier = club.tier;
    aiCoachRep(p, tier);
    const before = p.rep;
    const ok = matchesOf(id, p) >= CAREER.trophyMatches;
    const table = tier === 4 ? res.groupTables?.[club.group] ?? [] : res.tables?.[tier] ?? [];
    const pos = table.indexOf(id) + 1;
    if (ok && pos) {
      const g = seasonGoalFor(club);
      if (pos === 1) aiAdd(p, E.title[tier], tier, { noCap: true });
      if (moves.promoted?.[tier - 1]?.includes(id)) aiAdd(p, E.promo[tier - 1] ?? 3, tier);
      if (res.cup?.winner === id) aiAdd(p, E.pp, tier, { noCap: true });
      for (const k of ['LM', 'LE', 'LK']) if (res.uefa?.[k] === id) aiAdd(p, E[k], tier, { noCap: true });
      if (pos <= g.target) aiAdd(p, E.goalMet + Math.min(E.perPlaceMax, (g.target - pos) * E.perPlace), tier);
      if (moves.relegated?.[tier + 1]?.includes(id)) aiAdd(p, -(g.target >= 14 ? P.relegDog : P.relegFav), tier);
      else if (pos - g.target >= P.belowFrom) aiAdd(p, -Math.min(P.belowMax, P.perBelow * (pos - g.target - P.belowFrom + 1)), tier);
    }
    if (p.rep <= before && p.rep > 0.6 * (p.repPeak ?? p.rep)) p.rep = r1(Math.max(0.6 * p.repPeak, p.rep - AI.seasonDecay));
  }
}

/** Pula wolnych trenerów: zanik reputacji przy długim bezrobociu (od 6 miesięcy -0,4 na miesiąc, podłoga 0,6 szczytu). */
export function aiPoolDecay(pool, date) {
  for (const c of pool ?? []) {
    aiCoachRep(c);
    const idle = c.free ? daysBetween(c.free, date) / 30 : 12;
    const months = Math.min(12, Math.max(0, idle - 6));
    if (months > 0) c.rep = r1(Math.max(0.6 * (c.repPeak ?? c.rep), c.rep - AI.idleMonth * months));
  }
}

/** Składnik oceny kandydata przy zatrudnianiu: znane nazwisko w klubie poniżej swojej marki. */
export const hireRepTerm = (p, clubId) => AI.hireW * (aiCoachRep(p, p?.lastTier) - 0.6 * clubReputation(clubById(clubId) ?? { prestige: 3, tier: 4 }));

