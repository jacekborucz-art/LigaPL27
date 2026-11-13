// Reprezentacje spoza Europy w pamięci gry: CONMEBOL, CONCACAF (strefy NAFU, UNCAF, CFU) i OFC
// (src/data/reprezentacje_swiat.json, generator tools/federacje_gen.cjs, docs/reprezentacje.md).
// Podstawa pod mistrzostwa kontynentalne rozgrywane w tle (Copa América, Złoty Puchar, Puchar Narodów Oceanii).

import DATA from '../data/reprezentacje_swiat.json' with { type: 'json' };

export const FEDERATIONS = DATA.federacje;
export const WORLD_NT = DATA.reprezentacje;
const BY_CODE = new Map(WORLD_NT.map((t) => [t.kod, t]));

/** Reprezentacja po kodzie (FIFA albo kod federacji dla członków spoza FIFA). */
export const worldTeam = (code) => BY_CODE.get(code) ?? null;

/** Reprezentacje federacji (opcjonalnie strefy CONCACAF), od najsilniejszej. onlyFifa: bez członków spoza FIFA. */
export function federationTeams(conf, { zone = null, onlyFifa = false } = {}) {
  return WORLD_NT.filter((t) => t.konfederacja === conf && (!zone || t.strefa === zone) && (!onlyFifa || t.czlonekFIFA))
    .sort((a, b) => b.L - a.L || a.nazwa.localeCompare(b.nazwa, 'pl'));
}

/** Najsilniejsze reprezentacje federacji (np. uczestnicy turnieju bez eliminacji). */
export const topTeams = (conf, n, opts = {}) => federationTeams(conf, opts).slice(0, n);
