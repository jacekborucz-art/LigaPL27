# Limit kadry i nacisk zarządu

Stan: Nov 11, 2026. Dotyczy `src/career/squadLimit.js` (liczenie, progi, nietykalni, kolejka zarządu), `src/career/squadLimitSystem.js` (system dnia `squadLimit`, decyzja w poczcie, działania zarządu, kluby AI), blokad w `src/career/transfers.js` i `src/ui/transfersView.js`, panelu „Limit kadry” w Transferach i ostrzeżenia na Pulpicie (`dashSquad` w `src/app.js`). Testy: `tests/squadLimit.test.mjs`.

Prośba gracza: ograniczyć liczbę zawodników, których można kupić, żeby kadra nie urosła do dużej liczby. Przy zbyt dużej kadrze zarząd naciska na sprzedaż, a jeśli trener nic nie zrobi w ciągu 2 tygodni, zarząd sam wystawia zawodników na listę albo zwalnia najsłabszych (jeśli są na to finanse), ewentualnie sprzedaje taniej.

Oznaczenia: **[SZAC]** to szacunek albo założenie balansowe. **[NIEPOTW.]** to informacja, której nie udało się potwierdzić w tej sesji (strona pzpn.pl była poza dozwoloną siecią).

## 1. Burza mózgów ekspertów

### 1.1 Fakty z rzeczywistości

| Temat | Co wiemy | Źródło |
|---|---|---|
| Liczbowy limit kadry w Ekstraklasie, 1 i 2 Lidze | Nie znaleziono przepisu, który ogranicza liczbę zawodników zgłoszonych do rozgrywek. Regulaminy PZPN dla 1, 2 i 3 Ligi 2025/26 istnieją, ale nie udało się ich otworzyć. [NIEPOTW.] | https://pzpn.pl/public/system/files/site_content/635/6576-Regulamin%201.%20Ligi%202.%20Ligi%20i%203.%20Ligi%20na%20sezon%202025-2026.pdf |
| Młodzieżowiec | Od 2025/26 obowiązek gry młodzieżowca zastąpił program „Młodzieżowiec 2.0” (Ekstraklasa, 1 Liga, 2 Liga): bez kar, nagrody za minuty polskich młodych zawodników. Szczegółowych progów dla 1 i 2 Ligi nie znaleziono. | https://pl.soccerway.com/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-bez-kar-za-niewype-nienie-limitu-m-odziezowcow-gra-ma-byc-nagroda-nie-nakazem/Cd59vD7U, https://lodzkisport.pl/rusza-pko-bp-ekstraklasa-koniec-koszmaru-trenerow |
| Limit obcokrajowców | Prasa z 2019 r. pisze o zniesieniu limitu obcokrajowców w Ekstraklasie; starszy tekst z 2013 r. opisywał limit zawodników spoza UE. W 2026 r. PZPN dyskutował o obowiązkowej liczbie Polaków w kadrach (projekt, grupa robocza). Stanu na sezon 2026/27 nie potwierdzono. [NIEPOTW.] | https://www.meczyki.pl/newsy/plus/ekstraklasa-2019-2020-zmiany-w-regulaminie-rozgrywek-nowy-sponsor-nowa-szata-graficzna/117853, https://insideworldfootball.com/2013/11/27/polish-football-association-limits-non-eu-players-to-three-per-squad, https://www.flashscore.pl/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-w-pzpn-ma-powstac-zespo-roboczy-ds-reformy-dotyczacej-liczby-polskich-pi-karzy-w-klubach/WjD6hDyQ/ |
| UEFA, lista A i B | Lista A: najwyżej 25 zawodników, w tym 8 miejsc dla wychowanych lokalnie (najwyżej 4 wychowanych w federacji); mniej wychowanków oznacza krótszą listę. Lista B: bez limitu, młodzi zawodnicy związani z klubem co najmniej 2 lata od 15. roku życia (rocznik graniczny zmienia się co sezon). | https://www.uefa.com/uefachampionsleague/news/02a8-216c54c7cf25-c163bc643149-1000--uefa-champions-league-league-phase-player-lists-registration/, https://www.goal.com/en/news/champions-league-squad-rules-number-of-players-homegrown-quota-regulations-explained/blt14eefb4daa8bb717 |
| Wypożyczenia (FIFA) | Od 1 lipca 2024: najwyżej 6 zawodników wypożyczonych z klubu i 6 do klubu naraz (wypożyczenia międzynarodowe), bez zawodników do 21 lat i wychowanków; najwyżej 3 wypożyczenia między tą samą parą klubów. Federacje miały dostosować przepisy krajowe do lipca 2025. | https://inside.fifa.com/organisation/media-releases/fifa-to-introduce-new-loan-regulations, https://www.skysports.com/football/news/11095/12520895/transfer-news-fifa-announces-radical-new-loan-plans-that-will-limit-clubs-to-six-loan-exits-per-season |
| Typowa kadra | Około 25 do 30 zawodników w pierwszej drużynie razem z młodzieżą. [SZAC] | wiedza autora, bez sprawdzenia w tej sesji |

### 1.2 Głosy ekspertów

**Dyrektor sportowy.** Realny limit w Polsce nie wynika z regulaminu ligi, tylko z budżetu płac, z listy UEFA i z tego, że trener daje grać najwyżej 20 do 22 zawodnikom. Nadmiar w praktyce: wypożyczenie młodych, lista transferowa, rezerwy, rozwiązanie za porozumieniem, tańsza sprzedaż w ostatnich dniach okna. Wniosek: dwa progi. Miękki (zarząd oczekuje redukcji) i twardy (zarząd nie podpisze kolejnej umowy). Młodzi wychowankowie nie powinni blokować miejsc, jak na liście B.

**Prawnik klubu.** Kontraktu nie można jednostronnie rozwiązać bez słusznej przyczyny (FIFA RSTP, art. 17: odszkodowanie i ryzyko sankcji). Zostaje rozwiązanie za porozumieniem z odprawą; w grze to już istniejąca opłata `releaseCost` (połowa pozostałej pensji). Sprzedaż i wypożyczenie wymagają zgody zawodnika i klubu kupującego, więc zarząd korzysta z tych samych testów chęci zawodnika i rozmów AI co rynek. Transfer definitywny i wypożyczenie tylko w oknie; poza oknem możliwe jest wyłącznie rozwiązanie kontraktu i podpisanie wolnego zawodnika. Zawodnika nie wolno odsunąć od treningów jako kary (ryzyko sporu), więc gra nie ma „klubu kokosa”. Polskie regulaminy w tej sesji nie zostały sprawdzone; liczby limitu są decyzją projektową, nie odwzorowaniem przepisu. W sprawach prawnych klubu w prawdziwym świecie decyduje dział prawny, ta notatka nie jest poradą prawną.

**Dyrektor finansowy.** Odprawa kosztuje, a sprzedaż przynosi pieniądze, więc w kolejności działań sprzedaż (nawet taniej) idzie przed rozwiązaniem. Odprawę zarząd płaci z budżetu transferowego, żeby trener odczuł skutek własnych zakupów. Rozwiązanie tylko wtedy, gdy klub na nie stać: budżet transferowy i saldo pokrywają odprawę. Każda operacja w księdze (`sales`, `release`).

**Trener.** Nie wolno ruszać kapitana, pierwszej jedenastki ani rdzenia drużyny. Kontuzje: przy kryzysie kadrowym trzeba móc dokupić awaryjnie. Puchary europejskie: więcej meczów, szersza kadra.

**Agent i związek zawodników.** Zawodnik powinien wiedzieć, że jest na liście (spadek morale), ale bez upokorzenia. Wypożyczenie jest dla młodego lepsze niż ławka. Zawodnik może odmówić przejścia; wtedy zarząd szuka innego rozwiązania. Świeżo sprowadzonego zawodnika nie oddaje się po kilku tygodniach.

**Projektant gry.** Gracz nie może tracić kontroli bez ostrzeżenia. Potrzebne: jasna wiadomość z decyzją, odliczanie widoczne na Pulpicie i w Transferach, imienna lista osób, których dotknie zarząd, możliwość osłonięcia kilku zawodników, jednorazowa prośba o czas i opcja „niech zarząd zrobi to teraz”. Kluby AI muszą podlegać tym samym progom, inaczej rynek jest nierówny. Zmiana kolejności z prośby gracza (lista, zwolnienie, tańsza sprzedaż) na listę, wypożyczenie, tańszą sprzedaż i dopiero zwolnienie wynika z głosu finansów: rozwiązanie kosztuje, a sprzedaż przynosi pieniądze. To pytanie zostaje otwarte dla gracza (rozdz. 4).

### 1.3 Ustalenia panelu

1. Progi w grze to decyzja projektowa wzorowana na liście A UEFA i realnych kadrach, nie przepis ligowy.
2. Do limitu liczą się wszyscy zawodnicy pierwszej drużyny, także wypożyczeni do klubu. Nie liczą się wychowankowie do 21 lat, którzy nigdy nie zmienili klubu (jak lista B), akademia ani zawodnicy wypożyczeni z klubu.
3. Miękki limit uruchamia nacisk zarządu; twardy blokuje podpisy (transfer, wypożyczenie do klubu, wolny zawodnik).
4. Zarząd działa po terminie w kolejności: lista transferowa, wypożyczenie młodszych, tańsza sprzedaż, rozwiązanie kontraktu, jeśli stać klub.
5. Nietykalni: kapitan, pierwsza jedenastka, pięciu najlepszych, sprowadzeni w ostatnich 120 dniach, wypożyczeni do klubu, młodzi wychowankowie, do 3 zawodników osłoniętych przez trenera. Pozycja nie może spaść poniżej minimum (3 bramkarzy, 6 obrońców, 6 pomocników, 3 napastników).
6. Kluby AI: te same progi, te same zasady liczenia.

## 2. Zasada w grze (wdrożona)

### 2.1 Progi

| Liga | Limit zarządu (miękki) | Maksimum (twarde) |
|---|---|---|
| Ekstraklasa | 28 | 30 |
| 1 Liga | 27 | 29 |
| 2 Liga | 26 | 28 |

Gra w pucharach UEFA w tym sezonie: oba progi +2. Kryzys kadrowy (za mało zdrowych na mecz według `squadDeficits`, zakres `match`): oba progi +2, dopóki trwa. Wszystkie liczby [SZAC].

### 2.2 Podpisy

- Na maksimum: oferta za zawodnika, wypożyczenie do klubu i rozmowy z wolnym zawodnikiem są zablokowane z komunikatem „Limit kadry: 30/30. Zarząd nie zgodzi się na kolejny transfer…”.
- Podpis, który przekroczy limit zarządu: ostrzeżenie na karcie zawodnika („Zarząd da 14 dni na redukcję”).
- Każdy nowy zawodnik liczy się do limitu, także młody (podpis ustawia `lastMove`).

### 2.3 Nacisk zarządu (klub gracza)

1. Dzień, w którym kadra przekracza limit zarządu: wiadomość „Za duża kadra: X przy limicie Y” z decyzją (zatrzymuje upływ dni): „Zajmę się tym”, „Poproś o 7 dni więcej” (raz, zaufanie -2), „Niech zarząd zdecyduje teraz” (zarząd od razu wypożycza, sprzedaje taniej albo rozwiązuje kontrakty, bez kary zaufania). Termin: 14 dni gry.
2. 3 dni przed terminem: przypomnienie z imienną listą.
3. Redukcja przed terminem: sprawa zamknięta, zaufanie +1.
4. Termin minął, okno otwarte: zarząd wystawia wskazanych na listę transferową za 80 % wartości (morale -1), zaufanie -3, kolejne 7 dni. Oferty klubów AI trafiają do poczty; przyjmuje je trener.
5. Po 7 dniach (albo od razu po terminie poza oknem): dla każdego brakującego miejsca, od najsłabszego: wypożyczenie do końca sezonu (do 23 lat, zdrowy, klub z tej samej lub niższej ligi z miejscem w kadrze i w budżecie płac, płaci całą pensję), potem sprzedaż za 60 % wartości (klub AI z pieniędzmi i miejscem, zgoda zawodnika i rozmowa AI), potem rozwiązanie kontraktu, tylko gdy budżet transferowy i saldo pokrywają odprawę (odprawa z budżetu transferowego). Zaufanie -2 (poza oknem łącznie -5, bo etap listy przepada).
6. Gdy nic się nie udało: zarząd wraca do sprawy za 7 dni (w oknie) albo w dniu otwarcia następnego okna (poza oknem), za każdym razem bez wyniku zaufanie -1.
7. Czerwiec: zarząd nie otwiera nowych spraw i nie działa (kontrakty wygasają 30 czerwca); termin przesuwa się na lipiec.
8. Zmiana klubu (zwolnienie, nowa praca): sprawa poprzedniego klubu przepada, listy wystawione przez zarząd znikają.

Każde działanie: wiadomość w poczcie (kategoria Zarząd), wpis w historii rynku (`board: true`), w księdze `sales` (sprzedaż) albo `release` (odprawa).

### 2.4 Kluby AI

- Na maksimum nie kupują (`aiBuy`), nie składają ofert za zawodników gracza, a przyjęta wcześniej oferta zostaje wycofana, gdy kupiec nie ma miejsca.
- Ponad maksimum: od razu rozwiązanie kontraktu najsłabszego (dotąd: ponad 30 zawodników łącznie).
- Ponad limitem zarządu (sprawdzane w poniedziałki): nadmiar trafia na listę transferową z powodem „Nadmiar w kadrze (limit)”; po 21 dniach (tyle co gracz: 14 + 7) rozwiązanie kontraktu, jeśli klub stać na odprawę. Nietykalni w AI: trzech najlepszych, sprowadzeni w ostatnich 120 dniach, wypożyczeni, młodzi wychowankowie.

### 2.5 Interfejs

- Transfery, zakładki Rynek i Kontrakty: panel „Limit kadry” (liczba, limit, maksimum, pasek, stan sprawy z terminem, lista wskazanych z przyciskiem „Osłoń”, osłonięci, kto się nie liczy).
- Karta własnego zawodnika: informacja, że zarząd go wskaże, i przycisk osłony.
- Pulpit, panel Stan kadry: ostrzeżenie z terminem albo krótka linia „Limit kadry: 21 z 28 (maksimum 30)”.

### 2.6 Zapis gry

Stan w `game.squadLimit = { case, log, ai }`, tworzony leniwie; stare zapisy działają bez migracji.

## 3. Przypadki brzegowe

| Sytuacja | Zachowanie |
|---|---|
| Kryzys kontuzji | Progi +2 na czas kryzysu; po wyleczeniu zwykłe progi i ewentualny nacisk. |
| Koniec sezonu | Czerwiec bez działań; 1 lipca liczenie od nowa (wygasłe kontrakty, emerytury). |
| Wygasające kontrakty | Liczą się do 30 czerwca. |
| Powrót z wypożyczenia | Zawodnik wraca do kadry i liczy się; może uruchomić nacisk po 1 lipca. |
| Awans z akademii | Wychowanek do 21 lat się nie liczy; po skończeniu 22 lat zaczyna się liczyć. |
| Zwolnienie trenera, nowy klub | Sprawa poprzedniego klubu przepada. |
| Kluby AI | Te same progi i liczenie (rozdz. 2.4). |

## 4. Pytania otwarte do gracza

1. Kolejność po terminie: panel ustawił listę, wypożyczenie, tańszą sprzedaż i dopiero rozwiązanie (rozwiązanie kosztuje). Prośba mówiła: lista, zwolnienie, tańsza sprzedaż. Zostawić kolejność panelu?
2. Progi 28/30, 27/29, 26/28 i +2 za puchary: czy kadra ma być ciaśniejsza (na przykład 25 jak lista A)?
3. Czy wychowankowie do 21 lat mają się nie liczyć bez względu na narodowość (tak jak teraz, wzór listy B), czy tylko polscy (wzór „Młodzieżowca 2.0”)?
4. Kary zaufania (-3 lista, -2 działania, -2 prośba o czas, +1 za redukcję przed terminem): wystarczająco odczuwalne?
5. Czy dodać rezerwy (drużyna B) jako miejsce na nadmiar, jak w realnych klubach z rezerwami w niższej lidze?
