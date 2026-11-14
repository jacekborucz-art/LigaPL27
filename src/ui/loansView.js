// Wypożyczenia w zakładce Transfery (docs/wypozyczenia.md): warunki wypożyczenia do klubu (karta cudzego zawodnika),
// panel „Wypożycz” (własny zawodnik), stan wypożyczenia, sekcja „Wypożyczeni z klubu” w Kontraktach z licznikami
// limitów PZPN. Akcje z prefiksem „tf-ln-” (obsługa: handleLoanAction, wywoływana z transfersView.js). Style: .ln- w transfers.css.
import { clubById } from '../data/clubs_pl.js';
import { DOMESTIC } from '../config/calendar2026.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate } from './dom.js';
import { GROUP } from '../career/squad.js';
import { fmtZl, askingPrice, windowOf } from '../career/transfers.js';
import {
  LOAN, LOAN_TYPE_NAMES, loanTypesFor, loanUntil, loanFee, loanTerms, lenderTerms, loanCounts, loansOut, loansIn, isLoanedOut,
  openLoanOffers, askLoanOffers, cancelLoanAsk, acceptLoanOffer, rejectLoanOffers, recallLoan, recallCost, terminateLoan, sendBackLoan,
  exerciseOption, matchFirstRefusal, loanExempt, requestLoanIn,
} from '../career/loans.js';

const name = (id) => clubById(id)?.name ?? 'klub';
const crest = (id, size = 20) => (clubById(id) ? crestHtml(clubById(id), { size }) : '');
const pct = (x) => `${Math.round(x * 100)} %`;
const tag = (txt, k = 'info') => `<span class="tf-tag" data-k="${k}">${esc(txt)}</span>`;
const daysTo = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
const SHARES = [25, 40, 50, 60, 65, 75, 90, 100];
const minutesShare = (L) => (L.games ? L.minutes / (L.games * 90) : 0);
export const isLoanAction = (act) => typeof act === 'string' && act.startsWith('tf-ln-');

/** Krótkie wyjaśnienie: opcja, obowiązek, pierwokup, odwołanie, zakaz gry przeciwko klubowi macierzystemu. */
function glossary() {
  return `<details class="ln-help"><summary>Co oznaczają warunki</summary><dl>
    <dt>Opcja wykupu</dt><dd>Prawo, nie obowiązek: klub wypożyczający może kupić zawodnika za kwotę ustaloną teraz. Decyzja w ostatnich ${LOAN.DECIDE_DAYS} dniach wypożyczenia.</dd>
    <dt>Obowiązek wykupu</dt><dd>Transfer następuje sam w dniu końca wypożyczenia, jeśli warunek jest spełniony (liczba występów albo utrzymanie w lidze). Kontrakt po wykupie ustalony od razu.</dd>
    <dt>Prawo pierwokupu</dt><dd>Gdy klub macierzysty przyjmie ofertę innego klubu (w trakcie wypożyczenia i ${LOAN.ROFR_DAYS} dni po nim), wypożyczający może ją wyrównać w ${LOAN.ROFR_MATCH_DAYS} dni. W Polsce „pierwokupem” często nazywa się też opcję wykupu.</dd>
    <dt>Klauzula odwołania</dt><dd>Klub macierzysty może ściągnąć zawodnika w zimowym oknie: zwraca część opłaty i płaci ${pct(LOAN.RECALL_X)} wartości.</dd>
    <dt>Zakaz gry przeciwko klubowi macierzystemu</dt><dd>W Polsce przepisy tego nie zakazują, to zapis w umowie (sporny wobec art. 18bis RSTP FIFA). Wypożyczający płaci za to ok. ${LOAN.NO_PARENT_CUT} pkt mniej pensji.</dd>
  </dl></details>`;
}

function typeSelect(date, sel = null) {
  const types = loanTypesFor(date);
  if (!types.length) return '';
  const cur = types.includes(sel) ? sel : types[types.length - 1];
  return `<label>Rodzaj<select id="lnType">${types.map((t) => `<option value="${t}"${t === cur ? ' selected' : ''}>${esc(LOAN_TYPE_NAMES[t])}, do ${esc(fmtDate(loanUntil(t, date)))}</option>`).join('')}</select></label>`;
}
const shareSelect = (def, label = 'Część pensji, którą płacisz') => `<label>${esc(label)}<select id="tfShare">${SHARES.map((s) => `<option value="${s}"${s === def ? ' selected' : ''}>${s} %</option>`).join('')}</select></label>`;
const check = (id, label, on = false) => `<label class="ln-check"><input type="checkbox" id="${id}"${on ? ' checked' : ''}><span>${esc(label)}</span></label>`;

/** Warunki wypożyczenia do klubu gracza (karta zawodnika klubu AI). */
export function loanInForm(game, p, open) {
  const types = loanTypesFor(game.date);
  const type = types[types.length - 1] ?? 'sezon';
  const base = loanTerms(game, p, { share: 100, type });
  const lend = lenderTerms(game, p, base);
  const min = lend.min ?? 50;
  const def = SHARES.find((s) => s >= min) ?? 100;
  const price = askingPrice(game, p);
  const fee = loanFee(p, type);
  return `<div class="tf-offer tf-offer--loan ln-form" data-ln-form>
    <h4 class="ln-h">Wypożyczenie</h4>
    ${open ? typeSelect(game.date, type) : '<p class="hint">Okno transferowe jest zamknięte: wypożyczysz w następnym oknie.</p>'}
    ${shareSelect(def)}
    <label>Opcja wykupu (zł, puste: bez)<input id="lnOption" type="number" min="0" step="10000" placeholder="${Math.round(price / 10000) * 10000}"></label>
    <label>Obowiązek wykupu (zł, puste: bez)<input id="lnObl" type="number" min="0" step="10000" placeholder="${Math.round(price * 0.9 / 10000) * 10000}"></label>
    <label>Warunek obowiązku<select id="lnCond"><option value="apps">co najmniej ${LOAN.OBLIGATION_APPS[type] ?? 15} występów</option><option value="stayUp">utrzymanie w lidze</option></select></label>
    <div class="ln-checks">${check('lnRofr', 'Prawo pierwokupu')}${check('lnRecall', 'Klauzula odwołania (dla klubu macierzystego)')}${check('lnNoParent', 'Zakaz gry przeciwko klubowi macierzystemu')}</div>
    <button class="btn btn--quiet" data-act="tf-loan" data-id="${esc(p.id)}" ${open ? '' : 'disabled'}>Wypożycz</button>
    <p class="hint">Klub chce co najmniej ${min} % pensji (z pierwokupem więcej, z odwołaniem i zakazem gry mniej). Opłata: ${fee ? `${fmtZl(fee)} za sezon (runda: połowa)` : 'brak (do 21 lat)'}. Opcja wykupu: klub chce co najmniej ${fmtZl(price)}.</p>
    ${glossary()}
  </div>`;
}

/** Wypożyczenie w liczbach (karta zawodnika wypożyczonego do albo z klubu). */
export function loanFacts(game, p) {
  const L = p.loan;
  if (!L) return '';
  const share = minutesShare(L);
  const rows = [
    ['Rodzaj', `${LOAN_TYPE_NAMES[L.type] ?? 'do końca sezonu'}, do ${fmtDate(L.until)}`],
    ['Pensja', `${fmtZl(L.wage ?? 0)} tygodniowo: wypożyczający ${L.share ?? 100} %, macierzysty ${100 - (L.share ?? 100)} %`],
    ['Opłata', L.fee ? fmtZl(L.fee) : 'bez opłaty'],
    ['Gra', `${L.apps ?? 0} meczów, ${pct(share)} minut zespołu (obietnica ${pct(L.promise ?? LOAN.PROMISE)})`],
    L.option ? ['Opcja wykupu', `${fmtZl(L.option.fee)}${L.exercised ? ', zgłoszona' : ''}`] : null,
    L.obligation ? ['Obowiązek wykupu', `${fmtZl(L.obligation.fee)}, ${L.obligation.stayUp ? 'przy utrzymaniu w lidze' : `po ${L.obligation.apps} występach (teraz ${L.apps ?? 0})`}`] : null,
    L.firstRefusal ? ['Prawo pierwokupu', `do ${fmtDate(addDaysIso(L.until, LOAN.ROFR_DAYS))}`] : null,
    L.recall ? ['Klauzula odwołania', 'tak, w zimowym oknie'] : null,
    L.noParent ? ['Mecze z klubem macierzystym', 'nie gra (zapis w umowie)'] : null,
  ].filter(Boolean);
  return `<dl class="ln-facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}
function addDaysIso(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/** Przyciski dla zawodnika wypożyczonego z klubu gracza: odwołanie, przerwanie. */
function outActions(game, p) {
  const L = p.loan;
  const winter = windowOf(game.date) === DOMESTIC.transferWindows[1];
  const btn = [];
  if (L.recall) btn.push(winter ? `<button class="btn btn--quiet btn--sm" data-act="tf-ln-recall" data-id="${esc(p.id)}">Odwołaj (${fmtZl(recallCost(p, game.date))})</button>` : '<span class="ln-note">odwołanie w zimowym oknie</span>');
  if (L.breach) btn.push(`<button class="btn btn--quiet btn--sm" data-act="tf-ln-end" data-id="${esc(p.id)}">Przerwij bez kosztów</button>`);
  else if (windowOf(game.date)) btn.push(`<button class="btn btn--quiet btn--sm" data-act="tf-ln-end" data-id="${esc(p.id)}">Przerwij za porozumieniem</button>`);
  return btn.join('');
}
/** Przyciski dla zawodnika wypożyczonego do klubu gracza: wykup, odesłanie. */
function inActions(game, p) {
  const L = p.loan;
  const btn = [];
  if (L.option && !L.exercised && daysTo(game.date, L.until) <= LOAN.DECIDE_DAYS) btn.push(`<button class="btn btn--primary btn--sm" data-act="tf-ln-buy" data-id="${esc(p.id)}">Wykup za ${fmtZl(L.option.fee)}</button>`);
  if (windowOf(game.date)) btn.push(`<button class="btn btn--quiet btn--sm" data-act="tf-ln-send" data-id="${esc(p.id)}">Odeślij do klubu</button>`);
  return btn.join('');
}

function statusTags(L) {
  return [
    L.option ? tag(L.exercised ? 'wykup zgłoszony' : `opcja ${fmtZl(L.option.fee)}`, L.exercised ? 'good' : 'misc') : '',
    L.obligation ? tag(`obowiązek ${fmtZl(L.obligation.fee)}`, 'warn') : '',
    L.breach ? tag('obietnica minut niedotrzymana', 'bad') : '',
    L.noParent ? tag('nie gra z nami', 'info') : '',
  ].filter(Boolean).join(' ');
}

/** Karta zawodnika wypożyczonego z klubu gracza (część główna i boczna). */
export function loanedOutPanels(game, p) {
  return {
    main: `<section class="tf-p ln-p" data-t="info"><h3>Wypożyczenie do ${esc(name(p.clubId))}</h3>${loanFacts(game, p)}</section>`,
    side: `<section class="tf-p" data-t="warn"><h3>Decyzje</h3><p class="tf-p__txt">Kontrakt należy do twojego klubu. Sprzedaż możliwa tylko do ${esc(name(p.clubId))} albo po powrocie zawodnika.</p><div class="ln-btns">${outActions(game, p) || '<span class="ln-note">Brak decyzji do podjęcia.</span>'}</div></section>`,
  };
}

/** Panel na karcie zawodnika wypożyczonego do klubu gracza. */
export function loanedInPanel(game, p) {
  return `<section class="tf-p ln-p" data-t="info"><h3>Wypożyczony z ${esc(name(p.loan.from))}</h3>${loanFacts(game, p)}<div class="ln-btns">${inActions(game, p)}</div></section>`;
}

/** Panel „Wypożycz” na karcie własnego zawodnika: prośba o propozycje, otwarte propozycje. */
export function loanOutPanel(game, p) {
  const ask = game.market.loanAsks?.[p.id];
  const offers = openLoanOffers(game, p.id);
  const open = !!windowOf(game.date);
  let body;
  if (offers.length) {
    body = `<ul class="ln-offers">${offers.map((o) => `<li>${crest(o.from, 24)}<div><b>${esc(name(o.from))}</b><small>${esc(LOAN_TYPE_NAMES[o.terms.type])}, płaci ${o.terms.share} % pensji${o.terms.fee ? `, opłata ${fmtZl(o.terms.fee)}` : ''}${o.terms.option ? `, opcja ${fmtZl(o.terms.option.fee)}` : ''}${o.terms.obligation ? `, obowiązek ${fmtZl(o.terms.obligation.fee)}` : ''}${o.dropped?.length ? `; bez ${esc(o.dropped.join(' i '))}` : ''}. Ważna do ${esc(fmtDate(o.expires))}.</small></div>
      <span class="ln-btns"><button class="btn btn--primary btn--sm" data-act="tf-ln-accept" data-o="${esc(o.id)}">Przyjmij</button><button class="btn btn--quiet btn--sm" data-act="tf-ln-reject" data-o="${esc(o.id)}">Odrzuć</button></span></li>`).join('')}</ul>`;
  } else if (ask) {
    body = `<p class="tf-p__txt">Dyrektor sportowy szuka klubu. Propozycje przyjdą najpóźniej ${esc(fmtDate(ask.due))} (list w poczcie).</p><button class="btn btn--quiet btn--sm" data-act="tf-ln-cancel" data-id="${esc(p.id)}">Zrezygnuj</button>`;
  } else if (!open) {
    body = '<p class="tf-p__txt">Okno transferowe jest zamknięte. Klub dla zawodnika poszukasz w następnym oknie.</p>';
  } else {
    const c = loanCounts(game, game.clubId);
    body = `<div class="tf-offer ln-form" data-ln-form>
      ${typeSelect(game.date)}
      ${shareSelect(100, 'Oczekiwana część pensji od klubu')}
      <label>Opcja wykupu (zł, puste: bez)<input id="lnOption" type="number" min="0" step="10000" placeholder="${Math.round((p.value ?? 0) * 1.3 / 10000) * 10000}"></label>
      <label>Obowiązek wykupu (zł, puste: bez)<input id="lnObl" type="number" min="0" step="10000"></label>
      <div class="ln-checks">${check('lnRecall', 'Klauzula odwołania (zimą)')}${check('lnNoParent', 'Zakaz gry przeciwko nam')}</div>
      <button class="btn btn--quiet" data-act="tf-ln-ask" data-id="${esc(p.id)}">Szukaj klubu</button>
    </div>
    <p class="hint">Za 1-3 dni przyjdzie 1-3 propozycji od klubów z tej samej albo niższej ligi, którym brakuje zawodnika na tej pozycji. Resztę pensji płaci twój klub. Wypożyczeni z klubu: ${c.out}/${LOAN.MAX_OUT}${loanExempt(p, game.clubId) ? ', ten zawodnik nie liczy się do limitu' : ''}.</p>`;
  }
  return `<section class="tf-p" data-t="misc"><h3>Wypożycz</h3>${body}</section>`;
}

/** Kontrakty: wypożyczeni z klubu i do klubu, licznik limitów PZPN, otwarte propozycje. */
export function loansSection(game) {
  const c = loanCounts(game, game.clubId);
  const out = loansOut(game, game.clubId).sort((a, b) => a.loan.until.localeCompare(b.loan.until));
  const inn = loansIn(game, game.clubId);
  const offers = openLoanOffers(game);
  const row = (p, mine) => {
    const L = p.loan; const club = mine ? p.clubId : L.from;
    return `<li class="ln-row" data-pid="${esc(p.id)}">
      <button class="ln-who" data-act="tf-open" data-id="${esc(p.id)}"><span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span><span class="ln-name">${esc(p.name)}<em>${crest(club, 16)}${esc(mine ? `w ${name(club)}` : `z ${name(club)}`)}, do ${esc(fmtDate(L.until))}</em></span></button>
      <span class="ln-play"><b>${L.apps ?? 0} meczów</b><small>${pct(minutesShare(L))} minut</small></span>
      <span class="ln-tags">${statusTags(L)}</span>
      <span class="ln-btns">${mine ? outActions(game, p) : inActions(game, p)}</span></li>`;
  };
  const props = offers.length ? `<h4 class="ln-h">Propozycje wypożyczenia</h4><ul class="ln-offers">${offers.map((o) => {
    const p = game.world.players[o.playerId];
    return p ? `<li>${crest(o.from, 24)}<div><b>${esc(p.name)} do ${esc(name(o.from))}</b><small>${esc(LOAN_TYPE_NAMES[o.terms.type])}, płaci ${o.terms.share} % pensji${o.terms.fee ? `, opłata ${fmtZl(o.terms.fee)}` : ''}, ważna do ${esc(fmtDate(o.expires))}</small></div>
      <span class="ln-btns"><button class="btn btn--primary btn--sm" data-act="tf-ln-accept" data-o="${esc(o.id)}">Przyjmij</button><button class="btn btn--quiet btn--sm" data-act="tf-ln-reject" data-o="${esc(o.id)}">Odrzuć</button></span></li>` : '';
  }).join('')}</ul>` : '';
  const body = `<p class="ln-count"><b>Wypożyczenia: ${c.out}/${LOAN.MAX_OUT} z klubu, ${c.in}/${LOAN.MAX_IN} do klubu</b><small>Limit PZPN liczy zawodników powyżej ${LOAN.EXEMPT_AGE} lat, którzy nie są wychowankami (razem z klubu ${c.outAll}, do klubu ${c.inAll}). Najwyżej ${LOAN.MAX_PAIR} do jednego klubu.</small></p>
    ${props}
    <h4 class="ln-h">Wypożyczeni z klubu (${out.length})</h4>
    ${out.length ? `<ul class="ln-list">${out.map((p) => row(p, true)).join('')}</ul>` : '<p class="tf-p__txt">Nikt. Zawodnika wypożyczysz z jego karty (panel Wypożycz) w oknie transferowym.</p>'}
    <h4 class="ln-h">Wypożyczeni do klubu (${inn.length})</h4>
    ${inn.length ? `<ul class="ln-list">${inn.map((p) => row(p, false)).join('')}</ul>` : '<p class="tf-p__txt">Nikt. Zawodników do wypożyczenia znajdziesz na Rynku (lista Do wypożyczenia).</p>'}`;
  return `<section class="tf-p ln-sec" data-t="info" aria-labelledby="ln-sec-h"><h3 id="ln-sec-h">Wypożyczenia</h3>${body}</section>`;
}

/** Warunki z formularza (root: element DOM albo null w testach; wtedy z dataset). */
export function readLoanForm(root, ds = {}) {
  const el = (id) => root?.querySelector?.(`#${id}`) ?? null;
  const num = (id, d) => { const v = el(id)?.value; return v != null && v !== '' ? Number(v) : Number(d ?? 0) || 0; };
  const on = (id, d) => (el(id) ? !!el(id).checked : d === '1' || d === true);
  return {
    type: el('lnType')?.value ?? ds.type,
    share: num('tfShare', ds.share ?? 100),
    optionFee: num('lnOption', ds.option), obligationFee: num('lnObl', ds.obl),
    stayUp: (el('lnCond')?.value ?? ds.cond) === 'stayUp',
    firstRefusal: on('lnRofr', ds.rofr), recall: on('lnRecall', ds.recall), noParent: on('lnNoParent', ds.noParent),
  };
}

/** Akcja tf-loan (wypożyczenie do klubu z formularza warunków). */
export function loanInAction(game, p, ds, root) {
  const r = requestLoanIn(game, p.id, readLoanForm(root, ds));
  return { ui: { tfMsg: r.text, ...(r.ok ? { tfPlayer: null, tfTab: 'kontrakty' } : {}) }, save: r.ok, squadChanged: r.ok };
}

/** Obsługa akcji „tf-ln-”. Zwraca { ui, save, squadChanged?, resolveOffer? } jak handleTransferAction. */
export function handleLoanAction(game, act, ds = {}, root = null) {
  const done = (r, extra = {}) => ({ ui: { tfMsg: r.text, ...(extra.ui ?? {}) }, save: !!r.ok, squadChanged: !!r.squad, ...extra.more });
  switch (act) {
    case 'tf-ln-ask': return done(askLoanOffers(game, ds.id, readLoanForm(root, ds)));
    case 'tf-ln-cancel': return done(cancelLoanAsk(game, ds.id));
    case 'tf-ln-accept': { const r = acceptLoanOffer(game, ds.o); return done(r, { ui: r.ok ? { tfPlayer: null, tfTab: 'kontrakty' } : {}, more: { resolveOffer: ds.o } }); }
    case 'tf-ln-reject': return done(rejectLoanOffers(game, [ds.o]), { more: { resolveOffer: ds.o } });
    case 'tf-ln-recall': return done(recallLoan(game, ds.id));
    case 'tf-ln-end': return done(terminateLoan(game, ds.id));
    case 'tf-ln-send': return done(sendBackLoan(game, ds.id), { ui: { tfPlayer: null } });
    case 'tf-ln-buy': return done(exerciseOption(game, ds.id));
    case 'tf-ln-match': return done(matchFirstRefusal(game, ds.o), { more: { resolveOffer: ds.o } });
    default: return { ui: {} };
  }
}

export { isLoanedOut };
