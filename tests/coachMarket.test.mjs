// Rynek trenerów AI i właściciele (src/career/coachMarket.js, src/career/owners.js, docs/trenerzy-i-wlasciciele.md):
// skala lig, własny styl nowego trenera, profil właściciela, zwolnienia przez pryzmat właściciela, pula wolnych
// trenerów, sezon trenera (dopasowanie, chemia, nowa miotła), stare zapisy, liczba zmian w sezonie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { clubPlan } from '../src/career/finance.js';
import { createSeason, applyResult, playQuick } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer, switchClub } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { applySeasonState } from '../src/season/rollover.js';
import { ensureTraining, aiPlanFor } from '../src/training/index.js';
import { renderClubView } from '../src/ui/clubView.js';
import '../src/season/dailySystems.js';
import '../src/match/matchday.js';
import {
  COACH, COACH_KEYS, generateCoach, coachOf, coachStyle, coachSkill, matchCoach, ensureCoaches, replaceCoach, coachAvg, assistantProfile,
} from '../src/career/coaches.js';
import { generateOwner, ownerOf, ownerBlurb } from '../src/career/owners.js';
import {
  MARKET, ensureCoachMarket, fireCoach, hireCoach, fireChance, coachPressure, seasonFit, coachMarketDay, summerReview,
} from '../src/career/coachMarket.js';

const tierClubs = (t) => CLUBS_PL.filter((c) => c.tier === t);
const newGame = (seed, clubId = 'slask-ii') => {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'A', lastName: 'B' } } };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureTraining(g); ensureCareer(g);
  return g;
};

test('Skala lig: Ekstraklasa bez zmian (ok. 10,4), 1 Liga ok. 9, 2 Liga ok. 8; słabszy trener to wciąż zawodowiec', () => {
  const mean = (t) => {
    let s = 0; let n = 0;
    for (let seed = 1; seed <= 30; seed++) for (const c of tierClubs(t)) { s += coachAvg(generateCoach(seed, c.id)); n++; }
    return s / n;
  };
  const [m1, m2, m3] = [mean(1), mean(2), mean(3)];
  assert.ok(Math.abs(m1 - 10.4) < 0.5, `Ekstraklasa ${m1.toFixed(2)}`);
  assert.ok(m2 > 8.4 && m2 < 9.6, `1 Liga ${m2.toFixed(2)}`);
  assert.ok(m3 > 7.4 && m3 < 8.6, `2 Liga ${m3.toFixed(2)}`);
  // Punkt neutralny i dodatnia strona bez zmian, ujemna łagodniejsza
  assert.equal(coachSkill(10.5), 0);
  assert.ok(Math.abs(coachSkill(16) - 5.5 / 9.5) < 1e-9);
  assert.ok(coachSkill(8) > -0.2 && coachSkill(8) < -0.12, `s(8) = ${coachSkill(8).toFixed(3)}`);
  assert.ok(coachSkill(1) === -1);
  // Asystent gracza w lidze jak trener AI tej ligi
  assert.ok(assistantProfile(7, 3).a.TAK >= 7, 'asystent klubu 2 Ligi');
  assert.equal(assistantProfile(17).a.TAK, 13, 'Ekstraklasa jak dotąd');
});

test('Właściciel: profil z finansów (nazwa, typ), deterministyczny, cechy 1-20, charakter bez liczb, zapis leniwy', () => {
  const o = generateOwner(5, 'legia');
  assert.deepEqual(o, generateOwner(5, 'legia'));
  assert.equal(o.name, clubPlan(clubById('legia')).ownerName);
  assert.equal(o.type, clubPlan(clubById('legia')).ownerType);
  for (const k of ['cierpliwosc', 'ambicja', 'temperament', 'media', 'zasobnosc']) assert.ok(o[k] >= 1 && o[k] <= 20);
  let pat = 0; let n = 0;
  for (let s = 1; s <= 20; s++) { pat += generateOwner(s, 'jagiellonia').cierpliwosc - generateOwner(s, 'legia').cierpliwosc; n++; }
  assert.ok(pat / n > 5, 'Jagiellonia (stabilny pion sportowy) cierpliwsza niż Legia (częste zmiany)');
  assert.ok(generateOwner(5, 'widzew').zasobnosc > generateOwner(5, 'znicz').zasobnosc, 'miliarder bogatszy niż miasto w 2 Lidze');
  for (const c of CLUBS_PL) assert.ok(!/\d/.test(ownerBlurb(generateOwner(3, c.id))), 'bez liczb');
  const g = { seed: 3, clubId: 'widzew', world: generateWorld(3), fixtures: [] };
  assert.equal(g.owners, undefined);
  const lech = ownerOf(g, 'lech');
  assert.equal(g.owners.lech, lech);
  assert.deepEqual(JSON.parse(JSON.stringify(g.owners)).lech, lech);
});

test('Styl: pierwszy trener prowadzi styl klubu, nowy trener przynosi własny (mecz, trening, odprawy)', () => {
  const g = { seed: 8, clubId: 'widzew', date: '2026-08-01', world: generateWorld(8), fixtures: [] };
  ensureCoaches(g);
  for (const c of tierClubs(1)) if (c.id !== 'widzew') assert.equal(coachStyle(g, c.id), c.coach, 'ciągłość: styl z danych klubu');
  assert.equal(coachStyle(g, 'widzew'), clubById('widzew').coach, 'klub gracza: styl z danych');
  // Nowi trenerzy (bez puli): styl z ziarna, nie zawsze ten sam co klub
  let differ = 0;
  for (const c of tierClubs(1)) { if (c.id === 'widzew') continue; const p = replaceCoach(g, c.id, '2026-09-01'); if (p.style !== c.coach) differ++; assert.equal(coachStyle(g, c.id), p.style); }
  assert.ok(differ >= 4, `nowy styl w ${differ} klubach`);
  // Zatrudnienie z puli: styl kandydata
  ensureCoachMarket(g);
  const club = 'piast';
  g.coachMarket.pool = [{ ...g.coachMarket.pool[0], style: 'O', a: Object.fromEntries(COACH_KEYS.map((k) => [k, 9])) }];
  const r = hireCoach(g, club, '2026-10-01');
  assert.equal(r.coach.style, 'O');
  assert.equal(coachStyle(g, club), 'O');
  assert.equal(aiPlanFor(club, g).accent, aiPlanFor('legia').accent, 'trening klubu AI wg stylu trenera (ofensywny jak Legia)');
  assert.notEqual(aiPlanFor(club, g).accent, aiPlanFor(club).accent, 'inny akcent niż styl ostrożny z danych klubu');
});

test('Właściciel zmienia zachowanie: ta sama sytuacja, niecierpliwy zwalnia częściej, ambitny oczekuje więcej', () => {
  const g = newGame(4);
  const tables = { 1: tierClubs(1).map((c, i) => ({ id: c.id, pos: c.id === 'piast' ? 17 : i + 1 })) };
  // Piast: 10 meczów, ostatnie 5 porażek
  let md = 0;
  for (const f of g.fixtures.filter((x) => x.comp === 'ekstraklasa' && (x.home === 'piast' || x.away === 'piast')).slice(0, 10)) {
    f.played = true; f.result = { score: f.home === 'piast' ? [md < 5 ? 1 : 0, md < 5 ? 1 : 2] : [md < 5 ? 1 : 2, md < 5 ? 1 : 0] }; md++;
  }
  const date = '2026-10-20';
  ownerOf(g, 'piast');
  g.owners.piast = { ...generateOwner(4, 'piast'), cierpliwosc: 16, temperament: 6, ambicja: 8 };
  const pr1 = coachPressure(g, 'piast', tables, date);
  const calm = fireChance(g, 'piast', pr1, date);
  g.owners.piast = { ...g.owners.piast, cierpliwosc: 4, temperament: 16, ambicja: 16 };
  const pr2 = coachPressure(g, 'piast', tables, date);
  const hot = fireChance(g, 'piast', pr2, date);
  assert.ok(pr2.target < pr1.target, 'ambitny właściciel oczekuje wyższego miejsca');
  assert.ok(pr2.C > pr1.C, `presja ${pr1.C} -> ${pr2.C}`);
  assert.ok(hot > calm + 0.05, `szansa zwolnienia ${calm.toFixed(3)} -> ${hot.toFixed(3)}`);
  assert.ok(hot <= MARKET.hMax * 1.2);
  // Klub gracza: rynek go nie dotyka
  assert.equal(fireCoach(g, g.clubId, date), null);
  assert.equal(hireCoach(g, g.clubId, date), null);
});

test('Zwolnienie: trener do puli, asystent tymczasowo, potem nowy trener z puli; wiadomość w Mediach dla ważnych klubów', () => {
  const g = newGame(6, 'gks-katowice');
  const old = coachOf(g, 'korona');
  const pool0 = g.coachMarket.pool.length;
  const r = fireCoach(g, 'korona', '2026-10-05', { why: 'wyniki' });
  assert.ok(r.caretaker.caretaker && coachOf(g, 'korona').caretaker);
  assert.ok(g.coachMarket.pool.some((c) => c.name === old.name && c.lastClub === 'korona'), 'zwolniony trener w puli');
  assert.equal(g.coachMarket.pool.length, pool0 + 1);
  assert.ok(r.messages.some((m) => m.category === 'media' && m.subject.includes(old.name)), 'wiadomość: klub z ligi gracza');
  assert.ok(g.coachMarket.stats[2026].inSeason[1] === 1);
  // Koniec zastępstwa: nowy trener (nie ten sam, którego zwolniono)
  const until = coachOf(g, 'korona').until;
  g.date = until;
  coachMarketDay(g, until);
  const now = coachOf(g, 'korona');
  assert.ok(!now.caretaker && now.name !== old.name, 'nowy trener po zastępstwie');
  assert.ok(now.from === until && now.n >= 2);
  assert.equal(g.coachLog[0].club, 'korona');
  // Odprawa w finansach klubu
  assert.ok(Object.values(g.finance.clubs.korona.ledger).some((m) => (m.out?.ops ?? 0) > 0));
  // Karta trenera: staż, historia, właściciel bez liczb
  const html = renderClubView(g, 'korona');
  assert.ok(html.includes('W klubie od') && html.includes('Historia'));
  assert.ok(html.includes('clv-owner') || html.includes('Właściciel'));
});

test('Zmiana pracy gracza: trener AI nowego klubu do puli, poprzedni klub gracza zatrudnia trenera z rynku', () => {
  const g = newGame(12, 'gks-katowice');
  const ai = coachOf(g, 'korona');
  switchClub(g, 'korona', '2026-10-10');
  assert.equal(g.clubId, 'korona');
  assert.equal(g.coaches.korona, undefined, 'w nowym klubie trenerem jest gracz');
  assert.ok(g.coachMarket.pool.some((c) => c.name === ai.name) || g.coaches['gks-katowice'].name === ai.name, 'w puli albo od razu w poprzednim klubie gracza');
  const next = g.coaches['gks-katowice'];
  assert.ok(next && next.n >= 1 && next.from === '2026-10-10' && !next.caretaker, 'poprzedni klub ma nowego trenera');
});

test('Sezon trenera: dopasowanie i chemia deterministyczne i ograniczone, nowa miotła wygasa, matchCoach ją widzi', () => {
  const g = newGame(7);
  const p = coachOf(g, 'lech');
  const a = seasonFit(g, 'lech', p, 2026); const b = seasonFit(g, 'lech', p, 2026);
  assert.deepEqual(a, b);
  assert.notDeepEqual(seasonFit(g, 'lech', p, 2027), a, 'nowy sezon: nowa chemia');
  let sd = 0; let n = 0;
  for (const c of tierClubs(1)) for (const y of [2026, 2027, 2028]) {
    const f = seasonFit(g, c.id, coachOf(g, c.id), y);
    assert.ok(Math.abs(f.chem) <= COACH.season.chemMax && Math.abs(f.style) <= COACH.season.styleFit + 1e-9);
    sd += f.chem ** 2; n++;
  }
  assert.ok(Math.sqrt(sd / n) > 0.8, 'chemia naprawdę losowa');
  // Nowa miotła: zaraz po zatrudnieniu większe przesunięcie niż po 6 tygodniach
  fireCoach(g, 'lech', '2026-09-01', { why: 'wyniki' });
  hireCoach(g, 'lech', '2026-09-05');
  coachMarketDay(g, '2026-09-06');
  const early = coachOf(g, 'lech').boost - coachOf(g, 'lech').fit;
  coachMarketDay(g, '2026-11-01');
  const late = coachOf(g, 'lech').boost - coachOf(g, 'lech').fit;
  assert.ok(early > 1 && Math.abs(late) < 0.11, `nowa miotła ${early} -> ${late}`);
  const prof = { a: Object.fromEntries(COACH_KEYS.map((k) => [k, 10.5])) };
  assert.ok(matchCoach({ ...prof, boost: 2 }).tak > matchCoach(prof).tak, 'przesunięcie w meczu');
  assert.equal(matchCoach(prof).tak, 0);
});

test('Stary zapis: bez rynku, właścicieli i wersji profili; skala lig podniesiona przy wczytaniu, te same nazwiska', () => {
  const g = newGame(9);
  const names = Object.fromEntries(Object.entries(g.coaches).map(([id, p]) => [id, p.name]));
  // Symulacja starego zapisu: profile v1 (stara skala), brak rynku i właścicieli
  const old = JSON.parse(JSON.stringify(g));
  delete old.coachMarket; delete old.owners;
  for (const p of Object.values(old.coaches)) { delete p.v; delete p.from; delete p.hist; delete p.id; delete p.nat; for (const k of COACH_KEYS) p.a[k] = 3; }
  ensureCareer(old);
  assert.ok(old.coachMarket.pool.length > 20, 'pula z ziarna');
  for (const [id, p] of Object.entries(old.coaches)) {
    assert.equal(p.name, names[id]);
    assert.equal(p.v, 2);
    assert.ok(p.from && Array.isArray(p.hist));
    assert.ok(COACH_KEYS.some((k) => p.a[k] !== 3), 'atrybuty z obecnej skali');
  }
  assert.deepEqual(old.coaches.legia.a, g.coaches.legia.a, 'Ekstraklasa bez zmian');
  // Dzień rynku na starym zapisie działa
  assert.doesNotThrow(() => coachMarketDay(old, '2026-07-02'));
});

test('Sezon na pętli dni: deterministycznie, liczba zmian trenerów w granicach z badań, nikt nie rusza klubu gracza', () => {
  const run = (seed) => {
    const g = newGame(seed, 'slask-ii');
    processDay(g);
    while (g.date < '2027-06-03') {
      for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && x.home && x.away && (x.home === g.clubId || x.away === g.clubId))) { const r = new Rng(`g${f.id}`); applyResult(g, f, playQuick(g, f, r), r); }
      for (const m of g.inbox.filter((x) => !x.resolved && x.actions?.length && !x.optional)) { m.resolved = true; try { runDecision(g, m, m.actions[0].id); } catch { /* */ } }
      if (g.board) g.board.trust = 100;
      g.date = addDays(g.date, 1); processDay(g);
    }
    return g;
  };
  const g = run(21);
  const s = g.coachMarket.stats[2026];
  const all = (t) => s.inSeason[t] + s.summer[t];
  // Badania (docs/trenerzy-i-wlasciciele.md, rozdz. 2): Ekstraklasa ok. 8-11 zmian w trakcie sezonu i 3-5 latem,
  // 1 Liga podobnie, 2 Liga mniej. Jeden sezon ma duży rozrzut, więc granice szerokie.
  assert.ok(s.inSeason[1] >= 4 && s.inSeason[1] <= 17, `Ekstraklasa w sezonie: ${s.inSeason[1]}`);
  assert.ok(s.inSeason[2] >= 3 && s.inSeason[2] <= 17, `1 Liga w sezonie: ${s.inSeason[2]}`);
  assert.ok(s.inSeason[3] >= 2 && s.inSeason[3] <= 15, `2 Liga w sezonie: ${s.inSeason[3]}`);
  assert.ok(all(1) + all(2) + all(3) <= 45);
  assert.equal(g.coaches[g.clubId], undefined, 'klub gracza bez trenera AI');
  assert.ok(g.inbox.some((m) => m.category === 'media' && /trener/i.test(m.subject)), 'wiadomości o zmianach trenerów');
  for (const p of Object.values(g.coaches)) for (const k of COACH_KEYS) assert.ok(p.a[k] >= 1 && p.a[k] <= 20);
  const again = run(21);
  assert.deepEqual(again.coachLog, g.coachLog, 'deterministycznie');
  assert.doesNotThrow(() => summerReview(g, '2027-06-04'));
});
