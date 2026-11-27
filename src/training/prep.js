// Przygotowanie pod rywala jako decyzja trenera (docs/bierna-gra.md, runda 3, Nov 27, 2026).
// Analiza wideo rywala nie daje pewnej premii: wynik losuje się raz na mecz (zysk, bez efektu, strata).
// Szanse zależą od tego, kto przygotowuje drużynę:
// - trener gracza sam (zajęcia wideo dodane albo zmienione ręcznie w planie): doświadczenie z liczby meczów w karierze,
// - asystent gracza (zajęcia z planu asystenta): umiejętność asystenta (TAK), słaby asystent częściej się myli,
// - trener AI (zawsze sam ogląda rywala): jego atrybut planowania SKL, ta sama skala co doświadczenie gracza.
// Wielkość zysku i straty też jest losowa; strata jest mniejsza niż zysk. Do tego przewaga AI w analizie
// rywala gracza: losowana raz na mecz od 0 do górnej granicy zależnej od poziomu ligi (decyzja właściciela).
// Wartości [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { staffA } from './staff.js';
import { staffMul } from './config.js';
import { coachOf, coachSkill } from '../career/coaches.js';
import { clubById } from '../data/clubs_pl.js';

export const PREP = {
  base: 0.1, // najmniejsza podstawa premii (trener sam ogląda rywala także bez analityka)
  gain: [0.6, 1.4], // zysk: podstawa x 0,6-1,4 (średnio x1)
  loss: [0.3, 0.8], // strata: podstawa x 0,3-0,8 (średnio x0,55)
  self: { gain: [0.55, 0.75], loss: [0.15, 0.05], full: 300 }, // trener gracza: od nowego do 300 meczów w karierze
  asst: { gain: [0.25, 0.5], loss: [0.45, 0.2], lo: 5, hi: 20, under: -0.25 }, // asystent 5 -> 20 (słabszy niż 5 jeszcze gorzej)
  // Przewaga AI w analizie rywala gracza: X * U^2 (zwykle mało, czasem dużo), X według poziomu ligi klubu AI
  adv: { 1: 0, 2: 0.08, 3: 0.21, 4: 0.21, 5: 0.21 },
};

const r3 = (v) => Math.round(v * 1000) / 1000;
const lerp = (a, b, t) => a + (b - a) * t;

/** Podstawa premii: analityk (0,04 + 0,006 q) albo co najmniej PREP.base. */
export function prepBase(game, clubId) {
  return Math.max(PREP.base, staffMul.prep(staffA(game, clubId, 'analityk', 'RYW')));
}

/** Doświadczenie trenera gracza 0-1 z liczby meczów w karierze (career/coachCareer.js). */
export function userExperience(game) {
  const n = game?.manager?.career?.tot?.n ?? 0;
  return clamp(n / PREP.self.full, 0, 1);
}

/**
 * Szanse { gain, loss } dla przygotowującego: 'self' (trener gracza), 'asst' (asystent gracza), 'ai' (trener AI).
 * Reszta do 1 to „bez efektu”.
 */
export function prepOdds(game, clubId, by) {
  const S = PREP.self;
  if (by === 'asst') {
    const A = PREP.asst;
    const k = staffA(game, clubId, 'asystent', 'TAK');
    const t = clamp((k - A.lo) / (A.hi - A.lo), A.under, 1);
    return { gain: r3(lerp(A.gain[0], A.gain[1], t)), loss: r3(clamp(lerp(A.loss[0], A.loss[1], t), 0, 0.6)) };
  }
  let e;
  if (by === 'ai') {
    const c = coachOf(game, clubId);
    e = c ? (coachSkill(c.a.SKL) + 1) / 2 : 0.5;
  } else e = userExperience(game);
  return { gain: r3(lerp(S.gain[0], S.gain[1], e)), loss: r3(lerp(S.loss[0], S.loss[1], e)) };
}

/**
 * Wynik przygotowania do meczu matchDate (punkty atrybutu na zawodnika): { v, kind: 'gain'|'none'|'loss', by }.
 * Losowanie stałe dla klubu i meczu (ziarno gry), więc ponowne przeliczenie daje ten sam wynik.
 */
export function rollPrep(game, clubId, matchDate, by) {
  const rng = new Rng(`prep:${game?.seed ?? 0}:${clubId}:${matchDate}:${by}`);
  const odds = prepOdds(game, clubId, by);
  const base = prepBase(game, clubId);
  const r = rng.next();
  const u = rng.next();
  if (r < odds.gain) return { v: r3(base * lerp(PREP.gain[0], PREP.gain[1], u)), kind: 'gain', by };
  if (r < odds.gain + odds.loss) return { v: -r3(base * lerp(PREP.loss[0], PREP.loss[1], u)), kind: 'loss', by };
  return { v: 0, kind: 'none', by };
}

/** Przewaga klubu AI w analizie rywala gracza na mecz w dniu date: X * U^2 (0 w Ekstraklasie). */
export function aiScoutAdvantage(game, clubId, date) {
  const tier = clubById(clubId)?.tier ?? 1;
  const X = PREP.adv[tier] ?? 0;
  if (!X) return 0;
  const u = new Rng(`scout-adv:${game?.seed ?? 0}:${date}:${clubId}`).next();
  return r3(X * u * u);
}

/** Opis wyniku przygotowania słowami (studio, trening). */
export function prepLabel(prep) {
  if (!prep) return null;
  const who = prep.by === 'self' ? 'Twoja analiza rywala' : 'Analiza rywala asystenta';
  return prep.kind === 'gain' ? `${who} trafiła: drużyna wie, jak zagrać.`
    : prep.kind === 'loss' ? `${who} chybiła: zawodnicy są trochę zdezorientowani.`
      : `${who} nic nie wniosła: zawodnicy nie załapali planu.`;
}
