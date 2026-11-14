# Edytor i datapack

Prosty edytor gry: nazwy klubów, stadion, pojemność, finanse klubu oraz dane i atrybuty zawodników. Każda zmiana działa od razu w bieżącej grze i trafia do datapacku, który można zapisać do pliku i wczytać w innej grze.

Kod: `src/career/editor.js` (logika, walidacja, datapack), `src/ui/editorView.js` (ekran), `src/styles/editor.css`, obsługa w `src/app.js` (ekran `editor`). Testy: `tests/editor.test.mjs`.

## Jak używać

1. W grze otwórz **Opcje** (na PC przycisk u dołu bocznego menu, na telefonie menu w nagłówku, potem Opcje).
2. Kliknij **Edytor**. Okno się zamyka, otwiera się pełny ekran edytora. **Wróć do gry** (albo Escape) wraca do gry.
3. Zakładki:
   - **Kluby**: lista klubów z kadrą w grze, filtr ligi (Ekstraklasa, 1 Liga, 2 Liga, Wszystkie) i wyszukiwarka. Kliknięcie klubu otwiera formularz: nazwa, nazwa skrócona, nazwa stadionu, pojemność stadionu, saldo, budżet transferowy, budżet płac (tygodniowo). Pod formularzem kadra klubu; kliknięcie zawodnika otwiera jego formularz w tym samym oknie (przycisk „Wróć do klubu”).
   - **Zawodnicy**: wyszukiwanie po imieniu i nazwisku, filtr klubu i pozycji, najwyżej 100 wyników (od najwyższego OVR). Formularz: imię, nazwisko, narodowość, pozycja, data urodzenia, wszystkie atrybuty 1-20 w grupach jak w grze (techniczne, mentalne, fizyczne, bramkarskie) i potencjał (ukryty POT, 1-20, z dokładnością do 0,1).
   - **Datapack**: liczba zmienionych klubów i zawodników, eksport do pliku, wczytanie pliku, wyczyszczenie datapacku.
4. **Zapisz zmiany** stosuje formularz w grze i zapisuje grę w slocie. Enter w polu formularza działa tak samo.

Na PC lista jest po lewej, formularz po prawej. Na telefonie jedna kolumna: lista, a po wyborze formularz z przyciskiem „Wróć do listy”.

## Walidacja

| Pole | Zasada |
|---|---|
| Nazwa klubu | od 2 do 40 znaków |
| Nazwa skrócona | od 2 do 5 liter lub cyfr |
| Nazwa stadionu | do 60 znaków, puste pole = brak nazwy |
| Pojemność stadionu | liczba całkowita od 500 do 100 000 |
| Saldo | liczba całkowita od -1 000 000 000 do 10 000 000 000 zł |
| Budżety (transferowy, płac) | liczba całkowita od 0 do 10 000 000 000 zł |
| Imię, nazwisko | od 1 do 40 znaków |
| Narodowość, pozycja | tylko z listy gry (`NAT_NAMES`, `POS_NAMES`) |
| Data urodzenia | RRRR-MM-DD, wiek w dniu gry od 15 do 45 lat |
| Atrybuty | liczby całkowite 1-20 |
| Potencjał | 1-20, jedno miejsce po przecinku |

W polach liczbowych formularza można pisać spacje (np. `25 000`). Wszystkie teksty trafiają do HTML przez `esc()`.

## Co zmienia edycja

- **Nazwa, skrót, stadion**: pola wspólnych obiektów klubów (`CLUBS_PL`, `CLUBS_L3`). Te obiekty są stanem modułu, nie zapisu gry, dlatego `applyPack(game)` (wołane w `ensureGameShape`, czyli przy każdym wczytaniu gry) najpierw przywraca oryginały zdjęte przy starcie modułu, a potem nakłada zmiany z `game.editor`. Ekran startowy i nowa kariera wołają `restoreOriginals()`, więc inny zapis widzi oryginalne nazwy. Nazwa stadionu pojawia się w informacjach o meczu (zamiast „Stadion gospodarzy”) i w widoku klubu.
- **Pojemność**: przez infrastrukturę (`src/career/infrastructure.js`). Edytor ustawia rozbudowę trybun `game.infra.clubs[id].seats` = pojemność minus pojemność z danych klubu (może być ujemna), potem przelicza plan sezonu (`applyPlan`: `plan.cap`, frekwencja, bilety). Dzięki temu pojemność zgadza się w finansach, dniu meczowym, licencji i ekranie infrastruktury, także w kolejnych sezonach (nowy plan dostaje te same `seats`). Późniejsza rozbudowa trybun w grze dodaje się do tej wartości. Bez stanu infrastruktury edytor zmienia tylko `plan.cap` i ogranicza `plan.att`.
- **Saldo i budżety**: `game.finance.clubs[id].balance`, `transferBudget`, `wageBudget` wprost (bez wpisu w księdze). Klub bez finansów w grze (np. z III ligi) ma tylko nazwy i stadion.
- **Zawodnik**: `first`, `last` i `name`; `nat` i `eu`; `pos` (wariant profilu znika, gdy nie pasuje do nowej pozycji); `birthDate` i `age` (wiek w dniu gry, `ageAt`); `attr`; `hidden.POT`. Po zapisie OVR liczy się funkcją gry `ovrAt(p.attr, p.pos, offsetsFor(p))` (ta sama co w rozwoju zawodników), a wartość rynkowa `marketValue` (zawodnicy polskich klubów). Zmiana zawodnika z klubu gracza odświeża skład i trening.

Liczby (finanse, pojemność, atrybuty) są częścią zapisu gry, więc ustawia się je raz: przy edycji albo imporcie.

**Przywróć oryginał** (klub): wracają nazwa, skrót i stadion z danych gry, klub znika z datapacku; finanse i pojemność zostają takie, jak teraz. **Usuń z datapacku** (zawodnik): wpis znika, dane zawodnika w grze zostają. **Wyczyść datapack**: to samo dla wszystkich wpisów.

## Format datapacku

Stan w grze:

```json
{ "v": 1, "seed": 123456, "clubs": { "legia": { "name": "Legia Testowa", "stadium": "Stadion Wojska Polskiego", "capacity": 31000 } },
  "players": { "legia-3": { "first": "Jan", "last": "Kowalski", "attrs": { "POD": 18 }, "pot": 17.5 } } }
```

Plik (`Eksportuj datapack`, nazwa tylko ASCII, np. `LigaPL27-datapack-2026-10-20.json` z datą w grze):

```json
{
  "type": "ligapl27-datapack",
  "v": 1,
  "seed": 123456,
  "created": "2026-11-14T10:00:00.000Z",
  "clubs": { "[id klubu]": { "name": "", "short": "", "stadium": "", "capacity": 0, "balance": 0, "transferBudget": 0, "wageBudget": 0 } },
  "players": { "[id zawodnika]": { "first": "", "last": "", "nat": "POL", "pos": "NAP", "birthDate": "2000-03-15", "attrs": { "WYK": 15 }, "pot": 16.5 } }
}
```

Zapisywane są tylko zmienione pola. Klucze atrybutów jak w `src/data/attributes.js` (`POD`, `DRY`, `WYK`, ...).

### Pełny datapack

Przycisk „Eksportuj wszystkie kluby i zawodników” zapisuje plik `LigaPL27-datapack-pelny-<data>.json` z bieżącymi
danymi wszystkich klubów z kadrą (wszystkie pola klubu) i wszystkich zawodników świata gry (kluby polskie, zagranica,
wolni zawodnicy), razem z edytowanymi. Format jak wyżej, z `"full": true`; zawodnik ma dodatkowo `club` (nazwa klubu)
i `ovr`, tylko do czytania (import je pomija). Pole, które nie przeszłoby walidacji importu, jest pomijane, więc plik
zawsze da się wczytać. Plik jest bez wcięć: ok. 1,6 MB dla 126 klubów i ok. 4200 zawodników.

Wczytanie pełnego pliku działa jak zwykłego: do datapacku gry trafiają tylko pola, które różnią się od stanu gry
(wczytanie do tej samej gry niczego nie zmienia). Limit rozmiaru pliku przy imporcie: 40 MB.

## Wczytanie datapacku

- Plik musi mieć `type: "ligapl27-datapack"` i `v: 1`, inaczej jest odrzucony z komunikatem (np. zapis gry: „To nie jest datapack LigaPL 27”).
- Nieznane klucze są pomijane. Zła wartość znanego pola (typ albo zakres jak w tabeli walidacji; liczby muszą być liczbami JSON) odrzuca cały plik z nazwą klubu lub zawodnika i pola.
- Kluby: stosowane zawsze (identyfikatory klubów są wspólne dla wszystkich gier), nieznane identyfikatory pomijane.
- Zawodnicy: tylko gdy `seed` pliku = ziarno gry, bo zawodnicy są losowani z ziarna świata. W innym świecie: „Zawodnicy pominięci: inny świat gry”. Zawodników, których już nie ma w grze, edytor pomija; datę urodzenia poza zakresem wieku też.
- Zmiany łączą się z datapackiem gry, gra zapisuje się od razu, a edytor pokazuje podsumowanie (ile klubów i zawodników zastosowano i pominięto).

## Uproszczenia

- Ekran startowy pokazuje oryginalną nazwę klubu przy slocie zapisu (nazwy z datapacku nakłada dopiero wczytanie gry).
- Szacunek pojemności bez gry (`stadiumCapacity`, np. w ocenie sponsorów i karcie klubu przy wyborze kariery) zostaje z danych klubu.
- Zawodnik nie ma przycisku przywrócenia oryginalnych danych (gra ich nie przechowuje); wpis można tylko usunąć z datapacku.
