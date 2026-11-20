import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceDay, continueUntilStop, primaryAction, finishMatch, processDay, registerDailySystem, unregisterDailySystem, addDays,
} from '../src/core/gameLoop.js';
import { createMessage, addMessages, unreadCount, markRead, resolveMessage, INBOX_CAP } from '../src/core/inbox.js';
import { provisionalFixtures, seasonGoal } from '../src/season/dailySystems.js';
import { clubById } from '../src/data/clubs_pl.js';

function newState(clubId) {
  const s = { clubId, date: '2026-07-01', inbox: [], fixtures: provisionalFixtures(clubId), summary: { date: '2026-07-01' } };
  processDay(s);
  return s;
}

test('Start gry: powitanie od zarządu z celem sezonu i plan od asystenta', () => {
  const s = newState('widzew');
  const subjects = s.inbox.map((m) => m.subject);
  assert.ok(subjects.some((x) => x.startsWith('Witamy w klubie Widzew')));
  assert.ok(s.inbox.find((m) => m.category === 'board').body.includes('Celem zarządu jest'));
  assert.equal(unreadCount(s.inbox), 2);
});

test('Cele zarządu zależą od siły kadry na tle ligi', () => {
  assert.equal(seasonGoal(clubById('legia')).text, 'walka o mistrzostwo Polski');
  assert.equal(seasonGoal(clubById('wisla-plock')).text, 'utrzymanie w Ekstraklasie');
  assert.equal(seasonGoal(clubById('lechia-gdansk')).text, 'awans do Ekstraklasy');
});

test('Dalej: dni mijają same, pętla zatrzymuje się w dniu meczu i przycisk zmienia się na Zagraj mecz', () => {
  const s = newState('widzew');
  assert.equal(primaryAction(s).kind, 'continue');
  let r;
  do { r = continueUntilStop(s); } while (r.reason !== 'match');
  assert.equal(s.date, '2026-07-24');
  const a = primaryAction(s);
  assert.equal(a.kind, 'play');
  assert.equal(a.label, 'Zagraj mecz');
  assert.throws(() => advanceDay(s), /rozegraj/);
});

test('Dalej zatrzymuje się 2 dni przed meczem, kolejne Dalej idzie do dnia meczu', () => {
  const s = newState('widzew');
  let r;
  do { r = continueUntilStop(s); } while (r.reason !== 'prematch' && r.reason !== 'match');
  assert.equal(r.reason, 'prematch');
  assert.equal(s.date, '2026-07-22');
  assert.equal(primaryAction(s).kind, 'continue');
  do { r = continueUntilStop(s); } while (r.reason !== 'match');
  assert.equal(s.date, '2026-07-24');
});

test('Po rozegraniu meczu można iść dalej', () => {
  const s = newState('widzew');
  while (continueUntilStop(s).reason !== 'match');
  finishMatch(s, primaryAction(s).match.id, [2, 1]);
  assert.equal(primaryAction(s).kind, 'continue');
  advanceDay(s);
  assert.equal(s.date, '2026-07-25');
});

test('Ważna wiadomość zatrzymuje upływ dni (np. 3 dni do końca okna transferowego)', () => {
  const s = newState('widzew');
  s.fixtures = []; // bez meczów, żeby sprawdzić tylko wiadomości
  const stops = [];
  for (let i = 0; i < 6; i++) {
    const r = continueUntilStop(s, { maxDays: 120 });
    stops.push([r.reason, s.date]);
  }
  assert.ok(stops.some(([, d]) => d === '2026-09-06'), JSON.stringify(stops));
  assert.ok(stops.every(([reason]) => reason === 'message' || reason === 'limit'));
});

test('Klub z pucharów: najpierw eliminacje, a liga dopiero w niedzielę', () => {
  const f = provisionalFixtures('rakow');
  assert.equal(f[0].comp, 'Liga Konferencji, Q2');
  assert.equal(f[0].date, '2026-07-23');
  assert.equal(f[1].date, '2026-07-26');
  const lech = provisionalFixtures('lech');
  assert.equal(lech[0].comp, 'Superpuchar Polski');
});

test('Decyzja w skrzynce blokuje Dalej, dopóki gracz nie odpowie', () => {
  const s = newState('widzew');
  const m = createMessage({ date: s.date, category: 'players', from: 'Michał Kurek', subject: 'Prośba o rozmowę', body: 'Chcę porozmawiać o kontrakcie.', priority: 'urgent', actions: [{ id: 'ok', label: 'Umów rozmowę' }, { id: 'no', label: 'Odmów' }] });
  s.inbox = addMessages(s.inbox, [m]).inbox;
  assert.equal(primaryAction(s).kind, 'decide');
  assert.equal(continueUntilStop(s).reason, 'decision');
  s.inbox = resolveMessage(s.inbox, m.id, 'ok');
  assert.equal(primaryAction(s).kind, 'continue');
});

test('Skrzynka: brak duplikatów po kluczu, oznaczanie jako przeczytane, limit pojemności', () => {
  let inbox = [];
  const a = createMessage({ date: '2026-07-01', category: 'media', from: 'Media', subject: 'A', body: 'x', key: 'k1' });
  const b = createMessage({ date: '2026-07-01', category: 'media', from: 'Media', subject: 'A', body: 'x', key: 'k1' });
  inbox = addMessages(inbox, [a]).inbox;
  const r = addMessages(inbox, [b]);
  assert.equal(r.added.length, 0);
  inbox = markRead(r.inbox, a.id);
  assert.equal(unreadCount(inbox), 0);
  const many = Array.from({ length: INBOX_CAP + 50 }, (_, i) => createMessage({ date: '2026-07-02', category: 'club', from: 'Klub', subject: `${i}`, body: '' }));
  assert.equal(addMessages(inbox, many).inbox.length, INBOX_CAP);
});

test('Nowy system dnia podłącza się bez zmian w pętli', () => {
  registerDailySystem({ id: 'test-urodziny', run: (st, date) => (date === '2026-07-03' ? { messages: [createMessage({ date, category: 'players', from: 'Kapitan', subject: 'Urodziny w szatni', body: 'Tort o 12:00.', priority: 'important' })] } : {}) });
  try {
    const s = newState('widzew');
    const r = continueUntilStop(s);
    assert.equal(r.reason, 'message');
    assert.equal(s.date, '2026-07-03');
  } finally {
    unregisterDailySystem('test-urodziny');
  }
});

test('Stan gry po upływie dni da się zapisać jako JSON', () => {
  const s = newState('lech');
  continueUntilStop(s, { maxDays: 30 });
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(copy, s);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
