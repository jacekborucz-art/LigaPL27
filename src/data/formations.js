// 12 formacji (docs/ekspert_futbol.md 3, 3.1, docs/taktyka-i-urazy.md). Współrzędne: x 0-100 szerokość (0 = lewa),
// y 0-100 długość (0 = własna bramka), drużyna atakuje w górę. Modyfikatory czyta silnik (etap 3).
// Nowa formacja = nowy wpis tutaj; ekran składu i silnik nie wymagają zmian.
// fx: efekty strukturalne formacji w tym samym słowniku co efekty instrukcji (src/data/instructions.js),
// np. pActMul, D, pos, oppAct; silnik łączy je z instrukcjami (teams.js tacticParams).
// family: formacje z tymi samymi rolami (warianty 4-4-2); przejście w rodzinie kosztuje mniej spójności.

const SIDED = new Set(['BO', 'WB', 'BP', 'SN']);
const slots = (spec) => spec.split(';').map((s) => {
  const [pos, xy] = s.trim().split(' ');
  const [x, y] = xy.split(',').map(Number);
  const side = SIDED.has(pos) ? (x < 50 ? 'L' : 'P') : null;
  return { pos, side, x, y };
});

export const FORMATIONS = [
  { id: '442', name: '4-4-2', nick: 'Dwie Linie', family: '442', W: 1.0, act: { POZ: 1.0, SKR: 1.15, KON: 1.1, DYS: 1.0 }, counterVuln: 1.0,
    note: 'Prosta i szeroka. Słabsza w środku przeciw trzem pomocnikom.',
    slots: slots('BR 50,5; BO 15,25; ŚO 38,21; ŚO 62,21; BO 85,25; BP 15,50; ŚP 40,47; ŚP 60,47; BP 85,50; NAP 40,75; NAP 60,75') },
  // Niski blok 4-4-2: dwie zwarte czwórki blisko własnego pola karnego, boczni pomocnicy schodzą do środka i asekurują
  // bocznych obrońców, jeden napastnik cofa się na defensywnego pomocnika rywala (4-4-1-1 bez piłki). Pressing dopiero
  // na własnej połowie (podanie do boku, podanie do tyłu, złe przyjęcie). Po odbiorze szybko do dwóch napastników.
  { id: '442def', name: '4-4-2 defensywne', nick: 'Niski Blok', family: '442', W: 0.85, act: { POZ: 0.85, SKR: 1.0, KON: 1.3, DYS: 0.95 }, counterVuln: 0.8,
    fx: { pActMul: 0.92, D: 0.5, oppPActMul: 0.88, pos: -0.05, oppAct: { KON: 0.8, SKR: 1.12, DYS: 1.2 }, oppOffsideMul: 0.7, fatMidMul: 0.95 },
    note: 'Dwie niskie linie po cztery, mało miejsca między liniami. Dobra do obrony wyniku i przeciw silniejszym. Mniej własnych akcji, rywal dośrodkowuje i strzela z dystansu.',
    slots: slots('BR 50,5; BO 18,19; ŚO 39,16; ŚO 61,16; BO 82,19; BP 21,37; ŚP 41,35; ŚP 59,35; BP 79,37; NAP 45,58; NAP 57,66') },
  // Wysokie 4-4-2: obrona przy linii środkowej, boczni obrońcy podłączają się, boczni pomocnicy grają jak skrzydłowi,
  // dwóch napastników atakuje środkowych obrońców rywala i zaczyna pressing (podanie do bramkarza, do boku).
  { id: '442off', name: '4-4-2 ofensywne', nick: 'Wysokie Skrzydła', family: '442', W: 1.15, act: { POZ: 1.0, SKR: 1.25, KON: 0.95, DYS: 1.0 }, counterVuln: 1.2,
    fx: { pActMul: 1.12, D: -0.4, oppPActMul: 1.06, oppAct: { KON: 1.25 }, oppOffsideMul: 1.25, fatMul: 1.06, foulMul: 1.05 },
    note: 'Wysoka linia, skrzydłowi i dwaj napastnicy w polu karnym. Do gonienia wyniku i przeciw słabszym. Męczy i zostawia miejsce za plecami.',
    slots: slots('BR 50,5; BO 13,33; ŚO 38,26; ŚO 62,26; BO 87,33; BP 12,62; ŚP 40,52; ŚP 60,52; BP 88,62; NAP 40,83; NAP 60,83') },
  { id: '433', name: '4-3-3', nick: 'Trójząb', W: 1.0, act: { POZ: 1.05, SKR: 1.1, KON: 1.0, DYS: 0.95 }, counterVuln: 1.1,
    note: 'Dobra do pressingu, męczy skrzydłowych.',
    slots: slots('BR 50,5; BO 15,26; ŚO 38,21; ŚO 62,21; BO 85,26; DP 50,38; ŚP 32,52; ŚP 68,52; SN 15,74; NAP 50,80; SN 85,74') },
  { id: '4231', name: '4-2-3-1', nick: 'Parasol', W: 0.9, act: { POZ: 1.1, SKR: 1.0, KON: 1.0, DYS: 1.05 }, counterVuln: 0.95,
    note: 'Najbardziej zrównoważona, bez słabych punktów.',
    slots: slots('BR 50,5; BO 15,26; ŚO 38,21; ŚO 62,21; BO 85,26; DP 40,39; DP 60,39; BP 15,62; OP 50,62; BP 85,62; NAP 50,82') },
  { id: '4141', name: '4-1-4-1', nick: 'Kurtyna', W: 0.9, act: { POZ: 0.95, SKR: 1.0, KON: 1.05, DYS: 1.05 }, counterVuln: 0.9,
    note: 'Szczelna. Napastnik bywa osamotniony, potrzebuje siły.',
    slots: slots('BR 50,5; BO 15,25; ŚO 38,21; ŚO 62,21; BO 85,25; DP 50,36; BP 15,55; ŚP 38,54; ŚP 62,54; BP 85,55; NAP 50,78') },
  { id: '442d', name: '4-4-2 romb', nick: 'Diament', W: 0.6, act: { POZ: 1.2, SKR: 0.7, KON: 1.0, DYS: 1.05 }, counterVuln: 1.0,
    note: 'Kontrola środka, ale odsłonięte skrzydła.',
    slots: slots('BR 50,5; BO 15,26; ŚO 38,21; ŚO 62,21; BO 85,26; DP 50,36; ŚP 30,50; ŚP 70,50; OP 50,63; NAP 40,80; NAP 60,80') },
  { id: '352', name: '3-5-2', nick: 'Wahadło', W: 0.9, act: { POZ: 1.05, SKR: 1.05, KON: 1.05, DYS: 1.0 }, counterVuln: 1.05,
    note: 'Wahadłowi dużo biegają. Dobra przeciw dwóm napastnikom.',
    slots: slots('BR 50,5; ŚO 28,22; ŚO 50,19; ŚO 72,22; WB 10,48; DP 50,39; ŚP 33,53; ŚP 67,53; WB 90,48; NAP 40,78; NAP 60,78') },
  { id: '343', name: '3-4-3', nick: 'Wysoki Trójkąt', W: 1.2, act: { POZ: 1.0, SKR: 1.2, KON: 1.05, DYS: 0.9 }, counterVuln: 1.2,
    note: 'Bardzo ofensywna i szeroka, podatna na kontry.',
    slots: slots('BR 50,5; ŚO 28,24; ŚO 50,21; ŚO 72,24; WB 12,50; ŚP 38,47; ŚP 62,47; WB 88,50; SN 18,75; NAP 50,82; SN 82,75') },
  { id: '532', name: '5-3-2', nick: 'Bunkier', W: 0.8, act: { POZ: 0.85, SKR: 0.9, KON: 1.25, DYS: 0.9 }, counterVuln: 0.8,
    note: 'Gęsta obrona i groźne kontry, mniej własnych akcji.',
    slots: slots('BR 50,5; WB 12,30; ŚO 30,20; ŚO 50,17; ŚO 70,20; WB 88,30; ŚP 30,45; DP 50,40; ŚP 70,45; NAP 42,70; NAP 58,70') },
  { id: '541', name: '5-4-1', nick: 'Mur', W: 0.9, act: { POZ: 0.8, SKR: 0.9, KON: 1.2, DYS: 0.95 }, counterVuln: 0.75,
    note: 'Najbardziej defensywna. Dobra obrona stałych fragmentów.',
    slots: slots('BR 50,5; WB 12,26; ŚO 30,19; ŚO 50,17; ŚO 70,19; WB 88,26; BP 15,45; ŚP 40,42; ŚP 60,42; BP 85,45; NAP 50,68') },
  { id: '4321', name: '4-3-2-1', nick: 'Choinka', W: 0.5, act: { POZ: 1.15, SKR: 0.65, KON: 1.0, DYS: 1.15 }, counterVuln: 1.0,
    note: 'Gra środkiem i strzały z dystansu. Wąska, odsłonięte boki.',
    slots: slots('BR 50,5; BO 15,26; ŚO 38,21; ŚO 62,21; BO 85,26; DP 50,38; ŚP 30,46; ŚP 70,46; OP 37,64; OP 63,64; NAP 50,82') },
];

export const DEFAULT_FORMATION = '4231';
export const formationById = (id) => FORMATIONS.find((f) => f.id === id) || FORMATIONS.find((f) => f.id === DEFAULT_FORMATION);
