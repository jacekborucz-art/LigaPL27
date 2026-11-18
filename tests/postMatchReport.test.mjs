// Analiza pomeczowa sztabu (src/career/postMatchReport.js, src/ui/postMatchView.js, docs/analiza-pomeczowa.md):
// reguły na syntetycznych wynikach, jakość sztabu a dokładność (deterministycznie), brak ukrytych wartości w tekście,
// brak pustych wartości i pauz, archiwum (limit i migracja), sparing bez analizy, wiadomość z przyciskami, pełny mecz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { statsFromEvents } from '../src/engine/matchStats.js';
import {
  MREP, RULES, analyzeMatch, reportText, reportMail, recordMatchReport, ensureMatchReports, matchReportList, recurringProblems, rivalReport,
  analysisSkills, wantsReport,
} from '../src/career/postMatchReport.js';
import { renderMatchAnalysis, analysesBadge, matchReportMailFoot } from '../src/ui/postMatchView.js';
import { renderTactics } from '../src/ui/tacticsView.js';

const BAD_TEXT = /undefined|NaN|\bnull\b|\[object|\u2014/;
const CLUB = 'legia';
const OPP = 'rakow';
const HIDDEN_Z = 13.7; // zaangażowanie zawodnika (ukryte): nie może trafić do raportu

function staff(q, { analyst = true, gk = true } = {}) {
  return {
    asystent: { name: 'Adam Asystent', q }, analityk: analyst ? { name: 'Jan Analityk', q } : { name: null, q: 2, vacant: true },
    bramkarze: gk ? { name: 'Piotr Bramkarski', q } : { name: null, q: 3, vacant: true }, fizyczny: { name: 'F F', q }, mlodziez: { name: 'M M', q }, kierownik: { name: 'K K', q },
  };
}

function players() {
  const pos = ['BR', 'ŚO', 'ŚO', 'BO', 'BO', 'DP', 'ŚP', 'ŚP', 'SN', 'SN', 'NAP', 'NAP', 'ŚP'];
  const out = {};
  pos.forEach((p, i) => { out[`${CLUB}-${i + 1}`] = { id: `${CLUB}-${i + 1}`, name: `Imię Nazwisko${i + 1}`, last: `Nazwisko${i + 1}`, pos: p, clubId: CLUB }; });
  return out;
}

function newGame(q = 18, opts = {}, seed = 7) {
  const g = { seed, clubId: CLUB, date: '2026-08-01', inbox: [], world: { players: players(), clubs: {} }, fixtures: [], training: { staff: { [CLUB]: staff(q, opts) } } };
  return g;
}

let fid = 0;
function fixture(g, { home = true, comp = 'ekstraklasa', opp = OPP, date = '2026-08-01' } = {}) {
  const f = { id: `test-${++fid}`, comp, round: 3, date, home: home ? CLUB : opp, away: home ? opp : CLUB, played: true };
  g.fixtures.push(f);
  return f;
}

/**
 * Wynik meczu w formacie result(M): zdarzenia z minutami, statystyki z dziennika (statsFromEvents), oceny.
 * spec.us / spec.them: { shots: [[min, xg, 'goal'|'on'|'off', pid?]], fouls, yellows, corners, offsides, passes: [ok, fail] },
 * spec.reds: [[min, 'us'|'them', pid]], spec.ratings: nadpisania ocen naszych zawodników.
 */
function result(f, spec) {
  const us = f.home === CLUB ? 0 : 1;
  const sideOf = (who) => (who === 'us' ? us : 1 - us);
  const events = []; let t = 0;
  const e = (type, who, min, extra = {}) => events.push({ t: t++, half: min > 45 ? 2 : 1, min: `${min}'`, type, side: sideOf(who), pid: null, ...extra });
  const score = [0, 0];
  for (const who of ['us', 'them']) {
    const s = spec[who] ?? {};
    for (const [min, xg, kind, pid] of s.shots ?? []) {
      if (kind === 'goal') { score[sideOf(who)]++; e('goal', who, min, { xg, how: 'RUC', pid: pid ?? null }); } else e(kind === 'on' ? 'shotOn' : 'shotOff', who, min, { xg, pid: pid ?? null });
    }
    for (let i = 0; i < (s.fouls ?? 10); i++) e('foul', who, 10 + i);
    for (let i = 0; i < (s.yellows ?? 1); i++) e('yellow', who, 20 + i);
    for (let i = 0; i < (s.corners ?? 4); i++) e('corner', who, 30 + i);
    for (let i = 0; i < (s.offsides ?? 1); i++) e('offside', who, 40 + i);
    const [ok, fail] = s.passes ?? [400, 80];
    events.push({ t: t++, type: 'pass', side: sideOf(who), count: ok, min: "1'" }, { t: t++, type: 'passFail', side: sideOf(who), count: fail, min: "1'" });
  }
  for (const [min, who, pid] of spec.reds ?? []) e('red', who, min, { pid: pid ?? null, reasonCode: 'sfp' });
  for (let m = 1; m <= 90; m++) events.push({ type: 'possessionMinute', side: 0, share: (spec.possHome ?? 50) / 100, min: `${m}'` });
  const stats = statsFromEvents(events);
  const ids = Object.keys(players());
  const ratings = ids.map((id, i) => ({
    id, side: us, name: `Imię Nazwisko${i + 1}`, pos: players()[id].pos, minutes: i < 11 ? 90 : i === 11 ? 30 : 0, rating: 6.5, g: 0, a: 0, sh: 0, sot: 0, kp: 1, tk: 2,
    saves: i === 0 ? 3 : 0, fouls: 1, yc: 0, rc: 0, cond: 80, Z: HIDDEN_Z, injury: null, ...(spec.ratings?.[id] ?? {}),
  })).filter((x) => x.minutes > 0);
  if (spec.subIn) events.push({ t: t++, min: `${spec.subIn[0]}'`, type: 'sub', side: us, pid: spec.subIn[1], inId: spec.subIn[1], outId: ids[10] });
  return { score, halfTimeScore: [0, 0], extraTime: false, shootout: null, abandoned: null, stats, ratings, events };
}

/** 1:2 u siebie przy xG 1,8 do 0,9: 12 strzałów, 2 celne (w tym gol). */
function unluckyLoss(g) {
  const f = fixture(g);
  const shots = [[10, 0.5, 'goal', `${CLUB}-11`], [20, 0.3, 'on'], ...[0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1].map((x, i) => [25 + 5 * i, x, 'off'])];
  const r = result(f, { us: { shots }, them: { shots: [[30, 0.4, 'goal'], [70, 0.3, 'goal'], [80, 0.2, 'off']] }, possHome: 55 });
  return { f, r };
}

test('Reguły: 1:2 przy xG 1,8 do 0,9 daje „skuteczność” źle i werdykt niezasłużona porażka (dobry analityk)', () => {
  const g = newGame(18);
  const { f, r } = unluckyLoss(g);
  assert.equal(r.stats[0].xg, 1.8);
  const rec = analyzeMatch(g, f, r, []);
  assert.equal(rec.res, 'P');
  assert.deepEqual(rec.score, [1, 2]);
  assert.equal(rec.vd, 'niez');
  assert.ok(rec.items.some((x) => x.t === 'bad' && x.code === 'b_fin'), JSON.stringify(rec.items));
  assert.ok(rec.items.some((x) => x.t === 'good' && x.code === 'g_xg'));
  assert.ok(rec.items.some((x) => x.t === 'fix' && x.code === 'f_fin'));
  const T = reportText(g, rec);
  assert.match(T.verdict, /niezasłużona porażka/);
  assert.ok(T.bad.some((x) => /skuteczn/i.test(x.text)));
  assert.match(T.mainText, /skuteczn/i);
  assert.ok(T.recs.length >= 1 && T.recs.length <= 3);
});

test('Reguły: czyste konto przy xG rywala >= 1, faule i kartki, czerwona kartka z oceną przed i po', () => {
  const g = newGame(18);
  const f = fixture(g, { home: false });
  const r = result(f, {
    us: { shots: [[50, 0.3, 'goal'], [60, 0.2, 'on'], [70, 0.1, 'off']], fouls: 18, yellows: RULES.bad.yellows },
    them: { shots: [[10, 0.5, 'on'], [20, 0.4, 'on'], [30, 0.3, 'off'], [85, 0.2, 'on']] },
    reds: [[40, 'us', `${CLUB}-6`]],
    ratings: { [`${CLUB}-6`]: { rc: 1, rating: 4.8, minutes: 40 }, [`${CLUB}-1`]: { saves: 5, rating: 7.9 } },
  });
  const rec = analyzeMatch(g, f, r, []);
  const codes = rec.items.map((x) => `${x.t}:${x.code}`);
  for (const c of ['good:g_cs', 'bad:b_disc', 'bad:b_red', 'fix:f_disc']) assert.ok(codes.includes(c), `${c} w ${codes}`);
  assert.equal(rec.rs[0], 40);
  const T = reportText(g, rec);
  assert.ok(T.ctxLines.some((x) => /Do czerwonej kartki dla nas \(40\. min\)/.test(x)), T.ctxLines.join(' | '));
  assert.ok(T.gkLine && /trener bramkarzy/.test(T.gkLine));
  assert.ok(T.recs.some((x) => x.code === 'r_talk' && x.go?.to === 'talk'));
});

test('Jakość sztabu: q 18 podaje dokładne liczby, q 4 słowa; ten sam mecz daje ten sam tekst', () => {
  const good = newGame(18);
  const { f, r } = unluckyLoss(good);
  const a = analyzeMatch(good, f, r, []);
  assert.equal(a.pr.d, 'exact');
  const Ta = reportText(good, a);
  assert.match(Ta.verdict, /xG 1,80 do 0,90/);
  assert.match(Ta.bad.find((x) => x.code === 'b_fin').text, /12 strzałów|1,80/);
  // Deterministycznie: ponowna analiza i ponowne otwarcie dają to samo
  assert.deepEqual(analyzeMatch(good, f, r, []), a);
  assert.deepEqual(reportText(good, a), Ta);

  const weak = newGame(4);
  const f2 = fixture(weak); f2.id = f.id; // to samo ziarno meczu
  const b = analyzeMatch(weak, f2, r, []);
  assert.equal(b.pr.d, 'vague');
  const Tb = reportText(weak, b);
  assert.doesNotMatch(Tb.verdict, /xG/);
  for (const x of [...Tb.good, ...Tb.bad, ...Tb.fix]) assert.doesNotMatch(x.text, /\d/, x.text);
  assert.doesNotMatch(Tb.mainText, /\d/);
  assert.ok(b.pts === 2, 'słaby sztab: 2 punkty w poczcie zamiast 3');
  assert.ok(reportMail(weak, b).body.split('\n').filter((l) => l.startsWith('- ')).length === 2);
  assert.deepEqual(reportText(weak, b), Tb);

  // Średnia jakość: zaokrąglenia
  const mid = newGame(11);
  const c = analyzeMatch(mid, f, r, []);
  assert.equal(c.pr.d, 'approx');
  assert.match(reportText(mid, c).verdict, /xG ok\. /);
});

test('Słaby analityk myli się wiarygodnie: przeoczenia i zły akcent w części meczów, czerwonej kartki nie przeocza', () => {
  let missed = 0; let swapped = 0; let red = 0; const N = 60;
  for (let i = 0; i < N; i++) {
    const g = newGame(3, {}, 100 + i);
    const f = fixture(g);
    const r = result(f, {
      us: { shots: [[10, 0.6, 'goal'], ...Array.from({ length: 11 }, (_, k) => [20 + k * 5, 0.15, 'off'])], fouls: 19, yellows: 4, offsides: 6 },
      them: { shots: [[30, 0.9, 'goal'], [60, 0.8, 'goal'], [70, 0.6, 'on']] },
      reds: [[80, 'us', `${CLUB}-5`]], ratings: { [`${CLUB}-5`]: { rc: 1 } },
    });
    const rec = analyzeMatch(g, f, r, []);
    const bad = rec.items.filter((x) => x.t === 'bad').map((x) => x.code);
    if (bad.includes('b_red')) red++;
    if (bad.length < 4) missed++;
    if (bad[0] && bad[0] !== 'b_red') swapped++;
  }
  assert.equal(red, N, 'czerwona kartka zawsze zauważona');
  assert.ok(missed > 0, 'słaby sztab czasem coś przeoczy');
  assert.ok(swapped > 0 && swapped < N, 'zły akcent tylko czasem');
});

test('Bez ukrytych wartości: zapis i tekst nie zawierają zaangażowania Z ani cech ukrytych', () => {
  const g = newGame(18);
  const { f, r } = unluckyLoss(g);
  const msg = recordMatchReport(g, f, r);
  const rec = matchReportList(g)[0];
  const json = JSON.stringify(rec);
  assert.doesNotMatch(json, /"Z"|"hidden"|piReport|13\.7/);
  const T = reportText(g, rec);
  const all = [JSON.stringify(T), msg.subject, msg.body, renderMatchAnalysis(g, { id: rec.id })].join(' ');
  assert.doesNotMatch(all, /13,7|13\.7|zaangażowan|ukryt|jakość wykonania/i);
});

test('Tekst bez undefined, NaN, null i pauz em: poczta, pełny raport, archiwum, różne jakości i mecze', () => {
  for (const q of [2, 6, 10, 15, 20]) {
    for (const analyst of [true, false]) {
      const g = newGame(q, { analyst, gk: q > 6 });
      for (let i = 0; i < 4; i++) {
        let f = fixture(g, { home: i % 2 === 0, comp: i === 3 ? 'pp' : 'ekstraklasa', date: `2026-08-0${i + 1}` });
        if (f.comp === 'pp') f.round = 'R32';
        let r = result(f, { us: { shots: [[5, 0.3, 'goal'], [88, 0.4, 'goal']], corners: 7 }, them: { shots: [[70, 0.9, 'on'], [75, 0.8, 'on'], [80, 0.7, 'off']] }, subIn: [60, `${CLUB}-12`], ratings: { [`${CLUB}-12`]: { g: 1, rating: 7.6, minutes: 30 } } });
        if (i === 1) ({ f, r } = unluckyLoss(g));
        const m = recordMatchReport(g, f, r);
        assert.ok(m);
        assert.doesNotMatch(`${m.subject} ${m.body} ${m.from}`, BAD_TEXT, `${q} ${analyst}: ${m.subject} ${m.body}`);
        assert.doesNotMatch(matchReportMailFoot(g, m), BAD_TEXT);
      }
      for (const rec of matchReportList(g)) assert.doesNotMatch(renderMatchAnalysis(g, { id: rec.id, from: 'mail' }), BAD_TEXT);
      assert.doesNotMatch(renderMatchAnalysis(g, { list: true }), BAD_TEXT);
    }
  }
  assert.doesNotMatch(renderMatchAnalysis(newGame(), { list: true }), BAD_TEXT);
});

test('Poczta: kategoria sztab, ważna, od analityka (albo asystenta), temat z wynikiem i wnioskiem, przyciski tylko nawigują', () => {
  const g = newGame(16);
  const { f, r } = unluckyLoss(g);
  const m = recordMatchReport(g, f, r);
  assert.equal(m.category, 'staff');
  assert.equal(m.priority, 'important');
  assert.equal(m.from, 'Analityk');
  assert.match(m.subject, /Legia Warszawa 1:2 Raków Częstochowa: /);
  assert.equal(m.refs.kind, 'matchReport');
  const labels = m.refs.links.map((x) => x.label);
  for (const l of ['Pełny raport', 'Zmień taktykę', 'Ustaw trening']) assert.ok(labels.includes(l), labels.join(', '));
  assert.ok(labels.includes('Porozmawiaj') || labels.includes('Karta zawodnika'));
  assert.equal(m.actions.length, 0, 'to nie jest decyzja: wiadomość nie zatrzymuje dni');
  assert.equal(m.resolved, true);
  assert.equal(m.body.split('\n').filter((l) => l.startsWith('- ')).length, 3);
  assert.match(matchReportMailFoot(g, m), /data-act="ma-go" data-to="report"/);
  // Bez analityka: pisze asystent, krótsza sekcja „do poprawy”
  const g2 = newGame(16, { analyst: false });
  const sk = analysisSkills(g2);
  assert.equal(sk.by.r, 'asystent');
  assert.ok(sk.qD <= 16 - MREP.noAnalyst + 3);
  const { f: f2, r: r2 } = unluckyLoss(g2);
  const m2 = recordMatchReport(g2, f2, r2);
  assert.equal(m2.from, 'Asystent trenera');
  // Ponowne zapisanie tego samego meczu nie dubluje analizy
  assert.equal(recordMatchReport(g2, f2, r2), null);
  assert.equal(matchReportList(g2).length, 1);
});

test('Sparing bez analizy, puchar z analizą', () => {
  const g = newGame(12);
  const f = fixture(g, { comp: 'friendly' });
  assert.equal(wantsReport(g, f), false);
  assert.equal(recordMatchReport(g, f, unluckyLoss(g).r), null);
  assert.equal(matchReportList(g).length, 1 - 1);
  const pp = fixture(g, { comp: 'pp' }); pp.round = 'R32';
  assert.ok(recordMatchReport(g, pp, result(pp, { us: { shots: [[10, 0.3, 'goal']] }, them: { shots: [] } })));
  assert.equal(matchReportList(g)[0].ctx.cup, 1);
});

test('Archiwum: najwyżej 40 raportów, migracja starego zapisu, nowy klub zaczyna od nowa', () => {
  const g = newGame(12);
  delete g.matchReports;
  assert.deepEqual(ensureMatchReports(g).list, []);
  assert.equal(g.matchReports.v, MREP.version);
  for (let i = 0; i < 45; i++) { const f = fixture(g, { date: `2026-0${8 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, '0')}` }); recordMatchReport(g, f, result(f, { us: { shots: [[10, 0.3, 'goal']] }, them: { shots: [] } })); }
  assert.equal(matchReportList(g).length, MREP.keep);
  assert.equal(JSON.stringify(g.matchReports).length < MREP.keep * 3000, true, 'ok. 2-2,5 KB na mecz');
  // Stary format (tablica) i śmieci w liście
  const old = newGame(12);
  old.matchReports = [...matchReportList(g), null, { foo: 1 }];
  assert.equal(ensureMatchReports(old).list.length, MREP.keep);
  // Zmiana klubu: archiwum od nowa
  old.clubId = 'lech';
  assert.equal(ensureMatchReports(old).list.length, 0);
});

test('Archiwum: problem wraca (3 z 5 ostatnich), poprzednia analiza przed rewanżem, liczba na przycisku w taktyce', () => {
  const g = newGame(18);
  for (let i = 0; i < 3; i++) { const { f, r } = unluckyLoss(g); f.date = `2026-08-0${i + 1}`; recordMatchReport(g, f, r); }
  const rp = recurringProblems(g);
  assert.ok(rp.some((x) => x.code === 'b_fin' && x.n === 3));
  const last = matchReportList(g)[0];
  assert.ok(last.items.some((x) => x.t === 'fix' && x.code === 'f_fin' && x.rc === 3));
  assert.match(reportText(g, last).fix.find((x) => x.code === 'f_fin').text, /Problem wraca/);
  // Rewanż: najbliższy mecz z tym samym rywalem
  g.date = '2026-08-10';
  g.fixtures.push({ id: 'rewanz', comp: 'ekstraklasa', round: 20, date: '2026-09-01', home: OPP, away: CLUB, played: false });
  const rv = rivalReport(g);
  assert.equal(rv.fixture.id, 'rewanz');
  assert.equal(rv.rec.opp, OPP);
  const arch = renderMatchAnalysis(g, { list: true });
  assert.match(arch, /Ten problem wraca/);
  assert.match(arch, /Przed meczem z rywalem: Raków Częstochowa/);
  assert.doesNotMatch(arch, /Trafno/, 'trafność rad ukryta');
  const badge = analysesBadge(g);
  assert.deepEqual(badge, { n: 3, alert: true });
});

test('Panel taktyki: przycisk „Analizy meczów” obok „Poproś asystenta”', async () => {
  const { generateWorld, squadOf } = await import('../src/world/worldGen.js');
  const { createTactics } = await import('../src/engine/lineup.js');
  const squad = squadOf(generateWorld(3), 'legia');
  const tactics = createTactics(squad, { benchSize: 9 });
  const html = renderTactics({ squad, tactics, sel: null, benchSize: 9, analyses: { n: 4, alert: true } });
  const i = html.indexOf('Poproś asystenta'); const j = html.indexOf('data-act="ma-list"');
  assert.ok(i > 0 && j > i && html.slice(i, j).includes('tac__actions') === false);
  assert.match(html, /Analizy meczów <span class="tac__ma-n">4<\/span>/);
  assert.doesNotMatch(renderTactics({ squad, tactics, sel: null, benchSize: 9 }), /ma-list/);
});

test('Pełny mecz silnikiem: po meczu ligowym poczta ma analizę z przyciskami, archiwum ma raport', async () => {
  const { generateWorld, squadOf } = await import('../src/world/worldGen.js');
  const { createSeason } = await import('../src/season/season.js');
  const { processDay, continueUntilStop, primaryAction } = await import('../src/core/gameLoop.js');
  const { createTactics } = await import('../src/engine/lineup.js');
  const MD = await import('../src/match/matchday.js');
  await import('../src/season/dailySystems.js');
  const g = { seed: 11, clubId: 'widzew', date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(11); g.season = createSeason(11, { playerClub: 'widzew' }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, 'widzew'), { benchSize: 12 });
  processDay(g);
  while (primaryAction(g).kind !== 'play') {
    if (primaryAction(g).kind === 'decide') g.inbox = g.inbox.map((m) => ({ ...m, resolved: true }));
    else continueUntilStop(g);
  }
  const f = primaryAction(g).match;
  const S = MD.startMatchday(g, f);
  MD.kickOff(g, S); MD.skip(S); while (S.step !== 'fulltime' && S.step !== 'studio2') MD.skip(S);
  MD.finishMatchday(g, S);
  const m = g.inbox.find((x) => x.key === `analiza:${f.id}`);
  if (f.comp === 'friendly') { assert.equal(m, undefined); return; }
  assert.ok(m, 'analiza w poczcie');
  assert.equal(m.refs.kind, 'matchReport');
  assert.doesNotMatch(`${m.subject} ${m.body}`, BAD_TEXT);
  const rec = matchReportList(g)[0];
  assert.equal(rec.id, f.id);
  assert.deepEqual(rec.score, f.home === 'widzew' ? f.result.score : [f.result.score[1], f.result.score[0]]);
  assert.doesNotMatch(renderMatchAnalysis(g, { id: rec.id, from: 'mail', mail: m.id }), BAD_TEXT);
});
