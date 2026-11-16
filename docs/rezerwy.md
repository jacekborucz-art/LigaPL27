# Rezerwy: delegowanie i powołania (Nov 17, 2026)

Kod: `src/career/reserves.js` (logika, system dnia `reserves`), wpięcie w `src/season/season.js` (`squadFor`, `applyResult`),
kartki per klasa w `src/season/leagueComps.js`. Testy: `tests/reserves.test.mjs`. Źródła i decyzje: weryfikacja PZPN
(uchwała IX/140 par. 4, Regulamin 1-3 Ligi art. 13, Regulamin Dyscyplinarny art. 20, Regulamin PP pkt 3), decyzje
właściciela z Nov 16, 2026 i Nov 17, 2026.

## API dla UI (czyste funkcje, `import ... from './career/reserves.js'`)

Wszystkie funkcje biorą stan gry `game`. Kody powodów (`reasons[]`, `warnings[]`) zamienia na tekst `reasonsText(codes)`.
Zawodnik bez klubu albo bez kontraktu: funkcje zwracają `{ ok: false, reasons: ['noPlayer' | 'noReserves' | 'notInSquad'] }`.

| Funkcja | Zwraca | Uwagi |
|---|---|---|
| `reservesOf(game, clubId)` | `{ ok, id, name, tier, comp, reason }` | `ok: false` i `reason` po polsku, gdy klub nie ma grywalnych rezerw (brak w danych, rezerwy w IV lidze lub niżej, klub sam jest rezerwami). Wtedy UI chowa funkcje rezerw i pokazuje `reason`. |
| `canDelegate(game, pid, fixtureId)` | `{ ok, reasons[], warnings[] }` | zawodnik pierwszej drużyny na mecz rezerw. Ostrzeżenia: `missesFirstTeam`, `risk48`. |
| `requestDelegation(game, { pid, fixtureId })` | `{ status: 'accepted'\|'refused', reason, reasons[], warnings[], hard, chance?, id? }` | odpowiedź od razu (decyzja z Nov 17). `hard: true` = przepisy, minima, limity, termin (bez eskalacji). `hard: false` = odmowa trenera rezerw (można eskalować). Status `'pending'` nie występuje (zarezerwowany). |
| `canCallUp(game, pid, fixtureId)` | `{ ok, reasons[], warnings[], emergency }` | zawodnik rezerw (w awarii też junior akademii 17+) na mecz pierwszej drużyny. Ostrzeżenia: `missesReserves`, `emergency`, `gkException`. |
| `requestCallUp(game, { pid, fixtureId })` | jak `requestDelegation`, plus `emergency`, `refill` (id bramkarza akademii dla rezerw) | w awarii zawsze zgoda. |
| `forceRequest(game, { pid, fixtureId })` | jak wyżej, plus `forced`, `chance`, `escalation` | eskalacja do dyrektora sportowego po miękkiej odmowie (patrz niżej). |
| `escalationChance(game, clubId)` | 0,10-0,90 | do pokazania szansy przed eskalacją. |
| `cancelDelegation(game, id \| { pid, fixtureId })` | `{ ok, reason }` | do rozpoczęcia meczu. |
| `delegationsFor(game, fixtureId)` | `[{ id, pid, name, from, to, kind: 'down'\|'up'\|'acad', by: 'user'\|'ai'\|'auto', forced?, emergency?, acad?, gk? }]` | przydziały na mecz. |
| `playerTeamThisWeekend(game, pid, date?)` | `{ team, source: 'played'\|'planned'\|'own'\|null, weekend }` | weekend piątek-poniedziałek; od wtorku do czwartku najbliższy weekend; w poniedziałek bieżący. |
| `emergencyFor(game, clubId, fixtureId?)` | `{ emergency, gk, squad, fixture, available: { total, GK, DEF, MID, ATT } }` | awaria wykrywana przez system. |
| `emergencyFill(game, clubId)` | lista wyników próśb | przycisk „Uzupełnij z rezerw” w awarii (to samo robią kluby AI). |
| `seniorStatus(game, pid, date?)` | `{ senior, apps, limit, blocked, text }` | plakietka „23+: 3/5 meczów” (tylko ostrzeżenie; blokada dotyczy gry w rezerwach). |
| `canPromoteReserve(game, pid)`, `promoteReserve(game, pid)` | `{ ok, reasons[] }`, `{ ok, text, reasons[] }` | przeniesienie na stałe z rezerw do pierwszej drużyny. |
| `coachMood(game, reserveId)` | 0-100 | nastrój trenera rezerw. |
| `reasonsText(reasons)` | tekst po polsku | dla odmów, ostrzeżeń i blokad. |

Kadra meczowa: `squadFor(game, clubId, comp, f?)` dokłada przydzielonych (`guest: true`, 23+ ponad limit w jedenastce rezerw
`benchOnly: true`), a własnych niedostępnych z zasad klubu oznacza `teamBlock: kod` (powód: `reasonsText([p.teamBlock])`).
Statystyki z drugiej drużyny: `p.season.oth` (mecze, minuty, gole, kartki) i grupa historii `D` („Druga drużyna klubu”).
Poczta: odpowiedzi trenera rezerw i dyrektora sportowego (kategoria `staff`, priorytet info), wiadomość „Awaria przed
meczem” (ważna, raz na mecz).

## Model (decyzja 1)

Delegowanie na mecz: zawodnik pierwszej drużyny zostaje w kadrze, kontrakcie, limicie kadry, płacach i treningu swojego
klubu; dostaje przydział na konkretny mecz rezerw. Zawodnik rezerw powołany na mecz pierwszej drużyny zostaje zawodnikiem
rezerw. Na stałe tylko w górę: `promoteReserve` (nowy kontrakt pierwszej drużyny na 3 lata jak awans z akademii, bez
`lastMove`, więc wychowanek do 21 lat dalej nie liczy się do limitu), najwyżej 3 na sezon [SZAC], rezerwy muszą zachować
14 własnych dostępnych. Skutki:
- klub rezerw (AI) nie może sprzedać, wystawić ani zwolnić delegowanego, bo ten nie jest w jego kadrze;
- finanse zostają u właściciela kontraktu (brak zmian w budżetach płac i „Dopłacie do rezerw”);
- rozwiązanie rezerw (`dissolveDropped`) nie kasuje delegowanych, przydziały same wygasają;
- brak „taśmy” darmowych zawodników: kadra rezerw się nie zmienia, więc AI nie dokupuje za powołanych.

## Zasady

| Zasada | Wartość | Źródło |
|---|---|---|
| Jedna drużyna klubu na weekend | piątek 00:00 - poniedziałek 23:59, kadra meczowa (grający, przydzieleni, ławka gracza) | decyzja 2 |
| 48 h | po grze ponad 45 minut mecz drugiej drużyny najwcześniej 48 h po końcu meczu (start + 115 min); bramkarz bez limitu | PZPN par. 4 ust. 1 |
| 22 lata i młodsi | bez limitu (wiek = rok końca sezonu minus rok urodzenia) | PZPN par. 4 ust. 2 a |
| 23+ | po 5 meczach pierwszej drużyny (Jul 1 - Dec 31) nie gra w rezerwach do końca roku, od Jan 1 po 3 do końca sezonu; mecz = każdy występ, liga i puchary | PZPN par. 4 ust. 2 b-c |
| Po końcu ligi pierwszej drużyny | w rezerwach tylko 23+ z ponad połową meczów rezerw (dotyczy zawodników z meczami pierwszej drużyny w sezonie) | PZPN par. 4 ust. 2 d |
| Limity kadry meczowej | najwyżej 5 z pierwszej drużyny w meczu rezerw, w tym najwyżej 3 w wieku 23+ w jedenastce; najwyżej 3 z rezerw w pierwszej drużynie | decyzja 3 |
| Minima | pierwsza drużyna po delegowaniu 18 dostępnych (2 BR, 5 obr., 5 pom., 2 nap.); rezerwy po powołaniu 14 własnych (2 BR) | [SZAC] |
| Termin | każdego dnia, decyzja najpóźniej 24 h przed meczem drużyny docelowej (później tylko awaria) | [SZAC] |
| Czerwona kartka | pauza tylko w lidze, w której padła; zawodnik gra w drugiej drużynie | decyzja 4, PZPN |
| Puchar Polski | kto zagrał w PP w jednej drużynie, nie gra w PP drugiej; po odpadnięciu jednej drużyny najwyżej 3 jej zawodników w drugiej | Regulamin PP pkt 3 (rezerwy w grze nie grają w PP, reguła czeka) |
| III liga i niżej (par. 4 ust. 3) | nie dotyczy: pierwsza drużyna z rezerwami w grze gra zawsze w EK, 1 Lidze albo 2 Lidze | - |

## Zgoda trenera rezerw (odpowiedź od razu)

- Twarda odmowa: przepisy, limity, minima, termin. Eskalacja nie działa.
- Szansa odmowy (łączona `1 - (1 - a)(1 - b)`): powołanie bramkarza albo jednego z 3 najlepszych rezerw przed ważnym meczem
  rezerw w ciągu 3 dni (derby albo ostatnie 10 kolejek w strefie spadkowej lub do 3 pkt nad nią) 60 %; prośba później niż
  48 h przed meczem rezerw 30 %; przez 14 dni po zatwierdzonej eskalacji +20 pp; nastrój trenera rezerw poniżej 50:
  +0,5 pp za punkt [SZAC]. Najwyżej 95 %.
- Losowanie z ziarna gry, zawodnika i meczu: ponowna prośba daje tę samą odpowiedź.

## Awaria (decyzja z Nov 17, 2026)

- Wykrywa system: w ciągu 48 h przed meczem pierwszej drużyny mniej niż 2 zdrowych bramkarzy albo mniej niż 18 dostępnych
  (z przydzielonymi już na ten mecz).
- Powołanie natychmiastowe, trener rezerw nie odmawia (bez terminu 24 h i bez minimum 14 rezerw); nastrój trenera rezerw -3.
- Kolejność: bramkarz rezerw (najwyżej 1), bez niego bramkarz akademii; z pola zawodnicy rezerw (do 5), potem juniorzy
  akademii 17+ (do 2, w tej samej grupie pozycji dopiero, gdy w rezerwach nikogo nie ma).
- Bramkarz w awarii: wyjątek od zasady weekendu (bramkarz rezerw po 90 minutach w sobotę gra w niedzielę w pierwszej
  drużynie). Zawodnicy z pola bez wyjątku. Kierunek w dół nigdy nie jest awarią.
- Rezerwy, którym zostaje mniej niż 2 dostępnych bramkarzy po zabraniu bramkarza, dostają bramkarza akademii na swój mecz
  w tym weekendzie (albo do 3 dni).
- Gracz dostaje wiadomość „Awaria przed meczem” i decyduje sam (`emergencyFill` albo `requestCallUp`); kluby AI uzupełniają same.

## Eskalacja do dyrektora sportowego (wymuszenie)

- Tylko po miękkiej odmowie trenera rezerw, najwyżej raz na 30 dni na klub (liczy się każda próba).
- Szansa: 35 + 0,4 x autorytet trenera (0-100) + 0,2 x zaufanie zarządu (0-100), od 10 do 90 %. Kluby AI: 50 i 50 [SZAC].
- Koszt gracza: zaufanie zarządu -2 przy zatwierdzeniu, -4 przy odrzuceniu. Przy zatwierdzeniu: nastrój trenera rezerw -5
  i +20 pp szansy odmowy kolejnych próśb przez 14 dni. Nastrój wraca o 1 co poniedziałek do 50.

## Kartki per klasa (naprawa)

- Rejestr żółtych i pauz: `ekstraklasa`, `liga1`, `liga2`, `liga3` (wszystkie grupy III ligi), `cup` (Puchar Polski),
  `uefa`. Pauzę odlicza tylko mecz drużyny klubu w tej klasie (także mecz rezerw dla zawodnika pierwszej drużyny z pauzą
  w klasie rezerw i odwrotnie).
- Baraże w klasie klubu: pauza ligowa obowiązuje i się odbywa, kartki z baraży liczą się do rejestru klasy (wcześniej
  baraże były osobnym kluczem bez kartek).
- Stare zapisy: liczniki `league` przechodzą do klasy obecnego klubu zawodnika (`ensureReserves`, raz).
- Koniec sezonu: pauzy z klasy drugiej drużyny rodziny zostają, pozostałe przechodzą do klasy drużyny zawodnika w nowym sezonie.

## Kluby AI (te same zasady)

- Poniedziałek: do 3 zawodników spoza 18 najlepszych z ostrością poniżej 60 na mecz rezerw w tym tygodniu
  (`requestDelegation`, te same limity, minima i zgoda).
- Codziennie: awaria na mecz w ciągu 48 h, `emergencyFill` (kolejność potrzeb z `planDeficitFill`, akcja `promoteReserve`).
- Klub gracza: AI nie decyduje za gracza.

## Otwarte sprawy

- UI: ekran rezerw, przyciski w menu zawodnika, plakietka 23+, powód `teamBlock` w widokach składu (tekst jest w taktyce).
- `RESERVES.maxOver22OnPitch` i `relegateWithParent` w `src/config/competitions.js` nadal nieużywane (limit 23+ w jedenastce
  jest w `RSV.maxSeniorXI`).
- Rezerwy nie grają w Pucharze Polski (uproszczenie gry), więc reguły PP działają dopiero po ich dopuszczeniu.
- Minuty w drugiej drużynie nie liczą się do udziału minut (`p.season.min`), czyli nie zmniejszają niezadowolenia z braku gry.
