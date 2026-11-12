# Gra bierna: co traci trener, który tylko przeklikuje sezon

Stan na Nov 12, 2026. Zgłoszenie użytkownika: samo przeklikanie sezonu (bez konferencji, bez zmian w treningu,
bez rozmów z drużyną i z zawodnikami, ta sama taktyka z każdym rywalem) powinno być surowiej karane, ale wprowadzone
ostrożnie, po analizie kilku scenariuszy i konsultacji z trenerem i psychologiem, w realiach polskiej piłki.

Panel: trener UEFA Pro (prowadzenie drużyny w Ekstraklasie), psycholog sportu, specjalista analizy rywala z polskiego
klubu, programista i projektant gry. Kod: `src/training/scouting.js`, `src/career/attention.js`,
`src/training/variety.js`, zmiany w `src/training/cohesion.js`, `src/training/aiClubs.js`, `src/training/sessions.js`,
`src/training/index.js`, `src/match/matchday.js`, `src/match/press.js`, `src/career/teamTalks.js`,
`src/ui/talksView.js`, `src/ui/matchdayView.js`. Testy: `tests/passivePlay.test.mjs`.

Oznaczenia: [SZAC] szacunek projektowy bez źródła, [SYM] wynik symulacji w tym repozytorium, [ŹR] fakt ze źródła
(lista na końcu).

## Odpowiedź w skrócie

ODPOWIEDZ_W_SKROCIE

## 1. Jak to wygląda w prawdziwym futbolu

### 1.1 Analiza rywala i przewidywalność

- **Kto analizuje.** W polskich klubach analizę rywala robią analityk wideo, asystent trenera i trener bramkarzy;
  osobno analizuje się drużynę rywala, pojedynczych zawodników i własny mecz. Typowe źródła danych to Wyscout,
  StatsBomb i statystyki Ekstraklasy, a odprawa wideo dla drużyny trwa ok. 12-25 minut [ŹR A1]. Legia Warszawa
  korzysta z systemu PIERO, a asystent trenera prowadzi dział analiz i używa nagrań na każdej odprawie [ŹR A2].
  Na wszystkich stadionach Ekstraklasy działa śledzenie TRACAB [ŹR A3], więc dane o ruchu drużyn ma każdy klub ligi;
  różnica jest w tym, ilu ludzi i jak dobrze z nich korzysta.
- **Co się analizuje.** Raport o rywalu zwykle dzieli grę na cztery momenty: wyjście z piłką, przejścia,
  organizację w obronie i stałe fragmenty; trenerzy dostają go na początku tygodnia, drużyna przed meczem [ŹR A4].
  Stałe fragmenty to wyraźny przykład wartości analizy: w Premier League 2025/26 27,4 % goli padło po stałych
  fragmentach (bez karnych), a 15 z 20 klubów zatrudnia trenera od stałych fragmentów [ŹR A5]. Powtarzany
  wariant rzutu rożnego czy wyjścia od bramki jest łatwy do rozpoznania na nagraniach.
- **Wielkość sztabów w Polsce [SZAC].** Czołówka Ekstraklasy: 2-4 analityków (pierwsza drużyna, rywale, skauting),
  środek tabeli: 1-2, 1 Liga: zwykle 1 analityk albo asystent w podwójnej roli, 2 Liga: najczęściej asystent
  z kamerą. Nie znalazłem zestawienia etatów; w grze odpowiada temu jakość analityka w sztabie (`staff.js`,
  `3 + 1,3 x prestiż + premia ligi`, Legia ok. 17, mały klub 2 Ligi ok. 5).
- **Jak szybko schemat jest rozpracowany [SZAC].** Analityk przygotowuje rywala na podstawie ostatnich kilku meczów
  (najczęściej 3-5, przy powtarzalnym rywalu więcej nie trzeba). Drużyna, która od pięciu-sześciu kolejek gra tak
  samo, nie ma przed rywalem tajemnic. Trener Rakowa Marek Papszun mówił o tym od drugiej strony: nawet zmiana
  trenera rywala niewiele zmienia w analizie, bo nowy trener ma mało czasu, a zawodnicy zostają ci sami [ŹR A6].
  Analiza nie daje cudów: przygotowanie pod rywala to kilka procent, a nie zmiana klasy drużyny.
- **Dlaczego dobrzy trenerzy zmieniają plan.** Nie dla samej zmiany, tylko żeby rywal nie mógł się przygotować
  na jeden scenariusz: inny pressing z faworytem i ze słabszym, inna wysokość linii, inny wariant stałych fragmentów.
  Zespoły ćwiczą zwykle 2-3 plany na sezon; plan B grany niedawno nie rozbija zgrania tak jak zupełnie nowy pomysł.

### 1.2 Rozmowy indywidualne

- Jakość relacji trener-zawodnik (model 3+1C Jowett: bliskość, zaangażowanie, komplementarność, współorientacja)
  wiąże się z satysfakcją i wynikami sportowymi [ŹR B1, B2]; w badaniu podłużnym wsparcie i motywowanie przez trenera
  pośredniczyły między jakością relacji a satysfakcją zawodników [ŹR B2].
- **Rezerwowi.** Zawodnicy spoza składu mają gorsze samopoczucie, nastrój i poczucie skuteczności niż podstawowi,
  częściej czują rozgoryczenie i spadek pewności siebie; rola rezerwowego potrafi zepsuć relację z trenerem,
  a wsparcie osobiste poprawia ich stan [ŹR B3].
- **Psycholog panelu.** Najbardziej potrzebują rozmowy zawodnicy wrażliwi (przeżywają krytykę i brak uwagi),
  nowi w klubie (rola, język, miasto), ambitni rezerwowi (chcą usłyszeć, kiedy dostaną szansę) i zawodnicy
  w kryzysie formy. Spokojny weteran czy lider nie potrzebuje cotygodniowej rozmowy. Skutek zaniedbania narasta
  powoli: pierwsze tygodnie bez rozmowy nic nie zmieniają, po miesiącu-dwóch zawodnik zamyka się w sobie,
  traci zaufanie do trenera, a ambitny rezerwowy zaczyna myśleć o odejściu. Zebranie drużyny pomaga, ale nie zastąpi
  rozmowy w cztery oczy.

### 1.3 Media

- Konferencja prasowa obu trenerów po meczu jest częścią obowiązków medialnych klubu w Ekstraklasie (regulamin medialny
  ligi, załącznik do regulaminu rozgrywek) [ŹR C1, C2]. Nie znalazłem w tekstach dostępnych z sesji stawki kary
  za nieobecność trenera, więc gra nie karze finansowo; kosztem są relacje z mediami, klimat prasy i ocena zarządu.
- Dziennikarze pamiętają, kto ich unika; trener, który przychodzi i mówi spokojnie, ma łagodniejszą prasę w kryzysie
  (docs/konferencja-prasowa.md, rozdz. 1.4).

### 1.4 Monotonia treningu

- W fizjologii „monotonia” (Foster 1998) to mała zmienność dziennego obciążenia w tygodniu (średnia / odchylenie);
  razem z dużym obciążeniem wiąże się z chorobami i przetrenowaniem [ŹR D1]. Plan asystenta w grze już zmienia
  obciążenie w mikrocyklu (MD-4 wysoko, MD-1 nisko), więc w tym sensie monotonii nie ma.
- Ten sam akcent tydzień po tygodniu to raczej zasada akomodacji: organizm słabiej odpowiada na niezmienny bodziec,
  a trenerzy przygotowania zmieniają ćwiczenia co kilka tygodni; dowody na przewagę konkretnych schematów
  periodyzacji są jednak słabe [ŹR D2]. Do tego znużenie: te same gierki i te same zajęcia nudzą.
- Wniosek panelu: skutek ma być mały (morale z zajęć, trochę słabszy rozwój), a nie kara w punktach.

## 2. Burza mózgów panelu

**Trener UEFA Pro.** W Ekstraklasie nikt nie gra całego sezonu jednym planem na każdego rywala. Z Legią w Warszawie
grasz niżej i na kontrę, z beniaminkiem u siebie wysoko i odważnie. Trener, który tego nie robi, jest dla rywali
czytelny po kilku kolejkach. To ma kosztować, ale umiarkowanie: dobra kadra dalej wygrywa, a przewidywalność zabiera
kilka punktów w sezonie, nie robi z faworyta spadkowicza. Zmienianie planu dla zasady też nie może być darmowe:
nowy plan rozbija zgranie, przećwiczony plan B dużo mniej.

**Specjalista analizy rywala.** Rywal nie wie, jaki plan wybierzesz dziś; wie, jak grałeś ostatnio. Najprostszy model:
analitycy biorą najbardziej typowy schemat z ostatnich meczów (świeże ważą więcej), sprawdzają, jak powtarzalnie go
grasz, a w dniu meczu okazuje się, czy trafili. Jakość zależy od ludzi: klub z jednym analitykiem w 2 Lidze
rozpracuje cię słabiej niż Legia czy Lech. Trener rywala też się liczy: dobry planista (SKL) lepiej przekłada analizę
na plan meczu.

**Psycholog sportu.** Rozmowa działa, gdy trafia do właściwej osoby. Kara za brak rozmów nie może dotykać całej
kadry, tylko tych, którzy jej potrzebują, i ma narastać powoli. Ważniejsze od punktów są skutki widoczne w karierze:
spadek zaufania do trenera i niezadowolony ambitny rezerwowy. Asystent powinien podpowiadać, z kim porozmawiać,
bo w prawdziwym klubie też ktoś o tym przypomina.

**Programista i projektant gry.** Zasady: te same reguły dla gracza i AI tam, gdzie AI ma odpowiednik; kary ograniczone
i wyjaśnione w grze (wiadomość analityka, notka w studiu, przypomnienie asystenta, wiadomość o znużeniu treningiem);
deterministyczne ziarna; stary zapis działa (brak historii to znajomość neutralna); jeden wyłącznik do pomiarów
(`PASSIVE.enabled` i osobno `scout`, `attention`, `variety`). Najpierw pomiar, potem kara.

## 3. Pomiar przed zmianami

POMIAR_PRZED

## 4. Model

### 4.1 Przewidywalność taktyczna (`src/training/scouting.js`)

MODEL_SCOUT

### 4.2 Rozmowy z zawodnikami, którzy ich potrzebują (`src/career/attention.js`)

MODEL_ATTN

### 4.3 Prasa (`src/match/press.js`, korekta)

MODEL_PRESS

### 4.4 Monotonia treningu (`src/training/variety.js`)

MODEL_VARIETY

## 5. Kalibracja po zmianach

POMIAR_PO

## 6. Co widzi gracz

- Studio przedmeczowe, raport asystenta: „Rywal ma mocny dział analiz i zna nasz schemat (4-2-3-1): gramy tak
  od kilku meczów. Inny plan na ten mecz utrudni im zadanie.” albo „Rywal szykował się na nasz zwykły schemat
  (...). Dzisiejszy plan powinien go zaskoczyć.”
- Poczta (Analityk wideo), raz, gdy schemat staje się czytelny: „Rywale znają nasz schemat” z opisem schematu i radą.
  Ponownie dopiero, gdy drużyna zacznie zmieniać plan i znów wpadnie w rutynę.
- Poczta (Asystent trenera), najwyżej co 6 tygodni o tym samym zawodniku: „X potrzebuje rozmowy” (wrażliwy, nowy,
  ambitny rezerwowy). Kadra, Rozmowy: licznik „czeka na rozmowę” i powód przy zawodniku („Wrażliwy, długo bez
  rozmowy”, „Ambitny, mało gra”, „Nowy w klubie, czeka na rozmowę”).
- Poczta (Asystent trenera), raz na serię: „Zawodnicy są znużeni treningiem”, gdy ten sam akcent trwa ponad 8 tygodni.
- Konferencje: bez zmian w oknie; ocena zarządu dalej pisze „Zarząd zauważył, że trener unika konferencji prasowych”.

## 7. Kod i testy

KOD_TESTY

## 8. Otwarte pytania do decyzji

OTWARTE

## Źródła

- A1. M. Kędziorek, „Wykorzystanie analizy w procesie treningowym na podstawie doświadczeń własnych” (Wielkopolski ZPN, 2015), PDF: https://wielkopolskizpn.pl/files/document/397/wykorzystanie-analizy-w-procesie-treningowym-na-podstawie-doswiadczen-wlasnych-maciej-kedziorek-2015.pdf (znam z opisu wyszukiwarki; host niedostępny z sesji, w której powstał dokument).
- A2. Sports Video Group, „Legia Warsaw Taps Ross Video's PIERO System to Boost Team Analysis” (Jun 22, 2021): https://www.sportsvideo.org/2021/06/22/legia-warsaw-taps-ross-videos-piero-system-to-boost-team-analysis/
- A3. Ekstraklasa, „The TRACAB system is set to launch on all Lotto Ekstraklasa stadiums”: https://ekstraklasa.org/aktualnosci/the-tracab-system-is-set-to-launch-on-all-lotto-ekstraklasa-stadiums/ ; Hawk-Eye i Live Park (2026): https://www.sportsvideo.org/2026/08/04/ekstraklasa-live-park-select-hawk-eye-for-tracking-offside-and-broadcast-technology/
- A4. Stats Perform / Opta, studium przypadku Leicester City (raport rywala w czterech momentach gry): https://opta.kota.co.uk/case-study/leicester-city
- A5. Sky Sports, „Arsenal and Liverpool rank as best and worst from set pieces as Premier League clubs embrace trend”: https://www.skysports.com/football/news/12040/13493842/arsenal-and-liverpool-rank-as-best-and-worst-from-set-pieces-as-premier-league-clubs-embrace-trend-between-the-lines ; The Analyst, statystyki stałych fragmentów: https://theanalyst.com/articles/premier-league-defending-set-pieces-stats
- A6. Soccerway, „Marek Papszun z szacunkiem: Czeka nas trudny mecz z rywalem, który walczy o utrzymanie”: https://pl.soccerway.com/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-marek-papszun-z-szacunkiem-czeka-nas-trudny-mecz-z-rywalem-ktory-walczy-o-utrzymanie/U1TPaWdd
- B1. S. Jowett, model 3+1C relacji trener-zawodnik, przegląd: https://core.ac.uk/download/20572831.pdf ; https://pmc.ncbi.nlm.nih.gov/articles/PMC6770846
- B2. L. Davis i in., „Communication strategies: the fuel for quality coach-athlete relationships and athlete satisfaction”, Frontiers in Psychology (2019): https://frontiersin.org/articles/10.3389/fpsyg.2019.02156/full
- B3. „An Exploration of Substitutes' Experiences in Football” (Aberystwyth University, praca doktorska): https://research.aber.ac.uk/en/studentTheses/an-exploration-of-substitutes-experiences-in-football/ ; przegląd o roli rezerwowego: https://www.redalyc.org/journal/6138/613866083004/613866083004.pdf ; https://core.ac.uk/download/185314611.pdf
- C1. Regulamin medialny Ekstraklasy 2020/21 (kopia na stronie Stali Mielec): https://stalmielec.com/wp-content/uploads/2020/08/Regulamin-medialny-1.pdf
- C2. Regulamin medialny Ekstraklasy 2025/26 (kopia na stronie Wisły Płock): https://wisla-plock.pl/userfiles_2020/Regulamin%20medialny%20ESA%202025-2026.pdf ; Lechia Gdańsk, regulamin medialny 2022/23: https://lechia.pl/wp-content/uploads/2022/06/Regulamin-Mediowy-2022_23.pdf
- D1. C. Foster, „Monitoring training in athletes with reference to overtraining syndrome”, Medicine & Science in Sports & Exercise 30(7), 1164-1168 (Jul 1, 1998), DOI 10.1097/00005768-199807000-00023: https://scinapse.io/papers/2029047988
- D2. J. Afonso i in., przegląd badań nad periodyzacją, Journal of Sports Science and Medicine 16(1): https://jssm.org/16-1-27.p_d_f

Uwaga: źródła A1, B1, B3, C1, C2 i D1 znam z wyników wyszukiwarki (opisy i fragmenty); pełnych tekstów nie otwierałem.
Liczby modelu są szacunkami projektowymi skalibrowanymi symulacją, a nie wartościami z badań.
