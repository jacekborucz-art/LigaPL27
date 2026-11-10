// Sparingi klubu gracza: tylko w wolnych terminach (okres przygotowawczy latem, przerwa zimowa, okna FIFA),
// co najmniej 2 dni od innych meczów obu drużyn (restOk z season.js). Limity: 6 latem, 4 zimą, 2 na okno FIFA.
// Rywale: polskie kluby z tej samej albo niższej ligi (też z wolnym terminem) i kluby zagraniczne
// (na obozie: z kraju obozu, mecz na neutralnym boisku). Sparing to zwykły wpis w game.fixtures (comp 'friendly');
// mecz rozgrywa aplikacja, a trening liczy go jak dzień meczowy (zgranie, obciążenie).

import { addDays } from '../core/gameLoop.js';
import { SEASON_START, FIFA_WINDOWS } from '../config/calendar2026.js';
import { CLUBS_PL, clubById, LEAGUE_NAMES } from '../data/clubs_pl.js';
import { restOk } from '../season/season.js';
import { UEFA_CLUBS, COUNTRY_NAMES } from '../season/uefa.js';
import { FRIENDLY, CAMP } from './config.js';
import { campWindow, campOn, officialDates } from './camps.js';

/** Okres sparingowy, do którego należy dzień (albo null). */
export function friendlyPeriod(game, date, official = officialDates(game)) {
  const summer = campWindow(game, 'summer', game.clubId, official);
  if (date > SEASON_START && date < summer.start) return { id: 'lato', kind: 'lato', limit: FRIENDLY.limits.lato, name: FRIENDLY.names.lato };
  const ny = `${summer.key.slice(0, 4) * 1 + 1}-01-01`;
  const lastAutumn = [...official].reverse().find((d) => d < ny);
  const spring = official.find((d) => d >= ny);
  if (lastAutumn && spring && date > lastAutumn && date < spring) return { id: 'zima', kind: 'zima', limit: FRIENDLY.limits.zima, name: FRIENDLY.names.zima };
  const w = FIFA_WINDOWS.find((x) => date >= x.from && date <= x.to);
  if (w) return { id: `fifa:${w.from}`, kind: 'fifa', limit: FRIENDLY.limits.fifa, name: FRIENDLY.names.fifa };
  return null;
}

/** Zaplanowane i rozegrane sparingi klubu gracza. */
export function clubFriendlies(game) {
  return (game.fixtures || []).filter((f) => f.comp === 'friendly' && (f.home === game.clubId || f.away === game.clubId));
}

function countIn(game, periodId, official) {
  return clubFriendlies(game).filter((f) => friendlyPeriod(game, f.date, official)?.id === periodId).length;
}

/** Wolne terminy na sparing w najbliższych `days` dniach: [{ date, period, used }]. */
export function friendlyDates(game, { days = 120, limit = 40 } = {}) {
  const official = officialDates(game);
  const out = [];
  for (let i = 1; i <= days && out.length < limit; i++) {
    const date = addDays(game.date, i);
    const period = friendlyPeriod(game, date, official);
    if (!period) continue;
    if (!restOk(game.fixtures || [], game.clubId, date)) continue;
    const used = countIn(game, period.id, official);
    if (used >= period.limit) continue;
    out.push({ date, period, used });
  }
  return out;
}

export function levelText(diff) {
  return diff >= 1.5 ? 'Dużo silniejszy' : diff >= 0.5 ? 'Silniejszy' : diff > -0.5 ? 'Podobny poziom' : diff > -1.5 ? 'Słabszy' : 'Dużo słabszy';
}

/** Propozycje rywali na dany dzień: polskie kluby z wolnym terminem i kluby zagraniczne. */
export function friendlyOpponents(game, date) {
  const me = clubById(game.clubId);
  const camp = campOn(game, date);
  const used = new Set(clubFriendlies(game).map((f) => (f.home === game.clubId ? f.away : f.home)));
  const myL = me?.L ?? 10;
  const polish = camp && camp.dest !== 'polska' ? [] : CLUBS_PL
    .filter((c) => c.id !== game.clubId && c.tier >= (me?.tier ?? 1) && c.parent !== game.clubId && !used.has(c.id) && restOk(game.fixtures || [], c.id, date))
    .sort((a, b) => Math.abs(a.L - myL) - Math.abs(b.L - myL)).slice(0, 6)
    .map((c) => ({ id: c.id, name: c.name, short: c.short, foreign: false, where: LEAGUE_NAMES[c.tier], L: c.L, level: levelText(c.L - myL), neutral: !!camp }));
  const countries = camp ? [CAMP.dests[camp.dest].country] : FRIENDLY.neighbours;
  const foreign = UEFA_CLUBS
    .filter((c) => countries.includes(c.country) && !used.has(c.id) && c.L >= myL - 1.5 && c.L <= myL + 3)
    .sort((a, b) => Math.abs(a.L - myL - 0.5) - Math.abs(b.L - myL - 0.5)).slice(0, camp ? 6 : 4)
    .map((c) => ({ id: c.id, name: c.name, short: c.short, foreign: true, where: COUNTRY_NAMES[c.country] ?? c.country, L: c.L, level: levelText(c.L - myL), neutral: !!camp }));
  return [...polish, ...foreign];
}

/** Dodaje sparing do terminarza. Zwraca { ok, error?, fixture? }. */
export function createFriendly(game, date, oppId) {
  if (!date || date <= game.date) return { ok: false, error: 'Sparing można zaplanować tylko w przyszłości.' };
  const official = officialDates(game);
  const period = friendlyPeriod(game, date, official);
  if (!period) return { ok: false, error: 'Sparingi gramy w okresie przygotowawczym, w przerwie zimowej i w przerwach na reprezentacje.' };
  if (countIn(game, period.id, official) >= period.limit) return { ok: false, error: `Limit sparingów w tym okresie to ${period.limit}.` };
  if (!restOk(game.fixtures || [], game.clubId, date)) return { ok: false, error: 'Drużyna potrzebuje 2 dni przerwy od innych meczów.' };
  const opp = friendlyOpponents(game, date).find((o) => o.id === oppId);
  if (!opp) return { ok: false, error: 'Ten rywal nie może zagrać w tym terminie.' };
  const fixture = {
    id: `SP-${date}-${opp.id}`, comp: 'friendly', round: 'F', date, time: FRIENDLY.time,
    home: game.clubId, away: opp.id, played: false, neutral: opp.neutral, label: `Sparing: ${opp.name}`,
  };
  game.fixtures.push(fixture);
  game.fixtures.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
  return { ok: true, fixture };
}

/** Odwołanie zaplanowanego sparingu (przed dniem meczu). */
export function cancelFriendly(game, id) {
  const i = (game.fixtures || []).findIndex((f) => f.id === id && f.comp === 'friendly');
  if (i < 0) return { ok: false, error: 'Nie ma takiego sparingu.' };
  const f = game.fixtures[i];
  if (f.played || f.date <= game.date) return { ok: false, error: 'Tego sparingu nie da się już odwołać.' };
  game.fixtures.splice(i, 1);
  return { ok: true };
}
