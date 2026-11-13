// Ekran kadry: lista zawodników (filtry pozycji, akademia) i profil zawodnika.
import { acclimEta } from '../career/acclimatization.js';
import { ATTRS, ATTR_GROUPS, POS_NAMES, OUTFIELD_ATTRS, GK_ATTRS } from '../data/attributes.js';
import { NAT_NAMES } from '../data/names.js';
import { GROUP } from '../career/squad.js';
import { reputationLabel } from '../career/reputation.js';
import { moraleLabel } from '../career/morale.js';
import { AGENT_TYPES, TRAIT_LABELS } from '../career/personality.js';
import { formatZl } from '../career/negotiation.js';
import { esc, fmtDate } from './dom.js';
import { formChartHtml, formHistory, formBand } from './formChart.js';
import { positionMapHtml } from './positionMap.js';
import { playerStatsHtml } from './playerStatsView.js';

export const SQUAD_FILTERS = [
  ['all', 'Wszyscy'], ['GK', 'Bramkarze'], ['DEF', 'Obrońcy'], ['MID', 'Pomocnicy'], ['ATT', 'Napastnicy'], ['academy', 'Akademia'],
];
const GROUP_ORDER = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
const POS_ORDER = ['BR', 'ŚO', 'BO', 'WB', 'DP', 'ŚP', 'OP', 'SP', 'SN', 'NAP'];

/** Gwiazdki 1-5: kwantyl OVR zawodnika wśród zawodników jego ligi. */
export function starsFor(ovr, leagueOvrsSorted) {
  if (!leagueOvrsSorted.length) return 3;
  let lo = 0;
  while (lo < leagueOvrsSorted.length && leagueOvrsSorted[lo] < ovr) lo++;
  const q = lo / leagueOvrsSorted.length;
  return q >= 0.9 ? 5 : q >= 0.7 ? 4 : q >= 0.4 ? 3 : q >= 0.15 ? 2 : 1;
}

const stars = (n) => `<span class="stars" aria-label="${n} na 5">${'★'.repeat(n)}<span class="stars__off">${'★'.repeat(5 - n)}</span></span>`;
const moraleDot = (m) => `<span class="mdot" data-m="${m >= 14 ? 'hi' : m >= 10 ? 'mid' : 'lo'}" title="Morale: ${moraleLabel(m)}"></span>`;
const sideLabel = (p) => (p.side ? ` ${p.side === 'L' ? 'L' : 'P'}` : '');
const footLabel = { L: 'Lewa', P: 'Prawa', LP: 'Obie' };

export const SQUAD_VIEWS = [['overview', 'Przegląd'], ['attrs', 'Atrybuty i forma'], ['stats', 'Statystyki']];
const defaultOrder = (a, b) => (GROUP_ORDER[GROUP[a.pos]] - GROUP_ORDER[GROUP[b.pos]])
  || (POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos)) || (b.ovr - a.ovr);
const avg = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);

/** Średnia ocen z ostatnich 5 meczów (null: brak meczów). */
function formAvg(p) { const l = formHistory(p); return avg(l.slice(-5).map((m) => m.r)); }

/** Mały wykres formy w wierszu tabeli (ostatnie mecze, najnowszy po prawej). */
function sparkline(p) {
  const l = formHistory(p);
  if (l.length < 2) return '<span class="spark spark--none" aria-hidden="true"></span>';
  const W = 64, H = 20, lo = 5, hi = 9;
  const x = (i) => 2 + (i * (W - 4)) / (l.length - 1);
  const y = (r) => 2 + (1 - (Math.min(hi, Math.max(lo, r)) - lo) / (hi - lo)) * (H - 4);
  const d = l.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(m.r).toFixed(1)}`).join(' ');
  const last = l[l.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"/><circle cx="${x(l.length - 1).toFixed(1)}" cy="${y(last.r).toFixed(1)}" r="2.4" data-b="${formBand(last.r)}"/></svg>`;
}

/** Wartości kolumn do sortowania (Excel: klik w nagłówek). */
function sortVal(p, k) {
  const ss = p.season ?? {};
  switch (k) {
    case 'name': return p.name;
    case 'pos': return null; // domyślna kolejność pozycji
    case 'age': return p.age;
    case 'ovr': return p.ovr;
    case 'form': return formAvg(p) ?? -1;
    case 'fresh': return p.fresh ?? 95;
    case 'morale': return p.morale ?? 12;
    case 'apps': return ss.apps ?? 0;
    case 'min': return ss.min ?? 0;
    case 'g': return ss.g ?? 0;
    case 'a': return ss.a ?? 0;
    case 'ga': return (ss.g ?? 0) + (ss.a ?? 0);
    case 'rating': return ss.apps ? ss.rating : -1;
    case 'motm': return ss.motm ?? 0;
    case 'yc': return ss.yc ?? 0;
    case 'rc': return ss.rc ?? 0;
    case 'cs': return p.pos === 'BR' ? ss.cs ?? 0 : -1;
    default: return ATTRS[k] ? (p.attr?.[k] ?? -1) * (ATTRS[k].group === 'gk' && p.pos !== 'BR' ? 0 : 1) : 0;
  }
}
function sortList(list, sort) {
  const out = [...list].sort(defaultOrder);
  if (!sort?.k || sort.k === 'pos') return sort?.dir === 'asc' && sort?.k === 'pos' ? out.reverse() : out;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return out.sort((a, b) => {
    const va = sortVal(a, sort.k); const vb = sortVal(b, sort.k);
    if (typeof va === 'string') return dir * va.localeCompare(vb, 'pl');
    return dir * (va - vb) || defaultOrder(a, b);
  });
}
/** Nagłówek kolumny z sortowaniem. */
function th(k, label, sort, { title = '', cls = '' } = {}) {
  const on = sort?.k === k;
  const aria = on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return `<th scope="col" class="${cls}" aria-sort="${aria}"><button data-act="sqsort" data-k="${k}" ${title ? `title="${esc(title)}"` : ''}>${esc(label)}${on ? `<i aria-hidden="true">${sort.dir === 'asc' ? '▲' : '▼'}</i>` : ''}</button></th>`;
}
const nameCell = (p) => `<th scope="row" class="xl__nm"><button data-act="player" data-id="${esc(p.id)}">${moraleDot(p.morale ?? 12)}<span>${esc(p.name)}</span></button></th>`;
const posCell = (p) => `<td class="xl__pos"><span class="pos" data-g="${GROUP[p.pos]}">${esc(p.pos)}${sideLabel(p)}</span></td>`;
const statusMark = (p) => (p.injuryDays > 0 ? `<span class="xl__st" data-k="inj" title="${esc(`Kontuzja, ok. ${p.injuryDays} dni`)}">+</span>`
  : (p.suspended > 0 || Object.values(p.susp ?? {}).some((v) => v > 0)) ? '<span class="xl__st" data-k="sus" title="Pauza za kartki">P</span>' : '');

function attrsTable(list, sort) {
  const groups = [['tech', OUTFIELD_ATTRS.filter((k) => ATTRS[k].group === 'tech')], ['mental', OUTFIELD_ATTRS.filter((k) => ATTRS[k].group === 'mental')], ['phys', OUTFIELD_ATTRS.filter((k) => ATTRS[k].group === 'phys')], ['gk', GK_ATTRS]];
  const head1 = `<tr class="xl__grp"><th colspan="2"></th><th colspan="5" data-g="info">Stan i forma</th>${groups.map(([g, ks]) => `<th colspan="${ks.length}" data-g="${g}">${esc(ATTR_GROUPS[g])}</th>`).join('')}</tr>`;
  const head2 = `<tr>${th('pos', 'Poz.', sort, { cls: 'xl__pos' })}${th('name', 'Zawodnik', sort, { cls: 'xl__nm' })}${th('age', 'Wiek', sort)}${th('ovr', 'OVR', sort, { title: 'Ocena ogólna 1-20' })}${th('form', 'Forma', sort, { title: 'Średnia ocen z 5 ostatnich meczów, wykres: 10 ostatnich' })}${th('fresh', 'Kond.', sort, { title: 'Świeżość (kondycja przed meczem)' })}${th('morale', 'Mor.', sort, { title: 'Morale' })}
    ${groups.map(([g, ks]) => ks.map((k, i) => th(k, k, sort, { title: ATTRS[k].name, cls: `xl__a${i === 0 ? ' xl__g0' : ''}` })).join('')).join('')}</tr>`;
  const rows = list.map((p) => {
    const fa = formAvg(p); const fr = Math.round(p.fresh ?? 95);
    const cells = groups.map(([g, ks]) => ks.map((k, i) => {
      const v = p.attr?.[k];
      if (g === 'gk' && p.pos !== 'BR') return `<td class="xl__a xl__na${i === 0 ? ' xl__g0' : ''}">·</td>`;
      return `<td class="xl__a${i === 0 ? ' xl__g0' : ''}" data-b="${attrBand(v)}">${v ?? '–'}</td>`;
    }).join('')).join('');
    return `<tr data-pid="${esc(p.id)}">${posCell(p)}${nameCell(p)}<td>${p.age}</td><td class="xl__ovr">${Math.round(p.ovr)}</td>
      <td class="xl__form">${sparkline(p)}<b data-b="${fa == null ? 'none' : formBand(fa)}">${fa == null ? '–' : fa.toFixed(2)}</b></td>
      <td class="xl__fresh" data-b="${fr >= 85 ? 'good' : fr >= 70 ? 'mid' : 'low'}">${fr}%${statusMark(p)}</td><td>${esc(moraleLabel(p.morale ?? 12))}</td>${cells}</tr>`;
  }).join('');
  return `<div class="xl-wrap" tabindex="0" aria-label="Atrybuty i forma zawodników, tabela przewijana w poziomie"><table class="xl xl--attrs"><thead>${head1}${head2}</thead><tbody>${rows}</tbody></table></div>`;
}

function statsTable(list, sort, seasonLabel) {
  const head = `<tr>${th('pos', 'Poz.', sort, { cls: 'xl__pos' })}${th('name', 'Zawodnik', sort, { cls: 'xl__nm' })}${th('age', 'Wiek', sort)}${th('apps', 'Mecze', sort, { title: 'Występy (w tym z ławki)' })}${th('min', 'Minuty', sort)}${th('g', 'Gole', sort)}${th('a', 'Asysty', sort)}${th('ga', 'G+A', sort, { title: 'Gole i asysty' })}
    ${th('rating', 'Śr. ocena', sort, { title: 'Średnia ocena w sezonie' })}${th('form', 'Forma', sort, { title: 'Średnia ocen z 5 ostatnich meczów' })}${th('motm', 'Gracz meczu', sort)}${th('yc', 'Żółte', sort)}${th('rc', 'Czerwone', sort)}${th('cs', 'Czyste konta', sort, { title: 'Tylko bramkarze' })}</tr>`;
  const tot = { apps: 0, min: 0, g: 0, a: 0, yc: 0, rc: 0, motm: 0 };
  const rows = list.map((p) => {
    const ss = p.season ?? {}; const fa = formAvg(p);
    for (const k of Object.keys(tot)) tot[k] += ss[k] ?? 0;
    const n = (v) => (v ? v : '<span class="xl__z">0</span>');
    return `<tr data-pid="${esc(p.id)}">${posCell(p)}${nameCell(p)}<td>${p.age}</td><td>${n(ss.apps ?? 0)}</td><td>${n(ss.min ?? 0)}</td><td>${n(ss.g ?? 0)}</td><td>${n(ss.a ?? 0)}</td><td>${n((ss.g ?? 0) + (ss.a ?? 0))}</td>
      <td class="xl__rt">${ss.apps ? `<b data-b="${formBand(ss.rating)}">${ss.rating.toFixed(2)}</b>` : '–'}</td>
      <td class="xl__form">${sparkline(p)}<b data-b="${fa == null ? 'none' : formBand(fa)}">${fa == null ? '–' : fa.toFixed(2)}</b></td>
      <td>${n(ss.motm ?? 0)}</td><td>${ss.yc ? `<span class="xl__card" data-c="y">${ss.yc}</span>` : n(0)}</td><td>${ss.rc ? `<span class="xl__card" data-c="r">${ss.rc}</span>` : n(0)}</td><td>${p.pos === 'BR' ? n(ss.cs ?? 0) : '<span class="xl__z">·</span>'}</td></tr>`;
  }).join('');
  const foot = `<tr><td></td><th scope="row" class="xl__nm">Razem</th><td></td><td>${tot.apps}</td><td>${tot.min}</td><td>${tot.g}</td><td>${tot.a}</td><td>${tot.g + tot.a}</td><td></td><td></td><td>${tot.motm}</td><td>${tot.yc}</td><td>${tot.rc}</td><td></td></tr>`;
  return `<p class="xl-note">Sezon ${esc(seasonLabel)}, wszystkie mecze o punkty (liga, puchary, bez sparingów). Szczegóły w podziale na rozgrywki: kliknij zawodnika.</p>
    <div class="xl-wrap" tabindex="0" aria-label="Statystyki zawodników, tabela przewijana w poziomie"><table class="xl xl--stats"><thead>${head}</thead><tbody>${rows}</tbody><tfoot>${foot}</tfoot></table></div>`;
}

/** Panel po prawej (PC): podsumowanie kadry. */
function squadAside(players) {
  const cnt = (g) => players.filter((p) => GROUP[p.pos] === g).length;
  const inj = players.filter((p) => p.injuryDays > 0).sort((a, b) => b.injuryDays - a.injuryDays);
  const sus = players.filter((p) => p.suspended > 0 || Object.values(p.susp ?? {}).some((v) => v > 0));
  const formed = players.map((p) => ({ p, f: formAvg(p) })).filter((x) => x.f != null && formHistory(x.p).length >= 3).sort((a, b) => b.f - a.f);
  const li = (p, txt, k = '') => `<li><button data-act="player" data-id="${esc(p.id)}"><span class="pos" data-g="${GROUP[p.pos]}">${esc(p.pos)}</span><span class="sqa__nm">${esc(p.name)}</span><small${k ? ` data-k="${k}"` : ''}>${esc(txt)}</small></button></li>`;
  const tired = players.filter((p) => (p.fresh ?? 95) < 75).sort((a, b) => (a.fresh ?? 95) - (b.fresh ?? 95));
  return `<aside class="sqa" aria-label="Podsumowanie kadry">
    <section class="sqa__p" data-t="calm"><h3>Formacje</h3><ul class="sqa__lines">
      <li><span class="pos" data-g="GK">BR</span><b>${cnt('GK')}</b></li><li><span class="pos" data-g="DEF">OBR</span><b>${cnt('DEF')}</b></li>
      <li><span class="pos" data-g="MID">POM</span><b>${cnt('MID')}</b></li><li><span class="pos" data-g="ATT">NAP</span><b>${cnt('ATT')}</b></li></ul></section>
    <section class="sqa__p" data-t="${inj.length + sus.length ? 'bad' : 'good'}"><h3>Niedostępni <span>${inj.length + sus.length}</span></h3>
      ${inj.length + sus.length ? `<ul class="sqa__list">${inj.map((p) => li(p, `uraz, ${p.injuryDays} ${plural(p.injuryDays, 'dzień', 'dni', 'dni')}`, 'inj')).join('')}${sus.map((p) => li(p, 'pauza za kartki', 'sus')).join('')}</ul>` : '<p class="sqa__ok">Wszyscy do dyspozycji.</p>'}</section>
    <section class="sqa__p" data-t="good"><h3>Najlepsza forma</h3>
      ${formed.length ? `<ul class="sqa__list">${formed.slice(0, 4).map((x) => li(x.p, `śr. ${x.f.toFixed(2)}`, 'good')).join('')}</ul>` : '<p class="sqa__ok">Forma pojawi się po kilku meczach.</p>'}</section>
    ${tired.length ? `<section class="sqa__p" data-t="warn"><h3>Zmęczeni <span>${tired.length}</span></h3><ul class="sqa__list">${tired.slice(0, 5).map((p) => li(p, `kondycja ${Math.round(p.fresh ?? 95)}%`, 'warn')).join('')}</ul></section>` : ''}
  </aside>`;
}

export function renderSquadList(players, { filter = 'all', leagueOvrs = [], academy = [], view = 'overview', sort = null, game = null } = {}) {
  const list = filter === 'academy' ? academy : players.filter((p) => filter === 'all' || GROUP[p.pos] === filter);
  const sorted = view === 'overview' ? [...list].sort(defaultOrder) : sortList(list, sort);
  const avgAge = players.length ? (players.reduce((s, p) => s + p.age, 0) / players.length).toFixed(1) : '0';
  const chips = SQUAD_FILTERS.map(([k, v]) => `<button class="chip" data-act="sqfilter" data-f="${k}" aria-pressed="${filter === k}">${esc(v)}</button>`).join('');
  const views = `<div class="seg sqv" role="tablist" aria-label="Widok listy">${SQUAD_VIEWS.map(([k, v]) => `<button role="tab" data-act="sqview" data-v="${k}" aria-selected="${view === k}">${esc(v)}</button>`).join('')}</div>`;
  const top = `<div class="mail-head sqx__head"><h2>Kadra</h2><span class="muted">${players.length} zawodników, średni wiek ${avgAge}</span></div>
    <div class="sqx__bar">${views}<div class="chips">${chips}</div></div>`;
  if (view === 'attrs' || view === 'stats') {
    const body = !sorted.length ? '<p class="mail-empty">Brak zawodników.</p>' : view === 'attrs' ? attrsTable(sorted, sort) : statsTable(sorted, sort, game?.season?.seasonId ?? game?.season ?? '');
    return `<div class="sqx sqx--table">${top}${body}</div>`;
  }
  return `<div class="sqx sqx--overview">${top}
    <div class="sqx__main">
    <div class="sq" role="table" aria-label="Zawodnicy">
      <div class="sq__row sq__head" role="row">
        <span role="columnheader">Poz.</span><span role="columnheader">Zawodnik</span><span role="columnheader" class="w">Wiek</span>
        <span role="columnheader" class="w">Narodowość</span><span role="columnheader" class="w wx">Forma</span><span role="columnheader" class="w wx">Kondycja</span><span role="columnheader" class="w">Kontrakt do</span>
        <span role="columnheader" class="w">Wartość</span><span role="columnheader">OVR</span>
      </div>
      ${sorted.map((p) => {
        const fa = formAvg(p); const fr = Math.round(p.fresh ?? 95);
        return `
      <button class="sq__row" role="row" data-act="player" data-id="${esc(p.id)}" data-pid="${esc(p.id)}">
        <span class="pos" data-g="${GROUP[p.pos]}">${esc(p.pos)}${sideLabel(p)}</span>
        <span class="sq__name">${moraleDot(p.morale)}<span><b>${esc(p.name)}</b><small>${esc(p.nat)}, ${p.age} lat${p.persona === 'Lider' ? ', lider' : ''}</small></span></span>
        <span class="w">${p.age}</span><span class="w">${esc(NAT_NAMES[p.nat] ?? p.nat)}</span>
        <span class="w wx sq__form">${sparkline(p)}<b data-b="${fa == null ? 'none' : formBand(fa)}">${fa == null ? '–' : fa.toFixed(2)}</b></span>
        <span class="w wx sq__fresh" data-b="${fr >= 85 ? 'good' : fr >= 70 ? 'mid' : 'low'}"><i style="--v:${fr}%"></i>${fr}%${statusMark(p)}</span>
        <span class="w">${esc(fmtDate(p.contract.until))}</span><span class="w">${esc(formatZl(p.value))}</span>
        <span class="sq__ovr"><b title="Ocena ogólna w skali 1-20">${Math.round(p.ovr)}</b>${stars(starsFor(p.ovr, leagueOvrs))}</span>
      </button>`;
      }).join('') || '<p class="mail-empty">Brak zawodników.</p>'}
    </div>
    ${filter === 'academy' ? '' : squadAside(players)}
    </div></div>`;
}

export function attrBand(v) {
  return v >= 16 ? 'top' : v >= 13 ? 'good' : v >= 8 ? 'mid' : 'low';
}

/** Grupy atrybutów z paskami (profil zawodnika i panel atrybutów na ekranie składu). */
export function attrGroupsHtml(p, { heading = 'h3' } = {}) {
  const groups = p.pos === 'BR' ? ['gk', 'mental', 'phys', 'tech'] : ['tech', 'mental', 'phys'];
  return groups.map((g) => `
          <${heading}>${esc(ATTR_GROUPS[g])}</${heading}>
          <ul class="attrs">${Object.keys(ATTRS).filter((a) => ATTRS[a].group === g).map((a) => `
            <li><span>${esc(ATTRS[a].name)}</span><span class="abar" aria-hidden="true"><i data-b="${attrBand(p.attr[a])}" style="width:${p.attr[a] * 5}%"></i></span><b data-b="${attrBand(p.attr[a])}">${p.attr[a]}</b></li>`).join('')}
          </ul>`).join('');
}

function traitPhrases(traits) {
  if (!traits) return [];
  const entries = Object.entries(traits).sort((a, b) => Math.abs(b[1] - 10.5) - Math.abs(a[1] - 10.5)).slice(0, 4);
  return entries.map(([k, v]) => `${v >= 14 ? 'Wysoka' : v <= 7 ? 'Niska' : 'Przeciętna'} cecha: ${TRAIT_LABELS[k].toLowerCase()}`);
}

export function renderPlayerProfile(p, opts = {}) {
  const { leagueOvrs = [], clubName = '', foreign = false, back = { act: 'squadback', label: 'Wróć do kadry' } } = opts;
  const alt = Object.entries(p.alt || {}).filter(([, v]) => v >= 70).map(([k]) => k);
  return `
    <button class="btn btn--quiet" data-act="${esc(back.act)}">${esc(back.label)}</button>
    ${foreign ? '<p class="hint">Zawodnik innego klubu: morale, świeżość, pensja i agent są znane tylko jego klubowi.</p>' : ''}
    <header class="pp" data-pid="${esc(p.id)}">
      <div class="pp__ovr"><span class="pp__ovrn" title="Ocena ogólna w skali 1-20">${Math.round(p.ovr)}</span>${stars(starsFor(p.ovr, leagueOvrs))}</div>
      <div>
        <h2 class="pp__name">${esc(p.name)}</h2>
        <p class="muted">${esc(POS_NAMES[p.pos])}${p.side ? (p.side === 'L' ? ', lewa strona' : ', prawa strona') : ''}${p.variant ? `, ${esc(p.variant)}` : ''}${alt.length ? `. Gra też: ${esc(alt.join(', '))}` : ''}</p>
        <p class="muted">${esc(clubName)}, ${p.age} lat (ur. ${esc(fmtDate(p.birthDate))}), ${esc(NAT_NAMES[p.nat] ?? p.nat)}, noga: ${esc(footLabel[p.foot])}</p>
      </div>
    </header>
    <div class="pp__layout">
    <div class="pp__cols">
      <section>
        ${attrGroupsHtml(p)}
      </section>
      <section>
        <h3>Stan</h3>
        <ul class="plain-list">
          ${foreign ? '' : `<li><span class="k">Morale</span><span>${esc(moraleLabel(p.morale))}</span></li>`}
          ${foreign ? '' : `<li><span class="k">Świeżość</span><span>${Math.round(p.fresh ?? 95)}%</span></li>
          <li><span class="k">Ostrość</span><span>${Math.round(p.sharp ?? 70)}%</span></li>`}
          <li><span class="k">Zdrowie</span><span>${p.injuryDays > 0 ? `Kontuzja, ok. ${p.injuryDays} dni` : 'Zdrowy'}</span></li>
          ${p.acclim ? `<li><span class="k">Aklimatyzacja</span><span>${Math.round(p.acclim.level)} %, pełna ok. ${esc(fmtDate(acclimEta(p, opts.date ?? p.acclim.since)))}. ${esc(p.acclim.reasons.join(', '))}</span></li>` : ''}
          ${p.callUp ? `<li><span class="k">Kadra</span><span>Na zgrupowaniu do ${esc(fmtDate(p.callUp.to))}</span></li>` : ''}
          ${p.intl?.caps || p.intlU21 ? `<li><span class="k">Reprezentacja</span><span>${p.intl?.caps ? `występy: ${p.intl.caps}, gole: ${p.intl.goals}` : ''}${p.intl?.caps && p.intlU21 ? '; ' : ''}${p.intlU21 ? `zgrupowania U21: ${p.intlU21}` : ''}</span></li>` : ''}
        </ul>
        ${formChartHtml(p)}
        ${positionMapHtml(p)}
        <h3>Kontrakt</h3>
        <ul class="plain-list">
          ${foreign ? '' : `<li><span class="k">Pensja</span><span>${esc(formatZl(p.contract.wage))} tygodniowo</span></li>`}
          <li><span class="k">Do</span><span>${esc(fmtDate(p.contract.until))}</span></li>
          <li><span class="k">Klauzula</span><span>${p.contract.clause ? esc(formatZl(p.contract.clause)) : 'Brak'}</span></li>
          <li><span class="k">Wartość</span><span>${esc(formatZl(p.value))}</span></li>
          ${foreign ? '' : `<li><span class="k">Agent</span><span>${esc(AGENT_TYPES[p.agent]?.label ?? 'Brak danych')}</span></li>`}
        </ul>
        <h3>Charakter</h3>
        <ul class="plain-list">
          <li><span class="k">Osobowość</span><span>${esc(p.persona)}</span></li>
          <li><span class="k">Reputacja</span><span>${esc(reputationLabel(p.rep))}</span></li>
          ${traitPhrases(p.traits).map((t) => `<li><span class="k"></span><span>${esc(t)}</span></li>`).join('')}
          <li><span class="k">Potencjał</span><span>Oceni skauting</span></li>
        </ul>
      </section>
    </div>
    <div class="pp__stats">${playerStatsHtml(p, opts.game)}</div>
    </div>`;
}
