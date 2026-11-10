# Manager Piłkarski

Prywatna gra managerska w przeglądarce (PWA), przede wszystkim na telefon, z obsługą PC. Ekstraklasa, 1 Liga, 2 Liga, Puchar Polski, Superpuchar, LM, LE, LK i reprezentacje.

Plan i specyfikacja: `docs/PLAN.md`, `docs/ekspert_sedzia.md`, `docs/ekspert_futbol.md`.

## Uruchomienie

Gra nie wymaga budowania. Wystarczy serwer plików w katalogu projektu:

```bash
npm start
```

Potem otwórz `http://localhost:8080`. Na telefonie w tej samej sieci Wi-Fi otwórz adres komputera z portem 8080. Instalacja na ekran główny działa z adresu HTTPS albo `localhost`.

## Testy

```bash
npm test
```

## Struktura

```text
index.html, manifest.webmanifest, sw.js   powłoka PWA i tryb offline
src/app.js                                ekrany i nawigacja
src/core/                                 RNG z ziarnem, zapis IndexedDB
src/config/                               reguły rozgrywek, kalendarz 2026/27
src/data/                                 kluby polskie (później UEFA i reprezentacje)
src/ui/                                   herby, pomocnicze funkcje DOM
src/styles/                               czcionki, tokeny, style
assets/crests/                            miniaturki herbów (128 i 48 px)
assets/fonts/                             Barlow, Barlow Condensed, Doto (SIL OFL 1.1)
tests/                                    testy node --test
tools/                                    kalibracja silnika, podgląd herbów
```

## Herby

28 herbów pochodzi z publicznego repozytorium `luukhopman/football-logos`. Pozostałe kluby mają tarcze zastępcze w barwach klubu (`src/ui/crest.js`). Nowy herb wystarczy dodać jako `assets/crests/<id>.webp` i `<id>-48.webp` oraz dopisać `id` do `CRESTS_AVAILABLE`.
