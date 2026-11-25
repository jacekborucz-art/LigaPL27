# Kapitan drużyny

Stan na Nov 25, 2026 (v1.24 Beta). Projekt: psycholog sportu i trener UEFA Pro (zatwierdzony przez właściciela),
wdrożenie i kalibracja: Nov 25, 2026. Wszystkie liczby [SZAC]. Te same zasady dla gracza i klubów AI.

Kod: `src/engine/captain.js` (`CAPTAIN`, `captainBase`, `captainMind`, `captainEffect`, `captainPower`, `baseStakes`),
silnik meczu `src/engine/match/teams.js` (`updateCaptain`, pola drużyny `capId`, `capX`, `capE`, `capES`, `capOff`,
`capGoal`, `capS0`; zawodnik `capC`, `capE`) i `src/engine/match/core.js`, poza meczem `src/career/captaincy.js`
(`CAPT`, `clubCaptain`, `clubCaptainE`, `captainWeek`, `noteCaptain`, `withClubCaptain`, `fixtureStakes`, `rivalMatch`,
`captainInfo`), morale `src/career/morale.js` (`CAPTAIN_MORALE`), mecze w tle `src/season/season.js` (`playQuick`, `QS.CAP`).
Test: `tests/captain.test.mjs`.

## Siła kapitana

- Siła B (0-1): 0,35 LID + 0,15 OPA + 0,15 profesjonalizm + 0,10 regularność (KON) + 0,10 doświadczenie + 0,15 osobowość
  Lider (atrybuty i cechy dzielone przez 20; doświadczenie: 21 lat = 0, 30 lat i więcej = 1).
- Forma psychiczna M (0,3-1,1): morale m daje 0,5 + 0,05 (m - 6) w granicach 0,5-1,1 (morale 12: 0,8; 18: 1,1); złamana
  obietnica roli w ostatnich 14 dniach -0,15 (`contract.promise.brokenAt`); chęć odejścia (prośba, agent) -0,25;
  niezadowolenie -0,15; forma z 5 ostatnich ocen +-0,1 (0,05 x (średnia - 6,6)).
- C = B x M, kapitan poniżej 21 lat: C x 0,75 (brak autorytetu).
- Efekt E (-0,5..1): przy M < 0,6 (morale poniżej ok. 8 albo chęć odejścia) ujemny, -0,5 x (0,6 - M) / 0,3; inaczej
  (C - 0,25) / 0,75, najmniej 0. Średnie E kapitanów w nowym świecie: Ekstraklasa 0,35, 1 Liga 0,35, 2 Liga 0,27.

## Kto nosi opaskę

- Gracz: wybór w składzie (lista „Kapitan” albo menu zawodnika). Ten wybór to kapitan klubu (`game.captainLog`).
  Gdy kapitan nie gra (uraz, pauza, ławka), asystent daje opaskę na mecz zastępcy, a wybrany kapitan wraca z opaską,
  gdy znów jest w jedenastce (`withClubCaptain` w składzie meczowym).
- Kluby AI: najwyższe C wśród 16 podstawowych zawodników (najwięcej minut); zmiana dopiero, gdy obecny kapitan ma C poniżej
  0,85 najlepszego. Asystent (składy AI i braki w składzie gracza) wybiera kapitana jedenastki z najwyższym C (`autoRoles`).
- Stare zapisy: brak wpisu = kapitan z taktyki od pierwszego poniedziałku, bez kary.

## W meczu (pełny silnik)

- Stawka S: derby 1,0; rywal (lista rywalizacji, klasyk) 0,8; ranga 3 0,9; ranga 2 0,7; puchar 0,7; końcówka od 75. min przy
  różnicy najwyżej 1 gola 0,6; inaczej 0,15. Efekty z punktu niżej działają przy S >= 0,5 (`capES` = E x S, inaczej 0).
- Przy stawce: faule drużyny x(1 - 0,10 E S) (także faule taktyczne i karne), kartka za faul x(1 - 0,05 E S), żółte bez faulu
  x(1 - 0,10 E S), straty przy podaniu i błędy obrony x(1 - 0,06 E S), posiadanie: logit + 0,03 x (E S gospodarzy - E S gości),
  nerwy przed meczem (ujemne zaangażowanie z odprawy) x(1 - 0,5 E S). Kapitan w kryzysie (E < 0) działa odwrotnie.
- Po straconym golu: spadek zaangażowania x(1 - 0,25 E) (E < 0: do +15 %), przez 5 min szybszy powrót ujemnego zaangażowania
  (0,97 - 0,10 E na minutę zamiast 0,97).
- Nasycenie golami (`teamHunger`, docs/balans.md): H + 0,08 E zamiast dawnej premii za LID 15+/18+ najlepszego lidera na boisku
  (bez podwójnego liczenia; średnio +0,028 wobec +0,019 w Ekstraklasie).
- Zejście kapitana (zmiana, kontuzja, czerwona): 2 min bez kapitana (E = 0), potem wicekapitan: najwyższe C na boisku, efekt
  x0,6. Kapitan poza jedenastką od początku: wicekapitan od pierwszej minuty. Czerwona kartka kapitana: zgranie drużyny -5
  (z 100) jednorazowo (projekt: „-0,05 Z”).

## Mecze w tle

- `playQuick`: przy S >= 0,5 średnie goli x exp(+-0,025 x S x (E gospodarzy - E gości)); kapitan, który nie może zagrać,
  zastąpiony najlepszym dostępnym (x0,6).

## Między meczami (morale)

- Porażka: ujemna zmiana x(1 - 0,1 E); seria 3+ porażek -2, przy E >= 0,6: -1,9. Wygrana z rywalem (derby z regionu albo
  rywalizacja z listy): x(1 + 0,15 E). Projekt zakładał 0,2 i -1,5; skalibrowane do celu niżej.
- Dryf tygodniowy ku 12: w górę 0,3 + 0,1 E (E < 0: 0,3 + 0,1 E, najmniej 0,2), w dół 0,3 (E < 0: 0,4). Zastępuje dawny
  dryf 0,5 przy dowolnym liderze w kadrze. Projekt zakładał 0,3 + 0,2 E.
- Uwaga: premia derbowa w `afterMatchDelta` (+-1,5) nie działa, bo terminarz nie ustawia `f.derby` (stan sprzed zmiany, bez zmian).

## Koszt złego wyboru (poniedziałek, `captainWeek`)

- Naturalny lider (najwyższe B wśród podstawowych z osobowością Lider albo LID 15+) bez opaski, gdy kapitan ma B poniżej
  0,8 B lidera: -0,3 morale co tydzień, po 6 tygodniach niezadowolenie (`p.capSnub`, `p.capSnubU`; chętniej rozmawia
  o odejściu, `PM.snubbed` +0,1). Opaska dla lidera albo lepszy kapitan zdejmuje karę i to niezadowolenie.
- Kapitan poniżej 21 lat: C x0,75, zawodnicy 30+ -0,1 morale w pierwszy poniedziałek miesiąca.
- Dwie zmiany opaski z wyboru w odstępie poniżej 6 tygodni: -0,1 morale całej kadry co tydzień przez 6 tygodni od ostatniej
  zmiany. Pierwszy wybór w zapisie i wybór następcy po odejściu kapitana z klubu się nie liczą.

## Komunikaty (bez liczb)

- Raport asystenta o drużynie (Atmosfera w szatni): kapitan w kryzysie („nie radzi sobie z presją ... rozważ zmianę opaski”),
  młody kapitan bez autorytetu, słaby kapitan w derbach i ważnych meczach, dobry kapitan trzyma szatnię w ryzach (asystent 10+),
  pominięty naturalny lider (po 2 tygodniach).
- Podpowiedź asystenta przed meczem o stawkę (ranga 2+, derby, rywal, puchar): „Kapitan spokojny, drużyna w dobrych rękach”
  (E >= 0,6) albo „Opaska u zawodnika w kryzysie” (M < 0,6).
- Linia po straconym golu w raporcie pomeczowym: niewdrożona.

## Pomiar (Nov 25, 2026)

Skrypty: scratchpad `nasycenie/kap_mecz.mjs`, `kap_quick.mjs`, `kap_morale.mjs`, `kap_sat.mjs`.

- Derby (ranga 2), te same ziarna, kapitan gospodarzy E 0,9 wobec 0,2, 4 pary x 6000 meczów: +0,025..+0,040 pkt/mecz
  (średnio +0,033; cel +0,03..+0,06), faule -5,6..-7,4 % (średnio -6,8 %; cel -5..-8 %), kartki -7,2..-11,6 % (średnio
  -9,2 %; cel -6..-10 %).
- Zwykły mecz (ranga 0): -0,016..+0,006 pkt/mecz (szum; cel <= 0,01), faule -0,2..-0,8 %.
- Mecz w tle, ta sama różnica E w derbach: +0,034 pkt/mecz (4 pary x 40000).
- Morale: 4 porażki z rzędu (mecz co tydzień) i 3 tygodnie, E 0,75 wobec 0,15: +1,17 (E 0,7 wobec 0,29: +0,86; E 0,9
  wobec 0,2: +1,32); cel +0,8..+1,2. Przy porażkach faworyta morale spada do 1 w obu wariantach (różnica 0,1-0,2).
- Liga (4000 meczów AI Ekstraklasy): gole 2,634 -> 2,654 na mecz, kartki 3,260 -> 3,256 (szum); gole na 90 min przy
  prowadzeniu +2: 1,31 -> 1,36, +3: 1,35 -> 1,31 (szum, próbka 20-50 tys. minut). `tests/matchEngine.test.mjs` bez zmian.
