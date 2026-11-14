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
  Odstępne w otwartych transakcjach jest zarezerwowane w budżecie kupującego, a zawodnik w drodze liczy się do limitu kadry.
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
- `completeTransfer` (src/career/transfers.js) jest ostatnim krokiem. Transfer gracza po udanych rozmowach zaczyna
  się od testów medycznych. Wyjątek: działania zarządu przy limicie kadry (src/career/squadLimitSystem.js) zostają
  natychmiastowe, bo zarząd liczy kadrę od razu po działaniu.

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
(Turcja z większą wagą, Arabia Saudyjska, MLS). Kupiec to prawdziwy klub z danych o sile bliskiej poziomowi
zawodnika, inaczej opis („klub z ligi tureckiej”, „klub z MLS”). Reputacja kupca `30 + 9 (L - 11)` (prośby o transfer);
do decyzji zawodnika używamy reputacji w skali polskich klubów (prestiż x 7 + 25), bo wzór ligi daje kupcom
reputację niższą niż polskim klubom (Widzew 81, liga turecka 43) i zawodnicy nigdy by nie wyjeżdżali.
Tygodniowo w oknie, zawodnik z reputacją >= 40 albo do 23 lat z POT >= 13:
`pF = pBase (1 + (rep - 40)/15) x (do 25 lat 1,5; 30+ lat 0,4) x (średnia ocena >= 7,0 ? 1,5 : 1)`,
spec pBase = 0,006, po kalibracji 0,025. Kwota `wartość x U(0,9; 1,35)`, pensja `pensja x U(1,5; 3,0)`.
Klub AI sprzedaje, gdy kwota >= 0,85 ceny dla zagranicy (wartość x mnożnik reputacji; trzech najlepszych po pełnej
cenie wywoławczej) albo zawodnik prosi o transfer, nigdy poniżej minimum kadry. Gracz dostaje ofertę w poczcie
i w zakładce Oferty (najwyżej 2 otwarte naraz). Co druga sprzedaż za granicę dodaje do wolnych jednego
zawodnika z zagranicy na poziomie Ekstraklasy (klub reinwestuje pieniądze), inaczej poziom ligi spada.

## 5. Okna transferowe

Źródło lata 2026: transfery.info
(https://transfery.info/aktualnosci/kiedy-koniec-letniego-okna-transferowego-w-2026-roku/280982), koniec Sep 9, 2026.
Zima 2027 według szacunku: Jan 25 - Feb 24, 2027 [SZAC].
Gra ma Jul 1 - Sep 1, 2026 i Feb 1 - Feb 26, 2027 (`src/config/calendar2026.js`). Próba przestawienia dat
zepsuła 5 testów (budżety zarządu, rozwój AI, przystanki dni, karta zawodnika, ostatni dzień okna), więc daty
zostają; rozbieżność do decyzji osobno.

Wolny zawodnik, który stracił klub po zamknięciu ostatniego okna, nie może być zgłoszony przez gracza przed
kolejnym oknem (FIFA RSTP art. 6.1, `lateFree` w src/ui/transfersView.js). Zawodnicy wolni od lata (kontrakty
do Jun 30, wolni z puli startowej) są do zgłoszenia przez cały rok.

## 6. Interfejs

Zakładka Transfery, podzakładka „W toku”: transakcje twojego klubu z paskiem etapów, spodziewaną datą zgłoszenia
i przyciskiem wycofania, ostatnio zakończone, transakcje w Polsce, umowy od 1 lipca (przyjdą, odejdą), prośby
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
