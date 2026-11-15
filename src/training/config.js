// Trening: wszystkie liczby balansowe modułu w jednym miejscu (docs/trening.md).
// Wartości oznaczone [SZAC] to szacunki do strojenia w symulacji wielu sezonów.
// Nowe zajęcia = nowy wpis w SESSIONS; plan, UI i rozwój czytają katalog bez zmian w kodzie.

/** Intensywność zajęć (ekspert 9.4, rozszerzone). [SZAC] */
export const INTENSITY = {
  low: { id: 'low', name: 'Niska', short: 'N', dev: 0.7, fat: 5, load: 25, inj: 0.6, sharp: 2, legs: 0, fam: 0.6, morale: 0 },
  mid: { id: 'mid', name: 'Średnia', short: 'Ś', dev: 1.0, fat: 11, load: 45, inj: 1.0, sharp: 3, legs: 0.35, fam: 1.0, morale: 0 },
  high: { id: 'high', name: 'Wysoka', short: 'W', dev: 1.3, fat: 18, load: 70, inj: 2.0, sharp: 4, legs: 1.0, fam: 1.3, morale: -0.04 },
};
export const INT_ORDER = ['low', 'mid', 'high'];

/**
 * Katalog zajęć. Mnożniki odnoszą się do intensywności:
 * attrs: atrybuty, które rozwija zajęcie (bodziec dzielony równo), dev: siła bodźca rozwojowego,
 * fat: zmęczenie (świeżość), load: obciążenie (AU), inj: ryzyko urazu, legs: „ciężkie nogi” na kolejne dni,
 * sharp: ostrość meczowa, morale: zmiana morale za zajęcia, fam/instr/know: zgranie formacji, instrukcji i osobiste,
 * sp: poziom wyćwiczenia stałych fragmentów, prep: analiza rywala, recover: dodatkowa regeneracja świeżości. [SZAC]
 */
export const SESSIONS = {
  wytrzymalosc: { name: 'Wytrzymałość', icon: 'W', group: 'phys', attrs: ['WYT', 'PRA'], dev: 1, fat: 1.15, load: 1.15, inj: 1.0, legs: 0.9, sharp: 0.8, morale: -0.05,
    text: 'Biegi interwałowe i gry o dużej objętości. Buduje wytrzymałość, mocno męczy.' },
  szybkosc: { name: 'Szybkość', icon: 'S', group: 'phys', attrs: ['SZY', 'ZWI'], dev: 1, fat: 1.0, load: 0.9, inj: 1.3, legs: 0.8, sharp: 1.0, morale: 0,
    text: 'Sprinty i zmiany kierunku. Wyższe ryzyko urazów mięśniowych.' },
  sila: { name: 'Siła', icon: 'Si', group: 'phys', attrs: ['SIL', 'SKO'], dev: 1, fat: 1.1, load: 1.0, inj: 1.1, legs: 1.0, sharp: 0.5, morale: -0.03,
    text: 'Siłownia i pojedynki. Najlepiej 4 dni przed meczem.' },
  technika: { name: 'Technika', icon: 'T', group: 'tech', attrs: ['TEC', 'POD', 'DRY', 'DOS'], dev: 1, fat: 0.7, load: 0.8, inj: 0.7, legs: 0.3, sharp: 1.0, morale: 0.02,
    text: 'Przyjęcie, podanie, drybling, dośrodkowanie. Niskie zmęczenie.' },
  taktyka: { name: 'Taktyka', icon: 'Tk', group: 'mental', attrs: ['DEC', 'UST', 'WIZ', 'RUC'], dev: 0.8, fat: 0.6, load: 0.7, inj: 0.5, legs: 0.2, sharp: 0.8, morale: 0,
    fam: 2.0, instr: 1.6, know: 1.0, posLearn: 1.6,
    text: 'Ustawienie formacji i instrukcje meczowe. Główne źródło zgrania drużyny.' },
  stale: { name: 'Stałe fragmenty', icon: 'SF', group: 'tech', attrs: ['SFR', 'GLO'], dev: 0.8, fat: 0.5, load: 0.55, inj: 0.6, legs: 0.1, sharp: 0.5, morale: 0,
    sp: 7, text: 'Rożne i wolne w ataku i w obronie. Podnosi skuteczność stałych fragmentów na 2-3 tygodnie.' },
  wykonczenie: { name: 'Wykończenie', icon: 'Wk', group: 'tech', attrs: ['WYK', 'DYS', 'OPA'], dev: 1, fat: 0.8, load: 0.85, inj: 0.8, legs: 0.4, sharp: 1.1, morale: 0.03,
    text: 'Strzały z pola karnego i z dystansu, sytuacje sam na sam.' },
  obrona: { name: 'Gra obronna', icon: 'O', group: 'tech', attrs: ['ODB', 'UST', 'GLO', 'AGR'], dev: 1, fat: 0.9, load: 0.9, inj: 1.1, legs: 0.5, sharp: 1.0, morale: 0,
    fam: 0.5, know: 0.3, text: 'Odbiór, ustawienie linii, gra w powietrzu.' },
  gierki: { name: 'Gierki', icon: 'G', group: 'mixed', attrs: ['TEC', 'POD', 'DEC', 'PRA', 'SZY', 'WYT'], dev: 0.9, fat: 1.0, load: 1.0, inj: 1.2, legs: 0.7, sharp: 1.6, morale: 0.1,
    fam: 0.4, know: 0.3, text: 'Gry w małych polach. Najlepiej buduje ostrość meczową, zawodnicy je lubią.' },
  rozruch: { name: 'Rozruch', icon: 'R', group: 'mixed', attrs: ['SZY', 'TEC'], dev: 0.3, fat: 0.4, load: 0.45, inj: 0.4, legs: 0, sharp: 1.2, morale: 0.02,
    text: 'Krótka aktywacja przed meczem: szybkie podania, krótkie sprinty.' },
  regeneracja: { name: 'Regeneracja', icon: 'Rg', group: 'none', attrs: [], dev: 0, fat: 0, load: 0.3, inj: 0.1, legs: -0.5, sharp: 0, morale: 0.03,
    recover: 1, text: 'Basen, rozciąganie, masaż. Przywraca świeżość i zdejmuje ciężkie nogi.' },
  wideo: { name: 'Analiza wideo rywala', icon: 'V', group: 'mental', attrs: ['DEC', 'WIZ'], dev: 0.2, fat: 0, load: 0.1, inj: 0, legs: 0, sharp: 0, morale: 0,
    prep: 1, noIntensity: true, text: 'Analityk pokazuje mocne i słabe strony najbliższego rywala. Mały bonus na ten mecz.' },
  odprawa: { name: 'Odprawa taktyczna', icon: 'Od', group: 'mental', attrs: ['DEC'], dev: 0.1, fat: 0, load: 0.05, inj: 0, legs: 0, sharp: 0, morale: 0.12,
    instr: 1.5, know: 0.5, noIntensity: true, text: 'Omówienie planu na mecz i instrukcji. Utrwala instrukcje, lekko podnosi morale.' },
};

/** Zajęcia bramkarzy z osobnym trenerem: odbywają się w każdym dniu treningowym, równolegle. */
export const GK_SESSION = { name: 'Trening bramkarzy', attrs: ['REF', 'CHW', 'WYJ', 'JNJ', 'NOG'], dev: 1 };

/** Typy, które bramkarze robią razem z drużyną (reszta: osobny trening bramkarzy). */
export const GK_JOIN = new Set(['taktyka', 'stale', 'regeneracja', 'wideo', 'odprawa', 'rozruch']);

/** Dzień wolny i dzień meczowy (nie są zajęciami). */
export const DAY_KINDS = {
  match: 'Mecz', train: 'Trening', rest: 'Wolne', off: 'Urlop',
};

/** Akcenty tygodnia dla planu asystenta (ekspert 9.4: 1 akcent na tydzień). Klucze: dni względem meczu. */
export const ACCENTS = {
  zrownowazony: { name: 'Zrównoważony', 'MD-4': 'sila', 'MD-3': 'gierki', 'MD-2': 'taktyka', 'MD-1': 'rozruch' },
  fizyczny: { name: 'Fizyczny', 'MD-4': 'sila', 'MD-3': 'wytrzymalosc', 'MD-2': 'szybkosc', 'MD-1': 'rozruch' },
  techniczny: { name: 'Techniczny', 'MD-4': 'technika', 'MD-3': 'wykonczenie', 'MD-2': 'technika', 'MD-1': 'rozruch' },
  taktyczny: { name: 'Taktyczny', 'MD-4': 'obrona', 'MD-3': 'gierki', 'MD-2': 'taktyka', 'MD-1': 'taktyka' },
  stale: { name: 'Stałe fragmenty', 'MD-4': 'sila', 'MD-3': 'gierki', 'MD-2': 'stale', 'MD-1': 'stale' },
};

/** Ogólny poziom obciążeń w planie asystenta: przesuwa intensywność o jeden poziom (poza MD-1 i MD+1). */
export const LOAD_LEVELS = { niska: { name: 'Niska', shift: -1 }, normalna: { name: 'Normalna', shift: 0 }, wysoka: { name: 'Wysoka', shift: 1 } };

/** Rozwój i spadek (ekspert 9.5, rozszerzony). [SZAC] */
export const DEV = {
  rate: (age) => (age <= 19 ? 0.40 : age <= 21 ? 0.32 : age <= 23 ? 0.22 : age <= 26 ? 0.10 : age <= 28 ? 0.03 : 0),
  refStim: 16, // bodziec miesięczny przy standardowym planie (4 zajęcia o średniej intensywności na tydzień)
  trainMin: 0.5, trainMax: 1.4, // mnożnik treningu: bez treningu 0.5, standard 1.0, ciężki do 1.4
  focusStrength: 1.0, // jak mocno bodziec przesuwa przyrost na trenowane atrybuty
  capOverPot: 3, // atrybut nie przekracza POT + 3
  spurtSeason: 0.03, spurtPot: 1.5, // skok rozwojowy: 3 % na sezon do 21 lat, POT +1.5
  // Spadek: fizyczne od 29 lat, ogólny (technika i fizyczne) od 30 lat, mentalne rosną do 33 lat
  physDecline: (age) => (age >= 29 ? 0.02 * (age - 28) : 0),
  generalDecline: (age) => (age >= 30 ? ({ 30: 0.012, 31: 0.02, 32: 0.028, 33: 0.034 })[age] ?? 0.04 : 0),
  mentalGrowth: (age) => (age >= 24 && age <= 33 ? 0.015 : 0),
  gkDeclineFrom: 32,
  physAttrs: ['SZY', 'ZWI', 'WYT', 'SKO'],
  mentalAttrs: ['DEC', 'OPA', 'UST', 'LID', 'WIZ'],
};

/** Obciążenie, urazy treningowe i regeneracja. [SZAC] */
export const LOAD = {
  matchLoad: 100, // AU za 90 minut meczu
  baselineDay: 25, // dzienne obciążenie przy starcie (program indywidualny po urlopie)
  offDayLoad: 10, // urlop: program indywidualny
  injBase: 0.0015, // ekspert 8.1: 0,15 % na zawodnika na dzień treningu
  acwrMul: (r) => (r < 0.7 ? 1.15 : r <= 1.3 ? 1.0 : r <= 1.5 ? 1.5 : Math.min(4, 2.2 + 2 * (r - 1.5))),
  legsDecay: 0.4, legsFree: 0.15, legsPenalty: 0.8,
  overloadFrom: 1.3, overloadMax: 0.3,
  sharpTrainCap: 85,
  recoverBase: 6, // dodatkowa świeżość z sesji regeneracyjnej, plus 0.2 * jakość trenera przygotowania fizycznego
  injuryCats: { light: 0.78, medium: 0.19, severe: 0.03 },
  rtpDays: 10, // program powrotu po urazie
  rtpFrom: 15, // automatycznie po urazie dłuższym niż 14 dni
};

/** Zgranie drużyny (ekspert 9.2 i 4.3). [SZAC] */
export const COH = {
  famMin: 30, famStartCurrent: 60, famStartOther: 36,
  famMatch: 4, famWeekDecay: 1, instrMatch: 1.5, instrChange: 7, knowMatch: 2, knowNew: 40,
  weights: { fam: 0.45, instr: 0.2, know: 0.2, rhythm: 0.15 },
  neutral: 65, perPoint: 0.008, min: -0.4, max: 0.28, // wpływ na siłę: 0.008 pkt za punkt zgrania ponad 65
  sStart: (z) => Math.max(70, Math.min(100, Math.round(70 + 0.3 * z))), // start spójności S w silniku (ekspert 4.3)
  spDecayWeek: 4, spNeutral: 50,
  aiInstr: 88, // kluby AI: instrukcje, znajomość systemu i rytm jako jedna liczba (kalibracja: zgranie AI = gracza z planem asystenta, docs/trening-ai.md)
};

/**
 * Trening klubów AI (aiClubs.js, docs/trening-ai.md): kluby AI codziennie realizują plan asystenta z tymi samymi
 * zajęciami i wzorami co klub gracza (zmęczenie, regeneracja, ostrość, morale, urazy, bodziec rozwojowy, stałe
 * fragmenty, obóz). Trener AI wybiera akcent tygodnia według swojego typu (O ofensywny, S ostrożny, P pragmatyczny)
 * i normalny poziom obciążeń, jak domyślny plan gracza. Młodym (do focusMaxAge lat), tylko w klubach z trenerem
 * młodzieży o jakości co najmniej focusMinYouthQ, daje akcent indywidualny
 * na najsłabszy kluczowy atrybut pozycji (te same 20-30 minut po zajęciach i ten sam koszt świeżości co u gracza).
 */
export const AI_PLAN = {
  accent: { O: 'techniczny', S: 'taktyczny', P: 'zrownowazony' },
  load: 'normalna',
  focusMaxAge: 21,
  focusMinYouthQ: 11, // akcent indywidualny dla młodych tylko przy dobrym trenerze młodzieży (jakość 11+, etykieta „Dobry”)
  focusStim: 0.4, focusFresh: 2, // jak akcent indywidualny gracza (sessions.js)
};

/** Sztab szkoleniowy: role i wpływ jakości 1-20. [SZAC] */
export const STAFF_ROLES = {
  asystent: { name: 'Asystent trenera', effect: 'Taktyka i zgranie x(0.8 + 0.02 q), nauka pozycji, plan tygodnia, dokładność raportu rozwoju' },
  fizyczny: { name: 'Trener przygotowania fizycznego', effect: 'Ryzyko urazu na treningu x(1.2 - 0.02 q), regeneracja +(6 + 0.2 q), rozwój cech fizycznych, wolniejszy spadek po 29 latach' },
  bramkarze: { name: 'Trener bramkarzy', effect: 'Rozwój bramkarzy x(0.75 + 0.025 q)' },
  mlodziez: { name: 'Trener młodzieży', effect: 'Rozwój do 21 lat i akademii x(0.75 + 0.025 q), szansa skoku rozwojowego x(0.5 + 0.05 q)' },
  analityk: { name: 'Główny analityk', effect: 'Bonus analizy rywala 0.04 + 0.006 q punktu na mecz, dokładność raportów' },
};

export const staffMul = {
  dev: (q) => 0.85 + 0.015 * q,
  tac: (q) => 0.8 + 0.02 * q,
  inj: (q) => 1.2 - 0.02 * q,
  decline: (q) => 1.1 - 0.01 * q,
  recover: (q) => LOAD.recoverBase + 0.2 * q,
  gk: (q) => 0.75 + 0.025 * q,
  youth: (q) => 0.75 + 0.025 * q,
  spurt: (q) => 0.5 + 0.05 * q,
  prep: (q) => 0.04 + 0.006 * q,
};

/** Programy indywidualne. */
export const PROGRAMS = {
  mlodzi: { name: 'Program dla młodych', text: 'Dodatkowe zajęcia z trenerem młodzieży (do 21 lat): rozwój x(1.1 + 0.01 q trenera młodzieży), więcej zmęczenia.', maxAge: 21 },
  powrot: { name: 'Program powrotu po kontuzji', text: '10 dni stopniowego powrotu: intensywność najwyżej średnia, ostrość +2 dziennie, ryzyko urazu x0.7.' },
};

/** Tryby obciążenia zawodnika (zarządzanie obciążeniem). */
export const MODES = {
  normal: { name: 'Pełny trening', mul: 1 },
  light: { name: 'Lżejszy trening', mul: 0.5 },
  rest: { name: 'Odpoczynek', mul: 0 },
};

/**
 * Obozy przygotowawcze (lato: lipiec przed ligą, zima: styczeń w przerwie zimowej). [SZAC]
 * q: jakość warunków w danej porze (boiska, pogoda, spokój), rate: koszt dnia jako część rocznego przychodu bazowego klubu.
 * Polskie kluby zimą jeżdżą głównie do Turcji (Belek, Antalya), część do Hiszpanii; latem do Austrii, Słowenii albo zostają w Polsce.
 */
export const CAMP = {
  // perDay: koszt dnia obozu drużyny Ekstraklasy (ok. 35 osób: hotel, boiska, przeloty, sparingi) w zł [SZAC];
  // 1 Liga x0,65, 2 Liga x0,45, bogatszy klub wyższy standard (x do 1,3)
  dests: {
    polska: { name: 'Polska (ośrodek krajowy)', country: 'POL', rate: 0, perDay: 12000, q: { summer: 0.85, winter: 0.55 }, text: 'Tanio i blisko. Zimą mróz, śnieg i sztuczne boiska.' },
    slowenia: { name: 'Słowenia', country: 'SVN', rate: 0, perDay: 26000, q: { summer: 0.95, winter: 0.6 }, text: 'Dobre boiska i chłodniejsze noce latem. Zimą bywa zimno.' },
    austria: { name: 'Austria (Alpy)', country: 'AUT', rate: 0, perDay: 32000, q: { summer: 1.0, winter: 0.5 }, text: 'Najlepsze warunki latem: wysokość, chłód, sparingpartnerzy z całej Europy. Zimą śnieg.' },
    turcja: { name: 'Turcja (Belek, Antalya)', country: 'TUR', rate: 0, perDay: 42000, q: { summer: 0.8, winter: 1.0 }, text: 'Typowy zimowy kierunek klubów Ekstraklasy: ciepło, dobre murawy, dużo sparingpartnerów. Latem upał.' },
    hiszpania: { name: 'Hiszpania (Marbella)', country: 'ESP', rate: 0, perDay: 58000, q: { summer: 0.75, winter: 1.05 }, text: 'Najdroższy, zimą najlepsza pogoda i boiska. Latem upał.' },
  },
  lengths: [7, 10, 14],
  minDays: 5,
  homeRate: { summer: 0.45, winter: 0.3 }, // punkty formy bazowej za dzień treningu w klubie (zimą zimno)
  target: (prepDays) => Math.max(4, Math.min(12, 0.55 * prepDays)), // punkty potrzebne do formy bazowej 100 %
  baseMin: 0.3, baseMax: 1.1,
  effect: 0.4, // pkt atrybutu za każde 100 % formy bazowej poniżej lub powyżej normy
  fullDays: 21, fadeDays: 21, // efekt pełny przez 3 tygodnie od startu rundy, potem wygasa przez 3 tygodnie
  injuryPenalty: 0.8, // urazy treningowe x(1 + 0.8 * brak formy bazowej) w tym okresie
  inCamp: { injury: 0.3, dev: 0.25, fatigue: 0.12, cohesion: 0.5, morale: 0.04, know: 0.3 }, // mnożone przez q obozu
};

/** Sparingi: limity w okresach i opis poziomu rywala. [SZAC] */
export const FRIENDLY = {
  limits: { lato: 6, zima: 4, fifa: 2 },
  names: { lato: 'Okres przygotowawczy latem', zima: 'Przerwa zimowa', fifa: 'Przerwa na reprezentacje' },
  time: '17:00',
  famWeight: 0.5, // sparing daje połowę zgrania z meczu o punkty
  loadMul: 0.85, xiMin: 70, benchMin: 25,
  neighbours: ['CZE', 'SVK', 'AUT', 'HUN', 'GER', 'LTU', 'UKR'],
};
