// Zmiana właściciela klubu (src/career/ownership.js, docs/wlasciciele-i-dlugi.md): szansa odejścia według typu i cech,
// x1,15 po słabych sezonach, nowy właściciel (typy, zasobność, dopłata), przejęcie przez miasto (30-60 % dopłaty
// poprzednika), wycofanie miasta (dopłata i rezerwa 0), koniec sezonu z zapisem w grze, stare zapisy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { generateWorld } from '../src/world/worldGen.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { clubPlan, initClub, createFinance } from '../src/career/finance.js';
import { ownerSeasonMul } from '../src/career/ownerFunding.js';
import { ownerOf } from '../src/career/owners.js';
import { goalText } from '../src/career/board.js';
import {
  OWN, leaveChance, cityWithdrawChance, poorSeasons, drawNewOwner, ownershipRollover, ownerData, newOwnerBoard, leaveRisk, cityName,
} from '../src/career/ownership.js';
import { ownerBailouts, ensureDebt } from '../src/career/arrears.js';

const WORLD = generateWorld(3);
const neutral = (type) => ({ name: 'Test', type, cierpliwosc: 10, ambicja: 10, temperament: 10, media: 10, zasobnosc: 10 });
const gameWith = (id, owner, extra = {}) => ({ seed: 3, world: WORLD, owners: { [id]: owner }, ...extra });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('Szansa odejścia według typu (2/4/3 %, miasto i rezerwy osobno) i mnożnik ligi', () => {
  const id = 'legia'; // Ekstraklasa
  const m1 = OWN.tierMul[1];
  assert.ok(near(leaveChance(gameWith(id, neutral('miliarder')), id, { tier: 1, verdict: 'met' }).p, 0.02 * m1, 1e-4));
  assert.ok(near(leaveChance(gameWith(id, neutral('prywatny')), id, { tier: 1, verdict: 'met' }).p, 0.04 * m1, 1e-4));
  assert.ok(near(leaveChance(gameWith(id, neutral('spolka')), id, { tier: 1, verdict: 'met' }).p, 0.03 * m1, 1e-4));
  assert.equal(leaveChance(gameWith(id, neutral('miasto')), id, { tier: 1 }).p, 0, 'miasto: sprzedaż i wycofanie liczone osobno');
  assert.equal(leaveChance(gameWith(id, neutral('klub')), id, { tier: 1 }).p, 0, 'rezerwy: bez zmian właściciela');
  // Niższa liga: częściej (realia), ta sama baza
  assert.ok(leaveChance(gameWith(id, neutral('prywatny')), id, { tier: 2, verdict: 'met' }).p > leaveChance(gameWith(id, neutral('prywatny')), id, { tier: 1, verdict: 'met' }).p);
  assert.deepEqual(OWN.leave, { miliarder: 0.02, prywatny: 0.04, spolka: 0.03, miasto: 0.01, klub: 0 });
});

test('Cechy właściciela zmieniają szansę, zacisk 0,5-12 %, słabe 2-3 sezony x1,15 (względnie)', () => {
  const id = 'legia';
  const base = leaveChance(gameWith(id, neutral('prywatny')), id, { tier: 1, verdict: 'met' }).p;
  const imp = leaveChance(gameWith(id, { ...neutral('prywatny'), cierpliwosc: 5 }), id, { tier: 1, verdict: 'met' }).p;
  const poorOwner = leaveChance(gameWith(id, { ...neutral('prywatny'), zasobnosc: 5 }), id, { tier: 1, verdict: 'met' }).p;
  const rich = leaveChance(gameWith(id, { ...neutral('prywatny'), zasobnosc: 16, cierpliwosc: 16 }), id, { tier: 1, verdict: 'met' }).p;
  assert.ok(near(imp, base + 0.015, 1e-4) && near(poorOwner, base + 0.02, 1e-4) && near(rich, base - 0.02, 1e-4), `${base} ${imp} ${poorOwner} ${rich}`);
  const amb = { ...neutral('prywatny'), ambicja: 16 };
  assert.ok(leaveChance(gameWith(id, amb), id, { tier: 1, verdict: 'disaster' }).p > leaveChance(gameWith(id, amb), id, { tier: 1, verdict: 'met' }).p);
  const worst = { ...neutral('prywatny'), cierpliwosc: 2, ambicja: 18, temperament: 18, zasobnosc: 2 };
  assert.ok(leaveChance(gameWith(id, worst), id, { tier: 2, verdict: 'disaster', costly: true, tired: true }).p <= OWN.clamp[1] + 1e-9);
  const best = { ...neutral('miliarder'), cierpliwosc: 18, zasobnosc: 19 };
  assert.ok(leaveChance(gameWith(id, best), id, { tier: 1, verdict: 'met' }).p >= OWN.clamp[0] - 1e-9);
  // Słabe sezony: 2 z 3 poniżej oczekiwań, spadek albo 3 razy co najmniej 4 miejsca niżej
  assert.equal(poorSeasons([{ v: 'missed' }, { v: 'met' }, { v: 'disaster' }]), true);
  assert.equal(poorSeasons([{ v: 'met' }, { v: 'met', rel: true }]), true);
  assert.equal(poorSeasons([{ v: 'met', gap: 4 }, { v: 'missed', gap: 5 }, { v: 'met', gap: 4 }]), true);
  assert.equal(poorSeasons([{ v: 'missed' }, { v: 'met' }, { v: 'above' }]), false);
  const hist = { [id]: [{ v: 'missed' }, { v: 'disaster' }, { v: 'met' }] };
  const p = leaveChance(gameWith(id, neutral('prywatny'), { ownerHist: hist }), id, { tier: 1, verdict: 'met' });
  assert.ok(p.poor && near(p.p, base * OWN.poorMul, 1e-4), `${p.p} vs ${base * 1.15}`);
});

test('Nowy właściciel przez 2 pierwsze sezony nie sprzedaje klubu (miasto po przejęciu się nie wycofuje)', () => {
  const ov = { legia: { type: 'prywatny', name: 'Inwestor prywatny', doplata: 4, skarbiec: 2, since: 2027 }, jagiellonia: { type: 'miasto', name: 'Miasto Białystok', doplata: 4, skarbiec: 0, since: 2027, city: true } };
  const g = { seed: 3, world: WORLD, seasonYear: 2027, owners: { legia: neutral('prywatny') }, ownerOverride: ov };
  assert.equal(leaveChance(g, 'legia').p, 0);
  assert.equal(leaveChance(g, 'legia', { tier: 1, verdict: 'met', year: 2028 }).p, 0);
  assert.ok(leaveChance(g, 'legia', { tier: 1, verdict: 'met', year: 2029 }).p > 0);
  assert.equal(cityWithdrawChance(g, 'jagiellonia', { tier: 1, year: 2028 }), 0);
  assert.equal(cityWithdrawChance(g, 'jagiellonia', { tier: 1, year: 2029 }), 0.02);
});

test('Wycofanie miasta: 2-4 % według ligi, x2 po kryzysie, po spadku do III ligi i po 3 sezonach bez awansu przy celu awansu', () => {
  const g = { seed: 3, world: WORLD };
  assert.equal(cityWithdrawChance(g, 'jagiellonia', { tier: 1 }), 0.02);
  assert.equal(cityWithdrawChance(g, 'arka', { tier: 2 }), 0.03);
  assert.equal(cityWithdrawChance(g, 'gks-tychy', { tier: 3 }), 0.03);
  assert.equal(cityWithdrawChance(g, 'gks-tychy', { tier: 4 }), 0.04);
  assert.equal(cityWithdrawChance(g, 'arka', { tier: 2, crisis: true }), 0.06);
  assert.equal(cityWithdrawChance(g, 'gks-tychy', { tier: 4, relegatedToIII: true }), 0.08);
  const stuck = { seed: 3, world: WORLD, ownerHist: { arka: [{ pg: true }, { pg: true }, { pg: true }] } };
  assert.equal(cityWithdrawChance(stuck, 'arka', { tier: 2, crisis: false }), 0.06);
  assert.equal(leaveRisk({ seed: 3, world: WORLD }, 'jagiellonia').word, 'niskie');
});

test('Nowy właściciel: typy, zasobność, rezerwa i dopłata względem ligi i poprzednika; nazwy ogólne', () => {
  const stats = {};
  for (let i = 0; i < 400; i++) {
    for (const type of ['prywatny', 'miliarder', 'spolka']) {
      const rng = new Rng(`t:${i}:${type}`);
      const r = drawNewOwner({ seed: 3 }, 'radomiak', { tier: 1, pred: { type: 'prywatny', doplata: 0 }, year: 2027, type, rng });
      const [w0, w1] = OWN.wealth[type];
      assert.ok(r.profile.zasobnosc >= w0 && r.profile.zasobnosc <= w1, `${type} zasobność ${r.profile.zasobnosc}`);
      const [s0, s1] = OWN.reserve[type];
      assert.ok(r.ov.skarbiec >= r.ov.doplata * s0 - 0.02 && r.ov.skarbiec <= r.ov.doplata * s1 + 0.02, `${type} rezerwa ${r.ov.skarbiec} / ${r.ov.doplata}`);
      assert.ok(r.cover >= 0.4 && r.cover <= 1);
      assert.ok(['Inwestor prywatny', 'Zamożny inwestor', 'Spółka inwestycyjna'].includes(r.ov.name));
      assert.ok(r.injection === 0 ? r.om.mul === OWN.cautiousMul : r.injection >= r.ov.doplata * 1e6 * 0.25 - 1000 && r.injection <= r.ov.doplata * 1e6 * 0.6 + 1000);
      (stats[type] ??= []).push(r.ov.doplata);
    }
  }
  const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  assert.ok(Math.abs(med(stats.prywatny) / OWN.typical[1].prywatny - 1) < 0.15, `mediana prywatny ${med(stats.prywatny)}`);
  assert.ok(med(stats.miliarder) > med(stats.prywatny) * 2, 'bogaty inwestor dopłaca więcej');
  // Po odchodzącym bogatym właścicielu następca zwykle słabszy
  const after = []; const afterPriv = [];
  for (let i = 0; i < 300; i++) {
    after.push(drawNewOwner({ seed: 3 }, 'rakow', { tier: 1, pred: { type: 'miliarder', doplata: 30 }, year: 2027, type: 'miliarder', rng: new Rng(`b:${i}`) }).ov.doplata);
    afterPriv.push(drawNewOwner({ seed: 3 }, 'rakow', { tier: 1, pred: { type: 'prywatny', doplata: 30 }, year: 2027, type: 'miliarder', rng: new Rng(`b:${i}`) }).ov.doplata);
  }
  assert.ok(med(after) < med(afterPriv) && med(after) < 30, `po bogatym ${med(after)}, po prywatnym ${med(afterPriv)}`);
  assert.equal(cityName(clubById('gornik-zabrze')), 'Miasto Zabrze');
  assert.equal(cityName({ name: 'Cracovia' }), 'Samorząd miasta');
});

test('Przejęcie przez miasto: dopłata 30-60 % poprzednika (mediana ok. 45 %), minimum ligi, bez rezerwy', () => {
  const shares = [];
  for (let i = 0; i < 500; i++) {
    const r = drawNewOwner({ seed: 3 }, 'rakow', { tier: 1, pred: { type: 'miliarder', doplata: 30 }, year: 2027, type: 'miasto', rng: new Rng(`m:${i}`) });
    assert.equal(r.ov.type, 'miasto'); assert.equal(r.ov.skarbiec, 0); assert.equal(r.kind, 'city');
    shares.push(r.ov.doplata / 30);
  }
  shares.sort((a, b) => a - b);
  assert.ok(shares[0] >= 0.3 - 1e-6 && shares.at(-1) <= 0.6 + 1e-6, `${shares[0]} - ${shares.at(-1)}`);
  assert.ok(Math.abs(shares[250] - 0.45) < 0.03, `mediana ${shares[250]}`);
  // Mała dopłata poprzednika: minimum ligi (stadion i akademia)
  const low = drawNewOwner({ seed: 3 }, 'legia', { tier: 1, pred: { type: 'prywatny', doplata: 0 }, year: 2027, type: 'miasto', rng: new Rng('x') });
  assert.equal(low.ov.doplata, OWN.city.floor[1]);
  // Wzrost dopłaty miasta po przejęciu najwyżej 5 % na rok
  const g = { seed: 3, world: WORLD, owners: { rakow: { ...neutral('miasto'), zasobnosc: 15 } }, ownerOverride: { rakow: { type: 'miasto', name: 'Miasto Częstochowa', doplata: 13, skarbiec: 0, since: 2027, city: true } } };
  for (let y = 0; y < 30; y++) {
    const m = ownerSeasonMul({ ...g, ownerMood: {} }, 'rakow', { verdict: 'above', promoted: true, europe: true, year: 2028 + (y % 1) }).mul;
    assert.ok(m <= 1.05 + 1e-9, `rok po przejęciu: ${m}`);
  }
});

test('Wycofanie miasta: dopłata i rezerwa 0 w planie, bez dopłat właściciela do długów', () => {
  const c = clubById('jagiellonia');
  const ov = { type: 'miasto', name: 'Miasto Białystok', doplata: 0, skarbiec: 0, since: 2027, withdrawn: true };
  const plan = clubPlan(c, ov);
  assert.equal(plan.owner, 0); assert.equal(plan.skarbiec, 0);
  assert.ok(clubPlan(c).owner > 0, 'bez zmiany: dopłata z danych');
  const fin = initClub(WORLD, c, { balance: -2e6, date: '2027-07-01', owner: ov, noTopUp: true });
  assert.equal(fin.plan.owner, 0);
  const g = { seed: 3, world: WORLD, clubId: 'legia', finance: { clubs: { jagiellonia: fin } }, ownerOverride: { jagiellonia: ov } };
  ownerBailouts(g, '2027-08-01');
  assert.ok(fin.balance < 0, 'miasto po wycofaniu nie pokrywa długów');
});

test('Koniec sezonu: zmiana właściciela zapisana w grze (finanse, profil, historia), spłata długu, zaufanie 50', () => {
  const save = { ...OWN.leave };
  OWN.leave.prywatny = 1; OWN.leave.miliarder = 1; OWN.leave.spolka = 1; // każdy prywatny odchodzi
  try {
    const g = { seed: 3, world: WORLD, clubId: 'legia' };
    g.finance = createFinance(WORLD);
    g.finance.clubs.legia.balance = -5e6;
    const tables = { 1: CLUBS_PL.filter((c) => c.tier === 1).map((c) => c.id), 2: CLUBS_PL.filter((c) => c.tier === 2).map((c) => c.id), 3: CLUBS_PL.filter((c) => c.tier === 3).map((c) => c.id) };
    const ch = ownershipRollover(g, { res: { tables, groupTables: {} }, oldYear: 2026, year: 2027, date: '2027-07-01' });
    assert.ok(ch.legia && ch.rakow && !ch.jagiellonia, 'prywatni i bogaci odchodzą, miasto zostaje');
    assert.equal(g.ownerOverride.legia.since, 2027);
    assert.equal(ownerOf(g, 'legia').name, g.ownerOverride.legia.name);
    assert.ok(g.ownerHist.legia.length === 1 && g.ownerLog.length >= 2);
    const fresh = initClub(WORLD, clubById('legia'), { balance: -5e6, date: '2027-07-01', owner: g.ownerOverride.legia, cover: ch.legia.cover, injection: ch.legia.injection, ownerMul: ch.legia.om, noTopUp: true });
    assert.equal(fresh.plan.ownerName, g.ownerOverride.legia.name);
    assert.ok(fresh.balance > -5e6 * (1 - ch.legia.cover) - 1e4, 'nowy właściciel spłaca dług przy przejęciu');
    const B = { trust: 20, goal: { target: 6, text: 'x' } };
    newOwnerBoard(g, B, clubById('legia'), ch.legia, 2027, goalText);
    assert.equal(B.trust, 50);
    // Determinizm: te same decyzje przy tym samym ziarnie
    const g2 = { seed: 3, world: WORLD, clubId: 'legia', finance: createFinance(WORLD) };
    const ch2 = ownershipRollover(g2, { res: { tables, groupTables: {} }, oldYear: 2026, year: 2027, date: '2027-07-01' });
    assert.deepEqual(Object.keys(ch2).sort(), Object.keys(ch).sort());
  } finally { Object.assign(OWN.leave, save); }
});

test('Stary zapis bez nowych pól: właściciel, plan i dopłaty jak dotąd', () => {
  const g = { seed: 3, world: WORLD };
  const c = clubById('widzew');
  assert.deepEqual(clubPlan(c, g.ownerOverride?.[c.id]), clubPlan(c));
  const d = ownerData(g, 'widzew');
  assert.equal(d.type, 'miliarder'); assert.ok(d.doplata > 0);
  ensureDebt(g);
  assert.deepEqual(g.debt.clubs, {});
});
