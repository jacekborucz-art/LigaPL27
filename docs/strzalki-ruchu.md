# Strzałki ruchu zawodników

Projekt Nov 18, 2026 po burzy mózgów (taktyk, znawca futbolu, analityk, grafik, programista silnika). Decyzje wybrane jako najbliższe realiom piłki (zasada właściciela: bez pytań). Wartości [SZAC] do kalibracji; liczby po kalibracji i wdrożenie: rozdział 5. Rozszerza instrukcje indywidualne (`docs/instrukcje-indywidualne.md`).

## 1. Zasada

- Strzałka to ruch zawodnika w fazie ataku, ustawiany na boisku taktyki. To nie nowy byt, tylko wizualny sposób ustawienia instrukcji indywidualnych: składowa pionowa = istniejąca instrukcja `run` (Pozycja: z tyłu / do przodu), składowa pozioma = nowy klucz `lat` (-1 do środka, 1 szeroko) w `tactics.playerInstr[pid]`. Jedno źródło prawdy, bez migracji.
- Kierunki (względne do strony zawodnika, nie „w lewo”): do przodu (run 1), skos do środka (run 1, lat -1: underlap, wejście w półprzestrzeń), skos na zewnątrz (run 1, lat 1: overlap), do środka (lat -1: odwrócony boczny obrońca, skrzydłowy schodzący do środka), szeroko (lat 1), cofnięcie (run -1: opadanie, fałszywa dziewiątka). Jedna długość w v1.
- Jakość wykonania ukryta, jak w instrukcjach indywidualnych (ten sam strumień `pi:${seed}:${side}:${pid}`, losowania `lat` dopisane PO obecnych, żeby nie zmienić q i u istniejących instrukcji). Złoty test bez zmian.

## 2. Dozwolone kierunki

| Pozycja | Kierunki |
|---|---|
| BR, ŚO | brak |
| BO | do przodu (wybieg wzdłuż linii), skos do środka (underlap), do środka (odwrócony boczny obrońca), cofnięcie; bez ruchu na zewnątrz (strzałka poza boisko) |
| WB (trójka środkowych obrońców) | jak BO plus skos na zewnątrz (overlap) |
| DP | do przodu, cofnięcie (opada między stoperów) |
| ŚP | wszystkie 6 (box-to-box, półprzestrzeń, rotacja) |
| OP | do przodu (cień napastnika), cofnięcie, szeroko, skos na zewnątrz |
| BP, SN | do przodu (za linię obrony), do środka i skos do środka (inside forward), szeroko (klasyczny skrzydłowy), cofnięcie |
| NAP | do przodu (na plecach obrońcy), szeroko (gra w kanale), cofnięcie (fałszywa dziewiątka) |

`run` rozszerzone na OP, SN i NAP. Niedozwolona para na nowej pozycji jest ignorowana.

## 3. Skutki w silniku (waga 1/10 jak instrukcje, każdy zysk ma koszt) [SZAC]

- Strefy: dzisiejsze `run` DEF<->ATT; OP, SN, NAP MID<->ATT (cofnięcie NAP: ATT -> MID ok. 25 %); „do środka” u BO: DEF -> MID ok. 20 %.
- Środek pola: `x.pi.cen` (do środka +0,5, szeroko -0,5, cofnięcie NAP +0,5) dodawane do `T.central` (posiadanie), malejący zysk przy 3+ zawodnikach do środka.
- Rodzaj akcji: do środka POZ x1,08 i SKR x0,85; szeroko SKR x1,2 i POZ x0,95; do przodu u skrzydłowego KON x1,1.
- Strzelec i asystent: BP do środka strzały x1,25, z dystansu x1,3, dośrodkowania x0,6; szeroko dośrodkowania x1,4, strzały x0,85; cofnięcie NAP strzały x0,7, inne asysty x1,4.
- Koszty: BO do środka odsłania flankę (podatność na kontrę x1,1, dośrodkowania rywala x1,15); BP do środka zwęża grę (szerokość -0,1, dośrodkowania rywala x1,1); do przodu: kontry rywala i spalone jak `run`; zmęczenie: skosy x1,06, szeroko x1,04, cofnięcie x0,97.
- Łączenie: co najmniej 2 zawodników linii obrony do przodu: podatność na kontrę x(1 + 0,06 x (n - 1)); bez kary, gdy drugi boczny obrońca ma „do środka” albo cofnięcie (asekuracja).
- Konflikt z instrukcją drużyny: dla `lat` brak (drużyna nie ma instrukcji szerokości).
- AI w v1 nie używa strzałek (te same zasady silnika). Mecze w tle bez zmian.
- Zmiana w meczu: `changeTactics(..., { playerInstr: { [pid]: { run, lat } } })`, jak instrukcje indywidualne (koszt zgrania 2 na zawodnika, najwyżej 6, w przerwie 0).

## 4. Interfejs

- Przełącznik „Strzałki” nad boiskiem (obok przycisku Instrukcje indywidualne). W trybie strzałek przeciąganie zawodników jest wyłączone.
- Klik albo dotknięcie zawodnika w trybie strzałek: kompas z dozwolonymi kierunkami (przyciski 44 px) i „Brak”. Na PC skrót: przeciągnięcie od zawodnika przyciągane do 8 kierunków.
- Rysowanie: jedna warstwa SVG nad boiskiem (pod żetonami), strzałki z grotem, typ rozróżniony kształtem linii i kolorem (wbieganie przerywana, cofnięcie kropkowana, szeroko i do środka ciągła w innym kolorze), ciemny obrys dla czytelności na trawie, light i dark.
- Strzałki widać na boisku zawsze (nie tylko w trybie), znacznik na żetonie i w liście. W oknie instrukcji zawodnika i w tabeli: pozycja „Ruch” (kompas albo lista kierunków) zamiast osobnej kolumny `lat` (tabela zostaje z 7 kolumnami, „Pozycja” pokazuje kierunek).
- Klawiatura: Enter otwiera kompas, strzałki wybierają kierunek, Delete usuwa, Escape zamyka; aria-label zawodnika z ruchem; legenda pod boiskiem.
- Ostrzeżenie (bez blokady): obaj boczni obrońcy do przodu, „ryzyko kontry”.
- W meczu: te same strzałki w oknie „Zmiany i taktyka”.

## 5. Wdrożenie (Nov 18, 2026, v1.19 Beta)

### Dane
- `src/data/playerInstructions.js`: `run` (etykieta „Ruch”, opcje „Cofnięcie” i „Do przodu”) działa też na OP, SN i NAP. Nowy klucz `lat` jako osobny opis `PI_LAT` (`arrow: true`), poza `PLAYER_INSTRUCTIONS`, więc tabela i okno zawodnika zostają z 7 instrukcjami. `PI_KEYS` (7 + `lat`) do czyszczenia i porównań (`cleanPlayerInstr`, `piPatch`).
- Kierunki: `ARROW_DIRS` (f, fi, fo, i, o, b), dozwolone pary `ARROW_POS` (tabela z rozdziału 2), `arrowOf({ run, lat })`, `arrowToInstr(dir)`, `arrowsFor(pos)`, `arrowAllowed(pos, dir)`, `arrowLabel`, `arrowHint` (opis roli: overlap, underlap, odwrócony boczny obrońca, inside forward, fałszywa dziewiątka).
- Zapis bez migracji: `tactics.playerInstr[pid] = { run, lat }` obok innych instrukcji.

### Silnik (`src/engine/match/playerInstr.js`, `PI.fx` i `PI.arrow`)
- Para `run` + `lat` niedozwolona na obecnej pozycji: cały ruch pomijany (`playerPI`, `x.pi.dir`). Walidacja zmiany w meczu (`validatePlayerInstr`) sprawdza parę po scaleniu z obecnym ruchem (pozycja zawodnika albo jego miejsce).
- Losowania `lat` dopisane po 7 instrukcjach (`drawsOf`): q i u dotychczasowych instrukcji bez zmian (test sprawdza dokładną kolejność losowań). Bez instrukcji nic się nie liczy (`T.piOn`), złoty test bez zmian.
- Strefy (`x.pi.moves`, `shiftedShare`): dotychczasowe `run` DEF <-> ATT bez zmian (BO, WB, DP, ŚP, BP); OP, SN, NAP MID <-> ATT 15 % x zysk; BO i WB do środka DEF -> MID 8 % (skos 4 %). Środek pola liczy się w ataku, obronie i posiadaniu, więc zawodnik dochodzący do środka albo z niego wybiegający zmienia go w 20 % (`midEff`). Bez tego ruch do środka był darmową przewagą (pomiar: posiadanie +4 do +6 pp i mniej strzałów rywala).
- Środek pola: `x.pi.cen` (do środka +0,2, skos do środka +0,1, szeroko -0,2, skos na zewnątrz -0,1, cofnięcie NAP +0,2) sumowane w `T.piCen` i dodawane do `T.central` tylko przy `T.piOn`; zysk powyżej 0,4 liczony w połowie. Wartości z projektu (0,5) dawały za dużo posiadania bez kosztu.
- Efekty drużynowe 1/10 na zawodnika jak instrukcje: do środka POZ x1,08, SKR x0,85; szeroko SKR x1,2, POZ x0,95. Efekty roli działają w pełni na zawodnika (`roleW`), bo przy 1/10 koszty były niemierzalne: BO i WB do środka podatność na kontrę x1,12 i dośrodkowania rywala x1,2; BP i SN do środka szerokość -0,1 i dośrodkowania rywala x1,1; ŚP do środka szerokość -0,15 i dośrodkowania rywala x1,2; szeroko szerokość +0,15 i SKR x1,08; BP, SN, NAP do przodu KON x1,05; BO, WB, DP, ŚP cofnięcie: akcje x0,97.
- Zawodnik: BP i SN do środka strzały x1,25, z dystansu x1,3, dośrodkowania x0,6; szeroko dośrodkowania x1,4 (OP x2,5, bo zaczyna z niskiej wagi), strzały x0,85; do przodu ŚP strzały x1,25, OP x1,3, BP x1,15; cofnięcie NAP strzały x0,7, asysty z gry x1,4; zmęczenie skos x1,06, szeroko x1,04 (do tego `run` jak dotąd: do przodu x1,08, cofnięcie x0,95).
- Łączenie: co najmniej 2 bocznych obrońców (BO, WB) do przodu bez asekuracji (inny boczny obrońca do środka albo cofnięcie): podatność na kontrę x(1 + 0,06 x (n - 1)) (`refreshPI`).
- Zmiana w meczu: `changeTactics(M, side, { playerInstr: { [pid]: { run, lat } } })`, koszt jak instrukcje; relacja: „ruch: skos do środka” (`describePatch`, `moveText`).

### Interfejs
- `src/ui/arrowsView.js` (czyste funkcje): `arrowsSvg` (warstwa `svg.pa` w `.pitch2` pod żetonami, viewBox jak boisko, `preserveAspectRatio="none"`, linie `vector-effect: non-scaling-stroke`, groty `marker` w `defs`, ciemne halo), `compassHtml` i `compassCell` (siatka 3 x 3, tylko dozwolone kierunki, środek „brak ruchu”, przyciski 44 px; osobny układ dla poziomego boiska w meczu na telefonie), `arrowLegendHtml`, `fbWarning`, `snapDir` (8 kierunków, względem strony zawodnika).
- Skład i taktyka (`tacticsView.js`): przycisk „Strzałki (N)” obok „Instrukcje indywidualne”, tryb `state.tArrows` (`app.js`: `tarrows`, `tarrow-pick`, `tarrow-set`, `tarrow-close`), przeciąganie zawodników wyłączone (`tacticsDrag.js`). Skrót na PC: przeciągnięcie od zawodnika rysuje strzałkę przyciąganą do 8 kierunków (`tacticsArrows.js`, podpowiedź kierunku nad boiskiem). Klawiatura: Enter otwiera kompas, strzałki przechodzą między kierunkami, Delete usuwa, Escape zamyka. Strzałki widać zawsze, legenda pod boiskiem, ostrzeżenie o obu bocznych obrońcach w `.tac__msg`. Menu zawodnika: podmenu „Ruch w ataku (strzałka)”.
- Okno zawodnika i tabela (`playerInstrView.js`): wiersz i kolumna „Ruch” pokazują kierunek (przyciski albo lista wyboru), znacznik i opisy „ruch skos do środka”.
- Mecz (`matchdayView.js`): przycisk „Strzałki” nad małym boiskiem okna „Zmiany i taktyka”, kompas na żetonie, zmiany w szkicu `ui.tac.pi`, wchodzą po „Zatwierdź” (kolejka: „Instrukcje, Nowak: ruch do środka”), ostrzeżenie w stopce.

### Pomiar A/B (`node tools/pi-kalibracja.mjs 300 strzalki`)
300 meczów Ekstraklasy na wariant, te same ziarna, gospodarze w formacji grupy (BO, DP, OP: 4-2-3-1; ŚP i SN: 4-3-3; BP i NAP: 4-4-2), strzałka dla wszystkich zawodników grupy (OP: 1 zawodnik, reszta: 2). Zmiana średniej na mecz; „zawodników” = zawodników ze strzałką, kondycja w punktach na koniec meczu.

| Wariant | Zysk | Koszt |
|---|---|---|
| BO do przodu | strzały +0,58 | strzały rywala +0,67, kontry rywala +0,24, kondycja -1,1 |
| BO skos do środka | posiadanie +0,6 pp, strzały +1,1, kluczowe podania +0,35 | dośrodkowania rywala +0,61, kontry rywala +0,30, kondycja -2,2 |
| BO skos na zewnątrz | dośrodkowania +0,50, kluczowe podania +0,66 | posiadanie -1,0 pp, strzały rywala +0,88, kontry rywala +0,29, kondycja -2,7 |
| BO do środka | posiadanie +1,5 pp, strzały +0,68 | dośrodkowania rywala +0,42, kontry rywala +0,10 |
| BO cofnięcie | kondycja +1,1 | strzały -0,75 |
| DP do przodu | strzały +0,35 | strzały rywala +0,40, kontry rywala +0,12, kondycja -1,4 |
| DP cofnięcie | kondycja +1,1 | strzały -0,79 |
| ŚP do przodu | strzały zawodników +0,43 | strzały rywala +0,17, kondycja -1,6 |
| ŚP skos do środka | posiadanie +0,8 pp, strzały zawodników +0,40 | dośrodkowania rywala +0,43, kondycja -3,0 |
| ŚP skos na zewnątrz | dośrodkowania +0,46, kluczowe podania +0,24 | posiadanie -0,4 pp, kondycja -2,8 |
| ŚP do środka | posiadanie +1,1 pp, kontry rywala -0,22 | dośrodkowania rywala +0,34, dośrodkowania -0,11 |
| ŚP szeroko | dośrodkowania +0,56 | posiadanie -0,9 pp, strzały rywala +0,32, kondycja -0,8 |
| ŚP cofnięcie | kondycja +1,1 | strzały -0,90 |
| OP do przodu | strzały zawodnika +0,21 | posiadanie -0,7 pp, strzały rywala +0,36, kontry rywala +0,18, kondycja -1,1 |
| OP skos na zewnątrz | dośrodkowania +0,19, kluczowe podania +0,13 | posiadanie -0,8 pp, kontry rywala +0,13, kondycja -2,5 |
| OP szeroko | kluczowe podania +0,20 | posiadanie -0,9 pp, strzały -0,55 |
| OP cofnięcie | posiadanie +0,4 pp, kondycja +1,2 | dośrodkowania rywala +0,23 |
| BP do przodu | strzały zawodników +0,23 | kontry rywala +0,12, spalone +0,14, kondycja -1,8 |
| BP skos do środka | strzały zawodników +0,80 | kluczowe podania -0,56, dośrodkowania rywala +0,24, kondycja -3,3 |
| BP do środka | posiadanie +1,0 pp, strzały zawodników +0,60 | dośrodkowania rywala +0,21, kluczowe podania -0,21 |
| BP szeroko | dośrodkowania +0,40, kluczowe podania +0,51 | posiadanie -1,0 pp, strzały zawodników -0,35 |
| BP cofnięcie | kontry rywala -0,15, kondycja +1,1 | strzały -0,37 |
| SN do przodu | kontry +0,43, strzały +0,40 | posiadanie -0,3 pp, spalone +0,22, kondycja -1,8 |
| SN skos do środka | strzały zawodników +0,78 | kluczowe podania -0,32, dośrodkowania rywala +0,26, kondycja -3,2 |
| SN do środka | posiadanie +1,2 pp, strzały zawodników +0,76 | kluczowe podania -0,31, dośrodkowania rywala +0,11 |
| SN szeroko | dośrodkowania +0,38, kluczowe podania +0,51 | posiadanie -0,9 pp, strzały rywala +0,31 |
| SN cofnięcie | posiadanie +1,0 pp, strzały rywala -0,32 | strzały -0,24 |
| NAP do przodu | kontry +0,12 | spalone +0,22, kondycja -1,6 |
| NAP szeroko | dośrodkowania +0,30 | posiadanie -1,1 pp, strzały zawodników -0,56 |
| NAP cofnięcie (fałszywa dziewiątka) | posiadanie +1,8 pp, kluczowe podania +0,24, strzały rywala -0,41 | strzały zawodników -0,95, strzały -0,48 |

Różnica bramek we wszystkich wariantach mieści się w szumie (od -0,21 do +0,17 na mecz, błąd ok. 0,13). Po rozszerzeniu Ruchu na OP, SN i NAP instrukcja „do przodu” dla wszystkich uprawnionych z jedenastki (domyślna formacja): strzały +1,1, strzały rywala +1,4, kontry rywala +0,62, kondycja -1,3; „cofnięcie”: strzały -1,7, strzały rywala -0,9, kondycja +0,85.

Próby wartości bez zmiany kodu: zmienna `PI_ARROW` z JSON nadpisuje `PI.arrow`, np. `PI_ARROW={"cen":0.1}` przed `node tools/pi-kalibracja.mjs 300 strzalki BO:i`.

### Testy
- `tests/strzalki.test.mjs`: dozwolone kierunki, walidacja par i scalenie, para pomijana na nowej pozycji, znaczenie względem strony, q i u 7 instrukcji bez zmian (kolejność losowań), kara za obu bocznych obrońców, środek pola z malejącym zyskiem, A/B wszystkich 30 kierunków (zysk i mierzalny koszt, najważniejsze kierunki z progami).
- `tests/strzalkiView.test.mjs`: tryb strzałek bez przeciągania, SVG pod żetonami, kompas tylko z dozwolonymi kierunkami, kierunek względem strony, przyciąganie do 8 kierunków, ostrzeżenie, „Ruch” w oknie i tabeli (7 kolumn), zmiana w meczu przez `changeTactics`.
- `tests/contextMenu.test.mjs`: podmenu „Ruch w ataku (strzałka)” i akcja `tarrow-set`; `tests/playerInstrView.test.mjs`: NAP ma teraz Ruch.
