// Województwa: grupy IV ligi (docs/iv-liga.md), grupy III ligi (makroregiony), rozmiary grup i pliki poziomu 6.
// key: jak pole `voiv` w src/data/clubs_l4.js. name: nazwa grupy IV ligi małymi literami („dolnośląska”).
// l3group: grupa III ligi województwa. size: docelowa liczba drużyn w grupie IV ligi (dane startowe 2026/27).
// minDown: najmniejsza liczba spadków z IV ligi [SZAC, decyzja właściciela D6: 3 w grupie 18-drużynowej, 2 w mniejszych].
// file: plik właściciela z klubami poziomu 6 (src/data/V liga PL), l6: nazwa poziomu 6 (V liga albo klasa okręgowa, D4).

export const VOIVODESHIPS = [
  { key: 'dolnoslaska', name: 'dolnośląska', woj: 'dolnośląskie', l3group: 3, size: 18, minDown: 3, file: 'klasa_okregowa_dolnoslaskie.txt', l6: 'klasa okręgowa' },
  { key: 'kujawsko-pomorska', name: 'kujawsko-pomorska', woj: 'kujawsko-pomorskie', l3group: 2, size: 18, minDown: 3, file: 'klasa_okregowa_kujawsko_pomorskie.txt', l6: 'klasa okręgowa' },
  { key: 'lubelska', name: 'lubelska', woj: 'lubelskie', l3group: 4, size: 16, minDown: 2, file: 'klasa_okregowa_lubelskie.txt', l6: 'klasa okręgowa' },
  { key: 'lubuska', name: 'lubuska', woj: 'lubuskie', l3group: 3, size: 18, minDown: 3, file: 'klasa_okregowa_lubuskie.txt', l6: 'klasa okręgowa' },
  { key: 'lodzka', name: 'łódzka', woj: 'łódzkie', l3group: 1, size: 18, minDown: 3, file: 'klasa_okregowa_lodzkie.txt', l6: 'klasa okręgowa' },
  { key: 'malopolska', name: 'małopolska', woj: 'małopolskie', l3group: 4, size: 18, minDown: 3, file: 'v_liga_malopolskie.txt', l6: 'V liga' },
  { key: 'mazowiecka', name: 'mazowiecka', woj: 'mazowieckie', l3group: 1, size: 18, minDown: 3, file: 'v_liga_mazowieckie.txt', l6: 'V liga' },
  { key: 'opolska', name: 'opolska', woj: 'opolskie', l3group: 3, size: 14, minDown: 2, file: 'klasa_okregowa_opolskie.txt', l6: 'klasa okręgowa' },
  { key: 'podkarpacka', name: 'podkarpacka', woj: 'podkarpackie', l3group: 4, size: 18, minDown: 3, file: 'klasa_okregowa_podkarpackie.txt', l6: 'klasa okręgowa' },
  { key: 'podlaska', name: 'podlaska', woj: 'podlaskie', l3group: 1, size: 16, minDown: 2, file: 'klasa_okregowa_podlaskie.txt', l6: 'klasa okręgowa' },
  { key: 'pomorska', name: 'pomorska', woj: 'pomorskie', l3group: 2, size: 18, minDown: 3, file: 'klasa_okregowa_pomorskie.txt', l6: 'klasa okręgowa' },
  { key: 'slaska', name: 'śląska', woj: 'śląskie', l3group: 3, size: 18, minDown: 3, file: 'v_liga_slaskie.txt', l6: 'V liga' },
  { key: 'swietokrzyska', name: 'świętokrzyska', woj: 'świętokrzyskie', l3group: 4, size: 18, minDown: 3, file: 'klasa_okregowa_swietokrzyskie.txt', l6: 'klasa okręgowa' },
  { key: 'warminsko-mazurska', name: 'warmińsko-mazurska', woj: 'warmińsko-mazurskie', l3group: 1, size: 16, minDown: 2, file: 'klasa_okregowa_warminsko_mazurskie.txt', l6: 'klasa okręgowa' },
  { key: 'wielkopolska', name: 'wielkopolska', woj: 'wielkopolskie', l3group: 2, size: 18, minDown: 3, file: 'v_liga_wielkopolskie.txt', l6: 'V liga' },
  { key: 'zachodniopomorska', name: 'zachodniopomorska', woj: 'zachodniopomorskie', l3group: 2, size: 16, minDown: 2, file: 'klasa_okregowa_zachodniopomorskie.txt', l6: 'klasa okręgowa' },
];
export const VOIV = Object.fromEntries(VOIVODESHIPS.map((v) => [v.key, v]));

/** Region klubu (pole `region` w danych klubów lig 1-4) -> województwo. Kluby IV ligi mają własne pole `voiv`. */
export const REGION_WOJ = {
  warszawa: 'mazowiecka', poznan: 'wielkopolska', czestochowa: 'slaska', bialystok: 'podlaska', lodz: 'lodzka',
  szczecin: 'zachodniopomorska', krakow: 'malopolska', slask: 'slaska', wroclaw: 'dolnoslaska', 'dolny-slask': 'dolnoslaska',
  lublin: 'lubelska', kielce: 'swietokrzyska', radom: 'mazowiecka', plock: 'mazowiecka', trojmiasto: 'pomorska',
  podkarpacie: 'podkarpacka', malopolska: 'malopolska', rzeszow: 'podkarpacka', bielsko: 'slaska', opole: 'opolska',
  mazowsze: 'mazowiecka', lodzkie: 'lodzka', bydgoszcz: 'kujawsko-pomorska', pomorze: 'pomorska', kujawy: 'kujawsko-pomorska',
  lubuskie: 'lubuska', wielkopolska: 'wielkopolska', suwalki: 'podlaska', 'minsk-mazowiecki': 'mazowiecka',
  'nowy-dwor-mazowiecki': 'mazowiecka', sieradz: 'lodzka', zabki: 'mazowiecka', lowicz: 'lodzka', zambrow: 'podlaska',
  elblag: 'warminsko-mazurska', 'lidzbark-warminski': 'warminsko-mazurska', 'tomaszow-mazowiecki': 'lodzka', mlawa: 'mazowiecka',
  troszyn: 'mazowiecka', lomza: 'podlaska', 'sroda-wielkopolska': 'wielkopolska', stargard: 'zachodniopomorska', luzino: 'pomorska',
  swiecie: 'kujawsko-pomorska', swarzedz: 'wielkopolska', koszalin: 'zachodniopomorska', czarnkow: 'wielkopolska',
  kalisz: 'wielkopolska', torun: 'kujawsko-pomorska', gdansk: 'pomorska', 'nowy-staw': 'pomorska', swinoujscie: 'zachodniopomorska',
  steszew: 'wielkopolska', wrzesnia: 'wielkopolska', kornik: 'wielkopolska', sosnowiec: 'slaska', katowice: 'slaska',
  'bytom-odrzanski': 'lubuska', lubin: 'dolnoslaska', rybnik: 'slaska', legnica: 'dolnoslaska', 'jelenia-gora': 'dolnoslaska',
  kluczbork: 'opolska', polkowice: 'dolnoslaska', sulow: 'dolnoslaska', 'goczalkowice-zdroj': 'slaska', brzeg: 'opolska',
  'gorzow-wielkopolski': 'lubuska', gubin: 'lubuska', nysa: 'opolska', chelm: 'lubelska', 'ostrowiec-swietokrzyski': 'swietokrzyska',
  zamosc: 'lubelska', debica: 'podkarpacka', polaniec: 'swietokrzyska', jedrzejow: 'swietokrzyska', skawina: 'malopolska',
  starachowice: 'swietokrzyska', tarnobrzeg: 'podkarpacka', jaroslaw: 'podkarpacka', 'busko-zdroj': 'swietokrzyska',
  'kolbuszowa-dolna': 'podkarpacka', 'biala-podlaska': 'lubelska', morawica: 'swietokrzyska', lubaczow: 'podkarpacka',
};

/** Województwo klubu z danych (pole voiv albo region klubu lig 1-4); null, gdy nieznane. */
export const voivOfData = (c) => (c ? c.voiv ?? REGION_WOJ[c.region] ?? null : null);
