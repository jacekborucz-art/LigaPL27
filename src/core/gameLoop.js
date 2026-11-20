// Upływ czasu w grze: dzień po dniu. Każdy dzień uruchamia zarejestrowane systemy
// (kalendarz, okna transferowe, później: zawodnicy, kontuzje, zarząd, finanse, media).
// Systemy zwracają wiadomości do skrzynki i zdarzenia dnia. Pętla zatrzymuje się na
// meczu klubu gracza i na ważnych wiadomościach; zwykłe dni mijają same.
// Nowy system = registerDailySystem(), bez zmian w pętli (docs/PLAN.md 4.1).

import { addMessages, PRIORITY, pendingDecisions, pruneInbox } from './inbox.js';
import { mailRelevant } from './mailFilter.js'; // tylko liga gracza, z innych lig bardzo ważne wydarzenia

const systems = [];

/** system: { id, order?, run(state, date) -> { messages?: [], events?: [], patch?: (state) => void } } */
export function registerDailySystem(system) {
  const i = systems.findIndex((s) => s.id === system.id);
  if (i >= 0) systems[i] = system; else systems.push(system);
  systems.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}

export function unregisterDailySystem(id) {
  const i = systems.findIndex((s) => s.id === id);
  if (i >= 0) systems.splice(i, 1);
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Trener bez klubu (zwolniony albo po rezygnacji, src/career/jobMarket.js): game.clubId to ostatni klub, prowadzi go AI. */
export const isUnemployed = (state) => state?.manager?.job?.status === 'unemployed';
/** Klub prowadzony przez gracza: null, gdy trener jest bez pracy. */
export const userClubId = (state) => (isUnemployed(state) ? null : state?.clubId ?? null);

/** Mecz klubu gracza w danym dniu (z terminarza w stanie gry). Trener bez klubu nie ma meczów. */
export function clubMatchOn(state, date) {
  if (isUnemployed(state)) return null;
  return (state.fixtures || []).find((f) => f.date === date && !f.played
    && (f.home === state.clubId || f.away === state.clubId)) || null;
}

/** Główny przycisk: w dniu meczu „Zagraj mecz”, w pozostałe dni „Dalej”. */
export function primaryAction(state) {
  const match = clubMatchOn(state, state.date);
  if (match) return { kind: 'play', label: 'Zagraj mecz', match };
  const decisions = pendingDecisions(state.inbox || []);
  if (decisions.length) return { kind: 'decide', label: 'Odpowiedz na wiadomości', count: decisions.length };
  return { kind: 'continue', label: 'Dalej' };
}

/** Uruchamia systemy dla bieżącego dnia (bez zmiany daty). Wywoływane po przejściu na nowy dzień. */
export function processDay(state, date = state.date) {
  const messages = [];
  const events = [];
  const prof = globalThis.__systemTimes; // pomiar czasu systemów (narzędzia wydajności), domyślnie wyłączony
  // Trener bez klubu: na czas systemów dnia game.clubId = null, więc ostatni klub gracza prowadzi AI jak każdy inny
  // (mecze, skład, transfery, trening, trener). Widoki dalej widzą ostatni klub (docs/kariera-trenera.md).
  const lastClub = isUnemployed(state) ? state.clubId : undefined;
  if (lastClub !== undefined) state.clubId = null;
  try {
    for (const s of systems) {
      const t0 = prof ? performance.now() : 0;
      const out = s.run(state, date) || {};
      if (prof) prof[s.id] = (prof[s.id] ?? 0) + performance.now() - t0;
      if (out.messages) messages.push(...out.messages);
      if (out.events) events.push(...out.events);
      if (out.patch) out.patch(state);
    }
  } finally {
    if (lastClub !== undefined && state.clubId == null) state.clubId = lastClub;
  }
  // Wiadomości usunięte przez gracza (i przez porządki) nie wracają, nawet gdy system wyśle je ponownie
  const gone = new Set(state.inboxGone ?? []);
  const { inbox, added } = addMessages(state.inbox || [], messages.filter((m) => (!m.key || !gone.has(m.key)) && mailRelevant(state, m)));
  state.inbox = inbox;
  if (new Date(`${date}T12:00:00Z`).getUTCDay() === 1) forgetMessages(state, pruneInbox(state.inbox, date, 'auto'));
  state.processedDate = date;
  return { date, added, events };
}

/** Przejście o jeden dzień. Nie pozwala ominąć nierozegranego meczu klubu gracza. */
export function advanceDay(state) {
  if (clubMatchOn(state, state.date)) throw new Error('Najpierw rozegraj dzisiejszy mecz.');
  state.date = addDays(state.date, 1);
  const day = processDay(state);
  if (state.summary) state.summary.date = state.date;
  return day;
}

/**
 * „Dalej”: przewija dni do pierwszego przystanku.
 * Przystanek: mecz klubu gracza, 2 dni przed meczem (czas na skład, trening i odprawę), wiadomość ważna lub pilna,
 * decyzja do podjęcia, limit dni.
 * onDay(day) pozwala UI pokazać datę i wydarzenia każdego mijanego dnia.
 */
export const PRE_MATCH_STOP_DAYS = 2;

export function continueUntilStop(state, { maxDays = 60, onDay } = {}) {
  const days = [];
  if (pendingDecisions(state.inbox || []).length) return { reason: 'decision', days };
  for (let i = 0; i < maxDays; i++) {
    if (clubMatchOn(state, state.date)) return { reason: 'match', days };
    const day = advanceDay(state);
    days.push(day);
    onDay?.(day);
    if (clubMatchOn(state, state.date)) return { reason: 'match', days };
    if (clubMatchOn(state, addDays(state.date, PRE_MATCH_STOP_DAYS))) return { reason: 'prematch', days };
    if (day.added.some((m) => PRIORITY[m.priority] >= PRIORITY.important)) return { reason: 'message', days };
  }
  return { reason: 'limit', days };
}

/** Oznacza mecz jako rozegrany (wynik zapisuje moduł meczu). */
export function finishMatch(state, matchId, result = null) {
  state.fixtures = (state.fixtures || []).map((f) => (f.id === matchId ? { ...f, played: true, result } : f));
}

/** Zapisuje wynik porządków: nowa skrzynka i klucze usuniętych wiadomości (ostatnie 600). */
export function forgetMessages(state, { inbox, removed }) {
  state.inbox = inbox;
  if (removed.length) state.inboxGone = [...(state.inboxGone ?? []), ...removed].slice(-600);
}
