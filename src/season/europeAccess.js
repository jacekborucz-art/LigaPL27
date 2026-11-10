// Kto z Polski gra w pucharach w następnym sezonie: miejsce w Ekstraklasie albo Puchar Polski.
// Liczba miejsc i rundy wejścia zależą od pozycji Polski w rankingu krajowym UEFA (5 sezonów).
// Źródło: docs/ekspert_sedzia.md, B6. Wpisy z sure:false są założeniami do weryfikacji
// (od 2027/28 obowiązuje nowa lista dostępu UEFA 2027-2030).

/**
 * Tabela dostępu wg pozycji kraju w rankingu. Każdy slot: źródło (league:N albo cup), rozgrywki, runda, ścieżka.
 * Kolejność slotów = priorytet przydziału.
 */
export const ACCESS_BY_RANK = [
  {
    ranks: [1, 10], sure: false,
    slots: [
      { src: 'league:1', comp: 'LM', entry: 'LP' },
      { src: 'league:2', comp: 'LM', entry: 'Q3', path: 'league' },
      { src: 'cup', comp: 'LE', entry: 'LP' },
      { src: 'league:3', comp: 'LE', entry: 'Q3' },
      { src: 'league:4', comp: 'LK', entry: 'Q3' },
    ],
  },
  {
    ranks: [11, 12], sure: false, // mistrz w play-off LM przy 12. miejscu: [ŹRÓDŁO] meczyki.pl; reszta założeniem
    slots: [
      { src: 'league:1', comp: 'LM', entry: 'PO', path: 'champions' },
      { src: 'league:2', comp: 'LM', entry: 'Q2', path: 'league' },
      { src: 'cup', comp: 'LE', entry: 'Q3' },
      { src: 'league:3', comp: 'LK', entry: 'Q3' },
      { src: 'league:4', comp: 'LK', entry: 'Q2' },
    ],
  },
  {
    ranks: [13, 15], sure: true, // 2026/27, Polska 15.
    slots: [
      { src: 'league:1', comp: 'LM', entry: 'Q2', path: 'champions' },
      { src: 'league:2', comp: 'LM', entry: 'Q2', path: 'league' },
      { src: 'cup', comp: 'LE', entry: 'Q3' },
      { src: 'league:3', comp: 'LK', entry: 'Q2' },
      { src: 'league:4', comp: 'LK', entry: 'Q2' },
    ],
  },
  {
    ranks: [16, 33], sure: false,
    slots: [
      { src: 'league:1', comp: 'LM', entry: 'Q1', path: 'champions' },
      { src: 'cup', comp: 'LK', entry: 'Q2' },
      { src: 'league:2', comp: 'LK', entry: 'Q2' },
      { src: 'league:3', comp: 'LK', entry: 'Q2' },
    ],
  },
  {
    ranks: [34, 55], sure: false,
    slots: [
      { src: 'league:1', comp: 'LM', entry: 'Q1', path: 'champions' },
      { src: 'cup', comp: 'LK', entry: 'Q1' },
      { src: 'league:2', comp: 'LK', entry: 'Q1' },
      { src: 'league:3', comp: 'LK', entry: 'Q1' },
    ],
  },
];

export function accessForRank(rank) {
  const row = ACCESS_BY_RANK.find((r) => rank >= r.ranks[0] && rank <= r.ranks[1]);
  if (!row) throw new RangeError(`Brak listy dostępu dla pozycji ${rank}`);
  return row;
}

/**
 * Przydział miejsc w pucharach.
 * @param {string[]} table  końcowa tabela Ekstraklasy (id klubów, od 1. miejsca)
 * @param {{winner:string|null, runnerUp:string|null}} cup  finaliści Pucharu Polski (mogą być spoza Ekstraklasy)
 * @param {number} countryRank  pozycja Polski w rankingu krajowym UEFA
 * @param {(id:string)=>boolean} eligible  np. brak licencji, rezerwy; domyślnie wszyscy
 * @param {{cupFallback?:'finalist'|'league'}} opts
 * @returns {{club:string, comp:string, entry:string, path?:string, via:string}[]}
 *
 * Reguły:
 *  - mistrz i wicemistrz biorą swoje miejsca;
 *  - miejsce pucharowe bierze zdobywca PP;
 *  - jeśli zdobywca PP ma już miejsce z ligi (np. dublet mistrza), miejsce PP dostaje
 *    przegrany finalista (decyzja użytkownika, cupFallback = 'finalist', domyślnie);
 *    jeśli finalista też ma już miejsce albo nie ma prawa gry, miejsce przechodzi na najwyżej
 *    sklasyfikowany klub bez kwalifikacji (obecna praktyka UEFA, cupFallback = 'league');
 *  - pozostałe miejsca ligowe przechodzą w dół tabeli na kolejne kluby bez kwalifikacji;
 *  - żaden klub nie dostaje dwóch miejsc.
 */
export function allocateEuropeanSpots(table, cup, countryRank, eligible = () => true, opts = {}) {
  const { winner: cupWinner = null, runnerUp: cupRunnerUp = null } = cup || {};
  const cupFallback = opts.cupFallback || 'finalist';
  const { slots } = accessForRank(countryRank);
  const order = table.filter(eligible);
  const taken = new Set();
  const out = [];
  const nextFree = () => order.find((id) => !taken.has(id)) || null;
  const give = (club, slot, via) => {
    if (!club) return;
    taken.add(club);
    out.push({ club, comp: slot.comp, entry: slot.entry, ...(slot.path ? { path: slot.path } : {}), via });
  };

  // 1. Mistrz i wicemistrz (miejsca 1-2 są zawsze "swoje").
  for (const slot of slots.filter((s) => s.src === 'league:1' || s.src === 'league:2')) {
    const pos = Number(slot.src.split(':')[1]);
    const club = table[pos - 1];
    give(club && eligible(club) ? club : nextFree(), slot, `${pos}. miejsce`);
  }
  // 2. Puchar Polski.
  const cupSlot = slots.find((s) => s.src === 'cup');
  if (cupSlot) {
    const free = (id) => id && eligible(id) && !taken.has(id);
    if (free(cupWinner)) give(cupWinner, cupSlot, 'Puchar Polski');
    else if (cupFallback === 'finalist' && free(cupRunnerUp)) give(cupRunnerUp, cupSlot, 'finalista Pucharu Polski');
    else give(nextFree(), cupSlot, 'miejsce po zdobywcy PP');
  }
  // 3. Pozostałe miejsca ligowe w dół tabeli.
  for (const slot of slots.filter((s) => s.src.startsWith('league:') && Number(s.src.split(':')[1]) > 2)) {
    const club = nextFree();
    const pos = club ? table.indexOf(club) + 1 : null;
    give(club, slot, pos ? `${pos}. miejsce` : 'brak');
  }
  return out;
}
