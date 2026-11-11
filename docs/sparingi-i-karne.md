# Sparingi i seria rzutów karnych

Panel: trener z licencją UEFA Pro, specjalista od AI i silnika meczowego, ekspert przepisów (IFAB, PZPN, UEFA), programista JS.
Kod: `src/engine/match/rules.js` (zasady meczu), `match.js` (rozstrzygnięcie remisu, pauza i kolejność w serii, zmiany zaplanowane), `control.js` (zmiany bez limitu i rotacyjne), `coach.js` (AI trenera w sparingu). Testy: `tests/friendlyShootout.test.mjs`.

Oznaczenia: [ŹRÓDŁO] potwierdzone w źródle z listy na końcu, [PEWNE] przepisy opisane już w `docs/ekspert_sedzia.md`, [SZAC] szacunek lub założenie panelu, [ODŁOŻONE] świadomie poza zakresem.

## 1. Pytania gracza i krótkie odpowiedzi

| Pytanie | Odpowiedź |
|---|---|
| Czy w sparingu przy remisie gramy dogrywkę czy od razu karne? | Gracz wybiera przy planowaniu sparingu: bez rozstrzygnięcia (domyślnie), od razu karne, dogrywka i karne. |
| Jak silnik symuluje karne? | Law 10: zawodnicy z boiska na koniec meczu, wyrównanie liczebności, 5 serii ABAB z wcześniejszym końcem, potem nagła śmierć. Szansa gola z umiejętności strzelca (WYK, OPA, SFR) i bramkarza (REF, JNJ); w nagłej śmierci liczy się opanowanie. |
| Czy gracz może ustalić kolejność strzelców? | Do tej pory nie (kolejność automatyczna wg umiejętności, bramkarz ostatni). Teraz silnik ma API kolejności i pauzę przed serią, także w Pucharze Polski i w pucharach UEFA. UI dostanie okno wyboru z podpowiedzią. |
| Więcej zmian w sparingu? | Tak: reguła „bez limitu” (każdy rezerwowy może wejść, także po kontuzjach) albo „rotacyjne” (zmieniony może wrócić). AI w przerwie wymienia od kilku zawodników do całej jedenastki. |

## 2. Jak kluby naprawdę planują sparingi (głos trenera)

**Okresy.** Polskie kluby grają sparingi w trzech oknach, które gra już ma (`src/training/friendlies.js`, `docs/trening.md` rozdz. 12):

- **Lato, okres przygotowawczy (5-6 tygodni).** Zwykle 4-6 sparingów, w tym 3-4 na obozie (Polska, Austria, Słowenia) [ŹRÓDŁO: trening.md]. Rywale rosną z tygodniem: najpierw niższa liga albo drużyna rezerw (rozruch, pierwsze minuty), potem rywal podobny, na koniec mocny rywal zagraniczny. Ostatni sparing, „generalka”, tydzień przed ligą, w składzie zbliżonym do meczowego, 60-90 minut dla podstawowych [SZAC].
- **Zima, obóz w Turcji albo Hiszpanii.** 3-4 sparingi w 10-14 dni, często z klubami z Europy Środkowej i Wschodniej, czasem dwa mecze jednego dnia (dwie różne jedenastki na dwóch boiskach) [SZAC]. Zimą liczy się bezpieczeństwo: krótsze występy wracających po urazach.
- **Przerwa na reprezentacje (okno FIFA).** 1-2 sparingi, zwykle z klubem niższej ligi, często bez publiczności. Grają ci, którzy nie dostają minut w lidze, wracający po kontuzjach i młodzież. Reprezentanci są poza klubem [SZAC].

**Dwie jedenastki.** Wcześnie latem trener dzieli kadrę na dwie grupy i wymienia całą drużynę w przerwie (czasem w 60. minucie). Tak każdy dostaje 45 minut, a sztab porównuje grupy. Bliżej ligi podstawowi grają 60-75 minut, a wymiana jest stopniowa [SZAC].

**Minuty dla wracających.** Zawodnik po dłuższym urazie dostaje progresję 30, 45, 60, 90 minut w kolejnych sparingach. Zawodnik z wysokim długiem meczowym albo po ciężkim tygodniu treningowym gra krótko albo wcale. Nikt nie gra z bólem, bo stawką jest tylko przygotowanie [SZAC].

**Umowa klubów przed meczem.** W sparingu kluby uzgadniają z sędzią: liczbę zmian (najczęściej bez praktycznego limitu), czy zmieniony zawodnik może wrócić (zwykle w meczach zamkniętych, kontrolnych), długość gry (czasem 3 x 30 albo 4 x 30 minut za zamkniętymi drzwiami), rozstrzygnięcie remisu (zwykle żadne; karne na turniejach towarzyskich i gdy kluby chcą je przećwiczyć) [SZAC].

**Mecze za zamkniętymi drzwiami.** Częste w oknach FIFA i zimą (np. Lech Poznań w 2024 r. grał sparing bez kibiców i mediów) [ŹRÓDŁO: Lech Poznań]. W grze to już działa przez frekwencję sparingów (`careerSystem.js`, bilety x0,12); osobnej opcji panel nie dodaje [ODŁOŻONE].

## 3. Przepisy (głos eksperta)

### Zmiany w meczach innych niż o stawkę (IFAB Law 3)

- Mecz towarzyski klubów: więcej zmian, jeśli drużyny uzgodnią maksymalną liczbę i poinformują sędziego przed meczem; bez porozumienia najwyżej 6 zmian [ŹRÓDŁO: The FA, Law 3, tekst sprzed 2026/27].
- 2026/27: w meczach towarzyskich reprezentacji A do 8 zmian, 11 za zgodą obu stron po poinformowaniu sędziego, przy 3 oknach [ŹRÓDŁO: IFAB, zmiany przepisów 2026/27; nie dotyczy klubów, podane dla porównania].
- Zmiany powrotne (zmieniony wraca na boisko): przepisy dopuszczają je w piłce młodzieżowej, weteranów, osób z niepełnosprawnościami i amatorskiej (grassroots), za zgodą związku; okólnik IFAB z 2020 r. wyklucza je w rozgrywkach seniorskich [ŹRÓDŁO: IFAB]. W grze opcja „rotacyjne” oznacza mecz kontrolny klubów za zamkniętymi drzwiami, rozgrywany wg umowy, a nie oficjalny sparing z pełnym protokołem [SZAC]. Panel zostawia ją, bo gracz o nią prosił i bo tak wyglądają gierki kontrolne.

### Rozstrzygnięcie remisu w rozgrywkach

| Rozgrywki | Remis | Pewność |
|---|---|---|
| Puchar Polski (jeden mecz) | dogrywka 2 x 15 min, potem karne wg Przepisów gry | [ŹRÓDŁO: Regulamin PP 2025/26, uchwała III/40 Zarządu PZPN z Mar 31, 2025] |
| Baraże 1 Ligi i 2 Ligi, finały UEFA | dogrywka, karne | [PEWNE] |
| Dwumecze UEFA | suma bramek, bez bramek wyjazdowych, dogrywka w rewanżu, karne | [PEWNE] |
| Superpuchar Polski | od razu karne | [SZAC, założenie z ekspert_sedzia.md] |
| Sparing | wg umowy klubów | [SZAC] |

### Seria rzutów karnych (IFAB Law 10)

1. Losowanie bramki, drugie losowanie: zwycięzca wybiera, czy strzela pierwszy [PEWNE].
2. Kolejność ABAB. Format ABBA (jak tie-break w tenisie) testowano w 2017 r. na Euro U17 UEFA i w rozgrywkach EFL 2017/18; nie wszedł do przepisów [ŹRÓDŁO: ESPN, EFL/Brentford, City AM].
3. Uprawnieni: tylko zawodnicy na boisku na koniec meczu (dogrywki) i chwilowo poza nim (opatrywani). Rezerwowi i zmienieni nie strzelają; po końcu meczu nie ma już zmian (wyjątek: kontuzja bramkarza w serii) [PEWNE].
4. Wyrównanie liczebności przed serią: drużyna z większą liczbą zawodników wskazuje, kto nie strzela [PEWNE].
5. Kolejność wybiera drużyna, każdy strzela raz, zanim ktokolwiek strzeli drugi raz [PEWNE].
6. Każdy uprawniony zawodnik może zamienić się z bramkarzem [PEWNE].

### Co naprawdę decyduje trener przed serią

- **Kolejność pięciu.** Najczęściej najpewniejszy strzelec na 1. albo 5. miejscu; piąty strzał bywa decydujący, więc tam trafia zawodnik z największym opanowaniem. Badania o przewadze strzelających pierwszych są niezgodne (Apesteguia i Palacios-Huerta, 2010: ok. 60 % wygranych; Kocher, Lenz i Sutter, 2012: brak istotnej przewagi) [SZAC, przytoczone z pamięci].
- **Kto nie strzela.** Zmęczeni, grający z bólem, młodzi po błędzie w meczu. Przy wyrównaniu liczebności odpadają właśnie oni.
- **Bramkarz od karnych.** Zmiana tuż przed końcem dogrywki (Tim Krul za Jaspera Cillessena w ćwierćfinale MŚ 2014 Holandia i Kostaryka, Krul obronił dwa karne). Silnik robi to już za AI (`penaltyKeeperCand`, rezerwowy lepszy średnio o 1,5 w REF i JNJ); teraz także przy serii bez dogrywki (w doliczonym czasie 2. połowy).

## 4. Decyzje panelu

### Opcje sparingu ustawiane przy planowaniu

| Opcja | Wartości | Domyślnie | Uzasadnienie |
|---|---|---|---|
| Rozstrzygnięcie remisu (`decider`) | `none` bez rozstrzygnięcia, `penalties` od razu karne, `et_penalties` dogrywka i karne | `none` | Typowy sparing kończy się remisem. Dogrywka w sparingu to rzadkość, bo dokłada 30 minut obciążenia [SZAC]. |
| Zmiany (`subs`) | `standard` 5 w 3 oknach (+1 i +1 w dogrywce), `unlimited` bez limitu, zmieniony nie wraca, `rolling` bez limitu i powroty | `unlimited` | Odpowiada umowom klubów; „rotacyjne” to mecz kontrolny. |
| Plan rotacji (`rotation`) | `auto`, `two_xi` dwie jedenastki, `staggered` stopniowo, `match` jak w meczu o punkty | `auto` | Steruje asystentem gracza („Pokaż wynik”, podpowiedzi). Rywal AI wybiera sam. |
| Zmiany zaplanowane (`plannedSubs`) | lista `{ at: 'HT' albo minuta, outId, inId }` | brak | „Druga jedenastka po przerwie” ustawiona przed meczem. |
| Okres (`period`) | `lato`, `zima`, `fifa` (z `friendlyPeriod`) | z terminu | AI częściej gra dwiema jedenastkami latem. |

Ławka w sparingu: cała dostępna kadra do 14 zawodników u obu drużyn [SZAC]. Długość połów i liczba części zostaje 2 x 45 [ODŁOŻONE: 3 x 30 i 4 x 30].

### AI trenera w sparingu (`coach.js`, `FRIENDLY_AI`) [SZAC]

| Zachowanie | Parametr |
|---|---|
| Plan losowany raz na mecz: dwie jedenastki z szansą lato 0,6, zima 0,45, okno FIFA 0,3, inne 0,45; tylko przy zmianach bez limitu i co najmniej 8 rezerwowych z pola | `twoXi`, `twoXiBench` |
| Dwie jedenastki: w przerwie schodzi cała dziesiątka z pola (tylu, ilu jest rezerwowych), bramkarz z szansą 0,85 | `gkHt` |
| Rotacja stopniowa: w przerwie 4-7 zawodników (przy 5 zmianach: 3), bramkarz z szansą 0,6; potem pozostali z wyjściowego składu w 60-75' (najwyżej 1 zostaje na 90 minut) | `htStaggered`, `htStandard`, `starterOut`, `keepOn` |
| Kolejność schodzenia: dług meczowy, niska świeżość, brak ostrości po urazie, wiek 31+, minuty w meczu, lekki uraz | `protectScore` |
| Zawsze: zmęczony (kondycja < 72) schodzi; dług meczowy >= 20 schodzi po 55'; lekki uraz (także stłuczenie) to zmiana od razu | `tired`, `debtHigh`, `knockSubs` |
| Od 70' minuty dostają rezerwowi, którzy jeszcze nie grali (szansa 0,7 na każdego) | `restFrom`, `restP` |
| Zawodnik zmieniony przy zmianach rotacyjnych wraca tylko, gdy na ławce nie ma nikogo innego | `benchPool` |
| Bez gry na czas w sparingu | `desiredInstructions` |

Wynik symulacji (200 sparingów na wariant, Ekstraklasa, ławka 12): bez limitu średnio 10,9 zmiany na drużynę, 8,3 w przerwie; ławka 9: 7,9 i 6,1; przy 5 zmianach: 5,2 i 3,4 (w dogrywce do 6).

### Seria rzutów karnych z wyborem gracza

- Pauza przed serią na życzenie UI (`ctx.shootoutPrep: true`): silnik zatrzymuje się w fazie `shootoutPrep`, gracz widzi okno „Kolejność strzelców” z podpowiedzią asystenta (kolejność automatyczna), może przeciągać zawodników, wskazać bramkarza serii i zatwierdzić. „Zatwierdź podpowiedź” daje dokładnie to, co silnik zrobiłby bez pytania.
- Kolejność można ustawić wcześniej (np. w przerwie przed dogrywką albo w 115'): lista zostaje i jest sprawdzana ponownie na starcie serii (zawodnik zmieniony lub wykluczony wypada, resztę uzupełnia kolejność automatyczna).
- Zmiany w czasie pauzy są zablokowane (Law 10). Bramkarza od karnych trzeba wpuścić przed końcem meczu; UI może o tym przypomnieć w 118' dogrywki, gdy na ławce jest lepszy bramkarz.
- AI rywala i asystent: kolejność automatyczna (bez zmian względem dotychczasowego silnika).
- Pierwszy strzela zawsze gospodarz [ODŁOŻONE]: losowanie monetą zmieniłoby wyniki dotychczasowych meczów o tych samych ziarnach.

## 5. API silnika dla UI

Wszystko eksportuje `src/engine/match/match.js`.

### Tworzenie meczu (`createMatch`, pole `ctx`)

```js
ctx = {
  // mecze o stawkę (bez zmian): knockout: false | 'single' | 'penaltiesOnly' | { firstLeg: [g, g] }
  friendlyRules: {                // sparing; ctx.friendly: true = same wartości domyślne
    decider: 'none' | 'penalties' | 'et_penalties',
    subs: 'standard' | 'unlimited' | 'rolling',
    rotation: 'auto' | 'two_xi' | 'staggered' | 'match',
    period: 'lato' | 'zima' | 'fifa' | null,
    plannedSubs: { 0: [{ at: 'HT' | 60, outId, inId }], 1: [] },  // klucz = strona w meczu
  },
  shootoutPrep: true,             // pauza przed serią (mecze gracza oglądane na żywo)
}
```

- `M.rules`: `{ friendly, decider, subs, reentry, rotation, period, plannedSubs }` (z `matchRules(ctx)`).
- Stałe: `DECIDERS`, `SUB_RULES`, `ROTATIONS`, `FRIENDLY_DEFAULTS` (do list wyboru w UI), `matchRules(ctx)`.
- Zmiany bez limitu: `T.subsLimit` i `T.windowsLimit` mają 99. UI pokazuje „bez limitu”, gdy `M.rules.subs !== 'standard'`. `subsAvailable(M, T)` zwraca wtedy liczbę rezerwowych, którzy mogą wejść.

### Zmiany

- `substitute`, `canSubstitute` bez zmian w wywołaniu. Nowe komunikaty: „Kontuzjowany zawodnik nie może wrócić na boisko.”, „Przed serią rzutów karnych nie można już robić zmian...”.
- Zmiany rotacyjne: schodzący wraca do `T.bench` (`x.rolledOff` = ile razy zszedł, `x.prevMins` = minuty z wcześniejszych wejść); zdarzenie `sub` ma `outToBench: true`, a ponowne wejście `reentry: true`.
- `playerStates(M, side)`: nowe pola `minutes` (minuty w meczu, sumowane przy powrotach) i `rolledOff`.
- `result(M).ratings`: obejmują zawodników na ławce, którzy grali (zmiany rotacyjne), minuty zsumowane.
- Zmiany zaplanowane: zdarzenie `sub` z `by: 'plan'`, `why: 'planned'`; niewykonalna: zdarzenie `plannedSubSkipped { outId, inId, error, text }`.
- `assistantSuggest(M, side)` w przerwie sparingu zwraca masową wymianę wg planu rotacji (bez losowania, bez zmian w meczu); każde działanie wykonuje `applySuggestion`.

### Seria rzutów karnych

| Funkcja | Opis |
|---|---|
| `step(M)` | Zwraca `state: 'shootoutPrep'`, gdy mecz czeka na serię (tylko z `ctx.shootoutPrep`). Zdarzenie `shootoutPrep { takers, text }`. Kolejny `step(M)` rozgrywa serię z bieżącymi ustawieniami (zgodność wstecz). |
| `shootoutCandidates(M, side)` | `{ available, error, n, excluded, keeperId, order, suggested, final, players: [{ id, name, last, pos, natPos, keeper, kick, opa, pct, cond, knock, treated, autoRank }] }`. `kick` to średnia WYK, OPA, SFR (1-20), `pct` szansa gola w % przeciw bramkarzowi rywala, `autoRank` miejsce w kolejności automatycznej (null: wypadłby przy wyrównaniu). Działa także przed końcem meczu (stan na teraz). |
| `setShootoutOrder(M, side, ids, { keeperId })` | `ids`: id zawodników z boiska w kolejności strzałów (lista może być krótsza, resztę uzupełnia automat; `null` = automat). `keeperId`: zawodnik z boiska w bramce w serii (`null` = bramkarz z boiska). Zwraca `{ ok, final, excluded }` albo `{ ok: false, error }`. Błędy: brak serii w tym meczu, seria już była, mecz skończony, zawodnik spoza boiska, duplikat, zły bramkarz. |
| `startShootout(M)` | Rozgrywa serię po pauzie i kończy mecz. `{ ok }` albo `{ ok: false, error }`. |
| `runToEnd(M)` | Przechodzi przez pauzę (kolejność ustawiona albo automatyczna). |
| `result(M).shootout` | `{ goals, kicks: [{ side, pid, scored, outcome, gkId, round, suddenDeath }], order: [[ids], [ids]], keepers: [id, id] }`. |

## 6. Okablowanie dla kolejnego agenta (UI i dzień meczowy)

Silnik nie zmienia nic w meczach, dopóki te pola nie zostaną przekazane.

1. **`src/training/friendlies.js`, `createFriendly(game, date, oppId, opts = {})`**: przyjąć `opts = { decider, subs, rotation }`, sprawdzić wartości z `DECIDERS`, `SUB_RULES`, `ROTATIONS` (`src/engine/match/rules.js`), domyślnie `FRIENDLY_DEFAULTS`, i zapisać w wpisie terminarza `friendlyRules: { decider, subs, rotation, period: period.kind }`. Funkcja do zmiany zasad przed dniem meczu: `setFriendlyRules(game, id, opts)` (te same reguły co `cancelFriendly`: tylko przyszły, nierozegrany sparing).
2. **Ekran planowania sparingu (`src/ui/trainingView.js`)**: trzy przełączniki pod wyborem rywala: „Remis: bez rozstrzygnięcia / od razu karne / dogrywka i karne”, „Zmiany: 5 jak w lidze / bez limitu / rotacyjne (zmieniony może wrócić)”, „Plan zmian: asystent decyduje / dwie jedenastki / stopniowo / jak w meczu”. Przy rotacyjnych krótka uwaga: „mecz kontrolny, zmiany powrotne wg umowy klubów”.
3. **`src/match/matchday.js`, przygotowanie dnia meczowego**: dla `comp === 'friendly'` ławka obu drużyn `benchSize: 14` (cała dostępna kadra do 14) zamiast 12.
4. **`kickOff` (matchday.js), `ctx` w `createMatch`**:
   - `friendlyRules: S.f.comp === 'friendly' ? { ...(S.f.friendlyRules ?? {}), plannedSubs: S.plannedSubs ? { [S.userSide]: S.plannedSubs } : null } : undefined`,
   - `shootoutPrep: true`,
   - `knockout`: przekazywać też `'penaltiesOnly'` (Superpuchar): `['single', 'penaltiesOnly'].includes(S.f.knockout) ? S.f.knockout : S.f.knockout?.firstLeg ? { firstLeg: [...] } : false`. Losowe 4:3 w `finishMatchday` zostaje jako zabezpieczenie (nie zadziała, bo silnik da serię). To samo w `playMyMatch` w `src/app.js`.
5. **`tick(S)` (matchday.js)**: `if (r.state === 'shootoutPrep') S.step = 'shootoutPrep';` UI pokazuje okno kolejności (`shootoutCandidates(S.M, S.userSide)`, przeciąganie, wybór bramkarza, przycisk „Podpowiedź asystenta”), zatwierdzenie: `setShootoutOrder(S.M, S.userSide, ids, { keeperId })`, potem `startShootout(S.M)` i `S.step = 'fulltime'`. Serię warto pokazać strzał po strzale ze zdarzeń `shootoutKick` (pauza ok. 1,5 s).
6. **`finishMatchday`**: warunek `if (M.phase === 'break' && !M.ended)` zmienić na `if (!M.ended)` (wyjście z meczu w pauzie przed serią).
7. **`liveRatings(S)` w matchday.js** czyta tylko `T.players`; przy zmianach rotacyjnych lepiej użyć `liveRatings(M)` z `match.js` (obejmuje ławkę z minutami).
8. **Okno zmian w meczu**: przy `M.rules.subs !== 'standard'` licznik „bez limitu”, bez licznika okien; przy `rolling` zmienieni są na liście ławki z oznaczeniem „może wrócić” (`playerStates().rolledOff > 0`) i minutami (`minutes`). W przerwie sparingu przycisk „Druga jedenastka” wykonuje podpowiedzi `assistantSuggest`.
9. **Plan drugiej jedenastki przed meczem (opcjonalnie)**: w odprawie przedmeczowej sparingu lista par „schodzi / wchodzi” z `at: 'HT'` albo minutą, zapis w `S.plannedSubs`.
10. **Przypomnienie o bramkarzu od karnych**: w 118' dogrywki, gdy `shootoutCandidates(M, side).available` i na ławce jest bramkarz z lepszym REF i JNJ, komunikat asystenta.
11. `npm run sw` po dodaniu plików.

## 7. Testy i kalibracja

- `tests/friendlyShootout.test.mjs` (15 testów): zasady meczu z `ctx`, 11 zmian i więcej okien bez limitu, zmiana po kontuzji, brak powrotu przy „bez limitu”, powroty i sumowanie minut przy „rotacyjnych”, trzy warianty rozstrzygnięcia remisu, Superpuchar od razu na karne, masowe i zróżnicowane zmiany AI w przerwie (średnio co najmniej 5, czasem 10), krótsze występy przy długu meczowym, zejście ze stłuczeniem, podpowiedź asystenta w przerwie, zmiany zaplanowane, kolejność gracza i bramkarz serii, walidacja listy, kolejność automatyczna = podpowiedź, pauza nie zmienia wyniku (puchar i dwumecz), zgodność wstecz `step` i `runToEnd`, determinizm.
- Kalibracja: 2400 meczów o stawkę (ligowe, jednomeczowe pucharowe, rewanże dwumeczów, z VAR i bez, z asystentem gracza) na tych samych ziarnach przed zmianą i po niej: 0 różnic w pełnym wyniku (zdarzenia, oceny, statystyki, seria rzutów karnych; 124 serie, 262 dogrywki, 2,95 gola na mecz). Nowe pola `shootout.order` i `shootout.keepers` pominięte w porównaniu.

## 8. Źródła

- [IFAB: zmiany przepisów gry 2026/27](https://downloads.theifab.com/downloads/changes-to-the-laws-of-the-game-202627?l=en) (zmiany w meczach towarzyskich reprezentacji A)
- [IFAB: okólnik 20/2020](https://downloads.theifab.com/downloads/circular-20_2020?l=de) (zmiany powrotne poza rozgrywkami seniorskimi)
- [The FA: Law 3, The Players](https://www.thefa.com/football-rules-governance/lawsandrules/laws/football-11-11/law-3---the-players) (liczba zmian w innych meczach, zmiany powrotne)
- [PZPN: Regulamin Pucharu Polski 2025/2026](https://pzpn.pl/public/system/files/site_content/635/6577-Regulamin%20Pucharu%20Polski%202025-2026.pdf)
- [ESPN: UEFA testuje system ABBA](https://www.espn.com/football/blog-uefa/story/3118000/uefa-set-to-experiment-with-new-abba-penalty-shootout-system)
- [Brentford FC: ABBA w rozgrywkach EFL](https://www.brentfordfc.com/en/news/new-penalty-trial-for-efl-competitions_190092)
- [City AM: ABBA odłożony](https://cityam.com/?p=1812051)
- [Lech Poznań: ostatni sparing bez publiczności](https://www.lechpoznan.pl/aktualnosci,2,w-sobote-ostatni-sparing,43286.html)
- `docs/ekspert_sedzia.md` (A1, A6, B), `docs/trening.md` (rozdz. 11-12), `docs/sytuacje-meczowe.md` (G).

Strona theifab.com nie była dostępna z tej sesji; tekst Law 3 i Law 10 2025/26 podano za źródłami wtórnymi i `docs/ekspert_sedzia.md`.
