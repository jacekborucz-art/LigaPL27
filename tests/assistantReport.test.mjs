// Raport asystenta (src/career/assistantReport.js, docs/raport-asystenta.md): dokładność ocen rośnie z jakością
// asystenta, raport jest stały w okresie, zalecenia nie przeczą sobie, częstotliwość raportu o drużynie działa,
// wiadomości się nie dublują, stary zapis działa, widok nie ma pustych wartości ani pauz, kluby AI bez zmian.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf, academyOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays, clubMatchOn } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { ensureTraining } from '../src/training/index.js';
import { reportPrecision } from '../src/training/staff.js';
import { createMessage } from '../src/core/inbox.js';
import '../src/season/dailySystems.js';
import {
  AREP, REPORT_FREQS, ASSISTANT_SYSTEM, ensureAssistantReport, setReportFreq, reportPeriod, nextReportDate, familiarity,
  estimate, estimateSd, precisionOf, playerReport, squadReport, loadStance,
} from '../src/career/assistantReport.js';
import { renderAssistantReport } from '../src/ui/assistantReportView.js';
import { renderTraining, handleTrainingAction } from '../src/ui/trainingView.js';
import { playerMenu, flattenMenu, MENU_VIEWS } from '../src/ui/playerMenus.js';

const CLUB = 'widzew';
function newGame(seed = 21, clubId = CLUB) {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId));
  ensureTraining(g);
  ensureCareer(g);
  processDay(g);
  return g;
}
const setQ = (g, role, q) => { g.training.staff[g.clubId][role].q = q; };
const HIDDEN = ['KON', 'WAZ', 'ODP', 'PRF', 'TMP'];
const BAD_TEXT = /undefined|NaN|\bnull\b|\[object|\u2014/;

/** Średni błąd bezwzględny ocen asystenta jakości q dla zawodników całej Ekstraklasy. */
function mae(g, q) {
  for (const r of ['asystent', 'fizyczny', 'analityk', 'mlodziez', 'bramkarze']) setQ(g, r, q);
  const players = Object.values(g.world.players).filter((p) => p.hidden && p.clubId).slice(0, 400);
  let err = 0; let n = 0; let signOk = 0; let signN = 0;
  for (const p of players) {
    for (const k of HIDDEN) {
      const e = estimate(g, p, k);
      err += Math.abs(e.v - p.hidden[k]); n++;
      if (Math.abs(p.hidden[k] - 10.5) >= 3) { signN++; if (Math.sign(e.v - 10.5) === Math.sign(p.hidden[k] - 10.5)) signOk++; }
    }
    const e = estimate(g, p, 'POT');
    err += Math.abs(e.v - p.hidden.POT); n++;
  }
  return { mae: err / n, sign: signOk / signN };
}

test('Dokładność: lepszy asystent myli się mniej i rzadziej myli kierunek (mocna strona czy wada)', () => {
  const g = newGame();
  const good = mae(g, 18);
  const weak = mae(g, 5);
  assert.ok(good.mae < weak.mae, `MAE q18 ${good.mae.toFixed(2)} < q5 ${weak.mae.toFixed(2)}`);
  assert.ok(good.mae < 0.9, `dobry asystent blisko prawdy: ${good.mae.toFixed(2)}`);
  assert.ok(weak.mae > 1.6, `słaby asystent wyraźnie się myli: ${weak.mae.toFixed(2)}`);
  assert.ok(good.sign >= 0.97 && good.sign > weak.sign, `kierunek: q18 ${good.sign.toFixed(2)}, q5 ${weak.sign.toFixed(2)}`);
  // Progi dokładności przy pełnej znajomości zawodnika pokrywają się z dokładnością raportu rozwoju (staff.js)
  for (let q = 1; q <= 20; q++) assert.equal(precisionOf(estimateSd(q, 1)), reportPrecision(q), `q ${q}`);
  // Nowy zawodnik: ocena mniej pewna, z czasem lepsza
  const p = squadOf(g.world, g.clubId)[5];
  assert.equal(familiarity(p, g.date), 1, 'kadra z początku kariery jest znana');
  p.lastMove = '2026-10-01';
  assert.equal(familiarity(p, '2026-10-01'), AREP.famMin);
  assert.ok(familiarity(p, '2026-12-01') > familiarity(p, '2026-11-01'));
  assert.equal(familiarity(p, addDays('2026-10-01', AREP.knownDays)), 1);
  assert.ok(estimateSd(12, AREP.famMin) > estimateSd(12, 1));
});

test('Stabilność: ten sam raport po ponownym otwarciu, oceny stałe w miesiącu', () => {
  const g = newGame();
  const ids = squadOf(g.world, g.clubId).map((p) => p.id);
  for (const id of ids.slice(0, 8)) {
    assert.deepEqual(playerReport(g, id), playerReport(g, id));
    assert.equal(renderAssistantReport(g, id), renderAssistantReport(g, id));
  }
  const p = g.world.players[ids[3]];
  const july = HIDDEN.map((k) => estimate(g, p, k).v);
  g.date = '2026-07-20';
  assert.deepEqual(HIDDEN.map((k) => estimate(g, p, k).v), july, 'w tym samym miesiącu bez zmian');
  // Nowy miesiąc: część ocen może się przesunąć (szum miesięczny), ale opinia o zawodniku zostaje podobna
  g.date = '2026-08-03';
  const aug = HIDDEN.map((k) => estimate(g, p, k).v);
  for (let i = 0; i < HIDDEN.length; i++) assert.ok(Math.abs(aug[i] - july[i]) < 4, `${HIDDEN[i]}: ${july[i]} -> ${aug[i]}`);
  // Raport o drużynie: ten sam dzień i okres, ten sam tekst
  assert.equal(squadReport(g, g.date, 'x').body, squadReport(g, g.date, 'x').body);
});

test('Zalecenia nie przeczą sobie: jedna decyzja o obciążeniu, przy odpoczynku bez minut i dodatkowych zajęć', () => {
  const g = newGame();
  const squad = [...squadOf(g.world, g.clubId), ...academyOf(g.world, g.clubId)];
  const cases = [
    { fresh: 55 }, { fresh: 76 }, { fresh: 96, sharp: 40 }, { fresh: 96, acwr: 'high' }, { fresh: 96, acwr: 'low', mode: 'rest' },
    { fresh: 96, inj: 20 }, { fresh: 96, min: 0 }, { fresh: 65, sharp: 40, min: 0 },
  ];
  // Rozegrane mecze, żeby liczył się udział w minutach
  let k = 0;
  for (const f of g.fixtures) if ((f.home === g.clubId || f.away === g.clubId) && k < 6) { f.played = true; f.result = { score: [1, 0] }; k++; }
  let checked = 0;
  for (const c of cases) {
    for (const p of squad) {
      const t = p.training;
      p.fresh = c.fresh; p.sharp = c.sharp ?? 85; p.injuryDays = c.inj ?? 0; p.injury = c.inj ? { name: 'uraz mięśnia', days: c.inj, since: g.date } : null;
      t.mode = c.mode ?? 'normal';
      t.log = c.acwr === 'high' ? [...Array(21).fill(20), ...Array(7).fill(80)] : c.acwr === 'low' ? [...Array(21).fill(60), ...Array(7).fill(5)] : Array(28).fill(40);
      p.season = { ...(p.season ?? {}), min: c.min ?? 400 };
      const r = playerReport(g, p.id);
      const loads = new Set(r.recs.map((x) => Math.sign(x.load)));
      assert.ok(!(loads.has(1) && loads.has(-1)), `${p.name}, ${JSON.stringify(c)}: ${r.recs.map((x) => x.id)}`);
      const ids = r.recs.map((x) => x.id);
      assert.equal(ids.filter((x) => ['injured', 'rest', 'manage', 'sharpen', 'more', 'keep'].includes(x)).length, 1, 'dokładnie jedna decyzja o obciążeniu');
      if (['injured', 'rest', 'manage'].includes(r.stance)) assert.ok(!ids.some((x) => ['more', 'sharpen', 'youth', 'focus', 'learn'].includes(x)), `${r.stance}: ${ids}`);
      if (c.inj) assert.equal(r.stance, 'injured');
      if (c.fresh === 55 && !c.inj) assert.equal(r.stance, 'rest');
      checked++;
    }
  }
  assert.ok(checked > 200);
  // Priorytet: zdrowie przed ostrością i minutami
  const s = { inj: false, fresh: 65, acwr: 1, legs: 0, sharp: 30, share: 0, games: 10 };
  assert.equal(loadStance({ squad: 'A' }, s, { hungry: true }).id, 'rest');
  assert.equal(loadStance({ squad: 'A' }, { ...s, fresh: 95 }, { hungry: true }).id, 'sharpen');
  assert.equal(loadStance({ squad: 'A' }, { ...s, fresh: 95, sharp: 80 }, { hungry: true }).id, 'more');
});

/** Liczba raportów przy częstotliwości freq w 13 tygodniach (system dnia wywoływany wprost). */
function runPeriod(g, freq, from = '2026-09-01', days = 91) {
  g.assistantReport = null;
  ensureAssistantReport(g);
  setReportFreq(g, freq);
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    g.date = d;
    const r = ASSISTANT_SYSTEM.run(g, d);
    for (const m of r.messages ?? []) out.push(m);
  }
  return out;
}

test('Częstotliwość: co tydzień, co 2 tygodnie, co miesiąc, wyłączony; nie w dniu meczu; co najmniej 6 dni przerwy', () => {
  const g = newGame();
  const counts = {};
  for (const f of Object.keys(REPORT_FREQS)) {
    const ms = runPeriod(g, f);
    counts[f] = ms.length;
    assert.equal(new Set(ms.map((m) => m.key)).size, ms.length, `${f}: klucze bez powtórek`);
    for (let i = 1; i < ms.length; i++) assert.ok(addDays(ms[i - 1].date, AREP.minGap) <= ms[i].date, `${f}: przerwa ${ms[i - 1].date} -> ${ms[i].date}`);
    for (const m of ms) {
      assert.equal(clubMatchOn(g, m.date), null, `${f}: bez raportu w dniu meczu ${m.date}`);
      assert.equal(m.category, 'staff'); assert.equal(m.from, 'Asystent trenera'); assert.equal(m.priority, 'info');
      assert.ok(!BAD_TEXT.test(m.subject + m.body), m.body);
    }
  }
  assert.ok(counts.weekly >= 12 && counts.weekly <= 13, `co tydzień: ${counts.weekly}`);
  assert.ok(counts.biweekly >= 6 && counts.biweekly <= 7, `co 2 tygodnie: ${counts.biweekly}`);
  assert.equal(counts.monthly, 3);
  assert.equal(counts.off, 0);
  assert.equal(AREP.defaultFreq, 'biweekly');
  // Okresy: tydzień od poniedziałku, miesiąc od pierwszego wtorku (po raporcie rozwoju 1. dnia miesiąca)
  assert.deepEqual(reportPeriod('weekly', '2026-11-13'), { id: '2026-11-09', from: '2026-11-10', to: '2026-11-15' });
  for (const d of ['2026-09-15', '2026-12-20', '2027-03-03']) {
    const m = reportPeriod('monthly', d);
    assert.ok(m.from >= `${d.slice(0, 7)}-02` && new Date(`${m.from}T12:00:00Z`).getUTCDay() === 2, `${d}: ${m.from}`);
    assert.equal(m.id, d.slice(0, 7));
  }
  const b = reportPeriod('biweekly', '2026-11-13');
  assert.equal(reportPeriod('biweekly', addDays(b.id, 13)).id, b.id, 'ten sam okres przez 14 dni');
});

test('Bez duplikatów: drugi przebieg w tym samym okresie, zmiana częstotliwości, usunięta wiadomość', () => {
  const g = newGame();
  const day = '2026-09-08'; // wtorek
  g.date = day;
  assert.equal(clubMatchOn(g, day), null);
  setReportFreq(g, 'weekly');
  const first = ASSISTANT_SYSTEM.run(g, day).messages;
  assert.equal(first.length, 1);
  assert.deepEqual(ASSISTANT_SYSTEM.run(g, day), {}, 'drugi raz tego samego dnia nic');
  g.inbox = []; // gracz usunął raport: nie wraca w tym okresie
  assert.deepEqual(ASSISTANT_SYSTEM.run(g, addDays(day, 1)), {}, 'w tym samym tygodniu nic');
  setReportFreq(g, 'monthly');
  assert.deepEqual(ASSISTANT_SYSTEM.run(g, addDays(day, 2)), {}, 'zmiana częstotliwości nie daje raportu przed upływem 6 dni');
  // Pełna pętla dni: klucz raportu jest unikalny w skrzynce
  const g2 = newGame();
  setReportFreq(g2, 'weekly');
  for (let i = 0; i < 16; i++) { g2.date = addDays(g2.date, 1); processDay(g2); }
  const keys = g2.inbox.filter((m) => m.key?.startsWith('arep:')).map((m) => m.key);
  assert.ok(keys.length >= 1 && keys.length <= 3, `raporty w 16 dni: ${keys}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(g2.assistantReport.sentOn);
});

test('Odwołania zamiast powtórek: przeciążeni z wiadomości fizjo i przypomnienia o rozmowie z tego tygodnia', () => {
  const g = newGame();
  setQ(g, 'asystent', 18);
  const day = '2026-09-08';
  g.date = day;
  const sq = squadOf(g.world, g.clubId);
  const [a, b] = sq;
  for (const p of [a, b]) { p.training.log = [...Array(21).fill(20), ...Array(7).fill(90)]; p.injuryDays = 0; }
  g.inbox = [createMessage({ date: addDays(day, -1), key: `acwr:${addDays(day, -1)}`, category: 'staff', from: 'Trener przygotowania fizycznego', subject: 'Przeciążeni zawodnicy', body: `Obciążenie: ${a.name} (2,40).` })];
  const r = squadReport(g, day, 'test');
  const train = r.sections.find((s) => s.title === 'Trening i obciążenia').lines.join(' ');
  assert.match(train, /wymienił już trener przygotowania fizycznego/);
  const restLine = train.split('Odpoczynek albo lżejszy trening:')[1]?.split('.')[0] ?? '';
  assert.ok(!restLine.includes(a.name), 'zawodnik z wiadomości fizjo nie wraca na listę odpoczynku');
  assert.match(train, new RegExp(b.name), 'drugiego przeciążonego asystent wymienia sam');
  // Przypomnienie o rozmowie z tego tygodnia (attention.js): bez powtórki na liście rozmów
  const c = sq[6];
  c.morale = 6; c.att = { h: addDays(day, -1) };
  const talks = squadReport(g, day, 'test2').sections.find((s) => s.title === 'Rozmowy').lines.join(' ');
  assert.match(talks, /pisałem w tym tygodniu osobno/);
  assert.ok(!talks.split('Warto porozmawiać:')[1]?.includes(c.name));
});

test('Słaby asystent: mniej pozycji, bez liczb; dobry: liczby i więcej szczegółów', () => {
  const mk = (q) => {
    const g = newGame();
    setQ(g, 'asystent', q);
    for (const p of squadOf(g.world, g.clubId)) { p.fresh = 60; p.sharp = 40; p.morale = 7; }
    return squadReport(g, '2026-09-08', 'p1');
  };
  const weak = mk(3); const strong = mk(18);
  const names = (r) => (r.body.match(/[A-ZŁŚŻŹĆ][a-ząćęłńóśźż]+ [A-ZŁŚŻŹĆ][a-ząćęłńóśźż-]+/g) ?? []).length;
  assert.ok(names(weak) < names(strong), `słaby ${names(weak)} < dobry ${names(strong)}`);
  assert.ok(!/ACWR \d|świeżość \d|ostrość \d/.test(weak.body), 'słaby asystent bez liczb');
  assert.match(strong.body, /świeżość \d+ %/);
  assert.equal(weak.prec, 'vague'); assert.equal(strong.prec, 'exact');
  assert.match(weak.body, /Pewność raportu: niska/);
});

test('Stary zapis: migracja stanu raportu, zmiana klubu czyści dziennik', () => {
  const g = newGame();
  delete g.assistantReport;
  const st = ensureAssistantReport(g);
  assert.equal(st.freq, 'biweekly'); assert.deepEqual(st.inj, []); assert.equal(st.last, null); assert.equal(st.club, g.clubId);
  g.assistantReport = { freq: 'zle', inj: 'x', last: 5 };
  assert.equal(ensureAssistantReport(g).freq, 'biweekly');
  assert.deepEqual(g.assistantReport.inj, []);
  setReportFreq(g, 'monthly');
  g.assistantReport.inj = [{ id: 'a', d: '2026-07-01', n: 3, x: 'stłuczenie' }];
  assert.equal(ensureAssistantReport(g).freq, 'monthly', 'ustawienie gracza zostaje');
  assert.equal(g.assistantReport.inj.length, 1);
  assert.equal(setReportFreq(g, 'codziennie'), false);
  g.clubId = 'lech';
  const st2 = ensureAssistantReport(g);
  assert.deepEqual(st2.inj, []); assert.equal(st2.freq, 'monthly'); assert.equal(st2.club, 'lech');
  // Dziennik urazów: uraz zawodnika gracza trafia do historii raz
  const h = newGame();
  const p = squadOf(h.world, h.clubId)[2];
  p.injuryDays = 9; p.injury = { name: 'naderwanie mięśnia', days: 9, since: h.date };
  ASSISTANT_SYSTEM.run(h, h.date); ASSISTANT_SYSTEM.run(h, h.date);
  assert.equal(h.assistantReport.inj.filter((x) => x.id === p.id).length, 1);
  assert.match(playerReport(h, p.id).state.find((x) => x.k === 'Urazy').v, /naderwanie mięśnia/);
});

test('Widok i tekst: wszyscy zawodnicy kadry i akademii, słaby i dobry asystent, bez pustych wartości i pauz', () => {
  for (const q of [2, 11, 19]) {
    const g = newGame(33, 'lech');
    setQ(g, 'asystent', q);
    const players = [...squadOf(g.world, g.clubId), ...academyOf(g.world, g.clubId)];
    players[0].lastMove = g.date; // nowy w klubie: niższa pewność
    for (const p of players) {
      const html = renderAssistantReport(g, p.id);
      assert.ok(!BAD_TEXT.test(html), `${q}/${p.name}: ${html.match(BAD_TEXT)?.[0]}`);
      assert.match(html, /data-act="arepback"/);
      const r = playerReport(g, p.id);
      for (const h of r.hidden) {
        assert.ok(!/\d/.test(h.word), 'słowa bez liczb');
        if (h.range) assert.match(h.range, /^ok\. \d+-\d+$/);
        if (r.confidence.prec === 'vague') assert.equal(h.range, null, 'ogólny raport bez przedziałów');
      }
      if (q === 2) assert.equal(r.confidence.prec, 'vague');
      if (q === 19 && p !== players[0]) assert.equal(r.confidence.prec, 'exact');
    }
    assert.ok(!BAD_TEXT.test(squadReport(g).body));
    assert.ok(!BAD_TEXT.test(renderTraining(g, { trTab: 'sztab' })));
  }
  const g = newGame();
  assert.equal(playerReport(g, squadOf(g.world, 'legia')[0].id), null, 'tylko własni zawodnicy');
  assert.match(renderAssistantReport(g, squadOf(g.world, 'legia')[0].id), /tylko dla zawodników twojego klubu/);
});

test('Menu zawodnika: Raport asystenta dla własnych zawodników we wszystkich widokach, nie dla obcych', () => {
  const g = newGame();
  const lineup = { tactics: g.tactics, byId: new Map(squadOf(g.world, g.clubId).map((p) => [p.id, p])), benchSize: 9 };
  const own = [g.tactics.xi[0], g.tactics.bench[0], academyOf(g.world, g.clubId)[0].id];
  for (const view of MENU_VIEWS) {
    for (const id of own) {
      const it = flattenMenu(playerMenu(g, id, { view, lineup }).items).find((x) => x.label === 'Raport asystenta');
      assert.ok(it, `${view}/${id}`);
      assert.deepEqual(it.run.steps, [{ act: 'arep', id }]);
    }
    const other = playerMenu(g, squadOf(g.world, 'legia')[0].id, { view, lineup });
    assert.ok(!flattenMenu(other.items).some((x) => x.label === 'Raport asystenta'));
    // Otwarty raport tego zawodnika: bez pozycji prowadzącej do niego samego
    assert.ok(!flattenMenu(playerMenu(g, own[0], { view, lineup, ui: { repOpen: own[0] } }).items).some((x) => x.label === 'Raport asystenta'));
  }
});

test('Ustawienie w Trening > Sztab: przyciski częstotliwości, zapis i termin kolejnego raportu', () => {
  const g = newGame();
  const html = renderTraining(g, { trTab: 'sztab' });
  assert.match(html, /data-act="tr-arep" data-v="biweekly" aria-pressed="true"/);
  assert.equal(handleTrainingAction(g, 'tr-arep', { v: 'weekly' }).save, true);
  assert.equal(g.assistantReport.freq, 'weekly');
  assert.equal(handleTrainingAction(g, 'tr-arep', { v: 'nie' }).save, false);
  assert.equal(g.assistantReport.freq, 'weekly');
  assert.ok(nextReportDate(g) >= g.date);
  handleTrainingAction(g, 'tr-arep', { v: 'off' });
  assert.equal(nextReportDate(g), null);
  assert.match(renderTraining(g, { trTab: 'sztab' }), /Raport wyłączony/);
});

test('Kluby AI bez zmian: system czyta tylko klub gracza i nic nie zmienia poza własnym stanem', () => {
  const g = newGame();
  setReportFreq(g, 'weekly');
  const others = () => JSON.stringify(Object.values(g.world.players).filter((p) => p.clubId !== g.clubId));
  const mine = () => JSON.stringify(squadOf(g.world, g.clubId));
  const before = [others(), mine(), JSON.stringify(g.training), JSON.stringify(g.tactics)];
  for (let i = 0; i < 30; i++) { const d = addDays('2026-09-01', i); g.date = d; ASSISTANT_SYSTEM.run(g, d); }
  for (const p of squadOf(g.world, g.clubId).slice(0, 5)) playerReport(g, p.id);
  assert.deepEqual([others(), mine(), JSON.stringify(g.training), JSON.stringify(g.tactics)], before);
});
