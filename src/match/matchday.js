// Dzień meczowy gracza: studio przedmeczowe -> odprawa -> 1. połowa -> przerwa i odprawa ->
// 2. połowa (ew. dogrywka, karne) -> studio pomeczowe -> odprawa pomeczowa -> konferencja (opcjonalna, osobne okno).
// Łączy studio i odprawy (src/match), pełny silnik (src/engine/match) i skutki sezonu (src/season).
// Sesja żyje w pamięci; wynik i jego skutki trafiają do gry dopiero po końcowym gwizdku.

import { trainingMatchInput } from '../training/index.js';
import { stadiumCapacity } from '../career/finance.js';
import { attendanceModifier } from '../career/fans.js';
import { Rng } from '../core/rng.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { formationById } from '../data/formations.js';
import { COMPETITIONS } from '../config/competitions.js';
import { createMatch, step, resume, runToEnd, runToBreak, result as matchResult } from '../engine/match/match.js';
import { onPitch } from '../engine/match/teams.js';
import { statsFromEvents } from '../engine/matchStats.js';
import { createTactics, refreshTactics } from '../engine/lineup.js';
import { squadFor, anyClub, applyResult, fromEngineResult, walkoverScore, LEAGUE_COMPS, compLabel } from '../season/season.js';
import { standings } from '../season/standings.js';
import { winnerOf } from '../season/cup.js';
import { preMatchStudio, postMatchStudio, postMatchMessages, preMatchMessages } from './studio.js';
import {
  preMatchBriefing, halftimeBriefing, postMatchBriefing, assistantAdvice, aiBriefing, newSpeechMemory, closeMatchMemory,
  applyBriefing,
} from './briefings.js';
import {
  pressState, pickClimate, openConference, answerQuestion, walkOut as pressWalkOutConf, currentQuestion,
  conferenceEffects, skipEffects, nextPressState, pressMoraleDelta, roomPreview,
} from './press.js';
import { addMessages, createMessage } from '../core/inbox.js';
import { applyMorale } from '../career/morale.js';
import { isAvailable } from '../career/squad.js';

const REFEREES = ['Marek Wierzbicki', 'Tomasz Kwiecień', 'Paweł Sokołowski', 'Krzysztof Malec', 'Bartosz Frankowski-Nowak', 'Damian Kos', 'Jarosław Przybył', 'Łukasz Szczepan', 'Piotr Lasyk-Kral', 'Szymon Marcinek', 'Wojciech Myć-Ostrowski', 'Karol Arys-Wolny', 'Daniel Stefański-Mróz', 'Sebastian Jarzębak', 'Mariusz Złotek-Bąk'];

/** Pogoda zależna od miesiąca (prosto, deterministycznie z meczu). */
export function weatherFor(date, rng) {
  const m = Number(date.slice(5, 7));
  const winter = [12, 1, 2].includes(m); const summer = [6, 7, 8].includes(m);
  const type = rng.weighted(['slonce', 'pochmurno', 'deszcz', 'snieg', 'wiatr'], (t) => ({
    slonce: summer ? 5 : winter ? 1 : 3, pochmurno: 4, deszcz: summer ? 1.5 : 2.5, snieg: winter ? 2 : 0, wiatr: 1,
  })[t]);
  const base = summer ? 24 : winter ? -1 : 12;
  return { type, tempC: Math.round(base + rng.gauss(0, 5)) };
}

/** Wpływ pogody i murawy na silnik (ekspert 6.1 b). */
export function engineWeather(w, pitch) {
  const out = { conv: 1, foul: 1, inj: 1, fat: 1, act: 1, dys: 1, tempC: w.tempC }; // tempC: przerwa na schłodzenie w silniku (>= 32 st.)
  if (w.type === 'deszcz') Object.assign(out, { conv: 1.06, foul: 1.08, inj: 1.05, dys: 1.15 });
  if (w.type === 'snieg') Object.assign(out, { act: 0.92, fat: 1.1, inj: 1.1 });
  if (w.type === 'wiatr') out.dys = 0.85;
  if (w.tempC > 28) out.fat *= 1.3;
  if (w.tempC < -5) out.inj *= 1.15;
  if (pitch === 'zla') { out.fat *= 1.15; out.inj *= 1.2; }
  return out;
}

function compInfo(f) {
  if (LEAGUE_COMPS.includes(f.comp)) return { type: 'league', name: COMPETITIONS[f.comp].name, stage: 'main' };
  if (f.comp === 'pp') return { type: 'cup', name: 'Puchar Polski', stage: f.round === 'F' ? 'final' : 'main' };
  if (f.comp === 'super') return { type: 'supercup', name: 'Superpuchar Polski', stage: 'final' };
  if (f.comp === 'uefa') return { type: 'uefa', name: compLabel(f), stage: f.round === 'F' ? 'final' : 'main' };
  if (f.comp === 'friendly') return { type: 'friendly', name: 'Sparing', stage: 'main' };
  return { type: 'cup', name: compLabel(f), stage: f.round === 'F' ? 'final' : 'main' };
}

function teamCtx(game, clubId, comp, table, tactics) {
  const club = anyClub(clubId);
  const row = table?.find((r) => r.id === clubId);
  const last5 = (game.fixtures || []).filter((x) => x.played && x.result && (x.home === clubId || x.away === clubId))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-5)
    .map((x) => { const me = x.home === clubId ? 0 : 1; const [a, b] = x.result.score; return a === b ? 'R' : (me === 0 ? a > b : b > a) ? 'W' : 'P'; });
  return {
    id: clubId, name: club?.name ?? clubId, region: club?.region, prestige: club?.prestige ?? 3,
    squad: squadFor(game, clubId, comp), formation: formationById(tactics?.formation ?? '4231').name,
    last5, position: row?.pos ?? null, points: row?.points ?? null,
  };
}

/**
 * Skład gracza na mecz (docs/balans.md). Asystent zastępuje niedostępnych (refreshTactics), a gdy zastąpiony
 * zawodnik znów jest zdrowy i gracz nie ruszał tego miejsca, wraca do jedenastki. Wcześniej zastępstwo zostawało
 * na stałe, więc pasywny gracz po kilku kontuzjach grał rezerwowymi do końca sezonu.
 * tactics.assistant === true: skład przed każdym meczem wybiera asystent, tak jak w klubach AI (formacja i instrukcje gracza).
 */
export function matchTactics(game, squad, benchSize) {
  const prev = game.tactics;
  if (prev.assistant) return { ...createTactics(squad, { formation: prev.formation, instructions: prev.instructions, benchSize }), assistant: true };
  const subs = { ...(game.tacticsSubs ?? {}) }; // miejsce w jedenastce -> { orig: zastąpiony, sub: zastępca }
  const byId = new Map(squad.map((p) => [p.id, p]));
  const out = (id) => { const p = byId.get(id); return !p || !isAvailable(p); };
  const xi = [...prev.xi];
  let bench = [...prev.bench];
  // Zastępstwa zrobione przed dniem meczowym (ekran gry odświeża skład): miejsce zmienione, poprzedni zawodnik niedostępny
  const last = game.tacticsLast;
  if (last) {
    xi.forEach((id, i) => {
      const was = last[i];
      if (!was || id === was || !byId.has(was) || !out(was)) return;
      if (subs[i] && subs[i].sub === was) subs[i] = { ...subs[i], sub: id }; // zastępca też wypadł
      else if (!subs[i]) subs[i] = { orig: was, sub: id };
    });
  }
  for (const [i, s] of Object.entries(subs)) {
    const o = byId.get(s.orig);
    if (xi[i] !== s.sub || !o || xi.includes(s.orig)) { delete subs[i]; continue; } // gracz sam zmienił to miejsce
    if (!isAvailable(o)) continue;
    xi[i] = s.orig;
    bench = bench.filter((id) => id !== s.orig);
    if (!bench.includes(s.sub) && byId.has(s.sub)) bench = [...bench.slice(0, Math.max(0, benchSize - 1)), s.sub];
    delete subs[i];
  }
  const { tactics } = refreshTactics({ ...prev, xi, bench }, squad, { benchSize });
  tactics.xi.forEach((id, i) => {
    if (!xi[i] || id === xi[i]) return;
    subs[i] = subs[i] ? { ...subs[i], sub: id } : { orig: xi[i], sub: id };
  });
  game.tacticsSubs = subs;
  game.tacticsLast = [...tactics.xi];
  return tactics;
}

/** Zaczyna dzień meczowy dla meczu gracza. */
export function startMatchday(game, f) {
  const rng = new Rng(`dzien-meczowy:${game.seed}:${f.id}`);
  const userSide = f.home === game.clubId ? 0 : 1;
  const oppId = userSide === 0 ? f.away : f.home;
  const comp = f.comp;
  const tier = clubById(game.clubId)?.tier;
  const table = LEAGUE_COMPS.includes(comp)
    ? standings(game.fixtures.filter((x) => x.comp === comp), CLUBS_PL.filter((c) => c.tier === COMPETITIONS[comp].tier).map((c) => c.id)) : null;
  const benchSize = (LEAGUE_COMPS.includes(comp) ? COMPETITIONS[comp].benchSize : 12);
  const mySquad = squadFor(game, game.clubId, comp);
  game.tactics = matchTactics(game, mySquad, benchSize);
  const oppSquad = squadFor(game, oppId, comp);
  const oppTactics = createTactics(oppSquad, { benchSize });
  const weather = weatherFor(f.date, rng);
  const pitch = rng.weighted(['doskonala', 'dobra', 'zla', 'sztuczna'], (p) => ({ doskonala: 2, dobra: 6, zla: weather.type === 'deszcz' || weather.type === 'snieg' ? 2 : 0.5, sztuczna: 0.6 })[p]);
  const referee = { name: rng.pick(REFEREES), strictness: Math.round(Math.max(0.7, Math.min(1.4, rng.gauss(1, 0.13))) * 100) / 100 };
  const hasVar = comp === 'ekstraklasa' || comp === 'super' || comp === 'uefa' || (comp === 'pp' && ['SF', 'F'].includes(f.round));
  const h2h = (game.fixtures || []).filter((x) => x.played && x.result && ((x.home === f.home && x.away === f.away) || (x.home === f.away && x.away === f.home)))
    .map((x) => ({ date: x.date, home: x.home, away: x.away, score: x.result.score }));
  game.board = game.board ?? { trust: 60, fansMood: 55 };
  const preCtx = {
    home: teamCtx(game, f.home, comp, table, userSide === 0 ? game.tactics : oppTactics),
    away: teamCtx(game, f.away, comp, table, userSide === 1 ? game.tactics : oppTactics),
    competition: compInfo(f), neutral: !!f.neutral, h2h, referee, weather, pitch, var: hasVar,
    stadium: { capacity: f.neutral ? 58000 : stadiumCapacity(anyClub(f.home)) },
    board: { trust: game.board.trust }, fans: { mood: game.board.fansMood }, headlineHistory: game.headlineHistory ?? [],
    date: f.date, seed: `${game.seed}`, userClubId: game.clubId,
    table: table ? { roundsPlayed: Math.max(...table.map((r) => r.played)), roundsTotal: 34, size: table.length } : null,
  };
  const pre = preMatchStudio(preCtx);
  // Frekwencja: zamknięte sektory, bojkot, mecz bez publiczności
  const fanMul = attendanceModifier(game, f.home, f);
  if (pre.conditions?.attendance) pre.conditions.attendance.expected = Math.round(pre.conditions.attendance.expected * fanMul / 100) * 100;
  return {
    fixtureId: f.id, f, userSide, oppId, comp, tier, step: 'studio', pre, preCtx, weather, pitch, referee, hasVar,
    oppTactics, benchSize, memory: game.speechMemory ?? newSpeechMemory(), M: null, briefings: {}, post: null, pressRoom: null,
  };
}

/** Zawodnicy kadry meczowej gracza (jedenastka + ławka) jako obiekty świata. */
export function matchSquadPlayers(game, S) {
  const squad = squadFor(game, game.clubId, S.comp);
  const byId = new Map(squad.map((p) => [p.id, p]));
  return [...game.tactics.xi, ...game.tactics.bench].map((id) => byId.get(id)).filter(Boolean);
}

export function preAdvice(game, S) {
  return assistantAdvice('pre', matchSquadPlayers(game, S), { ...S.pre.forBriefing, clubId: game.clubId, date: S.f.date }, S.memory);
}

/** Odprawa przedmeczowa gracza; zwraca reakcje do pokazania (bez liczb). */
export function doPreBriefing(game, S, tone, talks = []) {
  const res = preMatchBriefing({ players: matchSquadPlayers(game, S), tone, talks, memory: S.memory, ctx: { ...S.pre.forBriefing, clubId: game.clubId, date: S.f.date }, seed: `${game.seed}:${S.f.id}:pre` });
  S.memory = res.memory;
  S.briefings.pre = res;
  for (const p of matchSquadPlayers(game, S)) { const w = game.world.players[p.id]; if (w) Object.assign(w, applyBriefing(w, res)); }
  return res;
}

function personaMix(squad) {
  const mix = {};
  for (const p of squad) mix[p.persona ?? 'Spokojny'] = (mix[p.persona ?? 'Spokojny'] ?? 0) + 1;
  return mix;
}

/** Tworzy mecz w silniku (po odprawie). */
export function kickOff(game, S) {
  const mySquad = squadFor(game, game.clubId, S.comp);
  const oppSquad = squadFor(game, S.oppId, S.comp);
  const oppClub = anyClub(S.oppId);
  const ai = aiBriefing({ coach: oppClub?.coach ?? 'P', personaMix: personaMix(oppSquad) }, { phase: 'pre', pWin: 1 - (S.pre.forBriefing.pWin ?? 0.4), rank: S.pre.forBriefing.rank }, `${game.seed}:${S.f.id}:ai`);
  const zOpp = Object.fromEntries(oppSquad.map((p) => [p.id, ai.zByPersona[p.persona] ?? ai.teamZ]));
  const mine = { club: anyClub(game.clubId), squad: mySquad, tactics: game.tactics, ai: false, coach: 'P', zStart: S.briefings.pre?.engine?.zStart ?? {} };
  const theirs = { club: oppClub, squad: oppSquad, tactics: S.oppTactics, ai: true, coach: oppClub?.coach ?? 'P', zStart: zOpp };
  // Trening: spójność zespołu na start meczu i stałe fragmenty (src/training)
  Object.assign(mine, trainingMatchInput(game, game.clubId, mine));
  Object.assign(theirs, trainingMatchInput(game, S.oppId, theirs));
  S.M = createMatch({
    seed: `${game.seed}:${S.f.id}`,
    home: S.userSide === 0 ? mine : theirs,
    away: S.userSide === 0 ? theirs : mine,
    ctx: {
      neutral: !!S.f.neutral, var: S.hasVar, rank: S.pre.preview.rank.level, refStrict: S.referee.strictness,
      concussionSubs: false, // zmiany po wstrząśnieniu mózgu: flaga rozgrywek (UEFA ich nie stosuje, brak potwierdzenia dla Ekstraklasy)
      attendance: S.pre.conditions.attendance.fill, weather: engineWeather(S.weather, S.pitch),
      knockout: S.f.knockout === 'single' ? 'single' : S.f.knockout?.firstLeg ? { firstLeg: [...S.f.knockout.firstLeg] } : false,
    },
  });
  S.step = 'live1';
  return S.M;
}

/** Oceny w trakcie meczu (do przerwy): 6 + suma zdarzeń zawodnika. */
export function liveRatings(S) {
  const out = {};
  for (const T of S.M.teams) for (const x of T.players) if (x.minOn !== null) out[x.id] = Math.round(Math.max(3, Math.min(10, 6 + x.ev)) * 10) / 10;
  return out;
}

export function halfInfo(S) {
  const M = S.M;
  const stats = statsFromEvents(M.events);
  const u = S.userSide;
  const mom = M.momentum.slice(-15);
  const momentum = mom.length ? Math.round(mom.reduce((s, v) => s + v, 0) / mom.length) * (u === 0 ? 1 : -1) : 0;
  return {
    stats, score: { for: M.score[u], against: M.score[1 - u] }, xgFor: stats[u].xg, xgAgainst: stats[1 - u].xg,
    possession: stats[u].possession, momentum, ratings: liveRatings(S),
    onYellow: M.teams[u].players.filter((x) => x.yc && !x.sentOff).map((x) => x.id),
  };
}

export function halfAdvice(game, S) {
  const h = halfInfo(S);
  return assistantAdvice('half', onPitchPlayers(S), { ...h, clubId: game.clubId, rank: S.pre.forBriefing.rank, pWin: S.pre.forBriefing.pWin }, S.memory);
}

function onPitchPlayers(S) {
  const T = S.M.teams[S.userSide];
  return [...onPitch(T, S.M.minute), ...T.bench].map((x) => x.p);
}

/** Odprawa w przerwie: nowy poziom zaangażowania na 2. połowę. */
export function doHalfBriefing(game, S, tone, talks = []) {
  const h = halfInfo(S);
  const res = halftimeBriefing({ players: onPitchPlayers(S), tone, talks, memory: S.memory, ctx: { ...h, clubId: game.clubId, rank: S.pre.forBriefing.rank, pWin: S.pre.forBriefing.pWin, date: S.f.date }, seed: `${game.seed}:${S.f.id}:half` });
  S.memory = res.memory;
  S.briefings.half = res;
  const T = S.M.teams[S.userSide];
  for (const x of [...T.players, ...T.bench]) if (res.engine.zStart[x.id] != null) x.Z = res.engine.zStart[x.id];
  // AI rywala też ma odprawę
  const O = S.M.teams[1 - S.userSide];
  const ai = aiBriefing({ coach: O.coach, personaMix: personaMix(O.players.map((x) => x.p)) }, { phase: 'half', diff: -h.score.for + h.score.against, xgDiff: h.xgAgainst - h.xgFor, pWin: 1 - (S.pre.forBriefing.pWin ?? 0.4) }, `${game.seed}:${S.f.id}:aihalf`);
  for (const x of O.players) x.Z = ai.zByPersona[x.p.persona] ?? ai.teamZ;
  for (const p of onPitchPlayers(S)) { const w = game.world.players[p.id]; if (w) Object.assign(w, applyBriefing(w, res)); }
  return res;
}

/** Jedna minuta meczu (UI). */
export function tick(S) {
  const r = step(S.M);
  if (r.state === 'break' && S.step === 'live1') S.step = 'break';
  else if (r.state === 'break') S.step = 'etbreak';
  if (r.state === 'ended') S.step = 'fulltime';
  return r;
}

export function continueAfterBreak(S) {
  resume(S.M);
  S.step = S.M.half === 2 ? 'live2' : 'live2';
}

/** „Pokaż wynik od razu”: do przerwy albo do końca (zmiany robi asystent gracza). */
export function skip(S) {
  if (S.step === 'live1') { runToBreak(S.M, { assistantFor: [S.userSide] }); if (S.M.phase === 'break') S.step = 'break'; if (S.M.ended) S.step = 'fulltime'; return; }
  runToEnd(S.M, { assistantFor: [S.userSide] });
  S.step = 'fulltime';
}

/** Koniec meczu: zapis wyniku i skutków, studio pomeczowe, wiadomości. */
export function finishMatchday(game, S) {
  if (S.post) return S.post;
  const M = S.M;
  if (M.phase === 'break' && !M.ended) runToEnd(M, { assistantFor: [S.userSide] });
  const r = matchResult(M);
  r.score = walkoverScore(r); // mecz przerwany (za mało zawodników): walkower 0:3, chyba że wynik był wyższy
  if (S.f.knockout === 'penaltiesOnly' && r.score[0] === r.score[1] && !r.shootout) {
    const rng = new Rng(`karne:${S.f.id}`);
    r.shootout = { goals: rng.chance(0.5) ? [4, 3] : [3, 4], kicks: [] };
  }
  const tableBefore = S.preCtx.table ? standings(game.fixtures.filter((x) => x.comp === S.comp), CLUBS_PL.filter((c) => c.tier === COMPETITIONS[S.comp].tier).map((c) => c.id)) : null;
  const rng = new Rng(`wynik:${game.seed}:${S.f.id}`);
  const msgs = applyResult(game, S.f, fromEngineResult(r), rng);
  const names = new Map([...M.teams[0].players, ...M.teams[0].bench, ...M.teams[1].players, ...M.teams[1].bench].map((x) => [x.id, x.p.name]));
  const events = M.events.map((e) => ({ ...e, name: e.pid ? names.get(e.pid) : e.ogId ? names.get(e.ogId) : undefined, assistName: e.aid ? names.get(e.aid) : undefined, minute: e.min }));
  const post = postMatchStudio({
    home: { id: S.f.home, name: anyClub(S.f.home).name }, away: { id: S.f.away, name: anyClub(S.f.away).name },
    competition: S.preCtx.competition, events: events.map(toStudioEvent), ratings: r.ratings, pre: S.pre.forPost,
    board: { trust: game.board.trust }, headlineHistory: game.headlineHistory ?? [], date: S.f.date, seed: `${game.seed}`,
    userClubId: game.clubId, referee: S.referee, tableBefore,
  });
  if (S.f.comp !== 'friendly') { // sparing nie zmienia ocen zarządu i kibiców
    game.board.trust = Math.max(0, Math.min(100, game.board.trust + post.reactions.board.delta));
    game.board.fansMood = Math.max(0, Math.min(100, game.board.fansMood + post.reactions.fans.delta));
  }
  game.headlineHistory = post.headlineHistory;
  const inbox = [...postMatchMessages(post, { date: S.f.date, matchId: S.f.id }), ...preMatchMessages(S.pre, { date: S.f.date, matchId: S.f.id })];
  game.inbox = addMessages(game.inbox, inbox).inbox;
  void msgs;
  S.result = r;
  S.post = post;
  S.step = 'studio2';
  return post;
}

/** Zdarzenia silnika w formacie studia (minuta jako liczba, strona jako 'home'/'away'). */
function toStudioEvent(e) {
  const m = /^(\d+)(?:\+(\d+))?'$/.exec(e.min ?? '');
  return {
    ...e, min: m ? Number(m[1]) : null, added: m?.[2] ? Number(m[2]) : 0, // strona zostaje liczbą (statsFromEvents)
    player: e.player ?? e.pid, // studio (pauzy, kontuzje) czyta zawodnika z `player`, silnik podaje `pid`
    penalty: e.how === 'PEN', second: /druga żółta/.test(e.text ?? ''), days: e.injury?.days, injuryType: e.injury?.name,
  };
}

export function doPostBriefing(game, S, tone, talks = []) {
  const ids = new Set(S.result.ratings.filter((x) => x.side === S.userSide).map((x) => x.id));
  const players = squadFor(game, game.clubId, S.comp).filter((p) => ids.has(p.id));
  const res = postMatchBriefing({ players, tone, talks, memory: S.memory, ctx: S.post.forBriefing, seed: `${game.seed}:${S.f.id}:post` });
  S.memory = res.memory;
  S.briefings.post = res;
  for (const p of players) { const w = game.world.players[p.id]; if (w) Object.assign(w, applyBriefing(w, res)); }
  return res;
}

// ------------------------------------------------------------ Konferencja prasowa (src/match/press.js)

const resOf = (x, clubId) => { const me = x.home === clubId ? 0 : 1; const [a, b] = x.result.score; return a === b ? 'R' : (me === 0 ? a > b : b > a) ? 'W' : 'P'; };

/** Kontekst prasy po meczu gracza (wynik, forma, tabela, zawodnicy z nazwiskami). Wymaga S.post. */
export function pressCtx(game, S) {
  const clubId = game.clubId;
  const club = anyClub(clubId);
  const u = S.userSide;
  const { for: gf, against: ga } = S.post.forBriefing.score;
  const res = gf > ga ? 'W' : gf === ga ? 'R' : 'P';
  const pts = res === 'W' ? 3 : res === 'R' ? 1 : 0;
  const pWin = S.pre?.forPost?.pWin ?? 0.4; const pDraw = S.pre?.forPost?.pDraw ?? 0.27;
  const results = (game.fixtures || []).filter((x) => x.played && x.result && x.comp !== 'friendly' && (x.home === clubId || x.away === clubId))
    .sort((a, b) => a.date.localeCompare(b.date)).map((x) => resOf(x, clubId));
  const streak = (r) => { let n = 0; for (let i = results.length - 1; i >= 0 && results[i] === r; i--) n++; return n; };
  const name = (id) => game.world.players[id]?.name ?? null;
  const mine = (S.result?.ratings ?? []).filter((x) => x.side === u && name(x.id)).map((x) => ({ id: x.id, name: name(x.id), rating: x.rating, ovr: game.world.players[x.id]?.ovr ?? 0 }));
  const motm = S.post.motm && mine.find((x) => x.id === S.post.motm.id);
  const worst = [...mine].sort((a, b) => a.rating - b.rating)[0];
  const rumour = [...mine].sort((a, b) => b.ovr - a.ovr)[0];
  const ev = S.M?.events ?? [];
  const red = ev.find((e) => e.type === 'red' && e.side === u && e.pid);
  const userName = club?.name;
  const inj = (S.post.injuries ?? []).filter((x) => x.team === userName && (x.days ?? 0) >= 14).sort((a, b) => b.days - a.days)[0];
  const tableRow = S.post.table?.rows?.find((r) => r.id === clubId);
  const size = S.post.table?.rows?.length ?? 0;
  const goal = game.board?.goal;
  return {
    gameSeed: `${game.seed}`, clubId, clubName: club?.name ?? clubId, oppName: anyClub(S.oppId)?.name ?? '', region: club?.region,
    prestige: club?.prestige ?? 5, tier: club?.tier ?? 1, coach: game.manager?.profile?.lastName || 'Trener',
    userHome: u === 0, neutral: !!S.f.neutral, date: S.f.date, season: game.season, matchId: S.f.id, comp: S.comp,
    res, gf, ga, margin: gf - ga, pts, expPts: Math.round((3 * pWin + pDraw) * 100) / 100,
    xgFor: S.post.forBriefing.xgFor ?? 0, xgAgainst: S.post.forBriefing.xgAgainst ?? 0,
    derby: !!S.post.forBriefing.press?.derby, controversy: (S.post.controversies ?? []).length > 0,
    againstUs: ev.some((e) => (e.type === 'red' && e.side === u) || (e.type === 'penalty' && e.side !== u) || (e.type === 'varOverturn' && e.side === u && e.cancelGoal)),
    refName: S.referee?.name ?? '',
    last5: results.slice(-5), winStreak: streak('W'), lossStreak: streak('P'),
    boardTrust: game.board?.trust ?? 60, fansMood: game.board?.fansMood ?? 55,
    position: LEAGUE_COMPS.includes(S.comp) ? (tableRow?.pos ?? S.post.table?.user?.after ?? null) : null,
    roundsPlayed: tableRow?.p ?? 0, relegationFrom: size >= 10 ? size - 2 : null,
    goalTarget: LEAGUE_COMPS.includes(S.comp) ? goal?.target ?? null : null, goalText: goal?.text ?? null,
    star: motm ? { id: motm.id, name: motm.name } : null, worst: worst && worst.rating < 6.4 ? { id: worst.id, name: worst.name } : null,
    rumour: rumour ? { id: rumour.id, name: rumour.name } : null, redUser: red ? { id: red.pid, name: name(red.pid) ?? 'Zawodnik' } : null,
    injured: inj?.id ? { id: inj.id, name: inj.name } : null,
  };
}

/**
 * Klimat prasy i dane sali (leniwie, deterministycznie: to samo ziarno daje ten sam klimat).
 * Sparing nie ma konferencji ani presji prasy (null).
 */
export function pressSetup(game, S) {
  if (!S.post || S.comp === 'friendly') return null;
  if (!S.pressRoom) {
    const state = pressState(game);
    const ctx = pressCtx(game, S);
    const seed = `prasa:${game.seed}:${S.f.id}`;
    S.pressRoom = { ctx, seed, climate: pickClimate(ctx, state, seed), state: JSON.parse(JSON.stringify(state)) };
  }
  return S.pressRoom;
}

/** Kto czeka w sali (przed otwarciem okna). */
export function pressRoomPreview(game, S) {
  const room = pressSetup(game, S);
  return room ? roomPreview(room.climate.climate, room.ctx) : [];
}

/** Otwiera salę (okno konferencji). Ponowne otwarcie wraca do tej samej sesji. */
export function pressOpen(game, S) {
  const room = pressSetup(game, S);
  if (!room || S.pressSettled) return S.pressConf ?? null;
  S.pressConf = S.pressConf ?? openConference(room.ctx, room.state, room.climate, room.seed);
  return S.pressConf;
}

/** Odpowiedź na bieżące pytanie; po ostatnim rozlicza konferencję. */
export function pressAnswer(game, S, i) {
  if (!S.pressConf || S.pressSettled) return S.pressConf;
  S.pressConf = answerQuestion(S.pressConf, i);
  if (S.pressConf.done) doPress(game, S);
  return S.pressConf;
}

/** Wyjście z sali przed końcem. */
export function pressWalkOut(game, S) {
  if (!S.pressConf || S.pressSettled) return S.pressConf;
  S.pressConf = pressWalkOutConf(S.pressConf);
  doPress(game, S);
  return S.pressConf;
}

/**
 * Rozlicza konferencję. answers (opcjonalnie): indeksy odpowiedzi na pozostałe pytania (testy, szybka ścieżka).
 * Zwraca skutki (conferenceEffects).
 */
export function doPress(game, S, answers = []) {
  if (S.pressSettled) return S.pressResult;
  const conf = pressOpen(game, S);
  if (!conf) return null;
  let c = conf; let k = 0;
  while (!c.done && currentQuestion(c) && k < 12) c = answerQuestion(c, answers[k++] ?? 0);
  S.pressConf = c;
  return settlePress(game, S, conferenceEffects(c));
}

/** Pominięcie konferencji (Dalej): presja prasy bez osłony trenera. */
export function skipPress(game, S) {
  if (S.pressSettled) return S.pressResult;
  const room = pressSetup(game, S);
  if (!room) return null;
  return settlePress(game, S, skipEffects(room.ctx, room.climate.climate, room.state));
}

/** Jedno miejsce, które zapisuje skutki prasy w grze (dokładnie raz na mecz). */
function settlePress(game, S, eff) {
  const room = S.pressRoom;
  game.board.trust = Math.max(0, Math.min(100, Math.round(game.board.trust + eff.board)));
  game.board.fansMood = Math.max(0, Math.min(100, Math.round(game.board.fansMood + eff.fans)));
  const extra = new Map((eff.players ?? []).map((p) => [p.id, p.d]));
  for (const id of game.world.clubs[game.clubId]?.squad ?? []) {
    const p = game.world.players[id];
    if (!p) continue;
    const d = Math.max(-3, Math.min(2, pressMoraleDelta(eff.teamMorale, p.persona) + (extra.get(id) ?? 0))); // [SZAC] limit na zawodnika
    if (d) p.morale = applyMorale(p.morale ?? 12, d);
  }
  game.press = nextPressState(pressState(game), eff, { climate: room.climate.climate, date: S.f.date, season: game.season, matchId: S.f.id, seed: room.seed });
  if (eff.headline) {
    const body = eff.mode === 'skipped' ? 'Trener nie pojawił się na konferencji prasowej po meczu.'
      : eff.quotes.slice(0, 3).map((q) => `„${q.text}”`).join(' ');
    game.inbox = addMessages(game.inbox ?? [], [createMessage({ date: S.f.date, category: 'media', from: eff.headline.outlet, key: `prasa:${S.f.id}`, subject: eff.headline.text, body })]).inbox;
  }
  S.pressResult = eff;
  S.pressSettled = true;
  return eff;
}

/** Zamknięcie dnia meczowego: pamięć przemów na kolejne mecze. */
export function closeMatchday(game, S) {
  if (S.post && !S.pressSettled) skipPress(game, S); // Dalej bez konferencji: prasa i tak pisze
  game.speechMemory = closeMatchMemory(S.memory);
  S.step = 'done';
}

export { winnerOf };
