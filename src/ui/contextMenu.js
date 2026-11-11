// Ogólne menu kontekstowe: wyskakujący panel przy wskaźniku (zawsze w obrębie okna), podmenu otwierane
// w miejscu (z pozycją „Wstecz”), pełna obsługa klawiatury i powrót fokusu. Treść podaje dostawca
// (np. src/ui/playerMenus.js) jako model { title, pos?, meta?, note?, items }; pozycje: { label, hint?,
// disabled?: powód, danger?, primary?, checked?, items?: podmenu } albo { sep: true }.
// bindContextTrigger podpina gesty: prawy przycisk myszy, przytrzymanie palcem, klawisz menu i Shift+F10.
import { esc } from './dom.js';

const MARGIN = 8;
const LONG_PRESS_MS = 480;
const MOVE_TOLERANCE = 10;

let cur = null; // { root, menu, model, stack: [{ items, label, from }], x, y, onSelect, anchor, onClose }

export const isMenuOpen = () => !!cur;

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Pozycje do wybrania na bieżącym poziomie (z „Wstecz”), w kolejności DOM. */
const menuItems = () => [...(cur?.menu.querySelectorAll('[data-i]') ?? [])];

function itemHtml(it, i) {
  const role = it.checked === undefined ? 'menuitem' : 'menuitemradio';
  const cls = ['cmenu__item', it.danger ? 'is-danger' : '', it.primary ? 'is-primary' : '', it.disabled ? 'is-off' : ''].filter(Boolean).join(' ');
  const hint = it.disabled || it.hint;
  return `<button type="button" class="${cls}" role="${role}" tabindex="-1" data-i="${i}"${it.disabled ? ' aria-disabled="true"' : ''}${it.items ? ' aria-haspopup="menu"' : ''}${it.checked === undefined ? '' : ` aria-checked="${!!it.checked}"`}>
    ${it.checked === undefined ? '' : `<span class="cmenu__radio" aria-hidden="true"></span>`}
    <span class="cmenu__text"><span class="cmenu__label">${esc(it.label)}</span>${hint ? `<span class="cmenu__hint${it.disabled ? ' cmenu__hint--why' : ''}">${esc(hint)}</span>` : ''}</span>
    ${it.items ? '<span class="cmenu__chev" aria-hidden="true">›</span>' : ''}
  </button>`;
}

function render() {
  const { model, stack, root } = cur;
  const level = stack[stack.length - 1];
  const head = `<header class="cmenu__head" id="cmenu-h">
      ${model.pos ? `<span class="pos" data-g="${esc(model.group ?? '')}">${esc(model.pos)}</span>` : ''}
      <span class="cmenu__who"><b class="cmenu__title">${esc(model.title)}</b>${model.meta ? `<span class="cmenu__meta">${esc(model.meta)}</span>` : ''}</span>
      ${model.note ? `<span class="cmenu__note">${esc(model.note)}</span>` : ''}
    </header>`;
  const back = stack.length > 1
    ? `<button type="button" class="cmenu__item cmenu__back" role="menuitem" tabindex="-1" data-i="back"><span class="cmenu__chev cmenu__chev--back" aria-hidden="true">‹</span><span class="cmenu__text"><span class="cmenu__label">${esc(level.label)}</span><span class="cmenu__hint">Wstecz</span></span></button><div class="cmenu__sep" role="separator"></div>`
    : '';
  const body = level.items.map((it, i) => (it.sep ? '<div class="cmenu__sep" role="separator"></div>' : itemHtml(it, i))).join('');
  root.innerHTML = `${head}<div class="cmenu__list" role="menu" tabindex="-1" aria-labelledby="cmenu-h" data-level="${stack.length - 1}">${back}${body}</div>`;
  cur.menu = root.querySelector('[role="menu"]');
}

function place() {
  const { root } = cur;
  root.style.maxHeight = '';
  root.style.left = '0px';
  root.style.top = '0px';
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const w = root.offsetWidth;
  const h = Math.min(root.offsetHeight, vh - 2 * MARGIN);
  root.style.maxHeight = `${vh - 2 * MARGIN}px`;
  let x = cur.x;
  let y = cur.y;
  if (x + w > vw - MARGIN) x = Math.max(MARGIN, cur.x - w); // za mało miejsca po prawej: otwieramy w lewo
  if (y + h > vh - MARGIN) y = Math.max(MARGIN, cur.y - h); // i do góry
  x = Math.max(MARGIN, Math.min(vw - w - MARGIN, x));
  y = Math.max(MARGIN, Math.min(vh - h - MARGIN, y));
  root.style.left = `${Math.round(x)}px`;
  root.style.top = `${Math.round(y)}px`;
}

function focusAt(i) {
  const list = menuItems();
  if (!list.length) return;
  const el = list[(i + list.length) % list.length];
  el.focus({ preventScroll: true });
  // Przewinięcie tylko wewnątrz menu (okno strony stoi w miejscu)
  const box = cur.root;
  if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop - 4;
  else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 4;
}

const focusedIndex = () => menuItems().indexOf(document.activeElement);

function enterLevel(it, i) {
  cur.stack.push({ items: it.items, label: it.label, from: i });
  render();
  place();
  focusAt(1); // pierwsza pozycja podmenu (zero to „Wstecz”)
}

function leaveLevel() {
  if (cur.stack.length < 2) return false;
  const { from } = cur.stack.pop();
  render();
  place();
  const el = cur.menu.querySelector(`[data-i="${from}"]`);
  (el ?? menuItems()[0])?.focus({ preventScroll: true });
  return true;
}

function activate(el) {
  if (!cur || !el) return;
  if (el.dataset.i === 'back') { leaveLevel(); return; }
  const it = cur.stack[cur.stack.length - 1].items[Number(el.dataset.i)];
  if (!it || it.disabled) return;
  if (it.items) { enterLevel(it, Number(el.dataset.i)); return; }
  const onSelect = cur.onSelect;
  closeMenu({ restoreFocus: true });
  onSelect?.(it);
}

function onKey(ev) {
  if (!cur) return;
  const k = ev.key;
  const i = focusedIndex();
  const n = menuItems().length;
  const stop = () => { ev.preventDefault(); ev.stopPropagation(); };
  if (k === 'ArrowDown') { stop(); focusAt(i < 0 ? 0 : i + 1); return; }
  if (k === 'ArrowUp') { stop(); focusAt(i < 0 ? n - 1 : i - 1); return; }
  if (k === 'Home' || k === 'PageUp') { stop(); focusAt(0); return; }
  if (k === 'End' || k === 'PageDown') { stop(); focusAt(n - 1); return; }
  if (k === 'Enter' || k === ' ') { stop(); if (i >= 0) activate(menuItems()[i]); else focusAt(0); return; }
  if (k === 'ArrowRight') {
    stop();
    const el = menuItems()[i];
    if (el?.getAttribute('aria-haspopup')) activate(el);
    return;
  }
  if (k === 'ArrowLeft' || k === 'Backspace') { stop(); leaveLevel(); return; }
  if (k === 'Escape') { stop(); if (!leaveLevel()) closeMenu({ restoreFocus: true }); return; }
  if (k === 'Tab') { stop(); closeMenu({ restoreFocus: true }); return; }
  if (k === 'ContextMenu' || (k === 'F10' && ev.shiftKey)) { stop(); closeMenu({ restoreFocus: true }); return; }
  // Szukanie po pierwszej literze etykiety
  if (k.length === 1 && /\S/.test(k) && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    stop();
    const list = menuItems();
    const lc = k.toLocaleLowerCase('pl');
    for (let s = 1; s <= list.length; s++) {
      const el = list[(Math.max(i, 0) + s) % list.length];
      if (el.querySelector('.cmenu__label')?.textContent.trim().toLocaleLowerCase('pl').startsWith(lc)) { el.focus({ preventScroll: true }); break; }
    }
  }
}

function onOutside(ev) {
  if (cur && !cur.root.contains(ev.target)) closeMenu({ restoreFocus: false });
}
function onScroll(ev) {
  if (!cur || (ev.target instanceof Node && cur.root.contains(ev.target))) return;
  // Zdarzenie spóźnione po przewinięciu sprzed otwarcia (np. wyrównanie wiersza) nie zamyka menu
  if (performance.now() - cur.opened < 150) return;
  if ((ev.target === document || ev.target === window) && window.scrollX === cur.sx && window.scrollY === cur.sy) return;
  closeMenu({ restoreFocus: false });
}
function onResize() { if (cur) closeMenu({ restoreFocus: false }); }
function onFocusOut(ev) {
  if (cur && ev.relatedTarget && !cur.root.contains(ev.relatedTarget)) closeMenu({ restoreFocus: false });
}

/**
 * Otwiera menu. x, y: punkt w oknie (kursor albo palec); anchor: element, do którego wraca fokus;
 * keyboard: otwarte z klawiatury (fokus na pierwszej pozycji). onSelect(item) po wyborze pozycji bez podmenu;
 * onClose({ restored }) po zamknięciu.
 */
export function openMenu({ x, y, model, anchor = null, keyboard = false, onSelect, onClose }) {
  closeMenu({ restoreFocus: false });
  const root = document.createElement('div');
  root.className = `cmenu${reduced() ? '' : ' cmenu--anim'}`;
  document.body.appendChild(root);
  cur = { root, model, stack: [{ items: model.items, label: model.title, from: 0 }], x, y, onSelect, onClose, anchor, opened: performance.now(), sx: window.scrollX, sy: window.scrollY };
  render();
  place();
  root.addEventListener('keydown', onKey);
  root.addEventListener('click', (ev) => { const el = ev.target.closest('[data-i]'); if (el) activate(el); });
  // Najechanie myszą przesuwa fokus (jak w menu systemowym); dotyk tylko wybiera.
  root.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const el = ev.target.closest('[data-i]');
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  });
  root.addEventListener('contextmenu', (ev) => ev.preventDefault());
  root.addEventListener('focusout', onFocusOut);
  document.addEventListener('pointerdown', onOutside, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', onResize);
  if (keyboard) focusAt(0);
  else cur.menu.focus({ preventScroll: true });
}

/** Zamyka menu. restoreFocus: fokus wraca na element, z którego menu otwarto (jeśli nadal jest w dokumencie). */
export function closeMenu({ restoreFocus = true } = {}) {
  if (!cur) return;
  const { root, anchor, onClose } = cur;
  cur = null;
  document.removeEventListener('pointerdown', onOutside, true);
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('blur', onResize);
  root.removeEventListener('focusout', onFocusOut);
  root.remove();
  let restored = false;
  if (restoreFocus && anchor?.isConnected) {
    const target = anchor.matches('button, [href], [tabindex]') ? anchor : anchor.querySelector('button, [href], [tabindex]');
    if (target) { target.focus({ preventScroll: true }); restored = true; }
  }
  onClose?.({ restored });
}

// ------------------------------------------------------------ Komunikat po akcji
let toastTimer = 0;
/** Krótki komunikat (role="status") po akcji z menu, gdy bieżący ekran go nie pokazuje. */
export function showToast(text) {
  let el = document.querySelector('.cm-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'cm-toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 4200);
}

// ------------------------------------------------------------ Gesty otwierające menu
/**
 * Podpina otwieranie menu na elementach pasujących do selector wewnątrz root.
 * open(el, { x, y, keyboard, touch }) zwraca true, gdy menu otwarto (wtedy menu przeglądarki jest blokowane).
 * Dotyk: przytrzymanie palca bez ruchu (nie na elementach noTouch, np. uchwytach przeciągania).
 */
export function bindContextTrigger(root, { selector, open, noTouch = '' }) {
  let lp = null; // przytrzymanie: { el, x, y, id, timer, fired }
  let suppressUntil = 0;
  let kbUntil = 0;
  const skip = (t) => !!t.closest?.('input, select, textarea, [contenteditable="true"]');
  const target = (t) => { const el = t.closest?.(selector); return el && root.contains(el) ? el : null; };
  const cancel = () => { if (lp) clearTimeout(lp.timer); lp = null; };
  const fire = () => {
    if (!lp || lp.fired) return;
    lp.fired = true;
    clearTimeout(lp.timer);
    suppressUntil = performance.now() + 800;
    open(lp.el, { x: lp.x, y: lp.y, keyboard: false, touch: true });
  };

  root.addEventListener('contextmenu', (ev) => {
    if (lp) { ev.preventDefault(); fire(); return; } // Android: przytrzymanie wysyła też contextmenu
    if (performance.now() < suppressUntil || performance.now() < kbUntil) { if (target(ev.target)) ev.preventDefault(); return; }
    if (skip(ev.target)) return;
    const el = target(ev.target);
    if (!el) return;
    const kb = ev.button !== 2 && ev.clientX === 0 && ev.clientY === 0;
    const r = el.getBoundingClientRect();
    const at = kb ? { x: r.left + Math.min(24, r.width / 2), y: r.bottom - 4, keyboard: true } : { x: ev.clientX, y: ev.clientY, keyboard: false };
    if (open(el, at)) ev.preventDefault();
  });

  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ContextMenu' && !(ev.key === 'F10' && ev.shiftKey)) return;
    if (skip(ev.target)) return;
    const el = target(ev.target);
    if (!el) return;
    const r = (ev.target.closest('button, [tabindex]') ?? el).getBoundingClientRect();
    if (open(el, { x: r.left + Math.min(24, r.width / 2), y: r.bottom - 4, keyboard: true })) {
      ev.preventDefault();
      kbUntil = performance.now() + 400; // przeglądarka może jeszcze wysłać contextmenu
    }
  });

  root.addEventListener('pointerdown', (ev) => {
    cancel();
    kbUntil = 0; // nowe wskazanie: kolejne contextmenu pochodzi już od myszy albo palca
    if (ev.pointerType !== 'touch') suppressUntil = 0;
    if (ev.pointerType !== 'touch' || !ev.isPrimary) return;
    if (skip(ev.target) || (noTouch && ev.target.closest(noTouch))) return;
    const el = target(ev.target);
    if (!el) return;
    lp = { el, x: ev.clientX, y: ev.clientY, id: ev.pointerId, fired: false, timer: setTimeout(fire, LONG_PRESS_MS) };
  });
  window.addEventListener('pointermove', (ev) => {
    if (lp && !lp.fired && ev.pointerId === lp.id && Math.hypot(ev.clientX - lp.x, ev.clientY - lp.y) > MOVE_TOLERANCE) cancel();
  }, { passive: true });
  const end = (ev) => { if (lp && ev.pointerId === lp.id) { if (!lp.fired) cancel(); else lp = null; } };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', (ev) => { if (lp && ev.pointerId === lp.id && !lp.fired) cancel(); });
  // Puszczenie palca po otwarciu menu nie może „kliknąć” wiersza pod spodem.
  root.addEventListener('touchend', (ev) => { if (performance.now() < suppressUntil) ev.preventDefault(); }, { passive: false });
  document.addEventListener('click', (ev) => {
    if (performance.now() < suppressUntil && !ev.target.closest?.('.cmenu')) { ev.preventDefault(); ev.stopPropagation(); suppressUntil = 0; }
  }, true);
}
