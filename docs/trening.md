# Trening, rozwój i zgranie

Kod: `src/training/` (config, state, staff, plan, sessions, load, cohesion, development, index), ekran `src/ui/trainingView.js`, style `src/styles/training.css`, testy `tests/training.test.mjs` (24 testy). Wszystkie liczby siedzą w `src/training/config.js` i są wartościami balansowymi [SZAC].

## 1. Burza mózgów: prawdziwy proces treningowy a gra

**Co robi sztab w prawdziwym klubie:**

- Planuje mikrocykl od meczu do meczu (periodyzacja taktyczna): MD+1 regeneracja, MD+2 wolne, MD-4 siła, MD-3 objętość i gry, MD-2 szybkość i taktyka, MD-1 rozruch i analiza rywala. Przy dwóch meczach w tygodniu zostaje tylko regeneracja i aktywacja.
- Mierzy obciążenia (sRPE, GPS) i pilnuje proporcji ostrego do przewlekłego obciążenia (ACWR). Skoki obciążenia powyżej 1,5 raza to główne źródło urazów bezkontaktowych.
- Rezerwowi po meczu robią trening uzupełniający, bo nie dostali bodźca meczowego.
- Ciężkie zajęcia zostawiają zmęczenie na 48-72 godziny (ciężkie nogi), więc ich miejsce w tygodniu ma znaczenie.
- Zgranie to znajomość systemu i instrukcji przez cały zespół oraz stały skład. Nowa formacja albo duża rotacja kosztuje tygodnie.
- Stałe fragmenty i analiza wideo rywala to tanie, punktowe przewagi na najbliższy mecz.
- Trening indywidualny: akcent na słabą stronę, nauka nowej pozycji, program dla młodych, program powrotu po kontuzji, oszczędzanie przeciążonych.
- Okresy: obóz przygotowawczy (wysoka objętość, stopniowe budowanie), sezon (utrzymanie), urlop (spadek ostrości, program indywidualny).
- Sztab: asystent, trener przygotowania fizycznego, trener bramkarzy, trener młodzieży, analityk. Ich jakość decyduje o tempie rozwoju, urazach i jakości informacji.

**Czego brakowało w grze:** zakładka „Trening” była zaślepką. Rozwój i starzenie nie istniały, zgranie było stałą (silnik brał spójność 85), świeżość odbudowywała się sama, a stałe fragmenty i przygotowanie do rywala nie miały źródła. Brakowało też sztabu i urazów treningowych (ekspert 8.1).

**Co dodano i dlaczego:** każdy element ma liczbę, która trafia do silnika albo do rozwoju, więc decyzja trenera jest odczuwalna, ale żadna nie dominuje (zakres podobny do morale: ok. ±0,4 punktu atrybutu).

## 2. Stan w zapisie

```text
game.training = { v, createdAt, lastMonth, lastWeek, lastClubMatch,
  staff:    { [klub]: { asystent|fizyczny|bramkarze|mlodziez|analityk: { name, q 1-20, age } } },
  clubs:    { [klub]: { form, fam: { [formacja]: 0-100 }, instr, instrSnap, sp, prep: {date, opp, v}, z } },
  overrides:{ [data]: { sessions: [{ type, int }] } },   // tylko ręczne zmiany gracza
  settings: { accent, load }, reports: [6 ostatnich], hist: { [data]: podsumowanie dnia, 35 dni } }
player.training = { focus, pos, prog, mode, log[28], logDate, acwr, legs, know, rh, minSeen, rtp, inj, injLen, ovrHist[13], stim{} }
```

`player.training` mają tylko zawodnicy klubu gracza (ok. 32). Stan treningu to ok. 40 KB po sezonie. `ensureTraining(game)` tworzy wszystko dla starych zapisów (idempotentnie).

## 3. Plan tygodnia

Plan asystenta liczy się z terminarza w locie (przełożony mecz od razu zmienia plan). W zapisie są tylko ręczne zmiany gracza.

| Dzień | Plan asystenta (akcent zrównoważony) |
|---|---|
| MD | mecz |
| MD+1 | regeneracja (niska); rezerwowi: gierki (średnia) jako trening uzupełniający |
| MD+2 | wolne (przy 5 dniach przerwy: technika średnia) |
| MD-4 | siła, wysoka |
| MD-3 | gierki, wysoka |
| MD-2 | taktyka, średnia + stałe fragmenty (asystent od 12) + odprawa |
| MD-1 | rozruch, niska + analiza wideo rywala |
| 2 mecze w tygodniu | MD+1 regeneracja (+ wideo), MD-1 rozruch, przy 4 dniach: MD-2 taktyka niska |
| Tydzień bez meczu | Pn siła W, Wt technika Ś, Śr wytrzymałość W, Cz taktyka Ś, Pt gierki Ś, So szybkość Ś, Nd wolne |
| Obóz (b ≥ 17 dni do meczu) | objętość średnia, drugi trening w Pn i Śr |
| Obóz (10-16 dni) | intensywność wysoka, drugi trening w Pn, Wt, So |
| Urlop | brak zajęć, program indywidualny 10 AU dziennie |

Okres: obóz, gdy 10+ dni od i do meczu, w czerwcu-sierpniu albo grudniu-lutym i do meczu najwyżej 24 dni; urlop przy dłuższej przerwie; poza tymi miesiącami „przerwa”.

Akcenty (MD-4, MD-3, MD-2, MD-1): zrównoważony (siła, gierki, taktyka, rozruch), fizyczny (siła, wytrzymałość, szybkość, rozruch), techniczny (technika, wykończenie, technika, rozruch), taktyczny (gra obronna, gierki, taktyka, taktyka), stałe fragmenty (siła, gierki, stałe, stałe). Poziom obciążeń przesuwa intensywność o jeden poziom, ale MD-1 i MD+1 zawsze są niskie, a MD-2 najwyżej średni (test: nigdy ciężki trening dzień przed meczem).

Gracz zmienia dowolny przyszły dzień: do 3 zajęć, rodzaj i intensywność, dzień wolny albo powrót do planu asystenta.

## 4. Zajęcia i intensywność

| Intensywność | Rozwój | Zmęczenie | AU | Ryzyko urazu | Ostrość | Ciężkie nogi |
|---|---|---|---|---|---|---|
| Niska | x0,7 | 5 | 25 | x0,6 | +2 | 0 |
| Średnia | x1,0 | 11 | 45 | x1,0 | +3 | 0,35 |
| Wysoka | x1,3 | 18 | 70 | x2,0 | +4 | 1,0 |

Wartości dla średniej intensywności (jakość sztabu 10):

| Zajęcia | Świeżość | AU | Uraz % | Rozwija | Dodatkowo |
|---|---|---|---|---|---|
| Wytrzymałość | -12,7 | 52 | 0,15 | WYT, PRA | morale -0,05 |
| Szybkość | -11 | 41 | 0,20 | SZY, ZWI | |
| Siła | -12,1 | 45 | 0,17 | SIL, SKO | |
| Technika | -7,7 | 36 | 0,11 | TEC, POD, DRY, DOS | |
| Taktyka | -6,6 | 32 | 0,08 | DEC, UST, WIZ, RUC | zgranie formacji +2, instrukcje +1,6, znajomość systemu +1, nauka pozycji x1,6 |
| Stałe fragmenty | -5,5 | 25 | 0,09 | SFR, GLO | poziom stałych fragmentów +7 |
| Wykończenie | -8,8 | 38 | 0,12 | WYK, DYS, OPA | |
| Gra obronna | -9,9 | 41 | 0,17 | ODB, UST, GLO, AGR | zgranie +0,5 |
| Gierki | -11 | 45 | 0,18 | TEC, POD, DEC, PRA, SZY, WYT | ostrość x1,6, morale +0,1 |
| Rozruch | -4,4 | 20 | 0,06 | SZY, TEC | |
| Regeneracja | +8 (6 + 0,2 q) | 14 | 0,02 | | ciężkie nogi -0,5 |
| Analiza wideo | 0 | 3 | 0 | DEC, WIZ (mało) | +0,04 + 0,006 q analityka na najbliższy mecz |
| Odprawa | 0 | 2 | 0 | DEC (mało) | instrukcje +1,5, morale +0,12 |

Bramkarze w dniach zajęć fizycznych i technicznych trenują osobno z trenerem bramkarzy (REF, CHW, WYJ, JNJ, NOG), a taktykę, stałe fragmenty, regenerację i rozruch robią z drużyną. Zawodnicy powołani do reprezentacji nie trenują, kontuzjowani mają tylko rehabilitację.

Zmęczenie zawodnika: `bazowe * (1,3 - 0,03*WYT, 0,7..1,25) * (30+: x1,1, 33+: x1,2)`. Regeneracja z sesji: `(6 + 0,2*q_fiz) * (0,8 + 0,02*WYT) * (31+: x0,85)`, do tego dzienna odbudowa +18 z `season.js`.

## 5. Obciążenie i zdrowie

- Dziennik 28 dni w AU: mecz 90 minut = 100 AU (proporcjonalnie do minut), zajęcia wg tabeli.
- `ACWR = suma 7 dni / (suma 28 dni / 4)`. Strefy: poniżej 0,7 za mało, 0,7-1,3 bezpiecznie, 1,3-1,5 podwyższone ryzyko, powyżej 1,5 przeciążenie.
- Uraz na treningu (ekspert 8.1): `0,0015 * Σ(int.inj * typ.inj) * (1,5 - 0,05*ODP) * wiek(30+: 1,15, 33+: 1,3) * mACWR * (świeżość < 70: 1,4) * (powrót po urazie 14 dni: 1,3, program powrotu: 0,7) * (lżejszy trening: 0,6) * (1,2 - 0,02*q_fiz)`, mACWR: < 0,7 → 1,15; ≤ 1,3 → 1; ≤ 1,5 → 1,5; wyżej 2,2 + 2*(ACWR - 1,5), maks. 4. Na obozie mACWR x0,75. Typy: 78 % lekkie, 19 % średnie, 3 % ciężkie (`INJURY_TYPES` silnika).
- Ciężkie nogi: po zajęciach `legs += int.legs * typ.legs`, co dzień `legs *= 0,4`. W meczu kara `-0,8 * (legs - 0,15)` punktu atrybutu. Siła wysoka dzień przed meczem: ok. -0,2 na zawodnika; standardowy mikrocykl: 0.
- Przeciążenie: ACWR powyżej 1,3 daje `-0,6*(ACWR - 1,3)` (maks. -0,3) do siły w meczu i -0,1 morale dziennie powyżej 1,5. W poniedziałek trener przygotowania fizycznego wysyła listę przeciążonych.
- Program powrotu: po urazie 15+ dni (automatycznie przy trenerze fizycznym od 8 albo na życzenie gracza) 10 dni: intensywność najwyżej średnia, ostrość +2 dziennie, ryzyko x0,7.
- Tryb zawodnika: pełny, lżejszy (wszystko x0,5) albo odpoczynek (tylko wideo i odprawa).

## 6. Rozwój i spadek (raz w miesiącu, cały świat)

```text
g [pkt OVR/mies.] = rate(wiek) * max(0, POT - OVR) / 12 * minuty * (0,8 + 0,02*PRF) * sztab * młodzież * trening * program
rate: <=19: 0,40; 20-21: 0,32; 22-23: 0,22; 24-26: 0,10; 27-28: 0,03; 29+: 0
minuty = 0,6 + 0,4 * min(1, udział minut / 0,6)        (akademia: udział 0,5; program dla młodych: min. 0,85)
sztab  = bramkarz: 0,75 + 0,025*q_bramk; inni: 0,85 + 0,015*śr(q_asyst, q_fiz); do 21 lat dodatkowo 0,75 + 0,025*q_młodz
trening = 0,5 + 0,5 * (bodziec miesiąca / 16), zakres 0,5-1,4   (kluby AI i akademia: 1,0)
program dla młodych = 1,1 + 0,01*q_młodz
```

Przyrost `g * liczba atrybutów OVR` dzielony jest na atrybuty z wagą `waga_profilu (++ 4, + 2, 0 1, poza profilem 0,5) * (1 + udział_bodźca * liczba_atrybutów)`. Akcent indywidualny dokłada 0,4 bodźca dziennie na wybrane atrybuty. Atrybut nie przekracza POT + 3. Ułamki zaokrąglamy losowo (wartość oczekiwana bez zmian), więc nie trzeba ich zapisywać.

Spadek: fizyczne (SZY, ZWI, WYT, SKO) `0,02*(wiek - 28)` miesięcznie od 29 lat; technika i fizyczne ogólnie od 30 lat 0,012-0,04; mnożniki `(1,2 - 0,02*PRF) * (1,1 - 0,01*q_fiz) * trening fizyczny (0,75-1,2)`. Mentalne (DEC, OPA, UST, LID, WIZ) +0,015 miesięcznie od 24 do 33 lat. Bramkarze tracą REF, JNJ, WYJ od 32 lat. Skok rozwojowy do 21 lat: `0,03/12 * (0,5 + 0,05*q_młodz)` miesięcznie, POT +1,5.

Raport miesięczny (1. dnia miesiąca): kto rośnie, kto spada, skoki rozwojowe. Dokładność zależy od asystenta: od 14 liczby i atrybuty, 8-13 tylko kierunek, poniżej 8 ogólnie.

## 7. Zgranie i wpływ na mecz

```text
zgranie zawodnika = 0,45*formacja + 0,20*instrukcje + 0,20*znajomość systemu + 0,15*100*rytm
modyfikator 'trainingCohesion' = clamp(0,008 * (zgranie - 65), -0,4, +0,28) pkt
start spójności S w silniku = clamp(70 + 0,3 * zgranie, 70, 100)   (ekspert 4.3; dziś silnik bierze stałe 85)
```

- Formacja: osobno dla każdej, +4 za mecz, trening taktyczny +2 (x jakość asystenta), -1 na tydzień dla nieużywanych (min. 30). Nowa formacja zaczyna od 36.
- Instrukcje: +1,5 za mecz, taktyka +1,6, odprawa +1,5, każda zmiana instrukcji -7.
- Znajomość systemu (zawodnik): +2 za mecz, taktyka +1; nowy zawodnik 40.
- Rytm: po każdym meczu klubu `rh = 0,6*rh + 0,4*min(1, minuty/90)`; rotacja obniża.
- Kluby AI: jeden krok tygodniowy: formacja +2,5 * asystent + 4 za mecz, instrukcje do 80.

Inne modyfikatory: `trainingPrep` (analiza wideo, 0,046-0,16 pkt tylko w dniu meczu), `trainingLoad` (ciężkie nogi i przeciążenie), `trainingSetPieces` (szybka symulacja: do ±0,05). W pełnym silniku stałe fragmenty działają przez dane wejściowe: `trainingMatchInput` podnosi SFR wykonawców o `(sp - 50)/50*1,2` (od -0,6 do +1,2) i WYJ bramkarza o połowę tego, więc SPA rośnie do +0,6.

Przykład (test): zgranie 100 zamiast 30 podnosi strefy DEF, MID, ATT o ponad 0,4 pkt w `teamRating` i o ponad 0,5 w strefach pełnego silnika.

## 8. Sztab

Jakość na start: `3 + 1,3*prestiż + premia ligi (EK +1, 2L -1) + N(0; 1,8)`, rezerwy: prestiż klubu-matki - 3, trener młodzieży +4. Legia ok. 17, mały klub 2 Ligi ok. 5.

| Rola | Wpływ |
|---|---|
| Asystent | zgranie i nauka pozycji x(0,8 + 0,02 q), rozwój, dokładność raportu, plan (stałe fragmenty od 12) |
| Przygotowanie fizyczne | urazy x(1,2 - 0,02 q), regeneracja +(6 + 0,2 q), spadek x(1,1 - 0,01 q), program powrotu od 8 |
| Bramkarze | rozwój bramkarzy x(0,75 + 0,025 q) |
| Młodzież | rozwój do 21 lat x(0,75 + 0,025 q), skok x(0,5 + 0,05 q) |
| Analityk | analiza rywala 0,04 + 0,006 q pkt |

## 9. Przykłady

**Tydzień z 1 meczem (sobota):** Nd regeneracja (świeżość 67 → 93), Pn wolne (100), Wt siła W (82), Śr gierki W (ok. 82), Cz taktyka Ś + stałe N + odprawa, Pt rozruch + wideo, So mecz: świeżość 100, ciężkie nogi 0,08 (bez kary), analiza +0,14 pkt (Legia). Obciążenie ok. 290 AU, ACWR ok. 1.

**Ten sam tydzień z siłą W w piątek:** ciężkie nogi 0,4, kara ok. -0,2 pkt na zawodnika, wyższe ryzyko urazu.

**Tydzień z 2 meczami (So, Śr):** Nd regeneracja + wideo, Pn taktyka N, Wt rozruch + wideo, Śr mecz, Cz regeneracja, Pt rozruch + wideo, So mecz. Mało bodźca rozwojowego (realny koszt gęstego terminarza).

**Po miesiącu (pomiar, Widzew):** zgranie 68 → 88 (formacja i instrukcje po obozie), 1-2 urazy treningowe, raport: 5-8 zawodników rośnie, 1-3 spadają.

**Po sezonie (pomiar, cały świat):** zawodnicy do 21 lat +0,8 OVR, 22-28 lat +0,1, 29-32 lat -0,2, 33+ lat -0,5. Zgranie klubu gracza 95-98, klubów AI ok. 93. Klub gracza ma 5-9 urazów treningowych w sezonie (AI podobnie).

## 10. Wydajność

- Dzień: tylko klub gracza (ok. 25 zawodników, 1-3 zajęcia). Poniedziałek: kluby AI (54 kluby, kilka liczb). 1. dzień miesiąca: rozwój ok. 1700 zawodników.
- Modyfikatory: kilka odczytów pól na zawodnika.
- Pomiar: pół sezonu 600-800 ms bez treningu, 700-930 ms z treningiem (ok. +15-20 %). Test wydajności pilnuje progu 30 %.

## 11. Obozy przygotowawcze

Kod: `src/training/camps.js`, testy: `tests/camps.test.mjs`.

**Co robią polskie kluby.** Zimą najpopularniejszym kierunkiem klubów Ekstraklasy jest Turcja (Belek, Antalya, Side, Lara): przed wiosną 2025 w Turcji było m.in. Pogoń, Lechia, Zagłębie, Cracovia, Widzew, Motor, Korona, GKS Katowice i Górnik, a Raków pojechał do Marbelli. Według Górnika Zabrze w Turcji trenuje 14 drużyn Ekstraklasy, choć coraz więcej wybiera inne kierunki. Do Turcji jeżdżą też kluby 1 Ligi (Wisła Kraków, Wieczysta). Latem kluby trenują głównie w Polsce (Opalenica, Arłamów, Gniewino) i w Austrii, rzadziej w Słowenii, zwykle przez 10-14 dni z 3-4 sparingami. Źródła są na końcu rozdziału. Liczby w grze to założenia [SZAC].

| Kierunek | Warunki latem | Warunki zimą | Koszt dnia (część rocznego przychodu bazowego) |
|---|---|---|---|
| Polska (ośrodek krajowy) | 85 % | 55 % | 0,04 % |
| Słowenia | 95 % | 60 % | 0,07 % |
| Austria (Alpy) | 100 % | 50 % | 0,08 % |
| Turcja (Belek, Antalya) | 80 % | 100 % | 0,09 % |
| Hiszpania (Marbella) | 75 % | 105 % | 0,12 % |

Przykład: Widzew, 10 dni w Austrii: ok. 0,5 mln zł; Legia płaci więcej, mały klub 2 Ligi kilka razy mniej. Koszt trafia do finansów jako `camps` przy rezerwacji, odwołanie przed wyjazdem zwraca pieniądze.

**Termin.** Lato: od Jul 2 do 2 dni przed pierwszym meczem o punkty. Zima: po urlopie świątecznym (najwcześniej Jan 2 i 12 dni po ostatnim meczu jesieni) do 2 dni przed pierwszym meczem wiosny. Długość 7, 10 albo 14 dni (5, gdy przerwa jest krótka). Obóz nigdy nie koliduje z meczem o punkty.

**Forma bazowa.**

```text
punkty: dzień obozu = q kierunku; dzień treningu w klubie = 0,45 latem, 0,3 zimą (mróz, sztuczne boiska)
cel = clamp(0,55 * dni okresu przygotowawczego, 4, 12)
forma bazowa = clamp(punkty / cel, 0,3, 1,1), liczona w dniu pierwszego meczu rundy
wpływ w meczach = 0,4 * (forma - 1) pkt atrybutu: pełny przez 21 dni, potem wygasa przez 21 dni (modyfikator 'trainingCamp')
brak formy = 1 - forma: urazy treningowe x(1 + 0,8 * brak), przyrost ostrości x(1 - 0,5 * brak)
```

| Przygotowanie (zima, 24 dni) | Forma bazowa | Siła w 3 pierwszych tygodniach |
|---|---|---|
| Bez obozu | ok. 0,45 | ok. -0,22 pkt |
| Polska, 7 dni | ok. 0,63 | ok. -0,15 pkt |
| Turcja, 12 dni | ok. 1,1 | +0,04 pkt |

**Na obozie** (mnożone przez q): rozwój x(1 + 0,25 q) i zajęcia fizyczne dodatkowo x1,1, zgranie z zajęć x(1 + 0,5 q), ryzyko urazu x(1 - 0,3 q), zmęczenie x(1 - 0,12 q), morale +0,04 q dziennie, znajomość systemu +0,3 q dziennie. Plan asystenta w dniach obozu to szablon obozowy (dwa treningi w wybrane dni).

**Kluby AI** wybierają obóz raz na rundę z prestiżu i ligi: najbogatsze zimą Turcja (75 %) albo Hiszpania na 10-14 dni, średnie Turcja na 8-12 dni, słabsze Turcja albo Polska, najmniejsze Polska albo bez obozu; latem Austria, Słowenia albo Polska. Forma bazowa AI liczy się tym samym wzorem (szacunek) w kroku tygodniowym. Koszt: 54 losowania na rundę.

**Wiadomości.** Na początku okna przypomnienie o obozie, w dniu wyjazdu informacja, w dniu pierwszego meczu rundy raport formy bazowej od trenera przygotowania fizycznego.

## 12. Sparingi

Kod: `src/training/friendlies.js`.

- Terminy: okres przygotowawczy latem (do pierwszego meczu o punkty), przerwa zimowa po urlopie, okna FIFA. Zawsze 2 dni przerwy od innych meczów obu drużyn (`restOk`).
- Limity: 6 latem, 4 zimą, 2 na okno FIFA.
- Rywale: polskie kluby z tej samej albo niższej ligi z wolnym terminem (najbliższe poziomem) i kluby zagraniczne z poziomem od -1,5 do +3 (na obozie z kraju obozu, mecz na neutralnym boisku; poza obozem z krajów sąsiednich). Opis poziomu: od „Dużo słabszy” do „Dużo silniejszy”.
- Wpis w terminarzu: `{ id: SP-data-rywal, comp: 'friendly', round: 'F', date, time: '17:00', home, away, played: false, neutral, label: 'Sparing: nazwa' }`.
- W planie tygodnia sparing to dzień meczowy z rozruchem dzień wcześniej i regeneracją dzień później, ale nie przerywa okresu przygotowawczego ani mikrocyklu przed meczem o punkty.
- Skutki: połowa zgrania z meczu o punkty, obciążenie 85 % meczu (jedenastka 70 minut, ławka 25 minut), rytm. Zmęczenie, dług meczowy i ostrość daje rozegranie meczu w aplikacji.

**Źródła (obozy):**

- [Radio Kielce: Turcja i Hiszpania to najpopularniejsze kierunki](https://radiokielce.pl/1262111/turcja-i-hiszpania-to-najpopularniejsze-kierunki)
- [Górnik Zabrze: Turkey number one destination for winter manoeuvres of league players](https://www.gornikzabrze.pl/en/news/events/turkey-number-one-destination-winter-maneuvers-league-players)
- [Meczyki.pl: Jagiellonia, Wisła Kraków i czwartoligowiec, obóz w Turcji](https://www.meczyki.pl/newsy/pilka-nozna/jagiellonia-wisla-krakow-i-czwartoligowiec-nieoczywisty-uczestnik-obozu-w-turcji/290216)
- [Wisła Kraków: informacje o zgrupowaniu w Turcji](https://shop.wislakrakow.com/en/blogs/news/wi-wislawlarze-informacje-dotyczace-zgrupowania-w-turcji-2025-01-16)
- [Łódzki Sport: piłkarze Ekstraklasy ładują akumulatory głównie w Polsce i Austrii](https://lodzkisport.pl/pilkarze-pko-ekstraklasy-laduja-akumulatory-glownie-w-polsce-i-austrii)
- [Wroclaw.pl: Śląsk Wrocław rozpoczął obóz w Austrii](https://www.wroclaw.pl/sport/slask-wroclaw-rozpoczal-oboz-przygotowawczy-w-austrii-plan-sparingow)
- [Radio Kraków: plan letnich przygotowań Cracovii](https://www.radiokrakow.pl/aktualnosci/sport/znamy-plan-letnich-przygotowan-cracovii/)
- [Lech Poznań: zgrupowanie w Opalenicy](https://www.lechpoznan.pl/aktualnosci,2,kadra-na-zgrupowanie-w-opalenicy,27545.html)

## 13. Integracja (do zrobienia przez koordynatora)

Patrz raport modułu: import `src/training/index.js` w app.js, `ensureTraining` w `ensureGameShape`, ekran w zakładce „trening”, `training.css` w index.html, `trainingMatchInput` w `kickOff` (matchday.js), `npm run sw`.
