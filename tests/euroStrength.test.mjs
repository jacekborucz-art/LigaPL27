// Siła polskiej piłki na tle Europy (docs/sila-lig-europy.md): kotwice skali (najsilniejsza i najsłabsza liga),
// wyniki polskich klubów w pucharach UEFA w wielu symulowanych sezonach i reprezentacja Polski.
// Pasma pochodzą z rzeczywistości 2021/22-2026/27 (rozdz. 2 dokumentu) z zapasem na losowość próby.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUefa, uefaDay, countryOf, leagueTable, ORDER, UCOMPS, UEFA_CLUBS, STRENGTH_SCALE, foreignStrengthAdj, FOREIGN_ADJ_MAX,
  COUNTRY_COEF_2026, allocateEntrants, ENTRY_SLOTS,
} from '../src/season/uefa.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { anyClub } from '../src/season/season.js';
import { ephemeralSquad } from '../src/world/ephemeral.js';
import { quickMatch, quickKnockout } from '../src/engine/quickSim.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { addDays } from '../src/core/gameLoop.js';
import { Rng } from '../src/core/rng.js';
import { SEASON } from '../src/config/calendar2026.js';
import { createNational, nationalDay, ntTeam, NT } from '../src/season/national.js';

const TOP5 = new Set(['ENG', 'ESP', 'ITA', 'GER', 'FRA']);
const MID = new Set(['POR', 'NED', 'BEL', 'TUR']);
const band = (cc) => (TOP5.has(cc) ? 'top5' : MID.has(cc) ? 'mid' : (COUNTRY_COEF_2026[cc] ?? 0) >= 15 ? 'peer' : 'weak');
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const isPolish = (id) => !!clubById(id);

test('Kotwice skali: najsilniejsza liga > Ekstraklasa > najsłabsza liga', () => {
  const S = STRENGTH_SCALE;
  const ek = CLUBS_PL.filter((c) => c.tier === 1);
  const ekAvg = mean(ek.map((c) => c.L));
  const ekTop = Math.max(...ek.map((c) => c.L));
  assert.ok(S.top.avgL > S.ekstraklasa.avgL && S.ekstraklasa.avgL > S.bottom.avgL);
  assert.ok(Math.abs(ekAvg - S.ekstraklasa.avgL) < 0.3, `średnia Ekstraklasy ${ekAvg.toFixed(2)}`);
  assert.equal(ekTop, S.ekstraklasa.topL);
  // Ekstraklasa na skali 0-100 (San Marino = 0, Premier League = 100): średnia ok. 60, czołówka ok. 75
  const pos = (L) => (100 * (L - S.bottom.avgL)) / (S.top.avgL - S.bottom.avgL);
  assert.ok(pos(ekAvg) > 50 && pos(ekAvg) < 70, `Ekstraklasa ${pos(ekAvg).toFixed(0)}`);
  assert.ok(pos(ekTop) > 65 && pos(ekTop) < 85, `czołówka ${pos(ekTop).toFixed(0)}`);
  // Kluby z pliku: każdy klub z ligi top 5 silniejszy od średniej Ekstraklasy, przeciętny angielski od polskiej czołówki
  const of = (cc) => UEFA_CLUBS.filter((c) => c.country === cc);
  for (const c of UEFA_CLUBS.filter((x) => TOP5.has(x.country))) assert.ok(c.L > S.ekstraklasa.avgL, c.id);
  assert.ok(mean(of('ENG').map((c) => c.L)) > ekTop + 1.5);
  // Kluby z federacji o współczynniku poniżej 10 (Gibraltar, Andora, Wyspy Owcze, Malta...) słabsze od średniej Ekstraklasy
  for (const c of UEFA_CLUBS.filter((x) => (COUNTRY_COEF_2026[x.country] ?? 0) < 10)) assert.ok(c.L < S.ekstraklasa.avgL, c.id);
  assert.ok(Math.max(...UEFA_CLUBS.map((c) => c.L)) <= S.top.bestL + 0.2);
});

test('Korekta klubów zagranicznych: zero na krańcach skali, najwyżej FOREIGN_ADJ_MAX w środku', () => {
  assert.equal(foreignStrengthAdj(8.8), 0);
  assert.equal(foreignStrengthAdj(16.6), 0);
  assert.equal(foreignStrengthAdj(12), FOREIGN_ADJ_MAX);
  for (let L = 7; L <= 17; L += 0.1) assert.ok(foreignStrengthAdj(L) >= 0 && foreignStrengthAdj(L) <= FOREIGN_ADJ_MAX + 1e-9);
  for (const c of UEFA_CLUBS) assert.ok(c.L >= c.Lbase && c.L - c.Lbase <= FOREIGN_ADJ_MAX + 0.05, c.id);
});

test('Rundy wejścia: rozmiary zgodne z listą dostępu gry, polskie kluby w swoich rundach', () => {
  const e = allocateEntrants();
  for (const comp of UCOMPS) for (const [r, n] of Object.entries(ENTRY_SLOTS[comp])) assert.equal(e[comp][r].length, n, `${comp} ${r}`);
  // faza ligowa LK prawie w całości z eliminacji (w rzeczywistości 0 miejsc bezpośrednich)
  assert.ok(ENTRY_SLOTS.LK.league <= 12);
  // w eliminacjach LM polski mistrz trafia na kluby o realnej sile (Dinamo, Crvena zvezda, Lyon...), nie tylko na odpadłych
  const lmQual = [...e.LM.Q2, ...e.LM.Q3].filter((id) => !isPolish(id));
  assert.ok(mean(lmQual.map((id) => anyClub(id).L)) > 12, 'za słabi rywale w LM Q2-Q3');
});

// Izolowany sezon pucharów: mecze polskich klubów jak w grze (kadry ze świata vs kadry klubów zagranicznych, szybka symulacja).
function runSeason(seed) {
  const world = generateWorld(seed);
  const squad = (id) => (world.clubs[id] ? squadOf(world, id) : ephemeralSquad(anyClub(id), SEASON));
  const U = createUefa(seed);
  const rng = new Rng(`sila-europy:${seed}`);
  const games = [];
  const opts = { isPolish, scorersFor: () => [] };
  for (let d = '2026-07-01'; d <= '2027-06-10'; d = addDays(d, 1)) {
    uefaDay(U, d, opts);
    for (const m of Object.values(U.matches)) {
      if (m.date !== d || m.played || !(isPolish(m.home) || isPolish(m.away))) continue;
      const H = { squad: squad(m.home) }; const A = { squad: squad(m.away) };
      const fl = m.leg === 2 ? (() => { const m1 = U.matches[m.id.replace(/-2$/, '-1')]; return [m1.result.score[1], m1.result.score[0]]; })() : null;
      const r = m.round === 'F' ? quickKnockout(H, A, { neutral: true }, rng, 'single') : fl ? quickKnockout(H, A, {}, rng, { firstLeg: fl }) : quickMatch(H, A, {}, rng);
      m.played = true;
      m.result = { score: [...r.score], extraTime: !!r.extraTime, shootout: r.shootout ?? null };
      for (const s of [0, 1]) {
        const me = s ? m.away : m.home; const op = s ? m.home : m.away;
        if (isPolish(me) && !isPolish(op)) games.push({ band: band(countryOf(op)), gf: r.score[s], ga: r.score[1 - s] });
      }
    }
    uefaDay(U, d, opts);
  }
  return { U, games };
}

const STAGES = ['Q1', 'Q2', 'Q3', 'PO', 'league', 'KPO', 'R16', 'QF', 'SF', 'F', 'W'];
function deepest(U) {
  const best = new Map();
  const note = (id, comp, st) => {
    const score = STAGES.indexOf(st) + (STAGES.indexOf(st) >= 4 ? { LM: 30, LE: 20, LK: 10 }[comp] : 0);
    if (!best.has(id) || best.get(id).score <= score) best.set(id, { comp, st, score });
  };
  for (const comp of UCOMPS) {
    for (const r of ORDER[comp]) {
      if (r === 'league') { for (const id of U.comps[comp].league?.teams.filter(isPolish) ?? []) note(id, comp, 'league'); continue; }
      for (const t of U.comps[comp].rounds[r].ties) for (const id of [t.a, t.b]) if (isPolish(id)) note(id, comp, r);
    }
    if (isPolish(U.comps[comp].champion)) note(U.comps[comp].champion, comp, 'W');
  }
  return [...best.values()];
}

test('Polskie kluby w pucharach (40 sezonów, stałe ziarna): wyniki w pasmach z rzeczywistości', () => {
  const N = 40;
  const seasons = Array.from({ length: N }, (_, i) => runSeason(31000 + i));
  const games = seasons.flatMap((s) => s.games);
  const rate = (b, f) => { const g = games.filter((x) => x.band === b); return g.filter(f).length / g.length; };
  const win = (g) => g.gf > g.ga;
  // Mecze: z ligami top 5 rzadko wygrywamy, ze słabymi zwykle tak (rzeczywistość: ok. 20 % i ok. 75 %)
  assert.ok(rate('top5', win) < 0.25, `wygrane z top 5: ${rate('top5', win).toFixed(2)}`);
  assert.ok(rate('top5', (g) => g.gf < g.ga) > 0.55);
  assert.ok(rate('weak', win) > 0.6, `wygrane ze słabymi: ${rate('weak', win).toFixed(2)}`);
  assert.ok(rate('peer', win) > 0.22 && rate('peer', win) < 0.5, `wygrane z równymi: ${rate('peer', win).toFixed(2)}`);
  // Przebieg: fazy ligowe (rzeczywistość ok. 2-2,6 na sezon przy 5 klubach), awans do LM rzadki, półfinał wyjątkowy
  const paths = seasons.map((s) => deepest(s.U));
  const lp = paths.flat().filter((p) => STAGES.indexOf(p.st) >= 4).length / N;
  const share = (pred) => paths.filter((ps) => ps.some(pred)).length / N;
  const lm = share((p) => p.comp === 'LM' && STAGES.indexOf(p.st) >= 4);
  const qf = share((p) => STAGES.indexOf(p.st) >= STAGES.indexOf('QF'));
  const sf = share((p) => STAGES.indexOf(p.st) >= STAGES.indexOf('SF'));
  const fin = share((p) => STAGES.indexOf(p.st) >= STAGES.indexOf('F'));
  assert.ok(lp >= 1.6 && lp <= 3.3, `fazy ligowe na sezon: ${lp}`);
  assert.ok(lm <= 0.35, `faza ligowa LM w ${lm} sezonów`);
  assert.ok(qf <= 0.35, `ćwierćfinał w ${qf} sezonów`);
  assert.ok(sf <= 0.1, `półfinał w ${sf} sezonów`);
  assert.ok(fin <= 0.05, `finał w ${fin} sezonów`);
  // Punkty fazy ligowej LK (6 meczów): rzeczywistość 2022-2026 ok. 1,4-1,8 pkt na mecz
  const lkPts = seasons.flatMap((s) => {
    const L = s.U.comps.LK.league; if (!L) return [];
    const t = leagueTable(s.U, 'LK'); return L.teams.filter(isPolish).map((id) => t.find((r) => r.id === id).pts);
  });
  if (lkPts.length >= 10) assert.ok(mean(lkPts) / 6 > 0.9 && mean(lkPts) / 6 < 2.0, `LK pkt/mecz ${(mean(lkPts) / 6).toFixed(2)}`);
});

test('Reprezentacja Polski: pasmo rankingu (ok. 20.-25. w Europie), wyniki z czołówką i ze słabymi', () => {
  const uefa = NT.filter((t) => t.konfederacja === 'UEFA').sort((a, b) => b.L - a.L);
  const rank = uefa.findIndex((t) => t.kod === 'POL') + 1;
  assert.ok(rank >= 15 && rank <= 30, `Polska ${rank}. w Europie wg L`);
  const acc = { top: [0, 0], weak: [0, 0] };
  for (let s = 1; s <= 60; s++) {
    const N = createNational(`sila-kadry:${s}`);
    for (let d = '2026-09-01'; d <= '2027-06-20'; d = addDays(d, 1)) nationalDay(N, d, {});
    for (const m of Object.values(N.matches)) {
      if (!m.played || (m.home !== 'POL' && m.away !== 'POL')) continue;
      const side = m.home === 'POL' ? 0 : 1; const opp = side ? m.home : m.away;
      const fifa = ntTeam(opp)?.rankingFIFA ?? 999;
      const k = fifa <= 15 ? 'top' : fifa > 120 ? 'weak' : null;
      if (!k) continue;
      acc[k][0]++; if (m.result.score[side] > m.result.score[1 - side]) acc[k][1]++;
    }
  }
  if (acc.top[0]) assert.ok(acc.top[1] / acc.top[0] < 0.3, `wygrane z top 15 FIFA: ${(acc.top[1] / acc.top[0]).toFixed(2)}`);
  if (acc.weak[0]) assert.ok(acc.weak[1] / acc.weak[0] > 0.75, `wygrane ze słabymi: ${(acc.weak[1] / acc.weak[0]).toFixed(2)}`);
});
