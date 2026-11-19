# Kolejka zadań (do wykonania)

Lista zadań zatwierdzonych przez właściciela do zrobienia później. Po wdrożeniu zadanie znika z listy (opis trafia do własnego pliku w `docs/`).

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

## 3. Limit zawodników spoza UE w 1, 2 i 3 lidze (dodane Nov 18, 2026)

Stan dziś: limit wyłączony we wszystkich ligach (`src/config/competitions.js`), pole `p.eu` (27 państw UE, `EU` w `src/data/names.js`) jest liczone, ale nieużywane.

Przepisy (regulamin PZPN 1., 2. i 3. Ligi 2025/26): na boisku jednocześnie najwyżej 2 zawodników-cudzoziemców spoza UE, zgłaszać można dowolnie wielu. Ekstraklasa i Puchar Polski na szczeblu centralnym: bez limitu (zniesiony przed 2019/20). Do sprawdzenia przed wdrożeniem: wyjątek dla obywateli Ukrainy (starsza uchwała PZPN) i ewentualne zmiany w 2026.

Do zrobienia:
- ta sama zasada dla gracza i klubów AI: wybór składu, ławka i zmiany w meczu (trzeci zawodnik spoza UE nie wejdzie, gdy dwóch jest na boisku);
- informacja w taktyce i przy zmianie (licznik „spoza UE na boisku: 2/2”), ostrzeżenie przy ustawianiu składu;
- obywatelstwo UE z drugim paszportem: później (na razie tylko narodowość `p.nat`).

Źródło: https://pzpn.pl/public/system/files/site_content/635/6576-Regulamin%201.%20Ligi%202.%20Ligi%20i%203.%20Ligi%20na%20sezon%202025-2026.pdf

## 4. Atrybuty członków sztabu (dodane Nov 18, 2026)

Stan dziś: osoba sztabu (`game.staff.people`, `src/career/staffMarket.js`) ma jeden atrybut, jakość `q` 1-20; od niego zależy jej wpływ (`STAFF_ROLES` w `src/training/config.js`). Trener prowadzący ma 5 atrybutów (`src/career/coaches.js`).

Cel: każdy członek sztabu ma kilka atrybutów 1-20 dopasowanych do roli, np. [SZAC, do burzy mózgów]:
- asystent trenera: taktyka, czytanie gry, praca z zawodnikami, przygotowanie odpraw;
- trener przygotowania fizycznego: periodyzacja, prewencja urazów, regeneracja, nowoczesne metody;
- trener bramkarzy: technika bramkarska, gra nogami, przygotowanie mentalne bramkarza;
- trener młodzieży: rozwój młodych, ocena talentu, praca z akademią;
- główny analityk: analiza rywala, dane i statystyki, analiza własnej gry;
- fizjoterapeuta: leczenie urazów, prewencja, rehabilitacja po ciężkich urazach;
- skaut: ocena umiejętności, ocena potencjału, znajomość rynków (kraje);
- kierownik drużyny: organizacja, dokumenty i terminy, logistyka obozów i wyjazdów.

Do zrobienia:
- burza mózgów (ekspert piłkarski, trener, analityk kodu): lista atrybutów na rolę i gdzie każdy działa w logice gry, zamiast jednego `q`;
- jakość `q` liczona z atrybutów roli (wagi), żeby ponad 30 miejsc czytających `staffQ` działało bez zmian, a potem stopniowe podpięcie pojedynczych atrybutów tam, gdzie mają sens;
- migracja zapisów: atrybuty losowane deterministycznie wokół obecnego `q`;
- rynek sztabu, pensje, widok Sztab, karta osoby, edytor i datapack (sekcja `staff`, nowa wersja pliku z migracją).
