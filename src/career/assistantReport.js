// Raport asystenta (docs/raport-asystenta.md): raport o zawodniku na żądanie (menu zawodnika, „Raport asystenta”)
// i okresowy raport o drużynie w poczcie (co tydzień, co 2 tygodnie, co miesiąc albo wyłączony; ustawienie
// w Trening > Sztab). Asystent ocenia ukryte cechy (potencjał, regularność, ważne mecze, odporność na urazy,
// profesjonalizm, temperament, adaptacja, charakter) z błędem zależnym od jakości sztabu i od tego, jak długo zna
// zawodnika. Błąd jest deterministyczny (ziarno gry, klub, zawodnik, cecha, miesiąc): ten sam raport po odświeżeniu,
// zmiana najwyżej raz w miesiącu. Raport nigdy nie pokazuje surowych ukrytych liczb: słowa i przedział oceny.
// Rekomendacje wynikają z danych gry (świeżość, ACWR, ostrość, minuty, rozmowy) i nie przeczą sobie: jedna decyzja
// o obciążeniu na zawodnika. Raport tylko czyta stan gry; zapisuje wyłącznie własny stan game.assistantReport.
// Kluby AI: bez zmian (system działa tylko dla klubu gracza). Wartości [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem, addDays, clubMatchOn } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { squadOf, academyOf } from '../world/worldGen.js';
import { clubById, CLUBS_PL } from '../data/clubs_pl.js';
import { classKeyOfTier } from '../season/leagueComps.js';
import { ATTRS, OFF, POS_NAMES, ovrAt } from '../data/attributes.js';
import { proficiency, POSITIONS } from '../engine/positions.js';
import { staffOf, staffA, staffLabel } from '../training/staff.js';
import { daysBetween, mondayOf, ageAt } from '../training/state.js';
import { loadSummary, acwrLabel, trainingInjuryChance } from '../training/load.js';
import { staleness } from '../training/variety.js';
import { teamCohesion } from '../training/cohesion.js';
import { DEV, MODES, ACCENTS, LOAD_LEVELS, PROGRAMS } from '../training/config.js';
import { teamMorale, moraleLabel, moraleFalling, moraleTrend } from './morale.js';
import { personalityOf, AGENT_TYPES, computeMindset } from './personality.js';
import { relationWith } from './negotiation.js';
import { talkSuggestions, talkCooldown, PLAYER_TALKS } from './teamTalks.js';
import { attentionNeed, daysSinceAttention, ATTN } from './attention.js';
import { authoritySummary } from './authority.js';
import { acclimLabel } from './acclimatization.js';
import { GROUP } from './squad.js';
import { formHistory, formTrend } from '../ui/formChart.js';
import { fmtDate } from '../ui/dom.js';

export const AREP = {
  version: 1,
  defaultFreq: 'biweekly',
  minGap: 6, // co najmniej 6 dni między raportami (także po zmianie częstotliwości)
  knownDays: 120, // po tylu dniach w klubie asystent zna zawodnika w pełni
  famMin: 0.25, // nowy zawodnik: asystent zna go z obserwacji i rozmów przed transferem
  // Błąd oceny (odchylenie w skali 1-20): (0,3 + 0,16 x (20 - q)) x (1 + 0,8 x (1 - znajomość)) x mnożnik cechy.
  // Przy pełnej znajomości progi dokładności pokrywają się z reportPrecision (staff.js): q 14+ dokładny, 8-13 przybliżony.
  sdBase: 0.3, sdPerQ: 0.16, sdFam: 0.8,
  exactSd: 1.3, approxSd: 2.3, blindSd: 3.0,
  specialist: 0.3, // waga specjalisty sztabu (fizjo, analityk, trener młodzieży, bramkarzy) w ocenie cechy
  // Skaut (docs/sztab.md): potencjał zawodników spoza klubu. Jakość oceny 0,3 asystenta + 0,7 skauta, znajomość
  // zawodnika z obserwacji: polski klub 0,6, zagranica i wolni 0,35. Bez skauta (wakat, jakość 2) ocena zwykle niemożliwa. [SZAC]
  scoutAssist: 0.3, scoutFam: { pl: 0.6, abroad: 0.35 },
  detect: { base: 0.45, perQ: 0.03, min: 0.5, max: 1, severe: 0.25 }, // szansa, że asystent zauważy sprawę
  items: (q) => 2 + Math.round(q / 5), // najwięcej pozycji w jednej części raportu drużyny
  injLog: 80,
};

export const REPORT_FREQS = {
  weekly: { label: 'Co tydzień' },
  biweekly: { label: 'Co 2 tygodnie' },
  monthly: { label: 'Co miesiąc' },
  off: { label: 'Wyłączony' },
};

const PREC_WORD = { exact: 'wysoka', approx: 'średnia', vague: 'niska' };
const MONTHS_PL = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const EPOCH = '2026-06-29'; // poniedziałek przed startem gry (rytm raportu co 2 tygodnie)
const num = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const pct = (v) => `${Math.round(v)} %`;
const dniWord = (n) => (n === 1 ? 'dzień' : 'dni');
const shortName = (p) => p.last ?? p.name;
const r1 = (v) => Math.round(v * 10) / 10;

// ------------------------------------------------------------ Stan w zapisie
/** Stan raportu w zapisie: { v, freq, last, sentOn, club, since, inj: [{ id, d, n, x }], prev }. Migracja w miejscu. */
export function ensureAssistantReport(game) {
  if (!game) return null;
  if (!game.assistantReport || typeof game.assistantReport !== 'object') game.assistantReport = {};
  const s = game.assistantReport; // zmiany w miejscu: wywołujący mogą trzymać referencję do stanu
  if (!REPORT_FREQS[s.freq]) s.freq = AREP.defaultFreq;
  if (s.club !== (game.clubId ?? null)) { // nowy klub (albo stary zapis): nowy asystent, nowy dziennik
    Object.assign(s, { last: null, sentOn: null, since: game.date ?? null, inj: [], prev: null, club: game.clubId ?? null });
  }
  s.v = AREP.version;
  s.last ??= null; s.sentOn ??= null; s.prev ??= null;
  s.since ??= game.date ?? null;
  s.inj = Array.isArray(s.inj) ? s.inj.slice(-AREP.injLog) : [];
  return s;
}

/** Zmiana częstotliwości raportu (Trening > Sztab). Zwraca true, gdy wartość była poprawna. */
export function setReportFreq(game, freq) {
  if (!REPORT_FREQS[freq]) return false;
  ensureAssistantReport(game).freq = freq;
  return true;
}

/** Okres raportu dla daty: { id, from (pierwszy dzień wysyłki), to }. */
export function reportPeriod(freq, date) {
  if (freq === 'monthly') {
    const m = date.slice(0, 7);
    let first = `${m}-02`; // 1. dnia miesiąca przychodzi raport rozwoju (training/index.js)
    while (new Date(`${first}T12:00:00Z`).getUTCDay() !== 2) first = addDays(first, 1);
    const [y, mm] = m.split('-').map(Number);
    const to = addDays(`${mm === 12 ? y + 1 : y}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`, -1);
    return { id: m, from: first, to };
  }
  const mon = mondayOf(date);
  if (freq === 'weekly') return { id: mon, from: addDays(mon, 1), to: addDays(mon, 6) };
  const w = Math.floor(daysBetween(EPOCH, mon) / 7);
  const start = ((w % 2) + 2) % 2 === 0 ? mon : addDays(mon, -7);
  return { id: start, from: addDays(start, 1), to: addDays(start, 13) };
}

/** Termin kolejnego raportu (do ekranu ustawień). null: raport wyłączony. */
export function nextReportDate(game) {
  const st = ensureAssistantReport(game);
  if (st.freq === 'off' || !game.date) return null;
  let p = reportPeriod(st.freq, game.date);
  if (st.last === `${st.freq}:${p.id}` || game.date > p.to) p = reportPeriod(st.freq, addDays(p.to, 1));
  let d = p.from < game.date ? game.date : p.from;
  if (st.sentOn) { const gap = addDays(st.sentOn, AREP.minGap); if (gap > d) d = gap; }
  if (d === game.date && game.processedDate === game.date) d = addDays(d, 1); // dzisiejszy dzień już przeliczony
  for (let i = 0; i < 7 && clubMatchOn(game, d); i++) d = addDays(d, 1); // w dniu meczu raport czeka
  return d;
}

// ------------------------------------------------------------ Model dokładności
/** Ile asystent wie o zawodniku (0,25-1): od dnia przyjścia do klubu; kadra z początku kariery jest znana. */
export function familiarity(p, date) {
  if (!p?.lastMove || !date) return 1;
  const d = daysBetween(p.lastMove, date);
  return Math.round(clamp(AREP.famMin + (1 - AREP.famMin) * d / AREP.knownDays, AREP.famMin, 1) * 1000) / 1000;
}

/** Odchylenie błędu oceny z jakości asystenta q, specjalisty qs, znajomości fam i mnożnika cechy. */
export function estimateSd(q, fam = 1, { qs = q, mul = 1 } = {}) {
  const qe = (1 - AREP.specialist) * q + AREP.specialist * qs;
  return (AREP.sdBase + AREP.sdPerQ * (20 - qe)) * (1 + AREP.sdFam * (1 - fam)) * mul;
}

export const precisionOf = (sd) => (sd <= AREP.exactSd ? 'exact' : sd <= AREP.approxSd ? 'approx' : 'vague');

// Cechy ukryte i pochodne: specjalista sztabu, mnożnik trudności, skala, kierunek (1: wysoko znaczy dobrze).
const FIELDS = {
  POT: { label: 'Potencjał', spec: null, mul: 1 },
  KON: { label: 'Regularność', spec: 'analityk', mul: 1, dir: 1 },
  WAZ: { label: 'Ważne mecze', spec: 'analityk', mul: 1, dir: 1 },
  ODP: { label: 'Odporność na urazy', spec: 'fizyczny', mul: 1, dir: 1 },
  PRF: { label: 'Profesjonalizm', spec: 'asystent', mul: 1, dir: 1 },
  TMP: { label: 'Temperament', spec: 'asystent', mul: 1, dir: -1 },
  ADP: { label: 'Adaptacja w nowym otoczeniu', spec: 'asystent', mul: 1.1, dir: 1 },
  ambition: { label: 'Ambicja', spec: 'asystent', mul: 1.1 },
  ego: { label: 'Ego', spec: 'asystent', mul: 1.1 },
  patience: { label: 'Cierpliwość', spec: 'asystent', mul: 1.1 },
  playTime: { label: 'Potrzeba gry', spec: 'asystent', mul: 1.1 },
  loyalty: { label: 'Lojalność', spec: 'asystent', mul: 1.1 },
  greed: { label: 'Chciwość', spec: 'asystent', mul: 1.1 },
  security: { label: 'Lęk przed niepewnością', spec: 'asystent', mul: 1.1 },
  homeTies: { label: 'Przywiązanie do miasta i rodziny', spec: 'asystent', mul: 1.1 },
  risk: { label: 'Skłonność do ryzyka', spec: 'asystent', mul: 1.1 },
  temper: { label: 'Temperament', spec: 'asystent', mul: 1.1 },
  professionalism: { label: 'Profesjonalizm', spec: 'asystent', mul: 1.1 },
  trust: { label: 'Zaufanie do trenera', spec: 'asystent', mul: 1, scale: 5, lo: 0, hi: 100 },
  morale: { label: 'Morale drużyny', spec: 'asystent', mul: 0.5, lo: 1, hi: 20 },
};

/** Adaptacja (pochodna, bez osobnej liczby w zapisie): osobowość, przywiązanie do domu, lęk przed niepewnością, wiek. */
export function adaptability(p) {
  const t = personalityOf(p).traits;
  const per = { Lider: 3, Spokojny: 2, Ambitny: 1, Narwaniec: -1, Wrażliwy: -4 }[p.persona] ?? 0;
  const age = p.age ?? 25;
  return clamp(10 + per - 0.3 * ((t.homeTies ?? 10) - 10) - 0.3 * ((t.security ?? 10) - 10) + (age >= 30 ? 1 : age <= 20 ? -1 : 0), 1, 20);
}

/** Prawdziwa wartość cechy (tylko do modelu, nigdy do wyświetlenia). */
function trueValue(game, p, key) {
  if (key === 'ADP') return adaptability(p);
  if (key === 'trust') return relationWith(p, game.clubId).trust ?? 50;
  if (p.hidden && p.hidden[key] != null) return p.hidden[key];
  const t = personalityOf(p).traits;
  return t[key] ?? (key === 'POT' ? p.ovr : 10);
}

// Atrybut specjalisty dla oceny (docs/sztab-atrybuty.md): nastroje i zaufanie zna asystent pracujący z zawodnikami,
// resztę ocenia asystent (ocena zawodników), analityk (dane), trener fizyczny (obciążenia), bramkarzy i młodzieży (oceny)
const SPEC_ATTR = { asystent: 'OCE', analityk: 'DAN', fizyczny: 'OBC', bramkarze: 'OCE', mlodziez: 'TAL' };
const MOOD_KEYS = new Set(['morale', 'trust']);
const asystQ = (game) => staffA(game, game.clubId, 'asystent', 'OCE');

function qualityFor(game, p, key) {
  const q = asystQ(game);
  const f = FIELDS[key] ?? { spec: null, mul: 1 };
  let spec = f.spec;
  if (key === 'POT') spec = p.pos === 'BR' ? 'bramkarze' : ageAt(p, game.date) <= 21 ? 'mlodziez' : 'asystent';
  const attr = spec === 'asystent' && MOOD_KEYS.has(key) ? 'MOT' : SPEC_ATTR[spec];
  return { q, qs: spec ? staffA(game, game.clubId, spec, attr) : q };
}

/**
 * Ocena asystenta: { v (ocena), lo, hi (przedział do pokazania), sd, prec, blind }. Szum: 0,8 stałego (ta sama opinia
 * o zawodniku) + 0,6 miesięcznego, czyli odchylenie sd. Znajomość liczona na 1. dzień miesiąca (stabilność w miesiącu).
 * value: wartość z zewnątrz (np. morale drużyny), domyślnie cecha zawodnika.
 */
export function estimate(game, p, key, { value = null, subject = null } = {}) {
  const f = FIELDS[key] ?? { mul: 1 };
  const month = (game.date ?? '2026-07-01').slice(0, 7);
  const { q, qs } = p ? qualityFor(game, p, key) : { q: asystQ(game), qs: MOOD_KEYS.has(key) ? staffA(game, game.clubId, 'asystent', 'MOT') : asystQ(game) };
  const age = p ? ageAt(p, game.date) : 25;
  const fam = p ? familiarity(p, `${month}-01`) : 1;
  const mul = (f.mul ?? 1) * (key === 'POT' && age <= 21 ? 1.15 : 1);
  const sd = estimateSd(q, fam, { qs, mul });
  const id = subject ?? p?.id ?? 'druzyna';
  const z1 = new Rng(`asystent:${game.seed}:${game.clubId}:${id}:${key}`).gauss(0, 1);
  const z2 = new Rng(`asystent:${game.seed}:${game.clubId}:${id}:${key}:${month}`).gauss(0, 1);
  const scale = f.scale ?? 1;
  const lo = f.lo ?? 1; const hi = f.hi ?? 20;
  const tv = value ?? trueValue(game, p, key);
  let v = tv + sd * scale * (0.8 * z1 + 0.6 * z2);
  if (key === 'POT') v = Math.max(v, p.ovr); // obecny poziom asystent widzi
  v = clamp(v, lo, hi);
  const prec = precisionOf(sd);
  const hw = (prec === 'exact' ? 1 : 2) * scale;
  const c = key === 'POT' ? Math.round(v * 2) / 2 : Math.round(v);
  return { v: r1(v), lo: clamp(Math.round(c - hw), key === 'POT' ? Math.floor(p.ovr) : lo, hi), hi: clamp(Math.round(c + hw), lo, hi), sd: Math.round(sd * 100) / 100, prec, blind: sd > AREP.blindSd };
}

// Słowa dla ocen 1-20 (od najwyższej do najniższej): próg i opis.
const WORDS = {
  KON: ['bardzo równa forma', 'równa forma', 'forma jak u większości', 'chimeryczny, mecze lepsze i gorsze', 'bardzo chimeryczny'],
  WAZ: ['rośnie w ważnych meczach', 'dobrze znosi presję', 'w ważnych meczach gra jak zwykle', 'presja mu ciąży', 'spina się w ważnych meczach'],
  ODP: ['bardzo odporny na urazy', 'odporny na urazy', 'przeciętna odporność', 'podatny na urazy', 'bardzo podatny na urazy'],
  PRF: ['wzorowy profesjonalista', 'solidny profesjonalista', 'przeciętne podejście', 'bywa niedbały', 'niedbały, trzeba go pilnować'],
  TMP: ['porywczy, często traci głowę', 'nerwowy, łapie kartki', 'normalny temperament', 'spokojny', 'bardzo opanowany'],
  ADP: ['bardzo szybko się adaptuje', 'szybko się adaptuje', 'adaptacja jak u większości', 'adaptacja potrwa dłużej', 'trudno odnajduje się w nowym miejscu'],
};
const band = (v) => (v >= 15.5 ? 0 : v >= 12.5 ? 1 : v >= 8.5 ? 2 : v >= 5.5 ? 3 : 4);
const TONE = (key, b) => {
  const dir = FIELDS[key]?.dir ?? 1;
  const good = dir > 0 ? b <= 1 : b >= 3;
  const bad = dir > 0 ? b >= 3 : b <= 1;
  return good ? 'good' : bad ? 'bad' : 'info';
};

function potentialWord(head) {
  return head >= 3 ? 'duży, sporo miejsca do rozwoju' : head >= 1.5 ? 'spory zapas rozwoju' : head >= 0.5 ? 'niewielki zapas rozwoju' : 'blisko szczytu możliwości';
}

/** Ukryta cecha w raporcie: { key, label, word, range, tone, prec } bez surowych liczb. */
export function hiddenLine(game, p, key) {
  const e = estimate(game, p, key);
  const label = FIELDS[key].label;
  if (e.blind) return { key, label, word: 'trudno ocenić', range: null, tone: 'info', prec: e.prec, e };
  if (key === 'POT') {
    const head = e.v - p.ovr;
    const word = potentialWord(head);
    const tone = head >= 1.5 ? 'good' : head < 0.5 && ageAt(p, game.date) <= 23 ? 'warn' : 'info';
    return { key, label, word, range: e.prec === 'vague' ? null : `ok. ${e.lo}-${e.hi}`, tone, prec: e.prec, e };
  }
  const b = band(e.v);
  return { key, label, word: WORDS[key][b], range: e.prec === 'exact' ? `ok. ${e.lo}-${e.hi}` : null, tone: TONE(key, b), prec: e.prec, e };
}

/**
 * Ocena potencjału zawodnika spoza klubu przez skauta (raport skauta): { key: 'POT', label, word, range, tone, prec, e }.
 * Ten sam model błędu co ocena asystenta; precyzja rośnie z jakością skauta klubu.
 */
export function scoutLine(game, p) {
  const q = asystQ(game);
  // Skaut (docs/sztab-atrybuty.md): ocena zawodnika, przy zawodnikach z zagranicy także wiedza o rynku
  // (dawne 0,7 POT + 0,3 OCU i 0,5 POT + 0,2 OCU + 0,3 RYN po migracji na 5 atrybutów, docs/skauting.md)
  const home = !!(p.clubId && game.world?.clubs?.[p.clubId]);
  const sk = (k) => staffA(game, game.clubId, 'skaut', k);
  const qs = home ? sk('OCE') : 0.7 * sk('OCE') + 0.3 * sk('RYN');
  const qe = AREP.scoutAssist * q + (1 - AREP.scoutAssist) * qs;
  const fam = home ? AREP.scoutFam.pl : AREP.scoutFam.abroad;
  const age = ageAt(p, game.date);
  const sd = estimateSd(qe, fam, { mul: age <= 21 ? 1.15 : 1 });
  const month = (game.date ?? '2026-07-01').slice(0, 7);
  const z1 = new Rng(`skaut:${game.seed}:${game.clubId}:${p.id}:POT`).gauss(0, 1);
  const z2 = new Rng(`skaut:${game.seed}:${game.clubId}:${p.id}:POT:${month}`).gauss(0, 1);
  const v = clamp(Math.max(trueValue(game, p, 'POT') + sd * (0.8 * z1 + 0.6 * z2), p.ovr), 1, 20);
  const prec = precisionOf(sd);
  const hw = prec === 'exact' ? 1 : 2;
  const c = Math.round(v * 2) / 2;
  const e = { v: r1(v), lo: clamp(Math.round(c - hw), Math.floor(p.ovr), 20), hi: clamp(Math.round(c + hw), 1, 20), sd: Math.round(sd * 100) / 100, prec, blind: sd > AREP.blindSd };
  if (e.blind) return { key: 'POT', label: FIELDS.POT.label, word: 'trudno ocenić bez dobrego skauta', range: null, tone: 'info', prec, e };
  const head = e.v - p.ovr;
  return { key: 'POT', label: FIELDS.POT.label, word: potentialWord(head), range: prec === 'vague' ? null : `ok. ${e.lo}-${e.hi}`, tone: head >= 1.5 ? 'good' : 'info', prec, e };
}

// ------------------------------------------------------------ Dane pomocnicze
const playedGames = (game) => (game.fixtures ?? []).filter((f) => f.played && (f.home === game.clubId || f.away === game.clubId)).length;
const minutesShare = (p, games) => (games ? clamp((p.season?.min ?? 0) / (games * 90), 0, 1) : null);
const avgForm = (p) => (Array.isArray(p.form) && p.form.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : null);
// Żółte w lidze: rejestr klasy rozgrywkowej klubu zawodnika (PZPN, src/season/leagueComps.js)
const ycLeague = (p) => (p.yc && typeof p.yc === 'object' ? p.yc[classKeyOfTier(clubById(p.clubId)?.tier)] ?? 0 : 0);

const leagueCache = new WeakMap();
/** Średnie atrybuty na pozycji w lidze klubu (poziom ligi) i posortowane OVR ligi (miejsce zawodnika). */
function leagueLevel(game, tier) {
  let byWorld = leagueCache.get(game.world);
  if (!byWorld) { byWorld = new Map(); leagueCache.set(game.world, byWorld); }
  const key = `${tier}:${(game.date ?? '').slice(0, 7)}`;
  if (byWorld.has(key)) return byWorld.get(key);
  const sums = {}; const ovrs = [];
  for (const c of CLUBS_PL.filter((x) => x.tier === tier)) {
    for (const p of squadOf(game.world, c.id)) {
      ovrs.push(p.ovr);
      const s = sums[p.pos] ?? (sums[p.pos] = { n: 0, a: {} });
      s.n++;
      for (const [a, v] of Object.entries(p.attr)) s.a[a] = (s.a[a] ?? 0) + v;
    }
  }
  const avg = {};
  for (const [pos, s] of Object.entries(sums)) avg[pos] = Object.fromEntries(Object.entries(s.a).map(([a, v]) => [a, v / s.n]));
  const out = { avg, ovrs: ovrs.sort((a, b) => a - b) };
  if (byWorld.size > 6) byWorld.clear();
  byWorld.set(key, out);
  return out;
}

/** Miejsce OVR w lidze (0-1). */
const percentile = (sorted, v) => { let i = 0; while (i < sorted.length && sorted[i] < v) i++; return sorted.length ? i / sorted.length : 0.5; };
function levelWord(q) {
  return q >= 0.9 ? 'czołówka ligi' : q >= 0.7 ? 'wyraźnie ponad średnią ligi' : q >= 0.4 ? 'średni poziom ligi' : q >= 0.15 ? 'poniżej średniej ligi' : 'słabszy niż większość ligi';
}

// Role taktyczne: atrybuty, które je wyróżniają (tylko opis dla trenera, bez wpływu na silnik).
const ROLES = {
  BR: [['bramkarz na linii', ['REF', 'JNJ', 'UST']], ['bramkarz grający nogami, wysoko ustawiony', ['WYJ', 'NOG', 'DEC']]],
  ŚO: [['stoper do walki w powietrzu', ['GLO', 'SIL', 'SKO']], ['obrońca rozgrywający', ['POD', 'OPA', 'WIZ']], ['szybki asekurujący obrońca', ['SZY', 'UST', 'ODB']]],
  BO: [['ofensywny boczny obrońca', ['DOS', 'SZY', 'WYT']], ['defensywny boczny obrońca', ['ODB', 'UST', 'SIL']], ['boczny obrońca schodzący do środka', ['POD', 'TEC', 'DEC']]],
  WB: [['ofensywny wahadłowy', ['DOS', 'SZY', 'DRY']], ['wahadłowy do pracy w obu fazach', ['WYT', 'PRA', 'ODB']]],
  DP: [['defensywny pomocnik do odbioru', ['ODB', 'AGR', 'PRA']], ['cofnięty rozgrywający', ['POD', 'WIZ', 'OPA']]],
  ŚP: [['rozgrywający', ['POD', 'WIZ', 'TEC']], ['pomocnik od pola karnego do pola karnego', ['WYT', 'PRA', 'RUC']], ['pomocnik do odbioru', ['ODB', 'AGR', 'SIL']]],
  OP: [['kreator gry', ['WIZ', 'POD', 'TEC']], ['cień napastnika', ['RUC', 'WYK', 'OPA']], ['strzelec z dystansu', ['DYS', 'TEC', 'OPA']]],
  BP: [['klasyczny skrzydłowy z dośrodkowaniem', ['DOS', 'SZY', 'DRY']], ['pracowity boczny pomocnik', ['WYT', 'PRA', 'ODB']]],
  SN: [['klasyczny skrzydłowy z dośrodkowaniem', ['DOS', 'SZY', 'DRY']], ['skrzydłowy schodzący do strzału', ['DRY', 'WYK', 'DYS']], ['pracowity skrzydłowy', ['WYT', 'PRA', 'ODB']]],
  NAP: [['lis pola karnego', ['WYK', 'RUC', 'OPA']], ['wysoki napastnik do gry tyłem', ['GLO', 'SIL', 'SKO']], ['szybki napastnik do kontr', ['SZY', 'RUC', 'DRY']], ['cofnięty napastnik do rozegrania', ['POD', 'WIZ', 'TEC']]],
};

/** Atrybuty kluczowe dla pozycji (profil OVR: ++ i +). */
function keyAttrs(p) {
  const off = OFF[p.pos] ?? {};
  return Object.keys(off).filter((a) => off[a] > 0 && ATTRS[a]);
}

// ------------------------------------------------------------ Raport o zawodniku
/** Mocne i słabe strony wobec średniej ligi na tej pozycji i kadry. */
function attrSides(game, p, prec) {
  const tier = clubById(game.clubId)?.tier ?? 1;
  const lg = leagueLevel(game, tier).avg[p.pos] ?? {};
  const keys = new Set(keyAttrs(p));
  const gk = p.pos === 'BR';
  const list = Object.keys(ATTRS).filter((a) => (gk ? ATTRS[a].group === 'gk' || ['UST', 'DEC', 'OPA', 'LID', 'PRA'].includes(a) || ATTRS[a].group === 'phys' : ATTRS[a].group !== 'gk'));
  const rows = list.map((a) => ({ a, v: p.attr[a], d: p.attr[a] - (lg[a] ?? p.attr[a]), key: keys.has(a), group: ATTRS[a].group }));
  const fmt = (x) => `${ATTRS[x.a].name.toLowerCase()}${prec === 'exact' ? ` ${x.v} (liga ${num(x.v - x.d)})` : prec === 'approx' ? ` ${x.v}` : ''}`;
  const strong = rows.filter((x) => x.d >= 1.5 || (x.key && x.d >= 1)).sort((a, b) => (b.key - a.key) || (b.d - a.d)).slice(0, 5);
  const weak = rows.filter((x) => (x.key && x.d <= -1) || x.d <= -2.5).sort((a, b) => (b.key - a.key) || (a.d - b.d)).slice(0, 4);
  const byGroup = (xs) => ['tech', 'mental', 'phys', 'gk'].map((g) => ({ g, items: xs.filter((x) => x.group === g).map(fmt) })).filter((x) => x.items.length);
  return { strong: byGroup(strong), weak: byGroup(weak), top: strong[0] ? ATTRS[strong[0].a].name.toLowerCase() : null, low: weak[0] ? ATTRS[weak[0].a].name.toLowerCase() : null, weakKey: weak.find((x) => x.key) ?? null };
}

/** Pozycje i role. */
function roleFit(p) {
  const nat = POSITIONS.map((pos) => ({ pos, prof: proficiency(p, pos), rating: ovrAt(p.attr, pos) }))
    .filter((x) => (p.pos === 'BR') === (x.pos === 'BR'));
  const good = nat.filter((x) => x.prof >= 70).sort((a, b) => b.prof - a.prof || b.rating - a.rating).slice(0, 4);
  const learn = p.pos === 'BR' ? null : nat.filter((x) => x.prof < 70 && x.rating >= p.ovr - 0.3).sort((a, b) => b.rating - a.rating)[0] ?? null;
  const cat = ROLES[p.pos] ?? [];
  const scored = cat.map(([name, attrs]) => ({ name, attrs, s: attrs.reduce((s, a) => s + (p.attr[a] ?? 0), 0) / attrs.length })).sort((a, b) => b.s - a.s);
  return { good, learn, role: scored[0] ?? null, alt: scored[1] && scored[0].s - scored[1].s < 0.7 ? scored[1] : null };
}

function stateOf(game, p) {
  const t = p.training ?? {};
  const sum = loadSummary(t);
  const hist = formHistory(p);
  const trend = formTrend(hist);
  const form = avgForm(p);
  const games = playedGames(game);
  const share = minutesShare(p, games);
  const yc = ycLeague(p);
  const returned = t.returnedAt ? daysBetween(t.returnedAt, game.date) : null;
  return { t, sum, acwr: sum.acwr, hist, trend, form, games, share, yc, returned, fresh: p.fresh ?? 95, sharp: p.sharp ?? 70, legs: t.legs ?? 0, debt: p.matchDebt ?? 0, inj: p.injuryDays > 0 };
}

/**
 * Jedna decyzja o obciążeniu zawodnika (priorytet: zdrowie, potem świeżość, potem ostrość i minuty).
 * id: injured | rest | manage | sharpen | more | keep; load: -1 mniej, 0 bez zmian, +1 więcej.
 */
const tired = (s) => s.acwr > 1.5 || s.fresh < 60 || (s.fresh < 70 && !(s.debt > 0));
export function loadStance(p, s, { hungry = false, young = false } = {}) {
  if (s.inj) return { id: 'injured', load: -1 };
  // Ciężkie nogi po mocnych zajęciach są zaplanowane w mikrocyklu (plan.js pilnuje dni przed meczem): nie są powodem odpoczynku
  // Spadek świeżości tuż po meczu (dług meczowy) to zwykła regeneracja: odpoczynek dopiero przy zmęczeniu bez meczu albo bardzo niskiej świeżości
  if (tired(s)) return { id: 'rest', load: -1 };
  if (s.acwr > 1.3 || s.fresh < 80) return { id: 'manage', load: -1 };
  if (s.sharp < 60) return { id: 'sharpen', load: 1 };
  if (s.share != null && s.games >= 4 && s.share < 0.3 && (hungry || young) && p.squad !== 'Y') return { id: 'more', load: 1 };
  if (s.acwr < 0.7 && (p.training?.mode ?? 'normal') !== 'normal') return { id: 'more', load: 1 };
  return { id: 'keep', load: 0 };
}

/** Temat rozmowy z sugestii (teamTalks.js), z poprawką na charakter: wrażliwego nie przyciskamy. */
function talkPick(p, reasons) {
  if (!reasons?.length) return null;
  let [kind, why] = reasons[0];
  let note = null;
  if (kind === 'demand' && p.persona === 'Wrażliwy') { kind = 'encourage'; note = 'jest wrażliwy, wymaganie więcej raczej go zdołuje'; }
  return { kind, why, note, label: PLAYER_TALKS[kind]?.label ?? kind };
}

/** Rekomendacje: [{ id, text, why, tone, load, act? }] bez sprzeczności (jedna decyzja o obciążeniu). */
function recommendations(game, p, s, st, ctx) {
  const out = [];
  const t = p.training;
  const mode = t?.mode ?? 'normal';
  const push = (x) => out.push({ load: 0, tone: 'info', act: null, ...x });
  switch (st.id) {
    case 'injured': {
      const rtp = t?.prog === 'powrot';
      push({ id: 'injured', tone: 'bad', load: -1,
        text: p.injuryDays >= 15 && !rtp ? 'Po wyleczeniu poprowadźmy go programem powrotu po kontuzji (10 dni stopniowego obciążenia).' : `Leczenie potrwa jeszcze ok. ${p.injuryDays} ${dniWord(p.injuryDays)}.${rtp ? ' Program powrotu już ustawiony.' : ''}`,
        why: p.injury?.name ? `Uraz: ${p.injury.name}.` : 'Uraz.',
        act: p.injuryDays >= 15 && !rtp && t ? { act: 'tr-prog', id: p.id, v: 'powrot', label: 'Ustaw program powrotu' } : null });
      break;
    }
    case 'rest': {
      const target = s.fresh < 60 ? 'rest' : 'light';
      const set = mode === target || (mode === 'rest' && target === 'light');
      push({ id: 'rest', tone: 'bad', load: -1,
        text: set ? `Tryb ${MODES[mode].name.toLowerCase()} jest ustawiony; utrzymać, aż świeżość wróci powyżej 85 %. W najbliższym meczu najwyżej z ławki.`
          : `Potrzebuje odpoczynku: ${MODES[target].name.toLowerCase()} na 2-3 dni i regeneracja. W najbliższym meczu najwyżej z ławki.`,
        why: [s.fresh < 70 ? `świeżość ${pct(s.fresh)}` : null, s.acwr > 1.5 ? `ACWR ${num(s.acwr, 2)} (przeciążenie)` : null].filter(Boolean).join(', '),
        act: set || !t ? null : { act: 'tr-mode', id: p.id, v: target, label: `Ustaw: ${MODES[target].name.toLowerCase()}` } });
      break;
    }
    case 'manage':
      push({ id: 'manage', tone: 'warn', load: -1,
        text: `${s.debt > 0 ? 'Regeneracja po meczu (lżejszy dzień), a w kolejnym meczu zmiana ok. 60-70 minuty.' : 'Kontrolować obciążenie: lżejszy trening w dniu po meczu i zmiana ok. 60-70 minuty.'}${mode === 'light' ? ' Lżejszy trening już ustawiony.' : ''}`,
        why: [s.acwr > 1.3 ? `ACWR ${num(s.acwr, 2)} (podwyższone ryzyko)` : null, s.fresh < 80 ? `świeżość ${pct(s.fresh)}` : null].filter(Boolean).join(', '),
        act: mode === 'normal' && t ? { act: 'tr-mode', id: p.id, v: 'light', label: 'Ustaw: lżejszy trening' } : null });
      break;
    case 'sharpen':
      push({ id: 'sharpen', tone: 'warn', load: 1,
        text: 'Brakuje mu ostrości meczowej: gierki na treningu, sparing albo 30-45 minut z ławki.',
        why: `ostrość ${pct(s.sharp)}`,
        act: mode !== 'normal' && t ? { act: 'tr-mode', id: p.id, v: 'normal', label: 'Ustaw: pełny trening' } : null });
      break;
    case 'more':
      push({ id: 'more', tone: 'info', load: 1,
        text: mode !== 'normal' ? 'Wrócić do pełnego treningu: obciążenie jest za małe.' : p.pos === 'BR' ? 'Dać mu mecz: puchar albo sparing (bramkarz rzadko wchodzi z ławki).' : 'Dać mu więcej minut: wejścia z ławki albo mecz pucharowy w pierwszym składzie.',
        why: mode !== 'normal' ? `ACWR ${num(s.acwr, 2)}, tryb ${MODES[mode].name.toLowerCase()}` : `udział w minutach ${pct((s.share ?? 0) * 100)}${ctx.hungry ? ', bardzo chce grać' : ''}${ctx.young ? ', młody z zapasem rozwoju' : ''}`,
        act: mode !== 'normal' && t ? { act: 'tr-mode', id: p.id, v: 'normal', label: 'Ustaw: pełny trening' } : null });
      break;
    default:
      push({ id: 'keep', tone: 'good', load: 0, text: 'Obciążenie bez zmian: pełny trening i dotychczasowa rola.', why: `świeżość ${pct(s.fresh)}, ACWR ${num(s.acwr, 2)}, ostrość ${pct(s.sharp)}` });
  }
  // Akcent indywidualny: najsłabszy kluczowy atrybut pozycji (nie przy odpoczynku i urazie)
  if (st.load >= 0 && ctx.sides.weakKey && t) {
    const a = ctx.sides.weakKey.a;
    const set = t.focus === a;
    push({ id: 'focus', tone: 'info',
      text: set ? `Akcent indywidualny na ${ATTRS[a].name.toLowerCase()} już trwa: kontynuować.` : `Akcent indywidualny: ${ATTRS[a].name.toLowerCase()}, to najsłabszy z kluczowych atrybutów na jego pozycji.`,
      why: `poniżej średniej ligi na pozycji ${p.pos}`,
      act: set ? null : { act: 'tr-focus', id: p.id, v: a, label: `Akcent: ${ATTRS[a].name.toLowerCase()}` } });
  }
  // Program dla młodych: więcej zmęczenia, więc tylko gdy obciążenie nie musi spadać
  if (st.load >= 0 && t && ctx.young && ageAt(p, game.date) <= PROGRAMS.mlodzi.maxAge && t.prog !== 'mlodzi' && s.fresh >= 85) {
    push({ id: 'youth', tone: 'good', text: 'Program dla młodych z trenerem młodzieży: przyspieszy rozwój.', why: 'młody zawodnik z zapasem rozwoju',
      act: { act: 'tr-prog', id: p.id, v: 'mlodzi', label: 'Ustaw program dla młodych' } });
  }
  if (ctx.learn && st.load >= 0 && t && !t.pos) {
    push({ id: 'learn', tone: 'info', text: `Warto nauczyć go pozycji ${ctx.learn.pos} (${POS_NAMES[ctx.learn.pos].toLowerCase()}): atrybuty pasują, brakuje tylko ogrania.`, why: `ocena na tej pozycji ok. ${num(ctx.learn.rating)}, biegłość ${Math.round(ctx.learn.prof)} %`,
      act: { act: 'tr-pos', id: p.id, v: ctx.learn.pos, label: `Nauka pozycji ${ctx.learn.pos}` } });
  }
  if (ctx.talk) push({ id: 'talk', tone: 'warn', text: `Rozmowa: ${ctx.talk.label.toLowerCase()} (Kadra, Rozmowy).`, why: `${ctx.talk.why}${ctx.talk.note ? `; ${ctx.talk.note}` : ''}` });
  if (s.yc % 4 === 3) push({ id: 'cards', tone: 'warn', text: 'Jedna żółta kartka od pauzy w lidze: przypomnieć o spokoju, w meczu bez stawki rozważyć ławkę.', why: `${s.yc} żółte kartki w lidze` });
  if (ctx.contract) push(ctx.contract);
  return out;
}

/**
 * Pełny raport o zawodniku klubu gracza (na żądanie). null dla obcego zawodnika.
 * Zwraca dane do widoku (src/ui/assistantReportView.js): podsumowanie, strony, cechy ukryte, pozycje, stan, psychika,
 * rozwój, rekomendacje i pewność oceny.
 */
export function playerReport(game, pid) {
  const p = game?.world?.players?.[pid];
  if (!p || p.clubId !== game.clubId) return null;
  const st = ensureAssistantReport(game);
  const staff = staffOf(game, game.clubId).asystent ?? { q: 10, name: 'Asystent' };
  const q = clamp((staff.q ?? 10) + (staff.d?.OCE ?? 0), 1, 20); // ocena zawodników (docs/sztab-atrybuty.md)
  const age = ageAt(p, game.date);
  const fam = familiarity(p, `${game.date.slice(0, 7)}-01`);
  const prec = precisionOf(estimateSd(q, fam));
  const tier = clubById(game.clubId)?.tier ?? 1;
  const lvl = percentile(leagueLevel(game, tier).ovrs, p.ovr);
  const academy = p.squad === 'Y';
  const s = stateOf(game, p);
  const sides = attrSides(game, p, prec);
  const fit = roleFit(p);

  // Cechy ukryte
  const hidden = ['POT', 'KON', 'WAZ', 'ODP', 'PRF', 'TMP', 'ADP'].map((k) => hiddenLine(game, p, k));
  // Raport ogólny (słaba ocena asystenta): bez liczbowych przedziałów, nawet gdy specjalista ocenia dokładniej
  if (prec === 'vague') for (const h of hidden) h.range = null;
  const potE = hidden[0].e;
  const head = potE.v - p.ovr;
  // Charakter (psycholog): cechy wyraźnie odbiegające od przeciętnej w ocenie asystenta
  const charKeys = ['ambition', 'ego', 'patience', 'playTime', 'loyalty', 'greed'];
  const est = Object.fromEntries(charKeys.map((k) => [k, estimate(game, p, k)]));
  const character = charKeys.map((k) => ({ k, e: est[k] }))
    .filter((x) => !x.e.blind && Math.abs(x.e.v - 10.5) >= (x.e.prec === 'exact' ? 3 : 4.5))
    .sort((a, b) => Math.abs(b.e.v - 10.5) - Math.abs(a.e.v - 10.5)).slice(0, 4)
    .map((x) => `${x.e.v >= 10.5 ? 'wysoka' : 'niska'} cecha: ${FIELDS[x.k].label.toLowerCase()}`);

  // Rola w drużynie
  const tac = game.tactics ?? {};
  const where = academy ? 'academy' : (tac.xi ?? []).includes(p.id) ? 'xi' : (tac.bench ?? []).includes(p.id) ? 'bench' : 'out';
  const ROLE_TXT = { academy: 'Zawodnik akademii', xi: 'Podstawowy zawodnik', bench: 'Zmiennik', out: 'Zawodnik spoza kadry meczowej' };

  // Psychika
  const trustE = estimate(game, p, 'trust');
  const trustWord = trustE.blind ? 'trudno ocenić' : trustE.v >= 70 ? 'duże zaufanie do trenera' : trustE.v >= 55 ? 'dobre zaufanie do trenera' : trustE.v >= 45 ? 'neutralny wobec trenera' : trustE.v >= 30 ? 'ograniczone zaufanie do trenera' : 'nie ufa trenerowi';
  const need = attentionNeed(p, game.date, { share: s.share ?? 1, games: s.games });
  // Bez zapisu rozmowy (stary zapis, początek kariery) nie podajemy liczby dni
  const sinceTalk = p.att?.t || p.att?.m ? daysSinceAttention(p, game.date, game.attStart ?? game.date) : null;
  const hungry = (!est.playTime.blind && est.playTime.v >= 13.5) || p.persona === 'Ambitny';
  const young = age <= 23 && head >= 1.5 && !potE.blind;
  const months = p.contract?.until ? daysBetween(game.date, p.contract.until) / 30.4 : null;
  const estTraits = { ...personalityOf(p).traits, ...Object.fromEntries(charKeys.map((k) => [k, Math.round(est[k].v)])) };
  const mind = prec === 'vague' ? null : computeMindset(p, estTraits, { minutesShare: s.share ?? 0.6 });
  // Rozmowa w tym tygodniu już była (limit rozmów, teamTalks.js): bez zalecenia kolejnej
  const reasons = academy || talkCooldown(game, p.id) > 0 ? [] : talkSuggestions(game).find((x) => x.p.id === p.id)?.reasons ?? [];
  const talk = talkPick(p, reasons);

  const stance = loadStance(p, s, { hungry, young });
  let contract = null;
  if (months != null && months <= 12 && !academy && !p.loan) {
    const keep = where === 'xi' || young || stance.id === 'more';
    contract = { id: 'contract', tone: keep ? 'warn' : 'info', load: 0,
      text: keep ? `Kontrakt kończy się ${fmtDate(p.contract.until)}: warto przedłużyć (Transfery, Kontrakty).` : `Kontrakt kończy się ${fmtDate(p.contract.until)}: decyzja o przyszłości nie jest pilna, nie jest kluczowym zawodnikiem.`,
      why: `${Math.max(0, Math.round(months))} mies. do końca umowy` };
  }
  const recs = recommendations(game, p, s, stance, { sides, hungry, young, learn: fit.learn, talk, contract });

  // Rozwój
  const ovrHist = p.training?.ovrHist ?? [];
  const histD = ovrHist.length >= 2 ? r1(ovrHist.at(-1) - ovrHist[Math.max(0, ovrHist.length - 7)]) : null;
  const lastRep = (game.training?.reports ?? [])[0];
  const row = lastRep?.rows?.find((x) => x.id === p.id) ?? null;
  const phase = DEV.rate(age) >= 0.22 ? 'growth' : DEV.rate(age) > 0 ? 'late' : DEV.physDecline(age) > 0 ? 'decline' : 'peak';
  const PHASE_TXT = {
    growth: 'Wiek najszybszego rozwoju: postęp zależy od minut, treningu i profesjonalizmu.',
    late: 'Rozwój zwalnia; zostały głównie mentalne i taktyczne rezerwy.',
    peak: 'Wiek szczytowej formy: utrzymać poziom, rozwój już niewielki.',
    decline: 'Cechy fizyczne zaczynają spadać; doświadczenie i decyzje jeszcze rosną.',
  };
  const devLine = (d) => (d === 0 ? 'bez zmian' : prec === 'exact' ? `${d > 0 ? '+' : ''}${num(d)} OVR` : prec === 'approx' ? (d > 0 ? 'w górę' : d < 0 ? 'w dół' : 'bez zmian') : (d > 0 ? 'rośnie' : d < 0 ? 'spada' : 'stoi w miejscu'));

  // Historia urazów (od początku obserwacji asystenta) i ryzyko
  const injHist = st.inj.filter((x) => x.id === p.id).slice(-5).reverse();
  const odp = hidden.find((h) => h.key === 'ODP');
  const fitQ = staffA(game, game.clubId, 'fizyczny', 'OBC'); // planowanie obciążeń
  const risk = s.inj ? null : trainingInjuryChance({ ...p, hidden: { ...p.hidden, ODP: odp.e.v } }, {
    sessions: [{ type: 'gierki', int: 'mid' }], age, acwr: s.acwr, fitQ, fresh: s.fresh, mode: p.training?.mode,
    rtp: (p.training?.rtp ?? 0) > 0, returning: s.returned != null && s.returned <= 14,
  });
  const base = trainingInjuryChance({ ...p, hidden: { ...p.hidden, ODP: 10 } }, { sessions: [{ type: 'gierki', int: 'mid' }], age: 25, acwr: 1, fitQ, fresh: 100 });
  const riskRel = risk != null && base > 0 ? risk / base : null;
  const riskWord = riskRel == null ? null : riskRel >= 2 ? 'wysokie' : riskRel >= 1.35 ? 'podwyższone' : riskRel <= 0.8 ? 'niskie' : 'normalne';

  // Stan obecny
  const TREND_TXT = { 1: 'forma rośnie', 0: 'forma stabilna', [-1]: 'forma spada' };
  const stateList = [
    { k: 'Forma', v: s.hist.length >= 2 ? `${TREND_TXT[s.trend]}${s.form != null ? `, średnia ocen ${num(s.form)}` : ''}` : 'za mało meczów do oceny' },
    { k: 'Świeżość', v: `${pct(s.fresh)}${p.matchDebt ? ', jeszcze regeneruje się po meczu' : ''}${s.legs >= 0.6 ? ', ciężkie nogi po mocnych zajęciach' : ''}`, tone: s.fresh < 70 ? 'bad' : s.fresh < 80 ? 'warn' : 'good' },
    { k: 'Ostrość meczowa', v: pct(s.sharp), tone: s.sharp < 60 ? 'warn' : 'good' },
    { k: 'Obciążenie (ACWR)', v: `${num(s.acwr, 2)}, ${acwrLabel(s.acwr).text.toLowerCase()}`, tone: s.acwr > 1.5 ? 'bad' : s.acwr > 1.3 || s.acwr < 0.7 ? 'warn' : 'good' },
    { k: 'Zdrowie', v: s.inj ? `kontuzja, ok. ${p.injuryDays} ${dniWord(p.injuryDays)}${p.injury?.name ? ` (${p.injury.name})` : ''}` : (p.training?.rtp > 0 ? `program powrotu, jeszcze ${p.training.rtp} ${dniWord(p.training.rtp)}` : s.returned != null && s.returned <= 30 ? `wrócił po urazie ${s.returned} ${dniWord(s.returned)} temu` : 'zdrowy'), tone: s.inj ? 'bad' : 'good' },
    riskWord ? { k: 'Ryzyko urazu', v: riskWord, tone: riskWord === 'wysokie' ? 'bad' : riskWord === 'podwyższone' ? 'warn' : 'good' } : null,
    { k: 'Urazy', v: injHist.length ? injHist.map((x) => `${x.x ?? 'uraz'}, ${x.n} ${dniWord(x.n)} (${fmtDate(x.d)})`).join('; ') : `brak w dzienniku sztabu (prowadzony od ${fmtDate(st.since ?? game.date)})` },
    { k: 'Kartki w lidze', v: s.yc ? `${s.yc} żółt${s.yc === 1 ? 'a' : s.yc <= 4 ? 'e' : 'ych'}${s.yc % 4 === 3 ? ', jedna od pauzy' : ''}` : 'bez kartek', tone: s.yc % 4 === 3 ? 'warn' : 'info' },
  ].filter(Boolean);

  const ROLE_PLAY = s.share == null ? 'sezon jeszcze się nie zaczął' : s.share >= 0.7 ? 'gra prawie wszystko' : s.share >= 0.4 ? 'gra regularnie' : s.share >= 0.15 ? 'gra mało' : 'prawie nie gra';
  const mental = [
    { k: 'Morale', v: moraleLabel(p.morale ?? 12).toLowerCase(), tone: (p.morale ?? 12) <= 8 ? 'bad' : (p.morale ?? 12) >= 14 ? 'good' : 'info' },
    { k: 'Relacja z trenerem', v: trustWord, tone: trustE.blind ? 'info' : trustE.v < 40 ? 'bad' : trustE.v >= 60 ? 'good' : 'info' },
    { k: 'Osobowość', v: `${p.persona ?? 'Spokojny'}${character.length ? `; ${character.join(', ')}` : ''}` },
    { k: 'Minuty', v: `${ROLE_PLAY}${s.share != null ? ` (${pct(s.share * 100)} minut drużyny)` : ''}${hungry && s.share != null && s.share < 0.4 ? '; chce grać więcej, to rodzi frustrację' : ''}`, tone: hungry && s.share != null && s.share < 0.3 ? 'warn' : 'info' },
    p.unhappy || p.transferRequest ? { k: 'Nastroje', v: p.transferRequest ? 'chce odejść z klubu' : 'jest niezadowolony', tone: 'bad' } : null,
    need.need ? { k: 'Uwaga trenera', v: `${{ sensitive: 'wrażliwy, potrzebuje rozmów', new: 'nowy w klubie, potrzebuje rozmowy o roli', bench: 'ambitny rezerwowy, czeka na sygnał' }[need.why] ?? 'potrzebuje rozmowy'}; ${sinceTalk == null ? 'jeszcze bez rozmowy indywidualnej' : `ostatnia rozmowa ${sinceTalk} ${dniWord(sinceTalk)} temu`}`, tone: sinceTalk == null || sinceTalk >= ATTN.grace ? 'warn' : 'info' } : null,
    p.acclim ? { k: 'Aklimatyzacja', v: `${acclimLabel(p.acclim.level)} (${Math.round(p.acclim.level)} %)` } : null,
    p.loan && p.loan.from !== game.clubId // wypożyczony do nas: kontrakt w klubie macierzystym, liczy się koniec wypożyczenia
      ? { k: 'Wypożyczenie', v: `z ${clubById(p.loan.from)?.name ?? 'innego klubu'} do ${fmtDate(p.loan.until)}${p.loan.stay ? (p.loan.stay.want ? ', chce zostać' : ', planuje powrót') : ''}`, tone: 'info' }
      : { k: 'Kontrakt', v: p.contract?.until ? `do ${fmtDate(p.contract.until)}${months != null && months <= 12 ? ' (kończy się w ciągu roku)' : ''}${p.loan ? ', wypożyczony' : ''}` : 'brak danych', tone: months != null && months <= 6 ? 'warn' : 'info' },
    { k: 'Agent', v: AGENT_TYPES[p.agent]?.label ?? 'brak danych' },
    { k: 'Nastawienie przy negocjacjach', v: mind ? mind.label.toLowerCase() : 'trudno powiedzieć, czego oczekuje' },
  ].filter(Boolean);

  const outlook = [
    { k: 'Etap kariery', v: PHASE_TXT[phase] },
    { k: 'Potencjał', v: hidden[0].word + (hidden[0].range ? ` (${hidden[0].range})` : '') },
    histD != null ? { k: `Ostatnie ${Math.min(6, ovrHist.length - 1)} mies.`, v: devLine(histD) } : null,
    row ? { k: 'Raport rozwoju', v: `${fmtDate(lastRep.date)}: ${devLine(row.d)}${prec === 'exact' && row.attrs?.length ? ` (${row.attrs.map(([a, v]) => `${a} ${v > 0 ? '+' : ''}${v}`).join(', ')})` : ''}` } : null,
    { k: 'Profesjonalizm a rozwój', v: hidden.find((h) => h.key === 'PRF').word },
  ].filter(Boolean);

  // Podsumowanie (jedno zdanie o roli i poziomie, atut, słabość, ukryta cecha, decyzja o obciążeniu)
  const notable = hidden.filter((h) => h.key !== 'POT' && !h.e.blind && h.prec !== 'vague' && h.tone !== 'info')
    .sort((a, b) => Math.abs(b.e.v - 10.5) - Math.abs(a.e.v - 10.5))[0];
  const STANCE_SHORT = { injured: 'teraz leczenie', rest: 'teraz odpoczynek', manage: 'teraz kontrola obciążeń', sharpen: 'teraz budowanie ostrości', more: 'teraz więcej minut', keep: 'obciążenie bez zmian' };
  const summary = [
    `${ROLE_TXT[where]}, ${levelWord(lvl)}${young ? ', z zapasem rozwoju' : ''}.`,
    sides.top ? `Największy atut: ${sides.top}.` : null,
    sides.low ? `Do poprawy: ${sides.low}.` : null,
    notable ? `${notable.label}: ${notable.word}.` : prec === 'vague' ? 'Charakteru i potencjału nie umiem jeszcze dobrze ocenić.' : null,
    `Decyzja: ${STANCE_SHORT[stance.id]}.`,
  ].filter(Boolean).join(' ');

  const knownTxt = !p.lastMove ? 'zna go od dawna' : fam >= 1 ? 'zna go już dobrze' : `zna go od ${Math.max(0, daysBetween(p.lastMove, game.date))} ${dniWord(Math.max(0, daysBetween(p.lastMove, game.date)))}`;
  return {
    id: p.id, name: p.name, pos: p.pos, group: GROUP[p.pos], age, ovr: p.ovr, nat: p.nat, academy,
    assistant: { name: staff.name ?? 'Asystent', q, label: staffLabel(q) },
    confidence: { prec, word: PREC_WORD[prec], fam, text: `Pewność oceny: ${PREC_WORD[prec]}. Asystent ${knownTxt}.` },
    summary, stance: stance.id,
    sides: { strong: sides.strong, weak: sides.weak },
    hidden: hidden.map(({ e, ...h }) => h),
    roles: {
      positions: fit.good.map((x) => ({ pos: x.pos, prof: Math.round(x.prof), rating: prec === 'vague' ? null : r1(x.rating) })),
      role: fit.role ? `${fit.role.name} (${fit.role.attrs.map((a) => ATTRS[a].name.toLowerCase()).join(', ')})` : null,
      alt: fit.alt ? fit.alt.name : null,
      learn: fit.learn ? { pos: fit.learn.pos, rating: prec === 'vague' ? null : r1(fit.learn.rating) } : null,
    },
    state: stateList, mental, outlook, recs,
  };
}

// ------------------------------------------------------------ Okresowy raport o drużynie
/** Wiadomości sztabu z ostatnich dni o danym prefiksie klucza (odwołania zamiast powtórek). */
function recentNotes(game, date, prefix, days = 7) {
  return (game.inbox ?? []).filter((m) => m.key?.startsWith(prefix) && m.date <= date && daysBetween(m.date, date) < days);
}
const mentionedIn = (notes, p) => notes.some((m) => String(m.body ?? '').includes(p.name));

function detectChance(q, severe = false) {
  const D = AREP.detect;
  return clamp(D.base + D.perQ * q + (severe ? D.severe : 0), D.min, D.max);
}

/**
 * Raport o drużynie na dzień date. Zwraca { subject, body, sections: [{ title, lines }], prec }.
 * Słaby asystent: mniej pozycji, bez liczb, czasem coś przeoczy (ziarno: okres i zawodnik, więc wynik jest stały).
 */
export function squadReport(game, date = game.date, periodId = date) {
  const st = ensureAssistantReport(game);
  const staff = staffOf(game, game.clubId).asystent ?? { q: 10, name: 'Asystent' };
  const q = clamp((staff.q ?? 10) + (staff.d?.OCE ?? 0), 1, 20); // ocena zawodników (docs/sztab-atrybuty.md)
  const prec = precisionOf(estimateSd(q, 1));
  const maxN = AREP.items(q);
  const rng = (tag) => new Rng(`asystent-raport:${game.seed}:${game.clubId}:${periodId}:${tag}`);
  const sees = (tag, severe) => rng(tag).chance(detectChance(q, severe));
  const squad = squadOf(game.world, game.clubId);
  const games = playedGames(game);
  const exact = prec === 'exact';
  const sections = [];

  // 1. Atmosfera w szatni
  const atm = [];
  const morale = teamMorale(squad.map((p) => ({ morale: p.morale, minutes: p.season?.min ?? 0 })));
  const mE = estimate(game, null, 'morale', { value: morale, subject: `druzyna:${periodId}` });
  const mWord = moraleLabel(mE.v).toLowerCase();
  const prevTxt = st.prev?.morale != null && prec !== 'vague' && Math.abs(morale - st.prev.morale) >= 0.5 ? (morale > st.prev.morale ? ', lepiej niż w poprzednim raporcie' : ', gorzej niż w poprzednim raporcie') : '';
  atm.push(`Nastroje w drużynie: ${mWord}${exact ? ` (średnio ${num(mE.v)} na 20)` : ''}${prevTxt}.`);
  const unhappy = squad.filter((p) => (p.unhappy || p.transferRequest) && sees(`unhappy:${p.id}`, p.transferRequest));
  if (unhappy.length) atm.push(`Niezadowoleni: ${unhappy.slice(0, maxN).map((p) => `${p.name}${p.transferRequest ? ' (chce odejść)' : ''}`).join(', ')}.`);
  const low = squad.filter((p) => (p.morale ?? 12) <= 8 && !p.unhappy && !p.transferRequest && sees(`low:${p.id}`, (p.morale ?? 12) <= 5));
  if (low.length) atm.push(`Niskie morale: ${low.slice(0, maxN).map((p) => p.name).join(', ')}.`);
  // Historia morale (career/morale.js): szybki spadek, zanim morale zrobi się niskie
  const falling = squad.filter((p) => (p.morale ?? 12) > 8 && !p.unhappy && !p.transferRequest && moraleFalling(p) && sees(`spadek:${p.id}`));
  if (falling.length) atm.push(`Morale szybko spada: ${falling.slice(0, maxN).map((p) => `${p.name} (o ${num(-moraleTrend(p).d)} w ostatnich tygodniach)`).join(', ')}. Warto porozmawiać, zanim będzie źle.`);
  const leaders = squad.filter((p) => p.persona === 'Lider');
  if (!leaders.length && q >= 8) atm.push('W szatni brakuje naturalnego lidera; kapitan musi wziąć więcej na siebie.');
  const sadLeaders = leaders.filter((p) => (p.morale ?? 12) <= 9 && sees(`lider:${p.id}`));
  if (sadLeaders.length) atm.push(`Uwaga na liderów w złym nastroju (${sadLeaders.map((p) => p.name).join(', ')}): ich humor szybko udziela się reszcie.`);
  if (q >= 10) {
    const byNat = {};
    for (const p of squad) if (p.nat && p.nat !== 'POL') (byNat[p.nat] ??= []).push(p);
    for (const [nat, ps] of Object.entries(byNat).filter(([, ps]) => ps.length >= 3)) {
      const avg = ps.reduce((s, p) => s + (p.morale ?? 12), 0) / ps.length;
      if (avg <= morale - 1.5) atm.push(`Grupa zawodników z kraju ${nat} (${ps.map(shortName).join(', ')}) trzyma się razem i ma gorsze nastroje niż reszta.`);
      else if (q >= 14) atm.push(`Grupa zawodników z kraju ${nat} trzyma się razem; nastroje w niej jak w całej drużynie.`);
    }
  }
  const auth = authoritySummary(game);
  const authNote = recentNotes(game, date, 'autorytet-', 14)[0];
  atm.push(`Autorytet trenera: ${auth.label.toLowerCase()}.${authNote ? ` Pisałem o tym ${fmtDate(authNote.date)}.` : auth.level === 'low' ? ` ${auth.tip}` : ''}`);
  sections.push({ title: 'Atmosfera w szatni', lines: atm });

  // 2. Trening i obciążenia
  const tr = [];
  const c = game.training?.clubs?.[game.clubId];
  const settings = game.training?.settings ?? {};
  const sum = (p) => loadSummary(p.training ?? {});
  const healthy = squad.filter((p) => !(p.injuryDays > 0));
  const acwrNotes = recentNotes(game, date, 'acwr:');
  const overloaded = healthy.filter((p) => tired({ acwr: sum(p).acwr, fresh: p.fresh ?? 95, debt: p.matchDebt ?? 0 }));
  const reported = overloaded.filter((p) => mentionedIn(acwrNotes, p));
  const restList = overloaded.filter((p) => !reported.includes(p) && sees(`rest:${p.id}`, sum(p).acwr > 1.5 || (p.fresh ?? 95) < 60));
  const manage = healthy.filter((p) => !overloaded.includes(p) && (sum(p).acwr > 1.3 || (p.fresh ?? 95) < 80) && sees(`manage:${p.id}`));
  const blunt = healthy.filter((p) => (p.sharp ?? 70) < 60 && !overloaded.includes(p) && sees(`sharp:${p.id}`));
  const low7 = healthy.filter((p) => sum(p).acwr < 0.7 && (p.training?.mode ?? 'normal') !== 'normal' && sees(`low7:${p.id}`));
  const rtp = squad.filter((p) => (p.training?.rtp ?? 0) > 0);
  const nm = (p, what) => (exact ? `${p.name} (${what(p)})` : p.name);
  const restWhat = (p) => [sum(p).acwr > 1.5 ? `ACWR ${num(sum(p).acwr, 2)}` : null, (p.fresh ?? 95) < 70 ? `świeżość ${pct(p.fresh)}` : null].filter(Boolean).join(', ');
  if (restList.length) tr.push(`Odpoczynek albo lżejszy trening: ${restList.slice(0, maxN).map((p) => nm(p, restWhat)).join(', ')}.`);
  if (reported.length) tr.push(`Przeciążonych wymienił już trener przygotowania fizycznego (${fmtDate(acwrNotes[0].date)}): ${reported.map(shortName).join(', ')}.`);
  if (manage.length) tr.push(`Kontrola obciążeń i regeneracja po meczu: ${manage.slice(0, maxN).map((p) => nm(p, (x) => `świeżość ${pct(x.fresh ?? 95)}, ACWR ${num(sum(x).acwr, 2)}`)).join(', ')}.`);
  if (blunt.length) tr.push(`Brakuje ostrości meczowej (gierki, sparing, minuty z ławki): ${blunt.slice(0, maxN).map((p) => nm(p, (x) => `ostrość ${pct(x.sharp ?? 70)}`)).join(', ')}.`);
  if (low7.length) tr.push(`Za małe obciążenie, wrócić do pełnego treningu: ${low7.slice(0, maxN).map((p) => p.name).join(', ')}.`);
  if (rtp.length) tr.push(`W programie powrotu po kontuzji: ${rtp.map((p) => `${p.name}${exact ? ` (jeszcze ${p.training.rtp} ${dniWord(p.training.rtp)})` : ''}`).join(', ')}.`);
  // Jedna rekomendacja dla planu drużyny (bez sprzecznych zaleceń: przy przeciążeniu nigdy akcent fizyczny)
  const stale = c ? staleness(c) : 0;
  const coh = teamCohesion(game);
  const nudaNote = recentNotes(game, date, 'nuda:')[0];
  const accent = settings.accent ?? 'zrownowazony';
  const pickAccent = () => (coh.z < 72 && accent !== 'taktyczny' ? 'taktyczny' : accent !== 'techniczny' ? 'techniczny' : 'zrownowazony');
  let plan;
  // Cała drużyna zmęczona (bez zawodników w programie powrotu, u nich wysoki ACWR jest zaplanowany): niższy poziom planu;
  // pojedynczym zawodnikom wystarczy tryb indywidualny z listy powyżej
  const teamTired = overloaded.filter((p) => !((p.training?.rtp ?? 0) > 0)).length;
  if (teamTired >= Math.max(4, Math.ceil(0.2 * healthy.length)) && settings.load !== 'niska') plan = `Proponuję na tydzień obniżyć poziom obciążeń w planie (${LOAD_LEVELS.niska.name}): zmęczonych jest ${teamTired}.`;
  else if (stale > 0) {
    const to = pickAccent();
    plan = nudaNote ? `Znużenie treningiem trwa (pisałem ${fmtDate(nudaNote.date)}): zmień akcent tygodnia, np. na ${ACCENTS[to].name.toLowerCase()}.`
      : `Ten sam akcent planu od ${c.var?.w ?? 0} tygodni, zawodnicy są znużeni: zmień akcent tygodnia, np. na ${ACCENTS[to].name.toLowerCase()}.`;
  } else if (coh.z < 58 && accent !== 'taktyczny') plan = `Zgranie drużyny jest ${coh.label.toLowerCase()}: akcent taktyczny na 1-2 tygodnie pomoże.`;
  else if (blunt.length >= 4 && accent === 'fizyczny') plan = 'Wielu zawodnikom brakuje ostrości: akcent zrównoważony (więcej gierek) zamiast fizycznego.';
  else plan = `Plan treningu bez zmian (akcent: ${(ACCENTS[accent]?.name ?? 'Zrównoważony').toLowerCase()}, poziom obciążeń: ${(LOAD_LEVELS[settings.load]?.name ?? 'Normalna').toLowerCase()}).`;
  tr.push(plan);
  sections.push({ title: 'Trening i obciążenia', lines: tr });

  // 3. Ryzyko urazów (prognoza z modelu urazów treningowych, odporność w ocenie sztabu)
  const fitQ = staffA(game, game.clubId, 'fizyczny', 'OBC'); // planowanie obciążeń
  const riskOf = (p) => trainingInjuryChance({ ...p, hidden: { ...p.hidden, ODP: estimate(game, p, 'ODP').v } }, {
    sessions: [{ type: 'gierki', int: 'mid' }], age: ageAt(p, date), acwr: sum(p).acwr, fitQ, fresh: p.fresh ?? 95, mode: p.training?.mode,
    rtp: (p.training?.rtp ?? 0) > 0, returning: !!p.training?.returnedAt && daysBetween(p.training.returnedAt, date) <= 14,
  });
  const risks = healthy.map((p) => ({ p, r: riskOf(p) })).sort((a, b) => b.r - a.r);
  const median = risks.length ? risks[Math.floor(risks.length / 2)].r : 0;
  const riskList = risks.filter((x) => median > 0 && x.r >= 1.6 * median && !reported.includes(x.p) && sees(`risk:${x.p.id}`)).slice(0, maxN);
  sections.push({ title: 'Ryzyko urazów', lines: riskList.length
    ? [`Najbardziej narażeni: ${riskList.map((x) => (exact ? `${x.p.name} (ok. ${num(x.r / median, 1)} raza więcej niż typowo)` : x.p.name)).join(', ')}.`, 'Pomaga lżejszy trening, regeneracja i krótsze występy.']
    : ['Nie widzę zawodników z wyraźnie podwyższonym ryzykiem urazu.'] });

  // 4. Z kim porozmawiać (sugestie rozmów, bez powtórek przypomnień o uwadze z ostatniego tygodnia)
  const talks = [];
  const hinted = [];
  for (const x of talkSuggestions(game)) {
    const h = x.p.att?.h;
    if (h && daysBetween(h, date) < 7) { hinted.push(x.p); continue; }
    if (talkCooldown(game, x.p.id) > 0) continue; // rozmowa w tym tygodniu już była
    const pick = talkPick(x.p, x.reasons);
    if (pick && sees(`talk:${x.p.id}`, x.reasons.length >= 2)) talks.push(`${x.p.name}: ${pick.label.toLowerCase()} (${pick.why.toLowerCase()}${pick.note ? `; ${pick.note}` : ''})`);
  }
  if (talks.length) talks.splice(maxN);
  const tl = talks.length ? [`Warto porozmawiać: ${talks.join('; ')}.`] : ['Nikt nie czeka pilnie na rozmowę.'];
  if (hinted.length) tl.push(`O rozmowach z ${hinted.map(shortName).join(', ')} pisałem w tym tygodniu osobno.`);
  sections.push({ title: 'Rozmowy', lines: tl });

  // 5. Rozwój (szczegóły zmian są w miesięcznym raporcie rozwoju, tu tylko decyzje)
  const dev = [];
  const prospects = squad.filter((p) => ageAt(p, date) <= 23 && games >= 4 && (minutesShare(p, games) ?? 1) < 0.3)
    .map((p) => ({ p, e: estimate(game, p, 'POT') })).filter((x) => !x.e.blind && x.e.v - x.p.ovr >= 2 && sees(`dev:${x.p.id}`))
    .sort((a, b) => (b.e.v - b.p.ovr) - (a.e.v - a.p.ovr)).slice(0, maxN);
  if (prospects.length) dev.push(`Młodzi z zapasem rozwoju, którzy mało grają: ${prospects.map((x) => x.p.name).join(', ')}. Potrzebują minut, inaczej rozwój zwolni; rozważ wypożyczenie w oknie transferowym.`);
  const rep = (game.training?.reports ?? [])[0];
  if (rep) dev.push(`Zmiany atrybutów i formy fizycznej: raport rozwoju z ${fmtDate(rep.date)}.`);
  const ac = academyOf(game.world, game.clubId).map((p) => ({ p, e: estimate(game, p, 'POT') })).filter((x) => !x.e.blind && x.e.v >= 12 && sees(`acad:${x.p.id}`))
    .sort((a, b) => b.e.v - a.e.v).slice(0, 2);
  if (ac.length) dev.push(`W akademii wyróżnia się: ${ac.map((x) => x.p.name).join(', ')}.`);
  if (dev.length) sections.push({ title: 'Rozwój', lines: dev });

  const closing = `Pewność raportu: ${PREC_WORD[prec]} (${staff.name ?? 'asystent'}, ${staffLabel(q).toLowerCase()}). Częstotliwość raportu zmienisz w zakładce Trening, Sztab.`;
  const body = [...sections.map((s) => `${s.title}\n${s.lines.join('\n')}`), closing].join('\n\n');
  const [y, m] = date.split('-').map(Number);
  const subject = st.freq === 'monthly' ? `Raport asystenta: ${MONTHS_PL[m - 1]} ${y}` : `Raport asystenta, ${fmtDate(date)}`;
  return { subject, body, sections, prec, morale };
}

// ------------------------------------------------------------ System dnia
/** Zapis urazów zawodników klubu gracza (historia do raportu o zawodniku). */
function logInjuries(game, st) {
  const ids = new Set(st.inj.map((x) => `${x.id}:${x.d}`));
  for (const p of [...squadOf(game.world, game.clubId), ...academyOf(game.world, game.clubId)]) {
    if (!(p.injuryDays > 0) || !p.injury?.since || ids.has(`${p.id}:${p.injury.since}`)) continue;
    st.inj.push({ id: p.id, d: p.injury.since, n: p.injury.days ?? p.injuryDays, x: p.injury.name ?? null });
  }
  if (st.inj.length > AREP.injLog) st.inj = st.inj.slice(-AREP.injLog);
}

export const ASSISTANT_SYSTEM = {
  id: 'assistantReport', order: 97, // po treningu dnia (95): świeżość i obciążenia z dzisiejszych zajęć
  run(game, date) {
    if (!game?.world?.clubs?.[game.clubId]) return {};
    const st = ensureAssistantReport(game);
    logInjuries(game, st);
    if (st.freq === 'off') return {};
    const per = reportPeriod(st.freq, date);
    const key = `${st.freq}:${per.id}`;
    if (st.last === key || date < per.from || date > per.to) return {};
    if (clubMatchOn(game, date)) return {}; // w dniu meczu raport czeka na kolejny dzień
    if (st.sentOn && daysBetween(st.sentOn, date) < AREP.minGap) return {};
    const r = squadReport(game, date, per.id);
    st.last = key; st.sentOn = date; st.prev = { morale: r.morale, date };
    return { messages: [createMessage({ date, key: `arep:${key}`, category: 'staff', from: 'Asystent trenera', priority: 'info', subject: r.subject, body: r.body })] };
  },
};

registerDailySystem(ASSISTANT_SYSTEM);
