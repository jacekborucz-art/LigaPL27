// Kadra -> Rozmowy: zebranie drużyny i rozmowy indywidualne (akcje „tt-”).
import { esc, fmtDate } from './dom.js';
import { squadOf } from '../world/worldGen.js';
import { moraleLabel } from '../career/morale.js';
import {
  MEETING_TONES, PLAYER_TALKS, TALKS_PER_WEEK, teamSituation, canHoldMeeting, holdMeeting, talkSuggestions, talkToPlayer, talksThisWeek,
} from '../career/teamTalks.js';
import { acclimLabel } from '../career/acclimatization.js';
import { GROUP } from '../career/squad.js';
import { attentionNeed, daysSinceAttention, ATTN } from '../career/attention.js';

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

function talkRow(p, rs, left, recommended) {
  const suggested = rs[0]?.[0] ?? 'encourage';
  const mor = p.morale ?? 12;
  return `<li class="tt-row${recommended ? ' is-rec' : ''}" data-pid="${esc(p.id)}">
    <span class="pos" data-g="${GROUP[p.pos]}">${esc(p.pos)}</span>
    <span class="tt-who"><b>${esc(p.name)}</b>
      <span class="tt-tags"><span class="tt-mor" data-m="${moraleBand(mor)}">Morale: ${esc(moraleLabel(mor).toLowerCase())}</span>${p.acclim ? `<span class="tt-tag" data-k="info">Aklimatyzacja ${esc(acclimLabel(p.acclim.level))}</span>` : ''}${rs.map((r) => `<span class="tt-tag" data-k="${reasonKind(r[1])}">${esc(r[1])}</span>`).join('')}</span></span>
    <span class="tt-act"><select class="pick-select" id="tt-${esc(p.id)}" aria-label="Temat rozmowy z: ${esc(p.name)}">${Object.entries(PLAYER_TALKS).map(([k, t]) => `<option value="${k}" ${k === suggested ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
    <button class="btn btn--sm ${recommended ? 'tt-go' : 'btn--quiet'}" data-act="tt-talk" data-id="${esc(p.id)}" ${left > 0 ? '' : 'disabled'}>Porozmawiaj</button></span>
  </li>`;
}

export function renderTalks(game, ui = {}) {
  const sit = teamSituation(game);
  const m = moraleSummary(game);
  const T = game.talks ?? { log: [] };
  const meetingOk = canHoldMeeting(game);
  const used = talksThisWeek(game);
  const left = TALKS_PER_WEEK - used;
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
  const pips = Array.from({ length: TALKS_PER_WEEK }, (_, i) => `<i class="${i < used ? 'is-used' : ''}"></i>`).join('');
  return `<div class="tt">
    <section class="tt-head" aria-label="Stan drużyny">
      <div class="tt-kpi" data-m="${moraleBand(m.avg)}"><small>Atmosfera w drużynie</small><b>${esc(moraleLabel(m.avg))}</b><small>${esc(sit.label)}${sit.last.length ? `: ${sit.last.join(' ')}` : ''}</small></div>
      <div class="tt-kpi" data-m="${need + m.waiting > 0 ? 'low' : 'good'}"><small>Wymaga uwagi</small><b>${need + m.waiting}</b><small>${m.low} z niskim morale, ${m.unhappy} niezadowolonych${m.newcomers ? `, ${m.newcomers} nowych w aklimatyzacji` : ''}${m.waiting ? `, ${m.waiting} czeka na rozmowę` : ''}</small></div>
      <div class="tt-kpi" data-m="${left > 0 ? 'calm' : 'mid'}"><small>Rozmowy w tym tygodniu</small><b>${left} z ${TALKS_PER_WEEK}</b><span class="tt-pips" aria-hidden="true">${pips}</span></div>
    </section>
    ${res ? `<p class="notice tt-notice" role="status">${esc(res)}</p>` : ''}
    <section class="tt-panel tt-players" aria-labelledby="tt-h-players">
      <h3 id="tt-h-players">Rozmowy indywidualne</h3>
      <p class="hint">Asystent podpowiada, z kim porozmawiać, i ustawia temat. Wrażliwi, nowi w klubie i ambitni rezerwowi źle znoszą kilka tygodni bez rozmowy.</p>
      ${rec.length ? `<h4 class="tt-group tt-group--rec">Asystent poleca <span>${rec.length}</span></h4><ul class="tt-list">${rec.map((p) => talkRow(p, reasonsOf.get(p.id) ?? [], left, true)).join('')}</ul>` : '<p class="tt-ok">Nikt teraz pilnie nie potrzebuje rozmowy.</p>'}
      ${rest.length ? `<h4 class="tt-group">Pozostali zawodnicy <span>${rest.length}</span></h4><ul class="tt-list tt-list--rest">${rest.map((p) => talkRow(p, reasonsOf.get(p.id) ?? [], left, false)).join('')}</ul>` : ''}
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
  </div>`;
}

/** Zwraca { ui, save }. root: DOM (wybrany temat rozmowy). */
export function handleTalkAction(game, act, ds = {}, root = null) {
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
