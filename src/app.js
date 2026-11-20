// Powłoka aplikacji: ekran startowy, sloty zapisu, wybór klubu, główny ekran z pocztą
// i upływem dni („Dalej” albo „Zagraj mecz”).
import { CLUBS_PL, LEAGUE_NAMES, clubById, leagueLabel } from './data/clubs_pl.js';
import { compOfClub, compClubIds } from './season/leagueComps.js';
import { GAME_START, SEASON, POLISH_EUROPE_2026, DOMESTIC } from './config/calendar2026.js';
import { crestHtml } from './ui/crest.js';
import { esc, fmtDate, fmtDay, weekday, icon } from './ui/dom.js';
import { migratePosCodes } from './engine/positions.js'; // zapisy sprzed zmiany kodu SP -> BP
import { ensureReserves, reservesOf } from './career/reserves.js';
import * as store from './core/store.js';
import { hashString } from './core/rng.js';
import { CATEGORIES, unreadCount, markRead, markAllRead, resolveMessage, filterInbox, pendingDecisions, addMessages, pruneInbox, canDelete, createMessage } from './core/inbox.js';
import { processDay, primaryAction, continueUntilStop, finishMatch, forgetMessages, isUnemployed } from './core/gameLoop.js';
import { jobState, applyJob, withdrawApplication, resign } from './career/jobMarket.js'; // rynek pracy trenera (docs/kariera-trenera.md)
import { markUnlocksSeen, careerSummary } from './career/coachCareer.js'; // kariera trenera: odznaki, reputacja
import './season/dailySystems.js';
import { createSeason, compLabel, applyResult, fromEngineResult, squadFor, anyClub, LEAGUE_COMPS } from './season/season.js';
import { standings, zonesFor } from './season/standings.js';
import { renderCompetitions } from './ui/competitionsView.js';
import { fixturesPanelBody, renderFixtures } from './ui/fixturesView.js';
import { mountDashMasonry } from './ui/masonry.js';
import { rosterOf } from './career/staffMarket.js';
/** Czy klub ma asystenta trenera (przycisk „Poproś asystenta”); stary zapis bez danych sztabu: tak. */
const hasAssistant = (g) => !g.staff || rosterOf(g, g.clubId).some((p) => p.role === 'asystent');
import { readDaySpeed, saveDaySpeed, dayDelayMs } from './ui/daySpeed.js';
import { ensureHistory } from './season/history.js';
import { createMatch, runToEnd } from './engine/match/match.js';
import { Rng } from './core/rng.js';
import { coachOf, coachStyle, matchCoach, formRng, assistantProfile } from './career/coaches.js';
import { staffOf } from './training/staff.js';
import { addDays } from './core/gameLoop.js';
import { generateWorld, squadOf, academyOf } from './world/worldGen.js';
import { renderSquadList, renderPlayerProfile } from './ui/squadView.js';
import { renderTactics } from './ui/tacticsView.js';
import { renderReserves, rzHead, rzCard, handleReservesAction, isReservesAction, reservesStrip, rzChipFn, hasReserves } from './ui/reservesView.js'; // Kadra > Rezerwy
import { resolveMove, resolveTap, parseLoc, locKey, playerAt, sameLoc } from './ui/tacticsMoves.js';
import { mountTacticsDrag } from './ui/tacticsDrag.js';
import { mountArrowDraw } from './ui/tacticsArrows.js'; // strzałki ruchu: rysowanie przeciągnięciem (PC)
import { formationById } from './data/formations.js';
import { arrowsFor, arrowLabel } from './data/playerInstructions.js';
import { WIDE_CARD, cardPos, placeCard, bindCardDrag } from './ui/playerCard.js';
import { createTactics, changeFormation, setInstruction, refreshTactics, removeFromBench, checkTactics, AUTO_MODES, pruneArrows } from './engine/lineup.js';
import { COMPETITIONS } from './config/competitions.js';
import { mountMatchday } from './ui/matchdayView.js';
import { mountDrawAnimation } from './ui/europeView.js';
import { matchReportHtml } from './ui/matchReportView.js'; // raport meczu po kliknięciu wyniku (docs/raport-meczu.md)
import { ensureUefa, syncSuperCupEU } from './season/europe.js';
import { ensureNational, ensureIntl } from './season/nationalSystem.js';
import { applySeasonState } from './season/rollover.js';
import { ensureThirdLeague } from './season/thirdLeague.js';
import { ensureTraining, trainingMatchInput, teamCohesion } from './training/index.js';
import { cancelShortFriendlies } from './training/friendlies.js';
import { renderTraining, handleTrainingAction, isTrainingAction } from './ui/trainingView.js';
import { handleStaffAction, handleStaffField, isStaffAction, offerPreview } from './ui/staffView.js'; // Trening > Sztab
import { shirtNumbers, kitColors } from './career/shirts.js';
import { playerStatsHtml } from './ui/playerStatsView.js';
import { renderClubView, hasClubView } from './ui/clubView.js';
import { renderTransfers, handleTransferAction, isTransferAction, transferCardHtml } from './ui/transfersView.js';
import { startMission, cancelMission, hireScout, fireScout, watchCandidate, markCandidatesSeen } from './career/scoutOps.js'; // skauting zagraniczny (docs/skauting.md)
import { renderClubHub, handleClubAction, isClubAction } from './ui/klubView.js';
// Kariera i rynek pracy: okno odblokowania odznak i akcje job-* (docs: Klub > Kariera)
import { mountUnlocks } from './ui/careerView.js';
import { sysNavHtml, sysHeaderBtn, sysDialogHtml } from './ui/sysMenu.js';
import { renderEditor, handleEditorAction, isEditorAction, newEditorState, clubListHtml, playerListHtml, altState, freeListHtml, refListHtml } from './ui/editorView.js'; // edytor i datapack (docs/edytor.md)
import { canPromote, promoteYouth } from './career/academy.js'; // wychowankowie do pierwszego składu
import { checkClub, editClub } from './career/editor.js';
import { applyPack, restoreOriginals, clubNamesSnapshot, exportPack, packFileName, parsePack, importPack, importSummary } from './career/editor.js';
import { realNamesOn, NAMES_KEY, NAMES_GAME_KEY, gameUsesRealNames } from './data/clubNames.js';
import { EU } from './data/names.js';
const NC_RESTORE_KEY = 'ligapl27-nc-restore';
const LOAD_RESTORE_KEY = 'ligapl27-load-restore';
/**
 * Kariera ma nazwy klubów, z którymi ją rozpoczęto (stare kariery: prawdziwe). Gdy strona ma inne nazwy,
 * zapamiętuje nazwy kariery na czas karty i przeładowuje stronę, po czym wczytuje slot. Zwraca true przy przeładowaniu.
 */
function switchNamesFor(g, slot) {
  const real = gameUsesRealNames(g);
  if (real === realNamesOn()) return false;
  try {
    sessionStorage.setItem(NAMES_GAME_KEY, real ? 'real' : 'fictional');
    sessionStorage.setItem(LOAD_RESTORE_KEY, String(slot));
  } catch { return false; } // bez pamięci przeglądarki: kariera z nazwami strony
  location.reload();
  return true;
}
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
import { piPlayerHtml, piTableHtml, piRowsFromTactics, piWith, piWithout, piWithDir } from './ui/playerInstrView.js'; // instrukcje indywidualne (docs/instrukcje-indywidualne.md)
import { renderAssistantReport } from './ui/assistantReportView.js';
import { ensureAssistantReport } from './career/assistantReport.js';
import { ensureTeamReport, requestTeamReport } from './career/teamReport.js'; // raport ogólny o drużynie (docs/raport-druzyny.md)
import { renderTeamReport } from './ui/teamReportView.js';
import { ensureMatchReports, recordMatchReport } from './career/postMatchReport.js'; // analiza pomeczowa sztabu (docs/analiza-pomeczowa.md)
import { renderMatchAnalysis, matchReportMailFoot, analysesBadge } from './ui/postMatchView.js';
import { mailLinks } from './ui/mailLinks.js'; // odnośniki w wiadomościach do ekranów, których dotyczą
import { ensureWeeklyTodo, buildWeeklyTodo, noteTodoSeen, todoBadge, snoozeTodo, unhideTodo } from './career/weeklyTodo.js'; // lista „Do zrobienia w tym tygodniu” (docs/do-zrobienia.md)
import { todoPanelBody, renderTodo } from './ui/todoView.js';
import { ensureReferees, refStrictFor } from './career/referees.js'; // pula sędziów i obsada meczów (docs/sedziowie.md)
import { renderMenu, renderCareer, newCareerState, maybePlayIntro, readTheme, applyTheme, nextTheme, nameError, ageError, profileOf, randomCoach, updateCoachPreview, setFieldError, isNationality, managerName, AGE_MIN, AGE_MAX } from './ui/menuView.js';

const app = document.getElementById('app');
const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const state = { screen: 'start', slot: null, game: null, tab: 'pulpit', tier: 1, notice: null, mailCat: null, mailOpen: null, running: false, sqFilter: 'all', playerOpen: null, sqSub: 'players', tSel: null, matchNotes: [], cComp: null, cView: 'table', cRound: null, lastResult: null, uFilter: 'pl', uDraw: null, nc: null, confirmDel: null, theme: readTheme(), daySpeed: readDaySpeed(), menuFocus: null, fx: null };
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
  dlg.innerHTML = sysDialogHtml(kind, { theme: state.theme, speed: state.daySpeed, slot: state.slot, msg: sys.msg, busy: sys.busy });
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('h2')?.setAttribute('tabindex', '-1');
}
const closeSys = () => app.querySelector('#sysDlg')?.close();

// ---------- Raport meczu (src/ui/matchReportView.js): okno po kliknięciu wyniku ----------
let reportFrom = null; // przycisk wyniku: fokus wraca po zamknięciu okna
function openReport(el) {
  let dlg = app.querySelector('#mrDlg');
  if (!dlg) {
    app.insertAdjacentHTML('beforeend', '<dialog id="mrDlg" class="sysdlg mrdlg" aria-labelledby="mrTitle"></dialog>');
    dlg = app.querySelector('#mrDlg');
    dlg.addEventListener('close', () => { if (reportFrom?.isConnected) reportFrom.focus({ preventScroll: true }); reportFrom = null; });
    dlg.addEventListener('click', (ev) => { // dotknięcie tła poza oknem zamyka raport
      const r = dlg.getBoundingClientRect();
      if (ev.target === dlg && (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom)) dlg.close();
    });
  }
  reportFrom = el instanceof HTMLElement ? el : null;
  dlg.innerHTML = matchReportHtml(state.game, { fx: el.dataset.fx, s: el.dataset.s || null });
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  dlg.querySelector('#mrTitle')?.focus({ preventScroll: true });
}
// Nazwa pliku bez polskich znaków i spacji (z nimi przeglądarka odrzuca nazwę i zapisuje „download”)
const slug = (t) => String(t).replace(/[łŁ]/g, (c) => (c === 'ł' ? 'l' : 'L')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
const saveName = () => { const g = state.game; return `LigaPL27-slot${state.slot}-${slug(clubById(g.clubId)?.name ?? g.clubId)}-${g.date}.json`; };
async function sysAction(act, el) {
  if (act === 'sys-menu') return openSys('menu');
  if (act === 'sys-options') return openSys('options');
  if (act === 'sys-save') { sys.msg = null; return openSys('save'); }
  if (act === 'sys-close') return closeSys();
  if (act === 'sys-theme') { state.theme = el.dataset.t; applyTheme(state.theme); return openSys('options'); }
  if (act === 'sys-speed') { state.daySpeed = el.dataset.v; saveDaySpeed(state.daySpeed); return openSys('options'); }
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

// Nowa kariera: datapack na start (opcjonalnie). Plik sprawdzany od razu, nakładany w newGame po wylosowaniu świata.
app.addEventListener('change', async (ev) => {
  const input = ev.target.closest?.('input[data-act="nc-pack"]');
  if (!input || !input.files?.[0] || !state.nc) return;
  const nc = state.nc;
  try {
    const file = input.files[0];
    if (file.size > 40e6) throw new Error('Plik jest za duży jak na datapack.');
    const pack = parsePack(await file.text());
    nc.pack = { data: pack, fileName: file.name, clubs: Object.keys(pack.clubs).length, players: Object.keys(pack.players).length, seed: pack.seed };
    nc.packMsg = '';
    applyPack({ editor: { clubs: pack.clubs, packLoaded: true } }); // nazwy klubów z pliku widać już przy wyborze klubu
  } catch (err) {
    nc.packMsg = `Nie wczytano pliku: ${err.message}`;
  }
  input.value = '';
  render();
});

// Edytor: własny herb klubu z pliku obrazka, zmniejszony do 128 px (kwadrat, przezroczyste tło) i zapisany w datapacku
app.addEventListener('change', async (ev) => {
  const input = ev.target.closest?.('input[data-act="ed-crest"]');
  if (!input || !input.files?.[0] || !state.game || !state.ed) return;
  const ed = state.ed; const id = input.dataset.id;
  try {
    const file = input.files[0];
    if (file.size > 10e6) throw new Error('Obrazek jest za duży.');
    let img;
    try { img = await createImageBitmap(file); } catch { throw new Error('To nie jest obrazek PNG, JPG ani WEBP.'); }
    const S = 128; const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    const k = Math.min(S / img.width, S / img.height); const w = img.width * k; const h = img.height * k;
    const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
    let url = cv.toDataURL('image/webp', 0.9);
    if (!url.startsWith('data:image/webp')) url = cv.toDataURL('image/png'); // przeglądarka bez WEBP
    const r = checkClub({ crest: url });
    if (r.errors.crest) throw new Error(r.errors.crest);
    editClub(state.game, id, r.value);
    await save();
    ed.msg = 'Zapisano własny herb klubu. Trafi do pliku datapacku przy eksporcie.'; ed.errors = null;
  } catch (err) {
    ed.msg = `Nie wczytano herbu: ${err.message}`; ed.errors = {};
  }
  input.value = '';
  render();
});

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
  // Dopasowanie do pozycji dodatkowej: boisko w formularzu zawodnika pokazuje wpisaną wartość od razu
  if (ev.target.dataset?.alt) {
    const k = ev.target.dataset.alt; const n = Math.max(0, Math.min(90, Math.round(Number(ev.target.value) || 0)));
    for (const b of app.querySelectorAll(`.ed-pp[data-pos="${k}"]`)) {
      b.dataset.s = altState(n);
      let s = b.querySelector('small');
      if (!n) s?.remove(); else { if (!s) { s = document.createElement('small'); b.append(s); } s.textContent = `${n} %`; }
    }
    return;
  }
  const id = ev.target.id;
  if (id === 'ed-fq' || id === 'ed-rq') { // wolni zawodnicy do kadry klubu, sędziowie
    state.ed[id === 'ed-fq' ? 'fq' : 'rq'] = ev.target.value;
    const out = app.querySelector(id === 'ed-fq' ? '#ed-free' : '#ed-results');
    if (out) out.innerHTML = id === 'ed-fq' ? freeListHtml(state.game, state.ed) : refListHtml(state.game, state.ed);
    return;
  }
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

// Trening > Sztab: pola filtrów rynku i formularza oferty (data-st-field), Esc zamyka okno zwolnienia,
// strzałki przełączają zakładki drugiego poziomu
app.addEventListener('change', async (ev) => {
  const f = ev.target.closest?.('[data-st-field]');
  if (!f || !state.game) return;
  const r = handleStaffField(state.game, f.dataset.stField, f.type === 'checkbox' ? f.checked : f.value, state);
  Object.assign(state, r.ui ?? {});
  const box = r.preview ? app.querySelector('#st-preview') : null;
  if (box) { box.innerHTML = offerPreview(state.game, state); return; }
  render();
  if (r.focus) app.querySelector(r.focus)?.focus({ preventScroll: true });
});
app.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && state.trStaffAsk && app.querySelector('.st-ask')) {
    ev.preventDefault(); ev.stopPropagation(); // nie wychodzi do menu głównego
    dispatchAct({ dataset: { act: 'st-fire-no', id: state.trStaffAsk } });
    return;
  }
  const tab = ev.target.closest?.('.st-subs [role="tab"], .rz-tabs [role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
  ev.preventDefault();
  const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
  const i = tabs.indexOf(tab);
  const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[j].click();
});

// ---------- Zapis ----------
async function save() {
  const g = state.game;
  const p = g.manager?.profile;
  g.summary = { clubId: g.clubId, season: typeof g.season === 'string' ? g.season : (g.season?.seasonId ?? SEASON), date: g.date, ...(p ? { managerName: managerName(g) } : {}), names: g.clubNames };
  await store.saveSlot(state.slot, g);
}

/** Uzupełnia zapisy sprzed poczty i pętli dni (migracja w miejscu). */
function ensureGameShape(g) {
  g.clubNames = gameUsesRealNames(g) ? 'real' : 'fictional'; // nazwy klubów, z którymi kariera została rozpoczęta
  migratePosCodes(g); // kody pozycji: SP (boczny pomocnik) -> BP, przed wszystkim, co czyta pozycje
  applySeasonState(g); // kalendarz i ligi sezonu zapisanego w grze
  applyPack(g); // edytor: nazwy klubów i stadiony z datapacku gry (docs/edytor.md)
  if (!g.world) g.world = generateWorld(g.seed);
  for (const p of Object.values(g.world.players ?? {})) if (p?.nat) p.eu = EU.has(p.nat); // stare zapisy: 27 państw UE (Nov 18, 2026)
  ensureReserves(g); // rezerwy (src/career/reserves.js); stare zapisy: kartki 'league' do klasy ligi klubu zawodnika
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
  ensureMatchReports(g); // analizy pomeczowe (stare zapisy: puste archiwum, pierwsza analiza po najbliższym meczu)
  ensureWeeklyTodo(g); // lista „Do zrobienia” (stare zapisy: pusty stan odłożonych spraw)
  ensureReferees(g); // pula sędziów (stare zapisy: pula z ziarna gry, obsada od najbliższej kolejki)
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
  // Po wczytanej karierze z innymi nazwami klubów: nowa kariera z ustawieniem domyślnym (przeładowanie strony)
  try {
    if (sessionStorage.getItem(NAMES_GAME_KEY)) {
      sessionStorage.removeItem(NAMES_GAME_KEY);
      sessionStorage.setItem(NC_RESTORE_KEY, JSON.stringify(newCareerState(slot)));
      location.reload();
      return;
    }
  } catch { /* bez pamięci przeglądarki */ }
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

/** Kariera: po przerysowaniu fokus wraca na odznakę, filtr albo przycisk, którym sterował gracz. */
function careerFocus(act, ds) {
  const sel = { 'k-badge': `.kr-slot[data-id="${CSS.escape(ds.id ?? '')}"]`, 'k-bfilter': `.kr-fchip[data-f="${CSS.escape(ds.f ?? '')}"]`, 'k-resign-ask': '[data-act="job-resign"]', 'k-resign-no': '[data-act="k-resign-ask"]' }[act];
  if (sel) app.querySelector(sel)?.focus({ preventScroll: true });
}

/** Nowe odznaki trenera: okno z animacją po upływie dni i przy wejściu do gry (src/ui/careerView.js). */
function showCareerUnlocks() {
  if (state.screen !== 'hub' || !state.game || state.running) return;
  mountUnlocks(state.game, { onDone: ({ go, badgeId }) => dispatchAct({ dataset: { act: 'career-unlocks-seen', go: go ? '1' : '', id: badgeId } }) });
}

function renderHub() {
  const g = state.game;
  const club = clubById(g.clubId);
  const unread = unreadCount(g.inbox);
  const out = isUnemployed(g); // trener bez klubu: ostatni klub prowadzi AI (src/career/jobMarket.js)
  const urgent = state.tab !== 'pulpit' && !out ? todoBadge(g).n : 0; // pilne sprawy tygodnia (na Pulpicie widać panel)
  const nav = TABS.map((t) => `<button class="nav__btn" data-act="tab" data-tab="${t.id}" aria-current="${state.tab === t.id ? 'page' : 'false'}">${icon(t.id)}<span>${esc(t.label)}</span>${t.id === 'poczta' && unread ? `<span class="badge" aria-label="${unread} nieprzeczytanych">${unread > 99 ? '99+' : unread}</span>` : ''}${t.id === 'pulpit' && urgent ? `<span class="badge" aria-label="${urgent} ${urgent === 1 ? 'pilna sprawa' : 'pilne sprawy'} w tym tygodniu">${urgent > 9 ? '9+' : urgent}</span>` : ''}</button>`).join('');
  app.innerHTML = `
  <div class="hub">
    <header class="hub__head">
      ${crestHtml(club, { size: 36, clubsById })}
      <div class="hub__club">
        <span class="hub__name">${esc(out ? 'Bez klubu' : club.name)}</span>
        <span class="muted hub__sub"><span>${esc(out ? `Ostatnio: ${club.name}` : leagueLabel(club))}</span><span class="hub__mgr">${esc(managerName(g))}</span></span>
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
  mountDashMasonry(app); // Pulpit bez pustych pól pod krótszymi panelami (src/ui/masonry.js)
  trackHeadHeight();
  showCareerUnlocks();
}

/** Nagłówek stoi w miejscu (position: sticky): jego wysokość w --hub-top, pod nią przyklejają się menu i panele boczne. */
let headObserver = null;
function trackHeadHeight() {
  const head = app.querySelector('.hub__head');
  if (!head) return;
  const set = () => document.documentElement.style.setProperty('--hub-top', `${Math.round(head.getBoundingClientRect().height)}px`);
  set();
  headObserver?.disconnect();
  if (typeof ResizeObserver !== 'undefined') { headObserver = new ResizeObserver(set); headObserver.observe(head); }
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
  // Trener bez klubu: ekrany klubu (Kadra, Transfery, Trening, Klub poza Karierą) zamknięte, Pulpit z rynkiem pracy
  if (isUnemployed(g)) {
    if (tab === 'kadra' || tab === 'transfery' || tab === 'trening' || (tab === 'klub' && state.kTab !== 'kariera')) return unemployedNotice(g, tab);
    if (tab === 'pulpit' && !state.fx) return renderJoblessDashboard(g, club);
  }
  if (tab === 'pulpit' && state.todo) { const res = buildWeeklyTodo(g); noteTodoSeen(g, res); return renderTodo(res, state); }
  if (tab === 'pulpit') return state.fx ? renderFixtures(g, state.fx) : renderDashboard(g, club);
  if (tab === 'poczta') return renderMail(g);
  if (tab === 'trening') return renderTraining(g, state);
  if (tab !== 'transfery') state.tfCard = null; // karta w okienku tylko w Transferach
  if (tab === 'transfery') {
    if (state.ng) return renderNegotiation(g, state.ng);
    const cp = state.tfCard && g.world.players[state.tfCard];
    if (!cp) { state.tfCard = null; return renderTransfers(g, state); }
    queueMicrotask(mountTfCard); // po wstawieniu HTML: okno modalne na telefonie, pływające na PC
    return renderTransfers(g, state) + transferCardHtml(g, cp, { wide: matchMedia(WIDE_CARD).matches });
  }
  if (tab === 'klub') return renderClubHub(g, state);
  if (tab === 'rozgrywki') return renderCompetitions(g, { comp: state.cComp ?? compOfClub(club) ?? 'ekstraklasa', view: state.cView, round: state.cRound, filter: state.uFilter, draw: state.uDraw });
  if (tab === 'kadra') {
    if (state.ma) return renderMatchAnalysis(g, state.ma); // analiza meczu albo archiwum (Skład i taktyka, Analizy meczów)
    // Rezerwy: podzakładka tylko w klubie z grywalnymi rezerwami (po zmianie klubu powrót do „Zawodnicy”)
    const rzOn = hasReserves(g);
    if (state.sqSub === 'reserves' && !rzOn) state.sqSub = 'players';
    const rzChips = rzOn ? rzChipFn(g) : null;
    const sub = `<div class="subtabs${rzOn ? ' subtabs--5 subtabs--scroll' : ''}" role="tablist"><button role="tab" data-act="tsub" data-s="players" aria-selected="${state.sqSub === 'players'}">Zawodnicy</button><button role="tab" data-act="tsub" data-s="tactics" aria-selected="${state.sqSub === 'tactics'}">Skład i taktyka</button>${rzOn ? `<button role="tab" data-act="tsub" data-s="reserves" aria-selected="${state.sqSub === 'reserves'}">Rezerwy</button>` : ''}<button role="tab" data-act="tsub" data-s="talks" aria-selected="${state.sqSub === 'talks'}">Rozmowy</button><button role="tab" data-act="tsub" data-s="report" aria-selected="${state.sqSub === 'report'}">Raport ogólny</button></div>`;
    if (state.sqSub === 'reserves') {
      // Rezerwy: „Mecz” (delegowania i powołania) albo „Kadra rezerw” (pełna kadra z atrybutami, jak w Kadrze)
      const R = reservesOf(g, g.clubId);
      const rv = state.rzView === 'squad' ? 'squad' : 'match';
      if (rv === 'squad' && R.ok) {
        const rp = state.playerOpen && g.world.players[state.playerOpen];
        if (rp && rp.clubId === R.id) return renderPlayerProfile(rp, { leagueOvrs: leagueOvrs(g, anyClub(R.id)?.tier ?? club.tier), clubName: R.name, date: g.date, game: g });
        const rsq = squadOf(g.world, R.id);
        const rAvg = rsq.length ? (rsq.reduce((s, p) => s + p.age, 0) / rsq.length).toFixed(1) : '0';
        return sub + renderSquadList(rsq, { filter: state.sqFilter === 'academy' ? 'all' : state.sqFilter, leagueOvrs: leagueOvrs(g, anyClub(R.id)?.tier ?? club.tier), academy: [], view: state.sqView ?? 'overview', sort: state.sqSort, game: g, clubId: R.id, title: `Kadra rezerw: ${R.name}`, head: rzHead('squad', rsq.length, `${R.name}, ${rsq.length} zawodników, średni wiek ${rAvg}`), card: (inner) => rzCard('squad', inner) });
      }
      return sub + renderReserves(g, state);
    }
    if (state.sqSub === 'talks') return sub + renderTalks(g, state);
    if (state.sqSub === 'report') return sub + renderTeamReport(g, { msg: state.trepMsg ?? '', sel: state.trepSel ?? 0 });
    if (state.sqSub === 'tactics') {
      queueMicrotask(mountTacticsScreen); // po wstawieniu HTML: okno atrybutów i fokus
      const wide = matchMedia(WIDE_INFO).matches;
      if (g.tactics.playerInstr) { const sqm = new Map(mySquad(g).map((p) => [p.id, p])); g.tactics.playerInstr = pruneArrows(g.tactics.playerInstr, g.tactics, sqm); } // nieważne strzałki znikają
      return sub + renderTactics({ squad: mySquad(g), tactics: g.tactics, sel: state.tSel, benchSize: benchSizeFor(g), info: state.tInfo, msg: state.tMsg, numbers: shirtNumbers(g, g.clubId, squadOf(g.world, g.clubId)), kit: kitColors(clubById(g.clubId)), cards: tCardsFor(g, wide), wide, strengthOpen: tUi.strOpen, assistant: hasAssistant(g), rzChips, rzStrip: rzOn ? reservesStrip(g) : '', analyses: analysesBadge(g), arrows: state.tArrows });
    }
    const ovrs = leagueOvrs(g, club.tier);
    const p = state.playerOpen && g.world.players[state.playerOpen];
    if (p) {
      const inAcademy = !!g.world.clubs[g.clubId]?.academy?.includes(p.id);
      return renderPlayerProfile(p, { leagueOvrs: ovrs, clubName: club.name, date: g.date, game: g, promote: inAcademy ? canPromote(g, p.id) : null, promoteMsg: state.acMsg?.id === p.id ? state.acMsg.text : null, rzChips: rzChips ? rzChips(p) : '' });
    }
    return sub + renderSquadList(squadOf(g.world, g.clubId), { filter: state.sqFilter, leagueOvrs: ovrs, academy: academyOf(g.world, g.clubId), view: state.sqView ?? 'overview', sort: state.sqSort, game: g, rzChips });
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
  todo: '<rect x="5" y="4.5" width="14" height="16.5" rx="1.5"/><path d="M9.5 3h5v3h-5zM8.5 12.5l2.2 2.2 4.8-4.8"/>',
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
  return dashPanel('fix', 'fix', 'Terminarz', fixturesPanelBody(g, { morePast: 0 }),'<button class="dash-link" data-act="fixtures">Pokaż wszystko</button>');
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
  const absRow = (p) => {
    const [k, txt] = why(p);
    return `<li data-pid="${esc(p.id)}" data-why="${k}"><span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span><span class="dash-abs__name">${esc(p.name)}</span><span class="dash-abs__why" data-k="${k}">${esc(txt)}</span></li>`;
  };
  // Dłuższe listy: pierwsze wiersze widać od razu, reszta pod „Rozwiń” (details, bez stanu w grze)
  const foldList = (items, show, row, label) => `<ul class="dash-abs">${items.slice(0, show).map(row).join('')}</ul>${items.length > show
    ? `<details class="dash-fold"><summary><span class="dash-fold__open">Rozwiń: jeszcze ${items.length - show} ${label}</span><span class="dash-fold__close">Zwiń</span></summary><ul class="dash-abs">${items.slice(show).map(row).join('')}</ul></details>` : ''}`;
  const freshBand = fresh == null ? '' : fresh >= 80 ? 'good' : fresh >= 65 ? 'mid' : 'low';
  const ending = squadOf(g.world, g.clubId).filter((p) => !p.loan && p.contract?.until && daysBetween(g.date, p.contract.until) <= 365)
    .sort((a, b) => a.contract.until.localeCompare(b.contract.until) || b.ovr - a.ovr);
  const endRow = (p) => `<li data-pid="${esc(p.id)}" data-why="contract"><span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span><span class="dash-abs__name">${esc(p.name)}</span><span class="dash-abs__why" data-k="contract">${esc(fmtDate(p.contract.until))}</span></li>`;
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
    ${out.length ? foldList(out, 4, absRow, plural(out.length - 4, 'zawodnika', 'zawodników', 'zawodników')) : '<p class="dash-note dash-note--ok">Wszyscy zawodnicy są do dyspozycji.</p>'}
    ${limitHtml ? '' : `<p class="dash-note">Limit kadry: ${L.counted} z ${L.soft} (maksimum ${L.hard}), bez ${L.exempt.length} ${plural(L.exempt.length, 'wychowanka', 'wychowanków', 'wychowanków')} do 21 lat.</p>`}
    ${ending.length ? `<h4 class="dash-sub">Kontrakt kończy się w ciągu roku (${ending.length})</h4>${foldList(ending, 5, endRow, plural(ending.length - 5, 'zawodnika', 'zawodników', 'zawodników'))}` : ''}`;
  return dashPanel('squad', 'squad', 'Stan kadry', body, dashLink('kadra', 'Kadra'));
}

function dashMail(g) {
  const unread = unreadCount(g.inbox);
  const pend = pendingDecisions(g.inbox);
  const latest = g.inbox.slice(0, 12); // telefon 5, szeroki Pulpit (kolumna pod „Ten tydzień”) do 12
  const body = `${pend.length ? `<button class="dash-decide" data-act="mail" data-id="${esc(pend[0].id)}"><span class="dash-decide__card" aria-hidden="true"></span>${pend.length} ${plural(pend.length, 'wiadomość czeka', 'wiadomości czekają', 'wiadomości czeka')} na twoją decyzję</button>` : ''}
    <ul class="mail-list stripes dash-mail">${latest.map((m, k) => (k >= 5 ? mailRow(m, g.date).replace('<li>', '<li class="dash-more">') : mailRow(m, g.date))).join('') || '<li class="mail-empty">Brak wiadomości.</li>'}</ul>`;
  return dashPanel('mail', 'poczta', `Poczta${unread ? ` <span class="dash-p__count">${unread} ${plural(unread, 'nowa', 'nowe', 'nowych')}</span>` : ''}`, body, dashLink('poczta', 'Cała poczta'));
}

/** Ten tydzień: najważniejsze sprawy z listy „Do zrobienia” (pełny widok: src/ui/todoView.js). */
function dashTodo(g) {
  const res = buildWeeklyTodo(g);
  noteTodoSeen(g, res);
  const n = res.items.length;
  const title = `Ten tydzień${res.counts.pilne ? ` <span class="dash-p__count">${res.counts.pilne} ${plural(res.counts.pilne, 'pilna', 'pilne', 'pilnych')}</span>` : ''}`;
  return dashPanel('todo', 'todo', title, todoPanelBody(res), `<button class="dash-link" data-act="todo">${n ? `Wszystko (${n})` : 'Lista'}</button>`);
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
      <div class="dash-side">${dashTodo(g)}${dashMail(g)}</div>
      ${dashFixtures(g)}
      ${dashTable(g, club, table)}
      ${dashSquad(g)}
      ${dashBoard(g, table)}
      ${dashFinance(g)}
      ${dashWindow(g)}
    </div>
  </div>`;
}

// ---------- Trener bez klubu (src/career/jobMarket.js) ----------
const JOB_APP_STATE = { czeka: 'czeka na odpowiedź', rozmowa: 'zaproszenie na rozmowę', oferta: 'oferta w poczcie', odmowa: 'odmowa' };
/** Krótka informacja zamiast ekranu klubu, gdy trener nie ma pracy. */
function unemployedNotice(g, tab) {
  const label = TABS.find((t) => t.id === tab)?.label ?? '';
  const js = jobState(g);
  return `<h2>${esc(label)}</h2>
    <section class="panel">
      <p class="panel__lead">Nie prowadzisz teraz klubu.</p>
      <p class="muted">Ostatni klub: ${esc(js.lastClub?.name ?? 'brak')}. Bez pracy od ${esc(fmtDate(js.since ?? g.date))} (${js.days} dni). Wakaty: ${js.vacancies.length}.</p>
      <button class="btn btn--primary" data-act="tab" data-tab="klub" data-sub="kariera">Rynek pracy i kariera</button>
    </section>`;
}

/** Pulpit trenera bez klubu: rynek pracy, poczta, tabela ostatniej ligi. */
function renderJoblessDashboard(g, club) {
  const js = jobState(g);
  const sum = careerSummary(g);
  const waiting = pendingDecisions(g.inbox);
  const offers = g.inbox.filter((m) => m.refs?.kind === 'jobOffer' && !m.resolved);
  const apps = js.apps.filter((a) => a.state !== 'odmowa');
  const vac = js.vacancies.slice(0, 5);
  const body = `<ul class="dash-facts">
      <li><span>Bez pracy od ${esc(shortDate(js.since ?? g.date))}</span><b>${js.days} dni</b></li>
      <li><span>Reputacja</span><b>${Math.round(sum.rep.value)} (${esc(sum.rep.label)})</b></li>
      <li><span>Wakaty</span><b>${js.vacancies.length}</b></li>
      <li><span>Aplikacje</span><b>${apps.length ? esc(apps.map((a) => `${a.name}: ${JOB_APP_STATE[a.state] ?? a.state}`).join(', ')) : 'brak'}</b></li>
    </ul>
    ${offers.length ? `<p><button class="btn btn--primary btn--sm" data-act="mail" data-id="${esc(offers[0].id)}">${esc(/ofert/i.test(offers[0].subject ?? '') ? offers[0].subject : `Oferta pracy: ${offers[0].subject ?? ''}`)}</button></p>` : ''}
    ${vac.length ? `<ul class="plain">${vac.map((v) => `<li>${esc(v.name)} (${esc(v.league)}), ${v.cooldownUntil ? `karencja do ${esc(fmtDate(v.cooldownUntil))}` : `szansa: ${esc(v.chance)}`}${v.applied ? ', aplikacja wysłana' : ''}</li>`).join('')}</ul>` : '<p class="muted">Żaden klub nie szuka teraz trenera. Wakaty pojawiają się po zwolnieniach trenerów.</p>'}`;
  const tableOf = dashTables(g);
  return `<div class="dash">
    <h2 class="dash__title">Pulpit</h2>
    ${waiting.length ? `<div class="dash-decide" role="status"><span><b>Czeka decyzja:</b> ${esc(waiting[0].subject ?? '')}.</span><button class="btn btn--primary btn--sm" data-act="mail" data-id="${esc(waiting[0].id)}">Otwórz decyzję</button></div>` : ''}
    <div class="dash__grid">
      ${dashPanel('board', 'board', 'Rynek pracy', body, dashLink('klub', 'Kariera', 'kariera'))}
      <div class="dash-side">${dashMail(g)}</div>
      ${dashTable(g, club, tableOf(club))}
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
    ${m.refs?.kind === 'matchReport' ? matchReportMailFoot(g, m) : ''}
    ${(() => { const L = mailLinks(g, m); return L.length ? `<p class="mail-view__foot mail-links"><span class="mail-links__k">Przejdź do:</span>${L.map((l, i) => `<button class="btn btn--sm${i === 0 ? ' btn--primary' : ''}" data-act="mail-go" data-id="${esc(m.id)}" data-i="${i}">${esc(l.label)}</button>`).join('')}</p>` : ''; })()}
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

/**
 * Przejście z analizy meczu albo z wiadomości (dataset: to, id, mail). Tylko nawigacja: taktyka, trening (Tydzień),
 * rozmowa z zawodnikiem, rozmowy, karta zawodnika, pełny raport. Niczego nie zmienia w grze.
 */
function maGo(ds) {
  const g = state.game;
  const base = { mailOpen: null, playerOpen: null, repOpen: null, extPlayer: null, extClub: null, ma: null, ttDlg: null };
  const mine = ds.id && g.world.players[ds.id]?.clubId === g.clubId;
  if (ds.to === 'report') Object.assign(state, base, { tab: 'kadra', sqSub: 'tactics', ma: { id: ds.id, from: ds.mail ? 'mail' : 'tactics', mail: ds.mail ?? null } });
  else if (ds.to === 'training') Object.assign(state, base, { tab: 'trening', trTab: 'tydzien', trDay: null, trPlayer: null, trNotice: null });
  else if (ds.to === 'talk' && mine) Object.assign(state, base, { tab: 'kadra', sqSub: 'talks', ttDlg: { id: ds.id, step: 'topic' }, ttResult: null, ttMeeting: null });
  else if (ds.to === 'talks' || ds.to === 'talk') Object.assign(state, base, { tab: 'kadra', sqSub: 'talks', ttResult: null, ttMeeting: null });
  else if (ds.to === 'player' && mine) Object.assign(state, base, { tab: 'kadra', sqSub: 'players', playerOpen: ds.id });
  else Object.assign(state, base, { tab: 'kadra', sqSub: 'tactics', tSel: null, tMsg: '' });
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
  const cfgFor = (id, squad, tactics, ai) => ({ club: anyClub(id), squad, tactics, ai, coach: coachStyle(g, id), teamMorale: teamMorale(squad) }); // teamMorale: instrukcje indywidualne
  const mine = cfgFor(g.clubId, mySquad(g), g.tactics, false);
  const theirs = cfgFor(oppId, oppSquad, createTactics(oppSquad, { benchSize: bench, benchGk: COMPETITIONS[f.comp]?.benchGk ?? 1 }), true);
  // Trener rywala z atrybutami i asystent gracza (docs/trener-ai-atrybuty.md)
  const rank = f.comp === 'pp' ? (f.round === 'F' ? 3 : 1) : f.comp === 'super' ? 3 : f.comp === 'uefa' ? 2 : 0;
  if (f.comp !== 'friendly') theirs.coachQ = matchCoach(coachOf(g, oppId, oppClub), { rank, rng: formRng(g, f.id, oppId) });
  mine.assistantQ = matchCoach(assistantProfile(staffOf(g, g.clubId).asystent, clubById(g.clubId)?.tier), { rank, rng: formRng(g, f.id, g.clubId) });
  Object.assign(mine, trainingMatchInput(g, g.clubId, mine));
  Object.assign(theirs, trainingMatchInput(g, oppId, theirs));
  const M = createMatch({
    seed: `${g.seed}:${f.id}`,
    home: mySide === 0 ? mine : theirs,
    away: mySide === 0 ? theirs : mine,
    ctx: { neutral: !!f.neutral, var: f.comp === 'ekstraklasa' || f.comp === 'super' || f.round === 'SF' || f.round === 'F', rank: f.comp === 'pp' ? (f.round === 'F' ? 3 : 1) : f.comp === 'super' ? 2 : 0, refStrict: refStrictFor(g, f), date: f.date,
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
  const analysis = recordMatchReport(g, f, r); // analiza pomeczowa sztabu (sparing bez analizy)
  if (analysis) g.inbox = addMessages(g.inbox, [analysis]).inbox;
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
      await new Promise((res) => setTimeout(res, dayDelayMs(state.daySpeed, matchMedia('(prefers-reduced-motion: reduce)').matches))); // Opcje: tempo upływu dni
    }
    if (r.reason !== 'limit') { reason = r.reason; break; }
  }
  state.running = false;
  if (squadKey() !== squadBefore) afterSquadChange(g);
  // Po Dalej zawsze Pulpit (nowe wiadomości i decyzje widać w panelu Poczta i w pasku decyzji na Pulpicie)
  if (reason === 'message' || reason === 'decision' || reason === 'prematch') { state.tab = 'pulpit'; state.fx = null; state.todo = null; state.extPlayer = null; state.extClub = null; state.mailOpen = null; }
  await save();
  renderHub();
}


// ---------- Skład: przeciąganie, wybór dwoma dotknięciami, panel atrybutów ----------
const WIDE_INFO = WIDE_CARD; // od tej szerokości karta zawodnika to pływające okno, a siła składu się zwija
const STR_KEY = 'lp27.tac.strength';
function readStrOpen() { try { return localStorage.getItem(STR_KEY) !== '0'; } catch { return true; } }
function writeStrOpen(open) { try { localStorage.setItem(STR_KEY, open ? '1' : '0'); } catch { /* tryb prywatny: tylko na tę wizytę */ } }
// Położenie pływających kart i ich przeciąganie: src/ui/playerCard.js (wspólne z kartą w meczu)
const tUi = { focus: null, infoReturn: null, infoOpened: null, lastTap: null, ctx: null, strOpen: readStrOpen() };

/** Otwarte karty zawodników (PC: do dwóch, telefon: jedna) z ich statystykami. state.tInfo: id aktywnej karty. */
function tCardsFor(g, wide) {
  let cards = (state.tCards ?? []).filter((c) => g.world.players[c.id]);
  if (!wide && cards.length > 1) cards = [{ ...(cards.find((c) => c.id === state.tInfo) ?? cards.at(-1)), slot: 0 }];
  state.tCards = cards;
  if (!cards.some((c) => c.id === state.tInfo)) state.tInfo = cards.at(-1)?.id ?? null;
  return cards.map((c) => ({ ...c, extra: playerStatsHtml(g.world.players[c.id], g) }));
}

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
  const dlgs = [...app.querySelectorAll('dialog.tdet')];
  const opened = tUi.infoOpened;
  tUi.infoOpened = null;
  if (dlgs[0] && !matchMedia(WIDE_INFO).matches) {
    dlgs[0].close();
    dlgs[0].showModal(); // telefon i tablet: arkusz/okno modalne, fokus trafia do przycisku Zamknij
  } else {
    // PC: pływające okna niemodalne, położenie zapamiętane dla każdego z dwóch miejsc
    for (const d of dlgs) placeCard(d, cardPos(Number(d.dataset.card)) ?? null);
    const d = opened && dlgs.find((x) => x.dataset.id === opened);
    if (d) {
      d.classList.add('is-new');
      (d.querySelector('.tcard__name') ?? d.querySelector('.tdet__x'))?.focus({ preventScroll: true });
    } else if (tUi.focus) app.querySelector(tUi.focus)?.focus({ preventScroll: true });
  }
  tUi.focus = null;
  if (state.pi) showPi(); // okno instrukcji indywidualnych przetrwało ponowny render ekranu
}

// ---------- Instrukcje indywidualne (src/ui/playerInstrView.js): okno zawodnika i okno z tabelą ----------
// state.pi: { view: 'player'|'table', id, from: 'table'|null, f: filtr pozycji, k: instrukcja na telefonie }.
// Zmiana zapisuje grę od razu; znaczniki na ekranie składu odświeżają się po zamknięciu okna.
const PI_KEYS = ['act', 'id', 'k', 'v', 'f', 'd'];
const piAttr = (name, data) => `data-act="pi-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(String(v))}"`).join('')}`;
let piReturn = null; // fokus po zamknięciu okna (element ekranu składu)
/** Selektor elementu w oknie (ten sam przycisk albo lista wyboru po przebudowie treści). */
function piFocusKey(el) {
  const parts = PI_KEYS.filter((k) => el?.dataset?.[k] != null).map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`);
  return parts.length ? `${el.tagName.toLowerCase()}${parts.join('')}` : null;
}
function piHtml(g) {
  const pi = state.pi;
  const rows = piRowsFromTactics(mySquad(g), g.tactics);
  const map = g.tactics.playerInstr ?? {};
  const note = 'Zmiany zapisują się od razu i obowiązują od najbliższego meczu.';
  if (pi.view === 'player') {
    const row = rows.find((r) => r.id === pi.id);
    return row ? piPlayerHtml({ row, entry: map[row.id] ?? null, instructions: g.tactics.instructions, attr: piAttr, note }) : null;
  }
  return piTableHtml({ rows, map, instructions: g.tactics.instructions, filter: pi.f, pick: pi.k, attr: piAttr, note });
}
function showPi({ focus = null } = {}) {
  const g = state.game;
  if (!state.pi || !g) return;
  const html = piHtml(g);
  if (!html) { state.pi = null; return; }
  let dlg = app.querySelector('#piDlg');
  if (!dlg) {
    app.insertAdjacentHTML('beforeend', '<dialog id="piDlg" class="pidlg" aria-labelledby="piTitle"></dialog>');
    dlg = app.querySelector('#piDlg');
    dlg.addEventListener('close', () => {
      state.pi = null;
      const back = piReturn; piReturn = null;
      if (tacticsOpen()) renderTacticsAfter(back); else dlg.remove();
    });
    dlg.addEventListener('click', (ev) => { // dotknięcie tła poza oknem zamyka okno
      const r = dlg.getBoundingClientRect();
      if (ev.target === dlg && (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom)) dlg.close();
    });
  }
  const key = focus ?? (dlg.contains(document.activeElement) ? piFocusKey(document.activeElement) : null);
  const same = dlg.dataset.view === state.pi.view && dlg.dataset.id === String(state.pi.id ?? '');
  const scroll = same ? [...dlg.querySelectorAll('.pi__body, .pit-wrap, .pi-chips')].map((e) => [e.scrollTop, e.scrollLeft]) : [];
  dlg.dataset.view = state.pi.view; dlg.dataset.id = String(state.pi.id ?? '');
  dlg.className = `pidlg pidlg--${state.pi.view}`;
  dlg.innerHTML = html;
  [...dlg.querySelectorAll('.pi__body, .pit-wrap, .pi-chips')].forEach((e, i) => { if (scroll[i]) { e.scrollTop = scroll[i][0]; e.scrollLeft = scroll[i][1]; } });
  if (!dlg.open) dlg.showModal();
  const vis = key ? [...dlg.querySelectorAll(key)].find((e) => e.offsetParent !== null) : null;
  (vis ?? (same && key ? null : dlg.querySelector('#piTitle')))?.focus({ preventScroll: true });
}
const closePi = () => app.querySelector('#piDlg')?.close();
/** Akcje okna instrukcji indywidualnych (data-act pi-...). el: przycisk albo { dataset } (menu, lista wyboru). */
async function piAction(act, el) {
  const g = state.game;
  const d = el.dataset;
  const own = (id) => !!id && g.world.players[id]?.clubId === g.clubId;
  if (!state.pi && (act === 'pi-open' || act === 'pi-table')) piReturn = focusKeyOf(document.activeElement);
  if (act === 'pi-open' && own(d.id)) {
    state.pi = { f: 'all', k: 'pass', ...(state.pi ?? {}), view: 'player', id: d.id, from: state.pi?.view === 'table' ? 'table' : null };
    showPi({ focus: '#piTitle' });
  } else if (act === 'pi-table') {
    state.pi = { f: 'all', k: 'pass', ...(state.pi ?? {}), view: 'table', from: null };
    showPi({ focus: '#piTitle' });
  } else if (act === 'pi-set' && own(d.id)) {
    g.tactics = { ...g.tactics, playerInstr: piWith(g.tactics.playerInstr, d.id, d.k, Number(d.v)) };
    await save(); showPi();
  } else if (act === 'pi-dir' && own(d.id)) { // Ruch: kierunek strzałki (run i lat razem)
    g.tactics = { ...g.tactics, playerInstr: piWithDir(g.tactics.playerInstr, d.id, d.d) };
    await save(); showPi();
  } else if (act === 'pi-reset' && d.id) {
    g.tactics = { ...g.tactics, playerInstr: piWithout(g.tactics.playerInstr, d.id) };
    await save(); showPi({ focus: '#piTitle' });
  } else if (act === 'pi-reset-all') {
    g.tactics = { ...g.tactics, playerInstr: {} };
    await save(); showPi({ focus: '#piTitle' });
  } else if ((act === 'pi-filter' || act === 'pi-pick') && state.pi) {
    state.pi = { ...state.pi, [act === 'pi-filter' ? 'f' : 'k']: act === 'pi-filter' ? d.f : d.k };
    showPi();
  } else if (act === 'pi-done' && state.pi?.view === 'player' && state.pi.from === 'table') {
    const id = state.pi.id;
    state.pi = { ...state.pi, view: 'table', from: null };
    showPi({ focus: `button[data-act="pi-open"][data-id="${CSS.escape(id)}"]` });
  } else if (act === 'pi-done' || act === 'pi-close') closePi();
}

function openInfo(pid, el) {
  let cards = state.tCards ?? [];
  if (!cards.some((c) => c.id === pid)) {
    const fresh = { id: pid, pinned: false, t: Date.now() };
    const loose = cards.find((c) => !c.pinned);
    if (!matchMedia(WIDE_INFO).matches) cards = [{ ...fresh, slot: 0 }];
    // PC: nieprzypięta karta zmienia zawartość (położenie zostaje); obok przypiętej otwiera się druga; trzecia zastępuje starszą
    else if (loose) cards = cards.map((c) => (c === loose ? { ...fresh, slot: c.slot } : c));
    else if (cards.length < 2) cards = [...cards, { ...fresh, slot: [0, 1].find((s) => !cards.some((c) => c.slot === s)) }];
    else { const old = cards.reduce((a, b) => (a.t <= b.t ? a : b)); cards = cards.map((c) => (c === old ? { ...fresh, slot: c.slot } : c)); }
  }
  state.tCards = cards;
  state.tInfo = pid;
  tUi.infoReturn = focusKeyOf(el) ?? tUi.infoReturn;
  tUi.infoOpened = pid;
  renderTacticsAfter();
}

function closeInfo(pid = state.tInfo) {
  const back = tUi.infoReturn;
  state.tCards = (state.tCards ?? []).filter((c) => c.id !== pid);
  state.tInfo = state.tCards.reduce((a, b) => (!a || b.t > a.t ? b : a), null)?.id ?? null;
  if (!state.tCards.length) tUi.infoReturn = null;
  renderTacticsAfter(back);
}

/** Karta na PC: przeciąganie za pasek (mysz, pióro, dotyk) i przesuwanie strzałkami z uchwytu (src/ui/playerCard.js). */
bindCardDrag(app);

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

// ---------- Strzałki ruchu (docs/strzalki-ruchu.md): tryb na boisku składu, kompas, rysowanie na PC, klawiatura ----------
// state.tArrows: { on, pick: indeks miejsca z otwartym kompasem albo null }. Zapis: run i lat w g.tactics.playerInstr.
const arrowTok = (pid) => `[data-act="tarrow-pick"][data-pid="${CSS.escape(pid)}"]`;
function arrowPick(g, el) {
  const idx = Number(el.dataset.idx);
  const pid = g.tactics.xi[idx];
  const slotAt = formationById(g.tactics.formation).slots[idx]; const pos = slotAt?.pos;
  if (!pid) { state.tMsg = 'Puste miejsce: najpierw wstaw zawodnika (wyłącz strzałki, żeby zmieniać skład).'; renderTacticsAfter(); return; }
  if (!arrowsFor(pos, slotAt?.x).length) { state.tMsg = `${pos}: bez strzałek. Bramkarz i środkowi obrońcy trzymają swoją pozycję.`; renderTacticsAfter(); return; }
  const open = state.tArrows?.pick === idx;
  state.tArrows = { on: true, pick: open ? null : idx };
  state.tMsg = '';
  renderTacticsAfter(open ? arrowTok(pid) : '.acomp__b.is-on');
}
async function arrowSet(g, pid, dir) {
  if (!pid || g.world.players[pid]?.clubId !== g.clubId) return;
  const name = g.world.players[pid].name;
  g.tactics = { ...g.tactics, playerInstr: piWithDir(g.tactics.playerInstr, pid, dir) };
  state.tArrows = { on: !!state.tArrows?.on, pick: null }; // bez włączania trybu (strzałki rysuje prawy przycisk)
  state.tMsg = `${name}: ${dir ? `ruch ${arrowLabel(dir).toLowerCase()}` : 'bez ruchu, jak drużyna'}.`;
  await save();
  renderTacticsAfter(arrowTok(pid));
}
function arrowClose() {
  const i = state.tArrows?.pick;
  if (i == null) return;
  const pid = state.game?.tactics.xi[i];
  state.tArrows = { ...state.tArrows, pick: null };
  renderTacticsAfter(pid ? arrowTok(pid) : null);
}
mountArrowDraw(app, {
  onSet: (pid, dir) => arrowSet(state.game, pid, dir),
  onReject: (text) => { state.tMsg = text; renderTacticsAfter(); },
});
// Klawiatura: Enter na zawodniku otwiera kompas (przycisk), strzałki przechodzą między kierunkami, Delete usuwa, Escape zamyka
app.addEventListener('keydown', (ev) => {
  if (!tacticsOpen() || !state.tArrows?.on || ev.defaultPrevented) return;
  const comp = ev.target.closest('.acomp');
  const tok = ev.target.closest('[data-act="tarrow-pick"]');
  const del = ev.key === 'Delete' || ev.key === 'Backspace';
  if (comp && ev.key.startsWith('Arrow')) {
    ev.preventDefault();
    const btns = [...comp.querySelectorAll('.acomp__b')];
    const c = (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const [x0, y0] = c(ev.target.closest('.acomp__b') ?? btns[0]);
    const [vx, vy] = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[ev.key] ?? [0, 0];
    let best = null; let bd = Infinity;
    for (const b of btns) {
      const [x, y] = c(b); const dx = x - x0; const dy = y - y0;
      const along = dx * vx + dy * vy;
      if (along < 4) continue;
      const dist = along + 2 * Math.abs(dx * vy - dy * vx);
      if (dist < bd) { bd = dist; best = b; }
    }
    best?.focus();
    return;
  }
  if (comp && del) { ev.preventDefault(); comp.querySelector('.acomp__b--none')?.click(); return; }
  if (tok && del && tok.dataset.pid) { ev.preventDefault(); arrowSet(state.game, tok.dataset.pid, ''); return; }
  if (ev.key === 'Escape' && state.tArrows.pick != null) { ev.preventDefault(); ev.stopPropagation(); arrowClose(); }
});
// Dotknięcie boiska albo ekranu poza kompasem zamyka kompas
app.addEventListener('click', (ev) => {
  if (tacticsOpen() && state.tArrows?.pick != null && !ev.target.closest('[data-act], .acomp')) arrowClose();
});

// Escape w Rezerwach: zamyka dialog prośby i oddaje fokus na przycisk źródłowy.
app.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || !state.rzAsk || state.tab !== 'kadra' || state.sqSub !== 'reserves') return;
  ev.preventDefault(); ev.stopPropagation();
  dispatchAct({ dataset: { act: 'rz-ask-no' } });
});
// Escape na ekranie składu: najpierw zamyka panel atrybutów albo anuluje wybór (nie wychodzi do menu).
app.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || !tacticsOpen() || ev.target.closest('select, #piDlg')) return; // okno instrukcji zamyka przeglądarka
  const card = ev.target.closest('dialog.tcard'); // Escape z wnętrza karty zamyka właśnie tę kartę
  if (card) { ev.preventDefault(); ev.stopPropagation(); closeInfo(card.dataset.id); }
  else if (state.tInfo) { ev.preventDefault(); ev.stopPropagation(); closeInfo(); }
  else if (state.tSel) { ev.preventDefault(); ev.stopPropagation(); state.tSel = null; state.tMsg = ''; renderTacticsAfter(); }
});
// Zamknięcie okna modalnego przez przeglądarkę (Escape) i dotknięcie tła za arkuszem.
// Tylko ekran składu: karta w meczu (src/ui/matchdayView.js) zamyka się sama.
app.addEventListener('cancel', (ev) => {
  if (!tacticsOpen() || !ev.target.matches?.('dialog.tdet')) return;
  ev.preventDefault();
  closeInfo();
}, true);
app.addEventListener('click', (ev) => {
  if (tacticsOpen() && ev.target.matches?.('dialog.tdet') && ev.target.matches(':modal')) closeInfo();
});
matchMedia(WIDE_INFO).addEventListener?.('change', () => { if (tacticsOpen()) render(); });

app.addEventListener('input', (ev) => {
  if (state.ng && ev.target.closest('[data-ng-form]')) refreshNegotiationHints(app, state.ng);
});

app.addEventListener('change', async (ev) => {
  if (ev.target.matches?.('input[data-act="sys-theme"]')) { await sysAction('sys-theme', ev.target); return; } // Opcje: motyw
  if (ev.target.matches?.('input[data-act="sys-speed"]')) { await sysAction('sys-speed', ev.target); return; } // Opcje: tempo dni
  const ps = ev.target.closest('#piDlg select.pit-sel'); // tabela instrukcji indywidualnych
  if (ps) { await piAction(ps.dataset.k === 'run' ? 'pi-dir' : 'pi-set', { dataset: { id: ps.dataset.id, k: ps.dataset.k, v: ps.value, d: ps.value } }); return; }
  const sel = ev.target.closest('select[data-act="trole"]');
  if (!sel) return;
  await setRole(sel.dataset.role, sel.value);
});

// ---------- Akcje ----------
async function newGame(slot, clubId, profile = null) {
  applySeasonState({});
  restoreOriginals();
  // Datapack z Nowej kariery: świat z ziarna pliku (te same identyfikatory zawodników), potem zmiany z pliku
  const pack = state.nc?.pack?.data ?? null;
  const seed = Number.isFinite(pack?.seed) ? pack.seed : hashString(`${clubId}:${Date.now()}:${Math.random()}`);
  const game = {
    seed, clubId, date: GAME_START, season: SEASON, createdAt: new Date().toISOString(),
    clubNames: realNamesOn() ? 'real' : 'fictional', // kariera zawsze z nazwami, z którymi ją rozpoczęto
    inbox: [],
  };
  // Profil trenera: tylko w zapisie gry na tym urządzeniu (gra nie wysyła danych do sieci)
  if (profile) game.manager = { profile };
  game.season = createSeason(seed, { playerClub: clubId });
  game.fixtures = game.season.fixtures;
  game.world = generateWorld(seed);
  game.names = clubNamesSnapshot(); // nazwy klubów kariery (zapis i plik JSON), niezależne od przyszłych zmian nazw w grze
  game.tactics = createTactics(squadOf(game.world, clubId), { benchSize: benchSizeFor(game) });
  ensureTraining(game);
  ensureCareer(game);
  ensureReferees(game);
  if (pack) {
    const r = importPack(game, pack); // kluby (nazwy, stadion, finanse) i zawodnicy (dane, atrybuty) z pliku
    game.tactics = createTactics(squadOf(game.world, clubId), { benchSize: benchSizeFor(game) });
    afterSquadChange(game);
    game.inbox = addMessages(game.inbox, [createMessage({ date: game.date, key: 'datapack-start', category: 'club', from: 'Edytor', priority: 'info', subject: 'Gra z datapackiem', body: `Kariera rozpoczęta z datapackiem ${state.nc?.pack?.fileName ?? ''}. ${importSummary(r)}` })]).inbox;
  }
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

// ---------- Transfery: karta zawodnika w okienku po kliknięciu nazwiska (src/ui/transfersView.js, transferCardHtml) ----------
let tfCardReturn = null; // nazwisko, na które wraca fokus po zamknięciu karty
function openTfCard(pid, el) {
  state.tfCard = pid;
  tfCardReturn = el ? `[data-pcard="${CSS.escape(pid)}"]` : null;
  render();
}
function closeTfCard() {
  if (!state.tfCard) return;
  state.tfCard = null;
  const back = tfCardReturn; tfCardReturn = null;
  render();
  if (back) app.querySelector(back)?.focus?.({ preventScroll: true });
}
function mountTfCard() {
  const d = app.querySelector('dialog.tf-pcard');
  if (!d) return;
  if (!matchMedia(WIDE_CARD).matches) { d.close(); d.showModal(); } // telefon i tablet: okno modalne (arkusz od dołu)
  else placeCard(d, cardPos(0) ?? null); // PC: pływające okno, położenie jak karty w Skład i taktyka
  (d.querySelector('.tcard__name') ?? d.querySelector('.tdet__x'))?.focus({ preventScroll: true });
}
app.addEventListener('cancel', (ev) => { if (ev.target.matches?.('dialog.tf-pcard')) { ev.preventDefault(); closeTfCard(); } });
app.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && state.tfCard && state.tab === 'transfery') { ev.preventDefault(); ev.stopPropagation(); closeTfCard(); } });

app.addEventListener('click', (ev) => {
  // Nazwisko w Transferach działa jak link: otwiera kartę w okienku zamiast karty transferowej
  const link = state.game && ev.target.closest?.('[data-pcard]');
  if (link) { ev.preventDefault(); ev.stopPropagation(); openTfCard(link.dataset.pcard, link); return; }
  if (state.tfCard && ev.target.matches?.('dialog.tf-pcard') && ev.target.matches(':modal')) { closeTfCard(); return; } // dotknięcie tła
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  if (el.dataset.act === 'tfcardclose') { closeTfCard(); return; }
  if (state.tfCard && el.closest('dialog.tf-pcard')) state.tfCard = null; // skrót do oferty zamyka okienko
  return dispatchAct(el);
});

/**
 * Wykonuje akcję data-act. el: przycisk albo { dataset } z menu kontekstowego.
 * root: miejsce, z którego handlery czytają pola formularzy (null = tylko wartości z dataset).
 */
const SK_ACTS = new Set(['sk-start', 'sk-cancel', 'sk-hire', 'sk-fire', 'sk-watch', 'sk-seen']); // skauting (blok w dispatchAct)
async function dispatchAct(el, { root = app } = {}) {
  const act = el.dataset.act;
  if (act?.startsWith('sys-') && state.game) { await sysAction(act, el); return; } // Opcje, Zapis, Wyjście
  if (act === 'mreport' && state.game) { openReport(el); return; } // raport meczu (wynik w terminarzu)
  if (act === 'mreport-close') { app.querySelector('#mrDlg')?.close(); return; }
  if (act?.startsWith('pi-') && state.game && state.screen === 'hub') { await piAction(act, el); return; } // instrukcje indywidualne
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
    careerFocus(act, el.dataset); // Kariera: fokus wraca na klikniętą odznakę, filtr albo przycisk rezygnacji
    return;
  }
  // ----- Kariera i rynek pracy: akcje job-* i okno odblokowania (blok do scalenia z gałęzią logiki) -----
  if ((act === 'job-apply' || act === 'job-withdraw' || act === 'job-resign' || act === 'career-unlocks-seen') && state.game) {
    const g = state.game;
    if (act === 'job-apply') state.kMsg = applyJob(g, el.dataset.id)?.text ?? null;
    else if (act === 'job-withdraw') state.kMsg = withdrawApplication(g, el.dataset.id)?.text ?? null;
    else if (act === 'job-resign') { const r = resign(g); state.kMsg = r?.text ?? null; state.crResign = false; if (r?.ok) { state.tab = 'klub'; state.kTab = 'kariera'; state.ng = null; state.playerOpen = null; } }
    else { // career-unlocks-seen: odznaki obejrzane; go = przejście do Klub > Kariera
      markUnlocksSeen(g);
      if (el.dataset.go) { state.tab = 'klub'; state.kTab = 'kariera'; state.crSel = el.dataset.id || state.crSel; state.crFresh = el.dataset.id || null; state.crFilter = 'all'; }
    }
    await save();
    render();
    if (act === 'career-unlocks-seen' && el.dataset.go) window.scrollTo({ top: 0 });
    return;
  }
  // ----- Skauting: akcje sk-* (src/career/scoutOps.js, docs/skauting.md). Zlecenie z obiektu state.skOrder (UI),
  // wynik akcji w state.skMsg (tekst) i state.skOk (powodzenie); zapis gry i odświeżenie widoku -----
  if (SK_ACTS.has(act) && state.game) {
    const g = state.game; const ds = el.dataset;
    let r = null;
    if (act === 'sk-start') r = startMission(g, state.skOrder ?? {});
    else if (act === 'sk-cancel') r = cancelMission(g, ds.id);
    else if (act === 'sk-hire') r = hireScout(g, ds.id, 'permanent');
    else if (act === 'sk-fire') r = fireScout(g, ds.id);
    else if (act === 'sk-watch') r = watchCandidate(g, ds.id, ds.on === '1');
    else markCandidatesSeen(g); // sk-seen
    state.skMsg = r?.text ?? null; state.skOk = r ? !!r.ok : null;
    await save();
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
  if (isStaffAction(act) && state.game) {
    const r = handleStaffAction(state.game, act, el.dataset, state);
    Object.assign(state, { tab: 'trening', trTab: 'sztab' }, r.ui ?? {});
    if (r.save) await save();
    render();
    if (r.top) window.scrollTo({ top: 0 });
    if (r.focus) app.querySelector(r.focus)?.focus({ preventScroll: !r.top && act !== 'st-fire-ask' });
    return;
  }
  if (isReservesAction(act) && state.game) {
    const r = handleReservesAction(state.game, act, el.dataset, state);
    Object.assign(state, r.ui ?? {});
    if (r.squadChanged) afterSquadChange(state.game);
    if (r.save) await save();
    render();
    if (r.top) window.scrollTo({ top: 0 });
    if (r.focus) app.querySelector(r.focus)?.focus({ preventScroll: true });
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
    if (act === 'ncPackClear' && state.nc) { state.nc.pack = null; state.nc.packMsg = ''; restoreOriginals(); render(); }
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
    if (act === 'tab') { state.tab = el.dataset.tab; state.kMsg = null; state.crResign = false; state.ma = null; state.mailOpen = null; state.playerOpen = null; state.repOpen = null; state.fx = null; state.todo = null; state.extPlayer = null; state.extClub = null; if (el.dataset.sub) { if (state.tab === 'klub') state.kTab = el.dataset.sub; else state.tfTab = el.dataset.sub; } else if (state.tab === 'klub' && state.game && isUnemployed(state.game)) state.kTab = 'kariera'; render(); }
    // Terminarz i wyniki (Pulpit > Pokaż wszystko): sezon, rozgrywki, miejsce meczu
    if (act === 'fixtures') { state.tab = 'pulpit'; state.fx = { season: null, comp: 'all', venue: 'all' }; render(); window.scrollTo({ top: 0 }); app.querySelector('.fxs h2')?.setAttribute('tabindex', '-1'); app.querySelector('.fxs h2')?.focus({ preventScroll: true }); }
    if (act === 'fxback') { state.fx = null; render(); app.querySelector('[data-act="fixtures"]')?.focus(); }
    // Do zrobienia w tym tygodniu (Pulpit > Ten tydzień): pełny widok, przejście do ekranu sprawy, odkładanie
    if (act === 'todo') { state.tab = 'pulpit'; state.fx = null; state.todo = true; state.todoArea = null; state.todoMsg = null; render(); window.scrollTo({ top: 0 }); app.querySelector('#todo-h')?.focus({ preventScroll: true }); }
    if (act === 'todoback') { state.todo = null; state.todoMsg = null; render(); app.querySelector('[data-act="todo"]')?.focus(); }
    if (act === 'todo-area') { state.todoArea = el.dataset.a || null; state.todoMsg = null; render(); app.querySelector(`[data-act="todo-area"][data-a="${CSS.escape(el.dataset.a ?? '')}"]`)?.focus({ preventScroll: true }); }
    if (act === 'mail-go') { // odnośnik w wiadomości (src/ui/mailLinks.js)
      const l = mailLinks(g, g.inbox.find((x) => x.id === el.dataset.id))[Number(el.dataset.i)];
      if (l?.run?.steps?.length) { state.mailOpen = null; await runMenuItem(l, ''); window.scrollTo({ top: 0 }); }
    }
    if (act === 'todo-go') {
      const it = buildWeeklyTodo(g).items.find((x) => x.key === el.dataset.key);
      if (it?.act?.steps?.length) { state.todo = null; state.todoMsg = null; await runMenuItem({ run: it.act }, it.pid ?? ''); window.scrollTo({ top: 0 }); }
    }
    if (act === 'todo-snooze' || act === 'todo-unhide') {
      const r = act === 'todo-snooze' ? snoozeTodo(g, el.dataset.key, el.dataset.m) : unhideTodo(g, el.dataset.key);
      state.todoMsg = r.text;
      if (r.ok) await save();
      render(); app.querySelector('.todo [role="status"]')?.focus?.();
    }
    if (act === 'fxseason' || act === 'fxcomp' || act === 'fxvenue') {
      const key = { fxseason: ['season', 's'], fxcomp: ['comp', 'k'], fxvenue: ['venue', 'v'] }[act];
      state.fx = { ...(state.fx ?? {}), [key[0]]: el.dataset[key[1]], ...(act === 'fxseason' ? { comp: 'all', venue: 'all' } : act === 'fxcomp' ? { venue: 'all' } : {}) };
      render();
      app.querySelector(`[data-act="${act}"][data-${key[1]}="${CSS.escape(el.dataset[key[1]])}"]`)?.focus({ preventScroll: true });
    }
    if (act === 'go') {
      // Sparing w dniu meczu bez 11 zawodników z bramkarzem (powołania, kontuzje): odwołany, gra toczy się dalej
      const fr = primaryAction(g).match;
      if (fr?.comp === 'friendly') {
        const msgs = cancelShortFriendlies(g, g.date);
        if (msgs.length) { g.inbox = addMessages(g.inbox || [], msgs).inbox; await save(); render(); return; }
      }
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
      else if (a.kind === 'decide') { state.tab = 'pulpit'; state.fx = null; state.todo = null; state.extPlayer = null; state.extClub = null; render(); }
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
    if (act === 'rzview') { state.rzView = el.dataset.v === 'squad' ? 'squad' : 'match'; state.playerOpen = null; render(); }
    if (act === 'squadback') { state.playerOpen = null; render(); }
    if (act === 'arep') { state.repOpen = el.dataset.id; render(); window.scrollTo({ top: 0 }); }
    if (act === 'arepback') { state.repOpen = null; render(); }
    // Raport ogólny o drużynie: na prośbę trenera (co 14 dni) i otwarcie z poczty
    if (act === 'trep-req') { const r = requestTeamReport(g); state.trepMsg = r.ok ? 'Sztab przygotował nowy raport.' : r.msg; if (r.ok) state.trepSel = 0; if (r.ok) await save(); render(); }
    if (act === 'trep-sel') { state.trepSel = Number(el.dataset.i) || 0; state.trepMsg = ''; render(); }
    // Analizy meczów: archiwum, pełny raport i przejścia z raportu albo z poczty (tylko nawigacja)
    if (act === 'ma-list') { Object.assign(state, { tab: 'kadra', sqSub: 'tactics', ma: { list: true }, mailOpen: null, playerOpen: null, repOpen: null, extPlayer: null, extClub: null }); render(); window.scrollTo({ top: 0 }); }
    if (act === 'ma-open') { state.ma = { id: el.dataset.id, from: state.ma?.list ? 'list' : 'tactics' }; render(); window.scrollTo({ top: 0 }); }
    if (act === 'ma-back') {
      const b = state.ma;
      if (b?.from === 'mail' && b.mail && g.inbox.some((x) => x.id === b.mail)) { state.ma = null; state.tab = 'poczta'; state.mailOpen = b.mail; }
      else state.ma = b?.id && b.from === 'list' ? { list: true } : null;
      render(); window.scrollTo({ top: 0 });
    }
    if (act === 'ma-go') { maGo(el.dataset); render(); window.scrollTo({ top: 0 }); }
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
    if (act === 'tsub') { state.tArrows = null; state.ma = null; state.sqSub = el.dataset.s; state.rzAsk = null; state.rzMsg = null; state.trepMsg = ''; state.tSel = null; state.tInfo = null; state.tCards = []; state.tMsg = ''; state.playerOpen = null; state.ttResult = null; state.ttMeeting = null; render(); }
    if (act === 'tcancel') { state.tSel = null; state.tMsg = ''; renderTacticsAfter('[data-act="tauto"]'); }
    if (act === 'tform') { g.tactics = changeFormation(g.tactics, mySquad(g), el.dataset.f); state.tSel = null; state.tMsg = ''; await save(); renderTacticsAfter(); }
    if (act === 'tauto' && !hasAssistant(g)) { state.tMsg = 'W sztabie nie ma asystenta trenera. Zatrudnisz go w Trening, Sztab.'; renderTacticsAfter(); }
    else if (act === 'tauto') {
      const mode = AUTO_MODES[el.dataset.mode] ? el.dataset.mode : 'best';
      g.tactics = createTactics(mySquad(g), { formation: g.tactics.formation, benchSize: benchSizeFor(g), instructions: g.tactics.instructions, mode, playerInstr: g.tactics.playerInstr });
      state.tSel = null; state.tMsg = `Asystent ustawił skład: ${AUTO_MODES[mode].label.toLowerCase()}.`; await save(); renderTacticsAfter();
    }
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
    if (act === 'tarrows') { state.tArrows = { on: !state.tArrows?.on, pick: null }; state.tSel = null; state.tMsg = ''; renderTacticsAfter('[data-act="tarrows"]'); }
    if (act === 'tarrow-pick') arrowPick(g, el);
    if (act === 'tarrow-set') await arrowSet(g, el.dataset.id, el.dataset.d);
    if (act === 'tarrow-close') arrowClose();
    if (act === 'tmove') {
      const r = await applyMove(parseLoc(el.dataset.src), parseLoc(el.dataset.dst));
      if (!r.ok) { state.tMsg = r.reason || 'Ten ruch nic nie zmienia.'; renderTacticsAfter(); }
    }
    if (act === 'trole' && el.dataset.id) await setRole(el.dataset.role, el.dataset.id);
    if (act === 'tinfo') { if (state.tCards?.some((c) => c.id === el.dataset.id)) closeInfo(el.dataset.id); else openInfo(el.dataset.id, el); }
    if (act === 'tinfoclose') closeInfo(el.dataset.id || state.tInfo);
    if (act === 'tcardpin') { state.tCards = (state.tCards ?? []).map((c) => (c.id === el.dataset.id ? { ...c, pinned: !c.pinned } : c)); renderTacticsAfter(); }
    if (act === 'tstrength' && matchMedia(WIDE_INFO).matches) {
      // Siła składu zwijana tylko na PC, bez pełnego renderu; stan pamiętany w przeglądarce
      tUi.strOpen = !tUi.strOpen;
      writeStrOpen(tUi.strOpen);
      el.closest?.('.tac__strength')?.setAttribute('data-open', tUi.strOpen ? '1' : '0');
      el.setAttribute?.('aria-expanded', String(tUi.strOpen));
    }
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
      if (switchNamesFor(rec.game, slot)) return; // kariera z innymi nazwami klubów: przeładowanie i wczytanie
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
      state.extPlayer = null; state.extClub = null; state.repOpen = null; state.fx = null; state.todo = null;
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

const MSG_KEYS = ['tfMsg', 'trNotice', 'ttResult', 'tMsg', 'rzMsg'];

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
  if (ev.target.closest('#mrDlg')) return; // raport meczu: Escape zamyka tylko okno (przeglądarka), Enter nie gra meczu
  if (ev.target.closest('#piDlg')) return; // instrukcje indywidualne: jak wyżej
  if (ev.target.closest('#ulDlg')) return; // okno odblokowania odznaki: Escape zamyka tylko okno
  if (ev.key === 'Escape' && state.screen === 'career') { ev.preventDefault(); app.querySelector('[data-act="ncBack"]')?.click(); return; }
  // Wybór klubu w Nowej karierze: ukryty przełącznik prawdziwych nazw klubów (testy, src/data/clubNames.js); przeładowanie strony
  if (state.screen === 'career' && ev.ctrlKey && ev.altKey && !ev.shiftKey && ev.code === 'KeyP') {
    ev.preventDefault();
    try {
      if (realNamesOn()) localStorage.removeItem(NAMES_KEY); else localStorage.setItem(NAMES_KEY, 'real');
      if (state.nc) sessionStorage.setItem(NC_RESTORE_KEY, JSON.stringify({ ...state.nc, pack: null }));
    } catch { /* bez pamięci przeglądarki: tylko przeładowanie */ }
    location.reload();
    return;
  }
  // Pulpit kariery: ukryty przełącznik nazw klubów tej kariery (prawdziwe albo nowe), zapamiętany w zapisie; przeładowanie strony
  if (state.screen === 'hub' && state.game && !state.running && ev.ctrlKey && ev.altKey && !ev.shiftKey && ev.code === 'KeyP') {
    ev.preventDefault();
    const g = state.game;
    g.clubNames = gameUsesRealNames(g) ? 'fictional' : 'real';
    delete g.names; // nazwy klubów zapisane w karierze: nowe po przeładowaniu (applySavedNames)
    save().then(() => { if (!switchNamesFor(g, state.slot)) render(); }).catch(() => {});
    return;
  }
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

// Menu „Poproś asystenta” (details, menu position: fixed): nad przyciskiem, a gdy brak miejsca, pod nim;
// zamyka się przy przewijaniu, zmianie rozmiaru okna i kliknięciu obok
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!d?.classList?.contains('tac__auto') || !d.open) return;
  const menu = d.querySelector('.tac__auto-menu'); const btn = d.querySelector('summary');
  if (!menu || !btn) return;
  const r = btn.getBoundingClientRect(); const h = menu.offsetHeight; const w = menu.offsetWidth;
  menu.style.left = `${Math.max(16, Math.min(window.innerWidth - w - 16, r.left + r.width / 2 - w / 2))}px`;
  menu.style.top = `${r.top - h - 6 >= 8 ? r.top - h - 6 : Math.min(r.bottom + 6, window.innerHeight - h - 8)}px`;
  autoMenuTop = r.top;
}, true);
let autoMenuTop = 0;
const closeAutoMenu = (e) => { for (const d of document.querySelectorAll('.tac__auto[open]')) if (!e || !d.contains(e.target)) d.open = false; };
// Przewinięcie zamyka menu dopiero, gdy przycisk przesunie się o ponad 24 px (drobne ruchy na telefonie nie zamykają)
window.addEventListener('scroll', () => {
  const d = document.querySelector('.tac__auto[open]');
  const s = d?.querySelector('summary');
  if (s && Math.abs(s.getBoundingClientRect().top - autoMenuTop) > 24) d.open = false;
}, true);
window.addEventListener('resize', () => closeAutoMenu());
document.addEventListener('pointerdown', (e) => closeAutoMenu(e), true);

// Po przełączeniu nazw klubów (Ctrl+Alt+P) wracamy do wyboru klubu w Nowej karierze
try {
  const nc = sessionStorage.getItem(NC_RESTORE_KEY);
  if (nc) { sessionStorage.removeItem(NC_RESTORE_KEY); state.nc = JSON.parse(nc); state.slot = state.nc.slot ?? state.slot; state.screen = 'career'; }
} catch { /* bez pamięci przeglądarki */ }
// Po przełączeniu nazw klubów dla wczytywanej kariery (switchNamesFor): wczytanie tego slotu
let loadAfterReload = null;
try {
  const s = sessionStorage.getItem(LOAD_RESTORE_KEY);
  if (s) { sessionStorage.removeItem(LOAD_RESTORE_KEY); loadAfterReload = s; }
} catch { /* bez pamięci przeglądarki */ }

applyTheme(state.theme);
Promise.resolve(render()).then(() => {
  document.body.dataset.ready = '1';
  if (loadAfterReload) { dispatchAct({ dataset: { act: 'load', slot: loadAfterReload } }); return; }
  maybePlayIntro(app, { onDone: () => { if (state.screen === 'start') app.querySelector('.mi')?.focus({ preventScroll: true }); } });
});
