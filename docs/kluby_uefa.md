# Baza klubów UEFA 2026/27 (gra managerska)

Stan na Nov 10, 2026. Plik danych: `kluby_uefa.json` (ten sam katalog). Gra używa prawdziwych nazw klubów, bez herbów i bez prawdziwych zawodników.

## Zawartość

| Element | Liczba |
|---|---|
| Kluby zagraniczne w fazie ligowej LM | 36 |
| Kluby zagraniczne w fazie ligowej LE | 34 (+ Lech i Jagiellonia w bloku polskim = 36) |
| Kluby zagraniczne w fazie ligowej LK | 36 |
| Kluby, które odpadły w eliminacjach (`ELIM`) | 42 |
| Rezerwa: duże kluby bez pucharów 2026/27 (`BRAK`) | 8 |
| Razem rekordów w `kluby` | 156 |
| Kraje (ranking UEFA) | 55 (54 aktywne + Rosja oznaczona jako zawieszona) |

Pula „z eliminacji” liczy ok. 100 klubów: 42 odpadłe plus ok. 55 klubów z faz ligowych, które przeszły przez rundy Q1 do PO (mają opis drogi w polu `droga2026`).

Rozkład tierów: A 12, B 31, C 49, D 37, E 27.

## Metodologia

1. **Uczestnicy faz ligowych** pochodzą z list koszyków opublikowanych przez UEFA przed losowaniami (Aug 27, 2026 dla LM, Aug 28, 2026 dla LE i LK) i z relacji medialnych. Składy koszyków LM, LE i LK zgadzają się między źródłami; dokładne wyniki dwumeczów sprawdzałem w co najmniej jednym niezależnym źródle.
2. **Eliminacje** zrekonstruowałem z wyników rund Q1, Q2, Q3 i PO (UEFA, FBref, Terrikon, Sportsmole, polskie media). Kiedy znałem tylko parę z losowania, a nie wynik, rekord ma `pewnoscUdzialu: "szacunek"`.
3. **Współczynniki klubowe** (5-letnie, stan na start sezonu 2026/27). Pewne są tylko wartości 22 klubów: 18 z koszyków 1 i 2 LM oraz Feyenoordu, Lille, Napoli i RB Lipsk (źródła cytujące tabelę rozstawienia). Pozostałe to szacunki: wynik klubu z lat 2021/22 do 2025/26 albo minimum 20% współczynnika kraju. Szacunki są uporządkowane tak, żeby zgadzały się z kolejnością koszyków.
4. **Miejsce w rankingu UEFA** to zawsze szacunek, interpolowany z punktów (np. 100 pkt to ok. 10. miejsce, 30 pkt to ok. 100., 10 pkt to ok. 240.).
5. **Ranking krajów**: pole `wspolczynnik` to ranking 2025 (sezony 2020/21 do 2024/25), który rozdzielił miejsca w pucharach 2026/27. Pole `biezacyNov2026` to listopadowa migawka Sofascore (sezony 2022/23 do 2026/27) dla 10 krajów, dla których ją znalazłem.
6. **Prestiż, osobowość trenera, narodowość kadry** przypisałem ręcznie. Prestiż wynika z historii, marki i budżetu. Trener: O = ofensywny, S = ostrożny, P = pragmatyczny. Narodowość to zwykle kraj klubu; wyjątki: Como (ESP), Pafos (POR), Inter Escaldes (ESP), Vaduz (SUI).

## Wzór L

Dwa składniki:

- **Lc** (siła ze współczynnika klubowego c): `Lc = 1.555 + 2.974 * ln(c + 10)`
- **Lb** (typowa siła klubu z górnej połowy ligi krajowej, z współczynnika kraju C): interpolacja liniowa w `ln(C)` przez punkty (C = 3: 7.5), (10: 9.3), (35: 12.0), (115: 14.5)

Korekta za siłę ligi:

```text
jeżeli Lb > Lc:  L = Lc + 0.85 * (Lb - Lc)                       // mocna liga podnosi klub o niskim współczynniku
w przeciwnym razie: L = Lc - 0.6 * max(0, 1 - C/36) * (Lc - Lb)  // słaba liga obniża współczynnik "napompowany" w eliminacjach
L = clamp(L, 7.5, 16.8), zaokrąglenie do 0.1
```

Tiery: A ≥ 15.5; B 14.0 do 15.4; C 12.0 do 13.9; D 10.0 do 11.9; E < 10.0.

Przykłady:

| Klub | c | Kraj (C) | Lc | Lb | L |
|---|---|---|---|---|---|
| Bayern Monachium | 147.5 | GER (88.5) | 16.6 | 14.0 | 16.6 |
| Napoli | 63.0 | ITA (98.0) | 14.3 | 14.2 | 14.3 |
| Como | 19.6 | ITA (98.0) | 11.6 | 14.2 | 13.8 |
| Lech Poznań | 31.0 | POL (35.0) | 12.6 | 12.0 | 12.6 |
| Lincoln Red Imps | 13.0 | GIB (5.9) | 10.9 | 8.5 | 9.7 |
| FC Atert Bissen | 1.5 | LUX (6.6) | 8.8 | 8.7 | 8.8 |

### Zgodność z punktami kontrolnymi

| Punkt kontrolny | Cel | Wynik |
|---|---|---|
| Zwycięzcy LM (Real, Bayern, City, PSG, Liverpool) | ok. 16.5 | 16.2 do 16.6 |
| Środek LM | ok. 14 | mediana 14.6 |
| Typowy uczestnik LK | 12 do 12.5 | mediana 12.0 |
| Słabe kluby (Andora, Gibraltar, Wyspy Owcze, Malta, Luksemburg) | 8 do 9.5 | 8.8 do 10.0 |
| Lech Poznań (kalibracja Ekstraklasy) | 12.6 | 12.6 |

Środek LM wychodzi o ok. 0.5 wyżej niż cel. Przy zachowaniu Lecha na 12.6 i elity na 16.5 krzywa logarytmiczna nie może zejść niżej w środku. Jeśli zależy Ci na 14.0, odejmij 0.5 klubom z L między 13.5 a 15.4 albo spłaszcz Lc w tym zakresie. KÍ Klaksvík wychodzi na 10.0, czyli nad celem dla Wysp Owczych, bo ma wysoki jak na swój kraj współczynnik.

Polskie kluby są w osobnym bloku `polskieKlubyUEFA2026` z polem `Lwzor` tylko do porównania. W grze zostają wartości z krajowej kalibracji.

## Polskie kluby w pucharach 2026/27

Ekstraklasa 2025/26: 1. Lech Poznań 60 pkt, 2. Górnik Zabrze 56, 3. Jagiellonia Białystok 56, 4. Raków Częstochowa 55, 5. GKS Katowice 50. Legia była 6. i nie gra w pucharach.

- **Mistrz Polski 2025/26:** Lech Poznań
- **Puchar Polski 2025/26:** Górnik Zabrze (finał z Rakowem; data wg jednego źródła May 2, 2026)
- **Superpuchar na start gry (lipiec 2026):** Lech Poznań vs Górnik Zabrze

| Klub | Start | Przebieg | Wynik |
|---|---|---|---|
| Lech Poznań | LM Q2 (ścieżka mistrzów) | LM Q2: Aarhus 4-1, 1-4 po dogr., karne 3-4; LE Q3: KÍ Klaksvík 1-0, 5-0; LE PO: Thun 9-2 w dwumeczu | Faza ligowa LE (po 4 kolejkach 3 porażki, m.in. 1-3 z Benficą) |
| Jagiellonia Białystok | LE Q3 | Rangers 2-1, 1-1; Iberia 1999, 6-1 w dwumeczu | Faza ligowa LE (3 pkt po 3 kolejkach) |
| Górnik Zabrze | LM Q2 (ścieżka ligowa) | Fenerbahçe (0-1 w 1. meczu); LE Q3: Ferencváros; LK PO: Monaco 2-3, 1-4 | Odpadł w LK PO |
| Raków Częstochowa | LK Q2 | Valletta 3-1, 4-0; Hammarby (0-0, awans); Hajduk 2-2, 2-3 po dogr. | Odpadł w LK PO |
| GKS Katowice | LK Q2 | Žilina (awans); Hapoel Tel Awiw 0-2, 2-1 | Odpadł w LK Q3 |

Polska w rankingu krajowym: 15. miejsce w rankingu 2025 (35.000 pkt, stąd 5 klubów w 2026/27), 12. miejsce po sezonie 2025/26, w listopadzie 2026 ok. 45.7 pkt (12. miejsce wg Sofascore).

## Top 40 klubów wg L

Gwiazdka przy współczynniku oznacza szacunek.

| # | Klub | Kraj | Wsp. | Rank. (szac.) | L | Tier | Prestiż | Trener | Rozgr. 2026/27 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Bayern Monachium | GER | 147.50 | 1 | 16.6 | A | 10 | O | LM |
| 2 | Real Madryt | ESP | 144.50 | 2 | 16.5 | A | 10 | O | LM |
| 3 | Paris Saint-Germain | FRA | 132.00 | 3 | 16.3 | A | 10 | O | LM |
| 4 | Liverpool | ENG | 130.00 | 4 | 16.3 | A | 10 | O | LM |
| 5 | Inter Mediolan | ITA | 127.00 | 5 | 16.2 | A | 9 | P | LM |
| 6 | Manchester City | ENG | 125.50 | 6 | 16.2 | A | 10 | O | LM |
| 7 | Arsenal | ENG | 119.00 | 7 | 16.0 | A | 9 | P | LM |
| 8 | FC Barcelona | ESP | 113.25 | 8 | 15.9 | A | 10 | O | LM |
| 9 | Atlético Madryt | ESP | 104.75 | 9 | 15.7 | A | 9 | S | LM |
| 10 | Borussia Dortmund | GER | 100.75 | 10 | 15.6 | A | 8 | O | LM |
| 11 | Chelsea | ENG | 98.00* | 13 | 15.5 | A | 9 | O | rezerwa |
| 12 | AS Roma | ITA | 97.75 | 13 | 15.5 | A | 8 | P | LM |
| 13 | Benfica | POR | 92.00* | 14 | 15.3 | B | 9 | O | LE |
| 14 | Bayer Leverkusen | GER | 90.00* | 15 | 15.3 | B | 8 | O | LE |
| 15 | Sporting CP | POR | 84.00 | 16 | 15.1 | B | 8 | O | LM |
| 16 | Aston Villa | ENG | 83.00 | 17 | 15.0 | B | 7 | P | LM |
| 17 | FC Porto | POR | 80.75 | 18 | 15.0 | B | 8 | P | LM |
| 18 | Atalanta | ITA | 78.00* | 20 | 14.9 | B | 7 | O | LK |
| 19 | Manchester United | ENG | 76.50 | 21 | 14.8 | B | 9 | P | LM |
| 20 | Club Brugge | BEL | 75.25 | 22 | 14.8 | B | 7 | O | LM |
| 21 | Juventus | ITA | 75.00* | 22 | 14.8 | B | 9 | P | LE |
| 22 | Real Betis | ESP | 74.50 | 23 | 14.7 | B | 7 | O | LM |
| 23 | Tottenham Hotspur | ENG | 72.00* | 25 | 14.7 | B | 8 | O | rezerwa |
| 24 | PSV Eindhoven | NED | 71.25 | 26 | 14.6 | B | 7 | O | LM |
| 25 | Feyenoord | NED | 71.00 | 26 | 14.6 | B | 7 | O | LM |
| 26 | Lille OSC | FRA | 68.75 | 28 | 14.5 | B | 7 | P | LM |
| 27 | SSC Napoli | ITA | 63.00 | 35 | 14.3 | B | 8 | P | LM |
| 28 | Bodø/Glimt | NOR | 62.00* | 36 | 14.3 | B | 6 | O | LM |
| 29 | AC Milan | ITA | 62.00* | 36 | 14.3 | B | 9 | P | LE |
| 30 | Newcastle United | ENG | 35.00* | 86 | 14.3 | B | 7 | P | rezerwa |
| 31 | RB Lipsk | GER | 61.00 | 37 | 14.2 | B | 7 | O | LM |
| 32 | Eintracht Frankfurt | GER | 60.00* | 38 | 14.2 | B | 7 | O | rezerwa |
| 33 | Crystal Palace | ENG | 30.00* | 100 | 14.2 | B | 6 | P | LE |
| 34 | Olympique Lyon | FRA | 58.00* | 41 | 14.1 | B | 8 | O | LE |
| 35 | Olympiakos Pireus | GRE | 57.00* | 42 | 14.1 | B | 7 | P | LE |
| 36 | Lazio | ITA | 50.00* | 52 | 14.1 | B | 7 | P | rezerwa |
| 37 | Fiorentina | ITA | 45.00* | 62 | 14.1 | B | 7 | P | rezerwa |
| 38 | AFC Bournemouth | ENG | 23.00* | 129 | 14.1 | B | 5 | O | LE |
| 39 | Sunderland AFC | ENG | 23.00* | 129 | 14.1 | B | 5 | S | LE |
| 40 | Brighton & Hove Albion | ENG | 23.00* | 129 | 14.1 | B | 6 | O | LK |

## Ranking UEFA: prawdziwe współczynniki 5 sezonów (od Nov 20, 2026)

Źródło: plik od właściciela `tools/data/ranking_uefa_2026_27.txt` (oficjalny ranking UEFA za sezony 2022/23-2026/27,
stan punktacji Nov 5, 2026; sezon 2026/27 częściowy). Plik powołuje się na:
[UEFA, ranking federacji](https://www.uefa.com/nationalassociations/uefarankings/country/?year=2027),
[UEFA, ranking klubów](https://www.uefa.com/nationalassociations/uefarankings/club/?year=2027),
[UEFA, zasady współczynników klubów](https://www.uefa.com/nationalassociations/uefarankings/club/about/),
[Bert Kassies, crank2027](https://kassiesa.net/uefa/data/method5/crank2027.html) i regulamin LM 2026/27 (aneks D.2, okresy odniesienia).

- **Generator:** `node tools/uefa-ranking-gen.mjs` (opcja `-v`: każde dopasowanie, `--check`: zgodność z plikiem danych)
  czyta tabele „Pełny ranking federacji” (55) i „Pełny ranking klubów” (415; Paris Saint-Germain jest w pliku dwa razy,
  liczy się raz), sprawdza sumy, progi 20 % i współczynniki z pliku i zapisuje `src/data/ranking_uefa.json`:
  kraje `{ kod: { name, seasons[5], place, entrants } }` i kluby `{ klucz: { name, country, seasons[5], place, game? } }`.
- **Dopasowanie nazw:** po kraju i znormalizowanej nazwie (bez znaków diakrytycznych, kropek i przedrostków FC, AS, KKS,
  MKS, KS itd.; słowa ogólne jak Real, United, Inter, Borussia, Dinamo nie wystarczą). Trudne przypadki w tabeli `ALIASES`
  (np. FC Internazionale Milano -> inter, GNK Dinamo -> dinamo-zagrzeb, F.C. Copenhagen -> kopenhaga, ML Vitebsk ->
  witebsk, PFC CSKA Sofia -> cska-sofia; FC CSKA 1948 to inny klub). Polskie kluby po prawdziwych nazwach
  (`FICTIONAL[id].real`): Legia Warszawa, KKS Lech Poznań, Jagiellonia Białystok, Raków Częstochowa, Górnik Zabrze,
  GKS Katowice, Wisła Kraków, Śląsk Wrocław, MKS Pogoń Szczecin, KS Lechia Gdańsk. W grze widać nazwy wyświetlane
  w grze (fikcyjne albo prawdziwe, jak w karierze).
- **Wynik:** 165 klubów gry ma prawdziwe dane (155 ze 156 zagranicznych i 10 polskich). Bez wpisu w rankingu:
  Dniepr Mohylew (BLR). Pozostałe 250 klubów rankingu nie gra w grze: są tylko w tabeli (klucz `x-kraj-nazwa`),
  ich punkty z kolejnych sezonów to brak, więc z czasem spadają do progu 20 % kraju.

### Zasady (src/season/uefaCoef.js)

- Współczynnik klubu = max(suma własnych punktów z 5 sezonów, 20 % pięcioletniego współczynnika kraju); wzór odtwarza
  kolumnę „Współcz.” z pliku dla wszystkich 415 klubów (test `tests/uefaCoef.test.mjs`).
- Współczynnik kraju = suma 5 współczynników sezonowych. Sezon: punkty wszystkich klubów kraju podzielone przez liczbę
  klubów kraju w pucharach (obcięte do 3 miejsc po przecinku).
- Mecz: zwycięstwo 2, remis 1 (faza ligowa i pucharowa, z barażami). Eliminacje Q1-PO: połowa (1 i 0,5), tylko dla kraju.
- Klub odpadły w eliminacjach (bez fazy ligowej) ma stałe punkty za ostatnią przegraną rundę: Q1 1, Q2 1,5, Q3 2, PO 2,5
  (z pliku: Valletta 1,5, GKS 2,0, Raków i Górnik 2,5); te punkty nie liczą się krajowi (Polska 3,600 = 18 / 5).
- Premie: udział w fazie ligowej LM 6 (z pliku: PSG i Real 14 pkt po 4 kolejkach); LE i LK bez premii za udział
  (Lech 1 pkt po remisie, Ararat-Armenia 0). [SZAC] dopasowane do sezonu 2024/25 z pliku (Liverpool, Barcelona, Arsenal,
  Inter, PSG, Man Utd, Tottenham, Chelsea zgadzają się co do punktu): miejsca 1-8 fazy ligowej (25 - miejsce) * 0,25
  plus premia za bezpośredni awans do 1/8; premia za 1/4, 1/2 i finał: LM 1,5, LE 1, LK 0. Klub z baraży nie dostaje
  premii za 1/8. Bayern i Brugge 2024/25 różnią się o 1-4 pkt (prawdopodobnie błąd w odtworzeniu ich wyników z pamięci).
- Gra symuluje 156 klubów zagranicznych zamiast ok. 230. Dzielnik kraju to prawdziwa liczba klubów (kolumna „Kluby 26/27”),
  a brakujące kluby liczą się jako odpadające w eliminacjach po 1 pkt kraju [SZAC]. Kraj bez klubów w grze: średnia
  z czterech wcześniejszych sezonów okna [SZAC]. Rosja (zawieszona) bez punktów.

### Okno sezonów, rozstawienia i lista dostępu

- Zapis: `game.uefaCoef = { v, seasons: ['2022/23', ...], clubs: { id: [5] }, countries: { kod: [5] }, prev }`. Ostatni
  sezon okna to sezon bieżący: w trakcie liczony na żywo z rozgrywek w grze, przy końcu sezonu (rollover) zapisany,
  potem okno przesuwa się o rok (najstarszy sezon do `prev`). Częściowy sezon 2026/27 z pliku zastępują wyniki z gry.
- Rozstawienia (`coefOf` w uefa.js) jak w UEFA: współczynniki po poprzednim sezonie (`prev` i cztery zakończone sezony
  okna). W sezonie 2026/27 (plik nie ma sezonu 2021/22) zostają wartości startowe z `kluby_uefa.json`, dobrane do
  prawdziwych koszyków 2026/27.
- Lista dostępu (miejsca polskich klubów, src/season/europeAccess.js) jak w UEFA z rocznym opóźnieniem: miejsca w sezonie N
  przydziela ranking po sezonie N-2. Pierwszy przydział w grze (2027/28): Polska 12. po sezonie 2025/26 (docs/ekspert_sedzia.md,
  B6), potem ranking z okna w zapisie. Wiadomość na koniec sezonu i Historia pokazują oba miejsca: po sezonie i do przydziału.
- Stare zapisy (`ensureUefaCoef`): okno z pliku; za sezony rozegrane przed zmianą sezon 2026/27 z pliku (stan Nov 5, 2026),
  późniejsze bez wyników: kraje średnią z okna. `game.countryCoef` = suma 5 sezonów po każdym sezonie (reputacja:
  widoczność Ekstraklasy liczona względem 45,725, współczynnika Polski na start gry).
- Współczynniki nie zmieniają siły drużyn L: tylko rozstawienia, przydział miejsc i rankingi.
- Widok: Rozgrywki, zakładka pucharu, „Ranking UEFA” z przełącznikiem Kluby i Kraje (pierwsza setka klubów i polskie
  kluby, filtr kraju, cała lista na życzenie; zmiana miejsca od początku sezonu).

## Niepewności

1. **Współczynniki klubowe** w polu `wspolczynnik` są w większości szacunkami (134 ze 156) i służą już tylko rozstawieniom w sezonie 2026/27 oraz renomie startowej; ranking w grze liczy prawdziwe punkty z `ranking_uefa.json` (rozdz. Ranking UEFA). WebFetch nie miał dostępu do kassiesa.net, rsssf.org i si.com (ograniczenia sieci sesji), a wyniki wyszukiwania podawały tylko fragmenty tabel, więc nie dało się pobrać pełnej tabeli 2026. Przed wydaniem gry warto podmienić wartości i przeliczyć L skryptem.
2. **Ranking krajów 2025**: pewne są wartości 12 krajów (m.in. Holandia 67.150, Portugalia 62.266, Belgia 56.850, Turcja 43.900, Norwegia 39.687, Grecja 39.312, Polska 35.000, Dania 33.981, Cypr 27.537, Szwecja 27.125, Chorwacja 27.025, Słowacja 21.250). Pozostałe 42 to szacunki. Kolejność w dolnej części tabeli (miejsca 29 do 54) jest przybliżona.
3. **Miejsca w rankingu klubowym** to w całości interpolacja, bez oficjalnej tabeli.
4. **Mistrz i Puchar Polski 2025/26**: Lech i Górnik potwierdzone w kilku źródłach, ale żadne z nich nie jest oficjalnym komunikatem Ekstraklasy lub PZPN. Data finału PP (May 2, 2026) pochodzi z jednego źródła; inne podaje May 31.
5. **Jagiellonia**: nie znalazłem meczów w LE Q2, więc start od Q3 to wniosek. Wynik meczu z Lewskim (Nov 5, 2026) niepotwierdzony.
6. **Górnik vs Fenerbahçe**: znany wynik 1. meczu (0-1), rewanżu nie.
7. **Rangers**: odpadł z LE Q3 z Jagiellonią; jego mecze w LK PO nie są potwierdzone (nie ma go w fazie ligowej LK).
8. **Pary w LK Q3** (RFS, Żalgiris Wilno, Apollon, Pjunik, Debrecen, Zirə, Paide, Vaduz, Shkëndija, Malisheva) znam z losowania, nie z wyników. Udział w eliminacjach jest pewny lub prawie pewny; runda odpadnięcia już nie.
9. **FK Witebsk i Dniepr Mohylew**: źródła są sprzeczne co do rywala Borac w LK Q3.
10. **Rezerwa `BRAK`** (Chelsea, Tottenham, Eintracht, Lazio, Fiorentina, Athletic, Newcastle, Nice): brak tych klubów w koszykach 2026/27 wynika z list koszyków. Nie sprawdzałem, czy któryś odpadł w eliminacjach.
11. **Środek LM** wychodzi na 14.6 zamiast ok. 14 (wyjaśnienie wyżej).
12. **Kluby z mocnych lig o niskim współczynniku** (Torreense 12.9, NEC 13.0, Sint-Truiden 12.7, Jablonec 12.3) dostają mocną korektę w górę. To celowe, ale warto to sprawdzić w testach balansu.
13. **Prestiż, trener, narodowość** to ocena redakcyjna, nie dane źródłowe.

## Źródła (wybór)

- Tabela Ekstraklasy 2025/26: [RSSSF](https://rsssf.org/tablesp/pol2026.html), [Eska](https://www.eska.pl/news/sport/ekstraklasa-przed-nowym-sezonem-kto-obroni-miejsce-na-podium-aa-8jYt-ZJVJ-UKZv.html), [2025-26 in Polish football](https://wiki.krisyotam.com/content/wikipedia_en_all_nopic_2026-03/2025%E2%80%9326_in_Polish_football)
- Puchar Polski: [2025-26 Polish Cup](https://en.wikipedia.org/wiki/2025%E2%80%9326_Polish_Cup)
- Lech: [Eska (Aarhus)](https://www.eska.pl/news/sport/liga-mistrzow-lech-poznan-odpada-po-dramacie-z-aarhus-aa-SAbH-rVg7-AMqk.html), [Flashscore (terminarz LE)](https://www.flashscore.pl/wiadomosci/pi-ka-nozna-liga-europy-lech-poznan-w-lidze-europy-mecze-przeciwnicy-i-transmisje-w-polsce/z7ldPjzS/), [TVP (Benfica 3-1)](https://www.tvp.info/96326779/benfica-lizbona-lech-poznan-31-liga-europy-mistrzowie-polski-znow-przegrali-w-lidze-europy)
- Jagiellonia: [beIN (Rangers)](https://prod.beinsports.com/en-us/soccer/uefa-europa-league/articles/rangers-1-1-jagiellonia-bialystok-2-3-agg-prelec-dumps-mcinnes-side-out-of-europa-league-2026-08-13), [Flashscore (terminarz LE)](https://www.flashscore.pl/wiadomosci/pi-ka-nozna-liga-europy-jagiellonia-bia-ystok-w-lidze-europy-mecze-przeciwnicy-i-transmisje-w-polsce/QN3vZHAM/)
- Górnik, Raków, GKS: [Flashscore (Monaco)](https://www.flashscore.pl/wiadomosci/gornik-poleg-na-lazurowym-wybrzezu-z-monaco-druzyna-z-zabrza-nie-zagra-w-lidze-konferencji/jJtw4W4U/), [11v11 (Raków-Hajduk)](https://www.11v11.com/matches/rakow-czestochowa-v-hajduk-split-27-august-2026-394414/), [Polskie Radio](https://polskieradio.pl/395/7790/Artykul/3717393,football-polish-clubs-post-mixed-results-in-european-qualifiers), [11v11 (GKS-Hapoel)](https://www.11v11.com/matches/gks-katowice-v-hapoel-tel-aviv-12-august-2026-394258/)
- Koszyki LM: [UEFA](https://uefa.com/uefachampionsleague/news/02a8-21717d0c6cb5-03a9a5ff1552-1000--champions-league-league-phase-draw-pots-confirmed), [Gulf News](https://gulfnews.com/sport/football/champions-league-draw-202627-uae-time-pots-new-rules-and-key-details-1.500653950), [SI (współczynniki)](https://www.si.com/soccer/2026-27-champions-league-projected-pots-man-utd-guaranteed-tough-draw)
- Koszyki LE: [UEFA](https://www.uefa.com/uefaeuropaleague/news/02a8-21736c090a44-d0fdd9f91599-1000--europa-league-league-phase-draw-pots-confirmed/), [UEFA (wyniki eliminacji)](https://www.uefa.com/uefaeuropaleague/news/02a6-20e5db0029dd-8241a8d00925-1000--europa-league-qualifying-fixtures-results-dates-how-it-works/)
- Koszyki LK: [UEFA](https://www.uefa.com/uefaconferenceleague/news/02a8-21737b647a3a-5340384ad5f6-1000--conference-league-league-phase-draw-pots-confirmed/), [UEFA PDF (terminarz wg koszyków)](https://editorial.uefa.com/resources/02a8-21772ccfd641-9f5eb41bf586-1000/uefa_-_conference_league_-_2026-27_-_league_phase_draw_results_-_calendar_by_pot.pdf)
- Eliminacje: [FBref](https://fbref.com/en/comps/8/qual/Champions-League-Qualifying-Rounds), [Terrikon](https://terrikon.com/en/posts/577278), [Sportsmole](https://www.sportsmole.co.uk/football/europa-conference-league/results.html)
- Ranking krajów: [Sofascore](https://www.sofascore.com/football/rankings/uefa), [Euroranking](https://euroranking.net/en/association-coefficient/), [2026-27 UEFA Europa League (współczynniki 2025)](https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Europa_League)

Pełna lista źródeł jest w `meta.zrodla` w pliku JSON. Skrypt generujący (`gen/gen.js`) pozwala zmienić współczynniki i przeliczyć L.
