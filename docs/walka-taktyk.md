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
| Stan zawodnika raz na zawodnika przy wyborze jedenastki | `teamStrength.js` `pickXI`, `effective` | stan zawodnika (etap player) liczony od nowa dla każdej grupy pozycji | raz na zawodnika, wspólny dla grup (te same liczby, mniej obliczeń) | brak (bez zmiany wyników) |

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

Po poprawkach QA i znawcy (rozdz. 7.12): psychika +0,6 / -0,9, mnożnik ligi tylko na ciało i aklimatyzację (dolna granica
sumy x mnożnik), gra z urazem -0,30, świeżość -0,038 za punkt, kondycja na start 95 - 0,05 x (95 - świeżość).

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
   `tests/engine2.test.mjs`, `tests/modifiers.test.mjs`, `tests/fatigue.test.mjs`, `tests/playerInstr.test.mjs`,
   `tests/training.test.mjs`, `tests/friendlyUi.test.mjs`, `tests/strzalki.test.mjs`, `tests/enginePipeline.test.mjs`,
   złote skróty (`tests/enginePipeline.golden.json`, `tests/enginePipeline.step1.golden.json`), `docs/`, `sw.js`.
   Poprawki po QA i znawcy (rozdz. 7.12) cofa się osobno (rozdz. 7.12.4).

### 7.12 Poprawki po QA i znawcy (Nov 28, 2026)

Kontrola jakości (QA) i przegląd znawcy futbolu po kroku 2; właściciel zatwierdził poprawki. Każda zmiana ma wyłącznik
albo stałą w `src/engine/engine2.js` z wartością kroku 2 w komentarzu („krok 2: ...”). Nowy wyłącznik `ENGINE2.balance`
(kartki, ogon wyników, doliczony czas, mecze w tle). Przy wszystkich wyłącznikach `false` wyniki nadal bit w bit jak
w kroku 1 (`tests/engine2.test.mjs`, `tests/enginePipeline.step1.golden.json`; stała `ENGINE2_OFF`).

#### 7.12.1 Zmiany (zmiana, plik, stała, krok 2 -> teraz, wyłącznik)

| Zmiana | Plik | Stała | Krok 2 | Teraz | Wyłącznik |
|---|---|---|---|---|---|
| Derby bez podwójnej rangi: w derbach rangi 2 wpis `rank` (faule x1,1, kartki x1,15) neutralny, faule i kartki liczy tylko wpis `derby` | `pipeline.js` wpis `rank` | `COND.derby.rankOff` | false | true | conditions |
| Derby: każdy czynnik (a + b x v) x mnożnik ligi, v = 1-3 | `pipeline.js` `derbyTerms` | `COND.derby` foul, card, gap, dayForm, act | foul [0; 0,05], card [0; 0,07], gap [0; 0,06], dayForm [0; 0,1], act brak | foul [0,06; 0,015], card [0,12; 0,03], gap [0,02; 0,04], dayForm [0; 0,02], act [0,02; 0,01] | conditions |
| Derby: mniej sytuacji (kanał `act`) także w meczu w tle | `quickSim.js` `expectedGoals` | `COND.derby.act` | brak | średnie goli x kanał act | balance |
| Gra z urazem sprzed meczu | `modifiers.js` wpis `playingInjured` | `STATE.injuredPts` | 0,55 | 0,30 | state |
| Pula psychiki (forma, morale, „na gazie”) | `modifiers.js` `statePoolTerm` | `STATE.psyche` | -0,8 / +0,7 | -0,9 / +0,6 | state |
| Mnożnik ligi tylko na ciało i aklimatyzację (dolna granica sumy x mnożnik), psychika bez mnożnika | `modifiers.js` `statePoolTerm` | `STATE.tierPools` | 'all' (cała suma x mnożnik) | 'body' | state |
| Stawka meczu x WAZ i opanowanie bez mnożnika ligi (psychika) | `pipeline.js` `stakesTerm` | `COND.stakes.tier` | true | false | conditions |
| Żółte kartki pełnego silnika (za faul, inne, za faul taktyczny) | `match/core.js` (`M.yMul`) | `BAL.yellow` | 1 | 1,28 (ok. +20 % na mecz) | balance |
| Żółte kartki w meczach w tle | `quickSim.js` `quickMatch` | `BAL.qsYellow` | 1 | 1,2 | balance |
| Bezpośrednie czerwone w meczach w tle (razem z drugimi żółtymi z `playQuick` jak pełny silnik) | `quickSim.js` `quickMatch` | `BAL.qsRed` | 1 | 1,5 | balance |
| Doliczony czas 2. połowy: wagi okien zmian i goli | `match/match.js` `addedTime` | `BAL.added` | base2 2,5, okna 0,4, gole 0,4 | 2,5, 0,25, 0,3 | balance |
| Przyrost akcji w końcówce (od 55. minuty) | `match/core.js` `phaseAction` | `BAL.lateRamp` | 0,004 (`K.lateRamp`) | 0,002 | balance |
| Stan meczu od 65. minuty i nasycenie golami | `match/core.js` `gameState`, `satAct` (`M.gs`) | `BAL.gs` | leadAct 0,85, leadD 0,3, trailAct 1,12, trailD -0,4, smax 0,40, trail 0,10 | 0,8, 0,3, 1,25, -0,2, 0,55, 0,2 | balance |
| Średnia goli meczów w tle (sprawdzone, bez zmiany: 0,985 poprawiało polskie kluby w pucharach) | `quickSim.js` `expectedGoals` | `BAL.qsGoals` | 1 | 1 | balance |
| Świeżość w puli ciała (oba silniki) | `modifiers.js` wpis `fresh` | `STATE.fresh.k` | 0,028 | 0,038 | state |
| Kondycja na start meczu (pełny silnik) | `match/teams.js` `startCond` | `STATE.condStart` | 0,25 | 0,05 | state |
| Rdza po kontuzji zamiast drugiej kary ostrości (ostrość 30 po przerwie ponad 28 dni tylko bez state) | `season.js` `injuryReturn` | `STATE.sharpReset` | true (obie kary) | false | state |
| Rdza wygasa z czasem: co 14 dni bez meczu jeden mecz mniej (sprawdzane w poniedziałki, czyli po 14-20 dniach; przerwa letnia, program powrotu); bez state `p.rust` nie powstaje; `rustOf` przy n = 0 zwraca 0 | `season.js` `rustDecay`, `modifiers.js` `rustOf` | `STATE.rust.decayDays` | 0 (tylko z meczami) | 14 | state |
| Spójność na start meczu w widoku Trening (85, której używa silnik) | `ui/trainingView.js` | `STATE.cohesionStart` | wzór sprzed kroku 2 | 85 przy state | state |
| Frekwencja bez NaN w dawnym wpisie `crowd` | `pipeline.js` | brak | `c.attendance` (brak: NaN) | `c.attendance ?? 0,6` | bez (krok 1 bit w bit) |
| Mnożnik ligi poziomu 6 | `engine2.js` | `TIER_MUL[6]` | brak (x1) | 1,2 | state, conditions |
| `slotFit` z kontekstem pełnego silnika (jak `slotMx`) | `match/teams.js` | brak | slot bez `inMatch` | `{ pos, side, inMatch: true }` | pipeFix |
| Wydajność: wpisy rejestru w jednym kształcie obiektu w pętlach `evaluate`, `channel`, `channelTerms` (`flatList`), wpisy stanu filtrowane wyłącznikiem przy kompilacji listy (`flag`), pamięć odległości na parę klubów, pamięć warunków meczu w tle wg klucza (sędzia, ranga, derby, frekwencja, podróż do 400 km, poziom, neutralny teren), granice stanu z rozbiciem tylko przy state, bez szukania poziomu ligi przy zerowych pulach, bez pewności z tabeli przy unify | `modifiers.js` `flatList`, `compiledFor`, `channel`, `statePoolTerm`, `conditions.js` `travelKm`, `quickSim.js` `quickFactors`, `season.js` `playQuick` | brak | liczone przy każdym meczu | w pamięci (te same liczby) | bez zmiany wyników |

Bez zmian (pomiar): atut boiska przy małej frekwencji (QA: w tle +0,15, pełny +0,08 na 600 meczach). Na 5000 meczach
pełnego silnika i 50 000 w tle różnica mieści się w 0,03 (rozdz. 7.12.3); pomiar QA był szumem.

#### 7.12.2 Kalibracja lig [SYM]

Ten sam skrypt i te same ziarna co w rozdz. 7.4 (6 sezonów, próbki pełnego silnika na każdym meczu ligowym). Czerwone
w tle z gwiazdką: razem z drugimi żółtymi rozdzielanymi w `playQuick` (w rozdz. 7.4 w tle tylko bezpośrednie, stąd
0,076; z drugimi żółtymi krok 2 dawał ok. 0,10).

| Liga | Wariant | Silnik | Meczów | Gole/mecz | Gosp. : gość | Wygr. gosp. % | Remisy % | Wygr. gości % | Żółte/mecz | Czerwone/mecz | Faule/mecz | Odch. różnicy goli |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ekstraklasa | krok 2 | pełny | 1836 | 2,84 | 1,56 : 1,28 | 43,4 | 25,1 | 31,5 | 3,35 | 0,154 | 28,0 | 1,77 |
| Ekstraklasa | krok 2 | w tle | 1836 | 2,82 | 1,54 : 1,28 | 42,3 | 25,8 | 31,9 | 2,74 | 0,076 | - | 1,81 |
| Ekstraklasa | po poprawkach | pełny | 1836 | 2,68 | 1,49 : 1,19 | 43,4 | 27,1 | 29,6 | 4,02 | 0,190 | 27,3 | 1,61 |
| Ekstraklasa | po poprawkach | w tle | 1836 | 2,80 | 1,53 : 1,27 | 42,6 | 25,7 | 31,6 | 3,29 | 0,168* | - | 1,76 |
| 1 Liga | krok 2 | pełny | 1836 | 2,78 | 1,54 : 1,24 | 44,2 | 24,6 | 31,3 | 3,26 | 0,136 | 27,9 | 1,71 |
| 1 Liga | krok 2 | w tle | 1836 | 2,80 | 1,52 : 1,27 | 43,1 | 25,7 | 31,2 | 2,75 | 0,076 | - | 1,71 |
| 1 Liga | po poprawkach | pełny | 1836 | 2,76 | 1,50 : 1,26 | 41,5 | 27,8 | 30,7 | 4,16 | 0,153 | 27,4 | 1,59 |
| 1 Liga | po poprawkach | w tle | 1836 | 2,78 | 1,53 : 1,25 | 43,6 | 25,7 | 30,7 | 3,26 | 0,175* | - | 1,78 |
| 2 Liga | krok 2 | pełny | 1836 | 2,83 | 1,59 : 1,24 | 45,0 | 24,7 | 30,2 | 3,29 | 0,131 | 27,9 | 1,75 |
| 2 Liga | krok 2 | w tle | 1836 | 2,78 | 1,58 : 1,20 | 44,7 | 26,8 | 28,5 | 2,66 | 0,071 | - | 1,72 |
| 2 Liga | po poprawkach | pełny | 1836 | 2,73 | 1,49 : 1,24 | 42,3 | 26,3 | 31,4 | 4,07 | 0,165 | 27,3 | 1,60 |
| 2 Liga | po poprawkach | w tle | 1836 | 2,80 | 1,56 : 1,24 | 43,7 | 27,8 | 28,4 | 3,22 | 0,180* | - | 1,71 |
| III liga | krok 2 | pełny | 7344 | 2,84 | 1,56 : 1,28 | 44,2 | 24,6 | 31,2 | 3,30 | 0,141 | 27,9 | 1,72 |
| III liga | krok 2 | w tle | 7344 | 2,81 | 1,57 : 1,24 | 43,3 | 26,8 | 29,9 | 2,66 | 0,082 | - | 1,78 |
| III liga | po poprawkach | pełny | 7344 | 2,79 | 1,52 : 1,27 | 42,8 | 26,5 | 30,6 | 4,07 | 0,155 | 27,4 | 1,61 |
| III liga | po poprawkach | w tle | 7344 | 2,81 | 1,56 : 1,25 | 43,3 | 26,5 | 30,2 | 3,19 | 0,165* | - | 1,76 |

*: w tle z drugimi żółtymi (season.js playQuick); bez gwiazdki w tle tylko bezpośrednie czerwone.

| Liga | Wariant | Sezonów (tabel) | Mistrz pkt | 2. miejsce | Ostatni pkt | Odch. pkt w tabeli | Gole/mecz (sezony) |
|---|---|---|---|---|---|---|---|
| Ekstraklasa | krok 2 | 6 | 71,0 | 65,3 | 23,2 | 12,3 | 2,83 |
| Ekstraklasa | po poprawkach | 6 | 71,8 | 69,0 | 22,8 | 13,1 | 2,89 |
| 1 Liga | krok 2 | 6 | 69,5 | 61,3 | 26,7 | 11,5 | 2,77 |
| 1 Liga | po poprawkach | 6 | 70,3 | 63,5 | 26,3 | 11,3 | 2,77 |
| 2 Liga | krok 2 | 6 | 66,3 | 61,0 | 22,7 | 11,8 | 2,84 |
| 2 Liga | po poprawkach | 6 | 66,0 | 62,3 | 25,5 | 11,0 | 2,83 |
| III liga | krok 2 | 24 | 69,0 | 64,4 | 24,8 | 12,1 | 2,85 |
| III liga | po poprawkach | 24 | 65,8 | 61,9 | 23,9 | 11,1 | 2,81 |

| Wariant | Sezonów | Mecze polskich klubów w UEFA na sezon | W / R / P % | Pkt/mecz | Gole zdobyte : stracone na mecz |
|---|---|---|---|---|---|
| krok 2 | 6 | 51,7 | 37,7 / 23,5 / 38,7 | 1,37 | 1,41 : 1,35 |
| po poprawkach | 6 | 52,0 | 38,8 / 19,2 / 42,0 | 1,36 | 1,41 : 1,46 |

Ogon wyników (gole w meczu, % meczów):

Pełny silnik:

| Liga | Wariant | 0 | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---|---|---|---|---|---|---|---|
| Ekstraklasa | krok 2 | 6,6 | 16,7 | 22,6 | 21,4 | 16,6 | 9,1 | 7,1 |
| Ekstraklasa | po | 7,3 | 17,3 | 26,0 | 22,1 | 13,8 | 7,3 | 6,2 |
| III liga | krok 2 | 5,6 | 16,1 | 24,6 | 22,4 | 15,7 | 8,9 | 6,8 |
| III liga | po | 6,2 | 16,6 | 25,0 | 21,1 | 16,2 | 8,4 | 6,5 |

W tle:

| Liga | Wariant | 0 | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---|---|---|---|---|---|---|---|
| Ekstraklasa | krok 2 | 7,2 | 14,9 | 23,0 | 22,7 | 17,0 | 8,9 | 6,3 |
| Ekstraklasa | po | 7,8 | 15,0 | 23,5 | 22,0 | 15,7 | 9,5 | 6,5 |
| III liga | krok 2 | 7,4 | 14,3 | 25,6 | 22,0 | 15,3 | 8,6 | 6,9 |
| III liga | po | 7,6 | 14,8 | 24,6 | 22,1 | 15,1 | 9,0 | 6,9 |

Wnioski: pełny silnik ma mniej goli (Ekstraklasa 2,84 -> 2,68; drugi przebieg z tym samym silnikiem 2,75, różnica to
inne sezony meczów w tle; niższe ligi 2,73-2,79), mecze w tle bez zmiany średniej (2,78-2,81, `BAL.qsGoals` 1).
Remisy w pełnym silniku 26,3-27,8 % (krok 2: 24,6-25,1), w tle 25,7-27,8 %. Żółte w pełnym silniku 4,0-4,2 na mecz
(+20-28 %), w tle 3,2-3,3 (+20 %); czerwone w pełnym 0,15-0,19, w tle 0,17-0,18 (z drugimi żółtymi). Gospodarze w pełnym
silniku 41,5-43,4 % (krok 2: 43,4-45,0): przegrywający częściej wyrównuje.
Ogon: 6+ goli w Ekstraklasie (pełny silnik) 7,1 -> 6,2 % (drugi przebieg 5,6 %), 5 goli 9,1 -> 7,3 % (8,8 %); III liga
6,8 -> 6,5 % (6,2 %). Na 5000 meczów Ekstraklasy z tymi samymi parami (skrypt `scratchpad/k2b/tail.mjs`): średnia 2,71 -> 2,63,
6+ goli 6,0 -> 5,0 %, 5 goli 7,7 -> 7,2 %, remisy 24,3 -> 26,0 %. Mecze w tle: 6,3-6,9 % (sam model Poissona, bez zmian).
Cel ok. 4 % nie jest osiągalny przy średniej 2,75 bez sztucznego sufitu: rozkład Poissona z tą średnią daje 6,1 %
(rozdz. 7.12.5). Przyczyny sprawdzone [SYM] (5000 meczów Ekstraklasy, pełny silnik): mecze z czerwoną kartką nie są
częstsze wśród meczów 6+ (11-15 % wobec 15 % wszystkich); doliczony czas 2. połowy średnio 5,8 min (do 10) z dodatnim
sprzężeniem (każdy gol dokładał 0,4 min); przyrost akcji w końcówce; słabe rozluźnienie przy prowadzeniu 2+ (prowadzący +3
strzelał 1,51 gola na 90 min, więcej niż przy remisie). Po poprawkach: doliczony czas 5,4 min, prowadzący +2 i +3 strzela
1,15-1,24 gola na 90 min, przegrywający -1 1,27 (wyrównania), wyniki 5:1, 6:0, 7:x rzadsze o ok. 40 %; zostają mecze
otwarte obu drużyn (4:2, 3:3, 4:3).
Tabele: mistrz Ekstraklasy 71,8 pkt (krok 2 71,0). Puchary polskich klubów (mecze w tle): 1,36 pkt/mecz wobec 1,37
w kroku 2 (bez poprawy). Średnia goli w tle x0,985 (`BAL.qsGoals`) dawała polskim klubom ćwierćfinał w 37,5 % sezonów
zamiast 25 % (`tests/euroStrength.test.mjs`, 40 sezonów: mniej goli to więcej niespodzianek w dwumeczach), więc odrzucona.

#### 7.12.3 Serie kontrolowane [SYM]

Punkty na mecz drużyny A wobec bazy (ta sama seria bez zmiany), pełny silnik / w tle. Skrypty `scratchpad/k2b/series.mjs`,
`derbycal.mjs`, `hfacal.mjs` (poza repozytorium); „krok 2” to kod commita kroku 2 na tych samych ziarnach. Błąd różnicy:
serie stanu 1500 meczów pełnego silnika ok. +-0,05 (w tle 9000 meczów +-0,02), derby 2500 meczów +-0,04, atut boiska
5000 meczów +-0,025.

| Seria | Krok 2 (pełny / w tle) | Po poprawkach (pełny / w tle) | Cel |
|---|---|---|---|
| Derby 3 z rangą 2 (jak w grze), faworyt Legia z Wisłą Płock | -0,08 / -0,12 | -0,13 / -0,10 | ok. -0,10 do -0,12 |
| Derby 3 z rangą 2, równe drużyny: faule, żółte wobec meczu rangi 0 | +21 %, +52 % | +6 %, +20 % | +6 %, +20 % |
| Derby 2 z rangą 2, równe drużyny: faule, żółte | - | +6 %, +20 % | +6 %, +20 % |
| Derby 3 z rangą 2, równe drużyny: remisy wobec meczu rangi 0 (pp) | -1,3 / +0,2 | +1,1 / +1,4 | nie mniej, najlepiej +2 |
| 2 zawodników gra z urazem | -0,17 / -0,10 | -0,15 / -0,09 | mniej |
| Dołek (morale 4, forma 5,8) | -0,18 / -0,24 | -0,20 / -0,23 | boli bardziej niż euforia pomaga |
| Euforia (morale 19, forma 7,6) | +0,21 / +0,22 | +0,21 / +0,22 | |
| Na gazie (3 świetne mecze) | +0,18 / +0,15 | +0,17 / +0,16 | |
| Zmęczenie: cała kadra ze świeżością 70 (ten sam skład w obu silnikach) | -0,37 / -0,20 | -0,28 / -0,25 | pełny -0,25 do -0,30, w tle ok. -0,25 |
| III liga: zmęczenie, świeżość 70 | -0,45 / -0,21 | -0,26 / -0,26 | |
| III liga: dołek | -0,38 / -0,23 | -0,22 / -0,20 | psychika bez mnożnika ligi |
| 4 zawodników po 60 dniach przerwy (ostrość 40, 1. mecz) | -0,13 / -0,13 | -0,13 / -0,12 | |
| Zła murawa, silny z słabym (wobec dobrej murawy) | +0,05 / 0,00 | -0,02 / +0,01 | |
| Atut boiska: frekwencja 20 %, podróż 10 km (wobec neutralnego) | +0,13 / +0,16 | +0,14 / +0,16 | różnica silników do 0,03 |
| Atut boiska: frekwencja 60 %, podróż 300 km | +0,19 / +0,21 | +0,19 / +0,20 | |
| Atut boiska: frekwencja 100 %, podróż 600 km | +0,24 / +0,24 | +0,24 / +0,23 | |

Dołek i euforia w Ekstraklasie prawie bez zmian: w tych seriach pula psychiki mieści się w nowych granicach (-0,86, +0,6);
granice działają przy skrajnych wartościach (morale 1-2 z formą poniżej 5, seria „na gazie” z euforią). W derbach
pełny silnik daje mniej żółtych niż wzór (kapitan uspokaja przy stawce, mniej akcji), mecz w tle więcej (derby 2-3:
+27-33 %).

#### 7.12.3a Wydajność

`npm run perf -- widzew 5 2027-06-30`, 4 pary na przemian z kodem sprzed kroku 2 (12a5134), ten sam komputer: sezon razem
średnio 14 720 ms przed i 14 987 ms po (+1,8 %; QA dla kroku 2: +7,6 %), system matchday 3001 ms przed i 3206 ms po
(+6,8 %; krok 2: +16 %). Główne zyski: pętle rejestru na wpisach jednego kształtu (`evaluate` 0,93 -> 0,60 us na zawodnika,
przed krokiem 2 0,43), pamięć warunków meczu w tle i odległości, rdza sprawdzana w poniedziałki. Test czasu sezonu z
pucharami (`tests/uefa.test.mjs`, 15 s na sezon) jest na granicy także dla kodu sprzed kroku 2: pod obciążeniem `npm test`
pada (lech 15,6-15,9 s; kod sprzed kroku 2 w tym samym układzie 13,6-15,5 s). Mecz w tle nadal ok. 10-20 % wolniejszy niż
przed krokiem 2 (4 nowe wpisy stanu na zawodnika).

#### 7.12.3b Bierna gra [SYM]

Ten sam skrypt co w rozdz. 7.6 (32 kluby 2 Ligi i III ligi, ziarna 1-2, 2 sezony, bierny gracz wobec AI, punkty
przeliczone na 34 mecze):

| Liga | Runda 3 | Krok 2 | Po poprawkach |
|---|---|---|---|
| 2 Liga | -17,4 (błąd 2,8) | -15,1 (2,5) | -13,0 (3,0), zwolnieni 30 z 32 |
| III liga | -22,4 (2,7) | -23,6 (2,1) | -17,0 (2,5), zwolnieni 26 z 28 |

Bierny gracz traci mniej, w III lidze o 6,6 pkt (ok. 2 błędy różnicy): psychika bez mnożnika ligi (dołek drużyny biernego
gracza kosztuje w III lidze x1,00 zamiast x1,15) i węższa pula psychiki od góry. Cel rundy 3 (ok. 20 pkt słabiej niż AI) jest
teraz na granicy: do decyzji właściciela (np. `STATE.tierPools` 'all' przywraca mnożnik także psychice albo
wzmocnienie biernej gry w `PASSIVE`). Pierwszy przebieg z `BAL.qsGoals` 0,985: -16,1 i -17,6.

#### 7.12.4 Jak cofnąć poprawki po QA

1. Całość: w `src/engine/engine2.js` `ENGINE2.balance = false` i wartości „krok 2” z komentarzy przy `STATE` (psyche,
   tierPools, fresh.k, condStart, rust.decayDays, sharpReset, injuredPts), `COND.derby`, `COND.stakes.tier`, `TIER_MUL[6]`
   (usunąć). Gra liczy wtedy jak w kroku 2 (poza poprawkami technicznymi bez wpływu na wynik).
2. Pojedyncza poprawka: jedna stała z tabeli 7.12.1 na wartość z kolumny „krok 2”; `ENGINE2.balance = false` cofa
   wszystkie stałe `BAL` naraz.
3. Kod: `git revert` commita „... poprawki po kontroli jakości ...” (v1.25.1 Beta), potem `npm run sw`. Pliki:
   `src/engine/engine2.js`, `src/engine/pipeline.js`, `src/engine/modifiers.js`, `src/engine/quickSim.js`,
   `src/engine/match/core.js`, `src/engine/match/match.js`, `src/engine/match/teams.js`, `src/season/season.js`,
   `src/season/conditions.js`, `src/ui/trainingView.js`, testy `tests/engine2.test.mjs`, `tests/matchEngine.test.mjs`,
   `tests/modifiers.test.mjs`, `tests/playerInstr.test.mjs`, `tests/strzalki.test.mjs` (komentarz), złote skróty kroku 2
   `tests/enginePipeline.golden.json`, `docs/`, `sw.js`.

#### 7.12.5 Ryzyka i sprawy otwarte

- Ogon wyników: 5,6-6,2 % meczów 6+ w Ekstraklasie (cel ok. 4 %). Dalsze obniżenie bez sztucznego sufitu wymaga decyzji
  właściciela: niższa średnia goli (ok. 2,5) albo nowy mechanizm (np. drużyny uspokajają grę po 4+ golach w meczu)
  [SZAC]. Mecze w tle mają ogon z samego modelu Poissona (6,3-6,9 %), bez nasycenia golami.
- Żółte w tle 3,2-3,3 na mecz (+20 % jak w zatwierdzeniu), w pełnym silniku 4,0-4,2: do 4 w tle potrzebne `BAL.qsYellow`
  ok. 1,5 (decyzja właściciela). W derbach mecz w tle daje więcej żółtych (+27-33 %) niż pełny silnik (+15-19 %),
  bo nie ma w nim spokoju kapitana i mniejszej liczby akcji.
- Gospodarze w pełnym silniku 41,5-43,4 % (krok 2: 43,4-45,0): przegrywający częściej wyrównuje. Cel 43-46 % na dolnej granicy albo tuż pod nią.
- Remisy w pełnym silniku 26,3-27,8 % (cel 26-27 %; drugi przebieg w 1 Lidze 28,3 %).
- Odchylenie różnicy goli w pełnym silniku 1,59-1,61 (krok 2 1,71-1,77), w tle 1,71-1,78: mniej wysokich zwycięstw w meczu gracza niż w tle.
- Test strzałek `OP:fo` i `OP:o` (`tests/strzalki.test.mjs`) nadal zwolniony; wraca do sprawdzenia w kroku 3.
- Bierna gra (rozdz. 7.12.3b): bierny gracz traci w III lidze 17 zamiast ok. 22-24 pkt na sezon.
