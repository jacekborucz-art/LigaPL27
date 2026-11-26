// Rozgrywki > IV liga (docs/iv-liga.md): 16 grup wojewódzkich bez kadr. Wybór grupy (select, domyślnie województwo
// klubu gracza), podzakładki Tabela, Kolejki, Baraże, prosta karta klubu bez zawodników (decyzja właściciela D7).
// Dane z game.season.l4 (src/season/fourthLeague.js); stare zapisy bez IV ligi dostają tylko wyjaśnienie.
import { VOIVODESHIPS, VOIV } from '../data/voivodeships.js';
import { L3_GROUP_NAMES, clubById } from '../data/clubs_pl.js';
import { anyClub } from '../season/season.js';
import { voivOfClub } from '../season/leagues.js';
import { zonesFor, clinchTags } from '../season/standings.js';
import { l4Rows, l4GroupFixtures, l4GroupIndex, l4Eligible, fourthLeagueFinished } from '../season/fourthLeague.js';
import { crestHtml } from './crest.js';
import { esc, weekday, fmtDay, fmtDate } from './dom.js';
import { ufxRow } from './europeView.js';
import { realNamesOn } from '../data/clubNames.js';

const clubsById = { get: (id) => clubById(id) };
const crest = (id, size = 22) => { const c = anyClub(id); return c ? crestHtml(c, { size, clubsById }) : ''; };
const name = (id) => anyClub(id)?.name ?? id;
const shortDay = (iso) => weekday(iso).slice(0, 3);
const formDots = (form) => `<span class="form">${form.map((c) => `<b class="${c}">${c}</b>`).join('')}</span>`;
const teams = (n) => `${n} ${n === 1 ? 'drużyna' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'drużyny' : 'drużyn'}`;

/** Województwo do pokazania: wybrane, a domyślnie województwo klubu gracza (bez klubu: mazowieckie) [SZAC]. */
export function l4DefaultVoiv(game, voiv = null) {
  if (voiv && VOIV[voiv]) return voiv;
  const me = game?.clubId ? anyClub(game.clubId) : null;
  return voivOfClub(me) ?? 'mazowiecka';
}

/** Przycisk klubu: klub z kadrą w grze otwiera zwykły widok klubu, pozostałe prostą kartę IV ligi. */
function clubBtn(game, id) {
  const act = game.world?.clubs?.[id] && clubById(id) ? 'club' : 'l4club';
  return `<button class="club-link" data-act="${act}" data-club="${esc(id)}" title="Pokaż klub">${esc(name(id))}</button>`;
}

function picker(game, voiv) {
  const L = game.season.l4;
  const mine = l4DefaultVoiv(game);
  return `<div class="l4-pick"><label for="l4-voiv">Grupa wojewódzka</label><select id="l4-voiv">${VOIVODESHIPS.map((v) => {
    const n = L.groups[l4GroupIndex(L, v.key)]?.ids.length ?? 0;
    return `<option value="${esc(v.key)}"${v.key === voiv ? ' selected' : ''}>${esc(`${v.name}, ${teams(n)}${v.key === mine && game.clubId ? ' (twoje województwo)' : ''}`)}</option>`;
  }).join('')}</select></div>`;
}

const TAG_TXT = { up: 'AWANS', playoff: 'BARAŻE', down: 'SPADEK' };
/** Tag pewnego rozstrzygnięcia za nazwą klubu (clinchTags): złota gwiazdka mistrza, awans, baraże, spadek. */
export function clinchTagHtml(t) {
  if (!t) return '';
  return t.kind === 'champ' ? `<span class="tbl-tag tbl-tag--champ" title="${esc(t.title)}" aria-label="${esc(t.title)}">★</span>`
    : `<span class="tbl-tag tbl-tag--${t.kind}" title="${esc(t.title)}">${TAG_TXT[t.kind]}</span>`;
}

function tableView(game, voiv) {
  const L = game.season.l4;
  const rows = l4Rows(L, voiv);
  const v = VOIV[voiv];
  const zones = zonesFor(5, rows.length, v.minDown);
  const zoneOf = (pos) => zones.find((z) => pos >= z.from && pos <= z.to);
  const done = fourthLeagueFinished(L);
  const tags = clinchTags(rows, l4GroupFixtures(L, l4GroupIndex(L, voiv)), zones, { eligible: l4Eligible });
  const champs = done ? VOIVODESHIPS.map((x) => [x, l4Rows(L, x.key).map((r) => r.id).find(l4Eligible)]) : [];
  return `<div class="cgrid cgrid--side"><div class="cgrid__main">
    <div class="tbl" role="table" aria-label="${esc(`Tabela IV ligi, grupa ${v.name}`)}">
      <div class="tbl__row tbl__head" role="row"><span>#</span><span>Klub</span><span>M</span><span class="w">W</span><span class="w">R</span><span class="w">P</span><span>Bramki</span><span>Pkt</span><span class="w2">Forma</span></div>
      ${rows.map((r) => `<div class="tbl__row ${r.id === game.clubId ? 'is-me' : ''}" role="row" data-zone="${zoneOf(r.pos)?.kind ?? ''}">
          <span class="tbl__pos">${r.pos}</span>
          <span class="tbl__club">${crest(r.id)}${clubBtn(game, r.id)}${clinchTagHtml(tags.get(r.id))}</span>
          <span>${r.played}</span><span class="w">${r.wins}</span><span class="w">${r.draws}</span><span class="w">${r.losses}</span>
          <span>${r.gf}:${r.ga}</span><b>${r.points}</b><span class="w2">${formDots(r.form)}</span>
        </div>`).join('')}
    </div>
    <ul class="legend">${zones.map((z) => `<li data-zone="${z.kind}">${esc(z.label)}</li>`).join('')}</ul>
    <p class="hint">${esc(`Rezerwy awansują tylko, gdy pierwsza drużyna gra wyżej niż III liga (inaczej awansuje następny klub). Poziom niżej: ${v.l6} (${v.woj}).`)}</p>
    </div><aside class="cgrid__aside">
      ${champs.length ? `<section class="cside"><div class="cside__head"><h3>Mistrzowie województw</h3></div><ul class="plain-list">${champs.map(([x, id]) => `<li><span class="k">${esc(x.name)}</span><span>${id ? `${crest(id, 18)} ${esc(name(id))}` : 'brak'}</span></li>`).join('')}</ul></section>`
        : `<section class="cside"><div class="cside__head"><h3>Najbliższa kolejka</h3><button class="btn btn--quiet btn--sm" data-act="cview" data-v="fixtures">Kolejki</button></div>${roundList(game, voiv, null, true)}</section>`}
    </aside></div>`;
}

function roundList(game, voiv, round, compact = false) {
  const L = game.season.l4;
  const fx = l4GroupFixtures(L, l4GroupIndex(L, voiv));
  const cur = round ?? fx.find((f) => !f.played)?.round ?? fx.at(-1)?.round ?? 1;
  const list = fx.filter((f) => f.round === cur).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return `${compact ? `<p class="hint">${cur}. kolejka</p>` : ''}<ul class="ufxlist${compact ? ' ufxlist--compact' : ''}">${list.map((f) => {
    const s = f.result?.score;
    const w = s ? (s[0] > s[1] ? f.home : s[1] > s[0] ? f.away : null) : null;
    return ufxRow({ cls: f.home === game.clubId || f.away === game.clubId ? 'is-me' : '', date: `${esc(shortDay(f.date))} ${esc(fmtDay(f.date))}`, home: f.home, away: f.away,
      sh: s ? s[0] : null, sa: s ? s[1] : null, time: f.time, sub: '', winner: w, nameOf: name, crestOf: (id) => crest(id), flagOf: () => '', link: false, report: null });
  }).join('')}</ul>`;
}

function fixturesView(game, voiv, round) {
  const L = game.season.l4;
  const fx = l4GroupFixtures(L, l4GroupIndex(L, voiv));
  const total = fx.at(-1)?.round ?? 1;
  const cur = Math.min(total, Math.max(1, round ?? fx.find((f) => !f.played)?.round ?? total));
  const rows = l4Rows(L, voiv);
  return `<div class="cgrid cgrid--side"><div class="cgrid__main">
    <div class="roundnav">
      <button class="btn btn--quiet" data-act="cround" data-r="${Math.max(1, cur - 1)}" ${cur <= 1 ? 'disabled' : ''} aria-label="Poprzednia kolejka">‹</button>
      <span>${cur}. kolejka</span>
      <button class="btn btn--quiet" data-act="cround" data-r="${Math.min(total, cur + 1)}" ${cur >= total ? 'disabled' : ''} aria-label="Następna kolejka">›</button>
    </div>
    ${roundList(game, voiv, cur)}
    </div><aside class="cgrid__aside"><div class="tbl tbl--mini" role="table" aria-label="Tabela">
      <div class="tbl__row tbl__head" role="row"><span>#</span><span>Klub</span><span>M</span><span>Bramki</span><span>Pkt</span></div>
      ${rows.map((r) => `<div class="tbl__row ${r.id === game.clubId ? 'is-me' : ''}" role="row"><span class="tbl__pos">${r.pos}</span><span class="tbl__club">${crest(r.id, 18)}<span>${esc(name(r.id))}</span></span><span>${r.played}</span><span>${r.gf}:${r.ga}</span><b>${r.points}</b></div>`).join('')}
    </div></aside></div>`;
}

const scoreLine = (m) => (m.s ? `${m.s[0]}:${m.s[1]}${m.pen ? ` (karne ${m.pen[0]}:${m.pen[1]})` : m.et ? ' (po dogrywce)' : ''}` : '');
function poMatch(game, m, date, label) {
  if (!m?.h || !m?.a) return '';
  return `<li><span class="k">${esc(label)}</span><span>${crest(m.h, 18)} ${esc(name(m.h))} - ${crest(m.a, 18)} ${esc(name(m.a))} ${m.s ? `<b>${esc(scoreLine(m))}</b>` : `<small class="muted">${esc(`${shortDay(date)} ${fmtDay(date)}`)}</small>`}</span></li>`;
}

function playoffView(game) {
  const L = game.season.l4;
  const intro = `<p class="hint">${esc('Mistrz każdego województwa awansuje do III ligi. Wicemistrzowie czterech województw makroregionu (grupy III ligi) grają półfinał (jeden mecz u pierwszej wylosowanej drużyny) i finał (u drużyny z lepszą średnią punktów), przy remisie dogrywka i karne. Zwycięzca awansuje, jeśli w grupie III ligi zostanie wolne miejsce (1 lipca, po barażach o 2 Ligę i spadkach z 2 Ligi).')}</p>`;
  const groups = [1, 2, 3, 4].map((g) => {
    const voivs = VOIVODESHIPS.filter((v) => v.l3group === g);
    const P = L.po?.[g];
    let body;
    if (!P) {
      const runners = voivs.map((v) => [v, l4Rows(L, v.key).map((r) => r.id).filter(l4Eligible)[1]]);
      body = `<ul class="plain-list">${runners.map(([v, id]) => `<li><span class="k">${esc(v.name)}</span><span>${id ? `${crest(id, 18)} ${esc(name(id))}` : 'brak'}</span></li>`).join('')}</ul>`;
    } else {
      const status = P.w ? `Zwycięzca: ${name(P.w)}. Awans, jeśli w grupie III ligi zostanie wolne miejsce (1 lipca).` : '';
      body = `<ul class="plain-list">${P.sf.map((m, i) => poMatch(game, m, L.po.sd, `Półfinał ${i + 1}`)).join('')}
        ${P.bye ? `<li><span class="k">Wolny los</span><span>${crest(P.bye, 18)} ${esc(name(P.bye))}</span></li>` : ''}
        ${P.f?.a ? poMatch(game, P.f, L.po.fd, 'Finał') : `<li><span class="k">Finał</span><span class="muted">${esc(fmtDate(L.po.fd))}</span></li>`}</ul>
        ${status ? `<p class="hint">${esc(status)}</p>` : ''}`;
    }
    return `<section class="stat-sec ccard"><h3>${esc(`Grupa ${L3_GROUP_NAMES[g]} III ligi`)}</h3><p class="hint">${esc(`Województwa: ${voivs.map((v) => v.name).join(', ')}`)}</p>${body}</section>`;
  }).join('');
  return `${intro}${L.po ? '' : '<p class="hint">Pary półfinałów zostaną wylosowane po ostatniej kolejce wszystkich grup. Poniżej obecni wicemistrzowie.</p>'}<div class="cards">${groups}</div>`;
}

/** Stadion z potwierdzonych danych; rezerwy przy fikcyjnych nazwach bez nazwy obiektu (zawiera prawdziwą nazwę klubu). */
function stadiumText(c) {
  if (!c.stadium) return 'boisko klubu, brak danych o pojemności';
  const cap = c.cap ? `${c.cap.toLocaleString('pl-PL')} miejsc` : '';
  if (c.parent && !realNamesOn()) return ['obiekt pierwszej drużyny', cap].filter(Boolean).join(', ');
  return [c.stadium, cap].filter(Boolean).join(', ');
}

/** Prosta karta klubu IV ligi (bez zawodników): herb, miejscowość, miejsce, forma, mecze, renoma, stadion, historia. */
function clubCard(game, id) {
  const c = anyClub(id);
  if (!c) return '';
  const L = game.season.l4;
  const voiv = voivOfClub(c);
  const v = VOIV[voiv];
  const gi = l4GroupIndex(L, voiv);
  const inGroup = gi >= 0 && L.groups[gi].ids.includes(id);
  const row = inGroup ? l4Rows(L, voiv).find((r) => r.id === id) : null;
  const fx = inGroup ? l4GroupFixtures(L, gi).filter((f) => f.home === id || f.away === id) : [];
  const last = fx.filter((f) => f.played).slice(-5).reverse();
  const next = fx.filter((f) => !f.played).slice(0, 3);
  const stars = Math.max(1, Math.min(5, c.prestige ?? 1));
  const hist = (game.archive ?? []).filter((a) => a.l4);
  const titles = hist.filter((a) => Object.values(a.l4.champ ?? {}).includes(id)).map((a) => a.season);
  const ups = hist.filter((a) => a.l4.up?.includes(id)).map((a) => a.season);
  const league = c.tier === 6 ? `${v?.l6 ?? 'klasa okręgowa'} (${v?.woj ?? ''})` : c.tier === 5 ? `IV liga, grupa ${v?.name ?? ''}` : '';
  const row2 = (f) => {
    const s = f.result?.score;
    return ufxRow({ date: `${esc(shortDay(f.date))} ${esc(fmtDay(f.date))}`, home: f.home, away: f.away, sh: s ? s[0] : null, sa: s ? s[1] : null, time: f.time, sub: '', winner: s ? (s[0] > s[1] ? f.home : s[1] > s[0] ? f.away : null) : null, nameOf: name, crestOf: (x) => crest(x), flagOf: () => '', link: false, report: null });
  };
  return `<section class="ccard l4-card" aria-label="${esc(`Klub ${c.name}`)}">
    <div class="l4-card__head">${crest(id, 48)}<div><h3>${esc(c.name)}</h3><p class="muted">${esc([c.city, v?.woj, league].filter(Boolean).join(', '))}</p></div>
      <button class="btn btn--quiet btn--sm" data-act="l4club" data-club="" aria-label="Zamknij kartę klubu">Zamknij</button></div>
    <div class="l4-card__body"><ul class="plain-list">
      ${row ? `<li><span class="k">Miejsce</span><span>${row.pos}. (${row.points} pkt, bramki ${row.gf}:${row.ga}) ${formDots(row.form)}</span></li>` : ''}
      <li><span class="k">Renoma</span><span aria-label="${esc(`${stars} na 5`)}">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span></li>
      <li><span class="k">Stadion</span><span>${esc(stadiumText(c))}</span></li>
      ${c.parent ? `<li><span class="k">Pierwsza drużyna</span><span>${esc(name(c.parent))}</span></li>` : ''}
      <li><span class="k">Historia</span><span>${esc([titles.length ? `mistrzostwo województwa: ${titles.join(', ')}` : '', ups.length ? `awans do III ligi: ${ups.join(', ')}` : ''].filter(Boolean).join('; ') || 'brak sukcesów w zapisanych sezonach')}</span></li>
    </ul>
    <div>${last.length ? `<h4>Ostatnie mecze</h4><ul class="ufxlist ufxlist--compact">${last.map(row2).join('')}</ul>` : ''}
    ${next.length ? `<h4>Najbliższe mecze</h4><ul class="ufxlist ufxlist--compact">${next.map(row2).join('')}</ul>` : ''}</div></div>
  </section>`;
}

/** Widok zakładki IV liga. opts: { voiv, view ('table' | 'fixtures' | 'playoff'), round, club }. */
export function renderFourthLeague(game, { voiv = null, view = 'table', round = null, club = null } = {}) {
  if (!game.season?.l4) return `<p class="hint">${esc('IV liga z tabelami 16 grup wojewódzkich działa w karierach rozpoczętych od tej wersji gry. W tej karierze kluby IV ligi grają tylko w Pucharze Polski, a beniaminkowie III ligi są wybierani jak dotąd.')}</p>`;
  const v = l4DefaultVoiv(game, voiv);
  if (!['table', 'fixtures', 'playoff'].includes(view)) view = 'table';
  const tabs = [['table', 'Tabela'], ['fixtures', 'Kolejki'], ['playoff', 'Baraże']];
  const sub = `<div class="subtabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" data-act="cview" data-v="${k}" aria-selected="${view === k}">${t}</button>`).join('')}</div>`;
  const body = view === 'playoff' ? playoffView(game) : view === 'fixtures' ? fixturesView(game, v, round) : tableView(game, v);
  return `${picker(game, v)}${club ? clubCard(game, club) : ''}${sub}${body}`;
}
