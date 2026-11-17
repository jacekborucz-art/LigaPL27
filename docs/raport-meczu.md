# Raport meczu po kliknięciu wyniku

Wdrożone Nov 17, 2026 (v1.16 Beta). Zadanie z `docs/kolejka.md` (rozdz. 1, dodane Nov 17, 2026).

## Co widzi gracz

Kliknięcie wyniku otwiera okno „Raport meczu”:
- Rozgrywki > Terminarz (ligi, III liga, baraże), Puchar Polski, kolejka obok tabeli,
  puchary europejskie (Mecze, Tabela), Superpuchar Europy;
- Pulpit: panel Terminarz oraz ekran „Terminarz i wyniki” (także sezony z historii).

W oknie:
- rozgrywki i runda, drużyny z herbami, wynik, „po dogrywce”, „karne x:y”;
- data i godzina, stadion (jak w informacjach przed meczem), widzowie, sędzia;
- przebieg meczu: gole z minutą, strzelcem i asystą (rzut karny, samobój), stan meczu po golu,
  żółte i czerwone kartki (druga żółta i czerwona w tej samej minucie), kontuzje (poważne wyróżnione,
  informacja „zszedł z boiska” albo „grał dalej”);
- tylko mecze gracza (pełny silnik): zmiany, VAR (gol nieuznany, kartka zmieniona, rzut karny po analizie),
  niewykorzystane rzuty karne, kartki na ławce;
- dogrywka (91-120 min) osobno, seria rzutów karnych osobno (w meczach gracza każdy strzał);
- statystyki: strzały, celne, posiadanie, xG;
- oceny zawodników obu drużyn, zwijane (wejścia z ławki oznaczone, najlepsza ocena wyróżniona).

Telefon: przebieg w jednej kolumnie z małym herbem drużyny. PC: gospodarze po lewej, goście po prawej.
Zamknięcie: przycisk Zamknij, Escape (nie wychodzi do menu gry) albo dotknięcie tła.

## Dane w zapisie

Pola w `f.result` meczu terminarza (`src/season/matchReport.js`, `packReport`):
- `ev`: zdarzenia `[minuta, kod, strona, zawodnik, ...]`, minuta liczbą, doliczony czas po przecinku
  (45.02 = 45+2', 90.05 = 90+5'); kody: g, p, o, y, r, r2, i, k, s, mp, vg, vc, vp (opis w nagłówku pliku);
- `pl`, `rt`: zawodnicy, którzy zagrali, i ich oceny x10;
- `pk`: seria rzutów karnych (mecze gracza), `fe`: pełny silnik, `ab`: mecz przerwany.

Zawodnik zapisany krótko względem klubu swojej drużyny: `17` = `legia-17`, `"~a3"` = `legia-a3`,
inne id (transfery, pula obcokrajowców, rezerwy) w całości.

Rozmiar: pełny sezon z raportami (2266 meczów: wszystkie ligi i III liga, PP, baraże, UEFA i Superpuchar
z polskimi klubami) dokłada ok. 750 KB do zapisu 12,6 MB (ok. 6 %, 332 B na mecz). Mecze UEFA bez
polskich klubów nie mają raportu (tylko wynik). Raporty żyją tylko w terminarzu bieżącego sezonu:
przy zmianie sezonu terminarz jest zastępowany nowym, a historia drużyny gracza trzyma sam wynik,
więc zapis nie rośnie z sezonu na sezon.

Wydajność: zapis raportu meczu w tle to ok. 21 mikrosekund (ok. 50 ms na cały sezon, poniżej 0,5 % czasu
sezonu w `npm run perf`).

## Mecze w tle: minuty

`quickEvents` losuje minuty przy zapisie wyniku, z osobnego ziarna `raport:${seed}:${f.id}`, więc wynik,
statystyki i skutki meczu są takie same jak przed zmianą. Oś czasu: 1-45, doliczony 1-4 min, 46-90,
doliczony 2-6 min, dogrywka 91-120 (gole dogrywki: koniec listy strzelców, `r.regScore` z `quickKnockout`).

Spójność:
- gole i asysty mają minuty jako pierwsze; zejście z boiska (czerwona kartka, kontuzja bez gry dalej)
  jest najwcześniej w minucie ostatniego gola lub asysty zawodnika, a w tej samej minucie gol jest przed zejściem;
- żółta kartka zawodnika z czerwoną jest wcześniej niż czerwona; żółta zawodnika z kontuzją jest przed zejściem;
- kontuzja zawodnika z czerwoną kartką: przed wykluczeniem, zawodnik grał dalej;
- czy zawodnik zszedł: urazy grywalne z `INJURY_TYPES` (stłuczenie, naciągnięcie, lekkie skręcenie) to „grał dalej”,
  pozostałe to zejście; w meczach w tle nie ma zmian, więc drużyna kończy w osłabieniu (jak w modelu);
- bez VAR, zmian i drugich żółtych (model w tle ich nie ma).

Uwagi do modelu w tle (bez zmian w logice gry, do decyzji właściciela):
- model może dać jednemu zawodnikowi dwie żółte bez czerwonej; gra liczy to jako jedną żółtą (statystyki, pauzy),
  raport też pokazuje jedną; statystyki sędziego liczą wtedy dwie;
- czerwona dla zawodnika z żółtą jest w raporcie czerwoną bezpośrednią po wcześniejszej żółtej (kara 1-3 mecze
  jak dotąd), nie drugą żółtą;
- minuty gry w statystykach zawodnika zostają 90 także po czerwonej i kontuzji (jak dotąd).

## Mecze gracza

`engineEvents` przepisuje dziennik silnika z jego minutami: gole (bez anulowanych przez VAR), kartki
(także na ławce, Law 12), kontuzje, zmiany, VAR i niewykorzystane karne. Oceny po przesunięciu skali
(`fromEngineResult`).

## Widzowie i sędzia

- Widzowie: `f.attendance` z rozliczenia biletów (`matchMoney` w `src/career/careerSystem.js`); zanim mecz
  zostanie rozliczony (dzień po meczu gracza), ten sam wzór liczony na bieżąco (`attendanceFill`
  x `attendanceModifier`, pojemność z planu finansów).
- Sędzia: obsada z puli (`f.ref`, `src/career/referees.js`); w pucharach europejskich i sparingach
  sędzia z ziarna meczu (`matchReferee`, ten sam co w studiu). Stare mecze bez obsady: bez sędziego.

## Stare zapisy i mecze bez szczegółów

- mecz bez `ev` (rozegrany przed tą wersją): wynik, strzelcy z liczbą goli, statystyki;
- mecz UEFA bez polskiego klubu, Superpuchar Europy bez polskiego klubu, sezon z historii: sam wynik;
- zawodnik usunięty ze świata gry: „nieznany zawodnik”; kluby zagraniczne i IV liga: nazwiska z kadry na żądanie.

## Testy

`tests/matchReport.test.mjs`: cały sezon (ponad 2000 meczów w tle, Legia, ziarno 11) z kontrolą wszystkich
warunków spójności; 1800 meczów w tle porównanych ze statystykami zawodników (gole, asysty, kartki, kontuzje),
w tym 300 z dogrywką; 160 meczów pełnego silnika z VAR (zmiany, kartki na ławce, seria karnych); zapis
przez `applyResult`; rozmiar zapisu; widok wszystkich meczów sezonu (bez undefined, NaN, pauzy em);
stary zapis, mecze bez polskiego klubu, historia, zawodnik bez klubu; test samej kontroli spójności.
