// Zapis gry w IndexedDB: 3 sloty, autozapis, eksport i import pliku JSON.
// Gdy IndexedDB jest niedostępne (np. tryb prywatny), zapis działa w pamięci i UI o tym informuje.

export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;
const DB_NAME = 'manager-pilkarski';
const STORE = 'slots';

let dbPromise = null;
const memory = new Map();
let memoryOnly = false;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      memoryOnly = true;
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'slot' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      memoryOnly = true;
      resolve(null);
    };
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function checkSlot(slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) {
    throw new RangeError(`Nieprawidłowy slot zapisu: ${slot}`);
  }
}

export function isMemoryOnly() {
  return memoryOnly;
}

export async function saveSlot(slot, game) {
  checkSlot(slot);
  const record = {
    slot,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    summary: game.summary || null,
    game,
  };
  const db = await openDb();
  if (!db) {
    memory.set(slot, structuredClone(record));
    return record;
  }
  await tx(db, 'readwrite', (s) => s.put(record));
  return record;
}

export async function loadSlot(slot) {
  checkSlot(slot);
  const db = await openDb();
  if (!db) return memory.has(slot) ? structuredClone(memory.get(slot)) : null;
  return (await tx(db, 'readonly', (s) => s.get(slot))) || null;
}

export async function deleteSlot(slot) {
  checkSlot(slot);
  const db = await openDb();
  if (!db) {
    memory.delete(slot);
    return;
  }
  await tx(db, 'readwrite', (s) => s.delete(slot));
}

/**
 * Klub kariery tak, jak go widzi zapis (także stary zapis): nazwa i skrót z datapacku kariery (game.editor.clubs)
 * albo z nazw kariery (game.names), czy kariera ma wczytany datapack (tarcze w barwach) i własny herb.
 * Bez tego lista zapisów pokazywałaby domyślną nazwę z danych gry.
 */
function slotClubInfo(rec) {
  const g = rec?.game;
  const id = rec?.summary?.clubId ?? g?.clubId;
  if (!g || !id) return null;
  const ed = g.editor?.clubs?.[id] ?? {};
  const saved = Array.isArray(g.names?.[id]) ? g.names[id] : [];
  const name = (typeof ed.name === 'string' && ed.name) || (typeof saved[0] === 'string' && saved[0]) || null;
  const short = (typeof ed.short === 'string' && ed.short) || (typeof saved[1] === 'string' && saved[1]) || null;
  const crest = typeof ed.crest === 'string' && ed.crest.startsWith('data:image/') ? ed.crest : null;
  return { name, short, pack: !!g.editor?.packLoaded, crest };
}

/** Lista slotów 1..3 z podsumowaniem (bez wczytywania całej gry do UI). */
export async function listSlots() {
  const out = [];
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    const rec = await loadSlot(slot);
    out.push(rec ? { slot, savedAt: rec.savedAt, summary: rec.summary, club: slotClubInfo(rec) } : { slot, empty: true });
  }
  return out;
}

export function exportJson(record) {
  return JSON.stringify(record);
}

/** Walidacja importowanego pliku. Rzuca błąd z opisem, co jest nie tak. */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Plik nie jest poprawnym JSON-em.');
  }
  if (!data || typeof data !== 'object') throw new Error('Plik nie zawiera zapisu gry.');
  if (data.version !== SAVE_VERSION) {
    throw new Error(`Zapis ma wersję ${data.version}, a gra obsługuje wersję ${SAVE_VERSION}.`);
  }
  if (!data.game || typeof data.game !== 'object' || typeof data.game.seed !== 'number') {
    throw new Error('Zapis nie ma danych gry albo ziarna losowania.');
  }
  return data;
}
