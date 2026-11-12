# AI trenera w trakcie meczu: decyzje z ławki

Stan na Nov 11, 2026. Pytanie użytkownika: czy AI w meczu podejmuje decyzje o nastawieniu, podaniach, pressingu
i podobnych, czy tylko reaguje na wynik. Analiza z perspektywy trenera (decyzje z ławki), pomiary na kopii HEAD
(przed) i na kodzie po zmianie (teraz). Kod: `src/engine/match/coach.js`. Testy: `tests/aiCoach.test.mjs`.
Wcześniejszy katalog sytuacji (kartki, urazy, VAR, zarządzanie wynikiem): `docs/sytuacje-meczowe.md`.

Oznaczenia: [SZAC] szacunek projektowy bez źródła, [SYM] wynik symulacji w tym repozytorium.

## Odpowiedź w skrócie

Przed zmianą AI zmieniało instrukcje prawie wyłącznie z powodu **wyniku, minuty i liczby zawodników**: gonienie
i obrona wyniku, czerwone kartki, „faworyt szuka gola”, „bierzemy punkt”. Nie patrzyło na przebieg gry (kto przeważa,
skąd biorą się sytuacje rywala), na sposób gry rywala (pressing, niski blok, długie piłki), na kondycję ani na kartki
własnych zawodników. Agresji w odbiorze, krycia i kontrataku nie zmieniało nigdy (poza grą w dziesiątkę),
a w 1. połowie zmieniało taktykę tylko po czerwonej kartce lub urazie. Nie używało okrzyków, które ma gracz.

[SYM] Na 5000 meczach AI kontra pasywny gracz (gracz niczego nie zmienia) dawne AI nie zyskiwało nic na zarządzaniu
meczem: pasywny gospodarz miał 1,611 pkt na mecz, czyli tyle samo co AI w roli gospodarza (1,595 w meczach AI kontra AI).

Teraz trener ocenia mecz w punktach przeglądu (25. i 35. minuta, przerwa, przerwa na schłodzenie, punkty kontrolne
2. połowy) i koryguje plan z przyczyn innych niż wynik. Każda korekta ma czytelny powód w relacji, zmienia instrukcję,
która ma efekt w silniku, i podlega tym samym kosztom spójności co zmiana gracza.

## Zasady: co trener może wiedzieć

Trener AI widzi to, co widzi trener na ławce, i nic więcej:

| Widzi | Skąd w kodzie | Nie widzi |
|---|---|---|
| Wynik, minutę, liczebność, kartki, urazy, ławkę | stan meczu | przyszłych losowań |
| Kondycję i kartki własnych zawodników, ich technikę (średnie TEC, SZY) | `x.cond`, `x.yc`, `T.avg` | ukrytych atrybutów (`p.hidden`) |
| Strzały i groźne sytuacje obu drużyn, skąd się biorą (kontra, dystans, stały fragment), celność podań rywala | dziennik zdarzeń (`flowView`) | ocen stref (`T.zones`) |
| Posiadanie i przewagę w ostatnich minutach | `M.possession`, `M.momentum` | |
| Ustawienie i sposób gry rywala (wysokość pressingu i linii, nastawienie, styl podań, formacja) | `seenTactics`, z opóźnieniem rozpoznania 6-10 min (podpowiedź asystenta: 5 min) | agresji w odbiorze i krycia rywala |

Sposób gry rywala trener rozpoznaje z tego, co widać na boisku: wysokość pressingu, wysokość linii, liczbę zawodników
za piłką, długie piłki. W silniku te zachowania wynikają wprost z instrukcji, więc trener czyta instrukcje rywala,
ale dopiero kilka minut po zmianie (zmiana w 30. minucie jest widoczna najwcześniej w 36.). To uproszczenie
analizy wideo i obserwacji z ławki [SZAC].

Te same reguły obowiązują AI rywala, asystenta gracza przy „Pokaż wynik” i podpowiedzi asystenta (`assistantSuggest`).
Nie ma ukrytych premii: AI zmienia tylko swoją drużynę i tylko przez `changeTactics`, `substitute` i `shout`.

## Ile warte są instrukcje w silniku [SYM]

Żeby AI nie udawało mądrości, sprawdziłem, co każda reakcja daje w silniku. Metoda: te same mecze (to samo ziarno)
do danej minuty, potem jedna zmiana instrukcji u gospodarza i dogranie meczu przez AI. Średnie punkty gospodarza.

| Sytuacja (n) | Bez zmiany | Zmiana i wynik |
|---|---|---|
| Remis w 30. min (1533) | 1,554 | pressing wysoki **1,628**; linia niska 1,572; agresja twarda 1,546; łagodna 1,536; nastawienie -1: 1,525; nastawienie +1: 1,509; nastawienie -1 i niska linia 1,468; wolne tempo 1,453 |
| Każdy stan w 30. min (2000) | 1,597 | podania krótkie **1,704**; tempo szybkie 1,597; linia wysoka 1,579; pressing niski 1,559 |
| Rywal gra nisko (nastawienie -1, niska linia), 30. min (2000) | 1,589 | pressing wysoki **1,672**; podania krótkie **1,649**; nastawienie +1: 1,599; tempo szybkie 1,584; bez kontrataku 1,569 |
| Rywal pressuje wysoko od początku (2000) | 1,494 | podania krótkie **1,583**; bez kontrataku 1,458; linia wysoka 1,432; podania długie **1,386** |
| Własny wysoki pressing od początku, w 60. min zdjęty (2000) | 1,738 | pressing średni 1,673 |

Wnioski dla AI i dla balansu:

1. **Wysoki pressing i krótkie podania są w silniku bardzo opłacalne** (+0,07 do +0,17 pkt na mecz). Wysoki pressing
   kosztuje tylko kondycję (ok. 2 punkty kondycji mniej w 60. minucie) i trochę fauli, a efekt (`oppPActMul` 0,92,
   `oppPos` -0,12) nie słabnie ze zmęczeniem. Krótkie podania przy średniej technice drużyn Ekstraklasy (TEC ok. 12,3)
   dają dodatni `brkPerTec`. To pytanie balansowe do decyzji (otwarte pytania niżej). AI używa tych instrukcji tylko
   w sytuacjach, w których zrobiłby to trener, a nie zawsze.
2. **Ostrożne nastawienie (-1) w silniku prawie nie broni**: -10 % własnych akcji, a rywal traci ok. 1,5 % akcji i 4,5 %
   przełamań (D +0,3). Realny trener cofa się, gdy rywal przeważa, więc ostrożny trener AI dalej to robi
   (to jego ludzka słabość), a pragmatyczny i ofensywny wybierają wyższy pressing.
3. **Długie podania przeciw pressingowi nie działają**, bo silnik nie ma reguły z `docs/ekspert_futbol.md` 4.2
   „Długie podania kontra wysoki pressing: KON x1,3”. AI odpowiada na pressing krótkim rozegraniem (gdy ma technikę)
   albo rezygnuje z krótkiego rozegrania (gdy jej nie ma), a nie długimi piłkami.
4. **Zmęczenie ma w silniku mały wpływ**: kara za kondycję poniżej 85 (-0,04 na punkt) i ryzyko urazu x1,4 poniżej 70.
   Zdjęcie pressingu w 60. minucie kosztuje średnio 0,065 pkt. AI zdejmuje pressing dopiero przy naprawdę niskiej
   kondycji (średnio poniżej 76, w upale poniżej 79), czyli głównie w upale, przy zmęczonej kadrze albo w dogrywce
   meczu, i nigdy w końcowej pogoni za wynikiem.

## Katalog wyzwalaczy: co robi trener, co robił silnik, co robi teraz

Kolumna „Efekt w silniku” mówi, przez który parametr reakcja działa (`src/data/instructions.js`, `tacticParams`,
`counterBonus` w `core.js`). Prawdopodobieństwa i progi to [SZAC], skalibrowane tak, żeby korekty pojawiały się
w ok. 25 % meczów na drużynę (pomiar progów: rywal przeważa w co najmniej jednym przeglądzie w 27 % meczów drużyny).

### 1. Przebieg gry

| # | Sytuacja | Co robi trener | Przed | Teraz | Efekt w silniku |
|---|---|---|---|---|---|
| 1 | Rywal przeważa przy remisie lub prowadzeniu 1 golem (20 min: xG rywala wyższe o ok. 0,5 i 3 strzały więcej, albo 2 groźne sytuacje, albo wyraźnie ujemne momentum) | Zmienia coś, zanim padnie gol: wyżej pressing albo niższy blok | Brak | Ofensywny: wysoki pressing („rywal przeważa: wyżej pressing, odbieramy inicjatywę”). Pragmatyczny: wysoki pressing, gdy rywal ma piłkę (posiadanie poniżej 47 %), przy prowadzeniu nastawienie -1. Ostrożny: nastawienie -1, przy prowadzeniu niski blok | `oppPActMul`, `oppPos` albo `D`, `counterVulnMul` |
| 2 | Rywal groźny z kontr (co najmniej 2 i 40 % strzałów rywala z kontr) | Linia obrony niżej, mniej miejsca za plecami | Brak | Linia o stopień niżej („dostajemy kontry: cofamy linię obrony”) | linia wysoka daje rywalowi KON x1,35, niska KON x0,7 |
| 3 | Rywal strzela z dystansu przy niskiej linii | Wyżej linia, doskok do strzelającego | Brak | Linia średnia | niska linia daje rywalowi DYS x1,25 |
| 4 | Groźne stałe fragmenty rywala przy kryciu indywidualnym | Krycie strefowe | Brak | Krycie strefowe | `setPieceD` +0,3 |
| 5 | Dużo piłki, mało sytuacji (posiadanie od 56 %, prawie bez strzałów) przy remisie | Więcej ludzi w polu karnym albo cierpliwość | Brak | Ofensywny i pragmatyczny: nastawienie +1. Ostrożny: krótkie podania przy dobrej technice | `pActMul` +10 % albo `POZ` x1,2, `brkPerTec` |
| 6 | Zagrożenie minęło, a remis nie wystarcza | Wraca do odważniejszego planu | „Powrót do planu” tylko po zmianie wyniku | Ostrożne korekty z przebiegu gry wracają do planu najwcześniej po 20 min, gdy drużyna przeważa | jak wyżej |
| 7 | Nic się nie dzieje albo przewaga bez gola | Nie zmienia zwycięskiego planu | Brak zmian (OK) | Brak zmian: przewaga nie jest wyzwalaczem | |

### 2. Sposób gry rywala

| # | Sytuacja | Co robi trener | Przed | Teraz | Efekt w silniku |
|---|---|---|---|---|---|
| 8 | Rywal pressuje wysoko, my gramy krótko, słaba technika (TEC poniżej 12) | Prościej, bez ryzyka pod własną bramką | Brak | Podania mieszane („rywal pressuje wysoko: grajmy prościej”) | znika kara przełamania do -0,3 (`counterBonus`) |
| 9 | Rywal pressuje wysoko, mamy technikę (TEC od 12,3) | Rozegranie krótkimi podaniami przez pressing | Brak | Podania krótkie („rozgrywamy krótko przez pressing”). Najczęściej wobec rywala, który goni wynik wysokim pressingiem | premia przełamania do +0,35, `POZ` x1,2 |
| 10 | Rywal gra wysoko (nastawienie +1, wysoka linia), my bez kontrataku | Kontry za plecy | Brak | Kontratak włączony | `konVsAttack` 1,6 i premia szybkości |
| 11 | Rywal gra długimi piłkami albo rzuca się do ataku, nasza linia wysoko | Niżej linia | Brak | Linia średnia | KON rywala x1,35 znika |
| 12 | Rywal się cofnął (nastawienie -1, niska linia, 5-4-1 lub 5-3-2) przy remisie | Cierpliwe rozegranie, odbiór wysoko | Brak | Krótkie podania (TEC od 11,5), inaczej wysoki pressing | pomiar wyżej: +0,06 i +0,08 pkt |
| 13 | Rywal gra krótko i myli się w rozegraniu (celność podań poniżej 79 % z co najmniej 80 podań) | Wysoki pressing na jego rozegranie | Brak | Wysoki pressing | kara przełamania rywala do -0,3, `oppPActMul` |
| 14 | Rywal zmienia ustawienie lub instrukcje | Rozpoznaje po kilku minutach i dopasowuje się | Brak | Rozpoznanie po 6-10 min (`seenTactics`), potem reguły 8-13 | |
| 15 | Rywal wygrywa środek pola (więcej środkowych pomocników, nasze posiadanie poniżej 42 %, xG rywala nie niższe) | Dodatkowy środkowy pomocnik w przerwie | Brak | W przerwie (za darmo) nowe ustawienie z dodatkowym środkowym (4-4-2 na 4-2-3-1, 4-2-3-1 na romb, 3-4-3 na 3-5-2, 5-4-1 na 5-3-2), tylko gdy zawodnicy pasują (dopasowanie co najmniej 98 % obecnego) i nie przy -2 | `0,08` logitu posiadania na środkowego, strefy MID |
| 16 | Rywal szeroki lub wąski, silny w powietrzu | Szerokość, krycie w polu karnym | Brak | **Bez zmian**: silnik nie ma instrukcji szerokości (tylko `W` formacji, różnica 4-2-3-1 i 4-3-3 to 0,1, czyli premia 0,025) ani efektu gry w powietrzu poza stałymi fragmentami | brak efektu, więc AI tego nie udaje |

### 3. Stan własnych zawodników

| # | Sytuacja | Co robi trener | Przed | Teraz | Efekt w silniku |
|---|---|---|---|---|---|
| 17 | Zmęczenie przy wysokim pressingu lub szybkim tempie (średnia kondycja w polu poniżej 76 lub 74, w upale +3), od 50. min, w upale już w przerwie | Niższy pressing, wolniejsze tempo | Tylko zmiany zawodników | Pressing średni, tempo normalne („zmęczenie: niższy pressing”); nie w pogoni od 70. min | `fatMul` 1,2 i 1,12 znikają; mniejsze ryzyko urazu poniżej 70 |
| 18 | Dwóch ukaranych obrońców lub defensywnych pomocników albo trzech ukaranych w ogóle, do 78. min | Ostrożniej w odbiorze | Tylko zmiana zagrożonego zawodnika | Agresja łagodna („kilku zawodników z kartkami: ostrożniej w odbiorze”); przy twardej i jednym ukaranym obrońcy: normalna | faule x0,8, żółte na faul x0,8, faule taktyczne x0,5, kosztem `D` -0,2 |
| 19 | Jeden kluczowy zawodnik z kartką | Uwaga indywidualna dla zawodnika | Zmiana zagrożonego od 55. min | **Bez zmian w instrukcjach**: silnik nie ma instrukcji dla pojedynczego zawodnika; zostaje zmiana zawodnika (sytuacje-meczowe 9) | |
| 20 | Przegrywamy 0:2 przed przerwą | Zmiana jeszcze w 1. połowie albo w przerwie | Pogoń w przerwie, potem w 46. min „powrót do planu” (przestawianie tam i z powrotem) | Pogoń od 40. min (ofensywny od 30., ostrożny od 45.), bez cofania w 46. | `pActMul` |
| 21 | Gra w dziesiątkę i niekorzystny wynik przed porą pogoni | Zwarty blok do czasu pogoni | Po przeglądzie wracał wyjściowy plan (np. wysoki pressing w dziesiątkę) | Blok i kontry do czasu pogoni | |

### 4. Czas, osobowość, omylność

| # | Element | Przed | Teraz |
|---|---|---|---|
| 22 | Kiedy trener ocenia plan | 46, 55, 60 ... 119 i po golu od 60. min | Dodatkowo 25. i 35. minuta, przerwa na schłodzenie w upale (30. min każdej połowy); przegląd planu także w przerwie i punktach kontrolnych |
| 23 | Osobowość (`T.coach`) | Tylko progi gonienia i obrony wyniku, gra na czas | Także sposób reakcji na przewagę rywala (ofensywny pressing, ostrożny niski blok, pragmatyczny wg posiadania i wyniku) i szansa reakcji: na sposób gry rywala pragmatyczny 0,7, pozostali 0,45; na przebieg gry 0,55-0,65 |
| 24 | Omylność | Brak | Upór losowany raz na mecz z RNG meczu: pragmatyczny 10 %, ofensywny 20 %, ostrożny 30 %. Uparty trener reaguje z połową szansy i robi najwyżej 2 korekty planu. Czas rozpoznania zmian rywala 6-10 min |
| 25 | Okrzyki z linii bocznej | Tylko gracz | AI i asystent używają tych samych okrzyków na tych samych zasadach (przerwa 8 min, „Brawo” 2 razy, trener na trybunach bez okrzyków): „Brawo” po golu (0,35), „Naprzód” w pogoni od 75. min (0,3, ostrożny 0,2), „Uwaga z tyłu” przy prowadzeniu 1 golem pod presją od 80. min, „Więcej walki” w słabszym okresie przy niekorzystnym wyniku |

### 5. Histereza i koszty

- Zmiana instrukcji kosztuje spójność jak u gracza (`applyTacticChange`: 5 za instrukcję, 10 za formację, x2 w ciągu
  10 minut, w przerwie za darmo). Korekta z przebiegu gry przychodzi najwcześniej 10 minut po poprzedniej zmianie
  (poza przerwą), więc AI nie płaci podwójnej kary.
- Korekty z przebiegu meczu zmieniają **plan** trenera (`T.adj`), a nie tylko bieżące instrukcje. Reguły wyniku
  (gonimy, bronimy) działają na planie, a „powrót do planu” wraca do planu z korektami. Bez tego AI cofałoby
  korektę przy następnym punkcie kontrolnym.
- Ta sama instrukcja może być ponownie skorygowana najwcześniej po 15 minutach, najwyżej 2 korekty w jednym przeglądzie
  i 4 w meczu (uparty: 2).
- Wynik ma pierwszeństwo: gdy reguła wyniku ustawia daną instrukcję (np. wysoki pressing w końcowej pogoni), korekta
  tej instrukcji z przebiegu gry nie działa.

## Powody w relacji

Każda zmiana taktyki ma powód w polu `reason` zdarzenia `tactic`. Przy zbiegu reguły wyniku i korekty powody są łączone
średnikiem, np. „Zmiana taktyki: podania: Krótkie (bronimy wyniku; rywal pressuje wysoko: rozgrywamy krótko przez
pressing)”. Nowe powody: „rywal przeważa: …”, „rywal ma piłkę: wyżej pressing”, „dostajemy kontry: cofamy linię obrony”,
„rywal strzela z dystansu: wyżej linia obrony”, „groźne stałe fragmenty: krycie strefowe”, „dużo piłki, mało sytuacji: …”,
„opanowaliśmy mecz: wracamy do planu”, „rywal pressuje wysoko: …”, „rywal gra wysoko: szybkie kontry za plecy”,
„rywal gra długimi piłkami: niżej linia obrony”, „rywal rzuca się do ataku: niżej linia obrony”, „rywal się cofnął: …”,
„rywal myli się w rozegraniu: wysoki pressing”, „zmęczenie: …”, „kilku zawodników z kartkami: ostrożniej w odbiorze”,
„obrońca z kartką: bez twardych wejść”, „przegrywamy środek pola: dodatkowy środkowy pomocnik”.

Podpowiedź asystenta (`assistantSuggest`) korzysta z tej samej oceny bez losowania i bez zmiany meczu. Dla drużyny
gracza planem są jego bieżące instrukcje, więc asystent nie proponuje cofnięcia zmian, które gracz zrobił sam.

## Zmiany w kodzie

- `src/engine/match/coach.js`: `flowView` (obraz meczu z ławki z dziennika zdarzeń, liczony leniwie w punktach oceny),
  `seenTactics` (ustawienie rywala z opóźnieniem), `planInstr` (plan z korektami), `reviewAdjust` (katalog wyżej),
  `mindOf` (upór i czas rozpoznania), przegląd w 25. i 35. min i w przerwie na schłodzenie, okrzyki AI (`aiShout`),
  `MANAGED` obejmuje agresję w odbiorze, krycie i kontratak. `desiredInstructions(T, st, extra)` ma trzeci, opcjonalny
  argument. Szybkie wyjście `aiDecide` zostaje (trener myśli tylko w punktach oceny i po zdarzeniach).
- `src/engine/match/core.js`: zdarzenia strzałów mają pole `kind` (typ akcji: POZ, SKR, KON, DYS, SP, FK).
- `src/engine/match/teams.js`: `T.tacLog` (historia ustawień, z której ławka rywala czyta z opóźnieniem).
- Publiczne API `match.js` bez zmian.

## Kalibracja przed i po [SYM]

5000 meczów Ekstraklasy (te same pary i ziarna), oba kluby prowadzi AI, chyba że zaznaczono inaczej.

| Statystyka | Przed | Teraz | Cel |
|---|---|---|---|
| Gole na mecz | 2,72 | 2,78 | 2,70-2,80 |
| Gospodarz / remis | 44,8 / 25,1 % | 45,0 / 24,8 % | 45 / 27 % |
| Punkty gospodarza | 1,595 | 1,598 | |
| Strzały / xG | 24,9 / 2,71 | 25,1 / 2,74 | ok. 25 |
| Żółte / czerwone | 4,38 / 0,233 | 4,33 / 0,228 | |
| Zmiany zawodników na drużynę | 4,23 | 4,23 | 4-4,5 |
| Zmiany taktyki na mecz (obie drużyny) | 4,44 | 5,06 | 5-8 |
| w tym w 1. połowie (bez przerwy) / w przerwie | 0,13 / 0,19 | 0,43 / 0,30 | |
| Mecze bez żadnej zmiany taktyki | 6,5 % | 3,1 % | |
| Korekty z przebiegu meczu i sposobu gry rywala | 0 | 0,87 na mecz | |
| Okrzyki AI na drużynę | 0 | 0,87 | |
| Czas na mecz (bez obciążenia) | 4,5 ms | 4,9 ms | poniżej 10 ms |

Powody zmian taktyki na mecz (obie drużyny): gonimy wynik 1,88 i 1,91, bronimy wyniku 1,10 i 1,03, więcej napastników
0,39 i 0,44, powrót do planu 0,27 i 0,15, czerwona kartka 0,21 i 0,21; nowe: kartki 0,34 (z połączonymi 0,41),
rywal pressuje wysoko 0,15, rywal przeważa lub ma piłkę 0,10, rywal się cofnął 0,05, dużo piłki bez sytuacji 0,09,
kontry rywala 0,02. Instrukcje na mecz (przed, teraz): agresja w odbiorze 0 i 0,42, podania krótkie 0,11 i 0,32,
pressing wysoki 0,80 i 0,88, nastawienie -1 0,89 i 0,94, linia niska 0,06 i 0,07, formacja 1,19 i 1,19.

Balans gracz kontra AI (te same ziarna):

| Tryb | Punkty gospodarza przed | Teraz |
|---|---|---|
| AI kontra AI | 1,595 | 1,598 |
| Pasywny gracz u siebie (nic nie zmienia) kontra AI | 1,611 | 1,537 |
| Gracz z własnym stylem (pressing, niski blok, długie, krótkie, ofensywnie), bez zmian w meczu, 3000 meczów | 1,551 | 1,517 |

Mądrzejsze AI zyskuje ok. 0,06-0,07 pkt na mecz wobec gracza, który w meczu niczego nie zmienia (ok. 2-2,5 pkt w sezonie
34 kolejek). To trudność organiczna: te same narzędzia ma gracz, a asystent przy „Pokaż wynik” gra tak samo dobrze
jak AI. Testy `tests/balance.test.mjs` przechodzą bez zmian.

## Otwarte pytania

1. **Wysoki pressing jest w silniku zbyt tani** (+0,17 pkt na mecz, gdy gra się nim od początku). Propozycja do decyzji:
   efekt pressingu słabnie, gdy średnia kondycja spada (np. pełny efekt od 80, zero przy 60), albo większa podatność
   na kontry, gdy rywal przechodzi pressing. Wtedy reakcja AI na zmęczenie będzie się opłacać, a nie tylko chronić przed urazami.
2. **Krótkie podania są opłacalne dla prawie każdej drużyny Ekstraklasy** (+0,1 pkt), bo średnia technika to ok. 12,3.
   Do rozważenia przesunięcie punktu odniesienia `brkPerTec` z 11 na ok. 12.
3. **Brak reguły „długie podania kontra wysoki pressing”** z `docs/ekspert_futbol.md` 4.2 (KON x1,3) i „niska linia
   i strefa kontra długie podania”. Bez nich odpowiedź „grajmy długimi piłkami na pressing” nie ma sensu w silniku.
4. **Ostrożne nastawienie prawie nie broni** (rozdział o wartości instrukcji). Obrona wyniku AI działa dzięki
   zmianom personalnym i ustawieniu, a nie nastawieniu -1.
5. **Przedmeczowy wybór taktyki AI** (`src/match/matchday.js`) to zawsze 4-2-3-1 i instrukcje domyślne. Dobór
   pod rywala z `docs/ekspert_futbol.md` 7.1 (pragmatyk dobiera kontrę na styl rywala) jest poza silnikiem meczu.
6. Gole wzrosły z 2,72 do 2,78 (górna granica celu). Jeśli ma zostać 2,72, wystarczy `K.pAction` 0,39 na ok. 0,385.
   Nie zmieniałem tego, bo szybka symulacja meczów w tle daje ok. 2,86 gola, więc pełny silnik jest teraz bliżej niej.

## Źródła

- Druga połowa i zmęczenie: spadek biegania o wysokiej intensywności w drugiej połowie, zwłaszcza po intensywnej
  pierwszej połowie ([Frontiers in Sports and Active Living, 2020](https://www.frontiersin.org/articles/10.3389/fspor.2020.570937/pdf),
  [PMC7739604](https://pmc.ncbi.nlm.nih.gov/articles/PMC7739604)). Brak badania mierzącego wprost PPDA w obu połowach,
  więc próg zdejmowania pressingu to [SZAC].
- Moment zmian w meczu: EURO 2024, 466 zmian w 51 meczach, 72 % zmian personalnych wynikało ze zmiany taktyki
  lub pozycji; spadek wydolności najczęściej po ok. 60. minucie
  ([Frontiers in Sports and Active Living, Jul 10, 2025](https://www.frontiersin.org/articles/10.3389/fspor.2025.1573823/full)).
  Przegląd w 25. i 35. minucie to [SZAC] (obserwacja trenerska, bez źródła ilościowego).
- Przerwa na schłodzenie jako okazja do przekazania uwag taktycznych
  ([Edge Hill University, Jul 1, 2026](https://www.edgehill.ac.uk/?p=330086), [IFAB: cooling-off periods](https://www.theifab.com/trials/cooling-off-periods)).
- Wartości instrukcji w silniku: pomiary [SYM] skryptami poza repozytorium (te same ziarna, zmiana w danej minucie).

## Atrybuty trenera (Nov 12, 2026)

Od tej wersji trener AI ma atrybuty 1-20 (taktyka w meczu, skład i plan, motywacja, trening, wielkie mecze),
które przesuwają szanse reakcji, upór, czas rozpoznania, próg zmęczenia, okrzyki i dodają błędy słabego taktyka.
Średni trener (10,5) i drużyna bez profilu zachowują się dokładnie jak opisano wyżej. Szczegóły, liczby
i kalibracja: `docs/trener-ai-atrybuty.md`.
