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
//   balance:    poprawki balansu po kontroli jakości i przeglądzie znawcy (rozdz. 7.12): kartki w obu silnikach,
//               czerwone w meczach w tle, doliczony czas i końcówka meczu (ogon wyników), zmęczenie w meczach w tle
// Poprawki po QA i znawcy (rozdz. 7.12) w liczbach STATE, COND i BAL: przy każdej liczbie wartość kroku 2 w komentarzu
// („krok 2: ...”); wpisanie jej z powrotem cofa daną poprawkę.

import { clubById } from '../data/clubs_pl.js';

export const ENGINE2 = { pipeFix: true, state: true, conditions: true, unify: true, balance: true };

let onChange = null;
/** Rejestr modyfikatorów podpina tu unieważnienie list i pamięci (bez cyklu importów). */
export const onEngine2Change = (fn) => { onChange = fn; };
/** Zmiana wyłączników (testy, porównania A/B). Unieważnia skompilowane listy i pamięci potoku. */
export function setEngine2(flags) {
  Object.assign(ENGINE2, flags);
  onChange?.();
}
export const allEngine2 = (on) => setEngine2({ pipeFix: on, state: on, conditions: on, unify: on, balance: on });
/** Wszystkie wyłączniki false: zachowanie kroku 1 bit w bit (testy). */
export const ENGINE2_OFF = Object.freeze({ pipeFix: false, state: false, conditions: false, unify: false, balance: false });

/**
 * Stan zawodnika (decyzja znawcy futbolu, punkty atrybutu). Pule: psychika (forma, morale, „na gazie”),
 * ciało (świeżość, ostrość, powrót po kontuzji), aklimatyzacja; suma trzech pul z granicą. Poza sumą: kondycja w meczu,
 * gra z urazem, pozycja oraz trening, autorytet i głowa w transferze (osobne czynniki).
 */
export const STATE = {
  psyche: [-0.9, 0.6], // krok 2: [-0.8, 0.7] (znawca: dołek boli bardziej, niż euforia pomaga)
  body: [-1.5, 0], acclim: [-0.6, 0], total: [-2.0, 1.0],
  // Mnożnik ligi (TIER_MUL) tylko na pule ciała i aklimatyzacji; psychika bez mnożnika (krok 2: 'all', cała suma x mnożnik)
  tierPools: 'body',
  // Świeżość: -k za punkt poniżej 85, w obu silnikach w puli ciała (granica -1,5); krok 2: k 0,028 (świeżość 70 -> -0,42,
  // teraz -0,57: mecz w tle bliżej pełnego silnika)
  fresh: { from: 85, k: 0.038 },
  // Kondycja na start meczu (pełny silnik): 95 - condStart x (95 - świeżość); reszta zmęczenia w puli ciała (fresh).
  // Krok 2: 0,25 (świeżość 70 -> kondycja 88,75); teraz 0,05 (93,75): zmęczenie sprzed meczu prawie całe w puli ciała,
  // tak samo w obu silnikach
  condStart: 0.05,
  // Ostrość: -(0,015 d + 0,0005 d²), d = 65 - ostrość (30 -> -1,14; 40 -> -0,69; 50 -> -0,34; 60 -> -0,09)
  sharp: { from: 65, lin: 0.015, quad: 0.0005 },
  // „Na gazie”: seria ostatnich ocen co najmniej 0,3 ponad własną średnią z 10 meczów (min. 4 oceny);
  // malejący zwrot max x (1 - e^(-k/tau)); słabszy ostatni mecz od razu zeruje serię
  onFire: { margin: 0.3, max: 0.35, tau: 1.5, minGames: 4 },
  // Powrót po kontuzji („rdza”): przerwa od 10 dni; kara na start min(0,8; 0,2 + dni/100), maleje z każdym meczem
  // i co decayDays dni bez meczu (przerwa letnia, program powrotu; krok 2: tylko z meczami, decayDays 0)
  rust: { fromDays: 10, base: 0.2, perDay: 0.01, max: 0.8, decayDays: 14 },
  // Po przerwie ponad 28 dni ostrość 30 (krok 1); przy state tylko rdza, bez drugiej kary za to samo (krok 2: true)
  sharpReset: false,
  // Gra z urazem sprzed meczu: punkty zamiast procentu ovr (dawniej 0,045 x ovr; ovr 12 -> 0,54). Krok 2: 0,55
  injuredPts: 0.30,
  // Lekki uraz w meczu: kara typu x knockRef (stłuczenie 0,03 x 12 = -0,36)
  knockRef: 12,
  // Zgranie liczone raz: start spójności w meczu stały (85), wpływ zgrania tylko przez wpis trainingCohesion
  cohesionStart: 85,
};

/** Mnożnik stanu i warunków według poziomu ligi (znawca futbolu): 1 Ekstraklasa ... 5 IV liga. Kluby zagraniczne 1. */
export const TIER_MUL = { 1: 1, 2: 1.05, 3: 1.1, 4: 1.15, 5: 1.2, 6: 1.2 }; // 6: niżej IV ligi jak IV liga (krok 2: brak, x1)
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
  // Derby: każdy czynnik 1 +- (a + b x v) x mnożnik ligi, v = intensywność 1-3. Krok 2: tylko b (a = 0):
  // foul [0, 0,05], card [0, 0,07], gap [0, 0,06], dayForm [0, 0,1], act [0, 0]. rankOff: w derbach rangi 2 wpis rank
  // (faule x1,1, kartki x1,15) nie działa, bo ranga 2 wynika z samych derbów (krok 2: false, derby liczone dwa razy)
  derby: { foul: [0.06, 0.015], card: [0.12, 0.03], gap: [0.02, 0.04], dayForm: [0, 0.02], act: [0.02, 0.01], rankOff: true },
  pitch: {
    zla: { passAcc: -0.025, brkPOZ: -0.12, brkSKR: 0.04, foul: 1.06 },
    doskonala: { passAcc: 0.005, brkPOZ: 0.03 },
    sztuczna: { brkPOZ: 0.02 },
  },
  // Stawka meczu x psychika (ranga 2+ albo presja tabeli): WAZ i opanowanie OPA, granica +-0,4
  // tier: mnożnik ligi (krok 2: true; teraz psychika bez mnożnika, STATE.tierPools)
  stakes: { waz: 0.03, opa: 0.015, cap: 0.4, tier: false },
  // Presja tabeli: kolejki do końca (od 6), linie stref ligi z wagą, bliskość punktowa
  pressure: { rounds: 6, w: { title: 1, up: 1, down: 1, 'europe-cl': 0.8, europe: 0.6, playoff: 0.7, 'playoff-down': 0.8 } },
};

/**
 * Poprawki balansu po przeglądzie znawcy (wyłącznik ENGINE2.balance, docs/walka-taktyk.md rozdz. 7.12) [SZAC].
 * Przy balance false każda liczba działa jak w kroku 2 (wartość w komentarzu).
 */
export const BAL = {
  // Żółte kartki ok. +20 % w obu silnikach (cel ok. 4 na mecz w Ekstraklasie w pełnym silniku). Pełny silnik: szansa
  // żółtej za faul, inne żółte i żółta za faul taktyczny x yellow (1,28 daje ok. +20 % na mecz, bo w końcówce mniej
  // akcji i fauli); mecze w tle QS.YELLOW_H i YELLOW_A x qsYellow (krok 2: 1 i 1)
  yellow: 1.28, qsYellow: 1.2,
  // Mecze w tle: bezpośrednie czerwone QS.RED x qsRed, razem z drugimi żółtymi (season.js playQuick) jak pełny silnik (krok 2: 1)
  qsRed: 1.5,
  // Doliczony czas 2. połowy: base2 + wagi zdarzeń (krok 2: base2 2,5, okno zmian 0,4, gol 0,4)
  added: { base2: 2.5, windows: 0.25, goals: 0.3 },
  // Końcówka meczu: przyrost akcji od 55. minuty (krok 2: K.lateRamp 0,004)
  lateRamp: 0.002,
  // Stan meczu od 65. minuty i nasycenie golami (pełny silnik, ogon wyników). Przegrywający mocniej atakuje i mniej
  // odsłania obronę, prowadzący bardziej się cofa (więcej wyrównań, mniej 4:1 i 5:1); przy prowadzeniu 2+ mocniejsze
  // rozluźnienie (smax), przegrywający 2+ szybciej rezygnuje (trail).
  // Krok 2: leadAct 0,85, leadD 0,3, trailAct 1,12, trailD -0,4 (K.gs*), smax 0,40, trail 0,10 (SAT)
  gs: { leadAct: 0.8, leadD: 0.3, trailAct: 1.25, trailD: -0.2, smax: 0.55, trail: 0.2 },
  // Mecze w tle: średnie goli x qsGoals (krok 2: 1). Pomiar [SYM]: 0,985 (średnia w tle 2,78 jak pełny silnik 2,75)
  // poprawiało polskie kluby w pucharach (mniej goli = więcej niespodzianek w dwumeczach: ćwierćfinał w 37,5 % sezonów
  // zamiast 25 %, tests/euroStrength.test.mjs), więc zostaje 1; liczba do decyzji właściciela
  qsGoals: 1,
};
