// Reguły rozgrywek 2026/27. Źródło: docs/ekspert_sedzia.md (B1-B6, C1, D) i decyzje użytkownika.
// Wartości oznaczone "verify" nie zostały potwierdzone w tekście regulaminu.
// Przepis o młodzieżowcu: brak (decyzja użytkownika). Limit graczy spoza UE: wyłączony domyślnie.

const yellowPl = [
  { at: 4, games: 1 },
  { at: 8, games: 1 },
  { at: 12, games: 2 },
  { every: 4, after: 12, games: 2 },
];

const matchRules = {
  maxSubs: 5,
  subWindows: 3, // przerwa meczu, przed dogrywką i w przerwie dogrywki nie zużywają okna
  extraTimeExtraSub: 1,
  extraTimeExtraWindow: 1,
  minPlayers: 7,
  treatedPlayerOffMinutes: 1, // IFAB 2026/27
};

export const COMPETITIONS = {
  ekstraklasa: {
    tier: 1, name: 'Ekstraklasa', type: 'league', teams: 18, rounds: 34,
    ...matchRules, benchSize: 12, benchSizeVerify: true, var: true,
    relegationDirect: 3, promotionPlayoff: null,
    yellowSuspension: yellowPl,
    tieBreak: ['points', 'h2hPoints', 'h2hGoalDiff', 'goalDiff', 'goalsFor', 'wins', 'fairPlay', 'lots'],
    lastRoundsSimultaneous: 2,
  },
  liga1: {
    tier: 2, name: '1 Liga', type: 'league', teams: 18, rounds: 34,
    ...matchRules, benchSize: 9, benchSizeVerify: true, var: false,
    promotionDirect: 2,
    promotionPlayoff: { places: [3, 6], pairs: [[3, 6], [4, 5]], singleLeg: true, host: 'higherPlace' },
    relegationDirect: 3,
    yellowSuspension: yellowPl,
    tieBreak: ['points', 'h2hPoints', 'h2hGoalDiff', 'goalDiff', 'goalsFor', 'wins', 'fairPlay', 'lots'],
    lastRoundsSimultaneous: 2,
  },
  liga2: {
    tier: 3, name: '2 Liga', type: 'league', teams: 18, rounds: 34,
    ...matchRules, benchSize: 9, benchSizeVerify: true, var: false,
    promotionDirect: 2,
    promotionPlayoff: { places: [3, 6], pairs: [[3, 6], [4, 5]], singleLeg: true, host: 'higherPlace' },
    relegationDirect: 4,
    relegationPlayoff: { places: [13, 14], vs: 'liga3Stage1Winners', twoLegs: true },
    yellowSuspension: yellowPl,
    tieBreak: ['points', 'h2hPoints', 'h2hGoalDiff', 'goalDiff', 'goalsFor', 'wins', 'fairPlay', 'lots'],
    lastRoundsSimultaneous: 2,
  },
  // III liga: 4 grupy po 18 (wpisy liga3-1 ... liga3-4 dopisane niżej), awans zwycięzców grup, wicemistrzowie w barażach
  pucharPolski: {
    name: 'Puchar Polski', type: 'cup', singleLeg: true, host: 'lowerDivision',
    ...matchRules, benchSize: 12, var: 'fromSemiFinal', varVerify: true,
    extraTime: true, penalties: true, europeanClubsEnterAt: 'R32', reservesAllowed: false,
    yellowSuspension: [{ at: 2, games: 1, verify: true }],
  },
  superpuchar: {
    name: 'Superpuchar Polski', type: 'single', ...matchRules, benchSize: 12, var: true,
    extraTime: false, penalties: true, // [ZAŁOŻENIE] przy remisie od razu karne
  },
  uefa: {
    ...matchRules, benchSize: 12, var: true, listA: 25, homegrownMin: 8, awayGoals: false,
    yellowSuspension: {
      qualifying: { first: 3, thenEvery: 2 },
      main: { first: 4, thenEvery: 2 },
      wipeAfter: ['qualifying', 'quarterFinal'],
    },
  },
};

// III liga 2026/27 (docs/iii-liga.md): 4 grupy po 18 drużyn, 34 kolejki. Zwycięzca grupy awansuje do 2 Ligi,
// wicemistrzowie grają baraże (półfinały jednomeczowe, potem dwumecz z 13. i 14. drużyną 2 Ligi). Spadek: co najmniej
// miejsca 15-18, więcej, gdy z 2 Ligi spada więcej klubów z województw grupy (grupa liczy zawsze 18 drużyn).
export const L3_GROUPS = [1, 2, 3, 4];
const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
for (const g of L3_GROUPS) {
  COMPETITIONS[`liga3-${g}`] = {
    tier: 4, group: g, name: `III liga, grupa ${ROMAN[g]}`, short: `III liga ${ROMAN[g]}`, type: 'league', teams: 18, rounds: 34,
    ...matchRules, benchSize: 9, benchSizeVerify: true, var: false,
    promotionDirect: 1,
    promotionPlayoff: { places: [2, 2], vs: 'liga2-13-14', semisSingleLeg: true, finalTwoLegs: true },
    relegationDirect: 4, relegationVariable: true,
    yellowSuspension: yellowPl,
    tieBreak: ['points', 'h2hPoints', 'h2hGoalDiff', 'goalDiff', 'goalsFor', 'wins', 'fairPlay', 'lots'],
    lastRoundsSimultaneous: 2,
  };
}

// Rezerwy: reguła użytkownika (zawsze) + limit PZPN (włączony decyzją użytkownika).
export const RESERVES = {
  mustBeBelowParent: true,
  reserveMaxTier: 3, // najwyżej 2 Liga
  relegateWithParent: true,
  maxOver22OnPitch: 3,
};

export const NON_EU_LIMIT = { enabled: false, maxOnPitch: 2, tiers: [2, 3] };
