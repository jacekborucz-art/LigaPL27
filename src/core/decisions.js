// Decyzje z poczty: wiadomość z akcjami ma refs.kind, a moduł gry rejestruje obsługę wyboru gracza.
// Dzięki temu nowe rodzaje decyzji (oferty, propozycje pracy) nie wymagają zmian w aplikacji.

const handlers = new Map();

/** fn(game, message, actionId) -> wiadomości do dodania (opcjonalnie). */
export function registerDecision(kind, fn) { handlers.set(kind, fn); }

export function runDecision(game, message, actionId) {
  const h = handlers.get(message?.refs?.kind);
  return h ? h(game, message, actionId) ?? [] : [];
}
