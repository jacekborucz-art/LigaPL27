// Okno „Zmiany i taktyka”: wiersze zawodników pokazują ocenę na żywo (także w przerwie), jak lista składu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/matchdayView.js', import.meta.url), 'utf8');
const start = src.indexOf('function managePanel(');
const end = src.indexOf('\n  function ', start + 10);
const body = src.slice(start, end);

test('managePanel czyta ocenę na żywo z playerStates', () => {
  assert.match(body, /playerStates\(M, S\.userSide\)\.map\(\(r\) => \[r\.id, r\.rating\]\)/);
});

test('wiersz zawodnika w oknie zmian ma klasę rt z oceną albo rt--none', () => {
  assert.match(body, /<b class="rt rt--\$\{rBand\(rt\)\}"[^>]*>\$\{rt\.toFixed\(1\)\}<\/b>/);
  assert.match(body, /<b class="rt rt--none"[^>]*>–<\/b>/);
});
