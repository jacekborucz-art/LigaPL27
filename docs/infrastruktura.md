# Infrastruktura: stadion, baza treningowa, akademia

Stan: Nov 13, 2026, wnioski (rozdz. 5.1): Nov 17, 2026. Dotyczy `src/career/infrastructure.js` (model), `src/ui/infraView.js` (zakładka Klub, Infrastruktura), `src/styles/klub.css` (reguły `.inf-`) oraz krótkich zaczepów w `src/career/finance.js`, `src/career/careerSystem.js`, `src/season/rollover.js`, `src/training/development.js`, `src/training/sessions.js`, `src/training/aiClubs.js` i `src/match/matchday.js`. Model finansów, do którego dopięta jest infrastruktura: docs/finanse.md.

Oznaczenia: **[SZAC]** to szacunek albo założenie balansowe. Wszystkie poziomy, koszty, czasy budowy, utrzymanie i mnożniki w tym dokumencie są [SZAC]; realne obiekty służą tylko do ustawienia skali.

## 1. Punkty odniesienia

Liczby z rozdziału 1 pochodzą z zestawienia panelu ekspertów przygotowanego do tego etapu. Nie zostały ponownie sprawdzone w źródłach w tej sesji; przed użyciem poza grą warto je zweryfikować.

| Obiekt | Wartość | Wniosek dla skali |
|---|---|---|
| Stadion w Opolu | 208,7 mln zł, 11 600 miejsc | ok. 18 tys. zł za miejsce (koszt miejsca w grze: 10 tys. zł x M(L), na poziomie 6 = 10 tys., na poziomie 7 = 11,5 tys. zł) |
| Stadion w Szczecinie | 261 mln zł (364 mln zł z akademią) | poziom 6 |
| Arena Zabrze | etap I 192,5 mln zł, IV trybuna 46 mln zł; 31 871 miejsc | poziom 6, rozbudowa trybun jako osobny projekt |
| Legia Training Center | ok. 80 mln zł (2019-20) | baza treningowa poziom 8 |
| Akademia Lecha we Wronkach | rozbudowa 55 mln zł (20 mln zł dotacji) | baza treningowa poziom 7 |
| Ośrodek treningowy Widzewa | planowany, ok. 30 mln zł | baza treningowa poziom 6 (suma kroków do 6: 23,8 mln zł) |
| Certyfikaty akademii PZPN | brązowy, srebrny, złoty (najwyższy; platynowego nie ma) | akademia poziomy 4, 5, 6 |
| Stadiony w Polsce | PGE Narodowy 58 580, Śląski 55 211, Wrocław ok. 45 tys., Poznań 42 837, Gdańsk 41 620, Zabrze 31 871, Legia 31 103 | polski szczyt klubowy: poziom 7 (45 tys.), stadiony narodowe: poziom 8 |
| Stadiony na świecie | Camp Nou ok. 99 tys. (docelowo 105 tys.), Wembley 90 tys., Santiago Bernabéu ok. 83 tys., Signal Iduna Park 81 tys. | poziomy 9 i 10 |

## 2. Poziomy

### 2.1 Stadion

M to mnożnik przychodu z jednego widza, maks. to największa pojemność na danym poziomie (dla rozbudowy trybun; stadiony większe z danych zostają większe). Koszt i czas dotyczą kroku z poprzedniego poziomu.

| Poziom | Nazwa | M | Maks. miejsc | Koszt kroku | Budowa | Utrzymanie / rok |
|---|---|---|---|---|---|---|
| 1 | Boisko z trybunką | 0,50 | 1 000 | - | - | 0,05 mln zł |
| 2 | Stadion gminny | 0,60 | 3 000 | 1,5 mln zł | 3 mies. | 0,2 |
| 3 | Stadion z oświetleniem | 0,70 | 6 000 | 4 | 6 | 0,5 |
| 4 | Stadion licencyjny (podgrzewana murawa, oświetlenie TV) | 0,80 | 12 000 | 12 | 10 | 1,2 |
| 5 | Nowoczesny stadion miejski | 0,90 | 20 000 | 35 | 18 | 3 |
| 6 | Arena z lożami (UEFA kat. 4) | 1,00 | 35 000 | 80 | 24 | 6 |
| 7 | Arena premium (szczyt w Polsce) | 1,15 | 45 000 | 150 | 30 | 10 |
| 8 | Stadion europejski | 1,35 | 60 000 | 400 | 36 | 20 |
| 9 | Stadion światowy | 1,65 | 75 000 | 1 200 | 42 | 40 |
| 10 | Ikona (klasa Wembley, Camp Nou) | 2,00 | 100 000 | 3 000 | 48 | 80 |

Rozbudowa trybun to osobny projekt na torze stadionu: koszt = nowe miejsca x 10 000 zł x M(L), najwyżej +50 % pojemności w jednym projekcie i nie ponad maksimum poziomu, tylko przy średnim zapełnieniu sezonu od 85 %. Czas: 6 + miejsca / 1 500 miesięcy (6-24). Po zakończeniu 60 % nowych miejsc zapełnia ukryty popyt (średnia frekwencja rośnie o 0,6 x nowe miejsca, w skali ligi z danych).

Utrudnienia w czasie budowy: podniesienie standardu -10 % pojemności (budowa poziomu 6 i wyżej: -20 %), rozbudowa trybun -25 %. Spada pojemność i średnia frekwencja, więc bilety przynoszą mniej; koszty dnia meczowego zostają.

### 2.2 Baza treningowa

| Poziom | Nazwa | Koszt kroku | Budowa | Utrzymanie / rok |
|---|---|---|---|---|
| 1 | Boisko gminne | - | - | 0,05 mln zł |
| 2 | Boisko klubowe z szatnią | 0,2 mln zł | 2 mies. | 0,15 |
| 3 | Dwa boiska i siłownia | 0,6 | 3 | 0,4 |
| 4 | Ośrodek treningowy | 2 | 6 | 1 |
| 5 | Ośrodek z odnową biologiczną | 6 | 9 | 2 |
| 6 | Nowoczesny ośrodek | 15 | 12 | 4 |
| 7 | Centrum treningowe (poziom Wronek) | 35 | 15 | 6 |
| 8 | Centrum premium (poziom Legia Training Center) | 70 | 18 | 10 |
| 9 | Ośrodek europejski | 140 | 24 | 18 |
| 10 | Kampus światowy | 500 | 30 | 30 |

### 2.3 Akademia

| Poziom | Nazwa | Koszt kroku | Budowa | Utrzymanie / rok |
|---|---|---|---|---|
| 1 | Brak akademii | - | - | 0,1 mln zł |
| 2 | Szkółka miejska | 0,1 mln zł | 2 mies. | 0,3 |
| 3 | Grupy młodzieżowe | 0,3 | 3 | 0,7 |
| 4 | Akademia z certyfikatem brązowym | 1 | 6 | 1,2 |
| 5 | Akademia z certyfikatem srebrnym | 3 | 9 | 2 |
| 6 | Akademia z certyfikatem złotym | 6 | 12 | 4 |
| 7 | Akademia czołowa w Polsce | 12 | 15 | 7 |
| 8 | Akademia międzynarodowa | 25 | 18 | 14 |
| 9 | Akademia europejska | 60 | 24 | 25 |
| 10 | Akademia światowa | 150 | 30 | 50 |

Miejsca w akademii (decyzja właściciela Nov 16, 2026) [SZAC]: poziom 1-10 daje 3, 5, 7, 9, 11, 13, 15, 18, 21, 24 juniorów
(`ACADEMY_CAP`, `src/career/infrastructure.js`). Co sezon 1 lipca przychodzi nabór 3-5 juniorów (więcej przy lepszej akademii),
19-latkowie przechodzą do kadry albo odchodzą, a gdy akademia jest pełna, odchodzi junior, który najmniej rokuje
(najniższy potencjał, przy równym starszy), nie najsłabszy dziś (`processAcademy`, `src/season/rollover.js`).

Polskie kluby kończą realnie na stadionie 7, bazie 8 i akademii 7-8 (oznaczenie „szczyt w Polsce” na drabinie poziomów: stadion 7, baza 8, akademia 8). Poziomy 9 i 10 to odniesienia światowe.

## 3. Poziomy startowe

| Tor | Reguła |
|---|---|
| Stadion | Legia, Lech 7; Górnik Zabrze, Pogoń, Wisła Kraków, Śląsk, Lechia, Jagiellonia, Widzew, Cracovia 6; Ruch 6 (mecze na Stadionie Śląskim); pozostała Ekstraklasa 5, a stadiony poniżej 9 000 miejsc (Raków, Radomiak, Wieczysta) 4. 1 Liga: szacunek z danych przycięty do 3-5, 2 Liga do 2-3. Szacunek: L = clamp(round(2 + pojemność / 6 000 + (naKibica - 40) / 25), 2, 7) |
| Baza treningowa | Legia 8, Lech 7, Raków 6; pozostała Ekstraklasa round(1 + 0,6 x prestiż) w zakresie 4-6; 1 Liga 3-4 (4 od prestiżu 6); 2 Liga 2-3 (3 od prestiżu 5); rezerwy najwyżej 3 |
| Akademia | Lech, Legia 7; Zagłębie, Pogoń 6; pozostała Ekstraklasa 4-5 (5 od prestiżu 7); 1 Liga 3-4 (4 od prestiżu 6); 2 Liga 2-3 (3 od prestiżu 5); rezerwy 2 |

Na starcie gry każdy klub spełnia wymogi licencji swojej ligi (test `tests/infrastructure.test.mjs`).

## 4. Wzory

Zasada: wszystkie efekty liczą się względem poziomu startowego klubu (L0), więc dzień startu gry wygląda dokładnie tak, jak przed dodaniem infrastruktury.

```text
przychód z widza   = naKibica x mnożnik ligi x M(L) / M(L0)
pojemność          = pojemność z danych + dobudowane miejsca; w czasie budowy x (1 - utrudnienie)
średnia frekwencja = min(pojemność, (frekwencja z danych + popyt z nowych trybun) x mnożnik ligi) x (1 - utrudnienie)
koszty klubu       = ops z modelu finansów + 0,3 x (przyrost biletów przy pełnej pojemności)       (1-2 Liga: 0,25)
utrzymanie         = kredyt + (U(L) - U(L0)),  kredyt = min(U(L0), 0,5 x ops)
księga co miesiąc  = (ops - kredyt) / 12 jako „Koszty klubu” + utrzymanie / 12 jako „Utrzymanie obiektów”
```

U(L) to suma utrzymania trzech torów. Na starcie utrzymanie = kredyt, czyli koszty klubu w sumie się nie zmieniają; kredyt nie przekracza połowy kosztów klubu (dotyczy małych klubów 1 i 2 Ligi, w których pełne utrzymanie byłoby większe).

Baza treningowa (L i L0 bazy):

```text
rozwój zawodników       x (0,94 + 0,018 x (L - 1)) / (0,94 + 0,018 x (L0 - 1))     developPlayer: ctx.infra.dev
ryzyko urazu na treningu x (1,10 - 0,02 x L) / (1,10 - 0,02 x L0)                   gracz i kluby AI (baseMul)
regeneracja              + 0,4 x (L - L0) pkt świeżości na zajęciach odnowy          staffMul.recover + infra
```

Akademia (L i L0 akademii; dotychczasowy nabór odpowiada poziomowi startowemu klubu):

```text
juniorzy co roku       rng.int(3, 5) + (2 + round(L / 3)) - (2 + round(L0 / 3))      (najmniej 1)
jakość juniorów        slotOffset -1,0 + 0,12 x (L - L0)                              (-1,0 to dotychczasowa stała naboru)
szansa na talent       2 % x (L - L0) na juniora: potencjał +1,5 (osobne ziarno, bez wpływu na resztę losowania)
rozwój do 21 lat       x (0,92 + 0,016 x L) / (0,92 + 0,016 x L0)                     developPlayer: ctx.infra.youth
```

## 5. Projekty i finansowanie

- Jeden projekt na tor naraz (rozbudowa trybun zajmuje tor stadionu). Projekt rusza dopiero po zgodzie zarządu i (gdy trzeba) pozwoleniu miasta, rozdz. 5.1. Klub gracza płaci 20 % swojej części w dniu startu budowy, resztę w równych ratach 1. dnia każdego miesiąca budowy (wpis `infra`, „Inwestycje w obiekty”). Utrzymanie co miesiąc jako `upkeep` („Utrzymanie obiektów”).
- Po ostatnim miesiącu: poziom +1 albo nowe miejsca, wiadomość w poczcie (kategoria Klub), nowe efekty od razu (plan sezonu przeliczony).
- Udział właściciela (deterministyczny, bez nazwisk w interfejsie) [SZAC]:

| Właściciel | Stadion | Baza treningowa | Akademia |
|---|---|---|---|
| Miasto | 100 % do poziomu 5, 85 % poziom 6, 70 % poziom 7 i rozbudowa trybun, 30 % wyżej | 50 % do poziomu 5, potem 30 % | 0 |
| Bogaty właściciel (typ `miliarder`) | 50 % | 50 % | 50 % |
| Właściciel albo spółka ze skarbcem | 25 % | 25 % | 25 % |
| Pozostali, rezerwy | 0 | 0 | 0 |

Realnie miasto decyduje o pieniądzach raz w roku (budżet w grudniu); w grze udział jest znany od razu przy wycenie, a miasto potwierdza go (albo nie) na etapie pozwolenia (rozdz. 5.1).

### 5.1 Wnioski: zarząd, pozwolenie miasta, start (Nov 17, 2026)

Inwestycja nie rusza od razu. Łańcuch: wniosek gracza (albo klubu AI), decyzja zarządu, pozwolenie miasta (gdy potrzebne), start budowy. Przy złożeniu wniosku nic nie schodzi z salda; przed każdą decyzją wycena jest liczona od nowa, a pierwsza wpłata schodzi w dniu startu. Etapy są w rejestrze `STAGES` (`board`, `city`) w kolejności `STAGE_ORDER`; `pipelineFor(game, id, q)` wybiera potrzebne. Kolejny etap (np. protesty kibiców, dotacja, przetarg) to nowy wpis w rejestrze. Wszystkie liczby [SZAC].

| Etap | Kiedy | Czas | Decyzja |
|---|---|---|---|
| Zarząd | zawsze | 3-7 dni | punktacja S (niżej): S >= 0 zgoda; warunek albo odmowa |
| Miasto | stadion (standard i trybuny) zawsze; baza, gdy dokłada miasto; akademia nigdy | standard stadionu 30-45 dni, trybuny 21-35, baza 14-28 | samo pozwolenie: 95 %; z pieniędzmi miasta: clamp(0,95 - 0,03 x udział miasta / max(dopłata miasta na sezon, 1 mln zł), 0,25, 0,95); wymóg licencji: co najmniej 90 % |

Punktacja zarządu (`boardScore`), kwoty miesięczne:

```text
R          = (przychody krajowe + dopłata właściciela) / 12
rezerwa    = (płace + koszty klubu) / 12
wolne      = saldo (klub AI: saldo + fundusz) - pierwsza wpłata - rezerwa
obciążenie = (część klubu - pierwsza wpłata) / max(miesiące budowy, 12) + przyrost utrzymania / 12
saldo        clamp(20 x wolne / rezerwa, -20, 15)
obciążenie   clamp(10 - 100 x obciążenie / R, -30, 10)
wynik        plan sezonu na minusie -5, saldo ujemne -20
właściciel   miliarder +10, prywatny ze skarbcem +5, spółka 0, miasto -5; plus 0,5 x (zasobność - 10)
zaufanie     0,3 x (zaufanie zarządu - 50)   (kluby AI: 50)
licencja     +40, gdy wniosek usuwa brak licencyjny
los          -5..+5 (Rng infra-wniosek:ziarno:klub:tor:dzień złożenia:etap)
```

Raty w obciążeniu liczone są co najmniej na 12 miesięcy (decyzja wdrożeniowa Nov 17, 2026, do potwierdzenia przez właściciela): bez tego krótka i tania budowa (np. baza poziom 2 w III lidze, 2 miesiące) wyglądała na 36 % miesięcznych przychodów i zarząd zawsze odmawiał. Projekty od 12 miesięcy liczą się dokładnie według projektu.

- Saldo poniżej pierwszej wpłaty: odmowa (klub AI bez licencji: fundusz poniżej kosztu).
- Zgoda warunkowa: gdy -12 <= S < 0 i największym minusem jest saldo: „Zgoda, jeśli saldo klubu wyniesie co najmniej X do <data>”, X to saldo dające S = 0 (w górę do 100 tys. zł), termin 30 dni, sprawdzane codziennie. Spełniony: następny etap; niespełniony: odmowa.
- Odmowa (zarządu albo miasta) blokuje nowy wniosek na ten obiekt do końca sezonu (do 1 lipca). Wniosek usuwający brak licencyjny nigdy nie jest blokowany. Wycofanie wniosku nic nie kosztuje i nie blokuje.
- Powód odmowy prostymi słowami z najbardziej ujemnego składnika, np. „Raty i utrzymanie to 29 % miesięcznych przychodów”.
- Poczta tylko dla klubu gracza: zarząd (kategoria Zarząd, „Zarząd klubu”), miasto („Urząd miasta”), start budowy jak dotąd („Ruszyła inwestycja”).

Przykłady z symulacji (ziarno 21, dzień startu gry, zaufanie 60; szansa zgody zarządu z losu -5..+5):

| Klub (właściciel, saldo) | Stadion | Baza treningowa | Akademia |
|---|---|---|---|
| Jagiellonia (miasto, 14,9 mln zł) | poziom 7: 0 % (obciążenie), miasto 25 % | poziom 7: 0 % (obciążenie) | poziom 6: 100 % (przy zaufaniu 50: ok. 93 %) |
| Korona (miasto, 9,8 mln zł) | poziom 6: 99 %, miasto 54 % | poziom 6: 36 %, miasto 92 % | poziom 5: 100 % |
| Legia (prywatny, 39,9 mln zł) | poziom 8: odmowa (saldo poniżej pierwszej wpłaty) | poziom 9: 0 % | poziom 8: 100 % |
| Widzew (miliarder, 48,2 mln zł) | poziom 7: 100 %, pozwolenie 95 % | poziom 7: 100 % | poziom 6: 100 % |
| Arka (miasto, 4,4 mln zł) | poziom 5: 100 %, miasto 69 % | poziom 5: 100 %, miasto 93 % | poziom 5: 100 % |

## 6. Licencja (PZPN, uproszczona [SZAC])

| Liga | Stadion | Pojemność | Baza | Akademia |
|---|---|---|---|---|
| Ekstraklasa | od 4 | od 4 500 | od 3 | od 3 |
| 1 Liga | od 3 | | | od 2 |
| 2 Liga | od 2 | | | |

1 lipca klub poniżej wymogów (zwykle beniaminek) dostaje sezon na rozpoczęcie inwestycji (ostrzeżenie w poczcie). Jeśli rok później dalej brakuje obiektu, nie trwa jego budowa i nie ma wniosku w toku, PZPN nakłada karę 1 mln zł (wpis `fines`) i ostrzega ponownie; kara powtarza się co roku. Rozbudowa trybun wymagana przez licencję omija warunek 85 % zapełnienia i limit +50 %.

## 7. Kluby AI

- Klub AI z dużą nadwyżką co sezon wydaje połowę nadwyżki na „Spłatę długów i inwestycje” (`invest`, docs/finanse.md rozdz. 3.4). Połowa tej kwoty trafia do funduszu inwestycyjnego klubu (`fund`); pieniądze zeszły już z salda, więc projekty AI nie zmieniają salda drugi raz.
- Kluby AI składają wnioski i przechodzą te same etapy (bez poczty). Wymogi licencji: wniosek 1 lipca, a gdy brakuje projektu i wniosku, ponownie 1. dnia każdego miesiąca.
- 1 lipca: najpierw wymogi licencji (z funduszu, potem z salda ponad miesięczne koszty, a resztę dokłada właściciel albo miasto, jak przy długach klubów AI w docs/finanse.md rozdz. 3.4), potem jeden nowy projekt w kolejności baza, akademia, stadion. Stadion tylko przy zapełnieniu poprzedniego sezonu od 92 % (najpierw trybuny do maksimum poziomu, potem standard).
- Kluby AI nie budują ponad poziom 8 (`AI_MAX`). Koszty i efekty są te same co dla gracza.
- Test 10 sezonów z hojnym funduszem (20 % przychodów krajowych rocznie, stadiony pełne): żaden klub AI nie przekracza poziomu 8.

## 8. Stan gry i API

`game.infra = { v: 2, clubs: { [id]: { stadium, training, academy, start: { stadium, training, academy }, seats, fans, fund, proj: { [tor]: { kind, to, seats, cost, owner, club, paid, months, m, start, ai, label } }, req: { [tor]: wniosek }, reqLast: { [tor]: { result, stage, date, why, until } }, fillSum, fillN, fill, licence } }, july }`. Wniosek: `{ id, track, opts: { seats }, created, ai, q (wycena), licence, pipeline, at, stage, decideOn, cond: null | { minBalance, by }, steps: [{ stage, from, decideOn, result, S, p, why, date, met? }] }`. Stare zapisy: stan powstaje przy wczytaniu (`ensureCareer` woła `ensureInfra`); zapisy v1 dostają puste `req` i `reqLast`. Plan sezonu klubu (`F.clubs[id].plan`) dostaje pola `upkeep`, `upkeepBase`, `infraBase`, `infraOps` i znacznik `infra`; pozostałe pola planu zmieniają się tylko o różnicę (`cap`, `att`, `perFan`, `tickets`, `domestic`, `ops`, `net`), więc zmiany planu z innych modułów zostają.

Eksporty `infrastructure.js`: `LEVELS`, `TRACKS`, `TRACK_NAMES`, `PL_CEILING`, `AI_MAX`, `INFRA`, `LICENCE`, `startLevels`, `infraOf`, `ensureInfra`, `applyPlan`, `trainingMods`, `academyMods`, `developmentMods`, `upkeepAt`, `capacityOf`, `seatRoom`, `seasonFill`, `licenceNeeds`, `ownerShare`, `ownerLabel`, `quote`, `startProject` (start niskopoziomowy), `infraMonth`, `infraSeason`, `stadiumMul`, `IREQ`, `STAGES`, `STAGE_ORDER`, `pipelineFor`, `fixesLicence`, `boardScore`, `cityChance`, `submitRequest`, `withdrawRequest`, `infraRequestsDay`, `projectLabel`. System dnia `infra` (kolejność 55): zapełnienie stadionów po meczach ligowych, raty i zakończenia 1. dnia miesiąca, 1 lipca licencje i wnioski AI, na końcu `infraRequestsDay` (decyzje etapów, warunki, start; po ratach, więc projekt startujący 1. dnia miesiąca nie płaci raty tego dnia).

Interfejs (`infraView.js`, akcje `inf-start`, `inf-confirm` (wniosek), `inf-cancel`, `inf-withdraw` (wycofanie wniosku)): przycisk „Złóż wniosek do zarządu” z potwierdzeniem (czas decyzji zarządu i miasta), w karcie toru etapy wniosku (Zarząd, Miasto) z terminem albo warunkiem, po odmowie powód i data, od której można złożyć nowy wniosek, panel „Wnioski w toku” w prawej kolumnie; zadanie tygodnia o licencji znika, gdy wniosek jest w toku; kafelki poziomów i utrzymania, trzy karty torów (drabina 10 poziomów z obecnym poziomem i polskim szczytem, lista nazw z odniesieniami, efekty prostymi słowami, wycena następnego kroku z podziałem finansowania, przycisk z krokiem potwierdzenia, pasek postępu budowy i wpływ na pojemność), na PC prawa kolumna z osią „Trwające inwestycje”, wymogami licencji i opisem finansowania; na telefonie jedna kolumna.

## 9. Ograniczenia

- Nie ma kredytów ani dotacji unijnych; miasto i właściciel nie mają rocznego limitu wydatków.
- Popyt na bilety nie rośnie sam z nowym standardem stadionu (rośnie przychód z widza); rośnie tylko po dobudowie trybun przy pełnym stadionie.
- Baza treningowa nie wpływa na zgranie i taktykę (to rola sztabu).
