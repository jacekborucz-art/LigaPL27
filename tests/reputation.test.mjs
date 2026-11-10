import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baseFromOvr, targetReputation, willingnessToJoin, askingPriceMultiplier, reputationLabel,
} from '../src/career/reputation.js';

const legia = { prestige: 10, tier: 1 };
const lech = { prestige: 10, tier: 1 };
const radomiak = { prestige: 5, tier: 1 };
const sokol = { prestige: 2, tier: 3 };
const lechia = { prestige: 8, tier: 2 };

const star = { rep: 70, age: 27, persona: 'Ambitny', wage: 60000 };
const ekRegular = { rep: 40, age: 26, persona: 'Spokojny', wage: 15000 };
const veteran = { rep: 58, age: 33, persona: 'Spokojny', wage: 30000 };

test('Reputacja rośnie z OVR i odpowiada poziomom lig', () => {
  assert.ok(baseFromOvr(8.5) < baseFromOvr(10));
  assert.ok(baseFromOvr(11.5) < baseFromOvr(14));
  assert.equal(Math.round(baseFromOvr(11.5)), 40);
  assert.equal(reputationLabel(72), 'Gwiazda w Europie');
});

test('Reprezentant ma wyższą reputację niż zawodnik o tym samym OVR bez kadry', () => {
  const base = { ovr: 13, age: 26 };
  assert.ok(targetReputation({ ...base, caps: 30 }, legia) > targetReputation({ ...base, caps: 0 }, legia) + 5);
});

test('Gwiazda odmawia klubowi z 2 Ligi nawet za duże pieniądze', () => {
  const r = willingnessToJoin({ player: star, from: legia, to: sokol, offerWage: 300000, fromTier: 1, toTier: 3 });
  assert.equal(r.verdict, 'odmowa');
});

test('Gwiazda niechętnie idzie do słabszego klubu Ekstraklasy, a dopłata tylko częściowo pomaga', () => {
  const base = { player: star, from: legia, to: radomiak, fromTier: 1, toTier: 1, fromEurope: true, toEurope: false };
  const low = willingnessToJoin({ ...base, offerWage: 60000 });
  const high = willingnessToJoin({ ...base, offerWage: 200000 });
  assert.ok(['odmowa', 'niechętny'].includes(low.verdict), low.verdict);
  assert.ok(high.score > low.score);
  assert.ok(high.score < 0.7, `za łatwo: ${high.score}`);
  assert.ok(low.wageDemand > star.wage * 1.3);
});

test('Średniak z Ekstraklasy chętnie przechodzi do większego klubu z pucharami', () => {
  const r = willingnessToJoin({
    player: ekRegular, from: radomiak, to: lech, offerWage: 20000, fromTier: 1, toTier: 1, toEurope: true, starter: true,
  });
  assert.equal(r.verdict, 'chętny');
});

test('Weteran jest bardziej elastyczny niż gwiazda w szczycie kariery', () => {
  const ctx = { from: legia, to: lechia, fromTier: 1, toTier: 2 };
  const vet = willingnessToJoin({ ...ctx, player: veteran, offerWage: veteran.wage * 1.6 });
  const young = willingnessToJoin({ ...ctx, player: { ...veteran, age: 26 }, offerWage: veteran.wage * 1.6 });
  assert.ok(vet.score > young.score);
  assert.notEqual(young.verdict, 'chętny'); // reprezentant w sile wieku nie schodzi chętnie do 1 Ligi
});

test('Niezadowolenie i końcówka kontraktu zwiększają szansę zgody', () => {
  const ctx = { player: ekRegular, from: lech, to: radomiak, offerWage: 18000, fromTier: 1, toTier: 1 };
  const plain = willingnessToJoin(ctx);
  const unhappy = willingnessToJoin({ ...ctx, player: { ...ekRegular, unhappy: true, monthsLeft: 4 } });
  assert.ok(unhappy.score > plain.score + 0.15);
});

test('Znanego zawodnika trudniej wykupić: klub żąda więcej', () => {
  assert.equal(askingPriceMultiplier(30), 1);
  assert.ok(askingPriceMultiplier(70) > 1.4);
});
