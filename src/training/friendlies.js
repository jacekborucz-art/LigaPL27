// Sparingi klubu gracza: tylko w wolnych terminach (okres przygotowawczy latem, przerwa zimowa, okna FIFA),
// co najmniej 2 dni od innych meczów obu drużyn (restOk z season.js). Limity: 6 latem, 4 zimą, 2 na okno FIFA.
// Rywale: polskie kluby z tej samej albo niższej ligi (też z wolnym terminem) i kluby zagraniczne
// (na obozie: z kraju obozu, mecz na neutralnym boisku). Sparing to zwykły wpis w game.fixtures (comp 'friendly');
// mecz rozgrywa aplikacja, a trening liczy go jak dzień meczowy (zgranie, obciążenie).

import { addDays, registerDailySystem } from '../core/gameLoop.js';
import { Rng } from '../core/rng.js';
import { createMessage } from '../core/inbox.js';
import { SEASON_START, FIFA_WINDOWS } from '../config/calendar2026.js';
import { CLUBS_PL, clubById, LEAGUE_NAMES } from '../data/clubs_pl.js';
import { restOk, squadFor } from '../season/season.js';
import { UEFA_CLUBS, COUNTRY_NAMES } from '../season/uefa.js';
import { FRIENDLY, CAMP } from './config.js';
import { campWindow, campOn, officialDates } from './camps.js';
import { DECIDERS, SUB_RULES, ROTATIONS, FRIENDLY_DEFAULTS } from '../engine/match/rules.js';

/**
 * Opisy zasad sparingu dla UI (docs/sparingi-i-karne.md, rozdz. 4): krótka nazwa (znacznik w terminarzu),
 * pełna nazwa (przełącznik) i jedno zdanie wyjaśnienia.
 */
export const FRIENDLY_RULE_TEXT = {
  decider: {
    none: { tag: 'Remis zostaje', name: 'Bez rozstrzygnięcia', note: 'Typowy sparing: remis to remis, bez dodatkowego obciążenia.' },
    penalties: { tag: 'Remis: karne', name: 'Od razu karne', note: 'Przy remisie po 90 minutach seria rzutów karnych. Dobra okazja, żeby ją przećwiczyć.' },
    et_penalties: { tag: 'Remis: dogrywka', name: 'Dogrywka i karne', note: 'Jak w pucharze: 2 x 15 minut, potem karne. Dokłada 30 minut obciążenia.' },
  },
  subs: {
    standard: { tag: '5 zmian', name: 'Standardowe 5', note: '5 zmian w 3 oknach, jak w meczu o punkty.' },
    unlimited: { tag: 'Zmiany bez limitu', name: 'Bez limitu', note: 'Każdy rezerwowy może wejść, także po kontuzji. Zmieniony nie wraca.' },
    rolling: { tag: 'Zmiany powrotne', name: 'Powrotne', note: 'Mecz kontrolny za porozumieniem klubów: zmieniony zawodnik może wrócić na boisko.' },
  },
  rotation: {
    auto: { tag: 'Rotacja: asystent', name: 'Automatycznie', note: 'Asystent dobiera plan do okresu i liczby rezerwowych.' },
    two_xi: { tag: 'Dwie jedenastki', name: 'Dwie jedenastki', note: 'Po 45 minut dla każdej grupy: w przerwie wymiana całej drużyny.' },
    staggered: { tag: 'Zmiany stopniowe', name: 'Zmiany stopniowe', note: 'Część składu w przerwie, reszta między 60. a 75. minutą.' },
    match: { tag: 'Jak w lidze', name: 'Jak w meczu o punkty', note: 'Podstawowi grają dłużej, zmiany jak w lidze. Generalka przed sezonem.' },
  },
};

/**
 * Sprawdza i uzupełnia zasady sparingu: { decider, subs, rotation } z wartościami z DECIDERS, SUB_RULES, ROTATIONS,
 * brakujące z FRIENDLY_DEFAULTS. Zwraca { ok, rules } albo { ok: false, error }.
 */
export function normalizeFriendlyRules(opts = {}, base = FRIENDLY_DEFAULTS) {
  const o = opts ?? {};
  const rules = {
    decider: o.decider ?? base.decider ?? FRIENDLY_DEFAULTS.decider,
    subs: o.subs ?? base.subs ?? FRIENDLY_DEFAULTS.subs,
    rotation: o.rotation ?? base.rotation ?? FRIENDLY_DEFAULTS.rotation,
  };
  if (!DECIDERS.includes(rules.decider)) return { ok: false, error: 'Nieznany sposób rozstrzygnięcia remisu.' };
  if (!SUB_RULES.includes(rules.subs)) return { ok: false, error: 'Nieznana reguła zmian.' };
  if (!ROTATIONS.includes(rules.rotation)) return { ok: false, error: 'Nieznany plan rotacji.' };
  return { ok: true, rules };
}

/** Zasady sparingu z wpisu terminarza (stare zapisy bez friendlyRules: wartości domyślne). */
export function friendlyRulesOf(f) {
  return { ...FRIENDLY_DEFAULTS, period: null, ...(f?.friendlyRules ?? {}) };
}

/** Znaczniki zasad sparingu do terminarza i listy (tylko to, co odbiega od zwykłego sparingu, plus zmiany). */
export function friendlyRuleTags(f) {
  const r = friendlyRulesOf(f);
  const T = FRIENDLY_RULE_TEXT;
  const tags = [T.subs[r.subs]?.tag];
  if (r.decider !== 'none') tags.push(T.decider[r.decider]?.tag);
  if (r.rotation !== 'auto') tags.push(T.rotation[r.rotation]?.tag);
  return tags.filter(Boolean);
}

/** Okres sparingowy, do którego należy dzień (albo null). */
export function friendlyPeriod(game, date, official = officialDates(game)) {
  const summer = campWindow(game, 'summer', game.clubId, official);
  if (date > SEASON_START && date < summer.start) return { id: 'lato', kind: 'lato', limit: FRIENDLY.limits.lato, name: FRIENDLY.names.lato };
  const winter = campWindow(game, 'winter', game.clubId, official); // po urlopie świątecznym, przed pierwszym meczem wiosny
  if (date > winter.open && date < winter.start) return { id: 'zima', kind: 'zima', limit: FRIENDLY.limits.zima, name: FRIENDLY.names.zima };
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

/**
 * Propozycje rywali na dany dzień (realia sparingów polskich klubów, Nov 24, 2026) [SZAC]:
 * - polskie kluby z wolnym terminem: z ligi gracza, niższych i o jedną wyżej, a o dwie i więcej wyżej tylko z tego
 *   samego regionu (lokalny sparing z „dużym” klubem); kolejność: poziom, bliżej z tego samego regionu; do 16;
 * - zagraniczne: kraje sąsiednie i popularne kierunki sparingów (FRIENDLY.neighbours), poziom od -2 do +2,5; do 8;
 *   do 4 miejsc na liście polskich dla klubów z niższych lig (najpierw z regionu).
 */
export function friendlyOpponents(game, date) {
  const me = clubById(game.clubId);
  const camp = campOn(game, date);
  const used = new Set(clubFriendlies(game).map((f) => (f.home === game.clubId ? f.away : f.home)));
  const myL = me?.L ?? 10;
  const myTier = me?.tier ?? 1;
  const sameRegion = (c) => !!me?.region && c.region === me.region;
  const tierOk = (c) => c.tier >= myTier - 1 || sameRegion(c); // o dwie ligi wyżej tylko sąsiad z regionu
  const near = (c) => Math.abs(c.L - myL) - (sameRegion(c) ? 0.6 : 0);
  const abroad = !!camp && camp.dest !== 'polska';
  const campLand = abroad ? COUNTRY_NAMES[CAMP.dests[camp.dest].country] ?? CAMP.dests[camp.dest].name : null;
  const pool = CLUBS_PL
    .filter((c) => c.id !== game.clubId && tierOk(c) && c.parent !== game.clubId && !used.has(c.id) && restOk(game.fixtures || [], c.id, date))
    .sort((a, b) => near(a) - near(b));
  // Kilka miejsc dla klubów z niższych lig (częsty sparing „dużego” z mniejszym), najpierw z regionu, potem najmocniejsze
  const lower = pool.filter((c) => c.tier > myTier).sort((a, b) => Number(sameRegion(b)) - Number(sameRegion(a)) || b.L - a.L).slice(0, FRIENDLY.lowerSlots);
  const top = pool.filter((c) => !lower.includes(c)).slice(0, FRIENDLY.maxPolish - lower.length);
  // Obóz za granicą: polskie kluby, które są w tym czasie na obozach w tym kraju (do FRIENDLY.campPolish)
  const polish = [...top, ...lower].sort((a, b) => near(a) - near(b)).slice(0, abroad ? FRIENDLY.campPolish : FRIENDLY.maxPolish)
    .map((c) => ({ id: c.id, name: c.name, short: c.short, foreign: false, where: `${LEAGUE_NAMES[c.tier]}${abroad ? `, na obozie (${campLand})` : sameRegion(c) ? ', z regionu' : ''}`, L: c.L, level: levelText(c.L - myL), neutral: !!camp }));
  if (abroad) return [...polish, ...campGuests(game, date, camp, myL, used)];
  const countries = camp ? [CAMP.dests[camp.dest].country] : FRIENDLY.neighbours;
  // Bez obozu za granicą rywali z zagranicy mają tylko kluby Ekstraklasy i 1 Ligi (niższe ligi grają sparingi w kraju)
  const foreign = !camp && myTier > 2 ? [] : UEFA_CLUBS
    .filter((c) => countries.includes(c.country) && !used.has(c.id) && c.L >= myL - 2 && c.L <= myL + FRIENDLY.foreignUp)
    .sort((a, b) => Math.abs(a.L - myL - 0.5) - Math.abs(b.L - myL - 0.5)).slice(0, FRIENDLY.maxForeign)
    .map((c) => ({ id: c.id, name: c.name, short: c.short, foreign: true, where: COUNTRY_NAMES[c.country] ?? c.country, L: c.L, level: levelText(c.L - myL), neutral: !!camp }));
  return [...polish, ...foreign];
}

/**
 * Rywale z zagranicy na obozie za granicą (Nov 24, 2026) [SZAC]: kluby z kraju obozu i drużyny z całej Europy, które
 * są tam w tym samym czasie na obozach. Głównie podobny i niższy poziom (słabszy klub dostaje „niższą półkę”,
 * np. San Marino, Luksemburg, Andora), rzadko jeden wyraźnie silniejszy (szansa FRIENDLY.campStrongChance na dzień).
 */
function campGuests(game, date, camp, myL, used) {
  const land = CAMP.dests[camp.dest].country;
  const rng = new Rng(`sparing-oboz:${game.seed}:${camp.from}:${date}`);
  const ok = (c) => !used.has(c.id) && c.L >= myL - FRIENDLY.campDown && c.L <= myL + FRIENDLY.campUp;
  const fromLand = UEFA_CLUBS.filter((c) => c.country === land && ok(c));
  const guests = rng.shuffle(UEFA_CLUBS.filter((c) => c.country !== land && ok(c)))
    .sort((a, b) => Math.abs(a.L - myL) - Math.abs(b.L - myL)).slice(0, FRIENDLY.campGuests);
  const strong = rng.chance(FRIENDLY.campStrongChance)
    ? rng.pick(UEFA_CLUBS.filter((c) => !used.has(c.id) && c.L > myL + FRIENDLY.campUp && c.L <= myL + FRIENDLY.campStrongUp)) ?? null
    : null;
  const seen = new Set();
  return [...fromLand, ...guests, ...(strong ? [strong] : [])].filter((c) => !seen.has(c.id) && seen.add(c.id))
    .slice(0, FRIENDLY.maxForeign + (strong ? 1 : 0))
    .map((c) => ({ id: c.id, name: c.name, short: c.short, foreign: true, where: `${COUNTRY_NAMES[c.country] ?? c.country}${c.country === land ? '' : ', na obozie'}`, L: c.L, level: levelText(c.L - myL), neutral: true }));
}

/**
 * Dodaje sparing do terminarza. opts: { decider, subs, rotation } (umowa klubów, domyślnie FRIENDLY_DEFAULTS),
 * zapisane w fixture.friendlyRules razem z okresem. Zwraca { ok, error?, fixture? }.
 */
export function createFriendly(game, date, oppId, opts = {}) {
  const nr = normalizeFriendlyRules(opts);
  if (!nr.ok) return nr;
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
    friendlyRules: { ...nr.rules, period: period.kind },
  };
  game.fixtures.push(fixture);
  game.fixtures.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
  return { ok: true, fixture };
}

/**
 * Zmiana zasad zaplanowanego sparingu (te same warunki co odwołanie: przyszły, nierozegrany). opts: część pól
 * { decider, subs, rotation }, reszta zostaje. Zwraca { ok, error?, fixture? }.
 */
export function setFriendlyRules(game, id, opts = {}) {
  const f = (game.fixtures || []).find((x) => x.id === id && x.comp === 'friendly');
  if (!f) return { ok: false, error: 'Nie ma takiego sparingu.' };
  if (f.played || f.date <= game.date) return { ok: false, error: 'Zasad tego sparingu nie da się już zmienić.' };
  const cur = friendlyRulesOf(f);
  const nr = normalizeFriendlyRules(opts, cur);
  if (!nr.ok) return nr;
  f.friendlyRules = { ...nr.rules, period: cur.period ?? friendlyPeriod(game, f.date)?.kind ?? null };
  return { ok: true, fixture: f };
}

/** Minimalny skład na sparing: 11 zawodników do gry, w tym bramkarz. */
export const FRIENDLY_MIN = 11;

/**
 * Za mało zawodników na sparing (powołania do reprezentacji, kontuzje, zawodnicy wstrzymani przez transfer albo
 * drugą drużynę). Zwraca null albo { n, gk } (liczba dostępnych, czy jest bramkarz).
 */
export function friendlyShortage(game, f) {
  if (!f || f.comp !== 'friendly' || f.played) return null;
  const squad = squadFor(game, game.clubId, 'friendly', f);
  const ok = squad.filter((p) => !(p.injuryDays > 0) && !p.callUp && !p.loanBlock && !p.transfer?.hold && !p.teamBlock);
  const gk = ok.some((p) => p.pos === 'BR');
  return ok.length >= FRIENDLY_MIN && gk ? null : { n: ok.length, gk };
}

/**
 * Dzień sparingu: gdy po powołaniach i kontuzjach nie ma 11 zawodników z bramkarzem, kluby odwołują mecz
 * (bez kar i bez wpływu na limit sparingów). Zwraca wiadomości dla gracza.
 */
export function cancelShortFriendlies(game, date) {
  const out = [];
  for (const f of (game.fixtures || []).filter((x) => x.comp === 'friendly' && x.date === date && !x.played && (x.home === game.clubId || x.away === game.clubId))) {
    const short = friendlyShortage(game, f);
    if (!short) continue;
    game.fixtures.splice(game.fixtures.indexOf(f), 1);
    const oppId = f.home === game.clubId ? f.away : f.home;
    const opp = clubById(oppId)?.name ?? f.label?.replace(/^Sparing: /, '') ?? 'rywalem';
    out.push(createMessage({
      date, key: `sparing-odwolany:${f.id}`, category: 'club', from: 'Kierownik drużyny', priority: 'important',
      subject: `Sparing odwołany: ${opp}`,
      body: `Sparing z ${opp} został odwołany. Do dyspozycji jest tylko ${short.n} zawodników${short.gk ? '' : ', bez bramkarza'} (powołania do reprezentacji i kontuzje), a do gry potrzeba 11 z bramkarzem. Kluby odwołały mecz bez kar, termin nie liczy się do limitu sparingów.`,
    }));
  }
  return out;
}

registerDailySystem({
  id: 'friendlyShortage', order: 6, // po powołaniach (national, order 3) i rezerwach (order 4)
  run(game, date) { return { messages: cancelShortFriendlies(game, date) }; },
});

/** Odwołanie zaplanowanego sparingu (do rozpoczęcia meczu, także w dniu meczu). */
export function cancelFriendly(game, id) {
  const i = (game.fixtures || []).findIndex((f) => f.id === id && f.comp === 'friendly');
  if (i < 0) return { ok: false, error: 'Nie ma takiego sparingu.' };
  const f = game.fixtures[i];
  if (f.played || f.date < game.date) return { ok: false, error: 'Tego sparingu nie da się już odwołać.' };
  game.fixtures.splice(i, 1);
  return { ok: true };
}
