// Limit kadry i nacisk zarządu (docs/limit-kadry.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { pendingDecisions } from '../src/core/inbox.js';
import { runDecision } from '../src/core/decisions.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { completeTransfer, offerForPlayer, loanIn, marketWeek, answerIncoming, releaseCost } from '../src/career/transfers.js';
import { squadCount, canSign, isExempt, boardTargets, protectedPlayers, SQUAD_LIMITS, PRESSURE_DAYS, LISTING_DAYS, BOARD_LIST_PRICE, LOAN_MAX_AGE } from '../src/career/squadLimit.js';
import { ensureSquadLimit, limitStatus, toggleKeep, aiSquadLimitDay, boardAct } from '../src/career/squadLimitSystem.js';
import { handleTransferAction } from '../src/ui/transfersView.js';
import '../src/season/dailySystems.js';

function newGame(clubId, seed) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  return g;
}
const runTo = (g, until) => { while (g.date < until) { g.date = addDays(g.date, 1); processDay(g); } };
/** Podpisuje wolnych zawodników, aż kadra liczy `target` zawodników do limitu. */
function signFreeUntil(g, target, clubId = g.clubId) {
  const signed = [];
  while (squadCount(g, clubId).counted < target) {
    const id = g.market.free.find((x) => g.world.players[x]);
    completeTransfer(g, { playerId: id, to: clubId, contract: { wage: 4000, until: '2028-06-30' }, kind: 'free' });
    signed.push(id);
  }
  return signed;
}
const limitMsgs = (g) => g.inbox.filter((m) => m.category === 'board' && m.key?.startsWith('limit-kadry'));

test('Liczenie: wychowanek do 21 lat nie liczy się, podpisany zawodnik do 21 lat już tak; progi lig', () => {
  const g = newGame('widzew', 11);
  const st = squadCount(g, 'widzew');
  assert.equal(st.total, st.counted + st.exempt.length);
  assert.ok(st.exempt.every((p) => p.age <= 21 && !p.lastMove));
  assert.deepEqual([st.soft, st.hard], [SQUAD_LIMITS[1].soft, SQUAD_LIMITS[1].hard]);
  const young = g.market.free.map((id) => g.world.players[id]).find((p) => p.age <= 21);
  if (young) {
    completeTransfer(g, { playerId: young.id, to: 'widzew', contract: { wage: 2000, until: '2028-06-30' }, kind: 'free' });
    assert.equal(isExempt(young), false, 'podpisany młody zawodnik liczy się do limitu');
  }
  const l2 = CLUBS_PL.find((c) => c.tier === 3 && g.world.clubs[c.id]);
  assert.deepEqual([squadCount(g, l2.id).soft, squadCount(g, l2.id).hard], [SQUAD_LIMITS[3].soft, SQUAD_LIMITS[3].hard]);
});

test('Twarde maksimum blokuje podpis: oferta, wypożyczenie, rozmowy z wolnym zawodnikiem', () => {
  const g = newGame('widzew', 12);
  signFreeUntil(g, SQUAD_LIMITS[1].soft);
  const warn = canSign(g);
  assert.ok(warn.ok && warn.warn, 'podpis ponad limit zarządu: ostrzeżenie, bez blokady');
  signFreeUntil(g, SQUAD_LIMITS[1].hard);
  const cap = canSign(g);
  assert.equal(cap.ok, false);
  assert.match(cap.text, /Limit kadry: 30\/30/);
  assert.match(cap.text, /wychowanków do 21 lat/);
  const target = squadOf(g.world, 'piast').sort((a, b) => a.ovr - b.ovr)[0];
  const r = offerForPlayer(g, target.id, 50e6);
  assert.equal(r.result, 'reject');
  assert.match(r.text, /Limit kadry/);
  assert.match(loanIn(g, target.id, 100).text, /Limit kadry/);
  const free = g.market.free.find((id) => g.world.players[id]);
  const ui = handleTransferAction(g, 'tf-negotiate', { id: free });
  assert.equal(ui.negotiate, undefined);
  assert.match(ui.ui.tfMsg, /Limit kadry/);
});

test('Nacisk zarządu: wiadomość z decyzją, termin 14 dni, przypomnienie; redukcja przed terminem zamyka sprawę (+1)', () => {
  const g = newGame('widzew', 13);
  signFreeUntil(g, SQUAD_LIMITS[1].soft + 2);
  runTo(g, '2026-07-02');
  const c = ensureSquadLimit(g).case;
  assert.ok(c, 'sprawa otwarta');
  assert.equal(c.deadline, addDays('2026-07-02', PRESSURE_DAYS));
  const m = limitMsgs(g)[0];
  assert.ok(m && !m.optional && m.actions.length === 3, 'decyzja zatrzymuje upływ dni');
  assert.ok(pendingDecisions(g.inbox).some((x) => x.id === m.id));
  assert.match(m.body, /redukcji o 2 zawodników/);
  // Prośba o więcej czasu: +7 dni, zaufanie -2, tylko raz
  const t0 = g.board.trust;
  runDecision(g, m, 'extend');
  assert.equal(c.deadline, addDays('2026-07-02', PRESSURE_DAYS + 7));
  assert.equal(g.board.trust, t0 - 2);
  runTo(g, addDays(c.deadline, -3));
  assert.ok(limitMsgs(g).some((x) => x.key.startsWith('limit-kadry-przyp')), 'przypomnienie 3 dni przed terminem');
  // Trener sam rozwiązuje nadmiar
  const t1 = g.board.trust;
  for (const p of limitStatus(g).targets) { g.finance.clubs.widzew.transferBudget += releaseCost(g, p); handleTransferAction(g, 'tf-release-ok', { id: p.id }); }
  runTo(g, addDays(g.date, 1));
  assert.equal(ensureSquadLimit(g).case, null);
  assert.equal(g.board.trust, t1 + 1);
});

test('Po terminie zarząd działa w ustalonej kolejności: lista (80 %), po 7 dniach wypożyczenie, sprzedaż taniej, rozwiązanie', () => {
  const g = newGame('widzew', 14);
  signFreeUntil(g, SQUAD_LIMITS[1].soft + 3);
  runTo(g, '2026-07-02');
  const c = ensureSquadLimit(g).case;
  const trust0 = g.board.trust;
  runTo(g, c.deadline);
  // Etap 1: lista transferowa
  assert.equal(c.stage, 'listed');
  assert.equal(c.listed.length, 3);
  for (const { id, price } of c.listed) {
    assert.equal(g.market.userListed[id], price);
    assert.equal(price, Math.max(10000, Math.round(g.world.players[id].value * BOARD_LIST_PRICE / 10000) * 10000));
  }
  assert.equal(g.board.trust, trust0 - 3);
  assert.ok(limitMsgs(g).some((m) => m.key.startsWith('limit-kadry-lista')));
  // Etap 2 po LISTING_DAYS
  const listedDate = g.date;
  const balance0 = g.finance.clubs.widzew.balance;
  runTo(g, addDays(listedDate, LISTING_DAYS));
  const acted = [...(ensureSquadLimit(g).case?.acted ?? []), ...ensureSquadLimit(g).log.flatMap((l) => l.acted ?? [])];
  assert.ok(acted.length >= 1, 'zarząd zadziałał');
  for (const a of acted) {
    const p = g.world.players[a.id];
    assert.ok(['loan', 'sale', 'release'].includes(a.kind));
    if (a.kind === 'loan') assert.ok(p.age <= LOAN_MAX_AGE && p.loan?.from === 'widzew');
    if (a.kind === 'sale') assert.ok(p.clubId !== 'widzew' && g.finance.clubs.widzew.log.some((l) => l.kind === 'sales' && l.note.includes(p.name)));
    if (a.kind === 'release') assert.ok(g.finance.clubs.widzew.log.some((l) => l.kind === 'release' && l.note.includes(p.name)));
  }
  assert.ok(g.market.history.some((h) => h.board), 'ruch zarządu w historii rynku');
  assert.notEqual(g.finance.clubs.widzew.balance, balance0);
});

test('Kolejność etapu 2: gdy nikt nie kupi ani nie wypożyczy, zarząd rozwiązuje kontrakt, ale tylko gdy klub stać na odprawę', () => {
  const g = newGame('widzew', 15);
  signFreeUntil(g, SQUAD_LIMITS[1].soft + 1);
  runTo(g, '2026-07-02');
  const S = ensureSquadLimit(g);
  // Rynek zamknięty dla nadmiaru: kluby AI bez pieniędzy i bez miejsca w budżecie płac
  for (const [id, f] of Object.entries(g.finance.clubs)) if (id !== 'widzew') { f.transferBudget = 0; f.wageBudget = 0; }
  const fin = g.finance.clubs.widzew;
  fin.transferBudget = 0;
  const target = limitStatus(g).targets[0];
  const msgs = runDecision(g, limitMsgs(g)[0], 'board'); // trener oddaje decyzję zarządowi
  assert.ok(msgs.length);
  assert.equal(target.clubId, 'widzew', 'bez pieniędzy na odprawę zawodnik zostaje');
  assert.equal(S.case.stage, 'waiting');
  // Pieniądze na odprawę są: rozwiązanie kontraktu, odprawa z budżetu transferowego i w księdze
  const cost = releaseCost(g, target);
  fin.transferBudget = cost + 100000;
  S.case.deadline = g.date;
  boardAct(g, g.date);
  assert.equal(target.clubId, null);
  assert.equal(fin.transferBudget, 100000);
  assert.ok(fin.log.some((l) => l.kind === 'release' && l.note.includes(target.name)));
  assert.equal(S.case, null);
  // Z pieniędzmi w klubach AI zarząd najpierw wypożycza albo sprzedaje, zanim zapłaci odprawę
  const g2 = newGame('widzew', 15);
  signFreeUntil(g2, SQUAD_LIMITS[1].soft + 1);
  runTo(g2, '2026-07-02');
  runDecision(g2, limitMsgs(g2)[0], 'board');
  const a2 = ensureSquadLimit(g2).log[0]?.acted ?? ensureSquadLimit(g2).case.acted;
  if (a2.length) assert.notEqual(a2[0].kind, 'release', 'rozwiązanie dopiero, gdy wypożyczenie i sprzedaż zawiodą');
});

test('Nietykalni: kapitan, jedenastka, 5 najlepszych, nowi zawodnicy i osłonięci nigdy nie są ruszani', () => {
  const g = newGame('widzew', 16);
  const signed = signFreeUntil(g, SQUAD_LIMITS[1].soft + 4);
  runTo(g, '2026-07-02');
  const S = ensureSquadLimit(g);
  const pick = limitStatus(g).targets[0];
  assert.equal(toggleKeep(g, pick.id).ok, true);
  assert.ok(!limitStatus(g).targets.some((p) => p.id === pick.id), 'osłonięty znika z listy zarządu');
  const prot = protectedPlayers(g, 'widzew', g.date, S.case.keep);
  const before = new Set([...prot.keys()]);
  assert.ok(before.has(g.tactics.captain));
  for (const id of g.tactics.xi.filter(Boolean)) assert.ok(before.has(id));
  for (const id of signed) assert.ok(before.has(id), 'niedawno sprowadzony');
  runTo(g, '2026-08-20');
  const squad = new Set(g.world.clubs.widzew.squad);
  for (const id of before) assert.ok(squad.has(id), `nietykalny ${id} opuścił kadrę`);
  const stillProtected = protectedPlayers(g, 'widzew', g.date, S.case?.keep ?? []);
  for (const t of boardTargets(g, 'widzew', 30, { keep: S.case?.keep ?? [] })) assert.ok(!stillProtected.has(t.id));
});

test('Kluby AI: te same progi. Pełna kadra nie kupuje, nadmiar na liście, po 21 dniach zwolnienie; oferta za gracza wycofana', () => {
  const g = newGame('widzew', 17);
  const ai = 'piast';
  signFreeUntil(g, SQUAD_LIMITS[1].hard, ai);
  assert.equal(squadCount(g, ai).full, true);
  for (const d of ['2026-07-06', '2026-07-13', '2026-07-20']) {
    marketWeek(g, d);
    assert.ok(squadCount(g, ai).counted <= squadCount(g, ai).hard, `${ai} ponad maksimum`);
  }
  // Nadmiar ponad limit zarządu: na liście, po 21 dniach redukcja (gdy stać na odprawy)
  const S = ensureSquadLimit(g);
  g.finance.clubs[ai].transferBudget = 50e6; g.finance.clubs[ai].balance = 50e6;
  aiSquadLimitDay(g, '2026-07-06');
  assert.equal(S.ai[ai], '2026-07-06');
  assert.ok(Object.values(g.market.listed).some((l) => l.club === ai && l.reasons.includes('Nadmiar w kadrze (limit)')));
  aiSquadLimitDay(g, '2026-07-27');
  assert.ok(squadCount(g, ai).counted <= squadCount(g, ai).soft);
  // Kupiec z pełną kadrą wycofuje ofertę za zawodnika gracza
  signFreeUntil(g, SQUAD_LIMITS[1].hard, 'lech');
  const p = squadOf(g.world, 'widzew')[5];
  g.market.offers.unshift({ id: 'of-limit', kind: 'incoming', playerId: p.id, from: 'lech', fee: 1e6, status: 'open', date: g.date, expires: addDays(g.date, 6) });
  const r = answerIncoming(g, 'of-limit', 'accept');
  assert.match(r.text, /limit kadry/);
  assert.equal(p.clubId, 'widzew');
  // Cały sezon rynku: żaden klub AI nie przekracza maksimum
  runTo(g, '2026-09-02');
  for (const c of CLUBS_PL) if (c.id !== 'widzew' && g.world.clubs[c.id]) assert.ok(squadCount(g, c.id).counted <= squadCount(g, c.id).hard, c.id);
});

test('Stary zapis bez stanu limitu działa; wynik jest deterministyczny', () => {
  const play = () => {
    const g = newGame('widzew', 18);
    delete g.squadLimit; // zapis sprzed limitu kadry
    signFreeUntil(g, SQUAD_LIMITS[1].soft + 3);
    runTo(g, '2026-08-01');
    return { S: JSON.stringify(g.squadLimit), squad: [...g.world.clubs.widzew.squad].sort().join(','), trust: g.board.trust, hist: JSON.stringify(g.market.history.slice(0, 40)) };
  };
  const a = play(); const b = play();
  assert.ok(a.S.length > 10);
  assert.deepEqual(a, b);
});
