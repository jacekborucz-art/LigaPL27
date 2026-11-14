# III liga w grze (4. poziom rozgrywek)

Stan: Nov 14, 2026. Od tej wersji III liga jest grywalna: 72 kluby w 4 grupach po 18 mają stałe kadry, finanse,
trenerów, infrastrukturę, kibiców i cele zarządu. Można zacząć karierę w klubie III ligi, a klub gracza po spadku
z 2 Ligi zostaje w grze. Liczby oznaczone [SZAC] to założenia do kalibracji.

Numeracja poziomów w kodzie: Ekstraklasa 1, 1 Liga 2, 2 Liga 3, III liga 4, IV liga 5 (IV liga nie jest prowadzona,
jej kluby grają tylko w Pucharze Polski z kadrą losowaną na mecz).

## Dane

- Lista klubów i tabele z Nov 10, 2026: `tools/data/3_liga_2026_2027.txt`, `tools/data/4_liga_2026_2027.txt`.
- Nazwy oficjalne, barwy, stadiony i pojemności: plik właściciela `tools/data/iii_liga_kluby_stadiony.txt`.
- Generator: `node tools/build-lower-leagues.mjs` tworzy `src/data/clubs_l3.js` i `src/data/clubs_l4.js`.
  Identyfikatory klubów są stałe (dopasowanie po nazwie bez skrótów organizacyjnych, roku założenia i nazwy
  sponsora, np. „KS CK Troszyn” = „KS Troszyn”, „KS Panattoni Goczałkowice-Zdrój” = „LKS Goczałkowice Zdrój”).
  Nazwa z listy tabel zostaje w polu `aka`. Barwy to dwa pierwsze kolory z opisu słownego. Miejscowość (pole
  `city`, `region`) służy do derbów i prasy lokalnej.
- Siła L klubu III ligi: 6,75 + 0,23 x waga (waga 1-5 z miejsca w tabeli i oceny eksperta), czyli 6,98-7,9 [SZAC].
  Najlepsza drużyna III ligi ma kadrę (średnia 14 najlepszych) słabszą od średniej 2 Ligi (test w
  `tests/thirdLeague.test.mjs`). Rezerwy: kadra jak w 2 Lidze, 75 % zawodników 17-21 lat.
- Kluby IV ligi mają województwo (`voiv`) i grupę III ligi (`l3group`).

## Rozgrywki i kalendarz

- Rozgrywki `liga3-1` ... `liga3-4` (grupy I-IV), `src/season/leagueComps.js` mapuje klub na rozgrywki.
  Grupa I: łódzkie, mazowieckie, podlaskie, warmińsko-mazurskie. Grupa II: kujawsko-pomorskie, pomorskie,
  wielkopolskie, zachodniopomorskie. Grupa III: dolnośląskie, lubuskie, opolskie, śląskie. Grupa IV: lubelskie,
  małopolskie, podkarpackie, świętokrzyskie.
- 34 kolejki, mecz i rewanż (ten sam generator co 1 i 2 Liga), mecze w soboty i niedziele (11:00-17:00).
- Kalendarz 2026/27 [SZAC]: start Jul 31, 2026 (pierwsza kolejka Aug 1-2), jesień do Nov 29, przerwa zimowa,
  wiosna od Feb 26, 2027, koniec Jun 6, 2027. Brakującą kolejkę gra się w środę (październik i listopad),
  nigdy w tygodniu rundy Pucharu Polski. Kolejne sezony przesuwają się o pełne tygodnie jak reszta kalendarza.
- Przełożenia meczów przy losowaniu Pucharu Polski działają jak w 1 i 2 Lidze (`rescheduleAround`).

## Awanse, baraże i spadki

1. Zwycięzca każdej grupy awansuje do 2 Ligi. Rezerwy awansują tylko wtedy, gdy w nowym sezonie pierwsza drużyna
   gra wyżej niż 2 Liga i nie przekraczają limitu `RESERVES.reserveMaxTier` (2 Liga). W przeciwnym razie awansuje
   następny uprawniony klub.
2. Baraże (rozgrywane w terminarzu): wicemistrzowie grup (drugi uprawniony klub) losują pary półfinałów, jeden mecz
   u pierwszej wylosowanej drużyny (Jun 9). Zwycięzcy grają dwumecz z 13. i 14. drużyną 2 Ligi: 1. mecz u drużyny
   z III ligi (Jun 13), rewanż u drużyny z 2 Ligi (Jun 16), liczy się suma bramek, potem dogrywka i karne.
   Mecz klubu gracza idzie pełnym silnikiem, pozostałe szybką symulacją. Widok: Rozgrywki, III liga, Baraże.
   Stary zapis albo sezon bez rozegranych dwumeczów: baraż symulowany z siły klubów (jak dawniej).
3. Z 2 Ligi spadają miejsca 15-18 i przegrani baraży. Spadkowicz trafia do grupy swojego województwa i zachowuje
   kadrę oraz finanse (pensje obniżone klauzulą spadkową).
4. Spadek do IV ligi: co najmniej miejsca 15-18 każdej grupy, a więcej, gdy grupa przyjmuje więcej spadkowiczów
   z 2 Ligi (reguła zmienna PZPN). Każda grupa przyjmuje z IV ligi 4 kluby (po jednym z województwa, wybór z wagi
   klubu z losowością), a gdy po spadkach brakuje drużyn, więcej. Grupa liczy zawsze 18 drużyn.
5. Kluby spadające do IV ligi tracą kadrę: zawodnicy poniżej 33 lat z OVR od 7 trafiają do wolnych, reszta znika.
   Klub gracza zostaje z kadrą do czasu zmiany pracy (gracz jest zwalniany i wybiera nowy klub).
6. Beniaminek z IV ligi dostaje nową kadrę (generator jak na start gry).
7. Kontrola po sezonie (`validateTiers`): po 18 klubów w ligach 1-3 i w każdej grupie III ligi, rezerwy niżej niż
   pierwsza drużyna i najwyżej w 2 Lidze.

Uproszczenia: brak baraży o awans do III ligi między mistrzami IV ligi; liczba beniaminków z IV ligi na grupę jest
stała (4), a nie zależna od podziału na województwa w danym sezonie. Grupa III ligi beniaminka z 2 Ligi wynika
z regionu klubu w danych gry (`l3GroupFor`).

## Puchar Polski

Format bez zmian: runda wstępna to 7 najsilniejszych klubów III ligi (bez rezerw, według wagi) i 7 zdobywców
pucharów wojewódzkich (liderzy losowych grup IV ligi). Kluby III ligi grają teraz prawdziwymi kadrami (kartki,
kontuzje i statystyki zostają). Klub gracza z III ligi spoza tej siódemki gra w rundzie wstępnej jako zdobywca
pucharu wojewódzkiego (zastępuje ostatniego zdobywcę z IV ligi): w rzeczywistości kluby III ligi wchodzą do
Pucharu Polski przez puchary regionalne, a gra nie prowadzi rozgrywek regionalnych.

## Ekonomia [SZAC]

Kluby III ligi nie mają danych finansowych w źródłach. Wartości z wagi klubu `w` (1-5), `src/data/finanse_klubow.js`:

| Pole | Klub | Rezerwy |
|---|---|---|
| Komercja (mln zł / sezon) | 0,3 + 0,14 w (0,44-1,0) | 0,05 |
| Płace I drużyny (mln zł / sezon) | 0,45 + 0,17 w (0,62-1,3) | 0,5 + 0,08 w |
| Frekwencja | 250 + 220 w, najwyżej 80 % pojemności | 150 + 20 w |
| Przychód z widza | 9 + w zł | 6 zł |
| Dopłata (mln zł / sezon) | miasto 0,2 + 0,07 w | pierwsza drużyna 0,45 + 0,07 w |
| Pojemność | z pliku właściciela | z pliku właściciela |

- Bez praw TV i bez premii za miejsce (centralny podział nie obejmuje III ligi). Nagrody Pucharu Polski jak w
  pozostałych ligach.
- Pensje zawodników: `TIER_WAGE[4] = 0,2` (pensja minimalna w grze 500 zł tygodniowo), płacowość klubu 0,86-1,1.
- Infrastruktura na start: stadion 1-3, baza i akademia 1-2. Licencja III ligi bez wymogów poziomu; po awansie
  klub ma sezon na inwestycje (także po dwóch awansach z rzędu).
- Zarząd: cele w grupie (awans albo baraże, czołówka, środek tabeli, utrzymanie), kibice: profil szacowany
  z renomy (brak danych w `kibice.js`), kary dyscyplinarne jak w 2 Lidze.

## Rynek

- Zakupy AI klubów III ligi rzadziej (szansa 0,2 na tydzień zamiast 0,4) i tanio (mały budżet). Kluby 2 Ligi
  szukają zawodników w III lidze tylko w grupie swojego regionu.
- Wolni zawodnicy: 65 na start (było 45), 45 latem (było 30), stałe minimum na pozycję x1,5
  (`MIND.keepFree`), górny limit 220 (było 150). Część wolnych ma poziom III ligi.
- Wypożyczenia, prekontrakty, prośby o transfer i oferty z zagranicy obejmują kluby III ligi.

## Stare zapisy

Przy wczytaniu (`ensureThirdLeague`, `src/season/thirdLeague.js`):

1. grupy III ligi wyrównane do 18 (stare zapisy losowały grupę spadkowiczów z 2 Ligi),
2. kluby III ligi bez kadry dostają kadrę (deterministycznie z ziarna gry), finanse i trenera,
3. terminarz 4 grup na cały bieżący sezon; mecze sprzed dnia wczytania rozgrywa szybka symulacja (wyniki
   i statystyki, bez finansów, kontuzji i pauz), więc tabele są pełne.

Wybrano najprostszy odporny wariant: ten sam terminarz co w nowej grze, bez czekania na kolejny sezon.
Zapis z października (save-oct.json): migracja ok. 0,6 s, 432 mecze w tle.

## Wydajność

Pomiar: `node` na serwerze deweloperskim, kariera Widzewem, cały sezon 2026/27 (365 dni), mecze gracza szybką
symulacją. Przed: 54 kluby z kadrami, po: 126.

| Miara | Przed | Po |
|---|---|---|
| Zawodnicy na start | 1 873 | 4 197 |
| Zapis nowej gry (JSON) | 2,6 MB | 5,7 MB |
| Zapis po sezonie | 4,3 MB | 8,9 MB |
| Dzień (średnio / mediana / p95) | 16 / 11 / 55 ms | 33 / 21 / 96 ms |
| Tydzień | ok. 115 ms | ok. 230 ms |
| Koniec sezonu (rollover) | 127 ms | ok. 270 ms |
| Cały sezon | 6,1 s | 12,4 s |

Koszt rośnie mniej więcej liniowo z liczbą zawodników (x2,2). Optymalizacje: indeks `clubById`, zbiór klubów
z meczami UEFA liczony raz na dzień (limit kadry), indeks rozegranych meczów klubów (rynek trenerów), odprawa
pomeczowa klubów III ligi bez szukania najlepszego tonu, rzadsze zakupy AI w III lidze i przeszukiwanie III ligi
tylko w grupie regionu. Mecze AI-AI idą najtańszą symulacją z zapisem zawodników (`playQuick`). Trening klubów
AI III ligi zostaje dzienny (rzadszy zmieniałby urazy i świeżość; do rozważenia, gdy telefony będą za wolne).
