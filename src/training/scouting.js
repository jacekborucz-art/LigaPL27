// Przewidywalność taktyczna i analiza rywala (docs/bierna-gra.md). Analitycy rywala oglądają nasze ostatnie mecze:
// gdy drużyna gra ciągle tym samym ustawieniem i z tymi samymi instrukcjami, rywal przygotowuje się pod nasz schemat
// i dostaje małą premię w dniu meczu (w punktach atrybutu, ten sam rejestr co analiza wideo, modyfikator trainingPrep).
// Gdy plan się zmienia, wiedza rywala słabnie, a nieoczekiwany plan daje nam małą przewagę zaskoczenia.
// Jakość analizy zależy od analityka (sztab, staff.js) i trenera rywala (SKL, TAK, career/coaches.js).
// Ta sama reguła działa dla wszystkich klubów: klub gracza ma przewidywalność z zapisu swoich meczów, klub AI
// z planowania swojego trenera (trener AI dobiera plan pod rywala, model planu w match/aiPlan.js i coachTerm).
// Wartości [SZAC].

import { clamp } from '../core/rng.js';
import { staffA } from './staff.js';
import { coachOf, coachSkill } from '../career/coaches.js';

/** Wyłącznik do pomiarów balansu (te same ziarna z mechaniką i bez niej). */
// r3: runda 3 (Nov 27, 2026, docs/bierna-gra.md rozdz. 10): kontrplan i analiza trenera AI, losowe przygotowanie
// pod rywala (prep.js), przewaga AI w analizie, autorytet zależny od ligi. false = dokładnie zachowanie sprzed rundy 3.
export const PASSIVE = { enabled: true, scout: true, attention: true, variety: true, authority: true, r3: true };

export const SCOUT = {
  window: 8, // ile ostatnich meczów o stawkę oglądają analitycy rywala
  decay: 0.85, // waga meczu sprzed k spotkań: decay^k
  ramp: 5, // po tylu meczach obraz drużyny jest pełny
  // Odcisk taktyczny: ustawienie i kluczowe instrukcje (wagi podobieństwa)
  w: { formation: 0.3, pressing: 0.15, passing: 0.15, line: 0.12, mentality: 0.12, tempo: 0.08, counter: 0.08 },
  max: 0.6, // premia przy pełnej znajomości schematu i analizie jakości 1 (pkt atrybutu na zawodnika)
  neutral: 0.45, // znajomość, przy której premii nie ma (przeciętny trener AI zmienia plan tak często)
  edgeMin: -0.08, edgeMax: 0.5, edgeMaxR2: 0.4, // zakres premii: zaskoczenie do -0,08, rozpracowany schemat do +0,5 (przed rundą 3: 0,4)
  // Trener AI sam ogląda rywala (runda 3, Nov 27, 2026): jakość analizy co najmniej 0,45 + 0,2 s(SKL), także bez analityka
  coachQ: { base: 0.45, skl: 0.2 },
  // Kontrplan trenera AI na rozpracowany stały schemat gracza (znajomość od 0,6 i dziś ten sam plan): +0,1
  counter: { base: 0.6, match: 0.8, v: 0.1 },
  qMin: 0.15, qMax: 1.3, // jakość analizy: analityk 3 -> ok. 0,15, analityk 15 -> 1, do 1,3 z dobrym trenerem
  aiFam: { base: 0.45, skl: 0.2, tak: 0.1, min: 0.25, max: 0.7 }, // przewidywalność klubu AI z trenera
  warnAt: 0.6, clearAt: 0.4, // wiadomość analityka: schemat rozpracowany / znów nieczytelny
  rehearsed: 0.3, // zmiana instrukcji na plan grany niedawno: koszt zgrania x0,3 (plan B jest przećwiczony)
};

const KEYS = Object.keys(SCOUT.w);
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Odcisk taktyczny drużyny na start meczu: ustawienie i kluczowe instrukcje. */
export function fingerprint(tactics) {
  const i = tactics?.instructions ?? {};
  return {
    formation: tactics?.formation ?? '4231',
    pressing: i.pressing ?? 'mid', passing: i.passing ?? 'mixed', line: i.line ?? 'mid',
    mentality: String(i.mentality ?? '0'), tempo: i.tempo ?? 'normal', counter: i.counter ?? 'yes',
  };
}

const FAMILY = { '442': '442', '442def': '442', '442off': '442', '442d': '442' };
/** Podobieństwo dwóch odcisków 0-1 (ta sama rodzina 4-4-2 liczy się w połowie). */
export function similarity(a, b) {
  if (!a || !b) return 0;
  let s = 0;
  for (const k of KEYS) {
    if (a[k] === b[k]) s += SCOUT.w[k];
    else if (k === 'formation' && FAMILY[a[k]] && FAMILY[a[k]] === FAMILY[b[k]]) s += SCOUT.w[k] / 2;
    else if (k === 'mentality' && Math.abs(Number(a[k]) - Number(b[k])) === 1) s += SCOUT.w[k] / 3;
  }
  return Math.round(s * 1000) / 1000;
}

/** Stan w zapisie: game.scouting = { log: [{ d, id, fp }], warned }. Stary zapis: pusty dziennik. */
export function scoutingState(game) {
  const s = game.scouting && typeof game.scouting === 'object' ? game.scouting : {};
  game.scouting = { log: Array.isArray(s.log) ? s.log : [], warned: !!s.warned, club: s.club ?? game.clubId };
  if (game.scouting.club !== game.clubId) game.scouting = { log: [], warned: false, club: game.clubId }; // nowy klub: rywale nas nie znają
  return game.scouting;
}

/** Zapis meczu o stawkę klubu gracza (start meczu). Sparingi nie trafiają do analizy rywali. */
export function recordMatch(game, fixtureId, date, tactics) {
  const st = scoutingState(game);
  if (st.log.some((x) => x.id === fixtureId)) return st;
  st.log = [...st.log, { d: date, id: fixtureId, fp: fingerprint(tactics) }].slice(-SCOUT.window - 2);
  return st;
}

/**
 * Jak dobrze rywale znają schemat klubu gracza (0-1) i czego się spodziewają.
 * pred: odcisk, który analitycy uznają za nasz schemat (najbardziej typowy w ostatnich meczach),
 * consistency: jak powtarzalnie gramy, ramp: ile meczów widzieli, match: zgodność planu z dziś z przewidywanym.
 */
export function userFamiliarity(game, tactics = game?.tactics) {
  const log = (game?.scouting?.club === game?.clubId ? game.scouting.log : null) ?? [];
  const hist = log.slice(-SCOUT.window).reverse();
  if (!hist.length) return { fam: SCOUT.neutral, base: 0, pred: null, consistency: 0, ramp: 0, match: 0, n: 0 };
  const wts = hist.map((_, k) => SCOUT.decay ** k);
  const wsum = wts.reduce((a, b) => a + b, 0);
  let pred = null; let best = -1;
  for (const h of hist) {
    const v = hist.reduce((s, x, k) => s + wts[k] * similarity(h.fp, x.fp) ** 2, 0); // kwadrat: częściowa zmiana planu też myli rywala
    if (v > best + 1e-9) { best = v; pred = h.fp; }
  }
  const consistency = best / wsum;
  const ramp = Math.min(1, hist.length / SCOUT.ramp);
  const match = tactics ? similarity(pred, fingerprint(tactics)) ** 2 : 1;
  // Mało meczów: analitycy nie mają pełnego obrazu i przygotowują się jak na każdego rywala (znajomość neutralna)
  const fam = SCOUT.neutral * (1 - ramp) + ramp * consistency * match;
  return { fam: r3(fam), base: r3(consistency * ramp), pred, consistency: r3(consistency), ramp, match, n: hist.length };
}

/** Przewidywalność klubu AI: trener dobrze planujący (SKL) i czytający mecz (TAK) jest trudniejszy do rozpracowania. */
export function aiFamiliarity(game, clubId) {
  const c = coachOf(game, clubId);
  const A = SCOUT.aiFam;
  if (!c) return A.base;
  return r3(clamp(A.base - A.skl * coachSkill(c.a.SKL) - A.tak * coachSkill(c.a.TAK), A.min, A.max));
}

/** Znajomość schematu drużyny przez rywali (klub gracza z dziennika, klub AI z trenera). */
export function familiarityOf(game, clubId) {
  return clubId === game?.clubId ? userFamiliarity(game).fam : aiFamiliarity(game, clubId);
}

/**
 * Jakość analizy klubu (0,15-1,3): analityk (3 -> 0,15, 15 -> 1) i trener (SKL, TAK) klubu AI.
 * Klub gracza: sam analityk (decyzje trenera gracza nie mają atrybutów).
 */
export function analysisQuality(game, clubId) {
  const q = staffA(game, clubId, 'analityk', 'RYW'); // rozpracowanie rywala
  let v = clamp((q - 1.5) / 13.5, 0, 1.2);
  if (clubId !== game?.clubId) {
    const c = coachOf(game, clubId);
    if (c) v *= 1 + 0.25 * coachSkill(c.a.SKL) + 0.1 * coachSkill(c.a.TAK);
    if (PASSIVE.r3) v = Math.max(v, SCOUT.coachQ.base + SCOUT.coachQ.skl * (c ? coachSkill(c.a.SKL) : 0)); // trener sam ogląda rywala
  }
  return r3(clamp(v, SCOUT.qMin, SCOUT.qMax));
}

/** Premia klubu scoutId za rozpracowanie schematu rywala targetId (punkty atrybutu na zawodnika w dniu meczu). */
export function scoutEdge(game, scoutId, targetId) {
  if (!PASSIVE.enabled || !PASSIVE.scout || !game || !scoutId || !targetId) return 0;
  const fam = familiarityOf(game, targetId);
  let e = SCOUT.max * analysisQuality(game, scoutId) * (fam - SCOUT.neutral);
  if (PASSIVE.r3 && targetId === game.clubId && scoutId !== game.clubId && counterPlan(game)) e += SCOUT.counter.v;
  return r3(clamp(e, SCOUT.edgeMin, PASSIVE.r3 ? SCOUT.edgeMax : SCOUT.edgeMaxR2));
}

/** Czy trener AI ma kontrplan na schemat gracza: schemat rozpracowany i dziś gramy tak samo. */
export function counterPlan(game, tactics = game?.tactics) {
  const u = userFamiliarity(game, tactics);
  return u.base >= SCOUT.counter.base && u.match >= SCOUT.counter.match;
}

/** Klucz odcisku (pamięć podręczna premii w dniu meczu zależy od taktyki gracza). */
export function fpKey(tactics) {
  const f = fingerprint(tactics);
  return KEYS.map((k) => f[k]).join('|');
}

/** Czy plan był grany w ostatnich meczach (przećwiczony plan B: mniejszy koszt zgrania przy zmianie instrukcji). */
export function rehearsed(game, tactics) {
  if (!PASSIVE.enabled) return false;
  const log = game?.scouting?.club === game?.clubId ? game.scouting.log ?? [] : [];
  const fp = fingerprint(tactics);
  return log.slice(-SCOUT.window).some((x) => similarity(x.fp, fp) >= 0.999);
}

const FORM_NAMES = { '442': '4-4-2', '442def': '4-4-2 defensywne', '442off': '4-4-2 ofensywne', '433': '4-3-3', '4231': '4-2-3-1', '4141': '4-1-4-1', '442d': '4-4-2 romb', '352': '3-5-2', '343': '3-4-3', '532': '5-3-2', '541': '5-4-1', '4321': '4-3-2-1' };
const LABEL = {
  pressing: { high: 'wysoki pressing', low: 'niski pressing' }, passing: { short: 'krótkie podania', long: 'długie piłki' },
  line: { high: 'wysoka linia obrony', low: 'niska linia obrony' }, tempo: { fast: 'szybkie tempo', slow: 'wolne tempo' },
  mentality: { '-2': 'zamurowanie', '-1': 'ostrożne nastawienie', '1': 'gra do przodu', '2': 'wszystko do ataku' },
};
/** Opis schematu słowami (do wiadomości analityka i studia). */
export function describeFp(fp) {
  if (!fp) return '';
  const parts = ['pressing', 'passing', 'line', 'mentality', 'tempo'].map((k) => LABEL[k]?.[fp[k]]).filter(Boolean);
  return `${FORM_NAMES[fp.formation] ?? fp.formation}${parts.length ? `, ${parts.join(', ')}` : ''}`;
}

/**
 * Zapowiedź w studiu przedmeczowym: jak rywal przygotował się na nasz schemat (bez liczb). null, gdy nie ma o czym mówić.
 */
export function scoutingNote(game, oppId, tactics = game.tactics) {
  if (!PASSIVE.enabled) return null;
  const u = userFamiliarity(game, tactics);
  const edge = scoutEdge(game, oppId, game.clubId);
  const q = staffA(game, oppId, 'analityk', 'RYW');
  const staff = q >= 14 ? 'Rywal ma mocny dział analiz' : q >= 8 ? 'Sztab rywala analizuje przeciwników' : 'Rywal ma skromny sztab analityków';
  if (u.base >= SCOUT.warnAt && u.match >= 0.9 && edge > 0.05) {
    const plan = PASSIVE.r3 && counterPlan(game, tactics) ? ' Trener rywala ustawił drużynę pod nasz sposób gry.' : '';
    return { level: 'known', edge, text: `${staff} i zna nasz schemat (${describeFp(u.pred)}): gramy tak od kilku meczów.${plan} Inny plan na ten mecz utrudni im zadanie.` };
  }
  if (u.base >= SCOUT.warnAt && u.match < 0.7) {
    return { level: 'surprise', edge, text: `Rywal szykował się na nasz zwykły schemat (${describeFp(u.pred)}). Dzisiejszy plan powinien go zaskoczyć.` };
  }
  if (u.base >= 0.5 && edge > 0.03) return { level: 'partial', edge, text: `${staff}. Nasz sposób gry jest już dość czytelny dla rywali.` };
  return null;
}

/**
 * Wiadomość analityka po meczu, gdy schemat staje się czytelny dla rywali (raz, ponownie dopiero po zmianie planu).
 * Zwraca { subject, body } albo null.
 */
export function scoutingWarning(game) {
  if (!PASSIVE.enabled) return null;
  const st = scoutingState(game);
  const u = userFamiliarity(game, null);
  if (st.warned && u.base < SCOUT.clearAt) { st.warned = false; return null; }
  if (st.warned || u.base < SCOUT.warnAt || u.n < SCOUT.ramp) return null;
  st.warned = true;
  return {
    subject: 'Rywale znają nasz schemat',
    body: `Od ${u.n} meczów zaczynamy tak samo: ${describeFp(u.pred)}. Analitycy rywali mają to na nagraniach i przygotowują się pod nasze wyjście z piłką, pressing i stałe fragmenty. `
      + 'Im lepszy dział analiz rywala, tym mocniej to odczujemy. Wystarczy zmienić plan na część meczów (ustawienie, pressing, linia obrony, podania), '
      + 'na przykład inaczej z faworytem, inaczej ze słabszym. Plan, który już graliśmy, nie kosztuje zgrania tak jak zupełnie nowy.',
  };
}
