// Lista zapisów: nazwa i herb klubu z zapisu kariery (datapack, nazwy kariery), nie z domyślnych danych gry
// (src/core/store.js slotClubInfo, src/ui/menuView.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { saveSlot, listSlots, deleteSlot } from '../src/core/store.js';
import { renderMenu } from '../src/ui/menuView.js';

test('Kariera z datapackiem: nazwa, skrót i tarcza z zapisu; zwykła kariera: nazwy z jej startu', async () => {
  const pack = { seed: 1, clubId: 'lech', date: '2026-07-01', summary: { clubId: 'lech', season: '2026/27', date: '2026-07-01', names: 'real' },
    editor: { packLoaded: true, clubs: { lech: { name: 'Kolejorz Poznań', short: 'KOL' } }, players: {} }, names: { lech: ['Lech Poznań', 'LPO'] } };
  const plain = { seed: 2, clubId: 'legia', date: '2026-07-01', summary: { clubId: 'legia', season: '2026/27', date: '2026-07-01', names: 'real' }, names: { legia: ['Legia Warszawa', 'LEG'] } };
  await saveSlot(1, pack); await saveSlot(2, plain);
  const slots = await listSlots();
  assert.equal(slots[0].club.name, 'Kolejorz Poznań');
  assert.equal(slots[0].club.pack, true);
  assert.equal(slots[1].club.name, 'Legia Warszawa');
  const html = renderMenu({ slots, notice: null, memoryOnly: true, theme: 'auto', confirmDel: null, view: 'saves' });
  assert.match(html, /<b class="save__club">Kolejorz Poznań<\/b>/);
  assert.doesNotMatch(html, /Lech Poznań/);
  assert.match(html, /Legia Warszawa/);
  await deleteSlot(1); await deleteSlot(2);
});
