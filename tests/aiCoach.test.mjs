// AI trenera w trakcie meczu (docs/ai-trener.md): reakcje na przebieg gry, sposób gry rywala, siły i kartki,
// osobowość, histereza, determinizm i podpowiedzi asystenta. Scenariusze ustawiają stan meczu wprost
// (wynik, kartki, kondycja, strzały rywala w dzienniku zdarzeń), a AI widzi tylko to, co widać z ławki.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics } from '../src/engine/lineup.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { createMatch, step, resume, runToEnd, assistantSuggest, changeTactics } from '../src/engine/match/match.js';
import { fieldPlayers } from '../src/engine/match/teams.js';
import { seenTactics, flowView } from '../src/engine/match/coach.js';

const world = generateWorld(42);
const EK = CLUBS_PL.filter((c) => c.tier === 1);
const sq = Object.fromEntries(EK.map((c) => [c.id, squadOf(world, c.id)]));
const tac = Object.fromEntries(EK.map((c) => [c.id, createTactics(sq[c.id])]));
const withInstr = (id, ins = {}, extra = {}) => ({ ...tac[id], ...extra, instructions: { ...tac[id].instructions, ...ins } });
const side = (id, extra = {}) => ({ club: clubById(id), squad: sq[id], tactics: tac[id], ai: true, coach: clubById(id).coach, ...extra });
const until = (M, min) => { while (M.minute < min && !M.ended) { if (M.phase === 'break') resume(M); else step(M); } };
const toBreak = (M) => { while (M.phase !== 'break' && !M.ended) step(M); };
const DEF = new Set(['ŚO', 'BO', 'WB', 'DP']);
// Powody korekt z przebiegu meczu (nie z wyniku i nie z liczebności)
const FLOW_REASON = /rywal (przeważa|ma piłkę|pressuje|się cofnął|gra|rzuca|myli|strzela)|dostajemy kontry|groźne stałe|zmęczenie|kartkami|obrońca z kartką|dużo piłki|opanowaliśmy|środek pola/;
const tactics = (M, s, from = 0) => M.events.slice(from).filter((e) => e.type === 'tactic' && e.side === s);

/** Strzały rywala w ostatnich minutach (w dzienniku, tak jak widzi je ławka). */
function pressure(M, attacker, n = 6, { xg = 0.3, kind = 'POZ', span = 15 } = {}) {
  for (let i = 0; i < n; i++) M.events.push({ t: Math.max(1, M.tick - (i % span)), half: M.half, min: '', type: 'shotOff', side: attacker, pid: null, xg, kind });
}

test('Rywal przeważa przy 0:0: AI koryguje plan już w 1. połowie, z czytelnym powodem', () => {
  let changed = 0; const n = 20;
  for (let i = 0; i < n; i++) {
    const M = createMatch({ seed: `dom${i}`, home: side('piast', { coach: 'P' }), away: side('legia', { ai: false }), ctx: {} });
    until(M, 24); M.score = [0, 0]; pressure(M, 1);
    const from = M.events.length;
    until(M, 25);
    if (!tactics(M, 0, from).length) { until(M, 34); M.score = [0, 0]; pressure(M, 1); until(M, 35); }
    const t = tactics(M, 0, from).find((e) => FLOW_REASON.test(e.reason ?? ''));
    if (!t) continue;
    changed++;
    assert.ok(M.minute <= 35);
    const ins = t.patch.instructions ?? {};
    // Odpowiedź ma efekt w silniku: wyższy pressing, ostrożniejsze nastawienie albo niższa linia
    assert.ok(ins.pressing === 'high' || Number(ins.mentality) < 0 || ['mid', 'low'].includes(ins.line), JSON.stringify(t.patch));
    assert.match(t.text, /\(.+\)/, 'powód widoczny w relacji');
  }
  assert.ok(changed >= 12, `korekta w ${changed}/${n} meczach`);
});

test('Osobowość: ostrożny trener cofa się, ofensywny podnosi pressing; uparty reaguje rzadziej', () => {
  const by = { S: { mentality: 0, pressing: 0 }, O: { mentality: 0, pressing: 0 } };
  for (const coach of ['S', 'O']) {
    for (let i = 0; i < 24; i++) {
      const M = createMatch({ seed: `pers${coach}${i}`, home: side('korona', { coach }), away: side('lech', { ai: false }), ctx: {} });
      until(M, 24); M.score = [0, 0]; pressure(M, 1);
      const from = M.events.length;
      until(M, 25); until(M, 34); M.score = [0, 0]; pressure(M, 1); until(M, 35);
      for (const e of tactics(M, 0, from).filter((x) => /rywal przeważa/.test(x.reason ?? ''))) {
        if (Number(e.patch.instructions?.mentality) < 0) by[coach].mentality++;
        if (e.patch.instructions?.pressing === 'high') by[coach].pressing++;
      }
    }
  }
  assert.ok(by.S.mentality >= 8 && by.S.pressing === 0, JSON.stringify(by));
  assert.ok(by.O.pressing >= 8 && by.O.mentality === 0, JSON.stringify(by));
});

test('Rywal groźny z kontr: AI cofa linię obrony', () => {
  let lowered = 0;
  for (let i = 0; i < 16; i++) {
    const M = createMatch({ seed: `kon${i}`, home: side('jagiellonia', { coach: 'P', tactics: withInstr('jagiellonia', { line: 'high' }) }), away: side('rakow', { ai: false }), ctx: {} });
    until(M, 24); M.score = [0, 0]; pressure(M, 1, 6, { kind: 'KON' });
    const from = M.events.length;
    until(M, 25); until(M, 34); M.score = [0, 0]; pressure(M, 1, 6, { kind: 'KON' }); until(M, 35);
    if (tactics(M, 0, from).some((e) => /kontry/.test(e.reason ?? '') && e.patch.instructions?.line === 'mid')) lowered++;
  }
  assert.ok(lowered >= 10, `niżej linia w ${lowered}/16`);
});

test('Rywal pressuje wysoko: techniczna drużyna rozgrywa krótko, słabsza technicznie przestaje grać krótko', () => {
  const tecOf = (id) => createMatch({ seed: 't', home: side(id), away: side(id), ctx: {} }).teams[0].avg('TEC');
  const strong = EK.map((c) => c.id).sort((a, b) => tecOf(b) - tecOf(a))[0];
  const weak = EK.map((c) => c.id).sort((a, b) => tecOf(a) - tecOf(b))[0];
  assert.ok(tecOf(strong) >= 12.3 && tecOf(weak) < 12);
  let short = 0; let mixed = 0;
  for (let i = 0; i < 16; i++) {
    const opp = (id) => side(id === 'lech' ? 'legia' : 'lech', { ai: false, tactics: withInstr(id === 'lech' ? 'legia' : 'lech', { pressing: 'high' }) });
    const A = createMatch({ seed: `pr${i}`, home: side(strong, { coach: 'P' }), away: opp(strong), ctx: {} });
    toBreak(A); resume(A);
    const e = tactics(A, 0).find((x) => x.patch.instructions?.passing === 'short');
    if (e && /pressuje wysoko/.test(e.reason)) short++;
    const B = createMatch({ seed: `pr${i}`, home: side(weak, { coach: 'P', tactics: withInstr(weak, { passing: 'short' }) }), away: opp(weak), ctx: {} });
    toBreak(B); resume(B);
    if (tactics(B, 0).some((x) => x.patch.instructions?.passing === 'mixed' && /grajmy prościej/.test(x.reason))) mixed++;
  }
  assert.ok(short >= 11, `krótko przez pressing ${short}/16`);
  assert.ok(mixed >= 11, `prościej ${mixed}/16`);
});

test('Zmianę taktyki rywala trener rozpoznaje z opóźnieniem, nie od razu', () => {
  const M = createMatch({ seed: 'lag', home: side('legia', { ai: false }), away: side('lech', { coach: 'P' }), ctx: {} });
  until(M, 30);
  changeTactics(M, 0, { instructions: { pressing: 'high' } });
  until(M, 33);
  assert.equal(seenTactics(M, M.teams[0], 8).instr.pressing, 'mid');
  until(M, 38);
  assert.equal(seenTactics(M, M.teams[0], 8).instr.pressing, 'high');
  assert.ok(!tactics(M, 1).some((e) => /pressuje/.test(e.reason ?? '') && Number.parseInt(e.min, 10) < 36));
});

test('Zmęczenie: przy słabej kondycji AI zdejmuje wysoki pressing (nie w końcowej pogoni)', () => {
  let dropped = 0; let chaseKept = 0; let n = 0; let nc = 0;
  const tired = (M) => { for (const x of fieldPlayers(M.teams[0])) if (x.slot.pos !== 'BR') x.cond = 72; };
  for (let i = 0; i < 24; i++) {
    for (const chase of [false, true]) {
      const M = createMatch({ seed: `fat${i}`, home: side('motor', { coach: 'P', tactics: withInstr('motor', { pressing: 'high' }) }), away: side('cracovia', { ai: false }), ctx: {} });
      until(M, chase ? 79 : 54);
      if (M.events.some((e) => e.type === 'red') || M.teams[0].tactics.instructions.pressing !== 'high') continue; // osłabienie ma własne reguły
      M.score = chase ? [0, 1] : [0, 0];
      tired(M);
      const from = M.events.length;
      until(M, chase ? 80 : 55);
      if (!chase) { M.score = [0, 0]; tired(M); until(M, 60); }
      const ev = tactics(M, 0, from);
      if (!chase) { n++; if (ev.some((e) => e.patch.instructions?.pressing === 'mid' && /zmęczenie/.test(e.reason))) dropped++; }
      if (chase && M.score[0] >= M.score[1]) continue; // wyrównanie w tej minucie: to już nie pogoń
      if (chase) { nc++; if (M.teams[0].tactics.instructions.pressing === 'high') chaseKept++; }
    }
  }
  assert.ok(n >= 12 && dropped >= 0.7 * n, `niższy pressing ${dropped}/${n}`);
  assert.equal(chaseKept, nc, 'w pogoni w końcówce pressing zostaje wysoki');
});

test('Kilku obrońców z żółtymi: AI każe grać ostrożniej w odbiorze', () => {
  let soft = 0;
  for (let i = 0; i < 16; i++) {
    const M = createMatch({ seed: `yc${i}`, home: side('wisla-plock', { coach: 'P' }), away: side('slask', { ai: false }), ctx: {} });
    until(M, 24);
    fieldPlayers(M.teams[0]).filter((x) => DEF.has(x.slot.pos)).slice(0, 2).forEach((x) => { x.yc = 1; });
    until(M, 36);
    if (tactics(M, 0).some((e) => e.patch.instructions?.tackling === 'soft' && /kartkami/.test(e.reason))) soft++;
  }
  assert.ok(soft >= 10, `ostrożniej w odbiorze ${soft}/16`);
});

test('Przegrany środek pola: w przerwie AI dokłada środkowego pomocnika (gdy zawodnicy pasują)', () => {
  let shaped = 0;
  for (let i = 0; i < 16; i++) {
    const M = createMatch({ seed: `mid${i}`, home: side('lech', { ai: false, tactics: createTactics(sq.lech, { formation: '4321' }) }), away: side('rakow', { coach: 'P' }), ctx: {} });
    toBreak(M);
    for (let t = 0; t < M.possession.length; t++) M.possession[t] = 0.66;
    pressure(M, 0, 4, { span: 40 });
    resume(M);
    if (tactics(M, 1).some((e) => e.atBreak && /środek pola/.test(e.reason ?? '') && e.patch.formation === '442d')) shaped++;
  }
  assert.ok(shaped >= 7, `dodatkowy środkowy ${shaped}/16`);
});

test('Bez przestawiania tam i z powrotem: korekty z przebiegu meczu ograniczone i co najmniej 10 minut po poprzedniej zmianie', () => {
  let flowTotal = 0; let teams = 0;
  for (let i = 0; i < 600; i++) {
    const M = createMatch({ seed: `flap${i}`, home: side(EK[i % 18].id), away: side(EK[(i * 7 + 3) % 18 === i % 18 ? (i + 1) % 18 : (i * 7 + 3) % 18].id), ctx: { weather: i % 4 === 0 ? { fat: 1.3, tempC: 33 } : {} } });
    runToEnd(M);
    for (const s of [0, 1]) {
      teams++;
      const ev = tactics(M, s);
      assert.ok(ev.length <= 9, `mecz ${i}: ${ev.length} zmian taktyki`);
      const flow = ev.filter((e) => FLOW_REASON.test(e.reason ?? ''));
      flowTotal += flow.length;
      assert.ok(flow.length <= 5, `mecz ${i}: ${flow.length} korekt z przebiegu`);
      for (const e of flow) {
        const prev = ev[ev.indexOf(e) - 1];
        if (prev && !e.atBreak && !prev.atBreak) assert.ok(e.t - prev.t >= 10, `mecz ${i}: korekta ${e.t - prev.t} min po poprzedniej`);
      }
      // Ta sama instrukcja nie wraca do poprzedniej wartości z przebiegu meczu w mniej niż 15 minut
      const last = {};
      for (const e of flow) {
        for (const [k, v] of Object.entries(e.patch.instructions ?? {})) {
          if (last[k] && last[k].prev === v) assert.ok(e.t - last[k].t >= 15, `mecz ${i}: ${k} wraca po ${e.t - last[k].t} min`);
          last[k] = { prev: last[k]?.v ?? null, v, t: e.t };
        }
      }
    }
  }
  const avg = flowTotal / teams;
  assert.ok(avg > 0.2 && avg < 1.5, `korekty z przebiegu na drużynę ${avg}`);
});

test('Determinizm: to samo ziarno daje te same decyzje trenera', () => {
  const run = () => {
    const M = createMatch({ seed: 'det-ai', home: side('legia'), away: side('wisla-krakow'), ctx: {} });
    runToEnd(M);
    return JSON.stringify(M.events.filter((e) => ['tactic', 'shout', 'sub'].includes(e.type)));
  };
  assert.equal(run(), run());
});

test('Okrzyki AI: te same zasady co u gracza (przerwa 8 min, „Brawo” najwyżej 2 razy)', () => {
  let shouts = 0;
  for (let i = 0; i < 300; i++) {
    const M = createMatch({ seed: `sh${i}`, home: side(EK[i % 18].id), away: side(EK[(i + 5) % 18].id), ctx: {} });
    runToEnd(M);
    for (const s of [0, 1]) {
      const ev = M.events.filter((e) => e.type === 'shout' && e.side === s);
      shouts += ev.length;
      for (let k = 1; k < ev.length; k++) assert.ok(ev[k].t - ev[k - 1].t >= 8, `mecz ${i}: okrzyki co ${ev[k].t - ev[k - 1].t} min`);
      assert.ok(ev.filter((e) => e.shout === 'brawo').length <= 2);
      const banned = M.events.find((e) => e.type === 'staffCard' && e.side === s && e.card === 'red');
      if (banned) assert.ok(!ev.some((e) => e.t > banned.t), `mecz ${i}: okrzyk po odesłaniu trenera`);
    }
  }
  assert.ok(shouts / 600 > 0.3 && shouts / 600 < 2.5, `okrzyki na drużynę ${shouts / 600}`);
});

test('Podpowiedź asystenta korzysta z tej samej oceny: pressing rywala, kartki; bez zmiany meczu', () => {
  const M = createMatch({ seed: 'adv', home: side('legia', { ai: false }), away: side('lech', { ai: false }), ctx: {} });
  until(M, 10);
  changeTactics(M, 1, { instructions: { pressing: 'high' } });
  until(M, 30);
  fieldPlayers(M.teams[0]).filter((x) => DEF.has(x.slot.pos)).slice(0, 2).forEach((x) => { x.yc = 1; });
  const before = { ev: M.events.length, rng: JSON.stringify(M.rng), S: M.teams[0].S, ins: JSON.stringify(M.teams[0].tactics) };
  const advice = assistantSuggest(M, 0);
  assert.equal(M.events.length, before.ev);
  assert.equal(JSON.stringify(M.rng), before.rng);
  assert.equal(M.teams[0].S, before.S);
  assert.equal(JSON.stringify(M.teams[0].tactics), before.ins);
  const t = advice.find((a) => a.type === 'tactic');
  assert.ok(t, 'jest propozycja taktyki');
  assert.equal(t.patch.instructions.tackling, 'soft');
  assert.equal(t.patch.instructions.passing, 'short');
  assert.match(t.reason, /kartkami/);
  assert.match(t.reason, /pressuje wysoko/);
  // Obraz meczu z ławki: liczniki widoczne dla trenera
  const v = flowView(M, 0, 30);
  assert.ok(v.span === 30 && v.psF > 0 && v.poss > 0 && v.poss < 1);
});

test('„Pokaż wynik”: asystent gracza korzysta z tych samych korekt co AI rywala', () => {
  let seen = 0;
  for (let i = 0; i < 12; i++) {
    const M = createMatch({ seed: `as${i}`, home: side('legia', { ai: false }), away: side('lech', { ai: false, tactics: withInstr('lech', { pressing: 'high' }) }), ctx: {} });
    until(M, 5);
    runToEnd(M, { assistantFor: [0] });
    if (tactics(M, 0).some((e) => e.by === 'assistant' && /pressuje wysoko/.test(e.reason ?? ''))) seen++;
  }
  assert.ok(seen >= 7, `asystent rozpoznał pressing w ${seen}/12`);
});
