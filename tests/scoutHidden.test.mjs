// Ukryta ocena kandydatów ze skautingu (decyzja właściciela Nov 20, 2026, docs/skauting.md rozdz. 7): w Transferach
// lornetka zamiast OVR i atrybutów, ocena tylko w zdaniu skauta; po podpisaniu prawdziwe wartości; kluby AI bez zmian.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { scoutHidden, scoutOpinion, makeReport, ensureScoutOps, scoutingView } from '../src/career/scoutOps.js';
import { completeTransfer } from '../src/career/transfers.js';
import { renderTransfers, transferCardHtml, compareText } from '../src/ui/transfersView.js';
import { renderPlayerProfile } from '../src/ui/squadView.js';
import { renderNegotiation, startNegotiation } from '../src/ui/negotiationView.js';
import { SCOUT_EYE_TEXT, SCOUT_ATTR_NOTE } from '../src/ui/scoutMask.js';
import '../src/season/dailySystems.js';

function newGame(seed = 77, clubId = 'widzew') {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'A', lastName: 'B' } } };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g); processDay(g);
  return g;
}

/** Zawodnik z puli zagranicznej jako kandydat skauta klubu club (raport z błędem skauta jak w finishMission). */
function makeCandidate(g, { free = false, club = g.clubId, confidence = null } = {}) {
  ensureScoutOps(g);
  const p = g.market.foreign.map((id) => g.world.players[id]).find((x) => x && !x.clubId && !!x.free === free && !x.scout);
  const m = { id: `mt-${p.id}`, club, region: 'balkany', calc: { a: 0.5 } };
  const rep = makeReport(g, m, { q: 10, a: {} }, p);
  if (confidence) rep.confidence = confidence;
  p.scout = { club, mission: m.id, found: g.date, excl: g.date, until: '2027-06-30', pct: 0, scout: 'Jan Skaut' };
  g.scoutOps.cands[p.id] = { pid: p.id, mission: m.id, club, found: g.date, excl: g.date, until: '2027-06-30', seen: false, watched: true, state: 'active', goneText: null, snap: { name: p.name, nat: p.nat, age: p.age, pos: p.pos }, rep };
  return { p, rep };
}
const eyeRe = new RegExp(`class="scout-eye[^"]*" role="img" aria-label="${SCOUT_EYE_TEXT}"`);

test('scoutHidden: tylko kandydat klubu gracza przed podpisaniem i przed wygaśnięciem raportu', () => {
  const g = newGame();
  const { p } = makeCandidate(g);
  assert.equal(scoutHidden(g, p), true);
  const other = g.market.foreign.map((id) => g.world.players[id]).find((x) => x && !x.scout);
  assert.equal(scoutHidden(g, other), false, 'zwykły zawodnik z zagranicy: OVR widoczny');
  assert.equal(scoutHidden(g, { ...p, scout: { ...p.scout, club: 'lech' } }), false, 'kandydat klubu AI: bez zmian');
  assert.equal(scoutHidden(g, { ...p, scout: { ...p.scout, released: true } }), false, 'raport wygasł, zwykły rynek');
  assert.equal(scoutHidden(g, { ...p, clubId: 'lech' }), false, 'podpisał w Polsce');
});

test('Transfery: lista Z zagranicy, karta transferowa, karta w okienku, profil i rozmowy bez prawdziwego OVR i atrybutów', () => {
  const g = newGame();
  const { p } = makeCandidate(g);
  const ovr = Math.round(p.ovr);
  // Lista Z zagranicy: w komórce OVR lornetka, bez liczby
  const list = renderTransfers(g, { tfTab: 'rynek', tfList: 'abroad', tfSort: { k: 'ovr', dir: 'desc' } });
  const row = list.match(new RegExp(`<tr data-pid="${p.id}">[\\s\\S]*?</tr>`))?.[0];
  assert.ok(row, 'kandydat na liście');
  assert.match(row, /<td class="xl__ovr"><span class="scout-eye/);
  assert.ok(!row.includes(`<td class="xl__ovr">${ovr}</td>`));
  // Karta transferowa: nagłówek, mocne strony, porównanie
  const card = renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id });
  assert.match(card, eyeRe);
  assert.ok(!/<b class="tf-ch__ovr" title="Ocena ogólna 1-20">/.test(card), 'bez liczby OVR w nagłówku');
  assert.ok(card.includes(SCOUT_ATTR_NOTE), 'atrybuty ukryte z notą');
  assert.ok(!/<ul class="tf-attrs">/.test(card));
  assert.match(compareText(g, p), /ocenia skaut w raporcie/);
  assert.ok(!/lepszy o|słabszy o|ten sam poziom/.test(compareText(g, p)));
  // Karta w okienku (nazwisko jak link)
  const pc = transferCardHtml(g, p);
  assert.match(pc, eyeRe);
  assert.ok(!/class="tdet__ovr" aria-label="Ocena ogólna/.test(pc));
  assert.ok(!/<ul class="attrs">/.test(pc) && pc.includes(SCOUT_ATTR_NOTE));
  // Profil i statystyki
  const pr = renderPlayerProfile(p, { clubName: 'x', game: g, foreign: true, hidden: scoutHidden(g, p) });
  assert.match(pr, eyeRe);
  assert.ok(!/class="pp__ovrn" title/.test(pr) && !/<ul class="attrs">/.test(pr));
  assert.match(pr, /Ocena w raporcie skauta/);
  // Rozmowy z wolnym kandydatem: bez OVR w nagłówku
  const { p: fp } = makeCandidate(g, { free: true });
  const r = startNegotiation(g, { kind: 'sign', playerId: fp.id });
  if (r.ok) { // wolny kandydat może odmówić rozmów (chęć z modelu negocjacji)
    const html = renderNegotiation(g, r.ng);
    assert.match(html, /ocenę zna skaut/);
    assert.ok(!new RegExp(`OVR ${Math.round(fp.ovr)},`).test(html));
  }
});

test('Po podpisaniu w klubie gracza: prawdziwy OVR i atrybuty; zwykły zawodnik z zagranicy bez zmian', () => {
  const g = newGame();
  const other = g.market.foreign.map((id) => g.world.players[id]).find((x) => x && !x.scout && !x.free);
  const pc0 = transferCardHtml(g, other);
  assert.match(pc0, /class="tdet__ovr" aria-label="Ocena ogólna/);
  assert.ok(!pc0.includes('scout-eye'));
  const { p } = makeCandidate(g);
  completeTransfer(g, { playerId: p.id, to: g.clubId, fee: 0, contract: { wage: 5000, until: '2029-06-30' } });
  assert.equal(p.clubId, g.clubId);
  assert.equal(scoutHidden(g, p), false);
  const pc = transferCardHtml(g, p);
  assert.match(pc, new RegExp(`class="tdet__ovr" aria-label="Ocena ogólna ${Math.round(p.ovr)} `));
  assert.match(pc, /<ul class="attrs">/);
});

test('Zdanie skauta: ocena z raportu, słabsza pewność to ostrożniejsze słowa; raport w poczcie bez gołych przedziałów', () => {
  const high = scoutOpinion({ ovrRange: [11, 12], potRange: [12, 14], confidence: 'wysoka' });
  assert.equal(high, 'Moim zdaniem to zawodnik na poziomie ok. 11-12, potencjał do 14.');
  assert.match(scoutOpinion({ ovrRange: [11, 13], potRange: [12, 15], confidence: 'średnia' }), /^Wygląda mi na zawodnika na poziomie ok\. 11-13, potencjał może sięgnąć 15\.$/);
  assert.match(scoutOpinion({ ovrRange: [10, 13], potRange: [11, 15], confidence: 'niska' }), /^Trudno mi go dobrze ocenić\. .*tylko przeczucie\.$/);
  assert.match(scoutOpinion({ ovrRange: [12, 12], potRange: [12, 12], confidence: 'wysoka' }), /poziomie ok\. 12, bez dużego zapasu/);
  const g = newGame();
  makeCandidate(g);
  const v = scoutingView(g);
  assert.ok(v.candidates.length && v.candidates.every((c) => /poziomie/.test(c.opinion)));
});

test('Kandydat skauta: wolny dołącza w każdej chwili, wartość zastąpiona ceną wg skauta', async () => {
  const { lateFree } = await import('../src/ui/transfersView.js');
  const { valueOrScoutPrice, valueLabel } = await import('../src/ui/scoutMask.js');
  const g = { date: '2026-10-20', clubId: 'widzew', scoutOps: { cands: { x: { rep: { priceRange: [1000000, 1500000] } } } } };
  assert.equal(lateFree(g, { id: 'x', freeSince: '2026-10-10', scout: { club: 'widzew' } }), false, 'wolny kandydat skauta bez czekania na okno');
  const fmt = (n) => `${n} zł`;
  const hidden = { id: 'x', clubId: null, abroad: { club: 'K' }, value: 2100000, scout: { club: 'widzew', until: '2026-12-31' } };
  const shown = valueOrScoutPrice(g, hidden, fmt);
  if (valueLabel(g, hidden) === 'Cena wg skauta') assert.ok(!shown.includes('2100000') && shown.includes('1000000'));
});
