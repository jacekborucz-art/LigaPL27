# Dyrektor sportowy w sztabie

Wdrożone Nov 21, 2026 (v1.23 Beta). Wcześniej kluby AI miały ukryty atrybut Negocjacje 1-20 (`game.clubNeg`), który
udawał dyrektora sportowego (docs/negocjacje.md, rozdz. 15). Teraz to prawdziwa osoba w sztabie, w klubie gracza
i w każdym klubie AI z kadrą (Ekstraklasa do III ligi). Kod: osoba, rynek i zmiany w `src/career/staffMarket.js`,
wpływ atrybutów w `src/career/director.js`, prośba gracza w `src/career/boardRequests.js`, jedyny punkt odczytu
Negocjacji `clubNegotiation` w `src/career/clubNegotiation.js`. Testy: `tests/director.test.mjs`. Wszystkie liczby
[SZAC], kalibracja w rozdz. 7.

Historia decyzji: kolejka zadań (Nov 20, 2026), burza mózgów trzech ekspertów (ekonomista, matematyk, analityk
kodu, Nov 21, 2026), plan właściciela (Nov 21, 2026), zmiana właściciela tego samego dnia: o dyrektorze decyduje
zarząd klubu, trener może tylko poprosić o zmianę.

## 1. Zasady

- Gracz i kluby AI mają te same zasady. Gracz negocjuje sam: dyrektor nie prowadzi za niego rozmów.
- O dyrektorze sportowym decyduje właściciel klubu (zarząd), także w klubie gracza. Trener nie zatrudnia, nie
  zwalnia, nie podbiera i nie przedłuża dyrektora; może poprosić zarząd o zmianę (rozdz. 4).
- Oferty są tajne. Podpowiedź dyrektora dla gracza nigdy nie korzysta z cudzych ofert.
- Bez sufitów i suwaków trudności. Polska piłka nie zyskuje na arenie międzynarodowej (dyrektor działa na rynku
  krajowym, zagranica zostaje zadaniem skauta).
- Każdy atrybut działa jako odchylenie od 10: wartość 10 to dawne zachowanie gry, przeciętny dyrektor wobec
  przeciętnego wygrywa 50 % licytacji, najlepszy ok. 2-4 pp więcej.
- Wakat: obowiązki przejmuje zarząd, wszystkie atrybuty 5.

## 2. Osoba i atrybuty

Rola `dyrektor` (Dyrektor sportowy), 1 osoba na klub, osobny slot poza limitem osób sztabu (nie wypycha asystenta),
pensja w budżecie sztabu (`staffBudget`, `Pensje sztabu` w finansach). Jakość q = średnia 4 atrybutów (jak u reszty
sztabu), od niej pensja i rynek. Atrybuty w `ROLE_ATTRS.dyrektor` (`src/training/config.js`).

| Atrybut | Kluby AI | Gracz |
| --- | --- | --- |
| NEG Negocjacje | pierwsza oferta, podwyżka w 2. rundzie, poprawka w ciemno, kara licytacji w `aiBuy`, oferty za zawodników gracza (`answerIncoming`), przedłużenia (`aiRenewals`) | brak (gracz negocjuje sam) |
| RYN Znajomość rynku | błąd wyceny bez przesunięcia: cena wywoławcza sprzedającego (`askingPrice`) i ocena ceny przez kupującego (`aiBuy`) | widełki pensji w ekranie rozmów (tylko informacja) |
| SIE Sieć kontaktów | kolejność klubów w tygodniu rynku (`marketWeek`): waga exp(0,025 (SIE - 10)), zero-sum | szukanie klubu na wypożyczenie: szybciej i więcej propozycji |
| KAD Zarządzanie kadrą i płacami | premia za podpis i prowizja w ofertach klubu AI x (1 - 0,10 (KAD - 10) / 10), przedłużenia | spór z trenerem rezerw: +1,5 pp na punkt ponad 10 |

### 2.1 Negocjacje (NEG)

`clubNegotiation(game, klub)` czyta atrybut Negocjacje dyrektora klubu (adaptacja obcokrajowca obniża go jak u reszty
sztabu), wakat 5. Dźwignie bez zmian (docs/negocjacje.md, rozdz. 15.2-15.4). Gra bez stanu sztabu (narzędzia, testy
bez świata) i kluby IV ligi: dawne leniwe losowanie. Przedłużenia kontraktów zawodników w klubach AI (`aiRenewals`
w `transfers.js`) dostają teraz Negocjacje i Zarządzanie kadrą (wcześniej dawne stałe).

### 2.2 Znajomość rynku (RYN)

- Kluby AI: mnożnik `exp(e - s²/2)`, `e ~ N(0; s)`, `s = 0,20 - 0,15 q`, `q = (RYN - 1) / 19` (20 % przy 1, 12,9 %
  przy 10, 5 % przy 20). Średnio 1 (bez przesunięcia). Stały dla pary klub-zawodnik w pół sezonu i dla danego
  dyrektora (ziarno: gra, rodzaj, klub, zawodnik, dyrektor, pół sezonu). Sprzedający: cena wywoławcza
  (`askingPrice`, poza ceną z prośby o transfer i klauzulą); kupujący: cena w ocenie kandydata (`aiBuy`).
- Uwaga: przy RYN 10 błąd nie jest zerowy (12,9 %), więc ceny pojedynczych zawodników różnią się od dawnych, średnio
  nie. Do decyzji właściciela (rozdz. 8).
- Gracz: w ekranie rozmów blok „Dyrektor sportowy (imię i nazwisko): zawodnik zgodzi się prawdopodobnie przy X-Y zł
  tygodniowo” (przy wakacie „Zarząd (brak dyrektora sportowego)”). Podstawa: minimum zawodnika z jego własnego
  żądania (`hidden.minOwn` w `openNegotiation`, bez ofert konkurencji). Połowa szerokości x: 25 % przy RYN 1, 15 %
  przy 10, 6 % przy 20 (liniowo). Środek = minimum x (1 + b), b ~ N(0; x / 1,645) obcięte do ±1,5x: minimum leży w
  przedziale w ok. 90 % przypadków (obcięcie do ±x z planu dawałoby prawie 100 %). Ziarno: gra, zawodnik, dyrektor,
  okno 30 dni, więc ponowne pytanie nie uśrednia szumu. Tylko informacja, bez mnożnika w rozmowach.

### 2.3 Sieć kontaktów (SIE)

- Gracz, „Wypożycz” (`askLoanOffers`): co 6 punktów od 10 jeden dzień szybciej i jedna propozycja więcej
  (SIE 16-20: 0-2 dni i 2-4 propozycje; SIE 4-15 bez zmian; 1-3 i wakat: dzień dłużej, propozycji o jedną mniej).
- Kluby AI: kolejność zakupów w tygodniu rynku z wagą exp(0,025 (SIE - 10)) (losowanie bez zwracania, szansa
  bycia pierwszym = waga / suma wag). Przy równych wagach to zwykłe tasowanie. Skaut zostaje od potencjału i zagranicy.
  Plan miał 0,04; kalibracja dała wtedy najlepszemu dyrektorowi +4,3 pp, więc 0,025 (rozdz. 7).

### 2.4 Zarządzanie kadrą i płacami (KAD)

- Spór z trenerem rezerw (`escalationChance` w `reserves.js`): +1,5 pp na punkt ponad 10 (poniżej 10 mniej),
  granice 10-90 % jak dotąd.
- Oferty klubów AI (`aiNegotiate`, parametr `feeMul`): prowizja agenta i górna granica premii za podpis x
  (1 - 0,10 (KAD - 10) / 10), od 1,09 (KAD 1) do 0,90 (KAD 20). Zakupy, oferty za zawodników gracza, przedłużenia.

## 3. Zarząd i dyrektor (kluby AI i klub gracza)

- Każdy klub z kadrą ma dyrektora. Migracja (stary zapis, nowa gra, awans z IV ligi) przy pierwszym `ensureStaff`
  albo pierwszym odczycie `clubNegotiation`: NEG = dawny `game.clubNeg[klub].n` (albo to samo leniwe losowanie),
  pozostałe atrybuty clamp(NEG + N(0; 2,5), 1, 20), wiek 38-62, umowa 1-3 lata, pensja ze wzoru sztabu. Rozkład
  Negocjacji po migracji jest dokładnie dawny (test). Pensja dyrektora wchodzi też do `staffBase` (budżet sztabu),
  więc pierwszy dzień jest neutralny finansowo. `game.clubNeg` zostaje jako zapas (n = Negocjacje dyrektora).
- 1 lipca (`negSeason` w `rolloverSeason` woła `directorSeason`), każdy klub, także klub gracza: szanse zmiany
  dyrektora jak dawniej (Ekstraklasa 12 %, 1 Liga 10 %, 2 Liga 8 %, III liga 7 %, po zwolnieniu trenera albo spadku
  25 %, najwyżej 3 na ligę). Zwolniony dostaje odprawę i trafia na listę wolnych dyrektorów; klub bierze wolnego
  dyrektora, gdy jego Negocjacje różnią się o najwyżej 1 od losowania wokół średniej ligi, inaczej nową osobę
  (rozkład jak dawniej). Umowa kończąca się 30 czerwca: zarząd przedłuża (Ekstraklasa 2 lata, niżej 1-2), od 64 lat
  nowy dyrektor. Wiadomość w Mediach „Klub: nowy dyrektor sportowy” z imieniem (tylko z ligi gracza, bez wartości
  atrybutów); w klubie gracza list zarządu „Zarząd zmienia dyrektora sportowego: imię i nazwisko”.
- Dawny dryf atrybutu co sezon (powrót do średniej z szumem) zastąpił rozwój osoby jak u reszty sztabu (do 45 lat
  szansa +1 jakości, od 60 lat spadek).
- Wakat w trakcie sezonu: w poniedziałek klub AI składa ofertę wolnemu dyrektorowi (oferta wiąże, decyzja po 2-3
  dniach); w klubie gracza zarząd sam zatrudnia dyrektora z listy wolnych (`ownerReplaceDirector`) i wysyła list.
- Kluby AI nie podbierają dyrektorów. Do decyzji (rozdz. 8).

## 4. Klub gracza: prośba do zarządu o zmianę dyrektora

- Dyrektor od startu nowej kariery i w starym zapisie (te same zasady co AI, z `game.clubNeg` klubu gracza albo
  losowania wokół średniej ligi). List w poczcie „Dyrektor sportowy: imię i nazwisko” (raz na klub).
- Trener nie zatrudnia, nie zwalnia, nie podbiera i nie przedłuża dyrektora (`fireStaff`, `renewStaff`, `makeOffer`
  zwracają `dirOwner`; list 1 maja o końcu umowy nie dotyczy dyrektora).
- Klub, Zarząd, „Prośby do zarządu”: nowa prośba „Zmiana dyrektora sportowego” (`askBoard(game, 'director', 0, data,
  { candidate })`), ten sam mechanizm co inne prośby: najwyżej jedna w tygodniu i trzy w miesiącu, ta sama sprawa po
  odmowie za 60 dni, po zgodzie za 90 dni, zaufanie -2 przy niskim zaufaniu albo wynikach dużo poniżej celu, -1 przy
  odmowie. Bez dyrektora (wakat) prośby nie ma: zarząd szuka sam.
- Punktacja S (`directorScore`), zgoda od S >= 10 [SZAC]:

| Składnik | Wzór |
| --- | --- |
| zaufanie | 0,6 x (zaufanie - 50) |
| wyniki | 3 x (cel - miejsce), od 4 meczów, od -15 do 15 |
| ocena dyrektora | 2,5 x (10 - jakość dyrektora): słaby łatwiej, dobry trudniej |
| staż | -10, gdy dyrektor pracuje krócej niż rok |
| odprawa | 5 x (wolne pieniądze / odprawa - 1), od -20 do 5 |
| właściciel | (10 - cierpliwość) + 0,5 x (temperament - 10) |
| los | od -5 do 5 |

  Przykład: Widzew na starcie (zaufanie 60, dyrektor 12, niecierpliwy i porywczy właściciel): S ok. 12,5 ± 5, zgoda
  częściej niż odmowa; Jagiellonia (dyrektor 15, cierpliwy właściciel): S ok. -9, odmowa.
- Zgoda: dyrektor odchodzi z odprawą z kasy klubu (2-6 pensji) na listę wolnych, zarząd zatrudnia nowego z listy
  wolnych dyrektorów: najlepszy w zasięgu budżetu sztabu (z błędem oceny i losem), bez kandydata w budżecie nowa osoba.
  Gracz może wskazać kandydata z listy: zarząd zatrudnia go z szansą 75 %, gdy mieści się w budżecie (inaczej list
  wyjaśnia: za drogi, wybrano kogoś innego, już niedostępny). List zarządu z nazwiskiem nowego dyrektora.
- Odmowa: list zarządu z powodami (dwa najbardziej ujemne składniki) i terminem kolejnej prośby.
- Oczekiwana pensja dyrektora: `10 000 x 0,9 x 1,25^(q - 10)` x mnożnik ligi klubu (Ekstraklasa 1, 1 Liga 0,72,
  2 Liga 0,5, III liga 0,38), obcokrajowiec x1,2; przy zatrudnieniu x płacowość klubu jak sztab. Ekstraklasa: q 10
  ok. 9 tys. zł / mies., q 17 ok. 43 tys.
- Listy „Dyrektor sportowy” (wypożyczenia, transakcje, okno, prośby o transfer, rezerwy, odpowiedzi na oferty)
  są podpisane „Imię Nazwisko, dyrektor sportowy”, przy wakacie „Zarząd” (`directorFrom`, poprawka wiadomości dnia
  `registerMailHook` w `gameLoop.js`).

## 5. Rynek dyrektorów

- Lista wolnych 12-16 osób (`game.staff.dirPool`, osobno od ok. 100 osób sztabu): Negocjacje wokół średniej ligi
  (udział lig 15 / 20 / 25 / 40 %), 5 % obcokrajowców. Odświeżanie 1 czerwca i 1 stycznia: ok. 25 % wolnych od 60+ dni
  odchodzi, nadmiar ponad 16 odchodzi od najdłużej wolnych, lista wraca do 14. 1 lipca po zmianach dyrektorów lista
  wraca do 16 (zwolnieni tego dnia zostają).
- Gracz widzi listę tylko do podglądu (Trening, Sztab, Rynek sztabu, filtr „dyrektor sportowy”).

## 6. Ekran

- Trening, Sztab, Mój sztab: pierwsza karta „Dyrektor sportowy” tylko do podglądu (jakość, osoba z atrybutami
  i umową, „co daje”: widełki ±x %, wypożyczenia, spór rezerw, Negocjacje tylko w klubach AI), przyciski „Poproś
  zarząd o zmianę dyrektora” (Klub, Zarząd) i „Wolni dyrektorzy (podgląd)”. Przy wakacie opis zarządu.
- Rynek: karta dyrektora z atrybutami, bez formularza oferty („Tylko podgląd”, odnośnik do próśb do zarządu).
- Klub, Zarząd: karta prośby „Zmiana dyrektora sportowego” z obecnym dyrektorem, listą kandydatów (opcjonalnie)
  i przyciskiem „Poproś o zmianę dyrektora”.
- Rozmowy kontraktowe: blok dyrektora nad formularzem oferty (`ng-dir`).
- Edytor, klub, Sztab: dyrektor z 4 atrybutami. Datapack v6: rola `dyrektor` w sekcji `staff` (docs/edytor.md).

## 7. Kalibracja (Nov 21, 2026)

Sprawiedliwość licytacji: `node tools/negocjacje-fair.mjs 30000 5,7,9` (klub AI z dyrektorem o atrybucie X wobec
przeciętnego dyrektora, wszystko poza X równe 10; ok. 89 tys. licytacji na tabelę).

| X | NEG | KAD | SIE (waga 0,025) | Wszystkie (NEG = KAD = SIE = X) |
| --- | --- | --- | --- | --- |
| 1-5 | 48,2 % | 49,9 % | 49,1 % | 45,5 % |
| 6-8 | 49,4 % | 49,4 % | 49,3 % | 48,3 % |
| 9-11 | 49,5 % | 50,4 % | 50,6 % | 50,0 % |
| 12-15 | 51,0 % | 50,0 % | 51,1 % | 52,1 % |
| 16-20 | 52,4 % | 49,9 % | 51,7 % | 53,5 % |

- Średni wobec średniego (9-11, wszystkie atrybuty): 50,0 %. Najlepszy (16-20): +3,5 pp (cel 2-4 pp). Z wagą sieci
  0,04 z planu: 54,3 % (+4,3 pp), stąd 0,025.
- KAD nie zmienia wygranych (ekonomia: tańsze prowizje i premie), zgodnie z planem.
- RYN (kupujący wybiera 1 z 5 kandydatów, sprzedający RYN 10): strata wyboru 0,0007 OVR przy RYN 1, 0,0003 przy 10,
  0,0000 przy 20; cena wybranego wobec ceny bez błędu od -0,2 do -0,3 % (bez przesunięcia). Efekt bardzo mały, bo cena
  waży w wyborze AI niewiele (OVR - cena / 5 mln zł).

Transfery: `node tools/transfery-kalibracja.mjs widzew <ziarno> 3`, OVR top14 Ekstraklasy po sezonach 2026/27,
2027/28, 2028/29 (przed: main przed zmianą):

| Ziarno | Przed | Po |
| --- | --- | --- |
| 5 | 11,58 / 11,80 / 11,85 | 11,64 / 11,83 / 11,84 |
| 7 | 11,56 / 11,72 / 11,72 | 11,49 / 11,52 / 11,69 |
| 9 | 11,68 / 11,71 / 11,67 | 11,64 / 11,83 / 11,88 |
| średnio | 11,61 / 11,74 / 11,75 | 11,59 / 11,73 / 11,80 |

- Prośby o transfer (wszystkie ligi) na sezon: przed 73,0 średnio (58-97), po 70,7 (56-102), cel 60-85.
- Kluby AI z ujemnym saldem: 0 (przed i po). Dyrektorzy po 3 sezonach: NEG średnio wg ligi ok. 11,7-12,0 / 9,5-10,6 /
  8,5-9,6 / 7,6-7,8 (po 1. sezonie 10,7-12,2 / 10,2-10,9 / 8,2-8,8 / 7,4-7,9), wakaty 0. Wolnych dyrektorów
  1 lipca 31-34 (16 plus zwolnieni tego dnia), od 1 stycznia znów najwyżej 16.
- `node tools/multiseason.mjs widzew 5 3`: bez błędów. `npm run perf`: sezon 10,9 s wobec 11,1 s na main.

## 8. Do decyzji właściciela

- Negocjacje dyrektora gracza nie działają dla gracza (gracz negocjuje sam), a podnoszą jakość i pensję. Propozycja:
  NEG gracza w warunkach propozycji wypożyczeń albo w szansie podniesienia oferty klubu AI („Poproś o więcej”).
- Błąd wyceny przy RYN 10 nie jest zerowy (12,9 %), więc ceny pojedynczych zawodników różnią się od dawnych.
- Kluby AI nie podbierają dyrektorów; czy mają (rzadko, jak sztab)?
- Progi prośby o zmianę dyrektora (zgoda od S 10, szansa kandydata 75 %) bez symulacji wielu sezonów.
