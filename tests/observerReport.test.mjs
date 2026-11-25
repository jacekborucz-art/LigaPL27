// Raport obserwatora (src/career/observerReport.js, src/ui/observerView.js, docs/raport-obserwatora.md): zlecenie
// i sloty skautów, asystent bez wolnego skauta, raport po meczu, mecze bez gry, wygasanie, przedziały cech,
// charakter, koszty wyjazdu, menu zawodnika i widok raportu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { clubScouts } from '../src/career/scoutOps.js';
import { isPoolContracted } from '../src/career/foreignPool.js';
import { OBS, orderQuote, createOrder, observeDay, buildReport, aiSeenOvr, accuracy, ensureObserve, lastReport } from '../src/career/observerReport.js';
import { renderObserverReport, renderObserveOrder, observeStatusHtml, observeListHtml } from '../src/ui/observerView.js';
import { playerMenu, flattenMenu } from '../src/ui/playerMenus.js';
import { mailLinks } from '../src/ui/mailLinks.js';
import { renderTransfers } from '../src/ui/transfersView.js';
import '../src/season/dailySystems.js';

const CLUB = 'widzew';
function newGame(seed = 31) {
  applySeasonState({});
  const g = { seed, clubId: CLUB, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'A', lastName: 'B' } } };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: CLUB }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, CLUB), { benchSize: 12 });
  ensureCareer(g); processDay(g);
  return g;
}
let shared = null;
const fresh = () => structuredClone(shared ??= newGame());
const step = (g, n = 1) => { for (let i = 0; i < n; i++) { g.date = addDays(g.date, 1); processDay(g); } };
const setScout = (s, v) => { s.a = { DOS: v, OCE: v, RYN: v, SIE: v, CHA: v }; s.q = v; s.mission = null; s.busyUntil = null; };
/** Klub gracza z jednym skautem o atrybutach v (skala skauta 1-12). */
function oneScout(g, v = 8) {
  const sc = clubScouts(g, CLUB);
  assert.ok(sc.length >= 1, 'klub ma skauta');
  sc.forEach((s, i) => { setScout(s, v); if (i > 0) s.mission = 'x'; });
  return sc[0];
}
const others = (g, club = 'legia') => squadOf(g.world, club).filter((p) => p.pos !== 'BR' && p.age > 21);
/** Mecz o stawkę klubu zawodnika (dopisany do terminarza) i przegląd dnia. */
function fakeMatch(g, p, date, { played = true } = {}) {
  const f = { id: `t:${date}:${p.id}`, date, comp: 'ekstraklasa', home: p.clubId, away: 'lech', played: true, result: { score: [1, 0] } };
  g.fixtures.push(f);
  if (played) p.fh = [...(p.fh ?? []), [7.2, date, 'lech', 'ekstraklasa', 1, 0, 1]];
  return observeDay(g, date);
}

test('Zlecenie: sloty skauta (2), potem asystent (1), potem brak wolnych; ten sam zawodnik dwa razy nie', () => {
  const g = fresh();
  const s = oneScout(g, 6); // DOS poniżej 16 (skala efektów): 2 obserwacje naraz
  const ps = others(g);
  const r1 = createOrder(g, ps[0].id, { mode: 'match' });
  const r2 = createOrder(g, ps[1].id, { mode: 'matches', n: 3 });
  assert.ok(r1.ok && r2.ok, `${r1.text} ${r2.text}`);
  assert.equal(r1.order.observer.id, s.id); assert.equal(r2.order.observer.id, s.id);
  const r3 = createOrder(g, ps[2].id, { mode: 'period', weeks: 3 });
  assert.ok(r3.ok); assert.equal(r3.order.observer.kind, 'assistant', 'trzecie zlecenie: asystent');
  const r4 = orderQuote(g, ps[3].id, {});
  assert.equal(r4.ok, false); assert.match(r4.errors.join(' '), /Wszyscy skauci są w drodze/);
  assert.match(orderQuote(g, ps[0].id, {}).errors.join(' '), /już na zleceniu/);
  assert.match(orderQuote(g, squadOf(g.world, CLUB)[0].id, {}).errors.join(' '), /Raport asystenta/);
  // Doświadczony skaut (DOS 12 na skali 1-12, efekt 17): 3 obserwacje naraz
  const g2 = fresh(); oneScout(g2, 12);
  for (let i = 0; i < 3; i++) assert.equal(createOrder(g2, others(g2)[i].id, {}).order.observer.kind, 'scout');
});

test('Skaut na wyjeździe za granicą: obserwuje asystent (gorsza dokładność)', () => {
  const g = fresh();
  const s = oneScout(g, 10); s.mission = 'm1';
  const p = others(g)[0];
  const q = orderQuote(g, p.id, {});
  assert.ok(q.ok); assert.equal(q.observer.kind, 'assistant');
  assert.ok(q.warnings.some((w) => /asystent/.test(w)));
  s.mission = null;
  assert.ok(accuracy(g, CLUB, p, { kind: 'assistant' }) < accuracy(g, CLUB, p, { kind: 'scout', person: s }), 'asystent x0,75');
});

test('Raport po jednym meczu: list w Poczcie, odnośnik do raportu, bez charakteru', () => {
  const g = fresh(); oneScout(g, 12);
  const p = others(g)[0];
  const r = createOrder(g, p.id, { mode: 'match' });
  assert.ok(r.ok);
  let n = 0;
  while (!lastReport(g, p.id) && n++ < 40) step(g);
  const L = lastReport(g, p.id);
  assert.ok(L, 'raport po najbliższym meczu');
  assert.equal(L.r.watched, 1); assert.equal(L.r.stage, 'one');
  assert.equal(L.r.character.open, false, 'po 1 meczu charakter nieznany');
  assert.equal(L.r.rec === 'take', false, 'po 1 meczu nie „bierzemy”');
  const m = g.inbox.find((x) => x.key?.startsWith('obs-report:'));
  assert.ok(m && /Raport obserwatora/.test(m.subject));
  const link = mailLinks(g, m)[0];
  assert.equal(link.label, 'Otwórz raport'); assert.equal(link.run.steps[0].act, 'obs-open');
  assert.equal(g.observe.orders[0].status, 'done');
});

test('Kontuzja, pauza i ławka bez minut nie zwiększają licznika; po 3 ławkach „nie ma regularnej gry”', () => {
  const g = fresh(); oneScout(g, 12);
  const p = others(g)[1];
  createOrder(g, p.id, { mode: 'matches', n: 2 });
  const o = g.observe.orders[0];
  let d = addDays(g.date, 1);
  p.injuryDays = 5; fakeMatch(g, p, d, { played: false }); p.injuryDays = 0;
  assert.equal(o.games.at(-1).k, 'injury');
  for (let i = 0; i < 3; i++) { d = addDays(d, 3); fakeMatch(g, p, d, { played: false }); }
  assert.deepEqual(o.games.map((x) => x.k), ['injury', 'bench', 'bench', 'bench']);
  assert.equal(o.status, 'active', 'licznik stoi');
  d = addDays(d, 3); fakeMatch(g, p, d);
  d = addDays(d, 3); const msgs = fakeMatch(g, p, d);
  assert.equal(o.status, 'done'); assert.equal(msgs.length, 1);
  const rep = lastReport(g, p.id).r;
  assert.equal(rep.watched, 2); assert.equal(rep.form.noRegular, true);
  assert.ok(rep.form.lines.some((x) => /ławce|rezerwowy/.test(x)));
});

test('Zlecenie bez obejrzanego meczu wygasa po 60 dniach', () => {
  const g = fresh(); oneScout(g, 10);
  const p = others(g)[2];
  createOrder(g, p.id, { mode: 'matches', n: 3 });
  const o = g.observe.orders[0];
  p.injuryDays = 200;
  assert.deepEqual(observeDay(g, addDays(o.start, OBS.expiry - 1)).filter((m) => m.key?.startsWith('obs')), []);
  const out = observeDay(g, addDays(o.start, OBS.expiry));
  assert.equal(o.status, 'expired');
  assert.ok(out.some((m) => m.key.startsWith('obs-expired:')));
  // Raport ważny 60 dni, potem nieaktualny (zostaje w historii)
  const g2 = fresh(); oneScout(g2, 12);
  const q = others(g2)[0];
  createOrder(g2, q.id, { mode: 'match' });
  fakeMatch(g2, q, addDays(g2.date, 1));
  g2.date = addDays(g2.date, OBS.valid + 2);
  assert.equal(lastReport(g2, q.id).stale, true);
  assert.match(renderObserverReport(g2, { pid: q.id }), /nieaktualny/);
});

test('Przedziały cech: dobry skaut obejmuje prawdę zwykle (>= 75 %), słaby ma szersze przedziały', () => {
  const g = fresh();
  const s = oneScout(g, 12);
  const p = others(g)[0];
  const run = (v) => {
    setScout(s, v);
    let hit = 0; let n = 0; let width = 0;
    for (let i = 0; i < 200; i++) {
      const o = { id: `t${v}-${i}`, pid: p.id, club: CLUB, mode: 'match', n: 1, weeks: 0, start: g.date, observer: { kind: 'scout', id: s.id, name: s.name }, games: [{ k: 'seen', d: g.date, r: 7, min: 90, g: 0, a: 0 }], cost: 0 };
      const r = buildReport(g, o, g.date);
      for (const a of r.attrs) {
        if (a.none) continue;
        n++; width += a.hi - a.lo;
        if (p.attr[a.k] >= a.lo && p.attr[a.k] <= a.hi) hit++;
      }
    }
    return { cover: hit / n, width: width / n, per: n / 200 };
  };
  const good = run(12); const weak = run(2);
  assert.ok(good.cover >= 0.75, `dobry skaut: ${good.cover}`);
  assert.ok(good.cover < 0.99, 'prawda czasem poza przedziałem');
  assert.ok(weak.width > good.width + 1, `szerokość: słaby ${weak.width}, dobry ${good.width}`);
  assert.ok(weak.per < good.per, 'słaby ujawnia mniej cech');
});

test('Charakter: dopiero po 3 meczach i przy ocenie charakteru od 8; aklimatyzacja zaznaczona', () => {
  const g = fresh(); const s = oneScout(g, 12);
  const p = others(g)[0];
  const o = (id, n) => ({ id, pid: p.id, club: CLUB, mode: 'matches', n, weeks: 0, start: g.date, observer: { kind: 'scout', id: s.id, name: s.name }, games: Array.from({ length: n }, () => ({ k: 'seen', d: g.date, r: 7, min: 90, g: 0, a: 0 })), cost: 0 });
  assert.equal(buildReport(g, o('c1', 1)).character.open, false);
  assert.equal(buildReport(g, o('c3', 3)).character.open, true);
  setScout(s, 4); // ocena charakteru poniżej 8 na skali efektów
  assert.equal(buildReport(g, o('c4', 3)).character.open, false);
  p.lastMove = '2026-07-02'; // świeżo po zmianie klubu: aklimatyzacja zaznaczona, nie jako wada
  const r = buildReport(g, o('c5', 3));
  assert.equal(r.acclim, true);
  assert.ok(r.character.lines.some((x) => /adaptacji|przeprowadzce/.test(x)));
});

test('Zagranica: okres płatny z góry (8 000 zł za tydzień), kategoria skautów w Finansach', () => {
  const g = fresh(); oneScout(g, 10);
  const p = (g.market.foreign ?? []).map((id) => g.world.players[id]).find((x) => x && isPoolContracted(x));
  assert.ok(p, 'zawodnik z kontraktem za granicą');
  const c = g.finance.clubs[CLUB];
  const bal = c.balance;
  const q = orderQuote(g, p.id, { mode: 'period', weeks: 2 });
  assert.equal(q.cost, 2 * OBS.cost.week); assert.match(q.costText, /Koszt z podróżą/);
  assert.ok(q.warnings.some((w) => /za granicą/.test(w)));
  const r = createOrder(g, p.id, { mode: 'period', weeks: 2 });
  assert.ok(r.ok);
  assert.equal(bal - c.balance, 2 * OBS.cost.week);
  assert.equal(c.ledger[g.date.slice(0, 7)].out.scouts, 2 * OBS.cost.week);
  // Okres: mecze co tydzień (zawodnik bez polskiego klubu), raport po 2 tygodniach
  step(g, 14);
  const L = lastReport(g, p.id);
  assert.ok(L && L.r.flags.abroad, 'raport z zagranicy');
  assert.ok(L.r.lines.profile.some((x) => /granic|kraju|zagraniczna/.test(x)));
});

test('Menu: „Raport obserwatora…” u zawodnika innej drużyny w Transferach i w widoku klubu (Rozgrywki), nie u własnego', () => {
  const g = fresh(); oneScout(g, 10);
  const p = others(g)[0];
  for (const view of ['transfers', 'club', 'dashboard']) {
    const it = flattenMenu(playerMenu(g, p.id, { view }).items).find((x) => x.label === 'Raport obserwatora…');
    assert.ok(it, `${view}: pozycja w menu`);
    assert.equal(it.run.steps[0].act, 'obs-order');
  }
  const own = squadOf(g.world, CLUB)[0];
  assert.ok(!flattenMenu(playerMenu(g, own.id, { view: 'club' }).items).some((x) => /obserwat/i.test(x.label)));
  createOrder(g, p.id, { mode: 'matches', n: 3 });
  const it = flattenMenu(playerMenu(g, p.id, { view: 'club' }).items).find((x) => x.label === 'Raport obserwatora…');
  assert.match(it.hint, /czeka na pierwszy mecz|obejrzano/);
  assert.match(observeStatusHtml(g, p), /Obserwacja/);
  assert.ok(observeListHtml(g).count >= 1);
  assert.match(renderTransfers(g, { tfTab: 'skauting' }), /Obserwacje[\s\S]*data-act="obs-order"/, 'lista „Obserwacje” w Transfery, Skauting');
});

test('Widok raportu: bez dokładności, tekst przez esc(), zawodnik bez klubu i kontraktu', () => {
  const g = fresh(); const s = oneScout(g, 12);
  const p = others(g)[0];
  p.name = 'Jan <i>X</i> & "Y"';
  createOrder(g, p.id, { mode: 'matches', n: 2 });
  const o = g.observe.orders[0];
  fakeMatch(g, p, addDays(g.date, 1)); fakeMatch(g, p, addDays(g.date, 4));
  assert.equal(o.status, 'done');
  const html = renderObserverReport(g, { pid: p.id });
  assert.ok(html.includes('Jan &lt;i&gt;X&lt;/i&gt; &amp; &quot;Y&quot;'));
  assert.ok(!html.includes('<i>X</i>'));
  assert.ok(!/dokładnoś|pewnoś|trafnoś|precyz/i.test(html), 'raport nie mówi o swojej dokładności');
  assert.ok(!html.includes(String.fromCharCode(0x2014)), 'bez pauzy em');
  for (const sec of ['Profil', 'Mocne i słabe strony', 'Forma i statystyki', 'Zdrowie', 'Mentalność i osobowość', 'Rola u nas', 'Potencjał', 'Rynek', 'Rekomendacja']) assert.ok(html.includes(`>${sec}`), sec);
  assert.match(html, /data-act="obs-offer"/);
  // Wolny zawodnik bez kontraktu: okno zlecenia i raport
  const free = g.world.players[g.market.free[0]];
  delete free.contract;
  assert.match(renderObserveOrder(g, { pid: free.id, mode: 'match' }), /Zleć raport/);
  const r = createOrder(g, free.id, { mode: 'match' });
  assert.ok(r.ok, r.text);
  step(g, 4);
  const L = lastReport(g, free.id);
  assert.ok(L, 'raport o wolnym zawodniku');
  assert.equal(L.r.market.price, null, 'bez ceny');
  assert.match(renderObserverReport(g, { pid: free.id }), /bez kontraktu/);
  void s;
});

test('Kluby AI: OVR widziany z błędem sztabu (deterministyczny), wyłącznik parytetu', () => {
  const g = fresh(); ensureObserve(g);
  const ps = others(g, 'lech');
  const seen = aiSeenOvr(g, 'legia');
  const again = aiSeenOvr(g, 'legia');
  let diff = 0;
  for (const p of ps) { assert.equal(seen(p), again(p)); diff += Math.abs(seen(p) - p.ovr); }
  assert.ok(diff / ps.length > 0.05 && diff / ps.length < 3, `średni błąd ${diff / ps.length}`);
  OBS.ai.on = false;
  try { assert.equal(aiSeenOvr(g, 'legia')(ps[0]), ps[0].ovr); } finally { OBS.ai.on = true; }
});
