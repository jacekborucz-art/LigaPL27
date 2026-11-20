// Menu systemowe (Opcje, Zapis, Wyjście): src/ui/sysMenu.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sysDialogHtml, sysNavHtml } from '../src/ui/sysMenu.js';

test('Menu systemowe: trzy przyciski i okna Opcje oraz Zapis', () => {
  const nav = sysNavHtml();
  for (const a of ['sys-options', 'sys-save', 'sys-exit']) assert.match(nav, new RegExp(`data-act="${a}"`));
  const opt = sysDialogHtml('options', { theme: 'dark' });
  assert.equal((opt.match(/data-act="sys-theme"/g) ?? []).length, 3);
  assert.match(opt, /value="dark"[^>]*checked/);
  const save = sysDialogHtml('save', { slot: 2 });
  assert.match(save, /data-act="sys-file"/);
  assert.match(save, /slocie 2/);
  assert.ok(!/—/.test(save + opt + nav), 'bez pauz');
});

test('Zapis: tylko zapis pliku, bez udostępniania i bez Google Drive', () => {
  const html = sysDialogHtml('save', { slot: 1 });
  assert.match(html, /data-act="sys-file"/);
  assert.ok(!/sys-share|Google Drive/.test(html));
});

test('Opcje: okienko z wersją gry w formacie vX.Y albo vX.Y.Z (z ewentualnym dopiskiem)', async () => {
  const { GAME_VERSION } = await import('../src/config/version.js');
  assert.match(GAME_VERSION, /^v\d+\.\d+(\.\d+)?( \S+)?$/);
  assert.match(sysDialogHtml('options', { theme: 'auto' }), new RegExp(`Wersja gry <b>${GAME_VERSION}</b>`));
});

test('Ekran startowy: wersja gry pod listą zapisów', async () => {
  const { GAME_VERSION } = await import('../src/config/version.js');
  const { renderMenu } = await import('../src/ui/menuView.js');
  assert.match(renderMenu({ slots: [] }), new RegExp(`Wersja gry <b>${GAME_VERSION}</b>`));
});

test('Opcje: tempo upływu dni (Bez zmian, 1, 2, 3 s) i pauza między dniami', async () => {
  const { dayDelayMs, DAY_SPEEDS } = await import('../src/ui/daySpeed.js');
  const opt = sysDialogHtml('options', { theme: 'auto', speed: '2' });
  assert.equal((opt.match(/data-act="sys-speed"/g) ?? []).length, Object.keys(DAY_SPEEDS).length);
  assert.match(opt, /value="2"[^>]*checked/);
  assert.equal(dayDelayMs('std'), 110);
  assert.equal(dayDelayMs('std', true), 0);
  assert.equal(dayDelayMs('3', true), 3000);
});
