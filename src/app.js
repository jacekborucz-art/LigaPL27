// Powłoka aplikacji: ekran startowy, sloty zapisu, wybór klubu, główny ekran z pocztą
// i upływem dni („Dalej” albo „Zagraj mecz”).
import { CLUBS_PL, LEAGUE_NAMES, clubById } from './data/clubs_pl.js';
import { GAME_START, SEASON, POLISH_EUROPE_2026, DOMESTIC } from './config/calendar2026.js';
import { crestHtml } from './ui/crest.js';
import { esc, fmtDate, weekday, icon } from './ui/dom.js';
import * as store from './core/store.js';
import { hashString } from './core/rng.js';
import { CATEGORIES, unreadCount, markRead, markAllRead, resolveMessage, filterInbox, pendingDecisions, addMessages } from './core/inbox.js';
import { processDay, primaryAction, continueUntilStop, finishMatch } from './core/gameLoop.js';
import './season/dailySystems.js';
import { createSeason, compLabel, applyResult, fromEngineResult, squadFor, anyClub, LEAGUE_COMPS } from './season/season.js';
import { standings } from './season/standings.js';
import { renderCompetitions } from './ui/competitionsView.js';
import { createMatch, runToEnd } from './engine/match/match.js';
import { Rng } from './core/rng.js';
import { addDays } from './core/gameLoop.js';
import { generateWorld, squadOf, academyOf } from './world/worldGen.js';
import { renderSquadList, renderPlayerProfile } from './ui/squadView.js';
import { renderTactics } from './ui/tacticsView.js';
import { createTactics, assign, changeFormation, setInstruction, refreshTactics, removeFromBench, checkTactics } from './engine/lineup.js';
import { COMPETITIONS } from './config/competitions.js';
import { mountMatchday } from './ui/matchdayView.js';
import { mountDrawAnimation } from './ui/europeView.js';
import { ensureUefa } from './season/europe.js';
import { ensureNational } from './season/nationalSystem.js';
import { ensureTraining, trainingMatchInput } from './training/index.js';
import { renderTraining, handleTrainingAction, isTrainingAction } from './ui/trainingView.js';
import { renderTransfers, handleTransferAction, isTransferAction } from './ui/transfersView.js';
import { ensureCareer } from './career/careerSystem.js';
import { completeTransfer, fmtZl } from './career/transfers.js';
import { trustLabel } from './career/board.js';
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
    const sub = `<div class="subtabs" role="tablist"><button role="tab" data-act="tsub" data-s="players" aria-selected="${state.sqSub === 'players'}">Zawodnicy</button><button role="tab" data-act="tsub" data-s="tactics" aria-selected="${state.sqSub === 'tactics'}">Skład i taktyka</button></div>`;
    if (state.sqSub === 'tactics') return sub + renderTactics({ squad: mySquad(g), tactics: g.tactics, sel: state.tSel, benchSize: benchSizeFor(g) });
    const ovrs = leagueOvrs(g, club.tier);
    const p = state.playerOpen && g.world.players[state.playerOpen];
    if (p) return renderPlayerProfile(p, { leagueOvrs: ovrs, clubName: club.name });
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

function renderDashboard(g, club) {
  const next = nextFixture(g);
  const comp = ['ekstraklasa', 'liga1', 'liga2'][club.tier - 1];
  const table = standings(g.fixtures.filter((f) => f.comp === comp), CLUBS_PL.filter((c) => c.tier === club.tier).map((c) => c.id));
  const me = table.find((r) => r.id === g.clubId);
  const opp = next && (next.home === g.clubId ? next.away : next.home);
  const tw = DOMESTIC.transferWindows.find((w) => g.date >= w.from && g.date <= w.to);
  const latest = g.inbox.slice(0, 4);
  return `
    <h2>Pulpit</h2>
    <section class="panel">
      <p class="muted">Następny mecz</p>
      ${next ? `<p class="panel__lead">${opp && anyClub(opp) ? `${crestHtml(anyClub(opp), { size: 28, clubsById })} ${esc(anyClub(opp).name)}` : 'Rywal z losowania'}</p>
        <p class="muted">${esc(compLabel(next))}, ${next.home === g.clubId ? 'u siebie' : 'na wyjeździe'}${next.neutral ? ' (teren neutralny)' : ''}</p>
        <p class="muted">${esc(weekday(next.date))}, ${esc(fmtDate(next.date))}${next.time ? `, ${esc(next.time)}` : ''}</p>` : '<p class="panel__lead">Brak zaplanowanych meczów</p>'}
    </section>
    <section class="panel">
      <p class="muted">${esc(LEAGUE_NAMES[club.tier])}</p>
      <p class="panel__lead">${me.pos}. miejsce, ${me.points} pkt</p>
      <p class="muted">${me.played} meczów: ${me.wins} zwycięstw, ${me.draws} remisów, ${me.losses} porażek, bramki ${me.gf}:${me.ga}</p>
    </section>
    <section class="panel">
      <p class="muted">Zarząd i finanse</p>
      <p class="panel__lead">${esc(trustLabel(g.board?.trust ?? 60))}, zaufanie ${g.board?.trust ?? 60}/100</p>
      <p class="muted">Cel: ${esc(g.board?.goal?.text ?? '')}. Saldo: ${esc(fmtZl(g.finance?.clubs?.[g.clubId]?.balance ?? 0))}.</p>
    </section>
    <section class="panel">
      <p class="muted">Okno transferowe</p>
      <p class="panel__lead">${tw ? `Otwarte do ${esc(fmtDate(tw.to))}` : 'Zamknięte'}</p>
      ${(() => { const n = (g.market?.offers ?? []).filter((o) => o.kind === 'incoming' && o.status === 'open').length; return n ? `<p class="muted">Oferty za twoich zawodników: ${n}. <button class="btn btn--quiet btn--sm" data-act="tab" data-tab="transfery">Zobacz</button></p>` : ''; })()}
    </section>
    <h3>Ostatnie wiadomości</h3>
    <ul class="mail-list stripes">${latest.map(mailRow).join('') || '<li class="mail-empty">Brak wiadomości.</li>'}</ul>`;
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
      </article>`;
    }
  }
  const cats = Object.entries(CATEGORIES).filter(([k]) => g.inbox.some((m) => m.category === k));
  const chips = [['', 'Wszystkie', unreadCount(g.inbox)], ...cats.map(([k, v]) => [k, v, unreadCount(g.inbox, k)])]
    .map(([k, v, n]) => `<button class="chip" data-act="mailcat" data-cat="${k}" aria-pressed="${(state.mailCat || '') === k}">${esc(v)}${n ? ` <b>${n}</b>` : ''}</button>`).join('');
  const list = filterInbox(g.inbox, state.mailCat);
  const pending = pendingDecisions(g.inbox).length;
  return `<div class="mail-head"><h2>Poczta</h2><button class="btn btn--quiet" data-act="readall">Oznacz wszystkie jako przeczytane</button></div>
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


// ---------- Skład: wybór dwoma dotknięciami ----------
async function tacticsClick(g, act, el) {
  const sel = state.tSel;
  const t = g.tactics;
  let next = null;
  if (act === 'tslot') {
    const idx = Number(el.dataset.idx);
    if (sel?.type === 'player') next = assign(t, { type: 'xi', idx }, sel.id);
    else if (sel?.type === 'xi' && sel.idx !== idx && t.xi[sel.idx]) next = assign(t, { type: 'xi', idx }, t.xi[sel.idx]);
    else if (sel?.type === 'bench') next = assign(t, { type: 'xi', idx }, t.bench[sel.idx]);
    else state.tSel = sel?.type === 'xi' && sel.idx === idx ? null : { type: 'xi', idx };
  } else {
    const id = el.dataset.id;
    const where = el.dataset.where;
    const idx = el.dataset.idx != null ? Number(el.dataset.idx) : null;
    if (sel?.type === 'xi') next = assign(t, sel, id);
    else if (sel?.type === 'bench' && where === 'out') next = assign(t, sel, id);
    else if (sel?.type === 'player' && where === 'bench') next = assign(t, { type: 'bench', idx }, sel.id);
    else state.tSel = where === 'bench' ? { type: 'bench', idx } : { type: 'player', id };
  }
  if (next) { g.tactics = next; state.tSel = null; await save(); }
  render();
}

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
    if (act === 'tsub') { state.sqSub = el.dataset.s; state.tSel = null; state.playerOpen = null; render(); }
    if (act === 'tcancel') { state.tSel = null; render(); }
    if (act === 'tform') { g.tactics = changeFormation(g.tactics, mySquad(g), el.dataset.f); state.tSel = null; await save(); render(); }
    if (act === 'tauto') { g.tactics = createTactics(mySquad(g), { formation: g.tactics.formation, benchSize: benchSizeFor(g), instructions: g.tactics.instructions }); state.tSel = null; await save(); render(); }
    if (act === 'tinstr') { g.tactics = setInstruction(g.tactics, el.dataset.i, el.dataset.v); await save(); render(); }
    if (act === 'tunbench') { g.tactics = removeFromBench(g.tactics, el.dataset.id); state.tSel = null; await save(); render(); }
    if (act === 'tbench') {
      if (g.tactics.bench.length >= benchSizeFor(g)) { state.tSel = { type: 'player', id: el.dataset.id }; render(); return; }
      g.tactics = assign(g.tactics, { type: 'bench', idx: g.tactics.bench.length }, el.dataset.id); state.tSel = null; await save(); render();
    }
    if (act === 'tslot' || act === 'tpick') { await tacticsClick(g, act, el); }
    if (act === 'mailcat') { state.mailCat = el.dataset.cat || null; render(); }
    if (act === 'readall') { g.inbox = markAllRead(g.inbox); await save(); render(); }
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

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* gra działa także bez trybu offline */ });
}

Promise.resolve(render()).then(() => { document.body.dataset.ready = '1'; });
