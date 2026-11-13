# Sytuacje meczowe: katalog, przepisy, zachowanie trenera i stan silnika

Stan na Nov 11, 2026. Burza mózgów panelu: trener pierwszej ligi (decyzje z ławki), analityk meczowy (statystyki i wzorce), instruktor sędziów FIFA/IFAB (przepisy). Dla każdej sytuacji: co dzieje się naprawdę, co robił silnik przed tą zmianą (sprawdzone w kodzie i eksperymentami na kopii HEAD) i co robi teraz.

Kod: `src/engine/match/core.js` (zdarzenia), `control.js` (reguły zmian i taktyki), `coach.js` (AI trenera i asystent gracza, nowy plik), `teams.js` (sloty, kształty w osłabieniu), `match.js` (przebieg meczu, dogrywka, karne). Testy: `tests/situations.test.mjs` (14 scenariuszy), `tests/matchEngine.test.mjs` (kalibracja).

Decyzje trenera z przebiegu meczu (kto przeważa, sposób gry rywala, zmęczenie, kartki, osobowość, okrzyki AI) opisuje osobny katalog: `docs/ai-trener.md` (Nov 11, 2026).

Oznaczenia statusu: **OK** silnik robi to realistycznie, **CZĘŚCIOWO** robi to w uproszczeniu albo z błędem, **BRAK** nie robi. Liczby balansowe w kodzie mają oznaczenie [SZAC].

## Podsumowanie

| | OK | CZĘŚCIOWO | BRAK | Razem |
|---|---|---|---|---|
| Przed (HEAD, Nov 11, 2026) | 36 | 29 | 45 | 110 |
| Teraz | 104 | 3 | 3 | 110 |

Najważniejsze błędy znalezione przed zmianą:
1. **Kontuzja bramkarza z rezerwowym na ławce dawała dwóch bramkarzy na boisku.** Silnik wstawiał do bramki zawodnika z pola, a potem rezerwowy bramkarz wchodził na slot BR. Zawodnik z pola zostawał w bramce, a jego pozycja w polu była pusta.
2. **Czerwona kartka bramkarza: rezerwowy bramkarz nigdy nie wchodził.** Do końca meczu bronił zawodnik z pola wybrany po atrybutach bramkarskich (często najlepszy środkowy obrońca).
3. **„Ofensywna zmiana” AI w 96 % przypadków wprowadzała pomocnika, nie napastnika** (19 z 466 zmian w 400 meczach), a wchodzący zawsze zajmował slot schodzącego, więc napastnik grałby jako defensywny pomocnik.
4. **AI w ogóle nie reagowało na czerwone kartki** (3 zmiany taktyki w ciągu 2 minut po 78 czerwonych kartkach; teraz 86 na 93).
5. Stałe `varPenAdd` i `varRedAdd` istniały, ale nie były używane: VAR nigdy nie dyktował karnego ani nie dawał czerwonej.

## A. Dyscyplina

| # | Sytuacja | Przepisy i zachowanie trenera | Silnik przed | Przed | Silnik teraz | Teraz |
|---|---|---|---|---|---|---|
| 1 | Żółta kartka za faul | Law 12: faul lekkomyślny | Losowanie na faul, mnożniki sędziego, atutu boiska, temperamentu | OK | Bez zmian; zdarzenie `yellow` ma `reason` | OK |
| 2 | Żółta za niesportowe zachowanie, protesty | Law 12; od 2025/26 do sędziego podchodzi tylko kapitan | Stała szansa na minutę | OK | Bez zmian | OK |
| 3 | Żółta za grę na czas | Opóźnianie wznowienia, zwykle przy prowadzeniu | Przy instrukcji „gra na czas” i prowadzeniu | OK | Bez zmian | OK |
| 4 | Druga żółta, czerwona | Druga żółta = wykluczenie, pauza 1 mecz | Czerwona z tekstem „druga żółta”; studio rozpoznawało ją wyrażeniem regularnym | CZĘŚCIOWO | `red` z `second: true`, `reasonCode: 'second'` | OK |
| 5 | Bezpośrednia czerwona: powód | DOGSO, rażący faul (SFP), gwałtowne zachowanie, ręka na linii; od powodu zależy długość pauzy | Zawsze „brutalny faul”, bez kodu, więc studio dawało 1 mecz pauzy | CZĘŚCIOWO | `reason` w kodach studia: `dogso`, `ręka`, `rażący` (2 mecze), `przemoc` (3 mecze) | OK |
| 6 | Faul taktyczny przerywający kontrę | Law 12: przerwanie korzystnego ataku (SPA) to żółta. Trenerzy uczą tego „sprytu” | Brak | BRAK | Przy groźnej kontrze obrońca lub DP może faulować: częściej przy twardej grze i prowadzeniu w końcówce, rzadko gdy ma już kartkę. `foul.tactical: true`. Te same reguły dla obu drużyn | OK |
| 7 | DOGSO przez ostatniego obrońcę | Czerwona (poza polem karnym) | Brak | BRAK | 5 % fauli taktycznych to DOGSO i czerwona | OK |
| 8 | Ukarany gra ostrożniej | Zawodnik z żółtą unika wejść | Mnożniki fauli i kartek dla ukaranych | OK | Bez zmian | OK |
| 9 | Trener zdejmuje zagrożonego drugą żółtą | Obrońca lub DP z kartką i dużą agresją, w przerwie albo po 55' | Losowanie co punkt kontrolny, więc prawie zawsze zmiana (0,71 na drużynę) | CZĘŚCIOWO | Ocena raz na zawodnika (przerwa albo po 55'), tylko role defensywne; 0,30 na drużynę | OK |
| 10 | Czerwona dla bramkarza, rezerwowy na ławce | Trener zdejmuje zawodnika z pola i wpuszcza bramkarza (kosztem zmiany i okna) | Do bramki szedł zawodnik z pola, rezerwowy nigdy nie wchodził | BRAK | Od razu (ta sama przerwa w grze) schodzi zawodnik najmniej potrzebny w stanie meczu (przy prowadzeniu napastnik, przy pogoni defensywny), wchodzi bramkarz; potem kształt 4-4-1 lub 4-3-2 | OK |
| 11 | Czerwona dla bramkarza, brak rezerwowego | Do bramki idzie zawodnik z pola | Wybór po atrybutach bramkarskich, często najlepszy zawodnik | CZĘŚCIOWO | `emergencyKeeper`: refleks, chwyt, ustawianie, skoczność, opanowanie, z karą za wartość w polu; najlepszy zawodnik z pola nigdy, gdy jest inny kandydat. Zdarzenie `gkSwitch { emergency, cause }` | OK |
| 12 | Czerwona dla bramkarza po wykorzystaniu 5 zmian | Zawodnik z pola w bramce | Jak w 11 | CZĘŚCIOWO | Jak w 11, plus reorganizacja | OK |
| 13 | Czerwona dla bramkarza, zmiany są, ale 3 okna zużyte | Zmiana niemożliwa poza przerwą | Jak w 11 | CZĘŚCIOWO | Zawodnik z pola w bramce; w przerwie meczu asystent lub AI wpuszcza bramkarza (przerwa nie zużywa okna), a awaryjny bramkarz wraca na swoją pozycję | OK |
| 14 | Czerwona dla zawodnika z pola po wykorzystaniu zmian | Gra w 10, przesunięcie zawodników | Pusta pozycja wykluczonego, bez reorganizacji | CZĘŚCIOWO | Kształt wg wyniku: 4-4-1 (remis, prowadzenie), 4-3-2 (pogoń od 55'), 5-3-1 przy trójce z tyłu | OK |
| 15 | Czerwona dla obrońcy: napastnik za obrońcę | Typowa reakcja: „poświęcam napastnika, wchodzi stoper” | Brak | BRAK | Przy prowadzeniu lub remisie (ŚO także przy pogoni przed 70') schodzi najsłabszy z ofensywnych, wchodzi obrońca; zostaje zapas zmiany przed 75' | OK |
| 16 | Reorganizacja po czerwonej wg wyniku i minuty | 4-4-1 albo 4-3-2, ostrożniej przy remisie | Brak | BRAK | `tactic { patch: { formation, drop }, shape: '4-4-1' }`, nastawienie, pressing niski, kontry | OK |
| 17 | Dwie czerwone (gra w 9) | 4-3-1, głęboka obrona | Brak reakcji | CZĘŚCIOWO | Kolejna reorganizacja (np. 4-3-1) | OK |
| 18 | Mniej niż 7 zawodników | Law 3: mecz przerwany, walkower decyduje organizator | Mecz trwał dalej | BRAK | Zdarzenie `abandoned`, koniec meczu, `result.abandoned = { side, minute }`. Walkower (0:3) musi naliczyć warstwa sezonu | CZĘŚCIOWO |
| 19 | Kartka dla rezerwowego lub zmienionego | Law 12: kartki dla rezerwowych i zmienionych; drużyna nie traci zawodnika na boisku | Brak | BRAK | Rzadkie zdarzenie (`yellow`/`red` z `bench: true`); wykluczony rezerwowy nie może wejść | OK |
| 20 | Kartka dla trenera i sztabu | Law 5 (od 2019/20): żółta, czerwona dla osób funkcyjnych | Brak | BRAK | `staffCard { card }`; po czerwonej okrzyki z linii bocznej są zablokowane (`canShout`), zmiany robi asystent | OK |
| 21 | Rywal gra w dziesiątkę | Trener podnosi pressing i nastawienie | Brak reakcji | BRAK | Natychmiast (p 0,8): nastawienie +1, wysoki pressing; od 55' przy remisie ofensywna zmiana; przy prowadzeniu trzymanie piłki | OK |
| 22 | Kartka dla bramkarza za grę na czas | Opóźnianie wznowienia | Możliwa (losowany zawodnik) | OK | Bez zmian, `yellow.gk` | OK |
| 23 | Kumulacja kartek i pauzy | Regulaminy PZPN i UEFA (ekspert_sedzia A2) | Poza silnikiem (studio, sezon) | OK | Bez zmian; silnik podaje kody powodów | OK |

## B. Kontuzje

| # | Sytuacja | Przepisy i zachowanie trenera | Silnik przed | Przed | Silnik teraz | Teraz |
|---|---|---|---|---|---|---|
| 24 | Lekki uraz, gra z bólem | Zawodnik gra dalej, słabiej | Kara do siły | OK | Bez zmian; `injury { severity, canContinue: true }` | OK |
| 25 | Opatrywany schodzi na 1 minutę | IFAB 2026/27 | Tak | OK | Bez zmian, `injury.treated` | OK |
| 26 | Wyjątek: faul ukarany kartką | Law 5: opatrywany nie musi schodzić | Brak wyjątku | BRAK | Po faulu z kartką opatrywany zostaje | OK |
| 27 | Wyjątek: bramkarz | Bramkarz nie schodzi do opatrzenia | Tak | OK | Bez zmian | OK |
| 28 | Poważny uraz: zmiana pozycja za pozycję | Trener wpuszcza zawodnika z tej samej pozycji | `ovr * biegłość`, bez strony boiska i bez przesunięć | CZĘŚCIOWO | `pickReplacement`: dopasowanie do slotu (biegłość ze stroną i siła w strefach roli) | OK |
| 29 | Brak odpowiednika na ławce | Przesunięcie (DP cofa się na stopera, wchodzi pomocnik) | Brak | BRAK | Ruch „zawodnik z boiska na slot kontuzjowanego, rezerwowy na jego miejsce”, `sub.moveId` | OK |
| 30 | Kontuzja bramkarza, rezerwowy na ławce | Zmiana bramkarz za bramkarza | Błąd: dwóch bramkarzy na boisku, pusty slot w polu | BRAK | Zmiana 1 za 1 od razu (AI) albo przez asystenta; dokładnie jeden bramkarz | OK |
| 31 | Kontuzja bramkarza, brak rezerwowego | Zawodnik z pola w bramce, za kontuzjowanego wchodzi zawodnik z pola | Zawodnik z pola w bramce, wchodzący trafiał na slot BR | CZĘŚCIOWO | `gkSwitch`, a wchodzący zajmuje pozycję awaryjnego bramkarza | OK |
| 32 | Kontuzja po wykorzystaniu zmian | Gra w 10 | Pusta pozycja, bez reorganizacji | CZĘŚCIOWO | Gra w 10 z nowym kształtem | OK |
| 33 | Kontuzja, gdy zmiany są, ale okna zużyte | Zmiana niemożliwa | Jak w 32 | CZĘŚCIOWO | Jak w 32 | OK |
| 34 | Wstrząśnienie mózgu | Obowiązkowe zejście | Uraz niegrywalny | OK | `injury.concussion: true` | OK |
| 35 | Zmiany „concussion” | Protokół IFAB to opcja organizatora: zmiana poza limitem, rywal dostaje dodatkową zmianę i okno. UEFA nie stosuje w swoich rozgrywkach; dla Ekstraklasy brak potwierdzenia [SZAC: wyłączone] | Brak | BRAK | `ctx.concussionSubs: true` włącza; maks. 2 na drużynę [SZAC], `sub.concussion: true`, rywal `subsLimit + 1`, `windowsLimit + 1` | OK |
| 36 | Uraz grywalny: zmiana w przerwie lub po przerwie | Sztab medyczny decyduje | Zmiana z p 0,7 od 46' | OK | Bez zmian (także w przerwie) | OK |
| 37 | Uraz grywalny bramkarza | Rezerwowy bramkarz w przerwie | Brak | BRAK | Kandydat do zmiany (tylko na bramkarza) | OK |
| 38 | Zapas zmiany na kontuzję | Trener trzyma jedną zmianę i okno do końcówki | Brak | BRAK | Do 80' zostaje jedna zmiana; ostatniego okna nie otwiera się przed 80' bez pilnej potrzeby | OK |
| 39 | Doliczony czas za kontuzje | Sędzia dolicza | Tak | OK | Bez zmian | OK |
| 40 | Zmęczenie zwiększa ryzyko urazu | Wyższe ryzyko przy niskiej kondycji | Tak | OK | Bez zmian | OK |

## C. VAR

| # | Sytuacja | Przepisy i zachowanie | Silnik przed | Przed | Silnik teraz | Teraz |
|---|---|---|---|---|---|---|
| 41 | Gol anulowany | Spalony, faul lub ręka w ataku | `varOverturn { cancelGoal }` bez powodu | CZĘŚCIOWO | `decision: 'goalDisallowed'`, `varReason` (spalony 60 %, faul 25 %, ręka 15 % [SZAC]). Gol z rzutu karnego nigdy nie jest odwoływany | OK |
| 42 | Gol sprawdzony i uznany | Widoczne sprawdzenie, gol stoi | Brak | BRAK | Analiza `varCheck { decision: 'goalCheck' }`, potem werdykt `varCheck { confirmed: true, decision: 'goalConfirmed' }` po ok. 10 % goli z gry | OK |
| 43 | Karny odwołany | VAR | Tak, bez kodu decyzji | CZĘŚCIOWO | Usunięte (Nov 13, 2026): karny podyktowany przez sędziego zostaje, VAR analizuje tylko sytuacje, w których sędzia nie gwizdał. `penPerAction` obniżone o 10 %, liczba karnych bez zmian (0,30 na mecz) | OK |
| 44 | Karny podyktowany po VAR | Przeoczony faul lub ręka w polu | Stała istniała, nieużywana | BRAK | `penaltyClaim { hand }` (protest, sędzia gra dalej, 0,08 na mecz), w połowie przypadków analiza `varCheck` (`handCheck`/`penaltyCheck`), potem `penaltyAwarded` (37,5 %) albo werdykt `noPenalty` | OK |
| 45 | Czerwona dodana po VAR | Rażący faul ukarany żółtą | Stała istniała, nieużywana | BRAK | `decision: 'redCard'`, potem `red` (kod `rażący`) | OK |
| 46 | Czerwona zamieniona na żółtą | On-field review | Brak | BRAK | `decision: 'redCancelled'`, potem `yellow` (albo druga żółta). Czerwona sprawdzona i utrzymana: `redCheck`, potem `redConfirmed` (12 % bezpośrednich czerwonych [SZAC]) | OK |
| 47 | Druga żółta cofnięta | IFAB 2026/27: VAR przy ewidentnie błędnej drugiej żółtej | Brak | BRAK | `decision: 'secondYellowCancelled'`, bez kartki | OK |
| 48 | Pomyłka tożsamości | VAR koryguje ukaranego | Brak | BRAK | Brak (bardzo rzadkie, bez wpływu na wynik) | BRAK |
| 49 | Spalony przy golu po VAR | Liczy się w statystyce spalonych zawodnika | Brak | CZĘŚCIOWO | Spalony dopisany strzelcowi | OK |
| 50 | Brak VAR w 1L i 2L | ekspert_sedzia A4 | `ctx.var` | OK | Bez zmian | OK |
| 51 | Doliczony czas za VAR | Ok. 1-2 min za analizę | Tak | OK | Bez zmian | OK |
| 52 | Błędnie przyznany rzut rożny (VAR 2026/27, opcja) | Korekta natychmiast | Brak | BRAK | Brak (bez znaczenia dla gry) | BRAK |

Na ekranie meczu minuta z karnym albo analizą VAR jest odgrywana etapami (`dramaStages` w `src/ui/matchdayView.js`): gra staje, baner na boisku pokazuje kolejno gol z wynikiem tymczasowym, protest, analizę VAR z paskiem postępu, werdykt (GOL UZNANY, GOL NIEUZNANY, DECYZJA UTRZYMANA, NIE MA KARNEGO, RZUT KARNY), rzut karny i jego wynik. Pauza, zmiana tempa i „Pokaż wynik” kończą etapy od razu.

## D. Stałe fragmenty gry

| # | Sytuacja | Przepisy i zachowanie | Silnik przed | Przed | Silnik teraz | Teraz |
|---|---|---|---|---|---|---|
| 53 | Rzut rożny, strzał głową | Siła w powietrzu kontra obrona SFG | Tak | OK | Bez zmian | OK |
| 54 | Bezpośredni rzut wolny | Wykonawca SFR | Tak | OK | Bez zmian | OK |
| 55 | Wolny dośrodkowany | Strzał głową | Tak | OK | Bez zmian | OK |
| 56 | Wykonawcy SFG, zastępstwo po zejściu | Następny w kolejce | Tak | OK | Bez zmian | OK |
| 57 | Bramkarz idzie na rożny w ostatniej minucie | Przegrana jednym golem, doliczony czas | Brak | BRAK | `gkUp`; większa szansa na strzał | OK |
| 58 | Kontra na pustą bramkę po rożnym | Ryzyko wyjścia bramkarza | Brak | BRAK | 25 % nieudanych rożnych z bramkarzem w polu kończy się strzałem na pustą bramkę [SZAC] | OK |
| 59 | Auty, rzuty od bramki | Statystyki | Tak | OK | Bez zmian | OK |
| 60 | Krycie strefowe kontra indywidualne przy SFG | Instrukcja „Krycie” | Tak | OK | Bez zmian | OK |

## E. Rzuty karne w meczu

| # | Sytuacja | Przepisy i zachowanie | Silnik przed | Przed | Silnik teraz | Teraz |
|---|---|---|---|---|---|---|
| 61 | Karny wykorzystany | Skuteczność 75-78 % | Tak | OK | Bez zmian | OK |
| 62 | Karny obroniony | Ok. 70 % niestrzelonych | Tak | OK | `shotOn { penalty: true }` | OK |
| 63 | Karny niecelny lub w słupek | | Tak | OK | `shotOff { penalty: true }` | OK |
| 64 | Powtórka (bramkarz przed linią) | Law 14: powtórka, gdy karny niestrzelony | Brak | BRAK | `penaltyRetake { reason }`, raz [SZAC 5 %] | OK |
| 65 | Dobitka po obronie | Strzelający nie może dotknąć piłki drugi raz | Brak | BRAK | 35 % obron daje dobitkę innego zawodnika [SZAC] | OK |
| 66 | Po pudle karny strzela kto inny | Trenerzy zmieniają strzelca w meczu | Zawsze wyznaczony | BRAK | Następny w kolejce po pudle | OK |
| 67 | Kartka za faul dający karnego | Potrójna kara: żółta przy próbie gry, czerwona bez | 10 % żółtej | CZĘŚCIOWO | Bez zmian (czerwone DOGSO w polu tylko przez VAR) | CZĘŚCIOWO |
| 68 | Gol samobójczy | Pechowiec z obrony | Tak | OK | Bez zmian | OK |

## F. Czas doliczony i przerwy

| # | Sytuacja | Przepisy i zachowanie | Silnik przed | Przed | Silnik teraz | Teraz |
|---|---|---|---|---|---|---|
| 69 | Doliczony czas z wydarzeń połowy | ekspert_sedzia A5 | Tak | OK | Bez zmian | OK |
| 70 | Zdarzenia w doliczonym czasie go wydłużają | Gol w 90+3 przy 4 min: gra do ok. 90+5 | Brak | BRAK | +1 min za gol, VAR, poważny uraz, maks. +2 | OK |
| 71 | Gra na czas wydłuża doliczony | | Tak | OK | Bez zmian | OK |
| 72 | Zmiana „na czas” w doliczonym czasie | Prowadzący zdejmuje napastnika powoli | Brak | BRAK | Kandydat `why: 'timewasting'` | OK |
| 73 | Przerwa na schłodzenie w upale | Opcja organizatora (WBGT > 32°C), ok. 30. min połowy, 3 min | Brak | BRAK | `coolingBreak` przy `ctx.weather.tempC >= 32` albo `cooling: true`; dzień meczowy nie podaje jeszcze temperatury | CZĘŚCIOWO |

## G. Dogrywka i rzuty karne po dogrywce

Kolejność strzelców wybierana przez gracza, pauza przed serią, seria bez dogrywki (Superpuchar, sparing) i zasady sparingów: `docs/sparingi-i-karne.md`.

| # | Sytuacja | Przepisy i zachowanie | Silnik przed | Przed | Silnik teraz | Teraz |
|---|---|---|---|---|---|---|
| 74 | Dogrywka: +1 zmiana i +1 okno, przerwy bez okna | IFAB Law 3 | Tak | OK | Bez zmian | OK |
| 75 | Świeże nogi przed dogrywką | Zmiany zmęczonych w przerwie przed dogrywką | Rzadko (punkt kontrolny, bez progu dla dogrywki) | CZĘŚCIOWO | Kandydaci „zmęczenie” w przerwie przed dogrywką i w jej trakcie | OK |
| 76 | Seria ABAB, 5 serii, wcześniejsze rozstrzygnięcie | Law 10 | Tak | OK | Bez zmian | OK |
| 77 | Nagła śmierć | Po 5 seriach | Tak | OK | `shootoutKick.suddenDeath`, `outcome` (gol, obrona, pudło) | OK |
| 78 | Uprawnieni: także chwilowo opatrywani | Law 10 | Opatrywani wykluczeni z listy | CZĘŚCIOWO | Wszyscy na boisku | OK |
| 79 | Wyrównanie liczebności | Drużyna wyklucza zawodników z pola, bramkarz zostaje | Bramkarz mógł zostać wykluczony | CZĘŚCIOWO | Bramkarz zawsze zostaje (strzela ostatni) | OK |
| 80 | Każdy strzela raz przed powtórką | Law 10 | Tak | OK | Bez zmian | OK |
| 81 | Bramkarz od karnych przed serią | Rezerwowy bramkarz wchodzi w 119-120' | Brak | BRAK | Gdy rezerwowy ma średnio o 1,5 lepsze REF i JNJ i są zmiany | OK |
| 82 | Kontuzja bramkarza w trakcie serii | Zastępuje rezerwowy albo wyłączony zawodnik | Brak | BRAK | Brak (bardzo rzadkie) | BRAK |
| 83 | Dogrywka w przewadze lub osłabieniu | Jak w meczu | Brak reakcji | BRAK | Ta sama logika stanu meczu | OK |
| 84 | Słabszy gra na karne w końcówce dogrywki | Nastawienie ostrożne od ok. 112' | Brak | BRAK | Powód „gramy na rzuty karne” | OK |

## H. Pogoda

| # | Sytuacja | Zachowanie | Silnik przed | Przed | Silnik teraz | Teraz |
|---|---|---|---|---|---|---|
| 85 | Deszcz, śnieg, wiatr, upał, zła murawa | Skuteczność, faule, zmęczenie, urazy | `ctx.weather` | OK | Bez zmian | OK |
| 86 | Upał: wcześniejsze zmiany zmęczonych | Trener reaguje na kondycję | Brak | BRAK | Próg zmęczenia +4 przy `weather.fat >= 1.25` | OK |

## I. Zarządzanie wynikiem

| # | Sytuacja | Zachowanie trenera | Silnik przed | Przed | Silnik teraz | Teraz |
|---|---|---|---|---|---|---|
| 87 | Prowadzenie w końcówce | Ostrożniej, wolne tempo, gra na czas od 82' | Nastawienie -1 od 75', gra na czas | CZĘŚCIOWO | Plus wolne tempo przy 1 golu; progi wg osobowości (ofensywny później, ostrożny od 65') | OK |
| 88 | Prowadzenie 1 golem pod presją | Niski blok, zamurowanie | Brak | BRAK | Od 85' przy złym momentum lub u ostrożnego: nastawienie -2, niska linia, niski pressing | OK |
| 89 | Przegrywanie | Odważniej, pressing, szybkie tempo | Nastawienie +1 lub +2 | CZĘŚCIOWO | Nastawienie, tempo, pressing wg minuty i różnicy | OK |
| 90 | Przegrywanie w ostatnich minutach | Długie piłki, wysoka linia | Brak | BRAK | Od 85' i w doliczonym czasie | OK |
| 91 | Remis, słabszy: bierzemy punkt | Ostrożnie od ok. 80' | Losowo (40 %) bez względu na siłę | CZĘŚCIOWO | Gdy różnica siły < -1 | OK |
| 92 | Remis, faworyt szuka gola | Od 70' | Losowo, z porównania stref | CZĘŚCIOWO | Gdy różnica siły > 1 | OK |
| 93 | Dwumecz: liczy się suma bramek | Prowadzący w dwumeczu broni, mimo przegrywania meczu | Silnik liczył dogrywkę z sumy, ale AI patrzyło na wynik meczu | BRAK | `matchState.diff` z pierwszym meczem | OK |
| 94 | Puchar, remis w końcówce | Bez ryzyka, dogrywka przed nami | Brak | BRAK | Słabszy: nastawienie nie wyższe niż 0 od 85' | OK |
| 95 | Reakcja na gola | Nowa ocena po golu | Tylko w punktach kontrolnych | BRAK | Ocena instrukcji po golu od 60' | OK |
| 96 | Osobowość trenera | Ofensywny goni wcześniej i broni później; ostrożny broni od 65' | Ten sam próg dla obu kierunków | CZĘŚCIOWO | Osobne progi gonienia i obrony wyniku; reakcje na przebieg gry, upór i czas rozpoznania: `docs/ai-trener.md` | OK |

## J. Taktyka

| # | Sytuacja | Zachowanie trenera | Silnik przed | Przed | Silnik teraz | Teraz |
|---|---|---|---|---|---|---|
| 97 | Zmiana formacji przy pogoni | 4-2-3-1 na 4-4-2, w końcówce trójka z tyłu (3-4-3) | Brak | BRAK | `ATTACK1` i `ATTACK2` przy ofensywnej zmianie | OK |
| 98 | Zmiana formacji przy obronie wyniku | 4-1-4-1, 5-4-1 po wejściu stopera | Brak | BRAK | `DEFEND_MID`, 5-4-1 po wejściu obrońcy | OK |
| 99 | Bezwładność i koszt spójności | ekspert_futbol 4.3 | Tak | OK | Bez zmian, także dla AI | OK |
| 100 | Zmiana w przerwie za darmo | | Tak | OK | Bez zmian; AI i asystent korzystają z przerwy | OK |
| 101 | Powrót do planu po zmianie wyniku | Po wyrównaniu wraca nastawienie wyjściowe | Brak | BRAK | Instrukcje wracają do `baseInstr` | OK |
| 102 | Trener na trybunach | Brak okrzyków | Brak | BRAK | `canShout` blokuje | OK |

## K. Zmiany zawodników

| # | Sytuacja | Przepisy i zachowanie | Silnik przed | Przed | Silnik teraz | Teraz |
|---|---|---|---|---|---|---|
| 103 | Pozycja za pozycję wg biegłości i strony | | Bez strony boiska i przesunięć | CZĘŚCIOWO | `slotFit` i ruchy zawodników | OK |
| 104 | Pogoń: napastnik za defensywnego | | 96 % takich zmian wprowadzało pomocnika na slot DP | CZĘŚCIOWO | Zawsze napastnik lub skrzydłowy plus ofensywniejsze ustawienie; gdy ustawienie już ofensywne, świeży napastnik za zmęczonego | OK |
| 105 | Obrona wyniku: obrońca za napastnika | | Obrońca grał na slocie napastnika | CZĘŚCIOWO | Wchodzący trafia do obrony (przestawienie lub nowe ustawienie) | OK |
| 106 | Zmęczeni zawodnicy | Kondycja | Próg 65 | OK | Próg 70-77 zależnie od minuty i upału | OK |
| 107 | Podwójne i potrójne zmiany | Jedno okno, kilku zawodników | Maks. 2 | CZĘŚCIOWO | Do 3, dokładane zaplanowane zmiany, gdy okno i tak się otwiera | OK |
| 108 | 5 zmian, 3 okna, przerwa bez okna | IFAB Law 3 | Tak | OK | Bez zmian, test 2000 meczów | OK |
| 109 | Ostatnie okno na koniec | | Brak | BRAK | Patrz 38 | OK |
| 110 | Zmiany w przerwie | Popularne: uraz, kartka, słaba gra, pogoń | Rzadko | CZĘŚCIOWO | Uraz, kartka (p 0,35), słaba gra (p 0,3), pogoń przy -2 | OK |

Pozostałe sytuacje z burzy mózgów, opisane w kodzie i testach:
- Bramkarz rezerwowy nie wchodzi w pole, a bramkarza zastępuje tylko bramkarz (`pickReplacement`).
- Gracz zareagował sam po czerwonej kartce: asystent nie dubluje reorganizacji (`T.lastUserTick`).
- „Pokaż wynik” po czerwonej kartce obejrzanej na żywo: asystent od razu nadrabia zaległe reakcje (`runToEnd`, `runToBreak`).
- Podpowiedź asystenta w trakcie meczu: `assistantSuggest`, `applySuggestion`.

## Liczby po zmianie (3000 meczów Ekstraklasy, Nov 11, 2026)

| Statystyka | Przed | Teraz | Cel |
|---|---|---|---|
| Gole na mecz | 2,72 | 2,70 | 2,7-2,9 |
| Gospodarz / remis | 44,7 / 26,3 % | 43,9 / 25,4 % | 44-46 / 25-28 % |
| Strzały / celne | 24,8 / 8,9 | 24,7 / 8,8 | 24-25 / 8-9 |
| Żółte / czerwone | 4,34 / 0,19 | 4,44 / 0,23 | 4,2-4,6 / 0,15-0,25 |
| Rzuty karne | 0,26 | 0,30 | 0,28-0,35 |
| Zmiany VAR | 0,15 | 0,19 | 0,25-0,35 (PL) |
| Zmiany na drużynę / okna | 4,08 / 2,96 | 4,23 / 2,13 | 4-4,5 |
| Faule taktyczne | 0 | 0,30 | [SZAC] |
| Doliczony czas | 2,5 / 7,1 | 2,6 / 6,2 | ok. 3 / 6-7 |

Mniej okien przy tej samej liczbie zmian to skutek grupowania zmian i zmian w przerwie.

## Zdarzenia dla interfejsu

Typy `goal`, `yellow`, `red`, `varCheck`, `varOverturn`, `injury`, `sub`, `tactic`, `penalty` zachowują dotychczasowe pola; nowe pola są dodatkowe.

| Typ | Pola |
|---|---|
| `yellow` | `pid, side, reason, gk?, bench?, text` |
| `red` | `pid, side, reason` (kod studia: `druga żółta`, `dogso`, `ręka`, `rażący`, `przemoc`), `reasonCode` (`second`, `dogso`, `handball`, `sfp`, `violent`), `reasonText, second, gk, playersLeft, bench?, text` |
| `varCheck` | `decision, confirmed?, pause: 2, text` |
| `varOverturn` | `decision` (`goalDisallowed`, `penaltyAwarded`, `penaltyCancelled`, `redCard`, `redCancelled`, `secondYellowCancelled`), `cancelGoal?, varReason?, cancelPenalty?, xg?, text` |
| `injury` | `pid, injury { cat, name, days, playable }, severity, canContinue, days, gk, treated, concussion, contact, text` |
| `gkSwitch` | `pid` (zawodnik z pola w bramce), `emergency: true, cause` (`red`, `injury`), `fromPos, text` |
| `sub` | `pid` = `inId`, `outId, why` (`injury`, `gk`, `tired`, `booked`, `form`, `chase`, `protect`, `rotation`, `timewasting`, `redReshape`, `penaltyGk`, `concussion`), `by` (`user`, `ai`, `assistant`), `pos, gk, concussion, moveId, atBreak, text` |
| `tactic` | `patch { formation?, drop?, instructions? }, by, reason, formation, shape` (np. `4-4-1`), `cost, atBreak, text` |
| `penalty` | `pid, byVar?, foulerId, text` |
| `shotOn`, `shotOff`, `shotBlocked`, `post` | dodatkowo `kind`: typ akcji (`POZ`, `SKR`, `KON`, `DYS`, `SP`, `FK`), z którego trener na ławce widzi, skąd biorą się sytuacje rywala |
| Nowe | `staffCard { card }`, `penaltyRetake { reason }`, `gkUp`, `coolingBreak`, `abandoned`, `shootoutKick { outcome, round, suddenDeath, gkId }` |

API silnika dla ekranu meczu (`src/engine/match/match.js`): `assistantSuggest(M, side)` zwraca listę propozycji (`{ type: 'sub', outId, inId, moveId, why, text, outName, inName }` albo `{ type: 'tactic', patch, reason }`) bez zmiany stanu meczu; `applySuggestion(M, side, action)` wykonuje propozycję jako decyzję gracza; `subsAvailable(M, T)`, `matchState(M, side)`.

## Źródła

- [IFAB: Laws of the Game, Law 3 The Players](https://www.theifab.com/laws/latest/the-players/) (zmiany, okna, zmiana bramkarza)
- [IFAB: Additional permanent concussion substitutions protocol](https://theifab.com/laws/latest/additional-permanent-concussion-substitutions-protocol) i [PDF protokołu](https://downloads.theifab.com/downloads/additional-permanent-concussion-substitutes-protocol?l=en)
- [Inside World Football: IFAB clears way for concussion subs (Mar 4, 2024)](https://insideworldfootball.com/2024/03/04/ifab-clears-way-concussion-subs-sinbins-remain-trial)
- [Yahoo Sports: UEFA confirm no concussion substitutes](https://uk.sports.yahoo.com/news/uefa-confirm-no-concussion-substitutes-155728914.html)
- [UEFA Women's Champions League 2025/26, art. 61 (procedura przy urazie)](https://documents.uefa.com/r/Regulations-of-the-UEFA-Women-s-Champions-League-2025/26/Article-61-Procedure-in-case-of-severe-injury-to-players-Online)
- [Inside World Football: Premier League to allow two concussion subs per game](https://insideworldfootball.com/?p=124145)
- Pozostałe przepisy (kartki, VAR 2026/27, doliczony czas, dogrywka, seria karnych, opatrywani): `docs/ekspert_sedzia.md`, rozdz. A1-A7 i źródła w rozdz. 13.

Niepewne: regulamin Ekstraklasy 2026/27 w sprawie zmian po wstrząśnieniu mózgu (brak potwierdzenia w wyszukiwaniu; flaga domyślnie wyłączona). Strony theifab.com i premierleague.com nie były dostępne z sesji, więc treść protokołu pochodzi ze streszczeń wyników wyszukiwania.
