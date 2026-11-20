// Odznaki trenera (20 sztuk): grafika SVG inline, opisy i dostępność. Moduł bez zależności od stanu gry.
// Zasada graficzna: szczebel to metal, rodzaj rozgrywek to kształt.
// Siatka viewBox 64x64, obrys #10190F, gradienty metalu w jednym ukrytym sprite (badgeSprite), wstawianym raz do dokumentu.
// Zablokowana odznaka to ta sama grafika w szarości (CSS .is-lock), więc jest jedna definicja na wszystkie stany.

const OL = 'stroke="#10190F" stroke-opacity=".8" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';
const OT = 'stroke="#10190F" stroke-opacity=".55" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"';
const G = (n) => `url(#${n})`;
const star = (cx, cy, R, r, n = 5) => {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2);
  }
  return d + 'Z';
};
const handle = (d, m, w1 = 5.4, w2 = 2.6) =>
  `<path d="${d}" fill="none" stroke="#10190F" stroke-opacity=".8" stroke-width="${w1}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${G(m)}" stroke-width="${w2}" stroke-linecap="round"/>`;
const gloss = (d, w = 2.2, o = .42) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="${o}" stroke-width="${w}" stroke-linecap="round"/>`;
const label = (t, x, y, size, fill, fam = "Barlow Condensed", wt = 700) =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-family="'${fam}',sans-serif" font-weight="${wt}" font-size="${size}" fill="${fill}">${t}</text>`;

/* Rodzina pucharów ligowych: ten sam kształt, metal i znak na czaszy oznaczają szczebel */
const leagueCup = (m, mark, base = 'gIron') => `
  <path d="M19 56h26v-6H19z" fill="${G(base)}" ${OL}/>
  <path d="M27 50l1.4-10h7.2l1.4 10z" fill="${G(m)}" ${OL}/>
  ${handle('M18 11c-10-1-11 15 3 19', m)}${handle('M46 11c10-1 11 15-3 19', m)}
  <path d="M16 9h32c0 15-5 28-16 31C21 37 16 24 16 9z" fill="${G(m)}" ${OL}/>
  ${gloss('M20.5 12c0 11 3 19 7.5 23')}${mark}`;
const ball = `<circle cx="32" cy="22.5" r="7" fill="#F3F6F1" ${OT}/><path d="M32 18.2l3.5 2.5-1.3 4h-4.4l-1.3-4z" fill="#14211A"/><path d="M32 18.2V15.8M35.5 20.7l2.3-.8M34.2 24.7l1.4 2M29.8 24.7l-1.4 2M28.5 20.7l-2.3-.8" stroke="#14211A" stroke-width="1" fill="none"/>`;
const plate = (m, ring, dots) => `
  <path d="M20 57h24v-6H20z" fill="${G('gIron')}" ${OL}/>
  <path d="M29 52v-8h6v8z" fill="${G(m)}" ${OL}/>
  <circle cx="32" cy="26" r="21" fill="${G(m)}" ${OL}/>
  <circle cx="32" cy="26" r="15" fill="${ring}" ${OT}/>
  ${dots}
  <circle cx="32" cy="26" r="9.4" fill="#F3F6F1" ${OT}/>
  <path d="${star(32, 26.4, 6.4, 2.7)}" fill="${G('gGold')}" ${OT}/>
  ${gloss('M15 20c3-8 9-12 16-12', 2.6, .5)}`;
const ringDots = Array.from({ length: 8 }, (_, i) => {
  const a = i * Math.PI / 4 + Math.PI / 8; return `<circle cx="${(32 + 12.2 * Math.cos(a)).toFixed(1)}" cy="${(26 + 12.2 * Math.sin(a)).toFixed(1)}" r="1.25" fill="#F3F6F1"/>`;
}).join('');
const board = (m, n) => `
  <rect x="13" y="43" width="6" height="10" fill="${G(m)}" ${OL}/><rect x="45" y="43" width="6" height="10" fill="${G(m)}" ${OL}/>
  <rect x="8" y="52" width="48" height="6" rx="2.5" fill="${G(m)}" ${OL}/>
  <rect x="4" y="7" width="56" height="39" rx="7" fill="${G(m)}" ${OL}/>
  <rect x="9" y="12" width="46" height="29" rx="3.5" fill="#0E1511" ${OT}/>
  ${label(n, 32, 31, 21, '#FFB21A', 'Doto', 800)}${label('meczów', 32, 38.6, 7, '#FFB21A')}
  ${gloss('M9 10c8-2 22-2 30-1', 1.6, .5)}`;
const whistle = (c) => `
  <rect x="30" y="30" width="24" height="10" rx="3" fill="${G(c)}" ${OL}/>
  <path d="M40 30v-0.2" stroke="none"/><rect x="38" y="33.2" width="8" height="2.6" rx="1.3" fill="#10190F" fill-opacity=".8"/>
  <circle cx="27" cy="40" r="11" fill="${G(c)}" ${OL}/><circle cx="27" cy="40" r="4" fill="#10190F" fill-opacity=".8"/>
  <path d="M17.5 31.5c-4-3-2-8 2.5-7.5" fill="none" stroke="${G(c)}" stroke-width="2.2" stroke-linecap="round"/>
  ${gloss('M19 38c1-4 4-7 8-7.4', 1.8, .55)}`;
const leaves = (() => {
  let s = '';
  for (let i = 0; i < 7; i++) {
    const th = 200 + i * 20;
    [th, 360 - th].forEach((t) => {
      const x = 32 + 24.5 * Math.sin(t * Math.PI / 180), y = 32 - 24.5 * Math.cos(t * Math.PI / 180);
      const rot = t < 180 ? t + 90 - 25 : t + 90 + 25;
      s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="2.8" ry="5.6" transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${G('gGold')}" ${OT}/>`;
    });
  }
  return s;
})();

export const BADGES = {
  mp_ekstraklasa: { name: 'Mistrzostwo Polski', group: 'mist', metal: 'złoto', how: 'Wygraj Ekstraklasę.',
    svg: leagueCup('gGold', ball, 'gDeep') },
  mp_1liga: { name: 'Mistrz 1 Ligi', group: 'mist', metal: 'srebro', how: 'Wygraj 1 Ligę.',
    svg: leagueCup('gSilver', label('1', 32, 29, 22, '#14211A')) },
  mp_2liga: { name: 'Mistrz 2 Ligi', group: 'mist', metal: 'brąz', how: 'Wygraj 2 Ligę.',
    svg: leagueCup('gBronze', label('2', 32, 29, 22, '#14211A')) },
  mp_3liga: { name: 'Mistrz III ligi', group: 'mist', metal: 'brąz (tarcza)', how: 'Wygraj swoją grupę III ligi.',
    svg: `<path d="M32 4l23 7v18c0 15-10 25-23 31C19 54 9 44 9 29V11z" fill="${G('gBronze')}" ${OL}/>
      <path d="M32 10.5l17 5.3v13c0 11-7.5 19-17 23.7C22.5 47.800 15 40 15 28.800v-13z" fill="${G('gDeep')}" ${OT}/>
      <circle cx="13" cy="15" r="1.4" fill="#10190F" fill-opacity=".6"/><circle cx="51" cy="15" r="1.4" fill="#10190F" fill-opacity=".6"/>
      ${label('III', 32, 36, 24, '#F3F6F1')}
      <path d="M22 41h20" stroke="#F3F6F1" stroke-opacity=".55" stroke-width="1.2"/>
      ${gloss('M13 14c0 10 2 17 7 24', 2.2, .4)}` },
  puchar_polski: { name: 'Puchar Polski', group: 'kraj', metal: 'złoto', how: 'Wygraj Puchar Polski.',
    svg: `
      <path d="M20 57h24v-6H20z" fill="${G('gIron')}" ${OL}/>
      <path d="M28 51l1-7.500h6l1 7.500z" fill="${G('gGold')}" ${OL}/>
      ${handle('M15 24c-8-1-8 10 0 11', 'gGold', 5, 2.4)}${handle('M49 24c8-1 8 10 0 11', 'gGold', 5, 2.4)}
      <path d="M13 22h38c0 11-7 20-19 22C20 42 13 33 13 22z" fill="${G('gGold')}" ${OL}/>
      <g clip-path="url(#cpPP)"><rect x="10" y="26.500" width="44" height="4.500" fill="#F3F6F1"/><rect x="10" y="31" width="44" height="5" fill="#D62839"/></g>
      <path d="M19 22c0-8 5-12 13-12s13 4 13 12z" fill="${G('gGold')}" ${OL}/>
      <circle cx="32" cy="8" r="3" fill="${G('gGold')}" ${OL}/>
      ${gloss('M23 20c1-4 4-6.500 8-7', 2, .5)}` },
  superpuchar_polski: { name: 'Superpuchar Polski', group: 'kraj', metal: 'srebro', how: 'Wygraj Superpuchar Polski.',
    svg: plate('gSilver', '#D62839', '') },
  liga_mistrzow: { name: 'Liga Mistrzów', group: 'eu', metal: 'złoto', how: 'Wygraj Ligę Mistrzów.',
    svg: `<path d="M18 56h28l-3-9H21z" fill="${G('gBlue')}" ${OL}/>
      <path d="M28.500 47l1-8h5l1 8z" fill="${G('gGold')}" ${OL}/>
      ${handle('M26 13C5 5 3 41 28 38', 'gGold', 6.6, 3.6)}${handle('M38 13C59 5 61 41 36 38', 'gGold', 6.6, 3.6)}
      <path d="M24 9h16c.5 10 2 15 4 19 1.5 3 0 7-4 9l-2.500 3h-11L24 37c-4-2-5.500-6-4-9 2-4 3.500-9 4-19z" fill="${G('gGold')}" ${OL}/>
      <path d="${star(32, 22, 5.500, 2.300)}" fill="#14211A" fill-opacity=".8"/>
      ${gloss('M26.500 12c.5 8 2 13 3.500 17', 2, .5)}` },
  liga_europy: { name: 'Liga Europy', group: 'eu', metal: 'złoto', how: 'Wygraj Ligę Europy.',
    svg: `<path d="M20 57h24l-2.500-7H22.500z" fill="${G('gOrange')}" ${OL}/>
      <path d="M29.500 50l.8-9h3.400l.8 9z" fill="${G('gGold')}" ${OL}/>
      ${handle('M25.500 19c-10 0-10 14 2 17', 'gGold', 4.6, 2.2)}${handle('M38.500 19c10 0 10 14-2 17', 'gGold', 4.6, 2.2)}
      <path d="M24 17c0-6.500 3-9.500 8-9.500s8 3 8 9.500c0 10-3 19-8 24-5-5-8-14-8-24z" fill="${G('gGold')}" ${OL}/>
      <circle cx="32" cy="5.500" r="2.800" fill="${G('gGold')}" ${OL}/>
      <path d="M32 20.500l4.200 5.300-4.200 5.300-4.200-5.300z" fill="${G('gOrange')}" ${OT}/>
      ${gloss('M27 14c0 7 1.500 13 4 18', 1.8, .5)}` },
  liga_konferencji: { name: 'Liga Konferencji', group: 'eu', metal: 'złoto', how: 'Wygraj Ligę Konferencji.',
    svg: `<path d="M17 57h30l-3.500-7h-23z" fill="${G('gGreen')}" ${OL}/>
      <path d="M29 50l1-9h4l1 9z" fill="${G('gGold')}" ${OL}/>
      <path d="M10 18h44c0 13-9 23-22 23S10 31 10 18z" fill="${G('gGold')}" ${OL}/>
      <rect x="8.500" y="14.500" width="47" height="5" rx="2.500" fill="${G('gGold')}" ${OL}/>
      <path d="M32 36c-7-1-10-5.500-10-10 7 0 10 3.500 10 10z" fill="#1E6B3A" ${OT}/><path d="M32 36c7-1 10-5.500 10-10-7 0-10 3.500-10 10z" fill="#2E8A4E" ${OT}/>
      ${gloss('M14 23c2 7 7 12 13 14', 2.2, .5)}` },
  superpuchar_europy: { name: 'Superpuchar Europy', group: 'eu', metal: 'złoto', how: 'Wygraj Superpuchar Europy.',
    svg: plate('gGold', '#1F4E79', ringDots) },
  awans: { name: 'Awans', group: 'sez', metal: 'zieleń', how: 'Awansuj o ligę wyżej.',
    svg: `<path d="M32 3l24 13.500v27L32 61 8 43.500v-27z" fill="${G('gGreen')}" ${OL}/>
      <path d="M32 9l19 10.700v22.500L32 55 13 42.200V19.700z" fill="none" stroke="#F3F6F1" stroke-opacity=".55" stroke-width="1.2"/>
      <path d="M21 20h22" stroke="#FFB21A" stroke-width="3.200" stroke-linecap="round"/>
      <path d="M20 37l12-11 12 11" fill="none" stroke="#F3F6F1" stroke-width="4.600" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M20 47l12-11 12 11" fill="none" stroke="#FFB21A" stroke-width="4.600" stroke-linecap="round" stroke-linejoin="round"/>` },
  utrzymanie_beniaminek: { name: 'Utrzymanie beniaminka', group: 'sez', metal: 'brąz', how: 'Utrzymaj się jako beniaminek lub zespół z dołu rankingu.',
    svg: `<path d="M21 42l-6 17 8-3.500 3.500 6.500 4-19z" fill="${G('gGreen')}" ${OL}/><path d="M43 42l6 17-8-3.500-3.500 6.500-4-19z" fill="${G('gGreen')}" ${OL}/>
      <circle cx="32" cy="28" r="23" fill="${G('gBronze')}" ${OL}/>
      <circle cx="32" cy="28" r="18" fill="${G('gDeep')}" ${OT}/>
      <g fill="none" stroke="#F3F6F1" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="32" cy="15.500" r="3"/><path d="M32 18.500V40M25.500 23.500h13"/><path d="M20.500 32c1 7.500 6.500 10 11.500 10s10.500-2.500 11.500-10"/><path d="M17.500 34l3-3.500 3.500 3M40 34l3.500-3.500 3 3.500"/>
      </g>${gloss('M14 21c2-5 6-8.500 11-10', 2, .45)}` },
  cel_ponad_plan: { name: 'Cel ponad plan', group: 'sez', metal: 'złoto', how: 'Zakończ sezon wyżej, niż zakładał cel zarządu.',
    svg: `<path d="M21 42l-6 17 8-3.500 3.500 6.500 4-19z" fill="${G('gRed')}" ${OL}/><path d="M43 42l6 17-8-3.500-3.500 6.500-4-19z" fill="${G('gRed')}" ${OL}/>
      <circle cx="32" cy="28" r="23" fill="${G('gGold')}" ${OL}/>
      <circle cx="32" cy="28" r="17.500" fill="#F3F6F1" ${OT}/><circle cx="32" cy="28" r="12.500" fill="#D62839" ${OT}/><circle cx="32" cy="28" r="7.500" fill="#F3F6F1" ${OT}/><circle cx="32" cy="28" r="3" fill="#D62839"/>
      <path d="M32 28L55 5" stroke="#10190F" stroke-width="3.600" stroke-linecap="round"/><path d="M32 28L55 5" stroke="#E8EEE9" stroke-width="1.600" stroke-linecap="round"/>
      <path d="M52 3.500l8.500-.5-.5 8.500-3-3zM47.500 8l-1 6.500 4.500-1" fill="#D62839" ${OT}/>` },
  mecze_100: { name: '100 meczów', group: 'mile', metal: 'brąz', how: 'Poprowadź drużynę w 100 meczach.', svg: board('gBronze', '100') },
  mecze_250: { name: '250 meczów', group: 'mile', metal: 'srebro', how: 'Poprowadź drużynę w 250 meczach.', svg: board('gSilver', '250') },
  mecze_500: { name: '500 meczów', group: 'mile', metal: 'złoto', how: 'Poprowadź drużynę w 500 meczach.', svg: board('gGold', '500') },
  seria_bez_porazki: { name: 'Seria bez porażki', group: 'mile', metal: 'płomień', how: 'Przejdź 10 meczów z rzędu bez porażki.',
    svg: `<circle cx="32" cy="32" r="28" fill="${G('gIron')}" ${OL}/><circle cx="32" cy="32" r="23.500" fill="none" stroke="#3FA463" stroke-width="2.600"/>
      <path d="M32 7c2.500 10 13 14 13 27 0 10-6 18-13 18s-13-7-13-16c0-6 4-10 6-14 1 5 4 6 6 5-1-7-2-13 1-20z" fill="${G('gFlame')}" ${OL}/>
      <path d="M32 29c1.500 5 7 7 7 13 0 5-3 8-7 8s-7-3-7-8c0-3 2-5 3-7 1 2.500 3 3 4 2z" fill="#FFE27A"/>` },
  sensacja: { name: 'Sensacja', group: 'mile', metal: 'srebro i błyskawica', how: 'Wygraj z rywalem o wiele silniejszym w składzie.',
    svg: `<path d="M32 4l23 7v18c0 15-10 25-23 31C19 54 9 44 9 29V11z" fill="${G('gSilver')}" ${OL}/>
      <path d="M32 10l17 5.200v13.500c0 11-7 19-17 24-10-5-17-13-17-24V15.200z" fill="${G('gSlate')}" ${OT}/>
      <path d="M14.500 24l7 3.500-3.500 4.500 5.500 2.500M49.500 22l-6.500 4 3.500 4-5 3" fill="none" stroke="#10190F" stroke-opacity=".7" stroke-width="1.400" stroke-linejoin="round"/>
      <path d="M37.500 4L19 34h11.500l-4 24 20-31H34.500z" fill="${G('gGold')}" ${OL}/>` },
  trener_miesiaca: { name: 'Trener miesiąca', group: 'mile', metal: 'srebro', how: 'Zostań trenerem miesiąca w swojej lidze.',
    svg: `<rect x="19" y="3" width="5" height="11" rx="2.500" fill="${G('gIron')}" ${OL}/><rect x="40" y="3" width="5" height="11" rx="2.500" fill="${G('gIron')}" ${OL}/>
      <rect x="6" y="8" width="52" height="52" rx="8" fill="${G('gSilver')}" ${OL}/>
      <rect x="10.500" y="21" width="43" height="34" rx="3.500" fill="${G('gDeep')}" ${OT}/>
      ${label('mies.', 32, 18.200, 8.5, '#14211A')}
      <g transform="translate(1,3)">${whistle('gGold')}</g>` },
  trener_sezonu: { name: 'Trener sezonu', group: 'mile', metal: 'złoto', how: 'Zostań trenerem sezonu w swojej lidze.',
    svg: `${leaves}<circle cx="32" cy="32" r="21" fill="${G('gGold')}" ${OL}/><circle cx="32" cy="32" r="17" fill="${G('gDeep')}" ${OT}/>
      <g transform="translate(-3.500,-8) scale(1)"><g transform="translate(3.200,5.500) scale(.88)">${whistle('gGold')}</g></g>
      <path d="${star(32, 5.600, 3.800, 1.600)}" fill="${G('gGold')}" ${OT}/>` },
};

export const BADGE_IDS = Object.keys(BADGES);

/** Grupy półek w gablocie (id grupy, nazwa). */
export const BADGE_GROUPS = [
  ['mist', 'Mistrzostwa'], ['kraj', 'Puchary krajowe'], ['eu', 'Europa'], ['sez', 'Wyniki sezonu'], ['mile', 'Kamienie milowe'],
];

/** „1 raz”, „2 razy”, „5 razy”, „22 razy”. */
export const times = (n) => (n === 1 ? '1 raz' : `${n} razy`);

const GRADIENTS = [
  ['gGold', ['#FFE98F', '#F5B820', '#A66E05'], [0, 0.45, 1]],
  ['gSilver', ['#F7FAF8', '#BFC8C3', '#76837C'], [0, 0.5, 1]],
  ['gBronze', ['#EDB27C', '#B8702F', '#683A14'], [0, 0.5, 1]],
  ['gIron', ['#4A5C51', '#17251D']],
  ['gGreen', ['#3FA463', '#1A5A31']],
  ['gDeep', ['#25793F', '#103D22']],
  ['gBlue', ['#3C79B0', '#173E66']],
  ['gOrange', ['#FF9A3D', '#B84D0A']],
  ['gRed', ['#F0505F', '#9A1626']],
  ['gFlame', ['#FFB21A', '#F26B1D', '#D62839'], [0, 0.55, 1]],
  ['gSlate', ['#5B7384', '#26363F']],
];

/**
 * Gradienty metalu i maska Pucharu Polski w jednym ukrytym SVG. Identyfikatory są globalne,
 * więc sprite musi być w dokumencie zawsze (także poza widokiem Kariery). Wstawia się go raz.
 */
export function badgeSprite() {
  const grad = ([id, cols, offs]) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${cols.map((c, i) => `<stop offset="${offs ? offs[i] : i / (cols.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  return `<svg class="badge-sprite" id="badgeSprite" aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${GRADIENTS.map(grad).join('')}<clipPath id="cpPP"><path d="M13 22h38c0 11-7 20-19 22C20 42 13 33 13 22z"/></clipPath></defs></svg>`;
}

/** Wstawia sprite do dokumentu, jeśli go jeszcze nie ma (przeglądarka). */
export function ensureBadgeSprite(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || doc.getElementById('badgeSprite')) return;
  doc.body.insertAdjacentHTML('afterbegin', badgeSprite());
}

const LOCK_ICON = '<span class="bdgv__lock" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>';

/**
 * Etykieta dla czytników ekranu. state: { count, last: { season, clubName } } albo null/undefined (zablokowana).
 * Przykłady: „Awans, zdobyte 3 razy, ostatnio w sezonie 2023/24”, „Liga Mistrzów, jeszcze nie zdobyte. Wygraj Ligę Mistrzów.”
 */
export function badgeAria(id, state) {
  const b = BADGES[id];
  if (!b) return '';
  const n = state?.count ?? 0;
  if (!n) return `${b.name}, jeszcze nie zdobyte. ${b.how}`;
  const season = state.last?.season;
  return `${b.name}, zdobyte ${times(n)}${season ? `, ostatnio w sezonie ${season}` : ''}`;
}

const attr = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/**
 * Odznaka jako znacznik HTML. Opcje: size (px; bez niej rozmiar daje CSS przez --bs, domyślnie 64), locked (szara sylwetka z kłódką),
 * count (plakietka ×N od 2), decorative (aria-hidden, gdy etykieta jest na przycisku obok), state (do etykiety), label (własna etykieta).
 */
export function badgeSvg(id, { size = null, locked = false, count = 0, decorative = false, state = null, label = null } = {}) {
  const b = BADGES[id];
  if (!b) return '';
  const svg = `<svg class="bsvg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${b.svg}</svg>`;
  const text = label ?? badgeAria(id, state ?? (locked ? null : { count: Math.max(1, count) }));
  const aria = decorative ? 'aria-hidden="true"' : `role="img" aria-label="${attr(text)}"`;
  const sz = size ? ` style="--bs:${Number(size)}px"` : '';
  return `<span class="bdgv${locked ? ' is-lock' : ''}"${sz} ${aria}>${svg}${!locked && count > 1 ? `<span class="bdgv__n" aria-hidden="true">×${count}</span>` : ''}${locked ? LOCK_ICON : ''}</span>`;
}
