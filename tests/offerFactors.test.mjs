// Klocki decyzji zawodnika (src/career/offerFactors.js) i ukryty atrybut Negocjacje klubów AI
// (src/career/clubNegotiation.js): regresja dawnego wzoru, nowe klocki, szum wyboru, rozkład i zmiany atrybutu,
// licytacja w ciemno bez znajomości kwot, kara licytacji w aiBuy. docs/negocjacje.md, rozdz. 15 i 16.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { buildContract, normalizeOffer, aiNegotiate, expectedRole, ROLE_RANK } from '../src/career/negotiation.js';
import { personalityOf, computeMindset, elementPrefs } from '../src/career/personality.js';
import { scoreOffer, OFFER_FACTORS, LEGACY_FACTORS, abroadWish, homeRegionOf, clubStability } from '../src/career/offerFactors.js';
import { offerUtility } from '../src/career/preContracts.js';
import { THINK, makeProposal, blindRaise, improveUserProposal, canImprove, earliestOf, proposalsFor } from '../src/career/proposals.js';
import { clubNegotiation, negLevers, negMean, negSeason, contestPenalty, NEG } from '../src/career/clubNegotiation.js';
import { mailRelevant } from '../src/core/mailFilter.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { Rng, clamp } from '../src/core/rng.js';
import { handleTransferAction, renderTransfers } from '../src/ui/transfersView.js';
import { applySeasonState } from '../src/season/rollover.js';
import '../src/season/dailySystems.js';

function newGame(clubId = 'widzew', seed = 81, date = '2026-07-01') {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  g.date = date;
  return g;
}
const contractFor = (g, wage, years = 2) => buildContract(normalizeOffer({ wage, years, role: 'rotacja' }), g.date);
const freeAgent = (g, i = 0) => g.market.free.map((id) => g.world.players[id]).filter((p) => p && !proposalsFor(g, p.id).length)[i];

// Dawny wzór offerUtility (v1.21.1 Beta) skopiowany bez zmian: klocki legacy muszą dawać identyczny wynik.
const ambW = (t) => clamp(1 + 0.05 * (t.ambition - 10), 0.3, 1.7);
function oldUtility(p, o, { trust = 50, noise = 0 } = {}) {
  const { traits: t } = personalityOf(p);
  const m = computeMindset(p, t, { clubForeign: !!o.foreign });
  const pr = elementPrefs(t, m.key, p);
  const wageRef = Math.max(500, p.contract?.wage ?? p.askWage ?? 1000);
  const role = expectedRole(p, { L: o.L, prestige: o.prestige ?? 5, tier: o.tier ?? 1, rep: o.rep }, t);
  const u = pr.moneyW * Math.log(Math.max(100, o.wage) / wageRef)
    + 0.03 * (o.rep - (p.rep ?? 30)) * ambW(t)
    + 0.25 * pr.roleW * ((ROLE_RANK[role] ?? 2) - 2)
    + (o.europe ? 0.3 : 0)
    + (o.foreign ? 0.5 * abroadWish(p) : 0)
    + (o.own ? 0.04 * (t.loyalty - 10) + 0.004 * (trust - 50) : 0);
  return u + noise;
}

test('Klocki: dawne składniki dają identyczny wynik jak stary wzór (tysiące zawodników i ofert)', () => {
  const W = generateWorld(17);
  const players = Object.values(W.players).filter((_, i) => i % 3 === 0);
  const rng = new Rng('regresja-klockow');
  let n = 0;
  for (const p of players) {
    for (let k = 0; k < 4; k++) {
      const c = rng.pick(CLUBS_PL);
      const o = { wage: Math.round((p.contract?.wage ?? 2000) * (0.6 + rng.next())), rep: 20 + rng.int(0, 70), L: c.L, prestige: c.prestige, tier: c.tier,
        europe: rng.chance(0.2), foreign: rng.chance(0.15), own: rng.chance(0.2) };
      const trust = rng.int(0, 100);
      const noise = rng.gauss(0, 0.1);
      assert.equal(scoreOffer(p, o, { trust, only: LEGACY_FACTORS }).u + noise, oldUtility(p, o, { trust, noise }));
      // Bez danych nowych klocków (region, stabilność, pierwszeństwo) offerUtility też bez zmian
      assert.equal(offerUtility(p, o, { trust, noise }), oldUtility(p, o, { trust, noise }));
      n++;
    }
  }
  assert.ok(n > 2000);
});

test('Klocki: nowe czynniki najwyżej ±0,3, zawodnik bez klubu i kontraktu bez błędów', () => {
  const W = generateWorld(18);
  const rng = new Rng('klocki-zakres');
  const ps = Object.values(W.players).slice(0, 600);
  for (const p of ps) {
    const c = rng.pick(CLUBS_PL);
    const o = { wage: 3000, rep: 50, L: c.L, prestige: c.prestige, tier: c.tier, europe: false, foreign: false, region: c.region, stab: rng.next() * 4 - 2, first: rng.chance(0.5) };
    for (const part of scoreOffer(p, o).parts) if (part.id !== 'money' && !OFFER_FACTORS.find((f) => f.id === part.id).legacy) assert.ok(Math.abs(part.part) <= 0.3 + 1e-12, `${part.id} ${part.part}`);
  }
  const free = { id: 'x1', name: 'Wolny', age: 27, ovr: 10, rep: 30, pos: 'ŚP', clubId: null, contract: null, nat: 'POL' };
  const r = scoreOffer(free, { wage: 2000, rep: 40, L: 10, tier: 2, europe: false, foreign: false, region: 'lodz', stab: 0.5, first: true });
  assert.ok(Number.isFinite(r.u));
  assert.equal(r.parts.find((x) => x.id === 'home').part, 0); // brak regionu rodzinnego
  assert.equal(homeRegionOf(free), null);
});

test('Klocki: miasto i rodzina, stabilność klubu, pierwszeństwo oferty', () => {
  const W = generateWorld(19);
  const p = Object.values(W.players).find((x) => x.clubId && x.nat === 'POL' && personalityOf(x).traits.homeTies >= 15 && personalityOf(x).traits.security >= 14 && personalityOf(x).traits.patience >= 12);
  assert.ok(p, 'zawodnik z przywiązaniem, lękiem przed niepewnością i cierpliwością');
  const home = homeRegionOf(p);
  assert.equal(home, clubById(p.clubId).region);
  const base = { wage: p.contract.wage, rep: 50, L: 11, prestige: 5, tier: 1, europe: false, foreign: false };
  const u0 = offerUtility(p, base);
  const t = personalityOf(p).traits;
  // Region rodzinny: + 0,02 x (przywiązanie - 10) (+0,1 przy nastawieniu „Chce wrócić do domu”)
  const dHome = offerUtility(p, { ...base, region: home }) - u0;
  assert.ok(dHome >= 0.02 * (t.homeTies - 10) - 1e-9 && dHome <= 0.3 + 1e-9, `dom ${dHome}`);
  assert.ok(Math.abs(offerUtility(p, { ...base, region: 'nie-ma-takiego' }) - u0) < 1e-12);
  // Stabilność: pewny klub lepszy od niepewnego
  assert.ok(offerUtility(p, { ...base, stab: 1 }) > offerUtility(p, { ...base, stab: -1 }));
  assert.ok(offerUtility(p, { ...base, stab: 1 }) - offerUtility(p, { ...base, stab: -1 }) <= 0.6 + 1e-9);
  // Pierwszeństwo: +0,05 x (1 + 0,1 (cierpliwość - 10)), najwyżej 0,1
  const dFirst = offerUtility(p, { ...base, first: true }) - u0;
  assert.ok(Math.abs(dFirst - 0.05 * clamp(1 + 0.1 * (t.patience - 10), 0, 2)) < 1e-9);
  // Najwcześniejsza z kilku propozycji (data, potem kolejność złożenia)
  const a = { id: 'n12-a', date: '2026-07-05' }; const b = { id: 'n9-a', date: '2026-07-05' }; const c = { id: 'n3-a', date: '2026-07-06' };
  assert.equal(earliestOf([a, b, c]), b);
  assert.equal(earliestOf([a]), null);
});

test('Stabilność klubu: zapas gotówki i zmiany trenera, brak danych = 0', () => {
  const g = newGame('widzew', 82);
  assert.equal(clubStability(g, 'nie-ma'), 0);
  const s0 = clubStability(g, 'lech');
  assert.ok(s0 >= -1 && s0 <= 1);
  g.coachLog = [{ date: '2026-06-20', club: 'lech', why: 'wyniki' }, ...(g.coachLog ?? [])];
  assert.ok(clubStability(g, 'lech') < s0 || s0 === -1); // zmiana trenera obniża stabilność
});

test('Szum wyboru: przy 11 000 zł wobec 10 000 zł (reszta równa) lepsza oferta wygrywa ok. 73 %', () => {
  const W = generateWorld(20);
  const ps = Object.values(W.players).filter((p) => p.clubId).slice(0, 400);
  const rng = new Rng('szum-wyboru');
  let wins = 0; let n = 0;
  for (const p of ps) {
    const o = { wage: 10000, rep: 50, L: 11, prestige: 5, tier: 1, europe: false, foreign: false };
    const base = offerUtility(p, o); const better = offerUtility(p, { ...o, wage: 11000 });
    for (let i = 0; i < 40; i++) { if (better + rng.gauss(0, THINK.noise) > base + rng.gauss(0, THINK.noise)) wins++; n++; }
  }
  const share = wins / n;
  assert.ok(share > 0.7 && share < 0.76, `lepsza wygrywa ${share}`);
});

test('Atrybut Negocjacje: rozkład wg ligi (średnia, rozrzut, 1-20) i determinizm', () => {
  const byTier = { 1: [], 2: [], 3: [], 4: [] };
  const want = { 1: [], 2: [], 3: [], 4: [] };
  for (let s = 1; s <= 120; s++) {
    const g = { seed: s, seasonYear: 2026 };
    for (const c of CLUBS_PL) {
      if (c.tier > 4) continue;
      const n = clubNegotiation(g, c.id);
      assert.ok(Number.isInteger(n) && n >= 1 && n <= 20);
      byTier[c.tier].push(n); want[c.tier].push(negMean(c.id));
    }
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (const t of [1, 2, 3, 4]) {
    assert.ok(Math.abs(mean(byTier[t]) - mean(want[t])) < 0.3, `poziom ${t}: ${mean(byTier[t])} wobec ${mean(want[t])}`);
    const sd = Math.sqrt(mean(byTier[t].map((x) => (x - mean(byTier[t])) ** 2)));
    assert.ok(sd > 2.4 && sd < 3.4, `rozrzut ${sd}`);
  }
  assert.ok(mean(byTier[1]) > mean(byTier[2]) && mean(byTier[2]) > mean(byTier[3]) && mean(byTier[3]) > mean(byTier[4]));
  // Te same ziarno, klub i sezon: ta sama wartość; zapis w game.clubNeg
  const a = { seed: 7, seasonYear: 2026 }; const b = { seed: 7, seasonYear: 2026 };
  assert.equal(clubNegotiation(a, 'lech'), clubNegotiation(b, 'lech'));
  assert.equal(a.clubNeg.lech.n, clubNegotiation(a, 'lech'));
});

test('Atrybut Negocjacje: 1 lipca powrót do średniej i zmiany dyrektorów (najwyżej 3 na ligę), list tylko z ligi gracza', () => {
  const g = newGame('widzew', 83);
  for (const c of CLUBS_PL) if (g.world.clubs[c.id]) clubNegotiation(g, c.id);
  const before = Object.fromEntries(Object.entries(g.clubNeg).map(([k, v]) => [k, { ...v }]));
  const twin = JSON.parse(JSON.stringify({ seed: g.seed, clubNeg: g.clubNeg, coachLog: g.coachLog ?? [] }));
  const msgs = negSeason(g, 2027, { relegated: new Set(['radomiak']) });
  const twinGame = { ...twin, world: g.world, clubId: g.clubId };
  negSeason(twinGame, 2027, { relegated: new Set(['radomiak']) });
  assert.deepEqual(twinGame.clubNeg, g.clubNeg); // determinizm
  let changed = 0; let dirs = 0; const perLeague = {};
  for (const [id, e] of Object.entries(g.clubNeg)) {
    assert.ok(e.n >= 1 && e.n <= 20 && e.y === 2027);
    if (e.n !== before[id].n) changed++;
    if (e.d > before[id].d) { dirs++; const k = `${clubById(id).tier}:${clubById(id).tier === 4 ? clubById(id).group : ''}`; perLeague[k] = (perLeague[k] ?? 0) + 1; }
  }
  assert.ok(changed > 10, `zmiany ${changed}`);
  assert.ok(dirs >= 1 && Object.values(perLeague).every((x) => x <= NEG.maxChanges), JSON.stringify(perLeague));
  // Drugi raz w tym samym sezonie bez zmian
  const snap = JSON.stringify(g.clubNeg);
  negSeason(g, 2027);
  assert.equal(JSON.stringify(g.clubNeg), snap);
  // Listy bez wartości atrybutu; filtr poczty przepuszcza tylko ligę gracza (Widzew: Ekstraklasa)
  for (const m of msgs) {
    assert.ok(!/\d/.test(m.body.replaceAll(clubById(m.key.split(":")[1]).name, "")), m.body); // bez liczb (wartości atrybutu)
    const id = m.key.split(':')[1];
    assert.equal(mailRelevant(g, m), clubById(id).tier === 1 && id !== g.clubId);
  }
});

test('Stary zapis bez game.clubNeg: leniwe losowanie, dzień gry działa', () => {
  const g = newGame('widzew', 84, '2026-07-14');
  delete g.clubNeg;
  processDay(g);
  const n = clubNegotiation(g, 'rakow');
  assert.ok(n >= 1 && n <= 20);
  assert.equal(g.clubNeg.rakow.n, n);
});

test('Dźwignie rozmów: N = 10 blisko dawnych stałych, lepszy negocjator otwiera wyżej i ma wyższy limit przebicia', () => {
  const l10 = negLevers(10); const l1 = negLevers(1); const l20 = negLevers(20);
  assert.ok(Math.abs(l10.open - 0.97) < 0.01 && Math.abs(l10.raise - 1.1) < 0.005);
  assert.ok(l1.open < l10.open && l10.open < l20.open);
  assert.ok(l1.cap >= 1 && l1.cap < 1.01 && l20.cap > l10.cap && l20.cap <= 1.1 + 1e-9);
  const legacy = negLevers(null);
  assert.equal(legacy.open, 0.97); assert.equal(legacy.raise, 1.1);
  // Budżet twardym limitem: pensja z rozmów nigdy ponad budget.wage
  const g = newGame('widzew', 85);
  const p = freeAgent(g, 3);
  for (const neg of [1, 10, 20]) {
    const r = aiNegotiate({ kind: 'sign', player: { ...p, relations: {} }, club: clubById('lech'), date: g.date, rng: new Rng(`t:${neg}`), budget: { wage: 2500 }, neg });
    if (r.contract) assert.ok(r.contract.wage <= 2500);
    if (r.result !== 'refused') assert.ok(r.demand > 0);
  }
});

test('Licytacja w ciemno: klub AI poprawia propozycję raz, bez znajomości cudzej kwoty, w limicie budżetu', () => {
  const run = (rivalWage) => {
    const g = newGame('widzew', 86, '2026-07-10');
    const p = freeAgent(g, 2);
    const x = makeProposal(g, { playerId: p.id, to: 'lech', contract: contractFor(g, 4000), kind: 'free', maxWage: 4300, demand: 4100 });
    makeProposal(g, { playerId: p.id, to: 'rakow', contract: contractFor(g, rivalWage), kind: 'free', maxWage: 99999 });
    return x;
  };
  const a = run(4100); const b = run(9000);
  assert.equal(a.contract.wage, b.contract.wage); // decyzja nie zależy od kwoty rywala
  assert.equal(a.bumpTried, true);
  assert.ok(a.contract.wage <= 4300 && a.contract.wage <= Math.floor(negLevers(clubNegotiation({ seed: 86, seasonYear: 2026 }, 'lech')).cap * 4100 / 100) * 100 + 100);
  // Druga cudza propozycja nie daje kolejnej poprawki
  const g = newGame('widzew', 87, '2026-07-10');
  const q = freeAgent(g, 4);
  const y = makeProposal(g, { playerId: q.id, to: 'lech', contract: contractFor(g, 4000), kind: 'free', maxWage: 99999, demand: 4000 });
  makeProposal(g, { playerId: q.id, to: 'rakow', contract: contractFor(g, 4000), kind: 'free' });
  const w1 = y.contract.wage;
  makeProposal(g, { playerId: q.id, to: 'jagiellonia', contract: contractFor(g, 4000), kind: 'free' });
  assert.equal(y.contract.wage, w1);
  assert.equal(blindRaise(g, y), false);
  // Wiele prób: poprawka 4-12 %, nigdy ponad limit atrybutu
  let bumps = 0;
  for (let s = 0; s < 60; s++) {
    const z = { id: `n${s}-x`, pid: q.id, to: 'lech', user: false, status: 'open', contract: { wage: 4000, years: 2 }, demand: 4400, maxWage: 99999 };
    if (blindRaise(g, z, `2026-07-${String(10 + (s % 20)).padStart(2, '0')}`)) {
      bumps++;
      assert.ok(z.contract.wage >= 4080 && z.contract.wage <= 4480 && z.contract.wage <= negLevers(clubNegotiation(g, 'lech')).cap * 4400);
    }
  }
  assert.ok(bumps > 0);
});

test('Gracz: jedna poprawka propozycji po cudzej propozycji (list od agenta, +4/8/12 %, limity jak w rozmowach)', () => {
  const g = newGame('widzew', 88, '2026-07-10');
  const p = freeAgent(g, 5);
  const x = makeProposal(g, { playerId: p.id, to: 'widzew', contract: contractFor(g, 1500), kind: 'free' });
  assert.equal(canImprove(g, x), false);
  assert.equal(improveUserProposal(g, x.id, 8).ok, false); // bez cudzej propozycji nie ma poprawki
  makeProposal(g, { playerId: p.id, to: 'lech', contract: contractFor(g, 1600), kind: 'free' });
  assert.ok(g.inbox.some((m) => m.subject === `${p.name} rozważa też inną propozycję` && !/1\s?600/.test(m.body) && !m.body.includes('Lech')));
  assert.equal(canImprove(g, x), true);
  // Widok: przyciski poprawki w W toku
  const html = renderTransfers(g, { tfTab: 'wtoku' });
  assert.ok(html.includes('data-act="tf-prop-raise"'));
  assert.equal(improveUserProposal(g, x.id, 5).ok, false);
  const r = handleTransferAction(g, 'tf-prop-raise', { d: x.id, k: '8' });
  assert.ok(/Poprawiono/.test(r.ui.tfMsg), r.ui.tfMsg);
  assert.equal(x.contract.wage, 1600); // 1500 x 1,08 = 1620, zaokrąglenie do 50 zł
  assert.equal(improveUserProposal(g, x.id, 4).ok, false); // tylko raz
  // Limit budżetu płac: poprawka ponad wolne miejsce odrzucona
  const q = freeAgent(g, 6);
  const big = makeProposal(g, { playerId: q.id, to: 'widzew', contract: contractFor(g, 9e6), kind: 'free' });
  makeProposal(g, { playerId: q.id, to: 'lech', contract: contractFor(g, 1000), kind: 'free' });
  assert.equal(improveUserProposal(g, big.id, 4).ok, false);
});

test('Kara licytacji w aiBuy: losowa, deterministyczna, średnio 0,8 OVR przy N = 10, mniejsza u lepszego negocjatora', () => {
  const g = { seed: 90, seasonYear: 2026, clubNeg: {} };
  const avg = (n) => {
    g.clubNeg.lech = { n, y: 2026, d: 1 };
    let s = 0;
    for (let i = 0; i < 2000; i++) { const v = contestPenalty(g, `p${i}`, 'lech', '2026-07-20'); assert.ok(v >= 0); s += v; }
    return s / 2000;
  };
  const a10 = avg(10); const a20 = avg(20); const a1 = avg(1);
  assert.ok(a10 > 0.75 && a10 < 0.95, `N=10: ${a10}`); // obcięcie w zerze podnosi średnią nieco ponad 0,8
  assert.ok(a20 < a10 && a10 < a1);
  assert.equal(contestPenalty(g, 'p1', 'lech', '2026-07-20'), contestPenalty(g, 'p1', 'lech', '2026-07-20'));
});
