// Wykres formy zawodnika: 10 ostatnich ocen, zgodność ze starszymi zapisami (tylko p.form).
import test from 'node:test';
import assert from 'node:assert/strict';
import { formChartHtml, formHistory, formTrend, FORM_MATCHES } from '../src/ui/formChart.js';

const fh = (rs) => rs.map((r, i) => [r, `2026-08-${String(i + 1).padStart(2, '0')}`, 'legia', 'ekstraklasa', i === 2 ? 1 : 0, 0, i % 2]);

test('Wykres pokazuje najwyżej 10 ostatnich meczów, średnią i trend', () => {
  const p = { fh: fh([6.1, 6.3, 6.5, 6.4, 6.6, 6.8, 6.7, 7.2, 7.4, 7.6, 7.8]) };
  const list = formHistory(p);
  assert.equal(list.length, FORM_MATCHES);
  assert.equal(list.at(-1).r, 7.8);
  const html = formChartHtml(p);
  assert.equal((html.match(/<circle /g) ?? []).length, 10);
  assert.ok(html.includes('7.8'), 'etykieta ostatniej oceny');
  assert.equal(formTrend(list), 1);
  assert.ok(html.includes('Legia'), 'rywal w podpowiedzi punktu');
});

test('Stare zapisy: wykres z p.form, puste przy jednym meczu', () => {
  assert.equal((formChartHtml({ form: [6.5, 7.0, 6.2] }).match(/<circle /g) ?? []).length, 3);
  assert.ok(formChartHtml({ form: [7] }).includes('fch--empty'));
  assert.ok(formChartHtml({}).includes('fch--empty'));
});
