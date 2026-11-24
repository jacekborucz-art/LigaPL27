// Wolni zawodnicy poza oknem (docs/transfery.md, rozdz. „Wolni zawodnicy poza oknem”): wolny po zamknięciu okna
// dogaduje się z klubem w każdej chwili, ale dołącza w pierwszym dniu najbliższego okna; rezerwacja liczy się do
// limitu kadry; w dniu dołączenia limit kadry, kontuzja i testy medyczne; kluby AI poza oknem tylko przy potrzebie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { buildContract, normalizeOffer } from '../src/career/negotiation.js';
import { dealOf } from '../src/career/transferDeals.js';
import { THINK, makeProposal, submitUserProposal, proposalsFor } from '../src/career/proposals.js';
import { squadCount } from '../src/career/squadLimit.js';
import { wageRoom } from '../src/career/finance.js';
import { retireFreeAgents } from '../src/career/mindset.js';
import { LATE_JOIN, lateFree, joinOf, joinsDay, reserveJoin, aiLateWeek, lateNeed } from '../src/career/lateJoins.js';
import { handleTransferAction, renderTransfers, transferCardHtml } from '../src/ui/transfersView.js';
import { applySeasonState } from '../src/season/rollover.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import '../src/season/dailySystems.js';

function newGame(clubId = 'widzew', seed = 71, date = '2026-10-05') {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  g.date = date;
  return g;
}
const step = (g, n = 1) => { for (let i = 0; i < n; i++) { g.date = addDays(g.date, 1); processDay(g); } };
const contractFor = (g, wage, years = 2) => buildContract(normalizeOffer({ wage, years, role: 'rotacja' }), g.date);
/** Ustawienia modułu na czas testu (obiekty THINK i LATE_JOIN). */
function withObj(obj, over, fn) {
  const keep = structuredClone(obj);
  Object.assign(obj, over);
  try { return fn(); } finally { Object.assign(obj, keep); }
}
const YES = { pMin: 1, pMax: 1 };
/** Wolny zawodnik bez propozycji, wolny od 1 października (po zamknięciu okna 9 września). */
function lateAgent(g, i = 0) {
  const p = g.market.free.map((id) => g.world.players[id]).filter((x) => x && !x.scout && !x.transfer && !proposalsFor(g, x.id).length)[i];
  p.freeSince = '2026-10-01'; p.injuryDays = 0;
  return p;
}
/** Propozycja gracza i zgoda zawodnika po namyśle. */
function userAgrees(g, p) {
  const r = submitUserProposal(g, { playerId: p.id, contract: contractFor(g, Math.round((p.askWage ?? 3000) * 1.8 / 100) * 100), fromClub: null });
  assert.ok(r.ok, r.text);
  withObj(THINK, YES, () => { while (g.date < r.prop.decide) step(g); });
  assert.equal(r.prop.status, 'accepted', 'zawodnik przyjął propozycję');
  return r.prop;
}

test('Wolny po zamknięciu okna: rozmowy możliwe, zgoda to umowa z dołączeniem 1 lutego, bez kadry i pensji, zajęty dla innych', () => {
  const g = newGame('widzew', 71);
  const p = lateAgent(g);
  assert.ok(lateFree(g, p), 'wolny po zamknięciu okna');
  const html = renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id });
  assert.match(html, /Zawodnik wolny po zamknięciu okna: możesz się z nim dogadać, dołączy 1 lut 2027 \(otwarcie okna\)\./);
  const neg = handleTransferAction(g, 'tf-negotiate', { id: p.id });
  assert.ok(neg.negotiate, `rozmowy nie są zablokowane: ${neg.ui?.tfMsg}`);
  const before = squadCount(g, 'widzew').counted;
  const room0 = wageRoom(g.finance, g.world, 'widzew');
  const x = userAgrees(g, p);
  assert.equal(x.end.join, '2027-02-01');
  assert.deepEqual(p.joinOn, { clubId: 'widzew', date: '2027-02-01' });
  assert.equal(joinOf(g, p.id)?.to, 'widzew');
  assert.equal(dealOf(g, p.id), null, 'bez transakcji przed oknem');
  assert.equal(p.clubId, null);
  assert.equal(p.wage, 0, 'bez pensji do dołączenia');
  assert.ok(!g.world.clubs.widzew.squad.includes(p.id), 'nie jest w kadrze, nie gra');
  assert.equal(squadCount(g, 'widzew').counted, before + 1, 'rezerwacja liczy się do limitu kadry');
  assert.equal(wageRoom(g.finance, g.world, 'widzew'), Math.max(0, room0 - joinOf(g, p.id).contract.wage), 'pensja odliczona od wolnego budżetu płac');
  assert.ok(g.inbox.some((m) => m.subject === `Umowa z ${p.name}: dołączy 1 lut 2027` && /nie dostaje pensji/.test(m.body)));
  // Inne kluby (AI i gracz) nie mogą go podpisać
  assert.equal(makeProposal(g, { playerId: p.id, to: 'lech', contract: contractFor(g, 20000), kind: 'free' }), null);
  assert.match(handleTransferAction(g, 'tf-negotiate', { id: p.id }).ui.tfMsg, /Dołączy do twojego klubu 1 lut 2027/);
  assert.match(transferCardHtml(g, p), /Dołączy do twojego klubu 1 lut 2027/);
  assert.match(renderTransfers(g, { tfTab: 'wtoku' }), /Dołączą w oknie transferowym/);
  g.clubId = 'lech'; // widok innego klubu
  assert.match(renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id }), /Dołączy do [^<]+ 1 lut 2027 \(otwarcie okna\)\. Nie rozmawia z innymi klubami/);
  g.clubId = 'widzew';
});

test('Dzień otwarcia okna: zawodnik dołącza (kontrakt i pensja od dziś), list do gracza', () => {
  const g = newGame('widzew', 72);
  const p = lateAgent(g, 1);
  userAgrees(g, p);
  const wage = joinOf(g, p.id).contract.wage;
  g.date = '2027-01-31';
  withObj(LATE_JOIN, { medFail: 0, medFailOld: 0 }, () => step(g, 1));
  assert.equal(g.date, '2027-02-01');
  assert.equal(p.clubId, 'widzew');
  assert.ok(g.world.clubs.widzew.squad.includes(p.id));
  assert.equal(p.wage, wage);
  assert.equal(p.contract.signed, '2027-02-01');
  assert.equal(p.contract.signedOn, '2027-02-01');
  assert.equal(p.joinOn, undefined);
  assert.equal(joinOf(g, p.id), null);
  assert.ok(!g.market.free.includes(p.id));
  assert.equal(g.market.history.find((e) => e.playerId === p.id)?.late, true, 'wpis w historii rynku');
  assert.ok(g.inbox.some((m) => m.subject.startsWith(`Oficjalnie: ${p.name} zawodnikiem klubu`) && /od dziś/.test(m.body)));
});

test('Pełna kadra w dniu dołączenia: umowa wygasa bez kosztów, zawodnik wraca do wolnych', () => {
  const g = newGame('widzew', 73);
  const p = lateAgent(g, 2);
  const j = reserveJoin(g, p, { to: 'widzew', contract: contractFor(g, 5000), date: g.date });
  assert.equal(j.date, '2027-02-01');
  // Kadra rośnie ponad maksimum (np. inny podpis bez rezerwacji)
  const extra = g.market.free.filter((id) => id !== p.id).slice(0, 12);
  for (const id of extra) {
    const q = g.world.players[id];
    q.clubId = 'widzew'; q.lastMove = '2026-09-01'; g.world.clubs.widzew.squad.push(id);
  }
  g.market.free = g.market.free.filter((id) => !extra.includes(id));
  const c = squadCount(g, 'widzew');
  assert.ok(c.counted > c.hard, `kadra ${c.counted}/${c.hard}`);
  g.date = '2027-02-01';
  const out = joinsDay(g, g.date);
  assert.equal(p.clubId, null);
  assert.equal(p.joinOn, undefined);
  assert.equal(p.freeSince, '2027-02-01');
  assert.ok(g.market.free.includes(p.id));
  assert.equal(joinOf(g, p.id), null);
  assert.ok(out.some((m) => m.subject.startsWith(`${p.name} nie dołączy do`) && /limit kadry/.test(m.body)));
});

test('Wolny z umową poza oknem nie znika z rynku (retireFreeAgents)', () => {
  const g = newGame('widzew', 74);
  const free = g.market.free.map((id) => g.world.players[id]).filter((x) => x && !x.scout);
  const p = free[0]; const q = free.find((x) => x !== p && (x.pos === p.pos));
  for (const x of [p, q]) { x.age = 36; x.freeSince = '2024-01-01'; }
  reserveJoin(g, p, { to: 'lech', contract: contractFor(g, 5000), date: g.date });
  for (let m = 11; m <= 22; m++) {
    const y = 2026 + Math.floor((m - 1) / 12); const mm = String(((m - 1) % 12) + 1).padStart(2, '0');
    retireFreeAgents(g, `${y}-${mm}-01`);
  }
  assert.ok(g.world.players[p.id], 'zawodnik z umową zostaje');
  assert.ok(g.market.free.includes(p.id));
  assert.equal(g.world.players[p.id].joinOn?.clubId, 'lech');
  if (q) assert.ok(!g.world.players[q.id], 'taki sam zawodnik bez umowy kończy karierę');
});

test('Kluby AI poza oknem: wolny tylko przy potrzebie; wolny po zamknięciu okna czeka na okno, zwykły wolny od razu', () => {
  const g = newGame('widzew', 75, '2026-10-05');
  // Dwa kluby bez zdrowych bramkarzy (długie kontuzje), duży budżet płac
  const busy = new Set((g.market.pending ?? []).filter((x) => x.status === 'open' || x.status === 'changes').map((x) => x.to));
  const needy = CLUBS_PL.filter((c) => c.tier === 1 && c.id !== 'widzew' && !busy.has(c.id)).slice(0, 2).map((c) => c.id);
  for (const id of needy) {
    for (const x of squadOf(g.world, id).filter((y) => y.pos === 'BR')) x.injuryDays = 60;
    g.finance.clubs[id].wageBudget += 2e6;
  }
  for (const id of needy) assert.deepEqual(lateNeed(squadOf(g.world, id)), { group: 'GK', gk: true });
  const [late, normal] = g.market.free.map((id) => g.world.players[id]).filter((x) => x && !x.scout && x.pos !== 'BR').slice(0, 2);
  for (const [x, ovr, since] of [[late, 16.5, '2026-10-01'], [normal, 16.4, '2026-08-01']]) {
    x.pos = 'BR'; x.ovr = ovr; x.age = 28; x.askWage = 8000; x.freeSince = since; x.injuryDays = 0;
  }
  assert.ok(lateFree(g, late) && !lateFree(g, normal));
  const props = withObj(LATE_JOIN, { chance: { 1: 1, 2: 1, 3: 1, 4: 1 }, gkChance: 1 }, () => aiLateWeek(g, g.date));
  assert.ok(props.length >= 2, `propozycje: ${props.length}`);
  for (const x of props) assert.ok(lateNeed(squadOf(g.world, x.to)), `${x.to}: propozycja tylko przy potrzebie`);
  const mine = props.filter((x) => x.pid === late.id || x.pid === normal.id);
  assert.equal(mine.length, 2, 'obaj bramkarze dostali propozycje klubów z potrzebą');
  assert.ok(mine.every((x) => needy.includes(x.to)));
  const last = mine.map((x) => x.decide).sort().at(-1);
  withObj(THINK, YES, () => { while (g.date < last) step(g); });
  assert.equal(late.clubId, null, 'wolny po zamknięciu okna czeka na okno');
  assert.ok(needy.includes(late.joinOn?.clubId) && late.joinOn.date === '2027-02-01');
  assert.ok(dealOf(g, normal.id)?.kind === 'free' || needy.includes(normal.clubId), 'zwykły wolny dołącza od razu (transakcja)');
  // Bez potrzeby: żadnej propozycji, nawet przy szansie 100 %
  const g2 = newGame('widzew', 76, '2026-10-12');
  const props2 = withObj(LATE_JOIN, { chance: { 1: 1, 2: 1, 3: 1, 4: 1 }, gkChance: 1 }, () => aiLateWeek(g2, g2.date));
  for (const x of props2) assert.ok(lateNeed(squadOf(g2.world, x.to)), 'tylko kluby z potrzebą');
  // W oknie funkcja nic nie robi
  assert.deepEqual(aiLateWeek(g2, '2027-02-02'), []);
});
