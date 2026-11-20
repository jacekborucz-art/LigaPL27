// Aklimatyzacja po zmianie klubu (Kadra, profil zawodnika; silnik przez rejestr modyfikatorów).
// Badania i analizy (Uniwersytet Manchesterski na danych Opta, praca HSE o 6 ligach 2000-2023, badanie
// Kühne Logistics University) wskazują: nowy zawodnik potrzebuje do ok. pół sezonu, transfer w obrębie
// ligi wymaga mniej czasu, wspólny język z krajem klubu wyraźnie przyspiesza adaptację (poza bramkarzami),
// a transfer w trakcie sezonu (mniej czasu na wdrożenie) adaptację wydłuża. Szczegóły: docs/aklimatyzacja.md.
// Liczby [SZAC].

import { registerModifier } from '../engine/modifiers.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { clamp } from '../core/rng.js';
import { squadOf } from '../world/worldGen.js';
import { GROUP } from './squad.js';

export const ACCLIM = { DOMESTIC_DAYS: 42, FOREIGN_DAYS: 110, START_DOMESTIC: 35, START_FOREIGN: 10, MATCH_BONUS: 2.5, MAX_PENALTY: 0.6 };
// Języki zbliżone do polskiego (słowiańskie) i kraje europejskie; reszta to dalsza kultura i inny klimat
const SLAVIC = new Set(['CZE', 'SVK', 'UKR', 'BLR', 'SRB', 'CRO', 'SVN', 'BIH', 'MKD', 'MNE', 'BUL']);
const EUROPE = new Set(['ESP', 'POR', 'NED', 'BEL', 'GER', 'AUT', 'FRA', 'SWE', 'NOR', 'DEN', 'FIN', 'ISL', 'LTU', 'LVA', 'EST', 'GEO', 'ENG', 'SCO', 'WAL', 'NIR', 'IRL', 'ITA', 'GRE', 'HUN', 'ROU', 'SUI', 'ALB', 'KOS', 'MDA', 'ARM', 'AZE', 'CYP', 'ISR', 'TUR', 'LUX', 'MLT', 'AND', 'GIB', 'FRO', 'LIE', 'KAZ']);

/** Czas pełnej aklimatyzacji w dniach i powody (do profilu zawodnika). */
export function acclimPlan(game, p, { fromAbroad, date, clubId }) {
  const reasons = [];
  let days = fromAbroad ? ACCLIM.FOREIGN_DAYS : ACCLIM.DOMESTIC_DAYS;
  reasons.push(fromAbroad ? 'Przyjazd z zagranicy' : 'Zmiana klubu w Polsce');
  if (fromAbroad) {
    if (p.nat === 'POL') { days *= 0.6; reasons.push('Powrót do kraju'); }
    else if (SLAVIC.has(p.nat)) { days *= 0.85; reasons.push('Podobny język'); }
    else if (!EUROPE.has(p.nat)) { days *= 1.35; reasons.push('Inny język i kultura'); }
    else reasons.push('Nowy język');
  }
  if ((p.age ?? 25) <= 20) { days *= 1.1; reasons.push('Młody wiek'); }
  if ((p.age ?? 25) >= 30) { days *= 0.9; reasons.push('Doświadczenie'); }
  days *= { Wrażliwy: 1.3, Lider: 0.85, Spokojny: 0.9 }[p.persona] ?? 1;
  if (p.persona === 'Wrażliwy') reasons.push('Wrażliwy charakter');
  const compatriots = squadOf(game.world, clubId).filter((x) => x.id !== p.id && x.nat === p.nat && p.nat !== 'POL').length;
  if (compatriots) { days *= 0.85; reasons.push('Rodacy w szatni'); }
  const m = Number(date.slice(5, 7));
  if ([9, 10, 11, 1, 2, 3].includes(m)) { days *= 1.15; reasons.push('Transfer w trakcie sezonu'); }
  if (GROUP[p.pos] === 'GK' && fromAbroad && p.nat !== 'POL') days *= 0.9; // język mniej ważny dla bramkarza
  return { days: Math.round(days), reasons };
}

/** Początek aklimatyzacji (po transferze). */
export function startAcclim(game, p, date) {
  const fromAbroad = !(p.career?.length && p.career.at(-1)?.from) && !(p.history?.length);
  const plan = acclimPlan(game, p, { fromAbroad, date, clubId: p.clubId });
  p.acclim = { level: fromAbroad ? ACCLIM.START_FOREIGN : ACCLIM.START_DOMESTIC, since: date, days: plan.days, reasons: plan.reasons, club: p.clubId };
  p.acclimFor = p.lastMove ?? date;
}

export function acclimEta(p, date) {
  if (!p.acclim) return null;
  const left = Math.max(0, (100 - p.acclim.level) / (100 / p.acclim.days));
  return addDays(date, Math.ceil(left));
}

export const acclimLabel = (lvl) => (lvl >= 85 ? 'prawie pełna' : lvl >= 60 ? 'dobra' : lvl >= 35 ? 'w trakcie' : 'na początku');

// Silnik: brak aklimatyzacji to do -0,6 punktu (słabsze zrozumienie z kolegami i taktyki)
registerModifier({
  id: 'acclim', scope: 'player', label: 'Aklimatyzacja',
  apply: (p) => (p.acclim ? -ACCLIM.MAX_PENALTY * (1 - clamp(p.acclim.level, 0, 100) / 100) : 0),
});

// Dzień: nowi zawodnicy zaczynają aklimatyzację, postęp z czasem i z rozegranymi meczami
registerDailySystem({
  id: 'acclim', order: 92,
  run(game, date) {
    if (!game.world) return {};
    const messages = [];
    const yesterday = addDays(date, -1);
    const W = game.world.players;
    for (const id in W) { // for-in: ta sama kolejność co Object.values, bez kopii wszystkich zawodników co dzień
      const p = W[id];
      if (p.lastMove && p.clubId && p.acclimFor !== p.lastMove) startAcclim(game, p, p.lastMove);
      if (!p.acclim) continue;
      if (p.acclim.club !== p.clubId) { delete p.acclim; continue; }
      p.acclim.level += 100 / p.acclim.days + (p.lastMatch === yesterday ? ACCLIM.MATCH_BONUS : 0);
      if (p.acclim.level >= 100) {
        if (p.clubId === game.clubId) messages.push(createMessage({ date, key: `aklim:${p.id}:${p.acclim.since}`, category: 'staff', from: 'Asystent trenera', priority: 'info', subject: `${p.name} zaaklimatyzował się w klubie`, body: `${p.name} czuje się już w drużynie jak u siebie. Rozumie partnerów i nasz sposób gry.` }));
        delete p.acclim;
      }
    }
    return { messages };
  },
});
