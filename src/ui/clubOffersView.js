// Oferty klub-klub w zakładce Transfery (src/career/clubOffers.js, docs/transfery.md, rozdz. „Oferty klub-klub”):
// panel karty zawodnika klubu AI (zapytanie o cenę, formularz pakietu, stan rozmów: klub rozważa, kontroferta,
// porozumienie klubów, rozmowy wstrzymane), sekcja „Oferty dla klubów” w zakładce W toku i znaczniki stanu.
// Gracz nie widzi daty decyzji klubu ani dokładnej długości przerwy w rozmowach. Akcje „tf-co-*”, „tf-inquire”, „tf-offer”.
// Style: src/styles/transfers.css (prefiks .co-).
import { clubById } from '../data/clubs_pl.js';
import { GROUP } from '../career/squad.js';
import { esc, fmtDate } from './dom.js';
import { fmtZl, inWindow } from '../career/transfers.js';
import {
  CO, userOffer, activeUserOffers, inquiryOf, inquire, offerStatus, pkgText, regDateFor, answerCounter,
  withdrawClubOffer, breakWords, normPkg,
} from '../career/clubOffers.js';

const clubName = (id) => clubById(id)?.name ?? 'klub';
const posBadge = (p) => `<span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span>`;
const dayNo = (d) => Math.floor(Date.parse(`${d}T12:00:00Z`) / 864e5);
const regLine = (rec) => (rec.mode === 'season' || rec.mode === 'window' ? `Transfer od ${fmtDate(rec.regDate)}${rec.mode === 'season' ? ' (następny sezon)' : ' (otwarcie okna)'}.` : 'Transfer od razu po zgodzie zawodnika, w oknie transferowym.');
const roundTo = (x, step = 10000) => Math.max(0, Math.round(x / step) * step);

/** Formularz pakietu: kwota, raty, premie, procent od sprzedaży, termin przejścia. */
function offerForm(game, p, rec, inq) {
  const open = inWindow(game.date);
  const fee = rec?.status === 'counter' ? rec.counter.fee : rec?.pkg?.fee ? rec.pkg.fee : inq?.ask ? roundTo(inq.ask * 0.9) : roundTo((p.value ?? 0) * 1.2);
  const pk = rec?.pkg ?? {};
  const b = pk.bonus ?? {};
  const win = regDateFor('window', game.date); const season = regDateFor('season', game.date);
  const mode = rec?.mode === 'now' && !open ? 'window' : rec?.mode ?? (open ? 'now' : 'window');
  const when = [['now', 'teraz (okno otwarte)', !open], ['window', `najbliższe okno, od ${fmtDate(win)}`, win === season], ['season', `następny sezon, od ${fmtDate(season)}`, false]]
    .filter(([, , hide]) => !hide).map(([k, l]) => `<option value="${k}"${k === mode ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const inst = [[1, 'Całość przy transferze'], [2, '2 raty (60 + 40 %)'], [3, '3 raty (50 + 25 + 25 %)']]
    .map(([k, l]) => `<option value="${k}"${(pk.inst ?? 1) === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const so = [0, 5, 10, 15, 20, 25, 30].map((k) => `<option value="${k}"${(pk.sellOn ?? 0) === k ? ' selected' : ''}>${k ? `${k} %` : 'bez'}</option>`).join('');
  const tier = clubById(game.clubId)?.tier ?? 1;
  const num = (id, label, v, step = 10000) => `<label>${esc(label)}<input id="${id}" type="number" inputmode="numeric" min="0" step="${step}" value="${v ? esc(v) : ''}" placeholder="0"></label>`;
  const left = CO.userRounds - (rec && ['thinking', 'counter', 'rejected'].includes(rec.status) && dayNo(game.date) - dayNo(rec.date) <= CO.resetDays ? rec.round : 0);
  return `<div class="tf-offer co-form" data-co-form>
      ${num('tfFee', 'Kwota odstępnego (zł)', fee)}
      <label>Płatność<select id="tfInst">${inst}</select></label>
      <label>Termin przejścia<select id="tfWhen">${when}</select></label>
      <label>Procent od następnej sprzedaży<select id="tfSellOn">${so}</select></label>
      ${num('tfBApps', `Premia za ${CO.appsN} występów (zł)`, b.apps, 5000)}
      ${tier > 1 ? num('tfBPromo', 'Premia za awans (zł)', b.promo, 5000) : ''}
      ${num('tfBEuro', 'Premia za puchary europejskie (zł)', b.euro, 5000)}
      <button class="btn btn--primary" data-act="tf-offer" data-id="${esc(p.id)}">Złóż ofertę</button>
    </div>
    <p class="hint">${esc(`Raty: pierwsza przy transferze, kolejne co rok. Klub rozważy ofertę kilka dni i odpowie listem. Liczy całą wartość pakietu: raty mniej warte niż gotówka, premie według szans, procent od sprzedaży więcej u młodych. ${left > 0 ? `W tych rozmowach możesz złożyć jeszcze ${left} ${left === 1 ? 'ofertę' : 'oferty'}.` : ''} Zbyt niska oferta może zerwać rozmowy.`)}</p>`;
}

/** Odpowiedź klubu na zapytanie: „nie na sprzedaż” albo cena wywoławcza i warunki. */
function inquiryBox(inq) {
  return `<div class="co-answer" data-k="${inq.nfs ? 'bad' : 'good'}"><b>${inq.nfs ? 'Nie na sprzedaż' : `Cena wywoławcza: ok. ${esc(fmtZl(inq.ask))}`}</b><span>${esc(inq.text)}</span><small>${esc(`Odpowiedź z ${fmtDate(inq.date)}, ważna 30 dni.`)}</small></div>`;
}

/** Stan rozmów: pakiet i opis. */
function statusBox(game, rec, extra = '') {
  const st = offerStatus(game, rec);
  return `<div class="co-status" data-k="${st.tone}"><b>${esc(st.text)}</b><span>${esc(`Oferta: ${pkgText(rec.status === 'agreed' ? { ...rec.pkg, fee: rec.fee } : rec.pkg)}.`)}</span><small>${esc(regLine(rec))}</small>${extra}</div>`;
}

/**
 * Panel oferty w karcie zawodnika polskiego klubu AI. objection: panel sprzeciwu dyrektora (html) albo ''.
 * Zwraca html.
 */
export function clubOfferPanel(game, p, { objection = '' } = {}) {
  const rec = userOffer(game, p.id);
  const live = rec && rec.seller === p.clubId ? rec : null;
  const seller = clubName(p.clubId);
  if (objection) return objection;
  if (live?.status === 'broken' && live.until > game.date) return `<p class="notice notice--err">${esc(`Rozmowy wstrzymane: ${seller} nie chce rozmawiać przez ${breakWords(dayNo(live.until) - dayNo(game.date))}.`)}</p>`;
  if (live?.status === 'thinking') return `${statusBox(game, live)}<div class="tf-btns"><button class="btn btn--quiet btn--sm" data-act="tf-co-withdraw" data-id="${esc(p.id)}">Wycofaj ofertę</button></div>`;
  if (live?.status === 'agreed') return `${statusBox(game, live)}<button class="btn btn--primary" data-act="tf-negotiate" data-id="${esc(p.id)}">Rozmawiaj z zawodnikiem</button>`;
  if (live?.status === 'counter') {
    const more = live.round < CO.userRounds;
    return `${statusBox(game, live)}<div class="tf-btns"><button class="btn btn--primary btn--sm" data-act="tf-co-accept" data-id="${esc(p.id)}">${esc(`Przyjmij: ${fmtZl(live.counter.fee)}`)}</button><button class="btn btn--quiet btn--sm" data-act="tf-co-withdraw" data-id="${esc(p.id)}">Wycofaj się</button></div>
      ${more ? `<p class="co-sub">Popraw ofertę</p>${offerForm(game, p, live, inquiryOf(game, p.id))}` : '<p class="hint">To była twoja ostatnia oferta w tych rozmowach.</p>'}`;
  }
  const inq = inquiryOf(game, p.id);
  const last = live && ['rejected', 'expired', 'lapsed', 'withdrawn', 'refused'].includes(live.status) ? `<p class="notice">${esc(`${offerStatus(game, live).text}.`)}</p>` : '';
  if (!inq) return `${last}<p class="tf-p__txt">Zapytaj klub o cenę: odpowie od razu, podając cenę wywoławczą i swoje warunki albo że zawodnik nie jest na sprzedaż. Ofertę złożysz w każdej chwili, także poza oknem (transfer w najbliższym oknie albo od następnego sezonu).</p><button class="btn btn--primary" data-act="tf-inquire" data-id="${esc(p.id)}">Zapytaj o cenę</button>`;
  return `${last}${inquiryBox(inq)}${offerForm(game, p, live, inq)}`;
}

/** Znacznik stanu oferty gracza (listy i karta): klub rozważa, kontroferta, porozumienie, rozmowy wstrzymane. */
export function offerTag(game, p) {
  const rec = userOffer(game, p.id);
  if (!rec || rec.seller !== p.clubId) return '';
  const t = { thinking: ['klub rozważa ofertę', 'info'], counter: ['kontroferta klubu', 'warn'], agreed: ['porozumienie klubów', 'good'], broken: rec.until > game.date ? ['rozmowy wstrzymane', 'bad'] : null }[rec.status];
  return t ? `<span class="tf-tag" data-k="${t[1]}">${esc(t[0])}</span>` : '';
}

/** Sekcja „Oferty dla klubów” w zakładce W toku: aktywne rozmowy i ostatnie odpowiedzi. */
export function clubOffersSection(game) {
  const all = (game.market?.cOffers ?? []).filter((r) => r.user && r.buyer === game.clubId);
  const open = activeUserOffers(game);
  const done = all.filter((r) => !open.includes(r) && offerStatus(game, r) && dayNo(game.date) - dayNo(r.date ?? game.date) <= 30).slice(-6).reverse();
  if (!open.length && !done.length) return '';
  const row = (r) => {
    const p = game.world.players[r.pid];
    const st = offerStatus(game, r);
    let act = '';
    if (r.status === 'counter') act = `<div class="td-acts"><button class="btn btn--primary btn--sm" data-act="tf-co-accept" data-id="${esc(r.pid)}">${esc(`Przyjmij: ${fmtZl(r.counter.fee)}`)}</button>${r.round < CO.userRounds ? `<button class="btn btn--quiet btn--sm" data-act="tf-open" data-id="${esc(r.pid)}">Popraw ofertę</button>` : ''}<button class="btn btn--quiet btn--sm" data-act="tf-co-withdraw" data-id="${esc(r.pid)}">Wycofaj się</button></div>`;
    else if (r.status === 'agreed') act = `<div class="td-acts"><button class="btn btn--primary btn--sm" data-act="tf-negotiate" data-id="${esc(r.pid)}">Rozmawiaj z zawodnikiem</button></div>`;
    else if (r.status === 'thinking') act = `<div class="td-acts"><button class="btn btn--quiet btn--sm" data-act="tf-co-withdraw" data-id="${esc(r.pid)}">Wycofaj ofertę</button></div>`;
    const fee = r.status === 'agreed' ? r.fee : r.pkg?.fee ?? 0;
    return `<li class="td-deal" data-state="${r.status === 'agreed' ? 'ok' : OPEN_K.has(r.status) ? 'open' : 'fail'}"${p ? ` data-pid="${esc(p.id)}"` : ''}>
      <div class="td-deal__head">${p ? posBadge(p) : ''}<span class="td-deal__who"><b>${p ? `<span class="pc-link" data-pcard="${esc(p.id)}">${esc(p.name)}</span>` : esc(r.name)}</b><em>${esc(`z ${clubName(r.seller)}`)}</em></span><b class="td-deal__fee">${esc(fee ? fmtZl(fee) : '')}</b></div>
      <p class="td-deal__meta">${esc(`${st.text}.${OPEN_K.has(r.status) && r.pkg ? ` ${regLine(r)}` : ''}`)}</p>${act}
    </li>`;
  };
  const panel = (title, tone, body, count = null) => `<section class="tf-p" data-t="${tone}"><h3>${esc(title)}${count != null ? ` <span>${count}</span>` : ''}</h3>${body}</section>`;
  return `${open.length ? panel('Oferty dla klubów', open.some((r) => r.status === 'counter') ? 'bad' : 'warn', `<ul class="td-deals">${open.map(row).join('')}</ul><p class="tf-p__txt">${esc(`Najwyżej ${CO.maxActive} rozmów naraz. Klub rozważa ofertę kilka dni, kontroferta czeka ${CO.respondDays} dni, porozumienie klubów daje ${CO.talkDays} dni na rozmowy z zawodnikiem.`)}</p>`, open.length) : ''}
    ${done.length ? panel('Ostatnie odpowiedzi klubów', 'info', `<ul class="td-deals">${done.map(row).join('')}</ul>`) : ''}`;
}
const OPEN_K = new Set(['thinking', 'counter', 'agreed']);

/** Pakiet z formularza (root: element DOM; w testach wartości z dataset). */
export function readOfferForm(root, ds = {}) {
  const val = (sel, d) => root?.querySelector(sel)?.value ?? d;
  return normPkg({
    fee: val('#tfFee', ds.fee), inst: val('#tfInst', ds.inst ?? 1), when: val('#tfWhen', ds.when ?? null), sellOn: val('#tfSellOn', ds.sellOn ?? 0),
    bonus: { apps: val('#tfBApps', ds.bApps ?? 0), promo: val('#tfBPromo', ds.bPromo ?? 0), euro: val('#tfBEuro', ds.bEuro ?? 0) },
  });
}

/** Akcje modułu: zapytanie, odpowiedź na kontrofertę, wycofanie. Zwraca wynik jak handleTransferAction albo null. */
export function handleClubOfferAction(game, act, ds = {}) {
  switch (act) {
    case 'tf-inquire': { const a = inquire(game, ds.id); return { ui: { tfMsg: a.error ? a.text : null }, save: !a.error }; }
    case 'tf-co-accept': { const r = answerCounter(game, ds.id, 'accept'); return { ui: { tfMsg: r.text }, save: r.ok }; }
    case 'tf-co-withdraw': {
      const rec = userOffer(game, ds.id);
      const r = rec?.status === 'counter' ? answerCounter(game, ds.id, 'withdraw') : withdrawClubOffer(game, ds.id);
      return { ui: { tfMsg: r.text }, save: r.ok };
    }
    default: return null;
  }
}

