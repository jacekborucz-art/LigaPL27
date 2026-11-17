# Znaczniki stanu zawodnika (Kadra > Zawodnicy)

Wdrożone Nov 17, 2026 (v1.16 Beta). Kod: `src/ui/playerTags.js` (`playerTagList`, `playerTags`), style `.tg` w
`src/styles/app.css`, powód pauzy `src/season/suspension.js`, testy `tests/playerTags.test.mjs`.

Małe kolorowe kwadraty tuż za nazwiskiem w trzech widokach Kadry (Przegląd, Atrybuty i forma, Statystyki).
Zastąpiły dawny znak „+” / „P” przy kondycji. Podpowiedź (title i aria-label) po polsku wyjaśnia każdy znacznik.
Pełny kwadrat: sprawa pilna. Obrys: sprawa drugorzędna.

## Znaczniki w kolejności ważności

| Nr | Znacznik | Kiedy | Wygląd |
|----|----------|-------|--------|
| 1 | P2 | Pauza za kartki w rozgrywkach drużyny (liczba meczów) | żółty: nagromadzone żółte kartki, czerwony: czerwona kartka |
| 2 | +12 | Kontuzja, dni przerwy (ponad 99: „99+”) | czerwony |
| 3 | K | Powołanie do reprezentacji (z U21), data powrotu | zielony (murawa) |
| 4 | TR, PK | Transfer w toku (etap, wstrzymanie gry po testach), przedkontrakt (klub i data) | fioletowy |
| 5 | O1 | Oferty do decyzji gracza: kupno, wypożyczenie, prawo pierwokupu (otwarte, niewygasłe) | niebieski |
| 6 | ! | Chce odejść: cicha albo oficjalna prośba | obrys czerwony |
| 7 | Ż | Jedna żółta kartka od pauzy (liga klasy klubu, Puchar Polski, UEFA; progi z `config/competitions.js`) | obrys żółty |
| 7 | P1 | Pauza tylko w innej klasie ligowej (rezerwy): w meczach drużyny może grać | obrys żółty |
| 8 | T, W | Lista transferowa, lista wypożyczeń (u gracza: szukanie klubu albo propozycje) | bursztynowy, śliwkowy |
| 9 | KW | Kontrakt wygasa z końcem sezonu (30 cze), z informacją o odmowie przedłużenia | obrys żółty |
| 10 | W+, W− | Wypożyczony do oglądanego klubu albo z niego | obrys śliwkowy |
| 11 | Z | Zmęczony: kondycja poniżej 75% | obrys żółty |

## Limit na wiersz

Telefon (poniżej 760 px): 2 znaczniki, PC: 4. Reszta to jeden szary znacznik „+N” z listą ukrytych w podpowiedzi.
HTML ma dwa warianty „+N” (telefon i PC), CSS pokazuje właściwy. Nazwisko skraca się wielokropkiem.

## Prywatność

Zawodnicy innych klubów (gdy helper trafi na listy transferowe lub taktykę): bez kondycji, cichej prośby o odejście,
listy transferowej gracza i ofert. Prośba oficjalna i listy klubów AI są widoczne. Kadra gracza i drugiej drużyny
jego klubu: pełna wiedza.

## Powód pauzy w zapisie

`p.suspWhy[klucz]` = `'y'` (żółte) albo `'r'` (czerwona), klucze jak `p.susp` (klasa ligi, `cup`, `uefa`).
Zapis przy nałożeniu pauzy (`applyResult` w `src/season/season.js`), czerwona ma pierwszeństwo w trwającej pauzie.
Powód znika po odbyciu pauzy (także pauzy w drugiej drużynie), idzie za pauzą przy zmianie klasy w nowym sezonie
(`reservesNewSeason`), porządki przy zmianie sezonu i w III lidze. Stary zapis bez powodu: żółty znacznik bez dopisku.
