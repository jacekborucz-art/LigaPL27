// Rozmowa z prezesem przy prośbie „Poproś o zmianę dyrektora” (docs/dyrektor-sportowy.md, rozdz. 12).
// Prezes zadaje 4 pytania (bez danych z co najmniej 6 miesięcy pracy trenera) albo 5 (z danymi): pierwsze z kategorii
// „powody”, ostatnie podchwytliwe, reszta bez powtórzeń i bez dwóch pytań z tej samej kategorii pod rząd. Pula pytań:
// src/data/prezesQuiz.js. Pytanie z danymi (tabela, wyniki z okresu, przepłaty, sprzeciwy, wypożyczenia) wchodzi do
// losowania tylko wtedy, gdy dane są dostępne. Odpowiedź z warunkiem `cond`: prezes zna liczby, więc kłamstwo kosztuje.
// Wynik quizu Q (suma punktów i modyfikatorów cech właściciela) dokłada 0,8 Q do punktacji zarządu (directorScore):
// zgoda od 10, zgoda warunkowa (ponowna ocena po pół roku) od 6, niżej odmowa; Q <= -6 kosztuje dodatkowo 1 punkt
// zaufania. Wybór pytań i kolejność odpowiedzi deterministyczne (ziarno gry, data, klub, liczba próśb). Liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { QUESTIONS, VERDICT_TEXTS } from '../data/prezesQuiz.js';
import { clubById } from '../data/clubs_pl.js';
import { ownerOf } from './owners.js';
import { tablePos } from './board.js';
import { directorOf, severanceOf, expectedWage } from './staffMarket.js';
import { negMean } from './clubNegotiation.js';
import { DIRECTOR_ROLE } from '../training/config.js';
import { ensureRequests, directorScore, requestStatus, zl, placeGoal, askBoard } from './boardRequests.js';
import { compOfClub } from '../season/leagueComps.js';
import { ensureHistory, historySeasons } from '../season/history.js';

export const PQ = {
  mul: 0.8, // S = S_baza + 0,8 Q + los (los jak w directorScore)
  yes: 10, cond: 6, // zgoda od 10, zgoda warunkowa od 6
  badQ: -6, // zły quiz: dodatkowo -1 zaufania
  months: 6, maxMonths: 12, minMatches: 5, maxMatches: 20, // okres danych: od 6 do 12 miesięcy pracy trenera
  goodPpm: 1.6, badPpm: 1.2, farBelow: 4,
  weak: 8, strong: 13, lowTrust: 40, shortDays: 365, longDays: 730, freshDays: 365,
  reviewDays: 182, // zgoda warunkowa: ponowna ocena po pół roku
  dataWeight: 2, // pytania z danymi częściej w środku rozmowy
};

const dayNo = (iso) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 86400000);
const daysBetween = (a, b) => dayNo(b) - dayNo(a);
const plural = (n, a, b, c) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);
const monthsAgo = (iso, m) => { const [y, mo, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 - m, Math.min(d, 28))); return t.toISOString().slice(0, 10); };

/** Staż słownie: „2 lata i 3 miesiące”, „8 miesięcy”, „od niedawna”. */
export function tenureText(from, to) {
  if (!from || !to || from > to) return 'od niedawna';
  const [y1, m1, d1] = from.split('-').map(Number); const [y2, m2, d2] = to.split('-').map(Number);
  const m = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0); // pełne miesiące kalendarzowe
  if (m < 1) return 'od niedawna';
  const y = Math.floor(m / 12); const r = m % 12;
  const ys = `${y} ${plural(y, 'rok', 'lata', 'lat')}`;
  const ms = (n) => `${n} ${plural(n, 'miesiąc', 'miesiące', 'miesięcy')}`;
  if (!y) return ms(m);
  return r ? `${ys} i ${ms(r)}` : ys;
}

/** Ton prezesa z cech właściciela: hot (temperament 13+), biz (zasobność 13+ albo spółka, miliarder), calm. */
export function presidentTone(o) {
  if (!o) return 'calm';
  if ((o.temperament ?? 10) >= 13) return 'hot';
  if ((o.zasobnosc ?? 10) >= 13 || o.type === 'spolka' || o.type === 'miliarder') return 'biz';
  return 'calm';
}

/** Od kiedy trener prowadzi obecny klub (bez klubu: null). */
function coachFrom(game) {
  const h = (game.manager?.history ?? []).filter((x) => x.club === game.clubId && !x.to).pop();
  return h?.from ?? null;
}

/** Mecze ligowe drużyny gracza z okresu (od from do date), z historii wszystkich sezonów i terminarza. */
function leagueMatches(game, from, date) {
  ensureHistory(game);
  const leagues = new Set(['ekstraklasa', 'liga1', 'liga2']);
  const comp = compOfClub(clubById(game.clubId));
  if (comp) leagues.add(comp);
  const seen = new Set(); const out = [];
  const take = (r) => {
    if (!r?.s || seen.has(r.id) || r.d < from || r.d > date) return;
    if (!(leagues.has(r.c) || String(r.c).startsWith('liga3-'))) return;
    if (r.h !== game.clubId && r.a !== game.clubId) return;
    seen.add(r.id); out.push(r);
  };
  for (const k of historySeasons(game)) for (const r of game.history?.m?.[k] ?? []) take(r);
  for (const f of game.fixtures ?? []) if (f.played && f.result?.score) take({ id: f.id, d: f.date, c: f.comp, h: f.home, a: f.away, s: f.result.score });
  return out.sort((x, y) => x.d.localeCompare(y.d));
}

/**
 * Dane rozmowy: dyrektor, właściciel, ton, wartości placeholderów, dostępne dane (needs), kontekst (when) i prawdziwość
 * odpowiedzi (cond). Bez losowania.
 */
export function quizContext(game, date = game.date) {
  const clubId = game.clubId;
  const R = ensureRequests(game);
  const d = game.staff ? directorOf(game, clubId) : null;
  const o = ownerOf(game, clubId) ?? { cierpliwosc: 10, ambicja: 10, temperament: 10, media: 10, zasobnosc: 10, type: 'miasto' };
  const B = game.board ?? {};
  const goal = B.goal ?? null;
  const t = game.fixtures ? tablePos(game, clubId) : { pos: null, played: 0 };
  const sc = directorScore(game, date, { noRand: true });
  const has = new Set();
  const v = {};
  const club = clubById(clubId);
  v.klub = club?.name ?? clubId;
  const pr = game.manager?.profile;
  v.trener = `${pr?.firstName ?? ''} ${pr?.lastName ?? ''}`.trim() || 'Trener';
  v.zaufanie = String(Math.round(B.trust ?? 50)); has.add('trust');
  if (d) {
    has.add('director');
    v.dyrektor = d.name;
    v.staz = tenureText(d.since, date);
    v.odprawa = zl(severanceOf(d, date));
    v.pensjaNowego = zl(expectedWage({ role: DIRECTOR_ROLE, q: clamp(Math.round(negMean(clubId)), 1, 20), nat: 'POL' }, null, { club: clubId }));
  }
  if (t.played >= 4 && t.pos) { has.add('table'); v.miejsce = String(t.pos); }
  if (goal?.target) { has.add('goal'); v.cel = placeGoal(goal.target); }
  // Okres danych: od 6 do 12 miesięcy pracy trenera w klubie
  const from0 = coachFrom(game);
  const tenure = from0 ? daysBetween(from0, date) : 0;
  const months = Math.min(PQ.maxMonths, Math.floor(tenure / 30.44));
  let form = null;
  if (months >= PQ.months) {
    const from = monthsAgo(date, months) < from0 ? from0 : monthsAgo(date, months);
    const all = leagueMatches(game, from, date);
    const ms = all.slice(-PQ.maxMatches);
    if (ms.length >= PQ.minMatches) {
      let w = 0; let dr = 0; let l = 0;
      for (const r of ms) {
        const me = r.h === clubId ? 0 : 1;
        const gf = r.s[me]; const ga = r.s[1 - me];
        if (gf > ga) w++; else if (gf === ga) dr++; else l++;
      }
      const pts = 3 * w + dr;
      form = { from, months, n: ms.length, w, d: dr, l, pts, ppm: pts / ms.length };
      has.add('form6m');
      v.okres = `${months} ${plural(months, 'miesiąc', 'miesiące', 'miesięcy')}`;
      v.punkty = `${pts} ${plural(pts, 'punkt', 'punkty', 'punktów')}`;
      v.mecze = String(ms.length);
      v.bilans = `${w} ${plural(w, 'zwycięstwo', 'zwycięstwa', 'zwycięstw')}, ${dr} ${plural(dr, 'remis', 'remisy', 'remisów')}, ${l} ${plural(l, 'porażka', 'porażki', 'porażek')}`;
    }
  }
  // Przepłaty i sprzeciwy dyrektora z okresu (game.board.requests.dirLog), wypożyczenia (historia rynku)
  const since = form?.from ?? (months >= PQ.months ? monthsAgo(date, months) : null);
  const inPeriod = (x) => since && x.date >= since && x.date <= date;
  const log = (R.dirLog ?? []).filter(inPeriod);
  const over = log.filter((e) => e.kind === 'buy' && e.action !== 'back' && e.result !== 'quit');
  const insist = log.filter((e) => e.action === 'insist').length;
  if (since && over.length) {
    has.add('overpay6m');
    v.przeplata = String(over.length);
    v.przeplataKwota = zl(over.reduce((s, e) => s + Math.max(0, (e.fee ?? 0) - (e.ref ?? 0)), 0));
  }
  if (since && log.length) {
    has.add('objections6m');
    v.sprzeciwy = log.length === 1 ? 'raz' : `${log.length} razy`;
    v.naleganie = insist === 0 ? 'ani razu' : insist === 1 ? 'raz' : `${insist} razy`;
  }
  const loans = since ? (game.market?.history ?? []).filter((h) => h.kind === 'loan' && h.from === clubId && inPeriod(h)).length : 0;
  if (loans) { has.add('loans6m'); v.wypozyczenia = `${loans} ${plural(loans, 'wypożyczenie', 'wypożyczenia', 'wypożyczeń')}`; }
  const dirQ = d?.q ?? 10;
  const pos = has.has('table') ? t.pos : null;
  const target = goal?.target ?? null;
  const above = pos != null && target != null && pos <= target;
  const below = pos != null && target != null && pos > target;
  const money = sc.parts?.money ?? 0;
  const when = {
    directorWeak: !!d && dirQ <= PQ.weak,
    directorStrong: !!d && dirQ >= PQ.strong,
    coachShort: tenure < PQ.shortDays,
    coachLong: tenure >= PQ.longDays,
    hadObjections: log.length > 0,
    belowGoal: below,
    aboveGoal: above,
    directorFresh: !!d?.since && daysBetween(d.since, date) < PQ.freshDays,
    lowTrust: (B.trust ?? 50) < PQ.lowTrust,
    richClub: money >= 0,
    poorClub: money < 0,
  };
  const cond = {
    ...when,
    farBelowGoal: below && pos - target >= PQ.farBelow,
    // Forma z okresu; bez danych z okresu: miejsce wobec celu (prezes patrzy na tabelę)
    goodForm: form ? form.ppm >= PQ.goodPpm : above,
    badForm: form ? form.ppm < PQ.badPpm : below,
    hadOverpay: over.length > 0,
    noOverpay: over.length === 0,
    hadLoans: loans > 0,
  };
  return { d, o, tone: presidentTone(o), values: v, has, when, cond, form, base: sc };
}

/** Czy pytanie może paść (wszystkie dane z needs dostępne, wszystkie warunki when prawdziwe). */
export const questionFits = (q, ctx) => (q.needs ?? []).every((k) => ctx.has.has(k)) && (q.when ?? []).every((k) => ctx.when[k]);
const isData = (q) => (q.needs ?? []).some((k) => ['table', 'form6m', 'overpay6m', 'objections6m', 'loans6m'].includes(k));

/** Tekst z placeholderami {nazwa} (brakująca wartość: zostaje pusta). */
export function fillText(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
}

/** Liczba próśb o zmianę dyrektora do ziarna (każda kolejna rozmowa to nowe pytania). */
const requestCount = (game) => (ensureRequests(game).log ?? []).filter((e) => e.type === 'director').length;

/**
 * Dobór pytań: 5 z danymi z co najmniej 6 miesięcy, 4 bez nich. Pierwsze „powody”, ostatnie „haczyk”, środek bez
 * powtórzeń i bez tej samej kategorii pod rząd (pytania z danymi częściej). Zwraca listę { id, order } (order:
 * kolejność odpowiedzi na ekranie).
 */
export function pickQuestions(ctx, rng) {
  const ok = QUESTIONS.filter((q) => questionFits(q, ctx));
  const n = ctx.has.has('form6m') ? 5 : 4;
  const draw = (list) => (list.length ? rng.weighted(list, (q) => (isData(q) ? PQ.dataWeight : 1)) : null);
  const first = draw(ok.filter((q) => q.cat === 'powody'));
  const last = draw(ok.filter((q) => q.cat === 'haczyk'));
  const mid = [];
  let prev = first?.cat ?? null;
  const pool = ok.filter((q) => q.cat !== 'powody' && q.cat !== 'haczyk');
  while (mid.length < n - 2) {
    const left = pool.filter((q) => !mid.includes(q));
    if (!left.length) break;
    const other = left.filter((q) => q.cat !== prev);
    const q = draw(other.length ? other : left);
    mid.push(q); prev = q.cat;
  }
  return [first, ...mid, last].filter(Boolean).map((q) => {
    const order = q.answers.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
    return { id: q.id, order };
  });
}

/**
 * Początek rozmowy (klik „Poproś o zmianę”). Zwraca { ok: false, text } (prośba niedostępna) albo { ok: true, quiz }.
 * quiz to zwykły obiekt (stan okna, nie zapis gry): { date, candidate, tone, qs, i, picks, step }.
 */
export function startQuiz(game, { candidate = null, date = game.date } = {}) {
  if (!game.finance?.clubs?.[game.clubId] || !game.staff || !game.board) return { ok: false, text: 'Brak danych klubu.' };
  const st = requestStatus(game, 'director', date);
  if (!st.ok) return { ok: false, text: st.text };
  const ctx = quizContext(game, date);
  if (!ctx.d) return { ok: false, text: 'Klub nie ma teraz dyrektora sportowego: zarząd szuka go sam.' };
  const rng = new Rng(`prezes-quiz:${game.seed}:${date}:${game.clubId}:${requestCount(game)}`);
  const qs = pickQuestions(ctx, rng);
  return { ok: true, quiz: { v: 1, date, candidate: candidate || null, tone: ctx.tone, owner: ctx.o.name, qs, i: 0, picks: [], step: 'ask' } };
}

const qById = new Map(QUESTIONS.map((q) => [q.id, q]));

/** Modyfikator odpowiedzi z cech właściciela: suma v x clamp((cecha - 10) / 5, -1, 1). */
export function traitMod(traits, o) {
  return Object.entries(traits ?? {}).reduce((s, [k, v]) => s + v * clamp(((o?.[k] ?? 10) - 10) / 5, -1, 1), 0);
}

/** Punkty odpowiedzi (z warunkiem cond i cechami właściciela) i reakcja prezesa. */
export function scoreAnswer(a, ctx) {
  const truth = a.cond ? !!ctx.cond[a.cond.is] : true;
  const base = truth ? a.score : a.cond.else;
  const mod = traitMod(a.traits, ctx.o);
  return { points: Math.round((base + mod) * 100) / 100, truth, reaction: !truth && a.reactionElse ? a.reactionElse : a.reaction };
}

/** Bieżące pytanie: tekst w tonie prezesa i odpowiedzi w kolejności z ekranu. Null, gdy pytań już nie ma. */
export function quizQuestion(game, quiz, ctx = quizContext(game, quiz.date)) {
  const item = quiz.qs[quiz.i];
  const q = item && qById.get(item.id);
  if (!q) return null;
  return {
    id: q.id, cat: q.cat, n: quiz.i + 1, of: quiz.qs.length,
    ask: fillText(q.ask[quiz.tone] ?? q.ask.calm, ctx.values),
    answers: item.order.map((k) => ({ k, text: fillText(q.answers[k].text, ctx.values) })),
  };
}

/** Odpowiedź trenera (k: indeks odpowiedzi w puli pytania). Zwraca nowy stan quizu z reakcją prezesa. */
export function answerQuiz(game, quiz, k) {
  const ctx = quizContext(game, quiz.date);
  const item = quiz.qs[quiz.i];
  const q = item && qById.get(item.id);
  const a = q?.answers?.[Number(k)];
  if (!a || quiz.step !== 'ask') return quiz;
  const r = scoreAnswer(a, ctx);
  const picks = [...quiz.picks, { id: q.id, k: Number(k), ask: fillText(q.ask[quiz.tone] ?? q.ask.calm, ctx.values), text: fillText(a.text, ctx.values), reaction: r.reaction, points: r.points }];
  const i = quiz.i + 1;
  return { ...quiz, picks, i, step: i >= quiz.qs.length ? 'end' : 'ask' };
}

/** Wynik quizu Q: suma punktów odpowiedzi (z cechami właściciela). */
export const quizQ = (quiz) => Math.round(quiz.picks.reduce((s, p) => s + p.points, 0) * 100) / 100;

/**
 * Decyzja zarządu po rozmowie: prośba do zarządu z wynikiem quizu (boardRequests.askBoard). Zwraca nowy stan quizu
 * z wynikiem { verdict, text, say (słowa prezesa w jego tonie), Q, S }.
 */
export function finishQuiz(game, quiz) {
  if (quiz.step !== 'end' || quiz.result) return quiz;
  const Q = quizQ(quiz);
  const r = askBoard(game, 'director', 0, quiz.date, { candidate: quiz.candidate, quiz: { Q } });
  if (!r.ok) return { ...quiz, step: 'done', result: { verdict: 'no', text: r.text, say: '', Q, S: null, failed: true } };
  const list = VERDICT_TEXTS[r.verdict]?.[quiz.tone] ?? VERDICT_TEXTS[r.verdict]?.calm ?? [''];
  const say = list[new Rng(`prezes-werdykt:${game.seed}:${quiz.date}:${r.verdict}`).int(0, list.length - 1)];
  return { ...quiz, step: 'done', result: { verdict: r.verdict, text: r.text, say, Q, S: r.entry?.S ?? null } };
}
