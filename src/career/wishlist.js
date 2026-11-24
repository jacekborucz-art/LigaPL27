// Lista życzeń gracza (Transfery, Rynek, Lista życzeń): zawodnicy innych klubów, wolni i z zagranicy, które gracz chce mieć
// na oku. Stan: game.market.wishlist = [{ id, added }] (added: data dodania ISO). Stare zapisy bez pola działają:
// lista powstaje leniwie przy pierwszym dodaniu, odczyt bez pola daje pustą listę. Zawodnik, który trafi do klubu gracza
// albo zniknie ze świata (koniec kariery), jest z listy usuwany przy odczycie (prune). Zawodnik bez klubu i bez kontraktu
// jest pełnoprawnym wpisem. Skauting ma własną listę obserwowanych (src/career/scoutOps.js) i jej tu nie dublujemy.

const arr = (game) => (Array.isArray(game?.market?.wishlist) ? game.market.wishlist : []);

/** Czy zawodnika wolno dodać: istnieje i nie gra w klubie gracza. */
export function canWish(game, p) {
  // Własny zawodnik (także wypożyczony do innego klubu) nie trafia na listę życzeń
  return !!p && !!game?.world?.players?.[p.id] && p.clubId !== game.clubId && p.loan?.from !== game.clubId;
}

/** Usuwa z listy zawodników, których już nie ma w świecie albo którzy są w klubie gracza. Zwraca liczbę usuniętych. */
export function prune(game) {
  const list = arr(game);
  if (!list.length) return 0;
  const keep = list.filter((w) => canWish(game, game.world.players[w.id]));
  if (keep.length === list.length) return 0;
  game.market.wishlist = keep;
  return list.length - keep.length;
}

export function has(game, id) {
  prune(game);
  return arr(game).some((w) => w.id === id);
}

/** Dodaje zawodnika (bez duplikatów). Zwraca { ok, text }. */
export function add(game, id) {
  const p = game?.world?.players?.[id];
  if (!canWish(game, p)) return { ok: false, text: 'Tego zawodnika nie da się dodać do listy życzeń.' };
  prune(game);
  if (!game.market) return { ok: false, text: 'Rynek nie jest jeszcze gotowy.' };
  if (!Array.isArray(game.market.wishlist)) game.market.wishlist = [];
  if (game.market.wishlist.some((w) => w.id === id)) return { ok: true, text: `${p.name} jest już na liście życzeń.` };
  game.market.wishlist.push({ id, added: game.date });
  return { ok: true, text: `${p.name} dodany do listy życzeń.` };
}

/** Usuwa zawodnika z listy (także gdy zniknął ze świata). */
export function remove(game, id) {
  const p = game?.world?.players?.[id];
  const list = arr(game);
  if (list.some((w) => w.id === id)) game.market.wishlist = list.filter((w) => w.id !== id);
  return { ok: true, text: `${p?.name ?? 'Zawodnik'} usunięty z listy życzeń.` };
}

/** Przełącza stan listy (przycisk „Do listy życzeń” / „Usuń z listy życzeń”). */
export const toggle = (game, id) => (has(game, id) ? remove(game, id) : add(game, id));

/** Lista do widoku: [{ p, added }], najnowsze na górze; po przejściu prune. */
export function list(game) {
  prune(game);
  return arr(game).map((w) => ({ p: game.world.players[w.id], added: w.added ?? '' }))
    .sort((a, b) => b.added.localeCompare(a.added) || a.p.name.localeCompare(b.p.name, 'pl'));
}

export const count = (game) => list(game).length;
