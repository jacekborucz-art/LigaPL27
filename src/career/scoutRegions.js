// Regiony skautingu zagranicznego (docs/skauting.md, rozdz. 1): 12 regionów, z których zawodnicy realnie trafiają do
// Polski. Każdy region: kraje z wagami (narodowość kandydata), poziom zawodników do ściągnięcia (Lmed mediana, Lmax
// szczyt w ovr 1-20), koszt wyjazdu (start i tydzień w zł), chęć przyjścia (will) i ryzyko adaptacji (adapt) jako opis
// regionu. Rosja pominięta (polskie kluby od 2022 r. nie sprowadzają Rosjan). Moduł czysty: tylko dane i ziarno.
// Wszystkie liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';

/**
 * Regiony: key, label (pełna nazwa), short (kafelek mapy), nats (kody krajów), w (wagi krajów), Lmed, Lmax,
 * travel (zł za tydzień wyjazdu), start (zł na start), near (blisko Polski), will, adapt, tile ({ c, r } mapy kafelkowej).
 */
export const SCOUT_REGIONS = [
  { key: 'balkany', label: 'Bałkany', short: 'Bałkany', w: { CRO: 1.2, SRB: 1.5, SVN: 1, BIH: 1, MKD: 0.8, MNE: 0.8, ALB: 0.8, KOS: 0.6, BUL: 0.8, GRE: 0.8, CYP: 0.3 }, Lmed: 10.4, Lmax: 11.9, travel: 2200, start: 2000, near: true, will: 0.75, adapt: 0.25, tile: { c: 4, r: 3 } },
  { key: 'srodkowa', label: 'Europa Środkowa', short: 'Europa Środk.', w: { CZE: 1.3, SVK: 1.3, HUN: 1, ROU: 0.9 }, Lmed: 10.8, Lmax: 12.0, travel: 1800, start: 2000, near: true, will: 0.55, adapt: 0.15, tile: { c: 4, r: 2 } },
  { key: 'skandynawia', label: 'Skandynawia i Bałtyk', short: 'Skand.', w: { SWE: 1.2, NOR: 1.2, DEN: 1.2, FIN: 0.8, ISL: 0.6, FRO: 0.2, EST: 0.4, LVA: 0.5, LTU: 0.7 }, Lmed: 10.6, Lmax: 12.2, travel: 2800, start: 2000, near: false, will: 0.40, adapt: 0.35, tile: { c: 4, r: 1 } },
  { key: 'iberia', label: 'Półwysep Iberyjski', short: 'Iberia', w: { ESP: 1.5, POR: 1.3, AND: 0.1 }, Lmed: 11.0, Lmax: 12.6, travel: 3000, start: 2000, near: false, will: 0.50, adapt: 0.40, tile: { c: 3, r: 3 } },
  { key: 'zachodnia', label: 'Europa Zachodnia', short: 'Europa Zach.', w: { NED: 1.1, BEL: 1, GER: 1.2, AUT: 0.9, FRA: 1.1, SUI: 0.6, LUX: 0.2, ENG: 0.8, SCO: 0.5, WAL: 0.2, NIR: 0.2, IRL: 0.4, ITA: 0.8 }, Lmed: 11.2, Lmax: 12.8, travel: 3000, start: 2000, near: false, will: 0.30, adapt: 0.35, tile: { c: 3, r: 2 } },
  { key: 'wschodnia', label: 'Europa Wschodnia i Kaukaz', short: 'Wschód i Kaukaz', w: { UKR: 2, BLR: 0.6, GEO: 1, ARM: 0.6, AZE: 0.5, KAZ: 0.5, MDA: 0.5 }, Lmed: 10.0, Lmax: 11.6, travel: 2000, start: 2000, near: true, will: 0.80, adapt: 0.25, tile: { c: 5, r: 2 } },
  { key: 'afrykaZach', label: 'Afryka Zachodnia i Środkowa', short: 'Afryka Zach.', w: { NGA: 1.5, GHA: 1.2, CMR: 1, SEN: 1.2, CIV: 1.2, MLI: 0.6, GUI: 0.6, COD: 0.6, BFA: 0.5, GAM: 0.4, ZAM: 0.3, RSA: 0.3, KEN: 0.2 }, Lmed: 9.8, Lmax: 11.8, travel: 5500, start: 5000, near: false, will: 0.85, adapt: 0.55, tile: { c: 4, r: 4 } },
  { key: 'afrykaPln', label: 'Afryka Północna', short: 'Afryka Płn.', w: { MAR: 1.3, ALG: 1, TUN: 1, EGY: 0.8 }, Lmed: 10.4, Lmax: 12.0, travel: 3500, start: 5000, near: false, will: 0.70, adapt: 0.45, tile: { c: 3, r: 4 } },
  { key: 'amerykaPd', label: 'Ameryka Południowa', short: 'Am. Płd.', w: { BRA: 3, ARG: 2, COL: 1.5, URU: 1, ECU: 1, PAR: 0.8, VEN: 0.6, CHI: 0.6, PER: 0.5, BOL: 0.3 }, Lmed: 10.6, Lmax: 12.6, travel: 7000, start: 5000, near: false, will: 0.70, adapt: 0.50, tile: { c: 1, r: 4 } },
  { key: 'amerykaPln', label: 'Ameryka Północna i Środkowa', short: 'Am. Płn.', w: { USA: 1.5, MEX: 1.2, CAN: 0.8, CRC: 0.6, HON: 0.5, JAM: 0.5, PAN: 0.4 }, Lmed: 9.8, Lmax: 11.8, travel: 6500, start: 5000, near: false, will: 0.40, adapt: 0.50, tile: { c: 1, r: 2 } },
  { key: 'azja', label: 'Azja', short: 'Azja', w: { JPN: 1.5, KOR: 1.2, AUS: 1, UZB: 0.6, IRN: 0.7, CHN: 0.4, THA: 0.4 }, Lmed: 10.0, Lmax: 12.0, travel: 7000, start: 5000, near: false, will: 0.30, adapt: 0.65, tile: { c: 6, r: 2 } },
  { key: 'bliskiWschod', label: 'Bliski Wschód i Turcja', short: 'Bliski Wschód', w: { TUR: 1.3, ISR: 1.2, LBN: 0.6, JOR: 0.6, IRQ: 0.7, SYR: 0.5, KSA: 0.5 }, Lmed: 9.8, Lmax: 11.4, travel: 4000, start: 5000, near: false, will: 0.50, adapt: 0.50, tile: { c: 5, r: 3 } },
];
for (const r of SCOUT_REGIONS) r.nats = Object.keys(r.w);

export const SCOUT_REGION = Object.fromEntries(SCOUT_REGIONS.map((r) => [r.key, r]));
export const SCOUT_REGION_KEYS = SCOUT_REGIONS.map((r) => r.key);
const REGION_OF_NAT = Object.fromEntries(SCOUT_REGIONS.flatMap((r) => r.nats.map((n) => [n, r.key])));

/** Region skautingu kraju (null: Polska i kraje spoza regionów). */
export const scoutRegionOf = (nat) => REGION_OF_NAT[nat] ?? null;

/** Opis znajomości regionu: ekspert (15+), dobra (10-14), podstawowa (1-9). */
export const regionBand = (level) => (level >= 15 ? 'ekspert' : level >= 10 ? 'dobra' : 'podstawowa');

// Gdzie polskie kluby najczęściej szukają (waga regionu przy losowaniu regionów skauta) [SZAC]
export const REGION_POPULARITY = { balkany: 1.3, srodkowa: 1.1, wschodnia: 1.1, skandynawia: 1.0, iberia: 0.8, zachodnia: 0.9, afrykaZach: 0.8, afrykaPln: 0.5, amerykaPd: 0.8, amerykaPln: 0.4, azja: 0.4, bliskiWschod: 0.5 };
const NEAR = SCOUT_REGIONS.filter((r) => r.near).map((r) => r.key);

/**
 * Regiony skauta { klucz: poziom 1-20 } z ziarna osoby: 1-3 regiony, najlepszy wokół jakości (ok. 13 przy q 10),
 * drugi 5-13, trzeci 3-9. Skaut z kraju regionu zna go w 70 % (Brazylijczyk: Ameryka Południowa); polski skaut
 * w 55 % zaczyna od regionów blisko Polski. opts: { weights: { klucz: waga } (miks odświeżenia listy), best: poziom
 * najlepszego regionu (specjalista), rng }.
 */
export function scoutRegionsFor(p, key, opts = {}) {
  const rng = opts.rng ?? new Rng(`skaut-regiony:${key}`);
  const q = p?.q ?? 10;
  const n = rng.weighted([1, 2, 3], (k) => ({ 1: 0.35, 2: 0.45, 3: 0.2 })[k]);
  const w = (k) => (opts.weights?.[k] ?? 1) * (REGION_POPULARITY[k] ?? 1);
  const home = scoutRegionOf(p?.nat);
  let first;
  if (home && rng.chance(0.7)) first = home;
  else if (p?.nat === 'POL' && rng.chance(0.55)) first = rng.weighted(NEAR, w);
  else first = rng.weighted(SCOUT_REGION_KEYS, w);
  const best = opts.best ?? clamp(Math.round(10.5 + 0.35 * (q - 10) + 2.5 + rng.gauss(0, 2)), 8, 18);
  const reg = { [first]: clamp(best, 1, 20) };
  const rest = SCOUT_REGION_KEYS.filter((k) => k !== first);
  if (n >= 2) {
    const k2 = rng.weighted(rest, w);
    reg[k2] = clamp(best - rng.int(3, 6), 5, 13);
    if (n >= 3) {
      const k3 = rng.weighted(rest.filter((k) => k !== k2), w);
      reg[k3] = clamp(best - rng.int(6, 10), 3, 9);
    }
  }
  return reg;
}

/** Najlepszy region skauta: [klucz, poziom] albo null. */
export function bestRegion(reg) {
  let out = null;
  for (const [k, v] of Object.entries(reg ?? {})) if (SCOUT_REGION[k] && (!out || v > out[1])) out = [k, v];
  return out;
}
