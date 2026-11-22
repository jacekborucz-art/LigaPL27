// Zakładka Klub: Finanse, Sponsorzy, Infrastruktura, Zarząd, Kariera (rozbudowa finansów, docs/finanse.md).
// Każda podzakładka ma własny moduł widoku i własne akcje (prefiksy: k- zakładki, sp- sponsorzy, inf- infrastruktura,
// br- prośby do zarządu). Wygląd wspólny z Transferami (klasy tfx, tf-kpi, tf-p), prawa kolumna na PC: .klub-side.

import { esc } from './dom.js';
import { financeView, boardView } from './transfersView.js';
import { sponsorsView, handleSponsorAction } from './sponsorsView.js';
import { infraView, handleInfraAction } from './infraView.js';
import { boardRequestsPanel, boardPeoplePanel, handleBoardAction } from './boardRequestsView.js';
import { renderCareer as careerPanel } from './careerView.js'; // Kariera: panel trenera, gablota, rynek pracy

export const KLUB_TABS = [['finanse', 'Finanse'], ['sponsorzy', 'Sponsorzy'], ['infrastruktura', 'Infrastruktura'], ['zarzad', 'Zarząd'], ['kariera', 'Kariera']];

export function renderClubHub(game, ui = {}) {
  const tab = KLUB_TABS.some(([k]) => k === ui.kTab) ? ui.kTab : 'finanse';
  const tabs = `<div class="subtabs subtabs--5" role="tablist">${KLUB_TABS.map(([k, l]) => `<button role="tab" data-act="k-tab" data-t="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>`;
  let body;
  if (tab === 'sponsorzy') body = sponsorsView(game, ui);
  else if (tab === 'infrastruktura') body = infraView(game, ui);
  else if (tab === 'zarzad') body = `<div class="klub-cols"><div class="klub-main">${boardView(game, { extra: boardPeoplePanel(game) })}</div>${boardRequestsPanel(game, ui)}</div>`;
  else if (tab === 'kariera') body = careerPanel(game, ui);
  else body = financeView(game);
  const msg = ui.kMsg ? `<p class="tf-msg" role="status">${esc(ui.kMsg)}</p>` : '';
  return `<div class="tfx klub" data-tab="${esc(tab)}"><div class="tfx__head"><h2>Klub</h2></div>${tabs}${msg}${body}</div>`;
}

const PREFIXES = ['k-', 'sp-', 'inf-', 'br-'];
export const isClubAction = (act) => PREFIXES.some((p) => String(act).startsWith(p));

/** Obsługa akcji zakładki Klub. Zwraca { ui, save }. */
export function handleClubAction(game, act, ds = {}, root = null) {
  if (act === 'k-tab') return { ui: { kTab: ds.t, kMsg: null, crResign: false } };
  // Kariera: stan widoku (wybrana odznaka, filtr, potwierdzenie rezygnacji); sama praca (job-*) jest w app.js
  if (act === 'k-badge') return { ui: { crSel: ds.id, crFresh: null } };
  if (act === 'k-bfilter') return { ui: { crFilter: ds.f === 'won' ? 'won' : 'all' } };
  if (act === 'k-resign-ask') return { ui: { crResign: true } };
  if (act === 'k-resign-no') return { ui: { crResign: false } };
  if (act.startsWith('sp-')) return handleSponsorAction(game, act, ds, root);
  if (act.startsWith('inf-')) return handleInfraAction(game, act, ds, root);
  if (act.startsWith('br-')) return handleBoardAction(game, act, ds, root);
  return { ui: {} };
}
