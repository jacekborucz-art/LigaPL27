// Raport meczu (docs/raport-meczu.md): spójność zdarzeń meczów w tle i meczów gracza, stary zapis, widok.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick, fromEngineResult } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { createMatch, runToEnd, result } from '../src/engine/match/match.js';
import { Rng } from '../src/core/rng.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { applySeasonState } from '../src/season/rollover.js';
import { packReport, unpackReport, encodeId, decodeId, parseMinute, minuteLabel, LEAVE } from '../src/season/matchReport.js';
import { matchReportHtml, reportModel } from '../src/ui/matchReportView.js';
import '../src/season/dailySystems.js';

function newGame(clubId, seed) {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  return g;
}

function playTo(g, until) {
  while (g.date < until) {
    for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === g.clubId || x.away === g.clubId))) {
      const rng = new Rng(`gracz:${f.id}`); applyResult(g, f, playQuick(g, f, rng), rng);
    }
    for (const m of g.inbox.filter((x) => !x.resolved && x.actions?.length && !x.optional)) { m.resolved = true; runDecision(g, m, m.actions[0].id); }
    g.date = addDays(g.date, 1);
    processDay(g);
  }
}

const GOAL = new Set(['g', 'p', 'o']);
const CARD = new Set(['y', 'r', 'r2']);
const KNOWN = new Set(['g', 'p', 'o', 'y', 'r', 'r2', 'i', 'k', 's', 'mp', 'vg', 'vc', 'vp']);

/**
 * Warunki spójności raportu (docs/kolejka.md, rozdz. 1). rep: unpackReport(f); squad: [Set, Set] kadra meczowa
 * (domyślnie zawodnicy, którzy zagrali); players: [[{ id, g, a, yc, rc, injury }]] statystyki meczu (opcjonalnie).
 */
function checkReport(f, rep, { squad = null, players = null, quick = false } = {}) {
  const err = [];
  const res = f.result;
  const inSquad = squad ?? [0, 1].map((s) => new Set(rep.players[s].map((x) => x.id)));
  const off = [new Set(), new Set()];
  const yAt = new Map();
  let prev = 0;
  const goals = [0, 0];
  const scorers = [[], []];
  for (const e of rep.ev) {
    const [m, code, s, pid, x] = e;
    const tag = `${f.id} ${JSON.stringify(e)}`;
    if (!KNOWN.has(code)) err.push(`kod ${tag}`);
    if (s !== 0 && s !== 1) err.push(`strona ${tag}`);
    // Minuty rosnąco, w zakresie meczu (doliczony czas tylko po 45, 90, 105 i 120 min, dogrywka 91-120)
    if (!(m >= prev)) err.push(`kolejność ${tag}`);
    prev = m;
    const base = Math.floor(m + 1e-9);
    if (base < 1 || base > 120) err.push(`minuta ${tag}`);
    if (m !== base && ![45, 90, 105, 120].includes(base)) err.push(`doliczony ${tag}`);
    if (base > 90 && m >= 91 && !res.extraTime) err.push(`dogrywka bez dogrywki ${tag}`);
    if (quick && rep.full) err.push('mecz w tle z pełnym silnikiem');
    if (quick && ['s', 'vg', 'vc', 'vp', 'mp'].includes(code)) err.push(`zdarzenie spoza modelu w tle ${tag}`);
    const ps = code === 'o' ? 1 - s : s; // samobój: zawodnik drużyny rywala
    const bench = CARD.has(code) && x === 1;
    if (pid == null && code !== 'o') err.push(`brak zawodnika ${tag}`);
    if (pid != null && !inSquad[ps].has(pid)) err.push(`spoza kadry meczowej ${tag}`);
    if (pid != null && !bench && code !== 's' && off[ps].has(pid)) err.push(`zdarzenie po zejściu ${tag}`);
    if (code === 'g' && x != null) {
      if (!inSquad[s].has(x)) err.push(`asystent spoza kadry ${tag}`);
      if (off[s].has(x)) err.push(`asysta po zejściu ${tag}`);
      if (x === pid) err.push(`asysta własna ${tag}`);
    }
    if (code === 's') {
      if (off[s].has(pid) && !rep.full) err.push(`zmiana w tle ${tag}`);
      off[s].delete(pid);
      if (x != null) off[s].add(x);
    }
    if (GOAL.has(code)) { goals[s]++; if (code !== 'o') scorers[s].push(pid); }
    if (code === 'y') yAt.set(pid, m);
    if (code === 'r2' && !(yAt.has(pid) && yAt.get(pid) <= m)) err.push(`druga żółta bez wcześniejszej pierwszej ${tag}`);
    if (LEAVE.has(code) && !bench) off[ps].add(pid);
  }
  if (!rep.abandoned) {
    if (goals[0] !== res.score[0] || goals[1] !== res.score[1]) err.push(`${f.id}: gole ${goals} wynik ${res.score}`);
    for (const s of [0, 1]) if ([...scorers[s]].sort().join() !== [...(res.scorers?.[s] ?? [])].sort().join()) err.push(`${f.id}: strzelcy strony ${s}`);
  }
  if (players) {
    for (const s of [0, 1]) {
      for (const p of players[s]) {
        const mine = rep.ev.filter((e) => e[2] === s && e[3] === p.id);
        const n = (codes) => mine.filter((e) => codes.includes(e[1])).length;
        if (n(['g', 'p']) !== p.g) err.push(`${f.id} ${p.id}: gole ${n(['g', 'p'])} != ${p.g}`);
        const ast = rep.ev.filter((e) => e[2] === s && e[1] === 'g' && e[4] === p.id).length;
        if (ast !== p.a) err.push(`${f.id} ${p.id}: asysty ${ast} != ${p.a}`);
        if (n(['y']) !== (p.yc ? 1 : 0)) err.push(`${f.id} ${p.id}: żółte ${n(['y'])} != ${p.yc}`);
        if (n(['r', 'r2']) !== (p.rc ? 1 : 0)) err.push(`${f.id} ${p.id}: czerwone ${n(['r', 'r2'])} != ${p.rc}`);
        if (quick && n(['i', 'k']) !== (p.injury ? 1 : 0)) err.push(`${f.id} ${p.id}: kontuzje`);
      }
    }
  }
  return err;
}

applySeasonState({});
const G = newGame('legia', 11);
playTo(G, '2027-06-29');
const PLAYED = G.fixtures.filter((f) => f.played && f.result?.score && f.home && f.away);

test('Mecze w tle przez cały sezon: każdy raport spójny (minuty, zejścia, kartki, gole równe wynikowi)', () => {
  const withEv = PLAYED.filter((f) => f.result.ev);
  assert.ok(withEv.length > 2000, `meczów z raportem: ${withEv.length}`);
  const errs = [];
  let extra = 0; let inj = 0; let reds = 0; let goals = 0;
  for (const f of withEv) {
    const rep = unpackReport(f);
    assert.equal(rep.players[0].length, 11, f.id);
    errs.push(...checkReport(f, rep, { quick: true }));
    if (f.result.extraTime) extra++;
    inj += rep.ev.filter((e) => e[1] === 'i' || e[1] === 'k').length;
    reds += rep.ev.filter((e) => e[1] === 'r').length;
    goals += rep.ev.filter((e) => e[1] === 'g').length;
  }
  assert.deepEqual(errs.slice(0, 10), [], `błędy: ${errs.length}`);
  assert.ok(extra > 5 && inj > 300 && reds > 100 && goals > 4000, `dogrywki ${extra}, kontuzje ${inj}, czerwone ${reds}, gole ${goals}`);
});

test('Mecz w tle: zdarzenia zgodne ze statystykami zawodników (gole, asysty, kartki, kontuzje), także dogrywka', () => {
  const errs = [];
  let n = 0;
  for (const f0 of PLAYED.filter((x) => x.comp !== 'friendly').slice(0, 1500)) {
    const f = { ...f0, played: false, result: null };
    const rng = new Rng(`raport-test:${f.id}`);
    const res = playQuick(G, f, rng);
    f.result = { score: res.score, scorers: res.scorers, extraTime: res.extraTime, ...packReport(res, f) };
    errs.push(...checkReport(f, unpackReport(f), { players: res.players, quick: true }));
    // Druga żółta = czerwona (r2), minuty gry kończą się przy zejściu (czerwona, kontuzja bez gry dalej)
    for (const [m, code, s, id] of res.ev) {
      const x = res.players[s].find((y) => y.id === id);
      if (code === 'r2' && !(x?.yc && x.rc && x.redReason === 'second')) errs.push(`r2 bez dwóch żółtych ${f.id} ${id}`);
      if (['r', 'r2', 'i'].includes(code) && x && x.minutes !== Math.max(1, Math.min(90, Math.floor(m)))) errs.push(`minuty po zejściu ${f.id} ${id}: ${x.minutes} / ${m}`);
    }
    n++;
  }
  // Pucharowe w tle z dogrywką: gole dogrywki w minutach 91-120
  for (let i = 0; i < 300; i++) {
    const f0 = PLAYED.find((x) => x.comp === 'pp');
    const f = { ...f0, id: `${f0.id}-dg${i}`, knockout: 'single', played: false, result: null };
    const res = playQuick(G, f, new Rng(`dg:${i}`));
    f.result = { score: res.score, scorers: res.scorers, extraTime: res.extraTime, ...packReport(res, f) };
    const rep = unpackReport(f);
    errs.push(...checkReport(f, rep, { players: res.players, quick: true }));
    if (res.extraTime) {
      const reg = res.score.map((g, s) => g - rep.ev.filter((e) => e[2] === s && GOAL.has(e[1]) && e[0] >= 91).length);
      assert.equal(reg[0], reg[1], `${f.id}: remis po 90 min`);
    }
    n++;
  }
  assert.deepEqual(errs.slice(0, 10), [], `błędy: ${errs.length} na ${n} meczach`);
});

test('Mecze gracza (pełny silnik): zdarzenia z minutami, zmiany i VAR, spójne z ocenami i wynikiem', () => {
  const world = generateWorld(42);
  const EK = CLUBS_PL.filter((c) => c.tier === 1);
  const errs = [];
  let subs = 0; let vars = 0; let et = 0; let pk = 0;
  for (let i = 0; i < 160; i++) {
    const h = EK[i % 18].id; const a = EK[(i + 7) % 18].id;
    const side = (id) => { const sq = squadOf(world, id); return { club: clubById(id), squad: sq, tactics: createTactics(sq, { benchSize: 9 }), ai: true, coach: clubById(id).coach }; };
    const M = createMatch({ seed: `raport${i}`, home: side(h), away: side(a), ctx: { var: true, knockout: i % 3 === 0 ? 'single' : false } });
    runToEnd(M);
    const r = result(M);
    const res = fromEngineResult(r);
    const f = { id: `T${i}`, home: h, away: a, result: { score: res.score, scorers: res.scorers, extraTime: res.extraTime, shootout: res.shootout } };
    Object.assign(f.result, packReport(res, f));
    const rep = unpackReport(f);
    assert.equal(rep.full, true);
    const squad = M.teams.map((T) => new Set([...T.players, ...T.bench].map((x) => x.id)));
    // Statystyki z ocen silnika (także zawodnicy z 0 min, np. kartka na ławce)
    const players = [0, 1].map((s) => r.ratings.filter((x) => x.side === s).map((x) => ({ id: x.id, g: x.g, a: x.a, yc: x.yc, rc: x.rc })));
    errs.push(...checkReport(f, rep, { squad, players }));
    subs += rep.ev.filter((e) => e[1] === 's').length;
    vars += rep.ev.filter((e) => e[1].startsWith('v')).length;
    if (res.extraTime) et++;
    if (rep.pk.length) { pk++; assert.equal(rep.pk.filter((k) => k.side === 0 && k.scored).length, res.shootout[0]); }
  }
  assert.deepEqual(errs.slice(0, 10), [], `błędy: ${errs.length}`);
  assert.ok(subs > 500 && vars > 5 && et > 3 && pk > 1, `zmiany ${subs}, VAR ${vars}, dogrywki ${et}, karne ${pk}`);
});

test('Mecz gracza przez applyResult: raport w terminarzu z pełnego silnika, widok bez błędów', () => {
  const g = newGame('lech', 3);
  const f = g.fixtures.find((x) => x.comp === 'ekstraklasa' && (x.home === 'lech' || x.away === 'lech'));
  const side = (id) => { const sq = squadOf(g.world, id); return { club: clubById(id), squad: sq, tactics: createTactics(sq, { benchSize: 9 }), ai: true, coach: clubById(id).coach }; };
  const M = createMatch({ seed: `${g.seed}:${f.id}`, home: side(f.home), away: side(f.away), ctx: { var: true } });
  runToEnd(M);
  const r = result(M);
  applyResult(g, f, fromEngineResult(r), new Rng('x'));
  assert.equal(f.result.fe, 1);
  assert.ok(Array.isArray(f.result.ev) && f.result.pl[0].length >= 11);
  const squad = M.teams.map((T) => new Set([...T.players, ...T.bench].map((x) => x.id)));
  assert.deepEqual(checkReport(f, unpackReport(f), { squad }), []);
  const html = matchReportHtml(g, { fx: f.id });
  assert.match(html, /Raport meczu/);
  assert.match(html, /Oceny zawodników/);
  assert.doesNotMatch(html, /undefined|NaN|\u2014/);
});

test('Zapis: kod zawodnika względem klubu i minuty z doliczonym czasem', () => {
  for (const [id, club] of [['legia-17', 'legia'], ['legia-a3', 'legia'], ['lech-4', 'legia'], ['zag-2026-07-01-17', 'legia'], ['legia-ii-5', 'legia'], ['real-madrid-e3', 'real-madrid']]) {
    assert.equal(decodeId(encodeId(id, club), club), id);
  }
  assert.equal(encodeId('legia-17', 'legia'), 17);
  assert.equal(parseMinute("45+2'"), 45.02);
  assert.equal(parseMinute("120+1'"), 120.01);
  assert.equal(minuteLabel(90.05), "90+5'");
  assert.equal(minuteLabel(67), "67'");
});

test('Rozmiar zapisu: raporty całego sezonu dokładają mało (poniżej 1 MB)', () => {
  const extra = PLAYED.reduce((s, f) => s + JSON.stringify({ ev: f.result.ev, pl: f.result.pl, rt: f.result.rt, pk: f.result.pk, fe: f.result.fe }).length, 0);
  const all = JSON.stringify(G).length;
  assert.ok(extra < 1_000_000, `raporty: ${extra} B`);
  assert.ok(extra / all < 0.15, `udział ${Math.round((extra / all) * 100)} % z ${all} B`);
});

test('Widok raportu: wszystkie rozegrane mecze sezonu bez undefined, NaN i pauzy em', () => {
  let n = 0;
  for (const f of PLAYED) {
    const html = matchReportHtml(G, { fx: f.id });
    assert.doesNotMatch(html, /undefined|NaN|\u2014|\[object/, f.id);
    n++;
  }
  assert.ok(n > 2000);
  // Poważna kontuzja wyróżniona, informacja o zejściu z boiska
  const sev = PLAYED.find((f) => f.result.ev?.some((e) => e[1] === 'i' && e[4] === 'severe'));
  if (sev) assert.match(matchReportHtml(G, { fx: sev.id }), /is-serious[\s\S]*zszedł z boiska/);
});

test('Stary zapis bez zdarzeń: raport z wynikiem i strzelcami, bez błędu; puchary bez polskiego klubu i historia: sam wynik', () => {
  const f0 = PLAYED.find((f) => f.result.score[0] + f.result.score[1] > 0 && f.comp === 'ekstraklasa');
  const old = { ...f0, result: { score: f0.result.score, scorers: f0.result.scorers, shootout: null, extraTime: false, stats: f0.result.stats } };
  const g = { ...G, fixtures: G.fixtures.map((f) => (f === f0 ? old : f)) };
  const M = reportModel(g, { fx: old.id });
  assert.equal(M.kind, 'scorers');
  const html = matchReportHtml(g, { fx: old.id });
  assert.match(html, /Strzelcy/);
  assert.doesNotMatch(html, /undefined|NaN|\u2014/);
  // Stary zapis jeszcze starszy: bez strzelców i statystyk, walkower
  const bare = { ...f0, result: { score: [0, 3], forfeit: true } };
  const g2 = { ...G, fixtures: G.fixtures.map((f) => (f === f0 ? bare : f)) };
  assert.doesNotMatch(matchReportHtml(g2, { fx: bare.id }), /undefined|NaN|\u2014/);
  // Mecz pucharów europejskich bez polskiego klubu
  const um = Object.values(G.season.uefa.matches).find((m) => m.played && !G.fixtures.some((f) => f.id === m.id));
  assert.ok(um);
  assert.equal(reportModel(G, { fx: um.id }).kind, 'score');
  assert.doesNotMatch(matchReportHtml(G, { fx: um.id }), /undefined|NaN|\u2014/);
  // Sezon z historii (sam wynik) i nieznany mecz
  const row = G.history.m['2026/27'][0];
  const g3 = { ...G, history: { m: { '2025/26': [row] } } };
  assert.equal(reportModel(g3, { fx: row.id, s: '2025/26' }).kind, 'score');
  assert.match(matchReportHtml(G, { fx: 'brak' }), /Brak danych/);
});

test('Widok: zawodnik usunięty ze świata (bez klubu i kontraktu) nie psuje raportu', () => {
  const f = PLAYED.find((x) => x.result.ev?.some((e) => e[1] === 'g' && typeof e[3] === 'number'));
  const id = unpackReport(f).ev.find((e) => e[1] === 'g')[3];
  const p = G.world.players[id];
  const saved = { clubId: p.clubId, contract: p.contract };
  p.clubId = null; p.contract = null;
  assert.doesNotMatch(matchReportHtml(G, { fx: f.id }), /undefined|NaN|\u2014/);
  delete G.world.players[id];
  const html = matchReportHtml(G, { fx: f.id });
  assert.doesNotMatch(html, /undefined|NaN|\u2014/);
  G.world.players[id] = p; Object.assign(p, saved);
});

test('Kontrola spójności wykrywa błędy (zdarzenie po czerwonej, druga żółta bez pierwszej, gole różne od wyniku, zawodnik spoza kadry)', () => {
  const f = { id: 'X', home: 'legia', away: 'lech', result: { score: [1, 0], scorers: [['legia-9'], []], extraTime: false } };
  const pl = [Array.from({ length: 11 }, (_, i) => ({ id: `legia-${i + 1}`, rating: 6.5 })), Array.from({ length: 11 }, (_, i) => ({ id: `lech-${i + 1}`, rating: 6.5 }))];
  const rep = (ev) => ({ ev, players: pl, pk: [], full: false, abandoned: false });
  assert.deepEqual(checkReport(f, rep([[30, 'g', 0, 'legia-9', 'legia-8']])), []);
  assert.ok(checkReport(f, rep([[20, 'r', 0, 'legia-9'], [30, 'g', 0, 'legia-9']])).some((e) => /po zejściu/.test(e)));
  assert.ok(checkReport(f, rep([[20, 'i', 0, 'legia-8', 'medium', 20, 'uraz'], [30, 'g', 0, 'legia-9', 'legia-8']])).some((e) => /asysta po zejściu/.test(e)));
  assert.ok(checkReport(f, rep([[30, 'g', 0, 'legia-9'], [50, 'r2', 1, 'lech-3']])).some((e) => /druga żółta/.test(e)));
  assert.ok(checkReport(f, rep([[30, 'g', 0, 'legia-9'], [31, 'g', 0, 'legia-9']])).some((e) => /gole/.test(e)));
  assert.ok(checkReport(f, rep([[30, 'g', 0, 'legia-30']])).some((e) => /spoza kadry/.test(e)));
  assert.ok(checkReport(f, rep([[60, 'g', 0, 'legia-9'], [30, 'y', 1, 'lech-2']])).some((e) => /kolejność/.test(e)));
  assert.ok(checkReport(f, rep([[30, 'g', 0, 'legia-9'], [95, 'y', 1, 'lech-2']])).some((e) => /dogrywka/.test(e)));
});
