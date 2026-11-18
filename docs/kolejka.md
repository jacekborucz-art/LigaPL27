# Kolejka zadań (do wykonania)

Lista zadań zatwierdzonych przez właściciela do zrobienia później. Po wdrożeniu zadanie znika z listy (opis trafia do własnego pliku w `docs/`).

## 1. Historia morale zawodników (dodane Nov 18, 2026)

Dziś gra zna tylko obecne morale (`p.morale`, skala 1-20, `src/career/morale.js`). Strzałki morale w Skład i taktyka (PC) pokazują poziom, nie trend.

Zapis (do wyboru przy wdrożeniu):
- Podstawowy (ok. 1 h z testami): co poniedziałek system dnia zapisuje morale każdego zawodnika, 8 ostatnich tygodni (np. `p.moraleHist`). Ok. 4000 zawodników, ok. 100 KB zapisu [SZAC]. Trend: obecne morale wobec wartości sprzed 1-2 tygodni.
- Rozszerzony (dodatkowo ok. pół dnia): dziennik przyczyn zmian tylko dla kadry gracza (mecz, rozmowa, zebranie, ławka, kontrakt), np. ostatnie 20 wpisów. Wymaga podpięcia w 10 plikach z `applyMorale` (teamTalks, season, coachMarket, aiClubs, sessions, matchday, briefings, attention, fans, morale).
- Migracja starych zapisów: brak historii = pusty trend (strzałka poziomu jak dziś).

Wykorzystanie, informacja (bez zmiany balansu):
1. Strzałki trendu w Skład i taktyka: kierunek = rośnie/spada, kolor = poziom.
2. Karta zawodnika: mały wykres morale z 8 tygodni.
3. Raport drużyny i raport asystenta: ostrzeżenie o szybkim spadku (np. „morale spadło o 4 w 2 tygodnie”).
4. Kadra > Rozmowy: powód „Morale szybko spada” przed niskim poziomem; ocena skutku rozmowy (morale tydzień później).
5. Atmosfera w drużynie: trend w kafelku Rozmów i wykres sezonu w historii klubu.
6. Do zrobienia w tym tygodniu (`src/career/weeklyTodo.js`): zadanie „Morale spada u N zawodników”.

Wykorzystanie, logika gry (zmienia balans, każdy punkt do decyzji właściciela, najlepiej po burzy mózgów z ekspertami):
7. Prośba o transfer (`src/career/moveWish.js`): długi spadek morale zwiększa szansę prośby, nie tylko niski poziom.
8. Kluby AI i scouting: długo spadające morale jako okazja transferowa (także u zawodników gracza).
9. Kontrakty i negocjacje: rosnące morale ułatwia przedłużenie, spadające podnosi żądania.
10. Prasa: pytania o złą atmosferę po 3 tygodniach spadku morale drużyny.
11. Zarząd i autorytet trenera: długi spadek morale drużyny lekko obniża zaufanie zarządu.

Propozycja kolejności: zapis podstawowy i punkty 1-4, 6 (sama informacja), potem burza mózgów nad punktami 7-11.

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
