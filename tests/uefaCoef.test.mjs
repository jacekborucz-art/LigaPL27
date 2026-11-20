import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRanking, validate, buildData } from '../tools/uefa-ranking-gen.mjs';
import {
  RANKING_DATA, initialCoef, computeCoefs, seasonPoints, closeSeason, shiftWindow, ensureUefaCoef, accessRankForNext,
  startWindowValues, windowValues, countryRank, rankingTables, applyCoefSource, BONUS, GHOST_PTS, nextSeasonLabel,
} from '../src/season/uefaCoef.js';
import { createUefa, coefOf, drawPairs, setCoefSource, uefaDay } from '../src/season/uefa.js';
import { Rng } from '../src/core/rng.js';
import { renderEurope } from '../src/ui/europeView.js';

const TXT = readFileSync(new URL('../tools/data/ranking_uefa_2026_27.txt', import.meta.url), 'utf8');

test('Parser rankingu UEFA: 55 federacji, 415 klubów, Polska 45,725, Legia 28,5, sumy zgodne z plikiem', () => {
  const P = parseRanking(TXT);
  assert.equal(Object.keys(P.countries).length, 55);
  assert.equal(P.clubs.length, 415, 'Paris Saint-Germain powtórzony w pliku liczy się raz');
  assert.deepEqual(P.countries.POL.seasons, [7.75, 6.875, 11.75, 15.75, 3.6]);
  assert.equal(P.countries.POL.sum, 45.725);
  assert.equal(P.countries.POL.place, 12);
  assert.equal(P.countries.POL.entrants, 5);
  const legia = P.clubs.find((c) => c.name === 'Legia Warszawa');
  assert.deepEqual(legia.seasons, [null, 9, 15.5, 4, null]);
  assert.equal(legia.coef, 28.5);
  assert.deepEqual(P.countries.RUS.seasons.at(-1), null);
  assert.deepEqual(validate(P), []);
});

test('Dane w grze zgodne z generatorem; polskie kluby i kluby z pucharów połączone z id gry', () => {
  const { data } = buildData(TXT);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), RANKING_DATA, 'uruchom: node tools/uefa-ranking-gen.mjs');
  const C = RANKING_DATA.clubs;
  for (const [id, name] of [['legia', 'Legia Warszawa'], ['lech', 'KKS Lech Poznań'], ['jagiellonia', 'Jagiellonia Białystok'], ['rakow', 'Raków Częstochowa'], ['gornik-zabrze', 'Górnik Zabrze'], ['slask', 'Śląsk Wrocław'], ['lechia-gdansk', 'KS Lechia Gdańsk']]) {
    assert.equal(C[id]?.name, name, id);
  }
  assert.equal(C.inter.name, 'FC Internazionale Milano');
  assert.equal(C['cska-sofia'].name, 'PFC CSKA Sofia', 'CSKA 1948 to inny klub');
  assert.ok(Object.keys(C).filter((k) => C[k].game).length >= 160);
});

test('Współczynnik klubu = max(punkty własne, 20 % kraju): wzór odtwarza kolumnę „Współcz.” z pliku UEFA dla 415 klubów', () => {
  const P = parseRanking(TXT);
  const clubs = Object.fromEntries(P.clubs.map((c) => [`${c.name}|${c.country}`, c.seasons]));
  const countries = Object.fromEntries(Object.entries(P.countries).map(([k, c]) => [k, c.seasons]));
  // computeCoefs bierze kraj klubu z danych gry; tu klucze spoza danych, więc kraj podajemy przez mapę obok
  const { totals, threshold } = computeCoefs({}, countries);
  assert.equal(totals.get('POL'), 45.725);
  assert.equal(threshold('POL'), 9.145);
  assert.equal(threshold('ENG'), 21.537);
  for (const c of P.clubs) {
    const own = Math.round(clubs[`${c.name}|${c.country}`].reduce((a, b) => a + (b ?? 0), 0) * 1000) / 1000;
    assert.equal(Math.max(own, threshold(c.country)), c.coef, c.name);
  }
  // Pogoń: 3,5 pkt własnych, współczynnik z progu kraju
  const pog = P.clubs.find((c) => c.name === 'MKS Pogoń Szczecin');
  assert.equal(pog.own, 3.5); assert.equal(pog.coef, 9.145);
});

/** Sezon UEFA ze wstrzykniętymi wynikami (bez symulacji). */
function fakeTie(U, comp, round, a, b, legs, loser) {
  const R = U.comps[comp].rounds[round];
  R.drawn = true;
  const tie = { id: `${comp}-${round}-${a}`, comp, round, a, b, legs: [], winner: loser === a ? b : a, loser };
  legs.forEach(([h, aw, s], i) => {
    const id = `${tie.id}-${i + 1}`;
    U.matches[id] = { id, comp, round, played: true, home: h, away: aw, result: { score: s } };
    tie.legs.push(id);
  });
  R.ties.push(tie);
  return tie;
}

test('Punkty sezonu: eliminacje połową dla kraju, stałe punkty odpadłego klubu, faza ligowa LM 6 pkt, kraj = suma / liczba klubów', () => {
  const U = createUefa('wspolczynniki');
  // Lech: LM Q2 z Aarhus (wygrana 4:1 na wyjeździe, porażka 1:4 u siebie), spada do LE Q3 (bez meczów w teście),
  // potem LK PO: remis i porażka, koniec gry w pucharach (jak Górnik w 2026/27: 2,5 pkt)
  fakeTie(U, 'LM', 'Q2', 'aarhus', 'lech', [['aarhus', 'lech', [1, 4]], ['lech', 'aarhus', [1, 4]]], 'lech');
  fakeTie(U, 'LK', 'PO', 'lech', 'monaco', [['lech', 'monaco', [0, 0]], ['monaco', 'lech', [2, 0]]], 'lech');
  const S = seasonPoints(U);
  // Klub: bez punktów z meczów eliminacji, za ostatnią przegraną rundę (PO) 2,5 pkt
  assert.equal(S.clubs.get('lech'), BONUS.qualOut.PO);
  assert.equal(S.clubs.get('aarhus'), 0, 'Aarhus gra dalej: bez punktów za odpadnięcie');
  // Kraj: wygrana 1 pkt + remis 0,5 pkt = 1,5 pkt, 5 polskich klubów w pucharach
  assert.equal(S.entrants.get('POL'), 5);
  assert.equal(S.countries.get('POL'), Math.floor((1.5 / 5) * 1000) / 1000);
  assert.equal(S.alive.get('POL'), 4, 'Lech odpadł z pucharów');
  // Szkocja w grze ma mniej klubów niż w rzeczywistości: brakujące liczone jako odpadające w eliminacjach
  const sco = RANKING_DATA.countries.SCO.entrants;
  assert.ok(S.entrants.get('SCO') === Math.max(sco, S.entrants.get('SCO')));
  // Faza ligowa LM: 6 pkt za udział, mecz 2 pkt, liczone klubowi i krajowi
  const U2 = createUefa('faza');
  U2.comps.LM.league = { teams: ['lech', 'bayern'], pots: [], matches: ['m1'] };
  U2.matches.m1 = { id: 'm1', comp: 'LM', round: 'league', md: 1, played: true, home: 'lech', away: 'bayern', result: { score: [1, 0] } };
  const S2 = seasonPoints(U2);
  assert.equal(S2.clubs.get('lech'), BONUS.league.LM + 2);
  assert.equal(S2.clubs.get('bayern'), BONUS.league.LM);
  assert.equal(S2.countries.get('POL'), Math.floor((8 / 5) * 1000) / 1000);
  // Niemcy: 7 klubów jak w rzeczywistości, punkty Bayernu (6) i pozostałych (0) / 7
  assert.equal(S2.countries.get('GER'), Math.floor((6 / S2.entrants.get('GER')) * 1000) / 1000);
  assert.ok(GHOST_PTS > 0 && GHOST_PTS <= 1.5);
});

test('Pełny sezon w tle: mistrz LM 25-45 pkt, faza ligowa LM co najmniej 6, wartości krajów w skali UEFA', () => {
  const U = createUefa('pelny');
  for (let d = '2026-07-01'; d < '2027-06-10'; d = addDay(d)) uefaDay(U, d, { isPolish: () => false, scorersFor: () => [] });
  const S = seasonPoints(U);
  const champ = U.comps.LM.champion;
  assert.ok(S.clubs.get(champ) >= 25 && S.clubs.get(champ) <= 45, `${champ}: ${S.clubs.get(champ)}`);
  for (const id of U.comps.LM.league.teams) assert.ok(S.clubs.get(id) >= 6, id);
  for (const [cc, v] of S.countries) assert.ok(v >= 0 && v < 30, `${cc}: ${v}`);
  assert.ok(S.countries.get('ENG') > S.countries.get('MLT'));
});

const addDay = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

test('Koniec sezonu: punkty z gry w ostatniej kolumnie, okno przesuwa się o rok, wypadły sezon w prev', () => {
  const C = initialCoef();
  assert.deepEqual(C.seasons, ['2022/23', '2023/24', '2024/25', '2025/26', '2026/27']);
  assert.deepEqual(C.clubs.legia, [null, 9, 15.5, 4, null], 'sezon 2026/27 z pliku zastąpiony wynikami z gry');
  assert.equal(accessRankForNext(C).rank, 12, 'pierwszy przydział: Polska 12. po sezonie 2025/26');
  const U = createUefa('przesuniecie');
  fakeTie(U, 'LM', 'Q2', 'aarhus', 'lech', [['aarhus', 'lech', [1, 4]], ['lech', 'aarhus', [1, 4]]], 'lech');
  closeSeason(C, U);
  assert.equal(C.clubs.lech[4], BONUS.qualOut.Q2);
  assert.ok(C.countries.POL[4] > 0);
  assert.ok(C.countries.SMR[4] != null, 'kraj bez klubów w grze: średnia z okna');
  assert.equal(C.countries.RUS[4], null, 'Rosja zawieszona');
  shiftWindow(C);
  assert.deepEqual(C.seasons, ['2023/24', '2024/25', '2025/26', '2026/27', '2027/28']);
  assert.equal(nextSeasonLabel('2029/30'), '2030/31');
  assert.deepEqual(C.clubs.legia, [9, 15.5, 4, null, null]);
  assert.equal(C.clubs.lech[3], BONUS.qualOut.Q2);
  assert.equal(C.prev.season, '2022/23');
  assert.equal(C.prev.countries.POL, 7.75);
  assert.equal(C.prev.clubs.lech, 14);
  // Ranking po poprzednim sezonie: 2022/23-2026/27; lista dostępu na 2028/29 z niego
  const W = startWindowValues(C);
  assert.deepEqual(W.countries.POL, [7.75, 6.875, 11.75, 15.75, C.countries.POL[3]]);
  assert.equal(accessRankForNext(C).rank, countryRank(W.countries));
  assert.equal(accessRankForNext(C).season, '2026/27');
});

test('Rozstawienia czytają współczynnik z zapisu: po sezonie 2026/27 ranking z gry, w 2026/27 dane startowe', () => {
  applyCoefSource({});
  assert.equal(coefOf('lech'), 31, 'start gry: współczynnik z kluby_uefa.json');
  const g = { seasonYear: 2027 };
  ensureUefaCoef(g);
  const W = startWindowValues(g.uefaCoef);
  const { clubs } = computeCoefs(W.clubs, W.countries);
  assert.equal(coefOf('lech'), clubs.get('lech').coef);
  assert.equal(coefOf('legia'), 28.5, 'Legia: 9 + 15,5 + 4 (+ 0 w 2022/23 i 2026/27)');
  assert.equal(coefOf('widzew'), Math.floor(0.2 * W.countries.POL.reduce((a, b) => a + (b ?? 0), 0) * 1000) / 1000, 'klub bez punktów: 20 % kraju');
  // Losowanie: klub z wyższym współczynnikiem z zapisu jest rozstawiony
  g.uefaCoef.prev.clubs.widzew = 500;
  applyCoefSource(g);
  const pairs = drawPairs(['bayern', 'widzew', 'kups', 'vaduz'], new Rng('los'), { paths: false });
  assert.ok(pairs.some(([seeded]) => seeded === 'widzew'), 'Widzew rozstawiony dzięki współczynnikowi z zapisu');
  applyCoefSource({});
  setCoefSource(null);
});

test('Stary zapis: migracja okna (sezon 2026/27 z danych UEFA), sezon bieżący z gry', () => {
  const g26 = { seasonYear: 2026 };
  ensureUefaCoef(g26);
  assert.equal(g26.uefaCoef.prev, null);
  assert.deepEqual(g26.uefaCoef.seasons.at(-1), '2026/27');
  const g28 = { seasonYear: 2028 };
  ensureUefaCoef(g28);
  assert.deepEqual(g28.uefaCoef.seasons, ['2024/25', '2025/26', '2026/27', '2027/28', '2028/29']);
  assert.equal(g28.uefaCoef.clubs.lech[2], 1, 'Lech 2026/27 z pliku (stan Nov 5, 2026)');
  assert.ok(g28.uefaCoef.countries.POL[3] > 0, '2027/28 bez wyników: średnia z okna');
  assert.equal(g28.uefaCoef.prev.season, '2023/24');
  applyCoefSource({});
});

test('Widok Ranking UEFA: kluby i kraje, polskie wiersze wyróżnione, filtr kraju, zmiana miejsca', () => {
  const U = createUefa('widok');
  fakeTie(U, 'LM', 'Q2', 'aarhus', 'lech', [['aarhus', 'lech', [1, 4]], ['lech', 'aarhus', [1, 4]]], 'lech');
  const game = { clubId: 'lech', season: { uefa: U } };
  const T = rankingTables(game);
  assert.equal(T.countries.length, 55);
  assert.ok(T.clubs.length >= 415);
  const pol = T.countries.find((c) => c.code === 'POL');
  assert.equal(pol.vals.length, 5);
  const html = renderEurope(game, 'LM', { view: 'ranking', rank: 'clubs' });
  assert.match(html, /data-act="urank" data-k="clubs" aria-pressed="true"/);
  assert.match(html, /Próg 20%/);
  assert.match(html, /class="is-me"/, 'klub gracza wyróżniony');
  assert.match(html, /Pokaż wszystkie kluby/);
  const pl = renderEurope(game, 'LM', { view: 'ranking', rank: 'clubs', rankCc: 'POL' });
  assert.equal((pl.match(/<tr class="(is-pl|is-me)"/g) ?? []).length, T.clubs.filter((c) => c.country === 'POL').length);
  const kr = renderEurope(game, 'LM', { view: 'ranking', rank: 'countries' });
  assert.match(kr, /5 sezonów/);
  assert.match(kr, /<tr class="is-pl">/);
  assert.ok(!/\u2014/.test(html + kr), 'bez pauzy em');
  // Stan bieżący bez zmiany zapisu (widok nie tworzy game.uefaCoef)
  assert.equal(game.uefaCoef, undefined);
  assert.ok(windowValues(initialCoef(), U).clubs.lech[4] === BONUS.qualOut.Q2);
});
