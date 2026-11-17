// Ekran „Rozgrywki”: tabele 3 lig (strefy, forma), terminarz po kolejkach, statystyki, Puchar Polski.
import { CLUBS_PL } from '../data/clubs_pl.js';
import { COMPETITIONS } from '../config/competitions.js';
import { standings, zonesFor } from '../season/standings.js';
import { anyClub, LEAGUE_COMPS } from '../season/season.js';
import { compClubIds, isL3Comp, L3_COMPS, classKeyOfComp } from '../season/leagueComps.js';
import { L3_GROUP_NAMES, clubById } from '../data/clubs_pl.js';
import { PP_ROUNDS, PP_NAMES, winnerOf } from '../season/cup.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate, weekday, fmtDay } from './dom.js';
import { renderEurope, EUROPE_TABS, ufxRow } from './europeView.js';
import { renderNational } from './nationalView.js';

export const COMP_TABS = [['ekstraklasa', 'Ekstraklasa'], ['liga1', '1 Liga'], ['liga2', '2 Liga'], ['liga3', 'III liga'], ['pp', 'Puchar Polski'], ...EUROPE_TABS, ['NT', 'Reprezentacje'], ['HIST', 'Historia']];
const clubsById = { get: (id) => clubById(id) }; // lista klubów zmienia się między sezonami (III i IV liga)
const crest = (id, size = 22) => { const c = anyClub(id); return c ? crestHtml(c, { size, clubsById }) : ''; };
const name = (id) => anyClub(id)?.name ?? 'rywal z losowania';
const shortDay = (iso) => weekday(iso).slice(0, 3);

function formDots(form) {
  return `<span class="form">${form.map((c) => `<b class="${c}">${c}</b>`).join('')}</span>`;
}

/** Kolejka do pokazania: najbliższa nierozegrana, a po sezonie ostatnia. */
function currentRound(fx) {
  const rounds = [...new Set(fx.map((f) => f.round))].sort((a, b) => a - b);
  return { rounds, current: fx.find((f) => !f.played)?.round ?? rounds[rounds.length - 1] };
}
function roundList(game, comp, round, { compact = false } = {}) {
  const fx = game.fixtures.filter((f) => f.comp === comp && f.round === round).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return `<ul class="ufxlist${compact ? ' ufxlist--compact' : ''}">${fx.map((f) => matchRow(f, game)).join('')}</ul>`;
}
function topScorers(game, comp, n = 5) {
  const clubIds = new Set(compClubIds(comp));
  const list = Object.values(game.world.players).filter((p) => clubIds.has(p.clubId) && (p.season?.g ?? 0) > 0).sort((a, b) => b.season.g - a.season.g || (b.season.a ?? 0) - (a.season.a ?? 0)).slice(0, n);
  return list.length ? `<ol class="stat-list">${list.map((p) => `<li>${crest(p.clubId, 18)}<span>${esc(p.name)}<small>${esc(name(p.clubId))}</small></span><b>${p.season.g}</b></li>`).join('')}</ol>` : '<p class="hint">Jeszcze nikt nie strzelił gola.</p>';
}

function tableView(game, comp) {
  const tier = COMPETITIONS[comp].tier;
  const ids = compClubIds(comp);
  const rows = standings(game.fixtures.filter((f) => f.comp === comp), ids);
  const zones = zonesFor(tier);
  const zoneOf = (pos) => zones.find((z) => pos >= z.from && pos <= z.to);
  const fx = game.fixtures.filter((f) => f.comp === comp);
  const { current } = currentRound(fx);
  return `<div class="cgrid cgrid--side"><div class="cgrid__main">
    <div class="tbl" role="table" aria-label="Tabela ${esc(COMPETITIONS[comp].name)}">
      <div class="tbl__row tbl__head" role="row"><span>#</span><span>Klub</span><span>M</span><span class="w">W</span><span class="w">R</span><span class="w">P</span><span>Bramki</span><span>Pkt</span><span class="w2">Forma</span></div>
      ${rows.map((r) => {
        const z = zoneOf(r.pos);
        return `<div class="tbl__row ${r.id === game.clubId ? 'is-me' : ''}" role="row" data-zone="${z?.kind ?? ''}">
          <span class="tbl__pos">${r.pos}</span>
          <span class="tbl__club">${crest(r.id)}<button class="club-link" data-act="club" data-club="${esc(r.id)}" title="Pokaż klub">${esc(name(r.id))}</button></span>
          <span>${r.played}</span><span class="w">${r.wins}</span><span class="w">${r.draws}</span><span class="w">${r.losses}</span>
          <span>${r.gf}:${r.ga}</span><b>${r.points}</b><span class="w2">${formDots(r.form)}</span>
        </div>`;
      }).join('')}
    </div>
    <ul class="legend">${zones.map((z) => `<li data-zone="${z.kind}">${esc(z.label)}</li>`).join('')}</ul>
    </div><aside class="cgrid__aside">
      ${current ? `<section class="cside"><div class="cside__head"><h3>${current}. kolejka</h3><button class="btn btn--quiet btn--sm" data-act="cview" data-v="fixtures">Terminarz</button></div>${roundList(game, comp, current, { compact: true })}</section>` : ''}
      <section class="cside"><div class="cside__head"><h3>Strzelcy</h3><button class="btn btn--quiet btn--sm" data-act="cview" data-v="stats">Statystyki</button></div>${topScorers(game, comp)}</section>
    </aside></div>`;
}

/** Skrócona tabela (obok terminarza na PC). */
function miniTable(game, comp) {
  const tier = COMPETITIONS[comp].tier;
  const ids = compClubIds(comp);
  const rows = standings(game.fixtures.filter((f) => f.comp === comp), ids);
  const zones = zonesFor(tier);
  const zoneOf = (pos) => zones.find((z) => pos >= z.from && pos <= z.to);
  return `<div class="tbl tbl--mini" role="table" aria-label="Tabela">
    <div class="tbl__row tbl__head" role="row"><span>#</span><span>Klub</span><span>M</span><span>Bramki</span><span>Pkt</span></div>
    ${rows.map((r) => `<div class="tbl__row ${r.id === game.clubId ? 'is-me' : ''}" role="row" data-zone="${zoneOf(r.pos)?.kind ?? ''}"><span class="tbl__pos">${r.pos}</span><span class="tbl__club">${crest(r.id, 18)}<span>${esc(name(r.id))}</span></span><span>${r.played}</span><span>${r.gf}:${r.ga}</span><b>${r.points}</b></div>`).join('')}
  </div>`;
}

function matchRow(f, game) {
  const res = f.result;
  const mine = f.home === game.clubId || f.away === game.clubId;
  // Mecz pucharowy: zwycięzca wyróżniony i oznaczony „awans” (w finale „zdobywca”); w lidze wyróżniony zwycięzca meczu
  const w = res ? (f.knockout ? winnerOf(f) : res.score[0] > res.score[1] ? f.home : res.score[1] > res.score[0] ? f.away : null) : null;
  const tag = res && f.knockout && w ? `<span class="ufx__tag">${f.round === 'F' ? 'zdobywca' : 'awans'}</span>` : '';
  const sub = [res?.shootout ? `karne ${res.shootout[0]}:${res.shootout[1]}` : res?.extraTime ? 'po dogrywce' : '', f.postponed && !res ? 'przełożony' : ''].filter(Boolean).join(', ');
  return ufxRow({ cls: mine ? 'is-me' : '', date: `${esc(shortDay(f.date))} ${esc(fmtDay(f.date))}`, home: f.home, away: f.away,
    sh: res ? res.score[0] : null, sa: res ? res.score[1] : null, time: f.time ?? '', sub: `${esc(sub)}${tag}`, winner: w, nameOf: name, crestOf: (id) => crest(id), flagOf: () => '', link: true, report: f.id });
}

function fixturesView(game, comp, round) {
  const fx = game.fixtures.filter((f) => f.comp === comp);
  const { rounds, current: cur } = currentRound(fx);
  const current = round ?? cur;
  return `<div class="cgrid cgrid--side"><div class="cgrid__main">
    <div class="roundnav">
      <button class="btn btn--quiet" data-act="cround" data-r="${Math.max(1, current - 1)}" ${current <= 1 ? 'disabled' : ''} aria-label="Poprzednia kolejka">‹</button>
      <span>${current}. kolejka</span>
      <button class="btn btn--quiet" data-act="cround" data-r="${Math.min(rounds.length, current + 1)}" ${current >= rounds.length ? 'disabled' : ''} aria-label="Następna kolejka">›</button>
    </div>
    ${roundList(game, comp, current)}
    </div><aside class="cgrid__aside">${miniTable(game, comp)}</aside></div>`;
}

function statsView(game, comp) {
  const clubIds = new Set(comp === 'pp' ? [] : compClubIds(comp));
  const players = Object.values(game.world.players).filter((p) => clubIds.has(p.clubId) && p.squad !== 'Y');
  const top = (f, n = 10, filter = () => true) => players.filter(filter).filter((p) => f(p) > 0).sort((a, b) => f(b) - f(a)).slice(0, n);
  const list = (title, arr, f, unit = '') => `<section class="stat-sec"><h3>${esc(title)}</h3>${arr.length ? `<ol class="stat-list">${arr.map((p) => `<li>${crest(p.clubId, 18)}<span>${esc(p.name)}</span><b>${f(p)}${unit}</b></li>`).join('')}</ol>` : '<p class="hint">Brak danych.</p>'}</section>`;
  const injured = players.filter((p) => p.injuryDays > 0).sort((a, b) => b.injuryDays - a.injuryDays).slice(0, 12);
  return `<div class="stats-grid">
    ${list('Strzelcy', top((p) => p.season?.g ?? 0, 15), (p) => p.season.g)}
    ${list('Asysty', top((p) => p.season?.a ?? 0), (p) => p.season.a)}
    ${list('Żółte kartki', top((p) => p.yc?.[classKeyOfComp(comp)] ?? 0), (p) => p.yc[classKeyOfComp(comp)])}
    ${list('Średnia ocen (min. 5 meczów)', top((p) => p.season?.rating ?? 0, 10, (p) => (p.season?.apps ?? 0) >= 5), (p) => p.season.rating.toFixed(2))}
    <section class="stat-sec"><h3>Kontuzjowani</h3>${injured.length ? `<ol class="stat-list">${injured.map((p) => `<li>${crest(p.clubId, 18)}<span>${esc(p.name)}<small>${esc(p.injury?.name ?? '')}</small></span><b>${p.injuryDays} dni</b></li>`).join('')}</ol>` : '<p class="hint">Brak kontuzjowanych.</p>'}</section>
  </div>`;
}

function cupView(game) {
  const cup = game.season.cup;
  const rounds = PP_ROUNDS.filter((r) => cup.drawn.includes(r));
  const next = PP_ROUNDS.find((r) => !cup.drawn.includes(r));
  return `
    ${cup.champion ? `<p class="panel__lead">Zdobywca Pucharu Polski: ${crest(cup.champion, 28)} ${esc(name(cup.champion))}</p>` : ''}
    ${rounds.slice().reverse().map((r) => {
      const fx = game.fixtures.filter((f) => f.comp === 'pp' && f.round === r).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return `<section class="stat-sec ccard"><h3>${esc(PP_NAMES[r][0].toUpperCase() + PP_NAMES[r].slice(1))} <small class="muted">${fx.length} ${fx.length === 1 ? 'mecz' : fx.length < 5 ? 'mecze' : 'meczów'}</small></h3><ul class="ufxlist">${fx.map((f) => matchRow(f, game)).join('')}</ul></section>`;
    }).join('')}
    ${next ? `<p class="hint">Kolejna runda: ${esc(PP_NAMES[next])}. Losowanie po zakończeniu bieżącej rundy.</p>` : ''}`;
}

/** Grupa III ligi do pokazania: wybrana, a domyślnie grupa klubu gracza (albo I). */
function l3Comp(game, comp) {
  if (isL3Comp(comp) && L3_COMPS.includes(comp)) return comp;
  const me = CLUBS_PL.find((c) => c.id === game.clubId);
  return me?.tier === 4 && me.group ? `liga3-${me.group}` : L3_COMPS[0];
}

/** Przełącznik grup III ligi (I-IV); grupa klubu gracza oznaczona. */
function groupSwitch(game, comp) {
  const me = CLUBS_PL.find((c) => c.id === game.clubId);
  return `<div class="chips chips--sub" role="group" aria-label="Grupa III ligi">${L3_COMPS.map((c, i) => {
    const g = i + 1;
    const mine = me?.tier === 4 && me.group === g;
    return `<button class="chip chip--sm" data-act="ccomp" data-c="${c}" aria-pressed="${comp === c}">Grupa ${L3_GROUP_NAMES[g]}${mine ? ' <small>(twoja)</small>' : ''}</button>`;
  }).join('')}</div>`;
}

/** Baraże o 2 Ligę: półfinały wicemistrzów grup III ligi i dwumecze z 13. i 14. drużyną 2 Ligi. */
function playoffView(game) {
  const po = game.season?.playoffs?.liga3;
  const fx = game.fixtures.filter((f) => f.comp === 'playoff-liga3').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const intro = '<p class="hint">Zwycięzcy czterech grup awansują do 2 Ligi bezpośrednio. Wicemistrzowie grup grają półfinały (jeden mecz, pary z losowania), a zwycięzcy półfinałów dwumecz z 13. i 14. drużyną 2 Ligi. Zwycięzca dwumeczu gra w 2 Lidze w kolejnym sezonie. Rezerwy awansują tylko, gdy mogą grać w lidze niżej niż pierwsza drużyna.</p>';
  if (!po) return `${intro}<p class="hint">Baraże zostaną rozlosowane po ostatniej kolejce III ligi.</p>`;
  const sec = (title, list) => `<section class="stat-sec ccard"><h3>${esc(title)}</h3>${list.length ? `<ul class="ufxlist">${list.map((f) => matchRow(f, game)).join('')}</ul>` : '<p class="hint">Pary po półfinałach.</p>'}</section>`;
  const winners = `<section class="stat-sec ccard"><h3>Awans bezpośredni</h3><ul class="plain-list">${po.winners.map((id) => `<li><span>${crest(id)} ${esc(name(id))}</span></li>`).join('')}</ul></section>`;
  const ties = (po.ties ?? []).map((t) => {
    const w = game.season.playoffs.winners?.[`${t.id}-2`];
    return w ? `<li><span class="k">${esc(name(t.challenger))} - ${esc(name(t.keeper))}</span><span>${w === t.challenger ? `awans: ${esc(name(w))}` : `utrzymanie: ${esc(name(w))}`}</span></li>` : '';
  }).filter(Boolean).join('');
  return `${intro}<div class="cards">${winners}
    ${sec('Półfinały', fx.filter((f) => f.round === 'SF'))}
    ${sec('Finały (dwumecze z 13. i 14. drużyną 2 Ligi)', fx.filter((f) => f.round === 'F'))}
    ${ties ? `<section class="stat-sec ccard"><h3>Rozstrzygnięcia</h3><ul class="plain-list">${ties}</ul></section>` : ''}</div>`;
}

export function renderCompetitions(game, { comp = 'ekstraklasa', view = 'table', round = null, filter = 'pl', draw = null } = {}) {
  if (comp === 'liga3' || isL3Comp(comp)) comp = l3Comp(game, comp);
  const tabs = COMP_TABS.map(([k, v]) => `<button class="chip" data-act="ccomp" data-c="${k}" aria-pressed="${comp === k || (k === 'liga3' && isL3Comp(comp))}">${esc(v)}</button>`).join('');
  const wrap = (body) => `<div class="comp" data-comp="${esc(comp)}"><h2>Rozgrywki</h2><div class="chips">${tabs}</div>${body}</div>`;
  if (comp === 'HIST') return wrap(historyView(game));
  if (comp === 'NT') return wrap(renderNational(game, view));
  if (EUROPE_TABS.some(([k]) => k === comp)) return wrap(renderEurope(game, comp, { view, round, filter, draw }));
  const l3 = isL3Comp(comp);
  const allowed = ['table', 'fixtures', 'stats', ...(l3 ? ['playoff'] : [])];
  if (!allowed.includes(view)) view = 'table';
  const tabsList = [['table', 'Tabela'], ['fixtures', 'Terminarz'], ['stats', 'Statystyki'], ...(l3 ? [['playoff', 'Baraże']] : [])];
  const views = comp === 'pp' ? '' : `<div class="subtabs" role="tablist">${tabsList.map(([k, v]) => `<button role="tab" data-act="cview" data-v="${k}" aria-selected="${view === k}">${v}</button>`).join('')}</div>`;
  const body = comp === 'pp' ? cupView(game) : view === 'playoff' ? playoffView(game) : view === 'fixtures' ? fixturesView(game, comp, round) : view === 'stats' ? statsView(game, comp) : tableView(game, comp);
  return wrap(`${l3 ? groupSwitch(game, comp) : ''}${views}${body}`);
}

function historyView(game) {
  const A = [...(game.archive ?? [])].reverse();
  if (!A.length) return '<p class="hint">Tu pojawią się wyniki zakończonych sezonów: mistrzowie, zdobywcy pucharów, awanse i spadki oraz miejsca twoich drużyn.</p>';
  const uc = { LM: 'Liga Mistrzów', LE: 'Liga Europy', LK: 'Liga Konferencji' };
  return `<div class="cards">${A.map((a) => `<section class="stat-sec ccard"><h3>Sezon ${esc(a.season)}</h3><ul class="plain-list">
    <li><span class="k">Mistrz</span><span>${crest(a.champion)} ${esc(name(a.champion))}</span></li>
    <li><span class="k">Puchar Polski</span><span>${a.cup ? `${crest(a.cup)} ${esc(name(a.cup))}` : 'brak'}</span></li>
    ${Object.entries(a.uefa ?? {}).map(([k, v]) => `<li><span class="k">${uc[k]}</span><span>${esc(name(v))}</span></li>`).join('')}
    <li><span class="k">Awans</span><span>${esc([...(a.promoted?.[1] ?? [])].map(name).join(', '))} (do Ekstraklasy)</span></li>
    <li><span class="k">Spadek</span><span>${esc([...(a.relegated?.[2] ?? [])].map(name).join(', '))} (z Ekstraklasy)</span></li>
    ${a.promoted?.[3]?.length ? `<li><span class="k">Awans z III ligi</span><span>${esc(a.promoted[3].map(name).join(', '))}</span></li>` : ''}
    <li><span class="k">Twoja drużyna</span><span>${crest(a.user.club)} ${esc(name(a.user.club))}: ${a.user.pos}. miejsce (${esc(['', 'Ekstraklasa', '1 Liga', '2 Liga', `III liga${a.user.group ? `, grupa ${L3_GROUP_NAMES[a.user.group]}` : ''}`][a.user.tier] ?? '')})</span></li>
    ${a.superCupEU ? `<li><span class="k">Superpuchar Europy</span><span>${esc(name(a.superCupEU))}</span></li>` : ''}
    <li><span class="k">Polska w UEFA</span><span>${a.polandRank}. miejsce w rankingu krajów</span></li>
  </ul></section>`).join('')}</div>`;
}

export { LEAGUE_COMPS };
