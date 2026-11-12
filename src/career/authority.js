// Autorytet trenera w szatni (docs/bierna-gra.md, runda 2). Trener, który oddaje wszystko asystentowi (nie rozmawia
// z zawodnikami, nie prowadzi zebrań, nie chodzi na konferencje, nie zmienia planu ani treningu), z czasem traci
// szatnię: zawodnicy grają z mniejszym przekonaniem. Trener obecny w klubie buduje autorytet i dostaje małą premię.
// Autorytet 0-1 (start 0,5: nowy trener) zbliża się co tydzień do celu z aktywności w ostatnich 4 tygodniach.
// Kluby AI: trener AI jest obecny w klubie (rozmowy, zebrania, media), więc ma autorytet neutralny 0,5 i premię 0;
// różnice między trenerami AI są w ich atrybutach (career/coaches.js). Wartości [SZAC].

import { clamp } from '../core/rng.js';
import { registerDailySystem } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { registerModifier } from '../engine/modifiers.js';
import { activeGame } from '../training/state.js';
import { PASSIVE } from '../training/scouting.js';

export const AUTH = {
  window: 28, // dni aktywności branych pod uwagę
  start: 0.5, // nowy trener w klubie
  rate: 0.35, // tygodniowe zbliżenie do celu (ok. 6 tygodni do większości zmiany)
  floor: 0.1, span: 0.85, // cel = 0,1 + 0,85 x aktywność
  // Składniki aktywności (suma 1): rozmowy indywidualne (pełne przy 4 w 4 tygodnie), zebrania (2), konferencje
  // (udział odbytych), zmiana planu meczowego co najmniej raz, decyzja treningowa co najmniej raz
  w: { talk: 0.35, meeting: 0.15, press: 0.3, tactic: 0.1, train: 0.1 },
  talkFull: 4, meetingFull: 2,
  // Wpływ na siłę w meczu (pkt atrybutu na zawodnika): poniżej 0,5 x0,6 (do -0,25), powyżej x0,35 (do +0,15)
  neg: 0.6, pos: 0.35, min: -0.25, max: 0.15,
  lowAt: 0.3, highAt: 0.75, // wiadomości asystenta
};

const DAY = 86400000;
const days = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

/** Stan: game.authority = { v, club, s, low, high }, dziennik aktywności game.engage = [{ d, k }]. */
export function authorityState(game) {
  const a = game.authority && typeof game.authority === 'object' ? game.authority : null;
  if (!a || a.club !== game.clubId) game.authority = { v: AUTH.start, club: game.clubId, s: null };
  return game.authority;
}

/** Zapis aktywności trenera gracza (talk, meeting, press, pressSkip, tactic, train). */
export function logEngage(game, kind, date = game?.date) {
  if (!game || !date) return;
  const ev = Array.isArray(game.engage) ? game.engage : [];
  game.engage = [...ev.filter((e) => days(e.d, date) <= AUTH.window + 7), { d: date, k: kind }].slice(-80);
}

/** Aktywność 0-1 z ostatnich 4 tygodni i jej składniki. */
export function engagement(game, date = game.date) {
  const ev = (game.engage ?? []).filter((e) => { const g = days(e.d, date); return g >= 0 && g < AUTH.window; });
  const n = (k) => ev.filter((e) => e.k === k).length;
  const press = n('press'); const skip = n('pressSkip');
  const parts = {
    talk: AUTH.w.talk * Math.min(1, n('talk') / AUTH.talkFull),
    meeting: AUTH.w.meeting * Math.min(1, n('meeting') / AUTH.meetingFull),
    press: AUTH.w.press * (press + skip ? press / (press + skip) : 0),
    tactic: n('tactic') ? AUTH.w.tactic : 0,
    train: n('train') ? AUTH.w.train : 0,
  };
  const s = Object.values(parts).reduce((a, b) => a + b, 0);
  return { s: Math.round(s * 1000) / 1000, parts, matches: press + skip };
}

/** Premia albo kara autorytetu w meczu (pkt atrybutu na zawodnika). */
export function authorityTerm(v) {
  const d = (v ?? AUTH.start) - 0.5;
  return Math.round(clamp(d < 0 ? AUTH.neg * d : AUTH.pos * d, AUTH.min, AUTH.max) * 1000) / 1000;
}

export function authorityLabel(v) {
  return v >= 0.8 ? 'Mocny' : v >= 0.6 ? 'Dobry' : v >= 0.4 ? 'Przeciętny' : v >= 0.25 ? 'Słabnie' : 'Szatnia wymyka się trenerowi';
}

/** Krok tygodniowy autorytetu trenera gracza. Długa przerwa bez meczów (np. zima) nie zmienia autorytetu. */
export function authorityWeek(game, date) {
  if (!PASSIVE.enabled || !PASSIVE.authority || !game?.clubId) return [];
  const a = authorityState(game);
  const e = engagement(game, date);
  if (!e.matches) return [];
  const target = AUTH.floor + AUTH.span * e.s;
  a.v = Math.round(clamp(a.v + AUTH.rate * (target - a.v), 0, 1) * 1000) / 1000;
  a.s = e.s;
  const out = [];
  if (a.v < AUTH.lowAt && !a.low) {
    a.low = true; a.high = false;
    out.push(createMessage({ date, category: 'staff', from: 'Asystent trenera', key: `autorytet-niski:${date}`, subject: 'Szatnia czuje brak trenera',
      body: 'Zawodnicy pytają mnie, gdzie jest trener. Od tygodni nie ma rozmów, zebrań ani konferencji, a plan meczu i trening się nie zmieniają. '
        + 'Drużyna gra bez przekonania. Porozmawiaj z zawodnikami (Kadra, Rozmowy), zrób zebranie, pokaż się na konferencji, dobierz plan pod rywala.' }));
  } else if (a.v > AUTH.highAt && !a.high) {
    a.high = true; a.low = false;
    out.push(createMessage({ date, category: 'staff', from: 'Asystent trenera', key: `autorytet-wysoki:${date}`, subject: 'Drużyna czuje rękę trenera',
      body: 'Zawodnicy widzą, że trener jest z nimi na co dzień: rozmowy, zebrania, plan na każdego rywala. W szatni jest dobra energia i to widać na boisku.' }));
  } else if (a.v >= AUTH.lowAt + 0.1 && a.v <= AUTH.highAt - 0.1) { a.low = false; a.high = false; }
  return out;
}

/** Autorytet trenera klubu zawodnika: gracz z zapisu, kluby AI neutralnie. */
export function authorityOf(game, clubId) {
  if (!game || clubId !== game.clubId || !PASSIVE.enabled || !PASSIVE.authority) return AUTH.start;
  return game.authority?.club === game.clubId ? game.authority.v : AUTH.start;
}

registerModifier({
  id: 'coachAuthority', scope: 'player', label: 'Autorytet trenera',
  apply: (p) => { const g = activeGame(); return g && p.clubId === g.clubId ? authorityTerm(authorityOf(g, p.clubId)) : 0; },
});

registerDailySystem({
  id: 'authority', order: 92,
  run(game, date) {
    if (!game?.world || new Date(`${date}T12:00:00Z`).getUTCDay() !== 1) return {};
    if (game.authWeek === date) return {};
    game.authWeek = date;
    return { messages: authorityWeek(game, date) };
  },
});
