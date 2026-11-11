// Powłoka aplikacji: ekran startowy, sloty zapisu, wybór klubu, główny ekran z pocztą
// i upływem dni („Dalej” albo „Zagraj mecz”).
import { CLUBS_PL, LEAGUE_NAMES, clubById } from './data/clubs_pl.js';
import { GAME_START, SEASON, POLISH_EUROPE_2026, DOMESTIC } from './config/calendar2026.js';
import { crestHtml } from './ui/crest.js';
import { esc, fmtDate, weekday, icon } from './ui/dom.js';
import * as store from './core/store.js';
import { hashString } from './core/rng.js';
import { CATEGORIES, unreadCount, markRead, markAllRead, resolveMessage, filterInbox, pendingDecisions, addMessages, pruneInbox, canDelete } from './core/inbox.js';
import { processDay, primaryAction, continueUntilStop, finishMatch, forgetMessages } from './core/gameLoop.js';
import './season/dailySystems.js';
import { createSeason, compLabel, applyResult, fromEngineResult, squadFor, anyClub, LEAGUE_COMPS } from './season/season.js';
import { standings, zonesFor } from './season/standings.js';
import { renderCompetitions } from './ui/competitionsView.js';
import { createMatch, runToEnd } from './engine/match/match.js';
import { Rng } from './core/rng.js';
import { addDays } from './core/gameLoop.js';
import { generateWorld, squadOf, academyOf } from './world/worldGen.js';
import { renderSquadList, renderPlayerProfile } from './ui/squadView.js';
import { renderTactics } from './ui/tacticsView.js';
import { resolveMove, resolveTap, parseLoc, locKey, playerAt, sameLoc } from './ui/tacticsMoves.js';
import { mountTacticsDrag } from './ui/tacticsDrag.js';
import { createTactics, changeFormation, setInstruction, refreshTactics, removeFromBench, checkTactics } from './engine/lineup.js';
import { COMPETITIONS } from './config/competitions.js';
import { mountMatchday } from './ui/matchdayView.js';
import { mountDrawAnimation } from './ui/europeView.js';
import { ensureUefa } from './season/europe.js';
import { ensureNational } from './season/nationalSystem.js';
import { applySeasonState } from './season/rollover.js';
import { ensureTraining, trainingMatchInput, teamCohesion } from './training/index.js';
import { renderTraining, handleTrainingAction, isTrainingAction } from './ui/trainingView.js';
import { renderTransfers, handleTransferAction, isTransferAction } from './ui/transfersView.js';
import { renderTalks, handleTalkAction, isTalkAction } from './ui/talksView.js';
import { ensureCareer } from './career/careerSystem.js';
import { completeTransfer, fmtZl } from './career/transfers.js';
import { trustLabel } from './career/board.js';
import { spendable, wageBill, monthSummary } from './career/finance.js';
import { teamMorale, moraleLabel } from './career/morale.js';
import { fanMoodLabel } from './career/fans.js';
import { GROUP } from './career/squad.js';
import { runDecision } from './core/decisions.js';
import { startNegotiation, renderNegotiation, handleNegotiationAction, isNegotiationAction, readNegotiationForm, refreshNegotiationHints } from './ui/negotiationView.js';

const app = document.getElementById('app');
const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const state = { screen: 'start', slot: null, game: null, tab: 'pulpit', tier: 1, notice: null, mailCat: null, mailOpen: null, running: false, sqFilter: 'all', playerOpen: null, sqSub: 'players', tSel: null, matchNotes: [], cComp: null, cView: 'table', cRound: null, lastResult: null, uFilter: 'pl', uDraw: null };

const benchSizeFor = (g) => COMPETITIONS[['ekstraklasa', 'liga1', 'liga2'][clubById(g.clubId).tier - 1]].benchSize;
const nextFixture = (g) => (g.fixtures || []).filter((f) => !f.played && (f.home === g.clubId || f.away === g.clubId)).sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))[0];
/** Kadra gracza z pauzami w rozgrywkach najbliższego meczu. */
const mySquad = (g) => squadFor(g, g.clubId, nextFixture(g)?.comp ?? 'ekstraklasa');
const leagueOvrCache = new Map();

/** Posortowane OVR zawodników ligi (do gwiazdek). */
function leagueOvrs(g, tier) {
  const key = `${g.seed}:${tier}`;
  if (!leagueOvrCache.has(key)) {
    const ovrs = CLUBS_PL.filter((c) => c.tier === tier).flatMap((c) => squadOf(g.world, c.id).map((p) => p.ovr)).sort((a, b) => a - b);
    leagueOvrCache.set(key, ovrs);
  }
  return leagueOvrCache.get(key);
}

const TABS = [
  { id: 'pulpit', label: 'Pulpit' },
  { id: 'kadra', label: 'Kadra' },
  { id: 'rozgrywki', label: 'Rozgrywki' },
  { id: 'poczta', label: 'Poczta' },
  { id: 'transfery', label: 'Transfery' },
  { id: 'trening', label: 'Trening' },
];

function render() {
  if (state.screen === 'start') return renderStart();
  if (state.screen === 'pick') return renderPick();
  if (state.screen === 'matchday') return renderLiveMatchday();
  if (state.screen === 'match') return renderMatchDay();
  if (state.screen === 'matchResult') return renderMatchResult();
  return renderHub();
}

// ---------- Zapis ----------
async function save() {
  const g = state.game;
  g.summary = { clubId: g.clubId, season: g.season, date: g.date };
  await store.saveSlot(state.slot, g);
}

/** Uzupełnia zapisy sprzed poczty i pętli dni (migracja w miejscu). */
function ensureGameShape(g) {
  applySeasonState(g); // kalendarz i ligi sezonu zapisanego w grze
  if (!g.world) g.world = generateWorld(g.seed);
  if (!g.tactics) g.tactics = createTactics(mySquad(g), { benchSize: benchSizeFor(g) });
  else g.tactics = refreshTactics(g.tactics, mySquad(g), { benchSize: benchSizeFor(g) }).tactics;
  if (!Array.isArray(g.inbox)) g.inbox = [];
  if (!g.season) {
    // Zapis sprzed etapu 7: tworzymy sezon i rozgrywamy w tle mecze z minionych dni
    g.season = createSeason(g.seed, { playerClub: g.clubId });
    g.fixtures = g.season.fixtures;
    const today = g.date;
    for (let d = GAME_START; d < today; d = addDays(d, 1)) processDay(g, d);
    for (const f of g.fixtures) if (f.date < today && !f.played && (f.home === g.clubId || f.away === g.clubId)) { f.played = true; f.result = f.away ? { score: [0, 0], forfeit: true } : { score: [0, 0] }; }
  }
  if (g.season?.fixtures && g.fixtures && g.season.fixtures !== g.fixtures) g.season.fixtures = g.fixtures; // po imporcie z pliku JSON
  ensureUefa(g); // zapis sprzed etapu 8: puchary UEFA nadrobione w tle
  ensureNational(g);
  ensureTraining(g);
  ensureCareer(g);
  if (!g.inbox.length) {
    g.inbox = [];
    const today = g.date;
    g.date = GAME_START;
    processDay(g);
    g.date = today;
  }
  return g;
}

// ---------- Start ----------
async function renderStart() {
  const slots = await store.listSlots();
  const rows = slots.map((s) => {
    if (s.empty) {
      return `<li class="slot">
        <div class="slot__body"><span class="slot__title">Slot ${s.slot}</span><span class="muted">Pusty</span></div>
        <button class="btn btn--primary" data-act="new" data-slot="${s.slot}">Nowa kariera</button>
      </li>`;
    }
    const club = clubById(s.summary?.clubId);
    return `<li class="slot">
      ${club ? crestHtml(club, { size: 40, clubsById }) : ''}
      <div class="slot__body">
        <span class="slot__title">${esc(club?.name ?? 'Nieznany klub')}</span>
        <span class="muted">${esc(s.summary?.season ?? '')}, ${esc(fmtDate(s.summary?.date ?? GAME_START))}</span>
        ${s.savedAt ? `<span class="muted">Zapisano: ${esc(new Date(s.savedAt).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }))}</span>` : ''}
      </div>
      <div class="slot__actions">
        <button class="btn btn--primary" data-act="load" data-slot="${s.slot}">Graj</button>
        <button class="btn btn--quiet" data-act="export" data-slot="${s.slot}" aria-label="Eksportuj zapis ze slotu ${s.slot}">Eksportuj</button>
        <button class="btn btn--quiet" data-act="delete" data-slot="${s.slot}" aria-label="Usuń zapis ze slotu ${s.slot}">Usuń</button>
      </div>
    </li>`;
  }).join('');

  app.innerHTML = `
  <main class="start">
    <header class="start__head">
      <div class="led" aria-hidden="true">${esc(SEASON)}</div>
      <h1>Manager Piłkarski</h1>
      <p class="muted">Ekstraklasa, 1 Liga, 2 Liga, Puchar Polski i puchary europejskie.</p>
    </header>
    ${state.notice ? `<p class="notice" role="status">${esc(state.notice)}</p>` : ''}
    ${store.isMemoryOnly() ? '<p class="notice" role="status">Ta przeglądarka nie pozwala zapisać gry na stałe. Postęp zniknie po zamknięciu karty; użyj eksportu.</p>' : ''}
    <h2>Zapisy</h2>
    <ul class="slots stripes">${rows}</ul>
    <label class="btn btn--quiet import">Wczytaj zapis z pliku
      <input type="file" accept="application/json,.json" data-act="import" hidden>
    </label>
  </main>`;
  state.notice = null;
}

// ---------- Wybór klubu ----------
function renderPick() {
  const list = CLUBS_PL.filter((c) => c.tier === state.tier && !c.parent);
  const tabs = [1, 2, 3].map((t) => `<button role="tab" aria-selected="${t === state.tier}" class="seg__btn" data-act="tier" data-tier="${t}">${esc(LEAGUE_NAMES[t])}</button>`).join('');
  const rows = list.map((c) => {
    const europe = POLISH_EUROPE_2026.find((e) => e.club === c.id);
    return `<li>
      <button class="club-row" data-act="pick" data-club="${esc(c.id)}">
        ${crestHtml(c, { size: 36, clubsById })}
        <span class="club-row__name">${esc(c.name)}</span>
        <span class="club-row__meta">${europe ? `<span class="tag">${esc(europe.comp)}</span>` : ''}${strength(c.L, c.tier)}</span>
      </button>
    </li>`;
  }).join('');
  app.innerHTML = `
  <main class="pick">
    <header class="bar">
      <button class="btn btn--quiet" data-act="back">Wróć</button>
      <h1 class="bar__title">Wybierz klub</h1>
    </header>
    <div class="seg" role="tablist" aria-label="Liga">${tabs}</div>
    <p class="muted pick__hint">Siła to oczekiwania wobec kadry na tle ligi. Kadry zostaną wylosowane po wyborze klubu.</p>
    <ul class="club-list stripes">${rows}</ul>
  </main>`;
}

function strength(L, tier) {
  const avg = { 1: 11.5, 2: 10, 3: 8.5 }[tier];
  const d = L - avg;
  const label = d >= 0.7 ? 'Faworyt' : d >= 0.2 ? 'Czołówka' : d > -0.25 ? 'Środek' : d > -0.45 ? 'Dół tabeli' : 'Outsider';
  return `<span class="strength" data-level="${label}">${label}</span>`;
}

// ---------- Główny ekran ----------
function goButton(g) {
  if (state.running) return '<button class="go go--stop" data-act="stop">Zatrzymaj</button>';
  const a = primaryAction(g);
  const sub = a.kind === 'play' ? esc(compLabel(a.match)) : a.kind === 'decide' ? `${a.count} do decyzji` : `Następny dzień: ${esc(fmtDate(nextDate(g.date)))}`;
  return `<button class="go go--${a.kind}" data-act="go"><span class="go__label">${esc(a.label)}</span><span class="go__sub">${sub}</span></button>`;
}

function nextDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function renderHub() {
  const g = state.game;
  const club = clubById(g.clubId);
  const unread = unreadCount(g.inbox);
  const nav = TABS.map((t) => `<button class="nav__btn" data-act="tab" data-tab="${t.id}" aria-current="${state.tab === t.id ? 'page' : 'false'}">${icon(t.id)}<span>${esc(t.label)}</span>${t.id === 'poczta' && unread ? `<span class="badge" aria-label="${unread} nieprzeczytanych">${unread > 99 ? '99+' : unread}</span>` : ''}</button>`).join('');
  app.innerHTML = `
  <div class="hub">
    <header class="hub__head">
      ${crestHtml(club, { size: 36, clubsById })}
      <div class="hub__club">
        <span class="hub__name">${esc(club.name)}</span>
        <span class="muted">${esc(LEAGUE_NAMES[club.tier])}</span>
      </div>
      <div class="led hub__date" id="leddate" aria-label="Data w grze: ${esc(fmtDate(g.date))}">${esc(fmtDate(g.date))}</div>
      <div class="go-wrap" id="gowrap">${goButton(g)}</div>
    </header>
    <nav class="nav" aria-label="Menu gry">${nav}</nav>
    <main class="hub__main" id="main">${renderTab(state.tab, g, club)}</main>
    <div class="ticker" id="ticker" aria-live="polite"></div>
  </div>`;
  mountDrawAnimation(app);
}

function renderTab(tab, g, club) {
  if (tab === 'pulpit') return renderDashboard(g, club);
  if (tab === 'poczta') return renderMail(g);
  if (tab === 'trening') return renderTraining(g, state);
  if (tab === 'transfery') return state.ng ? renderNegotiation(g, state.ng) : renderTransfers(g, state);
  if (tab === 'rozgrywki') return renderCompetitions(g, { comp: state.cComp ?? ['ekstraklasa', 'liga1', 'liga2'][club.tier - 1], view: state.cView, round: state.cRound, filter: state.uFilter, draw: state.uDraw });
  if (tab === 'kadra') {
    const sub = `<div class="subtabs" role="tablist"><button role="tab" data-act="tsub" data-s="players" aria-selected="${state.sqSub === 'players'}">Zawodnicy</button><button role="tab" data-act="tsub" data-s="tactics" aria-selected="${state.sqSub === 'tactics'}">Skład i taktyka</button><button role="tab" data-act="tsub" data-s="talks" aria-selected="${state.sqSub === 'talks'}">Rozmowy</button></div>`;
    if (state.sqSub === 'talks') return sub + renderTalks(g, state);
    if (state.sqSub === 'tactics') {
      queueMicrotask(mountTacticsScreen); // po wstawieniu HTML: okno atrybutów i fokus
      return sub + renderTactics({ squad: mySquad(g), tactics: g.tactics, sel: state.tSel, benchSize: benchSizeFor(g), info: state.tInfo, msg: state.tMsg });
    }
    const ovrs = leagueOvrs(g, club.tier);
    const p = state.playerOpen && g.world.players[state.playerOpen];
    if (p) return renderPlayerProfile(p, { leagueOvrs: ovrs, clubName: club.name, date: g.date });
    return sub + renderSquadList(squadOf(g.world, g.clubId), { filter: state.sqFilter, leagueOvrs: ovrs, academy: academyOf(g.world, g.clubId) });
  }
  const soon = {
    transfery: ['Lista transferowa, wypożyczenia, wolni zawodnicy', 'Negocjacje kontraktów', 'Okna transferowe'],
  }[tab];
  const label = TABS.find((t) => t.id === tab).label;
  return `<h2>${esc(label)}</h2>
    <section class="panel">
      <p class="panel__lead">Ten ekran powstaje w kolejnych etapach.</p>
      <ul class="plain">${soon.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    </section>`;
}

// ---------- Pulpit ----------
// Tablica meczowa (najbliższy mecz) i panele z danymi gry. Każdy panel ma własny kolor i formę danych:
// tabela wokół klubu, wskaźnik zaufania zarządu, paski budżetów, oś okna transferowego, absencje, poczta.
// Układ: siatka od jednej kolumny (telefon) do czterech (szeroki PC), zob. src/styles/dashboard.css.
const LEAGUE_COMP_OF_TIER = { 1: 'ekstraklasa', 2: 'liga1', 3: 'liga2' };
const dayNo = (iso) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 864e5;
const daysBetween = (a, b) => Math.round(dayNo(b) - dayNo(a));
const shortDate = (iso) => fmtDate(iso).replace(/, \d{4}$/, '');
const fewPl = (n) => n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
const plural = (n, one, few, many) => (n === 1 ? one : fewPl(n) ? few : many);
const daysWord = (n) => (n === 1 ? 'dzień' : 'dni');
const signedZl = (n) => `${n > 0 ? '+' : ''}${fmtZl(n)}`;
const DASH_ICONS = {
  table: '<path d="M4 5h16v14H4zM4 10h16M4 14.5h16M9 5v14"/>',
  board: '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6M3 20h18"/>',
  fin: '<ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v5.5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6.5M5 12v5.5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V12"/>',
  squad: '<path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z"/>',
};
const dashIcon = (k) => (DASH_ICONS[k] ? `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${DASH_ICONS[k]}</svg>` : icon(k));
// data-sub: docelowa podzakładka (np. Transfery > Finanse), gdy obsługa kliknięcia ją uwzględni
const dashLink = (tab, label, sub = '') => `<button class="dash-link" data-act="tab" data-tab="${tab}"${sub ? ` data-sub="${sub}"` : ''}>${esc(label)}</button>`;
const dashPanel = (key, ico, title, body, link = '') => `
  <section class="dash-p dash-p--${key}" aria-labelledby="dp-${key}">
    <header class="dash-p__head"><span class="dash-p__ico">${dashIcon(ico)}</span><h3 id="dp-${key}">${title}</h3>${link}</header>
    <div class="dash-p__body">${body}</div>
  </section>`;

/** Ostatnie wyniki klubu we wszystkich rozgrywkach (najstarszy pierwszy). */
function dashForm(g, clubId, n = 5) {
  return (g.fixtures || []).filter((f) => f.played && f.result?.score && (f.home === clubId || f.away === clubId))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-n)
    .map((f) => {
      const home = f.home === clubId;
      const [a, b] = f.result.score;
      const me = home ? a : b; const op = home ? b : a;
      return { r: me > op ? 'W' : me < op ? 'P' : 'R', score: `${me}:${op}`, opp: anyClub(home ? f.away : f.home)?.name ?? '', home };
    });
}

function formHtml(list) {
  if (!list.length) return '<span class="dash-form dash-form--none">Bez meczów w tym sezonie</span>';
  const word = { W: 'Wygrana', R: 'Remis', P: 'Porażka' };
  return `<ol class="dash-form" aria-label="Ostatnie mecze, od najstarszego">${list.map((x) => {
    const t = `${word[x.r]} ${x.score}${x.opp ? ` z ${x.opp}` : ''} (${x.home ? 'u siebie' : 'na wyjeździe'})`;
    return `<li data-r="${x.r}" title="${esc(t)}"><span aria-hidden="true">${x.r}</span><span class="sr">${esc(t)}</span></li>`;
  }).join('')}</ol>`;
}

/** Tabela ligowa poziomu (1-3), liczona raz na render pulpitu. */
function dashTables(g) {
  const cache = new Map();
  return (tier) => {
    if (!cache.has(tier)) cache.set(tier, standings(g.fixtures.filter((f) => f.comp === LEAGUE_COMP_OF_TIER[tier]), CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id)));
    return cache.get(tier);
  };
}

function dashHero(g, club, next, tableOf) {
  if (!next) {
    return `<section class="dash-hero dash-hero--empty" aria-labelledby="dh-t">
      <h3 id="dh-t" class="dash-hero__comp">Następny mecz</h3>
      <p class="dash-hero__none">Brak zaplanowanych meczów. Terminarz pojawi się po losowaniu lub w nowym sezonie.</p>
    </section>`;
  }
  const days = Math.max(0, daysBetween(g.date, next.date));
  const team = (id) => {
    const c = id ? anyClub(id) : null;
    const pl = id ? clubById(id) : null; // polski klub ligowy: miejsce w tabeli
    const row = pl && pl.tier >= 1 && pl.tier <= 3 ? tableOf(pl.tier).find((r) => r.id === id) : null;
    const meta = row ? (row.played ? `${row.pos}. miejsce${pl.tier !== club.tier ? `, ${LEAGUE_NAMES[pl.tier]}` : ''}, ${row.points} pkt` : LEAGUE_NAMES[pl.tier]) : '';
    return `<div class="dash-team${id === g.clubId ? ' is-me' : ''}">
      ${c ? crestHtml(c, { size: 72, clubsById }) : '<span class="dash-team__tbd" aria-hidden="true">?</span>'}
      <b class="dash-team__name">${c ? esc(c.name) : 'Rywal z losowania'}</b>
      ${meta ? `<span class="dash-team__meta">${esc(meta)}</span>` : ''}
      ${c ? formHtml(dashForm(g, id)) : ''}
    </div>`;
  };
  const venue = next.neutral ? 'teren neutralny' : next.home === g.clubId ? 'u siebie' : 'na wyjeździe';
  const led = days === 0 ? (next.time ?? '0') : String(days);
  const ledLabel = days === 0 ? 'mecz dziś' : days === 1 ? 'dzień do meczu' : 'dni do meczu';
  const upcoming = (g.fixtures || []).filter((f) => !f.played && f !== next && (f.home === g.clubId || f.away === g.clubId))
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))).slice(0, 3);
  const upRow = (f) => {
    const oppId = f.home === g.clubId ? f.away : f.home;
    const o = oppId ? anyClub(oppId) : null;
    return `<li>
      <span class="dash-up__date">${esc(shortDate(f.date))}</span>
      ${o ? crestHtml(o, { size: 22, clubsById }) : '<span class="dash-up__tbd" aria-hidden="true"></span>'}
      <span class="dash-up__opp"><b>${o ? esc(o.name) : 'Rywal z losowania'}</b><small>${esc(compLabel(f))}, ${f.neutral ? 'teren neutralny' : f.home === g.clubId ? 'u siebie' : 'na wyjeździe'}</small></span>
    </li>`;
  };
  return `<section class="dash-hero" aria-labelledby="dh-t">
    <header class="dash-hero__top">
      <h3 id="dh-t" class="dash-hero__comp">${esc(compLabel(next))}</h3>
      <p class="dash-hero__when">${esc(weekday(next.date))}, ${esc(fmtDate(next.date))}${next.time ? `, ${esc(next.time)}` : ''}, ${venue}</p>
    </header>
    <div class="dash-hero__match">
      ${team(next.home)}
      <div class="dash-kick${days === 0 ? ' is-today' : ''}" role="img" aria-label="${days === 0 ? `Mecz dziś${next.time ? ` o ${esc(next.time)}` : ''}` : `${days} ${daysWord(days)} do meczu`}">
        <span class="dash-kick__led" aria-hidden="true">${esc(led)}</span>
        <span class="dash-kick__lbl" aria-hidden="true">${ledLabel}</span>
      </div>
      ${team(next.away)}
    </div>
    ${upcoming.length ? `<footer class="dash-up"><h4 class="dash-up__title">Kolejne mecze</h4><ol class="dash-up__list">${upcoming.map(upRow).join('')}</ol></footer>` : ''}
  </section>`;
}

function dashTable(g, club, table) {
  const zones = zonesFor(club.tier);
  const zoneOf = (pos) => zones.find((z) => pos >= z.from && pos <= z.to);
  const n = table.length;
  const i = Math.max(0, table.findIndex((r) => r.id === g.clubId));
  // Najmniejsze okno tabeli wokół klubu, w którym wiersz się mieści: CSS pokazuje 7, 11 albo wszystkie wiersze
  const kOf = (j) => { for (let k = 1; k <= n; k++) { const s = Math.min(Math.max(0, i - Math.floor((k - 1) / 2)), n - k); if (j >= s && j < s + k) return k; } return n; };
  const tierCls = (k) => (k <= 7 ? '' : k <= 11 ? 'dash-row--11' : 'dash-row--all');
  const rows = table.map((r, j) => {
    const c = clubById(r.id);
    const z = zoneOf(r.pos);
    const me = r.id === g.clubId;
    return `<tr class="${[me ? 'is-me' : '', tierCls(kOf(j))].filter(Boolean).join(' ')}"${z ? ` data-z="${z.kind}"` : ''}${me ? ' aria-current="true"' : ''}>
      <td class="dash-t__pos">${r.pos}</td>
      <td class="dash-t__club"><span class="dash-t__cl">${crestHtml(c, { size: 20, clubsById })}<span>${esc(c.name)}</span></span></td>
      <td>${r.played}</td><td>${r.goalDiff > 0 ? '+' : ''}${r.goalDiff}</td><td class="dash-t__pts">${r.points}</td>
    </tr>`;
  }).join('');
  const me = table[i];
  const legend = zones.map((z) => `<li data-z="${z.kind}">${esc(z.label)}</li>`).join('');
  const body = `<table class="dash-t">
      <caption class="sr">${esc(LEAGUE_NAMES[club.tier])}: tabela wokół twojego klubu</caption>
      <thead><tr><th scope="col"><span class="sr">Miejsce</span></th><th scope="col">Klub</th><th scope="col"><abbr title="Mecze">M</abbr></th><th scope="col"><abbr title="Bilans bramek">+/-</abbr></th><th scope="col">Pkt</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="dash-note">${me.played ? `${me.played} ${plural(me.played, 'mecz', 'mecze', 'meczów')}: ${me.wins} ${plural(me.wins, 'wygrana', 'wygrane', 'wygranych')}, ${me.draws} ${plural(me.draws, 'remis', 'remisy', 'remisów')}, ${me.losses} ${plural(me.losses, 'porażka', 'porażki', 'porażek')}, bramki ${me.gf}:${me.ga}.` : 'Liga jeszcze nie wystartowała. Kolejność w tabeli jest umowna.'}</p>
    <ul class="dash-zones">${legend}</ul>`;
  return dashPanel('table', 'table', esc(LEAGUE_NAMES[club.tier]), body, dashLink('rozgrywki', 'Pełna tabela'));
}

function dashBoard(g, table) {
  const B = g.board ?? {};
  const t = Math.round(B.trust ?? 60);
  const band = t >= 55 ? 'good' : t >= 40 ? 'mid' : t >= 25 ? 'warn' : 'bad';
  const me = table.find((r) => r.id === g.clubId);
  const target = B.goal?.target;
  const ladder = target ? `<ol class="dash-ladder" aria-hidden="true">${table.map((r) => `<li class="${[r.pos <= target ? 'in' : '', r.id === g.clubId ? 'me' : ''].filter(Boolean).join(' ')}"></li>`).join('')}</ol>
      <p class="dash-ladder__cap"><span>1.</span><span>${me?.played ? `teraz ${me.pos}., cel: ${target === 1 ? '1. miejsce' : `1-${target}. miejsce`}` : `cel: ${target === 1 ? '1. miejsce' : `1-${target}. miejsce`}`}</span><span>${table.length}.</span></p>` : '';
  const rev = B.reviews?.[0];
  const fans = B.fansMood != null ? fanMoodLabel(B.fansMood) : null;
  const body = `<div class="dash-gauge" data-b="${band}">
      <svg viewBox="0 0 120 66" role="img" aria-label="Zaufanie zarządu: ${t} na 100, ${esc(trustLabel(t).toLowerCase())}">
        <path class="dash-gauge__track" d="M10 60 A50 50 0 0 1 110 60" pathLength="100"/>
        <path class="dash-gauge__fill" d="M10 60 A50 50 0 0 1 110 60" pathLength="100" stroke-dasharray="${t} 100"/>
      </svg>
      <div class="dash-gauge__val" aria-hidden="true"><b>${t}</b><span>${esc(trustLabel(t))}</span></div>
    </div>
    ${B.goal?.text ? `<p class="dash-goal">Cel sezonu: <b>${esc(B.goal.text)}</b></p>` : ''}
    ${ladder}
    <ul class="dash-facts">
      ${rev ? `<li><span>Ostatnia ocena, ${esc(shortDate(rev.date))}</span><b data-sign="${rev.delta > 0 ? 'up' : rev.delta < 0 ? 'down' : ''}">${rev.delta > 0 ? '+' : ''}${esc(String(rev.delta).replace('.', ','))}</b></li>` : '<li><span>Pierwsza ocena zarządu</span><b>1. dnia miesiąca</b></li>'}
      ${fans ? `<li><span>Kibice</span><b>${esc(fans)}</b></li>` : ''}
    </ul>`;
  return dashPanel('board', 'board', 'Zarząd', body, dashLink('transfery', 'Transfery', 'zarzad'));
}

function dashFinance(g) {
  const c = g.finance?.clubs?.[g.clubId];
  if (!c) return dashPanel('fin', 'fin', 'Finanse', '<p class="dash-note">Brak danych o finansach klubu.</p>');
  const diff = c.balance - c.start;
  const spend = spendable(g.finance, g.clubId);
  const bill = wageBill(g.world, g.clubId);
  const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);
  const month = monthSummary(c, g.date.slice(0, 7));
  const body = `<p class="dash-money"><b class="${c.balance < 0 ? 'neg' : ''}">${esc(fmtZl(c.balance))}</b><span>saldo klubu, <span data-sign="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${esc(signedZl(diff))}</span> od startu sezonu</span></p>
    <div class="dash-meter">
      <p><span>Do wydania na transfery</span><b>${esc(fmtZl(spend))}</b></p>
      <span class="dash-bar" role="img" aria-label="Wolne ${pct(spend, c.transferBudget)}% budżetu transferowego"><i style="width:${pct(spend, c.transferBudget)}%"></i></span>
      <small>z budżetu ${esc(fmtZl(c.transferBudget))}</small>
    </div>
    <div class="dash-meter${bill > c.wageBudget ? ' is-over' : ''}">
      <p><span>Płace tygodniowo</span><b>${esc(fmtZl(bill))}</b></p>
      <span class="dash-bar" role="img" aria-label="Płace to ${pct(bill, c.wageBudget)}% budżetu płac"><i style="width:${pct(bill, c.wageBudget)}%"></i></span>
      <small>${bill > c.wageBudget ? `ponad budżet ${esc(fmtZl(c.wageBudget))}` : `z budżetu ${esc(fmtZl(c.wageBudget))}`}</small>
    </div>
    <p class="dash-note">Bilans miesiąca: <span data-sign="${month.net > 0 ? 'up' : month.net < 0 ? 'down' : ''}">${esc(signedZl(month.net))}</span></p>`;
  return dashPanel('fin', 'fin', 'Finanse', body, dashLink('transfery', 'Transfery', 'finanse'));
}

function dashWindow(g) {
  const ws = DOMESTIC.transferWindows;
  const tw = ws.find((w) => g.date >= w.from && g.date <= w.to);
  const offers = (g.market?.offers ?? []).filter((o) => o.kind === 'incoming' && o.status === 'open').length;
  let body;
  if (tw) {
    const left = daysBetween(g.date, tw.to);
    const pct = Math.round((daysBetween(tw.from, g.date) / Math.max(1, daysBetween(tw.from, tw.to))) * 100);
    body = `<p class="dash-count"><b>${left}</b><span>${left === 0 ? 'ostatni dzień okna' : `${daysWord(left)} do zamknięcia okna`}</span></p>
      <div class="dash-tl" role="img" aria-label="Okno otwarte od ${esc(fmtDate(tw.from))} do ${esc(fmtDate(tw.to))}">
        <span class="dash-tl__bar"><i style="width:${pct}%"></i><b style="left:${pct}%"></b></span>
        <span class="dash-tl__ends"><span>${esc(shortDate(tw.from))}</span><span>${esc(fmtDate(tw.to))}</span></span>
      </div>`;
  } else {
    const nx = ws.filter((w) => w.from > g.date).sort((a, b) => a.from.localeCompare(b.from))[0];
    const inDays = nx ? daysBetween(g.date, nx.from) : null;
    body = `<p class="dash-count dash-count--closed"><b>Zamknięte</b></p>
      <p class="dash-note">${nx ? `Następne okno od ${esc(fmtDate(nx.from))}, za ${inDays} ${daysWord(inDays)}. Do tego czasu możesz podpisywać wolnych zawodników i przedłużać kontrakty.` : 'Terminy kolejnego okna pojawią się w nowym sezonie.'}</p>`;
  }
  body += offers ? `<p class="dash-alert">${offers} ${plural(offers, 'oferta', 'oferty', 'ofert')} za twoich zawodników czeka na odpowiedź.</p>` : '';
  // Ostatnie ruchy: najpierw twojego klubu, potem w twojej lidze (z historii rynku)
  const tier = clubById(g.clubId)?.tier;
  const hist = g.market?.history ?? [];
  const mine = hist.filter((h) => h.from === g.clubId || h.to === g.clubId);
  const league = hist.filter((h) => !mine.includes(h) && [h.from, h.to].some((id) => id && clubById(id)?.tier === tier));
  const moves = [...mine, ...league].slice(0, 2);
  const clubName = (id) => (id ? anyClub(id)?.name ?? 'klub zagraniczny' : 'wolny zawodnik');
  const arrow = '<svg class="dash-moves__arrow" viewBox="0 0 16 10" aria-hidden="true"><path d="M1 5h13M10 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sr">do</span>';
  const route = (h) => (h.kind === 'release'
    ? `${esc(clubName(h.from))}, rozwiązany kontrakt`
    : `${esc(clubName(h.from))} ${arrow} ${esc(clubName(h.to))}`);
  const terms = (h) => (h.kind === 'release' ? '' : `${h.kind === 'loan' ? 'wypożyczenie' : h.fee ? fmtZl(h.fee) : 'bez odstępnego'}, `);
  if (moves.length) {
    body += `<h4 class="dash-sub">${mine.length ? 'Ostatnie ruchy' : 'Ostatnie ruchy w lidze'}</h4>
      <ul class="dash-moves">${moves.map((h) => `<li${h.from === g.clubId || h.to === g.clubId ? ' class="is-mine"' : ''}><b>${esc(h.name)}</b><span class="dash-moves__route">${route(h)}</span><small>${esc(terms(h))}${esc(shortDate(h.date))}</small></li>`).join('')}</ul>`;
  }
  return dashPanel('window', 'transfery', 'Okno transferowe', body, dashLink('transfery', offers ? 'Zobacz oferty' : 'Transfery', offers ? 'oferty' : 'rynek'));
}

function dashSquad(g) {
  const squad = mySquad(g);
  const xi = (g.tactics?.xi ?? []).map((id) => g.world.players[id]).filter(Boolean);
  const fresh = xi.length ? Math.round(xi.reduce((s, p) => s + (p.fresh ?? 95), 0) / xi.length) : null;
  const morale = teamMorale(squadOf(g.world, g.clubId));
  const coh = teamCohesion(g);
  const out = squad.filter((p) => p.injuryDays > 0 || p.suspended > 0 || p.callUp)
    .sort((a, b) => (b.injuryDays ?? 0) - (a.injuryDays ?? 0));
  const why = (p) => (p.injuryDays > 0 ? ['inj', `uraz, ${p.injuryDays} ${daysWord(p.injuryDays)}`]
    : p.suspended > 0 ? ['susp', `pauza, ${p.suspended} ${plural(p.suspended, 'mecz', 'mecze', 'meczów')}`] : ['call', 'reprezentacja']);
  const list = out.slice(0, 5).map((p) => {
    const [k, txt] = why(p);
    return `<li><span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span><span class="dash-abs__name">${esc(p.name)}</span><span class="dash-abs__why" data-k="${k}">${esc(txt)}</span></li>`;
  }).join('');
  const freshBand = fresh == null ? '' : fresh >= 80 ? 'good' : fresh >= 65 ? 'mid' : 'low';
  const ending = squadOf(g.world, g.clubId).filter((p) => !p.loan && p.contract?.until && daysBetween(g.date, p.contract.until) <= 365)
    .sort((a, b) => a.contract.until.localeCompare(b.contract.until) || b.ovr - a.ovr);
  const endList = ending.slice(0, 6).map((p, k) => `<li${k >= 3 ? ' class="dash-more"' : ''}><span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span><span class="dash-abs__name">${esc(p.name)}</span><span class="dash-abs__why" data-k="contract">${esc(fmtDate(p.contract.until))}</span></li>`).join('');
  const body = `<ul class="dash-stats">
      <li><span>Morale</span><b>${esc(moraleLabel(morale))}</b></li>
      <li><span>Świeżość składu</span><b data-b="${freshBand}">${fresh == null ? 'brak składu' : `${fresh}%`}</b></li>
      <li><span>Zgranie</span><b>${esc(coh.label)}</b></li>
    </ul>
    <h4 class="dash-sub">Niedostępni${out.length ? ` (${out.length})` : ''}</h4>
    ${out.length ? `<ul class="dash-abs">${list}</ul>${out.length > 5 ? `<p class="dash-note">i jeszcze ${out.length - 5}</p>` : ''}` : '<p class="dash-note dash-note--ok">Wszyscy zawodnicy są do dyspozycji.</p>'}
    ${ending.length ? `<h4 class="dash-sub">Kontrakt kończy się w ciągu roku (${ending.length})</h4><ul class="dash-abs">${endList}</ul>` : ''}`;
  return dashPanel('squad', 'squad', 'Stan kadry', body, dashLink('kadra', 'Kadra'));
}

function dashMail(g) {
  const unread = unreadCount(g.inbox);
  const pend = pendingDecisions(g.inbox);
  const latest = g.inbox.slice(0, 8);
  const body = `${pend.length ? `<button class="dash-decide" data-act="mail" data-id="${esc(pend[0].id)}"><span class="dash-decide__card" aria-hidden="true"></span>${pend.length} ${plural(pend.length, 'wiadomość czeka', 'wiadomości czekają', 'wiadomości czeka')} na twoją decyzję</button>` : ''}
    <ul class="mail-list stripes dash-mail">${latest.map((m, k) => (k >= 5 ? mailRow(m).replace('<li>', '<li class="dash-more">') : mailRow(m))).join('') || '<li class="mail-empty">Brak wiadomości.</li>'}</ul>`;
  return dashPanel('mail', 'poczta', `Poczta${unread ? ` <span class="dash-p__count">${unread} ${plural(unread, 'nowa', 'nowe', 'nowych')}</span>` : ''}`, body, dashLink('poczta', 'Cała poczta'));
}

function renderDashboard(g, club) {
  const tableOf = dashTables(g);
  const table = tableOf(club.tier);
  return `<div class="dash">
    <h2 class="dash__title">Pulpit</h2>
    <div class="dash__grid">
      ${dashHero(g, club, nextFixture(g), tableOf)}
      ${dashTable(g, club, table)}
      ${dashSquad(g)}
      ${dashMail(g)}
      ${dashBoard(g, table)}
      ${dashFinance(g)}
      ${dashWindow(g)}
    </div>
  </div>`;
}

function mailRow(m) {
  return `<li><button class="mail-row ${m.read ? '' : 'mail-row--unread'}" data-act="mail" data-id="${esc(m.id)}">
    <span class="mail-row__dot" data-p="${esc(m.priority)}" aria-hidden="true"></span>
    <span class="mail-row__body"><span class="mail-row__subj">${esc(m.subject)}</span><span class="mail-row__from">${esc(m.from)}, ${esc(CATEGORIES[m.category])}</span></span>
    <span class="mail-row__date">${esc(fmtDate(m.date).replace(/, \d{4}$/, ''))}</span>
  </button></li>`;
}

function renderMail(g) {
  if (state.mailOpen) {
    const m = g.inbox.find((x) => x.id === state.mailOpen);
    if (m) {
      return `<button class="btn btn--quiet" data-act="mailback">Wróć do skrzynki</button>
      <article class="mail-view">
        <p class="muted">${esc(m.from)}, ${esc(CATEGORIES[m.category])}, ${esc(fmtDate(m.date))}</p>
        <h2>${esc(m.subject)}</h2>
        <p>${esc(m.body)}</p>
        ${m.actions.length && !m.resolved ? `<div class="mail-actions">${m.actions.map((a) => `<button class="btn btn--primary" data-act="mailaction" data-id="${esc(m.id)}" data-a="${esc(a.id)}">${esc(a.label)}</button>`).join('')}</div>` : ''}
        ${m.chosen ? `<p class="muted">Twoja odpowiedź: ${esc(m.actions.find((a) => a.id === m.chosen)?.label ?? '')}</p>` : ''}
        ${canDelete(m) ? `<p><button class="btn btn--quiet btn--sm" data-act="maildel" data-id="${esc(m.id)}">Usuń wiadomość</button></p>` : ''}
      </article>`;
    }
  }
  const cats = Object.entries(CATEGORIES).filter(([k]) => g.inbox.some((m) => m.category === k));
  const chips = [['', 'Wszystkie', unreadCount(g.inbox)], ...cats.map(([k, v]) => [k, v, unreadCount(g.inbox, k)])]
    .map(([k, v, n]) => `<button class="chip" data-act="mailcat" data-cat="${k}" aria-pressed="${(state.mailCat || '') === k}">${esc(v)}${n ? ` <b>${n}</b>` : ''}</button>`).join('');
  const list = filterInbox(g.inbox, state.mailCat);
  const pending = pendingDecisions(g.inbox).length;
  return `<div class="mail-head"><h2>Poczta</h2><span class="mail-tools"><button class="btn btn--quiet btn--sm" data-act="readall">Oznacz jako przeczytane</button><button class="btn btn--quiet btn--sm" data-act="mailprune" data-m="read">Usuń przeczytane</button><button class="btn btn--quiet btn--sm" data-act="mailprune" data-m="old">Usuń starsze niż 30 dni</button></span></div>
    <p class="hint">${g.inbox.length} wiadomości. Stare przeczytane wiadomości gra usuwa sama co tydzień. Wiadomości z decyzją do podjęcia zostają.</p>
    ${pending ? `<p class="notice">Masz ${pending} ${pending === 1 ? 'wiadomość wymagającą' : 'wiadomości wymagające'} odpowiedzi.</p>` : ''}
    <div class="chips">${chips}</div>
    <ul class="mail-list stripes">${list.map(mailRow).join('') || '<li class="mail-empty">Brak wiadomości w tej kategorii.</li>'}</ul>`;
}

/** Po zmianie kadry (transfer, rozwiązanie, nowy klub): skład i trening dla nowych zawodników. */
function afterSquadChange(g) {
  g.tactics = refreshTactics(g.tactics, mySquad(g), { benchSize: benchSizeFor(g) }).tactics;
  ensureTraining(g);
  leagueOvrCache.clear?.();
}

// ---------- Dzień meczowy na żywo (etap 5) ----------
function renderLiveMatchday() {
  if (state.md) return;
  const g = state.game;
  const f = primaryAction(g).match;
  state.md = mountMatchday(app, {
    game: g, fixture: f, save,
    onExit: () => { state.md = null; state.screen = 'hub'; state.tab = 'pulpit'; render(); },
  });
}

// ---------- Mecz bez rywala (UEFA przed etapem 8): wynik od razu ----------
function renderMatchDay() {
  const g = state.game;
  const f = primaryAction(g).match;
  const side = (id) => (anyClub(id) ? `<div class="fixture__team">${crestHtml(anyClub(id), { size: 64, clubsById })}${esc(anyClub(id).name)}</div>` : '<div class="fixture__team">Rywal z losowania</div>');
  app.innerHTML = `
  <main class="start">
    <div class="led">${esc(fmtDate(g.date))}${f.time ? `, ${esc(f.time)}` : ''}</div>
    <h1>Dzień meczowy</h1>
    <p class="panel__lead">${esc(compLabel(f))}</p>
    <div class="fixture">${side(f.home)}<div class="fixture__mid"><span class="led">vs</span></div>${side(f.away)}</div>
    ${state.matchNotes.length ? `<section class="panel"><p class="muted">Asystent poprawił skład:</p><ul class="plain">${state.matchNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
    ${f.away ? '<button class="btn btn--primary" data-act="playnow">Rozegraj mecz</button>' : '<button class="btn btn--primary" data-act="endmatch">Zakończ mecz (rywal UEFA w etapie 8)</button>'}
    <p class="muted">Mecz rozgrywa pełny silnik minuta po minucie z Twoim składem i taktyką, a zmiany robi asystent. Oglądanie meczu na żywo, odprawy i studio dojdą w etapie 5.</p>
    <p><a class="btn btn--quiet" href="design/dzien-meczowy.html" target="_blank" rel="noopener">Prototyp dnia meczowego</a></p>
  </main>`;
}

function renderMatchResult() {
  const { f, r } = state.lastResult;
  const g = state.game;
  const s = r.stats;
  const rows = [['Posiadanie %', 'possession'], ['Strzały', 'shots'], ['Celne', 'onTarget'], ['xG', 'xg'], ['Podania', 'passes'], ['Celność podań %', 'passAccuracy'], ['Rożne', 'corners'], ['Auty', 'throwIns'], ['Faule', 'fouls'], ['Spalone', 'offsides'], ['Żółte kartki', 'yellow'], ['Czerwone kartki', 'red'], ['Obrony', 'saves']];
  const key = r.events.filter((e) => ['goal', 'red', 'penalty', 'varOverturn', 'injury', 'sub', 'shootoutKick'].includes(e.type) || (e.type === 'yellow'));
  const mine = r.ratings.filter((x) => x.side === (f.home === g.clubId ? 0 : 1)).sort((a, b) => b.rating - a.rating);
  const motm = r.ratings.find((x) => x.id === r.motm);
  app.innerHTML = `
  <main class="start">
    <h1>Wynik meczu</h1>
    <p class="muted">${esc(compLabel(f))}, ${esc(fmtDate(f.date))}</p>
    <div class="board result-board">
      <div class="board__t">${crestHtml(anyClub(f.home), { size: 30, clubsById })}<span>${esc(anyClub(f.home).short)}</span></div>
      <div><div class="board__score">${r.score[0]}:${r.score[1]}</div><span class="board__min">${r.shootout ? `karne ${r.shootout.goals[0]}:${r.shootout.goals[1]}` : r.extraTime ? 'po dogrywce' : 'Koniec'}</span></div>
      <div class="board__t"><span>${esc(anyClub(f.away).short)}</span>${crestHtml(anyClub(f.away), { size: 30, clubsById })}</div>
    </div>
    ${motm ? `<p class="panel__lead">Zawodnik meczu: ${esc(motm.name)} (${motm.rating.toFixed(1)})</p>` : ''}
    <h2>Przebieg</h2>
    <ul class="plain-list">${key.map((e) => `<li><span class="k">${esc(e.min)}</span>${e.side != null ? `<span class="tag">${esc(anyClub(e.side === 0 ? f.home : f.away).short)}</span>` : ''}<span>${esc(e.text ?? e.type)}</span></li>`).join('') || '<li>Spokojny mecz bez ważnych wydarzeń.</li>'}</ul>
    <h2>Statystyki</h2>
    <table class="vs-table"><tbody>${rows.map(([l, k]) => `<tr><td>${s[0][k]}</td><td class="lbl">${esc(l)}</td><td>${s[1][k]}</td></tr>`).join('')}</tbody></table>
    <h2>Oceny Twoich zawodników</h2>
    <ul class="plain-list">${mine.map((x) => `<li><span class="k">${esc(x.pos)}</span><span style="flex:1">${esc(x.name)}${x.g ? `, gole: ${x.g}` : ''}${x.a ? `, asysty: ${x.a}` : ''}${x.injury ? `, kontuzja: ${esc(x.injury.name)}` : ''}</span><b>${x.rating.toFixed(1)}</b></li>`).join('')}</ul>
    <button class="btn btn--primary" data-act="resultdone">Wróć do gry</button>
  </main>`;
  window.scrollTo({ top: 0 });
}

async function playMyMatch() {
  const g = state.game;
  const f = primaryAction(g).match;
  const mySide = f.home === g.clubId ? 0 : 1;
  const oppId = mySide === 0 ? f.away : f.home;
  const oppClub = anyClub(oppId);
  const oppSquad = squadFor(g, oppId, f.comp);
  const tierComp = LEAGUE_COMPS.includes(f.comp) ? f.comp : 'pucharPolski';
  const bench = COMPETITIONS[tierComp]?.benchSize ?? 12;
  const cfgFor = (id, squad, tactics, ai) => ({ club: anyClub(id), squad, tactics, ai, coach: anyClub(id)?.coach ?? 'P' });
  const mine = cfgFor(g.clubId, mySquad(g), g.tactics, false);
  const theirs = cfgFor(oppId, oppSquad, createTactics(oppSquad, { benchSize: bench }), true);
  Object.assign(mine, trainingMatchInput(g, g.clubId, mine));
  Object.assign(theirs, trainingMatchInput(g, oppId, theirs));
  const M = createMatch({
    seed: `${g.seed}:${f.id}`,
    home: mySide === 0 ? mine : theirs,
    away: mySide === 0 ? theirs : mine,
    ctx: { neutral: !!f.neutral, var: f.comp === 'ekstraklasa' || f.comp === 'super' || f.round === 'SF' || f.round === 'F', rank: f.comp === 'pp' ? (f.round === 'F' ? 3 : 1) : f.comp === 'super' ? 2 : 0, refStrict: 0.85 + new Rng(f.id).next() * 0.35, knockout: f.knockout === 'single' ? 'single' : false },
  });
  const r = runToEnd(M, { assistantFor: [mySide] });
  if (f.knockout === 'penaltiesOnly' && r.score[0] === r.score[1] && !r.shootout) {
    const rng = new Rng(`karne:${f.id}`);
    r.shootout = { goals: rng.chance(0.5) ? [4, 3] : [3, 4], kicks: [] };
  }
  const rng = new Rng(`wynik:${g.seed}:${f.id}`);
  const msgs = applyResult(g, f, fromEngineResult(r), rng);
  for (const [priority, subject, body] of msgs) g.inbox.unshift({ id: `m:${f.id}:${subject}`, key: `m:${f.id}:${subject}`, date: g.date, category: 'staff', from: 'Sztab', subject, body, priority, actions: [], read: false, resolved: true });
  await save();
  state.lastResult = { f, r };
  state.screen = 'matchResult';
  render();
}

// ---------- Upływ dni ----------
async function runDays() {
  const g = state.game;
  state.running = true;
  renderHub();
  let reason = 'limit';
  for (let i = 0; i < 120 && state.running; i++) {
    const r = continueUntilStop(g, { maxDays: 1 });
    const day = r.days[0];
    if (day) {
      const led = document.getElementById('leddate');
      if (led) led.textContent = fmtDate(g.date);
      const tick = document.getElementById('ticker');
      if (tick && day.added.length) tick.textContent = `${fmtDate(day.date)}: ${day.added[0].subject}`;
      await new Promise((res) => setTimeout(res, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 110));
    }
    if (r.reason !== 'limit') { reason = r.reason; break; }
  }
  state.running = false;
  if (reason === 'message' || reason === 'decision') { state.tab = 'poczta'; state.mailOpen = null; state.mailCat = null; }
  await save();
  renderHub();
}


// ---------- Skład: przeciąganie, wybór dwoma dotknięciami, panel atrybutów ----------
const WIDE_INFO = '(min-width: 1280px)'; // od tej szerokości panel atrybutów stoi obok listy
const tUi = { focus: null, infoReturn: null, infoOpened: false, lastTap: null, ctx: null };

/** Kadra i ławka do reguł ruchów (pamiętane dla bieżącej taktyki, bo przeciąganie pyta przy każdym ruchu). */
function tCtx(g) {
  if (tUi.ctx?.tactics !== g.tactics) tUi.ctx = { tactics: g.tactics, byId: new Map(mySquad(g).map((p) => [p.id, p])), benchSize: benchSizeFor(g) };
  return tUi.ctx;
}

const tacticsOpen = () => state.screen === 'hub' && state.tab === 'kadra' && state.sqSub === 'tactics';

/** Selektor elementu, na który wraca fokus po ponownym renderze (ten sam przycisk w nowym DOM). */
function focusKeyOf(el) {
  const a = el?.dataset?.act;
  if (!a) return null;
  for (const k of ['loc', 'id', 'f']) if (el.dataset[k] != null) return `[data-act="${a}"][data-${k}="${CSS.escape(el.dataset[k])}"]`;
  return `[data-act="${a}"]`;
}

function renderTacticsAfter(focusSel) {
  tUi.focus = focusSel ?? focusKeyOf(document.activeElement);
  render();
}

function mountTacticsScreen() {
  const dlg = app.querySelector('dialog.tdet');
  const opened = tUi.infoOpened;
  tUi.infoOpened = false;
  if (dlg && !matchMedia(WIDE_INFO).matches) {
    dlg.close();
    dlg.showModal(); // telefon i tablet: arkusz/okno modalne, fokus trafia do przycisku Zamknij
  } else if (dlg && opened) dlg.querySelector('.tdet__x')?.focus({ preventScroll: true });
  else if (tUi.focus) app.querySelector(tUi.focus)?.focus({ preventScroll: true });
  tUi.focus = null;
}

function openInfo(pid, el) {
  state.tInfo = pid;
  tUi.infoReturn = focusKeyOf(el);
  tUi.infoOpened = true;
  renderTacticsAfter();
}

function closeInfo() {
  const back = tUi.infoReturn;
  state.tInfo = null;
  tUi.infoReturn = null;
  renderTacticsAfter(back);
}

async function tacticsClick(g, el) {
  const loc = parseLoc(el.dataset.loc);
  if (!loc) return;
  const key = locKey(loc);
  const now = performance.now();
  const last = tUi.lastTap;
  // Dwuklik (dwa dotknięcia tego samego miejsca): cofamy skutek pierwszego i pokazujemy atrybuty.
  if (last && last.key === key && now - last.t < 450) {
    tUi.lastTap = null;
    const pid = playerAt(last.prev.tactics, loc);
    if (pid) {
      const changed = g.tactics !== last.prev.tactics;
      g.tactics = last.prev.tactics;
      state.tSel = last.prev.sel;
      state.tMsg = '';
      if (changed) await save();
      openInfo(pid, el);
      return;
    }
  }
  tUi.lastTap = { key, t: now, prev: { tactics: g.tactics, sel: state.tSel } };
  const sel = state.tSel;
  const selectable = loc.zone === 'xi' || !!playerAt(g.tactics, loc);
  state.tMsg = '';
  if (sel && sameLoc(sel, loc)) state.tSel = null;
  else if (sel) {
    const r = resolveTap(g.tactics, sel, loc, tCtx(g));
    if (r.ok) { g.tactics = r.tactics; state.tSel = null; state.tMsg = r.text; await save(); }
    else if (r.reason) state.tMsg = r.reason;
    else state.tSel = selectable ? loc : null;
  } else if (selectable) state.tSel = loc;
  else if (loc.zone === 'benchAdd') state.tMsg = 'Najpierw wybierz zawodnika spoza kadry meczowej, potem wolne miejsce na ławce.';
  renderTacticsAfter();
}

mountTacticsDrag(app, {
  resolve: (src, dst) => resolveMove(state.game.tactics, src, dst, tCtx(state.game)),
  onDrop: async (src, dst) => {
    const g = state.game;
    const r = resolveMove(g.tactics, src, dst, tCtx(g));
    if (!r.ok) return;
    g.tactics = r.tactics;
    state.tSel = null;
    state.tMsg = r.text;
    tUi.lastTap = null;
    await save();
    renderTacticsAfter();
  },
  onReject: (reason) => { state.tMsg = reason; renderTacticsAfter(); },
});

// Escape na ekranie składu: najpierw zamyka panel atrybutów albo anuluje wybór (nie wychodzi do menu).
app.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || !tacticsOpen() || ev.target.closest('select')) return;
  if (state.tInfo) { ev.preventDefault(); ev.stopPropagation(); closeInfo(); }
  else if (state.tSel) { ev.preventDefault(); ev.stopPropagation(); state.tSel = null; state.tMsg = ''; renderTacticsAfter(); }
});
// Zamknięcie okna modalnego przez przeglądarkę (Escape) i dotknięcie tła za arkuszem.
app.addEventListener('cancel', (ev) => {
  if (!ev.target.matches?.('dialog.tdet')) return;
  ev.preventDefault();
  closeInfo();
}, true);
app.addEventListener('click', (ev) => {
  if (ev.target.matches?.('dialog.tdet') && ev.target.matches(':modal')) closeInfo();
});
matchMedia(WIDE_INFO).addEventListener?.('change', () => { if (state.tInfo && tacticsOpen()) render(); });

app.addEventListener('input', (ev) => {
  if (state.ng && ev.target.closest('[data-ng-form]')) refreshNegotiationHints(app, state.ng);
});

app.addEventListener('change', async (ev) => {
  const sel = ev.target.closest('select[data-act="trole"]');
  if (!sel) return;
  state.game.tactics = { ...state.game.tactics, [sel.dataset.role]: sel.value };
  await save();
  render();
});

// ---------- Akcje ----------
async function newGame(slot, clubId) {
  applySeasonState({});
  const seed = hashString(`${clubId}:${Date.now()}:${Math.random()}`);
  const game = {
    seed, clubId, date: GAME_START, season: SEASON, createdAt: new Date().toISOString(),
    inbox: [],
  };
  game.season = createSeason(seed, { playerClub: clubId });
  game.fixtures = game.season.fixtures;
  game.world = generateWorld(seed);
  game.tactics = createTactics(squadOf(game.world, clubId), { benchSize: benchSizeFor(game) });
  ensureTraining(game);
  ensureCareer(game);
  processDay(game);
  state.game = game;
  state.slot = slot;
  await save();
  state.screen = 'hub';
  state.tab = 'poczta';
  render();
}

app.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const act = el.dataset.act;
  if (isTalkAction(act) && state.game) {
    const r = handleTalkAction(state.game, act, el.dataset, app);
    Object.assign(state, r.ui ?? {});
    if (r.save) await save();
    render();
    return;
  }
  if (isTransferAction(act) && state.game) {
    const r = handleTransferAction(state.game, act, el.dataset, app);
    Object.assign(state, r.ui ?? {});
    if (r.resolveOffer) state.game.inbox = state.game.inbox.map((m) => (m.refs?.offerId === r.resolveOffer ? { ...m, read: true, resolved: true } : m));
    if (r.negotiate) {
      const s2 = startNegotiation(state.game, r.negotiate);
      if (s2.ok) state.ng = s2.ng; else state.tfMsg = s2.text;
    }
    if (r.squadChanged) afterSquadChange(state.game);
    if (r.save) await save();
    render();
    return;
  }
  if (isNegotiationAction(act) && state.game && state.ng) {
    const r = handleNegotiationAction(state.game, state.ng, act, el.dataset, readNegotiationForm(app));
    const d = r.done;
    if (d?.accepted && d.kind === 'sign') {
      const p = state.game.world.players[d.playerId];
      completeTransfer(state.game, { playerId: d.playerId, to: state.game.clubId, fee: d.fee ?? 0, contract: d.contract, kind: d.fromClub ? 'transfer' : 'free' });
      afterSquadChange(state.game);
      state.tfMsg = `${p.name} podpisał kontrakt.`;
    } else if (d?.accepted) state.tfMsg = 'Kontrakt przedłużony.';
    state.ng = r.ng; // null = powrót do Transferów
    if (r.save || d) await save();
    render();
    return;
  }
  if (isTrainingAction(act) && state.game) {
    const r = handleTrainingAction(state.game, act, el.dataset);
    Object.assign(state, r.ui ?? {});
    if (r.save) await save();
    render();
    return;
  }
  const slot = Number(el.dataset.slot);
  const g = state.game;
  try {
    if (act === 'new') { state.slot = slot; state.screen = 'pick'; render(); }
    if (act === 'back' || act === 'menu') { state.screen = 'start'; render(); }
    if (act === 'tier') { state.tier = Number(el.dataset.tier); render(); }
    if (act === 'pick') await newGame(state.slot, el.dataset.club);
    if (act === 'tab') { state.tab = el.dataset.tab; state.mailOpen = null; state.playerOpen = null; render(); }
    if (act === 'go') {
      const a = primaryAction(g);
      if (a.kind === 'play') {
        const { tactics, changes } = refreshTactics(g.tactics, mySquad(g), { benchSize: benchSizeFor(g) });
        g.tactics = tactics;
        const check = checkTactics(tactics, mySquad(g), { benchSize: benchSizeFor(g) });
        if (check.errors.length) { state.tab = 'kadra'; state.sqSub = 'tactics'; render(); return; }
        state.matchNotes = changes;
        await save();
        state.screen = a.match.home && a.match.away ? 'matchday' : 'match'; render();
      }
      else if (a.kind === 'decide') { state.tab = 'poczta'; state.mailOpen = pendingDecisions(g.inbox)[0].id; render(); }
      else await runDays();
    }
    if (act === 'stop') state.running = false;
    if (act === 'playnow') await playMyMatch();
    if (act === 'resultdone') { state.screen = 'hub'; state.tab = 'pulpit'; render(); }
    if (act === 'ccomp') { state.cComp = el.dataset.c; state.cRound = null; state.uDraw = null; render(); }
    if (act === 'ufilter') { state.uFilter = el.dataset.f; render(); }
    if (act === 'udraw') { state.uDraw = `${el.dataset.c}:${el.dataset.r}`; state.cView = 'path'; render(); }
    if (act === 'udrawclose') { state.uDraw = null; render(); }
    if (act === 'cview') { state.cView = el.dataset.v; state.cRound = null; state.uDraw = null; render(); }
    if (act === 'cround') { state.cRound = Number(el.dataset.r); render(); }
    if (act === 'endmatch') {
      finishMatch(g, primaryAction(g).match.id, null);
      await save();
      state.screen = 'hub'; render();
    }
    if (act === 'mail') {
      state.tab = 'poczta'; state.mailOpen = el.dataset.id;
      g.inbox = markRead(g.inbox, el.dataset.id); await save(); render();
    }
    if (act === 'mailback') { state.mailOpen = null; render(); }
    if (act === 'sqfilter') { state.sqFilter = el.dataset.f; render(); }
    if (act === 'player') { state.playerOpen = el.dataset.id; render(); window.scrollTo({ top: 0 }); }
    if (act === 'squadback') { state.playerOpen = null; render(); }
    if (act === 'tsub') { state.sqSub = el.dataset.s; state.tSel = null; state.tInfo = null; state.tMsg = ''; state.playerOpen = null; state.ttResult = null; state.ttMeeting = null; render(); }
    if (act === 'tcancel') { state.tSel = null; state.tMsg = ''; renderTacticsAfter('[data-act="tauto"]'); }
    if (act === 'tform') { g.tactics = changeFormation(g.tactics, mySquad(g), el.dataset.f); state.tSel = null; state.tMsg = ''; await save(); renderTacticsAfter(); }
    if (act === 'tauto') { g.tactics = createTactics(mySquad(g), { formation: g.tactics.formation, benchSize: benchSizeFor(g), instructions: g.tactics.instructions }); state.tSel = null; state.tMsg = 'Asystent ustawił skład.'; await save(); renderTacticsAfter(); }
    if (act === 'tinstr') { g.tactics = setInstruction(g.tactics, el.dataset.i, el.dataset.v); await save(); renderTacticsAfter(); }
    if (act === 'tunbench') {
      const name = tCtx(g).byId.get(el.dataset.id)?.name ?? 'Zawodnik';
      g.tactics = removeFromBench(g.tactics, el.dataset.id); state.tSel = null; state.tMsg = `${name} poza kadrą meczową.`; await save(); renderTacticsAfter();
    }
    if (act === 'tbench') {
      if (g.tactics.bench.length >= benchSizeFor(g)) { state.tSel = { zone: 'out', id: el.dataset.id }; state.tMsg = 'Ławka jest pełna. Wskaż zawodnika z ławki, którego zastąpi.'; renderTacticsAfter(); return; }
      const r = resolveMove(g.tactics, { zone: 'out', id: el.dataset.id }, { zone: 'benchAdd' }, tCtx(g));
      if (r.ok) { g.tactics = r.tactics; state.tMsg = r.text; await save(); } else state.tMsg = r.reason;
      state.tSel = null; renderTacticsAfter();
    }
    if (act === 'tslot' || act === 'tpick') await tacticsClick(g, el);
    if (act === 'tinfo') { if (state.tInfo === el.dataset.id) closeInfo(); else openInfo(el.dataset.id, el); }
    if (act === 'tinfoclose') closeInfo();
    if (act === 'mailcat') { state.mailCat = el.dataset.cat || null; render(); }
    if (act === 'readall') { g.inbox = markAllRead(g.inbox); await save(); render(); }
    if (act === 'maildel') { const m = g.inbox.find((x) => x.id === el.dataset.id); if (m && canDelete(m)) forgetMessages(g, { inbox: g.inbox.filter((x) => x !== m), removed: m.key ? [m.key] : [] }); state.mailOpen = null; await save(); render(); }
    if (act === 'mailprune') { forgetMessages(g, pruneInbox(g.inbox, g.date, el.dataset.m, 30)); await save(); render(); }
    if (act === 'mailaction') {
      const m = g.inbox.find((x) => x.id === el.dataset.id);
      g.inbox = resolveMessage(g.inbox, el.dataset.id, el.dataset.a);
      const extra = runDecision(g, m, el.dataset.a);
      if (extra.length) g.inbox = addMessages(g.inbox, extra).inbox;
      if (m?.refs?.kind === 'incomingOffer' || m?.refs?.kind === 'jobOffer') afterSquadChange(g);
      await save(); render();
    }
    if (act === 'load') {
      const rec = await store.loadSlot(slot);
      if (!rec) throw new Error('Ten slot jest pusty.');
      state.game = ensureGameShape(rec.game); state.slot = slot; state.screen = 'hub'; state.tab = 'pulpit'; render();
    }
    if (act === 'delete') {
      if (confirm(`Usunąć zapis ze slotu ${slot}? Tego nie da się cofnąć.`)) {
        await store.deleteSlot(slot); state.notice = `Usunięto zapis ze slotu ${slot}.`; render();
      }
    }
    if (act === 'export') {
      const rec = await store.loadSlot(slot);
      const blob = new Blob([store.exportJson(rec)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `manager-slot${slot}-${rec.game.date}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  } catch (err) {
    state.notice = err.message; state.screen = 'start'; render();
  }
});

app.addEventListener('change', async (ev) => {
  const input = ev.target.closest('input[data-act="import"]');
  if (!input || !input.files[0]) return;
  try {
    const data = store.parseImport(await input.files[0].text());
    const slots = await store.listSlots();
    const free = slots.find((s) => s.empty);
    if (!free) throw new Error('Wszystkie sloty są zajęte. Usuń jeden zapis i wczytaj plik ponownie.');
    await store.saveSlot(free.slot, data.game);
    state.notice = `Wczytano zapis do slotu ${free.slot}.`;
  } catch (err) {
    state.notice = `Nie wczytano pliku: ${err.message}`;
  }
  render();
});

// Klawiatura na PC: Enter = Dalej / Zagraj mecz, Escape = menu główne.
document.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, select, textarea')) return;
  if (state.screen === 'matchday') return;
  if (ev.key === 'Escape' && state.screen !== 'start') { state.running = false; state.screen = 'start'; render(); }
  if (ev.key === 'Enter' && state.screen === 'hub' && !state.running && !ev.target.closest('button')) document.querySelector('[data-act="go"]')?.click();
});

// Prośba o trwałe miejsce na zapis: przeglądarka nie usunie zapisów gry przy braku miejsca na dysku
if (navigator.storage?.persist) navigator.storage.persisted?.().then((p) => (p ? null : navigator.storage.persist())).catch(() => {});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* gra działa także bez trybu offline */ });
}

Promise.resolve(render()).then(() => { document.body.dataset.ready = '1'; });
