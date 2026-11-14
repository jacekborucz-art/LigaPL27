// Menu systemowe (Opcje, Zapis, Wyjście) i zapis na Google Drive (src/ui/sysMenu.js, src/core/gdrive.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sysDialogHtml, sysNavHtml } from '../src/ui/sysMenu.js';
import { driveConfigured, driveSignedIn, driveSave, multipartBody } from '../src/core/gdrive.js';

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

test('Google Drive: bez identyfikatora aplikacji wyjaśnienie, bez logowania brak zapisu, poprawne żądanie multipart', async () => {
  assert.equal(driveConfigured(), false);
  assert.match(sysDialogHtml('save', { slot: 1 }), /nie jest jeszcze włączony/);
  assert.equal(driveSignedIn(), false);
  await assert.rejects(() => driveSave(1, 'a.json', '{}'), /zaloguj/i);
  const body = multipartBody({ name: 'a.json', mimeType: 'application/json' }, '{"x":1}', 'B');
  assert.ok(body.startsWith('--B\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"name":"a.json"'));
  assert.ok(body.includes('\r\n--B\r\nContent-Type: application/json\r\n\r\n{"x":1}\r\n--B--'));
});
