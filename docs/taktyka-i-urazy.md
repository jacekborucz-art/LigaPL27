# 4-4-2 defensywne i ofensywne, lekkie urazy, oceny na żywo, ustawienie w osłabieniu

Stan na Nov 11, 2026. Prośby użytkownika:

1. „brak taktyk 4-4-2 defensive, 4-4-2 ofensive (dodać logikę i kalkulację użycia tych taktyk)”
2. „lekkie kontuzje? (czy są) … ikonka białego krzyżyka na ikonie piłkarza”, „dopuszczenie grania kilkoma lekko
   kontuzjowanymi zawodnikami: jaka kara?”
3. „real time oceny w meczu” (tu: dane z silnika; widok zrobi ktoś inny)
4. „brak możliwości ustawienia zawodnika na dowolnej pozycji w przypadku czerwonej kartki … to samo musi działać dla AI”

Panel: ekspert silnika i AI, trener z licencją UEFA Pro, programista, projektant interfejsu gry.
Oznaczenia: [SZAC] szacunek projektowy bez źródła, [SYM] wynik symulacji w tym repozytorium. W tej sesji nie
przeglądaliśmy źródeł w sieci: opisy taktyczne i medyczne to wiedza ogólna panelu, liczby oznaczone [SZAC].

## 1. Burza mózgów: dwa warianty 4-4-2

### Trener: czym różnią się od zwykłego 4-4-2

| | 4-4-2 (Dwie Linie) | 4-4-2 defensywne (Niski Blok) | 4-4-2 ofensywne (Wysokie Skrzydła) |
|---|---|---|---|
| Linia obrony | środkowa | nisko, ok. 25-30 m od bramki | przy linii środkowej, pułapka ofsajdowa |
| Odstęp między liniami | ok. 15 m | 10-12 m, bardzo zwarto | duży, miejsce między liniami dla rywala |
| Boczni pomocnicy | szerokość i powrót | schodzą do środka, asekurują bocznych obrońców (blok 4+4 na szerokość pola karnego) | grają jak skrzydłowi, wysoko i szeroko; boczni obrońcy podłączają się |
| Napastnicy | dwóch na środkowych obrońców | jeden cofa się na defensywnego pomocnika rywala (bez piłki 4-4-1-1), drugi czeka na kontrę | obaj w polu karnym, pierwsi pressują |
| Wyzwalacze pressingu | podanie do środka | dopiero na własnej połowie: podanie do boku (pułapka przy linii), podanie do tyłu, złe przyjęcie | podanie do bramkarza, do bocznego obrońcy, przyjęcie tyłem do bramki |
| Po odbiorze | mieszane | szybko do przodu, kontra dwoma napastnikami i bocznym pomocnikiem | szybki atak, dośrodkowania, dużo ludzi w polu karnym |
| Kiedy | punkt wyjścia | obrona prowadzenia, mecz z silniejszym, wyjazd | pogoń za wynikiem, mecz ze słabszym, u siebie |
| Słabości | środek przeciw trzem pomocnikom | mało posiadania i sytuacji, rywal dośrodkowuje i strzela z dystansu, stałe fragmenty pod własną bramką | kontry za plecy, zmęczenie, faule taktyczne |

Wniosek trenera: to ten sam zestaw zawodników i ról. Zmienia się wysokość linii, zachowanie bocznych pomocników
i napastników, czyli instrukcja zespołowa, a nie nowe ustawienie personalne. Dlatego przejście między wariantami
w meczu jest tańsze niż przejście na inną formację.

### Ekspert silnika: odwzorowanie w danych formacji

Warianty mają **te same role na slotach** co 4-4-2 (BO, ŚO, ŚO, BO, SP, ŚP, ŚP, SP, NAP, NAP). Siły stref (udziały ról,
`ROLE_SHARE`) są więc takie same i ten sam skład pasuje bez kary za pozycję. Różnice idą przez dane, które silnik
już czyta, i jedno nowe pole:

| Parametr | 4-4-2 | 4-4-2 defensywne | 4-4-2 ofensywne | Działanie w silniku |
|---|---|---|---|---|
| Współrzędne | y obrony 21-25, pomocy 47-50, ataku 75 | obrona 16-19, pomoc 35-37, napastnicy 58 i 66, SP x 21/79 | obrona 26-33, pomoc 52-62, napastnicy 83, SP x 12/88 | rysowanie (UI) |
| W (szerokość) | 1,0 | 0,85 | 1,15 | przełamanie SKR: `0,25*(W_atak - W_obrona)` |
| act POZ/SKR/KON/DYS | 1,0/1,15/1,1/1,0 | 0,85/1,0/1,3/0,95 | 1,0/1,25/0,95/1,0 | proporcje typów własnych akcji |
| counterVuln | 1,0 | 0,8 | 1,2 | waga kontr rywala |
| fx (nowe) | brak | `pActMul 0,92, D +0,5, oppPActMul 0,88, pos -0,05, oppAct KON 0,8 / SKR 1,12 / DYS 1,2, oppOffsideMul 0,7, fatMidMul 0,95` | `pActMul 1,12, D -0,4, oppPActMul 1,06, oppAct KON 1,25, oppOffsideMul 1,25, fatMul 1,06, foulMul 1,05` | te same klucze co efekty instrukcji (`src/data/instructions.js`), łączone w `tacticParams` |
| family | 442 | 442 | 442 | zmiana w rodzinie kosztuje 5 pkt spójności zamiast 10 |

Wszystkie wartości [SZAC], dobrane symulacją (rozdz. 6). Pole `fx` jest ogólne: każda formacja może je dostać, starych
formacji nie zmienialiśmy (ich balans jest skalibrowany). Efekty łączą się z instrukcjami, więc 4-4-2 defensywne
z nastawieniem „Zamurowanie” broni jeszcze głębiej, ale ma jeszcze mniej akcji.

Dlaczego nie dominują: na cały mecz obie wersje dają tyle samo punktów co zwykłe 4-4-2 (różnica w granicach szumu)
i wyraźnie mniej niż 4-2-3-1. Niski blok zmniejsza liczbę goli po obu stronach (mniej strzałów i straconych, ale też
mniej strzelonych), ofensywne odwrotnie. Zysk pojawia się dopiero we właściwej sytuacji: przy obronie prowadzenia
(niski blok) i w pogoni (ofensywne).

### AI trenera: kiedy wybiera warianty

`variant442` w `src/engine/match/coach.js`, tylko w pełnym składzie i tylko gdy drużyna już gra którymś 4-4-2
(zmiana bez zmian personalnych, w punktach przeglądu planu, nie częściej niż co 10 minut, szansa 75 %, uparty trener 40 %):

| Stan | Zmiana | Powód w relacji |
|---|---|---|
| Przegrywamy, od minuty pogoni (65., przy -2 od 60., trener ofensywny 10 min wcześniej, ostrożny 5 min później), w przerwie przy -2, w dogrywce | 4-4-2 ofensywne | „gonimy wynik: wyżej linie, skrzydłowi do przodu” |
| Prowadzimy jednym golem od 72. min (przy +2: trener ostrożny albo rywal przeważa, od 75.) | 4-4-2 defensywne | „bronimy wyniku: niski blok, dwie linie po czterech” |
| Remis od 75. min z wyraźnie silniejszym (różnica siły < -1), poza pucharem | 4-4-2 defensywne | „bierzemy punkt z silniejszym: niski blok” |
| Niski blok, a straciliśmy gola przed minutą pogoni | 4-4-2 | „straciliśmy gola: wychodzimy z niskiego bloku” |
| Ofensywne, a już prowadzimy albo wyrównaliśmy (bez przewagi siły) | 4-4-2 | „prowadzimy / wyrównaliśmy: wracamy do równowagi” |

Dodatkowo: pogoń ze zmianą zawodnika z 4-2-3-1 prowadzi przez 4-4-2 (jak dotąd), a dalej do 4-4-2 ofensywnego;
`shortShape` w osłabieniu używa niskiego bloku 4-4-1 przy prowadzeniu albo z silniejszym rywalem; ławka rywala
traktuje 4-4-2 defensywne jak głęboką obronę (`DEEP`). Wybór formacji przed meczem jest poza zakresem
(`src/match/matchday.js` należy do innego zadania).

### Projektant interfejsu

Nowe formacje pojawiają się same w chipach ekranu „Skład i taktyka” (`tacticsView.js` rysuje `FORMATIONS`) i w liście
„Ustawienie” w oknie „Zmiany i taktyka”. Nazwy „4-4-2 defensywne” i „4-4-2 ofensywne” mieszczą się w chipie z zawijaniem.
Współrzędne slotów pokazują różnicę od razu: niski blok to dwie ciasne linie blisko bramki, ofensywne to wysoka obrona
i skrzydłowi przy liniach bocznych. Propozycja (do decyzji): przy chipach rodziny 4-4-2 krótki dopisek z `nick`
(„Niski Blok”, „Wysokie Skrzydła”) i z `note`.

## 2. Burza mózgów: lekka kontuzja (gra z bólem)

### Co to jest

Lekki uraz to taki, z którym zawodnik może dokończyć mecz, choć gra słabiej i ryzykuje:

| Typ (kod) | Medycznie | W meczu | Ryzyko |
|---|---|---|---|
| stłuczenie (`contusion`) | uderzenie, krwiak w mięśniu („martwa noga”) | ból przy sprincie i strzale, kara do formy 3 % OVR | małe: pogłębienie do krwiaka (8-16 dni) |
| naciągnięcie mięśnia (`strain`) | uraz mięśnia I stopnia, najczęściej dwugłowy uda | brak szybkości i przyspieszenia, kara 6,5 % OVR | duże: naderwanie (18-35 dni) |
| lekkie skręcenie kostki (`sprain`) | skręcenie I stopnia, zawodnik gra z taśmą | gorsze zwroty i odbicia, kara 5 % OVR | średnie: uszkodzenie więzadła (20-42 dni) |

Wstrząśnienie mózgu nigdy nie jest lekkim urazem: zawodnik schodzi (protokół).

### W meczu

- Zawodnik zostaje na boisku z `x.knock = { name, type, since, pre, aggravated, aggravatedAt, days }`
  (stary `x.injury` z `playable: true` też zostaje, dla zgodności).
- Kara do formy wg typu (`KNOCK.types[].pen * OVR`), męczy się o 12 % szybciej.
- Co minutę gry z bólem szansa pogłębienia `agg` [SZAC]: naciągnięcie 0,45 %, skręcenie 0,25 %, stłuczenie 0,10 %,
  razy 1,4 przy kondycji poniżej 70, razy 1,15 od 30 lat, razy `fatMul` drużyny (pressing, tempo), razy pogoda.
  Przy grze do końca (ok. 45 min) to ok. 18 %, 11 % i 4 %, zgodnie z założeniem `ekspert_futbol.md` 8.3 („p = 0,20”).
- Pogłębienie: uraz średni, zawodnik schodzi, zdarzenie `injury` z `aggravated: true`. Kolejny uraz grywalny u kogoś,
  kto już gra z bólem, też oznacza pogłębienie.

### Kilku lekko kontuzjowanych naraz: kara

Jeden kulejący to jego własna kara. Przy kilku drużyna płaci dodatkowo: partnerzy asekurują, biegają za nich, linie się
rozjeżdżają (organizacja i spójność). Kara stref (DEF, MID, ATT) od drugiego zawodnika [SZAC]:

`kara = min(0,6; 0,15 * (n - 1)^1,3)`

| Lekko kontuzjowanych na boisku | 1 | 2 | 3 | 4 | 5+ |
|---|---|---|---|---|---|
| Kara drużyny (pkt stref) | 0 | 0,15 | 0,37 | 0,62 → 0,6 | 0,6 |

Dla porównania brak zawodnika to 0,9 pkt, więc nawet pięciu kulejących to mniej niż gra w dziesiątkę, ale razem
z karami indywidualnymi wyraźnie odczuwalne. Ryzyko pogłębienia rośnie o 10 % za każdego kolejnego kulejącego
(więcej pojedynków i biegania). Wartość widać w `T.knocked` i `T.knockPen`.

### Po meczu

- Lekki uraz bez pogłębienia: przerwa z losowania typu (stłuczenie 1-5 dni, naciągnięcie 5-14, skręcenie 4-12)
  plus 1 dzień za każde pełne 30 minut gry z naciągnięciem lub skręceniem, najwyżej 14 dni. Wczesna zmiana się opłaca.
- Pogłębienie: przerwa urazu średniego.
- `result().ratings[i].knock = { name, type, since, pre, aggravated, aggravatedAt, minutes }`, `injury` z dniami po
  przeliczeniu (trafia do `result().injuries` i dalej do sezonu).
- Sezon (`src/season/season.js applyResult`, zmiana jednego warunku): dłuższa przerwa zastępuje krótszą, więc pogłębiony
  uraz zawodnika, który zagrał z urazem sprzed meczu, nie ginie.

### Gra z urazem sprzed meczu

Zawodnik z lekkim urazem do 7 dni przerwy (`knockEligible(p)`: kategoria lekka, bez wstrząśnienia mózgu) może zagrać,
gdy ma flagę `p.playingInjured` (decyzja gracza albo AI; flaga i modyfikator „Gra z urazem” istniały wcześniej, brakowało
reguły). `checkTactics` blokuje flagę przy poważniejszym urazie. W meczu zawodnik ma `x.knock.pre = true` od 1. minuty,
karę z modyfikatora (-4,5 % OVR), ryzyko pogłębienia i karę zespołową jak wyżej. Po meczu przerwa wydłuża się
o dzień za każde 30 minut gry z naciągnięciem lub skręceniem.

### AI trenera

`knockSubs` w `coach.js` (od razu po urazie i w kolejnych przeglądach) i `planSubs` (punkty kontrolne):

- naciągnięcie i skręcenie: zmiana od razu z szansą 85 %;
- kilku kulejących: najbardziej zagrożony schodzi (60 %), nawet ze stłuczeniem;
- pojedyncze stłuczenie: gra do przerwy, potem zmiana z szansą 55 % w punkcie kontrolnym;
- przed 70. minutą jedna zmiana zostaje w zapasie (poza urazem ryzykownym); od 86. minuty gra dalej;
- bramkarz tylko wtedy, gdy na ławce jest bramkarz; przy wyborze „najmniej potrzebnego” kulejący idzie pierwszy.

[SYM] 4000 meczów, gospodarz pasywny (nie zmienia), gość AI: lekkich urazów 453 i 473. Pasywny: pogłębienie 13 %
(naciągnięcie 23 %, skręcenie 12 %, stłuczenie 4 %). AI: zmiana od razu 52 %, do 5 min 10 %, później (przerwa,
punkt kontrolny) 25 %, bez zmiany 13 % (końcówka, brak zmian), pogłębienia 2 na 473.

### UI: biały krzyżyk

`playerStates(M, side)[i].knock !== null && on` oznacza biały krzyżyk na ikonie zawodnika. Zdarzenie `injury`
z `knock: true` i `knockType` to moment urazu (relacja, dźwięk), z `aggravated: true` to pogłębienie (krzyżyk znika,
zawodnik schodzi). Obecny czerwony znak urazu w `matchdayView.js` (`x.injury`) można zostawić dla urazów bez gry.

## 3. Oceny na żywo

`liveRatings(M)` z `src/engine/match/match.js` zwraca `{ [idZawodnika]: ocena }` dla wszystkich, którzy weszli na
boisko. Ta sama skala i te same składniki co ocena końcowa w `result()`: zdarzenia (`x.ev`), czyste konto od 60 min,
premia za **bieżące** prowadzenie (+0,2/-0,2), krótki występ poniżej 20 min x0,6, zakres 3-10, zaokrąglenie do 0,1.
Bez szumu N(0; 0,2), który `result()` dodaje na końcu, i bez użycia RNG, więc wołanie po każdej minucie nie zmienia
meczu. Koszt: jedna pętla po zawodnikach (ok. 30).

[SYM] 500 meczów: średnia różnica |na żywo na koniec - końcowa| 0,155 (to szum oceny końcowej), przesunięcie średnie 0,011,
koszt jednego wywołania ok. 6 µs.

## 4. Dowolne ustawienie w osłabieniu

Przyczyna błędu: po czerwonej kartce silnik sam wybierał puste miejsca (pozycje `drop` albo dopasowanie
w `assignSlots`). Gracz wybierał tylko formację, więc w 5-4-1 nie mógł postawić pięciu obrońców, jeśli silnik uznał,
że lepiej zostawić pustą obronę.

Rozwiązanie (programista, trener, projektant):

- `changeTactics(M, side, { formation, assign: { [idZawodnika]: indeksSlotu }, empty: [indeksSlotu] })`:
  dowolny zawodnik na dowolnym slocie i wybór pustych miejsc. Można podać samo `empty` (silnik rozstawia resztę wg
  dopasowania), samo `assign` (puste zostaje to, czego nie przypisano) albo częściowe `assign`.
- Walidacja (błąd: `{ ok: false, error }`, mecz bez zmian, bez zdarzenia): istniejąca formacja; puste miejsca różne,
  w zakresie, bez bramki, dokładnie `11 - liczba zawodników na boisku`; przypisani zawodnicy grają teraz (także
  opatrywani); jeden zawodnik na slot; ktoś w bramce (zawodnik z pola też może, Law 3).
- Koszt spójności: zmiana formacji 10 (w rodzinie 4-4-2: 5), samo przestawienie zawodników 5, w przerwie 0.
- Ręczny układ zostaje (`T.emptyIdx`): po zmianie instrukcji, po zmianie zawodnika (wchodzący zajmuje slot schodzącego),
  po przestawieniu przez asystenta, dopóki liczba zawodników na to pozwala.
- Bez `assign` i `empty` wszystko działa jak wcześniej (`drop`, automatyczne dopasowanie).
- AI używa tej samej funkcji (`by: 'ai'`); `shortShape` przy obronie prowadzenia od 70. min wybiera 5-3-1 w dziesiątkę
  i 5-2-1 w dziewiątkę (5-4-1 bez bocznych pomocników), gdy zawodnicy pasują do piątki z tyłu (formacja z trójką
  obrońców albo dopasowanie co najmniej 97 % niskiego bloku), w innym razie niski blok 4-4-1 (4-3-1).

Uwaga do przykładu użytkownika: przy dwóch czerwonych kartkach na boisku jest 9 zawodników, czyli bramkarz i 8 w polu.
5-4-1 oznacza wtedy dwa puste miejsca, np. 5-2-1 albo 5-3-0. Układ „5 obrońców, 3 pomocników, 1 napastnik” (9 w polu)
to gra w dziesiątkę, czyli jedno puste miejsce. Oba przypadki są w testach.

## 5. API dla UI

| Potrzeba | Funkcja i pola (import z `src/engine/match/match.js`, chyba że napisano inaczej) |
|---|---|
| Biały krzyżyk | `playerStates(M, side)[i].knock` (`{ name, type, since, pre, minutes }` albo null), rysować gdy `on`; surowo `x.knock` na zawodniku meczowym (`aggravated: false`); zdarzenie `injury` z `knock`, `knockType`, `aggravated`, `from`, `knocked` (ilu teraz kuleje) |
| Oceny na żywo | `liveRatings(M)` → `{ [id]: ocena }`; też `playerStates(...)[i].rating` |
| Kartki zawodnika | `playerStates(...)[i].card`: null, `'yellow'`, `'secondYellow'`, `'red'`; `yc` 0/1, `rc` 0/1; po meczu `result().ratings[i].card` |
| Stan zawodnika | `playerStates(M, side)`: `{ id, name, pos, slotIdx, x, y, on, treated, bench, subbedOff, sentOff, card, yc, rc, knock, injured, cond, rating }` |
| Podgląd ustawienia | `previewShape(M, side, formationId, { assign, empty })` → `{ ok, error?, assign, empty, shape, need, slots: [{ i, pos, side, x, y, playerId }] }` |
| Zmiana ustawienia | `changeTactics(M, side, { formation, assign, empty, instructions })` → `{ ok, cost, adapt }` albo `{ ok: false, error }`; zdarzenie `tactic` ma `empty` i `shape` |
| Sprawdzenie bez zmiany | `checkTacticPatch(M, side, patch)` → komunikat albo null |
| Gra z urazem przed meczem | `knockEligible(p)`; flaga `p.playingInjured` w składzie (`checkTactics`) |
| Indeks slotu zawodnika | `slotIndex(T, x)` z `teams.js` |

## 6. Kalibracja [SYM]

### Warianty 4-4-2 w identycznych warunkach

Te same ziarna i pary Ekstraklasy, gospodarz pasywny (nic nie zmienia w meczu), gość AI. Punkty gospodarza na mecz.

| Scenariusz (n) | 4-4-2 | 4-4-2 defensywne | 4-4-2 ofensywne | Odniesienie |
|---|---|---|---|---|
| A. Cały mecz (2400) | 1,438 (gole 1,45:1,30, strzały 13,2:11,8) | 1,442 (1,29:1,15, 11,4:10,8) | 1,427 (1,58:1,46, 14,5:12,9) | 4-2-3-1: 1,542 |
| B. Prowadzenie 1 golem w 70. min, zmiana (2000) | 2,478 (wygrane 76,1 %) | **2,578** (80,0 %) | | 4-1-4-1: 2,510, 5-4-1: 2,450 |
| C. Strata 1 gola w 65. min, zmiana (2000) | 0,403 | | **0,438** | 3-4-3: 0,385 |
| D. Gospodarz wyraźnie słabszy, cały mecz (1200) | 0,816 (remisy 22,1 %) | 0,817 (25,7 %) | 0,797 | 4-2-3-1: 0,892 |

Wnioski: na cały mecz warianty nie dają przewagi (A, różnice w granicach szumu ok. 0,035) i ustępują 4-2-3-1.
Niski blok to najlepsza zmiana przy obronie prowadzenia (+0,10 pkt w tej sytuacji), ofensywne najlepsza z badanych
zmian bez zawodników w pogoni (+0,035). Przeciw silniejszemu niski blok daje więcej remisów przy tych samych punktach.
Pierwsza wersja parametrów była za słaba (niski blok -0,10 na cały mecz, bez zysku przy prowadzeniu) i za mocna
(ofensywne +0,08 na cały mecz), stąd obecne wartości.

### Silnik przed i po (3000 meczów Ekstraklasy AI kontra AI, te same ziarna)

| Statystyka | Przed | Po | Cel |
|---|---|---|---|
| Gole na mecz | 2,712 | 2,765 | 2,70-2,80 |
| Gospodarz / remis | 42,9 / 26,3 % | 42,9 / 26,7 % | 45 / 27 % |
| Punkty gospodarza | 1,551 | 1,553 | |
| Żółte / czerwone | 4,21 / 0,217 | 4,20 / 0,224 | |
| Urazy widoczne w meczu | 0,516 | 0,524 | ok. 0,4-0,5 |
| w tym lekkie (gra dalej) / zejście | 0,235 / 0,281 | 0,240 / 0,284 | |
| Pogłębienia lekkich urazów | 0 | 0,002 | AI zmienia kulejących |
| Urazy po meczu / średnio dni | 0,516 / 26,6 | 0,522 / 26,6 | |
| Zmiany zawodników na drużynę | 4,23 | 4,23 | 4-4,5 |
| Zmiany taktyki na mecz | 5,02 | 5,27 | 5-8 |
| Przejścia na 4-4-2 defensywne / ofensywne | 0 / 0 | 0,23 / 0,78 | |
| Średnia ocena (60+ min) | 6,214 | 6,213 | bez zmiany (`engineRatingShift`) |
| Czas na mecz | 3,5 ms | 3,9 ms (przy obciążonej maszynie najlepszy z 5 przebiegów: 9,5 ms przed i 9,1 ms po) | poniżej 10 ms |

Gole +0,05 to głównie pogoń 4-4-2 ofensywnym (w granicach celu). Przejść na ofensywne jest dużo, bo pogoń z 4-2-3-1
idzie przez 4-4-2 (dotychczasowa reguła `ATTACK1`), a potem do wariantu ofensywnego.

## 7. Zmiany w kodzie

- `src/data/formations.js`: `442def`, `442off`, pola `fx` i `family`.
- `src/engine/match/teams.js`: `fx` w `tacticParams`, lekkie urazy (`knockTypeOf`, `knockEligible`, `makeKnock`,
  `x.knock`, kara drużyny `T.knockPen`, szybsze zmęczenie), `planShape`, `validateTacticPatch`, `slotIndex`,
  `applyTacticChange` z `assign`/`empty`, koszt w rodzinie, `reslot` z ręcznymi pustymi miejscami.
- `src/engine/match/core.js`: `injure` tworzy `x.knock`, `aggravate`, ryzyko pogłębienia co minutę, `x.redCode`.
- `src/engine/match/control.js`: `changeTactics` z walidacją i `empty` w zdarzeniu, `slotIdx` przy zmianie.
- `src/engine/match/coach.js`: `variant442`, mapy pogoni i obrony z nowymi formacjami, `shortShape` z 5-3-1 i niskim
  blokiem, `knockSubs`, kulejący w `planSubs` i `leastNeeded`.
- `src/engine/match/match.js`: `liveRatings`, `playerStates`, `previewShape`, `checkTacticPatch`, `knockEligible`,
  `knock` i `card` w ocenach, dni urazu po grze z bólem.
- `src/engine/match/constants.js`: `KNOCK`.
- `src/engine/lineup.js`: `playingInjured` tylko z `knockEligible`.
- `src/season/season.js`: dłuższa przerwa zastępuje krótszą (dwa warunki).

## 8. Testy

`tests/formationsKnocks.test.mjs`: dane nowych formacji i ich efekty, różnice w grze na 300 meczach, wybór AI
(jednostkowo i w meczu), koszt zmiany w rodzinie, lekki uraz (stan, kara, zdarzenie), pogłębienie (wymuszone
i przez drugi uraz), kara kilku kulejących (rosnąca, ograniczona), dni po meczu, uraz sprzed meczu i `checkTactics`,
szybka zmiana AI przy naciągnięciu, oceny na żywo (zgodność z końcowymi, brak wpływu na mecz), kartki w
`playerStates`, dowolne ustawienie w 9 i 10 (gracz, AI, walidacja), determinizm.
Zmienione: `tests/lineup.test.mjs` (12 formacji), `tests/situations.test.mjs` (w 80. min przy prowadzeniu AI może
zagrać 5-3-1, więc co najmniej dwóch środkowych obrońców), `tests/aiCoach.test.mjs` (wyrównanie w tej samej minucie
to już nie pogoń).

## 9. Otwarte pytania

1. Wybór wariantu 4-4-2 przed meczem przez AI (`src/match/matchday.js`, inne zadanie): np. słabszy wyjazdowo
   niski blok, faworyt u siebie ofensywne.
2. Zgranie formacji w treningu (`src/training/cohesion.js`) liczy się osobno dla każdej formacji; rodzina 4-4-2
   mogłaby dzielić zgranie.
3. Studio i raport asystenta (`src/match/studio.js`) nie znają nazw „4-4-2 defensywne/ofensywne” i traktują je jak 4-4-2.
4. UI: ustawianie `p.playingInjured` na ekranie składu, przeciąganie zawodników na sloty w oknie „Zmiany i taktyka”
   (`previewShape` + `changeTactics` z `assign`), biały krzyżyk i oceny na żywo (`playerStates`).
5. Szybka symulacja meczów w tle nie modeluje gry z bólem; urazy z niej działają jak wcześniej.
