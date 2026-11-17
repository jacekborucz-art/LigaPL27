// Raport meczu: okno po kliknięciu wyniku (Rozgrywki > Terminarz, puchary, Pulpit, Terminarz i wyniki).
// Dane: f.result (src/season/matchReport.js). Stary zapis bez zdarzeń: wynik i strzelcy. Mecz bez polskiego klubu
// (puchary w tle) i sezony z historii: sam wynik. Akcje: mreport (data-fx, data-s), mreport-close.
import { anyClub, compLabel } from '../season/season.js';
import { clubById } from '../data/clubs_pl.js';
import { SEASON } from '../config/calendar2026.js';
import { compOfClub, compClubIds } from '../season/leagueComps.js';
import { standings } from '../season/standings.js';
import { unpackReport, minuteLabel } from '../season/matchReport.js';
import { uefaLabel } from '../season/europe.js';
import { refOf, refListFor, matchReferee } from '../career/referees.js';
import { attendanceFill, stadiumCapacity } from '../career/finance.js';
import { attendanceModifier } from '../career/fans.js';
import { ephemeralSquad } from '../world/ephemeral.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate, weekday } from './dom.js';

const clubsById = { get: (id) => clubById(id) };
const crest = (id, size = 36) => { const c = id ? anyClub(id) : null; return c ? crestHtml(c, { size, clubsById }) : ''; };
const clubName = (id) => (id ? anyClub(id)?.name ?? id : 'rywal');
const num = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '0');
const fmtInt = (v) => Math.round(v).toLocaleString('pl-PL');

/** Nazwisko zawodnika: świat gry, kadra na żądanie klubu (zagraniczne, IV liga) albo opis zastępczy. */
function playerName(game, id, clubId) {
  if (!id) return 'nieznany zawodnik';
  const p = game.world?.players?.[id];
  if (p?.name) return p.name;
  const c = clubId ? anyClub(clubId) : null;
  try {
    const e = c ? ephemeralSquad(c, SEASON).find((x) => x.id === id) : null;
    if (e?.name) return e.name;
  } catch { /* klub bez danych */ }
  return 'nieznany zawodnik';
}

// ------------------------------------------------------------ Dane meczu
/** Mecz do raportu: z terminarza, z pucharów (bez polskiego klubu) albo z historii drużyny gracza. */
export function findReportMatch(game, { fx, s = null } = {}) {
  if (!fx) return null;
  const cur = game.season?.seasonId ?? SEASON;
  if (s && s !== cur) {
    const row = (game.history?.m?.[s] ?? []).find((x) => x.id === fx);
    return row ? { row } : null;
  }
  const f = (game.fixtures ?? []).find((x) => x.id === fx);
  if (f?.played && f.result?.score) return { f };
  const m = game.season?.uefa?.matches?.[fx];
  if (m?.played && m.result?.score) return { m };
  const sc = game.season?.superCupEU; // Superpuchar Europy bez polskiego klubu
  if (sc?.id === fx && sc.result?.score) return { m: { ...sc, seu: true } };
  const row = (game.history?.m?.[cur] ?? []).find((x) => x.id === fx);
  return row?.s ? { row } : null;
}

/** Stadion jak w informacjach przed meczem (matchdayView). */
function venueOf(f) {
  if (f.neutral) return f.venue ? `${f.venue}, teren neutralny` : 'Teren neutralny';
  const hc = anyClub(f.home);
  return hc?.stadium ? `${hc.stadium}, ${clubName(f.home)}` : `Stadion gospodarzy, ${clubName(f.home)}`;
}

/** Widzowie: zapisani przy rozliczeniu biletów (careerSystem matchMoney), a przed nim ten sam model frekwencji. */
function attendanceOf(game, f) {
  if (Number.isFinite(f.attendance)) return f.attendance;
  const F = game.finance;
  if (!F?.clubs || !(F.clubs[f.home] || F.clubs[f.away])) return null;
  try {
    const comp = compOfClub(clubById(f.home));
    const row = comp ? standings(game.fixtures.filter((x) => x.comp === comp), compClubIds(comp)).find((r) => r.id === f.home) : null;
    const fill = attendanceFill(f, row, anyClub(f.away), f.neutral ? null : F.clubs[f.home]) * attendanceModifier(game, f.home, f);
    return Math.round((f.neutral ? 58000 : F.clubs[f.home]?.plan?.cap ?? stadiumCapacity(clubById(f.home) ?? anyClub(f.home))) * fill / 100) * 100;
  } catch { return null; }
}

/** Sędzia: obsada z puli (mecze krajowe), w pucharach i sparingach sędzia z ziarna meczu (jak w studiu). */
function refereeOf(game, f) {
  try {
    if (f.ref) return refOf(game, f.ref)?.n ?? null;
    if (refListFor(f) || !f.home || !f.away || !game.refs) return null; // polski mecz bez obsady (stary zapis)
    return matchReferee(game, f).name ?? null;
  } catch { return null; }
}

const INJ_CAT = { severe: 'poważna kontuzja', medium: 'kontuzja', light: 'lekki uraz' };
const VAR_CARD = { secondYellowCancelled: 'VAR cofa drugą żółtą kartkę', redCancelled: 'VAR: czerwona kartka zamieniona na żółtą' };

/** Zdarzenie raportu do wyświetlenia: { min, label, side, k, who, note, serious, score }. */
function describe(game, f, e, score) {
  const [min, code, side, pid, x, days, injName] = e;
  const club = [f.home, f.away][side];
  const opp = [f.home, f.away][1 - side];
  const nm = (id, c = club) => playerName(game, id, c);
  const base = { min, label: minuteLabel(min), side, k: code, serious: false };
  switch (code) {
    case 'g': score[side]++; return { ...base, k: 'g', who: nm(pid), note: x ? `asysta: ${nm(x)}` : 'gol', score: [...score] };
    case 'p': score[side]++; return { ...base, k: 'g', who: nm(pid), note: 'gol z rzutu karnego', score: [...score] };
    case 'o': score[side]++; return { ...base, k: 'o', who: nm(pid, opp), note: 'gol samobójczy', score: [...score] };
    case 'mp': return { ...base, who: nm(pid), note: 'niewykorzystany rzut karny' };
    case 'y': return { ...base, who: nm(pid), note: x ? 'żółta kartka, na ławce' : 'żółta kartka' };
    case 'r': return { ...base, who: nm(pid), note: x ? 'czerwona kartka, na ławce' : 'czerwona kartka' };
    case 'r2': return { ...base, who: nm(pid), note: x ? 'druga żółta i czerwona kartka, na ławce' : 'druga żółta i czerwona kartka' };
    case 'i': case 'k': {
      const serious = x === 'severe';
      const what = injName ? `${injName}${days ? `, ok. ${days} dni przerwy` : ''}` : INJ_CAT[x] ?? 'uraz';
      return { ...base, k: 'inj', who: nm(pid), note: `${serious ? 'poważna kontuzja: ' : ''}${what}, ${code === 'i' ? 'zszedł z boiska' : 'grał dalej'}`, serious };
    }
    case 's': return { ...base, who: nm(pid), note: `wchodzi za: ${nm(x)}` };
    case 'vg': return { ...base, k: 'var', who: nm(pid), note: `VAR: gol nieuznany${x ? ` (${x})` : ''}` };
    case 'vc': return { ...base, k: 'var', who: nm(pid), note: VAR_CARD[x] ?? 'VAR zmienia decyzję o kartce' };
    case 'vp': return { ...base, k: 'var', who: nm(pid), note: 'VAR: rzut karny po analizie' };
    default: return null;
  }
}

/**
 * Model raportu: { title, date, venue, attendance, referee, home, away, score, shootout, extraTime, stats,
 * reg, et (zdarzenia), pk (seria karnych), ratings, full, kind: 'full' | 'scorers' | 'score', note }.
 */
export function reportModel(game, ref) {
  const hit = findReportMatch(game, ref);
  if (!hit) return null;
  if (hit.row) {
    const r = hit.row;
    return {
      kind: 'score', title: compLabel({ comp: r.c, round: r.r, label: r.lb }), dateIso: r.d, time: r.t ?? '', home: r.h, away: r.a,
      score: r.s, shootout: r.so ?? null, extraTime: !!r.et, venue: venueOf({ home: r.h, neutral: !!r.n }),
      note: 'Z tego meczu zapisano tylko wynik.',
    };
  }
  if (hit.m) {
    const m = hit.m;
    return {
      kind: 'score', title: m.seu ? 'Superpuchar Europy' : uefaLabel(m), dateIso: m.date, time: m.time ?? '', home: m.home, away: m.away,
      score: m.result.score, shootout: m.result.shootout ?? null, extraTime: !!m.result.extraTime,
      venue: m.seu && m.venue ? `${m.venue.stadium}, ${m.venue.city}` : m.neutral ? 'Teren neutralny' : venueOf(m),
      note: 'Mecz bez polskiego klubu: zapisano tylko wynik.',
    };
  }
  const f = hit.f;
  const res = f.result;
  const head = {
    title: f.comp === 'friendly' && !f.label ? 'Mecz towarzyski' : compLabel(f), dateIso: f.date, time: f.time ?? '', home: f.home, away: f.away,
    score: res.score, shootout: res.shootout ?? null, extraTime: !!res.extraTime, venue: venueOf(f),
    attendance: attendanceOf(game, f), referee: refereeOf(game, f), stats: res.stats ?? null,
  };
  const rep = unpackReport(f);
  if (!rep) {
    const sc = [0, 1].map((s) => (res.scorers?.[s] ?? []).map((id) => playerName(game, id, [f.home, f.away][s])));
    return { ...head, kind: 'scorers', scorers: sc, note: res.forfeit ? 'Mecz nie został rozegrany (walkower).' : 'Mecz rozegrany przed zapisem relacji: tylko wynik i strzelcy.' };
  }
  const score = [0, 0];
  const evs = rep.ev.map((e) => describe(game, f, e, score)).filter(Boolean);
  const subsIn = new Set(rep.ev.filter((e) => e[1] === 's').map((e) => e[3]));
  const ratings = [0, 1].map((s) => rep.players[s].map((x) => ({ name: playerName(game, x.id, [f.home, f.away][s]), rating: x.rating, sub: subsIn.has(x.id) })));
  const best = Math.max(0, ...ratings.flat().map((x) => x.rating));
  return {
    ...head, kind: 'full', full: rep.full, abandoned: rep.abandoned,
    reg: evs.filter((e) => e.min < 91), et: evs.filter((e) => e.min >= 91),
    pk: rep.pk.map((k) => ({ side: k.side, name: playerName(game, k.id, [f.home, f.away][k.side]), scored: k.scored })),
    ratings, best,
    note: rep.abandoned ? 'Mecz przerwany: drużyna miała za mało zawodników, wynik z decyzji organizatora.'
      : rep.full ? '' : 'Mecz rozegrany w tle: relacja bez zmian i analiz VAR.',
  };
}

// ------------------------------------------------------------ Widok
const ICON = {
  g: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="#fff" stroke="#17231C" stroke-width="1.3"/><path d="M8 4.6l2.4 1.7-.9 2.8H6.5l-.9-2.8z" fill="#17231C"/></svg>',
  y: '<span class="mr-card mr-card--y" aria-hidden="true"></span>',
  r: '<span class="mr-card mr-card--r" aria-hidden="true"></span>',
  r2: '<span class="mr-card mr-card--y mr-card--2" aria-hidden="true"></span><span class="mr-card mr-card--r mr-card--2b" aria-hidden="true"></span>',
  inj: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="currentColor"/><path d="M8 4.5v7M4.5 8h7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
  s: '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13V4M2.5 6.5L5 4l2.5 2.5" stroke="#2E8A4E"/><path d="M11 3v9M8.5 9.5L11 12l2.5-2.5" stroke="#D62839"/></svg>',
  var: '<span class="mr-var" aria-hidden="true">VAR</span>',
  mp: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};
ICON.o = ICON.g;
const KIND_WORD = { g: 'Gol', o: 'Gol samobójczy', y: 'Żółta kartka', r: 'Czerwona kartka', r2: 'Druga żółta kartka', inj: 'Kontuzja', s: 'Zmiana', var: 'VAR', mp: 'Niewykorzystany karny' };

/** Wiersz przebiegu; herb drużyny widać tylko na wąskim ekranie (jedna kolumna zamiast stron boiska). */
function evRow(e, M) {
  const sc = e.score ? `<b class="mr-ev__sc">${e.score[0]}:${e.score[1]}</b>` : '';
  return `<li class="mr-ev mr-ev--${e.side === 0 ? 'h' : 'a'}${e.serious ? ' is-serious' : ''}" data-k="${esc(e.k)}">
    <span class="mr-ev__min">${esc(e.label)}</span>
    <span class="mr-ev__body"><span class="mr-ev__crest">${crest([M.home, M.away][e.side], 16)}</span><span class="mr-ev__ico" title="${esc(KIND_WORD[e.k] ?? '')}">${ICON[e.k] ?? ''}</span><span class="mr-ev__txt"><b>${esc(e.who)}</b><small>${esc(e.note)}</small></span>${sc}</span>
  </li>`;
}
const evList = (list, empty, M) => (list.length ? `<ol class="mr-tl">${list.map((e) => evRow(e, M)).join('')}</ol>` : `<p class="mr-empty">${esc(empty)}</p>`);

function statsHtml(st) {
  if (!st) return '';
  const rows = [['Strzały', st.shots, 0, ''], ['Celne strzały', st.onTarget, 0, ''], ['Posiadanie piłki', st.possession, 0, '%'], ['Gole oczekiwane (xG)', st.xg, 2, '']]
    .filter(([, v]) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite));
  if (!rows.length) return '';
  return `<section class="mr-sec"><h3>Statystyki</h3><dl class="mr-stats">${rows.map(([l, [a, b], d, u]) => {
    const sum = a + b; const pa = sum > 0 ? Math.round((a / sum) * 100) : 50;
    return `<div class="mr-st"><dt>${esc(l)}</dt><dd class="mr-st__h">${num(a, d)}${u}</dd><dd class="mr-st__a">${num(b, d)}${u}</dd><dd class="mr-st__bar" aria-hidden="true"><span style="--p:${pa}%"></span></dd></div>`;
  }).join('')}</dl></section>`;
}

function ratingsHtml(M) {
  if (!M.ratings?.some((l) => l.length)) return '';
  const col = (s) => `<div class="mr-rt__col"><h4>${crest([M.home, M.away][s], 20)}${esc(clubName([M.home, M.away][s]))}</h4><ol class="mr-rt__list">${M.ratings[s].map((x) => `<li${x.rating === M.best ? ' class="is-best"' : ''}><span>${esc(x.name)}${x.sub ? ' <small>z ławki</small>' : ''}</span><b>${num(x.rating, 1)}</b></li>`).join('')}</ol></div>`;
  return `<details class="mr-sec mr-rt"><summary>Oceny zawodników</summary><div class="mr-rt__grid">${col(0)}${col(1)}</div></details>`;
}

function pkHtml(M) {
  if (!M.shootout) return '';
  const head = `<p class="mr-pk__sum">Rzuty karne ${M.shootout[0]}:${M.shootout[1]}, wygrywa ${esc(clubName(M.shootout[0] > M.shootout[1] ? M.home : M.away))}.</p>`;
  const kicks = M.pk?.length ? `<ol class="mr-pk">${M.pk.map((k) => `<li class="mr-pk__k mr-pk__k--${k.side === 0 ? 'h' : 'a'}" data-ok="${k.scored ? 1 : 0}"><span>${esc(k.name)}</span><small>${k.scored ? 'gol' : 'nie trafia'}</small></li>`).join('')}</ol>` : '';
  return `<section class="mr-sec"><h3>Seria rzutów karnych</h3>${head}${kicks}</section>`;
}

/** Treść okna raportu (dialog #mrDlg). ref: { fx, s }. */
export function matchReportHtml(game, ref) {
  const M = reportModel(game, ref);
  const close = '<button class="btn btn--quiet mrdlg__x" data-act="mreport-close">Zamknij</button>';
  if (!M) return `<h2 id="mrTitle" tabindex="-1">Raport meczu</h2><p class="mr-empty">Brak danych o tym meczu.</p>${close}`;
  const tags = [M.extraTime && !M.shootout ? 'po dogrywce' : '', M.shootout ? `${M.extraTime ? 'po dogrywce, ' : ''}karne ${M.shootout[0]}:${M.shootout[1]}` : ''].filter(Boolean).join('');
  const info = [
    ['Data', `${weekday(M.dateIso)}, ${fmtDate(M.dateIso)}${M.time ? `, ${M.time}` : ''}`],
    ['Stadion', M.venue],
    M.attendance != null ? ['Widzowie', M.attendance > 0 ? fmtInt(M.attendance) : 'mecz bez publiczności'] : null,
    M.referee ? ['Sędzia', M.referee] : null,
  ].filter(Boolean);
  let body = '';
  if (M.kind === 'full') {
    body = `<section class="mr-sec"><h3>Przebieg meczu</h3>${evList(M.reg, 'Bez goli, kartek i kontuzji.', M)}</section>
      ${M.extraTime ? `<section class="mr-sec"><h3>Dogrywka (91-120 min)</h3>${evList(M.et, 'W dogrywce bez goli i kartek.', M)}</section>` : ''}
      ${pkHtml(M)}${statsHtml(M.stats)}${ratingsHtml(M)}`;
  } else if (M.kind === 'scorers') {
    // Strzelcy bez powtórzeń: nazwisko i liczba goli w nawiasie
    const count = (s) => [...M.scorers[s].reduce((m, n) => m.set(n, (m.get(n) ?? 0) + 1), new Map())];
    const list = (s) => (M.scorers[s].length ? count(s).map(([n, k]) => `<li>${esc(n)}${k > 1 ? ` (${k})` : ''}</li>`).join('') : '<li class="mr-empty">bez goli</li>');
    body = `<section class="mr-sec"><h3>Strzelcy</h3><div class="mr-sc"><ul>${list(0)}</ul><ul>${list(1)}</ul></div></section>${pkHtml(M)}${statsHtml(M.stats)}`;
  } else body = pkHtml(M);
  return `<div class="mr">
    <header class="mr-head">
      <h2 id="mrTitle" tabindex="-1">Raport meczu</h2>
      <p class="mr-head__comp">${esc(M.title)}</p>
      <div class="mr-score">
        <span class="mr-score__t">${crest(M.home)}<b>${esc(clubName(M.home))}</b></span>
        <span class="mr-score__res" aria-label="Wynik ${M.score[0]}:${M.score[1]}">${M.score[0]}<i>:</i>${M.score[1]}</span>
        <span class="mr-score__t mr-score__t--a">${crest(M.away)}<b>${esc(clubName(M.away))}</b></span>
      </div>
      ${tags ? `<p class="mr-head__tag">${esc(tags)}</p>` : ''}
    </header>
    <dl class="mr-info">${info.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${body}
    ${M.note ? `<p class="mr-note">${esc(M.note)}</p>` : ''}
    ${close}
  </div>`;
}
