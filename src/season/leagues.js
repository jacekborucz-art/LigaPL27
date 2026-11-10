// Przynależność klubów do lig w kolejnych sezonach (etap 10, PLAN 6).
// Stan: game.leagueState = { year, tiers: { id: 1..4 }, dyn: [id klubów z III ligi z kadrą], groups: { id: grupa III ligi } }.
// Obiekty klubów (CLUBS_PL, CLUBS_L3) są współdzielone przez całą grę, więc applyLeagueState() ustawia im
// pole tier zgodnie z zapisem gry (i przywraca stan początkowy dla nowej gry).

import { Rng, clamp } from '../core/rng.js';
import { CLUBS_PL } from '../data/clubs_pl.js';
import { CLUBS_L3 } from '../data/clubs_l3.js';
import { RESERVES } from '../config/competitions.js';

for (const c of [...CLUBS_PL, ...CLUBS_L3]) if (c.tier0 == null) c.tier0 = c.tier;
const L3_BY_ID = new Map(CLUBS_L3.map((c) => [c.id, c]));
const allKnown = () => { const m = new Map(); for (const c of [...CLUBS_PL, ...CLUBS_L3]) m.set(c.id, c); return m; };

export function applyLeagueState(game) {
  // Powrót do stanu początkowego
  for (let i = CLUBS_PL.length - 1; i >= 0; i--) if (CLUBS_PL[i].dyn) { delete CLUBS_PL[i].dyn; CLUBS_PL.splice(i, 1); }
  for (const c of [...CLUBS_PL, ...CLUBS_L3]) { c.tier = c.tier0; if (c.group0 !== undefined) { c.group = c.group0; delete c.group0; } }
  const S = game?.leagueState;
  if (!S) return;
  for (const id of S.dyn ?? []) { const c = L3_BY_ID.get(id); if (c && !CLUBS_PL.includes(c)) { c.dyn = true; CLUBS_PL.push(c); } }
  const known = allKnown();
  for (const [id, t] of Object.entries(S.tiers)) { const c = known.get(id); if (c) c.tier = t; }
  for (const [id, g] of Object.entries(S.groups ?? {})) { const c = known.get(id); if (c) { if (c.group0 === undefined) c.group0 = c.group ?? null; c.group = g; } }
}

/** Najwyższa liga dla rezerw: poniżej pierwszej drużyny i nie wyżej niż limit PZPN. */
export function reserveMayPlayIn(reserveTier, parentTier) {
  return reserveTier > parentTier && reserveTier >= RESERVES.reserveMaxTier;
}

/**
 * Ruchy między ligami po sezonie.
 * tables: { 1: [id...], 2: [...], 3: [...] } (końcowe tabele), playoffWinners: { 2: id, 3: id },
 * l3: kluby III ligi (z group, weight, L, parent), rng.
 * Zwraca { tiers: { id: nowa liga }, promoted, relegated, l3Up, l3Playoff, notes }.
 */
export function computeMoves(tables, playoffWinners, l3, rng) {
  const known = allKnown();
  for (const c of l3) known.set(c.id, c);
  const tier = {};
  for (const t of [1, 2, 3]) for (const id of tables[t]) tier[id] = t;
  for (const c of l3) tier[c.id] = 4;
  const parentOf = (id) => known.get(id)?.parent ?? null;
  const notes = [];
  const promoted = { 1: [], 2: [], 3: [] }; // do ligi o numerze
  const relegated = { 2: [], 3: [], 4: [] };

  const upFrom = (t, n) => {
    const eligible = tables[t].filter((id) => !parentOf(id));
    const direct = eligible.slice(0, n);
    const po = playoffWinners[t] && !direct.includes(playoffWinners[t]) ? playoffWinners[t] : eligible[n];
    return [...direct, po].filter(Boolean);
  };
  // Ekstraklasa <-> 1 Liga
  promoted[1] = upFrom(2, 2);
  relegated[2] = tables[1].slice(15, 18);
  // 1 Liga <-> 2 Liga
  promoted[2] = upFrom(3, 2);
  relegated[3] = tables[2].slice(15, 18);
  // 2 Liga -> III liga: 15-18 bezpośrednio, 13-14 w barażach z wicemistrzami grup III ligi
  relegated[4] = tables[3].slice(14, 18);
  for (const id of promoted[1]) tier[id] = 1;
  for (const id of relegated[2]) tier[id] = 2;
  for (const id of promoted[2]) tier[id] = 2;
  for (const id of relegated[3]) tier[id] = 3;
  for (const id of relegated[4]) tier[id] = 4;

  // III liga: zwycięzcy i wicemistrzowie grup losowani z siły (weight), rezerwy tylko gdy wolno
  const groups = [...new Set(l3.map((c) => c.group))].sort();
  const winners = []; const runners = [];
  for (const g of groups) {
    const cand = l3.filter((c) => c.group === g);
    const order = [];
    const pool = [...cand];
    while (pool.length && order.length < 3) {
      const c = rng.weighted(pool, (x) => (x.weight ?? 2) ** 2.2);
      order.push(c); pool.splice(pool.indexOf(c), 1);
    }
    const ok = (c) => !c.parent || reserveMayPlayIn(3, tier[c.parent] ?? known.get(c.parent)?.tier ?? 1);
    const eligible = order.filter(ok);
    if (eligible[0]) winners.push(eligible[0].id);
    if (eligible[1]) runners.push(eligible[1].id);
  }
  for (const id of winners) { tier[id] = 3; promoted[3].push(id); }
  // Baraż: wicemistrzowie w parach (1 mecz), zwycięzcy z 13. i 14. drużyną 2 Ligi (dwumecz)
  const L = (id) => known.get(id)?.L ?? 8;
  const duel = (a, b, twoLegs = false) => { const p = clamp(0.5 + 0.12 * (L(a) - L(b)) + (twoLegs ? 0 : 0.04), 0.1, 0.9); return rng.chance(p) ? a : b; };
  const r = rng.shuffle([...runners]);
  const semi = [duel(r[0], r[1]), duel(r[2], r[3])].filter(Boolean);
  const l3Playoff = [];
  [tables[3][12], tables[3][13]].forEach((keeper, i) => {
    const ch = semi[i];
    if (!ch) return;
    const w = duel(keeper, ch, true);
    l3Playoff.push({ keeper, challenger: ch, winner: w });
    if (w === ch) { tier[keeper] = 4; tier[ch] = 3; relegated[4].push(keeper); promoted[3].push(ch); }
  });

  // Reguły rezerw: rezerwy zawsze niżej niż pierwsza drużyna i najwyżej w 2 Lidze
  for (const [id, c] of known) {
    if (!c.parent || tier[id] == null) continue;
    const pt = tier[c.parent] ?? known.get(c.parent)?.tier;
    if (pt == null || reserveMayPlayIn(tier[id], pt)) continue;
    const from = tier[id];
    tier[id] = Math.max(pt + 1, RESERVES.reserveMaxTier);
    notes.push({ id, kind: 'reserve', from, to: tier[id] });
    // Rezerwy przeniesione administracyjnie zastępują jeden spadek sportowy w lidze, z której spadają
    if (from <= 3 && tier[id] > from) {
      const saved = relegated[from + 1].find((x) => tier[x] === from + 1 && x !== id && !known.get(x)?.parent);
      if (saved) { tier[saved] = from; relegated[from + 1] = relegated[from + 1].filter((x) => x !== saved); notes.push({ id: saved, kind: 'reprieve', tier: from }); }
    }
    if (!relegated[tier[id]].includes(id)) relegated[tier[id]].push(id);
  }
  return { tiers: tier, promoted, relegated, l3Up: winners, l3Playoff, notes };
}

/** Kontrola po zmianach: po 18 klubów w ligach 1-3, rezerwy niżej niż pierwsza drużyna i najwyżej w 2 Lidze. */
export function validateTiers(tiers) {
  const errors = [];
  const known = allKnown();
  for (const t of [1, 2, 3]) {
    const n = Object.values(tiers).filter((x) => x === t).length;
    if (n !== 18) errors.push(`Liga ${t}: ${n} klubów`);
  }
  for (const [id, t] of Object.entries(tiers)) {
    const c = known.get(id);
    if (c?.parent && t <= 3 && !reserveMayPlayIn(t, tiers[c.parent] ?? known.get(c.parent)?.tier)) errors.push(`${id}: rezerwy w lidze ${t}`);
  }
  return errors;
}

export { Rng };
