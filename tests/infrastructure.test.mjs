// Infrastruktura klubów: stadion, baza treningowa, akademia (src/career/infrastructure.js, src/ui/infraView.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { createFinance, financeDay, FIN_LABELS } from '../src/career/finance.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import {
  LEVELS, TRACKS, AI_MAX, INFRA, infraOf, ensureInfra, startLevels, trainingMods, academyMods, developmentMods,
  quote, startProject, infraMonth, infraSeason, licenceNeeds, ownerShare, capacityOf, applyPlan, upkeepAt,
} from '../src/career/infrastructure.js';
import { renderClubHub, handleClubAction } from '../src/ui/klubView.js';
import '../src/season/dailySystems.js';

function newGame(clubId = 'widzew', seed = 21) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  return g;
}
const G = newGame();
const fresh = () => {
  const g = structuredClone({ ...G, world: null });
  g.world = G.world; // świat tylko do odczytu w tych testach
  return g;
};
const clubOf = (id) => CLUBS_PL.find((c) => c.id === id);

test('Dzień startu: plan sezonu i efekty bez zmian względem modelu finansów sprzed infrastruktury', () => {
  const ref = createFinance(G.world);
  for (const [id, c] of Object.entries(G.finance.clubs)) {
    const r = ref.clubs[id].plan; const p = c.plan;
    for (const k of ['cap', 'att', 'perFan', 'tickets', 'domestic', 'ops', 'net']) assert.equal(p[k], r[k], `${id} ${k}`);
    assert.equal(p.upkeep, p.upkeepBase, `${id}: utrzymanie zastępuje część kosztów klubu`);
    assert.ok(p.upkeepBase <= p.ops * INFRA.UPKEEP_CREDIT_MAX + 1000, `${id}: kredyt najwyżej połowa kosztów`);
    assert.deepEqual(trainingMods(G, id), { dev: 1, inj: 1, rec: 0 }, id);
    assert.deepEqual(academyMods(G, id), { extra: 0, offset: 0, talent: 0, youth: 1 }, id);
  }
  // Miesięczne koszty klubu i utrzymanie razem równe dawnym kosztom klubu (z dokładnością zaokrągleń)
  const c = G.finance.clubs.legia; const m = c.ledger['2026-07'].out;
  assert.ok(Math.abs(m.ops + m.upkeep - Math.round(c.plan.ops / 12)) <= 2, 'ops + upkeep = ops / 12');
});

test('Poziomy startowe: czołówka, Ekstraklasa, niższe ligi; wszyscy spełniają licencję na starcie', () => {
  const L = (id) => { const x = infraOf(G, id); return [x.stadium, x.training, x.academy]; };
  assert.deepEqual(L('legia'), [7, 8, 7]);
  assert.deepEqual(L('lech'), [7, 7, 7]);
  assert.equal(L('rakow')[0], 4); assert.equal(L('rakow')[1], 6);
  assert.equal(L('gornik-zabrze')[0], 6); assert.equal(L('korona')[0], 5);
  assert.equal(L('zaglebie-lubin')[2], 6); assert.equal(L('pogon-szczecin')[2], 6);
  for (const c of CLUBS_PL.filter((x) => x.tier <= 3)) {
    const s = startLevels(c);
    for (const k of TRACKS) assert.ok(s[k] >= 2 && s[k] <= 8, `${c.id} ${k} ${s[k]}`);
    if (c.tier === 2) { assert.ok(s.stadium >= 3 && s.stadium <= 6, c.id); assert.ok(s.academy >= 3 && s.academy <= 4, c.id); }
    if (c.tier === 3) { assert.ok(s.stadium >= 2 && s.stadium <= 3, c.id); assert.ok(s.academy <= 3, c.id); }
    assert.deepEqual(licenceNeeds(G, c.id), [], `${c.id}: licencja na starcie`);
  }
});

test('Skala poziomów: 10 poziomów na tor, koszty i utrzymanie rosną, stadion 10 = 100 tys. miejsc i x2 przychodu', () => {
  for (const k of TRACKS) {
    assert.equal(LEVELS[k].length, 10);
    for (let i = 2; i < 10; i++) { assert.ok(LEVELS[k][i].cost > LEVELS[k][i - 1].cost, `${k} ${i}`); assert.ok(LEVELS[k][i].upkeep >= LEVELS[k][i - 1].upkeep); }
  }
  assert.equal(LEVELS.stadium[9].max, 100000); assert.equal(LEVELS.stadium[9].M, 2); assert.equal(LEVELS.stadium[5].M, 1);
  assert.equal(LEVELS.academy[5].name, 'Akademia z certyfikatem złotym');
  assert.ok(!JSON.stringify(LEVELS).toLowerCase().includes('platyn'), 'PZPN nie ma certyfikatu platynowego');
});

test('Efekty względem startu: baza treningowa, akademia, rozwój', () => {
  const g = fresh(); const I = infraOf(g, 'korona');
  const t0 = I.training; I.training = t0 + 2;
  const t = trainingMods(g, 'korona');
  assert.ok(Math.abs(t.dev - (0.94 + 0.018 * (t0 + 1)) / (0.94 + 0.018 * (t0 - 1))) < 1e-9);
  assert.ok(Math.abs(t.inj - (1.1 - 0.02 * (t0 + 2)) / (1.1 - 0.02 * t0)) < 1e-9);
  assert.ok(Math.abs(t.rec - 0.8) < 1e-9);
  const a0 = I.academy; I.academy = a0 + 3;
  const a = academyMods(g, 'korona');
  assert.equal(a.extra, (2 + Math.round((a0 + 3) / 3)) - (2 + Math.round(a0 / 3)));
  assert.ok(Math.abs(a.offset - 0.36) < 1e-9 && Math.abs(a.talent - 0.06) < 1e-9 && a.youth > 1);
  assert.deepEqual(developmentMods(g, 'korona'), { dev: t.dev, youth: a.youth });
});

test('Finansowanie: miasto płaci za stadion miejski, bogaty właściciel do połowy', () => {
  assert.equal(ownerShare(G, 'korona', 'stadium', 'level', 5), 1);
  assert.equal(ownerShare(G, 'korona', 'stadium', 'level', 6), 0.85);
  assert.equal(ownerShare(G, 'korona', 'stadium', 'level', 8), 0.3);
  assert.equal(ownerShare(G, 'korona', 'training', 'level', 5), 0.5);
  assert.equal(ownerShare(G, 'korona', 'academy', 'level', 5), 0);
  assert.equal(ownerShare(G, 'widzew', 'stadium', 'level', 7), 0.5);
  assert.equal(ownerShare(G, 'legia', 'training', 'level', 9), 0);
});

test('Projekt gracza: 20 % na start, raty co miesiąc, po budowie poziom +1 i nowe efekty', () => {
  const g = fresh(); const id = g.clubId; const I = infraOf(g, id); const c = g.finance.clubs[id];
  c.balance = 200e6;
  const L0 = I.academy;
  const q = quote(g, id, 'academy');
  assert.ok(q.ok); assert.equal(q.to, L0 + 1); assert.equal(q.cost, LEVELS.academy[L0].cost * 1e6);
  const bal = c.balance;
  const r = startProject(g, id, 'academy');
  assert.ok(r.ok, r.text);
  assert.equal(bal - c.balance, q.upfront);
  assert.equal(c.ledger['2026-07'].out.infra, q.upfront);
  assert.equal(quote(g, id, 'academy').ok, false, 'jeden projekt na tor');
  const months = q.months; let date = '2026-08-01'; const msgs = [];
  for (let i = 0; i < months; i++) {
    msgs.push(...infraMonth(g, date));
    const d = new Date(`${date}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); date = d.toISOString().slice(0, 10);
  }
  assert.equal(I.academy, L0 + 1);
  assert.equal(I.proj.academy, undefined);
  const infraPaid = Object.values(c.ledger).reduce((s, m) => s + (m.out.infra ?? 0), 0);
  assert.ok(Math.abs(infraPaid - q.club) <= 1000, `klub zapłacił swoją część: ${infraPaid} z ${q.club}`);
  assert.ok(msgs.some((m) => m.category === 'club' && /Akademia: poziom/.test(m.subject)));
  assert.ok(academyMods(g, id).youth > 1);
  assert.equal(c.plan.upkeep, c.plan.upkeepBase + (LEVELS.academy[L0].upkeep - LEVELS.academy[L0 - 1].upkeep) * 1e6);
});

test('Stadion: wyższy standard podnosi przychód z widza, budowa obniża pojemność, trybuny tylko przy pełnym stadionie', () => {
  const g = fresh(); const id = 'korona'; g.clubId = id; const I = infraOf(g, id); const c = g.finance.clubs[id];
  c.balance = 100e6;
  const p0 = { ...c.plan };
  assert.ok(startProject(g, id, 'stadium').ok);
  assert.equal(c.plan.cap, Math.round(p0.cap * 0.8), 'budowa poziomu 6: -20 % miejsc');
  assert.ok(c.plan.tickets < p0.tickets);
  I.proj.stadium.m = I.proj.stadium.months - 1;
  infraMonth(g, '2026-08-01');
  assert.equal(I.stadium, 6);
  assert.equal(c.plan.cap, p0.cap);
  assert.equal(c.plan.perFan, Math.round(p0.perFan * 1.0 / 0.9));
  // Trybuny: zapełnienie poniżej 85 % blokuje, powyżej pozwala (najwyżej +50 % i do maksimum poziomu)
  I.fill = 0.6; I.fillN = 0;
  assert.equal(quote(g, id, 'stadium', { seats: 2000 }).ok, false);
  I.fill = 0.95;
  assert.equal(quote(g, id, 'stadium', { seats: 20000 }).ok, false, 'ponad +50 %');
  const q = quote(g, id, 'stadium', { seats: 5000 });
  assert.ok(q.ok, q.why);
  assert.equal(q.cost, 5000 * INFRA.SEAT_COST * 1.0);
  assert.ok(startProject(g, id, 'stadium', { seats: 5000 }).ok);
  assert.equal(c.plan.cap, Math.round(p0.cap * 0.75));
  I.proj.stadium.m = I.proj.stadium.months - 1;
  infraMonth(g, '2026-09-01');
  assert.equal(capacityOf(g, id).full, p0.cap + 5000);
  assert.equal(c.plan.cap, p0.cap + 5000);
  assert.ok(c.plan.att > p0.att, 'część nowych miejsc zapełnia popyt');
});

test('Licencja: beniaminek ma sezon na inwestycję, potem kara 1 mln zł i ostrzeżenie', () => {
  const g = fresh(); const id = g.clubId; const I = infraOf(g, id);
  I.training = 2;
  assert.equal(licenceNeeds(g, id).length, 1);
  const m1 = infraSeason(g, '2027-07-01');
  assert.ok(m1.some((m) => /Licencja/.test(m.subject)));
  const c = g.finance.clubs[id]; const b = c.balance;
  const m2 = infraSeason(g, '2028-07-01');
  assert.ok(m2.some((m) => /Kara licencyjna/.test(m.subject)));
  assert.equal(b - c.balance, INFRA.LICENCE_FINE);
  assert.equal(c.ledger['2028-07'].out.fines, INFRA.LICENCE_FINE);
  // Z inwestycją w toku nie ma kary
  c.balance = 50e6;
  assert.ok(startProject(g, id, 'training').ok);
  const b2 = c.balance;
  infraSeason(g, '2029-07-01');
  assert.equal(c.balance, b2);
});

test('Kluby AI: inwestują z nadwyżki w kolejności licencja, baza, akademia, stadion; przez 10 sezonów nikt ponad poziom 8', () => {
  const g = fresh();
  let date = '2027-07-01';
  for (let season = 0; season < 10; season++) {
    const y = 2027 + season;
    date = `${y}-07-01`;
    // Hojna nadwyżka: 20 % rocznych przychodów krajowych jako „inwestycje” klubu AI (finance.js, invest)
    for (const [id, c] of Object.entries(g.finance.clubs)) {
      if (id === g.clubId) continue;
      const m = (c.ledger[date.slice(0, 7)] ??= { in: {}, out: {} });
      m.out.invest = Math.round(c.plan.domestic * 0.2);
      infraOf(g, id).fill = 0.95; // pełne stadiony: zachęta do budowy
    }
    infraSeason(g, date);
    for (let mo = 0; mo < 12; mo++) {
      const d = new Date(`${y}-07-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + mo + 1);
      infraMonth(g, d.toISOString().slice(0, 10));
    }
  }
  let upgrades = 0;
  for (const [id, I] of Object.entries(g.infra.clubs)) {
    if (id === g.clubId) continue;
    for (const k of TRACKS) {
      assert.ok(I[k] <= AI_MAX, `${id} ${k}: ${I[k]}`);
      if (I[k] > I.start[k]) upgrades++;
    }
  }
  assert.ok(upgrades >= 20, `kluby AI rozbudowują obiekty (${upgrades})`);
  for (const id of ['legia', 'lech']) for (const k of TRACKS) assert.ok(g.infra.clubs[id][k] <= 8);
});

test('Stary zapis: brak game.infra i znacznika w planie, ensureCareer tworzy stan i nakłada plan', () => {
  const g = fresh();
  delete g.infra;
  for (const c of Object.values(g.finance.clubs)) { delete c.plan.infra; delete c.plan.infraBase; delete c.plan.infraOps; delete c.plan.upkeep; delete c.plan.upkeepBase; }
  const ops = g.finance.clubs.legia.plan.ops;
  ensureCareer(g);
  assert.ok(g.infra?.clubs?.legia);
  assert.equal(g.finance.clubs.legia.plan.ops, ops);
  assert.equal(g.finance.clubs.legia.plan.upkeep, upkeepAt(infraOf(g, 'legia')));
  applyPlan(g, 'legia'); applyPlan(g, 'legia');
  assert.equal(g.finance.clubs.legia.plan.ops, ops, 'ponowne nałożenie nie zmienia kosztów');
  financeDay(g.finance, g.world, '2026-08-01');
  assert.ok(g.finance.clubs.legia.ledger['2026-08'].out.upkeep > 0);
  assert.ok(FIN_LABELS.infra && FIN_LABELS.upkeep);
});

test('Widok: kafelki, trzy karty z drabiną poziomów, potwierdzenie, start inwestycji i oś czasu', () => {
  const g = fresh(); ensureInfra(g);
  g.finance.clubs[g.clubId].balance = 300e6;
  const html = renderClubHub(g, { kTab: 'infrastruktura' });
  assert.match(html, /class="inf-grid"/);
  assert.equal((html.match(/class="tf-p inf-card"/g) ?? []).length, 3);
  for (const t of TRACKS) assert.match(html, new RegExp(`data-act="inf-start" data-track="${t}"`));
  assert.equal((html.match(/<ol class="inf-steps"/g) ?? []).length, 3);
  assert.match(html, /data-s="cur"/);
  assert.match(html, /szczyt w Polsce/);
  assert.match(html, /Camp Nou/);
  assert.match(html, /Trwające inwestycje/);
  assert.match(html, /Licencja: Ekstraklasa/);
  for (const s of [html]) { assert.ok(!s.includes('\u2014'), 'długi myślnik'); assert.ok(!/undefined|NaN/.test(s), 'undefined/NaN'); }
  let ui = handleClubAction(g, 'inf-start', { track: 'training' }).ui;
  assert.equal(ui.infAsk, 'training');
  const h2 = renderClubHub(g, { kTab: 'infrastruktura', ...ui });
  assert.match(h2, /data-act="inf-confirm" data-track="training"/);
  assert.match(h2, /data-act="inf-cancel"/);
  const r = handleClubAction(g, 'inf-confirm', { track: 'training' });
  assert.equal(r.save, true); assert.equal(r.ui.infAsk, null); assert.match(r.ui.kMsg, /Ruszyła inwestycja/);
  ui = r.ui;
  const h3 = renderClubHub(g, { kTab: 'infrastruktura', ...ui });
  assert.match(h3, /class="inf-time"/);
  assert.match(h3, /class="inf-run"/);
  assert.ok(!/undefined|NaN/.test(h3));
  assert.equal(handleClubAction(g, 'inf-cancel', {}).ui.infAsk, null);
  assert.equal(handleClubAction(g, 'inf-confirm', { track: 'training' }).save, false, 'drugi projekt na tym samym torze');
});
