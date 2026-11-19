// Wypożyczony do klubu gracza: nie pyta o swój kontrakt, przed końcem wypożyczenia mówi, czy chce zostać
// (src/career/loans.js loanStayNotice, src/career/teamTalks.js, src/ui/negotiationView.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { createLoan, loanTerms, loanStayNotice, LOAN } from '../src/career/loans.js';
import { talkSuggestions, talkToPlayer } from '../src/career/teamTalks.js';
import { coachOptions } from '../src/career/talkDialog.js';
import { startNegotiation } from '../src/ui/negotiationView.js';
import { playerReport } from '../src/career/assistantReport.js';
import '../src/season/dailySystems.js';

function newGame(seed = 21) {
  applySeasonState({});
  const g = { seed, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: 'widzew' }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 });
  ensureCareer(g); processDay(g);
  g.date = '2026-07-10';
  return g;
}
/** Zawodnik klubu AI z kontraktem kończącym się w ciągu roku, wypożyczony do Widzewa do 30 czerwca 2027. */
function loanee(g) {
  const p = squadOf(g.world, 'radomiak').find((x) => x.contract?.until && x.contract.until <= '2027-06-30' && x.age >= 22) ?? squadOf(g.world, 'radomiak')[5];
  p.contract.until = '2027-06-30';
  createLoan(g, p.id, 'widzew', loanTerms(g, p, { share: 100, type: 'sezon', fee: 0 }));
  assert.equal(p.clubId, 'widzew');
  return p;
}

test('Wypożyczony nie dostaje powodu rozmowy o kontrakcie i nie da się przedłużyć jego kontraktu', () => {
  const g = newGame();
  const p = loanee(g);
  const rs = talkSuggestions(g).find((x) => x.p.id === p.id)?.reasons.map((r) => r[1]) ?? [];
  assert.ok(!rs.includes('Kontrakt kończy się w ciągu roku'), rs.join(', '));
  const r = startNegotiation(g, { kind: 'renew', playerId: p.id });
  assert.equal(r.ok, false); assert.equal(r.reason, 'loanee');
  assert.match(coachOptions(g, p, 'future').map((o) => o.line).join(' '), /wypożycz|wykup|zostajesz|na stałe|kluby/);
  const rep = playerReport(g, p.id);
  assert.match(JSON.stringify(rep), /"k":"Wypożyczenie"/, 'raport: wypożyczenie zamiast kontraktu');
  assert.doesNotMatch(JSON.stringify(rep), /"k":"Kontrakt"/);
});

test('Przed końcem wypożyczenia: raz wiadomość „chce zostać” albo „wraca”, potem powód rozmowy o pozostaniu', () => {
  const g = newGame();
  const p = loanee(g);
  const L = p.loan;
  // Zadowolony, gra dużo: chce zostać
  p.morale = 18; L.games = 20; L.minutes = 20 * 85;
  const m = loanStayNotice(g, p, L, addDays(L.until, -LOAN.STAY_DAYS));
  assert.ok(L.stay?.want, 'chce zostać');
  assert.match(m.subject, /chce zostać/);
  assert.match(m.body, /wolny zawodnik|wykup/);
  const rs = talkSuggestions(g).find((x) => x.p.id === p.id)?.reasons.map((r) => r[1]) ?? [];
  assert.ok(rs.includes('Chce zostać po wypożyczeniu'));
  g.date = addDays(L.until, -40);
  const t = talkToPlayer(g, p.id, 'future');
  assert.ok(t.ok); assert.ok(L.stay.talked, 'rozmowa odbyta');
  assert.ok(!(talkSuggestions(g).find((x) => x.p.id === p.id)?.reasons ?? []).some((r) => r[1] === 'Chce zostać po wypożyczeniu'));
  // Niezadowolony, nie gra: wraca do klubu macierzystego
  const q = loanee(newGame(33));
  q.morale = 4; q.loan.games = 20; q.loan.minutes = 0;
  const m2 = loanStayNotice({ seed: 33, clubId: 'widzew' }, q, q.loan, addDays(q.loan.until, -LOAN.STAY_DAYS));
  assert.equal(q.loan.stay.want, false);
  assert.match(m2.subject, /wraca/);
  assert.match(m2.body, /kontrakt|odejść|składzie|nowym klubem/);
});

test('System dnia: wiadomość raz, ok. 6 tygodni przed końcem wypożyczenia', () => {
  const g = newGame();
  const p = loanee(g);
  const from = addDays(p.loan.until, -LOAN.STAY_DAYS - 2);
  g.date = from;
  for (let i = 0; i < 6; i++) { g.date = addDays(g.date, 1); processDay(g); }
  const msgs = g.inbox.filter((x) => String(x.key ?? '').startsWith(`wyp-przyszlosc:${p.id}`));
  assert.equal(msgs.length, 1);
  assert.ok(p.loan.stay);
});
