// Atrybut klubu „Negocjacje” 1-20 (docs/negocjacje.md, rozdz. 15): pierwsza oferta, podwyżka w drugiej rundzie,
// poprawka propozycji w ciemno i chęć licytowania się o zawodnika, który rozważa inne oferty. Gracz negocjuje sam.
// Od v1.23 Beta to atrybut Negocjacje dyrektora sportowego klubu (osoba w sztabie, src/career/staffMarket.js,
// docs/dyrektor-sportowy.md); wakat: 5 (zarząd). Jedynym punktem odczytu zostaje clubNegotiation(game, clubId).
// Zapas: game.clubNeg = { [clubId]: { n, y (sezon), d (numer dyrektora) } }; gra bez stanu sztabu (narzędzia, testy
// bez świata) i kluby IV ligi: dawne leniwe losowanie. Wszystkie liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { createMessage } from '../core/inbox.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { SEASON_YEAR } from '../config/calendar2026.js';
import { ensureDirectors, directorOf, directorSeason, personAttr, STAFF_MARKET } from './staffMarket.js'; // dyrektor sportowy (docs/dyrektor-sportowy.md)

export const NEG = {
  mean: { 1: 11.5, 2: 10.5, 3: 9, 4: 8, 5: 7 }, // średnia wg poziomu ligi (1 Ekstraklasa ... 5 IV liga)
  sd: 3, prestige: 1, // odchylenie losowania; prestiż 1-10 przesuwa średnią o -1 do +1
  revert: 0.25, drift: 1.2, // 1 lipca: powrót do średniej 25 % + N(0; 1,2)
  director: { 1: 0.12, 2: 0.1, 3: 0.08, 4: 0.07, 5: 0.07 }, // szansa zmiany dyrektora na sezon
  shock: 0.25, // po zwolnieniu trenera w sezonie albo spadku
  maxChanges: 3, // najwyżej 3 zmiany dyrektora na ligę (grupę III ligi) w sezonie
  // Dźwignie aiNegotiate (q = (N - 1) / 19): oferta x publicDemand, podwyżka w 2. rundzie, przebicie w ciemno
  // najwyżej do cap x publicDemand. scale skaluje wszystkie dźwignie wokół N = 10 (0,6 po kalibracji tools/negocjacje-fair.mjs:
  // N 1-5 wygrywa 47,9 %, N 9-11 50,3 %, N 16-20 52,4 % licytacji z przeciętnym negocjatorem)
  open: [0.94, 0.05], raise: [1.06, 0.08], cap: [1.0, 0.1], scale: 0.6,
  // Poprawka w ciemno: szansa base + need (brak w kadrze) + q x (q - q10); wielkość 4-12 % pensji
  bump: { base: 0.35, need: 0.3, q: 0.3, min: 0.04, max: 0.12 },
  // Licytacja w aiBuy: kara max(0; base - per x (N - 10) + N(0; sd)) OVR za każdą propozycję w toku
  pen: { base: 0.8, per: 0.05, sd: 0.6 },
};
export const Q10 = 9 / 19; // q dla N = 10

const tierOf = (id) => Math.min(5, clubById(id)?.tier ?? 4);
/** Średnia atrybutu klubu: poziom ligi i prestiż. */
export function negMean(clubId) {
  const c = clubById(clubId);
  return NEG.mean[tierOf(clubId)] + NEG.prestige * clamp(((c?.prestige ?? 5) - 5.5) / 4.5, -1, 1);
}

/** Losowanie z rozkładu normalnego obciętego do 1-20 (odrzucanie, w ostateczności przycięcie). */
export function negDraw(rng, mean) {
  for (let i = 0; i < 20; i++) {
    const x = rng.gauss(mean, NEG.sd);
    if (x >= 0.5 && x < 20.5) return Math.round(x);
  }
  return clamp(Math.round(mean), 1, 20);
}

const seasonYear = (game) => game?.seasonYear ?? SEASON_YEAR;

function ensure(game) {
  if (!game.clubNeg || typeof game.clubNeg !== 'object') game.clubNeg = {};
  return game.clubNeg;
}

/**
 * Atrybut Negocjacje klubu (1-20). Jedyny punkt odczytu w kodzie (później: dyrektor sportowy w sztabie).
 * Klub bez zapisu (nowa gra, stary zapis) dostaje leniwie losowaną wartość z ziarna gry, klubu i sezonu.
 */
export function clubNegotiation(game, clubId) {
  if (!game || !clubId) return 10;
  const d = directorNeg(game, clubId);
  if (d != null) return d;
  const S = ensure(game);
  let e = S[clubId];
  if (!e) {
    const y = seasonYear(game);
    e = S[clubId] = { n: negDraw(new Rng(`negInit:${game.seed}:${clubId}:${y}`), negMean(clubId)), y, d: 1 };
  }
  return e.n;
}

/**
 * Negocjacje dyrektora sportowego klubu z kadrą (adaptacja obcokrajowca obniża atrybut), wakat: 5 (zarząd).
 * null: gra bez stanu sztabu albo klub bez kadry (wtedy dawne losowanie).
 */
function directorNeg(game, clubId) {
  const S = game.staff;
  if (!S || !game.world?.clubs?.[clubId] || (clubById(clubId)?.tier ?? 5) > 4) return null;
  if (!S.dirInit?.[clubId]) ensureDirectors(game);
  if (!S.dirInit?.[clubId]) return null;
  const p = directorOf(game, clubId);
  return p ? personAttr(p, 'NEG', game.date) : STAFF_MARKET.vacantQ.dyrektor;
}

/** q 0-1 z atrybutu, przeskalowane wokół N = 10 (NEG.scale). */
export function negQ(n) {
  const q = (clamp(n ?? 10, 1, 20) - 1) / 19;
  return Q10 + NEG.scale * (q - Q10);
}

/**
 * Dźwignie rozmów klubu AI. n = null (np. klub gracza w automatycznych rozmowach): dawne stałe 0,97 i 1,10,
 * bez poprawki w ciemno.
 */
export function negLevers(n) {
  if (n == null) return { open: 0.97, raise: 1.1, cap: 0, q: null };
  const q = negQ(n);
  return { open: NEG.open[0] + NEG.open[1] * q, raise: NEG.raise[0] + NEG.raise[1] * q, cap: NEG.cap[0] + NEG.cap[1] * q * q, q };
}

/** Kara licytacji w aiBuy (OVR za jedną propozycję w toku), ziarno: gra, zawodnik, klub, data. */
export function contestPenalty(game, pid, clubId, date) {
  const n = clubNegotiation(game, clubId);
  const r = new Rng(`licytacja:${game.seed}:${pid}:${clubId}:${date}`);
  return Math.max(0, NEG.pen.base - NEG.pen.per * (n - 10) + r.gauss(0, NEG.pen.sd));
}

/** Zwolnienia trenerów klubów AI w sezonie (wpisy game.coachLog od from do to, bez odejść i zastępstw). */
function firedClubs(game, from, to) {
  const out = new Set();
  for (const e of game.coachLog ?? []) if (e.date >= from && e.date < to && ['wyniki', 'kibice', 'po sezonie'].includes(e.why)) out.add(e.club);
  return out;
}

/**
 * 1 lipca (rolloverSeason, po zmianie lig): powrót do średniej z szumem i zmiany dyrektorów. relegated: zbiór
 * spadkowiczów. Zwraca wiadomości o zmianie dyrektora (mailFilter przepuszcza tylko ligę gracza), bez wartości.
 */
export function negSeason(game, year, { relegated = new Set(), date = `${year}-07-01` } = {}) {
  // Dyrektorzy sportowi jako osoby: zmiany przez rynek dyrektorów (staffMarket.js directorSeason)
  if (game.staff && game.world?.clubs) return directorSeason(game, year, { relegated, date });
  const S = ensure(game);
  const fired = firedClubs(game, `${year - 1}-07-01`, date);
  const ids = CLUBS_PL.filter((c) => game.world?.clubs?.[c.id]).map((c) => c.id);
  const changes = new Map(); // liga (poziom i grupa) -> liczba zmian dyrektora
  const msgs = [];
  const order = new Rng(`negSeason:${game.seed}:${year}`).shuffle(ids);
  for (const id of order) {
    const before = clubNegotiation(game, id);
    const e = S[id];
    if (e.y >= year) continue; // już po tym 1 lipca (np. leniwe losowanie w tym sezonie)
    const mean = negMean(id);
    const t = tierOf(id);
    const league = `${t}:${t === 4 ? clubById(id)?.group ?? '' : ''}`;
    const rng = new Rng(`negYr:${game.seed}:${id}:${year}`);
    const p = fired.has(id) || relegated.has(id) ? NEG.shock : NEG.director[t];
    if (rng.chance(p) && (changes.get(league) ?? 0) < NEG.maxChanges) {
      changes.set(league, (changes.get(league) ?? 0) + 1);
      e.n = negDraw(new Rng(`negDir:${game.seed}:${id}:${year}`), mean);
      e.d = (e.d ?? 1) + 1;
      if (id !== game.clubId) {
        const name = clubById(id)?.name ?? id;
        msgs.push(createMessage({ date, key: `dyrektor:${id}:${year}`, category: 'media', from: 'Media', priority: 'info',
          subject: `${name}: nowy dyrektor sportowy`,
          body: `${name} ma nowego dyrektora sportowego. To on poprowadzi rozmowy z zawodnikami w letnim oknie transferowym.` }));
      }
    } else {
      e.n = clamp(Math.round(before + NEG.revert * (mean - before) + rng.gauss(0, NEG.drift)), 1, 20);
    }
    e.y = year;
  }
  return msgs;
}
