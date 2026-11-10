// Terminarz lig: 34 kolejki (mecz i rewanż) metodą „po kole”, daty kolejek w weekendy
// z pominięciem okien FIFA (Ekstraklasa) i przerwy zimowej, rozłożenie meczów kolejki na dni i godziny.

import { addDays } from '../core/gameLoop.js';

/**
 * Terminarz „każdy z każdym”, mecz i rewanż, z tablic Bergera: gospodarz zmienia się na przemian.
 * Runda jesienna ma minimalną liczbę par „dwa mecze z rzędu w tym samym miejscu” (n-2 na ligę),
 * a kolejność rewanży dobieramy tak, żeby nikt nie grał 3 razy z rzędu u siebie ani na wyjeździe
 * i żeby rewanż nie wypadał w kolejce zaraz po pierwszym meczu tej pary.
 */
export function roundRobin(teams, rng) {
  const ids = rng ? rng.shuffle(teams) : teams.slice();
  const n = ids.length;
  if (n % 2) throw new Error('Liczba drużyn musi być parzysta');
  const m = n - 1;
  const first = [];
  for (let r = 0; r < m; r++) {
    const round = [r % 2 === 0 ? [ids[r], ids[m]] : [ids[m], ids[r]]];
    for (let k = 1; k < n / 2; k++) {
      const a = ids[(r + k) % m]; const b = ids[(r - k + m) % m];
      round.push(k % 2 === 1 ? [a, b] : [b, a]);
    }
    first.push(round);
  }
  const swapped = first.map((round) => round.map(([h, a]) => [a, h]));
  const pair = ([h, a]) => (h < a ? `${h}|${a}` : `${a}|${h}`);
  const lastPairs = new Set(first[m - 1].map(pair));
  let best = null;
  for (const rev of [false, true]) {
    for (let s = 0; s < m; s++) {
      let order = swapped.map((_, i) => swapped[(s + i) % m]);
      if (rev) order = order.reverse();
      if (order[0].some((x) => lastPairs.has(pair(x)))) continue; // bez rewanżu od razu
      const q = venueBreaks([...first, ...order]);
      if (!best || q.maxRun < best.q.maxRun || (q.maxRun === best.q.maxRun && q.total < best.q.total)) best = { order, q };
    }
  }
  return [...first, ...best.order];
}

/** Ile razy drużyny grają dwa mecze z rzędu w tym samym miejscu i najdłuższa seria. */
export function venueBreaks(rounds) {
  const seq = new Map();
  for (const round of rounds) for (const [h, a] of round) { if (!seq.has(h)) seq.set(h, []); if (!seq.has(a)) seq.set(a, []); seq.get(h).push(1); seq.get(a).push(0); }
  let total = 0; let maxRun = 1; const perTeam = {};
  for (const [t, s] of seq) {
    let b = 0; let run = 1;
    for (let i = 1; i < s.length; i++) { if (s[i] === s[i - 1]) { b++; run++; maxRun = Math.max(maxRun, run); } else run = 1; }
    perTeam[t] = b; total += b;
  }
  return { total, maxRun, perTeam };
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
