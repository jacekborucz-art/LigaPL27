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
