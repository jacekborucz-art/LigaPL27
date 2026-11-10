import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import {
  startNegotiation, renderNegotiation, handleNegotiationAction, isNegotiationAction, readNegotiationForm,
  mergeDraft, offerIssues, windowEndFor, minutesShareOf, ageLabel,
} from '../src/ui/negotiationView.js';

const BIG = { maxWage: 10_000_000, maxSignOn: 100_000_000 };
const newGame = () => ({ seed: 'ekran', clubId: 'lech', date: '2026-08-10', world: generateWorld('ekran'), fixtures: [] });

/** Pierwszy zawodnik, z którym da się otworzyć rozmowy. */
function openFirst(game, kind, ids, extra = {}) {
  for (const id of ids) {
    const r = startNegotiation(game, { kind, playerId: id, limits: BIG, ...extra });
    if (r.ok) return r.ng;
  }
  throw new Error(`Brak zawodnika do rozmów (${kind})`);
}
const renewNg = (game) => openFirst(game, 'renew', squadOf(game.world, 'lech').map((p) => p.id));
const signNg = (game, extra = {}) => openFirst(game, 'sign', squadOf(game.world, 'legia').map((p) => p.id), { fromClub: 'legia', ...extra });

/** Gracz przyjmuje kontroferty, aż dojdzie do porozumienia. */
function negotiateToDeal(game, ng) {
  let r = handleNegotiationAction(game, ng, 'ng-propose', {}, null);
  for (let i = 0; i < 10 && !r.done; i++) {
    r = handleNegotiationAction(game, r.ng, ng.counter ? 'ng-take' : 'ng-propose', {}, null);
  }
  return r;
}

/** Gracz uparcie składa obraźliwe oferty, aż rozmowy się zerwą. */
function lowballToFailure(game, ng) {
  let r = { ng, done: null };
  for (let i = 0; i < 12 && !r.done; i++) r = handleNegotiationAction(game, r.ng, 'ng-propose', {}, { wage: '100', agentFee: '0' });
  return r;
}

test('Prefiks akcji i pomocnicze funkcje', () => {
  assert.ok(isNegotiationAction('ng-propose'));
  assert.ok(!isNegotiationAction('tr-day'));
  assert.ok(!isNegotiationAction(undefined));
  assert.equal(windowEndFor('2026-08-10'), '2026-09-01');
  assert.equal(windowEndFor('2026-11-10'), '2027-06-30');
  assert.equal(ageLabel(24), '24 lata');
  assert.equal(ageLabel(25), '25 lat');
  assert.equal(ageLabel(12), '12 lat');
  const p = { season: { min: 900 } };
  assert.equal(minutesShareOf({ fixtures: [] }, p, 'lech'), 0.5); // początek sezonu
  const fx = Array.from({ length: 10 }, (_, i) => ({ played: true, home: i % 2 ? 'lech' : 'x', away: i % 2 ? 'x' : 'lech' }));
  assert.equal(minutesShareOf({ fixtures: fx }, p, 'lech'), 1);
  assert.equal(minutesShareOf({ fixtures: fx }, { season: { min: 450 } }, 'lech'), 0.5);
});

test('Start: odmowy przy złym rodzaju rozmów i nieznanym zawodniku', () => {
  const game = newGame();
  const own = squadOf(game.world, 'lech')[0].id;
  const other = squadOf(game.world, 'legia')[0].id;
  assert.equal(startNegotiation(game, { kind: 'sign', playerId: own }).reason, 'ownPlayer');
  assert.equal(startNegotiation(game, { kind: 'renew', playerId: other }).reason, 'notOwn');
  assert.equal(startNegotiation(game, { kind: 'renew', playerId: 'nikt' }).reason, 'noPlayer');
  const far = squadOf(game.world, 'lech').find((p) => p.contract.until >= '2028-06-30');
  const r = startNegotiation(game, { kind: 'renew', playerId: far.id });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'tooEarly');
  assert.ok(r.text.length > 0);
});

test('Start jest deterministyczny i daje rozmowę z kwestią otwarcia', () => {
  const a = renewNg(newGame());
  const b = renewNg(newGame());
  assert.equal(a.playerId, b.playerId);
  assert.deepEqual(a.session.hidden, b.session.hidden);
  assert.equal(a.log.length, 1);
  assert.ok(['agent', 'player'].includes(a.log[0].who));
  assert.equal(a.kind, 'renew');
  assert.ok(a.draft.wage > 0);
});

test('Przedłużenie: porozumienie zapisuje kontrakt w zawodniku', () => {
  const game = newGame();
  const ng = renewNg(game);
  const player = game.world.players[ng.playerId];
  const before = player.contract.until;
  const r = negotiateToDeal(game, ng);
  assert.ok(r.done, 'rozmowy zakończone');
  assert.equal(r.done.accepted, true);
  assert.equal(r.save, true);
  assert.equal(r.done.kind, 'renew');
  assert.ok(r.done.outcome && r.done.outcome.accepted);
  assert.ok(r.done.contract.until > before);
  assert.deepEqual(player.contract.until, r.done.contract.until);
  assert.equal(player.contract.wage, r.done.contract.wage);
  assert.equal(player.relations.lech.history.at(-1).result, 'podpisany');
  assert.equal(player.clubId, 'lech');
  // Po zakończeniu kolejne akcje nic nie zmieniają, a „Podpisz kontrakt” zamyka ekran.
  const again = handleNegotiationAction(game, ng, 'ng-propose', {}, null);
  assert.equal(again.done, null);
  assert.equal(again.save, false);
  const html = renderNegotiation(game, ng);
  assert.ok(html.includes('Podpisz kontrakt'));
  assert.equal(handleNegotiationAction(game, ng, 'ng-close').ng, null);
});

test('Podpisanie: porozumienie zwraca kontrakt, ale nie przenosi zawodnika', () => {
  const game = newGame();
  const ng = signNg(game, { fee: 1_500_000 });
  const player = game.world.players[ng.playerId];
  const r = negotiateToDeal(game, ng);
  assert.equal(r.done.accepted, true);
  assert.equal(r.done.kind, 'sign');
  assert.equal(r.done.fromClub, 'legia');
  assert.equal(r.done.fee, 1_500_000);
  assert.ok(r.done.contract.wage > 0 && r.done.contract.until);
  assert.equal(player.clubId, 'legia');
  assert.ok(game.world.clubs.legia.squad.includes(player.id));
  assert.ok(!game.world.clubs.lech.squad.includes(player.id));
  assert.equal(player.relations.lech.history.at(-1).result, 'podpisany');
});

test('Fiasko: blokada rozmów zapisana w zawodniku, ponowny start zwraca locked', () => {
  const game = newGame();
  const ng = renewNg(game);
  const player = game.world.players[ng.playerId];
  const r = lowballToFailure(game, ng);
  assert.ok(r.done);
  assert.equal(r.done.accepted, false);
  assert.equal(r.done.contract, null);
  assert.equal(r.save, true);
  const lock = r.done.outcome.lock;
  assert.ok(lock && lock.until > game.date);
  assert.equal(player.relations.lech.lockUntil, lock.until);
  assert.ok(player.relations.lech.grudge > 0);
  const html = renderNegotiation(game, ng);
  assert.ok(html.includes('Wróć'));
  assert.ok(html.includes('do '));
  const again = startNegotiation(game, { kind: 'renew', playerId: ng.playerId, limits: BIG });
  assert.equal(again.ok, false);
  assert.ok(['locked', 'refused'].includes(again.reason));
});

test('Podpisanie: fiasko blokuje rozmowy z klubem gracza', () => {
  const game = newGame();
  const ng = signNg(game);
  const r = lowballToFailure(game, ng);
  assert.equal(r.done.accepted, false);
  const player = game.world.players[ng.playerId];
  assert.equal(player.relations.lech.lockUntil, r.done.outcome.lock.until);
  assert.equal(startNegotiation(game, { kind: 'sign', playerId: ng.playerId, fromClub: 'legia', limits: BIG }).reason, 'locked');
});

test('Oferta ponad limit klubu nie trafia do silnika', () => {
  const game = newGame();
  const r0 = startNegotiation(game, { kind: 'sign', playerId: squadOf(game.world, 'legia')[3].id, fromClub: 'legia', limits: { maxWage: 5000, maxSignOn: 20000 } });
  assert.ok(r0.ok);
  const ng = r0.ng;
  assert.ok(ng.draft.wage <= 5000, 'domyślna pensja mieści się w limicie');
  const logLen = ng.log.length;
  let r = handleNegotiationAction(game, ng, 'ng-propose', {}, { wage: '6000' });
  assert.equal(ng.session.round, 0);
  assert.equal(ng.log.length, logLen);
  assert.equal(r.done, null);
  assert.equal(r.save, false);
  assert.match(ng.error, /limit/);
  assert.ok(renderNegotiation(game, ng).includes('Oferty nie można wysłać'));
  r = handleNegotiationAction(game, ng, 'ng-propose', {}, { wage: '4000', signOn: '50000' });
  assert.equal(ng.session.round, 0);
  assert.match(ng.error, /Premia za podpis/);
  assert.deepEqual(offerIssues(ng, mergeDraft(ng.draft, { wage: '4000', signOn: '0' })), []);
  r = handleNegotiationAction(game, ng, 'ng-propose', {}, { wage: '4000', signOn: '0' });
  assert.equal(ng.error, null);
  assert.equal(ng.session.round, 1);
});

test('Przyciski pensji i formularz w DOM', () => {
  const game = newGame();
  const ng = signNg(game);
  const w = ng.draft.wage;
  handleNegotiationAction(game, ng, 'ng-wage', { d: '1000' }, null);
  assert.equal(ng.draft.wage, w + 1000);
  handleNegotiationAction(game, ng, 'ng-wage', { d: '-100' }, null);
  assert.equal(ng.draft.wage, w + 900);

  // Atrapa DOM: querySelector po atrybucie name.
  const vals = {
    'ng-wage': '12345', 'ng-years': '4', 'ng-role': 'kluczowy', 'ng-signOn': '30000', 'ng-bonusGoal': '2000',
    'ng-bonusApp': '300', 'ng-clause': '5000000', 'ng-agentFee': '40000',
  };
  const box = {
    querySelector(sel) {
      const m = sel.match(/name="([^"]+)"/);
      if (!m) return null;
      if (m[1] === 'ng-clauseForeign') return { checked: true };
      return m[1] in vals ? { value: vals[m[1]] } : null;
    },
  };
  const root = { querySelector: (sel) => (sel === '[data-ng-form]' ? box : null) };
  const form = readNegotiationForm(root);
  assert.equal(form.wage, '12345');
  assert.equal(form.clauseForeign, true);
  assert.equal(readNegotiationForm({ querySelector: () => null }), null);
  const d = mergeDraft(ng.draft, form);
  assert.equal(d.wage, 12345);
  assert.equal(d.years, 4);
  assert.equal(d.role, 'kluczowy');
  assert.equal(d.signOn, 30000);
  assert.deepEqual([d.bonus.goal, d.bonus.app], [2000, 300]);
  assert.deepEqual(d.clause, { amount: 5000000, foreignOnly: true });
  assert.equal(mergeDraft(d, { clause: '' }).clause, null);
});

test('Widok: imię zawodnika, polskie teksty, bez długich myślników', () => {
  const game = newGame();
  const ng = renewNg(game);
  const player = game.world.players[ng.playerId];
  let html = renderNegotiation(game, ng);
  assert.ok(html.includes(player.name));
  assert.ok(html.includes('Złóż ofertę'));
  assert.ok(html.includes('Zakończ rozmowy'));
  assert.ok(html.includes('Obecny kontrakt'));
  assert.ok(!html.includes('\u2014'));
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(html), 'daty w formacie MMM D, YYYY');
  // Kilka rund i ekran końcowy też bez długich myślników.
  negotiateToDeal(game, ng);
  html = renderNegotiation(game, ng);
  assert.ok(!html.includes('\u2014'));
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(html));
});

test('Zakończenie rozmów przed pierwszą ofertą nie ma skutków', () => {
  const game = newGame();
  const ng = signNg(game);
  const player = game.world.players[ng.playerId];
  const r = handleNegotiationAction(game, ng, 'ng-walk', {}, null);
  assert.equal(r.done.accepted, false);
  assert.equal(r.done.outcome, null);
  assert.equal(r.save, false);
  assert.equal(player.relations?.lech, undefined);
});

test('Zakończenie rozmów po ofercie działa jak zerwanie (blokada)', () => {
  const game = newGame();
  const ng = renewNg(game);
  handleNegotiationAction(game, ng, 'ng-propose', {}, null);
  if (ng.done) return; // pierwsza oferta mogła od razu zakończyć rozmowy
  const r = handleNegotiationAction(game, ng, 'ng-walk', {}, null);
  assert.equal(r.done.accepted, false);
  assert.equal(r.done.outcome.reason, 'walkaway');
  assert.equal(r.save, true);
  assert.ok(game.world.players[ng.playerId].relations.lech.lockUntil > game.date);
});

test('Sprawdzenie blefu dostępne tylko, gdy agent powołał się na inną ofertę', () => {
  const game = newGame();
  let found = false;
  for (const p of squadOf(game.world, 'legia')) {
    const r = startNegotiation(game, { kind: 'sign', playerId: p.id, fromClub: 'legia', limits: BIG });
    if (!r.ok) continue;
    const ng = r.ng;
    assert.ok(!renderNegotiation(game, ng).includes('ng-bluff'));
    for (let i = 0; i < 6 && !ng.done && !ng.session.view().canCallBluff; i++) {
      handleNegotiationAction(game, ng, 'ng-propose', {}, { wage: String(ng.draft.wage + 200) });
    }
    if (!ng.session.view().canCallBluff) continue;
    found = true;
    assert.ok(renderNegotiation(game, ng).includes('Sprawdź blef'));
    const round = ng.session.round;
    const res = handleNegotiationAction(game, ng, 'ng-bluff', {}, null);
    assert.equal(ng.session.round, round, 'sprawdzenie nie zużywa rundy');
    assert.ok(ng.notice);
    assert.equal(res.save, false);
    assert.ok(!renderNegotiation(game, ng).includes('Sprawdź blef'));
    break;
  }
  assert.ok(found, 'w kadrze Legii jest agent, który blefuje');
});
