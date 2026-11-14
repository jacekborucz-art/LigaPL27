import { CLUBS_PL } from '../src/data/clubs_pl.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, playQuick, applyResult, restOk } from '../src/season/season.js';
import { processDay, continueUntilStop, primaryAction, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { createFinance } from '../src/career/finance.js';
import '../src/season/dailySystems.js';
import * as TR from '../src/training/index.js';
import { CAMP, FRIENDLY } from '../src/training/config.js';
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

/** Gra do daty; sparingi kończymy remisem (aplikacja gra je pełnym silnikiem), resztę szybką symulacją. */
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

const official = (g) => g.fixtures.filter((f) => f.comp !== 'friendly' && (f.home === g.clubId || f.away === g.clubId));

test('Rezerwacja obozu: koszt w finansach (camps), termin w przerwie, odwołanie zwraca pieniądze', () => {
  const g = newGame();
  const w = TR.campWindow(g, 'summer');
  assert.ok(w.length >= 14 && w.from > g.date && w.to < w.start);
  assert.ok(official(g).every((f) => f.date < w.from || f.date > w.to), 'okno bez meczów o punkty');
  const bal0 = g.finance.clubs.widzew.balance;
  const from = TR.campStarts(g, 'summer', 10)[1];
  const r = TR.bookCamp(g, { half: 'summer', dest: 'austria', days: 10, from });
  assert.ok(r.ok, r.error);
  assert.equal(g.finance.clubs.widzew.balance, bal0 - r.camp.cost);
  assert.equal(g.finance.clubs.widzew.ledger['2026-07'].out.camps, r.camp.cost);
  assert.ok(r.camp.cost > TR.campCost(g, 'widzew', 'polska', 10));
  assert.ok(TR.campCost(g, 'legia', 'turcja', 10) > TR.campCost(g, 'sokol-kleczew', 'turcja', 10), 'koszt zależy od budżetu klubu');
  assert.equal(TR.bookCamp(g, { half: 'summer', dest: 'polska', days: 7, from }).ok, false, 'drugi obóz na tę samą rundę');
  assert.equal(TR.campOn(g, from).dest, 'austria');
  assert.equal(TR.dayContext(g, addDays(from, 1)).phase, 'oboz');
  assert.ok(TR.cancelCamp(g, '2026-L').ok);
  assert.equal(g.finance.clubs.widzew.balance, bal0);
  assert.equal(TR.campOn(g, from), null);
  // Złe terminy
  assert.equal(TR.bookCamp(g, { half: 'summer', dest: 'austria', days: 14, from: addDays(w.to, -3) }).ok, false);
  assert.equal(TR.bookCamp(g, { half: 'summer', dest: 'austria', days: 3, from }).ok, false);
  assert.equal(TR.bookCamp(g, { half: 'summer', dest: 'ksiezyc', days: 7, from }).ok, false);
});

test('Obóz daje lepsze zajęcia: większy bodziec rozwoju, szybsze zgranie, forma bazowa na start rundy', () => {
  const a = newGame('widzew', 11); const b = newGame('widzew', 11);
  const from = TR.campStarts(a, 'summer', 12)[0];
  assert.ok(TR.bookCamp(a, { half: 'summer', dest: 'austria', days: 12, from }).ok);
  playUntil(a, addDays(from, 12)); playUntil(b, addDays(from, 12));
  const stim = (g) => squadOf(g.world, 'widzew').reduce((s, p) => s + Object.values(p.training.stim).reduce((x, y) => x + y, 0), 0);
  assert.ok(stim(a) > stim(b) * 1.05, `${stim(a)} vs ${stim(b)}`);
  assert.ok(TR.teamCohesion(a).z > TR.teamCohesion(b).z);
  playUntil(a, '2026-07-27'); playUntil(b, '2026-07-27');
  const ca = a.training.clubs.widzew.cb; const cb = b.training.clubs.widzew.cb;
  assert.equal(ca.key, '2026-L');
  assert.ok(ca.base >= 1 && cb.base < 0.85, `${ca.base} vs ${cb.base}`);
  assert.ok(a.inbox.some((m) => m.key === 'campbase:2026-L') && a.inbox.some((m) => m.key === 'campstart:2026-L'));
});

test('Brak obozu zimą: wyraźna kara wobec obozu w Turcji (siła, urazy, ostrość), potem wygasa', () => {
  const g = newGame('widzew', 5);
  const w = TR.campWindow(g, 'winter');
  assert.ok(w.from >= '2027-01-01' && w.start > w.to);
  const turkey = TR.campPreview(g, 'winter', 'turcja', 12);
  const poland = TR.campPreview(g, 'winter', 'polska', 7);
  assert.ok(turkey.base > poland.base && poland.base > turkey.none, 'Turcja > Polska > bez obozu');
  assert.ok(turkey.q > CAMP.dests.polska.q.winter);
  assert.ok(turkey.term - turkey.noneTerm > 0.15, `różnica ${turkey.term - turkey.noneTerm}`);
  // Modyfikator w meczu: zawodnik klubu bez obozu słabszy przez 3 tygodnie, potem efekt znika
  const c = g.training.clubs.widzew;
  const p = squadOf(g.world, 'widzew')[5];
  TR.attachTraining(g);
  const camp = TR.MODIFIERS.find((m) => m.id === 'trainingCamp');
  const at = (base, date) => { c.cb = { key: w.key, base, start: w.start }; g.date = date; return camp.apply(p, {}); };
  const noCamp = at(turkey.none, addDays(w.start, 7));
  const withCamp = at(turkey.base, addDays(w.start, 7));
  assert.ok(noCamp < -0.1 && withCamp >= 0, `${noCamp} vs ${withCamp}`);
  assert.equal(at(turkey.none, addDays(w.start, 50)), 0);
  assert.ok(at(turkey.none, addDays(w.start, 30)) > noCamp, 'efekt wygasa');
  // Urazy treningowe i ostrość w tym okresie
  const ctx = { sessions: [{ type: 'gierki', int: 'mid' }], age: 25, acwr: 1, fitQ: 10 };
  const lack = 1 - turkey.none;
  const pl = { hidden: { ODP: 10 }, attr: { WYT: 10 } };
  assert.ok(TR.trainingInjuryChance(pl, { ...ctx, baseMul: 1 + CAMP.injuryPenalty * lack }) > TR.trainingInjuryChance(pl, ctx) * 1.3);
  assert.ok(TR.trainingInjuryChance(pl, { ...ctx, campQ: 1 }) < TR.trainingInjuryChance(pl, ctx), 'na obozie mniej urazów');
});

test('Kluby AI jadą na obóz same według możliwości: bogaci zimą do Turcji i Hiszpanii', () => {
  const g = newGame('widzew');
  const rich = ['legia', 'lech', 'rakow'].map((id) => TR.aiCampChoice(g, id, 'winter'));
  assert.ok(rich.every((x) => ['turcja', 'hiszpania'].includes(x.dest) && x.days >= 8), JSON.stringify(rich));
  const poor = ['sokol-kleczew', 'swit', 'rekord', 'lechia-zg'].map((id) => TR.aiCampChoice(g, id, 'winter'));
  assert.ok(poor.every((x) => x.dest === null || x.dest === 'polska' || x.dest === 'turcja'));
  assert.ok(poor.some((x) => x.dest !== 'turcja'));
  const summer = TR.aiCampChoice(g, 'legia', 'summer');
  assert.ok(['austria', 'slowenia'].includes(summer.dest));
  assert.deepEqual(TR.aiCampChoice(g, 'lech', 'winter'), TR.aiCampChoice(g, 'lech', 'winter'), 'deterministycznie');
  playUntil(g, '2026-07-21');
  // Ligi 1-3 (III liga zaczyna później: obóz przed jej startem, docs/iii-liga.md)
  const cbs = Object.keys(g.world.clubs).filter((id) => id !== 'widzew' && CLUBS_PL.find((c) => c.id === id)?.tier <= 3).map((id) => g.training.clubs[id].cb);
  assert.ok(cbs.every((x) => x && x.key === '2026-L' && x.base >= CAMP.baseMin && x.base <= CAMP.baseMax));
  assert.ok(g.training.clubs.legia.cb.base > g.training.clubs['sokol-kleczew'].cb.base - 0.01);
});

test('Sparingi: tylko w wolnych terminach, z rywalem z wolnym terminem, w dokładnym formacie', () => {
  const g = newGame('widzew');
  const dates = TR.friendlyDates(g, { days: 200, limit: 200 });
  assert.ok(dates.length > 10);
  for (const d of dates) {
    assert.ok(restOk(g.fixtures, 'widzew', d.date), d.date);
    assert.ok(['lato', 'zima', 'fifa'].includes(d.period.kind));
  }
  const date = dates[3].date;
  const opps = TR.friendlyOpponents(g, date);
  assert.ok(opps.some((o) => o.foreign) && opps.some((o) => !o.foreign));
  for (const o of opps.filter((x) => !x.foreign)) assert.ok(restOk(g.fixtures, o.id, date) && TR.levelText(0) && o.level);
  const r = TR.createFriendly(g, date, opps[0].id);
  assert.ok(r.ok, r.error);
  assert.deepEqual(Object.keys(r.fixture).sort(), ['away', 'comp', 'date', 'friendlyRules', 'home', 'id', 'label', 'neutral', 'played', 'round', 'time'].sort());
  assert.deepEqual(r.fixture.friendlyRules, { decider: 'none', subs: 'unlimited', rotation: 'auto', period: dates[3].period.kind });
  assert.equal(r.fixture.id, `SP-${date}-${opps[0].id}`);
  assert.equal(r.fixture.comp, 'friendly');
  assert.equal(r.fixture.time, '17:00');
  assert.equal(r.fixture.label, `Sparing: ${opps[0].name}`);
  const sorted = g.fixtures.map((f) => f.date + (f.time ?? ''));
  assert.deepEqual(sorted, [...sorted].sort());
  // Za blisko innego meczu, w środku sezonu, w przeszłości
  assert.equal(TR.createFriendly(g, addDays(date, 1), opps[1].id).ok, false);
  const leagueDay = official(g).find((f) => f.comp === 'ekstraklasa' && f.date > '2026-08-15').date;
  assert.equal(TR.createFriendly(g, addDays(leagueDay, 3), opps[1].id).ok, false);
  assert.equal(TR.createFriendly(g, '2026-06-20', opps[1].id).ok, false);
  // Odwołanie
  assert.ok(TR.cancelFriendly(g, r.fixture.id).ok);
  assert.ok(!g.fixtures.some((f) => f.id === r.fixture.id));
  assert.equal(TR.cancelFriendly(g, 'SP-nie-ma').ok, false);
});

test('Sparingi: limity w okresach (6 latem, 2 na okno FIFA) i sparing na obozie na neutralnym boisku', () => {
  const g = newGame('widzew');
  const from = TR.campStarts(g, 'summer', 10)[0];
  TR.bookCamp(g, { half: 'summer', dest: 'turcja', days: 10, from });
  let made = 0;
  for (const d of TR.friendlyDates(g, { days: 30, limit: 200 })) {
    const opp = TR.friendlyOpponents(g, d.date)[0];
    if (opp && TR.createFriendly(g, d.date, opp.id).ok) made++;
  }
  assert.equal(made, FRIENDLY.limits.lato);
  assert.equal(TR.friendlyDates(g, { days: 30, limit: 200 }).filter((d) => d.period.kind === 'lato').length, 0);
  const atCamp = TR.clubFriendlies(g).find((f) => f.date >= from && f.date <= addDays(from, 9));
  assert.ok(atCamp && atCamp.neutral, 'sparing na obozie: teren neutralny');
  const tur = TR.friendlyOpponents(g, addDays(from, 4));
  assert.ok(tur.length === 0 || tur.every((o) => o.foreign && o.where), 'na obozie w Turcji rywale z Turcji');
  const fifa = TR.friendlyDates(g, { days: 120, limit: 400 }).filter((d) => d.period.kind === 'fifa');
  let fifaMade = 0;
  for (const d of fifa.filter((x) => x.period.id === fifa[0].period.id)) {
    const opp = TR.friendlyOpponents(g, d.date)[0];
    if (opp && TR.createFriendly(g, d.date, opp.id).ok) fifaMade++;
  }
  assert.equal(fifaMade, FRIENDLY.limits.fifa);
});

test('Sparing w planie tygodnia: dzień meczowy z rozruchem przed i regeneracją po, bez przerywania okresu przygotowawczego', () => {
  const g = newGame('widzew');
  const d = TR.friendlyDates(g, { days: 25 }).find((x) => x.date >= '2026-07-08').date;
  assert.ok(TR.createFriendly(g, d, TR.friendlyOpponents(g, d)[0].id).ok);
  assert.equal(TR.planDay(g, d).kind, 'match');
  assert.ok(TR.dayContext(g, d).friendly);
  assert.ok(TR.planDay(g, addDays(d, -1)).sessions.every((x) => x.int === 'low'));
  assert.equal(TR.planDay(g, addDays(d, 1)).sessions[0].type, 'regeneracja');
  assert.equal(TR.dayContext(g, addDays(d, 3)).phase, 'oboz');
  // Rozegrany sparing liczy się do zgrania i obciążenia
  const c = g.training.clubs.widzew;
  const fam0 = c.fam[g.tactics.formation];
  playUntil(g, addDays(d, 2));
  assert.ok(c.fam[g.tactics.formation] > fam0);
  const starter = g.world.players[g.tactics.xi[3]];
  assert.ok(starter.training.log.some((x) => x >= 60), 'obciążenie meczowe sparingu w dzienniku');
});

test('Ekran: zakładki Obozy i Sparingi działają przez akcje tr-', () => {
  const g = newGame('legia');
  let ui = {};
  const act = (a, ds) => { const r = handleTrainingAction(g, a, ds); ui = { ...ui, ...r.ui }; return r; };
  act('tr-tab', { tab: 'obozy' });
  act('tr-camp-dest', { v: 'slowenia' }); act('tr-camp-len', { v: '7' });
  let html = renderTraining(g, ui);
  assert.ok(html.includes('Zaplanuj obóz') && !/undefined|NaN|\[object|—/.test(html));
  const m = html.match(/data-act="tr-camp-book" data-half="(\w+)" data-dest="(\w+)" data-len="(\d+)" data-date="([\d-]+)"/);
  assert.ok(act('tr-camp-book', { half: m[1], dest: m[2], len: m[3], date: m[4] }).save);
  assert.equal(TR.bookingFor(g, '2026-L').dest, 'slowenia');
  act('tr-camp-half', { v: 'winter' });
  assert.ok(renderTraining(g, ui).includes('Turcja'));
  act('tr-tab', { tab: 'sparingi' });
  html = renderTraining(g, ui);
  const d = html.match(/data-act="tr-fr-date" data-date="([\d-]+)"/)[1];
  act('tr-fr-date', { date: d });
  html = renderTraining(g, ui);
  const o = html.match(/data-act="tr-fr-add" data-date="([\d-]+)" data-opp="([^"]+)"/);
  assert.ok(act('tr-fr-add', { date: o[1], opp: o[2] }).save);
  html = renderTraining(g, ui);
  const id = html.match(/data-act="tr-fr-cancel" data-id="([^"]+)"/)[1];
  assert.ok(act('tr-fr-cancel', { id }).save);
  assert.equal(TR.clubFriendlies(g).length, 0);
  assert.ok(!/undefined|NaN|—/.test(renderTraining(g, ui)));
});
