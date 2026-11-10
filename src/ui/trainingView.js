// Ekran „Trening”: plan tygodnia (kalendarz dni z rolą względem meczu), edycja dnia (rodzaj zajęć i intensywność),
// trening indywidualny (akcent, nowa pozycja, programy, tryb obciążenia), obciążenia (ACWR), sztab i raport rozwoju.
// renderTraining(game, ui) zwraca HTML; handleTrainingAction(game, act, dataset) obsługuje kliknięcia
// (data-act z prefiksem „tr-”) i zwraca { ui: zmiany stanu ekranu, save: czy zapisać grę }.

import { ATTRS, ATTR_GROUPS, POS_NAMES } from '../data/attributes.js';
import { GROUP } from '../career/squad.js';
import { anyClub } from '../season/season.js';
import { proficiency, POSITIONS } from '../engine/positions.js';
import { addDays } from '../core/gameLoop.js';
import { esc, fmtDate, weekday } from './dom.js';
import {
  ensureTraining, attachTraining, weekPlan, setSession, removeSession, setRestDay, resetDay, resetWeek,
  teamCohesion, sessionPreview, loadSummary, acwrLabel, staffOf, staffLabel, PHASES, ROLE_LABELS, dayContext,
} from '../training/index.js';
import { SESSIONS, INTENSITY, INT_ORDER, ACCENTS, LOAD_LEVELS, STAFF_ROLES, PROGRAMS, MODES, staffMul, COH } from '../training/config.js';
import { mondayOf, ageAt } from '../training/state.js';
import { squadOf, academyOf } from '../world/worldGen.js';
import { reportPrecision } from '../training/staff.js';
import { legsTerm, overloadTerm } from '../training/load.js';

const WD = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const TABS = [['tydzien', 'Tydzień'], ['zawodnicy', 'Zawodnicy'], ['obciazenia', 'Obciążenia'], ['sztab', 'Sztab'], ['rozwoj', 'Rozwój']];
const POS_ORDER = ['BR', 'ŚO', 'BO', 'WB', 'DP', 'ŚP', 'OP', 'SP', 'SN', 'NAP'];
const shortDate = (iso) => fmtDate(iso).replace(/, \d{4}$/, '');
const num = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const signed = (v, d = 1) => `${v > 0 ? '+' : ''}${num(v, d)}`;
const sortSquad = (list) => [...list].sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || b.ovr - a.ovr);

export const isTrainingAction = (act) => typeof act === 'string' && act.startsWith('tr-');

function meter(value, max = 100, tone = '') {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `<span class="tr-meter" ${tone ? `data-tone="${tone}"` : ''} aria-hidden="true"><i style="width:${pct.toFixed(0)}%"></i></span>`;
}

function intDot(int) {
  return `<span class="tr-int" data-int="${esc(int)}" title="Intensywność: ${esc(INTENSITY[int]?.name ?? '')}">${esc(INTENSITY[int]?.short ?? '')}</span>`;
}

// ------------------------------------------------------------ Nagłówek
function header(game, week) {
  const coh = teamCohesion(game);
  const squad = squadOf(game.world, game.clubId);
  const fit = squad.filter((p) => !(p.injuryDays > 0));
  const avgFresh = fit.length ? Math.round(fit.reduce((s, p) => s + (p.fresh ?? 95), 0) / fit.length) : 0;
  const avgAcwr = fit.length ? fit.reduce((s, p) => s + (p.training?.acwr ?? 1), 0) / fit.length : 1;
  const injured = squad.length - fit.length;
  const today = dayContext(game, game.date);
  const nextFix = (game.fixtures || []).filter((f) => !f.played && f.date >= game.date && (f.home === game.clubId || f.away === game.clubId)).sort((a, b) => a.date.localeCompare(b.date))[0];
  const opp = nextFix && anyClub(nextFix.home === game.clubId ? nextFix.away : nextFix.home);
  const lbl = acwrLabel(avgAcwr);
  return `
  <div class="tr-head">
    <div class="tr-stat"><span class="muted">Okres</span><b>${esc(PHASES[today.phase])}</b><small>${esc(ROLE_LABELS[today.role] ?? '')}</small></div>
    <div class="tr-stat"><span class="muted">Zgranie</span><b>${num(coh.z, 0)}</b>${meter(coh.z, 100, coh.z >= 72 ? 'ok' : coh.z >= 58 ? 'mid' : 'bad')}<small>${esc(coh.label)}, ${signed(coh.term ?? 0, 2)} pkt</small></div>
    <div class="tr-stat"><span class="muted">Świeżość</span><b>${avgFresh} %</b>${meter(avgFresh, 100, avgFresh >= 85 ? 'ok' : avgFresh >= 70 ? 'mid' : 'bad')}<small>${injured ? `kontuzjowani: ${injured}` : 'bez kontuzji'}</small></div>
    <div class="tr-stat"><span class="muted">Obciążenie (ACWR)</span><b>${num(avgAcwr, 2)}</b><small data-acwr="${lbl.id}">${esc(lbl.text)}</small></div>
    <div class="tr-stat tr-stat--wide"><span class="muted">Następny mecz</span><b>${nextFix ? esc(opp?.name ?? 'Rywal z losowania') : 'Brak'}</b><small>${nextFix ? `${esc(weekday(nextFix.date))}, ${esc(fmtDate(nextFix.date))}` : ''}</small></div>
  </div>`;
}

// ------------------------------------------------------------ Tydzień
function dayCard(d, game, sel) {
  const label = `${weekday(d.date)}, ${fmtDate(d.date)}`;
  let body;
  if (d.kind === 'match') {
    const f = d.match;
    const opp = f && anyClub(f.home === game.clubId ? f.away : f.home);
    body = `<span class="tr-day__match">Mecz</span><small>${esc(opp?.short ?? opp?.name ?? 'rywal z losowania')}${f ? `, ${f.home === game.clubId ? 'dom' : 'wyjazd'}` : ''}</small>`;
  } else if (d.kind === 'rest' || d.kind === 'off') {
    body = `<span class="tr-day__rest">${d.kind === 'off' ? 'Urlop' : 'Wolne'}</span>`;
  } else {
    body = d.sessions.map((x) => `<span class="tr-sess" data-g="${esc(SESSIONS[x.type].group)}">${intDot(x.int)}${esc(SESSIONS[x.type].name)}</span>`).join('');
  }
  const injuries = d.hist?.inj?.length ? `<small class="tr-day__inj">urazy: ${d.hist.inj.length}</small>` : '';
  return `<button class="tr-day" data-act="tr-day" data-date="${esc(d.date)}" aria-pressed="${sel === d.date}" aria-label="${esc(label)}"
    ${d.past ? 'data-past="1"' : ''} ${d.today ? 'data-today="1"' : ''} data-kind="${esc(d.kind)}">
    <span class="tr-day__top"><b>${WD[(new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7]}</b><small>${esc(shortDate(d.date))}</small></span>
    <span class="tr-role">${esc(d.role === 'OBOZ' ? 'Obóz' : d.role === 'URLOP' ? 'Urlop' : d.role)}</span>
    <span class="tr-day__body">${body}</span>
    ${!d.auto ? '<small class="tr-day__own">Twój plan</small>' : ''}${injuries}
  </button>`;
}

function previewRows(game, sessions) {
  if (!sessions.length) return '<p class="muted">Dzień bez zajęć: pełna regeneracja, morale +0,15.</p>';
  const tot = { fresh: 0, load: 0, injury: 0, dev: 0, sharp: 0, legs: 0, morale: 0, fam: 0, instr: 0, sp: 0, prep: 0 };
  for (const x of sessions) {
    const pv = sessionPreview(game, x.type, x.int);
    for (const k of Object.keys(tot)) tot[k] += k === 'prep' ? Math.max(0, pv[k] - tot[k]) : pv[k];
  }
  const rows = [
    ['Świeżość', `${signed(tot.fresh)} pkt`], ['Obciążenie', `${Math.round(tot.load)} AU`], ['Ryzyko urazu', `${num(tot.injury, 2)} % na zawodnika`],
    ['Bodziec rozwoju', num(tot.dev)], ['Ostrość', `${signed(tot.sharp)} (do 85)`], ['Ciężkie nogi', tot.legs ? `+${num(tot.legs, 2)}` : 'brak'],
    ['Morale', signed(tot.morale, 2)],
  ];
  if (tot.fam) rows.push(['Zgranie formacji', `+${num(tot.fam)}`]);
  if (tot.instr) rows.push(['Znajomość instrukcji', `+${num(tot.instr)}`]);
  if (tot.sp) rows.push(['Stałe fragmenty', `+${num(tot.sp)}`]);
  if (tot.prep) rows.push(['Analiza rywala', `+${num(tot.prep, 3)} pkt na najbliższy mecz`]);
  return `<dl class="tr-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function dayEditor(game, d) {
  const title = `${weekday(d.date)}, ${fmtDate(d.date)}`;
  const roleText = ROLE_LABELS[d.role] ?? '';
  if (d.kind === 'match') {
    return `<section class="panel tr-editor"><h3>${esc(title)}</h3><p class="muted">${esc(roleText)}. W dniu meczu nie ma treningu.</p></section>`;
  }
  if (!d.editable) {
    const h = d.hist;
    const text = h ? `${h.s.length ? h.s.map((x) => `${SESSIONS[x.type].name} (${INTENSITY[x.int].name.toLowerCase()})`).join(', ') : 'bez zajęć'}. Średnia świeżość ${h.fresh ?? '?'} %, ACWR ${h.acwr != null ? num(h.acwr, 2) : '?'}.${h.inj.length ? ` Urazy: ${h.inj.join(', ')}.` : ''}` : 'Plan tego dnia jest już zrealizowany.';
    return `<section class="panel tr-editor"><h3>${esc(title)}</h3><p class="muted">${esc(roleText)}</p><p>${esc(text)}</p></section>`;
  }
  const warn = [];
  if (d.ctx.b === 1 && d.sessions.some((x) => x.int === 'high')) warn.push('Ciężki trening dzień przed meczem: ciężkie nogi w meczu (do -0,2 pkt na zawodnika) i mniejsza świeżość.');
  if (d.ctx.b === 2 && d.sessions.some((x) => x.int === 'high' && SESSIONS[x.type].legs >= 0.7)) warn.push('Mocne zajęcia fizyczne dwa dni przed meczem zostawiają zmęczenie w nogach.');
  if (d.ctx.a === 1 && d.sessions.some((x) => x.int !== 'low' && !SESSIONS[x.type].noIntensity)) warn.push('Dzień po meczu organizm potrzebuje regeneracji: wyższe ryzyko urazu i wolniejszy powrót świeżości.');
  const slots = d.sessions.map((x, i) => {
    const types = Object.entries(SESSIONS).map(([id, s]) => `<button data-act="tr-type" data-date="${esc(d.date)}" data-slot="${i}" data-type="${esc(id)}" aria-pressed="${x.type === id}">${esc(s.name)}</button>`).join('');
    const ints = SESSIONS[x.type].noIntensity ? '<p class="muted">Ten rodzaj zajęć nie ma intensywności.</p>'
      : `<div class="seg2 tr-ints">${INT_ORDER.map((k) => `<button data-act="tr-int" data-date="${esc(d.date)}" data-slot="${i}" data-int="${k}" aria-pressed="${x.int === k}">${esc(INTENSITY[k].name)}</button>`).join('')}</div>`;
    return `<fieldset class="tr-slot"><legend>${i === 0 ? 'Zajęcia główne' : `Dodatkowe zajęcia ${i}`}${i > 0 ? ` <button class="btn btn--quiet tr-mini" data-act="tr-del" data-date="${esc(d.date)}" data-slot="${i}">Usuń</button>` : ''}</legend>
      <p class="muted">${esc(SESSIONS[x.type].text)}</p>
      <div class="tr-types">${types}</div>${ints}</fieldset>`;
  }).join('');
  return `<section class="panel tr-editor" aria-label="Edycja dnia">
    <div class="tr-editor__head"><h3>${esc(title)}</h3><button class="btn btn--quiet tr-mini" data-act="tr-close">Zamknij</button></div>
    <p class="muted">${esc(roleText)}${d.auto ? ', plan asystenta' : ', Twój plan'}</p>
    ${warn.map((w) => `<p class="notice">${esc(w)}</p>`).join('')}
    ${slots || '<p>Dzień wolny.</p>'}
    <div class="tr-actions">
      ${d.sessions.length < 3 ? `<button class="btn btn--quiet" data-act="tr-add" data-date="${esc(d.date)}">${d.sessions.length ? 'Dodaj kolejne zajęcia' : 'Dodaj zajęcia'}</button>` : ''}
      ${d.sessions.length ? `<button class="btn btn--quiet" data-act="tr-rest" data-date="${esc(d.date)}">Dzień wolny</button>` : ''}
      ${!d.auto ? `<button class="btn btn--quiet" data-act="tr-reset" data-date="${esc(d.date)}">Przywróć plan asystenta</button>` : ''}
    </div>
    <h4>Skutki dnia</h4>${previewRows(game, d.sessions)}
  </section>`;
}

function catalogTable(game) {
  const rows = Object.entries(SESSIONS).map(([id, s]) => {
    const pv = sessionPreview(game, id, 'mid');
    const extra = [pv.fam && `zgranie +${num(pv.fam)}`, pv.instr && `instrukcje +${num(pv.instr)}`, pv.sp && `stałe fr. +${num(pv.sp)}`, pv.prep && `rywal +${num(pv.prep, 3)} pkt`].filter(Boolean).join(', ');
    return `<tr><th scope="row">${esc(s.name)}</th><td>${signed(pv.fresh)}</td><td>${pv.load}</td><td>${num(pv.injury, 2)}</td><td>${num(pv.dev)}</td><td>${signed(pv.sharp)}</td><td>${esc(s.attrs.join(', ') || 'brak')}${extra ? `; ${esc(extra)}` : ''}</td></tr>`;
  }).join('');
  return `<details class="tr-details"><summary>Tabela zajęć (średnia intensywność)</summary>
    <div class="tr-scroll"><table class="tr-table"><thead><tr><th>Zajęcia</th><th>Świeżość</th><th>AU</th><th>Uraz %</th><th>Rozwój</th><th>Ostrość</th><th>Rozwija i daje</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted">Niska intensywność: rozwój x0,7, zmęczenie 5, ryzyko urazu x0,6. Wysoka: rozwój x1,3, zmęczenie 18, ryzyko urazu x2. Bramkarze w dni treningu fizycznego i technicznego trenują osobno z trenerem bramkarzy.</p>
  </details>`;
}

function weekTab(game, ui) {
  const off = Number(ui.trWeek ?? 0);
  const monday = addDays(mondayOf(game.date), off * 7);
  const week = weekPlan(game, monday);
  const sel = ui.trDay && week.find((d) => d.date === ui.trDay);
  const T = game.training;
  const accents = Object.entries(ACCENTS).map(([k, a]) => `<button class="chip" data-act="tr-accent" data-v="${k}" aria-pressed="${T.settings.accent === k}">${esc(a.name)}</button>`).join('');
  const loads = Object.entries(LOAD_LEVELS).map(([k, l]) => `<button class="chip" data-act="tr-load" data-v="${k}" aria-pressed="${T.settings.load === k}">${esc(l.name)}</button>`).join('');
  const own = week.some((d) => !d.auto && d.editable);
  return `
    <div class="tr-weeknav">
      <button class="btn btn--quiet" data-act="tr-week" data-w="${off - 1}" aria-label="Poprzedni tydzień">&lsaquo;</button>
      <span>od ${esc(fmtDate(monday))} do ${esc(fmtDate(addDays(monday, 6)))}</span>
      ${off ? '<button class="btn btn--quiet" data-act="tr-week" data-w="0">Ten tydzień</button>' : ''}
      <button class="btn btn--quiet" data-act="tr-week" data-w="${off + 1}" aria-label="Następny tydzień">&rsaquo;</button>
    </div>
    <div class="tr-week">${week.map((d) => dayCard(d, game, ui.trDay)).join('')}</div>
    ${sel ? dayEditor(game, sel) : '<p class="muted tr-hint">Dotknij dnia, żeby zobaczyć skutki albo zmienić zajęcia.</p>'}
    <section class="panel">
      <h3>Plan asystenta</h3>
      <p class="muted">Akcent tygodnia</p><div class="chips">${accents}</div>
      <p class="muted">Poziom obciążeń</p><div class="chips">${loads}</div>
      <p class="muted">Asystent układa mikrocykl od terminarza: dzień po meczu regeneracja, 4 i 3 dni przed meczem najcięższe zajęcia, dzień przed meczem rozruch i analiza rywala. Przy dwóch meczach w tygodniu zostaje tylko regeneracja, taktyka i rozruch.</p>
      ${own ? `<button class="btn btn--quiet" data-act="tr-resetweek" data-date="${esc(monday)}">Przywróć cały tydzień asystenta</button>` : ''}
    </section>
    ${catalogTable(game)}`;
}

// ------------------------------------------------------------ Zawodnicy (trening indywidualny)
function focusName(f) {
  if (!f) return 'Brak';
  return ATTR_GROUPS[f] ?? ATTRS[f]?.name ?? f;
}

function playerRow(p, game) {
  const t = p.training ?? {};
  const lbl = acwrLabel(t.acwr ?? 1);
  const extra = [t.focus && `akcent: ${focusName(t.focus)}`, t.pos && `nauka: ${t.pos} ${Math.round(Math.max(proficiency({ ...p, alt: {} }, t.pos), p.alt?.[t.pos] ?? 0))} %`,
    t.prog && PROGRAMS[t.prog]?.name, t.rtp > 0 && `powrót: ${t.rtp} dni`, t.mode && t.mode !== 'normal' && MODES[t.mode].name].filter(Boolean).join(', ');
  return `<button class="tr-prow" data-act="tr-player" data-id="${esc(p.id)}">
    <span class="pos" data-g="${GROUP[p.pos]}">${esc(p.pos)}</span>
    <span class="tr-prow__name"><b>${esc(p.name)}</b><small>${ageAt(p, game.date)} lat, OVR ${num(p.ovr)}${extra ? `, ${esc(extra)}` : ''}</small></span>
    <span class="tr-prow__fresh">${p.injuryDays > 0 ? `<span class="tr-badge" data-acwr="bad">uraz ${p.injuryDays} d</span>` : `${meter(p.fresh ?? 95, 100, (p.fresh ?? 95) >= 85 ? 'ok' : (p.fresh ?? 95) >= 70 ? 'mid' : 'bad')}<small>${p.fresh ?? 95} %</small>`}</span>
    <span class="tr-badge" data-acwr="${lbl.id}" title="${esc(lbl.text)}">${num(t.acwr ?? 1, 2)}</span>
  </button>`;
}

function playerEditor(game, p) {
  const t = p.training;
  const age = ageAt(p, game.date);
  const sum = loadSummary(t);
  const gk = p.pos === 'BR';
  const groups = Object.entries(ATTR_GROUPS).filter(([k]) => (gk ? true : k !== 'gk'));
  const focusChips = [['', 'Brak'], ...groups].map(([k, v]) => `<button class="chip" data-act="tr-focus" data-id="${esc(p.id)}" data-v="${k}" aria-pressed="${(t.focus ?? '') === k}">${esc(v)}</button>`).join('');
  const attrBtns = Object.keys(ATTRS).filter((a) => gk || ATTRS[a].group !== 'gk').map((a) => `<button data-act="tr-focus" data-id="${esc(p.id)}" data-v="${a}" aria-pressed="${t.focus === a}" title="${esc(ATTRS[a].name)}">${a} <b>${p.attr[a]}</b></button>`).join('');
  const posBtns = gk ? '<p class="muted">Bramkarz nie uczy się gry w polu.</p>' : `<div class="tr-posgrid">${POSITIONS.filter((x) => x !== 'BR' && x !== p.pos).map((x) => {
    const prof = Math.round(proficiency(p, x));
    return `<button data-act="tr-pos" data-id="${esc(p.id)}" data-v="${x}" aria-pressed="${t.pos === x}" ${prof >= 90 ? 'disabled' : ''}><b>${x}</b><small>${prof} %</small></button>`;
  }).join('')}<button data-act="tr-pos" data-id="${esc(p.id)}" data-v="" aria-pressed="${!t.pos}"><b>Brak</b><small>nauki</small></button></div>`;
  const progs = Object.entries(PROGRAMS).filter(([k, v]) => !v.maxAge || age <= v.maxAge).map(([k, v]) => `<button class="chip" data-act="tr-prog" data-id="${esc(p.id)}" data-v="${k}" aria-pressed="${t.prog === k}" title="${esc(v.text)}">${esc(v.name)}</button>`).join('');
  const modes = Object.entries(MODES).map(([k, m]) => `<button data-act="tr-mode" data-id="${esc(p.id)}" data-v="${k}" aria-pressed="${(t.mode ?? 'normal') === k}">${esc(m.name)}</button>`).join('');
  const hist = (t.ovrHist ?? []).map((v) => num(v)).join(', ');
  const term = legsTerm(t) + overloadTerm(t);
  const lbl = acwrLabel(sum.acwr);
  return `<section class="panel tr-editor">
    <div class="tr-editor__head"><h3>${esc(p.name)}</h3><button class="btn btn--quiet tr-mini" data-act="tr-pback">Wróć do listy</button></div>
    <p class="muted">${esc(POS_NAMES[p.pos])}, ${age} lat, OVR ${num(p.ovr)}</p>
    <dl class="tr-dl">
      <div><dt>Świeżość</dt><dd>${p.fresh ?? 95} %</dd></div><div><dt>Ostrość</dt><dd>${Math.round(p.sharp ?? 70)} %</dd></div>
      <div><dt>Obciążenie 7 dni</dt><dd>${sum.acute} AU</dd></div><div><dt>Średnio na tydzień (28 dni)</dt><dd>${sum.chronic} AU</dd></div>
      <div><dt>ACWR</dt><dd data-acwr="${lbl.id}">${num(sum.acwr, 2)}, ${esc(lbl.text.toLowerCase())}</dd></div>
      <div><dt>Ciężkie nogi</dt><dd>${num(t.legs ?? 0, 2)}${term ? ` (${signed(term, 2)} pkt)` : ''}</dd></div>
      <div><dt>Znajomość systemu</dt><dd>${Math.round(t.know ?? COH.knowNew)} / 100</dd></div><div><dt>Rytm meczowy</dt><dd>${Math.round(100 * (t.rh ?? 0))} / 100</dd></div>
      ${hist ? `<div class="tr-dl__wide"><dt>OVR co miesiąc</dt><dd>${esc(hist)}</dd></div>` : ''}
    </dl>
    <h4>Tryb treningu</h4><div class="seg2">${modes}</div>
    <h4>Akcent indywidualny</h4>
    <p class="muted">Dodatkowe 20 minut po zajęciach: bodziec +0,4 na wybrane atrybuty w każdym dniu treningu, świeżość -2. Akcent poza profilem pozycji wolniej podnosi OVR.</p>
    <div class="chips">${focusChips}</div><div class="tr-attrs">${attrBtns}</div>
    <h4>Nowa pozycja</h4><p class="muted">Biegłość rośnie ok. 1-2 punkty na tydzień (szybciej przy treningu taktycznym i lepszym asystencie), najwyżej do 90.</p>${posBtns}
    <h4>Programy</h4><div class="chips">${progs}<button class="chip" data-act="tr-prog" data-id="${esc(p.id)}" data-v="" aria-pressed="${!t.prog}">Bez programu</button></div>
    ${t.prog ? `<p class="muted">${esc(PROGRAMS[t.prog].text)}</p>` : ''}
  </section>`;
}

function playersTab(game, ui) {
  const squad = sortSquad(squadOf(game.world, game.clubId));
  const p = ui.trPlayer && game.world.players[ui.trPlayer];
  if (p && p.training) return playerEditor(game, p);
  const academy = sortSquad(academyOf(game.world, game.clubId));
  return `<p class="muted">Dotknij zawodnika, żeby ustawić akcent, naukę pozycji, program albo lżejszy trening.</p>
    <div class="tr-plist">${squad.map((x) => playerRow(x, game)).join('')}</div>
    <h3>Akademia</h3><p class="muted">Juniorzy trenują z trenerem młodzieży według planu akademii. Akcent indywidualny działa także u nich.</p>
    <div class="tr-plist">${academy.map((x) => playerRow(x, game)).join('') || '<p class="muted">Brak juniorów.</p>'}</div>`;
}

// ------------------------------------------------------------ Obciążenia
function loadTab(game) {
  const squad = sortSquad(squadOf(game.world, game.clubId));
  const rows = squad.map((p) => {
    const t = p.training ?? {};
    const sum = loadSummary(t);
    const lbl = acwrLabel(sum.acwr);
    return `<tr><th scope="row"><span class="pos" data-g="${GROUP[p.pos]}">${esc(p.pos)}</span> ${esc(p.last ?? p.name)}</th>
      <td>${sum.acute}</td><td>${sum.chronic}</td><td data-acwr="${lbl.id}">${num(sum.acwr, 2)}</td><td>${p.injuryDays > 0 ? `uraz ${p.injuryDays} d` : `${p.fresh ?? 95} %`}</td><td>${num(t.legs ?? 0, 2)}</td></tr>`;
  }).join('');
  return `<section class="panel">
    <p>ACWR to stosunek obciążenia z ostatnich 7 dni do średniego tygodnia z 28 dni. Strefa 0,7-1,3 jest bezpieczna. Powyżej 1,3 rośnie ryzyko urazu (x1,5), powyżej 1,5 dwa do czterech razy i spada forma (do -0,3 pkt). Mecz 90 minut to 100 AU.</p>
    <p class="muted">Na obozie przygotowawczym organizm lepiej znosi skoki obciążeń (ryzyko x0,75). Po urazie dłuższym niż 14 dni trener przygotowania fizycznego prowadzi 10-dniowy program powrotu.</p>
  </section>
  <div class="tr-scroll"><table class="tr-table"><thead><tr><th>Zawodnik</th><th>7 dni</th><th>Tydzień (28 dni)</th><th>ACWR</th><th>Świeżość</th><th>Nogi</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ------------------------------------------------------------ Sztab
function staffTab(game) {
  const st = staffOf(game, game.clubId);
  const eff = {
    asystent: (q) => `zgranie i nauka pozycji x${num(staffMul.tac(q), 2)}, rozwój x${num(staffMul.dev(q), 2)}, raport rozwoju: ${({ exact: 'dokładny', approx: 'przybliżony', vague: 'ogólny' })[reportPrecision(q)]}`,
    fizyczny: (q) => `ryzyko urazu na treningu x${num(staffMul.inj(q), 2)}, regeneracja +${num(staffMul.recover(q))} świeżości, spadek po 29 latach x${num(staffMul.decline(q), 2)}`,
    bramkarze: (q) => `rozwój bramkarzy x${num(staffMul.gk(q), 2)}`,
    mlodziez: (q) => `rozwój do 21 lat x${num(staffMul.youth(q), 2)}, skok rozwojowy x${num(staffMul.spurt(q), 2)}`,
    analityk: (q) => `analiza rywala +${num(staffMul.prep(q), 3)} pkt na mecz`,
  };
  return `<div class="tr-staff">${Object.entries(STAFF_ROLES).map(([k, r]) => {
    const s = st[k] ?? { q: 10, name: 'Brak' };
    return `<section class="panel tr-staffcard">
      <p class="muted">${esc(r.name)}</p>
      <p class="panel__lead">${esc(s.name ?? '')}</p>
      <div class="tr-q"><b>${s.q}</b>${meter(s.q, 20, s.q >= 14 ? 'ok' : s.q >= 8 ? 'mid' : 'bad')}<small>${esc(staffLabel(s.q))}</small></div>
      <p>${esc(eff[k](s.q))}</p>
    </section>`;
  }).join('')}</div>`;
}

// ------------------------------------------------------------ Rozwój i zgranie
function devTab(game, ui) {
  const T = game.training;
  const reports = T.reports ?? [];
  const i = Math.min(Number(ui.trReport ?? 0), Math.max(0, reports.length - 1));
  const r = reports[i];
  const prec = reportPrecision(staffOf(game, game.clubId).asystent?.q ?? 10);
  const chips = reports.map((x, k) => `<button class="chip" data-act="tr-report" data-i="${k}" aria-pressed="${k === i}">${esc(fmtDate(x.date))}</button>`).join('');
  const fmtRow = (x) => `<li><span class="pos" data-g="${GROUP[x.pos]}">${esc(x.pos)}</span><span class="tr-rep__name">${esc(x.name)}${x.academy ? ' <small>(akademia)</small>' : ''}<small>${prec === 'exact' ? esc(x.attrs.map(([a, v]) => `${a} ${v > 0 ? '+' : ''}${v}`).join(', ')) : ''}</small></span>
    <b data-trend="${x.d > 0 || (x.d === 0 && x.trend > 0) ? 'up' : 'down'}">${prec === 'vague' ? (x.d > 0 || x.trend > 0 ? 'rośnie' : 'spada') : prec === 'approx' ? (x.d > 0 || x.trend > 0 ? '▲' : '▼') : signed(x.d)}</b></li>`;
  const up = r ? r.rows.filter((x) => x.d > 0 || (x.d === 0 && x.trend > 0)).slice(0, 8) : [];
  const down = r ? r.rows.filter((x) => x.d < 0 || (x.d === 0 && x.trend < 0)).sort((a, b) => a.d - b.d || a.trend - b.trend).slice(0, 8) : [];
  const c = T.clubs[game.clubId];
  const coh = teamCohesion(game);
  const fams = Object.entries(c.fam).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return `
    <section class="panel">
      <h3>Zgranie drużyny: ${num(coh.z, 0)} (${esc(coh.label.toLowerCase())})</h3>
      <dl class="tr-dl">
        <div><dt>Formacja ${esc(game.tactics?.formation ?? '')}</dt><dd>${Math.round(coh.parts?.fam ?? 0)} / 100</dd></div>
        <div><dt>Instrukcje</dt><dd>${Math.round(coh.parts?.instr ?? 0)} / 100</dd></div>
        <div><dt>Znajomość systemu (jedenastka)</dt><dd>${Math.round(coh.parts?.know ?? 0)} / 100</dd></div>
        <div><dt>Rytm (stały skład)</dt><dd>${Math.round(coh.parts?.rhythm ?? 0)} / 100</dd></div>
        <div><dt>Wpływ w meczu</dt><dd>${signed(coh.term ?? 0, 2)} pkt, spójność na start ${coh.sStart}</dd></div>
        <div><dt>Stałe fragmenty</dt><dd>${Math.round(c.sp)} / 100</dd></div>
        <div><dt>Analiza rywala</dt><dd>${c.prep && c.prep.date >= game.date ? `+${num(c.prep.v, 3)} pkt na mecz ${esc(fmtDate(c.prep.date))}` : 'brak'}</dd></div>
      </dl>
      <p class="muted">Znane formacje: ${fams.map(([f, v]) => `${esc(f)} ${Math.round(v)}`).join(', ')}. Zmiana formacji zaczyna od jej zgrania, a każda zmiana instrukcji obniża ich znajomość o 7. Rotacja składu obniża rytm.</p>
    </section>
    <h3>Raport rozwoju</h3>
    ${reports.length ? `<div class="chips">${chips}</div>
      <p class="muted">Za miesiąc przed ${esc(fmtDate(r.date))}. ${prec === 'exact' ? 'Raport dokładny.' : prec === 'approx' ? 'Raport przybliżony: lepszy asystent poda liczby.' : 'Raport ogólny: słaby asystent widzi tylko kierunek.'}</p>
      ${r.spurts.length ? `<p class="notice">Skok rozwojowy: ${esc(r.spurts.map((s) => s.name).join(', '))}.</p>` : ''}
      <div class="tr-rep"><div><h4>Rosną</h4><ul class="tr-replist">${up.map(fmtRow).join('') || '<li class="muted">Nikt</li>'}</ul></div>
      <div><h4>Spadają</h4><ul class="tr-replist">${down.map(fmtRow).join('') || '<li class="muted">Nikt</li>'}</ul></div></div>`
    : '<p class="muted">Pierwszy raport pojawi się 1. dnia kolejnego miesiąca.</p>'}`;
}

/** Ekran „Trening” (HTML). ui: { trTab, trWeek, trDay, trPlayer, trReport }. */
export function renderTraining(game, ui = {}) {
  ensureTraining(game);
  attachTraining(game);
  const tab = ui.trTab ?? 'tydzien';
  const monday = addDays(mondayOf(game.date), Number(ui.trWeek ?? 0) * 7);
  const week = weekPlan(game, monday);
  const tabs = TABS.map(([k, v]) => `<button role="tab" data-act="tr-tab" data-tab="${k}" aria-selected="${tab === k}">${esc(v)}</button>`).join('');
  const body = tab === 'zawodnicy' ? playersTab(game, ui) : tab === 'obciazenia' ? loadTab(game) : tab === 'sztab' ? staffTab(game) : tab === 'rozwoj' ? devTab(game, ui) : weekTab(game, ui);
  return `<div class="tr">
    <h2>Trening</h2>
    ${header(game, week)}
    <div class="subtabs tr-tabs" role="tablist">${tabs}</div>
    ${body}
  </div>`;
}

/**
 * Kliknięcie na ekranie treningu. dataset: el.dataset przycisku.
 * Zwraca { ui: { trTab?, trWeek?, trDay?, trPlayer?, trReport? }, save: boolean }.
 */
export function handleTrainingAction(game, act, ds = {}) {
  ensureTraining(game);
  const T = game.training;
  const slot = Number(ds.slot ?? 0);
  const player = ds.id ? game.world.players[ds.id] : null;
  const pt = player?.training;
  switch (act) {
    case 'tr-tab': return { ui: { trTab: ds.tab, trDay: null, trPlayer: null }, save: false };
    case 'tr-week': return { ui: { trWeek: Math.max(-8, Math.min(8, Number(ds.w) || 0)), trDay: null }, save: false };
    case 'tr-day': return { ui: { trDay: ds.date }, save: false };
    case 'tr-close': return { ui: { trDay: null }, save: false };
    case 'tr-type': return { ui: {}, save: setSession(game, ds.date, slot, { type: ds.type }) };
    case 'tr-int': return { ui: {}, save: setSession(game, ds.date, slot, { int: ds.int }) };
    case 'tr-add': {
      const cur = weekPlan(game, mondayOf(ds.date)).find((d) => d.date === ds.date);
      const n = cur?.sessions.length ?? 0;
      return { ui: {}, save: setSession(game, ds.date, n, { type: n ? 'wideo' : 'technika', int: n ? 'low' : 'mid' }) };
    }
    case 'tr-del': return { ui: {}, save: removeSession(game, ds.date, slot) };
    case 'tr-rest': return { ui: {}, save: setRestDay(game, ds.date) };
    case 'tr-reset': return { ui: {}, save: resetDay(game, ds.date) };
    case 'tr-resetweek': return { ui: {}, save: resetWeek(game, ds.date) };
    case 'tr-accent': if (ACCENTS[ds.v]) T.settings.accent = ds.v; return { ui: {}, save: true };
    case 'tr-load': if (LOAD_LEVELS[ds.v]) T.settings.load = ds.v; return { ui: {}, save: true };
    case 'tr-player': return { ui: { trPlayer: ds.id }, save: false };
    case 'tr-pback': return { ui: { trPlayer: null }, save: false };
    case 'tr-report': return { ui: { trReport: Number(ds.i) }, save: false };
    case 'tr-focus':
      if (!pt) return { ui: {}, save: false };
      pt.focus = ds.v && (ATTRS[ds.v] || ATTR_GROUPS[ds.v]) ? ds.v : null;
      return { ui: {}, save: true };
    case 'tr-pos':
      if (!pt) return { ui: {}, save: false };
      pt.pos = ds.v && POS_NAMES[ds.v] && ds.v !== 'BR' && player.pos !== 'BR' && ds.v !== player.pos ? ds.v : null;
      return { ui: {}, save: true };
    case 'tr-prog':
      if (!pt) return { ui: {}, save: false };
      pt.prog = PROGRAMS[ds.v] && (!PROGRAMS[ds.v].maxAge || ageAt(player, game.date) <= PROGRAMS[ds.v].maxAge) ? ds.v : null;
      if (pt.prog === 'powrot' && !(player.injuryDays > 0) && !(pt.rtp > 0)) pt.rtp = 10;
      return { ui: {}, save: true };
    case 'tr-mode':
      if (!pt) return { ui: {}, save: false };
      pt.mode = MODES[ds.v] ? ds.v : 'normal';
      return { ui: {}, save: true };
    default: return { ui: {}, save: false };
  }
}
