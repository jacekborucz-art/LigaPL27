// Generator zawodnika (docs/ekspert_futbol.md 1.4, 2.1-2.5). Atrybuty zależą od pozycji,
// więc bramkarz ma bramkarskie atrybuty na poziomie swojej jakości, a zawodnik z pola 1-8.
// Charakter (cechy, agent) z personality.js, reputacja z reputation.js, pensja z negotiation.js.

import { clamp } from '../core/rng.js';
import { OFF, VARIANTS, OUTFIELD_ATTRS, GK_ATTRS, ovrAt, RELATED } from '../data/attributes.js';
import { randomName, EU } from '../data/names.js';
import { generatePersonality } from '../career/personality.js';
import { generatedReputation, clubStage } from '../career/reputation.js';
import { clubById } from '../data/clubs_pl.js';
import { marketWage, VALUE_BASE_EUR, VALUE_SLOPE } from '../career/negotiation.js';
import { payLevel, EUR_PLN } from '../data/finanse_klubow.js';

const AGE_ADJ = { 17: -2.5, 18: -2.0, 19: -1.5, 20: -1.0, 21: -0.6, 22: -0.3, 30: -0.1, 31: -0.3, 32: -0.6, 33: -1.0, 34: -1.4, 35: -1.8 };
const FOREIGN_BONUS = { 1: 0.3, 2: 0.5, 3: 0.3, 4: 0.2 };
const LEAGUE_VALUE = { 1: 1.0, 2: 0.6, 3: 0.35, 4: 0.2 }; // [SZAC]

function persona(h, age, rng) {
  if (h.LID >= 15 && h.PRF >= 11 && age >= 24) return 'Lider';
  if (h.TMP >= 15) return 'Narwaniec';
  if (h.TMP <= 6) return 'Spokojny';
  return rng.weighted(['Spokojny', 'Ambitny', 'Wrażliwy', 'Lider', 'Narwaniec'], (k) => ({ Spokojny: 34, Ambitny: 28, Wrażliwy: 20, Lider: 8, Narwaniec: 10 })[k]);
}

function footFor(side, rng) {
  if (side === 'L') return rng.chance(0.65) ? 'L' : rng.chance(0.15) ? 'LP' : 'P';
  const r = rng.next();
  return r < 0.74 ? 'P' : r < 0.94 ? 'L' : 'LP';
}

/**
 * Wartość rynkowa w zł (ekspert 2.4, skala z docs/finanse.md 3.2): OVR 10 w Ekstraklasie ok. 250 tys. EUR,
 * OVR 12 ok. 1 mln EUR, OVR 14,5 ok. 7 mln EUR; młody talent do x2, weteran x0,3. Sprzedaże z Ekstraklasy to zwykle
 * 0,5-5 mln EUR, rekord ok. 7-10 mln EUR. [SZAC]
 */
export function marketValue(p, { tier = 1, date = '2026-07-01' } = {}) {
  const potVis = p.hidden?.POT ?? p.ovr;
  const age = p.age;
  const ageMul = age <= 21 ? Math.min(2, 1 + 0.12 * Math.max(0, potVis - p.ovr))
    : age <= 26 ? 1.1 : age <= 29 ? 0.9 : ({ 30: 0.75, 31: 0.6, 32: 0.45 })[age] ?? 0.3;
  const [y1, m1] = date.split('-').map(Number);
  const [y2, m2] = (p.contract?.until ?? date).split('-').map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1);
  const contractMul = months < 6 ? 0.4 : months < 12 ? 0.7 : months < 24 ? 0.9 : 1.0;
  const form = p.form?.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : 6.6;
  const formMul = clamp(1 + 0.1 * (form - 6.6), 0.85, 1.15);
  const v = VALUE_BASE_EUR * Math.exp(VALUE_SLOPE * (p.ovr - 10)) * ageMul * contractMul * (LEAGUE_VALUE[tier] ?? 0.2) * formMul * EUR_PLN;
  return Math.max(10000, Math.round(v / 5000) * 5000);
}

/** Szum startowej reputacji (poza zapisem gry): drugie przejście generatora kadry nie losuje ponownie. */
export const REP_NOISE = new WeakMap();

/**
 * opts: { id, L, pos, age, slotOffset, nat, tier, side, club, date, startYear, m (oczekiwany udział minut) }
 * rng: Rng (strumień klubu, żeby kluby były niezależne od siebie)
 */
export function genPlayer(rng, opts) {
  const { id, L, pos, age, slotOffset = 0, nat = 'POL', tier = 1, side = null, club, date = '2026-07-01' } = opts;
  const foreign = nat !== 'POL';
  const q = L + slotOffset + clamp(rng.gauss(0, 1), -2, 2) * 0.9 + (AGE_ADJ[age] ?? 0) + (foreign ? FOREIGN_BONUS[tier] ?? 0 : 0);

  let offsets = OFF[pos];
  let variant = null;
  if (VARIANTS[pos] && rng.chance(0.25)) {
    variant = rng.pick(VARIANTS[pos]);
    offsets = { ...offsets, ...variant.set };
  }

  const attr = {};
  for (const a of OUTFIELD_ATTRS) {
    let v = q + (offsets[a] ?? 0) + rng.gauss(0, 1.3);
    if ((a === 'SZY' || a === 'ZWI' || a === 'WYT') && age > 29) v -= 0.3 * (age - 29);
    if (a === 'DEC' || a === 'OPA' || a === 'UST' || a === 'LID') v += clamp(0.15 * (age - 24), -1, 1.2);
    attr[a] = clamp(Math.round(v), 1, 20);
  }
  for (const a of GK_ATTRS) {
    attr[a] = pos === 'BR'
      ? clamp(Math.round(q + (offsets[a] ?? 0) + rng.gauss(0, 1.2)), 1, 20)
      : clamp(Math.round(4 + rng.gauss(0, 1.5)), 1, 8);
  }
  const ovr = ovrAt(attr, pos, offsets);

  const r = (a, b) => a + rng.next() * (b - a);
  const hidden = {
    POT: Math.round(clamp(age < 24 ? ovr + (24 - age) * r(0.15, 0.6) + rng.gauss(0, 0.5) : ovr + r(0, 0.5), ovr, 20) * 10) / 10,
    ODP: clamp(Math.round(10 + rng.gauss(0, 3.5)), 1, 20),
    PRF: clamp(Math.round(10 + rng.gauss(0, 3.5)), 1, 20),
    WAZ: clamp(Math.round(10 + rng.gauss(0, 3)), 1, 20),
    KON: clamp(Math.round(10 + rng.gauss(0, 3) + (age - 25) * 0.15), 1, 20),
    TMP: clamp(Math.round(10 + rng.gauss(0, 3.5)), 1, 20),
  };
  const per = persona({ ...hidden, LID: attr.LID }, age, rng);

  const alt = {};
  for (const rp of RELATED[pos]) if (rng.chance(0.6)) alt[rp] = rng.int(60, 90);

  const name = randomName(nat, rng);
  const startYear = Number(date.slice(0, 4));
  const years = age <= 21 ? rng.int(1, 3) : age >= 32 ? rng.int(1, 2) : age >= 29 ? rng.int(1, 3) : rng.int(1, 4);
  const birthYear = startYear - age;
  const birthDate = `${birthYear}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`;

  const p = {
    id,
    name: `${name.first} ${name.last}`,
    first: name.first,
    last: name.last,
    nat,
    eu: EU.has(nat),
    age,
    birthDate,
    pos,
    side,
    variant: variant?.name ?? null,
    foot: footFor(side, rng),
    alt,
    attr,
    ovr,
    hidden,
    persona: per,
    morale: clamp(Math.round(12 + rng.gauss(0, 1.5)), 6, 17),
    form: [],
    fresh: 95,
    sharp: 70,
    injuryDays: 0,
    injury: null,
    suspended: 0,
    yc: {},
    season: { apps: 0, subs: 0, min: 0, g: 0, a: 0, yc: 0, rc: 0, rating: 0, motm: 0, cs: 0 },
    career: [],
    caps: 0,
    intlGoals: 0,
    clubId: club.id,
    squad: 'A',
  };
  p.contract = { wage: marketWage(ovr, tier, foreign && tier === 1, payLevel(club)), until: `${startYear + years}-06-30`, clause: 0, signedOn: date };
  p.wage = p.contract.wage;
  p.value = marketValue(p, { tier, date });
  if (rng.chance(0.4)) p.contract.clause = Math.round((p.value * r(2.5, 4)) / 10000) * 10000;
  // Reputacja tym samym wzorem co co miesiąc (docs/reputacja.md). Losowanie szumu zostaje w tym samym miejscu
  // strumienia RNG (sd 3 przeskalowane do 2), więc reszta zawodnika i kolejne losowania się nie zmieniają.
  const repNoise = rng.gauss(0, 3) * (2 / 3);
  const S = clubStage(club);
  p.rep = generatedReputation(p, S, { m: opts.m ?? 0.4, noise: repNoise });
  REP_NOISE.set(p, repNoise);
  if (!clubById(club.id)) p.rs = Math.round(S); // scena dla zawodnika bez polskiego klubu (wolny, zagranica)
  const pers = generatePersonality(p, rng);
  p.traits = pers.traits;
  p.agent = pers.agent;
  return p;
}
