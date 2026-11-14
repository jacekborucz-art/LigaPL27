// Menu kontekstowe zawodnika (src/ui/playerMenus.js): które opcje widać w którym widoku, które są
// wyłączone i z jakim powodem, oraz czy każda opcja uruchamia akcję, którą ekrany już obsługują.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf, academyOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { ensureTraining } from '../src/training/index.js';
import { completeTransfer, notForSale } from '../src/career/transfers.js';
import { squadCount, SQUAD_LIMITS } from '../src/career/squadLimit.js';
import { ensureSquadLimit, limitStatus } from '../src/career/squadLimitSystem.js';
import { handleTransferAction, isTransferAction } from '../src/ui/transfersView.js';
import { handleTalkAction, isTalkAction } from '../src/ui/talksView.js';
import { handleTrainingAction, isTrainingAction } from '../src/ui/trainingView.js';
import { parseLoc, resolveMove } from '../src/ui/tacticsMoves.js';
import { playerMenu, flattenMenu, MENU_VIEWS } from '../src/ui/playerMenus.js';
import '../src/season/dailySystems.js';

const BENCH = 9;
function newGame(seed = 21, clubId = 'widzew') {
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed);
  g.season = createSeason(seed, { playerClub: clubId });
  g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: BENCH });
  ensureTraining(g);
  ensureCareer(g);
  processDay(g);
  return g;
}
const lineupOf = (g) => ({ tactics: g.tactics, byId: new Map(squadOf(g.world, g.clubId).map((p) => [p.id, p])), benchSize: BENCH });
const menu = (g, pid, view, extra = {}) => playerMenu(g, pid, { view, lineup: lineupOf(g), ...extra });
const flat = (m) => flattenMenu(m.items);
const find = (m, label) => flat(m).find((x) => x.label === label);
const findStart = (m, prefix) => flat(m).find((x) => x.label.startsWith(prefix));
const top = (m) => m.items.filter((x) => !x.sep).map((x) => x.label);
const outIds = (g) => squadOf(g.world, g.clubId).map((p) => p.id).filter((id) => !g.tactics.xi.includes(id) && !g.tactics.bench.includes(id));

// Akcje, które obsługuje app.js (kliknięcia data-act); prefiksy tf-, tt-, tr- mają własne handlery widoków.
const APP_ACTS = new Set(['tab', 'tsub', 'player', 'tpick', 'tmove', 'tbench', 'tunbench', 'tcancel', 'tinfo', 'trole', 'extplayer', 'arep']);
const TF_ACTS = new Set(['tf-open', 'tf-offer', 'tf-loan', 'tf-negotiate', 'tf-renew', 'tf-list-own', 'tf-unlist', 'tf-keep', 'tf-release']);
const TR_ACTS = new Set(['tr-tab', 'tr-player', 'tr-focus', 'tr-mode', 'tr-pos', 'tr-prog']);

test('Każda opcja w każdym widoku uruchamia istniejącą akcję; wyłączone opcje mają powód', () => {
  const g = newGame();
  const mine = squadOf(g.world, g.clubId);
  const other = squadOf(g.world, 'legia');
  const ids = [g.tactics.xi[0], g.tactics.xi[5], g.tactics.bench[0], outIds(g)[0], academyOf(g.world, g.clubId)[0].id, other[0].id, other[20].id, g.market.free[0]];
  let n = 0;
  for (const view of MENU_VIEWS) {
    for (const id of ids) {
      const m = menu(g, id, view);
      assert.ok(m && m.items.length, `${view}/${id}: menu niepuste`);
      assert.ok(m.title && m.pos, 'nagłówek: nazwisko i pozycja');
      for (const it of flat(m)) {
        assert.ok(it.label && !/\u2014/.test(it.label + (it.hint ?? '') + (it.disabled ?? '')), 'etykieta bez pauzy');
        if (it.disabled) assert.equal(typeof it.disabled, 'string', `${it.label}: powód wyłączenia`);
        if (it.items) { assert.ok(!it.run, 'podmenu nie ma własnej akcji'); continue; }
        if (it.disabled && !it.run) continue;
        assert.ok(it.run?.steps?.length, `${view}: ${it.path.join(' > ')} ma akcję`);
        for (const s of it.run.steps) {
          n++;
          const known = APP_ACTS.has(s.act) || (isTransferAction(s.act) && TF_ACTS.has(s.act)) || isTalkAction(s.act) || (isTrainingAction(s.act) && TR_ACTS.has(s.act));
          assert.ok(known, `nieznana akcja ${s.act} (${it.path.join(' > ')})`);
        }
      }
    }
  }
  assert.ok(n > 200);
  assert.equal(playerMenu(g, 'nie-ma-takiego', { view: 'squad' }), null);
  assert.equal(playerMenu(g, mine[0].id, { view: 'poczta' }), null);
});

test('Kadra: własny zawodnik ma profil, skład meczowy, rozmowę, trening i kontrakt; przedłużenie dopiero 18 miesięcy przed końcem', () => {
  const g = newGame();
  const p = g.world.players[g.tactics.xi[4]];
  p.contract.until = '2029-06-30';
  const m = menu(g, p.id, 'squad');
  assert.deepEqual(top(m), ['Profil zawodnika', 'Raport asystenta', 'Statystyki i historia', 'Skład meczowy', 'Rozmowa indywidualna', 'Trening indywidualny', 'Przedłuż kontrakt', 'Wystaw na listę transferową', 'Rozwiąż kontrakt…']);
  assert.ok(m.items[0].primary, 'profil jak zwykłe kliknięcie wiersza');
  assert.deepEqual(m.items[0].run.steps.map((s) => s.act), ['tab', 'tsub', 'player']);
  assert.match(find(m, 'Przedłuż kontrakt').disabled, /^Rozmowy możliwe od 1 gru 2027$/);
  p.contract.until = '2027-06-30';
  assert.equal(find(menu(g, p.id, 'squad'), 'Przedłuż kontrakt').disabled, null);
  // Zawodnik na liście transferowej: zamiast wystawienia jest zdjęcie z listy
  g.market.userListed[p.id] = 500000;
  const m2 = menu(g, p.id, 'squad');
  assert.ok(find(m2, 'Zdejmij z listy transferowej') && !find(m2, 'Wystaw na listę transferową'));
  assert.match(m2.note, /na liście za/);
  // Wypożyczony do klubu: bez listy i rozwiązania
  p.loan = { from: 'legia' };
  const m3 = menu(g, p.id, 'squad');
  assert.match(find(m3, 'Rozwiąż kontrakt…').disabled, /Wypożyczony z/);
  assert.match(find(m3, 'Przedłuż kontrakt').disabled, /Wypożyczony z/);
});

test('Akademia: tylko profil, raport asystenta i trening indywidualny', () => {
  const g = newGame();
  const a = academyOf(g.world, g.clubId)[0];
  const m = menu(g, a.id, 'squad');
  assert.deepEqual(top(m), ['Profil zawodnika', 'Raport asystenta', 'Akcent indywidualny', 'Obciążenie', 'Nauka pozycji', 'Program', 'Ustawienia treningu']);
  assert.equal(m.note, 'Akademia');
});

test('Skład i taktyka: opcje zależą od miejsca zawodnika (jedenastka, ławka, poza kadrą)', () => {
  const g = newGame();
  const xi = g.tactics.xi[5];
  const mXi = menu(g, xi, 'tactics');
  assert.deepEqual(top(mXi).slice(0, 5), ['Przesuń na inną pozycję', 'Zamień z rezerwowym', 'Zamień z…', 'Kapitan i stałe fragmenty', 'Atrybuty']);
  assert.ok(!find(mXi, 'Poza kadrę meczową') && !find(mXi, 'Do pierwszego składu'));
  assert.equal(find(mXi, 'Kapitan i stałe fragmenty').disabled, null);
  const swaps = find(mXi, 'Zamień z rezerwowym').items;
  assert.equal(swaps.length, g.tactics.bench.length);
  // Ruch z menu to te same reguły co przeciąganie
  const st = swaps.find((x) => !x.disabled).run.steps[0];
  assert.equal(st.act, 'tmove');
  assert.ok(resolveMove(g.tactics, parseLoc(st.src), parseLoc(st.dst), lineupOf(g)).ok);
  // Bramkarz tylko na bramkę
  const gkOut = outIds(g).find((id) => g.world.players[id].pos === 'BR');
  if (gkOut) assert.deepEqual(find(menu(g, gkOut, 'tactics'), 'Do pierwszego składu').items.map((x) => x.label.split(':')[0]), ['BR']);

  const bench = g.tactics.bench[1];
  const mB = menu(g, bench, 'tactics');
  assert.ok(find(mB, 'Do pierwszego składu') && find(mB, 'Poza kadrę meczową'));
  assert.deepEqual(find(mB, 'Poza kadrę meczową').run.steps, [{ act: 'tunbench', id: bench }]);
  assert.equal(find(mB, 'Kapitan i stałe fragmenty').disabled, 'Tylko zawodnik z pierwszego składu');

  const out = outIds(g).find((id) => g.world.players[id].pos !== 'BR');
  g.tactics = { ...g.tactics, bench: g.tactics.bench.slice(0, BENCH - 1) };
  const mO = menu(g, out, 'tactics');
  assert.deepEqual(find(mO, 'Na ławkę rezerwowych').run.steps, [{ act: 'tbench', id: out }]);
  // Pełna ławka: wybór, kogo zastąpi
  g.tactics = { ...g.tactics, bench: [...g.tactics.bench, outIds(g).find((id) => id !== out)] };
  const full = menu(g, out, 'tactics');
  assert.ok(!find(full, 'Na ławkę rezerwowych'));
  assert.equal(find(full, 'Na ławkę zamiast…').items.length, BENCH);
  // Kontuzja: nie może wejść do kadry meczowej, powód w opcji
  g.world.players[out].injuryDays = 12;
  const inj = menu(g, out, 'tactics');
  assert.equal(find(inj, 'Do pierwszego składu').disabled, 'Kontuzja, 12 dni');
  assert.equal(find(inj, 'Na ławkę zamiast…').disabled, 'Kontuzja, 12 dni');
  assert.match(inj.note, /^Kontuzja, 12 dni, Poza kadrą meczową/);
});

test('Zamiana przez wybór: przy wybranym innym zawodniku menu kończy zamianę jednym kliknięciem', () => {
  const g = newGame();
  const a = g.tactics.xi[2];
  const b = g.tactics.xi[7];
  const name = g.world.players[a].last;
  const m = menu(g, b, 'tactics', { ui: { tSel: { zone: 'xi', idx: 2 } } });
  const it = find(m, `Zamień z: ${name}`);
  assert.ok(it && !it.disabled);
  assert.deepEqual(it.run.steps, [{ act: 'tpick', loc: 'xi:7' }]);
  const same = menu(g, a, 'tactics', { ui: { tSel: { zone: 'xi', idx: 2 } } });
  assert.deepEqual(find(same, 'Anuluj wybór').run.steps, [{ act: 'tcancel' }]);
  // Rola: zaznaczona u obecnego kapitana
  const cap = g.tactics.captain;
  assert.equal(find(menu(g, cap, 'tactics'), 'Kapitan').checked, true);
});

test('Rynek: cudzy zawodnik. Oferta i wypożyczenie wyłączone poza oknem, przy pełnej kadrze i u nietykalnych', () => {
  const g = newGame();
  const legia = squadOf(g.world, 'legia');
  const top3 = legia.find((p) => notForSale(g, p) && !p.contract?.clause);
  const regular = legia.filter((p) => !notForSale(g, p)).sort((a, b) => a.age - b.age)[0];
  const m = menu(g, regular.id, 'transfers');
  assert.deepEqual(top(m), ['Karta zawodnika', 'Profil i statystyki', 'Złóż ofertę…', 'Wypożycz…']);
  assert.match(m.note, /^Twój najlepszy /, 'porównanie z najlepszym na pozycji');
  assert.equal(find(m, 'Złóż ofertę…').run.focus, '#tfFee');
  assert.equal(find(m, 'Złóż ofertę…').disabled, null, 'okno otwarte w lipcu');
  assert.match(find(menu(g, top3.id, 'transfers'), 'Złóż ofertę…').disabled, /nie sprzedaje/);
  // Karta już otwarta: bez „Karta zawodnika”
  assert.ok(!find(menu(g, regular.id, 'transfers', { ui: { tfPlayer: regular.id } }), 'Karta zawodnika'));
  // Okno zamknięte
  g.date = '2026-10-10';
  assert.match(find(menu(g, regular.id, 'transfers'), 'Złóż ofertę…').disabled, /^Okno transferowe zamknięte, otwarcie 1 lut 2027$/);
  // Wolny zawodnik: rozmowa o kontrakcie także poza oknem
  const free = g.world.players[g.market.free[0]];
  assert.equal(find(menu(g, free.id, 'transfers'), 'Rozmawiaj o kontrakcie').disabled, null);
  // Pełna kadra
  g.date = '2026-07-01';
  while (!squadCount(g, g.clubId).full) {
    const id = g.market.free.find((x) => g.world.players[x] && x !== free.id);
    completeTransfer(g, { playerId: id, to: g.clubId, contract: { wage: 4000, until: '2028-06-30' }, kind: 'free' });
  }
  const c = squadCount(g, g.clubId);
  assert.equal(find(menu(g, regular.id, 'transfers'), 'Złóż ofertę…').disabled, `Limit kadry ${c.counted}/${c.hard}`);
  assert.equal(find(menu(g, free.id, 'transfers'), 'Rozmawiaj o kontrakcie').disabled, `Limit kadry ${c.counted}/${c.hard}`);
});

test('Limit kadry: osłona przed zarządem tylko w sprawie zarządu i tylko dla wskazanych lub osłoniętych', () => {
  const g = newGame(13);
  const any = g.tactics.bench[0];
  assert.ok(!find(menu(g, any, 'transfers'), 'Osłoń przed decyzją zarządu'));
  while (squadCount(g, g.clubId).counted < SQUAD_LIMITS[1].soft + 2) {
    const id = g.market.free.find((x) => g.world.players[x]);
    completeTransfer(g, { playerId: id, to: g.clubId, contract: { wage: 4000, until: '2028-06-30' }, kind: 'free' });
  }
  while (g.date < '2026-07-02') { g.date = addDays(g.date, 1); processDay(g); }
  const L = limitStatus(g);
  assert.ok(L.case && L.targets.length);
  const t = L.targets[0];
  const it = find(menu(g, t.id, 'squad'), 'Osłoń przed decyzją zarządu');
  assert.ok(it && !it.disabled);
  assert.deepEqual(it.run.steps, [{ act: 'tf-keep', id: t.id }]);
  ensureSquadLimit(g).case.keep.push('x1', 'x2', 'x3');
  assert.match(find(menu(g, t.id, 'squad'), 'Osłoń przed decyzją zarządu').disabled, /Osłonięci już 3 z 3/);
});

test('Rozmowy: po rozmowie z zawodnikiem kolejna za tydzień, z innymi bez limitu; menu przekazuje temat, którego handler używa bez formularza', () => {
  const g = newGame();
  const p = g.tactics.xi[3];
  const m = menu(g, p, 'talks');
  assert.equal(top(m)[0], 'Porozmawiaj');
  const praise = find(m, 'Pochwała za formę');
  assert.deepEqual(praise.run.steps, [{ act: 'tt-talk', id: p, kind: 'praise' }]);
  const r = handleTalkAction(g, 'tt-talk', { id: p, kind: 'praise' }, null);
  assert.ok(r.save && /pochwała za formę/.test(r.ui.ttResult));
  for (let i = 1; i < 6; i++) handleTalkAction(g, 'tt-talk', { id: g.tactics.xi[i + 4], kind: 'encourage' }, null);
  assert.match(find(menu(g, p, 'squad'), 'Rozmowa indywidualna').disabled, /Kolejna za 7 dni/, 'z tym samym zawodnikiem raz w tygodniu');
  assert.equal(find(menu(g, g.tactics.xi[1], 'squad'), 'Rozmowa indywidualna').disabled, null, 'z innym zawodnikiem bez limitu');
});

test('Trening: akcent, obciążenie i nauka pozycji jako opcje wyboru; akcje działają w handlerze treningu', () => {
  const g = newGame();
  const p = g.world.players[g.tactics.xi[6]];
  const m = menu(g, p.id, 'training');
  assert.deepEqual(top(m), ['Akcent indywidualny', 'Obciążenie', 'Nauka pozycji', 'Program', 'Ustawienia treningu', 'Raport rozwoju', 'Profil zawodnika', 'Raport asystenta', 'Rozmowa indywidualna', 'Kontrakt i transfer']);
  assert.ok(find(m, 'Ustawienia treningu').primary);
  const rest = find(m, 'Odpoczynek');
  assert.equal(rest.checked, false);
  for (const s of rest.run.steps) handleTrainingAction(g, s.act, s);
  assert.equal(p.training.mode, 'rest');
  assert.equal(find(menu(g, p.id, 'training'), 'Odpoczynek').checked, true);
  // Otwarty edytor tego zawodnika: bez „Ustawienia treningu”
  assert.ok(!find(menu(g, p.id, 'training', { ui: { trPlayer: p.id } }), 'Ustawienia treningu'));
  // Bramkarz nie uczy się gry w polu
  const gk = squadOf(g.world, g.clubId).find((x) => x.pos === 'BR');
  assert.equal(find(menu(g, gk.id, 'training'), 'Nauka pozycji').disabled, 'Bramkarz nie uczy się gry w polu');
  // Pozycja, na której gra już dobrze, jest wyłączona z powodem
  const posItems = find(m, 'Nauka pozycji').items;
  for (const it of posItems.filter((x) => x.disabled)) assert.match(it.disabled, /^Gra tu już na \d+%$/);
});

test('Pulpit: najważniejsza opcja zależy od powodu na liście (uraz, kontrakt)', () => {
  const g = newGame();
  const p = g.world.players[g.tactics.xi[1]];
  p.injuryDays = 20;
  const inj = menu(g, p.id, 'dashboard', { why: 'inj' });
  assert.equal(inj.items[0].label, 'Program powrotu po kontuzji');
  assert.deepEqual(inj.items[0].run.steps, [{ act: 'tr-prog', id: p.id, v: 'powrot' }]);
  handleTrainingAction(g, 'tr-prog', { id: p.id, v: 'powrot' });
  assert.equal(menu(g, p.id, 'dashboard', { why: 'inj' }).items[0].disabled, 'Już w programie powrotu');
  const susp = menu(g, p.id, 'dashboard', { why: 'susp' });
  assert.equal(susp.items[0].label, 'Pokaż w składzie');
  const ct = menu(g, p.id, 'dashboard', { why: 'contract' });
  assert.deepEqual(top(ct).slice(0, 2), ['Przedłuż kontrakt', 'Rozmowa o przyszłości']);
});

test('Wystawienie na listę z menu: handler bez formularza bierze cenę z menu', () => {
  const g = newGame();
  const p = g.world.players[g.tactics.bench[2]];
  const it = find(menu(g, p.id, 'squad'), 'Wystaw na listę transferową');
  const s = it.run.steps[0];
  const r = handleTransferAction(g, s.act, { id: s.id, price: String(s.price) }, null);
  assert.equal(g.market.userListed[p.id], s.price);
  assert.equal(s.price % 10000, 0);
  assert.ok(r.save && it.run.toast === true);
});
