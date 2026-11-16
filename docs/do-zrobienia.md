# Do zrobienia w tym tygodniu

Stan na Nov 16, 2026. Kod: `src/career/weeklyTodo.js` (logika), `src/ui/todoView.js` (widok), `src/styles/todo.css`,
testy `tests/weeklyTodo.test.mjs`. Projekty źródłowe: konsultacja logiki i projekt graficzny z Nov 16, 2026.

## Decyzje właściciela (Nov 16, 2026)

1. Nowa rola w sztabie: **Kierownik drużyny** (jakość 1-20, jak inne role). Ma ją każdy klub (także AI), widać ją
   w Trening, Sztab. Stare zapisy dostają kierownika przy wczytaniu (`ensureTraining`), z ziarna gry: ta sama wartość,
   jaką dostałaby nowa gra; pozostałe role bez zmian (kierownik losowany jako ostatni). Kierownik zgłasza sprawy
   organizacyjne (kontrakty, licencje, okno, obozy), a jego jakość decyduje o ich dokładności.
2. Słaby sztab tylko zapomina, przypomina później albo źle ocenia pilność. **Bez fałszywych alarmów**: lista jest
   zawsze podzbiorem spraw prawdziwych.
3. „Ten tydzień” = tydzień kalendarzowy poniedziałek-niedziela (`mondayOf`). Pasek dni pokazuje pon-niedz z dzisiejszym
   dniem i dniem meczu. Sprawy z terminem po niedzieli trafiają do grupy „Później”, bez terminu do „Bez terminu”.
4. Bez ręcznego „Zrobione”: sprawa znika sama, gdy przestaje być aktualna (i trafia do „Załatwione w tym tygodniu”).
   Jest „Odłóż”.

Miejsce: panel „Ten tydzień” na Pulpicie (do 3 spraw, na szerokim PC 4) i pełny widok w zakładce Pulpit
(„Wszystko (n)”, powrót „Wróć do pulpitu”). Bez ósmej zakładki. Liczba na przycisku Pulpit = sprawy pilne (gdy gracz
jest w innej zakładce, powyżej 9 „9+”). Lista nie dubluje poczty: decyzje prowadzą do wiadomości, reszta do ekranów gry.

## Model

- Liczona na żądanie, tylko dla klubu gracza, bez systemu dnia. Pamięć podręczna (WeakMap) z podpisem stanu
  (data, poczta, rozmowy, oferty, kadra, sztab, odłożenia). Ok. 3-6 ms na liczenie [SZAC].
- **Fakty** (zawsze widoczne, dokładne, bez opóźnienia): decyzje z poczty, oferty z datą ważności, prośby o transfer,
  limit kadry, opcje i propozycje wypożyczeń, ostatnie 3 dni okna transferowego, ostatnie 3 dni na rezerwację obozu,
  zawodnicy, z którymi inne kluby mogą już rozmawiać (od 1 stycznia), kontrakt kończący się w 3 dni.
- **Obserwacje sztabu** (soczewka): ziarno `do-zrobienia:{seed}:{poniedziałek}:{klucz}`, więc lista jest stała
  w tygodniu i po wczytaniu zapisu. Jakość qe:
  kierownik drużyny = jego jakość; zebranie = 0,5 TAK + 0,5 OCE; rozmowa = OCE (wrażliwy: 0,7 OCE + 0,3 asystent);
  przeciążenie = 0,7 fizyczny + 0,3 OCE.
  - zauważenie: `clamp(0,40 + 0,03 qe + 0,20 przy sprawie poważnej, 0,45, 0,97)`; sprawa wisząca n tygodni:
    przeoczenie `(1 - zauważenie) x 0,5^n`;
  - spóźnienie: `|N(0; 0,25 x (20 - qe))|` dni od początku sprawy (ziarno bez tygodnia);
  - zła pilność: `clamp(0,38 - 0,017 qe, 0,04, 0,40)`, 60 % w dół, 40 % w górę, nigdy do „pilne”;
  - limit pozycji na członka sztabu: `2 + round(q / 5)`;
  - pewność (tekst i kreski): z `estimateSd(qe)` jak w raportach (wysoka od 14, średnia 8-13, niska poniżej 8).
  - Sprawa pokazana w tym tygodniu zostaje do końca tygodnia (sztab nie odwołuje zgłoszenia).

| Jakość | zauważy (zwykła / poważna) | przeoczona do niedzieli (z opóźnieniem) | zła pilność | śr. opóźnienie | pozycji |
|---|---|---|---|---|---|
| 5 | 55 % / 75 % | ok. 49 % | 30 % | ok. 3 dni | 3 |
| 10 | 70 % / 90 % | ok. 30 % | 21 % | ok. 2 dni | 4 |
| 15 | 85 % / 97 % | ok. 15 % | 12,5 % | ok. 1 dzień | 5 |
| 20 | 97 % / 97 % | ok. 2,5 % | 4 % | 0 dni | 6 |

## Katalog spraw

| Klucz | Rodzaj | Zgłasza | Priorytet | Termin | Akcja |
|---|---|---|---|---|---|
| `decyzja:{id}` | fakt | nadawca wiadomości | pilne (zatrzymuje Dalej), opcjonalne: ważne / do rozważenia | dziś | wiadomość |
| `oferta:{id}`, `sponsor:{id}` | fakt | nadawca | pilne do 2 dni, inaczej ważne | data ważności | wiadomość |
| `prosba:{pid}`, `prosba-oficjalna:{pid}` | fakt | agent / dyrektor sportowy | ważne, pilne 3 dni przed oficjalną prośbą | po 28 dniach | wiadomość / karta |
| `wyp-opcja`, `wyp-minuty`, `praca` | fakt | dyrektor sportowy / agent | ważne / do rozważenia | koniec wypożyczenia / 7 dni | wiadomość |
| `limit-kadry:{id}` | fakt | Zarząd | ważne, pilne do 3 dni | termin zarządu | Transfery |
| `okno:{koniec}` | 4-7 dni: kierownik, 0-3 dni: fakt | kierownik drużyny | ważne, pilne do 2 dni | koniec okna | Transfery |
| `oboz:{połowa}` | od 14 dni przed okresem przygotowawczym: kierownik, ostatnie 3 dni: fakt | kierownik drużyny | do rozważenia / ważne / pilne | ostatni dzień rezerwacji | Trening, Obozy |
| `kontrakty-czerwiec` | fakt | kierownik drużyny | ważne | | Transfery, Kontrakty |
| `kontrakt:{pid}` | kierownik (fakt 3 dni przed końcem) | kierownik drużyny | ważne: top 11 i do pół roku | koniec kontraktu | karta kontraktu |
| `licencja` | kierownik | kierownik drużyny | do rozważenia | | Klub, Infrastruktura |
| `zebranie` | asystent | asystent | ważne przy złej serii lub 3+ niezadowolonych | niedziela | Kadra, Rozmowy |
| `rozmowa:{pid}` | asystent | asystent | ważne: prośba o transfer, niezadowolenie, morale do 5, zaniedbanie | | Kadra, Rozmowy, okno rozmowy |
| `przeciazenie:{pid}` | fizyczny | trener przygotowania fizycznego | ważne: pierwsza jedenastka i mecz do 3 dni | dzień przed meczem | Trening, zawodnik |

## Odkładanie

„Przypomnij jutro”, „Przypomnij w poniedziałek”, „Nie przypominaj w tej sprawie” (tylko obserwacje; wraca, gdy sprawa
zacznie się od nowa). Pilnych nie można odkładać; faktów z terminem najwyżej do 3 dni przed terminem. Odłożona sprawa,
która stanie się pilna, wraca od razu. Lista „Odłożone” z przyciskiem „Przywróć”.

## Zapis

`game.todo = { v, club, rev, hide, seen: { week, items }, since }`: odłożenia, sprawy pokazane w tym tygodniu,
początek obserwacji. Zmiana klubu czyści stan. Widok zapisuje tylko to (`noteTodoSeen`).

## Uproszczenia i otwarte

- Bez kartek przed pauzą, obietnic roli, ciężkich nóg, znużenia treningiem, przewidywalności taktyki i prekontraktu
  „ostatnia szansa” (SHOULD z projektu logiki).
- Pasek dni nie przewija do grup (dni to etykiety, nie przyciski).
- Kolejność kontraktów do przedłużenia bez błędu oceny zawodnika (błąd daje tylko pilność i przeoczenie).
- Kluby AI mają kierownika drużyny, ale jego jakość nie wpływa na ich grę (lista jest tylko dla gracza).
