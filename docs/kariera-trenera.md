# Kariera trenera: reputacja, popularność, historia, odznaki i rynek pracy

Stan: Nov 20, 2026 (v1.19 Beta). Projekt: panel ekspertów (burza mózgów kariery, Nov 20, 2026) i decyzje właściciela
z Nov 20, 2026. Kod logiki: `src/career/coachCareer.js` (kariera), `src/career/jobMarket.js` (rynek pracy).
Widoki (zakładka Klub, Kariera; odznaki; rynek pracy) buduje osobny etap UI według kontraktu z rozdziału 8.
Wszystkie liczby to szacunki [SZAC] do dalszej kalibracji (`tools/kariera-kalibracja.mjs`).

## 1. Decyzje właściciela (Nov 20, 2026)

- Panel kariery jest nową podzakładką Kariera w zakładce Klub.
- Trener bez klubu przegląda tylko cudze rozgrywki: Rozgrywki, Poczta, Pulpit (z informacją o rynku pracy) i Kariera.
  Bez kadry, taktyki, transferów, treningu i finansów dawnego klubu. Dni mijają przyciskiem Dalej.
- Zdarzenia negatywne (spadek, zwolnienie, rezygnacja) są tylko tekstem w historii kariery (pole `scars`),
  bez odznak i ikon.
- Wersja gry bez zmian.

## 2. Reputacja trenera (0-100, `game.manager.rep`)

Reputacja zmienia się zdarzeniami. Miesięczna ocena zarządu przestała być jej źródłem (dawny wzór
`(zaufanie - 55) x 0,02` usunięty z `board.js`).

- Przyrost: `rep += pkt x sat`, gdzie `sat = clamp(1,1 - rep/100; 0,25; 1)`.
- Próg miękki ligi klubu (nad progiem zostaje 25 % przyrostu): III liga 35, 2 Liga 48, 1 Liga 62, Ekstraklasa 85.
  Trofea (mistrzostwa, puchary) i Europa nie mają progu.
- Kara: `rep -= pkt x (0,6 + rep/100)` (duża marka traci więcej). Reputacja gracza nie spada poniżej 5
  (jak dawniej w `board.js`).
- Zasięg: `reach = rep / 0,6`. Klub o reputacji `LC <= reach` jest w zasięgu, `LC > reach + 15` poza zasięgiem
  (bez rozmowy kwalifikacyjnej). Start nowej kariery: `rep = 0,6 x LC` (bez zmian).

Punkty zdarzeń (`CAREER.ev` i `CAREER.pen`):

| Zdarzenie | Punkty |
|---|---|
| Mistrz Polski / 1 Ligi / 2 Ligi / grupy III ligi | +9 / +2 / +1,5 / +1 (bez progu) |
| Awans do Ekstraklasy / 1 Ligi / 2 Ligi / III ligi | +6 / +5 / +4 / +3 |
| Puchar Polski, Superpuchar Polski | +4, +1,5 (bez progu) |
| Liga Mistrzów, Liga Europy, Liga Konferencji, Superpuchar Europy | +16, +11, +8, +3 (bez progu) |
| Etap w Europie (najwyższy, bez tytułu) | faza ligowa 1,5, 1/8 2,5, ćwierćfinał 4, półfinał 6, finał 8; x1 LM, x0,7 LE, x0,5 LK |
| Przebyta runda eliminacji | +0,5 (najwyżej +2) |
| Cel zarządu wykonany, każde miejsce ponad cel | +1, +0,6 (najwyżej +4) |
| Utrzymanie jako underdog (cel: utrzymanie albo ranking siły w dolnej czwórce) | +2,5 |
| Przegrany finał Pucharu Polski | +1,5 |
| Liga: wygrana / remis z rywalem przy oczekiwanych punktach do 1,0 | +0,35 / +0,15 (najwyżej +3 na sezon) |
| Puchar: awans kosztem faworyta; wygrane derby | +0,5; +0,15 |
| Liga: porażka przy oczekiwanych punktach od 2,2 | -0,25 (najwyżej -2 na sezon, bez mnożnika) |
| Spadek (faworyt / underdog) | -8 / -4 |
| Zwolnienie; zwolnienie przed 8. meczem | -6; dodatkowo -3 |
| Sezon 5 i więcej miejsc pod celem | -0,5 za miejsce od piątego (najwyżej -5) |
| Odpadnięcie z Pucharu Polski z klubem 2 / 1 ligę niżej | -2 / -0,8 |
| Odpadnięcie z eliminacji europejskich z dużo słabszym rywalem | -1,5 |
| Rezygnacja w trakcie sezonu | -3 (po sezonie 0) |

Oczekiwane punkty to `expectedPoints` z `fans.js` (różnica siły L i boisko).

Miesiąc (pierwszy dzień, `careerMonth`):
- Składnik formy przy co najmniej 3 meczach o stawkę: `clamp((pkt na mecz - 1,4) x 0,5; -0,6; 0,6)`.
- Zanik do podłogi `0,6 x szczyt`: -0,15 na miesiąc po 12 miesiącach bez trofeum i awansu, -0,4 na miesiąc przy
  bezrobociu dłuższym niż 6 miesięcy.

## 3. Popularność (`career.pop = { fans, media }`, 0-100)

- Start: kibice 50, media `25 + 0,6 x rep` (10-80).
- Zmiana klubu: u kibiców przechodzi 35 % odchylenia od 50 (`50 + 0,35 x (fans - 50)`), media w całości.
- Kibice: miesięcznie `(nastrój kibiców - 55) x 0,04`, seria 5 wygranych +1,2, 5 porażek -1,5, derby +-1,2,
  lojalność +0,25 na miesiąc po 12 miesiącach w klubie (najwyżej +12), mistrzostwo +4, puchar +2, awans +1, spadek -8.
- Media: mistrzostwo +3, puchar +2, awans +1, spadek -5, gra efektowna (gole w lidze w miesiącu o 0,4 ponad średnią
  ligi) +0,3 (kibice +0,5), konferencje prasowe 30 % składowych `fans` i `media` (`game.press.log`), wyjście z sali -2,
  masowe aplikowanie -2. Bez klubu: kibice wracają do 50, media -0,3 na miesiąc.
- Odejście po mniej niż 12 miesiącach (oferta, rezygnacja): wpis `fansLeft: -8` w okresie pracy (tylko zapis).

Skutki:
- Próg zwolnienia przez zarząd: `18 - 0,06 x (fans - 50)`, w granicach 12-22 (miesięcznie i po sezonie).
- Przy kibicach od 70 ujemna ocena zarządu x 0,9.
- Prasa: `pickClimate` przesuwa szansę życzliwego i krytycznego klimatu o do 8 punktów procentowych
  (`ctx.coachMedia`).
- Oferty niezamówione: szansa x `(1 + media/150)`; przy mediach poniżej 25 kluby z wymagającymi kibicami
  (`fanProfile.big`) nie składają ofert.

## 4. Zarząd

- Zaufanie na start w nowym klubie: `clamp(55 + 0,25 x (rep - 0,6 x LC); 45; 75)`, przy odejściu w trakcie umowy -5.
  Projekt mówił o bazie 45 (38-70); kalibracja: baza 55 zostawia odsetek zwolnień bez zmian.
- Cierpliwość: ujemna ocena miesiąca x `clamp(1 - 0,01 x (rep - 0,6 x LC); 0,8; 1,15)`. Projekt liczył od stałej 30;
  wzór względem klubu jest neutralny dla trenera na poziomie klubu (zwolnienia bez zmian: 2 z 6 przed i po w teście
  1. sezonu III ligi).
- Zwolnienie w trakcie sezonu dopiero po 6 meczach trenera w klubie w sezonie (nowy trener zimą).
- Cel dla trenera zatrudnionego w trakcie sezonu (od 5. kolejki, klub pod celem): najpierw poprawa, czyli miejsce
  2 wyżej niż obecne (nie wyżej niż cel z siły kadry, nie niżej niż nad strefą spadkową) [SZAC]. Bez tego trener
  przyjęty do klubu w kryzysie był zwalniany po 2-3 miesiącach i wpadał w spiralę zwolnień (kalibracja).

## 5. Historia kariery (`game.manager.career`)

```
{ v: 1, reconstructed, seasons: [wiersz], trophies: [{ id, badgeId, comp, season, clubId, date }],
  awards: [{ badgeId, season, clubId, clubName, date, seen }], records: {...}, stints: [okres],
  scars: [{ date, season, clubName, text }], rep: { peak, log: [{ date, delta, text }], hist: [{ season, value }], seasonStart },
  pop: { fans, media, hist, seasonStart }, tot: { n, w, d, l, gf, ga }, run: serie, cur: licznik sezonu,
  mon: licznik miesiąca, seen: [id meczów policzonych w sezonie], stintFrom, lastSuccess, pressKeys }
```

- Wiersz sezonu: `{ season, clubId, clubName, tier, league, pos, round, target, goal, achieved, w, d, l, gf, ga, n,
  pts, cup, trophies: [odznaki], promoted, relegated, fired, repDelta, repEnd, partial?, reconstructed? }`.
  `achieved`: `exceeded` (3 miejsca i więcej ponad cel), `met`, `missed`. Odejście w trakcie sezonu: wiersz
  częściowy (`partial`). Zwolnienie po sezonie oznacza wiersz tego sezonu jako `fired`.
- Okres pracy: `{ clubId, clubName, from, to, tier, league, why: 'zwolnienie'|'rezygnacja'|'oferta'|null, matches, w, d, l, loyal, fansLeft? }`.
- Trofeum liczy się po co najmniej 12 meczach o stawkę z klubem w sezonie; superpuchary (jeden mecz): wystarczy
  prowadzić drużynę w meczu.
- Rekordy: najwyższe zwycięstwo i porażka, serie (zwycięstwa, bez porażki, bez porażki w lidze, bez straconego gola),
  najwięcej goli, największa niespodzianka (wygrana przy najniższych oczekiwanych punktach), najlepszy sezon (punkty
  na mecz w lidze, od 10 meczów), najdłuższa praca, najwyższa liga, najwyższa reputacja. Serie zerują się przy zmianie klubu.
- Dawne pola zostają: `manager.rep`, `manager.history` (`{ club, from, to }`), `manager.seasons`, `manager.fired`.

Hooki:
- Dzień (`careerScan` w `careerSystem.js`, order 50, przed oceną zarządu): mecze klubu gracza od ostatniego przeglądu
  (lista `seen`, bez dublowania po wczytaniu), trofea w dniu finału, odznaki meczowe, popularność z konferencji.
- Miesiąc (`careerMonth`): forma, zanik, popularność, trener miesiąca.
- Koniec sezonu (`careerSeasonEnd` w `rollover.js`, przed zmianą lig): wiersz sezonu, tytuł, awans, cel, Europa, kary,
  odznaki sezonu, trener sezonu; trenerzy AI: `aiCoachSeasonEnd`.
- Zmiana klubu: `careerLeave` i `careerJoin` (z `switchClub` i `enterUnemployment`).

## 6. Odznaki (20, kolejność `BADGE_IDS`)

| Id | Zasada |
|---|---|
| `mp_ekstraklasa`, `mp_1liga`, `mp_2liga`, `mp_3liga` | 1. miejsce w lidze (III liga: w grupie), zasada 12 meczów |
| `puchar_polski`, `superpuchar_polski` | wygrany finał / Superpuchar |
| `liga_mistrzow`, `liga_europy`, `liga_konferencji`, `superpuchar_europy` | wygrany finał / Superpuchar Europy |
| `awans` | klub w `moves.promoted` (także przez baraż) |
| `utrzymanie_beniaminek` | bez spadku i bez awansu jako beniaminek (awans w poprzednim sezonie) albo underdog (cel utrzymanie lub ranking siły w dolnej czwórce) |
| `cel_ponad_plan` | miejsce co najmniej 3 wyżej niż cel zarządu |
| `mecze_100`, `mecze_250`, `mecze_500` | mecze o stawkę w karierze |
| `seria_bez_porazki` | 10 meczów ligowych z rzędu bez porażki (każda nowa seria liczy się od zera) |
| `sensacja` | wygrana przy oczekiwanych punktach do 0,8 albo awans w Pucharze Polski kosztem klubu 2 ligi wyżej |
| `trener_miesiaca` | najlepsze punkty na mecz w lidze klubu w miesiącu (co najmniej 3 mecze; remis: bilans bramek, gole) |
| `trener_sezonu` | wśród mistrza i klubów z awansem z tej ligi (III liga: grupa) największe miejsce ponad cel z siły kadry (`seasonGoalFor`), potem lepsze miejsce, więcej punktów, id klubu |

Liczniki (x N) i ostatnie zdobycie liczy `badgeCounts` z listy `awards`. Nowe zdobycia mają `seen: false` do
`markUnlocksSeen` (okno odblokowania). Każde zdobycie wysyła też wiadomość w Poczcie.

## 7. Rynek pracy (`game.manager.job`)

```
{ status: 'employed'|'unemployed', since, lastClub, apps: [{ clubId, date, state, interviewOn, decideOn, offerUntil }],
  refused: { clubId: data końca karencji }, applyLog: [daty], fallback: { 60, 120 }, massAt, summerBids, seenVac, outbox }
```

- Bez pracy: `game.clubId` zostaje ostatnim klubem (zapis, widoki). Na czas systemów dnia `processDay` ustawia
  `game.clubId = null`, więc ostatni klub prowadzi AI jak każdy inny (mecze, skład, transfery, trening, sponsorzy,
  trener). `clubMatchOn` zwraca null, przycisk to zawsze Dalej. Mecze dawnego klubu z datą do dnia odejścia rozgrywa AI.
- Odejście (`enterUnemployment`): kary i blizny, zamknięty okres pracy, `manager.history.to`, trener tymczasowy
  w ostatnim klubie (`coachMarket.userLeftClub`, potem zwykłe zatrudnienie AI), karencja 365 dni na powrót.
- Wakaty: kluby z trenerem tymczasowym (zwolnienia AI). Szansa (bez liczby: niska poniżej 0,12, średnia, wysoka
  od 0,3) to `pInt x pOff`:
  `pInt = clamp(0,6 + 0,035 x (rep - 0,5 x LC) + 0,004 x (media - 50); 0,03; 0,9)`,
  `pOff = clamp(0,55 + 0,03 x (rep - 0,5 x LC) + właściciel; 0,02; 0,85) x konkurencja`
  (właściciel: ambitny -0,015 x (ambicja - 10) przy klubie ponad zasięgiem, zasobny +0,01 x (zasobność - 10) przy
  marce o 10 ponad połową reputacji klubu; konkurencja `1 - 0,033 x min(6, lepsi wolni trenerzy w zasięgu klubu)`).
  Projekt: bazy 0,5 i 0,45, porównanie z 0,6 x LC, konkurencja 0,1 na trenera (minimum 0,5). Korekta kalibracji:
  trener z III ligi po zwolnieniu prawie nigdy nie dostawał pracy z aplikacji, tylko ofertę gwarantowaną po 60 dniach.
- Aplikacje: najwyżej 3 aktywne, nowa co 3 dni, 90 dni karencji po odmowie. Rozmowa dzień po aplikacji, decyzja
  w dniu wyboru trenera (koniec zastępstwa, najwcześniej 3 dni po aplikacji; klub czeka). Los:
  `Rng('aplikacja:' + seed + ':' + klub + ':' + data aplikacji)`, ten sam wynik po wczytaniu zapisu.
- Oferta: decyzja w Poczcie (`refs.kind = 'jobOffer'`, `refs.jobClubs`, `source`), ważna 7 dni, klub czeka
  (trener tymczasowy do końca ważności). Odrzucenie zwalnia klub (trener AI następnego dnia).
- Agent: nowe wakaty z szansą co najmniej średnią (wiadomość), po 60 dniach dwie oferty gwarantowane (wakaty
  w zasięgu, potem kluby poniżej celu), po 120 dniach oferta z III ligi. Po sezonie (przegląd 2 czerwca) klub
  zmieniający trenera rozważa trenera bez klubu z tą samą szansą co aplikację (najwyżej 2 oferty na lato).
- Masowe aplikowanie: 6 aplikacji w 30 dni daje -2 w mediach (raz na 30 dni).
- Rezygnacja: po 6 miesiącach w klubie albo od 1 czerwca (po sezonie bez kary). Dalej jak po zwolnieniu.
- Oferty niezamówione (zatrudniony): 3 czerwca po udanym sezonie (awans, trofeum, cel wyprzedzony):
  `min(0,8; 0,35 + 0,04 x osiągnięcia)` x media, 1-2 kluby o reputacji `(LC obecnego + 4; reach + 6]` poniżej celu.
  W trakcie sezonu (1. dzień miesiąca, po dwóch dobrych ocenach zarządu albo 2 miejsca ponad cel):
  `min(0,2; 0,04 + 0,01 x max(0; rep - 0,6 x LC))` x media. Zastępuje stałe 12 % z `boardMonth`.

## 8. Kontrakt API dla widoków

`src/career/coachCareer.js`:
- `ensureCareerHistory(game)`: kariera (idempotentne, migracja starego zapisu).
- `careerSummary(game)`: `{ name, age, club: { id, name, tier, league } | null, unemployed, rep: { value, label, trend,
  reach, peak, history: [{ season, value }] }, pop: { fans, media, fansLabel, mediaLabel, trendFans, trendMedia,
  history: [{ season, fans, media }] }, matches: { n, w, d, l, gf, ga, ppm }, seasons: [{ season, clubId, clubName,
  league, pos, round, goal, achieved: 'exceeded'|'met'|'missed'|'running', trophies: [badgeId], promoted, relegated,
  fired, reconstructed }], trophies: [{ badgeId, comp, season, clubId, clubName, date }], badges: { [badgeId]:
  { count, last: { season, clubId, clubName } } }, records: [{ key, label, value, detail }], stints: [{ clubId,
  clubName, from, to, league, why, matches, trophies: [badgeId] }], scars: [{ date, season, clubName, text }],
  repLog: [{ date, delta, text }] (20 ostatnich) }`. Bieżący sezon jest ostatnim wierszem `seasons`
  (`achieved: 'running'`). `trend` to zmiana od początku sezonu.
- `pendingUnlocks(game)`: `[{ badgeId, season, clubName, count }]`, `markUnlocksSeen(game)`.
- `BADGE_IDS` (20), dodatkowo `BADGE_NAMES`, `coachRepLabel`, `reachOf`.

`src/career/jobMarket.js`:
- `jobState(game)`: `{ status, since, days, lastClub: { id, name } | null, vacancies: [{ clubId, name, league, clubRep,
  owner, goal, chance: 'niska'|'średnia'|'wysoka', closes, applied, cooldownUntil }], apps: [{ clubId, name, date,
  state: 'czeka'|'rozmowa'|'odmowa'|'oferta' }], canApplyFrom, canResign: { ok, text } }`. Zatrudniony trener widzi
  wakaty, ale aplikować może tylko bez pracy.
- `applyJob(game, clubId)`, `withdrawApplication(game, clubId)`, `resign(game)`: `{ ok, text }`.

Akcje w `src/app.js` (`dispatchAct`, zapis gry i odświeżenie): `data-act="job-apply" data-id`, `job-withdraw`
`data-id`, `job-resign` (potwierdzenie robi widok: `k-resign-ask` ustawia `state.crResign`, po akcji `false`),
`career-unlocks-seen`. Tekst wyniku akcji: `state.kMsg` (pokazuje go nagłówek zakładki Klub, czyści zmiana podzakładki).

Tryb bez pracy w `src/app.js`: Kadra, Transfery, Trening i Klub (poza `state.kTab === 'kariera'`) pokazują krótką
informację „Nie prowadzisz teraz klubu” z przyciskiem do Kariery; zakładka Klub otwiera się na Karierze; Pulpit
pokazuje rynek pracy, pocztę i tabelę ostatniej ligi; nagłówek „Bez klubu, ostatnio: klub”; bez licznika
„Do zrobienia”.

## 9. Trenerzy AI (parytet)

- `coach.rep` (leniwie): `6 x (średnia atrybutów - 4) + { 1: 9, 2: 5, 3: 1, 4: -3 }[ostatnia liga]`, 1-90
  (projekt: 6, 3, 0, -3; korekta kalibracji, żeby średnia w Ekstraklasie była w przedziale 45-60).
- Koniec sezonu (`aiCoachSeasonEnd`, trener z co najmniej 12 meczami w klubie): tytuł, awans, Puchar Polski,
  tytuły europejskie, cel z siły kadry, spadek, sezon pod celem; ten sam stół, nasycenie i progi lig co u gracza.
  Bez zaniku na sezon u zatrudnionych (projekt -1,8; w kalibracji średnie i tak spadały o 5-8 w 8 sezonach przez zwolnienia i rotację).
  Zwolnienie: -6 x (0,6 + rep/100).
- Pula wolnych trenerów: -0,4 na miesiąc bezrobocia ponad 6 miesięcy (najwyżej 12 miesięcy na sezon, do 0,6 szczytu).
- Zatrudnianie (`hireCoach`): ocena kandydata `+ 0,04 x (rep - 0,6 x LC)`.

## 10. Kalibracja

`node tools/kariera-kalibracja.mjs <ziarna> <sezony> <premia> [klub]`: autopilot od klubu III ligi (ranking siły
w grupie 1-3), mecze gracza w tle z profilem trenera AI tego klubu powiększonym o premię (0: przeciętny trener,
3: dobry gracz), oferta z wyższej ligi przyjęta, bez pracy aplikacje do wakatów z najlepszą szansą.
Wyniki: rozdział 11 (uzupełniany po każdej kalibracji).

## 11. Wyniki kalibracji (Nov 20, 2026)

Start z klubu III ligi (ranking siły w grupie 1-3), 8-10 sezonów, ziarna 1-4, premia 0 i 3 (łącznie 16 przebiegów,
ostatni zestaw liczb po korektach z rozdziałów 4, 7 i 9):

| Miara | Wynik | Cel z projektu |
|---|---|---|
| Pierwsza oferta z 1 Ligi | w żadnym przebiegu (do 10 sezonów) | mediana 3-4 sezony |
| Pierwsza oferta z Ekstraklasy | brak | mediana 6-8 |
| Bezrobocie | średnio 40-55 dni, mediana 56-60 | 20-45 dni |
| Oferty gwarantowane (60 dni) | ok. połowa okresów bez pracy | poniżej 10 % |
| Reputacja trenerów AI, Ekstraklasa | 47-51 po 1. sezonie, 39-45 po 8 | 45-60, bez inflacji |
| 1 Liga / 2 Liga / III liga | 35-38 -> 28-30 / 22-31 -> 21-25 / 14-16 -> 13-16 | 30-42 / 22-34 / brak celu |
| Reputacja gracza na koniec | 5-18 (dwa przebiegi z awansem: 18-28) | 13-18 bez awansów |

Wnioski [SZAC]:
- Autopilot (przeciętny trener klubu, także z premią 3) jest w III lidze zwalniany w ok. 1/3 sezonów (ten sam odsetek
  co przed zmianami: test 1. sezonu, 2 z 6 przed i po). Po zwolnieniu reputacja spada do 5-10, a zasięg obejmuje
  tylko III ligę. Kariera stoi w miejscu, więc oferty z 1 Ligi nie przychodzą. Przebiegi z awansem (KSZO, Weszło)
  idą ścieżką z projektu: po awansie reputacja ok. 20-28, zasięg 37-47.
- To wynik modelu zarządu (cele i zwolnienia) bardziej niż kariery. Do decyzji właściciela: łagodniejszy zarząd w III
  lidze, wyższy start reputacji, albo zgoda na to, że kariera z III ligi wymaga aktywnej gry (lepszej od autopilota).
- Trenerzy AI tracą średnio 4-8 punktów w 8 sezonach (zwolnienia -6, rotacja z puli). Możliwa korekta: mniejsza kara
  za zwolnienie dla AI albo wyższa reputacja nowych trenerów w puli.
