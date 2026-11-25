// Premia za podpis jako osobny warunek (src/career/negotiation.js SIGN_MIN, signOnMin; Nov 25, 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { TRAITS } from '../src/career/personality.js';
import { openNegotiation, aiNegotiate, signOnMin, SIGN_MIN } from '../src/career/negotiation.js';

const radomiak = { id: 'radomiak', name: 'Radomiak Radom', prestige: 5, tier: 1, L: 11.3 };
const drugaLiga = { id: 'olimpia-elblag', name: 'Klub 2 Ligi', prestige: 2, tier: 3, L: 8.5 };
const czwarta = { id: 'klub-iv', name: 'Klub IV ligi', prestige: 1, tier: 5, L: 6 };
const MID = Object.fromEntries(TRAITS.map((k) => [k, 10]));

function pl(id, extra = {}, traits = {}, agent = 'brak') {
  return {
    id, name: 'Jan Kowal', age: 26, ovr: 12, pos: 'ŚP', rep: 42, persona: 'Spokojny',
    hidden: { POT: 12.3, PRF: 10, TMP: 10 }, contract: { wage: 9000, until: '2027-06-30' }, morale: 12,
    traits: { ...MID, ...traits }, agent, ...extra,
  };
}
const renew = (player, club = radomiak) => openNegotiation({ kind: 'renew', player, club, date: '2026-11-10', rng: new Rng('podpis'), ctx: {} });
const minOf = (p, opts = {}) => signOnMin({ player: p, club: opts.club ?? radomiak, kind: opts.kind ?? 'renew', fromClub: opts.from ?? null, traits: p.traits, agent: p.agent, mindset: opts.mindset ?? 'kariera', target: 10000, rival: opts.rival ?? null, date: '2026-11-10' });

test('Kto wymaga premii za podpis: agent, chciwy, gwiazda, młody talent chciwy; młody bez talentu nie', () => {
  assert.ok(minOf(pl('agent', {}, {}, 'rekin')) >= 10 * 10000 * 0.99, 'z agentem w Ekstraklasie: mocny powód, 10 tygodni');
  assert.ok(minOf(pl('chciwy', {}, { greed: 16 })) > 0);
  assert.ok(minOf(pl('gwiazda', { rep: 60 })) > 0);
  const talent = pl('talent', { age: 19, ovr: 9, hidden: { POT: 15, PRF: 10, TMP: 10 } }, { greed: 15 });
  assert.ok(minOf(talent) > 0, 'młody utalentowany i chciwy żąda premii');
  const kid = pl('mlody', { age: 19, ovr: 9, hidden: { POT: 10, PRF: 10, TMP: 10 } });
  assert.equal(minOf(kid), 0, 'młody bez talentu i bez chciwości: zgoda na 0');
  assert.equal(minOf(pl('agent4', {}, {}, 'rekin'), { club: czwarta }), 0, 'IV liga: bez wymogu');
  assert.ok(minOf(pl('agent2', {}, {}, 'rekin'), { club: drugaLiga }) < minOf(pl('agent1', {}, {}, 'rekin')), 'niższa liga: mniej');
  const loyal = minOf(pl('lojalny', {}, { loyalty: 16 }, 'rekin'));
  assert.ok(loyal > 0 && loyal < minOf(pl('agent3', {}, {}, 'rekin')), 'lojalny: połowa');
});

test('Przedłużenie z 0 za podpis u wymagającego: kontroferta z premią, spadek nastroju, po dwóch razach zerwanie', () => {
  const p = pl('wymaga', {}, { greed: 16 }, 'rekin');
  const r = renew(p);
  assert.ok(r.ok);
  const s = r.session; const need = s.d.hidden.signMin;
  assert.ok(need > 0);
  const big = { wage: Math.round(s.d.hidden.target * 1.15 / 100) * 100, years: 3, role: 'podstawowy', agentFee: 60000, signOn: 0 };
  const mood0 = s.d.st.mood;
  const a = s.propose(big);
  assert.notEqual(a.type, 'accept', 'bez premii nie przyjmuje mimo dobrej pensji');
  assert.ok(s.d.st.mood < mood0);
  assert.ok((a.counter?.signOn ?? 0) > 0, 'kontroferta zawiera premię za podpis');
  const b = s.propose(big);
  assert.equal(s.status, 'failed', 'po drugiej ofercie bez premii zrywa rozmowy');
  assert.equal(b.type, 'breakoff');
});

test('Przedłużenie: z premią na poziomie minimum zgoda; zawodnik bez wymogu przyjmuje 0', () => {
  const p = pl('wymaga2', {}, { greed: 16 }, 'rekin');
  const s = renew(p).session;
  const ok = s.propose({ wage: Math.round(s.d.hidden.target * 1.2 / 100) * 100, years: 3, role: 'podstawowy', agentFee: 80000, signOn: s.d.hidden.signMin });
  assert.equal(ok.type, 'accept');
  const q = pl('bezwymogu', { age: 19, ovr: 9, hidden: { POT: 10, PRF: 10, TMP: 10 } });
  const s2 = renew(q).session;
  assert.equal(s2.d.hidden.signMin, 0);
  assert.equal(s2.propose({ wage: Math.round(s2.d.hidden.target * 1.2 / 100) * 100, years: s2.d.prefs.idealYears, role: s2.d.roleExp, signOn: 0 }).type, 'accept');
});

test('Klub AI dokłada premię za podpis, gdy zawodnik jej wymaga', () => {
  const p = pl('ai', { contract: { wage: 9000, until: '2026-12-31' } }, { greed: 16 }, 'rekin');
  const r = aiNegotiate({ kind: 'renew', player: p, club: radomiak, date: '2026-11-10', rng: new Rng('ai-podpis'), budget: { wage: 50000 } });
  if (r.result === 'signed') assert.ok((r.contract.signOn ?? 0) > 0, 'kontrakt AI z premią');
  assert.ok(SIGN_MIN.on);
});
