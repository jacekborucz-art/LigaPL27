# Reprezentacje narodowe: dane do gry managerskiej (start 2026/27)

Stan wiedzy: Nov 10, 2026. Plik danych: `src/data/reprezentacje.json`.

## 1. Metodologia

- Dane zebrano z fragmentów wyników WebSearch. WebFetch nie działał dla uefa.com, inside.fifa.com, foot-africa.com i lusterek Wikipedii (domeny spoza dozwolonych w tej sesji), więc oficjalnych tabel UEFA/FIFA nie dało się otworzyć bezpośrednio.
- Oznaczenia pewności:
  - **pewne**: co najmniej dwa zgodne źródła albo źródło oficjalne/federacyjne;
  - **źródło wtórne**: jedno źródło lub lustro Wikipedii, bez sprzeczności;
  - **szacunek**: wartość wyliczona lub przyjęta przeze mnie na potrzeby gry.
- Wyniki meczów: zapisane tylko dla grupy B4 (grupa Polski), gdzie wynik potwierdzają źródła i zgadza się tabela po 3 i 4 kolejkach. W pozostałych grupach źródła podawały sprzeczne wyniki (np. Anglia-Hiszpania raz 3:2, raz 2:3), więc mecze z kolejek 1-4 mają `wynik: null` i status `rozegrany_wynik_nieznany`. Gra może je dosymulować albo zostawić puste.
- Parowania meczów w grupach innych niż B4 pochodzą z wzorca dwurundowego, a nie z oficjalnego terminarza. Okna kolejek są pewne.
- Elo: eloratings.net było nieosiągalne, a w wynikach wyszukiwania nie znalazłem aktualnych liczb. Wszystkie wartości Elo to moje przybliżenia (rząd wielkości eloratings.net, skorygowany o wyniki 2026). Przy dostępie do eloratings.net wystarczy podmienić pole `elo` i przeliczyć L.

## 2. Wzór siły L

```text
L_raw = 7 + (Elo - 860) / 125
jeśli L_raw > 16.5:  L = 16.5 + 0.25 * (L_raw - 16.5)   (miękki sufit)
w przeciwnym razie:  L = L_raw
L = max(6.5, L), zaokrąglenie do 0.1
```

Kotwice kalibracji: San Marino (Elo ok. 860) = 7.0; Malta (1240) = 10.0, czyli poziom polskiej 1 Ligi; Kazachstan (1440) = 11.6, czyli poziom Ekstraklasy; Polska (1735) = 14.0; Anglia (2050) = 16.5; Hiszpania (2160) = 16.7.

Polska po sprawdzeniu: 37. miejsce w rankingu FIFA (Oct 7, 2026), gra w lidze B, po 4 kolejkach 3. miejsce w B4. L = 14.0 pasuje do założenia. Rozsądny przedział to 13.5-14.0.

Proponowany szybki model meczu (Poisson):

```text
lambda_gosp = 1.30 * exp(0.17 * (L_gosp - L_gosc) + 0.12)
lambda_gosc = 1.30 * exp(0.17 * (L_gosc - L_gosp) - 0.12)
neutralny teren: bez składnika +-0.12
```

Przykład: Hiszpania-San Marino daje lambda ok. 6.8 : 0.25; Polska-Szwecja ok. 1.36 : 1.24.

## 3. Okna FIFA

| Od | Do | Mecze | Zawartość | Pewność |
|---|---|---|---|---|
| Sep 21, 2026 | Oct 6, 2026 | 4 | LN kolejki 1-4 (pierwsze połączone okno IX/X) | pewne |
| Nov 9, 2026 | Nov 17, 2026 | 2 | LN kolejki 5-6; baraże ME U21 | pewne |
| Mar 22, 2027 | Mar 30, 2027 | 2 | ćwierćfinały LN, baraże A/B i B/C; el. Euro 2028 kol. 1-2 | źródło wtórne |
| Jun 7, 2027 | Jun 15, 2027 | 2 | finały LN (9-13 VI); el. Euro 2028 kol. 3-4 | źródło wtórne |
| Sep 20, 2027 | Oct 5, 2027 | 4 | el. Euro 2028 kol. 5-8 | źródło wtórne |
| Nov 8, 2027 | Nov 16, 2027 | 2 | el. Euro 2028 kol. 9-10 | źródło wtórne |
| Mar 20, 2028 | Mar 28, 2028 | 2 | baraże Euro 2028, sparingi | źródło wtórne |
| May 29, 2028 | Jun 6, 2028 | 2 | sparingi przed Euro | źródło wtórne |
| Jun 9, 2028 | Jul 9, 2028 | turniej | Euro 2028 | pewne |
| Sep 18, 2028 | Oct 3, 2028 | 4 | LN 2028/29 | niepotwierdzone |
| Nov 13, 2028 | Nov 21, 2028 | 2 | LN 2028/29 | źródło wtórne |
| 2029-2030 | | | wg wzorca (III, VI, IX/X, XI) | szacunek |

Okna 2029-2030 w JSON-ie są wygenerowane według wzorca.

## 4. Liga Narodów UEFA 2026/27

### Format

- 54 drużyny (Rosja wykluczona). Ligi A, B, C mają po 16 drużyn w 4 grupach po 4 i po 6 meczów na drużynę. Liga D ma 6 drużyn w 2 grupach po 3 i po 4 mecze na drużynę.
- Losowanie odbyło się Feb 12, 2026 w Brukseli. Faza ligowa trwa od Sep 24 do Nov 17, 2026.
- Kolejki: 1) 24-26 IX, 2) 27-29 IX, 3) 30 IX-3 X, 4) 4-6 X, 5) 12-14 XI, 6) 15-17 XI 2026.
- Ćwierćfinały ligi A (1. i 2. miejsca grup, dwumecz) oraz baraże A/B i B/C: Mar 25-30, 2027. Finały (Final Four): Jun 9-13, 2027, gospodarz nieznany.
- To ostatnia edycja z czterema ligami. Od 2028/29 będą 3 ligi po 18 drużyn. Rozdział (rekonstrukcja z FourFourTwo i Sports Digest, szacunek):
  - **Liga A 2028/29**: 8 ćwierćfinalistów, 2 najlepsze 3. miejsca A, 4 zwycięzców grup B, 4 zwycięzców baraży A/B.
  - **Liga B 2028/29**: 2 najsłabsze 4. miejsca A, przegrani baraży A/B, 3. miejsca B, zwycięzcy grup C, zwycięzcy baraży B/C.
  - **Liga C 2028/29**: przegrani baraży B/C, 3. i 4. miejsca C, cała liga D.
  - **Baraż A/B**: 2 najsłabsze 3. miejsca A i 2 najlepsze 4. miejsca A przeciw 2. miejscom B. **Baraż B/C**: 4. miejsca B przeciw 2. miejscom C.
  - Wikipedia opisuje spadek z ligi A inaczej, więc ten punkt jest niepewny.

### Grupy (wynik losowania, pewne)

| Grupa | Drużyny |
|---|---|
| A1 | Francja, Włochy, Belgia, Turcja |
| A2 | Niemcy, Holandia, Serbia, Grecja |
| A3 | Hiszpania, Anglia, Chorwacja, Czechy |
| A4 | Portugalia, Dania, Norwegia, Walia |
| B1 | Szkocja, Szwajcaria, Słowenia, Macedonia Północna |
| B2 | Węgry, Ukraina, Gruzja, Irlandia Północna |
| B3 | Izrael, Austria, Irlandia, Kosowo |
| B4 | **Polska**, Szwecja, Bośnia i Hercegowina, Rumunia |
| C1 | Albania, Finlandia, Białoruś, San Marino |
| C2 | Czarnogóra, Armenia, Cypr, Łotwa |
| C3 | Kazachstan, Słowacja, Wyspy Owcze, Mołdawia |
| C4 | Islandia, Bułgaria, Estonia, Luksemburg |
| D1 | Gibraltar, Malta, Andora |
| D2 | Litwa, Azerbejdżan, Liechtenstein |

Łotwa (C2) i Luksemburg (C4) weszły do ligi C po barażach C/D w marcu 2026 (Łotwa wygrała z Gibraltarem 1:0 i 1:0, Luksemburg z Maltą 2:0 i 3:0). Wyniki tych baraży mają jedno źródło.

### Terminarz Polski (grupa B4)

| Data | Mecz | Wynik | Uwagi |
|---|---|---|---|
| Sep 25, 2026 | Polska - Bośnia i Hercegowina | 0:0 | Warszawa, PGE Narodowy (pewne) |
| Sep 28, 2026 | Szwecja - Polska | 3:1 | Solna (pewne) |
| Oct 2, 2026 | Polska - Rumunia | 6:0 | Warszawa; 3 gole Lewandowskiego, czerwona kartka Drăgușina (pewne) |
| Oct 5, 2026 | Bośnia i Hercegowina - Polska | 1:0 | Zenica (pewne) |
| Nov 14, 2026 | Rumunia - Polska | do rozegrania | 20:45 |
| Nov 17, 2026 | Polska - Szwecja | do rozegrania | Wrocław, Tarczyński Arena |

Pozostałe mecze B4: Szwecja-Rumunia 2:1 (Sep 25), Rumunia-Bośnia 2:4 (Sep 28), Bośnia-Szwecja 1:1 (Oct 2), Rumunia-Szwecja 0:1 (Oct 5). Te dwa wyniki ze Szwecją i Bośnią w roli gości mają po jednym źródle (vavel), ale zgadzają się z tabelą po 3 kolejkach. W listopadzie zostały Szwecja-Bośnia (Nov 14) i Bośnia-Rumunia (Nov 17); daty i gospodarzy wywnioskowałem z układu kolejek.

Tabela po 4 kolejkach: Szwecja 10 pkt (7:3), Bośnia 8 (6:3), **Polska 4 (7:5)**, Rumunia 0 (3:13).

Co daje miejsce Polski (według rekonstrukcji formatu): 3. miejsce oznacza utrzymanie w lidze B 2028/29 bez baraży, a w marcu 2027 Polska ma wolne okno na eliminacje Euro. 2. miejsce (wymaga dwóch zwycięstw i straty punktów przez Bośnię) to baraż A/B. 4. miejsce (Polska przegrywa oba mecze, a Rumunia wygrywa jeszcze w Zenicy) to baraż B/C w marcu 2027.

## 5. Eliminacje Euro 2028 i turniej

- Losowanie: Dec 6, 2026, Belfast (pewne).
- 12 grup po 4 lub 5 drużyn, mecz i rewanż, od marca do listopada 2027. Moje wnioskowanie: 24 drużyny z marcowych ćwierćfinałów i baraży LN trafią do 6 grup czterozespołowych, a 30 pozostałych do 6 grup pięciozespołowych.
- Kolejki według lustra Wikipedii: 1) 26-27 III, 2) 29-30 III, 3) 11-12 VI, 4) 14-15 VI, 5) 23-25 IX, 6) 26-29 IX, 7) 29 IX-2 X, 8) 3-5 X, 9) 11-13 XI, 10) 14-16 XI 2027. Baraże: 23-25 i 26-28 III 2028.
- Awans: 12 zwycięzców grup i 8 najlepszych drużyn z 2. miejsc (20 drużyn). Ostatnie 4 miejsca przypadają barażom albo gospodarzom: 2 miejsca są zarezerwowane dla najwyżej sklasyfikowanych gospodarzy bez awansu. W barażach grają pozostałe drużyny z 2. miejsc i najlepsi zwycięzcy grup LN bez awansu.
- Gospodarze (Anglia, Irlandia, Szkocja, Walia) grają w eliminacjach, w osobnych grupach.
- Koszyki (szacunek): według rankingu LN 2026/27, po 12 drużyn w koszyku. Polska z 3. miejscem w B4 zajmie ok. 25-28. pozycję, czyli najpewniej trafi do koszyka 3.
- Turniej: Jun 9 - Jul 9, 2028. 24 drużyny w 6 grupach po 4; do 1/8 finału awansuje po 2 najlepsze z grupy i 4 najlepsze z 3. miejsc. 51 meczów na 9 stadionach. Otwarcie w Cardiff, półfinały i finał na Wembley.

## 6. Dalszy cykl (do generowania)

- **LN 2028/29**: 3 ligi po 18 drużyn (według jednego źródła 3 grupy po 6), faza ligowa IX-XI 2028, ćwierćfinały i baraże w III 2029, finały w VI 2029 (szacunek). Koncepcję zatwierdzono May 21, 2026. Ostateczny format miał przyjąć Komitet Wykonawczy Sep 15, 2026; wyniku tego posiedzenia nie znalazłem.
- **Eliminacje MŚ 2030 (UEFA)**: Liga 1 to 36 drużyn z lig A i B LN 2028/29 w 3 grupach po 12. Każda drużyna gra 6 meczów, po 2 z rywalami z każdego koszyka, u siebie albo na wyjeździe (model szwajcarski). Liga 2 to pozostałe 18-19 drużyn. Mecze w 2029, baraże w III 2030 (szacunek). UEFA ma ok. 16 miejsc (niepotwierdzone). Hiszpania i Portugalia mają awans, ale grają w eliminacjach.
- **MŚ 2030**: 48 drużyn, gospodarze Hiszpania, Portugalia i Maroko, mecze otwarcia w Urugwaju, Argentynie i Paragwaju. Daty Jun 8 - Jul 21, 2030 pochodzą ze źródeł wtórnych. Format jak w 2026 (12 grup po 4, 1/16 finału).
- **Euro 2032** (Włochy, Turcja): eliminacje w 2031 w nowym formacie Liga 1/Liga 2 (szacunek).
- Wzorzec dla generatora:
  - jesień roku parzystego: faza ligowa LN;
  - marzec roku nieparzystego: ćwierćfinały i baraże LN;
  - czerwiec roku nieparzystego: finały LN;
  - rok nieparzysty: eliminacje;
  - marzec roku turniejowego: baraże;
  - Euro w latach podzielnych przez 4, MŚ w pozostałych latach parzystych.

## 7. Mecze towarzyskie Polski

W sezonie 2026/27 nie ma potwierdzonych sparingów Polski. Okna IX/X i XI 2026 wypełnia LN. W marcu i czerwcu 2027 grają eliminacje Euro, a w przypadku 2. lub 4. miejsca w B4 także baraż LN. Kontekst: Polska przegrała w marcu 2026 baraż o MŚ 2026 ze Szwecją. Na koniec maja i początek czerwca 2026 zaplanowano sparingi z Ukrainą (Wrocław) i Nigerią (Warszawa); ich wyników nie weryfikowałem. Reguła dla gry: jeśli w oknie zostaje wolny slot, dolosuj rywala o |L - 14.0| <= 2.5.

## 8. Model powołań

- Kadra liczy 23-26 zawodników (gra przyjmuje 25, w tym 3 bramkarzy). W protokole meczowym jest 23 graczy.
- Powołany zawodnik opuszcza klub na całe okno: 16 dni we wrześniu i październiku, 9 dni w pozostałych oknach.
- Udział graczy z ligi krajowej (szacunek): L >= 15.5: 0-10% (Anglia to wyjątek, prawie 100%); 14-15.5: 5-20% (Polska: zwykle 2-5 graczy z Ekstraklasy, np. Oskar Wójcik z Cracovii); 12.5-14: 15-35%; 11-12.5: 30-60% (Kazachstan ok. 80-90%); poniżej 11: 60-95%.
- U21:
  - Euro U21 2027 rozegrają Albania i Serbia (Jun 11 - Jul 4, 2027, 16 drużyn). Polska U21 awansowała bezpośrednio jako najlepsza drużyna z 2. miejsca. W grupie E przegrała 2:6 z Włochami (Oct 5, 2026), które wygrały grupę dzięki lepszemu bilansowi bramek.
  - Baraże U21 grane są Nov 9-17, 2026, w tym samym oknie co seniorzy. Mecze U21 zawsze wypadają w oknach FIFA, a zawodnik może zagrać w jednym oknie tylko w jednej kadrze.
  - Eliminacje Euro U21 2029 (szacunek według wzorca): losowanie ok. I-II 2027, mecze III 2027 - X 2028, do udziału uprawnieni urodzeni od Jan 1, 2006.

## 9. Główne niepewności

1. Wszystkie wartości Elo są szacunkowe, więc L też jest szacunkiem (szczególnie dla krajów spoza czołówki).
2. Ranking FIFA z października 2026 potwierdziłem tylko dla 22 drużyn, a z lipca 2026 dla 19 (w tym Rosja). Pozostałe pozycje są szacowane i mogą się różnić o kilka do kilkunastu miejsc. Następna aktualizacja rankingu: Nov 18, 2026.
3. Parowania w grupach innych niż B4 są wzorcowe. Wyniki kolejek 1-4 poza B4 są nieznane, bo źródła były sprzeczne.
4. Mechanika spadków z ligi A i przejście na format 2028/29 zrekonstruowałem ze źródeł wtórnych, które częściowo sobie przeczą.
5. Kolejki eliminacji Euro 2028, okna FIFA 2027-2028 i podział na grupy 4 i 5 drużyn pochodzą ze źródeł wtórnych albo z mojego wnioskowania.
6. Daty finałów LN 2027, MŚ 2030 i okien po 2028 wymagają potwierdzenia, podobnie jak ostateczny format eliminacji MŚ 2030 (posiedzenie UEFA z Sep 15, 2026).
7. Sprawa Izraela (B3): FAI potwierdziła, że rozegra mecze, ale w grę mogą wchodzić zmiany miejsc rozgrywania.

## 10. Tabela siły (posortowana według L)

| Kod | Reprezentacja | Konf. | Ranking FIFA | Źródło rankingu | Elo (szac.) | L | Liga/Grupa LN |
|---|---|---|---|---|---|---|---|
| ESP | Hiszpania | UEFA | 1 | X 2026 | 2160 | 16.7 | A3 |
| ARG | Argentyna | CONMEBOL | 2 | X 2026 | 2140 | 16.7 | - |
| FRA | Francja | UEFA | 3 | X 2026 | 2080 | 16.6 | A1 |
| ENG | Anglia | UEFA | 4 | X 2026 | 2050 | 16.5 | A3 |
| POR | Portugalia | UEFA | 5 | X 2026 | 2000 | 16.1 | A4 |
| BRA | Brazylia | CONMEBOL | 6 | X 2026 | 2000 | 16.1 | - |
| NED | Holandia | UEFA | 9 | X 2026 | 1980 | 16.0 | A2 |
| NOR | Norwegia | UEFA | 19 | VII 2026 | 1970 | 15.9 | A4 |
| COL | Kolumbia | CONMEBOL | 11 | X 2026 | 1960 | 15.8 | - |
| GER | Niemcy | UEFA | 13 | X 2026 | 1960 | 15.8 | A2 |
| MAR | Maroko | CAF | 7 | X 2026 | 1930 | 15.6 | - |
| CRO | Chorwacja | UEFA | 14 | X 2026 | 1930 | 15.6 | A3 |
| BEL | Belgia | UEFA | 8 | X 2026 | 1910 | 15.4 | A1 |
| ECU | Ekwador | CONMEBOL | 25 | VII 2026 | 1910 | 15.4 | - |
| ITA | Włochy | UEFA | 15 | X 2026 | 1900 | 15.3 | A1 |
| JPN | Japonia | AFC | 17 | X 2026 | 1900 | 15.3 | - |
| URU | Urugwaj | CONMEBOL | 20 | VII 2026 | 1900 | 15.3 | - |
| SUI | Szwajcaria | UEFA | 12 | X 2026 | 1890 | 15.2 | B1 |
| DEN | Dania | UEFA | 21 | VII 2026 | 1870 | 15.1 | A4 |
| TUR | Turcja | UEFA | 27 | VII 2026 | 1870 | 15.1 | A1 |
| SEN | Senegal | CAF | 18 | VII 2026 | 1860 | 15.0 | - |
| AUT | Austria | UEFA | 23 | VII 2026 | 1860 | 15.0 | B3 |
| MEX | Meksyk | CONCACAF | 10 | X 2026 | 1850 | 14.9 | - |
| PAR | Paragwaj | CONMEBOL | 34 | VII 2026 | 1850 | 14.9 | - |
| USA | USA | CONCACAF | 16 | X 2026 | 1820 | 14.7 | - |
| IRN | Iran | AFC | 22 | VII 2026 | 1800 | 14.5 | - |
| AUS | Australia | AFC | 28 | VII 2026 | 1780 | 14.4 | - |
| KOR | Korea Płd. | AFC | 32 | VII 2026 | 1790 | 14.4 | - |
| SWE | Szwecja | UEFA | 37 | VII 2026 | 1790 | 14.4 | B4 |
| CAN | Kanada | CONCACAF | 30 | VII 2026 | 1770 | 14.3 | - |
| GRE | Grecja | UEFA | 39 | szacunek | 1770 | 14.3 | A2 |
| EGY | Egipt | CAF | 24 | VII 2026 | 1760 | 14.2 | - |
| CIV | Wybrzeże Kości Słoniowej | CAF | 31 | VII 2026 | 1760 | 14.2 | - |
| UKR | Ukraina | UEFA | 33 | VII 2026 | 1760 | 14.2 | B2 |
| SRB | Serbia | UEFA | 38 | szacunek | 1760 | 14.2 | A2 |
| RUS | Rosja | UEFA | 35 | VII 2026 | 1750 | 14.1 | zawieszona |
| NGA | Nigeria | CAF | 26 | VII 2026 | 1740 | 14.0 | - |
| ALG | Algieria | CAF | 36 | szacunek | 1740 | 14.0 | - |
| POL | Polska | UEFA | 37 | X 2026 | 1735 | 14.0 | B4 |
| CZE | Czechy | UEFA | 41 | szacunek | 1740 | 14.0 | A3 |
| SCO | Szkocja | UEFA | 42 | VII 2026 | 1740 | 14.0 | B1 |
| WAL | Walia | UEFA | 43 | szacunek | 1730 | 14.0 | A4 |
| HUN | Węgry | UEFA | 44 | szacunek | 1720 | 13.9 | B2 |
| PAN | Panama | CONCACAF | 46 | szacunek | 1720 | 13.9 | - |
| VEN | Wenezuela | CONMEBOL | 49 | X 2026 | 1720 | 13.9 | - |
| SVK | Słowacja | UEFA | 52 | szacunek | 1700 | 13.7 | C3 |
| BIH | Bośnia i Hercegowina | UEFA | 65 | szacunek | 1700 | 13.7 | B4 |
| CMR | Kamerun | CAF | 45 | szacunek | 1680 | 13.6 | - |
| MLI | Mali | CAF | 47 | X 2026 | 1690 | 13.6 | - |
| CHI | Chile | CONMEBOL | 50 | X 2026 | 1690 | 13.6 | - |
| TUN | Tunezja | CAF | 51 | szacunek | 1690 | 13.6 | - |
| SVN | Słowenia | UEFA | 55 | szacunek | 1680 | 13.6 | B1 |
| IRL | Irlandia | UEFA | 58 | szacunek | 1690 | 13.6 | B3 |
| GEO | Gruzja | UEFA | 70 | szacunek | 1690 | 13.6 | B2 |
| RSA | RPA | CAF | 48 | X 2026 | 1660 | 13.4 | - |
| ROU | Rumunia | UEFA | 53 | szacunek | 1660 | 13.4 | B4 |
| ALB | Albania | UEFA | 62 | szacunek | 1660 | 13.4 | C1 |
| NIR | Irlandia Północna | UEFA | 68 | szacunek | 1630 | 13.2 | B2 |
| KOS | Kosowo | UEFA | 75 | szacunek | 1630 | 13.2 | B3 |
| ISR | Izrael | UEFA | 76 | szacunek | 1630 | 13.2 | B3 |
| ISL | Islandia | UEFA | 74 | szacunek | 1620 | 13.1 | C4 |
| MKD | Macedonia Północna | UEFA | 66 | szacunek | 1600 | 12.9 | B1 |
| FIN | Finlandia | UEFA | 72 | szacunek | 1590 | 12.8 | C1 |
| MNE | Czarnogóra | UEFA | 80 | szacunek | 1540 | 12.4 | C2 |
| BUL | Bułgaria | UEFA | 85 | szacunek | 1510 | 12.2 | C4 |
| LUX | Luksemburg | UEFA | 93 | szacunek | 1460 | 11.8 | C4 |
| BLR | Białoruś | UEFA | 100 | szacunek | 1460 | 11.8 | C1 |
| ARM | Armenia | UEFA | 105 | szacunek | 1450 | 11.7 | C2 |
| KAZ | Kazachstan | UEFA | 110 | szacunek | 1440 | 11.6 | C3 |
| FRO | Wyspy Owcze | UEFA | 135 | szacunek | 1420 | 11.5 | C3 |
| CYP | Cypr | UEFA | 125 | szacunek | 1390 | 11.2 | C2 |
| EST | Estonia | UEFA | 128 | szacunek | 1350 | 10.9 | C4 |
| AZE | Azerbejdżan | UEFA | 120 | szacunek | 1330 | 10.8 | D2 |
| LVA | Łotwa | UEFA | 138 | szacunek | 1320 | 10.7 | C2 |
| LTU | Litwa | UEFA | 143 | szacunek | 1300 | 10.5 | D2 |
| MDA | Mołdawia | UEFA | 155 | szacunek | 1270 | 10.3 | C3 |
| MLT | Malta | UEFA | 170 | szacunek | 1240 | 10.0 | D1 |
| AND | Andora | UEFA | 173 | szacunek | 1140 | 9.2 | D1 |
| GIB | Gibraltar | UEFA | 200 | szacunek | 1040 | 8.4 | D1 |
| LIE | Liechtenstein | UEFA | 205 | szacunek | 1000 | 8.1 | D2 |
| SMR | San Marino | UEFA | 210 | szacunek | 860 | 7.0 | C1 |

## 11. Źródła

- https://www.englandfootball.com/articles/2026/Feb/12/uefa-nations-league-2026-27-draw-made-20261202
- https://www.dfb.de/news/nations-league-germany-to-face-netherlands-serbia-and-greece
- https://www.nfsbih.ba/en/news/football-m/a-national-team-m/dragons-learn-their-uefa-nations-league-opponents/
- https://romania-insider.com/romanias-football-team-group-nations-league-feb-2026
- https://www.hungarianconservative.com/articles/culture_society/ukraine-hungary-georgia-northern-ireland-nations-league/
- https://www.irishtimes.com/sport/soccer/2026/02/12/fai-confirms-israel-fixtures-will-be-fulfilled-despite-previous-motion-sent-to-uefa/
- https://www.joe.co.uk/sport/nations-league-2026-27-draw-england-learn-their-opponents-522721
- https://kff.kz/en/news/27384
- https://www.sportsidioten.no/fotball/nations-league-2026-2027/
- https://www.maltafootball.com/2026/02/11/2026-27-uefa-nations-league-league-phase-draw-to-be-held-on-thursday
- https://www.figc.it/en/national-teams/news/2026-27-uefa-nations-league-draw-to-take-place-on-12-february-u1mr5at6
- https://www.tvp.info/90583977/mecze-reprezentacji-polski-w-2026-roku-kiedy-gra-kadra-terminarz
- https://www.flashscore.pl/wiadomosci/pi-ka-nozna-liga-narodow-uefa-polska-w-lidze-narodow-2026-27-terminarz-meczow-bia-o-czerwonych/UqnAbBeB/
- https://www.wroclaw.pl/sport/polska-szwecja-liga-narodow-uefa-tarczynski-arena-wroclaw
- https://www.tvp.info/95591294/liga-narodow-polska-bosnia-i-hercegowina-mecz-wynik-skrot-wideo
- https://www.tvp.info/95633821/liga-narodow-szwecja-polska-wynik-skrot
- https://www.footballwebpages.co.uk/match/2026-2027/uefa-nations-league/poland/romania/585309
- https://www.tvp.info/95771642/mecz-ligi-narodow-polska-przegrala-01-z-bosnia-i-hercegowina-w-zenicy
- https://www.flashscore.com/news/soccer-uefa-nations-league-gyokeres-goal-cancelled-out-late-on-as-bosnia-battle-to-draw-with-sweden/KvOiihKi/
- https://www.vavel.com/en/data/romania/results/
- https://www.sportsmole.co.uk/football/romania/uefa-nations-league/preview/romania-vs-sweden-prediction-team-news-lineups_606184.html
- https://www.beinsports.com/en-us/soccer/articles/when-is-the-next-fifa-international-break-and-why-is-it-longer-than-usual-2026-08-24
- https://notjustok.com/sports/fifa-makes-major-change-to-international-breaks-ahead-of-2026-27-season/
- https://br.soccerway.com/noticias/fifa-divulga-datas-da-euro-copa-america-e-calendario-de-selecoes-ate-2030/8hq7qfaC
- https://inside.fifa.com/news/coca-cola-mens-world-ranking-october-2026-portugal-spain
- https://statranker.org/?p=14527
- https://www.espn.com/soccer/story/_/id/46664763/fifa-mens-top-50-world-rankings
- https://www.mlssoccer.com/news/fifa-world-rankings-every-team-post-2026-world-cup
- https://www.flashscore.pl/wiadomosci/pi-ka-nozna-liga-narodow-uefa-polska-spad-a-na-37-miejsce-w-rankingu-fifa-liderem-wciaz-hiszpania/K2E4ksoo/
- https://www.fourfourtwo.com/competition/the-uefa-nations-league-is-getting-more-complicated-everything-you-need-to-know-about-the-competitions-overhaul
- https://sportsdigest.in/?p=217109
- https://www.maltafootball.com/2026/05/21/new-formats-for-the-uefa-mens-national-team-competitions-as-of-2028/
- https://www.insideworldfootball.com/2026/05/21/uefa-set-to-revamp-nations-league-euro-and-world-cup-qualifier-formats-from-2028/
- https://worldsoccertalk.com/world-cup/ceferins-uefa-approve-competition-format-changes-ahead-of-2029-nations-league-and-2030-world-cup-qualifiers/
- https://uaf.ua/en/news/54992
- https://www.maltafootball.com/2025/05/22/uefa-euro-2028-qualification-system-approved/
- https://www.soccerway.com/news/soccer-euro-euro-2028-schedule-opener-in-cardiff-final-at-wembley-dublin-glasgow-to-host-qfs/pvFSY7RQ
- https://www.easterneye.biz/euro-2028-wembley-cardiff-football-uefa/
- https://worldcupranking.com/world-cup-2030-qualifiers/
- https://www.pap.pl/aktualnosci/plan-kadry-urbana-do-konca-roku-towarzyski-czerwiec-jesienia-liga-narodow-i-losowanie
- https://www.radiokrakow.pl/aktualnosci/sport/pilkarz-cracovii-powolany-do-reprezentacji-polski-wielkie-wyroznienie-dla-oskara-wojcika/
- https://www.figc.it/en/national-teams/news/u21-euros-2027-qualifiers-the-azzurrini-to-face-poland-sweden-north-macedonia-montenegro-and-armenia
- https://www.unionesarda.it/en/italy39-s-under-21-team-crushes-poland-6-2-and-qualifies-for-euro-2027-e5lycqix
- https://www.flashscore.pl/wiadomosci/kadra-u21-jedzie-na-euro-grekom-brak-o-jednej-bramki-by-stracic-nas-do-barazy/4nvAjWdk/
- https://insideworldfootball.com/?p=159101
