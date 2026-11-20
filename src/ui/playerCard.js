// Karta zawodnika: wspólny wygląd i okno dla Kadra > Skład i taktyka (src/ui/tacticsView.js, app.js)
// i okna „Zmiany i taktyka” w meczu (src/ui/matchdayView.js).
// PC (od 1100 px, WIDE_CARD): pływające okno niemodalne <dialog class="tdet tcard" open>, przeciągane za pasek,
// strzałki z uchwytu, położenie zapamiętane dla każdego z dwóch miejsc. Węższy ekran: <dialog class="tdet">,
// który widok otwiera przez showModal() (arkusz od dołu na telefonie).
import { POS_NAMES } from '../data/attributes.js';
import { NAT_NAMES } from '../data/names.js';
import { GROUP } from '../career/squad.js';
import { attrGroupsHtml } from './squadView.js';
import { esc } from './dom.js';
import { formChartHtml } from './formChart.js';
import { positionMapHtml } from './positionMap.js';
import { scoutEye, hiddenAttrsHtml } from './scoutMask.js'; // kandydat skauta: ocena i atrybuty ukryte

export const WIDE_CARD = '(min-width: 1100px)'; // ten sam próg co pływająca karta w app.css
const CARD_KEY = 'lp27.tac.card.';

export const freshBand = (f) => (f >= 80 ? 'good' : f >= 65 ? 'mid' : 'low');
const posText = (p) => `${p.pos}${p.side ? ` ${p.side}` : ''}`;

/** Wiersz faktów karty: { k: etykieta, html: wartość (już bezpieczna), bad: wyróżnienie złego stanu }. */
export const cardFact = (k, html, bad = false) => ({ k, html, bad });
/** Wartość z paskiem (świeżość, kondycja w meczu). */
export function barFactHtml(v) {
  const n = Math.round(v);
  return `<span class="abar" aria-hidden="true"><i data-b="${freshBand(n)}" style="width:${n}%"></i></span>${n}%`;
}

/**
 * Karta zawodnika p. facts: lista z cardFact. extra: HTML pod atrybutami (statystyki).
 * wide: pływające okno PC. slot: miejsce okna (0 albo 1). pinned: stan przypięcia (null: bez przycisku przypięcia).
 * closeAttrs / pinAttrs: atrybuty akcji przycisków (np. data-act w Kadrze, data-md w meczu). cls: dodatkowa klasa okna.
 * hidden: kandydat skauta przed podpisaniem (lornetka zamiast OVR, bez atrybutów; src/ui/scoutMask.js).
 */
export function renderPlayerCard(p, { facts = [], extra = '', wide = false, slot = 0, pinned = null, closeAttrs = '', pinAttrs = '', cls = '', hidden = false } = {}) {
  const hid = wide ? `tcard-h-${slot}` : 'tdet-h';
  const pin = pinned === null ? '' : `
      <button class="tcard__pin" type="button" ${pinAttrs} aria-pressed="${pinned}" aria-label="Przypnij kartę (zostaje przy otwieraniu drugiej, do porównania)" title="Przypnij kartę"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M15 3l6 6-2 1-3 3 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 3-3z"/></svg></button>`;
  const bar = wide ? `<div class="tcard__bar">
      <button class="tcard__grip" type="button" data-tcard-grip aria-label="Przesuń okno zawodnika. Strzałki przesuwają, Shift przesuwa szybciej, Home przywraca położenie"></button>
      <h3 class="tcard__name" id="${hid}" tabindex="-1" title="${esc(p.name)}">${esc(p.name)}</h3>${pin}
      <button class="tdet__x" ${closeAttrs} aria-label="Zamknij kartę zawodnika">×</button>
      <p class="sr-only" role="status" data-tcard-live></p>
    </div>` : '';
  return `<dialog class="tdet${wide ? ' tcard' : ''}${cls ? ` ${cls}` : ''}" open data-card="${slot}" data-id="${esc(p.id)}" aria-labelledby="${hid}">
    ${bar}
    <div class="tdet__in">
      <header class="tdet__head">
        ${hidden ? scoutEye('tdet__ovr tdet__ovr--eye') : `<span class="tdet__ovr" aria-label="Ocena ogólna ${Math.round(p.ovr)} w skali 1-20" title="Ocena ogólna w skali 1-20">${Math.round(p.ovr)}</span>`}
        <span class="pos" data-g="${GROUP[p.pos]}">${esc(posText(p))}</span>
        <button class="tdet__x" ${closeAttrs} aria-label="Zamknij atrybuty">×</button>
        <div class="tdet__title">
          <h3${wide ? '' : ' id="tdet-h"'}>${esc(p.name)}</h3>
          <p>${esc(POS_NAMES[p.pos])}, ${p.age} lat, ${esc(NAT_NAMES[p.nat] ?? p.nat)}</p>
        </div>
      </header>
      <dl class="tdet__facts">
        ${facts.map((f) => `<div${f.bad ? ' class="is-bad"' : ''}><dt>${f.k}</dt><dd>${f.html}</dd></div>`).join('\n        ')}
      </dl>
      <div class="tdet__vis">${formChartHtml(p)}${positionMapHtml(p)}</div>
      ${hidden ? hiddenAttrsHtml() : wide && p.pos === 'BR' // bramkarz na PC: Mentalne nad Fizycznymi, Bramkarskie pod Technicznymi (2 kolumny)
        ? `<div class="tdet__groups tdet__groups--gk">${attrGroupsHtml(p, { heading: 'h4', order: ['mental', 'phys', 'tech', 'gk'] })}</div>`
        : `<div class="tdet__groups">${attrGroupsHtml(p, { heading: 'h4' })}</div>`}
      ${extra ? `<div class="tdet__stats">${extra}</div>` : ''}
    </div>
  </dialog>`;
}

// ------------------------------------------------------------ Położenie pływającej karty (PC)
const posCache = [];
function readCardPos(slot) {
  try { const [x, y] = (localStorage.getItem(CARD_KEY + slot) ?? '').split(',').map(Number); return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null; } catch { return null; }
}
function writeCardPos(slot, pos) {
  try { if (pos) localStorage.setItem(CARD_KEY + slot, `${Math.round(pos.x)},${Math.round(pos.y)}`); else localStorage.removeItem(CARD_KEY + slot); } catch { /* bez pamięci: położenie tylko na tę wizytę */ }
}
/** Zapamiętane położenie okna na miejscu slot (null: domyślne). */
export function cardPos(slot) {
  if (posCache[slot] === undefined) posCache[slot] = readCardPos(slot);
  return posCache[slot];
}

/** Położenie pływającej karty (--cx, --cy), zawsze w oknie; null: położenie domyślne. */
export function placeCard(d, pos) {
  if (!pos) { d.style.removeProperty('--cx'); d.style.removeProperty('--cy'); return null; }
  const x = Math.max(8, Math.min(window.innerWidth - 120, pos.x));
  const y = Math.max(8, Math.min(window.innerHeight - 56, pos.y));
  d.style.setProperty('--cx', `${Math.round(x)}px`);
  d.style.setProperty('--cy', `${Math.round(y)}px`);
  return { x, y };
}

function moveCard(d, pos) {
  const slot = Number(d.dataset.card) || 0;
  posCache[slot] = placeCard(d, pos);
  writeCardPos(slot, posCache[slot]);
}

/**
 * Przeciąganie kart za pasek (mysz, pióro, dotyk) i przesuwanie strzałkami z uchwytu, dla wszystkich kart
 * wewnątrz root (także w oknie dialogowym meczu). Podpinane raz na element.
 */
export function bindCardDrag(root) {
  if (root.dataset.tcardDrag) return;
  root.dataset.tcardDrag = '1';
  let move = null;
  let liveT = 0;
  root.addEventListener('pointerdown', (ev) => {
    const bar = ev.target.closest?.('.tcard__bar');
    if (!bar || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    if (ev.target.closest('button') && !ev.target.closest('[data-tcard-grip]')) return;
    const d = bar.closest('dialog.tcard');
    const r = d.getBoundingClientRect();
    move = { d, bar, id: ev.pointerId, dx: ev.clientX - r.left, dy: ev.clientY - r.top, moved: false };
    bar.setPointerCapture?.(ev.pointerId);
  });
  root.addEventListener('pointermove', (ev) => {
    const m = move;
    if (!m || ev.pointerId !== m.id) return;
    m.moved = true;
    m.d.classList.add('is-moving');
    placeCard(m.d, { x: ev.clientX - m.dx, y: ev.clientY - m.dy });
  });
  const end = (ev) => {
    const m = move;
    if (!m || ev.pointerId !== m.id) return;
    move = null;
    m.d.classList.remove('is-moving');
    if (!m.moved) return;
    const r = m.d.getBoundingClientRect();
    moveCard(m.d, { x: r.left, y: r.top });
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('keydown', (ev) => {
    const grip = ev.target.closest?.('[data-tcard-grip]');
    if (!grip) return;
    const d = grip.closest('dialog.tcard');
    const step = ev.shiftKey ? 64 : 16;
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
    if (!dir && ev.key !== 'Home') return;
    ev.preventDefault();
    if (ev.key === 'Home') moveCard(d, null);
    else { const r = d.getBoundingClientRect(); moveCard(d, { x: r.left + dir[0] * step, y: r.top + dir[1] * step }); }
    clearTimeout(liveT);
    liveT = setTimeout(() => {
      const live = d.querySelector('[data-tcard-live]');
      const r = d.getBoundingClientRect();
      if (live) live.textContent = ev.key === 'Home' ? 'Okno zawodnika wróciło na miejsce.' : `Okno zawodnika: ${Math.round(r.left)} px od lewej, ${Math.round(r.top)} px od góry.`;
    }, 400);
  });
}
