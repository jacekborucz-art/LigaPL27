// Negocjacje kontraktów: podpisanie zawodnika (transfer albo wolny zawodnik) i przedłużenie kontraktu.
// Sesja z rundami: gracz składa ofertę, zawodnik (albo jego agent) odpowiada akceptacją, kontrofertą,
// żądaniem zmiany jednego elementu, ultimatum albo zerwaniem. Kluby AI używają tej samej logiki w trybie 'ai'
// (maks. 2 rundy). Wszystko to operacje na kilkunastu liczbach: bez pętli po świecie.
// Specyfikacja: docs/negocjacje.md. Wartości balansowe oznaczone [SZAC].
//
// Jednostki: pensja tygodniowa w zł, premie i klauzule w zł, daty ISO 'YYYY-MM-DD'.

import { negLevers } from './clubNegotiation.js'; // atrybut Negocjacje klubów AI (docs/negocjacje.md, rozdz. 15)
import { Rng, clamp } from '../core/rng.js';
import { willingnessToJoin, clubReputation } from './reputation.js';
import { GROUP } from './squad.js';
import { personalityOf, computeMindset, elementPrefs, AGENT_TYPES } from './personality.js';
import { pickLine } from './negotiationLines.js';
import { payLevel, EUR_PLN } from '../data/finanse_klubow.js';
import { noteRenewal, addMonths, nextWindowOpen, windowAt } from './wishMemory.js'; // pamięć prośby o transfer po przedłużeniu, okna (blokada po fiasku)

/** Wartość rynkowa: EUR przy OVR 10 w Ekstraklasie i nachylenie po OVR (docs/finanse.md 3.2). [SZAC] */
export const VALUE_BASE_EUR = 250000;
export const VALUE_SLOPE = 0.75;

// ---------------------------------------------------------------- Stałe
export const MAX_YEARS = 5; // w Polsce kontrakt maks. 5 lat
export const RENEW_WINDOW_MONTHS = 18; // rozmowy o przedłużeniu od 18 miesięcy przed końcem kontraktu [SZAC]
export const GRUDGE_HALF_LIFE_DAYS = 90; // pamięć urazy wygasa o połowę co 90 dni [SZAC]
export const PROMISE_GRACE_MONTHS = 1; // pierwszy miesiąc po podpisie bez rozliczania obietnicy [SZAC]

export const ROLES = ['kluczowy', 'podstawowy', 'rotacja', 'perspektywiczny', 'rezerwowy'];
export const ROLE_LABELS = {
  kluczowy: 'kluczowy zawodnik',
  podstawowy: 'podstawowy skład',
  rotacja: 'zawodnik rotacyjny',
  perspektywiczny: 'perspektywiczny zawodnik',
  rezerwowy: 'rezerwowy',
};
export const ROLE_RANK = { kluczowy: 4, podstawowy: 3, rotacja: 2, perspektywiczny: 1.5, rezerwowy: 1 };
/** Minimalny udział w minutach, przy którym obietnica roli jest dotrzymana (miesięcznie). [SZAC] */
export const ROLE_MIN_SHARE = { kluczowy: 0.7, podstawowy: 0.55, rotacja: 0.3, perspektywiczny: 0.15, rezerwowy: 0.05 };
export const ROLE_EXP_SHARE = { kluczowy: 0.85, podstawowy: 0.7, rotacja: 0.45, perspektywiczny: 0.25, rezerwowy: 0.15 }; // [SZAC]
// Oczekiwane statystyki na mecz do wyceny premii (gole, asysty, czyste konta). [SZAC]
const RATES = { GK: { g: 0, a: 0.01, cs: 0.3 }, DEF: { g: 0.04, a: 0.06, cs: 0.3 }, MID: { g: 0.12, a: 0.15, cs: 0 }, ATT: { g: 0.35, a: 0.15, cs: 0 } };
// Jak bardzo niska oferta obraża danego typu osobowości. [SZAC]
const PERSONA_TOUCHY = { Ambitny: 1.15, Narwaniec: 1.25, Wrażliwy: 1.1, Spokojny: 0.75, Lider: 0.9 };
// Pensje (docs/finanse.md 3.1): tydzień w zł przy OVR 10 w Ekstraklasie dla klubu o płacowości 1, mnożnik ligi
// i nachylenie po OVR. Kalibracja do płac I drużyn z raportu Grant Thornton 2025/26 [SZAC].
export const WAGE_BASE = 9000;
export const WAGE_SLOPE = 0.45;
export const TIER_WAGE = { 1: 1, 2: 0.66, 3: 0.38, 4: 0.2 };
export const WAGE_MAX = 140000; // ok. 600 tys. zł miesięcznie, poziom najlepiej opłacanych w Ekstraklasie [SZAC]

/**
 * Decyzja zawodnika przy transferze (docs/negocjacje.md „Decyzja zawodnika przy transferze”, src/career/playerMind.js):
 * rozmowy o podpisie z werdyktem bramki ctx.mind = { verdict, timing }. Werdykt zmienia oczekiwania, rundy i nastrój
 * na start; reakcje na ofertę liczone z r = wartość oferty / cel; blokada po fiasku w miesiącach. [SZAC]
 */
export const MIND = {
  verdict: {
    keen: { ask: 1, mood: 5, wow: 1.2, rounds: [4, 5] }, // chętny: pełne rundy
    open: { ask: 1, mood: 0, wow: 1.2, rounds: [2, 5] },
    convince: { ask: 1.08, mood: -8, wow: 1.2, rounds: [2, 3] }, // do przekonania: wyższe żądania, mniej rund
    reluctant: { ask: 1.15, mood: -12, wow: 1.3, rounds: [2, 2] }, // niechętny: jedna rozmowa, potrzebne „wow”
  },
  timingW: 0.1, // termin przejścia: oczekiwania x (1 - 0,1 x timing), pasujący termin obniża, zły podnosi
  rounds: { base: 3.5, patience: 0.12, temper: -0.08, prof: 0.1, rnd: 0.6, min: 2, max: 5, ai: 4 },
  extraP: 0.3, extra: 0.05, // r 1,00-1,20: 30 % prosi o drobny dodatek (5 % celu) na ulubionym elemencie
  soften: 0.9, // zawodnik mięknie z rundami: w ostatniej rundzie cel - 0,9 x (cel - minimum) x ustępliwość agenta
  counterR: 0.92, firmR: 0.85, firm: [0.35, 0.02, -0.02], small: [0.75, 1], gap: [0.5, 1], lowMood: 4, bluffCut: 0.97,
  // Blokada po fiasku (miesiące, poza oknem do otwarcia najbliższego okna): wyczerpane rundy 3-6, bliska odmowa 4,
  // zerwanie i ultimatum 6, obraza 8 + 0,4 (ego - 10) + 0,3 (temperament - 10); spór o pieniądze (r >= 0,97) 14-60 dni
  lock: { base: 3, spread: 3, near: 4, nearR: 0.9, moneyR: 0.97, money: [14, 60], brk: 6, insult: 8, ego: 0.4, temper: 0.3, min: 3, max: 12, agent: { rekin: 1.2, brak: 0.7 } },
};

/** Liczba rund rozmów o transferze (2-5, typowo 3-4): cierpliwość, temperament, profesjonalizm, agent, werdykt bramki. */
export function mindRounds(t, agentType, verdict, rng, ai = false) {
  const R = MIND.rounds;
  const ag = AGENT_TYPES[agentType] || AGENT_TYPES.rozsadny;
  const x = (R.base + R.patience * (t.patience - 10) + R.temper * (t.temper - 10) + R.prof * (t.professionalism - 10) + (rng.next() * 2 - 1) * R.rnd) * ag.patienceMul;
  const [lo, hi] = (MIND.verdict[verdict] ?? MIND.verdict.open).rounds;
  const n = clamp(clamp(Math.round(x), R.min, R.max), lo, hi);
  return ai ? Math.min(n, R.ai) : n;
}

/** Koniec blokady: w oknie transferowym bez zmian, poza oknem otwarcie najbliższego okna. */
export function lockEnd(iso) {
  return windowAt(iso) ? iso : nextWindowOpen(iso);
}

/** Blokada po nieudanych rozmowach o transferze (czysta funkcja). d: dane sesji. Zwraca { until, months, days }. */
export function mindLockSpan(d, reason, rng) {
  const L = MIND.lock;
  const t = d.traits;
  const r = d.mind?.r ?? 0;
  let months = null; let days = null;
  if (reason === 'insult') months = L.insult + L.ego * (t.ego - 10) + L.temper * (t.temper - 10);
  else if (reason === 'mood' || reason === 'ultimatum') months = L.brk;
  else if (r >= L.moneyR) days = rng.int(L.money[0], L.money[1]);
  else if (r >= L.nearR) months = L.near;
  else months = reason === 'walkaway' ? L.base : L.base + rng.int(0, L.spread);
  if (days != null) return { until: addDays(d.date, days), months: null, days };
  months *= L.agent[d.agentType] ?? 1;
  months = clamp(Math.round(months + rng.int(-1, 1)), L.min, L.max);
  const until = lockEnd(addMonths(d.date, months));
  return { until, months, days: daysBetween(d.date, until) };
}

// ---------------------------------------------------------------- Formatowanie i daty
const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']; // data po polsku jak fmtDate (src/ui/dom.js)

/** 'YYYY-MM-DD' -> '24 lip 2026'. */
export function formatDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** 12500 -> '12 500 zł'. */
export function formatZl(n) {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} zł`;
}

export function yearsLabel(n) {
  return n === 1 ? '1 rok' : n <= 4 ? `${n} lata` : `${n} lat`;
}

const dayNo = (iso) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
export const daysBetween = (a, b) => dayNo(b) - dayNo(a);
export function addDays(iso, days) {
  return new Date((dayNo(iso) + days) * 86400000).toISOString().slice(0, 10);
}
export function monthsBetween(fromIso, toIso) {
  if (!toIso) return 0;
  const [y1, m1] = fromIso.split('-').map(Number);
  const [y2, m2] = toIso.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}
/** Koniec sezonu (Jun 30) dla daty. */
export function seasonEndOf(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${m >= 7 ? y + 1 : y}-06-30`;
}

const ceilTo = (x, step) => Math.ceil(x / step) * step;

/** Słownie, kiedy zawodnik wróci do rozmów (bez daty): kilka dni, kilka tygodni, kilka miesięcy. */
export function lockWords(fromIso, untilIso) {
  const n = daysBetween(fromIso, untilIso);
  return n <= 10 ? 'kilka dni' : n <= 45 ? 'kilka tygodni' : 'kilka miesięcy';
}
const roundTo = (x, step) => Math.round(x / step) * step;

// ---------------------------------------------------------------- Rynek
/**
 * Rynkowa pensja tygodniowa w zł z OVR i ligi (docs/finanse.md 3.1). foreign: obcokrajowiec w Ekstraklasie
 * albo oferta z zagranicy (x1,5 zamiast mnożnika ligi). level: płacowość klubu (payLevel z data/finanse_klubow.js),
 * bo bogaci właściciele płacą ponad rynek. [SZAC]
 */
export function marketWage(ovr, tier = 1, foreign = false, level = 1) {
  const mul = foreign ? 1.5 : (TIER_WAGE[tier] ?? TIER_WAGE[4]);
  return clamp(roundTo(WAGE_BASE * Math.exp(WAGE_SLOPE * (ovr - 10)) * mul * level, 100), 500, WAGE_MAX);
}

/** Wartość rynkowa w zł (gdy zawodnik nie ma wyliczonej value), ten sam wzór co marketValue w playerGen. [SZAC] */
export function estimateValue(player) {
  return player.value ?? roundTo(VALUE_BASE_EUR * Math.exp(VALUE_SLOPE * ((player.ovr ?? 10) - 10)) * EUR_PLN, 1000);
}

const roleRank = (role, age) => (role === 'perspektywiczny' && age <= 21 ? 2 : ROLE_RANK[role] ?? 2);

/** Rola, jakiej zawodnik się spodziewa w klubie: z OVR względem poziomu klubu (L) albo z reputacji. */
export function expectedRole(player, club, traits) {
  const age = player.age ?? 25;
  const diff = club.L != null && player.ovr != null
    ? player.ovr - club.L
    : ((player.rep ?? 35) - clubReputation(club)) / 8;
  let r = diff >= 1.5 ? 'kluczowy' : diff >= 0.3 ? 'podstawowy' : diff >= -0.8 ? 'rotacja' : 'rezerwowy';
  if (age <= 21 && (r === 'rezerwowy' || r === 'rotacja')) r = 'perspektywiczny';
  if (traits && traits.ego >= 15 && r !== 'kluczowy' && diff >= 0) r = ROLES[ROLES.indexOf(r) - 1]; // ego: o stopień wyżej
  return r;
}

// ---------------------------------------------------------------- Relacje z klubem
const REL_DEFAULT = { trust: 50, grudge: 0, grudgeDate: null, brokenPromises: 0, lockUntil: null, lockReason: null };

/** Kopia relacji zawodnika z klubem (zaufanie, uraza, złamane obietnice, blokada, historia). */
export function relationWith(player, clubId) {
  const r = player.relations?.[clubId] || {};
  return { ...REL_DEFAULT, ...r, history: [...(r.history || [])] };
}

/** Uraza po wygaszeniu: połowa co GRUDGE_HALF_LIFE_DAYS. */
export function currentGrudge(rel, dateIso) {
  if (!rel.grudge) return 0;
  if (!rel.grudgeDate) return rel.grudge;
  return rel.grudge * 0.5 ** (Math.max(0, daysBetween(rel.grudgeDate, dateIso)) / GRUDGE_HALF_LIFE_DAYS);
}

/** Czy zawodnik w ogóle chce rozmawiać z klubem (blokada po fiasku). */
export function canNegotiate(player, clubId, dateIso) {
  const rel = player.relations?.[clubId];
  if (rel?.lockUntil && dateIso < rel.lockUntil) return { ok: false, until: rel.lockUntil, reason: rel.lockReason || 'fiasko' };
  return { ok: true };
}

// ---------------------------------------------------------------- Oferta i jej wycena
/**
 * Oferta: { wage, years 1-5, signOn, bonus:{goal, assist, cleanSheet, app}, raise 0-0.2 (coroczna podwyżka),
 *           clause:{amount, foreignOnly}|null, relegationCut 0-0.5, role, agentFee }.
 */
export function normalizeOffer(o = {}) {
  const b = o.bonus || {};
  const nn = (x) => Math.max(0, Math.round(x || 0));
  return {
    wage: nn(o.wage),
    years: clamp(Math.round(o.years || 1), 1, MAX_YEARS),
    signOn: nn(o.signOn),
    bonus: { goal: nn(b.goal), assist: nn(b.assist), cleanSheet: nn(b.cleanSheet), app: nn(b.app) },
    raise: clamp(o.raise || 0, 0, 0.2),
    clause: o.clause && o.clause.amount > 0 ? { amount: nn(o.clause.amount), foreignOnly: !!o.clause.foreignOnly } : null,
    relegationCut: clamp(o.relegationCut || 0, 0, 0.5),
    role: ROLE_RANK[o.role] ? o.role : 'rotacja',
    agentFee: nn(o.agentFee),
  };
}

const expectedFee = (d) => AGENT_TYPES[d.agentType].feePct * d.hidden.target * 52;

function clausePenalty(cl, d) {
  const pr = d.prefs;
  if (!pr.wantsClause) return 0;
  const base = d.hidden.target * 0.05 * pr.clauseW;
  if (!cl) return base;
  let p = base * clamp((cl.amount / d.value - 1.5) / 3, 0, 1); // klauzula do 1,5x wartości w pełni satysfakcjonuje
  if (cl.foreignOnly && !pr.wantsAbroad) p += d.hidden.target * 0.01 * pr.clauseW;
  return p;
}

function agentPenalty(fee, d) {
  const ag = AGENT_TYPES[d.agentType];
  if (!ag.influence) return 0;
  const r = fee / Math.max(1, expectedFee(d));
  const T = d.hidden.target;
  return r < 1 ? T * 0.06 * ag.influence * (1 - r) : -T * 0.02 * ag.influence * Math.min(0.5, r - 1);
}

/**
 * Wycena oferty w "ekwiwalencie pensji tygodniowej" (Weq) dla konkretnego zawodnika.
 * Weq = wage * a + b, gdzie a obejmuje podwyżki i ryzyko obniżki po spadku, a b premie oraz kary
 * za rolę, długość, klauzulę (przeliczone przez wagę pieniędzy) i prowizję agenta.
 */
export function valueOffer(o, d) {
  const pr = d.prefs;
  const T = d.hidden.target;
  const a = 1 + (o.raise * (o.years - 1) / 2) * pr.raisePref - o.relegationCut * d.pRel * pr.relegPref;
  const e = d.exp;
  const bonusWeekly = (o.bonus.goal * e.goals + o.bonus.assist * e.assists + o.bonus.cleanSheet * e.cleanSheets + o.bonus.app * e.apps) / 52;
  const extra = (o.signOn / (o.years * 52)) * pr.signOnPref + bonusWeekly * pr.bonusPref;
  const gap = roleRank(d.roleExp, d.age) - roleRank(o.role, d.age);
  const pen = {
    role: gap > 0 ? T * 0.07 * pr.roleW * gap : -T * 0.015 * pr.roleW * Math.min(1, -gap),
    years: T * 0.035 * pr.lenW * Math.abs(o.years - pr.idealYears),
    clause: clausePenalty(o.clause, d),
    agentFee: agentPenalty(o.agentFee, d),
  };
  const b = extra - (pen.role + pen.years + pen.clause) / pr.moneyW - pen.agentFee;
  // cash: pieniądze i rola, bez długości, klauzuli i prowizji; tylko to może obrazić zawodnika
  return { weq: o.wage * a + b, a, b, pen, cash: o.wage * a + extra - pen.role / pr.moneyW };
}

const desiredClause = (d) => ({ amount: roundTo(d.value * 1.5, 10000), foreignOnly: d.prefs.wantsAbroad });

/** Pojedyncze poprawki, których zawodnik chciałby poza pieniędzmi: [element, wartość]. */
function wantedFixes(o, d) {
  const pr = d.prefs;
  const out = [];
  if (roleRank(o.role, d.age) < roleRank(d.roleExp, d.age)) out.push(['role', d.roleExp]);
  if (Math.abs(o.years - pr.idealYears) >= 1 && pr.lenW >= 0.7) out.push(['years', pr.idealYears]);
  if (clausePenalty(o.clause, d) > 0) out.push(['clause', desiredClause(d)]);
  if (agentPenalty(o.agentFee, d) > 0) out.push(['agentFee', roundTo(expectedFee(d), 1000)]);
  if (o.relegationCut > 0.15 && pr.relegPref >= 1.2) out.push(['relegationCut', 0.15]);
  return out;
}

const withFix = (o, [el, v]) => ({ ...o, bonus: { ...o.bonus }, [el]: v });

/** Kontroferta: poprawki elementów + brakująca kwota (część w premii za podpis u chciwych). */
function buildCounter(o, d, target) {
  let c = { ...o, bonus: { ...o.bonus } };
  for (const f of wantedFixes(o, d)) c = withFix(c, f);
  let v = valueOffer(c, d);
  const pr = d.prefs;
  if (target - v.weq > 0) {
    const share = clamp((pr.signOnPref - 1) * 1.5, 0, 0.4);
    if (share > 0) c.signOn += ceilTo(((target - v.weq) * share * c.years * 52) / pr.signOnPref, 1000);
    v = valueOffer(c, d);
    if (target - v.weq > 0) c.wage = ceilTo(c.wage + (target - v.weq) / v.a, 100);
  }
  return { offer: c, weq: valueOffer(c, d).weq };
}

// ---------------------------------------------------------------- Kontrakt
export function buildContract(o, dateIso) {
  const [y, m] = dateIso.split('-').map(Number);
  const startYear = m >= 7 ? y : y - 1;
  let endYear = startYear + o.years + (m < 7 ? 1 : 0); // w trakcie sezonu lata liczone od następnego sezonu
  if (`${endYear}-06-30` > `${y + MAX_YEARS}-${String(m).padStart(2, '0')}-31`) endYear -= 1; // maks. 5 lat
  return {
    wage: o.wage,
    signed: dateIso,
    until: `${endYear}-06-30`,
    years: o.years,
    signOn: o.signOn,
    bonusGoal: o.bonus.goal,
    bonus: { ...o.bonus },
    raise: o.raise,
    clause: o.clause ? o.clause.amount : 0,
    clauseForeignOnly: o.clause ? o.clause.foreignOnly : false,
    relegationCut: o.relegationCut,
    agentFee: o.agentFee,
    promise: { role: o.role, since: dateIso, strikes: 0, kept: 0, broken: false },
  };
}

// ---------------------------------------------------------------- Teksty
export function moodLabel(m) {
  return m >= 70 ? 'zadowolony' : m >= 50 ? 'spokojny' : m >= 32 ? 'zniecierpliwiony' : m >= 15 ? 'zirytowany' : 'obrażony';
}
const moodTag = (m) => (m >= 65 ? 'high' : m >= 35 ? 'mid' : 'low');

function offerVars(o) {
  return {
    kwota: formatZl(o.wage),
    premia: formatZl(o.signOn),
    lata: yearsLabel(o.years),
    rola: ROLE_LABELS[o.role],
    klauzula: o.clause ? `${formatZl(o.clause.amount)}${o.clause.foreignOnly ? ' (tylko kluby zagraniczne)' : ''}` : 'brak',
    prowizja: formatZl(o.agentFee),
  };
}

function speakLine(key, ctx, rng, vars) {
  const L = pickLine(key, ctx, rng, vars);
  return { speaker: L.who === 'A' ? AGENT_TYPES[ctx.agentType].label : ctx.name, text: L.text };
}

function rngState(r) {
  return { state: r.state, spare: r._spare };
}
function rngFrom(j) {
  const r = Rng.fromJSON(j);
  r._spare = j.spare ?? null;
  return r;
}

// ---------------------------------------------------------------- Otwarcie rozmów
/**
 * Otwiera negocjacje.
 * opts: { kind: 'sign'|'renew', player, club, fromClub (sign; null = wolny zawodnik), date, rng (Rng świata),
 *         mode: 'player'|'ai',
 *         ctx: { rival:{club, wage}|null, minutesShare, avgRating, windowEnd, seasonEnd, relegationRisk,
 *                expectedRole, homeClub, toEurope, fromEurope, inEurope } }
 * Zwraca { ok:true, session, opening } albo { ok:false, reason, text, until?, outcome? }.
 * reason: 'locked' | 'refuseJoin' | 'tooEarly' | 'expired' | 'refuseRenew' | 'refused'.
 */
export function openNegotiation(opts) {
  const { kind = 'sign', player, club, fromClub = null, date, mode = 'player' } = opts;
  const ctx = opts.ctx || {};
  const ai = mode === 'ai';
  const { traits, agent } = personalityOf(player);
  const t = traits;
  const ag = AGENT_TYPES[agent] || AGENT_TYPES.rozsadny;
  const name = player.name || `Zawodnik ${player.id}`;
  const textCtx = (mood) => ({ agentType: agent, moodTag: moodTag(mood), traits: t, age: player.age, name });
  const baseVars = { imie: name.split(' ')[0], zawodnik: name, klub: club.name || 'klub' };
  const quick = (key, vars = {}) => speakLine(key, textCtx(40), new Rng(`txt:${key}:${player.id}:${date}`), { ...baseVars, ...vars });
  const fail = (reason, key, extra = {}, vars = {}) => ({ ok: false, reason, ...quick(key, vars), ...extra });

  const lock = canNegotiate(player, club.id, date);
  if (!lock.ok) return fail('locked', 'locked', { until: lock.until }, { data: formatDate(lock.until) });

  const base = opts.rng ?? new Rng('negocjacje');
  const rng = base.fork(`neg:${kind}:${player.id}:${club.id}:${date}`);
  const txt = rng.fork('txt');

  const rel = relationWith(player, club.id);
  const grudge = currentGrudge(rel, date);
  const broken = rel.brokenPromises;
  const trust = rel.trust;
  const age = player.age ?? 25;
  const rep = player.rep ?? 35;
  const clubRep = clubReputation(club);
  const curWage = player.contract?.wage || player.wage || 0; // wolny zawodnik: ostatnia pensja w player.wage
  const mWage = marketWage(player.ovr ?? 10, club.tier ?? 1, !!club.foreign, club.foreign ? 1 : payLevel(club));
  const monthsLeft = monthsBetween(date, player.contract?.until);
  const homeClub = ctx.homeClub ?? (!!player.homeRegion && player.homeRegion === club.region);
  const mindset = computeMindset(player, t, { minutesShare: ctx.minutesShare, homeClub, clubForeign: !!club.foreign });
  const prefs = elementPrefs(t, mindset.key, player);
  const rival = ctx.rival ? {
    name: ctx.rival.club?.name || 'Inny klub',
    rep: clubReputation(ctx.rival.club || { prestige: 5 }),
    wage: ctx.rival.wage || 0,
  } : null;

  let willScore;
  let target;
  let publicDemand;
  let lev = 0; let levRival = 0; let levOwn = 0; // przedłużenie: siła przetargowa i jej część z oferty konkurencji
  if (kind === 'sign') {
    const from = fromClub ?? { prestige: 0, rep: clamp(rep - 5, 0, 100), tier: club.tier ?? 1 };
    // Wolny zawodnik długo bez klubu obniża żądanie (D_free, src/career/mindset.js): max(0,6 rynku, rynek x (1 - 0,45 D_free))
    const baseWage = curWage > 0 ? curWage : Math.max(0.6 * mWage, mWage * (1 - 0.45 * (player.stepDownFree ?? 0)));
    const wctx = {
      player: { rep, age, persona: player.persona, wage: baseWage, monthsLeft: fromClub ? monthsLeft : 0, unhappy: !!player.unhappy, stepDown: player.stepDown ?? 0, free: !fromClub },
      from, to: club, fromTier: from.tier ?? 1, toTier: club.tier ?? 1, toEurope: ctx.toEurope, fromEurope: ctx.fromEurope,
    };
    const w = willingnessToJoin(wctx);
    if (w.verdict === 'odmowa') {
      // Pieniądze pomagają tylko częściowo: jeśli nawet półtorej żądanej pensji nie zmienia werdyktu, nie ma rozmów.
      const g = w.score === 0 ? w : willingnessToJoin({ ...wctx, offerWage: w.wageDemand * 1.5 });
      if (g.verdict === 'odmowa') return fail('refuseJoin', 'refuseJoin', { reasons: w.reasons });
    }
    willScore = w.score;
    publicDemand = w.wageDemand;
    target = w.wageDemand * (1 + 0.35 * (0.55 - willScore)); // niechęć podnosi cenę, chęć ją obniża [SZAC]
  } else {
    if (player.preContract) return { ...fail('preContract', 'refusedAlready'), text: 'Zawodnik podpisał już umowę z innym klubem od 1 lipca. Nie przedłuży kontraktu.' };
    if (player.retiring) return { ...fail('refused', 'refusedAlready'), text: 'Zawodnik ogłosił, że po sezonie kończy karierę. Nie przedłuży kontraktu.' };
    if (player.renewRefused) return fail('refused', 'refusedAlready');
    if (monthsLeft > RENEW_WINDOW_MONTHS && !ctx.forceRenew) return fail('tooEarly', 'tooEarly', { monthsLeft });
    if (monthsLeft <= 0) return fail('expired', 'tooEarly', { monthsLeft });
    const w = willingnessToJoin({
      player: { rep, age, persona: player.persona, wage: curWage || mWage, unhappy: false },
      from: club, to: club, fromTier: club.tier ?? 1, toTier: club.tier ?? 1, toEurope: ctx.inEurope, fromEurope: ctx.inEurope,
    });
    const rivalPull = rival ? clamp((rival.rep - clubRep) / 60, 0, 0.35) : 0;
    // Chęć pozostania [SZAC]
    const stay = 0.2 + 0.6 * w.score + 0.025 * (t.loyalty - 10) + 0.006 * (trust - 50) - 0.12 * broken - 0.003 * grudge
      + 0.01 * (t.homeTies - 10) - (mindset.key === 'zagranica' ? 0.25 : 0) - rivalPull
      - (player.unhappy ? 0.3 : 0) - (player.transferRequest ? 0.3 : 0) + (ctx.stayBonus ?? 0) + rng.gauss(0, 0.04); // stayBonus: podwyżka przy prośbie o transfer
    if (w.score === 0 || stay < 0.35) {
      const outcome = {
        kind, mode, playerId: player.id, clubId: club.id, date, accepted: false, refused: true, reason: 'refuseRenew',
        rounds: 0, contract: null, lock: null, grudgeAdd: 0, trustDelta: 0, moraleDelta: 0, renewRefused: true, transferRequest: false,
      };
      return fail('refuseRenew', 'refuseRenew', { outcome, stay: Math.round(stay * 100) / 100 });
    }
    willScore = clamp(stay, 0, 1);
    // Siła przetargowa: forma, reputacja wobec klubu, minuty, oferta z innego klubu, końcówka kontraktu. [SZAC]
    const rating = ctx.avgRating ?? player.season?.rating ?? 6.7;
    const share = ctx.minutesShare ?? player.minutesShare ?? 0.6;
    lev = 0.25 * clamp((rating - 6.7) / 0.6, -1, 1.5)
      + 0.2 * clamp((rep - clubRep + 20) / 20, -1, 1.5)
      + 0.25 * clamp((share - 0.5) * 2, -1, 1)
      + (monthsLeft < 6 ? 0.2 : 0);
    if (rival) { levRival = 0.25 * clamp((rival.rep - clubRep) / 15 + 0.5, 0, 1.5); lev += levRival; }
    levOwn = clamp(lev - levRival, -0.5, 1.5); // bez oferty konkurencji
    lev = clamp(lev, -0.5, 1.5);
    const baseWage = Math.max(curWage, mWage * 0.9);
    publicDemand = roundTo(baseWage * (1.05 + 0.3 * Math.max(0, lev)), 100);
    target = baseWage * (1.05 + 0.3 * lev) * (1 - 0.012 * (t.loyalty - 10)) * (1 - 0.001 * (trust - 50));
  }

  // Wspólne mnożniki oczekiwań. [SZAC]
  target *= (1 + 0.015 * (t.greed - 10)) * prefs.wageMul * (1 + 0.06 * broken) * (1 + 0.002 * grudge);
  target *= 1 + rng.gauss(0, 0.04); // szum: ta sama oferta nie działa tak samo na dwóch podobnych zawodników
  let targetOwn = kind === 'renew' && rival ? target * (1.05 + 0.3 * levOwn) / (1.05 + 0.3 * lev) : target; // bez oferty konkurencji
  if (kind === 'renew' || fromClub) {
    // Przy przedłużeniu i transferze rzadko kto schodzi z pensji; starsi godzą się na obniżkę. Wolny zawodnik bez progu. [SZAC]
    const floor = age >= 32 || mindset.key === 'spokojnaKoncowka' ? 0.8 : kind === 'renew' ? 0.97 : 0.95;
    target = Math.max(target, curWage * floor);
    targetOwn = Math.max(targetOwn, curWage * floor);
  }
  let minF = 0.84 + 0.008 * (t.greed - 10)
    + (willScore < 0.45 ? 0.05 : willScore >= 0.7 ? -0.03 : 0)
    + (kind === 'renew' ? -0.008 * (t.loyalty - 10) : 0)
    + (rival ? 0.04 : 0) + rng.gauss(0, 0.02);
  minF = clamp(minF, 0.72, 0.97);
  let min = target * minF;
  // Minimum z własnego żądania zawodnika, bez ofert konkurencji: podstawa widełek dyrektora sportowego (director.js)
  const minOwn = targetOwn * clamp(minF - (rival ? 0.04 : 0), 0.72, 0.97);
  if (rival) {
    const attract = clamp(1 + (rival.rep - clubRep) / 80, 0.75, 1.3); // lepszy klub konkurencji podnosi minimum [SZAC]
    min = Math.max(min, rival.wage * attract * 0.97);
    target = Math.max(target, min * 1.05);
  }
  // Decyzja zawodnika przy transferze (ctx.mind z bramki playerMind.js): werdykt podnosi żądania, termin przejścia je zmienia
  const mind = kind === 'sign' && ctx.mind ? ctx.mind : null;
  const mv = mind ? MIND.verdict[mind.verdict] ?? MIND.verdict.open : null;
  if (mv) {
    const f = mv.ask * (1 - MIND.timingW * clamp(mind.timing ?? 0, -0.3, 0.4));
    target *= f; min *= f;
  }
  const anchor = target * ag.anchor * (1 + 0.005 * (t.ego - 10));
  let maxRounds = ai ? 2 : clamp(Math.round(2 + 0.22 * t.patience * ag.patienceMul + rng.gauss(0, 0.5)
    - 0.7 * broken - (rival ? 1 : 0) - grudge / 40), 2, 8);
  let mood = clamp(55 + (willScore - 0.5) * 40 + (trust - 50) * 0.4 - grudge * 0.4 - broken * 8
    + (agent === 'rodzinny' ? 3 : 0) + rng.gauss(0, 4), 15, 90);
  if (mv) {
    maxRounds = mindRounds(t, agent, mind.verdict, rng, ai);
    mood = clamp(mood + mv.mood, 15, 90);
  }

  const roleExp = ctx.expectedRole ?? expectedRole(player, club, t);
  const grp = GROUP[player.pos] || 'MID';
  const apps = 34 * ROLE_EXP_SHARE[roleExp];
  const R = RATES[grp];

  const d = {
    v: 1, kind, mode, date, proposal: !!ctx.proposal,
    playerId: player.id, name, age, persona: player.persona || null,
    clubId: club.id, clubName: club.name || 'klub',
    traits: { ...t }, agentType: agent, mindset: mindset.key, mindsetLabel: mindset.label, prefs,
    roleExp, exp: { apps, goals: apps * R.g, assists: apps * R.a, cleanSheets: apps * R.cs },
    pRel: ctx.relegationRisk ?? 0.15, value: estimateValue(player),
    windowEnd: ctx.windowEnd || null, seasonEnd: ctx.seasonEnd || seasonEndOf(date),
    rival, publicDemand: Math.round(publicDemand),
    hidden: { target: Math.round(target), min: Math.round(min), minOwn: Math.round(minOwn), anchor: Math.round(anchor), maxRounds },
    ...(mv ? { mind: { verdict: mind.verdict, timing: mind.timing ?? 0, wow: mv.wow, r: null, extra: false } } : {}),
    st: {
      status: 'open', round: 0, mood: Math.round(mood * 10) / 10, ask: Math.round(anchor), offended: 0,
      prevWeq: null, lastCounter: null, ultimatum: null, claim: null, concBoost: 0,
    },
    log: [],
    contract: null,
    result: null,
    opening: null,
  };
  const s = new NegotiationSession(d, rng, txt);
  if (!ai) {
    d.opening = s._say('opening', {});
    if (rival) d.opening.text += ` ${s._say('rivalPressure', {}).text}`;
  }
  return { ok: true, session: s, opening: d.opening };
}

// ---------------------------------------------------------------- Sesja
export class NegotiationSession {
  constructor(d, rng, txt) {
    this.d = d;
    this.rng = rng;
    this.txt = txt;
  }

  get status() { return this.d.st.status; }
  get round() { return this.d.st.round; }
  get mood() { return this.d.st.mood; }
  get contract() { return this.d.contract; }
  /** Ukryte wartości (do testów i debugowania; UI ich nie pokazuje). */
  get hidden() { return { ...this.d.hidden, ask: this.d.st.ask }; }

  /** To, co gracz może wiedzieć: nastrój, cierpliwość, mindset (po skautingu), orientacyjne żądanie rynku. */
  view() {
    const d = this.d;
    const left = d.hidden.maxRounds - d.st.round;
    return {
      kind: d.kind, round: d.st.round, status: d.st.status, mood: moodLabel(d.st.mood),
      patience: left <= 1 ? 'Cierpliwość na wyczerpaniu' : left <= 2 ? 'Cierpliwość się kończy' : 'Cierpliwy',
      mindset: d.mindsetLabel, agent: AGENT_TYPES[d.agentType].label, expectedRole: d.roleExp,
      marketDemand: formatZl(d.publicDemand), ultimatum: !!d.st.ultimatum,
      canCallBluff: !!(d.st.claim && !d.st.claim.checked && d.st.status === 'open'),
    };
  }

  _say(key, vars) {
    const d = this.d;
    return speakLine(key, { agentType: d.agentType, moodTag: moodTag(d.st.mood), traits: d.traits, age: d.age, name: d.name }, this.txt, {
      imie: d.name.split(' ')[0], zawodnik: d.name, klub: d.clubName, rywal: d.rival?.name || 'inny klub', ...vars,
    });
  }

  /** Runda: gracz (albo klub AI) składa ofertę. Zwraca odpowiedź zawodnika. */
  propose(offerIn) {
    const d = this.d;
    const st = d.st;
    if (st.status !== 'open') throw new Error('Negocjacje są zamknięte');
    const o = normalizeOffer(offerIn);
    const t = d.traits;
    const H = d.hidden;
    const ai = d.mode === 'ai';
    st.round++;
    const v = valueOffer(o, d);
    const events = [];
    let dm = 0;

    // 1. Niska oferta (pieniądze i rola) obraża: próg i siła zależą od ego, temperamentu i osobowości. [SZAC]
    const ratio = v.cash / H.target;
    const insultLine = 0.74 + 0.006 * (t.ego - 10) + 0.004 * (t.temper - 10);
    let offense = 0;
    if (ratio < insultLine) {
      const touchy = (PERSONA_TOUCHY[d.persona] ?? 1) * (0.8 + 0.06 * (t.ego - 10) + 0.03 * (t.temper - 10));
      offense = (insultLine - ratio) * Math.max(0.3, touchy);
      dm -= offense * 120;
      st.offended += offense;
      events.push('insult');
    }
    // 2. Tempo ustępstw: cofanie się i drobne kroki irytują, wyraźne ustępstwa poprawiają nastrój. [SZAC]
    if (st.prevWeq != null) {
      const step = (v.weq - st.prevWeq) / H.target;
      if (step < -0.005) { dm -= 8 + 0.4 * (t.temper - 10); events.push('regress'); }
      else if (step < 0.012) {
        if (!offense) events.push('irritated');
        dm -= Math.max(1, 3 + 0.4 * (10 - t.patience) + 0.3 * (t.temper - 10));
      } else if (step >= 0.03) { dm += Math.min(8, step * 120) * (1 + 0.02 * (10 - t.ego)); events.push('pleased'); }
    }
    // 3. Oferta konkurencji: presja czasu co rundę.
    if (d.rival) dm -= 1.5;
    st.mood = Math.round(clamp(st.mood + dm, 0, 100) * 10) / 10;
    st.prevWeq = v.weq;
    const entry = { round: st.round, offer: o, weq: Math.round(v.weq), mood: st.mood, events };

    // Decyzja
    const meetsCounter = st.lastCounter && v.weq >= st.lastCounter.weq - 0.5; // zawodnik dotrzymuje własnej kontroferty
    if (d.mind) d.mind.r = entry.r = Math.round((v.weq / this._mindTarget()) * 1000) / 1000;
    if (st.ultimatum) return v.weq >= st.ultimatum.weq - 0.5 || meetsCounter ? this._accept(o, entry) : this._break('ultimatum', entry);
    if (d.mind) return this._mindDecide(o, v, entry, offense, meetsCounter);
    if (v.weq >= st.ask - 0.5 || meetsCounter) return this._accept(o, entry);
    if (ai && st.round >= 2) return this._break('ai', entry);
    if (st.mood <= 8) return this._break('mood', entry);
    if (offense >= 0.3 && t.ego >= 15) return this._break('insult', entry);

    // Blef albo prawdziwa oferta z innego klubu (raz na negocjacje). Agent wtedy nie ustępuje w tej rundzie.
    let claimNow = false;
    if (!ai && !st.claim) {
      const ag = AGENT_TYPES[d.agentType];
      if (d.rival && this.rng.chance(0.6)) { st.claim = { real: true, round: st.round, checked: false }; claimNow = true; }
      else if (!d.rival && this.rng.chance(ag.bluff * (0.6 + 0.04 * (t.greed - 10)))) {
        st.claim = { real: false, round: st.round, checked: false };
        claimNow = true;
      }
    }
    if (!claimNow) this._concede();

    const last = st.round >= H.maxRounds;
    const close = v.weq >= H.min * 0.85;
    if (!ai && (last || st.mood < 22)) {
      if (close) return this._ultimatum(o, entry);
      if (last) return this._break('patience', entry);
    }
    const dem = ai ? null : this._findDemand(o, v);
    if (dem) return this._demand(dem, entry, claimNow);
    return this._counter(o, entry, claimNow);
  }

  /**
   * Reakcja na ofertę przy transferze (MIND): r = wartość oferty / cel. r >= 1,20 (niechętny 1,30): zgoda od razu;
   * 1,00-1,20: zgoda, w 30 % prośba o drobny dodatek; 0,92-1,00: kontroferta podbija o (1 - r) x cel x U(0,5; 1);
   * 0,85-0,92: twardo albo mała kontroferta; poniżej 0,85: odmowa tej oferty; obraza jak zawsze. Ostatnia runda:
   * ultimatum (blisko) albo zerwanie. Klub AI: bez ultimatum, do 4 rund.
   */
  _mindDecide(o, v, entry, offense, meetsCounter) {
    const d = this.d;
    const st = d.st;
    const H = d.hidden;
    const t = d.traits;
    const M = MIND;
    const ai = d.mode === 'ai';
    const T = this._mindTarget();
    const r = v.weq / T;
    if (meetsCounter || r >= d.mind.wow) return this._accept(o, entry);
    if (r >= 1) {
      if (!d.mind.extra && this.rng.chance(M.extraP)) {
        d.mind.extra = true;
        return this._mindCounter(o, v, T * M.extra, entry, 'mind_extra', false);
      }
      return this._accept(o, entry);
    }
    if (st.mood <= 8) return this._break('mood', entry);
    if (offense >= 0.3 && t.ego >= 15) return this._break('insult', entry);
    let claimNow = false;
    if (!ai && !st.claim) {
      const ag = AGENT_TYPES[d.agentType];
      if (d.rival && this.rng.chance(0.6)) { st.claim = { real: true, round: st.round, checked: false }; claimNow = true; }
      else if (!d.rival && this.rng.chance(ag.bluff * (0.6 + 0.04 * (t.greed - 10)))) { st.claim = { real: false, round: st.round, checked: false }; claimNow = true; }
    }
    const last = st.round >= H.maxRounds;
    if (last || (!ai && st.mood < 22)) {
      if (!ai && r >= M.firmR) return this._ultimatum(o, entry);
      if (last) return this._break('patience', entry);
    }
    if (r >= M.counterR) return this._mindCounter(o, v, (1 - r) * T * this._u(M.gap), entry, null, claimNow);
    if (r >= M.firmR) {
      const firm = clamp(M.firm[0] + M.firm[1] * (t.ego - 10) + M.firm[2] * (t.patience - 10), 0.05, 0.9);
      if (this.rng.chance(firm)) return this._mindCounter(o, v, (1 - r) * T, entry, 'mind_firm', claimNow);
      return this._mindCounter(o, v, (1 - r) * T * this._u(M.small), entry, null, claimNow);
    }
    st.mood = Math.round(clamp(st.mood - M.lowMood, 0, 100) * 10) / 10;
    entry.mood = st.mood;
    return this._respond('reject', entry, {}, 'mind_low', {}, claimNow);
  }

  _u([a, b]) { return a + (b - a) * this.rng.next(); }

  /**
   * Cel w tej rundzie: zawodnik mięknie z rundami (tempo ustępstw agenta), w ostatniej rundzie
   * cel - 0,9 x (cel - minimum) x ustępliwość agenta (jak dawne ustępstwa żądania); blef zdemaskowany: cel -3 %.
   */
  _mindTarget() {
    const d = this.d;
    const H = d.hidden;
    const k = clamp((d.st.round - 1) / Math.max(1, H.maxRounds - 1), 0, 1);
    const ag = AGENT_TYPES[d.agentType] || AGENT_TYPES.rozsadny;
    return Math.max(H.min, H.target - (H.target - H.min) * MIND.soften * ag.concession * k);
  }

  /** Element, który zawodnik podbija (preferencje i cechy, szum 30 %). */
  _prefElement(o) {
    const d = this.d;
    const pr = d.prefs;
    const t = d.traits;
    const w = {
      wage: pr.moneyW * (1 + 0.03 * (t.greed - 10)),
      signOn: pr.signOnPref * (d.age >= 29 ? 1.2 : 0.8),
      role: roleRank(o.role, d.age) < roleRank(d.roleExp, d.age) ? pr.roleW : 0,
      years: Math.abs(o.years - pr.idealYears) >= 1 ? pr.lenW * 0.8 : 0,
      clause: clausePenalty(o.clause, d) > 0 ? pr.clauseW * 0.6 : 0,
      bonus: d.exp.apps >= 8 ? pr.bonusPref * 0.6 : 0,
    };
    let best = 'wage'; let bw = -1;
    for (const [k, x] of Object.entries(w)) {
      const sc = x * (1 + 0.3 * this.rng.next());
      if (x > 0 && sc > bw) { best = k; bw = sc; }
    }
    return best;
  }

  /** Kontroferta o delta (ekwiwalent pensji) na ulubionym elemencie, reszta różnicy w pensji. */
  _mindCounter(o, v, delta, entry, key, claimNow) {
    const d = this.d;
    const pr = d.prefs;
    const el = this._prefElement(o);
    const add = Math.max(50, delta);
    const want = v.weq + add;
    let c = { ...o, bonus: { ...o.bonus } };
    if (el === 'signOn') c.signOn += ceilTo((add * c.years * 52) / pr.signOnPref, 1000);
    else if (el === 'bonus') c.bonus.app += ceilTo((add * 52) / (pr.bonusPref * Math.max(1, d.exp.apps)), 50);
    else if (el === 'role') c = withFix(c, ['role', d.roleExp]);
    else if (el === 'years') c = withFix(c, ['years', pr.idealYears]);
    else if (el === 'clause') c = withFix(c, ['clause', desiredClause(d)]);
    let w = valueOffer(c, d);
    if (w.weq > want + 0.5 && ['role', 'years', 'clause'].includes(el)) { c = { ...o, bonus: { ...o.bonus } }; w = valueOffer(c, d); } // poprawka warta więcej niż różnica: podbija pensję
    if (want - w.weq > 0.5) { c.wage = ceilTo(c.wage + (want - w.weq) / w.a, 100); w = valueOffer(c, d); }
    d.st.lastCounter = { offer: c, weq: w.weq };
    const extra = { counter: c, ...(el !== 'wage' ? { demand: { element: el, value: el === 'bonus' ? c.bonus.app : c[el] ?? null } } : {}) };
    return this._respond('counter', entry, extra, key ?? `mind_${el}`, offerVars(c), claimNow);
  }

  /** Sprawdzenie, czy agent blefuje. Kosztuje nastrój; zdemaskowany blef obniża żądania. Nie zużywa rundy. */
  callBluff() {
    const d = this.d;
    const st = d.st;
    if (st.status !== 'open' || !st.claim || st.claim.checked) return { ok: false, text: 'Nie ma czego sprawdzać.' };
    st.claim.checked = true;
    const t = d.traits;
    let cost = 5 + Math.max(0, t.ego - 10) * 0.5 + (d.agentType === 'rekin' ? 2 : 0); // [SZAC]
    let line;
    if (st.claim.real) {
      cost += 4;
      line = this._say('bluffTrue', {});
    } else {
      const span = d.hidden.anchor - d.hidden.min;
      st.ask = Math.round(Math.max(d.hidden.min, st.ask - 0.25 * span));
      st.concBoost += 0.3;
      if (d.mind) d.hidden.target = Math.round(d.hidden.target * MIND.bluffCut); // rozmowy o transferze: niższy cel
      line = this._say('bluffExposed', {});
    }
    st.mood = Math.round(clamp(st.mood - cost, 0, 100) * 10) / 10;
    d.log.push({ round: st.round, action: 'callBluff', truth: st.claim.real, mood: st.mood });
    return { ok: true, truth: st.claim.real, moodCost: Math.round(cost * 10) / 10, mood: moodLabel(st.mood), ...line };
  }

  /** Skutki zakończonych rozmów (null, dopóki trwają). Zastosuj przez applyOutcome(player, outcome). */
  outcome() {
    return this.d.result;
  }

  _concede() {
    const d = this.d;
    const st = d.st;
    const H = d.hidden;
    const ag = AGENT_TYPES[d.agentType];
    const moodF = clamp(0.4 + st.mood / 80, 0.5, 1.3); // zły humor spowalnia ustępstwa
    const rate = d.mode === 'ai' ? 0.7 : (ag.concession + st.concBoost) / Math.max(1, H.maxRounds - 1);
    st.ask = Math.round(Math.max(H.min, st.ask - (H.anchor - H.min) * rate * moodF));
  }

  _findDemand(o, v) {
    const d = this.d;
    const ask = d.st.ask;
    let best = null;
    for (const f of wantedFixes(o, d)) {
      const offer = withFix(o, f);
      const w = valueOffer(offer, d).weq;
      if (w >= ask && (!best || w > best.weq)) best = { element: f[0], value: f[1], offer, weq: w };
    }
    if (best) return best;
    if (v.weq >= ask * 0.95 && d.prefs.signOnPref >= 1.0) {
      const add = ceilTo(((ask - v.weq) * o.years * 52) / d.prefs.signOnPref, 1000);
      const offer = { ...o, bonus: { ...o.bonus }, signOn: o.signOn + add };
      return { element: 'signOn', value: offer.signOn, offer, weq: valueOffer(offer, d).weq };
    }
    return null;
  }

  _reactionLines(entry) {
    if (this.d.mode === 'ai') return [];
    const key = ['insult', 'regress', 'irritated', 'pleased'].find((k) => entry.events.includes(k));
    return key ? [this._say(key, {})] : [];
  }

  _respond(type, entry, extra = {}, mainKey = null, vars = {}, claimNow = false) {
    const d = this.d;
    entry.response = type;
    if (extra.counter) entry.counter = extra.counter;
    d.log.push(entry);
    let lines = [];
    if (d.mode !== 'ai') {
      lines = this._reactionLines(entry);
      if (mainKey) lines.push(this._say(mainKey, vars));
      if (claimNow) lines.push(this._say('claim', {}));
    }
    const left = d.hidden.maxRounds - d.st.round;
    return {
      type, round: d.st.round, mood: moodLabel(d.st.mood), events: entry.events,
      patience: left <= 1 ? 'Cierpliwość na wyczerpaniu' : left <= 2 ? 'Cierpliwość się kończy' : 'Cierpliwy',
      claim: claimNow, lines, speaker: lines[lines.length - 1]?.speaker ?? '', text: lines.map((l) => l.text).join(' '),
      ...extra,
    };
  }

  _counter(o, entry, claimNow) {
    const c = buildCounter(o, this.d, this.d.st.ask);
    this.d.st.lastCounter = c;
    const key = c.offer.signOn > o.signOn ? 'counterSignOn' : 'counter'; // kwestie z premią tylko, gdy jej żąda
    return this._respond('counter', entry, { counter: c.offer }, key, offerVars(c.offer), claimNow);
  }

  _demand(dem, entry, claimNow) {
    this.d.st.lastCounter = { offer: dem.offer, weq: dem.weq };
    const key = `demand_${dem.element}`;
    return this._respond('demand', entry, { demand: { element: dem.element, value: dem.value }, counter: dem.offer }, key, offerVars(dem.offer), claimNow);
  }

  _ultimatum(o, entry) {
    const d = this.d;
    // Rozmowy o transferze (MIND): ultimatum na poziomie celu tej rundy (zawodnik mięknie z rundami)
    const c = buildCounter(o, d, d.mind ? this._mindTarget() : Math.max(d.st.ask, d.hidden.min));
    d.st.ultimatum = c;
    d.st.lastCounter = c;
    return this._respond('ultimatum', entry, { ultimatum: c.offer, counter: c.offer }, 'ultimatum', offerVars(c.offer));
  }

  _accept(o, entry) {
    const d = this.d;
    d.st.status = 'accepted';
    d.contract = buildContract(o, d.date);
    this._finish(true, 'accepted');
    return this._respond('accept', entry, { contract: d.contract }, d.proposal ? 'accept_prop' : 'accept', offerVars(o)); // propozycja: zawodnik dopiero się namyśla
  }

  _break(reason, entry) {
    const d = this.d;
    d.st.status = 'failed';
    this._finish(false, reason);
    const r = d.result;
    const extra = { reason, lock: r.lock, transferRequest: r.transferRequest };
    const res = this._respond('breakoff', entry, extra, 'breakoff');
    if (r.transferRequest && d.mode !== 'ai') {
      const l = this._say('transferRequest', {});
      res.lines.push(l);
      res.text += ` ${l.text}`;
    }
    if (r.lock && d.mode !== 'ai') res.text += d.mind ? ` Zawodnik nie chce teraz rozmawiać, wróć za ${lockWords(d.date, r.lock.until)}.` : ` Zawodnik nie chce rozmawiać do ${formatDate(r.lock.until)}.`;
    return res;
  }

  _finish(accepted, reason) {
    const d = this.d;
    const st = d.st;
    const t = d.traits;
    const res = {
      kind: d.kind, mode: d.mode, playerId: d.playerId, clubId: d.clubId, date: d.date, accepted, refused: false, reason,
      rounds: st.round, contract: d.contract, lock: null, grudgeAdd: 0, trustDelta: 0, moraleDelta: 0,
      renewRefused: false, transferRequest: false,
    };
    if (accepted) {
      res.trustDelta = d.kind === 'renew' ? 5 : 0;
      res.moraleDelta = d.kind === 'renew' ? 3 : 2;
      res.grudgeAdd = Math.round(clamp(st.offended * 30, 0, 20)); // obraza zostaje w pamięci nawet po podpisie
    } else {
      // Blokada 2-12 tygodni z obrażenia, nastroju i cech; skrajne obrażenie do końca okna albo sezonu. [SZAC]
      const off = st.offended + Math.max(0, 30 - st.mood) / 100;
      const x = clamp(off * 1.4 + 0.025 * (t.ego - 10) + 0.02 * (t.temper - 10) - 0.02 * (t.patience - 10)
        + (st.mood < 10 ? 0.15 : 0), 0, 1);
      const weeks = Math.round(2 + 10 * x);
      let until = addDays(d.date, weeks * 7);
      const extreme = off >= 0.5 || (st.mood <= 3 && t.ego >= 15);
      if (extreme) {
        const end = d.kind === 'sign' ? (d.windowEnd || d.seasonEnd) : d.seasonEnd;
        if (end > until) until = end;
      }
      res.lock = { until, weeks, extreme };
      if (d.mind) { const m = mindLockSpan(d, reason, this.rng); res.lock = { until: m.until, weeks: Math.round(m.days / 7), extreme: false, months: m.months, days: m.days, mind: true }; }
      res.grudgeAdd = Math.round(15 + off * 60);
      if (d.kind === 'renew') {
        res.moraleDelta = -3 - (off > 0.2 ? 1 : 0);
        res.trustDelta = -Math.round(8 + off * 30);
        const p = clamp(0.1 + off * 0.8 + 0.03 * (t.ambition - 10) - 0.03 * (t.loyalty - 10) + (st.mood < 15 ? 0.15 : 0), 0, 0.9);
        if (this.rng.chance(p)) { res.transferRequest = true; res.renewRefused = true; }
      } else {
        res.trustDelta = -Math.round(5 + off * 20);
      }
    }
    d.result = res;
  }

  toJSON() {
    return { ...JSON.parse(JSON.stringify(this.d)), rng: rngState(this.rng), txt: rngState(this.txt) };
  }

  static fromJSON(j) {
    const { rng, txt, ...d } = typeof j === 'string' ? JSON.parse(j) : j;
    return new NegotiationSession(JSON.parse(JSON.stringify(d)), rngFrom(rng), rngFrom(txt));
  }
}

// ---------------------------------------------------------------- Zastosowanie skutków
/**
 * Zapisuje skutki w zawodniku (mutuje): relacja z klubem (zaufanie, uraza z wygaszaniem, blokada, historia),
 * morale, renewRefused (czytane przez squad.js), transferRequest + unhappy, nowy kontrakt (tylko przedłużenie).
 * opts.seed: ziarno gry do rzutu uspokojenia po podwyżce przy prośbie o transfer (src/career/wishMemory.js).
 */
export function applyOutcome(player, out, opts = {}) {
  if (!out) return player;
  const rel = relationWith(player, out.clubId);
  rel.grudge = Math.round((currentGrudge(rel, out.date) + (out.grudgeAdd || 0)) * 10) / 10;
  rel.grudgeDate = out.date;
  rel.trust = clamp(rel.trust + (out.trustDelta || 0), 0, 100);
  if (out.lock) { rel.lockUntil = out.lock.until; rel.lockReason = out.reason; }
  const result = out.accepted ? 'podpisany' : out.refused ? 'odmowa' : 'fiasko';
  rel.history = [...rel.history, { date: out.date, kind: out.kind, result, rounds: out.rounds }].slice(-8);
  player.relations = { ...(player.relations || {}), [out.clubId]: rel };
  if (out.moraleDelta) player.morale = clamp((player.morale ?? 12) + out.moraleDelta, 1, 20);
  if (out.renewRefused) player.renewRefused = true;
  if (out.transferRequest) { player.transferRequest = true; player.unhappy = true; }
  // Nowy kontrakt od razu tylko przy przedłużeniu. Przy podpisaniu zawodnik zostaje na starym kontrakcie do zgłoszenia
  // (kontrakt przenosi moduł transferów; wcześniej rozmowy nadpisywały go już przy porozumieniu)
  if (out.accepted && out.contract && out.kind === 'renew') {
    const oldWage = player.contract?.wage ?? 0;
    player.contract = { ...out.contract, bonus: { ...out.contract.bonus }, promise: { ...out.contract.promise } };
    player.renewRefused = false;
    // Nowy kontrakt: czas spokoju; przy prośbie o transfer podwyżka uspokaja tylko z pewną szansą (wishMemory.js)
    noteRenewal(player, out.date ?? out.contract.signed, { oldWage, newWage: out.contract.wage ?? 0, seed: opts.seed ?? '' });
  }
  return player;
}

// ---------------------------------------------------------------- Obietnice
/**
 * Comiesięczne rozliczenie obietnicy roli (czysta funkcja).
 * minutesShare: udział minut w meczach, w których zawodnik był dostępny (0-1).
 * 3 słabe miesiące (poniżej 75 % progu roli) = obietnica złamana. [SZAC]
 */
export function evaluatePromise(promise, minutesShare, monthsSince, tol = 0.75) {
  const none = { promise, event: null, trustDelta: 0, moraleDelta: 0 };
  if (!promise || promise.broken || monthsSince <= PROMISE_GRACE_MONTHS) return none;
  const p = { ...promise };
  const req = ROLE_MIN_SHARE[p.role] ?? 0;
  let event = null;
  let trustDelta = 0;
  let moraleDelta = 0;
  if (minutesShare >= req) {
    p.strikes = Math.max(0, p.strikes - 1);
    p.kept++;
    trustDelta = 1;
    if (p.kept % 6 === 0) event = 'promiseKept';
  } else if (minutesShare < req * tol) {
    p.strikes++;
    event = 'promiseWarning';
    moraleDelta = -0.5;
    if (p.strikes >= 3) {
      p.broken = true;
      event = 'promiseBroken';
      trustDelta = -20;
      moraleDelta = -3;
    }
  }
  return { promise: p, event, trustDelta, moraleDelta };
}

/**
 * Próg cierpliwości przy obietnicy roli (Nov 25, 2026): zawodnik przypomina o obietnicy, gdy udział minut spada poniżej
 * wymaganego x tol. tol = 0,75 + 0,02 (ambicja - 10) + 0,02 (temperament - 10) - 0,025 (cierpliwość - 10)
 * - 0,015 (profesjonalizm - 10) + los N(0; 0,04) w miesiącu, w granicach 0,6-0,9 [SZAC]: cierpliwy narzeka dopiero przy ok.
 * 2/3 wymaganego udziału, ambitny albo porywczy już przy ok. 85 %.
 */
export const PROMISE_TOL = { base: 0.75, ambition: 0.02, temper: 0.02, patience: -0.025, professionalism: -0.015, noise: 0.04, min: 0.6, max: 0.9 };
export function promiseTolerance(player, dateIso) {
  const t = personalityOf(player).traits;
  const T = PROMISE_TOL;
  const x = T.base + T.ambition * ((t.ambition ?? 10) - 10) + T.temper * ((t.temper ?? 10) - 10) + T.patience * ((t.patience ?? 10) - 10)
    + T.professionalism * ((t.professionalism ?? 10) - 10) + new Rng(`obietnica-prog:${player.id}:${String(dateIso).slice(0, 7)}`).gauss(0, T.noise);
  return clamp(x, T.min, T.max);
}

/** Wersja z zapisem w zawodniku (mutuje kontrakt, relację i morale). Zwraca zdarzenie do wiadomości albo null. */
export function applyPromiseCheck(player, clubId, dateIso, minutesShare) {
  const c = player.contract;
  if (!c?.promise) return null;
  const r = evaluatePromise(c.promise, minutesShare, monthsBetween(c.promise.since, dateIso), promiseTolerance(player, dateIso));
  player.contract = { ...c, promise: r.event === 'promiseBroken' ? { ...r.promise, brokenAt: dateIso } : r.promise }; // brokenAt: forma kapitana (docs/kapitan.md)
  if (r.trustDelta || r.event === 'promiseBroken') {
    const rel = relationWith(player, clubId);
    rel.trust = clamp(rel.trust + r.trustDelta, 0, 100);
    if (r.event === 'promiseBroken') rel.brokenPromises++;
    player.relations = { ...(player.relations || {}), [clubId]: rel };
  }
  if (r.moraleDelta) player.morale = clamp((player.morale ?? 12) + r.moraleDelta, 1, 20);
  if (!r.event) return null;
  const { traits, agent } = personalityOf(player);
  if (r.event === 'promiseBroken' && (traits.ambition >= 14 || traits.playTime >= 14)) player.unhappy = true;
  const name = player.name || `Zawodnik ${player.id}`;
  const L = speakLine(r.event, { agentType: agent, moodTag: 'low', traits, age: player.age, name },
    new Rng(`obietnica:${player.id}:${dateIso}`), { imie: name.split(' ')[0], rola: ROLE_LABELS[r.promise.role] });
  return { type: r.event, ...L, trustDelta: r.trustDelta, moraleDelta: r.moraleDelta };
}

// ---------------------------------------------------------------- AI
/**
 * Klub AI negocjuje tą samą logiką w trybie uproszczonym: oferta rynkowa, ewentualnie przyjęcie kontroferty
 * mieszczącej się w budżecie. Zawsze najwyżej 2 rundy.
 * budget: { wage (maks. pensja tygodniowa), signOn, maxYears, total (maks. koszt całego kontraktu: progi zarządu) }.
 * neg: atrybut Negocjacje klubu AI 1-20 (clubNegotiation.js): pierwsza oferta (0,94 + 0,05q) x orientacyjne żądanie,
 * podwyżka w drugiej rundzie x (1,06 + 0,08q); bez atrybutu (null) dawne 0,97 i 1,10. Budżet zawsze twardym limitem.
 * Zwraca { result: 'signed'|'failed'|'refused', rounds, contract, outcome, demand (orientacyjne żądanie), reason? }.
 */
export function aiNegotiate({ kind = 'sign', player, club, fromClub = null, date, rng, ctx = {}, budget = {}, neg = null, feeMul = 1, mind = null }) {
  if (mind && kind === 'sign') ctx = { ...ctx, mind }; // decyzja zawodnika: werdykt bramki, do 4 rund (playerMind.js)
  const r = openNegotiation({ kind, player, club, fromClub, date, rng, ctx, mode: 'ai' });
  if (!r.ok) return { result: 'refused', rounds: 0, reason: r.reason, contract: null, outcome: r.outcome ?? null };
  const s = r.session;
  const d = s.d;
  const maxWage = budget.wage ?? Infinity;
  // feeMul: Zarządzanie kadrą i płacami dyrektora (director.js kadFeeMul): premia za podpis i prowizja agenta
  const maxSignOn = (budget.signOn ?? (Number.isFinite(maxWage) ? maxWage * 10 : Infinity)) * feeMul;
  const age = player.age ?? 25;
  // neg: ukryty atrybut Negocjacje klubu AI (clubNegotiation.js); null = dawne stałe 0,97 i +10 %
  const lv = negLevers(neg);
  const wage = Math.min(maxWage, roundTo(d.publicDemand * lv.open, 100));
  const goalBonus = { ATT: 0.1, MID: 0.06, DEF: 0.04, GK: 0 }[GROUP[player.pos] || 'MID'];
  // Progi zarządu (src/career/boardRequests.js): długość z wieku i koszt całego kontraktu
  const fit = (o) => {
    if (!budget.maxYears && !budget.total) return o;
    const x = { ...o, years: Math.max(1, Math.min(o.years, budget.maxYears ?? MAX_YEARS)) };
    // limit zarządu na roczny koszt kontraktu (pensja i rozłożone premie, boardRequests.js contractAnnual)
    if (budget.total && x.wage * 52 + ((x.signOn || 0) + (x.agentFee || 0)) / Math.max(1, x.years) > budget.total) x.wage = Math.max(0, Math.floor((budget.total - ((x.signOn || 0) + (x.agentFee || 0)) / Math.max(1, x.years)) / 52 / 100) * 100);
    return x;
  };
  const offer = fit({
    wage,
    years: age <= 23 ? 4 : age <= 29 ? 3 : age <= 32 ? 2 : 1,
    role: d.roleExp,
    bonus: { goal: roundTo(wage * goalBonus, 100), app: roundTo(wage * 0.02, 50) },
    agentFee: roundTo(0.07 * wage * 52 * feeMul, 1000), // rynkowy standard prowizji (x Zarządzanie kadrą dyrektora)
  });
  let resp = s.propose(offer);
  if (d.mind) {
    // Prosta pętla do 4 rund: kontroferta w budżecie, podwyżka z atrybutu Negocjacje albo granica budżetu
    let o = offer;
    while (s.status === 'open') {
      const c = resp.counter;
      if (c && c.wage <= maxWage && c.signOn <= maxSignOn) o = fit(c);
      else {
        // Kontroferta ponad budżet: klub idzie do granicy budżetu; bez kontroferty podwyżka z atrybutu Negocjacje
        const w = Math.min(maxWage, c ? Math.floor(maxWage / 100) * 100 : roundTo(o.wage * lv.raise, 100));
        if (w > o.wage) o = fit({ ...o, wage: w }); // na granicy budżetu: ta sama oferta, zawodnik mięknie z rundami
      }
      resp = s.propose(o);
    }
  } else if (resp.type !== 'accept' && s.status === 'open') {
    const c = resp.counter;
    if (c && c.wage <= maxWage && c.signOn <= maxSignOn) resp = s.propose(fit(c));
    else s.propose(fit({ ...offer, wage: Math.min(maxWage, roundTo(offer.wage * lv.raise, 100)) })); // progi zarządu zawsze twardym limitem
  }
  return { result: s.status === 'accepted' ? 'signed' : 'failed', rounds: d.st.round, contract: s.contract, outcome: s.outcome(), demand: d.publicDemand };
}
