# Trening klubów AI: analiza i wyrównanie

Pytanie: czy AI w tle ustawia trening swojej drużyny? Jeśli nie, gracz ma przewagę. Do tego regeneracja zawodników AI,
motywacja trenera AI i wpływ na świat gry.

Krótka odpowiedź: przed tą zmianą kluby AI nie miały planu treningowego. Dostawały co tydzień stałe liczby
(ostrość +14, morale +0,25, zgranie, losowe urazy), wyliczone z domyślnego planu asystenta gracza. Na boisku gracz nie
miał przez to przewagi, raczej odwrotnie: AI nie ponosiło kosztów treningu (zmęczenie, ciężkie nogi, przeciążenie),
miało mniej urazów treningowych i więcej morale z zajęć. Gracz miał za to przewagę w rozwoju młodych (bodziec z planu
zamiast stałego mnożnika) i w stałych fragmentach. Teraz kluby AI realizują codziennie ten sam plan asystenta co gracz,
z tymi samymi wzorami, a trener AI dobiera akcent tygodnia do swojego typu.

## Metoda

Skrypty poza repozytorium (katalog roboczy agenta, `aitrain/`):

- `harness.mjs`, `sim2.mjs`: cały sezon 2026/27 (1 lipca do 20 czerwca) na prawdziwej pętli dni (`processDay`,
  `continueUntilStop`). Pasywny gracz: same „Dalej”, mecze gracza szybką symulacją (izoluje trening od skali silnika),
  po meczu odprawa z tonem Pochwała (domyślny w formularzu). Ten sam klub raz jako klub gracza (`gracz`), raz pod AI
  (graczem jest Śląsk II). Pomiar składu w dniu meczu na początku dnia meczowego, tak samo dla obu stron.
- Ziarna 1-12, kluby Widzew Łódź (rankL 5) i GKS Katowice (16, gra w pucharach), czyli 24 sezony na wariant.
- Wariant `lustro`: gracz robi to samo co trener AI (ten sam obóz z `aiCampChoice`, akcent indywidualny młodych tą samą
  regułą). Sprawdza, czy wzory są wspólne.
- `world.mjs`: 3 sezony z rolloverem, ziarna 1-3, cały świat (pomiar ligi, wartości, rozwoju według wieku).
- „Przed” to migawka bieżącego kodu z plikami `src/training/*` z HEAD, „po” to kod z tej zmiany.

Odchylenie standardowe liczby urazów treningowych w sezonie jednego klubu to ok. 3,5, więc błąd średniej z 12 sezonów
ok. 1; różnice poniżej 1,5 urazu traktuję jako szum. Składniki siły są w punktach atrybutu (skala 1-20).

## Mechanizmy: gracz, AI przed, AI teraz

Liczby: Widzew / GKS, różnica „klub gracza minus ten sam klub pod AI” (ujemna = AI silniejsze).

| Mechanizm | Gracz (plan domyślny) | AI przed | AI teraz | Zmierzony efekt (przed, po) |
|---|---|---|---|---|
| Plan tygodnia | Plan asystenta z terminarza: mikrocykle MD-4..MD+2, 1-3 zajęcia, akcent i poziom obciążeń do wyboru (`plan.js`) | Brak planu; poniedziałek: stałe liczby (`AI_TRAINING`) | Ten sam plan asystenta dla własnego terminarza (`autoDay` z klubem), akcent: trener O techniczny, S taktyczny, P zrównoważony; obciążenie normalne (`aiClubs.js`) | Patrz wiersze niżej |
| Zmęczenie i regeneracja (świeżość) | Zajęcia męczą (`fat` x wytrzymałość i wiek), sesja regeneracyjna oddaje 6 + 0,2 q fizycznego, dług meczowy | Tylko regeneracja dzienna, bez kosztu zajęć | Te same wzory zajęć | Świeżość XI na start dnia meczowego: przed -2,8 / -3,3 dla gracza; po -0,4 / -1,1 |
| Ostrość meczowa | Z zajęć do 85 (`sharp` x intensywność, wolniej bez obozu) | +14 tygodniowo do 85 | Z zajęć, ten sam wzór i ten sam efekt formy bazowej | Przed +0,8 / +0,5; po -0,2 / -0,1 (punkty ostrości) |
| Ciężkie nogi, przeciążenie (ACWR) | Na zawodnika z dziennika 28 dni; kara w meczu i morale -0,1 przy ACWR ponad 1,5 | Brak (0) | Ciężkie nogi jedną liczbą na klub, ACWR ze średnich wykładniczych 7 i 28 dni na zawodnika, ta sama kara i to samo morale | Składnik `trainingLoad`: przed -0,039 / -0,032; po -0,005 / +0,003 |
| Urazy treningowe | Na zawodnika i zajęcia: intensywność, typ, ACWR, wiek, ODP, świeżość, program powrotu, obóz, sztab | Poisson raz w tygodniu, bez intensywności i ACWR | `trainingInjuryChance`, ten sam wzór (suma ryzyka zajęć liczona raz na klub), program powrotu po urazie od 15 dni | Urazy treningowe w sezonie: przed 13,3 wobec 8,8 / 13,7 wobec 9,8; po 13,6 wobec 10,4 / 12,3 wobec 12,1; w lustrze 12,3 wobec 10,4 / 11,8 wobec 12,1 |
| Zgranie formacji i instrukcji | Z zajęć (taktyka, gierki, odprawa) i meczów, plus znajomość systemu i rytm zawodników | +2,5 x asystent tygodniowo, mecze, instrukcje do 80 | Formacja z zajęć planu (ten sam wzór), mecze; instrukcje do 88 (kalibracja: AI ok. 95 jak gracz) | `trainingCohesion`: przed +0,028 / +0,023; po +0,003 / +0,003 |
| Stałe fragmenty | Zajęcia „Stałe fragmenty” przy asystencie od 12 albo akcencie | Brak (poziom neutralny) | Te same zajęcia w planie | Przed +0,006 / +0,003; po 0,000 / -0,001 |
| Analiza wideo rywala | Dzień przed meczem, analityk od 5: 0,04 + 0,006 q | Ta sama premia w dniu meczu (`aiPrepToday`), x(1 + zagrożenie) przeciw groźnemu graczowi | Bez zmian (plan AI ma te same zajęcia wideo, premię liczy `aiPrepToday`) | 0,000 / 0,000 |
| Morale z zajęć | Suma `morale` zajęć, dzień wolny +0,15, obóz | +0,25 tygodniowo przez cały rok | Te same wzory | Morale z zajęć w sezonie (na zawodnika): gracz +8,5, AI przed +11,0; teraz z tego samego wzoru |
| Rozwój: bodziec | Bodziec z zajęć zawodnika, mnożnik 0,5-1,4 (plan domyślny ok. 1,08) | Stały mnożnik 1,0 | Bodziec z planu klubu x udział zawodnika w zajęciach (`aiStimFor`), ten sam `developPlayer` | Do 21 lat (OVR na sezon): przed +0,47 wobec +0,37 / +0,43 wobec +0,41 |
| Rozwój: akcent indywidualny | Do wyboru (domyślnie brak): +0,4 bodźca na dzień rozwojowy, -2 świeżości | Brak | Młodzi do 21 lat: najsłabszy kluczowy atrybut pozycji, ten sam koszt | Do 21 lat po: +0,45 wobec +0,58 / +0,48 wobec +0,64; w lustrze +0,62 wobec +0,58 / +0,64 wobec +0,64 |
| Program dla młodych | Do wyboru | Brak | Brak (narzędzie gracza) | Nie mierzono |
| Spadek po 29 latach | Wolniejszy przy treningu fizycznym | Stały | Z bodźca planu | 30+: przed -0,29 wobec -0,29 / -0,25 wobec -0,22; po -0,25 wobec -0,25 / -0,25 wobec -0,26 |
| Obóz (forma bazowa) | Rezerwacja gracza; bez obozu 0,3-1,1 formy bazowej | Losowanie według prestiżu, szacunek formy bazowej | Bez zmian plus dni obozu w planie (ostatnie dni przed rundą): lepsze zajęcia, mniej urazów, szybsze zgranie, morale | `trainingCamp` pasywnego gracza -0,05 / -0,06 (zamierzone, gracz nie zarezerwował); w lustrze -0,002 / -0,009 |
| Regeneracja po meczu, dług meczowy | `season.js`, wszyscy zawodnicy świata | To samo | To samo | Bez różnicy |
| Sztab medyczny i fizyczny | Jakość fizycznego: urazy x(1,2 - 0,02 q), regeneracja | Tylko urazy | Urazy i regeneracja z tego samego wzoru | W wierszach wyżej |
| Rotacja zmęczonych | Asystent wybiera skład z kary za świeżość poniżej 85 (`createTactics`, opcja „skład asystenta”) | `pickXI` z tą samą karą | Bez zmian; AI rotuje teraz z prawdziwego zmęczenia po treningu | Bez różnicy w regule |
| Odprawy przed meczem i w przerwie | Wybór gracza | `aiBriefing` (rywal gracza) | Bez zmian (docs/balans.md: średnie Z podobne) | Bez zmian |
| Odprawa pomeczowa | Wybór gracza (formularz zaznacza Pochwałę) | `aiPostMatchTalk`, ton z `aiChooseSpeech` | Bez zmian | Morale XI w dniu meczu niższe u gracza o 1,6-3,3 pkt morale (-0,07 do -0,13 pkt atrybutu); przy tonie wybranym jak AI różnica spada do 0,2-0,4 (-0,01 / -0,02) |
| Rozmowy indywidualne, zebrania | Do wyboru (Kadra, Rozmowy) | Brak | Brak | Nie mierzono; narzędzie gracza |

Suma składników treningu w dniu meczu (bez obozu): przed -0,005 / -0,006 dla gracza (AI bez kosztów obciążenia,
gracz lepszy w zgraniu i stałych fragmentach, wyniki się prawie znosiły); po -0,002 / +0,005. Strefy siły (średnia DEF, MID, ATT) pasywnego gracza wobec AI: przed -0,31 / -0,27,
po -0,27 / -0,21, w lustrze -0,15 / -0,20; resztę różnicy tłumaczą obóz pasywnego gracza i morale z odprawy (ton Pochwała
po porażkach odbiera morale, AI wtedy mówi „myślimy o kolejnym meczu”).

## Co się zmieniło w kodzie

| Plik | Zmiana |
|---|---|
| `src/training/aiClubs.js` (nowy) | `processAiDay`: codziennie dla 53 klubów AI plan asystenta (`autoDay`) z akcentem trenera, skutki zajęć liczone raz na klub (`profileOf`), na zawodnika tylko mnożniki osobiste (wytrzymałość, wiek, ODP, świeżość); świeżość, ostrość, morale, urazy (`trainingInjuryChance`), obciążenie (średnie 7 i 28 dni), program powrotu, akcent młodych, dni obozu (`aiCampFor`), stałe fragmenty i zgranie formacji (`aiSessionToClub`). `aiStimFor` daje bodziec miesiąca do `developPlayer`. |
| `src/training/config.js` | `AI_TRAINING` usunięte, nowe `AI_PLAN` (akcent według typu trenera, wiek akcentu młodych, koszt akcentu). `COH.aiFamWeek` usunięte (zgranie z zajęć), `COH.aiInstr` 80 -> 88 (kalibracja do zgrania gracza). |
| `src/training/plan.js` | `autoDay(game, date, ctx, club)` dla dowolnego klubu, `dayContext(..., camp)` z obozem klubu AI; daty tygodnia liczone raz na dzień (wcześniej dla każdej daty meczu osobno). |
| `src/training/index.js` | System dnia wywołuje `processAiDay`; z kroku tygodniowego usunięte stałe liczby AI i tygodniowe urazy AI. Modyfikator `trainingLoad` dla zawodników AI: ciężkie nogi klubu i przeciążenie zawodnika. |
| `src/training/cohesion.js` | `aiWeeklyCohesion` tylko z meczów, `aiSessionToClub` (formacja, stałe fragmenty). |
| `src/training/development.js` | Kluby AI: bodziec z `aiStimFor`, reset miesięczny; stary zapis bez stanu AI rozwija się jak wcześniej. |
| `src/training/load.js` | `trainingInjuryChance` przyjmuje gotową sumę ryzyka zajęć (`sessionMul`), wzór bez zmian. |
| `src/training/sessions.js` | Eksport `rollTrainingInjury`. |
| `src/training/state.js` | Pamięć podręczna dat (`daysBetween`, `mondayOf`). |
| `tests/aiTraining.test.mjs` (nowy) | 8 testów, patrz niżej. |
| `tests/training.test.mjs` | Test wydajności: budżet narzutu treningu `ratio < 1,6 albo +1000 ms` na pół sezonu (wcześniej 1,4 albo 600 ms), bo poza klubem gracza trenują 53 kluby AI. |

Zapis gry: zawodnik AI ma `aiTr` (ok. 60 B: bodziec miesiąca, dni akcentu, obciążenie, minuty, dzień), klub AI `aiStim`,
`aiCamp`, `legs`. Świat rośnie o ok. 90 KB (ok. 2,05 -> 2,14 MB), `game.training` z ok. 39 do ok. 61 KB.
Stary zapis działa: brak `aiTr` daje standardowy rozwój w pierwszym miesiącu.

Wydajność: ok. 1-2 ms na dzień gry (1300 zawodników), na pół sezonu ok. 150-450 ms zależnie od obciążenia procesora.

## Wpływ na świat gry (3 sezony, ziarna 1-3)

| Pomiar | Przed | Po |
|---|---|---|
| Ekstraklasa, średnia 14 najlepszych OVR klubu po 3 sezonach | 11,96 | 11,95 |
| 1 Liga, to samo | 10,36 | 10,46 |
| 2 Liga, to samo | 8,87 | 8,76 |
| Zawodnicy z OVR co najmniej 14 w Ekstraklasie po 3 sezonach | 10,7 | 10,0 |
| Wartość zawodników Ekstraklasy po 3 sezonach (mln zł) | 1606 | 1571 |
| Przyrost OVR w sezonie, do 21 lat (sezony 1, 2, 3) | +0,38, +0,31, +0,23 | +0,53, +0,40, +0,28 |
| Przyrost OVR w sezonie, 22-25 lat | +0,06 | +0,06 |
| Przyrost OVR w sezonie, 30+ lat | -0,26 | -0,26 |
| Dni zawodników na leczeniu w sezonie (cały świat) | ok. 28 300 | ok. 31 700 |

- Siła lig i wartości rynkowe zostają w granicach szumu (3 ziarna). Kluby AI płacą teraz za trening urazami (ok. +12 %
  dni na leczeniu w świecie), a zyskują na planie i obozach, więc bilans siły się znosi.
- Młodzi w klubach AI rosną szybciej (+0,06 do +0,15 OVR na sezon), bo trener AI daje im akcent indywidualny i jeździ
  na obóz. Przez kilka sezonów to więcej ciekawych młodych na rynku i trochę wyższe wartości w 1 Lidze. Gracz, który
  ustawi młodym akcent i pojedzie na obóz, ma to samo (wariant lustro).
- Weterani tracą tyle samo co wcześniej.

## Testy (`tests/aiTraining.test.mjs`)

1. Plan klubu AI: akcent według typu trenera, nigdy ciężkich zajęć dzień przed meczem, dzień meczu bez zajęć.
2. Kluby AI trenują: każdy ma bodziec z zajęć, zawodnicy udział, kluby z asystentem od 12 mają stałe fragmenty ponad 50,
   dzień z zajęciami zmienia świeżość.
3. Wspólny wzór urazu: suma ryzyka liczona raz na klub daje to samo co lista zajęć gracza.
4. Rozwój: ten sam akcent tygodnia daje podobny bodziec miesiąca u gracza i AI (różnica poniżej 25 %), akcent młodych
   na kluczowy atrybut, stary zapis bez stanu AI działa.
5. Balans w dniu meczu: świeżość (różnica poniżej 3), ostrość (poniżej 4) i suma składników treningu (poniżej 0,08)
   podobne u gracza z planem domyślnym i u klubów AI; obciążenie AI nie jest darmowe.
6. Urazy treningowe AI w skali gracza.
7. Zapis: stan zawodnika AI mały, przechodzi przez JSON.
8. Deterministyczność.

`tests/balance.test.mjs` przechodzi bez zmian (pasywny gracz i ten sam klub pod AI: składniki treningu różnią się
o mniej niż 0,15).

## Otwarte sprawy

- Odprawa pomeczowa: formularz zaznacza Pochwałę, która po porażce odbiera morale (-0,5). Trener AI wybiera ton do
  sytuacji. Przy pasywnym graczu to -0,07 do -0,13 pkt atrybutu na zawodnika w dniu meczu. Właściciel: `src/match`
  (domyślny ton z rady asystenta, `assistantAdvice`). Nie zmieniałem.
- Kluby AI nie używają programu dla młodych ani nauki nowych pozycji; trener AI nie zmienia akcentu w ciągu sezonu
  (np. przed meczem z faworytem). Możliwy kolejny krok.
- Zgranie AI to nadal model zbiorczy (instrukcje, znajomość systemu i rytm jako jedna liczba), skalibrowany do gracza.
- Urazy treningowe gracza bez obozu są nadal trochę częstsze niż AI (ok. +1 na sezon, w granicach szumu); część to kara
  za brak obozu (zamierzona).
