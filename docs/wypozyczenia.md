# Wypożyczenia

Stan: Nov 13, 2026. Dotyczy `src/career/loans.js` (zasady, limity, systemy dnia `loans` i `loanMarket`, decyzje w poczcie), haków w `src/career/transfers.js` (gałąź wypożyczenia w `completeTransfer`, `loanIn`, prawo pierwokupu w `aiBuy` i `answerIncoming`, blokada sprzedaży wypożyczonego), płac w `src/career/finance.js` (`wageBill`), powrotów w `src/season/rollover.js`, widoku `src/ui/loansView.js` (Transfery: karta zawodnika i Kontrakty) i stylów `.ln-` w `src/styles/transfers.css`. Testy: `tests/loans.test.mjs`.

Oznaczenia: **[SZAC]** to szacunek albo założenie balansowe. **[NIEPOTW.]** to informacja, której nie udało się potwierdzić.

## 1. Przepisy

| Temat | Co wiemy | Źródło |
|---|---|---|
| FIFA RSTP (od Jul 1, 2022) | Wypożyczenie trwa co najmniej od jednego okna rejestracyjnego do następnego i najwyżej rok. Zakaz dalszego wypożyczania (sub-loan). Limity liczby wypożyczeń międzynarodowych: od sezonu 2024/25 najwyżej 6 z klubu i 6 do klubu naraz, bez zawodników do 21 lat i wychowanków klubu; najwyżej 3 wypożyczenia między tą samą parą klubów. | https://natlawreview.com/article/low-down-fifa-s-new-player-loan-regulations |
| PZPN (od Jul 1, 2025, uchwała III/42) | Najwyżej 8 zawodników zawodowych wypożyczonych z klubu i 8 do klubu w tym samym czasie, najwyżej 4 do jednego klubu. Zwolnienia dla młodzieżowców jak w FIFA nie potwierdzono [NIEPOTW.]. | https://prawopilkarskie.pl/limity-wypozyczania-zawodnikow-z-i-do-klubow-pilkarskich-nowe-regulacje-pzpn-wchodza-w-zycie-od-1-lipca-2025-roku/ |
| Wcześniejszy powrót | Tylko z klauzulą w umowie albo za porozumieniem; zawodnik wraca i jest rejestrowany w oknie transferowym. | jak wyżej (PZPN) |
| Opcja i obowiązek wykupu | Zapisy umowne między klubami, kwota ustalona przy wypożyczeniu. | jak wyżej (FIFA) |
| Gra przeciwko klubowi macierzystemu | Premier League zakazuje (przepis V7.2). W Polsce nie znaleziono przepisu ligowego. Takie zapisy w umowach się zdarzają, ale są sporne wobec art. 18bis RSTP (wpływ osób trzecich na sprawy sportowe). | badanie przekazane w zleceniu; przepis PL i art. 18bis [NIEPOTW.] w tej sesji |

### Odpowiedzi na pytania właściciela

**Na jakie okresy się wypożycza?** W grze, zgodnie z zasadą FIFA „od okna do okna, najwyżej rok”:

| Rodzaj | Zawarte w oknie | Koniec |
|---|---|---|
| Runda | letnim | dzień przed otwarciem zimowego okna (zawodnik wraca i może być zgłoszony zimą) |
| Runda | zimowym | 30 czerwca |
| Sezon | letnim | 30 czerwca |
| Rok | zimowym | dzień przed kolejnym zimowym oknem (52 tygodnie później) [SZAC] |

Wypożyczenie nie może trwać dłużej niż kontrakt zawodnika z klubem macierzystym.

**Czy wypożyczony może grać przeciwko klubowi macierzystemu w Polsce?** Tak. Przepisy PZPN i regulamin Ekstraklasy tego nie zabraniają (inaczej niż Premier League). Kluby czasem wpisują taki zakaz do umowy, ale jego ważność jest sporna. W grze: domyślnie może grać; opcjonalny zapis „zakaz gry przeciwko klubowi macierzystemu” obniża część pensji płaconą przez wypożyczającego o ok. 10 pkt [SZAC]. W dniu meczu z klubem macierzystym zawodnik jest niedostępny (`p.loanBlock`, `isAvailable` w `src/career/squad.js`): kluby AI go nie wystawiają, a w składzie gracza ma oznaczenie „mecz z klubem macierzystym” i asystent zastępuje go przed meczem.

**Opcja, obowiązek czy pierwokup?**

- **Opcja wykupu**: prawo klubu wypożyczającego do kupna za kwotę ustaloną przy wypożyczeniu. Decyzja w ostatnich 30 dniach; transfer w dniu końca wypożyczenia.
- **Obowiązek wykupu**: transfer następuje sam w dniu końca wypożyczenia, jeśli warunek jest spełniony (domyślnie 15 występów przy sezonie i roku, 8 przy rundzie, albo utrzymanie w lidze). Warunki osobiste (kontrakt po wykupie) ustalone od razu.
- **Prawo pierwokupu**: gdy klub macierzysty przyjmie ofertę trzeciego klubu (w trakcie wypożyczenia albo do 30 dni po nim), wypożyczający może ją wyrównać w ciągu 3 dni. W polskiej praktyce słowo „pierwokup” często oznacza po prostu opcję wykupu, dlatego gra ma oba zapisy osobno i wyjaśnia je w formularzu („Co oznaczają warunki”).

## 2. Model w grze

### 2.1 Rekord

Wypożyczony zawodnik jest w kadrze klubu wypożyczającego (`p.clubId`), kontrakt zostaje w klubie macierzystym. Klub macierzysty ma listę `world.clubs[id].loaned`. Rekord:

```js
p.loan = { from, start, until, type, share, fee, wage, option: { fee } | null, obligation: { fee, apps, stayUp, contract } | null,
  firstRefusal, recall, noParent, promise, minutes, apps, games, seen, tier, checked, breach, decided, exercised }
```

`wage` to pełna pensja z kontraktu, `p.contract.wage` w czasie wypożyczenia to część wypożyczającego. `isLoanedOut(p, clubId)` zastępuje martwe pole `p.onLoanOut`.

### 2.2 Pieniądze

- Pensja: wypożyczający płaci `share` %, klub macierzysty resztę co tydzień (`wageBill` dolicza `loan.wage - contract.wage` zawodników z listy `loaned`). Razem zawsze pełna pensja, bez podwójnego liczenia. Wcześniej klub macierzysty nie płacił nic, co dawało darmowe pozbycie się pensji.
- Opłata za wypożyczenie: do 21 lat zero, później 10 % wartości za sezon (kluby AI 5-15 %), runda połowa [SZAC]. Księgowana jako „Wypożyczenia” (`loans`).
- Odwołanie: zwrot opłaty za niewykorzystany czas i 5 % wartości zawodnika [SZAC].

### 2.3 Limity

- 8 z klubu i 8 do klubu naraz (bez zawodników do 21 lat i wychowanków: pierwszy okres w historii klubowej to klub macierzysty) [SZAC: zwolnienie jak w FIFA].
- Najwyżej 4 z jednego klubu do drugiego (liczą się wszyscy).
- Zakaz dalszego wypożyczania; klub wypożyczający nie wystawia i nie sprzedaje wypożyczonego; klub macierzysty sprzeda go dopiero po powrocie (albo wypożyczającemu przez opcję, obowiązek, pierwokup).
- Wypożyczeni do klubu liczą się do limitu kadry wypożyczającego (`docs/limit-kadry.md`).

### 2.4 Obietnica minut

Domyślnie 50 % minut zespołu (kluby AI między sobą 40 %) [SZAC]. Po 8 meczach klubu wypożyczającego: jeśli udział minut jest niższy niż obietnica minus 0,15, klub macierzysty może przerwać wypożyczenie bez kosztów. Gracz dostaje list z „Przerwij wypożyczenie”; klub AI przerywa wypożyczenie zawodnika do 23 lat [SZAC]. Poza oknem powrót następuje dzień przed najbliższym oknem.

### 2.5 Wykup i pierwokup

- Klub AI korzysta z opcji (i wyrównuje ofertę przy pierwokupie), gdy OVR zawodnika jest co najmniej medianą jego grupy pozycji w kadrze, kwota mieści się w budżecie transferowym i w progach zarządu (`boardCaps`, `feeIssues`), a zawodnik zgadza się na kontrakt (`aiNegotiate`).
- Gracz: list „Opcja wykupu” na 30 dni przed końcem (przycisk „Wykup za …” także w Kontraktach); kontrakt dobiera się automatycznie w budżecie płac [SZAC].
- Pierwokup gracza: list z „Wyrównaj ofertę”; po 3 dniach bez decyzji zawodnik przechodzi do klubu, który złożył ofertę.

### 2.6 Rynek

- Kluby AI w każdym tygodniu okna: klub z potrzebą na pozycji (grupa poniżej celu albo kandydat co najmniej na poziomie mediany grupy; Ekstraklasa do 1,2 poniżej mediany) z szansą 0,3 bierze zawodnika z listy do wypożyczenia albo młodego rezerwowego z wyżej notowanego klubu. Dodatkowo klub Ekstraklasy albo 1 Ligi z szansą 0,2 szuka gry dla młodego rezerwowego w niższej lidze [SZAC]. Część pensji: niższa liga 100 %, ta sama 50-75 %; gdy nie mieści się w budżecie płac, klub macierzysty dopłaca (wypożyczający najmniej 25 %) [SZAC]. Około 15 % umów ma opcję, 5 % obowiązek wykupu.
- Gracz wypożycza do klubu: karta zawodnika na Rynku, sekcja „Wypożyczenie” (rodzaj, część pensji, opcja, obowiązek z warunkiem, pierwokup, odwołanie, zakaz gry). Klub AI zgadza się na młodych (do 21 lat, poza trójką najlepszych) i zawodników z listy do wypożyczenia; minimum pensji 75 % (z listy 50 %), z zakazem gry o 10 pkt mniej, z odwołaniem o 5 mniej, z pierwokupem o 5 więcej; opcja co najmniej za cenę wywoławczą, obowiązek za 90 % ceny.
- Gracz wypożycza z klubu: panel „Wypożycz” na karcie własnego zawodnika. Po 1-3 dniach przychodzi 1-3 propozycji (`Rng('wyp-oferty:ziarno:id:tydzień')`) od klubów z tej samej albo niższej ligi, którym brakuje zawodnika na tej pozycji; list z przyciskami i lista w Kontraktach. Zgoda zawodnika jak przy transferze, młody rezerwowy +0,3.
- Kluby AI pytają o młodych rezerwowych gracza (szansa 0,05 na zawodnika i tydzień okna) [SZAC].

### 2.7 Powroty

Sprawdzane codziennie (`p.loan.until < data`), koniec sezonu w `rollover.js` (przed rozwiązaniem kadr spadkowiczów do III ligi; wypożyczenia z ich udziałem kończą się wtedy). Historia klubowa zamyka okres z oznaczeniem wypożyczenia. Morale +1, gdy zawodnik grał ponad 60 % minut; −1 i prośba o rozmowę (list), gdy w klubie macierzystym będzie rezerwowym.

### 2.8 Stare zapisy

`ensureLoans` (wywoływane z `ensureCareer`) uzupełnia dawne rekordy (`type: 'sezon'`, `start`, obietnica, liczniki) i odbudowuje listy klubów macierzystych.

## 3. Sprawdzenie wielu sezonów

Skrypt symulacji (3 sezony, gracz w tle, decyzje odrzucane), Nov 13, 2026:

| Ziarno, klub gracza | Sezon | Wypożyczeń w lidze | Ekstraklasa z klubu (średnio, min-max) | Ekstraklasa do klubu (średnio, min-max) |
|---|---|---|---|---|
| 5, Widzew | 2026/27 | 102 | 3,7 (0-8) | 1,6 (0-4) |
| 5, Widzew | 2027/28 | 88 | 3,2 (0-10) | 0,9 (0-3) |
| 5, Widzew | 2028/29 | 99 | 3,7 (1-7) | 1,0 (0-4) |
| 11, Legia | 2026/27 | 100 | 3,7 (0-8) | 1,4 (0-3) |
| 11, Legia | 2027/28 | 91 | 2,8 (0-5) | 0,7 (0-3) |
| 11, Legia | 2028/29 | 96 | 2,9 (0-9) | 0,6 (0-2) |

Ziarno 5: 213 powrotów (34 przed terminem, głównie przerwane po niedotrzymanej obietnicy minut), 9 wykupów, 52 umowy z opcją i 13 z obowiązkiem wykupu. Wszystkie wypożyczenia kończą się powrotem albo wykupem (żadne nie trwa po terminie, brak rekordów bez klubu), żaden klub nie ma ujemnego salda. Cel „3-5 z klubu” jest osiągnięty, „1-2 do klubu” na dolnej granicy: kluby Ekstraklasy biorą głównie z silniejszych klubów ligi, a tych zawodników jest mało [SZAC do strojenia].
