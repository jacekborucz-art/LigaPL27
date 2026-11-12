# Trenerzy AI z atrybutami: skład, decyzje w meczu, motywacja, trening, wielkie mecze

Stan na Nov 12, 2026. Zgłoszenie użytkownika: trenerzy AI mają mieć atrybuty 1-20, które wpływają na wybór składu,
decyzje w meczu, skuteczność motywacji i dobór treningu; każda decyzja to stały punkt plus losowość o kilka procent;
wpływ trenera ma być ważny (kluczowe momenty, ważne mecze, trafność zmian, ustawień i okrzyków).

Panel: dwóch trenerów UEFA Pro z doświadczeniem w Ekstraklasie, analityk i skaut, psycholog sportu, programista
i projektant gry. Kod: `src/career/coaches.js`, `src/match/aiPlan.js`, haki w `src/engine/match/coach.js`.
Testy: `tests/coachAttributes.test.mjs`.

Oznaczenia: [SZAC] szacunek projektowy bez źródła, [SYM] wynik symulacji w tym repozytorium.

## Odpowiedź w skrócie

- Każdy klub AI ma trenera z pięcioma atrybutami 1-20: **Taktyka w meczu (TAK)**, **Dobór składu i planu (SKL)**,
  **Motywacja (MOT)**, **Metodyka treningu (TRE)**, **Wielkie mecze (PRE)**. Styl (ofensywny, ostrożny,
  pragmatyczny) zostaje osobno, jako filozofia klubu.
- Każda decyzja: atrybut jako stały punkt, do tego dyspozycja dnia trenera (losowana raz na mecz, średnio
  0,5 pkt atrybutu, najwyżej 1 pkt, czyli ok. 5 % skali) i zwykłe losowanie decyzji z ziarna meczu.
  W derbach, meczach UEFA, finałach i meczach o tytuł lub utrzymanie decyzje przesuwa odporność na presję.
- Średni trener Ekstraklasy (10,5) zachowuje się dokładnie jak AI sprzed zmiany. Bez profilu (testy silnika)
  silnik losuje i decyduje identycznie jak przedtem.
- Efekt [SYM]: trener 16 kontra 8 (wszystkie atrybuty) daje **+4,4 pkt w sezonie** (80 sezonów, błąd ok. 0,7),
  w pojedynczym meczu na tych samych kadrach +0,17 pkt, w finale +0,24 pkt. Dla porównania 0,8 punktu średniej
  siły kadry (Legia wobec Widzewa) to ok. 11 pkt w sezonie, więc trener 16 kontra 8 jest wart ok. 0,3 punktu
  siły kadry: wyraźnie, ale nie ponad kadrę.
- Kalibracja ligi bez zmian (gole 2,75 i 2,74, wygrane gospodarza 44,2 % i 44,2 %).

## Burza mózgów panelu

**Trenerzy UEFA Pro.** W Ekstraklasie różnicę między trenerami najpierw widać w przygotowaniu meczu (kto gra,
jakim ustawieniem i jakim planem na tego rywala), potem w zarządzaniu ludźmi w tygodniu, a dopiero na końcu
w zmianach z ławki. Zmiany w meczu są widowiskowe, ale ich wartość jest mniejsza, niż się wydaje kibicom.
Słaby trener nie jest „mniej aktywny”, tylko częściej robi rzeczy, które szkodzą: cofa zespół przy prowadzeniu,
każe grać długą piłką na pressing, zwalnia grę przy remisie, za długo trzyma zmęczonych. Upór to cecha
osobowości (ostrożny trener jest bardziej uparty), ale dobry taktyk umie go przełamać.

**Analityk i skaut.** Proponuje mierzyć tylko to, co ma odpowiednik w silniku. Pomiar wartości ustawień
przedmeczowych (niżej) pokazał, że w tej grze dobór planu daje więcej niż korekty w trakcie meczu, więc atrybut
składu i planu musi być osobno. Kartki i dyscyplinę odłożyliśmy: silnik ma reakcje na kartki w meczu, ale osobny
atrybut dyscypliny dublowałby taktykę. Elastyczność (upór) zawiera się w taktyce i stylu.

**Psycholog sportu.** Motywacja to dwie rzeczy: trafny dobór słów do tej konkretnej szatni (osobowości zawodników)
i siła przekazu. Słaby motywator nie mówi „losowo”, tylko źle czyta szatnię: mówi coś gorszego niż zwykle.
W wielkich meczach trener przenosi na zespół spokój albo nerwy; to osobna cecha od wiedzy taktycznej.
Kluczowe momenty (końcówka na styku, dogrywka, gra w dziesięciu) to też presja, nie tylko finały.

**Programista i projektant gry.** Zasady: te same narzędzia dla wszystkich (`changeTactics`, `substitute`, `shout`,
te same odprawy i ten sam trening), brak ukrytych premii, deterministyczne ziarna, przy s = 0 identyczne
losowania jak przedtem (stare zapisy i testy bez profilu dają te same mecze). Mecze w tle nie rozgrywają minut,
więc dostają jedno skalibrowane przesunięcie siły zgodne z pełnym silnikiem. Profil w zapisie gry, tworzony
leniwie dla starych zapisów.

## Model atrybutów

Skala umiejętności: `s = (atrybut - 10,5) / 9,5`, od -1 do 1. Atrybut 16 to s = 0,58, atrybut 8 to s = -0,26.

| Atrybut | Co zmienia | O ile (przy s) [SZAC] |
|---|---|---|
| TAK Taktyka w meczu | szansa reakcji na przebieg meczu i sposób gry rywala; korekty pomocne w silniku (wysoki pressing, krótkie lub prostsze rozegranie, kontratak, odważniej przy jałowej przewadze) częściej, szkodliwe (cofanie nastawienia, wolne tempo, długie piłki) rzadziej | x(1 + 0,5 s) i x(1 - 0,5 s) |
| | upór (losowany raz na mecz wg stylu: P 10 %, O 20 %, S 30 %) | x(1 - 0,5 s) |
| | czas rozpoznania zmian rywala (6-10 min) | - 2 s min |
| | reakcje na czerwone kartki, wynik, warianty 4-4-2, kształt w osłabieniu | x(1 + 0,25 s) |
| | szanse zmian zawodników (urazy, zmęczenie, kartki, słaba gra, pogoń, obrona wyniku) | x(1 + 0,2 s) |
| | próg zmiany zmęczonego zawodnika (kondycja 70) | + 4 s |
| | ostrożny trener przy przewadze rywala wybiera pressing zamiast cofania się | szansa 0,5 s (s > 0) |
| | błędna korekta w przeglądzie planu (katalog niżej) | szansa 0,3 (-s) (s < 0) |
| SKL Skład i plan | słaby: błąd oceny każdego zawodnika przy wyborze jedenastki (stały w meczu) | odchylenie 1,2 (-s) pkt OVR |
| | słaby: chybiony plan (długie piłki, wolne tempo albo 3-4-3 niepasujące do kadry) | szansa 0,4 (-s) |
| | dobry: plan pod rywala (krótkie podania przy technice od 11,8, w innym razie wysoki pressing, gdy rywal nie ma lepszej techniki) | szansa 0,4 s |
| MOT Motywacja | odprawa przed meczem i w przerwie: dobry wybiera ton najlepszy dla tej szatni (ta sama ocena co podpowiedź asystenta gracza), słaby czasem ton gorszy niż zwykle | szansa 0,8 s albo 0,5 (-s) |
| | siła odprawy (zaangażowanie Z): pozytywne x(1 + 0,2 s), negatywne x(1 - 0,2 s) | |
| | odprawa po meczu klubu AI: wybór tonu jak wyżej, zmiana morale x(1 + 0,25 s) albo x(1 - 0,25 s) | |
| | okrzyki AI: szansa x(1 + 0,4 s), siła (premia akcji, obrony, Z, mnożniki kartek) x(1 + 0,3 s) | okrzyk gracza bez zmian |
| TRE Metodyka treningu | klub AI: bodziec rozwojowy x(1 + 0,3 s), urazy na treningu x(1 - 0,25 s), ostrość x(1 + 0,15 s), zgranie x(1 + 0,15 s) | klub gracza: trening ustala gracz |
| PRE Wielkie mecze | waga meczu imp z rangi studia (0: 0, puchar: 0,35, derby, UEFA, tytuł, utrzymanie: 0,7, finał: 1); TAK, SKL i MOT w meczu przesunięte o imp x 0,4 x (PRE - 10,5) pkt | PRE 18 w finale: +3 pkt, PRE 4: -2,6 pkt |
| | zaangażowanie drużyny na start wielkiego meczu | + imp x 1,0 x s(PRE) |
| | kluczowe momenty (od 75. min przy różnicy najwyżej 1 gola, dogrywka, gra w osłabieniu lub przewadze): taktyka | + 0,5 x 0,4 x s(PRE) |

Katalog błędów słabego taktyka (każdy kosztuje punkty w silniku, pomiary niżej): „rywal pressuje wysoko: długie
piłki za plecy obrońców”, „rywal przeważa: cofamy się pod własne pole karne” (nastawienie -1 i niska linia),
„remis nas urządza: zwalniamy grę”, „gramy prościej: długie piłki do napastnika”. Ten sam limit korekt
na mecz i ten sam odstęp 15 minut co przy zwykłych korektach. Asystent gracza w podpowiedziach nie popełnia błędów.

### Stały punkt + los

| Składnik | Jak | Ziarno |
|---|---|---|
| Atrybut | stała część profilu (zapis gry) | |
| Dyspozycja dnia | `gauss(0; 0,5)` pkt atrybutu, obcięta do +-1, wspólna dla wszystkich decyzji meczu | `trener-forma:{ziarno}:{mecz}:{klub}` (ta sama w silniku i w tle) |
| Waga meczu | ranga studia 0-3 (`matchRank`), w tle tańsza ocena `quickRank` (finał, Superpuchar, UEFA, derby, tytuł i utrzymanie od 17. kolejki, Puchar Polski) | |
| Decyzja | szansa reakcji z atrybutu, losowana z RNG meczu jak dotąd | RNG meczu |
| Plan przedmeczowy | osobne ziarno, reszta dnia meczowego bez zmian | `ai-plan:{ziarno}:{mecz}` |

## Wartość decyzji w silniku [SYM]

Gospodarz z wariantem od 1. minuty, oba kluby AI, te same ziarna, 3000 meczów Ekstraklasy (punkty gospodarza):

| Wariant | Punkty | Różnica |
|---|---|---|
| bez zmian (4-2-3-1, instrukcje domyślne) | 1,569 | |
| podania krótkie | 1,694 | +0,125 |
| pressing wysoki | 1,659 | +0,090 |
| ustawienie 4-3-3 | 1,659 | +0,090 |
| nastawienie +1 | 1,620 | +0,051 |
| 3-5-2 / 4-1-4-1 | 1,583 / 1,562 | +0,014 / -0,007 |
| 4-4-2 defensywne / 4-4-2 | 1,545 / 1,533 | -0,024 / -0,036 |
| błąd oceny zawodników (odchylenie 1 pkt OVR) | 1,521 | -0,048 |
| tempo wolne | 1,507 | -0,062 |
| podania długie | 1,492 | -0,077 |
| nastawienie -1 | 1,479 | -0,090 |
| 3-4-3 | 1,441 | -0,128 |

Stąd katalog trafnych planów i błędów. 4-3-3 wypada lepiej niż zakładany 4-2-3-1, ale nie wszedł do planu dobrego
trenera (pytanie do decyzji niżej).

## Kalibracja [SYM]

Skrypty poza repozytorium (katalog roboczy agenta, `coaches/`): `engine.mjs` (pełny silnik), `quick.mjs`
(szybka symulacja), `split.mjs` (sezony na prawdziwej pętli dni), `prematch.mjs` (wartość planów), `sim.mjs`
(balans gracz kontra AI).

### Liga przed i po (pełny silnik, AI kontra AI, 10 000 meczów, odprawy przedmeczowe AI)

Przed: kod sprzed zmiany. Po: trenerzy z generatora dla wszystkich klubów Ekstraklasy, plan przedmeczowy obu drużyn.

| Statystyka | Przed | Po |
|---|---|---|
| Gole na mecz | 2,751 | 2,744 |
| Gospodarz / remis | 44,2 / 25,8 % | 44,2 / 26,0 % |
| Żółte / czerwone | 4,37 / 0,227 | 4,36 / 0,229 |
| Zmiany zawodników na drużynę | 4,24 | 4,24 |
| Zmiany taktyki na mecz (obie drużyny) | 5,31 | 5,69 |
| w tym błędy słabych taktyków | 0 | 0,50 |
| Okrzyki na mecz | 2,05 | 2,06 |
| Czas na mecz | bez zmian (różnica w szumie pomiaru) | |

### Dobry (16) kontra słaby (8) trener, te same kadry (pełny silnik)

Ten sam klub po obu stronach, dobry trener na zmianę u siebie i na wyjeździe. Różnica punktów na mecz między
nimi; sezon 34 kolejek: połowa różnicy razy 34 (każdy gra z ligą neutralnych rywali).

| Różnicowane atrybuty (reszta 10,5) | Mecze | Różnica pkt na mecz | Pkt w sezonie |
|---|---|---|---|
| wszystkie, zwykły mecz | 12 000 | +0,169 | +2,9 |
| wszystkie, finał (ranga 3) | 8 000 | +0,239 | +4,1 |
| TAK | 20 000 | +0,035 | +0,6 |
| SKL | 8 000 | +0,110 | +1,9 |
| MOT (tylko w meczu) | 8 000 | +0,010 | +0,2 |
| PRE, mecz rangi 2 | 8 000 | +0,040 | +0,7 |

Błąd standardowy różnicy: ok. 0,03 przy 8000 meczów. Pojedyncze atrybuty sumują się w granicach szumu.

### Szybka symulacja (mecze w tle)

Przesunięcie stref drużyny `coachTerm = 0,23 x (0,3 s TAK + 0,45 s SKL + 0,25 s MOT)` (wagi z udziałów
w pełnym silniku, s już z dyspozycją dnia i wagą meczu). 16 kontra 8 na tych samych kadrach: **+0,169 pkt**
na mecz (30 000 meczów), tyle samo co w pełnym silniku. Zakres przesunięcia: najwyżej +-0,23 pkt atrybutu.

### Sezon na prawdziwej pętli dni

Każdy sezon: połowa klubów Ekstraklasy z trenerem 16, połowa z 8 (losowo wg ziarna), gracz w 2 Lidze. Różnica
punktów tego samego klubu z dobrym i słabym trenerem, średnio po klubach. Obejmuje mecze w tle, trening AI,
odprawy pomeczowe i morale.

| Różnicowane atrybuty | Sezony | Pkt w sezonie | Morale na koniec |
|---|---|---|---|
| wszystkie | 80 | **+4,4** (błąd 0,7) | +1,1 |
| MOT | 60 | +1,6 (błąd 0,8) | +0,8 |
| TRE | 60 | +0,1 (błąd 0,8) | +0,1 |

TRE działa wolno: miesięczny przyrost atrybutów młodych zawodników jest o 16 % wyższy przy 16 niż przy 8
(pomiar na tym samym stanie gry), ale w jednym sezonie to tylko ok. +0,01-0,03 OVR młodego zawodnika.
To skala całego modułu treningu (mnożnik treningu 0,5-1,4), a nie słabość atrybutu; trener jest wart
różnicy w rozwoju akademii dopiero po kilku sezonach.

Typowa różnica między trenerami w lidze jest mniejsza niż 16 kontra 8: przeciętny trener ma średnią atrybutów
w odchyleniu ok. 1,6 pkt od średniej dla swojego klubu, czyli ok. +-0,8 pkt w sezonie.

### Balans gracz kontra AI

`sim.mjs` (pasywny gracz w pełnym dniu meczowym z „Pokaż wynik” i zalecanymi odprawami, bez konferencji),
30 sezonów na klub, przed i po zmianie. „AI”: ten sam klub prowadzony przez AI.

| Klub | Przed: AI / gracz | Po: AI / gracz |
|---|---|---|
| Widzew | 53,2 / 45,7 (-7,5) | 54,4 / 48,6 (-5,8) |
| GKS Katowice | 36,7 / 32,7 (-4,0) | 37,6 / 33,1 (-4,5) |

Zmiana nie przesuwa balansu (różnice w szumie, błąd ok. 3,5 pkt). Pierwsza wersja dawała asystentowi gracza jakość
ze sztabu wprost (sztab Ekstraklasy średnio ok. 13, trenerzy średnio 10,5), co było ukrytą przewagą pasywnego
gracza w dużym klubie; po przeliczeniu (niżej) asystent klubu jest średnio tak dobry jak trener AI tego klubu.
Testy `tests/balance.test.mjs` przechodzą.

## Generowanie i zapis

- Profil: `game.coaches[clubId] = { name, style, age, a: { TAK, SKL, MOT, TRE, PRE }, n, since }` dla klubów
  ze stałą kadrą (ok. 53 kluby). Kluby III ligi i zagraniczne: profil z ziarna bez zapisu.
- Średnia: `3,5 + 0,8 x prestiż + premia ligi (Ekstraklasa +1, 1 Liga 0, 2 Liga -1)`, wspólny talent trenera
  (odchylenie 1,3), rozrzut atrybutu (2,0), +1 w atrybucie stylu (ofensywny MOT, ostrożny SKL, pragmatyczny TAK),
  rezerwy jak w sztabie (prestiż pierwszej drużyny - 3). Średnia Ekstraklasy ok. 10,4 (punkt neutralny 10,5),
  1 Liga ok. 8, 2 Liga ok. 6. Czołówka (Legia, Lech) średnio ok. 12,5, ale z rozrzutem: w jednym ziarnie trener
  Rakowa ma 4-8, w innym klub z dołu tabeli ma trenera 14.
- Imię i nazwisko z tego samego ziarna co dawniej (`trener-glowny:{ziarno}:{klub}`): stary zapis pokazuje tego
  samego trenera. Stary zapis bez profili: `ensureCareer` tworzy je przy wczytaniu, a `coachOf` przy pierwszym użyciu.
- Zmiana trenera: istniejący mechanizm kibiców (żądanie zwolnienia trenera klubu AI, `career/fans.js`) wywołuje
  `replaceCoach`: nowy profil z kolejnym numerem, średnia +0,5 (zarząd szuka lepszego, nie zawsze znajduje),
  ten sam styl (filozofia klubu), wpis w `game.coachLog` i w dzienniku kibiców.
- Po sezonie (`rollover.js`): trenerzy rok starsi; do 48 lat +1 w jednym atrybucie z szansą 45 %, od 62 lat -1
  z szansą 35 %.
- Asystent gracza: `assistantProfile(q)` z jakości asystenta w sztabie przeliczonej na skalę trenera
  (`2 + 0,62 q`: sztab ma wzór 3 + 1,3 prestiżu, trener 3,5 + 0,8 prestiżu). Działa przy „Pokaż wynik”
  (asystent przejmuje drużynę) i w podpowiedziach (czas rozpoznania zmian rywala). Decyzje gracza nie mają atrybutów.

## Gdzie są haki

| Miejsce | Co robi |
|---|---|
| `src/career/coaches.js` (nowy) | profile, generowanie, `matchCoach` (s z dyspozycją dnia i wagą meczu), `quickCoachTerm`, `replaceCoach`, `coachesNewSeason`, opis i widoczność ocen |
| `src/engine/match/constants.js` | `COACHQ`: współczynniki w meczu |
| `src/engine/match/coach.js` | `tacSkill`, `pAdj`, `worth` (wartość korekty), błędy słabego taktyka, upór, czas rozpoznania, próg zmęczenia, szanse reakcji i zmian, okrzyki |
| `src/engine/match/control.js` | siła okrzyku trenera AI wg motywacji |
| `src/engine/match/teams.js`, `match.js` | `T.cq` (trener w meczu), `T.assistantCq` (asystent gracza, przy przejęciu drużyny) |
| `src/match/aiPlan.js` (nowy) | plan przedmeczowy: jedenastka, ustawienie, instrukcje |
| `src/match/matchday.js` | trener rywala w dniu meczowym (ranga meczu, dyspozycja, plan), odprawy AI z motywacją, nerwy w wielkim meczu, asystent gracza; trener rywala w zapowiedzi meczu |
| `src/match/briefings.js` | `aiBriefing`: wybór tonu i siła odprawy wg motywacji |
| `src/season/season.js` | `quickRank`, przesunięcie siły w meczach w tle, odprawa pomeczowa AI wg motywacji |
| `src/engine/teamStrength.js`, `quickSim.js` | `coachTerm` w strefach (osobno w rozbiciu: `coach`) |
| `src/training/aiClubs.js` | metodyka treningu klubu AI |
| `src/career/fans.js`, `careerSystem.js`, `season/rollover.js` | zmiana trenera, profile przy wczytaniu, sezon |
| `src/ui/clubView.js`, `src/styles/club.css` | karta trenera |
| `src/app.js` | stara ścieżka szybkiego meczu: trener rywala i asystent |

Wydajność: w meczu kilka mnożeń na decyzję, w tle jeden profil i jedno `Rng` na drużynę i mecz, w treningu jedno
odczytanie profilu na klub dziennie. Czas meczu i testy szybkości bez zmian.

## Interfejs

Widok klubu (z tabeli i terminarza), panel „O klubie”: sekcja **Trener** z imieniem, stylem, wiekiem (po zmianie
trenera także datą objęcia), jednym zdaniem o mocnej i słabej stronie (np. „Mistrz motywacji, ale gubi się
w wielkich meczach”) i pięcioma paskami. Dokładność jak w raportach sztabu, od analityka wideo klubu gracza:
od 14 liczby, 8-13 przedziały po 4 punkty (np. 11-14, pasek z jasnym zakresem), poniżej 8 tylko słowa
(„przeciętny”, „dobry”, „znakomity”). W klubie gracza: „To ty prowadzisz drużynę”. Zapowiedź meczu w studiu:
„Trener rywala, Imię Nazwisko, jest ofensywny. Trafnie dobiera skład i plan.” (bez liczb).

Sprawdzone w przeglądarce (Playwright) na 1440x900 i 390x844, jasny i ciemny motyw, bez poziomego przewijania
i bez błędów w konsoli.

## Testy

`tests/coachAttributes.test.mjs`: deterministyczne generowanie i zgodność nazwiska ze starym zapisem, średnia
Ekstraklasy przy punkcie neutralnym i lepsi trenerzy w lepszych klubach, stary zapis i JSON, karta trenera
w trzech dokładnościach, granice dyspozycji dnia, wzmocnienie i osłabienie w finale, identyczny mecz przy s = 0,
błędy tylko u słabego taktyka, ograniczone i monotoniczne przesunięcie w tle oraz przewaga dobrego trenera
w szybkiej symulacji (0,08-0,3 pkt na mecz), plan przedmeczowy (średni jak dotąd, słaby zmienia jedenastkę,
dobry trafny plan), odprawy AI wg motywacji, bodziec treningowy, zmiana trenera i nowy sezon, asystent gracza
i widoczność ocen.

`tests/history.test.mjs`: zmienione wyniki sprawiły, że pasywny gracz z tego testu (ziarno 31) jest zwalniany
w trakcie sezonu, co odsłoniło dwa założenia testu: dzień zwolnienia liczony jest teraz włącznie (mecz w dniu
zwolnienia gra jeszcze stary klub), a próg 34 meczów w sezonie obowiązuje tylko bez zmiany pracy (po zmianie zimą
co najmniej 25). Sama logika gry bez zmian.

## Otwarte pytania do decyzji

1. **Siła wpływu trenera.** 16 kontra 8 to +4,4 pkt w sezonie, czyli górna granica zakładanego przedziału 2-4.
   Zmniejszenie: `COACH.quick` i `COACH.plan` (decyzje meczowe) albo `COACH.postFx` (morale). Zwiększenie TRE
   dałoby się odczuć dopiero po kilku sezonach.
2. **Liczby u rywala.** Czy dokładne atrybuty mają być widoczne od analityka 14, czy zawsze tylko przedziały?
3. **Styl po zmianie trenera.** Nowy trener ma styl klubu (filozofia). Czy nowy trener ma móc zmienić styl?
   Wymaga to czytania stylu z profilu w kilku miejscach (`club.coach` w treningu, odprawach, planie), plan jest prosty.
4. **Trenerzy niższych lig są słabsi** (1 Liga ok. 8, 2 Liga ok. 6, jak sztab). Rywale gracza w 2 Lidze robią
   więcej błędów niż dawne AI; asystent gracza w takim klubie też jest słabszy. Czy tak ma zostać, czy skala
   trenera ma być względna wobec ligi?
5. **4-3-3 od początku daje w silniku +0,09 pkt na mecz** wobec 4-2-3-1, a krótkie podania +0,125. To pytanie
   do balansu silnika (docs/ai-trener.md, otwarte pytania 1-2); plan dobrego trenera używa krótkich podań i pressingu.
6. **Dalsze kroki:** zwolnienia trenerów AI przez zarząd za wyniki (dziś tylko pod presją kibiców), rynek trenerów
   (gracz mógłby zatrudnić asystenta jako przyszłego trenera), atrybut dyscypliny (kartki), rotacja składu wg
   terminarza u dobrych selekcjonerów.
7. **Balans pasywnego gracza** (obserwacja poza zakresem): w obecnym kodzie pasywny gracz w pełnym dniu meczowym
   zdobywa 4-7 pkt mniej niż ten sam klub pod AI także przed tą zmianą, a docs/balans.md podawał różnicę bliską zeru.
   Pomiar był bez konferencji prasowej; warto sprawdzić osobno.
