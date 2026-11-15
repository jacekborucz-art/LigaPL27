# Skład ławki rezerwowych (asystent i kluby AI)

Nov 15, 2026. Narada: trener pierwszej drużyny z Ekstraklasy, znawca futbolu (przepisy i praktyka w Polsce i Europie), programista.

## Problem

Stara funkcja `autoPickBench` (`src/engine/lineup.js`) brała rezerwowego bramkarza, po jednym zawodniku z linii
(obrona, pomoc, atak), a resztę wyłącznie według OVR. Bramkarze mają OVR liczone z atrybutów bramkarskich, więc trzeci
bramkarz często wyprzedzał zawodników z pola. Linia „obrona” obejmowała też bocznych obrońców, więc środkowy obrońca
nie był pewny.

Pomiar (3 światy, wszystkie kluby, 4 scenariusze z kontuzjami, kartkami i powołaniami, losowe formacje, 4536 ławek):

| Ławka | 2+ bramkarzy | brak ŚO mimo dostępnego | 2 bramkarzy i brak ŚO | brak bocznego obrońcy mimo dostępnego |
|---|---|---|---|---|
| 7 | 497 z 1512 (33 %) | 466 (31 %) | 156 | 395 |
| 9 | 775 z 1512 (51 %) | 269 (18 %) | 155 | 200 |
| 12 | 1023 z 1512 (68 %) | 40 (3 %) | 35 | 22 |

Po zmianie (ten sam pomiar): 0 ławek z brakiem ŚO, bocznego obrońcy, środkowego pomocnika lub napastnika, gdy taki
zawodnik był dostępny. Drugi bramkarz tylko na ławce 12, gdy w kadrze nie został już nikt z pola (704 z 1512: kadry
po 25 zawodników z kilkoma nieobecnymi). Przy ławce 9 w 173 przypadkach zostaje wolne miejsce zamiast drugiego bramkarza.

## Głos trenera

- Na ławce siedzi jeden rezerwowy bramkarz. Drugi to zmarnowane miejsce: przy 5 zmianach bramkarz wchodzi tylko po
  urazie albo czerwonej kartce, a dwa takie zdarzenia w jednym meczu prawie się nie zdarzają.
- Ławka musi dać odpowiedź na każdą kontuzję: środkowy obrońca (najtrudniej go zastąpić, pomocnik na środku obrony to
  ryzyko błędów), boczny obrońca, środkowy pomocnik, skrzydłowy albo ofensywny pomocnik, napastnik.
- Gdy brakuje zawodnika z nominalną pozycją, biorę uniwersalnego (np. defensywny pomocnik, który zagra na środku obrony).
- Pozostałe miejsca: najlepsi dostępni, ale bez pięciu napastników naraz. Uniwersalność to mały plus.
- Zmęczeni i bez formy siedzą na ławce częściej niż w jedenastce, ale stan zawodnika liczy się tak samo jak przy jedenastce.

## Głos znawcy futbolu

- Przepisy: Ekstraklasa i rozgrywki UEFA 12 rezerwowych, 1 Liga i niższe 9 (`src/config/competitions.js`), 5 zmian w
  3 oknach. W Premier League (9 rezerwowych) praktycznie zawsze jeden bramkarz na ławce.
- W Lidze Mistrzów (12 rezerwowych) trzeci bramkarz bywa w protokole, ale głównie dlatego, że kadra meczowa ma tylko
  23 zawodników z listy. W grze kadry są większe, więc tego nie przenosimy (decyzja właściciela niżej).
- Zasady muszą być te same dla gracza i AI, bez ułatwień i bez sztucznej trudności.

## Głos programisty

- Jedno miejsce: `autoPickBench` wywołują `createTactics` (asystent gracza, przycisk „asystent ustawia”, tryb asystenta
  przed meczem w `matchTactics`, rywal w podglądzie) i `aiPlanTactics` (kluby AI). Zmiana tej funkcji obejmuje wszystkich.
- Ławka ustawiona ręcznie nie ma osobnego znacznika, to po prostu `tactics.bench`. `refreshTactics` usuwa niedostępnych,
  a dotąd przy ławce krótszej niż 7 losował całą ławkę od nowa, gubiąc wybory gracza. Teraz zostawia wybranych i dobiera
  tylko brakujące miejsca według nowych zasad.

## Zasady (MUST, wdrożone)

1. Dokładnie jeden rezerwowy bramkarz, gdy jakiś jest dostępny (najlepszy według OVR i stanu). Drugi tylko przy ławce
   12 i tylko wtedy, gdy nie ma już żadnego dostępnego zawodnika z pola. Przy ławce 7 i 9 takie miejsce zostaje puste.
2. Pokrycie pozycji w kolejności: ŚO, boczny obrońca (BO lub WB), środek pomocy (DP lub ŚP), skrzydło lub ofensywny
   pomocnik (BP, SN, OP), napastnik (NAP). Rola jest pokryta, gdy na ławce siedzi już zawodnik z tą pozycją nominalną.
3. Do pokrycia brany jest najlepszy zawodnik z nominalną pozycją roli (OVR z karą pozycji plus stan zawodnika), nawet
   słabszy od uniwersalnego: trener chce prawdziwego ŚO na ławce. Brak nominalnego: wchodzi uniwersalny z biegłością
   co najmniej 70 (np. DP na ŚO). Brak nawet takiego: rola zostaje pusta, a miejsce idzie do puli ogólnej.
4. Mała ławka (7): bramkarz i pięć ról, jedno miejsce wolne. Ławka 9: trzy wolne. Ławka 12: sześć wolnych.
5. Wolne miejsca: najlepsi zawodnicy z pola według wartości na najlepszej dla nich pozycji plus stan zawodnika.
6. Ławka ustawiona przez gracza zostaje. Asystent tylko usuwa niedostępnych (jak dotąd), a przy uzupełnianiu krótkiej
   ławki dobiera brakujących według tych zasad, licząc już siedzących (np. nie doda bramkarza, gdy gracz go wpisał).
7. Wynik powtarzalny: przy równej wartości decyduje identyfikator zawodnika.

## Zasady (SHOULD, wdrożone, bo małe)

- Najwyżej 3 zawodników z tej samej roli na ławce przy dobieraniu wolnych miejsc (limit znika, gdy nie ma innych).
- Uniwersalność: mały dodatek do wartości za każdą inną rolę, w której zawodnik ma biegłość co najmniej 85 [SZAC: 0,1 OVR za rolę].

## Na później (LATER) i decyzje właściciela

- Trzeci bramkarz przy ławce 12 w pucharach europejskich (praktyka UEFA): obecnie nie. Do decyzji.
- Uzupełnianie ławki po każdej kontuzji, nie tylko gdy spadnie poniżej 7: dziś gracz z ławką 9, z której wypadł ŚO, gra
  z 8 rezerwowymi bez ŚO. Zmiana dotknęłaby ławki gracza, więc do decyzji.
- Młodzieżowiec na ławce (minuty dla młodych, przepis o młodzieżowcu), skłonność do urazów, „zmiennik od zadań specjalnych”
  (szybki skrzydłowy przy przegrywaniu), bramkarz od karnych w pucharach.
