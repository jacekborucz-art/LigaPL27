// Strzałki ruchu na ekranie składu (docs/strzalki-ruchu.md): na PC przytrzymanie PRAWEGO przycisku myszy na zawodniku
// i przeciągnięcie rysuje strzałkę przyciąganą do 8 kierunków (bez osobnego trybu; samo kliknięcie prawym otwiera menu
// zawodnika, a w nim „Ruch w ataku”, także na telefonie). Kierunek względny do strony zawodnika (snapDir
// w arrowsView.js); niedozwolony na pozycji: komunikat zamiast zmiany.
import { snapDir, arrowVec, arrowKind } from './arrowsView.js';
import { arrowLabel } from '../data/playerInstructions.js';

const THRESHOLD = 14;

/** root: element ekranu (delegacja zdarzeń). onSet(pid, dir) zapisuje kierunek, onReject(tekst) pokazuje powód. */
export function mountArrowDraw(root, { onSet, onReject }) {
  let pending = null;
  let draw = null;
  let suppressUntil = 0;

  root.addEventListener('pointerdown', (ev) => {
    if (draw || !ev.isPrimary || ev.pointerType === 'touch') return;
    // Prawy przycisk na zawodniku (zawsze) albo lewy w dawnym trybie strzałek
    const el = ev.button === 2 ? ev.target.closest('.tac .pitch2 .slot-btn[data-pid][data-dirs]')
      : ev.button === 0 ? ev.target.closest('.tac.is-arrows .slot-btn[data-act="tarrow-pick"][data-pid]') : null;
    if (!el || !el.dataset.dirs) return;
    pending = { el, x: ev.clientX, y: ev.clientY, id: ev.pointerId };
  });

  window.addEventListener('pointermove', (ev) => {
    if (!pending || ev.pointerId !== pending.id) return;
    if (!draw) {
      if (Math.hypot(ev.clientX - pending.x, ev.clientY - pending.y) < THRESHOLD) return;
      const pitch = pending.el.closest('.pitch2');
      const svg = pitch?.querySelector('svg.pa');
      if (!svg) { pending = null; return; }
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.appendChild(path);
      draw = { ...pending, pitch, svg, path, dir: null };
      pitch.classList.add('is-drawing');
    }
    ev.preventDefault();
    const { el, pitch, path } = draw;
    const r = pitch.getBoundingClientRect();
    const b = el.querySelector('.slot-btn__dot')?.getBoundingClientRect() ?? el.getBoundingClientRect();
    const cx = b.left + b.width / 2; const cy = b.top + b.height / 2;
    const sx = Number(el.dataset.sx); const sy = Number(el.dataset.sy);
    const dir = snapDir(ev.clientX - cx, ev.clientY - cy, sx);
    const ok = !!dir && el.dataset.dirs.split(' ').includes(dir);
    draw.dir = ok ? dir : null;
    // Podgląd: strzałka przyciągnięta do kierunku (dozwolony) albo linia do kursora (niedozwolony)
    const vb = (px, py) => `${((px - r.left) / r.width * 68).toFixed(2)} ${((py - r.top) / r.height * 100).toFixed(2)}`;
    let end;
    if (ok) { const v = arrowVec(dir, sx); end = `${((sx + v.dx) * 0.68).toFixed(2)} ${(100 - sy - v.dy).toFixed(2)}`; }
    else end = vb(ev.clientX, ev.clientY);
    path.setAttribute('d', `M${vb(cx, cy)}L${end}`);
    path.setAttribute('class', `pa__l pa__l--${ok ? arrowKind(dir) : 'bad'} pa__l--preview`);
    if (ok) path.setAttribute('marker-end', `url(#tpa-${arrowKind(dir)})`); else path.removeAttribute('marker-end');
    pitch.dataset.drawHint = ok ? arrowLabel(dir) : 'Ten kierunek nie pasuje do pozycji';
  }, { passive: false });

  const end = (commit) => {
    const d = draw;
    draw = null; pending = null;
    if (!d) return;
    d.path.remove();
    d.pitch.classList.remove('is-drawing');
    delete d.pitch.dataset.drawHint;
    suppressUntil = performance.now() + 200;
    if (!commit) return;
    if (d.dir) onSet(d.el.dataset.pid, d.dir);
    else onReject('Ten kierunek nie pasuje do pozycji zawodnika. Dozwolone kierunki: menu zawodnika (prawy przycisk), „Ruch w ataku”.');
  };
  // Po narysowaniu prawym przyciskiem przeglądarka wysyła „contextmenu”: nie otwieramy wtedy menu zawodnika
  root.addEventListener('contextmenu', (ev) => {
    if ((draw || performance.now() < suppressUntil) && ev.target.closest('.slot-btn')) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('pointerup', (ev) => { if (pending && ev.pointerId === pending.id) end(true); });
  window.addEventListener('pointercancel', (ev) => { if (pending && ev.pointerId === pending.id) end(false); });
  window.addEventListener('keydown', (ev) => { if (draw && ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(false); } }, true);
  // Po narysowaniu przeglądarka wysyła „click”: nie otwieramy wtedy kompasu
  root.addEventListener('click', (ev) => { if (performance.now() < suppressUntil && ev.target.closest('.slot-btn')) { ev.preventDefault(); ev.stopPropagation(); } }, true);
}
