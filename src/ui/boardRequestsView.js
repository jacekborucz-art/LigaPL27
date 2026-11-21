// Prośby do zarządu (zakładka Klub > Zarząd, prawa kolumna): rodzaje próśb z kwotami, dostępność, warunki,
// weta z odwołaniem i historia odpowiedzi. Logika: src/career/boardRequests.js. Akcje z prefiksem „br-”.

import { esc, fmtDate, fmtDay } from './dom.js';
import { kpi, panel, meter } from './transfersView.js';
import {
  REQ, REQ_TYPES, VERDICT_LABELS, ensureRequests, requestStatus, amountPresets, askBoard, appealVeto, appealStatus,
  wageRatio, lowerGoal, zl, placeAt,
} from '../career/boardRequests.js';
import { clubById } from '../data/clubs_pl.js';
import { directorOf, listFreeStaff } from '../career/staffMarket.js'; // dyrektor sportowy (docs/dyrektor-sportowy.md)

const VERDICT_TONE = { yes: 'good', partial: 'info', cond: 'warn', no: 'bad' };
const shortDate = (iso) => fmtDay(iso);
const pctTxt = (x) => `${Math.round(x * 100)} %`;

function typeCard(game, type, c) {
  const st = requestStatus(game, type, game.date);
  const per = type === 'wage' ? ' tygodniowo' : '';
  let now;
  let help;
  if (type === 'transfer') { now = `Teraz: ${zl(c.transferBudget)}`; help = 'W oknie transferowym albo do 30 dni przed nim. Zgoda na ponad 20 % budżetu podnosi cel sezonu o jedno miejsce.'; }
  else if (type === 'wage') { now = `Teraz: ${zl(c.wageBudget)} tygodniowo`; help = 'Zarząd patrzy na wskaźnik płac: powyżej 80 % przychodów zgodzi się tylko bogaty właściciel, który dopłaci.'; }
  else if (type === 'shift') { now = `1 mln zł transferów = ${zl(1e6 / REQ.WAGE_WEEKS_PER_ZL)} tygodniowo w płacach`; help = 'Zgoda zawsze, gdy płace po przesunięciu zmieszczą się w 80 % przychodów.'; }
  else if (type === 'director') {
    const d = game.staff ? directorOf(game, game.clubId) : null;
    now = d ? `Teraz: ${d.name} (jakość ${d.q}), umowa do ${fmtDate(d.until)}` : 'Teraz: wakat, zarząd szuka dyrektora';
    help = 'Decyduje zarząd: zaufanie, wyniki, ocena obecnego dyrektora (słaby: łatwiej), staż, odprawa i charakter właściciela. Możesz wskazać kandydata z listy wolnych dyrektorów.';
  } else {
    const club = clubById(game.clubId);
    const lower = lowerGoal(club?.tier ?? 1, game.board.goal?.target ?? 15);
    now = `Teraz: ${game.board.goal?.text ?? ''}`;
    help = lower ? `Nowy cel: ${lower.text}. Raz w sezonie, przed 1 listopada.` : 'Niższego celu nie ma.';
  }
  const status = st.ok
    ? '<p class="br-st" data-ok="true">Możesz złożyć prośbę.</p>'
    : `<p class="br-st" data-ok="false">${esc(st.text)}${st.from && st.from > game.date ? ` Od ${esc(fmtDate(st.from))}.` : ''}</p>`;
  const dis = st.ok ? '' : ' disabled';
  let actions;
  if (type === 'goal') actions = `<div class="br-presets"><button class="btn btn--quiet btn--sm" data-act="br-ask" data-t="goal"${dis}>Poproś o niższy cel</button></div>`;
  else if (type === 'director') {
    const free = game.staff ? listFreeStaff(game, { role: 'dyrektor' }) : [];
    const q = (r) => (r.q.prec === 'exact' ? String(r.q.lo) : r.q.prec === 'approx' ? `${r.q.lo}-${r.q.hi}` : r.q.label.toLowerCase());
    actions = `<div class="br-custom"><label for="brDir">Kandydat (opcjonalnie)</label><select id="brDir"><option value="">Zarząd wybierze sam</option>${free.map((r) => `<option value="${esc(r.id)}">${esc(`${r.name}, jakość ${q(r)}, oczekuje ${zl(r.wage.mid)} / mies.`)}</option>`).join('')}</select>
      <button class="btn btn--quiet btn--sm" data-act="br-ask" data-t="director" data-custom="1"${dis}>Poproś o zmianę dyrektora</button></div>`;
  }
  else {
    const presets = amountPresets(game, type);
    const label = type === 'shift' ? 'Kwota z budżetu transferowego (zł)' : type === 'wage' ? 'Inna kwota (zł tygodniowo)' : 'Inna kwota (zł)';
    const step = type === 'wage' ? 100 : 10000;
    actions = `<div class="br-presets" role="group" aria-label="Kwota">${presets.map((x) => `<button class="btn btn--quiet btn--sm" data-act="br-ask" data-t="${type}" data-a="${x.amount}"${dis} title="${esc(`${zl(x.amount)}${per}`)}">+${Math.round(x.pct * 100)} %<small>${esc(zl(x.amount))}</small></button>`).join('')}</div>
      <div class="br-custom"><label for="brAmt-${type}">${esc(label)}</label><input id="brAmt-${type}" type="number" inputmode="numeric" min="0" step="${step}" value="${presets[0]?.amount ?? ''}">
      <button class="btn btn--quiet btn--sm" data-act="br-ask" data-t="${type}" data-custom="1"${dis}>Poproś</button></div>`;
  }
  return `<li class="br-type" data-t="${type}" data-ok="${st.ok}">
    <h4>${esc(REQ_TYPES[type].label)}</h4>
    <p class="br-now">${esc(now)}</p>
    ${status}
    ${actions}
    <p class="br-help">${esc(help)}</p>
  </li>`;
}

function condsPanel(R) {
  const open = R.conds.filter((x) => x.status === 'open');
  if (!open.length) return '';
  const rows = open.map((x) => `<li><span>${esc(`${REQ_TYPES[x.type].label}: ${zl(x.amount)}${x.type === 'wage' ? ' tygodniowo' : ''}`)}</span><small>${esc(`jeśli ${fmtDate(x.by)} drużyna będzie ${placeAt(x.top)}`)}</small></li>`).join('');
  return panel('Warunki zarządu', 'warn', `<ul class="br-list">${rows}</ul>`, { count: open.length, cls: 'br-conds' });
}

function vetoPanel(game, R) {
  const list = R.vetoes.slice(0, 5);
  if (!list.length) return '';
  const st = { open: 'Weto', approved: 'Odwołanie przyjęte', refused: 'Odwołanie odrzucone' };
  const rows = list.map((v) => {
    const a = v.status === 'open' ? appealStatus(game, v.playerId, game.date) : null;
    const btn = a?.ok ? `<button class="btn btn--quiet btn--sm" data-act="br-appeal" data-id="${esc(v.playerId)}">Odwołaj się</button>` : '';
    return `<li data-k="${esc(v.status)}"><time>${esc(shortDate(v.date))}</time><span><b>${esc(v.name)}</b> ${esc(st[v.status] ?? '')}<small>${esc(v.issues[0]?.text ?? '')}</small></span>${btn}</li>`;
  }).join('');
  return panel('Weta zarządu', 'bad', `<p class="tf-p__txt">Odwołanie: raz na zawodnika w oknie, najwyżej ${REQ.APPEALS_PER_SEASON} w sezonie. Zgoda kosztuje 3 punkty zaufania, odmowa 5.</p><ol class="br-log">${rows}</ol>`, { cls: 'br-vetoes' });
}

/** Sprzeciwy dyrektora sportowego wobec transakcji trenera i decyzje (docs/dyrektor-sportowy.md, rozdz. 9). */
function objectionsPanel(R) {
  const list = (R.dirLog ?? []).slice(0, 6);
  if (!list.length) return '';
  const what = (e) => (e.action === 'insist' ? [`Nalegałeś (zaufanie ${e.trust})`, 'bad']
    : e.action === 'back' ? ['Wycofałeś się', 'info']
      : e.result === 'ok' ? [`Renegocjacja: ${zl(e.fee)}`, 'good'] : e.result === 'quit' ? ['Renegocjacja: zerwane rozmowy', 'bad'] : ['Renegocjacja bez zmian', 'warn']);
  const rows = list.map((e) => {
    const [label, tone] = what(e);
    const gap = `${Math.round((e.gap ?? 0) * 100)} %`;
    const info = e.kind === 'buy' ? `Kupno za ${zl(e.asked)}, wycena dyrektora ${zl(e.ref)} (przepłata ${gap})` : `Sprzedaż za ${zl(e.asked)}, wycena dyrektora ${zl(e.ref)} (${gap} poniżej)`;
    return `<li data-k="${tone}"><time>${esc(shortDate(e.date))}</time><span><b>${esc(e.name)}</b><small>${esc(info)}</small></span><span class="tf-tag" data-k="${tone}">${esc(label)}</span></li>`;
  }).join('');
  return panel('Sprzeciwy dyrektora sportowego', 'warn', `<p class="tf-p__txt">Nalegasz wbrew dyrektorowi: zaufanie zarządu spada o 1, przy dużej różnicy o 2 lub 3.</p><ol class="br-log">${rows}</ol>`, { cls: 'br-dirobj' });
}

function historyPanel(R) {
  const rows = R.log.slice(0, 10).map((e) => `<li data-k="${e.verdict}"><time>${esc(shortDate(e.date))}</time><span><b>${esc(REQ_TYPES[e.type].label)}</b>${e.amount ? ` <small>${esc(`${zl(e.amount)}${e.type === 'wage' ? ' tygodniowo' : ''}`)}</small>` : ''}<small>${esc(e.text ?? '')}</small></span><span class="tf-tag" data-k="${VERDICT_TONE[e.verdict]}">${esc(VERDICT_LABELS[e.verdict])}</span></li>`).join('');
  return panel('Odpowiedzi zarządu', 'misc', rows ? `<ol class="br-log">${rows}</ol>` : '<p class="tf-p__txt">Nie było jeszcze próśb.</p>', { cls: 'br-hist' });
}

/** Panel „Prośby do zarządu” (HTML) pod oceną zarządu w zakładce Klub > Zarząd. */
export function boardRequestsPanel(game, ui = {}) {
  const c = game.finance?.clubs?.[game.clubId];
  if (!c || !game.board) return '';
  const R = ensureRequests(game);
  const month = game.date.slice(0, 7);
  const used = R.log.filter((x) => x.date.slice(0, 7) === month).length;
  const W = wageRatio(game, game.clubId);
  const WB = wageRatio(game, game.clubId, Math.max(c?.wageBudget ?? 0, 0)); // tak liczy zarząd przy prośbach o płace
  const wTone = W > REQ.W_MAX ? 'bad' : W > REQ.W_HIGH ? 'warn' : 'good';
  const season = Number(game.date.slice(5, 7)) >= 7 ? Number(game.date.slice(0, 4)) : Number(game.date.slice(0, 4)) - 1;
  const appeals = R.appeals.season === season ? R.appeals.count : 0;
  const kpis = `<div class="tf-kpis br-kpis">
    ${kpi('Prośby w tym miesiącu', `${used}<em>/${REQ.PER_MONTH}</em>`, 'najwyżej jedna w tygodniu', used >= REQ.PER_MONTH ? 'warn' : 'info')}
    ${kpi('Płace do przychodów', pctTxt(W), `przy pełnym budżecie płac ${pctTxt(WB)}, limit zarządu ${pctTxt(REQ.W_MAX)}`, wTone, meter(W * 100, wTone))}
    ${kpi('Odwołania od weta', `${appeals}<em>/${REQ.APPEALS_PER_SEASON}</em>`, 'w tym sezonie', appeals >= REQ.APPEALS_PER_SEASON ? 'warn' : 'info')}
  </div>`;
  const types = Object.keys(REQ_TYPES).map((t) => typeCard(game, t, c)).join('');
  const intro = '<p class="tf-p__txt">Zarząd decyduje po zaufaniu, miejscu w tabeli, saldzie, płacach i charakterze właściciela. Odpowiedź przychodzi listem do poczty.</p>';
  return `<aside class="klub-side br">
    ${panel('Prośby do zarządu', 'info', `${intro}${kpis}<ul class="br-types">${types}</ul>`, { cls: 'br-main' })}
    ${condsPanel(R)}
    ${vetoPanel(game, R)}
    ${objectionsPanel(R)}
    ${historyPanel(R)}
  </aside>`;
}

/** Akcje „br-”. root: element z polami formularza (null w testach: kwota z data-a). Zwraca { ui, save }. */
export function handleBoardAction(game, act, ds = {}, root = null) {
  if (act === 'br-ask') {
    const type = ds.t;
    if (type === 'director') {
      const candidate = root?.querySelector?.('#brDir')?.value || ds.cand || null;
      const r = askBoard(game, 'director', 0, game.date, { candidate });
      return { ui: { kMsg: r.text }, save: r.ok };
    }
    const field = ds.custom ? root?.querySelector?.(`#brAmt-${type}`)?.value : null;
    const amount = Number(String(field ?? ds.a ?? 0).replace(/\s/g, '').replace(',', '.')) || 0;
    const r = askBoard(game, type, amount, game.date);
    return { ui: { kMsg: r.text }, save: r.ok };
  }
  if (act === 'br-appeal') {
    const r = appealVeto(game, ds.id, game.date);
    return { ui: { kMsg: r.text, tfMsg: r.text }, save: r.ok };
  }
  return { ui: {} };
}
