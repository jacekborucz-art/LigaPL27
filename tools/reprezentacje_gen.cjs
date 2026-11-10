// Generator pliku reprezentacje.json (stan wiedzy: 2026-11-10)
const fs = require('fs');
const OUT = require('path').join(__dirname, '../src/data/reprezentacje.json');

// ---------- Wzór siły L ----------
function liczL(elo) {
  const raw = 7 + (elo - 860) / 125;
  const soft = raw > 16.5 ? 16.5 + (raw - 16.5) * 0.25 : raw;
  return Math.round(Math.max(6.5, soft) * 10) / 10;
}

const FIFA_OKT = 'FIFA 2026-10-07 (źródło)';
const FIFA_LIP = 'FIFA 2026-07-20 (źródło)';
const FIFA_SZAC = 'szacunek (brak pozycji w dostępnych źródłach)';

// kod, nazwa, konf, fifa, fifaZrodlo, eloSzac, liga, grupa
const T = [
  // Liga A
  ['FRA','Francja','UEFA',3,FIFA_OKT,2080,'A','A1'],
  ['ITA','Włochy','UEFA',15,FIFA_OKT,1900,'A','A1'],
  ['BEL','Belgia','UEFA',8,FIFA_OKT,1910,'A','A1'],
  ['TUR','Turcja','UEFA',27,FIFA_LIP,1870,'A','A1'],
  ['GER','Niemcy','UEFA',13,FIFA_OKT,1960,'A','A2'],
  ['NED','Holandia','UEFA',9,FIFA_OKT,1980,'A','A2'],
  ['SRB','Serbia','UEFA',38,FIFA_SZAC,1760,'A','A2'],
  ['GRE','Grecja','UEFA',39,FIFA_SZAC,1770,'A','A2'],
  ['ESP','Hiszpania','UEFA',1,FIFA_OKT,2160,'A','A3'],
  ['ENG','Anglia','UEFA',4,FIFA_OKT,2050,'A','A3'],
  ['CRO','Chorwacja','UEFA',14,FIFA_OKT,1930,'A','A3'],
  ['CZE','Czechy','UEFA',41,FIFA_SZAC,1740,'A','A3'],
  ['POR','Portugalia','UEFA',5,FIFA_OKT,2000,'A','A4'],
  ['DEN','Dania','UEFA',21,FIFA_LIP,1870,'A','A4'],
  ['NOR','Norwegia','UEFA',19,FIFA_LIP,1970,'A','A4'],
  ['WAL','Walia','UEFA',43,FIFA_SZAC,1730,'A','A4'],
  // Liga B
  ['SCO','Szkocja','UEFA',42,FIFA_LIP,1740,'B','B1'],
  ['SUI','Szwajcaria','UEFA',12,FIFA_OKT,1890,'B','B1'],
  ['SVN','Słowenia','UEFA',55,FIFA_SZAC,1680,'B','B1'],
  ['MKD','Macedonia Północna','UEFA',66,FIFA_SZAC,1600,'B','B1'],
  ['HUN','Węgry','UEFA',44,FIFA_SZAC,1720,'B','B2'],
  ['UKR','Ukraina','UEFA',33,FIFA_LIP,1760,'B','B2'],
  ['GEO','Gruzja','UEFA',70,FIFA_SZAC,1690,'B','B2'],
  ['NIR','Irlandia Północna','UEFA',68,FIFA_SZAC,1630,'B','B2'],
  ['ISR','Izrael','UEFA',76,FIFA_SZAC,1630,'B','B3'],
  ['AUT','Austria','UEFA',23,FIFA_LIP,1860,'B','B3'],
  ['IRL','Irlandia','UEFA',58,FIFA_SZAC,1690,'B','B3'],
  ['KOS','Kosowo','UEFA',75,FIFA_SZAC,1630,'B','B3'],
  ['POL','Polska','UEFA',37,FIFA_OKT,1735,'B','B4'],
  ['SWE','Szwecja','UEFA',37,FIFA_LIP,1790,'B','B4'],
  ['BIH','Bośnia i Hercegowina','UEFA',65,FIFA_SZAC,1700,'B','B4'],
  ['ROU','Rumunia','UEFA',53,FIFA_SZAC,1660,'B','B4'],
  // Liga C
  ['ALB','Albania','UEFA',62,FIFA_SZAC,1660,'C','C1'],
  ['FIN','Finlandia','UEFA',72,FIFA_SZAC,1590,'C','C1'],
  ['BLR','Białoruś','UEFA',100,FIFA_SZAC,1460,'C','C1'],
  ['SMR','San Marino','UEFA',210,FIFA_SZAC,860,'C','C1'],
  ['MNE','Czarnogóra','UEFA',80,FIFA_SZAC,1540,'C','C2'],
  ['ARM','Armenia','UEFA',105,FIFA_SZAC,1450,'C','C2'],
  ['CYP','Cypr','UEFA',125,FIFA_SZAC,1390,'C','C2'],
  ['LVA','Łotwa','UEFA',138,FIFA_SZAC,1320,'C','C2'],
  ['KAZ','Kazachstan','UEFA',110,FIFA_SZAC,1440,'C','C3'],
  ['SVK','Słowacja','UEFA',52,FIFA_SZAC,1700,'C','C3'],
  ['FRO','Wyspy Owcze','UEFA',135,FIFA_SZAC,1420,'C','C3'],
  ['MDA','Mołdawia','UEFA',155,FIFA_SZAC,1270,'C','C3'],
  ['ISL','Islandia','UEFA',74,FIFA_SZAC,1620,'C','C4'],
  ['BUL','Bułgaria','UEFA',85,FIFA_SZAC,1510,'C','C4'],
  ['EST','Estonia','UEFA',128,FIFA_SZAC,1350,'C','C4'],
  ['LUX','Luksemburg','UEFA',93,FIFA_SZAC,1460,'C','C4'],
  // Liga D
  ['GIB','Gibraltar','UEFA',200,FIFA_SZAC,1040,'D','D1'],
  ['MLT','Malta','UEFA',170,FIFA_SZAC,1240,'D','D1'],
  ['AND','Andora','UEFA',173,FIFA_SZAC,1140,'D','D1'],
  ['LTU','Litwa','UEFA',143,FIFA_SZAC,1300,'D','D2'],
  ['AZE','Azerbejdżan','UEFA',120,FIFA_SZAC,1330,'D','D2'],
  ['LIE','Liechtenstein','UEFA',205,FIFA_SZAC,1000,'D','D2'],
  // UEFA zawieszona
  ['RUS','Rosja','UEFA',35,FIFA_LIP,1750,null,null],
  // Spoza Europy
  ['ARG','Argentyna','CONMEBOL',2,FIFA_OKT,2140,null,null],
  ['BRA','Brazylia','CONMEBOL',6,FIFA_OKT,2000,null,null],
  ['MAR','Maroko','CAF',7,FIFA_OKT,1930,null,null],
  ['MEX','Meksyk','CONCACAF',10,FIFA_OKT,1850,null,null],
  ['COL','Kolumbia','CONMEBOL',11,FIFA_OKT,1960,null,null],
  ['USA','USA','CONCACAF',16,FIFA_OKT,1820,null,null],
  ['JPN','Japonia','AFC',17,FIFA_OKT,1900,null,null],
  ['SEN','Senegal','CAF',18,FIFA_LIP,1860,null,null],
  ['URU','Urugwaj','CONMEBOL',20,FIFA_LIP,1900,null,null],
  ['IRN','Iran','AFC',22,FIFA_LIP,1800,null,null],
  ['EGY','Egipt','CAF',24,FIFA_LIP,1760,null,null],
  ['ECU','Ekwador','CONMEBOL',25,FIFA_LIP,1910,null,null],
  ['NGA','Nigeria','CAF',26,FIFA_LIP,1740,null,null],
  ['AUS','Australia','AFC',28,FIFA_LIP,1780,null,null],
  ['CAN','Kanada','CONCACAF',30,FIFA_LIP,1770,null,null],
  ['CIV','Wybrzeże Kości Słoniowej','CAF',31,FIFA_LIP,1760,null,null],
  ['KOR','Korea Płd.','AFC',32,FIFA_LIP,1790,null,null],
  ['PAR','Paragwaj','CONMEBOL',34,FIFA_LIP,1850,null,null],
  ['PAN','Panama','CONCACAF',46,FIFA_SZAC,1720,null,null],
  ['ALG','Algieria','CAF',36,FIFA_SZAC,1740,null,null],
  ['TUN','Tunezja','CAF',51,FIFA_SZAC,1690,null,null],
  ['CMR','Kamerun','CAF',45,FIFA_SZAC,1680,null,null],
  ['MLI','Mali','CAF',47,FIFA_OKT,1690,null,null],
  ['RSA','RPA','CAF',48,FIFA_OKT,1660,null,null],
  ['VEN','Wenezuela','CONMEBOL',49,FIFA_OKT,1720,null,null],
  ['CHI','Chile','CONMEBOL',50,FIFA_OKT,1690,null,null],
];

const reprezentacje = T.map(([kod,nazwa,konf,fifa,fz,elo,liga,grupa]) => ({
  kod, nazwa, konfederacja: konf,
  rankingFIFA: fifa,
  rankingFIFAzrodlo: fz,
  elo: elo,
  eloZrodlo: 'szacunek (eloratings.net niedostępne; wartość przybliżona, do podmiany)',
  L: liczL(elo),
  ligaLN: liga,
  grupaLN: grupa,
  status: kod === 'RUS' ? 'zawieszona przez UEFA/FIFA, nie gra w LN ani eliminacjach' : 'aktywna',
  pewnosc: (fz === FIFA_SZAC ? 'szacunek' : 'pewne (ranking FIFA)') + '; elo i L: szacunek' +
           (liga ? '; skład grupy LN: pewne' : ''),
}));

// ---------- Grupy LN ----------
const grupy = {};
for (const r of reprezentacje) if (r.grupaLN) (grupy[r.grupaLN] ||= []).push(r.nazwa);

// ---------- Terminarz LN ----------
const kolejki = [
  { kolejka: 1, od: '2026-09-24', do: '2026-09-26', data: '2026-09-25' },
  { kolejka: 2, od: '2026-09-27', do: '2026-09-29', data: '2026-09-28' },
  { kolejka: 3, od: '2026-09-30', do: '2026-10-03', data: '2026-10-02' },
  { kolejka: 4, od: '2026-10-04', do: '2026-10-06', data: '2026-10-05' },
  { kolejka: 5, od: '2026-11-12', do: '2026-11-14', data: '2026-11-14' },
  { kolejka: 6, od: '2026-11-15', do: '2026-11-17', data: '2026-11-17' },
];
const DZIS = '2026-11-10';

// Grupa B4: rzeczywisty terminarz i wyniki ze źródeł
const B4 = [
  [1,'2026-09-25','Polska','Bośnia i Hercegowina','0:0','pewne','Warszawa, PGE Narodowy'],
  [1,'2026-09-25','Szwecja','Rumunia','2:1','pewne (1 źródło wyniku: vavel; zgodne z tabelą)',null],
  [2,'2026-09-28','Szwecja','Polska','3:1','pewne','Solna, Strawberry Arena'],
  [2,'2026-09-28','Rumunia','Bośnia i Hercegowina','2:4','pewne (1 źródło wyniku: vavel; zgodne z tabelą)',null],
  [3,'2026-10-02','Polska','Rumunia','6:0','pewne','Warszawa, PGE Narodowy'],
  [3,'2026-10-02','Bośnia i Hercegowina','Szwecja','1:1','pewne','Zenica, Bilino Polje'],
  [4,'2026-10-05','Bośnia i Hercegowina','Polska','1:0','pewne','Zenica, Bilino Polje'],
  [4,'2026-10-05','Rumunia','Szwecja','0:1','pewne',null],
  [5,'2026-11-14','Rumunia','Polska',null,'pewne (termin)',null],
  [5,'2026-11-14','Szwecja','Bośnia i Hercegowina',null,'szacunek (data i gospodarz wywnioskowane z kolejki)',null],
  [6,'2026-11-17','Polska','Szwecja',null,'pewne (termin)','Wrocław, Tarczyński Arena'],
  [6,'2026-11-17','Bośnia i Hercegowina','Rumunia',null,'szacunek (data i gospodarz wywnioskowane z kolejki)',null],
];

const terminarz = [];
for (const [k,data,g,a,w,p,miejsce] of B4) {
  terminarz.push({ data, kolejka: k, grupa: 'B4', gospodarz: g, gosc: a, wynik: w,
    status: w ? 'rozegrany' : 'zaplanowany', pewnosc: p, ...(miejsce ? { miejsce } : {}) });
}

// Pozostałe grupy: wzorzec dwurundowy (parowanie NIE jest oficjalne)
const wzorzec4 = [[[0,1],[2,3]],[[3,0],[1,2]],[[0,2],[3,1]],[[2,0],[1,3]],[[1,0],[3,2]],[[0,3],[2,1]]];
const wzorzec3 = [[[0,1]],[[2,0]],[[1,2]],[[1,0]],[[0,2]],[[2,1]]];
for (const [g, druzyny] of Object.entries(grupy)) {
  if (g === 'B4') continue;
  const wz = druzyny.length === 4 ? wzorzec4 : wzorzec3;
  wz.forEach((pary, i) => {
    const kol = kolejki[i];
    for (const [h,a] of pary) {
      const rozegrany = kol.do <= DZIS;
      terminarz.push({ data: kol.data, okno: `${kol.od}..${kol.do}`, kolejka: kol.kolejka, grupa: g,
        gospodarz: druzyny[h], gosc: druzyny[a], wynik: null,
        status: rozegrany ? 'rozegrany_wynik_nieznany' : 'zaplanowany',
        pewnosc: 'szacunek: okno kolejki pewne, parowanie i gospodarz wg wzorca gry (nieoficjalne)' });
    }
  });
}
terminarz.sort((x,y) => x.data.localeCompare(y.data) || x.grupa.localeCompare(y.grupa));

const tabelaB4 = [
  { druzyna: 'Szwecja', m: 4, pkt: 10, bramki: '7:3' },
  { druzyna: 'Bośnia i Hercegowina', m: 4, pkt: 8, bramki: '6:3' },
  { druzyna: 'Polska', m: 4, pkt: 4, bramki: '7:5' },
  { druzyna: 'Rumunia', m: 4, pkt: 0, bramki: '3:13' },
];

const ligaNarodow2026 = {
  format: {
    uczestnicy: 54,
    uwagaRosja: 'Rosja wykluczona; 54 z 55 federacji UEFA',
    ligi: {
      A: { druzyny: 16, grupy: 4, wielkoscGrupy: 4, meczeNaDruzyne: 6 },
      B: { druzyny: 16, grupy: 4, wielkoscGrupy: 4, meczeNaDruzyne: 6 },
      C: { druzyny: 16, grupy: 4, wielkoscGrupy: 4, meczeNaDruzyne: 6 },
      D: { druzyny: 6, grupy: 2, wielkoscGrupy: 3, meczeNaDruzyne: 4 },
    },
    fazaLigowa: { od: '2026-09-24', do: '2026-11-17', system: 'każdy z każdym, mecz i rewanż' },
    kolejki,
    fazaPucharowa: {
      cwiercfinalyA: { uczestnicy: '1. i 2. miejsca grup ligi A (8 drużyn)', format: 'dwumecz', okno: '2027-03-25..2027-03-30', pewnosc: 'pewne (okno), losowanie: szacunek koniec XI 2026' },
      finalyLN: { format: 'Final Four: półfinały, mecz o 3. miejsce, finał', okno: '2027-06-09..2027-06-13', gospodarz: 'nieznany', pewnosc: 'okno: prawdopodobne (2 źródła wtórne)' },
      barazAB: { uczestnicy: '2 najsłabsze 3. miejsca A + 2 najlepsze 4. miejsca A vs 4 zwycięzców... wróć: vs 4 drużyny z 2. miejsc ligi B', format: 'dwumecz', okno: '2027-03-25..2027-03-30', pewnosc: 'szacunek (rekonstrukcja z FourFourTwo/Sports Digest)' },
      barazBC: { uczestnicy: '4. miejsca ligi B vs 2. miejsca ligi C', format: 'dwumecz', okno: '2027-03-25..2027-03-30', pewnosc: 'prawdopodobne' },
      barazCD: { uczestnicy: 'brak', uwaga: 'Liga D znika od 2028/29, wszystkie 6 drużyn D awansuje; część źródeł wspomina baraże C/D w III 2028, sprzeczne', pewnosc: 'niepewne' },
    },
    przejscieDo2028: {
      opis: 'Od edycji 2028/29 trzy ligi po 18 drużyn (A, B, C). Rozdział wg wyników 2026/27.',
      ligaA2028: ['8 ćwierćfinalistów A', '2 najlepsze 3. miejsca A', '4 zwycięzców grup B', '4 zwycięzców baraży A/B'],
      ligaB2028: ['2 najsłabsze 4. miejsca A (spadek bezpośredni)', '4 przegranych baraży A/B', '4 drużyny z 3. miejsc B', '4 zwycięzców grup C', '4 zwycięzców baraży B/C'],
      ligaC2028: ['4 przegranych baraży B/C', '8 drużyn z 3. i 4. miejsc C', '6 drużyn ligi D'],
      pewnosc: 'szacunek (FourFourTwo, Sports Digest; Wikipedia podaje inaczej spadek z A)',
    },
    powiazanieEuro2028: 'Ranking końcowy LN 2026/27 służy do koszyków eliminacji Euro 2028; najlepsi zwycięzcy grup LN bez awansu z eliminacji trafiają do baraży (III 2028).',
  },
  grupy,
  grupaPolski: {
    grupa: 'B4', rywale: ['Szwecja', 'Bośnia i Hercegowina', 'Rumunia'],
    tabelaPo4Kolejkach: tabelaB4,
    uwaga: 'Polska spadła z ligi A po LN 2024/25; pierwszy raz gra w lidze B. 3. miejsce = utrzymanie w B 2028/29 bez baraży; 2. miejsce = baraż A/B; 4. miejsce = baraż B/C (wg rekonstrukcji formatu).',
  },
  terminarz,
};
// poprawka opisu barażu A/B (czytelność)
ligaNarodow2026.format.fazaPucharowa.barazAB.uczestnicy = '2 najsłabsze 3. miejsca ligi A + 2 najlepsze 4. miejsca ligi A vs 4 drużyny z 2. miejsc grup ligi B';

const eliminacjeEuro2028 = {
  format: {
    losowanie: { data: '2026-12-06', miejsce: 'Belfast', pewnosc: 'pewne (UEFA)' },
    grupy: '12 grup po 4 lub 5 drużyn (prawdopodobnie 6x5 + 6x4 = 54), mecz i rewanż',
    grupy4vs5: 'szacunek: 24 drużyny grające w marcu 2027 w ćwierćfinałach LN i barażach A/B, B/C trafiają do grup 4-zespołowych (start w czerwcu); pozostałe do grup 5-zespołowych (start w marcu). Do potwierdzenia po losowaniu.',
    koszyki: 'szacunek: wg rankingu końcowego / po fazie ligowej LN 2026/27; koszyk 1 = miejsca 1-12, 2 = 13-24, 3 = 25-36, 4 = 37-48, 5 = 49-54',
    gospodarze: 'Anglia, Irlandia, Szkocja, Walia grają w eliminacjach, rozlosowane do różnych grup; 2 miejsca zarezerwowane dla dwóch najwyżej sklasyfikowanych gospodarzy bez awansu',
    awans: '12 zwycięzców grup + 8 najlepszych drużyn z 2. miejsc = 20 bezpośrednio; pozostałe 4 miejsca: baraże (III 2028) lub miejsca gospodarzy',
    baraze: 'pozostałe drużyny z 2. miejsc + najlepsi zwycięzcy grup LN 2026/27 bez awansu; jednomeczowe półfinały i finały albo dwumecze zależnie od liczby wolnych miejsc',
    polskaKoszykSzac: 'koszyk 3 jeśli Polska skończy 3. w B4 (pozycja ok. 25-28); 2. miejsce dałoby koszyk 2 lub 3',
  },
  terminy: [
    { kolejka: 1, od: '2027-03-26', do: '2027-03-27', pewnosc: 'źródło wtórne (lustro Wikipedii)' },
    { kolejka: 2, od: '2027-03-29', do: '2027-03-30', pewnosc: 'źródło wtórne' },
    { kolejka: 3, od: '2027-06-11', do: '2027-06-12', pewnosc: 'źródło wtórne' },
    { kolejka: 4, od: '2027-06-14', do: '2027-06-15', pewnosc: 'źródło wtórne' },
    { kolejka: 5, od: '2027-09-23', do: '2027-09-25', pewnosc: 'źródło wtórne' },
    { kolejka: 6, od: '2027-09-26', do: '2027-09-29', pewnosc: 'źródło wtórne' },
    { kolejka: 7, od: '2027-09-29', do: '2027-10-02', pewnosc: 'źródło wtórne' },
    { kolejka: 8, od: '2027-10-03', do: '2027-10-05', pewnosc: 'źródło wtórne' },
    { kolejka: 9, od: '2027-11-11', do: '2027-11-13', pewnosc: 'źródło wtórne' },
    { kolejka: 10, od: '2027-11-14', do: '2027-11-16', pewnosc: 'źródło wtórne' },
    { etap: 'baraże półfinały', od: '2028-03-23', do: '2028-03-25', pewnosc: 'źródło wtórne' },
    { etap: 'baraże finały', od: '2028-03-26', do: '2028-03-28', pewnosc: 'źródło wtórne' },
  ],
  turniejEuro2028: {
    gospodarze: ['Anglia', 'Irlandia', 'Szkocja', 'Walia'],
    od: '2028-06-09', do: '2028-07-09',
    otwarcie: 'Cardiff (2028-06-09)', final: 'Wembley (2028-07-09)', polfinaly: 'Wembley (2028-07-04, 2028-07-05)',
    druzyny: 24, mecze: 51, stadiony: 9,
    format: '6 grup po 4; awans: 2 najlepsze + 4 najlepsze z 3. miejsc do 1/8 finału; potem drabinka pucharowa',
    losowanieTurnieju: 'XII 2027 (szacunek)',
    pewnosc: 'daty i miejsca: pewne (UEFA); format 24 drużyn: pewne',
  },
};

const oknaFIFA = [
  { od: '2026-09-21', do: '2026-10-06', mecze: 4, uwagi: 'Pierwsze połączone okno wrzesień/październik (16 dni). LN kolejki 1-4. Pewne.' },
  { od: '2026-11-09', do: '2026-11-17', mecze: 2, uwagi: 'LN kolejki 5-6; baraże ME U21 (9-17 XI). Pewne.' },
  { od: '2027-03-22', do: '2027-03-30', mecze: 2, uwagi: 'Ćwierćfinały LN i baraże A/B, B/C (25-30 III); eliminacje Euro 2028 kolejki 1-2 (26-30 III). Źródło wtórne.' },
  { od: '2027-06-07', do: '2027-06-15', mecze: 2, uwagi: 'Finały LN (9-13 VI); eliminacje Euro 2028 kolejki 3-4 (11-15 VI). Źródło wtórne. Równolegle Złoty Puchar CONCACAF i PNA.' },
  { od: '2027-09-20', do: '2027-10-05', mecze: 4, uwagi: 'Eliminacje Euro 2028 kolejki 5-8. Źródło wtórne.' },
  { od: '2027-11-08', do: '2027-11-16', mecze: 2, uwagi: 'Eliminacje Euro 2028 kolejki 9-10. Źródło wtórne.' },
  { od: '2028-03-20', do: '2028-03-28', mecze: 2, uwagi: 'Baraże Euro 2028 (23-28 III); reszta: towarzyskie. Źródło wtórne.' },
  { od: '2028-05-29', do: '2028-06-06', mecze: 2, uwagi: 'Sparingi przed Euro 2028. Źródło wtórne.' },
  { od: '2028-06-09', do: '2028-07-09', mecze: null, uwagi: 'Turniej Euro 2028 (nie jest oknem, okres turniejowy). Pewne.' },
  { od: '2028-09-18', do: '2028-10-03', mecze: 4, uwagi: 'LN 2028/29 faza ligowa (szacunek). Daty okna niepotwierdzone.' },
  { od: '2028-11-13', do: '2028-11-21', mecze: 2, uwagi: 'LN 2028/29 faza ligowa (szacunek). Daty z 1 źródła wtórnego.' },
  { od: '2029-03-19', do: '2029-03-27', mecze: 2, uwagi: 'Szacunek wg wzorca. Ćwierćfinały/baraże LN 2028/29.' },
  { od: '2029-06-04', do: '2029-06-12', mecze: 2, uwagi: 'Szacunek wg wzorca. Finały LN 2028/29 (szacunek).' },
  { od: '2029-09-24', do: '2029-10-09', mecze: 4, uwagi: 'Szacunek wg wzorca. Eliminacje MŚ 2030.' },
  { od: '2029-11-12', do: '2029-11-20', mecze: 2, uwagi: 'Szacunek wg wzorca. Eliminacje MŚ 2030.' },
  { od: '2030-03-18', do: '2030-03-26', mecze: 2, uwagi: 'Szacunek wg wzorca. Baraże MŚ 2030.' },
  { od: '2030-06-08', do: '2030-07-21', mecze: null, uwagi: 'MŚ 2030 (daty z 1-2 źródeł wtórnych, nieoficjalne).' },
  { od: '2030-09-23', do: '2030-10-08', mecze: 4, uwagi: 'Z 1 źródła wtórnego, niezweryfikowane. LN 2030/31.' },
  { od: '2030-11-11', do: '2030-11-19', mecze: 2, uwagi: 'Z 1 źródła wtórnego, niezweryfikowane.' },
];

const towarzyskiePolski = [];
const towarzyskieUwagi = {
  sezon2026_27: 'Brak potwierdzonych meczów towarzyskich Polski. Okna IX/X i XI 2026 w całości zajmuje LN (6 meczów). W III 2027 Polska (jeśli zajmie 3. miejsce w B4) nie gra baraży LN i najpewniej zagra 2 mecze eliminacji Euro 2028; w VI 2027 kolejne eliminacje. Towarzyskie możliwe tylko przy wolnym slocie (grupa 4-zespołowa lub pauza).',
  kontekst2025_26: 'Przed startem gry: Polska przegrała baraż o MŚ 2026 ze Szwecją (III 2026); sparingi z Ukrainą (2026-05-31, Wrocław) i Nigerią (2026-06-03, Warszawa) – wyniki niezweryfikowane, poza zakresem sezonu gry.',
  regulaGeneratora: 'Jeśli w oknie FIFA reprezentacja ma mniej meczów niż limit okna, dolosuj sparing z rywalem o |L_rywal - L_POL| <= 2.5 (60% UEFA, 40% spoza UEFA); gospodarz naprzemiennie.',
};

const cyklPrzyszly = {
  wzorzecOgolny: [
    'Rok parzysty, jesień (IX-XI): faza ligowa Ligi Narodów (6 meczów).',
    'Rok nieparzysty, marzec: ćwierćfinały LN + baraże między ligami; czerwiec: finały LN (4 drużyny).',
    'Rok nieparzysty (III-XI): eliminacje turnieju następnego roku; baraże w marcu roku turniejowego.',
    'Rok podzielny przez 4 (2028, 2032): Euro w VI-VII. Rok parzysty niepodzielny przez 4 (2030, 2034): MŚ w VI-VII.',
    'Wyjątek 2028/29-2029/30: LN 2028/29 jesienią 2028, eliminacje MŚ 2030 w 2029 (nowy format).',
  ],
  ligaNarodow2028: {
    format: '3 ligi (A, B, C) po 18 drużyn; 3 grupy po 6 w każdej lidze (1 źródło); ćwierćfinały, Final Four i baraże zostają',
    faza: 'IX-XI 2028 (szacunek)', finaly: 'VI 2029 (szacunek)',
    meczeNaDruzyne: 'nieustalone w źródłach; do gry przyjąć 6 (szacunek)',
    pewnosc: 'koncepcja zatwierdzona 2026-05-21 (Komitet Wykonawczy UEFA, Stambuł); szczegóły do zatwierdzenia 2026-09-15 (wynik nieznany)',
  },
  eliminacjeMS2030: {
    format: 'Liga 1: 36 drużyn (ligi A+B LN 2028/29), 3 grupy po 12, każda drużyna 6 meczów (po 2 rywali z każdego z 3 koszyków, mecz u siebie albo na wyjeździe, system szwajcarski). Liga 2: pozostałe 18-19 drużyn (grupy po 6, jedna po 7, wg 1 źródła). Najlepsi z grup Ligi 1 awansują, reszta miejsc w barażach.',
    miejscaUEFA: 'ok. 16 (szacunek, niepotwierdzone)',
    terminy: 'mecze 2029 (szacunek: IX-XI 2029), baraże III 2030 (szacunek)',
    gospodarze: 'Hiszpania i Portugalia mają awans, ale grają w eliminacjach (ranking do LN)',
    pewnosc: 'szacunek',
  },
  ms2030: {
    gospodarze: ['Hiszpania', 'Portugalia', 'Maroko'], meczeOtwarcia: ['Urugwaj', 'Argentyna', 'Paragwaj'],
    druzyny: 48, format: '12 grup po 4; 2 najlepsze + 8 najlepszych z 3. miejsc do 1/16 finału (jak MŚ 2026)',
    od: '2030-06-08', do: '2030-07-21', pewnosc: '48 drużyn i gospodarze: pewne; daty i format: szacunek (źródła wtórne)',
  },
  euro2032: { gospodarze: ['Włochy', 'Turcja'], eliminacje: '2031 w nowym formacie Liga 1/Liga 2 (szacunek)', turniej: 'VI-VII 2032' },
  u21: {
    euroU21_2027: { gospodarze: ['Albania', 'Serbia'], od: '2027-06-11', do: '2027-07-04', druzyny: 16,
      polska: 'awans bezpośredni jako najlepsza drużyna z 2. miejsca (grupa E: Włochy 1. po bilansie bramek)', pewnosc: 'prawdopodobne (Flashscore, Unione Sarda)' },
    eliminacjeEuroU21_2027: { grupy: 9, druzyny: 51, awans: '9 zwycięzców + najlepsza z 2. miejsc; 8 pozostałych z 2. miejsc gra baraże 9-17 XI 2026', terminy: 'III 2025 - X 2026, w oknach FIFA' },
    eliminacjeEuroU21_2029: { uwaga: 'szacunek wg wzorca: losowanie ok. I-II 2027, mecze III 2027 - X 2028 w oknach FIFA, rocznik: urodzeni od 2006-01-01 (szacunek)' },
  },
};

const modelPowolan = {
  liczbaPowolanych: { min: 23, typowo: 25, max: 26, bramkarze: 3, uwaga: '23 w protokole meczowym; federacje zwykle powołują 23-28, gra przyjmuje 25' },
  powolanieWOknie: 'Zawodnik powołany opuszcza klub na całe okno FIFA (IX/X: do 16 dni; inne: 9 dni). Ryzyko kontuzji i zmęczenia po powrocie.',
  udzialLigiKrajowej: [
    { przedzialL: '>=15.5', udzial: '0-10%', przyklady: 'Hiszpania, Francja, Anglia (w Anglii wyjątek: ~100% z ligi krajowej, bo to Premier League)' },
    { przedzialL: '14-15.5', udzial: '5-20%', przyklady: 'Polska: zwykle 2-5 graczy z Ekstraklasy (np. Oskar Wójcik, Cracovia)' },
    { przedzialL: '12.5-14', udzial: '15-35%', przyklady: 'Rumunia, Bośnia, Irlandia, Słowenia' },
    { przedzialL: '11-12.5', udzial: '30-60%', przyklady: 'Bułgaria, Białoruś, Wyspy Owcze; Kazachstan wyjątek ok. 80-90%' },
    { przedzialL: '<11', udzial: '60-95%', przyklady: 'Malta, Gibraltar, Andora, San Marino (część graczy z niższych lig włoskich/hiszpańskich)' },
  ],
  pewnosc: 'szacunek (brak źródłowej statystyki dla wszystkich krajów)',
  zasadyDlaGry: [
    'Pula: zawodnicy z obywatelstwem kraju, wiek 17-36, nie kontuzjowani.',
    'Ranking kandydatów: ocena zawodnika + 0.3 * forma - kara za brak minut (np. -1.0 jeśli < 30% minut w klubie).',
    'Wybór: 3 GK, 8-9 obrońców, 8-9 pomocników, 5-6 napastników; brak powołania jeśli ocena < L_kadry - 2.0.',
    'Polskie kluby: gracz Ekstraklasy z oceną >= ok. 13.0 ma realną szansę na kadrę Polski; gracze z mniejszych krajów (np. Gruzja, Litwa, Łotwa, Estonia, Mołdawia) powoływani już od ok. L_kadry - 1.5.',
    'U21: powołania w tych samych oknach (zawodnik może być wybrany tylko do jednej kadry w oknie; seniorska ma pierwszeństwo).',
  ],
};

const data = {
  meta: {
    stanNa: '2026-11-10',
    opis: 'Dane reprezentacji do lekkiej gry managerskiej (polskie ligi, start 2026/27).',
    zrodla: [
      'https://www.englandfootball.com/articles/2026/Feb/12/uefa-nations-league-2026-27-draw-made-20261202',
      'https://www.dfb.de/news/nations-league-germany-to-face-netherlands-serbia-and-greece',
      'https://www.nfsbih.ba/en/news/football-m/a-national-team-m/dragons-learn-their-uefa-nations-league-opponents/',
      'https://romania-insider.com/romanias-football-team-group-nations-league-feb-2026',
      'https://www.hungarianconservative.com/articles/culture_society/ukraine-hungary-georgia-northern-ireland-nations-league/',
      'https://www.irishtimes.com/sport/soccer/2026/02/12/fai-confirms-israel-fixtures-will-be-fulfilled-despite-previous-motion-sent-to-uefa/',
      'https://www.joe.co.uk/sport/nations-league-2026-27-draw-england-learn-their-opponents-522721',
      'https://kff.kz/en/news/27384',
      'https://www.sportsidioten.no/fotball/nations-league-2026-2027/',
      'https://www.maltafootball.com/2026/02/11/2026-27-uefa-nations-league-league-phase-draw-to-be-held-on-thursday',
      'https://www.figc.it/en/national-teams/news/2026-27-uefa-nations-league-draw-to-take-place-on-12-february-u1mr5at6',
      'https://www.tvp.info/90583977/mecze-reprezentacji-polski-w-2026-roku-kiedy-gra-kadra-terminarz',
      'https://www.flashscore.pl/wiadomosci/pi-ka-nozna-liga-narodow-uefa-polska-w-lidze-narodow-2026-27-terminarz-meczow-bia-o-czerwonych/UqnAbBeB/',
      'https://www.wroclaw.pl/sport/polska-szwecja-liga-narodow-uefa-tarczynski-arena-wroclaw',
      'https://www.tvp.info/95591294/liga-narodow-polska-bosnia-i-hercegowina-mecz-wynik-skrot-wideo',
      'https://www.tvp.info/95633821/liga-narodow-szwecja-polska-wynik-skrot',
      'https://www.footballwebpages.co.uk/match/2026-2027/uefa-nations-league/poland/romania/585309',
      'https://www.tvp.info/95771642/mecz-ligi-narodow-polska-przegrala-01-z-bosnia-i-hercegowina-w-zenicy',
      'https://www.flashscore.com/news/soccer-uefa-nations-league-gyokeres-goal-cancelled-out-late-on-as-bosnia-battle-to-draw-with-sweden/KvOiihKi/',
      'https://www.vavel.com/en/data/romania/results/',
      'https://www.sportsmole.co.uk/football/romania/uefa-nations-league/preview/romania-vs-sweden-prediction-team-news-lineups_606184.html',
      'https://www.beinsports.com/en-us/soccer/articles/when-is-the-next-fifa-international-break-and-why-is-it-longer-than-usual-2026-08-24',
      'https://notjustok.com/sports/fifa-makes-major-change-to-international-breaks-ahead-of-2026-27-season/',
      'https://br.soccerway.com/noticias/fifa-divulga-datas-da-euro-copa-america-e-calendario-de-selecoes-ate-2030/8hq7qfaC',
      'https://inside.fifa.com/news/coca-cola-mens-world-ranking-october-2026-portugal-spain',
      'https://statranker.org/?p=14527',
      'https://www.espn.com/soccer/story/_/id/46664763/fifa-mens-top-50-world-rankings',
      'https://www.mlssoccer.com/news/fifa-world-rankings-every-team-post-2026-world-cup',
      'https://www.flashscore.pl/wiadomosci/pi-ka-nozna-liga-narodow-uefa-polska-spad-a-na-37-miejsce-w-rankingu-fifa-liderem-wciaz-hiszpania/K2E4ksoo/',
      'https://www.fourfourtwo.com/competition/the-uefa-nations-league-is-getting-more-complicated-everything-you-need-to-know-about-the-competitions-overhaul',
      'https://sportsdigest.in/?p=217109',
      'https://www.maltafootball.com/2026/05/21/new-formats-for-the-uefa-mens-national-team-competitions-as-of-2028/',
      'https://www.insideworldfootball.com/2026/05/21/uefa-set-to-revamp-nations-league-euro-and-world-cup-qualifier-formats-from-2028/',
      'https://worldsoccertalk.com/world-cup/ceferins-uefa-approve-competition-format-changes-ahead-of-2029-nations-league-and-2030-world-cup-qualifiers/',
      'https://uaf.ua/en/news/54992',
      'https://www.maltafootball.com/2025/05/22/uefa-euro-2028-qualification-system-approved/',
      'https://www.soccerway.com/news/soccer-euro-euro-2028-schedule-opener-in-cardiff-final-at-wembley-dublin-glasgow-to-host-qfs/pvFSY7RQ',
      'https://www.easterneye.biz/euro-2028-wembley-cardiff-football-uefa/',
      'https://worldcupranking.com/world-cup-2030-qualifiers/',
      'https://www.pap.pl/aktualnosci/plan-kadry-urbana-do-konca-roku-towarzyski-czerwiec-jesienia-liga-narodow-i-losowanie',
      'https://www.radiokrakow.pl/aktualnosci/sport/pilkarz-cracovii-powolany-do-reprezentacji-polski-wielkie-wyroznienie-dla-oskara-wojcika/',
      'https://www.figc.it/en/national-teams/news/u21-euros-2027-qualifiers-the-azzurrini-to-face-poland-sweden-north-macedonia-montenegro-and-armenia',
      'https://www.unionesarda.it/en/italy39-s-under-21-team-crushes-poland-6-2-and-qualifies-for-euro-2027-e5lycqix',
      'https://www.flashscore.pl/wiadomosci/kadra-u21-jedzie-na-euro-grekom-brak-o-jednej-bramki-by-stracic-nas-do-barazy/4nvAjWdk/',
      'https://insideworldfootball.com/?p=159101',
    ],
    wzorL: 'L_raw = 7 + (Elo - 860) / 125; jeśli L_raw > 16.5 to L = 16.5 + 0.25*(L_raw - 16.5), w przeciwnym razie L = L_raw; L = max(6.5, L), zaokrąglenie do 0.1. Kotwice: Elo 860 (San Marino) -> 7.0; Elo 1735 (Polska) -> 14.0; Elo 2050 (Anglia) -> 16.5; Elo 2160 (Hiszpania) -> 16.7.',
    wzorPoisson: 'lambda_gosp = 1.30 * exp(0.17*(L_gosp - L_gosc) + 0.12); lambda_gosc = 1.30 * exp(0.17*(L_gosc - L_gosp) - 0.12); na neutralnym boisku bez składnika 0.12. Gole: Poisson(lambda), niezależnie.',
    pewnoscOgolna: 'Składy grup LN, terminy kolejek, okna 2026, terminarz i wyniki B4: pewne. Ranking FIFA: pewny dla części drużyn (X 2026 lub VII 2026), reszta szacowana. Elo: w całości szacunek (eloratings.net nieosiągalne).',
    ograniczeniaDostepu: 'WebFetch nie działał dla uefa.com, inside.fifa.com, foot-africa.com i lustra Wikipedii (domeny spoza dozwolonych w sesji). Dane zebrano z fragmentów WebSearch.',
  },
  oknaFIFA,
  reprezentacje,
  ligaNarodow2026,
  eliminacjeEuro2028,
  towarzyskiePolski,
  towarzyskieUwagi,
  cyklPrzyszly,
  modelPowolan,
};

fs.writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf8');
console.log('teams', reprezentacje.length, 'uefa', reprezentacje.filter(r=>r.konfederacja==='UEFA').length,
  'fixtures', terminarz.length, 'groups', Object.keys(grupy).length);
for (const r of reprezentacje) if (['ESP','ARG','FRA','ENG','POL','SMR','MLT','KAZ','SWE','BIH','ROU'].includes(r.kod)) console.log(r.kod, r.L);
