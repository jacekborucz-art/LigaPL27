// Charakter zawodnika do negocjacji kontraktów: 11 cech 1-20, typ agenta i mindset (nastawienie zależne od sytuacji).
// Cechy losuje się raz (przy generowaniu zawodnika) z korelacją z osobowością (persona) i ukrytymi atrybutami.
// Mindset liczy się na nowo przy każdej negocjacji z wieku, reputacji, cech i sytuacji.
// Wszystkie liczby to wartości balansowe [SZAC].

import { Rng, clamp } from '../core/rng.js';

/** Kolejność ma znaczenie: losowanie idzie zawsze w tej kolejności, więc to samo ziarno daje ten sam szum. */
export const TRAITS = [
  'greed', 'ambition', 'loyalty', 'ego', 'patience', 'temper',
  'professionalism', 'homeTies', 'risk', 'playTime', 'security',
];

export const TRAIT_LABELS = {
  greed: 'Chciwość',
  ambition: 'Ambicja',
  loyalty: 'Lojalność',
  ego: 'Ego',
  patience: 'Cierpliwość',
  temper: 'Temperament',
  professionalism: 'Profesjonalizm',
  homeTies: 'Przywiązanie do miasta i rodziny',
  risk: 'Skłonność do ryzyka',
  playTime: 'Potrzeba gry',
  security: 'Lęk przed niepewnością',
};

// Przesunięcia średniej cechy wg osobowości (persona z ekspert_futbol.md 1.2). [SZAC]
const PERSONA_BIAS = {
  Spokojny: { patience: 4, temper: -4, ego: -2, risk: -1, loyalty: 1 },
  Ambitny: { ambition: 5, ego: 3, greed: 1, loyalty: -2, playTime: 2 },
  Wrażliwy: { security: 4, homeTies: 3, ego: -1, patience: -1, risk: -2 },
  Lider: { loyalty: 3, professionalism: 3, ego: 1, patience: 2, playTime: 1 },
  Narwaniec: { temper: 5, patience: -4, ego: 2, risk: 3, professionalism: -2 },
};

/**
 * Losuje cechy 1-20. player: { persona, age, ovr, rep, hidden:{ POT, PRF, TMP } }.
 * Korelacje: TMP -> temperament, PRF -> profesjonalizm i cierpliwość, POT-OVR -> ambicja,
 * wiek -> przywiązanie, lęk przed niepewnością, ryzyko; reputacja -> ego i chciwość. [SZAC]
 */
export function generateTraits(player, rng) {
  const h = player.hidden || {};
  const age = player.age ?? 25;
  const tmp = (h.TMP ?? 10) - 10;
  const prf = (h.PRF ?? 10) - 10;
  const growth = clamp(((h.POT ?? player.ovr ?? 10) - (player.ovr ?? 10)) * 0.8, 0, 4);
  const rep = player.rep ?? 35;
  const bias = PERSONA_BIAS[player.persona] || {};
  const corr = {
    greed: (rep - 40) * 0.04,
    ambition: growth + (age <= 23 ? 1 : age >= 32 ? -2 : 0),
    loyalty: (age - 26) * 0.15,
    ego: (rep - 40) * 0.06,
    patience: 0.2 * prf - 0.2 * tmp,
    temper: 0.6 * tmp,
    professionalism: 0.7 * prf,
    homeTies: (age - 26) * 0.25,
    risk: -Math.max(0, age - 28) * 0.3,
    playTime: age <= 24 ? 1.5 : 0,
    security: Math.max(0, age - 29) * 0.6,
  };
  const t = {};
  for (const k of TRAITS) {
    t[k] = clamp(Math.round(10 + (bias[k] || 0) + corr[k] + rng.gauss(0, 2.8)), 1, 20);
  }
  return t;
}

// ---------------------------------------------------------------- Agent
/**
 * Typ agenta: anchor = zawyżenie pierwszego żądania, concession = tempo ustępstw,
 * patienceMul = mnożnik liczby rund, bluff = szansa blefu o innej ofercie,
 * feePct = oczekiwana prowizja (część rocznej pensji), influence = jak mocno prowizja wpływa na zgodę. [SZAC]
 */
export const AGENT_TYPES = {
  rekin: { label: 'Twardy rekin', anchor: 1.15, concession: 0.75, patienceMul: 0.85, bluff: 0.45, feePct: 0.12, influence: 1.2 },
  rozsadny: { label: 'Rozsądny agent', anchor: 1.07, concession: 1.0, patienceMul: 1.0, bluff: 0.15, feePct: 0.07, influence: 0.8 },
  rodzinny: { label: 'Agent z rodziny', anchor: 1.04, concession: 1.1, patienceMul: 1.15, bluff: 0.08, feePct: 0.04, influence: 0.5 },
  brak: { label: 'Bez agenta', anchor: 1.02, concession: 1.2, patienceMul: 1.1, bluff: 0.03, feePct: 0, influence: 0 },
};

/** Wybór agenta: gwiazdy i chciwi mają rekinów, przywiązani do rodziny agenta z rodziny, młodzi i nieznani często nikogo. */
export function pickAgentType(player, traits, rng) {
  const rep = player.rep ?? 35;
  const w = {
    rekin: 0.6 + Math.max(0, rep - 40) * 0.08 + (traits.greed - 10) * 0.15,
    rozsadny: 3,
    rodzinny: 0.6 + (traits.homeTies - 10) * 0.12 + (traits.security - 10) * 0.05,
    brak: (rep < 30 ? 2.5 : rep < 40 ? 0.8 : 0.1) + ((player.age ?? 25) <= 20 ? 1 : 0),
  };
  return rng.weighted(Object.keys(w), (k) => w[k]);
}

/** Pełna osobowość negocjacyjna do zapisania w zawodniku: player.traits, player.agent. */
export function generatePersonality(player, rng) {
  const traits = generateTraits(player, rng);
  return { traits, agent: pickAgentType(player, traits, rng) };
}

/**
 * Osobowość zawodnika: zapisana albo (dla starych zapisów) wyliczona deterministycznie z id.
 * Nie modyfikuje obiektu zawodnika.
 */
export function personalityOf(player) {
  if (player.traits) return { traits: player.traits, agent: player.agent ?? 'rozsadny' };
  return generatePersonality(player, new Rng(`osobowosc:${player.id}`));
}

// ---------------------------------------------------------------- Mindset
/**
 * Mnożniki elementów oferty dla mindsetu. wageMul: oczekiwania płacowe, moneyW: jak bardzo liczą się pieniądze
 * względem reszty, signOn/bonus/raise/releg: wagi premii za podpis, premii za wyniki, corocznej podwyżki i kary
 * za klauzulę spadkową, roleW/lenW/clauseW: wagi roli, długości i klauzuli odstępnego, years: idealna długość. [SZAC]
 */
export const MINDSETS = {
  kariera: { label: 'Budowanie kariery', wageMul: 0.97, moneyW: 0.9, signOn: 0.9, bonus: 1.1, raise: 1.1, releg: 1.0, roleW: 1.5, lenW: 0.9, clauseW: 1.3, years: 3 },
  ostatniKontrakt: { label: 'Ostatni duży kontrakt', wageMul: 1.08, moneyW: 1.3, signOn: 1.5, bonus: 0.8, raise: 0.9, releg: 1.3, roleW: 0.7, lenW: 1.4, clauseW: 0.5, years: 5 },
  chceGrac: { label: 'Chce grać', wageMul: 0.92, moneyW: 0.75, signOn: 0.9, bonus: 1.2, raise: 1.0, releg: 1.0, roleW: 2.0, lenW: 0.8, clauseW: 0.9, years: 2 },
  powrotDoDomu: { label: 'Chce wrócić do domu', wageMul: 0.88, moneyW: 0.85, signOn: 1.0, bonus: 1.0, raise: 1.0, releg: 1.0, roleW: 1.0, lenW: 1.1, clauseW: 0.6, years: 3 },
  zagranica: { label: 'Chce do zagranicznej ligi', wageMul: 1.0, moneyW: 1.0, signOn: 1.0, bonus: 1.0, raise: 0.8, releg: 1.0, roleW: 1.2, lenW: 1.0, clauseW: 2.0, years: 2 },
  spokojnaKoncowka: { label: 'Spokojna końcówka kariery', wageMul: 0.95, moneyW: 1.1, signOn: 1.2, bonus: 0.7, raise: 0.8, releg: 1.3, roleW: 0.5, lenW: 1.2, clauseW: 0.3, years: 2 },
  stabilizacja: { label: 'Szuka stabilizacji', wageMul: 1.0, moneyW: 1.0, signOn: 1.0, bonus: 0.9, raise: 1.2, releg: 1.1, roleW: 1.0, lenW: 1.1, clauseW: 0.8, years: 3 },
};

/**
 * Wylicza mindset. ctx: { minutesShare 0-1, homeClub (klub z rodzinnego miasta/regionu), clubForeign }.
 * Zwraca { key, label, scores }. Wynik deterministyczny (bez losowania), remisy rozstrzyga kolejność MINDSETS.
 */
export function computeMindset(player, traits, ctx = {}) {
  const age = player.age ?? 25;
  const rep = player.rep ?? 35;
  const growth = (player.hidden?.POT ?? player.ovr ?? 10) - (player.ovr ?? 10);
  const share = ctx.minutesShare ?? player.minutesShare ?? 0.6;
  const t = traits;
  const scores = {
    kariera: (age <= 24 ? 5 : age <= 27 ? 0.5 : -6) + (t.ambition - 10) * 0.4 + clamp(growth, 0, 4) * 1.5,
    ostatniKontrakt: (age >= 29 && age <= 31 ? 6 : age === 28 || age === 32 ? 4 : -6)
      + (t.greed - 10) * 0.5 + (t.security - 10) * 0.2,
    chceGrac: (t.playTime - 10) * 0.5 + (share < 0.35 ? 5 : share < 0.55 ? 2 : -3),
    powrotDoDomu: ctx.homeClub ? 4 + (t.homeTies - 10) * 0.6 : -10,
    zagranica: ctx.clubForeign ? -10
      : (t.ambition - 10) * 0.5 + (rep >= 45 ? 2 : -3) + (age <= 28 ? 1 : -4) + (t.risk - 10) * 0.2 - (t.homeTies - 10) * 0.3,
    spokojnaKoncowka: (age >= 33 ? 5 + (age - 33) : age >= 31 ? 0 : -10) + (t.security - 10) * 0.3 - (t.ambition - 10) * 0.3,
    stabilizacja: 1.5 + (t.security - 10) * 0.3,
  };
  let key = 'stabilizacja';
  for (const k of Object.keys(MINDSETS)) if (scores[k] > scores[key]) key = k;
  return { key, label: MINDSETS[key].label, scores };
}

/**
 * Jak zawodnik waży elementy oferty: cechy x mindset. Zwraca preferencje używane w wycenie oferty.
 */
export function elementPrefs(traits, mindsetKey, player = {}) {
  const m = MINDSETS[mindsetKey] || MINDSETS.stabilizacja;
  const t = traits;
  const age = player.age ?? 25;
  let years = m.years + (t.security - 10) * 0.1 - (t.risk - 10) * 0.08;
  if (age >= 33) years = Math.min(years, 2);
  else if (age >= 31) years = Math.min(years, mindsetKey === 'ostatniKontrakt' ? 4 : 3);
  const clauseW = clamp(m.clauseW * (1 + 0.04 * (t.ambition - 10)), 0.1, 3);
  return {
    wageMul: m.wageMul,
    moneyW: clamp(m.moneyW * (1 + 0.03 * (t.greed - 10)), 0.4, 2),
    signOnPref: clamp(m.signOn * (0.9 + 0.03 * (t.greed - 10) + 0.02 * (t.security - 10)), 0.4, 2),
    bonusPref: clamp(m.bonus * (0.7 + 0.03 * (t.risk - 10) + 0.02 * (t.professionalism - 10) - 0.02 * (t.security - 10)), 0.2, 1.5),
    raisePref: clamp(m.raise * (0.8 + 0.03 * (t.security - 10)), 0.3, 1.6),
    relegPref: clamp(m.releg * (1 + 0.04 * (t.security - 10)), 0.4, 2),
    roleW: clamp(m.roleW * (1 + 0.05 * (t.playTime - 10) + 0.02 * (t.ego - 10)), 0.2, 3),
    lenW: clamp(m.lenW * (1 + 0.04 * (t.security - 10)), 0.3, 2),
    clauseW,
    wantsClause: clauseW >= 1.2,
    wantsAbroad: mindsetKey === 'zagranica',
    idealYears: clamp(Math.round(years), 1, 5),
  };
}
