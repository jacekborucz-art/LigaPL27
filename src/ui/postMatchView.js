// Analiza pomeczowa sztabu (docs/analiza-pomeczowa.md): pełny raport meczu i archiwum „Analizy meczów” (Kadra, Skład
// i taktyka). Dane: src/career/postMatchReport.js (kody i liczby w zapisie, tekst z szablonów przy otwarciu). Karty,
// kolory znaczeniowe i podpis z pewnością jak w raporcie ogólnym o drużynie (src/ui/teamReportView.js, style `.arep`
// i `.mrep` w src/styles/assistant.css). Przyciski tylko przenoszą do ekranu (taktyka, trening, rozmowa, karta
// zawodnika), niczego nie zmieniają same. Trafność rad sztabu jest ukryta (decyzja właściciela).
import { esc, fmtDate, fmtDay } from './dom.js';
import {
  ensureMatchReports, findMatchReport, matchReportList, reportText, statAverages, recurringProblems, rivalReport, numPl, BUCKETS, VD_SHORT,
} from '../career/postMatchReport.js';

const DOTS = { exact: 3, approx: 2, vague: 1 };
const RES_WORD = { W: 'wygrana', R: 'remis', P: 'porażka' };
const RES_TAG = { W: 'W', R: 'R', P: 'P' };
const dots = (prec) => `<span class="arep__dots" aria-hidden="true">${[1, 2, 3].map((i) => `<i${i <= DOTS[prec] ? ' class="on"' : ''}></i>`).join('')}</span>`;
const scoreHome = (rec) => (rec.home ? rec.score : [rec.score[1], rec.score[0]]);

/** Przycisk przejścia (tylko nawigacja). */
export function goButton(go, extra = '', cls = 'btn btn--sm arep-rec__go') {
  if (!go) return '';
  return `<button class="${cls}" data-act="ma-go" data-to="${esc(go.to)}"${go.id ? ` data-id="${esc(go.id)}"` : ''}${extra}>${esc(go.label)}</button>`;
}

/** Przyciski pod wiadomością z analizą (poczta). */
export function matchReportMailFoot(game, m) {
  const links = Array.isArray(m.refs?.links) ? m.refs.links : [];
  if (!links.length) return '';
  const extra = ` data-mail="${esc(m.id)}"`;
  return `<p class="mail-view__foot mrep-mail">${links.map((l, i) => goButton(l, extra, `btn btn--sm${i === 0 ? ' btn--primary' : ''}`)).join('')}</p>`;
}

/** Stan przycisku „Analizy meczów” w panelu taktyki: liczba analiz i czy jakiś problem wraca. */
export function analysesBadge(game) {
  const n = matchReportList(game).length;
  return { n, alert: n ? recurringProblems(game).length > 0 : false };
}

// ------------------------------------------------------------ Pełny raport
function momentsHtml(T) {
  if (!T.moments.length) return '<p class="muted">Spokojny mecz bez ważnych wydarzeń.</p>';
  return `<ol class="mrep-moments">${T.moments.map((x) => `<li data-side="${x.side === 0 ? 'us' : 'them'}" data-k="${esc(x.code)}"><span class="mrep-moments__min">${esc(x.min)}</span><span class="mrep-moments__t">${esc(x.text)}</span><small>${x.side === 0 ? 'my' : 'rywal'}</small></li>`).join('')}</ol>`;
}

/** xG co 15 minut: słupki naszej drużyny w lewo, rywala w prawo (wartości z meczu). */
function xg15Html(rec, prec) {
  const rows = rec.q15 ?? [];
  if (!rows.length) return '';
  const max = Math.max(0.3, ...rows.flat());
  const w = (v) => `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1)}%`;
  const lab = (v) => (prec === 'vague' ? '' : numPl(v, prec === 'exact' ? 2 : 1));
  return `<div class="mrep-xg" role="table" aria-label="xG co 15 minut">
    <div class="mrep-xg__row mrep-xg__row--head" role="row"><span role="columnheader">my</span><span role="columnheader">minuty</span><span role="columnheader">rywal</span></div>
    ${rows.map(([u, t], i) => `<div class="mrep-xg__row" role="row">
      <span class="mrep-xg__bar mrep-xg__bar--us" role="cell" aria-label="${esc(`my: ${numPl(u, 2)}`)}"><i style="width:${w(u)}"></i><b>${esc(lab(u))}</b></span>
      <span class="mrep-xg__k" role="rowheader">${esc(BUCKETS[i])}</span>
      <span class="mrep-xg__bar mrep-xg__bar--them" role="cell" aria-label="${esc(`rywal: ${numPl(t, 2)}`)}"><i style="width:${w(t)}"></i><b>${esc(lab(t))}</b></span>
    </div>`).join('')}
  </div>`;
}

const STAT_ROWS = [
  ['Gole', (r) => r.score, 0, 1], ['xG', (r) => r.xg, 2, 1], ['Strzały', (r) => r.sh, 0, 1], ['Celne strzały', (r) => r.sot, 0, 1],
  ['Posiadanie piłki', (r) => r.poss, 0, 1, ' %'], ['Celność podań', (r) => r.pa, 0, 1, ' %'], ['Rzuty rożne', (r) => r.co, 0, 1],
  ['Faule', (r) => r.fo, 0, -1], ['Spalone', (r) => r.off, 0, -1], ['Żółte kartki', (r) => r.yc, 0, -1],
];
const AVG_KEY = { Gole: 'g', xG: 'xg', Strzały: 'sh', 'Celne strzały': 'sot', 'Posiadanie piłki': 'poss', 'Celność podań': 'pa', 'Rzuty rożne': 'co', Faule: 'fo', Spalone: 'off', 'Żółte kartki': 'yc' };

function statsHtml(game, rec) {
  const av = statAverages(game, rec);
  const cols = [av.last5 ? ['Średnio, 5 ostatnich', av.last5] : null, av.season ? ['Średnio w sezonie', av.season] : null].filter(Boolean);
  const fmt = (v, d, suf = '') => `${numPl(Number(v) || 0, d)}${suf}`;
  const trend = (v, a, dir) => {
    if (a == null) return '';
    const diff = (Number(v) || 0) - a;
    if (Math.abs(diff) < Math.max(0.15, Math.abs(a) * 0.12)) return '';
    const good = diff * dir > 0;
    return ` <i class="mrep-tr" data-t="${good ? 'good' : 'bad'}" aria-label="${good ? 'lepiej' : 'gorzej'} niż średnio">${diff > 0 ? '▲' : '▼'}</i>`;
  };
  return `<div class="mrep-stats"><table>
    <thead><tr><th scope="col">Statystyka</th><th scope="col">My</th><th scope="col">Rywal</th>${cols.map(([k]) => `<th scope="col">${esc(k)}</th>`).join('')}</tr></thead>
    <tbody>${STAT_ROWS.map(([k, get, d, dir, suf]) => {
      const v = get(rec) ?? [0, 0];
      const a = cols.length ? cols[0][1][AVG_KEY[k]]?.[0] : null;
      return `<tr><th scope="row">${esc(k)}</th><td>${fmt(v[0], d, suf)}${trend(v[0], a, dir)}</td><td>${fmt(v[1], d, suf)}</td>${cols.map(([, A]) => `<td>${fmt(A[AVG_KEY[k]]?.[0] ?? 0, 1, suf)}</td>`).join('')}</tr>`;
    }).join('')}</tbody>
  </table></div>
  <p class="arep-note">${cols.length ? `Strzałka: nasz wynik wyraźnie lepszy albo gorszy od średniej z 5 ostatnich meczów (${esc(String(cols[0][1].n))} z analizą).` : 'Porównanie ze średnią pojawi się po 3 meczach z analizą.'} Posiadanie piłki w połowach meczu: na razie bez danych.</p>`;
}

const listHtml = (xs, empty) => (xs.length ? `<ul class="trep-lines">${xs.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>` : `<p class="muted">${esc(empty)}</p>`);

function playersHtml(T) {
  const row = (x, t) => `<li data-t="${t}"><span class="arep-pos">${esc(x.pos)}</span><span class="mrep-pl__who"><b>${esc(x.name)}</b><small>${esc(x.text)}</small></span><span class="mrep-pl__r">${esc(x.rating ?? x.word)}</span></li>`;
  return `${T.top.length ? `<h4>Najlepsi</h4><ul class="mrep-pl">${T.top.map((x) => row(x, 'good')).join('')}</ul>` : ''}
    ${T.low.length ? `<h4>Najsłabsi</h4><ul class="mrep-pl">${T.low.map((x) => row(x, 'bad')).join('')}</ul>` : '<p class="muted">Nikt wyraźnie nie zawiódł.</p>'}
    ${T.gkLine ? `<p class="mrep-gk">${esc(T.gkLine)}</p>` : ''}`;
}

function recsHtml(T) {
  return `<ul class="arep-recs">${T.recs.map((r) => `<li class="arep-rec" data-t="${r.code === 'r_keep' ? 'good' : 'info'}"><span class="arep-rec__dot" aria-hidden="true"></span>
    <span class="arep-rec__text"><b>${esc(r.text)}</b></span>${goButton(r.go)}</li>`).join('')}</ul>`;
}

const card = (cls, title, body, tone, sign = '') => `<section class="arep-card mrep-card mrep-card--${cls}" data-t="${tone}" aria-labelledby="mrep-${cls}">
    <header class="arep-card__head"><h3 id="mrep-${cls}">${esc(title)}</h3></header>
    <div class="arep-card__body">${body}</div>${sign}
  </section>`;

function reportHtml(game, rec, ui) {
  const T = reportText(game, rec);
  const [h, a] = scoreHome(rec);
  const back = ui.from === 'mail' ? 'Wróć do wiadomości' : ui.from === 'list' ? 'Wróć do listy analiz' : 'Wróć do składu';
  const extra = rec.so ? `karne ${scoreHome({ ...rec, score: rec.so })[0]}:${scoreHome({ ...rec, score: rec.so })[1]}` : rec.et ? 'po dogrywce' : rec.ht ? `do przerwy ${scoreHome({ ...rec, score: rec.ht })[0]}:${scoreHome({ ...rec, score: rec.ht })[1]}` : '';
  const sign = `<footer class="trep-sign" data-prec="${esc(T.prec)}"><span>${esc(T.sign)}</span><span class="trep-sign__p">dokładność ${esc(T.precWord)} ${dots(T.prec)}</span></footer>`;
  return `<div class="arep mrep" data-prec="${esc(T.prec)}">
    <nav class="mrep-nav" aria-label="Analiza meczu"><button class="btn btn--quiet btn--sm" data-act="ma-back">${esc(back)}</button>${ui.from !== 'list' ? '<button class="btn btn--quiet btn--sm" data-act="ma-list">Wszystkie analizy</button>' : ''}</nav>
    <header class="mrep__head">
      <div class="mrep__title"><h2>Analiza meczu</h2><p class="muted">${esc(rec.lbl)}, <time datetime="${esc(rec.date)}">${esc(fmtDate(rec.date))}</time></p></div>
      <div class="mrep-score" data-r="${esc(rec.res)}" role="img" aria-label="${esc(`${rec.hN} ${h}:${a} ${rec.aN}`)}">
        <span class="mrep-score__t">${esc(rec.hN)}</span><b>${h}:${a}</b><span class="mrep-score__t">${esc(rec.aN)}</span>${extra ? `<small>${esc(extra)}</small>` : ''}
      </div>
      <div class="arep__conf" data-prec="${esc(T.prec)}" role="img" aria-label="Dokładność liczb: ${esc(T.precWord)}">
        <span class="arep__conf-k">Dokładność liczb</span><span class="arep__conf-v"><b>${esc(T.precWord)}</b>${dots(T.prec)}</span>
      </div>
    </header>
    <p class="arep__summary">${esc(T.verdict)} ${esc(T.mainText)}</p>
    ${T.ctxLines.length ? `<ul class="mrep-ctx">${T.ctxLines.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <div class="arep__grid">
      ${card('moments', 'Kluczowe momenty', `${momentsHtml(T)}<h4>xG co 15 minut</h4>${xg15Html(rec, T.prec)}`, 'info')}
      ${card('good', 'Dobrze', listHtml(T.good, 'Sztab nie wskazał mocnych stron tego meczu.'), 'good')}
      ${card('bad', 'Źle', listHtml(T.bad, 'Sztab nie widzi poważnych problemów.'), T.bad.length ? 'bad' : 'good')}
      ${card('fix', 'Do poprawy', listHtml(T.fix, 'Bez pilnych tematów do poprawy.'), 'warn')}
      ${card('players', 'Zawodnicy', playersHtml(T), 'misc')}
      ${card('recs', 'Wnioski na trening i następny mecz', recsHtml(T), 'info')}
    </div>
    ${card('stats', 'Statystyki: my, rywal i nasza średnia', statsHtml(game, rec), 'info', sign)}
    <p class="arep-note">Analiza to opinia sztabu na podstawie tego, co widać w meczu: słabszy sztab podaje liczby w przybliżeniu, częściej coś przeoczy albo położy akcent na sprawę drugorzędną. Przyciski tylko przenoszą do ekranu, niczego nie zmieniają.</p>
  </div>`;
}

// ------------------------------------------------------------ Archiwum
function rowHtml(rec, cls = '') {
  const [h, a] = scoreHome(rec);
  return `<li class="${cls}"><button class="mrep-row" data-act="ma-open" data-id="${esc(rec.id)}">
    <span class="trep-form__r" data-r="${esc(RES_TAG[rec.res])}" title="${esc(RES_WORD[rec.res])}">${esc(RES_TAG[rec.res])}</span>
    <span class="mrep-row__m"><b>${esc(rec.hN)} ${h}:${a} ${esc(rec.aN)}</b><small>${esc(fmtDate(rec.date))}, ${esc(rec.lbl)}</small></span>
    <span class="mrep-row__v">${esc(VD_SHORT[rec.vd] ?? '')}</span>
  </button></li>`;
}

function trendsHtml(list) {
  const last = list.slice(0, 5);
  if (!last.length) return '';
  const max = Math.max(1, ...last.flatMap((x) => x.xg ?? [0, 0]));
  const w = (v) => `${Math.max(2, Math.min(100, (v / max) * 100)).toFixed(1)}%`;
  const avg = (k, s) => last.reduce((t, x) => t + (Number(x[k]?.[s]) || 0), 0) / last.length;
  const pts = last.reduce((t, x) => t + (x.res === 'W' ? 3 : x.res === 'R' ? 1 : 0), 0);
  return `<section class="arep-card mrep-card" data-t="info" aria-labelledby="mrep-trend">
    <header class="arep-card__head"><h3 id="mrep-trend">${last.length === 1 ? 'Ostatni mecz' : `Ostatnie ${last.length} ${last.length < 5 ? 'mecze' : 'meczów'}`}</h3></header>
    <ol class="mrep-trend">${last.slice().reverse().map((x) => `<li>
      <span class="trep-form__r" data-r="${esc(RES_TAG[x.res])}">${esc(RES_TAG[x.res])}</span>
      <span class="mrep-trend__who">${esc(fmtDay(x.date))}, ${esc(x.oppN)} <small>${x.score[0]}:${x.score[1]}</small></span>
      <span class="mrep-trend__bars" role="img" aria-label="${esc(`xG ${numPl(x.xg?.[0] ?? 0, 2)} do ${numPl(x.xg?.[1] ?? 0, 2)}`)}"><i class="mrep-trend__us" style="width:${w(x.xg?.[0] ?? 0)}"></i><i class="mrep-trend__them" style="width:${w(x.xg?.[1] ?? 0)}"></i></span>
    </li>`).join('')}</ol>
    <p class="trep-legend"><span><i class="trep-key mrep-key--us"></i>nasze xG</span><span><i class="trep-key mrep-key--them"></i>xG rywala</span></p>
    <p>Bilans: ${pts} pkt, średnio xG ${esc(numPl(avg('xg', 0), 2))} do ${esc(numPl(avg('xg', 1), 2))}, strzały ${esc(numPl(avg('sh', 0), 1))} do ${esc(numPl(avg('sh', 1), 1))}.</p>
  </section>`;
}

function archiveHtml(game, ui) {
  const list = matchReportList(game);
  const back = '<nav class="mrep-nav" aria-label="Analizy meczów"><button class="btn btn--quiet btn--sm" data-act="ma-back">Wróć do składu</button></nav>';
  if (!list.length) {
    return `<div class="arep mrep mrep--arch">${back}
      <section class="trep-intro"><h2>Analizy meczów</h2>
        <p>Po każdym meczu o punkty i w pucharach analityk (a bez niego asystent) przysyła krótką analizę do poczty: dlaczego taki wynik, co poprawić i na kogo zwrócić uwagę. Pełne raporty z ostatnich 40 meczów znajdziesz tutaj.</p>
        <p class="muted">Sparingi nie mają analizy. Dokładność zależy od analityka (analiza danych i wideo) i asystenta (wnioski).</p></section>
    </div>`;
  }
  const riv = rivalReport(game);
  const rec = recurringProblems(game);
  return `<div class="arep mrep mrep--arch">${back}
    <header class="mrep__head"><div class="mrep__title"><h2>Analizy meczów</h2><p class="muted">Raporty sztabu po meczach o stawkę, ${list.length} z ostatnich 40.</p></div></header>
    ${riv ? `<section class="arep-card mrep-card mrep-rival" data-t="warn" aria-labelledby="mrep-rival">
      <header class="arep-card__head"><h3 id="mrep-rival">Przed meczem z rywalem: ${esc(riv.rec.oppN)}</h3></header>
      <div class="arep-card__body"><p>Mecz ${esc(fmtDate(riv.fixture.date))}. Poprzednia analiza meczu z tym rywalem:</p><ul class="mrep-list">${rowHtml(riv.rec, 'is-rival')}</ul></div>
    </section>` : ''}
    ${rec.length ? `<section class="arep-card mrep-card" data-t="bad" aria-labelledby="mrep-again">
      <header class="arep-card__head"><h3 id="mrep-again">Ten problem wraca</h3></header>
      <ul class="trep-lines">${rec.map((x) => `<li><b>${esc(x.label.charAt(0).toUpperCase() + x.label.slice(1))}</b>: ${x.n} z ${Math.min(5, list.length)} ostatnich meczów.</li>`).join('')}</ul>
    </section>` : ''}
    ${trendsHtml(list)}
    <section class="mrep-all" aria-labelledby="mrep-all-h"><h3 id="mrep-all-h">Wszystkie analizy</h3><ul class="mrep-list">${list.map((x) => rowHtml(x)).join('')}</ul></section>
  </div>`;
}

/** Ekran analiz (HTML). ui: { id?, from?: 'mail'|'list'|'tactics', list?: true }. */
export function renderMatchAnalysis(game, ui = {}) {
  ensureMatchReports(game);
  const rec = ui.id ? findMatchReport(game, ui.id) : null;
  if (rec) return reportHtml(game, rec, ui);
  return archiveHtml(game, ui);
}
