// Edytor gry (Opcje, Edytor): zakładki Kluby, Zawodnicy i Datapack. Logika i walidacja: src/career/editor.js.
// Na PC lista po lewej i formularz po prawej, na telefonie jedna kolumna: lista, potem formularz z przyciskiem Wróć.
// Akcje data-act zaczynają się od "ed-"; app.js przekazuje je do handleEditorAction (bez DOM poza odczytem pól).

import { CLUBS_PL, LEAGUE_NAMES, leagueLabel } from '../data/clubs_pl.js';
import { CLUBS_L3 } from '../data/clubs_l3.js';
import { ATTRS, ATTR_GROUPS, POS_NAMES } from '../data/attributes.js';
import { NAT_NAMES } from '../data/names.js';
import { GROUP } from '../career/squad.js';
import { fmtZl } from '../career/transfers.js';
import { poolClubLabel } from '../career/foreignPool.js';
import { ageAt } from '../training/state.js';
import { squadOf } from '../world/worldGen.js';
import {
  LIMITS, checkClub, checkPlayer, editClub, editPlayer, clubValues, playerValues, resetClub, resetPlayer, clearPack,
  packCounts, originalOf, peopleValues, checkCoach, checkOwner, checkStaff, editCoach, editOwner, editStaff,
  OWNER_LABELS, PERSON_AGE, ALT_MAX, ALT_POSITIONS,
  EDIT_SQUAD, squadSize, releaseBlock, releaseToFree, joinFromFree, freeAgents, checkNewPlayer, createFreePlayer, NEW_LEVEL,
  REF_LIMITS, refValues, checkReferee, editReferee, INJURY_LIST, INJ_DAYS_MAX, rivalsOf, editRival, RIVALS_MAX,
} from '../career/editor.js';
import { REF_ATTRS } from '../career/referees.js';
import { proficiency } from '../engine/positions.js';
import { COACH_KEYS, COACH_ATTRS, COACH_STYLES } from '../career/coaches.js';
import { OWNER_KEYS } from '../career/owners.js';
import { STAFF_ROLE_ORDER } from '../career/staffMarket.js';
import { STAFF_ROLES, ROLE_ATTRS } from '../training/config.js';
import { roleAttrKeys, qFromAttrs } from '../training/staff.js';
import { crestHtml } from './crest.js';
import { esc } from './dom.js';

export const LIST_CAP = 100;
const POS_ORDER = Object.keys(POS_NAMES);
const clubObj = (id) => CLUBS_PL.find((c) => c.id === id) ?? CLUBS_L3.find((c) => c.id === id) ?? null;
const crest = (c, size = 24) => (c ? crestHtml(c, { size }) : '');
const fold = (s) => String(s ?? '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
const leagueOf = (c) => (c?.tier <= 4 ? leagueLabel(c) : 'IV liga');

export const newEditorState = () => ({ tab: 'clubs', tier: 1, q: '', club: null, cplayer: null, player: null, pq: '', pclub: 'all', ppos: 'all', msg: null, errors: null, draft: null, confirmClear: false, addTo: null, fq: '', newp: false, ref: null, rl: 1, rq: '' });
export const isEditorAction = (act) => typeof act === 'string' && act.startsWith('ed-');

/** Kluby z kadrą w świecie gry, w kolejności lig i z danych. */
export function editorClubs(game) {
  return Object.keys(game.world?.clubs ?? {}).map(clubObj).filter(Boolean)
    .sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || CLUBS_PL.indexOf(a) - CLUBS_PL.indexOf(b));
}

// ------------------------------------------------------------ Listy
export function clubListHtml(game, ed) {
  const q = fold(ed.q);
  const all = editorClubs(game);
  const rows = all.filter((c) => (ed.tier === 'all' || c.tier === ed.tier) && (!q || fold(c.name).includes(q) || fold(c.short).includes(q)));
  if (!rows.length) return '<p class="ed-empty">Brak klubów dla tego filtra.</p>';
  return `<ul class="ed-list">${rows.map((c) => `<li><button class="ed-row" data-act="ed-club" data-id="${esc(c.id)}" aria-current="${ed.club === c.id ? 'true' : 'false'}">
    ${crest(c, 24)}<span class="ed-row__main"><b>${esc(c.name)}</b><small>${esc(leagueOf(c))}${game.editor?.clubs?.[c.id] ? ', zmieniony' : ''}</small></span></button></li>`).join('')}</ul>`;
}

/** Wyniki wyszukiwania zawodników (najwyżej LIST_CAP, od najwyższego OVR). */
export function findPlayers(game, { q = '', club = 'all', pos = 'all' } = {}, cap = LIST_CAP) {
  const f = fold(q.trim());
  const all = Object.values(game.world?.players ?? {}).filter((p) => p
    && (club === 'all' || (club === 'none' ? !p.clubId : p.clubId === club))
    && (pos === 'all' || p.pos === pos)
    && (!f || fold(p.name).includes(f)));
  all.sort((a, b) => b.ovr - a.ovr || String(a.name).localeCompare(String(b.name), 'pl'));
  return { total: all.length, rows: all.slice(0, cap) };
}

const clubLabel = (p) => (p.clubId ? clubObj(p.clubId)?.name ?? p.clubId : p.abroad ? poolClubLabel(p) : 'wolny zawodnik');
const posBadge = (p) => `<span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span>`;
const ovrTxt = (n) => String(n ?? '').replace('.', ',');

function playerRows(game, players, act, current) {
  return `<ul class="ed-list">${players.map((p) => `<li><button class="ed-row" data-act="${act}" data-id="${esc(p.id)}" aria-current="${current === p.id ? 'true' : 'false'}">
    ${posBadge(p)}<span class="ed-row__main"><b>${esc(p.name)}</b><small>${esc(clubLabel(p))}, ${ageAt(p, game.date)} lat${game.editor?.players?.[p.id] ? ', zmieniony' : ''}</small></span><span class="ed-row__ovr" title="Ocena ogólna">${ovrTxt(p.ovr)}</span></button></li>`).join('')}</ul>`;
}

export function playerListHtml(game, ed) {
  const { total, rows } = findPlayers(game, { q: ed.pq, club: ed.pclub, pos: ed.ppos });
  if (!rows.length) return '<p class="ed-empty">Nikt nie pasuje do wyszukiwania.</p>';
  return `<p class="ed-count">${total > rows.length ? `Pokazano ${rows.length} z ${total}. Zawęź wyszukiwanie.` : `Znaleziono: ${total}.`}</p>${playerRows(game, rows, 'ed-player', ed.player)}`;
}

/** Karta zawodnika: kontuzja (rodzaj z listy silnika meczu i dni do powrotu). */
const CAT_LABEL = { light: 'Lekkie', medium: 'Średnie', severe: 'Ciężkie' };
function healthHtml(v, e) {
  const inj = v.injury ?? null;
  const known = INJURY_LIST.some((t) => t.name === inj?.name);
  const opts = Object.keys(CAT_LABEL).map((cat) => `<optgroup label="${CAT_LABEL[cat]}">${INJURY_LIST.filter((t) => t.cat === cat).map((t) => `<option value="${esc(t.name)}"${inj?.name === t.name ? ' selected' : ''}>${esc(t.name)} (${t.lo}-${t.hi} dni${t.playable ? ', gra z bólem' : ''})</option>`).join('')}</optgroup>`).join('');
  return `<fieldset class="ed-attrs"><legend>Zdrowie</legend>${e.injury ? `<p class="ed-msg is-bad">${esc(e.injury)}</p>` : ''}<div class="ed-grid">
    ${field('ed-inj', 'Kontuzja', `<select id="ed-inj"><option value="">Zdrowy</option>${inj && !known ? `<option value="${esc(inj.name)}" selected>${esc(inj.name)}</option>` : ''}${opts}</select>`)}
    ${field('ed-inj-days', 'Dni do powrotu', `<input id="ed-inj-days" type="number" min="1" max="${INJ_DAYS_MAX}" step="1" inputmode="numeric" value="${esc(inj?.days ?? '')}"${e.injury ? ' aria-invalid="true"' : ''}>`, { help: `Od 1 do ${INJ_DAYS_MAX}. Puste przy wybranej kontuzji: środek zakresu dni. Lekkie urazy pozwalają grać z bólem.` })}
  </div></fieldset>`;
}

/** Karta zawodnika: przeniesienie z kadry do wolnych albo wolnego do kadry wybranego klubu. */
function squadMoveHtml(game, p) {
  if (p.clubId && game.world.clubs[p.clubId]) {
    const why = releaseBlock(game, p.id);
    return `<section class="ed-move" aria-label="Kadra"><h3>Kadra</h3>
      <div class="ed-actions"><button class="btn btn--quiet" data-act="ed-release" data-id="${esc(p.id)}"${why ? ' disabled' : ''}>Przenieś do wolnych zawodników</button></div>
      <p class="fld__help">${esc(why || `Zawodnik odchodzi bez kosztów i trafia na listę wolnych. Kadra: od ${EDIT_SQUAD.min} do ${EDIT_SQUAD.max} zawodników.`)}</p></section>`;
  }
  if (!p.clubId && game.market?.free?.includes(p.id)) {
    const clubs = editorClubs(game).filter((c) => squadSize(game, c.id) < EDIT_SQUAD.max);
    return `<section class="ed-move" aria-label="Kadra"><h3>Kadra</h3>
      <div class="ed-move__row"><select id="ed-joinclub" aria-label="Klub">${clubs.map((c) => `<option value="${esc(c.id)}"${c.id === game.clubId ? ' selected' : ''}>${esc(c.name)} (${squadSize(game, c.id)})</option>`).join('')}</select>
      <button class="btn btn--quiet" data-act="ed-join-sel" data-id="${esc(p.id)}"${clubs.length ? '' : ' disabled'}>Dodaj do kadry</button></div>
      <p class="fld__help">Wolny zawodnik dostaje kontrakt do końca następnego sezonu z pensją, jakiej oczekuje. Na liście kluby z miejscem w kadrze (do ${EDIT_SQUAD.max}).</p></section>`;
  }
  return '';
}

/** Wolni zawodnicy do dodania do kadry klubu (ed.addTo). */
export function freeListHtml(game, ed) {
  const { total, rows } = freeAgents(game, ed.fq);
  if (!rows.length) return '<p class="ed-empty">Brak wolnych zawodników dla tego wyszukiwania.</p>';
  return `<p class="ed-count">${total > rows.length ? `Pokazano ${rows.length} z ${total}. Zawęź wyszukiwanie.` : `Wolni zawodnicy: ${total}.`}</p>
    <ul class="ed-list">${rows.map((p) => `<li><button class="ed-row" data-act="ed-join" data-id="${esc(p.id)}" data-club="${esc(ed.addTo)}" title="Dodaj do kadry">
    ${posBadge(p)}<span class="ed-row__main"><b>${esc(p.name)}</b><small>${ageAt(p, game.date)} lat, ${esc(NAT_NAMES[p.nat] ?? p.nat)}, dodaj do kadry</small></span><span class="ed-row__ovr" title="Ocena ogólna">${ovrTxt(p.ovr)}</span></button></li>`).join('')}</ul>`;
}

/** Sędziowie: lista (liga, wyszukiwanie). */
const REF_LISTS = { 1: 'Ekstraklasa', 2: '1 Liga', 3: '2 Liga', 4: 'III liga' };
const refAvg = (r) => Math.round((r.a.reduce((s, x) => s + x, 0) / r.a.length) * 10) / 10;
export function refListHtml(game, ed) {
  const q = fold(ed.rq);
  const rows = (game.refs?.list ?? []).filter((r) => (ed.rl === 'all' || r.l === ed.rl) && (!q || fold(r.n).includes(q)))
    .sort((a, b) => a.l - b.l || refAvg(b) - refAvg(a));
  if (!rows.length) return '<p class="ed-empty">Brak sędziów dla tego filtra.</p>';
  return `<ul class="ed-list">${rows.map((r) => `<li><button class="ed-row" data-act="ed-ref" data-id="${esc(r.id)}" aria-current="${ed.ref === r.id ? 'true' : 'false'}">
    <span class="ed-row__main"><b>${esc(r.n)}</b><small>${esc(REF_LISTS[r.l] ?? '')}, ${Number(game.date.slice(0, 4)) - r.b} lat${game.editor?.refs?.[r.id] ? ', zmieniony' : ''}</small></span><span class="ed-row__ovr" title="Średnia atrybutów">${ovrTxt(refAvg(r))}</span></button></li>`).join('')}</ul>`;
}

function refForm(game, ed, rid) {
  const r = game.refs?.list?.find((x) => x.id === rid);
  if (!r) return '<p class="ed-empty">Nie ma takiego sędziego.</p>';
  const d = draftFor(ed, `ref:${rid}`); const v = d ?? refValues(game, r); const e = d ? ed.errors ?? {} : {};
  return `<div class="ed-form" data-ed-form="ref">
    <div class="ed-form__top"><button class="btn btn--quiet btn--sm ed-close" data-act="ed-close">Wróć do listy</button></div>
    <header class="ed-form__head"><div><h2 id="ed-title" tabindex="-1">${esc(r.n)}</h2><p class="muted">Sędzia, lista: ${esc(REF_LISTS[r.l] ?? '')}</p></div></header>
    ${msgHtml(ed)}${firstErr(e)}
    <div class="ed-grid">
      ${field('ed-r-name', 'Imię i nazwisko', textIn('ed-r-name', v.name, { max: LIMITS.name, err: e.name }))}
      ${field('ed-r-age', 'Wiek', numIn('ed-r-age', v.age, e.age, { min: REF_LIMITS.ageMin, max: REF_LIMITS.ageMax }), { help: `Od ${REF_LIMITS.ageMin} do ${REF_LIMITS.ageMax} lat.` })}
    </div>
    <fieldset class="ed-attrs"><legend>Atrybuty (1-20)</legend><div class="ed-attrs__grid">
      ${REF_ATTRS.map((n, i) => attrBox(`ed-r-a-${i}`, n, v.a?.[i], e[`a.${i}`])).join('')}
      ${attrBox('ed-r-e', 'Doświadczenie', v.e, e.e)}
    </div></fieldset>
    <div class="ed-grid">${field('ed-r-s', 'Surowość', `<input id="ed-r-s" type="number" min="${REF_LIMITS.strictMin}" max="${REF_LIMITS.strictMax}" step="0.01" inputmode="decimal" value="${esc(v.s)}"${e.s ? ' aria-invalid="true"' : ''}>`, { err: e.s, help: `Od ${REF_LIMITS.strictMin} (pobłażliwy) do ${REF_LIMITS.strictMax} (surowy), 1,0 to przeciętny: więcej kartek i fauli odgwizdanych.` })}</div>
    <div class="ed-actions"><button class="btn btn--primary" data-act="ed-save-ref" data-id="${esc(rid)}">Zapisz zmiany</button></div>
  </div>`;
}

/** Nowy wolny zawodnik (narodowość z całego świata). */
function newPlayerForm(game, ed) {
  const d = draftFor(ed, 'newp'); const v = d ?? { first: '', last: '', nat: 'POL', pos: 'ŚP', age: '24', level: '10' }; const e = d ? ed.errors ?? {} : {};
  return `<div class="ed-form" data-ed-form="newp">
    <div class="ed-form__top"><button class="btn btn--quiet btn--sm ed-close" data-act="ed-close">Wróć do listy</button></div>
    <header class="ed-form__head"><div><h2 id="ed-title" tabindex="-1">Nowy wolny zawodnik</h2><p class="muted">Trafi na listę wolnych zawodników (Transfery). Do kadry klubu dodasz go w edytorze klubu albo w jego karcie.</p></div></header>
    ${msgHtml(ed)}
    <div class="ed-grid">
      ${field('ed-n-first', 'Imię', textIn('ed-n-first', v.first, { max: LIMITS.name, err: e.first }), { err: e.first })}
      ${field('ed-n-last', 'Nazwisko', textIn('ed-n-last', v.last, { max: LIMITS.name, err: e.last }), { err: e.last })}
      ${field('ed-n-nat', 'Narodowość', `<select id="ed-n-nat">${natOptions(v.nat)}</select>`, { err: e.nat })}
      ${field('ed-n-pos', 'Pozycja', `<select id="ed-n-pos">${posOptions(v.pos)}</select>`, { err: e.pos })}
      ${field('ed-n-age', 'Wiek', numIn('ed-n-age', v.age, e.age, { min: LIMITS.ageMin, max: LIMITS.ageMax }), { err: e.age, help: `Od ${LIMITS.ageMin} do ${LIMITS.ageMax} lat.` })}
      ${field('ed-n-level', 'Poziom (1-20)', `<input id="ed-n-level" type="number" min="${NEW_LEVEL.min}" max="${NEW_LEVEL.max}" step="0.5" inputmode="decimal" value="${esc(v.level)}"${e.level ? ' aria-invalid="true"' : ''}>`, { err: e.level, help: 'Mniej więcej ocena ogólna. Atrybuty losuje gra z poziomu i pozycji, potem możesz je zmienić.' })}
    </div>
    <div class="ed-actions"><button class="btn btn--primary" data-act="ed-create">Utwórz zawodnika</button></div>
  </div>`;
}

// ------------------------------------------------------------ Formularze
const field = (id, label, input, { err = '', help = '' } = {}) => `<div class="fld ed-fld${err ? ' is-invalid' : ''}"><label class="ed-fld__l" for="${id}">${esc(label)}</label>${input}
  ${err ? `<p class="fld__err" id="${id}-err">${esc(err)}</p>` : help ? `<p class="fld__help">${help}</p>` : ''}</div>`;
const textIn = (id, v, { max, num = false, err = '' } = {}) => `<input id="${id}" type="text" value="${esc(v ?? '')}"${max ? ` maxlength="${max}"` : ''}${num ? ' inputmode="numeric"' : ''} autocomplete="off"${err ? ` aria-invalid="true" aria-describedby="${id}-err"` : ''}>`;
const msgHtml = (ed) => (ed.msg ? `<p class="ed-msg${ed.errors ? ' is-bad' : ''}" role="status">${esc(ed.msg)}</p>` : '');
const draftFor = (ed, key) => (ed.draft?.key === key ? ed.draft.v : null);

function clubForm(game, ed, id) {
  const c = clubObj(id);
  if (!c) return '<p class="ed-empty">Nie ma takiego klubu.</p>';
  const cur = clubValues(game, id);
  const v = draftFor(ed, `club:${id}`) ?? cur;
  const e = ed.draft?.key === `club:${id}` ? ed.errors ?? {} : {};
  const hasFin = cur.balance != null;
  const orig = (k) => { const o = originalOf(id, k); return o && o !== cur[k] ? `Oryginał: ${esc(o)}` : ''; };
  const inPack = !!game.editor?.clubs?.[id];
  const squad = [...squadOf(game.world, id)].sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || b.ovr - a.ovr);
  return `<div class="ed-form" data-ed-form="club">
    <div class="ed-form__top"><button class="btn btn--quiet btn--sm ed-close" data-act="ed-close">Wróć do listy</button></div>
    <header class="ed-form__head">${crest(c, 44)}<div><h2 id="ed-title" tabindex="-1">${esc(c.name)}</h2><p class="muted">${esc(leagueOf(c))}</p></div></header>
    ${msgHtml(ed)}
    <div class="ed-grid">
      ${field('ed-name', 'Nazwa', textIn('ed-name', v.name, { max: LIMITS.name, err: e.name }), { err: e.name, help: orig('name') })}
      ${field('ed-short', 'Nazwa skrócona', textIn('ed-short', v.short, { max: LIMITS.short, err: e.short }), { err: e.short, help: orig('short') || 'Od 2 do 5 liter lub cyfr, np. na herbie.' })}
      ${field('ed-stadium', 'Nazwa stadionu', textIn('ed-stadium', v.stadium, { max: LIMITS.stadium, err: e.stadium }), { err: e.stadium, help: 'Puste pole: „Stadion gospodarzy” w informacjach o meczu.' })}
      <div class="fld ed-fld ed-wide"><label class="ed-fld__l" for="ed-crest">Herb</label>
        <div class="ed-crest">${c.crest ? crest(c, 44) : ''}<input id="ed-crest" type="file" data-act="ed-crest" data-id="${esc(id)}">
        ${c.crest ? `<button class="btn btn--quiet btn--sm" data-act="ed-crest-clear" data-id="${esc(id)}">Usuń własny herb</button>` : ''}</div>
        <p class="fld__help">Obrazek PNG, JPG albo WEBP, najlepiej kwadratowy z przezroczystym tłem. Trafia do datapacku, więc po wczytaniu pliku każdy ma ten sam herb.</p></div>
      ${field('ed-capacity', 'Pojemność stadionu', textIn('ed-capacity', v.capacity, { num: true, err: e.capacity }), { err: e.capacity, help: `Od ${LIMITS.capMin.toLocaleString('pl-PL')} do ${LIMITS.capMax.toLocaleString('pl-PL')} miejsc.` })}
      ${hasFin ? `${field('ed-balance', 'Saldo (zł)', textIn('ed-balance', v.balance, { num: true, err: e.balance }), { err: e.balance, help: `Teraz ${esc(fmtZl(cur.balance))}. Może być ujemne.` })}
      ${field('ed-tb', 'Budżet transferowy (zł)', textIn('ed-tb', v.transferBudget, { num: true, err: e.transferBudget }), { err: e.transferBudget, help: `Teraz ${esc(fmtZl(cur.transferBudget))}.` })}
      ${field('ed-wb', 'Budżet płac (zł tygodniowo)', textIn('ed-wb', v.wageBudget, { num: true, err: e.wageBudget }), { err: e.wageBudget, help: `Teraz ${esc(fmtZl(cur.wageBudget))}.` })}` : '<p class="muted ed-wide">Ten klub nie ma finansów w grze, więc zmienisz tylko nazwy i stadion.</p>'}
    </div>
    <div class="ed-actions">
      <button class="btn btn--primary" data-act="ed-save-club" data-id="${esc(id)}">Zapisz zmiany</button>
      ${inPack ? `<button class="btn btn--quiet" data-act="ed-reset-club" data-id="${esc(id)}">Przywróć oryginał</button>` : ''}
    </div>
    ${peopleForms(game, ed, id)}
    ${rivalsForm(game, id)}
    ${inPack ? '<p class="ed-note">Przywróć oryginał: wracają nazwa, skrót, stadion i herb z danych gry, a klub znika z datapacku. Finanse, pojemność, trener, sztab i właściciel zostają tacy, jak teraz.</p>' : ''}
    <section class="ed-squad" aria-labelledby="ed-squad-h"><h3 id="ed-squad-h">Kadra (${squad.length})</h3>
      <p class="fld__help">Kadra pierwszej drużyny: od ${EDIT_SQUAD.min} do ${EDIT_SQUAD.max} zawodników. Zawodnika przeniesiesz do wolnych w jego karcie.</p>
      <div class="ed-actions"><button class="btn btn--quiet btn--sm" data-act="ed-addfree" data-id="${esc(id)}" aria-expanded="${ed.addTo === id}"${squad.length >= EDIT_SQUAD.max ? ' disabled' : ''}>${ed.addTo === id ? 'Zamknij listę wolnych' : 'Dodaj wolnego zawodnika'}</button></div>
      ${ed.addTo === id ? `<div class="ed-free"><input class="ed-search" id="ed-fq" type="search" placeholder="Szukaj wolnego zawodnika" aria-label="Szukaj wolnego zawodnika" value="${esc(ed.fq)}" autocomplete="off">
        <div id="ed-free">${freeListHtml(game, ed)}</div></div>` : ''}
      ${squad.length ? playerRows(game, squad, 'ed-cplayer', null) : '<p class="ed-empty">Brak zawodników.</p>'}</section>
  </div>`;
}

// Najwięksi rywale klubu (data/kibice.js): intensywność wpływa na kibiców, frekwencję, odprawy i rangę meczu
export const RIVAL_LEVELS = { 0: 'Bez rywalizacji', 1: 'Lokalna rywalizacja', 2: 'Duża rywalizacja', 3: 'Wielkie derby' };
const rivalSelect = (id, v, withNone = true) => `<select id="${id}">${Object.entries(RIVAL_LEVELS).filter(([k]) => withNone || k !== '0').map(([k, l]) => `<option value="${k}"${Number(k) === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
function rivalsForm(game, id) {
  const cur = rivalsOf(game, id);
  const listed = Object.entries(cur).filter(([, v]) => v > 0);
  const removed = Object.entries(cur).filter(([, v]) => v === 0);
  const objOf = (cid) => [...CLUBS_PL, ...CLUBS_L3].find((c) => c.id === cid) ?? null;
  const nameOf = (cid) => objOf(cid)?.name ?? cid;
  const options = [...CLUBS_PL, ...CLUBS_L3].filter((c) => c.id !== id && !c.parent && !(cur[c.id] > 0))
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'pl'));
  const rows = listed.map(([cid, v]) => `<div class="ed-rival"><span class="ed-rival__nm">${crest(objOf(cid), 22)}${esc(nameOf(cid))}</span>
    <label class="sr-only" for="ed-rv-${esc(cid)}">Rywalizacja z ${esc(nameOf(cid))}</label>${rivalSelect(`ed-rv-${esc(cid)}`, v)}</div>`).join('');
  return `<fieldset class="ed-attrs ed-people ed-rivals"><legend>Najwięksi rywale</legend>
    ${rows || '<p class="muted">Brak rywali na liście. Kluby z tego samego regionu grają derby lokalne.</p>'}
    ${listed.length < RIVALS_MAX ? `<div class="ed-rival ed-rival--add"><label class="ed-rival__nm" for="ed-rv-new"><span class="sr-only">Nowy rywal</span><select id="ed-rv-new"><option value="">Dodaj rywala...</option>${options.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${esc(LEAGUE_NAMES[c.tier] ?? '')})</option>`).join('')}</select></label>
      <label class="sr-only" for="ed-rv-new-v">Intensywność nowej rywalizacji</label>${rivalSelect('ed-rv-new-v', 2, false)}</div>` : ''}
    ${removed.length ? `<p class="fld__help">Usunięte rywalizacje: ${esc(removed.map(([cid]) => nameOf(cid)).join(', '))} (także bez derby lokalnych).</p>` : ''}
    <p class="fld__help">Rywalizacja działa w obie strony. Intensywność wpływa na emocje kibiców, frekwencję, odprawy i rangę meczu: wielkie derby to najwyższe emocje i ryzyko incydentów. „Bez rywalizacji” usuwa też derby lokalne z regionu. Najwyżej ${RIVALS_MAX} rywali.</p>
    <div class="ed-actions"><button class="btn btn--primary btn--sm" data-act="ed-save-rivals" data-id="${esc(id)}">Zapisz rywali</button></div></fieldset>`;
}

// Trener, sztab i właściciel klubu: osobne sekcje z własnym przyciskiem zapisu
const numIn = (id, v, err, { min = 1, max = 20 } = {}) => `<input id="${id}" type="number" min="${min}" max="${max}" step="1" inputmode="numeric" value="${esc(v ?? '')}"${err ? ' aria-invalid="true"' : ''}>`;
const attrBox = (id, label, v, err) => `<label class="ed-attr${err ? ' is-invalid' : ''}"><span>${esc(label)}</span>${numIn(id, v, err)}</label>`;
const firstErr = (e) => { const m = Object.values(e); return m.length ? `<p class="ed-msg is-bad">${esc(m[0])}${m.length > 1 ? ` (i ${m.length - 1} więcej)` : ''}</p>` : ''; };

function peopleForms(game, ed, id) {
  const cur = peopleValues(game, id);
  const sec = (key) => { const d = draftFor(ed, `${key}:${id}`); return { v: d ?? cur[key], e: d ? ed.errors ?? {} : {} }; };
  const out = [];
  if (cur.coach) {
    const { v, e } = sec('coach');
    out.push(`<fieldset class="ed-attrs ed-people"><legend>Trener</legend>${firstErr(e)}
      <div class="ed-grid">
        ${field('ed-co-name', 'Imię i nazwisko', textIn('ed-co-name', v.name, { max: LIMITS.name, err: e.name }))}
        ${field('ed-co-age', 'Wiek', numIn('ed-co-age', v.age, e.age, PERSON_AGE))}
        ${field('ed-co-style', 'Styl', `<select id="ed-co-style">${Object.entries(COACH_STYLES).map(([k, l]) => `<option value="${k}"${k === v.style ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`)}
      </div>
      <div class="ed-attrs__grid">${COACH_KEYS.map((k) => attrBox(`ed-co-a-${k}`, COACH_ATTRS[k].name, v.a?.[k], e[`a.${k}`])).join('')}</div>
      <div class="ed-actions"><button class="btn btn--primary btn--sm" data-act="ed-save-coach" data-id="${esc(id)}">Zapisz trenera</button></div></fieldset>`);
  }
  if (cur.staff) {
    const { v, e } = sec('staff');
    const rows = STAFF_ROLE_ORDER.filter((r) => v[r]?.length).map((role) => v[role].map((p, i) => {
      const k = `ed-st-${role}-${i}`; const er = (f) => e[`${role}.${i}.${f}`];
      // Atrybuty roli (docs/sztab-atrybuty.md); jakość to ich średnia, liczona przez grę
      const keys = roleAttrKeys(role);
      const q = keys.length && p.a ? qFromAttrs(Object.fromEntries(keys.map((x) => [x, Number(String(p.a[x] ?? '').replace(',', '.')) || p.q || 10]))) : p.q;
      return `<div class="ed-staff"><span class="ed-staff__role">${esc(STAFF_ROLES[role]?.name ?? role)} <small>jakość ${esc(q ?? '')}</small></span>
        <label class="ed-staff__f ed-staff__name"><span>Imię i nazwisko</span>${textIn(`${k}-name`, p.name, { max: LIMITS.name, err: er('name') })}</label>
        <label class="ed-staff__f"><span>Wiek</span>${numIn(`${k}-age`, p.age, er('age'), PERSON_AGE)}</label>
        ${keys.map((x) => `<label class="ed-staff__f" title="${esc(ROLE_ATTRS[role][x].text)}"><span>${esc(ROLE_ATTRS[role][x].name)}</span>${numIn(`${k}-a-${x}`, p.a?.[x] ?? p.q, er(`a.${x}`))}</label>`).join('')}</div>`;
    }).join('')).join('');
    out.push(`<fieldset class="ed-attrs ed-people"><legend>Sztab</legend>${firstErr(e)}${rows}
      <p class="fld__help">Atrybuty od 1 do 20 dopasowane do roli. Jakość osoby to ich średnia: od niej zależą pensja i pozycja w sztabie, a od atrybutów konkretne efekty w grze (najedź na nazwę atrybutu).</p>
      <div class="ed-actions"><button class="btn btn--primary btn--sm" data-act="ed-save-staff" data-id="${esc(id)}">Zapisz sztab</button></div></fieldset>`);
  }
  if (cur.owner) {
    const { v, e } = sec('owner');
    out.push(`<fieldset class="ed-attrs ed-people"><legend>Właściciel</legend>${firstErr(e)}
      <div class="ed-grid">${field('ed-ow-name', 'Właściciel', textIn('ed-ow-name', v.name, { max: LIMITS.name, err: e.name }))}</div>
      <div class="ed-attrs__grid">${OWNER_KEYS.map((k) => attrBox(`ed-ow-${k}`, OWNER_LABELS[k], v[k], e[k])).join('')}</div>
      <div class="ed-actions"><button class="btn btn--primary btn--sm" data-act="ed-save-owner" data-id="${esc(id)}">Zapisz właściciela</button></div></fieldset>`);
  }
  return out.join('');
}

function readPeople(root, key, game, id) {
  if (key === 'coach') {
    return { name: val(root, 'ed-co-name'), age: val(root, 'ed-co-age'), style: val(root, 'ed-co-style'), a: Object.fromEntries(COACH_KEYS.map((k) => [k, val(root, `ed-co-a-${k}`)])) };
  }
  if (key === 'owner') return { name: val(root, 'ed-ow-name'), ...Object.fromEntries(OWNER_KEYS.map((k) => [k, val(root, `ed-ow-${k}`)])) };
  const staff = {};
  for (const [role, list] of Object.entries(peopleValues(game, id).staff ?? {})) {
    staff[role] = list.map((_, i) => ({ name: val(root, `ed-st-${role}-${i}-name`), age: val(root, `ed-st-${role}-${i}-age`), a: Object.fromEntries(roleAttrKeys(role).map((x) => [x, val(root, `ed-st-${role}-${i}-a-${x}`)])) }));
  }
  return staff;
}

// Boisko pozycji zawodnika (kopia boiska z taktyki): główna z listy „Pozycja”, dodatkowe z dopasowaniem w procentach
// wpisanym przez gracza (0-90 %). Kliknięcie pozycji na boisku przenosi do jej pola. Puste pole: tylko naturalne
// dopasowanie z pozycji głównej (podpowiedź w polu). Mecz bierze wyższą wartość z naturalnej i wpisanej.
const PITCH_SPOTS = [['NAP', 50, 11], ['SN', 17, 18], ['SN', 83, 18], ['OP', 50, 30], ['BP', 14, 41], ['BP', 86, 41], ['ŚP', 50, 46],
  ['DP', 50, 60], ['WB', 13, 61], ['WB', 87, 61], ['BO', 15, 76], ['BO', 85, 76], ['ŚO', 50, 79], ['BR', 50, 92]];
export const altState = (lvl) => (lvl >= 70 ? 'alt' : lvl > 0 ? 'learn' : 'none');
function posPitch(v, pid) {
  const main = v.pos; const alt = v.alt ?? {};
  const gk = main === 'BR';
  const spots = PITCH_SPOTS.map(([k, x, y]) => {
    const lvl = Number(alt[k]) || 0;
    const state = k === main ? 'main' : altState(lvl);
    const dis = k === main || k === 'BR' || gk;
    const label = state === 'main' ? 'główna' : lvl > 0 ? `${lvl} %` : '';
    const what = state === 'main' ? 'pozycja główna' : lvl > 0 ? `dopasowanie ${lvl} %` : 'bez pozycji dodatkowej';
    return `<button type="button" class="ed-pp" style="left:${x}%;top:${y}%" data-act="ed-altpos" data-id="${esc(pid)}" data-pos="${esc(k)}" data-s="${state}"${dis ? ' disabled' : ''} aria-label="${esc(POS_NAMES[k] ?? k)}: ${what}"><b>${esc(k)}</b>${label ? `<small>${label}</small>` : ''}</button>`;
  }).join('');
  const inputs = gk ? '' : `<div class="ed-alts">${ALT_POSITIONS.filter((k) => k !== main).map((k) => {
    const nat = Math.round(proficiency({ pos: main, alt: {} }, k));
    return `<label class="ed-attr"><span>${esc(k)} <small class="muted">${esc(POS_NAMES[k] ?? '')}</small></span><input id="ed-alt-${esc(k)}" data-alt="${esc(k)}" type="number" min="0" max="${ALT_MAX}" step="1" inputmode="numeric" placeholder="${nat}" value="${esc(alt[k] ?? '')}"></label>`;
  }).join('')}</div>`;
  return `<fieldset class="ed-attrs"><legend>Pozycje</legend><div class="ed-pitchbox">
    <div class="pitch2 ed-pitch" role="group" aria-label="Boisko: pozycje zawodnika">${spots}</div>
    <div class="ed-pitchinfo">
      <p class="ed-ppl"><i data-s="main"></i>Pozycja główna (wybierasz ją w polu „Pozycja”)</p>
      <p class="ed-ppl"><i data-s="alt"></i>Dobrze pasuje: od 70 %</p>
      <p class="ed-ppl"><i data-s="learn"></i>Słabiej pasuje: poniżej 70 %</p>
      ${gk ? '<p class="fld__help">Bramkarz nie ma pozycji dodatkowych w polu.</p>' : `<p class="fld__help">Wpisz, jak zawodnik pasuje na pozycję: od 0 do ${ALT_MAX} % (np. 90 prawie jak na swojej, 75 dobrze, 60 przyzwoicie, 40 słabo). Puste pole: tylko naturalne dopasowanie z pozycji głównej (szara liczba). Mecz bierze wyższą z tych dwóch wartości. Kliknięcie pozycji na boisku przenosi do jej pola.</p>`}
      ${inputs}
    </div></div></fieldset>`;
}

const natOptions = (cur) => Object.entries(NAT_NAMES).sort((a, b) => a[1].localeCompare(b[1], 'pl'))
  .map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
const posOptions = (cur) => POS_ORDER.map((k) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(k)}, ${esc(POS_NAMES[k])}</option>`).join('');

function playerForm(game, ed, pid, { back }) {
  const p = game.world?.players?.[pid];
  if (!p) return '<p class="ed-empty">Tego zawodnika nie ma już w grze.</p>';
  const cur = playerValues(p);
  const d = draftFor(ed, `player:${pid}`);
  const v = d ?? cur;
  const e = d ? ed.errors ?? {} : {};
  const inPack = !!game.editor?.players?.[pid];
  const c = p.clubId ? clubObj(p.clubId) : null;
  const groups = Object.entries(ATTR_GROUPS).map(([g, label]) => {
    const keys = Object.keys(ATTRS).filter((k) => ATTRS[k].group === g);
    return `<fieldset class="ed-attrs"><legend>${esc(label)}</legend><div class="ed-attrs__grid">${keys.map((k) => {
      const err = e[`attr.${k}`];
      return `<label class="ed-attr${err ? ' is-invalid' : ''}"><span>${esc(ATTRS[k].name)}</span><input id="ed-a-${k}" data-attr="${k}" type="number" min="1" max="20" step="1" inputmode="numeric" value="${esc(v.attrs?.[k] ?? '')}"${err ? ' aria-invalid="true"' : ''}></label>`;
    }).join('')}</div></fieldset>`;
  }).join('');
  const attrErr = Object.entries(e).filter(([k]) => k.startsWith('attr.')).map(([, m]) => m);
  return `<div class="ed-form" data-ed-form="player">
    <div class="ed-form__top"><button class="btn btn--quiet btn--sm ${back.cls}" data-act="${back.act}">${esc(back.label)}</button></div>
    <header class="ed-form__head">${posBadge(p)}<div><h2 id="ed-title" tabindex="-1">${esc(p.name)}</h2><p class="muted">${c ? crest(c, 18) : ''}${esc(clubLabel(p))}, ${ageAt(p, game.date)} lat</p></div>
      <div class="ed-ovr"><small>OVR</small><b>${ovrTxt(p.ovr)}</b></div></header>
    ${msgHtml(ed)}
    <div class="ed-grid">
      ${field('ed-first', 'Imię', textIn('ed-first', v.first, { max: LIMITS.name, err: e.first }), { err: e.first })}
      ${field('ed-last', 'Nazwisko', textIn('ed-last', v.last, { max: LIMITS.name, err: e.last }), { err: e.last })}
      ${field('ed-nat', 'Narodowość', `<select id="ed-nat">${natOptions(v.nat)}</select>`, { err: e.nat })}
      ${field('ed-pos', 'Pozycja', `<select id="ed-pos">${posOptions(v.pos)}</select>`, { err: e.pos })}
      ${field('ed-birth', 'Data urodzenia', `<input id="ed-birth" type="date" value="${esc(v.birthDate)}"${e.birthDate ? ' aria-invalid="true" aria-describedby="ed-birth-err"' : ''}>`, { err: e.birthDate, help: `Wiek liczony z daty. Od ${LIMITS.ageMin} do ${LIMITS.ageMax} lat.` })}
      ${field('ed-pot', 'Potencjał (1-20)', `<input id="ed-pot" type="number" min="1" max="20" step="0.1" inputmode="decimal" value="${esc(v.pot)}"${e.pot ? ' aria-invalid="true" aria-describedby="ed-pot-err"' : ''}>`, { err: e.pot, help: 'Ukryty sufit rozwoju zawodnika.' })}
    </div>
    ${e.alt ? `<p class="ed-msg is-bad">${esc(e.alt)}</p>` : ''}
    ${healthHtml(v, e)}
    ${posPitch(v, pid)}
    ${attrErr.length ? `<p class="ed-msg is-bad">${esc(attrErr[0])}${attrErr.length > 1 ? ` (i ${attrErr.length - 1} więcej)` : ''}</p>` : ''}
    ${groups}
    <div class="ed-actions">
      <button class="btn btn--primary" data-act="ed-save-player" data-id="${esc(pid)}">Zapisz zmiany</button>
      ${inPack ? `<button class="btn btn--quiet" data-act="ed-reset-player" data-id="${esc(pid)}">Usuń z datapacku</button>` : ''}
    </div>
    <p class="ed-note">OVR liczy się po zapisie z atrybutów i pozycji, tak jak w grze.${inPack ? ' Usunięcie z datapacku zostawia obecne dane zawodnika w tej grze.' : ''}</p>
    ${squadMoveHtml(game, p)}
  </div>`;
}

function packPanel(game, ed) {
  const n = packCounts(game);
  return `<div class="ed-form ed-pack">
    <h2 id="ed-title" tabindex="-1">Datapack</h2>
    <p class="ed-note">Datapack to plik z danymi klubów (nazwy, stadion, pojemność, finanse) i zawodników. Eksport zapisuje wszystkie kluby i wszystkich zawodników, razem ze zmienionymi. Plik wczytasz w innej grze. Dane klubów działają zawsze, dane zawodników tylko w tym samym świecie gry (ta sama kariera albo jej kopia).</p>
    <dl class="ed-sum"><div><dt>Zmienione kluby</dt><dd>${n.clubs}</dd></div><div><dt>Zmienieni zawodnicy</dt><dd>${n.players}</dd></div></dl>
    ${msgHtml(ed)}
    <div class="ed-actions">
      <button class="btn btn--primary" data-act="ed-export" data-full="1">Eksportuj datapack</button>
      <label class="btn btn--quiet ed-import">Wczytaj datapack<input type="file" data-act="ed-import" hidden></label>
    </div>
    <section class="ed-danger"><h3>Wyczyść datapack</h3>
      <p class="ed-note">Nazwy klubów wrócą do oryginału. Liczby i dane zawodników w tej grze zostaną takie, jak teraz.</p>
      ${ed.confirmClear ? `<p>Na pewno usunąć wszystkie zmiany z datapacku?</p><div class="ed-actions"><button class="btn btn--danger" data-act="ed-clear-yes">Tak, wyczyść</button><button class="btn btn--quiet" data-act="ed-clear-no">Anuluj</button></div>`
    : `<button class="btn btn--quiet" data-act="ed-clear" ${n.clubs + n.players ? '' : 'disabled'}>Wyczyść datapack</button>`}
    </section>
  </div>`;
}

// ------------------------------------------------------------ Ekran
const TABS = [['clubs', 'Kluby'], ['players', 'Zawodnicy'], ['refs', 'Sędziowie'], ['pack', 'Datapack']];

export function renderEditor(game, ed) {
  const tabs = `<div class="ed-tabs" role="tablist" aria-label="Edytor">${TABS.map(([k, l]) => `<button class="ed-tab" role="tab" data-act="ed-tab" data-tab="${k}" aria-selected="${ed.tab === k}">${esc(l)}</button>`).join('')}</div>`;
  let list = ''; let form = ''; let sel = false;
  if (ed.tab === 'clubs') {
    const tiers = [[1, LEAGUE_NAMES[1]], [2, LEAGUE_NAMES[2]], [3, LEAGUE_NAMES[3]], [4, LEAGUE_NAMES[4]], ['all', 'Wszystkie']];
    list = `<div class="ed-filters">
      <div class="chips chips--sm chips--wrap" role="group" aria-label="Liga">${tiers.map(([t, l]) => `<button class="chip" data-act="ed-tier" data-t="${t}" aria-pressed="${ed.tier === t}">${esc(l)}</button>`).join('')}</div>
      <input class="ed-search" id="ed-q" type="search" placeholder="Szukaj klubu" aria-label="Szukaj klubu" value="${esc(ed.q)}" autocomplete="off"></div>
      <div id="ed-results">${clubListHtml(game, ed)}</div>`;
    sel = !!ed.club;
    form = ed.cplayer ? playerForm(game, ed, ed.cplayer, { back: { act: 'ed-close', label: `Wróć do klubu ${clubObj(ed.club)?.name ?? ''}`.trim(), cls: '' } })
      : ed.club ? clubForm(game, ed, ed.club) : '<p class="ed-empty ed-hint">Wybierz klub z listy.</p>';
  } else if (ed.tab === 'refs') {
    const lists = [[1, REF_LISTS[1]], [2, REF_LISTS[2]], [3, REF_LISTS[3]], [4, REF_LISTS[4]], ['all', 'Wszyscy']];
    list = `<div class="ed-filters">
      <div class="chips chips--sm chips--wrap" role="group" aria-label="Lista sędziów">${lists.map(([t, l]) => `<button class="chip" data-act="ed-rlist" data-t="${t}" aria-pressed="${ed.rl === t}">${esc(l)}</button>`).join('')}</div>
      <input class="ed-search" id="ed-rq" type="search" placeholder="Szukaj sędziego" aria-label="Szukaj sędziego" value="${esc(ed.rq)}" autocomplete="off"></div>
      <div id="ed-results">${refListHtml(game, ed)}</div>`;
    sel = !!ed.ref;
    form = ed.ref ? refForm(game, ed, ed.ref) : '<p class="ed-empty ed-hint">Wybierz sędziego z listy.</p>';
  } else if (ed.tab === 'players') {
    const clubs = editorClubs(game);
    list = `<div class="ed-filters">
      <div class="ed-actions"><button class="btn btn--quiet btn--sm" data-act="ed-newp">Nowy wolny zawodnik</button></div>
      <input class="ed-search" id="ed-pq" type="search" placeholder="Szukaj po imieniu lub nazwisku" aria-label="Szukaj zawodnika" value="${esc(ed.pq)}" autocomplete="off">
      <div class="ed-selects">
        <select id="ed-pclub" aria-label="Klub"><option value="all">Wszystkie kluby</option><option value="none"${ed.pclub === 'none' ? ' selected' : ''}>Bez polskiego klubu</option>${clubs.map((c) => `<option value="${esc(c.id)}"${ed.pclub === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select id="ed-ppos" aria-label="Pozycja"><option value="all">Wszystkie pozycje</option>${POS_ORDER.map((k) => `<option value="${esc(k)}"${ed.ppos === k ? ' selected' : ''}>${esc(POS_NAMES[k])}</option>`).join('')}</select>
      </div></div>
      <div id="ed-results">${playerListHtml(game, ed)}</div>`;
    sel = !!ed.player || ed.newp;
    form = ed.newp ? newPlayerForm(game, ed) : ed.player ? playerForm(game, ed, ed.player, { back: { act: 'ed-close', label: 'Wróć do listy', cls: 'ed-close' } }) : '<p class="ed-empty ed-hint">Wyszukaj zawodnika i wybierz go z listy.</p>';
  }
  const body = ed.tab === 'pack' ? `<div class="ed-body ed-body--one">${packPanel(game, ed)}</div>`
    : `<div class="ed-body${sel ? ' ed-body--sel' : ''}"><section class="ed-pane ed-pane--list" aria-label="Lista">${list}</section><section class="ed-pane ed-pane--form" aria-label="Edycja">${form}</section></div>`;
  return `<div class="ed">
    <header class="ed-head"><div><h1>Edytor</h1><p class="muted">Zmiany działają od razu w tej grze i trafiają do datapacku.</p></div>
      <button class="btn btn--primary" data-act="ed-back">Wróć do gry</button></header>
    ${tabs}${body}
  </div>`;
}

// ------------------------------------------------------------ Akcje
const val = (root, id) => root?.querySelector(`#${id}`)?.value ?? '';

function readClubForm(root, hasFin) {
  const v = { name: val(root, 'ed-name'), short: val(root, 'ed-short'), stadium: val(root, 'ed-stadium'), capacity: val(root, 'ed-capacity') };
  if (hasFin) Object.assign(v, { balance: val(root, 'ed-balance'), transferBudget: val(root, 'ed-tb'), wageBudget: val(root, 'ed-wb') });
  return v;
}

function readPlayerForm(root) {
  const attrs = {};
  for (const k of Object.keys(ATTRS)) attrs[k] = val(root, `ed-a-${k}`);
  const alt = {}; // pozycje dodatkowe: puste pole = bez wpisu
  for (const el of root?.querySelectorAll?.('input[data-alt]') ?? []) if (String(el.value).trim() !== '') alt[el.dataset.alt] = el.value;
  // Kontuzja: „Zdrowy” = null; bez dni: środek zakresu dni rodzaju urazu
  const injName = val(root, 'ed-inj'); let injDays = String(val(root, 'ed-inj-days')).trim();
  const t = INJURY_LIST.find((x) => x.name === injName);
  if (injName && !injDays && t) injDays = String(Math.round((t.lo + t.hi) / 2));
  const injury = root?.querySelector?.('#ed-inj') ? (injName ? { name: injName, days: injDays } : null) : undefined;
  return { first: val(root, 'ed-first'), last: val(root, 'ed-last'), nat: val(root, 'ed-nat'), pos: val(root, 'ed-pos'), birthDate: val(root, 'ed-birth'), attrs, pot: val(root, 'ed-pot'), alt, injury };
}

const changed = (n) => (n ? `Zapisano zmiany (${n} ${n === 1 ? 'pole' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'pola' : 'pól'}).` : 'Bez zmian do zapisania.');

/**
 * Akcja edytora. Zmienia ed (stan ekranu) i grę. Zwraca { save, exit, export, focus }.
 * root: element z formularzem (app).
 */
export function handleEditorAction(game, ed, act, data, root) {
  const clearMsg = () => { ed.msg = null; ed.errors = null; ed.draft = null; };
  if (act === 'ed-back') return { exit: true };
  if (act === 'ed-export') return { export: true, full: data?.full === '1' };
  if (act === 'ed-tab') { ed.tab = data.tab; ed.confirmClear = false; clearMsg(); return { focus: '#ed-title' }; }
  if (act === 'ed-tier') { ed.tier = data.t === 'all' ? 'all' : Number(data.t); return {}; }
  if (act === 'ed-club') { ed.club = data.id; ed.cplayer = null; clearMsg(); return { focus: '#ed-title', top: true }; }
  if (act === 'ed-cplayer') { ed.cplayer = data.id; clearMsg(); return { focus: '#ed-title', top: true }; }
  if (act === 'ed-player') { ed.player = data.id; clearMsg(); return { focus: '#ed-title', top: true }; }
  if (act === 'ed-close') {
    clearMsg();
    if (ed.tab === 'clubs') { if (ed.cplayer) ed.cplayer = null; else ed.club = null; } else if (ed.tab === 'refs') ed.ref = null; else { ed.player = null; ed.newp = false; }
    return { focus: '#ed-title', top: true };
  }
  if (act === 'ed-save-club') {
    const id = data.id;
    const raw = readClubForm(root, clubValues(game, id).balance != null);
    const r = checkClub(raw, { form: true });
    if (Object.keys(r.errors).length) { ed.errors = r.errors; ed.draft = { key: `club:${id}`, v: raw }; ed.msg = 'Popraw zaznaczone pola.'; return { focus: '[aria-invalid="true"]' }; }
    const n = editClub(game, id, r.value);
    ed.errors = null; ed.draft = null; ed.msg = changed(n);
    return { save: n > 0 };
  }
  if (act === 'ed-save-player') {
    const pid = data.id;
    const raw = readPlayerForm(root);
    const r = checkPlayer(raw, { form: true, date: game.date });
    if (Object.keys(r.errors).length) { ed.errors = r.errors; ed.draft = { key: `player:${pid}`, v: raw }; ed.msg = 'Popraw zaznaczone pola.'; return { focus: '[aria-invalid="true"]' }; }
    const n = editPlayer(game, pid, r.value);
    ed.errors = null; ed.draft = null; ed.msg = changed(n);
    return { save: n > 0, squadChanged: n > 0 && game.world.players[pid]?.clubId === game.clubId };
  }
  // Kadra: wolni zawodnicy do klubu i z klubu (limit kadry w src/career/editor.js)
  if (act === 'ed-addfree') { ed.addTo = ed.addTo === data.id ? null : data.id; ed.fq = ''; clearMsg(); return { focus: ed.addTo ? '#ed-fq' : '[data-act="ed-addfree"]' }; }
  if (act === 'ed-join' || act === 'ed-join-sel') {
    const club = act === 'ed-join' ? data.club : val(root, 'ed-joinclub');
    const name = game.world.players[data.id]?.name ?? '';
    const why = joinFromFree(game, data.id, club);
    clearMsg();
    ed.msg = why ? `Nie dodano: ${why}` : `${name} w kadrze klubu ${clubObj(club)?.name ?? ''}.`; ed.errors = why ? {} : null;
    return { save: !why, squadChanged: !why && club === game.clubId };
  }
  if (act === 'ed-release') {
    const p = game.world.players[data.id]; const from = p?.clubId;
    const why = releaseToFree(game, data.id);
    clearMsg();
    ed.msg = why ? `Nie przeniesiono: ${why}` : `${p.name} jest teraz wolnym zawodnikiem.`; ed.errors = why ? {} : null;
    return { save: !why, squadChanged: !why && from === game.clubId };
  }
  if (act === 'ed-newp') { ed.newp = true; ed.player = null; clearMsg(); return { focus: '#ed-title', top: true }; }
  if (act === 'ed-create') {
    const raw = { first: val(root, 'ed-n-first'), last: val(root, 'ed-n-last'), nat: val(root, 'ed-n-nat'), pos: val(root, 'ed-n-pos'), age: val(root, 'ed-n-age'), level: val(root, 'ed-n-level') };
    const r = checkNewPlayer(raw, { form: true });
    if (Object.keys(r.errors).length) { ed.errors = r.errors; ed.draft = { key: 'newp', v: raw }; ed.msg = 'Popraw zaznaczone pola.'; return { focus: '[aria-invalid="true"]' }; }
    const p = createFreePlayer(game, r.value);
    clearMsg(); ed.newp = false; ed.player = p.id;
    ed.msg = `Utworzono wolnego zawodnika ${p.name}. Możesz zmienić jego atrybuty i dodać go do kadry klubu.`;
    return { save: true, focus: '#ed-title', top: true };
  }
  // Sędziowie
  if (act === 'ed-rlist') { ed.rl = data.t === 'all' ? 'all' : Number(data.t); return {}; }
  if (act === 'ed-ref') { ed.ref = data.id; clearMsg(); return { focus: '#ed-title', top: true }; }
  if (act === 'ed-save-ref') {
    const rid = data.id;
    const raw = { name: val(root, 'ed-r-name'), age: val(root, 'ed-r-age'), a: REF_ATTRS.map((_, i) => val(root, `ed-r-a-${i}`)), e: val(root, 'ed-r-e'), s: val(root, 'ed-r-s') };
    const r = checkReferee(raw, { form: true });
    if (Object.keys(r.errors).length) { ed.errors = r.errors; ed.draft = { key: `ref:${rid}`, v: raw }; ed.msg = 'Popraw zaznaczone pola.'; return { focus: '[aria-invalid="true"]' }; }
    const n = editReferee(game, rid, r.value);
    ed.errors = null; ed.draft = null; ed.msg = changed(n);
    return { save: n > 0 };
  }
  if (act === 'ed-altpos') {
    // Kliknięcie pozycji na boisku: pole dopasowania tej pozycji (szkic formularza, wpisane pola zostają)
    const pid = data.id; const k = data.pos;
    ed.draft = { key: `player:${pid}`, v: readPlayerForm(root) }; ed.errors = null; ed.msg = null;
    return { focus: `#ed-alt-${k}` };
  }
  const people = { 'ed-save-coach': ['coach', checkCoach, editCoach], 'ed-save-staff': ['staff', checkStaff, editStaff], 'ed-save-owner': ['owner', checkOwner, editOwner] }[act];
  if (people) {
    const [key, check, edit] = people; const id = data.id;
    const raw = readPeople(root, key, game, id);
    const r = check(raw, { form: true });
    if (Object.keys(r.errors).length) { ed.errors = r.errors; ed.draft = { key: `${key}:${id}`, v: raw }; ed.msg = 'Popraw zaznaczone pola.'; return { focus: '[aria-invalid="true"]' }; }
    const n = edit(game, id, r.value);
    ed.errors = null; ed.draft = null; ed.msg = changed(n);
    return { save: n > 0 };
  }
  if (act === 'ed-save-rivals') {
    const id = data.id;
    let n = 0;
    for (const cid of Object.keys(rivalsOf(game, id))) {
      const v = Number(val(root, `ed-rv-${cid}`));
      if (Number.isInteger(v) && v >= 0 && v <= 3) n += editRival(game, id, cid, v);
    }
    const nid = val(root, 'ed-rv-new');
    if (nid && Object.keys(rivalsOf(game, id)).filter((k) => rivalsOf(game, id)[k] > 0).length < RIVALS_MAX) n += editRival(game, id, nid, Number(val(root, 'ed-rv-new-v')) || 2);
    clearMsg(); ed.msg = changed(n);
    return { save: n > 0 };
  }
  if (act === 'ed-crest-clear') { const n = editClub(game, data.id, { crest: '' }); clearMsg(); ed.msg = 'Usunięto własny herb klubu.'; return { save: n > 0 }; }
  if (act === 'ed-reset-club') { resetClub(game, data.id); clearMsg(); ed.msg = 'Przywrócono oryginalne nazwy klubu.'; return { save: true }; }
  if (act === 'ed-reset-player') { resetPlayer(game, data.id); clearMsg(); ed.msg = 'Zawodnik usunięty z datapacku.'; return { save: true }; }
  if (act === 'ed-clear') { ed.confirmClear = true; clearMsg(); return { focus: '[data-act="ed-clear-no"]' }; }
  if (act === 'ed-clear-no') { ed.confirmClear = false; return { focus: '[data-act="ed-clear"]' }; }
  if (act === 'ed-clear-yes') { clearPack(game); ed.confirmClear = false; clearMsg(); ed.msg = 'Datapack wyczyszczony.'; return { save: true }; }
  return {};
}
