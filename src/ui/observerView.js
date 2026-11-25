// Raport obserwatora (docs/raport-obserwatora.md): okno zlecenia i widok raportu o zawodniku innej drużyny, lista
// „Obserwacje” (Transfery, Skauting) i krótki stan w karcie i profilu zawodnika. Dane: src/career/observerReport.js.
// Pełna strona w bieżącej zakładce (state.obs), powrót przyciskiem „Wróć” (obs-back). Akcje obs-* obsługuje app.js.
// Raport pokazuje tylko to, co widział obserwator (przedziały i słowa), nigdy swojej dokładności.
import { esc, fmtDate } from './dom.js';
import { GROUP } from '../career/squad.js';
import { ATTRS, POS_NAMES } from '../data/attributes.js';
import { NAT_NAMES } from '../data/names.js';
import { anyClub } from '../season/season.js';
import { fmtZl } from '../career/transfers.js';
import {
  OBS, OBS_MODES, REC, VERDICTS, orderQuote, activeOrderFor, orderStatusText, observeMenuInfo, observeList, clubAndLeague, periodOnly,
} from '../career/observerReport.js';

const FOOT = { L: 'lewa', P: 'prawa', LP: 'obie' };
const TONE = { up: 'good', rot: 'info', dev: 'misc', no: 'bad' };
const REC_TONE = { take: 'good', watch: 'warn', skip: 'bad' };
const ICONS = {
  up: '<path d="M12 20V6M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  rot: '<path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  dev: '<path d="M12 21v-9M12 12C12 7 8 5 4 5c0 4 3 7 8 7zM12 14c0-4 3-6 8-6 0 4-3 6-8 6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  no: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M6.5 17.5l11-11" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  x: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  bench: '<path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
};
const svgI = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
const num1 = (v) => (v == null ? '-' : Number(v).toFixed(1).replace('.', ','));
const posBadge = (pos, cls = '') => `<span class="pos${cls ? ` ${cls}` : ''}" data-g="${GROUP[pos] ?? 'MID'}">${esc(pos)}</span>`;
const attrName = (k) => ATTRS[k]?.name ?? k;
const clubName = (id) => anyClub(id)?.name ?? id ?? '';
const plMatches = (n) => `${n} ${n === 1 ? 'mecz' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'mecze' : 'meczów'}`;
const plYears = (n) => `${n} ${n === 1 ? 'rok' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'lata' : 'lat'}`;
const tone = (mid) => (mid >= 15 ? 'good' : mid >= 11 ? 'mid' : 'low');

const card = (id, title, body, { t = 'info', sub = '' } = {}) => `<section class="obs-card" data-t="${t}" aria-labelledby="obs-${id}">
    <div class="obs-card__head"><h3 id="obs-${id}">${esc(title)}</h3>${sub ? `<span class="obs-card__sub">${esc(sub)}</span>` : ''}</div>
    ${body}
  </section>`;
const lines = (list) => (list?.length ? list.map((x) => `<p class="obs-txt">${esc(x)}</p>`).join('') : '');

// ------------------------------------------------------------ Wykresy

/** Pasek zakresu na skali 1-20 (szerokość: pełne punkty skali w przedziale); me: nasza dokładna wartość (romb). */
function rangeRow(label, r, { me = null, meName = '', cmp = false } = {}) {
  if (r.none) {
    return `<li class="obs-rb is-none${cmp ? ' obs-rb--cmp' : ''}"><span class="obs-rb__k">${esc(label)}</span><span class="obs-rb__track" role="img" aria-label="${esc(`${label}: brak danych`)}">${me != null ? `<i class="obs-rb__me" style="--p:${me}"></i>` : ''}</span><span class="obs-rb__v">brak danych${me != null ? `<small>${esc(`${meName} ${me}`)}</small>` : ''}</span></li>`;
  }
  const mid = (r.lo + r.hi) / 2;
  const t = me == null ? tone(mid) : r.lo > me ? 'good' : r.hi < me ? 'low' : 'mid';
  const word = me == null ? '' : r.lo > me ? 'lepszy' : r.hi < me ? 'słabszy' : 'podobny';
  const aria = me == null ? `${label} od ${r.lo} do ${r.hi} w skali 1-20` : `${label}: ${meName} ${me}, obserwowany od ${r.lo} do ${r.hi}`;
  return `<li class="obs-rb${cmp ? ' obs-rb--cmp' : ''}" data-tone="${t}"><span class="obs-rb__k">${esc(label)}${word ? `<span class="obs-rb__cmp">${esc(word)}</span>` : ''}</span>
    <span class="obs-rb__track" role="img" aria-label="${esc(aria)}"><i class="obs-rb__fill" style="--a:${r.lo - 1};--w:${r.hi - r.lo + 1}"></i>${me != null ? `<i class="obs-rb__me" style="--p:${me}"></i>` : ''}</span>
    <span class="obs-rb__v">${r.lo}-${r.hi}${me != null ? `<small>${esc(`${meName} ${me}`)}</small>` : ''}</span></li>`;
}
const scaleRow = (cls = '') => `<div class="obs-scale${cls}" aria-hidden="true"><span>1</span><span>5</span><span>10</span><span>15</span><span>20</span></div>`;

/** Pasek kwoty (rynek): przedział na skali od 0 do max. */
function moneyRow(label, [lo, hi], max) {
  const a = lo / max * 20; const b = hi / max * 20;
  return `<li class="obs-rb" data-tone="mid"><span class="obs-rb__k">${esc(label)}</span><span class="obs-rb__track" role="img" aria-label="${esc(`${label} od ${fmtZl(lo)} do ${fmtZl(hi)}`)}"><i class="obs-rb__fill" style="--a:${a.toFixed(2)};--w:${Math.max(0.3, b - a).toFixed(2)}"></i></span><span class="obs-rb__v">${esc(`${fmtZl(lo)}-${fmtZl(hi)}`)}</span></li>`;
}

/** Profil w sześciu grupach cech: wycinki od dolnej do górnej wartości zakresu (SVG). */
function radarSvg(groups) {
  const CX = 180; const CY = 168; const R = 100; const R0 = 18; const HALF = 27;
  const rad = (d) => d * Math.PI / 180;
  const rr = (v) => R0 + (v / 20) * (R - R0);
  const pt = (r, d) => `${(CX + r * Math.cos(rad(d))).toFixed(1)} ${(CY + r * Math.sin(rad(d))).toFixed(1)}`;
  const wedge = (r1, r2, d1, d2) => `M${pt(r2, d1)} A${r2.toFixed(1)} ${r2.toFixed(1)} 0 0 1 ${pt(r2, d2)} L${pt(r1, d2)} A${r1.toFixed(1)} ${r1.toFixed(1)} 0 0 0 ${pt(r1, d1)} Z`;
  let svg = [5, 10, 15, 20].map((v) => `<circle class="obs-radar__ring" cx="${CX}" cy="${CY}" r="${rr(v).toFixed(1)}"/>`).join('');
  const descr = [];
  groups.forEach((g, i) => {
    const c = -90 + i * 60; const d1 = c - HALF; const d2 = c + HALF;
    svg += `<path class="obs-radar__sec${g.none ? ' is-none' : ''}" d="${wedge(R0, R, d1, d2)}"/>`;
    if (!g.none) svg += `<path class="obs-radar__rng" data-tone="${tone((g.lo + g.hi) / 2)}" d="${wedge(rr(g.lo - 1), rr(g.hi), d1, d2)}"/>`;
    const lr = R + 14; const lx = CX + lr * Math.cos(rad(c)); const ly = CY + lr * Math.sin(rad(c));
    const anchor = Math.abs(Math.cos(rad(c))) < 0.2 ? 'middle' : Math.cos(rad(c)) > 0 ? 'start' : 'end';
    const above = Math.sin(rad(c)) < -0.5; const below = Math.sin(rad(c)) > 0.5;
    const ty = ly + (above ? -12 : below ? 8 : -2);
    const txt = g.none ? 'brak danych' : `${g.lo}-${g.hi}`;
    svg += `<text class="obs-radar__t" x="${lx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}">${esc(g.label)}</text><text class="obs-radar__s" x="${lx.toFixed(1)}" y="${(ty + 14).toFixed(1)}" text-anchor="${anchor}">${esc(txt)}</text>`;
    descr.push(`${g.label} ${txt}`);
  });
  return `<svg class="obs-radar" viewBox="0 0 360 340" role="img" aria-label="${esc(`Profil w grupach cech, skala 1-20: ${descr.join(', ')}`)}">${svg}</svg>`;
}

const formBand = (r) => (r >= 7.5 ? 'top' : r >= 6.8 ? 'good' : r >= 6 ? 'mid' : 'low');
const gameOpp = (g) => (g.opp ? `${clubName(g.opp)} (${g.home ? 'dom' : 'wyjazd'})` : g.label ?? '');
const SKIP_TXT = { injury: 'kontuzja', bench: 'ławka, 0 min', susp: 'pauza za kartki' };
const fmtShort = (iso) => fmtDate(iso).replace(/ \d{4}$/, ''); // „12 sie” pod słupkiem

/** Forma z obejrzanych meczów: słupki ocen, pominięte mecze zakreskowane, linia średniej naszego najlepszego. */
function formChart(games, ref) {
  const list = games.slice(-8);
  const YMIN = 4.5; const YMAX = 9.5; const H = 150;
  const hp = (r) => Math.max(4, (r - YMIN) / (YMAX - YMIN) * 100);
  const yAxis = [6, 7, 8, 9].map((v) => `<span style="bottom:${hp(v).toFixed(1)}%">${v}</span>`).join('');
  const cols = list.map((g) => {
    let plot; let lbl;
    if (g.k === 'seen') {
      plot = `<div class="obs-fm__bar" data-b="${formBand(g.r)}" style="--h:${hp(g.r).toFixed(1)}%"><b>${num1(g.r)}</b></div>`;
      const ga = `${g.g ? `<span class="obs-fm__ga">${g.g > 1 ? g.g : ''}G</span> ` : ''}${g.a ? `<span class="obs-fm__ga">${g.a > 1 ? g.a : ''}A</span>` : ''}`;
      lbl = `<b>${g.min ?? 90} min</b>${ga ? `<span>${ga}</span>` : ''}<span class="obs-fm__opp">${esc(gameOpp(g))}</span><span>${esc(fmtShort(g.d))}</span>`;
    } else {
      plot = `<div class="obs-fm__skip" data-k="${esc(g.k)}">${svgI(g.k === 'injury' ? 'x' : 'bench')}</div>`;
      lbl = `<b>${esc(SKIP_TXT[g.k] ?? 'nie zagrał')}</b><span class="obs-fm__opp">${esc(gameOpp(g))}</span><span>${esc(fmtShort(g.d))}</span>`;
    }
    return `<div class="obs-fm__col"><div class="obs-fm__plot">${plot}</div><div class="obs-fm__lbl">${lbl}</div></div>`;
  }).join('');
  const refLine = ref ? `<div class="obs-fm__ref" style="top:${((1 - hp(ref) / 100) * H).toFixed(1)}px"></div>` : '';
  const seen = list.filter((g) => g.k === 'seen');
  const aria = `Oceny z obejrzanych meczów: ${seen.map((g) => num1(g.r)).join(', ') || 'brak'}. Mecze pominięte: ${list.length - seen.length}.`;
  return `<div class="obs-fm" role="img" aria-label="${esc(aria)}" style="--n:${Math.max(1, list.length)}"><div class="obs-fm__y">${yAxis}</div>${cols}${refLine}</div>`;
}

/** Oś czasu zlecenia: obejrzane i pominięte mecze. */
function timeline(games) {
  const row = (g) => {
    const k = g.k === 'seen' ? 'seen' : g.k;
    const t = g.k === 'seen' ? `Obejrzany: ${gameOpp(g)}` : `Pominięty: ${SKIP_TXT[g.k] ?? 'nie zagrał'}`;
    const s = g.k === 'seen' ? [`${g.min ?? 90} min`, `ocena ${num1(g.r)}`, g.g ? `gole: ${g.g}` : '', g.a ? `asysty: ${g.a}` : ''].filter(Boolean).join(', ') : g.k === 'injury' ? 'Licznik stoi, mecze liczą się od powrotu' : 'Mecz się nie liczy';
    return `<li data-k="${esc(k)}"><span class="obs-tl__n">${svgI(g.k === 'seen' ? 'check' : g.k === 'injury' ? 'x' : 'bench')}</span><span class="obs-tl__t"><span class="obs-tl__d">${esc(fmtDate(g.d))}</span><b>${esc(t)}</b><small>${esc(s)}</small></span></li>`;
  };
  return games.length ? `<ol class="obs-tl">${games.map(row).join('')}</ol>` : '<p class="obs-note">Jeszcze bez meczów.</p>';
}

const pips = (n, on, t) => `<span class="obs-pips" data-t="${t}" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i${i < on ? ' class="on"' : ''}></i>`).join('')}</span>`;

// ------------------------------------------------------------ Raport

/** Raport obserwatora (HTML). ui: { pid, i } (i: numer raportu w historii, domyślnie ostatni). */
export function renderObserverReport(game, ui = {}) {
  const p = game.world.players[ui.pid];
  const list = game.observe?.reports?.[ui.pid] ?? [];
  const idx = Number.isInteger(ui.i) && list[ui.i] ? ui.i : list.length - 1;
  const r = list[idx];
  if (!r) return `<div class="obs"><button class="btn btn--quiet" data-act="obs-back">Wróć</button><p class="obs-note">Nie ma raportu o tym zawodniku.</p></div>`;
  const s = r.snap;
  const stale = game.date > r.until;
  const daysLeft = Math.max(0, Math.round((Date.parse(`${r.until}T12:00:00Z`) - Date.parse(`${game.date}T12:00:00Z`)) / 864e5));
  const mode = r.mode === 'period' ? `okres ${r.weeks} tyg.` : r.mode === 'match' ? 'zlecenie na 1 mecz' : `zlecenie na ${plMatches(r.n)}`;
  const vt = r.role.verdict;
  // 1. Nagłówek
  const authors = [
    [`${r.authors.observer}, ${r.authors.observerKind === 'scout' ? 'skaut' : 'asystent trenera'}`, 'profil, mocne i słabe strony, forma'],
    [`${r.authors.assistant}, asystent trenera`, 'rola u nas, porównanie z kadrą'],
    ...(r.authors.analyst ? [[`${r.authors.analyst}, analityk`, 'liczby z wideo, statystyki']] : []),
    [r.authors.director ? `${r.authors.director}, dyrektor sportowy` : 'Bez dyrektora sportowego', 'rynek, rekomendacja'],
  ];
  const head = `<header class="obs-head" data-pid="${esc(r.pid)}">
    <div class="obs-head__top">
      ${posBadge(s.pos, 'obs-head__pos')}
      <div class="obs-head__who"><h2 id="obs-h" tabindex="-1">${esc(s.name)}</h2><p>${esc(`Raport obserwatora z ${fmtDate(r.date)}, ${s.league}, ${mode}`)}</p></div>
      <div class="obs-head__sum" aria-label="Wynik raportu w skrócie">
        <span class="obs-chip" data-t="${TONE[vt]}">${svgI(vt)}${esc(VERDICTS[vt])}</span>
        <span class="obs-chip" data-t="${REC_TONE[r.rec]}">${svgI('eye')}${esc(REC[r.rec].charAt(0).toUpperCase() + REC[r.rec].slice(1))}</span>
      </div>
    </div>
    <ul class="obs-authors">${authors.map(([a, b]) => `<li><b>${esc(a)}</b><small>${esc(b)}</small></li>`).join('')}</ul>
    <div class="obs-facts">
      <span>${r.form?.noMatches ? `Obserwacja: <b>${esc(`okres ${r.weeks} tyg.`)}</b>` : `Obejrzano <b>${esc(r.mode === 'period' ? plMatches(r.watched) : `${r.watched} z ${plMatches(r.n)}`)}</b>`}</span>
      <span>Rozgrywki: <b>${esc(s.league)}</b></span>
      <span>Okres: <b>${esc(`${fmtDate(r.start)} - ${fmtDate(r.date)}`)}</b></span>
    </div>
    ${stale ? `<div class="obs-valid is-stale">${pips(5, 0, 'none')}<span>${esc(`Raport z ${fmtDate(r.date)}, nieaktualny. Minęło ponad ${OBS.valid} dni, forma, kontrakt i cena mogły się zmienić. Zleć nowy raport.`)}</span></div>`
      : `<div class="obs-valid">${pips(5, Math.ceil(daysLeft / (OBS.valid / 5)), 'good')}<span>${esc(`Raport ważny do ${fmtDate(r.until)}, potem oznaczymy go jako nieaktualny`)}</span></div>`}
    ${[...r.lines.head, r.lines.intro].map((x) => `<p class="obs-txt">${esc(x)}</p>`).join('')}
  </header>`;
  // 2. Profil
  const posHtml = [posBadge(s.pos, 'obs-pp obs-pp--main'), ...(s.alt ?? []).map((x) => `<span class="obs-pp">${esc(x)}</span>`)].join('');
  const kv = [
    ['Wiek', plYears(s.age)], ['Pozycje', null, posHtml], ['Noga', FOOT[s.foot] ?? 'brak danych'], ['Narodowość', NAT_NAMES[s.nat] ?? s.nat ?? 'brak danych'],
    ['Klub', s.club], ['Kontrakt do', s.until ? fmtDate(s.until) : 'bez kontraktu'],
  ];
  const profile = card('prof', 'Profil', `<dl class="obs-kv">${kv.map(([k, v, html]) => `<div><dt>${esc(k)}</dt><dd>${html ?? esc(v)}</dd></div>`).join('')}</dl>${lines(r.lines.profile)}`);
  // 3. Mocne i słabe strony
  const shown = r.attrs.filter((a) => !a.none).length;
  const chipList = (xs, empty) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(attrName(x.k))} <small>${esc(x.word)}</small></li>`).join('')}</ul>` : `<p class="obs-note">${esc(empty)}</p>`);
  const sides = card('str', 'Mocne i słabe strony', `<div class="obs-sw">
      <div data-t="good"><h4>Mocne strony</h4>${chipList(r.words.strong, 'Nic nie wyróżnia się na plus.')}</div>
      <div data-t="warn"><h4>Słabe strony</h4>${chipList(r.words.weak, 'Słabych stron nie zauważył.')}</div>
    </div>
    ${lines(r.lines.sides)}
    <div class="obs-s3">
      <div class="obs-sub"><h4>Profil w sześciu grupach cech</h4>${radarSvg(r.groups)}<p class="obs-note">Każdy wycinek sięga od dolnej do górnej wartości zakresu w skali 1-20.</p></div>
      <div class="obs-sub"><h4>Przedziały cech</h4>
        <ul class="obs-rbs">${r.attrs.slice(0, Math.max(12, shown)).map((a) => rangeRow(attrName(a.k), a)).join('')}</ul>
        ${scaleRow()}
        <ul class="obs-legend"><li><i class="obs-lg-bar"></i>przedział, w którym według obserwatora mieści się cecha</li><li><i class="obs-lg-none"></i>brak danych</li></ul>
      </div>
    </div>`, { t: 'good', sub: `${shown} z ${r.attrs.length} cech opisanych, reszta to brak danych` });
  // 4. Forma
  const f = r.form;
  const ref = r.role.our && game.world.players[r.role.our.id]?.season?.rating > 0 ? game.world.players[r.role.our.id].season.rating : null;
  const trendTxt = r.stage === 'one' ? '' : f.trend > 0 ? '▲ zwyżka' : f.trend < 0 ? '▼ spadek' : '► stabilna';
  const form = f.noMatches ? card('form', 'Forma', `<div class="obs-sub">${lines(f.lines)}</div>`, { sub: `Okres: ${r.weeks} tyg.` }) : card('form', 'Forma i statystyki z obejrzanych meczów', `<div class="obs-form">
      <div class="obs-sub">
        <div class="obs-fm__head"><span class="obs-fm__avg">${esc(`śr. ${f.rating == null ? '-' : num1(f.rating)}`)}</span>${trendTxt ? `<span class="obs-fm__trend" data-d="${f.trend}">${esc(trendTxt)}</span>` : ''}<span class="obs-note">${esc(`${plMatches(r.watched)}, ${f.minutes} min, gole: ${f.goals}, asysty: ${f.assists}`)}</span></div>
        ${formChart(f.games, ref)}
        <ul class="obs-legend">${ref ? `<li><i class="obs-lg-dash"></i>${esc(`nasz najlepszy ${s.pos}, ${r.role.our.name}, średnia ${num1(ref)}`)}</li>` : ''}<li>G gol, A asysta</li></ul>
        ${lines(f.lines)}
      </div>
      <div class="obs-sub"><h4>Kolejne mecze zlecenia</h4>
        <span class="obs-valid">${pips(Math.min(6, Math.max(r.n || 0, r.watched, 1)), r.watched, 'info')}<span>${esc(`${plMatches(r.watched)} się liczy`)}</span></span>
        ${timeline(f.games)}
        <p class="obs-note">Mecz z kontuzją albo z ławką bez minut nie zwiększa licznika. Po ${OBS.benchRun} takich ławkach raport pisze, że zawodnik nie ma regularnej gry.</p>
      </div>
    </div>`, { sub: r.mode === 'period' ? `Okres: ${r.weeks} tyg.` : `Licznik: ${r.watched} z ${plMatches(r.n)}` });
  // 5, 6. Zdrowie i charakter
  const h = r.health;
  const health = card('zdr', 'Zdrowie', `<ul class="obs-words">
      <li><span>Teraz</span><b>${esc(h.now ? `kontuzja, jeszcze ok. ${h.now} dni` : 'zdrowy')}</b></li>
      <li><span>W czasie obserwacji</span><b>${esc(h.during ? `pauzował przez uraz (${plMatches(h.during)})` : 'bez przerw')}</b></li>
      <li data-t="${h.risk === 'wysokie' ? 'bad' : h.risk === 'umiarkowane' ? 'warn' : 'good'}"><span>Ryzyko</span><b>${esc(h.risk)}</b></li>
    </ul>${lines(h.lines)}`, { t: 'warn' });
  const ch = r.character;
  const charCard = card('men', 'Mentalność i osobowość', `${ch.open ? `<ul class="obs-words">${ch.rows.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join('')}</ul>` : ''}${lines(ch.lines)}`, { t: 'misc', sub: `dostępne od ${OBS.persona.matches} meczów lub ${OBS.persona.weeks} tygodni` });
  // 7. Rola u nas
  const our = r.role.our;
  const cmp = our && r.role.cmp.length ? `<div class="obs-sub"><h4>Kluczowe cechy pozycji: nasz najlepszy i obserwowany</h4>
      <ul class="obs-rbs">${r.role.cmp.map((c) => rangeRow(attrName(c.k), c, { me: c.our, meName: our.name.split(' ').slice(-1)[0], cmp: true })).join('')}</ul>
      ${scaleRow(' obs-scale--cmp')}
      <ul class="obs-legend"><li><i class="obs-lg-me"></i>${esc(`${our.name} (nasza dokładna wartość)`)}</li><li><i class="obs-lg-bar"></i>${esc(`${s.last ?? s.name} (przedział obserwatora)`)}</li></ul>
    </div>` : '';
  const role = card('rola', 'Rola u nas', `${cmp}<div class="obs-sub"><h4>Werdykt asystenta</h4>
      <ul class="obs-role" aria-label="${esc(`Werdykt: ${VERDICTS[vt].toLowerCase()}`)}">${Object.keys(VERDICTS).map((k) => `<li data-t="${TONE[k]}"${k === vt ? ' class="on" aria-current="true"' : ''}>${svgI(k)}<b>${esc(VERDICTS[k])}</b></li>`).join('')}</ul>
      <p class="obs-why">${esc(r.role.text)}</p></div>`, { sub: our ? `pozycja ${s.pos}, nasz najlepszy: ${our.name}, ${plYears(our.age)}` : `pozycja ${s.pos}, nie mamy nikogo na tej pozycji` });
  // 8, 9. Potencjał i rynek
  const pot = card('pot', 'Potencjał', `<p class="obs-txt">${esc(r.potential.text)}</p>${r.potential.young ? `<p class="obs-txt">${esc(`Perspektywa: poziom ok. ${r.potential.lo}-${r.potential.hi} w skali 1-20.`)}</p>` : ''}<p class="obs-note">Młodsi zawodnicy dostają szerszy opis potencjału.</p>`, { t: 'misc' });
  const m = r.market;
  const mMax = Math.max(1, ...(m.price ? [m.price[1] * 1.6] : [1]));
  const wMax = Math.max(1, ...(m.wage ? [m.wage[1] * 1.6] : [1]));
  const willTxt = m.will ?? (m.dir ? 'brak danych' : 'bez oceny (brak dyrektora sportowego)');
  const mkt = card('rynek', 'Rynek', `<dl class="obs-kv obs-kv--one">
      <div><dt>Umowa</dt><dd>${esc(m.until ? `do ${fmtDate(m.until)}${m.monthsLeft != null ? ` (jeszcze ${m.monthsLeft} mies.)` : ''}` : 'bez kontraktu')}</dd></div>
      ${m.loan ? `<div><dt>Wypożyczenie</dt><dd>${esc(`z klubu ${m.loan.from}${m.loan.option ? `, opcja wykupu ${fmtZl(m.loan.option)}` : ''}`)}</dd></div>` : ''}
      <div><dt>Szansa na przejście</dt><dd>${esc(willTxt)}</dd></div>
      ${m.free ? '<div><dt>Cena orientacyjna</dt><dd>bez kwoty transferowej</dd></div>' : m.nfs ? '<div><dt>Cena orientacyjna</dt><dd>klub nie sprzedaje</dd></div>' : ''}
    </dl>
    ${m.price || m.wage ? `<ul class="obs-rbs">${m.price ? moneyRow('Cena orientacyjna', m.price, mMax) : ''}${m.wage ? moneyRow('Pensja tygodniowo', m.wage, wMax) : ''}</ul>` : ''}
    ${lines(m.lines)}
    <p class="obs-note">${esc(m.dir ? 'Ceny orientacyjne.' : 'Bez dyrektora sportowego przedział jest szerszy.')}</p>`, { t: 'warn' });
  // 10. Rekomendacja
  const offerLabel = s.kind === 'free' ? 'Rozmawiaj o kontrakcie' : 'Złóż ofertę';
  const canOffer = p && p.clubId !== game.clubId;
  const prev = list.map((x, i) => ({ x, i })).filter(({ i }) => i !== idx).reverse();
  const recCard = card('rec', 'Rekomendacja', `<div class="obs-board" role="group" aria-label="${esc(`Rekomendacja: ${REC[r.rec]}`)}"><ul>${Object.keys(REC).map((k) => `<li${k === r.rec ? ' class="on" aria-current="true"' : ''}><span>${esc(REC[k])}</span></li>`).join('')}</ul></div>
    <p class="obs-txt">${esc(r.recText)}</p>
    <div class="obs-actions">${canOffer ? `<button class="btn btn--primary" data-act="obs-offer" data-id="${esc(r.pid)}">${esc(offerLabel)}</button>` : ''}${p && p.clubId !== game.clubId ? `<button class="btn btn--quiet" data-act="obs-order" data-id="${esc(r.pid)}">Nowa obserwacja</button>` : ''}</div>
    <div class="obs-prev"><h4>Poprzednie raporty</h4>${prev.length ? `<ul>${prev.map(({ x, i }) => `<li><button class="obs-link" data-act="obs-open" data-id="${esc(r.pid)}" data-i="${i}">${esc(`${fmtDate(x.date)}, ${x.authors.observer}, ${REC[x.rec]}${game.date > x.until ? ', nieaktualny' : ''}`)}</button></li>`).join('')}</ul>` : '<p class="obs-note">brak</p>'}</div>`, { t: REC_TONE[r.rec], sub: r.authors.director ? 'dyrektor sportowy' : 'zarząd' });
  return `<div class="obs${stale ? ' is-stale' : ''}" aria-labelledby="obs-h">
    <div class="obs-top"><button class="btn btn--quiet" data-act="obs-back">Wróć</button></div>
    ${head}${profile}${sides}${form}<div class="obs-two">${health}${charCard}</div>${role}<div class="obs-two">${pot}${mkt}</div>${recCard}
    <p class="obs-note">Raport opisuje stan z dnia obserwacji. Przedziały to ocena obserwatora, a nie dokładne wartości.</p>
  </div>`;
}

// ------------------------------------------------------------ Okno zlecenia

const MODE_TXT = {
  match: 'Skaut obejrzy najbliższy mecz, raport za 2 do 3 dni.',
  matches: 'Skaut jedzie na kolejne mecze, mniej więcej jeden co tydzień. Im więcej meczów, tym pełniejszy raport.',
  period: 'Skaut obserwuje zawodnika przez cały okres.',
};

/** Okno zlecenia obserwacji. ui: { pid, mode, n, weeks, who, msg }. Zlecenie w toku: stan i odwołanie. */
export function renderObserveOrder(game, ui = {}) {
  const p = game.world.players[ui.pid];
  if (!p) return '<div class="obs"><button class="btn btn--quiet" data-act="obs-back">Wróć</button><p class="obs-note">Nie ma takiego zawodnika.</p></div>';
  const { club, league } = clubAndLeague(game, p);
  const head = `<header class="obs-head obs-head--order" data-pid="${esc(p.id)}"><div class="obs-head__top">${posBadge(p.pos, 'obs-head__pos')}
    <div class="obs-head__who"><h2 id="obs-h" tabindex="-1">${esc(`Raport obserwatora: ${p.name}`)}</h2><p>${esc(`${POS_NAMES[p.pos] ?? p.pos}, ${club}, ${league}`)}</p></div></div></header>`;
  const msg = ui.msg ? `<p class="notice" role="status">${esc(ui.msg)}</p>` : '';
  const info = observeMenuInfo(game, p);
  const prevBtn = info.last ? `<p class="obs-note">${esc(`Ostatni raport z ${fmtDate(info.last.date)}${info.stale ? ', nieaktualny' : ''}.`)} <button class="obs-link" data-act="obs-open" data-id="${esc(p.id)}">Pokaż raport</button></p>` : '';
  const order = activeOrderFor(game, p.id);
  if (order) {
    const body = `<section class="obs-card" data-t="info"><div class="obs-card__head"><h3>Obserwacja w toku</h3><span class="obs-card__sub">${esc(order.observer.name)}</span></div>
      <p class="obs-txt">${esc(`${p.name}: ${orderStatusText(game, order)}.`)}</p>
      <p class="obs-note">${esc(`Zlecenie z ${fmtDate(order.start)}: ${order.mode === 'period' ? `okres ${order.weeks} tyg. (do ${fmtDate(order.end)})` : plMatches(order.n)}. Wygasa ${fmtDate(order.until)}.${order.cost ? ` Koszty wyjazdów: ${fmtZl(order.cost)}.` : ''}`)}</p>
      ${periodOnly(p) ? '' : timeline(order.games)}
      <div class="obs-actions"><button class="btn btn--quiet" data-act="obs-cancel" data-o="${esc(order.id)}">Odwołaj obserwację</button><button class="btn btn--quiet" data-act="obs-back">Wróć</button></div></section>`;
    return `<div class="obs obs--order" aria-labelledby="obs-h"><div class="obs-top"><button class="btn btn--quiet" data-act="obs-back">Wróć</button></div>${head}${msg}${body}${prevBtn}</div>`;
  }
  const q = orderQuote(game, p.id, { mode: ui.mode, n: ui.n, weeks: ui.weeks, who: ui.who });
  const o = q.order;
  const modes = Object.keys(OBS_MODES).filter((k) => !periodOnly(p) || k === 'period').map((k) => `<button class="obs-mode${o.mode === k ? ' is-on' : ''}" data-act="obs-mode" data-m="${k}" aria-pressed="${o.mode === k}"><b>${esc(OBS_MODES[k])}</b><small>${esc(MODE_TXT[k])}</small></button>`).join('');
  const chips = (act, from, to, cur, unit) => `<div class="obs-chips" role="group">${Array.from({ length: to - from + 1 }, (_, i) => from + i).map((v) => `<button class="obs-chipbtn${v === cur ? ' is-on' : ''}" data-act="${act}" data-v="${v}" aria-pressed="${v === cur}">${esc(`${v} ${unit(v)}`)}</button>`).join('')}</div>`;
  const extra = o.mode === 'matches' ? `<div class="obs-field"><span class="obs-field__k">Liczba meczów</span>${chips('obs-n', OBS.matches.min, OBS.matches.max, o.n, (v) => (v < 5 ? 'mecze' : 'meczów'))}</div>`
    : o.mode === 'period' ? `<div class="obs-field"><span class="obs-field__k">Długość okresu</span>${chips('obs-weeks', OBS.weeks.min, OBS.weeks.max, o.weeks, () => 'tyg.')}</div>` : '';
  const opts = q.options;
  const whoOpts = opts ? [...opts.scouts.map((x) => ({ id: x.id, label: `${x.name}, skaut${x.why ? ` (${x.why.replace(`${x.name} `, '')})` : ''}`, off: !!x.why })),
    ...(opts.assistant ? [{ id: 'asystent', label: `${opts.assistant.name}, asystent trenera${opts.assistant.why ? ' (zajęty)' : ''}`, off: !!opts.assistant.why }] : [])] : [];
  const cur = q.observer?.id ?? '';
  const who = `<div class="obs-field"><label class="obs-field__k" for="obs-who">Kto pojedzie</label>
    <select id="obs-who" data-obs="who">${whoOpts.map((x) => `<option value="${esc(x.id)}"${x.id === cur ? ' selected' : ''}${x.off ? ' disabled' : ''}>${esc(x.label)}</option>`).join('') || '<option value="">brak</option>'}</select>
    ${opts?.noScouts ? '<p class="obs-note">Nie masz skauta. Zatrudnisz go w Transfery, Skauting (wolni skauci) albo w sztabie. Bez skauta raport napisze asystent, bez opisu charakteru.</p>' : ''}</div>`;
  const facts = `<ul class="obs-words">
    <li><span>${esc(q.cost ? 'Koszt z podróżą' : 'Koszt')}</span><b>${esc(q.costText.replace(/^Koszt( z podróżą)?: /, ''))}</b></li>
    <li><span>Termin</span><b>${esc(q.ready ? `Raport będzie gotowy około ${fmtDate(q.ready)}` : 'Zależy od meczów zawodnika')}</b></li>
  </ul>`;
  const warn = q.warnings.length ? `<ul class="obs-warn">${q.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '';
  const err = q.errors.length ? `<ul class="obs-err" role="alert">${q.errors.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '';
  return `<div class="obs obs--order" aria-labelledby="obs-h"><div class="obs-top"><button class="btn btn--quiet" data-act="obs-back">Wróć</button></div>${head}${msg}
    <section class="obs-card" data-t="info"><div class="obs-card__head"><h3>Zlecenie</h3></div>
      <div class="obs-modes" role="group" aria-label="Tryb obserwacji">${modes}</div>
      ${extra}${who}${facts}${warn}${err}
      <div class="obs-actions"><button class="btn btn--primary" data-act="obs-go" data-id="${esc(p.id)}"${q.ok ? '' : ' disabled'}>Zleć raport</button><button class="btn btn--quiet" data-act="obs-back">Anuluj</button></div>
    </section>${prevBtn}</div>`;
}

// ------------------------------------------------------------ Stan w karcie i na liście

/** Krótki stan obserwacji w karcie i profilu zawodnika innej drużyny (pusty, gdy nic nie zlecono). */
export function observeStatusHtml(game, p) {
  if (!p || !game?.observe || p.clubId === game.clubId) return '';
  const info = observeMenuInfo(game, p);
  if (info.order) return `<p class="obs-status">${esc(`Obserwacja: ${info.statusText}.`)} <button class="obs-link" data-act="obs-order" data-id="${esc(p.id)}">Szczegóły</button></p>`;
  if (info.last) return `<p class="obs-status${info.stale ? ' is-stale' : ''}">${esc(`Raport obserwatora z ${fmtDate(info.last.date)}${info.stale ? ', nieaktualny' : ''}: ${REC[info.last.rec]}.`)} <button class="obs-link" data-act="obs-open" data-id="${esc(p.id)}">Pokaż raport</button></p>`;
  return '';
}

/** Lista „Obserwacje” (treść panelu w Transfery, Skauting): zlecenia w toku i raporty. { html, count } albo null. */
export function observeListHtml(game) {
  const L = observeList(game);
  if (!L.active.length && !L.done.length) return null;
  const act = L.active.map((x) => `<li data-pid="${esc(x.pid)}"><button class="obs-link" data-act="obs-order" data-id="${esc(x.pid)}">${esc(x.name)}</button><small>${esc(`${x.status} (${x.observer})`)}</small></li>`).join('');
  const done = L.done.slice(0, 12).map((x) => `<li data-pid="${esc(x.pid)}"${x.stale ? ' class="is-stale"' : ''}>${posBadge(x.pos)}<button class="obs-link" data-act="obs-open" data-id="${esc(x.pid)}">${esc(x.name)}</button><small>${esc(`${x.club}, ${fmtDate(x.date)}${x.stale ? ', nieaktualny' : ''}`)}</small><span class="obs-tag" data-t="${REC_TONE[x.rec]}">${esc(REC[x.rec])}</span></li>`).join('');
  const html = `<div class="obs-list">${act ? `<h4>W toku</h4><ul>${act}</ul>` : ''}${done ? `<h4>Raporty</h4><ul>${done}</ul>` : ''}</div>`;
  return { html, count: L.active.length + L.done.length };
}
