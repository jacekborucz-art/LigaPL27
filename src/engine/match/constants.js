// Stałe pełnego silnika meczowego (docs/ekspert_futbol.md 6.1, kalibracja [SYM] na 30 000 meczów)
// oraz zdarzeń dodanych dla statystyk (PLAN 3.1). Balans w jednym miejscu.

export const K = {
  posK: 0.20, posHome: 0.02, posClamp: [0.25, 0.75],
  pAction: 0.39, kCreate: 0.05, lateRamp: 0.004, // 0.37 -> 0.385 po kalibracji na prawdziwych kadrach, 0.39 po faulach taktycznych (sytuacje-meczowe.md)
  typeW: { POZ: 0.50, SKR: 0.22, KON: 0.13, DYS: 0.15 },
  brkBase: { POZ: -0.15, SKR: -0.25, KON: 0.35, DYS: 1.6 }, kBreak: 0.15,
  failCorner: { POZ: 0.34, SKR: 0.50, KON: 0.20, DYS: 0.40 },
  failOffside: { POZ: 0.11, SKR: 0.05, KON: 0.20, DYS: 0 },
  offsideTick: 0.032,
  penPerAction: 0.0082, penConv: 0.78,
  xg: {
    POZ: [[0.62, 0.03, 0.08], [0.28, 0.09, 0.22], [0.10, 0.25, 0.55]],
    SKR: [[0.60, 0.03, 0.07], [0.32, 0.08, 0.18], [0.08, 0.22, 0.45]],
    KON: [[0.40, 0.04, 0.10], [0.38, 0.10, 0.25], [0.22, 0.25, 0.60]],
    DYS: [[0.85, 0.01, 0.04], [0.15, 0.04, 0.08]],
  },
  kFin: 0.05, finOffset: 1.4, // przesunięcie: przeciętny strzelec vs bramkarz (kalibracja: gole ~ xG)
  cornerShot: 0.30, cornerXg: [0.04, 0.14], saveCorner: 0.30, blockCorner: 0.33,
  foulTick: 0.27, foulDefShare: 0.78, dangerFK: 0.14,
  fkDirect: 0.45, fkXgD: [0.04, 0.09], fkCrossShot: 0.30, fkXgC: [0.05, 0.15],
  yellowPerFoul: 0.140, redPerFoul: 0.0027, otherYellowTick: 0.0032, // ŻK/faul 0.14 -> 0.155 (cel 4,3/mecz, PLAN 2.1)
  bookedFoulMul: 0.4, bookedYellowMul: 0.7,
  homeCreate: 1.15, awayCreate: 0.90, homeCardMul: 0.88, awayCardMul: 1.15,
  ogPerMatch: 0.08,
  injTick: 4.3e-4, injContact: 0.004, // kontakt 0.012 -> 0.004: ok. 0,45 urazu widocznego w meczu (cel ok. 0,4)
  // VAR (ekspert_sedzia A4): anulowany gol, karny odwołany, karny podyktowany po VAR (na nieudaną akcję
  // w polu karnym), czerwona dodana po VAR (na żółtą za faul), czerwona zmieniona na żółtą, druga żółta cofnięta
  varGoalCancel: 0.04, varPenAdd: 0.0015, varPenCancel: 0.10, varRedAdd: 0.008, varRedCancel: 0.08, varSecondYellowCancel: 0.03,
  varGoalConfirm: 0.10, // widoczne sprawdzenie gola zakończone uznaniem [SZAC]
  postShare: 0.03, // część strzałów niecelnych z dużym xG trafia w słupek lub poprzeczkę
  // Statystyki dodatkowe [SZAC] (PLAN 3.1)
  passesPerMinute: 8.6, passAcc: 0.785, goalKickOnFail: 0.2, throwInTick: 0.44, goalKickPerMiss: 0.9,
  // Gra w osłabieniu, stan meczu od 65'
  shortHanded: 0.9,
  gsLeadAct: 0.85, gsLeadD: 0.3, gsTrailAct: 1.12, gsTrailD: -0.4, gsFrom: 65,
  // Momentum
  momentumScale: 12, momentumAct: 0.06,
  // Sytuacje meczowe (docs/sytuacje-meczowe.md) [SZAC]
  redShare: { dogso: 0.40, sfp: 0.33, violent: 0.12, handball: 0.15 }, // powody bezpośrednich czerwonych
  tacFoul: 0.08, tacFoulYellow: 0.85, tacFoulDogso: 0.05, // faul taktyczny przerywający groźną kontrę
  penRetake: 0.05, penRebound: 0.35, penReboundXg: [0.15, 0.45], // powtórka (bramkarz przed linią), dobitka
  benchCardTick: 0.00035, benchRedShare: 0.08, // kartka dla rezerwowego lub zmienionego zawodnika
  staffCardTick: 0.0007, staffRedShare: 0.08, // kartka dla trenera lub członka sztabu
  gkUp: { shotMul: 1.35, counter: 0.25, counterXg: [0.45, 0.75] }, // bramkarz w polu karnym rywala przy rożnym
  concussionMax: 2, // dodatkowe zmiany po wstrząśnieniu mózgu, tylko gdy rozgrywki je stosują (ctx.concussionSubs)
  addedExtraMax: 2, // przedłużenie doliczonego czasu za zdarzenia w doliczonym czasie
  coolingTempC: 32, coolingAdded: 3, // przerwa na schłodzenie (upał), doliczony czas
  minPlayers: 7,
};

// Bezpośrednia czerwona kartka: kod -> [kod dla studia (długość kary), opis]
export const RED_REASONS = {
  second: ['druga żółta', 'druga żółta kartka'],
  dogso: ['dogso', 'faul taktyczny: pozbawienie oczywistej okazji bramkowej'],
  handball: ['ręka', 'zagranie ręką: pozbawienie oczywistej okazji bramkowej'],
  sfp: ['rażący', 'rażący faul (nadmierna siła)'],
  violent: ['przemoc', 'gwałtowne zachowanie'],
};

// Udział ról w strefach (6.1 a)
export const ROLE_SHARE = {
  BR: { DEF: 0, MID: 0, ATT: 0 },
  ŚO: { DEF: 1.0, MID: 0.1, ATT: 0 },
  BO: { DEF: 0.8, MID: 0.3, ATT: 0.1 },
  WB: { DEF: 0.6, MID: 0.4, ATT: 0.2 },
  DP: { DEF: 0.45, MID: 0.75, ATT: 0 },
  ŚP: { DEF: 0.2, MID: 0.85, ATT: 0.15 },
  OP: { DEF: 0, MID: 0.55, ATT: 0.6 },
  SP: { DEF: 0.15, MID: 0.6, ATT: 0.45 },
  SN: { DEF: 0, MID: 0.3, ATT: 0.9 },
  NAP: { DEF: 0, MID: 0.1, ATT: 1.1 },
};
export const ZONE_N = { DEF: 4.3, MID: 3.9, ATT: 3.4 };

export const SHOOT_W = { BR: 0, ŚO: 0.5, BO: 0.5, WB: 0.5, DP: 0.6, ŚP: 1.2, SP: 1.6, SN: 2.2, OP: 1.8, NAP: 3.2 };
export const FOUL_W = { BR: 0.1, ŚO: 1.4, BO: 1.2, WB: 1.1, DP: 1.5, ŚP: 1.0, SP: 0.8, SN: 0.8, OP: 0.7, NAP: 0.9 };
export const FATIGUE_ROLE = { WB: 1.15, SP: 1.1, SN: 1.1, ŚP: 1.05, DP: 1.05, BO: 1.05, OP: 1.0, NAP: 0.95, ŚO: 0.85, BR: 0.2 };

// Kontuzje (8.2): [nazwa, min dni, max dni, grywalna z bólem]
export const INJURY_TYPES = {
  light: [['stłuczenie', 1, 5, true], ['naciągnięcie mięśnia', 5, 14, true], ['lekkie skręcenie kostki', 4, 12, true], ['wstrząśnienie mózgu', 7, 10, false]],
  medium: [['naderwanie mięśnia dwugłowego', 18, 35, false], ['uraz przywodziciela', 15, 30, false], ['skręcenie kostki z uszkodzeniem więzadła', 20, 42, false], ['uraz więzadła pobocznego kolana', 25, 42, false]],
  severe: [['złamanie kości śródstopia', 50, 90, false], ['zerwanie więzadła krzyżowego', 190, 270, false], ['uraz barku', 45, 80, false], ['zerwanie ścięgna Achillesa', 180, 240, false]],
};

// Oceny meczowe (6.1 d)
export const RATING = {
  start: 6.0, goal: 1.0, goalNap: 0.9, goalDef: 1.2, assist: 0.6, keyPass: 0.15, shotOn: 0.1, bigMiss: -0.3,
  tackle: 0.08, wonPen: 0.3, concededPen: -0.6, saveBase: 0.1, saveXg: 0.6,
  conceded: { BR: -0.3, ŚO: -0.2, BO: -0.2, WB: -0.2, DP: -0.1 },
  cleanSheet: { BR: 0.6, ŚO: 0.4, BO: 0.4, WB: 0.4, DP: 0.2 },
  yellow: -0.3, red: -1.5, errorGoal: -1.0, errorP: 0.08, offside: -0.05, win: 0.2, loss: -0.2, noise: 0.2,
};

export const SHOUTS = {
  naprzod: { label: 'Naprzód!', actMul: 1.06, D: -0.10 },
  uwaga: { label: 'Uwaga z tyłu!', actMul: 0.95, D: 0.15 },
  spokojnie: { label: 'Spokojnie!', calm: true, yellowMul: 0.8 },
  walka: { label: 'Więcej walki!', Z: 2, foulMul: 1.1, yellowMul: 1.15 },
  brawo: { label: 'Brawo!', Z: 1, morale: 0.3, maxUses: 2 },
};
export const SHOUT_COOLDOWN = 8;
export const SHOUT_DURATION = 8;
