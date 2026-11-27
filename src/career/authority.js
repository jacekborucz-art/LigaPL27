// Autorytet trenera w szatni (docs/bierna-gra.md, runda 2). Trener, który oddaje wszystko asystentowi (nie rozmawia
// z zawodnikami, nie prowadzi zebrań, nie chodzi na konferencje), z czasem traci szatnię: zawodnicy grają z mniejszym
// przekonaniem. Trener obecny w klubie buduje autorytet. Liczy się trafność, nie liczba kliknięć: rozmowa, która
// trafia do zawodnika, buduje autorytet, rozmowa nietrafiona go obniża; zebranie dobrze przyjęte pomaga, źle przyjęte
// szkodzi; konferencja ze spokojnymi odpowiedziami liczy się bardziej niż konferencja, która narobiła szkód.
// Autorytet 0-1 (start 0,5: nowy trener) zbliża się co tydzień do celu z ostatnich 4 tygodni. Premia za mocny
// autorytet zależy od kadry (lepsza kadra lepiej wykorzystuje dobrą atmosferę), kara za utratę szatni nie.
// Kluby AI: trener AI jest obecny w klubie (rozmowy, zebrania, media), więc ma autorytet neutralny 0,5 i premię 0;
// różnice między trenerami AI są w ich atrybutach (career/coaches.js). Wartości [SZAC].

import { clamp } from '../core/rng.js';
import { registerDailySystem } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { registerModifier } from '../engine/modifiers.js';
import { activeGame } from '../training/state.js';
import { PASSIVE } from '../training/scouting.js';
import { clubById } from '../data/clubs_pl.js';

export const AUTH = {
  window: 28, // dni aktywności branych pod uwagę
  start: 0.5, // nowy trener w klubie
  rate: 0.35, // tygodniowe zbliżenie do celu (ok. 6 tygodni do większości zmiany)
  floor: 0.1, span: 0.85, // cel = 0,1 + 0,85 x aktywność
  // Składniki (suma 1): trafne rozmowy indywidualne minus nietrafione (pełne przy 4 w 4 tygodnie), zebrania dobrze
  // przyjęte minus źle przyjęte (pełne przy 2, mieszane liczą się w 30 %), konferencje: udział odbytych (spokojna 1,
  // szkodliwa 0,6, pominięta 0). Zmiany taktyki i treningu działają przez silnik, analizę rywala i znużenie.
  w: { talk: 0.45, meeting: 0.2, press: 0.35 },
  talkFull: 4, meetingFull: 2, meh: 0.3, pressBad: 0.6,
  // Premia x kadra: 0,5 + (L klubu - 9) / 6, od 0,5 do 1,2 (Legia ok. 1,1, środek Ekstraklasy ok. 0,8, 2 Liga 0,5)
  squad: { base: 0.5, from: 9, per: 6, min: 0.5, max: 1.2 },
  // Wpływ na siłę w meczu (pkt atrybutu na zawodnika): poniżej 0,5 x0,75 (do -0,3), powyżej x0,45 x kadra (do +0,2)
  neg: 0.75, pos: 0.45, min: -0.3, max: 0.2,
  // Zależność szatni od trenera według poziomu ligi (runda 3, Nov 27, 2026): w niższych ligach mniej liderów
  // i samodyscypliny, więc kara i premia rosną (2 Liga do -0,48, III liga do -0,51)
  dep: { 1: 1, 2: 1.15, 3: 1.6, 4: 1.7, 5: 1.7 },
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

/** Zapis aktywności trenera gracza: talkGood/talkMeh/talkBad, meetGood/meetMeh/meetBad, pressGood/press/pressSkip. */
export function logEngage(game, kind, date = game?.date) {
  if (!game || !date) return;
  const ev = Array.isArray(game.engage) ? game.engage : [];
  game.engage = [...ev.filter((e) => days(e.d, date) <= AUTH.window + 7), { d: date, k: kind }].slice(-80);
}

/** Aktywność 0-1 z ostatnich 4 tygodni i jej składniki. */
export function engagement(game, date = game.date) {
  const ev = (game.engage ?? []).filter((e) => { const g = days(e.d, date); return g >= 0 && g < AUTH.window; });
  const n = (k) => ev.filter((e) => e.k === k).length;
  const good = n('pressGood'); const bad = n('press'); const skip = n('pressSkip');
  const press = good + bad;
  const talks = n('talkGood') + AUTH.meh * n('talkMeh') - n('talkBad');
  const meets = n('meetGood') + AUTH.meh * n('meetMeh') - n('meetBad');
  const parts = {
    talk: AUTH.w.talk * clamp(talks / AUTH.talkFull, 0, 1),
    meeting: AUTH.w.meeting * clamp(meets / AUTH.meetingFull, 0, 1),
    press: AUTH.w.press * (press + skip ? (good + AUTH.pressBad * bad) / (press + skip) : 0),
  };
  const s = Object.values(parts).reduce((a, b) => a + b, 0);
  return { s: Math.round(s * 1000) / 1000, parts, matches: press + skip };
}

/** Mnożnik premii z siły kadry (L klubu z danych). */
export function squadFactor(L) {
  const Q = AUTH.squad;
  return clamp(Q.base + ((L ?? Q.from) - Q.from) / Q.per, Q.min, Q.max);
}

/**
 * Premia albo kara autorytetu w meczu (pkt atrybutu na zawodnika). L: siła kadry klubu (premia), kara bez zależności.
 * tier: poziom ligi klubu (mnożnik AUTH.dep dla kary i premii; brak = Ekstraklasa).
 */
export function authorityTerm(v, L = null, tier = null) {
  const d = (v ?? AUTH.start) - 0.5;
  const k = PASSIVE.r3 ? AUTH.dep[tier] ?? 1 : 1; // przed rundą 3: bez mnożnika ligi
  const t = k * (d < 0 ? AUTH.neg * d : AUTH.pos * d * (L == null ? 1 : squadFactor(L)));
  return Math.round(clamp(t, k * AUTH.min, k * AUTH.max) * 1000) / 1000;
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
      body: 'Zawodnicy pytają mnie, gdzie jest trener. Od tygodni nie ma trafnych rozmów, zebrań ani konferencji. '
        + 'Drużyna gra bez przekonania. Porozmawiaj z tymi, którzy tego potrzebują (Kadra, Rozmowy: asystent podpowiada z kim i o czym), zrób zebranie w tonie pasującym do wyników, pokaż się na konferencji.' }));
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
  apply: (p) => { const g = activeGame(); return g && p.clubId === g.clubId ? authorityTerm(authorityOf(g, p.clubId), clubById(p.clubId)?.L, clubById(p.clubId)?.tier) : 0; },
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

/**
 * Dane do widoku Kadra > Rozmowy (bez liczb dla gracza): autorytet słowami, co go buduje w ostatnich 4 tygodniach
 * i podpowiedź. { label, level: 'low'|'mid'|'high', parts: { talk, meeting, press } (0-1), tip }.
 */
export function authoritySummary(game) {
  const v = authorityOf(game, game?.clubId);
  const e = engagement(game ?? {}, game?.date);
  const rel = (k) => Math.round((e.parts[k] / AUTH.w[k]) * 100) / 100;
  const parts = { talk: rel('talk'), meeting: rel('meeting'), press: rel('press') };
  const weakest = Object.entries(parts).sort((a, b) => a[1] - b[1])[0][0];
  const tip = {
    talk: 'Porozmawiaj z zawodnikami, którzy tego potrzebują; asystent podpowiada z kim i o czym. Nietrafiona rozmowa szkodzi.',
    meeting: 'Zebranie w tonie pasującym do wyników buduje autorytet; źle przyjęte go obniża.',
    press: 'Konferencje to obowiązek trenera; pomijanie ich drużyna odbiera jako nieobecność.',
  }[weakest];
  return { label: authorityLabel(v), level: v < AUTH.lowAt ? 'low' : v > AUTH.highAt ? 'high' : 'mid', parts, tip };
}
