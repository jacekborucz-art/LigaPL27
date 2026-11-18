# Przekazanie projektu LigaPL27 (Manager Piłkarski)

Stan na Nov 15, 2026, ostatni commit przed tym plikiem: `9b4403e` na `main`.
Dokument dla nowej sesji Claude, która nie zna historii rozmów. Źródła: repozytorium (docs/, kod, 139 commitów),
transkrypt bieżącej sesji (od Nov 10, 2026, wiadomość „kontynuuj z etapem 8”) i podsumowania jej wcześniejszych części.

Ważne zastrzeżenie: etapy 0-7 (Nov 10, 2026, przed „kontynuuj z etapem 8”) powstały we wcześniejszej sesji, której
transkryptu nie mam. Wiem o nich tylko to, co zapisano w `docs/PLAN.md`, w innych plikach `docs/` i w historii commitów.
Tam, gdzie czegoś nie wiem, piszę to wprost.

---

## 1. Zasady pracy z użytkownikiem

### Kto i jak się zwracać
- Właściciel projektu: Jacek Borucz. Pisze po polsku, zwykle bez polskich znaków, krótko, często z literówkami.
- Nie ustalił formy zwracania się. W praktyce rozmowa idzie na „ty”, bez imienia. Nie wiem, czy woli inaczej.
- Odpowiadaj po polsku, prostymi słowami. Gdy prosi „odpowiedz prosto / krótko / tak czy nie / w 2 zdaniach”, trzymaj się
  tego dosłownie (np. pytanie „czy commit został zrobiony” wymaga „Tak” albo „Nie” na początku).
- Gdy nie rozumie pytania, prosi o wyjaśnienie na przykładzie i prostymi słowami (przypadek z „przewagą +4,4 pkt”).
  Pytania do niego formułuj z przykładem liczbowym i w języku gracza, nie programisty.

### Preferencja zapisana w ustawieniach użytkownika (dosłownie)
> Sprawdzaj czy jakies sprawy juz sie nie powtorzyly, podobne symptomy, zachowania, pytania.

W praktyce: przed naprawą sprawdź, czy podobny błąd lub temat już był (np. polskie znaki w nazwie pobieranego pliku,
dublowanie terminów reprezentacji, stara wersja na telefonie) i powiedz o tym w odpowiedzi.

### Bezpieczeństwo i tożsamość w commitach (polecenie użytkownika, dosłownie)
> nie wpisuj w comicie mojego sluzbowego emaila - podaj jacekborucz@gmail.com

Zawsze: `git -c user.name="Jacek Borucz" -c user.email=jacekborucz@gmail.com commit ...`. Nigdy innego adresu.

### Kiedy pytać, a kiedy działać
- Gdy użytkownik zleca zadanie i pisze „zacznij prace”, „wykonaj”, „dodaj”, „tak”, „wdroz”: rób, testuj, commituj
  i pushuj na `main` bez dodatkowego pytania. Tak pracowaliśmy przez cały projekt.
- Pytaj (krótko, z opcjami) tylko o decyzje projektowe, których nie da się wywnioskować: zasady gry, balans, zakres.
  Przykłady pytań, które padły: kara za bierną grę, zakres finansów (wybrał „wszystkie cztery części i nowa zakładka”).
- Propozycje dodatkowych zmian (np. „mogę dodać raport trenera akademii”) kończ pytaniem i nie zaczynaj bez zgody.
- „zostaw tak jak jest i czekaj, nic nie rob” i „nie trzeba poprawiac, zostaw tak, rob commit” traktuj dosłownie.
- Kiedy prosi o konsultację „z grafikiem / programistą / ekspertem / psychologiem”, uruchom agenta lub agentów
  z tymi rolami (rozdział 2), a dopiero potem wdrażaj.

### Czego nie robić
- Nie udawać, że coś działa: najpierw test lub sprawdzenie w przeglądarce, potem raport. Raportuj nieudane testy.
- Nie wprowadzać funkcji wymagających logowania, kont, konfiguracji Google Cloud itp. (Google Drive został usunięty:
  „jesli to ma byc tak skomplikowane i inni gracze nie beda sie mogli zalogowac ..to nie jest funkcja do gry”).
- Nie zostawiać funkcji, które na telefonie nie działają (udostępnianie pliku usunięto na prośbę użytkownika).
- Nie ustawiać sztucznych sufitów i suwaków trudności. Trudność ma wynikać z mechaniki i RNG
  („nie ustawiac zadnego sufitu sztucznie”, „ustalenie poziomu ... nie powinno byc wywolane sztucznie”).
- Nie zawyżać siły polskiej piłki na arenie międzynarodowej.

### Formatowanie (reguły organizacji Tungsten Automation, obowiązują odpowiedzi Claude i pliki docs/)
- Bez pauzy em (—) w żadnym tekście, także w UI gry i commitach. Zamiast niej przecinek, średnik, dwukropek, nawiasy.
- Bez etykiet WIELKIMI LITERAMI w UI.
- Daty w odpowiedziach i w `docs/` w formacie „MMM D, YYYY” (np. Nov 15, 2026). W samej grze daty są po polsku
  („20 paź 2026”, decyzja użytkownika z Nov 14, 2026).
- Szacunki oznaczaj `[SZAC]`. Fakty, szacunki i spekulacje rozdzielaj wyraźnie. Źródła z sieci cytuj linkami.
- Styl tekstu: krótkie, konkretne zdania, bez lania wody i bez przesadnego entuzjazmu.

### Jak pokazywać kod
Użytkownik nie wkleja kodu sam: wszystkie zmiany Claude wprowadza bezpośrednio w repozytorium, testuje i commituje.
Nie ustalaliśmy formatu „miejsce wklejenia / linie kontekstu”. Nie wiem, czy użytkownik tego oczekuje. W raportach
podawaj ścieżki plików (`src/ui/editorView.js`), hash commita, wynik testów i co sprawdzono w przeglądarce.

### Raportowanie
Na końcu zadania krótko: co działa, gdzie to znaleźć w grze, commit, liczba testów, co sprawdzono na zrzutach
(PC 1600 px i telefon 390 px), co uproszczono, co jest do decyzji użytkownika. Po zmianach na telefonie przypomnij,
że trzeba zamknąć i otworzyć grę, żeby wczytała nową wersję.

---

## 2. Agenci i role

W repozytorium nie ma zdefiniowanych agentów (`.claude/agents` nie istnieje). Wszystkie „role” to jednorazowe agenty
typu `general-purpose` uruchamiane narzędziem Agent z instrukcją w treści promptu. Instrukcje pisane były po angielsku,
z wymaganiem odpowiedzi i UI po polsku. Pełne prompty są tylko w transkrypcie sesji, do którego nowa sesja nie ma
dostępu. Niżej: lista ról, wzorzec promptu i jeden prompt przytoczony dosłownie.

### Role używane w projekcie

| Rola | Za co odpowiada | Kiedy uruchamiać |
|---|---|---|
| Znawca futbolu / ekspert piłkarski (skaut, dyrektor sportowy Ekstraklasy) | Realia polskiej piłki, balans, mechanika meczu, transfery | Każda zmiana mechaniki gry i balansu |
| Sędzia / ekspert przepisów (IFAB, PZPN, UEFA, FIFA) | Przepisy, regulaminy rozgrywek, kalendarz, rezerwy, VAR | Zasady rozgrywek, awanse, kartki, VAR, wypożyczenia. Raport: `docs/ekspert_sedzia.md` (z wcześniejszej sesji) |
| Trener ekspert / analityk | Decyzje trenera w meczu, odprawy, AI trenerów, trening | Silnik meczu, AI w meczu, odprawy, bierna gra |
| Psycholog sportowy | Morale, rozmowy, presja, nastawienie zawodników | Rozmowy, odprawy, prośby o transfer, prasa |
| Ekspert od transferów / agent piłkarski | FIFA RSTP, prekontrakty, wypożyczenia, negocjacje | Rynek transferowy, kontrakty |
| Ekonomista / finanse klubu | Budżety, pensje, nagrody, sponsorzy | Finanse, zarząd, infrastruktura |
| Zarząd / właściciel | Reakcje zarządu i właścicieli | Prośby do zarządu, weto, zwolnienia |
| Dziennikarz AI | Konferencje prasowe, pytania, klimat prasy | Prasa przed i po meczu |
| Redaktor tekstów | Poprawność i sensowność tekstów w grze | Teksty odpraw, konferencji, wiadomości |
| Fizjoterapeuta | Zmęczenie, urazy, regeneracja | Raport asystenta, trening |
| Matematyk | Rozkłady, RNG, kalibracja | Gdy wynik ma być „stała + RNG” |
| Grafik / designer (UI) | Układ ekranów PC i telefonu, kolory, czytelność | Każda zmiana wyglądu; użytkownik często prosi „skonsultuj z grafikiem” |
| Programista | Implementacja, architektura, testy | Wdrożenie po konsultacjach |
| Agent UEFA | Weryfikacja klubów w pucharach, terminów UEFA | Wspomniany w `docs/PLAN.md` i `src/config/calendar2026.js` (wcześniejsza sesja). Treści jego instrukcji nie mam |

### Skill używany w projekcie
- `frontend-design:frontend-design` (plugin), uruchomiony Nov 11, 2026 dla ekranu meczu na żywo. Argument:
  „Przeprojektowanie ekranu meczu na żywo (PC i telefon) w grze menedżerskiej LigaPL27: tablica wyniku, boisko,
  relacja, statystyki, osobny pasek tempa (x1, x2,5, x5, Pokaż wynik) i osobny pasek decyzji trenera
  (Zmiany, Taktyka, Okrzyk).” Skill jest częścią środowiska (plugin), nie repozytorium; nowa sesja wywołuje go
  narzędziem Skill. Najważniejsze zasady ze skilla stosowane w grze: bez etykiet WIELKIMI LITERAMI, bez
  dekoracyjnych numerów, jeden mocny akcent, czytelne teksty w języku gracza, responsywność do telefonu.
- Użytkownik dopuścił inspirację wyglądem Football Managera 2000-2026: „Nie kopiuj 1:1 ale mozesz wykorzystac
  niektore pomysly na swoj sposob.”

### Agenci uruchomieni w tej sesji (Nov 10-14, 2026)
Konsultacje (bez edycji plików): analiza balansu, sytuacje meczowe i AI trenera, konsultacje designu ekranu meczu,
trener ekspert (taktyka AI w meczu), dziennikarz (konferencja), analiza sprawiedliwości treningu AI, panel ekspertów
sparingów i karnych, panel atrybutów trenerów AI, style/zwolnienia/właściciele, kary za bierną grę, siła lig Europy,
teksty odpraw dopasowane do meczu, raport asystenta, przemowy w pucharach, fakty o finansach polskiej piłki,
burza mózgów finansów, przepisy transferowe i wypożyczeń, projekt silnika transferów.

Budowa (edycja plików): ekran negocjacji, pensje i budżety, kibice i kary PZPN, ekran taktyki z przeciąganiem,
pulpit PC, intro i menu, limit kadry, formacje i urazy, menu kontekstowe, ekran meczu, sparingi, terminarz i historia,
transfery i trening (redesign), premie i sponsorzy, infrastruktura, prośby do zarządu (te trzy równolegle w osobnych
worktree), silnik transferów i wypożyczenia (równolegle w worktree), pula 100 obcokrajowców, wieczny kalendarz
reprezentacji, edytor z datapackiem, grywalna III liga, zmiana kodu pozycji SP na BP.

### Wzorzec promptu (jak pisać brief agenta)
1. Rola lub panel ról i kontekst: repozytorium `/home/user/manager-pilkarski`, vanilla ES modules, bez budowania, UI po polsku.
2. Czy wolno edytować pliki (konsultacja: „Do NOT edit files”).
3. Pliki do przeczytania najpierw (konkretne ścieżki i funkcje).
4. Prośba użytkownika przytoczona dosłownie lub wiernie przetłumaczona.
5. Lista rzeczy do dostarczenia, liczby z oznaczeniem [SZAC], ten sam model dla gracza i AI, priorytety MUST/SHOULD/LATER.
6. Przy budowie: testy (`npm test`), `npm run sw` po dodaniu plików, sprawdzenie w Chromium (Playwright) na 1600 i 390 px,
   dokumentacja w `docs/`, reguły (polski UI, bez pauzy em, bez WIELKICH LITER), commit z adresem gmail i push.

### Przykład promptu (dosłownie, panel ekspertów silnika transferów, Nov 13, 2026)

```text
You are a three-person expert panel for a Polish football-manager game (repo /home/user/manager-pilkarski, vanilla ES modules, Polish UI): (1) football expert (Ekstraklasa scout/sporting director), (2) sports psychologist, (3) transfer/agent expert (FIFA/PZPN rules). Do NOT edit files. Read code, then design mechanics. Answer in Polish as a structured design proposal (max ~2000 words), with concrete formulas and numbers marked [SZAC], deterministic RNG seeds where relevant, AI-club parity, and MUST/SHOULD/LATER priority.

Read first: src/career/transfers.js (completeTransfer is instant; loanIn only user, to season end; aiBuy, aiOffersForUser, answerIncoming, aiRenewals, marketWeek, refreshListings, addFreeAgents), src/career/negotiation.js (contract talks, transferRequest set only after failed renewal), src/career/reputation.js (willingnessToJoin: rep gap, tier, Europe, starter, monthsLeft, unhappy), src/career/attention.js (unhappy from bench), src/career/personality.js and player traits (persona, ambition etc.), src/season/rollover.js (contracts expire at season end → free agents; loans return), src/config/calendar2026.js (transferWindows), src/career/boardRequests.js (board veto caps), src/ui/transfersView.js, src/ui/negotiationView.js. Note p.onLoanOut is referenced in UI/training but never set.

The owner asked (verbatim intent):
14a) Transfer completion: the player travels to the club (realistic steps: agreement, personal terms, medical, travel, announcement), not instant.
14b) Signing players whose contracts expire, ~6 months (owner said "a year and some months" — check rules; FIFA allows pre-contract in the last 6 months) before, as free transfer: e.g., "player joins club X on date Y"; once agreed, nobody else can make him an offer. Check if anything like this exists.
14c) Player mindset: may not want to move to a weaker club, but if no offers come he may accept (age, ambition, potential, other factors).
14d) Player may want to leave for a stronger club and ask to be transfer-listed; fit Polish league reality; write logic + RNG.
15) Loans: period (half season / full season, until date), whether loanee can play against parent club, loan with option to buy (prawo pierwokupu) and obligation to buy, regulations and squad limits; loans in both directions (user loans out own players; AI-AI loans), recall.

Deliver:
1. Transfer pipeline state machine (offer accepted → personal terms → medical (can fail: injury history, rare) → travel/announcement → registered; durations in days for domestic/foreign; what happens on deadline day; UI events/inbox messages; AI-AI transfers abbreviated). Effects while pending (player not available? morale?).
2. Pre-contracts: eligibility (contract ends within 6 months, i.e., from Jan 1 for June 30 contracts), who can approach (any club incl. foreign), player's decision model (offers compared: wage, club rep, role, ambition), lock after agreement (no more offers; other clubs may still pay a fee to get him earlier in winter if his club agrees), effect on morale/performance until departure (psychologist), AI clubs doing pre-contracts with user's and AI players; user's players being poached (inbox notice). Contract renewal interplay.
3. Mindset model: per-player "openness" state evolving over time: willingness to step down vs. offers count, months without club (free agents lower wage demands and accept weaker clubs: curve by age), ambition/potential/age/persona; formula.
4. Transfer requests to stronger clubs: triggers (strong offer from bigger club/abroad rejected by club, rep gap between player and club, lack of minutes, contract stalemate, age 21-27 peak), probabilities per month [SZAC] calibrated to Polish reality (roughly how many Ekstraklasa players per season push for a move), consequences: morale drop, performance, can be calmed by talk/promise/raise, or listing; AI clubs similarly (sell more readily). Include foreign buyers (abroad clubs not simulated: generic "klub z ligi tureckiej/belgijskiej..." bids) — tie to existing aiOffersForUser if present.
5. Loans: types (półroczne do końca rundy, roczne/do końca sezonu), wage share, option to buy (fee fixed at signing), obligation to buy (conditions e.g., X appearances), recall clause (after winter window), ban on playing against parent club (decide per realistic Polish practice; if contractual clause, make it a loan term toggle), limits (max loaned out/in per FIFA rules, U21 exemptions), minutes promise and development, loanee morale, AI-AI loans, user loaning out (AI clubs take user's young players), returning at loan end, sub-loans prohibited.
6. Data model fields to add (p.transfer pending, p.preContract, p.loan extended), daily system order, inbox messages, minimal UI changes (where in Transfery tab), and tests to write.
Keep balance in mind (no exploits: e.g., user hoarding pre-contracts of stars; cap active pre-contracts by squad limit; board veto applies).
```

(Ten prompt zawiera pauzy em, bo był wewnętrzny dla agenta. W tekstach dla użytkownika i w grze pauz em nie używamy.)

---

## 3. Konfiguracja

Stan sprawdzony Nov 15, 2026:

- **CLAUDE.md:** brak w repozytorium i w `~/.claude/`. Nie istnieje.
- **`.claude/` w repozytorium:** zawiera tylko `worktrees/` (pozostałości po agentach w worktree, nie są w git).
  Brak `agents/`, `skills/`, `commands/`, `settings.json`.
- **`~/.claude/`:** pliki środowiska chmurowego (np. `stop-hook-git-check.sh`, `settings` zdalne, `skills/session-start-hook`).
  Nie są częścią projektu. Hook Stop zgłasza „There are untracked files / uncommitted changes. Please commit and push”.
  Gdy pracuje agent w tle i jego zmiany są w toku, robiliśmy kopię na gałąź `wip-agenci` (rozdział 7), a nie commit na `main`.
- **Pliki pamięci (memory):** brak. Nie znalazłem żadnego MEMORY.md ani katalogu pamięci.
- **Globalne reguły:** instrukcje organizacji Tungsten Automation (w prompcie systemowym, nie w repozytorium):
  język użytkownika, format daty „MMM D, YYYY” w odpowiedziach, zakaz pauzy em w tekstach do publikacji, bez wymyślania
  danych, oznaczanie niepewności, bezpieczne praktyki kodowania, ostrzeżenie przy podaniu sekretu. Plus preferencja
  użytkownika z rozdziału 1.
- **Remote git:** `origin` wskazuje stary adres; GitHub odpowiada „This repository moved. Please use the new location:
  https://github.com/jacekborucz-art/LigaPL27.git”. Push działa mimo to. Można zaktualizować URL remote (nie zrobiono).
- **Hosting:** Vercel, darmowy plan, automatyczne publikowanie z `main`. Konfiguracji Vercela (projekt, domena, ustawienia)
  nie widzę z tej sesji; w repozytorium nie ma `vercel.json`. Adresu strony gry nie znam.
- **Vercel Analytics:** w kodzie nie ma żadnego skryptu ani pakietu Analytics (sprawdzone grepem). Nie wiem, czy
  użytkownik włączył coś w panelu Vercela.

---

## 4. Decyzje projektowe nieoczywiste z kodu

Z `docs/PLAN.md` (wcześniejsza sesja, Nov 10, 2026):
- **Gra prywatna**, tylko dla autora: bez publikacji, sklepu, kont i serwera. (Użytkownik wspomniał później o „innych
  graczach” przy Google Drive, więc może ją komuś udostępniać przez link Vercela. Nie ustalono tego wprost.)
- **Brak przepisu o młodzieżowcu** (decyzja użytkownika). Od 2025/26 w Polsce i tak nie ma kar, jest program premiowy.
- **Rezerwy:** zawsze co najmniej ligę niżej niż pierwsza drużyna; reguła PZPN włączona: rezerwy najwyżej w 2 Lidze
  (`reserveMaxTier = 3`, `reserveMayPlayIn()`). Rezerwy nie grają w Pucharze Polski (założenie).
  Delegowanie na mecz i powołania z rezerw (model A, zasady PZPN, awaria, eskalacja, kartki per klasa): `docs/rezerwy.md`.
- **Kluby UEFA** z prawdziwymi nazwami, bez herbów i bez prawdziwych zawodników; kadry zagraniczne generowane z ziarna.
- **Brak dublowania miejsc w pucharach** (miejsce przechodzi na finalistę PP lub dalej w tabeli).
- **Wyniki i statystyki zawsze z wyliczenia** (dziennik zdarzeń), rozbudowa przez rejestr modyfikatorów i hooki.
- Reputacja, koniec kariery 0/1, negocjacje, gra poza pozycją: rozdziały 2.4-3.2 `docs/PLAN.md`.

Z tej sesji (Nov 10-15, 2026), z uzasadnieniem użytkownika:
- **Trudność bez suwaka i bez sztucznych sufitów.** Wynik = prawdopodobieństwo z mechaniki + RNG. Przykład: słaby trener
  czasem ma lepszy sezon niż dobry. Gracz i AI mają te same zasady (trening, odprawy, przemowy, limity).
- **Bierna gra (samo klikanie Dalej) ma być karana**, ostrożnie: przewidywalna taktyka, brak rozmów, monotonny trening.
  Praca podnosi szanse na lepszy wynik, ale go nie gwarantuje („nie ma konczyc ale prawdopodobienstwo ze wypadnie lepiej
  jest wieksze”). Opis: `docs/bierna-gra.md`.
- **Trenerzy AI z atrybutami 1-20**, stała część + forma dnia (RNG); nowy trener przynosi własny styl; kluby zwalniają
  trenerów zależnie od charakteru właściciela; istnieje rynek trenerów. `docs/trenerzy-i-wlasciciele.md`, `docs/ai-trener.md`.
- **Akcent indywidualny w treningu AI dla młodych** tylko w klubach z dobrym trenerem młodzieży (jakość 11+).
- **Po podpisaniu kontraktu i po kliknięciu Dalej** gra pokazuje Pulpit, nie Pocztę.
- **Superpuchar Polski** zawsze na PGE Narodowym (teren neutralny).
- **Bramkarz** bardzo rzadko zalicza asystę.
- **VAR:** karny podyktowany przez sędziego nie jest odwoływany po strzale; VAR z pauzą i werdyktem; protesty w polu karnym.
- **Prasa, zarząd i kibice** rozpoznają rangę meczu i rozstrzygnięcie (karne, awans, trofeum).
- **Konferencja prasowa** w osobnym kroku, opcjonalna (Dalej ją pomija), klimat prasy losowy, kary za wypowiedzi
  o sędziach, prasa wpływa na ocenę zarządu, jest też konferencja przedmeczowa.
- **Zapis gry:** lokalnie (IndexedDB, 3 sloty) i eksport do pliku JSON. Bez Google Drive i bez udostępniania pliku.
  Menu w grze: Opcje (motyw, edytor), Zapis (plik), Wyjście (zapis i powrót do startu).
- **Edytor:** jak najprostszy, w Opcjach, zakładki Kluby i Zawodnicy, datapack (zmiany albo pełny eksport).
  Zawodnicy z datapacku działają tylko w tym samym świecie gry (to samo ziarno).
- **III liga grywalna** (4 grupy po 18), dane klubów z pliku użytkownika `tools/data/iii_liga_kluby_stadiony.txt`.
  IV liga nierozgrywana (4 awansujących na grupę wybieranych z siły i RNG).
- **Akademia:** trener sam przenosi wychowanka (od 16 lat) do pierwszego składu.
- **Kod pozycji boczny pomocnik: BP** (wcześniej SP, mylony ze ŚP).
- **Daty w grze po polsku** („20 paź 2026”).
- **Reprezentacje:** wszystkie federacje, turnieje powtarzane bez końca (gra „na 100 lat”).
- **Wolni zawodnicy** znikają po dłuższym czasie bez klubu, na ich miejsce pojawiają się nowi; na rynku jest pula
  ok. 100 obcokrajowców z krajów, z których zawodnicy realnie trafiają do Polski.
- **Bogaty właściciel** chętniej dokłada na transfery i płace; nagrody UEFA (LM, LE, LK) w realnych kwotach.

---

## 5. Stan prac

### Zrobione (najważniejsze moduły, szczegóły w `docs/`)
Etapy 0-10 z `docs/PLAN.md` oraz w tej sesji: ekran meczu na żywo (PC i telefon), VAR, sytuacje meczowe (110),
AI trenerów, odprawy i studio, konferencje prasowe, menu kontekstowe zawodnika, sparingi i karne, terminarz i historia,
statystyki zawodników, widok klubu rywala, trenerzy AI i właściciele, bierna gra, raport asystenta, rozmowy indywidualne
(dialog), finanse (premie, sponsorzy, infrastruktura, prośby i weto zarządu, zakładka Klub), silnik transferów
(etapy transakcji, prekontrakty, nastawienie, prośby o transfer), wypożyczenia, pula obcokrajowców, rotacja wolnych,
wieczny kalendarz reprezentacji (wszystkie federacje), menu Opcje/Zapis/Wyjście, edytor z datapackiem, grywalna III liga,
akademia do pierwszego składu, BP zamiast SP, polskie daty, oszczędny service worker.

Testy: 626, wszystkie przechodziły przy ostatnim pełnym uruchomieniu (Nov 14, 2026).

Instrukcje indywidualne zawodników, etap 1 (silnik, dane, zmiana w meczu, reguła AI, testy), Nov 18, 2026:
`docs/instrukcje-indywidualne.md` rozdział 10. Etap 2 (interfejs: okno zawodnika, tabela, znaczniki, zmiana w meczu) Nov 18, 2026: rozdział 11. Złoty test w
`tests/playerInstr.test.mjs` pilnuje, że mecz bez instrukcji indywidualnych jest identyczny jak przed nimi: zmiana
silnika, która celowo zmienia przebieg meczu, wymaga nowych skrótów (zebranych kodem z `tests/piHelpers.mjs`).

Strzałki ruchu zawodników (Nov 18, 2026, v1.19 Beta): tryb „Strzałki” nad boiskiem w Skład i taktyka i w oknie
„Zmiany i taktyka” w meczu, kompas z kierunkami dozwolonymi dla pozycji, rysowanie przeciągnięciem na PC. Zapis jako
instrukcje indywidualne `run` i `lat`, silnik w `src/engine/match/playerInstr.js` (`PI.arrow`), pomiar A/B wszystkich
30 kierunków: `node tools/pi-kalibracja.mjs 300 strzalki`. Opis: `docs/strzalki-ruchu.md` rozdział 5.

Analiza pomeczowa sztabu, Nov 18, 2026: poczta po każdym meczu o stawkę (bez sparingów), pełny raport, archiwum
„Analizy meczów” w panelu taktyki, błędy zależne od jakości analityka i asystenta, tylko dane widoczne w meczu.
Opis wdrożenia: `docs/analiza-pomeczowa.md` rozdział 8, testy `tests/postMatchReport.test.mjs`.

### W toku
Nic nie jest w toku. Wszystko jest na `main` (`9b4403e`).

### Gałąź `wip-agenci`
Kopie zapasowe niedokończonej pracy agentów, robione, gdy hook Stop żądał commita, a agent jeszcze pracował.
Cała ta praca została później dokończona i scalona na `main`. Gałąź nie zawiera nic potrzebnego; można ją usunąć
(za zgodą użytkownika) albo ignorować. Nie scalać jej na `main`.

### Do obserwacji
- **Ruch na Vercelu:** Nov 14, 2026 Vercel zgłosił 75 % limitu darmowego planu. Zmieniono service worker (`sw.js`):
  kolejne uruchomienie gry to 1 zapytanie (wcześniej ok. 200), aktualizacja pobiera tylko zmienione pliki. Nie wiadomo,
  który licznik był na 75 % (Edge Requests czy Fast Data Transfer). Poprosić użytkownika o sprawdzenie Usage za kilka dni.
- **Wydajność po III lidze:** świat urósł z 54 do 126 klubów z kadrami (ok. 4200 zawodników). Dzień gry ok. 33 ms
  (wcześniej 16), sezon ok. 12 s, zapis 5,7-8,9 MB. Jeśli telefon zwalnia: rzadszy trening AI klubów III ligi.

### Propozycje czekające na decyzję użytkownika (nie zaczynać bez zgody)
1. Przemowy przed dogrywką i przed serią rzutów karnych.
2. Raport skauta szacujący potencjał zawodników innych klubów.
3. Daty okien transferowych: sprawdzić i poprawić rozjazd (lato do ok. Sep 9, zima do ok. Jan 25).
4. Konferencja przedmeczowa w układzie pełnej strony (jak pomeczowa).
5. Miesięczny raport trenera akademii (kto jest gotowy do pierwszego składu).
6. Decyzja gracza na koniec sezonu o 19-latkach z akademii (teraz automat: dobry do kadry, reszta odchodzi).
7. Puchar Polski: ścisła zasada dla klubu gracza z III ligi (teraz zawsze gra rundę wstępną).
8. Starsze, nieodpowiedziane: dalsze rozwinięcie raportu asystenta, szerokość okna negocjacji, szerokość list pucharów
   europejskich, nazwy stadionów klubów wyższych lig. Szczegółów tych czterech nie pamiętam dokładnie; zapytać użytkownika.

### Znane problemy
- Testy wydajności (np. „Pełny sezon z pucharami ... poniżej 15 s”) czasem nie przechodzą przy pełnym `npm test`
  pod obciążeniem; uruchomione osobno przechodzą.
- Pełny `npm test` trwa ponad 2 minuty; w narzędziu Bash z limitem 120 s uruchamiaj z `timeout` 600000 albo w tle.
- Pierwsze wejście po zmianie service workera pobiera całą grę (ok. 400 zapytań), potem już oszczędnie.
- Pliki w `docs/` mają daty po angielsku (zgodnie z regułą organizacji), gra po polsku.
- Część danych (kluby UEFA, Elo reprezentacji, finanse III ligi) to szacunki [SZAC]; domeny wikipedia.org, pzpn.pl,
  soccerway i in. są zablokowane w sieci sesji chmurowej.

---

## 6. Konwencje

### Repozytorium i uruchamianie
- PWA bez budowania: `index.html`, `sw.js`, `src/` (ES modules), `assets/`, `tests/`, `tools/`, `docs/`, `design/` (makiety).
- Start lokalny: `npm start` (python3 -m http.server 8080). Testy: `npm test` (node --test, ok. 626 testów).
- **Po dodaniu, usunięciu albo zmianie dowolnego pliku gry: `npm run sw`.** Skrypt `tools/sw-list.cjs` wpisuje listę
  plików ze skrótami zawartości do `sw.js` i liczy wersję. Test w `tests/core.test.mjs` pilnuje zgodności; bez tego
  telefony nie dostaną zmiany.
- Struktura `src/`: `engine/` (silnik meczu, quickSim, pozycje), `match/` (dzień meczowy, odprawy, prasa, studio),
  `season/` (terminarze, ligi, puchary, UEFA, reprezentacje `intl/`, rollover, III liga), `career/` (finanse, transfery,
  zarząd, kibice, trenerzy, edytor, akademia...), `training/`, `world/` (generator), `data/`, `config/`, `core/`
  (RNG, zapis IndexedDB, pętla dnia, poczta), `ui/` (widoki jako funkcje zwracające HTML), `styles/`, `app.js`
  (stan, nawigacja, delegacja kliknięć `data-act`).
- UI: każdy tekst przez `esc()`; kliknięcia przez `data-act` w `dispatchAct` (`src/app.js`); pola INPUT/SELECT obsługuje
  listener `change`, nie delegat kliknięć.

### Commity
- Po polsku, jedno zdanie opisujące efekt dla gracza, bez prefiksów typu feat/fix. Przykłady:
  „Akademia: trener przenosi wychowanka do pierwszego składu (menu zawodnika i przycisk w profilu)”,
  „Tabele ligowe: kolumny liczbowe wyśrodkowane, punkty pod nagłówkiem Pkt”.
- Autor zawsze `Jacek Borucz <jacekborucz@gmail.com>`. Na końcu wiadomości dwie linie atrybucji (Co-Authored-By
  i Claude-Session) zgodnie z instrukcją środowiska; nie wpisywać identyfikatora modelu w treść commita ani kodu.
- Push: `git push -q origin main`, przy błędzie sieci ponowić do 4 razy. Praca idzie bezpośrednio na `main`.
- Równoległe duże zadania: agenci w osobnych worktree, potem scalenie `--no-ff` z rozwiązaniem konfliktów.

### Nazewnictwo
- Kod po angielsku (funkcje, zmienne), komentarze i UI po polsku. Pliki dokumentacji po polsku w `docs/`.
- Pozycje: BR, ŚO, BO, WB, DP, ŚP, OP, BP, SN, NAP. „SP” w zdarzeniach meczu oznacza stały fragment gry.
- Poziomy lig: 1 Ekstraklasa, 2 = 1 Liga, 3 = 2 Liga, 4 = III liga, 5 = IV liga.
- Liczby balansu w stałych modułów lub `src/config/`, oznaczone [SZAC].

### Narzędzia `tools/`
- `sw-list.cjs`: lista plików i wersja service workera (`npm run sw`).
- `multiseason.mjs`: symulacja wielu sezonów (`node tools/multiseason.mjs [klub] [ziarno] [sezony]`): siła lig, awanse,
  kadry, finanse, puchary.
- `transfery-kalibracja.mjs`: kalibracja silnika transferów (transfery AI, sprzedaże za granicę, prośby, prekontrakty).
- `kalibracja-finansow.mjs`: kalibracja płacowości klubów.
- `engine.cjs`, `fit.cjs`: kalibracja silnika meczu (uproszczony model, dopasowanie średnich).
- `build-lower-leagues.mjs`: generuje `src/data/clubs_l3.js` i `clubs_l4.js` z `tools/data/*.txt`.
- `kluby_uefa_gen.cjs`, `reprezentacje_gen.cjs`, `federacje_gen.cjs`: generatory danych UEFA i reprezentacji.
- `crest-preview.html`: podgląd herbów.

### Sprawdzanie w przeglądarce
Chromium i Playwright są zainstalowane (`require('playwright')`, bez `playwright install`). Serwer
`python3 -m http.server <port>` w katalogu repo, wczytanie zapisu przez `input[data-act="import"]`, potem
`[data-act="load"]`. Zrzuty na 1600 px (PC) i 390 px (telefon), kontrola błędów konsoli i przewijania w bok.
Zapisy testowe były w katalogu scratchpad sesji (np. `save-oct.json`, Widzew, Oct 20, 2026) i zginą z kontenerem;
nowa sesja musi utworzyć własny zapis (nowa kariera w grze, eksport do pliku).

---

## 7. Pułapki i rzeczy, które się nie sprawdziły

- **Google Drive:** wymagał projektu Google Cloud i OAuth; użytkownik się pogubił, a inni gracze nie mogliby się
  zalogować. Usunięte. Nie wracać do logowania.
- **Udostępnianie pliku (Web Share):** na telefonie stale „Nie udało się udostępnić pliku”. Usunięte.
- **Service worker cache-first bez wersji z zawartości:** telefon pokazywał starą wersję albo mieszankę. Potem było
  network-first (każde uruchomienie ok. 200 zapytań i 75 % limitu Vercela). Obecnie: skróty zawartości plików,
  pamięć urządzenia, aktualizacja tylko zmienionych plików. Zawsze `npm run sw` po zmianie plików.
- **Polskie znaki i spacje w nazwach pobieranych plików** psują nazwę w Chromium („download”). Nazwy plików tylko ASCII
  (np. `LigaPL27-slot1-Widzew-Lodz-2026-10-20.json`). Element `<a>` dołączać do otwartego okna dialogowego przed
  kliknięciem (modal robi resztę strony nieaktywną).
- **Błąd w widoku wyrzucał na ekran startowy** (np. profil wolnego zawodnika bez kontraktu). Teraz błąd w trakcie gry
  zostawia gracza w grze z komunikatem. Przy nowych widokach uwzględniać zawodników bez kontraktu i bez klubu.
- **Daty po angielsku w grze:** format organizacji przeniesiony niepotrzebnie do UI. Gra ma polskie daty (`fmtDate`,
  `fmtDay`, `fmtMon` w `src/ui/dom.js`).
- **Skróty pozycji SP i ŚP** były mylone; zmieniono na BP z migracją zapisów (`migratePosCodes` w `src/engine/positions.js`).
  Nie zamieniać masowo napisów „SP” w zapisie: zdarzenia meczu mają rodzaj „SP” (stały fragment).
- **Dublowanie terminów reprezentacji** (czerwiec 2027: Liga Narodów i eliminacje Euro naraz): naprawione, kalendarz
  jest generowany wiecznie (`src/season/intl/`). Przy zmianach kalendarza uruchamiać testy kolizji.
- **Scalanie równoległych agentów:** raz zgubiony nawias klamrowy w `@media` po scaleniu zepsuł style telefonu. Po scaleniu
  sprawdzać CSS i robić zrzut z telefonu.
- **Testy zależne od ziarna** potrafią wybrać np. wyrzuconego z boiska zawodnika; wybierać dane w testach jawnie.
- **Zbyt hojne prośby do zarządu i zbyt surowe weto:** poprawione (roczny koszt kontraktu wobec przychodów i właściciela,
  odjęty zatwierdzony budżet). Przy zmianach finansów uruchamiać kalibrację.
- **Wolni zawodnicy rosnący bez końca** i **klub bez bramkarza:** poprawione (limit puli, minimalne liczby na pozycjach).
- **Wypożyczenia z własną funkcją minimum kadry** ignorowały transakcje w toku; używać wspólnej `breaksMinimum`.
- **Delegat kliknięć ignoruje INPUT:** radio, checkbox, select i input obsługiwać w listenerze `change`.
- **Limity agentów:** agenci w tle czasem trafiali na limit użycia; wtedy wznawiać ich przez SendMessage, a w razie
  żądania commita od hooka robić kopię na `wip-agenci`, nie na `main`.
- **Długie testy w narzędziu Bash:** domyślny limit 120 s ucina `npm test`; używać większego limitu lub tła.
- **Reputacja: `p.caps` to martwe pole generatora (zawsze 0).** Mecze w kadrze są w `p.intl.caps`. `clubReputation`
  ma skalę krajową (Legia 95 = Bayern 95), więc do widoczności w Europie służy scena (`clubStage`), nie ta liczba
  (`docs/reputacja.md`).
- **Commit przed sprawdzeniem wyniku testów:** raz potok `&&` zrobił commit mimo 2 nieudanych testów (grep zwrócił 0).
  Sprawdzać wynik testów osobno przed commitem.
