# Walka taktyk: jeden potok czynników meczu

Stan na Nov 27, 2026. Projekt w toku: zrobiony krok 1 (jeden potok bez zmiany liczb). Dokument opisuje cel projektu,
pięć kroków, dokładny zakres kroku 1 (co przeniesiono, czego nie i dlaczego), niespójności do kroku 2,
jak dodać nowy czynnik i jak cofnąć krok 1.

## 1. Cel (decyzje właściciela, Nov 27, 2026)

- Idealnie zbalansowany silnik. Wynik meczu = taktyka, ustawienie, instrukcje indywidualne, właściwy zawodnik
  z atrybutami na właściwej pozycji, forma, morale, trening, sytuacja zawodnika (świeży, po kontuzji, „na gazie”,
  spadek formy, zmęczenie) + warunki + małe RNG.
- Wszystko w JEDNYM potoku silnika, rozszerzalnym: nowy czynnik to jeden wpis w rejestrze.
- Każdy etap ma wyłącznik, dokumentację do cofnięcia (zmiana, plik, przed, po) i testy. Po krokach, które zmieniają
  liczby: kilkanaście serii testów i przegląd znawcy futbolu (niespójności, braki), poprawki przed kolejnym krokiem.
- Decyzje na kolejne kroki: krótkie podania przestają być zawsze najlepsze (pełne zerowanie efektów głównych);
  raport o rywalu jako paski cech z widełkami i tekst asystenta; mecze AI-AI: styl wpływa na wynik (te same zasady);
  siła taktyki zależy od techniki i myślenia taktycznego kadry, nie od numeru ligi (orientacyjnie 2 Liga x0,9,
  III liga x0,85, IV liga x0,8 [SZAC]); stan i warunki ważniejsze w niższych ligach (x1,05 do x1,2 [SZAC]).
- Granica stanu zawodnika (decyzja eksperta): suma +1,0 / -2,0 pkt atrybutu; psychika (forma, morale, „na gazie”,
  jedna pula) +0,7 / -0,8; ciało (świeżość, ostrość, powrót po kontuzji) 0 / -1,5; aklimatyzacja 0 / -0,6. Poza granicą:
  kondycja w meczu, gra z urazem, pozycja.
- Trafny plan przy równych drużynach: z 36 do 40-43 wygranych na 100 (+4 do +7 pp; najsilniejsza para najwyżej 0,45 pkt/mecz).

## 2. Kroki projektu

1. **Jeden potok bez zmiany liczb** (zrobione, ten dokument rozdz. 3). Strażnik: test bit w bit.
2. **Naprawa niespójności i granice** (rozdz. 5), warunki: atut boiska jako wartość terenu (frekwencja, podróż, murawa),
   derby, presja tabeli w końcówce (tytuł, puchary, awans, baraże, utrzymanie).
3. **Cechy taktyki**, zerowanie efektów głównych, reguły kontr (etapy plan i matchup).
4. **Plan AI przed meczem** i reakcje w meczu.
5. **Raport o rywalu**, sygnały w meczu, karta pomeczowa (z M.ledger).

## 3. Krok 1: jeden potok

### 3.1 Jak działa potok

Rejestr: `src/engine/modifiers.js`. Wbudowane wpisy silnika: `src/engine/pipeline.js` (czyste wzory w
`src/engine/match/factors.js`). Wpisy stanu zawodnika rejestrują też moduły gry: trening (`training/index.js`),
autorytet (`career/authority.js`), głowa w transferze (`career/mindset.js`), aklimatyzacja (`career/acclimatization.js`).

Etapy w kolejności: **attr** (atrybuty w strefach), **slot** (pozycja i strona), **player** (stan przed meczem),
**live** (stan w meczu co minutę), **team** (drużyna), **plan** (taktyka, w kroku 1 pusty), **matchup** (starcie planów),
**match** (warunki meczu), **rng** (losowania: zostają w silniku, w tej samej kolejności; rejestr niczego nie losuje).

Wpis: `{ id, stage, label, group, range: [min, max], when, channel | channels, order?, mode?, enabled?, apply(subject, ctx) }`.
- `apply` zwraca liczbę (kanał `channel`, domyślnie `pts`, punkty atrybutu) albo obiekt `{ kanał: liczba }`.
- `when`: `start` (raz na mecz), `change` (po zmianie, np. slotu albo stanu drużyn), `minute` (co minutę), `action` (w akcji).
- `mode`: `match` (tylko pełny silnik), `quick` (tylko mecze w tle i raporty siły), brak (oba).
- `order`: kolejność w etapie (domyślnie 0, równe: kolejność rejestracji). Dyspozycja dnia i WAZ mają 90 i 91,
  żeby suma szła w tej samej kolejności co dawniej.
- `range`: w kroku 1 tylko dokumentacja (wartości nie są przycinane, inaczej zmieniłyby się wyniki). Krok 2 może je egzekwować.
- Zgodność wstecz: stary zapis `{ id, scope: 'player'|'team'|'match', label, apply }` działa dalej (scope = etap,
  wynik w `pts`), `unregisterModifier(scope, id)` też.

Kanały (`CHANNELS`): sumy od 0 (`pts`, `zone.DEF/MID/ATT/GK`, `zone.all`, `zone.field`, `brk`, `cap`, `hunger`, `hfa`, `home`)
i iloczyny od 1 (`act.*`, `act`, `dys`, `pAct`, `fat`, `foul`, `card`, `red`, `pen`, `penCard`, `tacCard`, `conv`, `inj`, `pos`, `err`).

Odczyt:
- `evaluate(stage, subject, ctx)` oddaje `{ total, parts, ch, chParts }`: `total` i `parts[id]` dla `pts` (jak dawniej),
  `ch[kanał]` po złożeniu, `chParts[id][kanał]` wkład wpisu. Suma `parts` = `total`.
- Szybkie ścieżki silnika (bez alokacji): `channel(stage, kanał, ...)`, `channelTerms(...)` (wkłady po kolei, silnik dodaje
  je do swojej wartości w tej samej kolejności co przed potokiem), `entriesFor(...)`.
- Gorąca pętla czyta gotowe wartości: etap match raz na mecz (`M.mx`), attr i player raz na zawodnika (`x.R`, `x.base`,
  `x.parts`), slot po zmianie slotu (`x.mxPos`, `x.mxErr`), live i team raz na minutę w `updateZones` (`x.live`, `T.tTerms`),
  matchup po zmianie stanu drużyn (znacznik `T.zv`, pamięć `T.mu`). Wyjątki: strzał (`finishing`) liczy etap live w chwili
  strzału (zaangażowanie mogło się zmienić w tej minucie), głód goli liczy się leniwie z pamięcią na minutę.
- Wyłącznik: `setModifierEnabled(stage, id, false)` albo `unregisterModifier`. Wyłączony wpis wartości (np. kapitan,
  głód goli, pogoda) daje wartość neutralną kanału (0 albo 1).

Rozbicie w meczu: `M.ledger` (zrealizowany wkład, bez wpływu na wynik), średnie z `ledgerSummary(M)` (`pipeline.js`):
na drużynę wkład etapów player i live na zawodnika i minutę, etapu team na minutę (osłabienie, spójność, kilku z bólem,
kapitan), średni bonus kontr w akcjach i liczba akcji wg rodzaju, wartości warunków meczu.

### 3.2 Przeniesione czynniki

| Czynnik | Skąd (plik, funkcja) | Wpis (id, etap, kanał) | Zakres |
|---|---|---|---|
| Wagi atrybutów w strefach | `match/teams.js` `zoneRatings` w `mkPlayer` | `zoneRatings`, attr, `zone.DEF/MID/ATT/GK` | 1 do 20 |
| Gra poza pozycją: skuteczność | `match/teams.js` `eff`, `slotFit`; `teamStrength.js` `effective`, `lineupRating`, `ratingFromPicked` (FIN, positionLoss) | `position`, slot, `pos` | 0,55 do 1 |
| Gra poza pozycją: błędy obrońcy | `match/teams.js` `errFactor` | `positionErrors`, slot, `err` | 1 do 2,2 |
| Forma, morale, ostrość, świeżość, gra z urazem | `modifiers.js` (już w rejestrze) | `form`, `morale`, `sharp`, `fresh`, `playingInjured`, player, `pts` | rozdz. 5 |
| Trening, autorytet, głowa w transferze, aklimatyzacja | moduły gry (już w rejestrze) | `trainingCohesion`, `trainingPrep`, `trainingLoad`, `trainingCamp`, `trainingSetPieces`, `coachAuthority`, `transferMind`, `acclim`, player, `pts` | od -1 do 0,4 [SZAC] |
| Dyspozycja dnia | `match/teams.js` `mkPlayer` (`dayForm`) | `dayForm`, player (order 90, tylko w meczu), `pts` | -2,6 do 2,6 |
| Ranga meczu x WAZ | `match/teams.js` `mkPlayer` (`waz`) | `waz`, player (order 91, tylko w meczu), `pts` | -0,36 do 0,4 |
| Zaangażowanie w meczu (Z) | `match/teams.js` `eff`; `core.js` `finishing` | `engagement`, live, `pts` | -0,5 do 0,5 |
| Kondycja w meczu | `match/teams.js` `eff` (`condPenalty`); `core.js` `finishing` | `condition`, live, `pts` | -55 do 0 (bez granicy) |
| Gra w osłabieniu | `match/teams.js` `updateZones` (`missing x K.shortHanded`) | `shortHanded`, team, `zone.field` | -3,6 do 0 |
| Spójność w meczu | `match/teams.js` `updateZones` (`(100 - S) x 0,015`) | `cohesion`, team, `zone.field` | -1,05 do 0 |
| Kilku grających z bólem | `match/teams.js` `updateZones` (`knockPen`) | `knocks`, team, `zone.field` | -0,6 do 0 |
| Kapitan przy stawce (E x S) | `match/teams.js` `updateCaptain` | `captain`, team, `cap` | -1 do 1 |
| Głód goli drużyny (H) | `match/teams.js` `teamHunger` (wywołanie w `core.js` `satAct`) | `hunger`, team, `hunger` | 0 do 1 |
| Pewność siebie z tabeli | `teamStrength.js` `ratingFromPicked` (`ctx.tableTerm`) | `tableConfidence`, team (mecze w tle), `zone.all` | -0,15 do 0,15 |
| Decyzje trenera w meczu w tle | `teamStrength.js` `ratingFromPicked` (`ctx.coachTerm`) | `coachDecisions`, team (mecze w tle), `zone.all` | -0,3 do 0,3 |
| Niepełny skład (mecz w tle) | `teamStrength.js` `ratingFromPicked` (`shortPenalty`) | `shortHandedQuick`, team (mecze w tle), `zone.field` | -9,9 do 0 |
| Rodzaje akcji (plan wobec planu rywala) | `core.js` `pickType` | `typeMix`, matchup, `act.POZ/SKR/KON/DYS` | 0 do 1,5 |
| Kontry taktyczne | `core.js` `counterBonus` | `counters`, matchup, `brk` | -0,5 do 0,5 |
| Pogoda (i zła murawa przez `engineWeather`) | `core.js` `M.ctx.weather.*` (8 miejsc), `teams.js` `updateCondition` | `weather`, match, `conv`, `foul`, `fat`, `inj`, `act`, `dys` | 0,85 do 1,7 |
| Sędzia (surowość) | `core.js` `refStrict` (5 miejsc: faule, kartki, czerwone, karne, kartka za karnego, faul taktyczny) | `referee`, match, `foul`, `card`, `red`, `pen`, `penCard`, `tacCard` | 0,7 do 1,4 |
| Ranga meczu (faule, kartki) | `core.js` `phaseFoul` (`rank >= 2`) | `rank`, match, `foul`, `card` | 1 do 1,15 |
| Kibice i atut boiska | `core.js` `createMatch` (`hfa` z frekwencji, `strDiff` +-0,3) | `crowd`, match, `hfa`, `home` | 0 do 1 |

Kolejność działań zmiennoprzecinkowych została ta sama: silnik dodaje wkłady po kolei (`a - b` = `a + (-b)` bit w bit),
mnożniki warunków meczu mnoży w tych samych miejscach wzorów co dawniej, suma etapu player idzie w tej samej kolejności
(dyspozycja dnia i WAZ na końcu). Rejestr nie losuje: dyspozycja dnia jest losowana w `mkPlayer` jak dawniej.

### 3.3 Czynniki poza potokiem (zostają, powód)

- **Plan (taktyka)**: `tacticParams`, `lerpParams`, `addEffect` (`match/teams.js`, formacje i instrukcje, `INSTR_NUM`)
  i `applyShift` (instrukcje indywidualne, `match/playerInstr.js`). Parametry mają kilkadziesiąt pól z bezwładnością zmiany
  taktyki i przesunięciem od zawodników; przeniesienie bez zmiany liczb wymagałoby przepisania mieszania parametrów.
  Etap plan to krok 3 (wektor cech, zerowanie efektów głównych).
- **Instrukcje indywidualne `x.pi.*`** (wagi strzałów, fauli, kartek, zmęczenia): liczone w `refreshPI` z zapisanych jakości
  (piVer); to część etapu plan, krok 3.
- **Kara lekkiego urazu w meczu**: `x.base -= pen x ovr` w `core.js` `injure` (zdarzenie). Jako wpis etapu live zmieniłaby
  kolejność dodawania (stan + kara + Z + kondycja), więc liczby. Krok 2 (razem z karą w procentach ovr).
- **Bramkarz z pola**: `goalkeeperSlotModifiers` (`positions.js`): obiekt kilku mnożników, w pełnym silniku połowa kary
  (`teams.js` `updateZones`), w meczach w tle cała. Dwie różne postaci tej samej kary; ujednolicenie to krok 2.
- **Stan meczu i nasycenie**: `gameState` (`K.gsLead*`, `K.gsTrail*`), `satAct` i `satXg` (`core.js`): wzory zależne od
  wyniku w trakcie minuty; z potoku korzystają przez wpis `hunger`. Momentum (`core.js`), okrzyki (`shoutMods`),
  zmęczenie w szybkości (`condSpeed`, `updatePace`), faule zmęczonych (`tiredFoul`), krycie przy stałych fragmentach
  (`spLapse`), ryzyko urazów i pogłębienia (`phaseInjuries`, `knockRisk`, poza mnożnikiem pogody): mechanika minut i zdarzeń,
  nie stała siła; zostają w silniku.
- **VAR** (`ctx.var`): rozgałęzienia zdarzeń, nie liczba.
- **Mecze w tle**: atut boiska w `quickSim.js` (`QS.MU_H`, `QS.MU_A`, `QS.MU_N`, bez frekwencji), sędzia tylko w kartkach
  (`quickMatch`), kapitan przez `qsMul` (`season.js` `playQuick`, `QS.CAP`). Inny model niż pełny silnik; ujednolicenie w kroku 2.
- **Wybór składu**: `lineup.js` (autoPickXI, `slotValueBase`) używa `posEff` bezpośrednio do wyboru zawodników (nie do siły).
- **AI trenera** (`match/coach.js`): odczyty pogody (`heat`), `condPenalty`, `teamHunger` do decyzji; to percepcja AI, nie siła.

### 3.4 Test bit w bit i wydajność

- `tests/enginePipeline.test.mjs` (pomocnicze `tests/pipelineGolden.mjs`, dane `tests/enginePipeline.golden.json`):
  210 meczów pełnego silnika ze stałymi ziarnami (kluby czterech lig, pogoda, sędzia, frekwencja, ranga, VAR, mecze
  pucharowe, instrukcje drużynowe i indywidualne, zamiana pozycji i zawodnik z pola w bramce, zmęczeni, bez ostrości,
  z urazem, AI włączone i wyłączone, zmiany, okrzyki, zmiana taktyki w meczu), skrót: dziennik zdarzeń, stan RNG, wynik,
  wynik z ocenami (`result`), sonda stref, spójności, kapitana i stanu zawodników co minutę; do tego teamRating,
  lineupRating i rozbicie (126 kadr), 120 meczów w tle (quickMatch, quickKnockout) i krótki sezon (do Aug 20, 2026,
  246 meczów, dwa dni meczowe gracza w pełnym silniku). Złote skróty zebrane przed zmianami: wszystkie zgodne po kroku 1.
- Zmiana liczb silnika (krok 2 i dalej) celowo zmienia skróty. Nowe złote skróty: uruchom generator ze scratchpadu
  albo odpowiednik (`goldenMatch`, `matchDigest`, `ratingDigests`, `quickDigests`, `seasonDigest` z `tests/pipelineGolden.mjs`,
  format jak w `tests/enginePipeline.golden.json`), zapisz plik i opisz w dzienniku, które liczby i dlaczego się zmieniły.
- `tests/modifiers.test.mjs`: każdy wpis ma etap, label, group, range i when; suma rozbicia = suma; wyłączenie wpisu
  zmienia wynik tylko o jego wkład; stary zapis bez nowych pól działa; M.ledger nie zmienia meczu.
- Wydajność (`npm run perf`, sezon Widzewa do Jun 30, 2027, 8 par pomiarów na przemian, Nov 27, 2026): sezon razem
  średnio 11 459 ms przed i 11 656 ms po (+1,7 %, szum pojedynczych pomiarów +-5 %), system matchday 2405 ms przed
  i 2470 ms po (+2,7 %). Rejestr ma listy wpisów skompilowane na etap, kanał i tryb: `evaluate` stanu zawodnika jest
  szybszy niż przed potokiem, `teamRating` bez zmian. Pełny silnik (mecz gracza, poza `npm run perf`) wolniejszy
  o kilka procent [SZAC: 3-8 %, ok. 0,3 ms na mecz].

## 4. Jak dodać nowy czynnik

1. Wybierz etap (rozdz. 3.1) i kanał. Stan zawodnika przed meczem: etap player, kanał `pts` (punkty atrybutu).
   Warunki meczu: etap match, kanał iloczynu (np. `conv`, `fat`) albo nowy kanał w `CHANNELS`.
2. Dodaj jeden wpis w module, który zna dane (albo w `src/engine/pipeline.js`):
   ```js
   registerModifier({
     id: 'travel', stage: 'match', group: 'conditions', label: 'Podróż gości', range: [0.95, 1],
     channels: ['fat'], apply: (ctx) => ({ fat: ctx.travelKm > 400 ? 1.03 : 1 }),
   });
   ```
3. Wartość, której silnik jeszcze nie czyta (nowy kanał albo nowy wpis etapu match), trzeba raz podpiąć w miejscu
   odczytu (`matchFactors` w `pipeline.js` i wzór w `core.js`). Wpisy kanału `pts` etapu player, `zone.field`
   etapu team i `pts` etapu live działają od razu (silnik sumuje cały kanał).
4. Test: `tests/modifiers.test.mjs` sprawdzi label, range i when. Zmiana liczb: nowe złote skróty (rozdz. 3.4)
   i serie meczów z kalibracją (1500+ meczów, docs/balans.md).
5. Linia w `docs/funkcje.md` i wpis w `docs/dziennik.md`.

## 5. Niespójności do kroku 2 (raport znawcy futbolu i przegląd kodu)

Nie naprawione w kroku 1 (zmieniłyby liczby). Miejsca w kodzie:
- Forma i morale dublują „serię wygranych” (`modifiers.js` `form`, `morale`); morale bez clampa (0,04 x (morale - 10)).
- Brak osobnego „na gazie” (pewność siebie z malejącym zwrotem); psychika bez wspólnej puli +0,7 / -0,8.
- Świeżość bez clampa, do -3,4 pkt przy świeżości 0 (`modifiers.js` `fresh`), silniejsza niż forma (+-0,5).
- Gra z urazem w procentach ovr: -0,045 x ovr (`modifiers.js` `playingInjured`), tak samo kara lekkiego urazu w meczu
  (`core.js` `injure`, `KNOCK.types[].pen x ovr`): silniejsi zawodnicy tracą więcej punktów.
- Ostrość za łagodna: ostrość 30 = -0,6 (`modifiers.js` `sharp`).
- Kondycja w meczu bez granicy (`factors.js` `condPenalty`: kwadratowa, przy kondycji 50 ok. -11 pkt x tolerancja);
  znawca: do -2,4.
- Zgranie liczone dwa razy? `trainingCohesion` (etap player, `training/cohesion.js` `cohesionTerm`) i start spójności
  meczu `T.S` z treningu (`trainingMatchInput`, etap team `cohesion`). Do sprawdzenia.
- `structurePenalty` (`positions.js` `assessLineup`) nie działa w silniku (tylko ostrzeżenia i raport składu), więc kara za
  pozycję nie jest podwójna; liczba w raporcie może jednak mylić.
- Pewność z tabeli i decyzje trenera tylko w meczach w tle (`tableConfidence`, `coachDecisions`, tryb quick); pełny silnik
  ma trenera przez decyzje AI, bez pewności z tabeli.
- Dyspozycja dnia i WAZ tylko w pełnym silniku; mecze w tle bez nich.
- Atut boiska: pełny silnik z frekwencji (`crowd`, 0,7 + 0,3 x frekwencja), mecze w tle stałe `QS.MU_H` i `QS.MU_A`.
  Brak podróży, derbów (poza stawką kapitana i rangą), murawa tylko przez mnożniki pogody (zła murawa: zmęczenie
  i urazy; sztuczna i doskonała bez efektu).
- Sędzia: pełny silnik faule, kartki, karne; mecze w tle tylko kartki.
- Kapitan: pełny silnik przez E x S w kilku wzorach, mecze w tle przez przechył średnich goli (`QS.CAP`, `season.js`).
- Etap matchup: kontry przycięte do +-0,5, wagi rodzajów akcji bez granicy; pomiar: ranking zamiast walki taktyk
  (krótkie podania +0,23, długie -0,24, kontry w szumie). Krok 3.
- Bramkarz z pola: w pełnym silniku połowa kary `goalMul`, w meczach w tle cała.
- Wybór składu (`lineup.js`) liczy pozycję bez potoku (`posEff`): po zmianie wpisu `position` wybór i siła mogą się rozjechać.
- Zakresy wpisów (`range`) są dokumentacyjne; krok 2 ustala granice i ewentualne przycinanie.

## 6. Jak cofnąć krok 1

Krok 1 to jeden commit („Silnik meczu zbiera wszystkie czynniki w jednym potoku, wyniki bez zmian”). Cofnięcie:
`git revert <hash commita>` (hash w `docs/dziennik.md`, wpis z Nov 27, 2026). Wyniki meczów się nie zmienią (krok 1 nie
zmienia liczb), znikną: `src/engine/pipeline.js`, `src/engine/match/factors.js`, nowe pola rejestru, `M.ledger`,
`M.mx`, testy `tests/modifiers.test.mjs`, `tests/enginePipeline.test.mjs` z danymi i ten dokument. Po cofnięciu `npm run sw`.

Zmienione pliki (przed: wzór w miejscu użycia; po: wpis potoku i odczyt gotowej wartości):
`src/engine/modifiers.js` (rejestr etapów i kanałów), `src/engine/pipeline.js` (nowy), `src/engine/match/factors.js` (nowy),
`src/engine/match/teams.js` (`mkPlayer`, `eff`, `errFactor`, `slotFit`, `updateZones`, `updateCaptain`, `updateCondition`),
`src/engine/match/core.js` (`createMatch`, `satAct`, `phaseTeams`, `phaseFoul`, `phaseAction`, `pickType`, `finishing`,
`shot`, `awardPenalty`, `tacticalFoul`, `phaseInjuries`, `knockRisk`), `src/engine/teamStrength.js` (`effective`,
`lineupRating`, `ratingFromPicked`), opisy wpisów w `src/training/index.js`, `src/career/authority.js`,
`src/career/mindset.js`, `src/career/acclimatization.js`.
