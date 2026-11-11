// Ekran dnia meczowego (etap 5): studio, odprawa, mecz na żywo (1 minuta = 1 s, GOL 3 s),
// przerwa z odprawą, studio pomeczowe, odprawa pomeczowa i konferencja prasowa (opcjonalna, osobne okno).
// Logika: src/match/matchday.js; silnik: src/engine/match; wygląd: design/dzien-meczowy.html.

import { esc } from './dom.js';
import { GROUP } from '../career/squad.js';
import { crestHtml, fallbackCrestSvg, CRESTS_AVAILABLE } from './crest.js';
import { CLUBS_PL } from '../data/clubs_pl.js';
import { FORMATIONS } from '../data/formations.js';
import { INSTRUCTIONS } from '../data/instructions.js';
import { anyClub, compLabel } from '../season/season.js';
import { statsFromEvents } from '../engine/matchStats.js';
import { onPitch } from '../engine/match/teams.js';
import { shirtNumbers } from '../career/shirts.js';
import * as TEAMS from '../engine/match/teams.js';
import { substitute, changeTactics, shout, canShout, assistantSuggest, applySuggestion } from '../engine/match/match.js';
import { SHOUTS } from '../engine/match/constants.js';
import { TONES, TALKS, POST_TONES, MAX_TALKS } from '../match/briefings.js';
import * as MD from '../match/matchday.js';
import { CLIMATES, currentQuestion, progress, effectWords } from '../match/press.js';

const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const crest = (id, size) => (anyClub(id) ? crestHtml(anyClub(id), { size, clubsById }) : '');
const STEPS = [['studio', 'Studio'], ['odprawa', 'Odprawa'], ['live1', '1. połowa'], ['break', 'Przerwa'], ['odprawa2', 'Odprawa w przerwie'], ['live2', '2. połowa'], ['studio2', 'Studio pomeczowe'], ['odprawa3', 'Odprawa pomeczowa']];
const STEP_INDEX = { studio: 0, odprawa: 1, live1: 2, break: 3, odprawa2: 4, live2: 5, etbreak: 5, fulltime: 5, studio2: 6, odprawa3: 7, press: 7 };
const STAT_ROWS = [['possession', 'Posiadanie %'], ['shots', 'Strzały'], ['onTarget', 'Celne'], ['xg', 'xG'], ['passes', 'Podania'], ['passAccuracy', 'Celność podań %'], ['corners', 'Rożne'], ['throwIns', 'Auty'], ['fouls', 'Faule'], ['offsides', 'Spalone'], ['yellow', 'Żółte kartki'], ['red', 'Czerwone kartki'], ['saves', 'Obrony']];

function luminance(hex) {
  const n = parseInt((hex || '#888888').slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}
const MOMENT_ICON = { goal: 'GOL', var: 'VAR', red: 'CZ', penMiss: 'K', chance: 'SZ', injury: '+' };
const rBand = (r) => (r >= 7.5 ? 'top' : r >= 6.8 ? 'good' : r >= 6.0 ? 'mid' : 'low');
const sideIdx = (sd) => (sd === 'home' || sd === 0 ? 0 : sd === 'away' || sd === 1 ? 1 : null);
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
    const rating = (id) => (phase === 'post' ? S.result.ratings.find((x) => x.id === id)?.rating : null);
    shell(`
      <h1>${title}</h1>
      ${phase === 'post' ? renderPressDoor(!!done) : ''}
      <div class="talk-grid talk-grid--${phase}">
      <section class="tpanel tpanel--speech">
        <p class="talk-ctx">${esc(ctxText)}</p>
        ${ui.adv && !done ? `<blockquote class="assistant">${esc(ui.adv.text)} Zalecana przemowa: ${esc(ui.adv.toneLabel)}.<footer>Asystent trenera</footer></blockquote>` : ''}
        ${done?.team?.backfireText ? `<p class="notice notice--err">${esc(done.team.backfireText)}</p>` : ''}
        ${done?.team?.summary ? `<p class="notice">${esc(done.team.summary)}</p>` : ''}
        <h2>Przemowa do drużyny</h2>
        <fieldset class="tones" ${done ? 'disabled' : ''}>
          <legend class="hint">Wybierz ton. Ta sama przemowa powtarzana mecz po meczu działa słabiej.</legend>
          ${Object.entries(tones).map(([id, t]) => `<label class="tone"><input type="radio" name="tone" value="${id}" ${id === chosen ? 'checked' : ''} data-md-tone="${id}"><div><strong>${esc(t.label)}${ui.adv?.tone === id && !done ? ' (zalecana)' : ''}</strong><span>${esc(t.quote)}</span></div></label>`).join('')}
        </fieldset>
      </section>
      <section class="tpanel tpanel--talks">
        <h2>Rozmowy indywidualne</h2>
        <p class="hint">Maksymalnie ${MAX_TALKS} zawodników.${ui.adv?.talks?.length && !done ? ` Asystent proponuje: ${esc(ui.adv.talks.map((t) => t.reason).join(' '))}` : ''}</p>
        <ul class="players">${players.map((p, i) => {
          const r = reactionOf(p.id); const rt = rating(p.id);
          const head = phase === 'pre' && i === game.tactics.xi.length ? '<li class="sub-head">Rezerwowi</li>' : phase === 'pre' && i === 0 ? '<li class="sub-head">Pierwszy skład</li>' : '';
          return `${head}<li class="prow"><span class="num">${esc(p.pos)}</span><span class="pname">${esc(p.name)}<small>${esc(p.persona ?? '')}${r?.talk ? `: „${esc(r.talk.quote.replace(/[„”]/g, ''))}”` : ''}</small></span>
            ${rt != null ? `<b class="rt rt--${rBand(rt)}" title="Ocena za mecz">${rt.toFixed(1)}</b>` : ''}
            ${r ? `<span class="react" data-r="${esc(r.reaction === 'obojetny' ? 'obojętny' : r.reaction === 'urazony' ? 'urażony' : r.reaction)}" title="${esc(r.text)}">${esc(r.label.toLowerCase())}</span>`
      : `<select class="pick-select" data-md-talk="${esc(p.id)}" aria-label="Rozmowa z: ${esc(p.name)}"><option value="">Bez rozmowy</option>${talks.map(([k, t]) => `<option value="${k}" ${ui.sel.talks?.[p.id] === k ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>`}
          </li>`;
        }).join('')}</ul>
      </section>
      </div>`,
      done ? (phase === 'pre' ? btn('kickoff', 'Wyjdź na boisko') : phase === 'half' ? btn('resume', 'Rozpocznij 2. połowę') + btn('dlg:manage', 'Zmiany i taktyka', false) : postActions())
        : btn(`speech:${phase}`, 'Wygłoś odprawę') + (phase === 'half' ? btn('dlg:manage', 'Zmiany i taktyka', false) : ''));
    if (phase === 'half' && !app.querySelector('#mdDlg')) app.insertAdjacentHTML('beforeend', '<dialog id="mdDlg" class="panel md-dlg"></dialog>');
    const selects = [...app.querySelectorAll('[data-md-talk]')];
    const sync = () => { const used = selects.filter((s) => s.value).length; selects.forEach((s) => { s.disabled = !s.value && used >= MAX_TALKS; }); };
    selects.forEach((s) => s.addEventListener('change', () => { ui.sel.talks = { ...(ui.sel.talks || {}), [s.dataset.mdTalk]: s.value }; sync(); }));
    app.querySelectorAll('[data-md-tone]').forEach((r) => r.addEventListener('change', () => { ui.sel.tone = r.value; }));
    sync();
  }

  // ------------------------------------------------------------ Konferencja prasowa (osobne okno)
  const climateChip = (id) => `<span class="pclimate" data-c="${id}"><i aria-hidden="true"></i>${esc(CLIMATES[id].label)}</span>`;
  const wordsList = (eff) => `<ul class="voices prs-fx">${effectWords(eff).map((w) => `<li class="voice${w.dir > 0 ? ' is-up' : w.dir < 0 ? ' is-down' : ''}"><span class="voice__k">${esc(w.k)}</span><span>${esc(w.t)}</span></li>`).join('')}</ul>`;

  /** Pasek przed salą na odprawie pomeczowej: klimat, kto czeka, co da pominięcie. */
  function renderPressDoor(talkDone) {
    const room = MD.pressSetup(game, S);
    if (!room) return '';
    const cl = room.climate.climate;
    const eff = S.pressResult;
    if (eff) {
      const verb = eff.mode === 'skipped' ? 'Konferencja pominięta.' : eff.mode === 'walkout' ? 'Wyszedłeś z sali przed końcem.' : 'Konferencja zakończona.';
      return `<section class="pdoor" data-c="${cl}" aria-label="Konferencja prasowa">
        <div class="pdoor__head">${climateChip(cl)}<span class="pdoor__state">${esc(verb)}</span></div>
        ${eff.headline ? `<blockquote class="paper paper--sm"><p>${esc(eff.headline.text)}</p><footer>${esc(eff.headline.outlet)}</footer></blockquote>` : ''}
      </section>`;
    }
    const outlets = MD.pressRoomPreview(game, S).map((j) => j.outlet);
    const started = S.pressConf?.answers?.length;
    return `<section class="pdoor" data-c="${cl}" aria-label="Konferencja prasowa">
      <div class="pdoor__head">${climateChip(cl)}<span class="pdoor__state">${esc(CLIMATES[cl].mood)}</span></div>
      <p class="pdoor__why">${esc(room.climate.reasons.join('. '))}. W sali: ${esc(outlets.join(', '))}.</p>
      <p class="pdoor__skip">${talkDone ? (started ? 'Konferencja trwa. Wróć do sali albo kliknij Dalej, żeby ją przerwać.' : `Konferencja jest opcjonalna. ${esc(CLIMATES[cl].skip)}`) : 'Po odprawie w szatni możesz pójść na konferencję prasową albo ją pominąć.'}</p>
    </section>`;
  }

  function postActions() {
    if (S.comp === 'friendly' || !MD.pressSetup(game, S)) return btn('exit', 'Dalej');
    if (S.pressResult) return btn('pressView', 'Podsumowanie konferencji', false) + btn('exit', 'Dalej');
    return btn('pressOpen', S.pressConf?.answers?.length ? 'Wróć na konferencję' : 'Konferencja prasowa', false) + btn('exit', 'Dalej');
  }

  function wallStyle() {
    const c = anyClub(game.clubId);
    const src = CRESTS_AVAILABLE.has(c?.parent ?? c?.id) ? `assets/crests/${c.parent ?? c.id}-48.webp` : `data:image/svg+xml,${encodeURIComponent(fallbackCrestSvg(c))}`;
    return `--wall:url(&quot;${src}&quot;)`;
  }

  function pressDialog() {
    let dlg = app.querySelector('#mdPress');
    if (!dlg) {
      app.insertAdjacentHTML('beforeend', `<dialog id="mdPress" class="prs" aria-labelledby="prsTitle" style="${wallStyle()}"></dialog>`);
      dlg = app.querySelector('#mdPress');
      dlg.addEventListener('cancel', (ev) => {
        // Escape: przed pierwszą odpowiedzią i po końcu zamyka okno; w trakcie pyta o wyjście z sali
        if (S.pressSettled || !S.pressConf?.answers?.length) return;
        ev.preventDefault(); ui.prsConfirm = true; renderPressDialog();
      });
      dlg.addEventListener('close', () => { ui.prsConfirm = false; if (S.step === 'odprawa3') { renderTalk('post'); app.querySelector('[data-md="exit"]')?.focus(); } });
    }
    return dlg;
  }

  function renderPressDialog() {
    const dlg = pressDialog();
    const conf = S.pressConf;
    const cl = conf.climate;
    const q = currentQuestion(conf);
    const pr = progress(conf);
    const askedBy = new Set(conf.queue.slice(0, conf.idx).map((x) => x.by?.id).filter(Boolean));
    const header = `<header class="prs__wall" data-c="${cl}">
        <div class="prs__bar">
          <div><h2 id="prsTitle">Konferencja prasowa</h2>
            <p class="prs__match">${esc(sideName(0))} ${esc(S.post.result.score)} ${esc(sideName(1))}</p></div>
          ${climateChip(cl)}
        </div>
        <p class="prs__mood">${esc(CLIMATES[cl].mood)} <span>${esc(conf.climateRes.reasons.join('. '))}.</span></p>
      </header>`;
    const room = `<aside class="prs__room" aria-label="Na sali">
        <h3>Na sali</h3>
        <ol class="prs__people">
          <li class="prs__p is-officer ${q?.officer ? 'is-now' : ''}"><b>${esc(conf.officer.name)}</b><span>${esc(conf.officer.role)}</span></li>
          ${conf.room.map((j) => `<li class="prs__p ${q?.by?.id === j.id ? 'is-now' : askedBy.has(j.id) ? 'is-done' : ''}"><b>${esc(j.name)}</b><span>${esc(j.outlet)}</span></li>`).join('')}
        </ol>
      </aside>`;
    const transcript = conf.answers.length ? `<details class="prs__log" ${S.pressSettled ? '' : 'open'}><summary>Zapis konferencji</summary><ol>${conf.answers.map((a) => {
      const by = conf.room.find((j) => j.id === a.by);
      return `<li><p class="prs__lq"><b>${esc(by ? `${by.name}, ${by.outlet}` : conf.officer.name)}:</b> ${esc(a.question)}</p><p class="prs__la">${esc(a.text)}</p></li>`;
    }).join('')}</ol></details>` : '';
    let stage;
    if (S.pressSettled) {
      const eff = S.pressResult;
      stage = `<section class="prs__stage prs__stage--after" aria-labelledby="prsAfter">
        <h3 id="prsAfter" tabindex="-1">${eff.mode === 'walkout' ? 'Wyszedłeś z sali' : 'Po konferencji'}</h3>
        ${eff.headline ? `<blockquote class="paper prs__paper"><p>${esc(eff.headline.text)}</p><footer>${esc(eff.headline.outlet)}</footer></blockquote>` : ''}
        ${wordsList(eff)}
        <p class="hint">${esc(game.press?.left > 0 ? `Ta atmosfera w mediach może potrwać jeszcze ${game.press.left === 1 ? 'mecz' : `${game.press.left} mecze`}.` : 'Klimat w mediach może się zmienić po kolejnym meczu.')}</p>
      </section>`;
    } else if (ui.prsConfirm) {
      stage = `<section class="prs__stage prs__confirm" role="alertdialog" aria-labelledby="prsConf">
        <h3 id="prsConf" tabindex="-1">Wyjść z sali przed końcem?</h3>
        <p>Dziennikarze zapamiętają, że przerwałeś konferencję, a nagłówki napiszą się same. Szatnia odczuje presję prasy bez reszty twoich odpowiedzi.</p>
        <div class="prs__btns">${btn('pressOutNo', 'Zostań i odpowiadaj', false)}${btn('pressOutYes', 'Wyjdź z sali')}</div>
      </section>`;
    } else {
      const who = q.officer ? `<b>${esc(conf.officer.name)}</b><span>${esc(conf.officer.role)}</span>` : `<b>${esc(q.by.name)}</b><span>${esc(q.by.outlet)}, ${esc(q.by.kind)}</span>`;
      const lead = q.officer ? `<p class="prs__intro">${esc(conf.intro)}</p>` : q.follow ? '<p class="prs__intro">Dopytanie</p>' : pr.last ? `<p class="prs__intro">${esc(conf.officer.name)}: ostatnie pytanie.</p>` : '';
      stage = `<section class="prs__stage" aria-labelledby="prsQ">
        <p class="prs__count">${q.officer ? 'Słowo wstępne' : `Pytanie ${pr.current} z ${pr.total}`}</p>
        ${lead}
        <div class="prs__who">${who}</div>
        <h3 class="prs__q" id="prsQ" tabindex="-1">${esc(q.text)}</h3>
        <div class="prs__answers" role="group" aria-label="Twoja odpowiedź">
          ${q.answers.map((a) => `<button class="prs__a" data-tone="${esc(a.tone)}" data-md="pressAns:${a.i}"><small>${esc(a.toneLabel)}</small><span>${esc(a.text)}</span></button>`).join('')}
        </div>
      </section>`;
    }
    const foot = S.pressSettled ? `${btn('pressClose', 'Wróć do odprawy', false)}${btn('exit', 'Dalej')}`
      : ui.prsConfirm ? '' : `${conf.answers.length ? btn('pressOut', 'Wyjdź z sali', false) : btn('pressClose', 'Wróć do odprawy', false)}`;
    dlg.dataset.c = cl;
    dlg.innerHTML = `${header}<div class="prs__body">${room}<div class="prs__main">${stage}${transcript}</div></div>${foot ? `<footer class="prs__foot">${foot}</footer>` : ''}`;
    if (!dlg.open) dlg.showModal();
    dlg.querySelector('#prsQ, #prsAfter, #prsConf')?.focus({ preventScroll: false });
    dlg.querySelector('.prs__main')?.scrollTo?.({ top: 0 });
  }

  // ------------------------------------------------------------ Mecz na żywo
  const SPEEDS = [[1, 'x1'], [2.5, 'x2,5'], [5, 'x5']];
  function renderLive() {
    const M = S.M;
    const skipLabel = `Pokaż wynik${S.step === 'live1' ? '<span class="tp-skip__x"> do przerwy</span>' : ''}`;
    shell(`
      <div class="live">
        <div class="live__head">
          <div class="board" aria-live="off">
            <div class="board__t">${crest(fixture.home, 30)}<span>${esc(shortName(0))}</span></div>
            <div><div class="board__score" id="mdScore">${M.score[0]}:${M.score[1]}</div><span class="board__min" id="mdMin">${esc(M.events[M.events.length - 1]?.min ?? "0'")}</span></div>
            <div class="board__t"><span>${esc(shortName(1))}</span>${crest(fixture.away, 30)}</div>
          </div>
          <div class="transport" role="toolbar" aria-label="Przebieg meczu">
            <button class="md-play ${ui.running ? 'is-running' : ''}" data-md="pause" id="mdPause">${ui.running ? 'Pauza' : M.minute > 0 ? 'Wznów mecz' : 'Start meczu'}</button>
            <div class="speedset" role="group" aria-label="Tempo meczu">${SPEEDS.map(([v, l]) => `<button class="speed" data-md="speed:${v}" aria-pressed="${ui.speed === v}">${l}</button>`).join('')}</div>
            <button class="tp-skip" data-md="skip" title="${S.step === 'live1' ? 'Pokaż wynik do przerwy' : 'Pokaż wynik końcowy'}">${skipLabel}</button>
          </div>
        </div>
        <div class="pitch-area">
          <div class="pitch-wrap"><canvas class="pitch" id="mdPitch" aria-label="Boisko"></canvas>
            <div class="goal" id="mdGoal" role="status"><div class="goal__in"><b id="mdGoalTitle">GOL</b><small id="mdGoalWho"></small></div></div>
            <div class="md-toasts" id="mdToasts" aria-live="polite"></div>
            <div class="md-halt" id="mdHalt" hidden role="alertdialog" aria-labelledby="mdHaltTitle">
              <b id="mdHaltTitle">Gra wstrzymana</b><p id="mdHaltText"></p>
              <div class="md-halt__sugg" id="mdHaltSugg"></div>
              <div class="md-halt__btns"><button class="btn btn--quiet btn--sm" data-md="dlg:manage">Zmiany i taktyka</button><button class="btn btn--primary btn--sm" data-md="haltGo">Graj dalej</button></div>
            </div>
          </div>
          <div class="coachbar" role="toolbar" aria-label="Decyzje trenera">
            <button data-md="dlg:manage">Zmiany i taktyka</button><button data-md="dlg:shout">Okrzyk</button>
          </div>
        </div>
        <div class="mom-area">
          <div class="poss"><span id="mdPh">50%</span><div class="bar2"><i class="bh" id="mdPbh" style="width:50%"></i><i class="ba" id="mdPba" style="width:50%"></i></div><span id="mdPa">50%</span></div>
          <div class="press" aria-live="off">
            <div class="press__track"><i class="press__knob" id="mdPressKnob" style="left:50%"></i></div>
            <span class="press__lbl" id="mdPressLbl">Gra wyrównana</span>
          </div>
          <svg class="momentum" id="mdMom" viewBox="0 0 90 60" preserveAspectRatio="none" role="img" aria-label="Przewaga w kolejnych minutach"></svg>
        </div>
        <div class="feed-area"><h2>Relacja</h2><ul class="feed" id="mdFeed"></ul></div>
        <div class="side-area"><div class="tabs2" role="tablist">
          <button role="tab" data-md="tab:stats" aria-selected="${ui.tab === 'stats'}">Statystyki</button>
          <button role="tab" data-md="tab:lineups" aria-selected="${ui.tab === 'lineups'}">Składy</button></div><div id="mdSide"></div></div>
      </div>
      <dialog id="mdDlg" class="panel md-dlg"></dialog>`, '');
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
    drawMomentum(M, q);
    // Relacja
    const feed = M.events.filter((e) => e.text && !['possessionMinute'].includes(e.type)).slice(-60).reverse();
    q('#mdFeed').innerHTML = feed.map((e) => `<li class="${e.type === 'goal' && !e.provisional ? 'goalrow' : ''}"${e.side != null ? ` data-side="${e.side}"` : ''}><span class="m">${esc(e.min)}</span><span>${e.side != null ? `<b class="tm">${esc(shortName(e.side))}</b> ` : ''}${e.type === 'yellow' ? '<i class="card-ico y" aria-hidden="true"></i>' : e.type === 'red' ? '<i class="card-ico r" aria-hidden="true"></i>' : ''}${esc(e.text)}</span></li>`).join('') || `<li><span class="m"></span><span class="hint">Naciśnij Start. 1 minuta meczu trwa 1 sekundę.</span></li>`;
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
    for (const e of newEvents) if (TOAST[e.type]) showToast(e);
    const goalEv = newEvents.find((e) => e.type === 'goal');
    const varEv = newEvents.find((e) => e.type === 'varOverturn' || e.type === 'varCheck');
    if (goalEv || varEv) {
      const ov = q('#mdGoal');
      const isGoal = goalEv && !newEvents.some((e) => e.type === 'varOverturn');
      ov.dataset.side = isGoal ? String(goalEv.side) : 'var';
      ov.classList.remove('on'); void ov.offsetWidth;
      q('#mdGoalTitle').textContent = isGoal ? 'GOL' : 'VAR';
      q('#mdGoalWho').textContent = (goalEv && !newEvents.some((e) => e.type === 'varOverturn')) ? `${goalEv.text.replace(/^GOL! /, '')} ${sideName(goalEv.side)}` : (newEvents.find((e) => e.type === 'varOverturn')?.text ?? varEv.text);
      ov.classList.add('on');
      setTimeout(() => ov.classList.remove('on'), goalEv ? 3000 : 2000);
    }
  }

  /**
   * Momentum: słupek na każdą minutę (gospodarze w górę, goście w dół), skala dopasowana
   * do najmocniejszej fazy meczu (pierwiastek wzmacnia słabsze fazy), kropki strzałów
   * wielkości xG, gole jako piłki na krawędzi. Wskaźnik nad wykresem pokazuje ostatnie 5 minut.
   */
  const SHOTS = new Set(['shotOn', 'shotOff', 'shotBlocked', 'post', 'goal']);
  function drawMomentum(M, q) {
    const svg = q('#mdMom');
    if (!svg) return;
    const mom = M.momentum;
    const N = Math.max(90, mom.length);
    const mid = 30; const amp = 24;
    const scale = Math.max(25, ...mom.map((v) => Math.abs(v)));
    const f = (v) => Math.sign(v) * Math.pow(Math.min(1, Math.abs(v) / scale), 0.7) * amp;
    svg.setAttribute('viewBox', `0 0 ${N} 60`);
    let out = `<rect x="0" y="0" width="${N}" height="60" fill="transparent"/>`
      + `<line x1="45" y1="2" x2="45" y2="58" class="mom-ht"/>`
      + `<line x1="0" y1="${mid}" x2="${N}" y2="${mid}" class="mom-axis"/>`;
    const last = mom.length - 1;
    mom.forEach((v, i) => {
      const h = Math.max(0.6, Math.abs(f(v)));
      const op = i >= last - 4 ? 1 : 0.78;
      out += `<rect x="${i + 0.08}" y="${v >= 0 ? mid - h : mid}" width=".84" height="${h}" fill="${v >= 0 ? 'var(--home)' : 'var(--away)'}" opacity="${op}"/>`;
    });
    for (const e of M.events) {
      if (!SHOTS.has(e.type) || e.side == null || e.provisional || e.t == null) continue;
      const x = Math.min(N - 0.5, e.t + 0.5);
      if (e.type === 'goal') {
        out += `<circle cx="${x}" cy="${e.side === 0 ? 3.2 : 56.8}" r="2.6" class="mom-goal"/>`;
      } else {
        const r = 0.5 + Math.min(1.6, (e.xg ?? 0.08) * 4);
        out += `<circle cx="${x}" cy="${e.side === 0 ? mid - amp - 2 : mid + amp + 2}" r="${r}" class="mom-shot" fill="${e.side === 0 ? 'var(--home)' : 'var(--away)'}"/>`;
      }
    }
    if (mom.length) out += `<line x1="${mom.length}" y1="2" x2="${mom.length}" y2="58" class="mom-now"/>`;
    svg.innerHTML = out;
    // Kto naciska: średnia ostatnich 5 minut, przesuwany znacznik
    const recent = mom.slice(-5);
    const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    const k = Math.sign(avg) * Math.pow(Math.min(1, Math.abs(avg) / scale), 0.7);
    const knob = q('#mdPressKnob');
    if (knob) {
      knob.style.left = `${50 - k * 46}%`;
      knob.dataset.side = Math.abs(k) < 0.15 ? '' : k > 0 ? '0' : '1';
    }
    const lbl = q('#mdPressLbl');
    if (lbl) lbl.textContent = Math.abs(k) < 0.15 ? 'Gra wyrównana' : `${Math.abs(k) > 0.55 ? 'Wyraźnie naciska' : 'Przewaga'}: ${shortName(k > 0 ? 0 : 1)}`;
  }

  // Numery na koszulkach (trwałe w klubie, career/shirts.js); liczone raz na mecz
  let kitMaps = null;
  function kitNo(side, id) {
    if (!kitMaps) {
      try { kitMaps = [0, 1].map((sd) => { const T = S.M.teams[sd]; return shirtNumbers(game, sd === 0 ? fixture.home : fixture.away, [...T.players, ...T.bench].map((x) => x.p)); }); } catch { kitMaps = [new Map(), new Map()]; }
    }
    return kitMaps[side]?.get(id);
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
        next.push({ id: x.id, side: T.side, x: sx + j, y: sy + Math.cos(M.tick + i) * 1.5, label: String(kitNo(T.side, x.id) ?? (x.slot.pos === 'BR' ? 'BR' : i + 1)) });
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
    const halt = haltReason(r.events);
    if (halt) { stop(); showHalt(halt); return; }
    const pause = (r.pause ?? 0) * 1000;
    ui.timer = setTimeout(loop, Math.max(pause, 1000 / ui.speed));
  }
  function start() { hideHalt(); ui.running = true; const b = app.querySelector('#mdPause'); if (b) { b.textContent = 'Pauza'; b.classList.add('is-running'); } ui.timer = setTimeout(loop, 1000 / ui.speed); }
  function stop() { ui.running = false; clearTimeout(ui.timer); const b = app.querySelector('#mdPause'); if (b) { b.textContent = 'Wznów mecz'; b.classList.remove('is-running'); } }

  // ------------------------------------------------------------ Zdarzenia: okienka i zatrzymanie gry
  const TOAST = {
    yellow: { cls: 'y', ms: 3200, label: 'Żółta kartka' },
    red: { cls: 'r', ms: 4500, label: 'Czerwona kartka' },
    varOverturn: { cls: 'var', ms: 4500, label: 'VAR' },
    penalty: { cls: 'pen', ms: 3500, label: 'Rzut karny' },
    injury: { cls: 'inj', ms: 4500, label: 'Kontuzja' },
  };
  function showToast(e) {
    const box = app.querySelector('#mdToasts');
    if (!box) return;
    const t = TOAST[e.type];
    const el = document.createElement('div');
    const second = e.type === 'red' && (e.second || /druga żółta/i.test(e.text ?? ''));
    el.className = `md-toast md-toast--${t.cls}`;
    el.innerHTML = `<span class="md-toast__k">${esc(second ? 'Druga żółta, czerwona' : t.label)}${e.side != null ? `, ${esc(shortName(e.side))}` : ''} <small>${esc(e.min ?? '')}</small></span><span>${esc(e.text ?? '')}</span>`;
    box.prepend(el);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => el.remove(), t.ms / Math.max(1, ui.speed / 2));
  }
  /** Kiedy zatrzymać mecz, żeby gracz mógł zareagować. */
  function haltReason(events) {
    const red = events.find((e) => e.type === 'red');
    if (red) return red.side === S.userSide
      ? `Czerwona kartka dla twojego zawodnika. ${red.text} Drużyna gra w osłabieniu: możesz przestawić ustawienie albo dokonać zmiany.`
      : `Rywal gra w osłabieniu. ${red.text} Możesz zagrać odważniej.`;
    const inj = events.find((e) => e.type === 'injury' && e.side === S.userSide);
    if (inj) return inj.injury?.playable === false
      ? `${inj.text} Gramy w osłabieniu, dopóki nie wejdzie zmiennik.`
      : `${inj.text} Możesz go zmienić albo zostawić na boisku.`;
    return null;
  }
  /** Podpowiedzi asystenta po czerwonej kartce lub urazie (silnik: assistantSuggest, bez zmiany meczu). */
  function suggLabel(a) {
    if (a.type === 'sub') return `Zmiana: ${a.outName} schodzi, ${a.inName} wchodzi${a.text ? ` (${a.text})` : ''}`;
    const pt = a.patch ?? {};
    const parts = [];
    if (pt.formation) parts.push(`${FORMATIONS.find((f) => f.id === pt.formation)?.name ?? pt.formation}${pt.drop?.length ? ` bez ${pt.drop.join(', ')}` : ''}`);
    else if (pt.drop?.length) parts.push(`gramy bez ${pt.drop.join(', ')}`);
    for (const [k, v] of Object.entries(pt.instructions ?? {})) parts.push(`${INSTRUCTIONS.find((i) => i.id === k)?.label ?? k}: ${insLabel(k, v)}`);
    return `Taktyka: ${parts.join(', ') || 'korekta'}${a.reason ? ` (${a.reason})` : ''}`;
  }
  function renderSugg() {
    const box = app.querySelector('#mdHaltSugg');
    if (!box) return;
    const list = ui.sugg ?? [];
    box.innerHTML = (ui.suggMsg ? `<small class="ok">${esc(ui.suggMsg)}</small>` : '')
      + (list.length ? `<small>Asystent proponuje:</small>${list.map((a, i) => `<button class="md-sugg" data-md="haltSug:${i}">${esc(suggLabel(a))}<span>Zastosuj</span></button>`).join('')}` : '');
  }
  function showHalt(text) {
    const h = app.querySelector('#mdHalt');
    if (!h) return;
    app.querySelector('#mdHaltText').textContent = text;
    try { ui.sugg = assistantSuggest(S.M, S.userSide).slice(0, 3); } catch { ui.sugg = []; }
    ui.suggMsg = '';
    renderSugg();
    h.hidden = false;
    h.querySelector('[data-md="haltGo"]')?.focus();
  }
  function hideHalt() { const h = app.querySelector('#mdHalt'); if (h) h.hidden = true; }

  // ------------------------------------------------------------ Dialogi w meczu
  function openDialog(kind, fresh = false) {
    const dlg = app.querySelector('#mdDlg');
    const M = S.M; const T = M.teams[S.userSide];
    if (kind === 'subs' || kind === 'tactics') kind = 'manage';
    if (kind === 'manage') {
      if (fresh || !dlg.open) { ui.tac = null; ui.subMsg = ''; ui.subSel = null; }
      const scroll = dlg.querySelector('.mm__lists')?.scrollTop ?? 0;
      dlg.className = 'panel md-dlg md-dlg--wide mm-dlg';
      dlg.innerHTML = managePanel(T, M);
      if (!dlg.open) dlg.showModal();
      const l = dlg.querySelector('.mm__lists'); if (l) l.scrollTop = scroll;
      mountSubsDrag(dlg);
      return;
    }
    dlg.className = 'panel md-dlg';
    dlg.innerHTML = `<h2>Okrzyk z linii bocznej</h2><p class="hint">Okrzyk działa od razu przez kilka minut.</p><ul class="plain-list">${Object.entries(SHOUTS).map(([k, sh]) => { const err = canShout(M, S.userSide, k); return `<li><button class="btn btn--quiet" data-md="doShout:${k}" ${err ? 'disabled' : ''}>${esc(sh.label)}</button><span class="hint">${esc(err ?? '')}</span></li>`; }).join('')}</ul>
      <p id="mdDlgMsg" class="hint"></p><p>${btn('closeDlg', 'Zamknij', false)}</p>`;
    if (!dlg.open) dlg.showModal();
  }

  // ------------------------------------------------------------ Zmiany: listy, przeciąganie, zatwierdzanie
  // Każda zmiana trafia najpierw do „Zaplanowanych” i wchodzi dopiero po „Zatwierdź zmiany”
  // (wszystkie naraz, więc w trakcie gry zużywają jedno okno).
  const onPitchNow = (T) => T.players.filter((x) => (x.on || x.injury) && !x.sentOff && !x.subbedOff);
  function subsState(T, M) {
    ui.pend = (ui.pend ?? []).filter((x) => onPitchNow(T).some((o) => o.id === x.out) && T.bench.some((b) => b.id === x.in));
    const left = T.subsLimit - T.subsUsed;
    const windowBlocked = M.phase !== 'break' && T.windowMinute !== M.tick && T.windowsUsed >= T.windowsLimit;
    return { left, windowBlocked };
  }
  // Taktyka: szkic zmian w oknie, wchodzi razem ze zmianami zawodników po zatwierdzeniu
  const SHORT = { 'Zamurowanie': 'Mur', 'Wszystko do ataku': 'Atak', 'Równowaga': 'Równo', 'Indywidualne': 'Indyw.', 'Strefowe': 'Strefa', 'Normalne': 'Norm.', 'Normalna': 'Norm.' };
  const INS_KEYS = ['mentality', 'pressing', 'tempo', 'passing', 'line', 'tackling', 'marking', 'counter', 'timewasting'];
  function tacDraft(T) {
    ui.tac ??= { formation: T.formation.id, ins: Object.fromEntries(INS_KEYS.map((k) => [k, String(T.tactics.instructions?.[k] ?? '')])) };
    return ui.tac;
  }
  function tacDiff(T) {
    const d = tacDraft(T);
    const ins = {};
    for (const k of INS_KEYS) if (d.ins[k] !== String(T.tactics.instructions?.[k] ?? '')) ins[k] = d.ins[k];
    const formation = d.formation !== T.formation.id ? d.formation : null;
    return { formation, ins, n: (formation ? 1 : 0) + Object.keys(ins).length };
  }
  const insLabel = (k, v) => INSTRUCTIONS.find((i) => i.id === k)?.options.find((o) => String(o.id) === String(v))?.label ?? String(v);
  /** Gdzie stoi każdy zawodnik po zatwierdzeniu: nowa formacja i zaplanowane zmiany. */
  function previewXI(T) {
    const d = tacDraft(T);
    let xs = onPitchNow(T).map((x) => ({ x, slot: x.slot }));
    if (d.formation !== T.formation.id) {
      const F = FORMATIONS.find((f) => f.id === d.formation);
      if (F && typeof TEAMS.reslot === 'function') {
        const clone = { ...T, formation: F, players: T.players.map((x) => ({ ...x })) };
        try { TEAMS.reslot(clone); xs = xs.map((o) => ({ x: o.x, slot: clone.players.find((c) => c.id === o.x.id)?.slot ?? o.slot })); } catch { /* podgląd bez zmiany ustawienia */ }
      } else if (F) {
        const free = F.slots.slice();
        xs = xs.map((o) => { let i = free.findIndex((sl) => sl.pos === o.slot?.pos); if (i < 0) i = free.reduce((b, sl, j) => (Math.abs(sl.y - (o.slot?.y ?? 50)) < Math.abs(free[b].y - (o.slot?.y ?? 50)) ? j : b), 0); const sl = free.splice(i, 1)[0] ?? o.slot; return { x: o.x, slot: sl }; });
      }
    }
    return xs;
  }
  function managePanel(T, M) {
    const st = subsState(T, M);
    const pend = ui.pend;
    const outIds = new Set(pend.map((x) => x.out)); const inIds = new Set(pend.map((x) => x.in));
    const sel = ui.subSel;
    const d = tacDraft(T); const diff = tacDiff(T);
    const condCls = (c) => (c < 60 ? 'low' : c < 75 ? 'mid' : '');
    const row = (x, kind) => {
      const planned = kind === 'on' ? outIds.has(x.id) : inIds.has(x.id);
      const isSel = sel && sel.kind === kind && sel.id === x.id;
      const pos = kind === 'on' ? x.slot?.pos ?? x.p.pos : x.p.pos;
      const cond = Math.round(x.cond ?? 100);
      const note = [x.injury ? 'uraz' : '', x.yc ? 'żółta kartka' : '', kind === 'bench' ? `OVR ${Math.round(x.p.ovr)}` : ''].filter(Boolean).join(', ');
      return `<li class="sub-row ${planned ? 'is-planned' : ''} ${isSel ? 'is-sel' : ''} ${x.injury ? 'is-hurt' : ''}" data-sdrop="${kind}:${esc(x.id)}">
        <button class="sub-row__main" data-md="subPick:${kind}|${esc(x.id)}" data-sdrag="${kind}:${esc(x.id)}" data-name="${esc(x.p.name)}" aria-pressed="${isSel}" ${planned ? 'disabled' : ''}>
          <span class="sub-handle" data-shandle aria-hidden="true"></span>
          <span class="pos" data-g="${GROUP[pos] ?? 'MID'}">${esc(pos)}</span>
          <span class="sub-name">${esc(x.p.name)}${note ? `<small>${esc(note)}</small>` : ''}</span>
          <span class="sub-cond" title="Kondycja"><i style="width:${cond}%" class="${condCls(cond)}"></i></span><b>${cond}%</b>
        </button></li>`;
    };
    // Boisko: żetony w miejscach po zatwierdzeniu, zaplanowany zmiennik zamiast schodzącego
    const tokens = previewXI(T).map(({ x, slot }) => {
      const pl = pend.find((q) => q.out === x.id);
      const inc = pl ? T.bench.find((b) => b.id === pl.in) : null;
      const cond = Math.round(x.cond ?? 100);
      const isSel = sel && sel.kind === 'on' && sel.id === x.id;
      const last = (n) => String(n).split(' ').slice(-1)[0];
      const pos = slot?.pos ?? x.p.pos;
      return `<button class="mm-tok ${pos === 'BR' ? 'is-gk' : ''} ${pl ? 'is-planned' : ''} ${isSel ? 'is-sel' : ''} ${x.injury ? 'is-hurt' : ''}" style="--x:${slot?.x ?? 50};--y:${slot?.y ?? 50};--cond:${cond}" data-c="${condCls(cond)}"
        data-sdrop="on:${esc(x.id)}" data-sdrag="on:${esc(x.id)}" data-shandle data-name="${esc(x.p.name)}" data-md="subPick:on|${esc(x.id)}" ${pl ? 'disabled' : ''} title="${esc(`${x.p.name}, ${pos}, kondycja ${cond}%`)}">
        <span class="mm-tok__dot"><span>${esc(pos)}</span></span>${x.yc ? '<i class="mm-tok__yc" aria-label="żółta kartka"></i>' : ''}${x.injury ? '<i class="mm-tok__inj" aria-label="uraz">+</i>' : ''}
        <span class="mm-tok__name">${inc ? `↑ ${esc(last(inc.p.name))}` : esc(last(x.p.name))}</span></button>`;
    }).join('');
    // Instrukcje jako segmenty
    const seg = (k) => {
      const ins = INSTRUCTIONS.find((i) => i.id === k); if (!ins) return '';
      const dirty = d.ins[k] !== String(T.tactics.instructions?.[k] ?? '');
      return `<fieldset class="mm-seg ${dirty ? 'is-dirty' : ''}"><legend class="mm-seg__lbl">${esc(ins.label)}</legend><div class="mm-seg__opts">${ins.options.map((o) => `<label title="${esc(o.label)}"><input type="radio" name="ins-${k}" value="${esc(String(o.id))}" data-ins="${k}" ${d.ins[k] === String(o.id) ? 'checked' : ''}><span>${esc(SHORT[o.label] ?? o.label)}</span></label>`).join('')}</div></fieldset>`;
    };
    // Kolejka do zatwierdzenia
    const chips = [
      ...pend.map((x, i) => { const o = T.players.find((y) => y.id === x.out); const n = T.bench.find((y) => y.id === x.in); const gkWarn = o?.slot?.pos === 'BR' && n?.p.pos !== 'BR'; return `<li class="mm-pend ${gkWarn ? 'is-warn' : ''}"><span><b class="out">${esc(o?.p.name ?? '')}</b> <b class="in">${esc(n?.p.name ?? '')}</b>${gkWarn ? '<small>Do bramki wejdzie zawodnik z pola.</small>' : ''}</span><button data-md="subDrop:${i}" aria-label="Usuń zmianę">×</button></li>`; }),
      diff.formation ? `<li class="mm-pend"><span>Ustawienie: ${esc(T.formation.name)} → ${esc(FORMATIONS.find((f) => f.id === diff.formation)?.name ?? diff.formation)}</span><button data-md="tacUndo:formation" aria-label="Cofnij zmianę ustawienia">×</button></li>` : '',
      ...Object.entries(diff.ins).map(([k, v]) => `<li class="mm-pend"><span>${esc(INSTRUCTIONS.find((i) => i.id === k)?.label ?? k)}: ${esc(insLabel(k, T.tactics.instructions?.[k]))} → ${esc(insLabel(k, v))}</span><button data-md="tacUndo:${k}" aria-label="Cofnij">×</button></li>`),
    ].filter(Boolean);
    const nAll = pend.length + diff.n;
    const live = M.phase !== 'break' && M.minute > 0;
    const costWarn = diff.n && live && M.minute - (T.lastTacChange ?? -99) < 10 ? 'Kolejna zmiana taktyki w ciągu 10 minut kosztuje podwójnie.' : '';
    const info = st.windowBlocked ? 'Okna zmian wykorzystane, zmiany zawodników tylko w przerwie.'
      : st.left <= 0 ? `Wykorzystano wszystkie zmiany (${T.subsLimit}).`
        : `Zmiany: ${st.left} z ${T.subsLimit}${M.phase === 'break' ? ', w przerwie bez zużycia okna' : `, okna ${T.windowsUsed} z ${T.windowsLimit}`}.`;
    const tab = ui.mmTab ?? 'bench';
    return `<div class="mm" data-tab="${tab}">
      <header class="mm__head"><h2>Zmiany i taktyka</h2><span class="mm__info">${esc(info)} Spójność ${Math.round(T.S)} na 100.</span>
        <button class="mm__x" data-md="subClose" aria-label="Zamknij">×</button></header>
      <section class="mm__pitch">
        <label class="mm-form"><span>Ustawienie</span><select id="mdForm">${FORMATIONS.map((f) => `<option value="${f.id}" ${f.id === d.formation ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
        <div class="pitch2 mm-field">${tokens}</div>
        <p class="mm__tip">Przeciągnij rezerwowego na zawodnika na boisku albo dotknij kolejno obu.</p>
      </section>
      <nav class="mm__tabs" role="tablist" aria-label="Widok">
        ${[['bench', 'Ławka'], ['xi', 'Na boisku'], ['tac', 'Taktyka']].map(([k, l]) => `<button role="tab" data-md="mmTab:${k}" aria-selected="${tab === k}">${l}${k === 'tac' && diff.n ? ` <i class="dot"></i>` : ''}</button>`).join('')}
      </nav>
      <div class="mm__lists">
        <section class="mm__xi"><h3>Na boisku</h3><ul class="sub-list">${onPitchNow(T).map((x) => row(x, 'on')).join('')}</ul></section>
        <section class="mm__bench"><h3>Ławka</h3><ul class="sub-list">${T.bench.map((x) => row(x, 'bench')).join('') || '<li class="hint">Brak rezerwowych.</li>'}</ul></section>
        <section class="mm__tac"><h3>Instrukcje</h3><div class="mm-segs">${INS_KEYS.map(seg).join('')}</div></section>
      </div>
      <footer class="mm__foot">
        <div class="mm__queue">${chips.length ? `<ul>${chips.join('')}</ul>` : '<p class="hint">Nic do zatwierdzenia. Zmiany zawodników i taktyki wejdą razem po zatwierdzeniu.</p>'}
          <p id="mdDlgMsg" class="hint" role="status">${esc([ui.subMsg ?? '', costWarn].filter(Boolean).join(' '))}</p></div>
        <div class="mm__btns">${nAll ? btn('mmDiscard', 'Odrzuć', false) : btn('subClose', 'Zamknij', false)}<button class="btn btn--primary mm__ok" data-md="mmConfirm" ${nAll ? '' : 'disabled'}>Zatwierdź${nAll ? ` (${nAll})` : ''}</button></div>
      </footer>
    </div>`;
  }
  function planSub(outId, inId) {
    const M = S.M; const T = M.teams[S.userSide];
    const st = subsState(T, M);
    if (st.windowBlocked) return 'Wykorzystano wszystkie okna zmian. Zmiany możliwe w przerwie.';
    if (ui.pend.length >= st.left) return `Nie możesz zaplanować więcej zmian (zostało ${st.left}).`;
    if (ui.pend.some((x) => x.out === outId)) return 'Ten zawodnik już schodzi w zaplanowanej zmianie.';
    if (ui.pend.some((x) => x.in === inId)) return 'Ten rezerwowy już wchodzi w zaplanowanej zmianie.';
    if (!onPitchNow(T).some((x) => x.id === outId)) return 'Tego zawodnika nie ma na boisku.';
    if (!T.bench.some((x) => x.id === inId)) return 'Tego zawodnika nie ma na ławce.';
    ui.pend.push({ out: outId, in: inId });
    return null;
  }
  function pickSub(kind, id) {
    const sel = ui.subSel;
    if (!sel || sel.kind === kind) { ui.subSel = sel && sel.id === id ? null : { kind, id }; ui.subMsg = ui.subSel ? (kind === 'bench' ? 'Teraz wybierz zawodnika, który zejdzie.' : 'Teraz wybierz rezerwowego, który wejdzie.') : ''; return; }
    const outId = kind === 'on' ? id : sel.id; const inId = kind === 'bench' ? id : sel.id;
    const err = planSub(outId, inId);
    ui.subSel = null; ui.subMsg = err ?? 'Zmiana zaplanowana. Zatwierdź, żeby weszła.';
  }
  function confirmAll() {
    const M = S.M; const T = M.teams[S.userSide];
    const nSubs = ui.pend.length;
    if (nSubs) confirmSubs();
    const subMsg = nSubs ? ui.subMsg : '';
    const diff = tacDiff(T);
    let tacMsg = '';
    if (diff.n) {
      const patch = { instructions: diff.ins };
      if (diff.formation) patch.formation = diff.formation;
      const r = changeTactics(M, S.userSide, patch);
      tacMsg = r?.adapt ? `Taktyka wejdzie w pełni po ok. ${Math.round(r.adapt)} min (koszt spójności ${r.cost}).` : 'Taktyka obowiązuje od razu.';
    }
    ui.tac = null;
    ui.subMsg = [subMsg, tacMsg].filter(Boolean).join(' ');
    if (S.step.startsWith('live')) updateLive();
  }
  function confirmSubs() {
    const M = S.M; const T = M.teams[S.userSide];
    const done = []; const errors = [];
    for (const x of ui.pend) {
      const r = substitute(M, S.userSide, x.out, x.in);
      if (r.ok) done.push(x); else errors.push(r.error);
    }
    ui.pend = []; ui.subSel = null;
    ui.subMsg = errors.length ? `Wykonano ${done.length} z ${done.length + errors.length} zmian: ${errors.join(' ')}` : `Wykonano ${done.length} ${done.length === 1 ? 'zmianę' : done.length < 5 ? 'zmiany' : 'zmian'}.`;
    if (S.step.startsWith('live')) updateLive();
    void T;
  }
  /** Przeciąganie w panelu zmian (Pointer Events): z ławki na boisko albo z boiska na ławkę. */
  function mountSubsDrag(dlg) {
    if (dlg.dataset.sdnd) return;
    dlg.dataset.sdnd = '1';
    // Escape nie gubi niezatwierdzonych zmian
    dlg.addEventListener('cancel', (ev) => {
      if (dlg.classList.contains('mm-dlg') && (ui.pend?.length || tacDiff(S.M.teams[S.userSide]).n)) { ev.preventDefault(); ui.subMsg = 'Masz niezatwierdzone zmiany. Zatwierdź je albo odrzuć.'; openDialog('manage'); }
    });
    dlg.addEventListener('change', (ev) => {
      const t = ev.target;
      if (!dlg.classList.contains('mm-dlg')) return;
      const T = S.M.teams[S.userSide];
      if (t.matches('[data-ins]')) { tacDraft(T).ins[t.dataset.ins] = t.value; ui.subMsg = ''; openDialog('manage'); }
      if (t.id === 'mdForm') { tacDraft(T).formation = t.value; ui.subMsg = ''; openDialog('manage'); }
    });
    let pending = null; let drag = null;
    dlg.addEventListener('pointerdown', (ev) => {
      const el = ev.target.closest('[data-sdrag]');
      if (!el || el.disabled || !ev.isPrimary) return;
      if (ev.pointerType === 'touch' && !ev.target.closest('[data-shandle]')) return;
      pending = { el, src: el.dataset.sdrag, x: ev.clientX, y: ev.clientY, id: ev.pointerId };
    });
    dlg.addEventListener('pointermove', (ev) => {
      if (pending && !drag && Math.hypot(ev.clientX - pending.x, ev.clientY - pending.y) > 6) {
        drag = { ...pending, ghost: document.createElement('div') };
        drag.ghost.className = 'sub-ghost';
        drag.ghost.textContent = pending.el.dataset.name ?? '';
        dlg.appendChild(drag.ghost);
        try { pending.el.setPointerCapture(ev.pointerId); } catch { /* bez przechwytu */ }
        dlg.classList.add('is-dragging');
      }
      if (!drag) return;
      ev.preventDefault();
      // Autoprzewijanie okna przy górnej i dolnej krawędzi (na telefonie listy są jedna pod drugą)
      const sc = dlg.querySelector('.mm__lists') ?? dlg;
      const scr = getComputedStyle(sc).overflowY === 'auto' ? sc : dlg;
      const rr = scr.getBoundingClientRect();
      drag.edge = ev.clientY < rr.top + 50 ? -1 : ev.clientY > rr.bottom - 50 ? 1 : 0;
      if (drag.edge && !drag.raf) {
        const tick = () => { if (!drag || !drag.edge) { if (drag) drag.raf = 0; return; } scr.scrollTop += drag.edge * 10; drag.raf = requestAnimationFrame(tick); };
        drag.raf = requestAnimationFrame(tick);
      }
      const r = dlg.getBoundingClientRect();
      drag.ghost.style.left = `${ev.clientX - r.left + dlg.scrollLeft}px`;
      drag.ghost.style.top = `${ev.clientY - r.top + dlg.scrollTop - (ev.pointerType === 'touch' ? 40 : 0)}px`;
      dlg.querySelectorAll('.is-target').forEach((x) => x.classList.remove('is-target'));
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-sdrop]');
      if (over && over.dataset.sdrop.split(':')[0] !== drag.src.split(':')[0]) over.classList.add('is-target');
    });
    const end = (ev) => {
      if (drag) {
        const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-sdrop]');
        drag.ghost.remove(); dlg.classList.remove('is-dragging'); drag.edge = 0;
        const [sk, sid] = drag.src.split(':');
        if (over) {
          const [dk, did] = over.dataset.sdrop.split(':');
          if (dk !== sk) { const err = planSub(sk === 'on' ? sid : did, sk === 'bench' ? sid : did); ui.subMsg = err ?? 'Zmiana zaplanowana. Zatwierdź, żeby weszła.'; ui.subSel = null; }
          else ui.subMsg = 'Upuść rezerwowego na zawodnika na boisku (albo odwrotnie).';
        }
        drag = null; pending = null;
        ui.suppressClick = Date.now() + 400;
        openDialog('manage');
        return;
      }
      pending = null;
    };
    dlg.addEventListener('pointerup', end);
    dlg.addEventListener('pointercancel', () => { if (drag) { drag.ghost.remove(); dlg.classList.remove('is-dragging'); } drag = null; pending = null; });
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
      (S.step === 'etbreak' ? btn('resumeET', 'Rozpocznij dogrywkę') : btn('toHalfTalk', 'Odprawa w przerwie')) + btn('dlg:manage', 'Zmiany i taktyka', false));
    if (!app.querySelector('#mdDlg')) app.insertAdjacentHTML('beforeend', '<dialog id="mdDlg" class="panel md-dlg"></dialog>');
  }

  // Studio pomeczowe: każda sekcja ma własną formę (oś czasu, paski, cytaty, oceny), żeby nic się nie zlewało
  function renderPost() {
    const p = S.post; const r = S.result;
    const mine = S.userSide === 0 ? p.ratings.home : p.ratings.away;
    const tb = p.table?.user; const move = tb && tb.before != null ? tb.before - tb.after : 0;
    const off = [...p.injuries.map((x) => ({ k: 'inj', t: x.text })), ...p.suspensions.map((x) => ({ k: 'sus', t: `${x.name} (${x.team}) pauzuje: ${x.reason}` }))];
    shell(`
      <h1 class="sr-only">Studio pomeczowe</h1>
      <div class="pst">
        <section class="pst__score">
          <div class="final"><div class="board"><div class="board__t">${crest(fixture.home, 34)}<span>${esc(shortName(0))}</span></div><div><div class="board__score">${r.score[0]}:${r.score[1]}</div><span class="board__min">${r.shootout ? `karne ${r.shootout.goals[0]}:${r.shootout.goals[1]}` : r.extraTime ? 'po dogrywce' : 'Koniec'}</span></div><div class="board__t"><span>${esc(shortName(1))}</span>${crest(fixture.away, 34)}</div></div></div>
          <p class="pst__verdict"><span>Do przerwy ${esc(p.result.halftime)}</span>${esc(p.stats.verdict)}</p>
        </section>
        ${p.motm ? `<section class="pst__motm"><small>Zawodnik meczu</small><strong>${esc(p.motm.name)}</strong><span>${esc(p.motm.team)}</span><b class="rt rt--${rBand(p.motm.rating)}">${p.motm.rating.toFixed(1)}</b></section>` : ''}
        <section class="pcard pcard--moments"><h2>Kluczowe momenty</h2>
          <ol class="tl">${p.keyMoments.map((m) => { const [, min, rest] = /^(\S+')\s(.*)$/.exec(m.text) ?? [null, '', m.text]; const sd = sideIdx(m.side); return `<li class="tl__i tl--${esc(m.type ?? '')}"${sd != null ? ` data-side="${sd}"` : ''}><span class="tl__m">${esc(min)}</span><span class="tl__k" aria-hidden="true">${MOMENT_ICON[m.type] ?? ''}</span><span class="tl__t">${esc(rest)}</span></li>`; }).join('') || '<li class="tl__i"><span class="tl__m"></span><span class="tl__k"></span><span class="tl__t">Mecz bez wielkich emocji.</span></li>'}</ol>
          ${p.controversies.length ? `<h3>Kontrowersje</h3><ul class="pst-list">${p.controversies.map((c) => `<li>${esc(c.text)}</li>`).join('')}</ul>` : ''}</section>
        <section class="pcard pcard--stats"><h2>Statystyki</h2>
          <div class="pst-teams"><span>${esc(shortName(0))}</span><span>${esc(shortName(1))}</span></div>
          <table class="vs"><tbody>${STAT_ROWS.map(([k, l]) => { const a = Number(p.stats.home[k]); const b = Number(p.stats.away[k]); const t = a + b || 1; return `<tr><td>${p.stats.home[k]}</td><td class="lbl">${esc(l)}<div class="bar2"><i class="bh" style="width:${a / t * 100}%"></i><i class="ba" style="width:${b / t * 100}%"></i></div></td><td>${p.stats.away[k]}</td></tr>`; }).join('')}</tbody></table></section>
        <div class="pst__side">
        <section class="pcard pcard--voices"><h2>Reakcje</h2>
          ${p.headline ? `<blockquote class="paper"><p>${esc(p.headline.text)}</p><footer>Nagłówek dnia</footer></blockquote>` : ''}
          <ul class="voices">${[['Zarząd', p.reactions.board.text, p.reactions.board.delta], ['Kibice', p.reactions.fans.text, p.reactions.fans.delta], ['Media', p.reactions.media.text, null]].map(([k, t, d]) => `<li class="voice${d > 0 ? ' is-up' : d < 0 ? ' is-down' : ''}"><span class="voice__k">${k}</span><span>${esc(t)}</span></li>`).join('')}</ul></section>
        <section class="pcard pcard--after"><h2>Po meczu</h2>
          ${tb ? `<div class="pos-move ${move > 0 ? 'is-up' : move < 0 ? 'is-down' : ''}"><b>${tb.after}.</b><span>miejsce w tabeli${tb.before != null ? `<small>${move > 0 ? `awans o ${move}` : move < 0 ? `spadek o ${-move}` : 'bez zmian'} (przed meczem ${tb.before}.)</small>` : ''}</span></div>` : ''}
          <ul class="pst-list">${off.map((x) => `<li class="is-${x.k}">${esc(x.t)}</li>`).join('') || '<li>Bez nowych kontuzji i pauz.</li>'}</ul></section>
        </div>
        <section class="pcard pcard--ratings"><h2>Oceny: ${esc(userName)}</h2>
          <ol class="rts">${mine.map((x) => `<li><b class="rt rt--${rBand(x.rating)}">${x.rating.toFixed(1)}</b><span>${esc(x.name)}</span></li>`).join('')}</ol></section>
      </div>`,
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
    if (act === 'haltSug') {
      const a = ui.sugg?.[Number(arg)];
      if (a) {
        const r = applySuggestion(M, S.userSide, a);
        ui.suggMsg = r?.ok === false ? (r.error ?? 'Nie udało się.') : `Wykonano: ${suggLabel(a)}.`;
        try { ui.sugg = assistantSuggest(M, S.userSide).slice(0, 3); } catch { ui.sugg = []; }
        renderSugg();
        updateLive();
      }
    }
    if (act === 'haltGo') { if (app.querySelector('#mdDlg')?.open) return; start(); }
    if (act === 'speed') { ui.speed = Number(arg); app.querySelectorAll('.speed').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.md === `speed:${arg}`))); if (ui.running) { stop(); start(); } }
    if (act === 'tab') { ui.tab = arg; app.querySelectorAll('[data-md^="tab:"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.md === `tab:${arg}`))); updateLive(); }
    if (act === 'skip') { stop(); MD.skip(S); route(); }
    if (act === 'dlg') { if (ui.running) stop(); openDialog(arg, true); }
    if (act === 'mmTab') { ui.mmTab = arg; openDialog('manage'); }
    if (act === 'mmConfirm') { confirmAll(); openDialog('manage'); }
    if (act === 'mmDiscard') { ui.pend = []; ui.tac = null; ui.subSel = null; ui.subMsg = 'Odrzucono niezatwierdzone zmiany.'; openDialog('manage'); }
    if (act === 'tacUndo') { const T = M.teams[S.userSide]; const d = tacDraft(T); if (arg === 'formation') d.formation = T.formation.id; else d.ins[arg] = String(T.tactics.instructions?.[arg] ?? ''); openDialog('manage'); }
    if (act === 'closeDlg') app.querySelector('#mdDlg')?.close();
    if (act === 'subPick') { if (Date.now() < (ui.suppressClick ?? 0)) return; const [k, id] = arg.split('|'); pickSub(k, id); openDialog('manage'); }
    if (act === 'subDrop') { ui.pend.splice(Number(arg), 1); ui.subMsg = 'Usunięto zaplanowaną zmianę.'; openDialog('manage'); }
    if (act === 'subClose') {
      if (ui.pend?.length || tacDiff(M.teams[S.userSide]).n) { ui.subMsg = 'Masz niezatwierdzone zmiany. Zatwierdź je albo odrzuć.'; openDialog('manage'); return; }
      ui.subSel = null; ui.subMsg = ''; ui.tac = null; app.querySelector('#mdDlg')?.close();
    }
    if (act === 'doShout') { const r = shout(M, S.userSide, arg); app.querySelector('#mdDlgMsg').textContent = r.ok ? 'Drużyna usłyszała okrzyk.' : r.error; updateLive(); }
    if (act === 'toHalfTalk') { S.step = 'odprawa2'; ui.adv = null; ui.sel = {}; route(); }
    if (act === 'resume' || act === 'resumeET') { MD.continueAfterBreak(S); route(); }
    if (act === 'toPostTalk') { S.step = 'odprawa3'; ui.sel = {}; ui.adv = null; route(); }
    if (act === 'pressOpen' || act === 'pressView') { MD.pressOpen(game, S); ui.prsConfirm = false; renderPressDialog(); }
    if (act === 'pressAns') { MD.pressAnswer(game, S, Number(arg)); if (S.pressSettled) await save(); renderPressDialog(); }
    if (act === 'pressOut') { ui.prsConfirm = true; renderPressDialog(); }
    if (act === 'pressOutNo') { ui.prsConfirm = false; renderPressDialog(); }
    if (act === 'pressOutYes') { ui.prsConfirm = false; MD.pressWalkOut(game, S); await save(); renderPressDialog(); }
    if (act === 'pressClose') app.querySelector('#mdPress')?.close();
    if (act === 'exit') { stop(); MD.closeMatchday(game, S); app.querySelector('#mdPress')?.remove(); cleanup(); await save(); onExit(); }
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
