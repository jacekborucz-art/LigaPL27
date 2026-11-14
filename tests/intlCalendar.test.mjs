// Wieczny kalendarz reprezentacji (src/season/intl/windows.js): okna FIFA na każdy rok, zgodność z kalendarzem
// ligi i pucharów (docs/kalendarz-reprezentacji.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { yearWindows, seasonWindows, tourPeriod, tournamentOf, windowDays, dowIso } from '../src/season/intl/windows.js';
import { setSeasonYear, DOMESTIC, UEFA, FIFA_WINDOWS } from '../src/config/calendar2026.js';
import { createSeason } from '../src/season/season.js';

const inW = (d, ws) => ws.some((w) => d >= w.from && d <= w.to);

test('Okna FIFA w każdym roku 2027-2130: liczba, długość, dni tygodnia, turniej w latach parzystych', () => {
  for (let y = 2027; y <= 2130; y++) {
    const ws = yearWindows(y);
    const kinds = ws.map((w) => w.kind);
    const t = tournamentOf(y);
    if (t) {
      assert.deepEqual(kinds, ['mar', 'prep', 'tour', 'sepoct', 'nov'], `${y}`);
      const tour = tourPeriod(y);
      assert.equal(tour.tour, t);
      assert.ok(tour.from > ws.find((w) => w.kind === 'prep').to, `${y}: turniej po sparingach`);
      assert.ok(tour.from >= `${y}-06-01` && tour.to <= `${y}-07-25`, `${y}: turniej ${tour.from}-${tour.to}`);
    } else assert.deepEqual(kinds, ['mar', 'jun', 'sepoct', 'nov'], `${y}`);
    const matches = ws.reduce((s, w) => s + (w.matches ?? 0), 0);
    assert.equal(matches, 10, `${y}: 10 dni meczowych`);
    for (const w of ws) {
      assert.ok(w.note, `${y} ${w.kind}: opis`);
      if (!w.matches) continue;
      if (y > 2030) assert.equal(dowIso(w.from), 1, `${y} ${w.kind}: od poniedziałku`);
      assert.equal(windowDays(w).length, w.matches);
      for (const d of windowDays(w)) assert.ok(d >= w.from && d <= w.to);
    }
    assert.ok(ws.find((w) => w.kind === 'mar').from.slice(5, 7) === '03');
    assert.ok(ws.find((w) => w.kind === 'sepoct').from.slice(5, 7) === '09');
    assert.ok(ws.find((w) => w.kind === 'nov').from.slice(5, 7) === '11');
  }
});

for (const y of [2031, 2040, 2075, 2126]) {
  test(`Sezon ${y}/${String(y + 1).slice(2)}: Ekstraklasa, Puchar Polski i puchary UEFA poza oknami, sezon mieści się w lipcu-czerwcu`, () => {
    setSeasonYear(y, { windows: seasonWindows(y) });
    try {
      assert.equal(FIFA_WINDOWS.length, 4, 'cztery okna z meczami w sezonie (IX-X, XI, III, VI)');
      const s = createSeason(7);
      const ek = s.fixtures.filter((f) => f.comp === 'ekstraklasa');
      assert.equal(ek.length, 306);
      for (const f of ek) assert.ok(!inW(f.date, FIFA_WINDOWS), `${f.id} ${f.date} w oknie FIFA`);
      for (const f of s.fixtures) assert.ok(f.date >= `${y}-07-01` && f.date <= `${y + 1}-06-30`, `${f.id} ${f.date}`);
      for (const r of DOMESTIC.pucharPolski.rounds) assert.ok(!inW(r.date, FIFA_WINDOWS), `PP ${r.id} ${r.date}`);
      for (const comp of Object.values(UEFA)) for (const v of Object.values(comp)) for (const d of [].concat(v)) assert.ok(!inW(d, FIFA_WINDOWS), `UEFA ${d}`);
      // Okres turnieju (lato) nie zachodzi na rundę wiosenną
      const t = tourPeriod(y + 1);
      if (t) assert.ok(DOMESTIC.ekstraklasa.end < t.from);
    } finally { setSeasonYear(2026); }
  });
}

test('Kalendarz każdego sezonu 2027-2130: kolejki Ekstraklasy, Puchar Polski i UEFA nie kolidują z oknami', () => {
  try {
    for (let y = 2027; y <= 2130; y++) {
      const ws = seasonWindows(y);
      setSeasonYear(y, { windows: ws });
      for (const r of DOMESTIC.pucharPolski.rounds) assert.ok(!inW(r.date, ws), `${y} PP ${r.id}`);
      for (const comp of Object.values(UEFA)) for (const v of Object.values(comp)) for (const d of [].concat(v)) assert.ok(!inW(d, ws), `${y} UEFA ${d}`);
      assert.equal(ws.filter((w) => w.kind === 'sepoct').length, 1, `${y}`);
    }
  } finally { setSeasonYear(2026); }
});
