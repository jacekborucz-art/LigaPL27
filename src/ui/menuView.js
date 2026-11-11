// Ekran startowy gry: intro (raz na sesję), menu główne z zapisami i kreator nowej kariery
// (trener, klub, kontrakt). Widok składa HTML; stan i akcje trzyma src/app.js.
// Każdy tekst wpisany przez gracza przechodzi przez esc(). Profil trenera nie opuszcza urządzenia.

import { CLUBS_PL, LEAGUE_NAMES } from '../data/clubs_pl.js';
import { POLISH_EUROPE_2026, SEASON, SEASON_YEAR, GAME_START } from '../config/calendar2026.js';
import { clubFinanceData } from '../data/finanse_klubow.js';
import { NAT_NAMES, NATIONALITIES, randomName } from '../data/names.js';
import { seasonGoalFor } from '../career/board.js';
import { clubPlan, initClub, stadiumCapacity } from '../career/finance.js';
import { rivalry, fmtZl } from '../career/fans.js';
import { Rng } from '../core/rng.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate } from './dom.js';

const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const HEX = /^#[0-9a-fA-F]{6}$/;
const crest = (club, size) => crestHtml(club, { size, clubsById });
const num = (n) => Math.round(n).toLocaleString('pl-PL');

// ------------------------------------------------------------ Motyw (preferencja tej przeglądarki)
const THEME_KEY = 'ligapl27-theme';
export const THEMES = { auto: 'Automatyczny', light: 'Jasny', dark: 'Ciemny' };

export function readTheme() {
  try { const t = localStorage.getItem(THEME_KEY); return THEMES[t] ? t : 'auto'; } catch { return 'auto'; }
}
export function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  try { localStorage.setItem(THEME_KEY, t); } catch { /* tryb prywatny: motyw tylko na tę wizytę */ }
}
export const nextTheme = (t) => ({ auto: 'light', light: 'dark', dark: 'auto' }[t] ?? 'auto');

// ------------------------------------------------------------ Logo
/** Logo gry: LIGAPL kredą i rocznik 27 na tablicy wyników LED. */
export function lockupHtml({ tag = 'h1', id = '' } = {}) {
  const letters = [...'LIGAPL'].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('');
  return `<${tag} class="lockup"${id ? ` id="${id}"` : ''}>
    <span class="lockup__word" aria-hidden="true">${letters}</span>
    <span class="lockup__plate" aria-hidden="true"><span class="lockup__num">27</span></span>
    <span class="sr-only">LigaPL 27</span>
  </${tag}>`;
}

// ------------------------------------------------------------ Intro
const INTRO_KEY = 'ligapl27-intro';

/** Boisko w perspektywie: pasy koszenia i linie kredą (SVG, bez plików). */
function pitchSvg() {
  // Pasy poprzeczne zwężające się ku horyzontowi
  const bands = []; let y = 400; let h = 46;
  for (let i = 0; y > 170; i++) { const top = Math.max(170, y - h); bands.push(`<rect x="0" y="${top.toFixed(1)}" width="1000" height="${(y - top).toFixed(1)}" fill="${i % 2 ? '#1c6337' : '#226f3e'}"/>`); y = top; h *= 0.8; }
  return `<svg class="intro__pitch" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><clipPath id="intro-field"><path d="M-260 400 L300 170 L700 170 L1260 400 Z"/></clipPath></defs>
    <g clip-path="url(#intro-field)">${bands.join('')}</g>
    <g class="intro__chalk" fill="none" stroke="#F3F6F1" stroke-width="2.4" stroke-linejoin="round">
      <path pathLength="1" d="M-200 392 L310 178 L690 178 L1200 392"/>
      <path pathLength="1" d="M172 236 L828 236"/>
      <ellipse pathLength="1" cx="500" cy="236" rx="118" ry="24"/>
    </g>
  </svg>`;
}

function mastHtml(side) {
  const lamps = Array.from({ length: 12 }, (_, i) => `<i style="--i:${side === 'l' ? i : 11 - i}"></i>`).join('');
  return `<div class="intro__mast intro__mast--${side}" aria-hidden="true">${lamps}</div>`;
}

/**
 * Intro przy pierwszym otwarciu w sesji: zapalają się jupitery, pojawia się boisko i logo na tablicy LED.
 * Pomijane kliknięciem, Enter, Esc albo spacją. Przy ograniczonym ruchu i w testach automatycznych
 * (navigator.webdriver) od razu menu; adres z ?intro wymusza pokaz.
 */
export function maybePlayIntro(app, { onDone } = {}) {
  let seen = false;
  try { seen = sessionStorage.getItem(INTRO_KEY) === '1'; } catch { /* brak sessionStorage: intro przy każdym starcie */ }
  const force = /[?&]intro\b/.test(location.search);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!force && (seen || reduce || navigator.webdriver)) return false;
  try { sessionStorage.setItem(INTRO_KEY, '1'); } catch { /* jw. */ }

  const el = document.createElement('div');
  el.className = 'intro';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'LigaPL 27');
  el.innerHTML = `
    <div class="intro__glow" aria-hidden="true"></div>
    ${mastHtml('l')}${mastHtml('r')}
    <div class="intro__beam intro__beam--l" aria-hidden="true"></div>
    <div class="intro__beam intro__beam--r" aria-hidden="true"></div>
    ${pitchSvg()}
    <div class="intro__center">
      ${lockupHtml({ tag: 'p' })}
      <p class="intro__tag">Polski manager piłkarski. Sezon ${esc(SEASON)}.</p>
    </div>
    <button type="button" class="intro__skip">Pomiń intro <kbd>Enter</kbd></button>`;
  document.body.append(el);
  app.inert = true;
  el.querySelector('.intro__skip').focus({ preventScroll: true });

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey, true);
    el.classList.add('is-leaving');
    app.inert = false;
    setTimeout(() => { el.remove(); onDone?.(); }, reduce ? 0 : 300);
  };
  const onKey = (ev) => {
    if (!['Enter', 'Escape', ' ', 'Spacebar'].includes(ev.key)) return;
    ev.preventDefault(); ev.stopPropagation(); finish();
  };
  document.addEventListener('keydown', onKey, true);
  el.addEventListener('click', finish);
  const timer = setTimeout(finish, 4200);
  return true;
}

// ------------------------------------------------------------ Menu główne
const savedAtText = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${fmtDate(day)}, ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Ostatnio zapisana kariera (do „Kontynuuj”). */
export const latestSlot = (slots) => slots.filter((s) => !s.empty).sort((a, b) => String(b.savedAt ?? '').localeCompare(String(a.savedAt ?? '')))[0] ?? null;

function saveRow(s, confirmDel) {
  if (s.empty) {
    return `<li class="save save--empty">
      <span class="save__no" aria-hidden="true">${s.slot}</span>
      <div class="save__body"><b class="save__club">Wolny slot ${s.slot}</b><span class="save__meta">Miejsce na nową karierę</span></div>
      <div class="save__actions"><button class="btn btn--primary" data-act="new" data-slot="${s.slot}">Nowa kariera</button></div>
    </li>`;
  }
  const club = clubsById.get(s.summary?.clubId);
  const name = club?.name ?? 'Nieznany klub';
  const manager = s.summary?.managerName || 'Trener';
  const actions = confirmDel === s.slot
    ? `<p class="save__confirm" id="del-q-${s.slot}">Usunąć karierę ${esc(name)} na zawsze? Tego nie da się cofnąć.</p>
       <button class="btn btn--danger" data-act="deleteYes" data-slot="${s.slot}" aria-describedby="del-q-${s.slot}">Usuń zapis</button>
       <button class="btn btn--quiet" data-act="deleteNo" data-slot="${s.slot}">Zostaw</button>`
    : `<button class="btn btn--primary" data-act="load" data-slot="${s.slot}" aria-label="Graj: ${esc(name)}, slot ${s.slot}">Graj</button>
       <button class="btn btn--quiet" data-act="export" data-slot="${s.slot}" aria-label="Eksportuj zapis ze slotu ${s.slot} do pliku">Eksportuj</button>
       <button class="btn btn--quiet" data-act="delete" data-slot="${s.slot}" aria-label="Usuń zapis ze slotu ${s.slot}">Usuń</button>`;
  return `<li class="save">
    <span class="save__no" aria-hidden="true">${s.slot}</span>
    ${club ? crest(club, 40) : ''}
    <div class="save__body">
      <b class="save__club">${esc(name)}</b>
      <span class="save__meta">${esc(manager)}${typeof s.summary?.season === 'string' ? `, sezon ${esc(s.summary.season)}` : ''}</span>
      <span class="save__meta">Data w grze: ${esc(fmtDate(s.summary?.date ?? GAME_START))}</span>
      ${s.savedAt ? `<span class="save__meta save__meta--quiet">Zapisano ${esc(savedAtText(s.savedAt))}</span>` : ''}
    </div>
    <div class="save__actions${confirmDel === s.slot ? ' save__actions--confirm' : ''}">${actions}</div>
  </li>`;
}

/**
 * Menu główne. ctx: { slots, notice, memoryOnly, theme, confirmDel }.
 * Na PC dwie kolumny (logo i menu, zapisane kariery), na telefonie jedna pod drugą.
 */
export function renderMenu(ctx) {
  const { slots, notice, memoryOnly, theme, confirmDel } = ctx;
  const last = latestSlot(slots);
  const free = slots.find((s) => s.empty);
  const used = slots.filter((s) => !s.empty).length;
  const lastClub = last && clubsById.get(last.summary?.clubId);
  const items = [];
  if (last) {
    items.push(`<li><button class="mi mi--lead" data-act="continue" data-slot="${last.slot}">
      <span class="mi__label">Kontynuuj</span>
      <span class="mi__sub">${lastClub ? crest(lastClub, 28) : ''}<span>${esc(lastClub?.name ?? 'Ostatnia kariera')}, ${esc(fmtDate(last.summary?.date ?? GAME_START))}</span></span>
    </button></li>`);
  }
  items.push(`<li><button class="mi${last ? '' : ' mi--lead'}" data-act="newcareer">
    <span class="mi__label">Nowa kariera</span>
    <span class="mi__sub">${free ? `Trener, klub i kontrakt. Wolny slot ${free.slot}.` : 'Wszystkie sloty są zajęte. Usuń jeden zapis.'}</span>
  </button></li>`);
  items.push(`<li><button class="mi" data-act="slots">
    <span class="mi__label">Wczytaj grę</span>
    <span class="mi__sub">${used ? `${used} z 3 zapisów` : 'Brak zapisów'}, import z pliku</span>
  </button></li>`);
  items.push(`<li><button class="mi" data-act="theme" aria-label="Motyw: ${esc(THEMES[theme])}. Zmień motyw">
    <span class="mi__label">Motyw</span>
    <span class="mi__sub">${esc(THEMES[theme])}${theme === 'auto' ? ', jak w systemie' : ''}</span>
  </button></li>`);

  return `
  <div class="menu-screen">
    <svg class="menu-screen__chalk" viewBox="0 0 600 600" aria-hidden="true" focusable="false">
      <circle cx="300" cy="300" r="182" fill="none" stroke="currentColor" stroke-width="3"/>
      <circle cx="300" cy="300" r="5" fill="currentColor"/>
      <path d="M300 0 V600" stroke="currentColor" stroke-width="3"/>
    </svg>
    <main class="menu" id="main">
      <section class="menu__lead" aria-labelledby="menu-title">
        ${lockupHtml({ id: 'menu-title' })}
        <p class="menu__tagline">Polski manager piłkarski. Ekstraklasa, 1 Liga i 2 Liga, Puchar Polski i europejskie puchary. Sezon ${esc(SEASON)}.</p>
        <nav aria-label="Menu główne"><ul class="menu__list" data-menu>${items.join('')}</ul></nav>
      </section>
      <section class="saves" id="saves" aria-labelledby="saves-title">
        <h2 id="saves-title" tabindex="-1">Zapisane kariery</h2>
        ${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}
        ${memoryOnly ? '<p class="notice" role="status">Ta przeglądarka nie pozwala zapisać gry na stałe. Postęp zniknie po zamknięciu karty; użyj eksportu.</p>' : ''}
        <ol class="saves__list">${slots.map((s) => saveRow(s, confirmDel)).join('')}</ol>
        <label class="btn btn--quiet saves__import">Wczytaj zapis z pliku JSON
          <input type="file" accept="application/json,.json" data-act="import" class="sr-only">
        </label>
        <p class="saves__note">Zapisy zostają w tej przeglądarce. Gra działa bez internetu.</p>
      </section>
    </main>
  </div>`;
}

// ------------------------------------------------------------ Kreator: dane i walidacja
const NAT_EXTRA = { ROU: 'Rumunia', SUI: 'Szwajcaria', EST: 'Estonia', ALB: 'Albania', JPN: 'Japonia', KOR: 'Korea Południowa', MEX: 'Meksyk', USA: 'Stany Zjednoczone', URU: 'Urugwaj', AUS: 'Australia', ARM: 'Armenia', KAZ: 'Kazachstan', MDA: 'Mołdawia', KOS: 'Kosowo' };
const NAT_ALL = { ...NAT_EXTRA, ...NAT_NAMES };
const WORLD = new Set(['NGA', 'GHA', 'CMR', 'SEN', 'CIV', 'BRA', 'ARG', 'COL', 'JPN', 'KOR', 'MEX', 'USA', 'URU', 'AUS']);
const byName = (a, b) => NAT_ALL[a].localeCompare(NAT_ALL[b], 'pl');
const NAT_EUROPE = Object.keys(NAT_ALL).filter((k) => k !== 'POL' && !WORLD.has(k)).sort(byName);
const NAT_WORLD = [...WORLD].filter((k) => NAT_ALL[k]).sort(byName);
export const natName = (code) => NAT_ALL[code] ?? code;
export const isNationality = (code) => Boolean(NAT_ALL[code]);

export const AGE_MIN = 28;
export const AGE_MAX = 70;
const NAME_RE = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u;
export const cleanName = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

/** Komunikat błędu albo '' (pole poprawne). */
export function nameError(v, which) {
  const s = cleanName(v);
  const word = which === 'first' ? 'imię' : 'nazwisko';
  if (!s) return `Wpisz ${word} trenera.`;
  if (s.length < 2) return `${which === 'first' ? 'Imię' : 'Nazwisko'} musi mieć co najmniej 2 znaki.`;
  if (s.length > 30) return 'Skróć do 30 znaków.';
  if (!NAME_RE.test(s)) return 'Użyj liter; między słowami może być spacja, łącznik lub apostrof.';
  return '';
}
export function ageError(v) {
  const n = Number(v);
  if (String(v ?? '').trim() === '' || !Number.isInteger(n)) return `Podaj wiek liczbą od ${AGE_MIN} do ${AGE_MAX}.`;
  if (n < AGE_MIN || n > AGE_MAX) return `Podaj wiek od ${AGE_MIN} do ${AGE_MAX} lat.`;
  return '';
}
const lat = (n) => { const d = n % 10; const t = n % 100; return d >= 2 && d <= 4 && (t < 12 || t > 14) ? 'lata' : 'lat'; };
export const ageText = (n) => `${n} ${lat(n)}`;

/** Profil trenera zapisywany w grze. */
export function profileOf(nc) {
  const age = Number(nc.age);
  return { firstName: cleanName(nc.first), lastName: cleanName(nc.last), nationality: nc.nat, age, birthYear: SEASON_YEAR - age };
}

/** Losowe imię i nazwisko z puli narodowości (pule z src/data/names.js, inaczej polskie). */
export function randomCoach(nat) {
  const code = NATIONALITIES.includes(nat) ? nat : 'POL';
  const rng = new Rng(`trener:${Date.now()}:${Math.random()}`);
  for (let i = 0; i < 20; i++) {
    const n = randomName(code, rng);
    if (!nameError(n.first, 'first') && !nameError(n.last, 'last')) return n;
  }
  return { first: 'Jan', last: 'Nowak' };
}

// ------------------------------------------------------------ Kreator: wspólne elementy
const STEPS = ['Trener', 'Klub', 'Kontrakt'];

function stepsHtml(step) {
  return `<ol class="steps" aria-label="Kroki nowej kariery">${STEPS.map((s, i) => {
    const n = i + 1;
    const st = n < step ? 'done' : n === step ? 'current' : 'todo';
    return `<li class="steps__item" data-state="${st}"${n === step ? ' aria-current="step"' : ''}><span class="steps__no">${n}</span><span class="steps__label">${s}</span>${st === 'done' ? '<span class="sr-only"> (gotowe)</span>' : ''}</li>`;
  }).join('')}</ol>`;
}

function shell(nc, body, foot) {
  return `
  <div class="nc" data-step="${nc.step}">
    <header class="nc__head">
      <button class="btn btn--quiet nc__menu" data-act="back">Menu</button>
      <div class="nc__title"><h1>Nowa kariera</h1><span class="nc__slot">Slot ${nc.slot}</span></div>
      ${stepsHtml(nc.step)}
    </header>
    <main class="nc__main" id="main">${body}</main>
    <footer class="nc__foot">
      <div class="nc__foot-in">
        ${nc.step === 1 ? '' : '<button class="btn btn--quiet" data-act="ncBack">Wstecz</button>'}
        <p class="nc__msg" id="nc-msg" role="status">${esc(nc.msg ?? '')}</p>
        ${foot}
      </div>
    </footer>
  </div>`;
}

// ------------------------------------------------------------ Krok 1: trener
function field(id, label, inner, err, hint) {
  return `<div class="fld${err ? ' is-invalid' : ''}" data-fld="${id}">
    <label class="fld__label" for="nc-${id}">${label}</label>
    ${inner}
    <p class="fld__help" id="nc-${id}-help">${err ? '' : esc(hint ?? '')}</p>
    <p class="fld__err" id="nc-${id}-err"${err ? '' : ' hidden'}>${esc(err ?? '')}</p>
  </div>`;
}

const initials = (nc) => `${cleanName(nc.first)[0] ?? ''}${cleanName(nc.last)[0] ?? ''}`.toUpperCase() || '?';

function coachCardHtml(nc) {
  const full = `${cleanName(nc.first)} ${cleanName(nc.last)}`.trim();
  const age = Number(nc.age);
  const okAge = !ageError(nc.age);
  return `<aside class="card-id" aria-label="Podgląd karty trenera">
    <div class="card-id__top"><span>Akredytacja</span><span>Sezon ${esc(SEASON)}</span></div>
    <div class="card-id__main">
      <span class="card-id__mono" data-preview="mono" aria-hidden="true">${esc(initials(nc))}</span>
      <div class="card-id__who">
        <span class="card-id__role">Pierwszy trener</span>
        <b class="card-id__name" data-preview="name">${esc(full || 'Imię i nazwisko')}</b>
        <span class="card-id__line"><span class="nat-code" data-preview="code">${esc(nc.nat)}</span> <span data-preview="nat">${esc(natName(nc.nat))}</span></span>
        <span class="card-id__line" data-preview="age">${okAge ? `${esc(ageText(age))}, rocznik ${SEASON_YEAR - age}` : 'Wiek do uzupełnienia'}</span>
      </div>
    </div>
    <div class="card-id__foot"><span>Klub</span><b>wybierasz w następnym kroku</b></div>
  </aside>`;
}

function natOptions(sel) {
  const opt = (k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(NAT_ALL[k])}</option>`;
  return `${opt('POL')}<optgroup label="Europa">${NAT_EUROPE.map(opt).join('')}</optgroup><optgroup label="Reszta świata">${NAT_WORLD.map(opt).join('')}</optgroup>`;
}

function stepCoach(nc) {
  const e = nc.errors ?? {};
  const desc = (id) => `aria-describedby="nc-${id}-help nc-${id}-err"`;
  const inv = (id) => (e[id] ? ' aria-invalid="true"' : '');
  const body = `
  <div class="coach">
    <form class="coach__form" data-nc-form novalidate>
      <h2 class="nc__h">Kim jest nowy trener?</h2>
      <p class="nc__lead">Te dane zobaczysz w nagłówku gry, w zapisie i w kontrakcie.</p>
      <div class="coach__names">
        ${field('first', 'Imię', `<input id="nc-first" name="first" type="text" autocomplete="off" autocapitalize="words" spellcheck="false" maxlength="40" required value="${esc(nc.first)}" ${desc('first')}${inv('first')}>`, e.first, 'Od 2 do 30 liter.')}
        ${field('last', 'Nazwisko', `<input id="nc-last" name="last" type="text" autocomplete="off" autocapitalize="words" spellcheck="false" maxlength="40" required value="${esc(nc.last)}" ${desc('last')}${inv('last')}>`, e.last, 'Łącznik dla nazwisk dwuczłonowych.')}
      </div>
      <button type="button" class="btn btn--quiet coach__dice" data-act="ncRandom">Losuj imię i nazwisko</button>
      ${field('nat', 'Narodowość', `<div class="sel"><span class="nat-code" data-preview="code2" aria-hidden="true">${esc(nc.nat)}</span><select id="nc-nat" name="nat" ${desc('nat')}>${natOptions(nc.nat)}</select></div>`, '', 'Losowanie podpowiada imiona z tego kraju.')}
      ${field('age', 'Wiek', `<div class="stepper">
          <button type="button" class="stepper__btn" data-act="ageDec" aria-label="Odejmij rok" aria-controls="nc-age">&minus;</button>
          <input id="nc-age" name="age" type="number" inputmode="numeric" min="${AGE_MIN}" max="${AGE_MAX}" step="1" required value="${esc(nc.age)}" ${desc('age')}${inv('age')}>
          <button type="button" class="stepper__btn" data-act="ageInc" aria-label="Dodaj rok" aria-controls="nc-age">+</button>
        </div>`, e.age, `Od ${AGE_MIN} do ${AGE_MAX} lat.`)}
    </form>
    ${coachCardHtml(nc)}
  </div>`;
  return shell(nc, body, '<button class="btn btn--primary nc__next" data-act="profileNext">Dalej: wybór klubu</button>');
}

/** Odświeża podgląd karty bez przerysowania formularza (fokus zostaje w polu). */
export function updateCoachPreview(root, nc) {
  const set = (k, v) => root.querySelectorAll(`[data-preview="${k}"]`).forEach((n) => { n.textContent = v; });
  const full = `${cleanName(nc.first)} ${cleanName(nc.last)}`.trim();
  set('name', full || 'Imię i nazwisko');
  set('mono', initials(nc));
  set('code', nc.nat); set('code2', nc.nat);
  set('nat', natName(nc.nat));
  const age = Number(nc.age);
  set('age', ageError(nc.age) ? 'Wiek do uzupełnienia' : `${ageText(age)}, rocznik ${SEASON_YEAR - age}`);
}

/** Pokazuje albo chowa błąd pola (bez przerysowania). */
export function setFieldError(root, id, msg) {
  const box = root.querySelector(`[data-fld="${id}"]`);
  if (!box) return;
  const input = box.querySelector('input, select');
  const err = box.querySelector('.fld__err');
  const help = box.querySelector('.fld__help');
  box.classList.toggle('is-invalid', Boolean(msg));
  if (msg) input?.setAttribute('aria-invalid', 'true'); else input?.removeAttribute('aria-invalid');
  err.textContent = msg || '';
  err.hidden = !msg;
  help.hidden = Boolean(msg);
}

// ------------------------------------------------------------ Krok 2: klub
function strengthOf(club) {
  const avg = { 1: 11.5, 2: 10, 3: 8.5 }[club.tier];
  const d = club.L - avg;
  return d >= 0.7 ? 'Faworyt' : d >= 0.2 ? 'Czołówka' : d > -0.25 ? 'Środek' : d > -0.45 ? 'Dół tabeli' : 'Outsider';
}
const EURO = { LM: 'Liga Mistrzów', LE: 'Liga Europy', LK: 'Liga Konferencji' };
const ENTRY = { Q1: 'od 1. rundy eliminacji', Q2: 'od 2. rundy eliminacji', Q3: 'od 3. rundy eliminacji', PO: 'od rundy play-off', league: 'od fazy ligowej' };
const europeOf = (club) => POLISH_EUROPE_2026.find((e) => e.club === club.id) ?? null;
const OWNER = { miliarder: 'bogaty właściciel', prywatny: 'właściciel prywatny', miasto: 'miasto', spolka: 'spółka', klub: 'stowarzyszenie' };
const RIVAL = { 3: 'wielkie derby', 2: 'zacięta rywalizacja', 1: 'lokalny rywal' };
const colorsOf = (club) => {
  const [a, b] = club.colors ?? [];
  return `--c1:${HEX.test(a) ? a : '#1E6B3A'};--c2:${HEX.test(b) ? b : '#F3F6F1'}`;
};
const pickable = (tier) => CLUBS_PL.filter((c) => c.tier === tier && !c.parent);

const factsCache = new Map();
/** Dane klubu do panelu: wyłącznie z danych i wzorów gry (finanse jak na starcie kariery). */
export function clubFacts(club) {
  if (factsCache.has(club.id)) return factsCache.get(club.id);
  const goal = seasonGoalFor(club);
  const plan = clubPlan(club);
  const start = initClub({ clubs: {}, players: {} }, club); // ten sam wzór co createFinance na starcie gry
  const data = clubFinanceData(club);
  const est = new Set(data.szac ?? []);
  const rivals = CLUBS_PL.filter((c) => c.id !== club.id && !c.parent)
    .map((c) => ({ c, v: rivalry(club.id, c.id) })).filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v || b.c.prestige - a.c.prestige).slice(0, 3);
  const f = {
    goal, strength: strengthOf(club), size: pickable(club.tier).length, europe: europeOf(club),
    transfer: start.transferBudget, wages: plan.wages, cap: stadiumCapacity(club), att: plan.att,
    capEst: est.has('pojemnosc'), attEst: est.has('frekwencja'),
    owner: plan.ownerName, ownerType: OWNER[plan.ownerType] ?? '', rivals,
  };
  factsCache.set(club.id, f);
  return f;
}

function clubCard(club, selected) {
  const f = clubFacts(club);
  const eu = f.europe;
  return `<li class="cc-item"><button class="cc" data-act="pick" data-club="${esc(club.id)}" aria-pressed="${selected}" style="${colorsOf(club)}">
    <span class="cc__band" aria-hidden="true"></span>
    ${crest(club, 44)}
    <span class="cc__body">
      <span class="cc__name">${esc(club.name)}</span>
      <span class="cc__goal">Cel: ${esc(f.goal.text)}</span>
    </span>
    <span class="cc__meta">
      <span class="strength" data-level="${f.strength}">${f.strength}</span>
      ${eu ? `<span class="tag" title="${esc(EURO[eu.comp])}">${esc(eu.comp)}</span>` : ''}
    </span>
  </button></li>`;
}

function clubDetail(club, { inline }) {
  const f = clubFacts(club);
  const eu = f.europe;
  const row = (k, v) => `<div class="cd__row"><dt>${k}</dt><dd>${v}</dd></div>`;
  const rivals = f.rivals.length
    ? `<ul class="cd__rivals">${f.rivals.map(({ c, v }) => `<li>${crest(c, 24)}<span>${esc(c.name)}</span><small>${RIVAL[v]}</small></li>`).join('')}</ul>`
    : '<p class="cd__none">Brak wielkich derbów w danych gry.</p>';
  return `<section class="cd${inline ? ' cd--inline' : ''}" id="club-detail" aria-labelledby="cd-title" style="${colorsOf(club)}">
    <header class="cd__head">
      ${crest(club, 64)}
      <div><h2 id="cd-title" class="cd__name">${esc(club.name)}</h2><span class="cd__league">${esc(LEAGUE_NAMES[club.tier])}, renoma ${club.prestige}/10</span></div>
    </header>
    <div class="cd__goal"><span>Zarząd oczekuje</span><b>${esc(f.goal.text)}</b><small>Cel: ${f.goal.target <= 1 ? 'mistrzostwo' : `miejsce ${f.goal.target} lub wyżej`}</small></div>
    <dl class="cd__facts">
      ${row('Siła kadry', `${f.strength}, ${f.goal.rank}. w lidze na ${f.size}`)}
      ${row(`Europa ${esc(SEASON)}`, eu ? `${esc(EURO[eu.comp])}, ${esc(ENTRY[eu.entry] ?? eu.entry)}` : 'Bez europejskich pucharów')}
      ${row('Budżet transferowy', esc(fmtZl(f.transfer)))}
      ${row('Płace kadry', `${esc(fmtZl(f.wages))} na sezon`)}
      ${row('Stadion', `${num(f.cap)} miejsc${f.capEst ? ' (szacunek)' : ''}`)}
      ${row('Frekwencja', `średnio ${num(f.att)}${f.attEst ? ' (szacunek)' : ''}`)}
      ${f.owner ? row('Właściciel', `${esc(f.owner)}${f.ownerType ? `, ${esc(f.ownerType)}` : ''}`) : ''}
    </dl>
    <h3 class="cd__sub">Rywale</h3>
    ${rivals}
  </section>`;
}

function stepClub(nc, { wide }) {
  const list = pickable(nc.tier);
  const sel = nc.clubId ? clubsById.get(nc.clubId) : null;
  const selInTier = sel && sel.tier === nc.tier;
  const tabs = [1, 2, 3].map((t) => `<button role="tab" id="tier-${t}" aria-controls="club-grid" aria-selected="${t === nc.tier}" tabindex="${t === nc.tier ? 0 : -1}" class="ltab" data-act="tier" data-tier="${t}">${esc(LEAGUE_NAMES[t])}<span class="ltab__n">${pickable(t).length}</span></button>`).join('');
  const cards = list.map((c) => {
    const on = c.id === nc.clubId;
    return clubCard(c, on) + (on && !wide ? `<li class="cc-detail">${clubDetail(c, { inline: true })}</li>` : '');
  }).join('');
  const side = wide
    ? `<div class="pick2__side">${sel ? clubDetail(sel, { inline: false }) : `<div class="cd cd--empty"><p class="cd__empty-title">Wybierz klub z listy</p><p>Zobaczysz cel zarządu, budżet, stadion i rywali.</p></div>`}</div>`
    : '';
  const body = `
  <div class="pick2">
    <div class="pick2__main">
      <div class="pick2__top">
        <h2 class="nc__h">Gdzie zaczynasz?</h2>
        <div class="ltabs" role="tablist" aria-label="Liga">${tabs}</div>
      </div>
      <p class="nc__lead">Siła to kadra na tle ligi. Od niej zależy cel zarządu. Kadry wylosujemy po podpisaniu kontraktu.</p>
      <ul class="cc-grid" id="club-grid" role="tabpanel" aria-labelledby="tier-${nc.tier}">${cards}</ul>
      ${sel && !selInTier ? `<p class="pick2__other">Wybrany klub: ${esc(sel.name)} (${esc(LEAGUE_NAMES[sel.tier])}).</p>` : ''}
    </div>
    ${side}
  </div>`;
  const label = sel ? `Dalej: ${esc(sel.name)}` : 'Dalej: kontrakt';
  return shell(nc, body, `<button class="btn btn--primary nc__next" data-act="pickConfirm">${label}</button>`);
}

// ------------------------------------------------------------ Krok 3: kontrakt
function stepContract(nc) {
  const club = clubsById.get(nc.clubId);
  const p = profileOf(nc);
  const f = clubFacts(club);
  const full = `${p.firstName} ${p.lastName}`;
  const body = `
  <article class="contract" aria-labelledby="ct-title" style="${colorsOf(club)}">
    <header class="contract__head">
      ${crest(club, 72)}
      <div>
        <span class="contract__kind">Umowa o pracę trenera</span>
        <h2 id="ct-title" class="contract__club">${esc(club.name)}</h2>
        <span class="contract__date">Początek pracy: ${esc(fmtDate(GAME_START))}</span>
      </div>
    </header>
    <p class="contract__lead">Pierwszy trener: <b>${esc(full)}</b>. Umowa obowiązuje w sezonie ${esc(SEASON)} na warunkach poniżej.</p>
    <dl class="contract__terms">
      <div><dt>Trener</dt><dd>${esc(full)}</dd></div>
      <div><dt>Narodowość</dt><dd>${esc(natName(p.nationality))}</dd></div>
      <div><dt>Wiek</dt><dd>${esc(ageText(p.age))}, rocznik ${p.birthYear}</dd></div>
      <div><dt>Rozgrywki</dt><dd>${esc(LEAGUE_NAMES[club.tier])}${f.europe ? `, ${esc(EURO[f.europe.comp])}` : ''}, Puchar Polski</dd></div>
      <div class="contract__goal"><dt>Cel sezonu</dt><dd>${esc(f.goal.text)}</dd></div>
      <div><dt>Budżet transferowy</dt><dd>${esc(fmtZl(f.transfer))}</dd></div>
    </dl>
    <p class="contract__fine">Zarząd ocenia pracę trenera co miesiąc. Wyniki wyraźnie poniżej celu mogą skończyć się zwolnieniem.</p>
    <div class="contract__sign">
      <div class="contract__line"><span class="contract__slot"><span class="contract__sig" data-sig>${esc(full)}</span></span><small>Podpis trenera</small></div>
      <div class="contract__line"><span class="contract__slot"><span class="contract__sig contract__sig--club">Zarząd klubu</span></span><small>Za klub</small></div>
    </div>
  </article>`;
  return shell(nc, body, '<button class="btn btn--primary nc__next nc__sign" data-act="sign">Podpisz kontrakt</button>');
}

/** Kreator nowej kariery. nc: { step, slot, first, last, nat, age, tier, clubId, errors, msg }. */
export function renderCareer(nc, { wide = false } = {}) {
  if (nc.step === 3 && nc.clubId) return stepContract(nc);
  if (nc.step >= 2) return stepClub(nc, { wide });
  return stepCoach(nc);
}

/** Nowy stan kreatora. */
export function newCareerState(slot) {
  return { step: 1, slot, first: '', last: '', nat: 'POL', age: 40, tier: 1, clubId: null, errors: {}, msg: '' };
}

/** Imię i nazwisko trenera z gry (stare zapisy bez profilu: „Trener”). */
export function managerName(game) {
  const p = game?.manager?.profile;
  const s = p ? cleanName(`${p.firstName ?? ''} ${p.lastName ?? ''}`) : '';
  return s || 'Trener';
}
