// Historia meczów drużyny gracza (podział na sezony) i statystyki zawodników w podziale na rozgrywki
// oraz historia klubowa (docs/historia-i-statystyki.md). Moduł bez zależności od reszty gry poza kalendarzem,
// więc korzystają z niego season.js, national.js, rollover.js i transfers.js bez cykli importu.
//
// Zapis (krótkie klucze, mały rozmiar zapisu):
//   game.history = { m: { '2026/27': [wiersz meczu, ...] } }
//     wiersz: { id, d: data, t?: godzina, c: comp, r?: runda, lb?: etykieta (UEFA, sparingi), h, a, s: [gole], so?: [karne],
//               et?: 1 (dogrywka), n?: 1 (teren neutralny), me: klub gracza w tym meczu }
//   p.st = { L|P|E|R|T: [mecze, minuty, gole, asysty, suma ocen x10, liczba ocen, żółte, czerwone] }  (bieżący sezon)
//   p.history[] = { s, c, l?, apps, g, a, r, x: { grupa: ta sama tablica bez końcowych zer } }       (sezony minione)
//   p.cl = [{ c: klub, f: od (null = przed startem gry), t?: do, l?: 1 (wypożyczenie), m: mecze, g: gole }]

import { SEASON } from '../config/calendar2026.js';

/** Grupy rozgrywek w statystykach zawodnika (kolejność wierszy w tabeli). */
export const STAT_GROUPS = [
  ['L', 'Liga'],
  ['P', 'Puchar Polski'],
  ['E', 'Puchary europejskie'],
  ['R', 'Reprezentacja'],
  ['T', 'Towarzyskie'],
];
/** Grupy liczone jako mecze klubowe o punkty (historia klubowa, „oficjalne”). */
export const CLUB_GROUPS = ['L', 'P', 'E'];

/** Grupa statystyk dla comp terminarza: liga z barażami, Puchar Polski z Superpucharem, UEFA, sparingi. */
export function statGroup(comp) {
  if (!comp) return null;
  if (comp === 'ekstraklasa' || comp === 'liga1' || comp === 'liga2' || comp.startsWith('liga3-') || comp.startsWith('playoff')) return 'L';
  if (comp === 'pp' || comp === 'super') return 'P';
  if (comp === 'uefa') return 'E';
  if (comp === 'friendly') return 'T';
  if (comp === 'NT') return 'R';
  return null;
}

const blank = () => [0, 0, 0, 0, 0, 0, 0, 0];
const trimZeros = (a) => { const out = [...a]; while (out.length && !out[out.length - 1]) out.pop(); return out; };
const pad = (a) => { const out = blank(); (a ?? []).forEach((v, i) => { out[i] = v ?? 0; }); return out; };

/**
 * Dopisuje występ zawodnika w grupie rozgrywek. x: { minutes, g, a, yc, rc, rating } (format wyników z season.js).
 * rating null = mecz bez oceny (np. kadra spoza Europy), liczy się występ i minuty.
 */
export function addPlayerMatch(p, group, x) {
  if (!p || !group) return;
  const st = (p.st ??= {});
  const s = (st[group] ??= blank());
  s[0]++;
  s[1] += x.minutes ?? 0;
  s[2] += x.g ?? 0;
  s[3] += x.a ?? 0;
  if (x.rating != null) { s[4] += Math.round(x.rating * 10); s[5]++; }
  s[6] += x.yc && !x.rc ? 1 : 0;
  s[7] += x.rc ? 1 : 0;
}

/** Statystyki grupy w czytelnej postaci. a: tablica z p.st albo z wiersza historii. */
export function statObj(a) {
  const s = pad(a);
  return { apps: s[0], min: s[1], g: s[2], a: s[3], avg: s[5] ? s[4] / 10 / s[5] : null, rSum: s[4] / 10, rN: s[5], yc: s[6], rc: s[7] };
}

/** Suma kilku tablic statystyk (sezon + kariera, wszystkie grupy). */
export function sumStats(list) {
  const out = blank();
  for (const a of list) pad(a).forEach((v, i) => { out[i] += v; });
  return out;
}

/** Czy zawodnik ma jakiekolwiek statystyki w grupach bieżącego sezonu. */
export const hasStats = (st) => !!st && Object.values(st).some((a) => a?.[0] > 0);

// ------------------------------------------------------------ Historia klubowa
/** Okresy w klubach (leniwie: pierwszy okres to obecny klub, „przed startem gry”; stare transfery z p.career). */
export function spellsOf(p) {
  if (p.cl) return p.cl;
  const cl = [];
  const moves = (p.career ?? []).filter((m) => m && m.date);
  if (moves.length) {
    if (moves[0].from) cl.push({ c: moves[0].from, f: null, t: moves[0].date, m: 0, g: 0 });
    moves.forEach((mv, i) => {
      if (!mv.to) return;
      const s = { c: mv.to, f: mv.date, m: 0, g: 0 };
      if (mv.kind === 'loan') s.l = 1;
      const next = moves[i + 1];
      if (next) s.t = next.date;
      cl.push(s);
    });
  }
  const last = cl[cl.length - 1];
  if (p.clubId && !(last && !last.t && last.c === p.clubId)) {
    if (last && !last.t) last.t = '?'; // ruch spoza p.career (np. powrót z wypożyczenia w starym zapisie): koniec nieznany
    const s = { c: p.clubId, f: null, m: 0, g: 0 };
    if (p.loan) s.l = 1;
    cl.push(s);
  }
  p.cl = cl;
  return cl;
}

/**
 * Uzgadnia historię klubową z obecnym klubem zawodnika: zamyka otwarty okres i otwiera nowy, gdy klub
 * albo status wypożyczenia się zmienił. Wywoływane po każdym ruchu (transfer, wypożyczenie, rozwiązanie,
 * koniec sezonu). Zwraca otwarty okres albo null (wolny zawodnik).
 */
export function syncSpell(p, date) {
  const cl = spellsOf(p);
  const cur = cl[cl.length - 1];
  const open = cur && !cur.t ? cur : null;
  const loan = !!p.loan;
  if (open && open.c === p.clubId && !!open.l === loan) return open;
  if (open) open.t = date;
  if (!p.clubId) return null;
  const s = { c: p.clubId, f: date, m: 0, g: 0 };
  if (loan) s.l = 1;
  cl.push(s);
  if (cl.length > 24) cl.splice(0, cl.length - 24);
  return s;
}

// ------------------------------------------------------------ Historia meczów drużyny gracza
const seasonKey = (game) => game.season?.seasonId ?? SEASON;

/** Wiersz historii z meczu terminarza (z wynikiem). */
export function matchRow(f, me) {
  const r = f.result ?? {};
  const row = { id: f.id, d: f.date, c: f.comp, h: f.home, a: f.away, s: r.score ? [...r.score] : null, me };
  if (f.time) row.t = f.time;
  if (f.round != null) row.r = f.round;
  if (f.label) row.lb = f.label;
  if (r.shootout) row.so = [...r.shootout];
  if (r.extraTime) row.et = 1;
  if (r.forfeit) row.ff = 1;
  if (f.neutral) row.n = 1;
  if (f.ucomp) row.u = f.ucomp;
  return row;
}

/** Magazyn historii (leniwie; stare zapisy: bieżący sezon uzupełniony z terminarza). */
export function ensureHistory(game) {
  if (!game) return null;
  const H = (game.history ??= { m: {} });
  H.m ??= {};
  if (game.fixtures && game.clubId) backfillSeason(game, seasonKey(game));
  return H;
}

/** Od kiedy trener prowadzi obecny klub (zmiana pracy w trakcie sezonu): wcześniejsze mecze klubu to nie jego mecze. */
export function joinedOn(game) {
  const h = (game.manager?.history ?? []).filter((x) => x.club === game.clubId && !x.to).pop();
  return h?.from ?? '';
}

function backfillSeason(game, key) {
  const H = game.history;
  const list = (H.m[key] ??= []);
  const have = new Set(list.map((x) => x.id));
  const since = joinedOn(game);
  let added = false;
  for (const f of game.fixtures) {
    if (!f.played || !f.result?.score || have.has(f.id) || f.date < since) continue;
    if (f.home !== game.clubId && f.away !== game.clubId) continue;
    list.push(matchRow(f, game.clubId)); added = true;
  }
  if (added) list.sort((x, y) => (x.d + (x.t ?? '')).localeCompare(y.d + (y.t ?? '')));
}

/** Zapis meczu drużyny gracza (wywoływane z applyResult). */
export function recordTeamMatch(game, f) {
  if (!game?.clubId || (f.home !== game.clubId && f.away !== game.clubId)) return;
  const H = (game.history ??= { m: {} });
  H.m ??= {};
  const list = (H.m[seasonKey(game)] ??= []);
  const row = matchRow(f, game.clubId);
  const i = list.findIndex((x) => x.id === f.id);
  if (i >= 0) list[i] = row; else list.push(row);
}

/** Koniec sezonu: brakujące mecze sezonu do magazynu (przed podmianą terminarza). Trzyma 30 sezonów. */
export function archiveSeasonMatches(game, key = seasonKey(game)) {
  if (!game.history) game.history = { m: {} };
  game.history.m ??= {};
  if (game.fixtures && game.clubId) backfillSeason(game, key);
  const keys = Object.keys(game.history.m).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete game.history.m[k];
}

/** Sezony z historią, od najnowszego (bieżący zawsze pierwszy). */
export function historySeasons(game) {
  const cur = seasonKey(game);
  const keys = Object.keys(game.history?.m ?? {}).filter((k) => k !== cur && game.history.m[k]?.length).sort().reverse();
  return [cur, ...keys];
}

/**
 * Mecze drużyny gracza w sezonie: rozegrane z magazynu, a w bieżącym sezonie także zaplanowane
 * (z terminarza, dla obecnego klubu). Każdy wiersz ma pola widoku: home (czy u siebie), venue H/A/N, opp,
 * gf, ga, res W/R/P albo null (mecz przed nami), played.
 */
export function teamFixtures(game, key = seasonKey(game)) {
  const cur = key === seasonKey(game);
  const rows = [...(game.history?.m?.[key] ?? [])];
  if (cur && game.fixtures) {
    const have = new Set(rows.map((x) => x.id));
    const since = joinedOn(game);
    for (const f of game.fixtures) {
      if (have.has(f.id) || (f.home !== game.clubId && f.away !== game.clubId) || (f.played && f.date < since)) continue;
      rows.push(f.played && f.result?.score ? matchRow(f, game.clubId) : { ...matchRow(f, game.clubId), s: null, plan: 1, post: f.postponed ? 1 : 0 });
    }
  }
  return rows.map(viewRow).sort((x, y) => (x.d + (x.t ?? '')).localeCompare(y.d + (y.t ?? '')));
}

/** Mecze dowolnego klubu w bieżącym sezonie (z terminarza gry), w tym samym kształcie co teamFixtures. */
export function clubFixtures(game, clubId) {
  return (game.fixtures ?? []).filter((f) => f.home === clubId || f.away === clubId)
    .map((f) => viewRow(f.played && f.result?.score ? matchRow(f, clubId) : { ...matchRow(f, clubId), s: null, plan: 1, post: f.postponed ? 1 : 0 }))
    .sort((x, y) => (x.d + (x.t ?? '')).localeCompare(y.d + (y.t ?? '')));
}

export function venueOf(row) {
  if (row.n) return 'N';
  return row.h === row.me ? 'H' : 'A';
}

function viewRow(row) {
  const home = row.h === row.me;
  const venue = venueOf(row);
  const opp = home ? row.a : row.h;
  const played = !!row.s;
  const gf = played ? row.s[home ? 0 : 1] : null;
  const ga = played ? row.s[home ? 1 : 0] : null;
  let res = null; let decider = null;
  if (played) {
    res = gf > ga ? 'W' : gf < ga ? 'P' : 'R';
    if (row.so) {
      const won = row.so[home ? 0 : 1] > row.so[home ? 1 : 0];
      decider = { kind: 'so', won, text: `karne ${row.so[home ? 0 : 1]}:${row.so[home ? 1 : 0]}` };
    } else if (row.et) decider = { kind: 'et', won: gf > ga, text: 'po dogrywce' };
  }
  return { ...row, home, venue, opp, played, gf, ga, res, decider };
}

/** Bilans listy meczów (rozegranych). */
export function recordOf(rows) {
  const out = { n: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  for (const r of rows) {
    if (!r.played) continue;
    out.n++; out.gf += r.gf; out.ga += r.ga;
    if (r.res === 'W') out.w++; else if (r.res === 'P') out.l++; else out.d++;
  }
  return out;
}

// ------------------------------------------------------------ Koniec sezonu: zawodnicy
/**
 * Statystyki sezonu do p.history (przed powrotami z wypożyczeń, więc klub to klub, w którym zawodnik kończył
 * sezon). Wiersz ma dawne pola (apps, g, a, r: mecze o punkty) i podział na grupy (x).
 */
export function archivePlayerSeason(p, season) {
  const st = p.st;
  if (!p.season?.apps && !hasStats(st)) { delete p.st; return; }
  const row = { s: season, c: p.clubId, apps: p.season?.apps ?? 0, g: p.season?.g ?? 0, a: p.season?.a ?? 0, r: p.season?.rating ?? 0 };
  if (p.loan) row.l = 1;
  if (hasStats(st)) row.x = Object.fromEntries(Object.entries(st).filter(([, a]) => a?.[0] > 0).map(([k, a]) => [k, trimZeros(a)]));
  p.history = [...(p.history ?? []), row].slice(-20);
  delete p.st;
}

/** Ocena meczu w modelu meczów w tle (dla reprezentacji, gdzie nie ma pełnej symulacji). */
export function quickRating({ g = 0, a = 0, win = 0 }, gauss) {
  const v = 6.4 + 0.9 * g + 0.5 * a + 0.2 * win + gauss;
  return Math.round(Math.min(9.5, Math.max(4, v)) * 10) / 10;
}
