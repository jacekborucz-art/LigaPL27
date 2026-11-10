// Przeciąganie zawodników na ekranie składu (Pointer Events: mysz, pióro i dotyk).
// Mysz i pióro: chwyt w dowolnym miejscu wiersza albo slotu, start po 6 px ruchu (klik nadal działa).
// Dotyk: chwyt tylko za uchwyt wiersza albo slot na boisku (touch-action: none), więc przewijanie
// listy palcem działa jak zwykle. Reguły ruchów: tacticsMoves.js (resolve), zapis: onDrop w app.js.
import { parseLoc, sameLoc } from './tacticsMoves.js';
import { esc } from './dom.js';

const THRESHOLD = 6;
const EDGE = 64; // strefa autoprzewijania przy krawędzi ekranu (px)

/**
 * root: element, w którym renderuje się ekran (zdarzenia są delegowane, DOM może się zmieniać).
 * resolve(src, dst) -> { ok, reason }; onDrop(src, dst) wykonuje ruch; onReject(reason) pokazuje powód.
 */
export function mountTacticsDrag(root, { resolve, onDrop, onReject }) {
  let pending = null;
  let drag = null;
  let suppressClickUntil = 0;
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  root.addEventListener('pointerdown', (ev) => {
    if (drag || !ev.isPrimary) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    const el = ev.target.closest('[data-drag]');
    if (!el || !el.closest('.tac')) return;
    // Na dotyku przeciągamy tylko za uchwyt (albo slot boiska), żeby nie blokować przewijania.
    if (ev.pointerType === 'touch' && !ev.target.closest('[data-handle]')) return;
    const src = parseLoc(el.dataset.drag);
    if (!src) return;
    pending = { el, src, x: ev.clientX, y: ev.clientY, id: ev.pointerId, type: ev.pointerType };
  });

  window.addEventListener('pointermove', (ev) => {
    if (pending && !drag && ev.pointerId === pending.id) {
      if (Math.hypot(ev.clientX - pending.x, ev.clientY - pending.y) < THRESHOLD) return;
      start(ev);
    }
    if (drag && ev.pointerId === drag.id) {
      ev.preventDefault();
      drag.x = ev.clientX; drag.y = ev.clientY;
      place(); hover();
    }
  }, { passive: false });

  window.addEventListener('pointerup', (ev) => {
    if (drag && ev.pointerId === drag.id) finish(true);
    pending = null;
  });
  window.addEventListener('pointercancel', (ev) => {
    if (drag && ev.pointerId === drag.id) finish(false);
    pending = null;
  });
  window.addEventListener('keydown', (ev) => {
    if (drag && ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
  }, true);
  // Po upuszczeniu przeglądarka może wysłać „click”; nie traktujemy go jak dotknięcia.
  root.addEventListener('click', (ev) => {
    if (performance.now() < suppressClickUntil) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);
  root.addEventListener('contextmenu', (ev) => { if (drag) ev.preventDefault(); });

  function start(ev) {
    const { el, src, type } = pending;
    pending = null;
    const ghost = document.createElement('div');
    ghost.className = `tdrag${reduced() ? '' : ' tdrag--anim'}`;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = `<span class="pos" data-g="${esc(el.dataset.gg)}">${esc(el.dataset.gpos)}</span><span class="tdrag__name">${esc(el.dataset.gname)}</span><small class="tdrag__why"></small>`;
    document.body.appendChild(ghost);
    drag = { el, src, ghost, id: ev.pointerId, type, x: ev.clientX, y: ev.clientY, y0: ev.clientY, over: null, raf: 0 };
    window.getSelection?.()?.removeAllRanges();
    document.body.classList.add('is-tdragging');
    const tac = el.closest('.tac');
    tac?.classList.add('is-dragging');
    // Oznaczenie miejsc, na które da się upuścić (niedozwolone są przygaszone).
    for (const t of tac?.querySelectorAll('[data-drop]') ?? []) {
      const dst = parseLoc(t.dataset.drop);
      if (sameLoc(dst, src)) { t.classList.add('is-src'); continue; }
      t.classList.add(resolve(src, dst).ok ? 'is-cand' : 'is-nodrop');
    }
    place(); hover();
    drag.raf = requestAnimationFrame(autoscroll);
  }

  function place() {
    // Na dotyku duch jest nad palcem, żeby go nie zasłaniał; zawsze mieści się w oknie.
    const g = drag.ghost;
    const w = g.offsetWidth; const h = g.offsetHeight;
    const touch = drag.type === 'touch';
    let x = touch ? drag.x - w / 2 : drag.x + 14;
    let y = touch ? drag.y - h - 36 : drag.y + 14;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
    g.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  function targetAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    const t = hit?.closest('[data-drop]');
    return t && t.closest('.tac') ? t : null;
  }

  function hover() {
    const t = targetAt(drag.x, drag.y);
    if (drag.over && drag.over !== t) drag.over.classList.remove('is-over', 'is-bad');
    drag.over = t;
    const why = drag.ghost.querySelector('.tdrag__why');
    drag.ghost.classList.remove('is-bad', 'is-ok');
    why.textContent = '';
    if (!t) return;
    const dst = parseLoc(t.dataset.drop);
    if (sameLoc(dst, drag.src)) return;
    const r = resolve(drag.src, dst);
    t.classList.add('is-over');
    t.classList.toggle('is-bad', !r.ok);
    drag.ghost.classList.add(r.ok ? 'is-ok' : 'is-bad');
    if (!r.ok && r.reason) why.textContent = r.reason;
  }

  function bottomLimit() {
    // Na telefonie dół ekranu zasłania pasek nawigacji i przycisk „Dalej”.
    let lim = window.innerHeight;
    for (const el of document.querySelectorAll('.nav, .go-wrap')) {
      if (getComputedStyle(el).position !== 'fixed') continue;
      const top = el.getBoundingClientRect().top;
      if (top > 0) lim = Math.min(lim, top);
    }
    return lim;
  }

  function autoscroll() {
    if (!drag) return;
    const lim = bottomLimit();
    let v = 0;
    // Przewijamy dopiero, gdy palec albo kursor wyraźnie zmierza ku krawędzi (nie od samego chwytu przy dole ekranu).
    if (drag.y < EDGE && drag.y < drag.y0 - 16) v = -Math.ceil((EDGE - drag.y) / 4);
    else if (drag.y > lim - EDGE && drag.y > drag.y0 + 16) v = Math.ceil((drag.y - (lim - EDGE)) / 4);
    if (v) {
      window.scrollBy(0, Math.max(-24, Math.min(24, v)));
      hover();
    }
    drag.raf = requestAnimationFrame(autoscroll);
  }

  function finish(commit) {
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    d.ghost.remove();
    document.body.classList.remove('is-tdragging');
    const tac = d.el.closest('.tac') ?? root.querySelector('.tac');
    tac?.classList.remove('is-dragging');
    for (const t of root.querySelectorAll('.is-cand, .is-nodrop, .is-src, .is-over')) t.classList.remove('is-cand', 'is-nodrop', 'is-src', 'is-over', 'is-bad');
    suppressClickUntil = performance.now() + 150;
    if (!commit || !d.over) return;
    const dst = parseLoc(d.over.dataset.drop);
    if (sameLoc(dst, d.src)) return;
    const r = resolve(d.src, dst);
    if (r.ok) onDrop(d.src, dst);
    else if (r.reason) onReject?.(r.reason);
  }
}
