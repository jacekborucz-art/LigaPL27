// Skład na mecz: formacja, jedenastka (zawodnik na każdym slocie), ławka, instrukcje,
// kapitan i wykonawcy stałych fragmentów. Gracz i AI używają tych samych funkcji.
// Stan taktyki to czysty JSON zapisywany w grze (game.tactics).

import { formationById, DEFAULT_FORMATION } from '../data/formations.js';
import { defaultInstructions, INSTRUCTIONS } from '../data/instructions.js';
import { proficiency, posEff, assessLineup, validateLineup } from './positions.js';
import { conditionTerms, lineupRating } from './teamStrength.js';
import { GROUP, isAvailable } from '../career/squad.js';
import { knockEligible } from './match/teams.js';

/** Wartość zawodnika na danym slocie (OVR z karą pozycji + stan zawodnika). */
export function slotValue(player, slot) {
  if (!isAvailable(player)) return -Infinity;
  return player.ovr * posEff(proficiency(player, slot.pos, slot.side)) + conditionTerms(player).total;
}
const slotValueBase = slotValue;

/**
 * Prośby do asystenta o skład (Skład i taktyka, menu „Poproś asystenta”): pierwszeństwo dodawane do wartości
 * zawodnika na slocie [SZAC]. Skala OVR 1-20, więc dodatki rzędu kilkunastu punktów przeważają nad różnicą umiejętności.
 */
export const AUTO_MODES = {
  best: { label: 'Najmocniejszy skład', note: 'Najlepsi dostępni zawodnicy.' },
  second: { label: 'Drugi skład', note: 'Zawodnicy spoza najmocniejszej jedenastki, gdy tylko się da.' },
  young: { label: 'Najmłodsi', note: 'Pierwszeństwo dla najmłodszych, na ich pozycjach.' },
  fresh: { label: 'Najbardziej wypoczęci', note: 'Pierwszeństwo dla najświeższych.' },
  minutes: { label: 'Najmniej grający', note: 'Pierwszeństwo dla tych, którzy w sezonie grali najmniej albo wcale.' },
};
function modeBonus(mode, squad, formation) {
  if (mode === 'second') { const first = new Set(autoPickXI(squad, formation).filter(Boolean)); return (p) => (first.has(p.id) ? -40 : 0); }
  if (mode === 'young') return (p) => 1.5 * Math.max(0, 32 - (p.age ?? 25));
  if (mode === 'fresh') return (p) => 0.6 * ((p.fresh ?? 95) - 60);
  if (mode === 'minutes') return (p) => -Math.min(25, 2 * (p.season?.min ?? 0) / 90);
  return null;
}

/**
 * Automatyczny wybór jedenastki (asystent i AI): zachłannie po najlepszym dopasowaniu
 * zawodnik-slot, bramkarz najpierw, potem poprawa przez zamiany par.
 */
export function autoPickXI(squad, formation, { bonus = null } = {}) {
  const slots = formation.slots;
  const pool = squad.filter((p) => isAvailable(p) && !p.benchOnly); // benchOnly: 23+ z pierwszej drużyny ponad limit 3 w jedenastce rezerw
  // bonus(p): pierwszeństwo z prośby do asystenta (AUTO_MODES), ważone dopasowaniem do pozycji, żeby nie stawiać nikogo nie na swoim miejscu
  const slotValue = bonus ? (p, slot) => { const v = slotValueBase(p, slot); return v === -Infinity ? v : v + posEff(proficiency(p, slot.pos, slot.side)) * bonus(p); } : slotValueBase;
  const xi = new Array(slots.length).fill(null);
  const used = new Set();
  const order = [0, ...slots.map((_, i) => i).filter((i) => i !== 0)]; // slot 0 = BR
  const gkSlot = slots.findIndex((s) => s.pos === 'BR');
  if (gkSlot >= 0) {
    const gk = pool.filter((p) => p.pos === 'BR').sort((a, b) => slotValue(b, slots[gkSlot]) - slotValue(a, slots[gkSlot]))[0]
      || pool.sort((a, b) => (b.attr?.SKO ?? 0) - (a.attr?.SKO ?? 0))[0];
    if (gk) { xi[gkSlot] = gk.id; used.add(gk.id); }
  }
  // Pary zawodnik-slot od najlepszej wartości.
  const pairs = [];
  for (const i of order) {
    if (i === gkSlot) continue;
    for (const p of pool) if (p.pos !== 'BR') pairs.push([slotValue(p, slots[i]), p.id, i]);
  }
  pairs.sort((a, b) => b[0] - a[0]);
  for (const [, id, i] of pairs) {
    if (xi[i] || used.has(id)) continue;
    xi[i] = id; used.add(id);
  }
  // Zamiany par, jeśli poprawiają sumę.
  const byId = new Map(squad.map((p) => [p.id, p]));
  const val = (id, i) => (id ? slotValue(byId.get(id), slots[i]) : 0);
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let a = 0; a < xi.length; a++) {
      for (let b = a + 1; b < xi.length; b++) {
        if (a === gkSlot || b === gkSlot) continue;
        const before = val(xi[a], a) + val(xi[b], b);
        const after = val(xi[b], a) + val(xi[a], b);
        if (after > before + 1e-9) { [xi[a], xi[b]] = [xi[b], xi[a]]; improved = true; }
      }
    }
    if (!improved) break;
  }
  return xi;
}

// Role na ławce w kolejności pokrycia (docs/sklad-lawki.md): środek obrony, boczny obrońca, środek pomocy,
// skrzydło lub ofensywny pomocnik, napastnik.
export const BENCH_ROLES = [['ŚO'], ['BO', 'WB'], ['DP', 'ŚP'], ['BP', 'SN', 'OP'], ['NAP']];
const BENCH_COVER_PROF = 70; // najniższa biegłość zawodnika uniwersalnego na roli bez nominalnego
const BENCH_ROLE_MAX = 3; // najwyżej tylu zawodników jednej roli przy dobieraniu wolnych miejsc
const BENCH_VERSATILE = 0.1; // [SZAC] dodatek OVR za każdą inną rolę z biegłością co najmniej 85
const BENCH_SECOND_GK = 12; // od takiej ławki wolne miejsce bez zawodników z pola może zająć drugi bramkarz
const roleOf = (p) => BENCH_ROLES.findIndex((r) => r.includes(p.pos));
/** Wartość zawodnika z pola na roli: najlepsza pozycja roli (OVR z karą pozycji) i biegłość. */
const roleFit = (p, role) => role.reduce((best, pos) => {
  const prof = proficiency(p, pos);
  const v = p.ovr * posEff(prof);
  return v > best.v ? { v, prof } : best;
}, { v: -Infinity, prof: 0 });

/**
 * Ławka (asystent gracza i AI, te same zasady): jeden rezerwowy bramkarz, potem pokrycie ról (ŚO, boczny obrońca,
 * środek pomocy, skrzydło lub OP, napastnik), reszta najlepsi z pola (najwyżej 3 z jednej roli). Drugi bramkarz
 * tylko przy ławce 12, gdy nie ma już nikogo z pola. keep: zawodnicy już na ławce (np. wybrani przez gracza), zostają i liczą się
 * do pokrycia. Remis wartości rozstrzyga identyfikator, więc wynik jest powtarzalny.
 * gks: liczba rezerwowych bramkarzy (2 w pucharach UEFA, benchGk w src/config/competitions.js); drugi wchodzi po
 * pokryciu ról, przed wolnymi miejscami.
 */
export function autoPickBench(squad, xi, benchSize, keep = [], { gks = 1 } = {}) {
  if (!(benchSize > 0)) return [];
  const inXI = new Set(xi.filter(Boolean));
  const byId = new Map(squad.map((p) => [p.id, p]));
  const bench = [...new Set(keep)].filter((id) => byId.has(id) && !inXI.has(id) && isAvailable(byId.get(id))).slice(0, benchSize);
  const cond = new Map();
  const condOf = (p) => { if (!cond.has(p.id)) cond.set(p.id, conditionTerms(p).total); return cond.get(p.id); };
  const byIdTie = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const rest = () => squad.filter((p) => isAvailable(p) && !inXI.has(p.id) && !bench.includes(p.id));
  const full = () => bench.length >= benchSize;
  const addGk = (n) => {
    if (full() || bench.filter((id) => byId.get(id).pos === 'BR').length >= n) return;
    const gk = rest().filter((p) => p.pos === 'BR').sort((a, b) => (b.ovr + condOf(b)) - (a.ovr + condOf(a)) || byIdTie(a, b))[0];
    if (gk) bench.push(gk.id);
  };
  // 1. Rezerwowy bramkarz
  addGk(1);
  // 2. Pokrycie ról: najpierw nominalny, gdy go brak, uniwersalny z biegłością co najmniej 70
  for (const role of BENCH_ROLES) {
    if (full()) break;
    if (bench.some((id) => role.includes(byId.get(id).pos))) continue;
    const cands = rest().filter((p) => p.pos !== 'BR').map((p) => ({ p, ...roleFit(p, role) }))
      .filter((c) => c.prof >= BENCH_COVER_PROF);
    const natural = cands.filter((c) => role.includes(c.p.pos));
    const cand = (natural.length ? natural : cands)
      .sort((a, b) => (b.v + condOf(b.p)) - (a.v + condOf(a.p)) || byIdTie(a.p, b.p))[0];
    if (cand) bench.push(cand.p.id);
  }
  // 2b. Puchary UEFA: drugi rezerwowy bramkarz (trzeci bramkarz w protokole, praktyka przy 12 rezerwowych)
  if (gks >= 2) addGk(2);
  // 3. Wolne miejsca: najlepsi z pola (najlepsza rola, stan zawodnika, mały dodatek za uniwersalność)
  const fillValue = (p) => {
    let best = -Infinity; let extra = 0;
    BENCH_ROLES.forEach((role, i) => {
      const f = roleFit(p, role);
      best = Math.max(best, f.v);
      if (i !== roleOf(p) && f.prof >= 85) extra++;
    });
    return best + condOf(p) + BENCH_VERSATILE * extra;
  };
  const outfield = rest().filter((p) => p.pos !== 'BR').map((p) => ({ p, v: fillValue(p) }))
    .sort((a, b) => b.v - a.v || byIdTie(a.p, b.p));
  const perRole = (r) => bench.filter((id) => roleOf(byId.get(id)) === r).length;
  for (const pass of [true, false]) {
    for (const { p } of outfield) {
      if (full()) break;
      if (bench.includes(p.id)) continue;
      if (pass && perRole(roleOf(p)) >= BENCH_ROLE_MAX) continue;
      bench.push(p.id);
    }
  }
  // 4. Drugi bramkarz tylko przy ławce 12 i tylko wtedy, gdy nie ma już nikogo z pola (przy 7 i 9 miejsce zostaje puste)
  for (const p of rest().filter((x) => x.pos === 'BR').sort((a, b) => b.ovr - a.ovr || byIdTie(a, b))) {
    if (full() || benchSize < BENCH_SECOND_GK) break;
    bench.push(p.id);
  }
  return bench;
}

const score = (p, keys) => keys.reduce((s, k) => s + (p.attr?.[k] ?? 0), 0);

/** Kapitan i wykonawcy stałych fragmentów spośród jedenastki. */
export function autoRoles(squad, xi) {
  const players = xi.filter(Boolean).map((id) => squad.find((p) => p.id === id)).filter(Boolean);
  const best = (keys, pred = () => true) => players.filter(pred).sort((a, b) => score(b, keys) - score(a, keys))[0]?.id ?? null;
  return {
    captain: players.sort((a, b) => (b.attr.LID + (b.persona === 'Lider' ? 3 : 0) + b.age * 0.1) - (a.attr.LID + (a.persona === 'Lider' ? 3 : 0) + a.age * 0.1))[0]?.id ?? null,
    penalty: best(['WYK', 'OPA', 'SFR'], (p) => p.pos !== 'BR'),
    freeKick: best(['SFR', 'DYS', 'TEC'], (p) => p.pos !== 'BR'),
    corner: best(['SFR', 'DOS'], (p) => p.pos !== 'BR'),
  };
}

/** benchGk: liczba rezerwowych bramkarzy (COMPETITIONS[comp].benchGk, 2 w pucharach UEFA). */
export function createTactics(squad, { formation = DEFAULT_FORMATION, benchSize = 12, instructions, benchGk = 1, mode = 'best' } = {}) {
  const f = formationById(formation);
  const xi = autoPickXI(squad, f, { bonus: modeBonus(mode, squad, f) });
  return {
    formation: f.id,
    xi,
    bench: autoPickBench(squad, xi, benchSize, [], { gks: benchGk }),
    instructions: { ...defaultInstructions(), ...(instructions || {}) },
    ...autoRoles(squad, xi),
  };
}

/** Zmiana formacji: zawodnicy zostają, asystent dopasowuje ich do nowych slotów. */
export function changeFormation(tactics, squad, formationId) {
  const f = formationById(formationId);
  const chosen = new Set(tactics.xi.filter(Boolean));
  const pool = squad.filter((p) => chosen.has(p.id));
  const xi = autoPickXI(pool.length >= 11 ? pool : squad, f);
  return { ...tactics, formation: f.id, xi, bench: tactics.bench.filter((id) => !xi.includes(id)) };
}

/**
 * Przypisanie zawodnika do miejsca: target { type: 'xi'|'bench', idx }.
 * Jeśli zawodnik był już w jedenastce albo na ławce, następuje zamiana miejsc.
 */
export function assign(tactics, target, playerId) {
  const t = { ...tactics, xi: [...tactics.xi], bench: [...tactics.bench] };
  const fromXI = t.xi.indexOf(playerId);
  const fromBench = t.bench.indexOf(playerId);
  const list = target.type === 'xi' ? t.xi : t.bench;
  const displaced = list[target.idx] ?? null;
  if (fromXI >= 0) t.xi[fromXI] = displaced;
  if (fromBench >= 0) {
    if (displaced) t.bench[fromBench] = displaced; else t.bench.splice(fromBench, 1);
  }
  if (target.type === 'bench' && target.idx >= t.bench.length) t.bench.push(playerId);
  else list[target.idx] = playerId;
  t.bench = t.bench.filter(Boolean);
  for (const role of ['captain', 'penalty', 'freeKick', 'corner']) if (t[role] && !t.xi.includes(t[role])) t[role] = null;
  return t;
}

export function removeFromBench(tactics, playerId) {
  return { ...tactics, bench: tactics.bench.filter((id) => id !== playerId) };
}

export function setInstruction(tactics, id, value) {
  const def = INSTRUCTIONS.find((i) => i.id === id);
  if (!def || !def.options.some((o) => o.id === value)) throw new Error(`Nieznana instrukcja: ${id}=${value}`);
  return { ...tactics, instructions: { ...tactics.instructions, [id]: value } };
}

/** Wpisy jedenastki z obiektami zawodników i slotów (do oceny i silnika). */
export function lineupEntries(tactics, squadById) {
  const f = formationById(tactics.formation);
  return tactics.xi.map((id, i) => (id && squadById.get(id) ? { player: squadById.get(id), slot: f.slots[i] } : null)).filter(Boolean);
}

/** Błędy blokujące mecz (reguły twarde) i ostrzeżenia (kary w silniku). */
export function checkTactics(tactics, squad, { benchSize = 12 } = {}) {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const f = formationById(tactics.formation);
  const entries = lineupEntries(tactics, byId);
  const errors = validateLineup(entries, { bench: tactics.bench.map((id) => byId.get(id)).filter(Boolean), formationSlots: f.slots.length });
  for (const e of entries) {
    // Gra z bólem (p.playingInjured) tylko z lekkim urazem do kilku dni (knockEligible, docs/taktyka-i-urazy.md)
    if (e.player.injuryDays > 0 && !(e.player.playingInjured && knockEligible(e.player))) errors.push(`${e.player.name} jest kontuzjowany`);
    if (e.player.callUp) errors.push(`${e.player.name} jest na zgrupowaniu reprezentacji`);
  }
  for (const id of tactics.bench) {
    const p = byId.get(id);
    if (!p) errors.push('Na ławce jest zawodnik spoza kadry');
    else if (p.suspended > 0) errors.push(`${p.name} jest zawieszony i nie może siedzieć na ławce`);
  }
  if (tactics.bench.length > benchSize) errors.push(`Na ławce może być najwyżej ${benchSize} zawodników`);
  const report = assessLineup(entries);
  return { errors: [...new Set(errors)], warnings: report.warnings, report, rating: lineupRating(entries, squad) };
}

/**
 * Przed meczem i po wczytaniu: usuwa niedostępnych i uzupełnia puste miejsca (asystent).
 * Zwraca nową taktykę i listę zmian do pokazania graczowi.
 */
export function refreshTactics(tactics, squad, { benchSize = 12, benchGk = 1 } = {}) {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const changes = [];
  const ok = (id) => id && byId.has(id) && isAvailable(byId.get(id));
  let t = { ...tactics, xi: tactics.xi.map((id) => {
    if (id && !ok(id)) changes.push(`${byId.get(id)?.name ?? 'Zawodnik'} wypada ze składu`);
    return ok(id) ? id : null;
  }), bench: tactics.bench.filter(ok) };
  if (t.xi.some((id) => !id)) {
    const f = formationById(t.formation);
    const used = new Set([...t.xi.filter(Boolean)]);
    for (let i = 0; i < t.xi.length; i++) {
      if (t.xi[i]) continue;
      const cand = squad.filter((p) => isAvailable(p) && !used.has(p.id))
        .sort((a, b) => slotValue(b, f.slots[i]) - slotValue(a, f.slots[i]))[0];
      if (cand) { t.xi[i] = cand.id; used.add(cand.id); t.bench = t.bench.filter((id) => id !== cand.id); changes.push(`${cand.name} wchodzi do składu (${f.slots[i].pos})`); }
    }
  }
  // Ławka (docs/sklad-lawki.md): wybrani przez gracza zostają. Miejsce zwolnione przez niedostępnego albo przez
  // przejście do jedenastki asystent od razu zajmuje według zasad ławki (np. najpierw brakujący ŚO). Miejsca, których
  // gracz sam nie obsadził, zostają puste, chyba że ławka ma mniej niż 7 zawodników (wtedy dobór do pełnej ławki).
  const target = t.bench.length < Math.min(benchSize, 7) ? benchSize : Math.min(benchSize, tactics.bench.length);
  if (t.bench.length < target) {
    const bench = autoPickBench(squad, t.xi, target, t.bench, { gks: benchGk });
    for (const id of bench) if (!t.bench.includes(id)) changes.push(`${byId.get(id).name} wchodzi na ławkę (${byId.get(id).pos})`);
    t = { ...t, bench };
  }
  const roles = autoRoles(squad, t.xi);
  for (const r of ['captain', 'penalty', 'freeKick', 'corner']) if (!t[r] || !t.xi.includes(t[r])) t[r] = roles[r];
  return { tactics: t, changes };
}
