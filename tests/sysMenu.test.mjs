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

test('Zapis: przycisk udostępniania tylko tam, gdzie przeglądarka udostępnia pliki', () => {
  assert.ok(!/sys-share/.test(sysDialogHtml('save', { slot: 1, canShare: false })));
  assert.match(sysDialogHtml('save', { slot: 1, canShare: true }), /data-act="sys-share"/);
  assert.ok(!/Google Drive nie jest/.test(sysDialogHtml('save', { slot: 1 })));
});
