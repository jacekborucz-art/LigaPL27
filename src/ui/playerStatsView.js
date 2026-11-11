// Statystyki zawodnika w profilu: tabela w podziale na rozgrywki (bieżący sezon albo cała kariera, przełącznik
// bez JS na radiach), sezon po sezonie i historia klubowa. Dane: src/season/history.js.
import { CLUBS_PL } from '../data/clubs_pl.js';
import { anyClub } from '../season/season.js';
import { STAT_GROUPS, CLUB_GROUPS, statObj, sumStats, spellsOf } from '../season/history.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate } from './dom.js';

const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const clubName = (id) => (id ? anyClub(id)?.name ?? 'klub spoza ligi' : 'bez klubu');
const crest = (id) => { const c = id ? anyClub(id) : null; return c ? crestHtml(c, { size: 20, clubsById }) : '<span class="fx-tbd" style="--s:20px" aria-hidden="true"></span>'; };
const num = (n) => String(n);
const avgTxt = (avg) => (avg == null ? '<span class="phst__na" aria-label="brak ocen">-</span>' : avg.toFixed(2).replace('.', ','));
const band = (avg) => (avg == null ? '' : avg >= 7.2 ? 'hi' : avg >= 6.6 ? 'ok' : avg >= 6.1 ? 'mid' : 'lo');
const monthYear = (iso) => fmtDate(iso).replace(/ \d+,/, '');

/** Wiersz tabeli statystyk: grupa rozgrywek albo suma. */
function statRow(label, arr, { foot = false, note = '' } = {}) {
  const s = statObj(arr);
  const zero = !s.apps;
  const cells = `<td>${num(s.apps)}</td><td class="w">${num(s.min)}</td><td>${num(s.g)}</td><td>${num(s.a)}</td>
    <td class="phst__avg" data-b="${band(s.avg)}">${avgTxt(s.avg)}</td><td class="w">${num(s.yc)}</td><td class="w">${num(s.rc)}</td>`;
  return `<tr class="${zero && !foot ? 'is-zero' : ''}"><th scope="row">${esc(label)}${note ? `<small>${esc(note)}</small>` : ''}</th>${cells}</tr>`;
}

function statTable(caption, groups, { extra = '' } = {}) {
  const rows = STAT_GROUPS.map(([k, l]) => statRow(l, groups[k], { note: k === 'P' ? 'z Superpucharem' : k === 'L' ? 'z barażami' : '' })).join('');
  const all = sumStats(Object.values(groups));
  const official = sumStats(CLUB_GROUPS.map((k) => groups[k]));
  return `<table class="phst__t">
    <caption class="sr">${esc(caption)}</caption>
    <thead><tr><th scope="col">Rozgrywki</th><th scope="col"><abbr title="Mecze">M</abbr></th><th scope="col" class="w"><abbr title="Minuty">Min.</abbr></th><th scope="col"><abbr title="Gole">G</abbr></th><th scope="col"><abbr title="Asysty">A</abbr></th><th scope="col"><abbr title="Średnia ocena">Ocena</abbr></th><th scope="col" class="w"><abbr title="Żółte kartki">Ż</abbr></th><th scope="col" class="w"><abbr title="Czerwone kartki">C</abbr></th></tr></thead>
    <tbody>${rows}${extra}</tbody>
    <tfoot>${statRow('Mecze klubowe o punkty', official, { foot: true })}${statRow('Razem', all, { foot: true })}</tfoot>
  </table>`;
}

/** Statystyki kariery: sezony z p.history (podział x) plus bieżący sezon. */
function careerGroups(p) {
  const out = {};
  for (const [k] of STAT_GROUPS) out[k] = sumStats([...(p.history ?? []).map((h) => h.x?.[k]), p.st?.[k]].filter(Boolean));
  return out;
}

/** Mecze bez podziału: stare wiersze historii (bez x) i mecze bieżącego sezonu sprzed zapisu podziału. */
function unsplit(p) {
  const old = (p.history ?? []).filter((h) => !h.x && h.apps);
  const cur = statObj(sumStats(CLUB_GROUPS.map((k) => p.st?.[k])));
  const curGap = Math.max(0, (p.season?.apps ?? 0) - cur.apps);
  const curG = Math.max(0, (p.season?.g ?? 0) - cur.g);
  const curA = Math.max(0, (p.season?.a ?? 0) - cur.a);
  return {
    season: curGap ? { apps: curGap, g: curG, a: curA } : null,
    career: old.length || curGap ? { apps: old.reduce((s, h) => s + h.apps, 0) + curGap, g: old.reduce((s, h) => s + (h.g ?? 0), 0) + curG, a: old.reduce((s, h) => s + (h.a ?? 0), 0) + curA } : null,
  };
}
const unsplitRow = (u) => (u ? `<tr class="phst__old"><th scope="row">Bez podziału<small>mecze sprzed zapisu statystyk w rozgrywkach</small></th><td>${u.apps}</td><td class="w"></td><td>${u.g}</td><td>${u.a}</td><td class="phst__avg"></td><td class="w"></td><td class="w"></td></tr>` : '');

function seasonRows(p, seasonId) {
  const cur = p.st && Object.values(p.st).some((a) => a?.[0] > 0) ? [{ s: seasonId, c: p.clubId, l: p.loan ? 1 : 0, x: p.st, live: true }] : [];
  const rows = [...cur, ...[...(p.history ?? [])].reverse()];
  if (!rows.length) return '<p class="hint">Brak rozegranych sezonów.</p>';
  return `<table class="phst__t phst__t--seasons">
    <caption class="sr">Sezon po sezonie</caption>
    <thead><tr><th scope="col">Sezon</th><th scope="col" class="w">Klub</th><th scope="col"><abbr title="Mecze we wszystkich rozgrywkach">M</abbr></th><th scope="col"><abbr title="Gole">G</abbr></th><th scope="col"><abbr title="Asysty">A</abbr></th><th scope="col"><abbr title="Średnia ocena">Ocena</abbr></th></tr></thead>
    <tbody>${rows.map((h) => {
      const s = h.x ? statObj(sumStats(Object.values(h.x))) : { apps: h.apps, g: h.g, a: h.a, avg: h.r || null };
      const sub = [h.live ? 'trwa' : '', h.l ? 'wypożyczenie' : ''].filter(Boolean).join(', ');
      return `<tr${h.live ? ' class="is-live"' : ''}><th scope="row">${esc(h.s)}${h.live ? '<small class="phst__sub">trwa</small>' : ''}<small class="phst__per-in phst__per-in--club">${esc(clubName(h.c))}${sub ? `, ${sub}` : ''}</small></th>
        <td class="phst__club w"><span class="phst__cl">${crest(h.c)}<span class="phst__cn">${esc(clubName(h.c))}</span>${h.l ? '<span class="loan-tag">wyp.</span>' : ''}</span></td>
        <td>${s.apps}</td><td>${s.g}</td><td>${s.a}</td><td class="phst__avg" data-b="${band(s.avg)}">${avgTxt(s.avg)}</td></tr>`;
    }).join('')}</tbody>
  </table>`;
}

function clubHistory(p) {
  const cl = spellsOf(p).filter((s) => s.c);
  if (!cl.length) return '<p class="hint">Zawodnik bez klubu.</p>';
  const period = (s) => `${s.f ? esc(monthYear(s.f)) : 'wcześniej'} - ${s.t ? (s.t === '?' ? '?' : esc(monthYear(s.t))) : 'obecnie'}`;
  return `<table class="phst__t phst__t--clubs">
    <caption class="sr">Historia klubowa</caption>
    <thead><tr><th scope="col">Klub</th><th scope="col" class="w">Okres</th><th scope="col"><abbr title="Mecze o punkty (liga, puchary krajowe, puchary europejskie) od startu gry">M</abbr></th><th scope="col"><abbr title="Gole w meczach o punkty">G</abbr></th></tr></thead>
    <tbody>${[...cl].reverse().map((s) => `<tr${s.t ? '' : ' class="is-live"'}>
      <td class="phst__club"><span class="phst__cl">${crest(s.c)}<span class="phst__cn">${esc(clubName(s.c))}</span>${s.l ? '<span class="loan-tag">wypożyczenie</span>' : ''}</span><small class="phst__per-in">${period(s)}</small></td>
      <td class="phst__period w">${period(s)}</td><td>${s.m}</td><td>${s.g}</td></tr>`).join('')}</tbody>
  </table>`;
}

/** Sekcja „Statystyki” profilu zawodnika. game: do etykiety sezonu. */
export function playerStatsHtml(p, game) {
  const seasonId = game?.season?.seasonId ?? '';
  const u = unsplit(p);
  const cur = {}; for (const [k] of STAT_GROUPS) cur[k] = p.st?.[k];
  const intl = p.intl?.caps ? `W reprezentacji łącznie: ${p.intl.caps} ${p.intl.caps === 1 ? 'występ' : 'występów'}, ${p.intl.goals} ${p.intl.goals === 1 ? 'gol' : 'goli'}${p.intlU21 ? `; zgrupowania U21: ${p.intlU21}` : ''}.` : '';
  const id = esc(p.id);
  return `<section class="phst" aria-labelledby="pst-h">
    <div class="phst__head">
      <h3 id="pst-h" tabindex="-1">Statystyki</h3>
      <div class="phst__seg" role="radiogroup" aria-label="Zakres statystyk">
        <input type="radio" class="sr phst__in phst__rs" name="pst-${id}" id="pst-s-${id}" checked><label for="pst-s-${id}">Sezon ${esc(seasonId)}</label>
        <input type="radio" class="sr phst__in phst__rc" name="pst-${id}" id="pst-c-${id}"><label for="pst-c-${id}">Kariera</label>
      </div>
    </div>
    <div class="phst__season">${statTable(`Statystyki w sezonie ${seasonId}`, cur, { extra: unsplitRow(u.season) })}</div>
    <div class="phst__career">${statTable('Statystyki w karierze', careerGroups(p), { extra: unsplitRow(u.career) })}</div>
    <p class="hint phst__note">Mecze liczone od startu gry. Ocena to średnia z meczów z oceną.${intl ? ` ${esc(intl)}` : ''}</p>
    <div class="phst__cols">
      <div><h3>Sezon po sezonie</h3>${seasonRows(p, seasonId)}</div>
      <div><h3>Historia klubowa</h3>${clubHistory(p)}</div>
    </div>
  </section>`;
}
