// Terminarz drużyny gracza: panel na Pulpicie (ostatnie wyniki, dzisiejsza kreska, najbliższe mecze) i pełny ekran
// z filtrami rozgrywek i miejsca meczu oraz przełącznikiem sezonów (historia z src/season/history.js).
// Każdy mecz ma znacznik rozgrywek (kolor = rodzaj rozgrywek), znacznik miejsca (kształt: pełny = u siebie,
// obrys = wyjazd, przerywany obrys = teren neutralny), wynik z perspektywy drużyny gracza i kartonik W/R/P.
import { CLUBS_PL } from '../data/clubs_pl.js';
import { PP_NAMES } from '../season/cup.js';
import { UCOMP_NAMES } from '../season/uefa.js';
import { anyClub, compLabel } from '../season/season.js';
import { teamFixtures, historySeasons, recordOf, ensureHistory } from '../season/history.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate, weekday } from './dom.js';

const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));

/** Rodzaj rozgrywek do filtra i koloru znacznika. */
export function compKind(row) {
  const c = row.c;
  if (c === 'ekstraklasa' || c === 'liga1' || c === 'liga2') return 'liga';
  if (c?.startsWith('playoff')) return 'baraze';
  if (c === 'pp') return 'pp';
  if (c === 'super') return 'super';
  if (c === 'uefa') return 'uefa';
  if (c === 'friendly') return 'friendly';
  return 'other';
}
export const KIND_LABELS = { liga: 'Liga', baraze: 'Baraże', pp: 'Puchar Polski', super: 'Superpuchar', uefa: 'Puchary europejskie', friendly: 'Sparingi', other: 'Inne' };
const KIND_ORDER = ['liga', 'baraze', 'pp', 'super', 'uefa', 'friendly', 'other'];
const SHORT = { ekstraklasa: 'Ekstr.', liga1: '1 Liga', liga2: '2 Liga', pp: 'PP', super: 'Superp.', friendly: 'Sparing' };
export const VENUES = [['H', 'U siebie'], ['A', 'Wyjazd'], ['N', 'Neutralny']];
const VENUE_LABEL = Object.fromEntries(VENUES);
const RES_WORD = { W: 'Wygrana', R: 'Remis', P: 'Porażka' };

const name = (id) => (id ? anyClub(id)?.name ?? 'Rywal' : 'Rywal z losowania');
const crest = (id, size) => { const c = id ? anyClub(id) : null; return c ? crestHtml(c, { size, clubsById }) : `<span class="fx-tbd" style="--s:${size}px" aria-hidden="true"></span>`; };
const mon = (iso) => fmtDate(iso).split(' ')[0];
const dayNum = (iso) => Number(iso.slice(8, 10));
const wd = (iso) => weekday(iso).slice(0, 3);

/** Etykieta meczu (rozgrywki i runda) z wiersza historii. */
export function rowLabel(row) {
  return compLabel({ comp: row.c, round: row.r, label: row.lb });
}
function shortTag(row) {
  if (row.c === 'uefa') return row.u === 'LK' ? 'LKE' : (row.u ?? 'UEFA');
  if (row.c?.startsWith('playoff')) return 'Baraż';
  return SHORT[row.c] ?? row.c;
}
function tagFull(row) {
  if (row.c === 'uefa') return UCOMP_NAMES[row.u] ?? 'Puchary europejskie';
  if (row.c === 'pp') return `Puchar Polski${row.r && PP_NAMES[row.r] ? `, ${PP_NAMES[row.r]}` : ''}`;
  return rowLabel(row);
}
/** Krótszy opis rundy pod nazwą rywala (bez nazwy rozgrywek, którą niesie znacznik). */
function roundText(row) {
  const label = rowLabel(row);
  if (row.c === 'friendly') return 'Mecz towarzyski';
  if (['ekstraklasa', 'liga1', 'liga2'].includes(row.c)) return `${row.r}. kolejka`;
  return label.replace(/^[^,]+,\s*/, '');
}

export const compTag = (row) => `<span class="ctag" data-k="${compKind(row)}" title="${esc(tagFull(row))}">${esc(shortTag(row))}</span>`;
export const venueTag = (v) => `<span class="vtag" data-v="${v}">${esc(VENUE_LABEL[v])}</span>`;
const resChip = (r) => `<span class="rchip" data-r="${r}" title="${RES_WORD[r]}"><span aria-hidden="true">${r}</span><span class="sr">${RES_WORD[r]}</span></span>`;

function endCell(r) {
  if (!r.played) {
    return `<span class="fxr__end fxr__end--plan">${r.t ? `<span class="fxr__time">${esc(r.t)}</span>` : ''}${r.post ? '<small>przełożony</small>' : ''}</span><span class="rchip" data-r="" aria-hidden="true"></span>`;
  }
  const dec = r.decider ? `<small class="fxr__dec" data-won="${r.decider.won ? 1 : 0}">${esc(r.decider.text)}</small>` : '';
  return `<span class="fxr__end"><span class="fxr__score" aria-label="Wynik ${r.gf}:${r.ga}">${r.gf}:${r.ga}</span>${dec}</span>${resChip(r.res)}`;
}

function rowHtml(r, { wide = false, today = '', extra = false } = {}) {
  const isToday = r.d === today;
  const meta = wide
    ? `<span class="fxr__meta">${compTag(r)}<small>${esc(roundText(r))}</small>${venueTag(r.venue)}</span>`
    : '';
  return `<li class="fxr${wide ? ' fxr--wide' : ''}${r.played ? ' is-played' : ''}${isToday ? ' is-today' : ''}${extra ? ' fxr--x' : ''}" data-venue="${r.venue}">
    <span class="fxr__day" aria-label="${esc(`${weekday(r.d)}, ${fmtDate(r.d)}`)}"><b>${dayNum(r.d)}</b><small>${esc(mon(r.d))}${wide ? `<span class="fxr__wd"> ${esc(wd(r.d))}</span>` : ''}</small></span>
    ${meta}
    <span class="fxr__opp">${crest(r.opp, wide ? 26 : 22)}<span class="fxr__who"><b>${esc(name(r.opp))}</b>${wide ? '' : `<span class="fxr__tags">${compTag(r)}${venueTag(r.venue)}</span>`}</span></span>
    ${endCell(r)}
  </li>`;
}
const todayLine = (today) => `<li class="fxr-now" aria-label="Dziś, ${esc(fmtDate(today))}"><span aria-hidden="true">Dziś, ${esc(mon(today))} ${dayNum(today)}</span></li>`;

// ------------------------------------------------------------ Panel na Pulpicie
/**
 * Treść panelu „Terminarz”: 3 ostatnie wyniki, kreska „dziś”, 5 najbliższych meczów. Dodatkowe wiersze
 * (do 5 wyników i 8 meczów, klasa fxr--x) pokazuje CSS, gdy panel zajmuje na Pulpicie dwa rzędy siatki.
 */
export function fixturesPanelBody(game, { past = 3, next = 5, morePast = 2, moreNext = 3 } = {}) {
  ensureHistory(game);
  const rows = teamFixtures(game);
  const played = rows.filter((r) => r.played);
  const plan = rows.filter((r) => !r.played);
  const head = played.slice(-(past + morePast));
  const tail = plan.slice(0, next + moreNext);
  const xPast = Math.max(0, head.length - past);
  if (!head.length && !tail.length) return '<p class="dash-note">Brak meczów w tym sezonie. Terminarz pojawi się po losowaniu albo w nowym sezonie.</p>';
  const rec = recordOf(played);
  const list = [
    ...head.map((r, i) => rowHtml(r, { today: game.date, extra: i < xPast })),
    todayLine(game.date),
    ...tail.map((r, i) => rowHtml(r, { today: game.date, extra: i >= next })),
  ].join('');
  const sum = rec.n
    ? `${rec.n} ${rec.n === 1 ? 'mecz' : rec.n % 10 >= 2 && rec.n % 10 <= 4 && (rec.n % 100 < 12 || rec.n % 100 > 14) ? 'mecze' : 'meczów'} w sezonie: ${rec.w} W, ${rec.d} R, ${rec.l} P, bramki ${rec.gf}:${rec.ga}. ${plan.length ? `Do rozegrania: ${plan.length}.` : ''}`
    : `Sezon przed pierwszym meczem. W terminarzu: ${plan.length}.`;
  return `<ol class="fxc" aria-label="Ostatnie i najbliższe mecze">${list}</ol>
    <p class="dash-note fxc__sum">${esc(sum.trim())}</p>`;
}

// ------------------------------------------------------------ Pełny ekran
function countBy(rows, key) {
  const m = new Map();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return m;
}

function splitTable(rows) {
  const line = (label, list, k) => {
    const r = recordOf(list);
    const plan = list.filter((x) => !x.played).length;
    return `<tr${k ? ` data-v="${k}"` : ''}><th scope="row">${k ? venueTag(k) : esc(label)}</th><td>${r.n}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}:${r.ga}</td><td class="w">${plan || ''}</td></tr>`;
  };
  return `<table class="fxs-split">
    <caption class="sr">Bilans według miejsca meczu</caption>
    <thead><tr><th scope="col"><span class="sr">Miejsce</span></th><th scope="col"><abbr title="Mecze rozegrane">M</abbr></th><th scope="col"><abbr title="Wygrane">W</abbr></th><th scope="col"><abbr title="Remisy">R</abbr></th><th scope="col"><abbr title="Porażki">P</abbr></th><th scope="col">Bramki</th><th scope="col" class="w">Do gry</th></tr></thead>
    <tbody>${VENUES.filter(([k]) => k !== 'N' || rows.some((r) => r.venue === k)).map(([k]) => line('', rows.filter((r) => r.venue === k), k)).join('')}</tbody>
    <tfoot>${line('Razem', rows, null)}</tfoot>
  </table>`;
}

/**
 * Ekran „Terminarz i wyniki”. ui: { season, comp: 'all' | rodzaj, venue: 'all' | H | A | N }.
 * Akcje: fxback, fxseason (data-s), fxcomp (data-k), fxvenue (data-v).
 */
export function renderFixtures(game, ui = {}) {
  ensureHistory(game);
  const seasons = historySeasons(game);
  const season = seasons.includes(ui.season) ? ui.season : seasons[0];
  const current = season === seasons[0];
  const all = teamFixtures(game, season);
  const kinds = countBy(all, compKind);
  const comp = ui.comp && ui.comp !== 'all' && kinds.has(ui.comp) ? ui.comp : 'all';
  const byComp = comp === 'all' ? all : all.filter((r) => compKind(r) === comp);
  const venues = countBy(byComp, (r) => r.venue);
  const venue = ui.venue && ui.venue !== 'all' && venues.has(ui.venue) ? ui.venue : 'all';
  const rows = venue === 'all' ? byComp : byComp.filter((r) => r.venue === venue);

  const chip = (act, attr, v, label, n, on) => `<button class="chip" data-act="${act}" data-${attr}="${esc(v)}" aria-pressed="${on}">${esc(label)}${n != null ? ` <small>${n}</small>` : ''}</button>`;
  const seasonChips = seasons.map((s, i) => chip('fxseason', 's', s, i === 0 ? `${s} (bieżący)` : s, null, s === season)).join('');
  const compChips = [chip('fxcomp', 'k', 'all', 'Wszystkie', all.length, comp === 'all'), ...KIND_ORDER.filter((k) => kinds.has(k)).map((k) => chip('fxcomp', 'k', k, KIND_LABELS[k], kinds.get(k), comp === k))].join('');
  const venueChips = [chip('fxvenue', 'v', 'all', 'Wszędzie', byComp.length, venue === 'all'), ...VENUES.filter(([k]) => venues.has(k)).map(([k, l]) => chip('fxvenue', 'v', k, l, venues.get(k), venue === k))].join('');

  // Lista z nagłówkami miesięcy i kreską „dziś” w bieżącym sezonie
  let html = ''; let month = ''; let nowDone = !current;
  for (const r of rows) {
    if (!nowDone && !r.played && r.d >= game.date) { html += todayLine(game.date); nowDone = true; }
    const m = r.d.slice(0, 7);
    if (m !== month) { month = m; html += `<li class="fxs-month"><h3>${esc(mon(r.d))} ${r.d.slice(0, 4)}</h3></li>`; }
    html += rowHtml(r, { wide: true, today: current ? game.date : '' });
  }
  if (!nowDone && rows.length) html += todayLine(game.date);
  const meName = rows.find((r) => r.me)?.me;
  const clubs = [...new Set(all.map((r) => r.me))];
  const empty = current ? 'Brak meczów spełniających warunki. Zmień filtr rozgrywek albo miejsca.' : 'W tym sezonie nie zapisano meczów.';
  return `<div class="fxs">
    <button class="btn btn--quiet" data-act="fxback">Wróć do pulpitu</button>
    <div class="fxs__head">
      <h2>Terminarz i wyniki</h2>
      <p class="muted">${clubs.length > 1 ? `Mecze prowadzonych drużyn: ${esc(clubs.map(name).join(', '))}` : esc(name(meName ?? game.clubId))}, sezon ${esc(season)}</p>
    </div>
    <div class="fxs__bar">
      <div class="fxs__filters">
        <div class="chips chips--sm chips--wrap" role="group" aria-label="Sezon">${seasonChips}</div>
        <div class="chips chips--sm chips--wrap" role="group" aria-label="Rozgrywki">${compChips}</div>
        <div class="chips chips--sm chips--wrap" role="group" aria-label="Miejsce meczu">${venueChips}</div>
      </div>
      <section class="fxs__sum" aria-label="Bilans">${splitTable(byComp)}</section>
    </div>
    ${rows.length ? `<ol class="fxs__list" aria-label="Mecze">${html}</ol>` : `<p class="panel">${esc(empty)}</p>`}
  </div>`;
}
