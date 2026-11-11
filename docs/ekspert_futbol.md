# Specyfikacja: lekka gra managerska (3 polskie ligi + puchary UEFA)

Wersja robocza, Nov 10, 2026. Wszystkie liczby to wartości startowe do balansu. Pozycje oznaczone "[SYM]" zostały sprawdzone symulacją referencyjną (30 000 meczów, skrypt `scratchpad/sim/engine.js`). Pozycje oznaczone "[SZAC]" to szacunki eksperckie, bez weryfikacji źródłowej w tej sesji.

Konwencje:
- Skala atrybutów 1-20, liczby zmiennoprzecinkowe w silniku, w UI zaokrąglone.
- "Punkt" = 1 jednostka skali atrybutu. Średni zawodnik 1 Ligi ma średnią wszystkich atrybutów ~10.
- Kod atrybutu = 3 litery (stałe w JSON-ie).

---

## 0. Dane referencyjne (cele kalibracji)

| Statystyka (na mecz, obie drużyny) | Cel | Wynik silnika [SYM] | Źródło celu |
|---|---|---|---|
| Gole | 2.70-2.80 | 2.72 | Ekstraklasa 2024/25: 843 gole w 306 meczach = 2.75 (Wikipedia) |
| Wygrane gospodarzy / remisy / wygrane gości | 45 / 27 / 28 % | 44.5 / 26.1 / 29.4 % | SoccerStats, pełny sezon Ekstraklasy: 45 / 28 / 27 % |
| Over 2.5 | ~52 % | 51 % | SoccerStats (j.w.) |
| Strzały | ~25 | 25.2 | [SZAC] typowo 24-26 w ligach europejskich |
| Strzały celne (z golami) | ~8.5-9 | 9.0 | [SZAC] |
| Rzuty rożne | ~9.5-10 | 10.1 | [SZAC] |
| Faule | ~25-28 | 26.1 | FotMob: drużyny Ekstraklasy 10-16 fauli/mecz |
| Żółte kartki | ~3.9-4.0 | 3.96 | 4score: 1.94 ŻK na drużynę (gospodarze 1.63, goście 2.22) |
| Czerwone kartki | 0.15-0.20 | 0.19 | [SZAC]; globalnie 0.25 (CIES, 87 lig, z dużym udziałem Ameryki Pd.) |
| Rzuty karne | 0.25-0.30 | 0.31 | CIES: zakres 0.23-0.45 w Europie, Polska w czołówce liczby karnych (2019) |
| Spalone | ~3.5-4.5 | 4.2 | [SZAC] |
| Udział goli w 2. połowie | ~54 % | 53 % | [SZAC] |

Uwaga: Ekstraklasa historycznie ma dużo karnych (CIES 2019). Domyślnie 0.30/mecz, z parametrem ligi `penMul` (Ekstraklasa 1.1, niższe ligi 1.0).

---

## 1. Atrybuty zawodnika

### 1.1 Lista (27 jawnych)

**Techniczne (9)**

| Kod | Nazwa | Opis / użycie w silniku |
|---|---|---|
| POD | Podania | celność i dobór podań; strefa MID, asysty |
| DRY | Drybling | mijanie rywala; przełamanie przy atakach skrzydłem, wywalczone karne |
| WYK | Wykończenie | konwersja sytuacji z pola karnego |
| DYS | Strzał z dystansu | konwersja akcji typu DYS |
| DOS | Dośrodkowania | jakość akcji SKR, asysty z boku |
| GLO | Gra głową | strzały głową, obrona dośrodkowań, stałe fragmenty |
| ODB | Odbiór | odbiór piłki, strefa DEF; mała szansa faulu przy dobrym ODB |
| TEC | Technika | przyjęcie, kontrola; odporność na pressing, słaba pogoda |
| SFR | Stałe fragmenty | rożne, wolne, karne (wykonawca) |

**Mentalne (8)**

| Kod | Nazwa | Opis |
|---|---|---|
| WIZ | Wizja | dostrzeganie podań; kluczowe podania, kontry |
| UST | Ustawianie się | pozycja w obronie (też u BR); przechwyty |
| DEC | Decyzje | wybór zagrania; mniej strat, szybsza adaptacja do zmian taktyki |
| OPA | Opanowanie | gra pod presją; wykończenie 1 na 1, karne, końcówki meczów |
| PRA | Pracowitość | bieganie bez piłki; pressing, wolniejszy spadek wkładu w obronie |
| AGR | Agresja | ostrość w pojedynkach; +siła obrony, +faule, +kartki |
| LID | Przywództwo | kapitan; tłumi spadek morale i spójności drużyny |
| RUC | Gra bez piłki | wychodzenie na pozycję; waga przy wyborze strzelca, spalone |

**Fizyczne (5)**

| Kod | Nazwa | Opis |
|---|---|---|
| SZY | Szybkość | sprint; kontry, gra przeciw wysokiej linii |
| WYT | Wytrzymałość | tempo spadku kondycji w meczu i regeneracja |
| SIL | Siła | pojedynki fizyczne, gra tyłem do bramki |
| ZWI | Zwinność | balans, zmiana kierunku; drybling, BR przy strzałach z bliska |
| SKO | Skoczność | pojedynki w powietrzu |

**Bramkarskie (5)** (u graczy z pola losowane osobno: N(4, 1.5), zakres 1-8)

| Kod | Nazwa | Opis |
|---|---|---|
| REF | Refleks | obrona strzałów |
| CHW | Chwytanie | pewność rąk; mniej dobitek i rożnych po obronie |
| WYJ | Gra na przedpolu | wyjścia do dośrodkowań; obrona rożnych |
| JNJ | Sam na sam | sytuacje 1 na 1, karne |
| NOG | Gra nogami | wznowienia; bonus do posiadania przy krótkich podaniach |

### 1.2 Atrybuty ukryte (gracz widzi tylko przybliżenie po skautingu)

| Kod | Nazwa | Skala | Działanie |
|---|---|---|---|
| POT | Potencjał | OVR docelowy 1-20 | sufit rozwoju (rozdz. 9.5) |
| ODP | Odporność na kontuzje | 1-20 | mnożnik ryzyka urazu `1.5 - 0.05*ODP` (ODP 10 -> 1.0, 20 -> 0.5) |
| PRF | Profesjonalizm | 1-20 | tempo rozwoju, wolniejszy spadek formy, mniej problemów z morale |
| WAZ | Ważne mecze | 1-20 | w meczach o randze >= 2: efektywność +0.04*(WAZ-10) pkt |
| KON | Konsekwencja | 1-20 | rozrzut formy meczowej: sigma = 0.9 - 0.035*KON pkt |
| TMP | Temperament | 1-20 | mnożnik kartek `0.7 + 0.03*TMP`; reakcja na krzyk trenera |

Osobowość (widoczna etykieta, losowana z TMP, PRF, LID): Spokojny, Ambitny, Wrażliwy, Lider, Narwaniec. Wpływa na reakcje na przemowy (rozdz. 5).

### 1.3 Poziom drużyny (L)

| Grupa | L (średnia) | Zakres klubów |
|---|---|---|
| Top UEFA (elita LM) | 15.5 | 15.0-16.5 |
| Mocny klub LM / czołówka LE | 14.0 | 13.5-14.8 |
| Średni klub LE/LKE z top-10 lig | 13.0 | 12.3-13.5 |
| Ekstraklasa | 11.5 | 10.8 (dół) - 12.6 (czołówka) |
| Słabszy rywal LKE (małe ligi) | 10.5 | 9.0-11.5 |
| 1 Liga | 10.0 | 9.3-10.8 |
| 2 Liga | 8.5 | 7.8-9.3 |

Struktura kadry (offset q względem L): podstawowa 11: +0.3; ławka (7): -0.5; reszta kadry: -1.0; młodzież (17-19 lat): -2.0. Kadra: 24-28 zawodników.

### 1.4 Algorytm losowania zawodnika

```js
// gauss(): Box-Muller, N(0,1)
const AGE_ADJ = {17:-2.5,18:-2.0,19:-1.5,20:-1.0,21:-0.6,22:-0.3,30:-0.1,31:-0.3,32:-0.6,33:-1.0,34:-1.4,35:-1.8};

function genPlayer(L, pos, age, slotOffset) {
  const q = L + slotOffset + gauss() * 0.9 + (AGE_ADJ[age] ?? 0);
  const p = { pos, age, attr: {} };
  for (const a of OUTFIELD_ATTRS) {
    let v = q + (OFF[pos][a] ?? 0) + gauss() * 1.3;
    if (['SZY','ZWI','WYT'].includes(a) && age > 29) v -= 0.3 * (age - 29);
    if (['DEC','OPA','UST','LID'].includes(a)) v += Math.max(-1, Math.min(1.2, 0.15 * (age - 24)));
    p.attr[a] = clamp(Math.round(v), 1, 20);
  }
  for (const a of GK_ATTRS) {
    p.attr[a] = pos === 'BR'
      ? clamp(Math.round(q + (OFF.BR[a] ?? 0) + gauss() * 1.2), 1, 20)
      : clamp(Math.round(4 + gauss() * 1.5), 1, 8);
  }
  p.hidden = {
    POT: age < 24 ? Math.min(20, ovr(p) + (24 - age) * rand(0.15, 0.6) + gauss() * 0.5) : ovr(p) + rand(0, 0.5),
    ODP: clamp(Math.round(10 + gauss() * 3.5), 1, 20),
    PRF: clamp(Math.round(10 + gauss() * 3.5), 1, 20),
    WAZ: clamp(Math.round(10 + gauss() * 3), 1, 20),
    KON: clamp(Math.round(10 + gauss() * 3 + (age - 25) * 0.15), 1, 20),
    TMP: clamp(Math.round(10 + gauss() * 3.5), 1, 20),
  };
  return p;
}
```

Gwarancje struktury kadry: min. 3 BR, 7 obrońców (w tym 2 BO lewych/prawych), 8 pomocników, 4 napastników. Noga: 74 % prawa, 20 % lewa, 6 % obie. Na lewych pozycjach (BO-L, WB-L, SP-L) losuj lewą nogę z p = 0.65.

### 1.5 Profile pozycji (offset atrybutu)

Symbole: `++` = +3.0, `+` = +1.5, `-` = -1.5, `--` = -3.0, brak = 0. Pozycje: BR, ŚO, BO (L/P), WB (wahadłowy L/P), DP, ŚP, OP, SP (boczny pomocnik L/P), SN (skrzydłowy napastnik L/P), NAP.

| Poz. | ++ | + | - | -- |
|---|---|---|---|---|
| BR | REF, UST, JNJ | CHW, WYJ, OPA, DEC, NOG | POD, TEC | WYK, DRY, DYS, DOS, ODB, SFR, RUC |
| ŚO | ODB, UST, GLO | SIL, SKO, DEC, OPA, AGR | DRY, DOS, SFR, WIZ, DYS | WYK, RUC |
| BO | ODB, SZY, WYT | DOS, UST, PRA, POD | GLO, SFR, WIZ | WYK |
| WB | WYT, SZY, DOS | PRA, ODB, DRY, POD | GLO, SIL, UST | WYK |
| DP | ODB, UST, POD | DEC, PRA, WYT, SIL, AGR | DRY, SZY, RUC | WYK |
| ŚP | POD, DEC, TEC | WIZ, PRA, WYT, OPA | GLO, SKO, SIL | - |
| OP | WIZ, TEC, POD | DRY, DYS, RUC, DEC, OPA, SFR | ODB, SIL, SKO, UST | - |
| SP | DOS, SZY, DRY | WYT, TEC, POD, PRA | GLO, SIL, UST | - |
| SN | DRY, SZY, RUC | WYK, TEC, ZWI, OPA | ODB, GLO, UST | - |
| NAP | WYK, RUC, OPA | GLO, SIL, TEC, SZY, SKO | ODB, WIZ, DOS, UST | - |

Profile wariantowe (losowane z p=25 % dla danej pozycji, zastępują 2 atrybuty `++`): NAP "wieżowiec" (GLO, SIL ++, SZY -), NAP "lis" (RUC, OPA ++, SIL -), ŚO "rozgrywający" (POD ++, SIL 0), BR "libero" (NOG ++, WYJ ++), OP "strzelec" (DYS ++).

### 1.6 OVR (ocena ogólna, zależna od pozycji)

Wagi OVR wynikają z profilu: `++` waga 4, `+` waga 2, atrybut neutralny waga 1, `-` i `--` waga 0. Dla BR liczone są tylko atrybuty bramkarskie, UST, DEC, OPA (wagi wg profilu).

```js
function ovr(p, pos = p.pos) {
  let sw = 0, sv = 0, so = 0;
  for (const a of attrsFor(pos)) {
    const off = OFF[pos][a] ?? 0;
    const w = off >= 3 ? 4 : off > 0 ? 2 : off === 0 ? 1 : 0;
    sw += w; sv += w * p.attr[a]; so += w * off;
  }
  return +(sv / sw - so / sw).toFixed(1); // minus B_pos: OVR ~ q, porównywalny między pozycjami
}
```

Skutek: średni OVR podstawowej jedenastki ~ L + 0.3. Przeciętny zawodnik 1 Ligi: OVR ~10, Ekstraklasy ~11.5, gwiazda Ekstraklasy 13.5-14.5, gwiazda elity UEFA 17-18. W UI: OVR z jedną cyfrą po przecinku plus 1-5 gwiazdek względem ligi (gwiazdki = kwantyl OVR w lidze).

---

## 2. Dane zawodnika (stan)

### 2.1 Struktura

```js
const player = {
  id: 1234, name: 'Jan Kowal', age: 24, birthDay: 112, nat: 'POL', nat2: null,
  pos: 'ŚP', alt: { DP: 85, OP: 70 },  // biegłość 0-100 na innych pozycjach
  foot: 'P', weakFoot: 8,             // 1-20, kara do strzału słabszą nogą
  attr: { /* 27 */ }, hidden: { /* POT, ODP, PRF, WAZ, KON, TMP */ }, persona: 'Ambitny',
  form: [6.8, 7.2, 6.1, 7.0, 6.5],    // 5 ostatnich ocen
  morale: 12,         // 1-20
  fresh: 94,          // świeżość między meczami 0-100 (start kondycji w meczu)
  sharp: 80,          // ostrość meczowa 0-100
  load14: 540,        // minuty w ostatnich 14 dniach
  injury: null,       // { type, days, playable: false, aggravate: 0 }
  susp: { league: 0, cup: 0, uefa: 0 }, yc: { league: 3, cup: 0, uefa: 1 },
  season: { apps: 12, subs: 3, min: 1010, g: 2, a: 4, xg: 1.8, sh: 14, yc: 3, rc: 0, rating: 6.92, motm: 1, cs: 0 },
  career: [ /* {season, club, apps, g, a, rating} */ ],
  contract: { wage: 9500, until: '2028-06-30', clause: 2400000, bonusGoal: 1000, signOn: 0 },
  value: 820000, scoutedLevel: 2,     // 0-3, dokładność widoku ukrytych
};
```

### 2.2 Narodowości [SZAC]

| Liga | Polacy | Obcokrajowcy | Rozkład obcokrajowców |
|---|---|---|---|
| Ekstraklasa | 52 % | 48 % | Bałkany (HR, SRB, SLO, BIH, MKD, MNE) 20 %, Hiszpania 10 %, Portugalia 9 %, Słowacja 8 %, Zach. Europa (NL, BE, DE, AT, FR) 9 %, Afryka (NGA, GHA, CMR, SEN, CIV) 9 %, Ameryka Pd. (BRA, ARG, COL) 7 %, Ukraina 6 %, Skandynawia 6 %, Czechy 4 %, Gruzja 4 %, Bałtyk/Białoruś 4 %, inne 4 % |
| 1 Liga | 78 % | 22 % | Ukraina 20 %, Słowacja 15 %, Hiszpania 15 %, Bałkany 15 %, Afryka 12 %, Czechy 8 %, Bałtyk/Białoruś 8 %, inne 7 % |
| 2 Liga | 92 % | 8 % | Ukraina 40 %, Białoruś/Bałtyk 20 %, Słowacja/Czechy 20 %, inne 20 % |

Obcokrajowiec przy generowaniu: q +0.3 w Ekstraklasie (kluby sprowadzają tylko lepszych), +0.5 w 1L. Kluby UEFA: 70 % zawodników z kraju klubu, reszta wg puli regionalnej. Nazwiska: pule imion i nazwisk per kraj (po ~150 pozycji, ~40 KB łącznie).

### 2.3 Forma, morale, świeżość, ostrość

| Pole | Zakres | Zmiana | Wpływ na efektywność (pkt atrybutu) |
|---|---|---|---|
| Forma | średnia z 5 ocen | po każdym meczu | `clamp(0.25*(avg5 - 6.6), -0.5, +0.5)` |
| Morale | 1-20 | rozdz. 9.7 | `0.04*(morale - 10)` (zakres -0.36..+0.4) |
| Świeżość | 0-100 | regeneracja +18/dzień * `(0.8 + 0.02*WYT)` * wiekMul (31+: 0.85); trening intensywny -5/dzień | start kondycji w meczu |
| Ostrość | 0-100 | +15 za 90 min (proporcjonalnie), +3 za dzień treningu, -2/dzień bez meczu | `< 60: -0.02*(60 - sharp)` (max -0.6) |
| Obciążenie (load14) | minuty | suma 14 dni | `> 900` min: ryzyko urazu x1.3, forma -0.2 |

### 2.4 Kontrakt i wartość

Pensja startowa (EUR/mies., bilans gry [SZAC]): `wage = 1200 * exp(0.45*(OVR - 8)) * ligaMul` (Ekstraklasa 1.0, 1L 0.55, 2L 0.3; obcy +15 %). OVR 10 -> ~2 900, 11.5 -> ~5 800, 13 -> ~11 300, 15 -> ~28 000.

Klauzula: 0 (brak) w 60 % kontraktów, w pozostałych `2.5-4 * value`.

Wartość rynkowa (EUR):

```text
value = 25000 * exp(0.6*(OVR - 8)) * ageMul * contractMul * leagueMul * formMul
ageMul:      <=21: min(2.0, 1 + 0.12*(POTvis - OVR)); 22-26: 1.1; 27-29: 0.9; 30: 0.75; 31: 0.6; 32: 0.45; 33+: 0.3
contractMul: <6 mies.: 0.4; 6-12: 0.7; 12-24: 0.9; >24: 1.0
leagueMul:   Ekstraklasa 1.0; 1L 0.6; 2L 0.35; klub UEFA: 1.0-2.5 wg kraju
formMul:     1 + 0.1*(avg5 - 6.6), zakres 0.85-1.15
```

Przykłady: OVR 10 -> 83k; 11.5 -> 204k; 13 -> 502k; 14 -> 912k; 16 -> 3.0 mln (przed mnożnikami).

### 2.5 Pozycje alternatywne i kara za pozycję

Biegłość 0-100 na każdej pozycji. Naturalna = 100. Losowane alternatywy wg pokrewieństwa:

| Pozycja | Pokrewne (biegłość start 60-90) |
|---|---|
| ŚO | DP, BO |
| BO | WB, SP, ŚO |
| WB | BO, SP |
| DP | ŚP, ŚO |
| ŚP | DP, OP |
| OP | ŚP, SN, NAP |
| SP | SN, WB, OP |
| SN | SP, NAP, OP |
| NAP | SN, OP |

Mnożnik efektywności pozycji: `posEff = 0.70 + 0.30 * (biegłość/100)`; pozycja spoza listy: biegłość 0 -> 0.70; zawodnik z pola w bramce: oceny BR liczone z jego atrybutów bramkarskich (1-8), bez dodatkowej kary. Strona boiska: gra na przeciwnej flance -5 biegłości (prawonożny na lewym skrzydle SN: 0, bo schodzi do strzału). Biegłość rośnie +2 za mecz na pozycji, +1 za tydzień treningu taktycznego.

---

## 3. Dziesięć formacji

Współrzędne: `x` 0-100 szerokość (0 = lewa linia boczna), `y` 0-100 długość (0 = własna linia bramkowa), drużyna atakuje w górę. Gość: `x' = 100 - x`, `y' = 100 - y`. Kolejność slotów: BR, obrona od lewej, pomoc od lewej, atak od lewej.

| # | Nazwa | Ustawienie (rola: x,y) |
|---|---|---|
| 1 | 4-4-2 "Dwie Linie" | BR 50,5; BO 15,25; ŚO 38,21; ŚO 62,21; BO 85,25; SP 15,50; ŚP 40,47; ŚP 60,47; SP 85,50; NAP 40,75; NAP 60,75 |
| 2 | 4-3-3 "Trójząb" | BR 50,5; BO 15,26; ŚO 38,21; ŚO 62,21; BO 85,26; DP 50,38; ŚP 32,52; ŚP 68,52; SN 15,74; NAP 50,80; SN 85,74 |
| 3 | 4-2-3-1 "Parasol" | BR 50,5; BO 15,26; ŚO 38,21; ŚO 62,21; BO 85,26; DP 40,39; DP 60,39; SP 15,62; OP 50,62; SP 85,62; NAP 50,82 |
| 4 | 4-1-4-1 "Kurtyna" | BR 50,5; BO 15,25; ŚO 38,21; ŚO 62,21; BO 85,25; DP 50,36; SP 15,55; ŚP 38,54; ŚP 62,54; SP 85,55; NAP 50,78 |
| 5 | 4-4-2 "Diament" | BR 50,5; BO 15,26; ŚO 38,21; ŚO 62,21; BO 85,26; DP 50,36; ŚP 30,50; ŚP 70,50; OP 50,63; NAP 40,80; NAP 60,80 |
| 6 | 3-5-2 "Wahadło" | BR 50,5; ŚO 28,22; ŚO 50,19; ŚO 72,22; WB 10,48; DP 50,39; ŚP 33,53; ŚP 67,53; WB 90,48; NAP 40,78; NAP 60,78 |
| 7 | 3-4-3 "Wysoki Trójkąt" | BR 50,5; ŚO 28,24; ŚO 50,21; ŚO 72,24; WB 12,50; ŚP 38,47; ŚP 62,47; WB 88,50; SN 18,75; NAP 50,82; SN 82,75 |
| 8 | 5-3-2 "Bunkier" | BR 50,5; WB 12,30; ŚO 30,20; ŚO 50,17; ŚO 70,20; WB 88,30; ŚP 30,45; DP 50,40; ŚP 70,45; NAP 42,70; NAP 58,70 |
| 9 | 5-4-1 "Mur" | BR 50,5; WB 12,26; ŚO 30,19; ŚO 50,17; ŚO 70,19; WB 88,26; SP 15,45; ŚP 40,42; ŚP 60,42; SP 85,45; NAP 50,68 |
| 10 | 4-3-2-1 "Choinka" | BR 50,5; BO 15,26; ŚO 38,21; ŚO 62,21; BO 85,26; DP 50,38; ŚP 30,46; ŚP 70,46; OP 37,64; OP 63,64; NAP 50,82 |

Warianty 4-4-2 (te same role co nr 1, inne linie i efekty, szczegóły i kalibracja: `docs/taktyka-i-urazy.md`):

| # | Nazwa | Ustawienie (rola: x,y) |
|---|---|---|
| 11 | 4-4-2 defensywne "Niski Blok" | BR 50,5; BO 18,19; ŚO 39,16; ŚO 61,16; BO 82,19; SP 21,37; ŚP 41,35; ŚP 59,35; SP 79,37; NAP 45,58; NAP 57,66 |
| 12 | 4-4-2 ofensywne "Wysokie Skrzydła" | BR 50,5; BO 13,33; ŚO 38,26; ŚO 62,26; BO 87,33; SP 12,62; ŚP 40,52; ŚP 60,52; SP 88,62; NAP 40,83; NAP 60,83 |

Animacja na boisku: pozycja ikony = slot + przesunięcie fazy. Drużyna przy piłce: `y += 8 * (1 + 0.5*nastawienie)` (ograniczone do 92), drużyna broniąca: `y -= 6`, szerokość broniącej x 0.85 wokół x=50. Ikony interpolowane liniowo (lerp 0.1 na klatkę), piłka skacze do wykonawcy zdarzenia. Koszt: 23 elementy DOM/canvas, bez fizyki.

### 3.1 Modyfikatory formacji dla silnika

Siły stref wynikają z ról (rozdz. 6.1), więc liczba obrońców i pomocników działa sama. Tabela dodaje cechy strukturalne:

| # | Szer. (W) | Mnożniki typów akcji POZ/SKR/KON/DYS | Podatność na kontry rywala (x KON rywala) | Inne |
|---|---|---|---|---|
| 1 Dwie Linie | 1.0 | 1.0 / 1.15 / 1.10 / 1.0 | 1.00 | przeciw 3 środkowym pomocnikom: posiadanie logit -0.10 |
| 2 Trójząb | 1.0 | 1.05 / 1.10 / 1.0 / 0.95 | 1.10 | pressing x1.10 skuteczniej; zmęczenie SN x1.1 |
| 3 Parasol | 0.9 | 1.10 / 1.0 / 1.0 / 1.05 | 0.95 | najbardziej zrównoważona, brak kar |
| 4 Kurtyna | 0.9 | 0.95 / 1.0 / 1.05 / 1.05 | 0.90 | NAP izolowany: przełamanie POZ -0.10 jeśli NAP SIL < 12 |
| 5 Diament | 0.6 | 1.20 / 0.70 / 1.0 / 1.05 | 1.00 | posiadanie logit +0.10; rywal z W >= 1.0: jego SKR przełamanie +0.25 |
| 6 Wahadło | 0.9 | 1.05 / 1.05 / 1.05 / 1.0 | 1.05 | zmęczenie WB x1.25; przeciw formacji z 2 NAP: obrona +0.2 |
| 7 Wysoki Trójkąt | 1.2 | 1.0 / 1.20 / 1.05 / 0.9 | 1.20 | rywal z 3 środkowymi: posiadanie logit -0.10 |
| 8 Bunkier | 0.8 | 0.85 / 0.9 / 1.25 / 0.9 | 0.80 | własne akcje x0.92 |
| 9 Mur | 0.9 | 0.80 / 0.9 / 1.20 / 0.95 | 0.75 | własne akcje x0.85; obrona stałych fragmentów +0.3 |
| 10 Choinka | 0.5 | 1.15 / 0.65 / 1.0 / 1.15 | 1.00 | rywal z W >= 1.0: jego SKR przełamanie +0.30 |

Zasada szerokości: przełamanie SKR atakującego `+0.25*(W_atak - W_obrona)`. Przewaga w środku: `posLogit += 0.08*(środkowiA - środkowiB)` (środkowi = DP, ŚP, OP).

---

## 4. Instrukcje meczowe

Każda instrukcja to mnożniki/przesunięcia parametrów z rozdz. 6. Oznaczenia: `pAct` = szansa akcji, `brk` = logit przełamania, `pos` = logit posiadania, `D` = siła obrony (pkt), `fat` = tempo zmęczenia.

### 4.1 Tabela efektów

| Instrukcja | Opcja | Efekt w silniku | Koszt |
|---|---|---|---|
| Podania | Krótkie | pos +0.15; POZ x1.20, SKR x0.90, DYS x0.90, KON x0.85; brk +0.05*(TEC_śr - 11) | przy pressingu rywala i TEC_śr < 11: rywal dostaje akcję KON z p=0.03/min |
| | Mieszane | brak | brak |
| | Długie | pos -0.15; KON x1.25, SKR x1.10, POZ x0.85; brk +0.05*((GLO+SIL)/2 napastników - 11) | fat pomocników x0.92 |
| Krycie | Strefowe | obrona stałych fragmentów +0.3; przeciw RUC rywala >= 13: D -0.15 | brak |
| | Indywidualne | D +0.25 przeciw POZ; D -0.25 przeciw KON i SKR (rozbijanie struktury) | fat x1.10; faule x1.10 |
| Pressing | Niski | pos rywala +0.10; pAct rywala x1.0; własne KON x1.15 | fat x0.90 |
| | Średni | brak | brak |
| | Wysoki | pos rywala -0.12; pAct rywala x0.92; po odbiorze własna akcja POZ z brk +0.3 (p=0.04/min) | fat x1.20; faule x1.12 |
| Linia obrony | Niska | KON rywala x0.70; DYS rywala x1.25; spalone rywala x0.6 | brak |
| | Średnia | brak | brak |
| | Wysoka | KON rywala x1.35, jego brk KON +0.04*(SZY_nap_rywala - SZY_ŚO_własnych); spalone rywala x1.5; pAct rywala x0.95 | ryzyko czerwonej (faul taktyczny) x1.3 |
| Tempo | Wolne | pAct x0.88; pAct rywala x0.94 | fat x0.92 |
| | Normalne | brak | brak |
| | Szybkie | pAct x1.10; brk -0.08; pAct rywala x1.04 (otwarty mecz) | fat x1.12 |
| Kontratak | Tak | KON x1.6 gdy rywal ma nastawienie >= +1 lub wysoką linię, inaczej x1.2; POZ x0.95 | brak |
| Nastawienie (a) | -2..+2 | pAct x(1 + 0.10*a); D własne -0.30*a; podatność na KON x(1 + 0.12*a) | a = +2: fat x1.08 |
| Agresja w odbiorze | Łagodna | faule x0.80; ŻK/faul x0.80; CK/faul x0.70; D -0.20; ryzyko urazu rywala x0.85; karne x0.85 | brak |
| | Normalna | brak | brak |
| | Twarda | faule x1.30; ŻK/faul x1.25; CK/faul x1.60; D +0.25; uraz rywala x1.30; karne x1.20 | morale rywala -1 przy kontuzji |
| Gra na czas | Wł. (tylko przy prowadzeniu) | pAct x0.80; pAct rywala x0.92; doliczony czas +1..2 min; ŻK za grę na czas p=0.004/min | po 2. ostrzeżeniu sędzia dolicza kolejną minutę |

Nastawienie: -2 "Zamurowanie", -1 "Ostrożnie", 0 "Równowaga", +1 "Do przodu", +2 "Wszystko do ataku".

### 4.2 Kontry (miękki papier-kamień-nożyce)

Efekt kontry to bonus `k` dodawany do `brk` atakującego (lub `D` broniącego), skalowany jakością warunku. Maksimum +/-0.5, żeby gorsza drużyna z dobrą taktyką nie wygrywała z dużo lepszą.

| Wygrywa | Z | Bonus | Warunek jakości (skalowanie 0-1) |
|---|---|---|---|
| Wysoki pressing | Krótkie podania | rywal brk -0.30, strata -> KON | `(12 - TEC_śr_rywala)/3`, gdy TEC_śr < 12 |
| Krótkie podania | Wysoki pressing | brk +0.35 (przełamany pressing) | `(TEC_śr - 12)/3`, gdy TEC_śr >= 12 |
| Długie podania | Wysoki pressing | KON x1.3 | zawsze 1.0 |
| Niska linia + strefa | Długie podania | rywal brk -0.25 | `(GLO_ŚO_śr - GLO_nap_rywala + 3)/6` |
| Kontratak | Wysoka linia / nastawienie +1, +2 | brk KON +0.40 | `(SZY_atak - SZY_obrona_rywala + 3)/6` |
| Niska linia + wolne tempo | Kontratak | KON rywala x0.7 | 1.0 |
| Krycie indywidualne | Atak pozycyjny bez dryblingu | rywal brk POZ -0.25 | `(12 - DRY_śr_rywala)/3` |
| Krycie strefowe | Ruchliwi napastnicy | rywal brk -0.20 | `(RUC_nap_rywala - 11)/4` |
| Szeroka formacja (W >= 1.0) | Wąska (W <= 0.6) | SKR brk +0.25..0.30 | wg tabeli 3.1 |
| Wąska formacja | Formacja z 2 w środku | pos +0.16 | liczba środkowych |
| Twarda agresja | Drybling (DRY_śr >= 13) | rywal brk -0.20 | kosztem fauli i karnych |
| Drybling | Łagodna agresja | brk +0.20, karny x1.2 | `(DRY_śr - 11)/4` |

### 4.3 Bezwładność taktyczna i spójność

Każda drużyna ma spójność `S` (0-100, start = min(100, 70 + 0.3*zgranie)).

```js
// zmiana instrukcji w minucie t0
function applyChange(team, newTac, t0) {
  team.tacOld = team.tacCur; team.tacNew = newTac; team.t0 = t0;
  const adapt = 6 - 0.2 * (team.avgDEC - 10) - (team.familiarity[newTac.formation] - 50) / 25; // 3-8 min
  team.tAdapt = clamp(adapt, 3, 8);
  let cost = 0;
  for (const k of CHANGED_KEYS(team.tacOld, newTac)) cost += (k === 'formation') ? 10 : 5;
  if (t0 - team.lastChange < 10) cost *= 2;          // nerwowe przestawianie
  if (isHalfTime(t0) || isPreMatch(t0)) cost = 0, team.tAdapt = 0; // przerwa: za darmo i od razu
  team.S = Math.max(30, team.S - cost); team.lastChange = t0;
}
// co minutę
w = team.tAdapt ? Math.min(1, (t - team.t0) / team.tAdapt) : 1;
param = lerp(param(tacOld), param(tacNew), w);         // każdy mnożnik/przesunięcie
team.S = Math.min(Smax, team.S + 1 + 0.05 * (team.avgLID - 10));
spojnoscKara = (100 - team.S) * 0.015;                 // pkt, odejmowane od ATT, MID, DEF (max ~1.0)
```

Skutek: jedna zmiana kosztuje -5 S (kara -0.075 pkt, znika po ~5 min). Trzy zmiany w 10 minut: ok. -30 S i -0.45 pkt na ~25 min. Zmiana formacji w trakcie: -10 S plus 3-8 min mieszania. AI podlega tym samym regułom. Zmiany personalne (wejście rezerwowego) nie kosztują S, chyba że zmieniają formację.

---

## 5. Motywacja w meczu

### 5.1 Zaangażowanie

Każdy zawodnik ma zaangażowanie `Z` w zakresie -10..+10 (start 0). Efekt: `eff += 0.035*Z` pkt (max +/-0.35), agresja efektywna `AGR + 0.15*Z`, ryzyko ŻK `x(1 + 0.03*max(0, Z))`. Zanik: `Z *= 0.97` co minutę (połowa po ~23 min). Przemowa w przerwie ustawia nowy poziom.

### 5.2 Przemowy (przed meczem i w przerwie)

Bazowy efekt `Z` zależy od stanu meczu (prowadzimy / remis / przegrywamy) i osobowości. Wartości dla zawodnika typu Spokojny / Ambitny / Wrażliwy / Lider / Narwaniec:

| Przemowa | Prowadzimy | Remis | Przegrywamy | Modyfikator osobowości |
|---|---|---|---|---|
| Spokój ("Trzymamy plan") | +2 | +2 | 0 | Wrażliwy +2, Narwaniec -1 |
| Pochwała | +4 | +1 | -2 (rozluźnienie) | Ambitny -1 (chce więcej), Wrażliwy +2 |
| Wymagam więcej | +1 | +4 | +4 | Ambitny +2, Wrażliwy -3 |
| Krzyk / złość | -2 | +2 | +6 | Narwaniec +2 i TMP: ryzyko ŻK x1.3 do 60'; Wrażliwy -5; Lider +1 |
| Bez presji ("Nie macie nic do stracenia") | -1 | +1 | +3 (gdy przegrywamy 2+) | wobec faworyta rywala +2 |
| Skupienie na obronie | +3 i D +0.1 przez 15 min | +1 | -2 | Spokojny +1 |

Losowość: `Z_final = Z + gauss()*1.5`. Wielokrotne użycie tej samej przemowy w kolejnych meczach: efekt x0.8 za każde powtórzenie (pamięć 3 meczów). Przed meczem dochodzi ranga: derby/finał `+2` do wszystkich efektów pozytywnych, ale dla Wrażliwych `-2` (presja), chyba że WAZ >= 14.

### 5.3 Okrzyki z linii bocznej

Odstęp min. 8 minut (cooldown). Działa 8 minut z wygaszaniem liniowym.

| Okrzyk | Efekt | Ryzyko |
|---|---|---|
| "Naprzód!" | pAct x1.06, D -0.10 | brak |
| "Uwaga z tyłu!" | D +0.15, pAct x0.95 | brak |
| "Spokojnie!" | Z -2 u zawodników z Z > 4; ŻK x0.8 | brak |
| "Więcej walki!" | Z +2; faule x1.1 | ŻK x1.15 |
| "Brawo!" (po golu/dobrej akcji) | Z +1, morale +0.3 | po 2 użyciach w meczu brak efektu |
| "Do sędziego" (protest) | 30 %: następny sporny faul na korzyść; 15 %: ŻK dla trenera (brak efektu na boisku, kara finansowa) | 3 % wyrzucenie trenera na trybuny: brak okrzyków do końca |

### 5.4 Reakcje automatyczne

- Stracony gol: `Z += -1` (Wrażliwy -3, Lider 0, Narwaniec +1 i AGR +2 na 10 min).
- Strzelony gol: `Z += +1`; po golu w 85'+ u drużyny prowadzącej odruch "cofnięcia" (D +0.15, pAct x0.9) na 5 min, chyba że nastawienie >= +1.
- Czerwona kartka dla kolegi: Lider w składzie: `Z +2` dla wszystkich; bez lidera: `Z -1`.
- Kapitan (najwyższe LID na boisku): tłumi spadki `Z` o `0.04*(LID-10)` na zdarzenie.

---

## 6. Silnik meczowy

### 6.1 (a) Siły stref przed meczem

Oceny zawodnika w strefach:

```text
R_DEF = (3*ODB + 3*UST + 1.5*GLO + SIL + SZY + DEC + 0.5*OPA + 0.5*SKO + 0.5*AGR) / 12
R_MID = (3*POD + 2*DEC + 2*TEC + 1.5*WIZ + 1.5*PRA + WYT + ODB + 0.5*UST) / 12.5
R_ATT = (3*WYK + 2*RUC + 1.5*TEC + 1.5*DRY + 1.5*SZY + OPA + GLO + 0.5*DYS + 0.5*ZWI + 0.5*DOS) / 13
R_GK  = (3*REF + 2*UST + 1.5*CHW + 1.5*JNJ + WYJ + OPA) / 10
```

Udział roli w strefach `c[rola][strefa]`:

| Rola | DEF | MID | ATT |
|---|---|---|---|
| ŚO | 1.00 | 0.10 | 0 |
| BO | 0.80 | 0.30 | 0.10 |
| WB | 0.60 | 0.40 | 0.20 |
| DP | 0.45 | 0.75 | 0 |
| ŚP | 0.20 | 0.85 | 0.15 |
| OP | 0 | 0.55 | 0.60 |
| SP | 0.15 | 0.60 | 0.45 |
| SN | 0 | 0.30 | 0.90 |
| NAP | 0 | 0.10 | 1.10 |

```text
shift_p = forma + morale + ostrość + Z + kondycja + WAZ + dayForm   // przesunięcie w pkt
R'_p,z  = posEff_p * R_p,z + shift_p                              // posEff mnoży, shift dodaje
Z_z     = Σ c[p][z] * R'_p,z / N_z    gdzie N_DEF = 4.3, N_MID = 3.9, N_ATT = 3.4
GK      = R'_bramkarza
SPA     = 0.5 * śr(top3 (GLO+SKO)/2 z pola) + 0.5 * SFR najlepszego wykonawcy      // stałe fragmenty w ataku
SPD     = śr(top4 (GLO+SKO+UST)/3) * 0.7 + 0.3 * WYJ bramkarza                     // w obronie
FIN_p   = 0.6*WYK + 0.25*OPA + 0.15*TEC     (głowa: GLO zamiast WYK; DYS dla akcji DYS)
```

Pochodne do pojedynku akcji:
```text
ATTmix = 0.55*ATT + 0.45*MID          DEFmix = 0.65*DEF + 0.35*MID
Δ      = ATTmix_atak - DEFmix_obrona  (+ bonusy instrukcji i kontr, - kara spójności)
```

Przeliczanie stref: przed meczem, co 5 minut (zmęczenie), po każdej zmianie składu, kartce, kontuzji. Gra w osłabieniu: każdy brakujący zawodnik `-0.9` pkt do ATT, MID, DEF (plus naturalny ubytek z sumy ról).

### 6.1 (b) Modyfikatory

| Czynnik | Wartości [SYM dla atutu boiska] |
|---|---|
| Atut własnego boiska | pAct gospodarza x1.15, gościa x0.90; pos logit +0.02; ŻK/faul gospodarz x0.88, gość x1.15. Skalowane frekwencją: `hfa = 0.7 + 0.3*zapełnienie`. Teren neutralny: 1.0 / 1.0 |
| Deszcz | posK x0.85; DYS x1.15; trafienie z xG x1.06 (śliska piłka); faule x1.08; urazy x1.05 |
| Śnieg | pAct x0.92; brk POZ -0.10; fat x1.10; urazy x1.10 |
| Upał (> 28°C) | fat x1.30; tempo szybkie dodatkowo fat x1.15; pAct po 60' x0.95 |
| Mróz (< -5°C) | urazy mięśniowe x1.15 |
| Silny wiatr | xG DYS x0.85; brk SKR -0.10; długie podania brk -0.10 |
| Murawa | doskonała: krótkie podania brk +0.05; zła/błoto: krótkie brk -0.15, fat x1.15, urazy x1.20; sztuczna: urazy x1.10 dla gości |
| Ranga meczu (0-3) | 0 liga, 1 puchar krajowy, 2 derby / mecz o tytuł / UEFA, 3 finał. Ranga >= 2: faule x1.10, ŻK/faul x1.15, WAZ aktywne |
| Sędzia (surowość s 0.75-1.30) | ŻK/faul x s; CK/faul x s^1.5; faule gwizdane x(1.1 - 0.1*s); karne x(0.85 + 0.15*s) |
| Morale | `+0.04*(morale - 10)` pkt na zawodnika |
| Kondycja | spada w meczu (6.1 c), kara `-0.04*(85 - kond)` gdy kond < 85 |
| Taktyka vs taktyka | tabele 3.1 i 4.2 |
| Stan meczu (od 65') | prowadzący: pAct x0.85, D +0.3; przegrywający: pAct x1.12, D -0.4 [SYM: daje 26 % remisów i 53 % goli w 2. połowie] |

### 6.1 (c) Pętla minuty

Stałe startowe (wynik kalibracji [SYM]):

```js
const K = {
  posK: 0.20, posHome: 0.02, posClamp: [0.25, 0.75],
  pAction: 0.37, kCreate: 0.05, lateRamp: 0.004,      // pAct *= 1 + 0.004*max(0, min-55)
  typeW: { POZ: 0.50, SKR: 0.22, KON: 0.13, DYS: 0.15 },
  brkBase: { POZ: -0.15, SKR: -0.25, KON: 0.35, DYS: 1.6 }, kBreak: 0.15,
  failCorner: { POZ: 0.34, SKR: 0.50, KON: 0.20, DYS: 0.40 },
  failOffside: { POZ: 0.11, SKR: 0.05, KON: 0.20, DYS: 0 },
  offsideTick: 0.032,
  penPerAction: 0.0082, penConv: 0.78,
  xg: { // [udział, min, max]
    POZ: [[0.62,0.03,0.08],[0.28,0.09,0.22],[0.10,0.25,0.55]],
    SKR: [[0.60,0.03,0.07],[0.32,0.08,0.18],[0.08,0.22,0.45]],
    KON: [[0.40,0.04,0.10],[0.38,0.10,0.25],[0.22,0.25,0.60]],
    DYS: [[0.85,0.01,0.04],[0.15,0.04,0.08]] },
  kFin: 0.05,
  cornerShot: 0.30, cornerXg: [0.04, 0.14], saveCorner: 0.30, blockCorner: 0.33,
  foulTick: 0.27, foulDefShare: 0.78, dangerFK: 0.14,
  fkDirect: 0.45, fkXgD: [0.04, 0.09], fkCrossShot: 0.30, fkXgC: [0.05, 0.15],
  yellowPerFoul: 0.14, redPerFoul: 0.003, otherYellowTick: 0.0032,
  bookedFoulMul: 0.4, bookedYellowMul: 0.7,
  homeCreate: 1.15, awayCreate: 0.90, homeCardMul: 0.88, awayCardMul: 1.15,
  ogPerMatch: 0.08,
  injTick: 4.3e-4,  // na zawodnika na minutę; ~0.9 urazu/mecz łącznie (40 % widocznych w meczu)
  varGoalCancel: 0.04, varPenAdd: 0.03, varPenCancel: 0.10, varRedAdd: 0.02,
  stoppage1: [1, 3], stoppage2: [3, 6],
};
```

Pseudokod (jeden tick = jedna minuta = 1 s w UI):

```js
function tick(M) {                       // M: stan meczu
  const m = ++M.minute;
  for (const T of M.teams) updateTeam(T, m);   // kondycja, Z, spójność, bezwładność; strefy co 5 min
  const [H, A] = M.teams;

  // 1. Posiadanie
  let logit = K.posK * (H.MID - A.MID) + K.posHome * M.hfa + H.posMod - A.posMod
            + 0.08 * (H.centralCount - A.centralCount);
  const pH = clamp(sigmoid(logit), ...K.posClamp);
  const ai = rnd() < pH ? 0 : 1, at = M.teams[ai], df = M.teams[1 - ai];
  M.stats[ai].possTicks++;

  // 2. Spalony (niezależny od akcji)
  if (rnd() < K.offsideTick * at.offsideMul * df.lineOffsideMul) emit(M, 'OFFSIDE', ai, pickW(at, 'RUC'));

  // 3. Faul
  if (rnd() < K.foulTick * M.weather.foul * M.rankFoul * M.ref.called) {
    const fi = rnd() < K.foulDefShare ? 1 - ai : ai, ft = M.teams[fi];
    const p = pickFouler(ft);              // waga: rola (ŚO 1.4, DP 1.5, BO 1.2, ŚP 1.0, NAP 0.9, SP 0.8, OP 0.7, BR 0.1)
                                           // * (AGR/10) * agresjaInstr * (p.yc ? K.bookedFoulMul : 1)
    emit(M, 'FOUL', fi, p);
    const cm = (fi === 0 ? K.homeCardMul : K.awayCardMul) * M.ref.s * ft.cardMul * (0.7 + 0.03 * p.hidden.TMP)
             * M.rankCard * (m > 80 ? 1.15 : 1);
    if (rnd() < K.redPerFoul * cm * M.ref.s ** 0.5 * ft.redMul) sendOff(M, fi, p, 'CK');
    else if (rnd() < K.yellowPerFoul * cm * (p.yc ? K.bookedYellowMul : 1)) {
      if (p.yc) sendOff(M, fi, p, '2ZK'); else { p.yc = 1; emit(M, 'YELLOW', fi, p); }
    }
    injuryCheckOnFoul(M, 1 - fi, ft.aggrInjMul);          // ofiara faulu: ryzyko x6 względem tła
    if (fi !== ai && rnd() < K.dangerFK) setPiece(M, ai, 'FK');
  }
  if (rnd() < K.otherYellowTick + at.timeWasteYellow) emit(M, 'YELLOW_OTHER', ...);

  // 4. Akcja
  const D = (0.55 * at.ATT + 0.45 * at.MID) - (0.65 * df.DEF + 0.35 * df.MID) + at.dBonus - df.dBonus + gsShift(M, ai);
  const pAct = K.pAction * (ai === 0 ? K.homeCreate : K.awayCreate) ** M.hfa * at.actMul * df.oppActMul
             * gsMul(M, ai) * (1 + K.lateRamp * Math.max(0, m - 55)) * Math.exp(K.kCreate * D);
  if (rnd() < pAct) {
    const type = pickType(at, df);         // K.typeW * formacja * instrukcje * kontra rywala
    if (rnd() < K.penPerAction * at.dribblePen * df.aggrPen * M.ref.pen * M.league.penMul) {
      penalty(M, ai);                      // karny, potem VAR (varPenCancel)
    } else if (rnd() < sigmoid(K.brkBase[type] + K.kBreak * D + at.brk[type] + counterBonus(at, df, type))) {
      const header = type === 'SKR' && rnd() < 0.45;
      shot(M, ai, drawXg(K.xg[type]) * at.xgMul[type], type, header);
    } else {
      if (rnd() < K.failCorner[type]) corner(M, ai);
      else if (rnd() < K.failOffside[type]) emit(M, 'OFFSIDE', ai);
      else creditDefender(M, 1 - ai);      // odbiór/przechwyt do oceny meczowej (waga ODB, UST)
    }
  }
  if (rnd() < K.ogPerMatch / 95) goal(M, ai, null, 'OG');

  // 5. Kontuzje tła (bez kontaktu)
  for (const T of M.teams) for (const p of T.onPitch) if (rnd() < K.injTick * injMul(p, M)) injure(M, T, p, true);

  // 6. Koniec połowy / meczu
  if (m === 45 + M.add1) halfTime(M); if (m === 90 + M.add1 + M.add2) fullTime(M);
}

function shot(M, ai, xg, type, header) {
  const at = M.teams[ai], df = M.teams[1 - ai];
  const s = pickShooter(at, type, header);   // waga: rola (NAP 3.2, OP 1.8, SN 2.2, SP 1.6, ŚP 1.2, DP 0.6, BO/WB 0.5, ŚO 0.5; przy główce ŚO x3)
                                             // * RUC/10 (lub GLO/10 przy główce, DYS/10 przy DYS)
  const assister = type === 'DYS' ? null : pickAssister(at, type, s); // POD/WIZ (POZ, KON), DOS (SKR)
  const F = finishing(s, type, header) + weakFootPenalty(s);
  const pg = Math.min(0.95, xg * Math.exp(K.kFin * (F - df.GK)) * M.weather.conv);
  M.stats[ai].shots++; M.stats[ai].xg += xg;
  if (rnd() < pg) {
    if (rnd() < K.varGoalCancel) return emit(M, 'VAR_NO_GOAL', ai, s);
    return goal(M, ai, s, assister, xg);
  }
  const x = rnd();
  if (x < 0.28) { M.stats[ai].sot++; emit(M, 'SAVE', 1 - ai, df.gk, xg); if (rnd() < K.saveCorner * (1.3 - df.gk.attr.CHW / 20)) corner(M, ai); }
  else if (x < 0.55 && !header) { emit(M, 'BLOCK', 1 - ai); if (rnd() < K.blockCorner) corner(M, ai); }
  else emit(M, 'MISS', ai, s, xg);
}

function corner(M, ai) {
  const at = M.teams[ai], df = M.teams[1 - ai]; M.stats[ai].corners++;
  if (rnd() < K.cornerShot * Math.exp(0.08 * (at.SPA - df.SPD)))
    shot(M, ai, rand(...K.cornerXg), 'SP', true);
}
function setPiece(M, ai) {               // wolny z groźnej strefy
  if (rnd() < K.fkDirect) shot(M, ai, rand(...K.fkXgD) * (1 + 0.04 * (taker(M, ai).attr.SFR - 12)), 'FK', false);
  else if (rnd() < K.fkCrossShot) shot(M, ai, rand(...K.fkXgC), 'SP', true);
}
function penalty(M, ai) {
  const t = penTaker(M, ai), g = M.teams[1 - ai].gk;
  const p = K.penConv * Math.exp(0.03 * ((t.attr.WYK + t.attr.OPA + t.attr.SFR) / 3 - (g.attr.REF + g.attr.JNJ) / 2));
  if (rnd() < K.varPenCancel) return emit(M, 'VAR_PEN_CANCEL', ai);
  M.stats[ai].pens++; M.stats[ai].shots++; M.stats[ai].xg += 0.78;
  rnd() < p ? goal(M, ai, t, null, 0.78, 'PEN') : emit(M, 'PEN_MISS', ai, t);
}
```

Kondycja w meczu (co minutę, na zawodnika):

```text
dK = 0.22 * fatMul_team * rolaMul * (1.4 - 0.04*WYT) * pogodaFat * (wiek >= 31 ? 1.1 : 1)
rolaMul: WB 1.15, SP/SN 1.10, ŚP/DP 1.05, BO 1.05, OP 1.0, NAP 0.95, ŚO 0.85, BR 0.2
kond_start = świeżość; kara efektywności: kond < 85 -> -0.04*(85 - kond) pkt
```
Przykład: WYT 10, normalna taktyka: 95 -> ~75 po 90'. Wysoki pressing + szybkie tempo, WYT 8: 95 -> ~62 (kara -0.9 pkt pod koniec).

VAR: dodatkowo w ticku z nieodgwizdanym zdarzeniem w polu karnym `p = K.varPenAdd/95` (karny przyznany po VAR, ~0.03/mecz) i `K.varRedAdd/95` (czerwona po VAR). Pauza w UI 2 s, mecz stoi.

Doliczony czas: `add1 = randInt(1,3)`, `add2 = randInt(3,6)` + 0.5 min za każdy gol, zmianę i kontuzję w 2. połowie (max 10), + gra na czas.

Zmiany: 5 zmian w 3 oknach (plus przerwa). Kontuzja przy wyczerpanych zmianach: gra w 10.

### 6.1 (d) Oceny meczowe 1-10

Start 6.0. Zdarzenia (przed ograniczeniem do zakresu 3.0-10.0):

| Zdarzenie | Zmiana |
|---|---|
| Gol | +1.0 (NAP +0.9, obrońca +1.2) |
| Asysta | +0.6 |
| Kluczowe podanie (strzał bez gola) | +0.15 |
| Strzał celny | +0.10 |
| Zmarnowana sytuacja (xG >= 0.3, bez gola) | -0.30 |
| Odbiór / przechwyt (creditDefender) | +0.08 |
| Wywalczony karny | +0.30 |
| Spowodowany karny | -0.60 |
| Obrona BR | +0.10 + 0.6*xG strzału |
| Stracony gol | BR -0.30, ŚO/BO/WB -0.20, DP -0.10 |
| Czyste konto (min. 60 min) | BR +0.6, ŚO/BO/WB +0.4, DP +0.2 |
| Żółta / czerwona | -0.3 / -1.5 |
| Błąd przy golu (p = 0.08 na gol, wybrany obrońca/BR ważony 20-DEC) | -1.0 |
| Spalony | -0.05 |
| Wynik: wygrana / porażka | +0.2 / -0.2 |
| Szum | N(0, 0.2) |

Zawodnik z mniej niż 20 min: ocena = `6.0 + 0.6*(suma zdarzeń)`. Zawodnik meczu: najwyższa ocena, remisy rozstrzyga zwycięska drużyna.

### 6.1 (e) Szybka symulacja AI vs AI (Poisson)

Spójna z pełnym silnikiem (dopasowanie [SYM] na 7 różnicach siły od -4 do +4, błąd 1X2 < 2 p.p.):

```js
function quickSim(H, A, ctx) {
  const d = T => (0.55 * T.ATT + 0.45 * T.MID);           // siły po modyfikatorach przedmeczowych
  const e = T => (0.65 * T.DEF + 0.35 * T.MID);
  const dH = 0.75 * (d(H) - e(A)) + 0.15 * (H.MID - A.MID) + 0.10 * (H.FIN - A.GK);
  const dA = 0.75 * (d(A) - e(H)) + 0.15 * (A.MID - H.MID) + 0.10 * (A.FIN - H.GK);
  const hfa = ctx.neutral ? 0 : 1;
  const BETA = 0.225, MU_H = 1.50, MU_A = 1.19, MU_N = 1.34;
  let lH = (hfa ? MU_H : MU_N) * Math.exp(BETA * dH) * H.qsMul;   // qsMul: iloczyn pAct-mnożników instrukcji, pogody
  let lA = (hfa ? MU_A : MU_N) * Math.exp(BETA * dA) * A.qsMul;
  // korekta remisów (Dixon-Coles), rho = -0.10
  const [gH, gA] = sampleDC(lH, lA, -0.10);
  // statystyki uboczne (dla tabel strzelców, kartek, kontuzji)
  const yc = [poisson(1.73 * ctx.refS * H.cardMul), poisson(2.23 * ctx.refS * A.cardMul)];
  const rc = [poisson(0.085), poisson(0.105)];
  const inj = [poisson(0.45), poisson(0.45)];
  assignScorers(H, gH); assignScorers(A, gA);   // waga: oczekiwany udział w strzałach * FIN
  return { gH, gA, yc, rc, inj };
}
```

`FIN` drużyny = średnia FIN z wagami strzelców. Gdy wszystkie strefy różnią się o `d`, `dH = d`, co odpowiada pełnemu silnikowi (beta zmierzona 0.20-0.25, przyjęta 0.225). Po zmianie stałych silnika uruchom ponownie skrypt kalibracji i przestaw `MU_H`, `MU_A`, `BETA`.

Kontrolne wyniki pełnego silnika (gospodarz o `d` lepszy) [SYM]:

| d | gole gosp. | gole gości | 1 / X / 2 |
|---|---|---|---|
| -2 | 0.94 | 1.84 | 17 / 24 / 59 % |
| -1 | 1.20 | 1.48 | 30 / 27 / 43 % |
| 0 | 1.50 | 1.19 | 44 / 28 / 29 % |
| +1 | 1.89 | 0.95 | 60 / 23 / 17 % |
| +2 | 2.31 | 0.74 | 74 / 18 / 8 % |
| +4 | 3.40 | 0.44 | 92 / 6 / 2 % |

Interpretacja: +1 pkt średniej siły to różnica ok. połowy klasy rozgrywkowej. Elita UEFA (15.5) u siebie z mistrzem Polski (12.5): ~85-90 % wygranych gospodarza.

---

## 7. AI managera

### 7.1 Osobowości trenera

| Typ | Domyślne nastawienie | Próg reakcji | Preferencje |
|---|---|---|---|
| Ofensywny | +1 | reaguje 10 min wcześniej przy niekorzystnym wyniku, 10 min później przy prowadzeniu | 4-3-3, 3-4-3, szybkie tempo, wysoki pressing |
| Ostrożny | -1 (0 u siebie ze słabszym) | broni wyniku od 60' | 4-1-4-1, 5-4-1, 4-2-3-1, niska linia |
| Pragmatyczny | 0, dobiera do rywala | wg tabeli kontr (4.2) | dowolna; wybiera kontrę na instrukcje rywala z p = 0.6 |

Dobór przedmeczowy: AI liczy `Δsiły = OVR_11 - OVR_11_rywala` (z atutem boiska +0.5). `Δ < -1.5`: nastawienie -1, kontratak, niska linia. `Δ > +1.5`: +1, krótkie podania. Formacja: najlepsza z 2 preferowanych pod kątem sumy OVR na pozycjach (kara za pozycję).

### 7.2 Reguły w meczu

AI ocenia sytuację w punktach kontrolnych: 46, 55, 60, 65, 70, 75, 80, 85, 88 oraz natychmiast po golu, czerwonej kartce, kontuzji. Każda decyzja przechodzi przez losowanie `p_wykonania` (reguła się "spóźnia" o 5 min, jeśli los nie przejdzie), a między zmianami taktyki musi minąć min. 10 min (bezwładność 4.3).

| Warunek | Akcja | p |
|---|---|---|
| Przegrywa 1, min >= 65 (ofensywny 55, ostrożny 70) | nastawienie +1; zmiana: ŚP/DP -> OP/NAP | 0.75 |
| Przegrywa 2+, min >= 60 | nastawienie +2, tempo szybkie, wysoka linia; 2 ofensywne zmiany | 0.85 |
| Przegrywa, min >= 85 | długie podania, wszystko do ataku, ŚO do ataku (posEff NAP) | 0.9 |
| Prowadzi 1, min >= 75 (ostrożny 65, ofensywny 82) | nastawienie -1; NAP -> DP; tempo wolne | 0.7 |
| Prowadzi 2+, min >= 70 | nastawienie -1, rotacja zmęczonych | 0.8 |
| Prowadzi, min >= 82 | gra na czas | 0.6 (ofensywny 0.3) |
| Remis, min >= 70, faworyt (Δ > 1) | nastawienie +1 | 0.6 |
| Remis, min >= 80, słabszy (Δ < -1) | nastawienie -1 ("bierzemy punkt") | 0.6 |
| Czerwona dla siebie | przejście na formację z 1 napastnikiem (np. 4-4-2 -> 4-1-4-1), nastawienie -1 jeśli wynik >= 0 | 0.95 |
| Czerwona dla rywala | nastawienie +1 jeśli wynik <= 0 | 0.8 |
| Zawodnik z ŻK i AGR >= 13 lub TMP >= 14, min >= 55 | zmiana tego zawodnika | 0.5 |
| Kondycja < 65 (BR nigdy) | zmiana, priorytet najniższa kondycja | 0.8 |
| Kontuzja niegrywalna | zmiana natychmiast (ta sama lub pokrewna pozycja) | 1.0 |

Rozkład zmian: AI wykonuje średnio 4-4.5 zmiany w meczu (pierwsza okolica 60', okna 60-70, 75-80, 85+). Pojedyncze zmiany "na czas" w 88'+ przy prowadzeniu.

### 7.3 Kluby spoza Polski

- Baza: tylko lista klubów (nazwa fikcyjna lub ogólna, kraj, poziom L, styl trenera, kolor). ~150 rekordów.
- Kadra generowana na mecz z ziarna `seed = hash(klubId + sezon)`, deterministycznie (ten sam skład w rewanżu): 20 zawodników, `genPlayer(L, ...)`, nazwiska z puli kraju.
- Między meczami zapisywany tylko stan kartek i 1-2 losowych kontuzji (`seed + mecz`), bez rozwoju.
- Forma klubu UEFA: `L += gauss()*0.2` na mecz.
- Nie istnieją ligi zagraniczne: pozycja klubu w rankingu z tabeli współczynników (stała na sezon, aktualizowana wynikami w pucharach).

---

## 8. Kontuzje

### 8.1 Częstość

Cel: ~0.9 urazu z absencją na mecz (obie drużyny), z czego ~40 % widocznych w trakcie meczu (zawodnik schodzi lub gra z bólem), reszta zgłaszana po meczu. Wartość z badań UEFA nad urazami w piłce elitarnej (rząd 25-30 urazów na 1000 h meczowych) [SZAC, bez weryfikacji źródłowej w tej sesji].

```text
p_tick = K.injTick * mODP * mZmęcz * mMurawa * mPogoda * mWiek * mHistoria * mObciążenie
mODP        = 1.5 - 0.05*ODP                   (0.5-1.45)
mZmęcz      = kond >= 70: 1.0; 50-70: 1.4; < 50: 2.0
mMurawa     = dobra 1.0; zła 1.2; sztuczna 1.1 (goście)
mPogoda     = mróz 1.15 (mięśniowe), śnieg 1.1, upał 1.05
mWiek       = < 30: 1.0; 30-32: 1.15; 33+: 1.3
mHistoria   = uraz tego samego typu w ostatnich 60 dniach: 1.3
mObciążenie = load14 > 900: 1.3
Kontaktowe: ofiara faulu p = 0.012 * aggrRywala (łagodna 0.85, twarda 1.3)
Trening: 0.15 % na zawodnika na dzień treningu (x2 przy intensywnym)
```

Rozkład czasu po wylosowaniu urazu: lekka 62 %, średnia 28 %, ciężka 10 % (`ODP >= 15`: przesunięcie 5 p.p. z ciężkiej do lekkiej).

### 8.2 Typy

| Kategoria | Typ | Dni | Grywalna z bólem |
|---|---|---|---|
| Lekka (1-14) | Stłuczenie | 1-5 | tak |
| | Naciągnięcie mięśnia | 5-14 | tak (ryzyko pogorszenia) |
| | Lekkie skręcenie kostki | 4-12 | tak |
| | Wstrząśnienie mózgu (protokół) | 7-10 | nie |
| Średnia (15-42) | Naderwanie mięśnia dwugłowego | 18-35 | nie |
| | Uraz przywodziciela | 15-30 | nie |
| | Skręcenie kostki z uszkodzeniem więzadła | 20-42 | nie |
| | Uraz więzadła pobocznego kolana | 25-42 | nie |
| Ciężka (43-270) | Złamanie kości śródstopia | 50-90 | nie |
| | Zerwanie ścięgna Achillesa (rzadkie, 3 % ciężkich) | 180-240 | nie |
| | Zerwanie więzadła krzyżowego | 190-270 | nie |
| | Uraz barku (głównie BR) | 45-80 | nie |

Po powrocie z urazu > 28 dni: ostrość = 30, ryzyko nawrotu x1.3 przez 30 dni.

### 8.3 Gra z kontuzją

Lekki uraz grywalny: zawodnik może wystąpić (decyzja gracza lub AI przy ważnym meczu). Efekt: atrybuty fizyczne -15 %, posEff x0.95, w każdym meczu `p = 0.20` pogorszenia do kategorii średniej (dni x2), w treningu `p = 0.05`.

W meczu przy urazie: lekki -> zawodnik gra dalej z karą (gracz dostaje komunikat i decyduje); średni/ciężki -> zejście natychmiast.

Wdrożenie w silniku (kary wg typu, ryzyko pogłębienia na minutę, kara drużyny przy kilku kulejących, dni po meczu,
gra z urazem sprzed meczu, AI): `docs/taktyka-i-urazy.md`, rozdz. 2.

---

## 9. Warstwy głębi

### 9.1 Forma

Patrz 2.3. Dodatkowo forma dnia: na początku meczu `dayForm = gauss() * (0.9 - 0.035*KON)` pkt, stała w meczu. Daje rozrzut wyników bez kosztu obliczeń.

### 9.2 Chemia i zgranie

- Zgranie formacji (familiarity) 0-100 na każdą formację: +4 za mecz, +1 za trening taktyczny, -1/tydzień bez użycia (min 30). Kara: `-(100 - fam)*0.006` pkt do wszystkich stref (max -0.4).
- Zgranie linii: dla par sąsiednich zawodników w formacji (np. ŚO-ŚO, BO-SP) licznik wspólnych meczów; chemia linii = min(1, wspólne/10). Strefa DEF i MID: `+0.3*(śr. chemia - 0.5)` pkt.
- Nowy zawodnik: chemia startuje od 0, obcokrajowiec bez znajomości języka: przez pierwsze 8 tygodni x0.7 przyrostu.

### 9.3 Zmęczenie w sezonie (mecze co 3 dni)

- Świeżość regeneruje +18/dzień (2.3). Po meczu 90 min świeżość = kondycja końcowa (~75). Po 3 dniach: ~100 (pełna) przy WYT 10, ~92 u 33-latka.
- Obciążenie `load14 > 900` (np. 3 mecze po 90 min i 2 dogrywki): forma -0.2, urazy x1.3.
- Rotacja: AI sadza zawodnika z świeżością < 80 lub load14 > 810, chyba że mecz ma rangę >= 2.

### 9.4 Trening (plan tygodniowy)

Gracz wybiera intensywność i 1 akcent na tydzień (AI: "zrównoważony").

| Akcent | Efekt tygodniowy |
|---|---|
| Taktyka | zgranie formacji +3, biegłość pozycji +1, spójność startowa S +5 w najbliższym meczu |
| Fizyczny | rozwój WYT, SIL, SZY x1.5; świeżość -3 |
| Techniczny | rozwój POD, TEC, DRY, WYK x1.5 |
| Stałe fragmenty | SPA i SPD +0.5 na najbliższe 2 mecze; rozwój SFR x1.5 |
| Regeneracja | świeżość +8, urazy treningowe x0.5, rozwój x0.5 |

| Intensywność | Rozwój | Świeżość / dzień | Ryzyko urazu treningowego |
|---|---|---|---|
| Niska | x0.7 | +4 | x0.6 |
| Normalna | x1.0 | 0 | x1.0 |
| Wysoka | x1.3 | -5 | x2.0 |

### 9.5 Rozwój i spadek

Raz w miesiącu (12 aktualizacji w roku, tanie obliczeniowo):

```text
ΔOVR_mies = rate(wiek) * (POT - OVR) / 12 * minMul * trening * (0.8 + 0.02*PRF)
rate: 16-19: 0.40; 20-21: 0.32; 22-23: 0.22; 24-26: 0.10; 27-28: 0.03 (ΔOVR może być 0)
minMul = 0.6 + 0.4 * min(1, minuty_sezonu / 1800)   (wypożyczenie do niższej ligi: 0.9)
Spadek (wiek >= 29): fizyczne (SZY, ZWI, WYT, SKO) -0.02*(wiek - 28) /mies., z modyfikatorem (1.2 - 0.02*PRF);
                     mentalne (DEC, OPA, UST, LID) +0.01 /mies. do 33 lat
```

Rozdział przyrostu na atrybuty: losowo, z wagami OVR pozycji (atrybuty `++` 4x częściej) i akcentem treningu. Atrybut nie przekracza `POT + 3`. Skok rozwojowy (rzadki): 3 % szansy na sezon dla wieku <= 21: POT +1.5.

Koniec kariery: od 33 lat `p = 0.15 + 0.12*(wiek - 33)` na sezon, x2 przy OVR < poziom ligi - 2.

Młodzież: co sezon 3-5 wychowanków (wiek 16-17), `q = L - 3 + akademia` (akademia 0-1.5 zależnie od budżetu), POT `q + 2..6`.

### 9.6 Morale drużyny

Morale zawodnika 1-20. Morale drużyny = średnia 18 najczęściej grających.

| Zdarzenie | Zmiana |
|---|---|
| Wygrana / remis / porażka | +1.5 / 0 / -1.5; wygrana słabszego (Δ < -1) +2.5, porażka faworyta (Δ > 1) -2.5 |
| Wygrana w derbach / porażka w derbach | +3 / -3 |
| Seria 3 porażek | -2 dodatkowo |
| Brak gry (rezerwowy o OVR >= śr. 11) 3 mecze | -1 /mecz |
| Odrzucona prośba o transfer / nowy kontrakt | -3 |
| Nowy kontrakt / podwyżka | +3 |
| Dryf | ku 12 o 0.3/tydzień (Lider w drużynie: o 0.5) |

### 9.7 Oczekiwania zarządu

- Przed sezonem: prognoza miejsca z rankingu `OVR_11` w lidze. Cel: miejsce prognozy +/-2 (zarząd ambitny: -3).
- Zaufanie 0-100 (start 60): zmiana co mecz `+3*(pkt - pkt_oczekiwane)`, gdzie `pkt_oczekiwane = 3*P(W) + P(X)` z modelu Poissona (6.1 e). Puchary: awans +5, odpadnięcie z niższą ligą -8.
- Zwolnienie: zaufanie < 15 lub < 25 na 6 kolejek przed końcem sezonu przy strefie spadkowej. Nagroda: budżet transferowy +10 % przy zaufaniu > 80.

### 9.8 Finanse (prosto, wartości balansowe gry [SZAC])

Saldo tygodniowe:
```text
przychody = bilety (pojemność * zapełnienie * cena, tylko mecze domowe)
          + TV_liga/tydz (Ekstraklasa: pula wg miejsca w poprzednim sezonie; 1L ~15 %, 2L ~3 % puli EK)
          + sponsor/tydz (∝ reputacja) + premie UEFA (za mecz, wygraną, awans) + sprzedaż zawodników
koszty    = pensje + utrzymanie (stadion, akademia: suwak 0-3) + premie meczowe
zapełnienie = clamp(0.35 + 0.04*(morale_kibiców - 10) + 0.15*ranga + 0.1*(derby), 0.2, 1.0)
```
Zasada: bankructwo nie istnieje; ujemne saldo blokuje transfery i daje -5 zaufania zarządu na tydzień.

### 9.9 Transfery (prosto)

- Okna: lato (8 tygodni), zima (4 tygodnie).
- Cena wywoławcza AI = `value * (1.2..1.6)`; przy klauzuli: klauzula wiąże. Zawodnik kluczowy (top-3 OVR w klubie) x1.5.
- Akceptacja klubu: `p = sigmoid(4*(oferta/cena - 1))`. Kontroferta raz, w połowie drogi.
- Zgoda zawodnika: `pensja_oferta >= pensja_obecna * (1.1 + 0.1*różnicaPrestiżu)` i prestiż klubu kupującego >= prestiż obecny - 2 (prestiż 1-10).
- Wolni agenci: lista generowana co okno (`genPlayer`, poziomy 1L-EK, wiek 26-34).
- Transfery AI-AI: w każdym tygodniu okna każdy klub AI z dziurą w kadrze (pozycja z < 2 zawodnikami lub OVR < L - 1) kupuje z p = 0.3 zawodnika z niższej ligi o OVR >= L.
- Skauting: zawodnik widziany z szumem `±(3 - scoutedLevel)` pkt na atrybut, ukryte widoczne jako przedział od poziomu 2.

---

## 10. Wydajność (słaby telefon)

- Pełny mecz: ~100 ticków, każdy < 0.1 ms. Strefy przeliczane co 5 min (22 zawodników x 4 oceny).
- Kolejka ligowa (27 meczów 3 lig): mecz gracza w pełnym silniku, reszta `quickSim` (< 1 ms łącznie). Puchary UEFA: tylko mecze z polskimi klubami na żywo, reszta `quickSim`.
- Zapis: IndexedDB, ~1 500 zawodników x ~0.6 KB = ~1 MB. Kluby UEFA bez zapisu kadr.
- Losowość: własny PRNG z ziarnem (mulberry32) do powtarzalności i testów.

## 11. Kluby 2026/27 i model drużyn rezerw

### 11.1 Poziom siły klubów (L, średnia atrybutów 1-20)

Podstawa: reputacja, budżet i wyniki z ostatnich sezonów; miejsce w tabeli w połowie sezonu tylko pomocniczo. Wszystkie wartości to propozycje balansowe [SZAC]. Średnie: Ekstraklasa 11.52, 1 Liga 10.00 (zgodnie z założeniem), 2 Liga 8.49. `Prestiż` 1-10 służy transferom (9.9) i frekwencji. `Trener` to domyślna osobowość AI (O = ofensywny, S = ostrożny, P = pragmatyczny).

**Ekstraklasa**

| Klub | L | Prestiż | Trener | Uzasadnienie |
|---|---|---|---|---|
| Legia Warszawa | 12.6 | 10 | O | największy budżet i przychody w lidze |
| Lech Poznań | 12.6 | 10 | O | mistrz 2024/25, najmocniejszy atak sezonu (68 goli) |
| Raków Częstochowa | 12.4 | 8 | P | stała czołówka, najlepsza obrona 2024/25 |
| Jagiellonia Białystok | 12.0 | 8 | O | czołówka i regularne puchary od 2023/24 |
| Widzew Łódź | 11.8 | 8 | P | duże inwestycje kadrowe, duża baza kibiców |
| Pogoń Szczecin | 11.7 | 7 | O | stały górny środek tabeli |
| Wieczysta Kraków | 11.6 | 5 | P | beniaminek z bardzo wysokim budżetem właściciela, mała reputacja |
| Górnik Zabrze | 11.5 | 8 | O | górna połowa, tradycja |
| Wisła Kraków | 11.4 | 9 | O | duża marka, po powrocie z 1 Ligi |
| Cracovia | 11.4 | 7 | P | stabilny środek tabeli |
| Piast Gliwice | 11.2 | 6 | S | środek tabeli, niski budżet względem ligi |
| Śląsk Wrocław | 11.2 | 7 | P | powrót po spadku, średni budżet |
| Zagłębie Lubin | 11.1 | 6 | P | środek / dół tabeli |
| Motor Lublin | 11.0 | 6 | O | beniaminek z ostatnich lat, rosnący |
| Korona Kielce | 11.0 | 6 | S | dolna połowa, skromny budżet |
| GKS Katowice | 11.0 | 6 | P | beniaminek z ostatnich lat |
| Radomiak Radom | 10.9 | 5 | P | dół tabeli, duża rotacja obcokrajowców |
| Wisła Płock | 10.9 | 6 | S | beniaminek, skromny budżet |

**1 Liga**

| Klub | L | Prestiż | Trener | Uzasadnienie |
|---|---|---|---|---|
| Lechia Gdańsk | 10.8 | 8 | O | duża marka i budżet jak na 1L |
| Arka Gdynia | 10.5 | 7 | P | niedawno w Ekstraklasie |
| Stal Mielec | 10.4 | 6 | S | spadkowicz z Ekstraklasy |
| Puszcza Niepołomice | 10.4 | 4 | S | spadkowicz, styl fizyczny (GLO, SIL ++ w kadrze) |
| Bruk-Bet Termalica Nieciecza | 10.4 | 5 | P | doświadczenie w Ekstraklasie, stabilny właściciel |
| Ruch Chorzów | 10.3 | 8 | P | duża marka, ograniczony budżet |
| ŁKS Łódź | 10.2 | 7 | O | niedawno w Ekstraklasie |
| Miedź Legnica | 10.2 | 6 | P | stały kandydat do awansu |
| Polonia Warszawa | 10.1 | 7 | O | marka stołeczna, średni budżet |
| Stal Rzeszów | 9.8 | 5 | P | środek 1L |
| Podbeskidzie Bielsko-Biała | 9.7 | 6 | S | była Ekstraklasa, budżet 1L |
| Odra Opole | 9.7 | 5 | P | środek 1L |
| Warta Poznań | 9.7 | 5 | S | problemy finansowe w ostatnich latach |
| Polonia Bytom | 9.7 | 6 | O | beniaminek, duża tradycja |
| Chrobry Głogów | 9.6 | 4 | S | skromny budżet |
| Pogoń Grodzisk Mazowiecki | 9.6 | 3 | P | mały klub, beniaminek |
| Pogoń Siedlce | 9.6 | 4 | P | beniaminek |
| Unia Skierniewice | 9.3 | 3 | S | najmniejszy budżet ligi |

**2 Liga**

| Klub | L | Prestiż | Trener | Uzasadnienie |
|---|---|---|---|---|
| GKS Tychy | 9.2 | 6 | P | wieloletni uczestnik 1L |
| Górnik Łęczna | 9.1 | 5 | P | była Ekstraklasa |
| Zawisza Bydgoszcz | 8.8 | 6 | O | duża marka, odbudowa |
| Sandecja Nowy Sącz | 8.8 | 5 | S | była Ekstraklasa |
| Znicz Pruszków | 8.8 | 4 | O | niedawno w 1L |
| Chojniczanka Chojnice | 8.7 | 4 | P | doświadczenie w 1L |
| Stal Stalowa Wola | 8.6 | 5 | P | niedawno w 1L |
| Resovia Rzeszów | 8.6 | 4 | P | niedawno w 1L |
| Olimpia Grudziądz | 8.5 | 4 | S | środek 2L |
| Hutnik Kraków | 8.5 | 4 | O | środek 2L |
| Legia II Warszawa | 8.4 | 3 | O | rezerwy (rozdz. 11.2) |
| NKP Podhale Nowy Targ | 8.2 | 2 | S | beniaminek |
| Avia Świdnik | 8.2 | 3 | S | mały budżet |
| Świt Szczecin | 8.2 | 2 | P | beniaminek |
| Śląsk Wrocław II | 8.1 | 2 | O | rezerwy (rozdz. 11.2) |
| Lechia Zielona Góra (niepewne) | 8.1 | 2 | P | beniaminek; skład ligi do potwierdzenia |
| Rekord Bielsko-Biała (niepewne) | 8.1 | 2 | P | beniaminek; skład ligi do potwierdzenia |
| Sokół Kleczew | 8.0 | 2 | S | najmniejszy klub ligi |

Rozrzut siły: odchylenie poziomów w lidze ~0.5 pkt. Według tabeli kontrolnej (6.1 e) faworyt Legia u siebie z Wisłą Płock (d = 1.7) wygrywa ~70 %, co odpowiada typowym kursom na takie mecze.

Kontrola po starcie: każdy L dostaje w generatorze szum `±0.15`, żeby dwa zapisy gry nie były identyczne. Co sezon: `L_nowy = L + 0.3*(budżetIndeks - 1) + rozwój/odejścia kadry` (L liczony na nowo jako średni OVR najlepszej 16-ki, więc nie trzeba go trzymać osobno po pierwszym sezonie).

Uwaga prawna: prawdziwe nazwy klubów (a tym bardziej herby, barwy i nazwiska zawodników) mogą wymagać licencji. Przed publikacją skonsultuj z działem prawnym; bezpieczny wariant techniczny to dane klubów w osobnym pliku JSON z edytorem nazw, a w buildzie nazwy fikcyjne.

### 11.2 Drużyny rezerw

**Reguła ligowa (od użytkownika)**: rezerwy grają zawsze co najmniej jedną ligę niżej niż pierwsza drużyna. Gdy pierwsza drużyna spada do ligi rezerw, rezerwy spadają automatycznie o jedną ligę (z 2 Ligi: wypadają poza grę, do niesymulowanej 3 Ligi).

W grze od startu: Legia II (rodzic: Legia, Ekstraklasa) i Śląsk II (rodzic: Śląsk, Ekstraklasa). Inne kluby mogą mieć rezerwy w niesymulowanej 3 Lidze (pula awansów do 2 Ligi), np. Lech II, Jagiellonia II, Pogoń II, Zagłębie II.

**Ruchy ligowe na koniec sezonu (z regułą rezerw)**

```js
function endOfSeason(tables) {               // tables[0..2] = EK, 1L, 2L, posortowane
  let moves = standardMoves(tables);          // EK: 3 w dół; 1L: 2 + baraż w górę, 3 w dół; 2L: 2 + baraż w górę, 4 w dół; 4 z puli 3L w górę
  // 1) awans rezerw zablokowany, gdy dałby ligę rodzica (lub wyższą)
  for (const m of moves.up) if (m.club.parent && tierAfter(m.club.parent, moves) <= m.toTier)
    replaceWithNextEligible(m, tables);      // awans dostaje następny klub w tabeli / w barażu
  // 2) wymuszony spadek rezerw, gdy rodzic spadł do ich ligi
  for (const c of allClubs) if (c.parent && tierAfter(c.parent, moves) >= tierAfter(c, moves)) {
    forceDown(c, moves);                     // rezerwy schodzą o 1 ligę
    keepUpBestRelegated(moves, tierAfter(c, moves) - 1); // zwolnione miejsce: najlepszy spadkowicz tej ligi zostaje
  }
  // 3) pula 3 Ligi: 4 kluby generowane (L = 7.8-8.3), w tym rezerwy klubów EK, jeśli ich rodzic jest w EK lub 1L
  return apply(moves);
}
```

Kolejność sprawdzeń ustalona (najpierw EK, potem 1L, potem 2L), żeby nie było pętli. Koszt: kilka porównań raz na sezon.

**Kadra rezerw**

- Osobny skład 18-22 zawodników, pole `squad: 'B'` w rekordzie zawodnika (ten sam magazyn co pierwsza drużyna, brak osobnych struktur).
- Generowanie: 75 % zawodników w wieku 17-21, `q = L_rez + gauss()*0.8`, POT `q + 2..6`; 3-4 zawodników 23-30 lat (doświadczenie, LID wyższe o +2).
- Wychowankowie (9.5) trafiają domyślnie do rezerw, jeśli klub je ma.
- Pensje rezerw: `wage * 0.5`, płaci klub macierzysty. Przychody rezerw: 0 (bilet symboliczny, pomijalny).
- Trener rezerw: AI (osobowość O, rozwój młodych ma priorytet: zawodnicy U-21 dostają +20 % wagi przy wyborze składu).

**Przesuwanie zawodników A <-> B**

- Gracz przesuwa zawodnika jednym przyciskiem w dowolnym dniu bez meczu. Brak kosztu, brak okienek (to wewnątrz klubu).
- AI (oraz opcja "Automat" dla gracza) wykonuje jedno przejście raz w tygodniu, przed kolejką:

```js
function weeklyReservePass(club) {            // ~50 zawodników, jedno sortowanie
  const A = club.players.filter(p => p.squad === 'A' && !p.injury);
  const B = club.players.filter(p => p.squad === 'B' && !p.injury);
  const matchday = pickMatchday18(A);         // 11 + 7 ławka, wg OVR*świeżość
  const benchCut = matchday[17].ovr;
  // w dół: nadmiarowi z A, którym brakuje gry lub ostrości
  for (const p of A) if (!matchday.includes(p) && (p.sharp < 60 || p.load14 < 90) && eligibleForB(p)) p.weekSquad = 'B';
  // w górę: najlepsi z B, jeśli są blisko ławki A
  for (const p of B.sort(byOvrDesc).slice(0, 2)) if (p.ovr >= benchCut - 0.3) { p.squad = 'A'; }
}
```

**Zasady gry w obu drużynach** (uproszczone reguły gry, inspirowane praktyką; rzeczywiste przepisy PZPN są bardziej złożone):

| Reguła | Wartość | Po co |
|---|---|---|
| Jeden mecz na kolejkę | zawodnik może zagrać w jednej z dwóch drużyn w danym tygodniu ligowym (kolejki A i B są w tym samym tygodniu) | blokuje podwójne granie bez śledzenia dni |
| Limit starszych w rezerwach | max 3 zawodników powyżej 22 lat jednocześnie na boisku w meczu rezerw | rezerwy pozostają drużyną młodzieżową |
| Blokada podstawowych | zawodnik z >= 5 meczami w podstawie A w ostatnich 8 kolejkach może zagrać w B tylko po kontuzji (ostrość < 60), max 2 mecze z rzędu | nie da się "wzmocnić" rezerw gwiazdami w walce o awans |
| Limit meczów w końcówce | w ostatnich 4 kolejkach sezonu w B mogą grać tylko zawodnicy, którzy mieli >= 3 występy w B wcześniej | blokuje transfery zawodników A do B na finisz |
| Zawieszenia | kartki liczone osobno per rozgrywki (już w 2.1: `susp.league`); zawieszenie w A nie obejmuje B | prostota |

Sprawdzanie reguł: przy zatwierdzaniu składu meczowego B, czyli 18 prostych warunków na kolejkę.

**Symulacja i rozwój**

- Mecze rezerw zawsze `quickSim` (gracz może opcjonalnie obejrzeć mecz B w pełnym silniku, gdy jego klub gra w tej samej lidze co rezerwy).
- Oceny w `quickSim`: `6.3 + 0.9*gole + 0.5*asysty + gauss()*0.5` (zakres 5.0-9.0), kartki i kontuzje z rozkładów 6.1 e.
- Minuty w rezerwach liczą się do rozwoju z wagą 0.6 (`minMul`, rozdz. 9.5) i do ostrości: +10 za 90 min.
- Mecz B nie zmienia morale A; dobra forma w B (avg5 >= 7.0) daje zawodnikowi +1 morale i sygnał dla AI do awansu do A.
- Koszt obliczeniowy: 2 dodatkowe `quickSim` na kolejkę i ~40 dodatkowych rekordów zawodników (~25 KB w zapisie).

---

## Źródła

- [2024-25 Ekstraklasa, Wikipedia](https://en.wikipedia.org/wiki/2024%E2%80%9325_Ekstraklasa): 843 gole, 306 meczów, 2.75/mecz (dane z wyników wyszukiwania; pełna strona niedostępna z tej sesji).
- [SoccerStats, Ekstraklasa home/away](https://www.soccerstats.com/table.asp?league=poland&tid=ha): pełny sezon 45 % / 28 % / 27 %, over 2.5: 52 %.
- [4score.ru, Ekstraklasa](https://4score.ru/en/leagues/polsha-premer-liga/): 1.94 ŻK na drużynę (gospodarze 1.63, goście 2.22); okres próby niepodany.
- [FotMob, statystyki drużyn](https://www.fotmob.com/teams/1957/stats/overview/teams): faule drużyn Ekstraklasy 9.7-16.1/mecz, strzały celne 4-6.5/mecz.
- [CIES Football Observatory, Weekly Post 300](https://football-observatory.com/IMG/sites/b5wp/2019/wp300/en/): "Penalties: most in Poland, fewest in Norway and England".
- [CIES Football Observatory, Weekly Post 364](https://football-observatory.com/IMG/sites/b5wp/2021/wp364/en/): karne 0.23-0.45 na mecz w ligach europejskich.
- [Sports Mole, Ekstraklasa 2024-25 attack](https://www.sportsmole.co.uk/football/polish-ekstraklasa/2024-25/best-attack.html): Lech 68 goli (2.00/mecz).

Ograniczenia: strony footystats.org, 4score.ru i en.wikipedia.org nie są dostępne z sieci tej sesji, więc wartości pochodzą z fragmentów wyników wyszukiwania. Strzały, rożne, spalone i rozkład narodowości to szacunki [SZAC]; warto je zweryfikować w FotMob/Transfermarkt przed finalnym balansem.
