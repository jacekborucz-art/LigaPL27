# Sztab: zatrudnianie i zwalnianie

Stan: Nov 16, 2026. Logika: `src/career/staffMarket.js` (liczby w `STAFF_MARKET`), testy: `tests/staffMarket.test.mjs`.
Projekt logiki i research powstały w sesji (projekt.md, research.md, ekran.md). Wszystkie liczby bez źródła to [SZAC].

## 0. API dla programisty UI (skrót)

Wszystkie funkcje z `src/career/staffMarket.js`. Każda sama woła `ensureStaff(game)` (stary zapis działa). Teksty przez `esc()`.

| Funkcja | Zwraca / robi |
|---|---|
| `staffSummary(game, clubId?)` | `{ limit, used, staff, pending, pay, budget, room, roles: { rola: { name, q, vacant, max, people: [{ ...osoba, qNow, canRenew, severance }] } } }`; `max: 0` = rola niedostępna w lidze (skaut w III lidze: ukryć) |
| `STAFF_ROLE_ORDER` | kolejność ról w UI: asystent, fizyczny, bramkarze, mlodziez, analityk, fizjoterapeuta, skaut, kierownik (dyrektor sportowy osobno, rozdz. 5a) |
| `directorOf(game, clubId)` | dyrektor sportowy klubu (osoba) albo null (wakat); `clubStaffPay` pensje sztabu z dyrektorem |
| `rosterOf(game, clubId)` | osoby sztabu klubu (też rywala, tylko do odczytu) |
| `staffLimit(game, clubId?)` | `{ limit, staff, pending, used, free, roles: { rola: { n, max, pending } } }` (oferty w toku wliczone) |
| `staffBudget(game, clubId?)` | `{ budget, pay, pending, room }` w zł miesięcznie; `budgetRoomFor(game, clubId, rola)` uwzględnia zgodę zarządu na +20 % przy wakacie w rdzeniu |
| `listFreeStaff(game, { role, foreign, minQ, maxWage, noOffers })` | lista wolnych: `{ id, name, nat, age, role, roleName, q: { v, lo, hi, prec, label }, wage: { lo, mid, hi }, idleDays, offers, decideOn, mine }` |
| `listClubStaff(game, filtry)` | osoby z innych klubów (podbieranie), wiersze jak wyżej oraz `{ club, until, comp, blocked }` (`blocked`: klucz `STAFF_REASONS` albo null) |
| `seenQuality(game, osoba, clubId?)` | jakość widziana przez asystenta klubu: `prec` `exact` (pokaż `lo`), `approx` (pokaż `lo-hi`), `vague` (pokaż `label`) |
| `expectedWage(osoba, date)` | oczekiwana pensja zł / mies. (pokazywać jako przedział z `listFreeStaff`, nie liczbę) |
| `offerHint(game, { pid, wage, years, lead })` | `{ level, word, k, reasons[<=3], weak }`: Chętny / Raczej przyjmie / Może się wahać / Raczej odmówi / Odrzuci od razu; bez liczb |
| `clubAppeal(game, pid)` | „Zainteresowanie naszym klubem”: `{ word, k, reason }` |
| `checkOffer(game, { pid, wage, years })` | te same warunki co `makeOffer`, bez zmian w grze: `{ ok, reason, text }` (formularz oferty) |
| `makeOffer(game, { pid, wage, years, lead })` | `{ ok, reason, text, offer, decideOn }`; `years` 1-3 (zimą także 0 = do końca sezonu); `lead` obietnica roli lidera (działa tylko, gdy kandydat byłby najlepszy w roli) |
| `pendingOffers(game, clubId?)` | oferty w toku: `{ offer, person, decideOn, offers }` (liczba ofert bez kwot i klubów) |
| `fireStaff(game, pid)` | `{ ok, reason, text, cost }`; odprawę pokaż wcześniej przez `severanceOf(osoba, date)` |
| `renewStaff(game, { pid, wage, years })` | `{ ok, reason, text }`; dostępne, gdy `canRenew(osoba, date)` (od 1 stycznia ostatniego roku umowy) |
| `STAFF_REASONS` | teksty powodów odmowy formularza (`limit`, `roleFull`, `budget`, `low`, `cool`, `locked`, `poachBan`, `poachCap`, `role`...) |

Poczta: decyzje kandydatów (kategoria Sztab), `refs.kind = 'staffPoach'` (klub AI chce zatrudnić osobę z Twojego sztabu,
akcje `agree` / `block`, bez odpowiedzi blokada), `refs.kind = 'staffRenew'` (1 maja: koniec umowy, akcje `y1`, `y2`, `no`).
Do zrobienia: wakat w roli rdzenia (asystent, fizyczny, bramkarze, kierownik) jako sprawa „ważne”.
Ekran: Trening, Sztab (`src/ui/staffView.js`, style `src/styles/staff.css`, testy `tests/staffView.test.mjs`), rozdział 5.

## 1. Decyzje właściciela (Nov 16, 2026)

1. Podbieranie sztabu innych klubów jest dozwolone: osoba musi chcieć (pensja, lepszy klub, rola lidera, los). Obecny klub
   zgadza się (rekompensata 3 pensje) albo blokuje. Przy blokadzie osoba może zerwać umowę (motywacja i los); wtedy klub,
   który podbiera, płaci karę 3 pensje plus 0-50 % [SZAC]. Te same zasady dla gracza i AI; klub AI blokuje lidera bez
   zastępcy z szansą 85 %, pozostałych 30 % [SZAC]; gracz decyduje w poczcie i dostaje wiadomość o wyniku.
2. Podbieranie rzadkie: AI-AI najwyżej 6 udanych i 12 prób w sezonie w całej Polsce, tylko z wyraźnym zyskiem (klub
   o renomie wyższej o 15+, rola lidera, pensja co najmniej +15 %) i w okolicach okien (czerwiec-sierpień, grudzień-luty).
   Sztab gracza: najwyżej 1 próba na osobę i 2 próby na cały sztab w pół sezonu, klub po nieudanej albo zablokowanej
   próbie wraca do tej samej osoby po 12 miesiącach, pierwsze 6 miesięcy umowy bez prób (dla wszystkich).
3. Nowe role od razu: fizjoterapeuta i skaut, liczone do limitu sztabu.
4. Obcokrajowiec: adaptacja 3 miesiące, na start 2 punkty jakości mniej (16 pracuje jak 14), liniowo do zera.
5. Lista wolnych: odświeżanie 1 lipca i 1 stycznia, 25 % wolnych od 60+ dni odchodzi, dopełnienie do ok. 100 osób.
6. Limity i łączenie osób w roli jak w projekcie: 15 + 12 = 15,6; limit sztabu: Ekstraklasa 7-18, 1 Liga 5-9,
   2 Liga 4-7, III liga 4-5 (minimum III ligi podniesione z 3 do 4 decyzją właściciela z Nov 16, 2026).
7. Pozycja w ofercie (lider albo pomocnik) to wiążąca obietnica: lider zepchnięty na pomocnika (zatrudniono lepszego)
   jest niezadowolony i chętniej odchodzi (przyjmuje oferty innych klubów, odmawia przedłużenia). Tak samo w AI.
8. Uczciwość: osoba może dostać kilka ofert, decyduje po 2-3 dniach (najkorzystniejsza oferta z losem), po decyzji
   nie przyjmuje kolejnych ofert (120 dni). Te same zasady dla gracza i AI.

## 2. Model

- Stan: `game.staff = { people, clubs, pool, offers, decide, block, limit, cool, poach, stats, ... }`. Osoba:
  `{ id, name, nat, age, role, q (1-20), wage (zł / mies.), until, since, club, free, coach, adapt, lead, demoted, hist }`.
- Widok pochodny `game.training.staff[clubId]` (jedna pozycja na rolę) liczy `syncStaff` po każdej zmianie składu:
  imię lidera, jakość efektywna `q_ef = q1 + min(2, 0,10 (q2 - 6) + 0,05 (q3 - 6) + 0,025 (q4 - 6))` (kierownik tylko q1),
  wakat: `{ name: null, q: 2-4, vacant: true }`. Wszystkie dotychczasowe odczyty `staffOf` / `staffQ` działają bez zmian.
- Role i limity w roli (Ekstraklasa / 1 Liga / 2 Liga / III liga): asystent 4/2/2/1, fizyczny 3/2/1/1, bramkarze 2/1/1/1,
  analityk 4/2/1/1, młodzież 2/1/1/1, kierownik 1, fizjoterapeuta 3/2/1/1, skaut 3/2/1/0.
- Limit sztabu: `clamp(round(B + (renoma - R0) / 12 + F), MIN, MAX)`, `F = clamp(1,5 log2(przychód krajowy / D0), -1,5, 2,5)`;
  B 9 / 6 / 4,5 / 3, R0 60 / 40 / 22 / 12, D0 45 / 8 / 3 / 1 mln zł, MIN 7 / 5 / 4 / 4, MAX 18 / 9 / 7 / 5. Liczony na start sezonu.
- Oczekiwana pensja: `10 000 x R x 1,25^(q - 10)` (R: asystent 1; fizyczny i bramkarze 0,7; fizjoterapeuta 0,6; analityk 0,55;
  młodzież 0,5; kierownik 0,45; skaut 0,4), obcokrajowiec x1,2, po 2 miesiącach bez pracy -4 % na miesiąc (najmniej 75 %).
- Decyzja osoby: użyteczność oferty = pieniądze `2 ln(pensja / oczekiwana)` + renoma klubu wobec poziomu osoby
  (`0,025 (renoma - (4,5 q - 2))`, od -1 do +0,5) + rola (lider +0,5, trzeci lub dalszy -0,3) + długość umowy (55+ woli dłuższą,
  do 35 lat krótszą) + kraj (obcokrajowiec: Ekstraklasa +0,4, 2 Liga i III liga -0,6) + znajomość trenera +1,2 + los N(0; 0,3).
  Wolna osoba przyjmuje najlepszą ofertę, gdy przekracza próg 0,25 - 0,15 x miesiące bez pracy (do 6). Zatrudniona porównuje
  z pozostaniem (+0,5, zdegradowany lider -0,6).
- Odprawa przy zwolnieniu: pozostałe pełne miesiące umowy, od 2 do 6 pensji (`Rozwiązania kontraktów`).
- Finanse: pensje sztabu co miesiąc (`Pensje sztabu`), z dawnego ryczałtu „Koszty klubu” wyjęty `plan.staffBase`.
  Migracja: `staffBase` = rzeczywista suma pensji (pierwszy dzień neutralny; sztab droższy niż 60 % kosztów klubu,
  np. w rezerwach, pracuje za mniej). Nowy sezon: połowa z kosztu typowego sztabu klubu, połowa z rzeczywistych pensji.
  Budżet: `staffBase / 12 x (1,10 + 0,01 (zasobność właściciela - 10))`; wakat w roli rdzenia: zgoda na +20 %.
  Rekompensaty i kary za podebranie: `Rekompensaty za sztab`.
- Fizjoterapeuta: przerwa po urazie (mecz, sparing, trening) `x(1 - 0,01 (q - 3))`, od 0,85; ryzyko urazu na treningu
  `x(1 - 0,005 (q - 3))`, od 0,92. Wakat (q 3) = dawne zachowanie gry. Urazy na zgrupowaniach reprezentacji bez zmian.
- Skaut: ocena potencjału zawodników spoza klubu w profilu zawodnika (`scoutLine` w `src/career/assistantReport.js`):
  jakość oceny 0,3 asystenta + 0,7 skauta, znajomość zawodnika 0,6 (polski klub) albo 0,35 (zagranica, wolni).
  Od v1.20 Beta (Nov 20, 2026) skaut ma 5 atrybutów, regiony i jeździ za granicę po kandydatów (misje, lista ok. 50
  wolnych skautów, praca na zlecenie z prowizją, nieobecność w sztabie w czasie wyjazdu): `docs/skauting.md`.

## 3. Kluby AI

- Poniedziałek: przegląd części klubów (każdy klub raz na 4 tygodnie, w czerwcu, lipcu, sierpniu, grudniu i styczniu co
  tydzień), najwyżej jedna oferta. Potrzeba: słaby lider w roli rdzenia (jakość niższa o 3 od docelowej), potem kolejne
  miejsca planu sztabu w limicie. Kandydaci z listy wolnych i (rzadko) z innych klubów; ocena z błędem asystenta klubu.
- Wakat w rdzeniu przy pełnym sztabie: klub zwalnia osobę najmniej potrzebną (z odprawą).
- 1 czerwca: przedłużenia (bez pomocników słabszych niż 7, bez osób ponad limitem, bez 65+, bez słabego lidera rdzenia).
  Minimum ligi: gdy po wygaśnięciu umów zostałoby mniej osób niż MIN (III liga: 4), klub przedłuża kolejne osoby
  w kolejności planu (także słabszych i spoza limitu, bez 65+), żeby od 1 lipca nie zejść poniżej minimum bez zastępstwa.
- Nowy trener główny: asystenci poprzedniego trenera odchodzą z szansą 60 %, nowy trener przywozi asystenta z szansą
  60 / 40 / 25 / 10 % (Ekstraklasa / 1 / 2 / III liga).

## 4. Kalibracja (tools/multiseason.mjs, widzew, ziarno 5, 3 sezony, z treningiem)

Polecenie: `node tools/multiseason.mjs widzew 5 3 trening` (4. argument włącza moduł treningu, bez niego rozwój zawodników
nie działa). Wyniki z Nov 16, 2026 [SZAC]:

| | 2026/27 | 2027/28 | 2028/29 |
|---|---|---|---|
| Osób na klub (Ekstraklasa / 1 Liga / 2 Liga / III liga) | 10,3 / 7,3 / 6,0 / 6,0 | 10,3 / 7,5 / 5,0 / 4,6 | 10,3 / 7,2 / 5,0 / 4,4 |
| Średni limit | 10,3 / 7,1 / 4,9 / 3,7 | 10,6 / 7,4 / 4,8 / 3,7 | 10,4 / 7,2 / 5,1 / 3,6 |
| Pensje sztabu, cała liga (tys. zł / mies.) | 3323 / 1212 / 437 / 1009 | 3305 / 1256 / 344 / 885 | 3399 / 1300 / 375 / 853 |
| Zatrudnienia (w tym przywiezieni przez trenera) | 24 (19) | 53 (16) | 59 (26) |
| Zwolnienia / wygasłe umowy po sezonie | 27 / 130 | 39 / 58 | 36 / b.d. |
| Podbieranie AI-AI: próby / udane | 0 / 0 | 2 / 1 | 2 / 2 |
| Podbieranie sztabu gracza przez AI: próby / udane | 0 / 0 | 0 / 0 | 0 / 0 |
| Rozwój młodych do 21 lat, przyrost OVR (III liga), bez rynku sztabu / z rynkiem | 0,57 / 0,58 | 0,49 / 0,45 | 0,46 / 0,46 |

- III liga i 2 Liga mają na starcie 6 osób przy limicie 3-5 (migracja bez zwolnień); po wygaśnięciu umów kluby rezygnują
  z ról spoza planu (trener młodzieży, analityk), jakość trenera młodzieży w III lidze spada z 6,0 do ok. 4,3. Efekt w
  rozwoju młodych jest mały (różnice rzędu losu między sezonami).
- Minimum III ligi 4 (Nov 16, 2026), `node tools/multiseason.mjs widzew 5 2 trening` [SZAC]: średni limit III ligi 4,2
  (było 3,7); osób na klub 30 czerwca 6,0 (2026/27) i 4,9 (2027/28), 30 września 2027 średnio 4,9, najmniej 4 w każdym
  klubie; trener młodzieży w III lidze 6,0 -> 4,5 / 4,4 (było 4,3), przyrost OVR młodych w III lidze 0,58 / 0,45 (było
  0,57 / 0,45). Przy limicie 4 plan sztabu III ligi to asystent, bramkarze, kierownik, fizyczny, więc trener młodzieży
  zostaje głównie tam, gdzie limit 5 albo klub przedłużył go dla minimum. Do decyzji właściciela: trener młodzieży
  wcześniej w planie III ligi (np. przed trenerem przygotowania fizycznego).
- Zatrudnień 25-60 w sezonie (projekt zakładał 120-160): sztaby są pełne, rotacja z wygasłych umów i zmian trenerów.
- Pierwszy dzień neutralny: koszty klubu + pensje sztabu = dawne koszty klubu co do kilku złotych (test).

## 5. Ekran (Nov 16, 2026)

- Trening, Sztab: pasek stanu (Sztab 9/12 z kreską limitu i ofertami w toku, pensje wobec budżetu, Zatrudnij) i trzy
  zakładki: Mój sztab (karty 8 ról w kolejności `STAFF_ROLE_ORDER`, skaut w III lidze ukryty; osoby z jakością na
  diodzie, umową w kolorze przy < 90 i < 30 dniach, plakietką lider / pomaga +x / nic nie daje, paskiem adaptacji,
  Przedłuż od 1 stycznia, Zwolnij z oknem odprawy), Rynek sztabu (filtry: rola, kraj, jakość od-do, pensja do, tylko bez
  ofert, pracują w klubach; tabela od 760 px, karty na telefonie, strony po 50; karta osoby z atrybutami, zmianą w
  sztabie, adaptacją, zainteresowaniem, panelem podbierania i formularzem oferty z podpowiedzią `offerHint`), Oferty
  w toku (odliczanie do decyzji, liczba ofert bez kwot, zakończone z 7 dni z poczty).
- Kliknięcia `st-*` w `handleStaffAction` (wołane z `dispatchAct`), pola `data-st-field` w listenerze `change`
  (`handleStaffField`, pensja odświeża tylko podgląd oferty), Esc zamyka okno zwolnienia, strzałki przełączają zakładki.
- Do zrobienia: wakat w rdzeniu otwiera rynek z filtrem roli (`st-find`).

## 5a. Dyrektor sportowy (Nov 21, 2026, v1.23 Beta)

Rola `dyrektor`: 1 osoba na klub, osobny slot poza limitem osób (`staffLimit` go nie liczy, oferta dla dyrektora nie
zajmuje miejsca), pensja w budżecie sztabu (`clubStaffPay`, `staffBudget`), 4 atrybuty NEG, RYN, SIE, KAD.
Stan: `game.staff.dir[klub]` (id osoby), `dirPool` (12-16 wolnych), `dirInit`, `dirYear`, `dirIntro`. Te same
funkcje co sztab dla klubów AI: `makeOffer` (nowy dyrektor zastępuje obecnego, odprawa), podbieranie,
`listFreeStaff` i `listClubStaff` (rola `dyrektor`), `staffSummary().roles.dyrektor` (`max: 1`, `outside: true`).
W klubie gracza decyduje zarząd: `fireStaff`, `renewStaff` i `makeOffer` dla dyrektora zwracają `dirOwner`, zmiana
przez prośbę do zarządu (`askBoard(game, 'director')`, `ownerReplaceDirector`).
Oczekiwana pensja x mnożnik ligi klubu (`expectedWage(p, date, { club })`). Opis i liczby: `docs/dyrektor-sportowy.md`.

## 6. Otwarte sprawy

- Widok klubu rywala (`clubView.js`) nie pokazuje jeszcze listy osób sztabu (tylko jakości ról).
- Zgoda zarządu w formularzu oferty: twardy budżet (przycisk nieaktywny z powodem), bez `requestScore`.
- Zgoda zarządu przez `requestScore` przy ofercie ponad budżet (projekt 3.3): teraz twardy budżet i +20 % przy wakacie w rdzeniu.
- `keepCaretaker` (asystent zostaje trenerem na stałe) nie zwalnia roli w sztabie.
- Skaut nie wpływa na ocenę zawodników przez kluby AI (AI zna prawdziwe wartości, jak dotąd); kluby AI wysyłają
  skautów na misje za granicę tymi samymi wzorami co gracz (`docs/skauting.md`, rozdz. 8).
