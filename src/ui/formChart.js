// Wykres formy zawodnika: oceny z ostatnich 10 meczów (dodatek wizualny karty zawodnika).
// Dane: p.fh = [[ocena, data, rywal, rozgrywki, gole, asysty, dom 1/0], ...] (src/season/season.js, applyResult).
// Starsze zapisy mają tylko p.form (5 ostatnich ocen), wtedy wykres pokazuje same oceny.
import { anyClub } from '../season/season.js';
import { esc, fmtDate } from './dom.js';

export const FORM_MATCHES = 10;
const Y_MIN = 4.5, Y_MAX = 9.5; // stała skala, żeby karty różnych zawodników dało się porównać
const W = 280, H = 128, PAD_L = 24, PAD_R = 14, PAD_T = 16, PAD_B = 22;

export const formBand = (r) => (r >= 7.5 ? 'top' : r >= 6.8 ? 'good' : r >= 6.0 ? 'mid' : 'low');

/** Ostatnie mecze w formie { r, d, opp, comp, g, a, home } (najstarszy pierwszy). */
export function formHistory(p) {
  if (Array.isArray(p.fh) && p.fh.length) {
    return p.fh.slice(-FORM_MATCHES).map(([r, d, opp, comp, g = 0, a = 0, home = null]) => ({ r, d, opp, comp, g, a, home }));
  }
  return (Array.isArray(p.form) ? p.form : []).slice(-FORM_MATCHES).map((r) => ({ r, d: null, opp: null, comp: null, g: 0, a: 0, home: null }));
}

/** Trend: średnia 3 ostatnich meczów wobec wcześniejszych. */
export function formTrend(list) {
  if (list.length < 4) return 0;
  const avg = (xs) => xs.reduce((s, x) => s + x.r, 0) / xs.length;
  const d = avg(list.slice(-3)) - avg(list.slice(0, -3));
  return d >= 0.3 ? 1 : d <= -0.3 ? -1 : 0;
}

const TREND = { 1: ['up', '▲ zwyżka'], 0: ['flat', '► stabilna'], [-1]: ['down', '▼ spadek'] };

function pointTitle(m) {
  const opp = m.opp ? anyClub(m.opp)?.name ?? m.opp : null;
  const parts = [];
  if (m.d) parts.push(fmtDate(m.d));
  if (opp) parts.push(`${m.home === 1 ? 'dom' : m.home === 0 ? 'wyjazd' : ''}${m.home != null ? ', ' : ''}${opp}`);
  parts.push(`ocena ${m.r.toFixed(1)}`);
  if (m.g) parts.push(`gole: ${m.g}`);
  if (m.a) parts.push(`asysty: ${m.a}`);
  return parts.join(', ');
}

/** Panel z wykresem liniowym formy (SVG, skaluje się do szerokości kontenera). */
export function formChartHtml(p, { title = 'Forma' } = {}) {
  const list = formHistory(p);
  if (list.length < 2) {
    return `<section class="fch fch--empty" aria-label="${esc(title)}"><header class="fch__head"><h3>${esc(title)}</h3></header>
      <p class="fch__none">Wykres pojawi się po dwóch meczach o punkty.</p></section>`;
  }
  const n = list.length;
  const step = (W - PAD_L - PAD_R) / (FORM_MATCHES - 1);
  // Mecze dosunięte do prawej: najnowszy zawsze w tym samym miejscu, puste miejsca po lewej przy krótkiej historii
  const x = (i) => PAD_L + (FORM_MATCHES - n + i) * step;
  const y = (r) => PAD_T + (1 - (Math.min(Y_MAX, Math.max(Y_MIN, r)) - Y_MIN) / (Y_MAX - Y_MIN)) * (H - PAD_T - PAD_B);
  const pts = list.map((m, i) => [x(i), y(m.r)]);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const base = H - PAD_B;
  const area = `${line} L${pts[n - 1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z`;
  const avg = list.reduce((s, m) => s + m.r, 0) / n;
  const last = list[n - 1];
  const [tk, tl] = TREND[formTrend(list)];
  const grid = [6, 7, 8, 9].map((v) => `<line class="fch__grid" x1="${PAD_L}" x2="${W - PAD_R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="fch__ax" x="${PAD_L - 6}" y="${(y(v) + 3.5).toFixed(1)}">${v}</text>`).join('');
  const ticks = list.map((m, i) => (m.g || m.a ? `<text class="fch__ga" x="${x(i).toFixed(1)}" y="${H - 5}">${m.g ? `${m.g > 1 ? m.g : ''}G` : ''}${m.a ? `${m.a > 1 ? m.a : ''}A` : ''}</text>` : '')).join('');
  const dots = list.map((m, i) => {
    const lastPt = i === n - 1;
    return `<g class="fch__pt${lastPt ? ' is-last' : ''}" data-b="${formBand(m.r)}" tabindex="0"><title>${esc(pointTitle(m))}</title>
      <circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="${lastPt ? 5.5 : 3.8}"/></g>`;
  }).join('');
  const lastLbl = `<text class="fch__lbl" x="${pts[n - 1][0].toFixed(1)}" y="${(pts[n - 1][1] - 11).toFixed(1)}">${last.r.toFixed(1)}</text>`;
  const desc = `Oceny z ${n} ostatnich meczów: ${list.map((m) => m.r.toFixed(1)).join(', ')}. Średnia ${avg.toFixed(2)}.`;
  return `<section class="fch" aria-label="${esc(title)}">
    <header class="fch__head"><h3>${esc(title)}</h3>
      <span class="fch__meta">śr. <b data-b="${formBand(avg)}">${avg.toFixed(2)}</b></span>
      <span class="fch__trend" data-t="${tk}">${tl}</span></header>
    <svg class="fch__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}" preserveAspectRatio="xMidYMid meet">
      <rect class="fch__zone fch__zone--top" x="${PAD_L}" y="${PAD_T}" width="${W - PAD_L - PAD_R}" height="${(y(7.5) - PAD_T).toFixed(1)}"/>
      <rect class="fch__zone fch__zone--low" x="${PAD_L}" y="${y(6).toFixed(1)}" width="${W - PAD_L - PAD_R}" height="${(base - y(6)).toFixed(1)}"/>
      ${grid}
      <path class="fch__area" d="${area}"/>
      <path class="fch__line" d="${line}"/>
      ${dots}${lastLbl}${ticks}
    </svg>
    <p class="fch__foot">${n} ${n >= 5 ? 'ostatnich meczów' : 'ostatnie mecze'}, najnowszy po prawej${list.some((m) => m.g || m.a) ? '. G gol, A asysta' : ''}</p>
  </section>`;
}
