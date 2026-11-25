// Transfery w toku, propozycje w namyśle, umowy od 1 lipca i prośby o transfer w zakładce Transfery (docs/transfery.md).
// Zakładka „W toku”: propozycje czekające na odpowiedź zawodnika, transakcje z paskiem etapów i spodziewaną datą
// zgłoszenia, prekontrakty, prośby o transfer.
// Elementy kart zawodników: znaczniki, panel prośby o transfer (reakcje), panel umowy od 1 lipca.
// Style: src/styles/transfers.css (prefiks .td-). Akcje z prefiksem „tf-”, obsługa w transfersView.js.
import { cardLink } from './transfersView.js'; // nazwisko jak link do karty w okienku
import { clubById } from '../data/clubs_pl.js';
import { GROUP } from '../career/squad.js';
import { esc, fmtDate } from './dom.js';
import { fmtZl, windowOf } from '../career/transfers.js';
import { formatZl } from '../career/negotiation.js';
import { dealOf, openDeals, dealStages, expectedRegistration, buyerName, STAGE_LABELS, FAIL_LABELS, STAGE_I, cancelDeal } from '../career/transferDeals.js';
import { canApproach, checkUserPre, preOpensOn, earlyPrice, earlyBuy, userPreContracts, PRE } from '../career/preContracts.js';
import { reactToWish, WISH_ACTIONS } from '../career/moveWish.js';
import { wishStateText } from '../career/wishMemory.js';
import { squadOf } from '../world/worldGen.js';
import { anyClub } from '../season/season.js';
import { proposalsFor, userProposal, thinkingUntil, withdrawProposal, canImprove, improveUserProposal, finalChance, THINK } from '../career/proposals.js'; // namysł zawodnika (docs/transfery.md, rozdz. 10)
import { joinStatusText } from '../career/lateJoins.js'; // wolny zawodnik z umową poza oknem
import { clubOffersSection, offerTag } from './clubOffersView.js'; // oferty klub-klub (src/career/clubOffers.js)

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
  if (p.moveWish?.promise && !p.moveWish.promise.broken) out.push(tag('czeka do okna', 'warn'));
  else if (p.moveWish && !p.transferRequest) out.push(tag('chce odejść', 'warn'));
  else if (!p.moveWish && p.clubId === game.clubId && p.wishMemory?.mood === 'rozczarowany') out.push(tag('rozczarowany, zostaje', 'warn'));
  if (!d && proposalsFor(game, p.id).length) out.push(tag('zawodnik się zastanawia', 'info')); // bez daty decyzji
  if (!d && p.clubId && p.clubId !== game.clubId) out.push(offerTag(game, p)); // oferta klub-klub: klub rozważa, kontroferta, porozumienie
  return out.join('');
}

// ------------------------------------------------------------ Propozycje (namysł zawodnika)
const PROP_END = { accepted: 'zgoda', rejected: 'odmowa', lost: 'wybrał inny klub', expired: 'nieaktualna', withdrawn: 'wycofana', failed: 'ostatnia runda bez porozumienia' };
const PROP_WHY = { stays: 'zostaje w obecnym klubie po nowym kontrakcie' };

/** Wiersz propozycji gracza (albo oferty klubu AI za jego zawodnika). */
function propRow(game, x) {
  const p = game.world.players[x.pid];
  const sale = !x.user;
  const route = sale ? `oferta ${clubName(x.to)}` : x.from ? `z ${clubName(x.from)}` : x.fromState === 'pool' ? `z ${p?.abroad?.club ?? 'zagranicy'}` : 'wolny zawodnik';
  const terms = `${formatZl(x.contract?.wage ?? 0)} tygodniowo${x.fee ? `, odstępne ${fmtZl(x.fee)}` : ''}`; // pensja dokładnie: poprawka 4-12 % musi być widoczna
  let meta; let act = '';
  if (x.status === 'changes') {
    meta = `Chce zmian w kontrakcie: pensja ${fmtZl(x.want?.wage ?? 0)} tygodniowo. Ostatnia runda rozmów do ${fmtDate(x.deadline)}.`;
    act = `<div class="td-acts"><button class="btn btn--primary btn--sm" data-act="tf-lastround" data-id="${esc(x.pid)}">Ostatnia runda rozmów</button></div>`;
  } else if (x.status === 'open' && finalChance(game, x)) {
    // Ostatnia szansa: zawodnik ma wątpliwości, jedna poprawka pensji do terminu (decyzja gracza, termin widoczny)
    meta = `Zawodnik ma wątpliwości. Ostatnia szansa: popraw pensję do ${fmtDate(x.final.until)}, bez poprawki odmówi.`;
    act = `<div class="td-acts">${THINK.improve.map((k) => `<button class="btn btn--primary btn--sm" data-act="tf-prop-raise" data-d="${esc(x.id)}" data-k="${k}">Pensja +${k} %</button>`).join('')}<button class="btn btn--quiet btn--sm" data-act="tf-prop-cancel" data-d="${esc(x.id)}">Wycofaj propozycję</button></div>`;
  } else if (x.status === 'open') {
    meta = `Zawodnik się zastanawia${sale ? ' nad ofertą' : ''}.${x.note && !sale ? ` ${x.note}` : ''}`; // bez daty decyzji
    // Licytacja w ciemno: inny klub złożył propozycję po twojej (bez klubu i kwoty), jedna poprawka pensji
    if (x.user && (x.rivals ?? 0) > 0) meta += x.improved ? ' Rozważa też inną propozycję. Swoją już poprawiłeś.' : ' Rozważa też propozycję innego klubu. Możesz raz poprawić pensję.';
    const raise = canImprove(game, x) ? THINK.improve.map((k) => `<button class="btn btn--primary btn--sm" data-act="tf-prop-raise" data-d="${esc(x.id)}" data-k="${k}">Pensja +${k} %</button>`).join('') : '';
    if (x.user) act = `<div class="td-acts">${raise}<button class="btn btn--quiet btn--sm" data-act="tf-prop-cancel" data-d="${esc(x.id)}">Wycofaj propozycję</button></div>`;
  } else meta = `Odpowiedź ${fmtDate(x.end?.date ?? x.date)}: ${PROP_WHY[x.end?.reason] ?? PROP_END[x.status] ?? x.status}${x.status === 'lost' && x.end?.winner ? ` (${clubName(x.end.winner)})` : ''}${x.end?.join ? `, dołączy ${fmtDate(x.end.join)} (otwarcie okna)` : ''}.`;
  return `<li class="td-deal" data-state="${x.status === 'accepted' ? 'ok' : x.status === 'open' || x.status === 'changes' ? 'open' : 'fail'}"${p ? ` data-pid="${esc(p.id)}"` : ''}>
    <div class="td-deal__head">${p ? posBadge(p) : ''}<span class="td-deal__who"><b>${p ? cardLink(p) : esc(x.name)}</b><em>${esc(route)}</em></span><b class="td-deal__fee">${esc(terms)}</b></div>
    <p class="td-deal__meta">${esc(meta)}</p>${act}
  </li>`;
}

/** Propozycje twojego klubu (i oferty za twoich zawodników) czekające na odpowiedź oraz ostatnie odpowiedzi. */
export function proposalsSection(game) {
  const all = (game.market?.pending ?? []).filter((x) => (x.user && x.to === game.clubId) || (x.from && x.from === game.clubId));
  const open = all.filter((x) => x.status === 'open' || x.status === 'changes');
  const done = all.filter((x) => !(x.status === 'open' || x.status === 'changes')).slice(-6).reverse();
  if (!open.length && !done.length) return '';
  return `${open.length ? panel('Propozycje czekają na odpowiedź', open.some((x) => x.status === 'changes') ? 'bad' : 'warn', `<ul class="td-deals">${open.map((x) => propRow(game, x)).join('')}</ul>`, open.length) : ''}
    ${done.length ? panel('Ostatnie odpowiedzi zawodników', 'info', `<ul class="td-deals">${done.map((x) => propRow(game, x)).join('')}</ul>`) : ''}`;
}

/**
 * Panel karty zawodnika innego klubu albo wolnego: twoja propozycja w toku (wtedy bez nowych ofert) albo informacja,
 * że zawodnik rozważa oferty innych klubów (bez wyniku). Zwraca { html, blocked } albo null.
 */
export function proposalPanel(game, p) {
  const mine = userProposal(game, p.id);
  if (mine) return { blocked: true, html: `<ul class="td-deals">${propRow(game, mine)}</ul>` };
  const until = thinkingUntil(game, p.id);
  if (!until) return null;
  return { blocked: false, html: '<p class="notice">Zawodnik się zastanawia nad ofertami innych klubów. Możesz złożyć własną propozycję: zawodnik porówna wszystkie.</p>' };
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
    : d.deferred && d.stage === 'agreed' ? `Oczekuje na okno: transfer od ${fmtDate(d.deferred.regDate)}. Pieniądze na pierwszą ratę i miejsce w kadrze zarezerwowane, zawodnik gra jeszcze w ${clubName(d.from)}.` // porozumienie z datą rejestracji (clubOffers.js)
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
  const preList = (ps, dir) => ps.length ? `<ul class="tf-mini">${ps.map((p) => `<li data-pid="${esc(p.id)}"><button data-act="tf-open" data-id="${esc(p.id)}">${posBadge(p)}<span>${cardLink(p)}<em>${esc(dir === 'in' ? `z ${clubName(p.clubId)}` : `do ${preClubName(p.preContract)}`)}</em></span><small>od ${esc(fmtDate(p.preContract.start))}</small></button></li>`).join('')}</ul>` : '';
  const sad = squadOf(game.world, game.clubId).filter((p) => !p.moveWish && p.wishMemory?.mood === 'rozczarowany'); // zostaje, ale pamięta (wishMemory.js)
  const wishLabel = (W) => (W.promise && !W.promise.broken ? `czeka do okna (do ${fmtDate(W.promise.until)})` : W.stage === 'oficjalna' ? 'oficjalna prośba o transfer' : 'agent sygnalizuje chęć odejścia');
  const wishRows = wishes.map((p) => `<li data-pid="${esc(p.id)}"><button data-act="tf-open" data-id="${esc(p.id)}">${posBadge(p)}<span>${cardLink(p)}<em>${esc(wishLabel(p.moveWish))}</em></span><small data-k="${p.moveWish.stage === 'oficjalna' ? 'bad' : 'warn'}">od ${esc(fmtDate(p.moveWish.since))}</small></button></li>`).join('');
  const sadRows = sad.map((p) => `<li data-pid="${esc(p.id)}"><button data-act="tf-open" data-id="${esc(p.id)}">${posBadge(p)}<span>${cardLink(p)}<em>rozczarowany, ale zostaje</em></span><small data-k="warn">od ${esc(fmtDate(p.wishMemory.moodSince ?? game.date))}</small></button></li>`).join('');
  const wishList = wishes.length || sad.length ? `<ul class="tf-mini">${wishRows}${sadRows}</ul>${wishes.length ? '' : '<p class="tf-p__txt">Nikt nie prosi o transfer.</p>'}`
    : '<p class="tf-p__txt">Nikt nie prosi o transfer.</p>';
  // Wolni zawodnicy z umową poza oknem: dołączą w dniu otwarcia okna (src/career/lateJoins.js)
  const joins = (game.market.joins ?? []).filter((j) => j.to === game.clubId);
  const joinRows = joins.map((j) => { const p = game.world.players[j.pid]; return `<li data-pid="${esc(j.pid)}"><button data-act="tf-open" data-id="${esc(j.pid)}">${p ? posBadge(p) : ''}<span>${p ? cardLink(p) : esc(j.name)}<em>${esc(`wolny zawodnik, ${formatZl(j.contract?.wage ?? 0)} tygodniowo`)}</em></span><small>od ${esc(fmtDate(j.date))}</small></button></li>`; }).join('');
  const msg = ui.tfMsg ? `<p class="notice">${esc(ui.tfMsg)}</p>` : '';
  return `${msg}<div class="td-view">
      <div class="td-col">
        ${clubOffersSection(game)}
        ${proposalsSection(game)}
        ${joins.length ? panel('Dołączą w oknie transferowym', 'info', `<ul class="tf-mini">${joinRows}</ul><p class="tf-p__txt">Wolni po zamknięciu okna: do dnia dołączenia nie grają i nie dostają pensji, ale liczą się do limitu kadry.</p>`, joins.length) : ''}
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
  const props = d ? [] : proposalsFor(game, p.id);
  if (props.length) out.push(panel('Rozważa ofertę', 'warn', `<ul class="td-deals">${props.map((x) => propRow(game, x)).join('')}</ul>`));
  if (p.preContract) out.push(panel('Umowa od 1 lipca', 'bad', `<p class="tf-p__txt">${esc(p.name)} podpisał umowę z ${esc(preClubName(p.preContract))} od ${esc(fmtDate(p.preContract.start))}. Do tego dnia jest twoim zawodnikiem. Przedłużenie nie jest już możliwe.</p>`));
  const W = p.moveWish;
  const plan = wishStateText(p, game.date, fmtDate); // rozczarowany, spokojny, czeka do okna, podwyżka (wishMemory.js)
  if (!W && plan) out.push(panel('Plany zawodnika', p.wishMemory?.mood === 'rozczarowany' ? 'warn' : 'info', `<p class="tf-p__txt">${esc(plan)}.</p>`));
  if (W) {
    const official = W.stage === 'oficjalna';
    const waits = W.promise && !W.promise.broken; // stan „czeka”: obietnica zgody na transfer
    const txt = waits ? `${p.name} czeka na ofertę, na którą się zgodziłeś. Jeśli do końca okna nie przyjdzie, zostanie, ale będzie rozczarowany.`
      : official ? `${p.name} oficjalnie prosi o transfer (od ${fmtDate(W.official ?? W.since)}).` : `Agent daje znać, że ${p.name} chce odejść. Bez reakcji po 4 tygodniach prośba stanie się oficjalna.`;
    const extra = plan && (W.promise || W.raised || p.wishMemory?.lastRaise) ? `<p class="tf-p__txt">${esc(plan)}.</p>` : '';
    const reacted = W.reacted ? `<p class="tf-p__txt">Twoja reakcja: ${esc({ list: 'lista transferowa', promise: `obietnica zgody na ofertę od ${fmtZl(W.promise?.minFee ?? 0)}${W.promise?.broken ? ' (złamana)' : ''}`, refuse: 'odmowa', ignore: 'brak' }[W.reacted] ?? W.reacted)}.</p>` : '';
    const acts = ['list', 'promise', 'talk', 'raise', 'refuse'].filter((a) => !(a === 'list' && game.market.userListed[p.id]) && !(a === 'promise' && W.promise) && !(a === 'refuse' && W.reacted === 'refuse') && !(a === 'raise' && (p.renewRefused || p.loan)));
    out.push(panel('Prośba o transfer', official ? 'bad' : 'warn', `<p class="tf-p__txt">${esc(txt)}</p>${reacted}${extra}<div class="td-acts">${acts.map((a, i) => `<button class="btn ${i === 0 ? 'btn--primary' : 'btn--quiet'} btn--sm" data-act="tf-wish" data-id="${esc(p.id)}" data-a="${a}">${esc(WISH_ACTIONS[a])}</button>`).join('')}</div>`));
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
  if (p.joinOn) return { blocked: true, html: `<p class="${p.joinOn.clubId === game.clubId ? 'tf-p__txt' : 'notice'}">${esc(`${joinStatusText(game, p)}.${p.joinOn.clubId === game.clubId ? ' Do tego dnia nie gra i nie dostaje pensji.' : ' Nie rozmawia z innymi klubami.'}`)}</p>` }; // umowa wolnego poza oknem (lateJoins.js)
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
    case 'tf-prop-cancel': { const r = withdrawProposal(game, ds.d); return { ui: { tfMsg: r.text }, save: r.ok }; }
    case 'tf-prop-raise': { const r = improveUserProposal(game, ds.d, ds.k); return { ui: { tfMsg: r.text }, save: r.ok }; } // jedna poprawka w ciemno
    case 'tf-early': { const r = earlyBuy(game, ds.id); return { ui: { tfMsg: r.text }, save: r.ok }; }
    case 'tf-wish': {
      const r = reactToWish(game, ds.id, ds.a);
      return { ui: { tfMsg: r.text }, save: r.ok };
    }
    default: return null;
  }
}
