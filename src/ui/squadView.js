// Ekran kadry: lista zawodników (filtry pozycji, akademia) i profil zawodnika.
import { acclimEta } from '../career/acclimatization.js';
import { ATTRS, ATTR_GROUPS, POS_NAMES } from '../data/attributes.js';
import { NAT_NAMES } from '../data/names.js';
import { GROUP } from '../career/squad.js';
import { reputationLabel } from '../career/reputation.js';
import { moraleLabel } from '../career/morale.js';
import { AGENT_TYPES, TRAIT_LABELS } from '../career/personality.js';
import { formatZl } from '../career/negotiation.js';
import { esc, fmtDate } from './dom.js';
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

export function renderSquadList(players, { filter = 'all', leagueOvrs = [], academy = [] } = {}) {
  const list = filter === 'academy' ? academy : players.filter((p) => filter === 'all' || GROUP[p.pos] === filter);
  const sorted = [...list].sort((a, b) => (GROUP_ORDER[GROUP[a.pos]] - GROUP_ORDER[GROUP[b.pos]])
    || (POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos)) || (b.ovr - a.ovr));
  const avgAge = players.length ? (players.reduce((s, p) => s + p.age, 0) / players.length).toFixed(1) : '0';
  const chips = SQUAD_FILTERS.map(([k, v]) => `<button class="chip" data-act="sqfilter" data-f="${k}" aria-pressed="${filter === k}">${esc(v)}</button>`).join('');
  return `
    <div class="mail-head"><h2>Kadra</h2><span class="muted">${players.length} zawodników, średni wiek ${avgAge}</span></div>
    <div class="chips">${chips}</div>
    <div class="sq" role="table" aria-label="Zawodnicy">
      <div class="sq__row sq__head" role="row">
        <span role="columnheader">Poz.</span><span role="columnheader">Zawodnik</span><span role="columnheader" class="w">Wiek</span>
        <span role="columnheader" class="w">Narodowość</span><span role="columnheader" class="w">Kontrakt do</span>
        <span role="columnheader" class="w">Wartość</span><span role="columnheader">OVR</span>
      </div>
      ${sorted.map((p) => `
      <button class="sq__row" role="row" data-act="player" data-id="${esc(p.id)}" data-pid="${esc(p.id)}">
        <span class="pos" data-g="${GROUP[p.pos]}">${esc(p.pos)}${sideLabel(p)}</span>
        <span class="sq__name">${moraleDot(p.morale)}<span><b>${esc(p.name)}</b><small>${esc(p.nat)}, ${p.age} lat${p.persona === 'Lider' ? ', lider' : ''}</small></span></span>
        <span class="w">${p.age}</span><span class="w">${esc(NAT_NAMES[p.nat] ?? p.nat)}</span>
        <span class="w">${esc(fmtDate(p.contract.until))}</span><span class="w">${esc(formatZl(p.value))}</span>
        <span class="sq__ovr"><b title="Ocena ogólna w skali 1-20">${Math.round(p.ovr)}</b>${stars(starsFor(p.ovr, leagueOvrs))}</span>
      </button>`).join('') || '<p class="mail-empty">Brak zawodników.</p>'}
    </div>`;
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
          <li><span class="k">Forma</span><span>${p.form.length ? esc(p.form.join(', ')) : 'Brak meczów w sezonie'}</span></li>
          ${foreign ? '' : `<li><span class="k">Świeżość</span><span>${Math.round(p.fresh ?? 95)}%</span></li>
          <li><span class="k">Ostrość</span><span>${Math.round(p.sharp ?? 70)}%</span></li>`}
          <li><span class="k">Zdrowie</span><span>${p.injuryDays > 0 ? `Kontuzja, ok. ${p.injuryDays} dni` : 'Zdrowy'}</span></li>
          ${p.acclim ? `<li><span class="k">Aklimatyzacja</span><span>${Math.round(p.acclim.level)} %, pełna ok. ${esc(fmtDate(acclimEta(p, opts.date ?? p.acclim.since)))}. ${esc(p.acclim.reasons.join(', '))}</span></li>` : ''}
          ${p.callUp ? `<li><span class="k">Kadra</span><span>Na zgrupowaniu do ${esc(fmtDate(p.callUp.to))}</span></li>` : ''}
          ${p.intl?.caps || p.intlU21 ? `<li><span class="k">Reprezentacja</span><span>${p.intl?.caps ? `występy: ${p.intl.caps}, gole: ${p.intl.goals}` : ''}${p.intl?.caps && p.intlU21 ? '; ' : ''}${p.intlU21 ? `zgrupowania U21: ${p.intlU21}` : ''}</span></li>` : ''}
        </ul>
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
