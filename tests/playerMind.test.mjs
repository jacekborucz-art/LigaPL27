// Decyzja zawodnika przy transferze (src/career/playerMind.js, MIND w negotiation.js, namysł w proposals.js;
// docs/negocjacje.md, rozdz. „Decyzja zawodnika przy transferze (Nov 25, 2026)”): bramka „czy chce rozmawiać” i jej
// kalibracja, wyższe żądania „do przekonania”, liczba rund, reakcje na ofertę wg r, ukryta data decyzji, zdarzenia
// namysłu z kontrakcją obecnego klubu, dwie ostatnie szanse, blokady wg powodu i wcześniejsze otwarcie, uraza,
// bramka i pętla klubów AI, zawodnik gracza odmawia rozmów z klubem AI (list), czynnik terminu przejścia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { Rng } from '../src/core/rng.js';
import { PM, directorTalkView, DIR_VIEW_LABELS, talkGate, aiGate, verdictOf, userGate, setLock, lockState, timingValue, noteSpurned, gateWords } from '../src/career/playerMind.js';
import { MIND, mindRounds, mindLockSpan, openNegotiation, valueOffer, aiNegotiate, normalizeOffer, buildContract, canNegotiate } from '../src/career/negotiation.js';
import { slotOf, monthsLeftOf } from '../src/career/clubOffers.js';
import { clubReputation } from '../src/career/reputation.js';
import { makeProposal, submitUserProposal, proposalsDay, mindAccept, finalChance, improveUserProposal, THINK } from '../src/career/proposals.js';
import { answerIncoming } from '../src/career/transfers.js';
import { monthlyHazard } from '../src/career/moveWish.js';
import { scoreOffer } from '../src/career/offerFactors.js';
import { renderTransfers, handleTransferAction } from '../src/ui/transfersView.js';
import { startNegotiation, renderNegotiation } from '../src/ui/negotiationView.js';
import '../src/season/dailySystems.js';

function newGame(seed = 31, clubId = 'widzew', date = '2026-07-01') {
  applySeasonState({});
  const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 });
  ensureCareer(g); processDay(g);
  g.date = date;
  return g;
}
const cache = {};
const fresh = (seed = 31, date = '2026-07-10') => { const g = structuredClone(cache[seed] ??= newGame(seed)); g.date = date; return g; };
const ek = (g) => CLUBS_PL.filter((c) => c.tier === 1 && c.id !== g.clubId && g.world.clubs[c.id]);
const step = (g, n = 1) => { for (let i = 0; i < n; i++) { g.date = addDays(g.date, 1); processDay(g); } };
const contractFor = (g, wage, years = 2) => buildContract(normalizeOffer({ wage, years, role: 'rotacja' }), g.date);
const BAD = new RegExp(`undefined|NaN|\\[object|${String.fromCharCode(8212)}`);

test('Bramka: progi werdyktu, szum raz na parę i okno, zadowolony z kontraktem na 3+ lata odmawia w 55-70 %', () => {
  assert.equal(verdictOf(0.6), 'keen');
  assert.equal(verdictOf(0.59), 'open');
  assert.equal(verdictOf(0), 'open');
  assert.equal(verdictOf(-0.01), 'convince');
  assert.equal(verdictOf(-0.7), 'convince');
  assert.equal(verdictOf(-0.71), 'reluctant');
  assert.equal(verdictOf(-1.4), 'reluctant');
  assert.equal(verdictOf(-1.41), 'refuse');
  let n = 0; let refuse = 0;
  for (const seed of [3, 11, 21]) {
    const g = fresh(seed, '2026-07-01');
    for (const c of ek(g)) {
      const buyers = ek(g).filter((b) => b.id !== c.id && Math.abs(clubReputation(b) - clubReputation(c)) <= 8).slice(0, 3);
      for (const p of squadOf(g.world, c.id)) {
        const sl = slotOf(g, p, g.date);
        if (!(sl && sl.starter && sl.share >= 0.5 && monthsLeftOf(p, g.date) >= 36 && !p.unhappy && !p.moveWish && (p.morale ?? 12) >= 9)) continue;
        for (const b of buyers) { n++; if (talkGate(g, p, b.id, { mode: 'now' }).verdict === 'refuse') refuse++; }
      }
    }
    // Ten sam wynik przy ponownym pytaniu w tym samym oknie (bez ponownego losowania)
    const p = squadOf(g.world, ek(g)[0].id)[0];
    assert.equal(talkGate(g, p, ek(g)[1].id).S, talkGate(g, p, ek(g)[1].id).S);
  }
  const share = refuse / n;
  assert.ok(n > 150, `próbka ${n}`);
  assert.ok(share >= 0.55 && share <= 0.7, `odmowy zadowolonych: ${(share * 100).toFixed(1)} %`);
});

test('Do przekonania: wyższe żądania (x1,08), mniej rund i gorszy nastrój na start niż przy otwartym', () => {
  const g = fresh();
  const club = clubById(g.clubId);
  const p = squadOf(g.world, ek(g)[2].id)[5];
  const open = (verdict) => openNegotiation({ kind: 'sign', player: p, club, fromClub: clubById(p.clubId), date: g.date, rng: new Rng('mind-test'), ctx: { mind: { verdict, timing: 0 } } });
  const a = open('open'); const b = open('convince'); const c = open('reluctant');
  assert.ok(a.ok && b.ok && c.ok);
  assert.ok(Math.abs(b.session.hidden.target / a.session.hidden.target - 1.08) < 0.01, 'cel x1,08');
  assert.ok(b.session.hidden.ask > a.session.hidden.ask, 'wyższe żądanie na start');
  assert.ok(b.session.hidden.maxRounds <= 3 && c.session.hidden.maxRounds === 2);
  assert.ok(c.session.d.mind.wow === 1.3 && a.session.d.mind.wow === 1.2);
  assert.ok(b.session.d.st.mood < a.session.d.st.mood);
});

test('Rundy: 2-5, najczęściej 3-4 (cierpliwość, temperament, profesjonalizm, agent)', () => {
  const rng = new Rng('rundy');
  const cnt = { 2: 0, 3: 0, 4: 0, 5: 0 };
  const agents = ['rozsadny', 'rozsadny', 'rozsadny', 'rekin', 'rodzinny', 'brak'];
  for (let i = 0; i < 3000; i++) {
    const t = { patience: Math.round(10 + rng.gauss(0, 2.8)), temper: Math.round(10 + rng.gauss(0, 2.8)), professionalism: Math.round(10 + rng.gauss(0, 2.8)) };
    cnt[mindRounds(t, rng.pick(agents), 'open', rng)]++;
  }
  const n = 3000;
  assert.ok((cnt[3] + cnt[4]) / n >= 0.7, JSON.stringify(cnt));
  assert.ok(cnt[2] > 0 && cnt[5] > 0, 'skrajne 2 i 5 zostają');
  assert.equal(mindRounds({ patience: 20, temper: 1, professionalism: 20 }, 'rodzinny', 'open', new Rng('x'), true), 4, 'klub AI najwyżej 4 rundy');
});

test('Reakcje wg r: >= 1,20 zgoda, 1,00-1,20 zgoda albo drobny dodatek, 0,92-1,00 kontroferta, poniżej 0,85 odmowa', () => {
  const g = fresh();
  const club = clubById(g.clubId);
  const players = squadOf(g.world, ek(g)[3].id).slice(0, 12);
  const seen = { accept: 0, extra: 0, counter: 0, reject: 0 };
  for (const p of players) {
    const mk = () => openNegotiation({ kind: 'sign', player: p, club, fromClub: clubById(p.clubId), date: g.date, rng: new Rng(`r:${p.id}`), ctx: { mind: { verdict: 'open', timing: 0 } } }).session;
    const offerAt = (s, r) => {
      const base = normalizeOffer({ wage: 1000, years: s.d.prefs.idealYears, role: s.d.roleExp, agentFee: 0 });
      const v1 = valueOffer(base, s.d).weq; const v2 = valueOffer({ ...base, wage: 2000 }, s.d).weq;
      const a = (v2 - v1) / 1000;
      return { ...base, wage: Math.ceil((r * s.d.hidden.target - (v1 - a * 1000)) / a) };
    };
    let s = mk(); let res = s.propose(offerAt(s, 1.25));
    assert.equal(res.type, 'accept', 'r >= 1,20');
    s = mk(); res = s.propose(offerAt(s, 1.05));
    if (res.type === 'accept') seen.accept++; else { assert.equal(res.type, 'counter'); seen.extra++; assert.ok(s.d.mind.extra); }
    s = mk(); res = s.propose(offerAt(s, 0.95));
    if (res.type === 'counter') {
      seen.counter++;
      const lc = s.d.st.lastCounter.weq / s.d.hidden.target;
      assert.ok(lc > 0.95 && lc <= 1.03, `kontroferta podbija do celu (${lc})`);
      assert.equal(s.propose(res.counter).type, 'accept', 'przyjęcie kontroferty');
    }
    s = mk(); res = s.propose(offerAt(s, 0.8));
    if (res.type === 'reject') { seen.reject++; assert.equal(res.counter, undefined, 'bez kontroferty'); }
  }
  assert.ok(seen.accept > 0 && seen.counter > 0 && seen.reject > 0, JSON.stringify(seen));
});

test('Namysł: data decyzji ukryta przed graczem („Zawodnik się zastanawia”)', () => {
  const g = fresh(32);
  const p = g.market.free.map((id) => g.world.players[id]).find(Boolean);
  const r = submitUserProposal(g, { playerId: p.id, contract: contractFor(g, Math.round((p.askWage ?? 3000) * 1.2 / 100) * 100), fromClub: null });
  assert.ok(r.ok);
  assert.match(r.text, /się zastanawia/);
  assert.doesNotMatch(r.text, /\d{1,2} [a-zź]{3} \d{4}/);
  const html = renderTransfers(g, { tfTab: 'wtoku' }) + renderTransfers(g, { tfTab: 'rynek', tfPlayer: p.id });
  assert.ok(/Zawodnik się zastanawia/.test(html));
  assert.ok(!html.includes(`odpowie do`), 'bez daty decyzji');
  assert.ok(!BAD.test(html));
});

test('Namysł: zdarzenia dnia (rodzina, inna oferta) i kontrakcja obecnego klubu (zostaje albo myśli dalej)', () => {
  const g = fresh(33);
  const results = new Set();
  const msgs = [];
  let events = 0;
  for (const c of ek(g).slice(0, 8)) {
    for (const p of squadOf(g.world, c.id).filter((x) => !x.loan && x.contract?.wage).slice(0, 4)) {
      const x = makeProposal(g, { playerId: p.id, to: g.clubId, fee: 100000, contract: contractFor(g, Math.round(p.contract.wage * 1.3 / 100) * 100), r: 1, mood: 60 });
      if (!x) continue;
      x.decide = addDays(g.date, 20); // długi namysł: dużo dni ze zdarzeniami
      x.cm = { day: addDays(g.date, 1), raise: 0.25 };
      const w0 = p.contract.wage;
      msgs.push(...proposalsDay(g, addDays(g.date, 1)));
      assert.ok(x.cm.done);
      results.add(x.cm.result);
      if (x.cm.result === 'stays') { assert.equal(x.status, 'rejected'); assert.equal(x.end.reason, 'stays'); assert.ok(p.contract.wage > w0, 'podwyżka w obecnym klubie'); }
      for (let i = 2; i < 15 && x.status === 'open'; i++) msgs.push(...proposalsDay(g, addDays(g.date, i)));
      if (x.note) events++;
    }
  }
  assert.ok(results.has('stays') && (results.has('ignored') || results.has('refused')), [...results].join(','));
  assert.ok(events > 0, 'zdarzenia namysłu z sygnałem słownym');
  assert.ok(msgs.some((m) => /zostaje w/.test(m.subject) && /doceniając gest klubu/.test(m.body) && !BAD.test(m.body)));
  // Szansa zgody: chętny > otwarty > do przekonania; kontrakcja zwiększa zmianę zdania
  const p = squadOf(g.world, ek(g)[9].id)[3];
  const base = { to: 'lech', shift: 0 };
  assert.ok(mindAccept(g, p, { ...base, verdict: 'keen' }, 0, 0) > mindAccept(g, p, { ...base, verdict: 'open' }, 0, 0));
  assert.ok(mindAccept(g, p, { ...base, verdict: 'open' }, 0, 0) > mindAccept(g, p, { ...base, verdict: 'convince' }, 0, 0));
  assert.ok(mindAccept(g, p, { ...base, verdict: 'open', cm: { result: 'ignored' } }, 0, 0) < mindAccept(g, p, { ...base, verdict: 'open' }, 0, 0));
});

test('Dwie ostatnie szanse: poprawka pensji gracza, potem kontrpropozycja zawodnika (r >= 0,97, nastrój >= 40)', () => {
  const g = fresh(34);
  const keep = { ...THINK };
  try {
    Object.assign(THINK, { pMin: 0, pMax: 0 });
    const free = g.market.free.map((id) => g.world.players[id]).filter(Boolean);
    const x = makeProposal(g, { playerId: free[0].id, to: g.clubId, contract: contractFor(g, 3000), kind: 'free', r: 0.99, mood: 50 });
    while (!x.final && x.status === 'open') step(g);
    assert.ok(finalChance(g, x), 'pierwsza szansa: poprawka');
    assert.ok(/ma wątpliwości/.test(renderTransfers(g, { tfTab: 'wtoku' })));
    const r = improveUserProposal(g, x.id, 12);
    assert.ok(r.ok, r.text);
    assert.equal(x.decide, addDays(g.date, 1));
    assert.equal(mindAccept(g, free[0], x, 0, 0), THINK.final.base + THINK.final.per * 12);
    Object.assign(THINK, { final: { ...THINK.final, base: 0, per: 0 } });
    while (x.status === 'open') step(g);
    assert.equal(x.status, 'changes', 'druga szansa: kontrpropozycja zawodnika');
    // Bez warunku (daleko od celu): po pierwszej szansie odmowa
    const y = makeProposal(g, { playerId: free[1].id, to: g.clubId, contract: contractFor(g, 3000), kind: 'free', r: 0.9, mood: 50 });
    while (y.status === 'open') step(g);
    assert.equal(y.status, 'rejected');
  } finally { Object.assign(THINK, keep); }
});

test('Blokada po fiasku: długość wg powodu (miesiące do okna, spór o pieniądze w dniach), słowa bez dat', () => {
  const d = (r, reason, extra = {}) => ({ date: '2026-10-10', traits: { ego: 10, temper: 10 }, agentType: 'rozsadny', mind: { r }, ...extra });
  const rng = () => new Rng('blokada');
  const months = (x) => Math.round((Date.parse(x.until) - Date.parse('2026-10-10')) / (30.44 * 864e5));
  const money = mindLockSpan(d(0.98), 'patience', rng());
  assert.ok(money.days >= 14 && money.days <= 60 && money.months == null, 'spór o pieniądze 14-60 dni');
  const near = mindLockSpan(d(0.93), 'patience', rng());
  assert.ok(near.months >= 3 && near.months <= 5);
  const brk = mindLockSpan(d(0.8), 'mood', rng());
  assert.ok(brk.months >= 5 && brk.months <= 7);
  const ins = mindLockSpan(d(0.6, 'insult', { traits: { ego: 18, temper: 16 } }), 'insult', rng());
  assert.ok(ins.months >= 11 && ins.months <= 12, `obraza ${ins.months}`);
  const shark = mindLockSpan(d(0.8, 'mood', { agentType: 'rekin' }), 'mood', rng());
  const none = mindLockSpan(d(0.8, 'mood', { agentType: 'brak' }), 'mood', rng());
  assert.ok(shark.months > none.months, 'rekin dłużej, bez agenta krócej');
  for (const x of [near, brk, ins]) assert.ok(['-02-01', '-07-01'].includes(x.until.slice(4)) || (x.until >= '2027-02-01' && x.until <= '2027-02-26') || (x.until >= '2027-07-01' && x.until <= '2027-09-09'), `do okna: ${x.until}`);
  assert.ok(months(ins) >= 10);
  assert.equal(MIND.lock.min, 3);
});

test('Odmowa rozmów, wcześniejsze otwarcie przy zmianie sytuacji i uraza do klubu', () => {
  const g = fresh(35);
  const p = squadOf(g.world, ek(g)[4].id).find((x) => !x.moveWish && monthsLeftOf(x, g.date) > 12);
  const until = setLock(g, p, g.clubId, { date: g.date, until: '2027-02-01', reason: 'nie rozmawia' });
  assert.equal(until, '2027-02-01');
  let st = lockState(g, p, g.clubId);
  assert.ok(st.locked && /kilka miesięcy/.test(st.words));
  const gate = userGate(g, p);
  assert.ok(!gate.ok && /wróć za kilka miesięcy/.test(gate.text) && !/\d{4}/.test(gate.text));
  assert.equal(talkGate(g, p, g.clubId).parts.sour, PM.sour, 'uraza na czas blokady');
  p.moveWish = { stage: 'cicha', since: g.date, why: 'hazard', club: p.clubId };
  st = lockState(g, p, g.clubId);
  assert.ok(!st.locked && st.reopened, 'prośba o transfer otwiera rozmowy');
  assert.ok(canNegotiate(p, g.clubId, g.date).ok);
  assert.equal(talkGate(g, p, g.clubId).parts.sour, PM.sour, 'uraza zostaje po otwarciu');
  // Kontrakt do 6 miesięcy też otwiera
  const q = squadOf(g.world, ek(g)[5].id).find((x) => !x.moveWish);
  setLock(g, q, g.clubId, { date: g.date, until: '2027-02-01' });
  q.contract = { ...q.contract, until: '2026-12-31' };
  assert.ok(!lockState(g, q, g.clubId).locked);
});

test('Gracz: odmowa rozmów po porozumieniu klubów zamyka porozumienie, zgoda daje słowa i termin przejścia w rozmowach', () => {
  const g = fresh(36);
  g.market.cOffers ??= [];
  let refused = null; let talked = null;
  for (const c of ek(g)) for (const p of squadOf(g.world, c.id)) {
    if (refused && talked) break;
    if (p.loan) continue;
    const gate = talkGate(g, p, g.clubId, { mode: 'window' });
    const rec = { id: `co-t-${p.id}`, pid: p.id, name: p.name, seller: p.clubId, buyer: g.clubId, user: true, round: 1, counters: 0, status: 'agreed', fee: 500000, pkg: { fee: 500000, inst: 1, bonus: {}, sellOn: 0 }, mode: 'window', regDate: '2027-02-01', talkUntil: addDays(g.date, 14), date: g.date, log: [] };
    if (!refused && gate.verdict === 'refuse') { g.market.cOffers.push(rec); refused = { p, rec }; }
    else if (!talked && gate.verdict !== 'refuse') { g.market.cOffers.push(rec); talked = { p, rec }; }
  }
  assert.ok(refused && talked);
  let r = handleTransferAction(g, 'tf-negotiate', { id: refused.p.id });
  assert.equal(r.negotiate, undefined);
  assert.match(r.ui.tfMsg, /nie widzi sensu rozmów/);
  assert.equal(refused.rec.status, 'refused');
  assert.ok(refused.p.relations[g.clubId].lockUntil > g.date);
  r = handleTransferAction(g, 'tf-negotiate', { id: talked.p.id });
  assert.ok(r.negotiate?.mind?.words, 'odpowiedź na zaproszenie');
  const s = startNegotiation(g, { ...r.negotiate, limits: { maxWage: 1e7, maxSignOn: 1e8 } });
  assert.ok(s.ok, s.text);
  const html = renderNegotiation(g, s.ng);
  assert.ok(html.includes('Termin przejścia') && html.includes(r.negotiate.mind.words));
  assert.ok(!BAD.test(html));
});

test('Kluby AI: ta sama bramka (pamięć na parę i okno) i pętla rozmów najwyżej 4 rundy', () => {
  const g = fresh(37);
  const buyer = ek(g)[0];
  const ps = squadOf(g.world, ek(g)[6].id).slice(0, 10);
  for (const p of ps) {
    const a = aiGate(g, p, buyer.id); const b = aiGate(g, p, buyer.id);
    assert.equal(a, b, 'jedna ocena na parę w oknie');
    assert.equal(a.S, talkGate(g, p, buyer.id, { mode: 'now' }).S);
    const r = aiNegotiate({ kind: 'sign', player: p, club: buyer, fromClub: clubById(p.clubId), date: g.date, rng: new Rng(`ai:${p.id}`), budget: { wage: p.contract.wage * 1.5 }, mind: { verdict: a.verdict === 'refuse' ? 'reluctant' : a.verdict, timing: 0 } });
    assert.ok(r.rounds <= 4, `rundy ${r.rounds}`);
  }
});

test('Zawodnik gracza odmawia rozmów z klubem AI: oferta przepada, list do gracza', () => {
  const g = fresh(38);
  let found = null;
  for (const p of squadOf(g.world, g.clubId)) for (const c of ek(g)) {
    if (found) break;
    if (aiGate(g, p, c.id).verdict === 'refuse') found = { p, c };
  }
  assert.ok(found, 'para z odmową');
  const o = { id: `of-test-${found.p.id}`, kind: 'incoming', playerId: found.p.id, from: found.c.id, fee: 1000000, status: 'open', date: g.date, expires: addDays(g.date, 6), dirOk: true };
  g.market.offers.unshift(o);
  const r = answerIncoming(g, o.id, 'accept');
  assert.equal(o.status, 'failed');
  assert.match(r.text, /nie chce rozmawiać/);
  assert.ok(g.inbox.some((m) => m.subject === `${found.p.name} nie chce rozmawiać z ${found.c.name}` && !BAD.test(m.body)));
});

test('Termin przejścia: czynnik „timing” (do 0,3) i korekta bramki; odrzucona uczciwa oferta podnosi chęć i ryzyko prośby', () => {
  const g = fresh(39);
  const p = squadOf(g.world, ek(g)[7].id)[0];
  assert.equal(scoreOffer(p, { wage: 5000, rep: 50, timing: 0.4 }, { only: ['timing'] }).u, 0.3, 'cap 0,3');
  assert.equal(scoreOffer(p, { wage: 5000, rep: 50 }, { only: ['timing'] }).u, 0, 'bez terminu: 0');
  // Prośba o transfer: woli szybko, później źle
  const q = structuredClone(p); q.moveWish = { stage: 'cicha', since: g.date, club: q.clubId };
  assert.ok(timingValue(g, q, 'now') > 0 && timingValue(g, q, 'season') < 0);
  // Kontrakt kończy się w 6 miesięcy: woli lato
  const e = structuredClone(p); e.contract = { ...e.contract, until: '2026-12-31' };
  assert.ok(timingValue(g, e, 'season') > 0);
  assert.equal(timingValue(g, p, null), 0);
  const before = talkGate(g, p, ek(g)[8].id).S;
  const h0 = monthlyHazard(p, { clubRep: 50, share: 0.8, games: 10, month: 7, date: '2026-07-20', tier: 1 });
  noteSpurned(p, g.date);
  assert.ok(Math.abs(talkGate(g, p, ek(g)[8].id).S - before - PM.spurned.s) < 1e-6, 'S +0,5');
  const h1 = monthlyHazard(p, { clubRep: 50, share: 0.8, games: 10, month: 7, date: '2026-07-20', tier: 1 });
  assert.ok(h0 === 0 || Math.abs(h1 / h0 - 1.5) < 1e-6, 'ryzyko prośby x1,5');
  assert.ok(!/\d/.test(gateWords(p, { verdict: 'refuse', reason: 'stay' })), 'słowa bez liczb');
});

test('Kafelek „Nastawienie”: ocena dyrektora sportowego z błędem, stała w oknie, zwykle zgodna z decyzją zawodnika', () => {
  const g = fresh();
  const ps = ek(g).flatMap((c) => squadOf(g.world, c.id)).slice(0, 200);
  let same = 0;
  for (const p of ps) {
    const v = directorTalkView(g, p);
    assert.ok(Object.values(DIR_VIEW_LABELS).includes(v.label));
    assert.deepEqual(directorTalkView(g, p), v, 'ta sama ocena przy ponownym otwarciu');
    if (v.verdict === talkGate(g, p).verdict) same++;
  }
  assert.ok(same / ps.length >= 0.55 && same / ps.length < 1, `zgodność ${same}/${ps.length}`);
  const html = renderTransfers(g, { tfTab: 'rynek', tfPlayer: ps[0].id });
  const tile = html.slice(html.indexOf('Nastawienie'), html.indexOf('Nastawienie') + 200);
  assert.ok(tile.includes(directorTalkView(g, ps[0]).label), tile);
});
