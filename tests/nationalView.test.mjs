// Widok reprezentacji (src/ui/nationalView.js) na stanie silnika z różnych lat: wszystkie zakładki bez błędów,
// bez "undefined", bez długich myślników, z bieżącymi rozgrywkami i historią.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNational, nationalDay } from '../src/season/national.js';
import { createIntl, intlDay, rateNt } from '../src/season/intl/engine.js';
import { addDaysIso } from '../src/season/intl/windows.js';
import { bindRatings } from '../src/season/intl/ratings.js';
import { renderNational, nationalViews } from '../src/ui/nationalView.js';

function gameAt(until) {
  const N = createNational(9); const I = createIntl(9); const intlHistory = [];
  for (let d = '2026-07-01'; d <= until; d = addDaysIso(d, 1)) {
    bindRatings(I.ratings);
    if (d <= '2027-12-31') nationalDay(N, d, {}, { windows: [], onResult: (m) => rateNt(I, m) });
    intlDay(I, d, { N, history: intlHistory });
  }
  return { date: until, national: N, intl: I, intlHistory, world: { players: {}, clubs: {} }, clubId: 'x' };
}

for (const [date, expect] of [['2026-10-20', ['Liga Narodów 2026/27', 'Euro 2028']], ['2028-06-25', ['Euro 2028', 'Liga Narodów 2028/29']], ['2030-07-05', ['MŚ 2030', 'Mistrzostwa świata', 'Złoty Puchar']], ['2035-11-30', ['Euro 2036', 'Historia']]]) {
  test(`Widok reprezentacji ${date}: wszystkie zakładki`, () => {
    const g = gameAt(date);
    const html = nationalViews(g).map(([v]) => renderNational(g, v)).join('\n');
    for (const e of expect) assert.ok(html.includes(e), `${date}: brak „${e}”`);
    assert.ok(!/undefined|NaN|\[object/.test(html), `${date}: ${html.match(/.{40}(undefined|NaN|\[object).{40}/)?.[0]}`);
    assert.ok(!html.includes('—'), 'długi myślnik');
    bindRatings(null);
  });
}
