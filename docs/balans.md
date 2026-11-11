# Balans: gracz kontra kluby AI

Zgłoszenie: pierwszy sezon Widzewem Łódź „bez zarządzania” (tylko Dalej, mecz, Dalej; bez zmian składu, treningu,
obozów, sparingów, rozmów i mediów) skończył się mistrzostwem i Pucharem Polski przy ok. 6 porażkach.
Widzew ma L = 11,8, czyli 5. siłę Ekstraklasy. Pasywny trener powinien kończyć sezon w okolicy miejsca wynikającego
z kadry (z prawdziwą losowością), a dublet takiego klubu bez zarządzania powinien być rzadkością.

## Metoda

Skrypty poza repozytorium (katalog roboczy agenta): `sim.mjs` rozgrywa cały sezon 2026/27 od 1 lipca do 8 czerwca
na prawdziwej pętli dni (`processDay`, `continueUntilStop`, decyzje odrzucane). Mecze w tle zawsze idą szybką
symulacją. Mecz klubu gracza w jednym z trybów:

| Tryb | Co robi mecz gracza |
|---|---|
| `ai` | klub prowadzi AI: graczem jest inny klub (Śląsk II, w 2 Lidze Unia Skierniewice), a badany klub gra jak każdy klub AI |
| `quick` | klub gracza, ale jego mecze szybką symulacją (izoluje wpływ treningu i stanu kadry gracza) |
| `ui` | pełny dzień meczowy jak w interfejsie przy samym klikaniu: `startMatchday`, odprawa z tonem zalecanym przez asystenta (tak zaznacza `renderTalk`), bez rozmów indywidualnych, `kickOff`, „Pokaż wynik” (`skip`, zmiany robi asystent), przerwa z zalecaną odprawą, druga połowa, `finishMatchday`, odprawa pomeczowa z pierwszym tonem (Pochwała, tak zaznacza formularz), konferencja z odpowiedziami domyślnymi, `closeMatchday` |
| `uitick` | jak `ui`, ale mecz oglądany minuta po minucie (`tick`), bez zmian gracza |
| `+autoxi` | przed każdym meczem skład wybiera asystent (to samo, co przycisk „Asystent ustawi skład”, a po zmianach `tactics.assistant`) |
| `+camp` | aktywny trener: obóz letni w Austrii (10 dni) i zimowy w Turcji (12 dni) |

Ziarna 1-30 (tryb `ai` 1-40), te same dla wszystkich wariantów. Jedno ziarno to jeden sezon. Odchylenie standardowe
punktów klubu w sezonie wynosi 8-10, więc błąd średniej z 30 sezonów to ok. 1,6 pkt na klub; wnioski opieram na
kilku klubach naraz. Pomiary „przed” na migawce HEAD (silnik bez zmian drugiego agenta), „po” na tej samej migawce
z moimi plikami.

Dodatkowo: `calib.mjs` (pełny silnik AI kontra AI wobec szybkiej symulacji na tych samych kadrach, 28 par po 150 meczów)
i pomiar średniej oceny meczowej w pełnym silniku (400 meczów).

## Pomiary przed zmianami

Średnie miejsce (odchylenie) i punkty w lidze. rankL: miejsce klubu w lidze według L.

| Klub (rankL) | AI | quick | ui | uitick | ui + asystent składu |
|---|---|---|---|---|---|
| Widzew (5) | 7,3 (4,4) / 51,0 | 6,5 / 52,9 | 7,3 (4,0) / 49,5 | 8,0 / 49,8 | **4,4 (2,8) / 56,8** |
| Legia (1) | 3,5 / 62,4 | 2,4 / 65,5 | 3,1 / 62,7 | | |
| GKS Katowice (16) | 12,9 / 38,3 | 12,3 / 40,4 | 15,6 / 30,4 | 14,2 / 34,4 | 11,6 / 40,8 |
| Lechia Gdańsk (1 w 1 Lidze) | 4,8 / 56,3 | 2,6 / 63,4 | 3,7 / 60,5 | | |
| Polonia Warszawa (9 w 1 Lidze) | 8,6 / 48,4 | 7,6 / 51,5 | 10,2 / 45,5 | | 5,9 / 53,6 |
| Resovia (8 w 2 Lidze) | 7,8 / 49,7 | 7,3 / 51,0 | 10,2 / 45,1 | | |

Widzew pod AI: mistrzostwo 2 razy na 40 sezonów, Puchar Polski 6 razy. Widzew gracza z asystentem składu:
13 razy w pierwszej trójce na 30 sezonów, średnio 8,8 porażki w lidze.

Co z tego wynika:

1. Przy dosłownie pasywnym graczu (skład z 1 lipca, nigdy nie zmieniany) klub gracza wypada nawet trochę gorzej niż
   pod AI (średnio ok. -2 pkt, słabe kluby do -8 pkt). Dwie duże siły działają w przeciwne strony i prawie się znoszą.
2. Gracz, który przed meczami odświeża skład asystentem (jeden przycisk na ekranie Skład, poza tym nic), był wyraźnie
   uprzywilejowany: +5,8 pkt (Widzew), +2,5 (GKS), +5,2 (Polonia) na sezon wobec tego samego klubu pod AI. Z taką
   przewagą Widzew jest średnio 4., w 13 sezonach na 30 w pierwszej trójce, w 10 na 30 ma najwyżej 7 porażek w lidze.
   Dublet jest rzadki w obu rozkładach (pod AI 1 na 40 sezonów, z odświeżanym składem 0 na 30), więc zgłoszony sezon
   to w dużej części szczęście, ale przewaga z tego punktu wyraźnie zwiększała szansę na walkę o tytuł.
3. Wersje wcześniejsze (430081d, 1ce2bbf) dają ten sam obraz, więc to nie jest świeża regresja.

### Kalibracja silnika

| | Pełny silnik (AI-AI) | Szybka symulacja |
|---|---|---|
| Punkty gospodarza na mecz | 1,463 | 1,464 |
| Gole gospodarz : gość | 1,46 : 1,30 | 1,51 : 1,35 |
| Nachylenie punktów gospodarza względem różnicy sił | 0,453 | 0,408 |

Silnik i szybka symulacja zgadzają się w poziomie, przewadze własnego boiska i liczbie goli. Silnik jest ok. 11 %
bardziej „stromy” (lepszy wygrywa trochę częściej); przy typowych różnicach sił to poniżej 1 pkt na sezon, więc nie
jest przyczyną zgłoszenia.

Średnia ocena meczowa: pełny silnik 6,16 (6,23 przy 60+ minutach), szybka symulacja ok. 6,49.

## Przyczyny (od największej)

| # | Przyczyna | Kierunek | Wielkość |
|---|---|---|---|
| 1 | Skład gracza nie zmienia się sam: zastępca kontuzjowanego zostaje w jedenastce na stałe, brak rotacji | przeciw graczowi | ok. -8 pkt (ui wobec ui + asystent składu) |
| 2 | Analiza wideo rywala tylko u gracza (plan asystenta robi ją dzień przed każdym meczem: +0,04 + 0,006 q analityka na zawodnika), kluby AI nie miały odpowiednika | dla gracza | ok. +2 pkt (wyłączenie `trainingPrep`) |
| 3 | Kluby AI nie trenowały: ostrość spadała im o 1 dziennie między meczami (w lipcu z 70 do ok. 50), brak premii morale z zajęć (plan gracza: +0,25 morale i +14 ostrości tygodniowo) | dla gracza | ok. +1 pkt; razem z 2 składniki treningu w dniu meczu +0,22 pkt atrybutu (test `balance.test.mjs`) i ok. +3 pkt na sezon (quick wobec ai) |
| 4 | Oceny z pełnego silnika średnio o ok. 0,33 niższe niż oceny meczów w tle; ocena wchodzi do formy (0,25 x (śr. - 6,6)) i morale | przeciw graczowi | forma ok. -0,08 pkt atrybutu na zawodnika, niższe morale |
| 5 | Brak obozu u pasywnego gracza (AI jedzie sama); forma bazowa 0,45-0,65 na start rundy | przeciw graczowi | ok. -0,05 pkt atrybutu średnio w sezonie; mechanika zamierzona i zapowiadana w poczcie, zostaje |

Sprawdzone i bez istotnej asymetrii:

- Odprawy: średnie Z na start meczu 3,7 (gracz) wobec 4,0 (AI rywala) w meczach Widzewa, 4,5 wobec 4,4 w meczach GKS.
  Zalecany ton gracza i reguły AI dają podobne zaangażowanie.
- Spójność S na start: 99,0 wobec 98,7 (Widzew), 98,9 wobec 98,1 (GKS).
- Asystent w meczu (`runToEnd`/`runToBreak` z `assistantFor`) używa tego samego `aiDecide` co trenerzy AI.
- Kadry: siła zawodnika zależy tylko od L klubu (`playerGen.js`); poziom płac z `finanse_klubow.js` wpływa na pensje,
  nie na umiejętności. Rozwój zawodników w pierwszym sezonie nie różni gracza od AI w sposób mierzalny.
- Zarząd, kibice, aklimatyzacja: nie wchodzą do siły meczowej poza morale (konferencja, odprawa pomeczowa: małe kwoty).

## Zmiany

Zasada: kluby AI dostają te same mechanizmy co gracz, narzędzia gracza zostają bez zmian.

| Plik | Zmiana |
|---|---|
| `src/training/cohesion.js` | `prepTerm`: klub AI w dniu meczu ma analizę rywala jak domyślny plan asystenta (analityk q >= 5, premia 0,04 + 0,006 q). Przeciw groźnej drużynie gracza do x2 (patrz niżej). `aiPrepToday` liczy premie raz na dzień. |
| `src/training/config.js`, `src/training/index.js` | `AI_TRAINING = { moraleWeek: 0.25, sharpWeek: 14 }`: tygodniowy krok klubów AI daje dostępnym zawodnikom ostrość (do 85, jak trening gracza) i morale z zajęć. Liczby z domyślnego planu asystenta w sezonie 2026/27 (+0,250 morale, +14,4 ostrości na tydzień). |
| `src/season/season.js` | `engineRatingShift` w `fromEngineResult`: oceny z pełnego silnika przesunięte o różnicę między średnią, jaką dałby model ocen szybkiej symulacji przy tych samych golach i kartkach, a średnią silnika (różnice między zawodnikami zostają). Gdy silnik zostanie przeskalowany, przesunięcie samo spadnie do ok. 0. Model ocen w tle wyniesiony do `QUICK_RATING`. |
| `src/match/matchday.js` | `matchTactics`: zastępca wstawiony przez asystenta za niedostępnego zawodnika wraca na ławkę, gdy ten wyzdrowieje (jeśli gracz nie ruszał tego miejsca, także gdy zastępstwo zrobił ekran gry przed dniem meczowym). `tactics.assistant === true` oznacza skład wybierany przez asystenta przed każdym meczem, jak w klubach AI. |
| `src/career/threat.js` (nowy) | Organiczna trudność, patrz niżej. |
| `src/career/board.js`, `src/season/rollover.js` | `boardGoal`: po sezonie wyraźnie ponad cel zarząd podnosi cel na kolejny sezon (w połowie drogi do zajętego miejsca). `manager.seasons` zapisuje też cel (`target`). |
| `tests/balance.test.mjs` (nowy) | Tani strażnik balansu (patrz Testy). |

## Organiczna trudność (bez suwaka i bez ukrytych premii)

Świat reaguje na sukces trenera, a nie na sam fakt, że klub prowadzi gracz:

- `managerThreat(game)` (0-1): rośnie, gdy drużyna gracza punktuje wyraźnie ponad oczekiwania z siły kadry
  (od +0,25 pkt na mecz ponad oczekiwane; pełne zagrożenie przy +0,85, od 6. kolejki), gdy w poprzednim sezonie
  skończyła ponad cel zarządu (0,12 za miejsce) albo zdobyła mistrzostwo (+0,35) lub Puchar Polski (+0,15). [SZAC]
- Rywal AI przygotowuje się do meczu z groźną drużyną staranniej: analiza wideo x(1 + threat), czyli do x2
  (do ok. +0,1 pkt atrybutu na zawodnika więcej przy dobrym analityku). Ten sam mechanizm, który ma gracz,
  skalowany jakością analityka klubu AI.
- Zarząd po sezonie ponad stan podnosi cel (np. Widzew mistrz przy celu „puchary” dostaje cel 3-4 miejsce),
  a ocena miesięczna i letnia liczą się od nowego celu, więc cierpliwość maleje bez osobnej reguły.

Trener klubu ze środka tabeli, który gra na miarę kadry, ma threat = 0 i zwykły cel; nic go nie karze.

Pomysły na dalsze etapy (nie wdrożone): kluby AI wzmacniają się na rynku, gdy gracz dominuje; kluczowi zawodnicy
z rosnącą reputacją chcą wyższych kontraktów i dostają oferty z większych klubów; trener AI wybiera bardziej
zwartą taktykę przeciw faworytowi (wymaga zmian w logice AI silnika, właściciel: agent silnika).

## Pomiary po zmianach

POMIARY_PO

## Proponowane zmiany w silniku (dla agenta silnika)

1. Skala ocen: `result()` w `src/engine/match/match.js` liczy `rating = 6 + ev`; średnia 6,16. Propozycja: stała
   bazowa w `RATING` (np. `base: 6.35`) zamiast 6, tak by średnia z 60+ minutami wynosiła ok. 6,5-6,6 jak w meczach
   w tle. Po tej zmianie `engineRatingShift` w `season.js` sam zejdzie do ok. 0 (nic nie trzeba usuwać).
2. Nachylenie: silnik daje ok. 11 % większą przewagę lepszej drużynie niż szybka symulacja (0,453 wobec 0,408 pkt
   na punkt różnicy sił). Do wyrównania np. lekkim obniżeniem `kCreate` albo podniesieniem `QS.BETA` w
   `quickSim.js` z 0,225 do ok. 0,25 (ten plik mogę zmienić sam, jeśli agent silnika uzna nachylenie silnika za docelowe).
3. Trener AI wobec faworyta: bardziej defensywna mentalność i niski blok przy pWin rywala >= 0,6 (organiczna reakcja
   na mocną drużynę gracza), do zmierzenia tym samym skryptem.

## Testy

`tests/balance.test.mjs`:

- Pasywny gracz: składniki treningu (ostrość, zgranie, analiza rywala, obciążenie, obóz, stałe fragmenty) Widzewa
  w dniu meczu we wrześniu, gdy prowadzi go gracz i gdy prowadzi go AI. Różnica sum musi być poniżej 0,15 pkt
  atrybutu (przed zmianami: +0,224, po: -0,012).
- Skala ocen: średnia ocen z pełnego silnika po `fromEngineResult` w granicach 0,12 od średniej meczów w tle.
- Organiczna trudność: klub grający na miarę kadry ma threat 0, seria zwycięstw słabego klubu daje threat > 0,8;
  analiza rywala AI po tytule gracza rośnie; zarząd podnosi cel tylko po sezonie wyraźnie ponad celem.
- Skład: zastępca kontuzjowanego wraca na ławkę po powrocie zawodnika, ręczna zmiana gracza zostaje,
  `tactics.assistant` wybiera skład jak AI.
