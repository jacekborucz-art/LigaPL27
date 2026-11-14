# Wieczny kalendarz reprezentacji

Stan: Nov 14, 2026. Kod: `src/season/intl/` (windows.js, engine.js, sim.js, ratings.js, hosts.js), integracja w `src/season/nationalSystem.js`, widok w `src/ui/nationalView.js`. Testy: `tests/intlCalendar.test.mjs`, `tests/intlEngine.test.mjs`, `tests/nationalView.test.mjs`.

Oznaczenie **[SZAC]**: założenie gry, nie fakt ze źródeł.

## 1. Podział pracy

- `src/season/national.js` zostaje bez zmian w zakresie rozgrywek zapisanych na sztywno: Liga Narodów 2026/27 (faza ligowa, ćwierćfinały i baraże w marcu 2027, Final Four w czerwcu 2027) oraz grupy eliminacji Euro 2028 (losowanie Dec 6, 2026, mecze od marca do listopada 2027). Po Dec 31, 2027 national.js obsługuje już tylko powołania.
- `src/season/intl/engine.js` przejmuje wszystko dalej: baraże i turniej Euro 2028 (z tabel grup z national.js), Ligę Narodów od 2028/29, eliminacje i turnieje kolejnych lat, turnieje innych konfederacji i sparingi Polski.
- Stan gry: `game.national` (jak dotąd), `game.intl` (silnik), `game.intlHistory` (historia edycji).

## 2. Okna FIFA na każdy rok

| Rok | Okna (mecze) |
|---|---|
| nieparzysty | marzec (2), czerwiec (2), wrzesień-październik (4), listopad (2) |
| parzysty | marzec (2, baraże), przełom maja i czerwca (2 sparingi), turniej VI-VII, wrzesień-październik (4), listopad (2) |

- Lata do 2030: daty z `src/data/reprezentacje.json` (oknaFIFA). Okna opisane w danych jako „szacunek wg wzorca” (2029 i marzec 2030) zastępuje wzorzec gry. Brakujące okno sparingowe przed MŚ 2030 (May 27 - Jun 4, 2030) wyliczone: wtorek co najmniej 3 dni przed turniejem [SZAC].
- Później: okna sezonu 2026/27 (Sep 21, Nov 9, Mar 22, Jun 7, zawsze od poniedziałku) przesunięte o pełne tygodnie, tak samo jak kalendarz ligi i pucharów UEFA w `setSeasonYear`. Dzięki temu okno nigdy nie trafia na kolejkę Ekstraklasy, rundę Pucharu Polski ani dzień meczowy UEFA (test na latach 2027-2130).
- Rok turniejowy: okno sparingowe = czerwcowe okno przesunięte o tydzień wcześniej; Euro startuje w piątek po oknie (31 dni), MŚ w czwartek po oknie (39 dni, jak MŚ 2026). Euro 2028 i MŚ 2030 mają daty z danych.
- Finały pucharów UEFA w roku turniejowym są przed oknem sparingowym (jak w 2016, 2021, 2024): finał LM w sobotę przed oknem, LK w środę, LE tydzień wcześniej [SZAC].
- Ekstraklasa nie gra w oknach (jak dotąd). 1 Liga i 2 Liga grają według terminarza; zawodnik powołany z klubu, który ma mecz w oknie sparingowym przed turniejem (finały sezonu, baraże), dojeżdża na zgrupowanie po tym meczu.
- Dni meczowe: okno 4-meczowe pt, pn, pt, pn; okno 2-meczowe pt, pn; baraże jednomeczowe czw i wt; finały Ligi Narodów śr, czw i nd.

## 3. Cykl dwuletni

| Okres | Europa |
|---|---|
| luty roku parzystego | losowanie Ligi Narodów |
| IX-XI roku parzystego | faza ligowa Ligi Narodów (6 meczów) |
| XII roku parzystego | losowanie eliminacji turnieju za 2 lata (wszystkie konfederacje przy MŚ) |
| III roku nieparzystego | ćwierćfinały LN, baraże A/B i B/C; eliminacje kolejki 1-2 |
| VI roku nieparzystego | finały LN; eliminacje kolejki 3-4 |
| IX-XI roku nieparzystego | eliminacje kolejki 5-10 |
| XII roku nieparzystego | losowanie grup turnieju (z miejscami „zwycięzca baraży”) |
| III roku parzystego | baraże UEFA i interkontynentalne |
| VI-VII roku parzystego | Euro (rok podzielny przez 4) albo MŚ (pozostałe lata parzyste) |

Przykładowa dekada (gospodarze od 2036 zależą od ziarna gry):

| Rok | Okna FIFA | Rozgrywki |
|---|---|---|
| 2027 | Mar 22-30, Jun 7-15, Sep 20 - Oct 5, Nov 8-16 | Puchar Azji Jan 7 - Feb 5 (Arabia Saudyjska); LN 2026/27 QF i baraże, finały; Puchar Narodów Afryki Jun 19 - Jul 17 (Kenia, Uganda, Tanzania); Złoty Puchar Jun 19 - Jul 11; eliminacje Euro 2028 |
| 2028 | Mar 20-28, May 29 - Jun 6, Sep 18 - Oct 3, Nov 13-21 | baraże Euro; Euro Jun 9 - Jul 9 (Anglia, Irlandia, Szkocja, Walia); Copa América Jun 16 - Jul 10; Puchar Narodów Oceanii Jun 17-30; LN 2028/29 faza ligowa |
| 2029 | Mar 19-27, Jun 4-12, Sep 24 - Oct 9, Nov 12-20 | LN 2028/29 QF, baraże, finały; Złoty Puchar Jun 16 - Jul 8; eliminacje MŚ 2030 (wszystkie konfederacje) |
| 2030 | Mar 25 - Apr 2, May 27 - Jun 4, Sep 23 - Oct 8, Nov 11-19 | baraże UEFA i interkontynentalne; MŚ Jun 8 - Jul 21 (Hiszpania, Portugalia, Maroko); LN 2030/31 |
| 2031 | Mar 24 - Apr 1, Jun 9-17, Sep 22 - Oct 7, Nov 10-18 | Puchar Azji Jan 9 - Feb 7; LN QF, finały; PNA Jun 21 - Jul 19; Złoty Puchar Jun 21 - Jul 13; eliminacje Euro 2032 |
| 2032 | Mar 22-30, May 31 - Jun 8, Sep 20 - Oct 5, Nov 8-16 | baraże; Euro Jun 11 - Jul 11 (Włochy, Turcja); Copa América Jun 18 - Jul 12; Puchar Narodów Oceanii Jun 19 - Jul 2; LN 2032/33 |
| 2033 | Mar 21-29, Jun 6-14, Sep 19 - Oct 4, Nov 7-15 | LN QF, finały; Złoty Puchar Jun 18 - Jul 10; eliminacje MŚ 2034 |
| 2034 | Mar 20-28, May 29 - Jun 6, Sep 18 - Oct 3, Nov 6-14 | baraże; MŚ Jun 8 - Jul 16 (Arabia Saudyjska); LN 2034/35 |
| 2035 | Mar 19-27, Jun 4-12, Sep 24 - Oct 9, Nov 12-20 | Puchar Azji Jan 11 - Feb 9; LN QF, finały; PNA Jun 16 - Jul 14; Złoty Puchar Jun 16 - Jul 8; eliminacje Euro 2036 |
| 2036 | Mar 24 - Apr 1, Jun 2-10, Sep 22 - Oct 7, Nov 10-18 | baraże; Euro Jun 13 - Jul 13; Copa América Jun 20 - Jul 14; Puchar Narodów Oceanii Jun 21 - Jul 4; LN 2036/37 |
| 2037 | Mar 23-31, Jun 8-16, Sep 21 - Oct 6, Nov 9-17 | LN QF, finały; Złoty Puchar Jun 20 - Jul 12; eliminacje MŚ 2038 |

## 4. Formaty

### Liga Narodów (od 2028/29)
- Trzy ligi po 18 drużyn (A, B, C), skład 2028/29 z wyników 2026/27 według reguł przejścia z `reprezentacje.json` (ligaNarodow2026.przejscieDo2028).
- Faza ligowa [SZAC]: liga szwajcarska. Trzy koszyki po 6 (według Elo), każda drużyna gra 6 meczów: z 2 rywalami z każdego koszyka, raz u siebie, raz na wyjeździe. Kolejka obejmuje wszystkie 18 drużyn (6 kolejek w oknach IX/X i XI). Źródła mówią o „3 grupach po 6” i 6 meczach na drużynę bez szczegółów.
- Liga A: miejsca 1-8 ćwierćfinały (1-8, 2-7, 3-6, 4-5, dwumecze w marcu), 15-16 baraż o utrzymanie, 17-18 spadek. Liga B: 1-2 awans, 3-4 baraż o awans, 15-16 baraż o utrzymanie, 17-18 spadek. Liga C: 1-2 awans, 3-4 baraż o awans. Baraże: A15-B4, A16-B3, B15-C4, B16-C3 (dwumecze) [SZAC].
- Final Four w czerwcu na neutralnym terenie: półfinały, mecz o 3. miejsce, finał.

### Eliminacje UEFA (Euro i MŚ)
- 12 grup, mecz i rewanż. 54 drużyny: 6 grup po 5 (start w marcu) i 6 grup po 4 (start we wrześniu). Drużyny grające w marcu w Lidze Narodów (ćwierćfinały i baraże, w tym przyszli finaliści) trafiają do grup 4-zespołowych, więc nie ma kolizji z marcowymi meczami LN ani z finałami w czerwcu [SZAC; w 2027 grupy 4-zespołowe startują w czerwcu według national.js].
- Koszyki według bieżącego Elo; gospodarze Euro w różnych grupach.
- Euro: awans zwycięzców grup i 8 najlepszych drużyn z 2. miejsc (porównanie punktów na mecz) = 20. Gospodarze bez awansu z grup: do 2 miejsc zarezerwowanych (najwyższe Elo). Reszta (4 minus miejsca gospodarzy): baraże w marcu, ścieżki po 4 drużyny (półfinał i finał jednomeczowe). Do baraży: pozostałe drużyny z 2. miejsc, potem najwyżej w rankingu Ligi Narodów bez awansu [SZAC].
- MŚ: gospodarze z UEFA nie grają w eliminacjach. Miejsca UEFA: 16 minus gospodarze z UEFA. Bezpośrednio zwycięzcy grup, reszta w barażach (drużyny z 2. miejsc, potem ranking LN) [SZAC; nowy format UEFA na 2030 nie jest znany w szczegółach].
- Euro 2028: grupy i mecze z national.js, kwalifikacja i baraże (Mar 23-28, 2028) w silniku; do baraży po drużynach z 2. miejsc wchodzą zwycięzcy grup LN 2026/27 bez awansu.

### Eliminacje MŚ innych konfederacji (w tle)
Mecze symulowane w oknach roku eliminacji (10 dni meczowych), zapisane tylko tabele grup. Tylko członkowie FIFA, bez gospodarzy turnieju.

| Konfederacja | Format [SZAC] | Miejsca na MŚ (z gospodarzami) | Baraż interkontynentalny |
|---|---|---|---|
| UEFA | jak wyżej | 16 | 0 |
| CAF | 9 grup po 6 (54 drużyny), awans najlepszych zwycięzców grup | 9 | 1 |
| AFC | 8 grup (46 drużyn) | 8 | 1 |
| CONMEBOL | jedna liga, mecz i rewanż | 6 | 1 |
| CONCACAF | 6 grup (35 drużyn) | 6 | 2 |
| OFC | 2 grupy i finał | 1 | 1 |

Kolejność w konfederacji: zwycięzcy grup (punkty na mecz), potem drugie miejsca itd.; w OFC najpierw zwycięzca i przegrany finału. Gospodarze zajmują miejsca swojej konfederacji (MŚ 2030: UEFA 14 z eliminacji, CAF 8).

Baraż interkontynentalny (marzec roku MŚ, teren neutralny): 6 drużyn, dwie najwyżej w Elo czekają w finałach, pozostałe grają półfinały (3-6, 4-5). Dwóch zwycięzców jedzie na MŚ.

### Turnieje finałowe

| Turniej | Drużyny | Grupy | Faza pucharowa | Mecz o 3. miejsce | Cykl [SZAC poza znanymi edycjami] |
|---|---|---|---|---|---|
| Mistrzostwa świata | 48 | 12 po 4 | 2 najlepsze + 8 z 3. miejsc, 1/16 finału | tak | lata parzyste niepodzielne przez 4 |
| Euro | 24 | 6 po 4 | 2 najlepsze + 4 z 3. miejsc, 1/8 finału | nie | lata podzielne przez 4 |
| Copa América | 16 (10 CONMEBOL + 6 zaproszonych z CONCACAF) | 4 po 4 | ćwierćfinały | tak | co 4 lata, w latach Euro (bez kolizji z MŚ), VI-VII |
| Puchar Narodów Afryki | 24 | 6 po 4 | 1/8 finału | tak | 2027 (VI-VII), potem co 4 lata (2031, 2035...) |
| Puchar Azji | 24 | 6 po 4 | 1/8 finału | nie | 2027 (styczeń, Arabia Saudyjska), potem co 4 lata w styczniu |
| Złoty Puchar CONCACAF | 16 | 4 po 4 | ćwierćfinały | nie | lata nieparzyste, VI-VII |
| Puchar Narodów Oceanii | 8 | 2 po 4 | półfinały | nie | co 4 lata, w latach Euro, czerwiec |

- Losowanie grup: koszyki według Elo, gospodarze w koszyku 1 (grupy A, B, C...). MŚ: najwyżej jedna drużyna z konfederacji w grupie, z UEFA dwie; miejsce z baraży interkontynentalnych liczy się jako każda konfederacja, z której może przyjść zwycięzca.
- Drabinka: rozstawienie zwycięzcy grup, drugie miejsca, najlepsze trzecie; w pierwszej rundzie bez meczu drużyn z tej samej grupy [SZAC, uproszczenie tabeli UEFA i FIFA].
- Turnieje kontynentalne: eliminacje nie są symulowane. Uczestnicy: gospodarze i najsilniejsi według Elo z losowym rozrzutem (odchylenie 70 punktów) [SZAC].
- Gospodarz gra „u siebie” (przewaga własnego boiska), pozostałe mecze na neutralnym terenie. Dogrywka i karne w meczach pucharowych.
- Terminy turniejów kontynentalnych [SZAC]: Puchar Azji od pierwszego czwartku od 7 stycznia; PNA i Złoty Puchar od soboty po czerwcowym oknie; Copa América od piątku tydzień po oknie sparingowym; Puchar Narodów Oceanii od soboty 6 dni po tym oknie.

## 5. Gospodarze

- Znane: Euro 2028 Anglia, Irlandia, Szkocja, Walia; Euro 2032 Włochy, Turcja; MŚ 2030 Hiszpania, Portugalia, Maroko (mecze otwarcia w Urugwaju, Argentynie i Paragwaju gra nie uwzględnia; te kraje grają w eliminacjach) [SZAC]; MŚ 2034 Arabia Saudyjska; Puchar Azji 2027 Arabia Saudyjska; PNA 2027 Kenia, Uganda, Tanzania.
- Dalej: losowanie z ziarna gry spośród kandydatów (`src/season/intl/hosts.js`), bez kraju, który był gospodarzem w ostatnich 20 latach (MŚ: 40). MŚ: rotacja konfederacji, bez konfederacji gospodarzy dwóch poprzednich turniejów (zasada FIFA); Oceania tylko we wspólnej kandydaturze z Australią. Wśród kandydatów na Euro jest Polska (gospodarz ma zapewnione miejsce, jeśli nie awansuje z grupy, w puli 2 miejsc dla gospodarzy).

## 6. Siła reprezentacji (Elo)

- `game.intl.ratings` = Elo każdej reprezentacji (UEFA i reszta świata). Na starcie wartości z danych. L liczone tym samym wzorem co w `docs/reprezentacje.md` (rozdz. 2), z tymi samymi ograniczeniami (minimum 6.5, miękki sufit od 16.5).
- Aktualizacja po każdym meczu symulowanym w grze (także Liga Narodów 2026/27 i eliminacje Euro 2028 z national.js): wzór World Football Elo, przewaga gospodarza 100 punktów, mnożnik różnicy goli (1; 1.5; (11+N)/8). Karne liczą się jak remis.
- Współczynnik K: MŚ 30, mistrzostwa kontynentu 25, eliminacje, Liga Narodów i baraże 20, sparingi 10. To połowa wartości World Football Elo: mecze symulowane nie niosą informacji o realnej zmianie kadry, a pełne K dawało po 100 latach rozrzut kilkuset punktów (sprawdzone w symulacji).
- 1 stycznia każdego roku (od 2028) 15 % różnicy wraca do poziomu kraju z danych. W teście 100 lat odchylenie od poziomu bazowego wynosi ok. 40 punktów, maksymalnie ok. 130-220.
- Wyniki Polski zmieniają jej Elo i L, a więc szanse w kolejnych meczach, koszyk w losowaniach i próg powołań (zawodnicy innych krajów: L kadry minus 1.5).
- W tabelach ostatnim kryterium jest Elo z danych (stałe), więc tabela po zakończeniu fazy się nie zmienia.

## 7. Powołania i zawodnicy

- Powołania w każdym oknie każdego roku (`selectCallups` z national.js, bez zmian w zasadach).
- Euro i MŚ: powołanie do okna sparingowego przed turniejem. Zawodnicy reprezentacji, która gra w turnieju, zostają na zgrupowaniu do dnia po jej ostatnim meczu: nie grają w klubie, nie trenują, opuszczają mecze lipcowe (Superpuchar, eliminacje UEFA, pierwsze kolejki), wracają zmęczeni. Minuty i gole w turnieju liczą się z rozegranych meczów (występy w historii zawodnika, grupa R).
- Turnieje innych konfederacji (Puchar Azji, PNA, Copa América, Złoty Puchar, Puchar Narodów Oceanii): zawodnicy z polskich klubów z krajów uczestników wyjeżdżają 7 dni przed startem i wracają po odpadnięciu reprezentacji, z dodatkowym zmęczeniem jak przy dalekich podróżach.
- Wiadomości: losowania (Liga Narodów, eliminacje, grupy turnieju), awans albo brak awansu Polski, baraże, wyniki meczów Polski, mistrzowie turniejów, powołania na turniej i powroty zawodników.

## 8. Zapis gry

- Szczegóły meczów tylko dla rozgrywek trwających i zakończonych od 1 stycznia poprzedniego roku. Starsze edycje zostają w `game.intlHistory`: `{ year, comp, edition?, host, champion, runnerUp, semis, polandResult, poland: { stage, record, gf, ga } }` (Polska tylko przy Euro, MŚ i Lidze Narodów).
- Mecze silnika w zapisie zwartym (`{ d, h, a, g, r, k, l, f, n, s, x, p }`); eliminacje innych konfederacji tylko jako tabele.
- Po 100 latach (test silnika): stan `game.intl` ok. 80 KB (maksymalnie ok. 85 KB w trakcie), historia ok. 38 KB (250 wpisów). Mecze Ligi Narodów 2026/27 i eliminacji Euro 2028 w `game.national` są usuwane od 2030 roku, zgrupowania starsze niż pół roku też.
- Czas: 100 lat silnika w tle ok. 1 s.

## 9. Stare zapisy

- Zapis bez `game.intl`: przy wczytaniu silnik nadrabia w tle od Jul 1, 2026 do dnia zapisu (bez powołań), z Elo przeliczonym z rozegranych meczów national.js.
- `game.national` z createNational działa dalej; stan powołań (`national.windows`) jest zgodny ze starym formatem.
- Zmiana sezonu (rollover) nie dotyka `game.intl`, `game.intlHistory` ani `game.national`.

## 10. Źródła i ograniczenia

- Daty, gospodarze i formaty znane: `src/data/reprezentacje.json` (meta.zrodla, cyklPrzyszly) i `docs/reprezentacje.md`.
- Nieznane w chwili pisania i przyjęte w grze [SZAC]: szczegóły formatu Ligi Narodów od 2028/29 i eliminacji MŚ 2030, przydział miejsc na MŚ po 2026 (przyjęty jak w 2026), formaty eliminacji innych konfederacji, terminy PNA po 2027 (CAF zapowiadał zmianę cyklu, gra przyjmuje co 4 lata od 2027), Copa América po 2024, Puchar Narodów Oceanii po 2024, gospodarze po 2034.
- Nie ma reprezentacji U21 w turniejach (U21 tylko w powołaniach jak dotąd), Ligi Narodów CONCACAF ani meczów towarzyskich innych drużyn niż Polska.
