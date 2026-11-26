// IV liga (docs/iv-liga.md, etap 1): 16 grup wojewódzkich bez kadr, tylko w karierach rozpoczętych z IV ligą
// (stare zapisy bez zmian, decyzja właściciela D1). Kompaktowy stan w game.season.l4 (poza game.fixtures):
//   { v: 1, year, dates: { liczba kolejek: [kotwice] }, groups: [{ voiv, ids, fx, res }], po: { 1..4: baraże }, done }
// fx: pary meczów (2 znaki base36 na mecz: indeks gospodarza i gościa w ids), kolejka po kolejce; res: wyniki
// (2 znaki base36: gole gospodarza i gościa, „--” = mecz nierozegrany). Dzień i godzina meczu z haszu (bez zapisu).
// Wyniki: model Poissona z siły L klubu i formy sezonu (deterministyczne ziarna na mecz, niezależne od dnia liczenia).
// Tabela z res tą samą funkcją standings() co ligi z kadrami. Baraże: wicemistrzowie województw w makroregionie
// (grupa III ligi), półfinał u pierwszej wylosowanej drużyny, finał u lepszej średniej punktów, dogrywka i karne.

import { Rng, clamp, hashString } from '../core/rng.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { DOMESTIC, SEASON, SEASON_YEAR } from '../config/calendar2026.js';
import { VOIVODESHIPS, VOIV } from '../data/voivodeships.js';
import { roundRobin, roundDates } from './schedule.js';
import { standings } from './standings.js';
import { fourthLeagueMembers, knownClub, reserveMayPlayIn } from './leagues.js';
import { thirdLeagueDates, anyClub } from './season.js';
import { fmtDate } from '../ui/dom.js';

/** Model meczu [SZAC, kalibracja docs/iv-liga.md]: gole ~ Poisson(home|away x e^(+-K x d / 2)), d = różnica siły z formą. */
export const L4 = { K: 1.2, home: 1.7, away: 1.3, formSd: 0.25, etShare: 1 / 3, penBase: 0.5, penPerL: 0.04, saturday: 0.55 };
const TIMES = ['11:00', '12:00', '13:00', '14:00', '15:00', '15:00', '16:00', '16:00', '17:00'];
const b36 = (n) => n.toString(36);
const L3_ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

// ------------------------------------------------------------ Terminarz
/**
 * Kotwice kolejek (piątek, środa) dla grupy z R kolejkami: terminy III ligi; grupa z mniejszą liczbą kolejek opuszcza
 * najpierw środy, potem na przemian najwcześniejszy weekend jesieni i wiosny (późniejszy start, wspólny koniec, D2).
 */
export function l4Dates(R) {
  const grid = thirdLeagueDates();
  if (R > grid.length) {
    const cfg = DOMESTIC.liga3;
    const cupWeeks = DOMESTIC.pucharPolski.rounds.map((r) => ({ from: r.window?.[0] ?? r.date, to: r.window?.[1] ?? r.date }));
    return roundDates({ start: cfg.start, autumnEnd: cfg.autumnEnd, springStart: cfg.springStart, end: cfg.end, rounds: R, skip: cupWeeks });
  }
  const aEnd = DOMESTIC.liga3.autumnEnd;
  const friday = (d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 5;
  let d = grid.slice(); let drop = d.length - R;
  for (const x of grid.filter((y) => !friday(y))) if (drop > 0) { d = d.filter((y) => y !== x); drop--; }
  for (let turn = 0; drop > 0; turn++) {
    const autumn = turn % 2 === 0;
    const c = d.find((x) => (autumn ? x <= aEnd : x > aEnd)) ?? d[0];
    d = d.filter((y) => y !== c); drop--;
  }
  return d;
}

/** Pary kolejek dla listy klubów (nieparzysta liczba: pauza, kolejek 2n). */
function rounds(ids, rng) {
  if (ids.length % 2 === 0) return roundRobin(ids, rng);
  const BYE = '\u0000pauza';
  return roundRobin([...ids, BYE], rng).map((r) => r.filter(([h, a]) => h !== BYE && a !== BYE));
}

/** Terminarz IV ligi na sezon (kluby poziomu 5 po applyLeagueState). seed: ziarno gry, year: rok startu sezonu. */
export function buildFourthLeague(seed, year = SEASON_YEAR) {
  const rng = new Rng(`iv-liga:${seed}:${year}`);
  const members = fourthLeagueMembers();
  const groups = []; const dates = {};
  for (const v of VOIVODESHIPS) {
    const list = members[v.key] ?? [];
    if (list.length < 2) { groups.push({ voiv: v.key, ids: list, fx: '', res: '' }); continue; }
    const rr = rounds(list, rng.fork(v.key));
    const ids = list;
    const at = new Map(ids.map((id, i) => [id, i]));
    const fx = rr.map((r) => r.map(([h, a]) => b36(at.get(h)) + b36(at.get(a)))).flat().join('');
    if (!dates[rr.length]) dates[rr.length] = l4Dates(rr.length);
    groups.push({ voiv: v.key, ids, fx, res: '-'.repeat(fx.length) });
  }
  return { v: 1, year, dates, groups, po: null, done: false };
}

/** Liczba meczów w kolejce (stała w grupie) i liczba kolejek. */
const perRound = (G) => Math.floor(G.ids.length / 2);
const roundsOf = (G) => (perRound(G) ? G.fx.length / 2 / perRound(G) : 0);
const pairAt = (G, k) => [G.ids[parseInt(G.fx[2 * k], 36)], G.ids[parseInt(G.fx[2 * k + 1], 36)]];
const scoreAt = (G, k) => (G.res[2 * k] === '-' ? null : [parseInt(G.res[2 * k], 36), parseInt(G.res[2 * k + 1], 36)]);

/** Dzień i godzina meczu k (kolejka r): sobota albo niedziela z haszu, środa 17:00, ostatnia kolejka w niedzielę o 15:00. */
const SLOT = new WeakMap(); // terminy meczów grupy liczone raz (obiekt grupy -> tablica { date, time })
export function l4MatchSlot(L, G, r, i) {
  let cache = SLOT.get(G);
  if (!cache) { cache = []; SLOT.set(G, cache); }
  return (cache[r * perRound(G) + i] ??= slotOf(L, G, r, i));
}
function slotOf(L, G, r, i) {
  const R = roundsOf(G);
  const anchor = L.dates[R][r];
  if (new Date(`${anchor}T12:00:00Z`).getUTCDay() !== 5) return { date: anchor, time: '17:00' };
  if (r === R - 1) return { date: addDays(anchor, 2), time: '15:00' };
  const h = hashString(`${G.voiv}:${r}:${i}`);
  return { date: addDays(anchor, (h % 100) / 100 < L4.saturday ? 1 : 2), time: TIMES[(h >>> 8) % TIMES.length] };
}

// ------------------------------------------------------------ Mecze
const FORM = new Map();
/** Forma klubu w sezonie (raz na sezon, z ziarna gry). */
function formOf(seed, year, id) {
  const k = `${seed}:${year}:${id}`;
  if (!FORM.has(k)) { if (FORM.size > 3000) FORM.clear(); FORM.set(k, new Rng(`iv-forma:${k}`).gauss(0, L4.formSd)); }
  return FORM.get(k);
}
const strength = (seed, year, id) => (knownClub(id)?.L ?? anyClub(id)?.L ?? 6.5) + formOf(seed, year, id);

/** Wynik meczu (ko: dogrywka i karne przy remisie). */
export function simulateL4(rng, sh, sa, ko = false) {
  const d = sh - sa;
  const lh = L4.home * Math.exp(L4.K * d / 2); const la = L4.away * Math.exp(-L4.K * d / 2);
  const s = [Math.min(35, rng.poisson(lh)), Math.min(35, rng.poisson(la))];
  if (!ko || s[0] !== s[1]) return { s };
  s[0] += rng.poisson(lh * L4.etShare); s[1] += rng.poisson(la * L4.etShare);
  if (s[0] !== s[1]) return { s, et: true };
  const pHome = clamp(L4.penBase + L4.penPerL * d, 0.3, 0.7);
  let ph = 0; let pa = 0;
  for (let i = 0; i < 5; i++) { if (rng.chance(0.75)) ph++; if (rng.chance(0.75)) pa++; }
  while (ph === pa) { if (rng.chance(pHome)) ph++; else pa++; }
  return { s, et: true, pen: [ph, pa] };
}

function playMatch(seed, L, G, k, r, i) {
  const [h, a] = pairAt(G, k);
  const rng = new Rng(`iv-wynik:${seed}:${L.year}:${G.voiv}:${r}:${i}`);
  const { s } = simulateL4(rng, strength(seed, L.year, h), strength(seed, L.year, a));
  G.res = G.res.slice(0, 2 * k) + b36(s[0]) + b36(s[1]) + G.res.slice(2 * k + 2);
}

const PTR = new WeakMap();
/** Pierwsza nierozegrana kolejka każdej grupy (liczona raz z res, potem trzymana w pamięci). */
function pointers(L) {
  let p = PTR.get(L);
  if (!p) {
    p = L.groups.map((G) => {
      const m = perRound(G);
      if (!m) return 0;
      const first = G.res.indexOf('-');
      return first < 0 ? roundsOf(G) : Math.floor(first / 2 / m);
    });
    PTR.set(L, p);
  }
  return p;
}

/** Rozgrywa wszystkie mecze z dniem nie późniejszym niż date. Zwraca liczbę rozegranych meczów. */
export function playFourthLeagueUntil(game, date) {
  const L = game.season?.l4;
  if (!L) return 0;
  const p = pointers(L);
  let n = 0;
  L.groups.forEach((G, gi) => {
    const m = perRound(G); const R = roundsOf(G);
    while (p[gi] < R) {
      const r = p[gi];
      if (L.dates[R][r] > date) break;
      let all = true;
      for (let i = 0; i < m; i++) {
        const k = r * m + i;
        if (G.res[2 * k] !== '-') continue;
        if (l4MatchSlot(L, G, r, i).date <= date) { playMatch(game.seed, L, G, k, r, i); n++; } else all = false;
      }
      if (!all) break;
      p[gi]++;
    }
  });
  return n;
}

// ------------------------------------------------------------ Tabele i widoki
/** Mecze grupy jako lekkie obiekty (do standings i widoków): { home, away, date, time, round, played, result }. */
export function l4GroupFixtures(L, gi) {
  const G = L.groups[gi]; const m = perRound(G); const R = roundsOf(G);
  const out = [];
  for (let r = 0; r < R; r++) {
    for (let i = 0; i < m; i++) {
      const k = r * m + i;
      const [home, away] = pairAt(G, k);
      const sc = scoreAt(G, k);
      const { date, time } = l4MatchSlot(L, G, r, i);
      out.push({ id: `l4-${G.voiv}-${r + 1}-${i + 1}`, comp: `liga4-${G.voiv}`, round: r + 1, date, time, home, away, played: !!sc, ...(sc ? { result: { score: sc } } : {}) });
    }
  }
  return out;
}
export const l4GroupIndex = (L, voiv) => L.groups.findIndex((G) => G.voiv === voiv);
/** Tabela grupy (standings, kryteria jak w III lidze). */
export function l4Rows(L, voiv) {
  const gi = l4GroupIndex(L, voiv);
  if (gi < 0) return [];
  const G = L.groups[gi];
  return standings(l4GroupFixtures(L, gi).filter((f) => f.played), G.ids);
}
/** Czy klub może awansować do III ligi (rezerwy tylko, gdy pierwsza drużyna gra wyżej niż III liga). */
export function l4Eligible(id) {
  const c = knownClub(id) ?? anyClub(id);
  const p = c?.parent;
  return !p || reserveMayPlayIn(4, (knownClub(p) ?? anyClub(p))?.tier ?? 1);
}
const groupDone = (L, gi) => !L.groups[gi].res.includes('-');
export const fourthLeagueFinished = (L) => L.groups.every((G, gi) => groupDone(L, gi));
const lastDate = (L) => L.groups.map((G, gi) => { const R = roundsOf(G); return R ? l4MatchSlot(L, G, R - 1, 0).date : ''; }).sort().pop();

// ------------------------------------------------------------ Baraże
const nm = (id) => (knownClub(id) ?? anyClub(id))?.name ?? id;
const ppg = (L, id) => { for (const v of VOIVODESHIPS) { const r = l4Rows(L, v.key).find((x) => x.id === id); if (r) return r.played ? r.points / r.played : 0; } return 0; };

function drawPlayoffs(game, L, date) {
  const last = lastDate(L);
  const sd = DOMESTIC.liga4.playoffSemis > addDays(last, 2) ? DOMESTIC.liga4.playoffSemis : addDays(last, 3);
  const fd = DOMESTIC.liga4.playoffFinal > addDays(sd, 2) ? DOMESTIC.liga4.playoffFinal : addDays(sd, 3);
  L.po = { sd, fd };
  const champs = {};
  for (const g of [1, 2, 3, 4]) {
    const runners = [];
    for (const v of VOIVODESHIPS.filter((x) => x.l3group === g)) {
      const ok = l4Rows(L, v.key).map((r) => r.id).filter(l4Eligible);
      if (ok[0]) champs[v.key] = ok[0];
      if (ok[1]) runners.push(ok[1]);
    }
    const d = new Rng(`iv-baraz:${game.seed}:${L.year}:${g}`).shuffle(runners);
    const sf = [];
    for (let i = 0; i + 1 < d.length; i += 2) sf.push({ h: d[i], a: d[i + 1] });
    L.po[g] = { runners, sf, bye: d.length % 2 ? d[d.length - 1] : null, f: null, w: null, ru: null };
  }
  const mine = game.clubId ? knownClub(game.clubId) ?? anyClub(game.clubId) : null;
  const important = !!mine && (mine.tier === 4 || mine.tier === 5);
  const lines = VOIVODESHIPS.map((v) => {
    const row = l4Rows(L, v.key)[0];
    const c = champs[v.key];
    return `${v.name}: ${c ? nm(c) : 'brak uprawnionego mistrza'}${row && c === row.id ? ` (${row.points} pkt)` : ''}`;
  });
  const po = [1, 2, 3, 4].map((g) => `Grupa ${L3_ROMAN[g]} III ligi: ${L.po[g].sf.map((x) => `${nm(x.h)} - ${nm(x.a)}`).join(', ') || 'brak par'}${L.po[g].bye ? `, ${nm(L.po[g].bye)} od razu w finale` : ''}.`);
  return createMessage({
    date, key: `iv-liga:koniec:${SEASON}`, category: 'competitions', from: 'IV liga', priority: important ? 'important' : 'info',
    subject: 'IV liga: mistrzowie województw i baraże',
    body: `Mistrzowie województw (awans do III ligi):\n${lines.join('\n')}\n\nBaraże wicemistrzów województw (półfinały ${fmtDate(sd)}, finały ${fmtDate(fd)}):\n${po.join('\n')}\n\nZwycięzca baraży awansuje, jeśli w grupie III ligi zostanie wolne miejsce (rozstrzygnięcie 1 lipca).`,
  });
}

function playPlayoffs(game, L, date) {
  const out = [];
  const tie = (g, h, a, tag) => {
    const rng = new Rng(`iv-baraz-mecz:${game.seed}:${L.year}:${g}:${tag}`);
    const r = simulateL4(rng, strength(game.seed, L.year, h), strength(game.seed, L.year, a), true);
    const [x, y] = r.s;
    const w = x > y ? h : y > x ? a : r.pen[0] > r.pen[1] ? h : a;
    return { h, a, s: r.s, ...(r.et ? { et: true } : {}), ...(r.pen ? { pen: r.pen } : {}), w };
  };
  for (const g of [1, 2, 3, 4]) {
    const P = L.po[g];
    if (date >= L.po.sd) P.sf = P.sf.map((m, i) => (m.w ? m : tie(g, m.h, m.a, `sf${i}`)));
    if (date >= L.po.fd && !P.f) {
      const fin = [...P.sf.map((m) => m.w), ...(P.bye ? [P.bye] : [])].filter(Boolean);
      if (fin.length === 1) { P.w = fin[0]; P.f = { h: fin[0], a: null, w: fin[0] }; continue; }
      if (fin.length < 2) { P.f = { h: null, a: null, w: null }; continue; }
      const [h, a] = ppg(L, fin[1]) > ppg(L, fin[0]) ? [fin[1], fin[0]] : fin;
      P.f = tie(g, h, a, 'f'); P.w = P.f.w; P.ru = P.f.w === h ? a : h;
    }
  }
  if (date >= L.po.fd && [1, 2, 3, 4].every((g) => L.po[g].f)) {
    L.done = true;
    const mine = game.clubId ? knownClub(game.clubId) ?? anyClub(game.clubId) : null;
    const important = !!mine && (mine.tier === 4 || mine.tier === 5);
    const res = (m) => `${nm(m.h)} - ${nm(m.a)} ${m.s[0]}:${m.s[1]}${m.pen ? ` (karne ${m.pen[0]}:${m.pen[1]})` : m.et ? ' (po dogrywce)' : ''}`;
    out.push(createMessage({
      date, key: `iv-liga:baraze:${SEASON}`, category: 'competitions', from: 'IV liga', priority: important ? 'important' : 'info',
      subject: 'IV liga: wyniki baraży o III ligę',
      body: `${[1, 2, 3, 4].map((g) => { const P = L.po[g]; return `Grupa ${L3_ROMAN[g]} III ligi: ${P.f?.a ? res(P.f) : 'bez finału'}${P.w ? `, wygrywa ${nm(P.w)}` : ''}.`; }).join('\n')}\n\nZwycięzcy awansują, jeśli w grupie III ligi będzie wolne miejsce (1 lipca, po barażach o 2 Ligę i spadkach z 2 Ligi).`,
    }));
  }
  return out;
}

/** Dzień IV ligi: mecze do dnia date, po ostatniej kolejce losowanie baraży, potem baraże. Zwraca wiadomości. */
export function fourthLeagueDay(game, date) {
  const L = game.season?.l4;
  if (!L || L.done) return [];
  playFourthLeagueUntil(game, date);
  const messages = [];
  if (!L.po) {
    if (!fourthLeagueFinished(L) || date <= lastDate(L)) return [];
    messages.push(drawPlayoffs(game, L, date));
  }
  messages.push(...playPlayoffs(game, L, date));
  return messages;
}
registerDailySystem({ id: 'fourthLeague', order: 7, run: (game, date) => (game.season?.l4 ? { messages: fourthLeagueDay(game, date) } : {}) });

// ------------------------------------------------------------ Koniec sezonu
/** Wyniki IV ligi do ruchów między ligami: { tables: { voiv: [id...] }, playoff: { 1..4: { w, ru } }, seed } albo null. */
export function fourthLeagueResults(game) {
  const L = game.season?.l4;
  if (!L) return null;
  const tables = Object.fromEntries(L.groups.map((G) => [G.voiv, l4Rows(L, G.voiv).map((r) => r.id)]));
  const playoff = {};
  for (const g of [1, 2, 3, 4]) if (L.po?.[g]?.w) playoff[g] = { w: L.po[g].w, ru: L.po[g].ru ?? null };
  return { tables, playoff, seed: game.seed };
}

/** Wpis archiwum sezonu (decyzja D10: mistrzowie i ruchy, bez tabel). */
export function fourthLeagueArchive(res, moves) {
  if (!res || !moves?.l4Down) return null;
  const champ = {};
  for (const [voiv, ids] of Object.entries(res.tables)) { const c = ids.find(l4Eligible); if (c) champ[voiv] = c; }
  return {
    champ, po: Object.fromEntries(Object.entries(res.playoff).map(([g, x]) => [g, x.w])),
    up: [...moves.l4Up, ...moves.l4Playoff.filter((x) => x.up).map((x) => x.id)],
    d6: Object.values(moves.l4Down).flat(), u6: Object.values(moves.l4In).flat(),
  };
}

/** Linie wiadomości końca sezonu o IV lidze. */
export function fourthLeagueSeasonLines(moves) {
  if (!moves?.l4Down) return [];
  const list = (ids) => ids.map(nm).join(', ') || 'brak';
  const po = moves.l4Playoff.map((x) => `${nm(x.id)} (${x.up ? 'awans' : 'bez awansu, brak wolnego miejsca'})`);
  const reprieve = moves.notes.filter((n) => n.kind === 'reprieve' && n.tier === 4).map((n) => nm(n.id));
  const short = Object.entries(moves.l4Short ?? {}).map(([v, n]) => `${VOIV[v]?.name ?? v}: ${n} drużyn`);
  return [
    `Awans do III ligi z IV ligi (mistrzowie województw): ${list(moves.l4Up)}.`,
    ...(po.length ? [`Zwycięzcy baraży IV ligi: ${po.join(', ')}.`] : []),
    ...(reprieve.length ? [`Utrzymanie w III lidze (wolne miejsce): ${list(reprieve)}.`] : []),
    `Spadek z IV ligi: ${list(Object.values(moves.l4Down).flat())}. Awans do IV ligi: ${list(Object.values(moves.l4In).flat())}.`,
    ...(short.length ? [`Uwaga techniczna: za mało drużyn w puli awansu, mniejsza grupa IV ligi (${short.join(', ')}).`] : []),
  ];
}
