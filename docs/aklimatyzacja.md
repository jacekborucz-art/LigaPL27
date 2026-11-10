# Aklimatyzacja zawodnika po transferze

Stan na Nov 10, 2026. Kod: `src/career/acclimatization.js`, testy: `tests/clublife.test.mjs`.

## Co mówią badania

- Analiza Uniwersytetu Manchesterskiego na danych Opta: zawodnik zmieniający ligę potrzebuje nawet około pół sezonu, żeby wejść na swój poziom. Czas zależy od ligi, z której przychodzi, i od pozycji ([University of Manchester](https://www.manchester.ac.uk/discover/news/university-students-accurately-track-time-taken-for-new-premier-league-stars-to-find-their-feet), [MUB](https://www.mub.eps.manchester.ac.uk/science-engineering/?p=2094)).
- Praca z HSE (6 lig, 2000/01 do zimy 2023, regresja OLS): wspólny język z krajem klubu wyraźnie przyspiesza adaptację zawodników z pola (nie bramkarzy). Kwota transferu i wiek działają nieliniowo. To praca dyplomowa, więc traktujemy ją ostrożnie ([HSE](https://hse.ru/en/edu/vkr/925074571)).
- Badanie Kühne Logistics University z TU München: liczy się czas na wdrożenie. Przy transferze w trakcie sezonu (mniej czasu) adaptacja w mocnej drużynie idzie gorzej ([idw](https://idw-online.de/de/news806548)).
- Bariera językowa i brak wsparcia społecznego obniżają formę ([The Conversation](https://theconversation.com/harder-than-id-expected-top-players-on-why-joining-premier-league-from-abroad-is-so-tough-166309)).

## Model w grze [SZAC]

| Czynnik | Wpływ na czas pełnej aklimatyzacji |
|---|---|
| Zmiana klubu w Polsce | 42 dni, start od 35 % |
| Przyjazd z zagranicy | 110 dni, start od 10 % |
| Powrót Polaka z zagranicy | x0,6 |
| Język słowiański (Czechy, Słowacja, Ukraina, Bałkany) | x0,85 |
| Kraj spoza Europy (inny język i kultura) | x1,35 |
| Wiek do 20 lat | x1,1 |
| Wiek od 30 lat | x0,9 |
| Wrażliwy / Lider / Spokojny | x1,3 / x0,85 / x0,9 |
| Rodacy w szatni | x0,85 |
| Transfer w trakcie sezonu (IX-XI, I-III) | x1,15 |
| Bramkarz z zagranicy (język mniej ważny) | x0,9 |

- Postęp: codziennie 100 / liczba dni, a każdy rozegrany mecz dodaje 2,5 punktu.
- Skutek w meczu: modyfikator `acclim` w rejestrze silnika, od -0,6 punktu (brak aklimatyzacji) do 0. Działa w pełnym silniku i w meczach w tle.
- Widać ją w profilu zawodnika (poziom, data pełnej aklimatyzacji, powody) i w Kadra, Rozmowy. Po zakończeniu gracz dostaje wiadomość od asystenta.
