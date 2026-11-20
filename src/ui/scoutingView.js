// Transfery > Skauting: skauci i misje, kandydaci z raportów (z listą obserwowanych), wolni skauci i arkusz zlecenia.
// Dane z src/career/scoutOps.js (scoutingView, missionQuote), akcje sk-* obsługuje app.js (blok „Skauting: akcje sk-*”).
// Stan ekranu w state: skTab, skOrder (edytowane zlecenie), skSheet, skFilter, skReport, skAsk, skMsg.
import { esc, fmtDate, fmtDay } from './dom.js';
import { GROUP } from '../career/squad.js';
import { clubById } from '../data/clubs_pl.js';
import { SCOUT_REGIONS, SCOUT, scoutingView, missionQuote } from '../career/scoutOps.js';
import { cardLink, bestOwnAt } from './transfersView.js';
import { scoutEye } from './scoutMask.js'; // ocena kandydata tylko w zdaniu skauta (bez liczb w kartach i listach)

export const SK_TABS = [['misje', 'Skauci i misje'], ['kandydaci', 'Kandydaci'], ['wolni', 'Wolni skauci']];
const WEEKS = [1, 2, 4, 6];
const POSITIONS = ['BR', 'ŚO', 'BO', 'WB', 'DP', 'ŚP', 'OP', 'BP', 'SN', 'NAP'];
const ATTRS = [['dos', 'Doświadczenie', 'Dośw.'], ['oce', 'Ocena zawodnika', 'Ocena'], ['ryn', 'Wiedza o rynku', 'Rynek'], ['sie', 'Sieć kontaktów', 'Sieć'], ['cha', 'Ocena charakteru', 'Charakt.']];
const LEVELS = [
  ['starter', 'Podstawowy', 'Zawodnik, który zagra w pierwszym składzie u nas.'],
  ['wzmocnienie', 'Wzmocnienie', 'Poprawi poziom składu na tej pozycji.'],
  ['perspektywa', 'Perspektywa', 'Młody z potencjałem, jeszcze nie gotowy.'],
];
const CONTRACTS = [['any', 'Wolny lub z kontraktem', 'Szersza lista, droższe negocjacje'], ['free', 'Tylko wolny', 'Bez odstępnego, mniej kandydatów'], ['contract', 'Tylko z kontraktem', 'Wymaga oferty do klubu']];
const LEVEL_NAME = Object.fromEntries(LEVELS.map(([k, n]) => [k, n.toLowerCase()]));
const CONTRACT_NAME = { any: 'wolny lub z kontraktem', free: 'tylko wolny', contract: 'tylko z kontraktem' };
const BAND_LV = { ekspert: 3, dobra: 2, podstawowa: 1 };
const BAND_TXT = { ekspert: 'ekspert', dobra: 'dobra znajomość', podstawowa: 'podstawowa' };
// Położenie kafelków mapy (kolumna, wiersz) według kolejności SCOUT_REGIONS: kartogram 6 x 4, bez map z prawami autorskimi
const TILE_POS = [[4, 3], [4, 2], [4, 1], [3, 3], [3, 2], [5, 2], [4, 4], [3, 4], [1, 4], [1, 2], [6, 2], [5, 3]];
const CHANCE_K = { niska: 'bad', 'średnia': 'warn', wysoka: 'good' };
const WILL_K = { 'Chętny': 'good', 'Raczej tak': 'info', 'Wahający się': 'warn', 'Raczej nie': 'bad' };
const ADAPT_K = { niskie: 'good', 'średnie': 'warn', wysokie: 'bad' };
const CONF_TXT = { wysoka: ['Ocena pewna', 'good'], 'średnia': ['Ocena dość pewna', 'info'], niska: ['Niska pewność oceny', 'bad'] };
const EVENT_K = { mecz: 'good', agent: 'good', uraz: 'bad', zaulek: 'bad', wyjazd: 'info', powrot: 'info' };

// ------------------------------------------------------------ Pomocnicze
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const attr = (a, k) => Math.max(0, Math.min(20, Math.round(num(a?.[k]))));
const zl = (n) => `${String(Math.round(num(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} zł`;
const mln = (n) => `${(num(n) / 1e6).toFixed(num(n) >= 1e7 ? 1 : 2).replace('.', ',')} mln zł`;
const money = (n) => (num(n) >= 1e6 ? mln(n) : zl(n));
const date = (iso) => (iso ? esc(fmtDate(iso)) : '');
const day = (iso) => (iso ? esc(fmtDay(iso)) : '');
const dayNum = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000) || 0; };
const daysBetween = (a, b) => dayNum(b) - dayNum(a);
const initials = (n) => String(n ?? '').split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const weeksTxt = (n) => `${n} ${n === 1 ? 'tydzień' : n >= 2 && n <= 4 ? 'tygodnie' : 'tygodni'}`;
const weeksShort = (n) => (n === 1 ? 'tydzień' : 'tyg.');
const posChip = (p) => `<span class="pos" data-g="${esc(GROUP[p] ?? 'MID')}">${esc(p)}</span>`;
const natChip = (n) => `<span class="sk-nat">${esc(n)}</span>`;
const regionOf = (key) => SCOUT_REGIONS.find((r) => r.key === key) ?? null;
const regionLabel = (key, fallback = '') => regionOf(key)?.label ?? fallback ?? key;
const bClass = (v) => (v >= 16 ? 'top' : v >= 13 ? 'good' : v <= 8 ? 'low' : '');
const expectedTxt = (e) => (Array.isArray(e) ? `${e[0]} do ${e[1]}` : typeof e === 'number' ? `około ${e}` : String(e ?? ''));
const bandOf = (scout, key) => scout?.regions?.find((r) => r.key === key)?.band ?? null;

// ------------------------------------------------------------ Mapa regionów
function mapHtml({ dark = false, levels = {}, pins = {}, sel = null, tileAttrs, cap = '' }) {
  const placed = SCOUT_REGIONS.length === TILE_POS.length;
  return `<div class="sk-map${dark ? ' sk-map--dark' : ''}" role="group" aria-label="Regiony świata, wybierz region">${SCOUT_REGIONS.map((r, i) => {
    const lv = levels[r.key] ?? 0;
    const at = placed ? ` style="grid-column:${TILE_POS[i][0]};grid-row:${TILE_POS[i][1]}"` : '';
    const band = Object.keys(BAND_LV).find((b) => BAND_LV[b] === lv);
    return `<button type="button" class="sk-tile"${at} data-lv="${lv}" ${tileAttrs(r.key)} aria-pressed="${sel === r.key}" aria-label="${esc(r.label)}${lv ? `, ${esc(BAND_TXT[band])}` : ''}${pins[r.key] ? ', skaut w podróży' : ''}">`
      + `<span class="sk-tile__n">${esc(r.short)}</span><span class="sk-tile__pips" aria-hidden="true">${lv ? '<i></i><i></i><i></i>' : ''}</span>${pins[r.key] ? '<span class="sk-pin"></span>' : ''}</button>`;
  }).join('')}</div>${cap ? `<p class="sk-map__cap">${cap}</p>` : ''}`;
}
const levelsOf = (scouts) => {
  const out = {};
  for (const s of scouts) for (const r of s.regions ?? []) out[r.key] = Math.max(out[r.key] ?? 0, BAND_LV[r.band] ?? 1);
  return out;
};
const regChip = (r) => `<span class="sk-reg" data-lv="${BAND_LV[r.band] ?? 1}" title="${esc(BAND_TXT[r.band] ?? '')}">${esc(r.label)} <span class="sk-tile__pips" aria-hidden="true"><i></i><i></i><i></i></span><small>${esc(BAND_TXT[r.band] ?? '')}</small></span>`;
const attrBars = (a) => `<ul class="sk-attrs" aria-label="Cechy skauta, skala 1 do 20">${ATTRS.map(([k, n]) => `<li class="sk-attr" data-top="${attr(a, k) >= 16 ? 1 : 0}"><span>${esc(n)}</span><span class="sk-attr__bar" style="--v:${attr(a, k)}"><i></i></span><b>${attr(a, k)}</b></li>`).join('')}</ul>`;

// ------------------------------------------------------------ Zlecenie: wartości domyślne i akcje stanu
/** Domyślne zlecenie (kwoty według ligi klubu [SZAC]). */
export function defaultOrder(game, view, { scoutId = null, freeScoutId = null, region = null } = {}) {
  const tier = clubById(game.clubId)?.tier ?? 1;
  const money0 = { 1: [2000000, 40000], 2: [600000, 15000], 3: [200000, 6000], 4: [80000, 3000] }[tier] ?? [200000, 6000];
  const own = scoutId ? view.scouts.find((s) => s.id === scoutId) : (freeScoutId ? null : view.scouts.find((s) => s.status === 'w klubie') ?? view.scouts[0]);
  const free = freeScoutId ? view.freeScouts.find((s) => s.id === freeScoutId) : null;
  const sc = own ?? free;
  const reg = region ?? sc?.regions?.[0]?.key ?? SCOUT_REGIONS[0].key;
  const o = { region: reg, pos: 'ŚP', ageFrom: 19, ageTo: 24, level: 'perspektywa', maxFee: money0[0], maxWage: money0[1], contract: 'any', weeks: 2 };
  if (free) o.freeScoutId = free.id; else if (own) o.scoutId = own.id;
  return o;
}

/** Zlecenie z poprzedniej misji (Powtórz, Zmień profil); weeks nadpisuje czas wyjazdu. */
export function orderFromMission(view, m, weeks = null) {
  const o = { region: m.region, pos: m.pos, ageFrom: m.ageFrom, ageTo: m.ageTo, level: m.level, maxFee: m.maxFee, maxWage: m.maxWage, contract: m.contract ?? 'any', weeks: weeks ?? m.weeks };
  if (!m.freelance && view.scouts.some((s) => s.id === m.scoutId)) o.scoutId = m.scoutId;
  return o;
}

const parseMoney = (v) => Math.max(0, Math.round(Number(String(v ?? '').replace(/[^\d]/g, '')) || 0));
const clampAge = (v, d) => Math.max(16, Math.min(45, Math.round(Number(v) || d)));

/** Pole formularza zlecenia (zdarzenie change). Zwraca nowe zlecenie. */
export function setOrderField(order, field, value) {
  const o = { ...order };
  if (field === 'scout') {
    delete o.scoutId; delete o.freeScoutId;
    if (String(value).startsWith('f:')) o.freeScoutId = String(value).slice(2); else o.scoutId = String(value).slice(2);
  } else if (field === 'ageFrom') { o.ageFrom = clampAge(value, o.ageFrom); if (o.ageTo < o.ageFrom) o.ageTo = o.ageFrom; }
  else if (field === 'ageTo') { o.ageTo = clampAge(value, o.ageTo); if (o.ageFrom > o.ageTo) o.ageFrom = o.ageTo; }
  else if (field === 'maxFee' || field === 'maxWage') o[field] = parseMoney(value);
  return o;
}

/**
 * Akcje czysto interfejsowe sk-* (bez logiki gry). Zwraca { ui } do wpisania w state albo null (akcja nie jest interfejsowa).
 * ui: bieżący stan, view: scoutingView(game).
 */
export function skUiAction(game, ui, act, ds = {}) {
  const view = scoutingView(game);
  switch (act) {
    case 'sk-tab': return { ui: { skTab: SK_TABS.some(([k]) => k === ds.t) ? ds.t : 'misje', skMsg: null, skAsk: null } };
    case 'sk-open-order': return { ui: { skSheet: true, skOrder: defaultOrder(game, view, { scoutId: ds.scout || null, freeScoutId: ds.free || null, region: ds.region || null }), skMsg: null, skAsk: null } };
    case 'sk-repeat': {
      const m = view.missions.find((x) => x.id === ds.id);
      if (!m) return { ui: {} };
      return { ui: { skSheet: true, skOrder: orderFromMission(view, m, ds.w ? Number(ds.w) : null), skMsg: null, skAsk: null } };
    }
    case 'sk-close-order': return { ui: { skSheet: false } };
    case 'sk-set': {
      if (!ui.skOrder) return { ui: {} };
      const v = ['weeks', 'ageFrom', 'ageTo'].includes(ds.k) ? Number(ds.v) : ds.v;
      return { ui: { skOrder: { ...ui.skOrder, [ds.k]: v } } };
    }
    case 'sk-freg': return { ui: { skFilter: { ...(ui.skFilter ?? {}), reg: ds.r || 'all' } } };
    case 'sk-report': return { ui: { skReport: ds.id } };
    case 'sk-fire-ask': return { ui: { skAsk: { kind: 'fire', id: ds.id }, skMsg: null } };
    case 'sk-cancel-ask': return { ui: { skAsk: { kind: 'cancel', id: ds.id }, skMsg: null } };
    case 'sk-ask-no': return { ui: { skAsk: null } };
    default: return null;
  }
}

// ------------------------------------------------------------ Zakładka 1: skauci i misje
function heroHtml(view, away) {
  const levels = levelsOf(view.scouts);
  const pins = {};
  for (const m of view.missions) if (m.status === 'w toku') pins[m.region] = true;
  const inClub = view.scouts.filter((s) => s.status === 'w klubie').length;
  const watched = view.candidates.filter((c) => c.state === 'obserwowany').length;
  return `<section class="sk-hero" aria-labelledby="skh">
    <div>
      <h2 id="skh">Skauting zagraniczny</h2>
      <p class="sk-hero__lead">Skaut jedzie w wybrany region i wraca z listą zawodników, których nie ma na żadnej liście w grze. Im lepiej zna region, tym lepszy raport.</p>
      <div class="sk-hero__cnt">
        <div class="sk-cnt"><small>Skauci w klubie</small><span class="led">${num(view.staffSlots?.used ?? inClub)}/${num(view.staffSlots?.max)}</span></div>
        <div class="sk-cnt"><small>W podróży</small><span class="led">${away}</span></div>
        <div class="sk-cnt"><small>Nowi kandydaci</small><span class="led">${num(view.newCandidates)}</span></div>
        <div class="sk-cnt"><small>Obserwowani</small><span class="led">${watched}</span></div>
      </div>
      <div class="sk-acts"><button class="btn btn--primary" data-act="sk-open-order">Zleć wyjazd</button><button class="btn btn--quiet" data-act="sk-tab" data-t="kandydaci">Przeczytaj raport</button></div>
    </div>
    <div>${mapHtml({ dark: true, levels, pins, tileAttrs: (k) => `data-act="sk-open-order" data-region="${esc(k)}"`, cap: 'Dotknij regionu, żeby zlecić tam wyjazd.' })}
      <ul class="sk-legend" aria-label="Legenda"><li><i class="lv3"></i>ekspert</li><li><i class="lv2"></i>dobra znajomość</li><li><i class="lv1"></i>podstawowa</li><li><span class="pin"></span>skaut w podróży</li></ul></div>
  </section>`;
}

function scoutCard(s, ui, game, view) {
  const away = s.status === 'w podróży';
  const rest = s.status === 'odpoczynek';
  const k = away ? 'warn' : rest ? 'info' : 'good';
  const mis = away ? view.missions.find((m) => m.id === s.missionId) : null;
  const statTxt = away ? `w podróży${s.busyUntil ? ` do ${day(s.busyUntil)}` : ''}` : rest ? `odpoczywa${s.busyUntil ? ` do ${day(s.busyUntil)}` : ''}` : 'w klubie';
  const stat = `<span class="sk-stat" data-k="${k}"><span class="sk-tag sk-tag--dot" data-k="${k}">${statTxt}</span>${away && mis ? ` ${esc(mis.regionLabel || regionLabel(mis.region))}` : ''}</span>`;
  const asked = ui.skAsk?.kind === 'fire' && ui.skAsk.id === s.id;
  const why = away ? `Wróci ${day(s.busyUntil)}. Wcześniej nie przyjmie nowego zlecenia.` : rest ? `Odpoczywa${s.busyUntil ? ` do ${day(s.busyUntil)}` : ''}. Wcześniej nie przyjmie nowego zlecenia.` : '';
  const foot = asked
    ? `<div class="sk-ask" role="alertdialog" aria-label="Potwierdzenie zwolnienia"><p>Zwolnić skauta (${esc(s.name)})? Zwolnienie może wiązać się z odprawą.</p><div class="sk-acts"><button class="btn btn--primary" data-act="sk-fire" data-id="${esc(s.id)}">Tak, zwolnij</button><button class="btn btn--quiet" data-act="sk-ask-no">Nie</button></div></div>`
    : `<div class="sk-sc__foot"><span class="sk-wage">Pensja <b>${zl(s.wage)}</b> / mies.</span>
        <div class="sk-acts"><button class="btn btn--primary" data-act="sk-open-order" data-scout="${esc(s.id)}"${why ? ` disabled aria-describedby="sk-why-${esc(s.id)}"` : ''}>Zleć wyjazd</button><button class="btn btn--quiet" data-act="sk-fire-ask" data-id="${esc(s.id)}">Zwolnij</button></div></div>`;
  return `<article class="sk-card sk-sc" data-k="${k}" aria-label="Skaut ${esc(s.name)}">
    <div class="sk-sc__top"><span class="sk-av" aria-hidden="true">${esc(initials(s.name))}</span>
      <h4 class="sk-sc__nm">${esc(s.name)} ${natChip(s.nat)}</h4>
      <p class="sk-sc__meta">${num(s.age)} lat, skaut${s.contractUntil ? `, umowa do ${date(s.contractUntil)}` : ''}</p></div>
    ${stat}
    ${attrBars(s.attrs)}
    <div class="sk-regs" aria-label="Znane regiony">${(s.regions ?? []).map(regChip).join('') || '<span class="sk-note">Brak znanych regionów.</span>'}</div>
    ${foot}
    ${why ? `<p class="sk-note" id="sk-why-${esc(s.id)}">${why}</p>` : ''}
  </article>`;
}

function missionCard(m, game, view, ui) {
  const total = Math.max(1, daysBetween(m.start, m.end));
  const done = Math.max(0, Math.min(total, daysBetween(m.start, game.date)));
  const pct = Math.round((done / total) * 100);
  const asked = ui.skAsk?.kind === 'cancel' && ui.skAsk.id === m.id;
  const events = (m.events ?? []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  // Zasada z cancelMission: w pierwszych dniach (SCOUT.cancelDays) wraca połowa kosztu, później nic
  const early = daysBetween(m.start, game.date) < num(SCOUT?.cancelDays ?? 2);
  const back = early ? Math.round(num(m.cost) * num(SCOUT?.refund ?? 0.5)) : 0;
  const cancel = asked
    ? `<div class="sk-ask" role="alertdialog" aria-label="Potwierdzenie odwołania"><p>Odwołać wyjazd? ${early ? `Wróci połowa kosztów (${zl(back)} z ${zl(m.cost)}).` : `Poniesione koszty (${zl(m.cost)}) nie wracają.`}</p><div class="sk-acts"><button class="btn btn--primary" data-act="sk-cancel" data-id="${esc(m.id)}">Tak, odwołaj</button><button class="btn btn--quiet" data-act="sk-ask-no">Nie</button></div></div>`
    : `<div class="sk-acts"><button class="btn btn--quiet" data-act="sk-cancel-ask" data-id="${esc(m.id)}">Odwołaj wyjazd</button></div><p class="sk-note">${early ? 'Odwołanie w pierwszych 2 dniach zwraca połowę kosztów, później nic.' : 'Odwołanie nie zwraca już poniesionych kosztów.'}</p>`;
  return `<article class="sk-card sk-card--tint sk-mis" data-k="warn" aria-label="Misja w toku">
    <div class="sk-mis__top"><h4>${esc(m.scoutName)}, ${esc(m.regionLabel || regionLabel(m.region))}</h4><span class="sk-tag sk-tag--dot" data-k="warn">wraca ${date(m.end)}</span></div>
    ${profileChips(m)}
    <div class="sk-route" style="--v:${pct}"><div class="sk-route__bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-label="Postęp wyjazdu"><i></i></div>
      <div class="sk-route__ends"><span>Wyjazd <b>${day(m.start)}</b></span><span>Dzień <b>${done}</b> z ${total}</span><span>Powrót <b>${day(m.end)}</b></span></div></div>
    <div><h4 class="sk-note sk-sub">Co się działo w podróży</h4>
      <ol class="sk-log">
        <li data-future="1"><time>${day(m.end)}</time><p>Powrót i raport. Jeśli kandydaci się pojawią, trafią na listę Kandydaci.</p></li>
        ${events.map((e) => `<li data-k="${EVENT_K[e.kind] ?? 'info'}"><time>${day(e.date)}</time><p>${esc(e.text)}</p></li>`).join('')}
      </ol></div>
    ${cancel}
  </article>`;
}

function profileChips(m) {
  return `<ul class="sk-prof" aria-label="Zlecony profil"><li>${posChip(m.pos)}</li><li>${num(m.ageFrom)}-${num(m.ageTo)} lat</li><li>${esc(LEVEL_NAME[m.level] ?? m.level)}</li><li>do ${money(m.maxFee)}</li><li>pensja do ${zl(m.maxWage)}</li><li>${esc(CONTRACT_NAME[m.contract] ?? '')}</li></ul>`;
}

function misjeTab(game, view, ui) {
  const slots = view.staffSlots ?? { used: 0, max: 0 };
  const away = view.missions.filter((m) => m.status === 'w toku');
  const freeSlot = slots.used < slots.max;
  const staffFull = slots.staffFree === 0; // cały sztab pełny (z ofertami w toku): miejsce skauta jest, ale nie ma kogo przyjąć
  const recent = view.missions.filter((m) => m.status !== 'w toku').sort((a, b) => String(b.end).localeCompare(String(a.end))).slice(0, 5);
  const tag = (m) => (m.status === 'odwołana' ? '<span class="sk-tag" data-k="mute">odwołana</span>'
    : num(m.result?.n) ? `<span class="sk-tag" data-k="good">${num(m.result.n)} ${num(m.result.n) === 1 ? 'kandydat' : 'kandydatów'}</span>` : '<span class="sk-tag" data-k="mute">bez kandydatów</span>');
  const side = `<aside class="sk-side" aria-label="Stan skautingu">
    <div class="sk-card"><h4>Miejsca skautów w sztabie</h4><span class="sk-meter" role="img" aria-label="${num(slots.used)} z ${num(slots.max)}"><i style="width:${slots.max ? Math.round((num(slots.used) / slots.max) * 100) : 0}%"></i></span>
      <p class="sk-note">${num(slots.used)} z ${num(slots.max)} miejsc. Limit zależy od ligi klubu. Skautów zatrudnisz też w Trening, Sztab.${staffFull ? ` Cały sztab jest pełny (${num(slots.staffUsed)} z ${num(slots.staffLimit)} osób z ofertami w toku).` : ''}</p></div>
    <div class="sk-card"><h4>Koszty w tym sezonie</h4><dl class="sk-kv"><div><dt>Pensje skautów</dt><dd>${zl(view.costs?.wagesMonthly)} / mies.</dd></div><div><dt>Wyjazdy</dt><dd>${zl(view.costs?.tripsSeason)}</dd></div><div><dt>Prowizje</dt><dd>${zl(view.costs?.commissionsSeason)}</dd></div></dl></div>
    ${away.length ? '<div class="sk-card"><h4>Skaut w podróży</h4><p class="sk-note">Do powrotu skaut nie przyjmie nowego zlecenia. Wyniki wyjazdu zobaczysz w zakładce Kandydaci.</p></div>' : ''}
  </aside>`;
  const empty = !view.scouts.length
    ? '<div class="sk-empty-slot"><b>Nie masz skautów</b><span>Zatrudnij skauta na stałe albo zleć jednorazowy wyjazd skautowi z listy.</span><button class="btn btn--primary" data-act="sk-tab" data-t="wolni">Znajdź skauta</button></div>' : '';
  const slotCard = freeSlot && view.scouts.length
    ? (staffFull
      ? `<div class="sk-empty-slot"><b>Wolne miejsce skauta</b><span>Cały sztab jest pełny (${num(slots.staffUsed)} z ${num(slots.staffLimit)} osób, z ofertami w toku). Zwolnij kogoś, żeby zatrudnić skauta na stałe. Na jedną misję weźmiesz skauta z listy zawsze.</span><button class="btn btn--quiet" data-act="sk-tab" data-t="wolni">Skauci na zlecenie</button></div>`
      : `<div class="sk-empty-slot"><b>Wolne miejsce</b><span>Limit sztabu pozwala na jeszcze ${slots.max - slots.used === 1 ? 'jednego skauta' : `${slots.max - slots.used} skautów`}.</span><button class="btn btn--quiet" data-act="sk-tab" data-t="wolni">Znajdź skauta</button></div>`) : '';
  return `${heroHtml(view, away.length)}
  <div class="sk-grid sk-grid--side"><div class="sk-main">
    <section aria-labelledby="h-our"><div class="sk-h"><h3 id="h-our">Nasi skauci</h3><p>Pięć cech w skali 1 do 20, kreska to środek skali</p></div>
      <div class="sk-scouts">${view.scouts.map((s) => scoutCard(s, ui, game, view)).join('')}${slotCard}${empty}</div></section>
    ${away.length ? `<section aria-labelledby="h-mis"><div class="sk-h"><h3 id="h-mis">Misje w toku</h3></div><div class="sk-stack">${away.map((m) => missionCard(m, game, view, ui)).join('')}</div></section>` : ''}
    ${recent.length ? `<section aria-labelledby="h-rec"><div class="sk-h"><h3 id="h-rec">Ostatnie wyjazdy</h3></div><ul class="sk-recent">${recent.map((m) => `<li><span><b>${esc(m.scoutName)}</b>, ${esc(m.regionLabel || regionLabel(m.region))}, ${weeksTxt(num(m.weeks))}${m.status === 'odwołana' ? '' : `, wrócił ${day(m.end)}`}</span>${tag(m)}</li>`).join('')}</ul></section>` : ''}
  </div>${side}</div>`;
}

// ------------------------------------------------------------ Zakładka 2: kandydaci
function candCard(c, game, scoutName) {
  const p = game.world?.players?.[c.pid] ?? null;
  const gone = c.state === 'zniknął' || c.state === 'podpisał';
  const watched = c.state === 'obserwowany';
  const best = bestOwnAt(game, c.pos);
  const [confTxt, confK] = CONF_TXT[c.confidence] ?? CONF_TXT['średnia'];
  const price = c.free ? `Bez odstępnego<small>wolny zawodnik</small>` : `${money(c.priceRange?.[0])} do ${money(c.priceRange?.[1])}<small>odstępne, szacunek skauta</small>`;
  const wageR = `${zl(c.wageRange?.[0])} do ${zl(c.wageRange?.[1])}<small>tygodniowo</small>`;
  const nm = p ? cardLink(p) : esc(c.name);
  const offerBtn = !p || gone ? '' : `<button class="btn btn--primary" data-act="tf-open" data-id="${esc(c.pid)}">${c.free ? 'Rozmawiaj' : 'Złóż ofertę'}</button>`;
  const watchBtn = gone ? '' : `<button class="btn btn--quiet" data-act="sk-watch" data-id="${esc(c.pid)}" data-on="${watched ? 0 : 1}" aria-pressed="${watched}">${watched ? 'Przestań obserwować' : 'Obserwuj'}</button>`;
  return `<li class="sk-cand" data-flag="${c.confidence === 'niska' ? 1 : 0}" data-gone="${gone ? 1 : 0}">
    <div class="sk-cand__top"><div><h4 class="sk-cand__nm">${nm}</h4>
      <div class="sk-cand__id">${natChip(c.nat)}${posChip(c.pos)}<span>${num(c.age)} lat</span>${c.state === 'nowy' ? '<span class="sk-tag" data-k="info">nowy</span>' : ''}${num(c.injuredDays) > 0 ? `<span class="sk-tag" data-k="bad">kontuzja, ${num(c.injuredDays)} dni</span>` : ''}</div>
      <p class="sk-cand__club">${esc(c.clubLabel)}</p></div>
      <div class="sk-conf">${scoutEye('sk-eye')}<span class="sk-tag sk-tag--dot" data-k="${confK}">${esc(confTxt)}</span></div></div>
    ${gone ? `<p class="sk-gone" role="status">${esc(c.goneText || (c.state === 'podpisał' ? 'Podpisał kontrakt z innym klubem.' : 'Zniknął z rynku.'))}</p>` : ''}
    <blockquote class="sk-opinion sk-opinion--lvl">${esc(c.opinion || '')}<cite>Ocena skauta${scoutName ? `, ${esc(scoutName)}` : ''}${best ? `. Twój najlepszy ${esc(c.pos)}: ${esc(best.name)}, OVR ${Math.round(best.ovr)}` : ''}</cite></blockquote>
    <dl class="sk-facts">
      <div><dt>${c.free ? 'Cena' : 'Cena transferowa'}</dt><dd>${price}</dd></div>
      <div><dt>Oczekiwana pensja</dt><dd>${wageR}</dd></div>
      <div data-k="${WILL_K[c.willingness] ?? 'info'}"><dt>Chęć przyjścia</dt><dd>${esc(c.willingness)}</dd></div>
      <div data-k="${ADAPT_K[c.adaptation] ?? 'warn'}"><dt>Ryzyko adaptacji</dt><dd>${esc(c.adaptation)}</dd></div>
    </dl>
    ${(c.strengths?.length || c.weaknesses?.length) ? `<ul class="sk-pm" aria-label="Mocne i słabe strony">${(c.strengths ?? []).map((x) => `<li data-k="good">${esc(x)}</li>`).join('')}${(c.weaknesses ?? []).map((x) => `<li data-k="bad">${esc(x)}</li>`).join('')}</ul>` : ''}
    ${c.note ? `<blockquote class="sk-opinion">${esc(c.note)}<cite>Opinia skauta${scoutName ? `, ${esc(scoutName)}` : ''}</cite></blockquote>` : ''}
    ${(offerBtn || watchBtn) ? `<div class="sk-acts">${offerBtn}${watchBtn}</div>` : ''}
  </li>`;
}

function watchRow(c, game) {
  const p = game.world?.players?.[c.pid] ?? null;
  const gone = c.state === 'zniknął' || c.state === 'podpisał';
  const left = c.until ? Math.max(0, Math.min(8, Math.ceil(daysBetween(game.date, c.until) / 7))) : 8;
  const k = gone ? 'mute' : left <= 1 ? 'bad' : left <= 3 ? 'warn' : 'info';
  const wk = `<span class="sk-wk" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('')}</span>`;
  const exp = gone ? `<span>${esc(c.goneText || (c.state === 'podpisał' ? 'Podpisał kontrakt z innym klubem.' : 'Zniknął z rynku.'))}</span>`
    : `${wk}<span>${left === 0 ? 'Może zniknąć z rynku lada dzień' : `Może zniknąć z rynku za ${left} ${left === 1 ? 'tydzień' : 'tyg.'}`}</span>`;
  const nm = p ? cardLink(p) : esc(c.name);
  const acts = gone ? `<button class="btn btn--quiet btn--sm" data-act="sk-watch" data-id="${esc(c.pid)}" data-on="0">Usuń z listy</button>`
    : `${p ? `<button class="btn btn--primary btn--sm" data-act="tf-open" data-id="${esc(c.pid)}">${c.free ? 'Rozmawiaj' : 'Złóż ofertę'}</button>` : ''}<button class="btn btn--quiet btn--sm" data-act="sk-watch" data-id="${esc(c.pid)}" data-on="0">Przestań obserwować</button>`;
  return `<li class="sk-w" data-k="${k}" data-gone="${gone ? 1 : 0}">
    <div class="sk-w__who"><span class="sk-w__nm">${nm} ${natChip(c.nat)}${posChip(c.pos)}</span>
      <span class="sk-w__meta"><span>${num(c.age)} lat</span>${scoutEye('sk-eye')}${gone ? '' : `<span>${c.free ? '<b>wolny</b>' : `cena <b>${money(c.priceRange?.[0])} do ${money(c.priceRange?.[1])}</b>`}</span>`}<span>${esc(c.clubLabel)}</span></span></div>
    <div class="sk-w__exp">${exp}</div>
    <div class="sk-acts">${acts}</div>
  </li>`;
}

/** Powody pustego raportu: tylko te, które dotyczą zlecenia (krótki wyjazd, wymagający profil, region poza specjalnością). */
function emptyReasons(m, view) {
  const out = [];
  if (num(m.weeks) <= 1) out.push(['bad', 'Krótki wyjazd', 'Przy tygodniowym wyjeździe pusta lista jest częsta. Dłuższy wyjazd daje większą szansę.']);
  if (num(m.ageTo) <= 21 || num(m.maxFee) <= 500000) out.push(['warn', 'Wymagający profil', 'Młody, tani i dobry zawodnik jest rzadkością w każdym kraju. Poluzuj cenę albo wiek.']);
  const sc = view.scouts.find((s) => s.id === m.scoutId);
  const band = bandOf(sc, m.region);
  if (!m.freelance && band !== 'ekspert') out.push(['info', 'Region poza specjalnością skauta', band ? 'Ten skaut zna region tylko częściowo. Ekspert od regionu radzi sobie lepiej.' : 'Ten skaut nie ma tego regionu wśród znanych. Ekspert od regionu radzi sobie lepiej.']);
  if (!out.length) out.push(['info', 'Pech', 'Czasem w regionie nikt nie pasuje do profilu. Kolejny wyjazd losuje od nowa.']);
  return out.slice(0, 3);
}

const voidSvg = '<svg viewBox="0 0 150 100" aria-hidden="true"><rect x="6" y="8" width="138" height="84" rx="8" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="2" stroke-dasharray="6 5"/><line x1="75" y1="8" x2="75" y2="92" stroke="currentColor" stroke-opacity=".3" stroke-width="2"/><circle cx="75" cy="50" r="15" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="2"/><path d="M98 34c0-9 7-15 14-15s14 6 14 15c0 11-14 25-14 25S98 45 98 34z" fill="var(--led)" stroke="#8a6a1c" stroke-width="2"/><circle cx="112" cy="34" r="5" fill="#0E1511"/></svg>';

function kandydaciTab(game, view, ui) {
  const done = view.missions.filter((m) => m.status === 'zakończona').sort((a, b) => String(b.end).localeCompare(String(a.end)));
  const rep = done.find((m) => m.id === ui.skReport) ?? done[0] ?? null;
  const watchList = view.candidates.filter((c) => ['obserwowany', 'zniknął', 'podpisał'].includes(c.state));
  let head = ''; let body = '';
  if (rep) {
    const list = view.candidates.filter((c) => c.missionId === rep.id);
    const n = list.length || num(rep.result?.n);
    const chips = done.length > 1 ? `<div class="chips chips--wrap sk-rchips" role="group" aria-label="Raporty">${done.slice(0, 6).map((m) => `<button class="chip" aria-pressed="${m.id === rep.id}" data-act="sk-report" data-id="${esc(m.id)}">${day(m.end)}, ${esc(m.scoutName)}</button>`).join('')}</div>` : '';
    head = `${chips}<div class="sk-rephead"><h3>${n ? `Skaut wrócił z ${n} ${n === 1 ? 'kandydatem' : 'kandydatami'}` : 'Skaut wrócił bez kandydatów'}</h3>
      <p>${esc(rep.scoutName)}${rep.freelance ? ' (jedna misja)' : ''}, ${esc(rep.regionLabel || regionLabel(rep.region))}, wyjazd ${weeksTxt(num(rep.weeks))}, wrócił ${date(rep.end)}.</p>${profileChips(rep)}</div>`;
    const sname = rep.scoutName;
    if (n && list.length) body = `<ul class="sk-cands">${list.map((c) => candCard(c, game, sname)).join('')}</ul>`;
    else body = `<div class="sk-void" role="status">${voidSvg}
      <h3>Skaut wrócił bez kandydatów</h3>
      <p>Zdarza się. Koszty wyjazdu zostają w księgach. Kolejny wyjazd losuje od nowa, więc ten sam profil może dać inny wynik.</p>
      <ul class="sk-why" aria-label="Co mogło zawinić">${emptyReasons(rep, view).map(([k, t, d]) => `<li data-k="${k}"><i></i><span><b>${esc(t)}</b>${esc(d)}</span></li>`).join('')}</ul>
      <div class="sk-acts"><button class="btn btn--primary" data-act="sk-repeat" data-id="${esc(rep.id)}" data-w="4">Powtórz na 4 tygodnie</button><button class="btn btn--quiet" data-act="sk-repeat" data-id="${esc(rep.id)}">Zmień profil</button><button class="btn btn--quiet" data-act="sk-tab" data-t="wolni">Znajdź lepszego skauta</button></div></div>`;
  } else {
    body = `<div class="sk-void" role="status">${voidSvg}<h3>Nie masz jeszcze raportów</h3><p>Zleć wyjazd skautowi. Po jego powrocie kandydaci pojawią się tutaj.</p>
      <div class="sk-acts"><button class="btn btn--primary" data-act="sk-open-order">Zleć wyjazd</button></div></div>`;
  }
  const seen = num(view.newCandidates) > 0 ? '<div class="sk-acts"><button class="btn btn--quiet btn--sm" data-act="sk-seen">Oznacz raport jako przeczytany</button></div>' : '';
  const watch = `<section aria-labelledby="h-w"><div class="sk-h"><h3 id="h-w">Obserwowani</h3><p>Zawodnicy z raportów. Po kilku tygodniach bez działania mogą zniknąć z rynku</p></div>
    ${watchList.length ? `<ul class="sk-watch">${watchList.map((c) => watchRow(c, game)).join('')}</ul>` : '<p class="sk-empty-slot"><b>Nikogo nie obserwujesz</b><span>Dotknij Obserwuj przy kandydacie, żeby wrócić do niego później.</span></p>'}</section>`;
  return `${seen}<section class="sk-rep" aria-labelledby="h-rep"><h3 id="h-rep" class="sr">Raport skauta</h3>${head}${body}</section>${watch}`;
}

// ------------------------------------------------------------ Zakładka 3: wolni skauci
const sumAttrs = (s) => ATTRS.reduce((t, [k]) => t + attr(s.attrs, k), 0);
const inReach = (s) => s.permanentOk?.ok !== false && s.missionOk?.ok !== false;

/** Wolni skauci po filtrach i sortowaniu (region, w zasięgu klubu, klucz sortowania). */
export function filterFreeScouts(list, f = {}) {
  const sort = f.sort ?? 'sum';
  const rows = list.filter((s) => (!f.reg || f.reg === 'all' || s.regions?.some((r) => r.key === f.reg)) && (!f.reach || inReach(s)));
  const fee = (s) => num(s.missionFees?.[2] ?? Object.values(s.missionFees ?? {})[0]);
  rows.sort((a, b) => (sort === 'wage' ? num(a.wageMonthly) - num(b.wageMonthly) : sort === 'fee' ? fee(a) - fee(b)
    : ATTRS.some(([k]) => k === sort) ? attr(b.attrs, sort) - attr(a.attrs, sort) : sumAttrs(b) - sumAttrs(a)));
  return rows;
}

function wolniTab(game, view, ui) {
  const f = { reg: 'all', sort: 'sum', reach: false, ...(ui.skFilter ?? {}) };
  const rows = filterFreeScouts(view.freeScouts, f);
  const chips = `<div class="chips chips--wrap sk-rchips" role="group" aria-label="Region skauta"><button class="chip" aria-pressed="${f.reg === 'all'}" data-act="sk-freg" data-r="all">Wszystkie regiony</button>${SCOUT_REGIONS.map((r) => `<button class="chip" aria-pressed="${f.reg === r.key}" data-act="sk-freg" data-r="${esc(r.key)}">${esc(r.label)}</button>`).join('')}</div>`;
  const sel = (v, t) => `<option value="${v}"${f.sort === v ? ' selected' : ''}>${t}</option>`;
  const bar = `<div class="sk-bar">
    <label>Sortuj<select data-sk-sort>${sel('sum', 'Najwyższa ocena łączna')}${ATTRS.map(([k, n]) => sel(k, `${esc(n)}, od najwyższej`)).join('')}${sel('wage', 'Pensja, od najniższej')}${sel('fee', 'Koszt misji, od najniższego')}</select></label>
    <label class="sk-check"><input type="checkbox" data-sk-reach${f.reach ? ' checked' : ''}> Tylko w zasięgu klubu</label>
    <p class="sk-note sk-note--mid">${view.refreshDate ? `Lista odświeża się ${date(view.refreshDate)}.` : ''}</p></div>`;
  const row = (s) => {
    const permLock = s.permanentOk?.ok === false; const misLock = s.missionOk?.ok === false;
    const lockTxt = [permLock ? s.permanentOk.text : '', misLock ? s.missionOk.text : ''].filter(Boolean);
    const fees = Object.entries(s.missionFees ?? {}).sort((a, b) => a[0] - b[0]);
    const minFee = fees.length ? Math.min(...fees.map(([, v]) => num(v))) : 0;
    return `<li class="sk-row" data-lock="${permLock || misLock ? 1 : 0}" aria-label="Skaut ${esc(s.name)}">
      <div class="sk-row__id"><span class="sk-row__nm">${esc(s.name)} ${natChip(s.nat)}</span><span class="sk-row__meta">${num(s.age)} lat, bez klubu</span></div>
      <div class="sk-regs sk-row__reg">${(s.regions ?? []).map(regChip).join('')}</div>
      <div class="sk-cells" role="group" aria-label="Cechy">${ATTRS.map(([k, n, sh]) => `<span class="sk-cell" data-b="${bClass(attr(s.attrs, k))}" title="${esc(n)}"><b>${attr(s.attrs, k)}</b><small>${esc(sh)}</small></span>`).join('')}</div>
      <dl class="sk-cost"><div><dt>Na stałe</dt><dd>${zl(s.wageMonthly)}<small> / mies.</small></dd></div><div><dt>Jedna misja</dt><dd>od ${zl(minFee)}<small> + ${num(s.commissionPct)} %</small></dd></div></dl>
      <div class="sk-acts"><button class="btn btn--primary" data-act="sk-hire" data-id="${esc(s.id)}"${permLock ? ' disabled' : ''}>Zatrudnij na stałe</button><button class="btn btn--quiet" data-act="sk-open-order" data-free="${esc(s.id)}"${misLock ? ' disabled' : ''}>Na jedną misję</button></div>
      ${lockTxt.length ? `<p class="sk-lock"><span class="sk-tag" data-k="bad">poza zasięgiem klubu</span>${lockTxt.map(esc).join(' ')}</p>` : ''}
    </li>`;
  };
  return `<div><div class="sk-h"><h3>Skauci do zatrudnienia</h3><p>Pokazano ${rows.length} z ${view.freeScouts.length}</p></div></div>
    ${chips}${bar}
    <div class="sk-sorthead" aria-hidden="true"><span>Skaut</span><span>Regiony</span><span class="c">Cechy: doświadczenie, ocena, rynek, sieć, charakter</span><span>Na stałe</span><span>Jedna misja</span><span></span></div>
    ${rows.length ? `<ul class="sk-list">${rows.map(row).join('')}</ul>` : '<p class="sk-empty-slot"><b>Nikt nie pasuje do filtrów</b><span>Zdejmij filtr regionu albo zasięgu klubu.</span></p>'}
    <p class="sk-note">Zlecenie jednorazowe: opłata z góry zależy od jakości skauta i długości wyjazdu, a prowizja jest płatna dopiero przy podpisaniu znalezionego zawodnika.</p>`;
}

// ------------------------------------------------------------ Arkusz zlecenia
const fmtIntSp = (n) => String(Math.round(num(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const fitOf = (band) => (band === 'ekspert' ? ['good', 'ekspert od tego regionu'] : band === 'dobra' ? ['good', 'dobrze zna region'] : band === 'podstawowa' ? ['warn', 'zna region podstawowo'] : ['bad', 'poza regionami skauta']);

function safeQuote(game, order) {
  try { return missionQuote(game, order); } catch { return { ok: false, text: 'Nie udało się wycenić zlecenia.', cost: 0, returnDate: null, chance: 'niska', expected: '', reasons: [] }; }
}

/** Arkusz zlecenia: formularz po lewej, podsumowanie z wyceną na żywo po prawej (na telefonie przyklejone u dołu). */
export function orderSheetHtml(game, view, ui, quote = safeQuote) {
  const o = ui.skOrder;
  if (!o) return '';
  const own = o.scoutId ? view.scouts.find((s) => s.id === o.scoutId) : null;
  const free = o.freeScoutId ? view.freeScouts.find((s) => s.id === o.freeScoutId) : null;
  const sc = own ?? free;
  const q = quote(game, o);
  const regs = sc?.regions ?? [];
  const band = bandOf(sc, o.region);
  const [fitK, fitWord] = fitOf(band);
  const name = sc?.name ?? 'Skaut';
  const opts = view.scouts.map((s) => {
    const busy = s.status !== 'w klubie';
    return `<option value="s:${esc(s.id)}"${busy ? ' disabled' : ''}${own?.id === s.id ? ' selected' : ''}>${esc(s.name)}${busy ? `, ${s.status === 'w podróży' ? 'wraca' : 'wolny od'} ${day(s.busyUntil)}` : ', w klubie'}</option>`;
  }).join('') + (free ? `<option value="f:${esc(free.id)}" selected>${esc(free.name)}, na jedną misję</option>` : '');
  const wopt = WEEKS.map((w) => {
    const qw = quote(game, { ...o, weeks: w });
    return `<button type="button" class="sk-wk4" role="radio" aria-checked="${o.weeks === w}" data-act="sk-set" data-k="weeks" data-v="${w}"><b>${w}<small>${weeksShort(w)}</small></b><span>${zl(qw.cost)}</span><span class="sk-tag sk-tag--dot" data-k="${CHANCE_K[qw.chance] ?? 'warn'}">szansa ${esc(qw.chance)}</span></button>`;
  }).join('');
  const k = CHANCE_K[q.chance] ?? 'warn';
  const reg = regionOf(o.region);
  const fitText = sc
    ? `<b>Dopasowanie: ${fitWord}.</b> Cechy: doświadczenie ${attr(sc.attrs, 'dos')}, sieć kontaktów ${attr(sc.attrs, 'sie')}, ocena zawodnika ${attr(sc.attrs, 'oce')}.`
    : '<b>Wybierz skauta.</b>';
  const pill = (act, key, val, cur, label) => `<button type="button" aria-pressed="${cur === val}" data-act="${act}" data-k="${key}" data-v="${esc(val)}">${esc(label)}</button>`;
  const radio = (key, cur, items) => items.map(([v, t, d]) => `<button type="button" class="sk-opt" role="radio" aria-checked="${cur === v}" data-act="sk-set" data-k="${key}" data-v="${v}"><b>${esc(t)}</b><span>${esc(d)}</span></button>`).join('');
  return `<div class="sk sk-sheetroot"><div class="sk-scrim" data-act="sk-close-order"></div>
  <section class="sk-sheet" role="dialog" aria-modal="true" aria-labelledby="sk-sh-t">
    <div class="sk-sheet__head"><div><h3 id="sk-sh-t" tabindex="-1">Zleć wyjazd</h3><p>Wynik zależy od skauta i od losu. Powtórzone zlecenie losuje od nowa.</p></div><button type="button" class="sk-x" data-act="sk-close-order" aria-label="Zamknij"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16"/></svg></button></div>
    <div class="sk-sheet__body"><form class="sk-form" onsubmit="return false">
      <fieldset class="sk-fs"><legend>Skaut</legend>
        <label><span class="sr">Skaut</span><select data-sk-f="scout">${opts || '<option value="">Brak skautów</option>'}</select></label>
        <p class="sk-fit" data-k="${fitK}">${fitText}</p></fieldset>
      <fieldset class="sk-fs"><legend>Region</legend>
        ${mapHtml({ levels: levelsOf(sc ? [sc] : []), sel: o.region, tileAttrs: (key) => `data-act="sk-set" data-k="region" data-v="${esc(key)}"`, cap: `Wybrano: <b>${esc(reg?.label ?? o.region)}</b>. Zielone pola to regiony znane skautowi.` })}</fieldset>
      <fieldset class="sk-fs"><legend>Kogo szukamy</legend>
        <div class="sk-pos" role="group" aria-label="Pozycja">${POSITIONS.map((p) => pill('sk-set', 'pos', p, o.pos, p)).join('')}</div>
        <div class="sk-two"><label>Wiek od<input type="number" inputmode="numeric" min="16" max="45" value="${num(o.ageFrom)}" data-sk-f="ageFrom"></label><label>Wiek do<input type="number" inputmode="numeric" min="16" max="45" value="${num(o.ageTo)}" data-sk-f="ageTo"></label></div>
        <div class="sk-opts sk-opts--3" role="radiogroup" aria-label="Poziom">${radio('level', o.level, LEVELS)}</div></fieldset>
      <fieldset class="sk-fs"><legend>Pieniądze i umowa</legend>
        <div class="sk-two"><label>Maksymalna kwota transferu, zł<input type="text" inputmode="numeric" value="${fmtIntSp(o.maxFee)}" data-sk-f="maxFee"></label><label>Maksymalna pensja, zł tygodniowo<input type="text" inputmode="numeric" value="${fmtIntSp(o.maxWage)}" data-sk-f="maxWage"></label></div>
        <div class="sk-opts sk-opts--3" role="radiogroup" aria-label="Status zawodnika">${radio('contract', o.contract, CONTRACTS)}</div></fieldset>
      <fieldset class="sk-fs"><legend>Czas wyjazdu <small>Dłuższy kosztuje więcej, ale daje większą szansę i więcej kandydatów</small></legend>
        <div class="sk-weeks" role="radiogroup" aria-label="Czas wyjazdu">${wopt}</div></fieldset>
    </form>
    <aside class="sk-sum" aria-label="Podsumowanie zlecenia" aria-live="polite">
      <h4>${esc(name)} jedzie: ${esc(reg?.label ?? o.region)}</h4>
      ${q.ok ? `<div class="sk-chance" data-k="${k}"><div class="sk-chance__w"><span>Szansa na kandydatów: ${esc(q.chance)}</span>${q.expected ? `<small>zwykle ${esc(expectedTxt(q.expected))}</small>` : ''}</div><div class="sk-chance__seg" aria-hidden="true"><i class="on"></i><i class="${q.chance !== 'niska' ? 'on' : ''}"></i><i class="${q.chance === 'wysoka' ? 'on' : ''}"></i></div></div>
      <dl class="sk-kv"><div><dt>Koszt wyjazdu</dt><dd>${zl(q.cost)}</dd></div><div><dt>Wraca</dt><dd>${date(q.returnDate)}</dd></div></dl>
      ${q.reasons?.length ? `<ul class="sk-because">${q.reasons.slice(0, 3).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      <p class="sk-note-bot">Skaut jest nieobecny w klubie przez cały wyjazd. Koszt płatny od razu. Odwołanie w pierwszych 2 dniach zwraca połowę, później nic.</p>`
    : `<p class="sk-fit" data-k="bad" role="alert"><b>${esc(q.text || 'Zlecenie jest niepełne.')}</b></p>`}
      ${ui.skMsg ? `<p class="sk-fit" data-k="bad" role="alert"><b>${esc(ui.skMsg)}</b></p>` : ''}
      <div class="sk-acts"><button type="button" class="btn btn--primary" data-act="sk-start"${q.ok ? '' : ' disabled'}>Zleć wyjazd</button><button type="button" class="btn btn--quiet" data-act="sk-close-order">Anuluj</button></div>
    </aside></div>
  </section></div>`;
}

// ------------------------------------------------------------ Wejście
/** Liczby do znaczników zakładek: [skauci, kandydaci (nowi albo aktualni), wolni]. */
function tabCounts(view) {
  const live = view.candidates.filter((c) => c.state === 'nowy' || c.state === 'obserwowany').length;
  return { misje: view.scouts.length, kandydaci: num(view.newCandidates) || live, wolni: view.freeScouts.length };
}

/** Ekran Skauting (zawartość zakładki w Transferach). ui: state gry z polami sk*; view i quote do podmiany w testach. */
export function renderSkauting(game, ui = {}, { view = scoutingView(game), quote = safeQuote } = {}) {
  const tab = SK_TABS.some(([k]) => k === ui.skTab) ? ui.skTab : 'misje';
  const cnt = tabCounts(view);
  const tabs = `<div class="sk-seg" role="tablist" aria-label="Skauting">${SK_TABS.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-act="sk-tab" data-t="${k}"${k === 'kandydaci' && num(view.newCandidates) > 0 ? ' data-new="1"' : ''}>${esc(l)}${cnt[k] ? ` <small>${cnt[k]}</small>` : ''}</button>`).join('')}</div>`;
  const msg = ui.skMsg ? `<p class="sk-msg" role="status">${esc(ui.skMsg)}</p>` : '';
  const body = tab === 'kandydaci' ? kandydaciTab(game, view, ui) : tab === 'wolni' ? wolniTab(game, view, ui) : misjeTab(game, view, ui);
  const sheet = ui.skSheet && ui.skOrder ? orderSheetHtml(game, view, ui, quote) : '';
  return `<div class="sk">${tabs}${msg}${body}</div>${sheet}`;
}
