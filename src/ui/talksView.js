// Kadra -> Rozmowy: zebranie drużyny i rozmowy indywidualne (akcje „tt-”).
import { esc, fmtDate } from './dom.js';
import { squadOf } from '../world/worldGen.js';
import { moraleLabel } from '../career/morale.js';
import {
  MEETING_TONES, PLAYER_TALKS, teamSituation, canHoldMeeting, holdMeeting, talkSuggestions, talkToPlayer, talksThisWeek, talkThisWeek,
} from '../career/teamTalks.js';
import { acclimLabel } from '../career/acclimatization.js';
import { GROUP } from '../career/squad.js';
import { attentionNeed, daysSinceAttention, ATTN } from '../career/attention.js';
import { authoritySummary } from '../career/authority.js';
import { APPROACHES, situationOf, openingLines, coachOptions, closingLine } from '../career/talkDialog.js';

export const isTalkAction = (act) => typeof act === 'string' && act.startsWith('tt-');

function moraleSummary(game) {
  const sq = squadOf(game.world, game.clubId);
  const avg = sq.reduce((s, p) => s + (p.morale ?? 12), 0) / Math.max(1, sq.length);
  const low = sq.filter((p) => (p.morale ?? 12) <= 8).length;
  const unhappy = sq.filter((p) => p.unhappy || p.transferRequest).length;
  const newcomers = sq.filter((p) => p.acclim).length;
  // Długo bez rozmowy, a potrzebują uwagi (career/attention.js, docs/bierna-gra.md)
  const waiting = sq.filter((p) => attentionNeed(p, game.date).need > 0 && daysSinceAttention(p, game.date, game.attStart ?? game.date) >= ATTN.grace).length;
  return { avg, low, unhappy, newcomers, waiting };
}

// Kolory i kolejność (projekt: Kadra > Rozmowy). Ton zebrania i powód rozmowy mają stały kolor znaczeniowy.
const TONE_HUE = { praise: 'good', demand: 'push', calm: 'calm', unity: 'unity', criticize: 'risk' };
const REASON_KIND = {
  'Niskie morale': 'bad', 'Jest niezadowolony': 'bad', 'Wrażliwy, długo bez rozmowy': 'bad', 'Długo bez rozmowy': 'bad', 'Nowy w klubie, czeka na rozmowę': 'bad',
  'Kontrakt kończy się w ciągu roku': 'warn', 'Dużo kartek': 'warn', 'Słaba forma': 'warn',
  'Mało gra': 'info', 'Ambitny, mało gra': 'info', 'Bardzo dobra forma': 'good',
};
const reasonKind = (r) => REASON_KIND[r] ?? 'info';
const PRIO = { bad: 3, warn: 2, info: 1, good: 1 };
const moraleBand = (v) => (v >= 17 ? 'top' : v >= 14 ? 'good' : v >= 10 ? 'mid' : v >= 6 ? 'low' : 'bad');

const REACT_KIND = { zmotywowany: 'good', spokojny: 'good', obojetny: 'info', zdenerwowany: 'warn', urazony: 'bad' };
const REACT_LABEL = { zmotywowany: 'zmotywowany', spokojny: 'spokojny', obojetny: 'obojętny', zdenerwowany: 'zdenerwowany', urazony: 'urażony' };

function talkRow(p, rs, done, recommended) {
  const mor = p.morale ?? 12;
  const doneTag = done ? `<span class="tt-done" data-k="${REACT_KIND[done.reaction] ?? 'info'}">Rozmowa odbyta: ${esc(PLAYER_TALKS[done.talk]?.label.toLowerCase() ?? '')}, ${esc(REACT_LABEL[done.reaction] ?? '')}</span>` : '';
  return `<li class="tt-row${recommended && !done ? ' is-rec' : ''}${done ? ' is-done' : ''}" data-pid="${esc(p.id)}">
    <span class="pos" data-g="${GROUP[p.pos]}">${esc(p.pos)}</span>
    <span class="tt-who"><b>${esc(p.name)}</b>
      <span class="tt-tags">${doneTag}<span class="tt-mor" data-m="${moraleBand(mor)}">Morale: ${esc(moraleLabel(mor).toLowerCase())}</span>${p.acclim ? `<span class="tt-tag" data-k="info">Aklimatyzacja ${esc(acclimLabel(p.acclim.level))}</span>` : ''}${done ? '' : rs.map((r) => `<span class="tt-tag" data-k="${reasonKind(r[1])}">${esc(r[1])}</span>`).join('')}</span></span>
    <span class="tt-act">${done ? '<span class="tt-done-ico" aria-hidden="true">✓</span>'
      : `<button class="btn btn--sm ${recommended ? 'tt-go' : 'btn--quiet'}" data-act="tt-open" data-id="${esc(p.id)}">Porozmawiaj</button>`}</span>
  </li>`;
}

/** Okno rozmowy: temat, podejście, wynik (dialog z zawodnikiem). */
function talkDialog(game, ui, reasonsOf) {
  const D = ui.ttDlg;
  const p = D && game.world.players[D.id];
  if (!p) return '';
  const rs = reasonsOf.get(p.id) ?? [];
  const bench = rs.some((r) => /mało gra/i.test(r[1]));
  const form = Array.isArray(p.form) && p.form.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : null;
  const sit = situationOf(p, { share: bench ? 0.2 : 1, form });
  const open = openingLines(game, p, sit);
  const suggested = rs[0]?.[0] ?? 'encourage';
  const bubble = (who, text, cls = '') => `<div class="ttd-msg ttd-msg--${who} ${cls}"><span class="ttd-msg__who">${who === 'pl' ? esc(p.name.split(' ').slice(-1)[0]) : 'Trener'}</span><p>${esc(text)}</p></div>`;
  let body = bubble('pl', open.line) + (open.note ? `<p class="ttd-note">${esc(open.note)}</p>` : '');
  let foot = '';
  if (D.step === 'topic') {
    body += `<h3 class="ttd-h">O czym chcesz porozmawiać?</h3><div class="ttd-topics">${Object.entries(PLAYER_TALKS).map(([k, t]) => `<button class="ttd-topic${k === suggested ? ' is-sugg' : ''}" data-act="tt-topic" data-id="${esc(p.id)}" data-k="${k}">
      <b>${esc(t.label)}</b><small>${esc(TOPIC_HINT[k] ?? '')}</small>${k === suggested && rs.length ? `<span class="ttd-sugg">Asystent poleca: ${esc(rs[0][1].toLowerCase())}</span>` : ''}</button>`).join('')}</div>`;
  } else if (D.step === 'say') {
    body += `<p class="ttd-topic-chosen">Temat: <b>${esc(PLAYER_TALKS[D.kind].label)}</b></p><h3 class="ttd-h">Jak to powiesz?</h3>
      <div class="ttd-says">${coachOptions(game, p, D.kind).map((o) => `<button class="ttd-say" data-act="tt-say" data-id="${esc(p.id)}" data-k="${esc(D.kind)}" data-ap="${o.approach}"><span class="ttd-say__k">${esc(o.label)}</span><span class="ttd-say__line">${esc(o.line)}</span><small>${esc(o.hint)}</small></button>`).join('')}</div>`;
    foot = `<button class="btn btn--quiet btn--sm" data-act="tt-back" data-id="${esc(p.id)}">Zmień temat</button>`;
  } else if (D.step === 'done' && D.result) {
    const r = D.result;
    body += bubble('co', r.coachLine) + `<p class="ttd-note">${esc(r.reply)}</p>` + bubble('pl', r.closing, 'ttd-msg--last');
    const before = moraleLabel(r.moraleBefore).toLowerCase(); const after = moraleLabel(r.moraleAfter).toLowerCase();
    const dir = r.moraleAfter > r.moraleBefore + 0.05 ? 'up' : r.moraleAfter < r.moraleBefore - 0.05 ? 'down' : 'same';
    body += `<div class="ttd-out" data-k="${REACT_KIND[r.reaction] ?? 'info'}"><b>Reakcja: ${esc(REACT_LABEL[r.reaction] ?? r.label)}</b>
      <span>Morale: ${esc(before)}${before !== after ? ` → ${esc(after)}` : ''} <i data-dir="${dir}">${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•'}</i></span>
      ${r.same ? '<small>Ten temat słyszał już niedawno, więc rozmowa działa słabiej.</small>' : ''}</div>`;
  }
  return `<div class="ttd-back"><section class="ttd" role="dialog" aria-modal="true" aria-labelledby="ttd-h">
    <header class="ttd-head"><span class="pos" data-g="${GROUP[p.pos]}">${esc(p.pos)}</span>
      <div><h2 id="ttd-h">${esc(p.name)}</h2><p>${esc(p.persona ?? '')}, ${p.age} lat, morale: ${esc(moraleLabel(p.morale ?? 12).toLowerCase())}</p></div>
      <button class="ttd-x" data-act="tt-close" aria-label="Zamknij rozmowę">×</button></header>
    <div class="ttd-body">${body}</div>
    <footer class="ttd-foot">${foot}<button class="btn ${D.step === 'done' ? 'btn--primary' : 'btn--quiet'} btn--sm" data-act="tt-close">${D.step === 'done' ? 'Zakończ rozmowę' : 'Anuluj'}</button></footer>
  </section></div>`;
}
const TOPIC_HINT = {
  praise: 'Docenić dobrą formę', encourage: 'Podnieść na duchu', demand: 'Oczekiwać więcej', role: 'Wyjaśnić miejsce w składzie',
  future: 'Kontrakt i plany', warn: 'Kartki i dyscyplina',
};

export function renderTalks(game, ui = {}) {
  const sit = teamSituation(game);
  const m = moraleSummary(game);
  const T = game.talks ?? { log: [] };
  const meetingOk = canHoldMeeting(game);
  const used = talksThisWeek(game);
  const res = ui.ttResult;
  const sugg = talkSuggestions(game);
  const reasonsOf = new Map(sugg.map((x) => [x.p.id, x.reasons]));
  const score = (p) => (reasonsOf.get(p.id) ?? []).reduce((s, r) => s + PRIO[reasonKind(r[1])], 0);
  const sq = squadOf(game.world, game.clubId);
  // Polecani: zawodnicy z ważnym powodem (niskie morale, niezadowolenie, długo bez rozmowy, kontrakt, forma)
  const rec = sq.filter((p) => (reasonsOf.get(p.id) ?? []).some((r) => PRIO[reasonKind(r[1])] >= 2))
    .sort((a, b) => score(b) - score(a) || (a.morale ?? 12) - (b.morale ?? 12));
  const recIds = new Set(rec.map((p) => p.id));
  const rest = sq.filter((p) => !recIds.has(p.id)).sort((a, b) => (a.morale ?? 12) - (b.morale ?? 12));
  const need = m.low + m.unhappy;
  const auth = authoritySummary(game);
  return `<div class="tt">
    <section class="tt-head" aria-label="Stan drużyny">
      <div class="tt-kpi" data-m="${moraleBand(m.avg)}"><small>Atmosfera w drużynie</small><b>${esc(moraleLabel(m.avg))}</b><small>${esc(sit.label)}${sit.last.length ? `: ${sit.last.join(' ')}` : ''}</small></div>
      <div class="tt-kpi" data-m="${need + m.waiting > 0 ? 'low' : 'good'}"><small>Wymaga uwagi</small><b>${need + m.waiting}</b><small>${m.low} z niskim morale, ${m.unhappy} niezadowolonych${m.newcomers ? `, ${m.newcomers} nowych w aklimatyzacji` : ''}${m.waiting ? `, ${m.waiting} czeka na rozmowę` : ''}</small></div>
      <div class="tt-kpi tt-kpi--auth" data-m="${auth.level === 'high' ? 'good' : auth.level === 'low' ? 'bad' : 'mid'}"><small>Autorytet trenera</small><b>${esc(auth.label)}</b><small>${esc(auth.tip)}</small></div>
      <div class="tt-kpi" data-m="calm"><small>Rozmowy w tym tygodniu</small><b>${used}</b><small>Z każdym zawodnikiem raz w tygodniu, bez limitu dla kadry</small></div>
    </section>
    ${res ? `<p class="notice tt-notice" role="status">${esc(res)}</p>` : ''}
    <section class="tt-panel tt-players" aria-labelledby="tt-h-players">
      <h3 id="tt-h-players">Rozmowy indywidualne</h3>
      <p class="hint">Z każdym zawodnikiem możesz porozmawiać raz w tygodniu. Asystent podpowiada, z kim porozmawiać, i ustawia temat. Wrażliwi, nowi w klubie i ambitni rezerwowi źle znoszą kilka tygodni bez rozmowy.</p>
      ${rec.length ? `<h4 class="tt-group tt-group--rec">Asystent poleca <span>${rec.length}</span></h4><ul class="tt-list">${rec.map((p) => talkRow(p, reasonsOf.get(p.id) ?? [], talkThisWeek(game, p.id), true)).join('')}</ul>` : '<p class="tt-ok">Nikt teraz pilnie nie potrzebuje rozmowy.</p>'}
      ${rest.length ? `<h4 class="tt-group">Pozostali zawodnicy <span>${rest.length}</span></h4><ul class="tt-list tt-list--rest">${rest.map((p) => talkRow(p, reasonsOf.get(p.id) ?? [], talkThisWeek(game, p.id), false)).join('')}</ul>` : ''}
    </section>
    <aside class="tt-side">
      <section class="tt-panel tt-meet" aria-labelledby="tt-h-meet">
        <h3 id="tt-h-meet">Zebranie drużyny</h3>
        <p class="hint">${meetingOk ? 'Raz w tygodniu. Dobierz ton do sytuacji. Ta sama przemowa powtarzana co tydzień działa coraz słabiej.' : `Zebranie odbyło się ${esc(fmtDate(T.lastMeeting))}. Następne za kilka dni.`}</p>
        <div class="tt-tones">${Object.entries(MEETING_TONES).map(([k, t]) => `<button class="tt-tone" data-hue="${TONE_HUE[k] ?? 'calm'}" data-act="tt-meet" data-t="${k}" ${meetingOk ? '' : 'disabled'}><strong>${esc(t.label)}</strong><span class="tt-quote">${esc(t.quote)}</span><small>${esc(t.hint)}</small></button>`).join('')}</div>
        ${ui.ttMeeting ? `<ul class="tt-react">${ui.ttMeeting.map((r) => `<li><span>${esc(r.name)}</span><span class="react" data-r="${esc(r.reaction === 'obojetny' ? 'obojętny' : r.reaction === 'urazony' ? 'urażony' : r.reaction)}">${esc(r.label.toLowerCase())}</span></li>`).join('')}</ul>` : ''}
      </section>
      ${T.log.length ? `<section class="tt-panel tt-log" aria-labelledby="tt-h-log"><h3 id="tt-h-log">Ostatnie rozmowy</h3><ol>${T.log.slice(0, 8).map((x) => `<li data-k="${x.kind === 'meeting' ? 'meet' : 'talk'}"><time>${esc(fmtDate(x.date).replace(/, \d{4}$/, ''))}</time><span>${x.kind === 'meeting' ? `<b>Zebranie, ${esc(MEETING_TONES[x.tone].label.toLowerCase())}.</b> ${esc(x.summary)}` : `<b>${esc(game.world.players[x.playerId]?.name ?? '')}, ${esc(PLAYER_TALKS[x.talk].label.toLowerCase())}.</b> ${esc(x.reply)}`}</span></li>`).join('')}</ol></section>` : ''}
    </aside>
    ${talkDialog(game, ui, reasonsOf)}
  </div>`;
}

/** Zwraca { ui, save }. root: DOM (wybrany temat rozmowy). */
export function handleTalkAction(game, act, ds = {}, root = null) {
  if (act === 'tt-open') return { ui: { ttDlg: { id: ds.id, step: 'topic' }, ttResult: null, ttMeeting: null } };
  if (act === 'tt-close') return { ui: { ttDlg: null } };
  if (act === 'tt-back') return { ui: { ttDlg: { id: ds.id, step: 'topic' } } };
  if (act === 'tt-topic') return { ui: { ttDlg: { id: ds.id, step: 'say', kind: ds.k } } };
  if (act === 'tt-say') {
    const p = game.world.players[ds.id];
    if (!p || !PLAYER_TALKS[ds.k]) return { ui: { ttDlg: null } };
    const coachLine = coachOptions(game, p, ds.k).find((o) => o.approach === ds.ap)?.line ?? '';
    const r = talkToPlayer(game, ds.id, ds.k, { approach: APPROACHES[ds.ap] ? ds.ap : null });
    if (!r.ok) return { ui: { ttDlg: null, ttResult: r.text } };
    const result = { ...r, coachLine, closing: closingLine(game, p, ds.k, r.reaction) };
    return { ui: { ttDlg: { id: ds.id, step: 'done', kind: ds.k, result }, ttResult: null }, save: true };
  }

  if (act === 'tt-meet') {
    const r = holdMeeting(game, ds.t);
    if (!r.ok) return { ui: { ttResult: r.text } };
    return { ui: { ttResult: `${r.summary}${r.repeated ? ' Zawodnicy słyszeli to już niedawno.' : ''}`, ttMeeting: r.players }, save: true };
  }
  if (act === 'tt-talk') {
    const kind = root?.querySelector(`#tt-${CSS.escape(ds.id)}`)?.value ?? ds.kind ?? 'encourage';
    const p = game.world.players[ds.id];
    const r = talkToPlayer(game, ds.id, kind);
    if (!r.ok) return { ui: { ttResult: r.text } };
    return { ui: { ttResult: `${p.name} (${PLAYER_TALKS[kind].label.toLowerCase()}): ${r.label.toLowerCase()}. ${r.reply}`, ttMeeting: null }, save: true };
  }
  return { ui: {} };
}
