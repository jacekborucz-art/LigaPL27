# Walka taktyk: jeden potok czynników meczu

Stan na Nov 28, 2026. Projekt w toku: zrobione kroki 1 (jeden potok bez zmiany liczb) i 2 (naprawa potoku, granice
stanu zawodnika, warunki meczu, mecze w tle jak pełny silnik; czeka na przegląd znawcy futbolu). Dokument opisuje cel
projektu, pięć kroków, zakres kroku 1 (co przeniesiono, czego nie i dlaczego), niespójności, jak dodać nowy czynnik,
jak cofnąć krok 1 oraz krok 2 z kalibracją (rozdz. 7).

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
   derby, presja tabeli w końcówce (tytuł, puchary, awans, baraże, utrzymanie). Zrobione (rozdz. 7), przed przeglądem znawcy.
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
- Zmiana liczb silnika (krok 2 i dalej) celowo zmienia skróty. Nowe złote skróty: `node tools/golden-save.mjs "opis zmiany"`
  (zapisuje `tests/enginePipeline.golden.json` i wypisuje, ile meczów i które skróty się zmieniły); opisz w dzienniku,
  które liczby i dlaczego się zmieniły.
- Scalenie z main (Nov 27, 2026): gałąź kroku 1 powstała przed rundą 3 biernej gry (v1.25.1 Beta, `training/prep.js`,
  `AUTH.dep`). Po scaleniu mecze pełnego silnika, siła drużyn i mecze w tle bez zmian, a krótki sezon ma skrót
  z rundy 3 (zapisany narzędziem wyżej; narzędzie liczy w kolejności testu, bo sezon ustawia aktywną grę). Kontrola jakości (osobny agent): własny generator, 1084 mecze pełnego silnika
  (dogrywki, karne, puchary UEFA, sparingi, czerwone kartki, urazy, zmiany taktyki w meczu, III i IV liga), 160 kadr,
  160 meczów w tle i sezony do Oct 31, 2026: wszystko zgodne bit w bit z kodem sprzed potoku.
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

Nie naprawione w kroku 1 (zmieniłyby liczby). Co z tego zrobił krok 2 i co zostało: rozdz. 7.2 i 7.9. Miejsca w kodzie:
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

Pułapki potoku znalezione przy kontroli jakości (do poprawy w kroku 2, dziś bez wpływu na liczby):
- Pole `mode` działa odwrotnie w etapach match i slot: `pipeline.js` `matchFactors` (`evaluate('match', ctx, ctx)`)
  i `channel('slot', ...)` dostają ctx z `createMatch` bez `inMatch`, więc wpis `mode: 'quick'` wchodzi do meczu,
  a `mode: 'match'` jest pomijany.
- Filtr po jednym kanale: `matchupWeights` wybiera wpisy przez `entriesFor('matchup', 'act.POZ')`, `attrZones` przez
  `entriesFor('attr', 'zone.DEF')`; wpis tylko z `act.KON` albo tylko z `zone.ATT` zostanie pominięty. Wyłączenie
  `typeMix` przy innym wpisie act gubi wagi bazowe `K.typeW`.
- Etap match: silnik czyta `chParts` konkretnych wpisów, nie sumę kanału, więc nowy wpis warunków wymaga też zmiany
  w `core.js` (przykład z rozdz. 4 sam nic nie zrobi).
- Wyłącznik w trakcie meczu: `M.mx`, `x.mxPos`/`x.mxErr` i `T.mu` nie zależą od `registryVersion`; przełączenie
  działa od następnego meczu albo zmiany slotu. Wyłączenie `zoneRatings` daje strefy 0, nie wartość neutralną.
- `M.ledger` nie widzi kary lekkiego urazu w meczu (`core.js` `injure`: `x.base -= ...`).
- Poza potokiem także: stałe fragmenty z treningu w pełnym silniku (`trainingMatchInput`; wpis `trainingSetPieces`
  wyłączony w meczu) i podpowiedzi zmian w `ui/matchdayView.js` (`effAt`, `posEff` bez potoku).

## 6. Jak cofnąć krok 1

Krok 1 to jeden commit („Silnik meczu zbiera wszystkie czynniki w jednym potoku, wyniki bez zmian”). Cofnięcie:
`git revert -m 1 <hash scalenia>` (commit scalenia „Silnik meczu zbiera wszystkie czynniki w jednym potoku”, `git log --merges`). Wyniki meczów się nie zmienią (krok 1 nie
zmienia liczb), znikną: `src/engine/pipeline.js`, `src/engine/match/factors.js`, nowe pola rejestru, `M.ledger`,
`M.mx`, testy `tests/modifiers.test.mjs`, `tests/enginePipeline.test.mjs` z danymi i ten dokument. Po cofnięciu `npm run sw`.

Zmienione pliki (przed: wzór w miejscu użycia; po: wpis potoku i odczyt gotowej wartości):
`src/engine/modifiers.js` (rejestr etapów i kanałów), `src/engine/pipeline.js` (nowy), `src/engine/match/factors.js` (nowy),
`src/engine/match/teams.js` (`mkPlayer`, `eff`, `errFactor`, `slotFit`, `updateZones`, `updateCaptain`, `updateCondition`),
`src/engine/match/core.js` (`createMatch`, `satAct`, `phaseTeams`, `phaseFoul`, `phaseAction`, `pickType`, `finishing`,
`shot`, `awardPenalty`, `tacticalFoul`, `phaseInjuries`, `knockRisk`), `src/engine/teamStrength.js` (`effective`,
`lineupRating`, `ratingFromPicked`), opisy wpisów w `src/training/index.js`, `src/career/authority.js`,
`src/career/mindset.js`, `src/career/acclimatization.js`.

## 7. Krok 2: naprawa potoku, granice stanu, warunki meczu, mecze w tle jak pełny silnik (Nov 28, 2026)

Zrobione przed przeglądem znawcy futbolu (pakiet danych do przeglądu: rozdz. 7.8). Każda grupa zmian ma wyłącznik
w jednym obiekcie `ENGINE2` (`src/engine/engine2.js`): `{ pipeFix, state, conditions, unify }`. Wszystkie `false`
= dokładnie zachowanie sprzed kroku 2 (test `tests/engine2.test.mjs` na złotych skrótach kroku 1 zachowanych w
`tests/enginePipeline.step1.golden.json`: 210 meczów pełnego silnika, siła drużyn, mecze w tle i krótki sezon bit w bit).
Liczby stanu i warunków są w tym samym pliku (`STATE`, `COND`, `TIER_MUL`).

### 7.1 Zmiany (zmiana, plik, funkcja, przed, po, wyłącznik)

| Zmiana | Plik, funkcja | Przed (krok 1) | Po (krok 2) | Wyłącznik |
|---|---|---|---|---|
| Pole `mode` w etapach match i slot | `pipeline.js` `matchFactors`, `slotMx` | ctx bez `inMatch`: wpis `mode: 'quick'` wchodził do meczu, `mode: 'match'` był pomijany | kontekst z `inMatch` (mecz), mecze w tle `matchFactors(ctx, false)` | pipeFix |
| Filtr po jednym kanale | `pipeline.js` `attrZones`, `matchupWeights` | `entriesFor('attr', 'zone.DEF')`, `entriesFor('matchup', 'act.POZ')`; bez `typeMix` gubione wagi `K.typeW` | wszystkie wpisy z dowolnym kanałem stref albo `act.*`; bez `typeMix` wagi bazowe `K.typeW` razy inne wpisy | pipeFix |
| Etap match czyta sumę kanału | `pipeline.js` `matchFactors` | `chParts` wpisów weather, referee, rank, crowd (nowy wpis wymagał zmiany `core.js`) | iloczyn lub suma całego kanału (`foul`, `card`, `conv`, `fat`, `hfa` ...); nowy wpis warunków działa bez zmian w `core.js`; kartka za faul w polu karnym = 0,1 x kanał `penCard` | pipeFix |
| Pamięci zależne od wersji rejestru | `core.js` `phaseTeams` (`M.mx`), `pipeline.js` `slotMx` (`x.mxPos`, `x.mxErr`), `matchupCache` (`T.mu`) | wyłącznik wpisu działał od następnego meczu albo zmiany slotu | od następnej minuty (`registryVersion`) | pipeFix |
| Neutralne strefy | `pipeline.js` `attrZones` | wyłączony `zoneRatings`: strefy 0 | ovr zawodnika | pipeFix |
| Kara lekkiego urazu w `M.ledger` | `core.js` `injure`, `pipeline.js` `ledgerMinute`, `ledgerSummary` | niewidoczna | `perPlayerMinute.knockInMatch` | pipeFix |
| Pula psychiki | `modifiers.js` `statePoolTerm` (wpis `statePool`, order 89) | forma +-0,5 i morale -0,36 do +0,4 bez wspólnej granicy (seria wygranych podnosi oba) | forma + morale + „na gazie” razem +0,7 / -0,8 | state |
| „Na gazie” | `modifiers.js` `onFireOf` (wpis `onFire`) | brak | seria ostatnich ocen co najmniej 0,3 ponad średnią z 10 meczów (`p.fh`, min. 4): 0,35 x (1 - e^(-k/1,5)): 1 mecz +0,17, 3 mecze +0,30; słabszy ostatni mecz zeruje serię | state |
| Ostrość | wpis `sharp` | -0,02 x (60 - o): 30 -> -0,6 | -(0,015 d + 0,0005 d²), d = 65 - o: 30 -> -1,14, 45 -> -0,50, 60 -> -0,09 | state |
| Świeżość | wpis `fresh` | -0,04 x (85 - ś) do -2,0, tylko mecze w tle i raporty | -0,028 x (85 - ś) (35 -> -1,4) w obu silnikach, w puli ciała | state |
| Kondycja na start meczu | `teams.js` `startCond` | kondycja = świeżość (świeżość 70: kara od 1. minuty, bez granicy; cała drużyna -1,19 pkt/mecz, w tle -0,12) | 95 - 0,25 x (95 - ś): zmęczony słabnie wcześniej, a zmęczenie sprzed meczu liczy pula ciała | state |
| Powrót po kontuzji („rdza”) | `season.js` dzienna regeneracja (`p.rust`), `applyResult`; `modifiers.js` `rustOf` | brak (tylko ostrość 30 po przerwie ponad 28 dni) | przerwa od 10 dni: min(0,8; 0,2 + dni/100) w 1. meczu, maleje liniowo przez 1-4 mecze (14, 28, 60 dni) | state |
| Pula ciała | wpis `statePool` | świeżość, ostrość osobno, bez granicy | świeżość + ostrość + rdza 0 / -1,5 | state |
| Aklimatyzacja | wpis `statePool` | 0 / -0,6 | 0 / -0,6 (teraz w sumie stanu) | state |
| Suma stanu i mnożnik ligi | wpis `statePool` | brak | (psychika + ciało + aklimatyzacja) w +1,0 / -2,0, potem x1,00 / 1,05 / 1,10 / 1,15 / 1,20 (Ekstraklasa ... IV liga; zagranica x1) | state |
| Gra z urazem | wpis `playingInjured` | -0,045 x ovr (ovr 8: -0,36, ovr 14: -0,63) | -0,55 pkt dla każdego | state |
| Lekki uraz w meczu | `core.js` `injure` | `pen` x ovr | `pen` x 12: stłuczenie -0,36, skręcenie -0,60, naciągnięcie -0,78 | state |
| Zgranie liczone raz | `training/cohesion.js` `trainingMatchInput` | start spójności w meczu 70 + 0,3 x zgranie i do tego wpis `trainingCohesion` (to samo zgranie dwa razy) | start spójności 85 dla wszystkich; zgranie tylko przez `trainingCohesion` (też w meczach w tle) | state |
| Atut boiska jako wartość terenu | `pipeline.js` `terrainHfa` (wpis `terrain` zamiast `crowd`), `season/conditions.js` `travelKm`, `quickFill` | 0,7 + 0,3 x frekwencja | (0,60 + 0,30 x frekwencja + 0,14 x min(1, km/400) + murawa gospodarza: sztuczna 0,06, zła 0,03) x mnożnik ligi; podróż z odległości stolic województw x1,2 (ten sam region 10 km, to samo województwo 60, zagranica 1000) | conditions |
| Derby | wpis `derby`, `conditions.js` `fixtureConditions` (`career/fans.js` `rivalry`) | tylko stawka kapitana i ranga | intensywność v 1-3 (x mnożnik ligi): faule x(1 + 0,05 v), kartki x(1 + 0,07 v), różnica klas x(1 - 0,06 v), rozrzut dyspozycji dnia x(1 + 0,1 v) | conditions |
| Murawa w grze | wpis `pitch`; `core.js` `phasePossession`, `phaseAction` | zła: tylko zmęczenie x1,15 i urazy x1,2 (przez pogodę) | zła: celność podań -0,025 x (1 + krótkie podania), przełamanie akcji pozycyjnej -0,12, dośrodkowań +0,04, faule x1,06; doskonała: podania +0,005, akcja pozycyjna +0,03; sztuczna: +0,02 | conditions |
| Stawka meczu x psychika | `pipeline.js` `stakesTerm` (wpis `waz`) | ranga 2+: 0,04 x (WAZ - 10) | max(ranga 2+, presja tabeli) x (0,03 x (WAZ - 10) + 0,015 x (OPA - 10)), granica +-0,4, x mnożnik ligi | conditions |
| Presja tabeli w końcówce | `conditions.js` `tablePressure` | brak | ostatnie 6 kolejek; linie stref ligi (`zonesFor`): tytuł 1, awans 1, spadek 1, LM 0,8, baraż o utrzymanie 0,8, baraże 0,7, LK 0,6; bliskość 1 - różnica pkt / (1,5 x kolejki + 2); x (7 - kolejki) / 6 | conditions |
| Atut boiska w meczach w tle | `quickSim.js` `expectedGoals` | stałe `QS.MU_H` 1,50, `QS.MU_A` 1,19 | `QS.MU_C` x e^(+-0,1315 x hfa) z tego samego wpisu `terrain` (przy hfa 0,88 dawne liczby) | unify |
| Sędzia w meczach w tle | `quickSim.js` `expectedGoals`, `quickMatch` | tylko kartki x surowość | gole x (1 + 0,08 x (kanał `pen` - 1)); kartki z kanałów `foul` x `card` (sędzia, ranga, derby, murawa), czerwone x `red` | unify |
| Stawka x WAZ w meczach w tle | wpis `waz` (dawniej `mode: 'match'`) | tylko pełny silnik | oba silniki (ranga z `quickRank`, presja z `fixtureConditions`) | unify |
| Pewność siebie z tabeli | wpis `tableConfidence` | +-0,15 tylko w meczach w tle | wyłączona: pewność siebie liczy pula psychiki w obu silnikach (dublowała formę i morale) | unify |
| Ten sam kontekst warunków | `match/matchday.js` `kickOff`, `season.js` `playQuick` | różne dane wejściowe | oba biorą `fixtureConditions` (podróż, derby, presja, poziom ligi); mecz w tle frekwencję z `quickFill` (jak studio bez nastroju kibiców i pogody) | conditions, unify |

Sprawdzone i bez zmian (z uzasadnieniem):
- Bramkarz z pola: pomiar [SYM] (300 meczów pełnego silnika, 3000 w tle): pełny silnik (połowa `goalMul` + niska ocena
  bramkarska z atrybutów) traci 2,09 razy więcej goli, mecz w tle z całą karą 2,06 razy, z połową 1,59 razy. Obie postaci
  dają ten sam skutek, `QS.GK_SHARE = 1` (cała kara zostaje).
- Dyspozycja dnia tylko w pełnym silniku: nachylenie meczu w tle (`QS.BETA_CLUB`) dopasowano do pełnego silnika, który ją
  zawiera; ten sam rozrzut dodany drugi raz zwiększyłby losowość meczów w tle. Odchylenie różnicy goli po kroku 2:
  pełny 1,71-1,77, w tle 1,71-1,81 (rozdz. 7.4).
- Kapitan: pełny silnik przez E x S w kilku wzorach, mecz w tle przez `QS.CAP`; kalibrowane razem (docs/kapitan.md).
- Kondycja w meczu bez granicy (znawca proponował do -2,4): poza sumą stanu, model zmęczenia z Nov 25, 2026 zostaje;
  zmęczenie sprzed meczu ma już granicę (pula ciała i `startCond`).
- `structurePenalty` nie działa w silniku (tylko raport składu): bez podwójnej kary za pozycję.
- Etap matchup (krótkie podania zawsze najlepsze, kontry w szumie): krok 3.

### 7.2 Granice stanu zawodnika (punkty atrybutu)

Pula psychiki: forma, morale, „na gazie” w +0,7 / -0,8. Pula ciała: świeżość, ostrość, powrót po kontuzji w 0 / -1,5.
Aklimatyzacja 0 / -0,6. Suma trzech pul w +1,0 / -2,0, potem mnożnik ligi (III liga: +1,15 / -2,30). Wpis `statePool`
podaje różnicę między sumą po granicach a sumą wkładów, więc rozbicie (raport asystenta, `M.ledger`) pokazuje surowe
wkłady i osobno „Granice stanu i poziom ligi”. Poza sumą: kondycja w meczu, gra z urazem, pozycja oraz trening,
analiza rywala, autorytet trenera i głowa w transferze (osobne czynniki; autorytet ma własny mnożnik ligi z rundy 3
biernej gry, więc nie wchodzi drugi raz w mnożnik stanu).

### 7.3 Warunki meczu

Kontekst warunków (`season/conditions.js` `fixtureConditions`): `derby` (0-3), `travelKm`, `attendance` (mecz w tle),
`tier` (poziom ligi gospodarza), `pressure` [gospodarz, gość]. Pełny silnik dostaje frekwencję ze studia
(z nastrojem kibiców i pogodą) i murawę z dnia meczowego. Mecz w tle murawy nie losuje (wpływ średnio zerowy).

Wartości terenu (hfa) [SYM] w próbkach z sezonów: Ekstraklasa średnio 0,865 (przed 0,865), 1 Liga 0,90 (0,855),
2 Liga 0,94 (0,842), III liga 0,93 (0,838): niższe ligi mają mniejszą frekwencję, ale mnożnik ligi x1,10-1,15.
Ten sam region (derby miasta) ok. 0,1 mniej niż daleki wyjazd.

### 7.4 Kalibracja [SYM]

Skrypt poza repozytorium (`scratchpad/krok2/calib.mjs`): 6 sezonów (ziarna 1-6, od Jul 1, 2026 do Jun 10, 2027, mecze
w tle jak w grze) i w każdym dniu meczowym próbka pełnego silnika AI-AI na każdym meczu ligowym (prawdziwy stan kadr
z sezonu, pogoda i murawa z losowania dnia meczowego, sędzia z puli, ranga z `quickRank`) oraz mecz w tle na tym samym
meczu (bez zapisu). „Przed” = kod sprzed kroku 2, „po” = wszystkie wyłączniki włączone.

| Liga | Wariant | Silnik | Meczów | Gole/mecz | Gosp. : gość | Wygr. gosp. % | Remisy % | Wygr. gości % | Żółte/mecz | Czerwone/mecz | Faule/mecz | Odch. różnicy goli |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ekstraklasa | przed | pełny | 1836 | 2,81 | 1,57 : 1,24 | 45,5 | 24,7 | 29,8 | 3,23 | 0,158 | 27,7 | 1,76 |
| Ekstraklasa | przed | w tle | 1836 | 2,83 | 1,55 : 1,28 | 42,5 | 25,4 | 32,0 | 2,69 | 0,075 | - | 1,83 |
| Ekstraklasa | po | pełny | 1836 | 2,84 | 1,56 : 1,28 | 43,4 | 25,1 | 31,5 | 3,35 | 0,154 | 28,0 | 1,77 |
| Ekstraklasa | po | w tle | 1836 | 2,82 | 1,54 : 1,28 | 42,3 | 25,8 | 31,9 | 2,74 | 0,076 | - | 1,81 |
| 1 Liga | przed | pełny | 1836 | 2,82 | 1,53 : 1,30 | 42,6 | 25,2 | 32,2 | 3,31 | 0,137 | 27,6 | 1,70 |
| 1 Liga | przed | w tle | 1836 | 2,76 | 1,54 : 1,22 | 43,5 | 26,5 | 30,0 | 2,69 | 0,078 | - | 1,74 |
| 1 Liga | po | pełny | 1836 | 2,78 | 1,54 : 1,24 | 44,2 | 24,6 | 31,3 | 3,26 | 0,136 | 27,9 | 1,71 |
| 1 Liga | po | w tle | 1836 | 2,80 | 1,52 : 1,27 | 43,1 | 25,7 | 31,2 | 2,75 | 0,076 | - | 1,71 |
| 2 Liga | przed | pełny | 1836 | 2,78 | 1,53 : 1,26 | 44,8 | 23,9 | 31,4 | 3,24 | 0,145 | 27,6 | 1,75 |
| 2 Liga | przed | w tle | 1836 | 2,76 | 1,56 : 1,20 | 45,4 | 27,1 | 27,5 | 2,65 | 0,087 | - | 1,70 |
| 2 Liga | po | pełny | 1836 | 2,83 | 1,59 : 1,24 | 45,0 | 24,7 | 30,2 | 3,29 | 0,131 | 27,9 | 1,75 |
| 2 Liga | po | w tle | 1836 | 2,78 | 1,58 : 1,20 | 44,7 | 26,8 | 28,5 | 2,66 | 0,071 | - | 1,72 |
| III liga | przed | pełny | 7344 | 2,86 | 1,55 : 1,31 | 43,1 | 24,7 | 32,2 | 3,28 | 0,134 | 27,6 | 1,74 |
| III liga | przed | w tle | 7344 | 2,81 | 1,56 : 1,26 | 42,8 | 27,3 | 29,9 | 2,63 | 0,079 | - | 1,75 |
| III liga | po | pełny | 7344 | 2,84 | 1,56 : 1,28 | 44,2 | 24,6 | 31,2 | 3,30 | 0,141 | 27,9 | 1,72 |
| III liga | po | w tle | 7344 | 2,81 | 1,57 : 1,24 | 43,3 | 26,8 | 29,9 | 2,66 | 0,082 | - | 1,78 |

| Liga | Wariant | Sezonów (tabel) | Mistrz pkt | 2. miejsce | Ostatni pkt | Odch. pkt w tabeli | Gole/mecz (sezony) |
|---|---|---|---|---|---|---|---|
| Ekstraklasa | przed | 6 | 76,8 | 72,2 | 24,8 | 15,3 | 2,89 |
| Ekstraklasa | po | 6 | 71,0 | 65,3 | 23,2 | 12,3 | 2,83 |
| 1 Liga | przed | 6 | 67,3 | 65,7 | 21,5 | 12,3 | 2,82 |
| 1 Liga | po | 6 | 69,5 | 61,3 | 26,7 | 11,5 | 2,77 |
| 2 Liga | przed | 6 | 68,2 | 63,8 | 21,7 | 12,1 | 2,72 |
| 2 Liga | po | 6 | 66,3 | 61,0 | 22,7 | 11,8 | 2,84 |
| III liga | przed | 24 | 68,9 | 63,8 | 22,5 | 12,3 | 2,85 |
| III liga | po | 24 | 69,0 | 64,4 | 24,8 | 12,1 | 2,85 |

Wnioski: gole na mecz bez zmian (Ekstraklasa 2,84, cel 2,6-2,9); gospodarze 43-45 % w pełnym silniku i 42-45 % w tle
(cel 43-46 %); remisy 24,6-25,8 % (cel 25-28 %, pełny silnik na dolnej granicy jak przed krokiem 2); żółte kartki
+0,05 do +0,12 na mecz (derby, ranga w meczach w tle). Tabele Ekstraklasy mniej rozciągnięte (mistrz 71,0 zamiast 76,8 pkt,
odchylenie punktów 12,3 zamiast 15,3; 6 sezonów, błąd średniej mistrza ok. 2-3 pkt): pula psychiki ucina premię serii
wygranych, a mecze w tle nie mają już pewności z tabeli. Prawdziwa Ekstraklasa ma zwykle mistrza z 63-75 pkt [SZAC].

### 7.5 Puchary europejskie [SYM]

Te same 6 sezonów: mecze polskich klubów w pucharach UEFA (mecze w tle, `europe.js`).

| Wariant | Sezonów | Mecze polskich klubów w UEFA na sezon | W / R / P % | Pkt/mecz | Gole zdobyte : stracone na mecz |
|---|---|---|---|---|---|
| przed | 6 | 49,3 | 37,5 / 23,6 / 38,9 | 1,36 | 1,46 : 1,36 |
| po | 6 | 51,7 | 37,7 / 23,5 / 38,7 | 1,37 | 1,41 : 1,35 |

Polskie kluby nie są mocniejsze: punkty na mecz 1,37 wobec 1,36 (błąd ok. 0,07), bilans goli 1,41 : 1,35 wobec 1,46 : 1,36.
Mnożnik ligi Ekstraklasy x1,00, kluby zagraniczne x1; presja tabeli tylko w lidze.

### 7.6 Bierna gra (runda 3, docs/bierna-gra.md rozdz. 10) [SYM]

Ten sam skrypt co w rundzie 3 (`scratchpad/bierna/passive_ui.mjs`, kopia na kodzie kroku 2: `scratchpad/krok2/bierna/`):
32 kluby (16 z 2 Ligi, 16 z III ligi), ziarna 1-2, 2 sezony, tryby `ui` (bierny gracz klika jak interfejs) i `ai`
(ten sam klub pod AI), punkty na mecz do zwolnienia przeliczone na 34 mecze.

| Liga | Przed krokiem 2 (runda 3) | Po kroku 2 |
|---|---|---|
| 2 Liga | -17,4 pkt/sezon (błąd 2,8), zwolnieni 31 z 32 | -15,1 (błąd 2,5), zwolnieni 29 z 30 |
| III liga | -22,4 (błąd 2,7), zwolnieni 28 z 28 | -23,6 (błąd 2,1), zwolnieni 26 z 27 |

Przesunięcie w granicach błędu (2 Liga +2,3, III liga -1,2 pkt; różnica błędów ok. 3,8). Cel rundy 3 (bierny gracz
ok. 20 pkt na sezon słabiej niż AI) bez zmian. Morale drużyny biernego gracza w 2 Lidze 4,5 (przed 5,8).
Brakujące przebiegi (30 i 27 zamiast 32) to puste wyniki przerwane limitem czasu.

### 7.7 Wydajność

`npm run perf -- widzew 5 2027-06-30`, pary pomiarów na przemian (kod sprzed kroku 2 i krok 2, ten sam komputer):
sezon razem średnio 14 497 ms przed i 15 006 ms po (+3,5 %, 3 pary; wcześniejsze 4 pary przed optymalizacją wyboru
jedenastki: +2,6 %), system matchday (mecze w tle) 3008 ms przed i 3373 ms po (+12 %: warunki meczu, etap match
i nowe wpisy stanu w każdym meczu w tle). Limit +5 % na cały sezon dotrzymany. `pickXI` liczy stan zawodnika raz na
zawodnika zamiast raz na grupę pozycji (te same liczby). Pełny silnik (mecz gracza) bez pomiaru osobno [SZAC: kilka procent].

### 7.8 Serie kontrolowane i pakiet dla znawcy futbolu

Pakiet: `scratchpad/krok2/review/przeglad-krok2.md` (poza repozytorium; skrypty `review.mjs`, `calib.mjs`, `analyze.mjs`).
Najważniejsze [SYM] (równe drużyny, 1000 meczów pełnego silnika i 6000 w tle na serię, punkty na mecz drużyny A wobec bazy;
kolumna „przed”: kod kroku 1, 600 i 1200 meczów):

| Seria | Pełny silnik | W tle | Przed krokiem 2 (pełny, w tle) |
|---|---|---|---|
| Cała kadra ze świeżością 70 (dzień po meczu) | -0,37 | -0,16 | -1,19, -0,12 |
| Cała kadra z ostrością 45 | -0,25 | -0,17 | -0,09, -0,05 |
| 4 zawodników po 60 dniach przerwy (1. mecz) | -0,13 | -0,12 | -0,08, +0,01 |
| Na gazie (seria 3 świetnych meczów, forma 7,5) | +0,20 | +0,19 | +0,10, +0,17 |
| Dołek (morale 4, forma 5,8) | -0,19 | -0,23 | -0,18, -0,15 |
| Euforia (morale 19, forma 7,6) | +0,25 | +0,21 | +0,24, +0,26 |
| 2 zawodników gra z urazem | -0,18 | -0,07 | -0,15, +0,03 |
| III liga: świeżość 70 (x1,15) | -0,47 | -0,22 | -1,39, -0,27 |
| Legia z Wisłą Płock w derbach 3 (faworyt) | -0,17 | -0,17 | -0,04, -0,03 |
| Presja 1,0: odporni (WAZ, OPA 17) z nerwowymi (4), ponad samą różnicę cech | +0,27 | +0,16 | +0,07, +0,02 |
| Gospodarz: frekwencja 20 %, 10 km / 60 %, 300 km / 100 %, 600 km (wobec neutralnego) | +0,08 / +0,13 / +0,18 | +0,15 / +0,19 / +0,23 | +0,13 / +0,14 / +0,17, +0,19 / +0,20 / +0,18 |
| Krótkie podania z długimi: dobra / zła murawa | +0,24 / +0,20 | 0 / 0 | +0,26 / +0,17, +0,08 / +0,06 |

Derby: faule +12 %, żółte kartki +28 %. Zła murawa: celność podań -2,5 pp, faule +5 %. Przed krokiem 2 „na gazie”
i presja nie istniały (różnice to sama forma albo szum).

### 7.9 Ryzyka i sprawy dla przeglądu znawcy

- Wartości `STATE` i `COND` to [SZAC] z raportu znawcy, sprawdzone tylko średnimi: przegląd ma wskazać, które są
  za mocne albo za słabe (np. derby -0,18 pkt/mecz dla faworyta, presja tabeli +0,24 pkt/mecz przy skrajnych cechach).
- Zmęczenie: przed krokiem 2 drużyna ze świeżością 70 traciła w pełnym silniku 1,19 pkt/mecz (w tle 0,12); po kroku 2
  pełny silnik 0,37, w tle 0,16. Pełny silnik nadal mocniej (zmęczony słabnie wcześniej w meczu): do decyzji znawcy. Zawodnik ze świeżością 70 pokazuje w meczu kondycję 89
  (start z `startCond`), a resztę zmęczenia daje pula ciała: UI kondycji na starcie meczu pokazuje więc wyższą liczbę niż dawniej.
- Tabele Ekstraklasy węższe (rozdz. 7.4): do obserwacji na większej liczbie sezonów.
- Mecz w tle nie losuje murawy i pogody, a frekwencję szacuje bez nastroju kibiców.
- Nowe pole zawodnika `p.rust` (powrót po kontuzji) w zapisie gry; stare zapisy bez niego działają (brak = bez kary).

### 7.10 Testy

- `tests/engine2.test.mjs`: wszystkie wyłączniki false = złote skróty kroku 1; granice pul i sumy (400 losowych zawodników,
  ligi 1-5, w meczu i poza); „na gazie” (malejący zwrot, zerowanie), rdza, ostrość, gra z urazem w punktach; wartość terenu,
  derby, murawa, presja tabeli (tylko ostatnie 6 kolejek); pułapki potoku (tryb wpisu w etapie match, nowy wpis warunków
  bez zmian w `core.js`, wyłącznik w trakcie meczu, strefy z jednym kanałem, neutralne strefy, kara urazu w `M.ledger`);
  mecze w tle (typowa wartość terenu = dawne średnie goli, derby zbliżają drużyny, ranga 2 daje więcej kartek).
- `tests/modifiers.test.mjs` i `tests/fatigue.test.mjs`: liczby kroku 1 sprawdzane z wyłącznikami false, plus wariant kroku 2.
- Złote skróty kroku 2: `tests/enginePipeline.golden.json` (nowy zapis `node tools/golden-save.mjs`), kroku 1:
  `tests/enginePipeline.step1.golden.json` (bez zmian, czyta je `tests/engine2.test.mjs`).

### 7.11 Jak cofnąć krok 2

1. Całość od razu: w `src/engine/engine2.js` ustaw `ENGINE2` na `{ pipeFix: false, state: false, conditions: false,
   unify: false }`. Gra liczy wtedy bit w bit jak po kroku 1 (test w `tests/engine2.test.mjs`). Zapis gry nie wymaga zmian:
   pole `p.rust` jest wtedy ignorowane.
2. Pojedyncza grupa: jeden wyłącznik na `false` (grupy są niezależne; `conditions` bez `pipeFix` dokłada derby i murawę
   do mnożników rangi, a `unify` bez `conditions` liczy atut boiska z dawnego wpisu `crowd`).
3. Pojedyncza liczba: `STATE`, `COND`, `TIER_MUL` w `engine2.js`, `QS.PEN_SHARE`, `QS.HFA_K` w `quickSim.js`.
4. Usunięcie kodu: `git revert <hash commita kroku 2>` (commit „Mecze liczą stan zawodników z granicami oraz warunki meczu ...”),
   potem `npm run sw`. Pliki: `src/engine/engine2.js` (nowy), `src/season/conditions.js` (nowy), `src/engine/modifiers.js`,
   `src/engine/pipeline.js`, `src/engine/match/core.js`, `src/engine/match/teams.js`, `src/engine/quickSim.js`,
   `src/engine/teamStrength.js`, `src/season/season.js`, `src/match/matchday.js`, `src/training/cohesion.js`, testy
   `tests/engine2.test.mjs`, `tests/modifiers.test.mjs`, `tests/fatigue.test.mjs`, złote skróty, `docs/`, `sw.js`.
