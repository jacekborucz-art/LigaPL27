// Zakładka Klub: Finanse, Sponsorzy, Infrastruktura, Zarząd (rozbudowa finansów, docs/finanse.md).
// Każda podzakładka ma własny moduł widoku i własne akcje (prefiksy: k- zakładki, sp- sponsorzy, inf- infrastruktura,
// br- prośby do zarządu). Wygląd wspólny z Transferami (klasy tfx, tf-kpi, tf-p), prawa kolumna na PC: .klub-side.

import { esc } from './dom.js';
import { financeView, boardView } from './transfersView.js';
import { sponsorsView, handleSponsorAction } from './sponsorsView.js';
import { infraView, handleInfraAction } from './infraView.js';
import { boardRequestsPanel, handleBoardAction } from './boardRequestsView.js';

export const KLUB_TABS = [['finanse', 'Finanse'], ['sponsorzy', 'Sponsorzy'], ['infrastruktura', 'Infrastruktura'], ['zarzad', 'Zarząd']];

export function renderClubHub(game, ui = {}) {
  const tab = KLUB_TABS.some(([k]) => k === ui.kTab) ? ui.kTab : 'finanse';
  const tabs = `<div class="subtabs" role="tablist">${KLUB_TABS.map(([k, l]) => `<button role="tab" data-act="k-tab" data-t="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>`;
  let body;
  if (tab === 'sponsorzy') body = sponsorsView(game, ui);
  else if (tab === 'infrastruktura') body = infraView(game, ui);
  else if (tab === 'zarzad') body = `<div class="klub-cols"><div class="klub-main">${boardView(game)}</div>${boardRequestsPanel(game, ui)}</div>`;
  else body = financeView(game);
  const msg = ui.kMsg ? `<p class="tf-msg" role="status">${esc(ui.kMsg)}</p>` : '';
  return `<div class="tfx klub" data-tab="${esc(tab)}"><div class="tfx__head"><h2>Klub</h2></div>${tabs}${msg}${body}</div>`;
}

const PREFIXES = ['k-', 'sp-', 'inf-', 'br-'];
export const isClubAction = (act) => PREFIXES.some((p) => String(act).startsWith(p));

/** Obsługa akcji zakładki Klub. Zwraca { ui, save }. */
export function handleClubAction(game, act, ds = {}, root = null) {
  if (act === 'k-tab') return { ui: { kTab: ds.t, kMsg: null } };
  if (act.startsWith('sp-')) return handleSponsorAction(game, act, ds, root);
  if (act.startsWith('inf-')) return handleInfraAction(game, act, ds, root);
  if (act.startsWith('br-')) return handleBoardAction(game, act, ds, root);
  return { ui: {} };
}
