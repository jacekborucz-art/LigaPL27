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
| Dyrektor sportowy (4 atrybuty od v1.23 Beta, `docs/dyrektor-sportowy.md`) | NEG negocjacje | rozmowy klubów AI z zawodnikami (gracz negocjuje sam) |
| | RYN znajomość rynku | kluby AI: błąd wyceny bez przesunięcia; gracz: widełki pensji w rozmowach |
| | SIE sieć kontaktów | szukanie klubu na wypożyczenie, kolejność klubów AI na rynku |
| | KAD zarządzanie kadrą i płacami | spór z trenerem rezerw, premie i prowizje w ofertach AI, przedłużenia AI |

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

## Skala 1-12 (Nov 22, 2026, v1.23 Beta)

Decyzja właściciela: jak na polską ligę sztab miał za wysokie atrybuty. Wszystkie role poza fizjoterapeutą (i poza
dyrektorem sportowym, skalibrowanym w licytacjach) mają atrybuty i jakość 1-12 (`STAFF_CAP`, `staffCap(rola)` w
`src/training/config.js`). Testy: `tests/staffCap.test.mjs`.

- Efekty w grze liczą się dalej na skali 1-20: `staffEff(rola, q) = 1 + (q - 1) x 16/11`, czyli 12 działa jak dawne
  17 (najlepsze sztaby w Polsce), 9 jak 12,6, 5 jak 6,8, 1 jak 1. Widok roli `game.training.staff` (q, d) jest na
  skali efektów, więc `staffA`, `staffQ`, `staffMul`, progi raportów (14 i 8) i wszystkie dawne wzory działają jak
  dotąd; `qs` w widoku to jakość roli do pokazania (najwyżej 12). Skaut: wyjazdy i progi renomy przez `staffEff`.
- Etykiety skali 1-12: od 10 bardzo dobry, od 8 dobry, od 6 przeciętny, od 4 słaby, niżej bardzo słaby (bez „klasy
  światowej”); fizjoterapeuta i dyrektor bez zmian. Kolory w Sztabie: od 10 i od 6.
- Generowanie: te same losowania co dotąd na skali 1-20, potem przeliczenie `staffRescale` (x 11/16, zaokrąglenie,
  najwyżej 12): kluby na starcie, lista wolnych, wolni skauci, nowe osoby. Atrybuty wokół jakości: odchylenie
  1,8 / 1,45, najwyżej 2 punkty. Pomocnik pomaga od jakości 5 (dawne 7); jakość roli z pomocnikami najwyżej 12.
- Pensja z jakości na skali efektów: jakość 12 = dawne 17, czyli najwyższe pensje w Polsce jak dotąd (asystent
  ok. 47,7 tys. zł / mies.); kluby AI i budżety sztabu bez zmian.
- Rozwój osób sztabu: szansa wzrostu i spadku / 1,45 (punkt skali 1-12 to 1,45 dawnego punktu), atrybuty najwyżej 12.
  Adaptacja obcokrajowca: 2 / 1,45 punktu.
- Migracja zapisu (`game.staff.attrs = 3`): każdy atrybut ról 1-12 przeliczony z 1-20 (x 11/16, zaokrąglenie,
  wyżej przycięty do 12), jakość znów średnią, widoki klubów przeliczone. Efekty w grze bez zmian z dokładnością do
  zaokrąglenia (do 0,7 punktu dawnej skali na osobę, średnio zero); dawne 18-20 działa jak 17.
- Edytor: atrybuty ról 1-12 (pole i walidacja), fizjoterapeuta i dyrektor 1-20; jakość obok roli w liczbach całkowitych.
  Datapack v7: pliki v1-v6 przeliczane przy wczytaniu tak samo jak zapis (`MIGRATE[6]`, `rescaleStaffClubs`).
- Do decyzji właściciela: prośba brzmiała „przytnij do 12”. Samo przycięcie zostawiłoby prawie cały sztab
  Ekstraklasy na 12 (mediana była 13), więc różnice między klubami by znikły; przeliczenie zachowuje różnice, a efekty
  i pensje zostają jak dotąd. Pomiar wpływu: `docs/sztab.md` rozdz. 7.
