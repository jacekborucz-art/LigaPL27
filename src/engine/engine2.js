// Walka taktyk, krok 2 (docs/walka-taktyk.md, rozdz. 7): wyłączniki grup zmian i liczby stanu oraz warunków meczu.
// Każda grupa za osobnym wyłącznikiem; wszystkie false = dokładnie zachowanie sprzed kroku 2 (test bit w bit
// tests/engine2.test.mjs na złotych skrótach kroku 1, tests/enginePipeline.step1.golden.json).
//   pipeFix:    naprawa pułapek potoku (tryb match i slot, filtr po jednym kanale, suma kanałów etapu match,
//               pamięci zależne od wersji rejestru, neutralne strefy, kara lekkiego urazu w M.ledger)
//   state:      stan zawodnika w pulach z granicami (psychika, ciało, aklimatyzacja, suma), „na gazie”, powrót po
//               kontuzji, mocniejsza ostrość, gra z urazem w punktach, bez podwójnego zgrania, mnożnik niższych lig
//   conditions: warunki meczu: atut boiska jako wartość terenu (frekwencja, podróż, murawa), derby, presja tabeli,
//               murawa w grze (technika, krótkie podania, walka)
//   unify:      mecze w tle jak pełny silnik (atut boiska, sędzia, ranga x WAZ, bramkarz z pola, bez pewności z tabeli)

import { clubById } from '../data/clubs_pl.js';

export const ENGINE2 = { pipeFix: true, state: true, conditions: true, unify: true };

let onChange = null;
/** Rejestr modyfikatorów podpina tu unieważnienie list i pamięci (bez cyklu importów). */
export const onEngine2Change = (fn) => { onChange = fn; };
/** Zmiana wyłączników (testy, porównania A/B). Unieważnia skompilowane listy i pamięci potoku. */
export function setEngine2(flags) {
  Object.assign(ENGINE2, flags);
  onChange?.();
}
export const allEngine2 = (on) => setEngine2({ pipeFix: on, state: on, conditions: on, unify: on });

/**
 * Stan zawodnika (decyzja znawcy futbolu, punkty atrybutu). Pule: psychika (forma, morale, „na gazie”),
 * ciało (świeżość, ostrość, powrót po kontuzji), aklimatyzacja; suma trzech pul z granicą. Poza sumą: kondycja w meczu,
 * gra z urazem, pozycja oraz trening, autorytet i głowa w transferze (osobne czynniki).
 */
export const STATE = {
  psyche: [-0.8, 0.7], body: [-1.5, 0], acclim: [-0.6, 0], total: [-2.0, 1.0],
  // Świeżość: -0,028 za punkt poniżej 85 (35 -> -1,4); tylko mecze w tle i raporty (w meczu liczy się kondycja)
  fresh: { from: 85, k: 0.028 },
  // Kondycja na start meczu (pełny silnik): 95 - condStart x (95 - świeżość); reszta zmęczenia w puli ciała (fresh)
  condStart: 0.25,
  // Ostrość: -(0,015 d + 0,0005 d²), d = 65 - ostrość (30 -> -1,14; 40 -> -0,69; 50 -> -0,34; 60 -> -0,09)
  sharp: { from: 65, lin: 0.015, quad: 0.0005 },
  // „Na gazie”: seria ostatnich ocen co najmniej 0,3 ponad własną średnią z 10 meczów (min. 4 oceny);
  // malejący zwrot max x (1 - e^(-k/tau)); słabszy ostatni mecz od razu zeruje serię
  onFire: { margin: 0.3, max: 0.35, tau: 1.5, minGames: 4 },
  // Powrót po kontuzji („rdza”): przerwa od 10 dni; kara na start min(0,8; 0,2 + dni/100), maleje z każdym meczem
  rust: { fromDays: 10, base: 0.2, perDay: 0.01, max: 0.8 },
  // Gra z urazem sprzed meczu i lekki uraz w meczu: punkty zamiast procentu ovr (dawniej 0,045 x ovr; ovr 12 -> 0,54)
  injuredPts: 0.55, knockRef: 12,
  // Zgranie liczone raz: start spójności w meczu stały (85), wpływ zgrania tylko przez wpis trainingCohesion
  cohesionStart: 85,
};

/** Mnożnik stanu i warunków według poziomu ligi (znawca futbolu): 1 Ekstraklasa ... 5 IV liga. Kluby zagraniczne 1. */
export const TIER_MUL = { 1: 1, 2: 1.05, 3: 1.1, 4: 1.15, 5: 1.2 };
export const tierMul = (tier) => TIER_MUL[tier] ?? 1;
/** Poziom ligi z kontekstu albo z klubu zawodnika (raporty bez kontekstu). */
export const tierOf = (ctx, p) => ctx?.tier ?? clubById(p?.clubId)?.tier ?? 1;

/**
 * Warunki meczu. Atut boiska (hfa, jak dawne 0,7 + 0,3 x frekwencja): base + fill x frekwencja + travel x podróż
 * (0-1 z km) + murawa gospodarza; w niższych ligach x TIER_MUL. Derby (intensywność 1-3 z fans.js rivalry): faule,
 * kartki, mniejsza różnica klas (gap), większy rozrzut dyspozycji dnia. Presja tabeli: ostatnie 6 kolejek.
 */
export const COND = {
  hfa: { base: 0.6, fill: 0.3, travel: 0.14, travelKm: 400, pitch: { sztuczna: 0.06, zla: 0.03 } },
  home: 0.3, // przewaga gospodarza w ocenie różnicy sił dla trenera AI (strDiff), x hfa / 0,88
  derby: { foul: 0.05, card: 0.07, gap: 0.06, dayForm: 0.1 },
  pitch: {
    zla: { passAcc: -0.025, brkPOZ: -0.12, brkSKR: 0.04, foul: 1.06 },
    doskonala: { passAcc: 0.005, brkPOZ: 0.03 },
    sztuczna: { brkPOZ: 0.02 },
  },
  // Stawka meczu x psychika (ranga 2+ albo presja tabeli): WAZ i opanowanie OPA, granica +-0,4
  stakes: { waz: 0.03, opa: 0.015, cap: 0.4 },
  // Presja tabeli: kolejki do końca (od 6), linie stref ligi z wagą, bliskość punktowa
  pressure: { rounds: 6, w: { title: 1, up: 1, down: 1, 'europe-cl': 0.8, europe: 0.6, playoff: 0.7, 'playoff-down': 0.8 } },
};
