// Klub > Kariera: panel trenera (reputacja, popularność), gablota odznak, historia sezonów, rekordy, ścieżka klubów,
// trudne chwile (tylko tekst) i rynek pracy. Okno odblokowania nowej odznaki (mountUnlocks).
// Dane z careerSummary(game) i jobState(game) (src/career/coachCareer.js, jobMarket.js). Wygląd: src/styles/kariera.css.
// Akcje (prefiks k-): k-badge, k-bfilter, k-resign-ask, k-resign-no (stan widoku w klubView.js); job-apply, job-withdraw,
// job-resign, career-unlocks-seen obsługuje dispatchAct w app.js.

import { esc, fmtDate } from './dom.js';
import { crestHtml } from './crest.js';
import { clubById, CLUBS_PL } from '../data/clubs_pl.js';
import { BADGES, BADGE_GROUPS, badgeSvg, badgeAria, times, ensureBadgeSprite } from './badges.js';
import { careerSummary, pendingUnlocks } from '../career/coachCareer.js';
import { jobState } from '../career/jobMarket.js';

let clubsMap = null;
const clubsById = () => (clubsMap ??= new Map(CLUBS_PL.map((c) => [c.id, c])));
const crest = (id, size = 28) => {
  const c = id ? clubById(id) : null;
  return c ? crestHtml(c, { size, clubsById: clubsById() }) : '';
};

const ISO = /^\d{4}-\d{2}-\d{2}/;
/** Data z gry (ISO) po polsku, tekst bez daty bez zmian. */
const dt = (x) => (x ? (ISO.test(String(x)) ? fmtDate(String(x)) : String(x)) : '');
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const pct1 = (x) => String(Math.round(x * 100) / 100).replace('.', ',');
const arr = (x) => (Array.isArray(x) ? x : []);

// ---------- Wskaźniki 0 do 100 (linia boiska) ----------

function trendHtml(t, suffix) {
  if (t == null || t === '') return '';
  if (typeof t === 'number' || /^[+-]?\d+([.,]\d+)?$/.test(String(t))) {
    const v = Number(String(t).replace(',', '.'));
    if (!v) return `<span class="kr-trend">bez zmian ${esc(suffix)}</span>`;
    const up = v > 0;
    return `<span class="kr-trend kr-trend--${up ? 'up' : 'dn'}"><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${up ? '+' : '−'}${pct1(Math.abs(v))} ${esc(suffix)}</span>`;
  }
  const s = String(t);
  const up = !s.trim().startsWith('-');
  return `<span class="kr-trend kr-trend--${up ? 'up' : 'dn'}"><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${esc(s)}</span>`;
}

/** Miniwykres kilku serii (wartości 0 do 100). Mniej niż 2 punkty: podpowiedź zamiast wykresu. */
function spark(series, aria) {
  const n = Math.max(0, ...series.map((s) => s.vals.length));
  if (n < 2) return '<p class="kr-spark-empty muted">Wykres pojawi się po kolejnym sezonie.</p>';
  const all = series.flatMap((s) => s.vals);
  let lo = Math.min(...all); let hi = Math.max(...all);
  if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = mid - 5; hi = mid + 5; }
  const w = 200; const h = 40;
  const lines = series.map((s) => {
    const pts = s.vals.map((v, i) => `${(4 + (i * (w - 8)) / (s.vals.length - 1)).toFixed(1)},${(4 + (1 - (v - lo) / (hi - lo)) * (h - 8)).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" class="${s.cls}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  return `<svg class="kr-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(aria)}">${lines}</svg>`;
}

function meter({ lab, v, tier, trend, trendSuffix, extra = '', sparkHtml = '', compact = false }) {
  const val = Math.max(0, Math.min(100, Math.round(num(v))));
  return `<div class="kr-gauge${compact ? ' kr-gauge--compact' : ''}">
    <div class="kr-gauge__top"><span class="kr-gauge__lab">${esc(lab)}</span><span class="led" aria-hidden="true">${val}</span><span class="kr-gauge__tier">${esc(tier ?? '')}</span>${trendHtml(trend, trendSuffix)}</div>
    <div class="kr-gauge__bar" style="--v:${val}" role="meter" aria-label="${esc(lab)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${val}" aria-valuetext="${val} na 100${tier ? `, ${esc(tier)}` : ''}"><i></i></div>
    ${compact ? '' : '<div class="kr-gauge__ticks" aria-hidden="true"><span>0</span><span>50</span><span>100</span></div>'}
    ${extra}${sparkHtml}</div>`;
}

const reachText = (r) => (r == null || r === '' ? '' : typeof r === 'object' ? String(r.label ?? r.name ?? '') : String(r));

function heroHtml(S, J) {
  const initials = (S.name || 'T').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'T';
  const mt = S.matches ?? {};
  const seasons = arr(S.seasons);
  const sub = [S.age ? `${num(S.age)} lat` : null, seasons.length ? `${seasons.length} ${seasons.length === 1 ? 'sezon' : seasons.length < 5 ? 'sezony' : 'sezonów'} w zawodzie` : 'początek drogi', num(mt.n) ? `${num(mt.n)} ${num(mt.n) === 1 ? 'mecz' : 'meczów'}` : null].filter(Boolean).join(' · ');
  const clubLine = S.club
    ? `<p class="kr-club">${crest(S.club.id, 28)}<span>${esc(S.club.name)}</span><span class="kr-chip kr-chip--live">${esc(S.club.league ?? '')}</span></p>`
    : `<p class="kr-club"><span>Bez klubu</span>${J?.lastClub ? `<span class="kr-chip">ostatnio: ${esc(typeof J.lastClub === 'object' ? J.lastClub.name ?? '' : clubById(J.lastClub)?.name ?? J.lastClub)}</span>` : ''}</p>`;
  const rep = S.rep ?? {}; const pop = S.pop ?? {};
  const repHist = arr(rep.history).map((x) => num(x.value));
  const reach = reachText(rep.reach);
  const peak = rep.peak != null ? `Szczyt kariery: ${Math.round(num(rep.peak))}` : '';
  const repExtra = (reach || peak) ? `<p class="kr-gauge__note muted">${[peak, reach ? `Zasięg: ${reach}` : ''].filter(Boolean).map(esc).join(' · ')}</p>` : '';
  const fansH = arr(pop.history).map((x) => num(x.fans)); const mediaH = arr(pop.history).map((x) => num(x.media));
  const popSpark = `${spark([{ vals: fansH, cls: 'kr-line kr-line--a' }, { vals: mediaH, cls: 'kr-line kr-line--b' }], `Popularność w kolejnych sezonach: kibice od ${fansH[0]} do ${fansH.at(-1)}, media od ${mediaH[0]} do ${mediaH.at(-1)}`)}`;
  return `<section class="kr-hero" aria-label="Trener">
    <div class="kr-panel kr-id"><div class="kr-av" aria-hidden="true">${esc(initials)}</div>
      <div><p class="kr-kick">${S.unemployed ? 'Trener bez klubu' : 'Trener pierwszej drużyny'}</p><h3 class="kr-name">${esc(S.name)}</h3>
        <p class="muted">${esc(sub)}</p>${clubLine}</div></div>
    <div class="kr-panel">${meter({ lab: 'Reputacja', v: rep.value, tier: rep.label, trend: rep.trend, trendSuffix: 'w tym sezonie', extra: repExtra, sparkHtml: spark([{ vals: repHist, cls: 'kr-line kr-line--a' }], `Reputacja w kolejnych sezonach: od ${repHist[0]} do ${repHist.at(-1)}`) })}</div>
    <div class="kr-panel kr-pop"><h4 class="kr-pop__h">Popularność</h4>
      ${meter({ lab: 'Kibice', v: pop.fans, tier: pop.fansLabel, trend: pop.trendFans, trendSuffix: 'w ostatnim miesiącu', compact: true })}
      ${meter({ lab: 'Media', v: pop.media, tier: pop.mediaLabel, trend: pop.trendMedia, trendSuffix: 'w ostatnim miesiącu', compact: true })}
      ${popSpark}${fansH.length > 1 ? '<p class="kr-legend muted" aria-hidden="true"><i class="kr-dot kr-dot--a"></i>kibice <i class="kr-dot kr-dot--b"></i>media</p>' : ''}</div>
  </section>`;
}

// ---------- Gablota ----------

function badgeState(S, id) {
  const b = (S.badges ?? {})[id];
  return b && num(b.count) > 0 ? { count: num(b.count), last: b.last ?? null } : null;
}

function slotHtml(S, id, { sel, fresh }) {
  const st = badgeState(S, id);
  const b = BADGES[id];
  const sub = st ? (st.count === 1 ? (st.last?.season ?? 'zdobyte') : `ost. ${st.last?.season ?? ''}`.trim()) : 'zablokowane';
  return `<button type="button" class="kr-slot ${st ? 'is-on' : 'is-lock'}${fresh === id ? ' is-new' : ''}" data-act="k-badge" data-id="${esc(id)}" aria-pressed="${sel === id}" aria-label="${esc(badgeAria(id, st))}">
    <span class="kr-slot__art">${badgeSvg(id, { decorative: true, locked: !st, count: st?.count ?? 0 })}</span>
    <span class="kr-slot__name">${esc(b.name)}</span><span class="kr-slot__sub">${esc(sub)}</span></button>`;
}

function detailHtml(S, id) {
  const b = BADGES[id]; const st = badgeState(S, id);
  const trophies = arr(S.trophies).filter((t) => t.badgeId === id);
  let meta;
  if (st) {
    const rows = trophies.length ? trophies.map((t) => `${t.season}${t.clubName ? ` (${t.clubName})` : ''}`) : (st.last ? [`${st.last.season ?? ''}${st.last.clubName ? ` (${st.last.clubName})` : ''}`] : []);
    meta = rows.length ? `<span><b>${trophies.length > 1 || st.count > 1 ? 'Sezony' : 'Sezon'}:</b> ${esc(rows.join(', '))}</span>` : '';
  } else meta = `<span><b>Jak zdobyć:</b> ${esc(b.how)}</span>`;
  return `<aside class="kr-detail" aria-live="polite" aria-label="Szczegóły odznaki">
    <div class="kr-detail__art">${badgeSvg(id, { decorative: true, locked: !st })}</div>
    <div><h4>${esc(b.name)}</h4><p>${st ? `Zdobyte ${esc(times(st.count))}` : 'Jeszcze nie zdobyte'} · ${esc(b.metal)}</p></div>
    <div class="kr-detail__meta">${meta}</div></aside>`;
}

function cabinetHtml(S, ui) {
  const ids = Object.keys(BADGES);
  const filter = ui.crFilter === 'won' ? 'won' : 'all';
  const won = ids.filter((i) => badgeState(S, i));
  const fallbackSel = won[0] ?? ids[0];
  const sel = BADGES[ui.crSel] ? ui.crSel : fallbackSel;
  const shelves = BADGE_GROUPS.map(([g, name]) => {
    const all = ids.filter((i) => BADGES[i].group === g);
    const list = all.filter((i) => filter === 'all' || badgeState(S, i));
    if (!list.length) return '';
    return `<section class="kr-grp" style="--n:${Math.max(list.length, 2)}" aria-label="${esc(name)}">
      <div class="kr-grp__head">${esc(name)}<span>${all.filter((i) => badgeState(S, i)).length} z ${all.length}</span></div>
      <div class="kr-shelf">${list.map((i) => slotHtml(S, i, { sel, fresh: ui.crFresh })).join('')}</div></section>`;
  }).join('');
  const empty = filter === 'won' && !won.length
    ? '<p class="kr-cab__empty">Gablota czeka na pierwsze trofeum. Każdy awans, puchar i dobry sezon zapisze się tu na stałe. Przełącz na Wszystkie, żeby zobaczyć, co można zdobyć.</p>' : '';
  return `<section class="kr-cab" aria-labelledby="kr-cab-h">
    <div class="kr-cab__head"><h3 id="kr-cab-h">Gablota trofeów</h3>
      <span class="kr-cab__cnt"><span class="led" aria-label="${won.length} z ${ids.length} odznak">${won.length}/${ids.length}</span> odznak zdobytych</span>
      <div class="kr-cab__filter" role="group" aria-label="Filtr odznak">
        <button type="button" class="kr-fchip" data-act="k-bfilter" data-f="all" aria-pressed="${filter === 'all'}">Wszystkie</button>
        <button type="button" class="kr-fchip" data-act="k-bfilter" data-f="won" aria-pressed="${filter === 'won'}">Zdobyte</button></div></div>
    <div class="kr-cab__body">${detailHtml(S, sel)}<div class="kr-shelves">${empty}${shelves}</div></div></section>`;
}

// ---------- Historia sezonów ----------

const RESULT = {
  exceeded: ['kr-chip kr-chip--good', '▲ Ponad plan'],
  met: ['kr-chip', 'Wykonany'],
  missed: ['kr-chip kr-chip--bad', 'Niewykonany'],
  running: ['kr-chip kr-chip--live', 'W toku'],
};
const goalText = (g) => (g == null ? '' : typeof g === 'object' ? String(g.text ?? '') : String(g));
const leagueText = (l) => (l == null ? '' : typeof l === 'object' ? String(l.name ?? l.label ?? '') : String(l));

function historyHtml(S) {
  const rows = arr(S.seasons);
  if (!rows.length) {
    return '<div class="kr-panel kr-empty"><p>Tu pojawi się historia twoich sezonów: klub, liga, miejsce w tabeli i wynik względem celu zarządu. Pierwszy wpis powstanie po zakończeniu sezonu.</p></div>';
  }
  const body = [...rows].reverse().map((r) => {
    const res = RESULT[r.achieved] ?? RESULT.met;
    const running = r.achieved === 'running';
    const roundTxt = r.round != null && r.round !== '' ? (Number.isFinite(Number(r.round)) ? `po ${num(r.round)} kol.` : String(r.round)) : '';
    const tr = arr(r.trophies);
    return `<tr class="${running ? 'is-now' : ''}">
      <th scope="row" class="c-sez" data-l="Sezon">${esc(r.season)}${r.reconstructed ? '<small class="muted">odtworzone</small>' : ''}</th>
      <td class="c-club" data-l="Klub"><span class="kr-hclub">${crest(r.clubId, 26)}<span>${esc(r.clubName ?? '')}</span></span></td>
      <td class="c-lg" data-l="Liga">${esc(leagueText(r.league))}</td>
      <td class="c-pl" data-l="Miejsce"><span class="kr-place${r.pos === 1 ? ' is-1' : ''}">${r.pos ? `${num(r.pos)}.` : '-'}<small>${esc(running ? roundTxt : '')}</small></span></td>
      <td class="c-goal" data-l="Cel">${esc(goalText(r.goal))}</td>
      <td class="c-res" data-l="Wynik"><span class="${res[0]}">${res[1]}</span></td>
      <td class="c-tr" data-l="Trofea"><span class="kr-htr">${tr.length ? tr.filter((id) => BADGES[id]).map((id) => `<span class="kr-mini">${badgeSvg(id, { size: 30, label: `${BADGES[id].name}, sezon ${r.season}` })}</span>`).join('') : '<span class="muted" aria-label="brak trofeów">brak</span>'}</span></td></tr>`;
  }).join('');
  const clubs = new Set(rows.map((r) => r.clubId).filter(Boolean)).size;
  return `<div class="kr-hist-wrap"><table class="kr-hist"><caption class="muted">Historia sezonów, od najnowszego (${rows.length} ${rows.length === 1 ? 'sezon' : rows.length < 5 ? 'sezony' : 'sezonów'}, ${clubs} ${clubs === 1 ? 'klub' : clubs < 5 ? 'kluby' : 'klubów'})</caption>
    <thead><tr><th scope="col">Sezon</th><th scope="col">Klub</th><th scope="col">Liga</th><th scope="col">Miejsce</th><th scope="col">Cel</th><th scope="col">Wynik</th><th scope="col">Trofea</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

// ---------- Rekordy ----------

const MILESTONES = [100, 250, 500];

function recordsHtml(S) {
  const m = S.matches ?? {}; const n = num(m.n); const w = num(m.w); const d = num(m.d); const l = num(m.l);
  const next = MILESTONES.find((x) => x > n);
  const prog = next
    ? `<div class="kr-next"><span class="led" aria-label="${n} ${n === 1 ? 'mecz' : 'meczów'}">${n}</span><div><span class="kr-tile__s">Do odznaki ${next} meczów brakuje ${next - n}</span><div class="kr-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${next}" aria-valuenow="${n}" aria-label="Postęp do ${next} meczów"><i style="width:${Math.min(100, (n / next) * 100).toFixed(1)}%"></i></div></div></div>`
    : `<div class="kr-next"><span class="led" aria-label="${n} meczów">${n}</span><span class="kr-tile__s">Wszystkie progi meczów zdobyte</span></div>`;
  const bar = n > 0
    ? `<div class="kr-mbar" role="img" aria-label="Bilans: ${w} zwycięstw, ${d} remisów, ${l} porażek"><i style="width:${(w / n) * 100}%;background:var(--accent)"></i><i style="width:${(d / n) * 100}%;background:#9AA39C"></i><i style="width:${(l / n) * 100}%;background:var(--kartka-czerwona)"></i></div>
      <span class="kr-tile__s">${w} zwycięstw · ${d} remisów · ${l} porażek${m.ppm ? ` · ${pct1(num(m.ppm))} pkt na mecz` : ''}</span>`
    : '<span class="kr-tile__s">Pierwszy mecz jeszcze przed tobą. Bilans zwycięstw, remisów i porażek pojawi się po nim.</span>';
  const recs = arr(S.records).map((r) => `<div class="kr-tile"><span class="kr-tile__l">${esc(r.label)}</span><span class="kr-tile__v">${esc(r.value)}</span>${r.detail ? `<span class="kr-tile__s">${esc(r.detail)}</span>` : ''}</div>`).join('');
  return `<div class="kr-rec"><div class="kr-tile kr-tile--wide"><span class="kr-tile__l">Mecze w karierze</span>${prog}${bar}</div>${recs}</div>`;
}

// ---------- Ścieżka klubów ----------

function stintYears(a, b, today) {
  if (!ISO.test(String(a ?? ''))) return 1;
  const t0 = Date.parse(String(a).slice(0, 10));
  const t1 = ISO.test(String(b ?? '')) ? Date.parse(String(b).slice(0, 10)) : Date.parse(String(today).slice(0, 10));
  return Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0.3, Math.min(5, (t1 - t0) / 31557600000)) : 1;
}

function pathHtml(S, game) {
  const st = arr(S.stints);
  if (!st.length) return '<p class="muted">Ścieżka klubów pojawi się, gdy poprowadzisz pierwszy klub.</p>';
  const items = [...st].reverse().map((s, i) => {
    const now = !s.to && !S.unemployed && i === 0;
    const range = [s.from ? dt(s.from) : '', s.to ? dt(s.to) : (now ? 'obecnie' : '')].filter(Boolean).join(' do ');
    const tr = Array.isArray(s.trophies) ? s.trophies.filter((id) => BADGES[id]) : [];
    const trN = typeof s.trophies === 'number' ? s.trophies : 0;
    const tags = [now ? '<span class="kr-chip kr-chip--live">Obecny klub</span>' : '',
      ...tr.map((id) => `<span class="kr-chip">${esc(BADGES[id].name)}</span>`),
      trN ? `<span class="kr-chip">${trN} ${trN === 1 ? 'trofeum' : 'trofeów'}</span>` : ''].filter(Boolean).join('');
    const meta = [s.league ? leagueText(s.league) : '', s.matches ? `${num(s.matches)} ${num(s.matches) === 1 ? 'mecz' : 'meczów'}` : ''].filter(Boolean).join(' · ');
    return `<li class="${now ? 'is-now' : ''}" style="--h:${Math.round(60 + stintYears(s.from, s.to, game?.date ?? '') * 34)}px">${crest(s.clubId, 38)}<h4>${esc(s.clubName ?? '')}</h4><p>${esc([range, meta].filter(Boolean).join(' · '))}</p>${tags ? `<div class="kr-tags">${tags}</div>` : ''}</li>`;
  }).join('');
  return `<ol class="kr-path" aria-label="Kluby w karierze, od ostatniego">${items}</ol>`;
}

// ---------- Trudne chwile (tylko tekst) ----------

function scarsHtml(S) {
  const rows = arr(S.scars);
  if (!rows.length) return '';
  return `<section class="kr-sec" aria-labelledby="kr-scars-h"><div class="kr-sec__head"><h3 id="kr-scars-h">Trudne chwile</h3><p class="muted">Każda kariera ma i takie rozdziały</p></div>
    <ul class="kr-scars">${[...rows].reverse().map((s) => `<li><time>${esc(dt(s.date) || s.season || '')}</time><span>${esc(s.text)}${s.clubName ? ` <em>${esc(s.clubName)}</em>` : ''}</span></li>`).join('')}</ul></section>`;
}

// ---------- Rynek pracy ----------

const CHANCE = { niska: 1, 'średnia': 2, wysoka: 3 };
const APP_STATE = {
  czeka: 'Czeka na decyzję klubu',
  rozmowa: 'Zaproszenie na rozmowę',
  odmowa: 'Klub odmówił',
  oferta: 'Jest oferta, sprawdź Pocztę',
};

function vacancyHtml(v, J, today) {
  const dots = CHANCE[v.chance] ?? 0;
  const cool = v.cooldownUntil && String(v.cooldownUntil) > String(today);
  const blockedGlobal = J.canApplyFrom && String(J.canApplyFrom) > String(today);
  let action;
  if (v.applied) action = `<button type="button" class="btn btn--quiet btn--sm" data-act="job-withdraw" data-id="${esc(v.clubId)}">Wycofaj aplikację</button>`;
  else if (cool) action = `<button type="button" class="btn btn--sm" disabled>Karencja do ${esc(dt(v.cooldownUntil))}</button>`;
  else if (blockedGlobal) action = `<button type="button" class="btn btn--sm" disabled>Aplikuj od ${esc(dt(J.canApplyFrom))}</button>`;
  else action = `<button type="button" class="btn btn--primary btn--sm" data-act="job-apply" data-id="${esc(v.clubId)}">Aplikuj</button>`;
  const facts = [v.league ? leagueText(v.league) : '', v.clubRep != null ? `reputacja klubu ${Math.round(num(v.clubRep))}` : '', v.owner ? `właściciel: ${v.owner}` : ''].filter(Boolean);
  return `<li class="kr-vac"><div class="kr-vac__main">${crest(v.clubId, 34)}<div><h4>${esc(v.name)}</h4><p class="muted">${esc(facts.join(' · '))}</p>${v.goal ? `<p>Cel zarządu: ${esc(goalText(v.goal))}</p>` : ''}${v.closes ? `<p class="muted">Klub zdecyduje do: ${esc(dt(v.closes))}</p>` : ''}</div></div>
    <div class="kr-vac__side"><span class="kr-chance" data-n="${dots}"><span class="kr-chance__dots" aria-hidden="true"><i></i><i></i><i></i></span>Szansa: ${esc(v.chance ?? 'nieznana')}</span>${action}</div></li>`;
}

function jobHtml(S, J, game, ui) {
  const today = game?.date ?? '';
  const vac = arr(J.vacancies); const apps = arr(J.apps);
  const unemployed = !!S.unemployed || J.status === 'unemployed';
  if (!unemployed && !vac.length && !apps.length && !J.canResign) return '';
  const last = J.lastClub ? (typeof J.lastClub === 'object' ? J.lastClub.name : (clubById(J.lastClub)?.name ?? J.lastClub)) : '';
  const status = unemployed
    ? `<p class="kr-job__st">Jesteś bez klubu${J.since ? ` od ${esc(dt(J.since))}` : ''}${num(J.days) ? ` (${num(J.days)} ${num(J.days) === 1 ? 'dzień' : 'dni'})` : ''}.${last ? ` Ostatni klub: ${esc(last)}.` : ''} Dni mijają dalej, a kluby szukają trenerów.</p>`
    : '';
  const vacHtml = vac.length
    ? `<ul class="kr-vacs">${vac.map((v) => vacancyHtml(v, J, today)).join('')}</ul>`
    : `<p class="kr-empty-t">${unemployed ? 'Na razie żaden klub nie szuka trenera. Wolne posady pojawiają się, gdy kluby żegnają się ze szkoleniowcami. Naciśnij Dalej, a lista się zapełni.' : 'Żaden klub nie szuka teraz trenera.'}</p>`;
  const appHtml = apps.length
    ? `<h4 class="kr-job__h">Twoje aplikacje</h4><ul class="kr-apps">${apps.map((a) => `<li><span class="kr-apps__n">${crest(a.clubId, 24)}<b>${esc(a.name)}</b></span><span class="muted">${esc(dt(a.date))}</span><span class="kr-chip kr-chip--${a.state === 'oferta' ? 'good' : a.state === 'odmowa' ? 'bad' : 'live'}">${esc(APP_STATE[a.state] ?? a.state)}</span>${a.state === 'czeka' || a.state === 'rozmowa' ? `<button type="button" class="btn btn--quiet btn--sm" data-act="job-withdraw" data-id="${esc(a.clubId)}">Wycofaj</button>` : ''}</li>`).join('')}</ul>`
    : '';
  let resign = '';
  if (!unemployed && J.canResign) {
    const cr = J.canResign;
    if (!cr.ok) resign = `<p class="kr-job__r muted">${esc(cr.text ?? '')}</p>`;
    else if (ui.crResign) resign = `<div class="kr-resign" role="alertdialog" aria-labelledby="kr-resign-t"><p id="kr-resign-t"><b>Na pewno zrezygnować?</b> ${esc(cr.text ?? '')}</p><div class="kr-resign__b"><button type="button" class="btn btn--sm kr-btn-danger" data-act="job-resign">Tak, rezygnuję</button><button type="button" class="btn btn--quiet btn--sm" data-act="k-resign-no">Zostaję</button></div></div>`;
    else resign = `<div class="kr-job__r"><p class="muted">${esc(cr.text ?? '')}</p><button type="button" class="btn btn--quiet btn--sm" data-act="k-resign-ask">Zrezygnuj z pracy</button></div>`;
  }
  return `<section class="kr-sec kr-job" aria-labelledby="kr-job-h"><div class="kr-sec__head"><h3 id="kr-job-h">Rynek pracy</h3><p class="muted">${unemployed ? 'Wolne posady w innych klubach' : 'Posady w innych klubach'}</p></div>
    <div class="kr-panel">${status}${vacHtml}${appHtml}${resign}</div></section>`;
}

// ---------- Widok ----------

/** Zawartość podzakładki Klub > Kariera. ui: crFilter, crSel, crFresh, crResign. data: { summary, jobs } (testy: gotowe dane zamiast logiki). */
export function renderCareer(game, ui = {}, data = {}) {
  if (typeof document !== 'undefined') ensureBadgeSprite();
  const S = data.summary ?? careerSummary(game);
  const J = data.jobs ?? jobState(game);
  const unemployed = !!S.unemployed || J.status === 'unemployed';
  const job = jobHtml(S, J, game, ui);
  return `<div class="kr">
    ${heroHtml(S, J)}
    ${unemployed ? job : ''}
    <div id="kr-cabinet">${cabinetHtml(S, ui)}</div>
    <section class="kr-sec"><div class="kr-sec__head"><h3>Historia sezonów</h3></div>${historyHtml(S)}</section>
    <div class="kr-two">
      <section class="kr-sec"><div class="kr-sec__head"><h3>Rekordy</h3></div>${recordsHtml(S)}</section>
      <section class="kr-sec"><div class="kr-sec__head"><h3>Ścieżka klubów</h3></div><div class="kr-panel">${pathHtml(S, game)}</div></section>
    </div>
    ${scarsHtml(S)}
    ${unemployed ? '' : job}
  </div>`;
}

// ---------- Okno odblokowania ----------

const SPARK_COLORS = ['#FFB21A', '#F5C518', '#F3F6F1', '#3FA463', '#FFE27A', '#D62839'];

function unlockHtml(u, more) {
  const b = BADGES[u.badgeId];
  const n = Math.max(1, num(u.count)); const first = n === 1;
  const parts = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 + (i % 2 ? 0.2 : 0); const r = 96 + (i % 3) * 22;
    return `<i class="kul__p" style="--dx:${Math.round(Math.cos(a) * r)}px;--dy:${Math.round(Math.sin(a) * r * 0.9 - 12)}px;--r:${(i % 2 ? 1 : -1) * (180 + i * 37)}deg;background:${SPARK_COLORS[i % SPARK_COLORS.length]}"></i>`;
  }).join('');
  const sub = [u.season ? `Sezon ${u.season}` : '', u.clubName ?? ''].filter(Boolean).join(' · ');
  return `<div class="kul"><div class="kul__card">
    <div class="kul__stage" title="Dotknij, żeby pominąć animację">
      <div class="kul__cone"></div><div class="kul__glow"></div>
      <div class="kul__art">${badgeSvg(u.badgeId, { decorative: true })}</div>
      <div class="kul__shine">${badgeSvg(u.badgeId, { decorative: true })}</div>${parts}
    </div>
    <p class="kul__kick">${first ? 'Nowe trofeum w gablocie' : 'Kolejne trofeum w gablocie'}</p>
    <h2 class="kul__name" id="kul-name">${esc(b.name)}</h2>
    <p class="kul__sub" id="kul-sub">${esc(sub)}</p>
    <p class="kul__cnt">Zdobyte <span class="kul__roll" role="img" aria-label="${esc(times(n))}"><span aria-hidden="true"><b>×${n - 1}</b><b>×${n}</b></span></span></p>
    <div class="kul__act">${more ? '<button class="btn kul__go" type="button" data-kul="next">Dalej</button>' : '<button class="btn kul__go" type="button" data-kul="go">Do gabloty</button>'}</div>
  </div></div>`;
}

/**
 * Pokazuje okno odblokowania, gdy są nowe odznaki (pendingUnlocks). Kilka odznak po kolei, przycisk Dalej.
 * onDone({ go, badgeId }) po zamknięciu (przycisk Do gabloty: go = true; Escape: go = false).
 */
export function mountUnlocks(game, { onDone, doc = typeof document !== 'undefined' ? document : null } = {}) {
  if (!doc) return false;
  const list = pendingUnlocks(game).filter((u) => BADGES[u?.badgeId]);
  if (!list.length) return false;
  let dlg = doc.getElementById('ulDlg');
  if (dlg?.open) return true;
  ensureBadgeSprite(doc);
  if (!dlg) {
    dlg = doc.createElement('dialog');
    dlg.id = 'ulDlg'; dlg.className = 'kr-unlock'; dlg.setAttribute('aria-labelledby', 'kul-name'); dlg.setAttribute('aria-describedby', 'kul-sub');
    doc.body.appendChild(dlg);
  }
  let done = false;
  const finish = (go) => {
    if (done) return;
    done = true;
    if (dlg.open) dlg.close();
    onDone?.({ go, badgeId: list[list.length - 1].badgeId });
  };
  dlg.onclose = () => finish(false);
  const show = (i) => {
    dlg.innerHTML = unlockHtml(list[i], i < list.length - 1);
    const card = dlg.querySelector('.kul__card');
    void card.offsetWidth;
    card.classList.add('play');
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) card.classList.add('kul--static');
    card.querySelector('.kul__stage').onclick = () => card.getAnimations?.({ subtree: true }).forEach((a) => a.finish());
    card.querySelector('[data-kul="next"]')?.addEventListener('click', () => show(i + 1));
    card.querySelector('[data-kul="go"]')?.addEventListener('click', () => finish(true));
    card.querySelector('.kul__go')?.focus({ preventScroll: true });
  };
  show(0);
  dlg.showModal();
  dlg.querySelector('.kul__go')?.focus({ preventScroll: true });
  return true;
}
