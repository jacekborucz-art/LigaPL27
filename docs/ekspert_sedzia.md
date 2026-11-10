# Specyfikacja zasad: silnik meczowy i logika sezonu (sezon 2026/27)

Stan wiedzy: Nov 10, 2026. Autor: analiza "sędziowsko-regulaminowa" na potrzeby gry typu football manager (3 polskie ligi + Puchar Polski + puchary UEFA).

## 0. Jak czytać ten dokument

Każda informacja ma znacznik pewności:

| Znacznik | Znaczenie |
|---|---|
| **[PEWNE]** | Stały przepis IFAB albo informacja zgodna w kilku niezależnych źródłach, w tym oficjalnych (UEFA, IFAB, PZPN). |
| **[ŹRÓDŁO]** | Jedno źródło prasowe lub kilka niespójnych; prawdopodobnie prawda, do weryfikacji w regulaminie. |
| **[ZAŁOŻENIE]** | Moja wiedza ekspercka lub stan z poprzednich sezonów, bez potwierdzenia na 2026/27. |
| **[SZACUNEK]** | Wartość statystyczna przybliżona (do balansu gry, a nie jako fakt). |

Ograniczenie badania: w tej sesji działało tylko wyszukiwanie WebSearch. Pobieranie stron (WebFetch) było zablokowane dla theifab.com, pzpn.pl, en.wikipedia.org, więc nie przeczytałem pełnych tekstów regulaminów PZPN 2026/27 ani dokumentu IFAB "Changes to the Laws of the Game 2026/27". Wszystko, co pochodzi z regulaminów krajowych na 2026/27, traktuj jako do weryfikacji. Aby to domknąć, w ustawieniach sieci sesji trzeba dopuścić domeny `theifab.com`, `pzpn.pl`, `ekstraklasa.org`, `documents.uefa.com`.

Zalecenie architektoniczne: **wszystkie liczby regulaminowe trzymaj w jednym pliku konfiguracyjnym per rozgrywki** (sekcja 11), żeby poprawka regulaminu nie wymagała zmian w kodzie silnika.

---

# CZĘŚĆ A. MECZ

## A1. Zmiany zawodników

### Przepisy IFAB (Law 3)

| Reguła | Wartość | Pewność |
|---|---|---|
| Maks. zmian w meczu (rozgrywki najwyższego poziomu) | **5** | [PEWNE] (stały przepis od 2022/23) |
| Liczba "okien" (opportunities) na zmiany w trakcie gry | **3** | [PEWNE] |
| Zmiany w przerwie meczu | nie zużywają okna (ale zużywają limit 5) | [PEWNE] |
| Zmiany przed dogrywką i w przerwie dogrywki | nie zużywają okna | [PEWNE] |
| Dogrywka | **+1 zmiana i +1 okno**; niewykorzystane zmiany i okna z 90 min przechodzą na dogrywkę | [PEWNE] |
| Zmiana jednocześnie u obu drużyn | gdy obie drużyny zmieniają w tej samej przerwie w grze, każdej liczy się okno | [PEWNE] |
| Maks. liczba rezerwowych w protokole wg IFAB | do **15**, konkretną liczbę ustala regulamin rozgrywek | [PEWNE] |
| Powrót zmienionego zawodnika | **NIE** (tzw. return substitutions tylko w grassroots, młodzieży, weteranach) | [PEWNE] |
| Zawodnik schodzący po autoryzacji zmiany | musi opuścić boisko w **10 s**; jeśli nie, rezerwowy wchodzi dopiero przy pierwszej przerwie w grze po upływie **1 minuty** gry (drużyna gra chwilowo w 10) | [ŹRÓDŁO] (IFAB 2026/27, Irish FA, Concacaf; obowiązuje od Jul 1, 2026) |
| Mecze towarzyskie reprezentacji A | do 8 zmian (po porozumieniu do 11) | [ŹRÓDŁO] (nieistotne dla gry klubowej) |

### Zmiany "concussion" (permanentne zmiany przy podejrzeniu wstrząśnienia mózgu)

- Protokół IFAB jest **opcjonalny dla organizatora**: każda drużyna może dokonać maks. 1 dodatkowej zmiany "concussion"; gdy z niej korzysta, przeciwnik też dostaje +1 zmianę (i okno). [PEWNE co do protokołu]
- **UEFA (LM/LE/LK)**: według mojej wiedzy UEFA nie stosuje tego protokołu w rozgrywkach klubowych. [ZAŁOŻENIE]
- **Ekstraklasa, 1L, 2L**: brak potwierdzenia stosowania. [ZAŁOŻENIE: nie stosowane]
- Rekomendacja dla gry: flaga `concussionSubs: false` dla wszystkich rozgrywek, z możliwością włączenia.

### Liczba rezerwowych w protokole

| Rozgrywki | Rezerwowi | Pewność |
|---|---|---|
| UEFA LM/LE/LK | **12** (protokół 23 zawodników) | [ZAŁOŻENIE: stan 2025/26, brak sygnałów zmiany] |
| Ekstraklasa | **12** (protokół do 23) od 2025/26; wcześniej 9 (protokół 20) | [ŹRÓDŁO] (lodzkisport.pl, jedno źródło) |
| 1 Liga | 9 | [ZAŁOŻENIE] |
| 2 Liga | 9 | [ZAŁOŻENIE] |
| Puchar Polski | 9 | [ZAŁOŻENIE] |

Uwaga: bramkarz rezerwowy nie jest wymagany przepisami, ale gra powinna ostrzegać, gdy na ławce brak GK.

## A2. Kartki i dyscyplina

### Kiedy żółta (Law 12, napomnienie) [PEWNE]

- Niesportowe zachowanie (w tym symulacja, przerwanie korzystnego ataku SPA faulem lub ręką, faul lekkomyślny, czyli "reckless").
- Niezadowolenie słowem lub gestem (dissent).
- Uporczywe naruszanie przepisów.
- Opóźnianie wznowienia gry.
- Nieprzestrzeganie odległości przy rzucie wolnym, rożnym, wrzucie.
- Wejście lub opuszczenie boiska bez zgody sędziego.
- DOGSO w polu karnym, gdy zawodnik **próbował zagrać piłkę** i sędzia dyktuje karnego (tzw. "zasada potrójnej kary"; wtedy żółta zamiast czerwonej).
- DOGSO, gdy sędzia dał korzyść i padł gol: brak kartki za DOGSO (ewentualnie żółta za SPA tylko przy innym przewinieniu). [ŹRÓDŁO, IFAB 2026/27 doprecyzowanie]
- Od 2025/26 w UEFA i wielu ligach: tylko kapitan może podchodzić do sędziego; grupowe otaczanie sędziego zwykle kończy się żółtymi. [PEWNE dla UEFA]

### Kiedy czerwona (wykluczenie) [PEWNE]

- **DOGSO** (pozbawienie oczywistej szansy na gola) faulem poza polem karnym, ręką (zawsze czerwona, poza bramkarzem w swoim polu karnym), lub w polu karnym bez próby zagrania piłki (trzymanie, pchanie).
- **SFP** (poważny rażący faul): wejście z nadmierną siłą lub zagrażające bezpieczeństwu ("excessive force").
- **Gwałtowne zachowanie** (violent conduct), także poza walką o piłkę i wobec osób spoza boiska.
- Plucie, gryzienie.
- Obraźliwy, obelżywy język lub gesty.
- **Druga żółta** w tym samym meczu.

### Skutki na boisku [PEWNE]

- Wykluczonego zawodnika **nie można zastąpić**. Drużyna gra w osłabieniu.
- Zawodnik wykluczony przed rozpoczęciem meczu (po złożeniu protokołu) może być zastąpiony rezerwowym, a limit zmian się nie zmniejsza (ale rezerwowego nie dopisuje się). [PEWNE]
- **Minimalnie 7 zawodników** (w tym bramkarz) by mecz trwał. Gdy spadnie poniżej 7, sędzia przerywa mecz. [PEWNE]
- Skutek regulaminowy w Polsce: walkower **0:3** dla drużyny winnej (lub wynik z boiska, jeśli korzystniejszy dla poszkodowanego). [ZAŁOŻENIE, zgodne z praktyką PZPN]
- Bramkarz wykluczony: inny zawodnik z pola lub rezerwowy (kosztem zmiany i zejścia gracza z pola) musi zostać bramkarzem.

### Kumulacja żółtych kartek: Ekstraklasa, 1L, 2L

| Próg | Kara | Pewność |
|---|---|---|
| 4. żółta | 1 mecz | [ŹRÓDŁO] (liczne relacje "pauza po 4 kartkach") |
| 8. żółta | 1 mecz | [ŹRÓDŁO] (Radio Kraków, starszy sezon) |
| 12. żółta | 2 mecze | [ŹRÓDŁO] (Radio Kielce, kontekst baraży) |
| Kolejne (16., 20. ...) | 2 mecze | [ZAŁOŻENIE] |

- Kartki **nie zerują się w trakcie sezonu ligowego** (jesień + wiosna to jeden licznik). [ZAŁOŻENIE, praktyka PZPN]
- Kartki z sezonu zasadniczego **przechodzą na baraże** (1L i 2L). [ŹRÓDŁO]
- Puchar Polski ma **osobny licznik** (kartki z ligi nie liczą się w pucharze i odwrotnie). [ZAŁOŻENIE]
- Kara zawsze w **tych samych rozgrywkach** (pauza ligowa nie obowiązuje w pucharze). [ZAŁOŻENIE, standard]
- Czerwona kartka w lidze: dyskwalifikacja automatyczna w lidze; czerwona za przemoc może skutkować karą rozciągniętą przez Komisję Ligi.

### Długość dyskwalifikacji za czerwoną (Polska)

| Powód | Kara (rekomendacja do gry) | Pewność |
|---|---|---|
| Druga żółta | 1 mecz (automat) | [ZAŁOŻENIE, standard] |
| DOGSO (faul taktyczny) | 1 mecz | [ŹRÓDŁO] (Radio Kraków: "1 mecz tylko gdy czerwona jest wynikiem faulu taktycznego") |
| SFP (rażący faul) | min. 2 mecze, typowo 2-3 | [ŹRÓDŁO] ("minimum 2 mecze we wszystkich innych przypadkach", starszy tekst) |
| Gwałtowne zachowanie | 3-5 meczów | [ZAŁOŻENIE] |
| Obraźliwy język | 2-3 mecze | [ZAŁOŻENIE] |

Komisja Ligi Ekstraklasy SA może też **anulować** czerwoną (np. po odwołaniu i analizie wideo) lub podwyższyć karę. [ŹRÓDŁO] (Soccerway: anulowana czerwona Gurgula; Lech: kara 2 i 3 meczów). W grze: losowanie z rozkładu, 3-5% szans na anulowanie czerwonej po proteście klubu.

### Kumulacja kartek w pucharach UEFA (2026/27, ZMIANA!)

| Faza | Próg | Pewność |
|---|---|---|
| Eliminacje (Q1 do play-off) | pauza po **3.** żółtej, potem 5., 7. itd. | [ŹRÓDŁO] |
| Od fazy ligowej (LM, LE, LK) | pauza po **4.** żółtej, potem **6., 8., 10.** itd. | [ŹRÓDŁO] (UEFA zmiana potwierdzona Aug 6, 2026, wiele mediów) |
| Zerowanie | żółte (bez niewykonanych pauz) wygasają po zakończeniu **eliminacji** (rundy play-off) oraz po **ćwierćfinale** | [ŹRÓDŁO] |
| Finał | nie można pauzować za żółte z półfinału (wyzerowane po QF, a 4 żółtych w PF się nie zbierze); pauza za czerwoną obowiązuje | [ŹRÓDŁO] |
| Czerwona | min. 1 mecz (druga żółta, DOGSO); SFP/przemoc zwykle 2-3+ (decyzja CEDB) | [ZAŁOŻENIE] |
| Przeniesienie kary | niewykonana pauza przechodzi na **następny mecz UEFA**, także w innych rozgrywkach (np. spadek z eliminacji LM do LE) | [ZAŁOŻENIE, standard UEFA] |

## A3. Rzuty karne w trakcie meczu

**Kiedy** [PEWNE]: przewinienie karane rzutem wolnym bezpośrednim popełnione przez obrońcę we własnym polu karnym, gdy piłka jest w grze (faul, zagranie ręką, trzymanie, kopnięcie, także przewinienie "na piłkę poza akcją" w polu karnym).

| Parametr | Wartość | Pewność |
|---|---|---|
| Karnych na mecz (oba zespoły, ligi z VAR) | **0,28-0,35** | [SZACUNEK] |
| Skuteczność karnego w meczu | **75-78%** (w literaturze i źródłach 70-80%) | [SZACUNEK] (meczyki.pl: 70-80%) |
| Rozkład niestrzelonych | ok. 70% obrona bramkarza, 30% pudło/słupek | [SZACUNEK] |
| Dobitka | po obronie lub odbiciu od słupka piłka w grze; strzelający **nie może dotknąć piłki drugi raz**, zanim dotknie jej inny zawodnik (gdy odbije się tylko od słupka/poprzeczki) | [PEWNE] |
| Szansa na gola z dobitki po nieudanym karnym | ok. 10-15% | [SZACUNEK] |
| Bramkarz wychodzi przed linię i karny chybiony | powtórka; pierwsze takie przewinienie upomnienie słowne, kolejne żółta | [PEWNE] (od 2024/25 w praktyce) |
| Udział VAR | ok. 25-35% karnych w ligach z VAR to karne podyktowane lub cofnięte po interwencji VAR | [SZACUNEK] |

Uwaga dla silnika: **seria rzutów karnych po dogrywce nie ma dobitek**, a skuteczność jest nieco niższa (ok. 70-75%).

## A4. VAR

### Kiedy VAR może interweniować [PEWNE: protokół IFAB]

Tylko "oczywisty i wyraźny błąd" lub "poważne przeoczone zdarzenie" w czterech kategoriach:

1. **Gol / brak gola** (spalony, faul lub ręka w fazie ataku, piłka poza boiskiem przed golem).
2. **Rzut karny / brak karnego**.
3. **Czerwona kartka bezpośrednia** (nie druga żółta do 2025/26).
4. **Pomyłka tożsamości** (kartka dla złego zawodnika).

### Nowości 2026/27

| Zmiana | Status | Pewność |
|---|---|---|
| VAR może interweniować przy **drugiej żółtej**, gdy jest ewidentnie błędna | wprowadzona przez IFAB, stosowana m.in. w Bundeslidze i UEFA | [ŹRÓDŁO] |
| VAR może skorygować **ewidentnie błędnie przyznany rzut rożny**, jeśli da się to zrobić natychmiast, bez opóźniania wznowienia | opcja dla organizatora | [ŹRÓDŁO] (IFAB, UEFA potwierdza wąskie stosowanie) |
| Trial: oczywiste przewinienia drużyny atakującej przed wznowieniem (rożny, wolny) | tylko próbnie (MŚ 2026), IFAB Circular 34 | [ŹRÓDŁO] |
| Ekstraklasa: centralny pokój VOR w siedzibie PZPN (system od Orange) zamiast wozów VAR przy stadionach | od 2026/27 | [ŹRÓDŁO] (antyweb.pl, spidersweb.pl) |
| Czy Ekstraklasa stosuje VAR na drugą żółtą i rożne | brak oficjalnego potwierdzenia | [ZAŁOŻENIE: tak, zgodnie z IFAB] |

### VAR w Polsce

| Liga | VAR | Pewność |
|---|---|---|
| Ekstraklasa | **tak, wszystkie mecze** | [PEWNE] |
| 1 Liga | **nie** w sezonie zasadniczym (ewentualnie wybrane mecze lub baraże) | [ZAŁOŻENIE] (brak źródła o wdrożeniu) |
| 2 Liga | **nie** | [ZAŁOŻENIE] |
| Puchar Polski | tak od fazy, gdy grają kluby Ekstraklasy na stadionach z infrastrukturą; pewnie od 1/4 | [ZAŁOŻENIE] |
| Puchary UEFA | tak, od 3. rundy eliminacji LM / play-off (w praktyce szerzej) i całe fazy ligowe | [ZAŁOŻENIE] |

### Statystyki VAR (do balansu)

| Parametr | Wartość | Pewność |
|---|---|---|
| Zmiany decyzji (overturns) na mecz | **0,25-0,35** (Premier League 2025/26: 105 zmian w 380 meczach, ok. 0,28) | [ŹRÓDŁO] dla PL / [SZACUNEK] dla Ekstraklasy |
| Czas analizy "on-field review" (sędzia przy monitorze) | 60-120 s, średnio ok. 80 s | [ŹRÓDŁO] (Sky Sports, starszy sezon) |
| Czas "cichego sprawdzenia" (check) | 10-40 s, zwykle niewidoczne | [SZACUNEK] |
| Strata czasu na VAR w meczu łącznie | ok. 45-70 s średnio na mecz (PL: 47-48 s w 2025/26) | [ŹRÓDŁO] |
| Udział interwencji wg kategorii | ok. 40% gole (głównie spalone), 40% karne, 15% czerwone, 5% tożsamość | [SZACUNEK] |

## A5. Czas doliczony

### Realia [SZACUNEK, na bazie trendu po wytycznych IFAB/FIFA 2023 o dokładnym doliczaniu]

| Połowa | Typowo | Rozrzut | Średnia |
|---|---|---|---|
| 1. połowa | 1-5 min | 0-8 | ok. 3 min |
| 2. połowa | 4-8 min | 2-13 | ok. 6 min |
| Łącznie | | | 9-10,5 min (Premier League 2025/26: ok. 10 min 20 s) [ŹRÓDŁO] |

Uwaga: od 2026/27 w rozgrywkach UEFA zegar na stadionie **może biec dalej po 45. i 90. minucie**, pokazując czas doliczony. [ŹRÓDŁO]

### Czynniki wydłużające (wartości do formuły) [SZACUNEK]

| Zdarzenie | Doliczenie |
|---|---|
| Gol (celebracja, wznowienie) | 0,6-1,0 min |
| Okno zmian (1-3 zawodników) | 0,4-0,6 min |
| Kontuzja z wejściem medyków | 0,8-1,5 min (poważna 3-8 min) |
| VAR: on-field review | 1,0-2,0 min |
| VAR: długi check bez review | 0,3-0,6 min |
| Kartka (z dyskusją) | 0,2-0,3 min |
| Grający na czas (prowadzący zespół) | 0,5-1,5 min za połowę |
| Przerwa na schłodzenie (upał > 32°C WBGT) | 3 min (opcja organizatora) |

### Proponowana formuła (prosta, deterministyczna + szum)

```javascript
// Wynik: liczba minut doliczonych pokazywana na tablicy (całkowita).
// events: liczniki zdarzeń w danej połowie.
function addedTime(half, ev, rng) {
  const base = half === 1 ? 1.0 : 2.0;
  const raw =
    base +
    0.8 * ev.goals +
    0.5 * ev.subWindows +            // w 1. połowie zwykle 0
    1.0 * ev.injuriesTreated +
    3.0 * ev.seriousInjuries +
    1.5 * ev.varReviews +
    0.4 * ev.varLongChecks +
    0.25 * (ev.yellows + ev.reds) +
    (half === 2 ? 0.8 * ev.timeWastingIndex : 0.3 * ev.timeWastingIndex) + // 0..1
    (rng() * 1.2 - 0.4);             // szum sędziowski -0,4..+0,8
  const min = half === 1 ? 1 : 2;
  const max = half === 1 ? 9 : 15;
  return Math.max(min, Math.min(max, Math.round(raw)));
}
// Faktycznie rozegrany czas >= pokazany; zdarzenia w doliczonym czasie mogą go wydłużyć
// (np. gol w 90+3 przy pokazanych 4 min => gra do ok. 90+5).
```

Kalibracja: przy typowym meczu (1. połowa: 1 gol, 1 kontuzja, 1 kartka; 2. połowa: 2 gole, 3 okna zmian, 1 kontuzja, 3 kartki, 0,3 przeszkadzania) daje ok. 3 i 7 minut, czyli zgodnie z realiami.

## A6. Dogrywka i rzuty karne po dogrywce

### Dogrywka [PEWNE]

- **2 x 15 min**, krótka przerwa między połowami dogrywki (bez schodzenia do szatni), przerwa przed dogrywką do 5 min (zmiany w tym czasie nie zużywają okna).
- Brak "złotego" i "srebrnego gola" (zniesione).
- +1 zmiana, +1 okno (sekcja A1).
- Kiedy stosowana: mecze jednomeczowe pucharowe (Puchar Polski, baraże 1L i 2L, finały UEFA) oraz dwumecze UEFA, gdy po 180 min jest remis w sumie (bramki na wyjeździe zniesione od 2021/22).

### Rzuty karne (Law 10, "kicks from the penalty mark") [PEWNE]

1. Losowanie monetą: zwycięzca wybiera bramkę; drugie losowanie: zwycięzca wybiera, czy strzela pierwszy czy drugi.
2. Kolejność **A-B-A-B** (próba ABBA zakończona przez IFAB, nie stosować).
3. **5 serii**; seria kończy się wcześniej, gdy jedna drużyna nie może już dogonić drugiej nawet przy wszystkich pozostałych trafieniach.
4. Remis po 5 seriach: **nagła śmierć** (po jednej serii, aż jedna drużyna strzeli, a druga nie, przy równej liczbie strzałów).
5. **Uprawnieni**: tylko zawodnicy przebywający na boisku na koniec dogrywki (oraz ci chwilowo poza nim, np. opatrywani, za zgodą sędziego). Rezerwowi i zmienieni zawodnicy **nie strzelają**.
6. **Wyrównanie liczebności**: przed serią drużyna z większą liczbą zawodników redukuje skład do liczebności rywala (kapitan informuje sędziego, kto jest wyłączony). Wykluczeni zawodnicy nie mogą strzelać ani być bramkarzem.
7. Każdy zawodnik strzela raz; **nikt nie strzela drugi raz, dopóki wszyscy uprawnieni nie strzelą** (w tym bramkarz). Kolejność strzelających wybiera drużyna, nie musi jej zgłaszać z góry.
8. **Bramkarz** może być zmieniony w trakcie serii, jeśli nie może kontynuować (kontuzja): przez rezerwowego z protokołu (jeśli drużyna nie wykorzystała limitu zmian) albo przez zawodnika wyłączonego przy wyrównaniu liczebności. Każdy uprawniony zawodnik może w dowolnej chwili zamienić się miejscami z bramkarzem. Zastąpiony bramkarz nie strzela.
9. Żółta kartka w serii: liczy się do statystyk dyscyplinarnych. Druga żółta lub czerwona: zawodnik nie strzela, przeciwnik **nie** musi redukować składu po rozpoczęciu serii (redukcja tylko przed serią).
10. Bramki z serii **nie liczą się** do wyniku meczu ani do klasyfikacji strzelców (zapis np. "1:1, k. 4:3").

Skuteczność rzutów w serii: ok. **70-75%** na strzał. [SZACUNEK]

## A7. Kontuzje

| Reguła | Szczegóły | Pewność |
|---|---|---|
| Przerwanie gry | sędzia przerywa przy poważnej kontuzji lub urazie głowy; przy lekkiej czeka na wyjście piłki z gry | [PEWNE] |
| Opatrywany na boisku musi zejść | tak, zawodnik, który był opatrywany na boisku, opuszcza boisko | [PEWNE] |
| Kiedy może wrócić (2026/27) | dopiero po **1 minucie gry** od wznowienia, za zgodą sędziego (zwykle z linii bocznej) | [ŹRÓDŁO] (IFAB 2026/27, Irish FA, LFF Łotwa) |
| Wyjątki od schodzenia | kontuzja bramkarza; zderzenie bramkarza z zawodnikiem z pola; zderzenie zawodników tej samej drużyny; poważna kontuzja; faul, za który przeciwnik dostał żółtą lub czerwoną (szybka ocena) | [PEWNE] (lista z Law 5) |
| Brak zmian | drużyna gra w 10 (tymczasowo lub do końca); nie ma "zmiany awaryjnej" poza concussion (gdy stosowany) | [PEWNE] |
| Kontuzjowany bramkarz bez zmian | zawodnik z pola zostaje bramkarzem (zmiana koszulki) | [PEWNE] |
| Spadek poniżej 7 z powodu kontuzji | mecz przerwany; w PZPN zwykle walkower dla rywala, jeśli drużyna celowo doprowadziła do sytuacji; inaczej decyzja organu | [ZAŁOŻENIE] |

Częstotliwość do balansu [SZACUNEK]:
- przerwy na opatrzenie: 2-4 na mecz (oba zespoły),
- zmiany wymuszone kontuzją: 0,2-0,3 na drużynę na mecz,
- kontuzja z absencją > 1 tydzień: ok. 0,1-0,15 na drużynę na mecz.

## A8. Statystyki meczowe (Ekstraklasa, średnio na mecz, oba zespoły łącznie)

| Statystyka | Wartość | Pewność |
|---|---|---|
| Gole | **2,7-2,9** (2025/26: 2,88 po ok. 160 meczach) | [ŹRÓDŁO] |
| Strzały | 22-26 | [SZACUNEK] |
| Strzały celne | 7,5-9 | [SZACUNEK] |
| Skuteczność celnych strzałów | ok. 30-35% celnych kończy się golem | [SZACUNEK] |
| Rzuty rożne | **9,5-10,0** (jedno źródło: 9,92) | [ŹRÓDŁO] |
| Faule | 24-28 | [SZACUNEK] |
| Żółte kartki | **4,2-4,6** (2023/24: 4,40) | [ŹRÓDŁO] (meczyki.pl) |
| Czerwone kartki | 0,15-0,25 (w tym druga żółta ok. 40%) | [SZACUNEK] |
| Spalone | 3,5-4,5 | [SZACUNEK] |
| Rzuty karne | 0,28-0,35 | [SZACUNEK] |
| Gospodarz: udział zwycięstw / remisów / porażek | ok. 44% / 26% / 30% | [SZACUNEK] |

Dla porównania (meczyki.pl, sezon niepodany): Premier League ok. 5,4 kartki/mecz, La Liga 4,8, Bundesliga 4,64. [ŹRÓDŁO]

Dla 1L i 2L przyjmij: nieco więcej fauli i kartek (+5-10%), nieco mniej celnych strzałów, gole ok. 2,6-2,8. [SZACUNEK]

---

# CZĘŚĆ B. SEZON I REGULAMINY

## B1. Ekstraklasa 2026/27

| Parametr | Wartość | Pewność |
|---|---|---|
| Drużyny | **18** | [PEWNE] |
| Kolejki | **34** (mecz i rewanż) | [PEWNE] |
| Start | **Jul 24, 2026** (1. kolejka Jul 24-26, 2026) | [PEWNE] (kilka źródeł) |
| Runda jesienna | 18 kolejek; ostatnia **Dec 11-14, 2026** (zaległe mecze możliwe Dec 16-20) | [ŹRÓDŁO] |
| Przerwa zimowa | ok. **Dec 15, 2026 - Jan 28, 2027** | [ŹRÓDŁO] |
| Runda wiosenna | 16 kolejek od **Jan 29, 2027** | [PEWNE] (zgodne źródła) |
| Koniec | **May 22, 2027** (34. kolejka) | [PEWNE] |
| Spadek | **3 drużyny** (miejsca 16-18) bezpośrednio do 1 Ligi | [ZAŁOŻENIE, format stały od 2021/22] |
| Awans z 1 Ligi | 3 (miejsca 1-2 + zwycięzca baraży) | [ŹRÓDŁO] (2025/26: Wieczysta jako 3. beniaminek po barażu) |
| Baraże w Ekstraklasie | **brak** (ani o mistrza, ani o utrzymanie) | [ZAŁOŻENIE] |
| Kolejność w tabeli przy równej liczbie punktów | 1) punkty w meczach bezpośrednich, 2) różnica bramek w meczach bezpośrednich, 3) różnica bramek ogółem, 4) bramki zdobyte ogółem, 5) liczba zwycięstw, 6) fair play, 7) losowanie | [ZAŁOŻENIE] (polska praktyka: mecze bezpośrednie przed bilansem ogólnym; do weryfikacji) |
| Punktacja | 3 / 1 / 0 | [PEWNE] |

## B2. 1 Liga (Betclic 1. Liga) 2026/27

| Parametr | Wartość | Pewność |
|---|---|---|
| Drużyny / kolejki | 18 / 34 | [PEWNE] |
| Start | Jul 24, 2026 | [ŹRÓDŁO] (Wikipedia) |
| Koniec sezonu zasadniczego | koniec maja 2027 (ok. May 29-30, 2027) | [ZAŁOŻENIE] |
| Awans bezpośredni | **miejsca 1-2** | [PEWNE] |
| Baraże o Ekstraklasę | **miejsca 3-6**: półfinały **3 vs 6**, **4 vs 5** (Jun 3, 2027), finał **Jun 6, 2027**; jeden mecz, gospodarz: drużyna wyżej w tabeli; dogrywka i karne | [ŹRÓDŁO] (Wikipedia, PZPN terminarz) |
| Spadek do 2 Ligi | **3 drużyny** (miejsca 16-18) | [ZAŁOŻENIE] (bilans: 3 awansują z 2L) |
| Przerwa zimowa | ok. połowa grudnia do końca lutego / początku marca | [ZAŁOŻENIE] |

## B3. 2 Liga (Betclic 2. Liga) 2026/27

| Parametr | Wartość | Pewność |
|---|---|---|
| Drużyny / kolejki | 18 / 34 | [PEWNE] |
| Start / koniec sezonu zasadniczego | Jul 24, 2026 / **May 29, 2027** | [ŹRÓDŁO] (Wikipedia) |
| Awans bezpośredni | **miejsca 1-2** | [ŹRÓDŁO] |
| Baraże o 1 Ligę | **miejsca 3-6** (3 vs 6, 4 vs 5, finał; jeden mecz u wyżej sklasyfikowanego), czerwiec 2027 | [ŹRÓDŁO] |
| Spadek bezpośredni | **4 drużyny** (miejsca 15-18) do 3 Ligi | [ŹRÓDŁO] |
| Baraże o utrzymanie | **miejsca 13-14** grają z drużynami 3 Ligi (opis źródeł niespójny: zwycięzcy grup lub drużyny z 2. miejsc) | [ŹRÓDŁO, niespójne] |

Rekomendacja dla gry: w 2L zaimplementuj miejsca 13-14 jako "baraż o utrzymanie" z wirtualnym przeciwnikiem z 3 Ligi (siła losowa z dolnego zakresu 2L), dwumecz lub jeden mecz u drużyny z 2L. Albo wyłącz flagą, jeśli 3 Liga nie jest modelowana.

## B4. Puchar Polski (STS Puchar Polski) 2026/27

| Runda | Termin | Uczestnicy | Pewność |
|---|---|---|---|
| Runda wstępna | ok. Aug 5, 2026 (ok. 10-11 meczów) | część 2 Ligi, zdobywcy pucharów wojewódzkich (16 ZPN), ewentualnie 3 Liga | [ŹRÓDŁO, niespójne] |
| I runda (1/32) | **Sep 1-3, 2026**, 27 meczów | 13 klubów Ekstraklasy (bez 5 grających w pucharach UEFA), 18 z 1 Ligi, kluby 2 Ligi, zwycięzcy rundy wstępnej | [ŹRÓDŁO] |
| 1/16 | **Oct 27-29, 2026** (główny dzień Oct 28) | 27 zwycięzców + **5 klubów z pucharów UEFA** (2026/27: Lech, Górnik Zabrze, Jagiellonia, Raków, GKS Katowice) | [ŹRÓDŁO] |
| 1/8 | **Dec 1-3, 2026** (główny dzień Dec 2) | 16 | [ŹRÓDŁO] |
| 1/4 | **Mar 3, 2027** (ok. Mar 2-4) | 8 | [ŹRÓDŁO] |
| 1/2 | **Apr 7, 2027** (ok. Apr 6-8) | 4 | [ŹRÓDŁO] |
| Finał | **May 2, 2027**, PGE Narodowy, Warszawa | 2 | [PEWNE] (zgodne źródła) |

Zasady meczu [ZAŁOŻENIE na podstawie regulaminu 2025/26]:
- Wszystkie rundy **jednomeczowe**.
- Gospodarz: drużyna z **niższej klasy rozgrywkowej**; przy tej samej klasie decyduje losowanie (kolejność losowania). Finał na neutralnym stadionie.
- Remis po 90 min: **dogrywka 2 x 15**, potem **rzuty karne**.
- Zdobywca Pucharu Polski 2025/26: Górnik Zabrze (2:0 z Rakowem, May 2, 2026). [PEWNE]
- Zdobywca PP dostaje miejsce w pucharach UEFA (sekcja B6) oraz grę w Superpucharze Polski (lipiec, mistrz vs zdobywca PP, jeden mecz, przy remisie od razu karne). [ZAŁOŻENIE co do braku dogrywki w Superpucharze]

## B5. Młodzieżowiec, obcokrajowcy, kadry

### Przepis o młodzieżowcu

| Liga | 2026/27 | Pewność |
|---|---|---|
| Ekstraklasa | **brak obowiązku** wystawiania młodzieżowca (zniesiony od 2025/26); zamiast tego program **"Młodzieżowiec 2.0"**: nagrody finansowe (pula min. 28 mln zł na sezon dla E, 1L, 2L) za minuty młodzieżowców | [ŹRÓDŁO] (PZPN uchwała May 19, 2025, kilka mediów) |
| 1 Liga | obowiązek **min. 1 młodzieżowca na boisku przez cały mecz** (stan 2025/26) | [ŹRÓDŁO] dla 2025/26, [ZAŁOŻENIE] dla 2026/27 |
| 2 Liga | obowiązek **min. 2 młodzieżowców na boisku przez cały mecz** (stan 2025/26) | [ŹRÓDŁO] dla 2025/26, [ZAŁOŻENIE] dla 2026/27 |
| Definicja młodzieżowca | obywatel Polski, który w roku kalendarzowym zakończenia sezonu kończy **21 lat lub mniej**; dla 2025/26 rocznik 2005 i młodsi, więc dla **2026/27: rocznik 2006 i młodsi** | [ŹRÓDŁO] dla zasady, [ZAŁOŻENIE] dla rocznika 2026/27 |

Skutek naruszenia w 1L/2L (gra bez wymaganego młodzieżowca): walkower. Gdy młodzieżowiec dostaje czerwoną kartkę lub kontuzję bez możliwości zmiany, drużyna nie jest karana (praktyka PZPN). [ZAŁOŻENIE]

### Obcokrajowcy spoza UE

| Liga | Limit | Pewność |
|---|---|---|
| Ekstraklasa | **brak limitu** na boisku i w kadrze (zniesiony ok. 2019/20; potwierdzone dla 2021/22) | [ŹRÓDŁO] |
| 1L, 2L (i 3L) | dowolna liczba w kadrze, **maks. 2 spoza UE jednocześnie na boisku** (stan 2025/26) | [ŹRÓDŁO] |
| Ukraińcy | nie wliczają się do limitu spoza UE (decyzja PZPN, wprowadzona po 2022) | [ŹRÓDŁO] |
| Planowane | PZPN pracuje nad limitem/minimum Polaków w kadrach (zespół roboczy, maj 2026); brak decyzji na 2026/27 | [ŹRÓDŁO] |
| UEFA | brak limitu obcokrajowców; jest wymóg wychowanków: **lista A maks. 25**, w tym **8 miejsc dla "homegrown"** (z czego maks. 4 wychowanków innych klubów krajowych); jeśli brak homegrown, lista się skraca; **lista B** bez limitu (U21 w klubie min. 2 lata) | [ZAŁOŻENIE, stały przepis UEFA] |

### Limit zgłoszonych zawodników (kadra sezonowa)

- Ekstraklasa / 1L / 2L: brak twardego limitu liczby zgłoszonych zawodników, który byłby potwierdzony źródłem. [ZAŁOŻENIE]
- Rekomendacja dla gry: miękki limit 30 w kadrze pierwszej drużyny (powyżej: kara do morale lub finansów), twardy limit 40.
- Protokół meczowy: sekcja A1.

## B6. Puchary UEFA 2026/27

### Format faz ligowych [PEWNE: format od 2024/25]

| | LM | LE | LK |
|---|---|---|---|
| Drużyny w fazie ligowej | 36 | 36 | 36 |
| Mecze na drużynę | **8** (4 dom, 4 wyjazd; 2 rywali z każdego z 4 koszyków) | **8** (jak LM) | **6** (3 dom, 3 wyjazd; 6 koszyków po 6, po 1 rywalu z każdego) |
| Miejsca 1-8 | 1/8 finału | 1/8 finału | 1/8 finału |
| Miejsca 9-24 | play-off fazy pucharowej (9-16 rozstawione, rewanż u siebie) | jak LM | jak LM |
| Miejsca 25-36 | odpadają (brak spadku do niższych rozgrywek) | odpadają | odpadają |
| Rozstrzyganie dwumeczów | suma bramek, potem dogrywka 2 x 15, potem karne (bez bramek wyjazdowych) | jak LM | jak LM |
| Finał | 1 mecz, neutralny stadion | jak LM | jak LM |

Kolejność w tabeli fazy ligowej (regulamin UEFA 2024/25-2025/26): 1) punkty, 2) różnica bramek, 3) bramki zdobyte, 4) bramki zdobyte na wyjeździe, 5) zwycięstwa, 6) zwycięstwa na wyjeździe, 7) punkty rywali, 8) różnica bramek rywali, 9) bramki rywali, 10) fair play, 11) współczynnik klubowy. [ZAŁOŻENIE, stan 2025/26]

### Terminy LM 2026/27

| Etap | Daty | Pewność |
|---|---|---|
| Q1 | Jul 7-8 i Jul 14-15, 2026 | [ŹRÓDŁO] (UEFA) |
| Q2 | Jul 21-22 i Jul 28-29, 2026 | [ŹRÓDŁO] (UEFA) |
| Q3 | Aug 4-5 i Aug 11, 2026 | [ŹRÓDŁO] (UEFA) |
| Play-off | Aug 18-19 i Aug 25-26, 2026 | [ŹRÓDŁO] (UEFA) |
| Losowanie fazy ligowej | Aug 27, 2026 | [ŹRÓDŁO] |
| Kolejki 1-8 | Sep 8-10; Sep 29-30 lub Oct 13-14 (źródła sprzeczne); Oct 20-21; Nov 3-4; Nov 24-25; Dec 8-9, 2026; Jan 19-20, 2027; **Jan 27, 2027** (wszystkie mecze równocześnie) | [ŹRÓDŁO] |
| Play-off fazy pucharowej | Feb 16-17 i Feb 23-24, 2027 | [ŹRÓDŁO] |
| 1/8 | Mar 9-10 i Mar 16-17, 2027 | [ŹRÓDŁO] |
| 1/4 | Apr 6-7 i Apr 13-14, 2027 | [ŹRÓDŁO] |
| 1/2 | Apr 27-28 i May 4-5, 2027 | [ŹRÓDŁO] |
| Finał | **Jun 5, 2027**, Estadio Metropolitano, Madryt | [ŹRÓDŁO] (większość źródeł; Budapeszt był finałem 2025/26) |

### Terminy LE 2026/27

| Etap | Daty | Pewność |
|---|---|---|
| Q3 (LE) | Aug 6 i Aug 13, 2026 (np. Jagiellonia - Rangers) | [ŹRÓDŁO] |
| Play-off | Aug 20 i Aug 27, 2026 | [ŹRÓDŁO] |
| Losowanie fazy ligowej | Aug 28, 2026 | [ŹRÓDŁO] |
| Kolejki 1-8 | Sep 16-17, Oct 15, Oct 22, Nov 5, Nov 26, Dec 10, 2026; Jan 21, Jan 28, 2027 | [ŹRÓDŁO] (UEFA) |
| Play-off fazy pucharowej | Feb 18 i Feb 25, 2027 | [ŹRÓDŁO] |
| 1/8 | Mar 11 i Mar 18, 2027 | [ZAŁOŻENIE] (czwartki po LM) |
| 1/4 | Apr 8 i Apr 15, 2027 | [ŹRÓDŁO] |
| 1/2 | Apr 29 i May 6, 2027 | [ŹRÓDŁO] |
| Finał | **May 26, 2027**, Frankfurt | [ŹRÓDŁO, jedno źródło] |

### Terminy LK 2026/27

| Etap | Daty | Pewność |
|---|---|---|
| Q1 | Jul 7-9 i Jul 14-16, 2026 | [ŹRÓDŁO] |
| Q2 | Jul 23 i Jul 30, 2026 | [ŹRÓDŁO] (UEFA EN; wersja FR podaje Jul 21-23 / Jul 28-30) |
| Q3 | Aug 6 i Aug 13, 2026 | [ŹRÓDŁO] |
| Play-off | Aug 20 i Aug 27, 2026 | [ŹRÓDŁO] |
| Kolejki 1-6 | Oct 15, Oct 22, Nov 5, Nov 26, Dec 10, Dec 17, 2026 | [ŹRÓDŁO] (UEFA; jedno źródło podaje start Oct 1) |
| Play-off fazy pucharowej | Feb 18 i Feb 25, 2027 | [ŹRÓDŁO] |
| 1/8 | Mar 11 i Mar 18, 2027 | [ŹRÓDŁO] |
| 1/4 | Apr 8 i Apr 15, 2027 | [ŹRÓDŁO] |
| 1/2 | Apr 29 i May 6, 2027 | [ŹRÓDŁO] |
| Finał | **Jun 2, 2027**, Stambuł (stadion Beşiktaşu) | [ŹRÓDŁO] |

Uwaga: wg zebranych dat LE i LK grają część kolejek tego samego dnia (czwartki). Dla gry nie ma to znaczenia, bo polski klub gra tylko w jednych rozgrywkach.

### Miejsca w pucharach dla Polski

**Sezon 2026/27** (dostęp wg rankingu krajowego UEFA na koniec 2024/25: Polska **15. miejsce**, czyli **5 drużyn**) [ŹRÓDŁO, kilka źródeł]:

| Kwalifikacja | Rozgrywki i runda wejścia | Klub 2026/27 | Pewność |
|---|---|---|---|
| Mistrz Polski | LM, **Q2 ścieżka mistrzów** | Lech Poznań | [ŹRÓDŁO] |
| Wicemistrz | LM, **Q2 ścieżka ligowa** | Górnik Zabrze | [ŹRÓDŁO] |
| Zdobywca PP (lub 3. miejsce, gdy zdobywca PP ma już miejsce z ligi) | LE, **Q3** | Jagiellonia (Górnik wygrał PP i był 2.) | [ŹRÓDŁO] |
| 4. miejsce | LK, **Q2** | Raków | [ŹRÓDŁO] |
| 5. miejsce | LK, **Q2** | GKS Katowice | [ŹRÓDŁO] |

Mechanika "spadania" w eliminacjach [PEWNE, stała zasada UEFA]: przegrany z Q1/Q2 ścieżki mistrzów LM spada do eliminacji LE (lub LK); przegrany play-off LM trafia do fazy ligowej LE; przegrany play-off LE trafia do fazy ligowej LK; przegrany Q3 LE trafia do play-off LK. Przegrany w fazie ligowej nie spada już do niższych rozgrywek.

**Sezon 2027/28** (ważne, bo to drugi sezon w grze): Polska zakończyła 2025/26 na **12. miejscu** rankingu krajowego UEFA. Według meczyki.pl mistrz Polski wejdzie do LM od **rundy play-off** (gwarancja minimum fazy ligowej LE). [ŹRÓDŁO] Pozostałe miejsca: do potwierdzenia, bo 2027/28 to nowy cykl listy dostępu UEFA (2027-2030). [ZAŁOŻENIE]

Rekomendacja dla gry: zaimplementuj **dynamiczny ranking krajowy** (5-letnia suma, punkty za wyniki polskich klubów dzielone przez liczbę klubów) i tablicę "pozycja w rankingu -> runda wejścia" w konfiguracji. Pozycja 10 = mistrz bezpośrednio w fazie ligowej LM.

## B7. Okna transferowe w Polsce 2026/27

| Okno | Daty | Pewność |
|---|---|---|
| Letnie 2026 | ok. **Jul 1 - Sep 1, 2026** (główne ligi europejskie zamykały okna Sep 1, 2026) | [ZAŁOŻENIE] |
| Zimowe 2027 | ok. **Feb 1 - Feb 25/26, 2027** (precedens: okno zimowe 2026 otwarte Feb 1, zamknięte ok. Feb 25-26) | [ŹRÓDŁO dla 2026, ZAŁOŻENIE dla 2027] |
| Wolni agenci (bez kontraktu) | można rejestrować poza oknem | [ZAŁOŻENIE, standard FIFA] |

Uwaga: precyzyjnych dat PZPN na 2026/27 nie znalazłem; ustal je w konfiguracji. W grze wymagaj: rejestracja zawodnika najpóźniej dzień przed meczem, w którym ma zagrać.

## B8. Sędziowie: statystyki i "surowość"

| Parametr | Wartość | Pewność |
|---|---|---|
| Żółte kartki na mecz, średnia ligowa | 4,2-4,6 | [ŹRÓDŁO] |
| Najłagodniejsi sędziowie (sezonowo) | ok. 3,0-3,6 żółtej/mecz | [SZACUNEK] |
| Najsurowsi | ok. 5,5-6,5 żółtej/mecz | [SZACUNEK] |
| Czerwone na mecz | 0,1 do 0,35 w zależności od sędziego | [SZACUNEK] |
| Karne na mecz | 0,2 do 0,45 w zależności od sędziego | [SZACUNEK] |
| Liczba sędziów w puli Ekstraklasy | ok. 20-25 głównych | [SZACUNEK] |

### Model do gry

```javascript
// Cecha sędziego, losowana raz przy tworzeniu sędziego (lekko zmienna między sezonami)
referee = {
  strictness: clamp(normal(1.0, 0.13), 0.70, 1.40),     // mnożnik prawdopodobieństwa żółtej
  redTendency: clamp(normal(1.0, 0.20), 0.60, 1.60),    // mnożnik czerwonych
  penaltyTendency: clamp(normal(1.0, 0.18), 0.60, 1.50),// mnożnik karnych
  advantageTendency: clamp(normal(1.0, 0.15), 0.6, 1.4),// skłonność do korzyści (mniej przerw)
  addedTimeBias: normal(0.0, 0.5)                       // minuty, dodawane do doliczonego czasu
};
// P(żółta | faul) = base(fouleType) * referee.strictness * matchHeat
// matchHeat: derby 1.15, mecz o stawkę (końcówka, spadek) 1.10, mecz bez stawki 0.90
```

Kalibracja: przy 26 faulach na mecz i średniej 4,4 żółtej bazowe P(żółta | faul) wynosi ok. 0,15 (część kartek nie jest za faule, np. za dyskusję lub opóźnianie; przyjmij 80% kartek za faule, 20% za inne).

---

# CZĘŚĆ C. REGUŁY TWARDE, MIĘKKIE, PUŁAPKI

## C1. REGUŁY TWARDE (muszą być w kodzie; walidacja, nie balans)

1. **Skład**: 11 w składzie wyjściowym, w tym dokładnie 1 bramkarz; rezerwowi maks. wg rozgrywek (UEFA 12, Ekstraklasa 12 [do weryfikacji], 1L/2L 9 [do weryfikacji]).
2. **Zmiany**: maks. **5** w 90 min, maks. **3 okna** w trakcie gry; przerwa meczu, przerwa przed dogrywką i przerwa w dogrywce nie zużywają okna.
3. **Dogrywka**: +1 zmiana i +1 okno; niewykorzystane zmiany i okna przechodzą.
4. **Zmieniony zawodnik nie wraca** na boisko.
5. **Rezerwowy wchodzi tylko za zawodnika, który zszedł**; zmiana tylko przy przerwie w grze.
6. **Wykluczony zawodnik nie może być zastąpiony**; drużyna gra w osłabieniu.
7. **Mniej niż 7 zawodników**: przerwanie meczu, walkower 0:3 (lub wynik boiskowy, jeśli korzystniejszy dla przeciwnika).
8. **Druga żółta = czerwona**, zawodnik schodzi natychmiast.
9. **Kontuzjowany i opatrywany na boisku musi zejść**, wraca po min. 1 minucie gry od wznowienia (2026/27), chyba że wyjątek z A7.
10. **Bramkarz musi być zawsze na boisku**; gdy brak zmian, zawodnik z pola przejmuje bramkę.
11. **Seria karnych**: ABAB, 5 serii + nagła śmierć, wcześniejsze zakończenie gdy matematycznie rozstrzygnięte, tylko zawodnicy na boisku na koniec dogrywki, wyrównanie liczebności przed serią, nikt nie strzela drugi raz przed wszystkimi uprawnionymi, gole z serii nie liczą się do wyniku ani strzelców.
12. **Zawieszenia za kartki (liga)**: 4., 8. żółta = 1 mecz, 12. = 2 mecze; liczone per rozgrywki; licznik nie zeruje się w przerwie zimowej.
13. **Zawieszenia UEFA 2026/27**: eliminacje: pauza po 3. żółtej; od fazy ligowej: po 4., 6., 8. żółtej; zerowanie po eliminacjach i po ćwierćfinale; pauza przenosi się na kolejny mecz UEFA.
14. **Czerwona = min. 1 mecz pauzy** w tych samych rozgrywkach; zawodnik zawieszony nie może być w protokole.
15. **Dwumecz UEFA**: suma bramek; bez bramek wyjazdowych; remis = dogrywka w rewanżu, potem karne.
16. **Faza ligowa UEFA**: 36 drużyn; 8/8/6 meczów; 1-8 do 1/8, 9-24 do play-off (9-16 grają rewanż u siebie), 25-36 odpadają, brak spadku do niższych rozgrywek.
17. **Ekstraklasa**: 18 drużyn, 34 kolejki, 3 spadają, bez baraży.
18. **1 Liga**: miejsca 1-2 awans, 3-6 baraż (3v6, 4v5, finał; jeden mecz u wyżej sklasyfikowanego), 16-18 spadek.
19. **2 Liga**: 1-2 awans, 3-6 baraż, 15-18 spadek, 13-14 baraż o utrzymanie (jeśli modelowana 3 Liga).
20. **Puchar Polski**: jednomeczowy, gospodarz z niższej ligi, dogrywka + karne, 5 klubów z pucharów UEFA wchodzi od 1/16, finał May 2, 2027 na neutralnym stadionie.
21. **Młodzieżowiec**: 1L min. 1, 2L min. 2 na boisku przez cały mecz (jeśli 2026/27 bez zmian); Ekstraklasa bez obowiązku.
22. **Limit spoza UE**: 1L i 2L maks. 2 jednocześnie na boisku; Ekstraklasa bez limitu.
23. **Transfery**: rejestracja tylko w oknie (poza wolnymi agentami).
24. **Lista A UEFA**: maks. 25, w tym 8 miejsc homegrown.
25. **Punktacja**: 3-1-0; tie-breaker wg rozgrywek (Ekstraklasa: mecze bezpośrednie najpierw; UEFA faza ligowa: różnica bramek najpierw).

## C2. REGUŁY MIĘKKIE (balans, prawdopodobieństwa; wszystko w konfiguracji)

| Parametr | Wartość domyślna |
|---|---|
| Gole na mecz (E / 1L / 2L) | 2,85 / 2,75 / 2,70 |
| Strzały / celne na mecz | 24 / 8,3 |
| Rożne na mecz | 9,8 |
| Faule na mecz | 26 |
| Żółte / czerwone na mecz | 4,4 / 0,2 |
| Spalone na mecz | 4,0 |
| Karne na mecz | 0,30 (bez VAR: 0,25) |
| Skuteczność karnego w meczu / w serii | 0,77 / 0,72 |
| Dobitka po nieudanym karnym = gol | 0,12 |
| Interwencje VAR zmieniające decyzję na mecz | 0,30 |
| Czas on-field review | 60-120 s |
| Doliczony czas 1. / 2. połowa | formuła A5 (średnio 3 / 6-7) |
| Przewaga gospodarza | +8-12% do siły ataku lub odpowiednik ok. 0,3 gola |
| Przerwy na opatrzenie | 3 na mecz |
| Zmiany wymuszone kontuzją | 0,25 na drużynę na mecz |
| Kontuzja z absencją > 7 dni | 0,12 na drużynę na mecz |
| Surowość sędziego | N(1,0; 0,13) w przedziale 0,70-1,40 |
| Szansa anulowania czerwonej po proteście | 0,04 |
| Kara za SFP | 2 mecze (60%), 3 mecze (30%), 1 mecz (10%) |
| Kara za gwałtowne zachowanie | 3 mecze (50%), 4 (30%), 5+ (20%) |
| Gra w 10 przez 30+ min | ok. -20-25% oczekiwanych goli, +15-20% straconych |

## C3. Typowe pułapki gier managerskich (czego nie robić)

1. **Liczenie przerwy jako okna zmian** albo odwrotnie: zmiana w przerwie nie zużywająca limitu 5. Limit i okna to dwa osobne liczniki.
2. **Brak +1 zmiany i +1 okna w dogrywce** lub nieprzenoszenie niewykorzystanych.
3. **Wpuszczanie z powrotem zmienionego zawodnika** (np. po kontuzji zmiennika, gdy limit wyczerpany).
4. **Zastępowanie wykluczonego zawodnika** (UI pozwala na "zmianę" gracza z czerwoną).
5. **Rezerwowy wchodzący, gdy limit wyczerpany, bo ktoś odniósł kontuzję**: przepisy nie przewidują zmiany awaryjnej (poza opcjonalnym concussion).
6. **Seria karnych z udziałem rezerwowych** lub zmienionych zawodników; brak wyrównania liczebności; ten sam zawodnik strzelający dwa razy, zanim strzelą wszyscy.
7. **Kolejność ABBA** w serii albo niekończenie serii, gdy jest matematycznie rozstrzygnięta.
8. **Liczenie goli z serii karnych** do wyniku, do klasyfikacji strzelców lub do statystyk.
9. **Bramki na wyjeździe** jako tie-breaker w dwumeczach UEFA (zniesione od 2021/22).
10. **Spadek z fazy ligowej LM do LE** (zniesiony od 2024/25) lub stary format grupowy (32 drużyny, 6 meczów).
11. **Zerowanie kartek w przerwie zimowej** w lidze; albo **wspólny licznik** kartek ligowych i pucharowych.
12. **Pauza za kartki z ligi wykonywana w pucharze** (lub odwrotnie).
13. **Stary próg UEFA (3 żółte) w fazie ligowej 2026/27**: od 2026/27 próg wynosi 4, w eliminacjach nadal 3.
14. **Brak pauzy w kolejnych rozgrywkach UEFA**: zawieszenie z eliminacji LM przenosi się na mecz LE/LK.
15. **Mecz trwający dalej przy 6 zawodnikach**.
16. **Bramkarz z kontuzją, który nie schodzi**, albo drużyna bez bramkarza na boisku.
17. **Kontuzjowany wraca od razu po opatrzeniu** (od 2026/27 min. 1 minuta poza boiskiem, z wyjątkami).
18. **Doliczony czas stały** (np. zawsze 2 i 3 minuty) lub niezależny od zdarzeń; od 2023 realne doliczenia są znacznie dłuższe.
19. **Rzut karny bez możliwości dobitki** w meczu, albo z dobitką w serii po dogrywce.
20. **Druga żółta bez automatycznej czerwonej** lub czerwona z zawieszeniem dłuższym niż 1 mecz automatycznie za drugą żółtą.
21. **DOGSO w polu karnym zawsze karane czerwoną**: przy próbie gry piłką jest żółta (potrójna kara).
22. **VAR korygujący zwykłe żółte kartki, faule w środku pola, wrzuty**: VAR nie ingeruje poza swoimi kategoriami (2026/27: plus druga żółta i oczywiście błędne rożne).
23. **VAR w 1L i 2L**: w Polsce co do zasady go tam nie ma.
24. **Gospodarz w Pucharze Polski losowany zawsze**: gospodarzem jest drużyna z niższej ligi.
25. **Mecz Pucharu Polski rozstrzygany dwumeczem** (jest jednomeczowy).
26. **Limit obcokrajowców w Ekstraklasie** (brak limitu) albo brak limitu w 1L/2L (jest: maks. 2 spoza UE na boisku).
27. **Obowiązek młodzieżowca w Ekstraklasie** (zniesiony; tylko nagrody finansowe).
28. **Transfery poza oknem** zawodników z kontraktem.
29. **Rozstrzyganie remisu w tabeli Ekstraklasy różnicą bramek ogółem** zamiast meczów bezpośrednich (do weryfikacji, ale polska praktyka to najpierw mecze bezpośrednie).
30. **Kalendarz bez przerwy zimowej** lub z ligą grającą w grudniu i styczniu tak samo jak w październiku.

---

## 11. Proponowany plik konfiguracyjny (fragment)

```json
{
  "ekstraklasa": {
    "teams": 18, "rounds": 34,
    "start": "2026-07-24", "autumnEnd": "2026-12-14", "springStart": "2027-01-29", "end": "2027-05-22",
    "relegationDirect": 3, "playoffs": null,
    "maxSubs": 5, "subWindows": 3, "benchSize": 12,
    "var": true, "concussionSubs": false,
    "youthRule": { "minOnPitch": 0, "bornFrom": 2006, "rewardProgram": true },
    "nonEuMaxOnPitch": null,
    "yellowSuspension": [{ "at": 4, "games": 1 }, { "at": 8, "games": 1 }, { "at": 12, "games": 2 }, { "every": 4, "after": 12, "games": 2 }],
    "tieBreak": ["points", "h2hPoints", "h2hGoalDiff", "goalDiff", "goalsFor", "wins", "fairPlay", "lots"]
  },
  "liga1": {
    "teams": 18, "rounds": 34, "start": "2026-07-24",
    "promotionDirect": 2, "promotionPlayoff": { "places": [3, 6], "pairs": [[3, 6], [4, 5]], "singleLeg": true, "host": "higherPlace", "semis": "2027-06-03", "final": "2027-06-06" },
    "relegationDirect": 3,
    "maxSubs": 5, "subWindows": 3, "benchSize": 9, "var": false,
    "youthRule": { "minOnPitch": 1, "bornFrom": 2006 },
    "nonEuMaxOnPitch": 2
  },
  "liga2": {
    "teams": 18, "rounds": 34, "start": "2026-07-24", "end": "2027-05-29",
    "promotionDirect": 2, "promotionPlayoff": { "places": [3, 6], "pairs": [[3, 6], [4, 5]], "singleLeg": true, "host": "higherPlace" },
    "relegationDirect": 4, "relegationPlayoff": { "places": [13, 14], "enabled": false },
    "maxSubs": 5, "subWindows": 3, "benchSize": 9, "var": false,
    "youthRule": { "minOnPitch": 2, "bornFrom": 2006 },
    "nonEuMaxOnPitch": 2
  },
  "pucharPolski": {
    "singleLeg": true, "host": "lowerDivision", "extraTime": true, "penalties": true,
    "rounds": { "R64": "2026-09-02", "R32": "2026-10-28", "R16": "2026-12-02", "QF": "2027-03-03", "SF": "2027-04-07", "F": "2027-05-02" },
    "europeanClubsEnterAt": "R32"
  },
  "uefa": {
    "benchSize": 12, "listA": 25, "homegrownMin": 8,
    "yellowSuspension": { "qualifying": { "first": 3, "thenEvery": 2 }, "main": { "first": 4, "thenEvery": 2 }, "wipeAfter": ["playoffRound", "quarterFinal"] },
    "awayGoals": false
  },
  "transferWindows": [
    { "from": "2026-07-01", "to": "2026-09-01" },
    { "from": "2027-02-01", "to": "2027-02-26" }
  ]
}
```

---

## 12. Lista rzeczy niepewnych (do weryfikacji w regulaminach PZPN / Ekstraklasa SA / UEFA)

1. Liczba rezerwowych w protokole: Ekstraklasa (12 czy 9), 1L, 2L.
2. Progi kumulacji żółtych kartek w Polsce po 12. kartce i czy 8. kartka to 1 mecz (dane historyczne).
3. Długości kar za czerwone (DOGSO 1 mecz, inne min. 2): źródło z czasów T-Mobile Ekstraklasy.
4. Czy przepis o młodzieżowcu w 1L (1) i 2L (2) obowiązuje w 2026/27 i dla jakiego rocznika.
5. Limit spoza UE w 1L/2L na 2026/27 (2025/26: maks. 2 na boisku).
6. Liczba spadkowiczów z 1L (3) oraz format baraży o utrzymanie w 2L (miejsca 13-14).
7. Tie-breakery w tabeli Ekstraklasy (mecze bezpośrednie przed bilansem ogólnym).
8. VAR w 1L/2L (prawdopodobnie brak) i zakres nowych uprawnień VAR w Ekstraklasie (druga żółta, rożne).
9. Daty okien transferowych w Polsce (lato 2026, zima 2027).
10. Daty rundy wstępnej i I rundy Pucharu Polski (Aug 5 vs Aug 6 losowanie; 27 par I rundy).
11. Druga kolejka LM (Sep 29-30 czy Oct 13-14), finał LE (Frankfurt, May 26, 2027) i finał LK (Stambuł, Jun 2, 2027).
12. Runda wejścia polskich klubów w 2027/28 (nowy cykl listy dostępu UEFA).
13. Statystyki Ekstraklasy poza golami, kartkami i rożnymi (strzały, faule, spalone, karne): szacunki.
14. Mechanika nowych przepisów IFAB 2026/27 (10 s na zejście przy zmianie, 1 min poza boiskiem po opatrzeniu, ewentualne 5-sekundowe odliczanie przy wrzutach i wykopach): pewne co do istnienia, szczegóły do odczytania z dokumentu IFAB.
15. Stosowanie zmian "concussion" w Ekstraklasie i UEFA (założenie: nie).

---

## 13. Źródła

### IFAB, przepisy gry 2026/27
- [IFAB: Law changes 26/27](https://theifab.com/law-changes/latest/)
- [IFAB: Changes to the Laws of the Game 2026/27 (PDF)](https://downloads.theifab.com/downloads/changes-to-the-laws-of-the-game-202627?l=en)
- [IFAB: Circular 32](https://downloads.theifab.com/downloads/circular-32?l=en), [Circular 34](https://downloads.theifab.com/downloads/circular-34?l=en)
- [IFAB: further measures to improve match flow](https://www.theifab.com/news/the-ifab-introduces-further-measures-to-improve-match-flow-and-player-behaviour)
- [Irish FA: key IFAB law changes 2026/27](https://www.irishfa.com/news/2026/july/referees-reminded-of-key-ifab-law-changes-for-the-202627-season)
- [Concacaf: implementation of IFAB 2026/27 amendments](https://www.concacaf.com/news/concacaf-confirms-implementation-of-the-ifab-2026-27-laws-of-the-game-amendments)
- [Baltic Football News: new laws in Latvia](https://balticfootballnews.com/?p=27986)
- [Bundesliga: rule changes 2026/27, VAR](https://bundesliga.com/en/bundesliga/news/rule-changes-2026-27-season-var-38058)
- [UEFA: European football aligns on refereeing matters 2026/27](https://www.uefa.com/news-media/news/02a7-2135f8a7851f-c93c3439abcf-1000--european-football-aligns-on-refereeing-matters-ahead-of-202627-season/)
- [meczyki.pl: rewolucja w sędziowaniu na mundialu, potem w Ekstraklasie](https://www.meczyki.pl/newsy/plus/rewolucja-w-sedziowaniu-na-mundialu-a-potem-w-ekstraklasie-kibice-sie-zdziwia/304435)
- [antyweb.pl: centralny VAR w Ekstraklasie](https://antyweb.pl/ekstraklasa-stawia-na-nowoczesnosc-wielkie-ulatwienie-dla-sedziow-od-przyszlego-sezonu)
- [spidersweb.pl: Orange, system VAR dla PZPN 2026/27](https://spidersweb.pl/2026/07/orange-system-var-dla-pzpn-ekstraklasa-2026-2027.html)

### UEFA
- [UEFA: kartki w LM/LE/LK](https://www.uefa.com/uefachampionsleague/news/0295-1cd661bbe9cd-ded5a1c8b04d-1000--champions-league-europa-league-conference-league-yellow/)
- [Inside World Football: UEFA rule changes on bookings and timekeeping (Aug 6, 2026)](https://www.insideworldfootball.com/2026/08/06/uefa-confirms-rule-changes-on-bookings-and-timekeeping-in-champions-league/)
- [Sports Mole: UCL suspensions 2026/27](https://www.sportsmole.co.uk/football/aek-athens/champions-league/feature/how-do-ucl-suspensions-work-yellow-card-rule-changes-explained-for-2026-27_604615.html)
- [UEFA: Champions League qualifying fixtures and dates](https://www.uefa.com/uefachampionsleague/news/02a6-20e5a8be4e63-ae971c582f8c-1000--champions-league-qualifying-fixtures-dates-how-it-works/)
- [UEFA: 2026/27 Champions League teams, dates, final](https://uefa.com/uefachampionsleague/news/02a6-20d57cfcd03e-407c22a7f465-1000--2026-27-champions-league-teams-dates-draws-format-final/)
- [Flashscore: Champions League 2026/27 key dates](https://www.flashscore.com/news/football-champions-league-champions-league-2026-27-key-dates-draws-full-schedule-and-more/AkEpUhZi/)
- [Groundhopper Guides: 2026/27 UCL schedule](https://groundhopperguides.com/2026-27-champions-league-schedule/)
- [UEFA: 2026/27 Europa League teams, dates, final](https://uefa.com/uefaeuropaleague/news/02a6-20d57d095740-e1e0b3de85df-1000--2026-27-europa-league-teams-dates-draws-format-final/)
- [UEFA: 2026/27 Europa League league phase fixtures](https://www.uefa.com/uefaeuropaleague/news/02a8-2174cafa5bb6-82bbc20c9b92-1000--2026-27-europa-league-all-the-league-phase-fixtures/)
- [Groundhopper Guides: 2026/27 UEL schedule](https://groundhopperguides.com/2026-27-europa-league-schedule/)
- [UEFA: 2026/27 Conference League teams, dates, final](https://uefa.com/uefaconferenceleague/news/02a6-20d57d15f093-a90cf54c928f-1000--2026-27-conference-league-teams-dates-draws-format-final/)
- [UEFA: Conference League qualifying dates](https://www.uefa.com/uefaconferenceleague/news/02a6-20e5e911587f-cc10425958b3-1000--conference-league-qualifying-fixtures-results-dates-how-it-works/)

### Ekstraklasa, 1L, 2L, PZPN
- [Wisła Kraków: ramowy terminarz Ekstraklasy 2026/27](https://shop.wislakrakow.com/en/blogs/news/znamy-ramowy-terminarz-ekstraklasy-na-sezon-2026-2027)
- [meczyki.pl: terminarz PKO BP Ekstraklasy](https://www.meczyki.pl/newsy/pilka-nozna/znamy-terminarz-pko-bp-ekstraklasy-ciekawe-starcia-juz-w-pierwszej-kolejce/304600)
- [eska.pl: pełny terminarz Ekstraklasy 2026/27](https://www.eska.pl/news/sport/znamy-pelny-terminarz-ekstraklasy-na-sezon-202627-wielkie-hity-i-historyczny-jubileusz-aa-YCKn-DrVa-1PDt.html)
- [Górnik Zabrze: frame schedule 2026/27](https://www.gornikzabrze.pl/en/news/events/frame-schedule-pko-bank-polski-ekstraklasa-202627-season)
- [Ekstraklasa.org: Wieczysta trzecim beniaminkiem](https://ekstraklasa.org/en/news/wieczysta-krakow-the-third-newcomer-in-the-20262027-season/)
- [Wikipedia: 2026-27 Ekstraklasa](https://en.wikipedia.org/wiki/2026%E2%80%9327_Ekstraklasa), [2026-27 I liga](https://en.wikipedia.org/wiki/2026%E2%80%9327_I_liga), [2026-27 II liga](https://en.wikipedia.org/wiki/2026%E2%80%9327_II_liga)
- [PZPN: terminarz 1L + PP 2026/27 (PDF)](https://www.pzpn.pl/public/system/files/articles/13659/7297-Terminarz%20rozgrywek%20%20-%20sezon%202026%20-%202027%20B1L+PP.pdf), [terminarz 2L (PDF)](https://www.pzpn.pl/public/system/files/articles/13659/7298-Terminarz%20rozgrywek%20%20-%20sezon%202026%20-%202027%20B2L.pdf)
- [PZPN: Regulamin 1., 2. i 3. Ligi 2025/26 (PDF)](https://pzpn.pl/public/system/files/site_content/635/6576-Regulamin%201.%20Ligi%202.%20Ligi%20i%203.%20Ligi%20na%20sezon%202025-2026.pdf)
- [PZPN: Regulamin Pucharu Polski 2025/26 (PDF)](https://pzpn.pl/public/system/files/site_content/635/6577-Regulamin%20Pucharu%20Polski%202025-2026.pdf)
- [PZPN: uchwała Młodzieżowiec 2.0 (May 19, 2025)](https://cdn.laczynaspilka.pl/cms2/prod/sites/default/files/2025-05/uchwala_mlodziezowiec_19.05.2025.pdf)
- [Soccerway: bez kar za niewypełnienie limitu młodzieżowców](https://pl.soccerway.com/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-bez-kar-za-niewype-nienie-limitu-m-odziezowcow-gra-ma-byc-nagroda-nie-nakazem/Cd59vD7U)
- [Łódzki Sport: rusza PKO BP Ekstraklasa, koniec koszmaru trenerów](https://lodzkisport.pl/rusza-pko-bp-ekstraklasa-koniec-koszmaru-trenerow)
- [RMF24: PZPN chce limitu Polaków](https://www.rmf24.pl/pilka-nozna/news-nowa-reforma-na-horyzoncie-pzpn-chce-wprowadzic-limit-polako,nId,8081501)
- [Sejm, Komisja Kultury Fizycznej i Sportu: limity cudzoziemców](https://api.sejm.gov.pl/sejm/term9/committees/KFS/sittings/79/html)
- [Radio Kraków: kartkowe reguły w T-Mobile Ekstraklasie](https://www.radiokrakow.pl/aktualnosci/sport/kartkowe-reguly-w-tmobile-ekstraklasie)
- [Radio Kielce: kartkowy zawrót głowy (12. kartka, baraże)](https://radiokielce.pl/902370/kartkowy-zawrot-glowy-leszka-ojrzynskiego-158674)
- [Soccerway: Komisja Ligi anulowała czerwoną kartkę](https://pl.soccerway.com/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-komisja-ligi-utrzyma-a-zawieszenie-feio-i-anulowa-a-czerwona-kartke-gurgula/tQI108K5)
- [Lech Poznań: Murawski out for two matches](https://www.lechpoznan.pl/en/news,2,murawski-out-for-two-matches,42340.html)

### Puchar Polski, ranking UEFA, polskie kluby w pucharach
- [Flashscore: losowanie Pucharu Polski 2026/27](https://www.flashscore.pl/wiadomosci/losowanie-puchar-polski-202627/0EBcaxun/?fs_date=30102026)
- [Flashscore: wyniki losowania I rundy PP](https://www.flashscore.pl/wiadomosci/znamy-wyniki-losowania-i-rundy-pucharu-polski-nie-brakuje-ciekawych-par/0EBcaxun/)
- [meczyki.pl: losowanie 1. rundy STS PP](https://www.meczyki.pl/newsy/pilka-nozna/losowanie-1-rundy-sts-pucharu-polski-gdzie-ogladac-transmisja-na-zywo-w-tv-i-stream-online-06-08-2026/309629)
- [RMF24: Puchar Polski jedzie do Zabrza](https://www.rmf24.pl/pilka-nozna/news-puchar-polski-pojedzie-do-zabrza-pierwszy-raz-od-ponad-50-la,nId,8080262)
- [Soccerway: Polska na 15. miejscu, dwa kluby w el. LM](https://pl.soccerway.com/wiadomosci/pi-ka-nozna-liga-konferencji-polska-na-15-miejscu-w-rankingu-uefa-dwa-polskie-kluby-powalcza-o-lige-mistrzow/vmJqKazJ)
- [meczyki.pl: Polska goni w rankingu UEFA](https://www.meczyki.pl/newsy/pilka-nozna/polska-goni-w-rankingu-uefa-liga-mistrzow-bez-eliminacji-to-bardzo-realne/287433)
- [Flashscore: UEFA potwierdza dwa polskie kluby z gwarancją gry 2027/28](https://www.flashscore.pl/wiadomosci/uefa-potwierdza-dwa-polskie-kluby-z-gwarancja-gry-w-europejskich-pucharach-w-sezonie-2027-28/z1NsWTCb/)
- [RMF24: losowanie Lecha i Górnika](https://www.rmf24.pl/pilka-nozna/news-trudne-losowanie-lecha-i-gornika-polskie-kluby-poznaly-rywal,nId,8090712)
- [Football Web Pages: Jagiellonia - Rangers 2026/27](https://www.footballwebpages.co.uk/match/2026-2027/uefa-europa-league/jagiellonia-biaystok/rangers/585773)
- [Polskie Radio: Polish clubs mixed results in European qualifiers](https://polskieradio.pl/395/7790/Artykul/3717393,football-polish-clubs-post-mixed-results-in-european-qualifiers)

### Statystyki
- [meczyki.pl: statystyki żółtych kartek (Ekstraklasa 4,40/mecz w 2023/24)](https://www.meczyki.pl/bukmacherzy/jak-skutecznie-typowac-ilosc-zoltych-kartek/29)
- [Wikipedia mirror: 2025-26 Ekstraklasa (2,88 gola/mecz)](https://wiki.krisyotam.com/content/wikipedia_en_all_nopic_2026-03/2025%E2%80%9326_Ekstraklasa)
- [4score: Ekstraklasa statistics](https://4score.ru/en/leagues/polsha-premer-liga/)
- [meczyki.pl: rzut karny to jeszcze nie gol](https://www.meczyki.pl/newsy/plus/rzut-karny-to-jeszcze-nie-gol-gospodarzom-pomagaja-sciany-burzymy-pilkarskie-mity/115521)
- [The Analyst: ball in play, Premier League 2025/26](https://theanalyst.com/articles/premier-league-ball-in-play-are-we-seeing-less-football-2025-26)
- [Pressat: VAR delays 2025/26](https://pressat.co.uk/releases/premier-league-averages-4m12s-per-var-delay-slowest-in-europe-new-2025-26-data-shows-feb710a83760633c50459c12e5c52bae)
- [Thairath: VAR stoppage time 2025/26](https://en.thairath.co.th/sport/eurofootball/2922882)

---

# D. REZERWY I III LIGA

Dopisane na prośbę koordynatora (Nov 10, 2026). Znaczniki pewności jak w sekcji 0.

## D1. Reguła użytkownika (bezwzględna w grze)

1. Drużyna rezerw (R) nie może grać w tej samej lidze co pierwsza drużyna (P); zawsze co najmniej ligę niżej.
2. Gdy P spada do ligi, w której gra R, to R automatycznie spada ligę niżej.
3. R nie może awansować do ligi P; jej miejsce awansowe przechodzi na następny klub w tabeli.

Numeracja poziomów w kodzie: Ekstraklasa = 1, 1 Liga = 2, 2 Liga = 3, III liga = 4 (niesymulowana, pula), IV liga = 5 (poza grą).

## D2. Co mówi PZPN (stan badania)

| Kwestia | Ustalenia | Pewność |
|---|---|---|
| Najwyższa liga dla rezerw | **2 Liga** (poziom 3). Rezerwy nie mogą grać w Ekstraklasie ani w 1 Lidze, **niezależnie od ligi pierwszej drużyny**. W historii (Lech II, Zagłębie II, Śląsk II, Legia II, Skra, Sandecja...) rezerwy dochodziły maks. do 2 Ligi. | [ZAŁOŻENIE, wysoce prawdopodobne; tekstu uchwały PZPN IX/140 i regulaminu 1/2/3 Ligi nie udało się odczytać] |
| Rezerwy na miejscu awansowym w 2 Lidze | nie awansują; awans przechodzi na następną drużynę w tabeli | [ZAŁOŻENIE] |
| Rezerwy na miejscu barażowym (3-6) w 2 Lidze | nie grają w barażach; do baraży wchodzi kolejna drużyna (np. 7.) | [ZAŁOŻENIE] |
| Spadek P do ligi R lub awans R do ligi P | R jest "automatycznie przenoszona do klasy niższej". Taki zapis jest w przepisach wojewódzkich ZPN (Małopolski, Śląski), które powtarzają zasadę z uchwały PZPN o organizacji rozgrywek. | [ŹRÓDŁO] (fragmenty regulaminów ZPN, urwane) |
| Rezerwy w Pucharze Polski | nie uczestniczą | [ZAŁOŻENIE] |
| Rezerwy w III lidze | normalnie grają (w sezonie 2026/27 m.in. Jagiellonia II, ŁKS II, Widzew II, Lech II, Raków II, Zagłębie II, Miedź II, Wisła II, Korona II, Wieczysta II) | [ŹRÓDŁO] (Wikipedia, 90minut, podkarpacielive) |
| Mistrz grupy III ligi będący rezerwami | awansuje, jeśli P gra co najmniej w 1 Lidze w następnym sezonie (np. Legia II wygrała grupę I w 2025/26 i gra w 2 Lidze 2026/27; Śląsk Wrocław II awansował wcześniej, gdy Śląsk był w 1 Lidze) | [ŹRÓDŁO] |

### Różnica: PZPN jest surowszy niż reguła użytkownika

- Reguła użytkownika pozwala rezerwom wejść do **1 Ligi**, gdy P jest w Ekstraklasie (np. Legia II wygrywa 2 Ligę, a Legia gra w Ekstraklasie, więc wg reguły użytkownika Legia II awansuje).
- PZPN (prawdopodobnie) blokuje to zawsze: **limit 2 Liga dla rezerw**.
- Rekomendacja: parametr `reserveMaxTier = 3` (zgodność z PZPN) jako domyślny; `reserveMaxTier = 2` (lub `null`) tylko jako tryb "luźny". Reguła użytkownika jest wtedy podzbiorem ograniczeń: obie są sprawdzane jednocześnie, a reguła użytkownika nigdy nie jest łamana.

Funkcja dopuszczalności (obie reguły naraz):

```javascript
// nextTierOfParent: liga pierwszej drużyny w PRZYSZŁYM sezonie (już rozstrzygnięta)
function reserveMayPlayIn(tier, nextTierOfParent, cfg) {
  if (tier <= nextTierOfParent) return false;                 // reguła użytkownika
  if (cfg.reserveMaxTier && tier < cfg.reserveMaxTier) return false; // PZPN: nie wyżej niż 2 Liga (3)
  return true;
}
```

## D3. Format awansu z III ligi do 2 Ligi (2026/27)

| Element | Opis | Pewność |
|---|---|---|
| Struktura III ligi | 72 kluby, **4 grupy po 18**, podział terytorialny | [ŹRÓDŁO] |
| Awans bezpośredni | **4 mistrzów grup** | [ŹRÓDŁO] (Wikipedia 2025/26: Legia II, Zawisza Bydgoszcz, Lechia Zielona Góra, Avia Świdnik awansowały) |
| Baraż etap I | **4 wicemistrzów grup**, pary losowane, **jeden mecz** (dogrywka, karne) | [ŹRÓDŁO] (uchwała PZPN Jun 7, 2024, obowiązuje od 2024/25; przykład: Legia II przegrała półfinał po karnych z Podhalem w 2024/25) |
| Baraż etap II | 2 zwycięzców etapu I vs **13. i 14. drużyna 2 Ligi**, **dwumecz** (pary losowane) | [ŹRÓDŁO] (soccerway, uchwała PZPN, terminarz PZPN 2L) |
| Spadek z 2 Ligi | 15-18 bezpośrednio + przegrani etapu II | [ŹRÓDŁO] |
| Liczba awansujących z III ligi | od 4 do 6 (4 + wygrani etapu II) | wynika z formatu |
| Gospodarz etapu I | prawdopodobnie losowany lub ustalony w losowaniu | [ZAŁOŻENIE] |
| Kolejność dwumeczu etapu II | rewanż u drużyny z 2 Ligi | [ZAŁOŻENIE] |
| Spadek z III ligi | ostatnie 4 w każdej grupie do IV ligi | [ŹRÓDŁO] (zależnie od liczby spadkowiczów z 2 Ligi w danej grupie) |

## D4. Algorytm końca sezonu (pseudokod)

Zasada nadrzędna: **przetwarzaj od góry (poziom 1) w dół**, bo dopuszczalność rezerw zależy od przyszłej ligi pierwszej drużyny, a ta jest zawsze na wyższym poziomie i rozstrzyga się wcześniej. **Liczebność lig (18) jest niezmiennikiem.**

```text
WEJŚCIE: tabele końcowe E (poz.1), 1L (poz.2), 2L (poz.3); pula III ligi (poz.4) z 4 grupami
         cfg: N=18, reserveMaxTier=3, quotas:
           T1: relDirect=3
           T2: promDirect=2, promPlayoff=[3..6], relDirect=3
           T3: promDirect=2, promPlayoff=[3..6], relDirect=4, relPlayoff=[13,14]
WYJŚCIE: składy E, 1L, 2L na nowy sezon; lista klubów oddanych do puli III ligi

KROK 0. Dla każdego klubu ustaw nextTier = currentTier (tymczasowo).
        Dla każdej drużyny rezerw R zapamiętaj parent(R).

KROK 1. Ekstraklasa (T1)
  1a. Tabela T1 nie ma rezerw (niedopuszczalne z definicji).
  1b. relegated1 = 3 ostatnie -> nextTier = 2.
  1c. (Awanse do T1 wyznacza krok 2.)

KROK 2. 1 Liga (T2)
  2a. FORCED2 = { R w T2 : !reserveMayPlayIn(2, nextTier(parent(R))) }
      (przy reserveMaxTier=3 wszystkie rezerwy w T2 są FORCED; normalnie T2 nie ma rezerw)
  2b. eligibleUp2 = drużyny T2 bez FORCED2, które mogą grać w T1
      (rezerwy nigdy nie mogą grać w T1, więc odpadają)
  2c. Uszereguj eligibleUp2 wg tabeli: e[1], e[2], ...
      awans bezpośredni: e[1], e[2] -> nextTier = 1
      baraże: e[3] vs e[6], e[4] vs e[5] (jeden mecz u wyżej sklasyfikowanego), finał
             -> zwycięzca nextTier = 1
      UWAGA: miejsce w tabeli do baraży liczone po pominięciu niedopuszczalnych
             (rezerwy na 4. miejscu => do baraży wchodzi 7. drużyna tabeli).
  2d. Spadek z T2: relSlots = 3
      relegated2 = FORCED2 ∪ najniższe max(0, relSlots - |FORCED2|) drużyny z (T2 \ FORCED2 \ awansujący)
      -> nextTier = 3
      Jeśli |FORCED2| > relSlots: wolne miejsca w T2 uzupełnij dodatkowym awansem z T3
      (krok 3c: promDirect3 += |FORCED2| - relSlots).
  2e. Pierwsze drużyny spadające z T1 (krok 1b) mają już nextTier = 2.

KROK 3. 2 Liga (T3)
  3a. FORCED3 = { R w T3 : !reserveMayPlayIn(3, nextTier(parent(R))) }
      (typowo: P spadła z 1L do 2L w kroku 2d, więc R musi do III ligi)
  3b. eligibleUp3 = drużyny T3 bez FORCED3, które mogą grać w T2:
      klub zwykły: zawsze; rezerwy: reserveMayPlayIn(2, nextTier(parent)) (przy cap=3 nigdy)
  3c. awans bezpośredni: e[1], e[2] (+ ewentualne dodatkowe z 2d) -> nextTier = 2
      baraże o 1L: e[3] vs e[6], e[4] vs e[5], finał -> zwycięzca nextTier = 2
  3d. Spadek z T3 (bez III ligi symulowanej szczegółowo):
      pozostali = T3 \ awansujący \ FORCED3
      relDirectSlots = 4
      direct3 = FORCED3 ∪ najniższe max(0, relDirectSlots - |FORCED3|) z pozostałych
      playoff3 = dwie najniżej sklasyfikowane drużyny z (pozostali \ direct3)
                 (normalnie 13. i 14.; przesuwają się w górę, jeśli FORCED3 zajęły miejsca w strefie)
      Jeśli |FORCED3| > relDirectSlots: nadwyżka = dodatkowe miejsca dla III ligi (krok 4).
  3e. direct3 -> nextTier = 4 (do puli III ligi, z przypisaniem grupy wg regionu)

KROK 4. Pula III ligi (T4, niesymulowana)
  4a. Dla każdej grupy g wylosuj kolejność czołówki z wagami siły (D5).
      Pomiń kandydatów niedopuszczalnych: rezerwy R, dla których
      !reserveMayPlayIn(3, nextTier(parent(R)))  (np. P zostaje w 2L lub spadła do 2L).
      Następny dopuszczalny klub w grupie przejmuje miejsce.
  4b. champion[g] = pierwszy dopuszczalny -> nextTier = 3      (4 kluby)
      runnerUp[g] = drugi dopuszczalny                          (4 kluby)
  4c. Etap I: losuj pary z 4 runnerUp, jeden mecz (dogrywka, karne) -> 2 zwycięzców
  4d. Etap II: losuj pary zwycięzców z playoff3 (13./14. z 2L), dwumecz
      -> wygrany z III ligi: nextTier = 3, przegrany z 2L: nextTier = 4
      -> wygrany z 2L: zostaje (nextTier = 3)
  4e. Dodatkowe wolne miejsca w T3 (z 2d/3d) -> kolejni najlepsi dopuszczalni
      (przegrani etapu I lub II, potem 3. miejsca grup wg losowanej siły).
  4f. Rezerwy w puli III ligi, których P spada do III ligi (nextTier(parent) = 4)
      -> R do IV ligi (usuń z puli, dezaktywuj albo przenieś do "IV liga" bez symulacji).

KROK 5. Walidacja niezmienników (asercje, przerwij sezon przy błędzie)
  - |E| = |1L| = |2L| = 18
  - brak klubu w dwóch ligach
  - dla każdej R: tier(R) > tier(parent(R))  oraz  tier(R) >= reserveMaxTier
  - brak rezerw w Ekstraklasie i w 1 Lidze (przy cap=3)
  - żadna drużyna nie awansowała ani nie spadła o więcej niż 1 poziom
    (także R przeniesiona administracyjnie spada tylko o 1 poziom; jeśli to nie
     przywraca warunku tier(R) > tier(parent(R)), to błąd danych wejściowych)

KROK 6. Zapisz historię: kto awansował "z miejsca rezerw" (dla UI: "awans dzięki rezerwom X").
```

Uwagi do pseudokodu:
- **Kolejność baraży**: rozegraj baraże o 1L (krok 3c) **przed** krokiem 4, bo od nich zależy, czy pierwsza drużyna rezerw z III ligi gra w 1L czy 2L.
- **Forced a strefa spadkowa**: przyjąłem, że przeniesienie administracyjne rezerw zastępuje jeden ze sportowych spadków (liga zachowuje 18 drużyn bez dodatkowych awansów). [ZAŁOŻENIE; PZPN może zamiast tego uzupełniać ligę z niższej klasy, do weryfikacji]

## D5. Przykłady i przypadki brzegowe

| # | Sytuacja | Wynik (cap = 3 i reguła użytkownika) |
|---|---|---|
| 1 | Legia II kończy 2L na **1. miejscu**, Legia w Ekstraklasie | Legia II zostaje w 2L. Awans bezpośredni: 2. i 3. drużyna tabeli; baraże: 4., 5., 6., 7. (pary e3-e6: 4 vs 7, 5 vs 6). Przy trybie bez capu (reguła użytkownika sama) Legia II awansowałaby do 1L. |
| 2 | Śląsk II na **4. miejscu** (barażowym) w 2L | Śląsk II nie gra baraży. Baraże: 3., 5., 6., 7. miejsce tabeli (jako e3..e6: 3 vs 7, 5 vs 6). |
| 3 | Śląsk **spada z Ekstraklasy** do 1L, Śląsk II **wygrywa 2L** | Śląsk II zostaje w 2L (nie może do ligi Śląska; nadal o 1 niżej, więc nie spada). Awans przechodzi na następne drużyny jak w #1. |
| 4 | Klub X spada **z 1L do 2L**, a X II gra w 2L (np. na 8. miejscu) | X II przeniesiona do III ligi. Sportowo spadają bezpośrednio tylko 3 najsłabsze (16-18); baraż o utrzymanie grają 14. i 15. (dwie najniższe drużyny nad strefą po pominięciu X II); 13. jest bezpieczna. |
| 5 | Jak #4, ale X II kończy 2L na **17. miejscu** | X II i tak spada (forced zawiera się w strefie). Spadają: X II + 3 najsłabsze z pozostałych (15., 16., 18.). Baraż o utrzymanie bez zmian: 13. i 14. |
| 6 | Jak #4, ale X II kończy na **1. miejscu** | X II do III ligi (nie awans!). Awans: 2. i 3.; baraże o 1L: 4-7. Spadek bezpośredni: 16-18; baraż o utrzymanie: 14. i 15. |
| 7 | Klub Y w **2L**, jego rezerwy Y II **wygrywają grupę III ligi** | Y II nie awansuje (2L = liga Y). Mistrzem awansującym jest 2. drużyna grupy, a do baraży etapu I idzie 3. drużyna grupy. |
| 8 | Jak #7, ale Y **awansuje z 2L do 1L** (bezpośrednio lub przez baraże) | Y II **awansuje** do 2L (poziom 3 > poziom 2, cap spełniony). Dlatego baraże o 1L muszą być rozstrzygnięte przed pulą III ligi. |
| 9 | Klub Z **spada z 2L do III ligi**, Z II gra w III lidze | Z II spada do IV ligi (wypada z gry/puli). |
| 10 | Klub W w **2L na 13. miejscu** (baraż o utrzymanie), W II w III lidze na 1. miejscu | Najpierw rozegraj etap I, potem etap II z W. Gdyby W II wygrał grupę: jeśli W się utrzyma w 2L, W II nie awansuje (miejsce dla 2. drużyny grupy); jeśli W przegra baraż i spadnie do III ligi, W II spada do IV ligi. Kolejność obliczeń: etap II z udziałem W **przed** ostatecznym wyborem mistrza grupy W II. W praktyce: dla grupy W II wylosuj czołówkę, wybierz mistrza **warunkowo** (W II niedopuszczalna w każdym scenariuszu, bo W będzie w 2L albo w III lidze), więc W II po prostu pomijana. |
| 11 | Dwie drużyny rezerw z tej samej grupy na miejscach 1-2 | Obie pominięte (jeśli niedopuszczalne); mistrz = 3. drużyna, wicemistrz = 4. |
| 12 | Liczba FORCED w 2L większa niż 4 (teoretycznie) | Dodatkowe wolne miejsca w 2L uzupełniają kolejni dopuszczalni z III ligi (przegrani baraży, potem 3. miejsca grup). |
| 13 | Rezerwy w 1L (tylko tryb bez capu) i P spada z Ekstraklasy | R przeniesione do 2L; jedna drużyna mniej spada sportowo z 1L. |
| 14 | P awansuje do Ekstraklasy, R w 2L wygrywa ligę (tryb bez capu) | R może awansować do 1L (1L < E). Z capem: nie. |

## D6. Pula klubów III ligi 2026/27 (do generowania awansów)

Źródła list: pl.wikipedia (strony grup 2026/27), podkarpacielive.pl (tabele po ok. 14-15 kolejkach), 90minut.pl, en.wikipedia "2026-27 III liga". Listy częściowo niespójne między źródłami; kolejność w tabeli z połowy listopada 2026 jest orientacyjna. **(R)** = drużyna rezerw; w nawiasie pierwsza drużyna, którą trzeba sprawdzić w bazie gry.

Wagi siły (1-5) to moja propozycja do losowania czołówki: 5 = lider lub kandydat do awansu w 2026/27 wg tabel, 3 = środek, 2 = słabszy. [SZACUNEK]

### Grupa I (Mazowsze, Podlasie, Warmia-Mazury, Łódzkie)

| Klub | Waga | Uwagi | Pewność obecności w grupie |
|---|---|---|---|
| Ząbkovia Ząbki | 5 | lider grupy po 9 kolejkach (22 pkt) | [ŹRÓDŁO] |
| Olimpia Elbląg | 4 | były uczestnik 2L | [ŹRÓDŁO] |
| Wigry Suwałki | 4 | były uczestnik 1L/2L | [ŹRÓDŁO] |
| Świt Nowy Dwór Mazowiecki | 3 | | [ŹRÓDŁO] |
| Olimpia Zambrów | 3 | | [ŹRÓDŁO] |
| Warta Sieradz | 3 | | [ŹRÓDŁO] |
| Jagiellonia II Białystok **(R)** | 3 | P: Jagiellonia (Ekstraklasa) | [ŹRÓDŁO] |
| Widzew II Łódź **(R)** | 3 | P: Widzew (Ekstraklasa) | [ŹRÓDŁO] |
| ŁKS II Łódź **(R)** | 3 | spadek z 2L 2025/26; P: ŁKS (sprawdź poziom) | [ŹRÓDŁO] |

### Grupa II (Wielkopolska, Pomorze, Zachodniopomorskie, Kujawsko-Pomorskie)

| Klub | Waga | Uwagi | Pewność |
|---|---|---|---|
| Polonia Środa Wielkopolska | 5 | 1. miejsce po 14 kolejkach | [ŹRÓDŁO] |
| Wikęd Luzino | 4 | 2. miejsce | [ŹRÓDŁO] |
| Wda Świecie | 4 | czołówka | [ŹRÓDŁO] |
| Błękitni Stargard | 4 | były uczestnik 2L | [ŹRÓDŁO] |
| Kluczevia Stargard | 3 | | [ŹRÓDŁO] |
| Lech II Poznań **(R)** | 4 | czołówka; P: Lech (Ekstraklasa) | [ŹRÓDŁO] |
| KKS 1925 Kalisz | 3 | spadek z 2L 2025/26 | [ŹRÓDŁO] |
| Elana Toruń | 3 | | [ŹRÓDŁO] |
| Bałtyk Koszalin | 2 | | [ŹRÓDŁO] |
| Gedania Gdańsk | 2 | | [ŹRÓDŁO] |

Pozostali w grupie (tło): Noteć Czarnków, Unia Swarzędz, Grom Nowy Staw, Flota Świnoujście, Chemik Bydgoszcz, Victoria Września, Lipno Stęszew, Kotwica Kórnik.

### Grupa III (Dolny Śląsk, Śląsk, Opolskie, Lubuskie)

| Klub | Waga | Uwagi | Pewność |
|---|---|---|---|
| Zagłębie Sosnowiec | 5 | 1. miejsce po 14 kolejkach (31 pkt), spadek z 2L 2025/26 | [ŹRÓDŁO] |
| Sparta Katowice | 5 | 2. miejsce (30 pkt) | [ŹRÓDŁO] |
| Ślęza Wrocław | 4 | | [ŹRÓDŁO] |
| ROW Rybnik | 3 | | [ŹRÓDŁO] |
| Górnik Polkowice | 3 | były uczestnik 1L | [ŹRÓDŁO] |
| Polonia Nysa | 3 | | [ŹRÓDŁO] |
| Raków II Częstochowa **(R)** | 3 | P: Raków (Ekstraklasa) | [ŹRÓDŁO] (90minut) |
| Zagłębie II Lubin **(R)** | 3 | P: Zagłębie Lubin (sprawdź poziom) | [ŹRÓDŁO] (90minut) |
| Miedź II Legnica **(R)** | 2 | P: Miedź (sprawdź poziom) | [ŹRÓDŁO] |

Pozostali (tło, część niespójna między źródłami): MKS Kluczbork, Stilon Gorzów Wlkp., Warta Gorzów Wlkp., Karkonosze Jelenia Góra, Carina Gubin, Stal Brzeg, Barycz Sułów, KS Goczałkowice-Zdrój, Odra Bytom Odrzański, Słowianin Wolibórz.

### Grupa IV (Małopolska, Podkarpacie, Lubelskie, Świętokrzyskie)

| Klub | Waga | Uwagi | Pewność |
|---|---|---|---|
| Chełmianka Chełm | 5 | lider po 15 kolejkach | [ŹRÓDŁO] |
| KSZO Ostrowiec Świętokrzyski | 4 | były uczestnik 2L | [ŹRÓDŁO] |
| Siarka Tarnobrzeg | 4 | były uczestnik 2L | [ŹRÓDŁO] |
| Wisłoka Dębica | 3 | | [ŹRÓDŁO] |
| Star Starachowice | 3 | | [ŹRÓDŁO] |
| Wisła II Kraków **(R)** | 3 | P: Wisła Kraków (sprawdź poziom) | [ŹRÓDŁO] |
| Korona II Kielce **(R)** | 3 | P: Korona (Ekstraklasa) | [ŹRÓDŁO] |
| Wieczysta II Kraków **(R)** | 3 | beniaminek z IV ligi; P: Wieczysta (Ekstraklasa) | [ŹRÓDŁO] |
| Hetman Zamość | 2 | beniaminek | [ŹRÓDŁO] |
| Naprzód Jędrzejów | 2 | | [ŹRÓDŁO] |

Pozostali (tło): JKS Jarosław, AKS 1947 Busko-Zdrój, Moravia Morawica.

Razem w puli aktywnej: 38 klubów (9 + 10 + 9 + 10), w tym **11 drużyn rezerw**. Kluby "tło" można dodać jako uzupełnienie, gdy w grupie zabraknie dopuszczalnych kandydatów.

### Zasady utrzymania puli między sezonami

1. Spadkowicze z 2L wchodzą do grupy wg regionu z wagą 4-5 (silni po spadku).
2. Awansujący z III ligi wychodzą z puli; w ich miejsce dodaj klub z listy "tło" lub fikcyjnego beniaminka z IV ligi (waga 2).
3. Co sezon losuj zmianę wag ±1 (forma, finanse), z ograniczeniem 1-5.
4. Każda grupa musi mieć min. 4 dopuszczalnych kandydatów nie będących rezerwami, inaczej uzupełnij fikcyjnymi klubami.

## D7. Rekomendacje implementacyjne (reguły twarde do dopisania w C1)

26. **Rezerwy zawsze co najmniej ligę niżej niż pierwsza drużyna** w KAŻDYM momencie (walidacja po każdej zmianie składu lig).
27. **Rezerwy maks. w 2 Lidze** (`reserveMaxTier = 3`, zgodnie z PZPN; tryb luźny opcjonalny).
28. **Miejsca awansowe i barażowe liczone po pominięciu niedopuszczalnych drużyn** (miejsce przechodzi na następny klub).
29. **Spadek pierwszej drużyny do ligi rezerw = automatyczne przeniesienie rezerw ligę niżej**; liga zachowuje 18 drużyn.
30. **Przetwarzanie końca sezonu od góry do dołu**, baraże o 1L przed wyłonieniem awansujących z III ligi.
31. **Rezerwy nie grają w Pucharze Polski** [ZAŁOŻENIE].
32. Zawodnicy: rekomendacja do gry (uproszczenie, nie przepis zweryfikowany): zawodnik, który zagrał > 45 min w ostatnim meczu pierwszej drużyny, nie może zagrać w rezerwach w ciągu 2 dni [ZAŁOŻENIE].

## D8. Źródła (sekcja D)

- [Soccerway: Reforma awansów i spadków w 2. Lidze](https://pl.soccerway.com/wiadomosci/pi-ka-nozna-ii-liga-koniec-waskiego-gard-a-na-szczeblu-centralnym-reforma-awansow-i-spadkow-w-2-lidze/bJwUMyfM)
- [Soccerway: Rezerwy Legii nie awansowały do 2. Ligi, katastrofa Stomilu](https://pl.soccerway.com/wiadomosci/pi-ka-nozna-betclic-2-liga-rezerwy-legii-nie-awansowa-y-do-2-ligi-a-to-oznacza-katastrofe-stomilu-olsztyn/CQbIxx2E)
- [PZPN: Uchwała IX/140 Organizacja rozgrywek w piłkę nożną (PDF)](https://www.PZPN.pl/public/system/files/site_content/635/4800-1786-Uchwała%20nr%20IX-140%20Organizacja%20rozgrywek%20w%20piłkę%20nożną.pdf)
- [PZPN: Regulamin 1., 2. i 3. Ligi 2025/26 (PDF)](https://pzpn.pl/public/system/files/site_content/635/6576-Regulamin%201.%20Ligi%202.%20Ligi%20i%203.%20Ligi%20na%20sezon%202025-2026.pdf)
- [PZPN: Terminarz 3. Ligi 2026/27 (PDF)](https://pzpn.pl/public/system/files/articles/13659/7299-Terminarz%20rozgrywek%20%20-%20sezon%202026%20-%202027%20B3L.pdf)
- [Małopolski ZPN: organizacja rozgrywek (zapis o rezerwach)](https://alt.mzpnkrakow.pl/media/files/regulaminy/organiz_rozgr_2020.pdf)
- [Wikipedia: 2025-26 III liga](https://en.wikipedia.org/wiki/2025%E2%80%9326_III_liga), [III liga](https://en.wikipedia.org/wiki/III_liga), [2026-27 II liga](https://en.wikipedia.org/wiki/2026%E2%80%9327_II_liga)
- [pl.wikipedia: III liga 2026/2027, Grupa I](https://pl.wikipedia.org/wiki/III_liga_polska_w_pi%C5%82ce_no%C5%BCnej_(2026/2027)/Grupa_I), [Grupa II](https://pl.wikipedia.org/wiki/III_liga_polska_w_pi%C5%82ce_no%C5%BCnej_(2026/2027)/Grupa_II), [Grupa III](https://pl.wikipedia.org/wiki/III_liga_polska_w_pi%C5%82ce_no%C5%BCnej_(2026/2027)/Grupa_III), [sezon 2026/2027](https://pl.wikipedia.org/wiki/III_liga_polska_w_pi%C5%82ce_no%C5%BCnej_(2026/2027))
- [Podkarpacie Live: tabela III liga gr. II](https://www.podkarpacielive.pl/statystyki/iii-liga-gr-ii), [gr. III](https://www.podkarpacielive.pl/statystyki/iii-liga-gr-iii), [gr. IV](https://www.podkarpacielive.pl/statystyki/iii-liga-gr-iv)
- [Pomorski Futbol: III liga gr. II 2026/27](https://www.pomorskifutbol.pl/liga.php?id=4648)
- [90minut.pl: Betclic III liga 2026/2027, gr. III](http://www.90minut.pl/liga/1/liga14744.html)
- [igol.pl: Raków Częstochowa II](https://igol.pl/rakow-czestochowa-ii/)
- [livesoccertv / starting11: Ząbkovia Ząbki 2026/27](https://starting11.com/zabkovia-zabki/fixtures)
