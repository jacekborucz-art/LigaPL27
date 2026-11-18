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
  OWNER_LABELS, PERSON_AGE, ALT_MAX,
} from '../career/editor.js';
import { proficiency } from '../engine/positions.js';
import { COACH_KEYS, COACH_ATTRS, COACH_STYLES } from '../career/coaches.js';
import { OWNER_KEYS } from '../career/owners.js';
import { STAFF_ROLE_ORDER } from '../career/staffMarket.js';
import { STAFF_ROLES } from '../training/config.js';
import { crestHtml } from './crest.js';
import { esc } from './dom.js';

export const LIST_CAP = 100;
const POS_ORDER = Object.keys(POS_NAMES);
const clubObj = (id) => CLUBS_PL.find((c) => c.id === id) ?? CLUBS_L3.find((c) => c.id === id) ?? null;
const crest = (c, size = 24) => (c ? crestHtml(c, { size }) : '');
const fold = (s) => String(s ?? '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
const leagueOf = (c) => (c?.tier <= 4 ? leagueLabel(c) : 'IV liga');

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
    ${inPack ? '<p class="ed-note">Przywróć oryginał: wracają nazwa, skrót, stadion i herb z danych gry, a klub znika z datapacku. Finanse, pojemność, trener, sztab i właściciel zostają tacy, jak teraz.</p>' : ''}
    <section class="ed-squad" aria-labelledby="ed-squad-h"><h3 id="ed-squad-h">Kadra (${squad.length})</h3>
      ${squad.length ? playerRows(game, squad, 'ed-cplayer', null) : '<p class="ed-empty">Brak zawodników.</p>'}</section>
  </div>`;
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
      return `<div class="ed-staff"><span class="ed-staff__role">${esc(STAFF_ROLES[role]?.name ?? role)}</span>
        <label class="ed-staff__f ed-staff__name"><span>Imię i nazwisko</span>${textIn(`${k}-name`, p.name, { max: LIMITS.name, err: er('name') })}</label>
        <label class="ed-staff__f"><span>Wiek</span>${numIn(`${k}-age`, p.age, er('age'), PERSON_AGE)}</label>
        <label class="ed-staff__f"><span>Jakość</span>${numIn(`${k}-q`, p.q, er('q'))}</label></div>`;
    }).join('')).join('');
    out.push(`<fieldset class="ed-attrs ed-people"><legend>Sztab</legend>${firstErr(e)}${rows}
      <p class="fld__help">Jakość od 1 do 20: jak dobrze osoba wykonuje swoją pracę w sztabie.</p>
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
    staff[role] = list.map((_, i) => ({ name: val(root, `ed-st-${role}-${i}-name`), age: val(root, `ed-st-${role}-${i}-age`), q: val(root, `ed-st-${role}-${i}-q`) }));
  }
  return staff;
}

// Boisko pozycji zawodnika (kopia boiska z taktyki): główna z listy „Pozycja”, kliknięcie dodaje albo usuwa dodatkową.
// Procent przy pozycji: biegłość, tak jak liczy ją silnik meczu (naturalna z pozycji głównej albo dodatkowa).
const PITCH_SPOTS = [['NAP', 50, 11], ['SN', 17, 18], ['SN', 83, 18], ['OP', 50, 30], ['BP', 14, 41], ['BP', 86, 41], ['ŚP', 50, 46],
  ['DP', 50, 60], ['WB', 13, 61], ['WB', 87, 61], ['BO', 15, 76], ['BO', 85, 76], ['ŚO', 50, 79], ['BR', 50, 92]];
function posPitch(v, pid) {
  const main = v.pos; const alt = v.alt ?? {};
  const spots = PITCH_SPOTS.map(([k, x, y]) => {
    const lvl = alt[k] ?? 0;
    const prof = Math.round(proficiency({ pos: main, alt }, k));
    const state = k === main ? 'main' : lvl >= 70 ? 'alt' : lvl > 0 ? 'learn' : 'none';
    const dis = k === main || k === 'BR' || main === 'BR';
    const what = state === 'main' ? 'pozycja główna' : state === 'alt' ? 'pozycja dodatkowa' : state === 'learn' ? 'w nauce' : 'bez pozycji dodatkowej';
    return `<button type="button" class="ed-pp" style="left:${x}%;top:${y}%" data-act="ed-altpos" data-id="${esc(pid)}" data-pos="${esc(k)}" data-s="${state}"${dis ? ' disabled' : ''} aria-pressed="${state === 'main' || state === 'alt'}" aria-label="${esc(POS_NAMES[k] ?? k)}: ${what}, biegłość ${prof} %"><b>${esc(k)}</b><small>${prof} %</small></button>`;
  }).join('');
  return `<fieldset class="ed-attrs"><legend>Pozycje</legend><div class="ed-pitchbox">
    <div class="pitch2 ed-pitch" role="group" aria-label="Boisko: pozycje zawodnika">${spots}</div>
    <div class="ed-pitchinfo">
      <p class="ed-ppl"><i data-s="main"></i>Pozycja główna (wybierasz ją w polu „Pozycja”)</p>
      <p class="ed-ppl"><i data-s="alt"></i>Pozycja dodatkowa (dodana tutaj: ${ALT_MAX} % biegłości)</p>
      <p class="ed-ppl"><i data-s="learn"></i>Pozycja w nauce na treningu</p>
      <p class="fld__help">${main === 'BR' ? 'Bramkarz nie ma pozycji dodatkowych w polu.' : 'Kliknij pozycję, żeby dodać ją jako dodatkową albo usunąć. Procent to biegłość w meczu: naturalna z pozycji głównej albo dodatkowa, wyższa z nich. Zmiany zapisuje przycisk „Zapisz zmiany”.'}</p>
    </div>
    <input type="hidden" id="ed-alt" value="${esc(JSON.stringify(alt))}"></div></fieldset>`;
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
    ${posPitch(v, pid)}
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
    <p class="ed-note">Datapack to plik z danymi klubów (nazwy, stadion, pojemność, finanse) i zawodników. Możesz zapisać same swoje zmiany albo wszystkie kluby i wszystkich zawodników, razem ze zmienionymi. Plik wczytasz w innej grze. Dane klubów działają zawsze, dane zawodników tylko w tym samym świecie gry (ta sama kariera albo jej kopia).</p>
    <dl class="ed-sum"><div><dt>Zmienione kluby</dt><dd>${n.clubs}</dd></div><div><dt>Zmienieni zawodnicy</dt><dd>${n.players}</dd></div></dl>
    ${msgHtml(ed)}
    <div class="ed-actions">
      <button class="btn btn--primary" data-act="ed-export">Eksportuj zmiany</button>
      <button class="btn btn--primary" data-act="ed-export" data-full="1">Eksportuj wszystkie kluby i zawodników</button>
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
const TABS = [['clubs', 'Kluby'], ['players', 'Zawodnicy'], ['pack', 'Datapack']];

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
  let alt = {};
  try { alt = JSON.parse(val(root, 'ed-alt') || '{}'); } catch { /* puste */ }
  return { first: val(root, 'ed-first'), last: val(root, 'ed-last'), nat: val(root, 'ed-nat'), pos: val(root, 'ed-pos'), birthDate: val(root, 'ed-birth'), attrs, pot: val(root, 'ed-pot'), alt };
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
  if (act === 'ed-altpos') {
    // Przełączenie pozycji dodatkowej: szkic formularza (wpisane pola zostają), zapis dopiero przyciskiem
    const pid = data.id; const k = data.pos;
    const raw = readPlayerForm(root);
    const alt = { ...raw.alt };
    if ((alt[k] ?? 0) >= 70) delete alt[k]; else alt[k] = ALT_MAX;
    raw.alt = alt;
    ed.draft = { key: `player:${pid}`, v: raw }; ed.errors = null; ed.msg = null;
    return { focus: `[data-act="ed-altpos"][data-pos="${k}"]` };
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
  if (act === 'ed-crest-clear') { const n = editClub(game, data.id, { crest: '' }); clearMsg(); ed.msg = 'Usunięto własny herb klubu.'; return { save: n > 0 }; }
  if (act === 'ed-reset-club') { resetClub(game, data.id); clearMsg(); ed.msg = 'Przywrócono oryginalne nazwy klubu.'; return { save: true }; }
  if (act === 'ed-reset-player') { resetPlayer(game, data.id); clearMsg(); ed.msg = 'Zawodnik usunięty z datapacku.'; return { save: true }; }
  if (act === 'ed-clear') { ed.confirmClear = true; clearMsg(); return { focus: '[data-act="ed-clear-no"]' }; }
  if (act === 'ed-clear-no') { ed.confirmClear = false; return { focus: '[data-act="ed-clear"]' }; }
  if (act === 'ed-clear-yes') { clearPack(game); ed.confirmClear = false; clearMsg(); ed.msg = 'Datapack wyczyszczony.'; return { save: true }; }
  return {};
}
