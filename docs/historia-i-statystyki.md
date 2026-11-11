# Terminarz, historia meczów i statystyki zawodników

Kod: `src/season/history.js` (dane), `src/ui/fixturesView.js` (Pulpit i ekran „Terminarz i wyniki”),
`src/ui/playerStatsView.js` (profil zawodnika), `src/styles/history.css`. Testy: `tests/history.test.mjs`.

## Co widzi gracz

**Pulpit, panel „Terminarz”.** Trzy ostatnie wyniki, bursztynowa kreska „Dziś” i pięć najbliższych meczów
(na szerszym ekranie, gdy panel zajmuje dwa rzędy siatki, do pięciu wyników i ośmiu meczów; na początku sezonu
wolne miejsca dostają kolejne mecze). Każdy wiersz: data jak z kalendarza (numer dnia, miesiąc), herb i nazwa
rywala, znacznik rozgrywek, znacznik miejsca meczu, wynik z perspektywy drużyny gracza i kartonik W/R/P
(pusty kwadrat: mecz przed nami). Pod listą bilans sezonu. Przycisk „Pokaż wszystko” otwiera pełny ekran.
Lista „Kolejne mecze” pod tablicą meczową zniknęła, bo powtarzała te same mecze co panel.

**Ekran „Terminarz i wyniki”** (Pulpit > Pokaż wszystko, akcje `fixtures`, `fxback`, `fxseason`, `fxcomp`,
`fxvenue`). Przełącznik sezonów (bieżący i minione), filtr rozgrywek (Liga, Baraże, Puchar Polski, Superpuchar,
Puchary europejskie, Sparingi) i filtr miejsca (U siebie, Wyjazd, Neutralny), z liczbą meczów przy każdej opcji.
Obok tabela bilansu według miejsca meczu (M, W, R, P, bramki, do rozegrania). Lista z nagłówkami miesięcy,
w bieżącym sezonie z kreską „Dziś”. Przy remisie z karnymi albo po dogrywce pod wynikiem jest dopisek
(zielony, gdy drużyna przeszła dalej).

**Znaczniki.** Rozgrywki: kolor wypełnienia (liga zielony, baraże bursztynowy, Puchar Polski czerwony,
Superpuchar czerwony obrys, puchary UEFA niebieski z nazwą LM / LE / LKE, sparing szary). Miejsce: kształt,
nie tylko kolor (u siebie pełny, wyjazd obrys, teren neutralny przerywany obrys). Teren neutralny: `f.neutral`
(finał Pucharu Polski, finały UEFA, sparingi na obozie).

**Profil zawodnika, sekcja „Statystyki”** (Kadra > zawodnik, albo menu kontekstowe „Statystyki i historia”
w Kadrze, na Pulpicie i w profilu). Przełącznik „Sezon” / „Kariera” (radio i CSS, bez stanu w app.js).
Wiersze: Liga (z barażami), Puchar Polski (z Superpucharem), Puchary europejskie, Reprezentacja, Towarzyskie,
potem „Mecze klubowe o punkty” i „Razem”. Kolumny: mecze, minuty, gole, asysty, średnia ocena, żółte i czerwone
kartki (minuty i kartki od 560 px szerokości sekcji). Pod spodem „Sezon po sezonie” i „Historia klubowa”
(kluby, okresy, mecze i gole o punkty, wypożyczenia oznaczone).

## Model danych (krótkie klucze, mały zapis)

```text
game.history.m[sezon] = [{ id, d, t?, c, r?, lb?, u?, h, a, s, so?, et?, ff?, n?, me }]
  c: comp terminarza, u: ucomp UEFA, lb: etykieta (UEFA, sparing), s: wynik [gosp., goście],
  so: karne, et: dogrywka, n: teren neutralny, me: klub prowadzony przez gracza w tym meczu
p.st[grupa] = [mecze, minuty, gole, asysty, suma ocen x10, liczba ocen, żółte, czerwone]   bieżący sezon
p.history[] = { s, c, l?, apps, g, a, r, x: { grupa: ta sama tablica bez końcowych zer } }  sezony minione (20)
p.cl[] = { c, f, t?, l?, m, g }   okresy w klubach: od, do ('?' = nieznany koniec), wypożyczenie, mecze, gole
```

Grupy: `L` liga (Ekstraklasa, 1 Liga, 2 Liga, baraże), `P` Puchar Polski i Superpuchar, `E` puchary UEFA,
`R` reprezentacja (seniorska), `T` mecze towarzyskie. `p.season` bez zmian (mecze o punkty, tabele strzelców).

## Gdzie dane się zapisują

* `applyResult` (`src/season/season.js`): każdy występ do `p.st` (także sparingi), mecze o punkty do otwartego
  okresu w `p.cl`, mecz drużyny gracza do `game.history` (bez duplikatów po `id`).
* Reprezentacje (`src/season/national.js`): występ, minuty i gole jak dotąd; asysty i oceny z osobnego
  generatora z id meczu, więc wyniki, gole i powołania nie zmieniają się. Kadry spoza Europy (mecze poza
  symulacją): występ i minuty bez oceny. U21 nie wchodzi do grupy R (licznik zgrupowań zostaje w `p.intlU21`).
* Transfery i wypożyczenia (`completeTransfer`) oraz rozwiązanie kontraktu (`releasePlayer`) w
  `src/career/transfers.js`: zamknięcie i otwarcie okresu. Ruchy zarządu (`squadLimitSystem.js`) idą przez te
  same funkcje, więc nie potrzebują osobnych wywołań.
* Koniec sezonu (`src/season/rollover.js`): brakujące mecze sezonu do `game.history`, statystyki zawodników do
  `p.history` przed spadkami do III ligi i powrotami z wypożyczeń (wiersz należy do klubu, w którym zawodnik
  kończył sezon), a po wszystkich ruchach uzgodnienie okresów (powrót z wypożyczenia, wygasły kontrakt, nowi
  zawodnicy od 1 lipca). Poprawka przy okazji: wiersz `p.history` miał wcześniej etykietę nowego sezonu.

## Decyzje

* Superpuchar liczy się do grupy „Puchar Polski” (krajowy puchar, jeden mecz w sezonie). Baraże o awans
  do grupy „Liga”. Obie decyzje widać w tabeli jako dopisek pod nazwą grupy.
* „Historia klubowa” liczy mecze o punkty (L, P, E) od startu gry. Pierwszy okres zawodnika, który był w klubie
  przed startem gry, zaczyna się od „wcześniej”.
* Zawodnik przeniesiony w trakcie sezonu ma jeden wiersz sezonu (klub z końca sezonu); podział na kluby pokazuje
  historia klubowa.
* Gdy trener zmienia klub w trakcie sezonu, historia zawiera mecze obu drużyn (`me`), a mecze nowego klubu
  sprzed jego przyjścia nie trafiają do historii.

## Stare zapisy

Wszystko leniwie: `ensureHistory` (wywoływane przy wczytaniu w `ensureGameShape`) tworzy magazyn i uzupełnia
bieżący sezon z terminarza. Brak `p.st`: tabela sezonu pokazuje wiersz „Bez podziału” z różnicą między
`p.season` a meczami zapisanymi w grupach; stare wiersze `p.history` bez `x` idą do tego samego wiersza
w karierze. Brak `p.cl`: okresy odtwarzane z `p.career` (lista transferów), inaczej jeden okres w obecnym klubie.
