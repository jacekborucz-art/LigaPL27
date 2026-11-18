// Herb klubu: prawdziwa miniaturka, jeśli istnieje, w przeciwnym razie tarcza SVG w barwach klubu.
// Rezerwy (club.parent) używają herbu pierwszej drużyny z plakietką "II".

export const CRESTS_AVAILABLE = new Set([
  'arka', 'cracovia', 'gks-katowice', 'gornik-leczna', 'gornik-zabrze', 'jagiellonia', 'korona',
  'lech', 'lechia-gdansk', 'legia', 'lks', 'miedz', 'motor', 'piast', 'pogon-szczecin', 'puszcza',
  'radomiak', 'rakow', 'ruch', 'slask', 'stal-mielec', 'termalica', 'warta', 'widzew', 'wieczysta',
  'wisla-krakow', 'wisla-plock', 'zaglebie-lubin',
]);

import { FICTIONAL, realNamesOn, crestsAreHidden } from '../data/clubNames.js';
/** Nowy herb (fikcyjna nazwa klubu, przeglądarka bez prawdziwych nazw). */
const fictionalCrest = (id) => !!FICTIONAL[id] && typeof document !== 'undefined' && !realNamesOn();
/** Nowe herby w assets/crests/f (kluby z nazwą do publikacji, które mają już plik). Bez pliku: tarcza w barwach klubu. */
export const FICTIONAL_CRESTS = new Set([
  'cracovia', 'gks-katowice', 'gornik-zabrze', 'jagiellonia', 'korona', 'lech', 'legia', 'motor', 'piast', 'pogon-szczecin',
  'radomiak', 'rakow', 'slask', 'widzew', 'wieczysta', 'wisla-krakow', 'wisla-plock', 'zaglebie-lubin',
  // 1 Liga
  'arka', 'lechia-gdansk', 'puszcza', 'polonia-bytom', 'ruch', 'pogon-grodzisk', 'podbeskidzie', 'stal-rzeszow', 'miedz',
  'stal-mielec', 'chrobry', 'pogon-siedlce', 'odra-opole', 'polonia-warszawa', 'warta', 'termalica', 'lks', 'unia-skierniewice',
  // 2 Liga (Legat II i Silesia II mają własne herby)
  'resovia', 'rekord', 'sandecja', 'chojniczanka', 'sokol-kleczew', 'swit', 'gornik-leczna', 'hutnik', 'legia-ii', 'avia', 'stal-stalowa-wola', 'olimpia-grudziadz', 'znicz', 'zawisza', 'slask-ii', 'podhale', 'gks-tychy', 'lechia-zg',
]);

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

const HEX = /^#[0-9a-fA-F]{6}$/;

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Zastępcza tarcza: lewa połowa w kolorze 1, prawa w kolorze 2, skrót nazwy na środku. */
export function fallbackCrestSvg(club) {
  const [c1raw, c2raw] = club.colors || [];
  const c1 = HEX.test(c1raw) ? c1raw : '#1E6B3A';
  const c2 = HEX.test(c2raw) ? c2raw : '#F3F6F1';
  const text = luminance(c1) > 0.45 ? '#14211A' : '#FFFFFF';
  const label = esc((club.short || club.name.slice(0, 3)).toUpperCase());
  return `<svg viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(club.name)}">
  <defs><clipPath id="s-${esc(club.id)}"><path d="M20 1 L38 6 V22 C38 34 30 42 20 47 C10 42 2 34 2 22 V6 Z"/></clipPath></defs>
  <g clip-path="url(#s-${esc(club.id)})">
    <rect width="40" height="48" fill="${c1}"/>
    <rect x="20" width="20" height="48" fill="${c2}" opacity=".9"/>
    <rect y="14" width="40" height="15" fill="${c1}"/>
  </g>
  <path d="M20 1 L38 6 V22 C38 34 30 42 20 47 C10 42 2 34 2 22 V6 Z" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/>
  <text x="20" y="25.5" text-anchor="middle" font-family="'Barlow Condensed', sans-serif" font-weight="700" font-size="11" fill="${text}">${label}</text>
</svg>`;
}

/**
 * HTML herbu. size w px CSS; dla <= 24 px używamy miniatury 48, wyżej 128.
 * base: ścieżka do katalogu assets (względna względem strony).
 */
export function crestHtml(club, { size = 32, base = 'assets/crests', clubsById = null } = {}) {
  // Rezerwy z własnym nowym herbem (np. Legat II) używają go, pozostałe herbu pierwszej drużyny z plakietką „II”
  const hidden = crestsAreHidden(); // gra z datapackiem: tylko tarcze w barwach klubów
  const own = !hidden && fictionalCrest(club.id) && FICTIONAL_CRESTS.has(club.id);
  const parent = !own && club.parent && clubsById ? clubsById.get(club.parent) : null;
  const source = parent || club;
  const badge = club.parent && !own ? '<span class="crest__badge">II</span>' : '';
  let inner;
  const fict = fictionalCrest(source.id);
  if (hidden) {
    inner = fallbackCrestSvg(source);
  } else if (fict && !FICTIONAL_CRESTS.has(source.id)) {
    inner = fallbackCrestSvg(source); // nowa nazwa bez nowego herbu: nie pokazujemy prawdziwego
  } else if (CRESTS_AVAILABLE.has(source.id) || fict) {
    const file = size <= 24 ? `${source.id}-48.webp` : `${source.id}.webp`;
    // Kluby z nazwą do publikacji (src/data/clubNames.js): nowe herby w assets/crests/f, prawdziwe po Ctrl+Alt+P
    const dir = fict ? `${base}/f` : base;
    inner = `<img src="${dir}/${file}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`;
  } else {
    inner = fallbackCrestSvg(source);
  }
  return `<span class="crest" style="--crest:${size}px" title="${esc(club.name)}">${inner}${badge}</span>`;
}
