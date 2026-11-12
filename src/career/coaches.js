// Trenerzy klubów AI: profil z pięcioma atrybutami 1-20 (docs/trener-ai-atrybuty.md).
//   TAK Taktyka w meczu: trafność i czas zmian taktycznych i personalnych, reakcje na kartki, upór, okrzyki w porę.
//   SKL Dobór składu i planu: jedenastka, ustawienie i instrukcje na start meczu pod rywala.
//   MOT Motywacja: odprawy przed meczem, w przerwie i po meczu, siła okrzyków.
//   TRE Metodyka treningu: bodziec rozwojowy, ostrość, zgranie, urazy treningowe w klubie AI.
//   PRE Wielkie mecze: jakość decyzji w derbach, finałach, meczach o tytuł i utrzymanie oraz w kluczowych momentach.
// Każda decyzja: stały punkt (atrybut) + losowa dyspozycja dnia trenera (kilka procent) z ziarna meczu.
// Skala umiejętności s = (atrybut - 10,5) / 9,5 (od -1 do 1): s = 0 to zachowanie AI sprzed atrybutów,
// czyli średni trener Ekstraklasy. Te same reguły dla wszystkich, bez ukrytych premii. Wartości [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { CLUBS_L3 } from '../data/clubs_l3.js';
import { CLUBS_L4 } from '../data/clubs_l4.js';
import { randomName } from '../data/names.js';

export const COACH_ATTRS = {
  TAK: { name: 'Taktyka w meczu', short: 'Taktyka', text: 'Czas i trafność zmian w trakcie meczu, reakcje na kartki i przebieg gry, upór.' },
  SKL: { name: 'Dobór składu i planu', short: 'Skład', text: 'Jedenastka, ustawienie i instrukcje na start meczu dopasowane do rywala.' },
  MOT: { name: 'Motywacja', short: 'Motywacja', text: 'Odprawy przed meczem, w przerwie i po meczu, siła okrzyków z linii bocznej.' },
  TRE: { name: 'Metodyka treningu', short: 'Trening', text: 'Rozwój zawodników, ostrość i zgranie z treningu, mniej urazów na zajęciach.' },
  PRE: { name: 'Wielkie mecze', short: 'Presja', text: 'Decyzje w derbach, finałach, meczach o tytuł i utrzymanie oraz w końcówkach na styku.' },
};
export const COACH_KEYS = Object.keys(COACH_ATTRS);
export const COACH_STYLES = { O: 'ofensywny', S: 'ostrożny', P: 'pragmatyczny' };

/** Liczby modułu (docs/trener-ai-atrybuty.md). [SZAC], kalibracja [SYM] w dokumencie. */
export const COACH = {
  neutral: 10.5, span: 9.5,
  // Generowanie: średnia 3,5 + 0,8 prestiżu + premia ligi, wspólny talent trenera i rozrzut atrybutów
  // Premia ligi (docs/trenerzy-i-wlasciciele.md, rozdz. 1): skala bezwzględna, ale różnica między ligami mniejsza
  // niż w kadrach (licencje UEFA Pro i UEFA A, trenerzy krążą między ligami): Ekstraklasa ok. 10,4, 1 Liga ok. 9,
  // 2 Liga ok. 8. Wcześniej 1 Liga 8 i 2 Liga 6 dawały amatorskie błędy w 2 Lidze.
  gen: { base: 3.5, perPrestige: 0.8, tier: { 1: 1, 2: 0.9, 3: 1.15, 4: 0.5 }, talentSd: 1.3, attrSd: 2.0, styleBonus: { O: 'MOT', S: 'SKL', P: 'TAK' } },
  // Słabszy od średniej trener to wciąż zawodowiec: ujemna strona skali jest łagodniejsza (s ujemne do potęgi 1,35),
  // trener 8 ma s = -0,16 zamiast -0,26, trener 3 prawie bez zmian. Dodatnia strona i punkt 10,5 bez zmian.
  lowCurve: 1.35,
  // Dyspozycja dnia: stały punkt + losowe odchylenie w punktach atrybutu (ok. +-5 % skali)
  formSd: 0.5, formMax: 1.0,
  // Waga meczu z rangi 0-3 (studio: zwykły, puchar, derby/UEFA/tytuł/utrzymanie, finał) i przesunięcie od PRE
  imp: [0, 0.35, 0.7, 1], pressure: 0.4,
  nerves: 1.0, // zaangażowanie drużyny na start wielkiego meczu: + imp * 1,0 * s(PRE)
  // Odprawy AI: wybór najlepszego tonu dla szatni (s > 0) albo gorszego niż zwykle (s < 0), siła odprawy
  talkBest: 0.8, talkMiss: 0.5, talkFx: 0.2, postFx: 0.25,
  // Trening klubu AI
  train: { stim: 0.3, injury: 0.25, sharp: 0.15, cohesion: 0.15 },
  // Mecz w tle: przesunięcie stref (punkty atrybutu) za decyzje meczowe; wagi atrybutów
  quick: 0.23, quickW: { tak: 0.3, skl: 0.45, mot: 0.25 },
  // Plan przedmeczowy: trafny plan pod rywala (s > 0), chybiony (s < 0), losowy błąd w ocenie zawodników
  plan: { good: 0.4, bad: 0.4, xiNoise: 1.2 },
  // Asystent gracza w meczu: atrybut trenera z jakości asystenta w sztabie
  assistant: { base: 2, perQ: 0.62, tier: { 1: 0, 2: 0.7, 3: 1.6 } },
  // Sezon trenera w klubie (docs/trener-ai-atrybuty.md, „Stały punkt + los w skali sezonu”): dopasowanie stylu
  // do kadry, chemia z szatnią (losowana raz na sezon) i efekt nowej miotły; punkty atrybutu dodawane do TAK, SKL, MOT
  season: { styleFit: 0.75, chemSd: 1.5, chemMax: 3, bounce: 1.5, bounceDays: 42, max: 3.5 },
  // Doświadczenie: zmiany po sezonie
  age: { growUntil: 48, growP: 0.45, declineFrom: 62, declineP: 0.35 },
};

const skillOf = (v) => {
  const s = clamp((v - COACH.neutral) / COACH.span, -1, 1);
  return s >= 0 ? s : -((-s) ** COACH.lowCurve);
};
export { skillOf as coachSkill };
const r1 = (v) => Math.round(v * 10) / 10;

const LOWER = new Map([...CLUBS_L3, ...CLUBS_L4].map((c) => [c.id, c]));
function clubInfo(clubId, club) {
  return club ?? clubById(clubId) ?? CLUBS_PL.find((c) => c.id === clubId) ?? LOWER.get(clubId) ?? null;
}

/** Prestiż dla generowania (rezerwy jak w sztabie: prestiż pierwszej drużyny - 3). */
function genPrestige(c) {
  const parent = c?.parent ? clubById(c.parent) ?? LOWER.get(c.parent) : null;
  return parent ? Math.max(1, (parent.prestige ?? 5) - 3) : c?.prestige ?? 4;
}

/** Imię i nazwisko trenera prowadzącego (to samo ziarno co dawniej w widoku klubu, n: kolejny trener). */
function nameRng(seed, clubId, n) {
  return new Rng(n ? `trener-glowny:${seed}:${clubId}:${n}` : `trener-glowny:${seed}:${clubId}`);
}

/** Średnia atrybutów trenera, na jakiego stać klub (prestiż i liga). Rynek trenerów używa jej przy zatrudnianiu. */
export function coachLevelFor(clubId, club = null) {
  const c = clubInfo(clubId, club);
  const G = COACH.gen;
  return G.base + G.perPrestige * genPrestige(c) + (G.tier[c?.tier] ?? 0);
}

/** Średnia atrybutów profilu. */
export const coachAvg = (p) => (p?.a ? COACH_KEYS.reduce((s, k) => s + p.a[k], 0) / COACH_KEYS.length : COACH.neutral);

/** Wersja profilu: 2 = skala lig z docs/trenerzy-i-wlasciciele.md, własny styl i staż trenera. */
export const COACH_VERSION = 2;

/** Początek pracy pierwszego trenera klubu (przed startem gry): staż średnio ok. 1,4 roku, najwyżej 8 lat [SZAC]. */
function initialFrom(seed, clubId) {
  const rng = new Rng(`trener-staz:${seed}:${clubId}`);
  const days = Math.min(8 * 365, Math.round(-Math.log(1 - rng.next() * 0.999) * 1.4 * 365));
  const d = new Date(Date.UTC(2026, 6, 1) - days * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Nowy profil trenera (deterministycznie z ziarna gry, klubu i numeru trenera). Lepsze kluby mają średnio lepszych
 * trenerów, ale z rozrzutem: wspólny talent (odchylenie 1,3) i osobny rozrzut atrybutów (2,0).
 * opts: { n: numer trenera w klubie (0 = pierwszy), date, club, boost: przesunięcie średniej (np. nowy trener),
 * style: własny styl trenera (domyślnie styl klubu: pierwszy trener prowadzi zespół zgodnie z dotychczasową filozofią) }.
 */
export function generateCoach(seed, clubId, { n = 0, date = null, club = null, boost = 0, style: own = null } = {}) {
  const c = clubInfo(clubId, club);
  const rng = nameRng(seed, clubId, n);
  const nm = randomName('POL', rng);
  const G = COACH.gen;
  const style = own ?? c?.coach ?? 'P';
  const mean = coachLevelFor(clubId, c) + boost;
  const talent = rng.gauss(0, G.talentSd);
  const a = {};
  for (const k of COACH_KEYS) {
    const tilt = G.styleBonus[style] === k ? 1 : 0;
    a[k] = clamp(Math.round(mean + talent + tilt + rng.gauss(0, G.attrSd)), 1, 20);
  }
  const p = { name: `${nm.first} ${nm.last}`, style, age: rng.int(36, 64), a, n, since: date, v: COACH_VERSION };
  p.id = `${clubId}#${n}`; p.nat = 'POL'; p.from = n ? date : initialFrom(seed, clubId); p.hist = [];
  return p;
}

/** Kluby, dla których profil jest zapisywany w grze (kluby ze stałą kadrą). Pozostałe: profil liczony na bieżąco. */
const stored = (game, clubId) => !!game?.world?.clubs?.[clubId];

const ephemeral = new Map();
/**
 * Profil trenera klubu AI. Kluby ze stałą kadrą: zapis w game.coaches (stary zapis: tworzony przy pierwszym
 * użyciu, z tym samym nazwiskiem co wcześniej). Kluby III ligi i zagraniczne: profil z ziarna, bez zapisu.
 */
export function coachOf(game, clubId, club = null) {
  if (!game) return null;
  if (stored(game, clubId)) {
    const all = (game.coaches ??= {});
    const p = all[clubId];
    if (p && !p.v) upgradeProfile(game, clubId, p);
    return p ?? (all[clubId] = generateCoach(game.seed, clubId, { club, date: game.date ?? null }));
  }
  const key = `${game.seed}:${clubId}`;
  if (!ephemeral.has(key)) {
    if (ephemeral.size > 400) ephemeral.clear();
    ephemeral.set(key, generateCoach(game.seed, clubId, { club }));
  }
  return ephemeral.get(key);
}

/**
 * Stary zapis (profil sprzed skali lig): atrybuty z obecnego wzoru (te same losowania, więc trenerzy Ekstraklasy
 * bez zmian, w 1 i 2 Lidze lepsi), to samo nazwisko, wiek i styl; staż z ziarna.
 */
function upgradeProfile(game, clubId, p) {
  const fresh = generateCoach(game.seed, clubId, { n: p.n ?? 0, boost: p.n ? 0.5 : 0, style: p.style, date: p.since ?? null });
  if (fresh.name === p.name) p.a = fresh.a;
  p.id ??= fresh.id; p.nat ??= 'POL'; p.from ??= p.n ? p.since : fresh.from; p.hist ??= [];
  p.v = COACH_VERSION;
}

/** Wszystkie profile klubów ze stałą kadrą (zgodność wstecz: stary zapis bez trenerów). */
export function ensureCoaches(game) {
  if (!game?.world?.clubs) return;
  for (const id of Object.keys(game.world.clubs)) if (id !== game.clubId) coachOf(game, id);
}

/**
 * Styl gry trenera klubu (O ofensywny, S ostrożny, P pragmatyczny): w klubie AI styl trenera prowadzącego
 * (nowy trener przynosi własny), w klubie gracza i bez profilu styl z danych klubu.
 */
export function coachStyle(game, clubId, club = null) {
  if (game && clubId !== game.clubId) {
    const p = coachOf(game, clubId, club);
    if (p?.style) return p.style;
  }
  return clubInfo(clubId, club)?.coach ?? 'P';
}

/** Trener prowadzący: w klubie gracza profil gracza, w klubie AI imię i nazwisko z profilu. */
export function headCoachName(game, clubId) {
  if (clubId === game.clubId) {
    const pr = game.manager?.profile;
    return pr ? `${pr.firstName} ${pr.lastName}` : 'Ty';
  }
  return coachOf(game, clubId)?.name ?? (() => { const n = randomName('POL', nameRng(game.seed, clubId, 0)); return `${n.first} ${n.last}`; })();
}

/**
 * Asystent gracza w meczu („Pokaż wynik”, podpowiedzi): jakość asystenta ze sztabu (1-20) przeliczona na skalę
 * trenera prowadzącego, tak by asystent klubu był średnio tak dobry jak trener AI tego klubu (sztab: 3 + 1,3 prestiżu,
 * trener: 3,5 + 0,8 prestiżu, stąd 2 + 0,62 q). Bez tego asystent dużego klubu byłby lepszy od trenerów AI
 * i pasywny gracz miałby przewagę. Gracz sam jest trenerem, więc jego decyzje nie mają atrybutów.
 */
export function assistantProfile(q, tier = 1) {
  const A = COACH.assistant;
  const v = clamp(Math.round(A.base + A.perQ * (q ?? 13.5) + (A.tier[tier] ?? 0)), 1, 20);
  return { name: 'Asystent', style: 'P', a: { TAK: v, SKL: v, MOT: v, TRE: v, PRE: v }, assistant: true };
}

/** Waga meczu 0-1 z rangi 0-3. */
export const importanceOf = (rank) => COACH.imp[clamp(Math.round(rank ?? 0), 0, 3)] ?? 0;

/**
 * Trener w tym meczu: umiejętności s (od -1 do 1) z atrybutów, dyspozycji dnia i wagi meczu.
 * Dyspozycja dnia: rng.gauss(0; 0,5) punktu atrybutu, najwyżej +-1 (ok. +-5 % skali), wspólna dla wszystkich decyzji
 * meczu. Wielki mecz (ranga 2-3) przesuwa decyzje o imp * 0,4 * (PRE - 10,5): odporny trener gra lepiej, nerwowy gorzej.
 * Zwraca { tak, skl, mot, pre, form, imp, rank } albo null (brak profilu: zachowanie neutralne).
 */
export function matchCoach(profile, { rank = 0, rng = null } = {}) {
  if (!profile?.a) return null;
  const a = profile.a;
  const form = rng ? clamp(rng.gauss(0, COACH.formSd), -COACH.formMax, COACH.formMax) : 0;
  const imp = importanceOf(rank);
  const press = imp * COACH.pressure * ((a.PRE ?? COACH.neutral) - COACH.neutral);
  const season = profile.boost ?? 0; // dopasowanie do kadry, chemia z szatnią, nowa miotła (sezon, coachMarket.js)
  const eff = (k) => r3(skillOf((a[k] ?? COACH.neutral) + form + press + season));
  return { tak: eff('TAK'), skl: eff('SKL'), mot: eff('MOT'), pre: r3(skillOf((a.PRE ?? COACH.neutral) + form)), form: r1(form), imp, rank };
}
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Ziarno dyspozycji dnia trenera (ten sam mecz, ten sam klub: ta sama dyspozycja w silniku i w tle). */
export const formRng = (game, fixtureId, clubId) => new Rng(`trener-forma:${game.seed}:${fixtureId}:${clubId}`);

/**
 * Mecz w tle (szybka symulacja nie rozgrywa minut): decyzje trenera jako przesunięcie stref drużyny w punktach
 * atrybutu, skalibrowane do różnicy punktów dobrego i słabego trenera w pełnym silniku (docs/trener-ai-atrybuty.md).
 */
export function quickCoachTerm(mc) {
  if (!mc) return 0;
  const w = COACH.quickW;
  return r3(COACH.quick * (w.tak * mc.tak + w.skl * mc.skl + w.mot * mc.mot) / (w.tak + w.skl + w.mot));
}

/** Umiejętność s trenera klubu AI w treningu (klub gracza: 0, trening ustala gracz). */
export function trainingSkill(game, clubId) {
  if (!game || clubId === game.clubId) return 0;
  const p = coachOf(game, clubId);
  return p ? skillOf(p.a.TRE) : 0;
}

/** Umiejętność s w motywacji poza meczem (odprawa pomeczowa klubu AI). */
export function motivationSkill(game, clubId) {
  if (!game || clubId === game.clubId) return 0;
  const p = coachOf(game, clubId);
  return p ? skillOf(p.a.MOT) : 0;
}

/**
 * Zmiana trenera klubu AI: zapisuje nowy profil (next) albo, bez niego, tworzy nowego trenera z kolejnym numerem
 * (zarząd szuka lepszego, nie zawsze znajduje: średnia +0,5). Nowy trener przynosi własny styl gry (losowany
 * z ziarna; rynek trenerów, src/career/coachMarket.js, podaje gotowy profil z puli wolnych trenerów).
 * Wpis w game.coachLog. Zwraca nowy profil albo null (klub gracza, klub bez stałej kadry).
 */
export function replaceCoach(game, clubId, date, next = null, why = null) {
  if (!stored(game, clubId) || clubId === game.clubId) return null;
  const old = coachOf(game, clubId);
  const n = (old?.n ?? 0) + 1;
  if (!next) {
    const style = ['O', 'S', 'P'][new Rng(`trener-styl:${game.seed}:${clubId}:${n}`).int(0, 2)];
    next = generateCoach(game.seed, clubId, { n, date, boost: 0.5, style });
  }
  next.n = n; next.since = date; next.from = date;
  game.coaches[clubId] = next;
  const log = (game.coachLog ??= []);
  log.unshift({ date, club: clubId, out: old?.name ?? null, in: next.name, ...(why ? { why } : {}), ...(next.caretaker ? { caretaker: true } : {}) });
  game.coachLog = log.slice(0, 80);
  return next;
}

/**
 * Po sezonie: trenerzy starzeją się o rok; młodsi zbierają doświadczenie (+1 w jednym atrybucie z szansą 45 %),
 * starsi od 62 lat tracą (-1 z szansą 35 %). Deterministycznie z ziarna gry i roku.
 */
export function coachesNewSeason(game, year) {
  if (!game?.coaches) return;
  const A = COACH.age;
  for (const [id, p] of Object.entries(game.coaches)) {
    if (game.world?.clubs && !game.world.clubs[id]) { delete game.coaches[id]; continue; } // klub spadł do III ligi
    const rng = new Rng(`trener-sezon:${game.seed}:${id}:${year}:${p.n ?? 0}`);
    p.age = (p.age ?? 50) + 1;
    const k = COACH_KEYS[rng.int(0, COACH_KEYS.length - 1)];
    if (p.age <= A.growUntil && rng.chance(A.growP)) p.a[k] = Math.min(20, p.a[k] + 1);
    else if (p.age >= A.declineFrom && rng.chance(A.declineP)) p.a[k] = Math.max(1, p.a[k] - 1);
  }
}

// ------------------------------------------------------------ Opis dla gracza
const STRONG = {
  TAK: 'czyta mecz z ławki', SKL: 'trafnie dobiera skład i plan', MOT: 'mistrz motywacji', TRE: 'rozwija zawodników na treningu', PRE: 'nie pęka w wielkich meczach',
};
const WEAK = {
  TAK: 'spóźnia zmiany w meczu', SKL: 'myli się przy wyborze składu', MOT: 'nie umie poruszyć szatni', TRE: 'słaby warsztat treningowy', PRE: 'gubi się w wielkich meczach',
};

/** Jedno zdanie o trenerze: najmocniejsza i najsłabsza strona (np. „Mistrz motywacji, ale gubi się w wielkich meczach”). */
export function coachBlurb(profile) {
  if (!profile?.a) return '';
  const xs = COACH_KEYS.map((k) => [k, profile.a[k]]).sort((x, y) => y[1] - x[1]);
  const [top, tv] = xs[0];
  const [low, lv] = xs[xs.length - 1];
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  if (tv >= 14 && lv <= 8) return `${cap(STRONG[top])}, ale ${WEAK[low]}.`;
  if (tv >= 14) return `${cap(STRONG[top])}.`;
  if (lv <= 7) return `${cap(WEAK[low])}.`;
  return 'Solidny warsztat bez wyraźnych słabości.';
}

/** Słowna ocena atrybutu (jak w raportach sztabu). */
export function coachBand(v) {
  return v >= 17 ? 'znakomity' : v >= 14 ? 'bardzo dobry' : v >= 11 ? 'dobry' : v >= 8 ? 'przeciętny' : v >= 5 ? 'słaby' : 'bardzo słaby';
}

/**
 * Atrybut tak, jak widzi go gracz (jak raporty sztabu): analityk od 14 dokładnie, 8-13 przedział +-2, poniżej 8 słownie.
 * Zwraca { lo, hi, mid, text }.
 */
export function coachSeen(v, analystQ) {
  if (analystQ >= 14) return { lo: v, hi: v, mid: v, text: String(v) };
  if (analystQ >= 8) {
    const lo = clamp(v - 2 + ((v * 7) % 3 === 0 ? 1 : 0), 1, 20); const hi = clamp(lo + 3, 1, 20);
    return { lo, hi, mid: (lo + hi) / 2, text: `${lo}-${hi}` };
  }
  const mid = v >= 14 ? 16 : v >= 11 ? 12.5 : v >= 8 ? 9.5 : v >= 5 ? 6.5 : 3;
  return { lo: mid, hi: mid, mid, text: coachBand(v) };
}
