// Gra bierna (docs/bierna-gra.md): przewidywalność taktyczna i analiza rywala, rozmowy z zawodnikami, którzy ich
// potrzebują, monotonia treningu. Kary są ograniczone, ta sama reguła działa dla klubów AI, stary zapis działa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import '../src/season/dailySystems.js';
import '../src/match/matchday.js';
import { attachTraining } from '../src/training/index.js';
import { prepTerm, syncTacticsChange } from '../src/training/cohesion.js';
import {
  SCOUT, PASSIVE, fingerprint, similarity, recordMatch, userFamiliarity, scoutEdge, aiFamiliarity, analysisQuality,
  scoutingWarning, scoutingNote, rehearsed,
} from '../src/training/scouting.js';
import { ATTN, attentionNeed, attentionWeek, noteAttention, neglectLevel } from '../src/career/attention.js';
import { talkToPlayer, talkSuggestions } from '../src/career/teamTalks.js';
import { VARIETY, varietyWeek, staleness, staleEffects, aiAccentAt } from '../src/training/variety.js';

const SEED = 777;
function newGame(clubId = 'widzew', seed = SEED) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId));
  processDay(g);
  return g;
}
const PLAN = {
  base: (t) => t,
  press: (t) => ({ ...t, instructions: { ...t.instructions, pressing: 'high', mentality: '1' } }),
  low: (t) => ({ ...t, instructions: { ...t.instructions, pressing: 'low', line: 'low', mentality: '-1' } }),
  f433: (t) => ({ ...t, formation: '433', instructions: { ...t.instructions, passing: 'short' } }),
};
function play(g, plans) {
  plans.forEach((pl, i) => recordMatch(g, `m${g.scouting?.log?.length ?? 0}-${i}`, addDays('2026-07-20', 7 * i), PLAN[pl](g.tactics)));
}
const OPP = 'lech';

test('Przewidywalność: ten sam schemat mecz po meczu zwiększa premię rywala, w granicach', () => {
  const g = newGame();
  g.training.staff[OPP].analityk.q = 14;
  const e0 = scoutEdge(g, OPP, g.clubId);
  assert.equal(e0, 0, 'bez historii rywal przygotowuje się jak na każdego (znajomość neutralna)');
  const edges = [];
  for (let k = 1; k <= 8; k++) { recordMatch(g, `r${k}`, addDays('2026-07-20', 7 * k), g.tactics); edges.push(scoutEdge(g, OPP, g.clubId)); }
  for (let k = 1; k < edges.length; k++) assert.ok(edges[k] >= edges[k - 1] - 1e-9, `premia rośnie z liczbą meczów: ${edges}`);
  assert.ok(edges.at(-1) > 0.15, `pełna znajomość schematu daje odczuwalną premię: ${edges.at(-1)}`);
  assert.ok(edges.at(-1) <= SCOUT.edgeMax, 'premia ograniczona');
  const u = userFamiliarity(g);
  assert.ok(u.fam > 0.95 && u.fam <= 1 && u.n === 8);
  // Ostrzeżenie analityka raz, notka w studiu
  const w = scoutingWarning(g);
  assert.ok(w && /schemat/.test(w.subject));
  assert.equal(scoutingWarning(g), null, 'ostrzeżenie tylko raz');
  assert.equal(scoutingNote(g, OPP).level, 'known');
});

test('Przewidywalność: urozmaicony plan zmniejsza premię, nieoczekiwany plan zaskakuje rywala', () => {
  const g = newGame();
  g.training.staff[OPP].analityk.q = 14;
  play(g, ['base', 'press', 'low', 'base', 'press', 'low', 'f433', 'base']);
  const varied = scoutEdge(g, OPP, g.clubId);
  const h = newGame();
  h.training.staff[OPP].analityk.q = 14;
  play(h, Array(8).fill('base'));
  const same = scoutEdge(h, OPP, h.clubId);
  assert.ok(varied < same - 0.1, `urozmaicenie: ${varied} wobec ${same}`);
  // Ten sam schemat przez 8 meczów, dziś inny plan: rywal przygotował się na coś innego
  h.tactics = PLAN.f433(PLAN.low(h.tactics));
  const surprise = scoutEdge(h, OPP, h.clubId);
  assert.ok(surprise < 0 && surprise >= SCOUT.edgeMin, `zaskoczenie: ${surprise}`);
  assert.equal(scoutingNote(h, OPP)?.level, 'surprise');
  // Podobieństwo odcisków
  assert.equal(similarity(fingerprint(g.tactics), fingerprint(g.tactics)), 1);
  assert.ok(similarity(fingerprint(PLAN.base(g.tactics)), fingerprint(PLAN.f433(g.tactics))) < 0.7);
});

test('Przewidywalność: jakość analityka i trenera rywala skaluje premię', () => {
  const g = newGame();
  play(g, Array(8).fill('base'));
  PASSIVE.r3 = false; // skala analityka bez podłogi trenera i kontrplanu (runda 3: osobny test w passiveR3.test.mjs)
  g.training.staff[OPP].analityk.q = 4;
  const weak = scoutEdge(g, OPP, g.clubId);
  g.training.staff[OPP].analityk.q = 18;
  const strong = scoutEdge(g, OPP, g.clubId);
  PASSIVE.r3 = true;
  assert.ok(strong > weak * 2, `analityk 4: ${weak}, analityk 18: ${strong}`);
  const coach = g.coaches?.[OPP];
  if (coach) {
    const before = analysisQuality(g, OPP);
    coach.a = { ...coach.a, SKL: 18, TAK: 18 };
    assert.ok(analysisQuality(g, OPP) > before, 'dobry trener rywala lepiej wykorzystuje analizę');
    assert.ok(analysisQuality(g, OPP) <= SCOUT.qMax);
  }
});

test('Przewidywalność: ta sama reguła dla klubów AI i w premii analizy w dniu meczu', () => {
  const g = newGame();
  play(g, Array(8).fill('base'));
  for (const id of ['legia', 'lech', 'gks-katowice', 'motor']) {
    const f = aiFamiliarity(g, id);
    assert.ok(f >= SCOUT.aiFam.min && f <= SCOUT.aiFam.max, `${id}: ${f}`);
    const e = scoutEdge(g, OPP === id ? 'legia' : OPP, id);
    assert.ok(e >= SCOUT.edgeMin && e <= SCOUT.edgeMax);
  }
  // Mecz ligowy gracza: rywal AI ma w dniu meczu analizę wideo powiększoną o premię za nasz schemat
  const f = g.fixtures.find((x) => x.comp === 'ekstraklasa' && (x.home === g.clubId || x.away === g.clubId) && !x.played);
  const opp = f.home === g.clubId ? f.away : f.home;
  g.training.staff[opp].analityk.q = 12;
  g.date = f.date;
  attachTraining(g);
  const p = squadOf(g.world, opp)[0];
  const withEdge = prepTerm(g, p);
  PASSIVE.scout = false;
  const g2 = { ...g }; // nowy obiekt gry: osobna pamięć podręczna dnia
  const without = prepTerm(g2, p);
  PASSIVE.scout = true;
  assert.ok(withEdge > without + 0.1, `premia w dniu meczu: ${without} -> ${withEdge}`);
});

test('Przećwiczony plan B kosztuje mniej zgrania niż zupełnie nowy', () => {
  const g = newGame();
  attachTraining(g);
  play(g, ['base', 'press', 'base', 'press']);
  const c = g.training.clubs[g.clubId];
  syncTacticsChange(g);
  c.instr = 80;
  g.tactics = PLAN.press(g.tactics);
  assert.ok(rehearsed(g, g.tactics));
  syncTacticsChange(g);
  const known = 80 - c.instr;
  c.instr = 80;
  g.tactics = { ...g.tactics, instructions: { ...g.tactics.instructions, tempo: 'fast', line: 'high' } };
  syncTacticsChange(g);
  const fresh = 80 - c.instr;
  assert.ok(known > 0 && known < fresh, `plan B ${known}, nowy plan ${fresh}`);
});

function sensitivePlayer(g) {
  const p = squadOf(g.world, g.clubId).find((x) => !x.injuryDays) ;
  p.persona = 'Wrażliwy'; p.morale = 14;
  return p;
}
const mondays = (from, n) => Array.from({ length: n }, (_, k) => addDays(from, 7 * k));

test('Rozmowy: zaniedbany wrażliwy zawodnik powoli traci morale, rozmowa to zatrzymuje', () => {
  const g = newGame();
  const p = sensitivePlayer(g);
  g.attStart = '2026-07-06';
  assert.equal(attentionNeed(p, g.date).why, 'sensitive');
  const seen = [];
  for (const d of mondays('2026-07-06', 12)) { g.date = d; attentionWeek(g, d); seen.push(p.morale); }
  assert.equal(seen[2], 14, 'pierwsze 3 tygodnie bez skutków');
  for (let k = 1; k < seen.length; k++) assert.ok(seen[k - 1] - seen[k] <= ATTN.week + 1e-9, `wolny spadek: ${seen}`);
  assert.ok(seen.at(-1) < 12.5 && seen.at(-1) >= ATTN.floor, `po 12 tygodniach: ${seen.at(-1)}`);
  assert.ok(g.inbox.length >= 0);
  // Podpowiedź asystenta w Rozmowach
  g.date = '2026-09-28';
  assert.ok(talkSuggestions(g).some((x) => x.p.id === p.id && x.reasons.some((r) => /rozmowy/i.test(r[1]))));
  const r = talkToPlayer(g, p.id, 'encourage');
  assert.ok(r.ok);
  const after = p.morale;
  assert.ok(after > seen.at(-1), 'rozmowa poprawia morale');
  for (const d of mondays('2026-10-05', 3)) { g.date = d; attentionWeek(g, d); }
  assert.equal(p.morale, after, 'po rozmowie znów 3 tygodnie spokoju');
  assert.equal(neglectLevel(p, '2026-10-19', {}, g.attStart), 0);
});

test('Rozmowy: zaniedbanie nie obniża morale poniżej progu, a spokojny zawodnik rozmów nie potrzebuje', () => {
  const g = newGame();
  const p = sensitivePlayer(g);
  p.morale = 9.3;
  const calm = squadOf(g.world, g.clubId).find((x) => x.id !== p.id && x.persona === 'Spokojny' && !x.acclim);
  calm.morale = 13;
  g.attStart = '2026-07-06';
  for (const d of mondays('2026-07-06', 20)) { g.date = d; attentionWeek(g, d); }
  assert.ok(p.morale >= ATTN.floor, String(p.morale));
  assert.equal(calm.morale, 13);
  assert.equal(attentionNeed(calm, g.date).need, 0);
  noteAttention(p, g.date);
  assert.equal(p.att.t, g.date);
});

test('Rozmowy: trenerzy AI rozmawiają z zawodnikami (ta sama reguła), wynik deterministyczny', () => {
  const run = () => {
    const g = newGame('slask-ii');
    g.attStart = '2026-07-06';
    for (const d of mondays('2026-07-06', 8)) { g.date = d; attentionWeek(g, d); }
    return squadOf(g.world, 'legia').map((p) => [p.id, p.morale, p.att?.t ?? null]);
  };
  const a = run(); const b = run();
  assert.deepEqual(a, b);
  const talked = a.filter((x) => x[2]).length;
  assert.ok(talked > 0, 'trener AI rozmawia z potrzebującymi');
});

test('Monotonia treningu: znużenie rośnie powoli, jest ograniczone i znika po zmianie akcentu', () => {
  const c = {};
  const s = [];
  for (let k = 0; k < 20; k++) { varietyWeek(c, { accent: 'zrownowazony' }); s.push(staleness(c)); }
  assert.equal(s[VARIETY.grace - 1], 0);
  assert.equal(s.at(-1), 1);
  const e = staleEffects(c);
  assert.ok(e.moraleMul >= 0.5 && e.boredom <= 0.01 && e.stimMul >= 0.85, JSON.stringify(e));
  varietyWeek(c, { accent: 'taktyczny' });
  assert.equal(staleness(c), 0);
  for (let k = 0; k < 10; k++) varietyWeek(c, { accent: 'taktyczny', edits: 3 });
  assert.equal(staleness(c), 0, 'ręczne zmiany w planie też urozmaicają');
  // Trener AI zmienia akcent co kilka tygodni
  const g = newGame('slask-ii');
  const acc = new Set(mondays('2026-07-06', 30).map((d) => aiAccentAt(g, 'legia', 'techniczny', d)));
  assert.equal(acc.size, 2);
});

test('Stary zapis: brak stanu analizy i rozmów działa, stan przechodzi przez JSON', () => {
  const g = newGame();
  delete g.scouting;
  for (const p of squadOf(g.world, g.clubId)) delete p.att;
  assert.equal(userFamiliarity(g).fam, SCOUT.neutral);
  assert.equal(scoutEdge(g, OPP, g.clubId), 0);
  play(g, ['base', 'base']);
  g.attStart = '2026-07-06';
  attentionWeek(g, '2026-08-31');
  const back = JSON.parse(JSON.stringify({ scouting: g.scouting, att: squadOf(g.world, g.clubId).map((p) => p.att ?? null) }));
  assert.equal(back.scouting.log.length, 2);
  // Zmiana klubu: rywale nie znają schematu nowej drużyny
  g.clubId = 'legia';
  assert.equal(userFamiliarity(g).fam, SCOUT.neutral);
});

// ------------------------------------------------------------ Runda 2: autorytet trenera (career/authority.js)
import { AUTH, authorityWeek, authorityTerm, authorityOf, logEngage, engagement, squadFactor } from '../src/career/authority.js';
import { holdMeeting } from '../src/career/teamTalks.js';

function fakeMatches(g, from, weeks, kind = 'pressSkip') {
  for (let k = 0; k < weeks * 2; k++) logEngage(g, kind, addDays(from, 3 * k));
}

test('Autorytet: trener, który nic nie robi, traci szatnię powoli i w granicach', () => {
  const g = newGame();
  const vals = [];
  for (const d of mondays('2026-08-03', 12)) { fakeMatches(g, addDays(d, -7), 1); vals.push((authorityWeek(g, d), g.authority.v)); }
  for (let k = 1; k < vals.length; k++) assert.ok(vals[k] <= vals[k - 1] + 1e-9);
  assert.ok(vals[0] > 0.3 && vals[1] > 0.2, `nie od razu do dna: ${vals.slice(0, 3)}`);
  assert.ok(vals.at(-1) < 0.2, `po 12 tygodniach: ${vals.at(-1)}`);
  const t = authorityTerm(vals.at(-1));
  assert.ok(t < -0.15 && t >= AUTH.min, `kara ${t}`);
  assert.ok(g.inbox.length >= 0);
});

test('Autorytet: liczy się trafność, nie liczba kliknięć', () => {
  const run = (kinds) => {
    const g = newGame();
    for (const d of mondays('2026-08-03', 10)) {
      fakeMatches(g, addDays(d, -7), 1, 'pressGood');
      for (const k of kinds) logEngage(g, k, addDays(d, -2));
      authorityWeek(g, d);
    }
    return g.authority.v;
  };
  const good = run(['talkGood', 'talkGood', 'meetGood']);
  const clicks = run(['talkBad', 'talkBad', 'talkBad', 'meetBad']);
  const meh = run(['talkMeh', 'talkMeh', 'talkMeh']);
  assert.ok(good > 0.75, `trafne rozmowy i zebrania: ${good}`);
  assert.ok(clicks < meh && meh < good, `nietrafne ${clicks}, obojętne ${meh}, trafne ${good}`);
  assert.ok(engagement({ engage: [], date: '2026-09-01' }).s === 0);
});

test('Autorytet: premia zależy od kadry, kara nie; kluby AI neutralne; stary zapis neutralny', () => {
  assert.ok(squadFactor(12.6) > squadFactor(10) && squadFactor(8) === AUTH.squad.min);
  assert.ok(authorityTerm(0.95, 12.6) > authorityTerm(0.95, 9.5));
  assert.ok(authorityTerm(0.95, 12.6) <= AUTH.max);
  assert.equal(authorityTerm(0.1, 12.6), authorityTerm(0.1, 8));
  const g = newGame();
  assert.equal(authorityOf(g, 'legia'), AUTH.start);
  delete g.authority;
  assert.equal(authorityOf(g, g.clubId), AUTH.start);
  assert.equal(authorityTerm(AUTH.start), 0);
});

test('Zebranie: trafny ton powtarzany co tydzień słabnie, ale nie obniża zaufania ani morale', () => {
  const g = newGame();
  const sq = squadOf(g.world, g.clubId);
  for (const p of sq) p.morale = 12;
  const trust0 = sq.reduce((s, p) => s + (p.relations?.[g.clubId]?.trust ?? 50), 0);
  const gains = [];
  for (const d of mondays('2026-08-03', 6)) {
    g.date = d;
    const before = sq.reduce((s, p) => s + p.morale, 0);
    holdMeeting(g, 'unity');
    gains.push(sq.reduce((s, p) => s + p.morale, 0) - before);
  }
  assert.ok(gains.at(-1) < gains[0], `efekt słabnie: ${gains.map((x) => x.toFixed(1))}`);
  assert.ok(gains.every((x) => x > -2), `powtórzenie nie szkodzi drużynie: ${gains.map((x) => x.toFixed(1))}`);
  const trust1 = sq.reduce((s, p) => s + (p.relations?.[g.clubId]?.trust ?? 50), 0);
  assert.ok(trust1 >= trust0 - sq.length * 0.5, 'zaufanie nie spada od samego powtarzania');
});
