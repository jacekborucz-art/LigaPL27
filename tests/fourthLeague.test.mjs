// IV liga (docs/iv-liga.md): terminarz 16 grup, wyniki, baraże, ruchy z III ligą i poziomem 6, pliki poziomu 6, widok,
// stare zapisy bez IV ligi (decyzja D1).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Rng } from '../src/core/rng.js';
import { createSeason, thirdLeagueDates } from '../src/season/season.js';
import { CLUBS_PL, clubById, leagueLabel } from '../src/data/clubs_pl.js';
import { CLUBS_L4 } from '../src/data/clubs_l4.js';
import { VOIVODESHIPS, VOIV } from '../src/data/voivodeships.js';
import { loadLevel6, level6Entries, parseLevel6, level6Candidates, setLevel6ForTests, level6Club, level6SaveData } from '../src/data/level6.js';
import { computeMoves, validateTiers, fourthLeagueSizes, fourthLeagueMembers, voivOfClub, knownClub, l3GroupFor, applyLeagueState } from '../src/season/leagues.js';
import { applySeasonState, rolloverSeason } from '../src/season/rollover.js';
import { clubWoj } from '../src/career/referees.js';
import { DOMESTIC } from '../src/config/calendar2026.js';
import * as F from '../src/season/fourthLeague.js';
import { renderCompetitions } from '../src/ui/competitionsView.js';
import '../src/season/dailySystems.js';

applySeasonState({});
await loadLevel6();

const dow = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const l4Game = (seed = 11) => {
  const g = { seed, clubId: null, date: '2026-07-01', world: { clubs: {}, players: {} }, archive: [] };
  g.season = createSeason(seed, { l4Seed: seed });
  return g;
};
const playSeason = (g) => { for (let d = '2027-06-01'; d <= '2027-06-20'; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) F.fourthLeagueDay(g, d); };

test('Województwa: 16 grup, rozmiary 14/16/18 zgodne z danymi, kluby lig 1-4 mają województwo zgodne z grupą III ligi', () => {
  assert.equal(VOIVODESHIPS.length, 16);
  const m = fourthLeagueMembers();
  for (const v of VOIVODESHIPS) {
    assert.equal(m[v.key].length, v.size, v.key);
    assert.equal(v.minDown, v.size === 18 ? 3 : 2);
    assert.ok(CLUBS_L4.filter((c) => c.voiv === v.key).every((c) => c.l3group === v.l3group), `${v.key}: makroregion`);
  }
  assert.equal(Object.values(m).flat().length, 276);
  for (const c of CLUBS_PL) {
    assert.ok(VOIV[voivOfClub(c)], `${c.id}: województwo`);
    assert.equal(voivOfClub(c), clubWoj(c.id), `${c.id}: jak u sędziów`);
    assert.equal(VOIV[voivOfClub(c)].l3group, l3GroupFor(c), `${c.id}: grupa III ligi województwa`);
  }
});

test('Terminarz: każda para dwa razy (raz u siebie), 26/30/34 kolejki, weekendy i środy z siatki III ligi, wspólny koniec', () => {
  for (const year of [2026, 2030]) {
    applySeasonState({ seasonYear: year });
    const L = createSeason(5, { l4Seed: 5 }).l4;
    const grid = thirdLeagueDates();
    assert.deepEqual(Object.keys(L.dates).map(Number).sort((a, b) => a - b), [26, 30, 34]);
    for (const [R, d] of Object.entries(L.dates)) {
      assert.equal(d.length, Number(R));
      assert.ok(d.every((x) => grid.includes(x)), `${year} ${R}: tylko terminy III ligi`);
      assert.equal(d.at(-1), grid.at(-1), 'ostatnia kolejka razem z III ligą');
      assert.ok(d[Number(R) / 2 - 1] <= DOMESTIC.liga3.autumnEnd, 'I runda przed przerwą zimową');
    }
    L.groups.forEach((G, gi) => {
      const fx = F.l4GroupFixtures(L, gi);
      assert.equal(fx.length, G.ids.length * (G.ids.length - 1), G.voiv);
      const pairs = new Set(fx.map((f) => `${f.home}>${f.away}`));
      assert.equal(pairs.size, fx.length, `${G.voiv}: bez powtórzeń`);
      for (const f of fx) {
        assert.ok(pairs.has(`${f.away}>${f.home}`), 'rewanż');
        assert.ok([0, 6, 3].includes(dow(f.date)), `${f.date}: weekend albo środa`);
        assert.ok(f.date <= `${year + 1}-06-30` && f.date >= `${year}-07-01`);
      }
      // Każdy klub raz w kolejce
      for (let r = 1; r <= fx.at(-1).round; r++) { const ids = fx.filter((f) => f.round === r).flatMap((f) => [f.home, f.away]); assert.equal(new Set(ids).size, ids.length); }
    });
  }
  applySeasonState({});
});

test('Terminarz: grupa z nieparzystą liczbą drużyn (17) ma pauzę, 34 kolejki, każdy pauzuje raz w rundzie', () => {
  const out = CLUBS_L4.find((c) => c.voiv === 'mazowiecka' && !c.parent).id;
  applyLeagueState({ leagueState: { tiers: { [out]: 6 }, groups: {} } });
  try {
    const L = createSeason(9, { l4Seed: 9 }).l4;
    const gi = F.l4GroupIndex(L, 'mazowiecka');
    const G = L.groups[gi];
    assert.equal(G.ids.length, 17);
    const fx = F.l4GroupFixtures(L, gi);
    assert.equal(fx.at(-1).round, 34);
    for (const half of [[1, 17], [18, 34]]) {
      for (const id of G.ids) {
        const played = fx.filter((f) => f.round >= half[0] && f.round <= half[1] && (f.home === id || f.away === id)).length;
        assert.equal(played, 16, `${id}: jedna pauza w rundzie`);
      }
    }
  } finally { applySeasonState({}); }
});

test('Wyniki: deterministyczne (dzień po dniu = naraz), kalibracja goli, gospodarzy i punktów mistrza', () => {
  const a = l4Game(21); const b = l4Game(21);
  for (let d = '2026-07-25'; d <= '2026-12-01'; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) F.playFourthLeagueUntil(a, d);
  F.playFourthLeagueUntil(b, '2026-12-01');
  assert.deepEqual(a.season.l4.groups.map((G) => G.res), b.season.l4.groups.map((G) => G.res));
  assert.ok(a.season.l4.groups.every((G) => G.res.includes('-') && /[0-9a-z]/.test(G.res)), 'część meczów rozegrana');
  let goals = 0; let n = 0; let home = 0; const champ = [];
  for (let s = 0; s < 12; s++) {
    const g = l4Game(300 + s);
    F.playFourthLeagueUntil(g, '2027-06-30');
    for (const G of g.season.l4.groups) {
      assert.ok(!G.res.includes('-'), 'cały sezon rozegrany');
      for (let k = 0; k < G.res.length / 2; k++) { const x = parseInt(G.res[2 * k], 36); const y = parseInt(G.res[2 * k + 1], 36); goals += x + y; n++; if (x > y) home++; }
      if (G.ids.length === 18) champ.push(F.l4Rows(g.season.l4, G.voiv)[0].points);
    }
  }
  const gpm = goals / n; const hw = home / n; const cp = champ.reduce((x, y) => x + y, 0) / champ.length;
  assert.ok(gpm > 2.9 && gpm < 3.5, `gole na mecz ${gpm}`);
  assert.ok(hw > 0.44 && hw < 0.5, `wygrane gospodarzy ${hw}`);
  assert.ok(cp > 70 && cp < 85, `mistrz grupy 18 drużyn ${cp} pkt`);
});

test('Baraże: 4 makroregiony po 4 wicemistrzów, rezerwy bez prawa awansu pominięte, przed 30 czerwca, karne rozstrzygają', () => {
  const g = l4Game(31);
  F.playFourthLeagueUntil(g, '2027-06-30');
  const L = g.season.l4;
  for (let d = '2027-06-06'; d <= '2027-06-20'; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) F.fourthLeagueDay(g, d);
  assert.ok(L.po && L.done);
  assert.ok(L.po.sd < L.po.fd && L.po.fd < '2027-06-30');
  for (const g3 of [1, 2, 3, 4]) {
    const P = L.po[g3];
    assert.equal(P.runners.length, 4, `grupa ${g3}`);
    for (const id of P.runners) assert.ok(F.l4Eligible(id), `${id}: uprawniony`);
    const voivs = VOIVODESHIPS.filter((v) => v.l3group === g3).map((v) => v.key);
    for (const id of P.runners) assert.ok(voivs.includes(voivOfClub(knownClub(id))), `${id}: z makroregionu`);
    assert.equal(P.sf.length, 2);
    assert.ok(P.w && P.ru && P.w !== P.ru && P.sf.every((m) => m.w));
  }
  // Remis: dogrywka i karne zawsze dają zwycięzcę
  const rng = new Rng('karne');
  for (let i = 0; i < 300; i++) { const r = F.simulateL4(rng, 6.5, 6.5, true); if (r.s[0] === r.s[1]) assert.ok(r.pen && r.pen[0] !== r.pen[1]); }
  // Rozmiar w zapisie
  assert.ok(JSON.stringify(L).length < 40000, `rozmiar ${JSON.stringify(L).length}`);
});

/** Tabele lig 1-3 i grup III ligi do ruchów (kolejność losowa z ziarna). */
function fakeTables(seed) {
  const rng = new Rng(`tabele:${seed}`);
  const t = (tier) => rng.shuffle(CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id));
  const groupTables = Object.fromEntries([1, 2, 3, 4].map((g) => [g, rng.shuffle(CLUBS_PL.filter((c) => c.tier === 4 && c.group === g).map((c) => c.id))]));
  return { tables: { 1: t(1), 2: t(2), 3: t(3) }, groupTables };
}
function l4Results(seed) {
  const g = l4Game(seed);
  F.playFourthLeagueUntil(g, '2027-06-30');
  const res = F.fourthLeagueResults(g);
  for (const g3 of [1, 2, 3, 4]) {
    const ru = VOIVODESHIPS.filter((v) => v.l3group === g3).map((v) => res.tables[v.key].filter(F.l4Eligible)[1]);
    res.playoff[g3] = { w: ru[0], ru: ru[1] };
  }
  return res;
}

test('Ruchy z IV ligą: 4 mistrzów na grupę III ligi, baraż tylko przy wolnym miejscu, utrzymania i dodatkowe spadki, zawsze 72', () => {
  const res = l4Results(41);
  const seen = new Set();
  const check = (tables, groupTables, m) => {
    assert.deepEqual(validateTiers(Object.fromEntries(Object.entries(m.tiers).filter(([, x]) => x <= 4)), m.groups), []);
    assert.equal(m.l4Up.length, 16, 'mistrzowie 16 województw');
    for (const g of [1, 2, 3, 4]) {
      const voivs = VOIVODESHIPS.filter((v) => v.l3group === g).map((v) => v.key);
      const champs = voivs.map((v) => res.tables[v].find(F.l4Eligible));
      for (const id of champs) { assert.equal(m.tiers[id], 4, `${id}: mistrz awansuje`); assert.equal(m.groups[id], g); }
      // Wolne miejsca: 18 - zostający spoza miejsc 15-18 - spadkowicze z 2 Ligi
      const table = groupTables[g];
      const stayTop = table.slice(0, 14).filter((id) => !(m.promoted[3].includes(id))).length;
      const inG = tables[3].filter((id) => m.tiers[id] === 4 && m.groups[id] === g).length;
      const free = 18 - stayTop - inG;
      seen.add(free);
      const po = m.l4Playoff.find((x) => x.g === g);
      assert.equal(po.up, free >= 5, `grupa ${g}: wolnych ${free}, baraż ${po.up}`);
      const reprieved = m.notes.filter((n) => n.kind === 'reprieve' && n.tier === 4 && table.includes(n.id)).length;
      assert.equal(reprieved, Math.max(0, free - 5), `grupa ${g}: utrzymania`);
      const down = table.filter((id) => m.tiers[id] === 5).length;
      assert.equal(down, 4 - reprieved + Math.max(0, 4 - free), `grupa ${g}: spadki`);
    }
  };
  for (let s = 0; s < 25; s++) {
    const { tables, groupTables } = fakeTables(s);
    const m = computeMoves(tables, {}, groupTables, new Rng(`ruchy:${s}`), { l3Playoff: [], l4: res });
    check(tables, groupTables, m);
  }
  // 6 wolnych miejsc: zwycięzca i zwycięzca baraży z grupy 1, żaden spadkowicz z 2 Ligi do grupy 1
  const { tables, groupTables } = fakeTables(99);
  const t3 = [...tables[3].filter((id) => l3GroupFor(clubById(id)) === 1), ...tables[3].filter((id) => l3GroupFor(clubById(id)) !== 1)];
  const challenger = groupTables[1].filter((id) => !clubById(id).parent)[1];
  const gt = { ...groupTables, 1: [groupTables[1].filter((id) => !clubById(id).parent)[0], challenger, ...groupTables[1].filter((id) => id !== challenger && id !== groupTables[1].filter((x) => !clubById(x).parent)[0])] };
  const m = computeMoves({ ...tables, 3: t3 }, {}, gt, new Rng('szesc'), { l3Playoff: [{ keeper: t3[12], challenger, winner: challenger }], l4: res });
  check({ ...tables, 3: t3 }, gt, m);
  assert.ok(seen.has(6) && seen.has(4) && seen.has(5), `przypadki wolnych miejsc: ${[...seen]}`);
  applySeasonState({});
});

test('Skład IV ligi: stałe rozmiary grup z pulą poziomu 6, spadkowicz z III ligi do swojego województwa, rezerwy niżej', () => {
  const res = l4Results(51);
  const { tables, groupTables } = fakeTables(5);
  // Wigry Suwałki i ŁKS Łomża na ostatnich miejscach swojej grupy III ligi: spadek do IV ligi (podlaskiej)
  for (const id of ['wigry', 'lks-lomza']) { const g = clubById(id).group; groupTables[g] = [...groupTables[g].filter((x) => x !== id), id]; }
  const m = computeMoves(tables, {}, groupTables, new Rng('sklad'), { l3Playoff: [], l4: res });
  assert.equal(m.tiers.wigry, 5);
  assert.equal(voivOfClub(knownClub('wigry')), 'podlaska');
  // Rezerwy ŁKS (IV liga) nie mogą grać w tej samej lidze co pierwsza drużyna: poziom 6
  assert.equal(m.tiers['lks-ii-lomza'], 6);
  const sizes = fourthLeagueSizes(m.tiers);
  for (const v of VOIVODESHIPS) assert.equal(sizes[v.key], v.size, v.key);
  for (const v of VOIVODESHIPS) {
    const n = (m.l4Down[v.key] ?? []).length;
    assert.ok(n >= v.minDown, `${v.key}: spadków ${n}`);
  }
  // Beniaminkowie z plików mają dane do zapisu i są znani grze
  const fresh = Object.keys(m.extra);
  assert.ok(fresh.length > 0);
  for (const id of fresh) { assert.equal(m.tiers[id], 5); assert.ok(knownClub(id)?.name && m.extra[id].voiv); }
  applySeasonState({});
});

test('Pliki poziomu 6: 16 województw wczytanych, wartości „brak danych” pomijane, unikalne id, pula z ziarna, sw.js', () => {
  for (const v of VOIVODESHIPS) assert.ok(level6Entries(v.key).length >= 16, `${v.key}: ${level6Entries(v.key).length}`);
  const all = VOIVODESHIPS.flatMap((v) => level6Entries(v.key));
  assert.equal(new Set(all.map((e) => e.id)).size, all.length, 'unikalne id');
  const p = parseLevel6('V LIGA\nFORMAT: nazwa druzyny | barwy | stadion | pojemnosc\nGRUPA 1\n---\nOrzeł Test | bialo-czerwono-czarne | stadion miejski | 1200\nSokół Próba | zielono-białe | Stadion Sokoła | 850\n\nŁącznie 2 drużyny.');
  assert.deepEqual(p, [{ name: 'Orzeł Test', group: '1' }, { name: 'Sokół Próba', group: '1', colors: 'zielono-białe', stadium: 'Stadion Sokoła', cap: 850 }]);
  const c = level6Club('sokol-proba', level6SaveData({ ...p[1], id: 'sokol-proba' }, 'lubuska'));
  assert.deepEqual(c.colors, ['#00843D', '#FFFFFF']);
  assert.equal(c.tier0, 6); assert.equal(c.l3group, 3); assert.equal(c.city, 'Próba'); assert.equal(c.cap, 850);
  assert.equal(leagueLabel({ tier: 6, voiv: 'mazowiecka' }), 'V liga');
  assert.equal(leagueLabel({ tier: 6, voiv: 'lubuska' }), 'klasa okręgowa');
  const a = level6Candidates('pomorska', 7, () => false); const b = level6Candidates('pomorska', 7, () => false);
  assert.deepEqual(a.map((e) => e.id), b.map((e) => e.id));
  assert.ok(a.length === 6 && a.every((e) => !/\sII(\s|$)/.test(e.name)), 'bez rezerw');
  assert.ok(level6Candidates('pomorska', 7, (id) => id === a[0].id).every((e) => e.id !== a[0].id), 'bez klubów już w grze');
  // Tryb offline: pliki poziomu 6 na liście sw.js
  const sw = fs.readFileSync('sw.js', 'utf8');
  for (const v of VOIVODESHIPS) assert.ok(sw.includes(`'./src/data/V liga PL/${v.file}'`), v.file);
  // Brak pliku: pusta pula, ruchy dalej działają (utrzymania)
  setLevel6ForTests({});
  try {
    assert.equal(level6Entries('mazowiecka').length, 0);
    const res = l4Results(61); const { tables, groupTables } = fakeTables(6);
    const m = computeMoves(tables, {}, groupTables, new Rng('pusta'), { l3Playoff: [], l4: res });
    assert.equal(Object.keys(m.extra).length, 0);
    assert.ok(m.notes.some((n) => n.kind === 'reprieve' && n.tier === 5), 'utrzymania przy pustej puli');
  } finally { setLevel6ForTests(null); applySeasonState({}); }
});

test('Koniec sezonu w karierze z IV ligą: archiwum, wiadomość, nowy terminarz IV ligi, kluby z poziomu 6 w zapisie', async () => {
  await loadLevel6();
  const { generateWorld } = await import('../src/world/worldGen.js');
  applySeasonState({});
  const g = { seed: 71, clubId: null, date: '2027-07-01', season: null, inbox: [], world: generateWorld(71), manager: { job: { status: 'unemployed' } } };
  g.season = createSeason(71, { l4Seed: 71 });
  g.fixtures = g.season.fixtures;
  for (const f of g.fixtures) { f.played = true; f.result = { score: [1, 0] }; }
  playSeason(g);
  const { ensureCareer } = await import('../src/career/careerSystem.js');
  ensureCareer(g);
  const r = rolloverSeason(g);
  const a = g.archive.at(-1);
  assert.equal(Object.keys(a.l4.champ).length, 16);
  assert.ok(a.l4.up.length >= 16 && a.l4.d6.length >= 40 && a.l4.d6.length === a.l4.u6.length);
  assert.ok(g.season.l4 && g.season.l4.year === 2027, 'IV liga w nowym sezonie');
  assert.equal(g.season.l4.groups.reduce((s, G) => s + G.ids.length, 0), 276);
  const ids = g.season.l4.groups.flatMap((G) => G.ids);
  assert.equal(new Set(ids).size, ids.length, 'żaden klub w dwóch grupach');
  assert.ok(ids.every((id) => !clubById(id) || clubById(id).tier === 5), 'kluby IV ligi poza ligami 1-4');
  assert.ok(Object.keys(g.leagueState.extra ?? {}).length > 0, 'beniaminkowie z poziomu 6 w zapisie');
  const msg = r.messages.find((x) => x.key?.startsWith('koniec:'));
  assert.ok(msg.body.includes('mistrzowie województw') && msg.body.includes('Spadek z IV ligi'));
  for (const v of VOIVODESHIPS) assert.equal(g.season.l4.groups.find((G) => G.voiv === v.key).ids.length, v.size, v.key);
  applySeasonState({});
});

test('Widok IV liga: select 16 grup, tabela grupy, karta klubu bez zawodników, tekst przez esc', () => {
  applySeasonState({});
  const g = l4Game(81);
  F.playFourthLeagueUntil(g, '2026-10-10');
  g.clubId = 'widzew';
  const html = renderCompetitions(g, { comp: 'liga4' });
  assert.equal((html.match(/<option /g) ?? []).length, 16);
  assert.ok(html.includes('id="l4-voiv"') && html.includes('selected'));
  assert.ok(/<option value="lodzka" selected>/.test(html), 'domyślnie województwo klubu gracza');
  assert.equal((html.match(/class="tbl__row (is-me)?" role="row"/g) ?? []).length - 0, VOIV.lodzka.size, 'wiersze tabeli');
  assert.ok(!html.includes('data-act="club"'), 'kluby bez kadry nie otwierają widoku klubu');
  assert.ok(html.includes('data-act="l4club"'));
  assert.ok(!/[A-ZĄĆĘŁŃÓŚŹŻ]{4,}/.test(html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, '')), 'bez etykiet wielkimi literami');
  const id = g.season.l4.groups[F.l4GroupIndex(g.season.l4, 'lodzka')].ids[0];
  const card = renderCompetitions(g, { comp: 'liga4', l4Club: id });
  assert.ok(card.includes('l4-card') && card.includes('Renoma') && card.includes('Stadion'));
  const fx = renderCompetitions(g, { comp: 'liga4', view: 'fixtures', l4Voiv: 'opolska', round: 3 });
  assert.ok(fx.includes('3. kolejka'));
  const po = renderCompetitions(g, { comp: 'liga4', view: 'playoff' });
  assert.ok(po.includes('Grupa I III ligi') && po.includes('obecni wicemistrzowie') && po.includes('Województwa: łódzka'));
  // Złośliwa nazwa klubu: przez esc
  const c = knownClub(id); const old = c.name; c.name = '<img src=x>';
  try { assert.ok(!renderCompetitions(g, { comp: 'liga4', l4Club: id }).includes('<img src=x>')); } finally { c.name = old; }
});

test('Stary zapis (D1): bez IV ligi, ruchy jak dotąd (losowanie z wagi), widok tylko z wyjaśnieniem', () => {
  applySeasonState({});
  const S = createSeason(91, {});
  assert.equal(S.l4, undefined);
  const g = { seed: 91, clubId: 'widzew', season: S, fixtures: S.fixtures, world: { clubs: {} } };
  assert.equal(F.fourthLeagueResults(g), null);
  assert.deepEqual(F.fourthLeagueDay(g, '2027-06-10'), []);
  const { tables, groupTables } = fakeTables(3);
  const m = computeMoves(tables, {}, groupTables, new Rng('stary'));
  assert.equal(m.l4Down, undefined);
  assert.ok(m.promoted[4].length >= 16 && Object.values(m.tiers).every((t) => t <= 5));
  const html = renderCompetitions(g, { comp: 'liga4' });
  assert.ok(html.includes('kariera') || html.includes('karierach'));
  assert.ok(!html.includes('<select'));
});
