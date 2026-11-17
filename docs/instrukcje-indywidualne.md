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
