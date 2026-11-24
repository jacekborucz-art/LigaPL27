# Spis funkcji gry (LigaPL27)

Stan na Nov 21, 2026, wersja gry v1.23 Beta. Ten plik odpowiada na jedno pytanie: czy dana funkcja już jest w grze.

## Jak korzystać

1. Najpierw ten spis. Znajdź dział (menu gry albo system) i sprawdź, czy funkcja ma pozycję.
2. Jeśli ma, otwórz dokument szczegółowy z pozycji (kolumna „dok.”). Dopiero potem zajrzyj do kodu.
3. Jeśli funkcji nie ma w spisie, sprawdź `docs/dziennik.md` (najnowsze wpisy), `docs/kolejka.md` i `docs/do-zrobienia.md`, a na końcu przeszukaj kod (`src/`).
4. Aktualizacja: każda nowa lub zmieniona funkcja dopisuje albo poprawia swoją pozycję w tym samym commicie, w którym wchodzi do gry. Usunięta funkcja traci pozycję (albo trafia do działu „Nie ma w grze”).

Format pozycji: **Nazwa**: co robi dla gracza; gdzie w grze (ścieżka menu); główny plik kodu; dok. (dokument szczegółowy); wersja, jeśli łatwo ustalić.
Pliki kodu bez ścieżki leżą w `src/` (np. `career/finance.js` to `src/career/finance.js`), dokumenty w `docs/`.
Dokument `PLAN.md` to pierwotna specyfikacja gry, `PRZEKAZANIE.md` zawiera role agentów, decyzje i pułapki.
Wersje: „od vX.YY” oznacza wersję, w której funkcja weszła, gdy dało się to ustalić z historii commitów (starsze funkcje nie mają numeru).

Menu główne gry (boczne na PC, dolne na telefonie): Pulpit, Kadra, Rozgrywki, Poczta, Transfery, Klub, Trening. Menu systemowe (Opcje, Zapis, Wyjście) jest osobno.

---

## 1. Ekran startowy i nowa kariera

- **Intro**: krótka animacja z jupiterami, boiskiem i logo przy pierwszym otwarciu w sesji, pomijana kliknięciem, Enter, Esc albo spacją; Ekran startowy; `ui/menuView.js` (`maybePlayIntro`); dok. PLAN 7.
- **Menu główne z zapisami**: Kontynuuj ostatnią karierę, lista 3 slotów z herbem klubu, trenerem, sezonem i datą gry, przyciski Graj, Eksportuj, Usuń (z potwierdzeniem); Ekran startowy; `ui/menuView.js`, `core/store.js`; dok. PLAN.
- **Nowa kariera w 3 krokach**: trener (imię, nazwisko, wiek, narodowość), wybór klubu, kontrakt; Ekran startowy, Nowa kariera; `ui/menuView.js`, `app.js` (`new`, `pick`, `pickConfirm`); dok. PLAN; od v1.11 start na Pulpicie.
- **Wybór klubu z celem sezonu**: zakładki lig z licznikiem klubów, kolumna „Prawdopodobny cel” (góra tabeli, środek, utrzymanie) w kolorze, bez etykiet siły kadry; Nowa kariera, krok 2; `ui/menuView.js`, `career/board.js` (`seasonGoalFor`); od v1.20 Beta.
- **Import zapisu z pliku**: wczytanie pliku JSON zapisanego wcześniej w Zapis; Ekran startowy, Importuj; `core/store.js`, `app.js` (`import`); od v1.19 Beta działa też na Androidzie (wybór pliku bez filtra typu).
- **Wczytanie datapacku przed grą**: opcjonalny plik z Edytora (kluby, zawodnicy, sztaby, sędziowie, rywale), z którego startuje cała kariera; Nowa kariera, „Wczytaj datapack”; `app.js` (`nc-pack`, `ncPackClear`), `career/editor.js`; dok. `edytor.md`; od v1.17 Beta.
- **Motyw jasny, ciemny, automatyczny**: przełącznik na ekranie startowym i w Opcjach, zapamiętany w przeglądarce; `ui/menuView.js` (`applyTheme`); dok. PLAN 7.
- **Wersja gry**: numer widoczny na ekranie startowym i w Opcjach; `config/version.js`; od v1.11 Beta.

## 2. Pulpit

- **Tablica następnego meczu**: rywal, rozgrywki, data, godzina, forma, przycisk Zagraj mecz; Pulpit; `app.js` (renderHub), `ui/fixturesView.js`; dok. PLAN 7.
- **Dalej (upływ dni)**: przycisk przewijający dni do następnego zdarzenia; zatrzymuje się 2 dni przed meczem, na końcu rundy, na początku okresu przygotowawczego i 3 dni przed ostatnim terminem rezerwacji obozu; Pulpit i nagłówek; `core/gameLoop.js`, `app.js`; dok. PLAN 4.1.
- **Tempo upływu dni**: bez zmian, 1, 2 albo 3 sekundy na dzień, żeby przyciskiem Zatrzymaj zatrzymać grę na wybranej dacie; Opcje; `ui/daySpeed.js`; od v1.13 Beta.
- **Mini tabela ligi i legenda stref**: tabela z podświetleniem klubu gracza i opisem stref pod spodem; Pulpit; `app.js`, `season/standings.js`.
- **Terminarz na Pulpicie**: 3 ostatnie wyniki, kreska „Dziś” i 7 kolejnych meczów, kliknięcie wyniku otwiera raport meczu; Pulpit; `ui/fixturesView.js`; dok. `historia-i-statystyki.md`; od v1.12 Beta.
- **Ten tydzień i lista „Do zrobienia w tym tygodniu”**: sprawy z poczty, terminy (kontrakty, okno, obozy, limit kadry, wypożyczenia), rozmowy i obserwacje sztabu, pasek dni pon-niedz, Odłóż i Przywróć; Pulpit, panel „Ten tydzień” i „Wszystko”; `career/weeklyTodo.js`, `ui/todoView.js`; dok. `do-zrobienia.md`; od v1.11 Beta.
- **Odznaka pilnych spraw na przycisku Pulpit**: liczba spraw pilnych w tym tygodniu; menu główne; `app.js`; dok. `do-zrobienia.md`.
- **Poczta na Pulpicie**: ostatnie wiadomości (na szerokim ekranie do 12) zaraz pod panelem „Ten tydzień”; Pulpit; `app.js`; od v1.11 Beta.
- **Oczekująca decyzja**: pasek „Twoja decyzja” z przyciskiem Otwórz decyzję; Pulpit; `app.js`, `core/decisions.js`.
- **Panele klubu**: zarząd i cel sezonu, finanse, okno transferowe, stan kadry (niedostępni, kończące się kontrakty, pod Rozwiń/Zwiń), ostrzeżenie o limicie kadry; Pulpit; `app.js`; od v1.12 Beta układ bez pustych pól.
- **Pulpit trenera bez klubu**: wakaty, aplikacje, karencja u dawnego klubu, przejście do rynku pracy; Pulpit; `app.js` (unemployedNotice); dok. `kariera-trenera.md`; od v1.19 Beta.

## 3. Kadra

Zakładki: Zawodnicy, Skład i taktyka, Rezerwy, Rozmowy, Raport ogólny.

### 3.1 Zawodnicy

- **Lista kadry**: widoki Przegląd, Atrybuty i forma, Statystyki, filtry pozycji (w tym Akademia), sortowanie, na PC zwarta tabela bez przewijania; Kadra, Zawodnicy; `ui/squadView.js`; dok. PLAN 7; od v1.15 Beta układ zwarty.
- **Znaczniki stanu przy nazwisku**: kolorowe kwadraty (pauza za kartki, kontuzja, powołanie, transfer, prekontrakt, oferty, chęć odejścia i inne); Kadra; `ui/playerTags.js`; dok. `tagi-zawodnika.md`; od v1.16 Beta.
- **Karta zawodnika**: atrybuty w kolumnach, stan, kontrakt, charakter, forma (wykres z 10 meczów), statystyki i historia klubowa, na PC szeroki układ; Kadra, kliknięcie zawodnika; `ui/playerCard.js`, `ui/formChart.js`, `ui/playerStatsView.js`; dok. `historia-i-statystyki.md`. Karta w okienku (Skład i taktyka, mecz, Transfery) pokazuje lepszą nogę jak profil (Nov 24, 2026).
- **Mapa pozycji**: boisko z biegłością zawodnika na każdej pozycji (pozycja główna i dodatkowe); karta zawodnika, Skład i taktyka, mecz; `ui/positionMap.js`, `engine/positions.js`; dok. PLAN 3.2.
- **Menu zawodnika pod prawym przyciskiem**: długie przytrzymanie na telefonie, Shift+F10; skróty do profilu, raportu asystenta, treningu, rozmowy, transferu, instrukcji; wszędzie, gdzie jest zawodnik; w Treningu na całym panelu zawodnika; w Treningu i na Pulpicie „Profil zawodnika” otwiera się w okienku bez zmiany ekranu (od v1.23 Beta); `ui/contextMenu.js`, `ui/playerMenus.js`.
- **Historia morale**: strzałka trendu w składzie (5 stopni), wykres w karcie zawodnika, ostrzeżenia w raportach i Rozmowach; Kadra, Skład i taktyka, karta zawodnika; `career/morale.js`, `ui/formChart.js`; dok. `historia-morale.md`; od v1.19 Beta.
- **Morale zawodnika i drużyny**: wartość 1-20 wpływa na siłę w meczu, zmienia się po meczach, rozmowach, ławce; Kadra; `career/morale.js`; dok. PLAN 4.3.
- **Osobowość i charakter zawodnika**: 11 cech, typ agenta, nastawienie do zejścia niżej; karta zawodnika; `career/personality.js`, `career/mindset.js`; dok. `negocjacje.md`, `transfery.md`.
- **Aklimatyzacja po transferze**: czasowy spadek formy po zmianie klubu, widoczny w profilu; Kadra; `career/acclimatization.js`; dok. `aklimatyzacja.md`.
- **Dynamiczna reputacja**: reputacja zawodników i klubów zmienia się co miesiąc (gra, forma, trofea, puchary), z trendem w profilu i wiadomością o dużych zmianach; karta zawodnika; `career/reputationSystem.js`, `career/reputation.js`; dok. `reputacja.md`.
- **Koniec kariery zawodnika**: zawodnik kończący kontrakt ogłasza decyzję 1 marca (mało gry liczy się z prawdziwych minut), emerytury i listy transferowe AI; Poczta, Kadra; `career/retirement.js`, `career/squad.js`; dok. PLAN 2.5; od v1.21 Beta.
- **Limit kadry i nacisk zarządu**: najwyżej tylu zawodników w pierwszej drużynie, blokada transferów, 14 dni na decyzję, zarząd wskazuje zawodników do usunięcia, osłona zawodnika; Pulpit, Transfery; `career/squadLimit.js`, `career/squadLimitSystem.js`; dok. `limit-kadry.md`.
- **Akademia (awans do pierwszego składu)**: trener przenosi wychowanka do pierwszej drużyny z menu zawodnika albo z profilu; Kadra, filtr Akademia; `career/academy.js`; dok. `infrastruktura.md`.
- **Numery i barwy strojów**: stałe numery w klubie, koszulki w barwach klubu w składzie; Skład i taktyka; `career/shirts.js`.

### 3.2 Skład i taktyka

- **Formacje**: 12 ustawień (m.in. 4-4-2 zwykłe, defensywne, ofensywne i romb, 4-3-3, 4-2-3-1, 3-5-2, 5-4-1); Skład i taktyka; `data/formations.js`; dok. `taktyka-i-urazy.md`.
- **Układanie składu przeciąganiem**: jedenastka i ławka na boisku, po wyborze zawodnika podświetleni zmiennicy (naturalny, da radę, słabo); Skład i taktyka; `ui/tacticsView.js`, `ui/tacticsDrag.js`; dok. PLAN 7.
- **Poproś asystenta**: menu automatycznego składu (najmocniejszy, drugi skład, najmłodsi, najbardziej wypoczęci, najmniej grający), działa tylko z asystentem w sztabie; Skład i taktyka; `engine/lineup.js` (`AUTO_MODES`); od v1.17 Beta.
- **Instrukcje drużyny**: nastawienie (od zamurowania do wszystko do ataku), podania, pressing i inne; Skład i taktyka; `data/instructions.js`; dok. PLAN 3.
- **Ławka rezerwowych**: rozmiar ławki zależny od rozgrywek, rezerwowy bramkarz i pokrycie pozycji, automat dla asystenta i AI; Skład i taktyka; `engine/lineup.js`; dok. `sklad-lawki.md`.
- **Instrukcje indywidualne zawodników**: rola i polecenie dla zawodnika z ukrytą jakością wykonania i konfliktem z planem drużyny, tabela wszystkich zawodników, zmiana w trakcie meczu; Skład i taktyka (przycisk Instrukcje indywidualne), mecz; `engine/match/playerInstr.js`, `ui/playerInstrView.js`, `data/playerInstructions.js`; dok. `instrukcje-indywidualne.md`; od v1.18 Beta.
- **Strzałki ruchu zawodników**: kierunek w ataku rysowany prawym przyciskiem myszy na boisku (też w meczu), skutki w silniku, na PC; Skład i taktyka, Zmiany i taktyka; `ui/tacticsArrows.js`, `ui/arrowsView.js`, `ui/tacticsMoves.js`; dok. `strzalki-ruchu.md`; od v1.19 Beta.
- **Przewidywalność taktyki**: rywale oglądają nasze mecze, stały schemat osłabia drużynę; Skład i taktyka; `training/scouting.js`; dok. `bierna-gra.md`.
- **Błędy i ostrzeżenia składu**: brak bramkarza, gra poza pozycją, pauzy; pod boiskiem; `engine/lineup.js`, `engine/positions.js`; dok. PLAN 3.2; od v1.15 Beta zamiast panelu Siła składu.
- **Analizy meczów (archiwum)**: pełne analizy pomeczowe sztabu; Skład i taktyka, Analizy meczów; `career/postMatchReport.js`, `app.js` (renderMatchAnalysis); dok. `analiza-pomeczowa.md`; od v1.18 Beta.
- **Skład na tablecie**: boisko i szeroka lista w dwóch kolumnach; Skład i taktyka; `ui/tacticsView.js`; od v1.19 Beta.
- **Limit zawodników spoza UE**: (w dokumentach, brak w kodzie jako aktywna reguła; pole `p.eu` jest liczone, limit wyłączony), patrz dział „Nie ma w grze”.

### 3.3 Rezerwy

- **Delegowanie do rezerw i powołania z rezerw**: zasady PZPN (jedna drużyna na weekend, 48 godzin, progi 23+, limity), odpowiedź trenera od razu, wymuszenie przez dyrektora; Kadra, Rezerwy; `career/reserves.js`, `ui/reservesView.js`; dok. `rezerwy.md`; od v1.15 Beta.
- **Kadra rezerw i mecz rezerw**: zakładki Mecz i Kadra rezerw z pełną kadrą, atrybutami i statystykami; Kadra, Rezerwy; `ui/reservesView.js`; od v1.15 Beta.
- **Awaryjni zawodnicy na mecz**: gdy brakuje 11 zawodników z bramkarzem, dochodzą tymczasowi, którzy po meczu znikają; mecz ligowy; `career/reserves.js`; od v1.17 Beta.

### 3.4 Rozmowy

- **Rozmowa indywidualna jako dialog**: temat, podejście, odpowiedź zawodnika według charakteru, raz w tygodniu z każdym; Kadra, Rozmowy; `career/talkDialog.js`, `ui/talksView.js`; dok. `bierna-gra.md`.
- **Zebranie drużyny**: raz w tygodniu, wpływ na morale i autorytet; Kadra, Rozmowy; `career/teamTalks.js`.
- **Rozmowa przez asystenta**: asystent rozmawia ze wszystkimi czekającymi, efekt zależy od jego umiejętności motywowania i losu; Kadra, Rozmowy, „Poproś asystenta”; `career/teamTalks.js`; od v1.17 Beta.
- **Autorytet trenera**: kafel autorytetu; trener, który nie rozmawia, traci wpływ w szatni; Kadra, Rozmowy; `career/authority.js`; dok. `bierna-gra.md`.
- **Uwaga trenera**: zawodnicy, którzy jej potrzebują (wrażliwi, rzadko grający), przypominają się; Kadra, Rozmowy; `career/attention.js`; dok. `bierna-gra.md`.
- **Prośba o transfer i chęć odejścia**: zawodnik zgłasza prośbę po odrzuceniu oferty lub długim braku gry; po odrzuconej ofercie jeden rzut (prosi, rozczarowany ale zostaje, spokojny), pamięć odmów i podwyżek, czas spokoju po nowym kontrakcie, oferta marzeń, „poczekam do lata”, obietnica do końca okna, podwyżka uspokaja tylko z pewną szansą; stan w profilu („Plany”), karcie transferowej i znacznik „?” w Kadrze; Poczta, Rozmowy, Transfery; `career/moveWish.js`, `career/wishMemory.js`; dok. `transfery.md` rozdz. 4; pamięć od v1.23 Beta. Okres aklimatyzacji po zmianie klubu (12-16 miesięcy): bez próśb, chyba że klub złamie obietnicę roli z kontraktu (rozliczana co miesiąc, wiadomości dla gracza); rzadsze oferty za świeżo kupionych (Nov 24, 2026).

### 3.5 Raport ogólny

- **Raport ogólny o drużynie**: co miesiąc (albo na prośbę co 14 dni) asystent i główny analityk oceniają siłę formacji na tle ligi, wyniki, grę i zdrowie, z zaleceniami i przejściem do ekranów; Kadra, Raport ogólny; `career/teamReport.js`, `ui/teamReportView.js`; dok. `raport-druzyny.md`; pamięta 3 ostatnie raporty.
- **Raport asystenta o zawodniku**: ocena wybranego zawodnika na żądanie, dokładność zależna od sztabu; menu zawodnika, Raport asystenta; `career/assistantReport.js`, `ui/assistantReportView.js`; dok. `raport-asystenta.md`.

## 4. Mecz

### 4.1 Silnik meczu

- **Pełny silnik minuta po minucie**: strefy siły, sytuacje, gole, kartki, kontuzje, czas doliczony, dogrywka, rzuty karne; mecz gracza; `engine/match/core.js`, `engine/match/match.js`; dok. PLAN 3, `ekspert_futbol.md`.
- **Katalog sytuacji meczowych**: 110 sytuacji z zachowaniem trenera i przepisami; mecz; `engine/match/core.js`; dok. `sytuacje-meczowe.md`.
- **Mecze w tle (szybka symulacja)**: wyniki innych meczów liczone lekko z siły drużyn, ze strzelcami, kartkami i kontuzjami; cała gra; `engine/quickSim.js`, `season/season.js`; dok. PLAN 4.2.
- **Siła drużyny na mecz**: liczona z zawodników, którzy naprawdę mogą zagrać (kontuzje, kartki, powołania); `engine/teamStrength.js`.
- **Rejestr modyfikatorów**: jedno miejsce, w którym stan zawodnika, drużyny i meczu zmienia siłę (zgranie, morale, aklimatyzacja i inne); `engine/modifiers.js`; dok. PLAN 4.1.
- **Zmęczenie w meczu**: zmęczeni zawodnicy są wolniejsi, popełniają błędy i częściej faulują; mecz; `engine/match/teams.js`; dok. `zmeczenie.md`.
- **Gra poza pozycją i bez bramkarza**: kary za grę poza pozycją, dowolne ustawienie w osłabieniu, bramkarz przy czerwonej i urazie; mecz; `engine/positions.js`; dok. PLAN 3.2, `taktyka-i-urazy.md`.
- **Lekkie urazy (gra z bólem)**: zawodnik gra dalej z niższą formą, widoczny na boisku; mecz; `engine/match/core.js`; dok. `taktyka-i-urazy.md`.
- **VAR**: z dramaturgią, karny sędziego bez odwołania, protesty w polu karnym, w Ekstraklasie i w Pucharze Polski od półfinału; mecz; `engine/match/core.js`; dok. `ekspert_sedzia.md`.
- **Kartki**: żółte, druga żółta daje czerwoną i 1 mecz pauzy, progi pauz osobno w każdej lidze; mecz, Kadra; `season/suspension.js`, `config/competitions.js`; od v1.16 Beta.
- **Sędziowie**: pula 136 fikcyjnych sędziów na czterech listach, obsada każdego polskiego meczu, ukryta surowość i noty; mecz, studio; `career/referees.js`; dok. `sedziowie.md`; od v1.14 Beta.
- **AI trenera w meczu**: zmiany, nastawienie i pressing zależne od przebiegu, rywala, zmęczenia i kartek; mecze AI i gracza; `engine/match/coach.js`; dok. `ai-trener.md`.
- **Trenerzy AI z atrybutami**: 5 atrybutów 1-20 (skład, taktyka, motywacja, trening, presja), plan przedmeczowy AI; kluby AI; `career/coaches.js`, `match/aiPlan.js`; dok. `trener-ai-atrybuty.md`.
- **Zasady sparingów i rozstrzygnięcie remisu**: reguła zmian wg umowy, rozstrzygnięcie remisu, kolejność rzutów karnych; mecz; `engine/match/rules.js`; dok. `sparingi-i-karne.md`.
- **Zmiany w meczu**: 5 zmian w 3 oknach (+1 zmiana i +1 okno w dogrywce, przerwa nie zużywa okna); okno Zmiany i taktyka; `engine/match/control.js`; dok. `ekspert_sedzia.md`.

### 4.2 Dzień meczowy

- **Studio przedmeczowe**: zapowiedź, absencje, pogoda, sędzia, przyciski Zmień skład i Konferencja; dzień meczowy; `match/studio.js`, `match/matchday.js`; dok. `odprawy-studio.md`.
- **Odprawy**: przemowa przed meczem, w przerwie i po meczu, dopasowane do rodzaju meczu, stawki, rywala i dwumeczu (puchar, finał, sparing, derby); dzień meczowy; `match/briefings.js`; dok. `odprawy-studio.md`, `odprawy-kontekst.md`.
- **Konferencja przedmeczowa**: osobne okno z dziennikarzami; dzień meczowy; `match/press.js`; dok. `konferencja-prasowa.md`.
- **Konferencja po meczu**: osobny krok po odprawie: Dalej, Udziel wywiadu albo Wyślij asystenta; klimat prasy, dopytania, wpływ na morale i zarząd; dzień meczowy; `match/press.js`; dok. `konferencja-prasowa.md`.
- **Kary za słowa o sędziach**: komisja dyscyplinarna rozstrzyga w kolejnych dniach; Poczta; `match/pressSystem.js`; dok. `konferencja-prasowa.md`.
- **Mecz na żywo**: boisko, relacja, tempo (x1, x2,5, x5, Pokaż wynik), pasek przewagi z procentami, karty i kontuzje na boisku, oceny na żywo, pasek informacji (rozgrywki, pogoda, sędzia, widzowie); dzień meczowy; `ui/matchdayView.js`, `match/matchday.js`; dok. PLAN 7.
- **Zatrzymanie gry i okienka zdarzeń**: mecz zatrzymuje się na ważnych zdarzeniach, a asystent podpowiada zmianę lub taktykę jednym kliknięciem (Propozycja asystenta); dzień meczowy; `ui/matchdayView.js`.
- **Okno Zmiany i taktyka**: boisko, zmiany z listy, taktyka, strzałki, instrukcje indywidualne, karta zawodnika pod prawym przyciskiem; dzień meczowy; `ui/matchdayView.js`; dok. PLAN 7.
- **Okrzyk z linii bocznej**: natychmiastowy impuls dla drużyny, działa ok. kilka minut, przycisk zablokowany na 5 minut; dzień meczowy; `ui/matchdayView.js`, `match/matchday.js`.
- **Przerwa meczu**: wyśrodkowane statystyki, pierwsze jedenastki z ocenami, taktyka w przerwie; dzień meczowy; `ui/matchdayView.js`.
- **Dogrywka i seria rzutów karnych**: z rozstrzygnięciem po meczach pucharowych; dzień meczowy; `engine/match/match.js`; dok. `sparingi-i-karne.md`.
- **Studio pomeczowe**: wynik, zawodnik meczu, kluczowe momenty, statystyki, reakcje i po meczu; dzień meczowy; `match/studio.js`, `ui/postMatchView.js`.
- **Sparingi**: tylko w wolnych terminach (lato, przerwa zimowa, okna FIFA), umowa o zmianach i remisie, odwołanie przy braku 11 zawodników (także w dniu meczu); Trening, Sparingi; `training/friendlies.js`; dok. `sparingi-i-karne.md`, `trening.md` rozdz. 12; od v1.17 Beta odwoływanie. Skład i taktyka przed sparingiem pokazuje całą ławkę sparingu (do 14: 9 wybranych przez gracza i dobranych przez grę, Nov 24, 2026).
- **Raport meczu po kliknięciu wyniku**: gole, asysty, kartki i kontuzje z minutami, dogrywka i karne; terminarz, puchary, Pulpit; `season/matchReport.js`, `ui/matchReportView.js`; dok. `raport-meczu.md`; od v1.16 Beta.
- **Analiza pomeczowa sztabu**: po każdym meczu o stawkę (bez sparingów) analityk albo asystent przysyła wiadomość z wnioskami, dokładność zależy od sztabu; Poczta, Skład i taktyka; `career/postMatchReport.js`, `ui/matchReportView.js`; dok. `analiza-pomeczowa.md`; od v1.18 Beta.

## 5. Rozgrywki

- **Ekstraklasa, 1 Liga, 2 Liga**: po 18 drużyn, 34 kolejki, tabele z kryteriami PZPN, spadki, awanse i baraże; Rozgrywki; `season/leagueComps.js`, `season/schedule.js`, `season/standings.js`, `config/competitions.js`; dok. PLAN 5, `ekspert_sedzia.md`.
- **III liga w grupach**: 72 kluby w 4 grupach po 18 ze stałymi kadrami, finansami, terminarzem, barażami i ruchami z IV ligą, zakładki grup; Rozgrywki, III liga; `season/thirdLeague.js`, `season/leagues.js`; dok. `iii-liga.md`.
- **IV liga**: kluby czwartego szczebla istnieją w danych (kadry na żądanie), ale liga nie jest grywalna; `data/clubs_l4.js`, `season/leagues.js`; dok. `iii-liga.md`.
- **Puchar Polski**: jednomeczowe rundy, gospodarz z niższej ligi, dogrywka i karne, kluby europejskie wchodzą od 1/16, VAR od półfinału, nagrody; Rozgrywki, Puchar Polski; `season/cup.js`; dok. PLAN 5.
- **Superpuchar Polski**: na starcie sezonu, przy remisie od razu karne; Rozgrywki; `season/cup.js`.
- **Liga Mistrzów, Liga Europy, Liga Konferencji**: kwalifikacje i faza ligowa, losowania, mecze polskich klubów w grze, reszta w tle; Rozgrywki, zakładki pucharów (Przebieg, Tabela, Mecze, Strzelcy); `season/uefa.js`, `season/europe.js`, `ui/europeView.js`; dok. PLAN 5.4, `kluby_uefa.md`.
- **Dostęp do pucharów**: kto z Polski gra w pucharach w następnym sezonie (miejsce w Ekstraklasie, Puchar Polski); `season/europeAccess.js`.
- **Ranking UEFA**: prawdziwe współczynniki 5 sezonów klubów i krajów (55 federacji, 415 klubów) liczone dalej z wyników w grze; Rozgrywki, puchary, widok Ranking UEFA (Kluby i Kraje); `season/uefaCoef.js`, `data/ranking_uefa.json`, `ui/europeView.js`; od v1.21 Beta.
- **Siła polskiej piłki w Europie**: kalibracja, żeby gra nie zawyżała polskich klubów w pucharach; `season/uefa.js`; dok. `sila-lig-europy.md`.
- **Superpuchar Europy**: zwycięzca LM kontra zwycięzca LE na europejskim stadionie; Rozgrywki; `season/superCupEU.js`; dok. `superpuchar-europy.md`.
- **Reprezentacje**: widoki Polska, Liga Narodów, Eliminacje, Turniej, Świat, Historia, Powołania; Rozgrywki, Reprezentacje; `ui/nationalView.js`, `season/national.js`, `season/nationalSystem.js`; dok. `reprezentacje.md`, `kalendarz-reprezentacji.md`.
- **Wieczny kalendarz reprezentacji**: okna FIFA, Liga Narodów, eliminacje, Euro, MŚ i turnieje kontynentalne na dowolną liczbę lat, Elo po każdym meczu, gospodarze; `season/intl/*`, `season/worldNations.js`; dok. `kalendarz-reprezentacji.md`.
- **Powołania zawodników do kadr**: zawodnicy wyjeżdżają w oknach FIFA, mecze reprezentacji w tle; Kadra (znacznik), Rozgrywki; `season/nationalSystem.js`.
- **Historia sezonów**: mistrz, zdobywca pucharu, awanse, spadki i miejsca drużyn gracza za zakończone sezony; Rozgrywki, Historia; `ui/competitionsView.js` (`historyView`), `season/rollover.js`.
- **Terminarz i wyniki**: ekran z kolejkami, historią meczów drużyny gracza po sezonach; Rozgrywki, przycisk Terminarz; `ui/fixturesView.js`, `season/history.js`; dok. `historia-i-statystyki.md`.
- **Statystyki i strzelcy**: strzelcy, asysty, kartki i oceny w podziale na rozgrywki; Rozgrywki, Statystyki; `season/history.js`, `ui/competitionsView.js`; dok. `historia-i-statystyki.md`.
- **Widok innego klubu**: kliknięcie nazwy w tabeli pokazuje kadrę ze statystykami, trenera i sztab, formę, kluczowych zawodników, absencje, terminarz (dokładność liczb zależy od analityka); Rozgrywki; `ui/clubView.js`.
- **Profil zawodnika z innego klubu**: karta i statystyki z karty transferowej i menu pod prawym przyciskiem; wszędzie; `ui/playerCard.js`.
- **Kalendarz sezonu i rozwiązywanie konfliktów terminów**: prawdziwe daty, priorytety, przesuwanie meczów bez psucia kolejności rund; cała gra; `config/calendar2026.js`, `season/season.js`; dok. PLAN 5.
- **Wiadomości o innych klubach**: media o dużych transferach, ciężkich kontuzjach i kłopotach finansowych, tylko z ligi gracza i wyższych; Poczta; `career/leagueNews.js`; od v1.19 Beta.

## 6. Poczta

- **Skrzynka**: wiadomości od zarządu, sztabu, zawodników, mediów i rozgrywek, kategorie (Zarząd, Sztab, Zawodnicy, Transfery, Rozgrywki, Reprezentacja i inne), na PC lista i treść obok siebie; Poczta; `core/inbox.js`, `app.js`; dok. PLAN 7.
- **Decyzje w poczcie**: wiadomość z przyciskami (oferty, prośby, przedłużenia), gra czeka na decyzję; Poczta; `core/decisions.js`; dok. PLAN.
- **Przejdź do ekranu, którego dotyczy**: pod wiadomością przyciski prowadzące do zawodnika, kontraktów, rynku, sponsorów, sztabu, rozgrywek; Poczta; `ui/mailLinks.js`; od v1.19 Beta.
- **Filtr skrzynki**: wiadomości o rozgrywkach tylko z ligi gracza, z innych tylko bardzo ważne; Poczta; `core/mailFilter.js`; od v1.19 Beta.
- **Nawigacja i porządkowanie**: Pierwsza i Następna nieprzeczytana, Przeczytaj wszystkie, usuwanie i czyszczenie starych; Poczta; `app.js` (`readall`, `maildel`, `mailprune`); wpis z `0552c44`.

## 7. Transfery

Zakładki: Rynek, Oferty, W toku, Kontrakty, Skauting.

- **Rynek transferowy**: lista transferowa, do wypożyczenia, wolni zawodnicy, zawodnicy z zagranicy; filtry pozycji, regionu, szukanie; Transfery, Rynek; `career/transfers.js`, `ui/transfersView.js`; dok. `transfery.md`.
- **Oferty za zawodników gracza z listy transferowej**: kluby AI w oknie, szansa i kwota zależne od ceny wobec wartości, wieku, kontraktu, budżetu płac i potrzeb kupca; Poczta, Transfery; `career/transfers.js` (`USER_OFFERS`); dok. `transfery.md` (Nov 24, 2026).
- **Karta zawodnika w okienku**: kliknięcie nazwiska otwiera kartę bez wychodzenia z listy; Transfery; `ui/transfersView.js`, `ui/playerCard.js`; dok. `transfery.md`; od v1.19 Beta.
- **Transfer jako proces**: porozumienie klubów, warunki osobiste, testy medyczne, podpis; Transfery, W toku; `career/transferDeals.js`, `ui/transferDealsView.js`; dok. `transfery.md` rozdz. 1.
- **Oferty**: oferty kupna i przedłużenia, przyjęcie, odrzucenie, Żądaj więcej; Transfery, Oferty; `career/transfers.js`, `career/transferSystem.js`.
- **Negocjacje kontraktów**: pensja, długość, premie, bluff, ustępstwa, odejście od stołu, zależne od charakteru zawodnika i agenta; okno negocjacji; `career/negotiation.js`, `ui/negotiationView.js`; dok. `negocjacje.md`.
- **Namysł zawodnika przed podpisem**: udane rozmowy (gracz i kluby AI, wolni i zawodnicy z klubem) to propozycja; zawodnik namyśla się 2-5 dni (z klubem najpóźniej do końca okna), w tym czasie inne kluby mogą przebić, potem wybiera najlepszą: zgoda, odmowa, inny klub albo „chce zmian” (ostatnia runda w 2 dni); Transfery, W toku, Poczta; `career/proposals.js`, `ui/negotiationView.js`; dok. `transfery.md` rozdz. 10, `negocjacje.md` rozdz. 14; od v1.21 Beta; szum wyboru i szansa zgody od v1.21.1 Beta (rozdz. 16).
- **Licytacja w ciemno**: oferty są tajne (kwoty zna tylko zawodnik); gdy inny klub złoży propozycję, klub z wcześniejszą propozycją może ją raz poprawić bez znajomości cudzej kwoty: klub AI wg potrzeby, atrybutu Negocjacje, budżetu i losu, gracz sam (list od agenta „rozważa też inną propozycję”, przyciski „Pensja +4/8/12 %” w W toku, limity jak w rozmowach); Transfery, W toku, Poczta; `career/proposals.js`, `ui/transferDealsView.js`; dok. `negocjacje.md` rozdz. 15; od v1.21.1 Beta.
- **Negocjacje klubów AI**: atrybut Negocjacje 1-20 dyrektora sportowego klubu AI (od v1.23 Beta osoba w sztabie; wcześniej ukryty atrybut klubu); wpływa na pierwszą ofertę, podwyżkę w drugiej rundzie, poprawkę w ciemno i chęć licytowania; `career/clubNegotiation.js`, `career/negotiation.js` (`aiNegotiate`), pomiar `tools/negocjacje-fair.mjs`; dok. `negocjacje.md` rozdz. 15, `dyrektor-sportowy.md`; od v1.21.1 Beta.
- **Dyrektor sportowy**: osoba w sztabie gracza i każdego klubu AI (osobny slot poza limitem, pensja w budżecie sztabu), 4 atrybuty: Negocjacje (rozmowy klubów AI), Znajomość rynku (widełki pensji w rozmowach gracza, błąd wyceny AI), Sieć kontaktów (wypożyczenia, kolejność AI na rynku), Zarządzanie kadrą (spór z trenerem rezerw, prowizje i premie AI); o dyrektorze decyduje zarząd klubu (zmiany 1 lipca jak w klubach AI, wakat obsadza sam), trener może poprosić zarząd o zmianę (prośba do zarządu z opcjonalnym kandydatem), 12-16 wolnych dyrektorów do podglądu, listy podpisane imieniem dyrektora (wakat: Zarząd); Trening, Sztab (podgląd); Klub, Zarząd (prośba); Rozmowy kontraktowe (widełki); `career/staffMarket.js`, `career/director.js`, `career/boardRequests.js`, `ui/staffView.js`, `ui/negotiationView.js`; dok. `dyrektor-sportowy.md`; od v1.23 Beta.
- **Sprzeciw dyrektora sportowego**: przy kupnie z odstępnym (przepłata od 25 % wobec wyceny dyrektora z błędem RYN) i sprzedaży (od 25 % poniżej wartości) dyrektor klubu gracza może się sprzeciwić (szansa z różnicy i KAD, bez cudzych ofert, po wecie zarządu bez dublowania); trener wybiera: wycofuję się, renegocjacja (NEG: kwota lepsza o 5-15 % albo druga strona zostaje przy swojej, rzadko zrywa) albo nalegam (zaufanie zarządu -1 do -3, historia w Klub, Zarząd); okno w karcie zawodnika i w Ofertach, list z decyzją przy ofercie z poczty; `career/director.js`, `career/transfers.js` (`answerDirector`), `ui/transfersView.js`, `ui/boardRequestsView.js`; dok. `dyrektor-sportowy.md` rozdz. 9; od v1.23 Beta.
- **Rotacja dyrektorów sportowych**: poza 1 lipca, bardzo rzadko, gracz i AI: kluby AI podbierają dyrektorów klubom o niższej reputacji (zgoda osoby, rekompensata albo blokada zarządu), rezygnacje (ok. 2,5 % na klub w sezonie) i zwolnienia przez właściciela (ok. 2 %); list do gracza, następcę wybiera zarząd; `career/directorRotation.js`, `career/staffMarket.js`; dok. `dyrektor-sportowy.md` rozdz. 10; od v1.23 Beta.
- **Klocki decyzji zawodnika**: ocena oferty jako suma czynników (pieniądze, prestiż, rola, Europa, zagranica, lojalność, miasto i rodzina, stabilność klubu, pierwszeństwo oferty), łatwa do rozbudowy; prekontrakty i namysł; `career/offerFactors.js`; dok. `negocjacje.md` rozdz. 16; od v1.21.1 Beta.
- **Kontrakty**: lista kontraktów z przedłużaniem, zwalnianiem (rozwiązanie), osłoną przed limitem kadry; Transfery, Kontrakty; `ui/transfersView.js`; dok. `transfery.md`.
- **Prekontrakty**: umowa od 1 lipca z zawodnikiem, któremu kończy się kontrakt (od 1 stycznia), także oferowana przez inne kluby; Transfery; `career/preContracts.js`; dok. `transfery.md` rozdz. 2.
- **Nastawienie do zejścia niżej (D)**: gotowość zawodnika do zmiany klubu na słabszy; Transfery; `career/mindset.js`; dok. `transfery.md` rozdz. 3.
- **Okna transferowe**: lato od 1 lipca do 9 września co roku, zima od 1 lutego do 26 lutego; Pulpit, Transfery; `config/calendar2026.js`, `season/dailySystems.js`; dok. `transfery.md` rozdz. 5; lato od v1.21 Beta.
- **Wypożyczenia**: rodzaje i terminy, limity PZPN i FIFA, podział pensji, obietnica minut, wykup, pierwokup, odwołanie, oferty od klubów AI, prośba o wykup przed końcem; Transfery, W toku; `career/loans.js`, `ui/loansView.js`; dok. `wypozyczenia.md`; od v1.19 Beta decyzja zawodnika.
- **Kupcy z zagranicy**: kluby z lig o sile co najmniej Ekstraklasy kupują zawodników; Transfery; `career/foreignMarket.js`; dok. `transfery.md` rozdz. 4.
- **Zawodnicy z zagranicy na rynku**: pula ok. 100 obcokrajowców, kupno z klubów zagranicznych, filtr regionu; Transfery, Rynek, Z zagranicy; `career/foreignPool.js`; dok. `transfery.md` rozdz. 9.
- **Zawodnik sprzedany za granicę**: trafia do prawdziwego klubu z danego kraju, dobranego do jego poziomu, karta pokazuje klub zagraniczny; Transfery, karta; `career/foreignMarket.js`; od v1.21 Beta.
- **Rotacja wolnych zawodników**: długo bez klubu znikają z rynku, na ich miejsce przychodzą nowi; Transfery; `career/transfers.js`; dok. `transfery.md`.
- **Skauting zagraniczny**: skauci z 5 cechami i regionami, 12 regionów, zlecenia wyjazdów z profilem zawodnika, raport tygodniowy, kandydaci (wolny albo z klubem, ocena skauta zamiast OVR), wolni skauci do zatrudnienia, misje klubów AI; Transfery, Skauting (Skauci i misje, Kandydaci, Wolni skauci); `career/scoutOps.js`, `career/scoutRegions.js`, `ui/scoutingView.js`; dok. `skauting.md`; od v1.20 Beta.
- **Ukryta ocena kandydatów skauta**: w Transferach lornetka zamiast OVR i atrybutów, ocena tylko w zdaniu skauta; Transfery; `ui/scoutMask.js`; od v1.21 Beta.
- **Limit kadry w Transferach**: ostrzeżenie o zarządzie wskazującym zawodnika i przycisk Osłoń; Transfery; `career/squadLimit.js`; dok. `limit-kadry.md`.

## 8. Klub

Zakładki: Finanse, Sponsorzy, Infrastruktura, Zarząd, Kariera.

- **Finanse klubu**: realne pensje, przychody (bilety, TV, sponsorzy, nagrody), budżety, plan sezonu, kary PZPN; Klub, Finanse; `career/finance.js`, `data/finanse_klubow.js`; dok. `finanse.md`.
- **Nagrody i premie**: Puchar Polski według rundy, premie UEFA za etapy i zwycięstwa; Klub, Finanse; `career/prizes.js`; dok. `finanse.md` rozdz. 3.3.
- **Sponsorzy**: umowy sponsorskie z pulą klubu, negocjacje i odnowienia; Klub, Sponsorzy; `career/sponsors.js`, `ui/sponsorsView.js`; dok. `finanse.md` (Sponsorzy).
- **Infrastruktura**: stadion, baza treningowa i akademia (poziomy 1-10, w Polsce baza i akademia najwyżej 5 i 6), inwestycje po zgodzie zarządu (3-7 dni) i pozwoleniu miasta, licencja PZPN, drabina poziomów; Klub, Infrastruktura; `career/infrastructure.js`, `ui/infraView.js`; dok. `infrastruktura.md`; od v1.16 Beta wnioski, od v1.19 Beta skala światowa.
- **Akademia (miejsca i juniorzy)**: liczba miejsc rośnie z poziomem (3 do 24), przy pełnej akademii odchodzi junior, który najmniej rokuje; Klub, Infrastruktura; `career/infrastructure.js`; dok. `infrastruktura.md`; od v1.13 Beta.
- **Zarząd**: cel sezonu, zaufanie, comiesięczna ocena (miejsce wobec celu, finanse, kibice, prasa), zwolnienie trenera; Klub, Zarząd; `career/board.js`, `career/careerSystem.js`; dok. PLAN 2.
- **Prośby do zarządu i weto**: budżety, przesunięcie do płac, niższy cel, warunki, odwołania; weto zarządu przy kontrakcie (liczy roczny koszt); rozliczenie warunku: cel osiągnięty = pieniądze w granicach finansów (bez kary), blisko celu = część kwoty albo wyrozumiałość zależnie od właściciela i losu, daleko = bez pieniędzy (od v1.23 Beta); Klub, Zarząd; `career/boardRequests.js`, `ui/boardRequestsView.js`; dok. `finanse.md` (Prośby i weto).
- **Właściciele klubów**: profil osobowości i typ właściciela wpływają na decyzje zarządu; Klub, Zarząd; `career/owners.js`; dok. `trenerzy-i-wlasciciele.md`.
- **Panel „Zarząd klubu”**: karta właściciela i prezesa (typ, opis, 5 cech z paskami) i karta dyrektora sportowego (jakość, umowa, pensja, staż, 4 atrybuty), tylko podgląd; Klub, Zarząd; `ui/boardRequestsView.js` (`boardPeoplePanel`); dok. `dyrektor-sportowy.md` rozdz. 6; od v1.23 Beta.
- **Rozmowa z prezesem (prośba o zmianę dyrektora)**: „Poproś o zmianę dyrektora” otwiera okno, prezes zadaje 4-5 pytań z puli 34 (z danymi z co najmniej 6 miesięcy: wyniki, przepłaty, sprzeciwy, wypożyczenia), ton z cech właściciela, reakcja po każdej odpowiedzi, kłamstwo kosztuje; decyzja z wyniku rozmowy, punktacji zarządu i losu: zgoda, zgoda warunkowa (ocena po pół roku), odmowa; Esc = prośba niezłożona; Klub, Zarząd; `career/presidentQuiz.js`, `data/prezesQuiz.js`, `ui/presidentQuizView.js`, `career/boardRequests.js`; dok. `dyrektor-sportowy.md` rozdz. 12; od v1.23 Beta.
- **Kibice**: nastroje, presja na trenera i zarząd, drabina protestów, frekwencja, kary dyscyplinarne za zachowanie; Klub, Zarząd, mecze; `career/fans.js`, `career/fansSystem.js`, `data/kibice.js`; dok. `kibice.md`.
- **Rywale klubów**: największe rywalizacje (intensywność 0-3) wpływają na kibiców, odprawy i rangę meczu; mecze, Edytor; `data/kibice.js`, `career/fans.js`; od v1.19 Beta w edytorze.
- **Organiczna trudność**: świat reaguje na sukcesy trenera, bez suwaka trudności i ukrytych premii dla AI; cała gra; `career/threat.js`; dok. `balans.md`.
- **Gra bierna kosztuje punkty**: brak rozmów, monotonny trening i przewidywalna taktyka obniżają wyniki; cała gra; `training/variety.js`, `training/scouting.js`, `career/authority.js`; dok. `bierna-gra.md`.
- **Kariera trenera (panel)**: reputacja trenera, popularność wśród kibiców i mediów, historia sezonów, rekordy, ścieżka klubów, 20 odznak z gablotą, okno odblokowania trofeum; Klub, Kariera; `career/coachCareer.js`, `ui/careerView.js`, `ui/badges.js`; dok. `kariera-trenera.md`; od v1.19 Beta.

## 9. Kariera trenera i rynek pracy

- **Rynek pracy trenera**: po zwolnieniu albo rezygnacji gracz bez klubu przegląda wakaty, składa i wycofuje aplikacje, dostaje oferty od agenta i III ligi; Klub, Kariera, Pulpit; `career/jobMarket.js`; dok. `kariera-trenera.md` rozdz. 7; od v1.19 Beta.
- **Rezygnacja z posady**: trener odchodzi z klubu z potwierdzeniem, decyzje dawnego klubu w Poczcie się zamykają; Klub, Kariera; `career/jobMarket.js`, `ui/careerView.js`; od v1.19 Beta.
- **Ekrany klubu zamknięte bez klubu**: Kadra, Transfery i Trening pokazują przejście do rynku pracy; wszystkie zakładki; `app.js` (unemployedNotice); od v1.19 Beta.
- **Rynek trenerów AI**: zwolnienia po serii wyników, trener przynosi własny styl, skala trenerów w ligach; kluby AI; `career/coachMarket.js`; dok. `trenerzy-i-wlasciciele.md`.
- **Narzędzie kalibracji kariery**: skrypt do strojenia szans aplikacji i reputacji; `tools/kariera-kalibracja.mjs`; dok. `kariera-trenera.md` rozdz. 10-11.

## 10. Trening

Zakładki: Pulpit, Tydzień, Obozy, Sparingi, Zawodnicy, Obciążenia, Sztab, Rozwój.

- **Pulpit treningowy**: stan treningu, pasek obozu z datami, urazy; Trening, Pulpit; `ui/trainingView.js`; dok. `trening.md`.
- **Plan tygodnia**: dni względem meczów (MD, MD+1, MD-1), szablony mikrocykli, akcent tygodnia (m.in. taktyczny, stałe fragmenty), intensywność zajęć; Trening, Tydzień; `training/plan.js`, `training/sessions.js`; dok. `trening.md` rozdz. 3-4.
- **Trening indywidualny**: akcent dla zawodnika z podświetleniem atrybutów, które może podnieść, także u juniorów akademii; Trening, Zawodnicy; `training/sessions.js`; dok. `trening.md`.
- **Obciążenie i zdrowie**: dziennik 28 dni (AU), proporcja ostrego do przewlekłego (ACWR), ryzyko urazu; Trening, Obciążenia; `training/load.js`; dok. `trening.md` rozdz. 5.
- **Rozwój i spadek zawodników**: raz w miesiącu dla całego świata, zależny od treningu, sztabu, wieku i minut; Trening, Rozwój; `training/development.js`; dok. `trening.md` rozdz. 6.
- **Zgranie drużyny**: znajomość formacji, instrukcji i systemu wpływa na mecz; Trening; `training/cohesion.js`; dok. `trening.md` rozdz. 7.
- **Obozy przygotowawcze**: letni (lipiec) i zimowy (styczeń), rezerwacja terminu i miejsca; Trening, Obozy; `training/camps.js`; dok. `trening.md` rozdz. 11.
- **Trening klubów AI**: te same dzienne plany i wzory co u gracza, regeneracja zawodników AI; kluby AI; `training/aiClubs.js`; dok. `trening-ai.md`.
- **Monotonia treningu**: ten sam akcent tydzień po tygodniu obniża efekt; Trening; `training/variety.js`; dok. `bierna-gra.md`.
- **Analiza rywala**: analitycy oglądają nasze mecze, bonus za przygotowanie do rywala; Trening, mecz; `training/scouting.js`; dok. `bierna-gra.md`.
- **Sztab szkoleniowy (ekran)**: Mój sztab z kartami ról i osób, Rynek sztabu z filtrami i kartą osoby, Oferty w toku; Trening, Sztab; `ui/staffView.js`; dok. `sztab.md`; od v1.14 Beta.
- **Zatrudnianie i zwalnianie sztabu**: lista ok. 100 wolnych, podbieranie z innych klubów (zgoda albo blokada klubu, rekompensata), kilka osób w roli, limit sztabu; Trening, Sztab; `career/staffMarket.js`; dok. `sztab.md`; od v1.14 Beta.
- **Role sztabu**: asystent trenera, przygotowanie fizyczne, trener bramkarzy, trener młodzieży, główny analityk, kierownik drużyny, fizjoterapeuta, skaut; Trening, Sztab; `training/staff.js`, `training/config.js`; dok. `trening.md` rozdz. 8, `sztab.md`.
- **Atrybuty członków sztabu**: po 3 atrybuty roli napędzają trening, rozwój, urazy, raporty i asystenta w meczu; Trening, Sztab; `training/config.js` (`ROLE_ATTRS`); dok. `sztab-atrybuty.md`; od v1.19 Beta. Od v1.23 Beta skala 1-12 dla wszystkich ról poza fizjoterapeutą i dyrektorem (12 działa jak dawne 17, efekty, pensje i rozwój jak dotąd, migracja zapisu i datapacku v7, edytor do 12), wartości w widokach w liczbach całkowitych; `training/config.js` (`staffEff`, `STAFF_CAP`).
- **Kierownik drużyny**: zgłasza sprawy organizacyjne, jego jakość decyduje o dokładności listy tygodnia; Trening, Sztab, Pulpit; `training/staff.js`, `career/weeklyTodo.js`; dok. `do-zrobienia.md`.

## 11. Świat i sezon

- **Pętla dni i systemy dnia**: kolejność systemów rejestrowanych przez `registerDailySystem` (m.in. rollover 0, loans 1, national 3, reserves 4, europe 4, matchday 5, welcome 10, transferWindows 20, competitionCalendar 30, matchPreview 40, career 50, sponsors 51, squadLimit 52, transfers 53, retirement 54, fans 55, infra 55, jobMarket 56, coachMarket 57, staffMarket 58, recovery 90, attention 91, acclim 92, authority 92, training 95, leagueNews 95, reputation 96); cała gra; `core/gameLoop.js`; dok. PLAN 4.1.
- **Zmiana sezonu**: 1 lipca podsumowanie, awanse i spadki, nowy terminarz, kontrakty, odejścia, nowe losowania; cała gra; `season/rollover.js`; dok. PLAN 6, `iii-liga.md`.
- **Przynależność do lig w kolejnych sezonach**: awanse, spadki, rezerwy zawsze co najmniej ligę niżej i limit rezerw do 2 Ligi; `season/leagues.js`; dok. PLAN 1, 6.
- **Generator świata**: kadry polskich klubów z rezerwami i akademiami, zawodnicy z imionami i nazwiskami z wielu krajów; Nowa kariera; `world/worldGen.js`, `world/playerGen.js`, `data/names.js`; dok. `ekspert_futbol.md`.
- **Kadry na żądanie**: dla klubów bez stałej kadry (zagraniczne, III liga w Pucharze Polski), generowane z ziarna i po meczu usuwane; `world/ephemeral.js`; dok. PLAN 1.
- **Kluby i kraje UEFA**: 156 klubów i 55 krajów z prawdziwymi nazwami (bez herbów i prawdziwych zawodników); `data/kluby_uefa.json`, `data/kluby_swiat.js`; dok. `kluby_uefa.md`.
- **Fikcyjne nazwy i herby klubów**: fikcyjne nazwy i nowe herby klubów Ekstraklasy, 1 Ligi i 2 Ligi oraz ich rezerw, prawdziwe zostają do testów; cała gra; `data/clubNames.js`, `ui/crest.js`; dok. `edytor.md`; od v1.19 Beta.
- **Deterministyczny generator losowy**: ziarno i zapisywalny stan, ta sama gra daje ten sam przebieg; `core/rng.js`.
- **Narzędzia pomiarowe**: `npm run perf` (czas sezonu i systemów dnia), `tools/multiseason.mjs`, `tools/scoutsim.mjs`, `tools/pi-kalibracja.mjs`, `tools/transfery-kalibracja.mjs`; dok. `PRZEKAZANIE.md`, `CLAUDE.md`.

## 12. Opcje, zapis, edytor, datapack

- **Menu gry (Opcje, Zapis, Wyjście)**: na PC u dołu bocznego menu, na telefonie przycisk w nagłówku; `ui/sysMenu.js`.
- **Opcje**: jasność motywu, tempo upływu dni, Edytor, numer wersji; Opcje; `ui/sysMenu.js`.
- **Zapis**: autozapis w IndexedDB (3 sloty), kopia zapasowa do pliku JSON bez Google Drive i bez udostępniania systemowego; Zapis; `core/store.js`, `ui/sysMenu.js`.
- **Wyjście**: zapis i powrót do ekranu startowego; Wyjście; `app.js`.
- **Zapis przechowuje nazwy klubów z początku kariery**: trwające kariery zostają przy nazwach i herbach, z którymi je rozpoczęto, lista zapisów pokazuje klub z kariery; Ekran startowy; `core/store.js` (`slotClubInfo`); od v1.19 Beta.
- **Edytor klubów**: nazwa, skrót, barwy, stadion, pojemność, finanse, własny herb (obrazek w datapacku), trener, sztab i właściciel z atrybutami, rywale; Opcje, Edytor, Kluby; `career/editor.js`, `ui/editorView.js`; dok. `edytor.md`.
- **Edytor zawodników**: dane i atrybuty, boisko z pozycją główną i dodatkowymi (dopasowanie w procentach), kontuzja z rodzajem i dniami, narodowość z listy FIFA, wolni zawodnicy do kadry i z kadry (limit 21-32), nowi wolni z całego świata; Opcje, Edytor, Zawodnicy; `career/editor.js`, `ui/editorView.js`; dok. `edytor.md`.
- **Edytor sędziów**: edycja puli sędziów; Opcje, Edytor, Sędziowie; `career/editor.js`; dok. `edytor.md`.
- **Datapack**: pełny eksport (wszystkie kluby i zawodnicy) i import, wersje pliku v1 do v4 (starsze wczytują się bez błędu), walidacja; Opcje, Edytor, Datapack; `career/editor.js`; dok. `edytor.md`, `datapack/agenci.md`, `datapack/wzor.json`; kontrola pliku `tools/check-datapack.mjs`; dorosły zawodnik na miejscu akademii po wczytaniu przechodzi do pierwszej drużyny (od v1.22 Beta).
- **Instrukcja zbierania datapacku dla agentów AI**: złoty wzorzec i opis procesu; dok. `datapack/agenci.md`; od v1.19 Beta.

## 13. PWA i działanie offline

- **Aplikacja instalowana na ekran główny**: manifest, działa offline; `manifest.webmanifest`, `index.html`; dok. PLAN 1.
- **Service worker z listą plików**: pliki z pamięci urządzenia ze skrótem zawartości, po aktualizacji pobierane tylko zmienione, najpierw sieć, potem pamięć; `sw.js` (generowany przez `npm run sw`, `tools/sw-list.cjs`); dok. `PRZEKAZANIE.md` rozdz. 4 i 7; test `tests/core.test.mjs`.
- **Komunikat o nowej wersji**: ekran startowy przeładowuje się, gdy sw.js ma aktualizację; `app.js`.
- **Mobile-first i PC**: układ telefonu 390 px, tablet, szeroki PC (do 1920 px), boczne menu na PC stoi w miejscu przy przewijaniu; `styles/*.css`; dok. PLAN 7.

---

## Nie ma w grze (zaplanowane lub odrzucone)

Pełne listy: `docs/kolejka.md` (zadania zatwierdzone przez właściciela do zrobienia później) i `docs/do-zrobienia.md` (uproszczenia i otwarte sprawy listy tygodnia). Skrót, bez kopiowania całości:

- **Psychika zawodnika (pakiet)**: rozbudowa psychiki razem z dalszymi krokami historii morale (dziennik przyczyn zmian morale, wykres atmosfery sezonu, wykorzystanie historii w prośbach o transfer, kontraktach, prasie i zarządzie); odłożone na później, nie zaczynać bez zgody; `kolejka.md` punkty 1 i 2.
- **Psycholog sportowy**: rola w sztabie planowana w ramach psychiki; w kodzie roli nie ma (osiem ról, patrz Trening); `kolejka.md` punkt 2.
- **Limit zawodników spoza UE w 1, 2 i 3 lidze**: przepis PZPN o 2 spoza UE na boisku; limit wyłączony, pole `p.eu` liczone, ale nieużywane; `kolejka.md` punkt 3.
- **Losowy termin ofert dla trenera bez klubu**: dziś stałe terminy (agent po 60 dniach, III liga po 120); `kolejka.md`, ostatni punkt.
- **IV liga grywalna** i zasada Pucharu Polski dla III ligi (puchary wojewódzkie): odłożone do czasu grywalnej IV ligi; `PRZEKAZANIE.md` rozdz. 5 (propozycja 7).
- **Przemowy przed dogrywką i przed serią rzutów karnych**: propozycja bez decyzji; `PRZEKAZANIE.md` rozdz. 5 (propozycja 1).
- **Miesięczny raport trenera akademii** (kto jest gotowy do pierwszego składu): propozycja bez decyzji; `PRZEKAZANIE.md` rozdz. 5 (propozycja 5).
- **Uproszczenia listy tygodnia**: bez kartek przed pauzą, obietnic roli, ciężkich nóg, znużenia treningiem i prekontraktu „ostatnia szansa”; kierownik drużyny AI nie wpływa na grę klubów AI; `do-zrobienia.md` (Uproszczenia i otwarte).
- **Konta, logowanie, serwer, Google Drive, Web Share**: odrzucone z założenia (gra prywatna, `CLAUDE.md`).
- **Suwaki trudności i sztuczne sufity**: odrzucone z założenia, wynik to mechanika i losowość, gracz i AI mają te same zasady (`CLAUDE.md`, `balans.md`).
- **Przepis o młodzieżowcu**: odrzucony decyzją właściciela (`PLAN.md` rozdz. 1).
