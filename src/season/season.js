// Sezon krajowy: terminarz 3 lig, Superpuchar, Puchar Polski, baraże; rozgrywanie meczów w tle
// dzień po dniu i zapis skutków meczu (gole, kartki i pauzy, kontuzje, forma, morale, zmęczenie).
// Mecze klubu gracza czekają na gracza (pętla dni zatrzymuje się na „Zagraj mecz”).

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { CLUBS_PL, clubById, LEAGUE_NAMES } from '../data/clubs_pl.js';
import { CLUBS_L3 } from '../data/clubs_l3.js';
import { CLUBS_L4 } from '../data/clubs_l4.js';
import { COMPETITIONS } from '../config/competitions.js';
import { DOMESTIC, FIFA_WINDOWS, UEFA, POLISH_EUROPE_2026, SEASON, GAME_START } from '../config/calendar2026.js';
import { roundDates, buildLeague } from './schedule.js';
import { standings } from './standings.js';
import { createCup, drawRound, winnerOf, superCupFixture, PP_ROUNDS, PP_NAMES } from './cup.js';
import { squadOf } from '../world/worldGen.js';
import { ephemeralSquad } from '../world/ephemeral.js';
import { quickMatch, quickKnockout } from '../engine/quickSim.js';
import { tableConfidence } from '../engine/teamStrength.js';
import { afterMatchDelta, applyMorale, weeklyDrift } from '../career/morale.js';
import { INJURY_TYPES } from '../engine/match/constants.js';
import { fmtDate } from '../ui/dom.js';
import { UEFA_CLUBS, createUefa } from './uefa.js';
import { aiChooseSpeech, postMatchBriefing, closeMatchMemory } from '../match/briefings.js';
import { statGroup, addPlayerMatch, syncSpell, recordTeamMatch, CLUB_GROUPS } from './history.js';

export const LEAGUE_COMPS = ['ekstraklasa', 'liga1', 'liga2'];
const TIER_COMP = { 1: 'ekstraklasa', 2: 'liga1', 3: 'liga2' };
const ALL_CLUBS = [...CLUBS_PL, ...CLUBS_L3, ...CLUBS_L4, ...UEFA_CLUBS];
const CLUB_INDEX = new Map(ALL_CLUBS.map((c) => [c.id, c]));
export const anyClub = (id) => CLUB_INDEX.get(id) ?? null;
export const suspKey = (comp) => (LEAGUE_COMPS.includes(comp) ? 'league' : comp === 'pp' ? 'cup' : comp);

// ------------------------------------------------------------ Tworzenie sezonu
/** Daty pucharowe klubów (Superpuchar, eliminacje UEFA), żeby liga nie wypadła dzień obok. */
function busyFactory(superCup) {
  const busy = new Map();
  const add = (club, date) => { if (!busy.has(club)) busy.set(club, []); busy.get(club).push(date); };
  for (const id of superCup) add(id, DOMESTIC.superpuchar.date);
  for (const e of POLISH_EUROPE_2026) {
    const order = ['Q1', 'Q2', 'Q3', 'PO'];
    if (!order.includes(e.entry)) continue;
    for (const r of order.slice(order.indexOf(e.entry))) for (const d of [].concat(UEFA[e.comp][r] ?? [])) add(e.club, d);
  }
  const near = (a, b) => Math.abs(new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) < 2 * 86400000 + 1;
  return (club, date) => (busy.get(club) ?? []).some((d) => near(d, date));
}

export function createSeason(seed, { playerClub = null, superCup = ['lech', 'gornik-zabrze'], holder } = {}) {
  const rng = new Rng(`sezon:${seed}`);
  const busy = busyFactory(superCup);
  const fixtures = [];
  for (const tier of [1, 2, 3]) {
    const comp = TIER_COMP[tier];
    const cfg = DOMESTIC[comp];
    const dates = roundDates({
      start: cfg.start,
      autumnEnd: tier === 1 ? DOMESTIC.ekstraklasa.autumnEnd : DOMESTIC.lowerAutumnEnd,
      springStart: cfg.springStart, end: cfg.end, rounds: 34,
      skip: tier === 1 ? FIFA_WINDOWS : [],
    });
    const clubs = CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id);
    fixtures.push(...buildLeague({ comp, tier, clubs, dates, rng: rng.fork(comp), busy, skip: tier === 1 ? FIFA_WINDOWS : [] }));
  }
  fixtures.push(superCupFixture(...superCup));
  const cup = createCup(CLUBS_PL.filter((c) => c.tier <= 3), lowerTierClubs(), CLUBS_L4, rng.fork('pp:uczestnicy'));
  fixtures.push(...drawRound(cup, 'PRE', tierOf, rng.fork('pp:PRE')));
  void playerClub;
  fixtures.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  // Puchary UEFA: losowania i mecze dzień po dniu (src/season/europe.js)
  return { fixtures, cup, playoffs: {}, seasonId: SEASON, superCup, uefa: createUefa(seed, holder ? { holder } : {}) };
}

/** Czy klub ma co najmniej 2 dni przerwy od innych meczów w danym dniu. */
export function restOk(fixtures, clubId, date) {
  const t = new Date(`${date}T12:00:00Z`).getTime();
  return !fixtures.some((f) => (f.home === clubId || f.away === clubId) && Math.abs(new Date(`${f.date}T12:00:00Z`).getTime() - t) < 2 * 86400000);
}

const dayMs = 86400000;
const gapDays = (a, b) => Math.abs(new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / dayMs;

/**
 * Przełożenie meczów ligowych kolidujących z meczem o wyższym priorytecie (puchar, finał, baraże, UEFA).
 * Nowy termin: najbliższy dzień (najpierw w tym samym tygodniu, potem później, potem wcześniej) z 2 dniami
 * przerwy dla obu klubów, poza oknami FIFA, przed dwiema ostatnimi kolejkami (PLAN 5.2).
 */
export function rescheduleAround(fixtures, fixed) {
  const moved = [];
  for (const club of [fixed.home, fixed.away]) {
    for (const f of fixtures) {
      if (f === fixed || f.played || !LEAGUE_COMPS.includes(f.comp) || (f.home !== club && f.away !== club)) continue;
      if (gapDays(f.date, fixed.date) >= 2) continue;
      const deadline = addDays(fixtures.filter((x) => x.comp === f.comp && x.round === 33).map((x) => x.date).sort()[0] ?? '2099-01-01', -1);
      const skip = f.comp === 'ekstraklasa' ? FIFA_WINDOWS : [];
      const others = fixtures.filter((x) => x !== f);
      const ok = (d) => d <= deadline && !skip.some((w) => d >= w.from && d <= w.to)
        && [f.home, f.away].every((c) => restOk(others, c, d));
      const offsets = [1, 2, -1, -2, 3, 4, 5, 6, 7, -3, 8, 9, 10, 11, 12, 13, 14];
      const cand = offsets.map((o) => addDays(f.date, o)).find(ok);
      if (cand) { f.date = cand; f.postponed = true; moved.push(f); }
    }
  }
  if (moved.length) fixtures.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return moved;
}

export function tierOf(id) { return anyClub(id)?.tier ?? 5; }

/** Kluby III ligi w bieżącym sezonie: lista z danych bez beniaminków 2 Ligi, plus spadkowicze z 2 Ligi. */
export function lowerTierClubs() {
  const out = new Map();
  for (const c of [...CLUBS_L3, ...CLUBS_PL]) if (c.tier === 4) out.set(c.id, c);
  return [...out.values()];
}

export function compLabel(f) {
  if (f.label) return f.label;
  if (LEAGUE_COMPS.includes(f.comp)) return `${COMPETITIONS[f.comp].name}, ${f.round}. kolejka`;
  if (f.comp === 'pp') return `Puchar Polski, ${PP_NAMES[f.round]}`;
  if (f.comp === 'super') return 'Superpuchar Polski';
  if (f.comp.startsWith('playoff')) return `Baraże o awans, ${f.round === 'F' ? 'finał' : 'półfinał'}`;
  return f.comp;
}

// ------------------------------------------------------------ Kadry na mecz
/** Kadra klubu na mecz w danych rozgrywkach (pauzy liczą się osobno dla ligi i pucharu). */
export function squadFor(game, clubId, comp) {
  const key = suspKey(comp);
  const base = game.world.clubs[clubId] ? squadOf(game.world, clubId) : ephemeralSquad(anyClub(clubId), SEASON);
  return base.map((p) => (p.susp?.[key] ? { ...p, suspended: p.susp[key] } : (p.suspended ? { ...p, suspended: 0 } : p)));
}

function tableTermFor(game, clubId, comp, cache) {
  if (!LEAGUE_COMPS.includes(comp)) return 0;
  if (!cache.has(comp)) {
    const tier = COMPETITIONS[comp].tier;
    cache.set(comp, standings(game.fixtures.filter((f) => f.comp === comp), CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id)));
  }
  const row = cache.get(comp).find((r) => r.id === clubId);
  const club = clubById(clubId);
  const leagueL = { 1: 11.5, 2: 10, 3: 8.5 }[club?.tier] ?? 10;
  return row ? tableConfidence({ played: row.played, points: row.points }, club?.L ?? leagueL, leagueL) : 0;
}

/** Model ocen meczów w tle (playQuick); fromEngineResult sprowadza oceny pełnego silnika do tej skali. */
export const QUICK_RATING = { base: 6.4, goal: 0.9, assist: 0.5, assistShare: 0.72, yellow: -0.3, red: -1.2 };

/** Mecz w tle (AI vs AI) szybką symulacją. */
export function playQuick(game, f, rng, cache = new Map()) {
  const home = { squad: squadFor(game, f.home, f.comp), tableTerm: tableTermFor(game, f.home, f.comp, cache) };
  const away = { squad: squadFor(game, f.away, f.comp), tableTerm: tableTermFor(game, f.away, f.comp, cache) };
  const ctx = { neutral: !!f.neutral, refStrict: 0.85 + rng.next() * 0.35 };
  const r = f.knockout ? quickKnockout(home, away, ctx, rng, f.knockout) : quickMatch(home, away, ctx, rng);
  // Zawodnicy w meczu: jedenastka z symulacji; kartki rozdzielone wg agresji, asysty do partnerów
  const lineups = r.xi;
  const players = [0, 1].map((s) => {
    const squad = s === 0 ? home.squad : away.squad;
    const byId = new Map(squad.map((p) => [p.id, p]));
    const xi = lineups[s].map((id) => byId.get(id)).filter(Boolean);
    const out = xi.map((p) => ({ id: p.id, minutes: 90, g: 0, a: 0, yc: 0, rc: 0, rating: 0 }));
    const find = (id) => out.find((x) => x.id === id);
    for (const id of r.scorers[s]) {
      const x = find(id); if (x) x.g++;
      if (rng.chance(QUICK_RATING.assistShare) && out.length > 1) { const as = rng.pick(out.filter((y) => y.id !== id)); as.a++; }
    }
    for (let i = 0; i < r.yellow[s]; i++) rng.weighted(out, (x) => (byId.get(x.id).attr?.AGR ?? 10) * (x.yc ? 0.4 : 1)).yc++;
    for (let i = 0; i < r.red[s]; i++) rng.weighted(out, (x) => byId.get(x.id).attr?.AGR ?? 10).rc = 1;
    const win = r.score[s] > r.score[1 - s] ? 0.2 : r.score[s] < r.score[1 - s] ? -0.2 : 0;
    const Q = QUICK_RATING;
    for (const x of out) x.rating = Math.round(clamp(Q.base + Q.goal * x.g + Q.assist * x.a + Q.yellow * x.yc + Q.red * x.rc + win + rng.gauss(0, 0.45), 4, 9.5) * 10) / 10;
    // Kontuzje z modelu (liczba z quickSim), z wagą niskiej odporności
    for (let i = 0; i < r.injuries[s] && out.length; i++) {
      const x = rng.weighted(out, (y) => 1.5 - 0.05 * (byId.get(y.id).hidden?.ODP ?? 10));
      x.injury = rollInjury(rng);
    }
    return out;
  });
  return {
    score: r.score, scorers: r.scorers, shootout: r.shootout ?? null, extraTime: !!r.extraTime,
    stats: { shots: r.shots, onTarget: r.onTarget, possession: r.possession, xg: r.xg },
    players, strengthDiff: r.model.dH - r.model.dA, quick: true,
  };
}

export function rollInjury(rng) {
  const r = rng.next();
  const cat = r < 0.62 ? 'light' : r < 0.9 ? 'medium' : 'severe';
  const [name, lo, hi] = rng.pick(INJURY_TYPES[cat]);
  return { name, days: rng.int(lo, hi), cat };
}

/**
 * Przesunięcie ocen z pełnego silnika na skalę ocen meczów w tle (balans, docs/balans.md).
 * Oceny trafiają do formy (modyfikator siły), morale i wartości zawodników, a mecze gracza idą pełnym silnikiem,
 * mecze AI szybką symulacją. Średnia ocen silnika była o ok. 0,3 niższa, więc drużyna gracza miała stale gorszą
 * formę i morale niż te same kluby pod AI. Liczymy, jaką średnią dałby model ocen z playQuick przy tych samych
 * golach i kartkach, i przesuwamy oceny meczu o różnicę (różnice między zawodnikami zostają).
 * Gdy skala silnika zgadza się z modelem, przesunięcie wynosi ok. 0.
 */
export function engineRatingShift(r) {
  const xs = r.ratings.filter((x) => x.minutes > 0);
  const w = xs.reduce((s, x) => s + Math.min(90, x.minutes), 0);
  if (!w) return 0;
  const eMean = xs.reduce((s, x) => s + x.rating * Math.min(90, x.minutes), 0) / w;
  const goals = r.score[0] + r.score[1];
  const yc = xs.reduce((s, x) => s + (x.yc && !x.rc ? 1 : 0), 0);
  const rc = xs.reduce((s, x) => s + (x.rc ? 1 : 0), 0);
  const qMean = QUICK_RATING.base + (QUICK_RATING.goal * goals + QUICK_RATING.assist * QUICK_RATING.assistShare * goals + QUICK_RATING.yellow * yc + QUICK_RATING.red * rc) / 22;
  return clamp(qMean - eMean, -1, 1);
}

/** Mecz przerwany (drużyna ma za mało zawodników, result.abandoned): walkower 0:3, chyba że rywal wygrywał wyżej. */
export function walkoverScore(r) {
  const ab = r.abandoned;
  if (!ab) return r.score;
  const s = ab.side; const o = 1 - s;
  if (r.score[o] - r.score[s] >= 3) return r.score;
  return s === 0 ? [0, 3] : [3, 0];
}

/** Długość kary za czerwoną kartkę z powodu z silnika (reasonCode); bez powodu losujemy jak w meczach w tle. */
export const RED_BAN = { second: 1, dogso: 1, handball: 1, sfp: 2, violent: 3 };

/** Wynik z pełnego silnika zamieniony na ten sam format co z szybkiej symulacji. */
export function fromEngineResult(r) {
  const shift = engineRatingShift(r);
  const redWhy = new Map(r.events.filter((e) => e.type === 'red' && e.pid).map((e) => [e.pid, e.reasonCode ?? (e.second ? 'second' : null)]));
  const players = [0, 1].map((s) => r.ratings.filter((x) => x.side === s && x.minutes > 0).map((x) => ({
    id: x.id, minutes: x.minutes, g: x.g, a: x.a, yc: x.yc, rc: x.rc, rating: Math.round(clamp(x.rating + shift, 3, 10) * 10) / 10,
    injury: x.injury ? { name: x.injury.name, days: x.injury.days, cat: x.injury.cat } : null, motm: x.id === r.motm,
    ...(x.rc && redWhy.get(x.id) ? { redReason: redWhy.get(x.id) } : {}),
  })));
  const scorers = [0, 1].map((s) => r.events.filter((e) => e.type === 'goal' && !e.provisional && e.side === s && e.pid).map((e) => e.pid));
  return {
    score: walkoverScore(r), scorers, shootout: r.shootout?.goals ?? null, extraTime: r.extraTime,
    stats: { shots: [r.stats[0].shots, r.stats[1].shots], onTarget: [r.stats[0].onTarget, r.stats[1].onTarget], possession: [r.stats[0].possession, r.stats[1].possession], xg: [r.stats[0].xg, r.stats[1].xg] },
    players, strengthDiff: 0, quick: false,
  };
}

// ------------------------------------------------------------ Skutki meczu
/**
 * Odprawa pomeczowa trenera klubu AI (docs/balans.md): ten sam model co odprawa gracza (postMatchBriefing),
 * ton według osobowości trenera (aiChooseSpeech) i pamięć powtórzeń klubu. Wcześniej tylko drużyna gracza
 * dostawała morale z odprawy po meczu, co przy częstych zwycięstwach dawało jej stałą premię morale.
 */
function aiPostMatchTalk(game, f, clubId, s, res, squad, played) {
  const players = squad.filter((p) => played.has(p.id));
  if (!players.length) return;
  const mem = (game.aiSpeech ??= {});
  const gf = res.score[s]; const ga = res.score[1 - s];
  const xg = res.stats?.xg ?? [0, 0];
  const tone = aiChooseSpeech(anyClub(clubId)?.coach ?? 'P', { phase: 'post', diff: gf - ga, xgDiff: (xg[s] ?? 0) - (xg[1 - s] ?? 0), memory: mem[clubId] });
  const r = postMatchBriefing({
    players, tone, memory: mem[clubId], seed: `${game.seed}:${f.id}:po-meczu-ai:${clubId}`,
    ctx: { score: { for: gf, against: ga }, xgFor: xg[s] ?? 0, xgAgainst: xg[1 - s] ?? 0, ratings: Object.fromEntries(res.players[s].map((x) => [x.id, x.rating])), rank: f.derby ? 2 : f.comp === 'pp' ? 1 : 0, clubId },
  });
  for (const p of players) { const m = r.morale[p.id]; if (m) p.morale = applyMorale(p.morale ?? 12, m.delta); }
  mem[clubId] = closeMatchMemory(r.memory);
}

function yellowSuspension(comp, count) {
  const rules = COMPETITIONS[comp]?.yellowSuspension ?? (comp === 'pp' ? COMPETITIONS.pucharPolski.yellowSuspension : []);
  if (!Array.isArray(rules)) {
    // UEFA: pauza po 3. żółtej (uproszczenie: jeden próg na cały sezon), potem co 2 kartki
    const { first, thenEvery } = rules.qualifying ?? { first: 3, thenEvery: 2 };
    return count === first || (count > first && (count - first) % thenEvery === 0) ? 1 : 0;
  }
  for (const r of rules) {
    if (r.at === count) return r.games;
    if (r.every && count > r.after && (count - r.after) % r.every === 0) return r.games;
  }
  return 0;
}

/**
 * Zapis wyniku: mecz, statystyki zawodników, kartki i pauzy, kontuzje, forma, morale, zmęczenie.
 * Zwraca listę wiadomości dla gracza (kontuzje i pauzy jego zawodników).
 */
export function applyResult(game, f, res, rng) {
  f.played = true;
  f.result = { score: res.score, scorers: res.scorers, shootout: res.shootout, extraTime: res.extraTime, stats: res.stats };
  const key = suspKey(f.comp);
  const compRules = LEAGUE_COMPS.includes(f.comp) ? f.comp : f.comp === 'pp' ? 'pucharPolski' : f.comp === 'uefa' ? 'uefa' : null;
  const msgs = [];
  [f.home, f.away].forEach((clubId, s) => {
    if (!game.world.clubs[clubId]) return; // kluby bez stałej kadry: bez zapisu
    const squad = squadOf(game.world, clubId);
    const played = new Map(res.players[s].map((x) => [x.id, x]));
    const mine = clubId === game.clubId;
    const result = res.score[s] > res.score[1 - s] ? 'W' : res.score[s] < res.score[1 - s] ? 'L' : 'D';
    const diff = s === 0 ? res.strengthDiff : -res.strengthDiff;
    for (const p of squad) {
      // Odbycie pauzy: klub zagrał mecz w tych rozgrywkach
      if (p.susp?.[key] > 0 && !played.has(p.id)) {
        p.susp[key]--;
        if (mine && p.susp[key] === 0) msgs.push(['info', `${p.name} odbył pauzę`, `${p.name} może już zagrać w kolejnym meczu.`]);
      }
      const x = played.get(p.id);
      const friendly = f.comp === 'friendly'; // sparing: bez statystyk sezonu, formy, kartek i pauz
      if (!friendly) p.morale = applyMorale(p.morale ?? 12, afterMatchDelta({ result, strengthDiff: diff, derby: f.derby, played: !!x, rating: x?.rating, isRegular: (p.season?.apps ?? 0) >= 5 }));
      if (!x) continue;
      // Statystyki w podziale na rozgrywki (także sparingi) i historia klubowa (mecze o punkty), src/season/history.js
      const grp = statGroup(f.comp);
      addPlayerMatch(p, grp, x);
      if (CLUB_GROUPS.includes(grp)) { const sp = syncSpell(p, f.date); if (sp) { sp.m++; sp.g += x.g; } }
      if (friendly) {
        p.fresh = clamp(Math.round((p.fresh ?? 95) - 24 * (x.minutes / 90)), 35, 100);
        p.matchDebt = Math.max(p.matchDebt ?? 0, Math.round(24 * (x.minutes / 90)));
        p.sharp = clamp(Math.round((p.sharp ?? 70) + 12 * (x.minutes / 90)), 0, 100);
        p.lastMatch = f.date;
        if (x.injury && !(p.injuryDays >= x.injury.days)) { // dłuższa przerwa (np. pogłębiony uraz grany z bólem) zastępuje krótszą
          p.injuryDays = x.injury.days; p.injury = { ...x.injury, since: f.date };
          if (mine) msgs.push(['important', `Kontuzja w sparingu: ${p.name}`, `${p.name}: ${x.injury.name}. Przerwa potrwa ok. ${x.injury.days} dni.`]);
        }
        continue;
      }
      const ss = p.season ?? (p.season = { apps: 0, subs: 0, min: 0, g: 0, a: 0, yc: 0, rc: 0, rating: 0, motm: 0, cs: 0 });
      ss.apps++; ss.min += x.minutes; ss.g += x.g; ss.a += x.a; ss.yc += x.yc ? 1 : 0; ss.rc += x.rc;
      ss.ratingSum = (ss.ratingSum ?? 0) + x.rating; ss.rating = Math.round((ss.ratingSum / ss.apps) * 100) / 100;
      if (x.motm) ss.motm++;
      p.form = [...(p.form ?? []), x.rating].slice(-5);
      p.fresh = clamp(Math.round((p.fresh ?? 95) - 28 * (x.minutes / 90)), 35, 100);
      p.matchDebt = Math.max(p.matchDebt ?? 0, Math.round(30 * (x.minutes / 90)));
      p.sharp = clamp(Math.round((p.sharp ?? 70) + 15 * (x.minutes / 90)), 0, 100);
      p.lastMatch = f.date;
      // Kartki i pauzy
      if (compRules) {
        p.yc = p.yc && typeof p.yc === 'object' ? p.yc : {};
        p.susp = p.susp ?? {};
        if (x.yc && !x.rc) {
          p.yc[key] = (p.yc[key] ?? 0) + 1;
          const games = yellowSuspension(compRules, p.yc[key]);
          if (games) {
            p.susp[key] = (p.susp[key] ?? 0) + games;
            if (mine) msgs.push(['important', `Pauza: ${p.name}`, `${p.name} otrzymał ${p.yc[key]}. żółtą kartkę i nie zagra w ${games === 1 ? 'kolejnym meczu' : `${games} kolejnych meczach`} (${key === 'league' ? 'liga' : key === 'uefa' ? 'puchary europejskie' : 'Puchar Polski'}).`]);
          }
        }
        if (x.rc) {
          const games = RED_BAN[x.redReason] ?? rng.weighted([1, 2, 3], (g) => ({ 1: 0.6, 2: 0.3, 3: 0.1 })[g]);
          p.susp[key] = (p.susp[key] ?? 0) + games;
          if (mine) msgs.push(['important', `Czerwona kartka: ${p.name}`, `${p.name} został ukarany ${games === 1 ? '1 meczem' : `${games} meczami`} zawieszenia.`]);
        }
      }
      if (x.injury && !(p.injuryDays >= x.injury.days)) { // dłuższa przerwa (np. pogłębiony uraz grany z bólem) zastępuje krótszą
        p.injuryDays = x.injury.days;
        p.injury = { ...x.injury, since: f.date };
        if (mine) msgs.push(['important', `Kontuzja: ${p.name}`, `${p.name}: ${x.injury.name}. Przerwa potrwa ok. ${x.injury.days} dni (powrót ok. ${fmtDate(addDays(f.date, x.injury.days))}).`]);
      }
    }
    if (!mine && f.comp !== 'friendly') aiPostMatchTalk(game, f, clubId, s, res, squad, played);
  });
  if (f.comp === 'pp' || f.comp === 'super' || f.comp.startsWith('playoff')) {
    const w = winnerOf(f);
    if (f.comp === 'pp') {
      game.season.cup.winners[f.round] = [...(game.season.cup.winners[f.round] ?? []), w];
      if (f.round === 'F') game.season.cup.champion = w;
    }
    if (f.comp.startsWith('playoff')) (game.season.playoffs.winners ??= {})[f.id] = w;
  }
  recordTeamMatch(game, f); // historia meczów drużyny gracza (tylko jej mecze)
  return msgs;
}

// ------------------------------------------------------------ Systemy dnia
const msg = (date, [priority, subject, body], key, category = 'staff') => createMessage({ date, key, category, from: category === 'staff' ? 'Sztab medyczny' : 'Rozgrywki', subject, body, priority });

/** Mecze dnia bez udziału gracza idą w tle. */
registerDailySystem({
  id: 'matchday', order: 5,
  run(game, date) {
    if (!game.season) return {};
    const rng = new Rng(`dzien:${game.seed}:${date}`);
    const cache = new Map();
    const messages = [];
    const today = game.fixtures.filter((f) => f.date === date && !f.played && f.home && f.away && f.home !== game.clubId && f.away !== game.clubId);
    for (const f of today) {
      const res = playQuick(game, f, rng, cache);
      applyResult(game, f, res, rng);
    }
    // Wyniki kolejki ligi gracza: jedna wiadomość, gdy cała kolejka jest rozegrana
    const myComp = TIER_COMP[clubById(game.clubId)?.tier];
    const roundsToday = new Set(game.fixtures.filter((f) => f.comp === myComp && f.date === date).map((f) => f.round));
    for (const round of roundsToday) {
      const rf = game.fixtures.filter((f) => f.comp === myComp && f.round === round);
      if (rf.every((f) => f.played)) {
        const lines = rf.map((f) => `${anyClub(f.home).name} ${f.result.score[0]}:${f.result.score[1]} ${anyClub(f.away).name}`).join('\n');
        const table = standings(game.fixtures.filter((f) => f.comp === myComp), CLUBS_PL.filter((c) => c.tier === COMPETITIONS[myComp].tier).map((c) => c.id));
        const pos = table.find((r) => r.id === game.clubId)?.pos;
        messages.push(createMessage({ date, key: `round:${myComp}:${round}`, category: 'competitions', from: LEAGUE_NAMES[COMPETITIONS[myComp].tier], priority: 'info', subject: `Wyniki ${round}. kolejki`, body: `${lines}\n\nTwoja drużyna jest na ${pos}. miejscu.` }));
      }
    }
    return { messages };
  },
});

/** Losowania Pucharu Polski (dzień po ostatnim meczu rundy) i baraże po sezonie zasadniczym. */
registerDailySystem({
  id: 'cupDraws', order: 6,
  run(game, date) {
    if (!game.season) return {};
    const messages = [];
    const cup = game.season.cup;
    for (let i = 0; i < PP_ROUNDS.length - 1; i++) {
      const r = PP_ROUNDS[i]; const next = PP_ROUNDS[i + 1];
      if (cup.drawn.includes(next) || !cup.drawn.includes(r)) continue;
      const rf = game.fixtures.filter((f) => f.comp === 'pp' && f.round === r);
      if (!rf.length || !rf.every((f) => f.played)) continue;
      const lastDate = rf.map((f) => f.date).sort().pop();
      if (date <= lastDate) continue;
      const fx = drawRound(cup, next, tierOf, new Rng(`pp:${game.seed}:${next}`), (ids, d) => ids.every((id) => restOk(game.fixtures, id, d)));
      game.fixtures.push(...fx);
      game.fixtures.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      for (const pf of fx) {
        for (const mv of rescheduleAround(game.fixtures, pf)) {
          if (mv.home === game.clubId || mv.away === game.clubId) {
            messages.push(createMessage({ date, key: `moved:${mv.id}`, category: 'competitions', from: LEAGUE_NAMES[COMPETITIONS[mv.comp].tier], priority: 'important', subject: 'Mecz ligowy przełożony', body: `Z powodu meczu w Pucharze Polski mecz ${anyClub(mv.home).name} - ${anyClub(mv.away).name} (${mv.round}. kolejka) został przełożony na ${fmtDate(mv.date)}.` }));
          }
        }
      }
      const mineF = fx.find((f) => f.home === game.clubId || f.away === game.clubId);
      messages.push(createMessage({
        date, key: `pp-draw:${next}`, category: 'competitions', from: 'Puchar Polski', priority: mineF ? 'important' : 'info',
        subject: `Losowanie: ${PP_NAMES[next]} Pucharu Polski`,
        body: mineF ? `Rywal: ${anyClub(mineF.home === game.clubId ? mineF.away : mineF.home).name}, ${mineF.home === game.clubId ? 'u siebie' : 'na wyjeździe'}${mineF.neutral ? ' (stadion neutralny)' : ''}, ${fmtDate(mineF.date)}.`
          : `Pary ${PP_NAMES[next]}: ${fx.map((f) => `${anyClub(f.home).name} - ${anyClub(f.away).name}`).join(', ')}.`,
      }));
    }
    // Baraże o awans po ostatniej kolejce 1 i 2 Ligi (półfinały 3-6, 4-5 u wyżej sklasyfikowanego)
    for (const comp of ['liga1', 'liga2']) {
      if (game.season.playoffs[comp]) continue;
      const lf = game.fixtures.filter((f) => f.comp === comp);
      if (!lf.every((f) => f.played) || date <= lf.map((f) => f.date).sort().pop()) continue;
      const tier = COMPETITIONS[comp].tier;
      const table = standings(lf, CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id));
      const eligible = table.filter((r) => !clubById(r.id)?.parent); // rezerwy nie awansują i nie grają baraży (PLAN 6)
      const [s3, s4, s5, s6] = eligible.slice(2, 6).map((r) => r.id);
      const cfg = DOMESTIC[comp];
      game.season.playoffs[comp] = { direct: eligible.slice(0, 2).map((r) => r.id), semis: [[s3, s6], [s4, s5]] };
      game.fixtures.push(
        { id: `PO-${comp}-SF1`, comp: `playoff-${comp}`, round: 'SF', date: cfg.playoffSemis, time: '18:00', home: s3, away: s6, played: false, knockout: 'single' },
        { id: `PO-${comp}-SF2`, comp: `playoff-${comp}`, round: 'SF', date: cfg.playoffSemis, time: '20:30', home: s4, away: s5, played: false, knockout: 'single' },
      );
      messages.push(createMessage({ date, key: `po:${comp}`, category: 'competitions', from: LEAGUE_NAMES[tier], priority: 'info', subject: `${LEAGUE_NAMES[tier]}: koniec sezonu zasadniczego`, body: `Awans bezpośredni: ${eligible.slice(0, 2).map((r) => anyClub(r.id).name).join(', ')}. Baraże: ${anyClub(s3).name} - ${anyClub(s6).name}, ${anyClub(s4).name} - ${anyClub(s5).name}.` }));
    }
    for (const comp of ['liga1', 'liga2']) {
      const po = game.season.playoffs[comp];
      if (!po || po.final) continue;
      const sf = game.fixtures.filter((f) => f.comp === `playoff-${comp}` && f.round === 'SF');
      if (sf.length !== 2 || !sf.every((f) => f.played) || date <= sf[0].date) continue;
      const [w1, w2] = sf.map(winnerOf);
      const pos = (id) => po.semis.flat().indexOf(id);
      const [h, a] = pos(w1) <= pos(w2) ? [w1, w2] : [w2, w1];
      po.final = true;
      game.fixtures.push({ id: `PO-${comp}-F`, comp: `playoff-${comp}`, round: 'F', date: DOMESTIC[comp].playoffFinal, time: '18:00', home: h, away: a, played: false, knockout: 'single' });
    }
    return { messages };
  },
});

/** Codzienna regeneracja: kontuzje, świeżość, ostrość; w poniedziałki dryf morale. */
registerDailySystem({
  id: 'recovery', order: 90,
  run(game, date) {
    if (!game.world) return {};
    const messages = [];
    const monday = new Date(`${date}T12:00:00Z`).getUTCDay() === 1;
    const leaders = new Set();
    if (monday) for (const [cid, c] of Object.entries(game.world.clubs)) if (c.squad.some((id) => game.world.players[id]?.persona === 'Lider')) leaders.add(cid);
    const sharpCut = addDays(date, -4); // ostrość spada po 4 dniach bez meczu
    for (const p of Object.values(game.world.players)) {
      if (p.injuryDays > 0) {
        p.injuryDays--;
        if (p.injuryDays === 0) {
          if ((p.injury?.days ?? 0) > 28) p.sharp = 30;
          if (p.clubId === game.clubId && p.squad !== 'Y') messages.push(msg(date, ['info', `${p.name} wraca do gry`, `${p.name} jest już zdrowy i gotowy do gry.`], `back:${p.id}:${date}`));
          p.injury = null;
        }
      }
      const wyt = p.attr?.WYT ?? 10;
      // Regeneracja dzienna; po meczu „dług meczowy” (mikrourazy mięśni, glikogen) maleje o połowę na dobę,
      // więc pełna świeżość wraca po ok. 48-72 godzinach, a nie następnego dnia [SZAC]
      const debt = Math.round((p.matchDebt ?? 0) * ((p.age ?? 25) >= 31 ? 0.55 : 0.5));
      if (debt > 0) p.matchDebt = debt; else delete p.matchDebt;
      p.fresh = Math.min(100 - debt, Math.round((p.fresh ?? 95) + 18 * (0.8 + 0.02 * wyt) * ((p.age ?? 25) >= 31 ? 0.85 : 1)));
      if (!p.lastMatch || p.lastMatch < sharpCut) p.sharp = Math.max(40, (p.sharp ?? 70) - 1);
      if (monday) p.morale = weeklyDrift(p.morale ?? 12, leaders.has(p.clubId));
    }
    return { messages };
  },
});

export { standings, GAME_START };

import './europe.js';
import './nationalSystem.js';
import '../career/careerSystem.js';
import '../career/fansSystem.js';
import './rollover.js';
import '../career/acclimatization.js';
