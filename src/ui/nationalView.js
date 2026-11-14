// Rozgrywki: Reprezentacje. Polska (mecze, grupy, siła), Liga Narodów, eliminacje, turniej finałowy (Euro, MŚ),
// turnieje innych konfederacji w tle, historia i sukcesy, powołania zawodników z polskich klubów.
// Dane: game.national (2026/27 i grupy eliminacji Euro 2028), game.intl (silnik wieczny), game.intlHistory.
import { CLUBS_PL } from '../data/clubs_pl.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate, weekday, fmtDay } from './dom.js';
import { anyClub } from '../season/season.js';
import { ntName, lnGroupTable, euroGroupTable, teamMatches, ntTeam } from '../season/national.js';
import { bindRatings } from '../season/intl/ratings.js';
import { tourPeriod, addDaysIso } from '../season/intl/windows.js';
import { tableOf } from '../season/intl/sim.js';
import {
  asNt, intlName, compLabel, groupLabel, lnTable, tourSchedule, uqTable, cqTable, intlTeamMatches, FMT, COMP_NAME, CONF_NAME, ROUND_NAME, STAGE_LABEL, stageRank, tourName, tourKey,
} from '../season/intl/engine.js';
import { hostsFor } from '../season/intl/hosts.js';
import { ufxRow } from './europeView.js';

const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const crest = (id, size = 18) => { const c = anyClub(id); return c ? crestHtml(c, { size, clubsById }) : ''; };
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
const shortDay = (iso) => `${weekday(iso).slice(0, 3)} ${fmtDay(iso)}`;
const yearOf = (game) => Number(game.date.slice(0, 4));
const names = (list) => list.map(intlName).join(', ');

// ------------------------------------------------------------ Dane bieżące
const comps = (game) => Object.values(game.intl?.comps ?? {});
const latest = (game, type) => comps(game).filter((c) => c.type === type).sort((a, b) => (b.y ?? b.T) - (a.y ?? a.T))[0] ?? null;
/** Bieżąca Liga Narodów: edycja silnika (od 2028/29) albo 2026/27 z national.js. */
const currentLn = (game) => latest(game, 'LN');
/** Bieżące eliminacje UEFA: silnik albo grupy Euro 2028 z national.js przed ich zamknięciem. */
const currentUq = (game) => latest(game, 'UQ');
function currentTour(game) {
  const list = comps(game).filter((c) => c.type === 'EURO' || c.type === 'WC').sort((a, b) => b.y - a.y);
  return list[0] ?? null;
}
/** Najbliższy turniej finałowy (rok i klucz) do etykiety zakładki. */
function nextTourKey(game) {
  const t = currentTour(game);
  if (t && (t.st !== 'done' || game.date <= `${t.y}-12-31`)) return t.key;
  let y = yearOf(game);
  if (y % 2 || game.date > (tourPeriod(y)?.to ?? '')) y += y % 2 ? 1 : 2;
  return tourKey(y);
}
const tabLabel = (key) => { const [t, y] = key.split('-'); return t === 'WC' ? `MŚ ${y}` : `Euro ${y}`; };

export function nationalViews(game) {
  return [['pol', 'Polska'], ['ln', 'Liga Narodów'], ['q', 'Eliminacje'], ['tour', tabLabel(nextTourKey(game))], ['world', 'Świat'], ['hist', 'Historia'], ['callups', 'Powołania']];
}
export const NATIONAL_VIEWS = [['pol', 'Polska'], ['ln', 'Liga Narodów'], ['q', 'Eliminacje'], ['tour', 'Turniej'], ['world', 'Świat'], ['hist', 'Historia'], ['callups', 'Powołania']];

// ------------------------------------------------------------ Elementy
const winnerOfNt = (m) => {
  const r = m.played ? m.result : null;
  return r ? (r.score[0] !== r.score[1] ? (r.score[0] > r.score[1] ? m.home : m.away) : r.shootout ? (r.shootout[0] > r.shootout[1] ? m.home : m.away) : null) : null;
};
function ntRow(m, { label = true } = {}) {
  const r = m.played ? m.result : null;
  const pol = m.home === 'POL' || m.away === 'POL';
  const info = [label ? compLabel(m) : '', groupLabel(m), m.leg ? (m.leg === 1 ? '1. mecz' : 'rewanż') : '', m.path ? `ścieżka ${m.path}` : '', r?.shootout ? `karne ${r.shootout[0]}:${r.shootout[1]}` : r?.extraTime ? 'po dogrywce' : ''].filter(Boolean).join(', ');
  return ufxRow({ cls: pol ? 'is-pl' : '', date: esc(shortDay(m.date)), home: m.home, away: m.away, sh: r ? r.score[0] : null, sa: r ? r.score[1] : null,
    time: '–', sub: esc(info), winner: winnerOfNt(m), nameOf: intlName, crestOf: () => '', flagOf: () => '' });
}
// Lista meczów: w kolumnach siatki (PC) zawsze układ zwarty, drużyny jedna pod drugą; wide: pełna szerokość
const list = (title, ms, opts = {}) => (ms.length ? `<section class="stat-sec${opts.wide ? '' : ' ntlist'}"><h3>${esc(title)}</h3><ul class="ufxlist${opts.wide ? '' : ' ufxlist--compact'}">${ms.map((m) => ntRow(m, opts)).join('')}</ul></section>` : '');
/** Faza pucharowa Ligi Narodów: kolumny etapów (ćwierćfinały, baraże, finały). */
function lnKo(ms) {
  const cols = [['Ćwierćfinały', (m) => m.round === 'QF' || m.comp === 'LNQF'], ['Baraże A/B', (m) => m.round === 'AB' || m.comp === 'LNAB'], ['Baraże B/C', (m) => m.round === 'BC' || m.comp === 'LNBC'],
    ['Finały', (m) => ['SF', '3', 'F'].includes(m.round) || m.comp === 'LNF']].map(([t, f]) => [t, ms.filter(f)]).filter(([, x]) => x.length);
  if (!cols.length) return '';
  return `<section class="stat-sec ntko"><h3>Faza pucharowa i baraże</h3><div class="ntko__cols">${cols.map(([t, x]) => `<div class="ntko__col"><h4>${esc(t)}</h4><ul class="ufxlist ufxlist--compact">${x.map((m) => ntRow(m, { label: false })).join('')}</ul></div>`).join('')}</div></section>`;
}

function table(rows, title, zones = () => '', note = '') {
  return `<section class="stat-sec"><h3>${esc(title)}${note ? ` <small class="muted">${esc(note)}</small>` : ''}</h3><div class="tbl tbl--nt" role="table">
    <div class="tbl__row tbl__head" role="row"><span>#</span><span>Drużyna</span><span>M</span><span class="w">W</span><span class="w">R</span><span class="w">P</span><span>Bramki</span><span>Pkt</span></div>
    ${rows.map((r) => `<div class="tbl__row ${r.id === 'POL' ? 'is-me' : ''}" role="row" data-zone="${zones(r.pos, rows.length)}"><span class="tbl__pos">${r.pos}</span><span class="tbl__club"><span>${esc(intlName(r.id))}</span></span><span>${r.p}</span><span class="w">${r.w}</span><span class="w">${r.d}</span><span class="w">${r.l}</span><span>${r.gf}:${r.ga}</span><b>${r.pts}</b></div>`).join('')}
  </div></section>`;
}
const legend = (items) => `<ul class="legend">${items.map(([z, t]) => `<li data-zone="${z}">${esc(t)}</li>`).join('')}</ul>`;
const LN_ZONE = (lg) => (p) => (lg === 'A' ? (p <= 8 ? 'up' : p >= 17 ? 'down' : p >= 15 ? 'playoff-down' : '')
  : lg === 'B' ? (p <= 2 ? 'up' : p <= 4 ? 'playoff' : p >= 17 ? 'down' : p >= 15 ? 'playoff-down' : '') : (p <= 2 ? 'up' : p <= 4 ? 'playoff' : ''));
const LN_LEGEND = legend([['up', 'Liga A: ćwierćfinał; B i C: awans'], ['playoff', 'Baraż o awans'], ['playoff-down', 'Baraż o utrzymanie'], ['down', 'Spadek']]);

/** Drabinka: rundy pucharowe obok siebie (PC) albo jedna pod drugą (telefon). */
function bracket(c, rounds, started) {
  const fmt = FMT[c.type];
  const days = tourSchedule(fmt, c.len);
  const dayOf = (k) => addDaysIso(c.from, k === '3' ? days.third : days.ko[fmt.ko.indexOf(k)]);
  const cols = rounds.filter((k) => k !== '3' || fmt.third).map((k) => [k, c.m.filter((m) => m.k === k).map((m) => asNt(c, m))]);
  if (!cols.some(([, ms]) => ms.length) && !started) return '';
  return `<section class="stat-sec ntko"><h3>Faza pucharowa</h3><div class="ntko__cols">${cols.map(([k, ms]) => `<div class="ntko__col"><h4>${esc(cap(ROUND_NAME[k] ?? k))}</h4>${ms.length ? `<ul class="ufxlist ufxlist--compact">${ms.map((m) => ntRow(m, { label: false })).join('')}</ul>` : `<p class="hint">Od ${esc(fmtDate(dayOf(k)))}, pary po poprzedniej rundzie.</p>`}</div>`).join('')}</div></section>`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const flagLine = (c) => `${c.host?.length ? `Gospodarze: ${names(c.host)}. ` : ''}${c.from ? `${fmtDate(c.from)} - ${fmtDate(c.to)}.` : ''}`;

// ------------------------------------------------------------ Polska
function polMatches(game) {
  return [...teamMatches(game.national, 'POL'), ...intlTeamMatches(game.intl, 'POL')].sort((a, b) => a.date.localeCompare(b.date));
}
function eloRank(game, code) {
  const r = game.intl?.ratings;
  if (!r) return null;
  const sorted = Object.entries(r).sort((a, b) => b[1] - a[1]);
  return { elo: Math.round(r[code]), rank: sorted.findIndex(([k]) => k === code) + 1, L: ntTeam(code).L };
}
function polGroup(game) {
  // Najważniejsza bieżąca tabela Polski: turniej, eliminacje, Liga Narodów
  const t = currentTour(game);
  if (t && t.st !== 'done' && t.teams.includes('POL')) {
    const g = Object.entries(t.groups).find(([, x]) => x.includes('POL'))[0];
    return table(tableOf(t.groups[g], t.m.filter((m) => m.g === g)), `${tourName(t.key)}, grupa ${g}`, (p) => (p <= 2 ? 'up' : p === 3 && FMT[t.type].thirds ? 'playoff' : ''));
  }
  const q = currentUq(game);
  if (q && q.st === 'G') {
    const g = Object.entries(q.groups).find(([, x]) => x.includes('POL'))?.[0];
    if (g) return table(uqTable(q, g), `Eliminacje: ${tourName(`${q.tour}-${q.T}`)}, grupa ${g}`, (p) => (p === 1 ? 'up' : p === 2 ? 'playoff' : ''));
  }
  const ln = currentLn(game);
  if (ln && ln.st === 'L') { const lg = Object.keys(ln.leagues).find((k) => ln.leagues[k].includes('POL')); return table(lnTable(ln, lg), `Liga Narodów ${ln.y}/${String(ln.y + 1).slice(2)}, liga ${lg}`, LN_ZONE(lg)) + LN_LEGEND; }
  if (!ln && game.national.euro?.groups && game.date >= '2027-01-01') {
    const g = Object.entries(game.national.euro.groups).find(([, x]) => x.includes('POL'))?.[0];
    if (g) return table(euroGroupTable(game.national, g), `Eliminacje Euro 2028, grupa ${g}`, (p) => (p === 1 ? 'up' : p === 2 ? 'playoff' : ''));
  }
  if (!ln) return `${table(lnGroupTable(game.national, 'B4'), 'Liga Narodów 2026/27, grupa B4', (p) => (p === 1 ? 'up' : p === 2 ? 'playoff' : p === 4 ? 'down' : ''))}${legend([['up', 'Awans do ligi A'], ['playoff', 'Baraż A/B'], ['down', 'Baraż B/C']])}`;
  if (q) { const g = Object.entries(q.groups).find(([, x]) => x.includes('POL'))?.[0]; if (g) return table(uqTable(q, g), `Eliminacje: ${tourName(`${q.tour}-${q.T}`)}, grupa ${g}`, (p) => (p === 1 ? 'up' : p === 2 ? 'playoff' : '')); }
  const lg = Object.keys(ln.leagues).find((k) => ln.leagues[k].includes('POL'));
  return table(lnTable(ln, lg), `Liga Narodów ${ln.y}/${String(ln.y + 1).slice(2)}, liga ${lg}`, LN_ZONE(lg));
}
function polView(game) {
  const ms = polMatches(game);
  const next = ms.filter((m) => !m.played).slice(0, 5);
  const done = ms.filter((m) => m.played).reverse().slice(0, 12);
  const er = eloRank(game, 'POL');
  const best = bestResults(game);
  return `<p class="hint">${er ? `Siła reprezentacji: Elo ${er.elo} (${er.rank}. miejsce na świecie), L ${er.L.toFixed(1)}. Elo zmienia się po każdym meczu.` : ''}</p>
    ${polGroup(game)}
    ${list('Najbliższe mecze', next, { wide: true })}
    ${list('Ostatnie wyniki', done, { wide: true })}
    ${best.length ? `<section class="stat-sec"><h3>Najlepsze wyniki w grze</h3><ol class="ntfacts">${best.map(([t, h]) => `<li><span>${esc(t)}<small>${esc(h.year)}</small></span><b>${esc(h.polandResult ?? '')}</b></li>`).join('')}</ol></section>` : ''}`;
}

// ------------------------------------------------------------ Liga Narodów
function lnView(game) {
  const c = currentLn(game);
  if (!c) return ln26View(game);
  const ko = c.m.filter((m) => m.k).map((m) => asNt(c, m));
  const head = `<p class="hint">Liga Narodów ${c.y}/${String(c.y + 1).slice(2)}: trzy ligi po 18 drużyn, każda drużyna 6 meczów (po 2 rywali z każdego koszyka). Ćwierćfinały i baraże w marcu, finały w czerwcu ${c.y + 1}.</p>`;
  return `${c.champion ? `<p class="panel__lead">Zwycięzca Ligi Narodów: ${esc(ntName(c.champion))}</p>` : ''}${head}
    ${lnKo(ko.sort((a, b) => a.date.localeCompare(b.date)))}
    ${['A', 'B', 'C'].map((lg) => table(lnTable(c, lg), `Liga ${lg}`, LN_ZONE(lg))).join('')}${LN_LEGEND}`;
}
function ln26View(game) {
  const N = game.national;
  if (!Object.keys(N.matches ?? {}).length) return '<p class="hint">Brak danych Ligi Narodów.</p>';
  const zone = (g) => (p, n) => (g.startsWith('A') ? (p <= 2 ? 'up' : '') : (p === 1 ? 'up' : p === 2 ? 'playoff' : p === n && !g.startsWith('D') ? 'down' : ''));
  const ko = N.ln.ko ? Object.values(N.matches).filter((m) => ['LNQF', 'LNAB', 'LNBC', 'LNF'].includes(m.comp)).sort((a, b) => a.date.localeCompare(b.date)) : [];
  return `${N.ln.champion ? `<p class="panel__lead">Zwycięzca Ligi Narodów: ${esc(ntName(N.ln.champion))}</p>` : ''}
    ${ko.length ? lnKo(ko) : '<p class="hint">Ćwierćfinały i baraże losowane po fazie ligowej (koniec listopada).</p>'}
    ${Object.keys(N.ln.groups).map((g) => table(lnGroupTable(N, g), `Grupa ${g}`, zone(g))).join('')}`;
}

// ------------------------------------------------------------ Eliminacje
function qView(game) {
  const q = currentUq(game);
  const N = game.national;
  if (!q) {
    if (!N.euro?.groups) return '<p class="hint">Losowanie grup eliminacji Euro 2028 odbędzie się 6 grudnia 2026. Mecze od marca 2027, turniej w Anglii, Irlandii, Szkocji i Walii w 2028.</p>';
    const pg = Object.entries(N.euro.groups).find(([, t]) => t.includes('POL'))?.[0];
    const order = [pg, ...Object.keys(N.euro.groups).filter((g) => g !== pg)].filter(Boolean);
    const polMs = Object.values(N.matches).filter((m) => m.comp === 'EQ' && m.group === pg).sort((a, b) => a.date.localeCompare(b.date));
    return `<p class="hint">Eliminacje Euro 2028: 12 grup. Awans: zwycięzcy grup i 8 najlepszych drużyn z 2. miejsc, reszta przez baraże w marcu 2028.</p>
      ${order.map((g) => table(euroGroupTable(N, g), `Grupa ${g}`, (p) => (p === 1 ? 'up' : p === 2 ? 'playoff' : ''))).join('')}
      ${list(`Mecze grupy ${pg}`, polMs)}`;
  }
  const name = tourName(`${q.tour}-${q.T}`);
  const pg = Object.entries(q.groups).find(([, t]) => t.includes('POL'))?.[0];
  const order = [pg, ...Object.keys(q.groups).filter((g) => g !== pg)].filter(Boolean);
  const rule = q.tour === 'EURO' ? 'Awans: zwycięzcy grup i 8 najlepszych drużyn z 2. miejsc; gospodarze bez awansu mają zarezerwowane miejsca; reszta przez baraże w marcu.'
    : 'Awans: zwycięzcy grup; pozostałe miejsca UEFA w marcowych barażach (drużyny z 2. miejsc i najwyżej w Lidze Narodów).';
  const po = q.m.filter((m) => m.k).map((m) => asNt(q, m));
  const groupMs = pg ? q.m.filter((m) => m.g === pg).map((m) => asNt(q, m)) : [];
  return `<p class="hint">Eliminacje: ${esc(name)}. Gospodarze: ${esc(names(q.hosts))}. ${esc(rule)}</p>
    ${q.paths?.length ? `<section class="stat-sec"><h3>Baraże</h3><ol class="ntfacts">${q.paths.map((p) => `<li><span>Ścieżka ${esc(p.id)}<small>${esc(names(p.teams))}</small></span><b>${esc(p.winner ? ntName(p.winner) : '')}</b></li>`).join('')}</ol></section>` : ''}
    ${list('Mecze barażowe', po)}
    ${order.map((g) => table(uqTable(q, g), `Grupa ${g}`, (p) => (p === 1 ? 'up' : p === 2 ? 'playoff' : ''))).join('')}
    ${list(`Mecze grupy ${pg ?? ''}`, groupMs, { label: false })}`;
}

// ------------------------------------------------------------ Turniej finałowy
function tournamentBlock(c, { polFirst = true, started = true } = {}) {
  const fmt = FMT[c.type];
  const order = Object.keys(c.groups);
  const pg = polFirst ? order.find((g) => c.groups[g].includes('POL')) : null;
  const sorted = pg ? [pg, ...order.filter((g) => g !== pg)] : order;
  const zone = (p) => (p <= 2 ? 'up' : p === 3 && fmt.thirds ? 'playoff' : '');
  return `${c.champion ? `<p class="panel__lead">${esc(tourName(c.key))}: ${esc(ntName(c.champion))}</p>` : ''}
    <p class="hint">${esc(flagLine(c))} ${fmt.n} drużyn, ${fmt.groups} grup po 4; do fazy pucharowej 2 najlepsze${fmt.thirds ? ` i ${fmt.thirds} najlepszych z 3. miejsc` : ''}.</p>
    ${bracket(c, [...fmt.ko.slice(0, -1), '3', 'F'], started)}
    ${sorted.map((g) => table(tableOf(c.groups[g], c.m.filter((m) => m.g === g)), `Grupa ${g}`, zone)).join('')}
    ${fmt.thirds ? legend([['up', 'Awans'], ['playoff', 'Awans z 3. miejsca (najlepsze)']]) : ''}`;
}
function tourView(game) {
  const c = currentTour(game);
  const key = nextTourKey(game);
  if (c && c.key === key) {
    const pg = Object.entries(c.groups).find(([, t]) => t.includes('POL'))?.[0];
    const polMs = pg ? c.m.filter((m) => m.h === 'POL' || m.a === 'POL').map((m) => asNt(c, m)) : [];
    return `${tournamentBlock(c, { started: game.date >= c.from })}${list('Mecze Polski', polMs, { label: false })}`;
  }
  const [type, ys] = key.split('-'); const y = Number(ys);
  const H = game.intl ? hostsFor(game.intl.hosts, game.intl.seed, key, (x) => ntTeam(x)?.konfederacja) : [];
  const t = tourPeriod(y);
  const prev = c ? `<details class="stat-sec ntcard" open><summary><h3>Poprzedni turniej: ${esc(tourName(c.key))}</h3></summary><div class="nt-grid nt-grid--sub">${tournamentBlock(c, { polFirst: false })}</div></details>` : '';
  return `<p class="hint">${esc(tourName(key))}: ${t ? `${fmtDate(t.from)} - ${fmtDate(t.to)}` : ''}. Gospodarze: ${esc(names(H))}. ${type === 'WC' ? '48 drużyn: Europa 16, Afryka 9, Azja 8, Ameryka Południowa 6, Ameryka Północna i Środkowa 6, Oceania 1, baraż interkontynentalny 2.' : '24 drużyny.'} Losowanie grup w grudniu ${y - 1}.</p>${prev}`;
}

// ------------------------------------------------------------ Świat: turnieje kontynentalne i eliminacje MŚ w tle
function worldView(game) {
  const cont = comps(game).filter((c) => FMT[c.type] && FMT[c.type].conf).sort((a, b) => b.from.localeCompare(a.from));
  const cards = cont.map((c) => {
    const f = c.m.find((m) => m.k === 'F');
    const st = c.st === 'done' ? `Zwycięzca: ${ntName(c.champion)}` : game.date >= c.from ? 'w trakcie' : `start ${fmtDate(c.from)}`;
    return `<details class="stat-sec ntcard"${c.st !== 'done' && game.date >= c.from ? ' open' : ''}><summary><h3>${esc(tourName(c.key))} <small class="muted">${esc(st)}</small></h3></summary>
      ${f?.s ? `<p class="hint">Finał: ${esc(ntName(f.h))} - ${esc(ntName(f.a))} ${f.s[0]}:${f.s[1]}${f.p ? ` (karne ${f.p[0]}:${f.p[1]})` : f.x ? ' (po dogrywce)' : ''}</p>` : ''}
      <div class="nt-grid nt-grid--sub">${tournamentBlock(c, { polFirst: false, started: game.date >= c.from })}</div></details>`;
  }).join('');
  const cq = comps(game).filter((c) => c.type === 'CQ').sort((a, b) => a.conf.localeCompare(b.conf));
  const cqHtml = cq.map((c) => `<details class="stat-sec ntcard"><summary><h3>Eliminacje MŚ ${c.T}: ${esc(CONF_NAME[c.conf])} <small class="muted">${c.st === 'done' ? `awans: ${esc(names(c.direct))}` : 'w trakcie'}</small></h3></summary>
      <p class="hint">Miejsca: ${c.direct ? esc(names(c.direct)) : ''}${c.ic?.length ? `; baraż interkontynentalny: ${esc(names(c.ic))}` : ''}</p>
      <div class="nt-grid nt-grid--sub">${c.groups.map((g, gi) => table(cqTable(c, gi), c.groups.length > 1 ? `Grupa ${String.fromCharCode(65 + gi)}` : 'Tabela')).join('')}</div></details>`).join('');
  const ic = latest(game, 'IC');
  const icHtml = ic ? list(`Baraże interkontynentalne MŚ ${ic.T}`, ic.m.map((m) => asNt(ic, m)), { label: false }) : '';
  return `<p class="hint">Turnieje innych konfederacji rozgrywane w tle. Zawodnicy z polskich klubów powołani na te turnieje opuszczają klub do odpadnięcia swojej reprezentacji.</p>
    ${cards || '<p class="hint">Pierwszy turniej: Puchar Azji 2027 (styczeń, Arabia Saudyjska).</p>'}${cqHtml}${icHtml}`;
}

// ------------------------------------------------------------ Historia
const HIST_COMPS = ['WC', 'EURO', 'LN', 'COPA', 'AFCON', 'ASIA', 'GOLD', 'OFC'];
const histName = (h) => (h.comp === 'LN' ? `Liga Narodów ${h.edition}` : `${COMP_NAME[h.comp]} ${h.year}`);
function bestResults(game) {
  const out = [];
  for (const comp of ['WC', 'EURO', 'LN']) {
    const hs = (game.intlHistory ?? []).filter((h) => h.comp === comp && h.poland);
    if (!hs.length) continue;
    const score = (h) => (comp === 'LN' ? (h.poland.stage === '1' ? 100 : h.poland.stage === '2' ? 90 : h.poland.stage === '3' ? 80 : h.poland.stage === '4' ? 70 : h.poland.stage === 'QF' ? 60 : (h.poland.stage[0] === 'A' ? 50 : h.poland.stage[0] === 'B' ? 30 : 10) - Number(h.poland.stage.slice(1) || 0) / 100) : stageRank(h.poland.stage));
    const b = [...hs].sort((x, y) => score(y) - score(x) || x.year - y.year)[0];
    out.push([comp === 'LN' ? 'Liga Narodów' : COMP_NAME[comp], { ...b, year: histName(b) }]);
  }
  return out;
}
function histView(game) {
  const H = game.intlHistory ?? [];
  if (!H.length) return '<p class="hint">Pierwsze wpisy pojawią się po zakończeniu turniejów (Puchar Azji w lutym 2027, Liga Narodów w czerwcu 2027).</p>';
  const titles = {};
  for (const h of H) if (h.champion) (titles[h.champion] ??= {})[h.comp] = ((titles[h.champion] ??= {})[h.comp] ?? 0) + 1;
  const polApps = (comp) => H.filter((h) => h.comp === comp && h.poland && !['Q', 'PO'].includes(h.poland.stage)).length;
  const honours = Object.entries(titles).filter(([, t]) => t.WC || t.EURO).sort((a, b) => (b[1].WC ?? 0) - (a[1].WC ?? 0) || (b[1].EURO ?? 0) - (a[1].EURO ?? 0)).slice(0, 12);
  const best = bestResults(game);
  const sections = HIST_COMPS.map((comp) => {
    const rows = H.filter((h) => h.comp === comp).sort((a, b) => b.year - a.year);
    if (!rows.length) return '';
    const pol = comp === 'WC' || comp === 'EURO' || comp === 'LN';
    return `<section class="stat-sec nthist-sec"><h3>${esc(comp === 'LN' ? 'Liga Narodów' : COMP_NAME[comp])} <small class="muted">${plural(rows.length, 'edycja', 'edycje', 'edycji')}</small></h3>
      <div class="nthist${pol ? ' nthist--pol' : ''}" role="table"><div class="nthist__row nthist__head" role="row"><span>Rok</span><span>Gospodarz</span><span>Mistrz</span><span>Finalista</span>${pol ? '<span>Polska</span>' : ''}</div>
      ${rows.map((h) => `<div class="nthist__row${h.champion === 'POL' ? ' is-me' : ''}" role="row"><span>${esc(h.edition ?? h.year)}</span><span>${esc(h.host ? names(h.host) : '')}</span><b>${esc(ntName(h.champion))}</b><span>${esc(ntName(h.runnerUp))}</span>${pol ? `<span class="nthist__pol">${esc(h.polandResult ?? 'nie grała')}</span>` : ''}</div>`).join('')}
      </div></section>`;
  }).join('');
  return `<section class="stat-sec"><h3>Polska w grze</h3><ol class="ntfacts">
      <li><span>Mistrzostwa świata<small>występy w turnieju</small></span><b>${polApps('WC')}</b></li>
      <li><span>Euro<small>występy w turnieju</small></span><b>${polApps('EURO')}</b></li>
      ${best.map(([t, h]) => `<li><span>${esc(t)}: najlepszy wynik<small>${esc(h.year)}</small></span><b>${esc(h.polandResult ?? '')}</b></li>`).join('')}
    </ol></section>
    ${honours.length ? `<section class="stat-sec"><h3>Mistrzowie świata i Europy</h3><ol class="ntfacts">${honours.map(([code, t]) => `<li><span>${esc(ntName(code))}</span><b>${[t.WC ? `MŚ ${t.WC}` : '', t.EURO ? `Euro ${t.EURO}` : ''].filter(Boolean).join(', ')}</b></li>`).join('')}</ol></section>` : ''}
    ${sections}`;
}

// ------------------------------------------------------------ Powołania
function callupsView(game) {
  const N = game.national;
  const wins = Object.entries(N.windows).filter(([, s]) => s.list).sort((a, b) => (b[1].status === 'active') - (a[1].status === 'active') || b[0].replace(/^T:\w+-/, '').localeCompare(a[0].replace(/^T:\w+-/, '')));
  if (!wins.length) return '<p class="hint">Pierwsze powołania przed oknem reprezentacyjnym we wrześniu.</p>';
  const [from, st] = wins[0];
  const mine = new Set(game.world.clubs[game.clubId]?.squad ?? []);
  const rows = st.list.map((c) => ({ c, p: game.world.players[c.id] })).filter((x) => x.p)
    .sort((a, b) => Number(mine.has(b.c.id)) - Number(mine.has(a.c.id)) || (a.c.team === 'POL' ? -1 : 0) - (b.c.team === 'POL' ? -1 : 0) || a.c.team.localeCompare(b.c.team) || b.c.score - a.c.score);
  const title = st.title ? `${st.title}: ` : '';
  return `<p class="hint">${esc(title)}zawodnicy z polskich klubów powołani na zgrupowanie${/^\d/.test(from) ? ` od ${esc(fmtDate(from))}` : ''}${st.status === 'done' ? ' (zakończone)' : ''}. Nie trenują z klubem i nie grają w meczach klubu w tym czasie${st.tour ? '; uczestnicy turnieju wracają po odpadnięciu reprezentacji' : ''}.</p>
    <ol class="stat-list">${rows.map(({ c, p }) => `<li class="${mine.has(c.id) ? 'is-me' : ''}">${crest(p.clubId)}<span>${esc(p.name)}<small>${esc(ntName(c.team))}${c.u21 ? ' U21' : ''}${c.tour ? (c.off ? ', wrócił z turnieju' : ', turniej') : ''}${p.intl?.caps ? `, ${plural(p.intl.caps, 'występ', 'występy', 'występów')}, ${plural(p.intl.goals, 'gol', 'gole', 'goli')}` : ''}</small></span><b>${esc(p.pos)}</b></li>`).join('')}</ol>`;
}

export function renderNational(game, view) {
  const views = nationalViews(game);
  const v = views.some(([k]) => k === view) ? view : 'pol';
  const tabs = `<div class="subtabs subtabs--scroll" role="tablist">${views.map(([k, l]) => `<button role="tab" data-act="cview" data-v="${k}" aria-selected="${v === k}">${esc(l)}</button>`).join('')}</div>`;
  if (!game.national) return `${tabs}<p class="hint">Reprezentacje pojawią się następnego dnia gry.</p>`;
  bindRatings(game.intl?.ratings ?? null);
  const body = v === 'ln' ? lnView(game) : v === 'q' ? qView(game) : v === 'tour' ? tourView(game) : v === 'world' ? worldView(game) : v === 'hist' ? histView(game) : v === 'callups' ? callupsView(game) : polView(game);
  return `${tabs}<div class="nt-grid nt-grid--${v}">${body}</div>`;
}
