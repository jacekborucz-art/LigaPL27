// Monotonia treningu (docs/bierna-gra.md, rozdz. trening). Ten sam akcent planu tydzień po tygodniu bez żadnych
// zmian daje po kilku tygodniach znużenie: mniej morale z zajęć i trochę słabszy bodziec rozwojowy (zasada
// akomodacji: organizm słabiej odpowiada na stały bodziec). Skutek jest mały i ograniczony. Zmiana akcentu,
// obóz albo ręczne zmiany w planie (co najmniej 2 dni w tygodniu) go zdejmują.
// Kluby AI: trener zmienia akcent co kilka tygodni (lepsza metodyka TRE: częściej), ta sama reguła znużenia.
// Wartości [SZAC].

import { clamp } from '../core/rng.js';
import { coachOf, coachSkill } from '../career/coaches.js';
import { PASSIVE } from './scouting.js';

export const VARIETY = {
  grace: 4, // tyle tygodni tego samego akcentu bez skutków
  full: 12, // po tylu tygodniach pełne znużenie
  edits: 2, // ręcznie zmienione dni w tygodniu, które liczą się jako urozmaicenie
  editRelief: 2, // o tyle tygodni zmniejszają licznik
  moraleCut: 0.6, // morale z zajęć x(1 - 0,6 znużenia)
  boredom: 0.03, // dodatkowo -0,03 morale za dzień zajęć przy pełnym znużeniu
  stimCut: 0.15, // bodziec rozwojowy x(1 - 0,15 znużenia)
  ai: { period: 6, tre: 3, min: 3, max: 10 }, // trener AI zmienia akcent co 6 - 3 s(TRE) tygodni
};

const DAY = 86400000;
const EPOCH = Date.parse('2026-06-29T12:00:00Z'); // poniedziałek przed startem gry

/** Znużenie klubu 0-1 (stan c.var z licznika tygodni tego samego akcentu). */
export function staleness(c) {
  if (!PASSIVE.enabled || !PASSIVE.variety) return 0;
  const w = c?.var?.w ?? 0;
  return Math.round(clamp((w - VARIETY.grace) / (VARIETY.full - VARIETY.grace), 0, 1) * 1000) / 1000;
}

/** Mnożniki dnia zajęć: { morale(dodatnie morale z zajęć), boredom (ujemne morale za dzień), stim }. */
export function staleEffects(c) {
  const s = staleness(c);
  return { s, moraleMul: 1 - VARIETY.moraleCut * s, boredom: VARIETY.boredom * s, stimMul: 1 - VARIETY.stimCut * s };
}

/** Okres zmiany akcentu trenera AI (tygodnie) z metodyki treningu. */
export function aiAccentPeriod(game, clubId) {
  const c = coachOf(game, clubId);
  const A = VARIETY.ai;
  return clamp(Math.round(A.period - A.tre * (c ? coachSkill(c.a.TRE) : 0)), A.min, A.max);
}

let hashCache = new Map();
function clubHash(id) {
  let h = hashCache.get(id);
  if (h == null) { h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; h = Math.abs(h); if (hashCache.size > 500) hashCache = new Map(); hashCache.set(id, h); }
  return h;
}

/**
 * Akcent klubu AI w tygodniu daty: na zmianę akcent trenera (typ) i drugi akcent, co aiAccentPeriod tygodni
 * (przesunięcie fazy z identyfikatora klubu, żeby nie wszyscy zmieniali naraz). Wyłączona mechanika: akcent bazowy.
 */
export function aiAccentAt(game, clubId, base, date, period = aiAccentPeriod(game, clubId)) {
  if (!PASSIVE.enabled || !PASSIVE.variety) return base;
  const week = Math.floor((Date.parse(`${date}T12:00:00Z`) - EPOCH) / (7 * DAY)) + (clubHash(clubId) % period);
  const alt = base === 'zrownowazony' ? 'taktyczny' : 'zrownowazony';
  return Math.floor(week / period) % 2 ? alt : base;
}

/**
 * Krok tygodniowy licznika (poniedziałek). accent: akcent z minionego tygodnia, edits: ręcznie zmienione dni,
 * camp: obóz w minionym tygodniu. Zwraca nowy stan c.var.
 */
export function varietyWeek(c, { accent, edits = 0, camp = false }) {
  const v = c.var ?? { a: accent, w: 0 };
  let w = v.w ?? 0;
  let warned = !!v.warned;
  if (v.a !== accent || camp) { w = 0; warned = false; }
  else if (edits >= VARIETY.edits) w = Math.max(0, w - VARIETY.editRelief);
  else w += 1;
  c.var = { a: accent, w, ...(warned && w > VARIETY.grace ? { warned: true } : {}) };
  return c.var;
}

/** Ręcznie zmienione dni planu gracza w tygodniu przed datą (zmiany w zapisie: game.training.overrides). */
export function editsLastWeek(game, date) {
  const ov = game.training?.overrides ?? {};
  const from = new Date(Date.parse(`${date}T12:00:00Z`) - 7 * DAY).toISOString().slice(0, 10);
  let n = 0;
  for (const d of Object.keys(ov)) if (d >= from && d < date) n++;
  return n;
}

/** Notka do planu treningu (bez liczb). null, gdy nie ma znużenia. */
export function staleNote(c) {
  const s = staleness(c);
  if (s <= 0) return null;
  return s >= 0.6
    ? 'Zawodnicy są znużeni tym samym planem od wielu tygodni. Zmiana akcentu albo kilka zmian w planie odświeży zajęcia.'
    : 'Plan od kilku tygodni wygląda tak samo. Zawodnicy zaczynają się nudzić.';
}
