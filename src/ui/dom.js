// Pomocnicze funkcje DOM. Każdy tekst wstawiany do HTML przechodzi przez esc().

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

export const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

/** Data po polsku w grze, np. 24 lip 2026. */
export function fmtDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS_PL[m - 1]} ${y}`;
}

/** Dzień i miesiąc bez roku, np. 24 lip. */
export function fmtDay(iso) {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS_PL[m - 1]}`;
}

/** Skrót miesiąca, np. lip. */
export const fmtMon = (iso) => MONTHS_PL[Number(iso.slice(5, 7)) - 1];

export function weekday(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export const ICONS = {
  pulpit: '<path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6"/>',
  poczta: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  kadra: '<path d="M8 4l4 2 4-2 4 3-2 4-2-1v10H8V10l-2 1-2-4z"/>',
  rozgrywki: '<path d="M7 4h10v3a5 5 0 0 1-10 0zM5 5H3a3 3 0 0 0 4 4M19 5h2a3 3 0 0 1-4 4M12 12v4M8 20h8M10 16h4v4h-4z"/>',
  mecz: '<circle cx="12" cy="12" r="8"/><path d="M12 7l3.5 2.5-1.3 4.1H9.8L8.5 9.5zM12 4v3M20 10l-4.5-.5M17 19l-2.8-5.4M7 19l2.8-5.4M4 10l4.5-.5"/>',
  transfery: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  trening: '<path d="M4 18l4-4 3 3 7-8M14 9h4v4"/>',
  opcje: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  zapis: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  wyjscie: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  klub: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12h6M12 9v6"/>',
};

export function icon(name) {
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}
