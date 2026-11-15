// Powłoka aplikacji: ekran startowy, sloty zapisu, wybór klubu, główny ekran z pocztą
// i upływem dni („Dalej” albo „Zagraj mecz”).
import { CLUBS_PL, LEAGUE_NAMES, clubById, leagueLabel } from './data/clubs_pl.js';
import { compOfClub, compClubIds } from './season/leagueComps.js';
import { GAME_START, SEASON, POLISH_EUROPE_2026, DOMESTIC } from './config/calendar2026.js';
import { crestHtml } from './ui/crest.js';
import { esc, fmtDate, fmtDay, weekday, icon } from './ui/dom.js';
import { migratePosCodes } from './engine/positions.js'; // zapisy sprzed zmiany kodu SP -> BP
import * as store from './core/store.js';
import { hashString } from './core/rng.js';
import { CATEGORIES, unreadCount, markRead, markAllRead, resolveMessage, filterInbox, pendingDecisions, addMessages, pruneInbox, canDelete } from './core/inbox.js';
import { processDay, primaryAction, continueUntilStop, finishMatch, forgetMessages } from './core/gameLoop.js';
import './season/dailySystems.js';
import { createSeason, compLabel, applyResult, fromEngineResult, squadFor, anyClub, LEAGUE_COMPS } from './season/season.js';
import { standings, zonesFor } from './season/standings.js';
import { renderCompetitions } from './ui/competitionsView.js';
import { fixturesPanelBody, renderFixtures } from './ui/fixturesView.js';
import { ensureHistory } from './season/history.js';
import { createMatch, runToEnd } from './engine/match/match.js';
import { Rng } from './core/rng.js';
import { coachOf, coachStyle, matchCoach, formRng, assistantProfile } from './career/coaches.js';
import { staffQ } from './training/staff.js';
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
import { ensureUefa, syncSuperCupEU } from './season/europe.js';
import { ensureNational, ensureIntl } from './season/nationalSystem.js';
import { applySeasonState } from './season/rollover.js';
import { ensureThirdLeague } from './season/thirdLeague.js';
import { ensureTraining, trainingMatchInput, teamCohesion } from './training/index.js';
import { renderTraining, handleTrainingAction, isTrainingAction } from './ui/trainingView.js';
import { shirtNumbers, kitColors } from './career/shirts.js';
import { playerStatsHtml } from './ui/playerStatsView.js';
import { renderClubView, hasClubView } from './ui/clubView.js';
import { renderTransfers, handleTransferAction, isTransferAction } from './ui/transfersView.js';
import { renderClubHub, handleClubAction, isClubAction } from './ui/klubView.js';
import { sysNavHtml, sysHeaderBtn, sysDialogHtml } from './ui/sysMenu.js';
import { renderEditor, handleEditorAction, isEditorAction, newEditorState, clubListHtml, playerListHtml } from './ui/editorView.js'; // edytor i datapack (docs/edytor.md)
import { canPromote, promoteYouth } from './career/academy.js'; // wychowankowie do pierwszego składu
import { applyPack, restoreOriginals, exportPack, packFileName, parsePack, importPack, importSummary } from './career/editor.js';
import { renderTalks, handleTalkAction, isTalkAction } from './ui/talksView.js';
import { ensureCareer } from './career/careerSystem.js';
import { ensureReputation } from './career/reputationSystem.js'; // dynamiczna reputacja (docs/reputacja.md)
import { fmtZl } from './career/transfers.js';
import { startDeal, expectedRegistration } from './career/transferDeals.js'; // transfer jako proces (docs/transfery.md)
import { signUserPre } from './career/preContracts.js';
import { trustLabel } from './career/board.js';
import { spendable, wageBill, monthSummary } from './career/finance.js';
import { teamMorale, moraleLabel } from './career/morale.js';
import { fanMoodLabel } from './career/fans.js';
import { GROUP } from './career/squad.js';
import { limitStatus } from './career/squadLimitSystem.js';
import { runDecision } from './core/decisions.js';
import { startNegotiation, renderNegotiation, handleNegotiationAction, isNegotiationAction, readNegotiationForm, refreshNegotiationHints } from './ui/negotiationView.js';
import { bindContextTrigger, openMenu, showToast } from './ui/contextMenu.js';
import { playerMenu } from './ui/playerMenus.js';
import { renderAssistantReport } from './ui/assistantReportView.js';
import { ensureAssistantReport } from './career/assistantReport.js';
import { ensureTeamReport, requestTeamReport } from './career/teamReport.js'; // raport ogólny o drużynie (docs/raport-druzyny.md)
import { renderTeamReport } from './ui/teamReportView.js';
import { renderMenu, renderCareer, newCareerState, maybePlayIntro, readTheme, applyTheme, nextTheme, nameError, ageError, profileOf, randomCoach, updateCoachPreview, setFieldError, isNationality, managerName, AGE_MIN, AGE_MAX } from './ui/menuView.js';

const app = document.getElementById('app');
const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const state = { screen: 'start', slot: null, game: null, tab: 'pulpit', tier: 1, notice: null, mailCat: null, mailOpen: null, running: false, sqFilter: 'all', playerOpen: null, sqSub: 'players', tSel: null, matchNotes: [], cComp: null, cView: 'table', cRound: null, lastResult: null, uFilter: 'pl', uDraw: null, nc: null, confirmDel: null, theme: readTheme(), menuFocus: null, fx: null };
const WIDE_PICK = '(min-width: 1024px)';

const benchSizeFor = (g) => COMPETITIONS[compOfClub(clubById(g.clubId)) ?? 'ekstraklasa']?.benchSize ?? 9;
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
  { id: 'klub', label: 'Klub' },
  { id: 'trening', label: 'Trening' },
];

function render() {
  if (state.screen === 'start' && state.updateReady) { location.reload(); return; } // nowa wersja gry (sw.js)
  if (state.screen === 'start') return renderStart();
  if (state.screen === 'career' || state.screen === 'pick') return renderCareerScreen();
  if (state.screen === 'matchday') return renderLiveMatchday();
  if (state.screen === 'match') return renderMatchDay();
  if (state.screen === 'matchResult') return renderMatchResult();
  if (state.screen === 'editor') return renderEditorScreen();
  return renderHub();
}

// ---------- Menu systemowe: Opcje, Zapis, Wyjście (src/ui/sysMenu.js) ----------
const sys = { kind: null, msg: null, busy: false };
function openSys(kind) {
  sys.kind = kind;
  let dlg = app.querySelector('#sysDlg');
  if (!dlg) {
    app.insertAdjacentHTML('beforeend', '<dialog id="sysDlg" class="sysdlg" aria-labelledby="sysTitle"></dialog>');
    dlg = app.querySelector('#sysDlg');
    dlg.addEventListener('close', () => { sys.kind = null; sys.msg = null; });
  }
  dlg.innerHTML = sysDialogHtml(kind, { theme: state.theme, slot: state.slot, msg: sys.msg, busy: sys.busy });
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('h2')?.setAttribute('tabindex', '-1');
}
const closeSys = () => app.querySelector('#sysDlg')?.close();
// Nazwa pliku bez polskich znaków i spacji (z nimi przeglądarka odrzuca nazwę i zapisuje „download”)
const slug = (t) => String(t).replace(/[łŁ]/g, (c) => (c === 'ł' ? 'l' : 'L')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
const saveName = () => { const g = state.game; return `LigaPL27-slot${state.slot}-${slug(clubById(g.clubId)?.name ?? g.clubId)}-${g.date}.json`; };
async function sysAction(act, el) {
  if (act === 'sys-menu') return openSys('menu');
  if (act === 'sys-options') return openSys('options');
  if (act === 'sys-save') { sys.msg = null; return openSys('save'); }
  if (act === 'sys-close') return closeSys();
  if (act === 'sys-theme') { state.theme = el.dataset.t; applyTheme(state.theme); return openSys('options'); }
  if (act === 'sys-editor') {
    closeSys(); state.running = false;
    state.ed ??= newEditorState(); state.ed.msg = null; state.ed.errors = null; state.ed.draft = null;
    state.screen = 'editor'; render(); window.scrollTo({ top: 0 }); app.querySelector('.ed-head h1')?.focus?.(); return;
  }
  if (act === 'sys-exit') {
    closeSys(); state.running = false;
    await save();
    state.notice = `Gra zapisana w slocie ${state.slot}.`; state.screen = 'start'; render(); return;
  }
  if (act === 'sys-file') {
    await save();
    const rec = await store.loadSlot(state.slot);
    const blob = new Blob([store.exportJson(rec)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = saveName(); a.hidden = true;
    (app.querySelector('#sysDlg[open]') ?? document.body).appendChild(a); a.click(); a.remove(); // w aktywnym oknie: przeglądarka używa nazwy z download
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    sys.msg = `Zapisano plik ${saveName()}.`; return openSys('save');
  }
}

// ---------- Edytor i datapack (src/ui/editorView.js, src/career/editor.js, docs/edytor.md) ----------
function renderEditorScreen() {
  app.innerHTML = renderEditor(state.game, state.ed ??= newEditorState());
}

async function editorAction(act, el) {
  const g = state.game;
  const ed = (state.ed ??= newEditorState());
  const r = handleEditorAction(g, ed, act, el.dataset, app);
  if (r.exit) { state.screen = 'hub'; leagueOvrCache.clear(); render(); window.scrollTo({ top: 0 }); return; }
  if (r.export) { exportDatapack(r.full); return; }
  if (r.squadChanged) afterSquadChange(g);
  else if (r.save) leagueOvrCache.clear();
  if (r.save) await save();
  render();
  if (r.top) window.scrollTo({ top: 0 });
  if (r.focus) app.querySelector(r.focus)?.focus({ preventScroll: true });
}

function exportDatapack(full = false) {
  const g = state.game;
  const name = packFileName(g.date, { full });
  const pack = exportPack(g, new Date(), { full });
  const blob = new Blob([full ? JSON.stringify(pack) : JSON.stringify(pack, null, 2)], { type: 'application/json' }); // pełny bez wcięć (rozmiar)
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.hidden = true;
  (app.querySelector('.ed') ?? document.body).appendChild(a); a.click(); a.remove(); // nazwa tylko ASCII (Chromium)
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  state.ed.msg = full ? `Zapisano plik ${name}: ${Object.keys(pack.clubs).length} klubów, ${Object.keys(pack.players).length} zawodników.` : `Zapisano plik ${name}.`; state.ed.errors = null;
  render();
}

// Wczytanie datapacku, wyszukiwarki i filtry edytora (pola INPUT i SELECT nie przechodzą przez dispatchAct)
app.addEventListener('change', async (ev) => {
  const input = ev.target.closest?.('input[data-act="ed-import"]');
  if (!input || !input.files?.[0] || !state.game || !state.ed) return;
  const ed = state.ed;
  try {
    const file = input.files[0];
    if (file.size > 40e6) throw new Error('Plik jest za duży jak na datapack.');
    const r = importPack(state.game, parsePack(await file.text()));
    afterSquadChange(state.game);
    await save();
    ed.msg = `Wczytano datapack. ${importSummary(r)}`; ed.errors = null;
  } catch (err) {
    ed.msg = `Nie wczytano pliku: ${err.message}`; ed.errors = {};
  }
  input.value = '';
  render();
});
app.addEventListener('input', (ev) => {
  if (state.screen !== 'editor' || !state.ed) return;
  const id = ev.target.id;
  if (id !== 'ed-q' && id !== 'ed-pq') return;
  if (id === 'ed-q') state.ed.q = ev.target.value; else state.ed.pq = ev.target.value;
  const box = app.querySelector('#ed-results');
  if (box) box.innerHTML = id === 'ed-q' ? clubListHtml(state.game, state.ed) : playerListHtml(state.game, state.ed);
});
app.addEventListener('change', (ev) => {
  if (state.screen !== 'editor' || !state.ed || (ev.target.id !== 'ed-pclub' && ev.target.id !== 'ed-ppos')) return;
  state.ed[ev.target.id === 'ed-pclub' ? 'pclub' : 'ppos'] = ev.target.value;
  const box = app.querySelector('#ed-results');
  if (box) box.innerHTML = playerListHtml(state.game, state.ed);
});
app.addEventListener('keydown', (ev) => {
  // Enter w polu formularza edytora = Zapisz zmiany
  if (ev.key !== 'Enter' || state.screen !== 'editor' || !ev.target.matches?.('[data-ed-form] input')) return;
  ev.preventDefault();
  app.querySelector('[data-act="ed-save-club"], [data-act="ed-save-player"]')?.click();
});

// ---------- Zapis ----------
async function save() {
  const g = state.game;
  const p = g.manager?.profile;
  g.summary = { clubId: g.clubId, season: typeof g.season === 'string' ? g.season : (g.season?.seasonId ?? SEASON), date: g.date, ...(p ? { managerName: managerName(g) } : {}) };
  await store.saveSlot(state.slot, g);
}

/** Uzupełnia zapisy sprzed poczty i pętli dni (migracja w miejscu). */
function ensureGameShape(g) {
  migratePosCodes(g); // kody pozycji: SP (boczny pomocnik) -> BP, przed wszystkim, co czyta pozycje
  applySeasonState(g); // kalendarz i ligi sezonu zapisanego w grze
  applyPack(g); // edytor: nazwy klubów i stadiony z datapacku gry (docs/edytor.md)
  if (!g.world) g.world = generateWorld(g.seed);
  if (!g.tactics) g.tactics = createTactics(mySquad(g), { benchSize: benchSizeFor(g) });
  else g.tactics = refreshTactics(g.tactics, mySquad(g), { benchSize: benchSizeFor(g) }).tactics;
  if (!Array.isArray(g.inbox)) g.inbox = [];
  // Stare zapisy: Superpuchar zawsze na PGE Narodowym (teren neutralny)
  for (const f of g.fixtures ?? []) if (f.comp === 'super' && !f.played && !f.neutral) { f.neutral = true; f.venue = 'PGE Narodowy'; }
  if (!g.season) {
    // Zapis sprzed etapu 7: tworzymy sezon i rozgrywamy w tle mecze z minionych dni
    g.season = createSeason(g.seed, { playerClub: g.clubId });
    g.fixtures = g.season.fixtures;
    const today = g.date;
    for (let d = GAME_START; d < today; d = addDays(d, 1)) processDay(g, d);
    for (const f of g.fixtures) if (f.date < today && !f.played && (f.home === g.clubId || f.away === g.clubId)) { f.played = true; f.result = f.away ? { score: [0, 0], forfeit: true } : { score: [0, 0] }; }
  }
  if (g.season?.fixtures && g.fixtures && g.season.fixtures !== g.fixtures) g.season.fixtures = g.fixtures; // po imporcie z pliku JSON
  ensureThirdLeague(g); // zapis sprzed grywalnej III ligi: kadry, finanse i terminarz 4 grup (docs/iii-liga.md)
  ensureUefa(g); // zapis sprzed etapu 8: puchary UEFA nadrobione w tle
  syncSuperCupEU(g); // zapis sprzed Superpucharu Europy: mecz sezonu (rozegrany w tle, jeśli termin minął)
  ensureNational(g);
  ensureIntl(g, addDays(g.date, 1)); // silnik reprezentacji (zapisy sprzed wiecznego kalendarza: nadrobienie w tle)
  ensureTraining(g);
  ensureCareer(g);
  ensureReputation(g); // stare zapisy: stan reputacji bez zmiany p.rep (zbieżność łagodnie, co miesiąc)
  ensureHistory(g); // historia meczów drużyny gracza (stare zapisy: bieżący sezon z terminarza)
  ensureAssistantReport(g); // raport asystenta: częstotliwość i dziennik urazów (stare zapisy: co 2 tygodnie)
  ensureTeamReport(g); // raport ogólny o drużynie (stare zapisy: pusty stan, pierwszy raport od 3. dnia miesiąca)
  if (!g.inbox.length) {
    g.inbox = [];
    const today = g.date;
    g.date = GAME_START;
    processDay(g);
    g.date = today;
  }
  return g;
}

// ---------- Menu główne ----------
async function renderStart() {
  restoreOriginals(); // edytor: inne zapisy i nowa kariera widzą oryginalne nazwy klubów
  const slots = await store.listSlots();
  state.slotsCache = slots;
  app.innerHTML = renderMenu({ slots, notice: state.notice, memoryOnly: store.isMemoryOnly(), theme: state.theme, confirmDel: state.confirmDel });
  state.notice = null;
  // Fokus po przerysowaniu: wskazany element (np. po usunięciu zapisu), inaczej pierwsza pozycja menu przy wejściu do menu
  const want = state.menuFocus;
  state.menuFocus = null;
  const target = want ? app.querySelector(want) : (document.activeElement === document.body || !app.contains(document.activeElement) ? app.querySelector('.mi') : null);
  if (target && !document.querySelector('.intro')) target.focus({ preventScroll: true });
}

// ---------- Nowa kariera: trener, klub, kontrakt ----------
function renderCareerScreen() {
  if (!state.nc) state.nc = newCareerState(state.slot ?? 1);
  app.innerHTML = renderCareer(state.nc, { wide: matchMedia(WIDE_PICK).matches });
}

/** Wejście do kreatora: pierwszy wolny slot albo wskazany. */
function startCareer(slot) {
  applySeasonState({}); // kalendarz i puchary 2026/27, także po wczytaniu późniejszego sezonu
  state.slot = slot;
  state.nc = newCareerState(slot);
  state.screen = 'career';
  render();
  window.scrollTo({ top: 0 });
  app.querySelector('#nc-first')?.focus();
}

function careerGo(step, focusSel) {
  state.nc.step = step;
  state.nc.msg = '';
  render();
  window.scrollTo({ top: 0 });
  (app.querySelector(focusSel ?? '') ?? app.querySelector('.nc h2, .nc__h'))?.focus?.();
}

/** Odczyt i walidacja kroku Trener. Zwraca true, gdy można iść dalej. */
function readCoachForm() {
  const nc = state.nc;
  const get = (id) => app.querySelector(`#nc-${id}`)?.value ?? '';
  nc.first = get('first'); nc.last = get('last'); nc.age = get('age') || nc.age;
  const nat = get('nat'); if (isNationality(nat)) nc.nat = nat;
  nc.errors = { first: nameError(nc.first, 'first'), last: nameError(nc.last, 'last'), age: ageError(nc.age) };
  for (const k of ['first', 'last', 'age']) setFieldError(app, k, nc.errors[k]);
  const bad = ['first', 'last', 'age'].find((k) => nc.errors[k]);
  if (bad) {
    const el = app.querySelector(`#nc-${bad}`);
    el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el?.focus({ preventScroll: true });
    const msg = app.querySelector('#nc-msg'); if (msg) msg.textContent = 'Popraw zaznaczone pola.';
    return false;
  }
  return true;
}

function setAge(delta) {
  const nc = state.nc;
  const input = app.querySelector('#nc-age');
  const cur = Number(input?.value);
  const v = Math.min(AGE_MAX, Math.max(AGE_MIN, Number.isInteger(cur) ? cur + delta : 40));
  nc.age = v;
  if (input) input.value = v;
  nc.errors.age = '';
  setFieldError(app, 'age', '');
  updateCoachPreview(app, nc);
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
        <span class="muted hub__sub"><span>${esc(leagueLabel(club))}</span><span class="hub__mgr">${esc(managerName(g))}</span></span>
      </div>
      <div class="led hub__date" id="leddate" aria-label="Data w grze: ${esc(fmtDate(g.date))}">${esc(fmtDate(g.date))}</div>
      <div class="go-wrap" id="gowrap">${goButton(g)}</div>
      ${sysHeaderBtn()}
    </header>
    <nav class="nav" aria-label="Menu gry">${nav}${sysNavHtml()}</nav>
    <main class="hub__main" id="main">${renderTab(state.tab, g, club)}</main>
    <div class="ticker" id="ticker" aria-live="polite"></div>
  </div>`;
  mountDrawAnimation(app);
}

function renderTab(tab, g, club) {
  // Raport asystenta o zawodniku (menu zawodnika): pełna strona w bieżącej zakładce
  if (state.repOpen && g.world.players[state.repOpen]?.clubId === g.clubId) return renderAssistantReport(g, state.repOpen);
  // Profil zawodnika innego klubu (z karty transferowej albo z menu): tylko podgląd, bez danych wewnętrznych klubu
  const ext = state.extPlayer && g.world.players[state.extPlayer.id];
  if (!ext && state.extClub) return renderClubView(g, state.extClub);
  if (ext) {
    const extClub = ext.clubId ? clubById(ext.clubId) : null;
    return renderPlayerProfile(ext, { leagueOvrs: leagueOvrs(g, extClub?.tier ?? club.tier), clubName: extClub?.name ?? 'Wolny zawodnik', date: g.date, game: g, foreign: true, back: { act: 'extback', label: 'Wróć' } });
  }
  if (tab === 'pulpit') return state.fx ? renderFixtures(g, state.fx) : renderDashboard(g, club);
  if (tab === 'poczta') return renderMail(g);
  if (tab === 'trening') return renderTraining(g, state);
  if (tab === 'transfery') return state.ng ? renderNegotiation(g, state.ng) : renderTransfers(g, state);
  if (tab === 'klub') return renderClubHub(g, state);
  if (tab === 'rozgrywki') return renderCompetitions(g, { comp: state.cComp ?? compOfClub(club) ?? 'ekstraklasa', view: state.cView, round: state.cRound, filter: state.uFilter, draw: state.uDraw });
  if (tab === 'kadra') {
    const sub = `<div class="subtabs" role="tablist"><button role="tab" data-act="tsub" data-s="players" aria-selected="${state.sqSub === 'players'}">Zawodnicy</button><button role="tab" data-act="tsub" data-s="tactics" aria-selected="${state.sqSub === 'tactics'}">Skład i taktyka</button><button role="tab" data-act="tsub" data-s="talks" aria-selected="${state.sqSub === 'talks'}">Rozmowy</button><button role="tab" data-act="tsub" data-s="report" aria-selected="${state.sqSub === 'report'}">Raport ogólny</button></div>`;
    if (state.sqSub === 'talks') return sub + renderTalks(g, state);
    if (state.sqSub === 'report') return sub + renderTeamReport(g, { msg: state.trepMsg ?? '', sel: state.trepSel ?? 0 });
    if (state.sqSub === 'tactics') {
      queueMicrotask(mountTacticsScreen); // po wstawieniu HTML: okno atrybutów i fokus
      return sub + renderTactics({ squad: mySquad(g), tactics: g.tactics, sel: state.tSel, benchSize: benchSizeFor(g), info: state.tInfo, msg: state.tMsg, numbers: shirtNumbers(g, g.clubId, squadOf(g.world, g.clubId)), kit: kitColors(clubById(g.clubId)), infoExtra: state.tInfo && g.world.players[state.tInfo] ? playerStatsHtml(g.world.players[state.tInfo], g) : '' });
    }
    const ovrs = leagueOvrs(g, club.tier);
    const p = state.playerOpen && g.world.players[state.playerOpen];
    if (p) {
      const inAcademy = !!g.world.clubs[g.clubId]?.academy?.includes(p.id);
      return renderPlayerProfile(p, { leagueOvrs: ovrs, clubName: club.name, date: g.date, game: g, promote: inAcademy ? canPromote(g, p.id) : null, promoteMsg: state.acMsg?.id === p.id ? state.acMsg.text : null });
    }
    return sub + renderSquadList(squadOf(g.world, g.clubId), { filter: state.sqFilter, leagueOvrs: ovrs, academy: academyOf(g.world, g.clubId), view: state.sqView ?? 'overview', sort: state.sqSort, game: g });
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
const shortDate = (iso) => fmtDay(iso);
const fewPl = (n) => n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
const plural = (n, one, few, many) => (n === 1 ? one : fewPl(n) ? few : many);
const daysWord = (n) => (n === 1 ? 'dzień' : 'dni');
const signedZl = (n) => `${n > 0 ? '+' : ''}${fmtZl(n)}`;
const DASH_ICONS = {
  table: '<path d="M4 5h16v14H4zM4 10h16M4 14.5h16M9 5v14"/>',
  board: '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6M3 20h18"/>',
  fin: '<ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v5.5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6.5M5 12v5.5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V12"/>',
  squad: '<path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z"/>',
  fix: '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4M8 14h3M13 14h3M8 17h3"/>',
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
  // Tabela ligi klubu (III liga: grupa klubu)
  return (club) => {
    const comp = compOfClub(club);
    if (!comp) return [];
    if (!cache.has(comp)) cache.set(comp, standings(g.fixtures.filter((f) => f.comp === comp), compClubIds(comp)));
    return cache.get(comp);
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
    const row = pl && pl.tier >= 1 && pl.tier <= 4 ? tableOf(pl).find((r) => r.id === id) : null;
    const meta = row ? (row.played ? `${row.pos}. miejsce${compOfClub(pl) !== compOfClub(club) ? `, ${leagueLabel(pl)}` : ''}, ${row.points} pkt` : leagueLabel(pl)) : '';
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
  </section>`;
}

/** Terminarz: ostatnie wyniki i najbliższe mecze z rozgrywkami i miejscem meczu (src/ui/fixturesView.js). */
function dashFixtures(g) {
  return dashPanel('fix', 'fix', 'Terminarz', fixturesPanelBody(g), '<button class="dash-link" data-act="fixtures">Pokaż wszystko</button>');
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
      <td class="dash-t__club"><span class="dash-t__cl">${crestHtml(c, { size: 20, clubsById })}<button class="club-link" data-act="club" data-club="${esc(c.id)}" title="Pokaż klub">${esc(c.name)}</button></span></td>
      <td>${r.played}</td><td>${r.goalDiff > 0 ? '+' : ''}${r.goalDiff}</td><td class="dash-t__pts">${r.points}</td>
    </tr>`;
  }).join('');
  const me = table[i];
  const legend = zones.map((z) => `<li data-z="${z.kind}">${esc(z.label)}</li>`).join('');
  const body = `<table class="dash-t">
      <caption class="sr">${esc(leagueLabel(club))}: tabela wokół twojego klubu</caption>
      <thead><tr><th scope="col"><span class="sr">Miejsce</span></th><th scope="col">Klub</th><th scope="col"><abbr title="Mecze">M</abbr></th><th scope="col"><abbr title="Bilans bramek">+/-</abbr></th><th scope="col">Pkt</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="dash-note">${me.played ? `${me.played} ${plural(me.played, 'mecz', 'mecze', 'meczów')}: ${me.wins} ${plural(me.wins, 'wygrana', 'wygrane', 'wygranych')}, ${me.draws} ${plural(me.draws, 'remis', 'remisy', 'remisów')}, ${me.losses} ${plural(me.losses, 'porażka', 'porażki', 'porażek')}, bramki ${me.gf}:${me.ga}.` : 'Liga jeszcze nie wystartowała. Kolejność w tabeli jest umowna.'}</p>
    <ul class="dash-zones">${legend}</ul>`;
  return dashPanel('table', 'table', esc(leagueLabel(club)), body, dashLink('rozgrywki', 'Pełna tabela'));
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
  return dashPanel('board', 'board', 'Zarząd', body, dashLink('klub', 'Zarząd', 'zarzad'));
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
  return dashPanel('fin', 'fin', 'Finanse', body, dashLink('klub', 'Finanse', 'finanse'));
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
      <ul class="dash-moves">${moves.map((h) => `<li${h.from === g.clubId || h.to === g.clubId ? ' class="is-mine"' : ''}${g.world.players[h.playerId] ? ` data-pid="${esc(h.playerId)}" data-why="move"` : ''}><b>${esc(h.name)}</b><span class="dash-moves__route">${route(h)}</span><small>${esc(terms(h))}${esc(shortDate(h.date))}</small></li>`).join('')}</ul>`;
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
    return `<li data-pid="${esc(p.id)}" data-why="${k}"><span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span><span class="dash-abs__name">${esc(p.name)}</span><span class="dash-abs__why" data-k="${k}">${esc(txt)}</span></li>`;
  }).join('');
  const freshBand = fresh == null ? '' : fresh >= 80 ? 'good' : fresh >= 65 ? 'mid' : 'low';
  const ending = squadOf(g.world, g.clubId).filter((p) => !p.loan && p.contract?.until && daysBetween(g.date, p.contract.until) <= 365)
    .sort((a, b) => a.contract.until.localeCompare(b.contract.until) || b.ovr - a.ovr);
  const endList = ending.slice(0, 6).map((p, k) => `<li${k >= 3 ? ' class="dash-more"' : ''} data-pid="${esc(p.id)}" data-why="contract"><span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span><span class="dash-abs__name">${esc(p.name)}</span><span class="dash-abs__why" data-k="contract">${esc(fmtDate(p.contract.until))}</span></li>`).join('');
  // Limit kadry (docs/limit-kadry.md): ostrzeżenie, gdy kadra jest ponad limitem zarządu albo biegnie termin
  const L = limitStatus(g);
  const lc = L.case;
  const limitText = lc ? `Kadra ${L.counted}/${L.soft}: ${lc.stage === 'warn' ? `zarząd żąda redukcji o ${L.over}` : lc.stage === 'listed' ? 'zarząd wystawił zawodników na listę' : `wciąż ${L.over} ponad limit`}, termin ${L.daysLeft === 0 ? 'dziś' : `za ${L.daysLeft} ${daysWord(L.daysLeft)}`}.`
    : L.over > 0 ? `Kadra ${L.counted}/${L.soft}: ponad limitem zarządu o ${L.over}.`
      : L.full ? `Kadra pełna (${L.counted}/${L.hard}): nowe transfery zablokowane.` : '';
  const limitHtml = limitText
    ? `<p class="dash-alert dash-alert--top">${esc(limitText)} <button class="dash-link" data-act="tab" data-tab="transfery" data-sub="rynek">Limit kadry</button></p>`
    : '';
  const body = `${limitHtml}<ul class="dash-stats">
      <li><span>Morale</span><b>${esc(moraleLabel(morale))}</b></li>
      <li><span>Świeżość składu</span><b data-b="${freshBand}">${fresh == null ? 'brak składu' : `${fresh}%`}</b></li>
      <li><span>Zgranie</span><b>${esc(coh.label)}</b></li>
    </ul>
    <h4 class="dash-sub">Niedostępni${out.length ? ` (${out.length})` : ''}</h4>
    ${out.length ? `<ul class="dash-abs">${list}</ul>${out.length > 5 ? `<p class="dash-note">i jeszcze ${out.length - 5}</p>` : ''}` : '<p class="dash-note dash-note--ok">Wszyscy zawodnicy są do dyspozycji.</p>'}
    ${limitHtml ? '' : `<p class="dash-note">Limit kadry: ${L.counted} z ${L.soft} (maksimum ${L.hard}), bez ${L.exempt.length} ${plural(L.exempt.length, 'wychowanka', 'wychowanków', 'wychowanków')} do 21 lat.</p>`}
    ${ending.length ? `<h4 class="dash-sub">Kontrakt kończy się w ciągu roku (${ending.length})</h4><ul class="dash-abs">${endList}</ul>` : ''}`;
  return dashPanel('squad', 'squad', 'Stan kadry', body, dashLink('kadra', 'Kadra'));
}

function dashMail(g) {
  const unread = unreadCount(g.inbox);
  const pend = pendingDecisions(g.inbox);
  const latest = g.inbox.slice(0, 8);
  const body = `${pend.length ? `<button class="dash-decide" data-act="mail" data-id="${esc(pend[0].id)}"><span class="dash-decide__card" aria-hidden="true"></span>${pend.length} ${plural(pend.length, 'wiadomość czeka', 'wiadomości czekają', 'wiadomości czeka')} na twoją decyzję</button>` : ''}
    <ul class="mail-list stripes dash-mail">${latest.map((m, k) => (k >= 5 ? mailRow(m, g.date).replace('<li>', '<li class="dash-more">') : mailRow(m, g.date))).join('') || '<li class="mail-empty">Brak wiadomości.</li>'}</ul>`;
  return dashPanel('mail', 'poczta', `Poczta${unread ? ` <span class="dash-p__count">${unread} ${plural(unread, 'nowa', 'nowe', 'nowych')}</span>` : ''}`, body, dashLink('poczta', 'Cała poczta'));
}

function renderDashboard(g, club) {
  const tableOf = dashTables(g);
  const table = tableOf(club);
  const waiting = pendingDecisions(g.inbox);
  const decideBar = waiting.length ? `<div class="dash-decide" role="status"><span><b>${waiting.length === 1 ? 'Czeka decyzja' : `Czekają decyzje (${waiting.length})`}:</b> ${esc(waiting[0].subject ?? '')}. Gra ruszy dalej po decyzji.</span><button class="btn btn--primary btn--sm" data-act="mail" data-id="${esc(waiting[0].id)}">Otwórz decyzję</button></div>` : '';
  return `<div class="dash">
    <h2 class="dash__title">Pulpit</h2>
    ${decideBar}
    <div class="dash__grid">
      ${dashHero(g, club, nextFixture(g), tableOf)}
      ${dashFixtures(g)}
      ${dashTable(g, club, table)}
      ${dashSquad(g)}
      ${dashMail(g)}
      ${dashBoard(g, table)}
      ${dashFinance(g)}
      ${dashWindow(g)}
    </div>
  </div>`;
}

// ---------- Poczta: lista i czytanie (PC: dwie kolumny, telefon: lista albo wiadomość) ----------
const MAIL_CAT = { board: ['ZA', 'Zarząd'], staff: ['SZ', 'Sztab'], players: ['ZW', 'Zawodnicy'], transfers: ['TR', 'Transfery'], competitions: ['RO', 'Rozgrywki'], national: ['RP', 'Reprezentacja'], media: ['ME', 'Media'], club: ['KL', 'Klub'] };
const mailDayLabel = (iso, today) => {
  const diff = Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${iso}T12:00:00Z`)) / 86400000);
  return diff === 0 ? 'dziś' : diff === 1 ? 'wczoraj' : `${weekday(iso).slice(0, 3)}, ${fmtDay(iso)}`;
};
const mailSnippet = (body) => String(body ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
const needsAnswer = (m) => m.actions?.length && !m.resolved;

/** Treść wiadomości: akapity (pusta linia), łamania wierszy, listy z „- ” na początku linii. */
function mailBodyHtml(body) {
  return String(body ?? '').split(/\n{2,}/).map((para) => {
    const lines = para.split('\n');
    if (lines.length > 1 && lines.every((l) => /^\s*[-•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(esc).join('<br>')}</p>`;
  }).join('');
}

function mailRow(m, today, openId) {
  const [ab, label] = MAIL_CAT[m.category] ?? ['?', CATEGORIES[m.category] ?? ''];
  return `<li><button class="mail-row ${m.read ? '' : 'mail-row--unread'} ${m.id === openId ? 'is-open' : ''}" data-act="mail" data-id="${esc(m.id)}" data-cat="${esc(m.category)}" data-p="${esc(m.priority)}">
    <span class="mail-row__av" aria-hidden="true">${esc(ab)}</span>
    <span class="mail-row__body">
      <span class="mail-row__top"><span class="mail-row__from">${esc(m.from)}</span><time class="mail-row__date" datetime="${esc(m.date)}">${esc(mailDayLabel(m.date, today))}</time></span>
      <span class="mail-row__subj">${needsAnswer(m) ? '<span class="mail-tag">Decyzja</span>' : ''}${esc(m.subject)}</span>
      <span class="mail-row__snip">${esc(label)}: ${esc(mailSnippet(m.body))}</span>
    </span>
  </button></li>`;
}

/** Następna nieprzeczytana wiadomość w bieżącej kategorii: dalej w liście od otwartej, potem od początku. */
function nextUnreadId(list, currentId) {
  const i = list.findIndex((x) => x.id === currentId);
  return [...list.slice(i + 1), ...list.slice(0, Math.max(0, i))].find((x) => !x.read && x.id !== currentId)?.id ?? null;
}

function mailReader(g, m, nextId) {
  const [ab, label] = MAIL_CAT[m.category] ?? ['?', CATEGORIES[m.category] ?? ''];
  return `<article class="mail-view" data-cat="${esc(m.category)}" aria-labelledby="mail-h">
    <p class="mail-view__nav"><button class="btn btn--quiet btn--sm mail-back" data-act="mailback">Wróć do skrzynki</button>${nextId ? `<button class="btn btn--quiet btn--sm" data-act="mail" data-id="${esc(nextId)}">Następna nieprzeczytana</button>` : ''}</p>
    <header class="mail-view__head">
      <span class="mail-row__av" aria-hidden="true">${esc(ab)}</span>
      <div class="mail-view__meta">
        <p class="mail-view__cat"><span class="mail-cat">${esc(label)}</span>${m.priority === 'urgent' ? '<span class="mail-tag">Pilne</span>' : m.priority === 'important' ? '<span class="mail-tag mail-tag--imp">Ważne</span>' : ''}</p>
        <h2 id="mail-h">${esc(m.subject)}</h2>
        <p class="mail-view__from"><span>Od: <b>${esc(m.from)}</b></span><span>Nadano: <time datetime="${esc(m.date)}">${esc(weekday(m.date))}, ${esc(fmtDate(m.date))}</time></span></p>
      </div>
    </header>
    <div class="mail-view__body">${mailBodyHtml(m.body)}</div>
    ${needsAnswer(m) ? `<section class="mail-decide"><h3>Twoja decyzja</h3><div class="mail-actions">${m.actions.map((a, i) => `<button class="btn ${i === 0 ? 'btn--primary' : 'btn--quiet'}" data-act="mailaction" data-id="${esc(m.id)}" data-a="${esc(a.id)}">${esc(a.label)}</button>`).join('')}</div></section>` : ''}
    ${m.refs?.kind === 'teamReport' ? '<p class="mail-view__foot"><button class="btn btn--sm" data-act="trep-open">Otwórz pełny raport</button></p>' : ''}
    ${m.chosen ? `<p class="mail-chosen">Twoja odpowiedź: <b>${esc(m.actions.find((a) => a.id === m.chosen)?.label ?? '')}</b></p>` : ''}
    ${canDelete(m) ? `<p class="mail-view__foot"><button class="btn btn--quiet btn--sm" data-act="maildel" data-id="${esc(m.id)}">Usuń wiadomość</button></p>` : ''}
  </article>`;
}

function renderMail(g) {
  const open = state.mailOpen ? g.inbox.find((x) => x.id === state.mailOpen) : null;
  const cats = Object.entries(CATEGORIES).filter(([k]) => g.inbox.some((m) => m.category === k));
  const chips = [['', 'Wszystkie', unreadCount(g.inbox)], ...cats.map(([k, v]) => [k, v, unreadCount(g.inbox, k)])]
    .map(([k, v, n]) => `<button class="chip" data-act="mailcat" data-cat="${k}" aria-pressed="${(state.mailCat || '') === k}">${esc(v)}${n ? ` <b>${n}</b>` : ''}</button>`).join('');
  const list = filterInbox(g.inbox, state.mailCat);
  const pending = pendingDecisions(g.inbox).length;
  const unread = unreadCount(g.inbox);
  const nextId = nextUnreadId(list, open?.id ?? null);
  return `<div class="mailx ${open ? 'is-reading' : ''}">
    <div class="mail-head"><h2>Poczta <small class="muted">${g.inbox.length} wiadomości${unread ? `, ${unread} nieprzeczytanych` : ''}</small></h2><span class="mail-tools">${nextId && !open ? `<button class="btn btn--primary btn--sm" data-act="mail" data-id="${esc(nextId)}">Pierwsza nieprzeczytana</button>` : ''}<button class="btn btn--quiet btn--sm" data-act="readall">Oznacz jako przeczytane</button><button class="btn btn--quiet btn--sm" data-act="mailprune" data-m="read">Usuń przeczytane</button><button class="btn btn--quiet btn--sm" data-act="mailprune" data-m="old">Usuń starsze niż 30 dni</button></span></div>
    ${pending ? `<p class="notice">Masz ${pending} ${pending === 1 ? 'wiadomość wymagającą' : 'wiadomości wymagające'} odpowiedzi.</p>` : ''}
    <div class="chips">${chips}</div>
    <div class="mailx__panes">
      <ul class="mail-list" aria-label="Wiadomości">${list.map((m) => mailRow(m, g.date, open?.id)).join('') || '<li class="mail-empty">Brak wiadomości w tej kategorii.</li>'}</ul>
      <div class="mailx__read">${open ? mailReader(g, open, nextId) : '<p class="mail-pick">Wybierz wiadomość z listy, żeby ją przeczytać.</p>'}</div>
    </div>
    <p class="hint mailx__hint">Stare przeczytane wiadomości gra usuwa sama co tydzień. Wiadomości z decyzją do podjęcia zostają.</p>
  </div>`;
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
    onLineup: () => {
      state.md = null; state.screen = 'hub'; state.tab = 'kadra'; state.sqSub = 'tactics'; state.playerOpen = null; state.extPlayer = null;
      state.tMsg = 'Ustaw skład, a potem kliknij „Zagraj mecz” na górze, żeby wrócić do dnia meczowego.';
      render(); window.scrollTo({ top: 0 });
    },
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
  const cfgFor = (id, squad, tactics, ai) => ({ club: anyClub(id), squad, tactics, ai, coach: coachStyle(g, id) });
  const mine = cfgFor(g.clubId, mySquad(g), g.tactics, false);
  const theirs = cfgFor(oppId, oppSquad, createTactics(oppSquad, { benchSize: bench, benchGk: COMPETITIONS[f.comp]?.benchGk ?? 1 }), true);
  // Trener rywala z atrybutami i asystent gracza (docs/trener-ai-atrybuty.md)
  const rank = f.comp === 'pp' ? (f.round === 'F' ? 3 : 1) : f.comp === 'super' ? 3 : f.comp === 'uefa' ? 2 : 0;
  if (f.comp !== 'friendly') theirs.coachQ = matchCoach(coachOf(g, oppId, oppClub), { rank, rng: formRng(g, f.id, oppId) });
  mine.assistantQ = matchCoach(assistantProfile(staffQ(g, g.clubId, 'asystent'), clubById(g.clubId)?.tier), { rank, rng: formRng(g, f.id, g.clubId) });
  Object.assign(mine, trainingMatchInput(g, g.clubId, mine));
  Object.assign(theirs, trainingMatchInput(g, oppId, theirs));
  const M = createMatch({
    seed: `${g.seed}:${f.id}`,
    home: mySide === 0 ? mine : theirs,
    away: mySide === 0 ? theirs : mine,
    ctx: { neutral: !!f.neutral, var: f.comp === 'ekstraklasa' || f.comp === 'super' || f.round === 'SF' || f.round === 'F', rank: f.comp === 'pp' ? (f.round === 'F' ? 3 : 1) : f.comp === 'super' ? 2 : 0, refStrict: 0.85 + new Rng(f.id).next() * 0.35,
      // Superpuchar od razu na karne, dwumecz z wynikiem 1. meczu, sparing wg zasad z terminarza (docs/sparingi-i-karne.md)
      knockout: ['single', 'penaltiesOnly'].includes(f.knockout) ? f.knockout : f.knockout?.firstLeg ? { firstLeg: [...f.knockout.firstLeg] } : false,
      friendlyRules: f.comp === 'friendly' ? { ...(f.friendlyRules ?? {}) } : undefined },
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
  const squadKey = () => (g.world?.clubs?.[g.clubId]?.squad ?? []).join(',');
  const squadBefore = squadKey(); // transakcje w toku kończą się w pętli dni (career/transferDeals.js)
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
  if (squadKey() !== squadBefore) afterSquadChange(g);
  // Po Dalej zawsze Pulpit (nowe wiadomości i decyzje widać w panelu Poczta i w pasku decyzji na Pulpicie)
  if (reason === 'message' || reason === 'decision' || reason === 'prematch') { state.tab = 'pulpit'; state.fx = null; state.extPlayer = null; state.extClub = null; state.mailOpen = null; }
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

/** Ruch w składzie (przeciąganie i menu kontekstowe „tmove”): te same reguły co wybór dwoma dotknięciami. */
async function applyMove(src, dst) {
  const g = state.game;
  const r = resolveMove(g.tactics, src, dst, tCtx(g));
  if (!r.ok) return r;
  g.tactics = r.tactics;
  state.tSel = null;
  state.tMsg = r.text;
  tUi.lastTap = null;
  await save();
  renderTacticsAfter();
  return r;
}

const ROLE_KEYS = ['captain', 'penalty', 'freeKick', 'corner'];
/** Kapitan i wykonawcy stałych fragmentów (lista wyboru na ekranie składu i menu kontekstowe). */
async function setRole(role, id) {
  if (!ROLE_KEYS.includes(role) || !id) return;
  state.game.tactics = { ...state.game.tactics, [role]: id };
  await save();
  render();
}

mountTacticsDrag(app, {
  resolve: (src, dst) => resolveMove(state.game.tactics, src, dst, tCtx(state.game)),
  onDrop: (src, dst) => applyMove(src, dst),
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
  if (ev.target.matches?.('input[data-act="sys-theme"]')) { await sysAction('sys-theme', ev.target); return; } // Opcje: motyw
  const sel = ev.target.closest('select[data-act="trole"]');
  if (!sel) return;
  await setRole(sel.dataset.role, sel.value);
});

// ---------- Akcje ----------
async function newGame(slot, clubId, profile = null) {
  applySeasonState({});
  restoreOriginals();
  const seed = hashString(`${clubId}:${Date.now()}:${Math.random()}`);
  const game = {
    seed, clubId, date: GAME_START, season: SEASON, createdAt: new Date().toISOString(),
    inbox: [],
  };
  // Profil trenera: tylko w zapisie gry na tym urządzeniu (gra nie wysyła danych do sieci)
  if (profile) game.manager = { profile };
  game.season = createSeason(seed, { playerClub: clubId });
  game.fixtures = game.season.fixtures;
  game.world = generateWorld(seed);
  game.tactics = createTactics(squadOf(game.world, clubId), { benchSize: benchSizeFor(game) });
  ensureTraining(game);
  ensureCareer(game);
  processDay(game);
  state.game = game;
  state.slot = slot;
  state.nc = null;
  state.repOpen = null;
  await save();
  state.screen = 'hub';
  state.tab = 'pulpit'; // po podpisaniu kontraktu start na Pulpicie
  render();
}

app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  return dispatchAct(el);
});

/**
 * Wykonuje akcję data-act. el: przycisk albo { dataset } z menu kontekstowego.
 * root: miejsce, z którego handlery czytają pola formularzy (null = tylko wartości z dataset).
 */
async function dispatchAct(el, { root = app } = {}) {
  const act = el.dataset.act;
  if (act?.startsWith('sys-') && state.game) { await sysAction(act, el); return; } // Opcje, Zapis, Wyjście
  if (isEditorAction(act) && state.game && state.screen === 'editor') { await editorAction(act, el); return; }
  if (isTalkAction(act) && state.game) {
    const r = handleTalkAction(state.game, act, el.dataset, root);
    Object.assign(state, r.ui ?? {});
    if (r.save) await save();
    render();
    return;
  }
  if (isClubAction(act) && state.game) {
    const r = handleClubAction(state.game, act, el.dataset, root);
    Object.assign(state, r.ui ?? {});
    if (r.save) await save();
    render();
    return;
  }
  if (isTransferAction(act) && state.game) {
    const r = handleTransferAction(state.game, act, el.dataset, root);
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
    if (d?.accepted && d.kind === 'sign' && d.pre) {
      state.tfMsg = signUserPre(state.game, d.playerId, d.contract).text; // umowa od 1 lipca (career/preContracts.js)
    } else if (d?.accepted && d.kind === 'sign') {
      const p = state.game.world.players[d.playerId];
      // Po rozmowach: testy medyczne i zgłoszenie (zakładka Transfery, W toku)
      const deal = startDeal(state.game, { playerId: d.playerId, to: state.game.clubId, fee: d.fee ?? 0, contract: d.contract, kind: d.fromClub ? 'transfer' : 'free', stage: 'medical' });
      state.tfMsg = deal ? `${p.name} zgodził się na warunki. Teraz testy medyczne, zgłoszenie spodziewane ${fmtDate(expectedRegistration(deal))}.` : `${p.name} jest już w trakcie innej transakcji.`;
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
    if (act === 'new') startCareer(slot);
    if (act === 'newcareer') {
      const free = (await store.listSlots()).find((s) => s.empty);
      if (free) startCareer(free.slot);
      else { state.notice = 'Wszystkie sloty są zajęte. Usuń jeden zapis, aby zacząć nową karierę.'; state.menuFocus = '#saves-title'; render(); }
    }
    if (act === 'back' || act === 'menu') { state.running = false; state.screen = 'start'; state.confirmDel = null; render(); }
    if (act === 'slots') {
      const h = app.querySelector('#saves-title');
      h?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      h?.focus({ preventScroll: true });
    }
    if (act === 'theme') { state.theme = nextTheme(state.theme); applyTheme(state.theme); state.menuFocus = '[data-act="theme"]'; render(); }
    if (act === 'ncBack') {
      if (!state.nc || state.nc.step <= 1) { state.screen = 'start'; render(); }
      else careerGo(state.nc.step - 1, state.nc.step === 3 && state.nc.clubId ? `[data-club="${state.nc.clubId}"]` : '#nc-first');
    }
    if (act === 'ncRandom' && state.nc) {
      const natSel = app.querySelector('#nc-nat');
      if (natSel && isNationality(natSel.value)) state.nc.nat = natSel.value;
      const n = randomCoach(state.nc.nat);
      state.nc.first = n.first; state.nc.last = n.last;
      for (const k of ['first', 'last']) { const inp = app.querySelector(`#nc-${k}`); if (inp) inp.value = state.nc[k]; state.nc.errors[k] = ''; setFieldError(app, k, ''); }
      updateCoachPreview(app, state.nc);
      if (!state.nc.errors.age) { const m = app.querySelector('#nc-msg'); if (m) m.textContent = ''; }
    }
    if (act === 'ageDec') setAge(-1);
    if (act === 'ageInc') setAge(1);
    if (act === 'profileNext' && state.nc && readCoachForm()) {
      if (state.nc.clubId) { state.nc.tier = clubById(state.nc.clubId).tier; if (state.nc.tier === 4) state.nc.l3group = clubById(state.nc.clubId).group; }
      careerGo(2, state.nc.clubId ? `[data-club="${state.nc.clubId}"]` : '[role="tab"][aria-selected="true"]');
    }
    if (act === 'tier' && state.nc) { state.nc.tier = Number(el.dataset.tier); state.nc.msg = ''; render(); app.querySelector(`[data-act="tier"][data-tier="${state.nc.tier}"]`)?.focus(); }
    if (act === 'ncgroup' && state.nc) { state.nc.l3group = Number(el.dataset.g); state.nc.msg = ''; render(); app.querySelector(`[data-act="ncgroup"][data-g="${state.nc.l3group}"]`)?.focus(); }
    if (act === 'pick' && state.nc) {
      state.nc.clubId = el.dataset.club; state.nc.tier = clubById(el.dataset.club).tier; state.nc.msg = '';
      render();
      app.querySelector(`[data-club="${state.nc.clubId}"]`)?.focus({ preventScroll: true });
    }
    if (act === 'pickConfirm' && state.nc) {
      if (!state.nc.clubId) {
        state.nc.msg = 'Wybierz klub z listy.';
        const m = app.querySelector('#nc-msg'); if (m) m.textContent = state.nc.msg;
        app.querySelector('.cc')?.focus();
      } else careerGo(3, '[data-act="sign"]');
    }
    if (act === 'sign' && state.nc?.clubId) {
      const nc = state.nc;
      if (nameError(nc.first, 'first') || nameError(nc.last, 'last') || ageError(nc.age)) { careerGo(1); readCoachForm(); return; }
      el.disabled = true; el.textContent = 'Podpisano. Przygotowuję sezon…'; el.setAttribute('aria-busy', 'true');
      app.querySelector('.contract')?.classList.add('is-signed'); // podpis pojawia się na umowie
      await new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 450)); // podpis widoczny przed generowaniem świata
      await newGame(nc.slot, nc.clubId, profileOf(nc));
    }
    if (act === 'tab') { state.tab = el.dataset.tab; state.mailOpen = null; state.playerOpen = null; state.repOpen = null; state.fx = null; state.extPlayer = null; state.extClub = null; if (el.dataset.sub) { if (state.tab === 'klub') state.kTab = el.dataset.sub; else state.tfTab = el.dataset.sub; } render(); }
    // Terminarz i wyniki (Pulpit > Pokaż wszystko): sezon, rozgrywki, miejsce meczu
    if (act === 'fixtures') { state.tab = 'pulpit'; state.fx = { season: null, comp: 'all', venue: 'all' }; render(); window.scrollTo({ top: 0 }); app.querySelector('.fxs h2')?.setAttribute('tabindex', '-1'); app.querySelector('.fxs h2')?.focus({ preventScroll: true }); }
    if (act === 'fxback') { state.fx = null; render(); app.querySelector('[data-act="fixtures"]')?.focus(); }
    if (act === 'fxseason' || act === 'fxcomp' || act === 'fxvenue') {
      const key = { fxseason: ['season', 's'], fxcomp: ['comp', 'k'], fxvenue: ['venue', 'v'] }[act];
      state.fx = { ...(state.fx ?? {}), [key[0]]: el.dataset[key[1]], ...(act === 'fxseason' ? { comp: 'all', venue: 'all' } : act === 'fxcomp' ? { venue: 'all' } : {}) };
      render();
      app.querySelector(`[data-act="${act}"][data-${key[1]}="${CSS.escape(el.dataset[key[1]])}"]`)?.focus({ preventScroll: true });
    }
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
      else if (a.kind === 'decide') { state.tab = 'pulpit'; state.fx = null; state.extPlayer = null; state.extClub = null; render(); }
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
    if (act === 'sqview') { state.sqView = el.dataset.v; state.sqSort = null; render(); }
    if (act === 'sqsort') { const k = el.dataset.k; state.sqSort = state.sqSort?.k === k ? { k, dir: state.sqSort.dir === 'desc' ? 'asc' : 'desc' } : { k, dir: k === 'name' || k === 'pos' ? 'asc' : 'desc' }; render(); }
    if (act === 'player') { state.playerOpen = el.dataset.id; render(); window.scrollTo({ top: 0 }); }
    if (act === 'squadback') { state.playerOpen = null; render(); }
    if (act === 'arep') { state.repOpen = el.dataset.id; render(); window.scrollTo({ top: 0 }); }
    if (act === 'arepback') { state.repOpen = null; render(); }
    // Raport ogólny o drużynie: na prośbę trenera (co 14 dni) i otwarcie z poczty
    if (act === 'trep-req') { const r = requestTeamReport(g); state.trepMsg = r.ok ? 'Sztab przygotował nowy raport.' : r.msg; if (r.ok) state.trepSel = 0; if (r.ok) await save(); render(); }
    if (act === 'trep-sel') { state.trepSel = Number(el.dataset.i) || 0; state.trepMsg = ''; render(); }
    if (act === 'trep-open') { state.tab = 'kadra'; state.sqSub = 'report'; state.trepSel = 0; state.mailOpen = null; state.playerOpen = null; state.repOpen = null; state.trepMsg = ''; render(); window.scrollTo({ top: 0 }); }
    if (act === 'extplayer') {
      const id = el.dataset.id; const pl = state.game?.world.players[id];
      if (pl && pl.clubId === state.game.clubId) { state.extPlayer = null; state.tab = 'kadra'; state.sqSub = 'players'; state.playerOpen = id; }
      else if (pl) state.extPlayer = { id };
      render(); window.scrollTo({ top: 0 });
    }
    if (act === 'ac-promote') {
      const r = promoteYouth(state.game, el.dataset.id);
      state.acMsg = { id: el.dataset.id, text: r.text }; state.tMsg = r.text;
      if (r.ok) { afterSquadChange(state.game); await save(); }
      render();
    }
    if (act === 'extback') { state.extPlayer = null; render(); }
    if (act === 'club') {
      const id = el.dataset.club;
      if (id === state.game.clubId) { state.extClub = null; state.extPlayer = null; state.tab = 'kadra'; state.sqSub = 'players'; state.playerOpen = null; }
      else if (hasClubView(state.game, id)) { state.extClub = id; state.extPlayer = null; }
      render(); window.scrollTo({ top: 0 });
    }
    if (act === 'clubback') { state.extClub = null; state.extPlayer = null; render(); }
    if (act === 'tsub') { state.sqSub = el.dataset.s; state.trepMsg = ''; state.tSel = null; state.tInfo = null; state.tMsg = ''; state.playerOpen = null; state.ttResult = null; state.ttMeeting = null; render(); }
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
    if (act === 'tmove') {
      const r = await applyMove(parseLoc(el.dataset.src), parseLoc(el.dataset.dst));
      if (!r.ok) { state.tMsg = r.reason || 'Ten ruch nic nie zmienia.'; renderTacticsAfter(); }
    }
    if (act === 'trole' && el.dataset.id) await setRole(el.dataset.role, el.dataset.id);
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
      if (m?.refs?.kind === 'incomingOffer' || m?.refs?.kind === 'jobOffer' || m?.refs?.kind === 'moveWish' || m?.refs?.kind?.startsWith('loan')) afterSquadChange(g); // loan*: wypożyczenia (career/loans.js)
      await save(); render();
    }
    if (act === 'load' || act === 'continue') {
      const rec = await store.loadSlot(slot);
      if (!rec) throw new Error('Ten slot jest pusty.');
      state.game = ensureGameShape(rec.game); state.slot = slot; state.screen = 'hub'; state.tab = 'pulpit'; state.confirmDel = null; state.repOpen = null; render();
    }
    // Usunięcie zapisu: potwierdzenie w wierszu slotu (bez okna przeglądarki)
    if (act === 'delete') { state.confirmDel = slot; state.menuFocus = `[data-act="deleteNo"][data-slot="${slot}"]`; render(); }
    if (act === 'deleteNo') { state.confirmDel = null; state.menuFocus = `[data-act="delete"][data-slot="${slot}"]`; render(); }
    if (act === 'deleteYes') {
      await store.deleteSlot(slot); state.confirmDel = null; state.notice = `Usunięto zapis ze slotu ${slot}.`;
      state.menuFocus = `[data-act="new"][data-slot="${slot}"]`; render();
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
    // Błąd widoku w trakcie kariery: zostajemy w grze (widok podglądu zamknięty), zamiast wyrzucać na ekran startowy
    if (state.game && state.screen === 'hub') {
      console.error(err);
      state.extPlayer = null; state.extClub = null; state.repOpen = null; state.fx = null;
      try { render(); window.alert(`Nie udało się otworzyć tego widoku: ${err.message}`); return; } catch (e2) { console.error(e2); }
    }
    state.notice = err.message; state.screen = 'start'; render();
  }
}

// ---------- Menu kontekstowe zawodnika (prawy przycisk, przytrzymanie, klawisz menu, Shift+F10) ----------
/** Widok dla dostawcy opcji (src/ui/playerMenus.js) albo null, gdy menu zawodnika nie ma sensu. */
function menuView() {
  if (state.screen !== 'hub' || !state.game) return null;
  if (state.tab === 'pulpit') return 'dashboard';
  if (state.tab === 'kadra') return state.sqSub === 'tactics' ? 'tactics' : state.sqSub === 'talks' ? 'talks' : state.playerOpen ? 'profile' : 'squad';
  if (state.tab === 'transfery') return state.ng ? null : 'transfers';
  if (state.tab === 'trening') return 'training';
  return null;
}

const MSG_KEYS = ['tfMsg', 'trNotice', 'ttResult', 'tMsg'];

/** Fokus po akcji z menu: wskazany element, a gdy fokus wypadł z ekranu, ten sam zawodnik albo główna część. */
function focusAfterMenu(run, pid) {
  const want = run.focus && app.querySelector(run.focus);
  if (want) { want.focus({ preventScroll: false }); return; }
  if (app.contains(document.activeElement) && document.activeElement !== app) return;
  const row = app.querySelector(`[data-pid="${CSS.escape(pid)}"]`);
  const btn = row && (row.matches('button') ? row : row.querySelector('button'));
  if (btn) { btn.focus({ preventScroll: true }); return; }
  const main = app.querySelector('#main');
  if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
}

/** Pozycja menu: kolejne akcje data-act, potem komunikat (toast) i fokus. */
async function runMenuItem(it, pid) {
  const run = it.run;
  if (!run?.steps?.length) return;
  if (run.toast === true) for (const k of MSG_KEYS) state[k] = null;
  for (const { act, ...data } of run.steps) {
    const dataset = { act };
    for (const [k, v] of Object.entries(data)) dataset[k] = String(v ?? '');
    await dispatchAct({ dataset, tagName: 'MENU' }, { root: null });
  }
  const msg = typeof run.toast === 'string' ? run.toast : run.toast ? MSG_KEYS.map((k) => state[k]).find(Boolean) : null;
  if (msg) showToast(msg);
  focusAfterMenu(run, pid);
}

bindContextTrigger(app, {
  selector: '[data-pid]',
  noTouch: '[data-handle]', // na ekranie składu przytrzymanie uchwytu zaczyna przeciąganie
  open(el, at) {
    const view = menuView();
    if (!view) return false;
    const g = state.game;
    const pid = el.dataset.pid;
    const model = playerMenu(g, pid, { view, ui: state, why: el.dataset.why ?? null, lineup: { tactics: g.tactics, ...tCtx(g) } });
    if (!model?.items.length) return false;
    openMenu({ ...at, model, anchor: el, onSelect: (it) => runMenuItem(it, pid) });
    return true;
  },
});

app.addEventListener('change', async (ev) => {
  const input = ev.target.closest('input[data-act="import"]');
  if (!input || !input.files[0]) return;
  try {
    const data = store.parseImport(await input.files[0].text());
    migratePosCodes(data.game); // stary plik: kody pozycji SP -> BP już przy imporcie
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

// Kreator kariery: walidacja pól (po pierwszym opuszczeniu pola, błąd znika przy poprawianiu) i podgląd karty trenera.
const NC_FIELDS = { 'nc-first': 'first', 'nc-last': 'last', 'nc-age': 'age' };
const ncError = (k, v) => (k === 'age' ? ageError(v) : nameError(v, k));
app.addEventListener('input', (ev) => {
  const k = NC_FIELDS[ev.target.id];
  if (!k || !state.nc) return;
  state.nc[k] = ev.target.value;
  if (state.nc.errors[k]) { state.nc.errors[k] = ''; setFieldError(app, k, ''); }
  if (state.nc.msg !== undefined && !Object.values(state.nc.errors).some(Boolean)) { const m = app.querySelector('#nc-msg'); if (m) m.textContent = ''; }
  updateCoachPreview(app, state.nc);
});
app.addEventListener('focusout', (ev) => {
  const k = NC_FIELDS[ev.target.id];
  if (!k || !state.nc || state.screen !== 'career') return;
  state.nc[k] = ev.target.value;
  state.nc.errors[k] = ncError(k, ev.target.value);
  setFieldError(app, k, state.nc.errors[k]);
});
app.addEventListener('change', (ev) => {
  if (ev.target.id !== 'nc-nat' || !state.nc || !isNationality(ev.target.value)) return;
  state.nc.nat = ev.target.value;
  updateCoachPreview(app, state.nc);
});
app.addEventListener('keydown', (ev) => {
  // Enter w formularzu trenera = Dalej
  if (ev.key === 'Enter' && ev.target.matches('[data-nc-form] input')) { ev.preventDefault(); app.querySelector('[data-act="profileNext"]')?.click(); return; }
  // Zakładki lig: strzałki, Home, End
  const tab = ev.target.closest('[role="tab"][data-act="tier"]');
  if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) {
    ev.preventDefault();
    const tabs = [...app.querySelectorAll('[role="tab"][data-act="tier"]')];
    const i = tabs.indexOf(tab);
    const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[j].click();
    return;
  }
  // Menu główne: strzałki góra i dół między pozycjami
  const mi = ev.target.closest('.mi');
  if (mi && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
    ev.preventDefault();
    const all = [...app.querySelectorAll('.mi')];
    all[(all.indexOf(mi) + (ev.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length].focus();
  }
});
matchMedia(WIDE_PICK).addEventListener?.('change', () => {
  if (state.screen !== 'career' || state.nc?.step !== 2) return;
  const key = document.activeElement?.dataset?.club;
  render();
  if (key) app.querySelector(`[data-club="${key}"]`)?.focus({ preventScroll: true });
});

// Klawiatura na PC: Enter = Dalej / Zagraj mecz, Escape = menu główne (w kreatorze: krok wstecz).
document.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, select, textarea')) return;
  if (state.screen === 'matchday') return;
  if (ev.key === 'Escape' && state.screen === 'career') { ev.preventDefault(); app.querySelector('[data-act="ncBack"]')?.click(); return; }
  if (ev.key === 'Escape' && state.screen === 'start' && state.confirmDel) { app.querySelector('[data-act="deleteNo"]')?.click(); return; }
  if (ev.key === 'Escape' && state.screen === 'editor') { app.querySelector('[data-act="ed-back"]')?.click(); return; } // edytor: powrót do gry
  if (ev.key === 'Escape' && state.screen !== 'start') { state.running = false; state.screen = 'start'; render(); }
  if (ev.key === 'Enter' && state.screen === 'hub' && !state.running && !ev.target.closest('button')) document.querySelector('[data-act="go"]')?.click();
});

// Prośba o trwałe miejsce na zapis: przeglądarka nie usunie zapisów gry przy braku miejsca na dysku
if (navigator.storage?.persist) navigator.storage.persisted?.().then((p) => (p ? null : navigator.storage.persist())).catch(() => {});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // Gra otwarta długo w tle: przy powrocie sprawdź nową wersję (jedno zapytanie o sw.js, najwyżej co godzinę)
    let last = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 3600e3) { last = Date.now(); reg.update().catch(() => {}); }
    });
  }).catch(() => { /* gra działa także bez trybu offline */ });
  // Nowa wersja przejęła stronę: przeładowanie od razu na ekranie startowym, w trakcie gry dopiero po wyjściu do menu
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || state.updateReady) return;
    state.updateReady = true;
    if (state.screen === 'start') location.reload();
  });
}

applyTheme(state.theme);
Promise.resolve(render()).then(() => {
  document.body.dataset.ready = '1';
  maybePlayIntro(app, { onDone: () => { if (state.screen === 'start') app.querySelector('.mi')?.focus({ preventScroll: true }); } });
});
