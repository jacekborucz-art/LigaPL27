// Wnioski o inwestycje: zarząd, pozwolenie miasta, start budowy (src/career/infrastructure.js, src/ui/infraView.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { Rng } from '../src/core/rng.js';
import {
  INFRA, IREQ, infraOf, ensureInfra, quote, submitRequest, withdrawRequest, pipelineFor, boardScore, infraMonth,
  infraSeason, infraRequestsDay, licenceNeeds,
} from '../src/career/infrastructure.js';
import { renderClubHub, handleClubAction } from '../src/ui/klubView.js';
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
const G = newGame();
const fresh = (clubId = G.clubId, date = '2026-07-10') => {
  const g = structuredClone({ ...G, world: null });
  g.world = G.world; // świat tylko do odczytu
  g.clubId = clubId; g.date = date;
  return g;
};
/** Dni po kolei jak system 'infra' (raty 1. dnia miesiąca, potem wnioski). Zwraca wiadomości. */
function runDays(g, n, stop = null) {
  const out = [];
  for (let i = 0; i < n; i++) {
    g.date = addDays(g.date, 1);
    if (g.date.endsWith('-01')) out.push(...infraMonth(g, g.date));
    out.push(...infraRequestsDay(g, g.date));
    if (stop?.()) break;
  }
  return out;
}
/** Los zarządu dla wniosku złożonego w danym dniu (ten sam strumień co w grze). */
const boardRng = (g, id, track, created) => { const r = new Rng(`infra-wniosek:${g.seed}:${id}:${track}:${created}:board`); r.int(...IREQ.BOARD_DAYS); return r; };
const clean = (html) => { assert.ok(!html.includes(String.fromCharCode(0x2014)), 'długi myślnik'); assert.ok(!/undefined|NaN/.test(html), 'undefined/NaN'); };

test('Wniosek: bez pieniędzy przy złożeniu, wycena zablokowana, etapy akademia [zarząd] i stadion [zarząd, miasto]', () => {
  const g = fresh(); const id = g.clubId; const c = g.finance.clubs[id];
  c.balance = 300e6;
  const bal = c.balance; const led = JSON.stringify(c.ledger);
  const r = submitRequest(g, id, 'academy');
  assert.ok(r.ok, r.text);
  assert.match(r.text, /Wniosek złożony/);
  assert.equal(c.balance, bal); assert.equal(JSON.stringify(c.ledger), led, 'nic nie schodzi z salda');
  assert.equal(infraOf(g, id).proj.academy, undefined);
  const q = quote(g, id, 'academy');
  assert.equal(q.ok, false); assert.equal(q.why, 'Wniosek w sprawie tego obiektu czeka na decyzję.');
  assert.deepEqual(r.req.pipeline, ['board']);
  const days = (r.req.decideOn > r.req.created) && (new Date(r.req.decideOn) - new Date(r.req.created)) / 864e5;
  assert.ok(days >= 3 && days <= 7, `zarząd po 3-7 dniach: ${days}`);
  assert.deepEqual(pipelineFor(g, id, quote(g, id, 'stadium')), ['board', 'city']);
  // Baza: pozwolenie miasta tylko z pieniędzmi miasta (Korona: miasto dokłada), Widzew (miliarder) bez miasta
  assert.deepEqual(pipelineFor(g, id, quote(g, id, 'training')), ['board']);
  assert.deepEqual(pipelineFor(g, 'korona', quote(g, 'korona', 'training')), ['board', 'city']);
  assert.deepEqual(pipelineFor(g, 'korona', quote(g, 'korona', 'academy')), ['board']);
});

test('Deterministycznie: ten sam wniosek, ten sam termin i ta sama decyzja', () => {
  const run = () => {
    const g = fresh('korona'); g.finance.clubs.korona.balance = 9e6;
    const r = submitRequest(g, 'korona', 'training');
    runDays(g, 80, () => !infraOf(g, 'korona').req.training);
    return { decideOn: r.req.decideOn, steps: r.req.steps, last: infraOf(g, 'korona').reqLast.training, proj: !!infraOf(g, 'korona').proj.training };
  };
  assert.deepEqual(run(), run());
});

test('Zgoda: budowa rusza w dniu decyzji, pierwsza wpłata dopiero wtedy, list zarządu i „Ruszyła inwestycja”', () => {
  const g = fresh(); const id = g.clubId; const c = g.finance.clubs[id];
  c.balance = 300e6;
  const r = submitRequest(g, id, 'academy').req;
  const bal = c.balance;
  const msgs = runDays(g, 10, () => !!infraOf(g, id).proj.academy);
  const p = infraOf(g, id).proj.academy;
  assert.ok(p, 'projekt ruszył');
  assert.equal(p.start, r.decideOn);
  assert.equal(g.date, r.decideOn);
  assert.equal(bal - c.balance, r.q.upfront);
  assert.equal(c.ledger[r.decideOn.slice(0, 7)].out.infra, r.q.upfront);
  assert.equal(r.steps[0].result, 'yes');
  const board = msgs.find((m) => m.category === 'board');
  assert.ok(board, 'list zarządu'); assert.equal(board.from, 'Zarząd klubu'); assert.match(board.subject, /Zgoda zarządu/);
  assert.equal(board.key, `infra-wniosek:${id}:academy:board:${r.decideOn}`);
  assert.ok(msgs.some((m) => /Ruszyła inwestycja/.test(m.subject)));
  assert.equal(infraOf(g, id).reqLast.academy.result, 'yes');
});

test('Brak pieniędzy: odmowa, powód w liście i blokada do 1 lipca', () => {
  const g = fresh(); const id = g.clubId; const c = g.finance.clubs[id];
  c.balance = 300e6;
  submitRequest(g, id, 'training');
  c.balance = 100000; // mniej niż pierwsza wpłata
  const msgs = runDays(g, 10, () => !infraOf(g, id).req.training);
  const last = infraOf(g, id).reqLast.training;
  assert.equal(last.result, 'no'); assert.equal(last.stage, 'board');
  assert.equal(last.until, '2027-07-01');
  assert.match(last.why, /pierwszą wpłatę/);
  const m = msgs.find((x) => /Odmowa zarządu/.test(x.subject));
  assert.ok(m); assert.equal(m.category, 'board'); assert.match(m.body, /od 1 lip 2027/);
  c.balance = 300e6;
  const q = quote(g, id, 'training');
  assert.equal(q.ok, false); assert.match(q.why, /Zarząd odrzucił wniosek, kolejny można złożyć od 1 lip 2027/);
  assert.equal(submitRequest(g, id, 'training').ok, false);
  assert.equal(quote(g, id, 'training', { date: '2027-07-01' }).ok, true, 'od nowego sezonu znowu można');
  const html = renderClubHub(g, { kTab: 'infrastruktura' });
  assert.match(html, /Zarząd odrzucił wniosek/); clean(html);
});

test('Licencja: wniosek usuwający brak dostaje zgodę, a odmowa nie blokuje', () => {
  const g = fresh(); const id = g.clubId; const c = g.finance.clubs[id]; const I = infraOf(g, id);
  I.training = 2; c.balance = 30e6;
  assert.equal(licenceNeeds(g, id)[0].track, 'training');
  const r = submitRequest(g, id, 'training').req;
  assert.equal(r.licence, true);
  const sc = boardScore(g, id, r.q, { licence: true });
  assert.ok(sc.parts.licence === 40 && sc.S >= 5, `S ${sc.S}`);
  runDays(g, 10, () => !I.req.training);
  assert.ok(I.proj.training, 'zgoda i start');
  // Odmowa (brak pieniędzy na pierwszą wpłatę) bez blokady
  const g2 = fresh(); const I2 = infraOf(g2, id); I2.training = 2;
  submitRequest(g2, id, 'training'); g2.finance.clubs[id].balance = 0;
  runDays(g2, 10, () => !I2.req.training);
  assert.equal(I2.reqLast.training.result, 'no'); assert.equal(I2.reqLast.training.until, null);
  g2.finance.clubs[id].balance = 30e6;
  assert.ok(quote(g2, id, 'training').ok, 'nowy wniosek od razu');
});

/** Dzień złożenia i saldo, przy których zarząd da zgodę warunkową (los dla wniosku z danego dnia). */
function condBalance(g, id, track) {
  const c = g.finance.clubs[id];
  const q = quote(g, id, track);
  const d0 = g.date;
  for (let i = 0; i < 60; i++) {
    g.date = addDays(d0, i);
    for (let b = q.upfront; b < q.upfront + 20e6; b += 50000) {
      c.balance = b;
      const sc = boardScore(g, id, q, { rng: boardRng(g, id, track, g.date) });
      const worst = Object.entries(sc.parts).sort((x, y) => x[1] - y[1])[0][0];
      if (sc.S < 0 && sc.S >= IREQ.COND_MIN && worst === 'cash') return b;
    }
  }
  return null;
}

test('Zgoda warunkowa: saldo osiągnięte na czas (start) albo nie (odmowa z blokadą)', () => {
  const g = fresh('jagiellonia'); const id = 'jagiellonia'; const c = g.finance.clubs[id];
  const b = condBalance(g, id, 'academy');
  assert.ok(b, 'jest saldo dające warunek');
  const r = submitRequest(g, id, 'academy').req;
  const msgs = runDays(g, 10, () => !!r.cond);
  assert.ok(r.cond, 'warunek');
  assert.equal(r.steps[0].result, 'cond');
  assert.ok(r.cond.minBalance > c.balance && r.cond.minBalance % IREQ.COND_STEP === 0);
  assert.equal(r.cond.by, addDays(r.decideOn, IREQ.COND_DAYS));
  assert.ok(msgs.some((m) => /Warunek zarządu/.test(m.subject) && /co najmniej/.test(m.body)));
  const h = renderClubHub(g, { kTab: 'infrastruktura' });
  assert.match(h, /warunek: saldo co najmniej/); clean(h);
  // Spełniony: następnego dnia budowa rusza
  const g1 = structuredClone({ ...g, world: null }); g1.world = g.world;
  g1.finance.clubs[id].balance = r.cond.minBalance;
  const m1 = runDays(g1, 1);
  assert.ok(infraOf(g1, id).proj.academy, 'start po spełnieniu warunku');
  assert.ok(m1.some((m) => /Warunek spełniony/.test(m.subject)));
  // Niespełniony: po terminie odmowa i blokada do 1 lipca
  runDays(g, 40, () => !infraOf(g, id).req.academy);
  const last = infraOf(g, id).reqLast.academy;
  assert.equal(last.result, 'no'); assert.equal(last.until, '2027-07-01');
  assert.ok(g.date > r.cond.by);
  assert.equal(infraOf(g, id).proj.academy, undefined);
});

test('Miasto: pozwolenie po 30-45 dniach (stadion), odmowa w liście urzędu miasta', () => {
  const id = 'widzew';
  // Dzień złożenia, dla którego urząd odmówi (szansa 5 %), z tego samego strumienia losowania co w grze
  let created = null;
  for (let i = 0; i < 400 && !created; i++) {
    const d = addDays('2026-07-10', i);
    const rng = new Rng(`infra-wniosek:${G.seed}:${id}:stadium:${d}:city`); rng.int(...IREQ.CITY_DAYS.level);
    if (rng.next() >= IREQ.CITY_P) created = d;
  }
  assert.ok(created);
  const g = fresh(id, created); g.finance.clubs[id].balance = 300e6;
  const r = submitRequest(g, id, 'stadium').req;
  assert.deepEqual(r.pipeline, ['board', 'city']);
  runDays(g, 10, () => r.stage === 'city');
  assert.equal(r.stage, 'city'); assert.equal(r.steps[0].result, 'yes');
  const days = (new Date(r.decideOn) - new Date(r.steps[1].from)) / 864e5;
  assert.ok(days >= 30 && days <= 45, `${days}`);
  const h = renderClubHub(g, { kTab: 'infrastruktura' });
  assert.match(h, /Miasto/); assert.match(h, /zgoda/); clean(h);
  const msgs = runDays(g, 50, () => !infraOf(g, id).req.stadium);
  const m = msgs.find((x) => x.from === 'Urząd miasta');
  assert.ok(m && /odmawia/.test(m.subject), 'list urzędu miasta');
  assert.equal(infraOf(g, id).reqLast.stadium.stage, 'city');
  assert.match(quote(g, id, 'stadium').why, /Miasto odrzuciło wniosek/);
  // Trybuny: 21-35 dni, baza z pieniędzmi miasta: 14-28 dni
  const g2 = fresh('korona'); g2.finance.clubs.korona.balance = 50e6;
  const r2 = submitRequest(g2, 'korona', 'training').req;
  runDays(g2, 10, () => r2.stage === 'city');
  if (r2.stage === 'city') { const d2 = (new Date(r2.decideOn) - new Date(r2.steps[1].from)) / 864e5; assert.ok(d2 >= 14 && d2 <= 28, `${d2}`); }
});

test('Wycofanie wniosku: bez kosztów i bez blokady', () => {
  const g = fresh(); const id = g.clubId; const c = g.finance.clubs[id];
  c.balance = 300e6;
  handleClubAction(g, 'inf-confirm', { track: 'academy' });
  assert.ok(infraOf(g, id).req.academy);
  const bal = c.balance;
  const r = handleClubAction(g, 'inf-withdraw', { track: 'academy' });
  assert.equal(r.save, true); assert.match(r.ui.kMsg, /Wniosek wycofany/);
  assert.equal(infraOf(g, id).req.academy, undefined);
  assert.equal(infraOf(g, id).reqLast.academy, undefined);
  assert.equal(c.balance, bal);
  assert.ok(quote(g, id, 'academy').ok);
  assert.equal(withdrawRequest(g, id, 'academy').ok, false);
});

test('Kluby AI: te same etapy bez poczty, projekty ruszają zwykle w ciągu 60 dni', () => {
  const g = fresh(G.clubId, '2027-07-01');
  for (const [id, c] of Object.entries(g.finance.clubs)) {
    if (id === g.clubId) continue;
    const m = (c.ledger['2027-07'] ??= { in: {}, out: {} });
    m.out.invest = Math.round(c.plan.domestic * 0.2);
  }
  infraSeason(g, '2027-07-01');
  const sub = Object.entries(g.infra.clubs).filter(([, I]) => Object.keys(I.req ?? {}).length);
  // Skala światowa (Nov 18, 2026): większe i droższe kroki bazy i akademii, więc mniej wniosków w jednym sezonie
  assert.ok(sub.length >= 8, `wnioski AI: ${sub.length}`);
  assert.ok(sub.every(([, I]) => Object.values(I.req).every((r) => r.ai)));
  const msgs = [...infraRequestsDay(g, '2027-07-01'), ...runDays(g, 60)];
  assert.equal(msgs.length, 0, 'bez poczty dla klubów AI');
  const started = sub.filter(([, I]) => Object.keys(I.proj).length).length;
  assert.ok(started >= sub.length * 0.6, `ruszyło ${started} z ${sub.length}`);
  assert.ok(Object.values(g.infra.clubs).every((I) => !Object.keys(I.req ?? {}).length || Object.values(I.req).every((r) => r.decideOn >= g.date || r.cond)), 'bez zaległych decyzji');
});

test('Licencja: wniosek w toku chroni przed karą; klub AI z brakiem ponawia wniosek 1. dnia miesiąca', () => {
  const g = fresh(); const id = g.clubId; const I = infraOf(g, id); const c = g.finance.clubs[id];
  I.training = 2; c.balance = 30e6;
  infraSeason(g, '2027-07-01');
  assert.ok(I.licence);
  g.date = '2028-06-20';
  assert.ok(submitRequest(g, id, 'training').ok);
  const b = c.balance;
  const m = infraSeason(g, '2028-07-01');
  assert.equal(c.balance, b, 'bez kary');
  assert.ok(!m.some((x) => /Kara licencyjna/.test(x.subject)));
  // Klub AI: brak licencyjny bez wniosku -> wniosek 1. dnia miesiąca
  const ai = 'korona'; const A = infraOf(g, ai);
  A.academy = 2; A.req = {};
  infraRequestsDay(g, '2028-08-01');
  assert.ok(A.req.academy?.ai && A.req.academy.licence);
});

test('Stary zapis bez wniosków: ensureInfra uzupełnia req i reqLast', () => {
  const g = fresh();
  g.infra.v = 1;
  for (const I of Object.values(g.infra.clubs)) { delete I.req; delete I.reqLast; }
  ensureInfra(g);
  assert.equal(g.infra.v, 3); // v1 -> v2 (wnioski) -> v3 (skala światowa)
  assert.deepEqual(infraOf(g, 'legia').req, {});
  assert.deepEqual(infraOf(g, 'legia').reqLast, {});
  g.finance.clubs[g.clubId].balance = 300e6;
  assert.ok(submitRequest(g, g.clubId, 'academy').ok);
  infraRequestsDay(g, '2026-07-11');
  clean(renderClubHub(g, { kTab: 'infrastruktura' }));
});

test('Widok wniosku: przycisk, potwierdzenie z czasem decyzji, etapy i panel „Wnioski w toku”', () => {
  const g = fresh(); const id = g.clubId; g.finance.clubs[id].balance = 300e6;
  const h0 = renderClubHub(g, { kTab: 'infrastruktura' });
  assert.match(h0, /Złóż wniosek do zarządu/); clean(h0);
  const h1 = renderClubHub(g, { kTab: 'infrastruktura', infAsk: 'stadium' });
  assert.match(h1, /Zarząd odpowie w 3-7 dni, potem pozwolenie miasta ok\. 1-1,5 mies\./);
  assert.match(h1, />Złóż wniosek</); clean(h1);
  handleClubAction(g, 'inf-confirm', { track: 'stadium' });
  const h2 = renderClubHub(g, { kTab: 'infrastruktura' });
  assert.match(h2, /Wnioski w toku/);
  assert.match(h2, /decyzja ok\./); assert.match(h2, /czeka/);
  assert.match(h2, /Wycofaj wniosek/);
  assert.ok(!/Rozbudowa trybun<\/h4>/.test(h2), 'trybuny ukryte przy wniosku na stadion');
  clean(h2);
  assert.ok(INFRA.UPFRONT > 0);
});
