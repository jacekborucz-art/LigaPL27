// Ekran Transfery > Skauting: src/ui/scoutingView.js (widok z atrapy logiki i z bogatego widoku syntetycznego).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { renderTransfers, TF_TABS } from '../src/ui/transfersView.js';
import { renderSkauting, skUiAction, setOrderField, filterFreeScouts, defaultOrder, orderFromMission } from '../src/ui/scoutingView.js';
import { SCOUT_REGIONS, scoutingView } from '../src/career/scoutOps.js';
import '../src/season/dailySystems.js';

function newGame(clubId = 'widzew', seed = 21) {
  const g = { seed, clubId, date: '2026-11-20', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g);
  processDay(g);
  g.date = '2026-11-20';
  return g;
}
const G = newGame();
const count = (html, re) => (html.match(re) ?? []).length;
const clean = (html, what) => {
  assert.ok(!html.includes('—'), `długi myślnik: ${what}`);
  assert.ok(!/undefined|NaN|\[object/.test(html), `undefined/NaN: ${what}`);
};
const keys = SCOUT_REGIONS.map((r) => r.key);
const reg = (i, band) => ({ key: keys[i], label: SCOUT_REGIONS[i].label, level: band === 'ekspert' ? 18 : band === 'dobra' ? 12 : 6, band });
const attrs = (a) => ({ dos: a[0], oce: a[1], ryn: a[2], sie: a[3], cha: a[4] });
const pid = Object.keys(G.world.players)[0];
const ghost = 'nie-ma-takiego-zawodnika';

const cand = (o) => ({
  pid, missionId: 'm1', name: 'Zażółć <b>Gęślą</b> "Jaźń"', nat: 'SWE', age: 21, pos: 'ŚP', ovrRange: [58, 66], potRange: [68, 80], confidence: 'wysoka',
  priceRange: [1200000, 1600000], wageRange: [14000, 18000], willingness: 'Chętny', adaptation: 'niskie', strengths: ['Podanie', 'Wizja gry'], weaknesses: ['Szybkość'],
  note: 'Technicznie czysty & spokojny <i>zawodnik</i>.', opinion: 'Moim zdaniem to zawodnik na poziomie ok. 58-66, potencjał do 80.', free: false, clubLabel: 'Borås Södra IF, umowa do cze 2028', injuredDays: 0, until: '2027-01-15', state: 'nowy', goneText: '', ...o,
});
const rich = () => ({
  scouts: [
    { id: 's1', name: 'Tomasz <Wrona>', nat: 'POL', age: 49, contractUntil: '2028-06-30', wage: 11400, attrs: attrs([14, 12, 15, 13, 9]), regions: [reg(0, 'ekspert'), reg(1, 'dobra')], status: 'w podróży', busyUntil: '2026-12-04', missionId: 'm2' },
    { id: 's2', name: 'Marek Zawada', nat: 'POL', age: 37, contractUntil: '2027-06-30', wage: 5200, attrs: attrs([9, 11, 8, 7, 16]), regions: [reg(2, 'podstawowa')], status: 'w klubie', busyUntil: null, missionId: null },
  ],
  staffSlots: { used: 2, max: 3 }, costs: { wagesMonthly: 16600, tripsSeason: 41500, commissionsSeason: 0 },
  missions: [
    { id: 'm1', scoutId: 's2', scoutName: 'Marek Zawada', freelance: false, region: keys[2], regionLabel: 'Skandynawia i Bałtyk', pos: 'ŚP', ageFrom: 19, ageTo: 24, level: 'perspektywa', maxFee: 2000000, maxWage: 20000, contract: 'any', weeks: 2, start: '2026-11-03', end: '2026-11-17', status: 'zakończona', cost: 15000, events: [], result: { n: 4, candidates: [pid] } },
    { id: 'm2', scoutId: 's1', scoutName: 'Tomasz <Wrona>', freelance: false, region: keys[0], regionLabel: 'Bałkany', pos: 'ŚO', ageFrom: 22, ageTo: 28, level: 'wzmocnienie', maxFee: 3000000, maxWage: 25000, contract: 'contract', weeks: 4, start: '2026-11-06', end: '2026-12-04', status: 'w toku', cost: 30000,
      events: [{ date: '2026-11-06', kind: 'wyjazd', text: 'Wyjazd do Belgradu.' }, { date: '2026-11-09', kind: 'agent', text: 'Agent podał dwa nazwiska.' }, { date: '2026-11-13', kind: 'mecz', text: 'Dobry mecz młodzieżówki.' }, { date: '2026-11-18', kind: 'zaulek', text: 'Kandydat doznał kontuzji.' }], result: null },
    { id: 'm3', scoutId: 's2', scoutName: 'Marek Zawada', freelance: false, region: keys[3], regionLabel: 'Półwysep Iberyjski', pos: 'BO', ageFrom: 18, ageTo: 21, level: 'perspektywa', maxFee: 400000, maxWage: 5000, contract: 'free', weeks: 1, start: '2026-10-01', end: '2026-10-08', status: 'zakończona', cost: 7500, events: [], result: { n: 0, candidates: [] } },
  ],
  candidates: [
    cand({}),
    cand({ pid: ghost, name: 'Oskar Nyberg', confidence: 'niska', free: true, willingness: 'Raczej nie', adaptation: 'wysokie', injuredDays: 12, state: 'obserwowany' }),
    cand({ pid: 'x1', name: 'Mikkel Dahl', confidence: 'średnia', willingness: 'Wahający się', adaptation: 'średnie', state: 'obserwowany', until: '2026-11-25' }),
    cand({ pid: 'x2', name: 'Luka Marković', state: 'zniknął', goneText: 'Trafił do HNK Lokomotiva 12 lis.' }),
  ],
  freeScouts: [
    { id: 'f1', name: 'Rui Albuquerque', nat: 'POR', age: 52, attrs: attrs([17, 16, 18, 17, 14]), regions: [reg(3, 'ekspert'), reg(6, 'dobra')], wageMonthly: 38500, missionFees: { 1: 31000, 2: 62000, 4: 110000, 6: 150000 }, commissionPct: 7, permanentOk: { ok: false, text: 'Na stałe: pensja ponad budżetem sztabu.' }, missionOk: { ok: true, text: '' } },
    { id: 'f2', name: 'Lars Eriksen', nat: 'NOR', age: 41, attrs: attrs([13, 15, 11, 12, 15]), regions: [reg(2, 'ekspert')], wageMonthly: 9600, missionFees: { 1: 9000, 2: 18000, 4: 32000, 6: 45000 }, commissionPct: 4, permanentOk: { ok: true, text: '' }, missionOk: { ok: true, text: '' } },
    { id: 'f3', name: 'Zoran Babić', nat: 'BIH', age: 61, attrs: attrs([18, 17, 17, 18, 16]), regions: [reg(0, 'ekspert')], wageMonthly: 46200, missionFees: { 1: 40000, 2: 79000, 4: 140000, 6: 190000 }, commissionPct: 8, permanentOk: { ok: false, text: 'Renoma za niska.' }, missionOk: { ok: false, text: 'Renoma za niska.' } },
  ],
  refreshDate: '2027-01-01', newCandidates: 2,
});
const fakeQuote = (g, o) => (o.weeks === 6 ? { ok: false, text: 'Skaut nie ma tyle czasu.', cost: 0, returnDate: null, chance: 'niska', expected: '', reasons: [] }
  : { ok: true, text: '', cost: 7500 * o.weeks, returnDate: '2026-12-18', chance: o.weeks >= 4 ? 'wysoka' : 'średnia', expected: '1 do 4', reasons: ['Skaut zna region.', 'Dwa tygodnie wystarczą <na przegląd>.'] });

test('Skauting jest piątą podzakładką Transfery z klasą subtabs--5', () => {
  assert.equal(TF_TABS.length, 5);
  assert.deepEqual(TF_TABS[4], ['skauting', 'Skauting']);
  const html = renderTransfers(G, { tfTab: 'skauting' });
  assert.match(html, /class="subtabs subtabs--5"/);
  assert.match(html, /data-act="tf-tab" data-t="skauting" aria-selected="true"/);
  assert.match(html, /<div class="sk">/);
  clean(html, 'Transfery > Skauting');
});

test('Atrapa logiki: trzy zakładki pigułkowe, mapa 12 regionów, wolni skauci, bez myślników i undefined', () => {
  for (const t of ['misje', 'kandydaci', 'wolni']) {
    const html = renderSkauting(G, { skTab: t });
    clean(html, t);
    assert.equal(count(html, /data-act="sk-tab" data-t="/g) >= 3, true);
    assert.match(html, new RegExp(`data-t="${t}"`));
  }
  const misje = renderSkauting(G, { skTab: 'misje' });
  assert.equal(count(misje, /class="sk-tile"/g), 12);
  assert.match(misje, /data-act="sk-open-order" data-region="/);
  const wolni = renderSkauting(G, { skTab: 'wolni' });
  assert.ok(count(wolni, /class="sk-row"/g) >= 4);
  assert.match(wolni, /data-sk-sort/);
  assert.match(wolni, /data-sk-reach/);
  const kand = renderSkauting(G, { skTab: 'kandydaci' });
  assert.match(kand, /Nie masz jeszcze raportów/);
});

test('Bogaty widok: karty skautów, misja w toku z trasą i dziennikiem, polskie daty, ucieczka HTML', () => {
  const html = renderSkauting(G, { skTab: 'misje' }, { view: rich() });
  clean(html, 'misje');
  assert.match(html, /Tomasz &lt;Wrona&gt;/);
  assert.ok(!html.includes('<Wrona>'));
  assert.match(html, /w podróży do 4 gru/);
  assert.match(html, /wraca 4 gru 2026/);
  assert.match(html, /Dzień <b>14<\/b> z 28/); // 6 lis -> 20 lis z 28 dni
  assert.match(html, /role="progressbar"/);
  assert.equal(count(html, /class="sk-attr"/g), 10); // dwóch skautów, po pięć cech
  assert.match(html, /<li data-k="bad"><time>18 lis<\/time>/);
  assert.match(html, /data-future="1"/);
  assert.match(html, /data-act="sk-cancel-ask" data-id="m2"/);
  assert.match(html, /1 wolne miejsce|Wolne miejsce/);
  assert.match(html, /disabled aria-describedby="sk-why-s1"/);
  assert.match(html, /Ostatnie wyjazdy/);
  assert.match(html, /data-lv="3"/); // ekspert na mapie
  assert.match(html, /class="sk-pin"/); // skaut w podróży
});

test('Potwierdzenie zwolnienia i odwołania wyjazdu jest krokiem w interfejsie', () => {
  const v = rich();
  const fire = renderSkauting(G, { skTab: 'misje', skAsk: { kind: 'fire', id: 's2' } }, { view: v });
  assert.match(fire, /data-act="sk-fire" data-id="s2"/);
  assert.match(fire, /data-act="sk-ask-no"/);
  assert.ok(!/data-act="sk-fire" data-id="s1"/.test(fire));
  const cancel = renderSkauting(G, { skTab: 'misje', skAsk: { kind: 'cancel', id: 'm2' } }, { view: v });
  assert.match(cancel, /data-act="sk-cancel" data-id="m2"/);
  assert.match(cancel, /nie wracają/);
  // W pierwszych 2 dniach wraca połowa kosztów (zasada cancelMission), tekst nie może mówić „nie wracają”
  const v2 = rich(); v2.missions = v2.missions.map((m) => (m.id === 'm2' ? { ...m, start: G.date } : m));
  const early = renderSkauting(G, { skTab: 'misje', skAsk: { kind: 'cancel', id: 'm2' } }, { view: v2 });
  assert.match(early, /Wróci połowa kosztów \(15\s000\szł z 30\s000\szł\)/);
});

test('Kandydaci: zdanie skauta zamiast liczb, lornetka, przerywana ramka, link do karty i akcje', () => {
  const html = renderSkauting(G, { skTab: 'kandydaci' }, { view: rich() });
  clean(html, 'kandydaci');
  assert.match(html, /Skaut wrócił z 4 kandydatami/);
  assert.match(html, /Zażółć &lt;b&gt;Gęślą&lt;\/b&gt; &quot;Jaźń&quot;|data-pcard/);
  assert.match(html, /class="pc-link" data-pcard="/); // istniejący zawodnik: nazwisko jak link
  assert.match(html, /Moim zdaniem to zawodnik na poziomie ok\. 58-66/); // ocena tylko jako zdanie skauta
  assert.ok(!/class="sk-rng/.test(html)); // bez pasków zakresu
  assert.ok(!/poziom <b>/.test(html)); // lista obserwowanych: bez liczb, tylko lornetka
  assert.match(html, /class="scout-eye sk-eye" role="img" aria-label="Ocenę zna tylko skaut/);
  assert.match(html, /data-flag="1"/); // niska pewność oceny
  assert.match(html, /data-act="tf-open" data-id="/);
  assert.match(html, /Złóż ofertę/);
  assert.match(html, /data-act="sk-watch" data-id="[^"]+" data-on="1"/);
  assert.match(html, /data-act="sk-watch" data-id="[^"]+" data-on="0"/);
  assert.match(html, /1,20 mln zł do 1,60 mln zł/);
  assert.match(html, /Bez odstępnego/);
  assert.match(html, /kontuzja, 12 dni/);
  assert.match(html, /Oznacz raport jako przeczytany/);
  // nieistniejący zawodnik: bez przycisku oferty, nazwisko zwykłym tekstem
  assert.match(html, /Oskar Nyberg/);
  assert.ok(!html.includes(`data-id="${ghost}">Rozmawiaj`));
  assert.match(html, /<small>1<\/small>|<small>2<\/small>/); // znacznik z liczbą nowych
  assert.match(html, /data-new="1"/);
});

test('Obserwowani: pasek wygaśnięcia, kolor krawędzi i wiersz zniknięty z akcją Usuń z listy', () => {
  const html = renderSkauting(G, { skTab: 'kandydaci' }, { view: rich() });
  assert.match(html, /class="sk-watch"/);
  assert.match(html, /Może zniknąć z rynku za 1 tydzień/); // 25 lis: 5 dni
  assert.match(html, /data-gone="1"/);
  assert.match(html, /Trafił do HNK Lokomotiva 12 lis\./);
  assert.match(html, /Usuń z listy/);
  assert.match(html, /Przestań obserwować/);
});

test('Pusty raport: trzy powody dopasowane do zlecenia i akcje powtórz, zmień profil, znajdź skauta', () => {
  const html = renderSkauting(G, { skTab: 'kandydaci', skReport: 'm3' }, { view: rich() });
  clean(html, 'pusty raport');
  assert.match(html, /Skaut wrócił bez kandydatów/);
  assert.match(html, /class="sk-why"/);
  assert.match(html, /Krótki wyjazd/);
  assert.match(html, /Wymagający profil/);
  assert.match(html, /data-act="sk-repeat" data-id="m3" data-w="4"/);
  assert.match(html, /data-act="sk-tab" data-t="wolni">Znajdź lepszego skauta/);
  assert.match(html, /data-act="sk-report" data-id="m1"/); // wybór starszego raportu
});

test('Wolni skauci: filtr regionu, zasięg klubu, sortowanie, powód blokady', () => {
  const v = rich();
  assert.equal(filterFreeScouts(v.freeScouts, {}).length, 3);
  assert.deepEqual(filterFreeScouts(v.freeScouts, { reach: true }).map((s) => s.id), ['f2']);
  assert.deepEqual(filterFreeScouts(v.freeScouts, { reg: keys[0] }).map((s) => s.id), ['f3']);
  assert.deepEqual(filterFreeScouts(v.freeScouts, { sort: 'wage' }).map((s) => s.id), ['f2', 'f1', 'f3']);
  assert.deepEqual(filterFreeScouts(v.freeScouts, { sort: 'sum' }).map((s) => s.id), ['f3', 'f1', 'f2']);
  const html = renderSkauting(G, { skTab: 'wolni', skFilter: { sort: 'wage', reach: false, reg: 'all' } }, { view: v });
  clean(html, 'wolni');
  assert.match(html, /poza zasięgiem klubu/);
  assert.match(html, /Na stałe: pensja ponad budżetem sztabu\./);
  assert.match(html, /data-act="sk-hire" data-id="f1" disabled/);
  assert.match(html, /data-act="sk-hire" data-id="f2">/);
  assert.match(html, /data-act="sk-open-order" data-free="f2"/);
  assert.match(html, /data-act="sk-open-order" data-free="f3" disabled/);
  assert.match(html, /Lista odświeża się 1 sty 2027/);
  assert.match(html, /Pokazano 3 z 3/);
  const empty = renderSkauting(G, { skTab: 'wolni', skFilter: { reg: keys[11] } }, { view: v });
  assert.match(empty, /Nikt nie pasuje do filtrów/);
});

test('Arkusz zlecenia: wycena na żywo dla każdej zmiany, cztery czasy wyjazdu, blokada przy błędzie wyceny', () => {
  const v = rich();
  const seen = [];
  const q = (g, o) => { seen.push(o.weeks); return fakeQuote(g, o); };
  const order = { scoutId: 's2', region: keys[2], pos: 'ŚP', ageFrom: 19, ageTo: 24, level: 'perspektywa', maxFee: 2000000, maxWage: 20000, contract: 'any', weeks: 2 };
  const html = renderSkauting(G, { skTab: 'misje', skSheet: true, skOrder: order }, { view: v, quote: q });
  clean(html, 'arkusz');
  assert.match(html, /<div class="sk sk-sheetroot">/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.equal(count(html, /class="sk-tile"/g), 24); // mapa w gablocie i w formularzu
  assert.equal(count(html, /class="sk-wk4"/g), 4);
  assert.ok([1, 2, 4, 6].every((w) => seen.includes(w)), 'wycena dla wszystkich czasów');
  assert.match(html, /Szansa na kandydatów: średnia/);
  assert.match(html, /zwykle 1 do 4/);
  assert.match(html, /Wraca<\/dt><dd>18 gru 2026/);
  assert.match(html, /Dwa tygodnie wystarczą &lt;na przegląd&gt;\./);
  assert.match(html, /value="2 000 000" data-sk-f="maxFee"/);
  assert.match(html, /data-act="sk-start">Zleć wyjazd/);
  assert.match(html, /aria-pressed="true" data-act="sk-set" data-k="pos" data-v="ŚP"/);
  assert.match(html, /Dopasowanie: zna region podstawowo/);
  const bad = renderSkauting(G, { skTab: 'misje', skSheet: true, skOrder: { ...order, weeks: 6 } }, { view: v, quote: fakeQuote });
  assert.match(bad, /Skaut nie ma tyle czasu\./);
  assert.match(bad, /data-act="sk-start" disabled/);
  const msg = renderSkauting(G, { skTab: 'misje', skSheet: true, skOrder: order, skMsg: 'Brak środków.' }, { view: v, quote: fakeQuote });
  assert.match(msg, /role="alert"><b>Brak środków\./);
});

test('Arkusz zlecenia z wolnym skautem: skaut na jedną misję jest wybrany i opisany', () => {
  const v = rich();
  const o = defaultOrder(G, v, { freeScoutId: 'f2' });
  assert.equal(o.freeScoutId, 'f2');
  assert.equal(o.region, keys[2]);
  const html = renderSkauting(G, { skTab: 'wolni', skSheet: true, skOrder: o }, { view: v, quote: fakeQuote });
  assert.match(html, /<option value="f:f2" selected>Lars Eriksen, na jedną misję<\/option>/);
  assert.match(html, /Dopasowanie: ekspert od tego regionu/);
  assert.match(html, /<option value="s:s1" disabled>Tomasz &lt;Wrona&gt;, wraca 4 gru<\/option>/);
});

test('Akcje interfejsowe sk-*: zakładki, otwarcie i zamknięcie arkusza, pola i chipy zlecenia, powtórka misji', () => {
  const st = {};
  const apply = (act, ds) => { const r = skUiAction(G, st, act, ds); assert.ok(r, act); Object.assign(st, r.ui); return r; };
  apply('sk-tab', { t: 'wolni' });
  assert.equal(st.skTab, 'wolni');
  apply('sk-tab', { t: 'zle' });
  assert.equal(st.skTab, 'misje');
  const view = scoutingView(G);
  apply('sk-open-order', { region: keys[4] });
  assert.equal(st.skSheet, true);
  assert.equal(st.skOrder.region, keys[4]);
  assert.equal(st.skOrder.weeks, 2);
  if (view.scouts.length) assert.ok(st.skOrder.scoutId);
  apply('sk-set', { k: 'weeks', v: '4' });
  assert.equal(st.skOrder.weeks, 4);
  apply('sk-set', { k: 'pos', v: 'NAP' });
  assert.equal(st.skOrder.pos, 'NAP');
  apply('sk-set', { k: 'level', v: 'starter' });
  apply('sk-set', { k: 'contract', v: 'free' });
  assert.equal(st.skOrder.contract, 'free');
  apply('sk-close-order', {});
  assert.equal(st.skSheet, false);
  apply('sk-freg', { r: keys[1] });
  assert.equal(st.skFilter.reg, keys[1]);
  apply('sk-fire-ask', { id: 's1' });
  assert.deepEqual(st.skAsk, { kind: 'fire', id: 's1' });
  apply('sk-ask-no', {});
  assert.equal(st.skAsk, null);
  assert.equal(skUiAction(G, st, 'sk-start', {}), null, 'akcje logiki nie są interfejsowe');
  assert.equal(skUiAction(G, st, 'sk-watch', {}), null);
  const m = { scoutId: 's2', freelance: false, region: keys[2], pos: 'ŚP', ageFrom: 19, ageTo: 24, level: 'perspektywa', maxFee: 2e6, maxWage: 2e4, contract: 'any', weeks: 2 };
  const o = orderFromMission(rich(), m, 4);
  assert.equal(o.weeks, 4);
  assert.equal(o.scoutId, 's2');
  assert.equal(orderFromMission(rich(), { ...m, freelance: true }).scoutId, undefined);
});

test('Pola zlecenia: wiek w granicach, kwoty ze spacjami, zmiana skauta', () => {
  let o = { scoutId: 's1', ageFrom: 19, ageTo: 24, maxFee: 1, maxWage: 1 };
  o = setOrderField(o, 'ageFrom', '30');
  assert.deepEqual([o.ageFrom, o.ageTo], [30, 30]);
  o = setOrderField(o, 'ageTo', '18');
  assert.deepEqual([o.ageFrom, o.ageTo], [18, 18]);
  o = setOrderField(o, 'ageFrom', '3');
  assert.equal(o.ageFrom, 16);
  o = setOrderField(o, 'maxFee', '2 500 000 zł');
  assert.equal(o.maxFee, 2500000);
  o = setOrderField(o, 'maxWage', 'abc');
  assert.equal(o.maxWage, 0);
  o = setOrderField(o, 'scout', 'f:f2');
  assert.equal(o.freeScoutId, 'f2');
  assert.equal(o.scoutId, undefined);
  o = setOrderField(o, 'scout', 's:s1');
  assert.deepEqual([o.scoutId, o.freeScoutId], ['s1', undefined]);
});

test('Karta zawodnika z kandydata: w zakładce Skauting tf-open otwiera kartę transferową i wraca przyciskiem Zamknij', () => {
  const html = renderTransfers(G, { tfTab: 'skauting', tfPlayer: pid });
  assert.match(html, /data-act="tf-close"/);
  clean(html, 'karta zawodnika');
});
