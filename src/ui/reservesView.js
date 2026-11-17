// Kadra > Rezerwy (projekt ekranu z Nov 16, 2026, logika src/career/reserves.js, docs/rezerwy.md).
// Pas weekendu (pierwsza drużyna i rezerwy), mierniki limitów, lista „Do rezerw na mecz” (delegowanie), lista
// „Z rezerw do kadry meczowej” (powołanie), kadra rezerw, dialog prośby z odpowiedzią trenera rezerw od razu,
// wymuszenie przez dyrektora sportowego (szansa i koszt), awaria z przyciskiem „Uzupełnij awaryjnie”.
// Plakietki rezerw w wierszach Kadry i Składu (rzChipFn) i pasek nad ławką (reservesStrip). Akcje: data-act „rz-*”.
import {
  RSV, reservesOf, canDelegate, requestDelegation, canCallUp, requestCallUp, forceRequest, escalationChance, emergencyFor,
  emergencyFill, delegationsFor, cancelDelegation, canPromoteReserve, promoteReserve, coachMood, reasonsText, seniorStatus,
  eligibility, ruleAge, weekendKey,
} from '../career/reserves.js';
import { squadOf } from '../world/worldGen.js';
import { squadFor, anyClub } from '../season/season.js';
import { knownClub } from '../season/leagues.js';
import { standings } from '../season/standings.js';
import { compClubIds, compOfClub, classKeyOfTier, LEAGUE_CLASS_KEYS } from '../season/leagueComps.js';
import { addDays } from '../core/gameLoop.js';
import { GROUP, isAvailable } from '../career/squad.js';
import { coachOf } from '../career/coaches.js';
import { leagueLabel } from '../data/clubs_pl.js';
import { esc, fmtDate, fmtDay } from './dom.js';

/** Listy w panelu rezerw ułożone pozycjami: od bramkarza do napastnika, w obrębie pozycji lepsi wyżej. */
const POS_ORDER = ['BR', 'ŚO', 'BO', 'WB', 'DP', 'ŚP', 'OP', 'BP', 'SN', 'NAP'];
const posRank = (p) => { const i = POS_ORDER.indexOf(p.pos); return i < 0 ? POS_ORDER.length : i; };

export const isReservesAction = (act) => typeof act === 'string' && act.startsWith('rz-');

const WD = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'];
const DAYS_AHEAD = 10; // mecz rezerw w ciągu 10 dni (inaczej „Rezerwy nie grają do ...”)
const FILTERS = [['all', 'Wszyscy'], ['nomin', 'Bez minut'], ['injret', 'Po urazie'], ['u23', 'Do 22 lat'], ['o23', '23 i więcej']];
const GROUP_SHORT = { GK: 'BR', DEF: 'obrońcy', MID: 'pomocnika', ATT: 'napastnika' };
const SUSP_IN = { ekstraklasa: 'Ekstraklasie', liga1: '1 Lidze', liga2: '2 Lidze', liga3: 'III lidze' };
// Krótkie powody w menu kontekstowym (pełne zdania: reasonsText)
const SHORT = {
  injured: 'Kontuzja', suspended: 'Zawieszony', callUp: 'Zgrupowanie reprezentacji', hold: 'W trakcie transferu',
  weekend: 'Gra w ten weekend w innej drużynie', weekendPlanned: 'Ma już przydział w ten weekend', rest48: 'Zablokowany: 48 h',
  senior5: 'Próg 23+: 5 meczów pierwszej drużyny', senior3: 'Próg 23+: 3 mecze pierwszej drużyny', seniorEnd: 'Po końcu ligi pierwszej drużyny',
  limitDown: `Limit ${RSV.maxDown} w rezerwach`, limitUp: `Limit ${RSV.maxUp} z rezerw`, firstMin: `Za mało dostępnych (${RSV.firstMin.total})`,
  resMin: `Rezerwom zostałoby mniej niż ${RSV.resMin.total}`, deadline: 'Zgłoszenia zamknięte 24 h przed meczem', already: 'Już ma przydział',
  started: 'Mecz już się zaczął', played: 'Mecz już się odbył',
};

const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
const clubName = (id) => anyClub(id)?.name ?? knownClub(id)?.name ?? id ?? '';
const kickKey = (f) => `${f.date}T${f.time ?? '18:00'}`;
const wd = (date) => WD[new Date(`${date}T12:00:00Z`).getUTCDay()];
const when = (f) => `${wd(f.date)} ${fmtDay(f.date)}${f.time ? `, ${f.time}` : ''}`;
const involves = (f, id) => f.home === id || f.away === id;
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const shortReason = (codes) => (codes?.length ? SHORT[codes[0]] ?? reasonsText([codes[0]]) : null);

// ------------------------------------------------------------ Kontekst ekranu
/** Najbliższy mecz drużyny (bez sparingów) od dnia gry, opcjonalnie w ciągu maxDays dni. */
function nextFixture(game, team, maxDays = null) {
  const to = maxDays != null ? addDays(game.date, maxDays) : null;
  let best = null;
  for (const f of game.fixtures ?? []) {
    if (f.played || f.comp === 'friendly' || !involves(f, team) || f.date < game.date || (to && f.date > to)) continue;
    if (!best || kickKey(f) < kickKey(best)) best = f;
  }
  return best;
}

/**
 * Kontekst rezerw klubu gracza: { ok, R (reservesOf), club, ff (najbliższy mecz pierwszej drużyny), rf (mecz rezerw w
 * ciągu 10 dni), rfLater (następny mecz rezerw później) }. ok = false: klub bez grywalnych rezerw (R.reason).
 */
export function rzCtx(game) {
  const club = game?.clubId ?? null;
  const R = club && game?.world ? reservesOf(game, club) : { ok: false, reason: 'Brak klubu.' };
  if (!R.ok) return { ok: false, R, club };
  const ff = nextFixture(game, club);
  const rf = nextFixture(game, R.id, DAYS_AHEAD);
  return { ok: true, R, club, ff, rf, rfLater: rf ? null : nextFixture(game, R.id) };
}

/** Czy klub gracza ma grywalne rezerwy (podzakładka i wpisy menu). */
export const hasReserves = (game) => !!rzCtx(game).ok;

/** Mecz z perspektywy drużyny team: „Legia II - Resovia”, rywal, dom albo wyjazd. */
function matchOf(f, team) {
  const home = f.home === team;
  return { home, opp: clubName(home ? f.away : f.home), title: `${clubName(f.home)} - ${clubName(f.away)}` };
}

/** Dostępni w pierwszej drużynie na mecz ff (z powołanymi z rezerw, bez oddanych do rezerw w ten weekend). */
function firstAvail(game, ctx) {
  const comp = ctx.ff?.comp ?? compOfClub(anyClub(ctx.club)) ?? 'ekstraklasa';
  const sq = squadFor(game, ctx.club, comp, ctx.ff ?? null).filter((p) => isAvailable(p));
  const c = { total: sq.length, GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of sq) c[GROUP[p.pos] ?? 'MID']++;
  return c;
}

const refusedOf = (game, pid, fid) => !!game.reserves?.refused?.[`${pid}:${fid}`];

// ------------------------------------------------------------ Plakietki
const chip = (k, text, title = '') => `<span class="rz-chip" data-k="${k}"${title ? ` title="${esc(title)}"` : ''}><span aria-hidden="true">${{ down: '↓', up: '↑', lock: '◷', week: '◷', age: '!', susp: '▪', no: '×', wait: '…' }[k] ?? ''}</span>${esc(text)}</span>`;
const PRIO = ['lock', 'week', 'age', 'down', 'up', 'wait', 'susp', 'no'];

/**
 * Funkcja plakietek rezerw dla wierszy zawodników (Kadra, Skład i taktyka, profil): (p, { short }) => HTML.
 * Klub bez rezerw: null. Najwyżej dwie plakietki, reszta w title ostatniej.
 */
export function rzChipFn(game) {
  const ctx = rzCtx(game);
  if (!ctx.ok) return null;
  const list = game.reserves?.list ?? [];
  const ownKey = classKeyOfTier(anyClub(ctx.club)?.tier);
  return (p, { short = false } = {}) => {
    if (!p) return '';
    const out = [];
    try {
      const d = list.find((x) => x.pid === p.id && x.to === ctx.R.id);
      const u = list.find((x) => x.pid === p.id && x.to === ctx.club);
      if (d) out.push(['down', short ? `rez. ${wd(d.date)}` : `gra w rezerwach ${wd(d.date)}`, `${ctx.R.name}, ${fmtDate(d.date)}${d.forced ? ', wymuszone przez dyrektora sportowego' : ''}`]);
      if (u) out.push(['up', `z rezerw na ${wd(u.date)}`, `${fmtDate(u.date)}${u.emergency ? ', awaryjnie' : ''}${u.forced ? ', wymuszone' : ''}`]);
      if (p.clubId === ctx.club && ctx.ff) {
        const codes = eligibility(game, p, ctx.club, ctx.ff, 'runtime');
        if (codes.includes('rest48') && p.rsv?.last) {
          const until = new Date(Date.parse(`${p.rsv.last.end}:00Z`) + RSV.restH * 3600000).toISOString();
          out.push(['lock', 'zablokowany: 48 h', `Do ${fmtDate(until)} ${until.slice(11, 16)}: ${reasonsText(['rest48'])}`]);
        }
        if (codes.includes('weekend')) out.push(['week', short ? 'grał w rezerwach' : 'w ten weekend grał w rezerwach', reasonsText(['weekend'])]);
        const s = seniorStatus(game, p.id);
        const warnFrom = (game.date.slice(5, 7) >= '07') ? 3 : 2;
        if (s?.senior && s.family && s.apps >= warnFrom) out.push(['age', s.blocked ? `${s.text}, bez rezerw` : s.text, 'Próg PZPN dla 23+ w rezerwach (tylko ostrzeżenie, w pierwszej drużynie gra normalnie).']);
        if (!d && ctx.rf && refusedOf(game, p.id, ctx.rf.id)) out.push(['no', 'odmowa trenera', 'Trener rezerw odmówił prośby na ten mecz.']);
      }
      if (ownKey) {
        for (const [k, v] of Object.entries(p.susp ?? {})) {
          if (v > 0 && k !== ownKey && LEAGUE_CLASS_KEYS.includes(k) && p.clubId === ctx.club) out.push(['susp', `pauza w ${SUSP_IN[k]}`, `Pauza ${v} ${plural(v, 'mecz', 'mecze', 'meczów')} tylko w ${SUSP_IN[k]}. W meczach twojej drużyny może grać.`]);
        }
      }
    } catch { return ''; }
    if (!out.length) return '';
    out.sort((a, b) => PRIO.indexOf(a[0]) - PRIO.indexOf(b[0]));
    const shown = out.slice(0, 2);
    const rest = out.slice(2).map((x) => x[1]).join(', ');
    return `<span class="rz-chips">${shown.map(([k, t, ti], i) => chip(k, t, i === shown.length - 1 && rest ? `${ti}. Także: ${rest}` : ti)).join('')}</span>`;
  };
}

// ------------------------------------------------------------ Pasek nad ławką (Skład i taktyka)
/** Wąski pasek nad ławką: delegowani i powołani w ten weekend, awaria z przyciskiem. Klub bez rezerw: ''. */
export function reservesStrip(game) {
  const ctx = rzCtx(game);
  if (!ctx.ok) return '';
  try {
    const list = game.reserves?.list ?? [];
    const down = ctx.rf ? list.filter((d) => d.fixtureId === ctx.rf.id && d.from === ctx.club).length : 0;
    const up = ctx.ff ? list.filter((d) => d.fixtureId === ctx.ff.id && d.to === ctx.club && d.kind === 'up' && !d.emergency).length : 0;
    const em = ctx.ff ? emergencyFor(game, ctx.club, ctx.ff.id) : null;
    const text = `${ctx.R.name}: ${down} do rezerw${ctx.rf ? ` na mecz ${wd(ctx.rf.date)} ${fmtDay(ctx.rf.date)}` : ''}, ${up} z ${RSV.maxUp} z rezerw${ctx.ff ? ` na mecz ${wd(ctx.ff.date)} ${fmtDay(ctx.ff.date)}` : ''}.`;
    return `<div class="rz-strip${em?.emergency ? ' rz-strip--alarm' : ''}">
      <p>${esc(text)}${em?.emergency ? ` <b>${esc(alarmText(em))}</b>` : ''}</p>
      <div class="rz-strip__btns">${em?.emergency ? '<button class="btn btn--primary btn--sm" data-act="rz-emergency">Uzupełnij awaryjnie</button>' : ''}<button class="btn btn--quiet btn--sm" data-act="tsub" data-s="reserves">Zarządzaj</button></div>
    </div>`;
  } catch { return ''; }
}

function alarmText(em) {
  const a = em.available ?? {};
  const parts = [em.gk ? `zdrowych bramkarzy ${a.GK ?? 0} z ${RSV.emergencyGk}` : null, em.squad ? `dostępnych ${a.total ?? 0} z ${RSV.emergencyTotal}` : null].filter(Boolean);
  return `Nagły brak: ${parts.join(', ')}.`;
}

// ------------------------------------------------------------ Pas weekendu
function weekStrip(game, ctx, dl) {
  const anchor = [ctx.ff, ctx.rf].filter(Boolean).sort((a, b) => kickKey(a).localeCompare(kickKey(b)))[0];
  const start = anchor?.date ?? game.date;
  const day = new Date(`${start}T12:00:00Z`).getUTCDay();
  const fri = addDays(start, { 5: 0, 6: -1, 0: -2, 1: -3 }[day] ?? (5 - day));
  const days = new Set([0, 1, 2, 3].map((i) => addDays(fri, i)));
  // Mecz poza tym weekendem (w tygodniu, np. środa, albo w następny weekend): dodatkowa kolumna
  for (const f of [ctx.ff, ctx.rf]) if (f && f.date >= game.date) days.add(f.date);
  const cols = [...days].sort();
  const rfx = ctx.rf ?? (ctx.rfLater && cols.includes(ctx.rfLater.date) ? ctx.rfLater : null); // mecz rezerw w tym weekendzie, choć po 10 dniach
  const lanes = [[ctx.club, 'first', clubName(ctx.club), ctx.ff], [ctx.R.id, 'reserve', ctx.R.name, rfx]];
  const dots = (f, team) => {
    const ds = dl.filter((d) => d.fixtureId === f.id && d.to === team);
    const ini = (n) => n.split(/\s+/).map((x) => x[0]).join('').slice(0, 2);
    return ds.length ? `<span class="rz-week__dots">${ds.slice(0, 5).map((d) => `<span class="rz-week__dot" title="${esc(d.name)}">${esc(ini(d.name))}</span>`).join('')}${ds.length > 5 ? `<span class="rz-week__dot">+${ds.length - 5}</span>` : ''}</span>` : '';
  };
  const block = (f, team, kind) => {
    const m = matchOf(f, team);
    return `<div class="rz-week__match" data-team="${kind}"><b>${esc(f.time ?? '')}</b> <span>${esc(m.opp)}</span> <small>${m.home ? 'dom' : 'wyjazd'}</small>${dots(f, team)}</div>`;
  };
  const head = cols.map((d) => `<th scope="col">${esc(wd(d))} <small>${esc(fmtDay(d))}</small></th>`).join('');
  const rows = lanes.map(([team, kind, name, f]) => `<tr><th scope="row">${esc(name)}</th>${cols.map((d) => `<td>${f && f.date === d ? block(f, team, kind) : ''}</td>`).join('')}</tr>`).join('');
  const mini = cols.map((d) => {
    const on = lanes.filter(([, , , f]) => f && f.date === d).map(([, kind]) => `<i data-team="${kind}"></i>`).join('');
    return `<li><span>${esc(wd(d))}</span>${on || '<i></i>'}</li>`;
  }).join('');
  const list = lanes.filter(([, , , f]) => f).map(([team, kind, name, f]) => {
    const m = matchOf(f, team);
    return `<li class="rz-week__match" data-team="${kind}"><b>${esc(name)}</b> <span>${esc(m.opp)}, ${m.home ? 'dom' : 'wyjazd'}</span> <small>${esc(when(f))}</small>${dots(f, team)}</li>`;
  }).join('');
  const deadline = ctx.rf ? (() => {
    const t = new Date(Date.parse(`${kickKey(ctx.rf)}:00Z`) - RSV.deadlineH * 3600000).toISOString();
    return `Zgłoszenia na mecz rezerw ${wd(ctx.rf.date)} ${fmtDay(ctx.rf.date)} do ${wd(t.slice(0, 10))} ${fmtDay(t.slice(0, 10))}, ${t.slice(11, 16)} (24 h przed meczem).`;
  })() : `Rezerwy nie grają do ${ctx.rfLater ? fmtDay(ctx.rfLater.date) : 'końca rundy'}.`;
  const midweek = cols.some((d) => ['wt', 'śr', 'czw'].includes(wd(d))) ? ' W tygodniu zawodnik gra w jednej drużynie, a 48 h liczy się od końca meczu.' : '';
  return `<section class="rz-week" aria-labelledby="rz-week-h">
    <h3 id="rz-week-h" class="rz-sr">Mecze w najbliższy weekend</h3>
    <table class="rz-week__table"><thead><tr><td></td>${head}</tr></thead><tbody>${rows}</tbody></table>
    <ul class="rz-week__mini" aria-hidden="true">${mini}</ul>
    <ul class="rz-week__list">${list || '<li class="rz-empty">Brak meczów w najbliższych dniach.</li>'}</ul>
    <p class="rz-week__note">${esc(deadline + midweek)}</p>
  </section>`;
}

// ------------------------------------------------------------ Mierniki
function meters(ctx, dl, avail, game) {
  const down = ctx.rf ? dl.filter((d) => d.fixtureId === ctx.rf.id && d.kind === 'down') : [];
  const seniors = down.filter((d) => ruleAge(game.world.players[d.pid]) >= RSV.seniorAge).length;
  const up = ctx.ff ? dl.filter((d) => d.fixtureId === ctx.ff.id && d.to === ctx.club && !d.emergency) : [];
  const emUp = ctx.ff ? dl.filter((d) => d.fixtureId === ctx.ff.id && d.to === ctx.club && d.emergency).length : 0;
  const segs = (n, max) => `<span class="rz-segs" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i class="rz-seg" data-on="${i < n ? 1 : 0}"></i>`).join('')}</span>`;
  const meter = (title, n, max, sub, label) => `<div class="rz-meter${n >= max ? ' is-full' : ''}" role="img" aria-label="${esc(label)}">
    <span class="rz-meter__t">${esc(title)}</span>${segs(n, max)}<b class="rz-meter__n">${n} z ${max}${n >= max ? ' <small>komplet</small>' : ''}</b>${sub ? `<small class="rz-meter__sub">${esc(sub)}</small>` : ''}</div>`;
  const min = RSV.firstMin;
  const pct = Math.min(100, Math.round((avail.total / 25) * 100));
  return `<section class="rz-meters" aria-label="Limity">
    ${meter(`W meczu rezerw z pierwszej drużyny${ctx.rf ? ` (${wd(ctx.rf.date)} ${fmtDay(ctx.rf.date)})` : ''}`, down.length, RSV.maxDown, `23 i więcej: ${seniors} (w jedenastce najwyżej ${RSV.maxSeniorXI})`, `Zajęte ${down.length} z ${RSV.maxDown} miejsc w meczu rezerw`)}
    ${meter(`Z rezerw w twojej kadrze meczowej${ctx.ff ? ` (${wd(ctx.ff.date)} ${fmtDay(ctx.ff.date)})` : ''}`, up.length, RSV.maxUp, emUp ? `Awaryjnie dodatkowo: ${emUp}` : '', `Zajęte ${up.length} z ${RSV.maxUp} miejsc w kadrze meczowej`)}
    <div class="rz-meter" role="img" aria-label="${esc(`Dostępnych ${avail.total}, minimum ${min.total}. Bramkarzy ${avail.GK}, minimum ${min.GK}.`)}">
      <span class="rz-meter__t">Dostępnych w pierwszej drużynie${ctx.ff ? esc(` na mecz ${wd(ctx.ff.date)} ${fmtDay(ctx.ff.date)}`) : ''}</span>
      <span class="rz-gauge" aria-hidden="true"><i class="rz-gauge__bar" data-low="${avail.total < min.total ? 1 : 0}" style="width:${pct}%"></i><i class="rz-gauge__min" style="left:${Math.round((min.total / 25) * 100)}%"></i></span>
      <b class="rz-meter__n">${avail.total}, minimum ${min.total}</b><small class="rz-meter__sub">Bramkarzy ${avail.GK}, minimum ${min.GK}.</small>
    </div>
  </section>`;
}

// ------------------------------------------------------------ Listy
const posTag = (p) => `<span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span>`;
function filterOk(p, f, game) {
  if (f === 'nomin') return !(p.season?.min > 0);
  if (f === 'injret') return (p.training?.rtp ?? 0) > 0 || p.training?.prog === 'powrot';
  if (f === 'u23') return ruleAge(p) < RSV.seniorAge;
  if (f === 'o23') return ruleAge(p) >= RSV.seniorAge;
  return true;
}
/** Warto wysłać do rezerw: bez minut, po urazie, niska ostrość (wyższy wynik wyżej na liście). */
const sendScore = (p) => (p.season?.min > 0 ? 0 : 2) + ((p.training?.rtp ?? 0) > 0 ? 2 : 0) + ((p.sharp ?? 70) < 60 ? 1 : 0);

/**
 * Powody wspólne dla wszystkich niedostępnych wierszy (np. limit 5, minimum 18): pełne zdanie raz nad listą, w wierszu
 * tylko krótki powód; pozostałe powody wiersza pełnym zdaniem. Zwraca { note, why(chk) }.
 */
function sharedReasons(rows) {
  const off = rows.filter((r) => !r.chk.ok);
  const common = off.length >= 3 ? [...new Set(off[0].chk.reasons)].filter((c) => off.every((r) => r.chk.reasons.includes(c))) : [];
  return {
    note: common.length ? `<p class="rz-warn">${esc(reasonsText(common))}</p>` : '',
    why: (chk) => {
      const own = chk.reasons.filter((c) => !common.includes(c));
      return own.length ? reasonsText(own) : shortReason(common);
    },
  };
}

function downList(game, ctx, dl, ui, chips) {
  const head = (n) => `<div class="rz-sec__h"><h3 id="rz-down-h">Do rezerw na mecz</h3><span class="muted">${n} z ${RSV.maxDown} ${plural(RSV.maxDown, 'miejsca', 'miejsc', 'miejsc')}</span></div>`;
  if (!ctx.rf) return `<section class="rz-sec" aria-labelledby="rz-down-h">${head(0)}<p class="rz-empty">Rezerwy nie grają do ${esc(ctx.rfLater ? fmtDay(ctx.rfLater.date) : 'końca rundy')}. Zgłoszenia będą możliwe przed ich meczem.</p></section>`;
  const m = matchOf(ctx.rf, ctx.R.id);
  const picked = dl.filter((d) => d.fixtureId === ctx.rf.id && d.kind === 'down');
  const pickedIds = new Set(picked.map((d) => d.pid));
  const f = FILTERS.some(([k]) => k === ui.rzFilter) ? ui.rzFilter : 'all';
  const rows = squadOf(game.world, ctx.club).filter((p) => p && !pickedIds.has(p.id)).map((p) => ({ p, chk: canDelegate(game, p.id, ctx.rf.id) }))
    .filter(({ p }) => filterOk(p, f, game))
    .sort((a, b) => posRank(a.p) - posRank(b.p) || Number(b.chk.ok) - Number(a.chk.ok) || sendScore(b.p) - sendScore(a.p) || a.p.ovr - b.p.ovr);
  const full = picked.length >= RSV.maxDown;
  const row = (p, act) => `<li class="rz-row${act.off ? ' rz-row--off' : ''}${act.picked ? ' rz-row--picked' : ''}" data-pid="${esc(p.id)}">
      ${posTag(p)}<span class="rz-row__who"><b>${esc(p.name)}</b> <small>${p.age} l., ocena ${Math.round(p.ovr)}</small>${chips ? chips(p, { short: true }) : ''}${act.why ? `<small class="rz-row__why">${esc(act.why)}</small>` : ''}</span>
      <span class="rz-row__act">${act.btn}</span></li>`;
  const pickedHtml = picked.map((d) => {
    const p = game.world.players[d.pid];
    return p ? row(p, { picked: true, btn: `<button class="btn btn--quiet btn--sm" data-act="rz-cancel" data-id="${esc(d.id)}" data-pid="${esc(p.id)}" aria-label="${esc(`Cofnij delegację: ${p.name}`)}">Cofnij</button>` }) : '';
  }).join('');
  const shared = sharedReasons(rows);
  const candHtml = rows.map(({ p, chk }) => {
    const why = chk.ok ? (chk.warnings.includes('risk48') ? reasonsText(['risk48']) : '') : shared.why(chk);
    const btn = `<button class="btn btn--quiet btn--sm" data-act="rz-ask" data-id="${esc(p.id)}" data-dir="down" aria-label="${esc(`Deleguj do rezerw: ${p.name}`)}"${chk.ok ? '' : ' disabled'}>Deleguj</button>`;
    return row(p, { off: !chk.ok, why, btn });
  }).join('');
  const tip = ui.rzTipOff ? '' : `<p class="rz-tip"><span>Zawodnik zostaje w twojej kadrze, ma twoją umowę i pensję. Zagra jeden mecz w rezerwach.</span><button class="btn btn--quiet btn--sm" data-act="rz-tip-close" aria-label="Zamknij podpowiedź">Rozumiem</button></p>`;
  return `<section class="rz-sec" aria-labelledby="rz-down-h">${head(picked.length)}
    <p class="muted rz-sec__sub">Mecz: ${esc(m.title)}, ${esc(when(ctx.rf))}</p>${tip}
    ${picked.length ? `<h4 class="rz-sec__g">Zgłoszeni na mecz z ${esc(m.opp)}</h4><ul class="rz-list">${pickedHtml}</ul>` : ''}
    <div class="chips chips--sm rz-filters" role="group" aria-label="Filtr kandydatów">${FILTERS.map(([k, v]) => `<button class="chip" data-act="rz-filter" data-v="${k}" aria-pressed="${f === k}">${esc(v)}</button>`).join('')}</div>
    ${full ? `<p class="rz-warn">Limit ${RSV.maxDown} zawodników pierwszej drużyny w meczu rezerw. Cofnij jedno zgłoszenie, żeby dodać innego.</p>` : shared.note}
    <ul class="rz-list">${candHtml || '<li class="rz-empty">Brak zawodników w tym filtrze.</li>'}</ul>
  </section>`;
}

function upList(game, ctx, dl, avail, chips) {
  const head = (n) => `<div class="rz-sec__h"><h3 id="rz-up-h">Z rezerw do kadry meczowej</h3><span class="muted">${n} z ${RSV.maxUp} ${plural(RSV.maxUp, 'miejsca', 'miejsc', 'miejsc')}</span></div>`;
  if (!ctx.ff) return `<section class="rz-sec" aria-labelledby="rz-up-h">${head(0)}<p class="rz-empty">Pierwsza drużyna nie ma zaplanowanego meczu.</p></section>`;
  const m = matchOf(ctx.ff, ctx.club);
  const picked = dl.filter((d) => d.fixtureId === ctx.ff.id && d.to === ctx.club);
  const pickedIds = new Set(picked.map((d) => d.pid));
  const short = ['GK', 'DEF', 'MID', 'ATT'].filter((g) => avail[g] < RSV.firstMin[g]);
  const rows = squadOf(game.world, ctx.R.id).filter((p) => p && !pickedIds.has(p.id)).map((p) => ({ p, chk: canCallUp(game, p.id, ctx.ff.id), need: short.includes(GROUP[p.pos]) }))
    .sort((a, b) => posRank(a.p) - posRank(b.p) || Number(b.chk.ok) - Number(a.chk.ok) || b.p.ovr - a.p.ovr);
  const form = (p) => { const s = p.season ?? {}; return s.apps ? `${s.g ?? 0} ${plural(s.g ?? 0, 'gol', 'gole', 'goli')} w ${s.apps} ${plural(s.apps, 'meczu', 'meczach', 'meczach')}` : 'bez meczów w sezonie'; };
  const row = (p, act) => `<li class="rz-row${act.off ? ' rz-row--off' : ''}${act.picked ? ' rz-row--picked' : ''}" data-pid="${esc(p.id)}">
      ${posTag(p)}<span class="rz-row__who"><b>${esc(p.name)}</b> <small>${p.age} l., ocena ${Math.round(p.ovr)}, ${esc(form(p))}</small>${act.chips ?? ''}${act.why ? `<small class="rz-row__why">${esc(act.why)}</small>` : ''}</span>
      <span class="rz-row__act">${act.btn}</span></li>`;
  const pickedHtml = picked.map((d) => {
    const p = game.world.players[d.pid];
    return p ? row(p, { picked: true, chips: chips ? chips(p) : '', btn: `<button class="btn btn--quiet btn--sm" data-act="rz-cancel" data-id="${esc(d.id)}" data-pid="${esc(p.id)}" aria-label="${esc(`Cofnij powołanie: ${p.name}`)}">Cofnij</button>` }) : '';
  }).join('');
  const shared = sharedReasons(rows);
  const candHtml = rows.map(({ p, chk, need }) => {
    const why = chk.ok ? '' : shared.why(chk);
    const needChip = need ? `<span class="rz-chips">${chip('age', `brakuje ci ${GROUP_SHORT[GROUP[p.pos]]}`)}</span>` : '';
    const btn = `<button class="btn btn--quiet btn--sm" data-act="rz-ask" data-id="${esc(p.id)}" data-dir="up" aria-label="${esc(`Powołaj z rezerw: ${p.name}`)}"${chk.ok ? '' : ' disabled'}>${chk.emergency ? 'Awaryjnie' : 'Powołaj'}</button>`;
    return row(p, { off: !chk.ok, why, btn, chips: needChip });
  }).join('');
  const normal = picked.filter((d) => !d.emergency).length;
  return `<section class="rz-sec" aria-labelledby="rz-up-h">${head(normal)}
    <p class="muted rz-sec__sub">Mecz: ${esc(m.title)}, ${esc(when(ctx.ff))}</p>
    ${picked.length ? `<ul class="rz-list">${pickedHtml}</ul>` : ''}
    ${normal >= RSV.maxUp ? `<p class="rz-warn">Limit ${RSV.maxUp} zawodników rezerw w kadrze meczowej. Cofnij jedno powołanie, żeby dodać innego.</p>` : shared.note}
    <ul class="rz-list">${candHtml || '<li class="rz-empty">Brak zawodników w rezerwach.</li>'}</ul>
  </section>`;
}

function squadOverview(game, ctx, dl, ui) {
  const players = squadOf(game.world, ctx.R.id).filter(Boolean).sort((a, b) => (['GK', 'DEF', 'MID', 'ATT'].indexOf(GROUP[a.pos]) - ['GK', 'DEF', 'MID', 'ATT'].indexOf(GROUP[b.pos])) || b.ovr - a.ovr);
  const key = classKeyOfTier(ctx.R.tier);
  const status = (p) => {
    if (p.injuryDays > 0) return ['bad', `kontuzja, ${p.injuryDays} ${plural(p.injuryDays, 'dzień', 'dni', 'dni')}`];
    if ((p.susp?.[key] ?? 0) > 0) return ['bad', `pauza w ${SUSP_IN[key] ?? 'lidze'}`];
    const d = dl.find((x) => x.pid === p.id && x.to === ctx.club);
    if (d) return ['up', `w pierwszej drużynie ${wd(d.date)}`];
    if (p.callUp) return ['bad', 'reprezentacja'];
    return ['ok', 'zdrowy'];
  };
  const own = players.filter((p) => !(p.injuryDays > 0) && !((p.susp?.[key] ?? 0) > 0) && !p.callUp && !dl.some((x) => x.pid === p.id && x.to === ctx.club));
  const gk = own.filter((p) => p.pos === 'BR').length;
  const rows = players.map((p) => {
    const [k, t] = status(p);
    return `<li class="rz-squad__row" data-pid="${esc(p.id)}">${posTag(p)}<button class="rz-squad__nm" data-act="rz-open" data-id="${esc(p.id)}">${esc(p.name)}</button><span>${p.age}</span><b>${Math.round(p.ovr)}</b><span class="muted">${p.season?.min ?? 0} min</span><span class="rz-squad__st" data-k="${k}">${esc(t)}</span></li>`;
  }).join('');
  // Domyślnie rozwinięta na szerokim ekranie (prawa kolumna), zwinięta na telefonie
  const wide = typeof matchMedia === 'function' && matchMedia('(min-width: 1100px)').matches;
  const open = ui.rzSquadOpen ?? wide;
  return `<details class="rz-squad"${open ? ' open' : ''}>
    <summary data-act="rz-view-squad" data-open="${open ? 1 : 0}">Kadra rezerw (${players.length})</summary>
    <p class="rz-squad__min">Własnych dostępnych: ${own.length}, minimum ${RSV.resMin.total}. Bramkarzy: ${gk}, minimum ${RSV.resMin.GK}.</p>
    <ul class="rz-squad__list">${rows || '<li class="rz-empty">Brak zawodników.</li>'}</ul>
  </details>`;
}

// ------------------------------------------------------------ Dialog prośby
function cooldownOf(game, club) {
  const last = game.reserves?.force?.[club] ?? null;
  if (!last) return { last: null, next: null };
  const next = addDays(last, RSV.forceEveryDays);
  return { last, next: dayDiff(last, game.date) < RSV.forceEveryDays ? next : null };
}

function askDialog(game, ctx, ask, avail) {
  const p = game.world.players[ask.id];
  const f = (game.fixtures ?? []).find((x) => x.id === ask.fid);
  if (!p || !f) return '';
  const down = ask.dir === 'down';
  const team = down ? ctx.R.id : ctx.club;
  const m = matchOf(f, team);
  let coach = 'Trener rezerw';
  try { const c = coachOf(game, ctx.R.id, anyClub(ctx.R.id)); if (c?.name) coach = c.name; } catch { /* zostaje „Trener rezerw” */ }
  const chk = down ? canDelegate(game, p.id, f.id) : canCallUp(game, p.id, f.id);
  const facts = [];
  if (down) {
    facts.push('Zostaje w twojej kadrze, umowie i limicie kadry.');
    // Mecz pierwszej drużyny w weekendzie meczu rezerw: dostępni po tej delegacji (z już oddanymi w ten weekend)
    const wk = weekendKey(f.date);
    const pf = wk ? (game.fixtures ?? []).filter((x) => !x.played && x.comp !== 'friendly' && involves(x, ctx.club) && weekendKey(x.date) === wk).sort((a, b) => kickKey(a).localeCompare(kickKey(b)))[0] : null;
    if (pf && chk.warnings.includes('missesFirstTeam')) {
      const left = firstAvail(game, { ...ctx, ff: pf }).total - 1;
      facts.push(`Na mecz pierwszej drużyny (${when(pf)}) zostanie ci ${left} dostępnych (minimum ${RSV.firstMin.total}).${left === RSV.firstMin.total ? ' To minimum: kolejnej delegacji na ten weekend już nie zgłosisz.' : ''}`);
    }
  } else {
    facts.push(chk.emergency ? 'Awaria: trener rezerw nie może odmówić. Powołanie poza limitem 3 miejsc.' : `Zajmie jedno z ${RSV.maxUp} miejsc w kadrze meczowej. W kadrze klubu go nie będzie.`);
  }
  for (const w of chk.warnings ?? []) if (w !== 'emergency') facts.push(reasonsText([w]));
  const res = ask.res;
  const mood = coachMood(game, ctx.R.id);
  const cd = cooldownOf(game, ctx.club);
  const chance = Math.round(escalationChance(game, ctx.club) * 100);
  let body = '';
  if (ask.step === 'ask') {
    body = `<ul class="rz-ask__facts">${facts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${mood < RSV.moodStart ? `<p class="rz-warn">Trener rezerw jest w złym nastroju (${Math.round(mood)} na 100): częściej odmawia.</p>` : ''}
      <div class="rz-ask__btns"><button class="btn btn--primary" data-act="rz-ask-send">Wyślij prośbę</button><button class="btn btn--quiet" data-act="rz-ask-no">Anuluj</button></div>`;
  } else if (ask.step === 'force') {
    body = `<div class="rz-force">
      <p>Sprawę rozstrzygnie dyrektor sportowy. Szansa na jego zgodę: ${chance} %.</p>
      <p>Wymuszenie można zrobić raz na ${RSV.forceEveryDays} dni. Ostatnie: ${cd.last ? esc(fmtDate(cd.last)) : 'nigdy'}.</p>
      <p class="rz-force__cost">Koszt: zaufanie zarządu spadnie o ${RSV.escCostOk}, gdy dyrektor się zgodzi, albo o ${RSV.escCostNo}, gdy odmówi. Po zgodzie trener rezerw przez ${RSV.forcePenaltyDays} dni częściej odmawia (o ${Math.round(RSV.forcePenalty * 100)} punktów procentowych).</p>
    </div>
    <div class="rz-ask__btns"><button class="btn rz-btn-bad" data-act="rz-force-go">Wymuś i wyślij</button><button class="btn btn--quiet" data-act="rz-force-no">Wróć</button></div>`;
  } else if (res) {
    let k = 'yes'; let text; let btns;
    if (res.status === 'accepted') {
      text = res.forced ? `Dyrektor sportowy przyznał ci rację (szansa była ${Math.round((res.chance ?? 0) * 100)} %). Wymuszone. Zaufanie zarządu spadło o ${RSV.escCostOk}.` : res.emergency ? `${coach} zgodził się (awaria, bez prawa odmowy).` : `${coach} zgodził się.`;
      btns = '<button class="btn btn--primary" data-act="rz-ask-ok">Gotowe</button>';
    } else if (res.escalation) {
      k = 'no'; text = `Dyrektor sportowy podtrzymał decyzję trenera rezerw. Zaufanie zarządu spadło o ${RSV.escCostNo}.`;
      btns = '<button class="btn btn--quiet" data-act="rz-ask-ok">Zostaw</button>';
    } else if (res.hard) {
      k = 'no'; text = `Odmowa: ${res.reason} Tego nie wymusisz, to przepisy albo limity.`;
      btns = '<button class="btn btn--quiet" data-act="rz-ask-ok">Zostaw</button>';
    } else {
      k = 'no'; text = `${coach} odmówił. ${res.reason}${res.chance ? ` (szansa odmowy ${Math.round(res.chance * 100)} %)` : ''}`;
      btns = `<button class="btn btn--quiet" data-act="rz-force-ask"${cd.next ? ' disabled' : ''}>Wymuś mimo odmowy…</button><button class="btn btn--quiet" data-act="rz-ask-ok">Zostaw</button>${cd.next ? `<p class="rz-row__why">Wymuszenie dostępne od ${esc(fmtDate(cd.next))}.</p>` : ''}`;
    }
    body = `<p class="rz-ask__answer" data-k="${k}">${esc(text)}</p><div class="rz-ask__btns">${btns}</div>`;
  }
  const title = down ? `Deleguj do rezerw: ${p.name}` : `Powołaj z rezerw: ${p.name}`;
  return `<div class="rz-scrim" data-act="rz-ask-no" aria-hidden="true"></div>
  <div class="rz-ask" role="dialog" aria-labelledby="rz-ask-t">
    <h4 id="rz-ask-t">${esc(title)}</h4>
    <p>${esc(`${m.title}, ${when(f)}, ${m.home ? 'u siebie' : 'na wyjeździe'}.`)}${down ? ` ${esc('Wróci do ciebie po meczu.')}` : ''}</p>
    <div class="rz-ask__live" role="status" aria-live="polite">${body}</div>
  </div>`;
}

// ------------------------------------------------------------ Ekran
/** Podzakładka Kadra > Rezerwy (HTML). Klub bez rezerw: wyjaśnienie (R.reason). */
export function renderReserves(game, ui = {}) {
  let ctx;
  try {
    ctx = rzCtx(game);
    if (!ctx.ok) return `<div class="rz"><p class="rz-empty">${esc(ctx.R?.reason ?? 'Klub nie ma drużyny rezerw.')}</p></div>`;
    const dl = [...new Set([ctx.ff?.id, ctx.rf?.id].filter(Boolean))].flatMap((id) => delegationsFor(game, id));
    const avail = firstAvail(game, ctx);
    const chips = rzChipFn(game);
    let pos = '';
    try {
      if (ctx.R.comp) {
        const row = standings((game.fixtures ?? []).filter((f) => f.comp === ctx.R.comp), compClubIds(ctx.R.comp)).find((r) => r.id === ctx.R.id);
        if (row?.played) pos = `, ${row.pos}. miejsce`;
      }
    } catch { pos = ''; }
    let coach = '';
    try { const c = coachOf(game, ctx.R.id, anyClub(ctx.R.id)); if (c?.name) coach = `, trener ${c.name}`; } catch { coach = ''; }
    const em = ctx.ff ? emergencyFor(game, ctx.club, ctx.ff.id) : null;
    const alarm = em?.emergency ? `<div class="rz-alarm" role="alert">
        <h3>Nagły brak zawodników przed meczem</h3>
        <p>${esc(`${matchOf(ctx.ff, ctx.club).title}, ${when(ctx.ff)}. ${alarmText(em)} Trener rezerw nie może teraz odmówić.`)}</p>
        ${em.gk ? `<p>${esc('Bramkarz rezerw może zagrać nawet po meczu rezerw w ten weekend (wyjątek tylko dla bramkarza).')}</p>` : ''}
        <button class="btn btn--primary" data-act="rz-emergency">Uzupełnij awaryjnie</button>
      </div>` : '';
    const ask = ui.rzAsk ? askDialog(game, ctx, ui.rzAsk, avail) : '';
    const msg = ui.rzMsg ? `<p class="rz-msg" role="status">${esc(ui.rzMsg)}</p>` : '';
    return `<div class="rz">
      <div class="mail-head rz-head"><h2>Rezerwy</h2><span class="muted">${esc(`${ctx.R.name}, ${leagueLabel(anyClub(ctx.R.id)) || ''}${pos}${coach}`)}</span></div>
      ${alarm}${msg}
      <div class="rz-grid">
        <div class="rz-main">
          ${weekStrip(game, ctx, dl)}
          <div class="rz-cols">${downList(game, ctx, dl, ui, chips)}${upList(game, ctx, dl, avail, chips)}</div>
        </div>
        <div class="rz-side">${meters(ctx, dl, avail, game)}${ask}${squadOverview(game, ctx, dl, ui)}</div>
      </div>
    </div>`;
  } catch (err) {
    return `<div class="rz"><p class="rz-empty">Nie udało się wczytać rezerw.</p><button class="btn btn--quiet" data-act="rz-retry">Spróbuj jeszcze raz</button></div>`;
  }
}

// ------------------------------------------------------------ Akcje
const slim = (r) => ({ status: r.status, reason: r.reason ?? null, hard: !!r.hard, chance: r.chance ?? null, forced: !!r.forced, emergency: !!r.emergency, escalation: !!r.escalation });

/** Kliknięcie „rz-*”. Zwraca { ui, save, focus? }. */
export function handleReservesAction(game, act, ds = {}, ui = {}) {
  const ctx = rzCtx(game);
  const ask = ui.rzAsk ?? null;
  const name = (id) => game.world?.players?.[id]?.name ?? 'Zawodnik';
  switch (act) {
    case 'rz-ask': {
      if (!ctx.ok) return { ui: { rzMsg: ctx.R?.reason ?? null }, save: false };
      const dir = ds.dir === 'up' ? 'up' : 'down';
      const f = dir === 'down' ? ctx.rf : ctx.ff;
      if (!f) return { ui: { tab: 'kadra', sqSub: 'reserves', rzAsk: null, rzMsg: dir === 'down' ? 'Rezerwy nie mają meczu w najbliższych dniach.' : 'Pierwsza drużyna nie ma zaplanowanego meczu.' }, save: false };
      const chk = dir === 'down' ? canDelegate(game, ds.id, f.id) : canCallUp(game, ds.id, f.id);
      if (!chk.ok) return { ui: { tab: 'kadra', sqSub: 'reserves', rzAsk: null, rzMsg: `${name(ds.id)}: ${reasonsText(chk.reasons)}` }, save: false };
      return { ui: { tab: 'kadra', sqSub: 'reserves', playerOpen: null, rzAsk: { id: ds.id, dir, fid: f.id, step: 'ask', res: null }, rzMsg: null }, save: false, focus: '[data-act="rz-ask-send"]' };
    }
    case 'rz-ask-send': {
      if (!ask) return { ui: {}, save: false };
      const r = ask.dir === 'down' ? requestDelegation(game, { pid: ask.id, fixtureId: ask.fid }) : requestCallUp(game, { pid: ask.id, fixtureId: ask.fid });
      return { ui: { rzAsk: { ...ask, step: 'answer', res: slim(r) } }, save: true, focus: '.rz-ask__btns .btn:not([disabled])' };
    }
    case 'rz-ask-no': case 'rz-ask-ok':
      return { ui: { rzAsk: null }, save: false, focus: ask ? `[data-act="rz-ask"][data-id="${ask.id}"], [data-act="rz-cancel"][data-pid="${ask.id}"]` : null };
    case 'rz-force-ask':
      if (!ask?.res || ask.res.hard || ask.res.status !== 'refused') return { ui: {}, save: false };
      return { ui: { rzAsk: { ...ask, step: 'force' } }, save: false, focus: '[data-act="rz-force-no"]' };
    case 'rz-force-no': return { ui: { rzAsk: ask ? { ...ask, step: 'answer' } : null }, save: false, focus: '[data-act="rz-force-ask"]' };
    case 'rz-force-go': {
      if (!ask) return { ui: {}, save: false };
      const r = forceRequest(game, { pid: ask.id, fixtureId: ask.fid });
      return { ui: { rzAsk: { ...ask, step: 'answer', res: slim(r) } }, save: true, focus: '.rz-ask__btns .btn:not([disabled])' };
    }
    case 'rz-cancel': {
      const d = (game.reserves?.list ?? []).find((x) => x.id === ds.id);
      const r = cancelDelegation(game, ds.id);
      return { ui: { rzMsg: r.ok ? `${name(d?.pid)}: przydział cofnięty.` : r.reason, rzAsk: null }, save: r.ok };
    }
    case 'rz-filter': return { ui: { rzFilter: FILTERS.some(([k]) => k === ds.v) ? ds.v : 'all' }, save: false, focus: `[data-act="rz-filter"][data-v="${ds.v}"]` };
    case 'rz-view-squad': return { ui: { rzSquadOpen: ds.open !== '1' }, save: false, focus: '[data-act="rz-view-squad"]' };
    case 'rz-tip-close': return { ui: { rzTipOff: true }, save: false };
    case 'rz-open': return game.world?.players?.[ds.id] ? { ui: { extPlayer: { id: ds.id } }, save: false, top: true } : { ui: {}, save: false };
    case 'rz-retry': return { ui: { rzAsk: null, rzMsg: null }, save: false };
    case 'rz-emergency': {
      if (!ctx.ok) return { ui: {}, save: false };
      const out = emergencyFill(game, ctx.club);
      const ok = out.filter((x) => x.status === 'accepted').map((x) => name(x.pid));
      const text = !out.length ? 'Nie ma awarii: kadra jest wystarczająca.'
        : ok.length ? `Awaryjnie powołani: ${ok.join(', ')}.` : `Nikogo nie udało się powołać. ${out[0]?.reason ?? ''}`.trim();
      return { ui: { rzMsg: text }, save: ok.length > 0 };
    }
    case 'rz-promote': {
      const r = promoteReserve(game, ds.id);
      return { ui: { rzMsg: r.ok ? r.text : `${name(ds.id)}: ${r.text}` }, save: r.ok, squadChanged: r.ok };
    }
    default: return { ui: {}, save: false };
  }
}

// ------------------------------------------------------------ Menu kontekstowe (src/ui/playerMenus.js)
const askSteps = (id, dir) => ({ steps: [{ act: 'tab', tab: 'kadra' }, { act: 'tsub', s: 'reserves' }, { act: 'rz-ask', id, dir }], focus: '[data-act="rz-ask-send"]' });

/**
 * Wpisy rezerw w menu zawodnika: pierwsza drużyna (delegowanie), zawodnik rezerw (powołanie, przeniesienie na stałe).
 * Klub bez rezerw albo obcy zawodnik: [].
 */
export function rzMenuItems(game, p, item) {
  const ctx = rzCtx(game);
  if (!ctx.ok || !p) return [];
  const list = game.reserves?.list ?? [];
  if (p.clubId === ctx.club) {
    if (game.world.clubs[ctx.club]?.academy?.includes(p.id)) return [];
    const d = list.find((x) => x.pid === p.id && x.to === ctx.R.id);
    if (d) return [item('Cofnij delegację do rezerw', { steps: [{ act: 'rz-cancel', id: d.id }], toast: true }, { hint: `${ctx.R.name}, ${fmtDate(d.date)}` })];
    if (!ctx.rf) return [item('Deleguj do rezerw na mecz…', null, { disabled: `Rezerwy nie grają do ${ctx.rfLater ? fmtDay(ctx.rfLater.date) : 'końca rundy'}` })];
    const chk = canDelegate(game, p.id, ctx.rf.id);
    const m = matchOf(ctx.rf, ctx.R.id);
    return [item('Deleguj do rezerw na mecz…', askSteps(p.id, 'down'), { hint: `${when(ctx.rf)}, ${m.title}`, disabled: chk.ok ? null : shortReason(chk.reasons) })];
  }
  if (p.clubId !== ctx.R.id) return [];
  const out = [];
  const u = list.find((x) => x.pid === p.id && x.to === ctx.club);
  if (u) out.push(item('Cofnij powołanie', { steps: [{ act: 'rz-cancel', id: u.id }], toast: true }, { hint: fmtDate(u.date) }));
  else if (!ctx.ff) out.push(item('Powołaj z rezerw na mecz…', null, { disabled: 'Pierwsza drużyna nie ma zaplanowanego meczu' }));
  else {
    const chk = canCallUp(game, p.id, ctx.ff.id);
    out.push(item(chk.emergency ? 'Powołaj awaryjnie…' : 'Powołaj z rezerw na mecz…', askSteps(p.id, 'up'), { primary: true, hint: `${when(ctx.ff)}, ${matchOf(ctx.ff, ctx.club).opp}`, disabled: chk.ok ? null : shortReason(chk.reasons) }));
  }
  const pr = canPromoteReserve(game, p.id);
  out.push(item('Przenieś na stałe do pierwszej drużyny', { steps: [{ act: 'rz-promote', id: p.id }], toast: true }, { hint: pr.ok ? 'Kontrakt pierwszej drużyny na 3 lata' : null, disabled: pr.ok ? null : reasonsText(pr.reasons) }));
  return out;
}
