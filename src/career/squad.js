// Kadra klubu: koniec kariery (decyzja 0/1), listy transferowe AI, zwolnienia
// oraz ochrona przed brakami w kadrze (kontuzje, kartki, odejścia poza oknem).
// Wartości to propozycje balansowe [SZAC] do strojenia w symulacji wielu sezonów.

import { clamp } from '../core/rng.js';

export const GROUP = {
  BR: 'GK', ŚO: 'DEF', BO: 'DEF', WB: 'DEF', DP: 'MID', ŚP: 'MID', OP: 'MID', SP: 'MID', SN: 'ATT', NAP: 'ATT',
};

// Pierwsza drużyna: minimum, cel i maksimum na grupę pozycji. Bramkarzy zawsze co najmniej 3.
export const SQUAD_TARGETS = {
  GK: { min: 3, target: 3, max: 4 },
  DEF: { min: 6, target: 8, max: 10 },
  MID: { min: 6, target: 8, max: 10 },
  ATT: { min: 3, target: 5, max: 7 },
};
export const SQUAD_SIZE = { min: 22, target: 25, max: 30 };
// Na mecz: co najmniej 16 dostępnych, w tym 2 bramkarzy (wyjściowy + ławka).
export const MATCH_MIN = { total: 16, GK: 2, DEF: 5, MID: 5, ATT: 2 };

const groupOf = (p) => GROUP[p.pos] || 'MID';
export const isAvailable = (p) => !(p.injuryDays > 0) && !(p.suspended > 0) && !p.onLoanOut && !p.callUp;

function countBy(players, fn = () => true) {
  const out = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of players) if (fn(p)) out[groupOf(p)]++;
  return out;
}

// ---------------------------------------------------------------- Koniec kariery
/**
 * Decyzja 0/1 raz na sezon (ogłoszenie Mar 1 dla kończących kontrakt, reszta Jun 30).
 * ctx: { leagueL, minutesShare 0-1, hasContractNextSeason, longInjuryDays }
 * Zwraca { retire: boolean, p, reasons[] }.
 */
export function decideRetirement(player, ctx, rng) {
  const gk = groupOf(player) === 'GK';
  const a = player.age - (gk ? 2 : 0); // bramkarze grają dłużej
  const reasons = [];
  if (a >= 40) return { retire: true, p: 1, reasons: ['Wiek'] };

  let p = a < 31 ? 0 : 1 / (1 + Math.exp(-(a - 34.3) / 1.1)); // ok. 33 l.: 23 %, 34: 43 %, 35: 65 %, 36: 82 %
  if (p > 0.3) reasons.push('Wiek');
  if (a >= 31) {
    if (!ctx.hasContractNextSeason) { p += 0.2; reasons.push('Brak kontraktu na kolejny sezon'); }
    if ((ctx.minutesShare ?? 1) < 0.3) { p += 0.1; reasons.push('Mało gry'); }
    if (player.ovr < ctx.leagueL - 2) { p *= 1.6; reasons.push('Odstaje poziomem od ligi'); }
    if (player.ovr >= ctx.leagueL + 1) p *= 0.6; // wciąż ważny zawodnik
    if (player.persona === 'Lider') p *= 0.85;
  }
  // Uraz kończący karierę możliwy już od 28 lat.
  if ((ctx.longInjuryDays ?? 0) >= 150 && player.age >= 28) { p += 0.12; reasons.push('Ciężka kontuzja'); }
  p = clamp(p, 0, 1);
  return { retire: p > 0 && rng.chance(p), p: Math.round(p * 100) / 100, reasons };
}

// ---------------------------------------------------------------- Lista transferowa i zwolnienia
/**
 * Kogo klub AI wystawia na sprzedaż, do wypożyczenia albo zwalnia.
 * squad: zawodnicy pierwszej drużyny; club: { L, rep, wageBudget };
 * ctx: { date ISO, inWindow, seasonEnd ISO }
 * Zwraca [{ id, kind: 'sale'|'loan'|'release', reasons[] }]. Nigdy nie schodzi poniżej minimum grupy.
 */
export function transferListCandidates(squad, club, ctx) {
  const out = [];
  const counts = countBy(squad);
  const remaining = { ...counts };
  const sorted = [...squad].sort((x, y) => y.ovr - x.ovr);
  const cutoff = sorted[Math.min(17, sorted.length - 1)]?.ovr ?? 0; // poziom 18. zawodnika
  const wageBill = squad.reduce((s, p) => s + (p.wage || 0), 0);
  const overBudget = club.wageBudget ? wageBill > club.wageBudget : false;
  const monthsLeft = (p) => monthsBetween(ctx.date, p.contractUntil);

  // Najsłabsi w każdej grupie są pierwszymi kandydatami.
  const byGroup = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of sorted) byGroup[groupOf(p)].push(p);

  for (const g of Object.keys(byGroup)) {
    const list = byGroup[g];
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (remaining[g] <= SQUAD_TARGETS[g].min) break; // chronimy minimum grupy
      const reasons = [];
      let kind = null;
      const surplus = counts[g] > SQUAD_TARGETS[g].target && i >= SQUAD_TARGETS[g].target;
      if (surplus) reasons.push('Nadmiar zawodników na pozycji');
      if (p.ovr < cutoff - 0.5) reasons.push('Poza szeroką kadrą meczową');
      if (p.unhappy) reasons.push('Chce odejść');
      if (overBudget && p.wage > wageBill / squad.length * 1.5 && p.ovr < sorted[5].ovr) reasons.push('Zbyt wysoka pensja');
      if (monthsLeft(p) <= 12 && p.renewRefused) reasons.push('Nie przedłuży kontraktu');

      if (p.age <= 21 && (p.minutesShare ?? 0) < 0.25 && (surplus || p.ovr < cutoff)) {
        kind = 'loan';
        reasons.push('Potrzebuje gry');
      } else if (reasons.length >= 2 || p.unhappy || (surplus && p.ovr < cutoff)) {
        kind = 'sale';
      }
      // Zwolnienie (rozwiązanie kontraktu): starszy, słaby, nikt go nie kupi; tylko latem albo przy nadmiarze kadry.
      const releasable = p.age >= 31 && p.ovr < club.L - 1.5 && (ctx.inWindow || squad.length > SQUAD_SIZE.max);
      if (releasable && kind) { kind = 'release'; reasons.push('Klub rozwiązuje kontrakt'); }

      if (kind) {
        out.push({ id: p.id, kind, reasons });
        if (kind !== 'loan') remaining[g]--;
      }
    }
  }
  return out;
}

function monthsBetween(fromIso, toIso) {
  if (!toIso) return 0;
  const [y1, m1] = fromIso.split('-').map(Number);
  const [y2, m2] = toIso.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

// ---------------------------------------------------------------- Ochrona przed brakami
/**
 * Braki w kadrze: rejestracyjne (cała pierwsza drużyna) i meczowe (dostępni na najbliższy mecz).
 * Zwraca [{ scope: 'squad'|'match', group: 'GK'|'DEF'|'MID'|'ATT'|'ALL', missing }].
 */
export function squadDeficits(squad) {
  const needs = [];
  const reg = countBy(squad);
  for (const g of Object.keys(SQUAD_TARGETS)) {
    if (reg[g] < SQUAD_TARGETS[g].min) needs.push({ scope: 'squad', group: g, missing: SQUAD_TARGETS[g].min - reg[g] });
  }
  const avail = countBy(squad, isAvailable);
  for (const g of ['GK', 'DEF', 'MID', 'ATT']) {
    if (avail[g] < MATCH_MIN[g]) needs.push({ scope: 'match', group: g, missing: MATCH_MIN[g] - avail[g] });
  }
  const total = Object.values(avail).reduce((a, b) => a + b, 0);
  const groupMissing = needs.filter((n) => n.scope === 'match').reduce((s, n) => s + n.missing, 0);
  if (total + groupMissing < MATCH_MIN.total) {
    needs.push({ scope: 'match', group: 'ALL', missing: MATCH_MIN.total - total - groupMissing });
  }
  // Bramkarze najpierw: bez nich nie da się rozegrać meczu.
  return needs.sort((a, b) => (a.group === 'GK' ? -1 : 0) - (b.group === 'GK' ? -1 : 0));
}

/**
 * Plan uzupełnienia braków. Kolejność źródeł:
 *  1) rezerwy (drużyna B) i powrót z wypożyczenia z klauzulą,
 *  2) akademia (wychowankowie można zgłaszać zawsze),
 *  3) wolni zawodnicy (można podpisać także poza oknem),
 *  4) transfer, tylko w oknie,
 *  5) awaryjnie: wygenerowany zawodnik czasowy z akademii (umowa do końca sezonu).
 * pools: { reserves[], academy[], freeAgents[], inWindow }
 */
export function planDeficitFill(needs, pools) {
  const used = new Set();
  const actions = [];
  const take = (list, group) => {
    const cand = (list || [])
      .filter((p) => !used.has(p.id) && (group === 'ALL' || groupOf(p) === group) && isAvailable(p))
      .sort((x, y) => y.ovr - x.ovr)[0];
    if (cand) used.add(cand.id);
    return cand;
  };
  for (const need of needs) {
    for (let k = 0; k < need.missing; k++) {
      const fromRes = take(pools.reserves, need.group);
      if (fromRes) { actions.push({ type: 'promoteReserve', id: fromRes.id, group: need.group }); continue; }
      const fromAcad = take(pools.academy, need.group);
      if (fromAcad) { actions.push({ type: 'promoteAcademy', id: fromAcad.id, group: need.group }); continue; }
      const free = take(pools.freeAgents, need.group);
      if (free) { actions.push({ type: 'signFreeAgent', id: free.id, group: need.group }); continue; }
      if (pools.inWindow && need.scope === 'squad') { actions.push({ type: 'buy', group: need.group }); continue; }
      actions.push({ type: 'generateTemporary', group: need.group === 'ALL' ? 'MID' : need.group });
    }
  }
  return actions;
}
