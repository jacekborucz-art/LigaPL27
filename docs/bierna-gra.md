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

**Runda 2 (rozdz. 9):** trener, który niczego nie robi, nie może mieć dobrych wyników; po zmianach pasywny gracz
jest średnio ok. 12 pkt pod AI (lepszy sezon w 15 % przypadków), zaangażowany i trafny ok. +2,5 (55 %), zajęty, ale
podejmujący złe decyzje, ok. -9 (25 %). Poniżej opis rundy 1.


- **Pomiar przed zmianami [SYM]** (pełna pętla dni, dzień meczowy jak w interfejsie, 4 kluby, 12-20 sezonów na klub):
  całkiem pasywny gracz był średnio **2,8 pkt** pod tym samym klubem prowadzonym przez AI (błąd 1,6), a pasywny gracz,
  który tylko chodził na konferencje z domyślnymi odpowiedziami, **1,3 pkt nad AI**. Wcześniejsza obserwacja
  „4-7 pkt pod AI” pochodziła ze skryptu, który po meczu zawsze wybierał Pochwałę (interfejs od pewnego czasu zaznacza
  przemowę zalecaną przez asystenta) i nie rozliczał pominiętej konferencji przedmeczowej; docs/balans.md
  („różnica bliska zeru”) mierzył gracza z konferencjami. Obie liczby były prawdziwe dla swoich scenariuszy.
- **Największa dźwignia przed zmianami to prasa:** pominięte konferencje dawały morale kadry ok. 12 (AI ok. 15)
  i zaufanie zarządu ok. 25-35 przy wyniku w okolicy celu; konferencja z domyślnymi odpowiedziami dawała morale
  ok. 18-19 i zaufanie 100. Taktyka, rozmowy i trening nie miały żadnego kosztu.
- **Wdrożone (ograniczone, te same reguły dla AI):** przewidywalność taktyczna (rywale rozpracowują stały schemat,
  jakość zależy od analityka i trenera rywala, do +0,3 pkt atrybutu dla rywala, zaskoczenie do -0,08),
  rozmowy z zawodnikami, którzy ich potrzebują (wrażliwi, nowi, ambitni rezerwowi: powolny spadek morale nie niżej
  niż 9, zaufanie, niezadowolenie), korekta prasy (nasycenie dodatniego morale z konferencji, limit kary zarządu
  za pomijanie), mała monotonia treningu (ten sam akcent ponad 4 tygodnie). Wszystko jest wyjaśnione w grze
  (studio, poczta, Rozmowy).
- **Po zmianach [SYM]:** pasywny gracz **-6,9 pkt** wobec AI (błąd 1,8; cel panelu 6-10 [SZAC]), pasywny z konferencjami
  -4,4, aktywny-lite (plan pod rywala, rozmowy z potrzebującymi, konferencje) **-0,7** (blisko AI). Wariant
  „zaangażowany” w skrypcie (cotygodniowe zebranie, rozmowy na odprawach, rotacja akcentu) wypadł -3,6: więcej
  aktywności nie jest automatycznie lepsze (powtarzane zebrania obniżają zaufanie, zmiana akcentu na fizyczny
  i techniczny obniża zgranie). Przewagi zaangażowanego gracza nad AI ten pomiar nie pokazał (otwarte pytania).
- Mechanika ma wyłącznik do pomiarów `PASSIVE` (`src/training/scouting.js`).

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

Skrypt `harness.mjs` (katalog roboczy agenta, `passive/`): cały sezon 2026/27 od 1 lipca do 8 czerwca na prawdziwej
pętli dni (`processDay`, `continueUntilStop`, decyzje odrzucane). Mecz gracza jak w interfejsie: `startMatchday`,
przejście do odprawy (`leaveStudio`, czyli pominięta albo odbyta konferencja przedmeczowa), odprawa z tonem
zalecanym przez asystenta, „Pokaż wynik” (`skip`, zmiany robi asystent), odprawa w przerwie z zaleceniem, druga
połowa, `finishMatchday`, odprawa pomeczowa z tonem zalecanym (`postAdvice`, tak zaznacza formularz), konferencja
albo Dalej (`closeMatchday`). Te same ziarna we wszystkich scenariuszach; różnica liczona parami (ten sam świat).

| Scenariusz | Co robi gracz |
|---|---|
| a, pasywny | nic poza przyciskami: domyślna taktyka (4-2-3-1, instrukcje domyślne), bez rozmów, domyślny trening, konferencje pomijane |
| b, pasywny z konferencjami | jak a, ale konferencje przed i po meczu z domyślnymi odpowiedziami |
| c, aktywny-lite | jak b, plus plan pod rywala z szansy na wygraną w studiu (poniżej 30 %: nastawienie -1, niski pressing, niska linia; powyżej 55 %: nastawienie +1, wysoki pressing; inaczej domyślny), co tydzień do 3 rozmów z zawodnikami wskazanymi przez asystenta (niskie morale, niezadowolenie, mało gra, długo bez rozmowy), bez powtórki z tym samym zawodnikiem przez 3 tygodnie |
| d, AI | ten sam klub prowadzi AI (graczem jest Śląsk II, klub z innej ligi) |
| e, zaangażowany | jak c, plus zebranie co tydzień (ton do sytuacji), rozmowy na odprawie przedmeczowej wg asystenta, akcent treningu zmieniany co 3 tygodnie |

Przed zmianami (kod z Nov 12, 2026 przed tą zmianą; a, b, d: 20 sezonów na klub, c, e: 12). Punkty w lidze, miejsce,
różnica do AI parami (pkt na sezon), średnie morale całej kadry (środy) i wrażliwych, zgranie na koniec, zaufanie
zarządu na koniec i najniższe, miesiące z decyzją o zwolnieniu (skrypt odrzuca oferty, więc trener zostaje),
relacje z mediami.

| Klub | Scenariusz | Pkt | Miejsce | Różnica do AI | Morale kadry | Morale wrażliwych | Zgranie | Zarząd (min) | Zwolnienia | Media |
|---|---|---|---|---|---|---|---|---|---|---|
| Legia (EK, 1. siła) | d AI | 69,5 | 1,8 | | 16,3 | 16,0 | 95,8 | | | |
| | a | 64,9 | 2,8 | -4,7 | 14,7 | 13,1 | 97,5 | 40 (28) | 1,9 | 10 |
| | b | 67,3 | 2,4 | -2,2 | 18,4 | 18,4 | 97,2 | 100 (60) | 0 | 92 |
| | c | 66,5 | 2,5 | -1,8 | 18,6 | 18,6 | 85,1 | 99 (60) | 0 | 92 |
| Widzew (EK, 5.) | d AI | 54,5 | 6,2 | | 15,4 | 15,4 | 95,8 | | | |
| | a | 51,0 | 7,5 | -3,5 | 12,4 | 10,7 | 97,2 | 43 (25) | 2,3 | 10 |
| | b | 52,0 | 7,0 | -2,5 | 18,0 | 18,1 | 97,2 | 99 (60) | 0 | 90 |
| | c | 51,3 | 7,1 | -2,3 | 18,3 | 18,3 | 84,8 | 100 (60) | 0 | 90 |
| GKS Katowice (EK, 16.) | d AI | 35,5 | 13,4 | | 13,8 | 13,6 | 95,8 | | | |
| | a | 34,5 | 14,3 | -0,9 | 10,1 | 8,5 | 97,4 | 55 (36) | 0,9 | 8 |
| | b | 39,7 | 12,4 | +4,3 | 18,1 | 18,3 | 97,2 | 100 (60) | 0 | 92 |
| | c | 35,8 | 13,8 | +4,1 | 18,3 | 18,5 | 85,4 | 100 (60) | 0 | 91 |
| Polonia Warszawa (1 Liga, 9.) | d AI | 48,1 | 8,2 | | 13,8 | 13,4 | 95,8 | | | |
| | a | 46,0 | 9,3 | -2,1 | 11,5 | 10,0 | 97,5 | 65 (37) | 0,7 | 10 |
| | b | 53,8 | 5,5 | +5,7 | 17,7 | 17,8 | 97,6 | 100 (60) | 0 | 93 |
| | c | 49,0 | 8,7 | +1,3 | 17,9 | 17,9 | 86,5 | 100 (60) | 0 | 92 |

Średnio (parami, wszystkie kluby): a **-2,8** (błąd 1,6), b **+1,3** (1,4), c **+0,3** (1,9), e +0,3 (2,1).
Odchylenie standardowe punktów klubu w sezonie to 8-10, więc pojedyncze kluby różnią się o kilka punktów w szumie.

Wnioski panelu z pomiaru:

1. Przed zmianami całkiem pasywny gracz tracił do AI mało i prawie wyłącznie przez pominięte konferencje
   (b - a: +4,1 pkt; morale kadry 12 wobec 18). Stała taktyka, brak rozmów i ten sam trening nie kosztowały nic.
2. Konferencja z domyślnymi odpowiedziami była za hojna: morale ok. 18-19, wyżej niż w klubach AI (ok. 15), które
   konferencji nie mają. Pominięcie konferencji było za to drogie dla zarządu: pasywny trener Widzewa i Legii, który
   kończy w okolicy celu, miewał zaufanie poniżej progu zwolnienia.
3. Zmienianie instrukcji przed każdym meczem (c) kosztowało zgranie (85 wobec 97: instrukcje -7 za każdą zmianę),
   więc gracz, który robi to, co robią dobrzy trenerzy, był karany, a pasywny nie.

## 4. Model

### 4.1 Przewidywalność taktyczna (`src/training/scouting.js`)

Odcisk taktyczny drużyny na start meczu: ustawienie i kluczowe instrukcje, z wagami podobieństwa: ustawienie 0,3
(ta sama rodzina 4-4-2 połowa), pressing 0,15, podania 0,15, linia obrony 0,12, nastawienie 0,12 (sąsiednie
nastawienie jedna trzecia), tempo 0,08, kontratak 0,08. Zmiany w trakcie meczu nie wchodzą do odcisku: przy
„Pokaż wynik” robi je asystent tym samym kodem co trener AI, a analitycy przygotowują rywala na plan wyjściowy.

| Krok | Wzór [SZAC] |
|---|---|
| Historia | ostatnie 8 meczów o stawkę klubu gracza (sparingi nie), waga meczu sprzed k spotkań 0,85^k; zapis w `game.scouting.log` |
| Przewidywany schemat | odcisk z historii najbardziej podobny do pozostałych (suma wag x podobieństwo²) |
| Powtarzalność c | średnia ważona podobieństwa² do przewidywanego schematu (stały schemat: 1; trzy plany na zmianę: ok. 0,5) |
| Obraz rywala r | min(1, liczba meczów / 5): po 5 meczach pełny |
| Trafienie m | podobieństwo² dzisiejszego planu do przewidywanego |
| Znajomość schematu | 0,45 x (1 - r) + r x c x m (bez historii neutralna 0,45: nowa drużyna, nowy klub, stary zapis) |
| Klub AI | 0,45 - 0,2 s(SKL) - 0,1 s(TAK), od 0,25 do 0,7 (trener AI dobiera plan pod rywala: aiPlan.js, coachTerm) |
| Jakość analizy | (analityk - 1,5) / 13,5, x(1 + 0,25 s(SKL) + 0,1 s(TAK)) trenera klubu AI, od 0,15 do 1,3 |
| Premia | 0,4 x jakość x (znajomość - 0,45), od -0,08 (zaskoczenie) do +0,3 punktu atrybutu na zawodnika w dniu meczu |

Premia trafia do tego samego składnika co analiza wideo rywala (`trainingPrep`, `prepTerm` i `aiPrepToday`
w `cohesion.js`), więc działa w pełnym silniku i w szybkiej symulacji. Ta sama reguła dla wszystkich par: klub AI
analizujący gracza, gracz analizujący klub AI (premia do analizy gracza, gdy plan treningu ma analizę wideo) i dwa
kluby AI w tle. Przeciętny trener AI ma znajomość 0,45, więc mecze AI kontra AI średnio się nie zmieniają, a słabsi
trenerzy niższych lig są trochę łatwiejsi do rozpracowania (2 Liga: premia rywala ok. +0,01-0,04).

Przykłady dla pasywnego gracza (stały schemat od 5 meczów): rywal z analitykiem 17 i dobrym trenerem (Legia, Lech)
ok. +0,25, przeciętny rywal z Ekstraklasy (analityk 13) ok. +0,19, klub 2 Ligi (analityk 5) ok. +0,06. Dla porównania
cała analiza wideo to 0,04 + 0,006 q (ok. 0,1), a 1 punkt atrybutu całej drużyny to ok. 14 pkt w sezonie
(docs/balans.md). Ten sam gracz, który zmienia plan pod rywala (trzy plany), ma premię rywala bliską zera, a gdy
po długiej rutynie nagle zagra inaczej, rywal traci do -0,08.

Zmiana instrukcji kosztowała zgranie (instrukcje -7 za każdą zmienioną); przy planie granym w ostatnich 8 meczach
koszt jest x0,3 (plan B jest przećwiczony), więc urozmaicenie nie jest karane podwójnie.

### 4.2 Rozmowy z zawodnikami, którzy ich potrzebują (`src/career/attention.js`)

Kto potrzebuje rozmowy (potrzeba 0-1): Wrażliwy 1, ambitny rezerwowy 1 (Ambitny albo ambicja lub potrzeba gry
od 14, udział minut poniżej 35 % najczęściej grającego, od 6 meczów klubu, wiek od 20 lat), nowy w klubie 0,8
(aklimatyzacja albo transfer w ostatnich 60 dniach). Pozostali (Spokojny, Lider, Narwaniec bez tych cech) nie
potrzebują regularnych rozmów. Zawodnik z urazem dłuższym niż 60 dni jest pod opieką sztabu medycznego.

| Element | Wartość [SZAC] |
|---|---|
| Karencja | 21 dni bez rozmowy bez skutków |
| Narastanie | przez kolejne 28 dni do pełnego zaniedbania |
| Morale | co poniedziałek -0,45 x potrzeba x narastanie (dryf tygodniowy do 12 daje +0,3, więc netto ok. -0,15 w tygodniu), nie poniżej 9 |
| Zaufanie do trenera | co 4 tygodnie pełnego zaniedbania -0,5 (`applyTrust`, tag „zaniedbanie”) |
| Ambitny rezerwowy | po 12 tygodniach zaniedbania szansa 8 % w tygodniu, że staje się niezadowolony |
| Co liczy się jako uwaga | rozmowa w Kadra, Rozmowy (dowolny temat), rozmowa indywidualna na odprawie przed meczem, w przerwie albo po meczu; zebranie drużyny jak rozmowa sprzed dwa razy dłuższego czasu |
| Rozmowa po długim czekaniu | „Podbuduj” działa lepiej (z = 1,2, Wrażliwy 1,6), bo zawodnik na nią czekał |
| Kluby AI | trener rozmawia z każdym potrzebującym z szansą 0,3 + 0,2 s(MOT) w tygodniu (0,1-0,5), reszta reguły ta sama |

Przypomnienie asystenta w poczcie (najwyżej 3 nazwiska, o tym samym zawodniku co 6 tygodni) i powód w Kadra,
Rozmowy. Licznik startuje od pierwszego poniedziałku gry (`game.attStart`), stan zawodnika: `p.att = { t, m, w, h }`.

### 4.3 Prasa (`src/match/press.js`, korekta)

Pomiar przed zmianami pokazał, że prasa była największą dźwignią w obie strony: pasywny gracz, który pomijał
konferencje, miał morale kadry ok. 12 (AI ok. 15), zaufanie zarządu spadało do ok. 25-35 i trener Widzewa czy Legii
grający w okolicy celu bywał zwalniany; ten sam gracz, który chodził na konferencje i klikał domyślne odpowiedzi,
miał morale ok. 18-19 (wyżej niż AI, które konferencji nie ma), relacje z mediami ok. 92 i zaufanie zarządu 100.
Samo pojawienie się w sali z domyślnymi odpowiedziami dawało ok. +4 pkt w sezonie wobec pomijania.

Korekta (ostrożna, kary za pomijanie bez zmian w szatni i w mediach):

- dodatni wpływ prasy na morale ma nasycenie: pełny do morale 12, potem maleje liniowo do zera przy 19
  (`pressMoraleDelta(..., morale)`, `PRESS_HEADROOM`); ujemny bez zmian;
- limity jednej konferencji: po meczu od -1,5 do +0,7 (było +1,0), przed meczem od -0,8 do +0,4 (było +0,6);
- ocena zarządu: pomijanie konferencji najwyżej -1,2 w miesiącu (było bez limitu w ramach łącznego -2,5);
  relacje z mediami i klimat prasy liczą się jak dotąd. Unikanie mediów jest widoczne w ocenie, ale samo nie zwalnia
  trenera, który realizuje cel.

### 4.4 Monotonia treningu (`src/training/variety.js`)

| Element | Wartość [SZAC] |
|---|---|
| Licznik | co poniedziałek +1 tydzień tego samego akcentu planu; zmiana akcentu albo obóz zeruje, co najmniej 2 ręcznie zmienione dni w tygodniu zdejmują 2 tygodnie |
| Znużenie | 0 przez pierwsze 4 tygodnie, potem rośnie do 1 po 12 tygodniach |
| Skutki przy pełnym znużeniu | dodatnie morale z zajęć x0,5, -0,01 morale za dzień zajęć, bodziec rozwojowy x0,85 |
| Wiadomość | raz na serię od znużenia 0,5 (8 tygodni): „Zawodnicy są znużeni treningiem” |
| Kluby AI | trener zmienia akcent co 6 - 3 s(TRE) tygodni (3-10), na zmianę akcent swojego typu i drugi (zrównoważony albo taktyczny); ta sama reguła znużenia |

Skutek celowo mały: przy stałym dryfie morale +0,3 w tygodniu w kierunku 12 znużenie przesuwa morale o ułamek punktu,
a rozwój młodych o kilka procent. Pierwsza wersja (morale z zajęć x0,4 i -0,03 za dzień) obniżała morale pasywnej
kadry o ok. 2,5 punktu w jednym sezonie [SYM] i została złagodzona.

## 5. Kalibracja po zmianach

Ten sam skrypt i te same ziarna (1-12), kod po zmianie (z równoległymi zmianami innych agentów w trenerach AI,
właścicielach i pucharach, więc baza AI też się trochę przesunęła). 12 sezonów na klub i scenariusz.

| Klub | Scenariusz | Pkt | Miejsce | Różnica do AI | Morale kadry | Morale wrażliwych | Zgranie | Zarząd (min) | Zwolnienia | Media | Niezadowoleni |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Legia | d AI | 66,6 | 1,8 | | 15,9 | 15,8 | 95,8 | | | | 0,1 |
| | a | 63,5 | 3,4 | -3,1 | 12,7 | 9,8 | 97,3 | 33 (20) | 2,0 | 9 | 4,1 |
| | b | 64,5 | 2,4 | -2,1 | 16,7 | 15,9 | 97,4 | 100 (60) | 0 | 92 | 4,4 |
| | c | 70,6 | 1,5 | +4,0 | 18,0 | 18,3 | 95,7 | 100 (60) | 0 | 93 | 0,1 |
| | e | 71,3 | 1,8 | +4,7 | 17,4 | 17,5 | 93,2 | 100 (60) | 0 | 92 | 0 |
| Widzew | d AI | 52,6 | 6,8 | | 15,0 | 14,6 | 95,8 | | | | 0,1 |
| | a | 42,7 | 10,9 | -9,9 | 9,6 | 6,6 | 97,4 | 16 (10) | 4,0 | 9 | 3,9 |
| | b | 43,8 | 10,0 | -8,8 | 15,1 | 14,1 | 97,4 | 99 (60) | 0 | 89 | 3,8 |
| | c | 50,5 | 8,0 | -2,1 | 17,0 | 17,5 | 91,3 | 99 (60) | 0 | 90 | 0,1 |
| | e | 46,1 | 9,2 | -6,5 | 14,4 | 14,7 | 87,0 | 99 (59) | 0 | 90 | 0 |
| GKS Katowice | d AI | 33,7 | 14,7 | | 13,5 | 13,2 | 95,8 | | | | 0,1 |
| | a | 30,8 | 15,9 | -2,9 | 8,2 | 6,7 | 97,2 | 43 (29) | 1,7 | 8 | 3,9 |
| | b | 33,6 | 14,2 | -0,1 | 14,7 | 14,3 | 97,3 | 100 (60) | 0 | 91 | 4,2 |
| | c | 33,2 | 14,8 | -0,5 | 15,7 | 16,6 | 92,6 | 100 (60) | 0 | 91 | 0 |
| | e | 30,7 | 15,7 | -3,0 | 15,3 | 16,4 | 89,1 | 100 (60) | 0 | 90 | 0 |
| Polonia Warszawa | d AI | 51,5 | 6,7 | | 14,4 | 13,9 | 95,8 | | | | 0,1 |
| | a | 39,8 | 12,1 | -11,7 | 9,4 | 7,2 | 97,5 | 49 (29) | 1,3 | 8 | 3,6 |
| | b | 44,8 | 10,2 | -6,8 | 15,1 | 14,3 | 97,6 | 100 (60) | 0 | 93 | 3,6 |
| | c | 47,5 | 8,4 | -4,0 | 16,4 | 17,2 | 90,5 | 100 (60) | 0 | 93 | 0 |
| | e | 41,8 | 11,8 | -9,7 | 13,5 | 14,1 | 85,6 | 100 (60) | 0 | 93 | 0 |

Średnio (parami, 4 kluby, 48 sezonów na scenariusz):

| Scenariusz | Przed | Po | Cel panelu [SZAC] |
|---|---|---|---|
| a, pasywny | -2,8 (błąd 1,6) | **-6,9** (1,8) | od -6 do -10 |
| b, pasywny z konferencjami | +1,3 (1,4) | -4,4 (1,5) | pod AI, ale łagodniej niż a |
| c, aktywny-lite | +0,3 (1,9) | **-0,7** (1,7) | ok. 0 |
| e, zaangażowany (skrypt) | +0,3 (2,1) | -3,6 (1,8) | powyżej 0 (nie osiągnięte tym skryptem) |

Rozbicie scenariusza a (Widzew i GKS, 24 sezony, duży szum): bez przewidywalności taktycznej -4,5 pkt wobec AI,
bez rozmów i monotonii -3,4 pkt, z całością -6,4 pkt; czyli przewidywalność ok. -2 pkt, rozmowy i monotonia razem
ok. -3 pkt (głównie przez morale wrażliwych i nowych), korekta prasy (b przed i po) ok. -2,5 pkt dla gracza
z konferencjami.

Co jeszcze widać:

- Morale pasywnej kadry spada do ok. 8-13 (AI 13,5-16), wrażliwych do ok. 7-10; zaniedbanie samo zatrzymuje się
  na 9, resztę dokładają porażki i nagonka prasy po pominiętych konferencjach. Pasywny gracz kończy sezon z ok. 4
  niezadowolonymi ambitnymi rezerwowymi (aktywny: 0).
- Zgranie gracza zmieniającego plan pod rywala: 90-96 (przed zmianą 85), bo przećwiczony plan B kosztuje mniej.
- Zarząd: pasywny trener Widzewa (cel 6. miejsce, średnio 10,9.) ma w części sezonów zaufanie poniżej progu zwolnienia;
  przed zmianą miał lepsze wyniki i rzadziej spadał pod próg. Gracz z konferencjami ma zaufanie 100.
- Czas: system rozmów to ok. 3 ms na tydzień gry, premia analizy liczona raz na dzień; czas sezonu bez zmiany
  w granicach pomiaru.

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

| Plik | Zmiana |
|---|---|
| `src/training/scouting.js` (nowy) | odcisk taktyczny, podobieństwo, dziennik meczów gracza, znajomość schematu (gracz i AI), jakość analizy, premia `scoutEdge`, notka w studiu, wiadomość analityka, plan przećwiczony, wyłącznik `PASSIVE` |
| `src/training/cohesion.js` | `prepTerm` i `aiPrepToday`: premia za schemat rywala dla gracza i klubów AI (pamięć dnia z kluczem taktyki gracza); `syncTacticsChange`: plan B x0,3 |
| `src/career/attention.js` (nowy) | potrzeba rozmowy, zaniedbanie, system tygodnia (gracz i kluby AI), przypomnienia asystenta |
| `src/career/teamTalks.js` | rozmowa i zebranie zapisują uwagę; podpowiedź „długo bez rozmowy”; „Podbuduj” po długim czekaniu działa lepiej |
| `src/training/variety.js` (nowy) | licznik tego samego akcentu, znużenie i jego skutki, rotacja akcentu trenera AI, notka |
| `src/training/index.js`, `sessions.js`, `aiClubs.js` | krok tygodniowy znużenia (gracz i AI), wiadomość o znużeniu, skutki w zajęciach gracza i AI, akcent AI z rotacji |
| `src/match/matchday.js` | zapis schematu po meczu o stawkę, wiadomość analityka, notka w studiu, rozmowy z odpraw jako uwaga, nasycenie morale z prasy |
| `src/match/press.js` | `pressMoraleDelta(..., morale)` z nasyceniem, nowe limity konferencji, limit kary zarządu za pomijanie |
| `src/ui/matchdayView.js` | notka o przygotowaniu rywala w raporcie asystenta (jedna linia) |
| `src/ui/talksView.js` | licznik „czeka na rozmowę” i opis, kto potrzebuje rozmów |
| `tests/passivePlay.test.mjs` (nowy) | 10 testów, niżej |
| `tests/balance.test.mjs` | nowy strażnik „Gra bierna” (zamierzona różnica), reszta bez zmian |
| `tests/training.test.mjs` | analiza wideo gracza zawiera małą premię za schemat rywala AI |
| `docs/balans.md` | odnośnik do zamierzonej różnicy |

Testy `tests/passivePlay.test.mjs`: powtarzany schemat podnosi premię rywala w granicach (i daje jedno ostrzeżenie
analityka oraz notkę w studiu); urozmaicony plan daje premię wyraźnie niższą, nagła zmiana planu daje zaskoczenie
w granicach; analityk i trener rywala skalują premię; ta sama reguła dla klubów AI i premia w dniu meczu
(`prepTerm`); przećwiczony plan B kosztuje mniej zgrania; zaniedbany wrażliwy zawodnik traci morale powoli i od
4. tygodnia, rozmowa zatrzymuje spadek; zaniedbanie nie schodzi poniżej progu, spokojny zawodnik rozmów nie
potrzebuje; trenerzy AI rozmawiają z zawodnikami, wynik deterministyczny; znużenie treningiem rośnie powoli,
jest ograniczone, znika po zmianie akcentu lub zmianach w planie, trener AI zmienia akcent; stary zapis bez stanu
działa, stan przechodzi przez JSON, nowy klub zaczyna od neutralnej znajomości.

Zapis gry: `game.scouting` (do 10 odcisków, ok. 1 KB), `game.attStart`, `game.attWeek`, `p.att` u zawodników
z potrzebą rozmowy (kilka pól), `c.var` w stanie treningu klubu (2-3 pola).

## 8. Otwarte pytania do decyzji

1. **Siła kary.** Pasywny gracz -6,9 pkt jest w dolnej części przedziału 6-10. Mocniej: `SCOUT.max` (0,4) albo
   `ATTN.week` (0,45). Słabiej: `SCOUT.edgeMax` (0,3) albo próg `ATTN.floor` (9).
2. **Zwolnienia pasywnego gracza.** W dużym klubie z wysokim celem (Widzew, Legia) pasywny gracz bywa pod progiem
   zwolnienia już w pierwszym sezonie. To realistyczne w Ekstraklasie, ale dla gracza „na luzie” może być za ostre.
   Możliwość: pierwszy sezon w klubie z łagodniejszym progiem albo ostrzeżenie zarządu przed decyzją.
3. **Zaangażowany gracz nie wypadł lepiej niż AI** w skrypcie (cotygodniowe zebrania obniżają zaufanie zawodników,
   akcent fizyczny i techniczny obniża zgranie). Czy zebranie raz w tygodniu ma być tak ryzykowne (istniejąca
   mechanika powtórzeń w `teamTalks.js`)? Lepszy gracz w testach ręcznych powinien to sprawdzić.
4. **Prasa a AI.** Kluby AI nie mają konferencji ani klimatu prasy. Po korekcie gracz z konferencjami ma morale
   ok. 15-18, czyli w okolicy AI albo trochę wyżej. Pełna symetria wymagałaby prostego klimatu prasy dla klubów AI.
5. **Odcisk taktyczny** to ustawienie i instrukcje na start meczu. Nie obejmuje wariantów stałych fragmentów ani
   wykonawców (silnik ich nie różnicuje); gdy pojawią się w silniku, mogą wejść do odcisku z własną wagą.
6. **Przewidywalność klubów AI** jest liczona z atrybutów trenera, a nie z dziennika ich meczów (mecze w tle nie
   mają taktyki). Przy zmianie trenera (rynek trenerów innego agenta) wartość zmienia się od razu z nowym profilem.
7. **Liczba niezadowolonych** u pasywnego gracza (ok. 4 na koniec sezonu) jest wyraźna; flaga nie zmienia siły
   w meczu, ale może prowadzić do próśb o transfer. Do obserwacji w dłuższej karierze.

## 9. Runda 2: czy trener, który nic nie robi, może osiągać dobre wyniki

Stan na Nov 12, 2026. Uwaga użytkownika po pierwszej rundzie: 6-9 pkt straty za całkowitą bierność to za mało, a praca
w klubie ma się opłacać lekko, ale odczuwalnie. Druga uwaga: nagrodą ma być wyższe prawdopodobieństwo lepszego sezonu,
a nie gwarantowane punkty; efekt zależy od klubu, kadry, trafności decyzji i losu.

### 9.1 Pytanie do ekspertów i odpowiedź

**Czy trener, który pozornie nic nie robi i oddaje wszystko asystentowi, może mieć dobre wyniki?**

**Trener UEFA Pro.** Delegowanie to nie nieobecność. Alex Ferguson przez lata nie prowadził treningów, robili to
asystenci, ale sam wybierał skład, podejmował kluczowe decyzje meczowe i trzymał organizację klubu w ręku [ŹR E1].
Carlo Ancelotti planuje zajęcia razem ze sztabem i deleguje wykonanie, bo ufa ludziom, których dobrał [ŹR E2]. Obaj
byli w klubie obecni każdego dnia: rozmowy, decyzje, media. Przykładów trenera, który niczego nie robi i odnosi
sukcesy, nie znam; w polskich realiach taki trener nie dotrwałby do końca rundy. Gra „Pokaż wynik” to w praktyce
trener, który oddał ławkę asystentowi, a do tego nie rozmawia z zawodnikami i nie przychodzi na konferencje.

**Psycholog sportu.** Brak trenera szatnia odbiera jako brak przywództwa. Zawodnicy pytają asystenta, kto decyduje,
liderzy szatni przejmują ster, tworzą się grupy. Najczęściej opisywany przypadek z ostatnich lat to Manchester United
w okresie przejściowym 2021/22: relacje prasowe mówiły o podzielonej szatni, braku wiary i grupach wpływu [ŹR E3]
(to doniesienia ze źródeł anonimowych, nie fakty). Badania nad stylami przywództwa trenera wiążą wsparcie,
informację zwrotną i demokratyczny styl z lepszą spójnością i satysfakcją zawodników [ŹR E4]; stylu „zostawiam
wszystko” w tych przeglądach praktycznie nie ma, bo w zawodowym sporcie prawie się nie zdarza.

**Matematyk (pomiar).** Najlepsze dane o wartości trenera pochodzą z Bundesligi: trener z 80. percentyla umiejętności
zdobywa średnio o ok. 0,30 pkt na mecz więcej niż trener z 20. percentyla (ok. 18 % średniej punktów), a z 75.
wobec 25. percentyla o ok. 0,25 pkt [ŹR E5]. W sezonie 34 kolejek to ok. 10 i 8,5 pkt. Zmiana trenera przez zwolnienie
daje małą, ale istotną poprawę [ŹR E6]. Trener AI w grze to trener przeciętny (punkt neutralny atrybutów), więc:

- trener, który nie wykonuje żadnej części pracy, powinien wypaść co najmniej jak trener z dolnych 20 % plus utrata
  szatni, czyli ok. 0,3-0,4 pkt na mecz pod przeciętnym: **ok. 10-14 pkt w sezonie pod tym samym klubem pod AI** [SZAC];
- dobry, zaangażowany trener to ok. 60-75. percentyl: **średnio ok. +2-4 pkt**, ale przy odchyleniu sezonu 8-10 pkt
  oznacza to tylko większą szansę, nie pewność [SZAC];
- gracz aktywny „po łebkach” między nimi, a gracz bardzo zajęty, ale podejmujący złe decyzje, blisko pasywnego.

**Wniosek panelu.** Trener może oddać asystentom wykonanie (trening, analizy, część ławki), ale nie może oddać decyzji,
ludzi i reprezentowania klubu. Kto oddaje wszystko, traci szatnię. Cele dla gry [SZAC]:

| Scenariusz | Średnio wobec AI | Szansa na sezon lepszy niż AI |
|---|---|---|
| a, nic nie robi | od -10 do -14 | ok. 10-20 % |
| b, nic nie robi, ale chodzi na konferencje | między a i c | ok. 25-35 % |
| c, aktywny-lite | ok. -2 do 0 | ok. 40-50 % |
| e, zaangażowany, trafne decyzje | ok. +2 do +4 | ok. 55-65 % |
| f, zajęty, ale złe decyzje | blisko a | ok. 15-30 % |

Ograniczenie: klub z czołówki nie spada z ligi z samej bierności (Legia pasywna dalej kończy w pierwszej piątce).

### 9.2 Co się zmieniło

1. **Autorytet trenera** (`src/career/authority.js`, nowy). Wartość 0-1, nowy trener 0,5. Co poniedziałek zbliża się
   o 35 % do celu `0,1 + 0,85 x aktywność` z ostatnich 4 tygodni (długa przerwa bez meczów niczego nie zmienia).
   Aktywność liczy **trafność**, nie kliknięcia: trafne rozmowy indywidualne minus nietrafione (waga 0,45, pełna przy 4
   w 4 tygodnie; obojętne liczą się w 30 %), zebrania dobrze przyjęte minus źle przyjęte (0,2, pełna przy 2),
   konferencje (0,35: spokojna 1, szkodliwa 0,6, pominięta 0). Rozmowy na odprawach liczą się według reakcji
   zawodnika. Wpływ w meczu: poniżej 0,5 do -0,3 pkt atrybutu na zawodnika (utrata szatni, bez zależności od kadry),
   powyżej 0,5 do +0,2 i razy siła kadry (`0,5 + (L - 9) / 6`, od 0,5 do 1,2: lepsza kadra lepiej wykorzystuje dobrą
   atmosferę). Kluby AI: trener AI jest w klubie obecny, autorytet 0,5, premia 0; różnice trenerów AI są w atrybutach.
   Wiadomości asystenta: „Szatnia czuje brak trenera” (poniżej 0,3) i „Drużyna czuje rękę trenera” (powyżej 0,75).
   Dane do widoku Kadra, Rozmowy: `authoritySummary(game)` (etykieta, poziom, składniki, podpowiedź).
2. **Zebranie bez kary za samo powtarzanie** (`teamTalks.js`). Wcześniej ten sam ton trzy tygodnie z rzędu odejmował
   0,6 za każde powtórzenie, więc trafny ton powtarzany co tydzień zaczynał obniżać morale i zaufanie. To była główna
   przyczyna wyniku -3,6 „zaangażowanego” skryptu w rundzie 1 (zaufanie zawodników 28-67 wobec ok. 90). Teraz dodatni
   efekt maleje do 25 % (powtórzenie działa słabiej), a szkodzi tylko ton źle dobrany do sytuacji i osobowości.
3. **Mocniejsza przewidywalność** (`scouting.js`): premia przy pełnej znajomości schematu 0,6 (było 0,4), najwyżej +0,4
   (było +0,3).
4. **Skrypt zaangażowanego gracza** (pomiar): w rundzie 1 robił rzeczy, których dobry trener nie robi (zebranie co tydzień
   z tym samym tonem, akcent fizyczny i techniczny bez zajęć taktycznych). Teraz: zebranie co 2 tygodnie w tonie do
   wyników, rozmowy z tymi, których wskazuje asystent (bez powtórki z tym samym przez 3 tygodnie), rozmowy na odprawie
   z rady asystenta, plan pod rywala (z równym rywalem u siebie wysoki pressing), akcent zmieniany co 3 tygodnie
   (zrównoważony, taktyczny, zrównoważony, stałe fragmenty), obozy letni i zimowy, konferencje.
5. **Nowy scenariusz f: zajęty, ale źle** (pomiar): plany odwrotne do sytuacji (z faworytem zamurowanie, ze słabszym
   wszystko do ataku i wysoka linia, długie piłki), rozmowy z przypadkowymi zawodnikami nie na temat (wrażliwym
   „wymagaj”), zebrania w złym tonie (krytyka po dobrej serii), akcent fizyczny i techniczny, konferencje z trzecią
   odpowiedzią. Pokazuje, że sama aktywność się nie opłaca.

### 9.3 Pomiar przed i po (te same ziarna 1-20, 4 kluby, różnica parami do tego samego klubu pod AI)

„Przed” to kod z commita 15e636b (runda 1), „po” to runda 2. Ten sam skrypt w obu (także ulepszony scenariusz e i nowy f).

| Scenariusz | Przed: lepszy niż AI | Przed: p10 / p50 / p90 | Przed: średnia (błąd) | Po: lepszy niż AI | Po: lepszy o 5+ | Po: gorszy o 5+ | Po: p10 / p50 / p90 | Po: średnia (błąd) |
|---|---|---|---|---|---|---|---|---|
| a, nic nie robi | 34% | -22,1 / -4,5 / 11,1 | -5,3 (1,5) | 15% | 9% | 73% | -26,1 / -13,0 / 3,1 | -12,0 (1,3) |
| b, nic + konferencje | 44% | -19,1 / -2,5 / 11,1 | -3,3 (1,4) | 31% | 18% | 50% | -19,1 / -4,5 / 11,0 | -4,5 (1,3) |
| c, aktywny-lite | 40% | -15,1 / -2,0 / 12,2 | -1,8 (1,4) | 41% | 34% | 44% | -14,1 / -4,0 / 12,1 | -1,2 (1,3) |
| e, zaangażowany | 51% | -16,2 / 1,5 / 20,0 | 2,6 (1,6) | 55% | 44% | 28% | -11,3 / 2,5 / 17,1 | 2,5 (1,5) |
| f, zajęty, ale źle | 23% | -25,2 / -10,5 / 6,1 | -10,5 (1,5) | 25% | 15% | 61% | -27,2 / -9,5 / 7,0 | -9,3 (1,4) |

Wniosek z porównania: ulepszony skrypt zaangażowanego gracza (zebrania co 2 tygodnie, spójny trening, obozy) już na
kodzie rundy 1 daje +2,6 pkt; wynik -3,6 z rundy 1 był więc głównie skutkiem złych decyzji starego skryptu (to samo
pokazuje scenariusz f) i kary za samo powtarzanie zebrania. Zmiany rundy 2 przede wszystkim powiększyły stratę gracza,
który nic nie robi (z -5,3 do -12,0, szansa na lepszy sezon z 34 % do 15 %), i lekko podniosły szansę zaangażowanego
(z 51 % do 55 %). Gracz zajęty, ale podejmujący złe decyzje, zostaje blisko pasywnego w obu wersjach.

Po zmianach, szczegółowo (punkty sezonu gracza minus punkty tego samego klubu pod AI w tym samym świecie):

| Klub, scenariusz | n | lepszy niż AI | lepszy o 5+ | gorszy o 5+ | p10 / p50 / p90 | średnia (błąd) |
|---|---|---|---|---|---|---|
| Legia, a | 20 | 15% | 10% | 65% | -25,2 / -10,5 / 3,3 | -10,8 (2,4) |
| Widzew, a | 20 | 10% | 5% | 85% | -26,2 / -16,5 / 0,4 | -15,7 (2,5) |
| GKS Katowice, a | 20 | 20% | 10% | 65% | -29,1 / -9,5 / 1,6 | -10,7 (2,7) |
| Polonia Warszawa, a | 20 | 15% | 10% | 75% | -23,2 / -11,0 / 3,2 | -11,0 (2,8) |
| **wszystkie, a** | 80 | 15% | 9% | 73% | -26,1 / -13,0 / 3,1 | -12,0 (1,3) |
| Legia, b | 20 | 20% | 5% | 50% | -21,3 / -6,5 / 1,3 | -8,1 (2,1) |
| Widzew, b | 20 | 15% | 15% | 65% | -21,2 / -6,5 / 11,0 | -8,5 (2,9) |
| GKS Katowice, b | 20 | 50% | 30% | 45% | -13,3 / 0,0 / 16,2 | 0,0 (2,6) |
| Polonia Warszawa, b | 20 | 40% | 20% | 40% | -11,6 / -1,0 / 10,4 | -1,5 (2,4) |
| **wszystkie, b** | 80 | 31% | 18% | 50% | -19,1 / -4,5 / 11,0 | -4,5 (1,3) |
| Legia, c | 20 | 45% | 45% | 30% | -10,2 / 0,0 / 10,5 | 1,4 (2,2) |
| Widzew, c | 20 | 45% | 30% | 50% | -20,9 / -4,0 / 11,1 | -4,8 (3,0) |
| GKS Katowice, c | 20 | 40% | 30% | 55% | -11,3 / -5,5 / 14,0 | -0,3 (2,4) |
| Polonia Warszawa, c | 20 | 35% | 30% | 40% | -14,2 / -4,0 / 11,9 | -1,2 (2,4) |
| **wszystkie, c** | 80 | 41% | 34% | 44% | -14,1 / -4,0 / 12,1 | -1,2 (1,3) |
| Legia, e | 20 | 40% | 35% | 40% | -21,2 / -1,0 / 14,2 | -2,4 (3,0) |
| Widzew, e | 20 | 50% | 35% | 35% | -15,5 / 0,5 / 16,3 | 0,1 (3,1) |
| GKS Katowice, e | 20 | 55% | 50% | 15% | -10,0 / 4,5 / 17,6 | 4,9 (2,4) |
| Polonia Warszawa, e | 20 | 75% | 55% | 20% | -10,1 / 7,0 / 21,1 | 7,3 (2,9) |
| **wszystkie, e** | 80 | 55% | 44% | 28% | -11,3 / 2,5 / 17,1 | 2,5 (1,5) |
| Legia, f | 20 | 5% | 0% | 70% | -30,2 / -14,5 / 0,0 | -14,6 (2,5) |
| Widzew, f | 20 | 20% | 5% | 70% | -29,1 / -15,0 / 2,2 | -13,2 (2,7) |
| GKS Katowice, f | 20 | 40% | 35% | 55% | -20,1 / -9,0 / 9,2 | -5,0 (2,7) |
| Polonia Warszawa, f | 20 | 35% | 20% | 50% | -17,2 / -4,5 / 5,2 | -4,3 (2,9) |
| **wszystkie, f** | 80 | 25% | 15% | 61% | -27,2 / -9,5 / 7,0 | -9,3 (1,4) |

Wskaźniki sezonu (po zmianach, 20 sezonów na klub; autorytet na koniec sezonu, zarząd: najniższe zaufanie w sezonie):

| Klub | Scenariusz | Pkt | Miejsce | Morale kadry | Zgranie | Zarząd (min) | Niezadowoleni | Autorytet |
|---|---|---|---|---|---|---|---|---|
| gks-katowice | d AI | 35,0 | 14,1 | 13,2 | 95,8 |  | 0,0 | 0,5 (neutralny) |
| gks-katowice | a | 24,3 | 16,8 | 6,4 | 97,3 | 18,4 | 3,8 | 0,1 |
| gks-katowice | b | 35,0 | 14,2 | 14,6 | 97,3 | 60,0 | 3,7 | 0,4 |
| gks-katowice | c | 34,6 | 14,2 | 15,9 | 90,8 | 60,0 | 0,0 | 0,8 |
| gks-katowice | e | 39,9 | 12,3 | 17,7 | 87,3 | 60,0 | 0,0 | 0,9 |
| legia | d AI | 68,8 | 2,0 | 16,2 | 95,8 |  | 0,1 | 0,5 (neutralny) |
| legia | a | 58,0 | 4,8 | 12,3 | 97,4 | 24,3 | 3,9 | 0,1 |
| legia | b | 60,8 | 3,3 | 16,6 | 97,4 | 59,8 | 3,9 | 0,4 |
| legia | c | 70,3 | 1,7 | 18,0 | 94,8 | 59,7 | 0,0 | 0,8 |
| legia | e | 66,5 | 2,7 | 18,6 | 94,4 | 59,9 | 0,0 | 0,9 |
| polonia-warszawa | d AI | 48,2 | 8,5 | 13,9 | 95,8 |  | 0,0 | 0,5 (neutralny) |
| polonia-warszawa | a | 37,2 | 13,7 | 8,7 | 97,3 | 32,8 | 3,1 | 0,1 |
| polonia-warszawa | b | 46,7 | 9,1 | 15,2 | 97,3 | 60,0 | 3,3 | 0,4 |
| polonia-warszawa | c | 47,0 | 8,8 | 16,4 | 89,2 | 60,0 | 0,0 | 0,8 |
| polonia-warszawa | e | 55,5 | 5,2 | 18,1 | 86,5 | 60,0 | 0,0 | 0,9 |
| widzew | d AI | 54,0 | 6,9 | 15,1 | 95,8 |  | 0,0 | 0,5 (neutralny) |
| widzew | a | 38,4 | 12,6 | 8,8 | 97,3 | 5,7 | 3,3 | 0,1 |
| widzew | b | 45,5 | 9,7 | 15,2 | 97,4 | 59,8 | 3,5 | 0,4 |
| widzew | c | 49,2 | 8,4 | 16,8 | 91,4 | 58,9 | 0,0 | 0,8 |
| widzew | e | 54,1 | 6,0 | 18,2 | 85,8 | 59,9 | 0,0 | 0,9 |

Jak to czytać:

- **Pasywny (a)**: średnio -12,0 pkt (błąd 1,3), lepszy sezon niż AI w 15 % przypadków, w 73 % gorszy o 5 i więcej.
  Los dalej działa: 10 % najlepszych sezonów pasywnej Legii to +3 pkt nad AI. Legia pasywna kończy średnio na 4,8.
  miejscu, nie spada.
- **Zaangażowany (e)**: średnio +2,5 pkt (1,5), lepszy niż AI w 55 % sezonów, gorszy o 5 i więcej w 28 %.
  Rozrzut jest szeroki (od -11 do +17 między 10. i 90. percentylem), więc praca zwiększa szansę, a nie gwarantuje wyniku.
- **Aktywny-lite (c)**: -1,2 pkt, 41 % sezonów lepszych niż AI: pomiędzy.
- **Zajęty, ale źle (f)**: -9,3 pkt, 25 %: blisko pasywnego. Złe plany kosztują w silniku, nietrafione rozmowy
  i zebrania nie budują autorytetu, a monotonia i analiza rywala działają tak samo.
- **Zależność od klubu.** Przewaga zaangażowanego gracza była największa w Polonii (+7,3) i GKS (+4,9), mniejsza
  w Widzewie (0,1) i Legii (-2,4). Błąd średniej jednego klubu to 2-3 pkt, więc różnice między klubami poniżej ok. 5 pkt
  są w szumie. Część różnicy to obozy: duże kluby AI jeżdżą na dobre obozy same, słabsze rzadziej, więc obóz
  zarezerwowany przez gracza daje więcej w słabszym klubie. Premia za autorytet rośnie z kadrą (Legia x1,1, GKS x0,8).

### 9.4 Testy

- `tests/passivePlay.test.mjs`: 4 nowe testy (autorytet spada powoli i w granicach u trenera, który nic nie robi;
  liczy się trafność, nie kliknięcia: trafne rozmowy i zebrania budują, nietrafione obniżają; premia zależy od kadry,
  kara nie, kluby AI i stary zapis neutralne; trafne zebranie powtarzane co tydzień słabnie, ale nie szkodzi).
- `tests/balance.test.mjs`: strażnik autorytetu (pasywny od -0,3 do -0,2, zaangażowany powyżej +0,1, większa premia
  w mocniejszej kadrze, AI 0); strażnik przewidywalności z rundy 1 bez zmian.

### 9.5 Otwarte pytania (runda 2)

1. Widok Kadra, Rozmowy jest w przebudowie u koordynatora: do pokazania autorytet słowami
   (`authoritySummary(game).label`), poziom i podpowiedź, co go buduje (`tip`), oraz liczba zawodników czekających
   na rozmowę (dotychczasowy licznik z `attentionNeed` i `daysSinceAttention`).
2. Pasywny trener dużego klubu często spada pod próg zwolnienia (zaufanie zarządu na koniec sezonu: Widzew ok. 6,
   Legia ok. 24, minimum w sezonie). Próg dla pierwszego sezonu i prasa klubów AI zostają bez zmian do decyzji użytkownika.
3. Zaangażowany gracz zyskuje częściowo przez obozy (istniejąca mechanika). Bez obozów jego przewaga byłaby mniejsza;
   osobnego pomiaru bez obozów nie robiłem.

## 10. Runda 3: niższe ligi, przygotowanie pod rywala i przewaga AI (Nov 27, 2026)

### 10.1 Zgłoszenie i decyzje właściciela

- Zgłoszenie: w 2 Lidze i III lidze bierny gracz (tylko „Dalej” i „Pokaż wynik”) kończył sezony na 3., 3. i 6. miejscu.
  Właściciel: w niższych ligach gra się ciężej, więcej walki; liczy się taktyka, motywacja i trening, parametry na końcu.
  Transfery AI odrzucone jako rozwiązanie.
- Cel B: bierny gracz traci ok. 20 pkt na sezon wobec tego samego klubu pod AI (dolna połowa tabeli, zwykle zwolnienie).
  Aktywny i trafny gracz jest na poziomie AI albo trochę wyżej.
- Trener AI zawsze sam ogląda rywala i ma kontrplan na stały schemat gracza.
- Przewaga AI w analizie rywala gracza: losowana od 0 do granicy, przy każdym meczu z graczem (także gdy gracz
  zmienia taktykę). Świadomy wyjątek od zasady „te same reguły”, wpisany w `CLAUDE.md`.
- Analiza wideo przestaje być pewną premią wszędzie (także w Ekstraklasie). Wynik zawsze jest losowy: zysk, bez efektu
  albo strata (strata mniejsza niż zysk). Własna praca trenera daje lepsze szanse niż asystent; szanse trenera gracza
  rosną z doświadczeniem (mecze w karierze), asystenta z umiejętnością, trenera AI z atrybutem SKL.
- Zwolnienie biernego gracza w pierwszym sezonie: akceptowane.

### 10.2 Pomiar przed zmianami [SYM]

- Skrypt klikający jak interfejs (zalecane odprawy przed meczem i w przerwie, pominięte konferencje, „Pokaż wynik”),
  32 kluby (16 z 2 Ligi, 16 z III ligi), ziarna 1-2, punkty na mecz do zwolnienia przeliczone na 34 mecze:
  2 Liga -9,3 pkt (błąd 2,0), III liga -10,4 (2,8) wobec AI. Zwolnienie w 1. sezonie: 42 z 62 przebiegów.
- Wcześniejszy skrypt bez odpraw i konferencji pokazywał -5,9 i -3,4: zaniżał stratę (autorytet nie spadał, bo
  `authorityWeek` nic nie robi bez rozliczonych konferencji).
- Przyczyny (panel: trener niższych lig, psycholog, trener od treningu, projektant balansu, weryfikacja w kodzie):
  plan asystenta sam dodawał wideo w MD-1 (`training/plan.js` `autoDay`), więc bierny gracz miał pewną premię
  analizy jak aktywny; premia za rozpracowany schemat zależała prawie tylko od analityka (2 Liga ok. +0,085);
  plan AI (`match/aiPlan.js`) nie patrzy na taktykę gracza; kara autorytetu była taka sama w każdej lidze.

### 10.3 Zmiany (wszystkie za wyłącznikiem `PASSIVE.r3` w `src/training/scouting.js`)

| Zmiana | Plik, funkcja | Przed rundą 3 | Runda 3 |
|---|---|---|---|
| Losowe przygotowanie pod rywala | nowy `src/training/prep.js` (`PREP`, `prepOdds`, `rollPrep`), `training/cohesion.js` `applySessionToClub` (nowy parametr `auto`), `training/sessions.js` (przekazuje `day.auto`) | wideo daje pewną premię 0,04 + 0,006 q (analityk) | wynik losowany raz na mecz: zysk podstawa x 0,6-1,4, strata podstawa x 0,3-0,8, podstawa = max(0,1; 0,04 + 0,006 q) |
| Kto przygotowuje | `prep.js` `prepOdds` | bez znaczenia | zajęcia dodane albo zmienione ręcznie: trener gracza (zysk 55 % -> 75 %, strata 15 % -> 5 % od 0 do 300 meczów w karierze); z planu asystenta: asystent TAK (5: zysk 25 %, strata 45 %; 20: 50 % i 20 %); trener AI: SKL na tej samej skali co doświadczenie gracza |
| Trener AI sam ogląda rywala | `cohesion.js` `aiPrepToday` | premia tylko przy analityku od 5 | zawsze losowanie trenera AI; mnożnik groźnej drużyny (threat.js) tylko na zysk |
| Przewaga AI w analizie rywala gracza | `prep.js` `aiScoutAdvantage`, `PREP.adv`; doliczana w `aiPrepToday` | brak | X x U^2 (U jednostajne 0-1, średnio X/3), X: Ekstraklasa 0, 1 Liga 0,08, 2 Liga, III i IV liga 0,21 (2 Liga po kalibracji z 0,18); tylko kluby AI przeciw graczowi |
| Analiza trenera AI bez analityka | `training/scouting.js` `analysisQuality`, `SCOUT.coachQ` | jakość z analityka (2 Liga ok. 0,26) | co najmniej 0,45 + 0,2 s(SKL) dla klubów AI |
| Kontrplan na stały schemat gracza | `scouting.js` `counterPlan`, `scoutEdge`, `SCOUT.counter`; tekst w `scoutingNote` | brak | +0,1, gdy znajomość schematu od 0,6 i dziś ten sam plan (zgodność od 0,8) |
| Górna granica premii za rozpracowanie | `SCOUT.edgeMax` | 0,4 (`SCOUT.edgeMaxR2`) | 0,5 |
| Autorytet zależny od ligi | `career/authority.js` `authorityTerm` (nowy parametr `tier`), `AUTH.dep` | mnożnik 1 | kara i premia x 1 / 1,15 / 1,6 / 1,7 / 1,7 (2 Liga po kalibracji z 1,5) (Ekstraklasa, 1 Liga, 2 Liga, III liga, IV liga) |
| Teksty | `training/config.js` (opis zajęć wideo), `ui/trainingView.js` (opis analityka) | „Mały bonus na ten mecz” | wynik niepewny, kto przygotowuje |

Testy: nowy `tests/passiveR3.test.mjs`; `tests/balance.test.mjs` i `tests/passivePlay.test.mjs` sprawdzają stare
zachowanie z `PASSIVE.r3 = false`, a w `balance.test.mjs` dodatkowo, że pasywny gracz nie jest wyraźnie przed AI.

### 10.4 Jak cofnąć

1. Całość od razu: w `src/training/scouting.js` ustaw `PASSIVE.r3: false`. Gra liczy wtedy dokładnie jak przed rundą 3
   (stare gałęzie kodu zostały w `cohesion.js` `applySessionToClub` i `aiPrepToday`, `scouting.js`, `authority.js`).
   Zapisy gier nie wymagają zmian: nowe pole `c.prep.kind`/`c.prep.by` jest ignorowane, a premia wygasa po meczu.
2. Pojedyncza zmiana: przewaga AI `PREP.adv` na 0; kontrplan `SCOUT.counter.v` na 0; analiza trenera AI
   `SCOUT.coachQ.base` i `.skl` na 0; granica `SCOUT.edgeMax` na 0,4; autorytet `AUTH.dep` na same 1;
   losowe przygotowanie tylko razem z całością (wyłącznik).
3. Całkowite usunięcie kodu: commit rundy 3 (`git show` commita z opisem o analizie rywala w niższych ligach)
   zmienia tylko pliki z tabeli 10.3, `docs/`, `CLAUDE.md` i `sw.js`; `git revert` tego commita przywraca stan.

### 10.5 Kalibracja po zmianach

Ten sam skrypt i te same ziarna co w 10.2 (punkty na mecz do zwolnienia, x34) [SYM]:

| Liga | Przed rundą 3 | Runda 3 (2 Liga: przewaga 0,18, autorytet x1,5) | Po kalibracji 2 Ligi (0,21, x1,6) |
|---|---|---|---|
| 2 Liga | -9,3 (błąd 2,0) | -15,8 (2,9), zwolnieni 30 z 32 | -17,4 (2,8), zwolnieni 31 z 32 |
| III liga | -10,4 (2,8) | -22,4 (2,7), zwolnieni 28 z 28 | bez zmian |

Morale drużyny biernego gracza w 2 Lidze: 7,9 przed, 5,4 po. Gracz aktywny i Ekstraklasa: jeszcze niezmierzone.

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
- E1. Champions Journal, „Second team” (wypowiedź Mircei Lucescu o tym, jak Alex Ferguson delegował treningi): https://champions-journal.com/500/second-team
- E2. C. Ancelotti, „Quiet Leadership” (fragmenty o planowaniu treningu ze sztabem i delegowaniu): https://manhattan.institute/article/a-look-inside-the-quiet-genius-of-carlo-ancelotti ; https://wsc.co.uk/?p=7146
- E3. Sports Mole (za The Times), „Man United players have lost faith in Ralf Rangnick”: https://sportsmole.co.uk/football/man-utd/news/man-united-players-have-lost-faith-in-ralf-rangnick_484247.html ; Planet Football o przeciekach z szatni: https://www.planetfootball.com/quick-reads/the-leaks-about-man-utd-under-ralf-rangnick-and-how-the-players-responded
- E4. Metaanaliza stylów przywództwa trenera a spójność i satysfakcja (Frontiers in Psychology, 2024): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11232180/ ; metaanaliza z 2016: https://lida.sport-iat.de/twm/Record/4041723
- E5. G. Muehlheusser, S. Schneemann (Hentschel), D. Sliwka, N. Wallmeier, „The Contribution of Managers to Organizational Success: Evidence from German Soccer”, Journal of Sports Economics 19(6), 786-819 (2018); wersja robocza IZA DP 8560: https://iza.org/publications/dp/8560 ; https://econpapers.repec.org/RePEc:sae:jospec:v:19:y:2018:i:6:p:786-819
- E6. A. Bryson, B. Buraimo, A. Farnell, R. Simmons, „Special Ones? The Effect of Head Coaches on Football Team Performance”, Scottish Journal of Political Economy 71(3), 295-322 (2024): https://www.iza.org/publications/dp/14104/imprint
- D2. J. Afonso i in., przegląd badań nad periodyzacją, Journal of Sports Science and Medicine 16(1): https://jssm.org/16-1-27.p_d_f

Uwaga: źródła A1, B1, B3, C1, C2, D1 i E1-E6 znam z wyników wyszukiwarki (liczby E5 z opisów wersji roboczej; strony IZA i Uniwersytetu Hamburskiego nie otwierały się z sesji) (opisy i fragmenty); pełnych tekstów nie otwierałem.
Liczby modelu są szacunkami projektowymi skalibrowanymi symulacją, a nie wartościami z badań.
