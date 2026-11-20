// Ukryta ocena kandydatów ze skautingu (decyzja właściciela Nov 20, 2026, docs/skauting.md rozdz. 7):
// w Transferach zamiast OVR i atrybutów ikona lornetki, bez liczby. Ocena skauta jest tylko w jego raporcie
// (zdanie w poczcie i na karcie kandydata w Transfery, Skauting). Po podpisaniu kontraktu widać prawdziwe wartości.
import { scoutHidden } from '../career/scoutOps.js';
import { esc } from './dom.js';

export { scoutHidden };
export const SCOUT_EYE_TEXT = 'Ocenę zna tylko skaut. Zobacz raport skauta';
export const SCOUT_ATTR_NOTE = 'Dokładne atrybuty poznasz po transferze. Ocenę zawodnika ma skaut w swoim raporcie (Transfery, Skauting).';

const BINOCULARS = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6.5V5a1.5 1.5 0 0 0-3 0v1.6L3.6 13.4"/><path d="M14.5 6.5V5a1.5 1.5 0 0 1 3 0v1.6l2.9 6.8"/><path d="M9.5 8h5v4.5h-5z"/><circle cx="6" cy="16" r="3.6"/><circle cx="18" cy="16" r="3.6"/></g></svg>';

/** Ikona lornetki w miejscu OVR (cls: dodatkowa klasa miejsca, np. w nagłówku karty). */
export const scoutEye = (cls = '') => `<span class="scout-eye${cls ? ` ${cls}` : ''}" role="img" aria-label="${esc(SCOUT_EYE_TEXT)}" title="${esc(SCOUT_EYE_TEXT)}">${BINOCULARS}</span>`;

/** Ramka zamiast grup atrybutów. */
export const hiddenAttrsHtml = () => `<div class="scout-hid">${scoutEye('scout-eye--lg')}<p>${esc(SCOUT_ATTR_NOTE)}</p></div>`;

/** OVR do wyświetlenia: liczba albo lornetka dla ukrytego kandydata. */
export const ovrOrEye = (game, p, cls = '') => (scoutHidden(game, p) ? scoutEye(cls) : String(Math.round(p.ovr)));

/** Wartość do sortowania po OVR: dla ukrytego kandydata ocena widziana przez skauta (bez prawdziwego OVR). */
export function shownOvr(game, p) {
  if (!scoutHidden(game, p)) return p.ovr;
  const r = game.scoutOps?.cands?.[p.id]?.rep;
  return r?.seenOvr ?? (r?.ovrRange ? (r.ovrRange[0] + r.ovrRange[1]) / 2 : 0);
}

/** Wartość rynkowa do pokazania: dla ukrytego kandydata zamiast wartości (zdradza poziom) ramka ceny z raportu skauta. */
export function valueOrScoutPrice(game, p, fmt) {
  if (!scoutHidden(game, p)) return fmt(p.value ?? 0);
  const r = game.scoutOps?.cands?.[p.id]?.rep;
  if (r?.free || (!p.clubId && p.free)) return 'wolny, bez odstępnego';
  return r?.priceRange ? `${fmt(r.priceRange[0])} do ${fmt(r.priceRange[1])} (wg skauta)` : 'cena wg skauta w raporcie';
}
/** Etykieta wiersza: „Wartość” albo „Cena wg skauta”. */
export const valueLabel = (game, p) => (scoutHidden(game, p) ? 'Cena wg skauta' : 'Wartość');
