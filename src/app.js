// Szkielet aplikacji (etap 0): ekran startowy, sloty zapisu, wybór klubu, główny ekran z nawigacją.
import { CLUBS_PL, LEAGUE_NAMES, clubById } from './data/clubs_pl.js';
import { GAME_START, SEASON, DOMESTIC, POLISH_EUROPE_2026 } from './config/calendar2026.js';
import { crestHtml } from './ui/crest.js';
import { esc, fmtDate, weekday, icon } from './ui/dom.js';
import * as store from './core/store.js';
import { hashString } from './core/rng.js';

const app = document.getElementById('app');
const clubsById = new Map(CLUBS_PL.map((c) => [c.id, c]));
const state = { screen: 'start', slot: null, game: null, tab: 'mecz', tier: 1, notice: null };

const TABS = [
  { id: 'kadra', label: 'Kadra' },
  { id: 'rozgrywki', label: 'Rozgrywki' },
  { id: 'mecz', label: 'Następny mecz' },
  { id: 'transfery', label: 'Transfery' },
  { id: 'trening', label: 'Trening' },
];

function render() {
  if (state.screen === 'start') return renderStart();
  if (state.screen === 'pick') return renderPick();
  return renderHub();
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
function renderHub() {
  const g = state.game;
  const club = clubById(g.clubId);
  const nav = TABS.map((t) => `<button class="nav__btn" data-act="tab" data-tab="${t.id}" aria-current="${state.tab === t.id ? 'page' : 'false'}">${icon(t.id)}<span>${esc(t.label)}</span></button>`).join('');
  app.innerHTML = `
  <div class="hub">
    <header class="hub__head">
      ${crestHtml(club, { size: 36, clubsById })}
      <div class="hub__club">
        <span class="hub__name">${esc(club.name)}</span>
        <span class="muted">${esc(LEAGUE_NAMES[club.tier])}</span>
      </div>
      <div class="led hub__date" aria-label="Data w grze: ${esc(fmtDate(g.date))}">${esc(fmtDate(g.date))}</div>
    </header>
    <nav class="nav" aria-label="Menu gry">${nav}</nav>
    <main class="hub__main">${renderTab(state.tab, g, club)}</main>
  </div>`;
}

function renderTab(tab, g, club) {
  if (tab === 'mecz') {
    const first = firstFixture(club);
    return `<h2>Następny mecz</h2>
      <section class="panel">
        <p class="panel__lead">${esc(first.title)}</p>
        <p class="muted">${esc(weekday(first.date))}, ${esc(fmtDate(first.date))}</p>
        <p>${esc(first.note)}</p>
      </section>
      <button class="btn btn--quiet" data-act="menu">Menu główne</button>`;
  }
  const soon = {
    kadra: ['Kadra 22-26 zawodników z 27 atrybutami', 'Skład na mecz i ławka', '10 formacji i instrukcje'],
    rozgrywki: ['Tabele 3 lig i terminarze', 'Puchar Polski, LM, LE, LK, reprezentacje', 'Strzelcy, kartkowicze, kontuzjowani, forma'],
    transfery: ['Lista zawodników i wolni agenci', 'Oferty, negocjacje pensji, wypożyczenia', 'Okna transferowe'],
    trening: ['Plan tygodnia: 5 akcentów, 3 intensywności', 'Rozwój młodych', 'Zmęczenie i świeżość'],
  }[tab];
  const label = TABS.find((t) => t.id === tab).label;
  return `<h2>${esc(label)}</h2>
    <section class="panel">
      <p class="panel__lead">Ten ekran powstaje w kolejnych etapach.</p>
      <ul class="plain">${soon.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    </section>`;
}

function firstFixture(club) {
  const europe = POLISH_EUROPE_2026.find((e) => e.club === club.id);
  if (club.id === 'lech' || club.id === 'gornik-zabrze') {
    const rival = club.id === 'lech' ? 'Górnik Zabrze' : 'Lech Poznań';
    return { title: `Superpuchar Polski: ${club.name} vs ${rival}`, date: DOMESTIC.superpuchar.date, note: 'Termin Superpucharu jest założeniem do potwierdzenia.' };
  }
  if (europe) {
    return { title: `${europe.comp}, ${europe.entry}: rywal z losowania`, date: europe.entry === 'Q2' ? '2026-07-22' : '2026-08-06', note: 'Losowanie i terminarz pucharów powstaną w etapie 8.' };
  }
  return { title: `${LEAGUE_NAMES[club.tier]}, 1. kolejka`, date: '2026-07-24', note: 'Pełny terminarz ligi powstanie w etapie 7.' };
}

// ---------- Akcje ----------
async function newGame(slot, clubId) {
  const seed = hashString(`${clubId}:${Date.now()}:${Math.random()}`);
  const game = {
    seed,
    clubId,
    date: GAME_START,
    season: SEASON,
    createdAt: new Date().toISOString(),
    summary: { clubId, season: SEASON, date: GAME_START },
  };
  await store.saveSlot(slot, game);
  state.game = game;
  state.slot = slot;
  state.screen = 'hub';
  state.tab = 'mecz';
  render();
}

app.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const act = el.dataset.act;
  const slot = Number(el.dataset.slot);
  try {
    if (act === 'new') { state.slot = slot; state.screen = 'pick'; render(); }
    if (act === 'back' || act === 'menu') { state.screen = 'start'; render(); }
    if (act === 'tier') { state.tier = Number(el.dataset.tier); render(); }
    if (act === 'pick') await newGame(state.slot, el.dataset.club);
    if (act === 'tab') { state.tab = el.dataset.tab; render(); }
    if (act === 'load') {
      const rec = await store.loadSlot(slot);
      if (!rec) throw new Error('Ten slot jest pusty.');
      state.game = rec.game; state.slot = slot; state.screen = 'hub'; render();
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

// Klawiatura na PC: Escape wraca do menu głównego.
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && state.screen !== 'start') { state.screen = 'start'; render(); }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* gra działa także bez trybu offline */ });
}

Promise.resolve(render()).then(() => { document.body.dataset.ready = '1'; });
