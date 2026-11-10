// Rejestr modyfikatorów: jedyne miejsce, w którym stan zawodnika, drużyny i meczu
// zamienia się na liczby dla silnika. Silnik (pełny i szybki) nie zna poszczególnych cech;
// pyta rejestr o sumę. Nowy atrybut albo nowa logika (np. pogoda, chemia, plotki w szatni)
// to jeden nowy wpis tutaj, bez przebudowy silnika.
//
// Wpis: { id, scope: 'player'|'team'|'match', label, apply(subject, ctx) -> liczba w punktach atrybutu,
//         enabled?: (ctx) => boolean }
// Wynik każdego wpisu trafia do rozbicia (breakdown), więc raport asystenta i studio
// mogą pokazać, skąd wzięła się siła drużyny.

import { clamp } from '../core/rng.js';

const registry = { player: [], team: [], match: [] };

export function registerModifier(mod) {
  if (!mod?.id || !registry[mod.scope] || typeof mod.apply !== 'function') {
    throw new Error(`Nieprawidłowy modyfikator: ${mod?.id}`);
  }
  const list = registry[mod.scope];
  const i = list.findIndex((m) => m.id === mod.id);
  if (i >= 0) list[i] = mod; else list.push(mod);
  return mod;
}

export function unregisterModifier(scope, id) {
  const list = registry[scope];
  const i = list.findIndex((m) => m.id === id);
  if (i >= 0) list.splice(i, 1);
}

export function listModifiers(scope) {
  return registry[scope].map((m) => m.id);
}

/** Suma modyfikatorów danego zakresu + rozbicie { id: wartość }. */
export function evaluate(scope, subject, ctx = {}) {
  let total = 0;
  const parts = {};
  for (const m of registry[scope]) {
    if (m.enabled && !m.enabled(ctx)) continue;
    const v = Number(m.apply(subject, ctx)) || 0;
    parts[m.id] = v;
    total += v;
  }
  return { total, parts };
}

// ------------------------------------------------------------ Modyfikatory zawodnika (docs/ekspert_futbol.md 2.3)
registerModifier({
  id: 'form', scope: 'player', label: 'Forma',
  apply: (p) => (Array.isArray(p.form) && p.form.length
    ? clamp(0.25 * (p.form.reduce((a, b) => a + b, 0) / p.form.length - 6.6), -0.5, 0.5) : 0),
});
registerModifier({
  id: 'morale', scope: 'player', label: 'Morale',
  apply: (p) => 0.04 * ((p.morale ?? 12) - 10),
});
registerModifier({
  id: 'sharp', scope: 'player', label: 'Ostrość meczowa',
  apply: (p) => ((p.sharp ?? 80) < 60 ? -0.02 * (60 - p.sharp) : 0),
});
registerModifier({
  id: 'fresh', scope: 'player', label: 'Świeżość',
  enabled: (ctx) => !ctx.inMatch, // w meczu liczy się bieżąca kondycja (silnik), nie świeżość sprzed meczu
  apply: (p) => ((p.fresh ?? 95) < 85 ? -0.04 * (85 - p.fresh) : 0),
});
registerModifier({
  id: 'playingInjured', scope: 'player', label: 'Gra z urazem',
  apply: (p) => (p.playingInjured ? -0.045 * p.ovr : 0), // cechy fizyczne -15 %
});
