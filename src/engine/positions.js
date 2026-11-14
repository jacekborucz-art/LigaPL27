// Gra poza pozycją: biegłość, kary w silniku meczowym i walidacja składu.
// Te same funkcje wywołują gracz i AI, więc nie ma "skrótów" dla żadnej strony.
// Wartości balansowe [SZAC]; cele kalibracji w docs/PLAN.md, rozdz. 3.2.

import { clamp } from '../core/rng.js';

export const POSITIONS = ['BR', 'ŚO', 'BO', 'WB', 'DP', 'ŚP', 'OP', 'BP', 'SN', 'NAP'];
const SIDED = new Set(['BO', 'WB', 'BP', 'SN']);
/** Kolejność pozycji na listach (od bramkarza do napastnika). */
export const posRank = (pos) => { const i = POSITIONS.indexOf(pos); return i < 0 ? POSITIONS.length : i; };
/** Porównanie do sortowania list zawodników: pozycja nominalna, potem ocena ogólna malejąco. */
export const byPosition = (a, b) => posRank(a.pos) - posRank(b.pos) || (b.ovr ?? 0) - (a.ovr ?? 0);

// Biegłość 0-100 na innej pozycji, wynikająca z naturalnej pozycji (wiersz -> kolumna).
// Zawodnik z pola w bramce: 8. Bramkarz w polu: 15.
const F = {
  ŚO: { BO: 60, WB: 45, DP: 70, ŚP: 45, OP: 25, BP: 30, SN: 20, NAP: 30 },
  BO: { ŚO: 55, WB: 85, DP: 50, ŚP: 45, OP: 30, BP: 70, SN: 45, NAP: 25 },
  WB: { ŚO: 40, BO: 85, DP: 45, ŚP: 45, OP: 35, BP: 85, SN: 60, NAP: 30 },
  DP: { ŚO: 70, BO: 45, WB: 45, ŚP: 85, OP: 55, BP: 45, SN: 30, NAP: 30 },
  ŚP: { ŚO: 40, BO: 40, WB: 50, DP: 85, OP: 80, BP: 65, SN: 50, NAP: 45 },
  OP: { ŚO: 20, BO: 25, WB: 35, DP: 50, ŚP: 80, BP: 65, SN: 70, NAP: 70 },
  BP: { ŚO: 25, BO: 65, WB: 80, DP: 40, ŚP: 65, OP: 65, SN: 85, NAP: 50 },
  SN: { ŚO: 20, BO: 35, WB: 55, DP: 25, ŚP: 45, OP: 70, BP: 85, NAP: 75 },
  NAP: { ŚO: 30, BO: 25, WB: 30, DP: 30, ŚP: 40, OP: 65, BP: 50, SN: 75 },
};
const OUTFIELD_IN_GOAL = 8;
const GK_IN_FIELD = 15;
const WRONG_SIDE = 12; // np. prawonożny lewy obrońca
const LEARNED_CAP = 90; // nauka pozycji nigdy nie daje pełnej biegłości naturalnej

/**
 * Biegłość zawodnika na danej pozycji i stronie.
 * player: { pos, side?: 'L'|'P'|'LP', alt?: { [pos]: 0-100 } }
 */
export function proficiency(player, slotPos, slotSide = null) {
  let prof;
  if (player.pos === slotPos) prof = 100;
  else if (slotPos === 'BR') prof = OUTFIELD_IN_GOAL;
  else if (player.pos === 'BR') prof = GK_IN_FIELD;
  else prof = F[player.pos]?.[slotPos] ?? 30;
  const learned = Math.min(LEARNED_CAP, player.alt?.[slotPos] ?? 0);
  if (slotPos !== 'BR' && player.pos !== 'BR') prof = Math.max(prof, learned);
  if (SIDED.has(slotPos) && slotSide && player.side && player.side !== 'LP' && player.side !== slotSide) {
    prof -= WRONG_SIDE;
  }
  return clamp(prof, 0, 100);
}

/** Mnożnik wkładu zawodnika w siłę stref. 100 -> 1.00, 85 -> 0.94, 70 -> 0.88, 50 -> 0.80, 20 -> 0.66. */
export function posEff(prof) {
  return 0.55 + 0.45 * (prof / 100) ** 0.8;
}

/** Ryzyko błędów (strata prowadząca do strzału, faul taktyczny, źle ustawiona linia spalonego). */
export function errorMul(prof, defensiveSlot) {
  return 1 + ((100 - prof) / 100) * (defensiveSlot ? 1.2 : 0.6);
}

/**
 * Modyfikatory dla rywala, gdy w bramce stoi zawodnik z pola.
 * Cel kalibracji: ok. +1,5 straconego gola na 90 minut względem zwykłego bramkarza.
 */
export function goalkeeperSlotModifiers(player) {
  if (player.pos === 'BR') return { natural: true, goalMul: 1, longShotMul: 1, crossMul: 1, cornerMul: 1 };
  const reach = clamp(((player.attr?.SKO ?? 8) + (player.attr?.WYS ?? 0)) / 20, 0, 1); // wysoki i skoczny broni trochę lepiej
  return {
    natural: false,
    goalMul: 1.95 - 0.25 * reach, // każdy celny strzał dużo częściej wpada
    longShotMul: 1.6, // rywal częściej strzela z dystansu
    crossMul: 1.4, // dośrodkowania i rożne groźniejsze
    cornerMul: 1.3,
  };
}

const DEF_SLOTS = new Set(['ŚO', 'BO', 'WB', 'DP']);

/**
 * Ocena składu: biegłość każdego zawodnika, mnożniki i kara za strukturę formacji.
 * lineup: [{ player, slot: { pos, side } }] (11 albo mniej po czerwonych)
 * Zwraca { players: [{id, prof, eff, err}], structurePenalty, gk, warnings[] }
 */
export function assessLineup(lineup) {
  const warnings = [];
  const players = lineup.map(({ player, slot }) => {
    const prof = proficiency(player, slot.pos, slot.side);
    const eff = posEff(prof);
    const err = errorMul(prof, DEF_SLOTS.has(slot.pos));
    if (slot.pos === 'BR' && player.pos !== 'BR') {
      warnings.push(`${player.name ?? player.id} w bramce: bardzo duża kara, rywal strzela częściej i skuteczniej`);
    } else if (prof < 70) {
      warnings.push(`${player.name ?? player.id} gra poza pozycją (${slot.pos}): skuteczność ${Math.round(eff * 100)} %`);
    }
    return { id: player.id, prof, eff, err };
  });
  // Zgranie formacji: średnia biegłość poniżej 85 obniża spójność całej drużyny.
  const avgProf = players.reduce((s, p) => s + p.prof, 0) / Math.max(1, players.length);
  let structurePenalty = Math.max(0, (85 - avgProf) * 0.03); // w punktach atrybutu dla całej drużyny
  // Formacja bez struktury (np. 1 obrońca) dostaje dodatkową karę.
  const count = (set) => lineup.filter(({ slot }) => set.has(slot.pos)).length;
  const defenders = count(new Set(['ŚO', 'BO', 'WB']));
  if (defenders < 3) { structurePenalty += (3 - defenders) * 0.6; warnings.push('Za mało obrońców: obrona się rozsypuje'); }
  const gkEntry = lineup.find(({ slot }) => slot.pos === 'BR');
  const gk = gkEntry ? goalkeeperSlotModifiers(gkEntry.player) : null;
  return { players, structurePenalty: Math.round(structurePenalty * 100) / 100, gk, warnings };
}

/**
 * Walidacja składu przed meczem (reguły twarde). Zwraca listę błędów; pusta lista = skład poprawny.
 * Zawodnik z pola w bramce jest DOZWOLONY (przepisy), ale przy dostępnym bramkarzu gra ostrzega.
 */
export function validateLineup(lineup, { bench = [], formationSlots = 11 } = {}) {
  const errors = [];
  if (lineup.length !== formationSlots) errors.push(`Skład musi mieć ${formationSlots} zawodników`);
  const ids = new Set();
  for (const { player } of lineup) {
    if (ids.has(player.id)) errors.push(`${player.name ?? player.id} jest w składzie dwa razy`);
    ids.add(player.id);
    if (player.suspended > 0) errors.push(`${player.name ?? player.id} jest zawieszony`);
  }
  const gks = lineup.filter(({ slot }) => slot.pos === 'BR');
  if (gks.length !== 1) errors.push('W składzie musi być dokładnie jeden bramkarz');
  for (const p of bench) if (ids.has(p.id)) errors.push(`${p.name ?? p.id} jest jednocześnie w składzie i na ławce`);
  return errors;
}

// ------------------------------------------------------------ Migracja kodów pozycji w zapisach
// Boczny pomocnik miał kod SP (mylony ze ŚP), teraz BP. "SP" w zapisie znaczy też stały fragment
// (pole kind w zdarzeniach meczu) i Superpuchar lub sparing (id meczów), więc zmieniamy tylko pola pozycji.
export const POS_CODES_V = 2;
const OLD_POS = { SP: 'BP' };
const POS_FIELDS = new Set(['pos', 'natPos', 'fromPos', 'outPos', 'inPos']); // wartość: kod pozycji
const POS_LISTS = new Set(['drop', 'dropPos']); // tablica kodów pozycji (plan gry w osłabieniu)
const POS_MAPS = new Set(['alt']); // obiekt z kluczami pozycji (biegłość na innych pozycjach)
const POS_KEYS = new Set([...POSITIONS, ...Object.keys(OLD_POS)]);
/** Obiekt kluczowany pozycjami (np. tabela wag): wszystkie klucze to kody pozycji, w tym co najmniej jedna inna niż stary kod. */
const isPosMap = (o, keys) => keys.length > 1 && keys.every((k) => POS_KEYS.has(k)) && keys.some((k) => POSITIONS.includes(k));

/** Stary kod pozycji na nowy (inne wartości bez zmian). Dla danych z zewnątrz, np. datapacku. */
export const normPos = (pos) => OLD_POS[pos] ?? pos;

/**
 * Jednorazowa migracja zapisu: kody pozycji SP -> BP u zawodników (pos, alt, trening), w historii transferów,
 * raportach, datapacku edytora i innych polach pozycji. Znacznik game.posCodes chroni przed powtórką.
 * Zwraca liczbę zmienionych wartości.
 */
export function migratePosCodes(game) {
  if (!game || typeof game !== 'object' || game.posCodes >= POS_CODES_V) return 0;
  let n = 0;
  const seen = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) { for (const v of o) walk(v); return; }
    const keys = Object.keys(o);
    for (const k of keys) {
      const v = o[k];
      if (typeof v === 'string') { if (POS_FIELDS.has(k) && OLD_POS[v]) { o[k] = OLD_POS[v]; n++; } continue; }
      if (!v || typeof v !== 'object') continue;
      if (Array.isArray(v) && POS_LISTS.has(k)) v.forEach((x, i) => { if (OLD_POS[x]) { v[i] = OLD_POS[x]; n++; } });
      else if (!Array.isArray(v)) {
        const vk = Object.keys(v);
        if (vk.some((x) => OLD_POS[x]) && (POS_MAPS.has(k) || isPosMap(v, vk))) {
          // nowy obiekt z tą samą kolejnością kluczy
          o[k] = Object.fromEntries(vk.map((x) => [OLD_POS[x] && !(OLD_POS[x] in v) ? OLD_POS[x] : x, v[x]]));
          n++;
          walk(o[k]);
          continue;
        }
      }
      walk(v);
    }
  };
  walk(game);
  // Gotowe teksty w poczcie: "Jan Kowalski (SP): ..." albo "(SP, 21 lat)"
  for (const m of Array.isArray(game.inbox) ? game.inbox : []) {
    for (const f of ['title', 'body']) if (typeof m?.[f] === 'string' && /\(SP[,)]/.test(m[f])) { m[f] = m[f].replace(/\(SP(?=[,)])/g, '(BP'); n++; }
  }
  game.posCodes = POS_CODES_V;
  return n;
}
