# Konferencja prasowa: burza mózgów i model

Stan na Nov 11, 2026 (aktualizacja: kary za słowa o sędziach, prasa w ocenie zarządu, konferencja przedmeczowa). Dokument powstał z rozmowy dziennikarza (lata konferencji w Ekstraklasie, styl dziennika sportowego, portalu i kanału na YouTube) z projektantem gry. Część 1 opisuje, jak to wygląda naprawdę. Część 2 to pomysły na grę. Część 3 to zakres wdrożony w LigaPL27 i uzasadnienie wyboru. Wartości balansowe oznaczone [SZAC] to szacunki do strojenia, nie dane.

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
- **Odbicie na sędziego** podoba się kibicom, nie podoba się zarządowi i może skończyć się wnioskiem o ukaranie (rozdz. 5).
- **"Bez komentarza"** przy trudnych tematach (sędzia, plotki, posada).
- **Wyjście z sali przed końcem** ma koszt w relacjach z mediami i daje nagłówek.
- **Pamięć prasy.** Obietnice ("wygramy następny mecz", "gramy o mistrzostwo", "cel jest realny") są zapisywane. Złamana obietnica wraca jako pytanie, dotrzymana też.
- **Pamięć unikania.** Po pominiętej konferencji pierwsze pytanie następnym razem brzmi "unika pan trudnych pytań?".
- **Skutki po konferencji:** podgląd nagłówka z nazwą redakcji, skutki słowami (szatnia, zarząd, kibice, relacje z mediami), wiadomość w poczcie w kategorii Media.

### 2.4 Pomysły na później

- Deklaracje przedmeczowe wpływające na motywację rywala ("podgrzanie" derbów). Dziś konferencja przedmeczowa działa tylko na naszą szatnię, media i obietnice (rozdz. 7).
- Strefa mieszana z cytatami zawodników, które trener musi potem komentować.
- Trener zagraniczny z tłumaczem: odpowiedzi czasem źle przetłumaczone.
- Pytania o reprezentację, o młodzieżowca, o finanse klubu.
- Dziennikarze z charakterem: jeden zawsze pyta o wychowanków, inny o taktykę.

## 3. Zakres wdrożony i uzasadnienie

Wybrany podzbiór daje najwięcej realizmu przy małym ryzyku dla balansu i bez zmian w silniku meczu, transferach, zarządzie i poczcie:

1. **Osobne okno konferencji** (pełnoekranowe okno dialogowe nad odprawą). Na odprawie pomeczowej przycisk "Konferencja prasowa" jest opcjonalny, a "Dalej" ją pomija. Szyna kroków się nie zmienia, bo konferencja nie jest obowiązkowym etapem.
2. **Klimat prasy** z kontekstu i losowości (tabela 2.1), z narracją trwającą 2 do 4 meczów i relacjami z mediami. Widoczny już na odprawie (z powodami i opisem skutków pominięcia) oraz w nagłówku okna.
3. **Presja na morale** zawsze, także po pominięciu (2.2), z mnożnikami osobowości i limitem.
4. **Sala:** rzecznik, 4 do 5 nazwanych dziennikarzy z fikcyjnych redakcji, słowo wstępne, 3 pytania (4 przy agresywnej prasie), do 2 dopytań, łącznie najwyżej 5 pytań od dziennikarzy. Kolejność trenerów (gości pierwszy) w zapowiedzi rzecznika.
5. **Tony odpowiedzi** i "bez komentarza", nazwiska zawodników (pochwała, krytyka, ochrona), odbicie na sędziego z możliwym wnioskiem o ukaranie.
6. **Pamięć prasy:** obietnice (zwycięstwo w następnym meczu, mistrzostwo lub awans, cel zarządu) i pominięcie albo wyjście z sali.
7. **Skutki:** nagłówek z redakcją, opis słowami, wiadomość w poczcie przez istniejące `addMessages`.

Odłożone w pierwszej wersji, dodane później: kary za słowa o sędziach (rozdz. 5), prasa w ocenie zarządu (rozdz. 6), konferencja przedmeczowa (rozdz. 7). Nadal odłożone: strefa mieszana, tłumacz, dyskwalifikacja trenera (wymagałaby zmian w silniku i ławce).

## 4. Model w kodzie

| Funkcja (`src/match/press.js`) | Co robi |
|---|---|
| `pressState(game)` | Leniwie tworzy `game.press` (stare zapisy działają) |
| `pickClimate(ctx, state, seed)` | Klimat, szanse, powody (deterministycznie) |
| `openConference(ctx, state, climate, seed, phase)` | Sala, rzecznik, kolejka pytań (`phase`: `post` albo `pre`) |
| `answerQuestion(conf, i)` | Zapisuje odpowiedź, wstawia dopytanie, przechodzi dalej (nowy obiekt) |
| `walkOut(conf)` | Wyjście z sali przed końcem |
| `conferenceEffects(conf)` / `skipEffects(ctx, climate, state, phase)` | Skutki, nagłówek, limity, waga słów o sędziach (`ref`) |
| `pressMoraleDelta(teamDelta, persona)` | Morale zawodnika z mnożnikiem osobowości |
| `nextPressState(state, ...)` / `nextPressStatePre(state, ...)` | Narracja, relacje, obietnice po meczu; przed meczem tylko relacje i obietnice |
| `openCase`, `decideCase`, `priorOffences`, `DISCIPLINE` | Sprawa dyscyplinarna i decyzja komisji (rozdz. 5) |
| `pressBoardTerm(state, date)` | Składnik miesięcznej oceny zarządu (rozdz. 6) |
| `effectWords(eff)` | Skutki słowami do UI |

Dzień meczowy (`src/match/matchday.js`): `pressSetup(game, S, phase)` liczy klimat i salę leniwie, `doPress` rozlicza konferencję, `leaveStudio` (przejście do odprawy) i `closeMatchday` (Dalej) stosują skutki pominięcia, jeśli gracz nie był w sali. Skutki są stosowane dokładnie raz na fazę. Słowa o sędziach otwierają sprawę w `game.press.cases`; decyzję wydaje system dnia `press-discipline` (`src/match/pressSystem.js`), który księguje karę (`fines`) i zmienia zaufanie zarządu.

## 5. Kary za słowa o sędziach

### 5.1 Jak to wygląda naprawdę

- **Kto karze.** W Ekstraklasie Komisja Ligi Ekstraklasy, w 1 i 2 Lidze oraz w Pucharze Polski Komisja Dyscyplinarna PZPN (podstawa: Regulamin Dyscyplinarny PZPN). Sprawę zwykle zaczyna wniosek rzecznika dyscyplinarnego, decyzja zapada na najbliższym posiedzeniu, czyli po kilku dniach.
- **Czym karze.** Upomnienie albo nagana, kara pieniężna, przy poważniejszych sprawach dyskwalifikacja. Kara w zawieszeniu też się zdarza.
- **Przykłady (punkty odniesienia):**
  - Gonçalo Feio (Legia): 50 tys. zł od Komisji Ligi za wulgarne słowa wobec sędziego technicznego i zakaz prowadzenia drużyny w kolejnym meczu [ŹRÓDŁO P1, P2]. To górna granica dla słów w Ekstraklasie.
  - Adrian Siemieniec (Jagiellonia): 100 tys. zł i 6 meczów dyskwalifikacji za niedozwolony kontakt z sędzią przed meczem [ŹRÓDŁO P3]. Sprawa poważniejsza niż wypowiedź, w grze jej nie modelujemy, pokazuje tylko skalę kar Komisji Ligi.
  - Prezesi Cracovii (2020): kara w zawieszeniu za wypowiedzi znieważające sędziego; Komisja podkreśliła, że znieważanie sędziego jest deliktem dyscyplinarnym [ŹRÓDŁO P4].
  - Rzecznik Praw Obywatelskich zwracał uwagę, że regulaminy związków karzą także "publiczną krytykę" i "podważanie autorytetu" sędziów [ŹRÓDŁO P5]. W praktyce zwykła krytyka kończy się częściej upomnieniem niż wysoką karą.
- **Czego nie znalazłem.** Zestawienia kar za samą krytykę sędziów na konferencjach w 1 i 2 Lidze. Kwoty dla niższych lig są szacunkiem skalowanym do budżetów tych lig.

### 5.2 Model w grze [SZAC]

- Mocne odpowiedzi o sędziach mają wagę: "Te decyzje kosztowały nas punkty" 1, dopytanie "Niech każdy obejrzy powtórki" +1, "Wygraliśmy mimo sędziego" 1, przed meczem "Mam nadzieję, że tym razem gwizdek nie zdecyduje o wyniku" 1. Wycofanie się ("Tego nie powiedziałem") odejmuje 0,5, więc pojedyncza wypowiedź z odwrotem nie kończy się wnioskiem.
- Waga co najmniej 1: rzecznik dyscyplinarny składa wniosek (wiadomość w poczcie, kategoria Klub). Decyzja za 3 do 6 dni (system dnia `press-discipline`). Puchary UEFA i sparingi: bez sprawy krajowej.
- Wynik decyzji:

| Sytuacja | Umorzenie | Upomnienie | Kara |
|---|---|---|---|
| Pierwsze przewinienie, waga 1 | 25 % | 45 % | 30 % |
| Jedno przewinienie w ostatnich 365 dniach | 10 % | 25 % | 65 % |
| Dwa lub więcej | 5 % | 5 % | 90 % |
| Waga 2 i więcej, bez recydywy | 5 % | 20 % | 75 % |
| Waga 2 i więcej, recydywa | 3 % | 0 % | 97 % |

- Kwota: losowo z widełek ligi x (1 + 0,5 x (waga - 1)) x 1,5 za każde przewinienie z ostatniego roku (najwyżej 3), zaokrąglona do 500 zł, z limitem.

| Liga | Widełki (pierwsze przewinienie) | Limit | Organ |
|---|---|---|---|
| Ekstraklasa | 5 000 do 20 000 zł | 50 000 zł | Komisja Ligi Ekstraklasy |
| 1 Liga | 2 000 do 8 000 zł | 20 000 zł | Komisja Dyscyplinarna PZPN |
| 2 Liga | 1 000 do 4 000 zł | 10 000 zł | Komisja Dyscyplinarna PZPN |

- Kara trafia do księgi klubu jako `fines` (Kary PZPN), tak jak kary za kibiców. W rzeczywistości ukarany jest trener, ale kluby zwykle pokrywają takie kary; w grze płaci klub. Przy budżetach Ekstraklasy (dziesiątki milionów zł) kara nie zmienia sytuacji finansowej, ale jest widoczna.
- Zaufanie zarządu: upomnienie -1, kara -2, kara przy recydywie -3. Umorzenie bez skutków.

### 5.3 Źródła

- P1. PAP, "50 tys. złotych kary dla trenera warszawskiej Legii": https://www.pap.pl/aktualnosci/50-tys-zlotych-kary-dla-trenera-warszawskiej-legii-prowokacyjne-i-niesportowe
- P2. Soccerway, "Zawieszenie i 50 tysięcy złotych grzywny dla trenera Legii Goncalo Feio": https://pl.soccerway.com/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-zawieszenie-i-50-tysiecy-z-otych-grzywny-dla-trenera-legii-goncalo-feio/xSEy3vPr ; TVP Info: https://www.tvp.info/85295639/ekstraklasa-komisja-ligi-podjela-decyzje-o-ukaraniu-trenera-legii-warszawa-gonalo-feio-kara-finansowa
- P3. Rzeczpospolita, "Komisja Ligi ukarała Adriana Siemieńca i dwóch sędziów": https://sport.rp.pl/pilka-nozna/art45243741-surowe-kary-po-decyzji-komisji-ligi-adrian-siemieniec-zawieszony-na-szesc-meczow ; RMF24: https://www.rmf24.pl/fakty/sport/news-adrian-siemieniec-zdyskwalifikowany-komisja-ligi-oglosila-de,nIdn,1020236
- P4. Weszło, "Komisja Ligi: nie zmuszaj mnie, żebym ci nie pokazał, gdzie raki zimują!" (2020): https://weszlo.com/2020/12/17/komisja-ligi-nie-zmuszaj-mnie-zebym-ci-nie-pokazal-gdzie-raki-zimuja/ ; Radio Kraków, "Komisja Ligi ukarała prezesów Cracovii": https://www.radiokrakow.pl/aktualnosci/sport/komisja-ligi-ukarala-prezesow-cracovii/
- P5. Rzecznik Praw Obywatelskich, wystąpienie o karaniu za krytykę sędziów w związkach sportowych: https://bip.brpo.gov.pl/pl/node/26517/revisions/29265/view

Uwaga: P4 i P5 znam z wyników wyszukiwarki; pełnej treści nie dało się otworzyć z sesji, w której powstał ten rozdział. Kwoty i szanse w tabelach to szacunki projektowe, nie stawki z regulaminu.

## 6. Prasa w ocenie zarządu

Comiesięczna ocena zarządu (`boardMonth` w `src/career/board.js`) dostaje składnik `pressBoardTerm(game.press, data)` [SZAC]:

- każda konferencja z ostatnich 31 dni przy agresywnej prasie -0,8, przy pozytywnej +0,6;
- każde pominięcie albo wyjście z sali (po meczu i przed meczem) -0,3;
- relacje z mediami: (relacje - 50) x 0,02;
- razem od -2,5 do +1,5 punktu zaufania. Dla porównania: miejsce w tabeli względem celu daje od -7 do +6.

Opis trafia do wiadomości z oceną: "Media nie zostawiają na nas suchej nitki. Zarząd nie lubi czytać takich nagłówków.", "Prasa jest krytyczna wobec klubu.", "Wizerunek klubu w mediach słabnie.", "Media piszą o klubie przychylnie.", "Dobra prasa wokół klubu. Zarząd to docenia.", "Zarząd zauważył, że trener unika konferencji prasowych.".

## 7. Konferencja przedmeczowa

- **Gdzie.** W studiu przedmeczowym: pasek z klimatem i salą, przycisk "Konferencja przedmeczowa" (opcjonalny), to samo osobne okno co po meczu. "Przejdź do odprawy" pomija konferencję.
- **Klimat.** Ten sam model co po meczu, ale bez składnika wyniku (forma, tabela, wielkość klubu, derby, kryzys, relacje, narracja z poprzednich meczów). Konferencja przedmeczowa nie zmienia narracji, zmienia relacje i obietnice.
- **Pytania.** Oczekiwania (faworyt, outsider), rywal i jego gwiazda, skład i absencje, atmosfera derbów, posada trenera pod presją, seria porażek lub zwycięstw, sędzia meczu, typ na wynik, a z banku pomeczowego: forma, cel zarządu, obietnice sezonu, kibice, plotki transferowe, tabela. Bez słowa wstępnego, rzecznik zapowiada liczbę pytań.
- **Skutki [SZAC].** Presja klimatu o połowę mniejsza niż po meczu, odpowiedzi działają w 60 %, limity: morale drużyny od -0,8 do +0,6, zarząd ±3, kibice ±4. Morale zmienia się przed pierwszym gwizdkiem, więc działa w meczu.
- **Obietnice.** "Wygramy" przed meczem zostaje w pamięci prasy i wraca na konferencji po tym meczu (dotrzymana albo złamana).
- **Pominięcie.** Agresywna prasa: relacje -2, morale -0,4; neutralna: relacje -1; pozytywna: relacje -0,5, morale +0,1. Nagłówek ("odwołał konferencję przed meczem") w poczcie.

## Po meczu pucharowym: rozstrzygnięcie zamiast wyniku (Nov 13, 2026)

Wcześniej konferencja, studio, zarząd, kibice i nagłówki liczyły wynik tylko z bramek: Superpuchar wygrany w serii rzutów karnych był remisem (pytanie „Remis to dobry czy zły wynik?”, zarząd rozczarowany jak po remisie), a w dwumeczu liczył się sam rewanż. Odprawy znały rozstrzygnięcie od dawna (`postOutcome`), reszta nie. Teraz wszystkie korzystają z jednego źródła:

- **`tieInfo` (matchday.js).** Rodzaj meczu z kontekstu odpraw (`kind`: Superpuchar, finał, etap PP, puchary UEFA, baraże), finał, dwumecz, rozstrzygnięcie (`trophy`, `lostFinal`, `adv`, `padv`, `promoted`, `out`, `pout`), seria karnych z perspektywy gracza i szansa na awans przed meczem `pAdv` (pWin + pDraw/2, ±0,25 przy zaliczce lub stracie z pierwszego meczu).
- **Konferencja.** Wynik dla prasy to awans albo odpadnięcie. Pytania o wynik meczu (remis, porażka, zwycięstwo, styl) znikają; zamiast nich pada pytanie o rozstrzygnięcie jako pierwsze: trofeum, przegrany finał, seria karnych, awans, odpadnięcie, awans do wyższej ligi, pierwszy mecz dwumeczu. Słowo wstępne trenera i odpowiedzi o sędziach też mówią o trofeum lub awansie, nie o punktach.
- **Zarząd i kibice [SZAC].** Po rozstrzygnięciu: wygrana `max(1, 6·(1-pAdv)·ranga)` dla zarządu i `max(2, 8·(1-pAdv)·ranga)` dla kibiców, trofeum +3/+5, awans do wyższej ligi +6/+8; odpadnięcie `-6·pAdv·ranga` i `-8·pAdv·ranga`, przegrany finał ×0,6, odpadnięcie po karnych ×0,8. Ranga: wczesna runda PP 0,6, ćwierćfinał 0,8, półfinał i Superpuchar 1, finał PP 1,3, eliminacje UEFA 0,9, faza pucharowa UEFA 1,1, półfinał UEFA i Superpuchar UEFA 1,3, finał UEFA 1,6, baraże 1,2 i 1,5. Pierwszy mecz dwumeczu liczy się w 60 %.
- **Studio.** Wynik „1:1, k. 4:3”, etykieta „Zwycięstwo po rzutach karnych”, werdykt o rozstrzygnięciu, nagłówki o trofeum, serii karnych, awansie i odpadnięciu zamiast „Remis, który nikogo nie cieszy”.
- **Kibice w tle (`career/fans.js`).** Napięcie i protesty liczą awans albo odpadnięcie w PP, Superpucharze, barażach i rewanżach UEFA z uwzględnieniem pierwszego meczu i serii karnych (`tieWinner`), trofeum dodaje +1 do oceny meczu.
