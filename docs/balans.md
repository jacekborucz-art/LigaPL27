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

Silnik i szybka symulacja zgadzają się w średnim poziomie, przewadze własnego boiska i liczbie goli. Silnik jest
ok. 11 % bardziej „stromy” (lepszy wygrywa częściej), a dla pojedynczych kadr różnice są większe (przyczyna 5 niżej).
Z perspektywy gracza liczy się to, bo jego mecze zawsze idą pełnym silnikiem, a reszta ligi szybką symulacją.

Średnia ocena meczowa: pełny silnik 6,16 (6,23 przy 60+ minutach), szybka symulacja ok. 6,49.

## Przyczyny (od największej)

| # | Przyczyna | Kierunek | Wielkość |
|---|---|---|---|
| 1 | Skład gracza nie zmienia się sam: zastępca kontuzjowanego zostaje w jedenastce na stałe, brak rotacji | przeciw graczowi | ok. -8 pkt (ui wobec ui + asystent składu) |
| 2 | Analiza wideo rywala tylko u gracza (plan asystenta robi ją dzień przed każdym meczem: +0,04 + 0,006 q analityka na zawodnika), kluby AI nie miały odpowiednika | dla gracza | ok. +2 pkt (wyłączenie `trainingPrep`) |
| 3 | Kluby AI nie trenowały: ostrość spadała im o 1 dziennie między meczami (w lipcu z 70 do ok. 50), brak premii morale z zajęć (plan gracza: +0,25 morale i +14 ostrości tygodniowo) | dla gracza | ok. +1 pkt; razem z 2 składniki treningu w dniu meczu +0,22 pkt atrybutu (test `balance.test.mjs`) i ok. +3 pkt na sezon (quick wobec ai) |
| 4 | Odprawa pomeczowa i konferencja tylko u gracza: domyślny ton (Pochwała) daje +1,0 morale po wygranej, +0,5 po remisie, -0,5 po porażce, domyślne odpowiedzi na konferencji ok. +0,3; trenerzy AI nie mieli odprawy pomeczowej | dla mocnych klubów gracza, przeciw słabym | po pozostałych poprawkach Legia +5,6, Lechia +8,6 pkt wobec AI (przed tą poprawką) |
| 5 | Kalibracja pełnego silnika wobec szybkiej symulacji: silnik ok. 11 % bardziej stromy i inaczej wycenia strefy niektórych kadr (atrybuty w silniku, OVR w szybkiej symulacji) | zależy od klubu | Lechia +5,6, Legia +2,8, Widzew +2,0, Polonia +2,1, Resovia -0,4, GKS -2,4 pkt na sezon (ten sam klub, te same rywale, oba modele) |
| 6 | Oceny z pełnego silnika średnio o ok. 0,33 niższe niż oceny meczów w tle; ocena wchodzi do formy (0,25 x (śr. - 6,6)) i morale | przeciw graczowi | forma ok. -0,08 pkt atrybutu na zawodnika, niższe morale |
| 7 | Brak obozu u pasywnego gracza (AI jedzie sama); forma bazowa 0,45-0,65 na start rundy | przeciw graczowi | ok. -0,05 pkt atrybutu średnio w sezonie; mechanika zamierzona i zapowiadana w poczcie, zostaje |

Sprawdzone i bez istotnej asymetrii:

- Odprawy przed meczem i w przerwie: średnie Z na start meczu 3,7 (gracz) wobec 4,0 (AI rywala) w meczach Widzewa,
  4,5 wobec 4,4 w meczach GKS. Wyzerowanie Z obu stron (wariant `zeroz`) nie zmniejszyło przewagi gracza
  (Widzew +1,2, GKS +1,5, Polonia 0,0 pkt), więc zalecany ton i reguły AI dają podobne zaangażowanie.
- Spójność S na start: 99,0 wobec 98,7 (Widzew), 98,9 wobec 98,1 (GKS).
- Asystent w meczu (`runToEnd`/`runToBreak` z `assistantFor`) używa tego samego `aiDecide` co trenerzy AI.
- Kadry: siła zawodnika zależy tylko od L klubu (`playerGen.js`); poziom płac z `finanse_klubow.js` wpływa na pensje,
  nie na umiejętności. Rozwój zawodników w pierwszym sezonie nie różni gracza od AI w sposób mierzalny.
- Zarząd, kibice, aklimatyzacja: nie wchodzą do siły meczowej poza morale.

## Zmiany

Zasada: kluby AI dostają te same mechanizmy co gracz, narzędzia gracza zostają bez zmian.

| Plik | Zmiana |
|---|---|
| `src/training/cohesion.js` | `prepTerm`: klub AI w dniu meczu ma analizę rywala jak domyślny plan asystenta (analityk q >= 5, premia 0,04 + 0,006 q). Przeciw groźnej drużynie gracza do x2 (patrz niżej). `aiPrepToday` liczy premie raz na dzień. |
| `src/training/config.js`, `src/training/index.js` | `AI_TRAINING = { moraleWeek: 0.25, sharpWeek: 14 }`: tygodniowy krok klubów AI daje dostępnym zawodnikom ostrość (do 85, jak trening gracza) i morale z zajęć. Liczby z domyślnego planu asystenta w sezonie 2026/27 (+0,250 morale, +14,4 ostrości na tydzień). |
| `src/season/season.js` | `engineRatingShift` w `fromEngineResult`: oceny z pełnego silnika przesunięte o różnicę między średnią, jaką dałby model ocen szybkiej symulacji przy tych samych golach i kartkach, a średnią silnika (różnice między zawodnikami zostają). Gdy silnik zostanie przeskalowany, przesunięcie samo spadnie do ok. 0. Model ocen w tle wyniesiony do `QUICK_RATING`. |
| `src/season/season.js` | `aiPostMatchTalk` w `applyResult`: po każdym meczu klubu AI jego trener robi odprawę pomeczową tym samym modelem co gracz (`postMatchBriefing`), ton z `aiChooseSpeech` według osobowości trenera, pamięć powtórzeń klubu w `game.aiSpeech`. |
| `src/engine/quickSim.js` | `QS.BETA_CLUB = 0.25` (było 0,225) w `expectedGoals`: szybka symulacja meczów klubowych tak samo stroma jak pełny silnik. `QS.BETA` (puchary UEFA z ratingami klubów zagranicznych, reprezentacje) bez zmian. Studio przedmeczowe liczy kursy tym samym wzorem, więc kursy też lepiej pasują do silnika. |
| `src/match/matchday.js` | `matchTactics`: zastępca wstawiony przez asystenta za niedostępnego zawodnika wraca na ławkę, gdy ten wyzdrowieje (jeśli gracz nie ruszał tego miejsca, także gdy zastępstwo zrobił ekran gry przed dniem meczowym). `tactics.assistant === true` oznacza skład wybierany przez asystenta przed każdym meczem, jak w klubach AI. |
| `src/career/threat.js` (nowy) | Organiczna trudność, patrz niżej. |
| `src/career/board.js`, `src/season/rollover.js` | `boardGoal`: po sezonie wyraźnie ponad cel zarząd podnosi cel na kolejny sezon (w połowie drogi do zajętego miejsca). `manager.seasons` zapisuje też cel (`target`). |
| `src/career/careerSystem.js` | Zmiana klubu czyści pamięć zastępstw asystenta. |
| `src/match/matchday.js`, `src/season/season.js` (przekazanie z silnika 1d73c01) | `engineWeather` przekazuje `tempC` (przerwa na schłodzenie od 32 st.), `kickOff` ustawia `concussionSubs: false`, zdarzenia studia mają `player` (pauzy po czerwonych kartkach), kara za czerwoną z powodu z silnika (`RED_BAN`: druga żółta, DOGSO, ręka 1 mecz, rażący faul 2, gwałtowne zachowanie 3), mecz przerwany (`abandoned`) kończy się walkowerem 0:3, chyba że rywal wygrywał wyżej (`walkoverScore`). |
| `tests/balance.test.mjs` (nowy) | Tani strażnik balansu (patrz Testy). |
| `tests/multiseason.test.mjs` | Test spadku do III ligi ustawia zaufanie zarządu na 100, żeby trener nie został zwolniony w trakcie sezonu (po zmianach balansu Chojniczanka z ziarnem 32 grała gorzej i zarząd zwalniał trenera w kwietniu, więc test sprawdzał inny klub). |

## Organiczna trudność (bez suwaka i bez ukrytych premii)

Świat reaguje na sukces trenera, a nie na sam fakt, że klub prowadzi gracz:

- `managerThreat(game)` (0-1): rośnie, gdy drużyna gracza punktuje wyraźnie ponad oczekiwania z siły kadry
  (od +0,25 pkt na mecz ponad oczekiwane; pełne zagrożenie przy +0,85, od 6. kolejki), gdy w poprzednim sezonie
  skończyła ponad cel zarządu (0,12 za miejsce) albo zdobyła mistrzostwo (+0,35) lub Puchar Polski (+0,15). [SZAC]
- Rywal AI przygotowuje się do meczu z groźną drużyną staranniej: analiza wideo x(1 + threat), czyli do x2
  (do ok. +0,1 pkt atrybutu na zawodnika więcej przy dobrym analityku). Ten sam mechanizm, który ma gracz,
  skalowany jakością analityka klubu AI.
- Zarząd po sezonie ponad stan podnosi cel (np. Widzew mistrz przy celu 6. miejsce dostaje cel 4. miejsce, Legia mistrz przy celu 3. miejsce dostaje „obronę mistrzostwa” z celem 2. miejsce),
  a ocena miesięczna i letnia liczą się od nowego celu, więc cierpliwość maleje bez osobnej reguły.

Trener klubu ze środka tabeli, który gra na miarę kadry, ma threat = 0 i zwykły cel; nic go nie karze.

Pomysły na dalsze etapy (nie wdrożone): kluby AI wzmacniają się na rynku, gdy gracz dominuje; kluczowi zawodnicy
z rosnącą reputacją chcą wyższych kontraktów i dostają oferty z większych klubów; trener AI wybiera bardziej
zwartą taktykę przeciw faworytowi (wymaga zmian w logice AI silnika, właściciel: agent silnika).

## Pomiary po zmianach

Migawka: silnik z HEAD sprzed zmian agenta silnika plus wszystkie zmiany z tego dokumentu. 30 sezonów na klub
(AI: 40). „ui” to pasywny gracz z UI (skład z 1 lipca, asystent tylko zastępuje i przywraca kontuzjowanych).

| Klub (rankL) | AI | ui (pasywny) | różnica pkt | ui + asystent składu | aktywny (asystent składu + obozy) |
|---|---|---|---|---|---|
| Legia (1) | 3,8 / 62,4 | 2,4 / 66,3 | +3,9 | 2,7 / 65,2 | 2,2 / 68,0 |
| Lechia Gdańsk (1 w 1 Lidze) | 4,0 / 59,7 | 2,6 / 63,5 | +3,8 | | |
| Widzew (5) | 7,0 / 51,5 | 7,2 / 51,2 | -0,3 | 7,8 / 50,2 | 6,6 / 53,4 |
| GKS Katowice (16) | 13,2 / 38,0 | 14,1 / 35,8 | -2,2 | 12,7 / 38,9 | 12,9 / 38,1 |
| Polonia Warszawa (9 w 1 Lidze) | 8,7 / 47,9 | 8,4 / 48,5 | +0,6 | | |
| Resovia (8 w 2 Lidze) | 8,5 / 48,9 | 9,3 / 47,9 | -1,0 | | |

- Średnia przewaga pasywnego gracza nad tym samym klubem pod AI: +0,8 pkt na sezon (przed zmianami w wariancie
  z asystentem składu ok. +4,5 pkt, w wariancie całkiem pasywnym -2 pkt, ale z rozrzutem od -8 do +4 zależnie od klubu).
- Różnica średniego miejsca we wszystkich klubach mieści się w 1,5 miejsca (największa: Legia i Lechia, 1,4).
- Widzew: średnio 7. miejsce, mistrzostwo 0 razy na 30, Puchar Polski 3 razy, 6 razy w pierwszej trójce.
- Aktywny trener (skład od asystenta, obozy w Austrii i Turcji) zyskuje wobec pasywnego ok. +2 pkt
  (Widzew +3,2, Legia +2,8, GKS -0,8 w szumie). Przewaga jest, ale ograniczona; dalsze dźwignie (taktyka pod rywala,
  rozmowy, zmiany w meczu) nie były symulowane.
- Pozostała różnica Legii i Lechii pochodzi z kalibracji silnika wobec szybkiej symulacji (przyczyna 5): po zmianie
  nachylenia te same kluby zdobywają w pełnym silniku więcej niż w szybkiej symulacji (Lechia +4,8, Legia +2,3,
  Widzew +2,2, Polonia +1,9, Resovia 0,0, GKS -1,4 pkt na sezon). Mecze gracza zawsze idą silnikiem, więc to przenosi się
  na wynik gracza. Propozycja niżej.

### Kontrola na silniku po commicie 1d73c01 (sytuacje, nowy trener AI)

Te same zmiany balansu, silnik z main (stan 11 lis 2026). Tryb AI nie używa pełnego silnika, więc baza AI jest ta sama.

| Klub | AI | ui (pasywny) | różnica pkt | silnik wobec szybkiej symulacji (ten sam klub, pkt na sezon) |
|---|---|---|---|---|
| Legia | 3,8 / 62,4 | 3,1 / 64,0 | +1,6 | +3,0 |
| Lechia Gdańsk | 4,0 / 59,7 | 2,5 / 64,1 | +4,4 | +2,7 |
| Widzew | 7,0 / 51,5 | 7,3 / 50,8 | -0,7 | +0,1 |
| GKS Katowice | 13,2 / 38,0 | 14,7 / 33,9 | -4,1 | +1,8 |
| Polonia Warszawa | 8,7 / 47,9 | 8,6 / 47,9 | 0,0 | +0,5 |
| Resovia | 8,5 / 48,9 | 8,0 / 49,5 | +0,6 | +0,4 |

Średnia różnica +0,3 pkt, różnica miejsca najwyżej 1,5 (Lechia, GKS). Średnia ocena w nowym silniku nadal 6,16, więc
`engineRatingShift` dalej działa. Pojedyncze kluby odchylają się o 3-4 pkt; przy 30 sezonach błąd różnicy to ok. 2,2 pkt,
więc to na granicy szumu, a powtarzalnie dodatnia Lechia wynika z wyceny kadry (propozycja 2 niżej).

## Proponowane zmiany w silniku (dla agenta silnika)

1. Skala ocen: `result()` w `src/engine/match/match.js` liczy ocenę jako 6 + suma zdarzeń; średnia 6,16 (po commicie
   1d73c01 nadal 6,16). Propozycja: stała bazowa w `RATING` (np. 6,35 zamiast 6), tak by średnia przy 60+ minutach
   wynosiła ok. 6,5 jak w meczach w tle. `engineRatingShift` w `season.js` sam zejdzie wtedy do ok. 0.
2. Wycena kadr: silnik liczy strefy z atrybutów (`zoneRatings`, `ROLE_SHARE`), szybka symulacja z OVR. Dla części kadr
   daje to różne siły (Lechia: pomoc +0,26 i atak +0,19 wyżej w silniku niż w szybkiej symulacji, GKS: bramkarz -0,42
   i atak -0,36 niżej). Najprostsza droga: szybka symulacja (`teamStrength.js`, mój obszar) liczy strefy tymi samymi
   wzorami co silnik (`zoneRatings` z `teams.js` jako funkcja czysta), potem ponowne dopasowanie `MU_*` i `BETA_CLUB`.
   Do tego potrzebna jest zgoda na import z `src/engine/match/teams.js` i stałość tych wzorów.
3. Trener AI wobec faworyta: bardziej zwarta taktyka przy pWin rywala >= 0,6 (organiczna reakcja na mocną drużynę
   gracza), do zmierzenia tym samym skryptem.

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
- Odprawa pomeczowa AI: po meczu klubów AI ich trenerzy wybierają ton (po wygranej Pochwała albo Skupienie na kolejnym
  meczu), pamięć powtórzeń zapisuje się w `game.aiSpeech`, morale zwycięzców rośnie.

`tests/matchday.test.mjs`: temperatura w danych dla silnika, kara za czerwoną z powodu, walkower, `concussionSubs`
i zawodnik w pauzach studia po pełnym dniu meczowym.
