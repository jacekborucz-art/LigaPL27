// Analiza pomeczowa sztabu (docs/analiza-pomeczowa.md). Po każdym meczu klubu gracza o punkty i w pucharach (liga,
// Puchar Polski, Superpuchar, UEFA, baraże; bez sparingów) analityk (albo asystent, gdy analityka nie ma) pisze krótką
// wiadomość i pełny raport. Raport korzysta tylko z danych widocznych w meczu: wynik, zdarzenia z minutami, statystyki,
// oceny i liczniki zawodników (gole, asysty, strzały, kluczowe podania, odbiory, obrony, faule, kartki, kondycja).
// Nigdy nie czyta ukrytych wartości (zaangażowanie Z, cechy ukryte, jakość wykonania instrukcji indywidualnych).
// Jakość sztabu (atrybuty jak w src/career/teamReport.js) decyduje o dokładności liczb (dokładne, zaokrąglone, słowa),
// o przeoczeniach, o złym akcencie i o zbyt pewnym werdykcie. Wszystko deterministycznie z ziarna meczu: ponowne
// otwarcie daje ten sam tekst. W zapisie tylko kody i liczby (game.matchReports, ok. 40 ostatnich), tekst powstaje
// przy otwarciu z wersjonowanych szablonów. Działa tylko dla klubu gracza: kluby AI i balans meczów bez zmian.
// Progi reguł [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { createMessage } from '../core/inbox.js';
import { staffOf } from '../training/staff.js';
import { staffAttrs } from './teamReport.js';
import { estimateSd, precisionOf, AREP } from './assistantReport.js';
import { anyClub, compLabel } from '../season/season.js';
import { LEAGUE_COMPS, compClubIds } from '../season/leagueComps.js';
import { standings } from '../season/standings.js';

export const MREP = {
  version: 1, // wersja stanu w zapisie
  tv: 1, // wersja szablonów tekstu (poprawki tekstów działają wstecz)
  keep: 40, // archiwum: ok. 40 ostatnich raportów
  noAnalyst: 3, // bez analityka liczby pisze asystent z jakością niższą o 3
  severe: 0.25, // sprawa poważna (czerwona kartka, 3 i więcej straconych goli): łatwiej ją zauważyć
  verdictGap: 0.4, // różnica xG, od której mecz nie jest wyrównany
  overconfident: 0.15, // słaby analityk (q < 8) przy wyrównanym meczu: szansa na błędny werdykt
  byResult: 0.1, // słaby analityk: czasem werdykt po wyniku zamiast po xG
  overgen: 0.3, // słaby analityk: przesadny wniosek po jednym meczu („to nasz stały problem”)
  trend: 3, // wniosek o stylu gry od 3 meczów z tym samym problemem w ostatnich 5
  avgFrom: 3, // porównanie ze średnią od 3 wcześniejszych meczów
  weakRating: 6.0, // słaba ocena (3 z rzędu: rozmowa)
  tiredCond: 55, tiredMin: 70, // zmęczenie: kondycja poniżej 55 % u grających co najmniej 70 minut
};

// Progi reguł z docs/analiza-pomeczowa.md, rozdział 5 [SZAC]. Kalibracja na 40 meczach silnika (Nov 18, 2026): celność
// podań w silniku mieści się zwykle w 79-84 %, więc „dobrze” od 83 % (zamiast 85) i „źle” poniżej 78 % (zamiast 75);
// 3 żółte kartki zdarzały się w ok. 35 % meczów, więc „za dużo kartek” od 4 (faule bez zmian, od 16).
export const RULES = {
  good: { xgDiff: 0.5, xgRatio: 1.3, sotPct: 40, sotMinShots: 5, poss: 58, passAcc: 83, csXga: 1.0, csSaves: 4, spCorners: 5 },
  bad: { finShots: 10, finPct: 25, finGap: 1.0, xga: 1.5, cheapXga: 0.5, fouls: 16, yellows: 4, offsides: 4, sterilePoss: 55, sterileShots: 6, passAcc: 78, lateXga: 0.5, lateGap: 0.4 },
  fix: { spCorners: 5 },
};

const ROLE_TITLE = { analityk: 'Analityk', asystent: 'Asystent trenera', sztab: 'Sztab szkoleniowy' };
const PREC_WORD = { exact: 'wysoka', approx: 'średnia', vague: 'niska' };
const CUP = (comp) => !LEAGUE_COMPS.includes(comp);
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
export const numPl = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
export const plural = (n, [one, few, many]) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
const W = {
  strzal: ['strzał', 'strzały', 'strzałów'], gol: ['gol', 'gole', 'goli'], faul: ['faul', 'faule', 'fauli'],
  zolta: ['żółta kartka', 'żółte kartki', 'żółtych kartek'], spalony: ['spalony', 'spalone', 'spalonych'],
  obrona: ['obrona', 'obrony', 'obron'], rozny: ['rzut rożny', 'rzuty rożne', 'rzutów rożnych'], podanie: ['kluczowe podanie', 'kluczowe podania', 'kluczowych podań'],
  odbior: ['odbiór', 'odbiory', 'odbiorów'], celny: ['celny strzał', 'celne strzały', 'celnych strzałów'], zawodnik: ['zawodnik', 'zawodników', 'zawodników'],
};
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lastName = (game, id, name) => game?.world?.players?.[id]?.last ?? String(name ?? '').split(' ').slice(-1)[0] ?? '';

// ------------------------------------------------------------ Stan w zapisie
/**
 * Stan: { v, club, list: [raport, ...] } od najnowszego, najwyżej MREP.keep. Migracja w miejscu: stary zapis bez
 * analiz dostaje pusty stan, lista z dawnej wersji (tablica) zostaje przycięta, nowy klub zaczyna nowe archiwum.
 */
export function ensureMatchReports(game) {
  if (!game) return null;
  const cur = game.matchReports;
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) game.matchReports = { list: Array.isArray(cur) ? cur : [], club: game.clubId ?? null };
  const s = game.matchReports;
  if ((s.club ?? null) !== (game.clubId ?? null)) { s.list = []; s.club = game.clubId ?? null; }
  s.v = MREP.version;
  s.list = (Array.isArray(s.list) ? s.list : []).filter((x) => x && typeof x === 'object' && x.id && Array.isArray(x.score)).slice(0, MREP.keep);
  return s;
}

/** Raporty od najnowszego. */
export const matchReportList = (game) => ensureMatchReports(game).list;
export const findMatchReport = (game, id) => matchReportList(game).find((x) => x.id === id) ?? null;

/** Czy po meczu powstaje analiza: mecz klubu gracza o stawkę (sparing: nie). */
export function wantsReport(game, f) {
  if (!game || !f || f.comp === 'friendly' || !f.home || !f.away) return false;
  return f.home === game.clubId || f.away === game.clubId;
}

// ------------------------------------------------------------ Sztab: kto pisze i z jaką dokładnością
/** Jakości używane w analizie: liczby (qD), wideo i stałe fragmenty (qW), wnioski (qT), zawodnicy (qO), bramkarz (qG). */
export function analysisSkills(game, clubId = game.clubId) {
  const st = staffOf(game, clubId);
  const here = (role) => !!st[role] && !st[role].vacant && st[role].name != null;
  const hasAn = here('analityk'); const hasAs = here('asystent');
  const as = staffAttrs(game, clubId, 'asystent');
  const an = staffAttrs(game, clubId, 'analityk');
  const asQ = st.asystent?.q ?? 10;
  const down = clamp(asQ - MREP.noAnalyst, 1, 20);
  const by = hasAn ? { r: 'analityk', n: st.analityk.name } : hasAs ? { r: 'asystent', n: st.asystent.name } : { r: 'sztab', n: null };
  return {
    by, hasAn,
    qD: hasAn ? an.DAN : down, qW: hasAn ? an.WID : down,
    qT: as.TAK ?? asQ, qO: as.OCE ?? asQ,
    gk: here('bramkarze') ? { n: st.bramkarze.name, q: st.bramkarze.q ?? 10 } : null,
  };
}

const precOfQ = (q) => precisionOf(estimateSd(q, 1));
const detectChance = (q) => clamp(AREP.detect.base + AREP.detect.perQ * q, AREP.detect.min, AREP.detect.max);

// ------------------------------------------------------------ Dane z meczu (tylko widoczne)
/** Minuta zdarzenia jako liczba („45+2'” = 45, doliczony czas zostaje w swojej połowie). */
export function eventMinute(e) {
  if (typeof e?.min === 'number') return e.min;
  const m = /^(\d+)/.exec(String(e?.min ?? ''));
  return m ? Number(m[1]) : 0;
}
const bucketOf = (m) => (m <= 15 ? 0 : m <= 30 ? 1 : m <= 45 ? 2 : m <= 60 ? 3 : m <= 75 ? 4 : m <= 90 ? 5 : 6);
export const BUCKETS = ['1-15', '16-30', '31-45', '46-60', '61-75', '76-90', '91-120'];
const SHOTS = new Set(['shotOff', 'post', 'shotBlocked', 'shotOn', 'goal']);
const isShot = (e) => SHOTS.has(e.type) && !(e.type === 'goal' && (e.provisional || e.ownGoal));

/** Gol po stałym fragmencie: rzut wolny bezpośredni albo dośrodkowanie po rożnym lub wolnym w tej samej akcji. */
function setPieceGoal(e, evs) {
  if (e.how === 'FK' || e.how === 'SP') return true;
  if (e.how !== 'HEAD') return false;
  return evs.some((x) => x.t === e.t && x !== e && ((x.type === 'corner' && x.side === e.side) || (x.type === 'foul' && x.side === 1 - e.side)));
}

/** Liczby z meczu z perspektywy klubu gracza (u = my, t = rywal). */
function matchFacts(game, f, r) {
  const us = f.home === game.clubId ? 0 : 1; const th = 1 - us;
  const S = r.stats ?? [];
  const su = S[us] ?? {}; const st = S[th] ?? {};
  const pair = (k) => [Number(su[k]) || 0, Number(st[k]) || 0];
  const evs = (r.events ?? []).filter((e) => e && typeof e === 'object');
  const side = (e) => (e.side === us ? 0 : 1);
  const q15 = BUCKETS.map(() => [0, 0]);
  let hasEt = !!r.extraTime;
  for (const e of evs) {
    if (!isShot(e)) continue;
    const m = eventMinute(e); const b = bucketOf(m);
    if (b === 6) hasEt = true;
    q15[b][side(e)] += Number(e.xg) || 0;
  }
  const xgIn = (from, to) => [0, 1].map((s) => evs.filter((e) => isShot(e) && side(e) === s && eventMinute(e) >= from && eventMinute(e) <= to).reduce((a, e) => a + (Number(e.xg) || 0), 0));
  const late = xgIn(61, 90);
  const goals = evs.filter((e) => e.type === 'goal' && !e.provisional);
  const spg = goals.filter((e) => side(e) === 0 && !e.ownGoal && setPieceGoal(e, evs)).length; // gol anulowany przez VAR ma zapis tymczasowy (pominięty)
  const ratings = (r.ratings ?? []).filter((x) => x.side === us && (x.minutes ?? 0) > 0);
  const subIn = new Map(evs.filter((e) => e.type === 'sub' && e.side === us && e.inId).map((e) => [e.inId, eventMinute(e) || 1]));
  const reds = evs.filter((e) => e.type === 'red');
  const firstRed = reds.length ? reds.slice().sort((a, b) => eventMinute(a) - eventMinute(b))[0] : null;
  let rs = null;
  if (firstRed && eventMinute(firstRed) <= 80) {
    const m = eventMinute(firstRed);
    const b = xgIn(0, m); const a = xgIn(m + 1, 200);
    rs = [m, side(firstRed), r2(b[0]), r2(b[1]), r2(a[0]), r2(a[1])];
  }
  const nameOf = (id) => {
    const x = (r.ratings ?? []).find((y) => y.id === id);
    return x ? lastName(game, id, x.name) : lastName(game, id, game.world?.players?.[id]?.name ?? '');
  };
  // Kluczowe momenty: gole, czerwone kartki, gole anulowane po VAR, urazy bez gry dalej, zmarnowane karne, nasze zmiany
  const mo = [];
  for (const e of evs) {
    const s = side(e); const lbl = String(e.min ?? `${eventMinute(e)}'`);
    if (e.type === 'goal' && !e.provisional) mo.push([lbl, e.ownGoal ? 'og' : e.how === 'PEN' ? 'gp' : 'g', s, e.ownGoal ? nameOf(e.ogId) : nameOf(e.pid), e.aid ? nameOf(e.aid) : '']);
    else if (e.type === 'red') mo.push([lbl, 'r', s, nameOf(e.pid), '']);
    else if (e.type === 'varOverturn' && e.cancelGoal) mo.push([lbl, 'v', s, nameOf(e.pid), String(e.varReason ?? '')]);
    else if (e.type === 'injury' && e.canContinue === false) mo.push([lbl, 'i', s, nameOf(e.pid), '']);
    else if ((e.type === 'shotOn' || e.type === 'shotOff') && e.penalty) mo.push([lbl, 'pm', s, nameOf(e.pid), '']);
    else if (e.type === 'sub' && e.side === us && e.inId && e.outId) mo.push([lbl, 's', 0, nameOf(e.inId), nameOf(e.outId)]);
  }
  const players = ratings.map((x) => [
    x.id, lastName(game, x.id, x.name), x.pos ?? '', r1(x.rating), x.minutes ?? 0, x.g ?? 0, x.a ?? 0, x.sh ?? 0, x.sot ?? 0, x.kp ?? 0, x.tk ?? 0,
    x.saves ?? 0, x.yc ? 1 : 0, x.rc ? 1 : 0, Math.round(x.cond ?? 100), subIn.get(x.id) ?? 0,
  ]);
  const score = r.score ?? [su.goals ?? 0, st.goals ?? 0];
  const gf = score[us]; const ga = score[th];
  return {
    us, gf, ga, hasEt,
    ht: Array.isArray(r.halfTimeScore) ? [r.halfTimeScore[us], r.halfTimeScore[th]] : null,
    so: r.shootout?.goals ? [r.shootout.goals[us], r.shootout.goals[th]] : null,
    xg: pair('xg').map(r2), sh: pair('shots'), sot: pair('onTarget'), poss: pair('possession'), pa: pair('passAccuracy'),
    co: pair('corners'), fo: pair('fouls'), off: pair('offsides'), yc: pair('yellow'), rc: pair('red'), sv: pair('saves'),
    q15: q15.slice(0, hasEt ? 7 : 6).map(([a, b]) => [r2(a), r2(b)]), late: late.map(r2), spg, rs, mo: mo.slice(0, 18), players,
    redUs: reds.find((e) => side(e) === 0) ?? null,
  };
}

// Pola zawodnika w zapisie (tablica dla oszczędności miejsca)
export const PL = { id: 0, n: 1, pos: 2, r: 3, m: 4, g: 5, a: 6, sh: 7, sot: 8, kp: 9, tk: 10, sv: 11, yc: 12, rc: 13, c: 14, on: 15 };
const P = (x) => Object.fromEntries(Object.entries(PL).map(([k, i]) => [k, x[i]]));

// ------------------------------------------------------------ Kontekst meczu
function matchContext(game, f, res) {
  const H = anyClub(f.home); const A = anyClub(f.away);
  const derby = !!(H?.region && H.region === A?.region && H.parent !== A?.id && A?.parent !== H?.id);
  let releg = null;
  if (LEAGUE_COMPS.includes(f.comp)) {
    const ids = compClubIds(f.comp);
    if (ids.length) {
      const t = standings((game.fixtures ?? []).filter((x) => x.comp === f.comp), ids);
      const row = t.find((x) => x.id === game.clubId);
      if (row && row.played >= 8) {
        const i = t.indexOf(row);
        if (i >= t.length - 4) releg = [i + 1, t.length];
      }
    }
  }
  return { derby, cup: CUP(f.comp), releg, res };
}

// ------------------------------------------------------------ Reguły (rozdział 5)
/** Kandydaci na pozycje „dobrze” i „źle” z siłą sygnału (wyższa: ważniejsza). Bez błędów sztabu. */
export function ruleItems(F) {
  const G = RULES.good; const B = RULES.bad;
  const [xu, xt] = F.xg; const [sh] = F.sh; const [sot] = F.sot; const [poss] = F.poss; const [pa] = F.pa;
  const out = [];
  const add = (t, code, vals, s, extra = {}) => out.push({ t, code, vals, s: r2(s), ...extra });
  // Dobrze
  if (xu - xt >= G.xgDiff && xu >= G.xgRatio * xt) add('good', 'g_xg', [xu, xt], 1 + (xu - xt) / 0.5);
  if (sh >= G.sotMinShots && sot / sh >= G.sotPct / 100) add('good', 'g_sot', [sot, sh], 0.8 + (100 * sot / sh - G.sotPct) / 15);
  if (poss >= G.poss && pa >= G.passAcc) add('good', 'g_poss', [poss, pa], 0.8 + (poss - G.poss) / 6);
  if (F.ga === 0 && xt >= G.csXga) add('good', 'g_cs', [xt, F.sv[0]], 1 + xt + (F.sv[0] >= G.csSaves ? 0.5 : 0));
  if (F.spg > 0 && F.co[0] >= G.spCorners) add('good', 'g_sp', [F.spg, F.co[0]], 1 + 0.6 * F.spg);
  for (const x of F.players.map(P).filter((p) => p.on > 0 && (p.g > 0 || p.a > 0))) add('good', 'g_sub', [x.g, x.a, x.on], 1 + x.g + 0.5 * x.a, { pid: x.id, n: x.n });
  // Źle
  const lowPct = sh >= B.finShots && sot / sh < B.finPct / 100;
  if (lowPct || F.gf < xu - B.finGap) add('bad', 'b_fin', [F.gf, xu, sot, sh], 1 + Math.max(lowPct ? (B.finPct - 100 * sot / sh) / 10 : 0, (xu - B.finGap - F.gf) / 0.5));
  if (xt >= B.xga && xt > xu) add('bad', 'b_xga', [xt, xu], 1 + (xt - B.xga) / 0.5 + (xt - xu), { sev: F.ga >= 3 });
  if (F.ga > 0 && xt < B.cheapXga) add('bad', 'b_cheap', [F.ga, xt], 1 + 0.7 * F.ga, { sev: F.ga >= 3 });
  if (F.fo[0] >= B.fouls || F.yc[0] >= B.yellows) add('bad', 'b_disc', [F.fo[0], F.yc[0]], 0.8 + Math.max((F.fo[0] - B.fouls) / 4, F.yc[0] - B.yellows));
  if (F.off[0] >= B.offsides) add('bad', 'b_off', [F.off[0]], 0.6 + 0.3 * (F.off[0] - B.offsides));
  if (F.redUs) {
    const m = eventMinute(F.redUs); const pl = F.players.map(P).find((p) => p.id === F.redUs.pid);
    add('bad', 'b_red', [m], 2.5 + Math.max(0, (75 - m) / 30), { pid: F.redUs.pid ?? null, n: pl?.n ?? '', sev: true });
  }
  const [lu, lt] = F.late;
  if (lt >= B.lateXga && lt >= lu + B.lateGap) add('bad', 'b_late', [lt, lu], 0.8 + (lt - lu));
  if (poss >= B.sterilePoss && sh < B.sterileShots) add('bad', 'b_sterile', [poss, sh], 1 + (poss - B.sterilePoss) / 10 + (B.sterileShots - sh) / 3);
  if (pa > 0 && pa < B.passAcc) add('bad', 'b_pass', [pa], 0.7 + (B.passAcc - pa) / 5);
  return out;
}

// Każde „źle” daje temat do poprawy i rekomendację na następny mecz
const FIX_OF = { b_fin: 'f_fin', b_xga: 'f_def', b_cheap: 'f_def', b_late: 'f_end', b_disc: 'f_disc', b_red: 'f_disc', b_pass: 'f_pass', b_sterile: 'f_ster', b_off: 'f_off' };
const REC_OF = { f_fin: 'r_fin', f_def: 'r_line', f_end: 'r_end', f_pass: 'r_pass', f_ster: 'r_width', f_off: 'r_runs', f_sp: 'r_sp', f_cond: 'r_fit' };
// Kod rekomendacji: dokąd prowadzi przycisk (tylko nawigacja, nic się nie zmienia samo)
export const REC_GO = { r_disc: 'talks', r_fin: 'training', r_sp: 'training', r_fit: 'training', r_runs: 'training', r_rest: 'tactics', r_line: 'tactics', r_end: 'tactics', r_width: 'tactics', r_pass: 'tactics', r_talk: 'talk', r_chance: 'player', r_keep: null };
export const GO_LABEL = { training: 'Ustaw trening', tactics: 'Zmień taktykę', talk: 'Porozmawiaj', talks: 'Rozmowy', player: 'Karta zawodnika', report: 'Pełny raport' };
const STYLE = new Set(['f_def', 'f_pass', 'f_ster', 'f_end']); // wnioski o stylu gry tylko przy powtarzającym się problemie

function verdictOf(d, res) {
  const g = MREP.verdictGap;
  if (res === 'W') return d >= g ? 'zasl' : d <= -g ? 'szcz' : 'wyr';
  if (res === 'P') return d <= -g ? 'zasl' : d >= g ? 'niez' : 'wyr';
  return d >= g ? 'niez' : d <= -g ? 'szcz' : 'wyr';
}

/** Ile razy kod pojawił się w raportach (najnowsze pierwsze). */
const codeCount = (list, code) => list.filter((x) => x.items?.some((i) => i.code === code && i.t === 'bad')).length;

// ------------------------------------------------------------ Analiza (zapis: kody i liczby)
/**
 * Raport po meczu f z wynikiem pełnego silnika r (result(M)). prev: wcześniejsze raporty (najnowsze pierwsze).
 * Zwraca rekord do zapisu. Nie zmienia stanu gry.
 */
export function analyzeMatch(game, f, r, prev = matchReportList(game)) {
  const F = matchFacts(game, f, r);
  const seed = `${game.seed}:${f.id}`;
  const rng = (tag) => new Rng(`analiza:${seed}:${tag}`);
  const sk = analysisSkills(game);
  const pD = precOfQ(sk.qD); const pT = precOfQ(sk.qT); const pG = sk.gk ? precOfQ(sk.gk.q) : null;
  const oppId = f.home === game.clubId ? f.away : f.home;
  const opp = anyClub(oppId);
  const shoot = F.so && F.so[0] !== F.so[1];
  const res = F.gf > F.ga ? 'W' : F.gf < F.ga ? 'P' : 'R';
  const ctx = matchContext(game, f, res);
  const prev5 = prev.slice(0, 4);

  // xG w ocenie analityka: dokładny analityk podaje liczby z meczu, słabszy szacuje z błędem
  const sdX = pD === 'exact' ? 0 : 0.05 * estimateSd(sk.qD, 1);
  const xe = F.xg.map((v, i) => r2(Math.max(0, v + sdX * rng(`xg:${i}`).gauss(0, 1))));
  const d = xe[0] - xe[1];
  const vres = shoot ? 'R' : res; // seria karnych: w grze był remis
  let vd = verdictOf(d, vres);
  if (sk.qD < 8 && Math.abs(d) < MREP.verdictGap && rng('pewny').chance(MREP.overconfident)) vd = vres === 'R' ? (d >= 0 ? 'niez' : 'szcz') : 'zasl';
  else if (sk.qD < 8 && Math.abs(d) >= MREP.verdictGap && rng('po-wyniku').chance(MREP.byResult)) vd = vres === 'R' ? 'wyr' : 'zasl';

  // Reguły i przeoczenia
  const qOf = (code) => (['b_late', 'b_sterile', 'b_xga', 'g_poss', 'b_pass'].includes(code) ? (sk.qD + sk.qT) / 2 : ['g_sp'].includes(code) ? sk.qW : ['g_sub'].includes(code) ? sk.qO : sk.qD);
  const cand = ruleItems(F);
  // Czerwonej kartki nie da się przeoczyć; inne poważne sprawy (3 i więcej straconych goli) łatwiej zauważyć
  const seen = cand.filter((x) => x.code === 'b_red' || rng(`widzi:${x.code}:${x.pid ?? ''}`).chance(Math.min(1, detectChance(qOf(x.code)) + (x.sev ? MREP.severe : 0))));
  const qI = (sk.qD + sk.qT) / 2;
  const nItems = AREP.items(qI);
  const order = (xs) => xs.slice().sort((a, b) => b.s - a.s);
  let good = order(seen.filter((x) => x.t === 'good')).slice(0, nItems);
  let bad = order(seen.filter((x) => x.t === 'bad')).slice(0, nItems);
  const red = seen.find((x) => x.code === 'b_red');
  if (red && !bad.includes(red)) bad[bad.length - 1] = red; // czerwona kartka zawsze w raporcie
  // Zły akcent: sprawa drugorzędna na górze (główna zostaje niżej)
  const swap = (xs, tag) => (xs.length >= 2 && rng(`akcent:${tag}`).chance((20 - sk.qT) / 60) ? [xs[1], xs[0], ...xs.slice(2)] : xs);
  good = swap(good, 'good'); bad = swap(bad, 'bad');
  for (const x of bad) {
    x.rc = 1 + codeCount(prev5, x.code);
    if (x.rc < MREP.trend && sk.qT < 8 && x === bad[0] && rng('przesada').chance(MREP.overgen)) x.og = 1;
  }

  // Do poprawy: z każdego „źle” temat, stałe fragmenty i kondycja z faktów meczu
  const fix = [];
  const addFix = (code, vals, s, extra = {}) => { if (!fix.some((x) => x.code === code)) fix.push({ t: 'fix', code, vals, s: r2(s), ...extra }); };
  for (const b of bad) {
    const code = FIX_OF[b.code];
    if (!code) continue;
    if (code === 'f_disc') {
      const pl = F.players.map(P);
      const who = b.code === 'b_red' ? pl.find((p) => p.id === b.pid) : pl.find((p) => p.yc && !p.rc);
      addFix(code, b.code === 'b_red' ? [1] : [F.fo[0]], b.s, who ? { pid: who.id, n: who.n } : {});
    } else addFix(code, b.vals, b.s, { rc: b.rc, ...(b.og ? { og: 1 } : {}) });
  }
  if (F.co[0] >= RULES.fix.spCorners && F.spg === 0 && rng('widzi:f_sp').chance(detectChance(sk.qW))) addFix('f_sp', [F.co[0]], 0.4 + 0.1 * (F.co[0] - RULES.fix.spCorners));
  const tired = F.players.map(P).filter((p) => p.m >= MREP.tiredMin && p.c < MREP.tiredCond).sort((a, b) => a.c - b.c);
  if (tired.length && rng('widzi:f_cond').chance(detectChance(sk.qO))) addFix('f_cond', [tired.length, tired[0].c], 0.6 + 0.2 * tired.length, { pid: tired[0].id, n: tired.slice(0, 3).map((p) => p.n).join(', ') });
  const fixCap = Math.max(1, nItems - (sk.hasAn ? 0 : 1));
  fix.sort((a, b) => b.s - a.s);
  fix.splice(fixCap);

  // Zawodnicy: 2 najlepsi i 1-2 najsłabsi według oceny
  const pl = F.players.map(P);
  const top = pl.slice().sort((a, b) => b.r - a.r || b.m - a.m).slice(0, sk.qO < 6 ? 1 : 2);
  const lowAll = pl.filter((p) => p.m >= 30 && p.r < 6.3 && !top.includes(p)).sort((a, b) => a.r - b.r);
  const low = lowAll.slice(0, lowAll[1] && lowAll[1].r < 6.0 && sk.qO >= 6 ? 2 : 1);

  // Następne kroki: 1-3 rekomendacje powiązane z faktem z meczu
  const recs = [];
  const addRec = (code, extra = {}) => { if (!recs.some((x) => x.code === code && x.pid === extra.pid)) recs.push({ code, ...extra }); };
  // 3 słabe oceny z rzędu albo dyscyplina: rozmowa
  const weak3 = pl.filter((p) => p.m >= 30 && p.r < MREP.weakRating && prev.slice(0, 2).length === 2
    && prev.slice(0, 2).every((x) => (x.players ?? []).some((y) => y[PL.id] === p.id && y[PL.m] >= 30 && y[PL.r] < MREP.weakRating)));
  for (const fx of fix) {
    if (fx.code === 'f_disc') addRec(fx.pid ? 'r_talk' : 'r_disc', fx.pid ? { pid: fx.pid, n: fx.n, why: 'disc' } : {});
    else if (fx.code === 'f_cond') {
      const soon = nextMatchGap(game, f);
      if (tired.length >= 3 && !(soon != null && soon <= 3)) addRec('r_fit');
      else addRec('r_rest', { pid: fx.pid, n: tired[0].n });
    } else if (REC_OF[fx.code]) addRec(REC_OF[fx.code]);
  }
  for (const p of weak3) addRec('r_talk', { pid: p.id, n: p.n, why: 'form' });
  const subStar = pl.filter((p) => p.on > 0 && p.r >= 7.3).sort((a, b) => b.r - a.r)[0];
  if (subStar) addRec('r_chance', { pid: subStar.id, n: subStar.n });
  if (!recs.length) addRec('r_keep');
  const recCap = sk.qT >= 14 ? 3 : sk.qT >= 8 ? 2 : 1 + (rng('rekom').chance(0.5) ? 1 : 0);
  recs.splice(recCap);

  // Zawodnik do uwagi w poczcie: zawiódł albo zaskoczył
  const down = pl.filter((p) => p.m >= 45 && p.r < MREP.weakRating).sort((a, b) => a.r - b.r)[0] ?? null;
  const up = pl.filter((p) => p.r >= 7.5).sort((a, b) => b.r - a.r)[0] ?? null;
  const note = (res !== 'W' && down) ? { pid: down.id, k: 'down' } : up ? { pid: up.id, k: 'up' } : down ? { pid: down.id, k: 'down' } : top[0] ? { pid: top[0].id, k: 'up' } : null;
  const pts = sk.qT < 8 && sk.qD < 8 ? 2 : 3; // słaby sztab: 2 punkty zamiast 3

  const stats = { xg: F.xg, sh: F.sh, sot: F.sot, poss: F.poss, pa: F.pa, co: F.co, fo: F.fo, off: F.off, yc: F.yc, rc: F.rc, sv: F.sv };
  return {
    v: MREP.version, tv: MREP.tv, id: f.id, date: f.date, comp: f.comp, lbl: compLabel(f), opp: oppId, oppN: opp?.name ?? oppId,
    home: f.home === game.clubId, neutral: !!f.neutral, hN: anyClub(f.home)?.name ?? f.home, aN: anyClub(f.away)?.name ?? f.away,
    score: [F.gf, F.ga], ht: F.ht, so: F.so, et: !!F.hasEt, res, ...stats, xe, q15: F.q15, late: F.late, rs: F.rs, mo: F.mo,
    players: F.players, ctx: { derby: ctx.derby ? 1 : 0, cup: ctx.cup ? 1 : 0, releg: ctx.releg },
    items: [...good, ...bad, ...fix].map(({ t, code, vals, pid, n, rc, og }) => ({ t, code, vals: vals.map((v) => r2(v)), ...(pid ? { pid } : {}), ...(n ? { n } : {}), ...(rc ? { rc } : {}), ...(og ? { og } : {}) })),
    vd, top: top.map((p) => p.id), low: low.map((p) => p.id), note, rec: recs, pts,
    by: sk.by, gk: sk.gk ? sk.gk.n : null, pr: { d: pD, t: pT, g: pG }, seed,
  };
}

/** Dni do następnego meczu klubu gracza o stawkę po meczu f (null: brak w terminarzu). */
function nextMatchGap(game, f) {
  const n = (game.fixtures ?? []).filter((x) => !x.played && x.comp !== 'friendly' && x.date > f.date && (x.home === game.clubId || x.away === game.clubId))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!n) return null;
  return Math.round((new Date(`${n.date}T12:00:00Z`) - new Date(`${f.date}T12:00:00Z`)) / 86400000);
}

// ------------------------------------------------------------ Tekst (generowany przy otwarciu, szablony tv 1)
/** Formatowanie liczb według dokładności: dokładne, zaokrąglone („ok. 12”), słowa (szablony „w”). */
export function numFmt(prec) {
  const exact = prec === 'exact';
  const cnt = (v) => (exact || v < 6 ? `${v}` : `ok. ${Math.round(v / 2) * 2}`);
  return {
    prec,
    cnt,
    n: (v, forms) => { const s = cnt(v); const k = exact || v < 6 ? v : Math.round(v / 2) * 2; return `${s} ${plural(k, forms)}`; },
    xg: (v) => (exact ? numPl(v, 2) : `ok. ${numPl(Math.round(v * 2) / 2, 1)}`),
    xgp: (a, b) => (exact ? `${numPl(a, 2)} do ${numPl(b, 2)}` : `ok. ${numPl(Math.round(a * 2) / 2, 1)} do ${numPl(Math.round(b * 2) / 2, 1)}`),
    pct: (v) => (exact ? `${Math.round(v)} %` : `ok. ${Math.round(v / 5) * 5} %`),
    rating: (v) => (prec === 'vague' ? null : numPl(v, 1)),
  };
}

const golWord = (n) => `${n} ${plural(n, W.gol)}`;
/** „z 11 strzałów” (dopełniacz po „z”). */
const zStrz = (F, n) => { const k = F.prec === 'exact' || n < 6 ? n : Math.round(n / 2) * 2; return `${F.cnt(n)} ${k === 1 ? 'strzału' : 'strzałów'}`; };
// Szablony pozycji: n (liczby), w (słowa, słaby analityk). Każde zdanie z liczbą z meczu.
const TPL = {
  g_xg: {
    n: [(v, F) => `Stworzyliśmy wyraźnie więcej sytuacji: xG ${F.xgp(v[0], v[1])}.`, (v, F) => `Przewaga w sytuacjach była po naszej stronie, xG ${F.xgp(v[0], v[1])}.`],
    w: [() => 'Stworzyliśmy wyraźnie więcej groźnych sytuacji niż rywal.', () => 'Rywal miał przy nas mało okazji, my dużo więcej.'],
  },
  g_sot: {
    n: [(v, F) => `Dobra celność: w światło bramki ${F.cnt(v[0])} z ${zStrz(F, v[1])} (${F.pct(100 * v[0] / Math.max(1, v[1]))}).`, (v, F) => `Strzelaliśmy celnie: ${F.cnt(v[0])} z ${zStrz(F, v[1])} w światło bramki.`],
    w: [() => 'Strzelaliśmy celnie, bramkarz rywala miał dużo pracy.'],
  },
  g_poss: {
    n: [(v, F) => `Kontrolowaliśmy grę: posiadanie ${F.pct(v[0])}, celność podań ${F.pct(v[1])}.`, (v, F) => `Piłka była po naszej stronie (${F.pct(v[0])}), a podania dokładne (${F.pct(v[1])}).`],
    w: [() => 'Długo utrzymywaliśmy się przy piłce i mało jej traciliśmy.'],
  },
  g_cs: {
    n: [(v, F) => `Czyste konto, choć rywal miał swoje sytuacje (xG ${F.xg(v[0])})${v[1] >= RULES.good.csSaves ? `; bramkarz zaliczył ${F.n(v[1], W.obrona)}` : ''}.`],
    w: [() => 'Zero z tyłu, choć rywal miał swoje okazje.'],
  },
  g_sp: {
    n: [(v, F) => `Stały fragment dał ${v[0] === 1 ? 'gola' : golWord(v[0])}; mieliśmy ${F.n(v[1], W.rozny)}.`],
    w: [() => 'Stałe fragmenty dały nam gola.'],
  },
  g_sub: {
    n: [(v, F, x) => `${x.n} wszedł z ławki w ${v[2]}. minucie i ${[v[0] ? `strzelił ${v[0] === 1 ? 'gola' : `${v[0]} ${plural(v[0], ['gola', 'gole', 'goli'])}`}` : '', v[1] ? `zaliczył ${v[1] === 1 ? 'asystę' : `${v[1]} ${plural(v[1], ['asystę', 'asysty', 'asyst'])}`}` : ''].filter(Boolean).join(' i ')}.`],
    w: [(v, F, x) => `${x.n} dobrze wszedł z ławki, miał udział przy golu.`],
  },
  b_fin: {
    n: [
      (v, F) => (v[3] >= RULES.bad.finShots && v[2] / v[3] < RULES.bad.finPct / 100 ? `Zabrakło skuteczności: ${F.n(v[3], W.strzal)}, celnych tylko ${F.cnt(v[2])}.` : `Zabrakło skuteczności: ${golWord(v[0])} przy xG ${F.xg(v[1])}.`),
      (v, F) => `Skuteczność do poprawy: xG ${F.xg(v[1])}, a strzeliliśmy ${v[0] === 1 ? 'jednego gola' : golWord(v[0])}${v[3] ? `; w światło bramki ${F.cnt(v[2])} z ${zStrz(F, v[3])}` : ''}.`,
    ],
    w: [() => 'Zawiodła skuteczność: sytuacje były, goli zabrakło.', () => 'Skuteczność była słaba, za dużo zmarnowanych okazji.'],
  },
  b_xga: {
    n: [(v, F) => `Rywal stworzył więcej niż my: xG ${F.xgp(v[0], v[1])} na jego korzyść.`, (v, F) => `Za łatwo oddawaliśmy sytuacje: rywal miał xG ${F.xg(v[0])}, my ${F.xg(v[1])}.`],
    w: [() => 'Rywal za łatwo dochodził do sytuacji pod naszą bramką.'],
  },
  b_cheap: {
    n: [(v, F) => `Straciliśmy ${golWord(v[0])} przy bardzo małej liczbie sytuacji rywala (xG ${F.xg(v[1])}).`, (v, F) => `Rywal strzelił ${golWord(v[0])}, choć prawie nic nie stworzył (xG ${F.xg(v[1])}).`],
    w: [() => 'Gole straciliśmy po prostych błędach, rywal nie musiał się napracować.'],
  },
  b_disc: {
    n: [(v, F) => `Za dużo fauli i kartek: ${[v[0] >= RULES.bad.fouls || !v[1] ? F.n(v[0], W.faul) : '', v[1] ? F.n(v[1], W.zolta) : ''].filter(Boolean).join(', ')}.`],
    w: [() => 'Graliśmy za ostro: dużo fauli i kartek.'],
  },
  b_off: {
    n: [(v, F) => `${cap(F.n(v[0], W.spalony))}: wybiegnięcia źle zgrane z podaniem.`],
    w: [() => 'Często łapaliśmy się na spalonego.'],
  },
  b_red: {
    n: [(v, F, x) => `Czerwona kartka (${x.n || 'nasz zawodnik'}, ${v[0]}. min) ustawiła resztę meczu.`],
    w: [(v, F, x) => `Czerwona kartka (${x.n || 'nasz zawodnik'}) ustawiła resztę meczu.`],
  },
  b_late: {
    n: [(v, F) => `Ostatnie 30 minut należało do rywala: xG ${F.xgp(v[0], v[1])} na jego korzyść.`],
    w: [() => 'W końcówce oddaliśmy rywalowi inicjatywę.'],
  },
  b_sterile: {
    n: [(v, F) => `Dużo piłki, mało z niej: posiadanie ${F.pct(v[0])}, a tylko ${F.n(v[1], W.strzal)}.`],
    w: [() => 'Mieliśmy piłkę, ale niewiele z tego wynikało pod bramką rywala.'],
  },
  b_pass: {
    n: [(v, F) => `Niedokładne podania: celność ${F.pct(v[0])}.`],
    w: [() => 'Za dużo strat po niecelnych podaniach.'],
  },
  f_fin: {
    n: [() => 'Wykończenie: spokój w polu karnym i lepszy wybór pozycji do strzału.', () => 'Wykończenie akcji: mniej strzałów z trudnych pozycji, więcej z pola karnego.'],
  },
  f_def: {
    n: [() => 'Obrona: ustawienie linii i asekuracja, rywal za łatwo wchodził w pole karne.', () => 'Ustawienie linii obrony i pressing: za dużo miejsca przed naszym polem karnym.'],
  },
  f_end: { n: [() => 'Plan na końcówkę: wcześniejsze zmiany i spokojniejsza gra przy korzystnym wyniku.'] },
  f_disc: {
    n: [(v, F, x) => (v[0] === 1 && x.code0 === 'b_red' ? `Dyscyplina: ${x.n || 'nasz zawodnik'} osłabił drużynę czerwoną kartką.` : `Dyscyplina: mniej niepotrzebnych fauli${x.n ? ` (z kartką między innymi: ${x.n})` : ''}.`)],
  },
  f_pass: { n: [() => 'Rozegranie: prostsze podania pod pressingiem, mniej ryzyka w środku pola.'] },
  f_ster: { n: [() => 'Atak pozycyjny: więcej gry skrzydłami i szybsze wejście w pole karne.'] },
  f_off: { n: [() => 'Wybiegnięcia: lepsze zgranie momentu podania z ruchem napastników.'] },
  f_sp: {
    n: [(v, F) => `Stałe fragmenty: ${F.n(v[0], W.rozny)} bez gola, warianty do poprawy.`],
    w: [() => 'Stałe fragmenty: dużo rożnych, nic z nich nie wynikło.'],
  },
  f_cond: {
    n: [(v, F, x) => `Kondycja: ${x.n} kończyli mecz bardzo zmęczeni (najniżej ${F.pct(v[1])} sił).`],
    w: [(v, F, x) => `Kondycja: ${x.n} kończyli mecz na rezerwie sił.`],
  },
};

const REC_TXT = {
  r_fin: () => 'Trening: akcent techniczny w tym tygodniu, więcej zajęć z wykończenia akcji.',
  r_sp: () => 'Trening: akcent na stałe fragmenty, nowe warianty rożnych i wolnych.',
  r_fit: () => 'Trening: lżejsze obciążenie i regeneracja przed następnym meczem.',
  r_runs: () => 'Trening: akcent taktyczny, zgranie wybiegnięć napastników z momentem podania.',
  r_rest: (x) => `Skład: ${x.n} potrzebuje odpoczynku w następnym meczu.`,
  r_line: () => 'Taktyka: niżej linia obrony albo spokojniejszy pressing.',
  r_end: () => 'Taktyka: plan na końcówkę, wcześniejsze zmiany i ostrożniejsze nastawienie przy prowadzeniu.',
  r_width: () => 'Taktyka: szersza gra i szybsze tempo ataku.',
  r_pass: () => 'Taktyka: krótsze podania i spokojniejsze tempo rozegrania.',
  r_talk: (x) => `Rozmowa indywidualna: ${x.n}, ${x.why === 'form' ? 'trzeci słaby mecz z rzędu' : 'dyscyplina na boisku'}.`,
  r_chance: (x) => `Skład: ${x.n} zasłużył na szansę od początku.`,
  r_disc: () => 'Zebranie drużyny: przypomnieć o dyscyplinie, mniej fauli w środku pola.',
  r_keep: (x, res) => (res === 'W' ? 'Utrzymać plan: gra wyglądała dobrze, bez dużych zmian.' : 'Bez nerwowych zmian: obejrzeć mecz na wideo i trzymać się planu.'),
};

const HEAD = {
  g_xg: 'przewaga w sytuacjach', g_sot: 'dobra celność', g_poss: 'kontrola gry', g_cs: 'czyste konto', g_sp: 'gol ze stałego fragmentu', g_sub: 'dobra zmiana',
  b_fin: 'zabrakło skuteczności', b_xga: 'za dużo sytuacji rywala', b_cheap: 'tanio stracone gole', b_disc: 'za dużo fauli i kartek', b_off: 'za dużo spalonych',
  b_red: 'czerwona kartka', b_late: 'słaba końcówka', b_sterile: 'posiadanie bez strzałów', b_pass: 'niedokładne podania',
};
const VD = {
  W: { zasl: 'zasłużone zwycięstwo', szcz: 'szczęśliwe zwycięstwo', wyr: 'wyrównany mecz', niez: 'zasłużone zwycięstwo' },
  R: { zasl: 'zasłużony remis', szcz: 'szczęśliwy remis', wyr: 'wyrównany mecz', niez: 'niezasłużony remis, było nas stać na więcej' },
  P: { zasl: 'zasłużona porażka', szcz: 'zasłużona porażka', wyr: 'wyrównany mecz', niez: 'niezasłużona porażka' },
};
export const VD_SHORT = { zasl: 'zasłużony wynik', szcz: 'szczęśliwy wynik', niez: 'niezasłużony wynik', wyr: 'wyrównany mecz' };
const RES_WORD = { W: 'Zwycięstwo', R: 'Remis', P: 'Porażka' };

/** Tekst jednej pozycji raportu. */
function itemText(rec, it, F, pick) {
  const T = TPL[it.code];
  if (!T) return '';
  const vague = F.prec === 'vague' && T.w;
  const list = vague ? T.w : T.n;
  const code0 = rec.items.find((x) => x.t === 'bad' && FIX_OF[x.code] === it.code)?.code ?? null;
  let s = pick(list, `${it.t}:${it.code}`)(it.vals, F, { n: it.n ?? '', code0 });
  if (it.t === 'fix' && it.rc >= MREP.trend) s += STYLE.has(it.code) ? ` Problem wraca (${it.rc} z ostatnich 5 meczów): to już sprawa stylu gry.` : ` Problem wraca: ${it.rc} z ostatnich 5 meczów.`;
  else if (it.t === 'fix' && it.og) s += ' To nasz stały problem.';
  return s;
}

/** Powód oceny zawodnika (z widocznych liczników meczu). */
function playerReason(p, good, F) {
  const parts = [];
  if (good) {
    if (p.g) parts.push(golWord(p.g));
    if (p.a) parts.push(`${p.a} ${plural(p.a, ['asysta', 'asysty', 'asyst'])}`);
    if (p.sv >= 3) parts.push(F.prec === 'vague' ? 'kilka ważnych obron' : F.n(p.sv, W.obrona));
    if (p.kp >= 2) parts.push(F.prec === 'vague' ? 'kluczowe podania' : F.n(p.kp, W.podanie));
    if (p.tk >= 3) parts.push(F.prec === 'vague' ? 'dużo odbiorów' : F.n(p.tk, W.odbior));
    if (p.sot >= 2 && !p.g) parts.push(F.prec === 'vague' ? 'groźne strzały' : F.n(p.sot, W.celny));
    if (!parts.length) parts.push(p.pos === 'BR' ? 'pewny w bramce' : 'solidny w obu fazach');
  } else {
    if (p.rc) parts.push('czerwona kartka');
    else if (p.yc) parts.push('żółta kartka');
    if (p.sh >= 3 && !p.sot) parts.push(F.prec === 'vague' ? 'niecelne strzały' : `${F.n(p.sh, W.strzal)}, żaden celny`);
    if (p.pos === 'BR' && !p.sv) parts.push('bez obron');
    if (!parts.length) parts.push(p.pos === 'BR' ? 'niepewny w bramce' : p.m < 60 ? 'mało widoczny w grze' : 'słabo w pojedynkach i przy piłce');
  }
  return parts.join(', ');
}

const ratingWord = (r) => (r >= 8 ? 'świetny mecz' : r >= 7.2 ? 'bardzo dobry mecz' : r >= 6.6 ? 'dobry mecz' : r >= 6.0 ? 'przeciętny mecz' : 'słaby mecz');

/**
 * Pełny tekst raportu z zapisanego rekordu (deterministyczny). Zwraca model dla widoku i poczty.
 */
export function reportText(game, rec) {
  const pick = (list, tag) => list[new Rng(`analiza-tekst:${rec.seed}:${rec.tv}:${tag}`).int(0, list.length - 1)];
  const F = numFmt(rec.pr?.d ?? 'approx');
  const FT = numFmt(rec.pr?.t ?? 'approx');
  const players = (rec.players ?? []).map(P);
  const byId = new Map(players.map((p) => [p.id, p]));
  const [gf, ga] = rec.score;
  const res = rec.res;
  const vd = VD[rec.so && rec.so[0] !== rec.so[1] ? 'R' : res]?.[rec.vd] ?? VD_SHORT[rec.vd] ?? 'wyrównany mecz';
  const items = (t) => rec.items.filter((x) => x.t === t);
  const good = items('good').map((x) => ({ code: x.code, text: itemText(rec, x, F, pick) }));
  const bad = items('bad').map((x) => ({ code: x.code, text: itemText(rec, x, F, pick) }));
  const fix = items('fix').map((x) => ({ code: x.code, text: itemText(rec, x, F, pick) }));
  const where = rec.neutral ? 'na neutralnym boisku' : rec.home ? 'u siebie' : 'na wyjeździe';
  const so = rec.so ? `, karne ${rec.so[0]}:${rec.so[1]}` : rec.et ? ', po dogrywce' : '';

  // Główna przyczyna: przy wygranej najmocniejsze „dobrze”, przy porażce „źle”, przy remisie silniejsze z obu
  const goodI = items('good'); const badI = items('bad');
  // Przewaga w xG jest już w werdykcie: główną przyczyną zostaje kolejna mocna strona, jeśli jest
  const goodMain = goodI[0]?.code === 'g_xg' && goodI[1] ? goodI[1] : goodI[0];
  const mainI = res === 'W' ? (goodMain ?? null) : res === 'P' ? (badI[0] ?? null) : (badI[0] ?? goodMain ?? null);
  const VD_WHY = { wyr: 'Mecz był wyrównany, o wyniku zdecydowały detale pod bramkami.', zasl: 'Wynik oddaje przebieg meczu.', szcz: 'Dopisało szczęście: wynik jest lepszy niż gra.', niez: 'Wynik nie oddaje przebiegu meczu: w grze byliśmy lepsi.' };
  const mainText = mainI ? itemText(rec, mainI, F, pick) : F.prec === 'vague' ? VD_WHY[rec.vd] ?? VD_WHY.wyr : `${VD_WHY[rec.vd] ?? VD_WHY.wyr} Sytuacje: xG ${F.xgp(rec.xe[0], rec.xe[1])}.`;
  const headline = mainI ? HEAD[mainI.code] : VD_SHORT[rec.vd] ?? 'wyrównany mecz';
  const xgLine = F.prec === 'vague' ? '' : `, xG ${F.xgp(rec.xe[0], rec.xe[1])}`;
  const verdict = `${RES_WORD[res]} ${gf}:${ga}${so} ${where}, rywal: ${rec.oppN}. Werdykt: ${vd}${xgLine}.`;

  // Kontekst i ton
  const ctxLines = [];
  if (rec.ctx?.derby) ctxLines.push(pick({ W: ['Derby wygrane: to waży więcej niż 3 punkty, szatnia i trybuny to zapamiętają.'], R: ['Derby bez zwycięzcy: charakteru nie zabrakło, zabrakło konkretu pod bramką.'], P: ['Przegrane derby zabolą kibiców: w następnym meczu ważna będzie reakcja drużyny.'] }[res], 'derby'));
  if (rec.ctx?.cup) ctxLines.push(rec.so ? `Mecz pucharowy rozstrzygnięty w serii rzutów karnych (${rec.so[0]}:${rec.so[1]}): w pucharze liczy się awans, styl jest drugorzędny.` : rec.et ? 'Mecz pucharowy po 120 minutach: przed kolejnym meczem trzeba zadbać o świeżość.' : 'Mecz pucharowy: liczy się awans, styl jest drugorzędny.');
  if (rec.ctx?.releg) ctxLines.push(`Walka o utrzymanie: ${rec.ctx.releg[0]}. miejsce w tabeli, każdy punkt ma wagę. ${res === 'W' ? 'Te punkty dają oddech.' : res === 'R' ? 'Punkt też się liczy.' : 'Bez paniki: drużyna potrzebuje teraz wsparcia.'}`);
  if (rec.rs) {
    const [m, who, ub, tb, ua, ta] = rec.rs;
    ctxLines.push(F.prec === 'vague'
      ? `Mecz zmieniła czerwona kartka ${who === 0 ? 'dla nas' : 'dla rywala'} (${m}. min): oceniamy osobno grę przed nią i po niej.`
      : `Do czerwonej kartki ${who === 0 ? 'dla nas' : 'dla rywala'} (${m}. min) xG ${F.xgp(ub, tb)}, po niej ${F.xgp(ua, ta)}.`);
  }
  if (rec.vd === 'niez' || rec.vd === 'szcz') ctxLines.push('Wynik nie oddaje przebiegu meczu: wnioski wyciągamy z gry, nie z samego wyniku.');

  // Zawodnicy
  const pRow = (id, good) => {
    const p = byId.get(id);
    if (!p) return null;
    const rt = F.rating(p.r);
    return { id, name: p.n, pos: p.pos, r: p.r, rating: rt, word: ratingWord(p.r), text: playerReason(p, good, F) };
  };
  const top = (rec.top ?? []).map((id) => pRow(id, true)).filter(Boolean);
  const low = (rec.low ?? []).map((id) => pRow(id, false)).filter(Boolean);
  // Trener bramkarzy: zdanie o bramkarzu
  let gkLine = null;
  const gk = players.filter((p) => p.pos === 'BR').sort((a, b) => b.m - a.m)[0];
  if (rec.gk && gk) {
    const G = numFmt(rec.pr?.g ?? 'approx');
    const judge = ga <= rec.xg[1] - 0.8 ? 'trzymał nas w meczu' : ga >= rec.xg[1] + 1.2 ? 'przy golach mógł zrobić więcej' : 'bez większych błędów';
    gkLine = G.prec === 'vague'
      ? `${rec.gk}, trener bramkarzy: ${gk.n} ${judge}.`
      : `${rec.gk}, trener bramkarzy: ${gk.n}, obrony ${G.cnt(gk.sv)}, stracone gole ${ga}, xG rywala ${G.xg(rec.xg[1])}; ${judge}.`;
  }
  // Rekomendacje z przyciskami (tylko nawigacja)
  const recs = (rec.rec ?? []).map((x) => {
    const to = REC_GO[x.code] ?? null;
    const okPid = !x.pid || game?.world?.players?.[x.pid]?.clubId === game?.clubId;
    return { code: x.code, text: (REC_TXT[x.code] ?? REC_TXT.r_keep)(x, res), go: to && okPid ? { to, id: x.pid ?? null, label: GO_LABEL[to] } : null };
  });
  // Zawodnik do uwagi (poczta, punkt c)
  let noteText = null; let noteGo = null;
  const np = rec.note ? byId.get(rec.note.pid) : null;
  if (np) {
    const rt = F.rating(np.r);
    noteText = rec.note.k === 'down'
      ? `${np.n} zawiódł (${rt ? `ocena ${rt}` : ratingWord(np.r)}): ${playerReason(np, false, F)}.`
      : `${np.n} ${np.on ? 'zaskoczył po wejściu z ławki' : 'wyróżnił się'} (${rt ? `ocena ${rt}` : ratingWord(np.r)}): ${playerReason(np, true, F)}.`;
    const inClub = game?.world?.players?.[np.id]?.clubId === game?.clubId;
    if (inClub) noteGo = rec.note.k === 'down' ? { to: 'talk', id: np.id, label: GO_LABEL.talk } : { to: 'player', id: np.id, label: GO_LABEL.player };
  }
  // Momenty
  const MO = { g: 'gol', gp: 'gol z rzutu karnego', og: 'gol samobójczy', r: 'czerwona kartka', v: 'gol anulowany po analizie VAR', i: 'kontuzja, musiał zejść', pm: 'niewykorzystany rzut karny', s: 'zmiana' };
  const moments = (rec.mo ?? []).map(([min, code, side, name, extra]) => ({
    min, side, code,
    text: code === 's' ? `Zmiana: wchodzi ${name}, schodzi ${extra}` : code === 'og' ? `${MO.og} (${name}), ${side === 0 ? 'dla nas' : 'dla rywala'}`
      : `${cap(MO[code] ?? code)}${name ? `: ${name}` : ''}${code === 'g' && extra ? `, asysta: ${extra}` : ''}${code === 'v' && extra ? ` (${extra})` : ''}`,
  }));
  const by = rec.by ?? { r: 'sztab', n: null };
  const title = ROLE_TITLE[by.r] ?? ROLE_TITLE.sztab;
  const sign = by.n ? `${by.n}, ${title.toLowerCase()}` : title;
  const summary = [verdict, mainText, ...ctxLines.slice(0, 1)].join(' ');
  return {
    verdict, vd, headline, mainText, summary, ctxLines, good, bad, fix, top, low, gkLine, recs, noteText, noteGo, moments,
    from: title, sign, prec: F.prec, precWord: PREC_WORD[F.prec], precT: FT.prec,
  };
}

/** Temat i treść wiadomości (3 punkty, 2 u słabego sztabu). */
export function reportMail(game, rec) {
  const T = reportText(game, rec);
  const [h, a] = rec.home ? rec.score : [rec.score[1], rec.score[0]];
  const subject = `${rec.hN} ${h}:${a} ${rec.aN}: ${T.headline}`;
  const pts = [`- Dlaczego taki wynik: ${T.mainText}`, `- Przed następnym meczem: ${T.recs[0]?.text ?? 'utrzymać plan.'}`];
  if (rec.pts >= 3 && T.noteText) pts.push(`- Zawodnik: ${T.noteText}`);
  const body = [T.verdict, pts.join('\n'), T.gkLine, `Pełna analiza: przycisk niżej albo Kadra, Skład i taktyka, Analizy meczów.\n${T.sign}`].filter(Boolean).join('\n\n');
  const links = [{ to: 'report', id: rec.id, label: GO_LABEL.report }, { to: 'tactics', label: GO_LABEL.tactics }, { to: 'training', label: GO_LABEL.training }];
  if (rec.pts >= 3 && T.noteGo) links.push(T.noteGo);
  return { subject, body, from: T.from, links };
}

/** Wiadomość w poczcie zaraz po meczu (sztab, ważna). Przyciski tylko nawigują: refs.links. */
export function reportMessage(game, rec) {
  const m = reportMail(game, rec);
  return createMessage({
    date: rec.date, key: `analiza:${rec.id}`, category: 'staff', from: m.from, priority: 'important',
    subject: m.subject, body: m.body, refs: { kind: 'matchReport', id: rec.id, links: m.links },
  });
}

/**
 * Po meczu gracza: analiza do archiwum i wiadomość. Zwraca wiadomość albo null (sparing, mecz przerwany,
 * analiza tego meczu już jest).
 */
export function recordMatchReport(game, f, r) {
  if (!wantsReport(game, f) || !r || r.abandoned || !Array.isArray(r.stats)) return null;
  const st = ensureMatchReports(game);
  if (st.list.some((x) => x.id === f.id)) return null;
  const rec = analyzeMatch(game, f, r, st.list);
  st.list = [rec, ...st.list].slice(0, MREP.keep);
  return reportMessage(game, rec);
}

// ------------------------------------------------------------ Archiwum: trendy, powracające problemy, rewanż
/** Średnie statystyk z raportów (wcześniejszych niż rec): ostatnie 5 i sezon; null, gdy meczów mniej niż 3. */
export function statAverages(game, rec) {
  const list = matchReportList(game);
  const i = list.findIndex((x) => x.id === rec.id);
  const before = list.slice(i >= 0 ? i + 1 : 0).filter((x) => x.date <= rec.date);
  const y = Number(rec.date.slice(0, 4)); const m = Number(rec.date.slice(5, 7));
  const from = `${m >= 7 ? y : y - 1}-07-01`;
  const season = before.filter((x) => x.date >= from);
  const avg = (xs) => {
    if (xs.length < MREP.avgFrom) return null;
    const out = {};
    for (const k of ['xg', 'sh', 'sot', 'poss', 'pa', 'co', 'fo', 'off', 'yc']) out[k] = [0, 1].map((s) => xs.reduce((a, x) => a + (Number(x[k]?.[s]) || 0), 0) / xs.length);
    out.g = [0, 1].map((s) => xs.reduce((a, x) => a + (Number(x.score?.[s]) || 0), 0) / xs.length);
    out.n = xs.length;
    return out;
  };
  return { last5: avg(before.slice(0, 5)), season: avg(season) };
}

const BAD_LABEL = {
  b_fin: 'skuteczność', b_xga: 'za dużo sytuacji rywala', b_cheap: 'tanio tracone gole', b_disc: 'faule i kartki', b_off: 'spalone',
  b_red: 'czerwone kartki', b_late: 'słabe końcówki', b_sterile: 'posiadanie bez strzałów', b_pass: 'niedokładne podania',
};
/** Problemy, które wracają: kod „źle” w co najmniej 3 z 5 ostatnich raportów. */
export function recurringProblems(game) {
  const last = matchReportList(game).slice(0, 5);
  return Object.keys(BAD_LABEL).map((code) => ({ code, label: BAD_LABEL[code], n: codeCount(last, code) })).filter((x) => x.n >= MREP.trend).sort((a, b) => b.n - a.n);
}

/** Poprzednia analiza meczu z najbliższym rywalem (przed rewanżem): { fixture, rec } albo null. */
export function rivalReport(game) {
  const next = (game.fixtures ?? []).filter((x) => !x.played && x.comp !== 'friendly' && x.home && x.away && x.date >= game.date && (x.home === game.clubId || x.away === game.clubId))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  const opp = next.home === game.clubId ? next.away : next.home;
  const rec = matchReportList(game).find((x) => x.opp === opp);
  return rec ? { fixture: next, rec } : null;
}
