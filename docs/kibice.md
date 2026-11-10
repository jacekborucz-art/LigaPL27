# Kibice: nastroje, protesty i kary za zachowanie na stadionach

Opracowanie: Nov 10, 2026. Moduły: `src/career/fans.js`, `src/career/fansSystem.js`, `src/data/kibice.js`, testy `tests/fans.test.mjs`.

Oznaczenia: **[ŹRÓDŁO n]** to fakt z listy źródeł na końcu, **[SZAC]** to szacunek eksperta albo wartość balansowa gry. Część stron (flashscore.pl, radiokielce.pl) była niedostępna z sieci sesji, więc dla nich korzystałem z fragmentów wyników wyszukiwania. Daty kilku spraw nie są pewne i opisuję je bez roku.

## 1. Kto karze i za co

- **Ekstraklasa:** Komisja Ligi Ekstraklasy SA. Kary finansowe dla klubu, zamknięcie sektora lub trybuny, zakaz wyjazdów zorganizowanych grup kibiców, zakaz wstępu dla osób z danego sektora [ŹRÓDŁO 1, 3, 9, 12].
- **1 Liga, 2 Liga, Puchar Polski:** Komisja Dyscyplinarna PZPN, odwołania do Najwyższej Komisji Odwoławczej PZPN. Przykład: Wisła Kraków w 1 Lidze, październik 2025: po meczu z Ruchem KD zamknęła większość stadionu, NKO zawęziła karę do sektorów C i G na 1 mecz i 200 tys. zł kary [ŹRÓDŁO 2].
- **Mecz bez publiczności:** w praktyce częściej decyzja administracyjna wojewody (na wniosek policji) niż kara związkowa. Przykład: Śląsk Wrocław z Lechem Poznań bez publiczności decyzją wojewody dolnośląskiego [ŹRÓDŁO 11]. Kara związkowa „bez kibiców” też się zdarza: Cracovia, 2 mecze bez publiczności i 50 tys. zł za rasistowskie okrzyki i obraźliwe transparenty [ŹRÓDŁO 7].
- **Puchary UEFA:** Organ Kontroli, Etyki i Dyscypliny UEFA (CEDB). Kary w euro, częściowe zamknięcia trybun (często w zawieszeniu), zakazy wyjazdów [ŹRÓDŁO 6, 17, 18].
- **Kary licencyjne** (np. Legia: 250 tys. zł za każdy mecz bez sektora gości, wymóg I.18 Podręcznika Licencyjnego [ŹRÓDŁO 16]) to inna ścieżka. Gra ich nie modeluje.

## 2. Wysokość kar

### 2.1 Przykłady z rzeczywistości

| Sprawa | Kara | Źródło |
|---|---|---|
| Lechia Gdańsk, race w jubileuszowej oprawie | 10 tys. zł | [ŹRÓDŁO 10] |
| Korona Kielce, pirotechnika (mecz z Widzewem) | 25 tys. zł | [ŹRÓDŁO 4] |
| Korona Kielce, wulgarne słowa pod adresem kibiców Radomiaka | 25 tys. zł | [ŹRÓDŁO 4] |
| Lech Poznań, burda na stadionie Widzewa | 20 tys. zł + zakaz wyjazdu na 1 mecz | [ŹRÓDŁO 12] |
| Widzew Łódź, ten sam mecz (zniszczenia) | 30 tys. zł | [ŹRÓDŁO 12] |
| Śląsk Wrocław, mecz z Legią | 40 tys. zł + zakaz wyjazdów na 3 mecze | [ŹRÓDŁO 9] |
| Śląsk Wrocław, mecz z Pogonią (luty 2024) | 50 tys. zł + zakaz wyjazdu na 1 mecz, bez zamknięcia trybun | [ŹRÓDŁO 9] |
| Wisła Kraków, pirotechnika z Lechem | 50 tys. zł + osoby z sektora C bez wstępu na 1 mecz | [ŹRÓDŁO 1] |
| Legia Warszawa, skandaliczny transparent | 50 tys. zł | [ŹRÓDŁO 19] |
| Cracovia, rasizm i obraźliwe transparenty | 50 tys. zł + 2 mecze bez publiczności | [ŹRÓDŁO 7] |
| Cracovia, inna sprawa | 100 tys. zł + zakaz wyjazdów do końca sezonu | [ŹRÓDŁO 7] |
| Wisła Kraków (1 Liga, KD PZPN, X 2025) | 200 tys. zł + sektory C i G zamknięte na 1 mecz | [ŹRÓDŁO 2] |
| Sezon 2007/08, Komisja Ligi | 91 kar, od 1 do 50 tys. zł; najwięcej Wisła 114 tys., ŁKS 85 tys., Widzew 66 tys., Lech 62 tys. | [ŹRÓDŁO 5] |
| Legia, UEFA: mecz z Napoli (race, blokowanie przejść) | 40 tys. EUR | [ŹRÓDŁO 6] |
| Legia, UEFA: Dortmund (gaz pieprzowy wobec stewardów) | 80 tys. EUR, mecz z Realem bez publiczności | [ŹRÓDŁO 6] |
| Legia, UEFA: Aston Villa 2023 | ok. 100 tys. EUR (108 tys. USD) + zakaz wyjazdów na 5 meczów | [ŹRÓDŁO 6] |
| Legia, UEFA: AZ Alkmaar 2023 | wykonanie zawieszonej kary częściowego zamknięcia trybuny północnej | [ŹRÓDŁO 3] |

### 2.2 Widełki w grze (realne złote, przed skalą gospodarki)

Kara = dolna granica + (górna - dolna) x los^1,6 x (0,75 + 0,06 x wielkość klubu). Pirotechnika z przerwaniem meczu (12 % przypadków) x 2,5 [SZAC].

| Incydent | Waga losowania | Ekstraklasa | 1 Liga | 2 Liga | UEFA (EUR) |
|---|---|---|---|---|---|
| Pirotechnika | 58 | 10-60 tys. | 4-25 tys. | 1,5-8 tys. | 10-50 tys. |
| Rzucanie przedmiotów | 14 | 10-50 tys. | 4-20 tys. | 1,5-6 tys. | 10-30 tys. |
| Obraźliwy transparent, przyśpiewki | 12 | 10-50 tys. | 5-20 tys. | 2-8 tys. | 10-40 tys. |
| Burdy, zniszczenia | 8 (x3 w derbach, x1,5 goście) | 30-200 tys. | 10-80 tys. | 5-20 tys. | 40-120 tys. |
| Wtargnięcie na murawę | 5 | 20-100 tys. | 8-40 tys. | 3-12 tys. | 15-40 tys. |
| Rasizm | 3 | 25-100 tys. | 10-50 tys. | 4-15 tys. | 30-80 tys. |

Kwota w grze = realne zł x `FIN.FINE_SCALE ?? FIN.ECON ?? 0,08`. Po kalibracji finansów (`FIN.ECON = 1`) kary są w realnych złotych. Księgowanie: `book(F, klub, data, 'out', 'fines', kwota, opis)`.

### 2.3 Sankcje dodatkowe [SZAC na bazie źródeł]

| Incydent | Kibice gospodarzy | Kibice gości |
|---|---|---|
| Pirotechnika z przerwaniem meczu | sektor zamknięty na 1 mecz domowy | zakaz wyjazdów na 1-2 mecze |
| Przedmioty | 25 %: sektor na 1 mecz | 30 %: zakaz wyjazdów na 1 mecz |
| Transparent | 15 %: sektor na 1 mecz | nie |
| Wtargnięcie | 60 %: sektor na 1-2 mecze | zakaz na 1-2 mecze |
| Rasizm | 20 %: mecz bez publiczności, inaczej 70 %: sektor na 1-2 mecze | zakaz na 1-2 mecze |
| Burdy | 20 %: mecz bez publiczności (wojewoda), inaczej 60 %: sektor na 1-2 mecze | zakaz na 1-5 meczów |

Zamknięty sektor młyna to 8 % + 3 % x siła ultras pojemności (Legia: 23 %, mniej więcej udział Żylety) [SZAC]; w pucharach co najmniej 25 %. Kary krajowe przechodzą na kolejny sezon (tak było z karą dla Ruchu [ŹRÓDŁO 13]), kary UEFA wygasają z końcem sezonu [SZAC].

## 3. Jak często

Zestawienia sum kar za ostatnie sezony nie znalazłem. Jedyne pełne dane sezonowe to raport PZPN za 2007/08: 91 kar Komisji Ligi na 16 klubów, czyli ok. 5,7 kary na klub w sezonie [ŹRÓDŁO 5]. Współczesne pojedyncze sprawy pokazują, że najczęściej karani są kluby z najsilniejszymi grupami: Legia, Wisła Kraków, Lech, Cracovia, Śląsk, Lechia, Widzew, Ruch, Arka.

**Decyzja projektowa:** użytkownik chce kar „rzadkich, ale się zdarzających”. Gra modeluje tylko sprawy warte wiadomości i świadomie zostaje poniżej realnej częstości z 2007/08 (wtedy kary za drobne race były masowe). Cel [SZAC]:

| Liga | Incydenty na klub w sezonie | Uzasadnienie |
|---|---|---|
| Ekstraklasa | ok. 1,5 (Legia, Lech, Wisła, Widzew 3-4,5; Wieczysta 0) | ok. 1/4 częstości z 2007/08, nadal 1 kara na 3-4 tygodnie w całej lidze |
| 1 Liga | ok. 0,5 (Ruch, Arka, Lechia wyżej) | mniejsze grupy, niższe widełki |
| 2 Liga | ok. 0,1-0,2 | kilka spraw w sezonie na całą ligę |
| Mecz bez publiczności | 0,25 na sezon w całej Ekstraklasie | zdarzenie wyjątkowe, jak decyzje wojewodów |

### Prawdopodobieństwo incydentu na mecz

p = 0,024 x liga (EK 1, 1 Liga 0,8, 2 Liga 0,55, PP 0,8, UEFA 1,3) x ultras (0,15 / 0,4 / 0,8 / 1,3 / 1,9) x (0,7 + 0,15 x temperament) x goście 0,45 (w derbach 0,675) x derby (1,3 / 2 / 3 wg intensywności) x hit z wielkim rywalem 1,3 x porażka 1,3 (wysoka 1,6) x (1 + presja/200). Gospodarze z zamkniętym sektorem x 0,4, bez publiczności 0, goście z zakazem 0. Maksimum 0,6 [SZAC].

Przykład: Legia u siebie w zwykłym meczu: 0,024 x 1,9 x 1,45 = 6,6 %; w derbach z Polonią przy porażce ok. 26 %. Sokół Kleczew u siebie: 0,024 x 0,55 x 0,15 x 0,85 = 0,17 %.

## 4. Protesty kibiców w Polsce

### 4.1 Formy (od najłagodniejszej)

1. **Gwizdy, krytyka w sieci, spadek frekwencji.** W małych klubach zwykle na tym się kończy.
2. **Transparenty** wobec trenera, piłkarzy, zarządu. Na Legii transparent z twarzą prezesa Mioduskiego [ŹRÓDŁO 20]; w historii Żylety przyśpiewki przeciwko właścicielowi z czasów ITI [ŹRÓDŁO 21].
3. **Przyśpiewki** przeciwko trenerowi lub zarządowi.
4. **Bojkot dopingu przez część meczu** lub opuszczenie sektora na kilka minut (Ruch Chorzów z Zagłębiem Lubin: kibice opuścili sektor w pierwszej połowie [ŹRÓDŁO 22]).
5. **Bojkot meczów i karnetów.** Legia 2025: grupa Nieznani Sprawcy bojkotowała mecze domowe i karnety od początku sezonu, krytykując politykę transferową i „nieprzejrzyste zarządzanie”. Protest zawieszono Jul 25, 2025 po trzech transferach; kibice napisali, że „brak dopingu, fatalna frekwencja i fatalna sprzedaż karnetów” podziałały na zarząd [ŹRÓDŁO 14].
6. **Spotkanie z zarządem lub właścicielem, wizyta na treningu.** Lechia Gdańsk w 1 Lidze: po drugiej porażce 0:3 z rzędu kibice zrezygnowali z bojkotu, ale umówili się na spotkanie z właścicielem Paolo Urferem [ŹRÓDŁO 15].
7. **Żądanie zwolnienia trenera** (oświadczenie stowarzyszenia, transparent).
8. **Protest przeciwko zarządowi i właścicielowi** („Zarząd won”, demonstracje pod siedzibą klubu).

### 4.2 Wyzwalacze

Wyniki poniżej oczekiwań (oczekiwania biorą się z renomy, nie tylko z siły kadry), porażki w derbach, kompromitacje w Pucharze Polski z niższą ligą, zagrożenie spadkiem, sprzedaż ulubieńców i brak transferów (Legia 2025 [ŹRÓDŁO 14]), decyzje właściciela, ceny biletów. Gra nie ma polityki cen biletów, więc ten wyzwalacz pominięto.

### 4.3 Zależność od wielkości klubu

Wielki klub z silnym młynem (Legia, Lech, Wisła, Widzew, Ruch, Lechia) przechodzi drabinę szybko i głośno: bojkot realnie obniża wpływy z biletów, a zarząd odczuwa presję [ŹRÓDŁO 14]. Klub z małą bazą kibiców (Termalica, Puszcza, Wieczysta, większość 2 Ligi) reaguje cicho: spada frekwencja, kilku kibiców narzeka. Zwolnienia trenerów w Polsce są częste (zdarzało się, że wszystkie kluby z dolnej połowy tabeli Ekstraklasy zmieniły trenera [ŹRÓDŁO 23]), ale źródła rzadko wskazują kibiców jako bezpośrednią przyczynę. Dlatego w grze presja kibiców działa przez zaufanie zarządu, a decyzję o zwolnieniu podejmuje zarząd (src/career/board.js).

## 5. Model w grze

### 5.1 Profil kibiców (`src/data/kibice.js`)

Dla każdego z 54 klubów: `size` 1-5 (baza kibiców), `ultras` 1-5 (siła i organizacja młyna), `temper` 1-5 (skłonność do incydentów), opcjonalnie `stand` (Żyleta, sektor C, tylko gdy potwierdzone w źródłach). Rywalizacje: lista par z intensywnością 1-3 (Święta Wojna, derby Trójmiasta, Łodzi, Wielkie Derby Śląska po 3). Pozostałe derby lokalne z regionu w clubs_pl.js mają intensywność 1. Rezerwy nie mają derbów. Klub spoza listy (np. beniaminek z III ligi) dostaje profil z prestiżu.

Wartości pochodne [SZAC]:

| Wartość | Wzór | Legia (5,5) | Klub średni (3,3) | Sokół Kleczew (1,1) |
|---|---|---|---|---|
| wrażliwość `sens` | 0,4 + 0,07 x (size + ultras) | 1,10 | 0,82 | 0,54 |
| najwyższy szczebel | 0,5 + 0,75 x (size + ultras) | 8 (protest przeciw zarządowi) | 5 (bojkot) | 2 (transparent) |
| skala progów 1-2 | 0,55 + 0,05 x (size + ultras), min 0,65 | 1 | 0,85 | 0,65 |
| wpływ na zarząd | 0,5 + 0,08 x (size + ultras) | 1,3 | 0,98 | 0,66 |
| tolerancja w tabeli | 1 / 2 / 3 miejsca | 1 | 2 | 3 |
| dodatek renomy do oczekiwań | (prestiż - 6) x 0,05 pkt na mecz | +0,2 | 0 | -0,2 |

### 5.2 Presja (heat 0-100) i nastrój

- Po meczu: oczekiwane punkty = 1,35 + 0,6 x (L - L rywala ± 0,3 za boisko), w przedziale 0,3-2,6, plus dodatek renomy. Różnica s = punkty - oczekiwania; derby ± 0,6 x intensywność; porażka 3 bramkami - 0,5; odpadnięcie z PP lub UEFA - 0,3, a z rywalem z niższej ligi - 0,8 za każdą ligę różnicy.
- s < 0: heat += 5,5 x |s| x sens. s ≥ 0: heat -= max(5 x s, 3 przy wygranej). Potem heat x 0,92 (zapominanie).
- Co miesiąc: miejsce w tabeli wobec oczekiwanego (średnia rankingu siły L i rankingu prestiżu w lidze) minus tolerancja: heat += do 6 x 0,8 x sens, a strefa spadkowa wbrew oczekiwaniom daje + 3 x sens. Lepsze miejsce chłodzi.
- Odejście jednej z 3 gwiazd klubu gracza: heat + 7 x sens, wiadomość w mediach.
- Nowy sezon: heat x 0,5. Zmiana pracy trenera: heat x 0,4 w obu klubach.
- Nastrój: klub gracza używa `game.board.fansMood` (studio meczowe zmienia go po meczach na żywo). Moduł kibiców przesuwa go co miesiąc o 20 % w stronę 62 - 0,5 x heat i zmienia przy protestach. Klub AI ma własny nastrój.

### 5.3 Drabina protestów

| Szczebel | Próg heat | Zaufanie zarządu (x wpływ) | Nastrój | Morale kadry | Frekwencja, gdy trwa | Kategoria |
|---|---|---|---|---|---|---|
| 1 Pomruki | 22 (x skala) | 0 | -1 | 0 | -1 % | media |
| 2 Transparenty | 34 (x skala) | -1 | -1 | -0,3 | -2 % | media |
| 3 Przyśpiewki | 44 | -1 | -2 | -0,5 | -3 % | media |
| 4 Bojkot 15 minut | 54 | -1 | -2 | -0,5 | -4 % | klub |
| 5 Bojkot meczów | 64 | -2 | -3 | -0,8 | -5,5 % x ultras (Legia -27,5 %) | klub |
| 6 Spotkanie z zarządem | 72 | -1 | +1 | -0,5 | jak bojkot | klub, ważne |
| 7 Żądanie zwolnienia | 80 | -3 | -2 | -1 | jak bojkot | klub, ważne |
| 8 Protest przeciw zarządowi | 88, po min. 28 dniach kryzysu | -1 | -3 | -0,5 | bojkot i -6 % | klub, ważne |

Zasady: najwyżej jeden szczebel w górę na mecz lub ocenę miesięczną, i tylko po złym wyniku; spadek szczebla, gdy heat < próg - 12 (histereza); ten sam szczebel w wiadomościach najwyżej raz na 45 dni. Po kryzysie co najmniej na szczeblu 3 klub gracza dostaje wiadomość „Kibice zawieszają protest” i +3 nastroju. Klub AI przy żądaniu zwolnienia w 45 % przypadków zmienia trenera (heat x 0,3) [SZAC]; to tylko wpis w dzienniku, gra nie modeluje trenerów AI.

Kary dla klubu gracza: zaufanie zarządu -2 przy sankcji dodatkowej lub karze od 50 tys. zł, -4 przy meczu bez publiczności.

### 5.4 Frekwencja (`attendanceModifier`)

Mnożnik = (1 + (nastrój - 58) x 0,004, w zakresie -10 % do +8 %) x protest x (1 - zamknięty udział) x zakaz wyjazdów gości (1 - (3 % + 1 % x wielkość klubu gości), x 2 w wielkich derbach). Mecz bez publiczności daje 0. Sparingi i mecze na neutralnym stadionie: tylko nastrój. W symulacji sezonu średnia wyniosła 0,984 (5. percentyl 0,87, 95. percentyl 1,06), czyli ok. -1,6 % przychodów z biletów w skali ligi.

## 6. Przykład: ta sama zła seria w Legii i w małym klubie 2 Ligi

Seria 10 meczów (wyniki z perspektywy klubu): 0:2, 1:1, 0:1, 0:3, 1:2, 2:2, 0:1, 1:3, 0:2, 1:0, rywale o podobnej sile (`node` na fans.js, bez oceny miesięcznej).

**Legia Warszawa** (size 5, ultras 5):

| Mecz | Wynik | Presja | Szczebel | Zaufanie | Nastrój | Frekwencja | Wiadomość |
|---|---|---|---|---|---|---|---|
| 1 | 0:2 | 16 | spokój | 60 | 55 | 0,99 | |
| 3 | 0:1 | 31 | pomruki | 60 | 54 | 0,97 | Gwizdy po końcowym gwizdku |
| 4 | 0:3 | 49 | transparenty | 59 | 53 | 0,96 | Transparenty przeciwko trenerowi |
| 5 | 1:2 | 61 | przyśpiewki | 56 | 50 | 0,94 | Przyśpiewki przeciwko trenerowi |
| 6 | 2:2 | 59 | bojkot 15 min | 55 | 47 | 0,92 | Kibice zapowiadają 15 minut ciszy |
| 7 | 0:1 | 69 | bojkot | 52 | 43 | 0,68 | Bojkot meczów |
| 8 | 1:3 | 81 | spotkanie | 51 | 44 | 0,68 | Kibice rozmawiali z zarządem i piłkarzami |
| 9 | 0:2 | 90 | żądanie zwolnienia | 45 | 41 | 0,52* | Kibice żądają zmiany trenera |
| 10 | 1:0 | 76 | żądanie zwolnienia | 45 | 41 | 0,52* | (wygrana nie eskaluje, presja spada) |

\* w tej serii doszła kara: zamknięta Żyleta na kolejny mecz domowy.

**Sokół Kleczew** (size 1, ultras 1): presja rośnie do 16 dopiero po 9. meczu, jedna wiadomość „Na trybunach coraz luźniej” (pomruki, frekwencja -1 %), zaufanie zarządu bez zmian, a po wygranej w 10. meczu presja spada do 6. Najwyższy możliwy szczebel to transparent na płocie.

## 7. Statystyki symulacji AI (8 sezonów 2026/27, ziarna 1-8, klub gracza Raków, mecze gracza w trybie szybkim)

| Liga | Incydenty na klub | Zamknięte sektory w lidze | Mecze bez publiczności w lidze | Zakazy wyjazdów w lidze | Protesty (wiadomości) na klub | Zmiany trenera AI po presji kibiców w lidze |
|---|---|---|---|---|---|---|
| Ekstraklasa | 1,65 | 4,75 | 0,25 | 3,0 | 2,85 | 0,63 |
| 1 Liga | 0,55 | 1,75 | 0,13 | 0,5 | 1,63 | 0 |
| 2 Liga | 0,13 | 0,5 | 0 | 0,25 | 0,76 | 0 |

Kluby (średnio na sezon): Lech 4,25 incydentu i 171 tys. zł kar (z UEFA), Wisła Kraków 3,5, Widzew 3,1, Legia 2,9 (118 tys. zł), Ruch 2,9, Górnik 2,4, Śląsk 2,25, Raków 0,9, Wieczysta 0, Warta 0, Sokół Kleczew 0,13. Najwyższe szczeble: protest przeciw zarządowi tylko w Lechu i Wiśle (po 1 raz na 8 sezonów), bojkoty w Legii, Lechu, Widzewie, Jagiellonii, Lechii; w 2 Lidze najczęściej pomruki i transparenty. Czas symulacji sezonu bez zmian (ok. 2-3 s). Trzy sezony z rotacją lig: bez błędów, 3 mecze bez publiczności w 3 sezonach w całej piramidzie.

Wpływ na klub gracza (ziarno 3): Legia kończy sezon z zaufaniem 66 zamiast 69 bez modułu kibiców, Sokół Kleczew 99 i 99.

## 8. Źródła

1. Radio Kraków, kara finansowa dla Wisły Kraków (50 tys. zł, sektor C): https://www.radiokrakow.pl/aktualnosci/sport/kara-finansowa-dla-wisly-krakow/
2. Soccerway, NKO PZPN uznała odwołanie Wisły (KD PZPN Oct 10, 2025, sektory C i G, 200 tys. zł): https://pl.soccerway.com/wiadomosci/pi-ka-nozna-betclic-1-liga-najwyzsza-komisja-odwo-awcza-pzpn-uzna-a-odwo-anie-wis-y-wiecej-fanow-obejrzy-mecz-ze-stala/6ep68tz8 oraz https://pl.soccerway.com/wiadomosci/pi-ka-nozna-betclic-1-liga-stadion-wis-y-zamkniety-postepowanie-dyscyplinarne-wobec-krolewskiego/WhSmZ4n9
3. UEFA CEDB, Legia Warszawa vs AZ Alkmaar: https://www.uefa.com/news-media/news/0288-19bb75e4cff4-bc858f54473b-1000--cedb-legia-warszawa-vs-az-alkmaar/ ; Soccerway, UEFA zamyka Żyletę: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-liga-konferencji-europy-zyleta-zakpi-a-z-uefa-wiec-uefa-zamyka-zylete-na-dok-adke-kolejna-kara-finansowa/O4ezKl7F
4. Radio Kielce, Komisja Ligi ukarała Koronę i jej kibiców: https://radiokielce.pl/1290504/komisja-ligi-ukarala-zarowno-korone-jak-i-jej-kibicow
5. PZPN, raport sezonu 2007/2008: https://www.pzpn.pl/public/system/files/site_content/635/161-Sezon%202007-2008.pdf
6. Fox Sports, Legia: kara i zakaz wyjazdów po Aston Villi: https://foxsports.com/articles/soccer/legia-warsaw-gets-108000-fine-and-5game-away-fans-ban-in-europe-for-violence-at-aston-villa ; ESPN: https://africa.espn.com/football/story/_/id/39105070/legia-warsaw-fans-banned-next-five-european-away-games ; theScore, Dortmund: https://www.thescore.com/bund/news/1102556
7. Radio Kraków, surowe kary dla Cracovii: https://www.radiokrakow.pl/aktualnosci/sport/surowe-kary-dla-cracovii/ ; RMF24, Cracovia nie zgadza się z karą: https://www.rmf24.pl/fakty/news-cracovia-nie-zgadza-sie-z-kara,nId,85763
8. Radio Kraków, derby gorące też na trybunach: https://www.radiokrakow.pl/aktualnosci/sport/derby-gorace-tez-na-trybunach-beda-konsekwencje
9. Meczyki, Śląsk poznał karę za mecz z Pogonią: https://www.meczyki.pl/newsy/pilka-nozna/blyskawiczna-decyzja-komisji-ligi-slask-wroclaw-poznal-kare-za-mecz-z-pogonia/232707 ; wroclaw.pl: https://www.wroclaw.pl/sport/slask-wroclaw-ukarany-po-meczu-z-pogonia-szczecin
10. Trojmiasto.pl, 10 tys. zł za race w oprawie Lechii: https://www.trojmiasto.pl/sport/10-tys-zl-za-race-w-jubileuszowej-oprawie-Lechia-Gdansk-n93758.html
11. wroclaw.pl, Śląsk z Lechem bez udziału publiczności: https://www.wroclaw.pl/sport/sobotni-mecz-slask-wroclaw-lech-poznan-bez-udzialu-publicznosci
12. Meczyki, kary za burdę na stadionie Widzewa: https://www.meczyki.pl/newsy/pilka-nozna/komisja-ligi-wlepila-kary-za-burde-na-stadionie-widzewa-lodz-beniaminek-zaplaci-wiecej-niz-lech-poznan/208517
13. Meczyki, kary po oskarżeniu kibiców Ruchu o rasizm: https://www.meczyki.pl/newsy/pilka-nozna/pilkarz-stali-oskarzyl-kibicow-ruchu-o-rasizm-ekstraklasa-poinformowala-o-karach/220347
14. Meczyki, kibice Legii zawieszają protest: https://www.meczyki.pl/newsy/pilka-nozna/nagly-zwrot-akcji-w-legii-kibice-wydali-oswiadczenie/276287 ; Soccerway: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-liga-europy-pi-karze-legii-beda-mogli-liczyc-na-wsparcie-w-rewanzu-z-banikiem-kibice-zawieszaja-protest/4hJ7B1CE
15. Flashscore, w Lechii wrze, kibice spotkają się z prezesem: https://www.flashscore.pl/wiadomosci/pi-ka-nozna-betclic-1-liga-w-lechii-wrze-kolejna-kompromitacja-na-boisku-kibice-spotkaja-sie-z-prezesem/QHhQJrun/
16. TVP Info, Legia zapłaci za zamknięcie sektora gości: https://www.tvp.info/95845356/legia-warszawa-zaplaci-za-zamkniecie-sektora-gosci-pzpn-reaguje
17. Soccerway, Legia zapłaci za mecz z Betisem, Żyleta z karą w zawieszeniu: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-liga-konferencji-legia-zap-aci-za-mecz-z-betisem-goncalo-feio-i-zyleta-z-karami-w-zawieszeniu-od-uefa/t4zwRUif
18. Soccerway, UEFA ukarała Lecha i Jagiellonię: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-liga-mistrzow-uefa-ukara-a-lecha-i-jagiellonie-za-zachowanie-kibicow-na-arenie-miedzynarodowej/6NAAqw8E
19. RMF24, 50 tys. zł kary dla Legii za skandaliczny transparent: https://www.rmf24.pl/sport/news-50-tysiecy-zlotych-kary-dla-legii-warszawa-za-skandaliczny-t,nId,4322726
20. RMF24, protest kibiców Legii (transparent z twarzą prezesa, data nieznana): https://www.rmf24.pl/fakty/sport/news-gol-debiutanta-i-protest-kibicow-hit-ekstraklasy-dla-legii,nId,3287188
21. Gazeta Prawna, komentarz o Legii (przyśpiewki z czasów ITI): https://www.gazetaprawna.pl/wiadomosci/artykuly/984329,legia-warszawa-polska-pilka-nozna.html
22. RMF24, protesty kibiców na stadionach Ekstraklasy (fragment wyników wyszukiwania; data i przypisanie fragmentu do tego adresu niepewne): https://www.rmf24.pl/fakty/news-ekstraklasa-protesty-kibicow-na-stadionach,nId,338814
23. Soccerway, wszystkie kluby z dolnej połowy tabeli zmieniły trenera: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-wszystkie-kluby-z-dolnej-po-owy-tabeli-pko-bp-ekstraklasy-zmieni-y-trenera/QDTNJ91e
