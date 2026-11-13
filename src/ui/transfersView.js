// Zakładka „Transfery”: rynek (lista transferowa, wypożyczenia, wolni, wyszukiwarka), karta zawodnika z ofertą,
// oferty, kontrakty własnych zawodników, finanse i zarząd. Akcje z prefiksem „tf-”.
import { CLUBS_PL, clubById, LEAGUE_NAMES } from '../data/clubs_pl.js';
import { POS_NAMES, ATTRS } from '../data/attributes.js';
import { NAT_NAMES } from '../data/names.js';
import { squadOf } from '../world/worldGen.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate } from './dom.js';
import { GROUP } from '../career/squad.js';
import { reputationLabel } from '../career/reputation.js';
import { RENEW_WINDOW_MONTHS } from '../career/negotiation.js';
import {
  marketLists, searchPlayers, askingPrice, notForSale, playerWillingness, offerForPlayer, answerIncoming, loanIn,
  releaseCost, releasePlayer, inWindow, windowOf, fmtZl, recentlyMoved,
} from '../career/transfers.js';
import { spendable, wageRoom, wageBill, monthSummary, seasonSummary, FIN_LABELS } from '../career/finance.js';
import { trustLabel, tablePos } from '../career/board.js';
import { fansSummary } from '../career/fans.js';
import { canSign, YOUTH_EXEMPT_AGE, KEEP_MAX, PRESSURE_DAYS } from '../career/squadLimit.js';
import { limitStatus, toggleKeep, ageWord } from '../career/squadLimitSystem.js';
import { boardCaps, appealStatus } from '../career/boardRequests.js';
import { dealsView, dealTags, ownDealPanels, otherDealPanel, handleDealAction } from './transferDealsView.js'; // W toku, prekontrakty, prośby (docs/transfery.md)
import { effectiveAsk } from '../career/mindset.js';
import { checkUserPre } from '../career/preContracts.js';
import { DOMESTIC } from '../config/calendar2026.js';

const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const crest = (id, size = 20) => (clubById(id) ? crestHtml(clubById(id), { size, clubsById }) : '');
const groupOf = (p) => GROUP[p.pos] ?? 'MID';
// Finanse i Zarząd są w zakładce Klub (src/ui/klubView.js); funkcje widoków eksportowane stąd
export const TF_TABS = [['rynek', 'Rynek'], ['oferty', 'Oferty'], ['wtoku', 'W toku'], ['kontrakty', 'Kontrakty']];
const LISTS = [['transfer', 'Lista transferowa'], ['loan', 'Do wypożyczenia'], ['free', 'Wolni'], ['search', 'Wyszukaj']];
const POS_FILTERS = [['all', 'Wszyscy'], ['GK', 'Bramkarze'], ['DEF', 'Obrońcy'], ['MID', 'Pomocnicy'], ['ATT', 'Napastnicy']];
export const isTransferAction = (act) => typeof act === 'string' && act.startsWith('tf-');
const ovrTxt = (p) => Math.round(p.ovr);
export const monthsLeft = (game, p) => (p.contract?.until ? (Number(p.contract.until.slice(0, 4)) - Number(game.date.slice(0, 4))) * 12 + Number(p.contract.until.slice(5, 7)) - Number(game.date.slice(5, 7)) : 0);

/** Najlepszy zawodnik twojej kadry na tej samej pozycji (porównanie w karcie i w menu kontekstowym). */
export function bestOwnAt(game, pos) {
  return squadOf(game.world, game.clubId).filter((x) => x.pos === pos).sort((a, b) => b.ovr - a.ovr)[0] ?? null;
}

/** Tekst porównania z najlepszym zawodnikiem twojej kadry na pozycji p.pos. */
export function compareText(game, p) {
  const b = bestOwnAt(game, p.pos);
  if (!b) return `Nie masz w kadrze zawodnika na pozycji ${p.pos}.`;
  const d = Math.round(p.ovr) - Math.round(b.ovr);
  return `Twój najlepszy ${p.pos}: ${b.name}, OVR ${Math.round(b.ovr)} (${d > 0 ? `ten lepszy o ${d}` : d < 0 ? `ten słabszy o ${-d}` : 'ten sam poziom'}).`;
}

// ------------------------------------------------------------ Limit kadry (docs/limit-kadry.md)
const inDays = (n) => (n === 0 ? 'dziś' : n === 1 ? 'jutro' : `za ${n} dni`);

/** Panel „Limit kadry”: liczba wobec limitu zarządu i maksimum, sprawa zarządu z terminem i listą wskazanych. */
export function limitPanel(game) {
  const L = limitStatus(game);
  const c = L.case;
  const state = L.full ? 'full' : L.over > 0 || c ? 'over' : L.counted >= L.soft ? 'near' : 'ok';
  const pct = (n) => Math.max(0, Math.min(100, Math.round((n / Math.max(1, L.hard)) * 100)));
  const bonus = [L.europe ? 'gra w pucharach' : '', L.emergency ? 'kryzys kadrowy (za mało zdrowych na mecz)' : ''].filter(Boolean);
  const exemptNames = L.exempt.map((p) => p.name);
  let status;
  if (c?.stage === 'warn') status = `Zarząd żąda redukcji o ${L.over} do ${fmtDate(c.deadline)} (${inDays(L.daysLeft)}). Potem wystawi na listę transferową zawodników wskazanych niżej.`;
  else if (c?.stage === 'listed') status = `Zarząd wystawił zawodników na listę transferową. Jeśli do ${fmtDate(c.deadline)} (${inDays(L.daysLeft)}) kadra będzie wciąż za duża, wypożyczy młodszych, sprzeda taniej albo rozwiąże kontrakty.`;
  else if (c) status = `Kadra nadal za duża o ${L.over}. Zarząd wróci do sprawy ${fmtDate(c.deadline)} (${inDays(L.daysLeft)}).`;
  else if (L.over > 0) status = `Kadra ponad limitem zarządu o ${L.over}. Zarząd da ${PRESSURE_DAYS} dni na redukcję.`;
  else if (L.counted >= L.soft) status = `Kadra na granicy limitu. Kolejny podpis uruchomi nacisk zarządu (${PRESSURE_DAYS} dni na redukcję).`;
  else status = `Wolne miejsca do limitu zarządu: ${L.soft - L.counted}.`;
  if (L.full) status = `Kadra pełna: nowe transfery, wypożyczenia do klubu i wolni zawodnicy są zablokowani. ${status}`;
  const kept = c ? c.keep.map((id) => game.world.players[id]).filter(Boolean) : [];
  const tRow = (p, kept = false) => `<li class="tf-limit__t" data-pid="${esc(p.id)}">
      <button class="tf-limit__who" data-act="tf-open" data-id="${esc(p.id)}"><span class="tf-pos">${esc(p.pos)}</span><span class="tf-name">${esc(p.name)}<small>${esc(ageWord(p.age))}, ${fmtZl(p.contract?.wage ?? 0)} tygodniowo${game.market.userListed[p.id] ? `, na liście za ${fmtZl(game.market.userListed[p.id])}` : ''}</small></span><span class="tf-ovr">${ovrTxt(p)}</span></button>
      ${c ? `<button class="btn btn--quiet btn--sm" data-act="tf-keep" data-id="${esc(p.id)}"${!kept && c.keep.length >= KEEP_MAX ? ' disabled' : ''}>${kept ? 'Zdejmij osłonę' : 'Osłoń'}</button>` : ''}
    </li>`;
  const targets = L.targets.length ? `<h4>${c ? 'Zarząd wskaże' : 'Zarząd wskazałby'} (najsłabsi poza nietykalnymi)</h4><ul class="tf-limit__list">${L.targets.map((p) => tRow(p)).join('')}</ul>`
    : (L.over > 0 ? '<p class="hint">Zarząd nie ma kogo wskazać: pozostali zawodnicy są nietykalni albo pozycja spadłaby poniżej minimum.</p>' : '');
  return `<section class="tf-limit" data-state="${state}" aria-labelledby="tf-limit-h">
    <h3 id="tf-limit-h">Limit kadry</h3>
    <p class="tf-limit__nums"><b>${L.counted}</b><span>liczonych do limitu, limit zarządu <b>${L.soft}</b>, maksimum <b>${L.hard}</b></span></p>
    <span class="tf-limit__bar" role="img" aria-label="${L.counted} z ${L.hard} miejsc, limit zarządu ${L.soft}"><i style="width:${pct(L.counted)}%"></i><b style="left:${pct(L.soft)}%"></b></span>
    <p class="tf-limit__status">${esc(status)}</p>
    ${(L.over > 0 || c) ? targets : ''}
    ${kept.length ? `<h4>Osłonięci przez ciebie (${kept.length} z ${KEEP_MAX})</h4><ul class="tf-limit__list">${kept.map((p) => tRow(p, true)).join('')}</ul>` : ''}
    <p class="hint">Liczą się wszyscy zawodnicy pierwszej drużyny, także wypożyczeni do klubu. Nie liczą się wychowankowie do ${YOUTH_EXEMPT_AGE} lat, którzy nigdy nie zmienili klubu${exemptNames.length ? ` (${exemptNames.length}: ${esc(exemptNames.join(', '))})` : ''}, ani zawodnicy wypożyczeni do innych klubów.${bonus.length ? ` Progi podniesione o ${bonus.length * 2}: ${esc(bonus.join(', '))}.` : ''} Zarząd nie rusza kapitana, pierwszej jedenastki, pięciu najlepszych ani sprowadzonych w ostatnich 120 dniach.</p>
  </section>`;
}

// ------------------------------------------------------------ Wspólne elementy wyglądu
// Barwy znaczeniowe (transfers.css): good zielony (pieniądze na plus, dobrze), warn bursztyn (uwaga),
// bad czerwony (koszty, źle), info niebieski (informacja), misc fiolet (pozostałe).
const POS_ORDER = ['BR', 'ŚO', 'BO', 'WB', 'DP', 'ŚP', 'OP', 'SP', 'SN', 'NAP'];
const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const shortDate = (iso) => fmtDate(iso).replace(/, \d{4}$/, '');
const posBadge = (p) => `<span class="pos" data-g="${groupOf(p)}">${esc(p.pos)}</span>`;
const clubCell = (id) => (id ? `<span class="tf-club">${crest(id, 16)}<span>${esc(clubById(id)?.name ?? '')}</span></span>` : '<span class="tf-club tf-club--none">bez klubu</span>');

/** Kafelek liczby z barwą znaczeniową (m: good, warn, bad, info, misc). */
export function kpi(label, value, sub = '', m = 'info', extra = '') {
  return `<div class="tf-kpi" data-m="${m}"><small>${esc(label)}</small><b>${value}</b>${extra}${sub ? `<small>${sub}</small>` : ''}</div>`;
}
/** Panel z odcieniem i kolorowym paskiem u góry. */
export function panel(title, tone, body, { count = null, cls = '', attrs = '' } = {}) {
  return `<section class="tf-p${cls ? ` ${cls}` : ''}" data-t="${tone}" ${attrs}><h3>${esc(title)}${count != null ? ` <span>${count}</span>` : ''}</h3>${body}</section>`;
}
export const meter = (pct, tone) => `<span class="tf-meter" data-t="${tone}" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%"></i></span>`;

/** Nagłówek kolumny tabeli z sortowaniem; kolejny kierunek zapisany w data-dir (handler nie zna stanu ekranu). */
function th(scope, k, label, sort, { title = '', cls = '', first = 'desc' } = {}) {
  const on = sort.k === k;
  const next = on ? (sort.dir === 'desc' ? 'asc' : 'desc') : first;
  const aria = on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return `<th scope="col" class="${cls}" aria-sort="${aria}"><button data-act="tf-sort" data-s="${scope}" data-k="${k}" data-dir="${next}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}${on ? `<i aria-hidden="true">${sort.dir === 'asc' ? '▲' : '▼'}</i>` : ''}</button></th>`;
}
function sortBy(list, sort, val) {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = val(a, sort.k); const vb = val(b, sort.k);
    const d = typeof va === 'string' ? va.localeCompare(vb, 'pl') : va - vb;
    return dir * d || b.p.ovr - a.p.ovr;
  });
}
const willTone = (v) => (v === 'chętny' ? 'good' : v === 'otwarty' ? 'info' : v === 'niechętny' ? 'warn' : 'bad');
const tag = (txt, k = 'info') => `<span class="tf-tag" data-k="${k}">${esc(txt)}</span>`;

/** Pasek nad zakładkami: stan okna transferowego. */
function windowBadge(game) {
  const w = windowOf(game.date);
  return w ? `<span class="tf-win" data-k="open">Okno transferowe otwarte do ${esc(fmtDate(w.to))}</span>`
    : '<span class="tf-win" data-k="closed">Okno transferowe zamknięte</span>';
}

/** Kafelki pieniędzy i kadry (Rynek, Kontrakty). */
function moneyStrip(game) {
  const L = limitStatus(game);
  const room = wageRoom(game.finance, game.world, game.clubId);
  const c = game.finance.clubs[game.clubId];
  const bill = wageBill(game.world, game.clubId);
  const free = L.soft - L.counted;
  const lim = L.full ? 'bad' : L.over > 0 || L.case ? 'bad' : L.counted >= L.soft ? 'warn' : 'good';
  const w = windowOf(game.date);
  const offers = game.market.offers.filter((o) => o.kind === 'incoming' && o.status === 'open').length;
  const talks = Object.keys(game.market.talks).filter((id) => game.world.players[id] && game.world.players[id].clubId !== game.clubId).length;
  return `<div class="tf-kpis">
    ${kpi('Budżet transferowy', fmtZl(spendable(game.finance, game.clubId)), `przyznany ${fmtZl(c.transferBudget)}`, 'good')}
    ${kpi('Wolne w budżecie płac', fmtZl(room), `tygodniowo, płace ${fmtZl(bill)} z ${fmtZl(c.wageBudget)}`, room <= 0 ? 'bad' : room < c.wageBudget * 0.08 ? 'warn' : 'good', meter((bill / Math.max(1, c.wageBudget)) * 100, room <= 0 ? 'bad' : 'good'))}
    ${kpi('Limit kadry', `${L.counted}<em>/${L.soft}</em>`, L.full ? 'kadra pełna, podpisy zablokowane' : L.over > 0 ? `ponad limitem o ${L.over}` : `wolne miejsca: ${free}, maksimum ${L.hard}`, lim)}
    ${kpi('Oferty za twoich zawodników', String(offers), `rozmowy z klubami: ${talks}${w ? '' : ', okno zamknięte'}`, offers ? 'warn' : 'info')}
  </div>`;
}

// ------------------------------------------------------------ Rynek
function marketRows(game, list, pos, ui) {
  if (list === 'search') {
    const f = ui.tfFilter ?? {};
    return searchPlayers(game, { pos, maxPrice: Number(f.maxPrice) || Infinity, maxAge: Number(f.maxAge) || 99, minOvr: Number(f.minOvr) || 0, tier: f.tier ?? 'all', text: f.text ?? '' })
      .map(({ p, price, nfs }) => ({ p, price: nfs ? null : price, reasons: game.market.listed[p.id]?.reasons ?? [] }));
  }
  return marketLists(game)[list].filter((x) => pos === 'all' || groupOf(x.p) === pos)
    .map((x) => ({ p: x.p, price: list === 'free' ? effectiveAsk(x.p, clubById(game.clubId)?.tier ?? 1) : list === 'loan' ? x.p.contract?.wage ?? 0 : askingPrice(game, x.p), reasons: list === 'free' ? [] : x.reasons ?? [] }));
}

const SHORT_WHY = { 'Nadmiar zawodników na pozycji': 'nadmiar na pozycji', 'Poza szeroką kadrą meczową': 'poza kadrą meczową', 'Klub rozwiązuje kontrakt': 'klub rozwiązuje kontrakt' };
/** Powody wystawienia jako krótkie znaczniki (pełny tekst w podpowiedzi). */
function whyTags(reasons, moved = false) {
  const list = [...reasons, ...(moved ? ['Dopiero zmienił klub'] : [])];
  return list.map((r) => `<span class="tf-tag" data-k="${r === 'Klub rozwiązuje kontrakt' ? 'good' : 'n'}" title="${esc(r)}">${esc((SHORT_WHY[r] ?? r).toLowerCase())}</span>`).join(' ');
}

function marketTable(game, rows, list, sort, total) {
  const free = list === 'free';
  const priceLabel = free ? 'Oczekuje' : list === 'loan' ? 'Pensja' : 'Cena';
  const priceTitle = free ? 'Oczekiwana pensja tygodniowo' : list === 'loan' ? 'Obecna pensja tygodniowo' : 'Cena wywoławcza klubu';
  const head = `<tr>${th('m', 'pos', 'Poz.', sort, { cls: 'xl__pos', first: 'asc' })}${th('m', 'name', 'Zawodnik', sort, { cls: 'xl__nm', first: 'asc' })}${th('m', 'ovr', 'OVR', sort, { title: 'Ocena ogólna 1-20' })}${th('m', 'price', priceLabel, sort, { title: priceTitle, cls: 'tf-num' })}
    ${th('m', 'age', 'Wiek', sort, { first: 'asc' })}${free ? '' : th('m', 'club', 'Klub', sort, { cls: 'tf-l', first: 'asc' })}${th('m', 'value', 'Wartość', sort, { cls: 'tf-num' })}${free ? '' : th('m', 'until', 'Kontrakt do', sort, { first: 'asc' })}
    ${th('m', 'will', 'Nastawienie', sort, { title: 'Czy zawodnik chce przejść do twojego klubu', first: 'asc' })}<th scope="col" class="tf-l">${free ? 'Uwagi' : 'Powód wystawienia'}</th></tr>`;
  const body = rows.map((x) => {
    const { p } = x;
    return `<tr data-pid="${esc(p.id)}"><td class="xl__pos">${posBadge(p)}</td>
      <th scope="row" class="xl__nm"><button data-act="tf-open" data-id="${esc(p.id)}" data-pid="${esc(p.id)}"><span>${esc(p.name)}</span></button></th>
      <td class="xl__ovr">${ovrTxt(p)}</td><td class="tf-num tf-price">${x.price == null ? '<span class="tf-nfs">nie na sprzedaż</span>' : `${fmtZl(x.price)}${free || list === 'loan' ? '<small>/tydz.</small>' : ''}`}</td>
      <td>${p.age}</td>${free ? '' : `<td class="tf-l">${clubCell(p.clubId)}</td>`}<td class="tf-num">${fmtZl(p.value ?? 0)}</td>${free ? '' : `<td>${p.contract?.until ? esc(fmtDate(p.contract.until)) : '-'}</td>`}
      <td>${tag(x.will, willTone(x.will))}</td>
      <td class="tf-l tf-why">${(whyTags(x.reasons, free && recentlyMoved(p, game.date)) + dealTags(game, p)) || '<span class="xl__z">·</span>'}</td></tr>`;
  }).join('');
  const note = total > rows.length ? `Pokazano ${rows.length} z ${total}. Zawęź listę pozycją albo sortowaniem.` : `${total} ${total === 1 ? 'zawodnik' : 'zawodników'}.`;
  return `<p class="xl-note">${note} Kliknij nazwisko, żeby otworzyć kartę z ofertą.</p>
    <div class="xl-wrap tf-xl" tabindex="0" aria-label="Zawodnicy na rynku, tabela przewijana w poziomie"><table class="xl"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function marketView(game, ui) {
  const list = ui.tfList ?? 'transfer';
  const pos = ui.tfPos ?? 'all';
  const sort = ui.tfSort?.k ? ui.tfSort : { k: 'ovr', dir: 'desc' };
  const chips = `<div class="tf-bar"><div class="chips">${LISTS.map(([k, l]) => `<button class="chip" data-act="tf-list" data-l="${k}" aria-pressed="${list === k}">${l}</button>`).join('')}</div>
    <div class="chips chips--sm">${POS_FILTERS.map(([k, l]) => `<button class="chip" data-act="tf-pos" data-p="${k}" aria-pressed="${pos === k}">${l}</button>`).join('')}</div></div>`;
  let form = '';
  if (list === 'search') {
    const f = ui.tfFilter ?? {};
    form = `<form class="tf-search" data-tf-search>
      <label>Nazwisko<input name="text" value="${esc(f.text ?? '')}" autocomplete="off"></label>
      <label>Maks. cena (zł)<input name="maxPrice" type="number" step="50000" min="0" value="${f.maxPrice ?? ''}"></label>
      <label>Maks. wiek<input name="maxAge" type="number" min="16" max="40" value="${f.maxAge ?? ''}"></label>
      <label>Min. OVR<input name="minOvr" type="number" min="1" max="20" value="${f.minOvr ?? ''}"></label>
      <label>Liga<select name="tier"><option value="all">Wszystkie</option>${[1, 2, 3].map((t) => `<option value="${t}" ${String(f.tier) === String(t) ? 'selected' : ''}>${esc(LEAGUE_NAMES[t])}</option>`).join('')}</select></label>
      <button class="btn btn--primary" type="button" data-act="tf-search">Szukaj</button></form>`;
  }
  const all = marketRows(game, list, pos, ui);
  const needWill = sort.k === 'will';
  const withWill = (x) => ({ ...x, will: playerWillingness(game, x.p).verdict });
  const val = (x, k) => (k === 'pos' ? POS_ORDER.indexOf(x.p.pos) : k === 'name' ? x.p.name : k === 'ovr' ? x.p.ovr : k === 'price' ? (x.price ?? Infinity)
    : k === 'age' ? x.p.age : k === 'club' ? (clubById(x.p.clubId)?.name ?? '') : k === 'value' ? x.p.value ?? 0 : k === 'until' ? (x.p.contract?.until ?? '9999')
      : k === 'will' ? ['chętny', 'otwarty', 'niechętny', 'odmowa'].indexOf(x.will) : 0);
  const sorted = sortBy(needWill ? all.map(withWill) : all, sort, val).slice(0, 80);
  const rows = needWill ? sorted : sorted.map(withWill);
  const table = all.length ? marketTable(game, rows, list, sort, all.length) : `<p class="tf-empty">${list === 'search' ? 'Brak zawodników dla tych filtrów.' : 'Lista jest pusta.'}</p>`;
  return `${moneyStrip(game)}
    <div class="tf-grid tf-grid--table">
      <div class="tf-main">${chips}${form}${table}</div>
      <aside class="tf-side" aria-label="Kadra i budżet">${limitPanel(game)}${marketHelp(list)}</aside>
    </div>`;
}

function marketHelp(list) {
  const t = {
    transfer: 'Zawodnicy wystawieni przez kluby. Cena jest punktem wyjścia: klub przyjmie ofertę bliską cenie, przy niższej złoży kontrofertę. Po zgodzie klubu rozmawiasz z zawodnikiem o kontrakcie.',
    loan: 'Kluby chętnie wypożyczają młodych i rezerwowych do końca sezonu. Ty ustalasz, jaką część pensji pokrywasz.',
    free: 'Wolni zawodnicy nie kosztują odstępnego. Podpiszesz ich także poza oknem transferowym.',
    search: 'Szukasz w kadrach wszystkich klubów. Trzech najlepszych zawodników klubu nie jest na sprzedaż, chyba że mają klauzulę odstępnego.',
  }[list];
  return panel('Jak to działa', 'info', `<p class="tf-p__txt">${esc(t)}</p>`);
}

// ------------------------------------------------------------ Karta zawodnika (cudzy)
function strengths(p) {
  return Object.entries(p.attr ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => `<li title="${esc(ATTRS[k]?.name ?? k)}"><b>${v}</b><span>${esc(ATTRS[k]?.name ?? k)}</span></li>`).join('');
}

/** Porównanie z najlepszym zawodnikiem kadry na tej pozycji: dwa paski OVR. */
function compareBars(game, p) {
  const b = bestOwnAt(game, p.pos);
  const bar = (who, v, k) => `<li data-k="${k}"><span>${esc(who)}</span><span class="tf-cmp__bar"><i style="width:${Math.round((v / 20) * 100)}%"></i></span><b>${v}</b></li>`;
  return `<ul class="tf-cmp">${bar(p.name, ovrTxt(p), 'him')}${b ? bar(`${b.name} (twój najlepszy ${p.pos})`, ovrTxt(b), 'me') : ''}</ul><p class="tf-p__txt">${esc(compareText(game, p))}</p>`;
}

function cardHead(game, p, extra = '') {
  return `<header class="tf-ch" data-pid="${esc(p.id)}">
    <span class="tf-ch__crest">${p.clubId ? crest(p.clubId, 48) : ''}</span>
    <div class="tf-ch__who"><h2>${esc(p.name)}</h2>
      <p>${posBadge(p)} <span>${esc(POS_NAMES?.[p.pos] ?? p.pos)}, ${p.age} lat, ${esc(NAT_NAMES[p.nat] ?? p.nat)}${p.clubId ? `, ${esc(clubById(p.clubId)?.name)}` : ', wolny zawodnik'}</span></p>
      ${extra}</div>
    <b class="tf-ch__ovr" title="Ocena ogólna 1-20"><small>OVR</small>${ovrTxt(p)}</b>
  </header>`;
}
const fact = (k, v, m = '') => `<li${m ? ` data-m="${m}"` : ''}><small>${esc(k)}</small><b>${v}</b></li>`;

function playerCard(game, p, ui) {
  const mine = p.clubId === game.clubId;
  if (mine) return ownCard(game, p, ui);
  const listed = game.market.listed[p.id];
  const price = askingPrice(game, p);
  const will = playerWillingness(game, p);
  const talk = game.market.talks[p.id];
  const free = !p.clubId;
  const nfs = notForSale(game, p) && !p.contract?.clause;
  const cap = canSign(game);
  const open = inWindow(game.date);
  const actions = [];
  if (free) actions.push(`<p class="tf-p__txt">Wolny zawodnik: bez odstępnego, rozmawiasz od razu o kontrakcie.</p><button class="btn btn--primary" data-act="tf-negotiate" data-id="${esc(p.id)}">Rozmawiaj o kontrakcie</button>`);
  else if (talk?.accepted) actions.push(`<p class="notice">Klub przyjął ofertę ${fmtZl(talk.accepted)}.</p><button class="btn btn--primary" data-act="tf-negotiate" data-id="${esc(p.id)}">Rozmawiaj z zawodnikiem</button>`);
  else if (!nfs) {
    actions.push(`<div class="tf-offer"><label>Oferta odstępnego (zł)<input id="tfFee" type="number" min="0" step="10000" value="${talk?.counter ?? Math.round(price * 0.9 / 10000) * 10000}"></label>
      <button class="btn btn--primary" data-act="tf-offer" data-id="${esc(p.id)}" ${open ? '' : 'disabled'}>Złóż ofertę</button></div>
      <p class="hint">Cena klubu: ${fmtZl(price)}.${talk?.counter ? ` Kontroferta klubu: ${fmtZl(talk.counter)}.` : ''}${open ? '' : ' Okno transferowe jest zamknięte.'}</p>`);
  } else actions.push('<p class="tf-p__txt">Klub nie chce sprzedać tego zawodnika (jeden z trzech najlepszych w kadrze, bez klauzuli odstępnego).</p>');
  if (!free && (listed?.kind === 'loan' || (p.age <= 21 && !nfs))) {
    actions.push(`<div class="tf-offer tf-offer--loan"><label>Wypożyczenie: część pensji<select id="tfShare">${[50, 75, 100].map((s) => `<option value="${s}">${s} %</option>`).join('')}</select></label>
      <button class="btn btn--quiet" data-act="tf-loan" data-id="${esc(p.id)}" ${open ? '' : 'disabled'}>Wypożycz do końca sezonu</button></div>`);
  }
  const dp = otherDealPanel(game, p); // transakcja w toku, umowa od 1 lipca (transferDealsView.js)
  if (dp.blocked) actions.length = 0;
  if (dp.html) actions.push(dp.html);
  const blocked = will.verdict === 'odmowa' || !cap.ok;
  const appeal = game.board?.requests?.vetoes?.some((v) => v.playerId === p.id && v.status === 'open') ? appealStatus(game, p.id) : null; // weto zarządu
  const deal = `${ui.tfMsg ? `<p class="notice">${esc(ui.tfMsg)}</p>` : ''}
    ${appeal?.ok ? `<button class="btn btn--quiet" data-act="br-appeal" data-id="${esc(p.id)}">Odwołaj się od weta zarządu</button>` : ''}
    ${!cap.ok ? `<p class="notice notice--err">${esc(cap.text)}</p>` : cap.warn ? `<p class="notice">${esc(cap.text)}</p>` : ''}
    ${will.verdict === 'odmowa' ? '<p class="notice notice--err">Zawodnik nie chce rozmawiać o przejściu do twojego klubu.</p>' : cap.ok ? actions.join('') : ''}`;
  const notes = [
    ...(listed ? [`Wystawiony: ${listed.reasons.join(', ').toLowerCase()}`] : []),
    ...(recentlyMoved(p, game.date) ? ['Dopiero zmienił klub'] : []),
    ...(p.contract?.clause ? [`Klauzula odstępnego: ${fmtZl(p.contract.clause)}`] : []),
  ];
  return `<div class="tf-back"><button class="btn btn--quiet btn--sm" data-act="tf-close">Wróć do listy</button></div>
    <div class="tf-grid tf-card">
      <div class="tf-main">
        ${cardHead(game, p, `<button class="btn btn--quiet btn--sm" data-act="extplayer" data-id="${esc(p.id)}">Profil i statystyki</button>`)}
        <ul class="tf-facts">
          ${fact('Wartość', fmtZl(p.value))}
          ${free ? fact('Oczekuje', `ok. ${fmtZl(effectiveAsk(p, clubById(game.clubId)?.tier ?? 1))}<small> tygodniowo</small>`, 'warn') : fact('Cena klubu', nfs ? 'nie na sprzedaż' : fmtZl(price), nfs ? 'bad' : 'good')}
          ${free ? '' : fact('Pensja', `${fmtZl(p.contract.wage)}<small> tygodniowo</small>`)}
          ${free ? '' : fact('Kontrakt do', esc(fmtDate(p.contract.until)))}
          ${fact('Reputacja', esc(reputationLabel(p.rep ?? 30)), 'misc')}
          ${fact('Nastawienie', esc(will.verdict), willTone(will.verdict))}
        </ul>
        <div class="tf-cols">
          ${panel('Mocne strony', 'info', `<ul class="tf-attrs">${strengths(p)}</ul>`)}
          ${panel('Porównanie z twoją kadrą', 'misc', compareBars(game, p))}
        </div>
        ${will.reasons.length || notes.length ? panel('Uwagi', will.verdict === 'chętny' ? 'good' : 'warn', `<ul class="tf-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}${will.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`) : ''}
      </div>
      <aside class="tf-side">${panel(free ? 'Kontrakt' : 'Oferta', blocked ? 'bad' : 'good', deal, { cls: 'tf-deal' })}</aside>
    </div>`;
}

// ------------------------------------------------------------ Własny zawodnik
function ownCard(game, p, ui) {
  const listedPrice = game.market.userListed[p.id];
  const ml = monthsLeft(game, p);
  const canRenew = !p.loan && ml <= RENEW_WINDOW_MONTHS && !p.preContract;
  const L = limitStatus(game);
  const kept = L.case?.keep.includes(p.id);
  const target = L.targets.some((x) => x.id === p.id);
  const limitNote = target || kept ? `<p class="notice${target ? ' notice--err' : ''}">${target ? `Zarząd wskaże tego zawodnika, jeśli kadra nie zmieści się w limicie (${L.counted}/${L.soft}).` : 'Osłoniłeś tego zawodnika przed działaniem zarządu.'}</p>${L.case ? `<button class="btn btn--quiet btn--sm" data-act="tf-keep" data-id="${esc(p.id)}">${kept ? 'Zdejmij osłonę' : 'Osłoń przed zarządem'}</button>` : ''}` : '';
  const mor = Math.round(p.morale ?? 12);
  const renew = canRenew ? `<p class="tf-p__txt">Kontrakt kończy się ${esc(fmtDate(p.contract.until))}. Możesz rozmawiać o przedłużeniu.</p><button class="btn btn--primary" data-act="tf-renew" data-id="${esc(p.id)}">Przedłuż kontrakt</button>`
    : `<p class="tf-p__txt">${p.loan ? 'Zawodnik wypożyczony: kontrakt należy do jego klubu.' : p.preContract ? 'Zawodnik ma umowę z innym klubem od 1 lipca.' : `Rozmowy o przedłużeniu najwcześniej ${RENEW_WINDOW_MONTHS} miesięcy przed końcem kontraktu.`}</p>`;
  const sell = p.loan ? '' : listedPrice ? `<p class="tf-p__txt">Na liście transferowej za <b>${fmtZl(listedPrice)}</b>.</p><button class="btn btn--quiet" data-act="tf-unlist" data-id="${esc(p.id)}">Zdejmij z listy</button>`
    : `<div class="tf-offer"><label>Cena na liście (zł)<input id="tfPrice" type="number" min="0" step="10000" value="${Math.round(p.value * 1.2 / 10000) * 10000}"></label><button class="btn btn--quiet" data-act="tf-list-own" data-id="${esc(p.id)}">Wystaw na listę</button></div>`;
  const release = p.loan ? '' : ui.tfConfirm === p.id ? `<p class="notice notice--err">Rozwiązanie kontraktu kosztuje ${fmtZl(releaseCost(game, p))}.</p><button class="btn btn--quiet" data-act="tf-release-ok" data-id="${esc(p.id)}">Potwierdź rozwiązanie</button>`
    : `<p class="tf-p__txt">Odprawa: ${fmtZl(releaseCost(game, p))}.</p><button class="btn btn--quiet" data-act="tf-release" data-id="${esc(p.id)}">Rozwiąż kontrakt</button>`;
  const flags = [
    p.loan ? tag(`wypożyczony z ${clubById(p.loan.from)?.name ?? ''}`, 'info') : '',
    p.contract.promise?.role ? tag(`obietnica: ${p.contract.promise.role}`, 'misc') : '',
    p.renewRefused ? tag('odmówił przedłużenia', 'bad') : '',
    p.transferRequest ? tag('prosi o transfer', 'warn') : '',
    listedPrice ? tag('na liście transferowej', 'warn') : '',
    dealTags(game, p),
  ].filter(Boolean).join('');
  const busy = !!p.transfer; // transakcja w toku: bez listy i rozwiązania kontraktu
  return `<div class="tf-back"><button class="btn btn--quiet btn--sm" data-act="tf-close">Wróć do listy</button></div>
    <div class="tf-grid tf-card">
      <div class="tf-main">
        ${cardHead(game, p, flags ? `<p class="tf-tags">${flags}</p>` : '')}
        <ul class="tf-facts">
          ${fact('Pensja', `${fmtZl(p.contract.wage)}<small> tygodniowo</small>`)}
          ${fact('Kontrakt do', esc(fmtDate(p.contract.until)), ml <= 6 ? 'bad' : ml <= 12 ? 'warn' : '')}
          ${fact('Pozostało', `${Math.max(0, ml)} mies.`, ml <= 6 ? 'bad' : ml <= 12 ? 'warn' : 'good')}
          ${fact('Wartość', fmtZl(p.value))}
          ${fact('Morale', `${mor}<small>/20</small>`, mor >= 14 ? 'good' : mor >= 10 ? 'info' : 'warn')}
          ${fact('Wiek', `${p.age} lat`)}
        </ul>
        ${ui.tfMsg ? `<p class="notice">${esc(ui.tfMsg)}</p>` : ''}
        ${limitNote}
      </div>
      <aside class="tf-side tf-actions">
        ${ownDealPanels(game, p, ui)}
        ${panel('Przedłużenie kontraktu', canRenew ? 'good' : 'info', renew)}
        ${p.loan || busy ? '' : panel('Lista transferowa', 'warn', sell)}
        ${p.loan || busy ? '' : panel('Rozwiązanie kontraktu', 'bad', release)}
      </aside>
    </div>`;
}

// ------------------------------------------------------------ Kontrakty
function contractsView(game, ui) {
  const sort = ui.tfCSort?.k ? ui.tfCSort : { k: 'until', dir: 'asc' };
  const c = game.finance.clubs[game.clubId];
  const bill = wageBill(game.world, game.clubId);
  const L = limitStatus(game);
  const rows = squadOf(game.world, game.clubId).map((p) => ({ p, ml: monthsLeft(game, p) }));
  const val = (x, k) => (k === 'pos' ? POS_ORDER.indexOf(x.p.pos) : k === 'name' ? x.p.name : k === 'ovr' ? x.p.ovr : k === 'wage' ? x.p.contract.wage
    : k === 'until' ? x.p.contract.until : k === 'age' ? x.p.age : k === 'value' ? x.p.value ?? 0 : k === 'share' ? x.p.contract.wage / Math.max(1, bill) : 0);
  const sorted = sortBy(rows, sort, val);
  const head = `<tr>${th('c', 'pos', 'Poz.', sort, { cls: 'xl__pos', first: 'asc' })}${th('c', 'name', 'Zawodnik', sort, { cls: 'xl__nm', first: 'asc' })}${th('c', 'ovr', 'OVR', sort)}
    ${th('c', 'until', 'Kontrakt do', sort, { first: 'asc' })}${th('c', 'wage', 'Pensja', sort, { title: 'Pensja tygodniowo', cls: 'tf-num' })}${th('c', 'share', 'Udział w płacach', sort, { cls: 'tf-l' })}
    ${th('c', 'age', 'Wiek', sort, { first: 'asc' })}${th('c', 'value', 'Wartość', sort, { cls: 'tf-num' })}<th scope="col" class="tf-l">Status</th></tr>`;
  const maxWage = Math.max(1, ...rows.map((x) => x.p.contract.wage));
  const body = sorted.map(({ p, ml }) => {
    const k = ml <= 6 ? 'bad' : ml <= 12 ? 'warn' : 'ok';
    const st = [
      game.market.userListed[p.id] ? tag(`na liście, ${fmtZl(game.market.userListed[p.id])}`, 'warn') : '',
      p.loan ? tag(`wypożyczony z ${clubById(p.loan.from)?.name ?? ''}`, 'info') : '',
      p.renewRefused ? tag('odmówił przedłużenia', 'bad') : '',
      p.transferRequest ? tag('prosi o transfer', 'warn') : '',
      L.targets.some((x) => x.id === p.id) ? tag('wskazany przez zarząd', 'bad') : '',
      !p.loan && ml <= RENEW_WINDOW_MONTHS && !p.renewRefused && !p.preContract ? tag('można przedłużyć', 'good') : '',
      dealTags(game, p),
    ].filter(Boolean).join('');
    return `<tr data-pid="${esc(p.id)}"><td class="xl__pos">${posBadge(p)}</td>
      <th scope="row" class="xl__nm"><button data-act="tf-open" data-id="${esc(p.id)}" data-pid="${esc(p.id)}"><span>${esc(p.name)}</span></button></th>
      <td class="xl__ovr">${ovrTxt(p)}</td>
      <td class="tf-until" data-k="${k}">${esc(fmtDate(p.contract.until))}<small>${ml <= 0 ? 'kończy się' : `${ml} mies.`}</small></td>
      <td class="tf-num">${fmtZl(p.contract.wage)}</td>
      <td class="tf-l"><span class="tf-share"><i style="width:${Math.round((p.contract.wage / maxWage) * 100)}%"></i></span>${Math.round((p.contract.wage / Math.max(1, bill)) * 100)}%</td>
      <td>${p.age}</td><td class="tf-num">${fmtZl(p.value ?? 0)}</td><td class="tf-l tf-st">${st || '<span class="xl__z">·</span>'}</td></tr>`;
  }).join('');
  const foot = `<tr><td></td><th scope="row" class="xl__nm">Razem (${rows.length})</th><td></td><td></td><td class="tf-num">${fmtZl(bill)}</td><td class="tf-l">budżet ${fmtZl(c.wageBudget)}</td><td></td><td class="tf-num">${fmtZl(rows.reduce((s, x) => s + (x.p.value ?? 0), 0))}</td><td></td></tr>`;
  const ending = rows.filter((x) => !x.p.loan && x.ml <= 12).sort((a, b) => a.ml - b.ml || b.p.ovr - a.p.ovr);
  const endPanel = panel('Kończące się kontrakty', ending.length ? 'warn' : 'good', ending.length
    ? `<ul class="tf-mini">${ending.slice(0, 8).map(({ p, ml }) => `<li data-pid="${esc(p.id)}"><button data-act="tf-open" data-id="${esc(p.id)}">${posBadge(p)}<span>${esc(p.name)}</span><small data-k="${ml <= 6 ? 'bad' : 'warn'}">${ml <= 0 ? 'kończy się' : `${ml} mies.`}</small></button></li>`).join('')}</ul>`
    : '<p class="tf-p__txt">Żaden kontrakt nie kończy się w ciągu roku.</p>', { count: ending.length });
  return `${moneyStrip(game)}
    <div class="tf-grid tf-grid--table">
      <div class="tf-main">
        <p class="xl-note">Płace ${fmtZl(bill)} tygodniowo z budżetu ${fmtZl(c.wageBudget)}. Kontrakty kończące się w ciągu 6 miesięcy na czerwono, w ciągu roku na bursztynowo. Kliknij nazwisko, żeby przedłużyć, wystawić albo rozwiązać kontrakt.</p>
        <div class="xl-wrap tf-xl" tabindex="0" aria-label="Kontrakty zawodników, tabela przewijana w poziomie"><table class="xl"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>
      </div>
      <aside class="tf-side" aria-label="Kontrakty i limit kadry">${endPanel}${limitPanel(game)}</aside>
    </div>`;
}

// ------------------------------------------------------------ Oferty
function offersView(game) {
  const open = game.market.offers.filter((o) => o.kind === 'incoming' && o.status === 'open');
  const mine = Object.entries(game.market.talks).map(([id, t]) => ({ p: game.world.players[id], t })).filter((x) => x.p && x.p.clubId !== game.clubId);
  const hist = game.market.history.filter((h) => h.from === game.clubId || h.to === game.clubId).slice(0, 20);
  const all = game.market.history.slice(0, 40);
  const terms = (h) => (h.kind === 'loan' ? 'wypożyczenie' : h.fee ? fmtZl(h.fee) : h.kind === 'release' ? 'rozwiązanie' : h.kind === 'pre' ? 'umowa od 1 lipca' : 'wolny transfer');
  const toCell = (h) => (h.toName ? `<span class="tf-club">${esc(h.toName)}</span>` : h.to ? clubCell(h.to) : '<span class="tf-club tf-club--none">bez klubu</span>');
  const incoming = open.length ? `<ul class="tf-offers">${open.map((o) => {
    const p = game.world.players[o.playerId];
    const who = o.foreign ? o.foreign.name : clubById(o.from).name;
    const whom = p ? `${p.pos} ${p.name}` : 'zawodnika';
    const what = o.foreign ? `${o.foreign.countryName ?? o.foreign.country}: chce ${whom}, pensja ok. ${fmtZl(o.foreign.wage)} tygodniowo` : o.pre ? `chce ${whom} już teraz (umowa od 1 lipca)` : `chce ${whom}`;
    return `<li class="tf-incoming" data-pid="${esc(o.playerId)}">
      <div class="tf-incoming__who">${o.foreign ? '<span class="td-flag" aria-hidden="true"></span>' : crest(o.from, 32)}<div><b>${esc(who)}</b><span>${esc(what)}</span></div></div>
      <div class="tf-incoming__fee"><b>${fmtZl(o.fee)}</b><small>ważna do ${esc(fmtDate(o.expires))}${p ? `, wartość ${fmtZl(p.value)}` : ''}</small></div>
      <span class="tf-btns"><button class="btn btn--primary btn--sm" data-act="tf-answer" data-o="${esc(o.id)}" data-a="accept">Przyjmij</button>${o.raised || o.pre ? '' : `<button class="btn btn--quiet btn--sm" data-act="tf-answer" data-o="${esc(o.id)}" data-a="more">Żądaj więcej</button>`}<button class="btn btn--quiet btn--sm" data-act="tf-answer" data-o="${esc(o.id)}" data-a="reject">Odrzuć</button></span>
    </li>`;
  }).join('')}</ul>` : '<p class="tf-p__txt">Brak ofert. Kluby składają je w oknie transferowym, częściej za zawodników z listy transferowej.</p>';
  const talks = mine.length ? `<ul class="tf-mini">${mine.map(({ p, t }) => {
    const [txt, k] = t.accepted ? [`przyjęta: ${fmtZl(t.accepted)}`, 'good'] : t.until ? [`przerwa do ${fmtDate(t.until)}`, 'bad'] : t.counter ? [`klub chce ${fmtZl(t.counter)}`, 'warn'] : ['odrzucona', 'bad'];
    return `<li data-pid="${esc(p.id)}"><button data-act="tf-open" data-id="${esc(p.id)}">${posBadge(p)}<span>${esc(p.name)}<em>${esc(clubById(p.clubId)?.name ?? 'bez klubu')}</em></span><small data-k="${k}">${esc(txt)}</small></button></li>`;
  }).join('')}</ul>` : '<p class="tf-p__txt">Nie prowadzisz rozmów. Ofertę złożysz z karty zawodnika na Rynku.</p>';
  const listedOwn = Object.entries(game.market.userListed).map(([id, price]) => ({ p: game.world.players[id], price })).filter((x) => x.p && x.p.clubId === game.clubId);
  const ownListed = listedOwn.length ? `<ul class="tf-mini">${listedOwn.map(({ p, price }) => `<li data-pid="${esc(p.id)}"><button data-act="tf-open" data-id="${esc(p.id)}">${posBadge(p)}<span>${esc(p.name)}<em>OVR ${ovrTxt(p)}, wartość ${fmtZl(p.value)}</em></span><small>${fmtZl(price)}</small></button></li>`).join('')}</ul>`
    : '<p class="tf-p__txt">Nikogo nie wystawiłeś. Zrobisz to w karcie zawodnika (zakładka Kontrakty).</p>';
  const ownMoves = hist.length ? `<ul class="tf-mini tf-mini--moves">${hist.map((h) => {
    const sold = h.from === game.clubId;
    return `<li${game.world.players[h.playerId] ? ` data-pid="${esc(h.playerId)}"` : ''}><div><span class="tf-dir" data-k="${sold ? 'out' : 'in'}">${sold ? 'Odszedł' : 'Przyszedł'}</span><span>${esc(h.name)}<em>${esc(sold ? `do ${h.toName ?? (h.to ? clubById(h.to)?.name ?? '' : 'bez klubu')}` : `z ${h.from ? clubById(h.from)?.name ?? '' : 'wolny'}`)}, ${esc(shortDate(h.date))}</em></span><b>${esc(terms(h))}</b></div></li>`;
  }).join('')}</ul>` : '<p class="tf-p__txt">Jeszcze żadnych.</p>';
  const recent = all.length ? `<div class="xl-wrap tf-xl tf-xl--hist" tabindex="0" aria-label="Ostatnie transfery w Polsce, tabela przewijana w poziomie"><table class="xl"><thead><tr>
      <th scope="col" class="xl__nm">Zawodnik</th><th scope="col">Poz.</th><th scope="col" class="tf-num">Kwota</th><th scope="col" class="tf-l">Z klubu</th><th scope="col" class="tf-l">Do klubu</th><th scope="col">Data</th></tr></thead>
    <tbody>${all.map((h) => `<tr${game.world.players[h.playerId] ? ` data-pid="${esc(h.playerId)}"` : ''}${h.from === game.clubId || h.to === game.clubId ? ' class="is-mine"' : ''}><th scope="row" class="xl__nm"><span class="tf-nm">${esc(h.name)}</span></th><td>${esc(h.pos)}</td>
      <td class="tf-num tf-fee" data-k="${h.fee ? 'fee' : 'free'}">${esc(terms(h))}</td><td class="tf-l">${h.from ? clubCell(h.from) : '<span class="tf-club tf-club--none">wolny</span>'}</td><td class="tf-l">${toCell(h)}</td><td>${esc(shortDate(h.date))}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="tf-p__txt">Brak.</p>';
  return `<div class="tf-grid tf-grid--offers">
      <div class="tf-main tf-stack">
        ${panel('Oferty za twoich zawodników', open.length ? 'warn' : 'info', incoming, { count: open.length })}
        ${panel('Twoi zawodnicy na liście transferowej', 'warn', ownListed, { count: listedOwn.length })}
        ${panel('Twoje rozmowy z klubami', 'info', talks, { count: mine.length })}
        ${panel('Transfery twojego klubu', 'good', ownMoves, { count: hist.length })}
      </div>
      <div class="tf-side tf-side--wide">${panel('Ostatnie transfery w Polsce', 'misc', recent)}</div>
    </div>`;
}

// ------------------------------------------------------------ Finanse i zarząd
/** Lista pozycji z poziomymi paskami (jedna seria, kolor panelu). */
function moneyBars(obj, empty = 'Brak') {
  const rows = Object.entries(obj).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  const sum = rows.reduce((s, [, v]) => s + v, 0);
  return rows.length ? `<ul class="tf-bars">${rows.map(([k, v]) => `<li><span>${esc(FIN_LABELS[k] ?? k)}</span><b>${fmtZl(v)}</b><span class="tf-bars__bar" title="${esc(`${FIN_LABELS[k] ?? k}: ${fmtZl(v)}, ${Math.round((v / sum) * 100)}% sumy`)}"><i style="width:${Math.max(2, Math.round((v / max) * 100))}%"></i></span></li>`).join('')}</ul>
    <p class="tf-sum"><span>Razem</span><b>${fmtZl(sum)}</b></p>` : `<p class="tf-p__txt">${esc(empty)}</p>`;
}

/** Wykres miesięcy: przychody i koszty obok siebie (wspólna skala), wynik pod spodem. */
function monthsChart(c) {
  const months = Object.keys(c.ledger ?? {}).sort();
  if (!months.length) return '<p class="tf-p__txt">Pierwsze dane po pierwszym miesiącu sezonu.</p>';
  const S = months.map((m) => monthSummary(c, m));
  const max = Math.max(1, ...S.map((s) => Math.max(s.income, s.expense)));
  const h = (v) => Math.max(1, Math.round((v / max) * 100));
  return `<p class="tf-legend"><span data-k="in">Przychody</span><span data-k="out">Koszty</span></p>
    <ol class="tf-chart" style="--n:${S.length}">${S.map((s) => {
      const [y, mm] = s.month.split('-');
      const name = `${MONTHS_PL[Number(mm) - 1]} ${y}`;
      return `<li title="${esc(`${name}: przychody ${fmtZl(s.income)}, koszty ${fmtZl(s.expense)}, wynik ${s.net >= 0 ? '+' : ''}${fmtZl(s.net)}`)}">
        <span class="tf-chart__cols"><i data-k="in" style="height:${h(s.income)}%"></i><i data-k="out" style="height:${h(s.expense)}%"></i></span>
        <span class="tf-chart__m">${esc(MONTHS_PL[Number(mm) - 1])}</span><b class="tf-chart__net" data-k="${s.net < 0 ? 'neg' : 'pos'}">${s.net >= 0 ? '+' : ''}${fmtZl(s.net).replace(' zł', '')}</b></li>`;
    }).join('')}</ol>`;
}

/**
 * Plan sezonu a wykonanie (prawa kolumna Finansów): roczny plan klubu (clubPlan) wobec wpływów i kosztów od lipca,
 * z częścią sezonu, która minęła. Premia za miejsce w lidze i nagrody przychodzą po rozstrzygnięciach.
 */
function planPanel(game, c, s) {
  const p = c.plan;
  if (!p) return '';
  const [y, m] = game.date.split('-').map(Number);
  const done = Math.min(12, Math.max(1, (m >= 7 ? m - 6 : m + 6))) / 12; // miesiące od lipca (bieżący liczony)
  const row = (label, plan, actual, dir) => {
    const ratio = plan > 0 ? actual / plan : 0;
    const ahead = dir === 'in' ? ratio >= done - 0.05 : ratio <= done + 0.05;
    return `<div class="klub-plan__row"><span>${esc(label)}<small> plan ${fmtZl(plan)}</small></span><span>${fmtZl(actual)}</span><b data-k="${ahead ? 'pos' : 'neg'}">${Math.round(ratio * 100)}%</b></div>`;
  };
  const inn = s.in ?? {}; const out = s.out ?? {};
  const rows = [
    row('Dzień meczowy', p.tickets, inn.tickets ?? 0, 'in'),
    row('Prawa TV i podział ligi', p.tv, inn.tv ?? 0, 'in'),
    row('Sponsorzy', p.sponsor, inn.sponsor ?? 0, 'in'),
    ...(p.owner ? [row('Właściciel', p.owner, inn.owner ?? 0, 'in')] : []),
    row('Pensje', p.wages, out.wages ?? 0, 'out'),
    row('Koszty klubu i obiektów', p.ops + (p.upkeep ?? 0) - (p.upkeepBase ?? 0), (out.ops ?? 0) + (out.upkeep ?? 0), 'out'),
  ].join('');
  void y;
  return panel('Plan sezonu a wykonanie', 'misc', `<p class="tf-p__txt">Minęło ${Math.round(done * 100)}% sezonu. Zielony procent: zgodnie z planem albo lepiej. Premia za miejsce w lidze (plan ${fmtZl(p.merit ?? 0)}) i nagrody wpływają po rozstrzygnięciach.</p><div class="klub-plan">${rows}</div>`);
}

export function financeView(game) {
  const c = game.finance.clubs[game.clubId];
  const s = seasonSummary(c);
  const m = monthSummary(c, game.date.slice(0, 7));
  const bill = wageBill(game.world, game.clubId);
  const wPct = (bill / Math.max(1, c.wageBudget)) * 100;
  const diff = c.balance - c.start;
  const [y, mm] = game.date.slice(0, 7).split('-');
  const monthName = `${MONTHS_PL[Number(mm) - 1]} ${y}`;
  return `<div class="tf-kpis">
      ${kpi('Saldo', `<span class="${c.balance < 0 ? 'neg' : ''}">${fmtZl(c.balance)}</span>`, `${diff >= 0 ? '+' : ''}${fmtZl(diff)} od startu sezonu (${fmtZl(c.start)})`, c.balance < 0 ? 'bad' : diff < 0 ? 'warn' : 'good')}
      ${kpi('Budżet transferowy', fmtZl(spendable(game.finance, game.clubId)), `przyznany ${fmtZl(c.transferBudget)}`, 'info')}
      ${kpi('Płace tygodniowo', fmtZl(bill), `${Math.round(wPct)}% budżetu ${fmtZl(c.wageBudget)}`, wPct > 100 ? 'bad' : wPct > 92 ? 'warn' : 'good', meter(wPct, wPct > 100 ? 'bad' : wPct > 92 ? 'warn' : 'good'))}
      ${kpi('Wynik sezonu', `<span class="${s.net < 0 ? 'neg' : ''}">${s.net >= 0 ? '+' : ''}${fmtZl(s.net)}</span>`, `przychody ${fmtZl(s.income)}, koszty ${fmtZl(s.expense)}`, s.net < 0 ? 'bad' : 'good')}
    </div>
    <div class="tf-fin">
      <div class="tf-stack">
        ${panel('Przychody w sezonie', 'good', moneyBars(s.in))}
        ${panel('Koszty w sezonie', 'bad', moneyBars(s.out))}
      </div>
      <div class="tf-stack">
        ${panel('Miesiąc po miesiącu', 'info', monthsChart(c))}
        ${panel(`Ten miesiąc (${monthName})`, 'misc', `<div class="tf-month"><div><h4>Przychody</h4>${moneyBars(m.in)}</div><div><h4>Koszty</h4>${moneyBars(m.out)}</div></div>
          <p class="tf-sum tf-sum--net"><span>Wynik miesiąca</span><b class="${m.net < 0 ? 'neg' : ''}">${m.net >= 0 ? '+' : ''}${fmtZl(m.net)}</b></p>`)}
      </div>
      <div class="tf-stack">
        ${planPanel(game, c, s)}
        ${panel('Ostatnie operacje', 'info', `<ul class="tf-log">${c.log.slice(0, 12).map((l) => `<li><time>${esc(shortDate(l.date))}</time><span>${esc(l.note)}</span><b data-k="${l.dir}">${l.dir === 'out' ? '-' : '+'}${fmtZl(l.amount)}</b></li>`).join('') || '<li><span>Brak.</span></li>'}</ul>`)}
      </div>
    </div>`;
}

export function boardView(game) {
  const B = game.board; const M = game.manager;
  const t = tablePos(game, game.clubId);
  const trustM = B.trust >= 55 ? 'good' : B.trust >= 40 ? 'info' : B.trust >= 25 ? 'warn' : 'bad';
  const fans = Math.round(B.fansMood);
  const fansM = fans >= 65 ? 'good' : fans >= 50 ? 'info' : fans >= 35 ? 'warn' : 'bad';
  const reviews = B.reviews.length ? `<ol class="tf-reviews">${B.reviews.map((r) => `<li data-k="${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : 'flat'}"><time>${esc(shortDate(r.date))}</time><span>${esc(r.notes.join(' ') || 'Bez uwag.')}</span><b>${r.delta > 0 ? '+' : ''}${String(r.delta).replace('.', ',')}</b></li>`).join('')}</ol>`
    : '<p class="tf-p__txt">Pierwsza ocena 1 sierpnia.</p>';
  return `<div class="tf-kpis">
      ${kpi('Zaufanie zarządu', String(B.trust), esc(trustLabel(B.trust)), trustM, meter(B.trust, trustM))}
      ${kpi('Nastroje kibiców', String(fans), '', fansM, meter(fans, fansM))}
      ${kpi('Cel sezonu', `<span class="tf-kpi__txt">${esc(B.goal?.text ?? '')}</span>`, t.pos ? `teraz ${t.pos}. miejsce` : '', 'info')}
      ${kpi('Twoja reputacja', String(Math.round(M.rep)), esc(reputationLabel(M.rep)), 'misc', meter(M.rep, 'misc'))}
    </div>
    <div class="tf-board">
      ${panel('Oceny zarządu', trustM, `<p class="tf-p__txt">Zarząd ocenia cię pierwszego dnia każdego miesiąca: miejsce w tabeli wobec celu, finanse i nastroje kibiców. Przy zaufaniu poniżej 18 (od października) grozi zwolnienie.</p>${reviews}`, { cls: 'tf-board__rev' })}
      ${fansPanel(game)}
      ${panel('Kariera trenera', 'good', `<ul class="tf-career">${M.history.map((h) => `<li>${crest(h.club, 28)}<span><b>${esc(clubById(h.club)?.name ?? h.club)}</b><small>od ${esc(fmtDate(h.from))}${h.to ? ` do ${esc(fmtDate(h.to))}` : ', obecnie'}</small></span></li>`).join('')}</ul>`, { cls: 'tf-board__car' })}
    </div>`;
}

function fansPanel(game) {
  const F = fansSummary(game);
  const rows = [
    ['Liczba kibiców', F.profile.sizeLabel],
    ['Ultrasi', `${F.profile.ultrasLabel}${F.profile.stand ? ` (${F.profile.stand})` : ''}`],
    ['Nastroje', `${F.moodLabel}${F.level ? `. Teraz: ${F.levelLabel.toLowerCase()}` : ''}`],
    ['Napięcie', `${F.heatLabel}${F.expectedPosition ? `. Kibice oczekują ok. ${F.expectedPosition}. miejsca` : ''}`],
    ...(F.rivals.length ? [['Rywale', F.rivals.slice(0, 4).map((r) => r.name).join(', ')]] : []),
    ...F.sanctions.map((s) => ['Kara', s.text]),
  ];
  return panel('Kibice', 'misc', `<dl class="tf-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${F.recent.length ? `<h4 class="tf-h4">Ostatnie wydarzenia</h4><ul class="tf-log">${F.recent.slice(0, 6).map((e) => `<li><time>${esc(shortDate(e.date))}</time><span>${esc(e.text)}</span></li>`).join('')}</ul>` : ''}`, { cls: 'tf-board__fans' });
}

// ------------------------------------------------------------ Wejście
export function renderTransfers(game, ui = {}) {
  const tab = TF_TABS.some(([k]) => k === ui.tfTab) ? ui.tfTab : 'rynek';
  const tabs = `<div class="subtabs" role="tablist">${TF_TABS.map(([k, l]) => `<button role="tab" data-act="tf-tab" data-t="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>`;
  const p = ui.tfPlayer && game.world.players[ui.tfPlayer];
  let body;
  if (p && (tab === 'rynek' || tab === 'kontrakty' || tab === 'oferty' || tab === 'wtoku')) body = playerCard(game, p, ui);
  else if (tab === 'oferty') body = offersView(game);
  else if (tab === 'wtoku') body = dealsView(game, ui);
  else if (tab === 'kontrakty') body = contractsView(game, ui);
  else body = marketView(game, ui);
  return `<div class="tfx" data-tab="${esc(tab)}"><div class="tfx__head"><h2>Transfery</h2>${windowBadge(game)}</div>${tabs}${body}</div>`;
}

/**
 * Limity rozmów o kontrakcie: wolne miejsce w budżecie płac (+ obecna pensja przy przedłużeniu) i premia za podpis.
 * board: progi zarządu (weto, src/career/boardRequests.js): pensja, długość, koszt kontraktu, premia, prowizja.
 */
export function negotiationLimits(game, kind, p) {
  const room = wageRoom(game.finance, game.world, game.clubId) + (kind === 'renew' ? p.contract.wage : 0);
  return {
    maxWage: Math.max(room, kind === 'renew' ? p.contract.wage : 0), maxSignOn: Math.round(spendable(game.finance, game.clubId) * 0.25 / 1000) * 1000,
    board: boardCaps(game, game.clubId, p, kind),
  };
}

/**
 * Obsługa akcji „tf-”. root: element DOM z polami formularza (albo null w testach; wtedy wartości z dataset).
 * Zwraca { ui, save, negotiate?: { kind, playerId, fromClub, fee, limits }, resolveOffer?: offerId }.
 */
export function handleTransferAction(game, act, ds = {}, root = null) {
  const val = (sel, d) => root?.querySelector(sel)?.value ?? d;
  const p = ds.id ? game.world.players[ds.id] : null;
  switch (act) {
    case 'tf-tab': return { ui: { tfTab: ds.t, tfPlayer: null, tfMsg: null, tfConfirm: null } };
    case 'tf-list': return { ui: { tfList: ds.l, tfPlayer: null, tfMsg: null } };
    case 'tf-pos': return { ui: { tfPos: ds.p } };
    case 'tf-sort': {
      const sort = { k: ds.k, dir: ds.dir === 'asc' ? 'asc' : 'desc' };
      return { ui: ds.s === 'c' ? { tfCSort: sort } : { tfSort: sort } };
    }
    case 'tf-open': return { ui: { tfPlayer: ds.id, tfMsg: null, tfConfirm: null } };
    case 'tf-close': return { ui: { tfPlayer: null, tfMsg: null, tfConfirm: null } };
    case 'tf-search': {
      const form = root?.querySelector('[data-tf-search]');
      const f = form ? Object.fromEntries(new FormData(form)) : (ds.filter ?? {});
      return { ui: { tfFilter: f } };
    }
    case 'tf-offer': {
      const fee = Number(val('#tfFee', ds.fee)) || 0;
      const r = offerForPlayer(game, p.id, fee);
      return { ui: { tfMsg: r.text }, save: true };
    }
    case 'tf-loan': {
      const r = loanIn(game, p.id, Number(val('#tfShare', ds.share)) || 50);
      return { ui: { tfMsg: r.text, ...(r.ok ? { tfPlayer: null, tfTab: 'kontrakty' } : {}) }, save: r.ok, squadChanged: r.ok };
    }
    case 'tf-negotiate': {
      const t = game.market.talks[p.id];
      const fee = p.clubId ? t?.accepted ?? 0 : 0;
      if (p.clubId && !t?.accepted) return { ui: { tfMsg: 'Najpierw dogadaj się z klubem.' } };
      if (p.clubId && !inWindow(game.date)) return { ui: { tfMsg: 'Okno transferowe jest zamknięte.' } };
      if (!p.clubId && lateFree(game, p)) return { ui: { tfMsg: 'Zawodnik został wolny po zamknięciu okna transferowego. Zgłosisz go dopiero w następnym oknie (FIFA RSTP art. 6.1).' } };
      if (p.transfer) return { ui: { tfMsg: 'Zawodnik jest w trakcie transferu.' } };
      const cap = canSign(game);
      if (!cap.ok) return { ui: { tfMsg: cap.text } };
      return { ui: {}, negotiate: { kind: 'sign', playerId: p.id, fromClub: p.clubId ?? null, fee, limits: negotiationLimits(game, 'sign', p) } };
    }
    case 'tf-renew': return { ui: {}, negotiate: { kind: 'renew', playerId: p.id, fromClub: null, fee: 0, limits: negotiationLimits(game, 'renew', p) } };
    case 'tf-pre': { // umowa od 1 lipca (src/career/preContracts.js)
      const chk = checkUserPre(game, p);
      if (!chk.ok) return { ui: { tfMsg: chk.text } };
      return { ui: {}, negotiate: { kind: 'sign', playerId: p.id, fromClub: p.clubId, fee: 0, pre: true, limits: negotiationLimits(game, 'sign', p) } };
    }
    case 'tf-wish': // podwyżka przy prośbie o transfer otwiera rozmowy o przedłużeniu z bonusem do chęci pozostania
      if (ds.a === 'raise') return { ui: {}, negotiate: { kind: 'renew', playerId: p.id, fromClub: null, fee: 0, stayBonus: 0.15, limits: negotiationLimits(game, 'renew', p) } };
      return handleDealAction(game, act, ds);
    case 'tf-list-own': {
      const price = Math.max(0, Number(val('#tfPrice', ds.price)) || Math.round(p.value * 1.2));
      game.market.userListed[p.id] = price;
      return { ui: { tfMsg: `${p.name} jest na liście transferowej za ${fmtZl(price)}.` }, save: true };
    }
    case 'tf-unlist': delete game.market.userListed[p.id]; return { ui: { tfMsg: `${p.name} zdjęty z listy.` }, save: true };
    case 'tf-keep': { const r = toggleKeep(game, ds.id); return { ui: { tfMsg: r.text }, save: r.ok }; }
    case 'tf-release': return { ui: { tfConfirm: p.id } };
    case 'tf-release-ok': {
      const cost = releasePlayer(game, p.id);
      return { ui: { tfPlayer: null, tfConfirm: null, tfMsg: null, tfTab: 'kontrakty' }, save: true, squadChanged: true, note: `Rozwiązano kontrakt z ${p.name}. Koszt: ${fmtZl(cost)}.` };
    }
    case 'tf-answer': {
      const r = answerIncoming(game, ds.o, ds.a);
      return { ui: { tfMsg: r.text }, save: true, resolveOffer: ds.o, squadChanged: !!r.sold, note: r.text };
    }
    default: return handleDealAction(game, act, ds) ?? { ui: {} };
  }
}

/** Wolny zawodnik bez klubu od dnia po zamknięciu ostatniego okna: poza oknem nie do zgłoszenia (FIFA RSTP art. 6.1). */
export function lateFree(game, p) {
  if (inWindow(game.date) || !p.freeSince) return false;
  const last = (DOMESTIC.transferWindows ?? []).filter((w) => w.to < game.date).map((w) => w.to).sort().at(-1);
  return !!last && p.freeSince > last;
}
