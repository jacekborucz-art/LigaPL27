// Siła reprezentacji w czasie (docs/kalendarz-reprezentacji.md, rozdz. Siła): Elo po każdym meczu
// symulowanym w grze (współczynnik K zależny od wagi meczu, przewaga gospodarza), L liczone ze wzoru
// z docs/reprezentacje.md. Raz w roku 15 % powrotu do długoterminowego poziomu kraju (Elo z danych),
// żeby po 100 latach świat nie rozjechał się losowo (kraj może mieć złote pokolenie, ale nie zostaje gigantem na zawsze).
//
// Stan: game.intl.ratings = { KOD: Elo }. bindRatings() podpina go pod ntTeam() z national.js.

/** L ze wzoru: 7 + (Elo - 860) / 125, miękki sufit od 16.5, minimum 6.5, zaokrąglenie do 0.1. */
export function lFromElo(elo) {
  let L = 7 + (elo - 860) / 125;
  if (L > 16.5) L = 16.5 + 0.25 * (L - 16.5);
  return Math.round(Math.max(6.5, L) * 10) / 10;
}

let LIVE = null;
const cache = new Map();
/** Podpina oceny gry (obiekt { KOD: Elo }) pod ntTeam(). null: wartości z danych. */
export function bindRatings(r) {
  if (LIVE === r) return;
  LIVE = r ?? null;
  cache.clear();
}
export const boundRatings = () => LIVE;

/** Dane reprezentacji z bieżącym Elo i L (ten sam obiekt, gdy ocena się nie zmieniła). */
export function liveTeam(t) {
  if (!LIVE || !t) return t;
  const e = LIVE[t.kod];
  if (e == null || e === t.elo) return t;
  const c = cache.get(t.kod);
  if (c && c.elo === e) return c;
  const o = { ...t, elo: e, L: lFromElo(e) };
  cache.set(t.kod, o);
  return o;
}

// Współczynnik K: proporcje jak w World Football Elo (MŚ 60, mistrzostwa kontynentu 50, eliminacje, Liga Narodów
// i baraże 40, towarzyskie 20), ale połowa wartości: mecze symulowane nie niosą informacji o realnej zmianie siły
// kadry, więc pełne K robiło z Elo błądzenie losowe (sprawdzone na 100 latach symulacji).
export const K_BY = { WC: 30, CT: 25, Q: 20, LN: 20, PO: 20, F: 10 };
const HOME = 100;

/**
 * Aktualizacja Elo po meczu. score: [gole gospodarza, gole gościa] po 120 minutach (karne: remis).
 * kind: klucz K_BY. Zwraca zmianę Elo gospodarza.
 */
export function eloUpdate(r, home, away, score, { kind = 'Q', neutral = false } = {}) {
  if (!r || r[home] == null || r[away] == null) return 0;
  const dr = r[home] + (neutral ? 0 : HOME) - r[away];
  const we = 1 / (10 ** (-dr / 400) + 1);
  const w = score[0] > score[1] ? 1 : score[0] < score[1] ? 0 : 0.5;
  const n = Math.abs(score[0] - score[1]);
  const g = n <= 1 ? 1 : n === 2 ? 1.5 : (11 + n) / 8;
  const d = (K_BY[kind] ?? 30) * g * (w - we);
  r[home] = Math.round((r[home] + d) * 10) / 10;
  r[away] = Math.round((r[away] - d) * 10) / 10;
  return d;
}

/** Roczny powrót części różnicy do poziomu bazowego (base: { KOD: Elo z danych }). */
export function regressRatings(r, base, f = 0.1) {
  for (const k of Object.keys(r)) if (base[k] != null) r[k] = Math.round((r[k] + f * (base[k] - r[k])) * 10) / 10;
}
