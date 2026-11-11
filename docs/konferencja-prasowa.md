# Konferencja prasowa: burza mózgów i model

Stan na Nov 11, 2026. Dokument powstał z rozmowy dziennikarza (lata konferencji w Ekstraklasie, styl dziennika sportowego, portalu i kanału na YouTube) z projektantem gry. Część 1 opisuje, jak to wygląda naprawdę. Część 2 to pomysły na grę. Część 3 to zakres wdrożony w LigaPL27 i uzasadnienie wyboru. Wartości balansowe oznaczone [SZAC] to szacunki do strojenia, nie dane.

Kod: `src/match/press.js` (model, czyste funkcje), `src/match/matchday.js` (podpięcie do dnia meczowego), `src/ui/matchdayView.js` i `src/styles/matchday.css` (okno konferencji), testy `tests/press.test.mjs`.

## 1. Jak wygląda prawdziwa konferencja w Polsce

### 1.1 Przebieg

- **Sala i ścianka.** Po meczu trenerzy idą do sali konferencyjnej na stadionie. Za stołem ścianka z herbem klubu, logo ligi i sponsorów. Na stole mikrofony z logotypami stacji. Transmisja idzie na żywo w klubowej telewizji i w aplikacjach portali.
- **Rzecznik prasowy prowadzi.** Rzecznik (albo rzeczniczka) gospodarza wita, mówi, ile jest czasu ("mamy czas na trzy, cztery pytania"), udziela głosu ("pan redaktor w drugim rzędzie") i zamyka ("ostatnie pytanie, dziękujemy").
- **Kolejność trenerów.** Zwyczajowo pierwszy mówi trener gości, potem gospodarzy. Gospodarz słucha ostatnich odpowiedzi rywala za ścianką i czasem do nich nawiązuje.
- **Słowo wstępne.** Rzecznik prosi o krótki komentarz do meczu. Trener mówi 30 do 60 sekund: gratulacje dla rywala albo dla drużyny, dwa zdania o przebiegu, podziękowanie kibicom. Tu pada ton, który potem cytują wszyscy.
- **Pytania.** Zwykle 3 do 6 pytań, każde od innej redakcji. Dziennikarz przedstawia się z nazwiska i redakcji. Dopytanie jest częste, gdy odpowiedź była wymijająca albo mocna ("czyli uważa pan, że...?").
- **Koniec.** Rzecznik ucina, trener wstaje. Czasem trener sam kończy ("dziękuję, to wszystko"), co media odnotowują jako wyjście z konferencji.
- **Strefa mieszana.** Osobno zawodnicy przechodzą przez strefę wywiadów. W grze pomijamy, ale cytaty piłkarzy mogą kiedyś wejść do nagłówków.

### 1.2 Kto siedzi na sali

| Typ redakcji | Co ją interesuje | Ton |
|---|---|---|
| Dziennik ogólnopolski (poważny) | Taktyka, cele, kontekst ligi | Rzeczowy, potrafi być twardy po serii porażek |
| Portal z wynikami na żywo | Cytat do tytułu w 5 minut, transfery | Szybki, szuka mocnych słów |
| Tabloid | Konflikty, winny porażki, posada trenera, prywatne sprawy | Prowokacyjny |
| Kanał internetowy (YouTube, stream) | Plotki transferowe, skład, emocje | Luźny, czasem złośliwy |
| Media lokalne | Kibice, miasto, derby, wychowankowie | Najczęściej życzliwy, ale zna klub od podszewki |
| Klubowa telewizja | Podziękowania dla kibiców | Zawsze przychylny, zadaje "bezpieczne" pytanie |
| Tygodnik | Szerszy obraz, rozwój zawodników | Spokojny |
| Media zagraniczne (puchary) | Rywal, styl, nazwiska | Pytania przez tłumacza, krótkie odpowiedzi |

Trener z zagranicy mówi przez tłumacza. Odpowiedzi są krótsze, a niuanse giną, więc media częściej źle cytują (dobry pomysł na przyszłość: większy rozrzut odbioru odpowiedzi).

### 1.3 Typowe pytania według sytuacji

| Sytuacja | Pytania, które padną na pewno |
|---|---|
| Wysokie zwycięstwo | "Najlepszy mecz pod pana wodzą?", "Czy to już drużyna na mistrzostwo?" |
| Szczęśliwe zwycięstwo | "Rywal miał więcej sytuacji. Nie wstyd wygrać w takim stylu?" |
| Derby | "Co znaczy to zwycięstwo dla miasta?", po porażce "Jak spojrzy pan kibicom w oczy?" |
| Porażka | "Dlaczego?", "Czego zabrakło?", po wymijającej odpowiedzi "Kogo konkretnie ma pan na myśli?" |
| Wysoka porażka | "Czy przeprasza pan kibiców?", "Czy szatnia jeszcze pana słucha?" |
| Sędzia i VAR | "Jak ocenia pan pracę sędziego?", dopytanie "Czyli sędzia był stronniczy?" |
| Kryzys, seria porażek | "Trzecia porażka z rzędu. Jak przerwać serię?", "Czy pana posada jest zagrożona?" |
| Kontrowersja z zawodnikiem | "Rozmawiał pan z nim po czerwonej kartce?", "Będą konsekwencje?" |
| Plotki transferowe | "Mówi się o ofercie z zagranicy. Odejdzie zimą?" |
| Presja zarządu | "Czy cel na sezon jest nadal realny?", "Rozmawiał pan z prezesem?" |
| Przyszłość trenera | "To pana ostatnie dni w klubie?" |
| Forma zawodnika | "Jak ocenia pan występ X?", "Czy to materiał na reprezentację?" |
| Kontuzje | "Wiadomo już coś o urazie X?" |
| Protest kibiców | "Kibice wywiesili transparent przeciwko panu. Co pan na to?" |
| Obietnica z przeszłości | "Tydzień temu obiecywał pan zwycięstwo. Co się stało?" |

### 1.4 Co robią odpowiedzi

- **Nagłówki.** Media biorą najmocniejsze zdanie, nie najmądrzejsze. "Te decyzje kosztowały nas punkty" wygrywa z "gratuluję rywalowi". Tabloid podkręca: "Trener atakuje sędziego!".
- **Szatnia czyta media.** Publiczna pochwała podnosi morale zawodnika, krytyka z nazwiskiem boli bardziej niż ta sama uwaga w szatni. Trener, który bierze winę na siebie, chroni drużynę przed nagonką.
- **Zarząd.** Prezes nie lubi, gdy trener publicznie podważa cele albo domaga się wzmocnień. Lubi spokój i odpowiedzialność.
- **Kibice.** Lubią emocje, derbowe deklaracje, atak na sędziego po krzywdzie. Nie lubią żartów po blamażu i "to tylko trzy punkty" po derbach.
- **Relacje z mediami.** Dziennikarze pamiętają. Trener konfrontacyjny albo unikający konferencji ma gorszą prasę przy następnym kryzysie. Żart i otwartość budują kredyt.
- **Kary.** Mocne słowa o sędziach mogą skończyć się wnioskiem do Komisji Ligi.

### 1.5 Klimat w mediach (narracja)

Prasa nie ocenia jednego meczu. Buduje opowieść: "kryzys w klubie", "rewelacja sezonu", "trener na wylocie". Opowieść trwa kilka kolejek i zmienia się dopiero po wyraźnym zwrocie (seria zwycięstw, derby, zwolnienie). To samo zwycięstwo 1:0 jest "przełamaniem" w czasie kryzysu i "męczarnią" w klubie, który ma bić się o tytuł.

## 2. Pomysły do gry (burza mózgów)

### 2.1 Klimat prasy: agresywna, neutralna, pozytywna

Losowany po meczu, ale z wagami z kontekstu (deterministycznie z ziarna gry i meczu):

| Czynnik | Kierunek | Waga [SZAC] |
|---|---|---|
| Wynik względem oczekiwań (punkty minus punkty oczekiwane ze studia) | + przy zwycięstwie z faworytem, minus przy porażce z słabszym | 1,6 za punkt różnicy |
| Forma z 5 meczów | W minus P | 0,5 za mecz |
| Miejsce względem celu zarządu (liga, od 5. kolejki) | powyżej celu plus, poniżej minus | 0,25 za miejsce, limit od -2 do +1,5 |
| Wielkość klubu (prestiż) | wielki klub to większa presja, mały ma sympatię | -0,3 za każdy punkt prestiżu ponad 6, +0,3 dla prestiżu do 4 |
| Derby | wzmacnia wszystko | x1,3 |
| Skandal: czerwona kartka naszego zawodnika | minus | -0,5 |
| Kryzys: zaufanie zarządu poniżej 35, kibice poniżej 35 | minus | -1 i -0,8 |
| Relacje z mediami (0 do 100, start 50) | dobre relacje łagodzą | (relacje - 50) / 15 |
| Pominięta konferencja lub wyjście z sali ostatnio | minus | -1 lub -1,5 |
| Narracja z poprzednich meczów | ten sam klimat trwa 2 do 4 meczów | +0,3 do wagi obecnego klimatu |

Szanse [SZAC]: agresywna 0,28 - 0,09 x wynik, pozytywna 0,28 + 0,09 x wynik (każda od 0,04 do 0,88), neutralna to reszta (co najmniej 0,12). Nawet po zwycięstwie zdarza się agresywna sala (wielki klub, słaby styl), a po porażce życzliwa (beniaminek, pech).

### 2.2 Presja prasy na drużynę (także bez konferencji)

Zawodnicy czytają gazety i oglądają kanały. Klimat działa na morale całej kadry po zamknięciu dnia meczowego:

| Klimat | Bazowy wpływ na morale (skala 1-20) [SZAC] |
|---|---|
| Agresywna | -0,8 |
| Neutralna | 0 |
| Pozytywna | +0,4 |

Mnożnik osobowości [SZAC]: Wrażliwy 1,5, Narwaniec 1,2, Ambitny 1,0, Lider 0,6, Spokojny 0,6 (przy złej prasie). Przy dobrej prasie Wrażliwy 1,2, reszta 1,0.

Konferencja pozwala tę presję zmienić: trener, który bierze winę na siebie albo staje za drużyną, osłania szatnię (plus do morale), a trener wskazujący winnych dokłada (minus). Łączny wpływ prasy na morale drużyny jest ograniczony do przedziału od -1,5 do +1,0 [SZAC]. Dla porównania: porażka z słabszym rywalem to -2,5, odprawa pomeczowa do około ±2. Prasa ma być odczuwalna, ale nie może być głównym narzędziem.

Pominięcie konferencji (przycisk Dalej):
- agresywna: pełna presja bez osłony, relacje z mediami -4, kibice -1, nagłówek "trener unika mediów";
- neutralna: relacje -2, nagłówek "na konferencję przyszedł asystent";
- pozytywna: relacje -1, morale z dobrej prasy działa w połowie (+0,2), bo artykuły są dobre, ale bez cytatów trenera.

Bez kar finansowych za nieobecność: w grze ma to być wybór, a nie pułapka.

### 2.3 Realizm konferencji

- **Nazwani dziennikarze i redakcje (fikcyjne).** "Przegląd Ligowy" (dziennik), "PoGwizdku.pl" (portal), "Sensacje Dnia" (tabloid), "Kanał Trybuna" (internet), "Tygodnik Futbol", "Kurier Sportowy" z nazwą miasta (lokalne), klubowa telewizja. Nazwiska dziennikarzy losowane raz na grę, więc lokalny reporter wraca co mecz. Żadnych prawdziwych osób.
- **Skład sali zależy od klimatu.** Agresywna: tabloid i kanał internetowy w pierwszym rzędzie. Pozytywna: klubowa telewizja i media lokalne.
- **Rzecznik prowadzi.** Zapowiada liczbę pytań, oddaje głos, mówi "ostatnie pytanie".
- **Słowo wstępne** przed pytaniami (krótki komentarz do meczu).
- **Dopytania.** Zależą od poprzedniej odpowiedzi: po "niektórzy zawodnicy nie dali z siebie wszystkiego" pada "kogo konkretnie?", po "te decyzje kosztowały nas punkty" pada "czyli sędzia był stronniczy?".
- **Ton odpowiedzi:** spokojny, pewny siebie, dyplomatyczny, konfrontacyjny, z humorem, "bez komentarza". Każdy ton ma stały kierunek skutków (konfrontacja psuje relacje z mediami, humor je buduje, ale po blamażu drażni kibiców).
- **Nazwisko w odpowiedzi.** Ochrona albo krytyka konkretnego zawodnika zmienia jego morale.
- **Odbicie na sędziego** podoba się kibicom, nie podoba się zarządowi i może skończyć się wnioskiem o ukaranie.
- **"Bez komentarza"** przy trudnych tematach (sędzia, plotki, posada).
- **Wyjście z sali przed końcem** ma koszt w relacjach z mediami i daje nagłówek.
- **Pamięć prasy.** Obietnice ("wygramy następny mecz", "gramy o mistrzostwo", "cel jest realny") są zapisywane. Złamana obietnica wraca jako pytanie, dotrzymana też.
- **Pamięć unikania.** Po pominiętej konferencji pierwsze pytanie następnym razem brzmi "unika pan trudnych pytań?".
- **Skutki po konferencji:** podgląd nagłówka z nazwą redakcji, skutki słowami (szatnia, zarząd, kibice, relacje z mediami), wiadomość w poczcie w kategorii Media.

### 2.4 Pomysły na później

- Konferencja przedmeczowa (dzień przed meczem): deklaracje wpływają na motywację rywala ("podgrzanie" derbów), pytania o skład i kontuzje.
- Strefa mieszana z cytatami zawodników, które trener musi potem komentować.
- Trener zagraniczny z tłumaczem: odpowiedzi czasem źle przetłumaczone.
- Pytania o reprezentację, o młodzieżowca, o finanse klubu.
- Dziennikarze z charakterem: jeden zawsze pyta o wychowanków, inny o taktykę.
- Wnioski Komisji Ligi z realną karą finansową po atakach na sędziów (dziś tylko ostrzeżenie w treści).
- Klimat prasy wpływający na zachowanie zarządu przy ocenie miesięcznej.

## 3. Zakres wdrożony i uzasadnienie

Wybrany podzbiór daje najwięcej realizmu przy małym ryzyku dla balansu i bez zmian w silniku meczu, transferach, zarządzie i poczcie:

1. **Osobne okno konferencji** (pełnoekranowe okno dialogowe nad odprawą). Na odprawie pomeczowej przycisk "Konferencja prasowa" jest opcjonalny, a "Dalej" ją pomija. Szyna kroków się nie zmienia, bo konferencja nie jest obowiązkowym etapem.
2. **Klimat prasy** z kontekstu i losowości (tabela 2.1), z narracją trwającą 2 do 4 meczów i relacjami z mediami. Widoczny już na odprawie (z powodami i opisem skutków pominięcia) oraz w nagłówku okna.
3. **Presja na morale** zawsze, także po pominięciu (2.2), z mnożnikami osobowości i limitem.
4. **Sala:** rzecznik, 4 do 5 nazwanych dziennikarzy z fikcyjnych redakcji, słowo wstępne, 3 pytania (4 przy agresywnej prasie), do 2 dopytań, łącznie najwyżej 5 pytań od dziennikarzy. Kolejność trenerów (gości pierwszy) w zapowiedzi rzecznika.
5. **Tony odpowiedzi** i "bez komentarza", nazwiska zawodników (pochwała, krytyka, ochrona), odbicie na sędziego z możliwym wnioskiem o ukaranie.
6. **Pamięć prasy:** obietnice (zwycięstwo w następnym meczu, mistrzostwo lub awans, cel zarządu) i pominięcie albo wyjście z sali.
7. **Skutki:** nagłówek z redakcją, opis słowami, wiadomość w poczcie przez istniejące `addMessages`.

Odłożone: konferencja przedmeczowa, strefa mieszana, tłumacz, realne kary finansowe (wymagałyby zmian w finansach i zarządzie, które są teraz w pracy w innym miejscu).

## 4. Model w kodzie

| Funkcja (`src/match/press.js`) | Co robi |
|---|---|
| `pressState(game)` | Leniwie tworzy `game.press` (stare zapisy działają) |
| `pickClimate(ctx, state, seed)` | Klimat, szanse, powody (deterministycznie) |
| `openConference(ctx, state, climate, seed)` | Sala, rzecznik, kolejka pytań |
| `answerQuestion(conf, i)` | Zapisuje odpowiedź, wstawia dopytanie, przechodzi dalej (nowy obiekt) |
| `walkOut(conf)` | Wyjście z sali przed końcem |
| `conferenceEffects(conf, ctx)` / `skipEffects(ctx, climate)` | Skutki, nagłówek, limity |
| `pressMoraleDelta(teamDelta, persona)` | Morale zawodnika z mnożnikiem osobowości |
| `nextPressState(state, ...)` | Narracja, relacje, obietnice po meczu |
| `effectWords(eff)` | Skutki słowami do UI |

Dzień meczowy (`src/match/matchday.js`): `pressSetup(game, S)` liczy klimat i salę leniwie, `doPress` rozlicza konferencję, `closeMatchday` stosuje presję (albo skutki pominięcia), aktualizuje narrację i wysyła nagłówek do poczty. Skutki są stosowane dokładnie raz.
