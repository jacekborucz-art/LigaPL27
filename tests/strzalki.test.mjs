// Strzałki ruchu (docs/strzalki-ruchu.md): dozwolone kierunki, walidacja par, znaczenie względem strony zawodnika,
// niezmienione q i u 7 instrukcji (losowania lat po dotychczasowych), kara za kilku obrońców do przodu,
// środek pola (T.central) i A/B każdego kierunku (zysk i mierzalny koszt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sq, ARROW_GROUPS, abRunArrow, abArrowDiff } from './piHelpers.mjs';
import { createMatch, step, changeTactics, checkTacticPatch } from '../src/engine/match/match.js';
import { fieldPlayers } from '../src/engine/match/teams.js';
import { teamShift, PI } from '../src/engine/match/playerInstr.js';
import { PLAYER_INSTRUCTIONS, ARROW_POS, arrowsFor, arrowOf, arrowToInstr, arrowAllowed, cleanPlayerInstr, piAllowed, PI_IDS } from '../src/data/playerInstructions.js';
import { createTactics } from '../src/engine/lineup.js';
import { formationById } from '../src/data/formations.js';
import { clubById } from '../src/data/clubs_pl.js';
import { Rng } from '../src/core/rng.js';

const tacF = (club, formation) => createTactics(sq[club], { formation });
const match = (t, pim, seed = 'arr') => createMatch({ seed, home: { club: clubById('legia'), squad: sq.legia, tactics: { ...t, playerInstr: pim }, ai: false }, away: { club: clubById('lech'), squad: sq.lech, tactics: createTactics(sq.lech), ai: false }, ctx: {} });
const idsAt = (t, pos) => { const f = formationById(t.formation); return t.xi.filter((id, i) => f.slots[i].pos === pos); };
const xOf = (M, id) => M.teams[0].players.find((x) => x.id === id);

test('Dozwolone kierunki na pozycjach jak w projekcie; kierunek z run i lat i z powrotem', () => {
  const exp = {
    BR: [], ŚO: [], BO: ['f', 'fi', 'i', 'b'], WB: ['f', 'fi', 'fo', 'i', 'b'], DP: ['f', 'b'], ŚP: ['f', 'fi', 'fo', 'i', 'o', 'b'],
    OP: ['f', 'fo', 'o', 'b'], BP: ['f', 'fi', 'i', 'o', 'b'], SN: ['f', 'fi', 'i', 'o', 'b'], NAP: ['f', 'o', 'b'],
  };
  for (const [pos, dirs] of Object.entries(exp)) assert.deepEqual(arrowsFor(pos), dirs, pos);
  assert.equal(Object.keys(ARROW_POS).length, 8);
  for (const d of ['f', 'fi', 'fo', 'i', 'o', 'b']) assert.equal(arrowOf(arrowToInstr(d)), d);
  assert.equal(arrowOf({ run: -1, lat: 1 }), null, 'cofnięcie w bok: poza 6 kierunkami');
  assert.equal(arrowOf({}), null);
  assert.deepEqual(arrowToInstr(null), { run: 0, lat: 0 });
  assert.ok(piAllowed('run', 'NAP') && piAllowed('run', 'OP') && piAllowed('run', 'SN') && !piAllowed('run', 'ŚO'));
  assert.equal(PI_IDS.length, 7, 'lat tylko ze strzałki: tabela zostaje z 7 instrukcjami');
  assert.ok(!PLAYER_INSTRUCTIONS.some((d) => d.id === 'lat'));
  assert.deepEqual(cleanPlayerInstr({ run: 1, lat: -1, lat2: 1 }), { run: 1, lat: -1 }, 'lat zapisuje się w taktyce');
});

test('Walidacja zmiany w meczu: para dozwolona na pozycji albo miejscu, scalenie z obecnym ruchem', () => {
  const t = tacF('legia', '442');
  const M = match(t, {});
  while (M.minute < 10) step(M);
  const T = M.teams[0];
  const nap = fieldPlayers(T).find((x) => x.slot.pos === 'NAP' && x.p.pos === 'NAP');
  const bo = fieldPlayers(T).find((x) => x.slot.pos === 'BO' && x.p.pos === 'BO');
  assert.match(checkTacticPatch(M, 0, { playerInstr: { [nap.id]: { lat: -1 } } }), /Ruch: ten kierunek/);
  assert.equal(checkTacticPatch(M, 0, { playerInstr: { [nap.id]: { run: -1 } } }), null, 'fałszywa dziewiątka');
  assert.equal(checkTacticPatch(M, 0, { playerInstr: { [bo.id]: { run: 1, lat: -1 } } }), null, 'underlap');
  assert.ok(changeTactics(M, 0, { playerInstr: { [bo.id]: { run: -1 } } }).ok);
  assert.match(checkTacticPatch(M, 0, { playerInstr: { [bo.id]: { lat: 1 } } }), /Ruch/, 'boczny obrońca: bez ruchu na zewnątrz');
  const r = changeTactics(M, 0, { playerInstr: { [bo.id]: { run: 1, lat: -1 } } });
  assert.ok(r.ok);
  assert.match(M.events.at(-1).text, /ruch: skos do środka/);
  assert.deepEqual(T.tactics.playerInstr[bo.id], { run: 1, lat: -1 });
});

test('Para niedozwolona na nowej pozycji jest ignorowana w całości; znaczenie względem strony zawodnika', () => {
  const t = tacF('legia', '442');
  const [lb, rb] = idsAt(t, 'BO');
  // Ci sami boczni obrońcy z obu stron: do środka działa tak samo (DEF -> MID, środek pola +)
  const M = match(t, { [lb]: { lat: -1 }, [rb]: { lat: -1 } });
  step(M);
  const a = xOf(M, lb); const b = xOf(M, rb);
  assert.ok(a.slot.x < 50 && b.slot.x > 50, 'lewy i prawy');
  for (const x of [a, b]) {
    assert.equal(x.pi.dir, 'i');
    assert.deepEqual(x.pi.moves.map((m) => m.slice(0, 2)), [['DEF', 'MID']]);
    assert.ok(x.pi.cen > 0);
  }
  assert.ok(M.teams[0].piCen > 0);
  // Skos na zewnątrz bocznego obrońcy przeniesiony na skrzydło (BP nie ma tego kierunku): run i lat bez skutku
  const [lw] = idsAt(t, 'BP');
  const M2 = match(t, { [lw]: { run: 1, lat: 1 } });
  step(M2);
  assert.equal(xOf(M2, lw).pi, null);
  assert.ok(!arrowAllowed('BP', 'fo'));
});

test('Losowania lat po dotychczasowych: q i u 7 instrukcji bez zmian (strumień jak przed strzałkami)', () => {
  const t = tacF('legia', '442');
  const ids = [...idsAt(t, 'BO'), ...idsAt(t, 'BP'), ...idsAt(t, 'ŚP')];
  const base = Object.fromEntries(ids.map((id) => [id, { run: 1, tackle: 1, press: -1, pass: -1 }]));
  const withLat = Object.fromEntries(ids.map((id) => [id, { ...base[id], lat: -1 }]));
  for (const seed of ['qu1', 'qu2', 'qu3']) {
    const A = match(t, base, seed); const B = match(t, withLat, seed);
    step(A); step(B);
    for (const id of ids) {
      const ra = A.teams[0].piReport[id]; const rb = B.teams[0].piReport[id];
      for (const k of ['run', 'tackle', 'press', 'pass']) assert.deepEqual(rb[k], ra[k], `${seed} ${id} ${k}`);
      assert.ok(rb.lat && !ra.lat, 'lat ma własną jakość');
      // Dokładnie kolejność losowań sprzed strzałek: 7 x gauss, potem 7 x 2 x next
      const r = new Rng(`pi:${seed}:0:${id}`);
      const d = xOf(B, id).piDraw;
      for (const def of PLAYER_INSTRUCTIONS) assert.equal(d.noise[def.id], r.gauss(0, 1));
      for (const def of PLAYER_INSTRUCTIONS) assert.deepEqual(d.conf[def.id], [r.next(), r.next()]);
      assert.equal(d.noise.lat, r.gauss(0, 1), 'lat na końcu');
    }
  }
});

test('Łączenie: dwóch bocznych obrońców do przodu bez asekuracji zwiększa podatność na kontrę', () => {
  const t = tacF('legia', '442');
  const [lb, rb] = idsAt(t, 'BO');
  const shiftOf = (pim) => { const M = match(t, pim); step(M); const T = M.teams[0]; return { T, plain: teamShift(T.players.flatMap((x) => x.pi?.devs ?? [])) }; };
  const both = shiftOf({ [lb]: { run: 1 }, [rb]: { run: 1, lat: -1 } });
  assert.ok(Math.abs(both.T.piShift.mul.counterVulnMul - both.plain.mul.counterVulnMul * (1 + PI.arrow.pairPen)) < 1e-12, 'kara x(1 + 0,06)');
  const covered = shiftOf({ [lb]: { run: 1 }, [rb]: { lat: -1 } });
  assert.equal(covered.T.piShift.mul.counterVulnMul, covered.plain.mul.counterVulnMul, 'drugi do środka: bez kary');
  const one = shiftOf({ [lb]: { run: 1 } });
  assert.equal(one.T.piShift.mul.counterVulnMul, one.plain.mul.counterVulnMul, 'jeden: bez kary');
});

test('Środek pola: do środka podnosi T.central, szeroko obniża, od trzeciego zawodnika do środka mniej', () => {
  const t = tacF('legia', '433');
  const sp = idsAt(t, 'ŚP'); const sn = idsAt(t, 'SN');
  const cen = (pim) => { const M = match(t, pim); step(M); return M.teams[0].central; };
  const c0 = cen({});
  const c2 = cen({ [sp[0]]: { lat: -1 }, [sp[1]]: { lat: -1 } });
  const c4 = cen({ [sp[0]]: { lat: -1 }, [sp[1]]: { lat: -1 }, [sn[0]]: { lat: -1 }, [sn[1]]: { lat: -1 } });
  const cw = cen({ [sp[0]]: { lat: 1 } });
  assert.ok(c2 > c0 && c4 > c2 && cw < c0, `${c0} ${c2} ${c4} ${cw}`);
  assert.ok(c4 - c2 < c2 - c0, 'malejący zysk');
});

test('A/B każdego kierunku na każdej pozycji (300 meczów): jest zysk i mierzalny koszt', () => {
  const N = 300;
  // Koszt i zysk: zmiana średniej na mecz wyraźnie ponad szum (te same ziarna)
  const cost = (d) => d.shA > 0.15 || d.konA > 0.1 || d.skrA > 0.1 || d.condI < -0.7 || d.poss < -0.3 || d.sh < -0.2 || d.kpI < -0.15 || d.shI < -0.2;
  const gain = (d) => d.poss > 0.3 || d.sh > 0.2 || d.shA < -0.15 || d.konA < -0.1 || d.skr > 0.15 || d.kpI > 0.15 || d.shI > 0.15 || d.condI > 0.7 || d.kon > 0.1;
  const res = {};
  for (const [g, G] of Object.entries(ARROW_GROUPS)) {
    const base = abRunArrow(N, g, null);
    for (const dir of arrowsFor(G.pos[0])) {
      const d = abArrowDiff(base, abRunArrow(N, g, dir));
      res[`${g}:${dir}`] = d;
      const txt = JSON.stringify(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Math.round(v * 100) / 100])));
      assert.ok(cost(d), `${g}:${dir} bez kosztu: ${txt}`);
      assert.ok(gain(d), `${g}:${dir} bez zysku: ${txt}`);
    }
  }
  // Kierunki zgodne z piłką (najważniejsze skutki)
  const r = res;
  assert.ok(r['BO:i'].poss > 0.8 && r['BO:i'].skrA > 0.15, 'odwrócony boczny obrońca: posiadanie, ale dośrodkowania rywala');
  assert.ok(r['WB:fo'].skr > 0.2 && r['WB:fo'].konA > 0.1 && r['WB:fo'].condI < -1.5, 'wahadłowy na zewnątrz (trójka obrońców): dośrodkowania, kontry rywala, zmęczenie');
  assert.ok(r['ŚP:o'].skr > 0.2 && r['ŚP:o'].poss < -0.4, 'szeroko: dośrodkowania kosztem posiadania');
  assert.ok(r['SN:i'].shI > 0.4 && r['SN:i'].kpI < -0.1, 'skrzydłowy do środka: strzela, mniej wrzutek');
  assert.ok(r['NAP:b'].shI < -0.5 && r['NAP:b'].poss > 0.8 && r['NAP:b'].kpI > 0.1, 'fałszywa dziewiątka');
  assert.ok(r['DP:b'].sh < -0.3 && r['DP:b'].condI > 0.7, 'DP opada: mniej ludzi w ataku');
  assert.ok(r['BO:f'].konA > 0.1 && r['BO:f'].sh > 0.2, 'do przodu jak Pozycja');
});
