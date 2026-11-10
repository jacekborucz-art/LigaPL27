import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import {
  generateTraits, generatePersonality, computeMindset, elementPrefs, TRAITS, AGENT_TYPES,
} from '../src/career/personality.js';
import {
  openNegotiation, NegotiationSession, aiNegotiate, applyOutcome, applyPromiseCheck, canNegotiate,
  normalizeOffer, formatZl, formatDate, addDays, buildContract,
} from '../src/career/negotiation.js';
import { LINES } from '../src/career/negotiationLines.js';
import { willingnessToJoin } from '../src/career/reputation.js';
import { transferListCandidates } from '../src/career/squad.js';

const legia = { id: 'legia', name: 'Legia Warszawa', prestige: 10, tier: 1, L: 12.6 };
const radomiak = { id: 'radomiak', name: 'Radomiak Radom', prestige: 5, tier: 1, L: 11.3 };
const sokol = { id: 'sokol', name: 'Sokół Kleczew', prestige: 2, tier: 3, L: 8.5 };

const TRAITS_MID = Object.fromEntries(TRAITS.map((k) => [k, 10]));

/** Zawodnik testowy. traits: nadpisania cech (reszta 10); agent domyślnie rozsądny. */
function pl(id, extra = {}, traits = {}, agent = 'rozsadny') {
  return {
    id, name: 'Jan Kowal', age: 26, ovr: 12, pos: 'ŚP', rep: 42, persona: 'Spokojny',
    hidden: { POT: 12.3, PRF: 10, TMP: 10 }, contract: { wage: 9000, until: '2027-06-30' }, morale: 12,
    traits: { ...TRAITS_MID, ...traits }, agent, ...extra,
  };
}

const offer = (wage, extra = {}) => ({ wage, years: 3, role: 'podstawowy', agentFee: 30000, ...extra });
const sign = (player, opts = {}) => openNegotiation({
  kind: 'sign', player, club: opts.club ?? radomiak, fromClub: opts.from ?? legia, date: opts.date ?? '2026-07-10',
  rng: new Rng(opts.seed ?? 'swiat'), ctx: opts.ctx ?? {},
});
const renew = (player, opts = {}) => openNegotiation({
  kind: 'renew', player, club: opts.club ?? radomiak, date: opts.date ?? '2026-11-10',
  rng: new Rng(opts.seed ?? 'swiat'), ctx: opts.ctx ?? {},
});

/** Gracz uparcie składa niskie oferty, aż rozmowy się zerwą. */
function forceFailure(s, wage) {
  let r;
  for (let i = 0; i < 12 && s.status === 'open'; i++) r = s.propose(offer(wage));
  return r;
}

test('Cechy: 11 cech 1-20, korelacja z osobowością i ukrytymi atrybutami', () => {
  const base = { age: 26, ovr: 12, rep: 40, hidden: { POT: 12, PRF: 10, TMP: 10 } };
  const hot = generateTraits({ ...base, persona: 'Narwaniec', hidden: { ...base.hidden, TMP: 18 } }, new Rng(7));
  const calm = generateTraits({ ...base, persona: 'Spokojny', hidden: { ...base.hidden, TMP: 4 } }, new Rng(7));
  assert.equal(Object.keys(hot).length, 11);
  for (const v of Object.values(hot)) assert.ok(v >= 1 && v <= 20);
  assert.ok(hot.temper > calm.temper + 5);
  assert.ok(hot.patience < calm.patience);
  const p = generatePersonality({ id: 'x', ...base, persona: 'Lider' }, new Rng(3));
  assert.ok(AGENT_TYPES[p.agent]);
});

test('Mindset zależy od wieku, cech i sytuacji', () => {
  const young = { age: 20, ovr: 10, rep: 25, hidden: { POT: 14 } };
  assert.equal(computeMindset(young, { ...TRAITS_MID, ambition: 15 }, { minutesShare: 0.7 }).key, 'kariera');
  assert.equal(computeMindset({ age: 34, ovr: 11, rep: 40 }, TRAITS_MID, { minutesShare: 0.7 }).key, 'spokojnaKoncowka');
  assert.equal(computeMindset({ age: 30, ovr: 12, rep: 45 }, { ...TRAITS_MID, greed: 16 }, { minutesShare: 0.7 }).key, 'ostatniKontrakt');
  assert.equal(computeMindset({ age: 26, ovr: 12, rep: 40 }, { ...TRAITS_MID, playTime: 16 }, { minutesShare: 0.2 }).key, 'chceGrac');
  assert.equal(computeMindset({ age: 27, ovr: 12, rep: 40 }, { ...TRAITS_MID, homeTies: 17 }, { homeClub: true }).key, 'powrotDoDomu');
  const career = elementPrefs(TRAITS_MID, 'chceGrac');
  const money = elementPrefs(TRAITS_MID, 'ostatniKontrakt');
  assert.ok(career.roleW > money.roleW && money.signOnPref > career.signOnPref);
});

test('Deterministyczność: to samo ziarno i te same oferty dają identyczny przebieg', () => {
  const run = () => {
    const s = sign(pl('det', {}, { greed: 14 }, 'rekin')).session;
    const out = [];
    for (const w of [8000, 9500, 10500, 11500, 12500, 13500]) if (s.status === 'open') out.push(s.propose(offer(w)));
    return JSON.stringify({ out, s: s.toJSON() });
  };
  assert.equal(run(), run());
  const other = sign(pl('det', {}, { greed: 14 }, 'rekin'), { date: '2026-07-11' }).session;
  const first = sign(pl('det', {}, { greed: 14 }, 'rekin')).session;
  assert.notDeepEqual(other.hidden, first.hidden); // inna data: inne ukryte wartości
});

test('Różni zawodnicy reagują inaczej na tę samą ofertę', () => {
  const a = sign(pl('r1', { persona: 'Ambitny' }, { greed: 16, ego: 15, playTime: 15 }, 'rekin')).session;
  const b = sign(pl('r2', { persona: 'Spokojny' }, { greed: 6, ego: 6, loyalty: 14 }, 'rodzinny')).session;
  const ra = a.propose(offer(10000));
  const rb = b.propose(offer(10000));
  assert.ok(ra.type !== rb.type || ra.counter?.wage !== rb.counter?.wage || ra.counter?.signOn !== rb.counter?.signOn);
  assert.notEqual(ra.text, rb.text);
  assert.ok(a.hidden.target > b.hidden.target);
});

test('Niska oferta obraża ambitnego z wysokim ego bardziej niż spokojnego', () => {
  const mk = (id, persona) => {
    const p = pl(id, { persona, hidden: { POT: 12.3, PRF: 10, TMP: persona === 'Ambitny' ? 13 : 7 } });
    delete p.traits;
    Object.assign(p, { traits: generateTraits(p, new Rng('te-same-losowania')), agent: 'brak' });
    return p;
  };
  const amb = mk('amb', 'Ambitny');
  const calm = mk('calm', 'Spokojny');
  assert.ok(amb.traits.ego > calm.traits.ego);
  const drop = (p) => {
    const s = sign(p).session;
    const before = s.mood;
    s.propose(offer(Math.round(s.hidden.target * 0.45)));
    return { drop: before - s.mood, offended: s.d.st.offended };
  };
  const da = drop(amb);
  const dc = drop(calm);
  assert.ok(da.drop > dc.drop + 5, `ambitny ${da.drop}, spokojny ${dc.drop}`);
  assert.ok(da.offended > dc.offended);
});

test('Drobne kroki irytują, a wyraźne ustępstwa poprawiają nastrój', () => {
  const s1 = sign(pl('k1', {}, { patience: 6 })).session;
  const s2 = sign(pl('k1', {}, { patience: 6 })).session;
  const w0 = Math.round(s1.hidden.target * 0.85);
  s1.propose(offer(w0)); s2.propose(offer(w0));
  const r1 = s1.propose(offer(w0 + 20));
  const r2 = s2.propose(offer(Math.round(w0 * 1.08)));
  assert.ok(r1.events.includes('irritated'));
  assert.ok(r2.events.includes('pleased'));
  assert.ok(s2.mood > s1.mood + 5);
});

test('Kontroferta jest wiążąca: przyjęcie jej warunków kończy się podpisem', () => {
  const s = sign(pl('kontra', {}, { greed: 13 })).session;
  const r = s.propose(offer(Math.round(s.hidden.target * 0.85)));
  assert.ok(['counter', 'demand'].includes(r.type));
  const done = s.propose(r.counter);
  assert.equal(done.type, 'accept');
  assert.equal(s.contract.wage, r.counter.wage);
  assert.ok(s.contract.until <= '2031-07-10');
  assert.equal(s.contract.promise.role, r.counter.role);
});

test('Fiasko ustawia blokadę; próba przed jej końcem jest odrzucana, po końcu można rozmawiać', () => {
  const p = pl('fiasko', { persona: 'Narwaniec' }, { ego: 15, temper: 15, patience: 5 });
  const s = sign(p).session;
  const last = forceFailure(s, Math.round(s.hidden.target * 0.6));
  assert.equal(last.type, 'breakoff');
  const out = s.outcome();
  assert.ok(out.lock && out.lock.until > '2026-07-10');
  assert.ok(out.lock.weeks >= 2 && out.lock.weeks <= 12);
  applyOutcome(p, out);
  const before = sign(p, { date: addDays(out.lock.until, -1) });
  assert.equal(before.ok, false);
  assert.equal(before.reason, 'locked');
  assert.match(before.text, /[A-Z][a-z]{2} \d{1,2}, \d{4}/); // data w formacie MMM D, YYYY
  assert.equal(canNegotiate(p, radomiak.id, out.lock.until).ok, true);
  const after = sign(p, { date: out.lock.until });
  assert.equal(after.ok, true);
  // Pamięć urazy: po fiasku rozmowy startują w gorszym nastroju niż u zawodnika bez historii.
  const fresh = sign(pl('fiasko', { persona: 'Narwaniec' }, { ego: 15, temper: 15, patience: 5 }), { date: out.lock.until });
  assert.ok(after.session.mood < fresh.session.mood);
});

test('Skrajne obrażenie blokuje rozmowy do końca okna transferowego', () => {
  const p = pl('ego', { persona: 'Ambitny' }, { ego: 19, temper: 17, patience: 4 });
  const s = sign(p, { ctx: { windowEnd: '2026-09-01' } }).session;
  const r = s.propose(offer(Math.round(s.hidden.target * 0.25)));
  assert.equal(r.type, 'breakoff');
  assert.equal(s.outcome().lock.extreme, true);
  assert.ok(s.outcome().lock.until >= '2026-09-01'); // późniejsza z dat: koniec okna albo 12 tygodni
  // Przy przedłużeniu skrajne obrażenie zamyka rozmowy do końca sezonu.
  const r2 = renew(pl('ego2', { persona: 'Ambitny' }, { ego: 19, temper: 17, patience: 4, loyalty: 14 })).session;
  r2.propose(offer(Math.round(r2.hidden.target * 0.25)));
  assert.equal(r2.outcome().lock.until, '2027-06-30');
});

test('Lojalny zawodnik przedłuża taniej', () => {
  const loyal = renew(pl('loj', {}, { loyalty: 18 })).session;
  const merc = renew(pl('loj', {}, { loyalty: 3 })).session;
  assert.ok(loyal.hidden.target < merc.hidden.target * 0.9, `${loyal.hidden.target} vs ${merc.hidden.target}`);
  assert.ok(loyal.hidden.min < merc.hidden.min);
  const w = Math.round(loyal.hidden.anchor * 1.01); // od razu powyżej pierwszego żądania lojalnego
  assert.equal(loyal.propose(offer(w, { agentFee: 60000 })).type, 'accept');
  assert.notEqual(merc.propose(offer(w, { agentFee: 60000 })).type, 'accept');
});

test('Zawodnik z ofertą z lepszego klubu jest twardszy', () => {
  const p = pl('rywal', {}, { loyalty: 14 });
  const pogon = { id: 'pogon', name: 'Pogoń Szczecin', prestige: 7, tier: 1 };
  const calm = renew(p).session;
  const pressed = renew(p, { ctx: { rival: { club: pogon, wage: 14000 } } }).session;
  assert.ok(pressed.hidden.target > calm.hidden.target);
  assert.ok(pressed.hidden.min >= 14000);
  assert.ok(pressed.hidden.maxRounds <= calm.hidden.maxRounds);
  const w = Math.round(calm.hidden.anchor * 1.01);
  assert.equal(calm.propose(offer(w, { agentFee: 60000 })).type, 'accept');
  assert.notEqual(pressed.propose(offer(w)).type, 'accept');
});

test('Złamana obietnica roli utrudnia kolejne negocjacje', () => {
  const p = pl('obietnica', { contract: { wage: 9000, until: '2027-06-30', promise: { role: 'podstawowy', since: '2026-07-01', strikes: 0, kept: 0, broken: false } } }, { loyalty: 13 });
  const clean = renew(structuredClone(p)).session;
  const events = [];
  for (const d of ['2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30']) events.push(applyPromiseCheck(p, radomiak.id, d, 0.1));
  assert.ok(events.some((e) => e?.type === 'promiseWarning'));
  assert.equal(events[3].type, 'promiseBroken');
  assert.equal(p.relations.radomiak.brokenPromises, 1);
  assert.ok(p.relations.radomiak.trust < 50);
  assert.ok(p.morale < 12);
  const after = renew(p, { date: '2026-11-10' });
  assert.ok(after.ok);
  const s = after.session;
  assert.ok(s.hidden.target > clean.hidden.target);
  assert.ok(s.mood < clean.mood - 10);
  assert.ok(s.hidden.maxRounds <= clean.hidden.maxRounds);
});

test('Dotrzymana obietnica nie karze i buduje zaufanie', () => {
  const p = pl('ok', { contract: { wage: 9000, until: '2027-06-30', promise: { role: 'rotacja', since: '2026-07-01', strikes: 0, kept: 0, broken: false } } });
  for (const d of ['2026-08-31', '2026-09-30', '2026-10-31']) applyPromiseCheck(p, radomiak.id, d, 0.5);
  assert.equal(p.contract.promise.broken, false);
  assert.ok(p.relations.radomiak.trust > 50);
});

test('Gwiazda nie podpisze ze słabym klubem (spójność z willingnessToJoin)', () => {
  const star = pl('gwiazda', { rep: 75, ovr: 15.5, persona: 'Ambitny', contract: { wage: 60000, until: '2028-06-30' } });
  const w = willingnessToJoin({ player: { rep: 75, age: 26, persona: 'Ambitny', wage: 60000 }, from: legia, to: sokol, fromTier: 1, toTier: 3 });
  assert.equal(w.verdict, 'odmowa');
  const r = sign(star, { club: sokol });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'refuseJoin');
  assert.ok(r.text.length > 0);
  // Ten sam zawodnik rozmawia z klubem swojego poziomu.
  assert.equal(sign(star, { club: { id: 'lech', name: 'Lech Poznań', prestige: 10, tier: 1, L: 12.6 } }).ok, true);
});

test('Sesja przetrwa serializację w połowie negocjacji', () => {
  const p = pl('save', { persona: 'Ambitny' }, { greed: 15 }, 'rekin');
  const offers = [8000, 9800, 11000, 12000, 13000, 14000].map((w) => offer(w));
  const a = sign(p).session;
  const b = sign(p).session;
  const ra = offers.map((o) => (a.status === 'open' ? a.propose(o) : null));
  b.propose(offers[0]);
  b.propose(offers[1]);
  const saved = JSON.stringify(b.toJSON());
  const c = NegotiationSession.fromJSON(JSON.parse(saved));
  const rc = [ra[0], ra[1], ...offers.slice(2).map((o) => (c.status === 'open' ? c.propose(o) : null))];
  assert.deepEqual(rc, ra);
  assert.deepEqual(c.toJSON(), a.toJSON());
});

test('Blef agenta: sprawdzenie kosztuje nastrój i zdemaskowany blef obniża żądania', () => {
  let found = null;
  for (let i = 0; i < 40 && !found; i++) {
    const s = sign(pl(`blef${i}`, {}, { greed: 16 }, 'rekin')).session;
    for (const w of [0.8, 0.84, 0.88]) {
      if (s.status !== 'open') break;
      const r = s.propose(offer(Math.round(s.hidden.target * w)));
      if (r.claim) { found = s; break; }
    }
  }
  assert.ok(found, 'rekin powinien czasem blefować');
  assert.equal(found.d.st.claim.real, false); // bez prawdziwej oferty to blef
  const ask = found.hidden.ask;
  const mood = found.mood;
  const res = found.callBluff();
  assert.equal(res.truth, false);
  assert.ok(found.mood < mood);
  assert.ok(found.hidden.ask < ask);
  assert.equal(found.callBluff().ok, false); // tylko raz
});

test('Odmowa przedłużenia ustawia renewRefused i klub AI wystawia zawodnika', () => {
  const p = pl('odchodzi', { rep: 50, unhappy: true }, { loyalty: 3, ambition: 17, homeTies: 4 });
  const r = renew(p, { ctx: { rival: { club: legia, wage: 20000 } } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'refuseRenew');
  applyOutcome(p, r.outcome);
  assert.equal(p.renewRefused, true);
  assert.equal(renew(p).reason, 'refused');
  const filler = Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, pos: 'ŚP', ovr: 13, age: 26, wage: 9000, contractUntil: '2029-06-30' }));
  const list = transferListCandidates(
    [...filler, { id: p.id, pos: 'ŚP', ovr: 11, age: 26, wage: 9000, contractUntil: '2027-06-30', renewRefused: true, unhappy: true },
      { id: 'm9', pos: 'ŚP', ovr: 11, age: 26, wage: 9000, contractUntil: '2029-06-30' },
      { id: 'm8', pos: 'ŚP', ovr: 11, age: 26, wage: 9000, contractUntil: '2029-06-30' }],
    { L: 11.5 }, { date: '2026-11-10' },
  );
  const entry = list.find((x) => x.id === p.id);
  assert.ok(entry && entry.reasons.includes('Nie przedłuży kontraktu'));
});

test('Przedłużenie tylko w oknie 18 miesięcy; fiasko obniża morale i zaufanie', () => {
  const early = renew(pl('wczesnie', { contract: { wage: 9000, until: '2029-06-30' } }));
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'tooEarly');
  const p = pl('fiasko2', {}, { ego: 14, temper: 14, patience: 5 });
  const s = renew(p).session;
  forceFailure(s, Math.round(s.hidden.target * 0.6));
  assert.equal(s.status, 'failed');
  applyOutcome(p, s.outcome());
  assert.ok(p.morale <= 9);
  assert.ok(p.relations.radomiak.trust < 50);
  assert.ok(p.relations.radomiak.history.at(-1).result === 'fiasko');
});

test('AI kończy negocjacje w maks. 2 rundach, spójnie z rynkiem', () => {
  const world = new Rng('rynek');
  const personas = ['Spokojny', 'Ambitny', 'Wrażliwy', 'Lider', 'Narwaniec'];
  let signed = 0;
  let failed = 0;
  for (let i = 0; i < 120; i++) {
    const p = {
      id: `ai${i}`, name: 'Piotr Nowak', age: 18 + (i % 17), ovr: 9 + (i % 6), pos: ['ŚP', 'NAP', 'ŚO', 'BR'][i % 4],
      rep: 20 + (i % 35), persona: personas[i % 5], hidden: { POT: 13, PRF: 10, TMP: 10 },
      contract: { wage: 4000 + (i % 9) * 1000, until: '2027-06-30' },
    };
    Object.assign(p, generatePersonality(p, world.fork(`os${i}`)));
    const r = aiNegotiate({ player: p, club: legia, fromClub: radomiak, date: '2026-07-15', rng: world, budget: { wage: 4000 + (i % 7) * 1500 } });
    assert.ok(r.rounds <= 2, `rund: ${r.rounds}`);
    if (r.result === 'signed') { signed++; assert.ok(r.contract.wage <= 4000 + (i % 7) * 1500); }
    if (r.result === 'failed') { failed++; assert.ok(r.outcome.lock); }
  }
  assert.ok(signed > 0 && failed > 0, `podpisane ${signed}, fiaska ${failed}`);
});

test('Oferta: limity (maks. 5 lat), kontrakt, formaty kwot i dat', () => {
  const o = normalizeOffer({ wage: 12345.6, years: 9, raise: 0.5, relegationCut: 0.9, role: 'xyz', clause: { amount: 0 } });
  assert.equal(o.years, 5);
  assert.equal(o.raise, 0.2);
  assert.equal(o.relegationCut, 0.5);
  assert.equal(o.role, 'rotacja');
  assert.equal(o.clause, null);
  assert.equal(buildContract(o, '2027-01-15').until, '2031-06-30');
  assert.equal(buildContract({ ...o, years: 1 }, '2026-07-10').until, '2027-06-30');
  assert.equal(formatZl(1234567), '1 234 567 zł');
  assert.equal(formatZl(950), '950 zł');
  assert.equal(formatDate('2026-07-24'), 'Jul 24, 2026');
});

test('Biblioteka kwestii: co najmniej 80, po polsku, bez półpauz i myślników', () => {
  assert.ok(LINES.length >= 80, `kwestii: ${LINES.length}`);
  for (const [, who, , text] of LINES) {
    assert.ok(['A', 'P', '*'].includes(who));
    assert.ok(!/[\u2014\u2013]/.test(text), text);
  }
  const keys = new Set(LINES.map((l) => l[0]));
  for (const k of ['accept', 'counter', 'ultimatum', 'breakoff', 'insult', 'claim', 'locked', 'refuseRenew']) assert.ok(keys.has(k), k);
  // Zawodnik bez agenta mówi sam, z agentem mówi agent.
  const solo = sign(pl('solo', {}, {}, 'brak')).session.propose(offer(5000));
  const agent = sign(pl('solo', {}, {}, 'rekin')).session.propose(offer(5000));
  assert.equal(solo.speaker, 'Jan Kowal');
  assert.equal(agent.speaker, AGENT_TYPES.rekin.label);
});
