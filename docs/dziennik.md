# Dziennik zmian (przekazanie między profilami Claude)

Nad projektem pracuje kilka profili Claude na różnych komputerach. Wspólna pamięć to wyłącznie repozytorium:
co nie trafi na GitHub, tego następny profil nie zna (pamięć i transkrypty Claude są lokalne).

## Zasady prowadzenia dziennika

1. Przed pracą: `git pull`, przeczytaj ostatnie wpisy tego pliku, `CLAUDE.md`, `docs/PRZEKAZANIE.md` (rozdział 0
   i dalsze) i `docs/kolejka.md`.
2. Po każdej skończonej pracy (każde zadanie właściciela, także mała poprawka) dopisz wpis NA GÓRZE listy wpisów:
   data, profil (np. „profil B, komputer domowy”), zakres commitów, co zmieniono dla gracza, ważne decyzje i pułapki,
   co zostało do zrobienia. Krótko, w punktach, bez pauzy em.
3. Wpis trafia do tego samego commita co zmiana albo do osobnego commita zaraz po niej, potem `git push`.
4. Gdy kończy się limit profilu: dopisz wpis „Przekazanie” ze stanem w toku (co jest niedokończone, w których plikach,
   co dalej) i wypchnij wszystko, także niedokończoną pracę na osobnej gałęzi `wip-<profil>` (nie scalać bez zgody).
5. Nie wpisuj prywatnych danych właściciela (adresy e-mail, poza adresem do commitów z `CLAUDE.md`).

Szablon wpisu:

```
## <Mmm D, YYYY>, <profil>, commity <od>..<do> (wersja gry)
Zrobione:
- ...
Decyzje i pułapki:
- ...
Zostało / dalej:
- ...
```

## Wpisy

## Nov 20, 2026, profil B, kluby zagraniczne z nazwami (v1.21 Beta)
Zrobione:
- Nowy plik `src/data/kluby_swiat.js`: ok. 950 prawdziwych klubów w 95 krajach (ligi kupców, rynki KSA i USA, kraje puli i skautingu), siła L i prestiż [SZAC], nazwy z ogólnej wiedzy (niezweryfikowane).
- `pickBuyer` (foreignMarket.js) i `pickClub` (foreignPool.js): zawsze prawdziwy klub, okno siły rozszerzane (kupiec -0,8/+2,5 potem -1,5/+3,5, pula -1,2/+1,8 potem -2,2/+3), na końcu najbliższy L. Opis „klub z ligi ...” tylko dla kraju bez klubów. Usunięto 25 % szansy na opis.
- Testy: `tests/foreignClubs.test.mjs` (nowy), `tests/foreignPool.test.mjs` (pula ma zawsze klub z id) i migawka puli w `tests/scoutOps.test.mjs` (nowy skrót 1960701819, determinizm sprawdzony drugim przebiegiem).
Decyzje i pułapki:
- Zapisy: zawodnicy już za granicą zachowują zapisane nazwy, bez migracji.
- Pula z tego samego ziarna zmienia się względem v1.20 (inne kluby, kolejne losowania), ale nadal jest deterministyczna.
- `foreignMarket.js` ma końce linii CRLF, edytować bez ich psucia.
Zostało / dalej:
- Siły klubów to szacunki, warto je skalibrować, gdy pojawią się dane.


## Nov 20, 2026, profil B, koniec kariery: ogłoszenie 1 marca i prawdziwe minuty (v1.21 Beta)
Zrobione:
- `src/career/retirement.js`: 1 marca zawodnicy od 31 lat z kontraktem do końca sezonu decydują (0/1) i ogłaszają koniec
  kariery; klub gracza dostaje wiadomość „po sezonie kończy karierę”. Ogłoszony: brak przedłużenia (gracz i AI), brak
  umowy od 1 lipca, odejście 1 lipca. Kto 1 marca zdecydował grać dalej, nie losuje drugi raz na koniec sezonu.
- Czynnik „mało gry” liczony z prawdziwych minut (wobec najczęściej grającego w kadrze); wcześniej stała 0,5, a statystyki
  były zerowane przed decyzją. Test: `tests/retirement.test.mjs`.
Do sprawdzenia (było już przed tą zmianą na main):
- `tests/camps.test.mjs` „Przerwa zimowa”: trener autopilota był zwolniony 1 sty 2027 (bez klubu brak przypomnień o obozie); test trzyma zaufanie zarządu, gra bez zmian.

## Nov 20, 2026, profil B, skauting: wolny albo z klubem losowo, cena zamiast wartości (v1.21 Beta)
Zrobione (decyzje właściciela):
- Zlecenie skauta ma instrukcję: tylko wolni, tylko z klubem albo obojętnie; przy „obojętnie” każdy wyjazd losuje własną
  proporcję wolnych (od 0 do 100 %, bez sztywnego podziału); polecenie agenta zawsze z klubem. Cena zawodnika z klubem jak dotąd: z kraju (`priceMulFor`) + RNG.
- Wolny kandydat skauta dołącza w każdej chwili (`lateFree` pomija `p.scout`); z klubem tylko w oknie transferowym.
- U ukrytego kandydata zamiast wartości rynkowej (zdradzała poziom) „Cena wg skauta: od do” (`valueOrScoutPrice`).

## Nov 20, 2026, profil B, kontrola jakości skautingu, wydajność, ukryta ocena kandydatów, commity 9acbd87..e3eab2c (v1.21 Beta)
Zrobione:
- Wersja gry v1.21 Beta (decyzja właściciela). Wchodzą do niej: skauting zagraniczny (Transfery, Skauting), ukryta
  ocena kandydatów skauta (lornetka), poprawki wydajności, poprawki ekranu startowego i wyboru klubu (przycisk
  Wczytaj zapisaną karierę, kolory Przewidywanego celu, żółty przycisk Wczytaj datapack, bez etykiet siły).
- Wydajność (9acbd87, df14ed6), przebieg gry identyczny (skrót całego stanu po sezonie Lech, Jagiellonia, Raków,
  Lechia, Weszło taki sam jak przed zmianą): `nextSeasonNeeds` bez przeglądu wszystkich zawodników dla każdego klubu
  (ok. 0,8 s na sezon), recovery, acclim i leagueNews bez `Object.values` na 4200 zawodnikach co dzień (for-in;
  leagueNews najpierw sprawdza kadry i akademie klubów w zasięgu), `lossStreakOf` w jednym przejściu bez sortowania,
  `coachPressure` z meczami ligi z `tablesFor`, `pickXI` liczy ocenę zawodnika raz na wybór składu, kontekst odprawy
  AI raz na mecz. Test UEFA „poniżej 15 s” sam: Lech przed 15,4-15,8 s, po 12,7-13,7 s (pierwsza maszyna); na drugiej,
  wolniejszej maszynie stary kod 16,9-17,4 s, nowy 13,7-14,9 s. `npm run perf` (Widzew): 14,8 s przed, 12,8-13,0 s po.
- Ukryta ocena (decyzja właściciela): kandydat skautingu klubu gracza w Transferach bez OVR i atrybutów, tylko ikona
  lornetki (`src/ui/scoutMask.js`, `scoutHidden` w `scoutOps.js`): listy rynku, karta transferowa, porównanie z kadrą,
  karta w okienku, Profil i statystyki, menu zawodnika, nagłówek rozmów. Ocena tylko jako zdanie skauta
  (`scoutOpinion`) w raporcie w poczcie i na karcie kandydata. Po podpisaniu wszystko widać. Opis: `docs/skauting.md`
  rozdz. 7. Testy: `tests/scoutHidden.test.mjs`.
- Kontrola jakości w Chromium (1600 i 390 px, jasny i ciemny): zlecenia (wycena na żywo, pensja tygodniowa), Dalej do
  powrotu, zdarzenia, raport w poczcie, kandydaci, obserwowanie, karta i okienko, lista Z zagranicy, zwolnienie skauta
  z pytaniem, zatrudnienie, odwołanie, wygasanie (45/35/20), edytor (skaut z 5 cechami), eksport v5 z regionami,
  wczytanie datapacku v4, stary zapis. Bez błędów konsoli, bez poziomego przewijania, bez „undefined” i „NaN”.
- Poprawki: odnośnik z raportu skauta w poczcie otwiera zakładkę Kandydaci (było Skauci i misje), tekst odwołania
  wyjazdu zgodny z zasadą (w pierwszych 2 dniach wraca połowa kosztów; UI mówił, że nic nie wraca), karta „Wolne
  miejsce” mówi o pełnym sztabie (było „limit pozwala na jeszcze 2 skautów”, a zatrudnić się nie dało), pytanie
  „Zwolnić skauta (imię)?”, raport w poczcie nie obiecuje listy obserwowanych.
- sw.js miał znaczniki konfliktu scalania od 85a4f32 / f021d91 (błąd składni: service worker nie działał, telefony nie
  dostawały zmian). Usunięte w 96ff881; nowy test w `tests/core.test.mjs` sprawdza, że sw.js się kompiluje.
Decyzje i pułapki:
- Test „Pełny sezon ... poniżej 15 s” w pełnym `npm test` (pliki równolegle na 4 rdzeniach) dalej bywa ponad 15 s;
  sam przechodzi. Dalsze przyspieszenie wymaga pracy w silniku (pickXI, trening AI, recovery).
- Do decyzji właściciela: wartość rynkowa kandydata dalej widoczna (zdradza poziom); wolny kandydat znaleziony poza
  oknem może podpisać dopiero w następnym oknie (`lateFree`), choć raport pisze „podpisze bez odstępnego”.
Zostało / dalej:
- Na później (projekt): obserwowanie dowolnego zawodnika, misje cykliczne, raport porównawczy, misje krajowe.

## Nov 20, 2026, profil B, skauting zagraniczny: logika (gałąź robocza agenta, do scalenia z widokiem) (v1.20 Beta)
Zrobione:
- Kolejka, punkt 4 (skauci i skauting zagraniczny), część logiki według zatwierdzonego projektu (burza mózgów):
  `src/career/scoutOps.js` (stan `game.scoutOps`, system dnia `scoutOps` 52.5), `src/career/scoutRegions.js`
  (12 regionów `SCOUT_REGIONS`). Opis, wzory, kalibracja i API widoku: `docs/skauting.md`.
- Skaut ma 5 atrybutów (DOS, OCE, RYN, SIE, CHA) zamiast 3 (migracja w `ensureStaff`, `game.staff.attrs = 2`,
  jakość bez zmian) i regiony `p.reg`; premia regionu do pensji; `scoutLine` czyta OCE i RYN.
- Lista ok. 50 wolnych skautów (1 lipca i 1 stycznia, nierówny miks regionów), praca na stałe (oferta sztabu)
  albo na zlecenie (opłata i prowizja 3-8 %, ryczałt przy wolnym), misje 1-6 tygodni z kosztem w finansach
  (kategoria `scouts`), nieobecność skauta w sztabie (`syncStaff`), zdarzenia tygodni, 0-7 kandydatów z błędem
  raportu (wydmuszki), wyłączność 14 dni, wygasanie 45/35/20, poczta (`scout-*`, `refs.kind = 'scoutReport'`),
  misje klubów AI (te same wzory) i zakup kandydatów przez `aiBuy`.
- `foreignPool.js`: `genPoolPlayerFor` (pula z tego samego ziarna identyczna, test skrótu), `topUpPool` i
  `poolCandidates` z kandydatami skautów; wyłączność także w zakupach wolnych (`aiBuy`), `fillSquad` i rotacji wolnych.
- Pule imion dla 22 krajów regionów (osobno od `NATIONALITIES`), datapack v5 (`MIGRATE[4]`, regiony skauta),
  blok akcji `sk-*` w `src/app.js`, odnośniki poczty do Transfery, Skauting, `tools/scoutsim.mjs` (siatka i sezon).
- Testy: `tests/scoutOps.test.mjs` (19); `tests/staffAttrs.test.mjs`: skaut ma 5 atrybutów.
Decyzje i pułapki:
- Widok (Transfery, zakładka Skauting, `state.skOrder`, `state.skMsg`) buduje osobny agent; przy scalaniu
  `npm run sw` jeszcze raz (konflikt w `sw.js`). Pensja w zleceniu (`maxWage`) i w raporcie jest tygodniowa.
- Skuteczność `s`: wagi 0,30 DOS + 0,40 region + 0,15 SIE + 0,15 OCE (projekt 0,30/0,30/0,25/0,15), bo przy
  wagach z projektu skaut z siecią 18 w obcym regionie był prawie równy ekspertowi. Kalibracja: `docs/skauting.md` rozdz. 9.
- Karta zawodnika w Transferach pokazuje prawdziwy OVR wszystkich zawodników rynku, więc błąd raportu widać
  głównie w potencjale, cenie, chęci i adaptacji (do decyzji właściciela).
- Liczba skautów na starcie gry bez zmian (plan sztabu jak dotąd). Rosja pominięta w regionach.
- Kod plików z CRLF (staffMarket, editor, assistantReport, foreignPool i in.): zmieniać z zachowaniem końców linii.
Zostało / dalej:
- Scalenie z widokiem i sprawdzenie w przeglądarce (PC 1600 px, telefon 390 px).
- Na później (projekt, LATER): obserwowanie dowolnego zawodnika, misje cykliczne, raport porównawczy, misje krajowe.

## Nov 20, 2026, profil B, wersja v1.20 Beta
Zrobione:
- Wersja gry podniesiona do v1.20 Beta (zgoda właściciela). Wchodzą do niej: karta zawodnika w okienku w Transferach,
  odnośniki w Poczcie, poczta tylko z ligi gracza i media o innych klubach, kariera trenera (Klub > Kariera, plakietki,
  reputacja, popularność, rynek pracy bez klubu).
Zostało / dalej:
- Decyzja właściciela (Nov 20, 2026): oferty dla bezrobotnego trenera zostają jak są (test: reputacja 47, po 60 dniach
  oferta Wisły Płock). Na później: mały RNG terminu oferty (czasem szybciej, czasem później).

## Nov 20, 2026, profil B, kontrola jakości kariery trenera (v1.19 Beta)
Zrobione:
- Sprawdzenie w Chromium (1600 i 390 px): rezygnacja, wszystkie zakładki bez klubu, Dalej przez 60 i 120 dni,
  aplikacja i wycofanie, oferta agenta i przyjęcie (powrót zwykłych widoków), odznaka z prawdziwego zdarzenia
  (trener miesiąca 1 kwietnia), okno raz, Do gabloty, ponowne wczytanie; stare zapisy bez kariery.
- Poprawki: daty w rekordach po polsku (było 2026-07-26), zasięg bez ułamka, liczba sezonów w nagłówku i tabeli
  liczy sezony, nie wiersze (zmiana klubu w sezonie), odejście z klubu zamyka decyzje dawnego klubu w Poczcie
  (oferty za zawodników, sztab, sponsorzy: blokowały Dalej albo pozwalały decydować za AI), wycofanie aplikacji
  nie kasuje oferty agenta z kilkoma klubami, Pulpit bez klubu: karencja zamiast szansy przy dawnym klubie, przycisk
  oferty bez podwójnego „Oferta pracy”, komunikat zakładki Klub znika po zmianie zakładki. Test w `tests/jobMarket.test.mjs`.
Decyzje i pułapki:
- `docs/kariera-trenera.md` rozdz. 8: wynik akcji w `state.kMsg`, potwierdzenie rezygnacji `state.crResign`
  (dawne `jobMsg`, `jobConfirm` nie istnieją).
- `save-feb.json` w scratchpadzie ma 241 nierozegranych meczów z przeszłości (sztuczny zapis), nie błąd kariery.
Zostało / dalej:
- Balans do decyzji właściciela: trener z reputacją 47 po rezygnacji z Widzewa dostaje od razu wysoką szansę
  w klubach Ekstraklasy (zasięg 78) i ofertę agenta z Ekstraklasy po 60 dniach.

## Nov 20, 2026, profil B, kariera trenera: logika (gałąź robocza, bez scalenia z main), commity 5ff18cf..(ten) (v1.19 Beta)
Zrobione:
- `src/career/coachCareer.js`: reputacja z wydarzeń (punkty x nasycenie x próg ligi, kary, forma miesiąca zamiast
  starego wzoru z zaufania zarządu, zanik do 0,6 szczytu, minimum 5), popularność (kibice, media), historia sezonów,
  trofea (zasada 12 meczów), rekordy, okresy pracy, blizny (tylko tekst), 20 odznak z licznikami, migracja starych
  zapisów (`ensureCareerHistory`, bez podwójnego liczenia), reputacja trenerów AI (start, koniec sezonu, zatrudnianie).
- `src/career/jobMarket.js`: trener bez klubu, wakaty, aplikacje (3 aktywne, co 3 dni, 90 dni karencji), rozmowa
  i decyzja klubu (los z ziarna), oferty gwarantowane po 60 i 120 dniach, oferty po sezonie i w trakcie sezonu,
  rezygnacja, kara za masowe aplikowanie, oferty klubów po przeglądzie 2 czerwca.
- `src/core/gameLoop.js`: bez pracy `processDay` ustawia `game.clubId = null` na czas systemów dnia (ostatni klub
  prowadzi AI), `clubMatchOn` zwraca null; `isUnemployed`, `userClubId`.
- Zarząd: zaufanie na start z reputacji, cierpliwość względem klubu, próg zwolnienia z popularności, zwolnienie po
  6 meczach nowego trenera, cel „poprawa” dla trenera przyjętego w kryzysie. Prasa: ton z popularności w mediach.
- `src/app.js`: tryb bez klubu (informacja zamiast Kadry, Transferów, Treningu i Klubu poza Karierą, Pulpit z rynkiem
  pracy, nagłówek), akcje `job-apply`, `job-withdraw`, `job-resign`, `career-unlocks-seen` (wynik w `state.jobMsg`).
- Testy: `tests/coachCareer.test.mjs` (13), `tests/jobMarket.test.mjs` (6); `tests/career.test.mjs` po nowemu
  (zwolnienie = bez pracy). Pełny `npm test`: 878/878. Kalibracja: `tools/kariera-kalibracja.mjs`. Opis:
  `docs/kariera-trenera.md` (zasady, liczby, model danych, kontrakt API, wyniki kalibracji).
Decyzje i pułapki:
- Widoki Kariery, odznak i rynku pracy (careerView.js, badges.js, jobsView.js, kariera.css, podzakładka Klub)
  buduje osobny agent w innym worktree; przy scalaniu uruchomić `npm run sw` jeszcze raz (konflikt w `sw.js`).
- Bez pracy `game.clubId` w zapisie i widokach to ostatni klub; w systemach dnia jest null. Nowe systemy dnia muszą
  znieść `game.clubId === null` (wzór: `competitionCalendar`, `careerSystem`, `rollover`).
- Kalibracja nie osiąga celów projektu (rozdz. 11): autopilot w III lidze jest często zwalniany przez dawny model
  zarządu i nie dostaje ofert z 1 Ligi. Do decyzji właściciela.
- Nie sprawdzono w przeglądarce (środowisko odmówiło uruchomienia serwera HTTP); zrobić po scaleniu z widokami.
Zostało / dalej:
- Sprawdzenie w przeglądarce trybu bez klubu (PC 1600 px, telefon 390 px) po scaleniu z widokami.
- Decyzja o balansie zarządu w III lidze i o deflacji reputacji trenerów AI.

## Nov 20, 2026, profil B, poczta tylko z ligi gracza i wiadomości z mediów (v1.19 Beta)
Zrobione:
- Filtr skrzynki `src/core/mailFilter.js` (pętla dnia): wiadomości o rozgrywkach tylko z ligi gracza; z innych lig
  i pucharów tylko bardzo ważne (półfinał i finał PP, polski klub od ćwierćfinału w Europie albo z trofeum); gracz
  z Ekstraklasy dostaje wszystkie wiadomości o polskich klubach w Europie. Sprawy klubu gracza i reprezentacja zawsze.
- Media `src/career/leagueNews.js`: duże transfery (próg ligi, z wyższej ligi podwójny), ciężkie kontuzje (od 120 dni,
  z wyższych lig reputacja od 60), kłopoty finansowe i zagrożenie licencji (raz na sezon). Liga gracza i wyższe,
  w III lidze tylko własna grupa. Zwolnienia trenerów już były (coachMarket.js, ta sama zasada).
- Testy: `tests/leagueNews.test.mjs`. Symulacja sezonu: ok. 6-9 wiadomości o transferach i ok. 18 o kontuzjach.
Decyzje i pułapki:
- W grze nie ma mechanizmu bankructwa; wiadomość o długach jest tylko informacją.
- Symulacja z automatycznymi decyzjami potrafi przyjąć ofertę pracy w innym klubie (zmiana ligi w trakcie testu).

## Nov 20, 2026, profil B, odnośniki w Poczcie (v1.19 Beta)
Zrobione:
- Wiadomość w Poczcie ma pod treścią przyciski „Przejdź do:” do ekranu, którego dotyczy: profil, rozmowa i karta
  zawodnika (gdy klucz wiadomości zawiera id zawodnika), kontrakty, rynek, oferty, W toku, wypożyczenia, sponsorzy,
  zarząd, infrastruktura, sztab, obozy, sparingi, rozmowy, rezerwy, rozgrywki, Puchar Polski, reprezentacje.
  Ten sam mechanizm kroków co „Ten tydzień” (`runMenuItem`). Kod: `src/ui/mailLinks.js`, test `tests/mailLinks.test.mjs`.
Decyzje i pułapki:
- Rodzaj wiadomości rozpoznawany z początku klucza (`m.key`); nowe rodzaje wiadomości dopisz do `BY_KIND`.
- Na zapisie z października 56 ze 143 wiadomości ma odnośniki.

## Nov 20, 2026, profil B, karta zawodnika w okienku w Transferach (v1.19 Beta)
Zrobione:
- Nazwisko w Transferach jak link: karta zawodnika w okienku (to samo okno co w Skład i taktyka), cena i skrót do oferty.
  Opis: `docs/transfery.md`, rozdział „Karta zawodnika w okienku”. Pozycja 5 zdjęta z `docs/kolejka.md`.
Decyzje i pułapki:
- Globalny Escape w `src/app.js` wraca na ekran startowy: własne obsługi Escape muszą robić `stopPropagation()`.
- Wersja gry bez zmiany (v1.19 Beta), pytanie do właściciela o podniesienie.
Zostało / dalej:
- Odnośniki w Poczcie: zrobione (wpis wyżej).


## Nov 19, 2026, profil A (przekazanie), commity 9b4403e..8564f53 (v1.11 Beta -> v1.19 Beta)

Okres Nov 15-19, 2026, ok. 125 commitów. Szczegóły w historii git i w plikach `docs/` podanych przy punktach.

Zrobione (najważniejsze dla gracza):
- Pulpit: panel „Ten tydzień” i lista „Do zrobienia w tym tygodniu” (`src/career/weeklyTodo.js`), przyklejony
  nagłówek i boczne menu, tempo upływu dni w Opcjach.
- Raport ogólny drużyny (asystent i analityk, archiwum 3 raportów): `docs/raport-druzyny.md`.
- Reputacja zawodników i klubów zmienna co miesiąc: `docs/reputacja.md`.
- Sędziowie: pula 136 fikcyjnych sędziów na 4 listach w każdym polskim meczu: `docs/sedziowie.md`.
- Sztab: rynek sztabu (ok. 100 wolnych, podbieranie, limity, pensje), kilka osób w roli: `docs/sztab.md`.
  Nov 19: każda osoba ma 3 atrybuty roli napędzające efekty w grze: `docs/sztab-atrybuty.md`.
- Rezerwy: delegowanie do rezerw i powołania z rezerw (przepisy PZPN), zakładka Kadra > Rezerwy: `docs/rezerwy.md`.
- Mecz: raport meczu po kliknięciu wyniku, mniej kartek, menu zawodnika w oknie zmian, instrukcje indywidualne
  (`docs/instrukcje-indywidualne.md`), strzałki ruchu (`docs/strzalki-ruchu.md`), analiza pomeczowa
  (`docs/analiza-pomeczowa.md`).
- Infrastruktura: zgoda zarządu i miasta, baza treningowa i akademia w skali światowej (w Polsce najwyżej 5 i 6):
  `docs/infrastruktura.md`.
- Fikcyjne nazwy i herby klubów Ekstraklasy, 1 i 2 Ligi oraz rezerw (prawdziwe zostają w danych do testów,
  `src/data/clubNames.js`); trwające kariery zostają przy nazwach, z którymi je rozpoczęto (`game.names`),
  Ctrl+Alt+P na pulpicie przełącza nazwy prawdziwe i fikcyjne.
- Edytor i datapack (`docs/edytor.md`, tabela wersji): herb klubu, trener, sztab, właściciel, pozycje dodatkowe,
  kontuzja, przeniesienia 21-32, nowi wolni zawodnicy (210 narodowości), sędziowie, atrybuty sztabu, najwięksi rywale.
  Wersja pliku `PACK_V` 4, import każdej od 1 (migracje `MIGRATE`). Jeden eksport: pełny datapack.
  Nowa kariera może wystartować z datapackiem. Gra z datapackiem pokazuje tarcze w barwach klubów.
- Datapack z prawdziwymi danymi zbieranymi przez agentów AI: `docs/datapack/agenci.md` (zasady i 3 prompty),
  złoty wzorzec `docs/datapack/wzor.json`, kontrola pliku `node tools/check-datapack.mjs plik.json`.
- Historia morale (trend, wykres w karcie, ostrzeżenia, skutek rozmowy): `docs/historia-morale.md`.
- Wypożyczony do klubu gracza nie pyta o kontrakt, przed końcem wypożyczenia mówi, czy chce zostać:
  `docs/wypozyczenia.md`.
- Lista zapisów pokazuje nazwę i herb klubu z kariery (datapack), także w starych zapisach (`src/core/store.js`).
- Wszystkie 27 państw UE liczone jako UE (`p.eu`), wybór pliku na Androidzie bez filtra typu.

Decyzje i pułapki:
- Wersja gry stoi na v1.19 Beta: właściciel kazał nie podnosić wersji („nie podnsc wersji”). Przed podniesieniem
  zapytaj (CLAUDE.md).
- Właściciel: „Nie zadawaj mi pytań i wybieraj opcje najbliższe realiom futbolu”, na koniec tylko changelog,
  odpowiedzi krótkie, bez kodu w odpowiedzi.
- Zawsze `npm run sw` po zmianie plików gry, inaczej `tests/core.test.mjs` nie przechodzi, a telefony nie dostaną zmian.
- Znane niestabilne testy czasu (ignorować, gdy reszta przechodzi): „poniżej 10 ms”, „Pełny sezon”, „poniżej 15 s”,
  „100 przeliczeń”, „instrukcje prawie nie spowalniają”, „cały świat w poniżej 400 ms”.
- Nowe pole datapacku = nowa wersja `PACK_V` i pozycja `MIGRATE[v]` (stare pliki muszą się wczytywać), wpis w tabeli
  wersji `docs/edytor.md`, aktualizacja `docs/datapack/wzor.json` i `docs/datapack/agenci.md`.
- Sprawdzanie wyglądu bez zapisu gry: tymczasowa strona `zz-podglad-*.html` w katalogu repo renderująca widok z modułów
  (serwer `python -m http.server 8137 --bind 127.0.0.1`, w Playwright wyczyścić service worker i cache przez CDP,
  przy ERR_CONNECTION_REFUSED ponowić wczytanie). Stronę usunąć przed commitem. Nie dotykać zapisów właściciela.
- Folder `nowe-herby/` (źródłowe PNG nowych herbów, ok. 7 MB) jest w repozytorium od Nov 19, 2026 (decyzja właściciela).
  Nie trafia do service workera (`tools/sw-list.cjs` bierze tylko `src/` i `assets/`); gra używa `assets/crests/f`.
- Atrybuty sztabu w widoku roli są zapisane jako odchylenia `d` od jakości (`staffA` = q + d), bo testy i wakaty
  ustawiają samą jakość.

Zostało (kolejka `docs/kolejka.md`, tylko na prośbę właściciela):
1. Historia morale: dalsze kroki (dziennik przyczyn, wpływ na balans po burzy mózgów).
2. Rozbudowa psychiki zawodnika, z nową rolą psychologa sportowego w sztabie.
3. Limit zawodników spoza UE w 1, 2 i 3 Lidze.
4. Skauci i skauting zagraniczny (wyprawy, 0-7 kandydatów, regiony).
5. Karta zawodnika w okienku po kliknięciu nazwiska, tylko w Transferach i na liście transferowej.
- Drobne: obsada sędziów i raport pomeczowy wykrywają derby tylko po regionie (nie widzą rywali z edytora).
