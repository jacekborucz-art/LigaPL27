# Dzień meczowy: studio i odprawy

Stan na Nov 10, 2026. Specyfikacja segmentów wokół symulacji meczu: studio przedmeczowe, odprawa przedmeczowa, odprawa w przerwie, studio pomeczowe, odprawa pomeczowa (z konferencją prasową) oraz relacja trener-zawodnik. Sam mecz liczy silnik; ten moduł dostarcza mu dane wejściowe (zaangażowanie Z, ryzyko kartek, nerwowość) i czyta jego zdarzenia.

| Plik | Zawartość |
|---|---|
| `src/match/studio.js` | Studio przed meczem i po meczu, szanse 1X2, raport asystenta, nagłówki mediów, wiadomości do poczty |
| `src/match/briefings.js` | Przemowy, rozmowy indywidualne, reakcje, relacja trener-zawodnik, konferencja prasowa, AI |
| `tests/briefings.test.mjs` | 20 testów (`npm test`) |

Źródła reguł: `docs/ekspert_futbol.md` rozdz. 5 (zaangażowanie, przemowy), 6.1 (d, e), 9.1, 9.6, 9.7; `docs/ekspert_sedzia.md` A2 i B8; `docs/PLAN.md` rozdz. 2.4, 3, 3.1, 7.

**Zasady techniczne**
- Czyste funkcje. Wejście to zwykłe obiekty, wynik to nowy obiekt JSON. Nic nie jest mutowane; zapis w zawodniku robi `applyBriefing(player, wynik)`.
- Losowość tylko z ziarna (`seed + faza + id zawodnika`), więc wczytanie gry nie zmienia odprawy.
- Gracz nigdy nie widzi liczb odprawy: tylko ikonę, etykietę i krótki tekst. Liczby trafiają do pola `engine`.
- Koszt: kilkanaście działań na zawodnika, bez pętli po świecie. Studio dostaje tylko dwie drużyny, tabelę i listę zdarzeń.
- Wartości balansowe oznaczone w kodzie `[SZAC]`.

**Moduły, z których korzystamy (bez liczenia po swojemu)**

| Moduł | Do czego |
|---|---|
| `career/personality.js` | Cechy charakteru (ego, temperament, profesjonalizm, ambicja, cierpliwość) przez adapter `traitsOf` |
| `career/negotiation.js` | `relationWith`, `currentGrudge`: zaufanie i uraza są tym samym polem co w negocjacjach |
| `career/morale.js` | `applyMorale`, `EVENT_DELTA`, `MORALE.START`: zapis skutków odprawy pomeczowej |
| `engine/quickSim.js` | `expectedGoals`, `outcomeProbs`, `QS.RHO`: szanse 1X2 w studiu |
| `engine/teamStrength.js` | `teamRating`, `pickXI`: przewidywane składy i rozbicie siły w raporcie asystenta |
| `engine/matchStats.js` | `statsFromEvents`: statystyki i wynik po meczu wyłącznie ze zdarzeń |
| `core/inbox.js` | `createMessage`: nagłówek dnia, reakcja zarządu, raport medyczny |
| `engine/positions.js` | `assessLineup`: ostrzeżenia o grze poza pozycją, gdy gracz ustawił skład |

## 1. Przepływ dnia meczowego

```text
Studio przedmeczowe -> Odprawa przedmeczowa -> 1. połowa (silnik)
                                                    |
                      Odprawa w przerwie <----------+
                              |
                              v
                      2. połowa (silnik) -> Studio pomeczowe -> Odprawa pomeczowa -> Konferencja (opcja) -> Poczta
```

| Ekran | Co gracz widzi | Decyzje gracza | Funkcja | Wynik dla gry |
|---|---|---|---|---|
| Studio przedmeczowe | Zapowiedź, forma, tabela, bilans, absencje, przewidywane składy, kluczowi rywale, pogoda, murawa, sędzia, frekwencja, szanse 1X2 w %, raport asystenta, oczekiwania zarządu i kibiców, 2 nagłówki | Tylko „Dalej” | `preMatchStudio(ctx)` | `forBriefing`, `forPost`, wiadomość `preMatchMessages` |
| Odprawa przedmeczowa | Podpowiedź asystenta, 6 przemów z cytatem, lista zawodników z reakcją (ikona i tekst), odpowiedzi w rozmowach | 1 przemowa, maks. 3 rozmowy | `assistantAdvice('pre')`, `preMatchBriefing` | `engine.zStart`, `cardRisk`, `nerves`, `defBonus`; relacje; pamięć przemów |
| Przerwa | Wynik, statystyki 1. połowy, momentum, oceny, opis sytuacji od asystenta | 1 przemowa, maks. 3 rozmowy | `assistantAdvice('half')`, `halftimeBriefing` | Nowy poziom Z na 2. połowę |
| Studio pomeczowe | Wynik i wynik do przerwy, kluczowe momenty, zawodnik meczu, oceny, statystyki z werdyktem xG, kontrowersje, reakcje zarządu, kibiców i mediów, tabela po meczu, nowe kontuzje i pauzy, nagłówek dnia | Tylko „Dalej” | `postMatchStudio(ctx)` | `forBriefing`, historia nagłówków, `postMatchMessages` |
| Odprawa pomeczowa | Reakcje drużyny i zawodników, strzałka morale drużyny, ewentualny konflikt | 1 przemowa, maks. 3 rozmowy (pochwała albo krytyka) | `postMatchBriefing` | Morale (przez `applyMorale`), relacje, konflikty |
| Konferencja (opcja) | 2-3 pytania, po 3 odpowiedzi | Wybór odpowiedzi | `pressConference`, `answerPressConference` | Zmiana nastroju kibiców, zaufania zarządu, morale |

## 2. Studio przedmeczowe

### 2.1 Ranga meczu (0-3)

| Ranga | Kiedy | Etykieta |
|---|---|---|
| 3 | Finał (`stage: 'final'`), Superpuchar | Finał |
| 2 | Puchary UEFA; derby (ten sam `region` klubu, bez pary klub i jego rezerwy); klasyk (Legia-Lech, Legia-Widzew, Lech-Wisła, Legia-Wisła, Górnik-Legia); od połowy sezonu mecz o utrzymanie (obie drużyny najwyżej 3 miejsca nad strefą i różnica do bezpiecznego miejsca do 4 pkt) albo o mistrzostwo (miejsca 1-2, różnica do 4 pkt) | Derby, Klasyk, Mecz o utrzymanie, Mecz o mistrzostwo, Mecz w pucharach UEFA |
| 1 | Puchar Polski | Mecz pucharowy |
| 0 | Liga | Mecz ligowy |

### 2.2 Zawartość

| Sekcja | Źródło i wzór |
|---|---|
| Forma | 5 ostatnich wyników (W, R, P), punkty: 12+ znakomita, 9+ dobra, 6+ przeciętna, 3+ słaba, niżej kryzys |
| Tabela | Pozycja i punkty z `ctx.home/away` |
| Bilans bezpośredni | Wygrane, remisy, porażki, bramki, 5 ostatnich meczów z datą „MMM D, YYYY”; lider bilansu przy przewadze co najmniej 2 wygranych |
| Absencje | Kontuzjowani (dni, typ, czy może grać z urazem) i zawieszeni w danych rozgrywkach |
| Przewidywane składy | `pickXI` z kształtem formacji (np. 4-2-3-1 to 4 obrońców, 5 pomocników, 1 napastnik). Flaga `outOfPosition`, gdy zawodnik gra poza swoją grupą |
| Kluczowi zawodnicy rywala | 3 najlepszych dostępnych: `OVR + 0.8*(forma - 6.6) + 0.15*gole + 0.1*asysty` |
| Zagrożeni pauzą | Kolejna żółta oznacza pauzę: liga i Puchar Polski po 4., 8., 12. ... żółtej (osobne liczniki); UEFA eliminacje po 3., 5., 7.; UEFA od fazy ligowej po 4., 6., 8.; w finale UEFA nikt |
| Pogoda i murawa | Etykieta i krótka uwaga o skutkach (deszcz, śnieg, wiatr, upał powyżej 28°C, mróz poniżej -5°C; murawa doskonała, dobra, zła, sztuczna) |
| Sędzia | Surowość `s`: poniżej 0,9 łagodny, do 1,1 przeciętny, powyżej surowy. Oczekiwane żółte `4.4 * s * heat`, czerwone `0.18 * redTendency * heat`, karne `0.30 * penaltyTendency` (bez VAR x0,85). `heat`: ranga 2+ 1,15, mecz o stawkę 1,10. Gdy są dane sezonu: żółte i czerwone na mecz |
| Frekwencja | `fill = 0.5 + 0.005*(nastrój - 50) + [0; 0.05; 0.2; 0.35][ranga] + 0.02*(prestiż - 5) + 0.05 (gospodarz w top 3) - pogoda`, zakres 0,2-1. Atut boiska `0.7 + 0.3*fill` |
| Szanse 1X2 | `matchStrength` (czyli `teamRating`), potem `expectedGoals` i `outcomeProbs` z `quickSim.js` (Poisson z korektą Dixona-Colesa, rho -0,10). Procenty metodą największych reszt, zawsze 100. Do tego najbardziej prawdopodobny wynik i oczekiwane punkty |
| Raport asystenta | Styl rywala (formacja, nastawienie, pressing, podania, linia, kontry, agresja, typ trenera), kontry taktyczne z ekspert 4.2, sugestia formacji (3.1), ostrzeżenia, porównanie sił w strefach i rozbicie (`breakdown`) |
| Oczekiwania | Zarząd z `pWin`: 0,6+ „pewne zwycięstwo”, 0,45+ „trzy punkty”, 0,3+ „remis przyjmie”, niżej „chce walki”; puchar: awans. Derby i niskie zaufanie zarządu (poniżej 40 i 25) dodają uwagi. Kibice z nastroju 0-100 |
| Nagłówki | 2 nagłówki z szablonów (rozdz. 2.4) |

### 2.3 Raport asystenta: reguły

| Rywal | Podpowiedź |
|---|---|
| Wysoki pressing | Nasza technika (TEC) co najmniej 12: krótkie podania; inaczej długie podania |
| Krótkie podania i TEC rywala poniżej 12 | Wysoki pressing |
| Długie podania, nasi stoperzy nie słabsi w powietrzu | Niska linia i krycie strefowe |
| Wysoka linia albo nastawienie +1, nasza szybkość w ataku nie gorsza | Kontratak |
| Gra z kontry | Niska linia i wolniejsze tempo |
| Drybling rywala co najmniej 13 | Twardsza gra w odbiorze (ryzyko kartek) |
| Formacja wąska (W do 0,6) | 4-4-2 (szeroko) |
| Tylko 2 środkowych pomocników | 4-3-3 (przewaga w środku) |
| Nastawienie +1 i więcej / -1 i mniej | 4-2-3-1 / 3-4-3 |

Ostrzeżenia: gra poza formacją (albo `assessLineup` dla składu ustawionego przez gracza), świeżość poniżej 80 %, obciążenie powyżej 810 minut w 14 dni, gra z urazem, zagrożenie pauzą. Porównanie stref: różnica co najmniej 0,3 pkt daje zdanie „Mamy przewagę w pomocy (0,4)” albo „Rywal jest mocniejszy w ataku”; do tego uwagi z rozbicia (forma, morale, kilku zawodników poza formacją).

### 2.4 Nagłówki mediów

- 102 szablony po polsku (49 przed meczem, 53 po meczu), każdy z flagą sytuacji: derby, finał, puchar, UEFA, utrzymanie, mistrzostwo, faworyt, forma, bilans, kontuzje, gwiazda rywala, surowy sędzia, pogoda, presja zarządu; po meczu wygrana, pogrom, remis, 0:0, porażka, wysoka porażka, festiwal goli, powrót, gol w końcówce, czerwona, VAR, karny, hat-trick, sensacja, wpadka, derby, czyste konto, pechowa porażka, posada trenera, zawodnik meczu oraz ogólne.
- Pierwszy nagłówek (nagłówek dnia) pochodzi z najważniejszej dostępnej sytuacji (waga: derby, finał, hat-trick 6; UEFA, utrzymanie, powrót, sensacja 5; VAR, czerwona 4; pozostałe 3; ogólne 1). Kolejne są losowane z tymi wagami, po jednym na sytuację.
- **Bez powtórzeń przez 5 meczów:** historia to tablica id z 5 ostatnich meczów (`headlineHistory`). Studio pomeczowe zwraca nową historię z nagłówkami całego meczu (przed i po). Gdy pula się wyczerpie, wraca najdawniej użyty szablon.
- Szablony unikają odmiany nazw klubów (nazwa zawsze w mianowniku, bez czasowników rodzajowych typu „lepszy”), bo Wisła i Lech mają różny rodzaj gramatyczny.

## 3. Odprawa przedmeczowa

### 3.1 Zaangażowanie Z

Każdy zawodnik dostaje Z od -10 do +10 na start meczu (silnik: `eff += 0.035*Z`, zanik `Z *= 0.97` na minutę, ekspert 5.1).

```text
części  = baza[ton][stan] + osobowość[ton] + kontekst fazy + cechy indywidualne
pos     = suma części dodatnich (+ premia rangi), neg = suma części ujemnych
pos     = pos * (1 + 0.04 * zaufanie) * 0.8^powtórzenia
Z       = clamp(pos + neg + gauss(0; 1.5) + rozmowa indywidualna, -10, 10)
```

**Tabela bazowa (ekspert 5.2).** Przed meczem stan to „remis”.

| Przemowa | Prowadzimy | Remis | Przegrywamy | Osobowość |
|---|---|---|---|---|
| Spokój („Trzymamy plan”) | +2 | +2 | 0 | Wrażliwy +2, Narwaniec -1 |
| Pochwała | +4 | +1 | -2 | Ambitny -1, Wrażliwy +2 |
| Wymagam więcej | +1 | +4 | +4 | Ambitny +2, Wrażliwy -3 |
| Krzyk | -2 | +2 | +6 | Narwaniec +2 (ŻK x1,3), Wrażliwy -5, Lider +1 |
| Bez presji | -1 | +1 | +1,5 (strata 2+ goli: +3) | wobec faworyta rywala +2 |
| Skupienie na obronie | +3 (i D +0,1 przez 15 min) | +1 | -2 | Spokojny +1 |

**Kontekst przedmeczowy (rozszerzenie) [SZAC].**

| Sytuacja | Warunek | Spokój | Pochwała | Wymagam | Krzyk | Bez presji | Obrona |
|---|---|---|---|---|---|---|---|
| Faworyt | pWin co najmniej 0,55 | | -1 | +1 | | -2 | |
| Słabszy | pWin do 0,25 | | | -1 | -1 | +2 | +1 |
| Kryzys | 2 porażki z rzędu albo do 3 pkt w 4-5 meczach | +1 | -2 | +1 | +2 | | |
| Dobra seria | co najmniej 10 pkt w 5 meczach | | +1 | | -1 | | |
| Wysokie oczekiwania | zarząd chce wygranej albo zaufanie zarządu poniżej 30 | -1 | | +1 | | -1 | |

**Ranga meczu.** Do części dodatniej dochodzi premia `[0; 0,5; 2; 2,5][ranga]`, a od rangi 2 dodatkowo `0.1*(WAZ - 10)`. Wyjątek: Wrażliwy z WAZ poniżej 14 w meczu rangi 2+ dostaje -2 i +1 do nerwowości (presja).

**Cechy indywidualne [SZAC].**

| Cecha | Skutek |
|---|---|
| Morale do 7 | Krzyk -2, wymagam -1, pochwała, spokój, bez presji +1 |
| Morale od 16 | Pochwała -0,5, wymagam +0,5 |
| Forma (średnia ocen) od 7,0 | Krzyk -1, pochwała +0,5 |
| Forma do 6,3 | Wymagam +1 (przy profesjonalizmie od 12), pochwała -0,5 |
| Temperament i ego (personality.js) | Krzyk `+0.08*(temper-10) - 0.08*(ego-10)`; wymagam `+0.08*(prof-10) + 0.06*(ambicja-10) - 0.06*(ego-10)`; pochwała `+0.05*(ego-10)`; spokój i obrona `+0.05*(cierpliwość-10)` |
| Zaufanie do trenera | Część dodatnia x(1 + 0,04 * zaufanie). Zaufanie do -4: krzyk i wymagania -2 (bunt) |

**Pamięć powtórzeń.** Pamięć trzyma tony z 3 ostatnich meczów i z bieżącego meczu (`memory = { last, current }`). Każde wystąpienie tonu mnoży część dodatnią przez 0,8 (dwa powtórzenia: x0,64). Część ujemna nie słabnie. `closeMatchMemory` po meczu przenosi bieżące tony do historii. Ta sama pamięć obejmuje przemowy pomeczowe (z przedrostkiem `post:`).

### 3.2 Rozmowy indywidualne (maks. 3, jedna na zawodnika)

| Rozmowa | Baza Z | Osobowość | Warunki | Skutki uboczne |
|---|---|---|---|---|
| Podbuduj | +2 | Ambitny -1, Wrażliwy +2 | słaba forma albo morale do 8: +1,5; dobra forma -1 | |
| Wymagaj | +2 | Ambitny +2, Wrażliwy -3, Lider +1, Narwaniec +1 | słaba forma i prof. od 12: +1; dobra forma: -3 i zaufanie -1; ego `-0.06*(ego-10)` | Narwaniec ŻK x1,1 |
| Uspokój | +1 | Wrażliwy +2, Narwaniec +1, Ambitny -1 | ranga 2+: +1 | zeruje nerwowość; Narwaniec lub TMP od 13: ŻK x0,8 |
| Daj wolną rękę | +1 | Lider +2, Ambitny +2, Spokojny +1, Wrażliwy -1, Narwaniec -1 | zaufanie ujemne -1; dobra forma +1 | Narwaniec ŻK x1,1 |
| Ostrzeż przed kartką | -0,5 | Narwaniec przy ujemnym zaufaniu: -2, zaufanie -1, ŻK x1,1 | bez powodu (nie zagrożony, bez kartki, spokojny temperament): -1 | ŻK x0,7 (z żółtą na koncie x0,6, Narwaniec x0,8) |

Dodatni efekt rozmowy rośnie z zaufaniem: x(1 + 0,05 * zaufanie). Szum rozmowy `gauss(0; 0,7)`.

### 3.3 Reakcja widoczna dla gracza

| Reakcja | Ikona | Warunek (kolejność sprawdzania) | Przykładowy tekst |
|---|---|---|---|
| Urażony | `hurt` | spadek zaufania co najmniej 1 albo Z do -3 | „Odwraca się z grymasem.” |
| Zdenerwowany | `nervous` | nerwowość 2+ albo Z poniżej -1 | „Unika wzroku, wyraźnie się spiął.” |
| Zmotywowany | `fire` | Z od 3 | „W jego oczach widać ogień.” |
| Spokojny | `calm` | Z od 1 | „Słucha uważnie i wygląda na skupionego.” |
| Zdenerwowany | `nervous` | nerwowość 1 | jak wyżej |
| Obojętny | `neutral` | pozostałe | „Wzrusza ramionami.” |

Rozmowa ma osobną reakcję i cytat zawodnika („Nie zawiodę, trenerze.”, „Zapamiętam to.”). Podsumowanie drużyny bez liczb: „Większość drużyny jest zmotywowana.” Teksty nie zawierają cyfr; test to sprawdza.

### 3.4 Wynik dla silnika (`engine`)

| Pole | Znaczenie |
|---|---|
| `zStart[id]` | Z na start meczu (albo nowy poziom po przerwie) |
| `cardRisk[id] = { mul, untilMin }` | Mnożnik ryzyka żółtej do 60. minuty (przed meczem) albo do 75. (po przerwie) |
| `nerves[id]` (1-3) | Nerwowość: proponowana kara `-0.05*n` pkt przez pierwsze 20 minut [SZAC, do wpięcia w modifiers.js] |
| `defBonus` | „Skupienie na obronie” przy prowadzeniu: D +0,1 przez 15 minut |

Relacje po odprawie: `relations[id]` (nowy obiekt relacji), zapis przez `applyBriefing`.

## 4. Odprawa w przerwie

### 4.1 Ocena sytuacji (wynik kontra xG)

| Sytuacja | Warunek | Spokój | Pochwała | Wymagam | Krzyk | Obrona |
|---|---|---|---|---|---|---|
| Pechowo („Gramy lepiej, ale wynik tego nie pokazuje”) | przegrywamy i xG +0,5, albo remis i xG +0,8 | +2 | +5 | -2 | -5 | |
| Zdominowani | nie prowadzimy, xG do -0,6 | -1 | -2 | +1 | +1 | +1 |
| Szczęśliwe prowadzenie | prowadzimy, xG do -0,5 | | -2 | +2 | | +1 |
| Pewne prowadzenie | prowadzimy, xG od +0,5 | +1 | +1 | | -3 | |
| Wyrównany | pozostałe | | | | | |

Momentum (średnia ostatnich minut z naszej strony): do -30 spokój i obrona +1; od +30 pochwała +1, wymagam +0,5. Oceny z 1. połowy: krzyk i wymagania do zawodnika z oceną od 7,2 dają -2 (Wrażliwy -3); wymagania do Ambitnego, Lidera albo profesjonalisty z oceną do 6,0 +1; pochwała przy ocenie od 7,0 +1, przy ocenie do 5,8 Ambitny -1.

Przykład z testu: przy 0:2 i xG 1,9 do 0,6 pochwała daje drużynie więcej niż krzyk; przy 0:2 i xG 0,3 do 1,8 odwrotnie. Asystent liczy oczekiwany efekt wszystkich 6 przemów na tych samych zawodnikach (bez szumu) i podaje najlepszą, najgorszą oraz do 3 rozmów (kartka u Narwańca, wsparcie dla Wrażliwego po słabej połowie, wymagania dla Ambitnego, pochwała dla najlepszego).

### 4.2 Krzyk, który obraca się przeciwko trenerowi

Krzyk jest „przeciwskuteczny” (flaga `team.backfire`, komunikat „Krzyk obrócił się przeciwko tobie: zawodnicy uznali, że to nie oni zawinili.”), gdy:
- prowadzimy, albo sytuacja to „pechowo” lub „pewne prowadzenie”;
- krzyk był w pamięci co najmniej 2 razy (drużyna przestała słuchać);
- zaufanie zawodnika do trenera jest do -4.

Skutek: dodatkowo Z -1 u każdego, zaufanie -0,5 u każdego (urażony: kolejne -0,5).

## 5. Studio pomeczowe

| Sekcja | Jak powstaje |
|---|---|
| Wynik, wynik do przerwy | Ze zdarzeń (gole minus gole anulowane przez VAR), zgodnie z `statsFromEvents` |
| Kluczowe momenty (maks. 8) | Gole z bieżącym wynikiem (ważniejsze przy różnicy do 1), VAR, czerwone, niewykorzystane karne, wielkie okazje (xG od 0,35), urazy na tydzień i dłużej; sortowane po minucie |
| Zawodnik meczu | Najwyższa ocena; remis rozstrzyga zwycięska drużyna (ekspert 6.1 d) |
| Oceny | Lista na drużynę, malejąco |
| Statystyki | Tylko `statsFromEvents(events)`: posiadanie, strzały, xG, podania i celność, rożne, faule, kartki, obrony i reszta. Werdykt xG: „Byliśmy lepsi, ale zabrakło skuteczności.”, „Zwycięstwo szczęśliwe”, „Powinniśmy wygrać ten mecz.” |
| Kontrowersje | `varOverturn`, czerwone, podyktowane karne; `wrong: true` dodaje „Powtórki sugerują błąd sędziego” |
| Zarząd | `3*(pkt - pkt oczekiwane)` (ekspert 9.7), derby +-2, zakres -10..+10 |
| Kibice | `4*(pkt - pkt oczekiwane)` + derby +-4 + pogrom +2 / wysoka porażka -3, zakres -15..+15 |
| Media | Ton: entuzjazm, uznanie, neutralnie, krytyka, drwina |
| Tabela | Aktualizacja dwóch wierszy i sortowanie (punkty, bilans, gole, nazwa); pozycja klubu gracza przed i po |
| Kontuzje i pauzy | Zdarzenia `injury`; czerwona: 1 mecz (rażący faul 2, przemoc 3); żółte: przekroczenie progu z rozdz. 2.2 (od 12. żółtej w lidze 2 mecze) |
| Nagłówek dnia | 1 główny i 2 dodatkowe |
| Poczta | `postMatchMessages`: Media (nagłówek dnia), Zarząd (gdy zmiana zaufania co najmniej 2), Sztab (kontuzje i pauzy, priorytet „important”). Klucze wiadomości chronią przed dublami |

**Format zdarzeń** (zgodny z `matchStats.js`): `{ type, side: 0|1, min, added?, half?, player?, name?, xg? }`. Studio czyta dodatkowo: `goal { ownGoal?, penalty?, assistName? }`, `red { second?, reason: 'przemoc'|'rażący' }`, `penalty { wrong? }`, strzały `{ penalty? }` (karny niewykorzystany), `varOverturn { cancelGoal?, decision?, wrong? }`, `injury { days, injuryType }`. Zdarzenia bez minuty (pakiety podań) liczą się tylko do statystyk.

## 6. Odprawa pomeczowa

### 6.1 Przemowa do drużyny (morale w skali 1-20, zapis przez `applyMorale`) [SZAC]

| Przemowa | Wygrana | Remis | Porażka | Osobowość | Sytuacja |
|---|---|---|---|---|---|
| Pochwała | +1,0 | +0,5 | -0,5 | Wrażliwy +0,5; Ambitny po porażce -0,5 | porażka mimo przewagi xG: +1; wygrana mimo słabej gry: -0,7 |
| Krytyka | -1,0 | -0,3 | +0,3 | Wrażliwy -1, Ambitny +0,5, Lider +0,3, Narwaniec -0,3 | porażka po dobrej grze: -1 i zaufanie -0,5; po wygranej zaufanie -0,3; zawodnik z oceną od 7: -1 i zaufanie -1 (Wrażliwy -2) |
| Neutralnie | 0 | 0 | 0 | | |
| Skupienie na kolejnym meczu | +0,3 | +0,3 | +0,6 | Spokojny, Lider +0,2 | |

Mecz rangi 2+: wszystko x1,5. Powtórzenia: x0,8. Szum `gauss(0; 0,2)`. Zmiana działa od razu i wygasa tygodniowym dryfem `weeklyDrift` z `morale.js` (stąd `days: 7` w wyniku).

### 6.2 Rozmowy indywidualne po meczu

| Rozmowa | Ocena zawodnika | Morale | Zaufanie | Ryzyko konfliktu |
|---|---|---|---|---|
| Pochwała | od 7,0 | `publicPraise + 0,5` = +1,5 (Wrażliwy x1,3) | +1 | 0 |
| Pochwała | 6,2-6,9 | +0,8 | +0,5 | 0 |
| Pochwała | poniżej 6,2 | +0,3 (Ambitny 0: „wie, że zagrał słabo”) | 0 | 0 |
| Pochwała | nie grał | +0,5 | +0,3 | 0 |
| Krytyka | od 6,8 (niesprawiedliwa) | `publicCriticism` = -1,5 | -2 (ego od 14: -2,5; Wrażliwy -3) | `0.25 + 0.15 (Wrażliwy, Narwaniec) + 0.02*max(0, -zaufanie) + 0.02*(ego-10)` |
| Krytyka | 6,3-6,7 albo nie grał | -0,8 | -0,5 | 0,05 |
| Krytyka | do 6,2 (zasłużona) | Ambitny, Lider, prof. od 13: -0,3; Spokojny -0,5; Narwaniec -1; Wrażliwy -1,5 | odpowiednio +0,3; 0; -0,5; -1 | 0; 0; 0,1; 0,1 |

Konflikt to wpis `conflicts[]` („Zawodnik nie zgadza się z oceną trenera i chce o tym porozmawiać.”), do wysłania jako wiadomość od zawodnika.

### 6.3 Konferencja prasowa (opcja)

2-3 pytania z banku 10 pytań dobranych do sytuacji (wygrana, porażka, remis, posada przy zaufaniu zarządu poniżej 45, derby, kontrowersje, gwiazda meczu, seria 3 porażek, cele zarządu, kolejny mecz). Każda odpowiedź ma skutki: kibice (punkty nastroju 0-100), zarząd (punkty zaufania 0-100), morale drużyny i ewentualnie morale gwiazdy (`EVENT_DELTA.publicPraise`). Krytyka sędziego podnosi nastrój kibiców o 3, obniża zaufanie zarządu o 2 i ustawia `fine: true` (możliwa kara Komisji Ligi).

## 7. Relacja trener-zawodnik

**Jedno pole wspólne z negocjacjami:** `player.relations[clubId].trust` w skali 0-100 (50 neutralnie) z `negotiation.js`. Odprawy widzą je w skali od -10 do +10:

```text
zaufanieOdpraw = clamp((trust - 50) / 5, -10, 10)
zmiana o d w skali odpraw  ->  trust += 5*d   (zakres 0-100)
```

W tej samej relacji odprawy zapisują:
- `briefMem`: pamięć ostatnich 6 zdarzeń `{ tag, d, w (tygodnie), date }`. To pamięć, nie drugie zaufanie;
- `grudge` i `grudgeDate`: przy urazie (d do -1) uraza rośnie o `2*|d|` (Wrażliwy x1,5). To ta sama uraza, którą czytają negocjacje (nastrój i cierpliwość) i która wygasa o połowę co 90 dni (`currentGrudge`).

| Mechanizm | Reguła [SZAC] |
|---|---|
| Pamięć | Ujemne zdarzenie z tym samym tagiem w pamięci działa x1,5 (druga niesprawiedliwa krytyka boli mocniej) |
| Długość pamięci | Ujemne: `3 + 2*|d|` tygodni (Wrażliwy x1,5, Spokojny x0,7); dodatnie: 2 tygodnie |
| Wygaszanie (`decayTrust`, raz w tygodniu) | Zaufanie wraca ku 50 o 10 % różnicy (cierpliwość od 13 albo PRF od 14: 15 %). Niskie zaufanie nie rośnie, dopóki w pamięci jest ujemny wpis albo uraza od 5 |
| Wpływ na odprawy | Część dodatnia przemowy x(1 + 0,04 * zaufanie), rozmowy x(1 + 0,05 * zaufanie); zaufanie do -4: bunt przy krzyku i wymaganiach; większe ryzyko konfliktu |
| Wpływ na negocjacje | Bez zmian w `negotiation.js`: czyta to samo `trust` i `grudge` |
| Etykieta dla gracza | `trustLabel`: pełne zaufanie, dobra relacja, neutralna, chłodna, konflikt z trenerem |

Test sprawdza, że `applyOutcome` z negocjacji zmienia to samo pole i nie gubi `briefMem`, a zawodnik nie ma osobnego pola `trust`.

## 8. Trenerzy AI

AI używa tych samych tabel w uproszczeniu: `aiChooseSpeech(coach, ctx)` wybiera ton, a `aiBriefing(team, ctx)` liczy Z dla 5 typów osobowości (bez szumu indywidualnego) i waży je udziałem w kadrze (`personaMix`). Koszt: 5 wywołań zamiast 18.

| Faza | Sytuacja | Ofensywny (O) | Ostrożny (S) | Pragmatyczny (P) |
|---|---|---|---|---|
| Przed meczem | słabszy (pWin do 0,25) | Wymagam | Bez presji | Bez presji |
| | faworyt (pWin od 0,55) | Wymagam | Spokój | Wymagam |
| | ranga 2+ | Wymagam | bez zmian | Wymagam |
| | inne | Wymagam | Spokój | Spokój |
| Przerwa | przegrywa 2+ | Krzyk | Bez presji | pechowo: Pochwała, inaczej Krzyk |
| | przegrywa 1 | Krzyk | Wymagam | pechowo: Pochwała, inaczej Wymagam |
| | remis | Wymagam | Spokój | faworyt: Wymagam, inaczej Spokój |
| | prowadzi 1 | Pochwała | Obrona | szczęśliwie: Obrona, inaczej Spokój |
| | prowadzi 2+ | Pochwała | Obrona | Pochwała |
| Po meczu | wygrana | Pochwała | Skupienie na kolejnym | Pochwała |
| | remis | Skupienie na kolejnym | Skupienie na kolejnym | Skupienie na kolejnym |
| | porażka | Krytyka | Skupienie na kolejnym | słaba gra: Krytyka, inaczej Neutralnie |

Ton użyty w 2 z 3 ostatnich meczów jest pomijany (AI też ma pamięć powtórzeń); wtedy AI bierze drugi wybór.

## 9. Przykłady odpraw

Wyniki z kodu (drużyna testowa: Kowal Spokojny, Nowak Ambitny, Wiśniewski Wrażliwy, Lis Lider, Zając Narwaniec z 3 żółtymi kartkami). Gracz widzi kolumny „Reakcja” i „Tekst”; kolumna „Dla silnika” jest ukryta.

### Przykład 1: przed derbami (ranga 2, pWin 0,42)

Asystent: „Stać ich na więcej; jasne wymagania powinny zadziałać.” Proponuje rozmowy: Zając (ostrzeżenie przed kartką), Wiśniewski (uspokojenie). Gracz wybiera „Wymagam więcej” i trzy rozmowy.

| Zawodnik | Reakcja na przemowę | Rozmowa i odpowiedź | Dla silnika |
|---|---|---|---|
| Kowal (Spokojny) | Zmotywowany: „W jego oczach widać ogień.” | | Z +9,2 |
| Nowak (Ambitny) | Zmotywowany | Daj wolną rękę: spokojny, „Dobrze, skupiam się.” | Z +10 |
| Wiśniewski (Wrażliwy) | Zdenerwowany: „Unika wzroku, wyraźnie się spiął.” (presja derbów) | Uspokój: zmotywowany, „Dam z siebie wszystko.” | Z +4,3, nerwowość 0 |
| Lis (Lider) | Zmotywowany | | Z +4,6 |
| Zając (Narwaniec) | Zmotywowany: „Wstaje pierwszy, gotowy do gry.” | Ostrzeż przed kartką: obojętny, „Jak pan uważa.” | Z +5, ŻK x0,88 do 60' |

Drużyna: „Większość drużyny jest zmotywowana.” Bez rozmowy Wiśniewski wyszedłby zdenerwowany, a Zając z ryzykiem kartki x1,1.

### Przykład 2: przerwa przy 0:2, xG 1,9 do 0,6

Asystent: „Gramy lepiej, ale wynik tego nie pokazuje. Zawodnicy grają dobrze; pochwała doda im pewności.” Proponuje: podbudować Wiśniewskiego (ocena 5,9), pochwalić Nowaka (7,3).

| Zawodnik | Pochwała + „Podbuduj” Wiśniewskiego | Krzyk (dla porównania) |
|---|---|---|
| Kowal | Zmotywowany (Z +4,3) | Spokojny (Z +1,3) |
| Nowak | Zmotywowany (Z +3,2) | Zdenerwowany (Z -1,8): „to nie do mnie” przy ocenie 7,3 |
| Wiśniewski | Zmotywowany, „Zobaczy pan, co potrafię.” (Z +9,8) | Urażony: „Odwraca się z grymasem.” (Z -5,1, nerwowość) |
| Lis | Spokojny (Z +2,9) | Obojętny (Z +0,9) |
| Zając | Spokojny (Z +2,5) | Spokojny (Z +1,5, ŻK x1,3) |

Przy krzyku gracz widzi komunikat „Krzyk obrócił się przeciwko tobie: zawodnicy uznali, że to nie oni zawinili.”, a zaufanie każdego zawodnika spada (z 50 do 47,5, Wiśniewski do 45).

### Przykład 3: po wygranej 2:0 (xG 1,7 do 0,8)

Gracz wybiera pochwałę dla drużyny, chwali Nowaka (ocena 7,8) i krytykuje Wiśniewskiego (ocena 7,5).

| Zawodnik | Reakcja | Rozmowa | Morale (tydzień) | Zaufanie (0-100) |
|---|---|---|---|---|
| Kowal | Spokojny | | +0,8 | 50 |
| Nowak | Spokojny | Pochwal: zmotywowany, „Zobaczy pan, co potrafię.” | +2,1 | 55 |
| Wiśniewski | Zmotywowany po pochwale drużyny | Skrytykuj: urażony, „Nie zgadzam się z panem.” | +0,1 | 35, uraza 9 |
| Lis | Spokojny | | +1,0 | 50 |
| Zając | Spokojny | | +0,9 | 50 |

Niesprawiedliwa krytyka zjada niemal cały zysk z pochwały drużyny, a uraza Wiśniewskiego zostaje w relacji: przez kolejne tygodnie zaufanie nie wraca, a przy rozmowie o kontrakcie negocjacje zaczną się w gorszym nastroju. Druga taka krytyka odjęłaby 22,5 pkt zaufania zamiast 15.

## 10. Integracja i otwarte kwestie

- Kolejność wywołań: `preMatchStudio` → `preMatchBriefing({ ctx: { ...pre.forBriefing, clubId, date } })` → silnik → `halftimeBriefing` → silnik → `postMatchStudio({ pre: pre.forPost })` → `postMatchBriefing({ ctx: post.forBriefing })` → `pressConference(post.forBriefing.press)` → `applyBriefing` dla każdego zawodnika → `closeMatchMemory`.
- Adapter osobowości to jedna funkcja `traitsOf` w `briefings.js`. Zawodnik bez `traits` dostaje je deterministycznie z `personalityOf`.
- Silnik powinien przyjąć `engine.zStart`, `cardRisk`, `nerves` i `defBonus`. Nerwowość nie ma jeszcze wpisu w `modifiers.js` (proponowany wpis w rozdz. 3.4).
- Nastrój kibiców i zaufanie zarządu są w studiu tylko zmianami (`delta`); zapis do stanu kariery należy do modułu zarządu.
- Nagłówki i historia nagłówków są w zapisie gry jako tablica id (maks. 5 meczów).
