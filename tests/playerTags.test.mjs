// Znaczniki stanu zawodnika w Kadrze (src/ui/playerTags.js, docs/tagi-zawodnika.md): warunki, kolejność, limit
// z „+N”, prywatność zawodników innych klubów, powód pauzy (żółte albo czerwona) i stare zapisy bez powodu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { Rng } from '../src/core/rng.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { playerTagList, playerTags, oneYellowAway, TAG_LIMIT } from '../src/ui/playerTags.js';
import { renderSquadList } from '../src/ui/squadView.js';
import { clearSuspWhy, pruneSuspWhy, noteSuspWhy, moveSuspWhy } from '../src/season/suspension.js';
import '../src/season/dailySystems.js';

let base = null;
function fresh() {
  if (!base) {
    applySeasonState({});
    const g = { seed: 3, clubId: 'legia', date: '2026-07-01', season: '2026/27', inbox: [] };
    g.world = generateWorld(3); g.season = createSeason(3, { playerClub: 'legia' }); g.fixtures = g.season.fixtures;
    g.tactics = createTactics(squadOf(g.world, 'legia'), { benchSize: 9 });
    ensureCareer(g);
    processDay(g);
    base = g;
  }
  const g = structuredClone(base);
  g.date = '2026-08-10';
  return g;
}
/** Zawodnik bez żadnego znacznika (kontrakt po sezonie, wypoczęty, bez kartek i spraw transferowych). */
function calm(g, club = 'legia') {
  const p = squadOf(g.world, club).find((x) => x.pos !== 'BR' && x.contract && x.contract.until > '2027-06-30' && !x.loan && !x.preContract);
  Object.assign(p, { fresh: 95, injuryDays: 0, injury: null, susp: {}, yc: {}, suspended: 0 });
  delete p.callUp; delete p.moveWish; delete p.transferRequest; delete p.suspWhy;
  assert.deepEqual(playerTagList(g, p), [], 'zawodnik bez znaczników');
  return p;
}
const keys = (g, p, opts) => playerTagList(g, p, opts).map((t) => t.k);
const tagOf = (g, p, k, opts) => playerTagList(g, p, opts).find((t) => t.k === k);

test('Każdy znacznik: warunek, etykieta i podpowiedź', () => {
  const g = fresh();
  const p = calm(g);
  p.susp = { ekstraklasa: 2 }; p.suspWhy = { ekstraklasa: 'y' };
  assert.deepEqual(tagOf(g, p, 'sy'), { k: 'sy', label: 'P2', title: 'Pauza za kartki: 2 mecze w Ekstraklasie (żółte kartki)', o: false });
  p.suspWhy = { ekstraklasa: 'r' };
  assert.equal(tagOf(g, p, 'sr').label, 'P2', 'czerwona kartka: czerwony znacznik');
  p.susp = { liga2: 1 }; delete p.suspWhy;
  assert.equal(tagOf(g, p, 's2').o, true, 'pauza tylko w innej klasie: obrys');
  p.susp = {};
  p.injuryDays = 12; p.injury = { name: 'uraz mięśnia uda', days: 12 };
  assert.equal(tagOf(g, p, 'inj').label, '+12');
  assert.match(tagOf(g, p, 'inj').title, /uraz mięśnia uda, ok\. 12 dni/);
  p.injuryDays = 140;
  assert.equal(tagOf(g, p, 'inj').label, '99+');
  p.injuryDays = 0;
  p.callUp = { team: 'POL', u21: true, from: '2026-08-08', to: '2026-08-14', key: 'x' };
  assert.match(tagOf(g, p, 'nt').title, /Polska U21, wraca po 14 sie 2026/);
  delete p.callUp;
  g.market.deals = [...(g.market.deals ?? []), { id: 'd-test', pid: p.id, from: 'legia', to: 'lech', stage: 'medical', fee: 1 }];
  assert.match(tagOf(g, p, 'tr').title, /^Odchodzi do .+: testy medyczne$/);
  g.market.deals = g.market.deals.filter((d) => d.id !== 'd-test');
  p.preContract = { club: 'lech', start: '2027-07-01' };
  assert.match(tagOf(g, p, 'pk').title, /^Przedkontrakt: odchodzi do .+ od 1 lip 2027$/);
  delete p.preContract;
  g.market.offers.push({ id: 'o1', kind: 'incoming', playerId: p.id, from: 'lech', fee: 1e6, status: 'open', date: g.date, expires: '2026-08-15' });
  g.market.offers.push({ id: 'o2', kind: 'incoming', playerId: p.id, from: 'pogon', fee: 1e6, status: 'open', date: g.date, expires: '2026-08-01' });
  assert.equal(tagOf(g, p, 'of').label, 'O1', 'wygasła oferta się nie liczy');
  g.market.offers = [];
  p.moveWish = { stage: 'cicha', since: g.date, why: 'hazard', club: 'legia' };
  assert.match(tagOf(g, p, 'mw').title, /cicha prośba/);
  delete p.moveWish;
  p.yc = { ekstraklasa: 3, cup: 1 };
  assert.deepEqual(oneYellowAway(p, 1), [['ekstraklasa', 3], ['cup', 1]]);
  assert.match(tagOf(g, p, 'y1').title, /liga \(3 żółte\), Puchar Polski \(1 żółta\)/);
  p.yc = { ekstraklasa: 4, uefa: 2 };
  assert.deepEqual(oneYellowAway(p, 1), [['uefa', 2]], '4 żółte: następna pauza dopiero po 8');
  p.yc = {};
  g.market.userListed[p.id] = 2e6;
  assert.equal(tagOf(g, p, 'tl').label, 'T');
  delete g.market.userListed[p.id];
  (g.market.loanAsks ??= {})[p.id] = { terms: {}, date: g.date, due: g.date };
  assert.match(tagOf(g, p, 'll').title, /szuka klubu/);
  delete g.market.loanAsks[p.id];
  const until = p.contract.until;
  p.contract.until = '2027-06-30'; p.renewRefused = true;
  assert.equal(tagOf(g, p, 'kw').title, 'Kontrakt wygasa 30 cze 2027, odmówił przedłużenia');
  p.contract.until = until; p.renewRefused = false;
  p.loan = { from: 'lech', until: '2027-06-30' };
  assert.equal(tagOf(g, p, 'li').label, 'W+');
  assert.equal(tagOf(g, p, 'lo', { clubId: 'lech' }).label, 'W−', 'z perspektywy klubu macierzystego');
  delete p.loan;
  p.fresh = 70;
  assert.equal(tagOf(g, p, 'z').title, 'Zmęczony: kondycja 70%');
  p.contract = null; p.clubId = null;
  assert.doesNotThrow(() => playerTagList(g, p), 'bez kontraktu i klubu');
});

test('Kolejność według ważności, limit 2 na telefonie i 4 na PC z „+N”', () => {
  const g = fresh();
  const p = calm(g);
  p.fresh = 60; p.contract.until = '2027-06-30';
  p.loan = { from: 'lech', until: '2027-06-30' };
  g.market.userListed[p.id] = 1e6;
  p.yc = { ekstraklasa: 3 };
  p.moveWish = { stage: 'oficjalna', since: g.date, club: 'legia' };
  g.market.offers.push({ id: 'o1', kind: 'incoming', playerId: p.id, from: 'lech', fee: 1e6, status: 'open', date: g.date, expires: '2026-08-15' });
  p.preContract = { club: 'lech', start: '2027-07-01' };
  p.callUp = { team: 'POL', u21: false, to: '2026-08-14' };
  p.injuryDays = 5; p.injury = { name: 'stłuczenie', days: 5 };
  p.susp = { ekstraklasa: 1 }; p.suspWhy = { ekstraklasa: 'r' };
  assert.deepEqual(keys(g, p), ['sr', 'inj', 'nt', 'pk', 'of', 'mw', 'y1', 'tl', 'kw', 'li', 'z']);
  const html = playerTags(g, p);
  assert.equal(TAG_LIMIT.phone, 2); assert.equal(TAG_LIMIT.pc, 4);
  assert.equal((html.match(/class="tg[ "]/g) ?? []).length, 4 + 2, '4 znaczniki i dwa warianty +N');
  assert.equal((html.match(/tg--pc/g) ?? []).length, 2, 'znaczniki 3 i 4 tylko od 760 px');
  assert.match(html, /tg-more--ph"[^>]*>\+9</);
  assert.match(html, /tg-more--pc"[^>]*title="Więcej: Oferty[^"]*"[^>]*>\+7</);
  const two = calm(g);
  two.fresh = 60; two.contract.until = '2027-06-30';
  const h2 = playerTags(g, two);
  assert.ok(!/tg-more/.test(h2) && !/tg--pc/.test(h2), 'dwa znaczniki: bez +N');
  assert.equal(playerTags(g, calm(g)), '', 'bez znaczników: pusty napis');
});

test('Prywatność: zawodnik klubu AI bez kondycji, cichej prośby, listy gracza i ofert', () => {
  const g = fresh();
  const p = calm(g, 'lech');
  p.fresh = 50;
  p.moveWish = { stage: 'cicha', since: g.date, club: 'lech' };
  g.market.offers.push({ id: 'o1', kind: 'incoming', playerId: p.id, from: 'legia', fee: 1e6, status: 'open', date: g.date, expires: '2026-08-15' });
  g.market.userListed[p.id] = 1e6;
  assert.deepEqual(keys(g, p), []);
  p.moveWish.stage = 'oficjalna';
  g.market.listed[p.id] = { kind: 'sale', club: 'lech' };
  assert.deepEqual(keys(g, p), ['mw', 'tl']);
  assert.equal(tagOf(g, p, 'tl').title, 'Na liście transferowej klubu');
  g.market.listed[p.id].kind = 'loan';
  assert.deepEqual(keys(g, p), ['mw', 'll']);
  assert.deepEqual(keys(g, p, { own: true }), ['of', 'mw', 'tl', 'z'], 'own: true: pełna wiedza');
});

test('Powód pauzy z meczu: żółte kartki albo czerwona, koniec pauzy czyści powód', () => {
  const g = fresh();
  const f = g.fixtures.find((x) => x.comp === 'ekstraklasa' && !x.played && (x.home === 'legia' || x.away === 'legia'));
  const res = playQuick(g, f, new Rng('tagi-test'));
  const s = f.home === 'legia' ? 0 : 1;
  for (const x of res.players[s]) { x.yc = 0; x.rc = 0; }
  const [xy, xr] = res.players[s];
  const py = g.world.players[xy.id]; const pr = g.world.players[xr.id];
  py.yc = { ekstraklasa: 3 }; py.susp = {}; delete py.suspWhy;
  pr.susp = {}; delete pr.suspWhy;
  xy.yc = 1; xr.rc = 1; xr.redReason = 'dogso';
  applyResult(g, f, res, new Rng('tagi-test-2'));
  assert.equal(py.susp.ekstraklasa, 1, 'czwarta żółta: pauza');
  assert.deepEqual(py.suspWhy, { ekstraklasa: 'y' });
  assert.ok(pr.susp.ekstraklasa >= 1);
  assert.deepEqual(pr.suspWhy, { ekstraklasa: 'r' });
  assert.equal(tagOf(g, py, 'sy').label, 'P1');
  assert.ok(tagOf(g, pr, 'sr'), 'czerwony znacznik po czerwonej kartce');
  // Odbycie pauzy: następny mecz ligowy bez tych zawodników
  const f2 = g.fixtures.find((x) => x.comp === 'ekstraklasa' && !x.played && x.date > f.date && (x.home === 'legia' || x.away === 'legia'));
  const res2 = playQuick(g, f2, new Rng('tagi-test-3'));
  const s2 = f2.home === 'legia' ? 0 : 1;
  res2.players[s2] = res2.players[s2].filter((x) => x.id !== py.id && x.id !== pr.id);
  applyResult(g, f2, res2, new Rng('tagi-test-4'));
  assert.equal(py.susp.ekstraklasa, 0);
  assert.equal(py.suspWhy, undefined, 'po pauzie bez powodu');
});

test('Stary zapis bez powodu pauzy: żółty znacznik bez dopisku; porządki i przeniesienie powodu', () => {
  const g = fresh();
  const p = calm(g);
  p.susp = { ekstraklasa: 1, cup: 2 };
  const t = tagOf(g, p, 'sy');
  assert.equal(t.label, 'P2');
  assert.equal(t.title, 'Pauza za kartki: 1 mecz w Ekstraklasie, 2 mecze w Pucharze Polski');
  noteSuspWhy(p, 'cup', 'r'); noteSuspWhy(p, 'cup', 'y');
  assert.equal(p.suspWhy.cup, 'r', 'czerwona ma pierwszeństwo w trwającej pauzie');
  moveSuspWhy(p, 'cup', 'liga1');
  assert.deepEqual(p.suspWhy, { liga1: 'r' });
  pruneSuspWhy(p);
  assert.equal(p.suspWhy, undefined, 'powód bez pauzy znika');
  noteSuspWhy(p, 'ekstraklasa', 'y'); clearSuspWhy(p, 'ekstraklasa');
  assert.equal(p.suspWhy, undefined);
});

test('Kadra: znaczniki za nazwiskiem w trzech widokach, bez starego znaku przy kondycji', () => {
  const g = fresh();
  const p = calm(g);
  p.injuryDays = 9; p.injury = { name: 'stłuczenie', days: 9 };
  for (const view of ['overview', 'attrs', 'stats']) {
    const html = renderSquadList(squadOf(g.world, 'legia'), { game: g, view });
    const at = html.indexOf(`data-pid="${p.id}"`);
    const row = html.slice(at, html.indexOf(view === 'overview' ? '</button>' : '</tr>', at));
    assert.match(row, /class="tg" data-k="inj" role="img" title="Kontuzja: stłuczenie, ok\. 9 dni przerwy"[^>]*>\+9</, view);
    assert.ok(!/xl__st/.test(html), `${view}: bez starego znaku`);
    if (view === 'overview') assert.match(row, /<span class="sq__nl"><b>[^<]+<\/b><span class="tg-row">/);
    else assert.match(row, /<span class="xl__nmw"><button[^]*?<\/button><span class="tg-row">/);
  }
});
