// TYMCZASOWY STUB: ZASTĄPI logika z gałęzi skautingu (ten sam kontrakt API: SCOUT_REGIONS, scoutingView,
// missionQuote, startMission, cancelMission, hireScout, fireScout, watchCandidate, markCandidatesSeen).
// Pozwala ekranowi Transfery > Skauting działać przed scaleniem: skauci z sztabu gry, przykładowi wolni skauci,
// brak misji i kandydatów, wycena zlecenia z prostych liczb. Nie zapisuje nic w grze.
import { rosterOf, roleCap } from './staffMarket.js';
import { addDays } from '../core/gameLoop.js';

export const SCOUT_REGIONS = [
  { key: 'balkany', label: 'Bałkany', short: 'Bałkany', nats: ['SRB', 'CRO', 'BIH', 'SVN', 'MKD', 'MNE', 'ALB', 'BUL', 'ROU', 'GRE'] },
  { key: 'europa-srodkowa', label: 'Europa Środkowa', short: 'Europa Środk.', nats: ['CZE', 'SVK', 'HUN', 'AUT', 'SUI'] },
  { key: 'skandynawia', label: 'Skandynawia i Bałtyk', short: 'Skand.', nats: ['SWE', 'NOR', 'DEN', 'FIN', 'ISL', 'LTU', 'LVA', 'EST'] },
  { key: 'iberia', label: 'Półwysep Iberyjski', short: 'Iberia', nats: ['ESP', 'POR'] },
  { key: 'europa-zachodnia', label: 'Europa Zachodnia', short: 'Europa Zach.', nats: ['FRA', 'GER', 'NED', 'BEL', 'ENG', 'ITA'] },
  { key: 'europa-wschodnia', label: 'Europa Wschodnia i Kaukaz', short: 'Wschód i Kaukaz', nats: ['UKR', 'BLR', 'RUS', 'GEO', 'ARM', 'AZE', 'MDA'] },
  { key: 'afryka-zachodnia', label: 'Afryka Zachodnia i Środkowa', short: 'Afryka Zach.', nats: ['NGA', 'GHA', 'SEN', 'CIV', 'CMR', 'MLI'] },
  { key: 'afryka-polnocna', label: 'Afryka Północna', short: 'Afryka Płn.', nats: ['MAR', 'ALG', 'TUN', 'EGY'] },
  { key: 'ameryka-poludniowa', label: 'Ameryka Południowa', short: 'Am. Płd.', nats: ['BRA', 'ARG', 'URU', 'COL', 'ECU', 'CHI'] },
  { key: 'ameryka-polnocna', label: 'Ameryka Północna i Środkowa', short: 'Am. Płn.', nats: ['USA', 'CAN', 'MEX', 'CRC'] },
  { key: 'azja', label: 'Azja', short: 'Azja', nats: ['JPN', 'KOR', 'CHN', 'AUS', 'IRN'] },
  { key: 'bliski-wschod', label: 'Bliski Wschód i Turcja', short: 'Bliski Wschód', nats: ['TUR', 'ISR', 'KSA', 'UAE', 'QAT'] },
];

const BAND = { 3: 'ekspert', 2: 'dobra', 1: 'podstawowa' };
const regionsOf = (seed, list) => list.map(([i, lv]) => ({ key: SCOUT_REGIONS[(seed + i) % SCOUT_REGIONS.length].key, label: SCOUT_REGIONS[(seed + i) % SCOUT_REGIONS.length].label, level: lv * 6, band: BAND[lv] }));
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

const FREE = [
  ['Rui Albuquerque', 'POR', 52, [17, 16, 18, 17, 14], [[3, 3], [6, 2]], 38500, 62000, 7, 'both'],
  ['Dragan Mitrović', 'SRB', 44, [15, 14, 16, 15, 12], [[0, 3], [5, 2]], 17800, 31000, 5, 'perm'],
  ['Lars Eriksen', 'NOR', 41, [13, 15, 11, 12, 15], [[2, 3]], 9600, 18000, 4, ''],
  ['Emmanuel Boateng', 'GHA', 39, [12, 11, 14, 17, 11], [[6, 3]], 8900, 17000, 5, ''],
  ['Gabriel Moura', 'BRA', 46, [14, 14, 13, 15, 13], [[8, 3]], 14200, 26000, 5, ''],
  ['Karol Dziedzic', 'POL', 33, [8, 9, 7, 6, 10], [[1, 1]], 2900, 7000, 3, ''],
  ['Mehmet Aksoy', 'TUR', 50, [15, 12, 14, 14, 11], [[11, 3], [0, 1]], 13100, 24000, 5, ''],
  ['Giorgi Beridze', 'GEO', 45, [11, 12, 12, 13, 10], [[5, 3]], 9400, 15000, 4, ''],
].map(([name, nat, age, a, regs, wageMonthly, fee, pct, lock], i) => ({
  id: `stub-f${i + 1}`, name, nat, age, attrs: { dos: a[0], oce: a[1], ryn: a[2], sie: a[3], cha: a[4] },
  regions: regionsOf(0, regs), wageMonthly, commissionPct: pct,
  missionFees: { 1: Math.round(fee * 0.5 / 500) * 500, 2: fee, 4: Math.round(fee * 1.8 / 500) * 500, 6: Math.round(fee * 2.5 / 500) * 500 },
  permanentOk: lock ? { ok: false, text: 'Na stałe: pensja ponad budżetem sztabu (przykładowe dane).' } : { ok: true, text: '' },
  missionOk: lock === 'both' ? { ok: false, text: 'Renoma klubu za niska dla tego skauta (przykładowe dane).' } : { ok: true, text: '' },
}));

/** Widok skautingu dla UI (kontrakt: patrz nagłówek). Stub: skauci z sztabu, wolni z listy przykładowej. */
export function scoutingView(game) {
  const mine = rosterOf(game, game.clubId).filter((p) => p.role === 'skaut');
  const scouts = mine.map((p) => {
    const h = hash(p.id);
    const a = p.a ?? {};
    return {
      id: p.id, name: p.name, nat: p.nat ?? 'POL', age: p.age ?? 40, contractUntil: p.until ?? null, wage: p.wage ?? 0,
      attrs: { dos: p.q ?? 10, oce: a.POT ?? p.q ?? 10, ryn: a.RYN ?? p.q ?? 10, sie: a.OCU ?? p.q ?? 10, cha: p.q ?? 10 },
      regions: regionsOf(h % 12, [[0, 3], [1, 2]].slice(0, 1 + (h % 2))),
      status: 'w klubie', busyUntil: null, missionId: null,
    };
  });
  const wages = scouts.reduce((s, x) => s + x.wage, 0);
  return {
    scouts, staffSlots: { used: scouts.length, max: roleCap(game.clubId, 'skaut') },
    costs: { wagesMonthly: wages, tripsSeason: 0, commissionsSeason: 0 },
    missions: [], candidates: [], freeScouts: FREE, refreshDate: `${String(game.date).slice(0, 4)}-12-31`, newCandidates: 0,
  };
}

/** Wycena zlecenia. Stub: koszt i szansa z liczby tygodni. */
export function missionQuote(game, order) {
  const weeks = [1, 2, 4, 6].includes(order?.weeks) ? order.weeks : 2;
  if (!order?.region) return { ok: false, text: 'Wybierz region.', cost: 0, returnDate: null, chance: 'niska', expected: '0', reasons: [] };
  if (!order.scoutId && !order.freeScoutId) return { ok: false, text: 'Wybierz skauta.', cost: 0, returnDate: null, chance: 'niska', expected: '0', reasons: [] };
  const chance = weeks >= 4 ? 'wysoka' : weeks === 2 ? 'średnia' : 'niska';
  return {
    ok: true, text: '', cost: Math.round(7500 * weeks / 500) * 500, returnDate: addDays(game.date, weeks * 7), chance,
    expected: chance === 'wysoka' ? '2 do 6' : chance === 'średnia' ? '1 do 4' : '0 do 2',
    reasons: ['Dane przykładowe: logika skautingu nie jest jeszcze podłączona.'],
  };
}

const NOT_YET = { ok: false, text: 'Logika skautingu nie jest jeszcze podłączona.' };
export const startMission = () => NOT_YET;
export const cancelMission = () => NOT_YET;
export const hireScout = () => NOT_YET;
export const fireScout = () => NOT_YET;
export const watchCandidate = () => NOT_YET;
export const markCandidatesSeen = () => ({ ok: true, text: '' });
