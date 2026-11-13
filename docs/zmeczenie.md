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
