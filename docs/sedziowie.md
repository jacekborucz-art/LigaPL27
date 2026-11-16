# Sędziowie: pula, obsada meczów, ukryte noty

Stan: Nov 16, 2026. Dotyczy `src/career/referees.js` (pula, obsada, surowość, noty), podpięć w `src/season/season.js` (`playQuick`, `applyResult`), `src/match/matchday.js` (`startMatchday`: sędzia meczu gracza), `src/app.js` (`ensureGameShape`, `newGame`, szybki wynik meczu gracza). Testy: `tests/referees.test.mjs`. Projekt i research: raport panelu sędziowskiego z Nov 16, 2026 (podstawa tego dokumentu), wcześniej `docs/ekspert_sedzia.md`.

Prośba właściciela: każdy mecz w Polsce (liga, Puchar Polski, Superpuchar) ma w tle przypisanego sędziego.

## 1. Decyzje właściciela (Nov 16, 2026)

- Noty obserwatora nie są jawne. Gracz pozna je tylko z przecieków prasy i z rankingu na koniec sezonu (późniejszy etap).
- Gracz może zobaczyć statystyki, etykiety i pełne atrybuty sędziów 1-20 (ekran sędziów w późniejszym etapie).
- Listy sędziów zmieniają się jak w realu: ranking, awanse, spadki, nabór (późniejszy etap).
- Błędy sędziów mogą zmieniać wyniki zależnie od umiejętności (późniejszy etap). Na razie nota nie wpływa na mecz.

## 2. Pula (`game.refs`)

Tworzona przez `ensureReferees(game)` przy nowej grze i dla starych zapisów (deterministycznie z ziarna gry). Nazwiska fikcyjne (`randomName('POL')`), bez nazwisk prawdziwych sędziów (`REAL_REF_SURNAMES`). Usunięta stara lista 15 nazwisk z `matchday.js`.

| Lista | Rozgrywki | Sędziów | Średni atrybut [SZAC] | Wiek na start |
|---|---|---|---|---|
| 1 | Ekstraklasa, Superpuchar, Puchar Polski od ćwierćfinału | 20 | 14 | 31-48 |
| 2 | 1 Liga, baraże 1 Ligi | 22 | 12,5 | 28-47 |
| 3 | 2 Liga, baraże 2 Ligi, finał baraży III ligi | 22 | 11 | 25-44 |
| 4 | III liga (4 grupy), półfinały baraży III ligi | 72 | 9,5 | 23-41 |

Puchar Polski przed ćwierćfinałem: lista według wyższego poziomu uczestników (klub IV ligi jak lista 4).
Województwa rozdzielone równo w każdej liście (na liście 4 każde województwo ma 4 lub 5 sędziów).

Sędzia: `id`, `n` (imię i nazwisko), `w` (województwo), `b` (rok urodzenia), `l` (lista), `a` = atrybuty 1-20 [Trafność decyzji, Ustawianie się, Kondycja, Konsekwencja, Odporność na presję, Prowadzenie meczu, Współpraca z VAR], `e` (doświadczenie 1-20), `s` (surowość, styl: N(1; 0,13) w 0,70-1,40), `car` (mecze w karierze).
Jakość (ukryta): `Q = 0,30 dec + 0,15 pos + 0,10 fit + 0,15 cons + 0,15 pres + 0,10 comm + 0,05 var`. Surowość nie zależy od jakości.

Stan sezonu: `st[id] = [przydzielone, ocenione, suma not x10, żółte, czerwone, poważne błędy]`, `mk[id]` ostatnie 5 not, `busy[id]` dni meczów, `rc[klub]` 4 ostatnich sędziów klubu, `prev` statystyki poprzedniego sezonu (do rankingu). Rozmiar ok. 35 KB po sezonie.

## 3. Obsada

Przy pierwszym meczu kolejki (rundy pucharu) danych rozgrywek obsadzana jest cała kolejka (`assignReferee`), także mecz gracza. Mecze sortowane według rangi: finał PP i Superpuchar 3; półfinał PP, finał baraży, derby (ten sam region), mecz czołówki tabeli 2; ćwierćfinał i 1/8 PP, półfinał baraży, mecz z czołówką, walka o utrzymanie 1.

Kandydat z listy meczu musi spełnić:
1. nie z województwa żadnego z klubów (mapa region -> województwo w `referees.js`, kluby IV ligi: pole `voiv`);
2. nie prowadził żadnego z klubów w ich 4 ostatnich meczach;
3. co najmniej 2 dni od innego meczu tego sędziego, jeden mecz na kolejkę.

Wynik kandydata: `ranga x (jakość na tle listy + forma z ostatnich not) - 0,6 x (mecze ponad średnią listy) + los N(0; 0,6)`. Najlepsi dostają ważne mecze, obciążenie jest równe. Brak kandydata: luzujemy kolejno regułę 2, potem 1, potem sięgamy na listę obok (1 -> 2, 2 -> 3, 3 -> 4, 4 -> 3).

Mecze UEFA: sędzia zagraniczny (nazwisko z innego kraju, poza pulą). Sparing: sędzia z listy 4, bez statystyk i noty.

Pełny sezon (ziarno 7): 2220 polskich meczów, 0 meczów z sędzią z województwa klubu, ok. 1% z listy obok. Mecze na sędziego: lista 1 16-19, lista 2 14-18, lista 3 13-18, lista 4 16-23. Superpuchar i finał PP prowadzą najlepsi z listy 1.

## 4. Surowość dla silnika

`ctx.refStrict = s / średnia surowość listy` (`refStrictFor`), więc średnia każdej listy to dokładnie 1,0. Dotyczy meczów w tle (`playQuick`), meczu gracza w pełnym silniku i szybkiego wyniku. Wcześniej mecze w tle miały `0,85 + U(0; 0,35)`, średnio 1,025.

Kartki (żółte i czerwone) na mecz, `tools/multiseason.mjs widzew 5 2`, przed / po:

| Rozgrywki | Średnia surowość | Kartki na mecz |
|---|---|---|
| Ekstraklasa | 1,033 / 0,998 | 4,73 / 4,70 |
| 1 Liga | 1,029 / 0,996 | 4,74 / 4,44 |
| 2 Liga | 1,026 / 1,002 | 4,61 / 4,51 |
| III liga | 1,024 / 0,997 | 4,65 / 4,46 |
| Puchar Polski | 1,028 / 0,993 | 4,83 / 4,35 |

Oczekiwany spadek ok. 2,5%, reszta różnic to los (inne wyniki meczów po zmianie strumienia losowania; Puchar Polski to tylko 130 meczów).

## 5. Nota obserwatora (ukryta)

Po każdym meczu z polską obsadą (`refereeAfterMatch` w `applyResult`): skala PZPN (8,4 = spełnia oczekiwania). Trudność meczu z rangi (ranga 0: 70/25/5% normalny/dość wymagający/trudny, ranga 2: 20/45/35%). `k = Q + 0,05 (doświadczenie - 10) + 0,25 d (presja - Q) - wymaganie listy (14 / 12,5 / 11 / 9,5)`. Poważne błędy: Poisson `[0,065; 0,12; 0,18][d] x exp(-0,22 k)`, drobne: Poisson `0,5 exp(-0,15 k)` (maks. 3, każdy -0,1). Występ `8,40 + 0,05 k + N(0; 0,10 + 0,012 (20 - konsekwencja))`, sufit 8,6 / 9,2 / 9,6. Jeden poważny błąd: 7,9 albo 7,8; dwa i więcej: 7,4 i niżej. Zakres 6,0-10,0.
Sezon testowy: średnia nota 8,30, poważny błąd w ok. 9% meczów. Nota nie zmienia przebiegu meczu.

## 6. Co widzi gracz

Studio przedmeczowe i prasa: nazwisko sędziego z puli, etykieta łagodny/przeciętny/surowy i oczekiwane kartki z jego surowości. Noty są ukryte.

## 7. Później

Ekran „Sędziowie” (listy, statystyki, atrybuty 1-20), ranking i ruchy list po sezonie (wiek, awanse, spadki, nabór), przecieki prasy o notach, odsunięcia od obsady, błędy sędziów zmieniające wynik zależnie od umiejętności, sędzia FIFA.
