// Kadra > Skład i taktyka (src/ui/tacticsView.js): podświetlenie zmienników (data-rep) z biegłości jak w mapie pozycji
// (positionMap.js, profBand: 85, 70, 50), niedostępni jako „no”, bez wyboru brak podświetlenia; układ PC (wide)
// ze zwijaną siłą składu i pływającą kartą, telefon bez tych elementów.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics } from '../src/engine/lineup.js';
import { formationById } from '../src/data/formations.js';
import { proficiency } from '../src/engine/positions.js';
import { profBand } from '../src/ui/positionMap.js';
import { renderTactics, repLevel } from '../src/ui/tacticsView.js';

const world = generateWorld(3);
const squad = squadOf(world, 'legia').map((p) => ({ ...p }));
const tactics = createTactics(squad, { benchSize: 9 });
const f = formationById(tactics.formation);
const byId = new Map(squad.map((p) => [p.id, p]));
const view = (o = {}) => renderTactics({ squad, tactics, sel: null, benchSize: 9, ...o });
const expected = (p, s) => (p.injuryDays > 0 || p.suspended > 0 || p.callUp || p.loanBlock || p.teamBlock || p.transfer?.hold ? 'no' : profBand(Math.round(proficiency(p, s.pos, s.side))));
/** data-rep wierszy list: Map(data-drop -> poziom). */
function rowReps(html) {
  const m = new Map();
  for (const [, drop, rep] of html.matchAll(/<li class="tp-row[^"]*" data-drop="([^"]+)"(?: data-pid="[^"]+")?(?: data-rep="(\w+)")?>/g)) m.set(drop, rep ?? null);
  return m;
}
const slotReps = (html) => [...html.matchAll(/<button class="slot-btn[^"]*"[^>]*?data-loc="(xi:\d+)"[^>]*?(?:data-rep="(\w+)")?\s+aria-pressed/g)].map(([, loc, rep]) => [loc, rep ?? null]);

test('Bez wyboru: żaden wiersz ani slot nie ma data-rep', () => {
  const html = view();
  assert.doesNotMatch(html, /data-rep=/);
  assert.doesNotMatch(html, /class="tp-rep"/);
});

test('Wybrany zawodnik z XI: ławka, spoza kadry i reszta XI dostają poziom biegłości na pozycji i stronie slotu', () => {
  const idx = f.slots.findIndex((s) => s.pos === 'ŚO');
  const s = f.slots[idx];
  const html = view({ sel: { zone: 'xi', idx } });
  const reps = rowReps(html);
  tactics.bench.forEach((id, i) => assert.equal(reps.get(`bench:${i}`), expected(byId.get(id), s), `ławka ${i}`));
  const out = squad.filter((p) => !tactics.xi.includes(p.id) && !tactics.bench.includes(p.id));
  assert.ok(out.length > 0);
  for (const p of out) assert.equal(reps.get(`out:${p.id}`), expected(p, s), `spoza kadry ${p.name}`);
  tactics.xi.forEach((id, i) => assert.equal(reps.get(`xi:${i}`), i === idx ? null : expected(byId.get(id), s), `XI ${i}`));
  // poziomy z odznakami i liczba w komunikacie
  const levels = [...reps.values()];
  for (const l of levels) assert.ok(l === null || ['opt', 'ok', 'weak', 'no'].includes(l));
  assert.match(html, /Pasuje: \d+, da radę: \d+, słabo: \d+\./);
  if (levels.includes('opt')) assert.match(html, /class="tp-rep">(Naturalny|Pasuje)</);
});

test('Wybrany zawodnik z ławki: sloty XI (token i wiersz) dostają poziom tego zawodnika na każdym slocie', () => {
  const p = byId.get(tactics.bench[0]);
  const html = view({ sel: { zone: 'bench', idx: 0 } });
  const reps = rowReps(html);
  f.slots.forEach((s, i) => assert.equal(reps.get(`xi:${i}`), expected(p, s), `wiersz XI ${i}`));
  const slots = slotReps(html);
  assert.equal(slots.length, f.slots.length);
  slots.forEach(([loc, rep]) => { const i = Number(loc.slice(3)); assert.equal(rep, expected(p, f.slots[i]), `token ${loc}`); });
  // ławka i spoza kadry bez poziomu (inne miejsca nie są zmiennikami wybranego)
  tactics.bench.forEach((_, i) => assert.equal(reps.get(`bench:${i}`), null));
});

test('Niedostępny zawodnik (kontuzja) jest zawsze „no”, bez odznaki; progi 85, 70, 50', () => {
  const idx = 0;
  const benchId = tactics.bench[1];
  const hurt = byId.get(benchId);
  const saved = hurt.injuryDays;
  hurt.injuryDays = 12;
  try {
    const html = view({ sel: { zone: 'xi', idx } });
    assert.equal(rowReps(html).get('bench:1'), 'no');
    assert.equal(repLevel(hurt, f.slots[idx]).b, 'no');
  } finally { hurt.injuryDays = saved; }
  const p = { pos: 'ŚO', side: null };
  assert.deepEqual(repLevel(p, { pos: 'ŚO', side: null }), { b: 'opt', v: 100, nat: true });
  assert.equal(profBand(85), 'opt'); assert.equal(profBand(84), 'ok'); assert.equal(profBand(70), 'ok');
  assert.equal(profBand(69), 'weak'); assert.equal(profBand(50), 'weak'); assert.equal(profBand(49), 'no');
});

test('Telefon bez zmian układu: bez przycisku zwijania i bez paska karty; PC: bez panelu siły składu, pływająca karta', () => {
  const pid = tactics.xi[3];
  const phone = view({ info: pid });
  assert.doesNotMatch(phone, /data-act="tstrength"/);
  assert.doesNotMatch(phone, /tcard/);
  assert.match(phone, /<h3>Siła składu<\/h3>/);
  assert.match(phone, /<dialog class="tdet" open/);
  const pc = view({ wide: true, strengthOpen: false, cards: [{ id: pid, pinned: true, slot: 0 }, { id: tactics.bench[0], pinned: false, slot: 1 }] });
  assert.doesNotMatch(pc, /Siła składu/); // PC: panel usunięty (Nov 17, 2026), telefon go zachowuje
  assert.doesNotMatch(pc, /data-act="tstrength"/);
  assert.equal((pc.match(/<dialog class="tdet tcard"/g) ?? []).length, 2);
  assert.match(pc, /data-act="tcardpin" data-id="[^"]+" aria-pressed="true"/);
  assert.match(pc, /data-act="tinfoclose" data-id="/);
  // bez pauzy em w nowych tekstach
  for (const h of [phone, pc]) assert.ok(!h.includes(String.fromCharCode(8212)));
});

test('Przycisk „Poproś asystenta”: aktywny z asystentem w sztabie, wyłączony bez niego', () => {
  const withA = view({});
  assert.match(withA, /<summary class="btn btn--quiet">Poproś asystenta</);
  for (const m of ['best', 'second', 'young', 'fresh', 'minutes']) assert.match(withA, new RegExp(`data-act="tauto" data-mode="${m}"`));
  const noA = view({ assistant: false });
  assert.match(noA, /data-act="tauto" disabled[^>]*>Poproś asystenta</);
  assert.doesNotMatch(noA, /data-mode=/);
  assert.match(noA, /Brak asystenta trenera w sztabie/);
});

test('Prośby do asystenta: drugi skład, najmłodsi, najświeżsi, najmniej grający', () => {
  const sq = squad.map((p) => ({ ...p }));
  const best = createTactics(sq, { benchSize: 9 }).xi;
  const pick = (mode, s = sq) => createTactics(s, { benchSize: 9, mode }).xi;
  const avg = (xi, fn, s = sq) => xi.map((id) => fn(s.find((p) => p.id === id))).reduce((a, b) => a + b, 0) / xi.length;
  const second = pick('second');
  assert.ok(second.filter((id) => best.includes(id)).length <= 3, 'drugi skład prawie bez podstawowych');
  assert.ok(avg(pick('young'), (p) => p.age) < avg(best, (p) => p.age) - 1, 'młodsza jedenastka');
  const tired = sq.map((p, i) => ({ ...p, fresh: i % 2 ? 100 : 70 }));
  assert.ok(avg(pick('fresh', tired), (p) => p.fresh, tired) > avg(createTactics(tired, { benchSize: 9 }).xi, (p) => p.fresh, tired));
  const played = sq.map((p) => ({ ...p, season: { ...(p.season ?? {}), min: best.includes(p.id) ? 900 : 0 } }));
  assert.ok(pick('minutes', played).filter((id) => best.includes(id)).length <= 3, 'najmniej grający zamiast podstawowych');
  for (const m of ['second', 'young', 'fresh', 'minutes']) assert.equal(new Set(pick(m)).size, 11, `${m}: 11 różnych zawodników`);
});

test('Sparing: ławka pokazuje także rezerwowych dobranych automatycznie, licznik wg pełnego limitu; bez nich jak dotąd', () => {
  const extra = squad.filter((p) => !tactics.xi.includes(p.id) && !tactics.bench.includes(p.id)).slice(0, 5).map((p) => p.id);
  const html = view({ benchExtra: extra, benchMax: 14 });
  assert.equal([...html.matchAll(/class="tp-row tp-row--auto"/g)].length, 5, 'wszyscy dodatkowi rezerwowi na ławce');
  assert.match(html, new RegExp(`${tactics.bench.length + 5} z 14`));
  const outPart = html.slice(html.indexOf('id="tp-h-out"'));
  for (const id of extra) assert.doesNotMatch(outPart, new RegExp(`data-pid="${id}"`), 'nie są też poza kadrą');
  const plain = view();
  assert.doesNotMatch(plain, /tp-row--auto/);
  assert.match(plain, new RegExp(`${tactics.bench.length} z 9`));
});
