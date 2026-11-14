// Transfery w toku, umowy od 1 lipca i prośby o transfer w zakładce Transfery (docs/transfery.md).
// Zakładka „W toku”: transakcje z paskiem etapów i spodziewaną datą zgłoszenia, prekontrakty, prośby o transfer.
// Elementy kart zawodników: znaczniki, panel prośby o transfer (reakcje), panel umowy od 1 lipca.
// Style: src/styles/transfers.css (prefiks .td-). Akcje z prefiksem „tf-”, obsługa w transfersView.js.
import { clubById } from '../data/clubs_pl.js';
import { GROUP } from '../career/squad.js';
import { esc, fmtDate } from './dom.js';
import { fmtZl, windowOf } from '../career/transfers.js';
import { dealOf, openDeals, dealStages, expectedRegistration, buyerName, STAGE_LABELS, FAIL_LABELS, STAGE_I, cancelDeal } from '../career/transferDeals.js';
import { canApproach, checkUserPre, preOpensOn, earlyPrice, earlyBuy, userPreContracts, PRE } from '../career/preContracts.js';
import { reactToWish, WISH_ACTIONS } from '../career/moveWish.js';
import { squadOf } from '../world/worldGen.js';
import { anyClub } from '../season/season.js';

const posBadge = (p) => `<span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span>`;
const tag = (txt, k = 'info') => `<span class="tf-tag" data-k="${k}">${esc(txt)}</span>`;
const clubName = (id) => clubById(id)?.name ?? anyClub(id)?.name ?? 'klub';
const panel = (title, tone, body, count = null) => `<section class="tf-p" data-t="${tone}"><h3>${esc(title)}${count != null ? ` <span>${count}</span>` : ''}</h3>${body}</section>`;

/** Nazwa klubu, z którym zawodnik ma umowę od 1 lipca. */
export const preClubName = (pc) => (pc.foreign ? pc.foreign.name : clubName(pc.club));

// ------------------------------------------------------------ Znaczniki
/** Znaczniki transferowe zawodnika (Kontrakty, karta): transakcja w toku, umowa od 1 lipca, prośba o transfer. */
export function dealTags(game, p) {
  const out = [];
  const d = dealOf(game, p.id);
  if (d) out.push(tag(d.from === p.clubId && d.to !== game.clubId ? `odchodzi: ${STAGE_LABELS[d.stage].toLowerCase()}` : `transfer w toku: ${STAGE_LABELS[d.stage].toLowerCase()}`, 'info'));
  if (p.preContract) out.push(tag(`porozumienie z ${preClubName(p.preContract)} od ${fmtDate(p.preContract.start)}`, p.clubId === game.clubId ? 'bad' : 'misc'));
  if (p.moveWish && !p.transferRequest) out.push(tag('chce odejść', 'warn'));
  return out.join('');
}

// ------------------------------------------------------------ Pasek etapów
/** Pasek etapów transakcji (segmenty: zrobione, teraz, przed nami). */
export function stageBar(d) {
  const stages = dealStages(d);
  const now = d.end ? (d.end.result === 'registered' ? stages.length : stages.indexOf(d.stage)) : stages.indexOf(d.stage);
  const state = (i) => (d.end?.result === 'registered' || i < now ? 'done' : i === now ? (d.end ? 'fail' : 'now') : 'todo');
  const label = d.end ? (d.end.result === 'registered' ? 'Zgłoszony' : `Upadł: ${FAIL_LABELS[d.end.reason] ?? d.end.reason}`) : STAGE_LABELS[d.stage];
  return `<div class="td-bar" role="img" aria-label="Etap ${Math.min(now + 1, stages.length)} z ${stages.length}: ${esc(label)}">${stages.map((s, i) => `<i data-s="${state(i)}" title="${esc(STAGE_LABELS[s])}"></i>`).join('')}</div>`;
}

function dealRow(game, d, { mine = false } = {}) {
  const p = game.world.players[d.pid];
  const route = `${d.from ? clubName(d.from) : d.origin ? `${d.origin.name} (${d.origin.countryName ?? d.origin.country})` : 'wolny zawodnik'} do ${d.foreign ? `${d.foreign.name} (${d.foreign.countryName ?? d.foreign.country})` : clubName(d.to)}`;
  const terms = d.fee ? fmtZl(d.fee) : 'bez odstępnego';
  const meta = d.end
    ? (d.end.result === 'registered' ? `Zgłoszony ${fmtDate(d.end.date)}${d.lastMinute ? ', w ostatniej chwili' : ''}.` : `Upadł ${fmtDate(d.end.date)}: ${FAIL_LABELS[d.end.reason] ?? d.end.reason}.`)
    : `Etap: ${STAGE_LABELS[d.stage].toLowerCase()}. Spodziewane zgłoszenie: ${fmtDate(expectedRegistration(d))}.${d.renegotiated ? ' Kwota obniżona po testach medycznych.' : ''}`;
  const cancel = mine && !d.end && STAGE_I[d.stage] < STAGE_I.announce
    ? `<button class="btn btn--quiet btn--sm" data-act="tf-deal-cancel" data-d="${esc(d.id)}">${d.from === game.clubId ? 'Wstrzymaj transfer' : 'Wycofaj się'}</button>` : '';
  return `<li class="td-deal" data-state="${d.end ? (d.end.result === 'registered' ? 'ok' : 'fail') : 'open'}"${p ? ` data-pid="${esc(p.id)}"` : ''}>
    <div class="td-deal__head">${p ? posBadge(p) : ''}<span class="td-deal__who"><b>${esc(d.name)}</b><em>${esc(route)}</em></span><b class="td-deal__fee">${esc(terms)}</b></div>
    ${stageBar(d)}
    <p class="td-deal__meta">${esc(meta)}</p>${cancel}
  </li>`;
}

// ------------------------------------------------------------ Zakładka „W toku”
export function dealsView(game, ui = {}) {
  const all = game.market.deals ?? [];
  const isMine = (d) => d.to === game.clubId || d.from === game.clubId;
  const mineOpen = all.filter((d) => isMine(d) && !d.end);
  const mineDone = all.filter((d) => isMine(d) && d.end).slice(-8).reverse();
  const others = openDeals(game).filter((d) => !isMine(d)).sort((a, b) => (b.fee || 0) - (a.fee || 0));
  const list = (ds, mine) => `<ul class="td-deals">${ds.map((d) => dealRow(game, d, { mine })).join('')}</ul>`;
  const preIn = userPreContracts(game);
  const preOut = squadOf(game.world, game.clubId).filter((p) => p.preContract);
  const wishes = squadOf(game.world, game.clubId).filter((p) => p.moveWish);
  const preList = (ps, dir) => ps.length ? `<ul class="tf-mini">${ps.map((p) => `<li data-pid="${esc(p.id)}"><button data-act="tf-open" data-id="${esc(p.id)}">${posBadge(p)}<span>${esc(p.name)}<em>${esc(dir === 'in' ? `z ${clubName(p.clubId)}` : `do ${preClubName(p.preContract)}`)}</em></span><small>od ${esc(fmtDate(p.preContract.start))}</small></button></li>`).join('')}</ul>` : '';
  const wishList = wishes.length ? `<ul class="tf-mini">${wishes.map((p) => `<li data-pid="${esc(p.id)}"><button data-act="tf-open" data-id="${esc(p.id)}">${posBadge(p)}<span>${esc(p.name)}<em>${esc(p.moveWish.stage === 'oficjalna' ? 'oficjalna prośba o transfer' : 'agent sygnalizuje chęć odejścia')}</em></span><small data-k="${p.moveWish.stage === 'oficjalna' ? 'bad' : 'warn'}">od ${esc(fmtDate(p.moveWish.since))}</small></button></li>`).join('')}</ul>`
    : '<p class="tf-p__txt">Nikt nie prosi o transfer.</p>';
  const msg = ui.tfMsg ? `<p class="notice">${esc(ui.tfMsg)}</p>` : '';
  return `${msg}<div class="td-view">
      <div class="td-col">
        ${panel('Transakcje twojego klubu', mineOpen.length ? 'warn' : 'info', mineOpen.length ? list(mineOpen, true) : '<p class="tf-p__txt">Brak transakcji w toku. Po porozumieniu klubów zawodnik przechodzi warunki osobiste, testy medyczne i zgłoszenie. Transfer krajowy trwa 2 do 4 dni, zagraniczny 5 do 9.</p>', mineOpen.length)}
        ${mineDone.length ? panel('Ostatnio zakończone', 'good', list(mineDone, false)) : ''}
        ${panel('Transakcje w Polsce', 'misc', others.length ? list(others.slice(0, 12), false) : '<p class="tf-p__txt">Kluby nie prowadzą teraz transakcji.</p>', others.length)}
      </div>
      <div class="td-col">
        ${panel('Umowy od 1 lipca', preIn.length + preOut.length ? 'misc' : 'info', `${preIn.length ? `<h4 class="td-h">Przyjdą do nas (${preIn.length} z ${PRE.userMax})</h4>${preList(preIn, 'in')}` : ''}${preOut.length ? `<h4 class="td-h">Odejdą od nas</h4>${preList(preOut, 'out')}` : ''}${preIn.length + preOut.length ? '' : `<p class="tf-p__txt">Zawodnikom, którym zostało najwyżej ${PRE.months} miesięcy kontraktu, możesz zaproponować umowę od 1 lipca (karta zawodnika na Rynku). Kontrakty kończące się w czerwcu otwierają tę możliwość 1 stycznia.</p>`}`)}
        ${panel('Prośby o transfer', wishes.length ? 'warn' : 'good', wishList, wishes.length || null)}
      </div>
    </div>`;
}

// ------------------------------------------------------------ Karta własnego zawodnika
/** Panele transferowe karty własnego zawodnika: transakcja w toku, umowa od 1 lipca, prośba o transfer. */
export function ownDealPanels(game, p, ui = {}) {
  const out = [];
  const d = dealOf(game, p.id);
  if (d) out.push(panel('Transfer w toku', 'warn', `<ul class="td-deals">${dealRow(game, d, { mine: true })}</ul>`));
  if (p.preContract) out.push(panel('Umowa od 1 lipca', 'bad', `<p class="tf-p__txt">${esc(p.name)} podpisał umowę z ${esc(preClubName(p.preContract))} od ${esc(fmtDate(p.preContract.start))}. Do tego dnia jest twoim zawodnikiem. Przedłużenie nie jest już możliwe.</p>`));
  const W = p.moveWish;
  if (W) {
    const official = W.stage === 'oficjalna';
    const txt = official ? `${p.name} oficjalnie prosi o transfer (od ${fmtDate(W.official ?? W.since)}).` : `Agent daje znać, że ${p.name} chce odejść. Bez reakcji po 4 tygodniach prośba stanie się oficjalna.`;
    const reacted = W.reacted ? `<p class="tf-p__txt">Twoja reakcja: ${esc({ list: 'lista transferowa', promise: `obietnica zgody na ofertę od ${fmtZl(W.promise?.minFee ?? 0)}${W.promise?.broken ? ' (złamana)' : ''}`, refuse: 'odmowa', ignore: 'brak' }[W.reacted] ?? W.reacted)}.</p>` : '';
    const acts = ['list', 'promise', 'talk', 'raise', 'refuse'].filter((a) => !(a === 'list' && game.market.userListed[p.id]) && !(a === 'promise' && W.promise) && !(a === 'refuse' && W.reacted === 'refuse') && !(a === 'raise' && (p.renewRefused || p.loan)));
    out.push(panel('Prośba o transfer', official ? 'bad' : 'warn', `<p class="tf-p__txt">${esc(txt)}</p>${reacted}<div class="td-acts">${acts.map((a, i) => `<button class="btn ${i === 0 ? 'btn--primary' : 'btn--quiet'} btn--sm" data-act="tf-wish" data-id="${esc(p.id)}" data-a="${a}">${esc(WISH_ACTIONS[a])}</button>`).join('')}</div>`));
  }
  return out.join('');
}

// ------------------------------------------------------------ Karta cudzego zawodnika
/**
 * Panel karty zawodnika innego klubu: transakcja w toku (wtedy bez ofert), umowa od 1 lipca z tobą
 * (wcześniejszy transfer zimą), przycisk „Umowa od 1 lipca”. Zwraca { html, blocked }.
 */
export function otherDealPanel(game, p) {
  const d = dealOf(game, p.id);
  if (d) {
    const mine = d.to === game.clubId;
    return { blocked: true, html: `${mine ? '' : '<p class="notice">Zawodnik jest w trakcie transferu. Klub nie przyjmuje innych ofert.</p>'}<ul class="td-deals">${dealRow(game, d, { mine })}</ul>` };
  }
  const pc = p.preContract;
  if (pc) {
    if (pc.club !== game.clubId) return { blocked: true, html: `<p class="notice">${esc(p.name)} ma umowę z ${esc(preClubName(pc))} od ${esc(fmtDate(pc.start))}. Nie rozmawia z innymi klubami.</p>` };
    const win = windowOf(game.date);
    const price = earlyPrice(game, p);
    return { blocked: true, html: `<p class="tf-p__txt">${esc(p.name)} przyjdzie do ciebie ${esc(fmtDate(pc.start))} na podstawie umowy od 1 lipca.</p>${win ? `<p class="tf-p__txt">${esc(clubName(p.clubId))} odda go wcześniej za ${esc(fmtZl(price))}.</p><button class="btn btn--primary" data-act="tf-early" data-id="${esc(p.id)}">Ściągnij teraz za ${esc(fmtZl(price))}</button>` : '<p class="tf-p__txt">Wcześniejszy transfer możliwy w zimowym oknie transferowym.</p>'}` };
  }
  if (!p.clubId) return { blocked: false, html: '' };
  if (canApproach(p, game.date)) {
    const chk = checkUserPre(game, p);
    return { blocked: false, html: `<div class="td-pre"><p class="tf-p__txt">Kontrakt kończy się ${esc(fmtDate(p.contract.until))}. Możesz rozmawiać o umowie od 1 lipca bez kwoty odstępnego (FIFA RSTP art. 18.3).</p>${chk.ok ? `<button class="btn btn--quiet" data-act="tf-pre" data-id="${esc(p.id)}">Umowa od 1 lipca</button>` : `<p class="hint">${esc(chk.text)}</p>`}</div>` };
  }
  const opens = preOpensOn(p);
  if (opens && p.contract.until <= `${Number(game.date.slice(0, 4)) + 1}-06-30` && opens > game.date) return { blocked: false, html: `<p class="hint">Umowę od 1 lipca zaproponujesz od ${esc(fmtDate(opens))}.</p>` };
  return { blocked: false, html: '' };
}

// ------------------------------------------------------------ Akcje
/** Akcje „tf-” tego modułu. Zwraca wynik jak handleTransferAction albo null (nie ta akcja). */
export function handleDealAction(game, act, ds = {}) {
  switch (act) {
    case 'tf-deal-cancel': { const r = cancelDeal(game, ds.d); return { ui: { tfMsg: r.text }, save: r.ok }; }
    case 'tf-early': { const r = earlyBuy(game, ds.id); return { ui: { tfMsg: r.text }, save: r.ok }; }
    case 'tf-wish': {
      const r = reactToWish(game, ds.id, ds.a);
      return { ui: { tfMsg: r.text }, save: r.ok };
    }
    default: return null;
  }
}
