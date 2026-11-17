// Powód pauzy za kartki (znaczniki w Kadrze, src/ui/playerTags.js): p.suspWhy[klucz] = 'y' (nagromadzone żółte)
// albo 'r' (czerwona kartka), klucze jak p.susp (klasa ligi, 'cup', 'uefa'). Wpis znika, gdy pauza w tym kluczu się
// kończy; zapis sprzed tej zmiany nie ma p.suspWhy: pauza liczy się wtedy jak za żółte.

/** Zapis powodu nowej pauzy: czerwona kartka ma pierwszeństwo, dopóki trwa pauza z nią związana. */
export function noteSuspWhy(p, key, why) {
  const w = (p.suspWhy ??= {});
  w[key] = why === 'r' || w[key] === 'r' ? 'r' : 'y';
}

/** Koniec pauzy w kluczu: usuwa powód (pusty obiekt znika z zapisu). */
export function clearSuspWhy(p, key) {
  if (!p.suspWhy) return;
  delete p.suspWhy[key];
  if (!Object.keys(p.suspWhy).length) delete p.suspWhy;
}

/** Przeniesienie pauzy między kluczami (nowy sezon, zmiana klasy): powód idzie za pauzą. */
export function moveSuspWhy(p, from, to) {
  const why = p.suspWhy?.[from];
  if (!why) return;
  clearSuspWhy(p, from);
  noteSuspWhy(p, to, why);
}

/** Porządki: powody bez trwającej pauzy (np. pauzy wyzerowane w innym miejscu). */
export function pruneSuspWhy(p) {
  if (!p.suspWhy) return;
  for (const k of Object.keys(p.suspWhy)) if (!(p.susp?.[k] > 0)) delete p.suspWhy[k];
  if (!Object.keys(p.suspWhy).length) delete p.suspWhy;
}

/** Powód pauzy w kluczu: 'r' albo 'y' (stary zapis bez powodu: 'y'). */
export const suspWhyOf = (p, key) => (p?.suspWhy?.[key] === 'r' ? 'r' : 'y');
