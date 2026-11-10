// Zakładka „Transfery”: rynek (lista transferowa, wypożyczenia, wolni, wyszukiwarka), karta zawodnika z ofertą,
// oferty, kontrakty własnych zawodników, finanse i zarząd. Akcje z prefiksem „tf-”.
import { CLUBS_PL, clubById, LEAGUE_NAMES } from '../data/clubs_pl.js';
import { POS_NAMES } from '../data/attributes.js';
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

const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const crest = (id, size = 20) => (clubById(id) ? crestHtml(clubById(id), { size, clubsById }) : '');
const groupOf = (p) => GROUP[p.pos] ?? 'MID';
export const TF_TABS = [['rynek', 'Rynek'], ['oferty', 'Oferty'], ['kontrakty', 'Kontrakty'], ['finanse', 'Finanse'], ['zarzad', 'Zarząd']];
const LISTS = [['transfer', 'Lista transferowa'], ['loan', 'Do wypożyczenia'], ['free', 'Wolni'], ['search', 'Wyszukaj']];
const POS_FILTERS = [['all', 'Wszyscy'], ['GK', 'Bramkarze'], ['DEF', 'Obrońcy'], ['MID', 'Pomocnicy'], ['ATT', 'Napastnicy']];
export const isTransferAction = (act) => typeof act === 'string' && act.startsWith('tf-');
const ovrTxt = (p) => Math.round(p.ovr);
const monthsLeft = (game, p) => (p.contract?.until ? (Number(p.contract.until.slice(0, 4)) - Number(game.date.slice(0, 4))) * 12 + Number(p.contract.until.slice(5, 7)) - Number(game.date.slice(5, 7)) : 0);

function windowLine(game) {
  const w = windowOf(game.date);
  return w ? `Okno transferowe otwarte do ${fmtDate(w.to)}.` : 'Okno transferowe jest zamknięte. Wolnych zawodników możesz podpisywać zawsze.';
}

function playerRow(game, p, extra = '', act = 'tf-open') {
  return `<li><button class="tf-row" data-act="${act}" data-id="${esc(p.id)}">
    <span class="tf-pos">${esc(p.pos)}</span>
    <span class="tf-name">${esc(p.name)}<small>${p.clubId ? `${crest(p.clubId, 14)} ${esc(clubById(p.clubId)?.name ?? '')}` : 'bez klubu'}, ${p.age} lat</small></span>
    <span class="tf-ovr">${ovrTxt(p)}</span>
    <span class="tf-extra">${extra}</span>
  </button></li>`;
}

// ------------------------------------------------------------ Rynek
function marketView(game, ui) {
  const list = ui.tfList ?? 'transfer';
  const pos = ui.tfPos ?? 'all';
  const chips = `<div class="chips">${LISTS.map(([k, l]) => `<button class="chip" data-act="tf-list" data-l="${k}" aria-pressed="${list === k}">${l}</button>`).join('')}</div>
    <div class="chips chips--sm">${POS_FILTERS.map(([k, l]) => `<button class="chip" data-act="tf-pos" data-p="${k}" aria-pressed="${pos === k}">${l}</button>`).join('')}</div>`;
  const money = `<p class="hint">${windowLine(game)} Budżet transferowy: <b>${fmtZl(spendable(game.finance, game.clubId))}</b>, wolne w budżecie płac: <b>${fmtZl(wageRoom(game.finance, game.world, game.clubId))}</b> tygodniowo.</p>`;
  let rows = [];
  if (list === 'search') {
    const f = ui.tfFilter ?? {};
    const form = `<form class="tf-search" data-tf-search>
      <label>Nazwisko<input name="text" value="${esc(f.text ?? '')}" autocomplete="off"></label>
      <label>Maks. cena (zł)<input name="maxPrice" type="number" step="50000" min="0" value="${f.maxPrice ?? ''}"></label>
      <label>Maks. wiek<input name="maxAge" type="number" min="16" max="40" value="${f.maxAge ?? ''}"></label>
      <label>Min. OVR<input name="minOvr" type="number" min="1" max="20" value="${f.minOvr ?? ''}"></label>
      <label>Liga<select name="tier"><option value="all">Wszystkie</option>${[1, 2, 3].map((t) => `<option value="${t}" ${String(f.tier) === String(t) ? 'selected' : ''}>${esc(LEAGUE_NAMES[t])}</option>`).join('')}</select></label>
      <button class="btn btn--primary" type="button" data-act="tf-search">Szukaj</button></form>`;
    const res = searchPlayers(game, { pos, maxPrice: Number(f.maxPrice) || Infinity, maxAge: Number(f.maxAge) || 99, minOvr: Number(f.minOvr) || 0, tier: f.tier ?? 'all', text: f.text ?? '' });
    return `${chips}${money}${form}<ul class="tf-list">${res.map(({ p, price, nfs }) => playerRow(game, p, nfs ? 'nie na sprzedaż' : fmtZl(price))).join('') || '<li class="hint">Brak zawodników dla tych filtrów.</li>'}</ul>`;
  }
  const L = marketLists(game)[list];
  rows = L.filter((x) => pos === 'all' || groupOf(x.p) === pos).sort((a, b) => b.p.ovr - a.p.ovr).slice(0, 80);
  const extra = (x) => (list === 'free' ? `${fmtZl(x.p.askWage ?? 0)}/tydz.` : list === 'loan' ? 'wypożyczenie' : fmtZl(askingPrice(game, x.p)));
  return `${chips}${money}<ul class="tf-list">${rows.map((x) => playerRow(game, x.p, extra(x))).join('') || '<li class="hint">Lista jest pusta.</li>'}</ul>`;
}

// ------------------------------------------------------------ Karta zawodnika (cudzy)
function topAttrs(p) {
  return Object.entries(p.attr ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(', ');
}

function playerCard(game, p, ui) {
  const mine = p.clubId === game.clubId;
  if (mine) return ownCard(game, p, ui);
  const listed = game.market.listed[p.id];
  const price = askingPrice(game, p);
  const will = playerWillingness(game, p);
  const talk = game.market.talks[p.id];
  const free = !p.clubId;
  const nfs = notForSale(game, p) && !p.contract?.clause;
  const actions = [];
  if (free) actions.push(`<button class="btn btn--primary" data-act="tf-negotiate" data-id="${esc(p.id)}">Rozmawiaj o kontrakcie</button>`);
  else if (talk?.accepted) actions.push(`<p class="notice">Klub przyjął ofertę ${fmtZl(talk.accepted)}.</p><button class="btn btn--primary" data-act="tf-negotiate" data-id="${esc(p.id)}">Rozmawiaj z zawodnikiem</button>`);
  else if (!nfs) {
    actions.push(`<div class="tf-offer"><label>Oferta odstępnego (zł)<input id="tfFee" type="number" min="0" step="10000" value="${talk?.counter ?? Math.round(price * 0.9 / 10000) * 10000}"></label>
      <button class="btn btn--primary" data-act="tf-offer" data-id="${esc(p.id)}" ${inWindow(game.date) ? '' : 'disabled'}>Złóż ofertę</button></div>`);
  }
  if (!free && (listed?.kind === 'loan' || (p.age <= 21 && !nfs))) {
    actions.push(`<div class="tf-offer"><label>Wypożyczenie: część pensji<select id="tfShare">${[50, 75, 100].map((s) => `<option value="${s}">${s} %</option>`).join('')}</select></label>
      <button class="btn btn--quiet" data-act="tf-loan" data-id="${esc(p.id)}" ${inWindow(game.date) ? '' : 'disabled'}>Wypożycz do końca sezonu</button></div>`);
  }
  return `<button class="btn btn--quiet btn--sm" data-act="tf-close">Wróć do listy</button>
    <section class="panel tf-card">
      <div class="tf-card__head">${crest(p.clubId, 36)}<div><h2>${esc(p.name)}</h2><p class="hint">${esc(POS_NAMES?.[p.pos] ?? p.pos)}, ${p.age} lat, ${esc(NAT_NAMES[p.nat] ?? p.nat)}${p.clubId ? `, ${esc(clubById(p.clubId)?.name)}` : ', wolny zawodnik'}</p></div><b class="tf-big">${ovrTxt(p)}</b></div>
      <ul class="plain-list">
        <li><span class="k">Reputacja</span><span>${esc(reputationLabel(p.rep ?? 30))}</span></li>
        <li><span class="k">Mocne strony</span><span>${esc(topAttrs(p))}</span></li>
        <li><span class="k">Wartość</span><span>${fmtZl(p.value)}</span></li>
        ${free ? `<li><span class="k">Oczekuje</span><span>ok. ${fmtZl(p.askWage ?? 0)} tygodniowo</span></li>` : `<li><span class="k">Cena klubu</span><span>${nfs ? 'nie na sprzedaż' : fmtZl(price)}${listed ? ` (${esc(listed.reasons.join(', ').toLowerCase())})` : ''}</span></li>
        <li><span class="k">Kontrakt</span><span>${fmtZl(p.contract.wage)} tygodniowo, do ${fmtDate(p.contract.until)}${p.contract.clause ? `, klauzula ${fmtZl(p.contract.clause)}` : ''}</span></li>`}
        <li><span class="k">Nastawienie</span><span>${esc(will.verdict)}${will.reasons.length ? `: ${esc(will.reasons.join('; ').toLowerCase())}` : ''}</span></li>
        ${recentlyMoved(p, game.date) ? '<li><span class="k">Uwaga</span><span>Dopiero zmienił klub</span></li>' : ''}
      </ul>
      ${ui.tfMsg ? `<p class="notice">${esc(ui.tfMsg)}</p>` : ''}
      ${will.verdict === 'odmowa' ? '<p class="notice notice--err">Zawodnik nie chce rozmawiać o przejściu do twojego klubu.</p>' : actions.join('')}
    </section>`;
}

// ------------------------------------------------------------ Własny zawodnik
function ownCard(game, p, ui) {
  const listedPrice = game.market.userListed[p.id];
  const ml = monthsLeft(game, p);
  const canRenew = !p.loan && ml <= RENEW_WINDOW_MONTHS;
  return `<button class="btn btn--quiet btn--sm" data-act="tf-close">Wróć do listy</button>
    <section class="panel tf-card">
      <div class="tf-card__head">${crest(p.clubId, 36)}<div><h2>${esc(p.name)}</h2><p class="hint">${esc(p.pos)}, ${p.age} lat, morale ${Math.round(p.morale ?? 12)}/20</p></div><b class="tf-big">${ovrTxt(p)}</b></div>
      <ul class="plain-list">
        <li><span class="k">Kontrakt</span><span>${fmtZl(p.contract.wage)} tygodniowo, do ${fmtDate(p.contract.until)}${p.loan ? ` (wypożyczony z ${esc(clubById(p.loan.from)?.name ?? '')})` : ''}</span></li>
        <li><span class="k">Wartość</span><span>${fmtZl(p.value)}</span></li>
        ${p.contract.promise?.role ? `<li><span class="k">Obietnica</span><span>${esc(p.contract.promise.role)}</span></li>` : ''}
        ${p.renewRefused ? '<li><span class="k">Uwaga</span><span>Odmówił przedłużenia kontraktu</span></li>' : ''}
        ${p.transferRequest ? '<li><span class="k">Uwaga</span><span>Prosi o transfer</span></li>' : ''}
      </ul>
      ${ui.tfMsg ? `<p class="notice">${esc(ui.tfMsg)}</p>` : ''}
      <div class="tf-actions">
        ${canRenew ? `<button class="btn btn--primary" data-act="tf-renew" data-id="${esc(p.id)}">Przedłuż kontrakt</button>` : `<p class="hint">Rozmowy o przedłużeniu najwcześniej ${RENEW_WINDOW_MONTHS} miesięcy przed końcem kontraktu.</p>`}
        ${p.loan ? '' : listedPrice ? `<p class="hint">Na liście transferowej za ${fmtZl(listedPrice)}.</p><button class="btn btn--quiet" data-act="tf-unlist" data-id="${esc(p.id)}">Zdejmij z listy</button>`
    : `<div class="tf-offer"><label>Cena na liście (zł)<input id="tfPrice" type="number" min="0" step="10000" value="${Math.round(p.value * 1.2 / 10000) * 10000}"></label><button class="btn btn--quiet" data-act="tf-list-own" data-id="${esc(p.id)}">Wystaw na listę</button></div>`}
        ${p.loan ? '' : ui.tfConfirm === p.id ? `<p class="notice notice--err">Rozwiązanie kontraktu kosztuje ${fmtZl(releaseCost(game, p))}.</p><button class="btn btn--quiet" data-act="tf-release-ok" data-id="${esc(p.id)}">Potwierdź rozwiązanie</button>`
    : `<button class="btn btn--quiet" data-act="tf-release" data-id="${esc(p.id)}">Rozwiąż kontrakt</button>`}
      </div>
    </section>`;
}

function contractsView(game) {
  const sq = squadOf(game.world, game.clubId).sort((a, b) => (a.contract.until.localeCompare(b.contract.until)) || b.ovr - a.ovr);
  const bill = wageBill(game.world, game.clubId);
  return `<p class="hint">Płace: ${fmtZl(bill)} tygodniowo, budżet płac ${fmtZl(game.finance.clubs[game.clubId].wageBudget)}. Posortowane wg końca kontraktu.</p>
    <ul class="tf-list">${sq.map((p) => playerRow(game, p, `${fmtZl(p.contract.wage)}<small>do ${fmtDate(p.contract.until).replace(/^\w+ \d+, /, '')}${game.market.userListed[p.id] ? ', na liście' : ''}${p.renewRefused ? ', odmówił' : ''}</small>`)).join('')}</ul>`;
}

// ------------------------------------------------------------ Oferty
function offersView(game) {
  const open = game.market.offers.filter((o) => o.kind === 'incoming' && o.status === 'open');
  const mine = Object.entries(game.market.talks).map(([id, t]) => ({ p: game.world.players[id], t })).filter((x) => x.p && x.p.clubId !== game.clubId);
  const hist = game.market.history.filter((h) => h.from === game.clubId || h.to === game.clubId).slice(0, 20);
  const all = game.market.history.slice(0, 25);
  const hRow = (h) => `<li><span class="k">${esc(fmtDate(h.date).replace(/, \d{4}$/, ''))}</span><span>${esc(h.name)} (${esc(h.pos)}): ${esc(clubById(h.from)?.name ?? 'wolny')} -> ${esc(h.to ? clubById(h.to)?.name : 'bez klubu')}</span><b>${h.kind === 'loan' ? 'wyp.' : h.fee ? fmtZl(h.fee) : h.kind === 'release' ? 'rozwiązanie' : 'wolny'}</b></li>`;
  return `<section class="stat-sec"><h3>Oferty za twoich zawodników</h3>${open.length ? `<ul class="plain-list">${open.map((o) => { const p = game.world.players[o.playerId]; return `<li class="tf-incoming"><span>${crest(o.from)} <b>${esc(clubById(o.from).name)}</b> chce ${esc(p.name)} za ${fmtZl(o.fee)} (ważna do ${esc(fmtDate(o.expires))})</span><span class="tf-btns"><button class="btn btn--primary btn--sm" data-act="tf-answer" data-o="${esc(o.id)}" data-a="accept">Przyjmij</button>${o.raised ? '' : `<button class="btn btn--quiet btn--sm" data-act="tf-answer" data-o="${esc(o.id)}" data-a="more">Żądaj więcej</button>`}<button class="btn btn--quiet btn--sm" data-act="tf-answer" data-o="${esc(o.id)}" data-a="reject">Odrzuć</button></span></li>`; }).join('')}</ul>` : '<p class="hint">Brak ofert.</p>'}</section>
    <section class="stat-sec"><h3>Twoje rozmowy z klubami</h3>${mine.length ? `<ul class="plain-list">${mine.map(({ p, t }) => `<li><span>${esc(p.name)} (${esc(clubById(p.clubId)?.name ?? '')})</span><b>${t.accepted ? `przyjęta: ${fmtZl(t.accepted)}` : t.until ? `przerwa do ${esc(fmtDate(t.until))}` : t.counter ? `klub chce ${fmtZl(t.counter)}` : 'odrzucona'}</b></li>`).join('')}</ul>` : '<p class="hint">Nie prowadzisz rozmów.</p>'}</section>
    <section class="stat-sec"><h3>Transfery twojego klubu</h3>${hist.length ? `<ul class="plain-list">${hist.map(hRow).join('')}</ul>` : '<p class="hint">Jeszcze żadnych.</p>'}</section>
    <section class="stat-sec"><h3>Ostatnie transfery w Polsce</h3><ul class="plain-list">${all.map(hRow).join('') || '<li>Brak.</li>'}</ul></section>`;
}

// ------------------------------------------------------------ Finanse i zarząd
function moneyTable(title, obj) {
  const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  return `<section class="stat-sec"><h3>${esc(title)}</h3><ul class="plain-list tf-money">${rows.map(([k, v]) => `<li><span>${esc(FIN_LABELS[k] ?? k)}</span><b>${fmtZl(v)}</b></li>`).join('') || '<li><span>Brak</span></li>'}</ul></section>`;
}
function financeView(game) {
  const c = game.finance.clubs[game.clubId];
  const s = seasonSummary(c);
  const m = monthSummary(c, game.date.slice(0, 7));
  return `<div class="tf-kpis">
      <div class="kpi"><small>Saldo</small><b class="${c.balance < 0 ? 'neg' : ''}">${fmtZl(c.balance)}</b><small>na start sezonu ${fmtZl(c.start)}</small></div>
      <div class="kpi"><small>Budżet transferowy</small><b>${fmtZl(spendable(game.finance, game.clubId))}</b><small>przyznany ${fmtZl(c.transferBudget)}</small></div>
      <div class="kpi"><small>Płace tygodniowo</small><b>${fmtZl(wageBill(game.world, game.clubId))}</b><small>budżet ${fmtZl(c.wageBudget)}</small></div>
      <div class="kpi"><small>Wynik sezonu</small><b class="${s.net < 0 ? 'neg' : ''}">${fmtZl(s.net)}</b><small>przychody ${fmtZl(s.income)}</small></div>
    </div>
    <div class="studio-cols">${moneyTable('Przychody w sezonie', s.in)}${moneyTable('Koszty w sezonie', s.out)}</div>
    <div class="studio-cols">${moneyTable(`Przychody w tym miesiącu`, m.in)}${moneyTable('Koszty w tym miesiącu', m.out)}</div>
    <section class="stat-sec"><h3>Ostatnie operacje</h3><ul class="plain-list tf-money">${c.log.slice(0, 15).map((l) => `<li><span class="k">${esc(fmtDate(l.date).replace(/, \d{4}$/, ''))}</span><span>${esc(l.note)}</span><b class="${l.dir === 'out' ? 'neg' : ''}">${l.dir === 'out' ? '-' : '+'}${fmtZl(l.amount)}</b></li>`).join('') || '<li><span>Brak.</span></li>'}</ul></section>`;
}

function boardView(game) {
  const B = game.board; const M = game.manager;
  const t = tablePos(game, game.clubId);
  return `<div class="tf-kpis">
      <div class="kpi"><small>Zaufanie zarządu</small><b>${B.trust}</b><span class="meter"><i style="width:${B.trust}%"></i></span><small>${esc(trustLabel(B.trust))}</small></div>
      <div class="kpi"><small>Nastroje kibiców</small><b>${Math.round(B.fansMood)}</b><span class="meter"><i style="width:${B.fansMood}%"></i></span></div>
      <div class="kpi"><small>Cel sezonu</small><b class="kpi__txt">${esc(B.goal?.text ?? '')}</b><small>${t.pos ? `teraz ${t.pos}. miejsce` : ''}</small></div>
      <div class="kpi"><small>Twoja reputacja</small><b>${Math.round(M.rep)}</b><small>${esc(reputationLabel(M.rep))}</small></div>
    </div>
    <p class="hint">Zarząd ocenia cię pierwszego dnia każdego miesiąca: miejsce w tabeli wobec celu, finanse i nastroje kibiców. Przy zaufaniu poniżej 18 (od października) grozi zwolnienie.</p>
    <section class="stat-sec"><h3>Oceny zarządu</h3><ul class="plain-list">${B.reviews.map((r) => `<li><span class="k">${esc(fmtDate(r.date).replace(/, \d{4}$/, ''))}</span><span>${esc(r.notes.join(' ') || 'Bez uwag.')}</span><b>${r.delta > 0 ? '+' : ''}${String(r.delta).replace('.', ',')}</b></li>`).join('') || '<li><span>Pierwsza ocena 1 sierpnia.</span></li>'}</ul></section>
    ${fansPanel(game)}
    <section class="stat-sec"><h3>Kariera trenera</h3><ul class="plain-list">${M.history.map((h) => `<li>${crest(h.club)}<span>${esc(clubById(h.club)?.name ?? h.club)}</span><b>od ${esc(fmtDate(h.from))}${h.to ? ` do ${esc(fmtDate(h.to))}` : ''}</b></li>`).join('')}</ul></section>`;
}

function fansPanel(game) {
  const F = fansSummary(game);
  return `<section class="stat-sec"><h3>Kibice</h3>
    <ul class="plain-list">
      <li><span class="k">Liczba kibiców</span><span>${esc(F.profile.sizeLabel)}</span></li>
      <li><span class="k">Ultrasi</span><span>${esc(F.profile.ultrasLabel)}${F.profile.stand ? ` (${esc(F.profile.stand)})` : ''}</span></li>
      <li><span class="k">Nastroje</span><span>${esc(F.moodLabel)}${F.level ? `. Teraz: ${esc(F.levelLabel.toLowerCase())}` : ''}</span></li>
      <li><span class="k">Napięcie</span><span>${esc(F.heatLabel)}${F.expectedPosition ? `. Kibice oczekują ok. ${F.expectedPosition}. miejsca` : ''}</span></li>
      ${F.rivals.length ? `<li><span class="k">Rywale</span><span>${esc(F.rivals.slice(0, 4).map((r) => r.name).join(', '))}</span></li>` : ''}
      ${F.sanctions.map((s) => `<li><span class="k">Kara</span><span>${esc(s.text)}</span></li>`).join('')}
    </ul>
    ${F.recent.length ? `<ul class="plain-list tf-money">${F.recent.slice(0, 6).map((e) => `<li><span class="k">${esc(fmtDate(e.date).replace(/, \d{4}$/, ''))}</span><span>${esc(e.text)}</span></li>`).join('')}</ul>` : ''}
  </section>`;
}

// ------------------------------------------------------------ Wejście
export function renderTransfers(game, ui = {}) {
  const tab = ui.tfTab ?? 'rynek';
  const tabs = `<div class="subtabs subtabs--5" role="tablist">${TF_TABS.map(([k, l]) => `<button role="tab" data-act="tf-tab" data-t="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>`;
  const p = ui.tfPlayer && game.world.players[ui.tfPlayer];
  let body;
  if (p && (tab === 'rynek' || tab === 'kontrakty')) body = playerCard(game, p, ui);
  else if (tab === 'oferty') body = offersView(game);
  else if (tab === 'kontrakty') body = contractsView(game);
  else if (tab === 'finanse') body = financeView(game);
  else if (tab === 'zarzad') body = boardView(game);
  else body = marketView(game, ui);
  return `<h2>Transfery</h2>${tabs}${body}`;
}

/** Limity rozmów o kontrakcie: wolne miejsce w budżecie płac (+ obecna pensja przy przedłużeniu) i premia za podpis. */
export function negotiationLimits(game, kind, p) {
  const room = wageRoom(game.finance, game.world, game.clubId) + (kind === 'renew' ? p.contract.wage : 0);
  return { maxWage: Math.max(room, kind === 'renew' ? p.contract.wage : 0), maxSignOn: Math.round(spendable(game.finance, game.clubId) * 0.25 / 1000) * 1000 };
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
      return { ui: {}, negotiate: { kind: 'sign', playerId: p.id, fromClub: p.clubId ?? null, fee, limits: negotiationLimits(game, 'sign', p) } };
    }
    case 'tf-renew': return { ui: {}, negotiate: { kind: 'renew', playerId: p.id, fromClub: null, fee: 0, limits: negotiationLimits(game, 'renew', p) } };
    case 'tf-list-own': {
      const price = Math.max(0, Number(val('#tfPrice', ds.price)) || Math.round(p.value * 1.2));
      game.market.userListed[p.id] = price;
      return { ui: { tfMsg: `${p.name} jest na liście transferowej za ${fmtZl(price)}.` }, save: true };
    }
    case 'tf-unlist': delete game.market.userListed[p.id]; return { ui: { tfMsg: `${p.name} zdjęty z listy.` }, save: true };
    case 'tf-release': return { ui: { tfConfirm: p.id } };
    case 'tf-release-ok': {
      const cost = releasePlayer(game, p.id);
      return { ui: { tfPlayer: null, tfConfirm: null, tfMsg: null, tfTab: 'kontrakty' }, save: true, squadChanged: true, note: `Rozwiązano kontrakt z ${p.name}. Koszt: ${fmtZl(cost)}.` };
    }
    case 'tf-answer': {
      const r = answerIncoming(game, ds.o, ds.a);
      return { ui: { tfMsg: r.text }, save: true, resolveOffer: ds.o, squadChanged: !!r.sold, note: r.text };
    }
    default: return { ui: {} };
  }
}
