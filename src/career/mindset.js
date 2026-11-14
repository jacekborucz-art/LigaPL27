// Nastawienie zawodnika do zejścia poziom niżej: D (0-1, p.stepDown), liczone w poniedziałki (docs/transfery.md,
// rozdz. 3). D = D_wiek + D_bez klubu + D_brak ofert + D_charakter. Wyższe D zmniejsza wymagania co do reputacji
// i ligi klubu (willingnessToJoin) oraz żądanie płacowe wolnego zawodnika. Tu też: emerytury długo wolnych
// weteranów i modyfikator gry („spakowana walizka” przy prekontrakcie, odmowa przy prośbie o transfer). [SZAC]

import { Rng, clamp } from '../core/rng.js';
import { registerModifier } from '../engine/modifiers.js';
import { CLUBS_PL } from '../data/clubs_pl.js';
import { squadOf } from '../world/worldGen.js';
import { personalityOf } from './personality.js';
import { GROUP } from './squad.js';
import { marketWage, monthsBetween } from './negotiation.js';
import { clubReputation } from './reputation.js';
import { clubById } from '../data/clubs_pl.js';
import { SEASON_END } from '../config/calendar2026.js';
import { addFreeAgents } from './transfers.js';
import { addPoolPlayers } from './foreignPool.js';

export const MIND = {
  retireAge: 32, retireMonths: 6, retireP: 0.15, // wolny weteran: 15 % w miesiącu po pół roku bez klubu
  leaveAfter: 2, leaveBase: 0.08, leaveStep: 0.05, leaveMax: 0.45, // wolny długo bez klubu znika z rynku [SZAC]
  // Od grywalnej III ligi 126 klubów z kadrami (było 54): progi rynku wolnych x1,5 [SZAC]
  keepFree: { GK: 12, DEF: 20, MID: 20, ATT: 15 }, // tylu wolnych na grupę pozycji zostaje zawsze na rynku [SZAC]
  freeTarget: 220, // na miejsce zniknięcia przychodzą nowi, dopóki wolnych jest mniej niż tyle (rynek nie rośnie bez końca) [SZAC]
  askFloor: 0.6, askCut: 0.45, // efektywne żądanie: max(0,6 rynku, żądanie x (1 - 0,45 D_free))
  reason: 0.25, // od tego D zawodnik mówi, że obniżył wymagania
};

/** τ(wiek) w miesiącach: jak szybko zawodnik bez klubu godzi się na mniej. */
export function tauOf(age) { return age <= 21 ? 3 : age <= 27 ? 5 : age <= 31 ? 4 : 2.5; }

/** Składnik „bez klubu”: 0,6 (1 - exp(-m/τ)). */
export function dFree(months, age) { return months > 0 ? 0.6 * (1 - Math.exp(-months / tauOf(age))) : 0; }

/**
 * Nastawienie D. ctx: { monthsFree, monthsNoOffer (miesiące od Jan 1 bez oferty na jego poziomie, tylko przy
 * kontrakcie kończącym się w ciągu 6 miesięcy) }.
 */
export function stepDownOf(p, { monthsFree = 0, monthsNoOffer = 0 } = {}) {
  const age = p.age ?? 25;
  const t = personalityOf(p).traits;
  const dAge = age >= 33 ? 0.2 : age >= 30 ? 0.1 : 0;
  const dOff = Math.min(0.4, 0.08 * monthsNoOffer);
  const growth = clamp((p.hidden?.POT ?? p.ovr ?? 10) - (p.ovr ?? 10), 0, 4);
  const dPers = -0.015 * (t.ambition - 10) - 0.01 * (t.ego - 10) + 0.01 * (t.security - 10) - 0.05 * growth
    + (p.persona === 'Ambitny' ? -0.1 : p.persona === 'Spokojny' ? 0.05 : 0);
  const free = dFree(monthsFree, age);
  return { D: Math.round(clamp(dAge + free + dOff + dPers, 0, 1) * 100) / 100, free: Math.round(free * 100) / 100 };
}

/** Efektywne żądanie płacowe wolnego zawodnika dla klubu z ligi tier. */
export function effectiveAsk(p, tier = 1, level = 1) {
  const m = marketWage(p.ovr ?? 10, tier, false, level);
  const ask = p.askWage ?? m;
  return Math.round(Math.max(MIND.askFloor * m, ask * (1 - MIND.askCut * (p.stepDownFree ?? 0))) / 100) * 100;
}

const monthsSince = (from, date) => Math.max(0, monthsBetween(from, date) - (date.slice(8) < from.slice(8) ? 1 : 0));

/** Poniedziałek: D dla wolnych zawodników i dla kończących kontrakt w tym sezonie. */
export function mindsetWeek(game, date) {
  const W = game.world;
  const offers = game.market?.pre?.offers ?? [];
  const jan = `${date.slice(0, 4)}-01-01`;
  const spring = Number(date.slice(5, 7)) <= 6;
  const hasOffer = new Set();
  for (const o of offers) {
    const p = W.players[o.pid];
    if (!p) continue;
    const rep = o.foreign ? o.foreign.rep : clubReputation(clubById(o.to) ?? { prestige: 2, tier: 3 });
    if (rep >= (p.rep ?? 30) - 10) hasOffer.add(o.pid);
  }
  for (const id of game.market?.free ?? []) {
    const p = W.players[id];
    if (!p) continue;
    const r = stepDownOf(p, { monthsFree: p.freeSince ? monthsSince(p.freeSince, date) : 0 });
    p.stepDown = r.D; p.stepDownFree = r.free;
  }
  for (const c of CLUBS_PL) {
    if (!W.clubs[c.id]) continue;
    for (const p of squadOf(W, c.id)) {
      const ending = spring && p.contract?.until === SEASON_END && !p.loan;
      if (!ending) { if (p.stepDown) { delete p.stepDown; delete p.stepDownFree; } continue; }
      const r = stepDownOf(p, { monthsNoOffer: hasOffer.has(p.id) || p.preContract ? 0 : monthsSince(jan, date) });
      p.stepDown = r.D; p.stepDownFree = 0;
    }
  }
}

/**
 * Szansa w miesiącu, że wolny zawodnik zniknie z rynku (koniec kariery, gra za granicą albo w niższej lidze), gdy długo
 * nie znajduje klubu [SZAC]: pierwsze 2 miesiące 0, potem 8 % i +5 % za każdy kolejny miesiąc (najwyżej 45 %),
 * starsi (30+) x1,5. Weterani 32+ po pół roku: co najmniej 15 % (koniec kariery, jak wcześniej).
 */
export function freeLeaveChance(p, months) {
  let ch = months < MIND.leaveAfter ? 0 : Math.min(MIND.leaveMax, MIND.leaveBase + MIND.leaveStep * (months - MIND.leaveAfter));
  if ((p.age ?? 25) >= 30) ch = Math.min(MIND.leaveMax, ch * 1.5);
  if ((p.age ?? 0) >= MIND.retireAge && months >= MIND.retireMonths) ch = Math.max(ch, MIND.retireP);
  return ch;
}

/**
 * 1. dnia miesiąca: wolni zawodnicy, którzy długo nie znajdują klubu, znikają z listy (freeLeaveChance), a w ich miejsce
 * od razu pojawiają się nowi: z puli zagranicznej za zawodnika z puli (foreignPool.js), pozostali jak zwykli wolni
 * (addFreeAgents). Liczba wolnych na rynku się nie zmienia. Zwraca { left, added }.
 */
export function retireFreeAgents(game, date) {
  const W = game.world; const M = game.market;
  const ym = date.slice(0, 7);
  let pool = 0; let other = 0;
  // Zawsze zostaje kilku wolnych na każdej pozycji (kluby AI uzupełniają nimi braki w kadrze) [SZAC]
  const grp = (p) => GROUP[p.pos] ?? 'MID';
  const byGroup = {};
  for (const id of M.free) { const p = W.players[id]; if (p) byGroup[grp(p)] = (byGroup[grp(p)] ?? 0) + 1; }
  M.free = M.free.filter((id) => {
    const p = W.players[id];
    if (!p) return false;
    if (p.transfer || !p.freeSince || M.talks?.[id]?.accepted) return true;
    if ((byGroup[grp(p)] ?? 0) <= (MIND.keepFree[grp(p)] ?? 8)) return true;
    const ch = freeLeaveChance(p, monthsSince(p.freeSince, date));
    if (!ch || !new Rng(`emerytura-wolny:${game.seed}:${id}:${ym}`).chance(ch)) return true;
    byGroup[grp(p)]--;
    if (p.foreignPool) pool++; else other++;
    if (Array.isArray(M.foreign)) M.foreign = M.foreign.filter((x) => x !== id);
    delete W.players[id];
    return false;
  });
  // Zastępstwa: tylu nowych, ilu zniknęło, ale najwyżej do MIND.freeTarget wolnych na rynku (proporcjonalnie pula/zwykli)
  const left = pool + other;
  const room = Math.max(0, Math.min(left, MIND.freeTarget - M.free.length));
  const addPool = Math.round(room * (left ? pool / left : 0));
  if (addPool) addPoolPlayers(game, addPool, date, `rot-${ym}`, { free: true });
  if (room - addPool) addFreeAgents(game, room - addPool, date, `rot-${ym}`);
  return { left, added: room };
}

// ------------------------------------------------------------ Modyfikator gry
/** Spakowana walizka: zawodnik z umową w innym klubie od lipca. clamp(-0,03 (12 - profesjonalizm), -0,25, +0,05). */
export function suitcaseEffect(p) {
  const t = personalityOf(p).traits;
  const v = clamp(-0.03 * (12 - t.professionalism), -0.25, 0.05);
  return p.persona === 'Lider' ? Math.max(v, 0.02) : v;
}

registerModifier({
  id: 'transferMind', scope: 'player', label: 'Głowa w transferze',
  apply: (p) => (p.preContract && p.preContract.club !== p.clubId ? suitcaseEffect(p) : 0)
    + (p.moveWish?.stage === 'oficjalna' && p.moveWish.reacted === 'refuse' ? -0.15 : 0),
});
