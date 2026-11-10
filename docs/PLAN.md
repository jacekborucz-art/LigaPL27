# Manager piłkarski na telefon: plan działania

Stan na Nov 10, 2026. Dokument łączy wywiad z użytkownikiem, raporty dwóch ekspertów i burzę mózgów trzech ról.

Pliki źródłowe w `docs/`:
- `ekspert_sedzia.md`: przepisy IFAB 2026/27, regulaminy PZPN i UEFA, kalendarz, 25 reguł twardych, 30 pułapek.
- `ekspert_futbol.md`: atrybuty, 10 formacji, instrukcje, silnik minutowy, kalibracja na 30 000 meczów, siła 54 polskich klubów, model rezerw.
- `kluby_uefa.json` i `kluby_uefa.md` (w przygotowaniu): zagraniczne kluby z siłą i rankingiem.
- `tools/engine.js`, `tools/fit.js`: skrypty kalibracyjne silnika.

## 1. Decyzje

| Temat | Decyzja |
|---|---|
| Platforma | PWA (HTML/JS), offline, instalacja na ekran główny. Projekt mobile-first dla Androida i iPhone'a, ale gra działa też w przeglądarce na PC ze skalowaniem grafiki (rozdział 7) |
| Zakres | Kariera wielosezonowa, start lipiec 2026 (sezon 2026/27) |
| Ligi | Ekstraklasa, 1 Liga, 2 Liga po 18 drużyn, lista od użytkownika |
| Puchary krajowe | Puchar Polski + Superpuchar (lipiec 2026: Lech Poznań vs Górnik Zabrze) |
| Puchary UEFA | LM, LE, LK z prawdziwymi nazwami klubów, bez herbów i bez prawdziwych zawodników |
| Kadry zagraniczne | Generowane na mecz z ziarna `hash(klub+sezon)`, po meczu usuwane (zostają tylko kartki i kontuzje) |
| Transfery i finanse | Poziom średni |
| Zarząd | Cele, zaufanie, zwolnienie, oferty z innych klubów |
| Odbiorca | Gra prywatna, tylko dla autora. Bez publikacji, bez sklepu, bez kont i serwera |
| Młodzieżowiec | **Brak** przepisu o młodzieżowcu (decyzja użytkownika) |
| Rezerwy | Zawsze co najmniej ligę niżej niż pierwsza drużyna. Spadek pierwszej drużyny do ligi rezerw wymusza spadek rezerw. Rezerwy nie awansują do ligi pierwszej drużyny |
| Kalendarz | Prawdziwe daty. Konflikty rozwiązuje harmonogram (rozdział 5) bez psucia kolejności rund |
| Limit rezerw PZPN | Włączony: rezerwy najwyżej w 2 Lidze (decyzja użytkownika Nov 10, 2026) |
| Nazwy 2 Ligi | Lechia Zielona Góra, Rekord Bielsko-Biała, Sandecja Nowy Sącz (potwierdzone) |
| Reprezentacje | Zawodnicy wyjeżdżają na kadrę w oknach FIFA (rozdział 5.5) |

## 2. Burza mózgów: programista, sędzia, znawca futbolu

### 2.1 Gdzie eksperci się powtórzyli lub nie zgadzali

Sprawdziłem oba raporty pod kątem tych samych tematów opisanych dwa razy i sprzecznych liczb.

| Temat | Sędzia | Futbol | Ustalenie |
|---|---|---|---|
| Żółte kartki na mecz | 4,4 (Ekstraklasa) | 3,96 po kalibracji | Podnosimy ŻK na faul z 0,14 do 0,155. Cel 4,3, a surowość sędziego daje rozrzut |
| Karne | 0,30 na mecz, w serii 72 % | 0,31, skuteczność 78 % | Mecz 77 %, seria 72 % (presja). Bez VAR (1L, 2L) mnożnik 0,85 |
| Kontuzje w meczu | IFAB 2026/27: opatrywany schodzi na 1 minutę | brak tej reguły | Dodajemy: po opatrzeniu drużyna gra 1 minutę w 10. Wyjątek: bramkarz i faul ukarany kartką |
| Zmiany | 5 zmian, 3 okna, przerwa bez okna | AI robi 4-4,5 zmiany | Jeden walidator zmian w `rules.js`, z którego korzystają gracz i AI |
| Rezerwowi w protokole | UEFA 12, Ekstraklasa 12, 1L/2L 9 (niepewne) | ławka 7 | Wartość z konfiguracji rozgrywek. Domyślnie 12 / 12 / 9 |
| Rezerwy w lidze | regulamin PZPN do weryfikacji | algorytm końca sezonu | Reguła użytkownika jest nadrzędna. Wynik weryfikacji PZPN dopiszę |
| Młodzieżowiec, limit spoza UE | opisane | brak | Młodzieżowiec usunięty. Limit spoza UE w 1L/2L zostaje jako opcja w konfiguracji, domyślnie wyłączona |

### 2.2 Przebieg dyskusji

**Znawca futbolu:** Gra ma żyć z decyzji, a nie z liczb. Każda decyzja gracza musi mieć widoczny skutek i koszt. Wysoki pressing daje odbiory, ale męczy i daje więcej fauli. Krótkie podania działają tylko wtedy, gdy drużyna ma technikę.

**Programista:** Zgoda, ale silnik nie może symulować piłki na boisku. Na minutę robimy jeden rzut kostką na posiadanie, jeden na akcję i kilka na zdarzenia. To mniej niż 0,1 ms na minutę. Ikony zawodników na boisku są wizualizacją: ustawienie bierzemy z formacji, a pozycję przesuwa strona posiadania i typ akcji. Fizyki nie liczymy.

**Sędzia:** Wtedy reguły muszą być osobnym modułem, którego nie da się obejść. Zarówno AI, jak i gracz przechodzą przez ten sam walidator: 5 zmian, 3 okna, brak powrotu zmienionego, minimum 7 na boisku, druga żółta to czerwona, seria karnych ABAB z wyrównaniem liczebności. Gry managerskie najczęściej łamią przepisy tam, gdzie AI ma własną, uproszczoną ścieżkę.

**Znawca futbolu:** Gracz nie może zmieniać taktyki co minutę. Proponuję bezwładność: nowe ustawienie wchodzi przez 3-8 minut, a zbyt częste zmiany obniżają spójność drużyny. W przerwie zmiany są darmowe. AI podlega tym samym regułom.

**Programista:** To jest tanie: jedna liczba "spójność" na drużynę i interpolacja mnożników. Okrzyki z linii bocznej mają cooldown 8 minut, a powtarzana przemowa traci 20 % efektu. Spam nic nie daje i nie trzeba go blokować w UI.

**Sędzia:** Czas doliczony liczymy z tego, co się wydarzyło: gole, okna zmian, kontuzje, VAR, kartki, gra na czas. Średnio wychodzi 3 minuty w pierwszej połowie i 6-7 w drugiej, w zakresie podanym przez użytkownika (1-10). VAR włączamy tylko w Ekstraklasie i w pucharach UEFA. Sprawdzenie trwa 60-120 s realnego czasu, co w grze daje 2-3 sekundy pauzy i komunikat.

**Znawca futbolu:** Gol to najważniejszy moment. Pauza 3 sekundy, migający napis GOL, a przy VAR-ze napięcie: najpierw GOL, potem ewentualnie "VAR sprawdza" i anulowanie w około 4 % przypadków.

**Programista:** Mecze, których gracz nie ogląda, idą szybką symulacją Poissona skalibrowaną do pełnego silnika (zgodność do 2 punktów procentowych). Kolejka trzech lig to poniżej 50 ms w Web Workerze. Kadry zagraniczne generujemy deterministycznie tylko na mecz z graczem.

**Sędzia:** Kalendarz jest ryzykiem. Daty UEFA są stałe i nie wolno ich ruszać. Ligę trzeba przesuwać wokół pucharów, a Puchar Polski ma swoje terminy. Zaległy mecz nie może wypaść po kolejnej rundzie tych samych rozgrywek.

**Programista:** Robimy harmonogram z priorytetami i terminem granicznym dla każdego meczu (rozdział 5). Po każdej zmianie kalendarza uruchamiamy test niezmienników. Błąd taki jak 1/8 rozegrane po 1/4 nie przejdzie walidacji.

**Znawca futbolu:** Żeby gra nie była nudna, dokładamy warstwy, które kosztują mało obliczeń: forma z 5 ostatnich ocen, zgranie formacji i linii, zmęczenie przy meczach co 3 dni, osobowość zawodnika, przemowy, pogoda i murawa, surowość sędziego, ranga meczu (derby, finał), plotki transferowe i nastroje kibiców.

**Wspólne ustalenie:** Silnik jest prosty w środku i ma dużo widocznych warstw. Wszystkie liczby siedzą w jednym pliku konfiguracji. Reguły twarde są w jednym module. Kalibracja jest automatyczna.

### 2.3 Warstwy gry i ich koszt

| Warstwa | Co widzi gracz | Koszt obliczeń |
|---|---|---|
| 27 atrybutów + 6 ukrytych | Profil zawodnika, OVR zależny od pozycji | Raz przy generowaniu |
| Forma, morale, świeżość, ostrość | Strzałki i paski przy nazwisku | 4 liczby na zawodnika, aktualizacja po meczu |
| 10 formacji + 7 instrukcji | Boisko z ikonami, suwaki instrukcji | Mnożniki przed meczem i przy zmianie |
| Kontry taktyczne (12 par) | Raport asystenta przed meczem | Tabela, odczyt raz na zmianę |
| Bezwładność i spójność | Pasek spójności w meczu | 1 liczba na drużynę |
| Motywacja: przemowy, okrzyki | Wybór w przerwie i z linii bocznej | Macierz 6 x 5 |
| Pogoda, murawa, ranga, sędzia | Zapowiedź meczu | 4 mnożniki |
| Kontuzje lekkie, średnie, ciężkie | Lista kontuzjowanych, czas powrotu | Rzut kostką na minutę dla 22 zawodników |
| Kartki i zawieszenia | Kartkowicze, pauzy | Liczniki per rozgrywki |
| Trening, rozwój, starzenie | Plan tygodnia, raport miesięczny | Raz w tygodniu i raz w miesiącu |
| Transfery, kontrakty, finanse | Oferty, negocjacje, budżet | Raz na dzień gry |
| Zarząd i kibice | Paski zaufania, cele | Po meczu |

### 2.4 Reputacja zawodników i klubów (decyzja użytkownika)

Kod: `src/career/reputation.js`, testy: `tests/reputation.test.mjs`.

**Reputacja zawodnika (0-100)** jest polem każdego zawodnika (`player.rep`), także w kadrach generowanych na mecz.

| Poziom | Zakres | Typowy zawodnik |
|---|---|---|
| Nieznany | 0-24 | Młodzież, dół 2 Ligi |
| Znany lokalnie | 25-39 | 2 Liga, 1 Liga |
| Znany w Polsce | 40-54 | Ekstraklasa |
| Uznany w Europie | 55-69 | Czołówka Ekstraklasy, reprezentant |
| Gwiazda w Europie | 70-84 | Kluby z LM |
| Światowa gwiazda | 85+ | Elita |

- **Skąd się bierze:** OVR (krzywa: 1 Liga ok. 30, Ekstraklasa ok. 40, reprezentant ok. 58, elita ok. 82), występy w reprezentacji, trofea, mecze w pucharach, średnia ocen w sezonie, reputacja klubu (lekkie przyciąganie) oraz kara dla młodych (mniej znani, niż wskazuje talent).
- **Jak się zmienia:** raz w miesiącu zbliża się o 12 % do wartości docelowej. Do tego zdarzenia: gol w finale, pierwsze powołanie, tytuł, czerwona za przemoc, spadek z ligi, długa kontuzja.
- **Reputacja klubu:** na start z prestiżu i ligi (`prestiż*7 + bonus ligi`), potem z wyników: miejsce wobec oczekiwań, trofea, puchary.

**Wpływ na transfery:**
- **Zgoda zawodnika** zależy od różnicy reputacji między nim a klubem, kroku w górę albo w dół względem obecnego klubu, niższej ligi, gry w pucharach, szansy na grę w podstawie, końca kontraktu, niezadowolenia, wieku i osobowości (ambitny patrzy bardziej na reputację). Werdykt: chętny, otwarty, niechętny albo odmowa, z podanymi powodami („Uważa ten klub za zbyt słaby dla siebie”, „Kusi go gra w europejskich pucharach”).
- **Twarda odmowa:** klub ma reputację niższą o ponad 30 punktów (po korekcie na wiek i osobowość). Wtedy pieniądze nic nie dają.
- **Pieniądze pomagają tylko częściowo:** podwyższona pensja ma ograniczony wpływ (u weteranów większy), więc słaby klub nie kupi gwiazdy samą pensją.
- **Wyższe żądania:** im większa różnica reputacji, tym wyższa żądana pensja.
- **Trudniej wykupić:** klub sprzedający żąda za znanego zawodnika więcej (od reputacji 35 w górę +1,2 % ceny za punkt).
- **Wartość rynkowa** dostaje mnożnik z reputacji (0,8-1,6).

**Inne skutki reputacji:** szansa powołania do reprezentacji, zainteresowanie innych klubów, spadek morale znanego zawodnika na ławce, frekwencja i przychody z koszulek (lekko).

### 2.5 Kadra: koniec kariery, listy transferowe, braki (decyzja użytkownika)

Kod: `src/career/squad.js`, testy: `tests/squad.test.mjs`.

**Koniec kariery: decyzja 0/1 raz na sezon**
- Zawodnik kończący kontrakt decyduje 1 marca i ogłasza to w wiadomościach („Po sezonie kończy karierę”). Pozostali decydują 30 czerwca. Decyzja jest ostateczna: tak albo nie, bez stopniowego wygasania.
- Szansa z wieku (krzywa logistyczna): 33 lata ok. 23 %, 34 lata ok. 43 %, 35 lat ok. 65 %, 36 lat ok. 82 %, od 40 lat zawsze. Przed 31. rokiem życia 0 %.
- Bramkarz gra ok. 2 lata dłużej.
- Szansę zwiększają: brak kontraktu na kolejny sezon (+20 p.p.), mało gry (+10 p.p.), poziom wyraźnie poniżej ligi (x1,6) oraz ciężka kontuzja (od 28 lat).
- Szansę zmniejszają: wciąż wysoki poziom (x0,6) i osobowość lidera.
- Część emerytów zostaje w klubie jako trener młodzieży lub skaut (później, opcjonalnie).

**Co gracz widzi na rynku transferowym**

| Lista | Kto na niej jest | Cena |
|---|---|---|
| Lista transferowa | Zawodnicy wystawieni przez kluby AI, z powodem: nadmiar na pozycji, poza kadrą meczową, chce odejść, zbyt wysoka pensja, nie przedłuży kontraktu | Wartość x1,0-1,2 |
| Do wypożyczenia | Młodzi (do 21 lat) z małą liczbą minut | Część pensji |
| Wolni zawodnicy | Zwolnieni, z wygasłym kontraktem i generowani co okno | Bez odstępnego, tylko pensja i premia za podpis |
| Wszyscy zawodnicy (wyszukiwarka) | Każdy zawodnik w grze | Wartość x1,3-1,6, do tego mnożnik reputacji. Trzech najlepszych w klubie „nie na sprzedaż”, chyba że ma klauzulę odstępnego |

Dokładność atrybutów na wszystkich listach zależy od poziomu skautingu (rozdział 9.9 eksperta).

**Kiedy klub AI wystawia zawodnika:** raz w tygodniu w oknie oraz przy planowaniu lata. Analizuje najsłabszych w każdej grupie pozycji:
- **sprzedaż:** nadmiar na pozycji i słaby poziom, niezadowolenie albo co najmniej dwa powody naraz;
- **wypożyczenie:** młody zawodnik bez gry;
- **zwolnienie (rozwiązanie kontraktu):** zawodnik od 31 lat, wyraźnie słabszy od ligi i bez chętnych. Tylko w oknie albo gdy kadra przekracza 30 zawodników;
- **ochrona minimum:** klub nigdy nie wystawia tylu zawodników, by grupa spadła poniżej minimum (bramkarze 3, obrońcy 6, pomocnicy 6, napastnicy 3). Klub AI najpierw kupuje następcę, potem sprzedaje.

**Ochrona przed brakami (kontrola codzienna i przed każdym meczem)**
- Kadra pierwszej drużyny ma 22-30 zawodników, a zawsze co najmniej 3 bramkarzy (trzeci może być juniorem).
- Na mecz potrzeba co najmniej 16 dostępnych zawodników, w tym 2 bramkarzy.
- Niedostępni to: kontuzjowani, zawieszeni, wypożyczeni i powołani do reprezentacji (w 1L i 2L).
- Kolejność uzupełniania (bramkarze zawsze pierwsi):
  1. rezerwy (Legia II, Śląsk II) i juniorzy z drużyny B;
  2. akademia: każdy klub ma 6-10 juniorów (16-19 lat), co czerwca 3-5 nowych. Wychowanków można zgłosić zawsze;
  3. wolni zawodnicy, także poza oknem transferowym;
  4. transfer, tylko w oknie;
  5. awaryjnie **zawodnik czasowy z akademii**, generowany na miejscu: wiek 17-19, poziom ok. L-3, umowa do końca sezonu z możliwością przedłużenia.
- W meczu bez bramkarza na boisku (czerwona albo kontuzja, wszystkie zmiany wykorzystane) do bramki idzie zawodnik z pola, zgodnie z przepisami.
- Klub gracza dostaje ostrzeżenie o brakach i przycisk „Uzupełnij z akademii”. Jeśli przed meczem nadal brakuje zawodników, asystent uzupełnia skład automatycznie, żeby mecz się odbył.
- Test wielosezonowy (etap 10): żaden klub w 10 sezonach nie gra meczu bez 2 dostępnych bramkarzy ani z mniej niż 16 zawodnikami.

### 2.6 Negocjacje kontraktów (decyzja użytkownika)

Pełna specyfikacja: `docs/negocjacje.md`. Kod: `src/career/personality.js`, `src/career/negotiation.js`, `src/career/negotiationLines.js`, testy: `tests/negotiation.test.mjs`.

- **Charakter zawodnika:** 11 cech 1-20 (m.in. chciwość, ambicja, lojalność, ego, cierpliwość, temperament, przywiązanie do miasta i rodziny, potrzeba gry), powiązanych z osobowością i ukrytymi atrybutami.
- **Agent:** 4 typy (twardy rekin, rozsądny, agent z rodziny, bez agenta).
- **Nastawienie:** 7 mindsetów (np. budowanie kariery, ostatni duży kontrakt, chce wrócić do domu) z własnymi wagami elementów oferty.
- **Rozmowy w rundach:**
  - zawodnik ma ukryte oczekiwania i minimum;
  - nastrój zmienia się w każdej rundzie;
  - odpowiedzi to akceptacja, kontroferta z liczbami, żądanie, ultimatum albo zerwanie;
  - agent czasem blefuje, a gracz może sprawdzić blef kosztem nastroju;
  - 128 kwestii po polsku dobieranych do charakteru i nastroju.
- **Fiasko:** blokada rozmów na 2-12 tygodni, a przy skrajnym obrażeniu do końca okna albo sezonu. Pamięć urazy wygasa o połowę co 90 dni. Przy przedłużeniu dochodzi spadek morale i możliwa prośba o transfer.
- **Obietnice roli:** zapisywane w kontrakcie i sprawdzane co miesiąc. Złamana obietnica obniża zaufanie i morale i podraża kolejne rozmowy.
- **AI:** ta sama logika, maks. 2 rundy.

## 3. Silnik meczowy w skrócie

Pełne wzory są w `ekspert_futbol.md`, rozdział 6. Kolejność obliczeń:

1. **Przed meczem:** siły stref (obrona, pomoc, atak, bramkarz, stałe fragmenty) z 11 zawodników, kara za grę poza pozycją, a potem modyfikatory: atut boiska, pogoda, murawa, ranga, sędzia, morale, forma dnia, zgranie, formacja kontra formacja.
2. **Każda minuta:** posiadanie, spalony, faul i kartka, akcja (atak pozycyjny, skrzydło, kontra, strzał z dystansu), przełamanie, strzał z xG, gol. Do tego zdarzenia tła: kontuzja, VAR, zmęczenie, decyzje AI.
3. **Stan meczu od 65. minuty:** prowadzący się cofa, przegrywający ryzykuje.
4. **Po meczu:** oceny 1-10, statystyki, kartki i zawieszenia, kontuzje, forma, morale, zgranie.
5. **Dogrywka i karne:** 2 x 15, dodatkowa zmiana i okno, seria ABAB z pełną symulacją: wybór strzelców wg atrybutów i zmęczenia, bramkarz, presja.

### 3.1 Zdarzenia meczowe, statystyki, momentum, posiadanie (decyzja użytkownika)

Silnik generuje pełną listę zdarzeń, z której powstają statystyki meczu. Zdarzenia są lekkie: liczniki i krótkie wpisy, bez fizyki piłki.

| Zdarzenie | Jak powstaje w pętli minuty | Na boisku i w relacji |
|---|---|---|
| Podania (udane i nieudane) | Liczba podań w minucie z udziału w posiadaniu i stylu: krótkie ok. 1,25x, długie ok. 0,8x. Celność z POD, TEC i DEC podających minus presja rywala (pressing, agresja) | Tylko statystyka; ikony przesuwają się zgodnie z posiadaniem |
| Kluczowe podania i asysty | Ostatnie podanie przed strzałem; wykonawca ważony WIZ i POD | W relacji przy strzale i golu |
| Odbiory, przechwyty, wybicia | Zakończenie akcji bez przełamania; wykonawca ważony ODB, UST, PRA | Statystyka zawodnika |
| Auty | Z nieudanych akcji skrzydłami i części strat (ok. 40-45 na mecz [SZAC]) | Krótki wpis |
| Rzuty od bramki | Z niecelnych i chybionych strzałów rywala | Krótki wpis |
| Rzuty wolne | Każdy faul i spalony daje wolny; groźny wolny (blisko pola karnego) może dać strzał | W relacji groźne wolne |
| Rzuty rożne | Z obronionych i zablokowanych strzałów oraz części nieudanych przełamań | Wpis, czasem strzał głową |
| Strzały celne, niecelne, zablokowane | Z modelu xG eksperta (celne ok. 9, łącznie ok. 25 [kalibracja]) | Wpis z nazwiskiem i xG |
| Obrony bramkarza | Celny strzał bez gola | Wpis przy groźnych strzałach |
| Spalone | Z kalibracji (ok. 4 na mecz) | Wpis, czasem anulowany gol po VAR |
| Faule, kartki, karne, VAR, kontuzje, zmiany | Jak w raporcie eksperta i sędziego | Wpis i ikona |
| Słupek i poprzeczka | Część niecelnych strzałów z wysokim xG (ok. 3 %) | Wpis |

**Statystyki meczu** (ekran w przerwie i po meczu, porównanie dwóch drużyn): posiadanie %, strzały (celne, niecelne, zablokowane), xG, podania (liczba i celność %), kluczowe podania, rożne, auty, wolne, spalone, faule, żółte i czerwone, obrony, odbiory, przechwyty, dystans przebiegnięty [SZAC z kondycji i instrukcji].

**Posiadanie piłki:** w każdej minucie silnik liczy udział posiadania (wzór eksperta, zakres 25-75 %). Na ekranie widać łączne posiadanie i posiadanie z ostatnich 10 minut.

**Pasek momentum:**
- W każdej minucie liczymy zagrożenie każdej drużyny: `T = 1*akcja + 3*przełamanie + 6*xG strzału + 2*rożny + 2*groźny wolny`.
- Momentum minuty: `m = clamp((T_dom - T_gość) * 12, -100, 100)`, wygładzone średnią ruchomą z 3 minut.
- Na ekranie: wykres słupkowy pod tablicą LED, 1 słupek na minutę, w górę w kolorze gospodarza i w dół w kolorze gościa. Gole, kartki i zmiany są zaznaczone ikonami na osi czasu.
- Momentum wpływa też na grę, lekko: drużyna z 5-minutową przewagą momentum dostaje do +0,15 do pAct, a stracony gol daje krótki spadek zaangażowania. Dzięki temu widać "fale" meczu.

**Koszt:** około 30 dodatkowych liczb na minutę i lista zdarzeń poniżej 400 wpisów na mecz. Szybka symulacja (mecze w tle) daje tylko wynik, strzelców i podstawowe statystyki z rozkładów spójnych z pełnym silnikiem.

**Cele dodatkowe do kalibracji [SZAC, do sprawdzenia w danych Ekstraklasy]:** podania ok. 380-450 na drużynę, celność 75-82 %, auty 40-45, rzuty od bramki 14-18, rzuty wolne ok. 30, obrony bramkarzy ok. 6 na mecz łącznie.

### 3.2 Gra poza pozycją i bez bramkarza (decyzja użytkownika)

Kod: `src/engine/positions.js`, testy: `tests/positions.test.mjs`. Gracz i AI korzystają z tych samych funkcji.

**Biegłość na pozycji (0-100):**
- naturalna pozycja ma 100;
- pozycje pokrewne mają 70-85, np. defensywny pomocnik jako środkowy pomocnik albo boczny obrońca jako wahadłowy;
- pozycje odległe mają 20-45, np. napastnik jako środkowy obrońca;
- zawodnik z pola w bramce ma 8, a bramkarz w polu 15;
- zła strona boiska (prawonożny na lewej obronie) daje -12, a obunożny nic nie traci;
- trening i mecze na nowej pozycji podnoszą biegłość, ale najwyżej do 90. Nigdy nie da się „nauczyć” zawodnika z pola gry w bramce.

**Kary w silniku:**

| Kara | Wzór | Przykład |
|---|---|---|
| Wkład w siłę stref | `0.55 + 0.45*(biegłość/100)^0.8` | 85 daje 94 %, 50 daje 80 %, 20 daje 66 % |
| Ryzyko błędów (strata prowadząca do strzału, źle ustawiona linia spalonego, faul taktyczny) | `1 + (100-biegłość)/100 * 1.2` w obronie, `* 0.6` w ataku | napastnik na środku obrony popełnia błędy ok. 1,9 razy częściej |
| Zgranie całej drużyny | `(85 - średnia biegłość) * 0.03` punktu atrybutu dla każdego zawodnika | 4 napastników w obronie: ok. -0,35 dla całej drużyny |
| Brak struktury | mniej niż 3 obrońców: +0,6 punktu kary za każdego brakującego | formacja z 1 obrońcą: -1,2 dla całej drużyny |

**Gra bez bramkarza** (zawodnik z pola w bramce): bardzo duża kara.
- Każdy celny strzał rywala wpada 1,7-1,95 razy częściej. Wysoki i skoczny zawodnik broni trochę lepiej.
- Rywal 1,6 razy częściej strzela z dystansu, a dośrodkowania i rożne są groźniejsze (x1,3-1,4).
- Cel kalibracji: ok. +1,5 straconego gola na 90 minut w porównaniu z normalnym bramkarzem. Sprawdzi to test silnika w etapie 3.
- Bramkarz w polu również jest słaby (biegłość 15), więc zamiana bramkarza z napastnikiem nic nie daje.

**Blokady „cheatów”:**
- Skład musi mieć dokładnie 11 zawodników i dokładnie jednego bramkarza. Zawieszeni i duplikaty nie przejdą walidacji.
- Zawodnik z pola w bramce jest dozwolony, bo pozwalają na to przepisy. Jeśli na ławce jest prawdziwy bramkarz, gra wyświetla ostrzeżenie z wysokością kary.
- Przesuwanie zawodników między pozycjami w trakcie meczu liczy się jako zmiana taktyczna: obniża spójność, a zmiana co kilka minut kosztuje podwójnie (bezwładność z rozdziału 4.3 eksperta).
- Gra z kontuzją jest dozwolona: cechy fizyczne -15 % i ryzyko pogłębienia urazu.
- AI wybiera skład tą samą funkcją oceny. Zawodnika z pola stawia w bramce tylko wtedy, gdy nie ma żadnego bramkarza, i wybiera wtedy najwyższego oraz najbardziej skocznego.
- Ekran składu pokazuje graczowi ostrzeżenia przed meczem, np. „Nowak gra poza pozycją (ŚO): skuteczność 66 %”.

Cele kalibracji (test automatyczny, 10 000 meczów):

| Statystyka | Cel |
|---|---|
| Gole na mecz | 2,7-2,9 |
| Gospodarz / remis / gość | 44-46 / 25-28 / 27-30 % |
| Strzały / celne | 24-25 / 8-9 |
| Żółte / czerwone | 4,2-4,4 / 0,15-0,2 |
| Karne | 0,28-0,32 |
| Doliczony czas | 1. połowa ok. 3, 2. połowa ok. 6-7 |

## 4. Architektura

```text
manager-pilkarski/
  index.html, manifest.webmanifest, sw.js
  src/
    config/        rozgrywki, kalendarz, balans (jeden plik na temat, JSON)
    data/          kluby PL, kluby UEFA, pule imion wg narodowości
    world/         generator świata, zawodników, sędziów
    engine/        match.js (minutowy), quick.js (Poisson), rules.js (reguły twarde),
                   ai_manager.js, penalties.js
    season/        terminarz, harmonogram i konflikty, tabele, losowania,
                   awanse i spadki, przejście sezonu
    career/        transfery, kontrakty, trening, rozwój, finanse, zarząd
    ui/            ekrany i komponenty
    store/         IndexedDB, 3 sloty, autozapis, eksport JSON
  tests/           kalibracja, niezmienniki kalendarza, reguły
```

- Vanilla JS z modułami ES, bez frameworka i bez kroku budowania (pliki serwowane wprost). Canvas 2D tylko dla boiska.
- Deterministyczny RNG z ziarnem (mulberry32). Restart nie zmienia wyniku.
- Web Worker dla symulacji kolejek i generowania świata.
- Budżet wydajności: minuta meczu poniżej 1 ms, kolejka 3 lig poniżej 50 ms, zapis poniżej 2 MB po sezonie.

### 4.1 Rozbudowa bez przebudowy silnika (decyzja użytkownika)

Każdy nowy atrybut, cecha albo logika ma się dać dodać w jednym miejscu. Zasady obowiązują wszystkie moduły:

| Mechanizm | Jak działa | Jak dodać coś nowego |
|---|---|---|
| **Rejestr modyfikatorów** (`src/engine/modifiers.js`, działa) | Silnik nie zna poszczególnych cech. Pyta rejestr o sumę wpływów na zawodnika (`player`), drużynę (`team`) i mecz (`match`). Każdy wpis trafia do rozbicia siły, więc studio i raport asystenta pokażą jego wpływ | Jeden wpis `registerModifier({ id, scope, apply })`. Test sprawdza, że nowa cecha „chemia” działa bez zmiany silnika |
| **Atrybuty jako słownik** | Zawodnik ma `attr: { POD: 12, ... }`, a nie stałe pola. Generator czyta listę atrybutów i profile pozycji z danych | Dopisanie atrybutu do listy i profili pozycji. Opcjonalnie modyfikator |
| **Dziennik zdarzeń meczu** (`src/engine/matchStats.js`, działa) | Silnik zapisuje zdarzenia. Statystyki, oceny, relacja, momentum i studio liczą się wyłącznie z dziennika | Nowy typ zdarzenia i jedna gałąź w funkcji liczącej. Silnik i UI bez zmian |
| **Fazy minuty jako lista** | Pętla minuty to lista faz (posiadanie, spalony, faul, akcja, zdarzenia tła). Każda faza to osobna funkcja `(stan, rng) => zdarzenia` | Nowa faza (np. pogoda zmieniająca się w trakcie) to nowy element listy |
| **Hooki kariery** | Zdarzenia dnia (`onMatchEnd`, `onWeek`, `onMonth`, `onSeasonEnd`, `onWindowClose`) wywołują zarejestrowane systemy: morale, reputacja, obietnice, emerytury, rozwój, finanse | Nowy system rejestruje się na hook; kalendarz go nie zna |
| **Balans w konfiguracji** | Wszystkie liczby (stałe silnika, progi, kary) w `src/config/` i stałych modułów z oznaczeniem [SZAC] | Zmiana liczby, bez zmiany logiki. Testy kalibracji pilnują wyników |
| **Wersje zapisu i migracje** | `SAVE_VERSION` + lista funkcji migracji `v1 -> v2 -> ...` | Nowe pole dostaje wartość domyślną w migracji, więc stare zapisy dalej działają |
| **Testy kalibracji** | Każda zmiana musi przejść testy średnich (gole, 1X2, kartki, strzały) | Gdy test pęka, widać od razu, która zmiana rozjechała balans |

### 4.2 Wyniki i statystyki: zawsze z wyliczenia (decyzja użytkownika)

**Mecz gracza (pełny silnik):** każda statystyka ma swoje źródło w zdarzeniu, które naprawdę zaszło w symulacji. Wynik to liczba zdarzeń „gol” minus gole anulowane przez VAR. Posiadanie to średnia z posiadania w każdej minucie. Podania, auty, wolne i rożne są liczone ze zdarzeń. Test w etapie 3 sprawdza dla 10 000 meczów, że statystyki pokazane graczowi są równe przeliczeniu dziennika zdarzeń (`checkStatsInvariants`).

**Mecze w tle (szybka symulacja, `src/engine/quickSim.js`, działa):**
1. Z kadry wybierana jest najlepsza **dostępna** jedenastka. Kontuzjowani, zawieszeni i powołani wypadają, luki zapełniają zawodnicy poza pozycją z karą, a bez bramkarza działa kara bramkarska.
2. Siła stref (bramkarz, obrona, pomoc, atak, wykończenie) to OVR na pozycji plus modyfikatory: forma, **morale**, ostrość, świeżość, gra z urazem.
3. Dochodzi pewność siebie z tabeli: punkty ponad albo poniżej oczekiwań, od 4. kolejki, maks. ±0,15 punktu, żeby nie liczyć siły dwa razy.
4. Miejsce spotkania: średnia goli gospodarza 1,50, gościa 1,19, na neutralnym terenie 1,34.
5. Średnie bramek liczone ze wzoru eksperta, dopasowanego do pełnego silnika. Wynik losowany z rozkładu Poissona z korektą remisów (Dixon-Coles). Lepsza drużyna wygrywa częściej, ale nie zawsze, jak w prawdziwej piłce, a ziarno losowania jest stałe.
6. Statystyki wynikają z modelu: xG to wyliczona średnia, strzały wynikają z xG, celne z goli i strzałów, rożne ze strzałów, posiadanie z różnicy w pomocy, kartki z surowości sędziego i agresji, strzelcy ważeni wykończeniem i pozycją.

Wynik pomiaru na 20 000 meczów na każdą różnicę siły:

| Różnica siły | 1 / X / 2 | Gole | Strzały | Celne | Rożne |
|---|---|---|---|---|---|
| 0 | 43 / 27 / 30 % | 2,78 | 25,8 | 9,2 | 10,4 |
| +1 dla gospodarza | 59 / 24 / 17 % | 2,93 | 27,3 | 9,8 | 10,9 |
| +2 dla gospodarza | 73 / 17 / 9 % | 3,23 | 29,9 | 10,7 | 11,9 |

Żółte kartki po korekcie wynoszą ok. 4,3 na mecz. Czas: ok. 0,09 ms na mecz, więc cały sezon trzech lig, pucharów i reprezentacji w tle to poniżej 0,2 s.

### 4.3 Morale (`src/career/morale.js`, działa)

- Każdy zawodnik ma morale 1-20 (start 12). Wpływ na siłę w meczu: `0.04*(morale-10)` punktu atrybutu, czyli od -0,36 do +0,4.
- **Zmiany po meczu:**
  - wynik: wygrana +1,5, porażka -1,5;
  - sensacja (wygrana słabszego): +2,5, a porażka faworyta: -2,5;
  - derby: łącznie ±3;
  - seria 3 porażek: -2 dodatkowo;
  - własna ocena w meczu: do ±0,6;
  - ważny zawodnik 3 mecze bez gry: -1 za mecz.
- **Zdarzenia:** nowy kontrakt +3, odrzucona prośba o transfer -3, złamana obietnica -2,5, powołanie +1, gol w reprezentacji +1, publiczna pochwała +1, publiczna krytyka -1,5. Dochodzą odprawy i negocjacje.
- Co tydzień morale wraca w stronę 12 o 0,3, a z liderem w drużynie o 0,5.
- Morale drużyny to średnia 18 zawodników z największą liczbą minut. Opisy na ekranie: od „Bardzo słabe” do „Znakomite”.

## 5. Kalendarz i rozwiązywanie konfliktów

### 5.1 Priorytety terminów

| Priorytet | Rozgrywki | Czy można przesunąć |
|---|---|---|
| 1 | Puchary UEFA (wszystkie fazy) | Nigdy. Daty z kalendarza UEFA |
| 2 | Finały: Puchar Polski (May 2, 2027), Superpuchar | Nigdy |
| 3 | Rundy Pucharu Polski | Tylko w obrębie okna rundy (np. Oct 27-29) |
| 4 | Baraże ligowe | Tylko w obrębie okna baraży |
| 5 | Kolejki ligowe | Tak, wg algorytmu 5.2 |

Dodatkowe stałe: okna reprezentacyjne FIFA (Ekstraklasa nie gra, 1L i 2L wg konfiguracji), przerwa zimowa, minimum 2 pełne dni przerwy między meczami jednego klubu (czwartek UEFA, potem liga najwcześniej w niedzielę).

### 5.2 Algorytm przesunięcia meczu

```js
// Wywoływany, gdy mecz koliduje z meczem o wyższym priorytecie
// albo gdy zostaje odwołany (np. śnieg, murawa nie nadaje się do gry).
function reschedule(match, cal) {
  const deadline = deadlineFor(match, cal);
  // 1. Przesunięcie w obrębie okna kolejki (pt-pon), jeśli obie drużyny mają odpoczynek
  let slot = findInWindow(match, cal, match.round.window);
  // 2. Najbliższy wolny termin PO meczu, ale przed terminem granicznym
  if (!slot) slot = findNearest(match, cal, { from: match.date, to: deadline, direction: 'forward' });
  // 3. Najbliższy wolny termin PRZED meczem (rozegranie awansem)
  if (!slot) slot = findNearest(match, cal, { from: match.round.prevWindowEnd, to: match.date, direction: 'backward' });
  // 4. Ostateczność: dzień środka tygodnia z minimalnym odpoczynkiem 2 dni
  if (!slot) slot = findNearest(match, cal, { from: match.date, to: deadline, minRest: 2, allowMidweek: true });
  if (!slot) throw new CalendarError(match);   // nie powinno wystąpić; test to wyłapie
  cal.move(match, slot);
  validateInvariants(cal);
}

function deadlineFor(match, cal) {
  if (match.comp.type === 'league') {
    // zaległy mecz musi się odbyć przed dwiema ostatnimi kolejkami (grane jednocześnie)
    return cal.roundStart(match.comp, match.comp.rounds - 1) - 1;
  }
  // mecz pucharowy: przed następną rundą tych samych rozgrywek, z zapasem na losowanie
  return cal.nextRoundStart(match.comp, match.round) - match.comp.minGapBeforeNextRound;
}
```

`findNearest` szuka dnia, w którym:
- obie drużyny mają co najmniej 2 dni przerwy przed meczem i po meczu;
- żadna z nich nie gra meczu o wyższym priorytecie;
- dzień nie wypada w oknie FIFA ani w przerwie zimowej;
- preferowane są środa i wtorek, potem pozostałe dni.

### 5.3 Niezmienniki (test po każdej zmianie kalendarza)

1. Żaden klub nie gra dwóch meczów w odstępie mniejszym niż 2 dni.
2. Mecz rundy N pucharu odbywa się przed pierwszym meczem rundy N+1 tych samych rozgrywek (przykład użytkownika: 1/8 nigdy po 1/4).
3. Losowanie rundy N+1 odbywa się po rozegraniu wszystkich meczów rundy N.
4. Dwie ostatnie kolejki ligi rozgrywane są w jednym terminie.
5. Mecze UEFA i finały mają daty identyczne z konfiguracją.
6. Każdy zaległy mecz ma datę przed swoim terminem granicznym.

Test generuje 1 000 losowych sezonów (różne kluby w pucharach, różne odwołania meczów) i sprawdza wszystkie niezmienniki.

### 5.4 Puchary UEFA w grze

- Kalendarz 2026/27 pochodzi z raportu sędziego, rozdział B6. Pozycje oznaczone jako niepewne trzymamy w konfiguracji.
- Polskie kluby 2026/27: Lech (LM Q2, ścieżka mistrzów), Górnik Zabrze (LM Q2, ścieżka ligowa), Jagiellonia (LE Q3), Raków i GKS Katowice (LK Q2). Agent UEFA to weryfikuje.
- Przegrani w eliminacjach spadają do niższych rozgrywek wg reguł UEFA.
- Losowanie fazy ligowej: koszyki wg współczynnika, bez rywali z tego samego kraju, maks. 2 rywali z jednego kraju. Algorytm zachłanny z ponawianiem.
- Dynamiczny ranking krajowy z 5 sezonów decyduje o liczbie miejsc i rundach wejścia w kolejnych sezonach.

**Kwalifikacja polskich klubów na kolejny sezon** (kod: `src/season/europeAccess.js`, testy w `tests/europeAccess.test.mjs`):
- Miejsca dają końcowa tabela Ekstraklasy i Puchar Polski. Mistrz i wicemistrz idą do LM, zdobywca PP do LE, a 3. i 4. drużyna do LK. Liczba miejsc i rundy wejścia zależą od rankingu krajowego UEFA.
- **Bez dublowania** (decyzja użytkownika): jeśli zdobywca PP ma już miejsce z ligi, miejsce w LE dostaje przegrany finalista PP. Przykład: Lech wygrywa ligę i PP, więc gra w LM, a przegrany finał PP gra w LE. Jeśli finalista też ma już miejsce z ligi albo nie ma prawa gry, LE dostaje najwyżej sklasyfikowany klub bez kwalifikacji. Miejsca LK przesuwają się w dół tabeli i żaden klub nie dostaje dwóch miejsc.
- Uwaga: UEFA od 2015 daje to miejsce klubowi z ligi, a nie finaliście, i tak przydzielono miejsca na 2026/27 (Jagiellonia do LE). Przydział 2026/27 bierzemy z rzeczywistości, a reguła z finalistą działa od 2027/28. Przełącznik `cupFallback` w kodzie pozwala wrócić do reguły UEFA.
- Zdobywca PP z 1 Ligi też gra w LE. Klub bez prawa gry (rezerwy, flaga licencji) jest pomijany i miejsce przechodzi dalej.
- Ranking krajowy liczony co sezon z wyników polskich klubów (5 lat) zmienia rundy wejścia: na 12. miejscu mistrz wchodzi do play-off LM. Tabele dla pozycji innych niż 13-15 są założeniem (nowa lista dostępu UEFA 2027-2030) i siedzą w konfiguracji.
- Po zakończeniu sezonu gracz widzi ekran „Europejskie puchary 2027/28” z listą polskich klubów, rozgrywkami, rundą wejścia i powodem kwalifikacji („1. miejsce”, „Puchar Polski”, „miejsce po zdobywcy PP”).

**Struktura eliminacji w grze (uproszczenie):** każda runda eliminacji ma 14 drużyn (7 par), a runda 2. LK 28 drużyn. LM: Q1 14 klubów, Q2 7 zwycięzców + 7 nowych (w tym Lech i Górnik), Q3 i PO tak samo, faza ligowa 29 bezpośrednio + 7 z PO. LE: Q3 7 przegranych LM Q2 + 7 nowych (w tym Jagiellonia), PO 7 zwycięzców + 7 przegranych LM Q3, faza ligowa 22 + 7 + 7 przegranych LM PO. LK: Q1 14, Q2 7 zwycięzców + 7 przegranych LM Q1 + 14 nowych (Raków, GKS), Q3 14, PO 7 + 7 przegranych LE Q3, faza ligowa 22 + 7 + 7 przegranych LE PO. Przydział klubów do rund wejścia wg etykiety 2026/27 z `kluby_uefa.json` i współczynnika. Losowanie rundy odbywa się dzień po ostatnim meczu rund, z których przychodzą drużyny (test pilnuje, że zawsze przed pierwszym meczem rundy).

**Ekran pucharów europejskich** (zakładki LM, LE, LK w Rozgrywkach):
- **Terminarz:** pełny, z datami i godzinami (LM wt/śr 18:45 i 21:00, LE i LK czw 18:45 i 21:00). Widok wg rundy albo wg dnia, z filtrami „tylko polskie kluby” i „mój klub”. Rozegrane mecze mają wynik, a dwumecze sumę bramek i ewentualne karne.
- **Losowania, które gracz może obejrzeć:** eliminacje Q1-PO (rozstawieni i nierozstawieni wg współczynnika, ochrona przed rywalami z tego samego kraju), faza ligowa (4 koszyki po 9, każda drużyna dostaje 2 rywali z każdego koszyka, maks. 2 z jednego kraju), play-off fazy pucharowej i drabinka do finału.
- **Sposób oglądania:** przed każdym losowaniem gra pyta „Pokaż losowanie” albo „Pomiń”. Pokaz wyciąga kule po kolei (ok. 1 s na parę), z przyciskami „Przyspiesz” i „Pokaż wynik”. Po pominięciu od razu widać pary. Wynik losowania zawsze można otworzyć później z terminarza.
- **Tabele:** faza ligowa (36 drużyn, strefy 1-8, 9-24, 25-36 w kolorach), drabinka pucharowa, strzelcy, współczynnik UEFA klubów i krajów, ranking Polski z prognozą na kolejny sezon.
- **Powiadomienia:** dzień przed losowaniem z udziałem polskiego klubu oraz wyniki polskich klubów w podsumowaniu dnia.

**Pełne rozgrywki europejskie w tle** (decyzja użytkownika):
- Symulujemy wszystkie mecze LM, LE i LK: eliminacje od Q1, fazy ligowe, play-off, 1/8, 1/4, 1/2 i finały. Wyniki są w terminach z kalendarza UEFA.
- Mecze bez polskich klubów idą szybką symulacją Poissona w Web Workerze, w dniu meczowym, razem z kolejką ligi. Polskie kluby AI też grają szybką symulacją, a mecz gracza idzie pełnym silnikiem.
- Kadry zagranicznych klubów nie istnieją w tle. Przy szybkiej symulacji losujemy tylko strzelców z prostego rozkładu (nazwiska generowane deterministycznie z ziarna klubu), żeby była lista strzelców pucharów.
- Gracz widzi informacyjnie: tabele faz ligowych, drabinki, wyniki dnia, strzelców, ranking współczynników UEFA klubów i krajów. Ekran Rozgrywki dostaje zakładki LM, LE i LK.
- Koszt: ok. 300 meczów na sezon w trzech pucharach, poniżej 1 ms na mecz. Zapis po sezonie trzyma tylko wyniki i tabele (ok. 30 KB).

### 5.6 Terminarz reprezentacji

- Kalendarz reprezentacji jest częścią kalendarza gry: Liga Narodów 2026/27 (grupy, finały, baraże między ligami), eliminacje Euro 2028 od marca 2027, Euro 2028, a potem kolejne cykle (LN 2028/29, eliminacje MŚ 2030, MŚ 2030) generowane według wzorca.
- Wszystkie mecze reprezentacji UEFA idą w tle szybką symulacją. Siła reprezentacji to stała bazowa z rankingu plus średnia OVR powołanych zawodników z naszego świata, jeśli kraj ma ich wystarczająco dużo (głównie Polska).
- Gracz widzi informacyjnie: terminarz i wyniki Polski, tabele grup LN i eliminacji, a na ekranie zawodnika występy i gole w reprezentacji.
- Wyniki z prawdziwych meczów rozegranych przed startem gry nie są potrzebne, bo gra startuje w lipcu 2026. Wszystkie mecze od tego dnia są symulowane.
- Dane (okna FIFA, grupy, daty, siła 80 reprezentacji) zbiera agent; trafią do `src/data/reprezentacje.json`.

### 5.5 Reprezentacje w oknach FIFA

- Okna FIFA (wrzesień, październik, listopad, marzec, czerwiec) są w konfiguracji kalendarza. Ekstraklasa w nich nie gra. 1L i 2L grają, jeśli tak stanowi terminarz, więc powołany zawodnik opuszcza wtedy mecz klubu.
- **Powołania:** dla każdego kraju liczymy pulę zawodników tej narodowości w świecie gry.
  - Polacy: kadra 26 zawodników wybierana wg OVR i formy z całej gry.
  - Obcokrajowcy: szansa powołania z OVR zawodnika i siły reprezentacji jego kraju. Słabszy kraj powołuje słabszych zawodników.
  - Młodzieżówki (U21) dla zawodników do 21 lat z wysokim potencjałem, z niższym progiem OVR.
- **Skutki:**
  - zawodnik nie trenuje z klubem;
  - wraca ze zmęczeniem (świeżość -15 do -30 zależnie od minut);
  - ryzyko kontuzji ok. 3 % na okno;
  - morale +1 za powołanie i +1 za gola;
  - prestiż i wartość rynkowa rosną z liczbą występów;
  - powrót z daleka (np. Ameryka Południowa) daje dodatkowe -10 świeżości.
- **Mecze reprezentacji:** wynik pochodzi z szybkiej symulacji (rozdział 5.6). Minuty, gole i kontuzje powołanych zawodników losujemy z prostych rozkładów, spójnie z wynikiem. Kariera reprezentacyjna zawodnika (występy, gole) jest zapisywana.
- Powiadomienie przed oknem z listą powołanych zawodników klubu gracza.

## 6. Rezerwy i III liga

Szczegóły i 14 przypadków brzegowych: `ekspert_sedzia.md`, sekcja D.

- Legia II i Śląsk Wrocław II grają w 2 Lidze. Mają osobne kadry (pole `squad: 'B'`), w 75 % zawodnicy 17-21 lat, a ich mecze zawsze idą szybką symulacją.
- Przesuwanie zawodników między pierwszą drużyną a rezerwami jest bez kosztu. Obowiązuje 1 mecz na kolejkę na zawodnika, blokada podstawowych zawodników A w B oraz limit w ostatnich 4 kolejkach.
- **Reguła użytkownika** (zawsze aktywna): rezerwy co najmniej ligę niżej niż pierwsza drużyna. Spadek pierwszej drużyny do ligi rezerw wymusza spadek rezerw.
- **Reguła PZPN** (włączona decyzją użytkownika; tekst uchwały nieodczytany): rezerwy grają najwyżej w 2 Lidze. W konfiguracji `reserveMaxTier = 3`. Funkcja `reserveMayPlayIn()` sprawdza obie reguły naraz.
- Rezerwy na miejscu awansowym lub barażowym nie awansują i nie grają baraży. Miejsca liczymy po pominięciu rezerw: jeśli rezerwy są 4., do baraży wchodzi 7. drużyna.
- Liga zawsze ma 18 drużyn. Rezerwy przeniesione administracyjnie zastępują jeden spadek sportowy.
- Koniec sezonu idzie od góry: Ekstraklasa, 1L, baraże o 1L, 2L, na końcu awanse z III ligi. Walidacja: 18 drużyn w lidze, rezerwy poniżej rodzica i nie wyżej niż 2 Liga, żaden klub nie przesuwa się o więcej niż 1 poziom.
- III liga nie jest symulowana. Format awansu od 2024/25: 4 mistrzów grup awansuje bezpośrednio. 4 wicemistrzów gra jeden mecz w parach, a 2 zwycięzców gra dwumecz z 13. i 14. drużyną 2 Ligi. Wyniki III ligi losujemy z puli 38 realnych klubów (w tym 11 rezerw) z wagą siły 1-5.
- Rezerwy nie grają w Pucharze Polski (założenie).

## 7. Design (z umiejętności frontend-design)

**Temat wizualny:** polski stadion w dzień meczowy: koszona murawa w pasy, biała kreda, beton trybun i stara tablica wyników z bursztynowymi diodami LED.

**Kolory**

| Nazwa | Hex | Rola |
|---|---|---|
| Murawa | `#1E6B3A` | Boisko, aktywna zakładka |
| Murawa jasna | `#25793F` | Pasy koszenia na boisku i w wierszach tabel |
| Kreda | `#F3F6F1` | Linie boiska, tekst na murawie |
| Beton | `#D9DCD6` | Tło w trybie jasnym |
| Trybuna nocą | `#14211A` | Tło w trybie ciemnym |
| LED | `#FFB21A` | Wynik, czas, komunikat GOL. Tylko na żywo |
| Żółta kartka / czerwona kartka | `#F5C518` / `#D62839` | Wyłącznie znaczenie meczowe |

**Typografia:** Barlow Condensed do liczb, tabel i nagłówków (wąska, mieści tabele na wąskim ekranie). Barlow do tekstu. Doto (krój typu dot-matrix) wyłącznie na tablicy wyników i w napisie GOL. Czcionki są wbudowane w PWA, więc działają offline.

**Herby (miniaturki):** `assets/crests/<id>.webp` (128 px) i `<id>-48.webp` (48 px), przycięte do treści i wyśrodkowane na przezroczystym kwadracie. 28 prawdziwych herbów pochodzi z publicznego repozytorium GitHub `luukhopman/football-logos` (sezony 2023/24 do 2026/27). Rezerwy używają herbu pierwszej drużyny z plakietką „II”. Brakującym klubom gra rysuje zastępczą tarczę SVG w barwach klubu ze skrótem nazwy, dopóki nie dostanie prawdziwego herbu.

**Jeden mocny element:** tablica wyników LED na górze ekranu meczu. GOL wyświetla się na niej przez 3 sekundy pulsującymi diodami. Reszta interfejsu jest spokojna.

**Układ ekranu meczu (pionowy)**

```text
+------------------------------+
| LECH 1 : 0 LEGIA     67' LED |  tablica wyników
+------------------------------+
|                              |
|     boisko pionowe (canvas)  |  ikony z numerami,
|     pasy koszenia, kreda     |  ustawienie wg formacji
|                              |
+------------------------------+
| 64' Żółta: Kowalski (faul)   |  przewijane zdarzenia
| 61' GOL! Nowak (asysta ...)  |
+------------------------------+
| [Pauza] [x1 x2] [Wynik]      |
| [Zmiany] [Taktyka] [Okrzyk]  |  pasek sterowania kciukiem
+------------------------------+
```

**Nawigacja:** dolny pasek z 5 pozycjami: Kadra, Rozgrywki, Następny mecz (środek, wyróżniony), Transfery, Trening. Tabele mają naprzemienne pasy jak koszona murawa zamiast ramek i kart.

**Skalowanie: telefon najpierw, PC obsługiwany**

| Szerokość | Układ |
|---|---|
| do 599 px (telefon, główny cel) | Jedna kolumna, dolny pasek nawigacji, boisko pionowe, sterowanie kciukiem |
| 600-1023 px (tablet, telefon poziomo) | Boisko i zdarzenia obok siebie, nawigacja nadal na dole |
| od 1024 px (PC) | Boczny pasek nawigacji po lewej. Na ekranie meczu boisko pośrodku, a po bokach zdarzenia oraz panel zmian i taktyki. Tabele pokazują więcej kolumn. Szerokość treści ograniczona do ok. 1280 px |

- Boisko rysujemy w canvasie we współrzędnych logicznych 0-100. Rozmiar bufora to rozmiar elementu razy `devicePixelRatio` (maks. 2 na słabych telefonach), więc grafika jest ostra na każdym ekranie. `ResizeObserver` przelicza rozmiar przy obrocie i zmianie okna.
- Ikony zawodników i interfejs są wektorowe (SVG i CSS), bez bitmap do skalowania.
- Typografia płynna przez `clamp()`, cele dotykowe min. 44 px na telefonie, na PC dochodzi obsługa myszy i klawiatury (spacja to pauza, strzałki zmieniają prędkość, Esc zamyka panel).
- Test na trzech rozmiarach w każdym etapie z UI: 360 x 800 (telefon), 768 x 1024 (tablet), 1440 x 900 (PC).

**Sprawdzenie względem typowych szablonów:** paleta nie jest kremowa ani terakotowa, a bursztyn LED wynika z tematu (tablica wyników) i występuje tylko na żywo. Odrzuciłem karty z cieniem jako szablonowe i zastąpiłem je pasami murawy.

## 8. Etapy pracy

| Etap | Zakres | Kryterium odbioru |
|---|---|---|
| 0. Fundament | Szkielet PWA, konfiguracja, RNG, zapis IndexedDB, tokeny designu, dane klubów | Gra instaluje się na telefonie i działa offline |
| 1. Świat | Generator 54 klubów + rezerw, zawodnicy (27 atrybutów, profile pozycji), sędziowie | Bramkarze mają wyższe atrybuty bramkarskie niż napastnicy w 100 % przypadków. Średnia 1 Ligi wynosi 10 ± 0,1 |
| 2. Kadra i taktyka | Ekran kadry, wybór 11 + rezerwowi, 10 formacji na boisku, instrukcje | Walidacja składu (1 bramkarz, limit ławki, zawieszeni i kontuzjowani niedostępni) |
| 3. Silnik meczowy | Pętla minuty, siły stref, modyfikatory, pełne zdarzenia (podania, auty, wolne, rożne, strzały, spalone), statystyki, posiadanie, momentum, oceny, szybka symulacja | Test kalibracji z rozdziału 3 i 3.1 przechodzi |
| 4. Reguły meczu | Kartki, karne, VAR, kontuzje (z regułą 1 minuty), zmiany i okna, doliczony czas, dogrywka, seria karnych | 25 reguł twardych z testami jednostkowymi |
| 5. Ekran meczu | Tablica LED, pasek momentum, posiadanie na żywo, statystyki meczu, GOL 3 s z pauzą czasu, 1 min = 1 s, przycisk wyniku, zmiany i taktyka, okrzyki, przemowa w przerwie | Działa płynnie (30 fps) na telefonie średniej klasy |
| 6. AI managera | Zmiany, taktyka, osobowości, te same reguły co gracz | AI robi 3-5 zmian i nigdy nie łamie limitu okien |
| 7. Sezon krajowy | Terminarz 3 lig, tabele, statystyki (strzelcy, kartki, kontuzje, forma), Puchar Polski, Superpuchar, baraże | Pełny sezon symuluje się w poniżej 10 s |
| 8. Kalendarz, UEFA i reprezentacje | Harmonogram z konfliktami (rozdział 5), pełne LM/LE/LK w tle, losowania do oglądania, terminarz z datami, kwalifikacja z ligi i PP, terminarz i wyniki reprezentacji, powołania | Test 1 000 sezonów: zero naruszeń niezmienników. Pełny sezon z pucharami i reprezentacjami symuluje się w poniżej 15 s |
| 9. Kariera | Transfery, kontrakty, trening, rozwój, finanse, zarząd i zwolnienie | Sezon bez interwencji gracza nie powoduje bankructwa ani pustej kadry |
| 10. Wiele sezonów | Awanse i spadki z regułą rezerw, pula III ligi, starzenie, juniorzy, ranking UEFA | 10 sezonów symulacji bez błędów i bez rozjechania siły lig |
| 11. Szlif | Balans, dostępność, tryb ciemny, onboarding | Testy na 2 telefonach i lista poprawek |

Kolejność jest celowa. Po etapie 5 da się zagrać pojedynczy mecz, a po etapie 7 cały sezon ligowy.

## 8.1 Stan etapów (Nov 10, 2026)

| Etap | Stan | Uwagi |
|---|---|---|
| 0. Fundament | Gotowy | PWA offline, zapis 3 sloty, dane, poczta, upływ dni |
| 1. Świat | Gotowy | 54 kluby + akademie, 27 atrybutów, charakter, reputacja |
| 2. Kadra i taktyka | Gotowy | 10 formacji, 9 instrukcji, skład dwoma dotknięciami |
| 3. Silnik meczowy | Gotowy (bez ekranu) | `src/engine/match/`: fazy minuty, zdarzenia, statystyki ze zdarzeń, zmiany 5/3, taktyka z bezwładnością, okrzyki, AI trenera, dogrywka, karne, oceny |
| 4. Reguły meczu | Gotowy w silniku | Kartki, karne, VAR, kontuzje (1 minuta po opatrzeniu), doliczony czas z wydarzeń |
| 7. Sezon krajowy | Gotowy | Terminarz 3 lig (34 kolejki, weekendy, okna FIFA, ostatnie 2 kolejki jednocześnie), mecze w tle dzień po dniu, tabele z kryteriami, Superpuchar, Puchar Polski z losowaniami (III i IV liga), baraże, kartki i pauzy, kontuzje i regeneracja, przekładanie meczów ligi przy kolizji z pucharem |
| 5. Ekran meczu | Gotowy | Studio, odprawy, mecz na żywo (1 min = 1 s, x4, GOL 3 s, VAR 2 s), zmiany, taktyka i okrzyki, przerwa, dogrywka, studio pomeczowe, konferencja (`src/ui/matchdayView.js`, `src/match/matchday.js`) |
| 8. Kalendarz, UEFA i reprezentacje | Gotowy (sezon 2026/27) | LM, LE i LK od eliminacji do finału w tle (`src/season/uefa.js`): 148 prawdziwych klubów, losowania z rozstawieniem i ochroną krajową, faza ligowa (koszyki, maks. 2 rywali z kraju, 4 mecze u siebie), baraże 9-24, drabinka; przegrani eliminacji spadają do LE i LK. Mecze polskich klubów w terminarzu krajowym (`src/season/europe.js`), liga i PP przekładane wokół dat UEFA, mecz gracza na żywo z zagraniczną kadrą wylosowaną na sezon. Ekran: przebieg, tabela fazy ligowej, mecze, strzelcy, ranking krajów, pokaz losowania. Reprezentacje (`src/season/national.js`): Liga Narodów 2026/27 (grupy, ćwierćfinały, baraże A/B i B/C, Final Four), losowanie i mecze eliminacji Euro 2028, powołania z naszego świata (senior i U21) ze skutkami. Sezon z pucharami i reprezentacjami: ok. 1,7 s |
| 9. Kariera | Gotowy (sezon 2026/27) | Finanse (`src/career/finance.js`): przychód bazowy ok. 1,35 x płace, bilety z frekwencji, TV, sponsorzy, nagrody (PP, UEFA ze skalą gospodarki 0,08, miejsce w lidze), pensje co tydzień, koszty klubu, budżety transferowy i płac. Rynek (`src/career/transfers.js`): lista transferowa, wypożyczenia, wolni zawodnicy, wyszukiwarka, oferty dla klubów AI (przyjęcie, kontroferta, odrzucenie, przerwa po 3 odrzuceniach), trzech najlepszych nie na sprzedaż poza klauzulą, zgoda zawodnika z reputacji, ekran rozmów z agentem (`src/ui/negotiationView.js`), przedłużenia, wystawianie i rozwiązywanie kontraktów, oferty AI za zawodników gracza (decyzje w poczcie, wygasają same), transfery między klubami AI (ok. 35-45 na sezon), przedłużenia AI od stycznia. Zarząd (`src/career/board.js`): cel sezonu, ocena co miesiąc, zwolnienie przy zaufaniu poniżej 18 od października z ofertami pracy, propozycje z lepszych klubów, reputacja trenera. Test: sezon bez decyzji gracza bez bankructw i braków w kadrach |
| 10. Wiele sezonów | Gotowy | Zamknięcie sezonu 1 lipca (`src/season/rollover.js`): awanse i spadki ze stref tabeli i baraży, pula III ligi (4 zwycięzców grup, wicemistrzowie w barażu z 13. i 14. drużyną 2 Ligi), obie reguły rezerw z ratowaniem klubu ze spadku (`src/season/leagues.js`), spadkowicze do III ligi tracą stałą kadrę, beniaminkowie dostają kadry. Kontrakty wygasają, emerytury 0/1, starzenie, nabór 3-5 juniorów, powroty z wypożyczeń, uzupełnianie kadr, pula zagranicznych zawodników co lato. Nowe budżety, cel i ocena zarządu, automatyczne zwolnienie po spadku klubu gracza do III ligi (decyzja użytkownika). Ranking krajów UEFA i miejsca w pucharach z `europeAccess`, Superpuchar mistrz i zdobywca PP. Kalendarz kolejnych lat: przesunięcie o pełne tygodnie, okna FIFA z danych reprezentacji. Historia sezonów w Rozgrywkach. Test 10 sezonów (`tools/multiseason.mjs`): siła lig stabilna (Ekstraklasa 11,66 -> 11,62, 1 Liga 10,14 -> 9,89, 2 Liga 8,49 -> 8,48), bez długów, ok. 2,1 s na sezon |
| Trening (część etapu 9) | Gotowy | Moduł eksperta (`src/training/`, opis w `docs/trening.md`): mikrocykl tygodnia, obciążenia (ACWR), urazy treningowe, zgranie zespołu, analiza rywala, stałe fragmenty, sztab, rozwój i spadek formy z wiekiem |

Niższe ligi (dane): III liga 72 drużyny w 4 grupach, IV liga 276 drużyn w 16 grupach (`src/data/clubs_l3.js`, `clubs_l4.js`, generowane z `tools/data/*.txt` przez `node tools/build-lower-leagues.mjs`). Kluby niższych lig nie mają stałych kadr: kadra jest losowana na mecz (`src/world/ephemeral.js`), stała w danym sezonie.

Kalibracja silnika (3000 meczów Ekstraklasy na wygenerowanych kadrach): 2,72 gola, 25 strzałów, 8,9 celnych, 9,7 rożnego, 27 fauli, 4,4 żółtej, 0,19 czerwonej, 4,5 spalonego, 0,29 karnego, ok. 430 podań na drużynę (81 %), 44 auty, wygrane gospodarzy 44,6 %, remisy 25,3 %, 54 % goli w drugiej połowie, doliczony czas 2,5 i 7,1 min, 4,1 zmiany na drużynę, ok. 3 ms na mecz.

## 9. Otwarte kwestie

1. Kluby UEFA: 156 klubów i 55 krajów w `src/data/kluby_uefa.json` (opis w `docs/kluby_uefa.md`). 134 współczynniki to szacunki, bo kassiesa.net jest zablokowane w sieci sesji. Mediana siły LM wynosi 14,6 zamiast ok. 14 (do dostrojenia w testach balansu).
2. Domeny wikipedia.org, pzpn.pl i theifab.com są zablokowane w ustawieniach sieci tej sesji. Część danych pochodzi z fragmentów wyników wyszukiwania i ma oznaczenie niepewności.
3. Reprezentacje: 81 drużyn (55 UEFA, 26 spoza Europy), grupy i terminarz Ligi Narodów 2026/27 (Polska w B4: Szwecja, Bośnia i Hercegowina, Rumunia), eliminacje Euro 2028 i wzorzec kolejnych cykli w `src/data/reprezentacje.json` (opis w `docs/reprezentacje.md`). Wartości Elo i większość pozycji w rankingu FIFA to szacunki.
4. Okna FIFA 2026/27 są w `src/config/calendar2026.js`. Okno Sep 21 - Oct 6, 2026 jest połączone, dlatego 2. kolejka LM jest Oct 14, a test pilnuje, by żaden mecz UEFA nie wypadł w oknie. Daty z 2027 pochodzą ze źródeł wtórnych.
