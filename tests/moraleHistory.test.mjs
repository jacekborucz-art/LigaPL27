// Historia morale: zapis w poniedziałki, trend, wykres i informacje (src/career/morale.js, docs/historia-morale.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureTraining } from '../src/training/index.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { processDay } from '../src/core/gameLoop.js';
import {
  MORALE_HIST, recordMoraleWeek, moraleTrend, moraleFalling, moraleSeries, teamMoraleTrend, talkFollowUp,
} from '../src/career/morale.js';
import { talkSuggestions, talkToPlayer } from '../src/career/teamTalks.js';
import { moraleChartHtml } from '../src/ui/formChart.js';
import { renderTalks } from '../src/ui/talksView.js';
import '../src/season/dailySystems.js';

function newGame(seed = 31, clubId = 'widzew') {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 9 });
  ensureTraining(g); ensureCareer(g);
  return g;
}

test('Wpis tygodnia: najwyżej 8 tygodni, najstarsze wypadają, wartości z jednym miejscem po przecinku', () => {
  const p = { morale: 12 };
  for (let i = 0; i < 11; i++) { p.morale = 10 + i * 0.333; recordMoraleWeek(p); }
  assert.equal(p.moraleHist.length, MORALE_HIST.WEEKS);
  assert.equal(p.moraleHist.at(-1), 13.3);
  assert.equal(p.moraleHist[0], 11);
});

test('Trend: rośnie, spada, bez zmian, szybki spadek; bez historii brak trendu', () => {
  assert.equal(moraleTrend({ morale: 12 }), null);
  assert.equal(moraleFalling({ morale: 5 }), false, 'stary zapis bez historii: bez ostrzeżeń');
  assert.equal(moraleTrend({ morale: 14, moraleHist: [12, 12.5] }).dir, 'up');
  assert.equal(moraleTrend({ morale: 12.5, moraleHist: [12, 13] }).dir, 'flat');
  const t = moraleTrend({ morale: 9, moraleHist: [15, 13.5, 12] });
  assert.deepEqual([t.dir, t.d, t.fast], ['down', -4.5, true], 'porównanie z przedostatnim poniedziałkiem');
  assert.deepEqual(moraleSeries({ morale: 9, moraleHist: [15, 13.5] }), [15, 13.5, 9]);
});

test('Poniedziałek: historia dla zawodników klubów w grze, przed tygodniowym dryfem', () => {
  const g = newGame();
  const p = squadOf(g.world, 'widzew')[0];
  const free = Object.values(g.world.players).find((x) => !x.clubId);
  if (free) free.moraleHist = [10];
  for (const d of ['2026-07-03', '2026-07-04', '2026-07-05']) processDay(g, d);
  assert.equal(p.moraleHist, undefined, 'przed pierwszym poniedziałkiem bez historii');
  p.morale = 18;
  processDay(g, '2026-07-06'); // poniedziałek
  assert.equal(p.moraleHist.length, 1);
  assert.ok(p.moraleHist[0] >= 17, `wpis przed dryfem (${p.moraleHist[0]})`);
  assert.ok(p.morale < p.moraleHist[0], 'dryf ku 12 bez zmian');
  processDay(g, '2026-07-07'); // wtorek: bez wpisu
  assert.equal(p.moraleHist.length, 1);
  if (free && !free.clubId) assert.equal(free.moraleHist, undefined, 'wolny zawodnik: bez historii');
  const n = Object.values(g.world.players).filter((x) => x.moraleHist).length;
  assert.ok(n > 3000, `historia u zawodników klubów w grze (${n})`);
});

test('Rozmowy: powód „Morale szybko spada”, trend atmosfery i skutek rozmowy tydzień później', () => {
  const g = newGame();
  const sq = squadOf(g.world, 'widzew');
  for (const p of sq) { p.moraleHist = [12, 12]; p.morale = 12; }
  const p = sq[3];
  p.moraleHist = [15, 14]; p.morale = 9.5;
  const rs = talkSuggestions(g).find((x) => x.p.id === p.id)?.reasons.map((r) => r[1]) ?? [];
  assert.ok(rs.includes('Morale szybko spada'));
  assert.ok(!rs.includes('Niskie morale'));
  for (const q of sq) q.morale = 10; // drużyna: spadek z 12 do 10
  assert.equal(teamMoraleTrend(sq.map((q) => ({ ...q, minutes: 90 }))).dir, 'down');
  const r = talkToPlayer(g, p.id, 'encourage');
  assert.ok(r.ok);
  const entry = g.talks.log[0];
  assert.equal(entry.m0, r.moraleBefore);
  talkFollowUp(g, '2026-07-05');
  assert.equal(entry.m7, undefined, 'przed upływem tygodnia');
  p.morale = 16;
  talkFollowUp(g, '2026-07-08');
  assert.equal(entry.m7, 16);
  const html = renderTalks(g, {});
  assert.match(html, /Tydzień później: morale wyżej niż przed rozmową/);
  assert.match(html, /Trend: spada/);
});

test('Wykres morale w karcie: brak historii, potem punkty z tygodni i obecny stan', () => {
  assert.match(moraleChartHtml({ morale: 12 }), /po pierwszym tygodniu/);
  const html = moraleChartHtml({ morale: 8, moraleHist: [15, 14, 12] });
  assert.equal((html.match(/<circle/g) ?? []).length, 4);
  assert.match(html, /szybki spadek/);
  assert.match(html, /3 tygodnie temu/);
});
