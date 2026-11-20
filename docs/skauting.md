# Skauci i skauting zagraniczny

Wdrożone Nov 20, 2026 (v1.20 Beta, logika; widok w Transfery, Skauting osobno). Specyfikacja właściciela: dawna
kolejka, punkt 4 (Nov 19, 2026). Projekt: burza mózgów (dyrektor sportowy Ekstraklasy, skaut międzynarodowy,
ekonomista). Kod: `src/career/scoutOps.js`, `src/career/scoutRegions.js`, zmiany w `src/career/foreignPool.js`,
`src/career/staffMarket.js`, `src/training/staff.js`, `src/career/editor.js`. Testy: `tests/scoutOps.test.mjs`.
Kalibracja: `node tools/scoutsim.mjs [próby]` i `node tools/scoutsim.mjs sezon [klub] [ziarno]`.
Wszystkie liczby [SZAC].

## 1. Zasada

Gracz zleca skautowi poszukiwanie profilu za granicą (region, pozycja, wiek, poziom, kwota, pensja, wolny albo
z kontraktem, 1-6 tygodni). Kandydatów nie ma nigdzie przed wyjazdem: po powrocie gra losuje zdarzenia wyjazdu
i tworzy 0-7 prawdziwych zawodników wokół profilu. Wynik zależy od skauta i od losu. Te same wzory dla gracza
i klubów AI (AI też bierze wydmuszki). Tylko zagranica; polskie ligi bez zmian.

Stan gry: `game.scoutOps` (`game.scouting` to analiza rywali, `src/training/scouting.js`).

## 2. Regiony (`SCOUT_REGIONS`)

12 regionów: Bałkany, Europa Środkowa, Skandynawia i Bałtyk, Półwysep Iberyjski, Europa Zachodnia, Europa Wschodnia
i Kaukaz, Afryka Zachodnia i Środkowa, Afryka Północna, Ameryka Południowa, Ameryka Północna i Środkowa, Azja,
Bliski Wschód i Turcja. Każdy: kraje z wagami (narodowość kandydata), mediana i szczyt poziomu (`Lmed`, `Lmax`;
szczyt 11,4-12,8, czyli czołówka Ekstraklasy, nigdy gwiazdy), koszt startu (2 tys. zł Europa, 5 tys. poza) i tygodnia
(1,8-7 tys. zł), opis chęci i adaptacji, pole mapy kafelkowej `tile`. Rosja pominięta. Nowe pule imion
(`src/data/names.js`, osobno od `NATIONALITIES`, więc losowanie narodowości w klubach zagranicznych i sędziów bez zmian):
JPN, KOR, AUS, USA, MEX, CAN, CRC, HON, JAM, PAN, BOL, UZB, IRN, CHN, THA, KSA, EGY, BFA, GAM, ZAM, RSA, KEN.

Kandydat z regionu powyżej szczytu (`Lmax`) jest liczony tylko częściowo: środek = `Lmax + 0,3 (cel - Lmax)`.

## 3. Skauci

- Atrybuty (1-20): `DOS` doświadczenie, `OCE` ocena zawodnika, `RYN` wiedza o rynku, `SIE` sieć kontaktów,
  `CHA` ocena charakteru (`ROLE_ATTRS.skaut`). Jakość `q` = średnia, więc pensje i rynek sztabu bez zmian.
- Regiony osoby `p.reg = { region: 1-20 }`, 1-3 regiony (najlepszy ok. 13 przy q 10, drugi 5-13, trzeci 3-9);
  skaut z kraju regionu zna go w 70 %, polski skaut w 55 % zaczyna od regionów blisko Polski. Opis: ekspert (15+),
  dobra (10-14), podstawowa.
- Migracja (raz, `game.staff.attrs = 2`): `OCE = q + 0,6 dPOT + 0,4 dOCU`, `RYN` bez zmian, `DOS` z wieku
  (`(wiek - 45) / 6`, do 3 punktów), `SIE` i `CHA` z ziarna osoby; suma odchyleń zero, jakość bez zmian.
- Pensja skauta: premia za region `x clamp(1 + 0,03 (najlepszy region - 10), 0,9, 1,2)` (`scoutRegionPremium`).
- Ocena potencjału w profilu zawodnika (`scoutLine`): w kraju `OCE`, z zagranicy `0,7 OCE + 0,3 RYN`.

## 4. Lista wolnych skautów i formy pracy

- `scoutOps.pool`: ok. 50 osób (oraz skauci z listy wolnych sztabu), odświeżana 1 lipca i 1 stycznia: zatrudnieni
  znikają, 25 % wolnych od 60+ dni odchodzi, lista wraca do 50. Jakość ~ N(9; 4), 3-19. Miks regionów nowych osób:
  waga regionu x Gamma(0,7) z ziarna odświeżenia (raz wielu ekspertów od Bałkanów, raz od Ameryki Południowej);
  dwóch nowych to specjaliści (region 17-19). Kluby AI też mogą ich zatrudniać (zwykły rynek sztabu).
- Na stałe: oferta jak w sztabie (`makeOffer`: limit sztabu, limit roli 3/2/1/0, budżet, decyzja po 2-3 dniach).
  Skaut q 15+ odmawia klubom z renomą poniżej `4,5 q - 2`; elita (q 16+) nie pracuje dla klubów z renomą poniżej 45.
- Na zlecenie (jedna misja): opłata z góry `1,6 x pensja / 4,3 x tygodnie` (klub o renomie ponad 20 punktów poniżej
  progu płaci x1,3) plus prowizja przy podpisaniu kandydata w ciągu 12 miesięcy od raportu: `c = 3 % + 5 % (q - 8) / 12`
  (3-8 %, krok 0,5) kwoty transferu, przy wolnym zawodniku ryczałt `3 x tygodniówka x c / 5 %`.

## 5. Zlecenie i wyprawa

- Pola: skaut (`scoutId` klubu albo `freeScoutId` na zlecenie), region, pozycja, wiek 16-38 (perspektywa do 21),
  poziom (`starter`: mediana pierwszej jedenastki na pozycji, `wzmocnienie`: najlepszy na pozycji + 0,5,
  `perspektywa`: najlepszy - 1,5 z potencjałem najlepszy + 1), maksymalna kwota (0 = bez limitu) i pensja tygodniowa
  (0 = bez limitu), `free`/`contract`/`any`, 1, 2, 4 albo 6 tygodni.
- Koszt: start + tygodnie x podróż regionu (+ opłata freelancera), księgowany raz w kategorii „Skauci: wyprawy
  i prowizje” (`scouts`). Odwołanie w pierwszych 2 dniach: zwrot 50 %, później bez zwrotu.
- Skaut klubu w podróży jest nieobecny w sztabie (`p.away`, `syncStaff` liczy rolę bez niego; jedyny skaut: wakat),
  po powrocie odpoczywa 1 dzień na tydzień wyjazdu. Jeden skaut = jedna misja.
- Limity: najwyżej tyle misji naraz co skautów klubu + 1 na zlecenie (maks. 3), jedna misja na zlecenie naraz,
  to samo zlecenie (region, pozycja, wiek, poziom, status) dopiero po 14 dniach (odwołanie nie pozwala przelosować bez
  straty), ten sam region i pozycja w ciągu 8 tygodni: liczba kandydatów x0,7. Id misji z licznika, nie z daty.
- Wzory: `R = max(K, 0,65 SIE) + 0,1 SIE` (gdy skaut zna region), `s = (0,30 DOS + 0,40 R + 0,15 SIE + 0,15 OCE) / 20`
  (projekt: 0,30/0,30/0,25/0,15; zmiana, żeby ekspert był wyraźnie przed skautem z samą siecią kontaktów),
  faktor wyjazdu `T` 0,17/0,55/0,85/1,0, trudność `D` (poziom ponad medianę regionu, kwota i pensja poniżej rynku,
  młody z potencjałem +0,15, kontrakt +0,1, wolny -0,05), `lambda = 6 s T (1 - 0,6 D)`.
- Liczba: Poisson z rozrzutem (Gamma, kształt 3) plus zdarzenia, 0-7. Zdarzenia na tydzień (ziarno misji i tygodnia;
  1 tydzień: połowa): dobry mecz 0,18 (+1 kandydat, poziom +0,4), polecenie agenta 0,15 (+1 z kontraktem, cena x1,1),
  kontuzja 0,10 (jeden kandydat z urazem 28-120 dni), ślepy zaułek 0,09 (-2). W długiej misji (4-6 tygodni) agent
  i kontuzja dają krótką wiadomość.
- Kandydat: narodowość z wag regionu, poziom `środek - 0,5 (1 - k) 1,2 + N(0; 1,2 (1 - 0,6 k))`,
  `k = (0,4 OCE + 0,3 R + 0,3 DOS) / 20`; do 12 prób, żeby zmieścić się w wieku, kwocie i pensji (+10 %).
  Generator `genPoolPlayerFor` (wydzielony z `genPoolPlayer`, pula z tego samego ziarna identyczna).

## 6. Raport i błąd skauta

- `a = (0,5 OCE + 0,5 R) / 20`, `sigma = 0,5 + 2,5 (1 - a)` (atrybuty w raporcie z błędem).
- Wydmuszka (prawdziwy poziom o 1,5-3 niżej niż w raporcie): szansa `0,30 (1 - a)^1,5` (słaby ok. 18 %, silny ok. 1 %);
  niedoceniony: połowa tej szansy. Ocena i potencjał jako przedziały, pewność niska/średnia/wysoka.
- Cena i pensja: przedział o szerokości `5 % + 35 % (1 - RYN / 20)`. Chęć przyjścia z prawdziwego modelu negocjacji
  (`playerWillingness`), przesunięta o stopień z szansą `0,5 (1 - RYN / 20)`. Ryzyko adaptacji z czasu aklimatyzacji
  (`acclimPlan`) i regionu, błąd o stopień z szansą `0,5 (1 - CHA / 20)`. Mocne i słabe strony z atrybutów ważnych na
  pozycji (widzianych z błędem), uwagi skauta (zdarzenia, uraz, wolny, niska pewność, adaptacja).
- Poczta (kategoria Transfery): start misji, wieści w długiej misji, raport (`refs.kind = 'scoutReport'`, priorytet
  ważny), wygaśnięcie, prowizja. Klucze `scout-*`, odnośniki do Transfery, Skauting (`src/ui/mailLinks.js`).

## 7. Kandydaci po raporcie

- Prawdziwi zawodnicy puli zagranicznej (`p.foreignPool`, `p.scout = { club, mission, found, excl, until, pct }`):
  gracza w `market.foreign` (i `market.free` dla wolnych), więc kupno zwykłym torem (karta `tf-open`, oferta za granicę,
  rozmowy z wolnym). Kandydaci klubu AI są poza listami rynku przez czas wyłączności.
- Wyłączność 14 dni: inne kluby nie biorą kandydata pod uwagę (`scoutBlocked` w `poolCandidates`, zakupach wolnych
  i uzupełnianiu kadr przy zmianie sezonu). `topUpPool` nie usuwa i nie liczy do 100 kandydatów z ważnym raportem.
- Ważność: wolni 4 tygodnie, z kontraktem 6; poza oknem 14 dni po otwarciu najbliższego okna, najwyżej 14 tygodni.
  Transakcja w toku zamraża termin. Po terminie (ziarno zawodnika): 45 % podpisuje gdzie indziej, 35 % schodzi z rynku
  (zawodnik znika z gry), 20 % zostaje na zwykłym rynku (bez wyłączności).
- Lista obserwowanych: wszyscy kandydaci gracza (stany nowy, obserwowany, zniknął, podpisał), usuwanie z listy,
  najwyżej 60 wpisów.
- Ukryta ocena (decyzja właściciela Nov 20, 2026): kandydat skautingu klubu gracza (`scoutHidden(game, p)`: `p.scout`
  klubu gracza, raport nie wygasł w zwykły rynek, zawodnik bez klubu w Polsce) nie pokazuje w Transferach prawdziwego
  OVR ani atrybutów. Zamiast liczby jest tylko ikona lornetki (`src/ui/scoutMask.js`, opis „Ocenę zna tylko skaut.
  Zobacz raport skauta”), bez przedziału: listy rynku (Wolni, Z zagranicy), nagłówek karty transferowej, porównanie
  z kadrą (bez „lepszy o”), karta w okienku z nazwiska, Profil i statystyki (bez gwiazdek i potencjału), menu
  zawodnika, nagłówek rozmów. Atrybuty i Mocne strony: ramka z notą „Dokładne atrybuty poznasz po transferze...”.
  Sortowanie po OVR używa oceny widzianej przez skauta (`rep.seenOvr`), nie prawdziwej. Po podpisaniu w klubie gracza
  widać wszystko jak u każdego własnego zawodnika; kluby AI bez zmian; po wygaśnięciu raportu w zwykły rynek zawodnik
  jest jak każdy z puli. Wartość rynkowa, cena, pensja i nastawienie zostają widoczne (jak dotąd).
- Ocena skauta tylko jako jego zdanie (`scoutOpinion`): w raporcie w poczcie i na karcie kandydata w Skautingu, np.
  „Moim zdaniem to zawodnik na poziomie ok. 11-12, potencjał do 14.” (pewność wysoka), „Wygląda mi na zawodnika...”
  (średnia), „Trudno mi go dobrze ocenić. Chyba gra mniej więcej...” (niska). Bez pasków i liczb w kartach i listach.

## 8. Kluby AI

W poniedziałek okresu misji (1 czerwca - 3 sierpnia, 1-29 stycznia, więc kandydaci wracają w oknie) klub Ekstraklasy,
1 i 2 Ligi (bez rezerw) z wolnym skautem q 8+ raz na okres wysyła go z szansą 0,35/0,20/0,05: region najlepszy
skauta, 4 tygodnie, profil `wzmocnienie` na najsłabszą pozycję, kwota do połowy wolnych środków. Kandydaci (te same wzory
i błąd raportu) są dla klubu przez 14 dni: zakup przez zwykły zakup AI (`aiBuy`, grupa pozycji kandydata, ocena z raportu,
bez losu 10 % puli), potem jak u gracza (45/35/20, pozostali trafiają na zwykły rynek). Prowizja freelancera nie dotyczy AI.

## 9. Kalibracja (Nov 20, 2026)

`node tools/scoutsim.mjs 2000` (cele z projektu):
- 1 tydzień, średni skaut (s 0,6, D 0,4): 55,8 % pustych (cel 55-65 %);
- 4 tygodnie, średni skaut: 15,2 % pustych (cel 15-25 %);
- 6 tygodni, silny skaut (s 0,85, D 0,2): 8,0 % pustych (cel 3-8 %);
- słaby skaut, 1 tydzień: 65 % pustych; typowe misje: średnio 2,7 kandydata (cel ok. 2,4);
- ekspert (region 17) s 0,72, obcy region z siecią 18 s 0,64, z siecią 8 s 0,43.

`node tools/scoutsim.mjs sezon <klub> <ziarno>` (jeden sezon, bot gracza z 3 misjami): Widzew, Lech, Wisła Kraków:
misje AI 20-21 na sezon, podpisani przez zlecające kluby AI 3-7 (cel 6-8), koszty gracza 62-100 tys. zł na 3 misje,
misje z kandydatem wartym oferty (ovr co najmniej cel - 0,3) 33-67 % (cel 35 %), wydmuszki AI ok. 4 %.

## 10. API dla widoku (czyste funkcje, `src/career/scoutOps.js`)

- `SCOUT_REGIONS` (re-eksport): `[{ key, label, short, nats, ... }]`.
- `scoutingView(game)`: `{ scouts, staffSlots: { used, max }, costs: { wagesMonthly, tripsSeason, commissionsSeason },
  missions, candidates, freeScouts, refreshDate, newCandidates }`; pola w kontrakcie z zadania UI (wolni skauci:
  `missionFees` to opłata skauta bez kosztów podróży, `wageMonthly` miesięcznie; kandydaci: `ovrRange`, `potRange`
  w skali OVR 1-20 jak w Transferach, `priceRange` w zł, `wageRange` tygodniowo).
- `missionQuote(game, order)`, `startMission(game, order)`, `cancelMission(game, id)`, `hireScout(game, id, 'permanent')`,
  `fireScout(game, id)`, `watchCandidate(game, pid, on)`, `markCandidatesSeen(game)`.
- Akcje w `src/app.js` (blok „Skauting: akcje sk-*”): `sk-start` (zlecenie z `state.skOrder`), `sk-cancel`, `sk-hire`,
  `sk-fire`, `sk-watch` (`data-on="1|0"`), `sk-seen`; wynik w `state.skMsg` (tekst) i `state.skOk`.

## 11. Edytor i datapack

`PACK_V = 5`. Skaut w pliku: `a: { DOS, OCE, RYN, SIE, CHA }` i `reg: { region: 1-20 }` (najwyżej 3, nieznany region
albo poziom spoza 1-20 odrzuca plik; regiony tylko dla skauta). `MIGRATE[4]`: plik v1-v4 ze starymi kluczami
`POT, OCU, RYN` przeliczony tym samym wzorem co zapis (odchylenia sieci i charakteru z imienia), datapack zapisany
w grze (`game.editor`) tak samo. Plik v5 w starszej grze: komunikat o nowszej wersji.

## 12. Ograniczenia i do decyzji

- OVR kandydatów skautingu ukryty (rozdz. 7). Wartość rynkowa (`p.value`) dalej widoczna i częściowo zdradza poziom
  (do decyzji właściciela).
- Wolny kandydat znaleziony poza oknem jest „wolny po zamknięciu okna” (`lateFree`): rozmowy dopiero w następnym oknie,
  choć raport pisze „podpisze bez odstępnego” (do decyzji właściciela).
- Początkowa liczba skautów w klubach bez zmian (plan sztabu jak dotąd), nie wg propozycji projektu (Ekstraklasa 2-3).
- Na później: obserwowanie dowolnego zawodnika, misje cykliczne, raport porównawczy, misje krajowe.
