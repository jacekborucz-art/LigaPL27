# Analiza pomeczowa sztabu

Projekt zatwierdzony przez właściciela Nov 18, 2026 (research raportów w zawodowej piłce i w grach menedżerskich, burza mózgów: analityk, ekspert piłkarski, trener). Wartości [SZAC] do kalibracji. Wdrożenie: jeden agent (Opus high) po etapie 1 instrukcji indywidualnych (`docs/instrukcje-indywidualne.md`).

## 1. Zakres

- Raport po meczach o punkty i pucharach (liga, Puchar Polski, Superpuchar, UEFA, baraże). Sparing: bez raportu.
- Poczta zaraz po meczu, pełny raport z poczty i z przycisku „Analizy meczów” w panelu taktyki (Skład i taktyka), archiwum ok. 40 ostatnich raportów.
- Raport opiera się tylko na danych widocznych w meczu (wynik, zdarzenia z minutami, statystyki, oceny, formacja i zmiany). Nigdy nie zdradza ukrytej jakości wykonania instrukcji indywidualnych ani ukrytych atrybutów (`Z`, `hidden`).
- Trafność rad analityka jest ukryta (decyzja właściciela): bez licznika trafień, gracz ocenia sztab z treści raportów.

## 2. Kto pisze

- Analityk (rola `analityk`, `staffQ`; atrybuty `DAN` dane i `WID` wideo jak w `src/career/teamReport.js`): liczby, xG, stałe fragmenty, fazy.
- Asystent: wnioski taktyczne, zawodnicy, ton.
- Bez analityka: całość pisze asystent, liczby z karą ok. -3 do jakości, krótsza sekcja „do poprawy”.
- Trener bramkarzy (jeśli jest): zdanie o bramkarzu.

## 3. Poczta (krótko)

- Od analityka (albo asystenta), temat: wynik i główny wniosek. Priorytet ważny.
- 3 punkty: (a) dlaczego taki wynik, jedna przyczyna z liczbą; (b) co poprawić przed następnym meczem, jedna rekomendacja; (c) zawodnik do uwagi (zawiódł albo zaskoczył).
- Przyciski (tylko podpowiadają, nic nie zmieniają): „Zmień taktykę”, „Ustaw trening”, „Porozmawiaj” albo „Karta zawodnika”, „Pełny raport”.

## 4. Pełny raport (sekcje)

1. Podsumowanie: wynik, xG obu stron, werdykt „zasłużone / szczęśliwe / niezasłużone / wyrównany mecz”.
2. Kluczowe momenty z minutami (gole, czerwone kartki, zmiany, urazy, VAR) i xG co 15 minut (z `events`: strzały mają `min` i `xg`).
3. Statystyki względem rywala i średniej z 5 ostatnich meczów i sezonu (porównanie z formą od 3 meczów).
4. Dobrze / źle / do poprawy: każde zdanie z liczbą z meczu, pozycje według siły sygnału, najwyżej `items(q)` w sekcji.
5. Zawodnicy: 2 najlepsi i 1-2 najsłabsi według oceny, z powodem (kluczowe podania, odbiory, celne strzały, kartka).
6. Wnioski na trening: 1-3 rekomendacje z przyciskiem.
- Kontekst zmienia ton: derby (charakter, emocje), puchar (rotacja, jeden mecz), walka o utrzymanie (punkty, wsparcie), po czerwonej kartce ocena przed i po, wynik niereprezentatywny.
- Posiadanie piłki w połowach: brak w v1 (wymaga zmiany `result()` w silniku).

## 5. Reguły (progi [SZAC])

Dobrze: przewaga xG >= +0,5 i >= 1,3 raza; celne >= 40 % przy >= 5 strzałach; posiadanie >= 58 % przy celności podań >= 85 %; czyste konto przy xG rywala >= 1,0 (bramkarz: obrony >= 4); gol po stałym fragmencie przy >= 5 rożnych; zmiennik z golem albo asystą.

Źle: >= 10 strzałów i celne < 25 % albo gole < xG - 1,0; xG rywala >= 1,5 i większe od naszego; stracony gol przy xG rywala < 0,5; faule >= 16 albo >= 3 żółte; spalone >= 4; czerwona kartka; przewaga rywala w ostatnich 30 minutach; posiadanie >= 55 % przy < 6 strzałach; celność podań < 75 %.

Do poprawy (każde „źle” daje temat): wykończenie; ustawienie linii albo pressing; stałe fragmenty (>= 5 rożnych, 0 goli); kondycja (`cond` < 55 u grających >= 70 min): rotacja albo trening fizyczny. Wnioski o stylu gry tylko, gdy >= 3 ostatnie mecze potwierdzają trend.

Następne kroki (1-2, powiązane z faktem z meczu): trening (stałe fragmenty, wykończenie, kondycja), taktyka (linia obrony, szerokość, plan na wynik), rozmowa (3 słabe oceny z rzędu, dyscyplina), kadra (odpoczynek, szansa dla zmiennika).

## 6. Jakość sztabu a błędy (model jak `src/career/assistantReport.js`)

- Liczby: q >= 14 dokładne; 8-13 zaokrąglone („ok. 12 strzałów”); poniżej 8 słowa („mało groźnych sytuacji”). Szum xG z `estimateSd(q)`.
- Pominięcie sprawy: szansa zauważenia `detectChance(q)` (q 5: ok. 60 %, q 15: ok. 90 %), sprawy poważne (czerwona, >= 3 stracone gole) +0,25.
- Zły akcent: z prawdopodobieństwem (20 - q) / 60 na górę trafia sprawa drugorzędna (główna zostaje niżej).
- Zbyt pewne twierdzenie: q < 8 i |różnica xG| < 0,4: 15 % szans na błędny werdykt; q >= 14 pisze „mecz wyrównany”.
- Słaby analityk: ogólniki, 1-2 punkty zamiast 3, czasem ocena po wyniku zamiast po xG, przesadne wnioski po jednym meczu. Błędy wiarygodne, nie absurdalne.
- Deterministycznie z ziarna (id meczu): ponowne otwarcie daje ten sam tekst. Warianty zdań losowane z ziarna (bez powtarzalności).

## 7. Zapis

- Archiwum: `{ id, date, comp, opp, home, score, ht, xg, sh, sot, poss, form, items: [{ t: 'good'|'bad'|'fix', code, vals }], players: [{ id, r }], rec: [code], seed }`, ok. 0,5-1 KB na mecz, ok. 40 ostatnich.
- Tekst generowany przy otwarciu z kodów i liczb (wersjonowane szablony, poprawki działają wstecz). Bez zapisu jakości sztabu.
- Widok archiwum: lista (data, rywal, wynik), widok ostatnich 5 meczów z trendami i alertem „ten problem wraca”, przed rewanżem poprzedni raport o rywalu na górze.
