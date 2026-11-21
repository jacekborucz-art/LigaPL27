// Prośby do zarządu i weto zarządu (src/career/boardRequests.js, src/ui/boardRequestsView.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import {
  ensureRequests, requestStatus, askBoard, verdictOf, requestScore, checkConditions, aiBudgetRequests,
  boardCaps, contractIssues, feeIssues, maxYearsFor, ownerScale, appealVeto, appealStatus, lowerGoal, goalTextFor,
  fitOfferToCaps, REQ,
} from '../src/career/boardRequests.js';
import { offerForPlayer } from '../src/career/transfers.js';
import { aiNegotiate } from '../src/career/negotiation.js';
import { negotiationLimits } from '../src/ui/transfersView.js';
import { startNegotiation, handleNegotiationAction, renderNegotiation } from '../src/ui/negotiationView.js';
import { boardRequestsPanel, handleBoardAction } from '../src/ui/boardRequestsView.js';
import { SEASON_YEAR } from '../src/config/calendar2026.js';
import { LEAGUE_COMPS } from '../src/season/leagueComps.js';
import { renderClubHub } from '../src/ui/klubView.js';
import { Rng } from '../src/core/rng.js';
import '../src/season/dailySystems.js';

function newGame(clubId = 'widzew', seed = 21) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  return g;
}
const BASE = { widzew: newGame('widzew'), legia: newGame('legia') };
const fresh = (club = 'widzew') => structuredClone(BASE[club]);
const boardMail = (g) => g.inbox.filter((m) => m.from === 'Zarząd klubu');
const noDash = (s) => !s.includes('\u2014');

test('Stary zapis: stan próśb tworzy się leniwie', () => {
  const g = fresh();
  delete g.board.requests;
  const R = ensureRequests(g);
  assert.deepEqual(R.log, []);
  assert.deepEqual(R.conds, []);
  assert.deepEqual(R.vetoes, []);
  assert.equal(R.appeals.count, 0);
  assert.equal(g.board.requests, R);
});

test('Progi werdyktu: zgoda, częściowa, warunek, odmowa', () => {
  assert.equal(verdictOf(25).verdict, 'yes');
  assert.equal(verdictOf(20).verdict, 'yes');
  const p = verdictOf(12.5);
  assert.equal(p.verdict, 'partial');
  assert.ok(Math.abs(p.share - 0.55) < 1e-9);
  assert.equal(verdictOf(5).share, 0.3);
  assert.equal(verdictOf(0).verdict, 'cond');
  assert.equal(verdictOf(-10).verdict, 'cond');
  assert.equal(verdictOf(-10.1).verdict, 'no');
});

test('Budżety tylko w oknie albo 30 dni przed nim; cel tylko przed 1 listopada', () => {
  const g = fresh();
  assert.ok(requestStatus(g, 'transfer', '2026-07-10').ok);
  const sep = requestStatus(g, 'transfer', '2026-09-15');
  assert.equal(sep.ok, false);
  assert.equal(sep.from, '2027-01-02'); // 30 dni przed oknem zimowym (1 lutego)
  assert.ok(requestStatus(g, 'wage', '2027-01-10').ok);
  assert.ok(requestStatus(g, 'goal', '2026-10-31').ok);
  assert.equal(requestStatus(g, 'goal', '2026-11-01').ok, false);
});

test('Decyzja jest deterministyczna (ziarno gry, data, rodzaj)', () => {
  const a = fresh(); const b = fresh();
  const ra = askBoard(a, 'transfer', 3_000_000, '2026-07-10');
  const rb = askBoard(b, 'transfer', 3_000_000, '2026-07-10');
  assert.equal(ra.verdict, rb.verdict);
  assert.equal(ra.granted, rb.granted);
  assert.equal(ra.entry.S, rb.entry.S);
});

test('Zgoda: budżet rośnie, list zarządu w poczcie, ponad 20 % budżetu podnosi cel o miejsce', () => {
  const g = fresh();
  g.board.trust = 100;
  const c = g.finance.clubs.widzew;
  const before = c.transferBudget;
  const target = g.board.goal.target;
  const amount = Math.round(before * 0.25 / 10000) * 10000;
  const r = askBoard(g, 'transfer', amount, '2026-07-10');
  assert.equal(r.verdict, 'yes', `S=${r.entry.S}`);
  assert.equal(c.transferBudget, before + amount);
  assert.equal(g.board.goal.target, Math.max(1, target - 1));
  const mail = boardMail(g)[0];
  assert.ok(mail, 'list zarządu');
  assert.equal(mail.category, 'board');
  assert.match(mail.body, /^Panie Trenerze, /);
  assert.match(mail.body, /Zarząd klubu\.$/);
  assert.match(mail.body, /Pieniądze zobowiązują/);
  assert.ok(noDash(mail.body));
});

test('Limity częstotliwości: tydzień, miesiąc, blokada po odmowie', () => {
  const g = fresh('legia');
  g.board.trust = 0;
  const c = g.finance.clubs.legia;
  const r = askBoard(g, 'transfer', Math.round(c.transferBudget * 0.5 / 10000) * 10000, '2026-07-10');
  assert.equal(r.verdict, 'no', `S=${r.entry.S}`);
  assert.equal(g.board.trust, 0);
  const week = askBoard(g, 'goal', 0, '2026-07-12');
  assert.equal(week.ok, false);
  assert.match(week.text, /jedną prośbę w tygodniu/);
  const same = requestStatus(g, 'transfer', '2026-08-20');
  assert.equal(same.ok, false);
  assert.equal(same.from, '2026-09-08'); // 60 dni po odmowie
  // Trzy prośby w miesiącu
  const h = fresh('legia');
  ensureRequests(h).log.push({ date: '2026-07-01', type: 'goal', verdict: 'no' }, { date: '2026-07-02', type: 'goal', verdict: 'no' }, { date: '2026-07-03', type: 'goal', verdict: 'no' });
  const m = requestStatus(h, 'wage', '2026-07-20');
  assert.equal(m.ok, false);
  assert.equal(m.from, '2026-08-01');
});

test('Odmowa i prośba przy niskim zaufaniu kosztują zaufanie (-1 i -2)', () => {
  const g = fresh('legia');
  g.board.trust = 30;
  const c = g.finance.clubs.legia;
  const r = askBoard(g, 'transfer', Math.round(c.transferBudget * 0.5 / 10000) * 10000, '2026-07-10');
  const d = -2 + (r.verdict === 'no' ? -1 : 0);
  assert.equal(g.board.trust, 30 + d);
  assert.match(boardMail(g)[0].body, new RegExp(`Zaufanie zarządu: ${30 + d} na 100 \\(${d}\\)`));
  const h = fresh('legia');
  h.board.trust = 50;
  const r2 = askBoard(h, 'transfer', Math.round(c.transferBudget * 0.1 / 10000) * 10000, '2026-07-10');
  assert.equal(h.board.trust, 50 + (r2.verdict === 'no' ? -1 : 0));
});

test('Przesunięcie do płac: 1 mln zł = 1 mln / 104 tygodniowo, zgoda przy wskaźniku w normie', () => {
  const g = fresh('legia');
  const c = g.finance.clubs.legia;
  const tb = c.transferBudget; const wb = c.wageBudget;
  const r = askBoard(g, 'shift', 1_040_000, '2026-09-20');
  assert.equal(r.verdict, 'yes');
  assert.equal(c.transferBudget, tb - 1_040_000);
  assert.equal(c.wageBudget, wb + 10000);
});

test('Niższy cel: o poziom niżej, raz w sezonie', () => {
  assert.deepEqual(lowerGoal(1, 6), { target: 12, text: 'spokojne miejsce w środku tabeli' });
  assert.equal(lowerGoal(1, 15), null);
  assert.equal(lowerGoal(2, 2).target, 6);
  assert.equal(goalTextFor(1, 5), 'miejsce dające grę w europejskich pucharach, co najmniej 5. miejsce');
  let lowered = null;
  for (const date of ['2026-07-06', '2026-07-20', '2026-08-03', '2026-08-17', '2026-09-07', '2026-09-21', '2026-10-05', '2026-10-19']) {
    const g = fresh('legia');
    g.board.trust = 90;
    const t0 = g.board.goal.target;
    const r = askBoard(g, 'goal', 0, date);
    if (r.verdict === 'yes') { lowered = { g, t0, date }; break; }
  }
  assert.ok(lowered, 'zarząd zgodził się choć raz');
  assert.ok(lowered.g.board.goal.target > lowered.t0);
  const again = requestStatus(lowered.g, 'goal', '2026-10-30');
  assert.equal(again.ok, false);
});

test('Warunek: spełniony daje pieniądze, niespełniony kosztuje punkt zaufania', () => {
  const g = fresh();
  const c = g.finance.clubs.widzew;
  const R = ensureRequests(g);
  const tb = c.transferBudget;
  // Rozliczenie po co najmniej 4 meczach sezonu (wcześniej czeka): 4 kolejki ligi rozegrane remisem
  const comp = g.fixtures.find((x) => (x.home === 'widzew' || x.away === 'widzew') && LEAGUE_COMPS.includes(x.comp)).comp;
  const lf = g.fixtures.filter((f) => f.comp === comp);
  const rounds = [...new Set(lf.map((f) => f.round))].sort((a, b) => a - b).slice(0, 4);
  for (const f of lf) if (rounds.includes(f.round)) { f.played = true; f.result = { score: [1, 1] }; }
  R.conds.push({ id: 'a', date: '2026-07-05', type: 'transfer', amount: 500000, top: 18, by: '2026-08-01', status: 'open' });
  R.conds.push({ id: 'b', date: '2026-07-05', type: 'transfer', amount: 700000, top: 0, by: '2026-08-01', status: 'open' });
  R.conds.push({ id: 'c', date: '2026-07-05', type: 'transfer', amount: 900000, top: 18, by: '2026-09-01', status: 'open' });
  const trust = g.board.trust;
  const msgs = checkConditions(g, '2026-08-01', { push: false });
  assert.equal(msgs.length, 2);
  assert.equal(R.conds[0].status, 'met');
  assert.equal(R.conds[1].status, 'failed');
  assert.equal(R.conds[2].status, 'open');
  assert.equal(c.transferBudget, tb + 500000);
  assert.ok([trust - 1, trust - 2].includes(g.board.trust)); // daleko od celu: -1, porywczy właściciel -2
  assert.ok(msgs.every((m) => m.from === 'Zarząd klubu' && noDash(m.body)));
});

test('Weto: progi wieku i długości, mnożnik właściciela', () => {
  assert.equal(maxYearsFor({ age: 34, pos: 'NAP' }), 1);
  assert.equal(maxYearsFor({ age: 33, pos: 'BR' }), 2);
  assert.equal(maxYearsFor({ age: 31, pos: 'ŚO' }), 2);
  assert.equal(maxYearsFor({ age: 30, pos: 'ŚP' }), 3);
  assert.equal(maxYearsFor({ age: 29, pos: 'BR' }), 4);
  assert.equal(maxYearsFor({ age: 28, pos: 'BR' }), 5);
  assert.equal(ownerScale({ type: 'miliarder', zasobnosc: 20 }), 1.2);
  assert.equal(ownerScale({ type: 'klub', zasobnosc: 8 }), 0.8);
  assert.equal(ownerScale({ type: 'prywatny', zasobnosc: 5 }), 0.9);
  assert.equal(ownerScale({ type: 'miasto', zasobnosc: 10 }), 1);
});

test('Weto kontraktu: pensja, długość, premia za podpis, prowizja; list z liczbami', () => {
  const g = fresh('legia');
  const p = squadOf(g.world, 'wisla-plock').find((x) => x.age >= 33) ?? squadOf(g.world, 'wisla-plock')[0];
  const caps = boardCaps(g, 'legia', p, 'sign');
  assert.ok(caps.wage > 0 && Number.isFinite(caps.wage));
  const ok = { wage: Math.min(caps.wage, 20000), years: 1, signOn: 0, agentFee: 0 };
  assert.deepEqual(contractIssues(caps, ok), []);
  const bad = { wage: caps.wage + 10000, years: caps.years + 1, signOn: caps.wage * 52, agentFee: caps.wage * 52 };
  const codes = contractIssues(caps, bad).map((x) => x.code);
  for (const c of ['wage', 'years', 'signOn', 'agent']) assert.ok(codes.includes(c), c);
  const txt = contractIssues(caps, bad).find((x) => x.code === 'wage').text;
  assert.match(txt, /Proponowana pensja .* tygodniowo .* Zaakceptujemy najwyżej /);
  // Klub AI: oferta dopasowana do progów nie łamie żadnego
  assert.deepEqual(contractIssues(caps, fitOfferToCaps(caps, bad)).filter((x) => x.code !== 'total'), []);
});

test('Weto odstępnego przy ofercie gracza, list i odwołanie (raz na zawodnika w oknie)', () => {
  const g = fresh();
  g.date = '2026-07-10';
  const p = squadOf(g.world, 'gks-katowice').filter((x) => x.value > 600000 && x.value < 3_000_000).sort((a, b) => a.value - b.value)[0];
  assert.ok(p, 'zawodnik do testu');
  g.market.listed[p.id] = { kind: 'transfer', reasons: ['test'], since: g.date, club: p.clubId }; // nie „nie na sprzedaż”
  const fee = Math.round(p.value * 3.2 / 10000) * 10000;
  assert.ok(fee > 1e6);
  const r = offerForPlayer(g, p.id, fee);
  assert.equal(r.result, 'reject');
  assert.equal(r.veto, true);
  assert.match(r.text, /Zarząd klubu\.$/);
  assert.equal(boardMail(g)[0].subject, `Weto zarządu: ${p.name}`);
  assert.ok(appealStatus(g, p.id).ok);
  const trust = g.board.trust;
  const a = appealVeto(g, p.id);
  assert.ok(a.ok);
  assert.equal(g.board.trust, trust + (a.approved ? -3 : -5));
  assert.equal(appealVeto(g, p.id).ok, false); // jedno odwołanie na zawodnika w oknie
  if (a.approved) assert.equal(feeIssues(boardCaps(g, 'widzew', p, 'sign'), fee).issues.length, 0);
});

test('Ostrzeżenie (1,5 x wartości) nie blokuje oferty', () => {
  const g = fresh();
  g.date = '2026-07-10';
  const p = squadOf(g.world, 'gks-katowice').filter((x) => x.value > 900000).sort((a, b) => a.value - b.value)[0];
  const caps = boardCaps(g, 'widzew', p, 'sign');
  const r = feeIssues(caps, Math.max(1.05e6, Math.round(caps.feeWarn + 10000)));
  assert.equal(r.issues.length, 0);
  assert.match(r.warn, /Zarząd ostrzega/);
});

test('Ekran rozmów: progi zarządu widoczne, oferta ponad progi to weto (bez rundy), odwołanie', () => {
  const g = fresh('legia');
  g.date = '2026-07-10';
  const p = squadOf(g.world, 'legia').sort((a, b) => b.contract.wage - a.contract.wage)[0];
  p.contract.until = '2027-06-30';
  const limits = negotiationLimits(g, 'renew', p);
  assert.ok(limits.board && limits.board.wage > 0);
  const s = startNegotiation(g, { kind: 'renew', playerId: p.id, limits });
  if (!s.ok) return; // zawodnik odmówił rozmów: progi sprawdzone wyżej
  const ng = s.ng;
  assert.ok(ng.draft.wage <= limits.board.wage);
  assert.match(renderNegotiation(g, ng), /Zarząd zatwierdzi: pensja do/);
  const r = handleNegotiationAction(g, ng, 'ng-propose', {}, { wage: String(limits.board.wage + 5000) });
  assert.equal(ng.session.round, 0);
  assert.match(r.ng.error, /zarząd nie zatwierdzi tego kontraktu/);
  assert.ok(r.save);
  assert.match(renderNegotiation(g, r.ng), /data-act="ng-appeal"/);
  const a = handleNegotiationAction(g, r.ng, 'ng-appeal', {}, null);
  assert.ok(a.save);
  assert.equal(g.board.requests.appeals.count, 1);
});

test('Kluby AI: długość kontraktu z wieku i koszt kontraktu w negocjacjach', () => {
  const g = fresh();
  const p = Object.values(g.world.players).find((x) => x.clubId && x.age >= 33 && x.clubId !== 'widzew' && x.contract);
  const club = { id: 'lech', name: 'Lech', tier: 1, prestige: 9, L: 12 };
  for (let i = 0; i < 6; i++) {
    const r = aiNegotiate({ kind: 'sign', player: { ...p, age: 34 }, club, fromClub: null, date: '2026-07-10', rng: new Rng(`ai-test:${i}`), budget: { wage: 1e6, maxYears: 1, total: 1e9 } });
    if (r.contract) assert.equal(r.contract.years, 1);
  }
});

test('Kluby AI: w lipcu i styczniu jedna runda podwyżek budżetu (idempotentnie)', () => {
  const g = fresh();
  const before = Object.fromEntries(Object.entries(g.finance.clubs).map(([k, c]) => [k, c.transferBudget]));
  const n = aiBudgetRequests(g, '2026-07-02');
  assert.ok(n >= 0);
  assert.equal(aiBudgetRequests(g, '2026-07-02'), 0);
  assert.equal(g.finance.clubs.widzew.transferBudget, before.widzew); // klub gracza bez zmian
  const grown = Object.keys(before).filter((k) => g.finance.clubs[k].transferBudget > before[k]);
  assert.equal(grown.length, n);
  assert.equal(g.board.requests?.log?.length ?? 0, 0); // kluby AI nie piszą próśb
  const sc = requestScore(g, 'rakow', 'transfer', 1_000_000, '2026-07-02', { trust: 50 });
  assert.ok(Number.isFinite(sc.S));
});

test('Panel próśb: prawa kolumna, presety kwot, historia, bez długich myślników; akcja br-ask', () => {
  const g = fresh();
  g.date = '2026-07-10';
  let html = boardRequestsPanel(g, {});
  assert.match(html, /^<aside class="klub-side br">/);
  assert.equal((html.match(/data-act="br-ask"/g) ?? []).length, 3 * 4 + 1 + 1); // + zmiana dyrektora sportowego (docs/dyrektor-sportowy.md)
  assert.ok(noDash(html) && !html.includes('undefined') && !html.includes('NaN'));
  const amount = html.match(/data-act="br-ask" data-t="transfer" data-a="(\d+)"/)[1];
  const r = handleBoardAction(g, 'br-ask', { t: 'transfer', a: amount }, null);
  assert.ok(r.save);
  assert.ok(r.ui.kMsg);
  html = boardRequestsPanel(g, {});
  assert.match(html, /Odpowiedzi zarządu/);
  assert.match(html, /data-k="(yes|partial|cond|no)"/);
  const hub = renderClubHub(g, { kTab: 'zarzad', kMsg: r.ui.kMsg });
  assert.match(hub, /Prośby do zarządu/);
  assert.ok(noDash(hub));
  // Za tydzień nie wolno prosić: przyciski wyłączone
  assert.match(boardRequestsPanel(g, {}), /data-act="br-ask" data-t="wage" data-a="\d+" disabled/);
});

test('Stałe: limity częstotliwości zgodne ze specyfikacją', () => {
  assert.equal(REQ.WEEK_DAYS, 7);
  assert.equal(REQ.PER_MONTH, 3);
  assert.equal(REQ.AFTER_NO_DAYS, 60);
  assert.equal(REQ.AFTER_YES_DAYS, 90);
});

test('Warunek z poprzedniego sezonu: liczy się miejsce na koniec sezonu z archiwum, nie nowa pusta tabela', () => {
  const g = fresh();
  const R = ensureRequests(g);
  const c = g.finance.clubs[g.clubId];
  const wb = c.wageBudget;
  // Mistrz poprzedniego sezonu; bieżąca tabela bez meczów (dawniej: „drużyna jest na 15. miejscu”)
  g.archive = [{ season: '2025/26', tables: { 1: [{ id: g.clubId, pts: 80, gd: 40 }, { id: 'legia', pts: 70, gd: 20 }], 2: [], 3: [] }, l3: {} }];
  R.conds.push({ id: 'old', date: `${SEASON_YEAR}-06-05`, season: SEASON_YEAR - 1, type: 'wage', amount: 1000, top: 1, by: `${SEASON_YEAR}-07-01`, status: 'open' });
  R.conds.push({ id: 'oldFail', date: `${SEASON_YEAR}-05-20`, type: 'transfer', amount: 500000, top: 1, by: `${SEASON_YEAR}-07-01`, status: 'open' }); // stary zapis bez pola season
  g.archive[0].tables[1].reverse(); // klub gracza na 2. miejscu
  const msgs = checkConditions(g, `${SEASON_YEAR}-07-01`, { push: false });
  assert.equal(msgs.length, 2);
  assert.ok(msgs.every((m) => /zakończyła sezon na 2\. miejscu/.test(m.body) && /umawialiśmy się na 1\. miejsce/.test(m.body)), msgs.map((m) => m.body).join('\n'));
  assert.ok(msgs.every((m) => !/Warunek niespełniony|co najwyżej|15\. miejsc/.test(`${m.subject} ${m.body}`)));
  // 2. miejsce przy umowie na 1.: zabrakło niewiele, więc część kwoty albo wyrozumiałość (zależnie od właściciela)
  assert.ok(msgs.every((m) => /Zabrakło niewiele/.test(m.body)));
  assert.ok(c.wageBudget >= wb && c.wageBudget < wb + 1000);
  // Mistrz: warunek spełniony
  g.archive[0].tables[1].reverse();
  R.conds.push({ id: 'win', date: `${SEASON_YEAR}-06-10`, season: SEASON_YEAR - 1, type: 'transfer', amount: 300000, top: 1, by: `${SEASON_YEAR}-07-01`, status: 'open' });
  const ok = checkConditions(g, `${SEASON_YEAR}-07-01`, { push: false });
  assert.equal(ok.length, 1);
  assert.match(ok[0].subject, /Zarząd dotrzymuje słowa/);
  assert.match(ok[0].body, /zakończyła sezon na 1\. miejscu/);
  // Warunek z bieżącego sezonu przed 4 meczami: czeka, nie przepada
  R.conds.push({ id: 'now', date: `${SEASON_YEAR}-07-02`, season: SEASON_YEAR, type: 'transfer', amount: 300000, top: 3, by: `${SEASON_YEAR}-07-01`, status: 'open' });
  assert.equal(checkConditions(g, `${SEASON_YEAR}-07-01`, { push: false }).length, 0);
  assert.equal(R.conds.at(-1).status, 'open');
});

test('Warunek: spełniony przy płacach na granicy przychodów daje część kwoty albo uczciwe wyjaśnienie, bez kary', () => {
  const g = fresh();
  const R = ensureRequests(g);
  const c = g.finance.clubs[g.clubId];
  g.archive = [{ season: '2025/26', tables: { 1: [{ id: g.clubId, pts: 80, gd: 40 }], 2: [], 3: [] }, l3: {} }];
  const huge = 50 * c.wageBudget; // kwota ponad możliwości klubu
  R.conds.push({ id: 'w', date: `${SEASON_YEAR}-06-05`, season: SEASON_YEAR - 1, type: 'wage', amount: huge, top: 1, by: `${SEASON_YEAR}-07-01`, status: 'open' });
  const trust = g.board.trust; const wb = c.wageBudget;
  const [m] = checkConditions(g, `${SEASON_YEAR}-07-01`, { push: false });
  assert.match(m.body, /zakończyła sezon na 1\. miejscu/);
  assert.match(m.body, /Gratulujemy/);
  assert.ok(!/Bez podwyżki/.test(m.subject), m.subject);
  assert.equal(g.board.trust, trust, 'spełniony warunek nie kosztuje zaufania');
  assert.ok(c.wageBudget < wb + huge);
});

test('Warunek: blisko celu reakcja zależy od właściciela i losu, daleko od celu zawsze bez pieniędzy', () => {
  let partial = 0; let none = 0;
  for (let i = 0; i < 40; i++) {
    const g = fresh();
    const R = ensureRequests(g);
    g.archive = [{ season: '2025/26', tables: { 1: [{ id: 'legia', pts: 80, gd: 40 }, { id: g.clubId, pts: 78, gd: 30 }], 2: [], 3: [] }, l3: {} }];
    R.conds.push({ id: `n${i}`, date: `${SEASON_YEAR}-06-05`, season: SEASON_YEAR - 1, type: 'transfer', amount: 1000000, top: 1, by: `${SEASON_YEAR}-07-01`, status: 'open' });
    const [m] = checkConditions(g, `${SEASON_YEAR}-07-01`, { push: false });
    if (/Część obiecanej kwoty/.test(m.subject)) partial++; else none++;
  }
  assert.ok(partial > 0 && none > 0, `część ${partial}, nic ${none}`);
  const g = fresh();
  const R = ensureRequests(g);
  const rows = [{ id: 'legia' }, { id: 'lech' }, { id: 'rakow' }, { id: 'pogon-szczecin' }, { id: 'gornik-zabrze' }, { id: 'jagiellonia' }, { id: g.clubId }].map((r) => ({ ...r, pts: 50, gd: 0 }));
  g.archive = [{ season: '2025/26', tables: { 1: rows, 2: [], 3: [] }, l3: {} }];
  R.conds.push({ id: 'far', date: `${SEASON_YEAR}-06-05`, season: SEASON_YEAR - 1, type: 'transfer', amount: 1000000, top: 1, by: `${SEASON_YEAR}-07-01`, status: 'open' });
  const [m] = checkConditions(g, `${SEASON_YEAR}-07-01`, { push: false });
  assert.match(m.body, /daleko od celu/);
});
