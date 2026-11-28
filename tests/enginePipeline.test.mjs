// Strażnik „bit w bit” projektu Walka taktyk (docs/walka-taktyk.md, krok 1). Pełny silnik (210 meczów ze stałymi
// ziarnami), siła drużyn (teamRating, lineupRating), mecze w tle (quickMatch) i krótki przebieg sezonu z dniem
// meczowym muszą dać dokładnie te same skróty co zapisane złote skróty (od Nov 28, 2026: krok 2, wyłączniki ENGINE2
// włączone; skróty kroku 1 sprawdza tests/engine2.test.mjs z wyłącznikami false).
// Zmiana liczb silnika (balans, nowy czynnik) zmienia skróty: wtedy świadomie zapisz nowe (tests/enginePipeline.golden.json,
// skrypt w docs/walka-taktyk.md) i opisz zmianę w dzienniku. Pomocnicze: tests/pipelineGolden.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { goldenMatch, matchDigest, ratingDigests, quickDigests, seasonDigest, h32, N_MATCHES } from './pipelineGolden.mjs';

const GOLD = JSON.parse(fs.readFileSync(new URL('./enginePipeline.golden.json', import.meta.url), 'utf8'));

test(`Pełny silnik: ${N_MATCHES} meczów ze stałymi ziarnami daje te same zdarzenia, wynik, statystyki i oceny co złote skróty`, () => {
  assert.equal(GOLD.matches.length, N_MATCHES);
  const diff = [];
  for (let i = 0; i < N_MATCHES; i++) {
    const d = matchDigest(goldenMatch(i));
    const got = `${h32(d)} ${d.split('|')[2]}`;
    if (got !== GOLD.matches[i]) diff.push(`${i}: ${got} zamiast ${GOLD.matches[i]}`);
  }
  assert.deepEqual(diff, [], `Mecze różne od złotych (${diff.length}):\n${diff.slice(0, 10).join('\n')}`);
});

test('Siła drużyn (teamRating, lineupRating, rozbicie) i mecze w tle (quickMatch) bez zmian', () => {
  assert.equal(h32(ratingDigests().join('|')), GOLD.ratings, 'teamRating, lineupRating albo breakdown');
  assert.equal(h32(quickDigests().join('|')), GOLD.quick, 'quickMatch albo quickKnockout');
});

test('Krótki sezon (systemy dnia, mecze w tle, dzień meczowy gracza w pełnym silniku) bez zmian', () => {
  const s = seasonDigest();
  assert.equal(s.played, GOLD.season.played);
  assert.equal(s.date, GOLD.season.date);
  assert.equal(h32(JSON.stringify(s)), GOLD.season.hash, 'tabele, wyniki albo stan kadry gracza');
});
