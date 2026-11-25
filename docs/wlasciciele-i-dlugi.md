# Właściciele, długi i zaległości wobec zawodników

Stan: Nov 26, 2026. Projekt: ekspert od finansów klubów i ekspert prawa sportowego (PZPN, FIFA), decyzje właściciela gry:
premia za słabe sezony względna (x1,15), awaryjne uzupełnienie kadry z rezerw 2 klasy słabsze, z juniorów 3 klasy słabsze.
Wszystkie liczby to [SZAC], przepisy z pamięci eksperta oznaczone [DO SPRAWDZENIA]. Te same zasady dla gracza i klubów AI.
Kod: `src/career/ownership.js` (zmiana właściciela), `src/career/arrears.js` (długi, zaległości, licencja, uzupełnienie
kadry), widok `src/ui/ownerDebtView.js` (Klub, Finanse). Testy: `tests/ownership.test.mjs`, `tests/arrears.test.mjs`.
Model finansów: `docs/finanse.md`.

## 1. Zmiana właściciela (koniec sezonu, 1 lipca)

Decyzje zapadają tylko przy zmianie sezonu, dla wszystkich klubów w stałej kolejności, z ziarnem (gra, klub, sezon).

### 1.1 Szansa odejścia (właściciel prywatny, bogaty, spółka)

| Składnik | Wartość |
|---|---|
| Baza według typu | bogaty 2 %, prywatny 4 %, spółka 3 %, miasto 1 % (sprzedaż), rezerwy 0 |
| Mnożnik ligi (kalibracja, realia: niższe ligi częściej) | Ekstraklasa x1,5, 1 Liga x2,5, 2 Liga x2, III liga x1,25 |
| Cierpliwość do 6 / od 15 | +1,5 pp / -1 pp |
| Ambicja od 14 i sezon poniżej oczekiwań | +1 pp |
| Temperament od 14 | +1 pp |
| Zasobność do 6 / od 15 | +2 pp (kończą się pieniądze) / -1 pp |
| Strata ponad 15 % przychodów bez sukcesu | +1 pp |
| Właściciel odmówił dalszego pokrywania długów (rozdz. 3.5) | +2 pp |
| Słabe ostatnie 2-3 sezony | x1,15 (względnie) |
| Zacisk | 0,5-12 % |
| Nowy właściciel (także miasto po przejęciu) | przez 2 pierwsze sezony nie sprzedaje i nie wycofuje się |

Słabe sezony: w 2 z 3 ostatnich sezonów wynik poniżej oczekiwań (`seasonVerdict`: missed albo disaster), spadek
w ostatnich 3 latach albo 3 sezony z rzędu co najmniej 4 miejsca niżej niż miejsce z siły kadry. Historia: `game.ownerHist`.

### 1.2 Miasto

- Sprzedaż (prywatyzacja) jak wyżej: 1 % x mnożnik ligi.
- Wycofanie wsparcia: Ekstraklasa 2 %, 1 i 2 Liga 3 %, III liga 4 % na sezon; x2 po kryzysie budżetu miasta w ostatnim
  sezonie (`ownerFunding.js`), po 3 sezonach z celem awansu (klub w czołowej dwójce według siły) bez awansu albo po
  spadku z 2 Ligi do III ligi.
- Skutek: dopłata i rezerwa 0, brak dopłat do długów, klub żyje z TV, biletów i sponsorów. Co sezon 10 % szansy na inwestora.
- Spadek do IV ligi (klub bez stałej kadry): przy powrocie klub zaczyna od nowa ze strukturą z danych (bez długów i bez
  nowego właściciela).

### 1.3 Nowy właściciel

Typ z tabeli ligi (w nowym sezonie):

| Liga | prywatny | bogaty | spółka | miasto |
|---|---|---|---|---|
| Ekstraklasa | 50 | 20 | 15 | 15 |
| 1 Liga | 55 | 10 | 10 | 25 |
| 2 Liga, III liga | 55 | 2 | 10 | 35 |

Po spadku z długiem: miasto +15 pp, bogaty -10 pp. Po awansie: prywatny +5 pp, bogaty +5 pp. Po wycofaniu miasta
i przy prywatyzacji: bez miasta.

- Zasobność: bogaty 14-20, prywatny 6-14, spółka 8-14, miasto 5-10. Cechy: średnie typu (`OWNER_TYPES`) + los (sd 2,6).
- Dopłata: typowa dla ligi i typu x los lognormalny (mediana 1, sd 0,45); typowe kwoty (mln zł): Ekstraklasa bogaty 15,
  prywatny 4, spółka 6; 1 Liga 5 / 2 / 2,5; 2 Liga 2 / 0,8 / 0,8; III liga 0,8 / 0,4 / 0,4. Gdy poprzednik dopłacał,
  średnia geometryczna z kwotą poprzednika x relacja: po bogatym zwykle słabszy (mediana 0,6), po innym 0,8-1,3.
- Rezerwa (skarbiec): bogaty 1-2 x dopłata, prywatny 0,3-1 x, spółka 0,5 x, miasto 0.
- Pierwszy sezon: 60 % ostrożny start (dopłata x0,85), 40 % zastrzyk 25-60 % dopłaty na wejście.
- Dług przy przejęciu: spłata 40 % (zasobność 5) do 100 % (zasobność od 15) ujemnego salda; bez zwykłego uzupełnienia
  salda na start sezonu.
- Klub AI: zmiana trenera 25 %, 50 % przy ambicji od 14 i temperamencie od 13.
- Klub gracza: list od zarządu (typ, opis charakteru, dopłata, zastrzyk, spłata długu), zaufanie zarządu od nowa 50,
  ambitny właściciel (od 14) podnosi cel o 1-3 miejsca.
- Nazwy nowych właścicieli są ogólne („Inwestor prywatny”, „Zamożny inwestor”, „Spółka inwestycyjna”, „Miasto Zabrze”).

### 1.4 Przejęcie przez miasto

Dopłata 30-60 % dopłaty poprzednika (mediana 45 %), nie mniej niż minimum ligi (Ekstraklasa 4, 1 Liga 2, 2 Liga 1,
III liga 0,3 mln zł: stadion i akademia), rezerwa 0. Zmienność jak u miasta (`ownerFunding.js`: połowa rozrzutu, sufit
1,15), a wzrost najwyżej 5 % na każdy rok od przejęcia; kryzys budżetu tnie o 15 %.

### 1.5 Zapis

`game.ownerOverride[id] = { type, name, doplata, skarbiec, since, withdrawn?, city?, share? }` (mln zł): używają go
`clubPlan(club, ov)`, `initClub(..., { owner })`, `ownerFunding.js` (sufit miasta). `game.owners[id]`: nowy profil
(`ownerOf`). `game.ownerLog`: zmiany (wiadomości mediów). Stary zapis bez tych pól działa jak dotąd.

## 2. Zaległości wobec zawodników (co miesiąc)

| Etap | Zasada |
|---|---|
| Ostrzeżenie | saldo 1. dnia miesiąca poniżej -0,5 miesięcznych kosztów (płace zawodników i koszty klubu) |
| Zaległości (miesiąc 1) | saldo poniżej -1 miesięcznych kosztów przez 2 miesiące z rzędu |
| Miesiąc 2 | wezwania zawodników do zapłaty, termin do 15. dnia kolejnego miesiąca (FIFA RSTP art. 14bis [DO SPRAWDZENIA]); zakaz transferowy |
| Po terminie (16. dnia, co miesiąc) | każdy zawodnik z kontraktem sprzed zaległości może rozwiązać umowę z winy klubu |
| Od miesiąca 4 | -3 punkty w tabeli ligi co 2 miesiące |
| Spłata | saldo co najmniej zero: licznik, wezwania i zakaz znikają od razu |

Szansa rozwiązania w miesiącu: 35 %, gwiazda (górne 30 % kadry według oceny) +20 pp, z agentem (nie „bez agenta”)
+10 pp, lojalny (lojalność od 14) -15 pp, +15 pp za każdy miesiąc ponad trzeci, najwyżej 90 %. Zawodnik zostaje wolny
i może się zgłosić do każdego klubu także poza oknem (RSTP art. 6 [DO SPRAWDZENIA]); klub dopisuje do długu 3 miesięczne
pensje odszkodowania (wpis „Odszkodowania dla zawodników”). Zawodnicy podpisani w czasie zaległości (także z awaryjnego
uzupełnienia) nie odchodzą z tego powodu.

Zakaz transferowy (`squadLimit.js`: `squadCount().ban`, `canSign`): gracz i kluby AI nie zgłaszają nowych zawodników
(transfery, wolni, wypożyczenia, umowy od 1 lipca, dołączenia w oknie, transakcje w toku upadają). Własna akademia
i awaryjne uzupełnienie działają.

## 3. Licencja, kary, uzupełnienie kadry, dopłaty właściciela

### 3.1 Licencja (Ekstraklasa, 1 Liga, 2 Liga; III i IV liga bez licencji)

- 31 marca: zaległości = licencja zagrożona (list do gracza).
- 30 czerwca: zaległości = brak licencji (Regulamin przyznawania licencji klubowych PZPN, kryterium finansowe
  [DO SPRAWDZENIA daty i uchwałę]). Klub spłacający po 31 marca, a przed 30 czerwca, dostaje licencję.
- Skutek (`computeMoves`, opcja `licence`): Ekstraklasa przy pierwszej odmowie -6 punktów w kolejnym sezonie, niżej
  spadek o 1 klasę (klub na końcu tabeli: spada zamiast ostatniego sportowo, nie awansuje). Druga odmowa z rzędu:
  2 klasy niżej (najniżej III liga), najlepszy spadkowicz ligi pośredniej zostaje. Klub bez licencji nie gra w pucharach.

### 3.2 Ujemne punkty

`game.season.deductions[comp][clubId]`, `setPointDeductions` w `standings.js` (ustawiane przy wczytaniu i przy karze).
Tabela pokazuje gwiazdkę przy punktach i wiersz w legendzie.

### 3.3 Awaryjne uzupełnienie kadry

Gdy po odejściach kadra ma mniej niż 18 zawodników albo mniej niż 2 bramkarzy: klub z drużyną rezerw dostaje zawodników
o sile ligi 2 klasy niżej (18-22 lata), bez rezerw juniorów o sile ligi 3 klasy niżej (17-19 lat), Polacy, tanie
kontrakty do końca kolejnego sezonu. Przy zakazie transferowym także 1 lipca zamiast zwykłego uzupełnienia z wolnych (wtedy do 23 zawodników w klubie AI, 18 u gracza).
Siła lig: Ekstraklasa 11,5, 1 Liga 10, 2 Liga 8,5, III liga 7,5, IV liga 6,5, niżej 5,5 i 4,5.

### 3.4 Wiadomości

Gracz: ostrzeżenie zarządu (właściciel rozważa sprzedaż po 2 słabych sezonach), nowy właściciel, przejęcie i wycofanie
miasta, ostrzeżenie o braku pieniędzy na pensje, zaległości, wezwania i zakaz, odejścia zawodników z listą i awaryjnym
uzupełnieniem, kara punktowa, licencja zagrożona, przyznana albo odmówiona, spłata. Media (`leagueNews.js`, liga gracza
i wyższe): nowy właściciel, przejęcie i wycofanie miasta, inwestor, zaległości, zakaz, kara, odejścia, brak licencji.

### 3.5 Dopłaty właściciela do długów

- Na start sezonu właściciel uzupełnia saldo (także dług, jak dotąd, gracz i AI), chyba że klub zmienił właściciela
  (spłata części długu), miasto wycofało wsparcie albo właściciel odmówił.
- Kluby AI: 1. dnia miesiąca dopłata do miesięcznych płac (jak dotąd; rezerwy od pierwszej drużyny).
- Sezon, w którym właściciel pokrył dług ponad 15 % rocznych kosztów klubu, jest „ciężki”; po 3 ciężkich sezonach
  z rzędu właściciel odmawia (do wyjścia klubu na plus na start sezonu albo zmiany właściciela). Klub gracza nie dostaje
  comiesięcznych dopłat (jak dotąd).

## 4. Symulacja (5 sezonów, wszystkie ligi)

Skrypt: scratchpad `wlasciciele/sim.mjs` (`node sim.mjs klub ziarno sezony`). Wyniki w rozdz. 4.1.

### 4.1 Wyniki

Nov 26, 2026, 3 ziarna (5, 7, 11) x 5 sezonów (2026/27-2030/31), wszystkie ligi (126 klubów z kadrami).

| Miara (na sezon) | Wynik | Cel |
|---|---|---|
| Zmiany właściciela razem (sprzedaż, przejęcie miasta, wycofanie, inwestor) | 3-10, średnio 6,1 (ziarna: 7,2 / 5,0 / 6,0) | 6-9 |
| W tym Ekstraklasa i 1 Liga | 1-5, średnio 2,5 | 3-4 |
| Przejęcia przez miasto | 0-2, średnio 0,6 | 1-2 |
| Wycofania miasta | 1-6, średnio 3,1 (głównie III liga; Ekstraklasa do 2 Ligi ok. 1) | 0-1 |
| Nowe zaległości (kluby) | 0-6 | |
| Rozwiązania kontraktów z winy klubu | 7-136 (kilka klubów w długich zaległościach) | |
| Brak licencji | 0-3 | |
| Kluby AI z dopłatą do długów | 42-70 (przed zmianą 43-73), odmowy po 3 ciężkich sezonach: 0 | |
| Mediana salda na start sezonu (Ekstraklasa / 1 Liga / 2 Liga / III liga, mln zł) | ok. 26-41 / 1,3-4,7 / 0,3-0,9 / 0,1 (przed zmianą 28-37 / 1,7-3,6 / 0,3-0,8 / 0,1) | stabilne |

Wnioski: przy bazowych szansach z projektu (2/4/3/1 %) Ekstraklasa i 1 Liga mają mniej zmian niż cel, stąd mnożnik
ligi (rozdz. 1.1). Wycofania miasta w III lidze są częstsze niż cel eksperta (4 % przy ok. 60 klubach miejskich);
klub bez wsparcia wpada w zaległości, traci zawodników i punkty, a po spadku do IV ligi zaczyna od nowa. Gospodarka
klubów AI jak przed zmianą.

Wydajność (`npm run perf`, widzew, ziarno 5, ten sam komputer): sezon 11 743 ms wobec 11 705 ms bez zmian (+0,3 %),
system „career” 1 589 wobec 1 534 ms, nowy system „arrears” poza 15 najdroższymi.

## 5. Ograniczenia

- Kluby AI w zaległościach nie sprzedają przymusowo zawodników (propozycja eksperta: 1-2 najdroższych w oknie);
  ratunkiem jest nowy właściciel, spadek kosztów po odejściach i uzupełnienie juniorami.
- Brak restartu w IV lidze przy drugiej odmowie licencji dla 2 Ligi (IV liga nie ma stałych kadr): spadek o 1 klasę.
- Infrastruktura (`infrastructure.js`) ocenia typ właściciela z danych klubu, nie z `ownerOverride`.
- Umowy od 1 lipca podpisane przed zakazem transferowym wchodzą w życie (zakaz blokuje nowe).
- Źródła prawne z pamięci eksperta: FIFA RSTP art. 6, 14bis, 17; Regulamin Dyscyplinarny FIFA art. 21; uchwała PZPN
  o statusie zawodników i transferach; Regulamin przyznawania licencji klubowych PZPN (31 marca, 30 czerwca)
  [DO SPRAWDZENIA wszystkie numery i daty].
