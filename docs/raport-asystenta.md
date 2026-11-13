# Raport asystenta: zawodnik na żądanie i okresowy raport o drużynie

Stan na Nov 13, 2026. Zgłoszenie użytkownika: raport asystenta o wybranym zawodniku kadry (prawy przycisk na
zawodniku), obszerny, odsłaniający ukryte cechy, umiejętności i wady; im lepszy asystent, tym dokładniejszy raport.
Do tego okresowy raport o drużynie (atmosfera w szatni, zmiana treningu, odpoczynek, regeneracja) z częstotliwością
wybraną przez trenera.

Panel: asystent trenera z licencją UEFA Pro (Ekstraklasa), analityk danych meczowych, fizjoterapeuta i trener
przygotowania fizycznego, psycholog sportu, programista gry. Kod: `src/career/assistantReport.js` (logika i system
dnia), `src/ui/assistantReportView.js` (widok), `src/ui/playerMenus.js` (pozycja menu), `src/ui/trainingView.js`
(ustawienie w Trening, Sztab), `src/styles/assistant.css`. Testy: `tests/assistantReport.test.mjs`.

Oznaczenia: [SZAC] szacunek projektowy, [SYM] pomiar w tym repozytorium.

## 1. Co powiedziałby każdy ekspert i skąd gra to wie

### Asystent trenera (rola w drużynie, decyzje na tydzień)

| Stwierdzenie w raporcie | Dane w grze |
| --- | --- |
| Rola: podstawowy, zmiennik, poza kadrą meczową, akademia | `game.tactics.xi`, `bench`, `p.squad === 'Y'` |
| Poziom na tle ligi (czołówka, ponad średnią, średni, poniżej) | miejsce OVR wśród zawodników ligi klubu |
| Najlepsze pozycje i ocena na pozycji | `proficiency` (`src/engine/positions.js`), `ovrAt` z profilu pozycji |
| Pozycja do nauczenia | pozycja z biegłością poniżej 70 %, na której `ovrAt` jest prawie równy OVR |
| Rola taktyczna (np. lis pola karnego, cofnięty rozgrywający) | średnia trzech atrybutów wyróżniających rolę |
| Akcent indywidualny | najsłabszy kluczowy atrybut pozycji (profil `OFF`) poniżej średniej ligi |
| Kartki: jedna od pauzy | `p.yc.league`, próg co 4 żółte kartki |
| Kontrakt: przedłużyć czy decyzja niepilna | `p.contract.until`, rola, zapas rozwoju |

### Analityk (mocne i słabe strony, regularność, ważne mecze)

- Mocne i słabe strony: atrybuty zawodnika wobec średniej ligi **na tej samej pozycji**, najpierw kluczowe dla pozycji.
- Regularność: ukryte `KON` (w silniku: rozrzut dyspozycji dnia, `src/engine/match/teams.js`).
- Ważne mecze: ukryte `WAZ` (premia lub kara w meczach o randze 2 i wyżej).
- Forma: trend ocen z wykresu formy (`formHistory`, `formTrend` z `src/ui/formChart.js`).

### Fizjoterapeuta i trener przygotowania fizycznego

| Stwierdzenie | Dane |
| --- | --- |
| Świeżość, dług meczowy, ciężkie nogi | `p.fresh`, `p.matchDebt`, `p.training.legs` |
| Obciążenie ACWR i strefa | `loadSummary`, `acwrLabel` (`src/training/load.js`) |
| Ostrość meczowa | `p.sharp` |
| Odporność na urazy (ocena) | ukryte `ODP`, ocena z błędem zależnym od asystenta i trenera przygotowania fizycznego |
| Ryzyko urazu (niskie, normalne, podwyższone, wysokie) | ten sam model co urazy treningowe: `trainingInjuryChance` z odpornością w ocenie sztabu, wobec typowego zawodnika |
| Program powrotu po kontuzji, powrót niedawno | `p.training.rtp`, `p.training.returnedAt` |
| Historia urazów | dziennik sztabu prowadzony od włączenia raportu (`game.assistantReport.inj`) |

Zasada fizjoterapeuty: spadek świeżości tuż po meczu (dług meczowy) to zwykła regeneracja, nie powód do odpoczynku;
ciężkie nogi po mocnych zajęciach są zaplanowane w mikrocyklu. Odpoczynek zaleca się przy ACWR powyżej 1,5, świeżości
poniżej 60 % albo poniżej 70 % bez niedawnego meczu.

### Psycholog sportu (charakter, nastroje, relacja z trenerem)

| Stwierdzenie | Dane |
| --- | --- |
| Profesjonalizm, temperament | ukryte `PRF`, `TMP` |
| Adaptacja w nowym otoczeniu | pochodna: osobowość, przywiązanie do domu, lęk przed niepewnością, wiek (te same czynniki co `acclimPlan`) |
| Wyraźne cechy charakteru (ambicja, ego, cierpliwość, potrzeba gry, lojalność, chciwość) | `p.traits` (`src/career/personality.js`), w ocenie asystenta |
| Relacja z trenerem | `p.relations[klub].trust` w ocenie asystenta, tylko słowami |
| Potrzeba uwagi, ostatnia rozmowa | `attentionNeed`, `daysSinceAttention` (`src/career/attention.js`) |
| Minuty a oczekiwania | udział w minutach drużyny, ocena potrzeby gry, osobowość Ambitny |
| Nastawienie przy negocjacjach | `computeMindset` liczony z ocenionych (nie prawdziwych) cech |
| Temat rozmowy | `talkSuggestions` (`src/career/teamTalks.js`); wrażliwego asystent nie każe przyciskać (zamiast „wymagaj więcej”: „podbuduj”) |
| Atmosfera: nastroje, niezadowoleni, liderzy, grupy rodaków, autorytet trenera | `teamMorale`, `p.unhappy`, `p.transferRequest`, osobowość Lider, narodowości, `authoritySummary` |

## 2. Model dokładności

Ocena cechy ukrytej `v` to prawdziwa wartość plus deterministyczny szum:

```text
qe = 0,7 x jakość asystenta + 0,3 x jakość specjalisty
sd = (0,3 + 0,16 x (20 - qe)) x (1 + 0,8 x (1 - znajomość)) x trudność cechy
v  = prawda + sd x (0,8 z_stały + 0,6 z_miesiąc)
```

- Specjalista: odporność na urazy, trener przygotowania fizycznego; regularność i ważne mecze, analityk; potencjał
  młodych (do 21 lat), trener młodzieży; potencjał bramkarza, trener bramkarzy; reszta, sam asystent.
- Znajomość: kadra z początku kariery jest znana (1). Nowy zawodnik zaczyna od 0,25 i dochodzi do 1 po 120 dniach.
- Szum: `z_stały` z ziarna (gra, klub, zawodnik, cecha), `z_miesiąc` dodatkowo z miesiącem. Raport nie zmienia się po
  odświeżeniu ani w trakcie miesiąca (znajomość liczona na 1. dzień miesiąca); opinia asystenta jest trwała i zmienia
  się powoli, a z czasem zbliża się do prawdy.
- Trudność: cechy charakteru x1,1; potencjał zawodnika do 21 lat x1,15; nastroje drużyny x0,5.
- Pewność: `sd` do 1,3 wysoka (dokładny), do 2,3 średnia (przybliżony), powyżej niska (ogólny). Przy pełnej znajomości
  progi pokrywają się z `reportPrecision` (`src/training/staff.js`): jakość 14+ dokładny, 8-13 przybliżony.
  Powyżej `sd` 3,0 raport pisze „trudno ocenić”.
- Wyświetlanie: nigdy surowe liczby. Słowa w pięciu progach oceny, przedział „ok. 14-16” tylko przy wysokiej
  pewności (potencjał także przy średniej, wtedy szerzej: ±2). Ogólny raport: same słowa.

Pomiar [SYM] (600 zawodników, cechy KON, WAZ, ODP, PRF, TMP, pełna znajomość, cały sztab tej samej jakości):

| Jakość | Pewność | Średni błąd | Błąd potencjału | Dobry kierunek (cechy wyraźne) | Prawda w przedziale |
| --- | --- | --- | --- | --- | --- |
| 5 | niska | 2,15 | 1,54 | 94 % | brak przedziału |
| 10 | średnia | 1,52 | 1,14 | 98 % | 80 % |
| 14 | wysoka | 1,01 | 0,80 | 100 % | 76 % |
| 18 | wysoka | 0,50 | 0,43 | 100 % | 99 % |

Słaby asystent myli się też w słowach (pięć progów), więc czasem nazwie przeciętnego zawodnika podatnym na urazy
albo przegapi wadę. Nowy zawodnik przy asystencie 12 ma `sd` ok. 2,5 (niska pewność) zamiast 1,6.

## 3. Raport o zawodniku (na żądanie)

Menu zawodnika (prawy przycisk, przytrzymanie palcem, klawisz menu) w każdym widoku z własnymi zawodnikami, także
w akademii: „Raport asystenta”. Raport otwiera się w bieżącej zakładce, „Wróć” wraca na ten sam ekran. Części:
podsumowanie, zalecenia, cechy ukryte, mocne i słabe strony, pozycje i rola, stan obecny, psychika i sytuacja, rozwój,
wskaźnik pewności (wysoka, średnia, niska; nazwisko i ocena asystenta).

**Zalecenia bez sprzeczności.** Każdy zawodnik dostaje dokładnie jedną decyzję o obciążeniu, w kolejności priorytetu:
uraz, odpoczynek, kontrola obciążeń, budowanie ostrości, więcej minut, bez zmian. Przy urazie, odpoczynku i kontroli
obciążeń raport nie proponuje więcej minut, akcentu indywidualnego, programu dla młodych ani nauki pozycji. Rozmowa,
kartki i kontrakt nie zmieniają obciążenia. Zalecenia treningowe mają przycisk (tryb obciążenia, akcent, program,
nauka pozycji); po kliknięciu raport odświeża się i pokazuje „już ustawione”. Rozmowy, która w tym tygodniu już była,
raport nie zaleca.

## 4. Okresowy raport o drużynie (poczta)

Częstotliwość w Trening, Sztab: co tydzień, co 2 tygodnie (domyślnie), co miesiąc, wyłączony. Stan w zapisie
`game.assistantReport = { v, freq, last, sentOn, club, since, inj, prev }`; stary zapis dostaje wartości domyślne
(`ensureAssistantReport`, także w `ensureGameShape`). Zmiana klubu czyści dziennik.

- Termin: tydzień od poniedziałku, raport od wtorku (poniedziałkowe wiadomości innych systemów są już w skrzynce);
  co 2 tygodnie w stałym rytmie od Jun 29, 2026; co miesiąc od pierwszego wtorku miesiąca (po raporcie rozwoju
  z 1. dnia). W dniu meczu raport czeka na kolejny dzień. Między raportami co najmniej 6 dni, także po zmianie
  częstotliwości. Klucz wiadomości `arep:<częstotliwość>:<okres>`, więc w okresie jest najwyżej jeden raport.
- Części: atmosfera w szatni, trening i obciążenia (odpoczynek, kontrola, ostrość, za małe obciążenie, program
  powrotu, jedna rekomendacja dla planu), ryzyko urazów, rozmowy, rozwój młodych i akademii.
- Jakość: szansa zauważenia sprawy 0,45 + 0,03 x jakość (od 0,5 do 1, poważne sprawy +0,25), stała w okresie;
  najwyżej 2 + jakość / 5 pozycji w części; liczby (świeżość, ACWR, ostrość) tylko przy wysokiej pewności; grupy
  rodaków od jakości 10.
- Rekomendacja planu drużyny jest jedna: niższy poziom obciążeń tylko gdy zmęczonych jest co najmniej 4 i 20 % kadry
  (bez zawodników w programie powrotu), inaczej zmiana akcentu przy znużeniu, akcent taktyczny przy słabym zgraniu.
  Przy zmęczeniu raport nigdy nie proponuje akcentu fizycznego.

### Istniejące wiadomości asystenta i sztabu: odwołania zamiast powtórek

| Wiadomość (klucz) | W raporcie okresowym |
| --- | --- |
| Przeciążeni zawodnicy, trener przygotowania fizycznego (`acwr:`) | zawodnicy wymienieni w ostatnich 7 dniach nie wracają na listy odpoczynku i ryzyka; jedno zdanie z datą |
| Przypomnienie o rozmowie (`uwaga:`, `p.att.h`) | zawodnicy przypomniani w ostatnich 7 dniach pominięci na liście rozmów; zdanie „pisałem w tym tygodniu osobno” |
| Znużenie treningiem (`nuda:`) | przy trwającym znużeniu tylko odwołanie z datą i propozycja akcentu |
| Autorytet trenera (`autorytet-`) | stan autorytetu słowem, przy wiadomości z 14 dni odwołanie z datą |
| Raport rozwoju (`devrep:`) | bez list „rosną, spadają”; odwołanie do raportu z datą; w raporcie o zawodniku jego wiersz |
| Raport medyczny po meczu, uraz na treningu, powrót (`studio:`, `trinj:`, `back:`) | raport nie ogłasza urazów; pokazuje prognozę ryzyka i program powrotu |
| Zapowiedź meczu, aklimatyzacja, nowa pozycja | bez zmian, raport ich nie powtarza |

## 5. Kluby AI

System działa tylko dla klubu gracza i niczego nie zapisuje poza `game.assistantReport`. Nie zużywa strumieni losowości
silnika ani treningu (własne ziarna), więc wyniki klubów AI i balans gry są takie same jak przed zmianą.
