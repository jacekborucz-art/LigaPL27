# Dziennik zmian (przekazanie między profilami Claude)

Nad projektem pracuje kilka profili Claude na różnych komputerach. Wspólna pamięć to wyłącznie repozytorium:
co nie trafi na GitHub, tego następny profil nie zna (pamięć i transkrypty Claude są lokalne).

## Zasady prowadzenia dziennika

1. Przed pracą: `git pull`, przeczytaj ostatnie wpisy tego pliku, `CLAUDE.md`, `docs/PRZEKAZANIE.md` (rozdział 0
   i dalsze) i `docs/kolejka.md`. Czy funkcja już istnieje: najpierw `docs/funkcje.md` (spis funkcji), potem kod.
2. Po każdej skończonej pracy (każde zadanie właściciela, także mała poprawka) dopisz wpis NA GÓRZE listy wpisów:
   data, profil (np. „profil B, komputer domowy”), zakres commitów, co zmieniono dla gracza, ważne decyzje i pułapki,
   co zostało do zrobienia. Krótko, w punktach, bez pauzy em. Nowa lub zmieniona funkcja: popraw też jej linię w `docs/funkcje.md`.
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

## Nov 24, 2026, profil A (komputer domowy), rotacja ławki przed sparingiem (v1.23 Beta)
Zrobione (agent Sonnet medium, sprawdzone):
- Przed sparingiem ławka w Skład i taktyka ma 14 miejsc, a dobrani przez grę rezerwowi są zwykłą ławką gracza (przesuwanie,
  zamiany z jedenastką, usuwanie, dodawanie). Wcześniej były tylko do podglądu (wiersze „dobrany na sparing”).
- `syncFriendlyBench` (`src/match/matchday.js`): raz na sparing (`tactics.friendlyFor`) dopisuje dobranych (`tactics.friendlyExtra`);
  przed meczem o stawkę ci zawodnicy schodzą pierwsi, ławka wraca do limitu ligi, zmiany gracza zostają.
  `benchSizeFor` w `src/app.js` daje 14 przed sparingiem (`leagueBenchSizeFor` to limit ligi). `matchTacticsFor` nie dopełnia
  już ławki ustawionej przez gracza (zdjęci z ławki nie wracają w meczu).
- Testy `tests/friendlyUi.test.mjs`, opis `docs/sparingi-i-karne.md`.

## Nov 24, 2026, profil A (komputer domowy), zmienne pieniądze właściciela na sezon (v1.23 Beta)
Zrobione:
- Nowy `src/career/ownerFunding.js` (`OWNER_FUND`, `seasonVerdict`, `ownerSeasonMul`): od 2. sezonu dopłata = baza z danych
  x mnożnik (nastrój z pamięcią, wynik wobec oczekiwań, awans, spadek, puchary, ambicja, zacisk, sufit zasobności),
  skarbiec o połowę zmiany. Konsultacja z ekspertem (Sonnet medium).
- `initClub` (`src/career/finance.js`) przyjmuje `opts.ownerMul`; `src/season/rollover.js` liczy mnożnik (`ownerFundingFor`)
  i wysyła graczowi list (`ownerFundingMessage`). Nastrój w `game.ownerMood` (stare zapisy: brak pola = 0).
- Test `tests/ownerFunding.test.mjs`, opis `docs/finanse.md` (Pieniądze właściciela na sezon).
Zostało / dalej:
- propozycje eksperta bez wdrożenia: zmiana właściciela, kryzys właściciela jako zdarzenie.

## Nov 24, 2026, profil A (komputer domowy), sprawdzenie finansów właścicieli (v1.23 Beta)
Zrobione (bez zmian w grze):
- `POPRAWKI.txt`: czy pieniądze właściciela dla klubu są sztywne. Wynik (agent Haiku low, zweryfikowane): kwoty są
  sztywne. Dopłata i skarbiec to stałe z `src/data/finanse_klubow.js` (`own(typ, kto, doplata, skarbiec)`), w planie
  sezonu `clubPlan` (`src/career/finance.js`), dopłata co miesiąc 1/12, skarbiec na start sezonu; zasobność wyliczana
  z tych kwot (`ownerWealth`, `src/career/owners.js`). Los tylko w decyzjach: prośby do zarządu (+-5 pkt), częściowa
  wypłata przy warunku (szansa z cierpliwości i temperamentu, 35-65 % kwoty), zgoda zarządu i miasta na inwestycje.
  Brak cech „hojność”, „rozrzutność” i zmienności kwot z sezonu na sezon.
Zostało / dalej:
- propozycja do decyzji właściciela: dopłata i skarbiec na sezon = kwota z danych x los zależny od cech właściciela
  (ambicja, temperament) i wyników klubu.

## Nov 24, 2026, profil A (komputer domowy), rywale na obozie za granicą (v1.23 Beta)
Zrobione:
- `POPRAWKI.txt` (do sprawdzenia: brak rywali na obozie zimowym w 4. sezonie): przyczyną nie był kalendarz kolejnych
  sezonów (pomiar 2026-2029 poprawny), tylko obóz za granicą (bez polskich klubów, z zagranicy tylko kraj obozu).
  Teraz polskie kluby na obozie i goście z całej Europy, głównie podobnego i niższego poziomu, rzadko silniejszy
  (`campGuests` w `src/training/friendlies.js`, `FRIENDLY` w `src/training/config.js`, testy `tests/friendlyPartners.test.mjs`,
  `tests/camps.test.mjs`, opis `docs/sparingi-i-karne.md`). Bez agenta (profil A, Opus), za zgodą właściciela.
Decyzje i pułapki:
- Właściciel: na obozach bywają drużyny z całej Europy (np. San Marino, Luksemburg): słabszy klub dostaje niższą półkę,
  silniejszy rywal tylko czasem.
Zostało / dalej:
- sprawdzenie finansów właścicieli (Haiku low), premie z kontraktów, oferty za zawodników innych klubów, menu obserwatora.

## Nov 24, 2026, profil A (komputer domowy), okno „Gra wstrzymana” w meczu (v1.23 Beta)
Zrobione:
- `POPRAWKI.txt`: okno z propozycjami asystenta po czerwonej kartce i urazie mieści się na tablecie i telefonie
  (`position: fixed`, limit wysokości, przewijana treść) i nie pojawia się bez asystenta w sztabie
  (`src/ui/matchdayView.js` `haltMode`, `hasAssistant`; `src/styles/matchday.css`; test w `tests/matchLiveUi.test.mjs`;
  opis `docs/odprawy-studio.md`). Zrzuty z prawdziwego meczu: tablet pion i poziom, telefon, z asystentem i bez.
- Model: Sonnet, wysiłek medium (zgoda właściciela); sprawdzenie i zrzuty: profil A.
Decyzje i pułapki:
- Zdarzenia zatrzymujące mecz (czerwona kartka, uraz) nie wymagają decyzji: silnik gra dalej, więc bez asystenta okna
  nie ma. Jedyna sytuacja decyzyjna to przypomnienie o bramkarzu przed karnymi (okno bez propozycji).
Zostało / dalej:
- sprawdzenie finansów właścicieli (Haiku low); później obozy zimowe w kolejnych sezonach, premie z kontraktów,
  oferty za zawodników innych klubów i menu obserwatora (większe).

## Nov 24, 2026, profil A (komputer domowy), więcej rywali do sparingów (v1.23 Beta)
Zrobione:
- Prośba właściciela (spoza `POPRAWKI.txt`): dłuższa lista rywali do sparingów: do 16 polskich (także o ligę wyżej,
  wyżej tylko z regionu, kilka z niższych lig) i do 8 zagranicznych (więcej krajów, bez Białorusi, tylko dla
  Ekstraklasy i 1 Ligi poza obozem), grupy Polska i Zagranica w widoku (`src/training/friendlies.js`,
  `src/training/config.js`, `src/ui/trainingView.js`, `src/styles/training.css`, test `tests/friendlyPartners.test.mjs`,
  opis `docs/sparingi-i-karne.md`). Bez agenta (profil A, Opus), za zgodą właściciela.
Zostało / dalej:
- okno sugestii zmian w meczu na tablecie i bez asystenta (Sonnet medium), sprawdzenie finansów właścicieli (Haiku low).

## Nov 24, 2026, profil A (komputer domowy), czyste konta bramkarzy (v1.23 Beta)
Zrobione:
- `POPRAWKI.txt`: czyste konta bramkarzy były zawsze 0, bo nic ich nie liczyło. Teraz liczone po meczu o punkty
  (bramkarz 60+ minut, drużyna bez straconego gola), w Kadrze i w kolumnie „CK” karty bramkarza
  (`src/season/season.js`, `src/season/history.js`, `src/ui/playerStatsView.js`, test `tests/cleanSheets.test.mjs`,
  opis `docs/historia-i-statystyki.md`). Bez agenta (profil A, Opus), za zgodą właściciela.
Decyzje i pułapki:
- Właściciel: przy błędach „widok nie pokazuje” najpierw sprawdzić, czy dane w ogóle są liczone.
- Premie z kontraktów (`contract.bonus`) nie są wypłacane nigdzie; dopisane do `POPRAWKI.txt` jako nowa pozycja.
Zostało / dalej:
- okno sugestii zmian na tablecie i bez asystenta (Sonnet medium), sprawdzenie finansów właścicieli (Haiku low).

## Nov 24, 2026, profil A (komputer domowy), oceny w oknie Zmiany i taktyka (v1.23 Beta)
Zrobione:
- `POPRAWKI.txt`: w oknie Zmiany i taktyka (także w przerwie) przy każdym zawodniku ocena na żywo jak na liście składu
  (`managePanel` w `src/ui/matchdayView.js`, kolumna w `src/styles/matchday.css`, test `tests/manageRatings.test.mjs`).
  Zrzuty PC i telefon z prawdziwego meczu (strona testowa z `mountMatchday`, bez zapisu gry).
- Model: Haiku, wysiłek low (zgoda właściciela); sprawdzenie i zrzuty: profil A.
Decyzje i pułapki:
- Żetony na boisku bez oceny (za małe), ocena w liście zawodników okna.
- Podgląd ekranu meczu bez kariery: strona z `mountMatchday(app, { game, fixture, save: () => {}, ... })`,
  potem toBriefing, speech:pre, kickoff, skip (wynik do przerwy), dlg:manage.
Zostało / dalej:
- czyste konta bramkarzy (Sonnet medium), okno sugestii zmian na tablecie i bez asystenta (Sonnet medium),
  sprawdzenie finansów właścicieli (Haiku low).

## Nov 24, 2026, profil A (komputer domowy), nagłówek o bohaterze po porażce (v1.23 Beta)
Zrobione:
- `POPRAWKI.txt`: zawodnik gracza nie dostaje już nagłówka „Gol w końcówce! … bohaterem” po przegranym meczu
  (bramka decydująca tylko zwycięzcy, `src/match/studio.js`, test w `tests/briefings.test.mjs`, opis w
  `docs/odprawy-studio.md`). Bez agenta (profil A, Opus), za zgodą właściciela.
- Pozycje zrobione w `POPRAWKI.txt` (plik lokalny właściciela, poza repozytorium) są przekreślone `~~…~~` z dopiskiem
  „ZROBIONE Nov 24, 2026”.
Decyzje i pułapki:
- Właściciel: duże zadania (oferty za zawodników innych klubów) później, najpierw mniejsze z listy.
Zostało / dalej (kolejność uzgodniona z właścicielem, modele do zgody przy każdym zadaniu):
- oceny w przerwie w oknie zmian i taktyki (Haiku low), czyste konta bramkarzy (Sonnet medium), okno sugestii zmian
  na tablecie i bez asystenta (Sonnet medium), sprawdzenie finansów właścicieli (Haiku low).

## Nov 24, 2026, profil A (komputer domowy), lista życzeń (v1.23 Beta)
Zrobione:
- `POPRAWKI.txt`, zadanie 5: lista życzeń gracza dla dowolnych zawodników spoza kadry (`src/career/wishlist.js`,
  `src/ui/transfersView.js`, `src/ui/playerMenus.js`, `src/ui/squadView.js`, `src/app.js`, `src/styles/transfers.css`,
  test `tests/wishlist.test.mjs`, opis `docs/transfery.md` „Lista życzeń gracza”).
- Model: Sonnet, wysiłek medium (zgoda właściciela); poprawki i zrzuty: profil A (bez kolumny „Dodano” i z przyciskiem ×,
  żeby tabela mieściła się na PC bez przewijania; własny zawodnik wypożyczony do innego klubu nie trafia na listę).
Decyzje i pułapki:
- Lista życzeń jest wyborem na liście Rynku (obok Wyszukaj), nie szóstą podzakładką: test Skautingu wymaga 5 podzakładek.
- Menu zawodnika innego klubu ma o jedną pozycję więcej (test `contextMenu` poprawiony).
Zostało / dalej:
- Zadanie 6 z `POPRAWKI.txt`: oferty za zawodników innych klubów (nie tylko z listy transferowej).

## Nov 24, 2026, profil A (komputer domowy), lepsza noga w karcie w okienku (v1.23 Beta)
Zrobione:
- `POPRAWKI.txt`, zadanie 4: fakt „Noga” (Lewa, Prawa, Obie, jak w profilu) w karcie zawodnika w okienku:
  Skład i taktyka (`src/ui/tacticsView.js`), mecz (`src/ui/matchdayView.js`), Transfery (`src/ui/transfersView.js`);
  `footLabel` eksportowany z `src/ui/squadView.js`. Zrzuty PC i telefon sprawdzone.
- Model: Haiku, wysiłek low (zgoda właściciela); sprawdzenie i zrzuty: profil A.
Decyzje i pułapki:
- Noga widoczna także w karcie kandydata skauta (jak w profilu zawodnika innego klubu).
Zostało / dalej:
- Zadanie 5 z `POPRAWKI.txt`: lista życzeń gracza (zawodnicy obserwowani).

## Nov 24, 2026, profil A (komputer domowy), okres aklimatyzacji nowego zawodnika (v1.23 Beta)
Zrobione:
- `POPRAWKI.txt`, zadanie 3: okres aklimatyzacji po zmianie klubu, po decyzji właściciela co najmniej rok
  (12-16 miesięcy): nowy zawodnik nie prosi o transfer, chyba że klub złamie obietnicę roli z kontraktu (obietnica
  rozliczana co miesiąc od Nov 24, 2026, wcześniej `applyPromiseCheck` nie był wywoływany); kluby AI rzadziej składają
  oferty za świeżo kupionego (`ACCLIM`, `acclimUntil` w `src/career/wishMemory.js`, `src/career/moveWish.js`, `src/career/transfers.js`,
  test `tests/acclimatization.test.mjs`, opis `docs/transfery.md` „Okres aklimatyzacji nowego zawodnika”).
- Modele (zgoda właściciela): ekspert piłkarski Sonnet medium (burza mózgów), wdrożenie Opus (profil A).
Decyzje i pułapki:
- Pomiar: przed poprawką świeżo kupieni prosili po odrzuconej ofercie częściej niż zawodnicy z długim stażem (82 wobec 75 na 160).
- Pierwsza wersja (3-8 miesięcy) poprawiona tego samego dnia na prośbę właściciela: „co najmniej po roku, chyba że trener
  obiecał skład i nie daje grać”.
- Propozycje eksperta niewdrożone (wykup z wypożyczenia, zwolniony trener) w `docs/transfery.md`.
Zostało / dalej:
- Zadanie 4 z `POPRAWKI.txt`: w karcie zawodnika w okienku brakuje lepszej nogi.

## Nov 24, 2026, profil A (komputer domowy), ławka sparingu w Skład i taktyka (v1.23 Beta)
Zrobione:
- `POPRAWKI.txt`, zadanie 2: Skład i taktyka przed sparingiem pokazuje całą ławkę sparingu (do 14), dobranych przez
  grę z podpisem „dobrany na sparing”, licznik „x z 14” (`src/ui/tacticsView.js`, `src/app.js`, `src/styles/app.css`,
  test w `tests/tacticsView.test.mjs`, opis `docs/sparingi-i-karne.md`).
- Model: Sonnet, wysiłek medium (zgoda właściciela), sprawdzenie i poprawki wyglądu: profil A.
Decyzje i pułapki:
- Właściciel zatwierdza model do każdego zadania przed startem (podać model i wysiłek, czekać na zgodę).
- Agent zamienił końce linii w `src/ui/tacticsView.js` (CRLF na LF, diff 663 linii); przywrócone CRLF. Po pracy agenta
  sprawdzać `git diff --stat` i format końców linii.
- Edytować da się nadal tylko miejsca ławki gracza; dobranych na sparing gracz nie zmienia (zasady bez zmian).
- Wiersz dobranego na sparing ma puste miejsce w kolumnie × (`tp-row__x--none`), żeby kolumny ławki były wyrównane
  (uwaga właściciela ze zrzutu ekranu).
Zostało / dalej:
- Zadanie 3 z `POPRAWKI.txt`: nowo podpisany zawodnik zbyt szybko chce odchodzić (okres aklimatyzacji + RNG).

## Nov 24, 2026, profil A (komputer domowy), oferty za zawodników z listy transferowej (v1.23 Beta)
Zrobione:
- Lista poprawek właściciela `POPRAWKI.txt` (lokalnie w katalogu repo, robione po jednym zadaniu), zadanie 1:
  kluby AI składają oferty za zawodników z listy transferowej gracza zależnie od ceny wobec wartości, wieku,
  kontraktu, budżetu płac i potrzeb kupca (`USER_OFFERS` w `src/career/transfers.js`, opis `docs/transfery.md`,
  test `tests/userOffers.test.mjs`). Kalibracja z ekspertem od rynku transferowego (agent Sonnet, medium).
Decyzje i pułapki:
- Właściciel: logikę transferów i futbolu konsultować z ekspertem (burza mózgów), model dobierać do zadania.
- Wcześniej wystawiony zawodnik mógł nie być w ogóle rozpatrzony (losowa ósemka kadry).
- Kupcy z zagranicy (`foreignMarket.js`) nie zmienieni: przy cenie 130 % dają ok. połowę ofert.
Zostało / dalej:
- Kolejne zadania z `POPRAWKI.txt` (następne: ławka w sparingach pokazuje tylko 9 rezerwowych).

## Nov 22, 2026, profil A (chmura), rozmowa z prezesem waży więcej (v1.23 Beta)
Zrobione:
- Scalony panel Zarządu, quiz prezesa, sztab do 12 (2480dd1).
- Rozmowa z prezesem waży więcej: S = punktacja + 1,5 Q (było 0,8) i działa jak sito: Q <= -6 najwyżej zgoda
  warunkowa, Q <= -10 zawsze odmowa, Q >= 8 podnosi odmowę do zgody warunkowej (gdy S >= 0). Opis w
  `docs/dyrektor-sportowy.md`, test w `tests/presidentQuiz.test.mjs`.
Decyzje i pułapki:
- Właściciel: „podrasuj trochę”; wcześniej przy zaufaniu 99 zarząd zgadzał się nawet po słabej rozmowie.
- Commity zostają z adresem jacekborucz@gmail.com mimo komunikatu hooka o „Unverified” (decyzja właściciela).
Zostało / dalej:
- Do decyzji: przeliczenie starego sztabu x 11/16 zamiast samego przycięcia do 12.

## Nov 22, 2026, agent (worktree, gałąź do scalenia), Zarząd klubu, rozmowa z prezesem, sztab 1-12 (v1.23 Beta)
Zrobione:
- Klub, Zarząd: panel „Zarząd klubu” na wolnym miejscu pod oceną zarządu (PC: cała szerokość pod Kibicami i Karierą,
  telefon: po Karierze): karta właściciela i prezesa (typ, opis, 5 cech z paskami) i dyrektora (jakość, umowa, pensja,
  staż, 4 atrybuty), tylko podgląd (`boardPeoplePanel` w `src/ui/boardRequestsView.js`, `boardView(game, { extra })`).
- Prośba „Poproś o zmianę dyrektora”, przycisk „Poproś o zmianę” otwiera rozmowę z prezesem (`src/career/presidentQuiz.js`,
  okno `src/ui/presidentQuizView.js`, `<dialog id="pqDlg">` w `app.js`, akcje `pq-*`): 4-5 pytań z `src/data/prezesQuiz.js`,
  dane z 6-12 miesięcy (wyniki, przepłaty, sprzeciwy, wypożyczenia), ton z cech, reakcje, kłamstwo kosztuje. Decyzja:
  S + 0,8 Q, zgoda od 10, warunkowa od 6 (ocena po 182 dniach, `reviewDirector`, `R.dirReview`), odmowa; Q <= -6: -1
  zaufania. Esc przed decyzją = prośba niezłożona. Teksty redaktora poprawione (odmiana, nazwiska w mianowniku, `reactionElse`).
- Sztab 1-12 (wszystkie role poza fizjoterapeutą i dyrektorem): generowanie, lista wolnych, wolni skauci, rozwój, migracja
  (`game.staff.attrs = 3`), edytor i datapack v7 (`MIGRATE[6]`). Efekty, progi i pensje na skali 1-20 przez `staffEff`
  (12 = dawne 17), widok `game.training.staff` na skali efektów (`qs` do pokazania). Pomiar: `docs/sztab.md` rozdz. 7.
- Wartości sztabu w liczbach całkowitych (Trening, Sztab: jakość roli i „Atrybuty roli”, raport drużyny, edytor; karta
  trenera AI w widoku klubu już bez ułamków).
- Testy: `tests/presidentQuiz.test.mjs` (9), `tests/staffCap.test.mjs` (6), poprawki w staffMarket, staffAttrs, scoutOps,
  editor, director, weeklyTodo.
Decyzje i pułapki:
- Prośba „przytnij do 12” wdrożona jako przeliczenie x 11/16 z przycięciem (samo przycięcie dałoby 12 prawie całej
  Ekstraklasie i zmieniłoby efekty); do potwierdzenia przez właściciela.
- Kod ról sztabu czytający osoby (`p.q`, `p.a`) jest na skali 1-12, a widok i efekty na 1-20: nowy kod liczący efekt
  z osoby musi użyć `staffEff(rola, wartość)`.
- `staffMarket.js` i `tests/staffMarket.test.mjs` nadal CRLF, `tests/editor.test.mjs` mieszane końce linii.
Zostało / dalej:
- Do decyzji: przeliczenie zamiast przycięcia; progi decyzji po rozmowie (10 / 6, 0,8 Q) bez symulacji wielu próśb.

## Nov 21, 2026, agent (worktree, gałąź do scalenia), sprzeciw i rotacja dyrektorów sportowych (v1.23 Beta)
Zrobione:
- Sprzeciw dyrektora klubu gracza (`docs/dyrektor-sportowy.md` rozdz. 9): kupno z odstępnym (przepłata od 25 % wobec
  wyceny dyrektora z błędem RYN) i sprzedaż (od 25 % poniżej wartości), szansa z różnicy i KAD, jeden rzut na
  zawodnika w pół sezonu, bez cudzych ofert, weto zarządu ma pierwszeństwo. Decyzje: wycofuję się, renegocjacja
  (NEG, 5-15 %, porażka: druga strona przy swojej kwocie, 8 % zrywa), nalegam (zaufanie -1/-2/-3, historia
  `game.board.requests.dirLog`, panel w Klub, Zarząd). Okno w karcie zawodnika i w Ofertach (`tf-dir`), list z decyzją
  przy ofercie z poczty (`dirObjection` w `careerSystem.js`). Kod: `director.js`, `transfers.js` (`answerDirector`).
- Rotacja (`src/career/directorRotation.js`, rozdz. 10): podebrania przez kluby AI (zasady sztabu, blokada zarządu 50 %),
  rezygnacje 2,5 %, zwolnienia przez właściciela 2 % na klub w sezonie, listy do gracza, liczniki `game.staff.dirRot`.
  Na sezon średnio 4,3 podebrania, 3,1 rezygnacji, 3,2 zwolnienia (rozdz. 11).
- Wakat w klubie AI (`aiDirectorWeek`): dyrektor na poziomie ligi (ponad średnią + 1 bez przewagi).
- Testy: `tests/directorObjection.test.mjs` (8); `tests/transferDeals.test.mjs`: oferta z zagranicy z `dirOk`.
Decyzje i pułapki:
- W październiku okno jest zamknięte: sprzeciw przy kupnie sprawdzony w przeglądarce na zapisie z lutego.
- `staffMarket.js` nadal CRLF; nowe eksporty: `toPool`, `removePerson`, `dropDirector`, `aiWage`, `poachBlocker`,
  `ownerLetter`, `closeHist`, `logDirectorMove`.
Zostało / dalej (do decyzji właściciela):
- Sprzeciw przy bardzo drogim kontrakcie (pensja) niewdrożony; Negocjacje dyrektorów Ekstraklasy +0,9 po 3 sezonach.

## Nov 21, 2026, profil A (chmura), dyrektor sportowy i warunek zarządu (v1.23 Beta)
Zrobione:
- Scalony dyrektor sportowy (27f2aae): opis w `docs/dyrektor-sportowy.md`.
- Błąd: spełniony warunek budżetu płac (1. miejsce) dawał list „Bez podwyżki” z karą -1, gdy płace przekraczały 80 %
  przychodów, a właściciel nie dopłacił. Teraz reakcja zarządu zależy od wyniku i właściciela (`condFinal`, opis
  w `docs/finanse.md`): cel = pieniądze w granicach finansów albo uczciwe wyjaśnienie bez kary; blisko celu = część
  kwoty albo wyrozumiałość (cechy właściciela, zaufanie, los); daleko = bez pieniędzy.
Zostało / dalej:
- Do decyzji z raportu dyrektora: NEG dyrektora gracza bez efektu dla gracza, podbieranie dyrektorów przez AI.

## Nov 21, 2026, agent (worktree, gałąź do scalenia), dyrektor sportowy w sztabie (v1.23 Beta)
Zrobione:
- Dyrektor sportowy jako osoba w każdym klubie z kadrą (gracz i AI): rola `dyrektor`, osobny slot poza limitem
  osób, pensja w budżecie sztabu, 4 atrybuty NEG, RYN, SIE, KAD (`ROLE_ATTRS.dyrektor`). Stan w `game.staff`
  (`dir`, `dirPool`, `dirInit`, `dirYear`, `dirIntro`), wpływ atrybutów w nowym `src/career/director.js`.
- Migracja: NEG = dawny `game.clubNeg[klub].n` (rozkład dokładnie dawny), `clubNegotiation` czyta dyrektora (wakat 5),
  `staffBase` += pensja dyrektora (pierwszy dzień neutralny). `negSeason` woła `directorSeason` (zmiany przez osoby,
  dawne szanse i limit 3 na ligę, zwolniony na listę wolnych), lista 12-16 wolnych dyrektorów.
- Efekty: RYN błąd wyceny AI (`askingPrice`, `aiBuy`) i widełki pensji w rozmowach gracza (`hidden.minOwn`, pokrycie
  ok. 90 %); SIE wypożyczenia gracza i kolejność AI w `marketWeek` (waga 0,025 po kalibracji); KAD spór z trenerem
  rezerw i `feeMul` w `aiNegotiate` (zakupy, oferty, przedłużenia AI z NEG).
- Decyzja właściciela w trakcie pracy: o dyrektorze klubu gracza decyduje zarząd. Gracz tylko prosi o zmianę
  (nowa prośba `director` w `boardRequests.js`, `directorScore`, opcjonalny kandydat, list z powodem odmowy).
  Karta w Trening, Sztab tylko do podglądu; rynek dyrektorów do podglądu; zarząd zmienia dyrektora 1 lipca jak AI
  i sam obsadza wakat (list).
- Listy „Dyrektor sportowy” podpisane imieniem dyrektora (wakat: Zarząd), `registerMailHook` w `gameLoop.js`.
- Datapack v6 (rola `dyrektor` w `staff`), edytor, `tools/check-datapack.mjs`; `tools/negocjacje-fair.mjs` z tabelami
  NEG, KAD, SIE, razem i RYN; `tools/transfery-kalibracja.mjs` pokazuje NEG dyrektorów wg ligi.
- Testy: `tests/director.test.mjs` (12), poprawki w offerFactors, staffMarket, staffView, staffAttrs, reserves,
  boardRequests, scoutOps. Dokumentacja: `docs/dyrektor-sportowy.md` (kalibracja w rozdz. 7).
Decyzje i pułapki:
- `src/career/staffMarket.js` ma końce linii CRLF (zachowane).
- Cykl importów `clubNegotiation` <-> `staffMarket` (tylko wywołania w funkcjach); `negSeason` nie woła `ensureStaff`,
  bo w czasie rollover `staffNewSeason` jeszcze nie przeszedł.
- Widełki: obcięcie b do ±x z planu dawałoby prawie 100 % pokrycia, więc sd = x / 1,645 i obcięcie ±1,5x.
Zostało / dalej (do decyzji właściciela):
- NEG dyrektora gracza nic graczowi nie daje; błąd wyceny przy RYN 10 to 12,9 %; kluby AI nie podbierają dyrektorów;
  progi prośby o zmianę dyrektora (S 10, kandydat 75 %) bez symulacji wielu sezonów.

## Nov 21, 2026, profil A (chmura), prośby o transfer w niższych ligach (v1.23 Beta)
Zrobione:
- Scalona pamięć prośby o transfer (`src/career/wishMemory.js`, 7c7eb19).
- Osobna baza ryzyka prośby dla 1 Ligi i niżej (`WISH.baseLow` 0,0008, Ekstraklasa 0,0012): średnio 73 prośby
  na sezon we wszystkich ligach (cel właściciela 60-85), Ekstraklasa bez zmian.
Decyzje i pułapki:
- Właściciel: kluby AI zostają przy uspokojeniu podwyżką ok. 30 %; wersja zostaje v1.23 Beta.
Zostało / dalej:
- Brak.

## Nov 21, 2026, agent (worktree, gałąź do scalenia), pamięć prośby o transfer (v1.23 Beta)
Zrobione:
- Koniec pętli „przedłużenie z podwyżką, oferta, prośba, podwyżka”: zawodnik pamięta odrzucone oferty i podwyżki
  (`p.wishMemory`, nowy moduł `src/career/wishMemory.js`). Odrzucona oferta to jeden rzut najwyżej raz na 30 dni:
  cicha prośba, rozczarowany (zostaje, morale -2, bez listu) albo spokojny (4-8 miesięcy, kolejne oferty x0,5).
- Czas spokoju po nowym kontrakcie (D z lojalności, cierpliwości, ambicji; po podwyżce wymuszonej prośbą D x q),
  pamięć odmów w 12 miesiącach, skok reputacji, „poczekam do lata” (ostatnie 10 dni okna), oferta marzeń z urazą,
  gaśnięcie rozczarowania co miesiąc. Ryzyko miesięczne mnoży fSpokój i fPamięć.
- Podwyżka przy prośbie uspokaja z szansą 0,1-0,85 (druga w 12 miesiącach x0,5); rozmowa ma częściowy sukces
  (cicha prośba zamienia się w rozczarowanie) i +0,1 do 60 dni po podwyżce; obietnica wygasa bez kary po oknie bez
  oferty (zawodnik rozczarowany, list). Kluby AI: ten sam rzut przy podwyżce, porażka = lista transferowa.
- UI: linia „Plany” w profilu, panel „Plany zawodnika” w karcie transferowej, znacznik „?” w Kadrze, rozczarowani
  na liście próśb w W toku, wynik rozmów mówi, czy podwyżka przekonała, odpowiedź po odrzuceniu oferty mówi o stanie.
- Kalibracja: WISH.base 0,0008 -> 0,0012 (Ekstraklasa śr. 18,8 prośby na sezon), tabela w `transfery.md` rozdz. 4.
  Testy `tests/wishMemory.test.mjs` (12).
Decyzje i pułapki:
- `applyOutcome(player, out, { seed })`: przedłużenie woła `noteRenewal` (nie kasuje już prośby bez rzutu).
- Czas spokoju liczy też kontrakty z datą podpisu (przedłużenia AI, transfery), kontrakty startowe nie.
- Dawny człon -0,15 za świeży kontrakt usunięty z `rejectTriggerP` (zastąpił go fSpokój). Usunięte -2 morale dla
  „Ambitny” przy odrzuceniu oferty w `transfers.js` (zastąpił je stan rozczarowany).
- Eskalacja w 30 dniach: tylko rozczarowany przechodzi w cichą prośbę; spokojny zostaje spokojny.
Zostało / dalej:
- Do decyzji: w klubach AI podwyżka uspokaja ok. 30 % (wg wzoru), reszta trafia na listę; prośby w niższych ligach
  wzrosły (base 0,0012). Ewentualnie osobny base dla lig 2-4.

## Nov 21, 2026, profil A (chmura), menu zawodnika w Treningu (v1.23 Beta)
Zrobione:
- Trening > Zawodnicy: prawy przycisk działa na całym panelu zawodnika (wcześniej tylko na nazwisku).
- „Profil zawodnika” z menu w Treningu otwiera kartę w okienku (ta sama co w Transferach: atrybuty, pozycje,
  statystyki, kontrakt), bez przejścia do Kadry. Akcja `pcard` w `src/app.js`, `NAV.pcard` w `playerMenus.js`.
- Okienko karty działa w Transferach i Treningu; zmiana zakładki je zamyka.
Zostało / dalej:
- Pulpit: „Profil zawodnika” z menu też w okienku (prośba właściciela). Skład i taktyka ma kartę „Atrybuty” na ekranie.

## Nov 21, 2026, profil A (chmura), wersja v1.23 Beta
Zrobione:
- Wersja v1.23 Beta (decyzja właściciela): poprawki warunku zarządu po zmianie sezonu i akademii z datapacku.
Decyzje i pułapki:
- Akademia z datapacku: tylko nowa kariera, bez migracji trwających karier (decyzja właściciela).
Zostało / dalej:
- Otwarte pytania o negocjacje AI: szansa poprawki w ciemno (0,35), „chce wrócić do domu” w samych rozmowach.

## Nov 21, 2026, profil A (chmura), datapack: dorośli w akademii (v1.22 Beta)
Zrobione:
- Błąd: datapack zmienia dane zawodnika, a nie jego miejsce w klubie, więc prawdziwy 32-latek wpisany na miejsce
  juniora (`<klub>-a1` ... `-a7`) zostawał w akademii. Teraz po wczytaniu zawodnik od 19 lat przechodzi do pierwszej
  drużyny (kontrakt rynkowy 3 lata, 30+ 2, 33+ 1), przy pełnej kadrze (32) do wolnych (`fixAcademyAges`).
- Podsumowanie importu podaje liczbę przeniesionych; `tools/check-datapack.mjs` ostrzega; opis w `docs/edytor.md`,
  `docs/datapack/agenci.md`, `docs/funkcje.md`. Test w `tests/editor.test.mjs`.
Decyzje i pułapki:
- Granica 19 lat jak na koniec sezonu (`processAcademy` w rollover.js).
Zostało / dalej:
- Już wczytane kariery: poprawka działa przy kolejnym wczytaniu datapacku (nowa kariera); w trwającej karierze 19+ z akademii wyjdą 1 lipca.

## Nov 21, 2026, profil A (chmura), warunek zarządu po zmianie sezonu (v1.22 Beta)
Zrobione:
- Błąd: warunek zarządu (np. budżet płac za 1. miejsce) z terminem po 1 lipca rozliczał się z nowej, pustej tabeli,
  więc mistrz dostawał „drużyna jest na 15. miejscu”. Teraz warunek z poprzedniego sezonu bierze miejsce na koniec
  sezonu z archiwum (`lastSeasonPos` w `src/career/board.js`), a w nowym sezonie rozliczenie czeka do 4 meczów.
- Teksty: „Bez podwyżki od zarządu” / „Zarząd dotrzymuje słowa”, „umawialiśmy się na 1. miejsce, a drużyna
  zakończyła sezon na X. miejscu”; bez „co najwyżej” i bez „1. miejsce lub wyżej”. Warunek ma pole `season`.
- Test regresji w `tests/boardRequests.test.mjs`.
Decyzje i pułapki:
- Sprawdzone pozostałe miejsca z tabelą na starcie sezonu (ocena zarządu, kibice, sponsorzy, presja, cel w trakcie
  sezonu, historia trenera): mają próg meczów albo archiwum.
Zostało / dalej:
- Do decyzji właściciela: v1.23 czy w v1.22.

## Nov 21, 2026, agent (worktree, gałąź do scalenia), negocjacje klubów AI i klocki decyzji zawodnika (v1.21.1 Beta)
Zrobione:
- Ukryty atrybut klubu AI „Negocjacje” 1-20 (`src/career/clubNegotiation.js`, zapis `game.clubNeg`, leniwe losowanie):
  średnia wg ligi (11,5 / 10,5 / 9 / 8), prestiż ±1, 1 lipca powrót do średniej i zmiany dyrektorów (najwyżej 3 na ligę,
  częściej po zwolnieniu trenera i spadku), wiadomość w Mediach tylko z ligi gracza, bez wartości. Nigdzie w UI.
- `aiNegotiate(..., neg)`: pierwsza oferta, podwyżka w 2. rundzie i limit poprawki w ciemno z atrybutu (skala 0,6 po
  kalibracji); zakupy AI i oferty AI za zawodników gracza. Podwyżka w 2. rundzie teraz też w progach zarządu.
- Licytacja w ciemno (`proposals.js`): po cudzej propozycji klub AI raz poprawia swoją (4-12 %, bez znajomości kwoty),
  gracz dostaje list agenta i w W toku przyciski „Pensja +4/8/12 %” (raz, limity jak w rozmowach). Pensja w wierszu
  propozycji dokładnie (`formatZl`).
- Kara licytacji w `aiBuy` losowa: `max(0; 0,8 - 0,05 (N - 10) + N(0; 0,6))` OVR zamiast 1,2.
- Klocki decyzji zawodnika (`src/career/offerFactors.js`): dawny wzór bez zmian liczb (test regresji) plus miasto
  i rodzina, stabilność klubu, pierwszeństwo oferty (każdy ±0,3). Szum wyboru 0,107 (11 000 vs 10 000 zł: ok. 73 %),
  `THINK.accept` 0,787.
- Pomiar `tools/negocjacje-fair.mjs`: N 1-5 47,9 %, N 9-11 50,3 %, N 16-20 52,4 % wygranych licytacji z przeciętnym
  negocjatorem, różnica przepłat do 1,33 pp. OVR top14 Ekstraklasy: dryf najwyżej 0,05. Perf: sezon 9,8 s (przed 11,3 s).
- Testy: `tests/offerFactors.test.mjs` (12), poprawiony test „chce zmian” w `tests/proposals.test.mjs`.
  Docs: negocjacje.md rozdz. 9, 14, nowe 15 i 16; transfery.md rozdz. 10; funkcje.md (3 nowe linie, 1 poprawiona).
Decyzje i pułapki:
- Później wejdzie dyrektor sportowy w sztabie (gracz i AI) z co najmniej 4 atrybutami, w tym Negocjacje; jego atrybut
  zastąpi ukryty atrybut przez jedną funkcję `clubNegotiation(game, clubId)` (docs/kolejka.md).
- Stabilność klubu liczona względem mediany wszystkich klubów w danym dniu: stała granica (3,5 miesiąca) przesuwała
  ocenę w dół w drugiej połowie sezonu i zmniejszała liczbę prekontraktów o ok. 14 %.
- `negotiation.js` (otwarcie rozmów) nadal czyta nieistniejące `player.homeRegion`: nastawienie „Chce wrócić do domu”
  działa w ocenie ofert, ale nie w samych rozmowach (do decyzji właściciela).
Zostało / dalej:
- Do decyzji: skala 0,6, szansa poprawki AI (0,35 + 0,3 przy braku), „wybrał inny klub” prawie 2 razy częściej niż
  przed zmianą (licytacje częstsze przy niższej karze i większym szumie).

## Nov 20, 2026, profil A (chmura), plan: negocjacje AI i dyrektor sportowy (v1.21.1 Beta)
Zrobione:
- Decyzja właściciela: kluby AI dostaną ukryty, losowy atrybut „Negocjacje” (1-20, losowany co jakiś czas),
  który udaje dyrektora sportowego. Gracz negocjuje sam, AI ma los plus atrybut. Oferty są tajne (zna je tylko zawodnik).
- Czynniki decyzji zawodnika jako klocki do łatwej rozbudowy (początek pakietu „Psychika zawodnika”).
- W `docs/kolejka.md` nowa pozycja: prawdziwy dyrektor sportowy w sztabie, co najmniej 4 atrybuty, w tym Negocjacje.
Decyzje i pułapki:
- AI ma mieć równe szanse z graczem, najwyżej ledwo odczuwalnie większe.
Zostało / dalej:
- Burza mózgów 4 ekspertów (transfery, dyrektor sportowy Ekstraklasy, psycholog, matematyk), plan, wdrożenie (Opus).

## Nov 20, 2026, profil A (chmura), wersja v1.21.1 Beta
Zrobione:
- Właściciel ustalił wersję v1.21.1 Beta (`src/config/version.js`). Zawiera: okno do 9 września, ranking UEFA
  z prawdziwych danych, spis funkcji `docs/funkcje.md`, namysł zawodnika przed podpisem.
Decyzje i pułapki:
- Trzecia liczba wersji tylko na prośbę właściciela; zwykła zasada podnoszenia (v1.22 itd.) bez zmian.
Zostało / dalej:
- Do decyzji: szansa zgody przy namyśle, OVR Ekstraklasy w 3. sezonie (-0,1), kara 1,2 OVR za licytację tylko dla AI.

## Nov 20, 2026, agent (worktree, gałąź do scalenia), namysł zawodnika przed podpisem (v1.21 Beta)
Zrobione:
- Nowy moduł `src/career/proposals.js` (stan `game.market.pending`): udane rozmowy gracza i klubów AI to propozycja,
  nie podpis. Zawodnik namyśla się 2-5 dni (3 + RNG od -1 do +2, ziarno: seed, zawodnik, klub, data), zawodnik
  z klubem najpóźniej do ostatniego dnia okna. W tym czasie inne kluby (gracz i AI, jedna propozycja na klub) mogą
  złożyć własne; w dniu decyzji porównuje wszystkie wzorem `offerUtility` z prekontraktów.
- Odpowiedzi w liście (klucz `namysl:`, odnośniki w `mailLinks.js`): zgoda (transakcja od testów medycznych), odmowa
  (blokada 14 dni bez urazy), wybrał inny klub, chce zmian (ostatnia runda rozmów do 2 dni: ultimatum, porozumienie
  to podpis od razu, słabsza oferta to fiasko). Klub AI przy „chce zmian”: pensja +10 % w budżecie albo rezygnacja.
- Kluby AI (`aiBuy`) i przyjęcie oferty klubu AI za zawodnika gracza (`answerIncoming`) też przez propozycje.
  Odstępne propozycji w toku zarezerwowane (`pendingFees`). Klub AI czeka na odpowiedź przed kolejnym zakupem,
  zawodnika w namyśle ocenia o 1,2 OVR niżej za każdą propozycję, po odmowie albo przegranej szuka dalej w tym tygodniu.
- UI: ekran rozmów „Propozycja złożona, zawodnik odpowie ok. <data>” i tryb ostatniej rundy (`tf-lastround`),
  W toku: „Propozycje czekają na odpowiedź” (wycofanie, ostatnia runda) i „Ostatnie odpowiedzi zawodników”, karta
  transferowa i okienko karty („Status: Rozważa oferty, odpowie do ...”), kwadrat TR z obrysem w Kadrze, znacznik
  w Kontraktach, sprawa w „Do zrobienia”.
- Testy: `tests/proposals.test.mjs` (12), poprawione `tests/career.test.mjs` i `tests/transferDeals.test.mjs`.
  Docs: transfery.md rozdz. 10 (z kalibracją), negocjacje.md rozdz. 9, 10, 13 i nowy 14.
Decyzje i pułapki:
- Poprawka przy okazji: `applyOutcome` zapisuje nowy kontrakt tylko przy przedłużeniu. Wcześniej porozumienie przy
  podpisaniu (także prekontrakt) od razu nadpisywało obecny kontrakt zawodnika w starym klubie.
- Decyzja w ostatnim dniu okna zapada od razu po akcji gracza (`resolveNow`), bo systemy dnia już się wykonały.
- Prekontrakty, przedłużenia, wypożyczenia, prawo pierwokupu, limit kadry (zarząd) i sprzedaż za granicę bez namysłu.
- Kalibracja 5 ziaren: OVR top14 Ekstraklasy po 1. i 2. sezonie bez zmian (11,63 i 11,77 wobec 11,63 i 11,79),
  po 3. sezonie 11,73 wobec 11,84 (we wszystkich ziarnach niżej o ok. 0,1). Perf: sezon 11,1 s (przed 11,5 s).
Zostało / dalej:
- Do decyzji właściciela: progi szansy zgody (0,78 + 0,4 x różnica, 0,5-0,92), „chce zmian” 60 %, pensja +8-18 %,
  termin 2 dni, blokada po odmowie 14 dni [SZAC]; obserwować trzeci sezon Ekstraklasy (OVR ok. 0,1 niżej).

## Nov 20, 2026, profil A (chmura), spis funkcji gry (v1.21 Beta)
Zrobione:
- Nowy `docs/funkcje.md` (13 działów, ok. 195 pozycji): co robi, gdzie w grze, plik kodu, dokument.
- Reguła w `CLAUDE.md` i w zasadach dziennika: najpierw spis funkcji, potem kod; nowa funkcja dopisuje swoją linię.
- `docs/transfery.md` rozdz. 5: aktualne daty letniego okna (1 lipca - 9 września).
Decyzje i pułapki:
- Prośba właściciela: dokumentacja ma pozwalać sprawdzić, czy funkcja istnieje, bez szukania w kodzie.
Zostało / dalej:
- Namysł zawodnika przed podpisem (2-5 dni, wybór najlepszej oferty): agent w toku.

## Nov 20, 2026, profil B, ranking UEFA: prawdziwe współczynniki 5 sezonów (v1.21 Beta)
Zrobione:
- Dane: `tools/uefa-ranking-gen.mjs` czyta plik właściciela `tools/data/ranking_uefa_2026_27.txt` (55 federacji, 415 klubów,
  sprawdza sumy i progi) i zapisuje `src/data/ranking_uefa.json`. 165 klubów gry połączonych z rankingiem (155 ze 156
  zagranicznych i 10 polskich); bez wpisu: Dniepr Mohylew. Aliasy nazw w `ALIASES` (opis w docs/kluby_uefa.md).
- `src/season/uefaCoef.js`: współczynnik klubu = max(punkty własne z 5 sezonów, 20 % kraju), kraj = suma 5 sezonów,
  punkty sezonu z rozgrywek w grze (eliminacje połową tylko dla kraju, stałe punkty odpadłych w eliminacjach, premie LM 6,
  miejsca 1-8, 1/4, 1/2, finał [SZAC]). Zapis `game.uefaCoef` (okno 5 sezonów + `prev`), migracja starych zapisów.
- Koniec sezonu (rollover): sezon z gry do okna, przesunięcie okna, `game.countryCoef` = suma 5 sezonów. Lista dostępu jak
  w UEFA: ranking po sezonie N-2 (pierwszy raz Polska 12. po 2025/26). Rozstawienia (`coefOf`): ranking po poprzednim
  sezonie; w 2026/27 dane startowe z kluby_uefa.json. Wiadomość i Historia: miejsce po sezonie i miejsce do przydziału.
- Widok: Rozgrywki > LM/LE/LK > „Ranking UEFA” z przełącznikiem Kluby i Kraje (5 sezonów, punkty własne, próg 20 %,
  współczynnik, zmiana od początku sezonu, filtr kraju, polskie wiersze wyróżnione, setka klubów i „Pokaż wszystkie”).
- Testy: `tests/uefaCoef.test.mjs` (nowy), asercje w `tests/multiseason.test.mjs`; `tools/multiseason.mjs` pokazuje ranking.
Decyzje i pułapki:
- Gra symuluje ok. 160 klubów zamiast ok. 230: dzielnik kraju to prawdziwa liczba klubów z pliku, brakujące liczone po 1 pkt
  [SZAC]. Bez tego kraj z jednym klubem w grze (Islandia) dostawał 11,5 za sezon i rósł w rankingu.
- Reputacja: `POL_COEF_BASE` 35 -> 45,725 (Polska na start gry), bo `game.countryCoef` ma teraz prawdziwą sumę 5 sezonów
  (test infrastruktury zaktualizowany).
- Symulacja 5 sezonów (`node tools/multiseason.mjs widzew 5 5`): Polska 12.-15., bez błędów.
- `reputation.js`, `uefa.js`, `app.css` mają końce linii CRLF (app.css miesza CRLF i LF): edytować bez ich zmiany.
Zostało / dalej:
- Premie za fazę ligową i pucharową to dopasowanie do 2024/25 [SZAC]; warto sprawdzić w regulaminie UEFA.

## Nov 20, 2026, profil A (chmura), okno transferowe 9 września (v1.21 Beta)
Zrobione:
- Letnie okno transferowe co roku stałe: 1 lipca do 9 września (`src/config/calendar2026.js`: BASE i `setSeasonYear`;
  `src/career/scoutOps.js`: termin dołączenia zawodnika z klubu w następnym oknie).
- Infrastruktura: klub AI ponawia wniosek licencyjny 1 lipca przed rozliczeniem kary (`infraSeason`). Wcześniej po
  odmowie zarządu w czerwcu kara wpadała, zanim AI mogło złożyć nowy wniosek; gracz może go złożyć od razu.
- Testy dat okna: gameLoop, negotiationView, weeklyTodo, transferDeals.
Decyzje i pułapki:
- Właściciel: data 9 września sztywno co roku (ruchomy kalendarz nie przesuwa końca okna).
- Błąd licencji AI wyszedł przy innej ścieżce RNG (multiseason, Resovia w 1 Lidze z saldem -376 tys.).
Zostało / dalej:
- Spis funkcji gry w docs (prośba właściciela: najpierw dokumentacja, potem kod).


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
