// Mapa pozycji w karcie zawodnika: boisko ze wszystkimi pozycjami i biegłością (0-100 %) na każdej.
// Biegłość z silnika (src/engine/positions.js, proficiency): ta sama, której używa mecz.
import { proficiency } from '../engine/positions.js';
import { POS_NAMES } from '../data/attributes.js';
import { esc } from './dom.js';

// Miejsca na boisku (x, y w % szerokości i wysokości; atak u góry). Pozycje boczne osobno dla lewej i prawej strony.
const SPOTS = [
  ['NAP', null, 50, 9],
  ['SN', 'L', 15, 17], ['SN', 'P', 85, 17],
  ['OP', null, 50, 28],
  ['BP', 'L', 13, 40], ['ŚP', null, 50, 44], ['BP', 'P', 87, 40],
  ['WB', 'L', 11, 57], ['DP', null, 50, 59], ['WB', 'P', 89, 57],
  ['BO', 'L', 16, 72], ['ŚO', null, 50, 75], ['BO', 'P', 84, 72],
  ['BR', null, 50, 87],
];

/** Pasmo biegłości: optymalna, dobra, słaba, nie gra. */
export const profBand = (v) => (v >= 85 ? 'opt' : v >= 70 ? 'ok' : v >= 50 ? 'weak' : 'no');
const SIDE_NAME = { L: 'lewa strona', P: 'prawa strona' };

/** Biegłość na wszystkich miejscach boiska (do mapy i testów). */
export function positionGrid(p) {
  return SPOTS.map(([pos, side, x, y]) => ({ pos, side, x, y, v: Math.round(proficiency(p, pos, side)), natural: p.pos === pos && (!side || !p.side || p.side === 'LP' || p.side === side) }));
}

/** Boisko z biegłością zawodnika na każdej pozycji (SVG skalowane do szerokości). */
export function positionMapHtml(p, { title = 'Pozycje' } = {}) {
  const W = 200, H = 270;
  const grid = positionGrid(p);
  const best = grid.filter((g) => !g.natural && g.v >= 70).sort((a, b) => b.v - a.v);
  const bestTxt = best.length ? `Najlepiej poza nominalną: ${[...new Set(best.slice(0, 3).map((g) => `${g.pos}${g.side ? ` ${g.side}` : ''} ${g.v}%`))].join(', ')}.` : 'Poza nominalną pozycją wyraźnie słabszy.';
  const dots = grid.map((g) => {
    const cx = (g.x / 100) * W; const cy = (g.y / 100) * H;
    const label = `${POS_NAMES[g.pos]}${g.side ? `, ${SIDE_NAME[g.side]}` : ''}: ${g.v}%${g.natural ? ' (pozycja nominalna)' : ''}`;
    return `<g class="pmap__spot" data-b="${profBand(g.v)}"${g.natural ? ' data-nat' : ''} tabindex="0"><title>${esc(label)}</title>
      ${g.natural ? `<circle class="pmap__ring" cx="${cx}" cy="${cy}" r="16.5"/>` : ''}
      <circle class="pmap__dot" cx="${cx}" cy="${cy}" r="13"/>
      <text class="pmap__v" x="${cx}" y="${cy + 4}">${g.v}</text>
      <text class="pmap__pos" x="${cx}" y="${cy + 23}">${esc(g.pos)}${g.side ? ` ${g.side}` : ''}</text></g>`;
  }).join('');
  const pitch = `<rect class="pmap__grass" x="1" y="1" width="${W - 2}" height="${H - 2}" rx="6"/>
    ${Array.from({ length: 6 }, (_, i) => `<rect class="pmap__stripe" x="1" y="${1 + i * 2 * ((H - 2) / 12)}" width="${W - 2}" height="${(H - 2) / 12}"/>`).join('')}
    <g class="pmap__lines"><rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="2"/><line x1="8" y1="${H / 2}" x2="${W - 8}" y2="${H / 2}"/><circle cx="${W / 2}" cy="${H / 2}" r="22"/>
      <rect x="${W / 2 - 44}" y="8" width="88" height="34"/><rect x="${W / 2 - 44}" y="${H - 42}" width="88" height="34"/>
      <rect x="${W / 2 - 20}" y="8" width="40" height="12"/><rect x="${W / 2 - 20}" y="${H - 20}" width="40" height="12"/></g>`;
  const desc = grid.map((g) => `${g.pos}${g.side ? ` ${g.side}` : ''} ${g.v}%`).join(', ');
  return `<section class="pmap" aria-label="${esc(title)}">
    <header class="pmap__head"><h3>${esc(title)}</h3><span class="pmap__nat">Nominalna: <b>${esc(POS_NAMES[p.pos] ?? p.pos)}</b>${p.side && p.side !== 'LP' ? `, ${esc(SIDE_NAME[p.side])}` : ''}</span></header>
    <svg class="pmap__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Biegłość na pozycjach: ${desc}`)}">${pitch}${dots}</svg>
    <ul class="pmap__legend" aria-hidden="true"><li data-b="opt">85-100% optymalna</li><li data-b="ok">70-84% dobra</li><li data-b="weak">50-69% słaba</li><li data-b="no">poniżej 50% nie gra</li></ul>
    <p class="pmap__note">${esc(bestTxt)} Biegłość obniża siłę zawodnika w meczu i zwiększa ryzyko błędów w obronie.</p>
  </section>`;
}
