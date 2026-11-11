// Zasady meczu ustalone przed pierwszym gwizdkiem (docs/sparingi-i-karne.md): rozstrzygnięcie remisu i reguła zmian.
// Mecze o stawkę biorą rozstrzygnięcie z ctx.knockout (bez zmian), sparingi z ctx.friendlyRules (umowa klubów).

/** Rozstrzygnięcie remisu: brak, od razu rzuty karne, dogrywka i rzuty karne. */
export const DECIDERS = ['none', 'penalties', 'et_penalties'];
/** Reguła zmian: standard (5 w 3 oknach), bez limitu (zmieniony nie wraca), rotacyjne (zmieniony może wrócić). */
export const SUB_RULES = ['standard', 'unlimited', 'rolling'];
/** Plan rotacji w sparingu dla asystenta gracza i AI: auto, dwie jedenastki (wymiana w przerwie), stopniowo, jak w meczu. */
export const ROTATIONS = ['auto', 'two_xi', 'staggered', 'match'];

/** Limit zmian i okien przy regule bez limitu (liczba, nie Infinity: stan meczu da się zapisać w JSON). */
export const UNLIMITED = 99;

/**
 * Domyślne zasady sparingu [SZAC]: dogrywki nie ma, przy remisie od razu karne tylko na życzenie,
 * zmiany bez limitu, zmieniony zawodnik nie wraca (typowa umowa w polskich sparingach z sędzią PZPN).
 */
export const FRIENDLY_DEFAULTS = { decider: 'none', subs: 'unlimited', rotation: 'auto' };

/**
 * Zasady meczu z ctx: { friendly, decider, subs, reentry, rotation, plannedSubs }.
 * ctx.friendlyRules: { decider?, subs?, rotation?, period?: 'lato'|'zima'|'fifa', plannedSubs?: { 0|1: [{ at, outId, inId }] } }.
 * ctx.friendly: true bez friendlyRules = sparing z FRIENDLY_DEFAULTS. Mecz o stawkę: decyzja z ctx.knockout
 * ('single' i dwumecz: dogrywka i karne, 'penaltiesOnly': od razu karne), zmiany zawsze standardowe.
 */
export function matchRules(ctx = {}) {
  const fr = ctx.friendlyRules ?? (ctx.friendly ? {} : null);
  if (fr) {
    const decider = DECIDERS.includes(fr.decider) ? fr.decider : FRIENDLY_DEFAULTS.decider;
    const subs = SUB_RULES.includes(fr.subs) ? fr.subs : FRIENDLY_DEFAULTS.subs;
    const rotation = ROTATIONS.includes(fr.rotation) ? fr.rotation : FRIENDLY_DEFAULTS.rotation;
    return { friendly: true, decider, subs, reentry: subs === 'rolling', rotation, period: fr.period ?? null, plannedSubs: fr.plannedSubs ?? null };
  }
  const ko = ctx.knockout;
  const decider = !ko ? 'none' : ko === 'penaltiesOnly' ? 'penalties' : 'et_penalties';
  return { friendly: false, decider, subs: 'standard', reentry: false, rotation: 'match', period: null, plannedSubs: null };
}

/** Czy reguła zmian znosi limity (liczba zmian i okien). */
export const unlimitedSubs = (M) => M.rules?.subs === 'unlimited' || M.rules?.subs === 'rolling';
