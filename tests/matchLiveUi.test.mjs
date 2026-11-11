// Mecz na żywo (widok i logika dnia meczowego): linie zdarzeń na tablicy, wybór ustawienia AI przed meczem
// (warianty 4-4-2), nazwy formacji w studiu, zalecana przemowa pomeczowa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreboardLines } from '../src/ui/matchdayView.js';
import { aiPreMatchFormation, postAdvice, startMatchday, kickOff, skip, finishMatchday } from '../src/match/matchday.js';
import { assistantReport, formationShape, FORMATIONS as STUDIO_F } from '../src/match/studio.js';
import { postMatchBriefing, POST_TONES } from '../src/match/briefings.js';
import { FORMATIONS } from '../src/data/formations.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, continueUntilStop, primaryAction } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { squadFor } from '../src/season/season.js';
import '../src/season/dailySystems.js';

const P = {
  a: { name: 'Jan Kowalski' }, b: { name: 'Piotr Nowak', last: 'Nowak' }, c: { name: 'Adam Lis' }, d: { name: 'Marek Wilk' }, e: { name: 'Paweł Zając' },
};
const who = (id) => P[id] ?? null;

test('Tablica: strzelcy, karny, samobój, niestrzelony karny, czerwone kartki i gol nieuznany po VAR', () => {
  const ev = [
    { t: 10, type: 'goal', side: 0, pid: 'a', how: 'POZ', min: "10'" },
    { t: 20, type: 'goal', side: 1, pid: 'b', how: 'PEN', min: "20'" },
    { t: 30, type: 'goal', side: 0, pid: 'b', how: 'OG', ownGoal: true, ogId: 'b', min: "30'" },
    { t: 40, type: 'shotOff', side: 1, pid: 'c', penalty: true, min: "40'" },
    { t: 41, type: 'shotOn', side: 1, pid: 'c', penalty: false, min: "41'" },
    { t: 50, type: 'goal', side: 0, pid: 'a', how: 'HEAD', provisional: true, min: "50'" },
    { t: 50, type: 'varOverturn', side: 0, pid: 'a', cancelGoal: true, decision: 'goalDisallowed', min: "50'" },
    { t: 60, type: 'red', side: 1, pid: 'd', second: true, min: "60'" },
    { t: 70, type: 'varOverturn', side: 0, pid: 'e', decision: 'redCard', min: "70'" },
    { t: 70, type: 'red', side: 0, pid: 'e', second: false, min: "70'" },
    { t: 80, type: 'goal', side: 0, pid: 'a', how: 'POZ', min: "90+2'" },
    { t: 81, type: 'yellow', side: 0, pid: 'c', min: "91'" },
  ];
  const [h, a] = scoreboardLines(ev, who);
  // Gospodarze: Kowalski (gol, gol nieuznany, gol w doliczonym), samobój Nowaka, czerwona Zająca po VAR
  assert.deepEqual(h.map((x) => x.name), ['J. Kowalski', 'P. Nowak', 'P. Zając']);
  assert.deepEqual(h[0].marks.map((m) => `${m.k} ${m.min}`), ["goal 10'", "nogoal 50'", "goal 90+2'"]);
  assert.equal(h[1].suffix, 'sam.');
  assert.equal(h[1].marks[0].k, 'og');
  assert.equal(h[2].marks[0].viaVar, true);
  // Goście: karny Nowaka, niestrzelony karny Lisa (strzał bez karnego pominięty), druga żółta Wilka
  assert.deepEqual(a.map((x) => `${x.name}:${x.marks.map((m) => m.k).join(',')}`), ['P. Nowak:pen', 'A. Lis:penmiss', 'M. Wilk:second']);
  // Żółte kartki nie trafiają na tablicę
  assert.ok(![...h, ...a].some((x) => x.marks.some((m) => m.k === 'yellow')));
});

test('Studio zna pełne nazwy wariantów 4-4-2 i romb', () => {
  for (const f of FORMATIONS) assert.ok(STUDIO_F[f.name] || ['4-4-2', '4-3-3', '4-2-3-1', '4-1-4-1', '3-5-2', '3-4-3', '5-3-2', '5-4-1', '4-3-2-1'].includes(f.name), `brak ${f.name}`);
  assert.deepEqual(formationShape('4-4-2 defensywne'), formationShape('4-4-2'));
  assert.deepEqual(formationShape('4-4-2 romb'), formationShape('4-4-2D'));
  const r = assistantReport({ user: { name: 'My', formation: '4-2-3-1', squad: [] }, opp: { name: 'Oni', formation: '4-4-2 defensywne', tactics: {} } });
  assert.match(r.style, /4-4-2 defensywne „Niski Blok”/);
  assert.ok(r.counters.some((c) => /niski blok/.test(c)));
  const r2 = assistantReport({ user: { name: 'My', formation: '4-3-3', squad: [] }, opp: { name: 'Oni', formation: '4-4-2 ofensywne', tactics: {} } });
  assert.equal(r2.formation.name, '4-2-3-1');
  const r3 = assistantReport({ user: { name: 'My', formation: '4-3-3', squad: [] }, opp: { name: 'Oni', formation: '4-4-2 romb', tactics: {} } });
  assert.match(r3.style, /4-4-2 romb „Diament”/);
});

test('AI przed meczem: wyraźnie słabszy na wyjeździe gra niskim blokiem, wyrównany mecz 4-2-3-1', () => {
  const world = generateWorld(5);
  const strong = squadOf(world, 'legia');
  const weak = squadOf(world, 'zawisza');
  const game = { seed: 5, tactics: { formation: '4231' } };
  const picks = [];
  for (let i = 0; i < 40; i++) {
    // Gracz (Legia) u siebie, rywal (ostrożny trener Piasta, kadra trzecioligowca) na wyjeździe
    picks.push(aiPreMatchFormation(game, { id: `m${i}`, home: 'legia', away: 'piast', comp: 'ekstraklasa' }, { userSide: 0, mySquad: strong, oppSquad: weak, comp: 'ekstraklasa' }));
  }
  const def = picks.filter((x) => x === '442def').length;
  assert.ok(def >= 20 && def < 40, `niski blok w ${def} z 40`);
  assert.ok(picks.every((x) => x === '442def' || x === '4231'));
  // Deterministycznie dla tego samego meczu
  assert.equal(aiPreMatchFormation(game, { id: 'm3', home: 'legia', away: 'piast', comp: 'ekstraklasa' }, { userSide: 0, mySquad: strong, oppSquad: weak, comp: 'ekstraklasa' }), picks[3]);
  // Wyrównany mecz: zawsze 4-2-3-1
  for (let i = 0; i < 10; i++) assert.equal(aiPreMatchFormation(game, { id: `e${i}`, home: 'legia', away: 'piast', comp: 'ekstraklasa' }, { userSide: 0, mySquad: strong, oppSquad: strong, comp: 'ekstraklasa' }), '4231');
  // Wyraźny faworyt u siebie z ofensywnym trenerem (Lech) czasem gra 4-4-2 ofensywnym
  const off = Array.from({ length: 40 }, (_, i) => aiPreMatchFormation(game, { id: `o${i}`, home: 'lech', away: 'widzew', comp: 'ekstraklasa' }, { userSide: 1, mySquad: weak, oppSquad: strong, comp: 'ekstraklasa' }));
  assert.ok(off.includes('442off') && off.includes('4231'));
});

test('Odprawa pomeczowa: asystent zaleca ton z najlepszym wpływem na morale', () => {
  const g = { seed: 21, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(21);
  g.season = createSeason(21, { playerClub: 'widzew' });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 });
  processDay(g);
  while (primaryAction(g).kind !== 'play') {
    if (primaryAction(g).kind === 'decide') g.inbox = g.inbox.map((m) => ({ ...m, resolved: true }));
    else continueUntilStop(g);
  }
  const S = startMatchday(g, primaryAction(g).match);
  kickOff(g, S); skip(S); while (S.step !== 'fulltime') skip(S);
  finishMatchday(g, S);
  const adv = postAdvice(g, S);
  assert.ok(POST_TONES[adv.tone]);
  assert.match(adv.text, /^Po (wygranej|remisie|porażce)/);
  const ids = new Set(S.result.ratings.filter((x) => x.side === S.userSide).map((x) => x.id));
  const players = squadFor(g, g.clubId, S.comp).filter((p) => ids.has(p.id));
  const avg = (tone) => { const r = postMatchBriefing({ players, tone, talks: [], memory: S.memory, ctx: S.post.forBriefing, seed: `${g.seed}:${S.f.id}:post` }); const v = Object.values(r.morale).map((m) => m.delta); return v.reduce((a, b) => a + b, 0) / v.length; };
  const best = Math.max(...Object.keys(POST_TONES).map(avg));
  assert.ok(Math.abs(avg(adv.tone) - best) < 1e-9);
  const { for: gf, against: ga } = S.post.forBriefing.score;
  if (gf < ga) assert.notEqual(adv.tone, 'praise');
});
