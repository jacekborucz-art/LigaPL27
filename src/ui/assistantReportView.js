// Widok „Raport asystenta” o zawodniku (menu zawodnika, akcja „arep”). Dane: src/career/assistantReport.js.
// Pełna strona w bieżącej zakładce, powrót przyciskiem „Wróć” (akcja „arepback”). Przyciski rekomendacji
// uruchamiają istniejące akcje treningu indywidualnego (tr-mode, tr-focus, tr-prog, tr-pos), więc po kliknięciu
// raport odświeża się z nowym stanem.
import { esc } from './dom.js';
import { ATTR_GROUPS, POS_NAMES } from '../data/attributes.js';
import { playerReport } from '../career/assistantReport.js';

const GROUP_TXT = { ...ATTR_GROUPS };
const PREC_DOTS = { exact: 3, approx: 2, vague: 1 };

const card = (cls, title, body, { tone = 'info', badge = '' } = {}) => `<section class="arep-card ${cls}" data-t="${tone}" aria-labelledby="arep-${cls}">
    <header class="arep-card__head"><h3 id="arep-${cls}">${esc(title)}</h3>${badge ? `<span class="arep-card__badge">${esc(badge)}</span>` : ''}</header>
    <div class="arep-card__body">${body}</div>
  </section>`;

const kv = (list) => `<dl class="arep-kv">${list.map((x) => `<div${x.tone ? ` data-t="${x.tone}"` : ''}><dt>${esc(x.k)}</dt><dd>${esc(x.v)}</dd></div>`).join('')}</dl>`;

function sidesHtml(groups, empty) {
  if (!groups.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<ul class="arep-sides">${groups.map((g) => `<li><b>${esc(GROUP_TXT[g.g] ?? g.g)}</b><span>${esc(g.items.join(', '))}</span></li>`).join('')}</ul>`;
}

function recHtml(r) {
  const btn = r.act ? `<button class="btn btn--sm arep-rec__go" data-act="${esc(r.act.act)}" data-id="${esc(r.act.id)}" data-v="${esc(r.act.v)}">${esc(r.act.label)}</button>` : '';
  return `<li class="arep-rec" data-t="${esc(r.tone)}" data-rec="${esc(r.id)}"><span class="arep-rec__dot" aria-hidden="true"></span>
    <span class="arep-rec__text"><b>${esc(r.text)}</b>${r.why ? `<small>Dlaczego: ${esc(r.why)}.</small>` : ''}</span>${btn}</li>`;
}

/** Raport o zawodniku (HTML). back: { act, label } przycisku powrotu. Pusty tekst dla obcego zawodnika. */
export function renderAssistantReport(game, pid, { back = { act: 'arepback', label: 'Wróć' } } = {}) {
  const r = playerReport(game, pid);
  if (!r) return `<button class="btn btn--quiet" data-act="${esc(back.act)}">${esc(back.label)}</button><p class="notice">Raport asystenta jest dostępny tylko dla zawodników twojego klubu.</p>`;
  const dots = PREC_DOTS[r.confidence.prec];
  const hidden = r.hidden.map((h) => `<li data-t="${esc(h.tone)}"><span class="arep-hid__k">${esc(h.label)}</span><span class="arep-hid__v">${esc(h.word)}${h.range ? ` <small>(${esc(h.range)})</small>` : ''}</span></li>`).join('');
  const pos = r.roles.positions.map((x) => `<li><span class="arep-pos">${esc(x.pos)}</span><span>${esc(POS_NAMES[x.pos])}</span><small>${x.prof} %${x.rating != null ? `, ocena ok. ${esc(String(x.rating).replace('.', ','))}` : ''}</small></li>`).join('');
  const roles = [
    r.roles.role ? `<p><b>Rola:</b> ${esc(r.roles.role)}${r.roles.alt ? `; może też: ${esc(r.roles.alt)}` : ''}.</p>` : '',
    r.roles.learn ? `<p><b>Nowa pozycja:</b> ${esc(r.roles.learn.pos)} (${esc(POS_NAMES[r.roles.learn.pos].toLowerCase())})${r.roles.learn.rating != null ? `, ocena ok. ${esc(String(r.roles.learn.rating).replace('.', ','))}` : ''}, po nauce pozycji.</p>` : '',
  ].join('');
  return `<div class="arep" data-prec="${esc(r.confidence.prec)}">
    <button class="btn btn--quiet" data-act="${esc(back.act)}">${esc(back.label)}</button>
    <header class="arep__head">
      <span class="pos arep__pos" data-g="${esc(r.group ?? '')}">${esc(r.pos)}</span>
      <div class="arep__who">
        <p class="arep__kicker">Raport asystenta${r.academy ? ', akademia' : ''}</p>
        <h2 class="arep__name">${esc(r.name)}</h2>
        <p class="muted">${esc(POS_NAMES[r.pos])}, ${r.age} lat, OVR ${Math.round(r.ovr)}</p>
      </div>
      <div class="arep__conf" data-prec="${esc(r.confidence.prec)}" role="img" aria-label="${esc(r.confidence.text)}">
        <span class="arep__conf-k">Pewność oceny</span>
        <span class="arep__conf-v"><b>${esc(r.confidence.word)}</b><span class="arep__dots" aria-hidden="true">${[1, 2, 3].map((i) => `<i${i <= dots ? ' class="on"' : ''}></i>`).join('')}</span></span>
        <small>${esc(r.assistant.name)}, ${esc(r.assistant.label.toLowerCase())}</small>
      </div>
    </header>
    <p class="arep__summary">${esc(r.summary)}</p>
    ${card('recs', 'Zalecenia', `<ul class="arep-recs">${r.recs.map(recHtml).join('')}</ul>`, { tone: r.recs[0]?.tone ?? 'info' })}
    <div class="arep__grid">
      ${card('hidden', 'Cechy ukryte', `<ul class="arep-hid">${hidden}</ul><p class="arep-note">${esc(r.confidence.text)} Lepszy asystent i dłuższa współpraca dają dokładniejszą ocenę.</p>`, { tone: 'misc', badge: `pewność ${r.confidence.word}` })}
      ${card('sides', 'Mocne i słabe strony', `<h4>Mocne strony</h4>${sidesHtml(r.sides.strong, 'Bez wyraźnych atutów na tle ligi.')}<h4>Do poprawy</h4>${sidesHtml(r.sides.weak, 'Bez wyraźnych braków na tle ligi.')}`, { tone: 'good', badge: 'na tle ligi' })}
      ${card('roles', 'Pozycje i rola', `${pos ? `<ul class="arep-poslist">${pos}</ul>` : ''}${roles}`, { tone: 'info' })}
      ${card('state', 'Stan obecny', kv(r.state), { tone: r.state.some((x) => x.tone === 'bad') ? 'bad' : r.state.some((x) => x.tone === 'warn') ? 'warn' : 'good' })}
      ${card('mental', 'Psychika i sytuacja', kv(r.mental), { tone: r.mental.some((x) => x.tone === 'bad') ? 'bad' : r.mental.some((x) => x.tone === 'warn') ? 'warn' : 'info' })}
      ${card('outlook', 'Rozwój', kv(r.outlook), { tone: 'misc' })}
    </div>
  </div>`;
}
