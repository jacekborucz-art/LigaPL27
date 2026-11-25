# Raport obserwatora

Zlecenie obserwacji zawodnika innej drużyny i raport z wykresami (projekt: ekspert skautingu, teksty: redaktor,
wygląd: grafik, Nov 24, 2026). Kod: `src/career/observerReport.js` (logika, stała `OBS`), `src/ui/observerView.js`
(widoki), `src/styles/observer.css`. Test: `tests/observerReport.test.mjs`. Wszystkie liczby [SZAC].

## 1. Gdzie w grze

- Menu pod prawym przyciskiem (przytrzymanie palcem) na zawodniku innej drużyny: „Raport obserwatora…”. Gdy jest
  raport: „Pokaż raport” (podpowiedź „Raport z {data}”, po 60 dniach „, nieaktualny”) i „Nowa obserwacja…”.
  W toku: podpowiedź ze stanem („obejrzano 2 z 3 meczów”, „czeka na pierwszy mecz”, „wstrzymano na czas kontuzji”).
- Menu działa w Transferach, Pulpicie, Kadrze, Treningu i w widoku klubu z tabeli (Rozgrywki), w profilu zawodnika
  innej drużyny oraz na raporcie (widok menu `club` w `playerMenus.js`, `menuView` w `app.js`). W raporcie meczu
  (okno z wynikiem) nazwiska nie mają menu (pominięte: okno modalne).
- Okno zlecenia: tryb, liczba meczów albo tygodni, kto pojedzie (lista skautów, zajęci wyłączeni z powodem, asystent),
  koszt, termin, ostrzeżenia i błędy. Zlecenie w toku: oś czasu meczów i „Odwołaj obserwację”.
- Stan obserwacji i ostatni raport: karta zawodnika w Transferach i profil zawodnika innej drużyny (`observeStatusHtml`).
- Lista „Obserwacje” na górze zakładki Transfery, Skauting (w toku i ostatnie raporty z rekomendacją).
- List w Poczcie po zakończeniu („Raport obserwatora: {imię} {nazwisko}”, rekomendacja), przycisk „Otwórz raport”.
- Zawodnik bez klubu i bez kontraktu: zlecenie i raport działają (bez ceny, tylko pensja).

## 2. Kto obserwuje

- Skaut klubu (`scoutOps.js`, atrybuty DOS, OCE, RYN, SIE, CHA na skali 1-12, efekty przez `staffEff` na skali 1-20).
  Domyślnie wolny skaut z najlepszą dokładnością dla zawodnika; kandydat z wyjazdu skauta: ten sam skaut pogłębia raport.
- Skaut na wyjeździe za granicą (misja) jest niedostępny. Sloty: 2 obserwacje naraz, przy doświadczeniu (DOS) od 16
  na skali efektów: 3.
- Brak wolnego skauta: obserwuje asystent trenera (jedna obserwacja naraz), dokładność x0,75, bez opisu charakteru.
- Rola u nas: asystent; liczby: analityk (DAN); rynek i rekomendacja: dyrektor sportowy (`director.js`). Bez dyrektora:
  cena w przedziale ±35 % i bez oceny szansy na przejście.

## 3. Dokładność (nigdy nie pokazywana)

- A = (0,45 OCE + 0,30 R + 0,15 DOS + 0,10 DAN) / 20, od 0,05 do 0,95.
  - OCE: skaut; bramkarz: OCE trenera bramkarzy; do 21 lat: średnia z OCE i TAL trenera młodzieży.
  - R: polski klub 15 (znajomość ligi); zagranica: R ze `scoutIndex` dla regionu kraju klubu; asystent za granicą 5.
  - DOS: skaut (asystent: jego OCE). DAN: analityk klubu.
  - Niższa liga niż klub gracza: OCE -0,5 za każdy poziom.
  - Asystent zamiast skauta: A x0,75.
- Błąd atrybutu: sd = 4,5 (1 - A) + 0,7 (skala 1-20). Wspólny błąd raportu b ~ N(0; 1,0 (1 - A)): jedno losowanie na
  raport, więc słaby obserwator konsekwentnie przecenia albo nie docenia całego zawodnika (także werdykt i rekomendację).
- Liczba obserwacji: sd x 1 / pierwiastek(mecze), najmniej 0,45; okres 2/3/4/5/6 tygodni: 0,85/0,70/0,55/0,50/0,45.
- Zakres cechy: estymata ±1 sd, zaokrąglony, 1-20, co najmniej 2 punkty szerokości. Prawda wypada poza zakres w ok.
  10-25 % przypadków (pomiar: skaut 12/12 po 1 meczu 80 % trafień, szerokość 3; po 5 meczach 90 %, 1,4; skaut 4/12
  po 1 meczu 76 %, 5,7; asystent 78 %, 5,4).
- Ujawnione cechy: 4 (A do 0,35) do 10 (A od 0,85), najważniejsze na pozycji; reszta „brak danych”.
- Charakter: tylko skaut, po 3+ meczach albo okresie 4+ tygodni i ocenie charakteru (CHA) od 8 (skala efektów);
  osobowość z `p.persona` i ukrytych cech (PRF, TMP, KON, WAZ) z błędem z CHA.
- Ziarno: gra, zlecenie, zawodnik (raport deterministyczny, warianty zdań też).

## 4. Tryby i mecze

- Jeden mecz (raport zwykle 2-3 dni), kilka meczów (2-5, jeden na mecz zawodnika), okres (2-6 tygodni).
- Polski klub: mecze o stawkę z terminarza (`game.fixtures`), ocena, gole i asysty z `p.fh`, minuty z przyrostu
  `p.season.min`. Mecz rozegrany przez klub, w którym zawodnik nie zagrał: kontuzja (`injuryDays`), pauza za kartki
  albo ławka bez minut; nie zwiększa licznika. Po 3 ławkach raport pisze „nie ma regularnej gry”.
- Zawodnik bez polskiego klubu (zagranica, wolny): tylko obserwacja przez okres 2-6 tygodni (`periodOnly`, Nov 25, 2026).
  Ligi zagraniczne i wolni nie mają w grze meczów, więc raport nie pokazuje meczów, ocen, goli ani osi czasu; forma to jedno
  zdanie, a cechy, zdrowie, charakter i rynek liczą się jak zwykle.
- Zlecenie wygasa po 60 dniach: z obejrzanymi meczami powstaje raport, bez nich list „Obserwacja bez raportu”.
  Zawodnik przechodzi do klubu gracza albo znika: zlecenie się kończy.
- Koszt: w Polsce 0 zł; za granicą 3 000 zł za mecz (płatne przy każdym wyjeździe na mecz, także gdy siedział na
  ławce) albo 8 000 zł za tydzień okresu (płatne z góry). Finanse: kategoria „Skauci: wyprawy i prowizje” (`scouts`).

## 5. Raport

Sekcje (kolejność jak w makiecie grafika): nagłówek (autorzy, data, obejrzane mecze, rozgrywki, okres, ważność
w 5 kreskach), profil (wiek, pozycje, noga, narodowość, klub, kontrakt; wzrostu i wagi gra nie ma), mocne i słabe
strony (słowa, wykres wycinków w 6 grupach, paski przedziałów cech), forma (słupki ocen, mecze pominięte zakreskowane,
linia średniej naszego najlepszego, oś czasu zlecenia), zdrowie, mentalność i osobowość, rola u nas (paski z rombem:
nasza dokładna wartość i przedział obserwowanego; werdykt w 4 kafelkach), potencjał (młodsi z przedziałem), rynek
(umowa, wypożyczenie i opcja wykupu, szansa na przejście, paski ceny i pensji), rekomendacja (tablica jak na stadionie:
bierzemy, obserwować dalej, odpuścić), przyciski „Złóż ofertę” (karta transferowa z polem kwoty) i „Nowa obserwacja”,
poprzednie raporty.

- Werdykt (z wartości widzianych): OVR widziany = `ovrAt` estymat na pozycji zawodnika; nasz najlepszy: kadra gracza,
  biegłość na pozycji od 85 %. Różnica od +0,5: wzmocnienie; od -1 (albo nie gorszy od naszego drugiego): zmiennik;
  do 21 lat z potencjałem do poziomu naszego najlepszego: do rozwoju; inaczej: nie. Brak nikogo na pozycji: wzmocnienie.
- Rekomendacja: odmowa zawodnika albo kontuzja ponad 60 dni: odpuścić; werdykt „nie”: odpuścić; po 1 meczu: obserwować
  dalej; wzmocnienie: bierzemy (za drogo albo klub nie sprzedaje: odpuścić); zmiennik: bierzemy, gdy tani (do 30 %
  środków) i do 30 lat, inaczej obserwować dalej; do rozwoju: bierzemy, gdy tani.
- Rynek: cena wywoławcza klubu (`askingPrice`, za granicą `foreignAskingPrice`); z dyrektorem przedział ±(6-25 %) wg
  znajomości rynku (`hintHalfWidth`) i środek z błędem; lista transferowa ±10 %; bez dyrektora ±35 %. Pensja: obecna x1,1.
  Szansa na przejście z `playerWillingness` (chętny, do przekonania, raczej nie, odmowa), z błędem o jeden stopień
  z szansą 0,5 (1 - RYN / 20).
- Aklimatyzacja (`wishMemory.inAcclim`): zaznaczona w charakterze, nie obniża ocen.
- Ważność 60 dni, potem „nieaktualny” (szary); nowe raporty nie nadpisują starych (do 6 na zawodnika, 40 zawodników).

## 6. Kluby AI (parytet)

- `aiSeenOvr` (`transfers.js` aiBuy): kluby AI wybierają kandydata z OVR widzianym = OVR + N(0; 1,0 (1 - A)) +
  N(0; sd x 0,55 / pierwiastek(ujawnione cechy)); A z widoku sztabu klubu (skaut OCE, DOS, SIE, analityk DAN),
  polski klub R = 15, zagranica R = 0,65 SIE, kara niższej ligi. Ziarno: gra, klub, zawodnik, sezon. Filtry (próg
  jakości) dalej na prawdziwym OVR, zmienia się tylko kolejność kandydatów.
- Wyłącznik: `OBS.ai.on = false`.

## 7. Dane w zapisie

`game.observe = { v: 1, seq, orders, reports }` (stary zapis: tworzone przy pierwszym zleceniu).
- Zlecenie: `{ id, pid, club, mode ('match' | 'matches' | 'period'), n, weeks, start, end, until, observer: { kind, id,
  name }, kind ('domestic' | 'abroad' | 'free'), cost, games: [{ d, k ('seen' | 'injury' | 'bench' | 'susp'), opp, home,
  comp, r, min, g, a, label }], seen, scanFrom, lastMin, status ('active' | 'done' | 'expired' | 'cancelled'), name,
  deepen }`. Zamknięte: najwyżej 20 ostatnich.
- Raport (`reports[pid]`): `{ id, date, until, mode, n, weeks, start, watched, stage, snap, authors, attrs [{ k, lo, hi }
  albo { k, none }], groups, words, seenOvr, potential, form, health, character, acclim, role, market, rec, recText,
  lines, flags }`: tylko dane widziane (przedziały, słowa), bez dokładności.
- System dnia `observe` (kolejność 52.6, po meczach dnia i skautingu); bez zleceń nic nie robi.

## Menu w oknie raportu meczu i stan w małej karcie (Nov 25, 2026)
- Okno raportu meczu (`ui/matchReportView.js`): oceny i zdarzenia zawodników świata gry mają `data-pid`; menu pod prawym
  przyciskiem otwiera się w oknie (`openMenu` z `container`), wybór pozycji zamyka okno i wykonuje akcję (widok `club`).
- Mała karta zawodnika w okienku (`transferCardHtml`): fakt „Obserwacja” (stan zlecenia) albo „Raport” (data, nieaktualny).
