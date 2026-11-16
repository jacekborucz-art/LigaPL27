// Pulpit: układ „murowany” od 640 px. Siatka ma wiersze po 4 px (grid-auto-rows w dashboard.css), każdy panel
// zajmuje tyle wierszy, ile ma wysokości, a grid-auto-flow: dense dosuwa panele w kolumnie do góry, bez pustych pól.
// Na telefonie (jedna kolumna) działa zwykła siatka z grid-template-areas i spany są czyszczone.

const UNIT = 4; // px, musi zgadzać się z grid-auto-rows w dashboard.css

export function mountDashMasonry(root) {
  const grid = root.querySelector('.dash__grid');
  if (!grid || typeof ResizeObserver === 'undefined') return;
  const apply = () => {
    const cs = getComputedStyle(grid);
    const on = cs.gridAutoRows === `${UNIT}px`;
    const gap = parseFloat(cs.getPropertyValue('--dash-gap')) || 16;
    for (const el of grid.children) {
      el.style.gridRowEnd = on ? `span ${Math.max(1, Math.ceil((el.getBoundingClientRect().height + gap) / UNIT))}` : '';
    }
  };
  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
  const ro = new ResizeObserver(schedule);
  ro.observe(grid);
  for (const el of grid.children) ro.observe(el);
  apply();
}
