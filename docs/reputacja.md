# Dynamiczna reputacja zawodników i klubów

Wdrożone Nov 15, 2026. Kod: `src/career/reputation.js` (wzory, stałe `REP`), `src/career/reputationSystem.js`
(miesięczna aktualizacja, koniec sezonu, wiadomości), testy `tests/reputation.test.mjs`, kalibracja
`tools/multiseason.mjs` (linie `REP`). Wszystkie liczby modelu to [SZAC].

## 1. Co się zmieniło dla gracza

- Reputacja zawodnika (0-100) zmienia się co miesiąc (1. dnia) zamiast być stała od wygenerowania świata.
- Rośnie z grą w podstawie, formą, występami w kadrze, trofeami i pucharami. Rezerwowy i weteran tracą ją powoli.
- Zawodnik w średnim klubie Ekstraklasy nie zostanie „światową gwiazdą”: ogranicza go scena klubu. 85+ wymaga
  klubu, który latami gra w Lidze Mistrzów, albo wyjazdu do mocnej ligi.
- Kluby: marka krajowa zmienia się co sezon z wyników, osobno liczy się renoma europejska z punktów UEFA z 5 sezonów.
- Profil zawodnika (kadra i karta transferowa): poziom, liczba i trend, np. „Znany w Polsce (47) ▼ -1 w miesiącu,
  -3 w sezonie”. Asystent pisze w poczcie (priorytet info), gdy zawodnik gracza zmieni poziom (co najmniej 1 punkt
  za progiem) albo zyska lub straci 5 punktów w miesiącu.
- Ten sam wzór dla zawodników gracza i AI. Nie ma suwaków ani sztucznych sufitów poza mechaniką sceny.

## 2. Model

### 2.1 Cel miesiąca

```
A  = baseFromOvr(OVR)                                 // OVR 11,5 -> 40, 14 -> 58, 16,5 -> 82
R  = -7 + 11 * min(1, m / 0,65)                       // m: udział minut w meczach klubu z ok. 12 miesięcy
F  = clamp((śr. ocena - 6,7) * 8 * n/(n+8), -6, 8)    // forma, skurczona przy małej liczbie ocen n
   + clamp(8 * (G+A na 90 - oczekiwane dla pozycji), -2, 4) * min(1, minuty/1500)
N  = min(10, 1,5 * sqrt(mecze w kadrze A)) + min(4, 2 * turnieje finałowe)
T  = min(8, trofea z 3 sezonów z wagą 1 / 0,6 / 0,3)  // mistrz 3, PP 1,5, LK 4, LE 6, LM 10
Eu = min(6, 0,3 * mecze w pucharach UEFA z 24 miesięcy)
Ag = -4 do 20 lat, -2 w wieku 21
X  = A + R + min(18, F + N + T + Eu) + Ag
```

Oczekiwane G+A na 90: NAP 0,45, SN 0,40, OP 0,35, BP 0,30, ŚP 0,15, WB 0,12, DP 0,08, BO 0,08, ŚO 0,05, BR 0.

Statystyki: bieżący sezon (`p.st`, grupy L, P, E) plus ostatni sezon z `p.history` z wagą (12 - miesiące
bieżącego sezonu) / 12. Mianownik minut: mecze o punkty klubu (bez sparingów); do minut doliczone są 3 „mecze”
z rolą oczekiwaną z miejsca w kadrze po OVR (1-11: 0,8; 12-16: 0,4; 17+: 0,12; akademia 0), żeby przy małej liczbie
meczów (początek gry, początek sezonu) rola nie skakała. Mecze w kadrze: `p.intl.caps` (nie martwe `p.caps`).

### 2.2 Scena i kolano

```
V  = Ekstraklasa 39 + 0,25 * (współczynnik Polski - 35); 1 Liga 26; 2 Liga 17; III liga 10
     klub zagraniczny: 30 + 9 * (L - 11)
K  = 10 * ln(1 + P5 / 10)                             // P5: punkty UEFA klubu z 5 sezonów
B  = clamp(0,1 * (reputacja klubu - 60), -3, 4)        // marka krajowa
S  = V + K + B
C  = S + 6 + min(4, 0,3 * mecze w pucharach)
reprezentant (>= 3 mecze kadry w 24 mies.): C = max(C, w * (30 + 9 * (L kadry - 11)) + (1 - w) * C), w = min(1, mecze/8)
cel = X, gdy X <= C; inaczej C + 0,2 * (X - C)
cel += 0,1 * max(0, S - cel)
```

Zawodnik bez klubu: scena ostatniego klubu (a gdy go nie ma, scena z generatora `p.rs`), m = 0. Zawodnik za granicą
(`p.abroad`): scena klubu zagranicznego. Wypożyczony: scena klubu, w którym gra.

### 2.3 Tempo, zdarzenia, szum

```
rep += 0,10 * (cel - rep), gdy cel > rep;   rep += 0,06 * (cel - rep), gdy cel < rep
rep += zdarzenia miesiąca * (0,6 + S/100) + gauss(0; 0,4)   // Rng(`rep:${seed}:${YYYY-MM}`)
```

Zdarzenia (`REP_EVENTS`): hat-trick +1 (derby x1,5), gol w finale Pucharu Polski +1,5, gol w finale pucharu UEFA +3,
gol w eliminacjach UEFA +0,4, w fazie ligowej i dalej +0,6, zawodnik meczu w pucharach +0,6, debiut w kadrze A +2,
gol dla kadry +0,8, gol na turnieju finałowym +2, mistrzostwo Polski +2, król strzelców ligi +3, transfer do większej
sceny + clamp(0,25 x różnica scen, 0, 4), czerwona kartka za przemoc -1,5, spadek z ligi -2.

### 2.4 Kluby

- Renoma europejska P5: punkty w sezonie = wygrana 2, remis 1 (eliminacje połowa) + faza ligowa LM 4, LE 2, LK 1
  + 1 za każdą rundę pucharową. Start: współczynnik z danych (Lech 31, Jagiellonia 28, Raków 22), inne polskie kluby
  `max(0, (prestiż - 5) x 5)` (Legia 25, Wisła Kraków 20), rozłożony równo na 5 sezonów.
- Marka krajowa (skala `clubReputation`, na której skalibrowane są transfery): co sezon
  `odchylenie += 0,25 x (clamp(0,8 x (oczekiwane miejsce - miejsce) + 4 x mistrz + 2 x PP + 0,3 x K, -10, 12) - odchylenie)`,
  reputacja klubu = prestiż x 7 + bonus ligi + odchylenie (najwyżej 100). Awans i spadek zmieniają bonus ligi od razu.
  Oczekiwane miejsce: ranking siły L w lidze (jak cel zarządu).

### 2.5 Generator i stare zapisy

- Generator świata liczy reputację tym samym wzorem (drugie przejście w `generateClubSquad`, rola z miejsca w kadrze,
  forma neutralna). Szum startowy losowany w tym samym miejscu strumienia RNG co wcześniej (sd 2 zamiast 3), więc
  światy z tym samym ziarnem różnią się tylko reputacją. Pierwsza aktualizacja (1 sierpnia): średnia zmiana ok. 0,35,
  p95 ok. 0,9.
- Stare zapisy: `ensureReputation` dodaje `game.repState`, nie zmienia `p.rep`; reputacja dochodzi do nowego celu
  łagodnie (10 % albo 6 % luki na miesiąc).

## 3. Decyzje właściciela (Nov 15, 2026)

1. Nad kolanem sceny zostaje 20 % nadwyżki.
2. Sława się „klei”: wzrost 10 % luki na miesiąc, spadek 6 %.
3. Rezerwowi tracą reputację (pełna kara za brak minut).
4. Marka krajowa klubu zmienia się co sezon (wyniki wobec oczekiwań, trofea, puchary), do tego renoma europejska z P5.
5. Bez zasiewania historycznych meczów w kadrze: wszyscy startują z danych gry (reprezentanci zyskują w trakcie gry).
6. Polski klub, który latami wygrywa ligę i gra w Lidze Mistrzów (P5 ok. 90-100), może mieć zawodników z reputacją 85-89.
   Premie z trofeów i pucharów zostają bez przycinania, mimo że propozycja zakładała 85+ dopiero przy P5 ok. 130.

## 4. Kalibracja (Widzew, ziarno 5, 10 sezonów, `node tools/multiseason.mjs widzew 5 10`) [SZAC]

Reputacja regularnych (>= 1800 minut w lidze), p10/p50/p90:

| Moment | Ekstraklasa | 1 Liga | 2 Liga | III liga | EK z rep >= 70 | Najwyższe P5 |
|---|---|---|---|---|---|---|
| Przed zmianą, po 1 sezonie | 36/46/56 | 25/34/43 | 16/23/31 | 11/17/26 | 1 | brak |
| Przed zmianą, po 10 sezonach | 34/42/53 | 23/32/41 | 17/24/31 | 10/18/24 | 0 | brak |
| Po zmianie, po 1 sezonie | 34/46/56 | 25/32/40 | 18/22/25 | 11/15/17 | 0 | Lech 31 |
| Po zmianie, po 5 sezonach | 33/45/60 | 24/32/40 | 16/21/27 | 12/15/17 | 1 | Lech 46 |
| Po zmianie, po 10 sezonach | 34/46/61 | 27/32/41 | 15/21/25 | 12/15/17 | 8 | Lech 95 |

- Inflacja: p50 regularnych EK przez 10 sezonów 44-46 (kryterium 44-52). Zawodników EK z rep >= 70: 0-2 na sezon,
  dopóki żaden polski klub nie ma P5 >= 60; potem 6-8 (Lech z P5 68-103 po latach w Lidze Mistrzów). Dwaj
  najlepsi zawodnicy Lecha doszli przy P5 ok. 90-100 do 85-89 (zdarzenia z pucharów i mistrzostw dokładają się nad
  celem i wygasają powoli).
- Regularni EK w wieku 22+ z rep < 25: 0-1 na sezon (przed zmianą też 0-1).
- Ławka Ekstraklasy spadła (wszyscy zawodnicy EK p50 z 41 do 36-38), dlatego tygodniowa szansa oferty z zagranicy
  `FOREIGN.pBase` wzrosła z 0,025 do 0,033 (`docs/transfery.md`).
- Sprzedaże z EK za granicę na sezon (`tools/transfery-kalibracja.mjs`, 3 sezony, cel 25-40): przed zmianą
  36/34/27 (Widzew, ziarno 5) i 36/26/26 (Lech, ziarno 7); po zmianie 39/34/26 i 38/26/32.
- Koszt: aktualizacja ok. 4500 zawodników raz w miesiącu ok. 25-30 ms.

## 5. Uproszczenia i otwarte sprawy

- Afera dyscyplinarna zawodnika (-1) nie jest podłączona: prasa w grze karze trenera, nie zawodników.
- Wartość rynkowa nie używa reputacji (jak w propozycji); reputacja działa przez cenę wywoławczą, zgodę i pensję.
- LATER z propozycji: wolny dryf prestiżu klubów, ujednolicenie skali `clubReputation` z europejską (dziś Legia =
  Real = 95), „medialność” zawodnika z osobowości, wykres historii reputacji.
