// Edytor gry (Opcje, Edytor): zakładki Kluby, Zawodnicy i Datapack. Logika i walidacja: src/career/editor.js.
// Na PC lista po lewej i formularz po prawej, na telefonie jedna kolumna: lista, potem formularz z przyciskiem Wróć.
// Akcje data-act zaczynają się od "ed-"; app.js przekazuje je do handleEditorAction (bez DOM poza odczytem pól).

import { CLUBS_PL, LEAGUE_NAMES } from '../data/clubs_pl.js';
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
  packCounts, originalOf,
} from '../career/editor.js';
import { crestHtml } from './crest.js';
import { esc } from './dom.js';

export const LIST_CAP = 100;
const POS_ORDER = Object.keys(POS_NAMES);
const clubObj = (id) => CLUBS_PL.find((c) => c.id === id) ?? CLUBS_L3.find((c) => c.id === id) ?? null;
const crest = (c, size = 24) => (c ? crestHtml(c, { size }) : '');
const fold = (s) => String(s ?? '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
const leagueOf = (c) => LEAGUE_NAMES[c?.tier] ?? 'III liga';

export const newEditorState = () => ({ tab: 'clubs', tier: 1, q: '', club: null, cplayer: null, player: null, pq: '', pclub: 'all', ppos: 'all', msg: null, errors: null, draft: null, confirmClear: false });
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
      ${field('ed-capacity', 'Pojemność stadionu', textIn('ed-capacity', v.capacity, { num: true, err: e.capacity }), { err: e.capacity, help: `Od ${LIMITS.capMin.toLocaleString('pl-PL')} do ${LIMITS.capMax.toLocaleString('pl-PL')} miejsc.` })}
      ${hasFin ? `${field('ed-balance', 'Saldo (zł)', textIn('ed-balance', v.balance, { num: true, err: e.balance }), { err: e.balance, help: `Teraz ${esc(fmtZl(cur.balance))}. Może być ujemne.` })}
      ${field('ed-tb', 'Budżet transferowy (zł)', textIn('ed-tb', v.transferBudget, { num: true, err: e.transferBudget }), { err: e.transferBudget, help: `Teraz ${esc(fmtZl(cur.transferBudget))}.` })}
      ${field('ed-wb', 'Budżet płac (zł tygodniowo)', textIn('ed-wb', v.wageBudget, { num: true, err: e.wageBudget }), { err: e.wageBudget, help: `Teraz ${esc(fmtZl(cur.wageBudget))}.` })}` : '<p class="muted ed-wide">Ten klub nie ma finansów w grze, więc zmienisz tylko nazwy i stadion.</p>'}
    </div>
    <div class="ed-actions">
      <button class="btn btn--primary" data-act="ed-save-club" data-id="${esc(id)}">Zapisz zmiany</button>
      ${inPack ? `<button class="btn btn--quiet" data-act="ed-reset-club" data-id="${esc(id)}">Przywróć oryginał</button>` : ''}
    </div>
    ${inPack ? '<p class="ed-note">Przywróć oryginał: wracają nazwa, skrót i stadion z danych gry, a klub znika z datapacku. Finanse i pojemność zostają takie, jak teraz.</p>' : ''}
    <section class="ed-squad" aria-labelledby="ed-squad-h"><h3 id="ed-squad-h">Kadra (${squad.length})</h3>
      ${squad.length ? playerRows(game, squad, 'ed-cplayer', null) : '<p class="ed-empty">Brak zawodników.</p>'}</section>
  </div>`;
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
    ${attrErr.length ? `<p class="ed-msg is-bad">${esc(attrErr[0])}${attrErr.length > 1 ? ` (i ${attrErr.length - 1} więcej)` : ''}</p>` : ''}
    ${groups}
    <div class="ed-actions">
      <button class="btn btn--primary" data-act="ed-save-player" data-id="${esc(pid)}">Zapisz zmiany</button>
      ${inPack ? `<button class="btn btn--quiet" data-act="ed-reset-player" data-id="${esc(pid)}">Usuń z datapacku</button>` : ''}
    </div>
    <p class="ed-note">OVR liczy się po zapisie z atrybutów i pozycji, tak jak w grze.${inPack ? ' Usunięcie z datapacku zostawia obecne dane zawodnika w tej grze.' : ''}</p>
  </div>`;
}

function packPanel(game, ed) {
  const n = packCounts(game);
  return `<div class="ed-form ed-pack">
    <h2 id="ed-title" tabindex="-1">Datapack</h2>
    <p class="ed-note">Datapack to zapis Twoich zmian: kluby (nazwy, stadion, pojemność, finanse) i zawodnicy. Plik wczytasz w innej grze. Zmiany klubów działają zawsze, zmiany zawodników tylko w tym samym świecie gry (ta sama kariera albo jej kopia).</p>
    <dl class="ed-sum"><div><dt>Kluby</dt><dd>${n.clubs}</dd></div><div><dt>Zawodnicy</dt><dd>${n.players}</dd></div></dl>
    ${msgHtml(ed)}
    <div class="ed-actions">
      <button class="btn btn--primary" data-act="ed-export">Eksportuj datapack</button>
      <label class="btn btn--quiet ed-import">Wczytaj datapack<input type="file" accept=".json,application/json" data-act="ed-import" hidden></label>
    </div>
    <section class="ed-danger"><h3>Wyczyść datapack</h3>
      <p class="ed-note">Nazwy klubów wrócą do oryginału. Liczby i dane zawodników w tej grze zostaną takie, jak teraz.</p>
      ${ed.confirmClear ? `<p>Na pewno usunąć wszystkie zmiany z datapacku?</p><div class="ed-actions"><button class="btn btn--danger" data-act="ed-clear-yes">Tak, wyczyść</button><button class="btn btn--quiet" data-act="ed-clear-no">Anuluj</button></div>`
    : `<button class="btn btn--quiet" data-act="ed-clear" ${n.clubs + n.players ? '' : 'disabled'}>Wyczyść datapack</button>`}
    </section>
  </div>`;
}

// ------------------------------------------------------------ Ekran
const TABS = [['clubs', 'Kluby'], ['players', 'Zawodnicy'], ['pack', 'Datapack']];

export function renderEditor(game, ed) {
  const tabs = `<div class="ed-tabs" role="tablist" aria-label="Edytor">${TABS.map(([k, l]) => `<button class="ed-tab" role="tab" data-act="ed-tab" data-tab="${k}" aria-selected="${ed.tab === k}">${esc(l)}</button>`).join('')}</div>`;
  let list = ''; let form = ''; let sel = false;
  if (ed.tab === 'clubs') {
    const tiers = [[1, LEAGUE_NAMES[1]], [2, LEAGUE_NAMES[2]], [3, LEAGUE_NAMES[3]], ['all', 'Wszystkie']];
    list = `<div class="ed-filters">
      <div class="chips chips--sm chips--wrap" role="group" aria-label="Liga">${tiers.map(([t, l]) => `<button class="chip" data-act="ed-tier" data-t="${t}" aria-pressed="${ed.tier === t}">${esc(l)}</button>`).join('')}</div>
      <input class="ed-search" id="ed-q" type="search" placeholder="Szukaj klubu" aria-label="Szukaj klubu" value="${esc(ed.q)}" autocomplete="off"></div>
      <div id="ed-results">${clubListHtml(game, ed)}</div>`;
    sel = !!ed.club;
    form = ed.cplayer ? playerForm(game, ed, ed.cplayer, { back: { act: 'ed-close', label: `Wróć do klubu ${clubObj(ed.club)?.name ?? ''}`.trim(), cls: '' } })
      : ed.club ? clubForm(game, ed, ed.club) : '<p class="ed-empty ed-hint">Wybierz klub z listy.</p>';
  } else if (ed.tab === 'players') {
    const clubs = editorClubs(game);
    list = `<div class="ed-filters">
      <input class="ed-search" id="ed-pq" type="search" placeholder="Szukaj po imieniu lub nazwisku" aria-label="Szukaj zawodnika" value="${esc(ed.pq)}" autocomplete="off">
      <div class="ed-selects">
        <select id="ed-pclub" aria-label="Klub"><option value="all">Wszystkie kluby</option><option value="none"${ed.pclub === 'none' ? ' selected' : ''}>Bez polskiego klubu</option>${clubs.map((c) => `<option value="${esc(c.id)}"${ed.pclub === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select id="ed-ppos" aria-label="Pozycja"><option value="all">Wszystkie pozycje</option>${POS_ORDER.map((k) => `<option value="${esc(k)}"${ed.ppos === k ? ' selected' : ''}>${esc(POS_NAMES[k])}</option>`).join('')}</select>
      </div></div>
      <div id="ed-results">${playerListHtml(game, ed)}</div>`;
    sel = !!ed.player;
    form = ed.player ? playerForm(game, ed, ed.player, { back: { act: 'ed-close', label: 'Wróć do listy', cls: 'ed-close' } }) : '<p class="ed-empty ed-hint">Wyszukaj zawodnika i wybierz go z listy.</p>';
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
  return { first: val(root, 'ed-first'), last: val(root, 'ed-last'), nat: val(root, 'ed-nat'), pos: val(root, 'ed-pos'), birthDate: val(root, 'ed-birth'), attrs, pot: val(root, 'ed-pot') };
}

const changed = (n) => (n ? `Zapisano zmiany (${n} ${n === 1 ? 'pole' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'pola' : 'pól'}).` : 'Bez zmian do zapisania.');

/**
 * Akcja edytora. Zmienia ed (stan ekranu) i grę. Zwraca { save, exit, export, focus }.
 * root: element z formularzem (app).
 */
export function handleEditorAction(game, ed, act, data, root) {
  const clearMsg = () => { ed.msg = null; ed.errors = null; ed.draft = null; };
  if (act === 'ed-back') return { exit: true };
  if (act === 'ed-export') return { export: true };
  if (act === 'ed-tab') { ed.tab = data.tab; ed.confirmClear = false; clearMsg(); return { focus: '#ed-title' }; }
  if (act === 'ed-tier') { ed.tier = data.t === 'all' ? 'all' : Number(data.t); return {}; }
  if (act === 'ed-club') { ed.club = data.id; ed.cplayer = null; clearMsg(); return { focus: '#ed-title', top: true }; }
  if (act === 'ed-cplayer') { ed.cplayer = data.id; clearMsg(); return { focus: '#ed-title', top: true }; }
  if (act === 'ed-player') { ed.player = data.id; clearMsg(); return { focus: '#ed-title', top: true }; }
  if (act === 'ed-close') {
    clearMsg();
    if (ed.tab === 'clubs') { if (ed.cplayer) ed.cplayer = null; else ed.club = null; } else ed.player = null;
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
  if (act === 'ed-reset-club') { resetClub(game, data.id); clearMsg(); ed.msg = 'Przywrócono oryginalne nazwy klubu.'; return { save: true }; }
  if (act === 'ed-reset-player') { resetPlayer(game, data.id); clearMsg(); ed.msg = 'Zawodnik usunięty z datapacku.'; return { save: true }; }
  if (act === 'ed-clear') { ed.confirmClear = true; clearMsg(); return { focus: '[data-act="ed-clear-no"]' }; }
  if (act === 'ed-clear-no') { ed.confirmClear = false; return { focus: '[data-act="ed-clear"]' }; }
  if (act === 'ed-clear-yes') { clearPack(game); ed.confirmClear = false; clearMsg(); ed.msg = 'Datapack wyczyszczony.'; return { save: true }; }
  return {};
}
