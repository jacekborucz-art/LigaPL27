// Siła drużyny na konkretny mecz, liczona z zawodników, którzy naprawdę mogą zagrać.
// Kontuzjowani, zawieszeni i powołani do reprezentacji wypadają, a luki wypełniają
// zawodnicy grający poza pozycją (z karą z positions.js). Bez bramkarza: kara bramkarska.
// Używają tego zarówno szybka symulacja (mecze w tle), jak i raport w studiu przedmeczowym.

import { clamp } from '../core/rng.js';
import { proficiency, goalkeeperSlotModifiers } from './positions.js';
import { GROUP, isAvailable } from '../career/squad.js';
import { evaluate } from './modifiers.js';
import { slotEff } from './pipeline.js';

export const DEFAULT_SHAPE = { GK: 1, DEF: 4, MID: 4, ATT: 2 };
const SLOT_POS = { GK: 'BR', DEF: 'ŚO', MID: 'ŚP', ATT: 'NAP' };
// Slot grupy dla etapu slot potoku (pozycja bez strony, jak proficiency(p, pos)); prof wpisuje effective() przed odczytem
const GROUP_SLOT = Object.fromEntries(Object.entries(SLOT_POS).map(([g, pos]) => [g, { pos, side: undefined, prof: undefined }]));

/** Wpływ stanu zawodnika w punktach atrybutu: suma z rejestru modyfikatorów (modifiers.js). */
export function conditionTerms(p, ctx = {}) {
  return evaluate('player', p, ctx);
}

function effective(p, group, ctx) {
  const prof = proficiency(p, SLOT_POS[group]);
  const slot = GROUP_SLOT[group];
  slot.prof = prof; // biegłość już policzona: wpis 'position' jej nie liczy drugi raz
  const k = slotEff(p, slot); // etap slot: skuteczność na pozycji
  const t = conditionTerms(p, ctx);
  return { value: p.ovr * k + t.total, prof, posK: k, terms: t.parts };
}

/**
 * Wybór jedenastki z dostępnych zawodników (najlepsi w grupie, luki z innych grup z karą pozycji).
 * Zwraca { xi: [{player, group, value, prof}], missing: [{player, reason}] }
 */
export function pickXI(squad, shape = DEFAULT_SHAPE, ctx = {}) {
  const missing = squad
    .filter((p) => !isAvailable(p))
    .map((p) => ({ player: p, reason: p.injuryDays > 0 ? 'kontuzja' : p.suspended > 0 ? 'zawieszenie' : p.callUp ? 'reprezentacja' : p.teamBlock ? 'druga drużyna klubu' : 'niedostępny' }));
  const pool = squad.filter((p) => isAvailable(p) && !p.benchOnly); // benchOnly: 23+ z pierwszej drużyny ponad limit w jedenastce rezerw
  const used = new Set();
  const xi = [];
  // Ocena zawodnika w grupie liczona raz na wybór składu (wcześniej od nowa dla każdego miejsca); te same liczby
  const memo = new Map();
  const eff = (p, group) => {
    let m = memo.get(p);
    if (!m) memo.set(p, (m = {}));
    return m[group] ?? (m[group] = effective(p, group, ctx));
  };
  const fill = (group, allowOthers) => {
    const cands = pool
      .filter((p) => !used.has(p.id) && (allowOthers ? GROUP[p.pos] !== 'GK' || group === 'GK' : GROUP[p.pos] === group))
      .map((p) => ({ player: p, group, ...eff(p, group) }))
      .sort((a, b) => b.value - a.value);
    return cands[0] || null;
  };
  for (const group of ['GK', 'DEF', 'MID', 'ATT']) {
    for (let i = 0; i < shape[group]; i++) {
      const pick = fill(group, false) || fill(group, true);
      if (!pick) continue;
      used.add(pick.player.id);
      xi.push(pick);
    }
  }
  return { xi, missing };
}

/**
 * Siła drużyny w strefach (skala atrybutów 1-20) + rozbicie na składniki do raportu.
 * ctx: { tableTerm } opcjonalny dodatek "pewności siebie" z tabeli (patrz tableConfidence).
 */
export function teamRating(squad, ctx = {}) {
  const { xi, missing } = pickXI(squad, ctx.shape || DEFAULT_SHAPE, ctx);
  return ratingFromPicked(xi, missing, squad, ctx);
}

/**
 * Siła konkretnego składu ustawionego przez gracza albo AI.
 * entries: [{ player, slot: { pos, side } }] (jedenastka; mniej po czerwonych kartkach).
 */
export function lineupRating(entries, squad = [], ctx = {}) {
  const xi = entries.map(({ player, slot }) => {
    const prof = proficiency(player, slot.pos, slot.side);
    const k = slotEff(player, slot);
    const t = conditionTerms(player, ctx);
    return { player, group: GROUP[slot.pos] ?? 'MID', value: player.ovr * k + t.total, prof, posK: k, terms: t.parts, slot };
  });
  const missing = squad.filter((p) => !isAvailable(p)).map((p) => ({ player: p, reason: 'niedostępny' }));
  return ratingFromPicked(xi, missing, squad, ctx);
}

function ratingFromPicked(xi, missing, squad, ctx) {
  const by = (g) => xi.filter((x) => x.group === g);
  const mean = (arr, f = (x) => x.value) => (arr.length ? arr.reduce((s, x) => s + f(x), 0) / arr.length : 0);
  // Etap team potoku (pipeline.js): pewność siebie z tabeli i decyzje trenera w meczu w tle (zone.all, do wszystkich
  // stref), niepełny skład (zone.field, obniża DEF/MID/ATT); dawne wpisy punktowe zakresu team (pts) jak dotąd
  const teamMods = evaluate('team', { xi, squad }, ctx);
  const extra = teamMods.ch['zone.all'] ?? 0;
  const field = teamMods.ch['zone.field'] ?? 0;
  const gkEntry = by('GK')[0];
  const gkMods = gkEntry ? goalkeeperSlotModifiers(gkEntry.player) : goalkeeperSlotModifiers({ pos: 'NAP' });
  const shooters = [...by('ATT'), ...by('MID')];
  const FIN = mean(shooters, (x) => (x.player.attr?.WYK ?? x.player.ovr) * x.posK) + extra;
  const zones = {
    GK: (gkEntry ? gkEntry.value : 4) + extra,
    DEF: mean(by('DEF')) + extra + field,
    MID: mean(by('MID')) + extra + field,
    ATT: mean(by('ATT')) + extra + field,
    FIN,
  };
  const avg = (k) => mean(xi, (x) => x.terms[k] ?? 0);
  for (const k of ['GK', 'DEF', 'MID', 'ATT', 'FIN']) zones[k] += teamMods.total;
  return {
    zones,
    gkMods,
    xi,
    missing,
    breakdown: {
      base: mean(xi, (x) => x.player.ovr),
      positionLoss: mean(xi, (x) => x.player.ovr * (1 - x.posK)),
      ...Object.fromEntries(Object.keys(xi[0]?.terms ?? {}).map((k) => [k, avg(k)])),
      ...teamMods.parts,
      table: teamMods.chParts.tableConfidence?.['zone.all'] ?? 0, coach: teamMods.chParts.coachDecisions?.['zone.all'] ?? 0, missingCount: missing.length,
    },
  };
}

/**
 * Pewność siebie z tabeli: drużyna punktująca ponad stan dostaje mały plus, poniżej stanu mały minus.
 * Działa od 4. kolejki, maks. +-0.15 punktu atrybutu, żeby nie dublować samej siły kadry.
 */
export function tableConfidence({ played, points }, teamL, leagueL) {
  if (!played || played < 4) return 0;
  const expectedPpg = clamp(1.37 + 0.55 * (teamL - leagueL), 0.5, 2.5);
  return clamp(0.15 * (points / played - expectedPpg), -0.15, 0.15);
}
