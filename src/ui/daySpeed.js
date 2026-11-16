// Tempo upływu dni po „Dalej” (Opcje). Preferencja tej przeglądarki, jak motyw. Wolniejsze tempo daje czas,
// żeby przyciskiem „Zatrzymaj” zatrzymać grę na wybranej dacie.
const SPEED_KEY = 'ligapl27-day-speed';
export const DAY_SPEEDS = { std: 'Bez zmian', 1: '1 sekunda na dzień', 2: '2 sekundy na dzień', 3: '3 sekundy na dzień' };

export function readDaySpeed() {
  try { const v = localStorage.getItem(SPEED_KEY); return DAY_SPEEDS[v] ? v : 'std'; } catch { return 'std'; }
}
export function saveDaySpeed(v) {
  try { localStorage.setItem(SPEED_KEY, DAY_SPEEDS[v] ? v : 'std'); } catch { /* tryb prywatny: tylko na tę wizytę */ }
}
/** Pauza między dniami w ms. „Bez zmian”: 110 ms (0 przy ograniczonym ruchu). Sekundy działają zawsze. */
export function dayDelayMs(v, reducedMotion = false) {
  if (v === '1' || v === '2' || v === '3') return Number(v) * 1000;
  return reducedMotion ? 0 : 110;
}
