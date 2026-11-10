import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { addDays } from '../src/core/gameLoop.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { KIBICE } from '../src/data/kibice.js';
import { createSeason } from '../src/season/season.js';
import {
  ensureFans, fansAfterMatch, fansMonth, fansDay, attendanceModifier, fanProfile, rivalry, fanMoodLabel, fansSummary,
  checkStars, FANS, LEVELS,
} from '../src/career/fans.js';
import '../src/career/fansSystem.js';

function newGame(clubId, seed = 1) {
  return { seed, clubId, date: '2026-07-20', season: { seasonId: '2026/27' }, fixtures: [], inbox: [], board: { trust: 60, fansMood: 55 } };
}

/** Seria meczów: klub przegrywa u siebie 0:3 z rywalami o podobnej sile. */
function badRun(game, clubId, opponents, comp, n = 10) {
  const msgs = [];
  let date = '2026-08-01';
  for (let i = 0; i < n; i++) {
    const f = { id: `t-${clubId}-${i}`, comp, round: i + 1, date, home: clubId, away: opponents[i % opponents.length], played: true, result: { score: [0, 3] } };
    game.fixtures.push(f);
    msgs.push(...fansAfterMatch(game, f));
    date = addDays(date, 7);
  }
  return msgs;
}

const protestMsgs = (msgs) => msgs.filter((m) => m.refs?.kind === 'fans');

test('Dane kibiców: profil dla każdego klubu z clubs_pl.js, rywalizacje i derby', () => {
  for (const c of CLUBS_PL) {
    assert.ok(KIBICE[c.id], `brak danych kibiców: ${c.id}`);
    const p = fanProfile(c.id);
    assert.ok(p.size >= 1 && p.size <= 5 && p.ultras >= 1 && p.ultras <= 5, c.id);
    assert.ok(p.maxLevel >= 1 && p.maxLevel <= 8, c.id);
  }
  assert.equal(fanProfile('legia').maxLevel, 8);
  assert.ok(fanProfile('sokol-kleczew').maxLevel <= 2);
  assert.equal(fanProfile('legia-ii').maxLevel, 1, 'rezerwy nie protestują');
  assert.equal(rivalry('wisla-krakow', 'cracovia'), 3);
  assert.equal(rivalry('cracovia', 'wisla-krakow'), 3);
  assert.equal(rivalry('piast', 'gks-katowice'), 1, 'derby lokalne z regionu');
  assert.equal(rivalry('legia', 'legia-ii'), 0, 'rezerwy to nie derby');
  assert.equal(rivalry('lech', 'motor'), 0);
  assert.equal(fanMoodLabel(90), 'Euforia');
  assert.equal(fanMoodLabel(10), 'Bunt na trybunach');
});

test('Ta sama zła seria: wielki klub protestuje mocniej i głośniej niż mały', () => {
  const big = newGame('legia');
  const small = newGame('sokol-kleczew');
  const mb = badRun(big, 'legia', ['lech', 'rakow', 'jagiellonia'], 'ekstraklasa');
  const ms = badRun(small, 'sokol-kleczew', ['rekord', 'lechia-zg', 'swit'], 'liga2');
  const Cb = big.fans.clubs.legia; const Cs = small.fans.clubs['sokol-kleczew'];
  assert.ok(Cb.heat > Cs.heat * 1.8, `presja ${Cb.heat} vs ${Cs.heat}`);
  assert.ok(Cb.level >= 5, `Legia powinna dojść co najmniej do bojkotu, jest ${LEVELS[Cb.level].id}`);
  assert.ok(Cs.level <= 2, `mały klub kończy na narzekaniu, jest ${LEVELS[Cs.level].id}`);
  assert.ok(protestMsgs(mb).length > protestMsgs(ms).length);
  assert.ok(protestMsgs(mb).some((m) => /Bojkot|Puste trybuny/.test(m.subject)));
  // Zarząd klubu gracza reaguje mocniej w wielkim klubie
  assert.ok(big.board.trust < 60 && big.board.trust < small.board.trust, `zaufanie ${big.board.trust} vs ${small.board.trust}`);
  assert.ok(big.board.fansMood < small.board.fansMood);
  // Bojkot obniża frekwencję kolejnego meczu u siebie
  const next = { id: 'next', comp: 'ekstraklasa', date: '2026-11-01', home: 'legia', away: 'korona' };
  assert.ok(attendanceModifier(big, 'legia', next) < 0.85);
  // Teksty bez długiej pauzy
  for (const m of [...mb, ...ms]) assert.ok(!/—/.test(m.subject + m.body), m.subject);
});

test('Zaufanie zarządu: protest zmienia je tylko w klubie gracza, kibice AI zmieniają własny nastrój', () => {
  const g = newGame('rakow');
  badRun(g, 'legia', ['lech', 'rakow', 'jagiellonia'], 'ekstraklasa', 8);
  assert.equal(g.board.trust, 60);
  assert.equal(g.board.fansMood, 55);
  assert.ok(g.fans.clubs.legia.mood < 45);
  assert.equal(protestMsgs(g.inbox).length, 0);
});

test('Wygrane studzą presję, a koniec protestu daje wiadomość', () => {
  const g = newGame('legia');
  badRun(g, 'legia', ['lech', 'rakow', 'jagiellonia'], 'ekstraklasa', 8);
  const C = g.fans.clubs.legia;
  const peak = C.heat;
  const msgs = [];
  let date = '2026-10-01';
  for (let i = 0; i < 12; i++) {
    const f = { id: `w-${i}`, comp: 'ekstraklasa', date, home: 'legia', away: 'radomiak', played: true, result: { score: [3, 0] } };
    msgs.push(...fansAfterMatch(g, f));
    date = addDays(date, 7);
  }
  assert.ok(C.heat < peak / 3, `${C.heat} vs ${peak}`);
  assert.equal(C.level, 0);
  assert.ok(msgs.some((m) => m.subject === 'Kibice zawieszają protest'));
});

test('Zamknięty sektor, mecz bez publiczności i zakaz wyjazdów obniżają frekwencję, kara zużywa się na meczu', () => {
  const g = newGame('rakow');
  ensureFans(g);
  const f = { id: 'm1', comp: 'ekstraklasa', date: '2026-08-10', home: 'legia', away: 'korona' };
  const base = attendanceModifier(g, 'legia', f);
  assert.ok(base > 0.9 && base < 1.1);
  g.fans.clubs.legia.sanctions.push({ kind: 'sector', scope: 'domestic', left: 1, share: 0.23, after: '2026-08-01' });
  const closed = attendanceModifier(g, 'legia', f);
  assert.ok(Math.abs(closed - base * 0.77) < 0.01, `${closed} vs ${base}`);
  // Kara krajowa nie dotyczy meczu w pucharach UEFA
  assert.equal(attendanceModifier(g, 'legia', { ...f, comp: 'uefa' }), base);
  // Kara nałożona po meczu nie działa na ten sam mecz
  assert.equal(attendanceModifier(g, 'legia', { ...f, date: '2026-08-01' }), base);
  // Mecz rozegrany: sektor otwarty na kolejny mecz
  fansAfterMatch(g, { ...f, played: true, result: { score: [1, 1] } });
  assert.equal(g.fans.clubs.legia.sanctions.filter((s) => s.kind === 'sector').length, 0);
  // Bez publiczności
  g.fans.clubs.legia.sanctions.push({ kind: 'noFans', scope: 'domestic', left: 1, after: '2026-08-11' });
  assert.equal(attendanceModifier(g, 'legia', { ...f, id: 'm2', date: '2026-08-20' }), 0);
  g.fans.clubs.legia.sanctions = [];
  // Zakaz wyjazdów kibiców gości: pusty sektor gości, mocniej w derbach
  const m0 = attendanceModifier(g, 'wisla-krakow', { id: 'm3', comp: 'ekstraklasa', date: '2026-09-01', home: 'wisla-krakow', away: 'cracovia' });
  g.fans.clubs.cracovia.sanctions.push({ kind: 'awayBan', scope: 'domestic', left: 2, after: '2026-08-01' });
  const m1 = attendanceModifier(g, 'wisla-krakow', { id: 'm3', comp: 'ekstraklasa', date: '2026-09-01', home: 'wisla-krakow', away: 'cracovia' });
  assert.ok(m1 < m0 - 0.05, `${m1} vs ${m0}`);
});

test('Incydent: kara księgowana w finansach jako fines, wiadomość dla klubu gracza, sankcje w widełkach', () => {
  const g = newGame('legia');
  g.finance = { clubs: { legia: { balance: 1e6, ledger: {}, log: [] }, polonia: null } };
  const old = FANS.RARITY;
  FANS.RARITY = 100; // wymuszenie incydentu (p ograniczone do 0,6)
  try {
    let msgs = [];
    for (let i = 0; i < 6 && !msgs.some((m) => m.refs?.kind === 'fansFine'); i++) {
      msgs = fansAfterMatch(g, { id: `d-${i}`, comp: 'ekstraklasa', date: addDays('2026-08-01', 7 * i), home: 'legia', away: 'polonia-warszawa', played: true, result: { score: [0, 1] } });
    }
    const fine = msgs.find((m) => m.refs?.kind === 'fansFine');
    assert.ok(fine, 'brak kary');
    assert.equal(fine.category, 'club');
    assert.ok(/Komisja Ligi Ekstraklasy/.test(fine.body));
    const out = Object.values(g.finance.clubs.legia.ledger).reduce((s, m) => s + (m.out.fines ?? 0), 0);
    assert.ok(out > 0 && out < 60000, `kara w grze ${out}`);
    assert.ok(g.finance.clubs.legia.balance < 1e6);
    assert.ok(g.fans.clubs.legia.season.fines >= 1);
  } finally {
    FANS.RARITY = old;
  }
});

test('Kary są rzadkie: sezon wszystkich lig z losowymi wynikami daje realistyczną liczbę incydentów', () => {
  const g = newGame('rakow', 7);
  const season = createSeason(7, { playerClub: 'rakow' });
  g.fixtures = season.fixtures.filter((f) => ['ekstraklasa', 'liga1', 'liga2'].includes(f.comp));
  const rng = new Rng('wyniki-test');
  const L = new Map(CLUBS_PL.map((c) => [c.id, c.L]));
  const poisson = (l) => rng.poisson(Math.max(0.25, l));
  ensureFans(g);
  let day = g.fixtures[0].date.slice(0, 8) + '01';
  for (const f of g.fixtures) {
    while (day < f.date) { day = addDays(day, 1); if (day.endsWith('-01')) fansMonth(g, day); }
    const d = (L.get(f.home) ?? 10) - (L.get(f.away) ?? 10);
    f.played = true; f.result = { score: [poisson(1.45 + 0.3 * d), poisson(1.1 - 0.3 * d)] };
    fansAfterMatch(g, f);
  }
  const stats = (tier) => {
    const ids = CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id);
    const inc = ids.map((id) => g.fans.clubs[id].season.incidents);
    return { avg: inc.reduce((a, b) => a + b, 0) / ids.length, max: Math.max(...inc), noFans: ids.reduce((a, id) => a + g.fans.clubs[id].season.noFans, 0) };
  };
  const [ek, l1, l2] = [1, 2, 3].map(stats);
  // Uzasadnienie widełek: docs/kibice.md rozdz. 4 (świadomie rzadziej niż w rzeczywistości)
  assert.ok(ek.avg >= 0.6 && ek.avg <= 2.6, `Ekstraklasa ${ek.avg}`);
  assert.ok(l1.avg >= 0.1 && l1.avg <= 1.3, `1 Liga ${l1.avg}`);
  assert.ok(l2.avg <= 0.6, `2 Liga ${l2.avg}`);
  assert.ok(ek.avg > l1.avg && l1.avg > l2.avg);
  assert.ok(ek.max <= 9, `najwięcej w EK ${ek.max}`);
  assert.ok(ek.noFans + l1.noFans + l2.noFans <= 3, 'mecz bez publiczności to wyjątek');
  // Protest przeciw zarządowi tylko w klubach, które mogą do niego dojść
  for (const c of CLUBS_PL) assert.ok(g.fans.clubs[c.id].season.maxLevel <= fanProfile(c.id).maxLevel, c.id);
});

test('Deterministycznie: to samo ziarno daje ten sam stan kibiców i te same wiadomości', () => {
  const run = () => {
    const g = newGame('widzew', 42);
    const msgs = [];
    let date = '2026-08-01';
    for (let i = 0; i < 14; i++) {
      const f = { id: `x-${i}`, comp: 'ekstraklasa', date, home: i % 2 ? 'lks' : 'widzew', away: i % 2 ? 'widzew' : 'legia', played: true, result: { score: i % 3 ? [2, 0] : [0, 2] } };
      g.fixtures.push(f);
      msgs.push(...fansDay(g, date));
      date = addDays(date, 6);
    }
    return { fans: JSON.stringify(g.fans), msgs: msgs.map((m) => `${m.date}|${m.subject}|${m.body}`), trust: g.board.trust };
  };
  assert.deepEqual(run(), run());
});

test('Odejście gwiazdy klubu gracza: krytyka kibiców i wzrost presji; podsumowanie do panelu Kibice', () => {
  const g = newGame('legia');
  const players = {}; const squad = [];
  for (let i = 0; i < 6; i++) { players[`p${i}`] = { id: `p${i}`, name: `Zawodnik ${i}`, rep: 60 - i * 5, clubId: 'legia' }; squad.push(`p${i}`); }
  g.world = { players, clubs: { legia: { squad } } };
  assert.equal(checkStars(g, '2026-08-01').length, 0);
  const before = g.fans.clubs.legia.heat;
  g.world.clubs.legia.squad = squad.filter((id) => id !== 'p0');
  const msgs = checkStars(g, '2026-08-05');
  assert.ok(msgs.some((m) => /Zawodnik 0/.test(m.subject)));
  assert.ok(g.fans.clubs.legia.heat > before);
  const s = fansSummary(g);
  assert.equal(s.name, 'Legia Warszawa');
  assert.equal(s.profile.stand, 'Żyleta');
  assert.ok(s.rivals.some((r) => r.id === 'polonia-warszawa'));
  assert.ok(typeof s.moodLabel === 'string' && typeof s.levelLabel === 'string');
  assert.ok(s.recent.some((e) => e.kind === 'starSale'));
});
