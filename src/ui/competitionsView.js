// Ekran „Rozgrywki”: tabele 3 lig (strefy, forma), terminarz po kolejkach, statystyki, Puchar Polski.
import { CLUBS_PL } from '../data/clubs_pl.js';
import { COMPETITIONS } from '../config/competitions.js';
import { standings, zonesFor } from '../season/standings.js';
import { anyClub, LEAGUE_COMPS } from '../season/season.js';
import { PP_ROUNDS, PP_NAMES } from '../season/cup.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate, weekday } from './dom.js';
import { renderEurope, EUROPE_TABS } from './europeView.js';
import { renderNational } from './nationalView.js';

export const COMP_TABS = [['ekstraklasa', 'Ekstraklasa'], ['liga1', '1 Liga'], ['liga2', '2 Liga'], ['pp', 'Puchar Polski'], ...EUROPE_TABS, ['NT', 'Reprezentacje']];
const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const crest = (id, size = 22) => { const c = anyClub(id); return c ? crestHtml(c, { size, clubsById }) : ''; };
const name = (id) => anyClub(id)?.name ?? 'rywal z losowania';
const shortDay = (iso) => weekday(iso).slice(0, 3);

function formDots(form) {
  return `<span class="form">${form.map((c) => `<b class="${c}">${c}</b>`).join('')}</span>`;
}

function tableView(game, comp) {
  const tier = COMPETITIONS[comp].tier;
  const ids = CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id);
  const rows = standings(game.fixtures.filter((f) => f.comp === comp), ids);
  const zones = zonesFor(tier);
  const zoneOf = (pos) => zones.find((z) => pos >= z.from && pos <= z.to);
  return `
    <div class="tbl" role="table" aria-label="Tabela ${esc(COMPETITIONS[comp].name)}">
      <div class="tbl__row tbl__head" role="row"><span>#</span><span>Klub</span><span>M</span><span class="w">W</span><span class="w">R</span><span class="w">P</span><span>Bramki</span><span>Pkt</span><span class="w2">Forma</span></div>
      ${rows.map((r) => {
        const z = zoneOf(r.pos);
        return `<div class="tbl__row ${r.id === game.clubId ? 'is-me' : ''}" role="row" data-zone="${z?.kind ?? ''}">
          <span class="tbl__pos">${r.pos}</span>
          <span class="tbl__club">${crest(r.id)}<span>${esc(name(r.id))}</span></span>
          <span>${r.played}</span><span class="w">${r.wins}</span><span class="w">${r.draws}</span><span class="w">${r.losses}</span>
          <span>${r.gf}:${r.ga}</span><b>${r.points}</b><span class="w2">${formDots(r.form)}</span>
        </div>`;
      }).join('')}
    </div>
    <ul class="legend">${zones.map((z) => `<li data-zone="${z.kind}">${esc(z.label)}</li>`).join('')}</ul>`;
}

function matchRow(f, game) {
  const res = f.result;
  const mid = res ? `<b class="fx__score">${res.score[0]}:${res.score[1]}</b>` : `<span class="fx__time">${esc(f.time ?? '')}</span>`;
  const extra = res?.shootout ? `<small>k. ${res.shootout[0]}:${res.shootout[1]}</small>` : res?.extraTime ? '<small>po dogr.</small>' : f.postponed && !res ? '<small>przełożony</small>' : '';
  const mine = f.home === game.clubId || f.away === game.clubId;
  return `<li class="fx ${mine ? 'is-me' : ''}">
    <span class="fx__date">${esc(shortDay(f.date))} ${esc(fmtDate(f.date).replace(/, \d{4}$/, ''))}</span>
    <span class="fx__team fx__team--h">${esc(name(f.home))}${crest(f.home)}</span>
    <span class="fx__mid">${mid}${extra}</span>
    <span class="fx__team">${crest(f.away)}${esc(name(f.away))}</span>
  </li>`;
}

function fixturesView(game, comp, round) {
  const fx = game.fixtures.filter((f) => f.comp === comp);
  const rounds = [...new Set(fx.map((f) => f.round))].sort((a, b) => a - b);
  const current = round ?? (fx.find((f) => !f.played)?.round ?? rounds[rounds.length - 1]);
  const list = fx.filter((f) => f.round === current).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return `
    <div class="roundnav">
      <button class="btn btn--quiet" data-act="cround" data-r="${Math.max(1, current - 1)}" ${current <= 1 ? 'disabled' : ''} aria-label="Poprzednia kolejka">‹</button>
      <span>${current}. kolejka</span>
      <button class="btn btn--quiet" data-act="cround" data-r="${Math.min(rounds.length, current + 1)}" ${current >= rounds.length ? 'disabled' : ''} aria-label="Następna kolejka">›</button>
    </div>
    <ul class="fxlist">${list.map((f) => matchRow(f, game)).join('')}</ul>`;
}

function statsView(game, comp) {
  const tier = comp === 'pp' ? null : COMPETITIONS[comp].tier;
  const clubIds = new Set(CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id));
  const players = Object.values(game.world.players).filter((p) => clubIds.has(p.clubId) && p.squad !== 'Y');
  const top = (f, n = 10, filter = () => true) => players.filter(filter).filter((p) => f(p) > 0).sort((a, b) => f(b) - f(a)).slice(0, n);
  const list = (title, arr, f, unit = '') => `<section class="stat-sec"><h3>${esc(title)}</h3>${arr.length ? `<ol class="stat-list">${arr.map((p) => `<li>${crest(p.clubId, 18)}<span>${esc(p.name)}</span><b>${f(p)}${unit}</b></li>`).join('')}</ol>` : '<p class="hint">Brak danych.</p>'}</section>`;
  const injured = players.filter((p) => p.injuryDays > 0).sort((a, b) => b.injuryDays - a.injuryDays).slice(0, 12);
  return `<div class="stats-grid">
    ${list('Strzelcy', top((p) => p.season?.g ?? 0, 15), (p) => p.season.g)}
    ${list('Asysty', top((p) => p.season?.a ?? 0), (p) => p.season.a)}
    ${list('Żółte kartki', top((p) => p.yc?.league ?? 0), (p) => p.yc.league)}
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
      return `<section class="stat-sec"><h3>${esc(PP_NAMES[r][0].toUpperCase() + PP_NAMES[r].slice(1))}</h3><ul class="fxlist">${fx.map((f) => matchRow(f, game)).join('')}</ul></section>`;
    }).join('')}
    ${next ? `<p class="hint">Kolejna runda: ${esc(PP_NAMES[next])}. Losowanie po zakończeniu bieżącej rundy.</p>` : ''}`;
}

export function renderCompetitions(game, { comp = 'ekstraklasa', view = 'table', round = null, filter = 'pl', draw = null } = {}) {
  const tabs = COMP_TABS.map(([k, v]) => `<button class="chip" data-act="ccomp" data-c="${k}" aria-pressed="${comp === k}">${esc(v)}</button>`).join('');
  if (comp === 'NT') return `<h2>Rozgrywki</h2><div class="chips">${tabs}</div>${renderNational(game, view)}`;
  if (EUROPE_TABS.some(([k]) => k === comp)) return `<h2>Rozgrywki</h2><div class="chips">${tabs}</div>${renderEurope(game, comp, { view, round, filter, draw })}`;
  if (!['table', 'fixtures', 'stats'].includes(view)) view = 'table';
  const views = comp === 'pp' ? '' : `<div class="subtabs" role="tablist">${[['table', 'Tabela'], ['fixtures', 'Terminarz'], ['stats', 'Statystyki']].map(([k, v]) => `<button role="tab" data-act="cview" data-v="${k}" aria-selected="${view === k}">${v}</button>`).join('')}</div>`;
  const body = comp === 'pp' ? cupView(game) : view === 'fixtures' ? fixturesView(game, comp, round) : view === 'stats' ? statsView(game, comp) : tableView(game, comp);
  return `<h2>Rozgrywki</h2><div class="chips">${tabs}</div>${views}${body}`;
}

export { LEAGUE_COMPS };
