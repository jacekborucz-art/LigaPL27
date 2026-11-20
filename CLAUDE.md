# LigaPL27 (Manager Piłkarski): instrukcje dla Claude

Prywatna gra menedżerska PWA (vanilla ES modules, bez budowania), mobile-first, UI po polsku.
Przed pracą: `git pull`, potem przeczytaj najnowsze wpisy `docs/dziennik.md` (co zmieniły inne profile Claude),
`docs/PRZEKAZANIE.md` (rozdział 0: praca wielu profili; role agentów, decyzje, pułapki), `docs/kolejka.md` i `docs/PLAN.md` (specyfikacja).
Po każdej skończonej pracy dopisz wpis na górze listy w `docs/dziennik.md` (szablon w pliku) i wypchnij go na `main`:
następny profil Claude zna tylko to, co jest w repozytorium.
Spis funkcji gry: `docs/funkcje.md`. Pytanie „czy to już jest w grze?” zaczynaj od spisu, potem dokument szczegółowy
z pozycji, dopiero potem kod. Każda nowa lub zmieniona funkcja dopisuje albo poprawia swoją linię w spisie w tym samym commicie.

## Tryb pracy
- Po „wykonaj”, „dodaj”, „zacznij prace”, „tak”, „wdroz”: sam edytuj, testuj, commituj i pushuj na `main`, bez dodatkowego pytania.
- Pytaj (krótko, z opcjami i przykładem liczbowym w języku gracza) tylko o decyzje projektowe: zasady gry, balans, zakres.
- Propozycje dodatkowych zmian kończ pytaniem i nie zaczynaj ich bez zgody.
- „zostaw”, „czekaj”, „nic nie rob” traktuj dosłownie.
- „Skonsultuj z grafikiem / ekspertem / psychologiem ...”: uruchom agentów z rolami z `docs/PRZEKAZANIE.md` (rozdział 2), potem wdrażaj. Wygląd: skill `frontend-design`.
- Przed naprawą sprawdź, czy podobny problem już był (`docs/PRZEKAZANIE.md` rozdział 7, historia commitów), i powiedz o tym.
- Nie udawaj, że działa: najpierw testy i sprawdzenie w przeglądarce (PC 1600 px, telefon 390 px), potem raport.

## Agenci: model i wysiłek
- Każdy agent dostaje model i poziom wysiłku dopasowany do zadania. Przed uruchomieniem pokaż właścicielowi
  listę agentów z modelem i wysiłkiem i czekaj na zatwierdzenie.
- Dobór:
  - Opus, wysiłek high: projektowanie mechaniki i balansu, silnik meczu, kalibracja, wdrożenia dużych zmian logiki,
    kontrola jakości (QA) i weryfikacja cudzej pracy.
  - Sonnet, wysiłek medium: research i burza mózgów ekspertów, notatki z kodu, projekt wyglądu,
    średnie wdrożenia (nowy widok, poprawki w kilku plikach).
  - Haiku, wysiłek low: proste wyszukiwanie w kodzie, zbieranie danych z plików, drobne poprawki tekstów i stylów,
    uruchamianie testów i symulacji z gotowych skryptów.
- Gdy kilku agentów pracuje równolegle, każdy może mieć inny model, np. projekt (Opus, high) i research (Sonnet, medium).
- Wątpliwość co do trudności: wyższy model.

## Zasady gry (nie łamać)
- Bez kont, logowania, serwera, Google Drive i Web Share.
- Bez sztucznych sufitów i suwaków trudności: wynik = mechanika + RNG. Gracz i AI mają te same zasady.
- Nie zawyżać siły polskiej piłki na arenie międzynarodowej.

## Przed każdym commitem
0. Wersja gry w `src/config/version.js` (`GAME_VERSION`, widać ją w Opcjach): każda poprawka gry podnosi liczbę po kropce o 1
   (v1.11 Beta -> v1.12 Beta -> ... -> v1.99 -> v1.100). Pierwszą liczbę i dopisek (Beta) zmienia tylko właściciel.
   Numer wersji wpisz też na końcu opisu commita, np. „... (v1.12 Beta)”.
   Wyjątek: mała poprawka, która dopracowuje ostatnią zmianę na prośbę właściciela (np. „usuń puste miejsca w tym panelu”),
   wchodzi do bieżącej wersji bez podnoszenia numeru. Przed podniesieniem numeru zawsze zapytaj właściciela (jedno pytanie: „podnieść wersję?”).
1. Poprawki wizualne (tylko CSS, układ, teksty i HTML widoków w `src/ui/`, bez zmian logiki gry): bez pełnego `npm test`.
   Wystarczy `node --test` dla testów danego widoku (np. `tests/sysMenu.test.mjs`) i `tests/core.test.mjs` (sw.js),
   jeden zrzut ekranu PC i telefonu. Przeglądarkę testową czyść przez CDP `Network.clearBrowserCache` i wyrejestrowanie
   service workera. Zmiany logiki i funkcjonalności: zawsze pełny `npm test` jak niżej.
   `npm test` (trwa ponad 2 min: limit 600000 ms albo tło). Sprawdź wynik osobno, nie w potoku `&&`.
2. `npm run sw` po dodaniu, usunięciu lub zmianie dowolnego pliku gry (inaczej telefony nie dostaną zmiany).
3. Commit po polsku, jedno zdanie o efekcie dla gracza, bez prefiksów feat/fix:
   `git -c user.name="Jacek Borucz" -c user.email=jacekborucz@gmail.com commit ...` (zawsze ten adres).
4. `git push -q origin main`. Gałęzi `wip-agenci` nie scalać.

## Formatowanie
- Bez pauzy em (—) nigdzie: odpowiedzi, docs/, UI, commity.
- Bez etykiet WIELKIMI LITERAMI w UI.
- Daty w odpowiedziach i `docs/`: „Nov 15, 2026”. W grze po polsku: „20 paź 2026” (`fmtDate` w `src/ui/dom.js`).
- Szacunki oznaczaj `[SZAC]`. Odpowiedzi po polsku, krótko, prostymi słowami.

## Kod
- Kod po angielsku, komentarze i UI po polsku. Tekst w UI zawsze przez `esc()`.
- Kliknięcia: `data-act` w `dispatchAct` (`src/app.js`); INPUT/SELECT w listenerze `change`.
- Pozycje: BR, ŚO, BO, WB, DP, ŚP, OP, BP, SN, NAP. „SP” w zdarzeniach meczu = stały fragment gry.
- Poziomy lig: 1 Ekstraklasa, 2 = 1 Liga, 3 = 2 Liga, 4 = III liga, 5 = IV liga.
- Nazwy pobieranych plików tylko ASCII. Nowe widoki muszą obsłużyć zawodnika bez kontraktu i bez klubu.
- Wydajność: `npm run perf` (tools/perf.mjs) mierzy czas sezonu i systemów dnia i porównuje z `tools/perf-baseline.json`;
  `npm run perf -- widzew 5 2027-06-30 --save` zapisuje nowy punkt odniesienia. Nie jest częścią `npm test`.
