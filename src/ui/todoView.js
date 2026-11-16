// Widok „Do zrobienia w tym tygodniu” (zakładka Pulpit): panel „Ten tydzień” na Pulpicie i pełny widok listy.
// Dane: src/career/weeklyTodo.js (lista liczona na żądanie). Style: src/styles/todo.css. Fakty (poczta, terminy)
// mają żółtą kartkę i pełną krawędź, obserwacje sztabu przerywaną krawędź i podpis z pewnością (trzy kreski).
// Tydzień = poniedziałek-niedziela. Sprawa znika sama, gdy przestaje być aktualna (bez ręcznego „zrobione”).
import { esc, fmtDate, fmtDay, weekday } from './dom.js';
import { anyClub } from '../season/season.js';
import { addDays } from '../core/gameLoop.js';
import { PREC_WORD, PRIO_WORD, snoozeModes } from '../career/weeklyTodo.js';

const DOTS = { exact: 3, approx: 2, vague: 1 };
const DAY_SHORT = { poniedziałek: 'pon', wtorek: 'wt', środa: 'śr', czwartek: 'czw', piątek: 'pt', sobota: 'sob', niedziela: 'niedz' };
const short = (iso) => DAY_SHORT[weekday(iso)];
const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
const ROLE_SHORT = { kierownik: 'kierownik drużyny', asystent: 'asystent trenera', fizyczny: 'przygotowanie fizyczne' };
const LATE = {
  kierownik: 'Kierownik drużyny: wyleciało mi to z głowy, a termin goni.',
  asystent: 'Asystent: przepraszam, umknęło mi to wcześniej.',
  fizyczny: 'Trener przygotowania fizycznego: powinienem był to zgłosić wcześniej.',
};
const GO = {
  mail: 'Otwórz decyzję', talk: 'Porozmawiaj', meeting: 'Zwołaj zebranie', load: 'Ustaw trening', contract: 'Otwórz kontrakt', contracts: 'Kontrakty',
  window: 'Transfery', limit: 'Limit kadry', camp: 'Wybierz obóz', licence: 'Infrastruktura', wish: 'Karta zawodnika',
};
export const TODO_AREAS = [['talk', 'Rozmowy'], ['health', 'Zdrowie'], ['contract', 'Kontrakty'], ['transfer', 'Transfery'], ['train', 'Trening'], ['club', 'Klub'], ['mail', 'Poczta']];
const SNOOZE = { day: 'Przypomnij jutro', week: 'Przypomnij w poniedziałek', case: 'Nie przypominaj w tej sprawie' };

const dots = (prec) => `<span class="todo-dots" aria-hidden="true">${[1, 2, 3].map((i) => `<i${i <= DOTS[prec] ? ' class="on"' : ''}></i>`).join('')}</span>`;

/** Grupa terminu: po terminie, dziś, do niedzieli, później, bez terminu. */
export function dueGroup(it, res) {
  if (!it.due) return 'none';
  if (it.due < res.date) return 'over';
  if (it.due === res.date) return 'today';
  return it.due <= res.sunday ? 'week' : 'later';
}

function dueText(it, res) {
  const g = dueGroup(it, res);
  if (g === 'none') return 'bez terminu';
  if (g === 'over') return 'po terminie';
  if (g === 'today') return 'dziś';
  return g === 'later' ? `do ${fmtDate(it.due)}` : `do ${short(it.due)} ${fmtDay(it.due)}`;
}

const signerText = (it, signers) => {
  if (it.role) { const s = signers.find((x) => x.role === it.role); return `${s?.name ?? ''}, ${ROLE_SHORT[it.role] ?? ''}`; }
  return it.from ?? '';
};

/** Wiersze panelu „Ten tydzień” na Pulpicie (najwyżej 5, reszta pod przyciskiem „Więcej”). */
export const TODO_PANEL_MAX = 5;
export function todoPanelBody(res) {
  const items = res.items;
  if (!items.length) return '<p class="dash-note dash-note--ok">Na ten tydzień nic nie czeka. Sztab nie zgłosił żadnych spraw.</p>';
  const rows = items.slice(0, TODO_PANEL_MAX).map((it) => {
    const g = dueGroup(it, res);
    const who = it.role ? ROLE_SHORT[it.role] : it.type === 'mail' ? 'poczta' : (it.from ?? '').toLowerCase();
    return `<li><button class="dash-todo__row" data-act="todo-go" data-key="${esc(it.key)}" data-kind="${it.hard ? 'fact' : 'staff'}" data-due="${g}" data-prio="${it.prio}">
      ${it.hard ? '<span class="dash-decide__card" aria-hidden="true"></span>' : '<span class="dash-todo__bib" aria-hidden="true"></span>'}
      <span class="dash-todo__txt"><b>${esc(it.title)}</b><small>${it.prio === 'pilne' ? '<span class="dash-todo__pilne">pilne</span> ' : ''}${esc(dueText(it, res))}, ${esc(who)}</small></span>
    </button></li>`;
  }).join('');
  const rest = items.length - Math.min(items.length, TODO_PANEL_MAX);
  return `<ul class="dash-todo">${rows}</ul>${rest > 0 ? `<p class="dash-todo__more"><button class="btn btn--quiet btn--sm" data-act="todo">Więcej (jeszcze ${rest} ${plural(rest, 'sprawa', 'sprawy', 'spraw')})</button></p>` : ''}`;
}

function itemHtml(it, res) {
  const g = dueGroup(it, res);
  const kind = it.hard ? 'fact' : 'staff';
  const s = it.role ? res.signers.find((x) => x.role === it.role) : null;
  const sign = it.hard
    ? `<span class="todo-sign">${esc(signerText(it, res.signers))}${it.type === 'mail' ? ', wymaga decyzji' : ''}</span>`
    : `<span class="todo-sign" data-prec="${esc(it.prec)}"><span>${esc(signerText(it, res.signers))}</span><span class="todo-sign__p">pewność ${esc(PREC_WORD[it.prec])} ${dots(it.prec)}</span></span>`;
  const sr = it.hard ? (it.type === 'mail' ? 'Decyzja z poczty.' : 'Fakt z kalendarza klubu.') : `Zgłasza ${s?.name ?? ''}, ${ROLE_SHORT[it.role] ?? ''}, pewność ${PREC_WORD[it.prec]}.`;
  const modes = snoozeModes(it, res.date);
  const snooze = modes.length ? `<details class="todo-snooze"><summary class="btn btn--sm btn--quiet">Odłóż</summary><div class="todo-snooze__menu">${modes.map((m) => `<button class="btn btn--sm btn--quiet" data-act="todo-snooze" data-key="${esc(it.key)}" data-m="${m}">${esc(SNOOZE[m])}</button>`).join('')}</div></details>` : '';
  return `<li class="todo-item${it.late ? ' todo-item--late' : ''}" data-kind="${kind}" data-due="${g}" data-area="${esc(it.area)}" data-prio="${it.prio}">
    <div class="todo-item__main">
      <span class="sr">${esc(sr)}</span>
      ${it.late && LATE[it.role] ? `<p class="todo-item__late">${esc(LATE[it.role])}</p>` : ''}
      <p class="todo-item__title">${it.hard ? '<span class="todo-item__card" aria-hidden="true"></span>' : ''}${esc(it.title)}</p>
      ${it.why ? `<p class="todo-item__why">${esc(it.why)}</p>` : ''}
      <p class="todo-item__meta"><span class="todo-item__due">${esc(dueText(it, res))}</span><span class="todo-item__prio" data-prio="${it.prio}">${esc(PRIO_WORD[it.prio])}</span>${sign}</p>
    </div>
    <div class="todo-item__acts"><button class="btn btn--sm ${it.hard ? 'btn--primary' : ''} todo-item__go" data-act="todo-go" data-key="${esc(it.key)}">${esc(GO[it.type] ?? 'Otwórz')}</button>${snooze}</div>
  </li>`;
}

function weekStrip(res, items) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(res.week, i));
  const m = res.match && res.match.date <= res.sunday ? res.match : null;
  const opp = m ? anyClub(m.home === res.clubId ? m.away : m.home)?.name ?? '' : '';
  return `<ol class="todo-week" aria-label="Dni tygodnia">${days.map((d) => {
    const n = items.filter((it) => it.due && (it.due === d || (d === res.date && it.due < res.date))).length;
    const isMatch = m && m.date === d;
    const label = `${weekday(d)} ${fmtDay(d)}${d === res.date ? ', dziś' : ''}${isMatch ? `, mecz${opp ? ` z ${opp}` : ''}` : ''}, ${n} ${plural(n, 'sprawa', 'sprawy', 'spraw')}`;
    return `<li class="todo-week__day${d === res.date ? ' is-today' : ''}${isMatch ? ' is-match' : ''}${d < res.date ? ' is-past' : ''}" aria-label="${esc(label)}"${d === res.date ? ' aria-current="date"' : ''}>
      <span class="todo-week__wd" aria-hidden="true">${esc(short(d))}</span><b aria-hidden="true">${esc(d.slice(8, 10).replace(/^0/, ''))}</b>
      <span class="todo-week__dots" aria-hidden="true">${n > 3 ? '<i></i><i></i><small>+' + (n - 2) + '</small>' : '<i></i>'.repeat(n)}</span>
      ${isMatch ? `<small class="todo-week__opp" aria-hidden="true">${esc(opp || 'mecz')}</small>` : ''}
    </li>`;
  }).join('')}</ol>`;
}

/** Pełny widok listy. ui: { todoArea, todoMsg }. */
export function renderTodo(res, ui = {}) {
  const area = ui.todoArea ?? null;
  const all = res.items;
  const items = area ? all.filter((it) => it.area === area) : all;
  const head = `<p class="todo__back"><button class="btn btn--quiet btn--sm" data-act="todoback">Wróć do pulpitu</button></p>
    <header class="todo__head"><h2 id="todo-h" tabindex="-1">Do zrobienia w tym tygodniu</h2>
      <p class="todo__sum">${all.length} ${plural(all.length, 'sprawa', 'sprawy', 'spraw')}${res.counts.pilne ? `, ${res.counts.pilne} ${plural(res.counts.pilne, 'pilna', 'pilne', 'pilnych')}` : ''}. ${esc(short(res.week))} ${esc(fmtDay(res.week))} do ${esc(short(res.sunday))} ${esc(fmtDay(res.sunday))}. Listę przygotował sztab, decyzje pochodzą z poczty.</p></header>
    ${ui.todoMsg ? `<p class="notice" role="status">${esc(ui.todoMsg)}</p>` : ''}`;
  const areas = TODO_AREAS.filter(([k]) => all.some((it) => it.area === k));
  const chips = all.length ? `<div class="chips todo__chips"><button class="chip" data-act="todo-area" data-a="" aria-pressed="${!area}">Wszystkie <b>${all.length}</b></button>${areas.map(([k, v]) => `<button class="chip" data-act="todo-area" data-a="${k}" aria-pressed="${area === k}">${esc(v)} <b>${all.filter((it) => it.area === k).length}</b></button>`).join('')}</div>` : '';
  const m = res.match && res.match.date <= res.sunday ? res.match : null;
  const GROUPS = [
    ['over', 'Po terminie'],
    ['today', `Dziś, ${short(res.date)} ${fmtDay(res.date)}`],
    ['week', `Do niedzieli ${fmtDay(res.sunday)}${m && m.date > res.date ? `, mecz ${short(m.date)} ${fmtDay(m.date)}` : ''}`],
    ['none', 'Bez terminu, w wolnej chwili'],
    ['later', 'Później'],
  ];
  const groups = GROUPS.map(([k, label]) => {
    const list = items.filter((it) => dueGroup(it, res) === k);
    if (!list.length) return '';
    return `<section class="todo-group" data-due="${k}" aria-labelledby="todo-g-${k}"><h3 class="todo-group__head" id="todo-g-${k}">${k === 'over' ? '<span aria-hidden="true">! </span>' : ''}${esc(label)} <small>(${list.length})</small></h3>
      <ul class="todo-list">${list.map((it) => itemHtml(it, res)).join('')}</ul></section>`;
  }).join('');
  const empty = !all.length ? `<div class="todo-empty"><p class="todo-empty__t">Na ten tydzień nic nie czeka.</p><p>${res.signers.some((s) => s.prec === 'vague') ? 'Sztab nie zgłosił żadnych spraw, ale przy obecnym sztabie coś mogło umknąć. Zajrzyj do Rozmów i do poczty.' : 'Sztab nie zgłosił żadnych spraw. Możesz spokojnie przygotować drużynę do meczu.'}</p></div>` : !items.length ? '<p class="todo-empty">W tym obszarze nic nie czeka.</p>' : '';
  const done = res.done.length ? `<details class="todo-done"><summary>Załatwione w tym tygodniu (${res.done.length})</summary><ul class="todo-list todo-list--quiet">${res.done.map((d) => `<li class="todo-mini"><span class="todo-mini__ok" aria-hidden="true">✓</span><span>${esc(d.title)}</span><small>${d.over ? 'termin minął' : 'załatwione'}</small></li>`).join('')}</ul></details>` : '';
  const hidden = res.hidden.length ? `<details class="todo-later"><summary>Odłożone (${res.hidden.length})</summary><ul class="todo-list todo-list--quiet">${res.hidden.map((it) => `<li class="todo-mini"><span>${esc(it.title)}</span><small>${it.hide.mode === 'case' ? 'bez przypomnień w tej sprawie' : `wróci ${esc(short(it.hide.until))} ${esc(fmtDay(it.hide.until))}`}</small><button class="btn btn--sm btn--quiet" data-act="todo-unhide" data-key="${esc(it.key)}">Przywróć</button></li>`).join('')}</ul></details>` : '';
  const staff = `<aside class="todo-staff" aria-labelledby="todo-staff-h"><h3 id="todo-staff-h">Sztab w tym tygodniu</h3>
    <ul class="todo-staff__list">${res.signers.map((s) => `<li data-prec="${esc(s.prec)}"><b>${esc(s.name)}</b><span>${esc(s.title.toLowerCase())}</span><span class="todo-sign__p">pewność ${esc(PREC_WORD[s.prec])} ${dots(s.prec)}</span><small>${s.n ? `${s.n} ${plural(s.n, 'zgłoszona sprawa', 'zgłoszone sprawy', 'zgłoszonych spraw')}` : 'bez zgłoszeń'}</small></li>`).join('')}</ul>
    <p class="dash-note">Przy niskiej pewności sztab może o czymś zapomnieć, przypomnieć później albo źle ocenić, co jest pilne. Nie zgłasza spraw, których nie ma. Decyzje z poczty i terminy są zawsze na liście.</p>
    <button class="dash-link" data-act="trep-open">Raport ogólny</button></aside>`;
  return `<div class="todo">${head}${weekStrip(res, all)}${chips}
    <div class="todo__cols"><div class="todo__list">${empty}${groups}${done}${hidden}</div>${staff}</div></div>`;
}
