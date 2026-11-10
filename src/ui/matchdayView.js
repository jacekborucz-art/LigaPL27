// Ekran dnia meczowego (etap 5): studio, odprawa, mecz na żywo (1 minuta = 1 s, GOL 3 s),
// przerwa z odprawą, studio pomeczowe, odprawa pomeczowa i konferencja.
// Logika: src/match/matchday.js; silnik: src/engine/match; wygląd: design/dzien-meczowy.html.

import { esc } from './dom.js';
import { crestHtml } from './crest.js';
import { CLUBS_PL } from '../data/clubs_pl.js';
import { FORMATIONS } from '../data/formations.js';
import { INSTRUCTIONS } from '../data/instructions.js';
import { anyClub, compLabel } from '../season/season.js';
import { statsFromEvents } from '../engine/matchStats.js';
import { onPitch } from '../engine/match/teams.js';
import { substitute, changeTactics, shout, canShout } from '../engine/match/match.js';
import { SHOUTS } from '../engine/match/constants.js';
import { TONES, TALKS, POST_TONES, MAX_TALKS } from '../match/briefings.js';
import * as MD from '../match/matchday.js';

const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const crest = (id, size) => (anyClub(id) ? crestHtml(anyClub(id), { size, clubsById }) : '');
const STEPS = [['studio', 'Studio'], ['odprawa', 'Odprawa'], ['live1', '1. połowa'], ['break', 'Przerwa'], ['odprawa2', 'Odprawa w przerwie'], ['live2', '2. połowa'], ['studio2', 'Studio pomeczowe'], ['odprawa3', 'Odprawa pomeczowa']];
const STEP_INDEX = { studio: 0, odprawa: 1, live1: 2, break: 3, odprawa2: 4, live2: 5, etbreak: 5, fulltime: 5, studio2: 6, odprawa3: 7, press: 7 };
const STAT_ROWS = [['possession', 'Posiadanie %'], ['shots', 'Strzały'], ['onTarget', 'Celne'], ['xg', 'xG'], ['passes', 'Podania'], ['passAccuracy', 'Celność podań %'], ['corners', 'Rożne'], ['throwIns', 'Auty'], ['fouls', 'Faule'], ['offsides', 'Spalone'], ['yellow', 'Żółte kartki'], ['red', 'Czerwone kartki'], ['saves', 'Obrony']];

function luminance(hex) {
  const n = parseInt((hex || '#888888').slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function teamColors(f) {
  const h = anyClub(f.home)?.colors ?? ['#FFD100', '#14211A'];
  const a = anyClub(f.away)?.colors ?? ['#0055A5', '#FFFFFF'];
  // Koszulka nie może zlewać się z murawą ani z rywalem
  const grass = (c) => { const n = parseInt(c.slice(1), 16); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return g > r + 25 && g > b + 10 && luminance(c) < 0.45; };
  const home = grass(h[0]) && h[1] ? h[1] : h[0];
  let away = grass(a[0]) && a[1] ? a[1] : a[0];
  if (Math.abs(luminance(home) - luminance(away)) < 0.18) away = [a[1], a[0], '#FFFFFF', '#14211A'].find((c) => c && !grass(c) && Math.abs(luminance(home) - luminance(c)) >= 0.18) ?? '#FFFFFF';
  const ink = (c) => (luminance(c) > 0.5 ? '#14211A' : '#FFFFFF');
  return { home, homeInk: ink(home), away, awayInk: ink(away) };
}

/**
 * Uruchamia dzień meczowy w kontenerze app. ctx: { game, fixture, save, onExit }.
 */
export function mountMatchday(app, { game, fixture, save, onExit }) {
  const S = MD.startMatchday(game, fixture);
  const ui = { speed: 1, running: false, timer: null, sel: {}, tab: 'stats', overlay: null, adv: null, dialog: null, raf: null, dots: [] };
  const colors = teamColors(fixture);
  app.style.setProperty('--home', colors.home); app.style.setProperty('--home-ink', colors.homeInk);
  app.style.setProperty('--away', colors.away); app.style.setProperty('--away-ink', colors.awayInk);

  const userName = anyClub(game.clubId).name;
  const sideName = (s) => anyClub(s === 0 ? fixture.home : fixture.away)?.name ?? '';
  const shortName = (s) => anyClub(s === 0 ? fixture.home : fixture.away)?.short ?? '';

  function shell(body, action) {
    const idx = STEP_INDEX[S.step] ?? 0;
    app.innerHTML = `<div class="md">
      <ol class="rail" aria-label="Przebieg dnia meczowego">${STEPS.map(([, l], i) => `<li><button tabindex="-1" ${i === idx ? 'aria-current="step"' : ''} class="${i < idx ? 'done' : ''}"><span class="n">${i + 1}</span>${esc(l)}</button></li>`).join('')}</ol>
      <main class="md__main">${body}</main>
      <div class="actionbar">${action ?? ''}</div>
    </div>`;
    app.querySelector('.rail [aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  const btn = (act, label, primary = true) => `<button class="btn ${primary ? 'btn--primary' : 'btn--quiet'}" data-md="${act}">${esc(label)}</button>`;

  // ------------------------------------------------------------ Studio przedmeczowe
  function renderStudio() {
    const p = S.pre;
    const form = (r) => `<span class="form">${r.results.map((c) => `<b class="${c}">${c}</b>`).join('')}</span>`;
    const absList = (a) => [...a.injured.map((x) => `${x.name} (${x.pos}), uraz, ok. ${x.days} dni`), ...a.suspended.map((x) => `${x.name} (${x.pos}), pauza`)];
    const absH = absList(p.absences.home); const absA = absList(p.absences.away);
    const c = p.conditions;
    shell(`
      <h1>Studio przedmeczowe</h1>
      <div class="fixture">
        <div class="fixture__team">${crest(fixture.home, 64)}${esc(p.preview.home.name)}</div>
        <div class="fixture__mid"><span class="led">${esc(fixture.time ?? '')}</span></div>
        <div class="fixture__team">${crest(fixture.away, 64)}${esc(p.preview.away.name)}</div>
      </div>
      <p class="fixture__meta">${esc(compLabel(fixture))}, ${esc(p.date)}. ${esc(p.preview.rank.label)}.</p>
      <div class="studio-cols">
      <section class="sec"><h2>Szanse</h2>
        <div class="odds" role="img" aria-label="Szanse: gospodarze ${Math.round(p.odds.home * 100)}, remis ${Math.round(p.odds.draw * 100)}, goście ${Math.round(p.odds.away * 100)} procent">
          <span class="h" style="width:${p.odds.home * 100}%">${Math.round(p.odds.home * 100)}%</span><span class="d" style="width:${p.odds.draw * 100}%">${Math.round(p.odds.draw * 100)}%</span><span class="a" style="width:${p.odds.away * 100}%">${Math.round(p.odds.away * 100)}%</span>
        </div>
        <div class="odds-legend"><span>${esc(shortName(0))}</span><span>Remis</span><span>${esc(shortName(1))}</span></div>
      </section>
      <section class="sec"><h2>Forma i tabela</h2>
        <div class="form-row"><span>${crest(fixture.home, 22)} ${p.preview.home.position ? `${p.preview.home.position}. miejsce, ${p.preview.home.points} pkt` : esc(p.preview.home.name)}</span>${form(p.preview.home.form)}</div>
        <div class="form-row"><span>${crest(fixture.away, 22)} ${p.preview.away.position ? `${p.preview.away.position}. miejsce, ${p.preview.away.points} pkt` : esc(p.preview.away.name)}</span>${form(p.preview.away.form)}</div>
        <p class="hint">${p.preview.h2h.played ? `Bilans w tym sezonie: ${p.preview.h2h.homeWins} wygrane gospodarzy, ${p.preview.h2h.draws} remisy, ${p.preview.h2h.awayWins} wygrane gości.` : 'Pierwsze spotkanie tych drużyn w sezonie.'}</p>
      </section>
      <section class="sec"><h2>Absencje</h2>
        <ul class="plain-list"><li><span class="k">${esc(shortName(0))}</span><span>${esc(absH.join('; ') || 'Bez absencji')}</span></li><li><span class="k">${esc(shortName(1))}</span><span>${esc(absA.join('; ') || 'Bez absencji')}</span></li></ul>
      </section>
      <section class="sec"><h2>Warunki</h2>
        <ul class="plain-list">
          <li><span class="k">Pogoda</span><span>${esc(c.weather.label)}${c.weather.tempC != null ? `, ${c.weather.tempC}°C` : ''}${c.weather.notes.length ? `. ${esc(c.weather.notes.join(' '))}` : ''}</span></li>
          <li><span class="k">Murawa</span><span>${esc(c.pitch.label)}${c.pitch.note ? `. ${esc(c.pitch.note)}` : ''}</span></li>
          <li><span class="k">Sędzia</span><span>${esc(c.referee.name)}, ${esc(c.referee.label.toLowerCase())}: średnio ${String(c.referee.expectedYellows).replace('.', ',')} żółtej kartki na mecz${c.referee.var ? ', VAR' : ''}</span></li>
          <li><span class="k">Kibice</span><span>Ok. ${c.attendance.expected.toLocaleString('pl-PL')} na ${c.attendance.capacity.toLocaleString('pl-PL')} miejsc</span></li>
        </ul>
      </section>
      <section class="sec"><h2>Raport asystenta</h2>
        <blockquote class="assistant">${esc(p.assistant.style)} ${esc([...(p.assistant.counters ?? [])].map((x) => x.text ?? x).join(' '))} ${esc(p.assistant.strength.notes.join(' '))}
          ${p.keyPlayers.opponent.length ? `<br><br>Kluczowi zawodnicy rywala: ${esc(p.keyPlayers.opponent.map((k) => `${k.name} (${k.pos})`).join(', '))}.` : ''}
          ${p.suspensionRisk.user.length ? `<br><br>${esc(p.suspensionRisk.user.map((x) => x.text).join('. '))}.` : ''}
          <footer>Asystent trenera</footer></blockquote>
      </section>
      <section class="sec"><h2>Oczekiwania</h2>
        <ul class="plain-list"><li><span class="k">Zarząd</span><span>${esc(p.expectations.board)}</span></li><li><span class="k">Kibice</span><span>${esc(p.expectations.fans)}</span></li>${p.expectations.notes.map((n) => `<li><span class="k"></span><span>${esc(n)}</span></li>`).join('')}</ul>
      </section>
      </div>
      <section class="sec"><h2>Nagłówki dnia</h2><ul class="headlines">${p.headlines.map((h) => `<li>${esc(h.text)}</li>`).join('')}</ul></section>`,
      btn('toBriefing', 'Przejdź do odprawy'));
  }

  // ------------------------------------------------------------ Odprawy
  function renderTalk(phase) {
    const players = phase === 'pre' ? MD.matchSquadPlayers(game, S) : phase === 'half' ? onPitch(S.M.teams[S.userSide], S.M.minute).map((x) => x.p) : S.result.ratings.filter((x) => x.side === S.userSide).map((r) => game.world.players[r.id]).filter(Boolean);
    const done = S.briefings[phase];
    const tones = phase === 'post' ? POST_TONES : TONES;
    if (!ui.adv && phase !== 'post') ui.adv = phase === 'pre' ? MD.preAdvice(game, S) : MD.halfAdvice(game, S);
    const chosen = done?.tone ?? ui.sel.tone ?? ui.adv?.tone ?? Object.keys(tones)[0];
    const talks = Object.entries(TALKS).filter(([, t]) => t.phases.includes(phase));
    const ctxText = phase === 'pre' ? `${S.pre.preview.rank.label}. ${S.pre.expectations.board}`
      : phase === 'half' ? `Przerwa przy ${S.M.score[0]}:${S.M.score[1]}. Zmiany w przerwie nie zużywają okna.`
        : `${S.post.result.label} ${S.post.result.score}. ${S.post.reactions.board.text}`;
    const reactionOf = (id) => done?.players.find((r) => r.id === id);
    const title = { pre: 'Odprawa przedmeczowa', half: 'Odprawa w przerwie', post: 'Odprawa pomeczowa' }[phase];
    shell(`
      <h1>${title}</h1>
      <p class="talk-ctx">${esc(ctxText)}</p>
      ${ui.adv && !done ? `<blockquote class="assistant">${esc(ui.adv.text)} Zalecana przemowa: ${esc(ui.adv.toneLabel)}.<footer>Asystent trenera</footer></blockquote>` : ''}
      ${done?.team?.backfireText ? `<p class="notice notice--err">${esc(done.team.backfireText)}</p>` : ''}
      ${done?.team?.summary ? `<p class="notice">${esc(done.team.summary)}</p>` : ''}
      <h2>Przemowa do drużyny</h2>
      <fieldset class="tones" ${done ? 'disabled' : ''}>
        <legend class="hint">Wybierz ton. Ta sama przemowa powtarzana mecz po meczu działa słabiej.</legend>
        ${Object.entries(tones).map(([id, t]) => `<label class="tone"><input type="radio" name="tone" value="${id}" ${id === chosen ? 'checked' : ''} data-md-tone="${id}"><div><strong>${esc(t.label)}${ui.adv?.tone === id && !done ? ' (zalecana)' : ''}</strong><span>${esc(t.quote)}</span></div></label>`).join('')}
      </fieldset>
      <h2>Rozmowy indywidualne</h2>
      <p class="hint">Maksymalnie ${MAX_TALKS} zawodników.${ui.adv?.talks?.length && !done ? ` Asystent proponuje: ${esc(ui.adv.talks.map((t) => t.reason).join(' '))}` : ''}</p>
      <ul class="players">${players.map((p, i) => {
        const r = reactionOf(p.id);
        const head = phase === 'pre' && i === game.tactics.xi.length ? '<li class="sub-head">Rezerwowi</li>' : phase === 'pre' && i === 0 ? '<li class="sub-head">Pierwszy skład</li>' : '';
        return `${head}<li class="prow"><span class="num">${esc(p.pos)}</span><span class="pname">${esc(p.name)}<small>${esc(p.persona ?? '')}${r?.talk ? `: „${esc(r.talk.quote.replace(/[„”]/g, ''))}”` : ''}</small></span>
          ${r ? `<span class="react" data-r="${esc(r.reaction === 'obojetny' ? 'obojętny' : r.reaction === 'urazony' ? 'urażony' : r.reaction)}" title="${esc(r.text)}">${esc(r.label.toLowerCase())}</span>`
    : `<select class="pick-select" data-md-talk="${esc(p.id)}" aria-label="Rozmowa z: ${esc(p.name)}"><option value="">Bez rozmowy</option>${talks.map(([k, t]) => `<option value="${k}" ${ui.sel.talks?.[p.id] === k ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>`}
        </li>`;
      }).join('')}</ul>
      ${phase === 'post' && done && S.press && !S.pressResult ? renderPressForm() : ''}
      ${S.pressResult ? `<p class="notice">${esc(S.pressResult.text)}</p>` : ''}`,
      done ? (phase === 'pre' ? btn('kickoff', 'Wyjdź na boisko') : phase === 'half' ? btn('resume', 'Rozpocznij 2. połowę') : (S.pressResult ? btn('exit', 'Zakończ dzień meczowy') : btn('press', 'Odpowiedz na pytania') + btn('exit', 'Pomiń konferencję', false)))
        : btn(`speech:${phase}`, 'Wygłoś odprawę'));
    const selects = [...app.querySelectorAll('[data-md-talk]')];
    const sync = () => { const used = selects.filter((s) => s.value).length; selects.forEach((s) => { s.disabled = !s.value && used >= MAX_TALKS; }); };
    selects.forEach((s) => s.addEventListener('change', () => { ui.sel.talks = { ...(ui.sel.talks || {}), [s.dataset.mdTalk]: s.value }; sync(); }));
    app.querySelectorAll('[data-md-tone]').forEach((r) => r.addEventListener('change', () => { ui.sel.tone = r.value; }));
    sync();
  }

  function renderPressForm() {
    return `<h2>Konferencja prasowa</h2>${S.press.map((q) => `<fieldset class="qa"><p>${esc(q.question)}</p>${q.answers.map((a) => `<label class="tone"><input type="radio" name="q-${esc(q.id)}" value="${a.i}" ${a.i === 0 ? 'checked' : ''}><div><strong>${esc(a.text)}</strong></div></label>`).join('')}</fieldset>`).join('')}`;
  }

  // ------------------------------------------------------------ Mecz na żywo
  function renderLive() {
    const M = S.M;
    shell(`
      <div class="live">
        <div class="board" aria-live="off">
          <div class="board__t">${crest(fixture.home, 30)}<span>${esc(shortName(0))}</span></div>
          <div><div class="board__score" id="mdScore">${M.score[0]}:${M.score[1]}</div><span class="board__min" id="mdMin">${esc(M.events[M.events.length - 1]?.min ?? "0'")}</span></div>
          <div class="board__t"><span>${esc(shortName(1))}</span>${crest(fixture.away, 30)}</div>
        </div>
        <div class="mom-area">
          <svg class="momentum" id="mdMom" viewBox="0 0 96 56" preserveAspectRatio="none" role="img" aria-label="Momentum meczu"></svg>
          <div class="poss" style="margin-top:8px"><span id="mdPh">50%</span><div class="bar2"><i class="bh" id="mdPbh" style="width:50%"></i><i class="ba" id="mdPba" style="width:50%"></i></div><span id="mdPa">50%</span></div>
        </div>
        <div class="pitch-area pitch-wrap"><canvas class="pitch" id="mdPitch" aria-label="Boisko"></canvas></div>
        <div class="ctrl-area"><div class="controls">
          <button class="btn btn--quiet" data-md="pause" id="mdPause">${ui.running ? 'Pauza' : 'Start'}</button>
          <button class="btn btn--quiet speed" data-md="speed:1" aria-pressed="${ui.speed === 1}">x1</button>
          <button class="btn btn--quiet speed" data-md="speed:4" aria-pressed="${ui.speed === 4}">x4</button>
          <button class="btn btn--quiet" data-md="dlg:subs">Zmiany</button>
          <button class="btn btn--quiet" data-md="dlg:tactics">Taktyka</button>
          <button class="btn btn--quiet" data-md="dlg:shout">Okrzyk</button>
        </div></div>
        <div class="feed-area"><h2>Relacja</h2><ul class="feed" id="mdFeed"></ul></div>
        <div class="side-area"><div class="tabs2" role="tablist">
          <button role="tab" data-md="tab:stats" aria-selected="${ui.tab === 'stats'}">Statystyki</button>
          <button role="tab" data-md="tab:lineups" aria-selected="${ui.tab === 'lineups'}">Składy</button></div><div id="mdSide"></div></div>
      </div>
      <div class="goal" id="mdGoal" role="status"><div><b id="mdGoalTitle">GOL</b><small id="mdGoalWho"></small></div></div>
      <dialog id="mdDlg" class="panel md-dlg"></dialog>`,
      btn('skip', S.step === 'live1' ? 'Pokaż wynik do przerwy' : 'Pokaż wynik od razu', false));
    setupCanvas();
    updateLive();
  }

  function updateLive(newEvents = []) {
    const M = S.M;
    const q = (id) => app.querySelector(id);
    if (!q('#mdScore')) return;
    q('#mdScore').textContent = `${M.score[0]}:${M.score[1]}`;
    q('#mdMin').textContent = M.events[M.events.length - 1]?.min ?? "0'";
    const stats = statsFromEvents(M.events);
    q('#mdPh').textContent = `${stats[0].possession}%`; q('#mdPa').textContent = `${stats[1].possession}%`;
    q('#mdPbh').style.width = `${stats[0].possession}%`; q('#mdPba').style.width = `${stats[1].possession}%`;
    // Momentum
    const mom = M.momentum; const w = Math.max(96, mom.length + 1);
    q('#mdMom').setAttribute('viewBox', `0 0 ${w} 56`);
    let bars = `<line x1="0" y1="28" x2="${w}" y2="28" stroke="currentColor" stroke-opacity=".25" stroke-width=".4"/>`;
    mom.forEach((v, i) => { const h = Math.abs(v) / 100 * 26; bars += `<rect x="${i + 0.1}" y="${v >= 0 ? 28 - h : 28}" width=".8" height="${Math.max(0.5, h)}" fill="${v >= 0 ? 'var(--home)' : 'var(--away)'}"/>`; });
    for (const e of M.events.filter((x) => x.type === 'goal' && !x.provisional)) bars += `<rect x="${e.t - 0.6}" y="${e.side === 0 ? 0 : 50}" width="1.2" height="6" fill="var(--led)"/>`;
    q('#mdMom').style.color = 'var(--text)'; q('#mdMom').innerHTML = bars;
    // Relacja
    const feed = M.events.filter((e) => e.text && !['possessionMinute'].includes(e.type)).slice(-60).reverse();
    q('#mdFeed').innerHTML = feed.map((e) => `<li class="${e.type === 'goal' && !e.provisional ? 'goalrow' : ''}"><span class="m">${esc(e.min)}</span><span>${e.side != null ? `<b>${esc(shortName(e.side))}</b> ` : ''}${e.type === 'yellow' ? '<i class="card-ico y" aria-hidden="true"></i>' : e.type === 'red' ? '<i class="card-ico r" aria-hidden="true"></i>' : ''}${esc(e.text)}</span></li>`).join('') || `<li><span class="m"></span><span class="hint">Naciśnij Start. 1 minuta meczu trwa 1 sekundę.</span></li>`;
    // Statystyki albo składy
    const side = q('#mdSide');
    if (ui.tab === 'stats') {
      side.innerHTML = `<table class="vs"><tbody>${STAT_ROWS.map(([k, l]) => { const a = Number(stats[0][k]); const b = Number(stats[1][k]); const t = a + b || 1; return `<tr><td>${stats[0][k]}</td><td class="lbl">${esc(l)}<div class="bar2"><i class="bh" style="width:${a / t * 100}%"></i><i class="ba" style="width:${b / t * 100}%"></i></div></td><td>${stats[1][k]}</td></tr>`; }).join('')}</tbody></table>`;
    } else {
      const rows = (T) => onPitch(T, M.minute).map((x) => `<li><span class="k">${esc(x.slot.pos)}</span><span>${esc(x.p.name)}${x.yc ? ' <i class="card-ico y"></i>' : ''}${x.injury ? ' (uraz)' : ''}</span><span class="hint">${Math.round(x.cond)}%</span></li>`).join('');
      side.innerHTML = `<h3>${esc(sideName(0))}</h3><ul class="plain-list">${rows(M.teams[0])}</ul><h3>${esc(sideName(1))}</h3><ul class="plain-list">${rows(M.teams[1])}</ul>`;
    }
    layoutDots();
    // GOL i VAR
    const goalEv = newEvents.find((e) => e.type === 'goal');
    const varEv = newEvents.find((e) => e.type === 'varOverturn' || e.type === 'varCheck');
    if (goalEv || varEv) {
      const ov = q('#mdGoal');
      q('#mdGoalTitle').textContent = goalEv && !newEvents.some((e) => e.type === 'varOverturn') ? 'GOL' : 'VAR';
      q('#mdGoalWho').textContent = (goalEv && !newEvents.some((e) => e.type === 'varOverturn')) ? `${goalEv.text.replace(/^GOL! /, '')} ${sideName(goalEv.side)}` : (newEvents.find((e) => e.type === 'varOverturn')?.text ?? varEv.text);
      ov.classList.add('on');
      setTimeout(() => ov.classList.remove('on'), goalEv ? 3000 : 2000);
    }
  }

  // Boisko w canvasie: ustawienie z formacji, przesunięcie wg posiadania
  let canvas; let ctx2d; let ro;
  function setupCanvas() {
    canvas = app.querySelector('#mdPitch');
    ctx2d = canvas.getContext('2d');
    ro?.disconnect();
    ro = new ResizeObserver(() => { const dpr = Math.min(2, devicePixelRatio || 1); const r = canvas.getBoundingClientRect(); canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0); drawPitch(); });
    ro.observe(canvas);
  }
  function layoutDots() {
    const M = S.M; const poss = M.possession[M.possession.length - 1] ?? 0.5; const homeBall = M.ai === 0;
    const next = [];
    for (const T of M.teams) {
      onPitch(T, M.minute).forEach((x, i) => {
        const s = x.slot; const shift = s.pos === 'BR' ? 0 : (T.side === 0) === homeBall ? 10 : -3;
        let sy = 96 - (s.y + shift) * 0.5; let sx = s.x;
        if (T.side === 1) { sy = 100 - sy; sx = 100 - sx; }
        const j = Math.sin(M.tick * 1.7 + i * 3.1) * 2;
        next.push({ id: x.id, side: T.side, x: sx + j, y: sy + Math.cos(M.tick + i) * 1.5, label: x.slot.pos === 'BR' ? 'BR' : String(i + 1) });
      });
    }
    void poss;
    const prev = new Map(ui.dots.map((d) => [d.id, d]));
    ui.dots = next.map((d) => ({ ...d, fx: prev.get(d.id)?.x ?? d.x, fy: prev.get(d.id)?.y ?? d.y }));
    cancelAnimationFrame(ui.raf);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now(); const dur = Math.min(800, 900 / ui.speed);
    const frame = (now) => { const k = reduce ? 1 : Math.min(1, (now - t0) / dur); const e = k * (2 - k); drawPitch(e); if (k < 1) ui.raf = requestAnimationFrame(frame); };
    ui.raf = requestAnimationFrame(frame);
  }
  function drawPitch(e = 1) {
    if (!ctx2d) return;
    const r = canvas.getBoundingClientRect(); const W = r.width; const H = r.height;
    const X = (x) => (x / 100) * W; const Y = (y) => (y / 100) * H;
    ctx2d.clearRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) { ctx2d.fillStyle = i % 2 ? '#25793F' : '#1E6B3A'; ctx2d.fillRect(0, (i * H) / 12, W, H / 12 + 1); }
    ctx2d.strokeStyle = 'rgba(243,246,241,.85)'; ctx2d.lineWidth = 1.5;
    ctx2d.strokeRect(X(4), Y(2.8), X(92), Y(94.4));
    ctx2d.beginPath(); ctx2d.moveTo(X(4), Y(50)); ctx2d.lineTo(X(96), Y(50)); ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.arc(X(50), Y(50), W * 0.13, 0, Math.PI * 2); ctx2d.stroke();
    for (const top of [true, false]) { const y0 = top ? Y(2.8) : Y(97.2); const d = top ? 1 : -1; ctx2d.strokeRect(X(21), y0, X(58), d * H * 0.16); ctx2d.strokeRect(X(37), y0, X(26), d * H * 0.055); }
    const rad = Math.max(9, Math.min(14, W * 0.032));
    ctx2d.font = `700 ${Math.round(rad * 1.0)}px "Barlow Condensed", sans-serif`; ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
    for (const d of ui.dots) {
      const x = d.fx + (d.x - d.fx) * e; const y = d.fy + (d.y - d.fy) * e;
      ctx2d.beginPath(); ctx2d.arc(X(x), Y(y), rad, 0, Math.PI * 2);
      ctx2d.fillStyle = d.side === 0 ? colors.home : colors.away; ctx2d.fill();
      ctx2d.lineWidth = 1.5; ctx2d.strokeStyle = d.side === 0 ? colors.homeInk : colors.awayInk; ctx2d.stroke();
      ctx2d.fillStyle = d.side === 0 ? colors.homeInk : colors.awayInk; ctx2d.fillText(d.label, X(x), Y(y) + 1);
    }
  }

  function loop() {
    if (!ui.running) return;
    const r = MD.tick(S);
    updateLive(r.events);
    if (S.step !== 'live1' && S.step !== 'live2') { stop(); return route(); }
    const pause = (r.pause ?? 0) * 1000;
    ui.timer = setTimeout(loop, Math.max(pause, 1000 / ui.speed));
  }
  function start() { ui.running = true; const b = app.querySelector('#mdPause'); if (b) b.textContent = 'Pauza'; ui.timer = setTimeout(loop, 1000 / ui.speed); }
  function stop() { ui.running = false; clearTimeout(ui.timer); const b = app.querySelector('#mdPause'); if (b) b.textContent = 'Wznów'; }

  // ------------------------------------------------------------ Dialogi w meczu
  function openDialog(kind) {
    const dlg = app.querySelector('#mdDlg');
    const M = S.M; const T = M.teams[S.userSide];
    let html = '';
    if (kind === 'subs') {
      const out = T.players.filter((x) => (x.on || x.injury) && !x.sentOff && !x.subbedOff);
      html = `<h2>Zmiany</h2><p class="hint">Wykorzystano ${T.subsUsed} z ${T.subsLimit} zmian i ${T.windowsUsed} z ${T.windowsLimit} okien.${M.phase === 'break' ? ' Zmiany w przerwie nie zużywają okna.' : ''}</p>
        <label class="role"><span>Schodzi</span><select id="mdOut">${out.map((x) => `<option value="${esc(x.id)}">${esc(x.slot?.pos ?? '')} ${esc(x.p.name)}, kondycja ${Math.round(x.cond)}%${x.injury ? ', uraz' : ''}${x.yc ? ', żółta kartka' : ''}</option>`).join('')}</select></label>
        <label class="role"><span>Wchodzi</span><select id="mdIn">${T.bench.map((x) => `<option value="${esc(x.id)}">${esc(x.p.pos)} ${esc(x.p.name)}, OVR ${x.p.ovr.toFixed(1)}</option>`).join('')}</select></label>
        <p id="mdDlgMsg" class="hint"></p><p class="tac__actions">${btn('doSub', 'Wykonaj zmianę')}${btn('closeDlg', 'Zamknij', false)}</p>`;
    } else if (kind === 'tactics') {
      const keys = ['mentality', 'pressing', 'tempo', 'passing', 'line', 'tackling', 'timewasting'];
      html = `<h2>Taktyka</h2><p class="hint">Zmiana działa w pełni po kilku minutach. Kolejna zmiana w ciągu 10 minut kosztuje podwójnie. Spójność: ${Math.round(T.S)} na 100.</p>
        <label class="role"><span>Ustawienie</span><select id="mdForm">${FORMATIONS.map((f) => `<option value="${f.id}" ${f.id === T.formation.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
        ${keys.map((k) => { const ins = INSTRUCTIONS.find((i) => i.id === k); return `<label class="role"><span>${esc(ins.label)}</span><select data-ins="${k}">${ins.options.map((o) => `<option value="${o.id}" ${T.tactics.instructions[k] === o.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`; }).join('')}
        <p id="mdDlgMsg" class="hint"></p><p class="tac__actions">${btn('doTactics', 'Zastosuj')}${btn('closeDlg', 'Zamknij', false)}</p>`;
    } else {
      html = `<h2>Okrzyk z linii bocznej</h2><ul class="plain-list">${Object.entries(SHOUTS).map(([k, s]) => { const err = canShout(M, S.userSide, k); return `<li><button class="btn btn--quiet" data-md="doShout:${k}" ${err ? 'disabled' : ''}>${esc(s.label)}</button><span class="hint">${esc(err ?? '')}</span></li>`; }).join('')}</ul>
        <p id="mdDlgMsg" class="hint"></p><p>${btn('closeDlg', 'Zamknij', false)}</p>`;
    }
    dlg.innerHTML = html;
    if (!dlg.open) dlg.showModal();
  }

  // ------------------------------------------------------------ Przerwa, dogrywka, studio pomeczowe
  function renderBreak() {
    const h = MD.halfInfo(S);
    const ratings = Object.entries(h.ratings).map(([id, r]) => [S.M.teams[S.userSide].players.find((x) => x.id === id), r]).filter(([x]) => x).sort((a, b) => b[1] - a[1]);
    shell(`
      <h1>${S.step === 'etbreak' ? 'Przerwa przed dogrywką' : 'Przerwa'}</h1>
      <div class="board" style="margin-bottom:16px"><div class="board__t">${crest(fixture.home, 30)}<span>${esc(shortName(0))}</span></div><div><div class="board__score">${S.M.score[0]}:${S.M.score[1]}</div><span class="board__min">${S.step === 'etbreak' ? 'Dogrywka' : 'Przerwa'}</span></div><div class="board__t"><span>${esc(shortName(1))}</span>${crest(fixture.away, 30)}</div></div>
      <div class="studio-cols">
        <section class="sec"><h2>Statystyki</h2><table class="vs"><tbody>${STAT_ROWS.map(([k, l]) => `<tr><td>${h.stats[0][k]}</td><td class="lbl">${esc(l)}</td><td>${h.stats[1][k]}</td></tr>`).join('')}</tbody></table></section>
        <section class="sec"><h2>Oceny</h2><ul class="ratings">${ratings.map(([x, r]) => `<li><span>${esc(x.p.last ?? x.p.name)}</span><b>${r.toFixed(1)}</b></li>`).join('')}</ul></section>
      </div>`,
      S.step === 'etbreak' ? btn('resumeET', 'Rozpocznij dogrywkę') + btn('dlg:subs', 'Zmiany', false) : btn('toHalfTalk', 'Odprawa w przerwie') + btn('dlg:subs', 'Zmiany', false));
    if (!app.querySelector('#mdDlg')) app.insertAdjacentHTML('beforeend', '<dialog id="mdDlg" class="panel md-dlg"></dialog>');
  }

  function renderPost() {
    const p = S.post; const r = S.result;
    shell(`
      <h1>Studio pomeczowe</h1>
      <div class="final"><div class="board"><div class="board__t">${crest(fixture.home, 34)}<span>${esc(shortName(0))}</span></div><div><div class="board__score">${r.score[0]}:${r.score[1]}</div><span class="board__min">${r.shootout ? `karne ${r.shootout.goals[0]}:${r.shootout.goals[1]}` : r.extraTime ? 'po dogrywce' : 'Koniec'}</span></div><div class="board__t"><span>${esc(shortName(1))}</span>${crest(fixture.away, 34)}</div></div>
        <p class="hint">Do przerwy ${esc(p.result.halftime)}. ${esc(p.stats.verdict)}</p></div>
      ${p.motm ? `<div class="mvp"><div><small style="opacity:.75">Zawodnik meczu</small><br><strong style="font:700 var(--step-2)/1.1 var(--font-display)">${esc(p.motm.name)}</strong><br><small style="opacity:.75">${esc(p.motm.team)}</small></div><span class="r">${p.motm.rating.toFixed(1)}</span></div>` : ''}
      <div class="studio-cols">
        <section class="sec"><h2>Kluczowe momenty</h2><ul class="moments">${p.keyMoments.map((m) => { const [, min, rest] = /^(\S+')\s(.*)$/.exec(m.text) ?? [null, '', m.text]; return `<li><span class="m">${esc(min)}</span><span>${esc(rest)}</span></li>`; }).join('') || '<li><span></span><span>Mecz bez wielkich emocji.</span></li>'}</ul>
          ${p.controversies.length ? `<h3>Kontrowersje</h3><ul class="plain-list">${p.controversies.map((c) => `<li><span>${esc(c.text)}</span></li>`).join('')}</ul>` : ''}</section>
        <section class="sec"><h2>Statystyki</h2><table class="vs"><tbody>${STAT_ROWS.map(([k, l]) => `<tr><td>${p.stats.home[k]}</td><td class="lbl">${esc(l)}</td><td>${p.stats.away[k]}</td></tr>`).join('')}</tbody></table></section>
        <section class="sec"><h2>Reakcje</h2><ul class="plain-list"><li><span class="k">Zarząd</span><span>${esc(p.reactions.board.text)}</span></li><li><span class="k">Kibice</span><span>${esc(p.reactions.fans.text)}</span></li><li><span class="k">Media</span><span>${esc(p.reactions.media.text)}</span></li></ul>
          ${p.headline ? `<ul class="headlines"><li>${esc(p.headline.text)}<small>Nagłówek dnia</small></li></ul>` : ''}</section>
        <section class="sec"><h2>Po meczu</h2><ul class="plain-list">${[...p.injuries.map((x) => x.text), ...p.suspensions.map((x) => `${x.name} (${x.team}) pauzuje: ${x.reason}`)].map((t) => `<li><span>${esc(t)}</span></li>`).join('') || '<li><span>Bez nowych kontuzji i pauz.</span></li>'}</ul>
          ${p.table ? `<p class="hint">Miejsce w tabeli: ${p.table.user.before ?? '-'} przed meczem, ${p.table.user.after} po meczu.</p>` : ''}</section>
      </div>
      <section class="sec"><h2>Oceny: ${esc(userName)}</h2><ul class="ratings">${(S.userSide === 0 ? p.ratings.home : p.ratings.away).map((x) => `<li><span>${esc(x.name)}</span><b>${x.rating.toFixed(1)}</b></li>`).join('')}</ul></section>`,
      btn('toPostTalk', 'Odprawa pomeczowa'));
  }

  function route() {
    window.scrollTo({ top: 0 });
    if (S.step === 'studio') return renderStudio();
    if (S.step === 'odprawa') return renderTalk('pre');
    if (S.step === 'live1' || S.step === 'live2') return renderLive();
    if (S.step === 'break' || S.step === 'etbreak') return renderBreak();
    if (S.step === 'odprawa2') return renderTalk('half');
    if (S.step === 'fulltime') { MD.finishMatchday(game, S); save(); return renderPost(); }
    if (S.step === 'studio2') return renderPost();
    if (S.step === 'odprawa3') return renderTalk('post');
    return null;
  }

  async function onClick(ev) {
    const el = ev.target.closest('[data-md]');
    if (!el) return;
    const [act, arg] = el.dataset.md.split(':');
    const M = S.M;
    if (act === 'toBriefing') { S.step = 'odprawa'; ui.adv = null; ui.sel = {}; route(); }
    if (act === 'speech') {
      const tone = app.querySelector('input[name="tone"]:checked')?.value;
      const talks = Object.entries(ui.sel.talks || {}).filter(([, k]) => k).map(([id, kind]) => ({ id, kind }));
      if (arg === 'pre') MD.doPreBriefing(game, S, tone, talks);
      if (arg === 'half') MD.doHalfBriefing(game, S, tone, talks);
      if (arg === 'post') MD.doPostBriefing(game, S, tone, talks);
      ui.sel = {}; await save(); renderTalk(arg);
    }
    if (act === 'kickoff') { MD.kickOff(game, S); route(); }
    if (act === 'pause') (ui.running ? stop() : start());
    if (act === 'speed') { ui.speed = Number(arg); app.querySelectorAll('.speed').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.md === `speed:${arg}`))); if (ui.running) { stop(); start(); } }
    if (act === 'tab') { ui.tab = arg; app.querySelectorAll('[data-md^="tab:"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.md === `tab:${arg}`))); updateLive(); }
    if (act === 'skip') { stop(); MD.skip(S); route(); }
    if (act === 'dlg') { if (ui.running) stop(); openDialog(arg); }
    if (act === 'closeDlg') app.querySelector('#mdDlg')?.close();
    if (act === 'doSub') {
      const r = substitute(M, S.userSide, app.querySelector('#mdOut').value, app.querySelector('#mdIn').value);
      if (!r.ok) app.querySelector('#mdDlgMsg').textContent = r.error;
      else { openDialog('subs'); app.querySelector('#mdDlgMsg').textContent = 'Zmiana wykonana.'; if (S.step.startsWith('live')) updateLive(); }
    }
    if (act === 'doTactics') {
      const instructions = Object.fromEntries([...app.querySelectorAll('[data-ins]')].map((s) => [s.dataset.ins, s.value]));
      const formation = app.querySelector('#mdForm').value;
      const r = changeTactics(M, S.userSide, { formation, instructions });
      app.querySelector('#mdDlgMsg').textContent = r.adapt ? `Zmiana wejdzie w pełni po ok. ${Math.round(r.adapt)} min. Koszt spójności: ${r.cost}.` : 'Zmiana obowiązuje od razu.';
      updateLive();
    }
    if (act === 'doShout') { const r = shout(M, S.userSide, arg); app.querySelector('#mdDlgMsg').textContent = r.ok ? 'Drużyna usłyszała okrzyk.' : r.error; updateLive(); }
    if (act === 'toHalfTalk') { S.step = 'odprawa2'; ui.adv = null; ui.sel = {}; route(); }
    if (act === 'resume' || act === 'resumeET') { MD.continueAfterBreak(S); route(); }
    if (act === 'toPostTalk') { S.step = 'odprawa3'; ui.sel = {}; ui.adv = null; route(); }
    if (act === 'press') {
      const choices = Object.fromEntries(S.press.map((q) => [q.id, Number(app.querySelector(`input[name="q-${q.id}"]:checked`)?.value ?? 0)]));
      MD.doPress(game, S, choices); await save(); renderTalk('post');
    }
    if (act === 'exit') { stop(); MD.closeMatchday(game, S); cleanup(); await save(); onExit(); }
  }

  function onKey(ev) { if (ev.key === ' ' && S.step.startsWith('live') && !ev.target.closest('input,select,button,dialog')) { ev.preventDefault(); ui.running ? stop() : start(); } }
  function cleanup() {
    app.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey);
    ro?.disconnect(); cancelAnimationFrame(ui.raf);
    for (const k of ['--home', '--home-ink', '--away', '--away-ink']) app.style.removeProperty(k);
  }
  app.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  route();
  return { session: S, stop, cleanup };
}
