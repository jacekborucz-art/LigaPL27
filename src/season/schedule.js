// Terminarz lig: 34 kolejki (mecz i rewanż) metodą „po kole”, daty kolejek w weekendy
// z pominięciem okien FIFA (Ekstraklasa) i przerwy zimowej, rozłożenie meczów kolejki na dni i godziny.

import { addDays } from '../core/gameLoop.js';

/** Pary kolejek metodą „po kole” dla parzystej liczby drużyn; druga runda to lustro pierwszej. */
export function roundRobin(teams, rng) {
  const ids = rng ? rng.shuffle(teams) : teams.slice();
  const n = ids.length;
  if (n % 2) throw new Error('Liczba drużyn musi być parzysta');
  const fixed = ids[0];
  let rot = ids.slice(1);
  const first = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    const left = [fixed, ...rot.slice(0, n / 2 - 1)];
    const right = rot.slice(n / 2 - 1).reverse();
    for (let i = 0; i < n / 2; i++) {
      const a = left[i]; const b = right[i];
      // Naprzemiennie gospodarz/gość, żeby nie było długich serii u siebie albo na wyjeździe
      round.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    first.push(round);
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  const second = first.map((round) => round.map(([h, a]) => [a, h]));
  return [...first, ...second];
}

const dow = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 niedziela, 5 piątek
const inRange = (d, w) => d >= w.from && d <= w.to;

/** Piątki (kotwice kolejek) od start do end, z pominięciem okien. */
export function fridays(start, end, skip = []) {
  let d = start;
  while (dow(d) !== 5) d = addDays(d, 1);
  const out = [];
  for (; d <= end; d = addDays(d, 7)) {
    const weekend = [d, addDays(d, 1), addDays(d, 2)]; // piątek-niedziela; poniedziałek przesuwa buildLeague
    if (weekend.some((x) => skip.some((w) => inRange(x, w)))) continue;
    out.push(d);
  }
  return out;
}

/**
 * Daty kolejek ligi: autumnRounds kolejek jesienią (od start), reszta wiosną (od springStart do end).
 * Gdy brakuje weekendów, dokłada kolejki w środku tygodnia (środa).
 */
export function roundDates({ start, autumnEnd, springStart, end, rounds = 34, skip = [] }) {
  const autumn = fridays(start, autumnEnd, skip);
  const spring = fridays(springStart, end, skip);
  const springRounds = Math.min(spring.length, Math.floor(rounds / 2) - 1);
  let autumnRounds = rounds - springRounds;
  let a = autumn.slice(0, autumnRounds);
  // Za mało weekendów jesienią: kolejki w środy, od października (latem są eliminacje UEFA), od końca
  for (let i = autumn.length - 2; a.length < autumnRounds && i >= 0; i--) {
    const wed = addDays(autumn[i], 5);
    if (wed >= `${start.slice(0, 4)}-10-01` && !skip.some((w) => inRange(wed, w))) a.push(wed);
  }
  a = a.sort();
  autumnRounds = a.length;
  const s = spring.slice(0, rounds - autumnRounds);
  if (a.length + s.length < rounds) throw new Error('Za mało terminów na kolejki');
  return [...a, ...s];
}

// Rozkład meczów kolejki na dni i godziny (piątek = kotwica). [SZAC, wzór Ekstraklasy]
const SLOTS = {
  1: [[0, '18:00'], [0, '20:30'], [1, '14:45'], [1, '17:30'], [1, '20:15'], [2, '12:15'], [2, '14:45'], [2, '17:30'], [3, '19:00']],
  2: [[0, '18:00'], [0, '20:30'], [1, '12:40'], [1, '15:00'], [1, '17:30'], [2, '12:40'], [2, '15:00'], [2, '17:30'], [2, '19:45']],
  3: [[1, '12:00'], [1, '14:00'], [1, '16:00'], [1, '17:00'], [1, '18:00'], [2, '12:00'], [2, '14:00'], [2, '15:00'], [2, '16:00']],
};

/**
 * Pełny terminarz ligi. busy(clubId, date) -> true, gdy klub ma w pobliżu inny mecz (np. puchar);
 * wtedy jego mecz trafia na późniejszy dzień kolejki (minimum 2 dni przerwy).
 */
export function buildLeague({ comp, tier, clubs, dates, rng, busy = () => false, simultaneousLast = 2, skip = [] }) {
  const rounds = roundRobin(clubs, rng);
  const fixtures = [];
  rounds.forEach((pairs, r) => {
    const anchor = dates[r];
    const midweek = dow(anchor) !== 5;
    const slots = rng.shuffle(SLOTS[tier] ?? SLOTS[1]);
    pairs.forEach(([home, away], i) => {
      let [off, time] = midweek ? [0, i % 2 ? '20:30' : '18:00'] : slots[i % slots.length];
      if (r >= rounds.length - simultaneousLast) { off = midweek ? 0 : 1; time = '17:30'; } // ostatnie kolejki jednocześnie
      const blocked = (d) => skip.some((w) => inRange(d, w));
      let date = addDays(anchor, off);
      if (blocked(date)) date = addDays(anchor, 2); // poniedziałek w oknie FIFA -> niedziela
      for (let k = 0; k < 3 && (busy(home, date) || busy(away, date)); k++) {
        const later = addDays(date, 1);
        if (later > addDays(anchor, midweek ? 1 : 3) || blocked(later)) break;
        date = later;
      }
      fixtures.push({ id: `${comp}-${r + 1}-${i + 1}`, comp, round: r + 1, date, time, home, away, played: false });
    });
  });
  return fixtures;
}
