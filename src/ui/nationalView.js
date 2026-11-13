// Rozgrywki: Reprezentacje. Polska (mecze, grupa, powołani z polskich klubów), Liga Narodów, eliminacje Euro 2028.
import { CLUBS_PL } from '../data/clubs_pl.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate, weekday } from './dom.js';
import { anyClub } from '../season/season.js';
import { ntName, lnGroupTable, euroGroupTable, teamMatches, NT_COMP_NAMES, ntTeam } from '../season/national.js';
import { ufxRow } from './europeView.js';

const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const crest = (id, size = 18) => { const c = anyClub(id); return c ? crestHtml(c, { size, clubsById }) : ''; };
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
const shortDay = (iso) => `${weekday(iso).slice(0, 3)} ${fmtDate(iso).replace(/, \d{4}$/, '')}`;
export const NATIONAL_VIEWS = [['pol', 'Polska'], ['ln', 'Liga Narodów'], ['euro', 'Euro 2028'], ['callups', 'Powołania']];

function ntRow(m) {
  const r = m.played ? m.result : null;
  const pol = m.home === 'POL' || m.away === 'POL';
  const winner = r ? (r.score[0] !== r.score[1] ? (r.score[0] > r.score[1] ? m.home : m.away) : r.shootout ? (r.shootout[0] > r.shootout[1] ? m.home : m.away) : null) : null;
  const info = [NT_COMP_NAMES[m.comp], m.group ? `grupa ${m.group}` : '', m.leg ? (m.leg === 1 ? '1. mecz' : 'rewanż') : '', r?.shootout ? `karne ${r.shootout[0]}:${r.shootout[1]}` : r?.extraTime ? 'po dogrywce' : ''].filter(Boolean).join(', ');
  return ufxRow({ cls: pol ? 'is-pl' : '', date: esc(shortDay(m.date)), home: m.home, away: m.away, sh: r ? r.score[0] : null, sa: r ? r.score[1] : null,
    time: '–', sub: esc(info), winner, nameOf: ntName, crestOf: () => '', flagOf: () => '' });
}

function table(rows, title, zones = () => '') {
  return `<section class="stat-sec"><h3>${esc(title)}</h3><div class="tbl tbl--nt" role="table">
    <div class="tbl__row tbl__head" role="row"><span>#</span><span>Drużyna</span><span>M</span><span class="w">W</span><span class="w">R</span><span class="w">P</span><span>Bramki</span><span>Pkt</span></div>
    ${rows.map((r) => `<div class="tbl__row ${r.id === 'POL' ? 'is-me' : ''}" role="row" data-zone="${zones(r.pos, rows.length)}"><span class="tbl__pos">${r.pos}</span><span class="tbl__club"><span>${esc(ntName(r.id))}</span></span><span>${r.p}</span><span class="w">${r.w}</span><span class="w">${r.d}</span><span class="w">${r.l}</span><span>${r.gf}:${r.ga}</span><b>${r.pts}</b></div>`).join('')}
  </div></section>`;
}

function polView(game) {
  const N = game.national;
  const ms = teamMatches(N, 'POL');
  const next = ms.filter((m) => !m.played).slice(0, 4);
  const done = ms.filter((m) => m.played).reverse();
  const t = ntTeam('POL');
  return `<p class="hint">Ranking FIFA: ${t.rankingFIFA}. Liga Narodów 2026/27: liga ${t.ligaLN}, grupa ${t.grupaLN}.</p>
    ${table(lnGroupTable(N, 'B4'), 'Liga Narodów, grupa B4', (p) => (p === 1 ? 'up' : p === 2 ? 'playoff' : p === 4 ? 'down' : ''))}
    <ul class="legend"><li data-zone="up">Awans do ligi A</li><li data-zone="playoff">Baraż A/B</li><li data-zone="down">Baraż B/C</li></ul>
    ${next.length ? `<section class="stat-sec"><h3>Najbliższe mecze</h3><ul class="ufxlist">${next.map(ntRow).join('')}</ul></section>` : ''}
    ${done.length ? `<section class="stat-sec"><h3>Wyniki</h3><ul class="ufxlist">${done.map(ntRow).join('')}</ul></section>` : ''}`;
}

function lnView(game) {
  const N = game.national;
  const zone = (g) => (p, n) => (g.startsWith('A') ? (p <= 2 ? 'up' : '') : (p === 1 ? 'up' : p === 2 ? 'playoff' : p === n && !g.startsWith('D') ? 'down' : ''));
  const ko = N.ln.ko ? Object.values(N.matches).filter((m) => ['LNQF', 'LNAB', 'LNBC', 'LNF'].includes(m.comp)).sort((a, b) => a.date.localeCompare(b.date)) : [];
  return `${N.ln.champion ? `<p class="panel__lead">Zwycięzca Ligi Narodów: ${esc(ntName(N.ln.champion))}</p>` : ''}
    ${ko.length ? `<section class="stat-sec"><h3>Faza pucharowa i baraże</h3><ul class="ufxlist">${ko.map(ntRow).join('')}</ul></section>` : '<p class="hint">Ćwierćfinały i baraże losowane po fazie ligowej (koniec listopada).</p>'}
    ${Object.keys(N.ln.groups).map((g) => table(lnGroupTable(N, g), `Grupa ${g}`, zone(g))).join('')}`;
}

function euroView(game) {
  const N = game.national;
  if (!N.euro.groups) return '<p class="hint">Losowanie grup eliminacji Euro 2028 odbędzie się Dec 6, 2026. Mecze od marca 2027, turniej w Wielkiej Brytanii i Irlandii w 2028.</p>';
  const pg = Object.entries(N.euro.groups).find(([, t]) => t.includes('POL'))?.[0];
  const order = [pg, ...Object.keys(N.euro.groups).filter((g) => g !== pg)].filter(Boolean);
  const polMatches = Object.values(N.matches).filter((m) => m.comp === 'EQ' && m.group === pg).sort((a, b) => a.date.localeCompare(b.date));
  return `<p class="hint">12 grup. Awans: zwycięzcy grup i 8 najlepszych drużyn z 2. miejsc, reszta przez baraże w marcu 2028.</p>
    ${order.map((g) => table(euroGroupTable(N, g), `Grupa ${g}`, (p) => (p === 1 ? 'up' : p === 2 ? 'playoff' : ''))).join('')}
    ${pg ? `<section class="stat-sec"><h3>Mecze grupy ${esc(pg)}</h3><ul class="ufxlist">${polMatches.map(ntRow).join('')}</ul></section>` : ''}`;
}

function callupsView(game) {
  const N = game.national;
  const wins = Object.entries(N.windows).filter(([, s]) => s.list).sort((a, b) => b[0].localeCompare(a[0]));
  if (!wins.length) return '<p class="hint">Pierwsze powołania przed oknem reprezentacyjnym we wrześniu.</p>';
  const [from, st] = wins[0];
  const mine = new Set(game.world.clubs[game.clubId]?.squad ?? []);
  const rows = st.list.map((c) => ({ c, p: game.world.players[c.id] })).filter((x) => x.p)
    .sort((a, b) => Number(mine.has(b.c.id)) - Number(mine.has(a.c.id)) || (a.c.team === 'POL' ? -1 : 0) - (b.c.team === 'POL' ? -1 : 0) || a.c.team.localeCompare(b.c.team) || b.c.score - a.c.score);
  return `<p class="hint">Zawodnicy z polskich klubów powołani na zgrupowanie od ${esc(fmtDate(from))}${st.status === 'done' ? ' (zakończone)' : ''}. Nie trenują z klubem i nie grają w meczach ligowych w tym czasie.</p>
    <ol class="stat-list">${rows.map(({ c, p }) => `<li class="${mine.has(c.id) ? 'is-me' : ''}">${crest(p.clubId)}<span>${esc(p.name)}<small>${esc(ntName(c.team))}${c.u21 ? ' U21' : ''}${p.intl?.caps ? `, ${plural(p.intl.caps, 'występ', 'występy', 'występów')}, ${plural(p.intl.goals, 'gol', 'gole', 'goli')}` : ''}</small></span><b>${esc(p.pos)}</b></li>`).join('')}</ol>`;
}

export function renderNational(game, view) {
  const v = NATIONAL_VIEWS.some(([k]) => k === view) ? view : 'pol';
  const tabs = `<div class="subtabs" role="tablist">${NATIONAL_VIEWS.map(([k, l]) => `<button role="tab" data-act="cview" data-v="${k}" aria-selected="${v === k}">${l}</button>`).join('')}</div>`;
  if (!game.national) return `${tabs}<p class="hint">Reprezentacje pojawią się następnego dnia gry.</p>`;
  return `${tabs}<div class="nt-grid nt-grid--${v}">${v === 'ln' ? lnView(game) : v === 'euro' ? euroView(game) : v === 'callups' ? callupsView(game) : polView(game)}</div>`;
}
