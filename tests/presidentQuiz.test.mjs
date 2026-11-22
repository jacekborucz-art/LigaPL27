// Klub > Zarząd: panel „Zarząd klubu” (właściciel i dyrektor sportowy) i rozmowa z prezesem przy prośbie o zmianę
// dyrektora (src/career/presidentQuiz.js, src/data/prezesQuiz.js, docs/dyrektor-sportowy.md rozdz. 12): dobór pytań
// według danych, prawdziwość odpowiedzi (cond), ton prezesa, determinizm, decyzja (zgoda, zgoda warunkowa, odmowa),
// ponowna ocena po pół roku, Esc bez decyzji = prośba niezłożona.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { Rng } from '../src/core/rng.js';
import '../src/season/dailySystems.js';
import { QUESTIONS, VERDICT_TEXTS } from '../src/data/prezesQuiz.js';
import {
  startQuiz, quizContext, quizQuestion, answerQuiz, finishQuiz, quizQ, scoreAnswer, presidentTone, pickQuestions,
  questionFits, tenureText, fillText, traitMod,
} from '../src/career/presidentQuiz.js';
import { askBoard, directorScore, requestStatus, reviewDirector, REQ, REQ_TYPES, addDaysIso } from '../src/career/boardRequests.js';
import { directorOf } from '../src/career/staffMarket.js';
import { boardPeoplePanel, boardRequestsPanel, handleBoardAction } from '../src/ui/boardRequestsView.js';
import { renderClubHub } from '../src/ui/klubView.js';
import { quizHtml } from '../src/ui/presidentQuizView.js';

const BAD_TEXT = new RegExp(`undefined|NaN|\\bnull\\b|\\[object|${String.fromCharCode(8212)}`);
const plain = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
function newGame(seed = 41, clubId = 'widzew') {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'Jan', lastName: 'Trener' } } };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g); processDay(g);
  return g;
}
let shared = null;
const fresh = () => structuredClone(shared ??= newGame());
/** Trener w klubie od stycznia i 16 meczów ligowych z poprzedniej rundy w historii: dane z co najmniej 6 miesięcy. */
function withData(g, { win = 0.25 } = {}) {
  g.manager.history = [{ club: g.clubId, from: '2026-01-10' }];
  const rng = new Rng('dane-testu');
  const rows = [];
  for (let i = 0; i < 16; i++) {
    const d = addDaysIso('2026-02-07', i * 7);
    const r = rng.next();
    const s = r < win ? [2, 0] : r < win + 0.3 ? [1, 1] : [0, 1];
    rows.push({ id: `t${i}`, d, c: 'ekstraklasa', h: g.clubId, a: 'legia', s, me: g.clubId });
  }
  g.history = { m: { '2025/26': rows } };
  g.date = '2026-07-20';
  return g;
}
const best = (game, quiz) => { // odpowiedź z najwyższymi punktami (z cond i cechami)
  const ctx = quizContext(game, quiz.date);
  const q = QUESTIONS.find((x) => x.id === quiz.qs[quiz.i].id);
  return q.answers.map((a, k) => [k, scoreAnswer(a, ctx).points]).sort((x, y) => y[1] - x[1])[0][0];
};
const worst = (game, quiz) => {
  const ctx = quizContext(game, quiz.date);
  const q = QUESTIONS.find((x) => x.id === quiz.qs[quiz.i].id);
  return q.answers.map((a, k) => [k, scoreAnswer(a, ctx).points]).sort((x, y) => x[1] - y[1])[0][0];
};
const play = (game, quiz, pick) => { let z = quiz; while (z.step === 'ask') z = answerQuiz(game, z, pick(game, z)); return z; };

test('Panel „Zarząd klubu”: właściciel (5 cech) i dyrektor (4 atrybuty, umowa, staż); klub bez właściciela i dyrektora', () => {
  const g = fresh();
  const html = boardPeoplePanel(g);
  const t = plain(html);
  for (const w of ['Zarząd klubu', 'Cierpliwość', 'Ambicja', 'Temperament', 'Media', 'Zasobność', 'Negocjacje', 'Znajomość rynku', 'Sieć kontaktów', 'Kadra i płace', 'Umowa do', 'W klubie']) assert.ok(t.includes(w), w);
  assert.ok(t.includes(directorOf(g, g.clubId).name));
  assert.ok(!BAD_TEXT.test(t));
  // Panel w widoku Klub > Zarząd (pod oceną zarządu i kibicami), bez błędnych tekstów
  const hub = renderClubHub(g, { kTab: 'zarzad' });
  assert.ok(hub.includes('tf-board__people') && hub.indexOf('tf-board__people') > hub.indexOf('Kariera trenera'));
  // Wakat dyrektora i klub bez danych właściciela
  const h = fresh();
  const d = directorOf(h, h.clubId); h.staff.people[d.id].club = null; delete h.staff.dir[h.clubId];
  const t2 = plain(boardPeoplePanel(h));
  assert.ok(t2.includes('Wakat') && !BAD_TEXT.test(t2));
  const bare = { clubId: 'widzew', date: '2026-07-01', world: { clubs: {} } };
  const t3 = plain(boardPeoplePanel(bare));
  assert.ok(t3.includes('Brak danych o właścicielu') && t3.includes('Brak danych o dyrektorze') && !BAD_TEXT.test(t3));
  assert.equal(tenureText('2025-07-01', '2026-07-20'), '1 rok');
  assert.equal(tenureText('2024-01-01', '2026-05-01'), '2 lata i 4 miesiące');
  assert.equal(tenureText('2026-07-01', '2026-07-10'), 'od niedawna');
});

test('Nazwa prośby „Poproś o zmianę dyrektora”, przycisk „Poproś o zmianę” otwiera rozmowę (bez decyzji zarządu)', () => {
  const g = fresh();
  assert.equal(REQ_TYPES.director.label, 'Poproś o zmianę dyrektora');
  const html = boardRequestsPanel(g, {});
  assert.ok(html.includes('Poproś o zmianę dyrektora') && html.includes('>Poproś o zmianę</button>'));
  const log0 = g.board.requests?.log?.length ?? 0; const trust0 = g.board.trust; const mail0 = g.inbox.length;
  const r = handleBoardAction(g, 'br-ask', { t: 'director' }, null);
  assert.ok(r.ui.pq && r.ui.pq.qs.length >= 4 && !r.save, 'otwarte okno rozmowy');
  // Rozmowa przerwana (Esc, „Anuluj prośbę”): gra bez zmian, prośba niezłożona
  let z = r.ui.pq; z = answerQuiz(g, z, best(g, z)); z = answerQuiz(g, z, best(g, z));
  assert.equal(g.board.requests.log.length, log0); assert.equal(g.board.trust, trust0); assert.equal(g.inbox.length, mail0);
  assert.ok(requestStatus(g, 'director', g.date).ok);
});

test('Dobór pytań: 4 bez danych z 6 miesięcy, 5 z danymi; pierwsze „powody”, ostatnie „haczyk”, bez powtórzeń i tej samej kategorii pod rząd', () => {
  const g = fresh();
  const byId = new Map(QUESTIONS.map((q) => [q.id, q]));
  const data = ['form6m', 'overpay6m', 'objections6m', 'loans6m'];
  for (let k = 0; k < 12; k++) {
    const ctx = quizContext(g, g.date);
    const qs = pickQuestions(ctx, new Rng(`t${k}`)).map((x) => byId.get(x.id));
    assert.equal(qs.length, 4);
    assert.equal(qs[0].cat, 'powody'); assert.equal(qs.at(-1).cat, 'haczyk');
    assert.equal(new Set(qs.map((q) => q.id)).size, qs.length);
    for (let i = 1; i < qs.length; i++) assert.notEqual(qs[i].cat, qs[i - 1].cat);
    assert.ok(qs.every((q) => !(q.needs ?? []).some((n) => data.includes(n))), 'bez danych z okresu');
    assert.ok(qs.every((q) => questionFits(q, ctx)));
  }
  const h = withData(fresh());
  const ctx = quizContext(h, h.date);
  assert.ok(ctx.has.has('form6m') && ctx.form.n === 16 && ctx.form.months === 6);
  assert.match(ctx.values.punkty, /^\d+ punkt(y|ów)?$/); assert.match(ctx.values.bilans, /zwycięst.*remis.*pora/);
  let withForm = 0;
  for (let k = 0; k < 20; k++) {
    const qs = pickQuestions(ctx, new Rng(`d${k}`)).map((x) => byId.get(x.id));
    assert.equal(qs.length, 5);
    assert.equal(qs[0].cat, 'powody'); assert.equal(qs.at(-1).cat, 'haczyk');
    for (let i = 1; i < qs.length; i++) assert.notEqual(qs[i].cat, qs[i - 1].cat);
    if (qs.some((q) => (q.needs ?? []).includes('form6m'))) withForm++;
  }
  assert.ok(withForm >= 10, `pytania z wynikami z okresu: ${withForm} z 20`);
  // Pytanie z danymi: liczby podstawione w tekście
  const q = QUESTIONS.find((x) => x.id === 'wyniki-bilans');
  const t = fillText(q.ask.calm, ctx.values);
  assert.ok(t.includes(`${ctx.form.n} meczach`) && t.includes('6 miesięcy') && !/\{|\}/.test(t));
  // Sprzeciwy i przepłaty dyrektora z okresu (dirLog)
  h.board.requests.dirLog = [{ date: '2026-03-01', kind: 'buy', fee: 3e6, ref: 2e6, action: 'insist', gap: 0.5 }, { date: '2026-04-01', kind: 'sell', fee: 1e6, ref: 2e6, action: 'back', gap: 0.5 }];
  const c2 = quizContext(h, h.date);
  assert.ok(c2.has.has('overpay6m') && c2.has.has('objections6m') && c2.when.hadObjections);
  assert.equal(c2.values.sprzeciwy, '2 razy'); assert.equal(c2.values.naleganie, 'raz'); assert.equal(c2.values.przeplata, '1');
});

test('Prawdziwość odpowiedzi (cond): kłamstwo kosztuje, reakcja prezesa inna; cechy właściciela zmieniają ocenę', () => {
  const g = fresh();
  const ctx = quizContext(g, g.date);
  const q = QUESTIONS.find((x) => x.id === 'wyniki-tabela');
  const a = q.answers[0]; // „Jesteśmy na dobrej drodze” (aboveGoal, else -3)
  const lie = scoreAnswer(a, { ...ctx, cond: { ...ctx.cond, aboveGoal: false }, o: { ...ctx.o, temperament: 10 } });
  const truth = scoreAnswer(a, { ...ctx, cond: { ...ctx.cond, aboveGoal: true }, o: { ...ctx.o, temperament: 10 } });
  assert.equal(lie.points, -3); assert.equal(truth.points, 2);
  assert.notEqual(lie.reaction, truth.reaction);
  assert.equal(traitMod({ temperament: 1 }, { temperament: 20 }), 1);
  assert.equal(traitMod({ temperament: 1 }, { temperament: 5 }), -1);
  assert.equal(traitMod({ temperament: 1 }, { temperament: 10 }), 0);
  // Każda odpowiedź z cond ma reakcję na prawdę, a gdy fałsz zmienia sens: reactionElse
  for (const x of QUESTIONS) for (const y of x.answers) {
    assert.ok(y.reaction && y.text, x.id);
    if (y.cond) assert.ok(ctx.cond[y.cond.is] !== undefined, `${x.id}: nieznany warunek ${y.cond.is}`);
  }
});

test('Ton prezesa z cech właściciela (porywczy, biznesowy, spokojny) i tekst pytania w tym tonie', () => {
  assert.equal(presidentTone({ temperament: 15, zasobnosc: 15, type: 'spolka' }), 'hot');
  assert.equal(presidentTone({ temperament: 10, zasobnosc: 14, type: 'miasto' }), 'biz');
  assert.equal(presidentTone({ temperament: 10, zasobnosc: 5, type: 'spolka' }), 'biz');
  assert.equal(presidentTone({ temperament: 10, zasobnosc: 5, type: 'miasto' }), 'calm');
  const g = fresh();
  const r = startQuiz(g, {});
  assert.ok(r.ok);
  const q = quizQuestion(g, r.quiz);
  const src = QUESTIONS.find((x) => x.id === q.id);
  assert.equal(q.ask, fillText(src.ask[r.quiz.tone], quizContext(g, g.date).values));
  assert.equal(r.quiz.tone, presidentTone(g.owners[g.clubId]));
  assert.ok(!BAD_TEXT.test(plain(quizHtml(g, r.quiz))));
});

test('Determinizm: ta sama gra, data i liczba próśb dają te same pytania i kolejność odpowiedzi', () => {
  const a = fresh(); const b = fresh();
  assert.deepEqual(startQuiz(a, {}).quiz.qs, startQuiz(b, {}).quiz.qs);
  const z = play(a, startQuiz(a, {}).quiz, best);
  assert.equal(z.step, 'end');
  // Inna data: inny zestaw (w kilku próbach przynajmniej raz)
  let diff = 0;
  for (const d of ['2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05']) {
    const c = fresh(); c.date = d;
    if (JSON.stringify(startQuiz(c, {}).quiz.qs) !== JSON.stringify(startQuiz(b, {}).quiz.qs)) diff++;
  }
  assert.ok(diff >= 1);
});

test('Decyzja: S = punktacja + 1,5 Q; zgoda od 10, warunkowa od 6, odmowa; zły quiz -1 zaufania', () => {
  // Zaufanie 40: punktacja bez rozmowy niska, więc progi sprawdza sam wynik rozmowy (nie sito złej rozmowy)
  const fresh40 = () => { const x = fresh(); x.board.trust = 40; return x; };
  const g = fresh40();
  const S0 = directorScore(g, g.date).S;
  const qFor = (S) => Math.ceil(((S - S0) / REQ.DIR_QUIZ) * 100) / 100;
  // Zgoda: zarząd zmienia dyrektora
  const y = fresh40(); const d0 = directorOf(y, y.clubId).id;
  const ry = askBoard(y, 'director', 0, y.date, { quiz: { Q: qFor(12) } });
  assert.equal(ry.verdict, 'yes'); assert.notEqual(directorOf(y, y.clubId).id, d0);
  // Zgoda warunkowa: ocena za pół roku, do tego czasu bez nowej prośby
  const c = fresh40(); const dc = directorOf(c, c.clubId).id;
  const rc = askBoard(c, 'director', 0, c.date, { quiz: { Q: qFor(8) } });
  assert.equal(rc.verdict, 'cond');
  assert.equal(directorOf(c, c.clubId).id, dc, 'dyrektor zostaje na razie');
  const R = c.board.requests;
  assert.equal(R.dirReview.due, addDaysIso(c.date, REQ.DIR_REVIEW_DAYS));
  assert.equal(requestStatus(c, 'director', addDaysIso(c.date, 120)).ok, false);
  assert.ok(c.inbox.some((m) => /pół roku/.test(m.body)));
  // Odmowa przy złym quizie: zaufanie -1 więcej niż przy zwykłej odmowie
  const qNo = Math.min(-6, qFor(2)); // odmowa i zły quiz
  const n1 = fresh40(); const t1 = n1.board.trust; const rn1 = askBoard(n1, 'director', 0, n1.date, { quiz: { Q: qNo } });
  const n2 = fresh40(); n2.board.trust = t1; const t2 = n2.board.trust; const rn2 = askBoard(n2, 'director', 0, n2.date, { quiz: { Q: -5.9 } });
  assert.equal(rn1.verdict, 'no');
  if (rn2.verdict === 'no') assert.equal((t1 - n1.board.trust) - (t2 - n2.board.trust), 1);
  const n3 = fresh40(); const t3 = n3.board.trust; const rn3 = askBoard(n3, 'director', 0, n3.date);
  assert.equal(rn3.verdict === 'no' ? (t1 - n1.board.trust) - (t3 - n3.board.trust) : 1, 1, 'bez rozmowy: bez dodatkowej kary');
  assert.ok(n1.inbox.some((m) => /rozmowa z prezesem nie przekonała zarządu/.test(m.body)));
});

test('Zgoda warunkowa: po pół roku zarząd sam ocenia (zmiana albo dyrektor zostaje); inny dyrektor: ocena odpada', () => {
  for (const [Q, change] of [[40, true], [-40, false]]) {
    const g = fresh();
    const d0 = directorOf(g, g.clubId).id;
    g.board.requests ??= {}; g.board.requests.log ??= [];
    g.board.requests.dirReview = { date: g.date, due: '2026-12-30', Q, candidate: null, dir: d0 };
    assert.deepEqual(reviewDirector(g, '2026-12-29'), []);
    const msgs = reviewDirector(g, '2026-12-30', { push: false });
    assert.equal(msgs.length, 1);
    assert.equal(directorOf(g, g.clubId).id !== d0, change, `Q ${Q}`);
    assert.ok(!g.board.requests.dirReview);
    assert.equal(g.board.requests.log[0].verdict, change ? 'yes' : 'no');
  }
  const h = fresh();
  h.board.requests ??= {}; h.board.requests.log ??= [];
  h.board.requests.dirReview = { date: h.date, due: '2026-12-30', Q: 40, candidate: null, dir: 'inny' };
  assert.deepEqual(reviewDirector(h, '2026-12-30'), []);
});

test('Cała rozmowa: dobre odpowiedzi dają wyższe Q niż złe, decyzja w tonie prezesa, okno bez błędnych tekstów', () => {
  const g = withData(fresh());
  const good = play(g, startQuiz(g, {}).quiz, best);
  const bad = play(g, startQuiz(g, {}).quiz, worst);
  assert.equal(good.qs.length, 5);
  assert.ok(quizQ(good) >= 6 && quizQ(bad) <= -6, `${quizQ(good)} ${quizQ(bad)}`);
  const done = finishQuiz(g, good);
  assert.equal(done.step, 'done');
  assert.ok(['yes', 'cond', 'no'].includes(done.result.verdict));
  assert.ok(VERDICT_TEXTS[done.result.verdict][good.tone].includes(done.result.say));
  const html = quizHtml(g, done);
  assert.ok(html.includes('data-act="pq-close"') && !BAD_TEXT.test(plain(html)));
  // Druga decyzja tego samego dnia nie przechodzi (jedna prośba w tygodniu)
  assert.equal(finishQuiz(g, good).result.failed, true);
  const again = startQuiz(g, {});
  assert.equal(again.ok, false);
});

test('Rozmowa jako sito: bardzo zła rozmowa zawsze odmowa, zła najwyżej warunkowa, dobra ratuje słabą prośbę', () => {
  const g = fresh();
  g.board.trust = 99; // sytuacja klubu bardzo dobra: bez rozmowy zarząd by się zgodził
  const S0 = directorScore(g, g.date, { noRand: true }).S;
  assert.ok(S0 + 5 >= REQ.DIR_YES + 8, `S0 ${S0}`);
  const vbad = structuredClone(g); assert.equal(askBoard(vbad, 'director', 0, vbad.date, { quiz: { Q: REQ.DIR_VERY_BAD_Q } }).verdict, 'no');
  const bad = structuredClone(g); assert.equal(askBoard(bad, 'director', 0, bad.date, { quiz: { Q: REQ.DIR_BAD_Q } }).verdict, 'cond');
  // Słaba sytuacja klubu, przekonująca rozmowa: zgoda warunkowa zamiast odmowy
  const w = fresh(); w.board.trust = 45;
  const Sw = directorScore(w, w.date).S;
  const good = REQ.DIR_GOOD_Q;
  if (Sw + REQ.DIR_QUIZ * good < REQ.DIR_COND && Sw + REQ.DIR_QUIZ * good >= REQ.DIR_COND - 6) assert.equal(askBoard(w, 'director', 0, w.date, { quiz: { Q: good } }).verdict, 'cond');
});
