// Kadra -> Rozmowy: zebranie drużyny i rozmowy indywidualne (akcje „tt-”).
import { esc, fmtDate } from './dom.js';
import { squadOf } from '../world/worldGen.js';
import { moraleLabel } from '../career/morale.js';
import {
  MEETING_TONES, PLAYER_TALKS, TALKS_PER_WEEK, teamSituation, canHoldMeeting, holdMeeting, talkSuggestions, talkToPlayer, talksThisWeek,
} from '../career/teamTalks.js';
import { acclimLabel } from '../career/acclimatization.js';

export const isTalkAction = (act) => typeof act === 'string' && act.startsWith('tt-');

function moraleSummary(game) {
  const sq = squadOf(game.world, game.clubId);
  const avg = sq.reduce((s, p) => s + (p.morale ?? 12), 0) / Math.max(1, sq.length);
  const low = sq.filter((p) => (p.morale ?? 12) <= 8).length;
  const unhappy = sq.filter((p) => p.unhappy || p.transferRequest).length;
  const newcomers = sq.filter((p) => p.acclim).length;
  return { avg, low, unhappy, newcomers };
}

export function renderTalks(game, ui = {}) {
  const sit = teamSituation(game);
  const m = moraleSummary(game);
  const T = game.talks ?? { log: [] };
  const meetingOk = canHoldMeeting(game);
  const left = TALKS_PER_WEEK - talksThisWeek(game);
  const res = ui.ttResult;
  const sugg = talkSuggestions(game);
  const sq = squadOf(game.world, game.clubId).sort((a, b) => (a.morale ?? 12) - (b.morale ?? 12));
  const reasonsOf = new Map(sugg.map((x) => [x.p.id, x.reasons]));
  return `
    <section class="tt-head">
      <div class="kpi"><small>Atmosfera w drużynie</small><b>${esc(moraleLabel(m.avg))}</b><small>${esc(sit.label)}${sit.last.length ? `: ${sit.last.join(' ')}` : ''}</small></div>
      <div class="kpi"><small>Wymaga uwagi</small><b>${m.low + m.unhappy}</b><small>${m.low} z niskim morale, ${m.unhappy} niezadowolonych${m.newcomers ? `, ${m.newcomers} nowych w aklimatyzacji` : ''}</small></div>
    </section>
    ${res ? `<p class="notice" role="status">${esc(res)}</p>` : ''}
    <section class="stat-sec">
      <h3>Zebranie drużyny</h3>
      <p class="hint">${meetingOk ? 'Raz w tygodniu. Dobierz ton do sytuacji. Ta sama przemowa powtarzana co tydzień działa coraz słabiej.' : `Zebranie odbyło się ${esc(fmtDate(T.lastMeeting))}. Następne za kilka dni.`}</p>
      <div class="tt-tones">${Object.entries(MEETING_TONES).map(([k, t]) => `<button class="tone tt-tone" data-act="tt-meet" data-t="${k}" ${meetingOk ? '' : 'disabled'}><strong>${esc(t.label)}</strong><span>${esc(t.quote)}</span><small>${esc(t.hint)}</small></button>`).join('')}</div>
      ${ui.ttMeeting ? `<ul class="players tt-react">${ui.ttMeeting.map((r) => `<li class="prow"><span class="pname">${esc(r.name)}</span><span class="react" data-r="${esc(r.reaction === 'obojetny' ? 'obojętny' : r.reaction === 'urazony' ? 'urażony' : r.reaction)}">${esc(r.label.toLowerCase())}</span></li>`).join('')}</ul>` : ''}
    </section>
    <section class="stat-sec">
      <h3>Rozmowy indywidualne</h3>
      <p class="hint">Zostały ${left} z ${TALKS_PER_WEEK} rozmów w tym tygodniu. Asystent podpowiada, z kim warto porozmawiać.</p>
      <ul class="players">${sq.map((p) => {
        const rs = reasonsOf.get(p.id) ?? [];
        const suggested = rs[0]?.[0] ?? 'encourage';
        return `<li class="prow tt-row" data-pid="${esc(p.id)}">
          <span class="num">${esc(p.pos)}</span>
          <span class="pname">${esc(p.name)}<small>Morale: ${esc(moraleLabel(p.morale ?? 12).toLowerCase())}${p.acclim ? `, aklimatyzacja ${esc(acclimLabel(p.acclim.level))}` : ''}${rs.length ? `. ${esc(rs.map((r) => r[1]).join(', '))}` : ''}</small></span>
          <span class="tt-act"><select class="pick-select" id="tt-${esc(p.id)}" aria-label="Temat rozmowy z: ${esc(p.name)}">${Object.entries(PLAYER_TALKS).map(([k, t]) => `<option value="${k}" ${k === suggested ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
          <button class="btn btn--quiet btn--sm" data-act="tt-talk" data-id="${esc(p.id)}" ${left > 0 ? '' : 'disabled'}>Porozmawiaj</button></span>
        </li>`;
      }).join('')}</ul>
    </section>
    ${T.log.length ? `<section class="stat-sec"><h3>Ostatnie rozmowy</h3><ul class="plain-list">${T.log.slice(0, 8).map((x) => `<li><span class="k">${esc(fmtDate(x.date).replace(/, \d{4}$/, ''))}</span><span>${x.kind === 'meeting' ? `Zebranie (${esc(MEETING_TONES[x.tone].label.toLowerCase())}): ${esc(x.summary)}` : `${esc(game.world.players[x.playerId]?.name ?? '')}, ${esc(PLAYER_TALKS[x.talk].label.toLowerCase())}: ${esc(x.reply)}`}</span></li>`).join('')}</ul></section>` : ''}`;
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
