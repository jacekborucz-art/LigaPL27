# Raport ogólny o drużynie (asystent i główny analityk)

Stan na Nov 16, 2026. Zgłoszenie użytkownika: „Dodanie raportu ogólnego na temat drużyny przekazanego trenerowi od
asystenta i głównego analityka. Dokładność raportu zależy od atrybutów asystenta i analityka oraz sztabu + małe RNG.”

Panel: trener Ekstraklasy (licencja UEFA Pro), główny analityk klubu (dane meczowe i wideo), asystent trenera, trener
przygotowania fizycznego, trener bramkarzy, fizjoterapeuta i lekarz, skaut. Potem grafik (skill `frontend-design`)
i programista. Kod: `src/career/teamReport.js` (logika, stan, system dnia), `src/ui/teamReportView.js` (widok),
`src/styles/assistant.css` (style `.trep`), `src/app.js` (podzakładka Kadra, Raport ogólny), `src/ui/trainingView.js`
(atrybuty asystenta i analityka w Trening, Sztab). Testy: `tests/teamReport.test.mjs`.

Oznaczenia: [SZAC] szacunek projektowy, MUST / SHOULD / LATER priorytet.

## 1. Burza mózgów: jak wygląda taki raport w klubie

Fakty z praktyki klubów (wiedza panelu, bez nowych źródeł z sieci; liczby w grze to [SZAC]):

- W Ekstraklasie raport okresowy dla pierwszego trenera robi zwykle asystent z analitykiem (w większych klubach dział
  analiz 2-4 osób, w mniejszych jeden analityk wideo). Rytm: krótko co tydzień (mikrocykl), szerzej co miesiąc
  albo w przerwie na reprezentacje, podsumowanie rundy zimą i latem.
- Kluby z czołówki Europy (Premier League, Bundesliga) składają raport z części przygotowanych przez specjalistów:
  analiza meczowa (dane: xG, strzały, posiadanie, stałe fragmenty), performance (obciążenia GPS, ACWR, ryzyko urazów),
  medyczna (dostępność), rekrutacja (głębia kadry i luki), akademia. Każda część ma autora i poziom pewności.
- Struktura, którą panel uznał za wspólną: 1) podsumowanie na jedną stronę, 2) siła i dostępność kadry według formacji,
  3) wyniki a jakość gry (punkty wobec xG i siły kadry), 4) tożsamość taktyczna i przewidywalność, 5) stałe fragmenty,
  6) głębia składu na każdej pozycji, 7) zdrowie i obciążenia, 8) rozwój młodych, 9) najbliżsi rywale,
  10) zalecenia z priorytetem.
- Trener nie dostaje „prawdy”: dostaje opinię sztabu. Słaby analityk myli kolejność, przegapia trendy i mówi ogólnie.
  Dobry podaje liczby, przedziały i wie, czego nie wie.

Głosy panelu (skrót):
- Trener: „Pierwsze pół strony ma mi powiedzieć, gdzie tracę punkty i co zrobić w tym miesiącu. Reszta to dowody.”
- Analityk: „Wyniki są faktem, ale ich interpretacja (ponad stan, pech w wykończeniu) zależy od jakości analizy.
  Rywali i własną siłę oceniamy na tle ligi, nie w liczbach absolutnych.”
- Asystent: „Głębia składu to moja część: kto realnie zastąpi podstawowego, gdzie nie ma nikogo z nominalną pozycją.”
- Trener przygotowania fizycznego i fizjoterapeuta: „Liczby obciążeń na zawodnika są już w raporcie asystenta co
  2 tygodnie. W raporcie ogólnym tylko obraz drużyny: dostępność, strefa ryzyka, zagęszczenie meczów.”
- Trener bramkarzy: „Ocena pozycji bramkarza powinna uwzględniać mnie, nie tylko analityka.”
- Skaut: „Luki w kadrze to wskazówka dla rekrutacji: pozycja i poziom, nie nazwiska z innych klubów.”

## 2. Co już jest w grze (bez dublowania)

| Element | Gdzie | Związek z nowym raportem |
| --- | --- | --- |
| Raport asystenta o zawodniku i okresowy raport o drużynie (atmosfera, obciążenia, ryzyko urazów, rozmowy, rozwój) | `src/career/assistantReport.js`, `docs/raport-asystenta.md` | Nowy raport nie powtarza list nazwisk do odpoczynku i rozmów; odsyła do niego. Wspólny model błędu `estimateSd`, `precisionOf`, `estimate` (potencjał). |
| Sztab: 5 ról z jedną jakością 1-20 | `src/training/staff.js` | Rola „Analityk wideo” istnieje: to główny analityk. Nowej roli nie dodajemy. |
| Siła składu w strefach | `src/engine/teamStrength.js` (`teamRating`) | Siła formacji na tle ligi: ta sama funkcja dla wszystkich klubów. |
| Zgranie, stałe fragmenty, przewidywalność | `src/training/cohesion.js`, `src/training/scouting.js` | Część „Styl i taktyka”, „Stałe fragmenty”. |
| Wyniki i statystyki meczów | `standings`, `f.result.stats` (strzały, xG, posiadanie) | Część „Wyniki i gra”. |

Główny analityk: rola `analityk` w sztabie (jakość 1-20 jak dotąd). Właściciel chce „atrybutów”, więc asystent
i analityk dostają po dwa atrybuty pochodne (MUST), bez zmiany zapisu:

| Rola | Atrybut | Na co wpływa |
| --- | --- | --- |
| Asystent | Ocena zawodników (OCE) | siła formacji, głębia składu, młodzi |
| Asystent | Analiza taktyczna (TAK) | styl i taktyka, dopasowanie formacji |
| Analityk | Analiza danych (DAN) | siła formacji, wyniki a gra, rywale |
| Analityk | Analiza wideo (WID) | styl i taktyka, stałe fragmenty, rywale |

Wzór [SZAC]: `d = round(gauss(0; 1,6))` w zakresie od -3 do 3 z ziarna `sztab-atrybuty:{gra}:{klub}:{rola}:{nazwisko}`,
pierwszy atrybut `q + d`, drugi `q - d` (od 1 do 20). Średnia zostaje równa jakości, więc nic w dotychczasowej
mechanice się nie zmienia. Ten sam wzór działa dla każdego klubu (kluby AI raportu nie potrzebują).

## 3. Wzór raportu (sekcje, dane, podpis)

| Część | Dane | Jak pokazana | Podpis | Jakość sekcji qe [SZAC] |
| --- | --- | --- | --- | --- |
| Podsumowanie | wszystko niżej | 3-4 zdania | asystent | |
| Zalecenia | wnioski z części | do 5 pozycji, priorytet, przycisk akcji | asystent | |
| Siła formacji na tle ligi | `teamRating` wszystkich klubów ligi (dostępni zawodnicy) | 4 paski: nasza ocena, średnia ligi, średnia czołowej trójki, miejsce w lidze | analityk | 0,5 DAN + 0,5 OCE; bramkarz 0,4 DAN + 0,3 OCE + 0,3 trener bramkarzy |
| Wyniki i gra | tabela, bilans dom i wyjazd, forma 5 meczów, średnie strzałów, xG i posiadania, miejsce „na papierze” | fakty dokładne, interpretacja z błędem | analityk | DAN |
| Styl i taktyka | formacja, instrukcje, zgranie, przewidywalność dla rywali, najlepiej pasująca formacja | słowa, liczby przy wysokiej pewności | asystent i analityk | 0,5 TAK + 0,5 WID |
| Stałe fragmenty | wyćwiczenie (sp), wykonawcy (SFR), gra w powietrzu (GLO, SKO) na tle ligi | słowa i liczby | analityk | WID |
| Głębia składu | każda pozycja ustawienia: podstawowy, 2 zmienników, luka | tabela pozycji | asystent (bramkarze z trenerem bramkarzy) | OCE; bramkarz 0,6 OCE + 0,4 trener bramkarzy |
| Zdrowie i obciążenia | kontuzje (fakty), liczba w strefie ryzyka, świeżość jedenastki, mecze w 14 dni | liczby i słowa | trener przygotowania fizycznego | 0,7 fizyczny + 0,3 OCE |
| Młodzi i rozwój | udział minut do 21 lat, najlepsze talenty (potencjał w ocenie sztabu), akademia | lista | trener młodzieży | ocena potencjału z `estimate` (asystent i trener młodzieży) |
| Najbliżsi rywale | 3 najbliższe mecze o stawkę: siła rywala, miejsce, forma | wiersz na mecz | analityk | 0,6 WID + 0,4 DAN |

## 4. Model dokładności

- Odchylenie błędu sekcji: `sd = 0,3 + 0,16 x (20 - qe)` (ten sam wzór co raport asystenta, `estimateSd`). Pewność:
  `sd` do 1,3 wysoka (qe ok. 14+), do 2,3 średnia (qe ok. 8-13), powyżej niska.
- Szum liczb [SZAC]: siła formacji `0,3 x sd` (asystent 5: ok. 0,8 pkt, czyli miejsce w lidze potrafi być o 3-5 pozycji
  obok; asystent 18: ok. 0,2 pkt), siła rywala `0,3 x sd`, dopasowanie formacji `0,12 x sd`, ocena zawodnika w głębi
  składu `0,3 x sd x (1 + 0,8 x (1 - znajomość))`, wykonawcy stałych fragmentów `0,25 x sd`.
- Błędy widoczne dla gracza: zła kolejność miejsc w lidze, zły faworyt, zła kolejność zmienników, chybiona propozycja
  formacji, przegapione sprawy (szansa zauważenia jak w raporcie asystenta: 0,45 + 0,03 x qe, od 0,5 do 1).
- Wyświetlanie: wysoka pewność liczby (jedno miejsce po przecinku, dokładne miejsce), średnia zaokrąglone liczby
  i przedział miejsc (np. „ok. 3.-5. miejsce”), niska same słowa („w czołówce ligi”, „średnio”). Fakty (wyniki,
  kontuzje, tabela) zawsze dokładnie.
- Losowość: deterministyczna, ziarno `raport-druzyny:{gra}:{klub}:{id raportu}:{temat}`. Ten sam raport po
  odświeżeniu i po wczytaniu zapisu. Nowy raport losuje błąd od nowa (to „małe RNG” z prośby).
- Każda część ma podpis (rola, nazwisko) i znacznik pewności (trzy kreski jak w raporcie o zawodniku).

## 5. Częstotliwość i stan w zapisie

- MUST: raport co miesiąc, pierwszego dnia od 3. dnia miesiąca, który nie jest dniem meczu (po raporcie rozwoju z 1. dnia
  i raporcie asystenta z wtorku). Wiadomość w poczcie (kategoria sztab, klucz `trep:{data}`) z podsumowaniem i wskazówką,
  gdzie jest pełny raport.
- MUST: na żądanie przycisk „Poproś o nowy raport”, gdy ostatni raport ma co najmniej 14 dni [SZAC]. Raport miesięczny
  nie przychodzi, jeśli raport na żądanie powstał w ostatnich 7 dniach.
- Stan: `game.teamReport = { v, club, cur, prev, month }`. `cur` to gotowy raport (dane widoku, ok. 5-8 KB), `prev`
  skrót do porównania (siła formacji, miejsce, zgranie). Zmiana klubu czyści stan. Stary zapis dostaje pusty stan
  (`ensureTeamReport`, także w `ensureGameShape`).
- Koszt: liczenie tylko dla klubu gracza, raz w miesiącu albo na żądanie (siła ok. 18 kadr i 12 formacji, kilka ms).
  Bez wpływu na mecze, trening i kluby AI; własne ziarna, nie zużywa strumieni losowości gry.

## 6. Gdzie w grze

- MUST: Kadra, nowa podzakładka „Raport ogólny” (obok Zawodnicy, Skład i taktyka, Rozmowy).
- MUST: wiadomość w poczcie po każdym raporcie.
- SHOULD: atrybuty asystenta i analityka na kartach w Trening, Sztab.
- LATER: link z Pulpitu, archiwum raportów (3 ostatnie), raport rundy (zima, lato) z porównaniem do celu zarządu,
  raport skauta o lukach (nazwiska z rynku), wykres siły formacji w czasie.

## 7. Wartość dla gracza (decyzje)

- Gdzie wzmocnić kadrę w oknie (najsłabsza formacja na tle ligi, luki w głębi składu).
- Czy zmienić formację (kadra lepiej pasuje do innego ustawienia) i czy rywale nas już rozczytali.
- Czy wyniki to forma, czy pech (gole wobec xG, miejsce wobec siły kadry), więc czy zmieniać coś na siłę.
- Akcent treningu (stałe fragmenty, taktyka), rotacja przy zagęszczeniu meczów, minuty dla młodych, kontrakty kluczowych.
- Lepszy sztab daje pewniejsze wnioski: zatrudnienie dobrego analityka ma sens także poza premią za analizę rywala.

## 8. Priorytety

- MUST: moduł `teamReport.js` (wszystkie części z rozdziału 3, model dokładności, stan, system dnia, żądanie
  z odstępem 14 dni), widok w Kadra, wiadomość w poczcie, atrybuty pochodne asystenta i analityka, testy
  (dokładność rośnie z jakością sztabu, determinizm, wszystkie części, stary zapis, zawodnik bez kontraktu).
- SHOULD: atrybuty na kartach sztabu, strzałki zmian wobec poprzedniego raportu.
- LATER: rozdział 6, LATER.

## 9. Pomiar

Test `tests/teamReport.test.mjs` sprawdza średni błąd siły formacji przy całym sztabie 5 i 18 (błąd przy 18 wyraźnie
mniejszy) i trafność miejsca w lidze.

Pomiar [SYM] (ziarno 21, start sezonu, 60 raportów, cały sztab tej samej jakości; błąd oceny formacji w punktach,
błąd miejsca w lidze w pozycjach, odsetek dokładnie trafionych miejsc):

| Jakość sztabu | Widzew: błąd oceny | Widzew: błąd miejsca | Widzew: trafione | Legia: błąd miejsca | Legia: trafione |
| --- | --- | --- | --- | --- | --- |
| 5 | 0,57 | 2,7 | 14 % | 2,0 | 31 % |
| 10 | 0,40 | 2,0 | 19 % | 1,1 | 45 % |
| 14 | 0,26 | 1,2 | 31 % | 0,6 | 60 % |
| 18 | 0,12 | 0,5 | 59 % | 0,2 | 83 % |

Klub ze środka tabeli ma ciaśniej ułożonych sąsiadów, więc nawet dobry sztab myli się tam częściej o jedno miejsce.
Dlatego przy średniej pewności raport podaje przedział miejsc, a przy niskiej tylko słowa.
