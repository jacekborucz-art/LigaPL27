// Superpuchar Europy: prawdziwe stadiony 2026-2028, duże stadiony później, data, udział polskiego klubu, mecz w tle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { europeDay } from '../src/season/europe.js';
import { superCupEUVenue, superCupEUDate, BIG_STADIUMS, HOLDERS_2026, simulateSuperCupEU, createSuperCupEU } from '../src/season/superCupEU.js';
import { uefaL, simByStrength } from '../src/season/uefa.js';

test('Stadiony: 2026 Salzburg, 2027 Amsterdam, 2028 Astana, potem duże stadiony bez powtórki w 6 lat', () => {
  assert.equal(superCupEUVenue(2026).city, 'Salzburg');
  assert.equal(superCupEUVenue(2027).stadium, 'Johan Cruyff ArenA');
  assert.equal(superCupEUVenue(2028).city, 'Astana');
  const names = new Set(BIG_STADIUMS.map((s) => s.stadium));
  const seq = [];
  for (let y = 2029; y <= 2045; y++) {
    const v = superCupEUVenue(y);
    assert.ok(names.has(v.stadium) && v.cap >= 55000, `${y}: ${v.stadium}`);
    seq.push(v.stadium);
  }
  for (let i = 0; i < seq.length; i++) assert.ok(!seq.slice(Math.max(0, i - 5), i).includes(seq[i]), `powtórka ${seq[i]}`);
  assert.equal(superCupEUVenue(2033).stadium, superCupEUVenue(2033).stadium);
});

test('Data: środa w połowie sierpnia (2026: 12 sierpnia, 2027: 11 sierpnia)', () => {
  assert.equal(superCupEUDate(2026), '2026-08-12');
  assert.equal(superCupEUDate(2027), '2027-08-11');
  for (let y = 2026; y < 2040; y++) assert.equal(new Date(`${superCupEUDate(y)}T12:00:00Z`).getUTCDay(), 3);
});

test('Sezon 2026/27: PSG - Aston Villa w tle; polski klub dostaje mecz w terminarzu (karne bez dogrywki)', () => {
  const s = createSeason(3, { playerClub: 'widzew' });
  assert.equal(s.superCupEU.home, HOLDERS_2026.LM);
  assert.equal(s.superCupEU.away, HOLDERS_2026.LE);
  assert.ok(!s.fixtures.some((f) => f.id === s.superCupEU.id));
  const pl = createSeason(3, { playerClub: 'widzew', uefaHolders: { LM: 'legia', LE: 'aston-villa' } });
  const f = pl.fixtures.find((x) => x.id === pl.superCupEU.id);
  assert.ok(f && f.neutral && f.knockout === 'penaltiesOnly' && f.label === 'Superpuchar Europy' && f.venue.includes('Salzburg'));
});

test('Mecz w tle: wynik, zwycięzca, wiadomość w dniu meczu; remis rozstrzygają karne', () => {
  const g = { seed: 4, clubId: 'widzew', date: '2026-08-12', inbox: [] };
  g.world = generateWorld(4);
  g.season = createSeason(4, { playerClub: 'widzew' });
  g.fixtures = g.season.fixtures;
  assert.equal(europeDay(g, '2026-08-11').some((m) => /Superpuchar Europy/.test(m.subject)), false);
  const msgs = europeDay(g, '2026-08-12');
  const sc = g.season.superCupEU;
  assert.ok(sc.played && [sc.home, sc.away].includes(sc.winner));
  assert.ok(msgs.some((m) => /Superpuchar Europy/.test(m.subject) && /Salzburg/.test(m.body)));
  let draws = 0;
  for (let y = 2030; y < 2130; y++) {
    const r = simulateSuperCupEU(createSuperCupEU(y, HOLDERS_2026), uefaL, simByStrength);
    if (r.score[0] === r.score[1]) { draws++; assert.ok(r.shootout && r.shootout[0] !== r.shootout[1] && !r.extraTime); }
  }
  assert.ok(draws > 5, `remisy ${draws}`);
});
