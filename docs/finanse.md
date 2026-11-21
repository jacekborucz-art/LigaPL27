# Finanse klubów: realne pensje, przychody i budżety

Stan: Nov 13, 2026. Dotyczy `src/data/finanse_klubow.js`, `src/career/finance.js`, `src/career/prizes.js`, `src/career/sponsors.js`, `marketWage` i `estimateValue` w `src/career/negotiation.js`, `marketValue` w `src/world/playerGen.js`, finansów w `src/season/rollover.js` i `src/career/careerSystem.js`. Narzędzie kalibracji: `node tools/kalibracja-finansow.mjs [ziarna]`.

Cel: pensje i budżety w realnej skali polskich lig (wcześniej ok. 1/6 rzeczywistości), przychody z danych konkretnych klubów, bogaci właściciele i sponsorzy, nagrody UEFA i Pucharu Polski w pełnych kwotach, gospodarka stabilna przez wiele sezonów.

Oznaczenia: **[SZAC]** to szacunek albo założenie balansowe. Liczby bez oznaczenia mają źródło w rozdziale 1. Raporty Grant Thornton (PDF) i strony Ekstraklasy SA nie dały się pobrać z tej sesji (blokada sieci), więc liczby pochodzą z omówień prasowych tych raportów, podanych przy każdej pozycji.

## 1. Źródła

### 1.1 Ekstraklasa 2025/26 (Grant Thornton i Ekstraklasa SA, "Finansowa Ekstraklasa 2025/2026", wrzesień 2026)

| Dane | Wartość | Źródło |
|---|---|---|
| Przychody wszystkich klubów | 1 587 mln zł (rok wcześniej 1 270 mln zł) | https://biznes.pap.pl/wiadomosci/firmy/kluby-ekstraklasy-mialy-w-sezonie-20252026-16-mld-zl-przychodow-celem-na-kolejne |
| Struktura przychodów ligi | komercja 529,7 mln zł, prawa centralne (liga i UEFA) 478 mln zł, dzień meczowy 278 mln zł, sprzedaż zawodników 301 mln zł | jw. oraz https://roosevelta81.pl/raport-grant-thornton-finansowa-ekstraklasa-w-sezonie-2025-2026-dzien-meczowy-pod-wzgledem-frekwencji-gornik-zabrze-ustepuje-tylko-lechowi/ |
| Legia | przychody 290,5 mln zł (202,1 bez transferów), komercja 88,9, dzień meczowy 61,6, wynagrodzenia 115,9 (I drużyna 77,0), pozostałe koszty 124, strata ok. 17 mln zł | https://legionisci.com/news/106369/290-mln-zl-przychodow-236-mln-zl-za-punkt-17-mln-straty, https://www.sportmarketing.pl/finanse/121327/wynagrodzenia-w-pko-bp-ekstraklasie-ile-kluby-wydaja-na-pensje/ |
| Lech | przychody 248,4 mln zł (233,2 bez transferów), dzień meczowy 61,9, wynagrodzenia 78,3 (I drużyna 57,3) | jw., https://x.com/GrantThorntonPL/status/2102327039823098250 |
| Jagiellonia | przychody 169,7 mln zł, w tym 64,9 ze sprzedaży zawodników, wynagrodzenia 50,4 | https://poranny.pl/raport-finansowy-grant-thornton-jagiellonia-bialystok-wskoczyla-na-podium-ekstraklasy-z-rekordowymi-przychodami/ar/c2p2-29375289 |
| Raków | przychody 123,4 mln zł (2024/25: 142,9), wynagrodzenia 68,7 (I drużyna 58,6) | jw., https://pracasport.pl/ekstraklasa-zarabia-127-miliarda-zlotych-legia-bije-rekordy-rakow-krolem-transferow |
| Górnik | przychody ok. 111 mln zł (35,6 z transferów), wynagrodzenia 45,2 (I drużyna 32,4) | https://roosevelta81.pl/raport-grant-thornton-finansowa-ekstraklasa-w-sezonie-2025-26-przychody-gornik-zabrze-przebil-magiczna-bariere/, https://roosevelta81.pl/raport-grant-thornton-wynagrodzenia-gornik-zabrze-liderem-efektywnosci-budzetowej/ |
| Widzew | przychody 67,3 mln zł, wynagrodzenia 83,4 (I drużyna 68,3), 143,6 mln zł podwyższenia kapitału od Roberta Dobrzyckiego | https://lodzkisport.pl/pilka-nozna/widzew-na-kosztownej-sciezce-co-pokazuje-raport-grant-thorntona/WZzOCDlbc7RpPiMFoNcZ |
| Pogoń | wynagrodzenia I drużyny 30,7, dokapitalizowanie 13,1 mln zł, dzień meczowy netto 16,2 | https://gs24.pl/raport-finansowy-grant-thornton-jak-poprzedni-sezon-wygladal-dla-pogoni-szczecin/ar/c2p2-29376151, https://igol.pl/zarobki-pilkarzy-w-ekstraklasie/ |
| Wynagrodzenia I drużyny (pozostałe) | Zagłębie 35,4, GKS Katowice 28,4, Cracovia 25,2, Radomiak 23,4, Piast 22,7, Korona 21,1, Motor 20,8 mln zł (tabela igol.pl za GT, s. 21; część może dotyczyć 2024/25) | https://igol.pl/zarobki-pilkarzy-w-ekstraklasie/ |
| Struktura płac | I drużyna (zawodnicy i sztab) 78 %, administracja 14 %, rezerwy i młodzież 8 % | https://x.com/GrantThorntonPL/status/2102327039823098250 |
| Dzień meczowy na kibica | Legia 112 zł, Lech 78 zł, Widzew 71 zł | https://roosevelta81.pl/raport-grant-thornton-finansowa-ekstraklasa-w-sezonie-2025-2026-dzien-meczowy-pod-wzgledem-frekwencji-gornik-zabrze-ustepuje-tylko-lechowi/, https://expressilustrowany.pl/juz-wiadomo-ile-widzew-zarobil-na-tzw-dniu-meczowym/ar/c2p2-29383633 |
| Wskaźnik płac | limit 80 % przychodów w 2024/25, docelowo 70 %; Radomiak 93 % (2024/25) | https://thesport.pl/feeds/ekstraklasa-bije-rekordy-finansowe-w-kasach-jest-coraz-wiecej-pieniedzy/, https://www.radom24.pl/sport/raport-finansowy-klubow-pko-bp-ekstraklasy-jak-wypada-radomiak-59327 |
| Budżety przedsezonowe 2025/26 | Legia 218, Lech 176, Raków 85, Widzew 79,6, Pogoń 63, Zagłębie 56, Jagiellonia 55, Górnik 41, Motor 36, Piast 35, Korona 34, Cracovia 32, Arka 30, Radomiak 28, GKS Katowice 26, Termalica 24 mln zł | https://x.com/football_inf0/status/1954796809433321903, https://sport1.pl/budzety-klubow-ekstraklasy-kto-najbogatszy-w-sezonie-2025-2026 |
| Korona 2024/25 | przychody 33,9 mln zł | https://www.korona-kielce.pl/w/w-sezonie-2024/25-zanotowali%C5%9Bmy-33-9-mln-z%C5%82otych-og%C3%B3lnego-przychodu- |

### 1.2 Centralny podział Ekstraklasy i prawa TV

| Dane | Wartość | Źródło |
|---|---|---|
| Wypłaty Ekstraklasy SA za 2025/26 | 301 125 761 zł dla 18 klubów, lista kwot klubów (Lech na szczycie) | https://wzabrzu.info/ekstraklasa-podzielila-ponad-301-mln-zl-gornik-zabrze-z-drugim-najwyzszym-przelewem/, https://xyz.pl/ekstraklasa-wyplacila-klubom-rekordowe-pieniadze-ponad-301-mln-zl-do-podzialu/, https://gol24.pl/ekstraklasa-sa-podzielila-3011-mln-zlotych-pomiedzy-kluby-kto-ile-dostal-lech-na-szczycie-lista/ar/c2-19139911 |
| Struktura podziału | część stała 50 %, wynik sportowy 33,5 %, ranking historyczny 14 %, Młodzieżowiec 2,5 % | https://sportowefakty.wp.pl/pilka-nozna/1262941/rekordowe-pieniadze-ekstraklasa-zatwierdzila-budzet |
| Część stała | 8 222 700 zł na klub (148 mln zł) | https://www.90minut.pl/news/341/news3419297-Ekstraklasa-SA-ustalila-podzial-wynagrodzen-dla-klubow-za-sezon-2025-26.html |
| Mistrz (Lech) | 36,8 mln zł: część stała 8,2, wynik sportowy 22,6, ranking historyczny 4,4, Młodzieżowiec 1,69 | https://www.sportmarketing.pl/finanse/114316/kluby-otrzymaly-z-ekstraklasy-ponad-300-mln-zl-za-sezon-2025-2026/ |
| Inne kluby | Górnik 29,7, Jagiellonia 26,5, Raków 21,7, GKS Katowice 18,0, Legia 16,7, Zagłębie 16,04, Piast 12,7 mln zł | https://wzabrzu.info/ekstraklasa-podzielila-ponad-301-mln-zl-gornik-zabrze-z-drugim-najwyzszym-przelewem/ |
| Spadkowicze | dodatkowa rekompensata 1 mln zł | https://www.90minut.pl/news/341/news3419297-Ekstraklasa-SA-ustalila-podzial-wynagrodzen-dla-klubow-za-sezon-2025-26.html |
| 1 Liga 2025/26 (PZPN) | ok. 27 mln zł z praw telewizyjnych i marketingowych, średnio 1,5 mln zł na klub; bez znalezionej premii za miejsce | https://prawosportowe.pl/a/podzial-pieniedzy-dla-klubow-pilkarskich-z-tytulu-praw-marketingowych-i-telewizyjnych-w-sezonie-20252026 |
| Umowa TV 2023/24-2026/27 (Canal+, sublicencja TVP) | ok. 1,3 mld zł za 4 sezony (ok. 325 mln zł rocznie, wyliczenie); przetarg na 2027-31 w toku | https://www.wirtualnemedia.pl/ekstraklasa-transmisje-canal-nowy-kontrakt-jaka-wartosc-warunki-umowy,7169760534394497a, https://www.sportcal.com/media/ekstraklasa-rights-for-2027-31-cycle-out-to-tender/ |

### 1.3 1 Liga 2025/26 (Grant Thornton, "Finansowa pierwsza liga 2025/2026", listopad 2026)

| Dane | Wartość | Źródło |
|---|---|---|
| Przychody klubów | 360,2 mln zł (+25 %), wynagrodzenia ponad 298 mln zł, w 7 klubach płace wyższe niż przychody | https://pzpn.pl/federacja/aktualnosci/2026-11-03/pierwszoligowe-kluby-zamykaja-sezon-z-kolejnym-rekordem-przychodow, https://sportbiznes.info/ponad-360-mln-zl-przychodow-i-rekordowa-frekwencja-pierwsza-liga-pilkarska-z-rekordami/ |
| Ranking | Wisła Kraków 56,0, Wieczysta 49,1, Śląsk 34,4, Ruch 26,4 (5.), ŁKS 21,0 (7.), Polonia Warszawa 11,5 mln zł | https://www.flashscore.pl/wiadomosci/pi-ka-nozna-betclic-1-liga-rekordowe-przychody-klubow-1-ligi-w-sezonie-25-26-wis-a-liderem-slask-na-podium/tSkf80Jt/, https://expressilustrowany.pl/znane-sa-przychody-klubow-pilkarskiej-pierwszej-ligi-ktory-jest-lks/ar/c2p2-29495023 |
| Wskaźnik płac | Polonia Warszawa 164 %, Śląsk 119 % (72 % po podwyższeniu kapitału), najniżej Stal 39 %; Wisła Kraków 37 % (2024/25) | jw., https://xyz.pl/analitycy-grant-thornton-podsumowuja-kluby-1-ligi-wisla-krakow-zdominowala-zaplecze-ekstraklasy/ |

2 Liga nie ma raportu finansowego. Wszystkie jej kwoty są [SZAC].

### 1.4 Pensje zawodników (prasa, bez oficjalnych danych)

| Dane | Wartość | Źródło |
|---|---|---|
| Najlepiej opłacani | ok. 100 tys. EUR miesięcznie (prezes Cracovii Mateusz Dróżdż); Andi Zeqiri (Widzew) ok. 1,2 mln EUR rocznie; szacunki 350-560 tys. zł miesięcznie dla gwiazd Legii, Lecha, Rakowa | https://www.money.pl/gospodarka/ujawnia-zarobki-pilkarzy-w-polsce-30-tysiecy-zlotych-na-zloty-zegarek-7120140851800896a.html, https://igol.pl/zarobki-pilkarzy-w-ekstraklasie/ |
| Średnia pensja Ekstraklasy (prasa) | 28 tys. zł brutto (Forbes, starszy tekst), 40-45 tys. zł (portale, 2024/25) | https://www.forbes.pl/sport/spadaja-zarobki-pilkarzy-w-ekstraklasie/2qps6wf |
| 1 Liga | zwykle 15-25 tys. zł brutto miesięcznie, liderzy 40-60 tys. zł | https://golero.pl/polska/ile-zarabia-pilkarz-w-1-lidze-pensje-premie-i-najwyzsze-kontrakty/ |
| 2 Liga | zwykle 5-10 tys. zł brutto, najlepsi 12-15 tys. zł | https://bankbiznes.pl/ile-zarabia-sie-w-polskiej-ii-lidze-realne-pensje-pilkarzy-i-porownanie-z-innymi-ligami/ |

Uwaga: płace I drużyny z raportu Grant Thornton (koszt pracodawcy z premiami) dają ok. 1 mln zł rocznie na zawodnika, czyli ok. 80-100 tys. zł miesięcznie, więcej niż prasowe "średnie pensje". Gra kalibruje się do raportu, bo pensja w grze obejmuje też premie (gra nie wypłaca ich osobno).

### 1.5 Nagrody

| Dane | Wartość | Źródło |
|---|---|---|
| Liga Mistrzów 2025/26 | faza ligowa 18,62 mln EUR, wygrana 2,1, remis 0,7, 1/8 finału 11, ćwierćfinał 12,5, półfinał 15, finał 18,5 | https://www.beinsports.com/en-us/soccer/uefa-champions-league/articles/uefa-confirms-prize-distribution-for-2025-26-champions-league-2025-08-27 |
| Liga Europy | faza ligowa 4,31 mln EUR, wygrana 0,45, remis 0,15; baraże 0,3, 1/8 finału 1,75, ćwierćfinał 2,5, półfinał 4, finał 7, zdobywca dodatkowo 6 | https://www.footballtransfers.com/en/transfer-news/eu-uefa-europa-league/europa-league-prize-money-2025-26, https://www.footballtransfers.com/en/transfer-news/football-finance/uefa-prize-money/2026/04/europa-conference-league-prize-money-2025-26 |
| Liga Konferencji | faza ligowa 3,17 mln EUR, wygrana 0,4, remis 0,133; baraże 0,2, 1/8 finału 0,8, ćwierćfinał 1,3, półfinał 2,5, finał 4, zdobywca dodatkowo 3 | https://www.footballtransfers.com/en/transfer-news/eu-uefa-conference-league/europa-conference-league-prize-money-2025-26, https://www.footballtransfers.com/en/transfer-news/football-finance/uefa-prize-money/2026/04/europa-conference-league-prize-money-2025-26 |
| Liga Mistrzów, kwoty za etap | faza ligowa 18,62, awans do 1/8 11, do ćwierćfinału 12,5, do półfinału 15, do finału 18,5, zdobywca dodatkowo 6,5 mln EUR (potwierdzone przez właściciela gry, Nov 13, 2026; zgodne z grą) | |
| Wypłaty solidarnościowe UEFA | kluby odpadające w eliminacjach i kluby bez pucharów dostają wypłaty solidarnościowe; w grze 0,26 mln EUR raz w sezonie dla odpadających w eliminacjach, ok. 0,1 mln EUR dla klubu Ekstraklasy bez pucharów [SZAC] | https://www.uefa.com/news-media/news/02a7-212bf41887e6-459c11329667-1000--solidarity-payments-to-non-competing-clubs-strengthening-com/ |
| Eliminacje UEFA | 2024/25: odpadnięcie z LK w Q1 0,15, Q2 0,35, Q3 0,55, PO 0,75 mln EUR; od 2025/26 dodatkowo 175 tys. EUR za każdą rozegraną rundę | https://editorial.uefa.com/resources/028b-1a7880138a24-7a993e2e33d1-1000/20240322_circular_2024_13_en.pdf, https://editorial.uefa.com/resources/029a-1e0b5460b86d-31e6cad26358-1000/20250616_circular_2025_32_en.pdf |
| Puchar Polski 2025/26 | pula 10 mln zł, zdobywca 5 mln zł, finalista 1 mln zł (wcześniej 760 tys.) | https://en.wikipedia.org/wiki/2025%E2%80%9326_Polish_Cup, https://xyz.pl/puchar-polski-do-zmiany-wiecej-pieniedzy-dla-slabszych-i-nowy-system-losowania/ |
| Puchar Polski 2026/27 | kwota łączna (netto) według najdalszej rundy: odpadnięcie w I rundzie 15 tys. zł, w 1/16 45 tys., w 1/8 90 tys., w ćwierćfinale 190 tys., w półfinale 380 tys., finalista 1 mln, zdobywca 5 mln zł | https://xyz.pl/?p=246917, https://gramgrubo.pl/puchar-polski-26-27-nagrody-ile-zarobi-zwyciezca/ |
| Superpuchar Polski 2026 | bez stałej nagrody | |

### 1.6 Frekwencja, stadiony, transfery, właściciele

| Dane | Wartość | Źródło |
|---|---|---|
| Frekwencja Ekstraklasy 2025/26 | 4 154 423 widzów, średnio 13 577; Lech 31 065, Górnik 23 888, Legia 23 490, Widzew 17 243 (96 % zapełnienia), Lechia 15 359 | https://stadiony.net/aktualnosci/2026/06/polska_podsumowanie_frekwencyjne_sezonu_202526_pko_bp_ekstraklasa_z_kolejnymi_rekordami, https://sport1.pl/srednie-frekwencje-w-ekstraklasie-2025-26-lech-zdeklasowal-rywali-jak-widzew-legia-i-pogon |
| Komplety | Arena Zabrze 26 487 (32. kolejka), Arena Katowice 14 279 (21. kolejka) | https://stadiony.net/aktualnosci/2026/05/polska_frekwencja_na_stadionach_ekstraklasy_32_kolejka_sezonu_20252026, https://stadiony.net/aktualnosci/2026/02/polska_frekwencja_na_stadionach_ekstraklasy_21_kolejka_sezonu_20252026 |
| Pojemności pozostałych stadionów | z bazy stadiony.net i Wikipedii według wiedzy autora; nie zostały ponownie sprawdzone w tej sesji (pole `pojemnosc` bez [SZAC] to wartości znane, z [SZAC] to szacunki) | |
| Rekordy transferowe | zakup: Osman Bukari (Widzew) ok. 5 mln EUR (nieoficjalnie), Mileta Rajović (Legia) 3 mln EUR; sprzedaż: Radosław Majecki do Monaco 7 mln EUR (2020) | https://pl.soccerway.com/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-oficjalnie-najdrozszy-pi-karz-ekstraklasy-zaprezentowany-osman-bukari-w-widzewie/nR12umuq, https://pl.soccerway.com/wiadomosci/oficjalnie-transfer-mileta-rajovic-watford-legia-najdrozszy-pilkarz/EyUHPSDU, https://www.parkiet.com/parkiet-plus/art19768861-mlodosc-w-cenie |
| Majątek właścicieli (szacunki) | Robert Platek (Cracovia) 7,4 mld zł, Zbigniew Jakubas (Motor) 5,94 mld zł, Robert Dobrzycki (Widzew) 3,7 mld zł, rodzina Rutkowskich (Lech) 2 mld zł, Alex Haditaghi (Pogoń) 1,7 mld zł, Michał Świerczewski (Raków) 1 mld zł, Dariusz Mioduski (Legia) 0,35-0,45 mld zł, Wojciech Kwiecień (Wieczysta) ok. 0,5 mld zł; Jakubas włożył w Motor ok. 72 mln zł | https://x.com/football_inf0/status/2040082897953300870, https://www.sportmarketing.pl/finanse/112377/coraz-wiecej-pieniedzy-w-ekstraklasie-platek-jakubas-i-dobrzycki-otwieraja-liste-najbogatszych-wlascicieli/, https://xyz.pl/100-mln-zl-na-widzew-w-rok-jak-robert-dobrzycki-buduje-nowa-potege-ekstraklasy/ |

## 2. Dane klubów w grze (`src/data/finanse_klubow.js`)

Kwoty dotyczą ligi klubu w sezonie 2026/27 w grze, w mln zł za sezon. Komercja to sponsorzy i pozostałe przychody komercyjne, płace to I drużyna (zawodnicy i sztab, definicja Grant Thornton), dopłata to regularne pieniądze właściciela albo miasta, skarbiec to kwota, do której bogaty właściciel uzupełnia saldo na start sezonu. Pay to płacowość (rozdz. 3.1). Pełne dane 54 klubów są w pliku; tu Ekstraklasa i przykłady niższych lig.

| Klub | Komercja | Płace I dr. | Stadion | Frekwencja | zł/widza | Sponsor 1-5 | Właściciel | Dopłata | Skarbiec | Pay |
|---|---|---|---|---|---|---|---|---|---|---|
| Legia | 88,9 | 77,0 | 31 103 | 23 490 | 112 | 5 | prywatny (D. Mioduski) | 0 | 0 | 1,75 |
| Lech | 72 [SZAC] | 57,3 | 42 837 | 31 065 | 78 | 5 | rodzina Rutkowskich | 0 | 10 [SZAC] | 1,25 |
| Raków | 38 [SZAC] | 58,6 | 5 500 [SZAC] | 5 000 [SZAC] | 60 [SZAC] | 4 | M. Świerczewski (x-kom) | 32 [SZAC] | 25 [SZAC] | 1,5 |
| Jagiellonia | 26 [SZAC] | 35,4 | 22 372 | 16 000 [SZAC] | 50 [SZAC] | 3 | miasto | 4 [SZAC] | 0 | 1,0 |
| Widzew | 24 [SZAC] | 68,3 | 18 018 | 17 243 | 71 | 4 | R. Dobrzycki | 50 [SZAC] | 45 [SZAC] | 2,2 |
| Pogoń | 22 [SZAC] | 30,7 | 21 163 | 15 000 [SZAC] | 55 [SZAC] | 3 | A. Haditaghi | 13,1 | 15 [SZAC] | 1,05 |
| Wieczysta | 30 [SZAC] | 32 [SZAC] | 5 000 [SZAC] | 3 500 [SZAC] | 45 [SZAC] | 4 | W. Kwiecień | 10 [SZAC] | 20 [SZAC] | 1,1 |
| Górnik | 22 [SZAC] | 32,4 | 26 500 | 23 888 | 50 [SZAC] | 3 | miasto | 4 [SZAC] | 0 | 1,1 |
| Wisła Kraków | 24 [SZAC] | 26 [SZAC] | 33 130 | 22 000 [SZAC] | 50 [SZAC] | 4 | J. Królewski i wspólnicy | 0 | 5 [SZAC] | 0,95 |
| Cracovia | 20 [SZAC] | 25,2 | 15 016 | 9 500 [SZAC] | 45 [SZAC] | 3 | R. Platek | 5 [SZAC] | 20 [SZAC] | 1,0 |
| Piast | 14 [SZAC] | 22,7 | 9 913 | 5 500 [SZAC] | 35 [SZAC] | 2 | miasto | 6 [SZAC] | 0 | 0,9 |
| Śląsk | 24 [SZAC] | 28 [SZAC] | 42 771 | 13 000 [SZAC] | 45 [SZAC] | 3 | miasto | 8 [SZAC] | 0 | 1,15 |
| Zagłębie | 34 [SZAC] | 35,4 | 16 068 | 6 500 [SZAC] | 35 [SZAC] | 5 | KGHM | 8 [SZAC] | 5 [SZAC] | 1,55 |
| Motor | 18 [SZAC] | 20,8 | 15 247 | 12 000 [SZAC] | 45 [SZAC] | 3 | Z. Jakubas | 4 [SZAC] | 15 [SZAC] | 0,9 |
| Korona | 14 [SZAC] | 21,1 | 15 550 | 9 000 [SZAC] | 40 [SZAC] | 2 | miasto | 5 [SZAC] | 0 | 0,95 |
| GKS Katowice | 12 [SZAC] | 28,4 | 15 000 [SZAC] | 11 500 [SZAC] | 45 [SZAC] | 2 | miasto | 10 [SZAC] | 0 | 1,35 |
| Radomiak | 10 [SZAC] | 23,4 | 8 840 [SZAC] | 5 000 [SZAC] | 35 [SZAC] | 2 | prywatny | 7 [SZAC] | 0 | 1,05 |
| Wisła Płock | 16 [SZAC] | 20 [SZAC] | 15 004 | 7 500 [SZAC] | 35 [SZAC] | 4 | miasto (sponsor Orlen) | 5 [SZAC] | 0 | 1,0 |
| Lechia Gdańsk (1 L.) | 15 [SZAC] | 14 [SZAC] | 41 620 | 11 500 [SZAC] | 35 [SZAC] | 3 | prywatny | 3 [SZAC] | 0 | 1,25 |
| ŁKS (1 L.) | 10 [SZAC] | 10 [SZAC] | 18 008 | 6 000 [SZAC] | 30 [SZAC] | 2 | T. Salski | 2 [SZAC] | 0 | 1,25 |
| Polonia Warszawa (1 L.) | 6 [SZAC] | 13 [SZAC] | 7 150 [SZAC] | 3 000 [SZAC] | 30 [SZAC] | 2 | prywatny | 9 [SZAC] | 0 | 1,6 |
| GKS Tychy (2 L.) | 4 [SZAC] | 3,5 [SZAC] | 15 150 | 2 500 [SZAC] | 20 [SZAC] | 2 | miasto | 1,5 [SZAC] | 0 | 1,3 |

Kluby z danymi z 1 Ligi 2025/26, które grają w Ekstraklasie 2026/27 (Wisła Kraków, Wieczysta, Śląsk), mają kwoty przeliczone na Ekstraklasę [SZAC]. Beniaminkowie z III ligi dostają wartości domyślne ligi (`DOMYSLNE` w pliku danych, wszystko [SZAC]).

## 3. Model

### 3.1 Pensje (`marketWage`)

```text
pensja_tyg = 9000 x e^(0,45 x (OVR - 10)) x mnożnik_ligi x płacowość_klubu      (500 do 140 000 zł)
mnożnik_ligi: Ekstraklasa 1, 1 Liga 0,66, 2 Liga 0,38, III liga 0,2; obcokrajowiec w Ekstraklasie i oferta z zagranicy 1,5
```

Płacowość (`pay`) dobiera `tools/kalibracja-finansow.mjs`: na 6 wygenerowanych światach liczy rachunek płac kadry przy płacowości 1 i dzieli przez cel = 85 % płac I drużyny z danych (reszta to sztab, w kosztach klubu). Mediana płacowości w każdej lidze wynosi ok. 1, więc mnożnik ligi odpowiada przeciętnemu klubowi. Bogaci właściciele płacą ponad rynek: Widzew 2,2, Legia 1,75, Zagłębie (KGHM) 1,55, Raków 1,5. Płacowość działa przy generowaniu kadr, uzupełnieniach, wychowankach, przedłużeniach i transferach (żądanie zawodnika wobec danego klubu), więc poziom płac klubu nie dryfuje do średniej rynku.

Po spadku pensje kadry spadają o klauzulę spadkową z kontraktu (`relegationCut`), a gdy jej nie ma, o 30 % [SZAC].

### 3.2 Wartość rynkowa (`marketValue`, `estimateValue`)

```text
wartość = 250 000 EUR x e^(0,75 x (OVR - 10)) x wiek x kontrakt x liga x forma x 4,25 zł/EUR
liga: Ekstraklasa 1, 1 Liga 0,6, 2 Liga 0,35, III liga 0,2 [SZAC]
```

OVR 10 to ok. 250 tys. EUR, OVR 12 ok. 1 mln EUR, OVR 14,5 ok. 7 mln EUR; młody talent do x2, weteran x0,3. Wynik na świecie startowym (ziarno 5): mediana zawodnika Ekstraklasy 0,37 mln EUR, 90. centyl 1,42 mln EUR, najdroższy 6,6 mln EUR, cała liga 270 mln EUR, kadra Legii 38,8 mln EUR. Transfery między klubami AI w pierwszym sezonie: mediana 0,23 mln EUR, najdroższy 1,7 mln EUR.

### 3.3 Przychody

| Źródło | Wzór | Kiedy |
|---|---|---|
| Prawa TV, część stała | Ekstraklasa 8,22 mln zł + ranking historyczny 4,4 mln x (prestiż / 10)^1,5; 1 Liga 1,5 mln (PZPN: 27 mln zł na 18 klubów); 2 Liga 0,4 mln [SZAC] | co miesiąc 1/12 |
| Prawa TV, wynik sportowy | Ekstraklasa: część liniowa 5,7 mln zł za 1. miejsce, o 0,3 mln mniej za każde kolejne (najmniej 0,6 mln), plus premia 17 / 13,5 / 10 / 2,5 mln zł za miejsca 1-4 [SZAC: rozkład]. Mistrz 22,7, 2. miejsce 18,9, 3. 15,1, 4. 7,3, 5. 4,5, 10. 3,0, 18. 0,6 mln zł; razem 99,7 mln zł (33,5 % z 301,1 mln to 100,9 mln). Spadkowicze z Ekstraklasy (16.-18.) + 1 mln zł. 1 Liga: premia 0,3 / 0,2 / 0,1 mln za miejsca 1-3, 2 Liga 0,15 / 0,1 / 0,05 mln [SZAC] | po ostatniej kolejce |
| Sponsorzy | umowy sponsorskie (rozdz. Sponsorzy); pula na start gry 75 % komercji z danych [SZAC] | co miesiąc 1/12 każdej umowy, premie po wyniku |
| Koszulki, catering, inne | 25 % komercji [SZAC] | co miesiąc |
| Dzień meczowy | pojemność x zapełnienie x zł na widza x ranga; zapełnienie wychodzi od realnej średniej (frekwencja / pojemność) i zmienia się z rangą meczu (puchary UEFA x1,35, Superpuchar x1,1, wczesne rundy PP x0,7, finał PP na PGE Narodowym), formą, miejscem, rywalem i derbami; ceny: UEFA x1,4, PP x0,6, finał PP x1,2 [SZAC]; sparingi x0,12 | po meczu |
| Właściciel i dotacje | dopłata z danych / 12; skarbiec na start sezonu; pokrycie długów klubu AI | co miesiąc, 1 lipca, 1. dnia miesiąca |
| Nagrody | UEFA w pełnych kwotach (tabela 1.5, kurs 4,25 zł/EUR), premia dla zdobywcy LM, LE, LK po finale; wypłata solidarnościowa UEFA 15 grudnia (odpadnięcie w eliminacjach 0,26 mln EUR, klub Ekstraklasy bez pucharów 0,1 mln EUR [SZAC]); Puchar Polski 2026/27 według najdalszej rundy (tabela 1.5, runda wstępna jak I runda [SZAC]): po każdym meczu zwycięzca dostaje przyrost do kwoty kolejnej rundy, przegrany wyrównanie do kwoty rundy, w której odpadł; Superpuchar Polski bez nagrody | po meczu |
| Sprzedaż zawodników | odstępne | przy transferze |

Po zmianie ligi komercja, frekwencja, ceny i docelowe płace przeliczają się mnożnikami (Ekstraklasa / 1 Liga / 2 Liga / III liga): komercja 1 / 0,55 / 0,3 / 0,15, frekwencja 1 / 0,75 / 0,55 / 0,4, ceny 1 / 0,7 / 0,5 / 0,4, płace 1 / 0,4 / 0,15 / 0,08 [SZAC].

### 3.4 Koszty i budżety

```text
koszty_klubu (rocznie) = 0,5 x docelowe płace zawodników        sztab, administracja, rezerwy, młodzież (GT: 78/14/8 %)
                       + 0,3 x przychody krajowe (1-2 Liga: 0,25) stadion, organizacja meczów, podróże, akademia [SZAC]
saldo startowe         = max(25 % rocznych przychodów krajowych, skarbiec)                                          [SZAC]
budżet transferowy     = min(0,25 x przychody krajowe + skarbiec, (saldo - miesięczne koszty) x 0,6)
                         (z bogatym właścicielem x0,85 zamiast x0,6); sprzedaż dodaje połowę odstępnego             [SZAC]
budżet płac (tydz.)    = max(obecne płace, docelowe płace / 52 x (1 + do 25 % przy wolnej gotówce)) x 1,05           [SZAC]
```

Stabilność bez decyzji gracza:

- Klub AI, którego saldo 1. dnia miesiąca spadnie poniżej miesięcznych płac, dostaje dopłatę właściciela (rezerwy: od pierwszej drużyny) do tego poziomu; przy długu budżet transferowy przepada.
- Klub AI z saldem ponad 50 % rocznych przychodów krajowych plus skarbiec wydaje co sezon połowę nadwyżki na spłatę zadłużenia i inwestycje (`invest`, "Spłata długów i inwestycje") [SZAC]. To odpowiada polskim realiom (większość klubów ma ujemne kapitały) i zatrzymuje narastanie gotówki.
- Bogaty właściciel uzupełnia saldo do skarbca 1 lipca (także klubowi gracza): realne pieniądze na transfery, jak dokapitalizowania Widzewa, Pogoni i Śląska.

### 3.5 API

`finance.js` zachowuje wszystkie dotychczasowe eksporty (`book`, `financeDay`, `matchIncome`, `attendanceFill`, `spendable`, `wageRoom`, `wageBill`, `monthSummary`, `seasonSummary`, `FIN_LABELS`, `initClub`, `createFinance`, `stadiumCapacity`, `uefaPrize`, `PP_PRIZE`, `FIN`). Nowe: `clubPlan(club)` (roczny plan klubu: tv, merit, sponsor, other, tickets, owner, wages, ops, domestic, net, cap, att, perFan, skarbiec, ownerType, ownerName, sponsorLevel), `meritTv(tier, pos)`, `initClub(world, club, { balance, date, ai })`, `attendanceFill(f, homeRow, awayClub, homeFin)` (czwarty argument opcjonalny). Klub w `F.clubs` ma pole `plan`. Nowe rodzaje wpisów: `owner` (Właściciel i dotacje), `invest` (Spłata długów i inwestycje); etykiety dla `camps` i `fines` dla obozów i kar PZPN (kary za kibiców oraz kary dla trenera za słowa o sędziach, docs/konferencja-prasowa.md rozdz. 5). Premia za miejsce w lidze to teraz wpis `tv`, nie `prize`. Plik danych: `FINANSE_KLUBOW`, `DOMYSLNE`, `clubFinanceData(club)`, `payLevel(club)`, `EUR_PLN`. `negotiation.js`: `marketWage(ovr, tier, foreign, level)`, stałe `WAGE_BASE`, `WAGE_SLOPE`, `WAGE_MAX`, `TIER_WAGE`, `VALUE_BASE_EUR`, `VALUE_SLOPE`.

Nagrody i sponsorzy (Nov 13, 2026): `FIN.MERIT[tier]` to teraz `{ first, step, min, top }` (część liniowa i premia za podium), API `meritTv(tier, pos)` bez zmian. `PP_PRIZE[runda]` to kwota łączna dla klubu, którego najdalszą rundą jest ta runda (`W`: zdobywca). `src/career/prizes.js`: `ppPrizeDue(round, won, playedEarlier)`, `bookCupPrize(F, fixtures, f)`, `bookUefaWinner(F, f)`, `uefaSolidarity(game, date)`; `uefaPrize(comp, 'W')` dla zdobywcy LM, LE, LK, `uefaPrize('SOL', 'Q' | 'NP')`. `F.solidarity` (rok sezonu z wypłatą), `F.sponsorContracts` (gdy true, `financeDay` nie księguje płaskiej kwoty sponsorów). `src/career/sponsors.js`: stan `game.sponsors`, opis w rozdz. Sponsorzy.

## 4. Kalibracja: wyniki

### 4.1 Pensje (6 światów, `node tools/kalibracja-finansow.mjs 6`)

| Liga | Średnia pensja | Mediana | 90. centyl | Najwyższa |
|---|---|---|---|---|
| Ekstraklasa | 100 900 zł / mies. | 76 300 | 203 700 | 606 700 |
| 1 Liga | 21 500 zł / mies. | 17 300 | 42 000 | 160 300 |
| 2 Liga | 5 800 zł / mies. | 4 800 | 10 800 | 30 300 |

Rachunek płac kadry względem celu (85 % płac I drużyny) mieści się w 0,98-1,04 dla wszystkich 54 klubów.

### 4.2 Płace przed i po (świat startowy, ziarno 5)

| Klub | Przed (tydz.) | Przed (rok) | Po (tydz.) | Po (rok) | Realne płace I drużyny 2025/26 |
|---|---|---|---|---|---|
| Legia | 263 000 zł | 13,7 mln | 1 402 000 zł | 72,9 mln | 77,0 mln |
| Lech | 258 800 zł | 13,5 mln | 986 500 zł | 51,3 mln | 57,3 mln |
| Raków | 219 600 zł | 11,4 mln | 1 004 700 zł | 52,2 mln | 58,6 mln |
| Widzew | 163 200 zł | 8,5 mln | 1 096 100 zł | 57,0 mln | 68,3 mln |
| Jagiellonia | 165 400 zł | 8,6 mln | 504 300 zł | 26,2 mln | 35,4 mln |
| Korona | 129 600 zł | 6,7 mln | 375 700 zł | 19,5 mln | 21,1 mln |
| ŁKS (1 Liga) | 41 700 zł | 2,2 mln | 190 400 zł | 9,9 mln | 10 [SZAC] |
| GKS Tychy (2 Liga) | 13 200 zł | 0,7 mln | 67 700 zł | 3,5 mln | 3,5 [SZAC] |

Przychody bazowe przed zmianą: Legia 18,5 mln zł, Lech 18,2, Raków 15,4, Widzew 11,5, Korona 9,1 (1,35 x płace). Po zmianie przychody krajowe z planu: Legia 153,0 mln zł, Lech 132,6, Raków 61,2 (plus 32 mln dopłat właściciela), Widzew 63,0 (plus 50), Korona 37,2.

### 4.3 Budżety na start gry (ziarno 5)

| Klub | Saldo | Budżet transferowy | Budżet płac (tydz.) |
|---|---|---|---|
| Legia | 38,3 mln zł | 15,8 mln zł | 1 472 100 zł |
| Lech | 33,1 | 20,2 | 1 103 300 |
| Raków | 25,0 | 14,7 | 1 092 800 |
| Widzew | 45,0 | 30,7 | 1 354 800 |
| Jagiellonia | 14,4 | 5,5 | 654 200 |
| Pogoń | 15,0 | 8,8 | 579 400 |
| Cracovia | 20,0 | 13,8 | 525 300 |
| Motor | 15,0 | 9,9 | 416 000 |
| Korona | 9,3 | 3,7 | 394 500 |
| Radomiak | 7,4 | 2,5 | 422 600 |
| Lechia (1 Liga) | 6,1 | 2,5 | 261 000 |
| ŁKS (1 Liga) | 3,9 | 1,5 | 199 900 |
| GKS Tychy (2 Liga) | 1,3 | 0,5 | 71 100 |

### 4.4 Rachunek wyników sezonu 2026/27 (bez decyzji gracza, Widzew trenera, ziarno 5, mln zł)

| Klub | Przychody | w tym | Koszty | w tym | Wynik | Saldo 30.06 |
|---|---|---|---|---|---|---|
| Legia | 189,9 | sponsorzy 66,7, dzień meczowy 48,3, TV 35,2, inne 22,2, sprzedaż 17,4 | 155,8 | koszty klubu 78,8, pensje 69,2, transfery 7,6 | +34,1 | 72,4 |
| Lech | 204,3 | dzień meczowy 75,4, sponsorzy 54,0, TV 31,2, nagrody 23,1 | 126,6 | koszty klubu 64,1, pensje 52,0, transfery 10,3 | +77,6 | 110,8 |
| Raków | 151,3 | nagrody 38,2, właściciel 32,0, sponsorzy 28,5, TV 21,6 | 90,5 | pensje 47,2, koszty klubu 43,3 | +60,8 | 85,8 |
| Widzew | 110,3 | właściciel 50,0, dzień meczowy 22,5, sponsorzy 18,0, TV 13,5 | 104,9 | pensje 57,0, koszty klubu 47,9 | +5,4 | 50,4 |
| Korona | 40,4 | TV 14,9, sponsorzy 10,5, dzień meczowy 6,5, miasto 5,0 | 43,3 | pensje 20,8, koszty klubu 20,1 | -2,9 | 6,4 |

Górnik zagrał w tym przebiegu w fazie ligowej Ligi Mistrzów: 104,1 mln zł nagród i 141,4 mln zł salda po sezonie, rząd wielkości jak realne kwoty dla polskiego klubu w tej fazie.

### 4.5 Salda w kolejnych sezonach (mln zł, start sezonu, ziarno 5)

| Klub | 2026/27 | 2027/28 | 2028/29 | 2029/30 | 2030/31 | 2031/32 | 2036/37 |
|---|---|---|---|---|---|---|---|
| Legia | 40,2 | 74,3 | 123,5 | 138,6 | 118,6 | 113,7 | 183,9 |
| Lech | 34,9 | 95,2 | 131,9 | 130,2 | 146,5 | 126,1 | 113,7 |
| Raków | 34,6 | 73,9 | 93,9 | 77,2 | 70,7 | 70,0 | 79,7 |
| Widzew (gracz) | 48,1 | 53,5 | 73,4 | 80,4 | 95,8 | 125,9 | 93,8 |
| Jagiellonia | 15,1 | 42,2 | 40,7 | 40,0 | 59,1 | 49,2 | 13,1 |
| Korona | 10,0 | 7,2 | 5,2 | 7,4 | 4,1 | 3,4 | 5,8 |

Po 10 sezonach (lipiec 2036) salda w Ekstraklasie: Legia 183,9, Lech 113,7, Widzew 93,8, Raków 79,7, Wieczysta 42,4, Wisła Kraków 41,9, Górnik 37,2, Motor 27,5 mln zł; żaden klub nie ma ujemnego salda na starcie żadnego sezonu. Salda czołówki zatrzymują się na poziomie 100-180 mln zł (rok przychodów) zamiast rosnąć liniowo; w starym modelu Legia miała po 5 sezonach 63,8 mln zł przy gospodarce w skali 1/6, czyli w realnej skali ok. 380 mln zł i dalszy wzrost. Siła lig w `node tools/multiseason.mjs widzew 5 5` jest stabilna (średnia OVR 14 najlepszych w Ekstraklasie 11,67 na starcie, 11,82 po 5 sezonach), bez ujemnych sald.

### 4.6 Nagrody i sponsorzy: przed i po (Nov 13, 2026)

`node tools/kalibracja-finansow.mjs 4` daje identyczny wynik przed i po zmianie (narzędzie liczy płace, których zmiana nie dotyczy). Symulacja 3 sezonów (ziarno 5, Widzew trenera, bez decyzji gracza), przychody wszystkich klubów w mln zł:

| Sezon | TV przed | TV po | Sponsorzy przed | Sponsorzy po | Przychody przed | Przychody po |
|---|---|---|---|---|---|---|
| 2026/27 | 373,7 | 332,4 | 501,7 | 520,0 | 1 867,2 | 1 913,7 |
| 2027/28 | 374,3 | 332,6 | 499,4 | 539,6 | 1 804,4 | 1 768,8 |
| 2028/29 | 373,7 | 330,5 | 500,9 | 534,6 | 1 815,5 | 1 799,3 |

Podział Ekstraklasy za wynik sportowy spada z ok. 122 do 99,7 mln zł (mistrz bez zmian, środek tabeli mniej), 1 Liga traci ok. 1 mln zł na klub (1,5 mln z PZPN zamiast 2,0 mln [SZAC] i mniejszej premii za miejsce). Sponsorzy dają 4-8 % więcej niż płaska kwota: premie i atrakcyjność (puchary UEFA, trofea) podnoszą umowy czołówki. Średnie saldo klubów Ekstraklasy po sezonach: przed 29,9 / 35,7 / 34,6, po 33,0 / 35,5 / 38,0 mln zł; żaden klub nie ma ujemnego salda. Nagrody różnią się między przebiegami głównie przez wyniki w pucharach UEFA.

## Sponsorzy

Stan: Nov 13, 2026. Kod: `src/career/sponsors.js` (system dnia `sponsors`, po systemie kariery), widok `src/ui/sponsorsView.js` (Klub > Sponsorzy, akcja `sp-pick`), style `src/styles/klub.css`. Wszystkie liczby w tym rozdziale to [SZAC] (założenia panelu ekspertów, do kalibracji).

**Pula i miejsca.** Pula sponsorów klubu to `plan.sponsor` (75 % komercji). Dzieli się na umowy według miejsc: sponsor główny na koszulce 40 % (umowy 2-5 lat), rękaw i plecy 15 % (1-3), nazwa stadionu 10 % (3-10, tylko przy stadionie od 15 tys. miejsc; klub miasta, czyli stadion miejski, dostaje połowę), dostawca strojów 10 % (3-5), pakiet partnerów 25 % (rok, odnawia się sam co lipiec). Niewykorzystana część nazwy stadionu przechodzi do pakietu partnerów. Na start gry suma umów równa się `plan.sponsor` (kalibracja bez zmian), a końce umów są rozłożone na 1-3 sezony. Umowy z początku gry w wariancie z premiami mają premie w 1/4 zwykłej wysokości, bo kwota stała jest pełna.

**Umowa:** `{ id, slot, name, industry, annual, years, start, end, variant, growth, bonuses: { title, uefaLeague, cup, top3 }, relegation: { cut, terminate } }`. Firmy są fikcyjne (nazwa i branża, np. "Bank Regionalny Północ" (bank)). Co miesiąc klub dostaje 1/12 rocznej kwoty każdej umowy (wpis `sponsor`), premie trafiają do księgi jako `sponsor` z opisem "Premia sponsora: ...".

**Oferta:** wartość = udział miejsca x `plan.sponsor` x A x losowo 0,92-1,08, gdzie

```text
A = 1 + 0,03 x (cel - miejsce) + 0,15 x UEFA + 0,10 x trofeum + 0,003 x (nastroje kibiców - 55), w granicach 0,75-1,40
UEFA: 1 w fazie ligowej, 0,5 w eliminacjach; trofeum: mistrzostwo albo Puchar Polski w ostatnim sezonie
miejsce: bieżąca tabela po 5 kolejkach, wcześniej miejsce z poprzedniego sezonu w tej samej lidze
```

| Wariant | Kwota stała | Premie (część wartości oferty) | Lata | Spadek |
|---|---|---|---|---|
| Stała kwota | 100 % | brak | 3 | obniżka 50 % albo zerwanie |
| Z premiami | 75 % | mistrzostwo +40 %, faza ligowa UEFA +30 %, Puchar Polski +15 %, podium +10 % | 2 | obniżka 40 % |
| Długoterminowa | 90 %, co roku +3 % | podium +5 % | 5 | obniżka 30 %, bez zerwania |

Długość umowy mieści się w zakresie miejsca (np. rękaw najwyżej 3 lata, stroje najmniej 3).

**Zdarzenia:**

- Wygaśnięcie (1 lipca): gracz dostaje w poczcie ofertę z trzema wariantami (wybór w poczcie albo w zakładce Klub > Sponsorzy), ważną 14 dni; bez decyzji zarząd podpisuje stałą kwotę. Połowa ofert pochodzi od dotychczasowego sponsora. Pakiet partnerów odnawia się sam, partner dodatkowy odchodzi.
- Awans: sponsor główny i rękaw +50 % od razu (klauzula awansu), w ciągu 14 dni oferty na wolne miejsca i umowy kończące się w tym sezonie.
- Spadek: obniżki z klauzul; umowa z klauzulą rozwiązania zostaje zerwana z szansą 35 % (wtedy oferta na wolne miejsce); pakiet partnerów -30 %.
- Faza ligowa UEFA albo trofeum: jedno dodatkowe zdarzenie, podwyżka u sponsora głównego o 10 % albo oferta nowego partnera (2-4 % puli).
- Losowo: kłopoty sponsora (3 % na sezon dla każdej umowy, zerwanie przed czasem i oferta na wolne miejsce w ciągu 14 dni), nowy mały partner 1-2 razy w sezonie (1-3 % puli, rok). Najwyżej jedno zdarzenie losowe albo dodatkowe w miesiącu; wygaśnięcia, awans i spadek nie mają limitu.
- Premie: mistrzostwo i podium po ostatniej kolejce ligi (także w 1 i 2 Lidze), Puchar Polski po finale, faza ligowa UEFA na początku miesiąca, w którym klub w niej gra; każda raz w sezonie.

**Kluby AI** mają te same umowy bez widoku: oferty podpisują od razu, wariant według celu sezonu (cel do 3. miejsca: z premiami, walka o utrzymanie: długoterminowa, pozostałe: stała kwota). Wszystkie klauzule działają tak samo.

**Stare zapisy:** bez `game.sponsors` umowy powstają przy pierwszym dniu albo otwarciu zakładki; jeśli w bieżącym miesiącu księga ma już płaską kwotę sponsorów, umowy zaczynają płacić od kolejnego miesiąca. Koszt: ok. 0,1 s na sezon symulacji wszystkich klubów.

## 5. Ograniczenia i dalsze kroki

- Brak amortyzacji kart zawodniczych, podatków i kredytów. Realne kluby częściej mają straty; w grze nadwyżka idzie w spłatę długów i inwestycje.
- Pieniądze z UEFA nie obejmują filaru wartości (współczynnik, prawa TV), więc polskie kluby dostają w pucharach nieco mniej niż w rzeczywistości.
- Kluby AI kupują mało (ok. 30 płatnych transferów na sezon, mediana 0,23 mln EUR), bo pulę ogranicza lista transferowa; budżety są wyższe niż wydatki.
- Kwoty niższych lig i część danych Ekstraklasy to szacunki. Do weryfikacji w pełnych raportach Grant Thornton (https://grantthornton.pl/publikacja/finansowa-ekstraklasa-sezon-2025-2026/ i https://grantthornton.pl/finansowa-pierwsza-liga-sezon-2025-2026/), gdy będą dostępne z sesji.
- Nowa umowa telewizyjna Ekstraklasy na lata 2027-31 nie jest jeszcze znana; po jej ogłoszeniu wystarczy zmienić `FIN.TV_FIXED`, `FIN.TV_RANKING` i `FIN.MERIT`.

## Limit kadry

Odprawy i sprzedaże zarządu przy zbyt dużej kadrze (docs/limit-kadry.md) trafiają do księgi jako `release` (odprawa, zdejmowana też z budżetu transferowego) i `sales` (sprzedaż za 60 % wartości). Kluby AI płacą odprawy tylko wtedy, gdy stać je na nie (`spendable`), poza przekroczeniem maksimum kadry.

## Prośby do zarządu i weto

Kod: `src/career/boardRequests.js` (logika, system dnia `boardRequests`, order 51), `src/ui/boardRequestsView.js` (panel w zakładce Klub > Zarząd, prawa kolumna `.klub-side`, akcje `br-ask`, `br-appeal`), style `src/styles/klub.css` (klasy `.br-*`). Stan w zapisie: `game.board.requests` (tworzony leniwie: `log`, `conds`, `vetoes`, `overrides`, `appeals`, `goalSeason`, `ownerPaid`). Testy: `tests/boardRequests.test.mjs`. Wszystkie liczby w tym rozdziale to [SZAC].

### Prośby gracza

| Prośba | Kwota | Kiedy | Skutek zgody |
|---|---|---|---|
| Większy budżet transferowy | +10, +25, +50 % budżetu albo dowolna (przy zerowym budżecie odniesieniem jest 5 % przychodów krajowych) | w oknie transferowym albo do 30 dni przed jego otwarciem | `transferBudget` rośnie o przyznaną kwotę |
| Większy budżet płac | +10, +25, +50 % tygodniowego budżetu płac albo dowolna | jak wyżej | `wageBudget` rośnie |
| Przesunięcie do budżetu płac | 10, 25, 50 % budżetu transferowego (min. 100 tys. zł) | zawsze | 1 mln zł budżetu transferowego daje 1 mln / 104 zł tygodniowo w płacach; zgoda zawsze, gdy wskaźnik płac po przesunięciu mieści się w 80 % |
| Niższy cel sezonu | o jeden poziom (np. puchary -> środek tabeli) | raz w sezonie, przed 1 listopada | nowy cel w `game.board.goal` |
| Zmiana dyrektora sportowego (v1.23 Beta) | bez kwoty, opcjonalnie kandydat z listy wolnych dyrektorów | gdy klub ma dyrektora | zarząd zwalnia dyrektora (odprawa z kasy klubu) i zatrudnia nowego; własna punktacja `directorScore`, zgoda od S 10, `docs/dyrektor-sportowy.md` rozdz. 4 |

Częstotliwość: najwyżej jedna prośba w tygodniu i trzy w miesiącu kalendarzowym; ta sama sprawa najwcześniej po 30 dniach, po odmowie po 60, po zgodzie (pełnej albo częściowej) po 90. Budżety po zmianie sezonu liczy od nowa `initClub`, więc przyznane kwoty obowiązują do końca sezonu.

Decyzja jest deterministyczna (ziarno `prosba:${seed}:${data}:${rodzaj}`):

```
S = 0,6 x (zaufanie - 50)
  + clamp(3 x (cel - miejsce), -15, 15)           od 4. kolejki, wcześniej 0
  + clamp(10 x ((saldo - rezerwa) / koszt - 1), -20, 15)   rezerwa = (płace + koszty klubu) / 12
  + wskaźnik płac (tylko budżet płac): W > 0,80 -40; 0,70-0,80 -15; poniżej 0,60 +10
  + (ambicja - 10) + 1,5 x (zasobność - 10)       cechy właściciela, src/career/owners.js
  - 25 x kwota / obecny budżet
  + 5 w oknie transferowym, -10 poza nim
  + los od -5 do 5
```

Koszt dla salda: budżet transferowy w całości, płace tygodniowe razy liczba tygodni do końca sezonu (co najmniej 13). W = roczne płace I drużyny / (przychody krajowe + średnia sprzedaż zawodników z ostatnich 3 sezonów), bez dopłat właściciela; przy prośbie o płace liczony dla budżetu płac powiększonego o kwotę.

Werdykt: S >= 20 zgoda; 5-20 częściowa zgoda (udział 0,3 + 0,5 x (S - 5) / 15 kwoty); od -10 do 5 zgoda warunkowa ("jeśli 1 dnia miesiąca za co najmniej 4 tygodnie drużyna będzie na N. miejscu lub wyżej, dostanie Pan 80 % kwoty"; N = cel sezonu albo obecne miejsce, jeśli lepsze; warunek sprawdza comiesięczna ocena zarządu, list z wynikiem); poniżej -10 odmowa. Przy W > 0,80 budżet płac jest możliwy tylko wtedy, gdy właściciel ma zasobność co najmniej 14 i pokrywa koszt ze skarbca (wpis `owner` w księdze, najwyżej skarbiec na sezon). Niższy cel: ten sam wzór, ale składnik tabeli z odwrotnym znakiem (zarząd łatwiej obniża cel drużynie wyraźnie pod celem), właściciel -1,5 x (ambicja - 10), stała -5 zamiast kwoty, bez składnika okna; zgoda od S >= 10, bez wariantów pośrednich.

Zaufanie: odmowa -1; prośba przy zaufaniu poniżej 35 albo co najmniej 4 miejsca pod celem dodatkowo -2; niespełniony warunek -1. Zgoda na ponad 20 % budżetu podnosi cel sezonu o jedno miejsce ("pieniądze zobowiązują"). Każda odpowiedź to list w poczcie (kategoria Zarząd, nadawca i podpis "Zarząd klubu") z kwotami, powodami i datą, od której można wrócić do sprawy.

Kluby AI nie piszą próśb. 2 lipca i 2 stycznia każdy klub AI ma liczone S dla +25 % budżetu transferowego (zaufanie 50, cel z siły kadry, bez limitów częstotliwości); przy S >= 20 budżet rośnie o tę kwotę.

### Weto zarządu

Progi (`boardCaps`), mnożone przez typ właściciela s (bogaty właściciel 1,2, oszczędny, czyli zasobność do 6, 0,9, miasto, spółka i pozostali 1,0, rezerwy 0,8):

| Próg | Wartość |
|---|---|
| Pensja | najwyżej max(1,5 x najwyższa pensja w kadrze, 1,3 x pensja rynkowa `marketWage`) x s; bogaty i ambitny właściciel (zasobność i ambicja co najmniej 14) 1,8 zamiast 1,5; przy przedłużeniu co najmniej 1,15 x obecna pensja |
| Pensja a budżet | najwyżej 25 % tygodniowego budżetu płac x s |
| Koszt kontraktu | pensja x 52 x lata + premia za podpis + prowizja najwyżej 15 % rocznych przychodów krajowych x s |
| Odstępne | weto, gdy ponad 2 x s x `estimateValue` i ponad 1 mln zł; ostrzeżenie od 1,5 x s; weto, gdy ponad 40 % przychodów krajowych x s, chyba że pokrywa to skarbiec właściciela |
| Wiek i długość | 33+ najwyżej 1 rok, 31-32 dwa, 29-30 trzy, do 28 pięć; bramkarze o rok dłużej (maks. 5) |
| Premia za podpis | najwyżej 50 % x s pensji z pierwszego roku |
| Prowizja agenta | najwyżej 10 % x s wartości kontraktu (pensje) |

Gdzie działa: `negotiationLimits` (src/ui/transfersView.js) zwraca progi w polu `board`; ekran rozmów pokazuje je pod limitem klubu, ostrzega przy wpisywaniu i przycina domyślną ofertę. Oferta ponad progi (także przyjęcie kontroferty) nie trafia do zawodnika: zarząd wysyła list z weta (np. "Proponowana pensja 180 tys. zł tygodniowo jest o 64 % wyższa od najwyższej w kadrze (110 tys. zł). Zaakceptujemy najwyżej 135 tys. zł.") i runda się nie liczy. `offerForPlayer` sprawdza odstępne przed odpowiedzią klubu sprzedającego (weto albo ostrzeżenie w tekście odpowiedzi).

Odwołanie: raz na zawodnika w oknie (poza oknem: do otwarcia następnego), najwyżej dwa w sezonie; przycisk na ekranie rozmów, w karcie zawodnika na rynku i w panelu "Weta zarządu". Decyzja z tego samego S, w którym zamiast składnika kwoty jest -25 x przekroczenie progu (największe względne), a koszt to odstępne albo koszt kontraktu; zgoda od S >= 10. Zgoda kosztuje 3 punkty zaufania i zatwierdza dokładnie zawetowane warunki do końca okna (poza oknem na 30 dni), odmowa kosztuje 5.

Kluby AI: te same progi wieku, długości, pensji i kosztu kontraktu w `aiNegotiate` (budżet `{ wage, maxYears, total }`: oferta i przyjmowana kontroferta skracane do progu), przy zakupach (`aiBuy`: odstępne ponad progi wypada z listy kandydatów), przedłużeniach (`aiRenewals`) i kupnie zawodnika gracza (`answerIncoming`). Domyślna oferta AI (4/3/2/1 rok wg wieku) już mieści się w progach, więc zmienia się głównie przyjmowanie kontrofert i pensje najlepiej opłacanych.

## Infrastruktura

Stadion, baza treningowa i akademia mają poziomy 1-10 (pełny opis, skala, źródła i wzory: docs/infrastruktura.md). Efekty liczą się względem poziomu startowego klubu, więc pierwszy dzień gry jest taki sam jak w modelu z rozdz. 3:

- przychód z widza = naKibica x M(L) / M(L_start), pojemność = pojemność z danych + dobudowane miejsca (w czasie budowy mniej);
- utrzymanie obiektów zastępuje część kosztów klubu: kredyt = min(utrzymanie na starcie, 0,5 x ops); co miesiąc księgowane są (ops - kredyt) / 12 jako `ops` i (kredyt + przyrost utrzymania) / 12 jako `upkeep` („Utrzymanie obiektów”) [SZAC];
- inwestycje gracza: 20 % udziału klubu na start, reszta w ratach co miesiąc (`infra`, „Inwestycje w obiekty”); miasto i bogaty właściciel dokładają według typu właściciela [SZAC];
- kluby AI kierują połowę corocznej kwoty `invest` (rozdz. 3.4) na projekty: licencja, baza, akademia, stadion (tylko przy zapełnieniu od 92 %), nie wyżej niż poziom 8 [SZAC];
- licencja (Ekstraklasa: stadion od 4 i 4 500 miejsc, baza od 3, akademia od 3; 1 Liga: stadion od 3, akademia od 2; 2 Liga: stadion od 2): sezon na rozpoczęcie inwestycji, potem kara 1 mln zł (`fines`) [SZAC].
