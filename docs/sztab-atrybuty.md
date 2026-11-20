# Atrybuty członków sztabu

Wdrożone Nov 19, 2026 (v1.19 Beta). Wcześniej osoba sztabu miała jedną jakość `q` 1-20.

## Zasada

- Każda osoba ma 3 atrybuty swojej roli (`p.a`, 1-20, `ROLE_ATTRS` w `src/training/config.js`).
- Jakość osoby `q` = średnia atrybutów (zaokrąglona). Od jakości zależą jak dotąd: pensja, rynek sztabu, decyzje
  klubów AI, lider i pomocnicy w roli, etykiety („Bardzo dobry” itd.).
- Od atrybutów zależą konkretne efekty w grze (tabela niżej). Te same zasady dla gracza i klubów AI.
- Widok roli w klubie (`game.training.staff[klub][rola]`): `q` jak dotąd (lider i pomocnicy, adaptacja) oraz `d`,
  odchylenie każdego atrybutu roli od `q`, liczone tym samym wzorem (lider i pomocnicy). Odczyt: `staffA(game, klub,
  rola, atrybut)` = `q + d`. Przy równych atrybutach osoby gra działa dokładnie jak z samą jakością.

## Atrybuty i wpływ na grę

| Rola | Atrybut | Wpływ |
| --- | --- | --- |
| Asystent | TAK analiza taktyczna | zgranie i nauka pozycji na treningu, plan tygodnia, taktyka asystenta w meczu (TAK) |
| | OCE ocena zawodników | dokładność raportu asystenta, raportu rozwoju i raportu ogólnego, dobór składu przez asystenta w meczu (SKL) |
| | MOT praca z zawodnikami | rozmowy prowadzone przez asystenta, motywacja asystenta w meczu, rozwój cech mentalnych, ocena nastrojów i zaufania w raporcie |
| Trener przygotowania fizycznego | OBC planowanie obciążeń | ryzyko urazu na treningu, program powrotu po urazie, ocena przeciążeń w raportach i na liście zadań |
| | REG regeneracja | powrót świeżości po treningu i meczu |
| | MTR rozwój motoryki | rozwój zawodników (razem z asystentem), wolniejszy spadek po 29 latach |
| Trener bramkarzy | TEC technika bramkarska | rozwój bramkarzy (waga 0,6) |
| | NOG gra nogami i na przedpolu | rozwój bramkarzy (waga 0,4) |
| | OCE ocena bramkarzy | dokładność ocen bramkarzy (potencjał, raport ogólny) |
| Trener młodzieży | ROZ rozwój młodych | rozwój zawodników do 21 lat w kadrze, program dla młodych, akcent młodych w klubach AI |
| | AKA praca z akademią | rozwój juniorów w akademii |
| | TAL wyławianie talentów | szansa skoku rozwojowego, dokładność ocen potencjału młodych |
| Analityk | RYW rozpracowanie rywala | bonus analizy rywala w meczu, jakość analizy rywali, ocena trenerów rywali |
| | DAN analiza danych | raport ogólny: siła formacji, wyniki, rywale; analiza pomeczowa |
| | WID analiza wideo | raport ogólny: styl i taktyka, stałe fragmenty; analiza pomeczowa |
| Kierownik drużyny | DOK dokumenty i terminy | kontrakty i okno transferowe na liście „Do zrobienia” |
| | ORG organizacja klubu | licencja na liście „Do zrobienia” |
| | LOG logistyka | obozy na liście „Do zrobienia” |
| Fizjoterapeuta | LEC leczenie urazów | krótsza przerwa po urazie do 28 dni |
| | REH rehabilitacja | krótsza przerwa po urazie ponad 28 dni |
| | PRF profilaktyka | mniejsze ryzyko urazu na treningu |
| Skaut (5 atrybutów od v1.20 Beta, `docs/skauting.md`) | DOS doświadczenie | skuteczność wyjazdu za granicę (mniej pustych raportów), trafność profilu kandydatów |
| | OCE ocena zawodnika | ocena potencjału zawodników innych klubów (waga 1,0 w kraju, 0,7 z zagranicy), błąd raportu z wyjazdu (wydmuszki) |
| | RYN wiedza o rynku | ocena zawodników z zagranicy (waga 0,3), przedział ceny i pensji, trafność chęci przyjścia w raporcie |
| | SIE sieć kontaktów | liczba kandydatów, praca poza znanymi regionami (zastępuje część znajomości regionu) |
| | CHA ocena charakteru | trafność oceny adaptacji kandydata w raporcie |

Bez zmian (ogólna jakość): asystent jako trener tymczasowy, liczba spraw zgłaszanych przez członka sztabu na liście
„Do zrobienia”, wakaty (wakat ma wszystkie atrybuty równe jakości wakatu).

## Profil osoby

- Nowe osoby (pula, start gry) i stare zapisy (migracja raz, `game.staff.attrs`): atrybuty wokół jakości,
  odchylenia do 3 punktów z ziarna gry i osoby, suma odchyleń zero, więc jakość osoby się nie zmienia.
- Skaut (v1.20 Beta, `game.staff.attrs = 2`): dawne `POT, OCU, RYN` przeliczone na `DOS, OCE, RYN, SIE, CHA`
  (`migrateScoutAttrs` w `src/training/staff.js`, jakość bez zmian) i regiony `p.reg` (`docs/skauting.md`).
- Rozwój w nowym sezonie (szansa jak dotąd): jeden atrybut +2, drugi +1, czyli jakość +1; spadek tak samo w dół.
- Widok Sztab: atrybuty własnych osób dokładnie; kandydaci z rynku: atrybuty przesunięte o błąd oceny jakości
  (dokładnie, w przybliżeniu albo ogólnie, jak dotąd).
- Trening, Sztab: wpływ każdej roli policzony z atrybutów i lista atrybutów roli.

## Edytor i datapack

- Edytor, klub, Sztab: dla każdej osoby imię i nazwisko, wiek i 3 atrybuty (skaut 5); jakość wyliczana obok nazwy roli.
- Datapack v5 (v1.20 Beta): skaut z 5 atrybutami i regionami `reg` (najwyżej 3); pliki v1-v4 ze starymi atrybutami
  skauta przeliczane przy wczytaniu (`MIGRATE[4]`, `docs/skauting.md` rozdz. 11).
- Datapack v3: `staff: { rola: [{ name, age, q, a: { atrybut: 1-20 } }] }` (eksport zapisuje też `q` do podglądu).
- Wsteczna zgodność: pliki v1 i v2 (tylko `q`) wczytują się, jakość przesuwa cały profil osoby o tyle samo.
  Nieznany atrybut roli albo wartość spoza 1-20 odrzuca plik. Plik v3 w starszej grze: komunikat o nowszej wersji.
