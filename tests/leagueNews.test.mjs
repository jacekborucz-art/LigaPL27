// Poczta: filtr lig (src/core/mailFilter.js) i wiadomości z mediów o innych klubach (src/career/leagueNews.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/world/worldGen.js';
import { mailRelevant } from '../src/core/mailFilter.js';
import { leagueNewsDay, NEWS } from '../src/career/leagueNews.js';
import { createMessage } from '../src/core/inbox.js';

const base = (clubId) => ({ seed: 4, clubId, date: '2026-10-20', world: generateWorld(4), market: { history: [] }, finance: { clubs: {} }, fixtures: [] });
const msg = (key, body = '', priority = 'info') => createMessage({ date: '2026-10-20', key, category: 'competitions', from: 'X', subject: 's', body, priority });

test('Filtr: tylko liga gracza; z wyższych lig i pucharów tylko bardzo ważne', () => {
  const ek = base('widzew'); // Ekstraklasa
  const l1 = base('wisla-krakow'); l1.leagueState = { tiers: { 'wisla-krakow': 2 } };
  assert.equal(mailRelevant(ek, msg('po:liga1')), false, 'koniec sezonu 1 Ligi nie dla Ekstraklasy');
  assert.equal(mailRelevant(l1, msg('po:liga1')), true);
  assert.equal(mailRelevant(ek, msg('uefa-results:2026-10-20')), true);
  assert.equal(mailRelevant(l1, msg('uefa-results:2026-10-20')), false);
  assert.equal(mailRelevant(l1, msg('uefa-tie:x', 'Lech awansuje: Liga Mistrzów, ćwierćfinał.')), true);
  assert.equal(mailRelevant(l1, msg('uefa-tie:x', 'Lech awansuje: Liga Konferencji, 1/8 finału.')), false);
  assert.equal(mailRelevant(l1, msg('pp-draw:R32')), false);
  assert.equal(mailRelevant(l1, msg('pp-draw:SF')), true);
  assert.equal(mailRelevant(l1, msg('uefa-draw:LM:Q2', '', 'important')), true, 'sprawa klubu gracza zawsze');
  assert.equal(mailRelevant(l1, createMessage({ date: '2026-10-20', key: 'nt:1', category: 'national', from: 'X', subject: 's', body: '' })), true, 'reprezentacja zawsze');
});

test('Media: duży transfer, ciężka kontuzja i kłopoty finansowe tylko z ligi gracza i wyższych', () => {
  const g = base('widzew');
  const pl = g.world.clubs.legia.squad[0];
  const p = g.world.players[pl];
  g.market.history.unshift({ date: '2026-10-19', playerId: pl, name: p.name, pos: p.pos, from: 'legia', to: 'lech', fee: NEWS.fee[1] + 1, kind: 'transfer' });
  g.market.history.unshift({ date: '2026-10-19', playerId: 'x', name: 'Mały', pos: 'NAP', from: 'legia', to: 'lech', fee: 1000, kind: 'transfer' });
  const inj = g.world.players[g.world.clubs.lech.squad[1]];
  inj.injuryDays = 200; inj.injury = { name: 'zerwanie więzadeł', days: 200, since: '2026-10-19' };
  g.finance.clubs.korona = { balance: NEWS.debt[1] - 1 };
  g.finance.clubs.widzew = { balance: -5 };
  const keys = leagueNewsDay(g, '2026-10-20').map((m) => m.key.split(':')[0]);
  assert.deepEqual(keys.sort(), ['news-licencja', 'news-transfer', 'news-uraz']);
});
