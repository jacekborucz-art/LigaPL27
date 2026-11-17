# Kolejka zadań (do wykonania)

Lista zadań zatwierdzonych przez właściciela do zrobienia później. Po wdrożeniu zadanie znika z listy (opis trafia do własnego pliku w `docs/`).

## 1. Raport meczu po kliknięciu wyniku (dodane Nov 17, 2026)

Okno modalne po kliknięciu wyniku w terminarzu (Rozgrywki > Terminarz, także inne listy wyników). Prosty raport:
- wynik, data, stadion, liczba widzów, sędzia;
- gole z minutami i asystami, żółte i czerwone kartki z minutami, kontuzje (poważne wyróżnione);
- mecze gracza (pełny silnik): też VAR (gol nieuznany, kartka zmieniona), zmiany;
- oceny zawodników za mecz (opcjonalnie, zwijane);
- podstawowe statystyki: strzały, celne, posiadanie, xG.

Dane:
- Mecze w tle (`src/engine/quickSim.js`, `playQuick` w `src/season/season.js`) liczą strzelców, asysty, kartki i kontuzje u zawodników, oceny i składy, ale do terminarza (`f.result`) zapisują tylko wynik, strzelców i statystyki. Trzeba zapisać okrojone zdarzenia (bez rozdęcia zapisu gry).
- Minuty goli i kartek w meczach w tle nie istnieją: trzeba je losować deterministycznie przy zapisie wyniku.
- VAR w meczach w tle nie istnieje (nie wymyślać zdarzeń bez pokrycia w symulacji).
- Widzowie: model frekwencji z finansów. Sędzia: przypisany do meczu (`src/career/referees.js`).

Spójność (warunek konieczny, testy na tysiącach meczów):
- strzelec, asystent ani ukarany nie może mieć zdarzenia po minucie, w której zszedł: kontuzja z zejściem, czerwona kartka, zmiana;
- czerwona kartka po dwóch żółtych: druga żółta i czerwona w tej samej minucie, pierwsza wcześniej;
- zawodnik z czerwoną kartką nie strzela gola ani nie asystuje po wykluczeniu;
- minuty rosnąco, w zakresie meczu (z doliczonym czasem, dogrywką 91-120, karne osobno);
- liczba goli w zdarzeniach równa wynikowi, kartki równe statystykom;
- zawodnik spoza składu meczowego nie pojawia się w raporcie;
- samobój zapisany przy drużynie, której liczy się gol.
