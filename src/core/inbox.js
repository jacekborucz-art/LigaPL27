// Skrzynka pocztowa managera: wiadomości od zarządu, sztabu, zawodników, mediów, rozgrywek.
// Stan to zwykła tablica obiektów JSON w zapisie gry. Wiadomości o tym samym kluczu (key)
// nie dublują się. Skrzynka trzyma najnowsze 400 wiadomości.

export const CATEGORIES = {
  board: 'Zarząd',
  staff: 'Sztab',
  players: 'Zawodnicy',
  transfers: 'Transfery',
  competitions: 'Rozgrywki',
  national: 'Reprezentacja',
  media: 'Media',
  club: 'Klub',
};

// urgent: wymaga decyzji, zatrzymuje upływ dni; important: zatrzymuje dni; info: tylko w skrzynce.
export const PRIORITY = { info: 0, important: 1, urgent: 2 };
export const INBOX_CAP = 400;

let seq = 0;

/**
 * msg: { date, category, from, subject, body, priority?, key?, actions?: [{ id, label }], refs? }
 */
export function createMessage(msg) {
  if (!CATEGORIES[msg.category]) throw new Error(`Nieznana kategoria wiadomości: ${msg.category}`);
  seq = (seq + 1) % 1e6;
  return {
    id: msg.key ? `k:${msg.key}` : `${msg.date}:${msg.category}:${seq}`,
    key: msg.key ?? null,
    date: msg.date,
    category: msg.category,
    from: msg.from,
    subject: msg.subject,
    body: msg.body,
    priority: msg.priority ?? 'info',
    actions: msg.actions ?? [],
    refs: msg.refs ?? null,
    read: false,
    resolved: msg.actions?.length ? false : true,
  };
}

/** Dodaje wiadomości (bez duplikatów po kluczu). Zwraca nową tablicę i listę faktycznie dodanych. */
export function addMessages(inbox, messages) {
  const keys = new Set(inbox.filter((m) => m.key).map((m) => m.key));
  const added = [];
  for (const m of messages) {
    if (m.key && keys.has(m.key)) continue;
    if (m.key) keys.add(m.key);
    added.push(m);
  }
  const next = [...added.reverse(), ...inbox]; // najnowsze na górze
  return { inbox: next.slice(0, INBOX_CAP), added: added.reverse() };
}

export function unreadCount(inbox, category = null) {
  return inbox.filter((m) => !m.read && (!category || m.category === category)).length;
}

export function markRead(inbox, id) {
  return inbox.map((m) => (m.id === id ? { ...m, read: true } : m));
}

export function markAllRead(inbox) {
  return inbox.map((m) => (m.read ? m : { ...m, read: true }));
}

export function resolveMessage(inbox, id, actionId) {
  return inbox.map((m) => (m.id === id ? { ...m, read: true, resolved: true, chosen: actionId } : m));
}

export function deleteMessage(inbox, id) {
  return inbox.filter((m) => m.id !== id);
}

export function filterInbox(inbox, category = null) {
  return category ? inbox.filter((m) => m.category === category) : inbox;
}

/** Nierozwiązane wiadomości wymagające decyzji (np. odpowiedź na prośbę zawodnika). */
export function pendingDecisions(inbox) {
  return inbox.filter((m) => !m.resolved && m.actions.length > 0);
}
