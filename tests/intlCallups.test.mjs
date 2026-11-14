// Powołania na turnieje (src/season/national.js + intl/engine.js): Euro 2028 i turnieje kontynentalne.
// Zawodnicy reprezentacji grającej w turnieju są niedostępni dla klubu do odpadnięcia drużyny, inni wracają po oknie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/world/worldGen.js';
import { isAvailable } from '../src/career/squad.js';
import { teamDone } from '../src/season/intl/engine.js';
import '../src/season/nationalSystem.js';
import { processDay } from '../src/core/gameLoop.js';
import { addDaysIso } from '../src/season/intl/windows.js';
import { bindRatings } from '../src/season/intl/ratings.js';

test('Euro 2028 i Puchar Narodów Afryki 2027: powołani zostają do odpadnięcia reprezentacji, pozostali wracają po oknie', () => {
  // Tylko system reprezentacji w pętli dni (ten sam kod co w grze: powołania, silnik, statystyki w meczach)
  const world = generateWorld(4);
  const game = { seed: 4, clubId: 'lech', date: '2026-07-01', world, inbox: [], fixtures: [] };
  const P = world.players;
  let N; let I;
  let afcon = 0; let euroChecks = 0; let released = 0;
  for (let d = '2026-07-01'; d <= '2028-07-12'; d = addDaysIso(d, 1)) {
    game.date = d;
    // Odpadnięcie znane przed dniem (zwolnienie następuje w dniu po ostatnim meczu)
    const pre = game.intl?.comps['EURO-2028'] ? new Map(game.intl.comps['EURO-2028'].teams.map((t) => [t, teamDone(game.intl, 'EURO-2028', t)])) : null;
    processDay(game);
    N = game.national; I = game.intl;
    check(d, pre);
  }
  function check(d, pre) {
    if (d === '2027-06-25') {
      const st = N.windows['T:AFCON-2027'];
      assert.ok(st, 'zgrupowanie na PNA');
      for (const c of st.list) { assert.ok(I.comps['AFCON-2027'].teams.includes(c.team)); if (!c.off) { assert.ok(P[c.id].callUp && !isAvailable(P[c.id])); afcon++; } }
    }
    if (d === '2028-06-12' || d === '2028-06-20' || d === '2028-07-02') {
      const st = N.windows['2028-05-29'];
      const euro = I.comps['EURO-2028'];
      assert.ok(st && euro, 'okno sparingów i turniej');
      for (const c of st.list) {
        const p = P[c.id]; if (!p) continue;
        const out = pre?.get(c.team) ?? null;
        const playing = !c.u21 && euro.teams.includes(c.team) && (!out || d <= out); // zwolnienie dzień po ostatnim meczu
        assert.equal(!!p.callUp, playing, `${d} ${p.name} ${c.team} ${out}`);
        if (playing) { assert.equal(isAvailable(p), false); euroChecks++; } else released++;
      }
    }
  }
  assert.ok(afcon > 0, 'zawodnicy na PNA');
  assert.ok(euroChecks > 0 && released > 0, `na Euro ${euroChecks}, zwolnieni ${released}`);
  // Po turnieju nikt nie jest na zgrupowaniu, zawodnicy uczestników mają mecze z Euro w historii
  assert.equal(Object.values(P).filter((p) => p.callUp).length, 0);
  const st = N.windows['2028-05-29'];
  assert.ok(st.list.filter((c) => c.tour).every((c) => c.off));
  assert.ok(st.list.some((c) => c.tour && c.minutes > 0), 'minuty w turnieju');
  bindRatings(null);
});
