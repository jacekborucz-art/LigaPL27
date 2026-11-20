# Silnik transferów: proces, prekontrakty, nastawienie, prośby o transfer, zagranica

Opracowanie: Nov 13, 2026. Wszystkie liczby oznaczone [SZAC] to wartości balansowe do strojenia.
Kod: `src/career/transferDeals.js`, `src/career/preContracts.js`, `src/career/mindset.js`,
`src/career/moveWish.js`, `src/career/foreignMarket.js`, `src/career/transferSystem.js` (system dnia „transfers”,
kolejność 53), widok `src/ui/transferDealsView.js` (zakładka Transfery, W toku), style `.td-` w `src/styles/transfers.css`.
Kalibracja: `node tools/transfery-kalibracja.mjs [klub] [ziarno] [sezony]`. Wypożyczenia są osobnym modułem (nie tutaj).

## 1. Transfer jako proces

Źródło etapów: Sky Sports, „How does a transfer work?”
(https://www.skysports.com/football/news/10558620/how-does-a-transfer-work).

Transakcja (`game.market.deals[]`) przechodzi etapy: porozumienie klubów, warunki osobiste, testy medyczne,
certyfikat ITC i podróż (tylko zagranica), ogłoszenie, zgłoszenie. Może upaść: warunki, testy medyczne,
koniec okna, wycofanie się strony.

| Rodzaj | Warunki | Testy | ITC i podróż | Ogłoszenie | Razem |
|---|---|---|---|---|---|
| Krajowy (gracz) | 1-2 | 1 | 0 | 0-1 | 2-4 dni |
| Zagraniczny | 2-4 | 1 | 1-3 | 1 | 5-9 dni |
| Wolny zawodnik | 0-2 | 1 | 0 | 0-1 | 1-4 dni |
| AI-AI | 0-1 | 1 | 0 | 0-1 | 1-3 dni |

- Czasy losowane raz przy założeniu z `Rng('deal:${seed}:${id}')`, zdarzenia (testy, termin okna) z osobnych ziaren
  tej samej transakcji, więc przebieg jest taki sam po zapisie i wczytaniu.
- Do zgłoszenia zawodnik zostaje w starym klubie na starej pensji. Od testów medycznych `p.transfer.hold = true`:
  `isAvailable` (src/career/squad.js) i studio meczowe go pomijają, kluby AI go nie wystawiają, a asystent zdejmuje
  go ze składu gracza przed meczem (`refreshTactics`).
- Zawodnik z otwartą transakcją nie dostaje innych ofert (oferty gracza, kluby AI, zagranica, prekontrakty).
  Odstępne w otwartych transakcjach (i w propozycjach w toku, rozdz. 10) jest zarezerwowane w budżecie kupującego,
  a zawodnik w drodze liczy się do limitu kadry.
- Testy medyczne: `pFail = 0,01 + 0,004 max(0, 10 - ODP) + (uraz ? 0,20 : 0) + (wiek >= 31 ? 0,01 : 0)`,
  ODP to ukryty atrybut odporności na urazy (`p.hidden.ODP`). Przy porażce 50 % renegocjacja (kwota -15 %),
  50 % koniec transakcji. Kupiec AI przy urazie ponad 28 dni wycofuje się w 70 %.
- Ostatni dzień okna: transakcje po testach medycznych są zgłaszane („zgłoszony w ostatniej chwili”) z ryzykiem
  porażki 5 % (krajowe) albo 12 % (zagraniczne); transakcje przed testami upadają. Kluby AI skracają etapy, żeby
  zdążyć; kluby zagraniczne nie zaczynają transakcji w ostatnich 3 dniach okna.
- Morale: +1, gdy zawodnik idzie do wyraźnie większego klubu (reputacja +10). Gdy gracz wstrzyma sprzedaż:
  morale -2 i niezadowolenie z szansą `0,3 + 0,03 (ambicja - 10)`.
- Listy w poczcie tylko dla transakcji gracza: „Porozumienie z X w sprawie Y”, „Y przeszedł testy medyczne”,
  „Y jest już w mieście” (zagranica), „Oficjalnie: Y zawodnikiem klubu X”, „Transfer Y upadł (powód)”.
  Transakcje AI-AI trafiają tylko do tygodniowego podsumowania rynku.
- `completeTransfer` (src/career/transfers.js) jest ostatnim krokiem. Udane rozmowy (gracza i klubu AI) to propozycja
  dla zawodnika, który namyśla się 2-5 dni (rozdz. 10); po jego zgodzie transakcja zaczyna się od testów medycznych.
  Wyjątki: działania zarządu przy limicie kadry (src/career/squadLimitSystem.js) zostają natychmiastowe, bo zarząd
  liczy kadrę od razu po działaniu; prekontrakty, wypożyczenia i prawo pierwokupu bez namysłu; sprzedaż za granicę
  ma własny etap warunków osobistych (2-4 dni).

## 2. Prekontrakty (umowa od 1 lipca)

Źródło: FIFA RSTP art. 18.3, opis w Goal
(https://www.goal.com/en/news/what-is-pre-contract-football-when-can-players-sign-them/blt5d41e839dacbcd34).
Zawodnik może podpisać umowę z innym klubem, gdy do końca kontraktu zostało najwyżej 6 miesięcy (kontrakty do
Jun 30: od Jan 1). Rozmowy o przedłużeniu z własnym klubem zaczynają się wcześniej (18 miesięcy,
`RENEW_WINDOW_MONTHS`), to inna reguła.

- Kto proponuje: gracz (karta zawodnika, przycisk „Umowa od Jul 1”, ekran rozmów w trybie prekontraktu, bez odstępnego),
  kluby AI (1. dnia miesiąca Jan-May, najwyżej jedna propozycja, gdy klubowi brakuje zawodników z kontraktem na
  przyszły sezon w grupie pozycji), kluby zagraniczne (zawodnicy z reputacją >= 45).
- Art. 18.3 wymaga poinformowania obecnego klubu: gracz dostaje list „Agent: X pyta o Y”, potem ostrzeżenie
  „Y rozmawia z X” (ostatnia szansa na przedłużenie) i „Y podpisał umowę z X od Jul 1, 2027”.
- Decyzja zawodnika w poniedziałki od stycznia, oferty porównane z ofertą własnego klubu:
  `U = moneyW ln(pensja/pensja_ref) + 0,03 (rep klubu - rep zawodnika) ambW + 0,25 roleW (rola - 2) + 0,3 Europa
  + (zagranica ? 0,5 chęć wyjazdu : 0) + (własny klub ? 0,04 (lojalność - 10) + 0,004 (zaufanie - 50) : 0) + N(0; 0,08)`,
  szum z `Rng('prekontrakt:${seed}:${pid}:${tydzień}')`. Podpis najlepszej oferty, gdy `U >= T`,
  `T = 0,6 - 0,08 x miesiące od Jan 1 - 0,4 D`, i gdy jest lepsza od oferty własnego klubu.
  Cechy: moneyW i roleW z `elementPrefs` (src/career/personality.js), ambW = 1 + 0,05 (ambicja - 10),
  chęć wyjazdu z ambicji, ryzyka i przywiązania (nastawienie „zagranica” = 1).
  Ofertę pozostania ma zawodnik gracza zawsze, zawodnik AI tylko wtedy, gdy klub AI przedłużyłby jego kontrakt
  (te same kryteria co `aiRenewals`).
- Po podpisie `p.preContract = { club, foreign, start: 'YYYY-07-01', signedOn, contract }`: brak innych ofert,
  brak przedłużenia (rozmowy zwracają powód `preContract`), znacznik „porozumienie z X od Jul 1, 2027”.
- Zimą obecny klub może sprzedać zawodnika wcześniej tylko do klubu z prekontraktu, cena
  `wartość x 0,25 x miesiące do końca / 6`. Kluby AI robią to z szansą 0,25 w tygodniu, gdy brakuje im zawodników
  na tej pozycji; gracz dostaje ofertę albo sam ściąga zawodnika przyciskiem w karcie.
- 1 lipca rollover przenosi zawodników do nowych klubów przed wygaśnięciem kontraktów (zagranica: `p.abroad`,
  `clubId = null`, zawodnik zostaje w świecie gry dla historii). Premia za podpis i prowizja agenta księgowane 1 lipca.
  Klub, który spadł do III ligi, traci umowę.
- Ograniczenia gracza: najwyżej 4 aktywne prekontrakty, kadra na przyszły sezon (kontrakty po Jun 30 i prekontrakty)
  nie większa niż maksimum kadry, progi zarządu jak przy transferze, prekontraktu nie da się zerwać.
- „Spakowana walizka”: modyfikator gry `transferMind` (src/engine/modifiers.js) dla zawodnika z umową w innym
  klubie, `clamp(-0,03 (12 - profesjonalizm), -0,25, +0,05)` punktu atrybutu; Lider co najmniej +0,02.

## 3. Nastawienie D (gotowość do zejścia poziom niżej)

Poniedziałki, `p.stepDown` w zakresie 0-1:
`D = clamp(D_wiek + D_bez klubu + D_brak ofert + D_charakter, 0, 1)`.

- `D_wiek`: 33+ lat 0,2; 30-32 lat 0,1.
- `D_bez klubu = 0,6 (1 - exp(-m/τ))`, m miesiące bez klubu, τ: do 21 lat 3, 22-27 lat 5, 28-31 lat 4, 32+ lat 2,5.
- `D_brak ofert = min(0,4; 0,08 x miesiące od Jan 1 bez oferty na jego poziomie)`, tylko przy kontrakcie
  kończącym się w tym sezonie.
- `D_charakter = -0,015 (ambicja - 10) - 0,01 (ego - 10) + 0,01 (lęk przed niepewnością - 10)
  - 0,05 clamp(POT - OVR, 0, 4)`, Ambitny -0,1, Spokojny +0,05.
- W `willingnessToJoin`: różnica reputacji pomniejszona o 25 D, próg twardej odmowy 30 + 20 D, kara za niższą ligę
  x (1 - D). Powód w karcie: „Długo bez klubu, obniżył wymagania” albo „Brak ofert, obniżył wymagania”.
- Wolny zawodnik: `żądanie_eff = max(0,6 rynek, żądanie x (1 - 0,45 D_bez klubu))`. W rozmowach gracza podstawą
  jest pensja rynkowa klubu, obniżana tym samym wzorem. `p.freeSince` ustawiane także w `addFreeAgents` i przy
  rozwiązaniu kontraktu.
- Emerytura: wolny zawodnik 32+ po 6 miesiącach bez klubu kończy karierę z szansą 0,15 w miesiącu.

## 4. Prośby o transfer i kupcy z zagranicy

Prośba (`p.moveWish`) powstaje:
- po odrzuceniu oferty klubu o reputacji co najmniej o 10 wyższej albo oferty z zagranicy z pensją >= 1,5 obecnej:
  `P = 0,25 + 0,03 (ambicja - 10) + 0,02 (ego - 10) - 0,03 (lojalność - 10) + (rep zawodnika - rep klubu > 15 ? 0,15 : 0)
  + (21-27 lat ? 0,1 : 0) - (kontrakt podpisany < 6 miesięcy temu ? 0,15 : 0)`. Zawodnik klubu AI dowiaduje się
  o odrzuconej ofercie z zagranicy w 50 % przypadków [SZAC];
- z ryzyka miesięcznego (1. dnia miesiąca, `Rng('prosba-transfer:${seed}:${pid}:${YYYY-MM}')`):
  `h = base x f_rep x f_ławka x f_odmowa x f_wiek x f_charakter x f_miesiąc` (najwyżej 0,08), f_rep = 1 + max(0,
  rep zawodnika - rep klubu - 10)/10, f_ławka 2,5 (udział minut < 0,35 przy >= 6 meczach), f_odmowa 3 (odmówił
  przedłużenia), f_wiek 1,5 (21-27) albo 0,5 (31+), f_charakter = (1 + 0,08 (ambicja - 10)) (1 - 0,05 (lojalność - 10))
  x (niezadowolony ? 2 : 1), f_miesiąc 2 (Jun-Aug, Jan-Feb) albo 0,5; 0 przy prekontrakcie, x0,2 po transferze
  w ostatnich 180 dniach. Spec podaje base = 0,003; po kalibracji base = 0,0008, bo większość próśb pochodzi
  z odrzuconych ofert.

Przebieg: etap cichy (agent daje znać, morale -1), po 4 tygodniach bez reakcji oficjalna prośba
(`p.transferRequest = true`). Reakcje gracza (list w poczcie i karta zawodnika): lista transferowa (morale +2),
obietnica zgody na ofertę większego klubu od wartości zawodnika (złamana: morale -2,5, zaufanie -20, licznik złamanych
obietnic jak przy obietnicy roli), podwyżka (rozmowy o przedłużeniu z bonusem +0,15 do chęci pozostania, także przed
oknem 18 miesięcy), rozmowa (`pCalm = 0,35 + 0,03 (lojalność - 10) - 0,03 (ambicja - 10) + 0,004 (zaufanie - 50)`,
raz na 14 dni), odmowa (morale -3, przy oficjalnej prośbie modyfikator gry -0,15). Po zamkniętym oknie bez oferty
zawodnik odpuszcza z szansą 30 % w miesiącu. Kluby AI: 60 % lista transferowa (0,95 wartości), 30 % podwyżka
i przedłużenie, 10 % nic (zawodnik niezadowolony). Integracja z rozmowami z Kadry jest uproszczona: reakcja
„Porozmawiaj” liczy się jako rozmowa trenera (licznik uwagi, src/career/attention.js), ale ma własny limit 14 dni.

Kupcy z zagranicy: ligi z `src/data/kluby_uefa.json` o sile >= Ekstraklasa - 0,5 (L >= 11,5) oraz rynki pieniężne
(Turcja z większą wagą, Arabia Saudyjska, MLS). Kupiec to zawsze prawdziwy klub o sile bliskiej poziomowi
zawodnika: z `kluby_uefa.json` (czołówka) i z `src/data/kluby_swiat.js` (ok. 950 klubów średniego i niższego
poziomu w 95 krajach, także puli obcokrajowców i skautingu; nazwy z ogólnej wiedzy, siła [SZAC]). Okno siły:
od L - 0,8 do L + 2,5, potem od L - 1,5 do L + 3,5, na końcu najbliższe pod względem L; opis („klub z ligi
tureckiej”) tylko, gdy kraj nie ma żadnego klubu. Te same dane i okna (od -1,2 do +1,8, potem od -2,2 do +3)
wybierają klub zawodnika z puli (`foreignPool.js`). Zawodnicy już za granicą zachowują zapisaną nazwę klubu. Reputacja kupca `30 + 9 (L - 11)` (prośby o transfer);
do decyzji zawodnika używamy reputacji w skali polskich klubów (prestiż x 7 + 25), bo wzór ligi daje kupcom
reputację niższą niż polskim klubom (Widzew 81, liga turecka 43) i zawodnicy nigdy by nie wyjeżdżali.
Tygodniowo w oknie, zawodnik z reputacją >= 40 albo do 23 lat z POT >= 13:
`pF = pBase (1 + (rep - 40)/15) x (do 25 lat 1,5; 30+ lat 0,4) x (średnia ocena >= 7,0 ? 1,5 : 1)`,
spec pBase = 0,006, po kalibracji 0,025, od dynamicznej reputacji 0,033 (rezerwowi Ekstraklasy mają niższą reputację, `docs/reputacja.md`). Kwota `wartość x U(0,9; 1,35)`, pensja `pensja x U(1,5; 3,0)`.
Klub AI sprzedaje, gdy kwota >= 0,85 ceny dla zagranicy (wartość x mnożnik reputacji; trzech najlepszych po pełnej
cenie wywoławczej) albo zawodnik prosi o transfer, nigdy poniżej minimum kadry. Gracz dostaje ofertę w poczcie
i w zakładce Oferty (najwyżej 2 otwarte naraz). Co druga sprzedaż za granicę dodaje do wolnych jednego
zawodnika z zagranicy na poziomie Ekstraklasy (klub reinwestuje pieniądze), inaczej poziom ligi spada.

## 5. Okna transferowe

Źródło lata 2026: transfery.info
(https://transfery.info/aktualnosci/kiedy-koniec-letniego-okna-transferowego-w-2026-roku/280982), koniec Sep 9, 2026.
Zima 2027 według szacunku: Jan 25 - Feb 24, 2027 [SZAC].
Gra ma lato od 1 lipca do 9 września co roku (decyzja właściciela Nov 20, 2026, v1.21 Beta; ruchomy kalendarz
nie przesuwa końca okna, `setSeasonYear` w `src/config/calendar2026.js`) i zimę Feb 1 - Feb 26.

Wolny zawodnik, który stracił klub po zamknięciu ostatniego okna, nie może być zgłoszony przez gracza przed
kolejnym oknem (FIFA RSTP art. 6.1, `lateFree` w src/ui/transfersView.js). Zawodnicy wolni od lata (kontrakty
do Jun 30, wolni z puli startowej) są do zgłoszenia przez cały rok.

## 6. Interfejs

Zakładka Transfery, podzakładka „W toku”: propozycje czekające na odpowiedź zawodnika i ostatnie odpowiedzi
(rozdz. 10), transakcje twojego klubu z paskiem etapów, spodziewaną datą zgłoszenia i przyciskiem wycofania, ostatnio zakończone, transakcje w Polsce, umowy od 1 lipca (przyjdą, odejdą), prośby
o transfer. Kontrakty: znaczniki „porozumienie z X od Jul 1, 2027”, „chce odejść”, „prosi o transfer”,
„transfer w toku”. Karta własnego zawodnika: panel prośby o transfer z reakcjami, transakcja w toku. Karta zawodnika
innego klubu: „Umowa od Jul 1” (do 6 miesięcy przed końcem kontraktu), wcześniejszy transfer zimą, stan transakcji.

## 7. Kalibracja (Nov 13, 2026)

Kontekst: polskie kluby sprzedały w sezonie 2024/25 zawodników za rekordowe 220 mln zł (Soccerway, raport
finansowy Ekstraklasy:
https://pl.soccerway.com/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-raport-finansowy-ekstraklasy-rekordowe-wp-ywy-dla-klubow-w-sezonie-2024-25/xYPovGUb).

`node tools/transfery-kalibracja.mjs widzew <ziarno> 3`, gracz bez decyzji (oferty dla gracza wygasają).
Wartości na sezon 2026/27, 2027/28, 2028/29:

| Ziarno | AI-AI | Za granicę z EK | Prośby w EK | Prekontrakty EK | w tym zagranica | OVR top14 EK |
|---|---|---|---|---|---|---|
| 5 | 34 / 54 / 42 | 41 / 25 / 18 | 20 / 18 / 19 | 33 / 29 / 52 | 10 / 3 / 10 | 11,61 / 11,53 / 11,69 |
| 11 | 46 / 54 / 59 | 44 / 15 / 23 | 19 / 19 / 15 | 36 / 40 / 48 | 6 / 6 / 2 | 11,55 / 11,54 / 11,61 |
| 23 | 34 / 37 / 56 | 40 / 25 / 19 | 20 / 22 / 23 | 33 / 39 / 58 | 8 / 8 / 6 | 11,66 / 11,76 / 11,84 |

Przed zmianą: AI-AI 48 / 37, OVR top14 EK 11,55 / 11,58 (ziarno 5). Prekontrakty EK liczone, gdy sprzedający albo
kupujący gra w Ekstraklasie. Kluby AI z ujemnym saldem: 0 we wszystkich przebiegach. Ofert z zagranicy za
zawodników gracza: 2-11 na sezon (gracz decyduje, cel 1-3 sprzedaży). Czas symulacji sezonu: 3,2-3,7 s (przed: 3,9-4,9 s).

Do obserwacji: transfery AI-AI w trzecim sezonie rosną do 56-59 (cel 35-45), prekontrakty w trzecim sezonie do 48-58
(cel 30-45), prekontrakty zagraniczne średnio 6,6 (cel 8-12), sprzedaże za granicę spadają po pierwszym sezonie
(pierwszy sezon wyprzedaje najlepszych).

## 8. Stare zapisy

`ensureTransferState` (wywoływane w `ensureCareer`) tworzy `game.market.deals` i `game.market.pre`.
Brak `p.freeSince`, `p.stepDown`, `p.moveWish` oznacza wartości domyślne. Statystyki kalibracji: `game.market.tstats`.

## 9. Zawodnicy z zagranicy na rynku

Moduł `src/career/foreignPool.js`, lista `game.market.foreign`, w interfejsie Transfery > Rynek > „Z zagranicy”.
Na rynku jest ok. 100 obcokrajowców zainteresowanych grą w Polsce. Wszystkie liczby [SZAC].

Narodowości (region, potem kraj z wagą w regionie):

| Region | Udział | Kraje (waga) |
|---|---|---|
| Ameryka Południowa | 24 % | BRA 3, ARG 2, COL 1,5, URU 1, ECU 1, PAR 0,8, VEN 0,6, CHI 0,6, PER 0,5 |
| Afryka | 24 % | NGA 1,5, GHA 1,2, SEN 1,2, CIV 1,2, CMR 1, MAR 0,8, ALG, TUN, MLI, GUI, COD po 0,6 |
| Bałkany | 24 % | SRB 1,5, CRO 1,2, SVN 1, BIH 1, MKD, MNE, ALB, BUL po 0,8, KOS 0,6 |
| Bliski Wschód | 7 % | ISR 1,2, LBN 1, JOR 1, IRQ 1, SYR 0,8 |
| Europa Wschodnia | 7 % | UKR 2, GEO 1 |
| Skandynawia | 6 % | SWE, NOR, DEN po 1,2, FIN 0,8, ISL 0,6 |
| Hiszpania, Portugalia | po 4 % | ESP, POR |

Poziomy (L dla `genPlayer`, przesunięcie -0,4, premia obcokrajowca ligi 1):

| Poziom | Udział | L | Wiek | Szansa, że wolny |
|---|---|---|---|---|
| Czołówka Ekstraklasy | 25 % | 12,0-12,8 | 23-30 | 10 % |
| Ekstraklasa i 1 Liga | 45 % | 10,6-11,8 | 21-31 | 55 % |
| Perspektywiczni | 30 % | 9,5-10,5 | 18-21, POT co najmniej OVR + 2-4,5 | 60 % |

Razem ok. 45 % wolnych. Najlepsi rzadko są wolni, bo przy wolnych z poziomu czołówki siła lig rosła (niżej).

Wolny zawodnik z puli to zwykły wolny zawodnik (`p.free`, `p.askWage`, `p.freeSince`, `game.market.free`):
oczekuje pensji obcokrajowca w Ekstraklasie (rynek x1,5 x U(0,85; 1,1)), podpisują go gracz i kluby AI jak
każdego wolnego. Zawodnik z kontraktem ma `p.clubId = null`, `p.free = false`, `p.foreignPool = true`, kontrakt na
1-3 lata i `p.abroad = { country, countryName, club, clubId, league, rep, vt, priceMul, since }` (ten sam kształt co
po sprzedaży za granicę w `completeAbroad`, plus poziom ligi i cena). Klub to prawdziwy klub z `kluby_uefa.json`
z kraju zawodnika o sile L między OVR - 1,2 a OVR + 1,8, inaczej opis „klub z ligi brazylijskiej” (przymiotnik
z mapy w module). Siła lig spoza danych UEFA jest szacowana (Brazylia 12,8, Argentyna 12,4, Maroko 10,6,
Nigeria 8,6, Liban 8,0 i inne). Pensja w klubie zagranicznym: rynek Ekstraklasy x 0,5-0,95 według siły ligi.

Cena wywoławcza: `wartość rynkowa (poziom ligi klubu) x mnożnik ligi`, najmniej 25 tys. zł. Mnożnik: ligi słabsze
niż 10,5 od 1,0 do 1,15, ligi od 12 oraz Hiszpania i Portugalia od 1,3 do 1,5, pozostałe od 1,15 do 1,3.
Nastawienie zawodnika liczy klub sprzedający z reputacją ligi w skali polskich klubów: prawdziwy klub
prestiż x 7 + 25, opis ligi `30 + 9 (L - 11) + 25` (ten sam wzór co kupcy z zagranicy), poziom ligi 1-3 z L.

Kupno przez gracza (`offerForForeign`, `offerForPlayer` przekazuje do niej zawodników z puli): okno transferowe,
budżet z odstępnym w otwartych transakcjach, weto zarządu (`checkUserFee`), limit kadry, kontroferta od 0,82 ceny,
po trzech za niskich ofertach przerwa 14 dni. Po zgodzie klubu ekran rozmów z `fromClub` jako klub zagraniczny,
potem transakcja typu „zagraniczny” z etapem certyfikatu ITC i podróży (`d.origin`, `startDeal` rozpoznaje
zawodnika z puli sam). Przy zgłoszeniu odstępne idzie z kasy kupującego, po stronie sprzedającego nie ma
polskiego klubu (historia: `fromName`, `country`). Zawodnik traci `p.abroad` i wypada z puli.

Kluby AI: wolnych z puli podpisują zwykłą drogą. Zawodnika z kontraktem rozważają rzadko: przy 10 % zakupów
(`Rng('zagranica-ai:${seed}:${klub}:${data}')`), tylko lepszego od progu grupy, za najwyżej połowę wolnych środków.
Przy okazji zakup AI wybiera najlepszego chętnego z pięciu pierwszych kandydatów, a przy brakach w kadrze najpierw
takich, których pensja mieści się w budżecie płac (wcześniej odmowa albo zbyt wysoka pensja najlepszego
blokowała zakup co tydzień, np. bramkarz po powrocie z wypożyczenia).

Uzupełnienie: nowa gra tworzy 100 zawodników (`createMarket`), stary zapis raz, leniwie w `ensureTransferState`
(flaga `game.market.foreignPoolV1`). Raz na okno (7 dni przed otwarciem albo pierwszego dnia okna, `foreignTop`):
odpadają zawodnicy, którzy trafili do polskiego klubu albo zniknęli z wolnych; najlepsi z wygasłym kontraktem
przedłużają go za granicą, pozostali z wygasłym kontraktem zostają na rynku jako wolni; 15 % zawodników
z kontraktem (bez rozmów i transakcji w toku) zostaje za granicą i znika ze świata gry; braki do 100 to nowi
zawodnicy (`Rng('zagranica:${seed}:${okno}')`, identyfikatory `zag-${okno}-${n}`).

Wolni z zagranicy przychodzą teraz także z puli, więc letnia dostawa importów w `addFreeAgents` spadła z 22 do 8
zawodników (src/season/rollover.js).

Kalibracja (Nov 14, 2026), `node tools/transfery-kalibracja.mjs widzew <ziarno> 3`, OVR top14 Ekstraklasa / 1 Liga
po sezonach 2026/27, 2027/28, 2028/29:

| Ziarno | Przed | Po |
|---|---|---|
| 5 | 11,55 / 11,55 / 11,66; 10,08 / 10,14 / 10,16 | 11,62 / 11,59 / 11,75; 10,07 / 10,30 / 10,14 |
| 7 | 11,53 / 11,61 / 11,81; 10,04 / 10,21 / 10,12 | 11,60 / 11,62 / 11,70; 10,08 / 10,24 / 10,22 |
| 9 | 11,58 / 11,64 / 11,79; 10,09 / 10,26 / 10,17 | 11,58 / 11,69 / 11,63; 10,14 / 10,20 / 10,22 |

Średnio Ekstraklasa 11,64 przed i 11,64 po, 1 Liga 10,14 i 10,18, 2 Liga 8,60 i 8,55. Pierwsza wersja (wolni
z czołówki co czwarty, importy 22, przesunięcie -0,3) podnosiła Ekstraklasę do 11,85-11,90 w trzecim sezonie.
Z puli w sezonie: 17-23 wolnych podpisanych przez transakcje i 3-6 kupionych przez kluby AI (ziarno 5,
`tstats.poolFree`, `poolBought`), uzupełnienia 21-69 zawodników na okno.


## 10. Namysł zawodnika przed podpisem (Nov 20, 2026)

Decyzja właściciela: kluby AI nie mogą „przechwytywać” zawodników z rynku z dnia na dzień, a gracz musi móc złożyć
kontrofertę. Kod: `src/career/proposals.js` (stan `game.market.pending`), system dnia „transfers” (decyzje codziennie,
przed transakcjami), ekran rozmów (`src/ui/negotiationView.js`), widoki w `src/ui/transferDealsView.js`.
Testy: `tests/proposals.test.mjs`. Wszystkie liczby [SZAC].

Przebieg:
- Udane rozmowy (gracza na ekranie rozmów, klubu AI przez `aiNegotiate`) kończą się propozycją dla zawodnika, nie
  podpisem. Dotyczy wolnych zawodników i zawodników z klubem (po porozumieniu klubów), także z puli zagranicznej
  i oferty klubu AI za zawodnika gracza (gracz przyjmuje ofertę, potem namyśla się jego zawodnik).
- Namysł: 3 dni + RNG od -1 do +2, czyli 2-5 dni, `Rng('namysl:${seed}:${zawodnik}:${klub}:${data}')`. Zawodnik
  z klubem decyduje najpóźniej w ostatnim dniu okna (decyzja = min(namysł, koniec okna)); wolny zawodnik bez limitu
  (reguła `lateFree` bez zmian). Propozycja złożona w trakcie namysłu dołącza do tej samej decyzji.
- W czasie namysłu zawodnik nie jest zajęty: dostaje propozycje gracza i klubów AI, najwyżej jedną od klubu.
  Zajęty jest dopiero po wyborze (otwarta transakcja). Klub AI z propozycją w toku nie składa w tym tygodniu kolejnej,
  a zawodnika, który już rozważa propozycje, ocenia o 1,2 OVR niżej za każdą (woli cel bez licytacji). Klub,
  któremu w ostatnim tygodniu zawodnik odmówił albo wybrał inny klub, szuka dalej w najbliższym tygodniu rynku.
- Odstępne propozycji w toku jest zarezerwowane (`pendingFees`). Do limitu kadry zawodnik liczy się dopiero po
  wyborze (transakcja); gdy w dniu decyzji kadra klubu jest pełna, propozycja przepada.

Decyzja (dzień namysłu, `Rng('namysl-decyzja:${seed}:${zawodnik}:${data}')`):
- Każda propozycja dostaje użyteczność ze wzoru prekontraktów (rozdz. 2, `offerUtility`: pieniądze z `moneyW`,
  prestiż klubu z ambicją, rola z `roleW`, puchary; premia za podpis rozłożona na tygodnie kontraktu) z szumem
  N(0; 0,08). Odniesienie: zawodnik z klubem porównuje z pozostaniem (ta sama funkcja dla obecnego klubu z lojalnością
  i zaufaniem; -0,2, gdy jest na liście transferowej, -0,3, gdy jest niezadowolony albo prosi o transfer); wolny
  zawodnik z ofertą klubu o reputacji o 15 wyższej od własnej przy oczekiwanej pensji, minus 0,4 x gotowość do zejścia
  niżej (rozdz. 3).
- Propozycje od najlepszej: szansa zgody `clamp(0,78 + 0,4 (U - U_odniesienia), 0,5; 0,92)`; bez zgody 60 %
  „chce zmian”, 40 % odmowa. Pierwsza zgoda wygrywa, pozostałe kluby dostają „wybrał inny klub”. Odmowa przechodzi
  do następnej propozycji.
- Odpowiedzi dla gracza (list „Agent zawodnika X” w poczcie, odnośniki do W toku i karty zawodnika):
  - zgoda: transakcja od testów medycznych (rozdz. 1), morale +2;
  - odmowa: zawodnik nie rozmawia z klubem 14 dni (blokada bez urazy);
  - wybrał inny klub (z nazwą);
  - chce zmian: pensja wyżej o 8-18 %, ostatnia runda rozmów do 2 dni (najpóźniej koniec okna). Ekran rozmów
    w trybie ostatniej rundy: zawodnik stawia ultimatum, jedna oferta. Warunki zawodnika albo lepsze to podpis od razu
    (bez kolejnego namysłu), słabsza oferta albo „Zakończ rozmowy” kończy propozycję ze zwykłymi skutkami fiaska
    (docs/negocjacje.md, rozdz. 7). Brak odpowiedzi do terminu: propozycja wygasa. Inne propozycje czekają do końca
    ostatniej rundy.
- Klub AI przy „chce zmian” robi to, co w drugiej rundzie `aiNegotiate`: pensja +10 %, jeśli mieści się w budżecie
  z rozmów, inaczej rezygnuje.
- Propozycja przepada, gdy zawodnik zmienił klub, ma inną transakcję albo prekontrakt, zamknęło się okno, trener
  zmienił klub albo zabrakło pieniędzy.
- Ostatni dzień okna: systemy dnia już się wykonały, więc propozycja gracza (i przyjęcie oferty klubu AI za jego
  zawodnika) dostaje odpowiedź od razu, a transakcja jest zgłaszana w ostatniej chwili jak dotąd.

Interfejs: ekran rozmów po porozumieniu pokazuje „Propozycja złożona, zawodnik odpowie ok. <data>” i przycisk
„Wróć do transferów”. Transfery > W toku: „Propozycje czekają na odpowiedź” (status, „Wycofaj propozycję”, przy
„chce zmian” przycisk „Ostatnia runda rozmów”) i „Ostatnie odpowiedzi zawodników”. Karta transferowa: twoja
propozycja w toku albo „Rozważa oferty, odpowie do <data>” (bez wyniku); karta w okienku: wiersz „Status”.
Kwadrat „TR” z obrysem przy nazwisku i znacznik „rozważa ofertę” w Kontraktach. Ostatnia runda trafia do listy
„Do zrobienia” na Pulpicie.

Zapis: `game.market.pending` (propozycje, zamknięte trzymane 60 dni) i `pendingSeq`; stary zapis dostaje pustą listę
(`ensureProposals` w `ensureTransferState`). Rozmowy przy podpisaniu nie nadpisują już kontraktu zawodnika
(`applyOutcome` zapisuje nowy kontrakt tylko przy przedłużeniu), bo zawodnik zostaje na starym kontrakcie do zgłoszenia.

Kalibracja (Nov 20, 2026, `node tools/transfery-kalibracja.mjs widzew <ziarno> 3`), OVR top14 Ekstraklasy po
sezonach 2026/27, 2027/28, 2028/29:

| Ziarno | Przed | Po |
|---|---|---|
| 5 | 11,60 / 11,77 / 11,83 | 11,57 / 11,70 / 11,69 |
| 7 | 11,66 / 11,72 / 11,84 | 11,62 / 11,77 / 11,75 |
| 9 | 11,69 / 11,89 / 11,85 | 11,66 / 11,85 / 11,74 |
| 11 | 11,55 / 11,70 / 11,78 | 11,64 / 11,64 / 11,71 |
| 23 | 11,66 / 11,88 / 11,88 | 11,67 / 11,87 / 11,76 |

Średnio Ekstraklasa 11,63 / 11,79 / 11,84 przed i 11,63 / 11,77 / 11,73 po, 1 Liga 10,16 / 10,27 / 10,33 przed
i 10,12 / 10,31 / 10,30 po. Propozycje klubów AI w sezonie: 54-106, zgoda 78-87 %, wybrał inny klub 1-9, odmowa
2-9, nieaktualne 1-7. Wolni podpisani przez kluby AI ok. 7 % mniej w dwóch pierwszych sezonach, transakcje ogółem
podobnie (110-150 na sezon). Kluby AI z ujemnym saldem: 0. Do obserwacji: trzeci sezon Ekstraklasy niżej
o ok. 0,1 OVR we wszystkich pięciu ziarnach (pierwsze dwa sezony bez zmian); pierwsza wersja bez kary za licytację
dawała 28 przegranych propozycji w sezonie i 11,51 po pierwszym sezonie.

## Rotacja wolnych zawodników (Nov 14, 2026)

1. dnia każdego miesiąca wolny zawodnik, który długo nie znajduje klubu, może zniknąć z rynku (koniec kariery, gra za granicą albo w niższej lidze) [SZAC]: pierwsze 2 miesiące bez zmian, potem 8 % i +5 % za każdy kolejny miesiąc (najwyżej 45 %), zawodnicy 30+ x1,5, weterani 32+ po pół roku co najmniej 15 %. Na jego miejsce od razu pojawia się nowy, losowy wolny zawodnik (za zawodnika z puli zagranicznej: nowy z puli, za pozostałych: zwykły wolny), dopóki na rynku jest mniej niż 150 wolnych. Na każdej grupie pozycji zawsze zostaje kilku wolnych (bramkarze 8, obrońcy i pomocnicy 14, napastnicy 10), bo kluby AI uzupełniają nimi braki w kadrze. Kluby AI z brakiem w kadrze wybierają najpierw najlepszego z wolnych, na których je stać (`aiBuy`).

## Karta zawodnika w okienku (Nov 20, 2026, v1.19 Beta)

- Nazwisko zawodnika w Transferach działa jak link (podkreślone): kliknięcie otwiera jego kartę w okienku nad listą,
  bez przechodzenia na inny ekran. Dotyczy rynku (wszystkie listy), Kontraktów, W toku, wypożyczeń i list zawodników.
  Kliknięcie reszty wiersza jak dotąd otwiera kartę transferową.
- Okno to ta sama karta co w Skład i taktyka (`renderPlayerCard`, `src/ui/playerCard.js`): na PC pływające okno
  (przeciąganie za pasek, położenie zapamiętane), na telefonie okno modalne od dołu. Zamyka się krzyżykiem, Escape
  albo dotknięciem tła.
- Treść jak w profilu zawodnika: atrybuty, pozycje, forma, statystyki, do tego klub, kontrakt, wartość, cena
  i przycisk „Przejdź do oferty” (własny zawodnik: „Otwórz kartę transferową”, morale zamiast ceny).
- Kod: `transferCardHtml` i `cardLink` w `src/ui/transfersView.js`, otwieranie i zamykanie (`state.tfCard`) w `src/app.js`.

