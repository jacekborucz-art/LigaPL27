// Lista „Do zrobienia w tym tygodniu” (src/career/weeklyTodo.js, docs/do-zrobienia.md): kierownik drużyny w sztabie
// każdego klubu (także w starych zapisach), fakty zawsze na liście, słabszy sztab częściej zapomina, ale nigdy nie
// zgłasza spraw, których nie ma, lista stała w tygodniu (pon-niedz), odkładanie, brak zmian w grze przy liczeniu,
// zawodnik bez kontraktu i bez klubu nie psuje widoku.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { ensureTraining } from '../src/training/index.js';
import { generateStaffFor } from '../src/training/staff.js';
import { STAFF_ROLES } from '../src/training/config.js';
import { createMessage } from '../src/core/inbox.js';
import '../src/season/dailySystems.js';
import {
  TODO, ensureWeeklyTodo, collectTodo, staffLens, buildWeeklyTodo, noteTodoSeen, snoozeTodo, unhideTodo, snoozeModes, detectChance,
} from '../src/career/weeklyTodo.js';
import { renderTodo, todoPanelBody } from '../src/ui/todoView.js';

const CLUB = 'widzew';
const BAD_TEXT = new RegExp(`undefined|NaN|\\bnull\\b|\\[object|${String.fromCharCode(8212)}`); // pauza em
function newGame(seed = 21, clubId = CLUB) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId));
  ensureTraining(g);
  ensureCareer(g);
  processDay(g);
  ensureWeeklyTodo(g);
  return g;
}
let shared = null;
const base = () => (shared ??= newGame());
const fresh = () => { const g = structuredClone(base()); ensureTraining(g); return g; };
const setAll = (g, q) => { for (const r of Object.keys(g.training.staff[g.clubId])) g.training.staff[g.clubId][r].q = q; };
const decision = (date, o = {}) => createMessage({ date, category: 'board', from: 'Zarząd', subject: 'Decyzja zarządu', body: 'Treść', actions: [{ id: 'a', label: 'Tak' }, { id: 'b', label: 'Nie' }], ...o });

test('kierownik drużyny: rola sztabu w każdym klubie (1-20), także w starym zapisie, wartość z ziarna gry', () => {
  assert.ok(STAFF_ROLES.kierownik?.name === 'Kierownik drużyny');
  const g = base();
  for (const id of Object.keys(g.world.clubs)) {
    const k = g.training.staff[id].kierownik;
    assert.ok(k && k.q >= 1 && k.q <= 20 && k.name, id);
  }
  // Stary zapis: sztab bez kierownika dostaje go przy wczytaniu, pozostałe role bez zmian
  const old = structuredClone(g);
  for (const st of Object.values(old.training.staff)) delete st.kierownik;
  const before = JSON.stringify(Object.fromEntries(Object.entries(old.training.staff).map(([k, v]) => [k, v])));
  ensureTraining(old);
  for (const id of Object.keys(old.world.clubs)) {
    assert.deepEqual(old.training.staff[id].kierownik, generateStaffFor(old, id).kierownik, id);
    // Odchylenia atrybutów (d) i jakość do pokazania (qs, skala 1-12) wracają przy przeliczeniu sztabu; jakość roli w grze
    // (skala efektów) to jakość z ziarna z dokładnością do zaokrąglenia przeliczenia na skalę 1-12 (docs/sztab-atrybuty.md)
    const { d: _d, qs: _qs, q, ...synced } = g.training.staff[id].kierownik;
    const { q: q0, ...gen } = old.training.staff[id].kierownik;
    assert.deepEqual(gen, synced, id);
    assert.ok(Math.abs(q - Math.min(17, q0)) <= 0.75, `${id} ${q} ${q0}`);
  }
  const after = JSON.parse(JSON.stringify(old.training.staff));
  for (const st of Object.values(after)) delete st.kierownik;
  assert.equal(JSON.stringify(after), before);
  ensureTraining(old);
  assert.deepEqual(old.training.staff, JSON.parse(JSON.stringify(old.training.staff)));
});

test('decyzja z poczty jest zawsze pilna na liście, także przy najsłabszym sztabie', () => {
  const g = fresh();
  setAll(g, 1);
  for (let i = 0; i < 6; i++) {
    g.date = addDays('2026-07-06', i * 7);
    const m = decision(g.date, { key: `test-decyzja:${i}` });
    g.inbox = [m, ...g.inbox];
    const r = buildWeeklyTodo(g);
    const it = r.items.find((x) => x.key === `decyzja:${m.id}`);
    assert.ok(it && it.hard && it.prio === 'pilne' && it.due === g.date, g.date);
    m.resolved = true;
    assert.ok(!buildWeeklyTodo(g).items.some((x) => x.key === `decyzja:${m.id}`), 'po decyzji sprawa znika');
  }
});

test('oferta z terminem: jutro pilna, za 5 dni ważna, po terminie albo po odpowiedzi znika', () => {
  const g = fresh();
  const p = squadOf(g.world, CLUB)[3];
  const o = { id: 'test-oferta', kind: 'incoming', playerId: p.id, status: 'open', fee: 1e6, date: g.date, expires: addDays(g.date, 1) };
  g.market.offers.unshift(o);
  const m = createMessage({ date: g.date, category: 'transfers', from: 'Dyrektor sportowy', subject: 'Oferta', body: 'x', actions: [{ id: 'accept', label: 'Przyjmij' }], refs: { kind: 'incomingOffer', offerId: o.id }, optional: true });
  g.inbox = [m, ...g.inbox];
  const find = () => buildWeeklyTodo(g).items.find((x) => x.key === 'oferta:test-oferta');
  assert.equal(find()?.prio, 'pilne');
  o.expires = addDays(g.date, 5);
  assert.equal(find()?.prio, 'wazne');
  assert.ok(find().hard);
  o.expires = addDays(g.date, -1);
  assert.equal(find(), undefined);
  o.expires = addDays(g.date, 5); o.status = 'rejected';
  assert.equal(find(), undefined);
});

test('okno transferowe: ostatnie 3 dni to fakt (2 dni: pilne), 8 dni przed końcem brak sprawy', () => {
  const g = fresh();
  setAll(g, 1);
  const end = '2026-09-09';
  const at = (d) => { g.date = d; return buildWeeklyTodo(g).items.find((x) => x.key === `okno:${end}`); };
  assert.equal(at(addDays(end, -8)), undefined);
  const three = at(addDays(end, -3));
  assert.ok(three && three.hard && three.prio === 'wazne');
  assert.equal(at(addDays(end, -2))?.prio, 'pilne');
  assert.equal(at(end)?.prio, 'pilne');
  // 4-7 dni: wczesne przypomnienie kierownika drużyny (obserwacja), nigdy pilne
  for (let d = 4; d <= 7; d++) {
    const c = collectTodo(g, addDays(end, -d)).find((x) => x.key === `okno:${end}`);
    assert.ok(c && !c.hard && c.role === 'kierownik' && c.prio !== 'pilne');
  }
});

// Kandydaci syntetyczni do statystyki soczewki (jeden na rolę, żeby limit pozycji nie przeszkadzał)
const cand = (key, q, o = {}) => ({ key, type: 'talk', hard: false, role: 'asystent', qe: q, sev: false, prio: 'wazne', since: '2026-11-16', due: null, area: 'talk', title: 't', ...o });

test('soczewka sztabu: słabszy sztab częściej zapomina, nigdy nie dodaje spraw ani nie robi z obserwacji pilnej', () => {
  const rate = {};
  for (const q of [5, 10, 15, 20]) {
    let missed = 0; const N = 2000;
    for (let s = 0; s < N; s++) {
      const g = { seed: s, clubId: CLUB, date: '2026-11-16', training: { staff: { [CLUB]: { asystent: { q } } } } };
      const out = staffLens(g, [cand('rozmowa:x', q)], '2026-11-22'); // niedziela: sprawa od poniedziałku (opóźnienie też liczy się jako brak)
      if (!out.length) missed++;
      for (const it of out) { assert.equal(it.key, 'rozmowa:x'); assert.notEqual(it.prio, 'pilne'); }
    }
    rate[q] = missed / N;
  }
  assert.ok(rate[5] > rate[10] && rate[10] > rate[15] && rate[15] > rate[20], JSON.stringify(rate));
  assert.ok(rate[5] > 0.4 && rate[5] < 0.75, JSON.stringify(rate));
  assert.ok(rate[20] < 0.06, JSON.stringify(rate));
  assert.ok(Math.abs(detectChance(5) - 0.55) < 1e-9 && Math.abs(detectChance(20) - 0.97) < 1e-9);
  // Sprawa wisząca 3 tygodnie przy jakości 5: przeoczenie najwyżej (1 - 0,55) x 0,5^3
  let missedOld = 0;
  for (let s = 0; s < 2000; s++) {
    const g = { seed: s, clubId: CLUB, date: '2026-11-16', training: { staff: { [CLUB]: { asystent: { q: 5 } } } } };
    if (!staffLens(g, [cand('rozmowa:y', 5, { since: '2026-10-26' })], '2026-11-16').length) missedOld++;
  }
  assert.ok(missedOld / 2000 < 0.09, `${missedOld}`);
});

test('fakty przechodzą przez soczewkę bez zmian przy każdej jakości i ziarnie', () => {
  for (let s = 0; s < 300; s++) {
    const g = { seed: s, clubId: CLUB, date: '2026-11-16', training: { staff: { [CLUB]: { asystent: { q: 1 }, kierownik: { q: 1 } } } } };
    const hard = [{ key: 'decyzja:a', hard: true, prio: 'pilne', due: '2026-11-16', role: null, title: 'a' }, { key: 'okno:b', hard: true, prio: 'wazne', due: '2026-11-19', role: null, title: 'b' }];
    const out = staffLens(g, hard, '2026-11-16');
    assert.deepEqual(out.map((x) => [x.key, x.prio]), [['decyzja:a', 'pilne'], ['okno:b', 'wazne']]);
  }
});

test('na prawdziwej grze lista to zawsze podzbiór spraw prawdziwych, przy każdej jakości sztabu', () => {
  const g = fresh();
  for (const d of ['2026-07-20', '2026-08-03', '2026-08-28']) {
    g.date = d;
    for (const q of [1, 5, 10, 15, 20]) {
      setAll(g, q);
      const keys = new Set(collectTodo(g, d).map((c) => c.key));
      const r = buildWeeklyTodo(g);
      for (const it of [...r.items, ...r.hidden]) assert.ok(keys.has(it.key), `${d} q${q} ${it.key}`);
      for (const it of r.items) if (!it.hard) assert.notEqual(it.prio, 'pilne');
    }
  }
});

test('tydzień pon-niedz, lista stała w tygodniu, ta sama po wczytaniu kopii zapisu, nowa od poniedziałku', () => {
  const g = fresh();
  g.date = '2026-11-22'; // niedziela
  const r = buildWeeklyTodo(g);
  assert.equal(r.week, '2026-11-16'); assert.equal(r.sunday, '2026-11-22');
  assert.strictEqual(buildWeeklyTodo(g), r, 'pamięć podręczna: ten sam obiekt bez zmian stanu');
  const copy = JSON.parse(JSON.stringify(g));
  const r2 = buildWeeklyTodo(copy);
  assert.deepEqual(r2.items.map((x) => [x.key, x.prio, x.due]), r.items.map((x) => [x.key, x.prio, x.due]));
  g.date = '2026-11-23';
  assert.equal(buildWeeklyTodo(g).week, '2026-11-23');
  g.date = '2026-11-18';
  const html = renderTodo(buildWeeklyTodo(g), {});
  assert.equal((html.match(/class="todo-week__day/g) ?? []).length, 7);
  assert.ok(html.indexOf('>pon<') < html.indexOf('>niedz<'));
  assert.match(html, /todo-week__day is-today/);
});

test('sprawa pokazana w tym tygodniu zostaje na liście, a po załatwieniu trafia do „Załatwione”', () => {
  const g = fresh();
  g.date = '2026-07-08';
  const m = decision(g.date, { key: 'test-zalatwione', optional: true });
  g.inbox = [m, ...g.inbox];
  const r = buildWeeklyTodo(g);
  noteTodoSeen(g, r);
  assert.ok(r.items.some((x) => x.key === `decyzja:${m.id}`));
  m.resolved = true;
  const r2 = buildWeeklyTodo(g);
  assert.ok(!r2.items.some((x) => x.key === `decyzja:${m.id}`));
  assert.ok(r2.done.some((x) => x.key === `decyzja:${m.id}`));
  for (const it of r.items) if (it.key !== `decyzja:${m.id}`) assert.ok(r2.items.some((x) => x.key === it.key), it.key);
});

test('odkładanie: jutro, poniedziałek, „nie przypominaj” tylko dla obserwacji, pilnych nie, faktów najwyżej do 3 dni przed terminem', () => {
  const g = fresh();
  setAll(g, 20);
  g.date = '2026-07-08';
  const r = buildWeeklyTodo(g);
  const ob = r.items.find((x) => !x.hard && x.prio !== 'pilne');
  assert.ok(ob, 'jest obserwacja do odłożenia');
  assert.ok(snoozeTodo(g, ob.key, 'day').ok);
  assert.ok(!buildWeeklyTodo(g).items.some((x) => x.key === ob.key));
  assert.ok(buildWeeklyTodo(g).hidden.some((x) => x.key === ob.key));
  g.date = '2026-07-09'; ensureWeeklyTodo(g);
  assert.ok(!buildWeeklyTodo(g).hidden.some((x) => x.key === ob.key), 'wraca następnego dnia');
  assert.ok(snoozeTodo(g, ob.key, 'case').ok);
  assert.ok(buildWeeklyTodo(g).hidden.some((x) => x.key === ob.key));
  assert.ok(unhideTodo(g, ob.key).ok);
  assert.ok(!buildWeeklyTodo(g).hidden.some((x) => x.key === ob.key));
  // Pilna decyzja: bez odkładania
  const m = decision(g.date, { key: 'test-pilna' });
  g.inbox = [m, ...g.inbox];
  assert.equal(snoozeTodo(g, `decyzja:${m.id}`, 'day').ok, false);
  m.resolved = true;
  // Fakt z terminem za 6 dni: „poniedziałek” najwyżej do 3 dni przed terminem, „nie przypominaj” niedostępne
  const o = { id: 'test-odloz', kind: 'incoming', playerId: squadOf(g.world, CLUB)[2].id, status: 'open', date: g.date, expires: addDays(g.date, 6) };
  g.market.offers.unshift(o);
  g.inbox = [createMessage({ date: g.date, category: 'transfers', from: 'Dyrektor sportowy', subject: 'Oferta', body: 'x', actions: [{ id: 'accept', label: 'Przyjmij' }], refs: { kind: 'incomingOffer', offerId: o.id }, optional: true }), ...g.inbox];
  const f = buildWeeklyTodo(g).items.find((x) => x.key === 'oferta:test-odloz');
  assert.deepEqual(snoozeModes(f, g.date), ['day', 'week']);
  assert.equal(snoozeTodo(g, f.key, 'case').ok, false);
  assert.ok(snoozeTodo(g, f.key, 'week').ok);
  assert.equal(g.todo.hide[f.key].until, addDays(o.expires, -TODO.hardFrom));
  o.expires = addDays(g.date, 3);
  delete g.todo.hide[f.key]; g.todo.rev++;
  assert.deepEqual(snoozeModes(buildWeeklyTodo(g).items.find((x) => x.key === f.key), g.date), []);
});

test('stan listy w zapisie: stary zapis bez todo i zmiana klubu dają pusty stan; liczenie listy nie zmienia gry', () => {
  const g = fresh();
  delete g.todo;
  const S = ensureWeeklyTodo(g);
  assert.deepEqual(Object.keys(S.hide), []);
  S.hide.x = { mode: 'case', since: null, t: 'x' };
  g.clubId = 'legia';
  assert.deepEqual(Object.keys(ensureWeeklyTodo(g).hide), []);
  g.clubId = CLUB; ensureWeeklyTodo(g);
  g.date = '2026-08-12';
  buildWeeklyTodo(g); // pierwsze liczenie (leniwe stany innych modułów)
  const before = JSON.stringify(g);
  g.todo.rev++; buildWeeklyTodo(g);
  g.todo.rev--;
  assert.equal(JSON.stringify(g), before);
});

test('zawodnik bez kontraktu i bez klubu nie psuje listy; teksty bez pauz, pustych wartości i wielkich liter', () => {
  const g = fresh();
  g.date = '2026-08-20';
  const sq = squadOf(g.world, CLUB);
  sq[0].contract = null;
  sq[1].clubId = null;
  sq[2].training = null;
  sq[3].moveWish = { stage: 'oficjalna', since: '2026-07-10', club: CLUB };
  g.inbox = [decision(g.date, { key: 'test-tekst' }), ...g.inbox];
  const r = buildWeeklyTodo(g);
  const html = renderTodo(r, { todoMsg: 'ok' }) + todoPanelBody(r) + renderTodo(r, { todoArea: 'talk' });
  assert.ok(!BAD_TEXT.test(html), html.match(BAD_TEXT)?.[0]);
  const text = html.replace(/<[^>]+>/g, ' ');
  assert.ok(!/\b[A-ZĄĆĘŁŃÓŚŹŻ]{4,}\b/.test(text.replace(/ACWR/g, '')), text.match(/\b[A-ZĄĆĘŁŃÓŚŹŻ]{4,}\b/)?.[0]);
  for (const it of r.items) assert.ok(it.title && it.act?.steps?.length, it.key);
});

test('wydajność: 100 przeliczeń listy na pełnej kadrze poniżej 1 s', () => {
  const g = fresh();
  g.date = '2026-08-20';
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) { g.todo.rev++; buildWeeklyTodo(g); }
  assert.ok(performance.now() - t0 < 1000, `${Math.round(performance.now() - t0)} ms`);
});
