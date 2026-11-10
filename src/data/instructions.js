// Instrukcje taktyczne (docs/ekspert_futbol.md 4.1). Opis dla gracza i efekty dla silnika w jednym miejscu.
// effect: liczby czytane przez silnik meczowy (etap 3). Nowa instrukcja = nowy wpis.
// Oznaczenia: pAct szansa akcji, brk przełamanie, pos posiadanie, D obrona (pkt), fat zmęczenie,
// act: mnożniki typów akcji (POZ atak pozycyjny, SKR skrzydła, KON kontra, DYS dystans).

export const INSTRUCTIONS = [
  {
    id: 'mentality', label: 'Nastawienie', default: '0',
    options: [
      { id: '-2', label: 'Zamurowanie', text: 'Wszyscy za piłką. Mało akcji, mocna obrona.', effect: { pActMul: 0.8, D: 0.6, counterVulnMul: 0.76 } },
      { id: '-1', label: 'Ostrożnie', text: 'Najpierw nie stracić bramki.', effect: { pActMul: 0.9, D: 0.3, counterVulnMul: 0.88 } },
      { id: '0', label: 'Równowaga', text: 'Bez przechyłu w żadną stronę.', effect: {} },
      { id: '1', label: 'Do przodu', text: 'Więcej akcji, ale więcej miejsca dla rywala.', effect: { pActMul: 1.1, D: -0.3, counterVulnMul: 1.12 } },
      { id: '2', label: 'Wszystko do ataku', text: 'Pełne ryzyko. Szybciej się męczy.', effect: { pActMul: 1.2, D: -0.6, counterVulnMul: 1.24, fatMul: 1.08 } },
    ],
  },
  {
    id: 'passing', label: 'Podania', default: 'mixed',
    options: [
      { id: 'short', label: 'Krótkie', text: 'Więcej posiadania i gry kombinacyjnej. Ryzykowne przy słabej technice i pressingu rywala.', effect: { pos: 0.15, act: { POZ: 1.2, SKR: 0.9, DYS: 0.9, KON: 0.85 }, brkPerTec: 0.05 } },
      { id: 'mixed', label: 'Mieszane', text: 'Bez specjalnych efektów.', effect: {} },
      { id: 'long', label: 'Długie', text: 'Szybko do napastników. Dobre z silnymi, dobrze grającymi głową.', effect: { pos: -0.15, act: { KON: 1.25, SKR: 1.1, POZ: 0.85 }, brkPerAerial: 0.05, fatMidMul: 0.92 } },
    ],
  },
  {
    id: 'pressing', label: 'Pressing', default: 'mid',
    options: [
      { id: 'low', label: 'Niski', text: 'Oddajemy piłkę, czekamy na kontrę. Mniej zmęczenia.', effect: { oppPos: 0.1, act: { KON: 1.15 }, fatMul: 0.9 } },
      { id: 'mid', label: 'Średni', text: 'Bez specjalnych efektów.', effect: {} },
      { id: 'high', label: 'Wysoki', text: 'Odbiór wysoko, ale więcej biegania i fauli.', effect: { oppPos: -0.12, oppPActMul: 0.92, fatMul: 1.2, foulMul: 1.12 } },
    ],
  },
  {
    id: 'line', label: 'Linia obrony', default: 'mid',
    options: [
      { id: 'low', label: 'Niska', text: 'Mniej kontr rywala, za to więcej strzałów z dystansu.', effect: { oppAct: { KON: 0.7, DYS: 1.25 }, oppOffsideMul: 0.6 } },
      { id: 'mid', label: 'Średnia', text: 'Bez specjalnych efektów.', effect: {} },
      { id: 'high', label: 'Wysoka', text: 'Łapiemy na spalonych, ale szybcy napastnicy uciekają za plecy.', effect: { oppAct: { KON: 1.35 }, oppOffsideMul: 1.5, oppPActMul: 0.95, redMul: 1.3 } },
    ],
  },
  {
    id: 'marking', label: 'Krycie', default: 'zone',
    options: [
      { id: 'zone', label: 'Strefowe', text: 'Lepsza obrona stałych fragmentów.', effect: { setPieceD: 0.3 } },
      { id: 'man', label: 'Indywidualne', text: 'Mocne w ataku pozycyjnym rywala, słabsze przeciw kontrom. Męczy.', effect: { DvsPOZ: 0.25, DvsKON: -0.25, fatMul: 1.1, foulMul: 1.1 } },
    ],
  },
  {
    id: 'tempo', label: 'Tempo', default: 'normal',
    options: [
      { id: 'slow', label: 'Wolne', text: 'Spokojna gra, mniej akcji po obu stronach.', effect: { pActMul: 0.88, oppPActMul: 0.94, fatMul: 0.92 } },
      { id: 'normal', label: 'Normalne', text: 'Bez specjalnych efektów.', effect: {} },
      { id: 'fast', label: 'Szybkie', text: 'Więcej akcji, mniej precyzji, otwarty mecz.', effect: { pActMul: 1.1, brk: -0.08, oppPActMul: 1.04, fatMul: 1.12 } },
    ],
  },
  {
    id: 'counter', label: 'Kontratak', default: 'yes',
    options: [
      { id: 'yes', label: 'Tak', text: 'Szybkie wyjścia po odbiorze. Najgroźniejsze, gdy rywal atakuje.', effect: { act: { KON: 1.2, POZ: 0.95 }, konVsAttack: 1.6 } },
      { id: 'no', label: 'Nie', text: 'Spokojne budowanie akcji po odbiorze.', effect: {} },
    ],
  },
  {
    id: 'tackling', label: 'Agresja w odbiorze', default: 'normal',
    options: [
      { id: 'soft', label: 'Łagodna', text: 'Mniej fauli i kartek, słabsza obrona.', effect: { foulMul: 0.8, yellowPerFoul: 0.8, redPerFoul: 0.7, D: -0.2, penMul: 0.85 } },
      { id: 'normal', label: 'Normalna', text: 'Bez specjalnych efektów.', effect: {} },
      { id: 'hard', label: 'Twarda', text: 'Mocniejsza obrona, ale dużo fauli, kartek i ryzyko karnych.', effect: { foulMul: 1.3, yellowPerFoul: 1.25, redPerFoul: 1.6, D: 0.25, penMul: 1.2, oppInjuryMul: 1.3 } },
    ],
  },
  {
    id: 'timewasting', label: 'Gra na czas', default: 'off',
    options: [
      { id: 'off', label: 'Nie', text: 'Normalna gra.', effect: {} },
      { id: 'on', label: 'Tak', text: 'Tylko przy prowadzeniu. Mniej akcji, sędzia dolicza czas i może dać kartkę.', effect: { pActMul: 0.8, oppPActMul: 0.92, addedTime: 1.5, yellowPerMin: 0.004 }, onlyWhenLeading: true },
    ],
  },
];

export const defaultInstructions = () => Object.fromEntries(INSTRUCTIONS.map((i) => [i.id, i.default]));
export const instructionOption = (id, value) => INSTRUCTIONS.find((i) => i.id === id)?.options.find((o) => o.id === value);
