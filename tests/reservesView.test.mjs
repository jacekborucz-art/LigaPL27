// Kadra > Rezerwy (src/ui/reservesView.js): ekran, każda akcja „rz-*” obsłużona, dialog prośby z odpowiedzią od razu,
// wymuszenie przez dyrektora sportowego, awaria z „Uzupełnij awaryjnie”, klub bez rezerw (brak podzakładki i wpisów menu),
// plakietki i pauzy per klasa w Kadrze, bez pauzy em i bez etykiet wielkimi literami.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureReserves, RSV } from '../src/career/reserves.js';
import '../src/season/dailySystems.js';
import { renderReserves, handleReservesAction, isReservesAction, reservesStrip, rzChipFn, hasReserves, rzMenuItems } from '../src/ui/reservesView.js';
import { playerMenu, flattenMenu } from '../src/ui/playerMenus.js';
import { renderSquadList, suspSplit } from '../src/ui/squadView.js';
import { renderTactics } from '../src/ui/tacticsView.js';

// Ziarno 3: Legia II (2 Liga) gra w sobotę 1 sierpnia 12:00, Legia w niedzielę 2 sierpnia 14:45 (tests/reserves.test.mjs)
const cache = {};
function base(clubId) {
  if (cache[clubId]) return cache[clubId];
  const g = { seed: 3, clubId, date: '2026-07-01', season: '2026/27', inbox: [], board: { trust: 60 } };
  g.world = generateWorld(3); g.season = createSeason(3, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 9 });
  processDay(g);
  ensureReserves(g).list = [];
  return (cache[clubId] = g);
}
const fresh = (clubId = 'legia', date = '2026-07-27') => { const g = structuredClone(base(clubId)); g.date = date; return g; };
const BAD = new RegExp(`undefined|NaN|\\bnull\\b|\\[object|${String.fromCharCode(8212)}`);
const visible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
function clean(html, label) {
  assert.ok(!BAD.test(html.replace(/data-[a-z-]+="[^"]*"/g, '')), `bez śmieci i pauzy em: ${label}`);
  const caps = visible(html).match(/\b[A-ZĄĆĘŁŃÓŚŹŻ]{4,}\b/g);
  assert.ok(!caps, `bez etykiet wielkimi literami (${label}): ${caps}`);
}
const step = (g, ui, act, ds = {}) => { const r = handleReservesAction(g, act, ds, ui); Object.assign(ui, r.ui); return r; };
const SRC = readFileSync(new URL('../src/ui/reservesView.js', import.meta.url), 'utf8');
const CASES = [...SRC.matchAll(/case '(rz-[a-z-]+)'/g)].map((m) => m[1]);
const actsIn = (html) => [...html.matchAll(/data-act="(rz-[a-z-]+)"/g)].map((m) => m[1]);
const field = (g, club) => squadOf(g.world, club).filter((p) => p.pos !== 'BR').sort((a, b) => a.ovr - b.ovr);

test('Rezerwy: ekran Legii (pas weekendu, mierniki, listy, kadra rezerw) bez śmieci', () => {
  const g = fresh();
  assert.equal(hasReserves(g), true);
  const ui = {};
  const html = renderReserves(g, ui);
  clean(html, 'ekran');
  assert.match(html, /class="rz-week"/);
  assert.match(html, /Do rezerw na mecz/);
  assert.match(html, /Z rezerw do kadry meczowej/);
  assert.match(html, /Kadra rezerw \(\d+\)/);
  assert.match(html, /Legia II/);
  assert.match(html, /data-act="rz-ask"[^>]*data-dir="down"/);
  assert.match(html, /data-act="rz-ask"[^>]*data-dir="up"/);
  assert.match(html, /Zgłoszenia na mecz rezerw/);
  assert.ok(!/Nie udało się wczytać/.test(html));
  for (const a of actsIn(html)) assert.ok(CASES.includes(a), `akcja ${a} obsłużona`);
});

test('Rezerwy: każda akcja rz-* z widoku i menu ma obsługę, nieznana nic nie psuje', () => {
  const all = new Set([...SRC.matchAll(/(?:data-act="|act: ')(rz-[a-z-]+)/g)].map((m) => m[1]));
  assert.ok(all.size >= 10);
  for (const a of all) assert.ok(CASES.includes(a), `case dla ${a}`);
  for (const a of ['rz-ask', 'rz-ask-send', 'rz-ask-no', 'rz-ask-ok', 'rz-force-ask', 'rz-force-go', 'rz-force-no', 'rz-cancel', 'rz-filter', 'rz-view-squad', 'rz-tip-close', 'rz-open', 'rz-retry', 'rz-emergency', 'rz-promote']) assert.ok(CASES.includes(a), a);
  assert.equal(isReservesAction('rz-ask'), true);
  assert.equal(isReservesAction('st-ask'), false);
  const g = fresh();
  assert.deepEqual(handleReservesAction(g, 'rz-xyz', {}, {}), { ui: {}, save: false });
  // akcje bez otwartego dialogu nie rzucają
  for (const a of CASES) assert.doesNotThrow(() => handleReservesAction(g, a, { id: 'brak', v: 'all', dir: 'down' }, {}), a);
});

test('Delegowanie: dialog, odpowiedź od razu, plakietka w Kadrze i Składzie, cofnięcie', () => {
  const g = fresh();
  const ui = {};
  const p = field(g, 'legia')[0];
  let r = step(g, ui, 'rz-ask', { id: p.id, dir: 'down' });
  assert.equal(r.focus, '[data-act="rz-ask-send"]');
  assert.equal(ui.sqSub, 'reserves');
  let html = renderReserves(g, ui);
  clean(html, 'dialog');
  assert.match(html, /role="dialog"/);
  assert.match(html, /Deleguj do rezerw: /);
  assert.match(html, /Zostaje w twojej kadrze/);
  r = step(g, ui, 'rz-ask-send');
  assert.equal(r.save, true);
  assert.equal(ui.rzAsk.step, 'answer');
  assert.equal(ui.rzAsk.res.status, 'accepted', ui.rzAsk.res.reason);
  html = renderReserves(g, ui);
  clean(html, 'odpowiedź');
  assert.match(html, /zgodził się/);
  assert.match(html, /role="status"/);
  step(g, ui, 'rz-ask-ok');
  assert.equal(ui.rzAsk, null);
  html = renderReserves(g, ui);
  assert.match(html, new RegExp(`data-act="rz-cancel"[^>]*data-pid="${p.id}"`));
  // plakietka w Kadrze i w Składzie, pasek nad ławką
  const chips = rzChipFn(g);
  assert.match(chips(p), /data-k="down"/);
  const sq = renderSquadList(squadOf(g.world, 'legia'), { game: g, rzChips: chips });
  assert.match(sq, /rz-chip" data-k="down"/);
  const strip = reservesStrip(g);
  clean(strip, 'pasek');
  assert.match(strip, /1 do rezerw na mecz/);
  assert.match(strip, /data-act="tsub" data-s="reserves"/);
  const tac = renderTactics({ squad: squadOf(g.world, 'legia'), tactics: g.tactics, sel: null, benchSize: 9, rzChips: chips, rzStrip: strip });
  assert.match(tac, /class="rz-strip/);
  // cofnięcie
  const d = g.reserves.list.find((x) => x.pid === p.id);
  r = step(g, ui, 'rz-cancel', { id: d.id });
  assert.equal(r.save, true);
  assert.match(ui.rzMsg, /cofnięty/);
  assert.equal(g.reserves.list.length, 0);
});

test('Delegowanie niedozwolone: przycisk wyłączony z powodem, wpis menu z krótkim powodem, prośba nie otwiera dialogu', () => {
  const g = fresh();
  const p = field(g, 'legia').at(-1);
  p.injuryDays = 30;
  const html = renderReserves(g, {});
  assert.match(html, new RegExp(`data-pid="${p.id}"[\\s\\S]*?rz-row__why[^<]*kontuzjowany`));
  assert.match(html, new RegExp(`data-act="rz-ask" data-id="${p.id}" data-dir="down"[^>]*disabled`));
  const ui = {};
  step(g, ui, 'rz-ask', { id: p.id, dir: 'down' });
  assert.equal(ui.rzAsk, null);
  assert.match(ui.rzMsg, /kontuzjowany/);
  const m = playerMenu(g, p.id, { view: 'squad' });
  const it = flattenMenu(m.items).find((x) => x.label.startsWith('Deleguj do rezerw'));
  assert.ok(it, 'wpis zawsze widoczny');
  assert.equal(it.disabled, 'Kontuzja');
  // termin 24 h: po terminie przycisk wyłączony z powodem
  const g2 = fresh('legia', '2026-08-01');
  const h2 = renderReserves(g2, {});
  assert.match(h2, /24 godziny przed meczem|Brak zawodników|Rezerwy nie grają/);
});

test('Powołanie z rezerw, odmowa trenera, wymuszenie przez dyrektora sportowego z szansą i kosztem, limit 30 dni', () => {
  const g = fresh('legia', '2026-07-31'); // piątek: prośba „późna” (30 % odmowy)
  const ui = {};
  const cands = field(g, 'legia');
  let refused = null;
  for (const p of cands.slice(0, 12)) {
    step(g, ui, 'rz-ask', { id: p.id, dir: 'down' });
    if (!ui.rzAsk) continue;
    step(g, ui, 'rz-ask-send');
    if (ui.rzAsk.res.status === 'refused' && !ui.rzAsk.res.hard) { refused = p; break; }
    step(g, ui, 'rz-ask-ok');
    const d = g.reserves.list.find((x) => x.pid === p.id);
    if (d) step(g, ui, 'rz-cancel', { id: d.id });
  }
  assert.ok(refused, 'jest odmowa trenera rezerw');
  let html = renderReserves(g, ui);
  clean(html, 'odmowa');
  assert.match(html, /odmówił/);
  assert.match(html, /data-act="rz-force-ask"/);
  step(g, ui, 'rz-force-ask');
  html = renderReserves(g, ui);
  clean(html, 'wymuszenie');
  assert.match(html, /Szansa na jego zgodę: \d+ %/);
  assert.match(html, /raz na 30 dni/);
  assert.match(html, /zaufanie zarządu/);
  assert.match(html, /data-act="rz-force-go"/);
  step(g, ui, 'rz-force-no');
  assert.equal(ui.rzAsk.step, 'answer');
  step(g, ui, 'rz-force-ask');
  const trust0 = g.board.trust;
  step(g, ui, 'rz-force-go');
  assert.ok(g.board.trust < trust0, 'koszt: zaufanie zarządu');
  html = renderReserves(g, ui);
  clean(html, 'po wymuszeniu');
  assert.match(html, /Dyrektor sportowy/);
  // drugi raz w 30 dni: przycisk wyłączony z datą
  ui.rzAsk = { ...ui.rzAsk, res: { status: 'refused', hard: false, reason: 'Trener rezerw: test.', chance: 0.3 } };
  html = renderReserves(g, ui);
  assert.match(html, /data-act="rz-force-ask" disabled/);
  assert.match(html, /Wymuszenie dostępne od/);
  // powołanie zawodnika rezerw na mecz pierwszej drużyny (zwykła prośba)
  const g3 = fresh('legia', '2026-07-27');
  const u3 = {};
  const rp = squadOf(g3.world, 'legia-ii').filter((p) => p.pos !== 'BR').sort((a, b) => a.ovr - b.ovr)[0];
  step(g3, u3, 'rz-ask', { id: rp.id, dir: 'up' });
  assert.ok(u3.rzAsk, u3.rzMsg);
  assert.match(renderReserves(g3, u3), /Zajmie jedno z 3 miejsc/);
  step(g3, u3, 'rz-ask-send');
  assert.ok(['accepted', 'refused'].includes(u3.rzAsk.res.status));
  // menu zawodnika rezerw: powołanie i przeniesienie, bez rynku
  const m = playerMenu(g3, squadOf(g3.world, 'legia-ii')[3].id, { view: 'squad' });
  const labels = flattenMenu(m.items).map((x) => x.label);
  assert.ok(labels.some((l) => /Powołaj|Cofnij powołanie/.test(l)), labels.join(', '));
  assert.ok(labels.includes('Przenieś na stałe do pierwszej drużyny'));
  assert.ok(!labels.some((l) => /Złóż ofertę|Wypożycz/.test(l)));
});

test('Awaria: baner z „Uzupełnij awaryjnie”, bez odmowy, wyjątek bramkarza; pasek w Składzie', () => {
  const g = fresh('legia', '2026-08-01'); // Legia gra w niedzielę: w oknie 48 h
  const gks = squadOf(g.world, 'legia').filter((p) => p.pos === 'BR').sort((a, b) => b.ovr - a.ovr);
  for (const p of gks.slice(1)) p.injuryDays = 20;
  const ui = {};
  let html = renderReserves(g, ui);
  clean(html, 'awaria');
  assert.match(html, /class="rz-alarm" role="alert"/);
  assert.match(html, /zdrowych bramkarzy 1 z 2/);
  assert.match(html, /wyjątek tylko dla bramkarza/);
  assert.match(html, /data-act="rz-emergency"/);
  assert.match(reservesStrip(g), /data-act="rz-emergency"/);
  const r = step(g, ui, 'rz-emergency');
  assert.equal(r.save, true);
  assert.match(ui.rzMsg, /Awaryjnie powołani: /);
  html = renderReserves(g, ui);
  assert.ok(!/class="rz-alarm"/.test(html), 'awaria usunięta');
  assert.ok(g.reserves.list.some((d) => d.emergency && d.gk));
});

test('Klub bez rezerw: brak podzakładki, wpisów menu i plakietek; wyjaśnienie zamiast ekranu', () => {
  const g = fresh('pogon-szczecin');
  assert.equal(hasReserves(g), false);
  assert.equal(rzChipFn(g), null);
  assert.equal(reservesStrip(g), '');
  const html = renderReserves(g, {});
  clean(html, 'bez rezerw');
  assert.match(html, /IV lidze|nie ma drużyny rezerw/);
  const p = squadOf(g.world, 'pogon-szczecin')[5];
  assert.deepEqual(rzMenuItems(g, p, () => ({})), []);
  for (const view of ['squad', 'tactics', 'profile']) {
    const labels = flattenMenu(playerMenu(g, p.id, { view, lineup: null }).items).map((x) => x.label);
    assert.ok(!labels.some((l) => /rezerw/i.test(l)), `${view}: ${labels.join(', ')}`);
  }
  const g2 = fresh('motor');
  assert.equal(hasReserves(g2), false, 'Motor nie ma rezerw');
});

test('Pauzy per klasa w Kadrze: „P” tylko za pauzę w rozgrywkach drużyny, osobny znak za pauzę tylko w innej klasie', () => {
  const g = fresh();
  const [a, b] = field(g, 'legia');
  a.susp = { ekstraklasa: 2 };
  b.susp = { liga2: 1 };
  assert.deepEqual(suspSplit(a, 1), { rel: [['ekstraklasa', 2]], other: [] });
  assert.deepEqual(suspSplit(b, 1), { rel: [], other: [['liga2', 1]] });
  assert.deepEqual(suspSplit(b, null).rel, [['liga2', 1]], 'bez znanej klasy: jak dawniej');
  const html = renderSquadList(squadOf(g.world, 'legia'), { game: g, view: 'attrs', rzChips: rzChipFn(g) });
  const rowA = html.slice(html.indexOf(`data-pid="${a.id}"`)); const rowB = html.slice(html.indexOf(`data-pid="${b.id}"`));
  assert.match(rowA.slice(0, rowA.indexOf('</tr>')), /data-k="sy" role="img" title="Pauza za kartki: 2 mecze w Ekstraklasie"/);
  assert.match(rowB.slice(0, rowB.indexOf('</tr>')), /class="tg tg--o[^"]*" data-k="s2"/);
  const ov = renderSquadList(squadOf(g.world, 'legia'), { game: g, rzChips: rzChipFn(g) });
  clean(ov.slice(ov.indexOf('sqa')), 'aside');
  assert.match(ov, /Pauza w innej klasie/);
  assert.match(ov, /pauza w 2 Lidze/);
});
