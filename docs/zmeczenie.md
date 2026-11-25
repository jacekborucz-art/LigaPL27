# Zmęczenie w meczu

Stałe: `FATIGUE` w `src/engine/match/constants.js`. Kod: `updatePace` i `errFactor` w `src/engine/match/teams.js`, `paceTerm`, `defError`, `tiredFoul` w `src/engine/match/core.js`. Testy: `tests/fatigue.test.mjs`.

## Co robi zmęczenie

Kondycja zawodnika zaczyna mecz od świeżości sprzed meczu i spada co minutę. Szybciej męczą się pomocnicy, zawodnicy ze słabą wytrzymałością, starsi (31+), grający w upale, z drobnym urazem i drużyny grające wysokim pressingiem.

1. **Słabszy zawodnik we wszystkich strefach** (było wcześniej): -0,04 do atrybutów za każdy punkt kondycji poniżej 85, także przy strzałach.
2. **Wolniejszy zawodnik** (nowe): szybkość razy (1 - 0,007 za punkt kondycji poniżej 85). Przy kondycji 60 zawodnik jest o 17,5% wolniejszy.
   - W kontrach liczy się szybkość z kondycją.
   - W każdej akcji liczy się przewaga ataku nad obroną wynikająca tylko ze zmęczenia: zmęczeni obrońcy nie nadążają za świeżym napastnikiem albo świeżym zmiennikiem, zmęczeni napastnicy tracą przewagę. Maksymalnie +-0,36 punktu atrybutu.
   - Przy świeżych składach ten dodatek wynosi 0, więc zwykłe mecze się nie zmieniają.
3. **Błędy obrony** (nowe): zmęczony obrońca (kondycja poniżej 75: +2% ryzyka za punkt) i obrońca grający poza pozycją (`errorMul` z `src/engine/positions.js`) częściej traci piłkę przy wyprowadzeniu. Błąd daje rywalowi dobrą sytuację (xG 0,12-0,35) i jest widoczny w relacji.
4. **Faule** (nowe): zmęczony zawodnik (kondycja poniżej 70) częściej się spóźnia i fauluje, a zmęczona obrona częściej przerywa kontrę faulem taktycznym.

Te same zasady obowiązują gracza i AI.

## Pomiar (2000 meczów Ekstraklasy, te same ziarna)

| | Przed | Po |
|---|---|---|
| Zwykłe mecze: gole / strzały / faule / żółte | 2,76 / 25,3 / 27,1 / 4,34 | 2,76 / 25,2 / 27,1 / 4,32 |
| Zwykłe mecze: wygrane gospodarzy / remisy | 44,0% / 25,7% | 43,6% / 26,8% |
| Zwykłe mecze: błędy obrony na mecz | brak | 0,016 |
| Goście zmęczeni (świeżość 62): wygrane gospodarzy | 61,5% | 63,3% |
| Goście zmęczeni: gole gospodarzy | 1,96 | 2,07 |
| Goście zmęczeni: faule / żółte w meczu | 27,2 / 4,32 | 29,6 / 4,71 |
| Goście zmęczeni: błędy obrony na mecz | brak | 0,17 |

Gra poza pozycją (1000 meczów, Pogoń z napastnikiem na środku obrony przeciw Legii): błędy obrony 0,015 na mecz przy nominalnym obrońcy, 0,061 z napastnikiem na środku obrony; stracone gole 2,19 wobec 2,45.

Wartości balansowe [SZAC]. Zmęczenie było już wcześniej silne (zmęczeni goście przegrywali dużo częściej), dlatego nowe efekty są umiarkowane.

## Kara kondycji z tolerancją zawodnika (Nov 25, 2026)

Zgłoszenie: drużyna bez zmian w meczu powinna mieć lekko gorsze wyniki. Pomiar przed zmianą (600 meczów, gospodarz z AI kontra ten sam gospodarz bez zmian): bez zmian 1,642 pkt wobec 1,597, czyli brak zmian pomagał. Przyczyny (programista, 4000 meczów): kara -0,04 za punkt kondycji była za słaba (kondycja na koniec 76 to tylko -0,36), rezerwowi są słabsi od schodzących o ok. 0,7-1,2 punktu.

- Kara: `condPenalty` w `src/engine/match/teams.js` (też `core.js` przy strzałach i `coach.js` przy wyborze zmiennika): -(0,04 d + 0,008 d²) x k, d = 85 - kondycja. Kondycja 76: ok. -1,0; 70: ok. -2,4. Przy 85 i więcej bez kary.
- Tolerancja k na mecz (`fatigueTolerance`, `FATIGUE.tol`): 1 - 0,03 (PRA - 10) - 0,015 (OPA - 10) - 0,015 (WYT - 10) + los N(0; sd), sd = 0,18 - 0,012 ((PRA + WYT) / 2 - 10), najmniej 0,05; w granicach 0,6-1,5. Pracowity i wytrzymały znosi zmęczenie lepiej i równiej, leniwy gorzej i mniej przewidywalnie. Los z osobnego ziarna (mecz, zawodnik).
- Pogoda i murawa: upał powyżej 28 st. (x1,3), śnieg (x1,1) i zła murawa (x1,15) przyspieszają spadek kondycji (`weather.fat`), więc kara rośnie szybciej.
- Pomiar po zmianie (1500 meczów): ze zmianami AI 1,629 pkt, bez zmian 1,562 (+0,067 dla zmian; cel eksperta +0,05 do +0,08). Od 60. min strzelone 0,661 / 0,647, stracone 0,523 / 0,489 (pogoń AI otwiera grę). Zwykłe mecze: kalibracja `tests/matchEngine.test.mjs` bez zmian.
- Testy: przeliczone wzorce złotego testu (`tests/playerInstr.test.mjs`); w `tests/strzalki.test.mjs` bilans bramek (+0,04) liczy się jako zysk strzałki (OP do przodu na zewnątrz).
