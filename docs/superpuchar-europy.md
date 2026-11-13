# Superpuchar Europy

Kod: `src/season/superCupEU.js`. Obsługa dzienna: `superCupEUDay` w `src/season/europe.js`. Testy: `tests/superCupEU.test.mjs`.

## Zasady

- Zwycięzca Ligi Mistrzów kontra zwycięzca Ligi Europy poprzedniego sezonu, jeden mecz na neutralnym stadionie.
- Termin: środa między 9 a 15 sierpnia, 21:00 (2026: 12 sierpnia, 2027: 11 sierpnia, jak u UEFA).
- Przy remisie od razu rzuty karne, bez dogrywki.
- Premie: finalista 4 mln euro, zdobywca 5 mln euro (stała kwota UEFA podawana od 2024; kwoty na kolejne edycje niepotwierdzone).
- Mecz bez polskich klubów rozgrywa się w tle (siła drużyn jak w innych meczach UEFA), wynik trafia do poczty i do widoku Rozgrywki (zakładki Liga Mistrzów i Liga Europy).
- Polski klub z kadrą w grze (po wygraniu Ligi Mistrzów albo Ligi Europy) dostaje mecz w terminarzu: na żywo albo szybka symulacja, jak inne mecze UEFA.

## Stadiony

Prawdziwe, wyznaczone przez UEFA:

| Rok | Stadion | Miasto |
|---|---|---|
| 2026 | Red Bull Arena (Stadion Salzburg) | Salzburg, Austria |
| 2027 | Johan Cruyff ArenA | Amsterdam, Holandia |
| 2028 | Astana Arena | Astana, Kazachstan |

Edycja 2026 w rzeczywistości: Paris Saint-Germain - Aston Villa 2:1 (12 sierpnia 2026). W grze ten mecz jest rozgrywany od nowa, bo kariera zaczyna się 1 lipca 2026.

Od 2029: losowanie (stałe dla danego roku) z listy dużych stadionów europejskich, bez powtórki stadionu w ciągu 6 lat: Wembley, Camp Nou, Santiago Bernabéu, Signal Iduna Park, Stade de France, Allianz Arena, San Siro, Stadion Olimpijski im. Atatürka, Olympiastadion Berlin, Old Trafford, Stadio Olimpico, Estadio Metropolitano, Puskás Aréna, Estádio da Luz, Tottenham Hotspur Stadium, Veltins-Arena, PGE Narodowy, Johan Cruyff ArenA. Pojemności w kodzie są przybliżone.

## Źródła

- UEFA: [2026 UEFA Super Cup to take place at Stadion Salzburg](https://www.uefa.com/uefasupercup/news/029d-1eb2d4a75326-6cd3e230e9bb-1000--2026-uefa-super-cup-to-take-place-at-stadion-salzburg-in-au)
- UEFA: [2027 and 2028 Super Cup venues confirmed](https://www.uefa.com/uefasupercup/news/02a9-2198b459d375-97fdf1034979-1000--2027-and-2028-super-cup-venues-confirmed/)
- The Star (Reuters): [PSG retain UEFA Super Cup with 2-1 win over Aston Villa](https://www.thestar.com.my/sport/football/2026/08/13/soccer-psg-retain-uefa-super-cup-with-2-1-win-over-aston-villa)
- Wikipedia: [UEFA Super Cup](https://www.wikipedia.org/wiki/UEFA_Supercup) (premie)
