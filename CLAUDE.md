# LigaPL27 (Manager Piłkarski): instrukcje dla Claude

Prywatna gra menedżerska PWA (vanilla ES modules, bez budowania), mobile-first, UI po polsku.
Przed pracą przeczytaj `docs/PRZEKAZANIE.md` (role agentów, decyzje, pułapki) i `docs/PLAN.md` (specyfikacja).

## Tryb pracy
- Po „wykonaj”, „dodaj”, „zacznij prace”, „tak”, „wdroz”: sam edytuj, testuj, commituj i pushuj na `main`, bez dodatkowego pytania.
- Pytaj (krótko, z opcjami i przykładem liczbowym w języku gracza) tylko o decyzje projektowe: zasady gry, balans, zakres.
- Propozycje dodatkowych zmian kończ pytaniem i nie zaczynaj ich bez zgody.
- „zostaw”, „czekaj”, „nic nie rob” traktuj dosłownie.
- „Skonsultuj z grafikiem / ekspertem / psychologiem ...”: uruchom agentów z rolami z `docs/PRZEKAZANIE.md` (rozdział 2), potem wdrażaj. Wygląd: skill `frontend-design`.
- Przed naprawą sprawdź, czy podobny problem już był (`docs/PRZEKAZANIE.md` rozdział 7, historia commitów), i powiedz o tym.
- Nie udawaj, że działa: najpierw testy i sprawdzenie w przeglądarce (PC 1600 px, telefon 390 px), potem raport.

## Zasady gry (nie łamać)
- Bez kont, logowania, serwera, Google Drive i Web Share.
- Bez sztucznych sufitów i suwaków trudności: wynik = mechanika + RNG. Gracz i AI mają te same zasady.
- Nie zawyżać siły polskiej piłki na arenie międzynarodowej.

## Przed każdym commitem
0. Wersja gry w `src/config/version.js` (`GAME_VERSION`, widać ją w Opcjach): każda poprawka gry podnosi liczbę po kropce o 1
   (v1.11 Beta -> v1.12 Beta -> ... -> v1.99 -> v1.100). Pierwszą liczbę i dopisek (Beta) zmienia tylko właściciel.
   Numer wersji wpisz też na końcu opisu commita, np. „... (v1.12 Beta)”.
   Wyjątek: mała poprawka, która dopracowuje ostatnią zmianę na prośbę właściciela (np. „usuń puste miejsca w tym panelu”),
   wchodzi do bieżącej wersji bez podnoszenia numeru. W razie wątpliwości zapytaj.
1. `npm test` (trwa ponad 2 min: limit 600000 ms albo tło). Sprawdź wynik osobno, nie w potoku `&&`.
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
