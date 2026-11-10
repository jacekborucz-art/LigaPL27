# Negocjacje kontraktów: specyfikacja

Stan na Nov 10, 2026. Kod: `src/career/personality.js`, `src/career/negotiation.js`, `src/career/negotiationLines.js`. Testy: `tests/negotiation.test.mjs`.

Dokument opisuje podpisanie nowego zawodnika (transfer albo wolny zawodnik) i przedłużenie kontraktu. Wszystkie liczby to wartości balansowe [SZAC] do strojenia w testach wielu sezonów. Jednostki: pensja tygodniowa w zł, premie, prowizje i klauzule w zł.

## 1. Zasady

- **Każdy zawodnik jest inny:** 11 cech charakteru, typ agenta i mindset zależny od sytuacji. Te same liczby w ofercie działają na każdego inaczej.
- **Każda negocjacja jest inna:** ziarno z id zawodnika, klubu, rodzaju rozmów i daty (`rng.fork`), szum na ukrytych wartościach, kwestie dobierane z biblioteki 128 tekstów.
- **Spójność z reputacją:** zgoda na transfer i bazowe żądanie płacowe pochodzą z `willingnessToJoin` (`src/career/reputation.js`), reputacja klubu z `clubReputation`. Negocjacje tego nie powielają.
- **Spójny rynek:** kluby AI negocjują tą samą sesją w trybie uproszczonym (maks. 2 rundy).
- **Lekkość:** jedna negocjacja to kilkanaście liczb i najwyżej 9 rund. Brak pętli po świecie. Relacje zawodnika z klubami są zapisane w samym zawodniku.
- **Zapis gry:** sesja ma `toJSON()` i `NegotiationSession.fromJSON()`, razem ze stanem obu generatorów losowych. Wczytana w połowie rozmów daje dokładnie ten sam dalszy przebieg.

## 2. Charakter zawodnika

### 2.1 Cechy (1-20)

Losowane raz, przy generowaniu zawodnika (`generatePersonality(player, rng)`), i zapisane w `player.traits` oraz `player.agent`. Starsze zapisy bez cech dostają je deterministycznie z id (`personalityOf`).

Wzór: `cecha = clamp(round(10 + bias_osobowości + korelacja + N(0; 2,8)), 1, 20)`.

| Klucz | Cecha | Korelacja z istniejącymi danymi | Na co wpływa w negocjacjach |
|---|---|---|---|
| greed | Chciwość | +0,04 za punkt reputacji powyżej 40 | oczekiwania, minimum, waga pieniędzy i premii za podpis, chęć blefu |
| ambition | Ambicja | +0,8 x (POT - OVR), maks. +4; młodzi +1, 32+ -2 | mindset kariera i zagranica, waga klauzuli, prośba o transfer |
| loyalty | Lojalność | +0,15 na rok wieku powyżej 26 | tańsze przedłużenie, niższe minimum, chęć pozostania |
| ego | Ego | +0,06 za punkt reputacji powyżej 40 | próg i siła obrazy, pierwsze żądanie, oczekiwana rola, koszt sprawdzania blefu, długość blokady |
| patience | Cierpliwość | +0,2 x (PRF - 10) - 0,2 x (TMP - 10) | liczba rund, irytacja drobnymi krokami, krótsza blokada |
| temper | Temperament | +0,6 x (TMP - 10) | obraza, irytacja, cofanie oferty, długość blokady |
| professionalism | Profesjonalizm | +0,7 x (PRF - 10) | waga premii za wyniki |
| homeTies | Przywiązanie do miasta i rodziny | +0,25 na rok powyżej 26 | mindset powrót do domu, agent z rodziny, chęć pozostania |
| risk | Skłonność do ryzyka | -0,3 na rok powyżej 28 | premie za wyniki zamiast pensji, krótsze kontrakty |
| playTime | Potrzeba gry | +1,5 do 24 lat | waga obietnicy roli, mindset chce grać |
| security | Lęk przed niepewnością | +0,6 na rok powyżej 29 | dłuższe kontrakty, coroczna podwyżka, kara za klauzulę spadkową |

**Bias osobowości** (persona z `ekspert_futbol.md` 1.2):

| Osobowość | Przesunięcia średniej |
|---|---|
| Spokojny | cierpliwość +4, temperament -4, ego -2, ryzyko -1, lojalność +1 |
| Ambitny | ambicja +5, ego +3, chciwość +1, lojalność -2, potrzeba gry +2 |
| Wrażliwy | lęk +4, przywiązanie +3, ego -1, cierpliwość -1, ryzyko -2 |
| Lider | lojalność +3, profesjonalizm +3, ego +1, cierpliwość +2, potrzeba gry +1 |
| Narwaniec | temperament +5, cierpliwość -4, ego +2, ryzyko +3, profesjonalizm -2 |

Kolejność losowania cech jest stała, więc dwaj zawodnicy z tym samym ziarnem różnią się tylko o bias i korelacje.

### 2.2 Typ agenta

| Typ | Pierwsze żądanie | Tempo ustępstw | Cierpliwość | Szansa blefu | Oczekiwana prowizja | Wpływ prowizji na zgodę |
|---|---|---|---|---|---|---|
| Twardy rekin | x1,15 | 0,75 | x0,85 | 45 % | 12 % rocznej pensji | 1,2 |
| Rozsądny | x1,07 | 1,0 | x1,0 | 15 % | 7 % | 0,8 |
| Z rodziny | x1,04 | 1,1 | x1,15 | 8 % | 4 % | 0,5 |
| Bez agenta | x1,02 | 1,2 | x1,1 | 3 % | 0 | 0 |

Wagi losowania: rekin `0,6 + 0,08 x max(0, rep - 40) + 0,15 x (chciwość - 10)`, rozsądny 3, z rodziny `0,6 + 0,12 x (przywiązanie - 10) + 0,05 x (lęk - 10)`, bez agenta 2,5 przy reputacji poniżej 30 (0,8 poniżej 40, inaczej 0,1), +1 do 20 lat. Gwiazdy mają więc zwykle rekinów, młodzi i nieznani często nikogo.

Bez agenta mówi sam zawodnik (kwestie w 1. osobie), z agentem mówi agent (o zawodniku w 3. osobie).

### 2.3 Mindset (nastawienie)

Liczony od nowa przy każdej negocjacji (`computeMindset`): wygrywa najwyższy wynik.

| Mindset | Wynik | Idealna długość | Priorytety (mnożniki wag) |
|---|---|---|---|
| Budowanie kariery | wiek do 24: 5, 25-27: 0,5, starsi -6; + 0,4 x (ambicja - 10) + 1,5 x min(4, POT - OVR) | 3 lata | rola x1,5, klauzula x1,3, pieniądze x0,9 |
| Ostatni duży kontrakt | 29-31 lat: 6, 28 i 32: 4, inaczej -6; + 0,5 x (chciwość - 10) + 0,2 x (lęk - 10) | 5 lat | pensja x1,08, premia za podpis x1,5, długość x1,4, pieniądze x1,3, rola x0,7 |
| Chce grać | 0,5 x (potrzeba gry - 10) + (minuty < 35 %: 5; < 55 %: 2; inaczej -3) | 2 lata | rola x2, pensja x0,92, pieniądze x0,75 |
| Chce wrócić do domu | klub z rodzinnego regionu: 4 + 0,6 x (przywiązanie - 10), inaczej -10 | 3 lata | pensja x0,88 (zniżka dla „swojego” klubu) |
| Chce do zagranicznej ligi | 0,5 x (ambicja - 10) + (rep >= 45: 2, inaczej -3) + (wiek <= 28: 1, inaczej -4) + 0,2 x (ryzyko - 10) - 0,3 x (przywiązanie - 10) | 2 lata | klauzula x2 (tylko dla klubów zagranicznych jest dla niego w porządku) |
| Spokojna końcówka kariery | od 33 lat: 5 + (wiek - 33); 31-32: 0; inaczej -10; + 0,3 x (lęk - 10) - 0,3 x (ambicja - 10) | 2 lata | rola x0,5, premia za podpis x1,2, kara za spadek x1,3 |
| Szuka stabilizacji (domyślny) | 1,5 + 0,3 x (lęk - 10) | 3 lata | coroczna podwyżka x1,2 |

Idealna długość: `mindset + 0,1 x (lęk - 10) - 0,08 x (ryzyko - 10)`, od 33 lat maks. 2, od 31 lat maks. 3 (przy ostatnim dużym kontrakcie 4).

## 3. Elementy oferty i ich wagi

| Element | Pole | Zakres | Jak zawodnik go wycenia |
|---|---|---|---|
| Pensja tygodniowa | `wage` | zł | 1:1 (to waluta wyceny) |
| Długość | `years` | 1-5 (w Polsce maks. 5) | kara `0,035 x T x waga_długości x |lata - idealne|` |
| Premia za podpis | `signOn` | zł | rozłożona na tygodnie kontraktu x `signOnPref` |
| Premie za gole, asysty, czyste konto, występ | `bonus.goal/assist/cleanSheet/app` | zł za zdarzenie | oczekiwana liczba zdarzeń w sezonie / 52 x `bonusPref` |
| Coroczna podwyżka | `raise` | 0-20 % | średni wzrost pensji w kontrakcie x `raisePref` |
| Klauzula odstępnego | `clause:{amount, foreignOnly}` | zł | tylko u tych, którzy jej chcą (waga >= 1,2): brak to kara `0,05 x T x waga`, klauzula do 1,5 x wartości w pełni ich satysfakcjonuje |
| Obniżka pensji po spadku | `relegationCut` | 0-50 % | `obniżka x ryzyko spadku klubu x relegPref` |
| Obietnica roli | `role` | kluczowy, podstawowy, rotacja, perspektywiczny, rezerwowy | stopień poniżej oczekiwanej roli: `0,07 x T x waga_roli`; stopień powyżej: premia `0,015 x T x waga_roli` |
| Prowizja agenta | `agentFee` | zł | poniżej oczekiwanej: kara `0,06 x T x wpływ x brak`; powyżej: mała premia (rekin lubi dopłatę) |

Wagi z cech (mnożone przez mindset):

```text
moneyW     = mindset.moneyW  x (1 + 0,03 x (chciwość - 10))                               0,4-2
signOnPref = mindset.signOn  x (0,9 + 0,03 x (chciwość - 10) + 0,02 x (lęk - 10))        0,4-2
bonusPref  = mindset.bonus   x (0,7 + 0,03 x (ryzyko - 10) + 0,02 x (prof. - 10) - 0,02 x (lęk - 10))
raisePref  = mindset.raise   x (0,8 + 0,03 x (lęk - 10))
relegPref  = mindset.releg   x (1 + 0,04 x (lęk - 10))
roleW      = mindset.roleW   x (1 + 0,05 x (potrzeba gry - 10) + 0,02 x (ego - 10))       0,2-3
lenW       = mindset.lenW    x (1 + 0,04 x (lęk - 10))
clauseW    = mindset.clauseW x (1 + 0,04 x (ambicja - 10))
```

**Oczekiwana rola** (`expectedRole`): z OVR względem poziomu klubu L (`>= +1,5` kluczowy, `>= +0,3` podstawowy, `>= -0,8` rotacja, niżej rezerwowy), do 21 lat zamiast rotacji i rezerwowego „perspektywiczny”. Ego >= 15 przy OVR nie niższym od L podnosi oczekiwanie o stopień. Bez L: z różnicy reputacji / 8.

### 3.1 Wycena oferty (ekwiwalent pensji, Weq)

```text
a     = 1 + podwyżka x (lata - 1) / 2 x raisePref - obniżka_po_spadku x ryzyko_spadku x relegPref
extra = premia_za_podpis / (lata x 52) x signOnPref + premie_tygodniowo x bonusPref
Weq   = pensja x a + extra - (kara_roli + kara_długości + kara_klauzuli) / moneyW - kara_prowizji
cash  = pensja x a + extra - kara_roli / moneyW        (tylko to może obrazić)
```

Ryzyko spadku domyślnie 15 % (`ctx.relegationRisk`). Oczekiwane statystyki do premii: występy `34 x udział_roli` (kluczowy 0,85, podstawowy 0,7, rotacja 0,45, perspektywiczny 0,25, rezerwowy 0,15), na mecz: napastnik 0,35 gola i 0,15 asysty, pomocnik 0,12 i 0,15, obrońca 0,04 i 0,06 oraz 0,3 czystego konta, bramkarz 0,3 czystego konta.

Weq jest liniowe względem pensji, więc kontrofertę liczy się jednym dzieleniem, bez szukania.

## 4. Ukryte wartości zawodnika

Liczone raz przy otwarciu rozmów (`openNegotiation`). Gracz ich nie widzi; widzi nastrój, cierpliwość, mindset, typ agenta i orientacyjne żądanie rynku (`session.view()`).

### 4.1 Oczekiwania T

**Podpisanie:**

```text
w = willingnessToJoin({ player:{rep, age, persona, wage, monthsLeft, unhappy}, from, to, tiers, puchary })
T = w.wageDemand x (1 + 0,35 x (0,55 - w.score))     chęć obniża cenę, niechęć podnosi
```

Wolny zawodnik: `from` to wirtualny klub o reputacji zawodnika - 5, `monthsLeft = 0`; pensja bazowa to ostatnia pensja (`player.wage`) albo rynkowa `marketWage(OVR, liga) = 1200 x e^(0,45 x (OVR - 8)) x mnożnik_ligi`.

**Przedłużenie:**

```text
siła_przetargowa = 0,25 x clamp((śr_ocena - 6,7) / 0,6, -1, 1,5)
                 + 0,20 x clamp((rep - rep_klubu + 20) / 20, -1, 1,5)
                 + 0,25 x clamp((udział_minut - 0,5) x 2, -1, 1)
                 + 0,20 gdy do końca kontraktu < 6 miesięcy
                 + 0,25 x clamp((rep_rywala - rep_klubu) / 15 + 0,5, 0, 1,5) przy ofercie z innego klubu
baza = max(obecna_pensja, 0,9 x rynkowa)
T    = baza x (1,05 + 0,3 x siła) x (1 - 0,012 x (lojalność - 10)) x (1 - 0,001 x (zaufanie - 50))
```

**Wspólne mnożniki:** `x (1 + 0,015 x (chciwość - 10)) x mindset.wageMul x (1 + 0,06 x złamane_obietnice) x (1 + 0,002 x uraza) x (1 + N(0; 0,04))`.

**Próg płacowy:** przy przedłużeniu T >= 0,97 x obecna pensja, przy transferze z klubu >= 0,95 x; od 32 lat i w spokojnej końcówce >= 0,8 x. Wolny zawodnik nie ma progu.

### 4.2 Minimum, pierwsze żądanie, cierpliwość, nastrój

```text
minF  = 0,84 + 0,008 x (chciwość - 10) + (chęć < 0,45: +0,05; chęć >= 0,7: -0,03)
        - 0,008 x (lojalność - 10) [przedłużenie] + 0,04 [oferta rywala] + N(0; 0,02)     -> 0,72-0,97
min   = T x minF
rywal: min >= pensja_rywala x clamp(1 + (rep_rywala - rep_klubu) / 80, 0,75, 1,3) x 0,97, a T >= 1,05 x min
anchor (pierwsze żądanie) = T x agent.anchor x (1 + 0,005 x (ego - 10))
rundy = clamp(round(2 + 0,22 x cierpliwość x agent.patienceMul + N(0; 0,5)
              - 0,7 x złamane_obietnice - 1 [rywal] - uraza / 40), 2, 8)        AI: zawsze 2
nastrój_start = clamp(55 + 40 x (chęć - 0,5) + 0,4 x (zaufanie - 50) - 0,4 x uraza
                      - 8 x złamane_obietnice + 3 [agent z rodziny] + N(0; 4), 15, 90)
```

## 5. Przebieg rozmów

### 5.1 Otwarcie

`openNegotiation({ kind, player, club, fromClub, date, rng, mode, ctx })` zwraca sesję albo odmowę:

| Powód | Kiedy | Tekst (przykład) |
|---|---|---|
| `locked` | trwa blokada po fiasku | „Na razie nie chcemy rozmawiać. Wróćmy do tematu po Sep 14, 2026.” |
| `refuseJoin` | `willingnessToJoin` daje twardą odmowę albo odmowę także przy 1,5 x żądanej pensji | „Z całym szacunkiem, to nie jest poziom mojego klienta.” |
| `tooEarly` | przedłużenie, a do końca kontraktu ponad 18 miesięcy | „Kontrakt obowiązuje jeszcze długo. Porozmawiajmy bliżej jego końca.” |
| `refuseRenew` | chęć pozostania < 0,35 (rozdz. 6) | „Dziękuję za wszystko, ale nie przedłużę umowy.” |
| `refused` | `renewRefused` już ustawione | „Decyzja zapadła. Jan nie przedłuży kontraktu.” |

### 5.2 Runda

Gracz składa pełną ofertę (`session.propose(offer)`), a zawodnik:

1. **Ocenia nastrój:**

| Zdarzenie | Zmiana nastroju (0-100) |
|---|---|
| Niska oferta: `cash / T < próg`, `próg = 0,74 + 0,006 x (ego - 10) + 0,004 x (temp. - 10)` | `-120 x obraza`, gdzie `obraza = (próg - cash/T) x max(0,3, osobowość x (0,8 + 0,06 x (ego - 10) + 0,03 x (temp. - 10)))`; osobowość: Narwaniec 1,25, Ambitny 1,15, Wrażliwy 1,1, Lider 0,9, Spokojny 0,75 |
| Cofnięcie oferty (krok < -0,5 % T) | `-(8 + 0,4 x (temp. - 10))` |
| Drobny krok (< 1,2 % T) | `-max(1, 3 + 0,4 x (10 - cierpliwość) + 0,3 x (temp. - 10))` |
| Wyraźne ustępstwo (>= 3 % T) | `+min(8, 120 x krok) x (1 + 0,02 x (10 - ego))` |
| Oferta konkurencji na stole | -1,5 co rundę |

Obraza się sumuje (`offended`) i decyduje potem o blokadzie.

2. **Decyduje** (pierwszy spełniony warunek):

| Warunek | Odpowiedź |
|---|---|
| Było ultimatum: oferta >= ultimatum | akceptacja, inaczej zerwanie |
| Weq >= aktualne żądanie albo oferta nie gorsza od jego ostatniej kontroferty | **akceptacja** (zawodnik dotrzymuje słowa) |
| Tryb AI, 2. runda | zerwanie |
| Nastrój <= 8 | **zerwanie** |
| Obraza w tej rundzie >= 0,3 i ego >= 15 | **zerwanie** („Nie pozwolę się tak traktować”) |
| Ostatnia runda albo nastrój < 22, a Weq >= 0,85 x min | **ultimatum** (konkretna oferta, ostatnia szansa) |
| Ostatnia runda, oferta daleko | **zerwanie** |
| Jedna poprawka (rola, długość, klauzula, prowizja, łagodniejsza klauzula spadkowa) wystarcza, albo brakuje < 5 % i zawodnik ceni premię za podpis | **żądanie zmiany jednego elementu** z konkretną wartością |
| W pozostałych przypadkach | **kontroferta** z konkretnymi liczbami |

3. **Ustępuje** (przed kontrofertą):

```text
żądanie -= (anchor - min) x (agent.concession + premia_po_blefie) / (rundy - 1) x clamp(0,4 + nastrój/80, 0,5, 1,3)
żądanie >= min        (AI: jednorazowo 0,7 rozpiętości)
```

Zły humor spowalnia ustępstwa, dobry przyspiesza. Rekin przy ostatniej rundzie zostaje ok. 25 % rozpiętości nad minimum.

**Kontroferta:** do oferty gracza dokłada poprawki, na których zawodnikowi zależy (rola, idealna długość, klauzula, prowizja agenta, łagodniejsza obniżka po spadku), a brakującą kwotę uzupełnia pensją (zaokrąglenie w górę do 100 zł). Chciwi i nastawieni na ostatni duży kontrakt biorą część różnicy jako premię za podpis (udział `clamp(1,5 x (signOnPref - 1), 0, 0,4)`, zaokrąglenie do 1 000 zł). Przyjęcie kontroferty bez zmian zawsze kończy się podpisem.

### 5.3 Blef agenta

- Raz na negocjacje agent może powiedzieć „Mamy na stole ofertę z innego klubu”. Gdy rywal naprawdę istnieje (`ctx.rival`), mówi to z szansą 60 % (prawda). Bez rywala blefuje z szansą `agent.bluff x (0,6 + 0,04 x (chciwość - 10))`.
- W rundzie, w której pada ta kwestia, agent nie ustępuje.
- `session.callBluff()` (nie zużywa rundy) kosztuje nastrój: `5 + 0,5 x max(0, ego - 10)`, +2 przy rekinie, +4 gdy oferta była prawdziwa (urażony brakiem zaufania).
- Zdemaskowany blef: żądanie spada o 25 % rozpiętości, a agent ustępuje szybciej (+0,3 do tempa).
- Prawdziwa oferta rywala: podnosi minimum już od otwarcia (rozdz. 4.2), skraca cierpliwość o rundę i co rundę obniża nastrój o 1,5.

### 5.4 Kwestie

Biblioteka `src/career/negotiationLines.js`: 128 kwestii w 29 kategoriach (otwarcie, akceptacja, kontroferta, kontroferta z premią, żądania 6 rodzajów, ultimatum, zerwanie, obraza, irytacja, cofnięcie, zadowolenie, blef, zdemaskowany blef, prawdziwa oferta, presja rywala, blokada, za wcześnie, odmowa przedłużenia, odmowa transferu, obietnice, prośba o transfer). Szablony: `{imie} {zawodnik} {klub} {kwota} {premia} {lata} {rola} {klauzula} {prowizja} {data} {rywal}`. Dobór ważony (`rng.weighted`): typ agenta (tylko jego kwestie, waga x2), nastrój (pasujący x3, inny x0,05), cechy (ego, temperament, spokój, chciwość, lojalność, wiek: pasujące x3, inne x0,3). Kwestie mają osobny strumień losowy, więc zmiana tekstów nie zmienia wyników negocjacji.

## 6. Przedłużenie kontraktu

- **Okno:** od 18 miesięcy przed końcem kontraktu. Wcześniej `tooEarly`, po końcu kontraktu tylko podpisanie jako wolny zawodnik.
- **Chęć pozostania:**

```text
w = willingnessToJoin({ from: klub, to: klub, ... })     reputacja zawodnika wobec obecnego klubu
chęć = 0,2 + 0,6 x w.score + 0,025 x (lojalność - 10) + 0,006 x (zaufanie - 50) - 0,12 x złamane_obietnice
       - 0,003 x uraza + 0,01 x (przywiązanie - 10) - 0,25 [mindset zagranica]
       - clamp((rep_rywala - rep_klubu) / 60, 0, 0,35) - 0,3 [niezadowolony] - 0,3 [prośba o transfer] + N(0; 0,04)
```

- **Odmowa przedłużenia:** chęć < 0,35 albo twarda odmowa z `willingnessToJoin` (zawodnik przerósł klub o ponad 30 pkt reputacji). Wynik `refuseRenew` niesie `outcome` z `renewRefused: true`; `applyOutcome` zapisuje pole w zawodniku, a `transferListCandidates` w `src/career/squad.js` dodaje powód „Nie przedłuży kontraktu”.
- **Siła przetargowa i lojalność:** rozdz. 4.1. Lojalny (18) przedłuża o ok. 15 % taniej niż najemnik (3) i ma niższe minimum.
- **Relacja z klubem:** zaufanie (0-100, start 50), uraza z wygaszaniem, liczba złamanych obietnic i historia ostatnich 8 rozmów w `player.relations[clubId]`.

## 7. Fiasko i blokada

Po zerwaniu (`outcome().lock`):

```text
obraza_końcowa = suma_obrazy + max(0, 30 - nastrój) / 100
x        = clamp(1,4 x obraza_końcowa + 0,025 x (ego - 10) + 0,02 x (temp. - 10) - 0,02 x (cierpliwość - 10) + 0,15 [nastrój < 10], 0, 1)
tygodnie = round(2 + 10 x x)                       2-12 tygodni
skrajne  = obraza_końcowa >= 0,5 albo (nastrój <= 3 i ego >= 15)
           -> blokada do późniejszej z dat: 12 tygodni albo koniec okna (podpisanie) / koniec sezonu (przedłużenie)
uraza   += 15 + 60 x obraza_końcowa                wygasa o połowę co 90 dni
```

| Skutek | Podpisanie | Przedłużenie |
|---|---|---|
| Blokada rozmów z tym klubem | tak | tak |
| Zaufanie | `-(5 + 20 x obraza)` | `-(8 + 30 x obraza)` |
| Morale | bez zmian | -3 (przy obrazie > 0,2: -4) |
| Prośba o transfer | nie | szansa `clamp(0,1 + 0,8 x obraza + 0,03 x (ambicja - 10) - 0,03 x (lojalność - 10) + 0,15 [nastrój < 15], 0, 0,9)`; ustawia `transferRequest`, `unhappy` i `renewRefused` |

Próba otwarcia rozmów przed końcem blokady zwraca `locked` z datą („do Sep 14, 2026”). Od dnia `lockUntil` można rozmawiać, ale uraza obniża startowy nastrój, skraca cierpliwość i podnosi oczekiwania.

Po udanych rozmowach: przedłużenie +3 morale i +5 zaufania, podpisanie +2 morale. Obraza w trakcie rozmów zostaje w pamięci także po podpisie (uraza `+min(20, 30 x obraza)`).

## 8. Obietnice

- Rola z oferty trafia do kontraktu: `contract.promise = { role, since, strikes, kept, broken }`.
- Co miesiąc `applyPromiseCheck(player, clubId, date, minutesShare)` porównuje udział w minutach (z meczów, w których zawodnik był dostępny) z progiem roli: kluczowy 70 %, podstawowy 55 %, rotacja 30 %, perspektywiczny 15 %, rezerwowy 5 %. Pierwszy miesiąc bez rozliczenia.
- Miesiąc powyżej progu: ostrzeżenie zdjęte (strikes - 1), zaufanie +1, co 6 takich miesięcy wiadomość „Klub dotrzymuje słowa”.
- Miesiąc poniżej 75 % progu: ostrzeżenie (strike), morale -0,5, wiadomość („Trenerze, obiecał pan mi rolę...”).
- Trzecie ostrzeżenie: **obietnica złamana**. Zaufanie -20, morale -3, `brokenPromises + 1`, a przy ambicji albo potrzebie gry >= 14 zawodnik jest niezadowolony (`unhappy`).
- Skutki w kolejnych negocjacjach z tym klubem: oczekiwania x(1 + 0,06 na obietnicę), nastrój -8, rundy -0,7, chęć pozostania -0,12 na obietnicę, a niższe zaufanie dokłada swoje.

## 9. Kluby AI

`aiNegotiate({ kind, player, club, fromClub, date, rng, budget })` używa tej samej sesji w trybie `ai`:

1. Otwarcie jak u gracza (te same odmowy i blokady, ta sama `willingnessToJoin`).
2. Oferta rynkowa: 97 % orientacyjnego żądania (nie więcej niż budżet), długość wg wieku (do 23: 4 lata, do 29: 3, do 32: 2, potem 1), oczekiwana rola, premia za gola wg pozycji, prowizja 7 %.
3. Zawodnik odpowiada akceptacją albo kontrofertą (bez blefu, żądań i ultimatum). Ustępstwo jednorazowe 0,7 rozpiętości.
4. Klub przyjmuje kontrofertę, jeśli mieści się w budżecie pensji i premii; inaczej podnosi pensję o 10 %. Druga runda jest ostateczna.

Wynik: `{ result: 'signed'|'failed'|'refused', rounds <= 2, contract, outcome }`. Fiasko AI też blokuje rozmowy z tym klubem, więc rynek jest spójny.

## 10. Dane i integracja

| Pole zawodnika | Zapisuje | Czyta |
|---|---|---|
| `traits`, `agent` | `generatePersonality` (przy generowaniu) | negocjacje, obietnice |
| `relations[clubId]` `{trust, grudge, grudgeDate, brokenPromises, lockUntil, lockReason, history[]}` | `applyOutcome`, `applyPromiseCheck` | `openNegotiation`, `canNegotiate` |
| `contract` (z `promise`, `clause`, `clauseForeignOnly`, `bonus`, `raise`, `relegationCut`, `agentFee`, `signOn`) | `applyOutcome` | gra, `applyPromiseCheck` |
| `renewRefused` | `applyOutcome` | `squad.js` (lista transferowa), `openNegotiation` |
| `transferRequest`, `unhappy` | `applyOutcome`, `applyPromiseCheck` | `squad.js`, `reputation.js` |
| `morale` | `applyOutcome`, `applyPromiseCheck` | silnik |
| `homeRegion` (opcjonalne) | generator | mindset „powrót do domu” (porównanie z `club.region`) |

Kontrakt: lata liczone w sezonach (koniec zawsze Jun 30). Podpis w trakcie sezonu liczy lata od następnego sezonu, ale nigdy ponad 5 lat od dnia podpisu.

Koszt: otwarcie rozmów to dwa wywołania `willingnessToJoin` i kilkanaście działań arytmetycznych, runda to kilka wycen oferty (każda ok. 30 działań). Relacje są w zawodniku, więc nic nie przeszukuje świata.

## 11. Przykłady

Liczby z prawdziwych przebiegów (`new Rng('przyklady')`). Wartości ukryte podane dla ilustracji; gracz ich nie widzi.

### 11.1 Weteran, wolny zawodnik: spokojna końcówka kariery

Marek Zieliński, 33 lata, obrońca, OVR 11,6, reputacja 44, Lider, agent z rodziny, ostatnia pensja 7 000 zł. Wieczysta Kraków, Jul 20, 2026. Mindset: spokojna końcówka (idealnie 2 lata, ceni premię za podpis). Ukryte: oczekiwania 6 165 zł, minimum 4 875 zł, pierwsze żądanie 6 411 zł, 6 rund, nastrój 72,9.

| Runda | Oferta klubu | Ocena | Odpowiedź |
|---|---|---|---|
| Otwarcie | | | „Dla nas najważniejsze, żeby Marek był szczęśliwy. Posłuchamy chętnie.” |
| 1 | 4 000 zł, 1 rok, rotacja, prowizja 8 000 zł | Weq 3 639 zł (0,59 T): obraza, nastrój 72,9 -> 65; za krótko | „Szczerze mówiąc, jest nam przykro. Liczyliśmy na więcej szacunku. Proponujemy 5 600 zł tygodniowo i premię za podpis 44 000 zł, umowa na 2 lata.” (prowizja 13 000 zł) |
| 2 | 4 600 zł, 1 rok | Weq 4 239 zł, krok +9,7 % T: nastrój 73; żądanie spada do 5 562 zł | „To już wygląda lepiej. Proponujemy 5 400 zł tygodniowo i premię za podpis 22 000 zł, umowa na 2 lata.” |
| 3 | kontroferta bez zmian: 5 400 zł, 2 lata, 22 000 zł, prowizja 13 000 zł | Weq 5 647 zł >= 5 562 zł | „Dziękujemy, to dobry krok. Marek zawsze marzył o tym klubie. Podpisujemy.” |

Wynik: kontrakt do Jun 30, 2028, obietnica roli „rotacja”, morale +2. Zawodnik wziął mniej niż ostatnio, bo chętnie przychodzi (wysoka chęć z `willingnessToJoin`), a jego agent ustępuje szybko.

### 11.2 Ambitny 23-latek z rekinem: blef sprawdzony

Kacper Wójcik, 23 lata, skrzydłowy, OVR 12,4, reputacja 47, Ambitny (chciwość 15, ambicja 17, ego 15), pensja 11 000 zł. Transfer z Radomiaka do Lecha, Aug 5, 2026, okno do Sep 1, 2026. Agent: twardy rekin. Mindset: budowanie kariery (chce klauzuli odstępnego, 3 lata). Oczekiwana rola: rotacja. Ukryte: oczekiwania 10 645 zł, minimum 9 111 zł, pierwsze żądanie 12 548 zł, tylko 3 rundy, nastrój 80,5.

| Runda | Oferta klubu | Ocena | Odpowiedź |
|---|---|---|---|
| Otwarcie | | | „Mój klient ma wielu chętnych. Słucham, co Lech Poznań ma do zaproponowania.” |
| 1 | 10 000 zł, 4 lata, rotacja, prowizja 30 000 zł, bez klauzuli | Weq 8 400 zł: brak klauzuli, za długo, za mała prowizja; żądanie 12 548 -> 10 872 zł | „Rozmowy idą dobrze. Zamknijmy temat przy 10 900 zł tygodniowo.” Kontroferta: 10 900 zł, 3 lata, klauzula 2 260 000 zł, prowizja 66 000 zł |
| 2 | 10 800 zł, 4 lata, prowizja 40 000 zł | Weq 9 315 zł, krok +8,6 % T: nastrój 87,7. Agent blefuje i nie ustępuje | „No proszę, jednak się da. (...) Dzwoniono do mnie dziś trzy razy. Inny klub da więcej.” |
| Sprawdzenie | `callBluff()` | blef: koszt nastroju 9,5 (ego +2,5, rekin +2); żądanie 10 872 -> 10 013 zł, szybsze ustępstwa | „Dobrze, nie ma innej oferty. Wróćmy do rozmów.” |
| 3 | 10 500 zł, 3 lata, klauzula 2 500 000 zł tylko dla klubów zagranicznych, prowizja 50 000 zł | Weq 10 094 zł >= 10 013 zł | „No proszę, jednak się da. Dobrze. Przygotujcie dokumenty, zanim zmienię zdanie.” |

Wynik: kontrakt do Jun 30, 2029 z klauzulą 2 500 000 zł (tylko zagranica). Klub oszczędził na pensji, bo dał to, na czym zawodnikowi zależało: klauzulę, 3 lata i prowizję. Sprawdzenie blefu było tanie, bo nastrój był wysoki.

### 11.3 Narwaniec przy przedłużeniu: fiasko i prośba o transfer

Dawid Mazur, 28 lat, napastnik, OVR 12,8, reputacja 50, Narwaniec (temperament 17, ego 16, cierpliwość 5, lojalność 7), bez agenta, pensja 14 000 zł, kontrakt do Jun 30, 2027. Jagiellonia, Dec 1, 2026 (7 miesięcy do końca), średnia ocena 7,2, 85 % minut. Mindset: ostatni duży kontrakt (5 lat, premia za podpis). Oczekiwana rola: kluczowy. Ukryte: oczekiwania 17 664 zł (siła przetargowa: forma, minuty), minimum 15 393 zł, pierwsze żądanie 18 558 zł, 4 rundy, nastrój 59,9.

| Runda | Oferta klubu | Ocena | Odpowiedź |
|---|---|---|---|
| Otwarcie | | | „Wiem, ile jestem wart. Proszę o poważną ofertę.” |
| 1 | 12 500 zł (obniżka), 2 lata, kluczowy | cash / T = 0,71 < próg 0,80: obraza 0,16, nastrój 59,9 -> 40,1 | „Słucham? To dla mnie obraźliwe. Pieniądze mają znaczenie: 15 500 zł tygodniowo i 345 000 zł na start.” (5 lat) |
| 2 | 12 600 zł | znowu obraza i drobny krok: nastrój 14,4 (obrażony) | „Czy pan wie, z kim rozmawia? To jest kpina. Zgodzę się na 15 100 zł tygodniowo, jeśli dostanę 286 000 zł za podpis.” |
| 3 | 12 700 zł | nastrój 0: zerwanie | „Czy pan wie, z kim rozmawia? To jest kpina. Nie pozwolę się tak traktować. Wychodzę. Proszę o wystawienie mnie na listę transferową. Zawodnik nie chce rozmawiać do Jun 30, 2027.” |

Wynik: suma obrazy ponad 0,5, więc blokada skrajna do końca sezonu (Jun 30, 2027), czyli do końca kontraktu: zawodnik odejdzie za darmo albo trzeba go sprzedać zimą. Uraza +61, zaufanie -31, morale -4, prośba o transfer (`transferRequest`, `unhappy`, `renewRefused`). Klub AI w tej sytuacji wystawiłby go na listę („Chce odejść”, „Nie przedłuży kontraktu”).

## 12. Do strojenia

- Ile negocjacji gracza kończy się podpisem przy rozsądnej grze (cel: ok. 70-80 %) i jak często AI podpisuje w 1. rundzie.
- Czy premie za podpis w mindsecie „ostatni duży kontrakt” nie są za wysokie wobec budżetów 1 i 2 Ligi.
- Ryzyko spadku z prognozy miejsca (rozdz. 9.7 eksperta) zamiast stałych 15 %.
- Widoczność cech po skautingu: przedziały zamiast liczb, jak przy atrybutach ukrytych.
