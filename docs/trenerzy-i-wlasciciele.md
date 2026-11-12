# Trenerzy i właściciele: skala trenerów w polskich ligach, zwolnienia, rynek trenerów

Stan na Nov 12, 2026. Zgłoszenie użytkownika (decyzje 2-4): nowy trener przynosi własny styl gry; skala trenerów
ma odpowiadać realiom polskich lig (ile znaczy 6, 10 i 14); kluby AI muszą zwalniać trenerów, a reakcja zależy
od właściciela, jego cech i charakteru. Ogólnie: wszystko dostosować do realiów polskiej piłki nożnej.

Panel: analityk polskiej piłki (Ekstraklasa, 1 Liga, 2 Liga), ekspert ds. własności i ładu klubowego,
trener UEFA Pro, matematyk (prawdopodobieństwo i rozrzut wyników), programista i projektant gry.
Kod: `src/career/coachMarket.js`, `src/career/owners.js`, `src/career/coaches.js`. Testy: `tests/coachMarket.test.mjs`.
Losowość sezonu trenera (stały punkt + los) opisuje `docs/trener-ai-atrybuty.md`, rozdział „Stały punkt + los w skali sezonu”.

Oznaczenia: **[ŹR n]** fakt z listy źródeł na końcu; **[WIEDZA]** wiedza panelu z publicznych relacji do połowy
2026 roku, której w tej sesji nie dało się sprawdzić na stronie źródłowej; **[SZAC]** szacunek panelu albo wartość
balansowa gry; **[SYM]** wynik symulacji w tym repozytorium.

**Dostęp do źródeł.** W tej sesji działała tylko wyszukiwarka. Bezpośrednie pobieranie stron było zablokowane
przez ustawienia sieci sesji (pzpn.pl, en.wikipedia.org, pl.wikipedia.org, transfermarkt.pl, 90minut.pl,
meczyki.pl, sport.tvp.pl, weszlo.com, laczynaspilka.pl i lustra Wikipedii). Liczby z tabel zmian trenerów
pochodzą więc z fragmentów wyników wyszukiwania, a nie z pełnych tabel. Pełne sprawdzenie wymaga dopuszczenia
tych domen w ustawieniach sieci sesji.

## Odpowiedź w skrócie

- **Skala trenerów:** zostaje bezwzględna (trener 12 w 2 Lidze jest tak samo dobry jak trener 12 w Ekstraklasie,
  co jest potrzebne na rynku trenerów), ale różnica między ligami jest mniejsza niż w kadrach. Średnie: Ekstraklasa
  ok. 10,4 (bez zmian), **1 Liga ok. 9** (było 8), **2 Liga ok. 8** (było 6). Powód: w Ekstraklasie i 1 Lidze
  trener musi mieć licencję UEFA Pro, w 2 Lidze UEFA Pro albo UEFA A (źródła nie są zgodne), trenerzy krążą
  między ligami, a 2 Liga to zawodowcy z krótszym doświadczeniem i słabszym zapleczem, nie amatorzy.
- **Słabszy od średniej trener to wciąż zawodowiec:** ujemna strona skali jest łagodniejsza (szczegóły w 1.5).
  Błędy słabego taktyka w meczach 2 Ligi: było **1,29** na mecz (obie drużyny), jest **«E3_AFTER»** (przed
  atrybutami 0, w Ekstraklasie dziś «E1_AFTER»).
- **Zmiany trenerów w rzeczywistości:** Ekstraklasa ma ok. 8-11 zmian w trakcie sezonu i 3-5 latem [ŹR, WIEDZA];
  zdarzają się kluby z trzema trenerami w sezonie (Raków i Wieczysta jesienią 2026 [ŹR 3, 4]). 1 Liga podobnie,
  2 Liga trochę mniej [SZAC]. Najwięcej zwolnień jesienią (wrzesień-listopad), potem w przerwie zimowej i w marcu-kwietniu.
- **W grze [SYM, 40 sezonów]:** Ekstraklasa **9,5** zmiany w trakcie sezonu (rozrzut 3-19) i **3,7** latem,
  1 Liga 9,2 i 3,2, 2 Liga 6,6 i 3,5. Jesień (sierpień-listopad) to ok. 52 % zwolnień w trakcie sezonu.
- **Właściciel** ma pięć cech (cierpliwość, ambicja, temperament, wrażliwość na kibiców i media, zasobność),
  średnie zależą od typu (miliarder, prywatny, miasto, spółka, rezerwy), kilka klubów ma korekty z publicznie
  opisanej historii zmian trenerów. Gracz widzi jedno zdanie bez liczb.
- **Nowy trener przynosi własny styl.** Pierwsi trenerzy w grze mają styl klubu (ciągłość), każdy następny swój.
- **Klub gracza** bez zmian: o posadzie gracza decyduje zarząd (`src/career/board.js`).

## 1. Kto trenuje w Ekstraklasie, 1 Lidze i 2 Lidze

### 1.1 Licencje

- UEFA Pro to najwyższa licencja i jedyna uprawniająca do prowadzenia drużyn Ekstraklasy i 1 Ligi [ŹR 5].
- 2 Liga: źródła się rozchodzą. Uchwała PZPN z 2016 roku wymienia UEFA Pro dla Ekstraklasy, 1 i 2 Ligi, tak samo
  Wielkopolski ZPN; PrawoSportowe.pl (artykuł sprzed kilku lat) podaje UEFA A dla 2 Ligi i UEFA Pro dla 1 Ligi [ŹR 5].
  Aktualny podręcznik licencyjny PZPN był niedostępny (blokada sieci), więc wymóg dla 2 Ligi zostaje niepewny.
- Ścieżka licencji: UEFA C, B, A, Pro; na kurs UEFA Pro przyjmowani są trenerzy z dyplomem UEFA A i stażem;
  licencja ważna 3 lata i wymaga doszkalania [ŹR 6].

Wniosek panelu: w każdej z trzech lig pracuje trener z jedną z dwóch najwyższych licencji, po kursach, z kilkuletnim
stażem w seniorach albo w roli asystenta. Różnica między ligami to doświadczenie, warsztat analityczny i zaplecze
(sztab, wideo, dane), a nie podstawy zawodu.

### 1.2 Typowe profile [WIEDZA, SZAC]

| Liga | Kto | Udział obcokrajowców |
|---|---|---|
| Ekstraklasa | trenerzy z doświadczeniem w Ekstraklasie i za granicą; częste sprowadzenia z Portugalii, Hiszpanii, Skandynawii, Bałkanów, Czech i Słowacji; kilku młodych polskich trenerów po awansie z klubem | ok. 35-45 % w ostatnich sezonach [WIEDZA]; latem 2024 roku cztery kluby zmieniły trenerów i wszyscy nowi byli obcokrajowcami [ŹR 1] |
| 1 Liga | polscy trenerzy z przeszłością w Ekstraklasie, młodzi ambitni trenerzy (np. 41-letni Marcin Matysiak w Zniczu [ŹR 7]), pojedynczy obcokrajowcy (Peter Struhar w Zniczu, Gino Lettieri w Wieczystej [ŹR 7, 8]) | ok. 10-20 % [SZAC] |
| 2 Liga | polscy trenerzy: byli zawodnicy, trenerzy na dorobku, weterani niższych lig | kilka procent [SZAC] |

Trenerzy krążą między ligami: Ireneusz Mamrot, Wojciech Łobodziński, Dawid Kroczek, Piotr Stokowiec pracowali
w ostatnich sezonach i w Ekstraklasie, i w 1 Lidze [ŹR 7, 9]. To główny argument za mniejszą różnicą lig.

### 1.3 Pensje

| Poziom | Pensja miesięczna | Źródło |
|---|---|---|
| Czołówka Ekstraklasy | 50-120 tys. zł | meczyki.pl [ŹR 10] |
| Marek Papszun w Rakowie (przed odejściem w 2023) | do 200 tys. zł | bankier.pl [ŹR 10] |
| Czołowe kluby Ekstraklasy, szacunek portalu bez źródła | 80-250 tys. zł brutto | freenance.io [ŹR 10] |
| Trener Wisły Płock poza czołową szóstką (starszy tekst) | do 30 tys. zł | superbiz.se.pl [ŹR 10] |
| 1 Liga | 15-40 tys. zł | [SZAC], brak danych w źródłach |
| 2 Liga | 8-20 tys. zł | [SZAC], brak danych w źródłach |

W grze pensja trenera to 2,5 % rocznych płac pierwszej drużyny (Legia ok. 160 tys. zł miesięcznie, Radomiak ok.
50 tys., klub 1 Ligi ok. 20 tys.), najmniej 30 / 15 / 8 tys. zł według ligi [SZAC]. Używa jej tylko odprawa.

### 1.4 Co znaczy 6, 10 i 14 na 20 (nowa skala)

| Średnia atrybutów | Słowami | Gdzie zwykle |
|---|---|---|
| 4-5 | trener na dorobku, uczy się na błędach; robi rzeczy, które szkodzą (cofa zespół, długie piłki na pressing) | rzadko, dół 2 Ligi |
| 6-7 | solidny trener niższej ligi: przygotowany, ale plan prosty, reakcje w meczu spóźnione | 2 Liga, słabszy trener 1 Ligi |
| 8-9 | dobry trener 1 Ligi albo średni 2 Ligi: plan pod rywala czasem, zmiany zwykle w porę | 1 Liga, dobra 2 Liga, dół Ekstraklasy |
| 10-11 | średni trener Ekstraklasy: AI sprzed atrybutów | Ekstraklasa |
| 12-13 | czołowy trener Ekstraklasy | góra Ekstraklasy, pojedynczy trenerzy z 1 Ligi na dorobku |
| 14-16 | wyróżniający się trener ligi, kandydat do pracy za granicą | 1-3 trenerów w lidze |
| 17-20 | klasa europejska, w polskiej lidze wyjątek | |

### 1.5 Decyzja: skala bezwzględna, ale ściśnięta między ligami, z łagodniejszą ujemną stroną

Matematyk i programista: atrybut działa przez umiejętność `s = (atrybut - 10,5) / 9,5`. Wcześniej trener 2 Ligi
(średnio 6) miał `s = -0,47`, czyli prawie połowę maksymalnej skali błędów: co trzecia-czwarta ocena planu w meczu
kończyła się złą korektą. Analityk polskiej piłki: tak nie grają drużyny 2 Ligi; ich trenerzy rzadziej trafiają z planem,
ale nie robią amatorskich błędów co mecz.

Zmiany:

1. **Średnie lig** (premia ligi w `COACH.gen.tier`: Ekstraklasa +1, 1 Liga +0,9, 2 Liga +1,15 przy wzorze
   3,5 + 0,8 x prestiż): Ekstraklasa 10,4 (bez zmian, te same losowania), 1 Liga 9,0, 2 Liga 8,0. Skala dalej
   bezwzględna: rynek trenerów porównuje trenerów z różnych lig.
2. **Ujemna strona łagodniejsza:** `s` ujemne podniesione do potęgi 1,35 (`COACH.lowCurve`). Trener 8 ma
   `s = -0,16` zamiast -0,26, trener 6: -0,34 zamiast -0,47, trener 3: -0,75 zamiast -0,79. Dodatnia strona
   i punkt 10,5 bez zmian, więc średni trener Ekstraklasy gra dokładnie jak dotąd.
3. **Asystent gracza** w 1 i 2 Lidze przeliczony do nowej skali (`assistantProfile(q, liga)`: +0,7 i +1,6 pkt),
   żeby asystent klubu był średnio tak dobry jak trener AI tej ligi (bez tego pasywny gracz w 2 Lidze miałby gorszego
   „trenera” niż rywale).

Pomiar w pełnym silniku [SYM, 1500 meczów AI kontra AI w danej lidze, trenerzy z generatora, odprawy AI]:

| Liga | Statystyka | Przed atrybutami | Atrybuty (commit c58f161) | Teraz |
|---|---|---|---|---|
| 2 Liga | błędy słabego taktyka na mecz (obie drużyny) | 0 | 1,29 | «E3_AFTER» |
| 2 Liga | chybiony plan przedmeczowy (na mecz, obie drużyny) | 0 | «P3_BEFORE» | «P3_AFTER» |
| 2 Liga | okrzyki na mecz | «SH3_PLAIN» | 1,65 | «SH3_AFTER» |
| Ekstraklasa | błędy słabego taktyka na mecz | 0 | 0,52 | «E1_AFTER» |
| Ekstraklasa | gole na mecz | 2,75 | 2,77 | «G1_AFTER» |

Wpływ na siłę trenera: dobry (16) kontra słaby (8) na tych samych kadrach daje teraz «GVB_SEASON» pkt w sezonie
(było 4,4 przy pomiarze z c58f161, 4,9 w nowym pomiarze na stałym świecie), bo słaby trener mniej szkodzi.

## 2. Zmiany trenerów w rzeczywistości

### 2.1 Ile zmian na sezon

| Sezon | Ekstraklasa | Źródło |
|---|---|---|
| 2023/24 | ok. 10 zmian w trakcie sezonu: m.in. Widzew (wrzesień), ŁKS (październik), Radomiak (listopad), Lech, Cracovia (kwiecień, trener tymczasowy), Legia (kwiecień), latem m.in. Raków | [ŹR 2], [WIEDZA] |
| 2024/25 | przed sezonem 4 kluby (wszyscy nowi to obcokrajowcy); w trakcie m.in. Pogoń (sierpień), Stal Mielec (sierpień i marzec), Zagłębie (wrzesień), Śląsk, Lechia, Radomiak (grudzień, trener odszedł do Caen), Widzew (marzec), Górnik (koniec sezonu) | [ŹR 1, 2], [WIEDZA] |
| 2025/26 | jesienią Widzew dwa razy (sierpień i październik), Pogoń (wrzesień), Piast (październik), Radomiak (październik), Legia (listopad); Arka to siódmy klub ze zmianą w tym sezonie | [ŹR 3, 11] |
| 2026/27 (do listopada) | „Ekstraklasa oszalała”: siedem klubów ze zmianą, Raków z kolejnym trenerem w sezonie, Wieczysta z trzecim, Korona zwolniła najstarszego trenera ligi, zmiany w Cracovii i Radomiaku | [ŹR 3, 4] |

Wniosek [SZAC na bazie źródeł]: Ekstraklasa ok. 8-11 zmian w trakcie sezonu (średnio ok. 9-10) i 3-5 latem;
co sezon 1-2 kluby zmieniają trenera dwa razy. W porównaniu 18 lig wyżej w rankingu UEFA więcej zwolnień w jednym
z sezonów miały tylko Rumunia, Grecja, Turcja i Cypr [ŹR 2]. Za siedem lat rządów Dariusza Mioduskiego Legia
zmieniła trenera 11 razy [ŹR 2].

1 Liga: pełnych liczb nie znaleziono. W sezonie 2025/26 już po czterech kolejkach Znicz zwolnił trzeciego trenera
na zapleczu (po Ruchu i innym klubie), dalej m.in. Górnik Łęczna (wrzesień), Wieczysta (październik, przy 2. miejscu
w tabeli), Warta i Miedź [ŹR 7, 8]. Wniosek [SZAC]: 1 Liga tyle co Ekstraklasa, ok. 8-11 zmian w trakcie sezonu.
2 Liga: brak zestawień w źródłach; panel zakłada mniej zmian (6-8), bo budżety są małe, a właścicielem częściej jest
miasto [SZAC].

### 2.2 Średni staż

CIES (global, 2022): średnio 451 dni, mediana 243 dni; ligi od 156 dni (Arabia Saudyjska) do 1536 dni (Irlandia Północna)
[ŹR 12]. Wartości dla Ekstraklasy nie było w dostępnych fragmentach. Przy ok. 13 zmianach na 18 klubów rocznie
średni staż w Ekstraklasie to ok. 1,3-1,5 roku [SZAC], mediana poniżej roku.

### 2.3 Co uruchamia zwolnienie [WIEDZA, ŹR 1-4, 7, 11]

- seria porażek (3-5 meczów), szczególnie na starcie sezonu, gdy oczekiwania są świeże;
- miejsce w strefie spadkowej albo tuż nad nią; „ratownik” na ostatnie kolejki (np. Leszek Ojrzyński [ŹR 11]);
- miejsce wyraźnie poniżej celu, także w czołówce (Legia, Raków, Lech), czasem nawet przy wysokim miejscu (Wieczysta
  zwolniła trenera przy 2. miejscu w 1 Lidze [ŹR 8]);
- odpadnięcie z Pucharu Polski z niższą ligą, odpadnięcie w eliminacjach pucharów europejskich;
- presja kibiców (transparenty, bojkot dopingu), u klubów miejskich także lokalna polityka;
- zmiana właściciela albo prezesa, nowy dyrektor sportowy;
- odejście trenera po udanym sezonie do większego klubu albo za granicę.

### 2.4 Kiedy

Jesień (sierpień-listopad) to największa grupa zwolnień (tabela 2.1), potem przerwa zimowa (grudzień, styczeń: czas
na nowego trenera przed obozem) i marzec-kwiecień. W maju rzadko, chyba że w walce o utrzymanie.

### 2.5 Trener tymczasowy i odprawa

Najczęściej asystent przejmuje drużynę na 1-2 mecze, czasem do końca sezonu (Piotr Gierczak w Górniku po Janie
Urbanie [ŹR 11]), czasem zostaje na stałe (Dawid Kroczek w Cracovii, 2024 [ŹR 2]). Odprawy: umowy często mają klauzule
rozwiązania; w sporze Piasta z Waldemarem Fornalikiem mowa o trzech pensjach [ŹR 11]. Gra: odprawa = 3 pensje [SZAC].

### 2.6 Czy zmiana trenera pomaga

Badania: zwolnienie zwykle przychodzi w dołku, a późniejsza poprawa to głównie powrót do średniej. Sue Bridgewater
(Premier League 1992-2008): po zwolnieniu drużyny wracają do ok. 1,3 pkt na mecz, „krótki miesiąc miodowy”, ale nie
dzięki trenerowi. Badanie 15 sezonów w Niemczech, Francji, Włoszech i Hiszpanii: średnio mała różnica, do 0,1 pkt
na mecz przez 20 meczów, latem do 0,13 [ŹR 13]. Gra: mały efekt nowej miotły (rozdział 4.5), poprawę po zwolnieniu
robi sam powrót do średniej.

## 3. Właściciele

### 3.1 Typy w polskiej piłce [WIEDZA, ŹR 2, 14]

| Typ | Przykłady w grze | Zachowanie wobec trenera |
|---|---|---|
| miliarder | Raków (Michał Świerczewski), Widzew (Robert Dobrzycki), Wieczysta (Wojciech Kwiecień), Pogoń (Alex Haditaghi), Cracovia (Robert Platek), Motor (Zbigniew Jakubas) | wysokie ambicje i pieniądze, krótka cierpliwość, szybkie decyzje; zagraniczni inwestorzy częściej sięgają po trenerów z zagranicy |
| prywatny | Legia (Dariusz Mioduski), Lech (rodzina Rutkowskich), Wisła Kraków (Jarosław Królewski) | różnie: od częstych zmian (Legia) po stabilny pion sportowy |
| miasto | Jagiellonia, Górnik, Piast, Korona, GKS Katowice, większość klubów 1 i 2 Ligi | budżet z dotacji, decyzje pod presją kibiców i lokalnej polityki, wolniejszy proces (dłuższe zastępstwa) |
| spółka | Zagłębie (KGHM), Termalica (Bruk-Bet), Rekord | spokojniej, ale spółka skarbu państwa jest wrażliwa na politykę i media |
| rezerwy | Legia II, Śląsk II | trener pracuje na rzecz akademii, wynik mniej ważny |

### 3.2 Cechy w grze (1-20, `src/career/owners.js`) [SZAC]

| Cecha | Co robi w modelu |
|---|---|
| cierpliwość | próg zwolnienia: +1,1 punktu presji za każdy punkt ponad 10 |
| ambicja | oczekiwane miejsce wyżej o 0,2 miejsca za punkt ponad 10; mocniejszy wstrząs po odpadnięciu z pucharów; lepszy trener przy zatrudnianiu |
| temperament | próg niższy o 0,3 za punkt, losowy nastrój dnia (rozrzut progu 0,22 x temperament), mocniej waży ostatnie mecze, krótszy okres ochronny nowego trenera, mniej trafne oceny kandydatów |
| media | waga presji kibiców (heat z `career/fans.js`), szansa ulegnięcia żądaniu zwolnienia trenera (0,2 + 0,025 x media) |
| zasobność | z dopłat i skarbca w finansach (`5 + 4 log2(1 + mln/2)`): lepszy trener na rynku, łatwiejsza odprawa |

Średnie według typu: miliarder cierpliwość 7, ambicja 16, temperament 13, media 10; prywatny 10 / 11 / 11 / 10;
miasto 10 / 9 / 9 / 14; spółka 11 / 10 / 8 / 12; rezerwy 16 / 5 / 5 / 4; rozrzut 2,6.

### 3.3 Korekty dla właścicieli z dobrze opisaną historią

Interpretacja na potrzeby gry na podstawie liczby zmian trenerów, a nie ocena osób (rozrzut 1,2 zamiast 2,6):

| Klub | Korekta | Podstawa |
|---|---|---|
| Legia | cierpliwość 5, ambicja 17, temperament 13 | 11 zmian trenera w 7 lat [ŹR 2] |
| Widzew | cierpliwość 5, ambicja 18, temperament 14 | dwie zmiany jesienią 2025 [ŹR 11] |
| Raków | cierpliwość 8, ambicja 18 | kilka trenerów w krótkim czasie po erze Papszuna [ŹR 3] |
| Wieczysta | cierpliwość 4, ambicja 18, temperament 15 | zmiana przy 2. miejscu w 1 Lidze, trzeci trener w sezonie 2026/27 [ŹR 4, 8] |
| Pogoń | cierpliwość 7, temperament 13 | zmiana we wrześniu 2025 po zmianie właściciela [ŹR 11] |
| Jagiellonia | cierpliwość 15, temperament 7 | stabilny pion sportowy, mistrzostwo 2024 [WIEDZA] |
| Lech | cierpliwość 12, temperament 8 | [WIEDZA] |

Gracz widzi nazwę, typ i jedno zdanie, np. „Ambitny, niecierpliwy i porywczy, ma pieniądze na drogiego trenera.”

## 4. Model w grze

### 4.1 Styl trenera

Profil trenera ma własny styl (O ofensywny, S ostrożny, P pragmatyczny). `coachStyle(game, klub)` zastępuje
odczyt stylu z danych klubu wszędzie, gdzie decydował styl: decyzje w meczu (`T.coach` w silniku przez `matchday.js`
i `app.js`), ustawienie na start meczu (`aiPreMatchFormation`), odprawy AI przed meczem, w przerwie i po meczu w tle
(`season.js`), akcent treningu klubu AI (`training/aiClubs.js`). Pierwsi trenerzy w grze mają styl klubu (ciągłość),
trener tymczasowy (asystent) też. Nowy trener z rynku przynosi swój styl (rozkład w puli: 35 % ofensywnych, 40 %
pragmatycznych, 25 % ostrożnych [SZAC]). Ustawienie ulubione (rodzina formacji) nie weszło: pytanie 2 w rozdziale 7.

### 4.2 Presja na trenera (ocena dzień po każdym meczu ligowym)

`C = tabela + strefa spadkowa + forma + seria + wstrząs pucharowy + kibice` [SZAC]:

- tabela: 2,4 punktu za każde miejsce poniżej oczekiwań (cel zarządu z `seasonGoalFor` minus 0,2 x (ambicja - 10)),
  z pełną wagą od 12. kolejki;
- strefa spadkowa 9, miejsce nad nią 3;
- forma: 8 x (1,25 - punkty na mecz w ostatnich 5), mocniej u porywczego właściciela;
- seria: 3 za każdą porażkę z rzędu od trzeciej, 1,5 za mecz bez wygranej od piątego;
- wstrząs: odpadnięcie z Pucharu Polski z niższą ligą 9 (z równą lub wyższą 6 x ambicja), z pucharów europejskich
  5 x ambicja, wygasa przez 35 dni;
- kibice: heat (0-100) x 0,08 x media / 10;
- nowy trener: pierwsze 6 meczów presja x 0,35-1.

Próg: `25 + premia ligi (Ekstraklasa +1,5, 1 Liga -2,5, 2 Liga -1,3) + 1,1 (cierpliwość - 10) - 0,3 (temperament - 10)`,
+5 gdy trener wykonał cel w poprzednim sezonie, +3 po 2 latach pracy; do tego los dnia (rozrzut 0,22 x temperament).
Szansa zwolnienia po meczu: `0,4 x min(1, (C - próg) / 12)^1,5`, w ostatnich 4 kolejkach poza strefą spadkową x0,3,
przed 3. kolejką i w ostatniej kolejce 0. W przerwie zimowej (18 grudnia) jeden przegląd wszystkich klubów z progiem
niższym o 3. Żądanie zwolnienia przez kibiców (`career/fans.js`, najwyższy szczebel protestu) idzie tą samą drogą.

### 4.3 Trener tymczasowy, zatrudnienie, pula

- Zwolniony trener trafia do puli wolnych trenerów; klub płaci odprawę (3 pensje, wpis w finansach).
- Asystent ze sztabu klubu prowadzi zespół: miasto 7-20 dni, spółka 6-16, prywatny 3-12, miliarder 2-8 [SZAC].
  Od 15 kwietnia w 35 % przypadków do końca sezonu. Po dobrych wynikach (1,8 pkt na mecz) 50 % szans, że zostaje
  na stałe, inaczej 15 % (przy słabych mniej).
- Zatrudnienie: poziom klubu (średnia trenera dla prestiżu i ligi) + 0,08 x (ambicja - 10) + 0,1 x (zasobność - 10).
  Kandydaci: wolni trenerzy do poziomu + 2, a z szansą 30 % także trenerzy niższej ligi, którzy wykonali cel
  w poprzednim sezonie (klub traci trenera i szuka następcy). Właściciel ocenia kandydata z błędem (0,6 + 0,06 x
  temperament), w strefie spadkowej woli trenera ostrożnego, miliarder lekko woli obcokrajowca. Zwolnionego trenera
  ten sam klub nie zatrudnia ponownie.
- Pula: 44 trenerów na start (średnia 8,4, rozrzut 1,6; 25 % obcokrajowców, średnio +0,5), co sezon 12 nowych
  (33-46 lat, średnia 7,8), trenerzy od 68 lat odchodzą, po dwóch latach bez pracy połowa znika z rynku.

### 4.4 Po sezonie (2 czerwca)

Spadek: 50 % x niecierpliwość; sezon 2 i więcej miejsc poniżej oczekiwań: 7 % za miejsce (najwyżej 60 %);
awans: 3 %; reszta: 11 % (koniec umowy, inny pomysł na drużynę); trener tymczasowy: 75 % nowy trener, inaczej zostaje.
Trener 1 i 2 Ligi po sezonie 3 miejsca ponad oczekiwania odchodzi z szansą 10 % (lepsza oferta).
Kapitał na kolejny sezon: trener, który wykonał cel, ma próg wyższy o 5.

### 4.5 Sezon trenera i nowa miotła

Opis dla gracza i rozkład wyników: `docs/trener-ai-atrybuty.md`. W skrócie: dopasowanie stylu do kadry (do +-0,75
pkt atrybutu), chemia z szatnią losowana raz na sezon (rozrzut 1,5, najwyżej +-3), nowa miotła +1,5 pkt atrybutu
malejąca do zera przez 6 tygodni i jednorazowo +0,4 morale kadry. Razem najwyżej +-3,5 pkt, dodawane do taktyki,
składu i motywacji w meczu (`profile.boost`).

### 4.6 Wiadomości

Kategoria Media, bez zatrzymywania dni: zwolnienie i zatrudnienie w klubach ligi gracza oraz w czołowych klubach
Ekstraklasy (prestiż od 7); po sezonie jedna wiadomość „Karuzela trenerska po sezonie”. Pozostałe zmiany widać
w widoku klubu (Historia). Średnio ok. 4 wiadomości w sezonie dla gracza w 2 Lidze [SYM].

### 4.7 Interfejs

Widok klubu, panel „O klubie”: właściciel z typem i jednym zdaniem o charakterze; karta trenera ze stylem, wiekiem,
krajem (obcokrajowiec), datą objęcia i liczbą meczów o punkty, informacją o trenerze tymczasowym, zwijaną historią
(poprzednie kluby trenera, ostatnie zmiany trenera w klubie).

## 5. Kalibracja [SYM]

Pętla dni z rynkiem trenerów, gracz w 2 Lidze (Śląsk II, zaufanie zarządu 100), 40 sezonów 2026/27 (ziarna 1-40):

| Liga | W trakcie sezonu | Rozrzut (min-max) | Latem | Cel z badań |
|---|---|---|---|---|
| Ekstraklasa | 9,5 | 3,2 (3-19) | 3,7 | 8-11 i 3-5 |
| 1 Liga | 9,2 | 3,5 (2-18) | 3,2 | ok. 8-11 [SZAC] |
| 2 Liga | 6,6 | 2,8 (1-14) | 3,5 | 6-8 [SZAC] |

Zwolnienia w trakcie sezonu według miesięcy (wszystkie ligi, średnio na sezon): sierpień 0,8, wrzesień 3,5,
październik 4,3, listopad 4,6, grudzień 2,7, styczeń 0,2, luty 1,3, marzec 3,2, kwiecień 3,3, maj 1,6.
Po żądaniu kibiców: 0,3 na sezon. Trenerzy niższych lig podebrani przez wyższe: ok. 1 na sezon (od drugiego sezonu).

Wieloletnio (pętla dni z końcem sezonu, 3 sezony, ziarna «TEN_SEEDS»): «TENURE».

## 6. Pliki i testy

- `src/career/owners.js` (nowy): profil właściciela, opis słowami.
- `src/career/coachMarket.js` (nowy): presja, zwolnienia, trener tymczasowy, zatrudnienie, pula, przegląd po sezonie,
  nowy sezon puli, sezon trenera (dopasowanie, chemia, nowa miotła), wiadomości, system dnia `coachMarket` (kolejność 57).
- `src/career/coaches.js`: skala lig, łagodniejsza ujemna strona, `coachStyle`, własny styl nowego trenera, staż
  i historia w profilu (wersja 2, stary zapis podnoszony przy wczytaniu, te same nazwiska), `boost` w `matchCoach`,
  asystent gracza wg ligi.
- `src/career/fans.js`: żądanie zwolnienia trenera przez rynek trenerów, szansa wg właściciela.
- `src/career/careerSystem.js`, `src/season/rollover.js`: pula przy wczytaniu i po sezonie.
- Odczyt stylu trenera: `src/match/matchday.js`, `src/season/season.js`, `src/app.js`, `src/training/aiClubs.js`.
- `src/ui/clubView.js`, `src/styles/club.css`: właściciel, staż, historia.
- Testy: `tests/coachMarket.test.mjs` (skala lig, właściciel, styl, wpływ właściciela, zwolnienie i zatrudnienie,
  sezon trenera, stary zapis, sezon na pętli dni z liczbą zmian i determinizmem).

## 7. Otwarte pytania

1. **2 Liga: UEFA A czy UEFA Pro?** Aktualny podręcznik licencyjny PZPN był niedostępny. Na model nie wpływa
   (2 Liga średnio 8), ale warto sprawdzić przy dostępie do pzpn.pl.
2. **Ulubione ustawienie trenera.** Nowy trener mógłby przynosić rodzinę formacji (np. trójka obrońców). Pomiar
   z `docs/trener-ai-atrybuty.md` pokazuje, że 3-4-3 kosztuje w silniku 0,13 pkt na mecz, a 4-3-3 daje +0,09, więc to
   zmiana balansu silnika; odłożone do decyzji.
3. **Gracz jako kandydat.** Kluby AI z wakatem mogłyby częściej proponować pracę graczowi (dziś oferty pracy
   losuje zarząd, `board.js`). Celowo bez zmian.
4. **Liczby dla 1 i 2 Ligi** są szacunkiem panelu; po dopuszczeniu 90minut.pl i Wikipedii warto policzyć tabele
   zmian z 3-4 sezonów i poprawić progi lig (`MARKET.thrTier`).
5. **Zmiana właściciela** (sprzedaż klubu) nie jest modelowana.

## Źródła

1. Soccerway / Flashscore, „Cztery kluby Ekstraklasy zmieniły trenerów przed nowym sezonem. Wszyscy to obcokrajowcy”: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-cztery-kluby-ekstraklasy-zmieni-y-trenerow-przed-nowym-sezonem-wszyscy-to-obcokrajowcy/b3hzZaa5 ; Wikiwand, 2024-25 Ekstraklasa (tabela zmian trenerów, fragmenty): https://www.wikiwand.com/en/2024%E2%80%9325_Ekstraklasa
2. RMF24, „Jak oni zwalniają” (porównanie 18 lig UEFA): https://www.rmf24.pl/fakty/news-jak-oni-zwalniaja,nId,1726746 ; Eska, „Ekstraklasa pełna trenerskich roszad”: https://www.eska.pl/news/sport/ekstraklasa-pelna-trenerskich-roszad-kolejne-kluby-zmieniaja-szkoleniowcow-aa-rgCL-5BJN-vGnk.html ; meczyki.pl, „Lista hańby Legii. Dariusz Mioduski znów to zrobił”: https://www.meczyki.pl/newsy/plus/lista-hanby-legii-dariusz-mioduski-znow-to-zrobil-ratuja-dwa-razy/237332 ; football.fandom.com, 2023-24 Ekstraklasa: https://football.fandom.com/wiki/2023%E2%80%9324_Ekstraklasa ; Soccerway, „Wszystkie kluby z dolnej połowy tabeli PKO BP Ekstraklasy zmieniły trenera”: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-wszystkie-kluby-z-dolnej-po-owy-tabeli-pko-bp-ekstraklasy-zmieni-y-trenera/QDTNJ91e
3. WP SportoweFakty, „Ekstraklasa oszalała! Kolejne kluby wyrzucają trenerów. Raków bije rekord”: https://sportowefakty.wp.pl/pilka-nozna/1283768/alez-karuzela-w-ekstraklasie-siedem-klubow-zmienilo-trenerow ; Wikipedia, Ekstraklasa 2025/26 (fragmenty z wyszukiwarki): https://pl.wikipedia.org/wiki/Ekstraklasa_w_pi%C5%82ce_no%C5%BCnej_(2025/2026) ; KKSLECH.com, „Ekstraklasa: Kolejne zmiany trenerów” (Nov 11, 2026): https://kkslech.com/2026/11/11/ekstraklasa-kolejne-zmiany-trenerow/
4. Flashscore, „Koniec chorwackiego eksperymentu, Wieczysta będzie mieć trzeciego trenera w sezonie”: https://www.flashscore.pl/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-koniec-chorwackiego-eksperymentu-wieczysta-bedzie-miec-trzeciego-trenera-w-sezonie/zD93KMUb/ ; Flashscore, „Oficjalnie: Raków z trzecim trenerem w sezonie”: https://www.flashscore.pl/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-oficjalnie-rakow-z-trzecim-trenerem-w-sezonie-kaczmarek-przerwie-katastrofalna-serie/hx2ko5MH/
5. Licencje trenerskie: Wielkopolski ZPN: https://wielkopolskizpn.pl/licencje-trenerskie ; PrawoSportowe.pl, „Zmiany w piłkarskiej uchwale o licencjach trenerskich”: https://prawosportowe.pl/a/zmiany-w-pilkarskiej-uchwale-o-licencjach-trenerskich ; pracasport.pl, „Jak zostać trenerem piłkarskim w Polsce”: https://pracasport.pl/jak-zostac-trenerem-pilkarskim-licencje-uefa ; uchwała Zarządu PZPN IV/80 z 2016 (PDF na pzpn.pl, zablokowany w tej sesji)
6. PZPN, kursy UEFA Pro (2014): https://pzpn.pl/en/coaching/news/2013-12-03/the-courses-in-the-pzpn-coaching-school-in-2014 ; MZPN Kraków, przedłużenie licencji: https://www.mzpnkrakow.pl/wp-content/uploads/2025/10/Przedluzenie-licencji-trenerskiej.pdf
7. Soccerway, „Trener Marcin Matysiak odchodzi ze Znicza Pruszków. To kolejne zwolnienie w 1. Lidze”: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-betclic-1-liga-trener-marcin-matysiak-odchodzi-ze-znicza-pruszkow-to-kolejne-zwolnienie-w-1-lidze/tCJklsnJ ; „Słowak Peter Struhar został nowym trenerem Znicza”: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-betclic-1-liga-s-owak-peter-struhar-zosta-nowym-trenerem-znicza-pruszkow-zastapi-matysiaka/UZlao3zp ; „Zmiany trenerów w 1. lidze. Łobodziński zastąpił Mamrota”: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-betclic-1-liga-zmiany-trenerow-w-1-lidze-obodzinski-zastapi-mamrota-a-tarasiewicz-klepczarka-w-warcie/n3k7ZRWa ; „Kolejna zmiana trenera na starcie rozgrywek 1. Ligi. Dawid Szulczek opuszcza Ruch”: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-betclic-1-liga-dawid-szulczek-opuszcza-ruch-chorzow-/I5K7IwTh
8. Soccerway, „Oficjalnie: Wieczysta ma nowego trenera, Gino Lettieri przejmuje wicelidera”: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-betclic-1-liga-oficjalnie-wieczysta-ma-nowego-trenera-gino-lettieri-przejmuje-wicelidera/rNrVOQFs
9. Soccerway, „Miedź żegna się z trenerem po słabych wynikach, Ireneusz Mamrot następcą Belli”: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-fortuna-1-liga-miedz-zegna-sie-z-trenerem-po-s-abych-wynikach-ireneusz-mamrot-nastepca-belli/MBoppvW8 ; Flashscore, „Dawid Kroczek nowym trenerem Miedzi Legnica”: https://www.flashscore.pl/wiadomosci/d-ugo-bez-pracy-nie-pozosta-dawid-kroczek-nowym-trenerem-miedzi-legnica/zoJeGbBE/
10. Pensje: meczyki.pl, „Zarobki trenerów piłkarskich”: https://www.meczyki.pl/newsy/pilka-nozna/zarobki-trenerow-pilkarskich-ile-zarabiaja-trenerzy-pilkarscy-seoopt/166111 ; bankier.pl, „Marek Papszun wraca do Rakowa”: https://www.bankier.pl/wiadomosc/Marek-Papszun-wraca-do-Rakowa-Dostanie-rekordowa-pensje-8749918.html ; freenance.io, „Zarobki w sporcie 2026”: https://freenance.io/zarobki/zarobki-w-sporcie-2026/ ; superbiz.se.pl, „Brzęczek zarobi więcej niż w Płocku”: https://superbiz.se.pl/wiadomosci/brzeczek-zarobi-wiecej-niz-w-plocku-ale-mniej-od-innych-trenerow-aa-5Wnz-yPCs-vZFa.html
11. Soccerway, „Ligowy semafor: Górnik zaskakuje zwolnieniem Urbana, nerwowa Legia i ratownik Ojrzyński”: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-ligowy-semafor-gornik-zaskakuje-zwolnieniem-urbana-nerwowa-legia-i-ratownik-ojrzynski/Qo6ytn0C ; „Piotr Gierczak zastępuje Jana Urbana”: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-piotr-gierczak-zastepuje-jana-urbana-i-bedzie-trenerem-gornika-zabrze-do-konca-sezonu/rkVfLrf2 ; meczyki.pl, „Piast Gliwice idzie na wojnę z Waldemarem Fornalikiem”: https://www.meczyki.pl/newsy/piast-gliwice-idzie-na-wojne-z-waldemarem-fornalikiem-mocne-stanowisko-klubu-ws-zachowania-bylego-trenera/210764-n ; RMF24, „Misja dobiegła końca. Dawid Szwarga nie jest już trenerem Arki”: https://www.rmf24.pl/pilka-nozna/news-misja-dobiegla-konca-dawid-szwarga-nie-jest-juz-trenerem-ark,nId,8074034
12. CIES Football Observatory, „Coaches’ average tenure duration: global analysis”: https://www.cies.ch/cies/news/news-detail/article/coaches-average-tenure-duration-global-analysis ; „75% of coaches in charge for less than a year”: https://www.cies.ch/cies/news/news-detail/article/75-of-coaches-in-charge-for-less-than-a-year
13. FourFourTwo, „Soccernomics: Does sacking the manager actually make a difference?”: https://www.fourfourtwo.com/us/features/soccernomics-does-sacking-manager-actually-make-difference ; Analytics FC, „Special Ones? The Effect of Head Coaches on Football Team Performance”: https://analyticsfc.co.uk/blog/2021/03/11/special-ones-the-effect-of-head-coaches-on-football-team-performance/
14. Właściciele klubów: `src/data/finanse_klubow.js` i `docs/finanse.md` (źródła tam), w tym majątek właścicieli: https://x.com/football_inf0/status/2040082897953300870
