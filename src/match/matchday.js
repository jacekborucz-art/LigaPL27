// Dzień meczowy gracza: studio przedmeczowe -> odprawa -> 1. połowa -> przerwa i odprawa ->
// 2. połowa (ew. dogrywka, karne) -> studio pomeczowe -> odprawa pomeczowa -> konferencja (opcjonalna, osobne okno).
// Łączy studio i odprawy (src/match), pełny silnik (src/engine/match) i skutki sezonu (src/season).
// Sesja żyje w pamięci; wynik i jego skutki trafiają do gry dopiero po końcowym gwizdku.

import { trainingMatchInput } from '../training/index.js';
import { recordMatch, scoutingNote, scoutingWarning } from '../training/scouting.js';
import { noteAttention } from '../career/attention.js';
import { logEngage } from '../career/authority.js';
import { stadiumCapacity } from '../career/finance.js';
import { attendanceModifier, rivalry } from '../career/fans.js';
import { Rng } from '../core/rng.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { formationById } from '../data/formations.js';
import { COMPETITIONS } from '../config/competitions.js';
import {
  createMatch, step, resume, runToEnd, runToBreak, result as matchResult, liveRatings as engineLiveRatings,
  shootoutCandidates, setShootoutOrder, startShootout, assistantSuggest, applySuggestion, subsAvailable,
} from '../engine/match/match.js';
import { aiDecide } from '../engine/match/coach.js';
import { onPitch, goalkeeper, fieldPlayers } from '../engine/match/teams.js';
import { autoPickBench } from '../engine/lineup.js';
import { statsFromEvents } from '../engine/matchStats.js';
import { createTactics, refreshTactics } from '../engine/lineup.js';
import { squadFor, anyClub, applyResult, fromEngineResult, walkoverScore, LEAGUE_COMPS, compLabel } from '../season/season.js';
import { standings } from '../season/standings.js';
import { winnerOf } from '../season/cup.js';
import { preMatchStudio, postMatchStudio, postMatchMessages, preMatchMessages, odds1X2, matchRank, boardExpectation } from './studio.js';
import { aiPlanTactics } from './aiPlan.js';
import { coachOf, coachStyle, matchCoach, formRng, assistantProfile, coachBlurb, COACH } from '../career/coaches.js';
import { staffQ } from '../training/staff.js';
import {
  preMatchBriefing, halftimeBriefing, postMatchBriefing, assistantAdvice, aiBriefing, newSpeechMemory, closeMatchMemory,
  applyBriefing, POST_TONES, briefingContext, toneQuotes,
} from './briefings.js';
import {
  pressState, pickClimate, openConference, answerQuestion, walkOut as pressWalkOutConf, currentQuestion,
  conferenceEffects, skipEffects, nextPressState, nextPressStatePre, pressMoraleDelta, roomPreview, openCase,
} from './press.js';
import './pressSystem.js'; // decyzje komisji dyscyplinarnych po słowach o sędziach
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
  // round, leg, ucomp i playoff: dane dla kontekstu odprawy i oczekiwań zarządu (docs/odprawy-kontekst.md)
  const more = { round: f.round ?? null, leg: f.leg ?? null, ucomp: f.ucomp ?? null, playoff: String(f.comp).startsWith('playoff') };
  if (LEAGUE_COMPS.includes(f.comp)) return { type: 'league', name: COMPETITIONS[f.comp].name, stage: 'main', ...more };
  if (f.comp === 'pp') return { type: 'cup', name: 'Puchar Polski', stage: f.round === 'F' ? 'final' : 'main', ...more };
  if (f.comp === 'super') return { type: 'supercup', name: 'Superpuchar Polski', stage: 'final', ...more };
  if (f.comp === 'uefa') return { type: 'uefa', name: compLabel(f), stage: f.round === 'F' ? 'final' : 'main', ...more };
  if (f.comp === 'friendly') return { type: 'friendly', name: 'Sparing', stage: 'main', ...more };
  return { type: 'cup', name: compLabel(f), stage: f.round === 'F' ? 'final' : 'main', ...more };
}

/**
 * Kontekst odprawy (briefings.js briefingContext): rodzaj meczu, stawka w tabeli, różnica sił, derby, dwumecz.
 * Liczony leniwie i zapamiętany w sesji (S.talkCtx), więc działa też dla dnia meczowego zapisanego wcześniej.
 * Zmienia tylko teksty odpraw; efekty przemów są te same.
 */
export function talkContext(game, S) {
  if (S.talkCtx) return S.talkCtx;
  const f = S.f;
  const u = S.userSide;
  const ci = compInfo(f);
  const odds = S.pre?.odds;
  const pWin = S.pre?.forBriefing?.pWin ?? (odds ? (u === 0 ? odds.home : odds.away) : 0.4);
  const pLose = odds ? (u === 0 ? odds.away : odds.home) : null;
  const fl = f.knockout?.firstLeg;
  let table = null;
  if (LEAGUE_COMPS.includes(f.comp)) {
    const cfg = COMPETITIONS[f.comp];
    const rows = standings(game.fixtures.filter((x) => x.comp === f.comp), CLUBS_PL.filter((c) => c.tier === cfg.tier).map((c) => c.id));
    const me = rows.find((r) => r.id === game.clubId);
    const opp = rows.find((r) => r.id === S.oppId);
    const size = rows.length;
    const ptsAt = (pos) => rows[Math.min(size, Math.max(1, pos)) - 1]?.points ?? 0;
    // pierwsze miejsce zagrożone: baraż o utrzymanie albo spadek bezpośredni; cel w górze tabeli: puchary (Ekstraklasa) albo baraże
    const relFrom = cfg.relegationPlayoff?.places?.[0] ?? (size - (cfg.relegationDirect ?? 2) + 1);
    const targetTo = cfg.tier === 1 ? 4 : (cfg.promotionPlayoff?.places?.[1] ?? cfg.promotionDirect ?? 2);
    if (me) {
      table = {
        tier: cfg.tier, pos: me.pos, points: me.points, oppPos: opp?.pos ?? null, oppPoints: opp?.points ?? null, played: me.played,
        total: 2 * (size - 1), leaderPts: ptsAt(1), secondPts: ptsAt(2), relFrom, dropPts: ptsAt(relFrom), targetTo, targetPts: ptsAt(targetTo),
      };
    }
  }
  const c = briefingContext({
    type: ci.type, title: compLabel(f), round: f.round ?? null, ucomp: f.ucomp ?? null, leg: f.leg ?? null, playoff: ci.playoff, stage: ci.stage,
    firstLeg: Array.isArray(fl) ? [fl[u], fl[1 - u]] : null, venue: f.neutral ? 'neutral' : u === 0 ? 'home' : 'away',
    pWin, pLose, tags: S.pre?.preview?.rank?.tags ?? [], rivalry: rivalry(game.clubId, S.oppId), last5: S.pre?.forBriefing?.last5 ?? [], table,
  });
  c.board = boardExpectation(pWin, ci);
  S.talkCtx = c;
  return c;
}

/** Rozstrzygnięcie meczu pucharowego dla tekstów po meczu: awans, odpadnięcie, trofeum, awans do wyższej ligi. */
function postOutcome(S, c) {
  if (!c.knockout || !S.result || c.leg?.n === 1) return null;
  const u = S.userSide;
  let us = S.result.score[u];
  let them = S.result.score[1 - u];
  if (c.leg?.n === 2 && c.leg.first) { us += c.leg.first[0]; them += c.leg.first[1]; }
  let won = us > them ? true : us < them ? false : null;
  const so = S.result.shootout?.goals;
  if (won === null && so) won = so[u] > so[1 - u];
  if (won === null) return null;
  if (c.kind === 'playoffFinal') return won ? 'promoted' : 'pout';
  if (c.kind === 'playoffSemi') return won ? 'padv' : 'pout';
  if (c.final) return won ? 'trophy' : 'lostFinal';
  return won ? 'adv' : 'out';
}

/** Kontekst odprawy pomeczowej: kontekst meczu i rozstrzygnięcie (wymaga S.result). */
export function postTalkContext(game, S) {
  const c = talkContext(game, S);
  return { ...c, outcome: postOutcome(S, c) };
}

/**
 * Cytaty przemów na ekranie odprawy, te same co w wyniku odprawy (to samo ziarno i kontekst).
 * Zwraca { ton: { label, quote } }.
 */
export function talkQuotes(game, S, phase) {
  const seed = `${game.seed}:${S.f.id}:${phase}`;
  if (phase === 'pre') return toneQuotes('pre', talkContext(game, S), { seed });
  if (phase === 'half') {
    const u = S.userSide;
    return toneQuotes('half', talkContext(game, S), { seed, score: { for: S.M.score[u], against: S.M.score[1 - u] } });
  }
  const { for: gf, against: ga } = S.post.forBriefing.score;
  return toneQuotes('post', postTalkContext(game, S), { seed, result: gf > ga ? 'W' : gf === ga ? 'D' : 'L' });
}

/** Zdanie kontekstu nad przemowami (rodzaj meczu, stawka, oczekiwanie zarządu; w przerwie wynik i dwumecz). */
export function talkContextText(game, S, phase) {
  const c = talkContext(game, S);
  if (phase === 'pre') return [c.label, c.board].filter(Boolean).join('. ').replace(/\.\./g, '.');
  if (phase === 'half') {
    const u = S.userSide;
    const gf = S.M.score[u]; const ga = S.M.score[1 - u];
    const agg = c.leg?.n === 2 && c.leg.first ? ` W dwumeczu ${gf + c.leg.first[0]}:${ga + c.leg.first[1]}.` : '';
    return `Przerwa przy ${S.M.score[0]}:${S.M.score[1]}.${agg} Zmiany w przerwie nie zużywają okna.`;
  }
  return `${S.post.result.label} ${S.post.result.score}. ${S.post.reactions.board.text}`;
}

function teamCtx(game, clubId, comp, table, tactics) {
  const club = anyClub(clubId);
  const row = table?.find((r) => r.id === clubId);
  const last5 = (game.fixtures || []).filter((x) => x.played && x.result && (x.home === clubId || x.away === clubId))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-5)
    .map((x) => { const me = x.home === clubId ? 0 : 1; const [a, b] = x.result.score; return a === b ? 'R' : (me === 0 ? a > b : b > a) ? 'W' : 'P'; });
  // Trener klubu AI w zapowiedzi meczu: imię, styl i jedno zdanie o mocnych i słabych stronach (bez liczb)
  const coach = clubId !== game.clubId ? coachOf(game, clubId, club) : null;
  return {
    id: clubId, name: club?.name ?? clubId, region: club?.region, prestige: club?.prestige ?? 3,
    squad: squadFor(game, clubId, comp), formation: formationById(tactics?.formation ?? '4231').name,
    last5, position: row?.pos ?? null, points: row?.points ?? null,
    ...(coach ? { coach: coach.style, coachName: coach.name, coachNote: coachBlurb(coach) } : {}),
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
  // Sparing: na ławce cała dostępna kadra do 14 zawodników u obu drużyn (docs/sparingi-i-karne.md, rozdz. 4).
  // Ustawienia gracza (game.tactics) się nie zmieniają: dodatkowi rezerwowi dochodzą tylko na ten mecz.
  const matchBench = comp === 'friendly' ? FRIENDLY_BENCH : benchSize;
  // Trener rywala w tym meczu (docs/trener-ai-atrybuty.md): atrybuty, dyspozycja dnia i waga meczu (ranga jak w studiu)
  const rank0 = matchRank({
    competition: compInfo(f), home: teamCtx(game, f.home, comp, table, null), away: teamCtx(game, f.away, comp, table, null),
    table: table ? { roundsPlayed: Math.max(...table.map((r) => r.played)), roundsTotal: 34, size: table.length } : null,
  }).level;
  const oppCoach = coachOf(game, oppId, anyClub(oppId));
  const oppQ = comp === 'friendly' ? null : matchCoach(oppCoach, { rank: rank0, rng: formRng(game, f.id, oppId) });
  const myQ = matchCoach(assistantProfile(staffQ(game, game.clubId, 'asystent'), clubById(game.clubId)?.tier), { rank: rank0, rng: formRng(game, f.id, game.clubId) });
  const formation = aiPreMatchFormation(game, f, { userSide, mySquad, oppSquad, comp });
  const { tactics: oppTactics, plan: oppPlan } = aiPlanTactics(oppSquad, { formation, benchSize: matchBench, cq: oppQ, rng: new Rng(`ai-plan:${game.seed}:${f.id}`), oppSquad: mySquad });
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
  // Jak rywal przygotował się na nasz schemat (docs/bierna-gra.md); bez liczb, w raporcie asystenta
  if (comp !== 'friendly') { const note = scoutingNote(game, oppId); if (note) pre.scouting = note; }
  // Frekwencja: zamknięte sektory, bojkot, mecz bez publiczności
  const fanMul = attendanceModifier(game, f.home, f);
  if (pre.conditions?.attendance) pre.conditions.attendance.expected = Math.round(pre.conditions.attendance.expected * fanMul / 100) * 100;
  return {
    fixtureId: f.id, f, userSide, oppId, comp, tier, step: 'studio', pre, preCtx, weather, pitch, referee, hasVar,
    oppTactics, oppQ, oppPlan, myQ, oppCoach: oppCoach ? { name: oppCoach.name, style: oppCoach.style } : null,
    benchSize: matchBench, memory: game.speechMemory ?? newSpeechMemory(), M: null, briefings: {}, post: null, pr: { pre: null, post: null },
  };
}

/**
 * Ustawienie rywala AI na start meczu (docs/taktyka-i-urazy.md 6, panel ekspert silnika i trener).
 * Punkt wyjścia to 4-2-3-1 (najlepszy bilans na cały mecz). Warianty 4-4-2 tylko w wyraźnych sytuacjach,
 * bo na cały mecz nie dają przewagi, a w meczu AI przełącza się w rodzinie 4-4-2 (coach.js variant442):
 * - wyraźnie słabszy na wyjeździe (albo trener ostrożny): 4-4-2 defensywne, niski blok i więcej remisów;
 * - wyraźny faworyt u siebie z trenerem ofensywnym: 4-4-2 ofensywne.
 * Osobne ziarno, więc reszta dnia meczowego (pogoda, sędzia) się nie zmienia. Zwraca id formacji.
 */
export function aiPreMatchFormation(game, f, { userSide, mySquad, oppSquad, comp }) {
  const base = '4231';
  if (!oppSquad?.length || !mySquad?.length) return base;
  const oppSide = 1 - userSide;
  const coach = coachStyle(game, oppSide === 0 ? f.home : f.away); // styl trenera prowadzącego (nowy trener: własny)
  const userF = formationById(game.tactics?.formation ?? base).name;
  const ct = compInfo(f).type;
  const compType = ct === 'supercup' ? 'cup' : ct;
  void comp;
  const mine = { squad: mySquad, formation: userF };
  const theirs = { squad: oppSquad, formation: formationById(base).name };
  let o;
  try { o = odds1X2(userSide === 0 ? mine : theirs, userSide === 0 ? theirs : mine, { neutral: !!f.neutral, comp: compType }); } catch { return base; }
  const pWin = oppSide === 0 ? o.home : o.away;
  const pLose = oppSide === 0 ? o.away : o.home;
  const away = oppSide === 1 && !f.neutral;
  const rng = new Rng(`ai-ustawienie:${game.seed}:${f.id}`);
  // [SZAC] progi: wyraźny słabszy to szansa na wygraną poniżej 22 % przy porażce powyżej 52 %
  if (pWin < 0.22 && pLose > 0.52 && (away || coach === 'S')) {
    const p = { S: 0.8, P: 0.5, O: 0.15 }[coach] ?? 0.5;
    if (rng.next() < p) return '442def';
  }
  if (pWin > 0.6 && !away && coach === 'O' && rng.next() < 0.35) return '442off';
  return base;
}

/** Ławka w sparingu: cała dostępna kadra do 14 zawodników (docs/sparingi-i-karne.md). */
export const FRIENDLY_BENCH = 14;

/**
 * Ustawienia gracza na ten mecz: game.tactics, w sparingu z ławką dopełnioną do FRIENDLY_BENCH dostępnymi
 * zawodnikami (najpierw ławka gracza w jego kolejności, potem wybór automatyczny). game.tactics bez zmian.
 */
export function matchTacticsFor(game, S) {
  const t = game.tactics;
  if (S.comp !== 'friendly') return t;
  const squad = squadFor(game, game.clubId, S.comp);
  const bench = t.bench.filter((id) => !t.xi.includes(id));
  const extra = autoPickBench(squad, t.xi, FRIENDLY_BENCH).filter((id) => !bench.includes(id));
  return { ...t, bench: [...bench, ...extra].slice(0, Math.max(FRIENDLY_BENCH, bench.length)) };
}

/** Zawodnicy kadry meczowej gracza (jedenastka + ławka) jako obiekty świata. */
export function matchSquadPlayers(game, S) {
  const squad = squadFor(game, game.clubId, S.comp);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const t = matchTacticsFor(game, S);
  return [...t.xi, ...t.bench].map((id) => byId.get(id)).filter(Boolean);
}

export function preAdvice(game, S) {
  return assistantAdvice('pre', matchSquadPlayers(game, S), { ...S.pre.forBriefing, clubId: game.clubId, date: S.f.date, context: talkContext(game, S) }, S.memory);
}

/** Odprawa przedmeczowa gracza; zwraca reakcje do pokazania (bez liczb). */
export function doPreBriefing(game, S, tone, talks = []) {
  const res = preMatchBriefing({ players: matchSquadPlayers(game, S), tone, talks, memory: S.memory, ctx: { ...S.pre.forBriefing, clubId: game.clubId, date: S.f.date, context: talkContext(game, S) }, seed: `${game.seed}:${S.f.id}:pre` });
  S.memory = res.memory;
  S.briefings.pre = res;
  markTalks(game, talks, S.f.date, res);
  // Skutki dla morale tylko raz na mecz (powtórzona odprawa po ponownym wejściu w dzień meczowy działa tylko w meczu)
  if (!mdDone(game, S.f.id, 'pre-speech')) {
    for (const p of matchSquadPlayers(game, S)) { const w = game.world.players[p.id]; if (w) Object.assign(w, applyBriefing(w, res)); }
    markDone(game, S.f.id, 'pre-speech');
  }
  return res;
}

/** Rozmowa indywidualna na odprawie liczy się jako uwaga trenera (career/attention.js). */
function markTalks(game, talks, date, res = null) {
  for (const t of talks ?? []) {
    noteAttention(game.world.players[t.id], date);
    // Autorytet liczy trafność rozmowy, nie samą rozmowę (career/authority.js)
    const r = res?.players?.find((x) => x.id === t.id)?.reaction;
    logEngage(game, r === 'zmotywowany' || r === 'spokojny' ? 'talkGood' : r === 'urazony' || r === 'zdenerwowany' ? 'talkBad' : 'talkMeh', date);
  }
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
  const oppQ = S.oppQ ?? null; // stary stan dnia meczowego (sprzed atrybutów trenerów): trener neutralny
  const ai = aiBriefing({ coach: coachStyle(game, S.oppId), personaMix: personaMix(oppSquad), mot: oppQ?.mot ?? 0 }, { phase: 'pre', pWin: 1 - (S.pre.forBriefing.pWin ?? 0.4), rank: S.pre.forBriefing.rank }, `${game.seed}:${S.f.id}:ai`);
  // Wielki mecz: odporny trener uspokaja drużynę, nerwowy ją usztywnia (zaangażowanie na start, PRE)
  const nerves = oppQ ? oppQ.imp * COACH.nerves * oppQ.pre : 0;
  const zOpp = Object.fromEntries(oppSquad.map((p) => [p.id, (ai.zByPersona[p.persona] ?? ai.teamZ) + nerves]));
  const mine = { club: anyClub(game.clubId), squad: mySquad, tactics: matchTacticsFor(game, S), ai: false, coach: 'P', zStart: S.briefings.pre?.engine?.zStart ?? {}, assistantQ: S.myQ ?? null };
  const theirs = { club: oppClub, squad: oppSquad, tactics: S.oppTactics, ai: true, coach: coachStyle(game, S.oppId), zStart: zOpp, coachQ: oppQ };
  // Trening: spójność zespołu na start meczu i stałe fragmenty (src/training)
  Object.assign(mine, trainingMatchInput(game, game.clubId, mine));
  Object.assign(theirs, trainingMatchInput(game, S.oppId, theirs));
  S.startTactics = { formation: mine.tactics.formation, instructions: { ...(mine.tactics.instructions ?? {}) } }; // odcisk dla analityków rywali
  S.M = createMatch({
    seed: `${game.seed}:${S.f.id}`,
    home: S.userSide === 0 ? mine : theirs,
    away: S.userSide === 0 ? theirs : mine,
    ctx: {
      neutral: !!S.f.neutral, var: S.hasVar, rank: S.pre.preview.rank.level, refStrict: S.referee.strictness,
      concussionSubs: false, // zmiany po wstrząśnieniu mózgu: flaga rozgrywek (UEFA ich nie stosuje, brak potwierdzenia dla Ekstraklasy)
      attendance: S.pre.conditions.attendance.fill, weather: engineWeather(S.weather, S.pitch),
      knockout: knockoutCtx(S.f),
      // Sparing: zasady uzgodnione przy planowaniu (fixture.friendlyRules), zmiany zaplanowane przed meczem
      friendlyRules: S.f.comp === 'friendly' ? { ...(S.f.friendlyRules ?? {}), plannedSubs: S.plannedSubs?.length ? { [S.userSide]: S.plannedSubs } : null } : undefined,
      shootoutPrep: true, // pauza przed serią rzutów karnych: gracz ustala kolejność strzelców
    },
  });
  S.step = 'live1';
  return S.M;
}

/**
 * Rozstrzygnięcie remisu dla silnika z wpisu terminarza: 'single' (dogrywka i karne), 'penaltiesOnly'
 * (Superpuchar: od razu karne), dwumecz { firstLeg } albo false.
 */
export function knockoutCtx(f) {
  if (['single', 'penaltiesOnly'].includes(f.knockout)) return f.knockout;
  if (f.knockout?.firstLeg) return { firstLeg: [...f.knockout.firstLeg] };
  return false;
}

/** Oceny na żywo (silnik): wszyscy, którzy grali, także zmienieni wracający na ławkę przy zmianach powrotnych. */
export function liveRatings(S) {
  return engineLiveRatings(S.M);
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
  return assistantAdvice('half', onPitchPlayers(S), { ...h, clubId: game.clubId, rank: S.pre.forBriefing.rank, pWin: S.pre.forBriefing.pWin, context: talkContext(game, S) }, S.memory);
}

function onPitchPlayers(S) {
  const T = S.M.teams[S.userSide];
  return [...onPitch(T, S.M.minute), ...T.bench].map((x) => x.p);
}

/** Odprawa w przerwie: nowy poziom zaangażowania na 2. połowę. */
export function doHalfBriefing(game, S, tone, talks = []) {
  const h = halfInfo(S);
  const res = halftimeBriefing({ players: onPitchPlayers(S), tone, talks, memory: S.memory, ctx: { ...h, clubId: game.clubId, rank: S.pre.forBriefing.rank, pWin: S.pre.forBriefing.pWin, date: S.f.date, context: talkContext(game, S) }, seed: `${game.seed}:${S.f.id}:half` });
  S.memory = res.memory;
  S.briefings.half = res;
  markTalks(game, talks, S.f.date, res);
  const T = S.M.teams[S.userSide];
  for (const x of [...T.players, ...T.bench]) if (res.engine.zStart[x.id] != null) x.Z = res.engine.zStart[x.id];
  // AI rywala też ma odprawę
  const O = S.M.teams[1 - S.userSide];
  const ai = aiBriefing({ coach: O.coach, personaMix: personaMix(O.players.map((x) => x.p)), mot: O.cq?.mot ?? 0 }, { phase: 'half', diff: -h.score.for + h.score.against, xgDiff: h.xgAgainst - h.xgFor, pWin: 1 - (S.pre.forBriefing.pWin ?? 0.4) }, `${game.seed}:${S.f.id}:aihalf`);
  for (const x of O.players) x.Z = ai.zByPersona[x.p.persona] ?? ai.teamZ;
  for (const p of onPitchPlayers(S)) { const w = game.world.players[p.id]; if (w) Object.assign(w, applyBriefing(w, res)); }
  return res;
}

/** Jedna minuta meczu (UI). */
export function tick(S) {
  const r = step(S.M);
  if (r.state === 'break' && S.step === 'live1') S.step = 'break';
  else if (r.state === 'break') S.step = 'etbreak';
  if (r.state === 'shootoutPrep') S.step = 'shootoutPrep';
  if (r.state === 'ended') S.step = 'fulltime';
  return r;
}

export function continueAfterBreak(S) {
  resume(S.M);
  S.step = S.M.half === 2 ? 'live2' : 'live2';
}

/**
 * „Pokaż wynik od razu”: do przerwy albo do końca (zmiany robi asystent gracza). Przed serią rzutów karnych
 * mecz staje (S.step 'shootoutPrep'): kolejność strzelców ustala gracz, jak przy oglądaniu na żywo.
 */
export function skip(S) {
  const M = S.M;
  if (S.step === 'live1') { runToBreak(M, { assistantFor: [S.userSide] }); if (M.phase === 'break') S.step = 'break'; if (M.ended) S.step = 'fulltime'; return; }
  // Jak runToEnd w silniku (asystent przejmuje drużynę), ale z zatrzymaniem w pauzie przed serią
  const T = M.teams[S.userSide];
  if (!T.ai) { T.ai = true; T.assistant = true; T.baseInstr = { ...T.tactics.instructions }; }
  if (M.phase !== 'break' && !M.ended) aiDecide(M, S.userSide);
  let guard = 0;
  while (!M.ended && M.phase !== 'shootoutPrep' && guard++ < 400) {
    if (M.phase === 'break') resume(M); else step(M);
  }
  S.step = M.phase === 'shootoutPrep' ? 'shootoutPrep' : 'fulltime';
}

// ------------------------------------------------------------ Seria rzutów karnych (docs/sparingi-i-karne.md)
/**
 * Okno kolejności strzelców: kandydaci obu drużyn (shootoutCandidates) i propozycja asystenta.
 * Zwraca { mine, opp, n, keepers: [{ id, name, pos, gk (REF i JNJ, 1-20) }] } albo null, gdy seria nie czeka.
 */
export function shootoutSetup(S) {
  const M = S.M;
  if (!M || M.phase !== 'shootoutPrep') return null;
  const mine = shootoutCandidates(M, S.userSide);
  const opp = shootoutCandidates(M, 1 - S.userSide);
  const T = M.teams[S.userSide];
  const keepers = fieldPlayers(T).map((x) => ({
    id: x.id, name: x.p.name, pos: x.slot?.pos ?? x.p.pos, natural: x === goalkeeper(T),
    gk: Math.round((((x.p.attr?.REF ?? 4) + (x.p.attr?.JNJ ?? 4)) / 2) * 10) / 10,
  })).sort((a, b) => b.natural - a.natural || b.gk - a.gk);
  return { mine, opp, n: mine.n, keepers, naturalKeeperId: goalkeeper(T)?.id ?? null };
}

/**
 * Kolejność strzałów po wyrównaniu liczebności (to samo co silnik, bez zmiany meczu): ids w kolejności gracza
 * (wszyscy uprawnieni), n strzelających, bramkarz serii zawsze strzela (gdy nie mieści się w n, wypada ostatni
 * z pola, a bramkarz strzela ostatni). Zwraca { order: ids n strzelających, out: ids wypadających }.
 */
export function previewShootoutOrder(ids, keeperId, n) {
  const full = [...ids];
  const order = keeperId == null || full.indexOf(keeperId) < n || !full.includes(keeperId)
    ? full.slice(0, n) : full.filter((id) => id !== keeperId).slice(0, n - 1).concat(keeperId);
  return { order, out: full.filter((id) => !order.includes(id)) };
}

/**
 * Zatwierdzenie kolejności i seria: setShootoutOrder (gracz) i startShootout. S.step 'shootout' (UI pokazuje
 * strzały po kolei), potem endShootout. keeperId: bramkarz w serii (null: ten z boiska).
 * Zwraca { ok, kicks, goals } albo { ok: false, error } (nic się nie zmienia).
 */
export function confirmShootout(S, ids, keeperId = null) {
  const M = S.M;
  if (!M || M.phase !== 'shootoutPrep') return { ok: false, error: 'Seria rzutów karnych nie czeka na rozpoczęcie.' };
  const r = setShootoutOrder(M, S.userSide, ids, { keeperId });
  if (!r.ok) return r;
  const st = startShootout(M);
  if (!st.ok) return st;
  S.step = 'shootout';
  return { ok: true, kicks: M.shootout.kicks, goals: [...M.shootout.goals], order: M.shootout.order, keepers: M.shootout.keepers };
}

/** Po pokazaniu serii: koniec meczu (studio pomeczowe). */
export function endShootout(S) {
  if (S.M?.ended) S.step = 'fulltime';
}

/**
 * Przypomnienie asystenta o bramkarzu od karnych (raz na mecz): seria jest blisko (118' dogrywki albo 88'
 * przy „od razu karne”), jest remis, można zmienić, a na ławce jest bramkarz lepszy w REF i JNJ o co najmniej 1,5.
 * Zwraca tekst albo null.
 */
export function keeperReminder(S) {
  const M = S.M;
  if (!M || M.ended || S.gkReminded || M.phase !== 'play' || M.rules.decider === 'none') return null;
  const near = (M.half === 4 && M.minute >= 118) || (M.half === 2 && M.rules.decider === 'penalties' && M.minute >= 88);
  if (!near) return null;
  const fl = M.ctx.knockout?.firstLeg;
  const level = fl ? M.score[0] + fl[0] === M.score[1] + fl[1] : M.score[0] === M.score[1];
  const T = M.teams[S.userSide];
  if (!level || subsAvailable(M, T) <= 0) return null;
  const gkv = (x) => ((x.p.attr?.REF ?? 4) + (x.p.attr?.JNJ ?? 4)) / 2;
  const cur = goalkeeper(T);
  const best = T.bench.filter((b) => b.p.pos === 'BR' && !b.sentOff && !(b.injury && !b.injury.playable)).sort((a, b) => gkv(b) - gkv(a))[0];
  if (!cur || !best || gkv(best) < gkv(cur) + 1.5) return null;
  S.gkReminded = true;
  const r1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  return `Za chwilę rzuty karne. Na ławce siedzi ${best.p.name}: refleks i gra jeden na jeden ${r1(gkv(best))}, u ${cur.p.name} ${r1(gkv(cur))}. Bramkarza od karnych trzeba wpuścić przed końcowym gwizdkiem.`;
}

// ------------------------------------------------------------ Sparing: druga jedenastka w przerwie
/**
 * Propozycja asystenta na przerwę sparingu (assistantSuggest wg planu rotacji, bez losowania): tylko zmiany
 * zawodników. Pusta lista poza przerwą po 1. połowie sparingu.
 */
export function secondEleven(S) {
  const M = S.M;
  if (!M || !M.rules.friendly || M.phase !== 'break' || M.half !== 1) return [];
  return assistantSuggest(M, S.userSide).filter((a) => a.type === 'sub');
}

/** Wykonuje wybrane zmiany z secondEleven (decyzja gracza). Zwraca { done, errors: [tekst] }. */
export function applySecondEleven(S, actions) {
  let done = 0; const errors = [];
  for (const a of actions) {
    const r = applySuggestion(S.M, S.userSide, a);
    if (r?.ok === false) errors.push(`${a.inName}: ${r.error}`); else done++;
  }
  return { done, errors };
}

/** Koniec meczu: zapis wyniku i skutków, studio pomeczowe, wiadomości. */
export function finishMatchday(game, S) {
  if (S.post) return S.post;
  const M = S.M;
  if (!M.ended) runToEnd(M, { assistantFor: [S.userSide] }); // także wyjście w pauzie przed serią rzutów karnych
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
  // Analitycy rywali widzą ten mecz: zapis schematu i ostrzeżenie, gdy staje się czytelny (docs/bierna-gra.md)
  if (S.f.comp !== 'friendly') {
    recordMatch(game, S.f.id, S.f.date, S.startTactics ?? game.tactics);
    const warn = scoutingWarning(game);
    if (warn) inbox.push(createMessage({ date: S.f.date, category: 'staff', from: 'Analityk wideo', key: `schemat:${S.f.id}`, subject: warn.subject, body: warn.body }));
  }
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

/**
 * Zalecana przemowa pomeczowa asystenta: ten sam model co odprawa (postMatchBriefing, bez rozmów, to samo ziarno),
 * wybór tonu z najlepszym średnim wpływem na morale (przy równych wcześniejszy ton). Nic nie zmienia w grze.
 * Wcześniej ekran zaznaczał zawsze pierwszy ton (Pochwała), który po porażce obniża morale.
 */
export function postAdvice(game, S) {
  const ids = new Set(S.result.ratings.filter((x) => x.side === S.userSide).map((x) => x.id));
  const players = squadFor(game, game.clubId, S.comp).filter((p) => ids.has(p.id));
  const pctx = postTalkContext(game, S);
  const scored = Object.keys(POST_TONES).map((tone, i) => {
    const r = postMatchBriefing({ players, tone, talks: [], memory: S.memory, ctx: { ...S.post.forBriefing, context: pctx }, seed: `${game.seed}:${S.f.id}:post` });
    const vals = Object.values(r.morale).map((m) => m.delta);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { tone, v: avg - i * 1e-6 };
  }).sort((a, b) => b.v - a.v);
  const tone = scored[0].tone;
  const { for: gf, against: ga } = S.post.forBriefing.score;
  const byOutcome = { trophy: 'Po zdobyciu trofeum', lostFinal: 'Po przegranym finale', adv: 'Po awansie', padv: 'Po awansie do finału baraży', promoted: 'Po awansie do wyższej ligi', out: 'Po odpadnięciu', pout: 'Po odpadnięciu z baraży' };
  const res = byOutcome[pctx.outcome] ?? (gf > ga ? 'Po wygranej' : gf === ga ? 'Po remisie' : 'Po porażce');
  return { tone, toneLabel: POST_TONES[tone].label, text: `${res} ta przemowa najlepiej podziała na szatnię.` };
}

export function doPostBriefing(game, S, tone, talks = []) {
  const ids = new Set(S.result.ratings.filter((x) => x.side === S.userSide).map((x) => x.id));
  const players = squadFor(game, game.clubId, S.comp).filter((p) => ids.has(p.id));
  const res = postMatchBriefing({ players, tone, talks, memory: S.memory, ctx: { ...S.post.forBriefing, context: postTalkContext(game, S) }, seed: `${game.seed}:${S.f.id}:post` });
  S.memory = res.memory;
  S.briefings.post = res;
  markTalks(game, talks, S.f.date, res);
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

/** Kontekst prasy PRZED meczem (forma, tabela, rywal, absencje, sędzia). */
export function pressCtxPre(game, S) {
  const clubId = game.clubId;
  const club = anyClub(clubId);
  const u = S.userSide;
  const side = u === 0 ? 'home' : 'away';
  const results = (game.fixtures || []).filter((x) => x.played && x.result && x.comp !== 'friendly' && (x.home === clubId || x.away === clubId))
    .sort((a, b) => a.date.localeCompare(b.date)).map((x) => resOf(x, clubId));
  const streak = (r) => { let n = 0; for (let i = results.length - 1; i >= 0 && results[i] === r; i--) n++; return n; };
  const pWin = S.pre?.forBriefing?.pWin ?? 0.4;
  const abs = S.pre?.absences?.[side];
  const absent = abs?.injured?.[0]?.name ?? abs?.suspended?.[0]?.name ?? null;
  const mine = matchSquadPlayers(game, S);
  const top = [...mine].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))[0];
  const goal = game.board?.goal;
  const league = LEAGUE_COMPS.includes(S.comp);
  return {
    phase: 'pre', gameSeed: `${game.seed}`, clubId, clubName: club?.name ?? clubId, oppName: anyClub(S.oppId)?.name ?? '', region: club?.region,
    prestige: club?.prestige ?? 5, tier: club?.tier ?? 1, coach: game.manager?.profile?.lastName || 'Trener',
    userHome: u === 0, neutral: !!S.f.neutral, date: S.f.date, season: game.season, matchId: S.f.id, comp: S.comp,
    favourite: pWin >= 0.55, underdog: pWin <= 0.3, derby: !!S.pre?.preview?.rank?.tags?.includes('derby'),
    oppStar: S.pre?.keyPlayers?.opponent?.[0]?.name ?? null, absent, refName: S.referee?.name ?? '',
    last5: results.slice(-5), winStreak: streak('W'), lossStreak: streak('P'),
    boardTrust: game.board?.trust ?? 60, fansMood: game.board?.fansMood ?? 55,
    position: league ? S.preCtx?.[side]?.position ?? null : null, roundsPlayed: S.preCtx?.table?.roundsPlayed ?? 0,
    relegationFrom: (S.preCtx?.table?.size ?? 0) >= 10 ? S.preCtx.table.size - 2 : null,
    goalTarget: league ? goal?.target ?? null : null, goalText: goal?.text ?? null,
    rumour: top ? { id: top.id, name: top.name } : null,
  };
}

/**
 * Trwały zapis w grze, co już się odbyło w dniu meczowym danego meczu (game.mdDone[fixtureId]). Chroni przed
 * powtórzeniem konferencji i odprawy przedmeczowej, gdy dzień meczowy zaczyna się od nowa (np. po odświeżeniu
 * strony albo powrocie ze zmiany składu). Trzyma ostatnie 60 meczów.
 */
export function mdDone(game, fid, key) { return !!game.mdDone?.[fid]?.[key]; }
function markDone(game, fid, key) {
  game.mdDone = game.mdDone ?? {};
  (game.mdDone[fid] = game.mdDone[fid] ?? {})[key] = true;
  const ids = Object.keys(game.mdDone);
  if (ids.length > 60) for (const id of ids.slice(0, ids.length - 60)) delete game.mdDone[id];
}

/** Miejsce na stan konferencji danej fazy w sesji dnia meczowego (leniwie, także dla starej sesji). */
export function pressSlot(S, phase = 'post') {
  S.pr = S.pr ?? {};
  S.pr[phase] = S.pr[phase] ?? { room: null, conf: null, settled: false, result: null };
  return S.pr[phase];
}

/**
 * Klimat prasy i dane sali (leniwie, deterministycznie: to samo ziarno daje ten sam klimat).
 * Sparing nie ma konferencji ani presji prasy (null). Po meczu wymaga S.post.
 */
export function pressSetup(game, S, phase = 'post') {
  if (S.comp === 'friendly' || (phase === 'post' && !S.post) || (phase === 'pre' && !S.pre)) return null;
  const slot = pressSlot(S, phase);
  if (!slot.settled && mdDone(game, S.f.id, `press-${phase}`)) return null; // ta konferencja już się odbyła
  if (!slot.room) {
    const state = pressState(game);
    const ctx = phase === 'pre' ? pressCtxPre(game, S) : pressCtx(game, S);
    const seed = `prasa${phase === 'pre' ? '-przed' : ''}:${game.seed}:${S.f.id}`;
    slot.room = { ctx, seed, climate: pickClimate(ctx, state, seed), state: JSON.parse(JSON.stringify(state)) };
  }
  return slot.room;
}

/** Kto czeka w sali (przed otwarciem okna). */
export function pressRoomPreview(game, S, phase = 'post') {
  const room = pressSetup(game, S, phase);
  return room ? roomPreview(room.climate.climate, room.ctx) : [];
}

/** Otwiera salę (okno konferencji). Ponowne otwarcie wraca do tej samej sesji. */
export function pressOpen(game, S, phase = 'post') {
  const room = pressSetup(game, S, phase);
  const slot = pressSlot(S, phase);
  if (!room || slot.settled) return slot.conf ?? null;
  slot.conf = slot.conf ?? openConference(room.ctx, room.state, room.climate, room.seed, phase);
  return slot.conf;
}

/** Odpowiedź na bieżące pytanie; po ostatnim rozlicza konferencję. */
export function pressAnswer(game, S, i, phase = 'post') {
  const slot = pressSlot(S, phase);
  if (!slot.conf || slot.settled) return slot.conf;
  slot.conf = answerQuestion(slot.conf, i);
  if (slot.conf.done) doPress(game, S, [], phase);
  return slot.conf;
}

/** Wyjście z sali przed końcem. */
export function pressWalkOut(game, S, phase = 'post') {
  const slot = pressSlot(S, phase);
  if (!slot.conf || slot.settled) return slot.conf;
  slot.conf = pressWalkOutConf(slot.conf);
  doPress(game, S, [], phase);
  return slot.conf;
}

/**
 * Rozlicza konferencję. answers (opcjonalnie): indeksy odpowiedzi na pozostałe pytania (testy, szybka ścieżka).
 * Zwraca skutki (conferenceEffects).
 */
export function doPress(game, S, answers = [], phase = 'post') {
  const slot = pressSlot(S, phase);
  if (slot.settled) return slot.result;
  const conf = pressOpen(game, S, phase);
  if (!conf) return null;
  let c = conf; let k = 0;
  while (!c.done && currentQuestion(c) && k < 12) c = answerQuestion(c, answers[k++] ?? 0);
  slot.conf = c;
  return settlePress(game, S, conferenceEffects(c), phase);
}

/** Pominięcie konferencji (Dalej albo przejście do odprawy): presja prasy bez osłony trenera. */
export function skipPress(game, S, phase = 'post') {
  const slot = pressSlot(S, phase);
  if (slot.settled) return slot.result;
  const room = pressSetup(game, S, phase);
  if (!room) return null;
  return settlePress(game, S, skipEffects(room.ctx, room.climate.climate, room.state, phase), phase);
}

/** Jedno miejsce, które zapisuje skutki prasy w grze (dokładnie raz na fazę meczu). */
function settlePress(game, S, eff, phase = 'post') {
  const slot = pressSlot(S, phase);
  const room = slot.room;
  game.board = game.board ?? { trust: 60, fansMood: 55 };
  game.board.trust = Math.max(0, Math.min(100, Math.round((game.board.trust ?? 60) + eff.board)));
  game.board.fansMood = Math.max(0, Math.min(100, Math.round((game.board.fansMood ?? 55) + eff.fans)));
  const extra = new Map((eff.players ?? []).map((p) => [p.id, p.d]));
  for (const id of game.world.clubs[game.clubId]?.squad ?? []) {
    const p = game.world.players[id];
    if (!p) continue;
    const d = Math.max(-3, Math.min(2, pressMoraleDelta(eff.teamMorale, p.persona, p.morale ?? 12) + (extra.get(id) ?? 0))); // [SZAC] limit na zawodnika
    if (d) p.morale = applyMorale(p.morale ?? 12, d);
  }
  const st = pressState(game);
  game.press = phase === 'pre'
    ? nextPressStatePre(st, eff, { date: S.f.date, matchId: S.f.id })
    : nextPressState(st, eff, { climate: room.climate.climate, date: S.f.date, season: game.season, matchId: S.f.id, seed: room.seed });
  const msgs = [];
  if (eff.headline) {
    const body = eff.mode === 'skipped' ? (phase === 'pre' ? 'Trener nie przyszedł na konferencję przed meczem.' : 'Trener nie pojawił się na konferencji prasowej po meczu.')
      : eff.quotes.slice(0, 3).map((q) => `„${q.text}”`).join(' ');
    msgs.push(createMessage({ date: S.f.date, category: 'media', from: eff.headline.outlet, key: `prasa${phase === 'pre' ? '-przed' : ''}:${S.f.id}`, subject: eff.headline.text, body }));
  }
  // Słowa o sędziach: wniosek rzecznika dyscyplinarnego, decyzja po kilku dniach (src/match/pressSystem.js)
  const kase = openCase(eff, room.ctx, `${room.seed}|sprawa`);
  if (kase && !game.press.cases.some((c) => c.id === kase.id)) {
    game.press.cases = [...game.press.cases, kase];
    msgs.push(createMessage({
      date: S.f.date, category: 'club', from: kase.body, key: `komisja-wniosek:${kase.id}`,
      subject: 'Wniosek o ukaranie za wypowiedź o sędziach',
      body: `Rzecznik dyscyplinarny skierował do komisji wniosek w sprawie twojej wypowiedzi na konferencji ${phase === 'pre' ? 'przed meczem' : 'po meczu'}${kase.quote ? `: „${kase.quote}”` : ''}. Decyzja zapadnie na najbliższym posiedzeniu, za kilka dni. Możliwe jest umorzenie, upomnienie albo kara finansowa.`,
    }));
  }
  if (msgs.length) game.inbox = addMessages(game.inbox ?? [], msgs).inbox;
  slot.result = eff;
  slot.settled = true;
  // Obecność w mediach i jej jakość (career/authority.js): pominięcie i wyjście z sali to brak trenera
  logEngage(game, eff.mode === 'answered' ? (eff.teamMorale >= 0 && eff.board >= 0 ? 'pressGood' : 'press') : 'pressSkip', S.f.date);
  markDone(game, S.f.id, `press-${phase}`);
  return eff;
}

/** Wyjście ze studia do odprawy: konferencja przedmeczowa pominięta, jeśli gracz jej nie zaczął i nie skończył. */
export function leaveStudio(game, S) {
  const slot = pressSlot(S, 'pre');
  if (slot.settled) return slot.result;
  if (slot.conf?.answers?.length) return doPress(game, S, [], 'pre'); // przerwana w połowie: reszta odpowiedzi domyślnie
  return skipPress(game, S, 'pre');
}

/** Zamknięcie dnia meczowego: pamięć przemów na kolejne mecze. */
export function closeMatchday(game, S) {
  if (S.post && !pressSlot(S, 'post').settled) skipPress(game, S); // Dalej bez konferencji: prasa i tak pisze
  game.speechMemory = closeMatchMemory(S.memory);
  S.step = 'done';
}

export { winnerOf };
