# Datapack z prawdziwymi danymi: instrukcja dla agentów AI

Ten dokument opisuje, jak zespół trzech agentów AI zbiera prawdziwe dane o klubach, zawodnikach, sztabach i sędziach
i składa z nich datapack, który gra wczyta bez błędów. Dotyczy gry v1.19 Beta, format pliku `v: 4` (gra wczytuje też starsze pliki `v: 1` do `v: 3`).
Stan na Nov 19, 2026.

Pliki:
- `docs/datapack/wzor.json`: złoty wzorzec. Każde pole w poprawnym formacie, plik przechodzi kontrolę bez błędów.
- `tools/check-datapack.mjs`: kontrola pliku tym samym kodem co gra (`node tools/check-datapack.mjs plik.json`).
- `docs/edytor.md`: opis edytora i datapacku od strony gry.

Prompty dla agentów są w rozdziale 8. Rozdziały 1-7 to zasady, do których odwołują się prompty: każdy agent musi
dostać ten dokument w całości.

## 1. Przebieg pracy

1. Właściciel robi plik bazowy. Uruchamia nową karierę (dowolny klub) i od razu, w pierwszym dniu
   (1 lip 2026, przed rozegraniem jakiegokolwiek dnia), otwiera Opcje, Edytor, Datapack, Eksportuj datapack.
   Plik zapisuje jako `baza.json` (na przykład w folderze `Documents\NOWY MANAGER DATAPACK`).
   Plik bazowy zawiera ziarno świata (`seed`) i identyfikatory wszystkich zawodników i sędziów. Bez niego nie da się
   zrobić datapacku, bo zawodników nie można dodać pod dowolnym identyfikatorem.
2. Agent 1 (research) zbiera dane do plików roboczych `research/<id klubu>.json`.
3. Agent 2 (weryfikacja) sprawdza dane, uzupełnia braki wartościami przybliżonymi i oznacza je.
   Tworzy `zweryfikowane/<id klubu>.json` i `duplikaty.md`.
4. Agent 3 (budowa) przenosi dane na identyfikatory z `baza.json`, przelicza oceny na atrybuty 1-20, zapisuje
   `LigaPL27-datapack-<data>.json` i uruchamia kontrolę, aż wynik będzie bez błędów.
5. Właściciel wczytuje plik na ekranie Nowej kariery (Wczytaj datapack) albo w Edytorze (Wczytaj datapack).

## 2. Złote zasady (twarde limity gry)

Złamanie którejkolwiek zasady kończy się tak: gra odrzuca cały plik albo po cichu pomija dane.

1. Plik to czysty JSON w UTF-8: bez komentarzy, bez przecinka po ostatnim elemencie, liczby jako liczby
   (`12`, nie `"12"`), teksty w cudzysłowach prostych `"`. Rozmiar najwyżej 40 MB.
2. Nagłówek: `"type": "ligapl27-datapack"`, `"v": 5`, `"seed"` skopiowany bez zmian z `baza.json`.
3. Identyfikatory klubów, zawodników i sędziów tylko z `baza.json`. Nowych identyfikatorów nie wolno wymyślać,
   z jednym wyjątkiem: sekcja `newPlayers` (identyfikator `ed-<cokolwiek>`, litery, cyfry, `_ . : -`, do 80 znaków).
4. Jeden identyfikator raz w sekcji. Przy powtórzeniu JSON zostawia tylko ostatni wpis, bez ostrzeżenia.
5. Kadra pierwszej drużyny ma od 21 do 32 zawodników. Na starcie każdy klub ma 25 zawodników
   (`<id klubu>-1` ... `<id klubu>-25`) i 7 juniorów w akademii (`<id klubu>-a1` ... `-a7`).
6. Wiek zawodnika na 1 lip 2026: od 15 do 45 lat. Wiek trenera i osób ze sztabu: 18-85. Wiek sędziego: 20-60.
7. Wszystkie atrybuty to liczby całkowite od 1 do 20. Potencjał (`pot`) od 1 do 20, jedno miejsce po przecinku.
8. Kody narodowości, pozycji, stylów i ról tylko ze słowników w rozdziale 4, z dokładną pisownią
   (polskie litery: `ŚO`, `ŚP`).
9. Nieznane pole jest pomijane bez błędu (np. `birthdate` zamiast `birthDate`). Kontrola wypisuje takie pola.
10. Każda prawdziwa osoba występuje w całym pliku najwyżej raz (rozdział 6).
11. Skala ocen jak w grze (rozdział 5): bez zawyżania polskiej piłki.

## 3. Format pliku pole po polu

Wzór całego pliku: `docs/datapack/wzor.json`. Wszystkie pola poza nagłówkiem są opcjonalne: pole pominięte zostaje
w grze bez zmian. Wczytanie pliku do gry zmienia tylko pola, które różnią się od stanu gry.

### 3.1 Nagłówek

| Pole | Wartość |
| --- | --- |
| `type` | zawsze `"ligapl27-datapack"` |
| `v` | zawsze `4` |
| `seed` | liczba z `baza.json`, bez zmian (inne ziarno: gra pominie całą sekcję `players`) |
| `game` | wersja gry, np. `"v1.19 Beta"` (tylko informacja) |
| `created` | data pliku, tekst ISO, np. `"2026-11-19T10:00:00.000Z"` (tylko informacja) |
| `full` | `true` (tylko informacja) |
| `clubs`, `players`, `newPlayers`, `refs` | sekcje, obiekty `{ "identyfikator": { ... } }` |

### 3.2 Kluby (`clubs`)

| Pole | Typ i limit | Uwagi |
| --- | --- | --- |
| `name` | tekst 2-40 znaków | pełna nazwa klubu |
| `short` | 2-5 liter lub cyfr, bez spacji i kropek | skrót na tablicy wyników, np. `LEG` |
| `stadium` | tekst do 60 znaków, `""` = bez nazwy | nazwa stadionu |
| `capacity` | liczba całkowita 500-100000 | pojemność stadionu (miejsca siedzące dopuszczone na mecze ligowe) |
| `balance` | liczba całkowita, zł, od -1000000000 do 10000000000 | saldo klubu |
| `transferBudget` | liczba całkowita, zł, 0-10000000000 | budżet transferowy na sezon |
| `wageBudget` | liczba całkowita, zł, 0-10000000000 | tygodniowy budżet płac (nie roczny i nie miesięczny) |
| `crest` | pomiń | herby dodaje właściciel w Edytorze |
| `rivals` | `{ "id klubu": 0-3 }`, najwyżej 12 | najwięksi rywale: 1 lokalna rywalizacja, 2 duża, 3 wielkie derby, 0 brak rywalizacji (także zamiast derby z regionu); para działa w obie strony, wpisz ją przy obu klubach tą samą wartością |
| `coach` | obiekt, niżej | trener klubu (trener klubu gracza jest pomijany, to gracz) |
| `owner` | obiekt, niżej | właściciel lub prezes decydujący o klubie |
| `staff` | obiekt, niżej | sztab |

Finanse wpisuj tylko przy klubach, które mają je w `baza.json` (klub bez finansów w grze dostaje tylko nazwy).
Skalę bierz z bazy: budżety klubów tej samej ligi w `baza.json` pokazują, jakie kwoty gra uznaje za typowe.

Trener `coach`:

| Pole | Typ i limit |
| --- | --- |
| `name` | imię i nazwisko, 2-40 znaków |
| `age` | 18-85 |
| `style` | `"O"` ofensywny, `"S"` ostrożny, `"P"` pragmatyczny |
| `a` | `{ "TAK", "SKL", "MOT", "TRE", "PRE" }`, każdy 1-20 |

Atrybuty trenera: `TAK` taktyka w meczu, `SKL` dobór składu i planu, `MOT` motywacja, `TRE` metodyka treningu,
`PRE` wielkie mecze (presja).

Właściciel `owner`: `name` (2-40 znaków) i cechy 1-20: `cierpliwosc` (cierpliwość wobec trenera), `ambicja`,
`temperament` (impulsywność decyzji), `media` (wrażliwość na media), `zasobnosc` (pieniądze, które może dołożyć).
Typ właściciela (miasto, prywatny, stowarzyszenie) zostaje z gry.

Sztab `staff`: `{ "rola": [ { "name", "age", "a": { atrybuty roli } }, ... ] }`. Każda osoba ma 3 atrybuty swojej roli (skaut 5),
każdy liczba całkowita 1-20; jakość osoby gra liczy sama jako ich średnią (od niej pensja i pozycja w sztabie).
Pole `q` (sama jakość, pliki v1 i v2) jest dozwolone, ale przy obecnym `a` gra je pomija; bez `a` przesuwa cały profil osoby.

| Rola | Atrybuty `a` (klucz: znaczenie) |
| --- | --- |
| `asystent` | `TAK` analiza taktyczna, `OCE` ocena zawodników, `MOT` praca z zawodnikami |
| `fizyczny` | `OBC` planowanie obciążeń, `REG` regeneracja, `MTR` rozwój motoryki |
| `bramkarze` | `TEC` technika bramkarska, `NOG` gra nogami i na przedpolu, `OCE` ocena bramkarzy |
| `mlodziez` | `ROZ` rozwój młodych, `AKA` praca z akademią, `TAL` wyławianie talentów |
| `analityk` | `RYW` rozpracowanie rywala, `DAN` analiza danych, `WID` analiza wideo |
| `kierownik` | `DOK` dokumenty i terminy, `ORG` organizacja klubu, `LOG` logistyka |
| `fizjoterapeuta` | `LEC` leczenie urazów, `REH` rehabilitacja, `PRF` profilaktyka |
| `skaut` | `DOS` doświadczenie, `OCE` ocena zawodnika, `RYN` wiedza o rynku, `SIE` sieć kontaktów, `CHA` ocena charakteru |

Skaut ma też regiony `reg`: `{ "region": poziom 1-20 }`, najwyżej 3, klucze: `balkany`, `srodkowa`, `skandynawia`,
`iberia`, `zachodnia`, `wschodnia`, `afrykaZach`, `afrykaPln`, `amerykaPd`, `amerykaPln`, `azja`, `bliskiWschod`
(`docs/skauting.md`). Stare klucze skauta (`POT`, `OCU`, `RYN`) gra przelicza tylko w plikach do wersji 4.
Atrybut nieznany w danej roli (np. `REG` u asystenta) odrzuca cały plik. Wpływ każdego atrybutu na grę:
`docs/sztab-atrybuty.md`. Mocne i słabe strony osoby wpisuj z opisu jej pracy (np. trener od przygotowania
motorycznego z wynikami w rozwoju młodych: `MTR` wyżej, `OBC` niżej, jeśli drużyna miała dużo urazów).
Role: `asystent` (asystent trenera), `fizyczny` (trener przygotowania fizycznego), `bramkarze` (trener bramkarzy),
`mlodziez` (trener młodzieży), `analityk` (analityk wideo i danych), `kierownik` (kierownik drużyny),
`fizjoterapeuta`, `skaut`.
Liczba osób w roli musi być taka sama jak w `baza.json` (najwyżej 12): gra podmienia i-tą osobę roli, nadmiar
pomija, a brakujące osoby zostają wylosowane. Prawdziwy sztab ma więcej osób? Wybierz najważniejsze.
Ma mniej? Pozostałe wpisy zostaw z `baza.json` bez zmian.

### 3.3 Zawodnicy (`players`)

Identyfikator z `baza.json`, w tym z sekcji `players`. Pole `club` mówi, w jakim klubie zawodnik jest w bazie.

| Pole | Typ i limit | Uwagi |
| --- | --- | --- |
| `first` | tekst 1-40 znaków | imię (albo przydomek, np. brazylijski) |
| `last` | tekst 1-40 znaków | nazwisko |
| `nat` | kod z rozdziału 4.3 | pierwsze obywatelstwo sportowe (reprezentacja) |
| `pos` | kod z rozdziału 4.1 | pozycja główna |
| `birthDate` | `"RRRR-MM-DD"`, prawdziwa data | wiek 15-45 na 1 lip 2026 |
| `attrs` | obiekt 27 atrybutów, każdy 1-20 | rozdział 4.2, zawsze wszystkie 27 |
| `pot` | 1-20, jedno miejsce po przecinku | potencjał, czyli szczyt możliwości |
| `alt` | `{ "POZ": 0-90 }` | pozycje dodatkowe w procentach (bez `BR` i bez pozycji głównej) |
| `injury` | `null` albo `{ "name", "days" }` | kontuzja: `name` 2-60 znaków, `days` 1-365 |
| `team` | id klubu z `baza.json` albo `null` | zmiana klubu; `null` = wolny zawodnik |
| `club`, `ovr` | tylko do czytania | gra je pomija; możesz zostawić z bazy |

Zasady sekcji:
- Nie dodawaj `team`, gdy zawodnik zostaje w swoim klubie z bazy.
- Przy juniorach z akademii (`-a1` ... `-a7`) nigdy nie dodawaj `team`. Na miejsca akademii tylko juniorzy do 18 lat:
  starszego gra po wczytaniu przeniesie do pierwszej drużyny albo, przy pełnej kadrze, do wolnych.
- Gra najpierw wykonuje wszystkie zwolnienia (`team: null`), a dopiero potem dołączenia, więc zwolnienie i
  transfer do tego samego klubu mieszczą się w jednym pliku. Limit 21-32 jest pilnowany w każdym kroku:
  zmiana ponad limit jest pomijana.
- Kontuzja tylko wtedy, gdy zawodnik naprawdę jest kontuzjowany na 1 lip 2026. `days` to dni do powrotu, licząc
  od 1 lip 2026. Używaj nazw z rozdziału 4.5.

### 3.4 Nowi zawodnicy (`newPlayers`)

Do gry trafiają w każdym świecie, z dowolnym ziarnem. Wymagane pola: `first`, `last`, `nat`, `pos`, `birthDate`,
a do tego zawsze `attrs` (wszystkie 27) i `pot`. Opcjonalne: `alt`, `injury`, `team` (id klubu albo `null`).
Identyfikator `ed-<klub>-<numer>`, np. `ed-legia-1`, unikalny w całym pliku.
Używaj tej sekcji tylko wtedy, gdy prawdziwa kadra klubu ma więcej niż 25 zawodników i zabrakło miejsc
`<id klubu>-1` ... `-25`. Nowi zawodnicy wchodzą do gry po zawodnikach z sekcji `players`, więc liczą się już
po zwolnieniach i transferach.

### 3.5 Sędziowie (`refs`)

Identyfikatory `r1` ... `r136` z `baza.json`. Pula ma cztery listy, których plik nie zmienia:
`r1-r20` Ekstraklasa, `r21-r42` 1 Liga, `r43-r64` 2 Liga, `r65-r136` III liga.
Prawdziwego sędziego wpisuj na miejsce z listy jego ligi.

| Pole | Typ i limit |
| --- | --- |
| `name` | imię i nazwisko, 2-40 znaków |
| `age` | 20-60 (wiek na 1 lip 2026) |
| `a` | tablica dokładnie 7 liczb 1-20, w kolejności: trafność decyzji, ustawianie się, kondycja, konsekwencja, odporność na presję, prowadzenie meczu, współpraca z VAR |
| `e` | doświadczenie 1-20 |
| `s` | surowość 0.7-1.4 (1.0 = przeciętna; więcej kartek = więcej), dwa miejsca po przecinku |

Średni atrybut sędziów listy w grze: Ekstraklasa ok. 14, 1 Liga 12,5, 2 Liga 11, III liga 9,5.

## 4. Słowniki

### 4.1 Pozycje (`pos`, klucze `alt`)

`BR` bramkarz, `ŚO` środkowy obrońca, `BO` boczny obrońca, `WB` wahadłowy, `DP` defensywny pomocnik,
`ŚP` środkowy pomocnik, `OP` ofensywny pomocnik, `BP` boczny pomocnik, `SN` skrzydłowy, `NAP` napastnik.
Strona boiska (lewa, prawa) nie jest częścią datapacku.

Pozycje dodatkowe `alt`: 0-90 % (90 = gra tam prawie jak na swojej pozycji, 60-75 = poprawnie, poniżej 50 = awaryjnie).
Wpisuj tylko pozycje, na których zawodnik naprawdę grał w ostatnich sezonach.

### 4.2 Atrybuty zawodnika (`attrs`, zawsze wszystkie 27)

Techniczne: `POD` podania, `DRY` drybling, `WYK` wykończenie, `DYS` strzał z dystansu, `DOS` dośrodkowania,
`GLO` gra głową, `ODB` odbiór, `TEC` technika, `SFR` stałe fragmenty.
Mentalne: `WIZ` wizja, `UST` ustawianie się, `DEC` decyzje, `OPA` opanowanie, `PRA` pracowitość, `AGR` agresja,
`LID` przywództwo, `RUC` gra bez piłki.
Fizyczne: `SZY` szybkość, `WYT` wytrzymałość, `SIL` siła, `ZWI` zwinność, `SKO` skoczność.
Bramkarskie: `REF` refleks, `CHW` chwytanie, `WYJ` gra na przedpolu, `JNJ` sam na sam, `NOG` gra nogami.

Najważniejsze atrybuty pozycji (tak gra liczy OVR):

| Pozycja | Kluczowe (najwyżej) | Ważne | Mniej ważne |
| --- | --- | --- | --- |
| BR | REF UST JNJ | CHW WYJ OPA DEC NOG | POD TEC |
| ŚO | ODB UST GLO | SIL SKO DEC OPA AGR | DRY DOS SFR WIZ DYS |
| BO | ODB SZY WYT | DOS UST PRA POD | GLO SFR WIZ |
| WB | WYT SZY DOS | PRA ODB DRY POD | GLO SIL UST |
| DP | ODB UST POD | DEC PRA WYT SIL AGR | DRY SZY RUC |
| ŚP | POD DEC TEC | WIZ PRA WYT OPA | GLO SKO SIL |
| OP | WIZ TEC POD | DRY DYS RUC DEC OPA SFR | ODB SIL SKO UST |
| BP | DOS SZY DRY | WYT TEC POD PRA | GLO SIL UST |
| SN | DRY SZY RUC | WYK TEC ZWI OPA | ODB GLO UST |
| NAP | WYK RUC OPA | GLO SIL TEC SZY SKO | ODB WIZ DOS UST |

Zawodnik z pola ma atrybuty bramkarskie 1-6. Bramkarz ma `WYK`, `DRY` i `DOS` najwyżej 8.

### 4.3 Narodowości (`nat`)

Pierwsza reprezentacja zawodnika (seniorska, a gdy jej nie ma, młodzieżowa albo kraj urodzenia).
Tylko te kody (210):

POL Polska; ESP Hiszpania; POR Portugalia; CRO Chorwacja; SRB Serbia; SVN Słowenia; BIH Bośnia i Hercegowina;
MKD Macedonia Północna; MNE Czarnogóra; SVK Słowacja; CZE Czechy; UKR Ukraina; BLR Białoruś; LTU Litwa; LVA Łotwa;
GEO Gruzja; NED Holandia; BEL Belgia; GER Niemcy; AUT Austria; FRA Francja; NGA Nigeria; GHA Ghana; CMR Kamerun;
SEN Senegal; CIV Wybrzeże Kości Słoniowej; BRA Brazylia; ARG Argentyna; COL Kolumbia; SWE Szwecja; NOR Norwegia;
DEN Dania; FIN Finlandia; ISL Islandia; ENG Anglia; SCO Szkocja; WAL Walia; NIR Irlandia Północna; IRL Irlandia;
ITA Włochy; TUR Turcja; GRE Grecja; AZE Azerbejdżan; HUN Węgry; CYP Cypr; ISR Izrael; BUL Bułgaria; ARM Armenia;
SUI Szwajcaria; GIB Gibraltar; KAZ Kazachstan; ROU Rumunia; AND Andora; ALB Albania; FRO Wyspy Owcze; MDA Mołdawia;
KOS Kosowo; EST Estonia; LIE Liechtenstein; MLT Malta; LUX Luksemburg; URU Urugwaj; ECU Ekwador; PAR Paragwaj;
VEN Wenezuela; CHI Chile; PER Peru; MAR Maroko; ALG Algieria; TUN Tunezja; MLI Mali; GUI Gwinea; COD DR Konga;
LBN Liban; JOR Jordania; IRQ Irak; SYR Syria; RUS Rosja; SMR San Marino; AFG Afganistan; AUS Australia; BHR Bahrajn;
BAN Bangladesz; BHU Bhutan; BRU Brunei; CAM Kambodża; CHN Chiny; TPE Chińskie Tajpej; GUM Guam; HKG Hongkong;
IND Indie; IDN Indonezja; IRN Iran; JPN Japonia; KUW Kuwejt; KGZ Kirgistan; LAO Laos; MAC Makau; MAS Malezja;
MDV Malediwy; MNG Mongolia; MYA Mjanma; NEP Nepal; PRK Korea Północna; OMA Oman; PAK Pakistan; PLE Palestyna;
PHI Filipiny; QAT Katar; KSA Arabia Saudyjska; SIN Singapur; KOR Korea Południowa; SRI Sri Lanka; TJK Tadżykistan;
THA Tajlandia; TLS Timor Wschodni; TKM Turkmenistan; UAE Zjednoczone Emiraty Arabskie; UZB Uzbekistan; VIE Wietnam;
YEM Jemen; ANG Angola; BEN Benin; BOT Botswana; BFA Burkina Faso; BDI Burundi; CPV Republika Zielonego Przylądka;
CTA Republika Środkowoafrykańska; CHA Czad; COM Komory; CGO Kongo; DJI Dżibuti; EGY Egipt; EQG Gwinea Równikowa;
ERI Erytrea; SWZ Eswatini; ETH Etiopia; GAB Gabon; GAM Gambia; GNB Gwinea Bissau; KEN Kenia; LES Lesotho;
LBR Liberia; LBY Libia; MAD Madagaskar; MWI Malawi; MTN Mauretania; MRI Mauritius; MOZ Mozambik; NAM Namibia;
NIG Niger; RWA Rwanda; STP Wyspy Świętego Tomasza i Książęca; SEY Seszele; SLE Sierra Leone; SOM Somalia;
RSA Republika Południowej Afryki; SSD Sudan Południowy; SDN Sudan; TAN Tanzania; TOG Togo; UGA Uganda; ZAM Zambia;
ZIM Zimbabwe; AIA Anguilla; ATG Antigua i Barbuda; ARU Aruba; BAH Bahamy; BRB Barbados; BLZ Belize; BER Bermudy;
VGB Brytyjskie Wyspy Dziewicze; CAN Kanada; CAY Kajmany; CRC Kostaryka; CUB Kuba; CUW Curaçao; DMA Dominika;
DOM Dominikana; SLV Salwador; GRN Grenada; GUA Gwatemala; GUY Gujana; HAI Haiti; HON Honduras; JAM Jamajka;
MEX Meksyk; MSR Montserrat; NCA Nikaragua; PAN Panama; PUR Portoryko; SKN Saint Kitts i Nevis; LCA Saint Lucia;
VIN Saint Vincent i Grenadyny; SUR Surinam; TRI Trynidad i Tobago; TCA Turks i Caicos; USA Stany Zjednoczone;
VIR Wyspy Dziewicze Stanów Zjednoczonych; BOL Boliwia; ASA Samoa Amerykańskie; COK Wyspy Cooka; FIJ Fidżi;
NZL Nowa Zelandia; PNG Papua-Nowa Gwinea; SAM Samoa; SOL Wyspy Salomona; TAH Tahiti; TGA Tonga; VAN Vanuatu

Kraju nie ma na liście (np. Kosowo przed uznaniem, Kurdystan)? Wpisz kraj reprezentacji, w której zawodnik może
grać, i dodaj uwagę dla agenta 2.

### 4.4 Trener, właściciel, sztab

Opisane w rozdziale 3.2. Style trenera: `O`, `S`, `P`. Role sztabu: `asystent`, `fizyczny`, `bramkarze`, `mlodziez`,
`analityk`, `kierownik`, `fizjoterapeuta`, `skaut`.

### 4.5 Kontuzje (`injury.name`, zakres dni jak w grze)

Lekkie: stłuczenie (1-5), naciągnięcie mięśnia (5-14), lekkie skręcenie kostki (4-12), wstrząśnienie mózgu (7-10).
Średnie: naderwanie mięśnia dwugłowego (18-35), uraz przywodziciela (15-30), skręcenie kostki z uszkodzeniem więzadła
(20-42), uraz więzadła pobocznego kolana (25-42).
Ciężkie: złamanie kości śródstopia (50-90), zerwanie więzadła krzyżowego (190-270), uraz barku (45-80),
zerwanie ścięgna Achillesa (180-240).
Inna nazwa też zadziała (gra dobierze kategorię po liczbie dni), ale nazwa z listy daje dokładne zachowanie z silnika.

## 5. Skala ocen (realia)

Atrybuty i OVR są w skali gry 1-20, wspólnej dla całej Europy: 18-20 to poziom czołowych lig świata.
Polska piłka nie może wypaść mocniej niż w rzeczywistości. Tak wygląda świat gry na starcie
(OVR = ocena na pozycji, gra liczy ją sama z atrybutów):

| Liga | OVR zawodników kadry (10 % / mediana / 90 % / max) | Mediana OVR pierwszej jedenastki | Najlepszy atrybut zawodnika z jedenastki (mediana / max) | Potencjał (mediana / 90 %) |
| --- | --- | --- | --- | --- |
| Ekstraklasa | 8,6 / 10,7 / 12,7 / 14,5 | 11,8 | 16 / 19 | 11,3 / 13,0 |
| 1 Liga | 7,2 / 9,2 / 10,9 / 13,3 | 10,4 | 15 / 18 | 9,8 / 11,2 |
| 2 Liga | 5,5 / 7,6 / 9,1 / 11,5 | 8,5 | 13 / 16 | 8,1 / 9,7 |
| III liga | 4,5 / 6,5 / 8,2 / 10,0 | 7,6 | 12 / 17 | 7,1 / 8,7 |

Jak dobrać atrybuty zawodnika:
1. Docelowy OVR ustal z roli w drużynie i ligi według tabeli. Lider ligi i gwiazda Ekstraklasy mają 13-14,5,
   podstawowy zawodnik średniego klubu Ekstraklasy 11-12,5, rezerwowy 9,5-11, junior 7-9,5.
   Pomoc [SZAC] dla Ekstraklasy (wartość rynkowa w euro): do 300 tys. OVR 9-10,5, 300 tys.-1 mln 10,5-12,
   1-3 mln 12-13,5, ponad 3 mln 13,5-14,5. Reprezentant Polski grający w Ekstraklasie: zwykle 12,5-14.
2. Atrybuty kluczowe pozycji (rozdział 4.2): OVR +2 do +4. Ważne: OVR +1 do +2. Pozostałe: OVR -1 do +1.
   Mniej ważne: OVR -3 do -1. Bramkarskie u zawodnika z pola: 1-6.
3. Rysy charakterystyczne: szybki skrzydłowy dostaje `SZY` 16-17, wysoki stoper `GLO`/`SKO` 15-16, kapitan `LID` 15+,
   weteran 33+ niższe `SZY` i `WYT`, a wyższe `DEC`, `UST`, `OPA`.
4. Potencjał: do 21 lat OVR +1,5 do +4 (talent reprezentacyjny wyżej), 22-25 lat OVR +0,5 do +1,5,
   26-29 lat OVR +0 do +0,5, od 30 lat równy OVR (może być do 1 niżej).
5. Średnia OVR 16 najlepszych zawodników klubu nie powinna odbiegać od bazy o więcej niż 1,5. Kontrola ostrzega
   o każdym takim klubie: wtedy trzeba to uzasadnić (np. mistrz Polski) albo poprawić skalę.

Trenerzy i atrybuty sztabu (średnia trzech atrybutów osoby): Ekstraklasa zwykle 11-15, 1 Liga 9-13, 2 Liga 8-12, III liga 6-10. 16-18 tylko wybitne,
potwierdzone przypadki. Właściciel: `zasobnosc` 15-20 tylko przy bardzo bogatym właścicielu prywatnym albo
koncernie.

## 6. Duplikaty

1. Jeden człowiek pojawia się w pliku raz. Prawdziwy zawodnik przeniesiony do innego klubu to jeden wpis z `team`,
   a nie dwa wpisy w dwóch klubach.
2. Wypożyczony zawodnik jest w klubie, w którym gra w sezonie 2026/27 (wypożyczającym).
3. Te same imię i nazwisko nie przesądzają o duplikacie: w polskich ligach zdarzają się imiennicy.
   Najpierw porównaj datę urodzenia, potem narodowość, pozycję, wzrost, poprzednie kluby i profil w bazach danych
   (Transfermarkt, 90minut.pl, Łączy Nas Piłka). Inna data urodzenia oznacza dwie osoby.
4. Ta sama data urodzenia i te same imię i nazwisko to ten sam człowiek: zostaje jeden wpis, ten z aktualnego klubu.
5. Gdy nie da się rozstrzygnąć, zawodnik zostaje w pliku, a para trafia do `duplikaty.md` (rozdział 7).
6. Kontrola (`tools/check-datapack.mjs`) wypisuje każdą parę z tym samym imieniem i nazwiskiem w świecie gry po
   wczytaniu, także z zawodnikami wylosowanymi przez grę. Pewne duplikaty (ta sama data) są błędem.

## 7. Pliki robocze

`research/<id klubu>.json` (agent 1) i `zweryfikowane/<id klubu>.json` (agent 2), jeden plik na klub:

```json
{
  "klub": "legia",
  "stanNa": "2026-07-01",
  "zrodla": ["https://...", "https://..."],
  "klubDane": { "name": "Legia Warszawa", "short": "LEG", "stadium": "...", "capacity": 31103 },
  "finanse": { "balance": null, "transferBudget": null, "wageBudget": null, "uwagi": "brak danych" },
  "trener": { "name": "...", "age": 0, "style": "P", "opis": "krótko: styl gry, sukcesy", "zrodla": [] },
  "wlasciciel": { "name": "...", "opis": "kto to, jak zarządza", "zrodla": [] },
  "sztab": { "asystent": [{ "name": "...", "age": 0, "opis": "" }] },
  "zawodnicy": [
    {
      "first": "...", "last": "...", "birthDate": "RRRR-MM-DD", "nat": "POL",
      "pos": "ŚO", "alt": ["DP"], "noga": "prawa", "wzrost": 188,
      "rola": "podstawowy | rezerwowy | junior | wypożyczony do klubu",
      "sezon2025_26": { "liga": "Ekstraklasa", "mecze": 0, "minuty": 0, "gole": 0, "asysty": 0 },
      "wartoscEUR": 0, "reprezentacja": "brak | U21 | seniorska (mecze)",
      "kontuzja": null,
      "pewnosc": { "birthDate": "pewne", "wzrost": "przyblizone" },
      "zrodla": ["https://..."]
    }
  ],
  "sedziowie": [],
  "uwagi": []
}
```

W polu `pewnosc` każda wartość ma ocenę `pewne` (dwa niezależne źródła albo oficjalne źródło klubu, ligi lub
związku), `jedno-zrodlo` albo `przyblizone` (szacunek agenta, z uzasadnieniem w `uwagi`).

`duplikaty.md` (agent 2 i agent 3): tabela z kolumnami identyfikator albo klub, imię i nazwisko, data urodzenia,
narodowość, pozycja, co sprawdzono i werdykt (`ta sama osoba`, `różne osoby`, `nie wiadomo`).

## 8. Prompty dla agentów

Każdy agent dostaje: swój prompt, ten dokument w całości, `docs/datapack/wzor.json` i plik `baza.json`.

### Agent 1: research

```
Jesteś researcherem danych piłkarskich dla gry menedżerskiej LigaPL27. Zbierasz prawdziwe dane o polskich klubach
na start sezonu 2026/27 (stan na 1 lipca 2026; gdy nowszych danych brak, ostatni dostępny stan z datą).

Zakres: kluby z pliku baza.json (sekcja "clubs", identyfikator = klucz). Pracuj klub po klubie, w kolejności
Ekstraklasa, 1 Liga, 2 Liga, III liga. Każdy klub zapisz do research/<id klubu>.json w formacie z rozdziału 7
dokumentu docs/datapack/agenci.md.

Zbierz dla każdego klubu:
1. Pełną nazwę, skrót (2-5 liter), nazwę i pojemność stadionu, największych rywali (z kim kibice mają
   rywalizację, jak silną: derby, klasyki, zgody i konflikty kibiców, ze źródłami).
2. Finanse tylko z wiarygodnych źródeł (sprawozdania, raport Deloitte, media biznesowe). Brak danych: null.
   Nie zgaduj na tym etapie.
3. Trenera pierwszej drużyny: imię i nazwisko, data urodzenia albo wiek, styl gry (ofensywny, ostrożny,
   pragmatyczny) z krótkim uzasadnieniem.
4. Właściciela albo prezesa, który decyduje o klubie: kto to, jak zarządza (cierpliwość wobec trenerów, ambicje,
   zasobność, reakcje na media). Opis faktów, bez liczb.
5. Sztab w rolach: asystent, fizyczny, bramkarze, mlodziez, analityk, kierownik, fizjoterapeuta, skaut.
   Imię i nazwisko i wiek, jeśli dostępne, oraz krótki opis mocnych i słabych stron w pracy (do atrybutów roli
   z rozdziału 3.2, np. fizjoterapeuta znany z szybkich powrotów po zerwanych więzadłach: rehabilitacja).
6. Kadrę pierwszej drużyny: każdy zawodnik z pełną datą urodzenia, narodowością (reprezentacja), pozycją główną
   i dodatkowymi, nogą, wzrostem, rolą w drużynie, statystykami sezonu 2025/26 (liga, mecze, minuty, gole,
   asysty), wartością rynkową w euro, reprezentacją i aktualną kontuzją (rodzaj, przewidywany powrót).
   Wypożyczonych zapisz w klubie, w którym grają w sezonie 2026/27.
7. Przy Ekstraklasie, 1 Lidze i 2 Lidze: sędziów z list PZPN na sezon 2026/27 (imię i nazwisko, wiek, liga,
   staż, kartki na mecz, opinie o pracy z VAR). Zapisz ich w research/sedziowie.json.

Zasady:
- Źródła: oficjalne strony klubów, Ekstraklasa.org, Łączy Nas Piłka (laczynaspilka.pl), 90minut.pl,
  Transfermarkt, PZPN, rzetelne media. Do każdej wartości dopisz źródło. Gdy dwa źródła się różnią, zapisz obie
  wersje w "uwagi".
- Nie wymyślaj danych. Brak wartości: null i wpis w "uwagi". Szacunki zostaw agentowi 2.
- Daty zawsze RRRR-MM-DD. Pozycje kodami: BR, ŚO, BO, WB, DP, ŚP, OP, BP, SN, NAP.
  Narodowość kodami z rozdziału 4.3.
- Unikaj duplikatów: jeden człowiek w jednym klubie. Ten sam zawodnik na dwóch listach (np. transfer
  latem 2026) idzie do nowego klubu z uwagą "transfer z <klub>". Imiennik w innym klubie: sprawdź datę urodzenia.
  Gdy nie masz pewności, zostaw oba wpisy i dodaj parę do listy "mozliweDuplikaty" na końcu raportu.
- Nie oceniaj umiejętności liczbami 1-20: to robi agent 3.

Na koniec napisz krótki raport: kluby gotowe, kluby z brakami (czego brakuje), lista możliwych duplikatów
(imię i nazwisko, kluby, daty urodzenia, co sprawdziłeś).
```

### Agent 2: weryfikacja

```
Jesteś weryfikatorem danych piłkarskich dla gry LigaPL27. Dostajesz pliki research/<id klubu>.json od agenta 1.
Twoje zadanie: sprawdzić poprawność, uzupełnić braki i oznaczyć pewność. Wynik zapisujesz do
zweryfikowane/<id klubu>.json (ten sam format, rozdział 7 docs/datapack/agenci.md) i duplikaty.md.

Dla każdego klubu:
1. Sprawdź losowo co najmniej 5 zawodników i wszystkich z "jedno-zrodlo" w drugim, niezależnym źródle: data
   urodzenia, narodowość, pozycja, klub na 1 lipca 2026. Poprawki opisz w "uwagi".
2. Kompletność: każdy zawodnik ma first, last, birthDate, nat, pos i rolę. Kadra ma co najmniej 21 zawodników
   (gdy prawdziwa kadra jest mniejsza, wpisz to w "uwagi": agent 3 zostawi brakujące miejsca graczom gry).
   Więcej niż 32 zawodników: zaznacz 32 najważniejszych (gra nie przyjmie więcej).
   Co najmniej 2 bramkarzy.
3. Braki uzupełnij wartością przybliżoną i oznacz "przyblizone" z uzasadnieniem:
   - brak dnia i miesiąca urodzenia: znany rok, data RRRR-07-01;
   - brak roku: wiek z opisu, a gdy go nie ma, typowy wiek roli (junior 18, rezerwowy 24, podstawowy 27);
   - brak wartości rynkowej: porównanie z zawodnikami tej samej ligi i roli;
   - brak wieku trenera lub osoby ze sztabu: szacunek z kariery (np. koniec kariery piłkarskiej + lata pracy);
   - brak finansów: rząd wielkości z klubów tej samej ligi o podobnej frekwencji, oznaczony "przyblizone".
   Nigdy nie zostawiaj null w first, last, birthDate, nat ani pos.
4. Kody: nat tylko z listy 4.3, pos tylko z 4.1, styl trenera O, S albo P, role sztabu tylko z 3.2.
   Kraj spoza listy: najbliższa dopuszczalna reprezentacja i uwaga.
5. Realia: wiek zawodnika 15-45 na 1 lipca 2026, trener i sztab 18-85, sędzia 20-60. Pojemność stadionu
   500-100000. Kontuzja tylko aktualna na 1 lipca 2026, z liczbą dni do powrotu 1-365.
6. Duplikaty w całym zbiorze, nie tylko w klubie. Porównaj imię i nazwisko bez polskich znaków i wielkości
   liter. Dla każdej pary sprawdź datę urodzenia, narodowość, pozycję, wzrost, poprzednie kluby i profil
   w Transfermarkt albo 90minut.pl. Ta sama data i te same imię i nazwisko: ta sama osoba, zostaje wpis
   z aktualnego klubu. Inna data: różne osoby. Gdy się nie da rozstrzygnąć: oba wpisy zostają,
   para trafia do duplikaty.md z werdyktem "nie wiadomo".

Na koniec raport: liczba zawodników sprawdzonych i poprawionych, lista wartości przybliżonych na klub,
kluby z kadrą poniżej 21 lub powyżej 32, pełna tabela z duplikaty.md.
```

### Agent 3: budowa datapacku

```
Jesteś budowniczym datapacku gry LigaPL27 (format v4). Dostajesz baza.json (pełny eksport z gry), pliki
zweryfikowane/<id klubu>.json, duplikaty.md, docs/datapack/agenci.md i złoty wzorzec docs/datapack/wzor.json.
Wynik: jeden plik LigaPL27-datapack-<RRRR-MM-DD>.json (tylko litery ASCII w nazwie), który gra wczyta bez błędów.

Zasady bezwzględne (rozdział 2 dokumentu):
- Zacznij od kopii nagłówka baza.json: type "ligapl27-datapack", v 4, ten sam seed. Format pól 1:1 jak w wzor.json.
- Tylko identyfikatory z baza.json. Nowe tylko w newPlayers (ed-<klub>-<numer>).
- Każdy identyfikator raz w sekcji. Każdy człowiek raz w całym pliku.
- Atrybuty całkowite 1-20, wszystkie 27 przy każdym zawodniku, którego zmieniasz. pot 1-20 z jednym miejscem
  po przecinku. Liczby jako liczby, nie teksty.
- Kadra klubu po wczytaniu: 21-32 zawodników.

Krok po kroku dla każdego klubu:
1. Weź z baza.json zawodników, których "club" to nazwa tego klubu i których identyfikator to <id klubu>-<numer>
   (miejsca w kadrze, na starcie 1-25), oraz juniorów <id klubu>-a1 ... -a7 (akademia).
2. Przypisz prawdziwych zawodników do miejsc w kadrze, najlepiej miejsce o tej samej pozycji w bazie (pozycję
   i tak ustawiasz polem pos). Juniorzy klubu do 18 lat mogą zająć miejsca akademii (bez pola team).
3. Wpis zawodnika: first, last, nat, pos, birthDate, attrs (27), pot, opcjonalnie alt, injury. Pola club i ovr
   możesz pominąć.
4. Prawdziwa kadra ma mniej niż 25 zawodników: niewykorzystane miejsca dostają "team": null (odejście do wolnych),
   ale kadra nie może spaść poniżej 21. Brakuje do 21: zostaw tyle miejsc bez zmian (gracze wylosowani przez grę).
5. Prawdziwa kadra ma więcej niż 25 zawodników: dodatkowi idą do newPlayers z "team": "<id klubu>", w sumie
   najwyżej 32 w kadrze.
6. Transfer zawodnika, który w bazie jest w innym klubie, a w rzeczywistości gra tutaj: jego wpis w players
   z "team": "<id klubu>" i jego prawdziwymi danymi. Nie twórz drugiego wpisu.
7. Trener, właściciel i sztab: liczby 1-20 według rozdziału 5 i opisów z researchu. Liczba osób w każdej roli
   sztabu dokładnie jak w baza.json. Każda osoba sztabu: "a" z 3 atrybutami swojej roli (tabela w rozdziale 3.2),
   bez pola "q" (jakość gra policzy sama).
8. Klub: name, short, stadium, capacity, rivals (prawdziwe rywalizacje kibiców, intensywność z historii i
   incydentów; ta sama wartość przy obu klubach pary). Finanse tylko przy klubach, które mają je w baza.json,
   wageBudget jako budżet tygodniowy w złotych. Kwoty w skali klubów tej samej ligi z baza.json.
9. Sędziowie: prawdziwi sędziowie na miejsca list ich ligi (r1-r20 Ekstraklasa, r21-r42 1 Liga, r43-r64 2 Liga,
   r65-r136 III liga). Atrybuty: 7 liczb w kolejności z rozdziału 3.5, e, s 0.7-1.4.

Oceny zawodników (rozdział 5): najpierw docelowy OVR z ligi, roli i wartości rynkowej, potem atrybuty z tabeli
pozycji (kluczowe OVR +2 do +4, ważne +1 do +2, pozostałe -1 do +1, mniej ważne -3 do -1, bramkarskie u zawodnika
z pola 1-6). Nie zawyżaj: w Ekstraklasie OVR powyżej 14,5 nie występuje, w 1 Lidze powyżej 13,3, w 2 Lidze
powyżej 11,5, w III lidze powyżej 10. Wartości "przyblizone" z weryfikacji traktuj ostrożnie: bliżej mediany ligi.

Kontrola (obowiązkowa, w repozytorium gry):
  node tools/check-datapack.mjs LigaPL27-datapack-<data>.json --json raport.json
Poprawiaj plik, aż wynik będzie "Plik poprawny: gra go wczyta." i bez błędów. Każde ostrzeżenie wyjaśnij albo
popraw: nieznane pola, klub z różnicą OVR ponad 1,5, zawodnik z oceną za wysoką na ligę, sztab z nadmiarem osób.

Duplikaty: jeśli nie masz pewności, czy dwa wpisy to ta sama osoba, nie usuwaj żadnego. Na koniec pokaż listę
możliwych duplikatów w tabeli: identyfikator, imię i nazwisko, data urodzenia, klub, narodowość, pozycja,
co sprawdziłeś, werdykt. Dołącz pary z duplikaty.md i z sekcji "Możliwe duplikaty" raportu kontroli.

Na koniec raport: nazwa pliku, wynik kontroli, liczba klubów, zawodników, nowych zawodników i sędziów,
kluby z kadrą poniżej 25 (ile miejsc zostało graczom gry), lista wartości przybliżonych użytych w ocenach,
tabela możliwych duplikatów.
```

## 9. Kontrola pliku

```
node tools/check-datapack.mjs <plik.json> [--json raport.json]
```

Kontrola wczytuje plik tak jak gra na ekranie Nowej kariery: świat z ziarna pliku, start 1 lip 2026, a potem
import. Wynik:
- `x` błąd: gra odrzuci plik albo pominie dane (np. zły format pola, nieznany identyfikator, zmiana kadry ponad limit,
  powtórzony identyfikator w JSON, pewny duplikat osoby). Kod wyjścia 1.
- `!` ostrzeżenie: plik się wczyta, ale coś wygląda podejrzanie (nieznane pola, skala ocen, nadmiar osób w sztabie,
  możliwy duplikat).
- `i` informacja: średnie OVR lig po wczytaniu i liczby wczytanych wpisów.
- `?` możliwy duplikat: to samo imię i nazwisko, różne daty urodzenia.

Kontrola obejmuje świat gry na start kariery. Datapack wczytany w Edytorze do trwającej kariery działa tak samo
dla klubów i sędziów, a zawodników zmienia tylko wtedy, gdy kariera ma to samo ziarno.
