# Historia morale zawodników

Wdrożone Nov 19, 2026 (v1.19 Beta). Tylko informacja dla gracza: balans gry, mecze i kluby AI bez zmian.

## Zapis

- `p.moraleHist`: morale w poniedziałki, najstarsze pierwsze, najwyżej 8 tygodni (`MORALE_HIST` w `src/career/morale.js`).
- Wpis powstaje w poniedziałek w systemie `recovery` (`src/season/season.js`), przed tygodniowym dryfem morale ku 12,
  czyli jest to stan po minionym tygodniu.
- Tylko zawodnicy klubów z kadrą w grze (kadra i akademia). Wolni zawodnicy i zagranica nie mają historii
  (przy odejściu z klubu w grze historia jest usuwana w najbliższy poniedziałek).
- Rozmiar zapisu: ok. 4000 zawodników po 8 liczb, ok. 150 KB [SZAC].
- Stare zapisy: brak historii = brak trendu (strzałka poziomo, bez ostrzeżeń). Pierwszy wpis w najbliższy poniedziałek.

## Trend

`moraleTrend(p)`: obecne morale wobec przedostatniego wpisu (1-2 tygodnie temu; przy jednym wpisie wobec ostatniego).
- rośnie: +1 i więcej, spada: -1 i więcej w dół, w innym razie bez zmian;
- szybki spadek: o 4 i więcej (`FAST_DROP`).

Trend drużyny (`teamMoraleTrend`): 18 zawodników z największą liczbą minut, próg 0,8.

## Gdzie gracz to widzi

1. Skład i taktyka (PC): strzałka morale. Kierunek to trend (w górę rośnie, poziomo bez zmian, w dół spada,
   pionowo w dół szybki spadek), kolor to poziom (5 pasm, jak dotąd). Opis w podpowiedzi i w legendzie.
2. Karta zawodnika: wykres „Morale w ostatnich tygodniach” (wpisy z poniedziałków i stan dziś, skala 1-20),
   pod wykresem formy. Nie ma go w karcie zawodnika innego klubu (jego morale zna tylko jego klub).
3. Raport asystenta (atmosfera): „Morale szybko spada: ...” u zawodników, którzy nie mają jeszcze niskiego morale,
   z tą samą szansą dostrzeżenia co inne obserwacje asystenta.
   Raport drużyny (zalecenia): przy co najmniej 2 zawodnikach z szybkim spadkiem zalecenie rozmów z przyciskiem Rozmowy.
4. Kadra > Rozmowy:
   - powód „Morale szybko spada” (przed „Niskie morale”, które wypiera go od morale 8 w dół), zawodnik trafia
     do polecanych, a więc też do kolejki rozmów asystenta i listy „Do zrobienia w tym tygodniu” (zadanie
     „Porozmawiaj z: ...” z tym powodem);
   - przy morale zawodnika dopisek „rośnie” albo „spada” ze strzałką;
   - kafelek „Atmosfera w drużynie”: trend drużyny;
   - „Ostatnie rozmowy”: po 7 dniach dopisek „Tydzień później: morale wyżej / niżej / jak przed rozmową”
     (wpis rozmowy w `game.talks.log` ma `m0` przed rozmową i `m7` tydzień później; `talkFollowUp` w morale.js,
     wywoływane codziennie w systemie `recovery`).

## Do decyzji (kolejka)

Wykorzystanie historii w logice gry (prośby o transfer, kluby AI, kontrakty, prasa, zarząd) i wykres atmosfery sezonu
w historii klubu: `docs/kolejka.md`, zadanie 1.
