# Instrukcje indywidualne zawodników

Projekt zatwierdzony przez właściciela Nov 18, 2026 (burza mózgów: trener i taktyk, znawca futbolu, analityk, grafik, programista silnika; ocena pomysłu losowości: taktyk, analityk, trener, programista). Wartości [SZAC] do kalibracji symulacją.

## 1. Zasada

- Każdy zawodnik domyślnie gra „Jak drużyna”. Instrukcja indywidualna nadpisuje instrukcję drużyny tylko dla niego.
- Siła instrukcji jednego zawodnika to ok. 1/10 instrukcji drużynowej: 10 zawodników z tą samą instrukcją daje dokładnie efekt instrukcji drużynowej (bez podwójnego liczenia: parametry drużyny `tacticParams` bez zmian, odstępstwo zawodnika dodaje `w_i * (efekt zawodnika - efekt drużyny)`).
- Każda opcja ma zysk i koszt (bez przewagi za darmo, bez sztucznych sufitów). Skutek zależy od atrybutów.
- Te same zasady dla gracza i AI. Mecze w tle (`quickSim.js`) bez zmian.

## 2. Instrukcje v1 (7)

| Instrukcja | Opcje | Pozycje | Zysk | Koszt | Atrybuty |
|---|---|---|---|---|---|
| Podania | krótsze / jak drużyna / dłuższe | wszyscy (BR też) | krótkie: posiadanie, mniej strat; długie: szybciej do przodu, kontry | krótkie: straty przy pressingu i słabej technice; długie: celność, posiadanie | POD, TEC, WIZ; odbiorca GLO, SIL |
| Drybling | mniej / jak drużyna / więcej | BO, WB, ŚP, OP, BP, SN, NAP | przełamania, wymuszone faule | straty, kontry rywala | DRY, ZWI, TEC |
| Strzały z dystansu | mniej / jak drużyna / więcej | ŚP, OP, BP, SN, NAP (DP ograniczone) | więcej strzałów | niższe xG na strzał, mniej podań do przodu | DYS |
| Dośrodkowania | mniej / jak drużyna / więcej | BO, WB, BP, SN | więcej wrzutek | mniej gry środkiem, straty, zmęczenie | DOS, SZY, WYT; w polu GLO, SKO |
| Odbiór | łagodny / jak drużyna / twardy | pole (bez BR) | twardy: więcej odbiorów | faule, kartki, karne; łagodny: słabsza obrona | ODB, SIL; ryzyko AGR, słabe OPA |
| Pozycja | z tyłu / jak drużyna / do przodu | BO, WB, DP, ŚP, BP | do przodu: atak (udział strefy DEF -> ATT ok. 15 %) | kontry rywala (counterVuln +0.04 na zawodnika), zmęczenie, spalone | WYT, SZY, PRA, UST |
| Pressing | mniej / jak drużyna / więcej | pole | wyższy odbiór piłki | zmęczenie (x1.08-1.12), faule | PRA, WYT, AGR |

Poza v1 (v2): tempo (brak zaczepienia na poziomie zawodnika), krycie wybranego rywala (cel na konkretny mecz), wyjście bramkarza.

## 3. Jakość wykonania (pomysł właściciela)

- Losowana raz na mecz dla zawodnika i instrukcji (osobny strumień `new Rng(\`pi:${seed}:${side}:${pid}\`)`, nie rng meczu), zapisana w meczu; zmiana instrukcji w meczu przelicza efekt bez nowego losowania.
- q (ok. 0.6-1.2, średnio ok. 0.9-1.0) = inteligencja piłkarska (DEC, WIZ, UST z wagami zależnymi od instrukcji, ok. 50-60 % zmienności) + dyspozycja dnia i morale (gotowe wartości z silnika: `dayForm`, morale w ocenie; bez podwójnego liczenia) + pogoda (deszcz, wiatr: długie podania, dośrodkowania, drybling, strzały z dystansu; upał: pressing) + presja dużego meczu zależnie od charakteru (Spokojny lepiej, Wrażliwy gorzej, Narwaniec większy rozrzut przy odbiorze i pressingu) + mały szum (SD szumu nie większe niż 0.8 SD wkładu atrybutów).
- Zysk x q, koszt x (2 - q): dobry dzień to więcej zysku i mniej kosztu.

## 4. Konflikt z instrukcją drużyny

- Dozwolony. Modyfikator losowany raz na mecz: średnio lekka kara, w ok. 25-30 % meczów lekki bonus (zakres ok. -15 % do +10 % efektu).
- Bonus częściej: lider, kapitan, wysoka reputacja w składzie, pewniak (minuty w sezonie), dobre morale zawodnika i drużyny. Kara częściej: nowy w klubie, młody, słabe morale, zła pogoda.
- Wpływ na drużynę (decyzja właściciela: tak, lekko): młody albo nowy z instrukcją sprzeczną z planem drużyny lekko obniża zgranie drużyny w meczu; u lidera i gwiazdy szatnia to akceptuje.
- Średnie morale drużyny przekazywane do silnika przez cfg (silnik nie importuje `career/`).

## 5. Ukryta jakość (decyzja właściciela)

Jakość wykonania i modyfikator konfliktu są dla gracza całkowicie ukryte, jak dla prawdziwego trenera: bez liczb, bez opisów „wykonał dobrze/słabo”, bez ostrzeżeń asystenta przed meczem o konkretnym zawodniku. Gracz widzi tylko zwykłe statystyki meczu i zawodnika. W oknie instrukcji są ogólne opisy zysku i ryzyka każdej opcji (bez prognozy dla zawodnika).

## 6. Zmiany w meczu i AI

- W meczu: okno „Zmiany i taktyka” (menu prawego przycisku i zakładka z tabelą). Koszt zgrania jak przy zmianie taktyki (ok. 2 za zawodnika, najwyżej 6), w przerwie bez kosztu. Ta sama ścieżka `changeTactics` dla gracza i AI.
- AI v1: prosta reguła w meczu: obrońca albo DP z żółtą kartką dostaje łagodny odbiór (po 60. min [SZAC]).

## 7. Dane i silnik (skrót, szczegóły w raporcie programisty)

- `game.tactics.playerInstr = { [pid]: { pass, dribble, shoot, cross, tackle, run, press } }`, tylko nadpisania. Katalog: `src/data/playerInstructions.js`.
- Pole przenoszone przy `createTactics` (asystent w meczu `matchday.js:matchTactics`, „Poproś asystenta” w `app.js`, nowy sezon `rollover.js`); `refreshTactics` usuwa zawodników spoza kadry.
- Silnik: `x.pi` liczone w `teams.js:buildTeam` (mnożniki: strzały, strzały z dystansu, faule, kartki, odbiory, dośrodkowania, asysty, zmęczenie, przesunięcie udziału stref); użycie w `core.js` (phaseFoul, phaseAction, shot, pickType, dribblePen, counterBonus) i `teams.js` (updateZones, updateCondition).
- Refaktor: porównania tekstów `T.P.passing === 'short'` i `D.P.tackling === 'hard'` na liczby z `tacticParams`, z identycznym wynikiem bez instrukcji.
- Testy: złoty test (bez instrukcji identyczny dziennik zdarzeń i stan RNG), determinizm, niezależne strumienie, rozkład q, inteligentni wyżej, średni modyfikator konfliktu w [-0.03, 0], efekty każdej instrukcji (A/B na stałych ziarnach), kalibracja bez zmian, wydajność (<10 ms na mecz).

## 8. Interfejs

- Prawy przycisk albo przytrzymanie na zawodniku (Skład i taktyka, okno zmian w meczu): „Instrukcje zawodnika”, okno z opcjami dla jego pozycji (Mniej / Jak drużyna / Więcej), przy „Jak drużyna” wartość drużynowa, krótki opis zysku i ryzyka, „Przywróć jak drużyna”.
- Przycisk „Instrukcje indywidualne (N)” w panelu instrukcji: okno z tabelą. PC: zawodnicy w wierszach (skład, ławka, reszta), instrukcje w kolumnach, przyklejona kolumna nazwisk, filtry pozycji, podświetlenie nadpisań, reset dla wszystkich. Telefon: jedna instrukcja naraz i lista zawodników z przełącznikami.
- Znacznik (ikona) przy nazwisku i na boisku u zawodników z instrukcjami.

## 9. Etapy

1. Silnik i dane (Opus high): katalog, zapis, refaktor, efekty, jakość wykonania, konflikt, zmiany w meczu, reguła AI, testy, kalibracja.
2. Interfejs (Opus high): okno zawodnika, okno tabeli, znaczniki, zakładka w oknie zmian w meczu.
Po obu etapach wersja v1.18 Beta (zgoda właściciela).

## 10. Wdrożenie etapu 1: silnik i dane (Nov 18, 2026)

Interfejs (okno zawodnika, tabela, znaczniki) to etap 2. Wersja gry bez zmian (v1.17 Beta).

### Pliki i funkcje

- Katalog: `src/data/playerInstructions.js`: `PLAYER_INSTRUCTIONS` (7 instrukcji, opcje `-1` i `1`, opcja 0 = „Jak drużyna”, pozycje `pos`, słabszy efekt `posWeight`: DP przy strzałach 0,5, BR przy podaniach 0,5, powiązanie z instrukcją drużyny `team`, opisy `hint`), `piAllowed`, `teamLevel`, `cleanPlayerInstr`, `cleanPlayerInstrMap`, `playerInstrCount`, `PI_TEAM_LABEL`.
- Zapis: `game.tactics.playerInstr = { [pid]: { tackle: -1, ... } }`, tylko nadpisania. `createTactics(squad, { ..., playerInstr })` (`src/engine/lineup.js`) przenosi pole i usuwa obcych; `refreshTactics` zostawia zawodników z kadry (także kontuzjowanych) i usuwa tych spoza klubu, stary zapis bez pola dostaje `{}`. Przekazanie: `matchTactics` (asystent wybiera skład, `src/match/matchday.js`), „Poproś asystenta” (`tauto` w `src/app.js`), nowy sezon (`src/season/rollover.js`).
- Refaktor bez zmiany wyniku: porównania tekstu w `core.js` (`phasePossession`, `counterBonus`, `tacticalFoul`) zastąpione liczbami z `tacticParams` (`INSTR_NUM` w `src/engine/match/constants.js`: `passVolMul`, `passAcc`, `shortPass`, `pressHigh`, `tackleHard`, `tackleSoft`, `tacFoulMul`), bez interpolacji przy zmianie taktyki (`NOLERP` w `teams.js:lerpParams`). Nowe parametry drużyny `offsideMul` (spalone atakujących) i `penDrawMul` (wymuszone karne, `dribblePen`), domyślnie 1.
- Silnik: `src/engine/match/playerInstr.js`:
  - `teamShift(entries)` i `applyShift(P, S, out)`: przesunięcie parametrów drużyny `w * (efekt zawodnika - efekt drużyny)`, `w = 0,1`; mnożniki względnie (`P * (1 + suma w * (r - 1))`), reszta dodawana. Parametry tylko zawodnika (`PI.perPlayer`: `fatMul`, `fatMidMul`, `yellowPerFoul`, `redPerFoul`) nie wchodzą do sumy drużyny.
  - `playerPI(T, x)`: `x.pi` dla zawodnika na jego obecnej pozycji: `foulW`, `yc`, `rc`, `tackleW`, `dysW`, `shotW`, `skrA`, `othA`, `offW`, `fat`, `fwd` i `back` (Pozycja: do przodu udział strefy DEF -> ATT 15 % razy zysk, najwyżej 25 %; z tyłu ATT -> DEF).
  - `refreshPI(T)`: wołane w `teams.js:updateZones` tylko przy `T.piOn`; przelicza efekty po zmianie składu, pozycji albo taktyki (podpis bez napisów), ustawia `T.piShift` i `T.sCap`.
  - `qualityOf`, `conflictOf`, `statusOf`, `isConflict`, `weatherKind`, `validatePlayerInstr`, `mergePlayerInstr`, `clearPI`.
- Użycie `x.pi` w `core.js`: `phaseFoul` (kto fauluje, szansa żółtej i czerwonej), `tacticalFoul`, `awardPenalty` (faulujący), `phaseAction` (kto odbiera), `shot` (strzelec i waga strzałów z dystansu, asystujący przy wrzutkach i przy pozostałych akcjach), `offside` (kto na spalonym; `phaseOffside`: `offsideMul`). W `teams.js`: `updateZones` (udział stref), `updateCondition` (zmęczenie `x.pi.fat`, sufit spójności `T.sCap`).
- Zmiana w meczu: `changeTactics(M, side, { playerInstr: { [pid]: { tackle: -1, press: 0 } | null } })` (`control.js`), walidacja `validateTacticPatch` (`teams.js`), scalanie w `applyTacticChange` (0 albo null: jak drużyna; zawodnik null: wszystkie jak drużyna). Koszt zgrania 2 za zmienionego zawodnika, najwyżej 6 (podwójnie przy kolejnej zmianie w ciągu 10 min, jak instrukcje drużyny), w przerwie 0. Efekt od następnej minuty, z zapisanych losowań. `describePatch`: „instrukcje indywidualne (Nowak: odbiór łagodny)”.
- AI v1 (`coach.js`: `softTackleBooked`, `AI_RULES`): w punkcie kontrolnym od 60. minuty obrońca (ŚO, BO, WB) albo DP z żółtą kartką, który zostaje na boisku, dostaje łagodny odbiór, chyba że cała drużyna gra już (albo w tej samej decyzji przechodzi na) łagodny odbiór. Ta sama ścieżka `changeTactics`, także dla asystenta gracza i w podpowiedziach (`assistantSuggest`). Bez losowania.
- cfg meczu: `teamMorale` (średnie morale, `career/morale.js:teamMorale`, liczone w `matchday.js:kickOff` i `app.js:playMyMatch`), `ctx.date` (nowy w klubie: `p.lastMove` do 90 dni przed meczem), `ctx.weather.type` (`engineWeather`).
- Mecze w tle (`quickSim.js`): bez zmian.

### Jakość wykonania i konflikt (liczby końcowe [SZAC])

- q = 0,96 + 0,08 x (I - 10,6) / 2,3 + 0,05 x dayForm + 0,01 x (morale - 12) + pogoda + presja + 0,064 x N(0, 1), obcięte do 0,6-1,2. I: DEC, WIZ, UST z wagami instrukcji (`PI.intel`). Pogoda (tylko opcja „więcej” albo „dłuższe”): deszcz lub śnieg -0,06 (podania, dośrodkowania) i -0,048 (drybling, strzały), wiatr -0,06 (podania, dośrodkowania) i -0,048 (strzały), upał -0,06 (pressing) i -0,03 (Pozycja). Duży mecz (`ctx.rank >= 2`): Spokojny +0,03, Wrażliwy -0,05, Narwaniec szum x1,5 przy odbiorze i pressingu.
- Pomiar (kadry Ekstraklasy i 1 Ligi): średnia q 0,95-0,97, 5-95 % od 0,77 do 1,16, inteligencja wyjaśnia 54-60 % zmienności; zawodnik o 1 SD mądrzejszy ma średnio ok. 1,06-1,10, o 1 SD słabszy ok. 0,82-0,84.
- Zysk x q x atrybuty wykonania (`PI.skill`: 1 + 0,08 x (średnia - 12), 0,5-1,5) x (1 + u); koszt x (2 - q) x czynnik atrybutów (dobre atrybuty lekko mniej, przy odbiorze więcej przy wysokiej AGR i niskiej OPA) x (1 - u).
- Konflikt u tylko przy instrukcji sprzecznej z planem (przeciwny kierunek instrukcji drużyny; Pozycja do przodu przy nastawieniu ostrożnym i z tyłu przy ofensywnym; drybling więcej przy ostrożnym; strzały z dystansu i dośrodkowania więcej przy krótkich podaniach): bonus z szansą 0,28 + 0,08 x status (do +0,10), inaczej kara do -0,10 x (1 - 0,25 x status), najwyżej -0,15. Status od -2 do 2: Lider +1, kapitan +1, reputacja o 10 nad średnią kadry +0,5, pewniak (60 % minut najczęściej grającego, od 450 min) +0,5, nowy -1, do 20 lat -0,5, morale do 8 -0,5 (od 16 +0,25), morale drużyny od 14 +0,5 (do 9 -0,5), deszcz lub wiatr -0,5. Pomiar: średnio -0,021, bonus w 28,5 % meczów.
- Zgranie: młody (do 21 lat) albo nowy, bez statusu lidera, kapitana i gwiazdy, w konflikcie z planem: sufit spójności drużyny w meczu 97 (dwóch i więcej: 94).
- q i u są ukryte: tylko `T.piReport` w pamięci meczu (testy), nie w zdarzeniach, wyniku ani zapisie.

### Pomiar A/B

300 meczów Ekstraklasy na wariant, te same ziarna, bez AI; instrukcja dla wszystkich uprawnionych z jedenastki gospodarzy, drużyna z ustawieniami domyślnymi. Zmiana średniej na mecz wobec meczów bez instrukcji; „zawodnicy” = zawodnicy z instrukcją.

| Wariant | Najważniejsze skutki |
|---|---|
| Podania krótsze (11) | posiadanie +3,4 pp, celność podań +3,5 pp, strzały +1,0, strzały rywala -0,9 |
| Podania dłuższe | posiadanie -4,0 pp, celność -6,0 pp, strzały rywala +1,2, kondycja zawodników +0,8 |
| Drybling więcej (ok. 7) | strzały +0,4, kontry rywala +0,15, celność -1,2 pp, kondycja zawodników -0,6 |
| Drybling mniej | celność +0,6 pp, kontry rywala -0,08, strzały -0,2 |
| Strzały z dystansu więcej (ok. 5) | strzały z dystansu zawodników +0,82, strzały drużyny +0,36 |
| Strzały z dystansu mniej | strzały z dystansu zawodników -0,85 |
| Dośrodkowania więcej (ok. 3) | kluczowe podania zawodników +0,35, celność -0,6 pp, kondycja zawodników -0,8 |
| Dośrodkowania mniej | kluczowe podania zawodników -0,22, kondycja zawodników +0,4 |
| Odbiór twardy (10) | faule +2,0, żółte +0,5, strzały rywala -0,43, kontry rywala -0,14 |
| Odbiór łagodny | faule -1,2, żółte -0,43, strzały rywala +0,25 |
| Pozycja do przodu (ok. 5) | strzały +1,2, strzały rywala +1,1, kontry rywala +0,35, spalone zawodników +0,18, kondycja zawodników -1,5 |
| Pozycja z tyłu | strzały -0,5, strzały rywala -0,34, kontry rywala -0,10, kondycja zawodników +1,1 |
| Pressing więcej (10) | posiadanie +2,3 pp, strzały rywala -1,1, faule +0,5, kondycja zawodników -3,7 |
| Pressing mniej | posiadanie -2,1 pp, strzały rywala +0,4, kondycja zawodników +2,0 |

Jeden zawodnik daje ok. 1/10 tych liczb. Równoważność z instrukcją drużyny (400 meczów): pressing więcej u 10 zawodników: posiadanie +2,3 pp, strzały rywala -1,1, kondycja -3,7; drużyna „wysoki”: +2,3, -1,1, -3,8. Odbiór twardy u 10: faule +2,0, żółte +0,55; drużyna „twarda”: +2,1, +0,6. Test „10 zawodników z tą samą instrukcją = instrukcja drużyny” sprawdza parametry silnika z dokładnością 1e-9 (q = 1, przeciętne atrybuty). Zmęczenie przy pressingu „więcej” liczone jak w instrukcji drużyny (x1,2 dla zawodnika, nie 1,08-1,12 z tabeli w rozdziale 2), żeby zachować tę równoważność. Pozycja z tyłu przesuwa tylko udział ATT -> DEF (wcześniejsza wersja z częścią MID osłabiała środek pola i dawała rywalowi więcej strzałów).

Pomiar: `node tools/pi-kalibracja.mjs [mecze] [instrukcja:poziom ...] [team:passing:short ...]`.

### Testy

`tests/playerInstr.test.mjs`: złoty test (50 meczów bez AI ze zmianą instrukcji drużyny w meczu i 50 meczów AI bez nowej reguły: identyczne skróty dziennika zdarzeń i stanu RNG jak przed zmianą, kod meczów w `tests/piHelpers.mjs`), instrukcja równa drużynie bez zmian w meczu, tworzenie meczu bez losowań z RNG meczu, determinizm, osobne strumienie, rozkład q, konflikt, równoważność 10 = drużyna, kierunek 14 wariantów (A/B), zapis taktyki, zmiana w meczu (walidacja, koszt, przerwa, te same losowania, brak dryfu RNG), ukrycie q, zgranie, reguła AI, wydajność. `tests/multiseason.test.mjs`: pole przechodzi na nowy sezon.

### Dla etapu 2 (interfejs)

- Przed meczem: zapis w `g.tactics.playerInstr` przez `cleanPlayerInstr` i `cleanPlayerInstrMap` (wartości `-1` i `1`; brak klucza = jak drużyna), opcje i opisy z `PLAYER_INSTRUCTIONS`, dostępność `piAllowed(id, pos)` (pozycja zawodnika albo slot), wartość drużyny przy „Jak drużyna”: `teamLevel(id, g.tactics.instructions)` i `INSTRUCTIONS` (`src/data/instructions.js`), licznik `playerInstrCount`.
- W meczu: `changeTactics(M, side, { playerInstr: { [pid]: {...} | null } })`, sprawdzenie bez wykonania `checkTacticPatch(M, side, patch)` (`match.js`), bieżące nadpisania `M.teams[side].tactics.playerInstr`. Bez pokazywania q, u ani `T.piReport`.
