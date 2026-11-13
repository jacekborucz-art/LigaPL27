// Puchary UEFA w grze: dzień po dniu losowania i mecze (src/season/uefa.js), mecze polskich klubów
// w terminarzu krajowym (comp 'uefa'), przekładanie ligi i Pucharu Polski wokół dat UEFA, wiadomości.

import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { Rng } from '../core/rng.js';
import { clubById, LEAGUE_NAMES } from '../data/clubs_pl.js';
import { ephemeralSquad } from '../world/ephemeral.js';
import { SEASON, GAME_START, DOMESTIC } from '../config/calendar2026.js';
import { COMPETITIONS } from '../config/competitions.js';
import { fmtDate } from '../ui/dom.js';
import {
  createUefa, uefaDay, UCOMP_NAMES, ROUND_NAMES, firstLegFor, recordResult, ORDER, COUNTRY_NAMES, countryOf, leagueTable, uefaL, simByStrength,
} from './uefa.js';
import { anyClub, rescheduleAround, restOk, playQuick, applyResult } from './season.js';
import { createSuperCupEU, superCupEUFixture, simulateSuperCupEU, settleSuperCupEU, superCupEULine, venueLabel, HOLDERS_2026 } from './superCupEU.js';

const isPolish = (id) => !!clubById(id);
const SCORE_W = { NAP: 3, SN: 2, OP: 2, SP: 1.4, ŚP: 1, DP: 0.6, WB: 0.5, BO: 0.4, ŚO: 0.35, BR: 0 };

/** Strzelcy klubu bez stałej kadry (kadra na sezon z ziarna klubu, te same nazwiska co w meczu na żywo). */
function scorersFor(clubId, n, rng) {
  if (!n) return [];
  const squad = ephemeralSquad(anyClub(clubId), SEASON).slice(0, 18);
  return Array.from({ length: n }, () => {
    const p = rng.weighted(squad, (x) => SCORE_W[x.pos] ?? 0.5);
    return { id: p.id, name: p.name, club: clubId };
  });
}

function playerName(game, id, clubId) {
  const p = game.world?.players?.[id];
  if (p) return p.name;
  return ephemeralSquad(anyClub(clubId), SEASON).find((x) => x.id === id)?.name ?? '?';
}

export function uefaLabel(m) {
  return `${UCOMP_NAMES[m.comp]}, ${ROUND_NAMES[m.round]}${m.md ? `, ${m.md}. kolejka` : ''}${m.leg ? `, ${m.leg === 1 ? 'pierwszy mecz' : 'rewanż'}` : ''}`;
}
const cname = (id) => anyClub(id)?.name ?? id;
const withCountry = (id) => (isPolish(id) ? cname(id) : `${cname(id)} (${COUNTRY_NAMES[countryOf(id)] ?? countryOf(id)})`);

/** Przesunięcie meczu Pucharu Polski w obrębie okna rundy, gdy koliduje z UEFA (PLAN 5.1, priorytet 3). */
function movePpAround(fixtures, fixed) {
  const moved = [];
  for (const f of fixtures) {
    if (f.comp !== 'pp' || f.played || f === fixed || ![f.home, f.away].some((c) => c === fixed.home || c === fixed.away)) continue;
    const gap = Math.abs(new Date(f.date) - new Date(fixed.date)) / 86400000;
    if (gap >= 2) continue;
    const r = DOMESTIC.pucharPolski.rounds.find((x) => x.id === f.round);
    if (!r) continue;
    const others = fixtures.filter((x) => x !== f);
    const days = [];
    for (let d = r.window[0]; d <= r.window[1]; d = addDays(d, 1)) days.push(d);
    let done = days.find((d) => [f.home, f.away].every((c) => restOk(others, c, d)));
    if (done) { f.date = done; f.postponed = true; moved.push(f); continue; }
    // Brak wolnego dnia w oknie: zwalniamy termin, przekładając mecz ligowy (liga ma najniższy priorytet)
    const original = f.date;
    for (const d of days) {
      if ([f.home, f.away].some((c) => !restOk([fixed], c, d))) continue;
      const before = new Map(fixtures.map((x) => [x, x.date]));
      f.date = d;
      const shifted = rescheduleAround(fixtures, f);
      if ([f.home, f.away].every((c) => restOk(fixtures.filter((x) => x !== f), c, d))) { f.postponed = true; moved.push(f, ...shifted); done = d; break; }
      for (const [x, dt] of before) x.date = dt;
      f.date = original;
    }
  }
  return moved;
}

/** Mecz UEFA polskiego klubu jako mecz w terminarzu krajowym. */
function toFixture(m) {
  return {
    id: m.id, comp: 'uefa', ucomp: m.comp, round: m.round, leg: m.leg, md: m.md ?? null, date: m.date, time: m.time,
    home: m.home, away: m.away, played: false, neutral: !!m.neutral, knockout: m.round === 'F' ? 'single' : null,
    label: uefaLabel(m),
  };
}

function roundMatches(U, d) {
  if (d.round === 'league') return U.comps[d.comp].league.matches.map((id) => U.matches[id]);
  return U.comps[d.comp].rounds[d.round].ties.flatMap((t) => t.legs.map((id) => U.matches[id]));
}

/** Wpisuje nowe mecze polskich klubów do terminarza i przekłada kolidujące mecze krajowe. */
function mirrorDraw(game, d, date, messages) {
  const U = game.season.uefa;
  const fresh = roundMatches(U, d).filter((m) => isPolish(m.home) || isPolish(m.away));
  for (const m of fresh) {
    if (game.fixtures.some((f) => f.id === m.id)) continue;
    const f = toFixture(m);
    game.fixtures.push(f);
    const moved = [...rescheduleAround(game.fixtures, f), ...movePpAround(game.fixtures, f)];
    for (const mv of moved) {
      if (mv.home !== game.clubId && mv.away !== game.clubId) continue;
      const from = mv.comp === 'pp' ? 'Puchar Polski' : LEAGUE_NAMES[COMPETITIONS[mv.comp]?.tier] ?? 'Rozgrywki';
      messages.push(createMessage({ date, key: `moved:${mv.id}:${mv.date}`, category: 'competitions', from, priority: 'important', subject: 'Mecz przełożony', body: `Z powodu meczu w pucharach europejskich mecz ${cname(mv.home)} - ${cname(mv.away)} został przełożony na ${fmtDate(mv.date)}.` }));
    }
  }
  game.fixtures.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return fresh;
}

function drawMessage(game, d, fresh, date) {
  const mine = fresh.filter((m) => m.home === game.clubId || m.away === game.clubId);
  const polish = [...new Set(fresh.flatMap((m) => [m.home, m.away]).filter(isPolish))];
  if (!polish.length) return null;
  const title = `${UCOMP_NAMES[d.comp]}: losowanie, ${ROUND_NAMES[d.round]}`;
  const lines = [];
  if (d.round === 'league') {
    for (const club of polish) {
      const ms = fresh.filter((m) => m.home === club || m.away === club).sort((a, b) => a.md - b.md);
      lines.push(`${cname(club)}:\n${ms.map((m) => `${m.md}. kolejka, ${fmtDate(m.date)}: ${m.home === club ? `u siebie z ${withCountry(m.away)}` : `na wyjeździe z ${withCountry(m.home)}`}`).join('\n')}`);
    }
  } else {
    for (const club of polish) {
      const m1 = fresh.find((m) => (m.home === club || m.away === club) && m.leg !== 2);
      const m2 = fresh.find((m) => (m.home === club || m.away === club) && m.leg === 2);
      const opp = m1.home === club ? m1.away : m1.home;
      lines.push(m2
        ? `${cname(club)} - ${withCountry(opp)}. Pierwszy mecz ${fmtDate(m1.date)} ${m1.home === club ? 'u siebie' : 'na wyjeździe'}, rewanż ${fmtDate(m2.date)}.`
        : `${cname(club)} - ${withCountry(opp)}, ${fmtDate(m1.date)}${m1.neutral ? ', stadion neutralny' : ''}.`);
    }
  }
  return createMessage({
    date, key: `uefa-draw:${d.comp}:${d.round}`, category: 'competitions', from: 'UEFA', priority: mine.length ? 'important' : 'info',
    subject: title, body: lines.join('\n\n'), actions: [],
  });
}

/** Rozstrzygnięte dwumecze polskich klubów: awans albo spadek do innych rozgrywek. */
const DROP = { 'LM:Q1': ['LK', 'Q2'], 'LM:Q2': ['LE', 'Q3'], 'LM:Q3': ['LE', 'PO'], 'LM:PO': ['LE', 'league'], 'LE:Q3': ['LK', 'PO'], 'LE:PO': ['LK', 'league'] };
function tieMessages(game, date) {
  const U = game.season.uefa;
  U.notified = U.notified ?? [];
  const out = [];
  for (const comp of Object.keys(U.comps)) {
    for (const r of ORDER[comp]) {
      if (r === 'league') continue;
      for (const t of U.comps[comp].rounds[r].ties) {
        if (!t.winner || U.notified.includes(t.id) || !(isPolish(t.a) || isPolish(t.b))) continue;
        U.notified.push(t.id);
        const res = t.agg ? `${t.agg[0]}:${t.agg[1]}${t.legs.length > 1 ? ' w dwumeczu' : ''}${t.shootout ? `, karne ${t.shootout[0]}:${t.shootout[1]}` : ''}` : '';
        const next = ORDER[comp][ORDER[comp].indexOf(r) + 1];
        const lines = [];
        if (isPolish(t.winner)) lines.push(r === 'F' ? `${cname(t.winner)} wygrywa ${UCOMP_NAMES[comp]}!` : `${cname(t.winner)} awansuje: ${UCOMP_NAMES[comp]}, ${ROUND_NAMES[next]}.`);
        if (isPolish(t.loser)) {
          const drop = DROP[`${comp}:${r}`];
          lines.push(drop ? `${cname(t.loser)} odpada i zagra w ${UCOMP_NAMES[drop[0]]}, ${ROUND_NAMES[drop[1]]}.` : `${cname(t.loser)} kończy grę w pucharach europejskich.`);
        }
        const mine = t.a === game.clubId || t.b === game.clubId;
        out.push(createMessage({ date, key: `uefa-tie:${t.id}`, category: 'competitions', from: 'UEFA', priority: mine ? 'important' : 'info', subject: `${UCOMP_NAMES[comp]}: ${cname(t.a)} - ${cname(t.b)} ${res}`, body: lines.join(' ') }));
      }
    }
    // Faza ligowa: wynik końcowy polskich klubów
    const L = U.comps[comp].league;
    if (L && U.comps[comp].rounds.league.done && !U.notified.includes(`${comp}-league`)) {
      U.notified.push(`${comp}-league`);
      const pol = L.teams.filter(isPolish);
      if (pol.length) {
        const table = leagueTable(U, comp);
        const text = pol.map((id) => { const row = table.find((x) => x.id === id); return `${cname(id)}: ${row.pos}. miejsce, ${row.pts} pkt (${row.pos <= 8 ? '1/8 finału' : row.pos <= 24 ? 'baraże fazy pucharowej' : 'koniec gry w pucharach'})`; }).join('\n');
        out.push(createMessage({ date, key: `uefa-league-end:${comp}`, category: 'competitions', from: 'UEFA', priority: pol.includes(game.clubId) ? 'important' : 'info', subject: `${UCOMP_NAMES[comp]}: koniec fazy ligowej`, body: text }));
      }
    }
  }
  return out;
}

/** Wyniki meczów polskich klubów z terminarza krajowego trafiają do pucharów. */
function syncFromFixtures(game, date, messages) {
  const U = game.season.uefa;
  const synced = [];
  for (const f of game.fixtures) {
    if (f.comp !== 'uefa') continue;
    const m = U.matches[f.id];
    if (!m) continue;
    if (f.played && !m.played) {
      const sc = f.result.scorers ?? [[], []];
      const scorers = [0, 1].flatMap((s) => (sc[s] ?? []).map((id) => {
        const club = s === 0 ? f.home : f.away;
        return { id, name: playerName(game, id, club), club };
      }));
      recordResult(U, f.id, { score: f.result.score, extraTime: f.result.extraTime, shootout: f.result.shootout }, scorers);
      synced.push(f);
    }
    if (!f.played && f.leg === 2 && !f.knockout) {
      const fl = firstLegFor(U, m);
      if (fl) f.knockout = { firstLeg: fl };
    }
  }
  if (synced.length && messages) {
    const lines = synced.map((f) => `${cname(f.home)} ${f.result.score[0]}:${f.result.score[1]} ${cname(f.away)}${f.result.shootout ? ` (karne ${f.result.shootout[0]}:${f.result.shootout[1]})` : f.result.extraTime ? ' (po dogrywce)' : ''}, ${f.label}`);
    messages.push(createMessage({ date, key: `uefa-results:${date}`, category: 'competitions', from: 'UEFA', priority: 'info', subject: 'Polskie kluby w pucharach', body: lines.join('\n') }));
  }
}

/** Superpuchar Europy w starym zapisie: mecz sezonu tworzony przy pierwszym dniu po aktualizacji. */
function ensureSuperCupEU(game, date) {
  const S = game.season;
  if (S.superCupEU !== undefined) return S.superCupEU;
  const year = Number(String(S.seasonId ?? SEASON).slice(0, 4));
  const prev = (game.archive ?? []).at(-1)?.uefa;
  const sc = createSuperCupEU(year, year === 2026 ? HOLDERS_2026 : prev ?? {});
  S.superCupEU = sc ?? null;
  if (sc && (isPolish(sc.home) || isPolish(sc.away)) && sc.date >= date && !game.fixtures.some((f) => f.id === sc.id)) {
    game.fixtures.push(superCupEUFixture(sc));
    game.fixtures.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }
  return S.superCupEU;
}

/** Superpuchar Europy: mecz w tle (bez polskich klubów) albo wynik z terminarza (polski klub). */
function superCupEUDay(game, date, messages) {
  const sc = ensureSuperCupEU(game, date);
  if (!sc || sc.played || date < sc.date) return;
  const f = game.fixtures.find((x) => x.id === sc.id);
  if (f) { if (!f.played) return; settleSuperCupEU(sc, f.result); }
  else settleSuperCupEU(sc, simulateSuperCupEU(sc, uefaL, simByStrength));
  if (messages) {
    messages.push(createMessage({ date, key: `seu:${sc.id}`, category: 'competitions', from: 'UEFA', priority: sc.home === game.clubId || sc.away === game.clubId ? 'important' : 'info',
      subject: `Superpuchar Europy: ${cname(sc.winner)} zwycięzcą`,
      body: `${superCupEULine(sc)}. ${venueLabel(sc.venue)} (${sc.venue.country}), ${fmtDate(sc.date)}. Zwycięzca Ligi Mistrzów zagrał ze zwycięzcą Ligi Europy.` }));
  }
}

/** Stary zapis: Superpuchar Europy sezonu (utworzony i, jeśli termin minął, rozegrany bez wiadomości). */
export function syncSuperCupEU(game) {
  if (game.season?.uefa && game.date) superCupEUDay(game, game.date, null);
}

/** Jeden dzień pucharów UEFA w grze. */
export function europeDay(game, date, { silent = false } = {}) {
  if (!game.season?.uefa) return [];
  const messages = [];
  superCupEUDay(game, date, silent ? null : messages);
  syncFromFixtures(game, date, silent ? null : messages);
  const { draws } = uefaDay(game.season.uefa, date, { isPolish, scorersFor });
  for (const d of draws) {
    const fresh = mirrorDraw(game, d, date, messages);
    const msg = drawMessage(game, d, fresh, date);
    if (msg) messages.push(msg);
  }
  messages.push(...tieMessages(game, date));
  for (const comp of Object.keys(game.season.uefa.comps)) {
    const c = game.season.uefa.comps[comp];
    const key = `uefa-champion:${comp}`;
    if (c.champion && !(game.season.uefa.notified ?? []).includes(key)) {
      (game.season.uefa.notified ??= []).push(key);
      messages.push(createMessage({ date, key, category: 'competitions', from: 'UEFA', priority: 'info', subject: `${UCOMP_NAMES[comp]}: ${cname(c.champion)} zwycięzcą`, body: `${withCountry(c.champion)} wygrywa ${UCOMP_NAMES[comp]} ${SEASON}.` }));
    }
  }
  return silent ? [] : messages;
}

registerDailySystem({
  id: 'europe', order: 4,
  run(game, date) {
    if (!game.season?.uefa) return {};
    return { messages: europeDay(game, date) };
  },
});

/**
 * Zapis sprzed etapu 8: dodaje puchary i nadrabia dni od startu gry (mecze polskich klubów z przeszłości
 * idą szybką symulacją, bez wiadomości). Usuwa tymczasowy mecz UEFA bez rywala.
 */
export function ensureUefa(game) {
  if (!game.season || game.season.uefa) return false;
  game.season.uefa = createUefa(game.seed);
  for (const list of new Set([game.fixtures, game.season.fixtures].filter(Boolean))) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].comp === 'uefa' && !list[i].away) list.splice(i, 1);
  }
  for (let d = GAME_START; d < game.date; d = addDays(d, 1)) {
    europeDay(game, d, { silent: true });
    const rng = new Rng(`nadrabianie:${game.seed}:${d}`);
    for (const f of game.fixtures.filter((x) => x.comp === 'uefa' && x.date === d && !x.played)) applyResult(game, f, playQuick(game, f, rng), rng);
  }
  europeDay(game, game.date, { silent: true });
  return true;
}
