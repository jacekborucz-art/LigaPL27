# IV liga w grze (5. poziom rozgrywek), etap 1

Stan: Nov 26, 2026. Etap 1: wszystkie 16 grup wojewódzkich IV ligi grają cały sezon „w tle” (bez kadr, tylko wyniki,
tabele, baraże, awanse i spadki). Projekt architekta i decyzje właściciela D1-D12: rozdział „Decyzje” na końcu.
Liczby oznaczone [SZAC] to założenia do kalibracji.

Numeracja poziomów: Ekstraklasa 1, 1 Liga 2, 2 Liga 3, III liga 4, IV liga 5, poziom 6 (V liga albo klasa okręgowa).

## Kiedy działa

- Tylko w karierach rozpoczętych od tej wersji (D1). Nowa kariera dostaje `game.season.l4` w `createSeason`
  (opcja `l4Seed`, ziarno gry), kolejne sezony dziedziczą IV ligę w `rolloverSeason`.
- Stare zapisy: brak `season.l4`, bez migracji. Kluby IV ligi grają tylko w Pucharze Polski, beniaminkowie III ligi
  są wybierani jak dotąd (losowanie z wagi, `computeMoves` bez `l4`). Zakładka Rozgrywki, IV liga pokazuje wyjaśnienie.

## Grupy

16 grup wojewódzkich, 276 klubów (`src/data/clubs_l4.js`), dane województw w `src/data/voivodeships.js`:

| Rozmiar | Grupy | Kolejki | Start | Wiosna od | Najmniej spadków (D6) |
|---|---|---|---|---|---|
| 18 | 11 grup | 34 (2 środy w listopadzie) | Jul 31, 2026 | Feb 26, 2027 | 3 |
| 16 | lubelska, podlaska, warmińsko-mazurska, zachodniopomorska | 30 | Aug 7, 2026 | Mar 5, 2027 | 2 |
| 14 | opolska | 26 | Aug 21, 2026 | Mar 19, 2027 | 2 |

- Terminy (D2): jedna kolejka = jeden termin III ligi (`thirdLeagueDates`). Mniejsze grupy opuszczają najpierw środy,
  potem na przemian najwcześniejszy weekend jesieni i wiosny. Wspólny koniec: weekend Jun 5-6, 2027.
- Mecze w sobotę (55 %) albo niedzielę [SZAC], godzina 11:00-17:00 z haszu, środa 17:00, ostatnia kolejka
  w niedzielę o 15:00. Nieparzysta liczba drużyn: pauza (kolejek 2n).
- Grupa III ligi (makroregion) województwa: I łódzka, mazowiecka, podlaska, warmińsko-mazurska; II kujawsko-pomorska,
  pomorska, wielkopolska, zachodniopomorska; III dolnośląska, lubuska, opolska, śląska; IV lubelska, małopolska,
  podkarpacka, świętokrzyska.
- Województwo klubu: pole `voiv` (kluby IV ligi), w ligach 1-4 z regionu (`REGION_WOJ`, przeniesione z sędziów do
  `src/data/voivodeships.js`), `voivOfClub` w `src/season/leagues.js`. Spadkowicz z III ligi trafia do grupy swojego
  prawdziwego województwa (np. Wigry Suwałki do podlaskiej).

## Wyniki

- Model (`src/season/fourthLeague.js`, `L4`): siła = L klubu + forma sezonu N(0; 0,25), gole gospodarza
  Poisson(1,7 x e^(0,6 d)), gościa Poisson(1,3 x e^(-0,6 d)), d = różnica siły [SZAC].
- Ziarno na mecz (`iv-wynik:ziarno:rok:województwo:kolejka:mecz`): wynik nie zależy od dnia liczenia.
- System dnia `fourthLeague` (order 7) rozgrywa mecze z datą nie późniejszą niż dzień gry.
- Pomiar (20 sezonów, 90 160 meczów): 3,20 gola na mecz, gospodarze 47,4 %, remisy 20,4 %, mistrz grupy
  18-drużynowej 77,0 pkt, ostatni 18,7 pkt. Cały sezon IV ligi naraz ok. 22 ms; system dnia `fourthLeague` w `npm run perf`
  ok. 76 ms na sezon (ok. 0,5 % czasu sezonu 13,7 s), terminarz 16 grup w `createSeason` ok. 25 ms.
- Tabela z wyników tą samą funkcją `standings()` co ligi z kadrami (punkty, mecze bezpośrednie, bilans, bramki,
  zwycięstwa).

## Baraże (D5)

- Po ostatniej kolejce wszystkich grup: w każdym makroregionie 4 wicemistrzów województw (drugi uprawniony klub:
  rezerwy tylko, gdy pierwsza drużyna gra wyżej niż III liga).
- Półfinały (Jun 9, 2027): jeden mecz u pierwszej wylosowanej drużyny. Finał (Jun 13, 2027): u drużyny z lepszą
  średnią punktów na mecz. Remis: dogrywka (jedna trzecia lambdy) i karne (0,5 + 0,04 na punkt różnicy siły) [SZAC].
- Daty w `DOMESTIC.liga4` (`src/config/calendar2026.js`), przesuwane z kalendarzem kolejnych sezonów.

## Awanse i spadki (1 lipca, `computeMoves` z opcją `l4`)

III liga, każda grupa (zawsze 18 klubów, razem 72):
- spadek co najmniej z miejsc 15-18; wolne miejsca = 18 - zostający - spadkowicze z 2 Ligi do tej grupy,
- zawsze awansuje 4 mistrzów województw makroregionu (za mało miejsc: spadają też 14., potem 13. drużyna),
- 5. miejsce: zwycięzca baraży makroregionu; bez wolnego miejsca zostaje w IV lidze,
- 6. i dalsze miejsca: utrzymanie najlepszych spadkowiczów (15., potem 16.) „przy zielonym stoliku”,
- województwo bez uprawnionego mistrza (praktycznie nie występuje): finalista baraży.

IV liga, każde województwo (stały rozmiar grupy, D3, D6):
- spadek na poziom 6 co najmniej 3 (grupa 18) albo 2 (grupy 14 i 16) plus nadwyżka spadkowiczów z III ligi
  do województwa nad awansami z województwa,
- rezerwy, których pierwsza drużyna gra w IV lidze albo niżej: przeniesienie administracyjne na poziom 6 (liczy się
  jako spadek),
- awans z poziomu 6 do docelowego rozmiaru grupy: losowanie z wagi siły (waga^2,2) z puli województwa,
- pusta pula: utrzymanie najlepszych spadkowiczów; gdy i to nie wystarcza, grupa gra mniejsza (uwaga techniczna
  w wiadomości końca sezonu).

Pomiar (10 sezonów, losowe tabele lig 1-4): zawsze 16 mistrzów w górę, 0-1 zwycięzców baraży na sezon, 47-50 spadków
na poziom 6 i tyle samo awansów, rozmiary grup stałe, III liga 72, ligi 1-4 126 klubów.

## Poziom 6: pliki właściciela i loader (D3, D4)

- Pliki: `src/data/V liga PL/` (16 plików, jeden na województwo): `v_liga_<woj>.txt` dla małopolskiego,
  mazowieckiego, śląskiego i wielkopolskiego (poziom 6 = „V liga”), `klasa_okregowa_<woj>.txt` dla pozostałych 12
  („klasa okręgowa”). Format: nagłówek, grupy „GRUPA ...”, wiersze „nazwa | barwy | stadion | pojemność”.
  Wartości „bialo-czerwono-czarne”, „stadion miejski”, 1200 oznaczają brak danych i nie są zapisywane.
- Loader `src/data/level6.js`: `loadLevel6()` czyta pliki raz (przeglądarka: `fetch` z tego samego adresu, spacje
  w nazwie folderu kodowane przez `URL`; Node i testy: `fs`), wynik zostaje w pamięci. Gra startuje wczytywanie
  przy otwarciu, nowa kariera i pętla dni (przycisk Dalej) czekają na nie, więc koniec sezonu ma zawsze dane.
  Brak pliku albo błąd odczytu: pusta pula województwa (utrzymania).
- Pula awansu województwa: spadkowicze z IV ligi z wcześniejszych sezonów plus 6 klubów z pliku [SZAC] (kolejność
  losowana raz z ziarna gry, bez klubów już w grze i bez drużyn rezerw „II”, „III”). Waga klubu z pliku 1 albo 2
  (L 6,15 albo 6,4) [SZAC].
- Klub z pliku, który awansuje, trafia do zapisu: `game.leagueState.extra[id] = { name, voiv, w, col?, stadium?, cap? }`
  (ok. 60 bajtów); `applyLeagueState` dopisuje go do znanych klubów, więc dalej nie zależy od plików.
- Service worker: `npm run sw` dodaje pliki `.txt` z tego folderu (bez readme) do trybu offline (`tools/sw-list.cjs`).

## Zapis

- `game.season.l4` (ok. 25 KB na sezon): `{ v, year, dates, groups: [{ voiv, ids, fx, res }], po, done }`;
  `fx` pary (2 znaki base36 na mecz), `res` wyniki (2 znaki, „--” = nierozegrany). Tabela nie jest zapisywana.
- Archiwum sezonu (D10): `archive[].l4 = { champ: { województwo: id }, po: { grupa: id }, up, d6, u6 }`
  (mistrzowie, zwycięzcy baraży, awanse do III ligi, spadki i awanse poziomu 6), bez tabel.
- `leagueState.tiers` zapisuje także poziom 6 (odstępstwa od danych), `leagueState.extra` kluby z plików.

## UI

- Rozgrywki, IV liga (`src/ui/fourthLeagueView.js`): wybór grupy (select, domyślnie województwo klubu gracza, bez
  klubu mazowieckie [SZAC]), podzakładki Tabela (strefy: awans, baraże, spadek co najmniej k), Kolejki, Baraże.
  Po sezonie karta „Mistrzowie województw”.
- Kliknięcie klubu: prosta karta bez zawodników (D7): herb, miejscowość, województwo, miejsce i punkty, forma,
  renoma (gwiazdki z prestiżu), stadion tylko z potwierdzonych danych, historia z archiwum, ostatnie i najbliższe mecze.
- Historia: wiersz „Awans z IV ligi”.
- Poczta (D9): dwie wiadomości na sezon: po ostatniej kolejce (mistrzowie, pary baraży) i po finałach baraży;
  ważne, gdy klub gracza gra w III albo IV lidze.

## Barwy i stadiony klubów IV ligi (D11)

- Plik właściciela `tools/data/iv_liga_kluby_stadiony.txt` (tekst z docx „Kluby IV ligi polskiej 2026 2027”),
  czytany przez `tools/build-lower-leagues.mjs`, który generuje `src/data/clubs_l4.js`.
- Barwy: 270 z 276 klubów (dopasowanie nazw bez skrótów KS, GKS, LKS itd.). Stadion i pojemność: 56 klubów
  (wpisy konkretne: nazwa obiektu i pojemność niezaokrąglona do setek; 57. taki wpis, Termalica II, nie ma
  dopasowania nazwy).
- Bez dopasowania (dane bez zmian, do decyzji właściciela): GKS Raciborowice (w grze Cement Raciborowice),
  KP Piast Iłowa (Piast Iłowa), Bruk-Bet Termalica II Nieciecza (Termalica II Nieciecza), Radomyślanka Radomyśl
  Wielki (Radomyślanka Radomyśl), Iskierka Śmierdnica (Iskierka Szczecin, niepewne), Leśnik Manowo (GKS Manowo, niepewne).
- Skutek uboczny: 56 klubów z pojemnością ma finanse jak III liga przy awansie (`thirdLeagueData`, pole `cap`)
  i prawdziwą pojemność w meczach Pucharu Polski.

## Nie w etapie 1

- Puchar Polski bez zmian (D8): 7 zdobywców pucharów wojewódzkich jak dotąd.
- Grywalna grupa IV ligi z kadrami (D12): etap 2.

## Decyzje właściciela (Nov 26, 2026)

D1 tylko nowe kariery; D2 mniejsze grupy zaczynają później, wspólny koniec; D3 stałe rozmiary grup z pulą poziomu 6
z plików właściciela; D4 nazwa poziomu 6 według plików (V liga albo klasa okręgowa); D5 baraże jednomeczowe;
D6 najmniej 3 albo 2 spadki plus zależne od III ligi; D7 prosta karta klubu; D8 Puchar Polski bez zmian;
D9 dwie wiadomości na sezon; D10 archiwum: mistrzowie i ruchy; D11 barwy dla wszystkich, stadiony dla wpisów
konkretnych; D12 etap 2 później.
