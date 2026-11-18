// Strzałki ruchu zawodników na boisku (docs/strzalki-ruchu.md): warstwa SVG pod żetonami, kompas z dozwolonymi
// kierunkami, legenda, ostrzeżenie o obu bocznych obrońcach do przodu i przyciąganie przeciągnięcia do 8 kierunków.
// Czyste funkcje zwracające HTML, wspólne dla ekranu Skład i taktyka i okna „Zmiany i taktyka” w meczu.
// Kierunki są względne do strony zawodnika: „do środka” u lewego obrońcy to strzałka w prawo, u prawego w lewo.
import { ARROW_DIRS, arrowDir, arrowLabel, arrowOf } from '../data/playerInstructions.js';
import { esc } from './dom.js';

/** Rodzaj linii: wbieganie (przerywana), cofnięcie (kropkowana), w bok (ciągła, inny kolor). */
export const arrowKind = (dir) => (dir === 'b' ? 'back' : dir === 'i' || dir === 'o' ? 'lat' : 'run');
/** Strona szeroko: -1 w lewo (x < 50), 1 w prawo (x >= 50, także środek boiska). */
const wideSign = (x) => (x < 50 ? -1 : 1);

/**
 * Wektor strzałki we współrzędnych miejsca w formacji (x: 0-100 od lewej, y: 0-100 od własnej bramki).
 * Do przodu ok. 14, w bok ok. 17 (szerokość boiska jest mniejsza niż długość), skos 11 i 13.
 */
export function arrowVec(dir, x) {
  const d = arrowDir(dir);
  if (!d) return { dx: 0, dy: 0 };
  const side = d.lat ? d.lat * wideSign(x) : 0; // lat 1 = szeroko (od środka), -1 = do środka
  if (d.run && d.lat) return { dx: 13 * side, dy: 11 * d.run };
  if (d.lat) return { dx: 17 * side, dy: 0 };
  return { dx: 0, dy: d.run > 0 ? 14 : -11 };
}

const MARK = { run: 'run', back: 'back', lat: 'lat' };
/**
 * Warstwa SVG ze strzałkami. items: [{ x, y, dir }] (współrzędne miejsca), map(x, y) -> [lewo %, góra %] pozycja
 * żetonu w kontenerze, vw x vh: viewBox o proporcjach kontenera (grot bez zniekształceń), id: przedrostek znaczników.
 */
export function arrowsSvg(items, { map, vw = 68, vh = 100, id = 'pa', cls = '' } = {}) {
  const pt = (x, y) => { const [l, t] = map(x, y); return [Math.round(l * vw) / 100, Math.round(t * vh) / 100]; };
  const lines = items.filter((it) => arrowDir(it.dir)).map((it) => {
    const v = arrowVec(it.dir, it.x);
    const [x1, y1] = pt(it.x, it.y); const [x2, y2] = pt(it.x + v.dx, it.y + v.dy);
    const k = arrowKind(it.dir);
    const d = `M${x1} ${y1}L${x2} ${y2}`;
    return `<path class="pa__halo" d="${d}"/><path class="pa__l pa__l--${k}" d="${d}" marker-end="url(#${id}-${MARK[k]})"/>`;
  }).join('');
  const marker = (k) => `<marker id="${id}-${k}" class="pa__m pa__m--${k}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="2.4" markerHeight="2.4" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0.8L9.5 5L0 9.2z"/></marker>`;
  return `<svg class="pa${cls ? ` ${cls}` : ''}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs>${marker('run')}${marker('back')}${marker('lat')}</defs>${lines}</svg>`;
}

/** Legenda pod boiskiem. */
export function arrowLegendHtml() {
  const s = (k, t) => `<span><svg viewBox="0 0 28 8" aria-hidden="true"><path class="pa__l pa__l--${k}" d="M1 4H26"/></svg>${esc(t)}</span>`;
  return `<p class="pa-legend">${s('run', 'kierunek ruchu zawodnika w ataku')}</p>`;
}

/**
 * Położenie przycisku w kompasie (siatka 3 x 3, środek: brak ruchu). Pion (do przodu w górę): c, r;
 * poziom (okno meczu na telefonie, do przodu w prawo): lc, lr. a i la: obrót grotu w stopniach.
 */
export function compassCell(dir, x) {
  const d = arrowDir(dir);
  const sx = d.lat ? d.lat * wideSign(x) : 0;
  const c = 2 + sx; const r = 2 - d.run;
  const lc = 2 + d.run; const lr = 2 + sx;
  const deg = (dc, dr) => Math.round(Math.atan2(dr, dc) * 180 / Math.PI);
  return { c, r, lc, lr, a: deg(c - 2, r - 2), la: deg(lc - 2, lr - 2) };
}

const GLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h13M12.5 6.5 18 12l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Kompas zawodnika: tylko dozwolone kierunki (przyciski 44 px) i środek „brak ruchu”.
 * dirs: dozwolone kierunki, cur: obecny, attr(dir): atrybuty przycisku hosta (dir '' = brak), style: położenie.
 */
export function compassHtml({ name, pos, x, dirs, cur = null, attr, style = '', closeAttr = '' }) {
  const btn = (dir) => {
    const g = compassCell(dir, x);
    const lab = arrowLabel(dir);
    return `<button type="button" class="acomp__b${cur === dir ? ' is-on' : ''}" ${attr(dir)} data-dir="${dir}" aria-pressed="${cur === dir}" aria-label="${esc(`${lab}${cur === dir ? ' (teraz)' : ''}`)}" title="${esc(lab)}"
      style="--c:${g.c};--r:${g.r};--lc:${g.lc};--lr:${g.lr};--a:${g.a}deg;--la:${g.la}deg">${GLYPH}</button>`;
  };
  const none = `<button type="button" class="acomp__b acomp__b--none${cur ? '' : ' is-on'}" ${attr('')} data-dir="" aria-pressed="${!cur}" aria-label="Brak ruchu, jak drużyna" title="Brak ruchu (jak drużyna)" style="--c:2;--r:2;--lc:2;--lr:2"><span aria-hidden="true">×</span></button>`;
  const order = ARROW_DIRS.map((d) => d.id).filter((d) => dirs.includes(d));
  return `<div class="acomp" role="dialog" aria-label="${esc(`Ruch: ${name}, ${pos}. Strzałki na klawiaturze wybierają kierunek, Delete usuwa, Escape zamyka.`)}" style="${style}" data-acomp>
    <div class="acomp__grid">${order.map(btn).join('')}${none}</div>
    <p class="acomp__cap"><b>${esc(String(name).split(' ').slice(-1)[0])}</b><span>${esc(cur ? arrowLabel(cur).toLowerCase() : 'bez ruchu')}</span>${closeAttr ? `<button type="button" class="acomp__x" ${closeAttr} aria-label="Zamknij kompas">Zamknij</button>` : ''}</p>
  </div>`;
}

/** Ostrzeżenie (bez blokady): co najmniej dwóch bocznych obrońców do przodu bez asekuracji. items: [{ pos, dir }]. */
export function fbWarning(items) {
  const fb = items.filter((it) => it.pos === 'BO' || it.pos === 'WB');
  const fwd = fb.filter((it) => it.dir === 'f' || it.dir === 'fi' || it.dir === 'fo').length;
  const cover = fb.some((it) => it.dir === 'i' || it.dir === 'b');
  return fwd >= 2 && !cover ? 'Obaj boczni obrońcy idą do przodu: ryzyko kontry rywala za ich plecami.' : '';
}

/**
 * Przeciągnięcie od zawodnika (PC): wektor na ekranie (dx w prawo, dy w dół) przyciągany do 8 kierunków
 * i zamieniany na kierunek względny (x: miejsce zawodnika). landscape: do przodu w prawo. Zwraca id albo null.
 */
export function snapDir(dx, dy, x, landscape = false) {
  if (Math.hypot(dx, dy) < 1) return null;
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const sx = Math.round(Math.cos(sector * Math.PI / 4)); const sy = Math.round(Math.sin(sector * Math.PI / 4));
  const run = landscape ? sx : -sy;
  const lateral = landscape ? sy : sx; // na poziomym boisku x zawodnika rośnie w dół
  const lat = lateral === 0 ? 0 : lateral === wideSign(x) ? 1 : -1;
  return arrowOf({ run, lat });
}

/** Kierunek zawodnika do rysowania: tylko dozwolony na miejscu (niedozwolony silnik pomija). */
export const drawnDir = (entry, allowed) => { const d = arrowOf(entry); return d && allowed(d) ? d : null; };
