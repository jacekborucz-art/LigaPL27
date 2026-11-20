# Kolejka zadań (do wykonania)

Lista zadań zatwierdzonych przez właściciela do zrobienia później. Po wdrożeniu zadanie znika z listy (opis trafia do własnego pliku w `docs/`).

## Uwaga: punkty 1 i 2 jako jeden pakiet „Psychika zawodnika” (decyzja właściciela Nov 20, 2026)

Historia morale (1) i rozbudowa psychiki (2) mają wspólny mianownik: morale to bieżący stan, osobowość i charakter
decydują, jak reaguje, a psycholog sportowy działa na oba. Wdrażać razem: jedna analiza kodu, jedna burza mózgów
ekspertów, jedno wdrożenie. To duża zmiana: właściciel odłożył ją na później (nie zaczynać bez zgody).

## 1. Historia morale zawodników: dalsze kroki (dodane Nov 18, 2026)

Zapis podstawowy i informacje dla gracza wdrożone Nov 19, 2026: `docs/historia-morale.md`
(strzałki trendu, wykres w karcie, raporty, Rozmowy, trend atmosfery, skutek rozmowy, zadania tygodnia przez powód rozmowy).

Zostało:
- Rozszerzony zapis (ok. pół dnia): dziennik przyczyn zmian tylko dla kadry gracza (mecz, rozmowa, zebranie, ławka, kontrakt), np. ostatnie 20 wpisów. Wymaga podpięcia w 10 plikach z `applyMorale` (teamTalks, season, coachMarket, aiClubs, sessions, matchday, briefings, attention, fans, morale).
- Wykres atmosfery całego sezonu w historii klubu (osobny zapis tygodniowej średniej drużyny, bo historia zawodnika ma 8 tygodni).

Wykorzystanie, logika gry (zmienia balans, każdy punkt do decyzji właściciela, najlepiej po burzy mózgów z ekspertami):
7. Prośba o transfer (`src/career/moveWish.js`): długi spadek morale zwiększa szansę prośby, nie tylko niski poziom.
8. Kluby AI i scouting: długo spadające morale jako okazja transferowa (także u zawodników gracza).
9. Kontrakty i negocjacje: rosnące morale ułatwia przedłużenie, spadające podnosi żądania.
10. Prasa: pytania o złą atmosferę po 3 tygodniach spadku morale drużyny.
11. Zarząd i autorytet trenera: długi spadek morale drużyny lekko obniża zaufanie zarządu.

Propozycja kolejności: burza mózgów nad punktami 7-11.

## 2. Rozbudowa psychiki zawodnika (dodane Nov 18, 2026)

Cel: sprawdzić, co dziś zawiera osobowość i charakter zawodnika, i zaplanować rozbudowę podpiętą pod logikę gry i meczu.

Krok 1, zebranie danych (agent: analityk kodu, Sonnet medium, bez edycji):
- osobowość (`p.persona`: Lider, Wrażliwy, Ambitny, Narwaniec, Spokojny), ukryte atrybuty (TMP, PRF, ADP, ambicja, ego), 11 cech, mindset (`src/career/mindset.js`), morale (`src/career/morale.js`), uwaga trenera (`src/career/attention.js`), aklimatyzacja (`src/career/acclimatization.js`);
- przy każdym: gdzie jest używane (mecz, odprawy, rozmowy, transfery, kartki, rozwój, kontrakty).

Krok 2, burza mózgów (3 agentów równolegle, Sonnet medium, z raportem z kroku 1):
- ekspert piłkarski: presja dużych meczów, derby, gra przy niekorzystnym wyniku, szatnia i liderzy, zawodnik po błędzie;
- psycholog drużyny: pewność siebie, odporność, motywacja, konflikty w szatni, wypalenie, tęsknota za domem;
- trener: co trener widzi i czym steruje (rozmowy, rola, kapitan, odprawa, zmiany w meczu, trening mentalny).

Wynik: jedna lista pomysłów z miejscem podpięcia w logice gry i meczu, oceną pracy i wpływem na balans, do decyzji właściciela. Powiązane: punkt 1 (historia morale).

Nowa rola w sztabie: psycholog sportowy (trener mentalny), dodane Nov 19, 2026. Dziś gra nie ma tej roli; psychikę obsługują po kawałku asystent (praca z zawodnikami), rozmowy, zebrania i osobowość zawodnika.
- Realia: część klubów Ekstraklasy zatrudnia psychologa na stałe, niższe ligi zwykle dorywczo albo wcale; limit osób w roli według ligi (np. Ekstraklasa 1-2, 1 Liga 1, 2 Liga i III liga 0-1) [SZAC].
- Propozycja 3 atrybutów (jak inne role, `docs/sztab-atrybuty.md`) [SZAC, do burzy mózgów]: przygotowanie do presji (wielkie mecze, karne, derby), odbudowa pewności siebie (po błędach, serii porażek, długiej kontuzji), praca z grupą (konflikty w szatni, adaptacja obcokrajowców i młodych, wypalenie).
- Możliwe miejsca podpięcia do sprawdzenia w burzy mózgów: presja w meczu i karne, spadek morale po porażkach i błędach, powrót po ciężkim urazie, aklimatyzacja, rozmowy, raport asystenta o charakterze.
- Wdrożenie razem z rynkiem sztabu (pensje, pula wolnych, limity), widokiem Sztab, edytorem i datapackiem (nowa rola w sekcji `staff`, nowa wersja pliku z migracją: starsze pliki bez psychologa wczytują się bez zmian).

## 3. Limit zawodników spoza UE w 1, 2 i 3 lidze (dodane Nov 18, 2026)

Stan dziś: limit wyłączony we wszystkich ligach (`src/config/competitions.js`), pole `p.eu` (27 państw UE, `EU` w `src/data/names.js`) jest liczone, ale nieużywane.

Przepisy (regulamin PZPN 1., 2. i 3. Ligi 2025/26): na boisku jednocześnie najwyżej 2 zawodników-cudzoziemców spoza UE, zgłaszać można dowolnie wielu. Ekstraklasa i Puchar Polski na szczeblu centralnym: bez limitu (zniesiony przed 2019/20). Do sprawdzenia przed wdrożeniem: wyjątek dla obywateli Ukrainy (starsza uchwała PZPN) i ewentualne zmiany w 2026.

Do zrobienia:
- ta sama zasada dla gracza i klubów AI: wybór składu, ławka i zmiany w meczu (trzeci zawodnik spoza UE nie wejdzie, gdy dwóch jest na boisku);
- informacja w taktyce i przy zmianie (licznik „spoza UE na boisku: 2/2”), ostrzeżenie przy ustawianiu składu;
- obywatelstwo UE z drugim paszportem: później (na razie tylko narodowość `p.nat`).

Źródło: https://pzpn.pl/public/system/files/site_content/635/6576-Regulamin%201.%20Ligi%202.%20Ligi%20i%203.%20Ligi%20na%20sezon%202025-2026.pdf

## Rynek pracy trenera: losowy termin ofert (dodane Nov 20, 2026)

Decyzja właściciela: dziś oferty dla trenera bez klubu przychodzą w stałych terminach (agent po 60 dniach, III liga po
120 dniach). Dodać mały RNG terminu (np. kilka do kilkunastu dni wcześniej albo później) [SZAC], deterministyczny
z ziarna gry. Kod: `src/career/jobMarket.js`, opis: `docs/kariera-trenera.md`.


## Dyrektor sportowy w sztabie (dodane Nov 20, 2026)

Decyzja właściciela: na razie kluby AI mają ukryty, losowy atrybut „Negocjacje” (1-20), który udaje dyrektora
sportowego (losowany na start, co sezon mała zmiana, czasem „zmiana dyrektora”). Później wprowadzimy prawdziwego
dyrektora sportowego jako osobę w sztabie, dla gracza i klubów AI, z co najmniej 4 atrybutami, w tym Negocjacje
(pozostałe do burzy mózgów, np. sieć kontaktów, ocena zawodników, zarządzanie budżetem płac). Ukryty atrybut AI
ma być zbudowany tak, żeby dało się go podmienić na atrybut dyrektora bez przerabiania negocjacji. Dyrektor już
występuje w tekstach (rezerwy, wypożyczenia, prośby o transfer), ale bez atrybutów. Nie zaczynać bez zgody.
