// Numery na koszulkach i barwy strojów. Numery są trwałe w klubie (game.shirts[clubId] = { playerId: numer }):
// nowy zawodnik dostaje pierwszy wolny numer typowy dla jego pozycji, odchodzący zwalnia swój.
// Lepsi zawodnicy dostają klasyczne numery pierwsi (1 dla bramkarza, 9 dla napastnika, 10 dla rozgrywającego).

const PREF = {
  BR: [1, 12, 22, 33, 99, 31, 41],
  ŚO: [4, 5, 3, 15, 23, 24, 26, 44, 34],
  BO: [2, 3, 13, 22, 27, 28, 32, 17],
  WB: [2, 3, 13, 22, 27, 28, 32, 17],
  DP: [6, 8, 14, 16, 18, 21, 25],
  ŚP: [8, 6, 16, 14, 18, 20, 25, 30],
  OP: [10, 20, 8, 21, 30],
  SP: [7, 11, 17, 19, 21, 77],
  SN: [7, 11, 17, 19, 77, 27],
  NAP: [9, 19, 29, 11, 99, 39],
};

/** Numery zawodników klubu (Map id -> numer). squad: kadra (może być kadrą meczową); uzupełnia brakujące i zapisuje w game.shirts. */
export function shirtNumbers(game, clubId, squad) {
  game.shirts ??= {};
  const prev = game.shirts[clubId] ?? {};
  const ids = new Set(squad.map((p) => p.id));
  const map = {};
  const used = new Set();
  // Numer zostaje, dopóki zawodnik jest w klubie (także gdy nie ma go w kadrze na ten mecz)
  const stays = (id) => ids.has(id) || game.world?.players?.[id]?.clubId === clubId;
  for (const [id, no] of Object.entries(prev)) if (stays(id) && !used.has(no)) { map[id] = no; used.add(no); }
  const todo = squad.filter((p) => map[p.id] == null).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
  for (const p of todo) {
    let no = (PREF[p.pos] ?? []).find((n) => !used.has(n));
    if (no == null) for (let n = 2; n <= 99; n++) if (!used.has(n) && (n !== 1)) { no = n; break; }
    map[p.id] = no; used.add(no);
  }
  game.shirts[clubId] = map;
  return new Map(Object.entries(map));
}

function luminance(hex) {
  const n = parseInt((hex || '#888888').slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}
const grassy = (c) => { const n = parseInt(c.slice(1), 16); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return g > r + 25 && g > b + 10 && luminance(c) < 0.45; };

/** Barwy koszulki klubu na boisku: kolor koszulki, kolor numeru i kolor obwódki (druga barwa). */
export function kitColors(club) {
  const [a = '#F3F6F1', b = '#14211A'] = club?.colors ?? [];
  const shirt = grassy(a) && b ? b : a;
  const second = shirt === a ? b : a;
  const ink = luminance(shirt) > 0.5 ? '#14211A' : '#FFFFFF';
  return { shirt, ink, trim: second && Math.abs(luminance(second) - luminance(shirt)) > 0.12 ? second : ink };
}
