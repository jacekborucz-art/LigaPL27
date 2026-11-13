// Rozgrywki: zakładki Liga Mistrzów, Liga Europy, Liga Konferencji.
// Przebieg (eliminacje, baraże, drabinka), tabela fazy ligowej, mecze wg dat, strzelcy, ranking krajów,
// pokaz losowania (kule wyciągane po kolei, z przyspieszeniem i od razu wynikiem).
import { CLUBS_PL } from '../data/clubs_pl.js';
import { anyClub } from '../season/season.js';
import { UCOMP_NAMES, ROUND_NAMES, ROUND_SHORT, ORDER, leagueTable, countryOf, COUNTRY_NAMES, uefaClub } from '../season/uefa.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate, weekday } from './dom.js';

const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const isPolish = (id) => clubsById.has(id);
const crest = (id, size = 22) => { const c = anyClub(id); return c ? crestHtml(c, { size, clubsById }) : ''; };
const name = (id) => anyClub(id)?.name ?? id;
const flag = (id) => (isPolish(id) ? '' : `<small class="cc">${esc(countryOf(id))}</small>`);
const shortDay = (iso) => `${weekday(iso).slice(0, 3)} ${fmtDate(iso).replace(/, \d{4}$/, '')}`;
export const EUROPE_TABS = [['LM', 'Liga Mistrzów'], ['LE', 'Liga Europy'], ['LK', 'Liga Konferencji']];
export const EUROPE_VIEWS = [['path', 'Przebieg'], ['league', 'Tabela'], ['fixtures', 'Mecze'], ['scorers', 'Strzelcy'], ['ranking', 'Kraje']];

function score(m) {
  if (!m?.played) return `<span class="fx__time">${esc(m?.time ?? '')}</span>`;
  const r = m.result;
  return `<b class="fx__score">${r.score[0]}:${r.score[1]}</b>${r.shootout ? `<small>k. ${r.shootout[0]}:${r.shootout[1]}</small>` : r.extraTime ? '<small>po dogr.</small>' : ''}`;
}

function matchRow(m, game) {
  const mine = m.home === game.clubId || m.away === game.clubId;
  const pol = isPolish(m.home) || isPolish(m.away);
  return `<li class="fx ${mine ? 'is-me' : pol ? 'is-pl' : ''}">
    <span class="fx__date">${esc(shortDay(m.date))}${m.leg ? `, ${m.leg === 1 ? '1. mecz' : 'rewanż'}` : ''}${m.md ? `, ${m.md}. kolejka` : ''}${m.neutral ? ', stadion neutralny' : ''}</span>
    <span class="fx__team fx__team--h">${flag(m.home)}${esc(name(m.home))}${crest(m.home)}</span>
    <span class="fx__mid">${score(m)}</span>
    <span class="fx__team">${crest(m.away)}${esc(name(m.away))}${flag(m.away)}</span>
  </li>`;
}

function tieRow(t, U, game) {
  const ms = t.legs.map((id) => U.matches[id]);
  const mine = t.a === game.clubId || t.b === game.clubId;
  const pol = isPolish(t.a) || isPolish(t.b);
  const legTxt = ms.map((m) => (m.played ? `${m.home === t.a ? m.result.score[0] : m.result.score[1]}:${m.home === t.a ? m.result.score[1] : m.result.score[0]}` : '-:-')).join(', ');
  const win = (id) => (t.winner === id ? ' tie--win fx__team--win' : t.winner ? ' tie--out fx__team--out' : '');
  const tag = t.winner ? ` <span class="tag-up">${t.round === 'F' ? 'zdobywca' : 'awans'}: ${esc(name(t.winner))}</span>` : '';
  return `<li class="fx tie ${mine ? 'is-me' : pol ? 'is-pl' : ''}">
    <span class="fx__date">${esc(ms.map((m) => shortDay(m.date)).join(' i '))}${tag}</span>
    <span class="fx__team fx__team--h${win(t.a)}">${flag(t.a)}${esc(name(t.a))}${crest(t.a)}</span>
    <span class="fx__mid">${t.agg ? `<b class="fx__score">${t.agg[0]}:${t.agg[1]}</b>` : '<span class="fx__time">vs</span>'}<small>${esc(ms.length > 1 ? legTxt : '')}${t.shootout ? ` k. ${t.shootout[0]}:${t.shootout[1]}` : ''}</small></span>
    <span class="fx__team${win(t.b)}">${crest(t.b)}${esc(name(t.b))}${flag(t.b)}</span>
  </li>`;
}

function pathView(game, comp, ui) {
  const U = game.season.uefa;
  const C = U.comps[comp];
  const drawn = ORDER[comp].filter((r) => C.rounds[r].drawn);
  const pending = ORDER[comp].find((r) => !C.rounds[r].drawn);
  const sections = drawn.slice().reverse().map((r) => {
    const R = C.rounds[r];
    const head = `<div class="sec-head"><h3>${esc(cap(ROUND_NAMES[r]))}</h3><button class="btn btn--quiet btn--sm" data-act="udraw" data-c="${comp}" data-r="${r}">Obejrzyj losowanie</button></div>
      <p class="hint">Losowanie ${esc(fmtDate(R.drawDate))}.</p>`;
    if (r === 'league') {
      const pol = C.league.teams.filter(isPolish);
      return `<section class="stat-sec">${head}<p class="hint">36 drużyn, ${C.league.pots[0].length * 0 + C.league.matches.length} meczów. ${pol.length ? `Polskie kluby: ${pol.map(name).join(', ')}.` : 'Bez polskich klubów.'} Tabela w zakładce Tabela.</p></section>`;
    }
    return `<section class="stat-sec">${head}<ul class="fxlist">${R.ties.map((t) => tieRow(t, U, game)).join('')}</ul></section>`;
  });
  const champion = C.champion ? `<p class="panel__lead champ">${crest(C.champion, 32)} ${esc(name(C.champion))} wygrywa ${esc(UCOMP_NAMES[comp])}.</p>` : '';
  const next = pending ? `<p class="hint">Następna runda: ${esc(ROUND_NAMES[pending])}. Losowanie po zakończeniu poprzednich rund.</p>` : '';
  const seu = comp === 'LM' || comp === 'LE' ? superCupEUPanel(game) : '';
  return `${seu}${drawPanel(game, ui)}${champion}${next}${sections.join('') || '<p class="hint">Losowania jeszcze się nie odbyły.</p>'}`;
}

/** Superpuchar Europy sezonu: zwycięzca LM kontra zwycięzca LE poprzedniego sezonu, duży stadion, sierpień. */
function superCupEUPanel(game) {
  const sc = game.season.superCupEU;
  if (!sc) return '';
  const r = sc.result;
  const win = (id) => (sc.winner === id ? ' fx__team--win' : sc.winner ? ' fx__team--out' : '');
  return `<section class="stat-sec seu"><div class="sec-head"><h3>Superpuchar Europy ${sc.year}</h3></div>
    <p class="hint">${esc(sc.venue.stadium)}, ${esc(sc.venue.city)} (${esc(sc.venue.country)}), ok. ${Math.round(sc.venue.cap / 1000)} tys. miejsc. ${esc(fmtDate(sc.date))}, ${esc(sc.time)}. Zwycięzca Ligi Mistrzów kontra zwycięzca Ligi Europy, przy remisie od razu rzuty karne.</p>
    <ul class="fxlist"><li class="fx tie${isPolish(sc.home) || isPolish(sc.away) ? ' is-pl' : ''}">
      <span class="fx__date">${esc(shortDay(sc.date))}${sc.winner ? ` <span class="tag-up">zdobywca: ${esc(name(sc.winner))}</span>` : ''}</span>
      <span class="fx__team fx__team--h${win(sc.home)}">${flag(sc.home)}${esc(name(sc.home))}${crest(sc.home)}</span>
      <span class="fx__mid">${r ? `<b class="fx__score">${r.score[0]}:${r.score[1]}</b>` : '<span class="fx__time">vs</span>'}<small>${r?.shootout ? `k. ${r.shootout[0]}:${r.shootout[1]}` : ''}</small></span>
      <span class="fx__team${win(sc.away)}">${crest(sc.away)}${esc(name(sc.away))}${flag(sc.away)}</span>
    </li></ul></section>`;
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function leagueView(game, comp, md) {
  const U = game.season.uefa;
  const L = U.comps[comp].league;
  if (!L) return '<p class="hint">Faza ligowa jeszcze się nie zaczęła. Losowanie odbędzie się pod koniec sierpnia.</p>';
  const rows = leagueTable(U, comp);
  const zone = (p) => (p <= 8 ? 'up' : p <= 24 ? 'playoff' : 'down');
  const ms = L.matches.map((id) => U.matches[id]);
  const nMd = Math.max(...ms.map((m) => m.md));
  const cur = md ?? (ms.find((m) => !m.played)?.md ?? nMd);
  return `
    <div class="tbl" role="table" aria-label="Tabela fazy ligowej">
      <div class="tbl__row tbl__head" role="row"><span>#</span><span>Klub</span><span>M</span><span class="w">W</span><span class="w">R</span><span class="w">P</span><span>Bramki</span><span>Pkt</span><span class="w2">Forma</span></div>
      ${rows.map((r) => `<div class="tbl__row ${r.id === game.clubId ? 'is-me' : isPolish(r.id) ? 'is-pl' : ''}" role="row" data-zone="${zone(r.pos)}">
        <span class="tbl__pos">${r.pos}</span><span class="tbl__club">${crest(r.id)}<span>${esc(name(r.id))}</span>${flag(r.id)}</span>
        <span>${r.p}</span><span class="w">${r.w}</span><span class="w">${r.d}</span><span class="w">${r.l}</span><span>${r.gf}:${r.ga}</span><b>${r.pts}</b>
        <span class="w2"><span class="form">${r.form.slice(-5).map((c) => `<b class="${c}">${c}</b>`).join('')}</span></span></div>`).join('')}
    </div>
    <ul class="legend"><li data-zone="up">1/8 finału</li><li data-zone="playoff">Baraże fazy pucharowej</li><li data-zone="down">Koniec gry w pucharach</li></ul>
    <div class="roundnav">
      <button class="btn btn--quiet" data-act="cround" data-r="${Math.max(1, cur - 1)}" ${cur <= 1 ? 'disabled' : ''} aria-label="Poprzednia kolejka">‹</button>
      <span>${cur}. kolejka</span>
      <button class="btn btn--quiet" data-act="cround" data-r="${Math.min(nMd, cur + 1)}" ${cur >= nMd ? 'disabled' : ''} aria-label="Następna kolejka">›</button>
    </div>
    <ul class="fxlist">${ms.filter((m) => m.md === cur).sort((a, b) => (isPolish(b.home) || isPolish(b.away)) - (isPolish(a.home) || isPolish(a.away))).map((m) => matchRow(m, game)).join('')}</ul>`;
}

function fixturesView(game, comp, filter) {
  const U = game.season.uefa;
  const all = Object.values(U.matches).filter((m) => m.comp === comp && (filter === 'all' || isPolish(m.home) || isPolish(m.away)));
  all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const days = [...new Set(all.map((m) => m.date))];
  const chips = `<div class="chips chips--sm">${[['pl', 'Polskie kluby'], ['all', 'Wszystkie mecze']].map(([k, l]) => `<button class="chip" data-act="ufilter" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join('')}</div>`;
  if (!days.length) return `${chips}<p class="hint">${filter === 'all' ? 'Brak meczów po losowaniach.' : 'Polskie kluby nie mają jeszcze wylosowanych meczów w tych rozgrywkach.'}</p>`;
  return `${chips}${days.map((d) => `<section class="stat-sec"><h3>${esc(shortDay(d))}, ${esc(ROUND_SHORT[all.find((m) => m.date === d).round])}</h3><ul class="fxlist">${all.filter((m) => m.date === d).map((m) => matchRow(m, game)).join('')}</ul></section>`).join('')}`;
}

function scorersView(game, comp) {
  const U = game.season.uefa;
  const rows = Object.values(U.scorers).filter((s) => s.comp === comp).sort((a, b) => b.g - a.g || a.name.localeCompare(b.name)).slice(0, 25);
  if (!rows.length) return '<p class="hint">Jeszcze nikt nie strzelił gola.</p>';
  return `<ol class="stat-list">${rows.map((s) => `<li>${crest(s.club, 18)}<span>${esc(s.name)}<small>${esc(name(s.club))}</small></span><b>${s.g}</b></li>`).join('')}</ol>`;
}

function rankingView(game) {
  const U = game.season.uefa;
  const clubs = new Map();
  for (const c of Object.keys(U.comps)) for (const r of Object.values(U.comps[c].rounds)) for (const id of r.entrants) clubs.set(countryOf(id), (clubs.get(countryOf(id)) ?? 0) + 1);
  const rows = [...clubs].map(([cc, n]) => ({ cc, n, pts: Math.round(((U.countryPts[cc] ?? 0) / n) * 1000) / 1000 })).sort((a, b) => b.pts - a.pts);
  return `<p class="hint">Punkty krajów w sezonie 2026/27: zwycięstwo 2 pkt, remis 1 pkt (w eliminacjach połowa), podzielone przez liczbę klubów. Premie za awanse dojdą w kolejnych sezonach.</p>
    <ol class="stat-list rank">${rows.map((r, i) => `<li class="${r.cc === 'POL' ? 'is-me' : ''}"><span></span><span>${esc(COUNTRY_NAMES[r.cc] ?? r.cc)}<small>${r.n} ${r.n === 1 ? 'klub' : r.n < 5 ? 'kluby' : 'klubów'}</small></span><b>${r.pts.toFixed(3).replace('.', ',')}</b></li>`).join('')}</ol>`;
}

// ------------------------------------------------------------ Pokaz losowania
function drawPanel(game, ui) {
  if (!ui.draw) return '';
  const [comp, round] = ui.draw.split(':');
  const U = game.season.uefa;
  const d = U.draws.find((x) => x.comp === comp && x.round === round);
  if (!d) return '';
  const ball = (id) => `<span class="ball">${crest(id, 20)}${esc(name(id))}${flag(id)}</span>`;
  let pots = ''; let items = '';
  if (round === 'league') {
    const L = U.comps[comp].league;
    pots = `<div class="pots">${L.pots.map((p, i) => `<div><h4>Koszyk ${i + 1}</h4>${p.map(ball).join('')}</div>`).join('')}</div>`;
    const focus = L.teams.filter(isPolish);
    const who = focus.length ? focus : [L.pots[0][0]];
    items = who.map((t) => `<h4>${esc(name(t))}</h4>${d.opponents[t].sort((a, b) => L.pots.findIndex((p) => p.includes(a.opp)) - L.pots.findIndex((p) => p.includes(b.opp))).map((o) => `<div class="draw-item" hidden>${ball(o.opp)}<small>${o.home ? 'u siebie' : 'na wyjeździe'}, ${o.md}. kolejka</small></div>`).join('')}`).join('');
  } else {
    if (d.seeded) pots = `<div class="pots pots--2"><div><h4>Rozstawieni</h4>${d.seeded.map(ball).join('')}</div><div><h4>Nierozstawieni</h4>${d.unseeded.map(ball).join('')}</div></div>`;
    items = d.pairs.map((p) => `<div class="draw-item" hidden>${ball(p.seeded)}<span class="vs">-</span>${ball(p.unseeded)}</div>`).join('');
  }
  return `<section class="drawbox" data-draw aria-live="polite">
    <div class="sec-head"><h3>Losowanie: ${esc(ROUND_NAMES[round])}</h3><button class="btn btn--quiet btn--sm" data-act="udrawclose">Zamknij</button></div>
    ${pots}<div class="draw-items">${items}</div>
    <p class="draw-ctrl"><button class="btn btn--quiet btn--sm" data-draw-fast>Przyspiesz</button><button class="btn btn--quiet btn--sm" data-draw-all>Pokaż wynik</button></p>
  </section>`;
}

/** Wyciąganie kul po kolei (ok. 1 s na parę). Wywołać po każdym renderze ekranu. */
export function mountDrawAnimation(root) {
  const box = root.querySelector('[data-draw]');
  if (!box || box.dataset.mounted) return;
  box.dataset.mounted = '1';
  const items = [...box.querySelectorAll('.draw-item')];
  let i = 0; let delay = 1000;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick = () => {
    if (!box.isConnected) return;
    if (i < items.length) { items[i].hidden = false; items[i].classList.add('pop'); i++; setTimeout(tick, delay); }
  };
  box.querySelector('[data-draw-fast]')?.addEventListener('click', () => { delay = 250; });
  box.querySelector('[data-draw-all]')?.addEventListener('click', () => { items.forEach((x) => { x.hidden = false; }); i = items.length; });
  if (reduce) items.forEach((x) => { x.hidden = false; });
  else setTimeout(tick, 400);
  box.scrollIntoView({ block: 'start' });
}

export function renderEurope(game, comp, { view = 'path', round = null, filter = 'pl', draw = null } = {}) {
  const v = EUROPE_VIEWS.some(([k]) => k === view) ? view : 'path';
  const views = `<div class="subtabs subtabs--5" role="tablist">${EUROPE_VIEWS.map(([k, l]) => `<button role="tab" data-act="cview" data-v="${k}" aria-selected="${v === k}">${l}</button>`).join('')}</div>`;
  if (!game.season?.uefa) return `${views}<p class="hint">Puchary pojawią się po wczytaniu gry.</p>`;
  const body = v === 'league' ? leagueView(game, comp, round) : v === 'fixtures' ? fixturesView(game, comp, filter) : v === 'scorers' ? scorersView(game, comp) : v === 'ranking' ? rankingView(game) : pathView(game, comp, { draw });
  return `${views}${body}`;
}
export { uefaClub };
