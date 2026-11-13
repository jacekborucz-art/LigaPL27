// Ekran dnia meczowego (etap 5): studio, odprawa, mecz na żywo (1 minuta = 1 s, GOL 3 s),
// przerwa z odprawą, studio pomeczowe, odprawa pomeczowa i konferencja prasowa (opcjonalna, osobne okno).
// Logika: src/match/matchday.js; silnik: src/engine/match; wygląd: design/dzien-meczowy.html.
// Mecz na żywo na PC: składy obu drużyn po bokach boiska (oceny na żywo, kartki, urazy, kondycja), na tablicy wyniku
// strzelcy i czerwone kartki; okno „Zmiany i taktyka” z dowolnym ustawieniem zawodników (także w osłabieniu).

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
import { substitute, changeTactics, shout, canShout, assistantSuggest, applySuggestion, playerStates, previewShape } from '../engine/match/match.js';
import { proficiency, byPosition, posEff } from '../engine/positions.js';
import { openMenu, closeMenu, bindContextTrigger, showToast as menuToast } from './contextMenu.js';
import { SHOUTS, SHOUT_COOLDOWN, SHOUT_DURATION } from '../engine/match/constants.js';
import { TONES, TALKS, POST_TONES, MAX_TALKS } from '../match/briefings.js';
import * as MD from '../match/matchday.js';
import { CLIMATES, currentQuestion, progress, effectWords } from '../match/press.js';
import { friendlyRuleTags, friendlyRulesOf } from '../training/friendlies.js';
import { attrGroupsHtml } from './squadView.js';
import { formChartHtml } from './formChart.js';
import { positionMapHtml } from './positionMap.js';
import { NAT_NAMES } from '../data/names.js';
import { POS_NAMES } from '../data/attributes.js';
import { moraleLabel } from '../career/morale.js';

const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const crest = (id, size) => (anyClub(id) ? crestHtml(anyClub(id), { size, clubsById }) : '');
const STEPS = [['studio', 'Studio'], ['odprawa', 'Odprawa'], ['live1', '1. połowa'], ['break', 'Przerwa'], ['odprawa2', 'Odprawa w przerwie'], ['live2', '2. połowa'], ['studio2', 'Studio pomeczowe'], ['odprawa3', 'Odprawa pomeczowa']];
const STEP_INDEX = { studio: 0, odprawa: 1, live1: 2, break: 3, odprawa2: 4, live2: 5, etbreak: 5, shootoutPrep: 5, shootout: 5, fulltime: 5, studio2: 6, odprawa3: 7, press: 7 };
const STAT_ROWS = [['possession', 'Posiadanie %'], ['shots', 'Strzały'], ['onTarget', 'Celne'], ['xg', 'xG'], ['passes', 'Podania'], ['passAccuracy', 'Celność podań %'], ['corners', 'Rożne'], ['throwIns', 'Auty'], ['fouls', 'Faule'], ['offsides', 'Spalone'], ['yellow', 'Żółte kartki'], ['red', 'Czerwone kartki'], ['saves', 'Obrony']];

function luminance(hex) {
  const n = parseInt((hex || '#888888').slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}
const MOMENT_ICON = { goal: 'GOL', var: 'VAR', red: 'CZ', penMiss: 'K', chance: 'SZ', injury: '+' };
const rBand = (r) => (r >= 7.5 ? 'top' : r >= 6.8 ? 'good' : r >= 6.0 ? 'mid' : 'low');
const sideIdx = (sd) => (sd === 'home' || sd === 0 ? 0 : sd === 'away' || sd === 1 ? 1 : null);
// Ikony (inline SVG, działają offline). Tekst dla czytnika ekranu dodaje miejsce użycia.
const ICON = {
  ball: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="#F3F6F1" stroke="#14211A" stroke-width="1.2"/><path d="M8 4.6l2.6 1.9-1 3.1H6.4l-1-3.1z" fill="#14211A"/><path d="M8 4.6V1.6M10.6 6.5l2.9-.9M9.6 9.6l1.8 2.4M6.4 9.6l-1.8 2.4M5.4 6.5l-2.9-.9" stroke="#14211A" stroke-width=".9"/></svg>',
  ballX: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="#F3F6F1" stroke="#14211A" stroke-width="1.2"/><path d="M8 4.6l2.6 1.9-1 3.1H6.4l-1-3.1z" fill="#14211A"/><path d="M2.2 13.8L13.8 2.2" stroke="#14211A" stroke-width="3.4" stroke-linecap="round"/><path d="M2.2 13.8L13.8 2.2" stroke="#D62839" stroke-width="2" stroke-linecap="round"/></svg>',
  red: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="1.8" width="8.4" height="12.4" rx="1.2" fill="#D62839" stroke="#14211A" stroke-width=".8" transform="rotate(8 8 8)"/></svg>',
  yellow: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="1.8" width="8.4" height="12.4" rx="1.2" fill="#F5C518" stroke="#14211A" stroke-width=".8" transform="rotate(8 8 8)"/></svg>',
  second: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.2" y="1.6" width="7.6" height="11.4" rx="1.1" fill="#F5C518" stroke="#14211A" stroke-width=".8" transform="rotate(-8 6 7)"/><rect x="6.4" y="3.2" width="7.6" height="11.4" rx="1.1" fill="#D62839" stroke="#14211A" stroke-width=".8" transform="rotate(8 10 9)"/></svg>',
  knock: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#14211A"/><path d="M8 3.6v8.8M3.6 8h8.8" stroke="#F3F6F1" stroke-width="2.6"/></svg>',
  hurt: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#D62839"/><path d="M8 3.6v8.8M3.6 8h8.8" stroke="#fff" stroke-width="2.6"/></svg>',
};
const ord = (label) => `minuta ${String(label ?? '').replace(/'/g, '')}`;
/** „J. Kowalski”: pierwsza litera imienia i nazwisko. */
function shortPlayerName(p) {
  if (!p) return '';
  const parts = String(p.name ?? '').trim().split(/\s+/);
  const last = p.last ?? (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]);
  const first = p.first ?? (parts.length > 1 ? parts[0] : '');
  return first ? `${first[0]}. ${last}` : last;
}
const lastName = (p) => p?.last ?? String(p?.name ?? '').trim().split(/\s+/).slice(-1)[0] ?? '';
const fitBand = (prof) => (prof >= 85 ? 'ok' : prof >= 60 ? 'mid' : 'bad');

/**
 * Linie zdarzeń pod nazwami drużyn na tablicy: strzelcy (karny „k.”, samobój „sam.”), niestrzelone karne,
 * czerwone kartki, gole nieuznane po VAR. Jeden wpis na zawodnika, znaki w kolejności minut.
 * events: dziennik silnika, who(id) -> zawodnik (p). Zwraca [[wpisy gospodarzy], [wpisy gości]].
 */
export function scoreboardLines(events, who) {
  const out = [new Map(), new Map()];
  const add = (side, key, p, mark, suffix = '') => {
    if (side == null || !out[side]) return;
    if (!out[side].has(key)) out[side].set(key, { name: shortPlayerName(p) || 'Zawodnik', suffix, marks: [] });
    out[side].get(key).marks.push(mark);
  };
  const varRed = new Set(events.filter((e) => e.type === 'varOverturn' && e.decision === 'redCard').map((e) => `${e.t}:${e.pid}`));
  for (const e of events) {
    if (e.type === 'goal' && !e.provisional) {
      if (e.ownGoal) add(e.side, `og:${e.ogId}`, who(e.ogId), { k: 'og', min: e.min }, 'sam.');
      else add(e.side, e.pid, who(e.pid), { k: e.how === 'PEN' ? 'pen' : 'goal', min: e.min });
    } else if (e.type === 'varOverturn' && e.cancelGoal) {
      add(e.side, e.pid, who(e.pid), { k: 'nogoal', min: e.min });
    } else if ((e.type === 'shotOn' || e.type === 'shotOff') && e.penalty) {
      add(e.side, e.pid, who(e.pid), { k: 'penmiss', min: e.min });
    } else if (e.type === 'red' && e.pid) {
      add(e.side, e.pid, who(e.pid), { k: e.second ? 'second' : 'red', min: e.min, viaVar: varRed.has(`${e.t}:${e.pid}`) });
    }
  }
  return out.map((m) => [...m.values()]);
}
const MARK = {
  goal: [ICON.ball, 'gol'], pen: [ICON.ball, 'gol z rzutu karnego', 'k.'], og: [ICON.ball, 'gol samobójczy'],
  penmiss: [ICON.ballX, 'niestrzelony rzut karny'], red: [ICON.red, 'czerwona kartka'], second: [ICON.second, 'druga żółta i czerwona kartka'],
  nogoal: [ICON.ball, 'gol nieuznany po analizie VAR'],
};
function linesHtml(list) {
  return list.map((it) => `<li><span class="bev__n">${esc(it.name)}${it.suffix ? ` <small>(${esc(it.suffix)})</small>` : ''}</span>${it.marks.map((m) => {
    const [icon, label, tag] = MARK[m.k];
    return `<span class="bev__m bev__m--${m.k}">${icon}${tag ? `<small aria-hidden="true">${tag}</small>` : ''}${m.k === 'nogoal' || m.viaVar ? '<b class="var" aria-hidden="true">VAR</b>' : ''}<span class="bev__t" aria-hidden="true">${esc(m.min)}</span><span class="sr-only">${esc(label)}${m.viaVar ? ' po analizie VAR' : ''}, ${esc(ord(m.min))}</span></span>`;
  }).join('')}</li>`).join('');
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
export function mountMatchday(app, { game, fixture, save, onExit, onLineup }) {
  const S = MD.startMatchday(game, fixture);
  const ui = { speed: 1, running: false, timer: null, sel: {}, tab: 'feed', overlay: null, adv: null, dialog: null, raf: null, dots: [] };
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
  // Tablica wyniku: pełne nazwy na szerszym ekranie (krótkie na telefonie), pod nazwami strzelcy i czerwone kartki
  const teamName = (sd) => `<span class="nm"><span class="nm__full">${esc(sideName(sd))}</span><span class="nm__short" aria-hidden="true">${esc(shortName(sd))}</span></span>`;
  function whoById(id) {
    if (!id || !S.M) return null;
    for (const T of S.M.teams) { const x = T.players.find((y) => y.id === id) ?? T.bench.find((y) => y.id === id); if (x) return x.p; }
    return game.world?.players?.[id] ?? null;
  }
  const evLines = () => (S.M ? scoreboardLines(S.M.events, whoById) : [[], []]);
  // Pasek informacji pod tablicą wyniku: rozgrywki, pogoda, sędzia, miejsce, widzowie (dane ze studia przedmeczowego)
  const MI = {
    comp: '<path d="M5 2h6v2.5a3 3 0 0 1-6 0zM5 3H2.5a2 2 0 0 0 2.6 2.6M11 3h2.5a2 2 0 0 1-2.6 2.6M8 7.5V11M5.5 13.5h5M6.5 11h3l.5 2.5h-4z"/>',
    slonce: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"/>',
    pochmurno: '<path d="M4.5 12.5h7a2.8 2.8 0 0 0 .3-5.6A3.8 3.8 0 0 0 4.6 7a2.8 2.8 0 0 0-.1 5.5z"/>',
    deszcz: '<path d="M4.5 9.5h7a2.6 2.6 0 0 0 .3-5.2A3.6 3.6 0 0 0 4.6 4.4a2.6 2.6 0 0 0-.1 5.1zM5.5 11.5l-.8 2M8.5 11.5l-.8 2M11.5 11.5l-.8 2"/>',
    snieg: '<path d="M8 1.8v12.4M2.6 4.9l10.8 6.2M2.6 11.1l10.8-6.2M6.5 2.8 8 4.2l1.5-1.4M6.5 13.2 8 11.8l1.5 1.4"/>',
    wiatr: '<path d="M1.5 6h8.2a2 2 0 1 0-2-2M1.5 9.5h11a2 2 0 1 1-2 2M1.5 12.5h5"/>',
    ref: '<path d="M2.5 9.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0zM6 6V3.5h7.5v3H9.3"/><circle cx="6" cy="9.5" r=".6"/>',
    venue: '<path d="M8 14.5s4.5-4.2 4.5-8a4.5 4.5 0 0 0-9 0c0 3.8 4.5 8 4.5 8z"/><circle cx="8" cy="6.5" r="1.6"/>',
    crowd: '<circle cx="5.5" cy="5" r="2"/><circle cx="11" cy="5.5" r="1.7"/><path d="M1.8 13.5a3.7 3.7 0 0 1 7.4 0M8.6 13.5a3 3 0 0 1 5.6-1.6"/>',
  };
  const miIcon = (k) => `<svg class="minfo__i" viewBox="0 0 16 16" aria-hidden="true">${MI[k] ?? MI.pochmurno}</svg>`;
  const num = (n) => Math.round(n).toLocaleString('pl-PL');
  function matchInfoHtml() {
    const c = S.pre?.conditions;
    if (!c) return '';
    const home = anyClub(fixture.home)?.name ?? '';
    const venue = fixture.neutral ? (fixture.venue ? `${fixture.venue}, teren neutralny` : 'Teren neutralny') : `Stadion gospodarzy, ${home}`;
    const att = c.attendance ?? {};
    const crowd = !att.expected ? 'Mecz bez publiczności'
      : `Widzowie: ok. ${num(att.expected)}${att.capacity ? ` z ${num(att.capacity)}` : ''}`;
    const items = [
      ['comp', compLabel(fixture), 'Rozgrywki'],
      [S.weather?.type ?? 'pochmurno', `${c.weather.label}${c.weather.tempC != null ? `, ${c.weather.tempC}°C` : ''}`, `Pogoda. Murawa: ${c.pitch.label.toLowerCase()}`],
      ['ref', `Sędzia: ${c.referee.name}${c.referee.var ? ', VAR' : ''}`, `${c.referee.label}: średnio ${String(c.referee.expectedYellows).replace('.', ',')} żółtej kartki na mecz`],
      ['venue', venue, 'Miejsce spotkania'],
      ['crowd', crowd, att.capacity ? `Zapełnienie ok. ${Math.round((att.expected / att.capacity) * 100)}%` : 'Frekwencja'],
    ];
    return `<ul class="minfo" aria-label="Informacje o meczu">${items.map(([k, t, title]) => `<li class="minfo__it" data-k="${k === 'comp' || k === 'ref' || k === 'venue' || k === 'crowd' ? k : 'weather'}" title="${esc(title)}">${miIcon(k)}<span>${esc(t)}</span></li>`).join('')}</ul>`;
  }

  function boardHtml(score, minLabel, { size = 30, live = false } = {}) {
    const [h, a] = evLines();
    return `<div class="board${h.length || a.length ? ' has-ev' : ''}" ${live ? 'id="mdBoard" aria-live="off"' : ''}>
      <div class="board__t">${crest(fixture.home, size)}${teamName(0)}</div>
      <div class="board__mid"><div class="board__score"${live ? ' id="mdScore"' : ''}>${score[0]}:${score[1]}</div><span class="board__min"${live ? ' id="mdMin"' : ''}>${esc(minLabel)}</span></div>
      <div class="board__t">${teamName(1)}${crest(fixture.away, size)}</div>
      <ul class="bev bev--h" ${live ? 'id="mdEvH"' : ''} aria-label="Zdarzenia: ${esc(sideName(0))}">${linesHtml(h)}</ul>
      <ul class="bev bev--a" ${live ? 'id="mdEvA"' : ''} aria-label="Zdarzenia: ${esc(sideName(1))}">${linesHtml(a)}</ul>
    </div>`;
  }
  const btn = (act, label, primary = true) => `<button class="btn ${primary ? 'btn--primary' : 'btn--quiet'}" data-md="${act}">${esc(label)}</button>`;
  // Przyciski z własnym kolorem znaczenia: skład (morski jak instrukcje taktyczne), prasa (niebieski jak panel mediów)
  const btnC = (act, label, cls) => `<button class="btn ${cls}" data-md="${act}">${esc(label)}</button>`;

  // ------------------------------------------------------------ Studio przedmeczowe
  function renderStudio() {
    const p = S.pre;
    const form = (r) => `<span class="form">${r.results.map((c) => `<b class="${c}">${c}</b>`).join('')}</span>`;
    const absList = (a) => [...a.injured.map((x) => `${x.name} (${x.pos}), uraz, ok. ${x.days} dni`), ...a.suspended.map((x) => `${x.name} (${x.pos}), pauza`)];
    const absH = absList(p.absences.home); const absA = absList(p.absences.away);
    const c = p.conditions;
    shell(`
      <h1>Studio przedmeczowe</h1>
      ${renderPressDoor('pre', true)}
      <div class="fixture">
        <div class="fixture__team">${crest(fixture.home, 64)}${esc(p.preview.home.name)}</div>
        <div class="fixture__mid"><span class="led">${esc(fixture.time ?? '')}</span></div>
        <div class="fixture__team">${crest(fixture.away, 64)}${esc(p.preview.away.name)}</div>
      </div>
      <p class="fixture__meta">${esc(compLabel(fixture))}, ${esc(p.date)}. ${esc(p.preview.rank.label)}.</p>
      ${fixture.comp === 'friendly' ? `<p class="fixture__meta md-rules">Umowa klubów: ${friendlyRuleTags(fixture).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</p>` : ''}
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
      <section class="sec"><h2>Pogoda</h2>
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
          ${p.scouting ? `<br><br>${esc(p.scouting.text)}` : ''}
          <footer>Asystent trenera</footer></blockquote>
      </section>
      <section class="sec"><h2>Oczekiwania</h2>
        <ul class="plain-list"><li><span class="k">Zarząd</span><span>${esc(p.expectations.board)}</span></li><li><span class="k">Kibice</span><span>${esc(p.expectations.fans)}</span></li>${p.expectations.notes.map((n) => `<li><span class="k"></span><span>${esc(n)}</span></li>`).join('')}</ul>
      </section>
      </div>
      <section class="sec"><h2>Nagłówki dnia</h2><ul class="headlines">${p.headlines.map((h) => `<li>${esc(h.text)}</li>`).join('')}</ul>
        ${game.press?.last && CLIMATES[game.press.climate] ? `<p class="press-note">${climateChip(game.press.climate)}<span>${esc(game.press.left > 0 ? 'Ta narracja w mediach jeszcze trwa.' : 'Klimat po ostatnim meczu. Może się zmienić po tym spotkaniu.')}${game.press.log?.at(-1)?.headline ? ` Ostatni nagłówek o trenerze: „${esc(game.press.log.at(-1).headline)}”.` : ''}</span></p>` : ''}</section>`,
      preActions());
  }

  // ------------------------------------------------------------ Odprawy
  function renderTalk(phase) {
    const players = phase === 'pre' ? MD.matchSquadPlayers(game, S) : phase === 'half' ? onPitch(S.M.teams[S.userSide], S.M.minute).map((x) => x.p) : S.result.ratings.filter((x) => x.side === S.userSide).map((r) => game.world.players[r.id]).filter(Boolean);
    const done = S.briefings[phase];
    const tones = phase === 'post' ? POST_TONES : TONES;
    if (!ui.adv) { try { ui.adv = phase === 'pre' ? MD.preAdvice(game, S) : phase === 'half' ? MD.halfAdvice(game, S) : MD.postAdvice(game, S); } catch { ui.adv = null; } }
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
      ${phase === 'post' ? renderPressDoor('post', !!done) : ''}
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
      done ? (phase === 'pre' ? btn('kickoff', 'Wyjdź na boisko') : phase === 'half' ? btn('resume', 'Rozpocznij 2. połowę') + secondBtn() + btn('dlg:manage', 'Zmiany i taktyka', false) : postActions())
        : btn(`speech:${phase}`, 'Wygłoś odprawę') + (phase === 'half' ? secondBtn() + btn('dlg:manage', 'Zmiany i taktyka', false) : phase === 'pre' ? lineupBtn() : ''));
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

  const slotOf = (ph) => MD.pressSlot(S, ph);

  /** Pasek przed salą (studio przed meczem, odprawa po meczu): klimat, kto czeka, co da pominięcie. */
  function renderPressDoor(ph, ready) {
    const room = MD.pressSetup(game, S, ph);
    if (!room) return '';
    const cl = room.climate.climate;
    const slot = slotOf(ph);
    const eff = slot.result;
    const label = ph === 'pre' ? 'Konferencja przedmeczowa' : 'Konferencja prasowa';
    if (eff) {
      const verb = eff.mode === 'skipped' ? `${label}: pominięta.` : eff.mode === 'walkout' ? 'Wyszedłeś z sali przed końcem.' : `${label}: zakończona.`;
      return `<section class="pdoor" data-c="${cl}" aria-label="${label}">
        <div class="pdoor__head">${climateChip(cl)}<span class="pdoor__state">${esc(verb)}</span></div>
        ${eff.headline ? `<blockquote class="paper paper--sm"><p>${esc(eff.headline.text)}</p><footer>${esc(eff.headline.outlet)}</footer></blockquote>` : ''}
      </section>`;
    }
    const outlets = MD.pressRoomPreview(game, S, ph).map((j) => j.outlet);
    const started = slot.conf?.answers?.length;
    const skipTxt = ph === 'pre'
      ? `${label} jest opcjonalna. Jeśli od razu przejdziesz do odprawy, media napiszą zapowiedź bez twoich słów${cl === 'agresywna' ? ', a krytyka trochę uderzy w szatnię przed meczem' : ''}.`
      : `Konferencja jest opcjonalna. ${CLIMATES[cl].skip}`;
    return `<section class="pdoor" data-c="${cl}" aria-label="${label}">
      <div class="pdoor__head">${climateChip(cl)}<span class="pdoor__state">${esc(CLIMATES[cl].mood)}</span></div>
      <p class="pdoor__why">${esc(room.climate.reasons.join('. '))}. Na sali: ${esc(outlets.join(', '))}.</p>
      <p class="pdoor__skip">${ready ? esc(started ? `${label} trwa. Wróć do sali albo idź dalej, żeby ją zakończyć.` : skipTxt) : 'Po odprawie w szatni możesz pójść na konferencję prasową albo ją pominąć.'}</p>
    </section>`;
  }

  function pressButtons(ph) {
    if (!MD.pressSetup(game, S, ph)) return '';
    const slot = slotOf(ph);
    if (slot.result) return btnC(`pressView:${ph}`, 'Podsumowanie konferencji', 'btn--press');
    return btnC(`pressOpen:${ph}`, slot.conf?.answers?.length ? 'Wróć na konferencję' : ph === 'pre' ? 'Konferencja przedmeczowa' : 'Konferencja prasowa', 'btn--press');
  }
  // Zmiana składu przed meczem: powrót do ekranu Skład i taktyka (tylko przed odprawą w szatni)
  const lineupBtn = () => (onLineup && !S.briefings?.pre ? btnC('toLineup', 'Zmień skład', 'btn--lineup') : '');
  const preActions = () => lineupBtn() + pressButtons('pre') + btn('toBriefing', 'Przejdź do odprawy');
  const postActions = () => pressButtons('post') + btn('exit', 'Dalej');

  /** Ścianka za stołem: herb klubu i znak ligi na przemian (dekoracja, ukryta przed czytnikiem ekranu). */
  function wallTiles() {
    const c = anyClub(game.clubId);
    const id = c?.parent ?? c?.id;
    const crestImg = CRESTS_AVAILABLE.has(id) ? `<img src="assets/crests/${esc(id)}-48.webp" alt="" width="30" height="30">` : fallbackCrestSvg(c).replace('<svg ', '<svg width="26" height="30" aria-hidden="true" ');
    return `<div class="prs__tiles" aria-hidden="true">${Array.from({ length: 48 }, (_, i) => `<span>${(i + Math.floor(i / 12)) % 2 ? '<b>LigaPL27</b>' : crestImg}</span>`).join('')}</div>`;
  }

  function pressDialog() {
    let dlg = app.querySelector('#mdPress');
    if (!dlg) {
      app.insertAdjacentHTML('beforeend', `<dialog id="mdPress" class="prs" aria-labelledby="prsTitle"></dialog>`);
      dlg = app.querySelector('#mdPress');
      dlg.addEventListener('cancel', (ev) => {
        // Escape: przed pierwszą odpowiedzią i po końcu zamyka okno; w trakcie pyta o wyjście z sali
        const sl = slotOf(ui.prsPhase);
        if (sl.settled || !sl.conf?.answers?.length) return;
        ev.preventDefault(); ui.prsConfirm = true; renderPressDialog();
      });
      dlg.addEventListener('close', () => {
        ui.prsConfirm = false;
        if (S.step === 'odprawa3') { renderTalk('post'); app.querySelector('[data-md="exit"]')?.focus(); }
        if (S.step === 'studio') { renderStudio(); app.querySelector('[data-md="toBriefing"]')?.focus(); }
      });
    }
    return dlg;
  }

  function renderPressDialog() {
    const dlg = pressDialog();
    const ph = ui.prsPhase ?? 'post';
    const pre = ph === 'pre';
    const slot = slotOf(ph);
    const conf = slot.conf;
    const cl = conf.climate;
    const q = currentQuestion(conf);
    const pr = progress(conf);
    const askedBy = new Set(conf.queue.slice(0, conf.idx).map((x) => x.by?.id).filter(Boolean));
    const header = `<header class="prs__wall" data-c="${cl}">${wallTiles()}
        <div class="prs__bar">
          <div><h2 id="prsTitle">${pre ? 'Konferencja przedmeczowa' : 'Konferencja prasowa'}</h2>
            <p class="prs__match">${pre ? `${esc(sideName(0))} kontra ${esc(sideName(1))}, ${esc(S.pre.date)}` : `${esc(sideName(0))} ${esc(S.post.result.score)} ${esc(sideName(1))}`}</p></div>
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
    const transcript = conf.answers.length ? `<details class="prs__log" ${slot.settled ? '' : 'open'}><summary>Zapis konferencji</summary><ol>${conf.answers.map((a) => {
      const by = conf.room.find((j) => j.id === a.by);
      return `<li><p class="prs__lq"><b>${esc(by ? `${by.name}, ${by.outlet}` : conf.officer.name)}:</b> ${esc(a.question)}</p><p class="prs__la">${esc(a.text)}</p></li>`;
    }).join('')}</ol></details>` : '';
    let stage;
    if (slot.settled) {
      const eff = slot.result;
      const after = pre ? (eff.promisesAdd?.length ? 'Media sprawdzą twoje zapowiedzi po meczu.' : 'Przed meczem prasa działa na szatnię słabiej niż po meczu.')
        : game.press?.left > 0 ? `Ta atmosfera w mediach może potrwać jeszcze ${game.press.left === 1 ? 'mecz' : `${game.press.left} mecze`}.` : 'Klimat w mediach może się zmienić po kolejnym meczu.';
      stage = `<section class="prs__stage prs__stage--after" aria-labelledby="prsAfter">
        <h3 id="prsAfter" tabindex="-1">${eff.mode === 'walkout' ? 'Wyszedłeś z sali' : 'Po konferencji'}</h3>
        ${eff.headline ? `<blockquote class="paper prs__paper"><p>${esc(eff.headline.text)}</p><footer>${esc(eff.headline.outlet)}</footer></blockquote>` : ''}
        ${wordsList(eff)}
        <p class="hint">${esc(after)}</p>
      </section>`;
    } else if (ui.prsConfirm) {
      stage = `<section class="prs__stage prs__confirm" role="alertdialog" aria-labelledby="prsConf">
        <h3 id="prsConf" tabindex="-1">Wyjść z sali przed końcem?</h3>
        <p>Dziennikarze zapamiętają, że przerwałeś konferencję, a nagłówki napiszą się same. Szatnia odczuje presję prasy bez reszty twoich odpowiedzi.</p>
        <div class="prs__btns">${btn('pressOutYes', 'Wyjdź z sali', false)}${btn('pressOutNo', 'Zostań i odpowiadaj')}</div>
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
    const back = pre ? 'Wróć do studia' : 'Wróć do odprawy';
    const foot = slot.settled ? `${btn('pressClose', back, false)}${pre ? btn('toBriefing', 'Przejdź do odprawy') : btn('exit', 'Dalej')}`
      : ui.prsConfirm ? '' : `${conf.answers.length ? btn('pressOut', 'Wyjdź z sali', false) : btn('pressClose', back, false)}`;
    dlg.dataset.c = cl;
    dlg.innerHTML = `${header}<div class="prs__body">${room}<div class="prs__main">${stage}${transcript}</div></div>${foot ? `<footer class="prs__foot">${foot}</footer>` : ''}`;
    if (!dlg.open) dlg.showModal();
    dlg.querySelector('#prsQ, #prsAfter, #prsConf')?.focus({ preventScroll: false });
    dlg.querySelector('.prs__p.is-now')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    dlg.querySelector('.prs__main')?.scrollTo?.({ top: 0 });
  }

  // ------------------------------------------------------------ Mecz na żywo
  const SPEEDS = [[1, 'x1'], [2.5, 'x2,5'], [5, 'x5']];
  function renderLive() {
    const M = S.M;
    const skipLabel = `Pokaż wynik${S.step === 'live1' ? '<span class="tp-skip__x"> do przerwy</span>' : ''}`;
    shell(`
      <div class="live" data-tab="${ui.tab}">
        <div class="live__head" id="mdHead">
          ${boardHtml(M.score, M.events[M.events.length - 1]?.min ?? "0'", { live: true })}
          ${matchInfoHtml()}
        </div>
        <div class="live__centre">
          <div class="mom-area">
            <div class="poss poss--live" role="img" aria-label="Przewaga w ostatnich 5 minutach" title="Przewaga w ostatnich 5 minutach (posiadanie za cały mecz w statystykach)"><span id="mdPh">50%</span><div class="bar2"><i class="bh" id="mdPbh" style="width:50%"></i><i class="ba" id="mdPba" style="width:50%"></i></div><span id="mdPa">50%</span></div>
            <p class="press__lbl" id="mdPressLbl" aria-live="off">Gra wyrównana</p>
            <svg class="momentum" id="mdMom" viewBox="0 0 90 60" preserveAspectRatio="none" role="img" aria-label="Przewaga w kolejnych minutach"></svg>
          </div>
          <div class="pitch-area">
            <div class="pitch-wrap"><canvas class="pitch" id="mdPitch" aria-label="Boisko. Prawy przycisk albo przytrzymanie na zawodniku otwiera menu."></canvas>
              <div class="goal" id="mdGoal" role="status"><div class="goal__in"><b id="mdGoalTitle">GOL</b><small id="mdGoalWho"></small></div></div>
              <div class="md-toasts" id="mdToasts" aria-live="polite"></div>
              <div class="md-halt" id="mdHalt" hidden role="alertdialog" aria-labelledby="mdHaltTitle">
                <b id="mdHaltTitle">Gra wstrzymana</b><p id="mdHaltText"></p>
                <div class="md-halt__sugg" id="mdHaltSugg"></div>
                <div class="md-halt__btns"><button class="btn btn--quiet btn--sm" data-md="dlg:manage">Zmiany i taktyka</button><button class="btn btn--primary btn--sm" data-md="haltGo">Graj dalej</button></div>
              </div>
            </div>
          </div>
          <div class="live__ctrl">
            <div class="transport" role="toolbar" aria-label="Przebieg meczu">
              <button class="md-play ${ui.running ? 'is-running' : ''}" data-md="pause" id="mdPause">${ui.running ? 'Pauza' : M.minute > 0 ? 'Wznów mecz' : 'Start meczu'}</button>
              <div class="speedset" role="group" aria-label="Tempo meczu">${SPEEDS.map(([v, l]) => `<button class="speed" data-md="speed:${v}" aria-pressed="${ui.speed === v}">${l}</button>`).join('')}</div>
              <button class="tp-skip" data-md="skip" title="${S.step === 'live1' ? 'Pokaż wynik do przerwy' : 'Pokaż wynik końcowy'}">${skipLabel}</button>
            </div>
            <div class="coachbar" role="toolbar" aria-label="Decyzje trenera">
              <button class="coachbar__manage" data-md="dlg:manage">Zmiany i taktyka${M.rules?.friendly && unlimited(M) ? '<small>bez limitu</small>' : ''}</button><button class="coachbar__shout" data-md="dlg:shout">Okrzyk</button>
            </div>
          </div>
        </div>
        <div class="tabs2 live__tabs" role="tablist" aria-label="Widok">
          ${[['feed', 'Relacja'], ['stats', 'Statystyki'], ['lineups', 'Składy']].map(([k, l]) => `<button role="tab" data-md="tab:${k}" aria-selected="${ui.tab === k}">${l}</button>`).join('')}
        </div>
        <section class="feed-area" aria-labelledby="mdFeedH"><h2 id="mdFeedH">Relacja</h2><ul class="feed" id="mdFeed"></ul></section>
        <section class="stats-area" aria-labelledby="mdStatsH"><h2 id="mdStatsH">Statystyki</h2><div id="mdStats"></div></section>
        <div class="rosters">
          <section class="ros" data-side="0" id="mdRos0" aria-label="Skład: ${esc(sideName(0))}"></section>
          <section class="ros" data-side="1" id="mdRos1" aria-label="Skład: ${esc(sideName(1))}"></section>
        </div>
      </div>
      <dialog id="mdDlg" class="panel md-dlg"></dialog>`, '');
    setupCanvas();
    setupLiveLayout();
    updateLive();
  }

  // Zakładki zależą od szerokości: telefon i laptop (do 1279 px) Statystyki/Składy, PC ze składami po bokach
  // Relacja/Statystyki, bardzo szeroki ekran bez zakładek.
  const mqWide = matchMedia('(min-width: 1280px)');
  const mqHuge = matchMedia('(min-width: 1760px)');
  const mqLaptop = matchMedia('(min-width: 1024px)');
  function tabSet() { return mqHuge.matches ? [] : mqWide.matches ? ['feed', 'stats'] : mqLaptop.matches ? ['stats', 'lineups'] : ['feed', 'stats', 'lineups']; }
  function normTab() {
    const set = tabSet();
    if (set.length && !set.includes(ui.tab)) ui.tab = set[0];
    const live = app.querySelector('.live');
    if (!live) return;
    live.dataset.tab = ui.tab;
    app.querySelectorAll('.live__tabs [data-md^="tab:"]').forEach((b) => {
      const k = b.dataset.md.slice(4);
      b.hidden = !set.includes(k);
      b.setAttribute('aria-selected', String(k === ui.tab));
    });
  }
  const onMq = () => { if (S.step.startsWith('live')) { normTab(); updateLive(); } };
  mqWide.addEventListener('change', onMq); mqHuge.addEventListener('change', onMq); mqLaptop.addEventListener('change', onMq);
  let headRo = null;
  function setupLiveLayout() {
    normTab();
    headRo?.disconnect();
    const head = app.querySelector('#mdHead'); const live = app.querySelector('.live');
    if (!head || !live) return;
    headRo = new ResizeObserver(() => live.style.setProperty('--md-head', `${Math.round(head.getBoundingClientRect().height)}px`));
    headRo.observe(head);
  }

  function updateLive(newEvents = []) {
    const M = S.M;
    const q = (id) => app.querySelector(id);
    if (!q('#mdScore')) return;
    q('#mdScore').textContent = `${M.score[0]}:${M.score[1]}`;
    q('#mdMin').textContent = M.events[M.events.length - 1]?.min ?? "0'";
    updateShoutBtn();
    const stats = statsFromEvents(M.events);
    drawMomentum(M, q);
    // Relacja
    const feed = M.events.filter((e) => e.text && !['possessionMinute'].includes(e.type)).slice(-60).reverse();
    q('#mdFeed').innerHTML = feed.map((e) => `<li class="${e.type === 'goal' && !e.provisional ? 'goalrow' : ''}"${e.side != null ? ` data-side="${e.side}"` : ''}><span class="m">${esc(e.min)}</span><span>${e.side != null ? `<b class="tm">${esc(shortName(e.side))}</b> ` : ''}${e.type === 'yellow' ? '<i class="card-ico y" aria-hidden="true"></i>' : e.type === 'red' ? '<i class="card-ico r" aria-hidden="true"></i>' : ''}${esc(e.text)}</span></li>`).join('') || `<li><span class="m"></span><span class="hint">Naciśnij Start. 1 minuta meczu trwa 1 sekundę.</span></li>`;
    // Tablica: strzelcy i czerwone kartki
    const [lh, la] = evLines();
    q('#mdEvH').innerHTML = linesHtml(lh); q('#mdEvA').innerHTML = linesHtml(la);
    q('#mdBoard')?.classList.toggle('has-ev', !!(lh.length || la.length));
    // Statystyki (zawsze w DOM; widoczność zależy od zakładki i szerokości)
    q('#mdStats').innerHTML = `<table class="vs"><tbody>${STAT_ROWS.map(([k, l]) => { const a = Number(stats[0][k]); const b = Number(stats[1][k]); const t = a + b || 1; return `<tr><td>${stats[0][k]}</td><td class="lbl">${esc(l)}<div class="bar2"><i class="bh" style="width:${a / t * 100}%"></i><i class="ba" style="width:${b / t * 100}%"></i></div></td><td>${stats[1][k]}</td></tr>`; }).join('')}</tbody></table>`;
    renderRosters();
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
    // Jeden pasek z procentami: udział w grze z ostatnich 5 minut (płynnie przesuwany, 5-95%)
    const hp = mom.length ? Math.round(50 + k * 45) : 50;
    if (q('#mdPh')) {
      q('#mdPh').textContent = `${hp}%`; q('#mdPa').textContent = `${100 - hp}%`;
      q('#mdPbh').style.width = `${hp}%`; q('#mdPba').style.width = `${100 - hp}%`;
    }
    const lbl = q('#mdPressLbl');
    if (lbl) lbl.textContent = Math.abs(k) < 0.15 ? 'Gra wyrównana' : `${Math.abs(k) > 0.55 ? 'Wyraźnie naciska' : 'Przewaga'}: ${shortName(k > 0 ? 0 : 1)}`;
  }

  // ------------------------------------------------------------ Składy na żywo (po bokach boiska na PC)
  // Panel ekspert silnika i projektant: najważniejsze w trakcie meczu są kondycja (kiedy zmieniać), kartki
  // (ryzyko drugiej żółtej), lekkie urazy (ryzyko pogłębienia), ocena na żywo i gra poza pozycją. Te same dane
  // dla rywala: widać, kto u niego słabnie albo ma żółtą kartkę.
  const condCls = (c) => (c < 60 ? 'low' : c < 75 ? 'mid' : '');
  function markers(r, x, { live = true } = {}) {
    const m = [];
    if (r.card === 'yellow') m.push(`<span class="mk" title="Żółta kartka">${ICON.yellow}<span class="sr-only">żółta kartka</span></span>`);
    if (r.card === 'secondYellow') m.push(`<span class="mk" title="Druga żółta, czerwona kartka">${ICON.second}<span class="sr-only">druga żółta i czerwona kartka</span></span>`);
    if (r.card === 'red') m.push(`<span class="mk" title="Czerwona kartka">${ICON.red}<span class="sr-only">czerwona kartka</span></span>`);
    if (r.knock && r.on) m.push(`<span class="mk" title="${esc(`Gra z bólem: ${r.knock.name}`)}">${ICON.knock}<span class="sr-only">lekki uraz, gra z bólem</span></span>`);
    if (r.injured && !r.subbedOff) m.push(`<span class="mk" title="${esc(`Uraz: ${x?.injury?.name ?? ''}`)}">${ICON.hurt}<span class="sr-only">uraz, nie może grać</span></span>`);
    if (live && r.treated) m.push('<small class="ros__note">opatrywany</small>');
    if (x?.minOn > 0 && !r.bench) m.push(`<small class="ros__in" title="Wszedł w ${x.minOn}. minucie">↑${x.minOn}'</small>`);
    if (r.subbedOff) m.push(`<small class="ros__out" title="Zszedł w ${x?.minOff}. minucie">↓${x?.minOff ?? ''}'</small>`);
    if (r.bench && r.rolledOff > 0) m.push(`<small class="ros__back" title="${esc(`Zszedł w ${x?.minOff ?? ''}. minucie po ${r.minutes} min gry. Może wrócić (zmiany powrotne).`)}">↺ ${r.minutes}'</small>`);
    return m.join('');
  }
  function rosterRow(side, r, x) {
    const pos = r.on ? r.pos : x?.p.pos ?? r.pos;
    const prof = r.on && x?.slot ? proficiency(x.p, x.slot.pos, x.slot.side) : 100;
    const band = fitBand(prof);
    const no = kitNo(side, r.id) ?? '';
    const rt = r.rating;
    const cls = [r.on ? '' : r.bench ? 'is-bench' : 'is-out', band !== 'ok' ? `is-off is-off--${band}` : '', r.knock && r.on ? 'is-knock' : ''].filter(Boolean).join(' ');
    const label = [x?.p.name ?? r.name, pos, band !== 'ok' ? `poza nominalną pozycją, ${prof} procent` : '', rt != null ? `ocena ${String(rt).replace('.', ',')}` : 'bez oceny', r.on || r.bench ? `kondycja ${r.cond} procent` : ''].filter(Boolean).join(', ');
    return `<li class="ros__i ${cls}"><button class="ros__row" data-mdp="${side}|${esc(r.id)}" aria-label="${esc(label)}" title="${esc(x?.p.name ?? r.name)}">
      <span class="ros__no" aria-hidden="true">${esc(String(no))}</span>
      <span class="pos" data-g="${GROUP[pos] ?? 'MID'}" aria-hidden="true">${esc(pos)}</span>
      <span class="ros__nm" aria-hidden="true"><span class="ros__last">${esc(lastName(x?.p ?? r))}</span>${markers(r, x)}</span>
      ${r.on || r.bench ? `<span class="ros__cw" aria-hidden="true"><span class="ros__c" data-c="${condCls(r.cond)}"><i style="width:${r.cond}%"></i></span><small class="ros__cp" data-c="${condCls(r.cond)}">${r.cond}%</small></span>` : '<span aria-hidden="true"></span>'}
      ${rt != null ? `<b class="rt rt--${rBand(rt)}" data-hov aria-hidden="true">${rt.toFixed(1)}</b>` : '<b class="rt rt--none" data-hov aria-hidden="true">–</b>'}
    </button></li>`;
  }
  function rosterHtml(side) {
    const M = S.M; const T = M.teams[side];
    const st = playerStates(M, side);
    const byId = new Map([...T.players, ...T.bench].map((x) => [x.id, x]));
    const on = st.filter((r) => r.on).sort((a, b) => (a.slotIdx < 0 ? 99 : a.slotIdx) - (b.slotIdx < 0 ? 99 : b.slotIdx));
    const bench = st.filter((r) => r.bench).sort((a, b) => byPosition(byId.get(a.id)?.p ?? a, byId.get(b.id)?.p ?? b)); // według pozycji
    const out = st.filter((r) => !r.on && !r.bench);
    const used = new Set(on.map((r) => r.slotIdx));
    const empty = T.formation.slots.map((_, i) => i).filter((i) => !used.has(i));
    let shape = T.formation.name;
    try { if (empty.length && on.length < 11) shape = `${TEAMS.shapeLabel(T.formation, empty)} (z ${T.formation.name})`; } catch { /* zostaje nazwa formacji */ }
    const rows = (list) => list.map((r) => rosterRow(side, r, byId.get(r.id))).join('');
    return `<header class="ros__head"><span class="ros__team">${crest(side === 0 ? fixture.home : fixture.away, 22)}<b>${esc(sideName(side))}</b></span><span class="ros__shape">${esc(shape)}${on.length < 11 ? `, ${on.length} na boisku` : ''}</span></header>
      <ol class="ros__list" aria-label="Na boisku">${rows(on)}</ol>
      <h3 class="ros__sub">Ławka rezerwowych <small>${esc(subsCountText(T, M))}</small></h3>
      <ul class="ros__list ros__list--bench">${rows(bench) || '<li class="hint">Brak rezerwowych.</li>'}</ul>
      ${out.length ? `<ul class="ros__list ros__list--out" aria-label="Zawodnicy, którzy zeszli z boiska">${rows(out)}</ul>` : ''}`;
  }
  /** Licznik zmian: w sparingu bez limitu tylko liczba wykonanych. */
  const unlimited = (M) => !!M.rules && M.rules.subs !== 'standard';
  function subsCountText(T, M) {
    if (!unlimited(M)) return `zmiany ${T.subsUsed} z ${T.subsLimit}`;
    return `zmiany: ${T.subsUsed}, bez limitu`;
  }
  function renderRosters() {
    const focus = document.activeElement?.closest?.('[data-mdp]')?.dataset.mdp;
    for (const sd of [0, 1]) {
      const el = app.querySelector(`#mdRos${sd}`);
      if (!el) continue;
      const scroll = el.scrollTop;
      el.innerHTML = rosterHtml(sd);
      el.scrollTop = scroll;
    }
    if (focus) app.querySelector(`[data-mdp="${CSS.escape(focus)}"]`)?.focus({ preventScroll: true });
    refreshHover();
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
    const M = S.M; const homeBall = M.ai === 0;
    const next = [];
    for (const T of M.teams) {
      // Na boisku także opatrywani (półprzezroczyści); wykluczony w tej minucie zostaje chwilę z czerwoną kartką
      const xs = T.players.filter((x) => x.slot && ((x.on && !x.sentOff) || (x.sentOff && M.events.some((e) => e.type === 'red' && e.pid === x.id && e.t === M.tick))));
      xs.forEach((x, i) => {
        const s = x.slot; const shift = s.pos === 'BR' ? 0 : (T.side === 0) === homeBall ? 10 : -3;
        let sy = 96 - (s.y + shift) * 0.5; let sx = s.x;
        if (T.side === 1) { sy = 100 - sy; sx = 100 - sx; }
        const j = Math.sin(M.tick * 1.7 + i * 3.1) * 2;
        next.push({
          id: x.id, side: T.side, x: sx + j, y: sy + Math.cos(M.tick + i) * 1.5, label: String(kitNo(T.side, x.id) ?? (x.slot.pos === 'BR' ? 'BR' : i + 1)),
          card: x.sentOff ? (x.redCode === 'second' ? 'second' : 'red') : x.yc ? 'yellow' : null,
          knock: !!(x.knock && !x.knock.aggravated && !x.sentOff), hurt: !!(x.injury && !x.injury.playable),
          dim: x.sentOff || x.treatedUntil >= M.minute,
        });
      });
    }
    const prev = new Map(ui.dots.map((d) => [d.id, d]));
    ui.dots = next.map((d) => ({ ...d, fx: prev.get(d.id)?.x ?? d.x, fy: prev.get(d.id)?.y ?? d.y }));
    cancelAnimationFrame(ui.raf);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now(); const dur = Math.min(800, 900 / ui.speed);
    const frame = (now) => { const k = reduce ? 1 : Math.min(1, (now - t0) / dur); const e = k * (2 - k); drawPitch(e); if (k < 1) ui.raf = requestAnimationFrame(frame); };
    ui.raf = requestAnimationFrame(frame);
  }
  /** Kartka „przyklejona” do ikony zawodnika: lekko obrócony prostokąt w prawym górnym rogu. */
  function drawCard(c, x, y, w, h, color, angle) {
    c.save(); c.translate(x, y); c.rotate(angle);
    c.fillStyle = color; c.strokeStyle = '#14211A'; c.lineWidth = 1;
    c.beginPath(); c.roundRect ? c.roundRect(-w / 2, -h / 2, w, h, 1.5) : c.rect(-w / 2, -h / 2, w, h); c.fill(); c.stroke();
    c.restore();
  }
  /** Krzyżyk na ikonie zawodnika: biały na ciemnym tle (lekki uraz) albo biały na czerwonym (uraz, musi zejść). */
  function drawCross(c, x, y, r, bg) {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = bg; c.fill();
    c.lineWidth = 1; c.strokeStyle = '#F3F6F1'; c.stroke();
    const a = r * 0.58; c.lineWidth = Math.max(1.6, r * 0.42); c.lineCap = 'butt'; c.strokeStyle = '#FFFFFF';
    c.beginPath(); c.moveTo(x - a, y); c.lineTo(x + a, y); c.moveTo(x, y - a); c.lineTo(x, y + a); c.stroke();
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
    const rad = Math.max(9, Math.min(15, W * 0.033));
    ctx2d.font = `700 ${Math.round(rad * 1.0)}px "Barlow Condensed", sans-serif`; ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
    for (const d of ui.dots) {
      const x = X(d.fx + (d.x - d.fx) * e); const y = Y(d.fy + (d.y - d.fy) * e);
      d.px = x; d.py = y; d.pr = rad;
      ctx2d.globalAlpha = d.dim ? 0.5 : 1;
      ctx2d.beginPath(); ctx2d.arc(x, y, rad, 0, Math.PI * 2);
      ctx2d.fillStyle = d.side === 0 ? colors.home : colors.away; ctx2d.fill();
      ctx2d.lineWidth = 1.5; ctx2d.strokeStyle = d.side === 0 ? colors.homeInk : colors.awayInk; ctx2d.stroke();
      ctx2d.fillStyle = d.side === 0 ? colors.homeInk : colors.awayInk; ctx2d.fillText(d.label, x, y + 1);
      ctx2d.globalAlpha = 1;
      const cw = rad * 0.62; const ch = rad * 0.86;
      if (d.card === 'yellow') drawCard(ctx2d, x + rad * 0.82, y - rad * 0.72, cw, ch, '#F5C518', 0.22);
      if (d.card === 'second') { drawCard(ctx2d, x + rad * 0.68, y - rad * 0.78, cw, ch, '#F5C518', -0.12); drawCard(ctx2d, x + rad * 1.0, y - rad * 0.62, cw, ch, '#D62839', 0.28); }
      if (d.card === 'red') drawCard(ctx2d, x + rad * 0.82, y - rad * 0.72, cw, ch, '#D62839', 0.22);
      if (d.knock) drawCross(ctx2d, x - rad * 0.86, y - rad * 0.78, Math.max(5.5, rad * 0.56), '#14211A');
      else if (d.hurt) drawCross(ctx2d, x - rad * 0.86, y - rad * 0.78, Math.max(5.5, rad * 0.56), '#D62839');
    }
  }

  function loop() {
    if (!ui.running) return;
    const r = MD.tick(S);
    updateLive(r.events);
    if (S.step !== 'live1' && S.step !== 'live2') { stop(); return route(); }
    const halt = haltReason(r.events) ?? MD.keeperReminder(S);
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
    if (kind === 'second') { renderSecondEleven(dlg, fresh); return; }
    if (kind === 'manage') {
      if (fresh || !dlg.open) { ui.tac = null; ui.subMsg = ''; ui.subSel = null; }
      if (ui.preSel) {
        const T0 = M.teams[S.userSide];
        ui.subSel = ui.preSel; ui.mmTab = ui.preSel.kind === 'on' ? 'bench' : 'xi';
        const nm = (ui.preSel.kind === 'on' ? T0.players : T0.bench).find((x) => x.id === ui.preSel.id)?.p.name ?? '';
        ui.subMsg = ui.preSel.kind === 'on' ? `${nm}: wybierz rezerwowego, który wejdzie za niego.` : `${nm}: wybierz zawodnika, który zejdzie.`;
        ui.preSel = null;
      }
      const scroll = dlg.querySelector('.mm__lists')?.scrollTop ?? 0;
      dlg.className = 'panel md-dlg md-dlg--wide mm-dlg';
      dlg.innerHTML = managePanel(T, M);
      if (!dlg.open) dlg.showModal();
      const l = dlg.querySelector('.mm__lists'); if (l) l.scrollTop = scroll;
      mountSubsDrag(dlg);
      return;
    }
    dlg.className = 'panel md-dlg sh-dlg';
    dlg.innerHTML = shoutPanel(M);
    if (!dlg.open) dlg.showModal();
    dlg.querySelector('.sh-card:not([disabled])')?.focus();
  }

  // ------------------------------------------------------------ Okrzyk z linii bocznej
  // Wybór okrzyku od razu go wykonuje, zamyka okno i wznawia mecz; kolejny okrzyk po SHOUT_COOLDOWN minutach.
  const SHOUT_INFO = {
    naprzod: { tone: 'att', what: 'Więcej akcji pod bramką rywala.', cost: 'Słabsza asekuracja z tyłu.' },
    uwaga: { tone: 'def', what: 'Drużyna cofa się i pilnuje tyłów.', cost: 'Mniej akcji ofensywnych.' },
    spokojnie: { tone: 'calm', what: 'Uspokaja rozgorączkowanych zawodników.', cost: 'Mniej żółtych kartek, ale mniej ognia.' },
    walka: { tone: 'fight', what: 'Więcej zaangażowania i walki o piłkę.', cost: 'Więcej fauli i kartek.' },
    brawo: { tone: 'praise', what: 'Pochwała podnosi morale i zaangażowanie.', cost: 'Działa najwyżej 2 razy w meczu.' },
  };
  function shoutWait(M) {
    const T = M.teams[S.userSide];
    if (T.coachBanned) return { blocked: 'Trener na trybunach: okrzyki niemożliwe.' };
    const left = Math.max(0, (T.shoutReadyAt ?? 0) - M.minute);
    return left > 0 ? { left } : null;
  }
  function shoutPanel(M) {
    const T = M.teams[S.userSide];
    const act = T.shout && M.minute < (T.shout.until ?? 0) ? T.shout : null;
    const wait = shoutWait(M);
    const cards = Object.entries(SHOUTS).map(([k, sh]) => {
      const err = canShout(M, S.userSide, k);
      const info = SHOUT_INFO[k] ?? { tone: 'calm', what: '', cost: '' };
      const used = sh.maxUses ? `${T.shoutUses?.[k] ?? 0} z ${sh.maxUses}` : '';
      return `<button class="sh-card sh-card--${info.tone}" data-md="doShout:${k}" ${err ? 'disabled' : ''} ${err ? `title="${esc(err)}"` : ''}>
        <b class="sh-card__t">${esc(sh.label)}</b><span class="sh-card__w">${esc(info.what)}</span><small class="sh-card__c">${esc(info.cost)}${used ? ` Użyto: ${used}.` : ''}</small>
        ${err && !wait ? `<small class="sh-card__x">${esc(err)}</small>` : ''}</button>`;
    }).join('');
    return `<header class="sh-head"><h2>Okrzyk z linii bocznej</h2><button class="mm__x" data-md="closeDlg" aria-label="Zamknij">×</button></header>
      <p class="sh-sub">${act ? `Teraz działa: <b>${esc(act.label)}</b> (do ${act.until}'). ` : ''}Okrzyk działa od razu przez ok. ${SHOUT_DURATION} minut. Po wyborze mecz rusza dalej, a kolejny okrzyk będzie możliwy za ${SHOUT_COOLDOWN} min.</p>
      ${wait?.blocked ? `<p class="notice">${esc(wait.blocked)}</p>` : wait ? `<p class="notice">Zawodnicy jeszcze przetrawiają poprzedni okrzyk. Kolejny za ${wait.left} min.</p>` : ''}
      <div class="sh-grid">${cards}</div>`;
  }
  function updateShoutBtn() {
    const b = app.querySelector('.coachbar__shout');
    if (!b || !S.M) return;
    const w = shoutWait(S.M);
    b.disabled = !!w;
    b.innerHTML = w?.blocked ? 'Okrzyk niedostępny' : w ? `Okrzyk <small>za ${w.left} min</small>` : 'Okrzyk';
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
  // Taktyka: szkic zmian w oknie, wchodzi razem ze zmianami zawodników po zatwierdzeniu.
  // Ustawienie zawodników: assign { [id]: indeks slotu } (podgląd z silnika: previewShape), także w osłabieniu,
  // gdzie puste zostają miejsca, na które nikt nie stoi.
  const SHORT = { 'Zamurowanie': 'Mur', 'Wszystko do ataku': 'Atak', 'Równowaga': 'Równo', 'Indywidualne': 'Indyw.', 'Strefowe': 'Strefa', 'Normalne': 'Norm.', 'Normalna': 'Norm.' };
  const INS_KEYS = ['mentality', 'pressing', 'tempo', 'passing', 'line', 'tackling', 'marking', 'counter', 'timewasting'];
  const formShort = (f) => f.name.replace(' defensywne', ' def.').replace(' ofensywne', ' of.');
  function curAssign() {
    const a = {};
    for (const r of playerStates(S.M, S.userSide)) if (r.on && r.slotIdx >= 0) a[r.id] = r.slotIdx;
    return a;
  }
  const fieldIds = (T) => T.players.filter((x) => x.on && !x.sentOff).map((x) => x.id);
  function autoAssign(fid) {
    const pv = previewShape(S.M, S.userSide, fid, {});
    return pv.ok ? pv.assign : {};
  }
  function tacDraft(T) {
    ui.tac ??= { formation: T.formation.id, ins: Object.fromEntries(INS_KEYS.map((k) => [k, String(T.tactics.instructions?.[k] ?? '')])), assign: curAssign(), moved: false };
    // Skład na boisku zmienił się pod oknem (np. podpowiedź asystenta): ustawienie od nowa
    const ids = fieldIds(T);
    const keys = Object.keys(ui.tac.assign);
    if (keys.length !== ids.length || keys.some((id) => !ids.includes(id))) {
      ui.tac.assign = ui.tac.formation === T.formation.id ? curAssign() : autoAssign(ui.tac.formation);
      ui.tac.moved = false;
    }
    return ui.tac;
  }
  function setDraftFormation(T, fid) {
    const d = tacDraft(T);
    d.formation = fid;
    d.assign = fid === T.formation.id ? curAssign() : autoAssign(fid);
    d.moved = false;
  }
  function tacDiff(T) {
    const d = tacDraft(T);
    const ins = {};
    for (const k of INS_KEYS) if (d.ins[k] !== String(T.tactics.instructions?.[k] ?? '')) ins[k] = d.ins[k];
    const formation = d.formation !== T.formation.id ? d.formation : null;
    const cur = curAssign();
    const moved = d.moved && Object.entries(d.assign).some(([id, i]) => cur[id] !== i);
    return { formation, ins, moved, n: (formation ? 1 : 0) + (moved && !formation ? 1 : 0) + Object.keys(ins).length };
  }
  const draftPreview = (T) => { const d = tacDraft(T); return previewShape(S.M, S.userSide, d.formation, { assign: d.assign }); };
  function swapSlots(a, b) {
    const T = S.M.teams[S.userSide]; const d = tacDraft(T);
    const ia = d.assign[a]; const ib = d.assign[b];
    if (ia == null || ib == null || a === b) return;
    d.assign[a] = ib; d.assign[b] = ia; d.moved = true;
    const n = (id) => lastName(T.players.find((x) => x.id === id)?.p);
    ui.subMsg = `${n(a)} i ${n(b)} zamieniają się pozycjami. Zatwierdź, żeby weszło.`;
  }
  function moveToSlot(id, i) {
    const T = S.M.teams[S.userSide]; const d = tacDraft(T);
    if (d.assign[id] == null) return;
    const other = Object.entries(d.assign).find(([pid, j]) => j === i && pid !== id);
    if (other) { swapSlots(id, other[0]); return; }
    d.assign[id] = i; d.moved = true;
    const pos = FORMATIONS.find((f) => f.id === d.formation)?.slots[i]?.pos ?? '';
    ui.subMsg = `${lastName(T.players.find((x) => x.id === id)?.p)} przechodzi na ${pos}. Jego dawne miejsce zostaje puste.`;
  }
  const insLabel = (k, v) => INSTRUCTIONS.find((i) => i.id === k)?.options.find((o) => String(o.id) === String(v))?.label ?? String(v);
  function managePanel(T, M) {
    const st = subsState(T, M);
    const pend = ui.pend;
    const outIds = new Set(pend.map((x) => x.out)); const inIds = new Set(pend.map((x) => x.in));
    const sel = ui.subSel;
    const d = tacDraft(T); const diff = tacDiff(T);
    const pv = draftPreview(T);
    const F = FORMATIONS.find((f) => f.id === d.formation) ?? T.formation;
    // Pozycja po zatwierdzeniu: slot z podglądu (zaplanowany zmiennik zajmuje miejsce schodzącego)
    const slotOfId = new Map((pv.ok ? pv.slots : []).filter((sl) => sl.playerId).map((sl) => [sl.playerId, sl]));
    const fitOf = (p, sl) => (p && sl ? proficiency(p, sl.pos, sl.side) : 100);
    // Podpowiedzi po kliknięciu zawodnika: najlepsi kandydaci do zmiany (biegłość na miejscu, jakość, świeżość, kartka, uraz)
    const sugg = new Map();
    {
      const condPen = (c) => (c < 85 ? 0.04 * (85 - c) : 0);
      const offPen = (prof) => (prof < 85 ? 0.04 * (85 - prof) : 0); // gra poza pozycją: także ryzyko błędów w obronie
      const effAt = (x, sl) => (x.p.ovr ?? 10) * posEff(fitOf(x.p, sl)) - condPen(x.cond ?? 100) - offPen(fitOf(x.p, sl));
      const outPen = (x) => (x.injury && !x.injury.playable ? 6 : x.knock && !x.knock.aggravated ? 1.2 : 0) + (x.yc ? 0.6 : 0);
      if (sel?.kind === 'on') {
        const out = T.players.find((y) => y.id === sel.id);
        const sl = out ? slotOfId.get(out.id) ?? out.slot : null;
        if (sl) {
          const base = effAt(out, sl) - outPen(out);
          T.bench.filter((b) => !inIds.has(b.id) && !(b.injury && !b.injury.playable) && !(b.p.pos === 'BR') === !(sl.pos === 'BR'))
            .map((b) => ({ b, gain: effAt(b, sl) - base, prof: fitOf(b.p, sl) })).filter((c) => c.prof >= 60).sort((a, z) => z.gain - a.gain).slice(0, 3)
            .forEach((c, i) => sugg.set(`bench:${c.b.id}`, { rank: i + 1, text: `${i === 0 ? 'Najlepsza zmiana' : 'Dobra opcja'}: ${sl.pos} ${c.prof}%${c.gain > 0.3 ? `, +${c.gain.toFixed(1)}` : ''}` }));
        }
      } else if (sel?.kind === 'bench') {
        const inc = T.bench.find((y) => y.id === sel.id);
        if (inc) {
          T.players.filter((x) => x.on && !x.sentOff && !outIds.has(x.id)).map((x) => {
            const sl = slotOfId.get(x.id) ?? x.slot;
            if (!sl || (sl.pos === 'BR') !== (inc.p.pos === 'BR')) return null;
            return { x, gain: effAt(inc, sl) - (effAt(x, sl) - outPen(x)), prof: fitOf(inc.p, sl), pos: sl.pos };
          }).filter((c) => c && c.prof >= 60).sort((a, z) => z.gain - a.gain).slice(0, 3)
            .forEach((c, i) => sugg.set(`on:${c.x.id}`, { rank: i + 1, text: `${i === 0 ? 'Najlepiej zmienić' : 'Można zmienić'}: ${inc.p.name.split(' ').slice(-1)[0]} na ${c.pos} ${c.prof}%` }));
        }
      }
    }
    const row = (x, kind) => {
      const planned = kind === 'on' ? outIds.has(x.id) : inIds.has(x.id);
      const isSel = sel && sel.kind === kind && sel.id === x.id;
      const sl = kind === 'on' ? slotOfId.get(x.id) ?? x.slot : null;
      const pos = kind === 'on' ? sl?.pos ?? x.p.pos : x.p.pos;
      const prof = kind === 'on' ? fitOf(x.p, sl) : 100;
      const band = fitBand(prof);
      const cond = Math.round(x.cond ?? 100);
      const k = x.knock && !x.knock.aggravated;
      const back = kind === 'bench' && x.rolledOff > 0 ? `może wrócić, grał ${x.prevMins ?? 0} min` : '';
      const note = [kind === 'on' && pos !== x.p.pos ? `nominalnie ${x.p.pos}${band !== 'ok' ? `, ${prof}% na tej pozycji` : ''}` : '', x.injury && !x.injury.playable ? 'uraz' : k ? `gra z bólem (${x.knock.name})` : '', x.yc ? 'żółta kartka' : '', back, kind === 'bench' ? `OVR ${Math.round(x.p.ovr)}` : ''].filter(Boolean).join(', ');
      const sg = sugg.get(`${kind}:${x.id}`);
      return `<li class="sub-row ${planned ? 'is-planned' : ''} ${isSel ? 'is-sel' : ''} ${sg ? `is-sugg is-sugg--${sg.rank}` : ''} ${back ? 'is-back' : ''} ${x.injury && !x.injury.playable ? 'is-hurt' : ''} ${band !== 'ok' ? `is-off is-off--${band}` : ''}" data-sdrop="${kind}:${esc(x.id)}">
        <button class="sub-row__main" data-md="subPick:${kind}|${esc(x.id)}" data-sdrag="${kind}:${esc(x.id)}" data-name="${esc(x.p.name)}" aria-pressed="${isSel}" ${planned ? 'disabled' : ''}>
          <span class="sub-handle" data-shandle aria-hidden="true"></span>
          <span class="pos" data-g="${GROUP[pos] ?? 'MID'}">${esc(pos)}</span>
          <span class="sub-name"><span class="sub-name__l"><span class="sub-name__t">${esc(x.p.name)}</span>${x.yc ? ICON.yellow : ''}${k ? ICON.knock : ''}</span>${sg ? `<span class="sub-sugg">${esc(sg.text)}</span>` : ''}${note ? `<small>${esc(note)}</small>` : ''}</span>
          <span class="sub-cond" title="Kondycja"><i style="width:${cond}%" class="${condCls(cond)}"></i></span><b>${cond}%</b>
        </button></li>`;
    };
    // Boisko: wszystkie miejsca formacji; puste miejsca przy grze w osłabieniu, zaplanowany zmiennik zamiast schodzącego
    const last = (n) => String(n).split(' ').slice(-1)[0];
    const tokens = (pv.ok ? pv.slots : []).map((sl) => {
      const x = sl.playerId ? T.players.find((y) => y.id === sl.playerId) : null;
      if (!x) {
        return `<button class="mm-tok mm-tok--empty ${sel?.kind === 'on' ? 'is-open' : ''}" style="--x:${sl.x};--y:${sl.y}" data-sdrop="slot:${sl.i}" data-md="slotPick:${sl.i}" aria-label="Puste miejsce: ${esc(sl.pos)}">
          <span class="mm-tok__dot"><span>${esc(sl.pos)}</span></span><span class="mm-tok__name">puste</span></button>`;
      }
      const pl = pend.find((q) => q.out === x.id);
      const inc = pl ? T.bench.find((b) => b.id === pl.in) : null;
      const who = inc ?? x;
      const cond = Math.round(who.cond ?? 100);
      const isSel = sel && sel.kind === 'on' && sel.id === x.id;
      const prof = fitOf(who.p, sl); const band = fitBand(prof);
      const k = who.knock && !who.knock.aggravated;
      const sgT = sugg.get(`on:${x.id}`);
      return `<button class="mm-tok ${sl.pos === 'BR' ? 'is-gk' : ''} ${pl ? 'is-planned' : ''} ${isSel ? 'is-sel' : ''} ${sgT ? `is-sugg is-sugg--${sgT.rank}` : ''} ${x.injury && !x.injury.playable ? 'is-hurt' : ''}" style="--x:${sl.x};--y:${sl.y};--cond:${cond}" data-c="${condCls(cond)}" data-fit="${band}"
        data-sdrop="on:${esc(x.id)}" data-sdrag="on:${esc(x.id)}" data-shandle data-name="${esc(x.p.name)}" data-md="tokPick:${esc(x.id)}" ${pl ? 'disabled' : ''} title="${esc(`${who.p.name}, ${sl.pos}${band !== 'ok' ? ` (nominalnie ${who.p.pos}, ${prof}%)` : ''}, kondycja ${cond}%`)}">
        <span class="mm-tok__dot"><span>${esc(sl.pos)}</span></span>${who.yc ? '<i class="mm-tok__yc" aria-label="żółta kartka"></i>' : ''}${x.injury && !x.injury.playable ? '<i class="mm-tok__inj" aria-label="uraz">+</i>' : k ? `<i class="mm-tok__knock" aria-label="gra z bólem">${ICON.knock}</i>` : ''}
        <span class="mm-tok__name">${inc ? `↑ ${esc(last(inc.p.name))}` : esc(last(x.p.name))}</span></button>`;
    }).join('');
    // Ustawienie: przyciski zamiast listy rozwijanej (czytelne w obu motywach, jeden dotyk)
    const chips = `<fieldset class="mm-forms"><legend class="mm-forms__lbl">Ustawienie</legend><div class="mm-forms__opts">${FORMATIONS.map((f) => `<label class="mm-fchip ${f.id === T.formation.id ? 'is-now' : ''}" title="${esc(`${f.name} „${f.nick}”${f.id === T.formation.id ? ', obecne ustawienie' : ''}`)}"><input type="radio" name="mdForm" value="${f.id}" ${f.id === d.formation ? 'checked' : ''}><span>${esc(formShort(f))}</span></label>`).join('')}</div></fieldset>`;
    // Instrukcje jako segmenty
    const seg = (k) => {
      const ins = INSTRUCTIONS.find((i) => i.id === k); if (!ins) return '';
      const dirty = d.ins[k] !== String(T.tactics.instructions?.[k] ?? '');
      return `<fieldset class="mm-seg ${dirty ? 'is-dirty' : ''}"><legend class="mm-seg__lbl">${esc(ins.label)}</legend><div class="mm-seg__opts">${ins.options.map((o) => `<label title="${esc(o.label)}"><input type="radio" name="ins-${k}" value="${esc(String(o.id))}" data-ins="${k}" ${d.ins[k] === String(o.id) ? 'checked' : ''}><span>${esc(SHORT[o.label] ?? o.label)}</span></label>`).join('')}</div></fieldset>`;
    };
    // Kolejka do zatwierdzenia
    const chipsQ = [
      ...pend.map((x, i) => { const o = T.players.find((y) => y.id === x.out); const n = T.bench.find((y) => y.id === x.in); const gkWarn = o?.slot?.pos === 'BR' && n?.p.pos !== 'BR'; return `<li class="mm-pend ${gkWarn ? 'is-warn' : ''}"><span><b class="out">${esc(o?.p.name ?? '')}</b> <b class="in">${esc(n?.p.name ?? '')}</b>${gkWarn ? '<small>Do bramki wejdzie zawodnik z pola.</small>' : ''}</span><button data-md="subDrop:${i}" aria-label="Usuń zmianę">×</button></li>`; }),
      diff.formation ? `<li class="mm-pend"><span>Ustawienie: ${esc(T.formation.name)} → ${esc(F.name)}${pv.ok && pv.need ? ` (${esc(pv.shape)})` : ''}</span><button data-md="tacUndo:formation" aria-label="Cofnij zmianę ustawienia">×</button></li>` : '',
      diff.moved && !diff.formation ? `<li class="mm-pend"><span>Nowe pozycje zawodników${pv.ok && pv.need ? ` (${esc(pv.shape)})` : ''}</span><button data-md="tacUndo:assign" aria-label="Cofnij przesunięcia zawodników">×</button></li>` : '',
      ...Object.entries(diff.ins).map(([k, v]) => `<li class="mm-pend"><span>${esc(INSTRUCTIONS.find((i) => i.id === k)?.label ?? k)}: ${esc(insLabel(k, T.tactics.instructions?.[k]))} → ${esc(insLabel(k, v))}</span><button data-md="tacUndo:${k}" aria-label="Cofnij">×</button></li>`),
    ].filter(Boolean);
    const nAll = pend.length + diff.n;
    const live = M.phase !== 'break' && M.minute > 0;
    const costWarn = diff.n && live && M.minute - (T.lastTacChange ?? -99) < 10 ? 'Kolejna zmiana taktyki w ciągu 10 minut kosztuje podwójnie.' : '';
    const info = unlimited(M) ? `Zmiany: bez limitu${M.rules.subs === 'rolling' ? ', zmieniony może wrócić' : ''} (wykonano ${T.subsUsed}).`
      : st.windowBlocked ? 'Okna zmian wykorzystane, zmiany zawodników tylko w przerwie.'
        : st.left <= 0 ? `Wykorzystano wszystkie zmiany (${T.subsLimit}).`
          : `Zmiany: ${st.left} z ${T.subsLimit}${M.phase === 'break' ? ', w przerwie bez zużycia okna' : `, okna ${T.windowsUsed} z ${T.windowsLimit}`}.`;
    const tab = ui.mmTab ?? 'bench';
    const short = pv.ok && pv.need > 0
      ? `<p class="mm-short" role="note"><b>Gracie w ${11 - pv.need}.</b> ${pv.need === 1 ? 'Jedno miejsce zostaje puste' : `${pv.need} miejsca zostają puste`}, ustawienie ${esc(pv.shape)}. Wybierz dowolną formację, a potem przeciągnij zawodnika na puste miejsce albo dotknij zawodnika i miejsce.</p>` : '';
    const err = pv.ok ? '' : `<p class="mm-err" role="alert">${esc(pv.error)} Popraw ustawienie albo cofnij zmianę.</p>`;
    const onList = onPitchNow(T).slice().sort((a, b) => (slotOfId.get(a.id)?.i ?? 99) - (slotOfId.get(b.id)?.i ?? 99));
    return `<div class="mm" data-tab="${tab}">
      <header class="mm__head"><h2>Zmiany i taktyka</h2><span class="mm__info">${esc(info)} Spójność ${Math.round(T.S)} na 100.</span>
        <button class="mm__x" data-md="subClose" aria-label="Zamknij">×</button></header>
      <section class="mm__pitch">
        ${chips}
        ${short}
        <div class="pitch2 mm-field">${tokens}</div>
        <p class="mm-legend"><span><i class="fit fit--mid"></i>poza nominalną pozycją</span><span><i class="fit fit--bad"></i>daleko od swojej pozycji</span></p>
        <p class="mm__tip">Przeciągnij rezerwowego na zawodnika na boisku albo dotknij kolejno obu. Dwóch zawodników na boisku: zamiana pozycji.</p>
      </section>
      <nav class="mm__tabs" role="tablist" aria-label="Widok">
        ${[['bench', 'Ławka rezerwowych'], ['xi', 'Pierwszy skład'], ['tac', 'Taktyka']].map(([k, l]) => `<button role="tab" data-md="mmTab:${k}" aria-selected="${tab === k}">${l}${k === 'tac' && Object.keys(diff.ins).length ? ` <i class="dot"></i>` : ''}</button>`).join('')}
      </nav>
      <div class="mm__lists">
        <section class="mm__xi"><h3>Pierwszy skład</h3><ul class="sub-list">${onList.map((x) => row(x, 'on')).join('')}</ul></section>
        <section class="mm__bench"><h3>Ławka rezerwowych</h3><ul class="sub-list">${[...T.bench].sort((a, b) => byPosition(a.p, b.p)).map((x) => row(x, 'bench')).join('') || '<li class="hint">Brak rezerwowych.</li>'}</ul></section>
        <section class="mm__tac"><h3>Instrukcje</h3><div class="mm-segs">${INS_KEYS.map(seg).join('')}</div></section>
      </div>
      <footer class="mm__foot">
        <div class="mm__queue">${err}${chipsQ.length ? `<ul>${chipsQ.join('')}</ul>` : '<p class="hint">Nic do zatwierdzenia. Zmiany zawodników i taktyki wejdą razem po zatwierdzeniu.</p>'}
          <p id="mdDlgMsg" class="hint" role="status">${esc([ui.subMsg ?? '', costWarn].filter(Boolean).join(' '))}</p></div>
        <div class="mm__btns">${nAll ? btn('mmDiscard', 'Odrzuć', false) : btn('subClose', 'Zamknij', false)}<button class="btn btn--primary mm__ok" data-md="mmConfirm" ${nAll && pv.ok ? '' : 'disabled'}>Zatwierdź${nAll ? ` (${nAll})` : ''}</button></div>
      </footer>
    </div>`;
  }
  function planSub(outId, inId) {
    const M = S.M; const T = M.teams[S.userSide];
    const st = subsState(T, M);
    if (st.windowBlocked) return 'Wykorzystano wszystkie okna zmian. Zmiany możliwe w przerwie.';
    if (!unlimited(M) && ui.pend.length >= st.left) return `Nie możesz zaplanować więcej zmian (zostało ${st.left}).`;
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
  function tokPick(id) {
    const sel = ui.subSel;
    if (sel && sel.kind === 'on' && sel.id !== id) { swapSlots(sel.id, id); ui.subSel = null; return; }
    pickSub('on', id);
    if (ui.subSel) ui.subMsg = 'Teraz wybierz rezerwowego, który wejdzie, albo innego zawodnika na boisku (zamiana pozycji) lub puste miejsce.';
  }
  function slotPick(i) {
    const sel = ui.subSel;
    if (!sel || sel.kind !== 'on') { ui.subMsg = 'Najpierw dotknij zawodnika na boisku, a potem puste miejsce.'; return; }
    moveToSlot(sel.id, i); ui.subSel = null;
  }
  function confirmAll() {
    const M = S.M; const T = M.teams[S.userSide];
    const d = tacDraft(T);
    const diff = tacDiff(T);
    const plannedSubs = ui.pend.slice();
    const nSubs = plannedSubs.length;
    // Ustawienie z okna: zmiennik zajmuje slot schodzącego (zmiany zawodników wchodzą najpierw)
    const assign = { ...d.assign };
    if (nSubs) confirmSubs();
    const subMsg = nSubs ? ui.subMsg : '';
    let tacMsg = '';
    if (diff.n) {
      const done = new Set(fieldIds(T));
      for (const x of plannedSubs) if (assign[x.out] != null && done.has(x.in)) { assign[x.in] = assign[x.out]; delete assign[x.out]; }
      for (const id of Object.keys(assign)) if (!done.has(id)) delete assign[id];
      const patch = {};
      if (Object.keys(diff.ins).length) patch.instructions = diff.ins;
      if (diff.formation) patch.formation = diff.formation;
      if (diff.formation || diff.moved) patch.assign = assign;
      const r = changeTactics(M, S.userSide, patch);
      if (r?.ok === false) {
        tacMsg = `Taktyka nie weszła: ${r.error}`;
        d.assign = assign;
        if (S.step.startsWith('live')) updateLive();
        ui.subMsg = [subMsg, tacMsg].filter(Boolean).join(' ');
        return;
      }
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
      if (t.name === 'mdForm') { setDraftFormation(T, t.value); ui.subMsg = ''; openDialog('manage'); dlg.querySelector(`input[name="mdForm"][value="${t.value}"]`)?.focus(); }
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
          const tokToTok = drag.el.classList.contains('mm-tok') && over.classList.contains('mm-tok');
          if (sk === 'on' && dk === 'slot') { moveToSlot(sid, Number(did)); ui.subSel = null; }
          else if (dk === 'slot') ui.subMsg = 'Na puste miejsce przesuń zawodnika z boiska. Rezerwowy wchodzi tylko za kogoś.';
          else if (sk === 'on' && dk === 'on' && tokToTok) { if (sid !== did) swapSlots(sid, did); ui.subSel = null; }
          else if (dk !== sk) { const err = planSub(sk === 'on' ? sid : did, sk === 'bench' ? sid : did); ui.subMsg = err ?? 'Zmiana zaplanowana. Zatwierdź, żeby weszła.'; ui.subSel = null; }
          else ui.subMsg = 'Upuść rezerwowego na zawodnika na boisku (albo odwrotnie). Na boisku przeciągnij zawodnika na innego, żeby zamienić pozycje.';
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

  // ------------------------------------------------------------ Menu zawodnika w meczu (prawy przycisk, przytrzymanie)
  // Na listach składów i na boisku: zmiana zawodnika (okno „Zmiany i taktyka” z nim wybranym), statystyki meczu
  // zawodnika i wykonawcy stałych fragmentów (silnik czyta T.takers przy każdym karnym, wolnym i rożnym).
  const TAKERS = [['penalty', 'Rzuty karne'], ['freeKick', 'Rzuty wolne'], ['corner', 'Rzuty rożne']];
  function findX(side, id) {
    const T = S.M?.teams[side];
    return T ? T.players.find((x) => x.id === id) ?? T.bench.find((x) => x.id === id) ?? null : null;
  }
  function playerMenuModel(side, id) {
    const M = S.M; const T = M.teams[side]; const x = findX(side, id);
    if (!x) return null;
    const mine = side === S.userSide;
    const on = x.on && !x.sentOff && !x.subbedOff;
    const onBench = T.bench.includes(x);
    const pos = on ? x.slot?.pos ?? x.p.pos : x.p.pos;
    const st = subsState(T, M);
    const subWhy = st.windowBlocked ? 'Okna zmian wykorzystane' : st.left <= 0 ? 'Wykorzystano wszystkie zmiany' : null;
    const items = [];
    if (mine && on) items.push({ label: 'Zmień zawodnika', hint: 'Okno zmian z nim wybranym', primary: true, disabled: subWhy, act: 'sub' });
    if (mine && onBench) items.push({ label: 'Wprowadź na boisko', hint: 'Okno zmian z nim wybranym', primary: true, disabled: subWhy, act: 'subIn' });
    items.push({ label: 'Karta zawodnika', hint: 'Atrybuty, forma, stan', act: 'card' });
    items.push({ label: 'Statystyki meczu', hint: x.minOn === null ? 'Jeszcze nie grał' : null, act: 'stats' });
    if (mine && on && M.phase !== 'ended') {
      items.push({ sep: true });
      items.push({ label: 'Stałe fragmenty', items: TAKERS.map(([k, l]) => ({ label: l, checked: T.takers?.[k] === x.id, act: `taker:${k}` })) });
    }
    const no = kitNo(side, id);
    return { title: x.p.name, pos, group: GROUP[pos] ?? 'MID', meta: `${no != null ? `nr ${no}, ` : ''}${sideName(side)}`, note: x.knock && !x.knock.aggravated && on ? `Gra z bólem: ${x.knock.name}` : null, items };
  }
  function runPlayerMenu(side, id, it) {
    const T = S.M.teams[side]; const x = findX(side, id);
    if (!x || !it?.act) return;
    if (it.act === 'sub' || it.act === 'subIn') { if (ui.running) stop(); ui.preSel = { kind: it.act === 'sub' ? 'on' : 'bench', id }; openDialog('manage', true); return; }
    if (it.act === 'stats') { if (ui.running) stop(); openPlayerStats(side, id); return; }
    if (it.act === 'card') { if (ui.running) stop(); openPlayerCard(side, id); return; }
    if (it.act.startsWith('taker:')) {
      const k = it.act.slice(6);
      T.takers = { ...(T.takers ?? {}), [k]: id };
      menuToast(`${TAKERS.find(([q]) => q === k)?.[1]}: ${x.p.name}.`);
    }
  }
  /** Treść statystyk meczu zawodnika: nagłówek, stan, tabela (okno „Statystyki meczu” i podgląd po najechaniu na ocenę). */
  function playerStatsParts(side, id) {
    const M = S.M; const x = findX(side, id);
    if (!x) return null;
    const r = playerStates(M, side).find((q) => q.id === id);
    const mins = r?.minutes ?? (x.minOn === null ? 0 : Math.max(0, (x.minOff ?? M.minute) - x.minOn));
    const gk = (r?.pos ?? x.p.pos) === 'BR';
    const rows = [['Minuty', mins], ['Gole', x.g ?? 0], ['Asysty', x.ast ?? 0], ['Strzały (celne)', `${x.sh ?? 0} (${x.sot ?? 0})`], ['Kluczowe podania', x.kp ?? 0], ['Odbiory', x.tk ?? 0], ...(gk ? [['Obrony', x.saves ?? 0]] : []), ['Faule', x.fouls ?? 0], ['Kondycja', `${Math.round(x.cond)}%`]];
    const status = [r?.card === 'yellow' ? 'żółta kartka' : r?.card === 'secondYellow' ? 'druga żółta, czerwona kartka' : r?.card === 'red' ? 'czerwona kartka' : '', r?.knock && r.on ? `gra z bólem (${r.knock.name}, od ${r.knock.since}. min)` : '', r?.injured ? `uraz: ${x.injury?.name ?? ''}` : '', x.subbedOff ? `zszedł w ${x.minOff}. min` : '', x.minOn > 0 ? `wszedł w ${x.minOn}. min` : ''].filter(Boolean);
    const head = `<header class="pstat__head" data-side="${side}"><span class="pstat__no">${esc(String(kitNo(side, id) ?? ''))}</span><div><h2>${esc(x.p.name)}</h2><p>${esc(r?.pos ?? x.p.pos)}${r?.pos && r.pos !== x.p.pos ? ` (nominalnie ${esc(x.p.pos)})` : ''}, ${esc(sideName(side))}</p></div>
        ${r?.rating != null ? `<b class="rt rt--${rBand(r.rating)}" title="Ocena na żywo">${r.rating.toFixed(1)}</b>` : ''}</header>`;
    const body = `${status.length ? `<p class="pstat__st">${esc(status.join(', '))}</p>` : ''}
      <dl class="pstat">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`).join('')}</dl>`;
    return { head, body };
  }
  function openPlayerStats(side, id) {
    const dlg = app.querySelector('#mdDlg'); const parts = playerStatsParts(side, id);
    if (!parts || !dlg) return;
    hideHover();
    dlg.className = 'panel md-dlg pstat-dlg';
    dlg.innerHTML = `${parts.head}${parts.body}
      <p class="hint">Ocena na żywo: zdarzenia meczu, bez losowej korekty oceny końcowej.</p>
      <p>${btn('closeDlg', 'Zamknij', false)}</p>`;
    if (!dlg.open) dlg.showModal();
  }

  // Podgląd statystyk po najechaniu kursorem na ocenę zawodnika (listy składów, tylko urządzenia ze wskaźnikiem).
  // Lista składów odświeża się co minutę meczu, więc podgląd żyje poza nią i odświeża treść przy każdej klatce.
  let hov = null; // { side, id, el }
  const canHover = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  function hoverEl() {
    let el = document.getElementById('mdHov');
    if (!el) { el = document.createElement('div'); el.id = 'mdHov'; el.className = 'md-hov'; el.setAttribute('role', 'tooltip'); document.body.append(el); }
    return el;
  }
  function placeHover(anchor) {
    const el = hoverEl(); const r = anchor.getBoundingClientRect(); const w = el.offsetWidth || 320; const h = el.offsetHeight || 260;
    let left = r.right + 10; if (left + w > innerWidth - 8) left = r.left - w - 10; if (left < 8) left = Math.max(8, Math.min(innerWidth - w - 8, r.left));
    let top = r.top + r.height / 2 - h / 2; top = Math.max(8, Math.min(innerHeight - h - 8, top));
    el.style.left = `${Math.round(left)}px`; el.style.top = `${Math.round(top)}px`;
  }
  function showHover(side, id, anchor) {
    const parts = playerStatsParts(side, id);
    if (!parts) return;
    const el = hoverEl();
    el.innerHTML = `${parts.head}${parts.body}`;
    el.classList.add('is-open');
    hov = { side, id };
    placeHover(anchor);
  }
  function hideHover() { hov = null; document.getElementById('mdHov')?.classList.remove('is-open'); }
  function refreshHover() {
    if (!hov) return;
    const anchor = app.querySelector(`[data-mdp="${hov.side}|${CSS.escape(hov.id)}"] [data-hov]`);
    if (!anchor || !app.isConnected) { hideHover(); return; }
    showHover(hov.side, hov.id, anchor);
  }
  if (!app.dataset.mdHov) {
    app.dataset.mdHov = '1';
    app.addEventListener('mouseover', (ev) => {
      if (!canHover() || !S.M || !S.step?.startsWith('live')) return;
      const rt = ev.target.closest?.('[data-mdp] [data-hov]');
      if (!rt) { if (hov) hideHover(); return; }
      const [sd, pid] = rt.closest('[data-mdp]').dataset.mdp.split('|');
      if (hov && hov.side === Number(sd) && hov.id === pid) return;
      showHover(Number(sd), pid, rt);
    });
    app.addEventListener('mouseleave', hideHover);
  }

  // Karta zawodnika w meczu (menu pod prawym przyciskiem): atrybuty, forma z ostatnich meczów, stan.
  // Rywal: bez morale (zna je tylko jego klub).
  function openPlayerCard(side, id) {
    const dlg = app.querySelector('#mdDlg'); const x = findX(side, id);
    if (!x || !dlg) return;
    hideHover();
    const p = game.world?.players?.[id] ?? x.p;
    const mine = side === S.userSide;
    const r = playerStates(S.M, side).find((q) => q.id === id);
    const pos = r?.on ? r.pos : p.pos;
    const prof = r?.on && x.slot ? proficiency(p, x.slot.pos, x.slot.side) : 100;
    const facts = [
      ['W meczu', r?.on ? `${pos}${prof < 100 ? `, ${prof}% na tej pozycji` : ''}` : r?.bench ? 'Ławka rezerwowych' : x.subbedOff ? `Zszedł w ${x.minOff}. min` : 'Poza grą'],
      ['Kondycja', `${Math.round(x.cond)}%`],
      ...(mine ? [['Morale', moraleLabel(p.morale ?? 12)]] : []),
      ['Ocena meczu', r?.rating != null ? r.rating.toFixed(1) : 'brak'],
    ];
    dlg.className = 'panel md-dlg mcard-dlg';
    dlg.innerHTML = `<header class="pstat__head mcard__head" data-side="${side}"><span class="pstat__no">${esc(String(kitNo(side, id) ?? ''))}</span>
        <div><h2>${esc(p.name)}</h2><p>${esc(POS_NAMES[p.pos] ?? p.pos)}, ${esc(String(p.age ?? ''))} lat, ${esc(NAT_NAMES[p.nat] ?? p.nat ?? '')}, ${esc(sideName(side))}</p></div>
        <span class="mcard__ovr" title="Ocena ogólna w skali 1-20">${Math.round(p.ovr ?? 0)}</span>
        <button class="mcard__x" data-md="closeDlg" aria-label="Zamknij kartę zawodnika">×</button></header>
      <dl class="mcard__facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`).join('')}</dl>
      <div class="mcard__body">
        <section class="mcard__attrs">${attrGroupsHtml(p, { heading: 'h4' })}</section>
        <section class="mcard__side">${formChartHtml(p)}${positionMapHtml(p)}</section>
      </div>
      <p>${btn('closeDlg', 'Zamknij', false)}</p>`;
    if (!dlg.open) dlg.showModal();
  }
  /** Otwiera menu dla elementu listy składu albo zawodnika na boisku (trafienie w kropkę na canvasie). */
  function openPlayerMenuAt(el, at) {
    if (!S.M || !S.step.startsWith('live')) return false;
    let side; let id;
    if (el.id === 'mdPitch') {
      const rc = el.getBoundingClientRect();
      const px = at.x - rc.left; const py = at.y - rc.top;
      const hit = ui.dots.filter((d) => d.px != null && Math.hypot(d.px - px, d.py - py) <= d.pr + 6).sort((a, b) => Math.hypot(a.px - px, a.py - py) - Math.hypot(b.px - px, b.py - py))[0];
      if (!hit || at.keyboard) return false;
      side = hit.side; id = hit.id;
    } else {
      const [sd, pid] = el.dataset.mdp.split('|');
      side = Number(sd); id = pid;
    }
    const model = playerMenuModel(side, id);
    if (!model) return false;
    openMenu({ ...at, model, anchor: el, onSelect: (it) => runPlayerMenu(side, id, it) });
    return true;
  }
  app.mdMenuOpen = openPlayerMenuAt;
  if (!app.dataset.mdMenu) {
    app.dataset.mdMenu = '1';
    bindContextTrigger(app, { selector: '[data-mdp], #mdPitch', open: (el, at) => app.mdMenuOpen?.(el, at) ?? false });
  }

  // ------------------------------------------------------------ Przerwa, dogrywka, studio pomeczowe
  /** Skład na boisku w przerwie: numer, pozycja, nazwisko, ocena na żywo (od bramkarza). */
  function breakXi(side) {
    const M = S.M; const T = M.teams[side];
    const byId = new Map([...T.players, ...T.bench].map((x) => [x.id, x]));
    const on = playerStates(M, side).filter((r) => r.on).sort((a, b) => (a.slotIdx < 0 ? 99 : a.slotIdx) - (b.slotIdx < 0 ? 99 : b.slotIdx));
    const rows = on.map((r) => {
      const x = byId.get(r.id);
      const rt = r.rating;
      return `<li><span class="brk-xi__no">${esc(String(kitNo(side, r.id) ?? ''))}</span><span class="pos" data-g="${GROUP[r.pos] ?? 'MID'}">${esc(r.pos)}</span>
        <span class="brk-xi__nm">${esc(lastName(x?.p ?? r))}${markers(r, x)}</span>${rt != null ? `<b class="rt rt--${rBand(rt)}">${rt.toFixed(1)}</b>` : '<b class="rt rt--none">–</b>'}</li>`;
    }).join('');
    return `<section class="sec brk-xi" data-side="${side}" aria-label="Skład: ${esc(sideName(side))}"><h2>${crest(side === 0 ? fixture.home : fixture.away, 22)}<span>${esc(sideName(side))}</span></h2><ol>${rows}</ol></section>`;
  }
  function renderBreak() {
    const h = MD.halfInfo(S);
    shell(`
      <h1>${S.step === 'etbreak' ? 'Przerwa przed dogrywką' : 'Przerwa'}</h1>
      <div class="brk-board">${boardHtml(S.M.score, S.step === 'etbreak' ? 'Dogrywka' : 'Przerwa')}</div>
      <div class="brk-grid">
      ${breakXi(0)}
      <section class="sec brk-stats"><h2>Statystyki meczu</h2><table class="vs"><tbody>${STAT_ROWS.map(([k, l]) => { const x = Number(h.stats[0][k]); const y = Number(h.stats[1][k]); const t = x + y || 1; return `<tr><td>${h.stats[0][k]}</td><td class="lbl">${esc(l)}<div class="bar2"><i class="bh" style="width:${x / t * 100}%"></i><i class="ba" style="width:${y / t * 100}%"></i></div></td><td>${h.stats[1][k]}</td></tr>`; }).join('')}</tbody></table></section>
      ${breakXi(1)}
      </div>`,
      (S.step === 'etbreak' ? btn('resumeET', 'Rozpocznij dogrywkę') : btn('toHalfTalk', 'Odprawa w przerwie')) + secondBtn() + btn('dlg:manage', 'Zmiany i taktyka', false));
    if (!app.querySelector('#mdDlg')) app.insertAdjacentHTML('beforeend', '<dialog id="mdDlg" class="panel md-dlg"></dialog>');
  }

  // ------------------------------------------------------------ Sparing: druga jedenastka w przerwie
  // Asystent proponuje masową wymianę wg planu rotacji (assistantSuggest); gracz odznacza, kogo zostawić, i zatwierdza.
  const secondTitle = () => (['auto', 'two_xi'].includes(S.M?.rules?.rotation) && unlimited(S.M) ? 'Druga jedenastka' : 'Rotacja w przerwie');
  const secondBtn = () => (S.M?.rules?.friendly && S.M.phase === 'break' && S.M.half === 1 && MD.secondEleven(S).length ? btn('dlg:second', secondTitle(), false) : '');
  function renderSecondEleven(dlg, fresh) {
    const list = MD.secondEleven(S);
    if (fresh) { ui.second = new Set(list.map((_, i) => i)); ui.secondMsg = ''; }
    ui.second ??= new Set(list.map((_, i) => i));
    const T = S.M.teams[S.userSide];
    const cond = (id) => Math.round([...T.players, ...T.bench].find((x) => x.id === id)?.cond ?? 100);
    const n = list.filter((_, i) => ui.second.has(i)).length;
    dlg.className = 'panel md-dlg md-dlg--wide sxi-dlg';
    dlg.innerHTML = `<header class="sxi__head"><h2>${esc(secondTitle())}</h2>
        <p class="hint">${esc(friendlyRulesOf({ friendlyRules: S.f.friendlyRules }).rotation === 'match' ? 'Plan rotacji: jak w meczu o punkty. Asystent zmienia tylko tych, którym to potrzebne.' : 'Propozycja asystenta według planu rotacji. Odznacz zawodników, którzy mają zostać na boisku.')}</p></header>
      ${list.length ? `<ul class="sxi">${list.map((a, i) => `<li class="sxi__i"><label>
          <input type="checkbox" data-sxi="${i}" ${ui.second.has(i) ? 'checked' : ''}>
          <span class="sxi__out"><span class="pos" data-g="${GROUP[a.outPos] ?? 'MID'}">${esc(a.outPos ?? '')}</span><span>${esc(a.outName)}<small>kondycja ${cond(a.outId)}%</small></span></span>
          <span class="sxi__arrow" aria-hidden="true"></span>
          <span class="sxi__in"><span class="pos" data-g="${GROUP[a.inPos] ?? 'MID'}">${esc(a.inPos ?? '')}</span><span>${esc(a.inName)}<small>${esc(a.text ?? '')}</small></span></span>
        </label></li>`).join('')}</ul>` : '<p class="hint">Asystent nie proponuje już zmian.</p>'}
      <p class="hint" role="status" id="mdDlgMsg">${esc(ui.secondMsg ?? '')}</p>
      <div class="sxi__btns">${btn('closeDlg', 'Zamknij', false)}<button class="btn btn--primary" data-md="secondGo" ${n ? '' : 'disabled'}>Wprowadź zmiany (${n})</button></div>`;
    if (!dlg.open) dlg.showModal();
    if (!dlg.dataset.sxi) {
      dlg.dataset.sxi = '1';
      dlg.addEventListener('change', (ev) => {
        const i = ev.target.dataset?.sxi;
        if (i == null || !dlg.classList.contains('sxi-dlg')) return;
        if (ev.target.checked) ui.second.add(Number(i)); else ui.second.delete(Number(i));
        renderSecondEleven(dlg, false);
        dlg.querySelector(`[data-sxi="${i}"]`)?.focus();
      });
    }
  }
  function applySecond() {
    const list = MD.secondEleven(S);
    const pick = list.filter((_, i) => ui.second?.has(i));
    const r = MD.applySecondEleven(S, pick);
    ui.secondMsg = r.errors.length ? `Wykonano ${r.done} z ${pick.length}: ${r.errors.join(' ')}` : `Wykonano ${r.done} ${r.done === 1 ? 'zmianę' : r.done % 10 >= 2 && r.done % 10 <= 4 && (r.done < 10 || r.done > 20) ? 'zmiany' : 'zmian'}.`;
    ui.second = null;
    const msg = ui.secondMsg;
    app.querySelector('#mdDlg')?.close();
    if (S.step === 'break' || S.step === 'etbreak') renderBreak(); else if (S.step === 'odprawa2') renderTalk('half');
    const live = app.querySelector('.md__main');
    live?.insertAdjacentHTML('afterbegin', `<p class="notice" role="status">${esc(msg)}</p>`);
  }

  // ------------------------------------------------------------ Seria rzutów karnych
  // Okno kolejności (pauza silnika 'shootoutPrep'): wszyscy uprawnieni w kolejności strzałów, numer dla
  // strzelających po wyrównaniu liczebności, bramkarz serii, propozycja asystenta. Potem strzał po strzale.
  const pct1 = (v) => String(v).replace('.', ',');
  function soDraft(setup, reset = false) {
    if (!ui.so || reset) {
      const order = setup.mine.order ?? setup.mine.final;
      const ids = [...order, ...setup.mine.players.map((x) => x.id).filter((id) => !order.includes(id))];
      ui.so = { ids, keeperId: setup.mine.keeperId, msg: reset ? 'Kolejność asystenta: najpewniejsi strzelcy najpierw, bramkarz na końcu.' : '' };
      if (reset) ui.so.ids = setup.mine.players.map((x) => x.id);
      if (reset) ui.so.keeperId = setup.naturalKeeperId;
    }
    return ui.so;
  }
  function renderShootoutPrep() {
    const setup = MD.shootoutSetup(S);
    if (!setup) { S.step = S.M?.ended ? 'fulltime' : S.step; return route(); }
    const d = soDraft(setup);
    const pv = MD.previewShootoutOrder(d.ids, d.keeperId, setup.n);
    const byId = new Map(setup.mine.players.map((x) => [x.id, x]));
    const rank = new Map(pv.order.map((id, i) => [id, i + 1]));
    const listIds = [...pv.order, ...pv.out];
    const row = (id, i) => {
      const x = byId.get(id); if (!x) return '';
      const k = rank.get(id);
      const gk = id === d.keeperId;
      const meta = [`kondycja ${x.cond}%`, `opanowanie ${x.opa}`, x.knock ? 'gra z bólem' : ''].filter(Boolean).join(', ');
      const band = x.pct >= 76 ? 'top' : x.pct >= 71 ? 'good' : x.pct >= 66 ? 'mid' : 'low';
      const sep = i === 5 && setup.n > 5 ? '<li class="so-sep" aria-hidden="true"><span>Nagła śmierć, ta sama kolejność</span></li>' : i === pv.order.length && pv.out.length ? '<li class="so-sep so-sep--out" aria-hidden="true"><span>Nie strzelają: wyrównanie liczebności</span></li>' : '';
      return `${sep}<li class="so-row${k ? '' : ' is-out'}${gk ? ' is-gk' : ''}" data-so="${esc(id)}">
        <span class="so-n" aria-hidden="true">${k ?? '–'}</span>
        <span class="so-grip" data-sograb aria-hidden="true"></span>
        <span class="pos" data-g="${gk ? 'GK' : GROUP[x.pos] ?? 'MID'}">${esc(x.pos)}</span>
        <span class="so-nm"><b>${esc(x.name)}</b><small>${esc(meta)}</small></span>
        <span class="so-pct" title="Szansa gola przeciw bramkarzowi rywala"><i class="so-pct__bar"><i data-b="${band}" style="width:${Math.max(0, Math.min(100, (x.pct - 45) / 50 * 100))}%"></i></i><b>${x.pct}%</b></span>
        <span class="so-mv"><button class="so-btn" data-md="soMove:${esc(id)}|-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(`${x.name} wyżej`)}">▲</button><button class="so-btn" data-md="soMove:${esc(id)}|1" ${i === listIds.length - 1 ? 'disabled' : ''} aria-label="${esc(`${x.name} niżej`)}">▼</button></span>
        <span class="sr-only">${k ? `strzela jako ${k}.` : 'nie strzela'}, szansa ${x.pct} procent, ${esc(meta)}</span>
      </li>`;
    };
    const oppGk = setup.opp.players.find((x) => x.keeper);
    const kp = setup.keepers.find((x) => x.id === d.keeperId) ?? setup.keepers[0];
    const changed = d.ids.join() !== setup.mine.players.map((x) => x.id).join() || d.keeperId !== setup.naturalKeeperId;
    shell(`
      <h1 class="so-title">Seria rzutów karnych</h1>
      <div class="brk-board">${boardHtml(S.M.score, S.M.extraTime ? 'po dogrywce' : 'Rzuty karne')}</div>
      <div class="so">
        <section class="so-order" aria-labelledby="soOrderH">
          <h2 id="soOrderH">Kolejność strzelców</h2>
          <p class="hint">Strzela ${setup.n} zawodników${setup.n > 5 ? '; pierwsza piątka w pięciu seriach, dalej nagła śmierć' : ''}. Przeciągnij za uchwyt albo użyj strzałek. Strzelać mogą tylko ci, którzy skończyli mecz na boisku.</p>
          <ol class="so-list" id="soList">${listIds.map(row).join('')}</ol>
        </section>
        <aside class="so-side">
          <section class="so-card"><h2><label for="soKeeper">Bramkarz w serii</label></h2>
            <select id="soKeeper" class="pick-select">${setup.keepers.map((x) => `<option value="${esc(x.id)}" ${x.id === d.keeperId ? 'selected' : ''}>${esc(x.name)} (${esc(x.pos)}), bramkarz ${pct1(x.gk)}</option>`).join('')}</select>
            <p class="hint">Liczą się refleks i gra jeden na jeden. ${kp ? `${esc(kp.name)}: ${pct1(kp.gk)} na 20.` : ''} Bramkarz serii zawsze strzela.</p>
          </section>
          <section class="so-card"><h2>Rywal</h2>
            <p>${esc(sideName(1 - S.userSide))}: ${setup.opp.n} strzelających${oppGk ? `, w bramce ${esc(oppGk.name)}` : ''}.</p>
            <p class="hint">Procent przy zawodniku to szansa gola przeciw temu bramkarzowi. W nagłej śmierci więcej znaczy opanowanie.</p>
          </section>
          <p class="hint" role="status" id="soMsg">${esc(d.msg ?? '')}</p>
        </aside>
      </div>`,
      `<button class="btn btn--quiet" data-md="soSuggest" ${changed ? '' : 'disabled'}>Propozycja asystenta</button>${btn('soGo', 'Rozpocznij serię')}`);
    app.querySelector('#soKeeper')?.addEventListener('change', (ev) => { ui.so.keeperId = ev.target.value; ui.so.msg = ''; renderShootoutPrep(); app.querySelector('#soKeeper')?.focus(); });
    mountShootoutDrag();
  }
  function soMove(id, dir) {
    const setup = MD.shootoutSetup(S); const d = soDraft(setup);
    const pv = MD.previewShootoutOrder(d.ids, d.keeperId, setup.n);
    const list = [...pv.order, ...pv.out];
    const i = list.indexOf(id); const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    d.ids = list; d.msg = '';
    renderShootoutPrep();
    const b = app.querySelector(`[data-md="soMove:${CSS.escape(id)}|${dir}"]`) ?? app.querySelector(`[data-md="soMove:${CSS.escape(id)}|${-dir}"]`);
    b?.focus();
  }
  /** Przeciąganie wierszy kolejności (Pointer Events): wiersz idzie za palcem, upuszczenie zapisuje kolejność. */
  function mountShootoutDrag() {
    const list = app.querySelector('#soList');
    if (!list) return;
    let drag = null;
    list.addEventListener('pointerdown', (ev) => {
      const grip = ev.target.closest('[data-sograb]');
      const li = grip?.closest('.so-row');
      if (!li || !ev.isPrimary) return;
      ev.preventDefault();
      drag = { li, id: li.dataset.so };
      li.classList.add('is-drag'); list.classList.add('is-dragging');
      try { grip.setPointerCapture(ev.pointerId); } catch { /* bez przechwytu */ }
    });
    list.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      ev.preventDefault();
      const rows = [...list.querySelectorAll('.so-row')].filter((r) => r !== drag.li);
      const after = rows.find((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
      if (after) list.insertBefore(drag.li, after.previousElementSibling?.classList.contains('so-sep') ? after.previousElementSibling : after);
      else list.appendChild(drag.li);
    });
    const end = () => {
      if (!drag) return;
      const ids = [...list.querySelectorAll('.so-row')].map((r) => r.dataset.so);
      drag = null;
      ui.so.ids = ids; ui.so.msg = '';
      renderShootoutPrep();
    };
    list.addEventListener('pointerup', end);
    list.addEventListener('pointercancel', end);
  }

  // Seria strzał po strzale: tablica LED z kółkami serii, zawodnik przy piłce, wynik. Pomiń: od razu cała seria.
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function soKicks() { return S.M.events.filter((e) => e.type === 'shootoutKick'); }
  function renderShootoutReveal() {
    const kicks = soKicks();
    ui.soShown ??= 0;
    const shown = Math.min(ui.soShown, kicks.length);
    const done = shown >= kicks.length;
    const tally = [0, 0];
    kicks.slice(0, shown).forEach((e) => { if (e.scored) tally[e.side]++; });
    const rounds = Math.max(5, ...kicks.map((e) => e.round));
    const dots = (sd) => Array.from({ length: rounds }, (_, r) => {
      const e = kicks.slice(0, shown).find((k) => k.side === sd && k.round === r + 1);
      const st = !e ? 'wait' : e.scored ? 'goal' : 'miss';
      return `<span class="so-dot so-dot--${st}${r >= 5 ? ' is-sd' : ''}${e && e === kicks[shown - 1] ? ' is-new' : ''}"><span class="sr-only">${r + 1}. seria: ${st === 'wait' ? 'jeszcze nie strzelał' : st === 'goal' ? 'gol' : 'nie strzelił'}</span></span>`;
    }).join('');
    const cur = done ? null : kicks[shown];
    const who = (id) => shortPlayerName(whoById(id));
    const res = (e) => (e.scored ? 'Gol' : e.outcome === 'saved' ? 'Obronił' : 'Pudło');
    const winner = done ? (S.M.shootout.goals[0] > S.M.shootout.goals[1] ? 0 : 1) : null;
    const last = shown > 0 ? kicks[shown - 1] : null;
    shell(`
      <h1 class="so-title">Seria rzutów karnych</h1>
      <div class="brk-board">${boardHtml(S.M.score, `karne ${tally[0]}:${tally[1]}`)}</div>
      <section class="so-led so-reveal" aria-label="Przebieg serii">
        ${[0, 1].map((sd) => `<div class="so-led__row" data-side="${sd}"><span class="so-led__t">${crest(sd === 0 ? fixture.home : fixture.away, 22)}<b>${esc(shortName(sd))}</b></span><span class="so-dots">${dots(sd)}</span><b class="so-led__n">${tally[sd]}</b></div>`).join('')}
      </section>
      <div class="so-reveal">
      <div class="so-spot${cur ? ' is-runup' : ''}${done ? ' is-done' : ''}" id="soSpot" data-side="${cur?.side ?? last?.side ?? ''}">
        ${cur ? `<div class="so-goal" id="soGoal"><span class="so-goal__gk">${esc(who(cur.gkId) || 'zawodnik z pola')}</span></div>
          <small>${cur.round > 5 ? `Nagła śmierć, ${cur.round}. seria` : `${cur.round}. seria`}, strzela ${esc(sideName(cur.side))}</small>
          <span class="so-spot__ball" aria-hidden="true">${ICON.ball}</span>
          <b class="so-spot__nm">${esc(who(cur.pid))}</b>`
        : `<small>Koniec serii</small><b class="so-spot__nm">${esc(sideName(winner))}</b><span class="so-spot__vs">wygrywa ${S.M.shootout.goals[winner]}:${S.M.shootout.goals[1 - winner]} w rzutach karnych</span>`}
      </div>
      <p class="sr-only" aria-live="polite" id="soLive">${last ? esc(last.text) : ''}</p>
      <ol class="so-log">${kicks.slice(0, shown).map((e) => `<li data-side="${e.side}" class="${e.scored ? 'is-goal' : 'is-miss'}"><span class="so-log__r">${e.round}.</span><b>${esc(shortName(e.side))}</b><span>${esc(who(e.pid))}</span><em>${res(e)}</em></li>`).reverse().join('')}</ol>
      </div>`,
      done ? btn('soEnd', 'Dalej') : btn('soSkip', 'Pokaż wynik serii', false));
    clearTimeout(ui.soTimer);
    if (!done) {
      const fast = reduceMotion();
      // Podbieg ok. 0,9 s, wynik 0,7 s; przy ograniczonym ruchu bez animacji, ten sam rytm
      ui.soTimer = setTimeout(() => {
        const spot = app.querySelector('#soSpot');
        if (spot && cur) {
          spot.classList.remove('is-runup');
          spot.classList.add(cur.scored ? 'is-goal' : 'is-miss');
          (spot.querySelector('#soGoal') ?? spot).insertAdjacentHTML('beforeend', `<b class="so-spot__res">${res(cur)}</b>`);
        }
        ui.soTimer = setTimeout(() => { ui.soShown = shown + 1; if (S.step === 'shootout') renderShootoutReveal(); }, fast ? 600 : 700);
      }, fast ? 700 : 900);
    }
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
          <div class="final">${boardHtml(r.score, r.shootout ? `karne ${r.shootout.goals[0]}:${r.shootout.goals[1]}` : r.extraTime ? 'po dogrywce' : 'Koniec', { size: 34 })}</div>
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
    if (S.step === 'shootoutPrep') return renderShootoutPrep();
    if (S.step === 'shootout') return renderShootoutReveal();
    if (S.step === 'odprawa2') return renderTalk('half');
    if (S.step === 'fulltime') { MD.finishMatchday(game, S); save(); return renderPost(); }
    if (S.step === 'studio2') return renderPost();
    if (S.step === 'odprawa3') return renderTalk('post');
    return null;
  }

  async function onClick(ev) {
    const row = ev.target.closest('[data-mdp]');
    if (row && !ev.target.closest('[data-md]')) {
      const r = row.getBoundingClientRect();
      openPlayerMenuAt(row, { x: ev.clientX || r.left + 24, y: ev.clientY || r.bottom - 4, keyboard: ev.detail === 0 });
      return;
    }
    const el = ev.target.closest('[data-md]');
    if (!el) return;
    const [act, arg] = el.dataset.md.split(':');
    const M = S.M;
    if (act === 'toLineup' && onLineup) {
      // Rozpoczęta konferencja przedmeczowa zostaje rozliczona (nie powtórzy się); nierozpoczęta czeka na powrót
      if (MD.pressSlot(S, 'pre').conf?.answers?.length) MD.leaveStudio(game, S);
      app.querySelector('#mdPress')?.remove();
      stop(); cleanup(); await save(); onLineup();
      return;
    }
    if (act === 'toBriefing') {
      MD.leaveStudio(game, S); // konferencja przedmeczowa pominięta albo już rozliczona
      app.querySelector('#mdPress')?.remove();
      S.step = 'odprawa'; ui.adv = null; ui.sel = {}; await save(); route();
    }
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
    if (act === 'tab') { ui.tab = arg; normTab(); }
    if (act === 'skip') { stop(); MD.skip(S); route(); }
    if (act === 'dlg') { if (ui.running) stop(); openDialog(arg, true); }
    if (act === 'mmTab') { ui.mmTab = arg; openDialog('manage'); }
    if (act === 'mmConfirm') { confirmAll(); openDialog('manage'); }
    if (act === 'mmDiscard') { ui.pend = []; ui.tac = null; ui.subSel = null; ui.subMsg = 'Odrzucono niezatwierdzone zmiany.'; openDialog('manage'); }
    if (act === 'tacUndo') { const T = M.teams[S.userSide]; const d = tacDraft(T); if (arg === 'formation' || arg === 'assign') setDraftFormation(T, T.formation.id); else d.ins[arg] = String(T.tactics.instructions?.[arg] ?? ''); openDialog('manage'); }
    if (act === 'tokPick') { if (Date.now() < (ui.suppressClick ?? 0)) return; tokPick(arg); openDialog('manage'); }
    if (act === 'slotPick') { if (Date.now() < (ui.suppressClick ?? 0)) return; slotPick(Number(arg)); openDialog('manage'); }
    if (act === 'closeDlg') app.querySelector('#mdDlg')?.close();
    if (act === 'subPick') { if (Date.now() < (ui.suppressClick ?? 0)) return; const [k, id] = arg.split('|'); pickSub(k, id); openDialog('manage'); }
    if (act === 'subDrop') { ui.pend.splice(Number(arg), 1); ui.subMsg = 'Usunięto zaplanowaną zmianę.'; openDialog('manage'); }
    if (act === 'subClose') {
      if (ui.pend?.length || tacDiff(M.teams[S.userSide]).n) { ui.subMsg = 'Masz niezatwierdzone zmiany. Zatwierdź je albo odrzuć.'; openDialog('manage'); return; }
      ui.subSel = null; ui.subMsg = ''; ui.tac = null; app.querySelector('#mdDlg')?.close();
    }
    if (act === 'doShout') {
      const r = shout(M, S.userSide, arg);
      if (!r.ok) { openDialog('shout'); return; }
      app.querySelector('#mdDlg')?.close();
      updateLive(); updateShoutBtn();
      if (S.step === 'live1' || S.step === 'live2') start(); // mecz rusza dalej od razu
    }
    if (act === 'toHalfTalk') { S.step = 'odprawa2'; ui.adv = null; ui.sel = {}; route(); }
    if (act === 'resume' || act === 'resumeET') { MD.continueAfterBreak(S); route(); }
    if (act === 'secondGo') applySecond();
    if (act === 'soMove') { const [id, dir] = arg.split('|'); soMove(id, Number(dir)); }
    if (act === 'soSuggest') { const setup = MD.shootoutSetup(S); if (setup) { soDraft(setup, true); renderShootoutPrep(); app.querySelector('[data-md="soGo"]')?.focus(); } }
    if (act === 'soGo') {
      const setup = MD.shootoutSetup(S);
      const d = setup && soDraft(setup);
      const r = d ? MD.confirmShootout(S, MD.previewShootoutOrder(d.ids, d.keeperId, setup.n).order, d.keeperId === setup.naturalKeeperId ? null : d.keeperId) : { ok: false, error: 'Seria rzutów karnych nie czeka na rozpoczęcie.' };
      if (!r.ok) { ui.so.msg = r.error; renderShootoutPrep(); return; }
      ui.so = null; ui.soShown = 0; route();
    }
    if (act === 'soSkip') { clearTimeout(ui.soTimer); ui.soShown = soKicks().length; renderShootoutReveal(); app.querySelector('[data-md="soEnd"]')?.focus(); }
    if (act === 'soEnd') { clearTimeout(ui.soTimer); MD.endShootout(S); route(); }
    if (act === 'toPostTalk') { S.step = 'odprawa3'; ui.sel = {}; ui.adv = null; route(); }
    if (act === 'pressOpen' || act === 'pressView') { ui.prsPhase = arg === 'pre' ? 'pre' : 'post'; MD.pressOpen(game, S, ui.prsPhase); ui.prsConfirm = false; renderPressDialog(); }
    if (act === 'pressAns') { MD.pressAnswer(game, S, Number(arg), ui.prsPhase); if (slotOf(ui.prsPhase).settled) await save(); renderPressDialog(); }
    if (act === 'pressOut') { ui.prsConfirm = true; renderPressDialog(); }
    if (act === 'pressOutNo') { ui.prsConfirm = false; renderPressDialog(); }
    if (act === 'pressOutYes') { ui.prsConfirm = false; MD.pressWalkOut(game, S, ui.prsPhase); await save(); renderPressDialog(); }
    if (act === 'pressClose') app.querySelector('#mdPress')?.close();
    if (act === 'exit') { stop(); MD.closeMatchday(game, S); app.querySelector('#mdPress')?.remove(); cleanup(); await save(); onExit(); }
  }

  function onKey(ev) { if (ev.key === ' ' && S.step.startsWith('live') && !ev.target.closest('input,select,button,dialog')) { ev.preventDefault(); ui.running ? stop() : start(); } }
  function cleanup() {
    app.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey);
    ro?.disconnect(); headRo?.disconnect(); cancelAnimationFrame(ui.raf); clearTimeout(ui.soTimer);
    mqWide.removeEventListener('change', onMq); mqHuge.removeEventListener('change', onMq); mqLaptop.removeEventListener('change', onMq);
    closeMenu({ restoreFocus: false });
    app.mdMenuOpen = null; delete app.mdSession;
    for (const k of ['--home', '--home-ink', '--away', '--away-ink']) app.style.removeProperty(k);
  }
  app.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  app.mdSession = S; // podgląd stanu meczu dla testów w przeglądarce i debugowania (nic tego nie zmienia)
  route();
  return { session: S, stop, cleanup };
}
