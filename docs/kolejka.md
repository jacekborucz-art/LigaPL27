# Kolejka zadań (do wykonania)

Lista zadań zatwierdzonych przez właściciela do zrobienia później. Po wdrożeniu zadanie znika z listy (opis trafia do własnego pliku w `docs/`).

## 1. Historia morale zawodników (dodane Nov 18, 2026)

Dziś gra zna tylko obecne morale (`p.morale`, skala 1-20, `src/career/morale.js`). Strzałki morale w Skład i taktyka (PC) pokazują poziom, nie trend.

Zapis (do wyboru przy wdrożeniu):
- Podstawowy (ok. 1 h z testami): co poniedziałek system dnia zapisuje morale każdego zawodnika, 8 ostatnich tygodni (np. `p.moraleHist`). Ok. 4000 zawodników, ok. 100 KB zapisu [SZAC]. Trend: obecne morale wobec wartości sprzed 1-2 tygodni.
- Rozszerzony (dodatkowo ok. pół dnia): dziennik przyczyn zmian tylko dla kadry gracza (mecz, rozmowa, zebranie, ławka, kontrakt), np. ostatnie 20 wpisów. Wymaga podpięcia w 10 plikach z `applyMorale` (teamTalks, season, coachMarket, aiClubs, sessions, matchday, briefings, attention, fans, morale).
- Migracja starych zapisów: brak historii = pusty trend (strzałka poziomu jak dziś).

Wykorzystanie, informacja (bez zmiany balansu):
1. Strzałki trendu w Skład i taktyka: kierunek = rośnie/spada, kolor = poziom.
2. Karta zawodnika: mały wykres morale z 8 tygodni.
3. Raport drużyny i raport asystenta: ostrzeżenie o szybkim spadku (np. „morale spadło o 4 w 2 tygodnie”).
4. Kadra > Rozmowy: powód „Morale szybko spada” przed niskim poziomem; ocena skutku rozmowy (morale tydzień później).
5. Atmosfera w drużynie: trend w kafelku Rozmów i wykres sezonu w historii klubu.
6. Do zrobienia w tym tygodniu (`src/career/weeklyTodo.js`): zadanie „Morale spada u N zawodników”.

Wykorzystanie, logika gry (zmienia balans, każdy punkt do decyzji właściciela, najlepiej po burzy mózgów z ekspertami):
7. Prośba o transfer (`src/career/moveWish.js`): długi spadek morale zwiększa szansę prośby, nie tylko niski poziom.
8. Kluby AI i scouting: długo spadające morale jako okazja transferowa (także u zawodników gracza).
9. Kontrakty i negocjacje: rosnące morale ułatwia przedłużenie, spadające podnosi żądania.
10. Prasa: pytania o złą atmosferę po 3 tygodniach spadku morale drużyny.
11. Zarząd i autorytet trenera: długi spadek morale drużyny lekko obniża zaufanie zarządu.

Propozycja kolejności: zapis podstawowy i punkty 1-4, 6 (sama informacja), potem burza mózgów nad punktami 7-11.
