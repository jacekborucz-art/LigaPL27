// Sędziowie (docs/sedziowie.md): pula fikcyjnych polskich sędziów w zapisie gry (game.refs), cztery listy
// (Ekstraklasa, 1 Liga, 2 Liga, III liga), obsada każdego polskiego meczu (liga, baraże, Puchar Polski,
// Superpuchar), surowość dla silnika (średnia każdej listy dokładnie 1,0) i ukryta nota obserwatora po meczu.
// Te same zasady dla meczów gracza i meczów w tle. Wszystkie liczby [SZAC], skala not jak u obserwatorów PZPN.
// Później: ranking sezonu, awanse i spadki list, przecieki prasy, błędy sędziów zmieniające wynik.

import { Rng, clamp } from '../core/rng.js';
import { clubById } from '../data/clubs_pl.js';
import { CLUBS_L4 } from '../data/clubs_l4.js';
import { REGION_WOJ } from '../data/voivodeships.js';
import { NATIONALITIES, randomName } from '../data/names.js';
import { SEASON, SEASON_YEAR } from '../config/calendar2026.js';
import { standings } from '../season/standings.js';
import { isL3Comp, compClubIds } from '../season/leagueComps.js';

/** Liczby sędziów [SZAC]. Raport panelu: liczebność list, jakość, noty (docs/sedziowie.md). */
export const REF_CFG = {
  sizes: [20, 22, 22, 72], // listy 1-4: Ekstraklasa, 1 Liga, 2 Liga, III liga
  attrMean: [14, 12.5, 11, 9.5], // średni atrybut listy (wymaganie listy przy notach)
  talentSd: 1.0, attrSd: 1.4, // talent sędziego (wspólny dla atrybutów) i rozrzut pojedynczego atrybutu
  age: [[31, 48], [28, 47], [25, 44], [23, 41]], // wiek na start gry
  strictSd: 0.13, strictMin: 0.7, strictMax: 1.4, // surowość (styl): N(1; 0,13)
  recent: 4, // ten sam klub nie częściej niż raz na 4 mecze klubu
  gapDays: 2, // dwa mecze sędziego co najmniej 2 dni od siebie
  fair: 0.6, // waga równego obciążenia
  noise: 0.6, // los w obsadzie
  // Nota obserwatora: baza, trudność meczu wg rangi, poważne i drobne błędy, sufit noty wg trudności
  mark: { base: 8.4, perK: 0.05, serious: [0.065, 0.12, 0.18], minor: 0.5, sdBase: 0.1, sdCons: 0.012, cap: [8.6, 9.2, 9.6] },
};

/** Województwa (klucze jak `voiv` w src/data/clubs_l4.js) i nazwy do UI. */
export const WOJ = {
  dolnoslaska: 'dolnośląskie', 'kujawsko-pomorska': 'kujawsko-pomorskie', lubelska: 'lubelskie', lubuska: 'lubuskie',
  lodzka: 'łódzkie', malopolska: 'małopolskie', mazowiecka: 'mazowieckie', opolska: 'opolskie', podkarpacka: 'podkarpackie',
  podlaska: 'podlaskie', pomorska: 'pomorskie', slaska: 'śląskie', swietokrzyska: 'świętokrzyskie',
  'warminsko-mazurska': 'warmińsko-mazurskie', wielkopolska: 'wielkopolskie', zachodniopomorska: 'zachodniopomorskie',
};
const WOJ_KEYS = Object.keys(WOJ);

// Region klubu -> województwo: REGION_WOJ w src/data/voivodeships.js (wspólne z IV ligą)

/** Nazwiska prawdziwych sędziów: bez nich w puli (sędziowie są fikcyjni). */
export const REAL_REF_SURNAMES = new Set([
  'Marciniak', 'Frankowski', 'Stefański', 'Raczkowski', 'Musiał', 'Lasyk', 'Kwiatkowski', 'Przybył', 'Myć', 'Arys', 'Jarzębak',
  'Złotek', 'Szulc', 'Kochanek', 'Szczech', 'Malec', 'Jakubik', 'Kuźma', 'Kos', 'Sylwestrzak', 'Gryckiewicz', 'Wajda',
  'Dobrynin', 'Krztoń', 'Różycki', 'Obukowicz', 'Sulikowski', 'Pskit', 'Idzik', 'Kruczyński', 'Piszczelok', 'Gil', 'Kantor',
]);

const L4_INDEX = new Map(CLUBS_L4.map((c) => [c.id, c]));
const clubOf = (id) => clubById(id) ?? L4_INDEX.get(id) ?? null;
/** Województwo klubu albo null (klub spoza danych). */
export function clubWoj(id) {
  const c = clubOf(id);
  return c ? c.voiv ?? REGION_WOJ[c.region] ?? null : null;
}
const tierOf = (id) => clubOf(id)?.tier ?? 5;

/** Jakość sędziego (ukryta): ważona średnia atrybutów [dec, pos, fit, cons, pres, comm, var]. */
const Q_W = [0.30, 0.15, 0.10, 0.15, 0.15, 0.10, 0.05];
export const refQuality = (r) => r.a.reduce((s, v, i) => s + v * Q_W[i], 0);
export const REF_ATTRS = ['Trafność decyzji', 'Ustawianie się', 'Kondycja', 'Konsekwencja', 'Odporność na presję', 'Prowadzenie meczu', 'Współpraca z VAR'];

// ------------------------------------------------------------ Pula
function newReferee(id, list, rng, used) {
  let name;
  for (let i = 0; i < 200; i++) {
    const n = randomName('POL', rng);
    const full = `${n.first} ${n.last}`;
    if (REAL_REF_SURNAMES.has(n.last) || used.has(full)) continue;
    name = full; break;
  }
  used.add(name);
  const C = REF_CFG;
  const [a0, a1] = C.age[list - 1];
  const age = rng.int(a0, a1);
  const talent = rng.gauss(0, C.talentSd);
  const m = C.attrMean[list - 1];
  const attr = (shift = 0) => clamp(Math.round(m + talent + shift + rng.gauss(0, C.attrSd)), 1, 20);
  const a = [attr(), attr(), attr(age > 35 ? -0.15 * (age - 35) : 0), attr(), attr(), attr(), attr(list <= 2 ? 0.5 : -1)];
  const e = clamp(Math.round(4 + 0.45 * (age - 23) + 1.5 * (4 - list) + rng.gauss(0, 2)), 1, 20); // doświadczenie
  const s = Math.round(clamp(rng.gauss(1, C.strictSd), C.strictMin, C.strictMax) * 100) / 100;
  const car = Math.max(0, Math.round((age - 21) * [26, 22, 18, 15][list - 1] + rng.gauss(0, 25))); // mecze w karierze
  return { id, n: name, b: SEASON_YEAR - age, l: list, a, e, s, car };
}

/** Średnia surowość list (normalizacja: średnia surowość dla silnika = 1,0 na każdej liście). */
export function computeNorm(R) {
  const norm = [1, 1, 1, 1, 1];
  for (let l = 1; l <= 4; l++) {
    const xs = R.list.filter((r) => r.l === l).map((r) => r.s);
    if (xs.length) norm[l] = xs.reduce((x, y) => x + y, 0) / xs.length;
  }
  return norm;
}

/**
 * Pula sędziów w zapisie (nowa gra i stare zapisy). Deterministycznie z ziarna gry.
 * game.refs = { v, list: [{ id, n, w, b, l, a, e, s, car }], norm, nx, sid, st, mk, busy, rc, prev }
 *   st[id] = [przydzielone, ocenione, suma not x10, żółte, czerwone, poważne błędy] (bieżący sezon)
 *   mk[id] = ostatnie noty x10 (do 5), busy[id] = dni meczów (numer dnia), rc[klub] = ostatni sędziowie klubu
 */
export function ensureReferees(game) {
  let R = game.refs;
  if (!R?.list?.length) {
    const rng = new Rng(`sedziowie:${game.seed}`);
    const used = new Set();
    const list = [];
    REF_CFG.sizes.forEach((size, i) => {
      const l = i + 1;
      const woj = [];
      while (woj.length < size) woj.push(...rng.shuffle(WOJ_KEYS)); // równo z każdego województwa
      for (let k = 0; k < size; k++) {
        const r = newReferee(`r${list.length + 1}`, l, rng, used);
        r.w = woj[k];
        list.push(r);
      }
    });
    R = game.refs = { v: 1, list, nx: list.length + 1, sid: SEASON, st: {}, mk: {}, busy: {}, rc: {}, prev: null };
    R.norm = computeNorm(R);
  }
  if (R.sid !== SEASON) { // nowy sezon: statystyki sezonu do prev (ranking i awanse w kolejnym etapie)
    R.prev = { sid: R.sid, st: R.st };
    R.st = {}; R.sid = SEASON;
  }
  if (!R.norm) R.norm = computeNorm(R);
  return R;
}

const refIndex = new WeakMap();
/** Sędzia po id (null, gdy brak). */
export function refOf(game, id) {
  const R = game.refs;
  if (!R || !id) return null;
  let m = refIndex.get(R.list);
  if (!m || m.size !== R.list.length) { m = new Map(R.list.map((r) => [r.id, r])); refIndex.set(R.list, m); }
  return m.get(id) ?? null;
}

// ------------------------------------------------------------ Obsada
/** Lista sędziów do meczu (1-4) albo null (mecz bez polskiej obsady: UEFA, sparing, reprezentacja). */
export function refListFor(f) {
  const c = f?.comp;
  if (!c || !f.home || !f.away) return null;
  if (c === 'ekstraklasa' || c === 'super') return 1;
  if (c === 'liga1') return 2;
  if (c === 'liga2') return 3;
  if (isL3Comp(c)) return 4;
  if (c === 'playoff-liga1') return 2;
  if (c === 'playoff-liga2') return 3;
  if (c === 'playoff-liga3') return Math.min(4, tierOf(f.home), tierOf(f.away)) <= 3 ? 3 : 4;
  if (c === 'pp') return ['QF', 'SF', 'F'].includes(f.round) ? 1 : Math.min(4, tierOf(f.home), tierOf(f.away));
  return null;
}

/** Ranga meczu dla obsady i trudności (0-3): finał i Superpuchar, derby, czołówka tabeli, końcówka sezonu. */
export function refRank(f, table = null) {
  if (f.comp === 'super' || (f.comp === 'pp' && f.round === 'F')) return 3;
  let r = 0;
  if (f.comp === 'pp') r = f.round === 'SF' ? 2 : f.round === 'QF' || f.round === 'R16' ? 1 : 0;
  else if (String(f.comp).startsWith('playoff')) r = f.round === 'F' ? 2 : 1;
  const H = clubOf(f.home); const A = clubOf(f.away);
  if (H?.region && H.region === A?.region && H.parent !== A?.id && A?.parent !== H.id) r = Math.max(r, 2); // derby
  if (table) {
    const ih = table.findIndex((x) => x.id === f.home); const ia = table.findIndex((x) => x.id === f.away);
    const played = table[0]?.played ?? 0;
    if (ih >= 0 && ia >= 0 && played >= 5) {
      if (ih <= 3 && ia <= 3) r = Math.max(r, 2); // mecz czołówki
      else if (ih <= 2 || ia <= 2) r = Math.max(r, 1);
      else if (played >= 17 && ih >= table.length - 4 && ia >= table.length - 4) r = Math.max(r, 1); // walka o utrzymanie
    }
  } else if ((H?.prestige ?? 0) >= 8 && (A?.prestige ?? 0) >= 8) r = Math.max(r, 1);
  return r;
}

const DAY = new Map();
const dayNum = (iso) => {
  let d = DAY.get(iso);
  if (d == null) { const [y, m, dd] = iso.split('-').map(Number); d = Date.UTC(y, m - 1, dd) / 86400000; DAY.set(iso, d); }
  return d;
};

/** Siła sędziego w oczach Kolegium: jakość na tle listy i forma z ostatnich not. */
function refPower(R, r, stat) {
  const form = R.mk[r.id];
  const f = form?.length ? clamp((form.reduce((x, y) => x + y, 0) / form.length / 10 - 8.25) / 0.15, -2, 2) * 0.5 : 0;
  return (refQuality(r) - stat.mean) / stat.sd + f;
}

/**
 * Obsada meczu: przy pierwszym meczu kolejki (rundy pucharu) sędziów dostaje cała kolejka danych rozgrywek.
 * Zasady: sędzia nie z województwa żadnego z klubów, nie prowadził żadnego z nich w ich 4 ostatnich meczach,
 * co najmniej 2 dni między meczami sędziego, równe obciążenie, najlepsi (jakość i forma) do najważniejszych meczów.
 * Gdy brak kandydata: najpierw luzujemy powtórkę klubu, potem województwo, potem sięgamy na listę obok.
 * Koszt: jedno przejście po terminarzu na kolejkę i kandydaci z listy na mecz. Zwraca id sędziego albo null.
 */
export function assignReferee(game, f) {
  if (f.ref) return f.ref;
  const L = refListFor(f);
  if (!L) return null;
  const R = ensureReferees(game);
  const group = (game.fixtures ?? []).filter((x) => x.comp === f.comp && x.round === f.round && !x.ref && !x.played && x.home && x.away);
  if (!group.includes(f)) group.push(f);
  const league = !['pp', 'super'].includes(f.comp) && !String(f.comp).startsWith('playoff');
  const table = league ? standings((game.fixtures ?? []).filter((x) => x.comp === f.comp), compClubIds(f.comp)) : null;
  const rng = new Rng(`obsada:${game.seed}:${SEASON}:${f.comp}:${f.round}:${f.id}`);
  const ranked = group.map((x) => ({ f: x, rank: refRank(x, table) })).sort((a, b) => b.rank - a.rank);
  const used = new Set();
  const stats = {}; // średnia i rozrzut jakości oraz średnie obciążenie list
  const statOf = (l) => {
    if (stats[l]) return stats[l];
    const rs = R.list.filter((r) => r.l === l);
    const qs = rs.map(refQuality);
    const mean = qs.reduce((x, y) => x + y, 0) / Math.max(1, qs.length);
    const sd = Math.sqrt(qs.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, qs.length)) || 1;
    const load = rs.reduce((x, r) => x + (R.st[r.id]?.[0] ?? 0), 0) / Math.max(1, rs.length);
    return (stats[l] = { rs, mean, sd, load });
  };
  const alt = L < 4 ? L + 1 : 3;
  for (const { f: x, rank } of ranked) {
    const day = dayNum(x.date);
    const wh = clubWoj(x.home); const wa = clubWoj(x.away);
    const recent = new Set([...(R.rc[x.home] ?? []), ...(R.rc[x.away] ?? [])]);
    let best = null;
    for (const [l, level] of [[L, 0], [L, 1], [L, 2], [alt, 0], [alt, 1], [alt, 2], [L, 3]]) {
      const S = statOf(l);
      let bestScore = -Infinity;
      for (const r of S.rs) {
        if (used.has(r.id)) continue;
        if (level < 3 && (R.busy[r.id] ?? []).some((d) => Math.abs(d - day) < REF_CFG.gapDays)) continue;
        if (level < 1 && recent.has(r.id)) continue;
        if (level < 2 && (r.w === wh || r.w === wa)) continue;
        const score = rank * refPower(R, r, S) - REF_CFG.fair * ((R.st[r.id]?.[0] ?? 0) - S.load) + rng.gauss(0, REF_CFG.noise);
        if (score > bestScore) { bestScore = score; best = r; }
      }
      if (best) break;
    }
    if (!best) best = rng.pick(statOf(L).rs); // awaryjnie (nie powinno się zdarzyć przy liczebności list)
    used.add(best.id);
    x.ref = best.id;
    const st = (R.st[best.id] ??= [0, 0, 0, 0, 0, 0]);
    st[0]++;
    R.busy[best.id] = [...(R.busy[best.id] ?? []), day].slice(-6);
    for (const c of [x.home, x.away]) R.rc[c] = [...(R.rc[c] ?? []), best.id].slice(-REF_CFG.recent);
  }
  return f.ref;
}

/** Surowość dla silnika: surowość sędziego / średnia jego listy (średnia 1,0). Mecz bez obsady: N(1; 0,13) z meczu. */
export function refStrictFor(game, f) {
  const r = refOf(game, f.ref ?? assignReferee(game, f));
  if (r) return Math.round((r.s / (game.refs.norm[r.l] || 1)) * 100) / 100;
  return Math.round(clamp(new Rng(`sedzia:${game.seed}:${f.id}`).gauss(1, REF_CFG.strictSd), REF_CFG.strictMin, REF_CFG.strictMax) * 100) / 100;
}

/**
 * Sędzia meczu gracza do studia i prasy: { id, name, strictness, redTendency, penaltyTendency, season, list }.
 * Mecze UEFA: sędzia zagraniczny (nazwisko z puli innych krajów, bez zapisu w puli).
 * Sparing: sędzia z listy III ligi, bez statystyk i noty.
 */
export function matchReferee(game, f) {
  ensureReferees(game);
  let r = refOf(game, f.ref ?? assignReferee(game, f));
  const rng = new Rng(`sedzia:${game.seed}:${f.id}`);
  if (!r && f.comp === 'friendly') r = rng.pick(game.refs.list.filter((x) => x.l === 4));
  if (!r) {
    const nat = rng.pick(NATIONALITIES.filter((n) => n !== 'POL'));
    const n = randomName(nat, rng);
    const s = refStrictFor(game, f);
    return { name: `${n.first} ${n.last}`, strictness: s, redTendency: Math.round(s ** 1.5 * 100) / 100, penaltyTendency: Math.round((0.85 + 0.15 * s) * 100) / 100 };
  }
  const s = Math.round((r.s / (game.refs.norm[r.l] || 1)) * 100) / 100;
  const st = game.refs.st[r.id];
  return {
    id: r.id, name: r.n, list: r.l, strictness: s,
    redTendency: Math.round(s ** 1.5 * 100) / 100, penaltyTendency: Math.round((0.85 + 0.15 * s) * 100) / 100,
    season: st?.[1] ? { matches: st[1], yc: st[3], rc: st[4] } : null,
  };
}

// ------------------------------------------------------------ Nota obserwatora (ukryta)
/**
 * Nota obserwatora po meczu (skala PZPN: 8,4 = spełnia oczekiwania). Trudność z rangi meczu, jakość sędziego
 * na tle wymagań listy meczu, poważne i drobne błędy. Nota nie wpływa na wynik. Deterministyczna z meczu.
 * Zwraca { mark, serious } (mark z krokiem 0,1, 6,0 do 10,0).
 */
export function observerMark(r, f, seed) {
  const M = REF_CFG.mark;
  const rng = new Rng(`obserwator:${seed}:${f.id}`);
  const rank = refRank(f);
  const w = [[70, 25, 5], [45, 40, 15], [20, 45, 35], [10, 40, 50]][Math.min(3, rank)];
  const d = rng.weighted([0, 1, 2], (i) => w[i]);
  const L = refListFor(f) ?? r.l;
  const Q = refQuality(r);
  const pres = r.a[4]; const cons = r.a[3];
  const k = Q + 0.05 * (r.e - 10) + 0.25 * d * (pres - Q) - REF_CFG.attrMean[L - 1];
  const serious = rng.poisson(M.serious[d] * Math.exp(-0.22 * k));
  const minor = Math.min(3, rng.poisson(M.minor * Math.exp(-0.15 * k)));
  let mark = Math.round(Math.min(M.cap[d], M.base + M.perK * k + rng.gauss(0, M.sdBase + M.sdCons * (20 - cons))) * 10) / 10;
  mark = Math.round((mark - 0.1 * minor) * 10) / 10;
  if (serious === 1) mark = mark >= 8.3 ? 7.9 : mark >= 8.0 ? 7.8 : Math.min(mark, 7.7);
  else if (serious >= 2) mark = Math.min(7.4 - 0.2 * (serious - 2), mark - 0.5);
  return { mark: Math.round(clamp(mark, 6, 10) * 10) / 10, serious };
}

/** Po meczu z polską obsadą: statystyki sezonu sędziego (mecze, kartki), nota obserwatora, mecze w karierze. */
export function refereeAfterMatch(game, f, res) {
  if (!f.ref || f.comp === 'friendly') return;
  const R = ensureReferees(game);
  const r = refOf(game, f.ref);
  if (!r) return;
  const st = (R.st[r.id] ??= [0, 0, 0, 0, 0, 0]);
  let yc = 0; let rc = 0;
  for (const side of res.players ?? []) for (const x of side) { yc += x.yc ?? 0; rc += x.rc ?? 0; }
  const { mark, serious } = observerMark(r, f, game.seed);
  st[1]++; st[2] += Math.round(mark * 10); st[3] += yc; st[4] += rc; st[5] += serious;
  R.mk[r.id] = [...(R.mk[r.id] ?? []), Math.round(mark * 10)].slice(-5);
  r.car = (r.car ?? 0) + 1;
}
