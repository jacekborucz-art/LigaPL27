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

## 4. Skauci i skauting zagraniczny (dodane Nov 19, 2026)

Cel: gracz zleca skautowi poszukiwanie konkretnego profilu zawodnika za granicą. Skaut wyrusza w swój region i wraca
z listą kandydatów, których nie ma na żadnej liście w grze. Wynik zależy od cech skauta i losu. Te same zasady dla
gracza i klubów AI (AI korzysta z uproszczonej wersji albo wcale; do decyzji przy wdrożeniu, bez przewagi gracza).

Stan dziś: rola „skaut” w sztabie (rynek sztabu, `src/career/staffMarket.js`) z 3 atrybutami: ocena potencjału,
ocena umiejętności, znajomość rynków (`docs/sztab-atrybuty.md`). Skaut tylko poprawia dokładność oceny potencjału
zawodników innych klubów. Widoczna pula ok. 100 zawodników z zagranicy (`src/career/foreignPool.js`) zostaje bez zmian.

Decyzje (właściciel zostawił je do wyboru; wybrane opcje najbliższe realiom):
- Skauci w klubie od początku gry jak dziś (kluby Ekstraklasy i 1 Ligi mają zwykle 1-3 skautów, niższe ligi mniej,
  w III lidze rola niedostępna). Gracz może zwalniać i zatrudniać nowych.
- Dwie formy pracy:
  - na stałe: osoba w sztabie (pensja miesięczna, limit sztabu jak dziś), zlecenia bez dodatkowej opłaty poza kosztami wyjazdu;
  - na zlecenie (freelancer): jedna misja, opłata z góry (zależna od jakości i długości wyjazdu) plus prowizja przy
    podpisaniu znalezionego zawodnika (np. 3-8 % kwoty transferu albo ryczałt przy wolnym zawodniku) [SZAC].
- Lista wolnych skautów (do zatrudnienia albo na zlecenie): ok. 50 osób, odświeżana co pół roku (1 lipca i 1 stycznia),
  regiony losowane bez równego podziału (raz więcej ekspertów od Bałkanów, raz od Ameryki Południowej). Najlepsi
  skauci są drodzy i często poza zasięgiem mniejszych klubów (wysoka pensja i prowizja, renoma klubu jak przy sztabie).

Atrybuty skauta (zamiast obecnych 3; migracja i nowa wersja datapacku, starsze pliki działają):
- Doświadczenie: szansa powodzenia wyprawy, mniej pustych wyjazdów.
- Ocena zawodnika: jak dokładnie skaut opisuje umiejętności i potencjał kandydata (błąd raportu).
- Wiedza o rynku: realne ceny i pensje kandydata, czy zawodnik naprawdę chce przyjść do Polski.
- Sieć kontaktów: liczba kandydatów na liście, dostęp do zawodników z kontraktem (agenci, kluby).
- Ocena charakteru (propozycja): adaptacja, profesjonalizm, ryzyko „nie odnajdzie się w Polsce”.
Plus wiedza o regionach: każdy skaut ma 1-3 regiony z poziomem znajomości (mieszane umiejętności, np. Bałkany;
Półwysep Iberyjski i Afryka; Ameryka Południowa). Regiony do ustalenia, np. Bałkany, Europa Środkowa, Skandynawia,
Półwysep Iberyjski, Europa Zachodnia, Europa Wschodnia i Kaukaz, Afryka Zachodnia, Afryka Północna, Ameryka
Południowa, Ameryka Północna i Środkowa, Azja, Bliski Wschód. Poza swoimi regionami skaut pracuje dużo słabiej,
chyba że ma bardzo wysoką sieć kontaktów: kontakty częściowo zastępują znajomość regionu (skaut z kontaktami 18
w obcym regionie radzi sobie wyraźnie lepiej niż skaut z kontaktami 8, ale gorzej niż ekspert od tego regionu) [SZAC].

Zlecenie (gracz określa profil):
- region: dowolny, nie tylko ten, w którym skaut jest ekspertem (poza jego regionami dużo mniejsza skuteczność,
  łagodzona przez sieć kontaktów); pozycja, wiek od-do, poziom (np. podstawowy w obecnym
  klubie, wzmocnienie, perspektywa), maksymalna kwota transferu i pensja, wolny zawodnik albo z kontraktem;
- czas wyjazdu (np. 1, 2, 4 albo 6 tygodni): krótszy wyjazd kosztuje mniej, ale szansa znalezienia kandydata jest
  niska (tydzień: często pusta lista); dłuższy kosztuje więcej, daje większą szansę i więcej kandydatów, a skaut jest
  dłużej nieobecny w klubie (jego zwykła praca w sztabie w tym czasie słabsza);
- tylko zagranica: skaut nie szuka w polskich ligach 1-4 (ani niżej).

Wynik wyprawy:
- Bez statycznej listy ukrytych zawodników: kandydatów nie ma nigdzie przed wyjazdem. Po wyprawie system przelicza
  i losuje zdarzenia wyjazdu (np. dobry mecz obserwowany, polecenie agenta, kontuzja kandydata, ślepy zaułek)
  i dopiero wtedy tworzy listę od 0 do 7 kandydatów; liczba jest losowa (każda wyprawa inna, także dla tego samego
  zlecenia powtórzonego później).
- Szansa i liczba kandydatów: doświadczenie, sieć kontaktów, znajomość regionu, czas wyjazdu, trudność profilu
  (np. tani, młody i bardzo dobry to rzadkość) + RNG. Słabszy skaut częściej wraca z pustą listą albo z 1-2 nazwiskami.
- Atrybuty kandydata: oczekiwany profil ze zlecenia (poziom, pozycja, wiek) jako środek, odchylenie z szerokim RNG
  w górę albo w dół. Atrybuty skauta (ocena zawodnika, znajomość regionu, doświadczenie) zawężają rozrzut: dobry
  skaut przywozi kandydatów bliższych oczekiwaniom, słaby dalszych (także wyraźnie słabszych, rzadziej lepszych).
  Do tego skaut widzi atrybuty z błędem zależnym od oceny zawodnika i znajomości regionu (słabszy częściej się myli
  i przywozi „wydmuszki”).
- Raport w poczcie po powrocie: lista kandydatów z opisem skauta (mocne i słabe strony, cena, pensja, chęć przyjścia,
  ryzyko adaptacji). Znaleziony zawodnik trafia na listę obserwowanych gracza i do zwykłej mechaniki transferu
  (oferta do klubu zagranicznego albo kontrakt wolnego zawodnika); po kilku tygodniach bez działania może zniknąć
  z rynku albo trafić do innego klubu.

Do zrobienia: burza mózgów (ekspert piłkarski i skaut z doświadczeniem, Sonnet medium) nad regionami, liczbami
i kosztami [SZAC], potem wdrożenie: atrybuty i regiony skautów, lista wolnych skautów, ekran zleceń, wyprawa jako
system dnia, generowanie kandydatów, raport w poczcie, prowizje w finansach, edytor i datapack (nowa wersja pliku
z migracją), testy (ten sam profil i ziarno = ten sam wynik, słabszy skaut statystycznie gorzej).
