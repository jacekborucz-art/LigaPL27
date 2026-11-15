// Widok „Raport ogólny o drużynie” (Kadra, Raport ogólny). Dane: src/career/teamReport.js (gotowy raport w zapisie,
// game.teamReport.cur). Najważniejszy element: pasek siły formacji na tle ligi (nasza ocena, średnia ligi, czołowa
// trójka). Każda część ma podpis członka sztabu i pewność (trzy kreski, jak w raporcie o zawodniku). Style: `.trep`
// w src/styles/assistant.css (te same kolory znaczeniowe co raport asystenta).
import { esc, fmtDate } from './dom.js';
import { ensureTeamReport, canRequest, reportList } from '../career/teamReport.js';

const DOTS = { exact: 3, approx: 2, vague: 1 };
const RES_WORD = { W: 'wygrana', R: 'remis', P: 'porażka' };
const num = (v) => String(v).replace('.', ',');

const dots = (prec) => `<span class="arep__dots" aria-hidden="true">${[1, 2, 3].map((i) => `<i${i <= DOTS[prec] ? ' class="on"' : ''}></i>`).join('')}</span>`;

/** Podpis części: kto przygotował i z jaką pewnością. */
const sign = (s, extra = null) => `<footer class="trep-sign" data-prec="${esc(s.prec)}">
    <span>${esc(s.by.name)}, ${esc(s.by.title.toLowerCase())}${extra ? ` i ${esc(extra.name)}` : ''}</span>
    <span class="trep-sign__p">pewność ${esc(s.word)} ${dots(s.prec)}</span>
  </footer>`;

const card = (cls, title, body, s, { tone = 'info', extra = null, wide = false } = {}) => `<section class="arep-card trep-card trep-card--${cls}${wide ? ' trep-card--wide' : ''}" data-t="${tone}" aria-labelledby="trep-${cls}">
    <header class="arep-card__head"><h3 id="trep-${cls}">${esc(title)}</h3></header>
    <div class="arep-card__body">${body}</div>
    ${sign(s, extra)}
  </section>`;

const lines = (xs) => `<ul class="trep-lines">${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;

function recButton(game, r) {
  if (!r.act) return '';
  const a = r.act;
  if (a.act === 'tr-accent' && game.training?.settings?.accent === a.v) return '<small class="trep-set">Już ustawione w planie treningu.</small>';
  const data = a.act === 'tab' ? `data-tab="${esc(a.tab)}"` : a.act === 'tsub' ? `data-s="${esc(a.s)}"` : `data-v="${esc(a.v)}"`;
  return `<button class="btn btn--sm arep-rec__go" data-act="${esc(a.act)}" ${data}>${esc(a.label)}</button>`;
}

function recsHtml(game, recs) {
  return `<ul class="arep-recs">${recs.map((r) => `<li class="arep-rec" data-t="${esc(r.tone)}" data-rec="${esc(r.id)}"><span class="arep-rec__dot" aria-hidden="true"></span>
    <span class="arep-rec__text"><b>${esc(r.text)}</b>${r.why ? `<small>Dlaczego: ${esc(r.why)}.</small>` : ''}</span>${recButton(game, r)}</li>`).join('')}</ul>`;
}

/** Pasek siły formacji: skala od lo do hi, znacznik naszej oceny, kreski średniej ligi i czołowej trójki. */
function unitsHtml(u) {
  const { lo, hi } = u.scale;
  const at = (v) => `${Math.max(0, Math.min(100, ((v - lo) / Math.max(1, hi - lo)) * 100)).toFixed(1)}%`;
  const exact = (x) => x.prec === 'exact';
  const rows = u.rows.map((x) => `<li class="trep-unit" data-t="${esc(x.tone)}">
      <span class="trep-unit__k">${esc(x.label)}</span>
      <span class="trep-rail" role="img" aria-label="${esc(`${x.label}: ${x.text}`)}">
        <i class="trep-rail__fill" style="width:${at(x.est)}"></i>
        <i class="trep-rail__tick trep-rail__tick--lg" style="left:${at(x.lg)}" title="Średnia ligi"></i>
        <i class="trep-rail__tick trep-rail__tick--top" style="left:${at(x.top3)}" title="Czołowa trójka"></i>
      </span>
      <span class="trep-unit__v"><b>${esc(x.text)}</b>${exact(x) ? `<small>ocena ${esc(num(x.est))}, liga ${esc(num(x.lg))}, czołówka ${esc(num(x.top3))}</small>` : x.prec === 'approx' ? `<small>ocena ok. ${Math.round(x.est)}</small>` : ''}${x.trend ? `<small class="trep-trend" data-d="${x.trend > 0 ? 'up' : 'down'}">${x.trend > 0 ? 'lepiej' : 'gorzej'} niż w poprzednim raporcie</small>` : ''}</span>
    </li>`).join('');
  return `<section class="trep-units" aria-labelledby="trep-units-h">
    <header class="trep-units__head"><h3 id="trep-units-h">Siła formacji na tle ligi</h3>
      <p class="trep-legend"><span><i class="trep-key trep-key--fill"></i>nasza ocena</span><span><i class="trep-key trep-key--lg"></i>średnia ligi</span><span><i class="trep-key trep-key--top"></i>czołowa trójka</span></p></header>
    <ul class="trep-units__list">${rows}</ul>
    <p class="arep-note">Zawodnicy dostępni teraz (bez kontuzjowanych i pauzujących), ten sam układ dla wszystkich klubów ${esc(String(u.n))}-zespołowej ligi.</p>
    ${sign(u)}
  </section>`;
}

function formHtml(form) {
  if (!form.length) return '';
  return `<p class="trep-form" aria-label="Ostatnie mecze">${form.map((r) => `<span class="trep-form__r" data-r="${esc(r)}" title="${esc(RES_WORD[r])}">${esc(r)}</span>`).join('')}<small>ostatnie mecze, od najstarszego</small></p>`;
}

function depthHtml(d) {
  const who = (x, starter) => `<span class="trep-who${x.out ? ' is-out' : ''}">${esc(x.name)}${x.val != null ? ` <small>${esc(num(x.val))}</small>` : !starter && x.w ? ` <small>${esc(x.w)}</small>` : ''}${x.out ? ' <small>(niedostępny)</small>' : ''}</span>`;
  return `<div class="trep-depth" role="table" aria-label="Głębia składu">
    <div class="trep-depth__row trep-depth__row--head" role="row"><span role="columnheader">Pozycja</span><span role="columnheader">Podstawowy</span><span role="columnheader">Zmiennicy</span></div>
    ${d.rows.map((r) => `<div class="trep-depth__row" role="row"${r.gap ? ' data-gap="1"' : ''}>
      <span role="cell" class="trep-depth__pos"><span class="arep-pos">${esc(r.pos)}</span><small>${esc(r.label)}</small></span>
      <span role="cell" class="trep-depth__st">${r.starters.map((x) => who(x, true)).join('') || '<span class="muted">nikt nie jest ustawiony</span>'}</span>
      <span role="cell" class="trep-depth__bk">${r.backups.map((x) => who(x, false)).join('') || '<span class="muted">brak</span>'}${r.note ? `<em class="trep-gap">Luka: ${esc(r.note)}</em>` : ''}</span>
    </div>`).join('')}
  </div>`;
}

function rivalsHtml(rv) {
  if (!rv.rows.length) return '<p class="muted">Brak zaplanowanych meczów o stawkę.</p>';
  return `<ul class="trep-rivals">${rv.rows.map((x) => `<li data-t="${esc(x.tone)}">
      <span class="trep-rivals__when">${esc(fmtDate(x.date))}<small>${esc(x.home ? 'u siebie' : 'na wyjeździe')}</small></span>
      <span class="trep-rivals__who"><b>${esc(x.name)}</b><small>${esc(x.comp)}${x.pos ? `, ${esc(String(x.pos))}. miejsce` : ''}${x.form?.length ? `, forma ${esc(x.form.join(''))}` : ''}</small></span>
      <span class="trep-rivals__v">${esc(x.verdict)}${x.diff != null ? ` <small>(${x.diff > 0 ? '+' : ''}${esc(num(x.diff))})</small>` : ''}</span>
    </li>`).join('')}</ul>`;
}

function authorsHtml(r) {
  return `<div class="trep-authors">${r.authors.map((a) => `<div class="trep-author">
      <span class="trep-author__who"><b>${esc(a.name)}</b><small>${esc(a.title)}, ${esc(a.label.toLowerCase())} (${esc(String(a.q))})</small></span>
      <dl class="trep-author__attrs">${a.attrs.map((x) => `<div><dt>${esc(x.l)}</dt><dd>${esc(String(x.v))}</dd></div>`).join('')}</dl>
    </div>`).join('')}</div>`;
}

/** Miejsce formacji krótko, z dokładnością tamtego raportu (do tabeli porównania). */
function shortRank(x) {
  if (!x) return 'brak danych';
  if (x.prec === 'exact') return `${x.rank}.`;
  if (x.prec === 'approx') return `${Math.max(1, x.rank - 1)}.-${Math.min(x.n, x.rank + 1)}.`;
  return x.text;
}

/** Wybór raportu z archiwum (3 ostatnie). */
function archiveNav(list, sel) {
  if (list.length < 2) return '';
  return `<nav class="trep-arch" aria-label="Archiwum raportów"><span class="trep-arch__k">Archiwum</span><div class="chips chips--wrap" role="group">${list.map((x, i) => `<button class="chip" data-act="trep-sel" data-i="${i}" aria-pressed="${i === sel}">${esc(fmtDate(x.date))}${i === 0 ? ', najnowszy' : ''}</button>`).join('')}</div></nav>`;
}

/** Porównanie kluczowych liczb w raportach z archiwum (od najstarszego). */
function compareHtml(list) {
  if (list.length < 2) return '';
  const cols = [...list].reverse();
  const unit = (r, k) => shortRank(r.units?.rows?.find((x) => x.k === k));
  const rows = [
    ['Miejsce w lidze', (r) => (r.results?.pos && r.results?.played ? `${r.results.pos}.${r.results.pts != null ? ` (${r.results.pts} pkt)` : ''}` : 'przed startem ligi')],
    ['Forma', (r) => (r.results?.form?.length ? r.results.form.join(' ') : 'brak meczów')],
    ...['GK', 'DEF', 'MID', 'ATT'].map((k) => [cols[0].units?.rows?.find((x) => x.k === k)?.label ?? k, (r) => unit(r, k)]),
    ['Zgranie', (r) => (r.tactics?.cohLabel ?? 'brak danych').toLowerCase()],
    ['Pewność raportu', (r) => r.confidence?.word ?? 'brak danych'],
  ];
  return `<section class="arep-card trep-card trep-card--cmp" data-t="misc" aria-labelledby="trep-cmp">
    <header class="arep-card__head"><h3 id="trep-cmp">Porównanie raportów</h3></header>
    <div class="trep-cmp"><table>
      <thead><tr><th scope="col">Stan na</th>${cols.map((r) => `<th scope="col">${esc(fmtDate(r.date))}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([k, f]) => `<tr><th scope="row">${esc(k)}</th>${cols.map((r) => `<td>${esc(f(r))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <p class="arep-note">Miejsca formacji w lidze z dokładnością każdego raportu: liczba przy wysokiej pewności, przedział przy średniej, słowa przy niskiej.</p>
  </section>`;
}

/** Ekran raportu (HTML). msg: komunikat po kliknięciu „Poproś o nowy raport”; sel: raport z archiwum (0 = najnowszy). */
export function renderTeamReport(game, { msg = '', sel = 0 } = {}) {
  const st = ensureTeamReport(game);
  const can = canRequest(game);
  const reqBtn = `<button class="btn ${st.cur ? 'btn--quiet' : 'btn--primary'}" data-act="trep-req"${can.ok ? '' : ' disabled'}>Poproś o nowy raport</button>`;
  const reqNote = can.ok ? '' : `<small class="muted">Kolejny raport na prośbę najwcześniej ${esc(fmtDate(can.from))}.</small>`;
  const note = msg ? `<p class="notice" role="status">${esc(msg)}</p>` : '';
  const list = reportList(game);
  const i = list[sel] ? sel : 0;
  const r = list[i] ?? null;
  if (!r) {
    return `<div class="arep trep trep--empty">${note}
      <section class="trep-intro">
        <h2>Raport ogólny o drużynie</h2>
        <p>Asystent i główny analityk co miesiąc oceniają drużynę: siłę formacji na tle ligi, wyniki i grę, styl, stałe fragmenty, głębię składu, zdrowie, młodych i najbliższych rywali. Raport przychodzi od 3. dnia miesiąca, a o dodatkowy możesz poprosić co 14 dni.</p>
        <p class="muted">Dokładność zależy od sztabu: asystenta (ocena zawodników, analiza taktyczna), analityka (analiza danych, analiza wideo) oraz trenerów bramkarzy, przygotowania fizycznego i młodzieży.</p>
        <div class="trep-req">${reqBtn}${reqNote}</div>
      </section>
    </div>`;
  }
  return `<div class="arep trep" data-prec="${esc(r.confidence.prec)}">${note}
    ${archiveNav(list, i)}
    ${i > 0 ? `<p class="notice">Raport archiwalny z ${esc(fmtDate(r.date))}: stan drużyny mógł się od tego czasu zmienić.</p>` : ''}
    <header class="trep__head">
      <div class="trep__title">
        <h2>Raport ogólny o drużynie</h2>
        <p class="muted">${esc(r.kind === 'request' ? 'Raport na prośbę trenera' : 'Raport miesięczny')}, stan na <time datetime="${esc(r.date)}">${esc(fmtDate(r.date))}</time></p>
      </div>
      <div class="arep__conf" data-prec="${esc(r.confidence.prec)}" role="img" aria-label="Pewność raportu: ${esc(r.confidence.word)}">
        <span class="arep__conf-k">Pewność raportu</span>
        <span class="arep__conf-v"><b>${esc(r.confidence.word)}</b>${dots(r.confidence.prec)}</span>
      </div>
      <div class="trep-req">${reqBtn}${reqNote}</div>
    </header>
    ${authorsHtml(r)}
    <p class="arep__summary">${esc(r.summary)}</p>
    <section class="arep-card trep-card trep-card--recs" data-t="${esc(r.recs[0]?.tone ?? 'info')}" aria-labelledby="trep-recs">
      <header class="arep-card__head"><h3 id="trep-recs">Zalecenia</h3></header>
      ${recsHtml(game, r.recs)}
    </section>
    ${unitsHtml(r.units)}
    ${compareHtml(list)}
    <div class="arep__grid">
      ${card('results', 'Wyniki i gra', `${formHtml(r.results.form)}${lines(r.results.lines)}`, r.results, { tone: 'info' })}
      ${card('tactics', 'Styl i taktyka', lines(r.tactics.lines), r.tactics, { tone: 'misc', extra: r.tactics.by2 })}
      ${card('setpieces', 'Stałe fragmenty', lines(r.setPieces.lines), r.setPieces, { tone: r.setPieces.weak ? 'warn' : 'info' })}
      ${card('health', 'Zdrowie i obciążenia', lines(r.health.lines), r.health, { tone: r.health.injured >= 4 || r.health.risky >= 4 ? 'bad' : r.health.injured || r.health.risky ? 'warn' : 'good' })}
      ${card('youth', 'Młodzi i rozwój', lines(r.youth.lines), r.youth, { tone: 'good' })}
      ${card('rivals', 'Najbliżsi rywale', rivalsHtml(r.rivals), r.rivals, { tone: 'info' })}
    </div>
    ${card('depth', 'Głębia składu', depthHtml(r.depth), r.depth, { tone: r.depth.gaps.length ? 'warn' : 'good', wide: true })}
    <p class="arep-note">Raport to opinia sztabu, nie pewnik: słabszy sztab częściej myli kolejność, przegapia luki i mówi ogólnie. Raport o zawodniku: prawy przycisk albo przytrzymanie na zawodniku, Raport asystenta.</p>
  </div>`;
}
