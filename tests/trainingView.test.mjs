// Ekran „Trening”: pulpit jako domyślna zakładka, baner zaplanowanego obozu z datami, skróty z pulpitu (tr-go).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, playQuick, applyResult } from '../src/season/season.js';
import { processDay, continueUntilStop, primaryAction } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { createFinance } from '../src/career/finance.js';
import '../src/season/dailySystems.js';
import * as TR from '../src/training/index.js';
import { fmtDate } from '../src/ui/dom.js';
import { renderTraining, handleTrainingAction } from '../src/ui/trainingView.js';

function newGame(clubId = 'widzew', seed = 2026) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.finance = createFinance(g.world);
  g.tactics = createTactics(squadOf(g.world, clubId));
  processDay(g);
  return g;
}

function playUntil(g, until) {
  const rng = new Rng(`gracz:${g.seed}`);
  let guard = 0;
  while (g.date < until && guard++ < 4000) {
    const a = primaryAction(g);
    if (a.kind === 'play') {
      const f = a.match;
      if (f.comp === 'friendly' || !f.away || !f.home) { f.played = true; f.result = { score: [1, 1] }; continue; }
      applyResult(g, f, playQuick(g, f, rng), rng);
      continue;
    }
    if (a.kind === 'decide') { g.inbox = g.inbox.map((m) => ({ ...m, resolved: true })); continue; }
    continueUntilStop(g, { maxDays: 1 });
  }
}

const TABS = ['pulpit', 'tydzien', 'obozy', 'sparingi', 'zawodnicy', 'obciazenia', 'sztab', 'rozwoj'];
const clean = (html, label) => assert.ok(!/undefined|NaN|\[object|—/.test(html), `bez śmieci i półpauz: ${label}`);

test('Trening: pulpit jest domyślną zakładką i ma skróty do szczegółowych zakładek', () => {
  const g = newGame('legia');
  const html = renderTraining(g, {});
  assert.match(html, /data-act="tr-tab" data-tab="pulpit" aria-selected="true"/);
  assert.ok(html.includes('class="tr-dash"'));
  for (const t of ['Ten tydzień', 'Obóz', 'Sparingi', 'Obciążenia i zmęczenie', 'Urazy', 'Zgranie', 'Sztab', 'Rozwój']) assert.ok(html.includes(`<h3>${t}</h3>`), t);
  for (const t of ['tydzien', 'obozy', 'sparingi', 'obciazenia', 'zawodnicy', 'sztab', 'rozwoj']) {
    assert.ok(html.includes(`data-act="tr-tab" data-tab="${t}">`) || html.includes(`data-act="tr-go" data-tab="${t}"`), `skrót do ${t}`);
  }
  clean(html, 'pulpit');
  // Nieznana zakładka też pokazuje pulpit
  assert.ok(renderTraining(g, { trTab: 'xyz' }).includes('class="tr-dash"'));
});

test('Trening: tr-go z pulpitu otwiera dzień w planie tygodnia i zawodnika', () => {
  const g = newGame('legia');
  let ui = { trWeek: 2 };
  const act = (a, ds) => { const r = handleTrainingAction(g, a, ds); ui = { ...ui, ...r.ui }; return r; };
  const html = renderTraining(g, ui);
  const day = html.match(/data-act="tr-go" data-tab="tydzien" data-date="([\d-]+)"/)[1];
  act('tr-go', { tab: 'tydzien', date: day });
  assert.equal(ui.trTab, 'tydzien');
  assert.equal(ui.trDay, day);
  assert.equal(ui.trWeek, 0);
  assert.ok(renderTraining(g, ui).includes(`data-act="tr-day" data-date="${day}" aria-pressed="true"`));
  const p = squadOf(g.world, 'legia')[3];
  act('tr-go', { tab: 'zawodnicy', id: p.id });
  assert.equal(ui.trTab, 'zawodnicy');
  assert.equal(ui.trPlayer, p.id);
  assert.equal(ui.trDay, null);
  assert.ok(renderTraining(g, ui).includes('data-act="tr-pback"'));
  act('tr-go', { tab: 'nieznana' });
  assert.equal(ui.trTab, 'pulpit');
});

test('Trening: zaplanowany obóz z datami widać na każdej zakładce (baner) i na pulpicie', () => {
  const g = newGame('legia');
  let ui = {};
  const act = (a, ds) => { const r = handleTrainingAction(g, a, ds); ui = { ...ui, ...r.ui }; return r; };
  assert.ok(!renderTraining(g, ui).includes('tr-campbar'), 'bez obozu nie ma banera');
  act('tr-tab', { tab: 'obozy' });
  act('tr-camp-dest', { v: 'austria' }); act('tr-camp-len', { v: '7' });
  const m = renderTraining(g, ui).match(/data-act="tr-camp-book" data-half="(\w+)" data-dest="(\w+)" data-len="(\d+)" data-date="([\d-]+)"/);
  assert.ok(act('tr-camp-book', { half: m[1], dest: m[2], len: m[3], date: m[4] }).save);
  const b = TR.bookingFor(g, '2026-L');
  for (const tab of TABS) {
    act('tr-tab', { tab });
    const html = renderTraining(g, ui);
    const bar = html.slice(html.indexOf('class="tr-campbar"'), html.indexOf('</section>', html.indexOf('class="tr-campbar"')));
    assert.ok(bar.includes(fmtDate(b.from)) && bar.includes(fmtDate(b.to)), `daty obozu na zakładce ${tab}`);
    assert.ok(bar.includes(b.place));
    assert.equal((bar.match(/<li/g) ?? []).length, b.days, 'pasek dni obozu');
    assert.equal(bar.includes('data-act="tr-tab" data-tab="obozy"'), tab !== 'obozy');
    clean(html, tab);
  }
  act('tr-tab', { tab: 'pulpit' });
  assert.match(renderTraining(g, ui), /<h3>Obóz<\/h3><span class="tr-card__badge">za \d+ dni<\/span>/);
  // W trakcie obozu: status „Trwa”, dni obozu w planie tygodnia
  playUntil(g, b.from);
  let html = renderTraining(g, ui);
  assert.ok(html.includes('Trwa: dzień 1 z 7'));
  act('tr-tab', { tab: 'tydzien' });
  html = renderTraining(g, ui);
  assert.ok(html.includes('data-camp="1"') && html.includes(`Obóz: ${b.place}`));
  // Po obozie baner znika
  playUntil(g, '2026-08-20');
  assert.ok(!renderTraining(g, ui).includes('tr-campbar'));
  act('tr-tab', { tab: 'pulpit' });
  clean(renderTraining(g, ui), 'pulpit po obozie');
});

test('Trening: pulpit w trakcie sezonu (raport rozwoju, obciążenia, urazy) bez błędów', () => {
  const g = newGame('widzew');
  playUntil(g, '2026-09-03');
  const html = renderTraining(g, {});
  assert.ok(html.includes('Raport z ') && html.includes('Rosną najszybciej'));
  assert.match(html, /<ul class="tr-zones">/);
  clean(html, 'pulpit wrzesień');
  for (const tab of TABS) clean(renderTraining(g, { trTab: tab }), tab);
});
