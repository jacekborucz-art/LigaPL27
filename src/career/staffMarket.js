// Sztab szkoleniowy: zatrudnianie i zwalnianie (docs/sztab.md, decyzje właściciela z Nov 16, 2026).
// Osoby sztabu są w game.staff (zatrudnieni i wolni), a game.training.staff[clubId] zostaje widokiem pochodnym
// (jedna pozycja na rolę: imię lidera, jakość efektywna q z pomocnikami i adaptacją), więc ponad 30 miejsc
// w kodzie, które czytają staffOf / staffQ, działa bez zmian.
// Zasady (te same dla gracza i klubów AI):
// - limit osób w sztabie z ligi, reputacji i przychodów klubu, limit osób w roli z ligi, kierownik zawsze jeden;
// - pensje osób co miesiąc (część dawnego ryczałtu „Koszty klubu” wyjęta jako staffBase, przy migracji neutralnie);
// - oferty wiążące, pierwsza oferta ustala dzień decyzji (2-3 dni), osoba wybiera najkorzystniejszą ofertę z losem,
//   po decyzji nie przyjmuje już ofert; pozycja w ofercie (lider albo pomocnik) to wiążąca obietnica;
// - podbieranie z innych klubów: obecny klub zgadza się (rekompensata 3 pensje) albo blokuje; przy blokadzie osoba
//   może zerwać umowę (motywacja i los), a klub, który podbiera, płaci karę 3 pensje plus 0-50 %; podbieranie rzadkie
//   (limity na sezon, na osobę i na klub gracza, tylko przy wyraźnym zysku i w okolicach okien);
// - obcokrajowcy przez 3 miesiące pracują słabiej (16 pracuje jak 14, wygasa liniowo);
// - lista wolnych ok. 100 osób, odświeżana 1 lipca i 1 stycznia (25 % wolnych od 60+ dni odchodzi).
// Kluby AI działają tanio: przegląd części klubów w poniedziałki, przedłużenia 1 czerwca. Wszystkie liczby [SZAC].

import { Rng, clamp, hashString } from '../core/rng.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { registerDecision } from '../core/decisions.js';
import { clubById, CLUBS_PL } from '../data/clubs_pl.js';
import { NATIONALITIES, randomName } from '../data/names.js';
import { payLevel } from '../data/finanse_klubow.js';
import { STAFF_ROLES, DIRECTOR_ROLE, DIRECTOR_NAME } from '../training/config.js';
import { generateStaffFor, staffLabel, roleAttrKeys, ensurePersonAttrs, attrsAround, qFromAttrs, ensureScoutReg } from '../training/staff.js';
import { NEG, negMean, negDraw } from './clubNegotiation.js'; // atrybut Negocjacje: losowanie dyrektorów (docs/dyrektor-sportowy.md)
import { ensureTraining, daysBetween } from '../training/state.js';
import { clubPlan, book } from './finance.js';
import { clubReputation } from './reputation.js';
import { ownerOf } from './owners.js';
import { coachOf } from './coaches.js';
import { fmtDate } from '../ui/dom.js';

export const STAFF_VERSION = 1;
export const STAFF_ROLE_IDS = Object.keys(STAFF_ROLES);
/** Kolejność ról w UI (od najważniejszych dla gracza). */
export const STAFF_ROLE_ORDER = ['asystent', 'fizyczny', 'bramkarze', 'mlodziez', 'analityk', 'fizjoterapeuta', 'skaut', 'kierownik'];

/** Liczby rynku sztabu [SZAC] (docs/sztab.md). */
export const STAFF_MARKET = {
  // Oczekiwana pensja (zł / mies.): 10 000 x R[rola] x 1,25^(q - 10) x (obcokrajowiec 1,2) x okres bez pracy
  wage: {
    base: 10000, growth: 1.25, foreign: 1.2, min: 800, idleFree: 60, idlePerMonth: 0.04, idleMin: 0.75,
    R: { asystent: 1, fizyczny: 0.7, bramkarze: 0.7, analityk: 0.55, mlodziez: 0.5, kierownik: 0.45, fizjoterapeuta: 0.6, skaut: 0.4, dyrektor: 0.9 },
  },
  // Wakat: obowiązki przejmuje trener i reszta sztabu (jakość roli)
  vacantQ: { asystent: 4, fizyczny: 3, bramkarze: 3, mlodziez: 3, analityk: 2, kierownik: 2, fizjoterapeuta: 3, skaut: 2, dyrektor: 5 },
  // Dyrektor sportowy (docs/dyrektor-sportowy.md): 1 osoba na klub, poza limitem osób, pensja w budżecie sztabu.
  // Oczekiwana pensja x mnożnik ligi klubu (Ekstraklasa q 10 ok. 9 tys. zł / mies., q 17 ok. 43 tys.), wakat: zarząd (5)
  director: {
    league: { 1: 1, 2: 0.72, 3: 0.5, 4: 0.38 },
    spread: 2.5, age: [38, 62], // migracja i nowe osoby: NEG z dawnego atrybutu klubu, pozostałe NEG + N(0; 2,5)
    pool: { size: 14, min: 12, max: 16, leave: 0.25, idleDays: 60, foreign: 0.05, tiers: [[0.15, 1], [0.2, 2], [0.25, 3], [0.4, 4]] },
    match: 1, // 1 lipca: kandydat z listy wolnych, gdy Negocjacje różnią się od losowania o najwyżej 1
  },
  // Pomocnicy w roli: q_ef = q1 + min(2, 0,10 (q2 - 6) + 0,05 (q3 - 6) + 0,025 (q4 - 6)); kierownik tylko q1
  help: [0.10, 0.05, 0.025], helpMax: 2, helpFrom: 6,
  // Najwięcej osób w roli według ligi (1 Ekstraklasa ... 4 III liga); skaut w III lidze niedostępny
  roleMax: {
    asystent: { 1: 4, 2: 2, 3: 2, 4: 1 }, fizyczny: { 1: 3, 2: 2, 3: 1, 4: 1 }, bramkarze: { 1: 2, 2: 1, 3: 1, 4: 1 },
    analityk: { 1: 4, 2: 2, 3: 1, 4: 1 }, mlodziez: { 1: 2, 2: 1, 3: 1, 4: 1 }, kierownik: { 1: 1, 2: 1, 3: 1, 4: 1 },
    fizjoterapeuta: { 1: 3, 2: 2, 3: 1, 4: 1 }, skaut: { 1: 3, 2: 2, 3: 1, 4: 0 },
  },
  // Limit całego sztabu: clamp(round(B + (rep - R0) / 12 + F), MIN, MAX), F = clamp(1,5 log2(przychód / D0), -1,5, 2,5)
  limit: {
    B: { 1: 9, 2: 6, 3: 4.5, 4: 3 }, R0: { 1: 60, 2: 40, 3: 22, 4: 12 }, D0: { 1: 45e6, 2: 8e6, 3: 3e6, 4: 1e6 },
    MIN: { 1: 7, 2: 5, 3: 4, 4: 4 }, MAX: { 1: 18, 2: 9, 3: 7, 4: 5 }, repDiv: 12, fK: 1.5, fMin: -1.5, fMax: 2.5, // III liga od 4 osób (decyzja właściciela, Nov 16, 2026)
  },
  // Kolejność obsadzania (k-te wystąpienie roli = k-ta osoba w roli): plan sztabu klubu w granicach limitu
  plan: {
    high: ['asystent', 'fizyczny', 'bramkarze', 'kierownik', 'fizjoterapeuta', 'analityk', 'mlodziez', 'skaut', 'asystent', 'analityk', 'fizyczny', 'fizjoterapeuta', 'skaut', 'asystent', 'bramkarze', 'analityk', 'mlodziez', 'fizyczny', 'skaut', 'asystent', 'fizjoterapeuta', 'analityk'],
    low: ['asystent', 'bramkarze', 'kierownik', 'fizyczny', 'fizjoterapeuta', 'mlodziez', 'analityk', 'skaut', 'asystent', 'fizyczny', 'fizjoterapeuta'],
  },
  budget: { base: 1.10, wealth: 0.01, coreVacancy: 0.2 }, // budżet miesięczny: staffBase / 12 x (1,10 + 0,01 x (zasobność - 10)); wakat w rdzeniu: zarząd pozwala przekroczyć o 20 %
  migrateCap: 0.6, // przy migracji pensje sztabu najwyżej 60 % kosztów klubu (część etatu w rezerwach i małych klubach)
  baseCap: 1, // staffBase najwyżej tyle, ile roczne koszty klubu (bezpiecznik: ops bez staffBase nie spada poniżej zera)
  offer: { userMax: 3, aiMax: 1, aiMaxWindow: 2, minShare: 0.6, cool: 14, perPerson: 3, decide: [2, 3], lockDays: 120 },
  // Użyteczność oferty dla osoby (ta sama dla gracza i AI)
  util: {
    money: 2.0, prestige: 0.025, rcel0: -2, rcelQ: 4.5, prestigeMin: -1, prestigeMax: 0.5, lead: 0.5, third: -0.3,
    oldAge: 55, oldYears: 0.15, youngAge: 35, youngYears: -0.1, foreignTop: 0.4, foreignLow: -0.6, coach: 1.2, noise: 0.3,
    u0: 0.25, u0Month: 0.15, u0Months: 6, stay: 0.5, demoted: -0.6, // zostanie w klubie: premia za brak zmiany; zdegradowany lider: kara
  },
  severance: { min: 2, max: 6 }, // odprawa: pozostałe pełne miesiące kontraktu, od 2 do 6 pensji
  // Podbieranie: rekompensata 3 pensje; przy blokadzie kara 3 pensje + 0-50 %; rzadko i bez zalewu ofert
  poach: {
    comp: 3, penaltyExtra: 0.5, contractDays: 182, // pierwsze 6 miesięcy umowy: bez prób
    breakBase: 0.2, breakPerU: 0.4, breakMin: 0.05, breakMax: 0.75, // zerwanie umowy przy blokadzie
    ban: 365, // klub po nieudanej albo zablokowanej próbie: ta sama osoba dopiero po 12 miesiącach
    perPersonHalf: 1, userHalf: 2, // najwyżej 1 próba na osobę i 2 próby na cały sztab gracza w pół sezonu
    aiSeason: 6, // podebrania AI-AI: najwyżej 6 udanych w sezonie w całej Polsce
    aiTriesSeason: 12, // i najwyżej 12 prób AI-AI w sezonie
    aiRepGap: 15, aiWageGain: 1.15, months: [6, 7, 8, 12, 1, 2], // AI: wyraźny zysk, w okolicach okien
    blockImportant: 0.85, blockOther: 0.3, // AI blokuje lidera bez zastępcy z szansą 85 %, pozostałych 30 %
  },
  adapt: { days: 90, pen: 2 }, // obcokrajowiec: 3 miesiące słabiej (16 pracuje jak 14), wygasa liniowo
  pool: {
    size: 100, cap: 140, foreign: 0.25, foreignBonus: 1, sd: 1.5,
    shares: { asystent: 22, fizyczny: 14, analityk: 12, bramkarze: 11, mlodziez: 10, kierownik: 10, fizjoterapeuta: 12, skaut: 9 },
    levels: [[0.15, 14], [0.25, 11], [0.30, 8.5], [0.30, 5.5]],
    idleDays: 60, leave: 0.25, leaveLong: 0.15, leaveOld: 0.3, oldAge: 63, retire: 67, noRenewAge: 65,
  },
  ai: { buckets: 4, windowBuckets: 1, windowMonths: [6, 7, 8, 12, 1], over: 0.6, helperMinQ: 7, weak: 3, coachBring: { 1: 0.6, 2: 0.4, 3: 0.25, 4: 0.1 }, coachLeave: 0.6 },
  dev: { upAge: 45, up: 0.3, downAge: 60, down: 0.3 },
  foreignNats: ['ESP', 'POR', 'SVK', 'CZE', 'UKR', 'DEN', 'SWE', 'NOR', 'CRO', 'SRB', 'SVN', 'GER', 'NED', 'LTU', 'AUT', 'ITA'],
};

export const STAFF_REASONS = {
  ok: 'Oferta złożona.',
  none: 'Nie ma takiej osoby.',
  own: 'Ta osoba już pracuje w Twoim klubie.',
  locked: 'Ta osoba niedawno podpisała umowę i nie przyjmuje ofert.',
  limit: 'Sztab pełny (wliczając złożone oferty).',
  roleFull: 'W tej roli nie ma już miejsca.',
  pending: 'Złożono już najwięcej ofert naraz.',
  dup: 'Twoja oferta dla tej osoby już czeka na decyzję.',
  many: 'Ta osoba rozważa już najwięcej ofert.',
  low: 'Oferta zbyt niska wobec jego oczekiwań. Odrzucona od razu.',
  cool: 'Ta osoba niedawno odrzuciła Twoją ofertę. Spróbuj za kilka dni.',
  budget: 'Pensje sztabu przekroczyłyby budżet.',
  years: 'Nieprawidłowa długość umowy.',
  club: 'Nieznany klub.',
  notMine: 'Ta osoba nie pracuje w Twoim klubie.',
  early: 'Przedłużenie możliwe od 1 stycznia ostatniego roku umowy.',
  refused: 'Odmówił przedłużenia na tych warunkach.',
  poachBan: 'Ten klub niedawno próbował zatrudnić tę osobę. Kolejna próba za kilka miesięcy.',
  poachCap: 'W tej rundzie było już dość prób zatrudnienia tej osoby.',
  role: 'Ta rola nie jest dostępna w tej lidze.',
  dirPending: 'Twoja oferta dla dyrektora sportowego już czeka na decyzję.',
  dirOwner: 'O dyrektorze sportowym decyduje zarząd klubu. Możesz poprosić zarząd o zmianę (Klub, Zarząd).',
};

const K = STAFF_MARKET;
const r1 = (v) => Math.round(v * 10) / 10;
const r100 = (v) => Math.round(v / 100) * 100;
const tierOf = (clubId) => clamp(clubById(clubId)?.tier ?? 4, 1, 4);
const nameOf = (clubId) => clubById(clubId)?.name ?? clubId;
const seasonYear = (game) => game.seasonYear ?? 2026;
const isMonday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay() === 1;
const roleName = (role) => (role === DIRECTOR_ROLE ? DIRECTOR_NAME : STAFF_ROLES[role]?.name ?? role);
/** Dyrektor sportowy (osobny slot, docs/dyrektor-sportowy.md). */
export const isDirector = (p) => p?.role === DIRECTOR_ROLE;
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const fmtZlM = (v) => `${(Math.round(v / 100) / 10).toLocaleString('pl-PL')} tys. zł`;
const coachKey = (c) => (c ? c.id ?? c.name ?? null : null);
const isForeign = (p) => !!p.nat && p.nat !== 'POL';
/** Pół sezonu (lipiec-grudzień, styczeń-czerwiec): klucz limitów podbierania. */
export const halfKeyOf = (date) => { const y = +date.slice(0, 4); return +date.slice(5, 7) >= 7 ? `${y}a` : `${y - 1}b`; };

// ------------------------------------------------------------ Wzory (czyste)

/**
 * Oczekiwana pensja (zł / mies.): jakość, rola, narodowość, okres bez pracy (opcjonalnie). Dyrektor sportowy: x mnożnik
 * ligi klubu (club: klub, w którym ma pracować; bez klubu jak w Ekstraklasie).
 */
export function expectedWage(p, date = null, { idle = true, club = null } = {}) {
  const W = K.wage;
  let w = W.base * (W.R[p.role] ?? 0.5) * W.growth ** ((p.q ?? 10) - 10) * (isForeign(p) ? W.foreign : 1) * scoutRegionPremium(p);
  if (isDirector(p) && club) w *= K.director.league[tierOf(club)] ?? 1;
  if (idle && p.free && date && !p.club) {
    const d = daysBetween(p.free, date);
    if (d > W.idleFree) w *= Math.max(W.idleMin, 1 - W.idlePerMonth * (d - W.idleFree) / 30);
  }
  return Math.max(W.min, r100(w));
}

/** Skaut: premia za znajomość regionu x clamp(1 + 0,03 (najlepszy region - 10), 0,9, 1,2) (docs/skauting.md) [SZAC]. */
export function scoutRegionPremium(p) {
  if (p?.role !== 'skaut' || !p.reg) return 1;
  const best = Math.max(0, ...Object.values(p.reg));
  return clamp(1 + 0.03 * (best - 10), 0.9, 1.2);
}

/** Jakość osoby w danym dniu (adaptacja obcokrajowca obniża ją przez 3 miesiące, liniowo do zera). */
export function personQ(p, date = null) {
  if (!p.adapt || !date || date >= p.adapt.to) return p.q;
  const left = daysBetween(date, p.adapt.to);
  return Math.max(1, p.q - p.adapt.pen * Math.min(1, left / K.adapt.days));
}

/** Atrybut osoby w danym dniu (adaptacja jak przy jakości). Osoba bez atrybutów: jej jakość. */
export function personAttr(p, key, date = null) {
  const v = p.a?.[key] ?? p.q;
  if (!p.adapt || !date || date >= p.adapt.to) return v;
  const left = daysBetween(date, p.adapt.to);
  return Math.max(1, v - p.adapt.pen * Math.min(1, left / K.adapt.days));
}

/** Jakość efektywna roli z jakości osób (najlepszy prowadzi, pozostali pomagają z malejącą wagą). */
export function combineQ(qs, role) {
  if (!qs.length) return K.vacantQ[role] ?? 3;
  const s = [...qs].sort((a, b) => b - a);
  if (role === 'kierownik') return r1(Math.min(20, s[0]));
  let h = 0;
  for (let i = 1; i < s.length && i <= K.help.length; i++) h += K.help[i - 1] * Math.max(0, s[i] - K.helpFrom);
  return r1(Math.min(20, s[0] + Math.min(K.helpMax, h)));
}

/** Kara adaptacji na start (obcokrajowiec bez pracy w Polsce): 2 punkty jakości, 3 miesiące. */
export const adaptPenalty = (nat) => (!nat || nat === 'POL' ? 0 : K.adapt.pen);

/** Data końca kontraktu: latem lata liczone od bieżącego sezonu, zimą od kolejnego (0 = do końca sezonu, tylko zimą). */
export function contractUntil(date, years) {
  const y = +date.slice(0, 4); const m = +date.slice(5, 7);
  const end = m >= 7 ? y + 1 : y;
  const yrs = clamp(Math.round(years), 0, 3);
  return `${m >= 7 ? end + Math.max(1, yrs) - 1 : end + yrs}-06-30`;
}

/** Pełne miesiące od daty do końca kontraktu. */
function monthsLeft(date, until) {
  if (!until || until <= date) return 0;
  const [y1, m1, d1] = date.split('-').map(Number);
  const [y2, m2, d2] = until.split('-').map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

/** Odprawa przy zwolnieniu: pozostałe pełne miesiące kontraktu, od 2 do 6 pensji. */
export function severanceOf(p, date) {
  if (!p?.club) return 0;
  const n = clamp(monthsLeft(date, p.until), K.severance.min, K.severance.max);
  return Math.round(n * (p.wage ?? 0));
}

/** Rekompensata dla klubu, z którego odchodzi osoba za zgodą klubu: 3 pensje. */
export const poachCompensation = (p) => Math.round(K.poach.comp * (p?.wage ?? 0));

// ------------------------------------------------------------ Stan

function newPersonId(S) { S.seq = (S.seq ?? 0) + 1; return `st:${S.seq}`; }

/** Nowa osoba z ziarna (pula, przywóz trenera). opts: { role, mean, nat, age, free } */
function makePerson(game, S, key, opts = {}) {
  const rng = new Rng(`sztab-pula:${game.seed}:${key}`);
  const role = opts.role;
  const foreign = opts.nat ? opts.nat !== 'POL' : role === 'kierownik' ? false : rng.chance(K.pool.foreign * (role === 'asystent' || role === 'analityk' ? 1.3 : 0.8));
  const nats = K.foreignNats.filter((c) => NATIONALITIES.includes(c));
  const nat = opts.nat ?? (foreign ? nats[rng.int(0, nats.length - 1)] : 'POL');
  const nm = randomName(NATIONALITIES.includes(nat) ? nat : 'POL', rng);
  const q = clamp(Math.round((opts.mean ?? 8.5) + (foreign ? K.pool.foreignBonus : 0) + rng.gauss(0, K.pool.sd)), 1, 19);
  const age = opts.age ?? (role === 'asystent' || role === 'analityk' || role === 'skaut' ? rng.int(28, 58) : rng.int(32, 64));
  const id = newPersonId(S);
  const p = { id, name: `${nm.first} ${nm.last}`, nat, age, role, q, a: attrsAround(q, role, `${game.seed}:${id}`), wage: 0, until: null, since: null, club: null, free: opts.free ?? game.date ?? null, coach: null, adapt: null, pl: nat === 'POL', lead: false, demoted: null, hist: [] };
  return ensureScoutReg(p, `${game.seed}:${id}`); // skaut: regiony (career/scoutRegions.js)
}

/** Poziom kandydata z puli (udział poziomów lig, średnie q). */
function poolMean(rng) {
  const r = rng.next(); let acc = 0;
  for (const [share, mean] of K.pool.levels) { acc += share; if (r < acc) return mean; }
  return K.pool.levels.at(-1)[1];
}

/** Rola dla nowej osoby w puli: największy brak wobec udziałów. */
function neededRole(S) {
  const cnt = {};
  for (const id of S.pool) { const p = S.people[id]; if (p) cnt[p.role] = (cnt[p.role] ?? 0) + 1; }
  const tot = Object.values(K.pool.shares).reduce((a, b) => a + b, 0);
  const n = S.pool.length + 1;
  let best = 'asystent'; let gap = -Infinity;
  for (const [role, share] of Object.entries(K.pool.shares)) {
    const g = share / tot * n - (cnt[role] ?? 0);
    if (g > gap) { gap = g; best = role; }
  }
  return best;
}

function addPoolPerson(game, S, key, date, role = null) {
  const rng = new Rng(`sztab-pula-poziom:${game.seed}:${key}`);
  const r = role ?? neededRole(S);
  const p = makePerson(game, S, key, { role: r, mean: poolMean(rng), free: addDays(date, -rng.int(0, 150)) });
  S.people[p.id] = p; S.pool.push(p.id);
  return p;
}

/** Limit sztabu klubu (osoby): liga, reputacja, przychody krajowe. */
export function computeLimit(game, clubId) {
  const club = clubById(clubId);
  if (!club) return 6;
  const t = tierOf(clubId); const L = K.limit;
  const plan = game.finance?.clubs?.[clubId]?.plan ?? clubPlan(club);
  const dom = Math.max(1, plan?.domestic ?? L.D0[t]);
  const F = clamp(L.fK * Math.log2(dom / L.D0[t]), L.fMin, L.fMax);
  return clamp(Math.round(L.B[t] + (clubReputation(club) - L.R0[t]) / L.repDiv + F), L.MIN[t], L.MAX[t]);
}

/** Najwięcej osób w roli w lidze klubu (skaut w III lidze: 0, rola niedostępna). */
export const roleCap = (clubId, role) => K.roleMax[role]?.[tierOf(clubId)] ?? 1;

/** Plan sztabu klubu: kolejne miejsca (rola, numer w roli) w granicach limitu i limitów ról. */
export function staffPlan(clubId, limit) {
  const t = tierOf(clubId);
  const order = t <= 2 ? K.plan.high : K.plan.low;
  const seen = {}; const out = [];
  for (const role of order) {
    if (out.length >= limit) break;
    const k = (seen[role] ?? 0) + 1;
    if (k > (K.roleMax[role]?.[t] ?? 1)) continue;
    seen[role] = k; out.push({ role, k });
  }
  return out;
}

/** Jakość typowa sztabu klubu (ten sam wzór co generator: 3 + 1,3 prestiżu + premia ligi). */
function typicalQ(clubId) {
  const club = clubById(clubId);
  const parent = club?.parent ? clubById(club.parent) : null;
  const prestige = parent ? Math.max(1, parent.prestige - 3) : club?.prestige ?? 4;
  return 3 + 1.3 * prestige + ({ 1: 1, 2: 0, 3: -1, 4: -2 }[club?.tier] ?? 0);
}

const payMul = (clubId) => Math.sqrt(Math.max(0.3, Number(payLevel(clubById(clubId) ?? clubId)) || 1));

/** Roczny koszt typowego sztabu klubu (staffBase nowego sezonu). */
export function typicalStaffCost(game, clubId) {
  const S = game.staff;
  const limit = S?.limit?.[clubId] ?? computeLimit(game, clubId);
  const q0 = typicalQ(clubId);
  let sum = 0;
  for (const { role, k } of staffPlan(clubId, limit)) sum += expectedWage({ role, q: clamp(Math.round(q0 - (k > 1 ? 2 : 0)), 1, 20), nat: 'POL' }) * payMul(clubId);
  // Dyrektor sportowy: typowa jakość = średnia atrybutu Negocjacje w lidze klubu
  sum += expectedWage({ role: DIRECTOR_ROLE, q: clamp(Math.round(negMean(clubId)), 1, 20), nat: 'POL' }, null, { club: clubId }) * payMul(clubId);
  return Math.round(sum * 12 / 1000) * 1000;
}

/** Statystyki sezonu (do kalibracji i tools/multiseason.mjs). */
export function seasonStats(S, game) {
  const y = seasonYear(game);
  return (S.stats[y] ??= {
    hires: 0, fires: 0, expired: 0, renewed: 0, gone: 0, retired: 0, brought: 0, foreign: 0, offers: 0, rejected: 0,
    poachTry: { aiai: 0, aiuser: 0, userai: 0 }, poached: { aiai: 0, aiuser: 0, userai: 0 }, blocked: 0, broke: 0, demoted: 0,
    byTier: { 1: 0, 2: 0, 3: 0, 4: 0 },
  });
}

/** Skład sztabu klubu: osoby. */
export function rosterOf(game, clubId) {
  const S = game?.staff;
  return (S?.clubs?.[clubId] ?? []).map((id) => S.people[id]).filter(Boolean);
}

/** Przelicza widok game.training.staff[clubId] (jedna pozycja na rolę) z osób klubu. */
export function syncStaff(game, clubId, date = game.date) {
  const T = game.training; const S = game.staff;
  if (!T?.staff || !S?.clubs?.[clubId]) return;
  // Skaut na wyjeździe za granicą (p.away: data powrotu, src/career/scoutOps.js) nie pracuje w klubie: rola liczona bez niego
  const ppl = rosterOf(game, clubId).filter((p) => !(p.away && date < p.away));
  const view = {};
  let adapting = false;
  for (const role of STAFF_ROLE_IDS) {
    const list = ppl.filter((p) => p.role === role);
    if (!list.length) { view[role] = { name: null, q: K.vacantQ[role] ?? 3, age: null, vacant: true }; continue; }
    let lead = list[0]; let lq = -1;
    const qs = [];
    for (const p of list) {
      const q = personQ(p, date);
      if (p.adapt && date < p.adapt.to) adapting = true;
      qs.push(q);
      if (q > lq) { lead = p; lq = q; }
    }
    const o = { name: lead.name, q: combineQ(qs, role), age: lead.age };
    // Atrybuty roli: ten sam wzór co jakość (lider i pomocnicy, adaptacja obcokrajowca obniża wszystkie atrybuty),
    // zapisane jako odchylenie od jakości roli (d), więc atrybut = q + d (training/staff.js staffA)
    const keys = roleAttrKeys(role);
    if (keys.length) {
      o.d = {};
      for (const k of keys) { const x = r1(combineQ(list.map((p) => personAttr(p, k, date)), role) - o.q); if (x) o.d[k] = x; }
    }
    if (list.length > 1) o.n = list.length;
    view[role] = o;
  }
  T.staff[clubId] = view;
  if (adapting) { if (!S.adapting.includes(clubId)) S.adapting.push(clubId); } else if (S.adapting.includes(clubId)) S.adapting = S.adapting.filter((x) => x !== clubId);
}

/** Dyrektor sportowy klubu (osoba) albo null (wakat, klub bez stanu sztabu). */
export function directorOf(game, clubId) {
  const S = game?.staff;
  const id = S?.dir?.[clubId];
  const p = id ? S.people[id] : null;
  return p && p.club === clubId ? p : null;
}

/** Pensje klubu (zł / mies.): osoby sztabu i dyrektor sportowy (jego pensja też idzie z budżetu sztabu). */
export function clubStaffPay(game, clubId) {
  return rosterOf(game, clubId).reduce((s, p) => s + (p.wage ?? 0), 0) + (directorOf(game, clubId)?.wage ?? 0);
}

/** Pensje sztabu klubu (miesięcznie) do finansów. */
function updatePay(game, clubId) {
  const c = game.finance?.clubs?.[clubId];
  if (c) c.staffPay = clubStaffPay(game, clubId);
}

/** Kontrakty sztabu na start (migracja): 30 czerwca 2027-2029, w niższych ligach głównie rok. */
function startUntil(rng, tier, date) {
  const y = +date.slice(0, 4) + (+date.slice(5, 7) >= 7 ? 1 : 0);
  const r = rng.next();
  const add = tier <= 2 ? (r < 0.35 ? 0 : r < 0.7 ? 1 : 2) : (r < 0.7 ? 0 : 1);
  return `${y + add}-06-30`;
}

/** Sztab klubu na start (nowa gra, stary zapis, nowy klub w świecie): osoby z dzisiejszego widoku i ziarna gry. */
function buildClub(game, S, clubId, date) {
  const T = game.training;
  const gen = generateStaffFor(game, clubId);
  const view = T?.staff?.[clubId] ?? gen;
  const t = tierOf(clubId);
  const limit = (S.limit[clubId] = computeLimit(game, clubId));
  const ids = [];
  const pm = payMul(clubId);
  const since = addDays(date, -365);
  const add = (role, src, k) => {
    const rng = new Rng(`sztab-start:${game.seed}:${clubId}:${role}:${k}`);
    const p = { id: newPersonId(S), name: src.name, nat: 'POL', age: src.age ?? rng.int(31, 62), role, q: clamp(Math.round(src.q ?? 10), 1, 20), wage: 0, until: startUntil(rng, t, date), since, club: clubId, free: null, coach: null, adapt: null, pl: true, lead: k === 1, demoted: null, hist: [] };
    ensurePersonAttrs(p, `${game.seed}:${p.id}`); // atrybuty roli wokół jakości (średnia = jakość)
    p.wage = Math.max(K.wage.min, r100(expectedWage(p) * pm));
    S.people[p.id] = p; ids.push(p.id);
    return p;
  };
  const counts = {};
  // Dotychczasowe role (6 osób): wszyscy zostają, także ponad limitem (wygasają z kontraktami)
  for (const role of STAFF_ROLE_IDS) {
    if (role === 'fizjoterapeuta' || role === 'skaut') continue;
    const src = view[role];
    if (!src || src.vacant || src.name == null) continue;
    add(role, src, 1); counts[role] = 1;
  }
  // Nowe role i pomocnicy: kolejne miejsca planu, póki jest miejsce w limicie
  for (const { role, k } of staffPlan(clubId, limit)) {
    if (ids.length >= limit) break;
    if ((counts[role] ?? 0) >= k) continue;
    if (k === 1) {
      const src = (view[role] && !view[role].vacant && view[role].name) ? view[role] : gen[role];
      add(role, src, 1);
    } else {
      const lead = ids.map((id) => S.people[id]).find((p) => p.role === role);
      const q1 = lead?.q ?? typicalQ(clubId);
      const rng = new Rng(`sztab-start:${game.seed}:${clubId}:${role}:${k}`);
      const q = clamp(Math.min(q1 - 1, Math.round(q1 - 2 + rng.gauss(0, 1.5))), 1, 20);
      const n = randomName('POL', rng);
      add(role, { name: `${n.first} ${n.last}`, q, age: rng.int(28, 60) }, k);
    }
    counts[role] = k;
  }
  S.clubs[clubId] = ids;
}

/**
 * Tworzy lub uzupełnia game.staff (stary zapis, nowa gra, nowe kluby po awansie z IV ligi, kluby rozwiązane).
 * Idempotentna i tania przy kolejnych wywołaniach. Zwraca stan albo null (brak świata).
 */
export function ensureStaff(game) {
  if (!game?.world) return null;
  const date = game.date ?? '2026-07-01';
  if (!game.training) ensureTraining(game);
  let S = game.staff;
  let fresh = false;
  if (!S || S.v !== STAFF_VERSION) {
    S = game.staff = { v: STAFF_VERSION, seq: 0, createdAt: date, year: seasonYear(game), people: {}, clubs: {}, pool: [], offers: [], decide: {}, limit: {}, cool: {}, block: {}, adapting: [], based: {}, poach: { ban: {}, tried: {}, userHalf: {} }, last: { refresh: date }, stats: {} };
    fresh = true;
  }
  S.block ??= {}; S.adapting ??= []; S.based ??= {}; S.cool ??= {}; S.stats ??= {}; S.poach ??= { ban: {}, tried: {}, userHalf: {} };
  // Atrybuty osób sztabu (stare zapisy, raz): wokół dotychczasowej jakości, średnia = jakość, więc efekty bez skoku.
  // Wersja 2 (skauting, docs/skauting.md): skaut z 3 na 5 atrybutów i regiony, jakość bez zmian
  if ((S.attrs ?? 0) < 2) {
    for (const p of Object.values(S.people)) ensurePersonAttrs(p, `${game.seed}:${p.id}`);
    S.attrs = 2;
    if (!fresh) for (const id of Object.keys(S.clubs)) if (game.world.clubs[id]) syncStaff(game, id, date);
  }
  // Kluby rozwiązane (spadek do IV ligi): sztab do puli
  for (const id of Object.keys(S.clubs)) if (!game.world.clubs[id]) dissolveClub(game, S, id, date);
  // Nowe kluby (stary zapis, awans z IV ligi): sztab z widoku i ziarna
  const added = [];
  for (const id of Object.keys(game.world.clubs)) if (!S.clubs[id]) { buildClub(game, S, id, date); added.push(id); }
  if (fresh) for (let i = 0; i < K.pool.size; i++) addPoolPerson(game, S, `start:${i}`, date);
  for (const id of added) syncStaff(game, id, date);
  // Dyrektorzy sportowi (docs/dyrektor-sportowy.md): klub bez dyrektora (nowa gra, stary zapis, awans) dostaje osobę
  // z dawnego atrybutu Negocjacje (game.clubNeg) albo z tego samego losowania; lista wolnych dyrektorów
  ensureDirectors(game, date);
  // Nowy sezon (po rollover): wygasłe kontrakty, wiek, rozwój, limity
  if (S.year !== seasonYear(game)) staffNewSeason(game, date);
  ensureStaffFinance(game);
  return S;
}

/** Pensje sztabu w planie finansów: przy migracji rzeczywista suma (neutralnie), od nowego sezonu koszt typowego sztabu. */
export function ensureStaffFinance(game) {
  const S = game.staff; const F = game.finance;
  if (!S || !F?.clubs) return;
  for (const [id, c] of Object.entries(F.clubs)) {
    if (!c.plan || c.plan.staffOn || !S.clubs[id]) continue;
    let actual = clubStaffPay(game, id);
    // Migracja: sztab droższy niż 60 % kosztów klubu (rezerwy, małe kluby) pracuje za mniej (część etatu), żeby
    // pierwszy dzień był neutralny finansowo
    const cap0 = (c.plan.ops ?? 0) * K.migrateCap / 12;
    if (S.based[id] == null && actual > cap0 && actual > 0) {
      for (const p of [...rosterOf(game, id), directorOf(game, id)].filter(Boolean)) p.wage = Math.max(K.wage.min, r100(p.wage * cap0 / actual));
      actual = clubStaffPay(game, id);
    }
    // Nowy sezon: połowa z kosztu typowego sztabu, połowa z rzeczywistych pensji (zmiana stopniowa, bez skoku)
    const base = S.based[id] == null ? actual * 12 : (typicalStaffCost(game, id) + actual * 12) / 2;
    c.plan.staffBase = Math.round(Math.min(base, (c.plan.ops ?? 0) * K.baseCap));
    c.plan.staffOn = true;
    c.staffPay = actual;
    S.based[id] = seasonYear(game);
  }
}

function closeHist(p, date, why) {
  if (!p.club) return;
  p.hist = [{ club: p.club, from: p.since ?? null, to: date, why }, ...(p.hist ?? [])].slice(0, 4);
}

/** Osoba odchodzi z klubu do puli wolnych (bez odprawy: tę księguje wołający). */
/** Odpięcie osoby od klubu (sztab albo slot dyrektora), bez zmian w samej osobie. */
function detach(S, p, from = p.club) {
  if (!from) return;
  if (isDirector(p)) { if (S.dir?.[from] === p.id) delete S.dir[from]; } else S.clubs[from] = (S.clubs[from] ?? []).filter((id) => id !== p.id);
}

/** Lista wolnych osoby: dyrektorzy mają własną (S.dirPool), reszta sztabu S.pool. */
const poolOf = (S, p) => (isDirector(p) ? (S.dirPool ??= []) : S.pool);

function toPool(game, p, date, why) {
  const S = game.staff;
  const from = p.club;
  closeHist(p, date, why);
  detach(S, p, from);
  Object.assign(p, { club: null, wage: 0, until: null, free: date, coach: null, adapt: null, signed: null, lead: false, demoted: null });
  delete S.block[p.id];
  const pool = poolOf(S, p);
  if (!pool.includes(p.id)) pool.push(p.id);
  if (from && S.clubs[from]) { syncStaff(game, from, date); updatePay(game, from); }
}

function removePerson(S, p) {
  detach(S, p);
  S.pool = S.pool.filter((id) => id !== p.id);
  if (S.dirPool) S.dirPool = S.dirPool.filter((id) => id !== p.id);
  S.offers = S.offers.filter((o) => o.pid !== p.id);
  delete S.decide[p.id]; delete S.block[p.id];
  delete S.people[p.id];
}

function dissolveClub(game, S, clubId, date) {
  const d = directorOf(game, clubId);
  for (const p of [...rosterOf(game, clubId), ...(d ? [d] : [])]) {
    closeHist(p, date, 'rozwiązanie klubu');
    Object.assign(p, { club: null, wage: 0, until: null, free: date, coach: null, adapt: null, signed: null, lead: false, demoted: null });
    poolOf(S, p).push(p.id);
  }
  delete S.clubs[clubId]; delete S.limit[clubId];
  if (S.dir) delete S.dir[clubId];
  if (S.dirInit) delete S.dirInit[clubId];
  S.offers = S.offers.filter((o) => o.club !== clubId);
}

// ------------------------------------------------------------ Dyrektor sportowy (docs/dyrektor-sportowy.md)

/**
 * Nowy dyrektor (nie dopisany do stanu): Negocjacje = neg, pozostałe atrybuty NEG + N(0; 2,5) (korelacja z
 * negocjacjami), jakość = średnia. Deterministycznie z klucza. opts: { neg, nat, age, free }.
 */
function makeDirector(game, S, key, opts = {}) {
  const D = K.director;
  const rng = new Rng(`dyrektor-osoba:${game.seed}:${key}`);
  const nats = K.foreignNats.filter((c) => NATIONALITIES.includes(c));
  const nat = opts.nat ?? (rng.chance(D.pool.foreign) ? nats[rng.int(0, nats.length - 1)] : 'POL');
  const nm = randomName(NATIONALITIES.includes(nat) ? nat : 'POL', rng);
  const neg = clamp(Math.round(opts.neg ?? 10), 1, 20);
  const a = { NEG: neg };
  for (const k of ['RYN', 'SIE', 'KAD']) a[k] = clamp(Math.round(neg + rng.gauss(0, D.spread)), 1, 20);
  const id = newPersonId(S);
  return { id, name: `${nm.first} ${nm.last}`, nat, age: opts.age ?? rng.int(D.age[0], D.age[1]), role: DIRECTOR_ROLE, q: qFromAttrs(a), a, wage: 0, until: null, since: null, club: null, free: opts.free ?? game.date ?? null, coach: null, adapt: null, pl: nat === 'POL', lead: false, demoted: null, hist: [] };
}

/** Rok końca sezonu dla daty (lipiec-grudzień: następny rok). */
const endYearOf = (date) => +date.slice(0, 4) + (+date.slice(5, 7) >= 7 ? 1 : 0);

/** Dyrektor obejmuje stanowisko bez oferty (migracja, decyzja zarządu klubu AI 1 lipca). */
function appointDirector(game, S, p, clubId, date, { years, why = 'zatrudnienie', since = date } = {}) {
  S.dirPool = (S.dirPool ?? []).filter((id) => id !== p.id);
  S.offers = S.offers.filter((o) => o.pid !== p.id); delete S.decide[p.id];
  const wage = Math.max(K.wage.min, r100(expectedWage(p, date, { club: clubId, idle: false }) * payMul(clubId)));
  if (p.club) closeHist(p, date, why);
  Object.assign(p, { club: clubId, wage, until: `${endYearOf(date) + Math.max(0, (years ?? 1) - 1)}-06-30`, since, free: null, signed: since === date ? date : null, coach: null, lead: true, demoted: null, adapt: null });
  p.pl = true;
  S.dir[clubId] = p.id;
  updatePay(game, clubId);
  return p;
}

/** Negocjacje klubu przed dyrektorem (dawny atrybut game.clubNeg albo to samo leniwe losowanie co clubNegotiation). */
function legacyNeg(game, clubId) {
  const e = game.clubNeg?.[clubId];
  if (e && typeof e.n === 'number') return e.n;
  const y = seasonYear(game);
  const n = negDraw(new Rng(`negInit:${game.seed}:${clubId}:${y}`), negMean(clubId));
  game.clubNeg ??= {};
  game.clubNeg[clubId] = { n, y, d: 1 }; // zapas (docs/negocjacje.md rozdz. 15)
  return n;
}

/**
 * Każdy klub z kadrą (Ekstraklasa do III ligi) ma dyrektora sportowego: migracja starego zapisu, nowa gra, awans
 * z IV ligi. Negocjacje = dawny atrybut klubu (rozkład bez zmian), umowa 1-3 lata, pensja ze wzoru sztabu. Klub
 * z planem finansów już po migracji sztabu dostaje pensję dyrektora także w budżecie (pierwszy dzień neutralny).
 * Lista wolnych dyrektorów (12-16 osób) przy pierwszym wywołaniu. Wakat po odejściu dyrektora zostaje wakatem.
 */
export function ensureDirectors(game, date = game.date ?? '2026-07-01') {
  const S = game?.staff;
  if (!S || !game.world?.clubs) return;
  S.dir ??= {}; S.dirPool ??= []; S.dirInit ??= {};
  for (const id of Object.keys(game.world.clubs)) {
    if (S.dirInit[id] || !clubById(id) || (clubById(id).tier ?? 5) > 4) continue;
    S.dirInit[id] = true;
    if (directorOf(game, id)) continue;
    const rng = new Rng(`dyrektor-start:${game.seed}:${id}`);
    const p = makeDirector(game, S, `start:${id}`, { neg: legacyNeg(game, id), nat: 'POL' });
    S.people[p.id] = p;
    appointDirector(game, S, p, id, date, { years: rng.int(1, 3), since: addDays(date, -365) });
    const plan = game.finance?.clubs?.[id]?.plan;
    if (plan?.staffOn) plan.staffBase = Math.round((plan.staffBase ?? 0) + p.wage * 12); // budżet sztabu z pensją dyrektora
  }
  if (!S.dirV) {
    S.dirV = 1;
    for (let i = 0; S.dirPool.length < K.director.pool.size && i < 40; i++) addDirectorToPool(game, S, `start:${i}`, date);
  }
}

/** Edytor i datapack: klub z wakatem dostaje nowego dyrektora (atrybuty nadpisze plik). Zwraca osobę albo null. */
export function ensureEditorDirector(game, clubId) {
  const S = game?.staff;
  if (!S || !game.world?.clubs?.[clubId]) return null;
  ensureDirectors(game);
  const cur = directorOf(game, clubId);
  if (cur) return cur;
  const p = makeDirector(game, S, `edytor:${clubId}:${game.date}`, { neg: Math.round(negMean(clubId)), nat: 'POL' });
  S.people[p.id] = p;
  return appointDirector(game, S, p, clubId, game.date ?? '2026-07-01', { years: 2 });
}

/** Nowy wolny dyrektor: poziom z udziału lig (Negocjacje wokół średniej ligi), wolny od 0-150 dni. */
function addDirectorToPool(game, S, key, date) {
  const rng = new Rng(`dyrektor-pula:${game.seed}:${key}`);
  const r = rng.next(); let acc = 0; let tier = 4;
  for (const [share, t] of K.director.pool.tiers) { acc += share; if (r < acc) { tier = t; break; } }
  const p = makeDirector(game, S, `pula:${key}`, { neg: negDraw(rng, NEG.mean[tier]), free: addDays(date, -rng.int(0, 150)) });
  S.people[p.id] = p; S.dirPool.push(p.id);
  return p;
}

/** 1 czerwca i 1 stycznia: ok. 25 % wolnych dyrektorów od 60+ dni odchodzi, lista wraca do 12-16 osób. */
export function refreshDirectorPool(game, date) {
  const S = game.staff; const P = K.director.pool;
  S.dirPool ??= [];
  const keep = [];
  for (const id of S.dirPool) {
    const p = S.people[id];
    if (!p || p.club) continue;
    const idle = p.free ? daysBetween(p.free, date) : 999;
    if (idle >= P.idleDays && !S.decide[id] && new Rng(`dyrektor-odswiez:${game.seed}:${date}:${id}`).chance(P.leave)) { delete S.people[id]; continue; }
    keep.push(id);
  }
  S.dirPool = keep;
  if (S.dirPool.length > P.max) {
    const order = S.dirPool.map((id) => S.people[id]).filter((p) => !S.decide[p.id]).sort((a, b) => (a.free ?? '').localeCompare(b.free ?? '') || b.age - a.age);
    const drop = new Set(order.slice(0, S.dirPool.length - P.max).map((p) => p.id));
    for (const id of drop) delete S.people[id];
    S.dirPool = S.dirPool.filter((id) => !drop.has(id));
  }
  for (let i = 0; S.dirPool.length < P.size && i < 40; i++) addDirectorToPool(game, S, `${date}:${i}`, date);
  S.last.dirRefresh = date;
}

/**
 * Kandydat na dyrektora klubu AI: Negocjacje z losowania wokół średniej ligi (to samo ziarno co dawna „zmiana
 * dyrektora”), wolny dyrektor z listy, gdy jego Negocjacje różnią się o najwyżej 1, inaczej nowa osoba.
 */
function pickDirector(game, S, clubId, rng, date) {
  const n = negDraw(rng, negMean(clubId));
  let best = null; let gap = Infinity;
  for (const id of S.dirPool ?? []) {
    const p = S.people[id];
    if (!p || p.club || S.decide[id] || p.age + 1 >= K.pool.noRenewAge) continue;
    const g = Math.abs((p.a?.NEG ?? p.q) - n);
    if (g <= K.director.match && (g < gap || (g === gap && p.id < best.id))) { best = p; gap = g; }
  }
  if (best) return best;
  const p = makeDirector(game, S, `nowy:${clubId}:${date}`, { neg: n });
  S.people[p.id] = p;
  return p;
}

/** Klub AI zwalnia dyrektora (odprawa) albo dyrektor odchodzi po umowie; osoba trafia na listę wolnych dyrektorów. */
function dropDirector(game, S, clubId, date, { pay = true, why = 'zmiana dyrektora' } = {}) {
  const p = directorOf(game, clubId);
  if (!p) return;
  const cost = pay ? severanceOf(p, date) : 0;
  if (cost && game.finance?.clubs?.[clubId]) book(game.finance, clubId, date, 'out', 'release', cost, `Odprawa dla dyrektora sportowego (${p.name})`);
  toPool(game, p, date, why);
  updatePay(game, clubId);
}

/** Zwolnienia trenerów klubów AI w sezonie (wpisy game.coachLog od from do to, bez odejść i zastępstw). */
function firedCoachClubs(game, from, to) {
  const out = new Set();
  for (const e of game.coachLog ?? []) if (e.date >= from && e.date < to && ['wyniki', 'kibice', 'po sezonie'].includes(e.why)) out.add(e.club);
  return out;
}

/**
 * 1 lipca (rolloverSeason przez negSeason, po zmianie lig): zmiany dyrektorów w klubach AI. Szanse jak dawniej
 * (Ekstraklasa 12 %, 1 Liga 10 %, 2 Liga 8 %, III liga 7 %, po zwolnieniu trenera albo spadku 25 %, najwyżej 3 na ligę):
 * zwolniony (odprawa) trafia na listę wolnych, klub bierze wolnego dyrektora albo nowego. Umowa kończąca się 30 czerwca:
 * przedłużenie (65+: nowy dyrektor). Zarząd nie zwalnia dyrektora klubu gracza. Wiadomość w Mediach (tylko liga gracza).
 * Zapas: game.clubNeg[klub] = { n (Negocjacje dyrektora), y, d (numer dyrektora) }.
 */
export function directorSeason(game, year, { relegated = new Set(), date = `${year}-07-01` } = {}) {
  const S = game.staff;
  if (!S) return [];
  ensureDirectors(game, date);
  S.dirYear ??= {};
  const fired = firedCoachClubs(game, `${year - 1}-07-01`, date);
  const ids = CLUBS_PL.filter((c) => game.world?.clubs?.[c.id] && c.tier <= 4).map((c) => c.id);
  const changes = new Map();
  const msgs = [];
  const end = `${year}-06-30`;
  const order = new Rng(`negSeason:${game.seed}:${year}`).shuffle(ids);
  for (const id of order) {
    if ((S.dirYear[id] ?? 0) >= year) continue;
    S.dirYear[id] = year;
    const t = tierOf(id);
    const league = `${t}:${t === 4 ? clubById(id)?.group ?? '' : ''}`;
    const rng = new Rng(`negYr:${game.seed}:${id}:${year}`);
    const p = fired.has(id) || relegated.has(id) ? NEG.shock : NEG.director[t];
    const cur = directorOf(game, id);
    game.clubNeg ??= {};
    const neg0 = game.clubNeg[id] ?? { n: cur?.a?.NEG ?? K.vacantQ.dyrektor, y: year, d: 1 };
    const change = rng.chance(p) && (changes.get(league) ?? 0) < NEG.maxChanges;
    const expiring = !!cur?.until && cur.until <= end;
    let fresh = null;
    if (!cur || change || (expiring && cur.age + 1 >= K.pool.noRenewAge)) {
      if (change) changes.set(league, (changes.get(league) ?? 0) + 1);
      if (cur) dropDirector(game, S, id, date, { pay: !expiring, why: expiring ? 'koniec umowy' : 'zmiana dyrektora' });
      fresh = pickDirector(game, S, id, new Rng(`negDir:${game.seed}:${id}:${year}`), date);
      appointDirector(game, S, fresh, id, date, { years: t === 1 ? 2 : rng.int(1, 2) });
    } else if (expiring) {
      cur.wage = Math.max(K.wage.min, r100(expectedWage(cur, date, { club: id, idle: false }) * payMul(id)));
      cur.until = `${year + (t === 1 ? 2 : rng.int(1, 2))}-06-30`;
      updatePay(game, id);
    }
    const now = directorOf(game, id);
    game.clubNeg[id] = { n: now?.a?.NEG ?? K.vacantQ.dyrektor, y: year, d: (neg0.d ?? 1) + (fresh ? 1 : 0) };
    if (fresh && id === game.clubId) msgs.push(ownerLetter(game, date, `dyrektor-zarzad:${id}:${year}`, `Zarząd zmienia dyrektora sportowego: ${fresh.name}`,
      `zarząd ${cur && !expiring ? `rozstał się z dyrektorem sportowym ${cur.name}` : cur ? `nie przedłużył umowy z dyrektorem sportowym ${cur.name}` : 'obsadził stanowisko dyrektora sportowego'}. Nowym dyrektorem sportowym jest ${fresh.name} (umowa do ${fmtDate(fresh.until)}). Atrybuty: Trening, Sztab.`));
    else if (fresh) {
      const name = clubById(id)?.name ?? id;
      msgs.push(createMessage({ date, key: `dyrektor:${id}:${year}`, category: 'media', from: 'Media', priority: 'info',
        subject: `${name}: nowy dyrektor sportowy`,
        body: `${name} ma nowego dyrektora sportowego: ${fresh.name}. To on poprowadzi rozmowy z zawodnikami w letnim oknie transferowym.` }));
    }
  }
  // Lista wolnych dyrektorów najwyżej 16: po zmianach odchodzą najdłużej wolni (zwolnieni dziś zostają)
  const P = K.director.pool;
  if (S.dirPool.length > P.max) {
    const order = S.dirPool.map((id) => S.people[id]).filter((x) => x && !S.decide[x.id] && x.free !== date).sort((a, b) => (a.free ?? '').localeCompare(b.free ?? '') || b.age - a.age);
    const drop = new Set(order.slice(0, S.dirPool.length - P.max).map((x) => x.id));
    for (const id of drop) delete S.people[id];
    S.dirPool = S.dirPool.filter((id) => !drop.has(id));
  }
  return msgs;
}

/**
 * Poniedziałek: klub AI bez dyrektora (dyrektor przeszedł do innego klubu) składa ofertę wolnemu dyrektorowi
 * (te same zasady co gracz: oferta wiąże, decyzja po 2-3 dniach). Brak kandydata: nowa osoba na liście wolnych.
 */
function aiDirectorWeek(game, date) {
  const S = game.staff;
  const out = [];
  for (const id of Object.keys(S.dirInit ?? {})) {
    if (!game.world.clubs[id] || directorOf(game, id)) continue;
    if (id === game.clubId) { // klub gracza: zarząd sam wybiera dyrektora z listy wolnych
      const r = ownerReplaceDirector(game, id, date);
      if (r.fresh) out.push(ownerLetter(game, date, `dyrektor-zarzad:${id}:${date}`, `Nowy dyrektor sportowy: ${r.fresh.name}`, `zarząd zatrudnił nowego dyrektora sportowego: ${r.fresh.name} (umowa do ${fmtDate(r.fresh.until)}). Atrybuty: Trening, Sztab.`));
      continue;
    }
    if (S.offers.some((o) => o.club === id && o.role === DIRECTOR_ROLE)) continue;
    const target = negMean(id);
    const room = budgetRoomFor(game, id, DIRECTOR_ROLE);
    let best = null; let bestScore = -Infinity;
    for (const pid of S.dirPool ?? []) {
      const p = S.people[pid];
      if (!p || p.club || S.cool[`${id}:${pid}`] > date || S.offers.filter((o) => o.pid === pid).length >= K.offer.perPerson) continue;
      const wage = aiWage(game, id, p, date);
      if (wage > room) continue;
      const seen = seenQuality(game, p, id).v;
      const score = seen - K.ai.over * Math.max(0, seen - target);
      if (score > bestScore) { bestScore = score; best = { p, wage }; }
    }
    if (!best) {
      if (S.dirPool.length >= K.director.pool.max) continue; // lista pełna: klub czeka na kolejny tydzień
      const p = makeDirector(game, S, `ai:${id}:${date}`, { neg: negDraw(new Rng(`dyrektor-ai:${game.seed}:${id}:${date}`), target), free: date });
      S.people[p.id] = p; S.dirPool.push(p.id);
      best = { p, wage: Math.min(aiWage(game, id, p, date), Math.max(K.wage.min, r100(room))) };
    }
    makeOffer(game, { pid: best.p.id, wage: best.wage, years: tierOf(id) === 1 ? 2 : 1, clubId: id, date });
  }
  return out;
}

/** List zarządu do gracza w sprawie dyrektora sportowego. */
function ownerLetter(game, date, key, subject, body) {
  return createMessage({ date, key, category: 'board', from: 'Zarząd klubu', priority: 'important', subject, body: `Panie Trenerze, ${body}\n\nZarząd klubu.` });
}

/**
 * Zarząd (właściciel) zmienia dyrektora sportowego klubu: obecny odchodzi z odprawą (z kasy klubu), nowy z listy
 * wolnych dyrektorów: najlepszy w zasięgu budżetu sztabu (z błędem oceny i losem), bez kandydata w budżecie nowa osoba
 * wokół średniej ligi. candidate: dyrektor wskazany przez gracza (prośba do zarządu): zarząd zatrudnia go z szansą
 * 75 %, gdy mieści się w budżecie. Zwraca { old, fresh, cost, candidate: 'ok' | 'budget' | 'refused' | 'gone' | null }.
 */
export function ownerReplaceDirector(game, clubId, date = game.date, { candidate = null, why = 'decyzja zarządu' } = {}) {
  const S = game.staff;
  ensureDirectors(game, date);
  const cur = directorOf(game, clubId);
  const oldWage = cur?.wage ?? 0;
  const cost = cur ? severanceOf(cur, date) : 0;
  if (cur) {
    if (cost && game.finance?.clubs?.[clubId]) book(game.finance, clubId, date, 'out', 'release', cost, `Odprawa dla dyrektora sportowego (${cur.name})`);
    seasonStats(S, game).fires++;
    toPool(game, cur, date, why);
  }
  const room = budgetRoomFor(game, clubId, DIRECTOR_ROLE);
  const wageFor = (p) => Math.max(K.wage.min, r100(expectedWage(p, date, { club: clubId, idle: false }) * payMul(clubId)));
  const rng = new Rng(`dyrektor-zarzad:${game.seed}:${clubId}:${date}`);
  const free = (S.dirPool ?? []).map((id) => S.people[id]).filter((p) => p && !p.club && p !== cur && !S.decide[p.id] && p.age + 1 < K.pool.noRenewAge);
  let fresh = null; let cand = null;
  if (candidate) {
    const c = free.find((p) => p.id === candidate);
    cand = !c ? 'gone' : wageFor(c) > Math.max(room, oldWage) ? 'budget' : rng.chance(0.75) ? 'ok' : 'refused';
    if (cand === 'ok') fresh = c;
  }
  if (!fresh) {
    let best = -Infinity;
    for (const p of free) {
      if (wageFor(p) > Math.max(room, oldWage)) continue;
      const s = seenQuality(game, p, clubId).v + rng.gauss(0, 1.5);
      if (s > best) { best = s; fresh = p; }
    }
  }
  if (!fresh) { fresh = makeDirector(game, S, `zarzad:${clubId}:${date}`, { neg: negDraw(rng, negMean(clubId)) }); S.people[fresh.id] = fresh; }
  appointDirector(game, S, fresh, clubId, date, { years: tierOf(clubId) === 1 ? 2 : rng.int(1, 2) });
  seasonStats(S, game).hires++;
  return { old: cur, fresh, cost, candidate: cand };
}

/** List od dyrektora sportowego klubu gracza (raz na klub): kim jest i w czym jest mocny. */
function directorIntro(game, date) {
  const S = game.staff;
  const p = directorOf(game, game.clubId);
  if (!p || S.dirIntro === game.clubId) return [];
  S.dirIntro = game.clubId;
  const names = { NEG: 'negocjacjach', RYN: 'znajomości rynku', SIE: 'sieci kontaktów', KAD: 'zarządzaniu kadrą i płacami' };
  const best = Object.entries(p.a ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'RYN';
  return [createMessage({
    date, key: `dyrektor-intro:${game.clubId}:${p.id}`, category: 'staff', from: `${p.name}, dyrektor sportowy`, priority: 'info',
    subject: `Dyrektor sportowy: ${p.name}`,
    body: `Dzień dobry, trenerze. Jestem dyrektorem sportowym klubu (umowa do ${fmtDate(p.until)}). Rozmowy z zawodnikami prowadzi pan sam, a ja podpowiem, przy jakiej pensji zawodnik prawdopodobnie się zgodzi, poszukam klubów dla wypożyczanych i pomogę w sporach z trenerem rezerw. Najmocniejszy jestem w ${names[best]}.\n\nSzczegóły: Trening, Sztab.`,
  })];
}

// ------------------------------------------------------------ Limity i budżet

/** Złożone oferty klubu w toku. */
const pendingOf = (S, clubId) => S.offers.filter((o) => o.club === clubId);

/** Limit sztabu: { limit, staff, pending, used, free, roles: { rola: { n, max, pending } } }. */
export function staffLimit(game, clubId = game.clubId) {
  ensureStaff(game);
  return limitInfo(game, clubId);
}

function limitInfo(game, clubId) {
  const S = game.staff;
  const limit = S?.limit?.[clubId] ?? computeLimit(game, clubId);
  const ppl = rosterOf(game, clubId);
  const pend = S ? pendingOf(S, clubId).filter((o) => o.role !== DIRECTOR_ROLE) : []; // dyrektor poza limitem osób
  const roles = {};
  for (const role of STAFF_ROLE_IDS) {
    const pp = pend.filter((o) => o.role === role).length;
    roles[role] = { n: ppl.filter((p) => p.role === role).length, max: roleCap(clubId, role), pending: pp };
  }
  return { limit, staff: ppl.length, pending: pend.length, used: ppl.length + pend.length, free: Math.max(0, limit - ppl.length - pend.length), roles };
}

/** Wolne miejsce w budżecie na ofertę w roli: wakat w roli rdzenia pozwala przekroczyć budżet o 20 % (gracz i AI). */
export function budgetRoomFor(game, clubId, role) {
  const B = staffBudget(game, clubId);
  const core = role === DIRECTOR_ROLE ? !directorOf(game, clubId) : CORE.includes(role) && !rosterOf(game, clubId).some((p) => p.role === role);
  return B.room + (core ? Math.round(B.budget * K.budget.coreVacancy) : 0);
}

/** Budżet sztabu (zł / mies.): { budget, pay, pending, room }. */
export function staffBudget(game, clubId = game.clubId) {
  const S = game.staff;
  const c = game.finance?.clubs?.[clubId];
  const pay = clubStaffPay(game, clubId);
  const base = c?.plan?.staffOn ? (c.plan.staffBase ?? pay * 12) : pay * 12;
  const o = ownerOf(game, clubId);
  const budget = Math.round(base / 12 * (K.budget.base + K.budget.wealth * ((o?.zasobnosc ?? 10) - 10)) / 100) * 100;
  const pending = S ? pendingOf(S, clubId).reduce((s, x) => s + x.wage, 0) : 0;
  return { budget, pay, pending, room: budget - pay - pending };
}

// ------------------------------------------------------------ Ocena kandydata (precyzja z asystenta klubu)

const judgeSd = (q) => (q >= 14 ? 0.5 : q >= 8 ? 1.2 : 2.2);
const precOfQ = (q) => (q >= 14 ? 'exact' : q >= 8 ? 'approx' : 'vague');

/** Jakość widziana przez klub (asystent ocenia z błędem, stałym dla pary klub-osoba). */
export function seenQuality(game, p, clubId = game.clubId) {
  const aq = game.training?.staff?.[clubId]?.asystent?.q ?? 10;
  if (p.club === clubId) return { v: p.q, lo: p.q, hi: p.q, prec: 'exact', label: staffLabel(p.q) };
  const sd = judgeSd(aq);
  const v = clamp(p.q + new Rng(`sztab-ocena:${game.seed}:${clubId}:${p.id}`).gauss(0, sd), 1, 20);
  const prec = precOfQ(aq);
  const c = Math.round(v);
  return { v: r1(v), lo: clamp(c - (prec === 'exact' ? 0 : 2), 1, 20), hi: clamp(c + (prec === 'exact' ? 0 : 2), 1, 20), prec, label: staffLabel(c) };
}

// ------------------------------------------------------------ Użyteczność oferty

/** Pozycja osoby w roli w klubie (1 = byłaby najlepsza), bez niej samej. */
function rankIn(game, clubId, p) {
  let r = 1;
  for (const x of rosterOf(game, clubId)) if (x.id !== p.id && x.role === p.role && x.q > p.q) r++;
  return r;
}

/** Ile miesięcy osoba jest bez pracy. */
const idleMonths = (p, date) => (p.club || !p.free ? 0 : Math.max(0, daysBetween(p.free, date) / 30));

/** Próg: tyle musi dać najlepsza oferta, żeby wolna osoba ją przyjęła (spada z czasem bez pracy). */
export function acceptThreshold(p, date) {
  const U = K.util;
  return U.u0 - U.u0Month * Math.min(U.u0Months, idleMonths(p, date));
}

/**
 * Użyteczność oferty dla osoby: pieniądze, prestiż klubu wobec jej poziomu, pozycja w sztabie (lider albo pomocnik),
 * długość umowy, kraj (obcokrajowiec), relacja z trenerem głównym, degradacja z lidera (zostanie w klubie) i los.
 * offer: { club, wage, years, lead }. Ta sama dla gracza i klubów AI. Zwraca { u, parts }.
 */
export function offerUtility(game, p, offer, date, rng = null) {
  const U = K.util;
  const parts = {};
  const w0 = expectedWage(p, date, { club: offer.club });
  parts.money = U.money * Math.log(Math.max(1, offer.wage) / w0);
  const club = clubById(offer.club);
  const rep = club ? clubReputation(club) : 30;
  parts.prestige = clamp(U.prestige * (rep - (U.rcel0 + U.rcelQ * p.q)), U.prestigeMin, U.prestigeMax);
  const rank = rankIn(game, offer.club, p);
  const stay = offer.club === p.club;
  const lead = stay ? rank === 1 : !!offer.lead && rank === 1;
  parts.role = lead ? U.lead : rank >= 3 ? U.third : 0;
  parts.demoted = stay && p.demoted && rank > 1 ? U.demoted : 0;
  const yrs = offer.years ?? 1;
  parts.years = p.age >= U.oldAge ? U.oldYears * (yrs - 1) : p.age <= U.youngAge && yrs > 2 ? U.youngYears * (yrs - 2) : 0;
  const t = club?.tier ?? 4;
  parts.abroad = isForeign(p) && !p.pl ? (t === 1 ? U.foreignTop : t >= 3 ? U.foreignLow : 0) : 0;
  parts.coach = p.coach && offer.club !== game.clubId && coachKey(coachOf(game, offer.club)) === p.coach ? U.coach : 0;
  parts.luck = rng ? rng.gauss(0, U.noise) : 0;
  const u = Object.values(parts).reduce((s, v) => s + v, 0);
  return { u, parts };
}

/** Odniesienie decyzji: zostanie w obecnym klubie (zatrudniony) albo próg (wolny). */
function referenceU(game, p, date, rng = null) {
  if (!p.club) return acceptThreshold(p, date);
  return offerUtility(game, p, { club: p.club, wage: p.wage, years: 1 }, date, rng).u + K.util.stay;
}

const HINT_LEVELS = {
  chetny: { word: 'Chętny', k: 'good' },
  raczej: { word: 'Raczej przyjmie', k: 'info' },
  waha: { word: 'Może się wahać', k: 'warn' },
  odmowi: { word: 'Raczej odmówi', k: 'bad' },
  odrzuci: { word: 'Odrzuci od razu', k: 'bad' },
};

/**
 * Podpowiedź akceptacji dla UI (bez ukrytych liczb): { level, word, k, reasons: [do 3 słów], weak }.
 * Z deterministycznej części użyteczności (bez losu i bez konkurencji), z przesunięciem stałym dla pary osoba i dzień
 * (ziarno sztab-hint), zależnym od precyzji asystenta klubu. Słaby asystent: tylko trzy stany.
 * args: { pid, wage, years, lead, clubId = game.clubId, date = game.date }
 */
export function offerHint(game, args = {}) {
  const S = ensureStaff(game);
  const p = S?.people?.[args.pid];
  const clubId = args.clubId ?? game.clubId;
  const date = args.date ?? game.date;
  if (!p) return null;
  const aq = game.training?.staff?.[clubId]?.asystent?.q ?? 10;
  const prec = precOfQ(aq);
  const weak = prec === 'vague';
  const w0 = expectedWage(p, date, { club: clubId });
  const wage = args.wage ?? w0;
  const lv = (key, reasons) => ({ level: key, ...HINT_LEVELS[key], reasons, weak });
  if (wage < K.offer.minShare * w0) return lv('odrzuci', ['pensja dużo poniżej jego oczekiwań']);
  const offer = { club: clubId, wage, years: args.years ?? 2, lead: args.lead ?? true };
  const { u, parts } = offerUtility(game, p, offer, date, null);
  const ref = referenceU(game, p, date, null);
  const blur = new Rng(`sztab-hint:${game.seed}:${p.id}:${date}`).gauss(0, judgeSd(aq) * 0.15);
  const d = u - ref + blur;
  let key = d >= 0.5 ? 'chetny' : d >= 0.15 ? 'raczej' : d >= -0.3 ? 'waha' : 'odmowi';
  if (weak && key === 'raczej') key = 'chetny';
  const reasons = [];
  const txt = {
    money: (v) => (v < -0.1 ? 'pensja poniżej jego oczekiwań' : v > 0.15 ? 'dobra pensja' : null),
    prestige: (v) => (v < -0.25 ? 'klub poniżej jego poziomu' : v > 0.25 ? 'klub atrakcyjny dla niego' : null),
    role: (v) => (v > 0 ? 'rola lidera mu odpowiada' : v < 0 ? 'nie chce być dalszym pomocnikiem' : null),
    years: (v) => (v > 0 ? 'woli dłuższą umowę' : v < 0 ? 'woli krótszą umowę' : null),
    abroad: (v) => (v < 0 ? 'za granicą: dalekie przeprowadzki' : v > 0 ? 'liga atrakcyjna dla obcokrajowca' : null),
    coach: (v) => (v > 0 ? 'zna twojego trenera' : null),
  };
  for (const [k2, v] of Object.entries(parts).filter(([k2]) => txt[k2]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))) {
    const t = txt[k2](v);
    if (t && reasons.length < 3) reasons.push(t);
  }
  if (p.club && p.club !== clubId) reasons.push('musi zrezygnować z obecnego klubu');
  return lv(key, reasons.slice(0, 3));
}

/** Zainteresowanie klubem (przed ofertą): { word, k, reason } z prestiżu klubu wobec poziomu osoby. */
export function clubAppeal(game, pid, clubId = game.clubId) {
  const p = game.staff?.people?.[pid];
  if (!p) return null;
  const U = K.util;
  const rep = clubReputation(clubById(clubId) ?? { rep: 30 });
  const v = clamp(U.prestige * (rep - (U.rcel0 + U.rcelQ * p.q)), U.prestigeMin, U.prestigeMax);
  return v > 0.2 ? { word: 'atrakcyjny', k: 'good', reason: 'klub wyżej niż jego poziom' } : v > -0.25 ? { word: 'w porządku', k: 'info', reason: 'klub na jego poziomie' } : { word: 'poniżej jego poziomu', k: 'warn', reason: 'liczy na lepszy klub' };
}

// ------------------------------------------------------------ Podbieranie: limity

/** Czy klub może złożyć ofertę osobie zatrudnionej w innym klubie (limity podbierania). Zwraca powód albo null. */
function poachBlocker(game, S, clubId, p, date) {
  const P = K.poach;
  if (p.since && daysBetween(p.since, date) < P.contractDays) return 'locked';
  const ban = S.poach.ban[`${clubId}:${p.id}`];
  if (ban && ban > date) return 'poachBan';
  const half = halfKeyOf(date);
  const tried = S.poach.tried[p.id];
  if (tried?.half === half && tried.n >= P.perPersonHalf && !S.decide[p.id]) return 'poachCap';
  if (clubId !== game.clubId) {
    if (p.club === game.clubId && (S.poach.userHalf[half] ?? 0) >= P.userHalf && !S.decide[p.id]) return 'poachCap';
    if (p.club !== game.clubId) {
      const st = seasonStats(S, game);
      if (st.poached.aiai >= P.aiSeason || st.poachTry.aiai >= P.aiTriesSeason) return 'poachCap';
    }
  }
  return null;
}

const poachKind = (game, from, to) => (to === game.clubId ? 'userai' : from === game.clubId ? 'aiuser' : 'aiai');

// ------------------------------------------------------------ Oferty

/**
 * Oferta klubu dla osoby (wolnej albo z innego klubu). Oferta jest wiążąca do decyzji osoby.
 * args: { pid, wage, years, lead, clubId = game.clubId, date = game.date }; lead: obietnica roli lidera
 * (domyślnie, gdy kandydat byłby najlepszy w roli). Zwraca { ok, reason, text, offer?, decideOn? }.
 */
export function makeOffer(game, args = {}) {
  const S = ensureStaff(game);
  const clubId = args.clubId ?? game.clubId;
  const date = args.date ?? game.date;
  const res = (reason, extra = {}) => ({ ok: reason === 'ok', reason, text: STAFF_REASONS[reason] ?? reason, ...extra });
  if (!S) return res('none');
  const p = S.people[args.pid];
  if (!p) return res('none');
  const years = Math.round(args.years ?? 2);
  const wage = r100(args.wage ?? expectedWage(p, date, { club: clubId }));
  const why = offerBlocker(game, S, p, clubId, date, years, wage);
  if (why === 'low') seasonStats(S, game).rejected++;
  if (why) return res(why);
  const lead = (args.lead ?? true) && rankIn(game, clubId, p) === 1; // lider tylko, gdy byłby najlepszy w roli
  const offer = { id: `so:${p.id}:${clubId}:${date}`, pid: p.id, club: clubId, role: p.role, wage, years, lead: !!lead, until: contractUntil(date, years), date };
  S.offers.push(offer);
  const st = seasonStats(S, game);
  st.offers++;
  if (!S.decide[p.id]) S.decide[p.id] = addDays(date, new Rng(`sztab-decyzja:${game.seed}:${p.id}:${date}`).int(K.offer.decide[0], K.offer.decide[1]));
  // Podbieranie: licznik prób, obecny klub zgadza się albo blokuje (gracz w poczcie, klub AI sam)
  if (p.club) {
    const half = halfKeyOf(date);
    const t = S.poach.tried[p.id];
    S.poach.tried[p.id] = t?.half === half ? { half, n: t.n + 1 } : { half, n: 1 };
    st.poachTry[poachKind(game, p.club, clubId)]++;
    if (p.club === game.clubId) S.poach.userHalf[half] = (S.poach.userHalf[half] ?? 0) + 1;
    if (!S.block[p.id]) {
      if (p.club === game.clubId) {
        S.block[p.id] = { club: p.club, blocked: true, asked: true }; // bez odpowiedzi: klub nie zgadza się
        (S.outbox ??= []).push(poachMessage(game, p, offer, date)); // do poczty z systemem dnia
      } else S.block[p.id] = { club: p.club, blocked: aiBlocks(game, p, date) };
    }
  }
  return res('ok', { offer, decideOn: S.decide[p.id] });
}

/** Powód, dla którego klub nie może złożyć oferty (klucz STAFF_REASONS), albo null. Bez zmian w stanie gry. */
function offerBlocker(game, S, p, clubId, date, years, wage) {
  if (!game.world.clubs[clubId] || !clubById(clubId)) return 'club';
  if (isDirector(p) && clubId === game.clubId) return 'dirOwner'; // dyrektora klubu gracza wybiera zarząd
  if (p.club === clubId) return 'own';
  if (p.signed && daysBetween(p.signed, date) < K.offer.lockDays) return 'locked';
  if (p.club) { const b = poachBlocker(game, S, clubId, p, date); if (b) return b; }
  if (!(years >= 1 && years <= 3) && !(years === 0 && +date.slice(5, 7) < 7)) return 'years';
  if (wage < K.offer.minShare * expectedWage(p, date, { club: clubId })) return 'low';
  const mine = S.offers.filter((o) => o.pid === p.id);
  if (mine.some((o) => o.club === clubId)) return 'dup';
  if (mine.length >= K.offer.perPerson) return 'many';
  const user = clubId === game.clubId;
  if (isDirector(p)) {
    // Dyrektor sportowy: osobny slot poza limitem osób; nowy zastępuje obecnego (odprawa przy zatrudnieniu)
    if (pendingOf(S, clubId).some((o) => o.role === DIRECTOR_ROLE)) return 'dirPending';
    const cool = S.cool[`${clubId}:${p.id}`];
    if (cool && cool > date) return 'cool';
    if (wage - (directorOf(game, clubId)?.wage ?? 0) > budgetRoomFor(game, clubId, p.role)) return 'budget';
    return null;
  }
  const maxPend = user ? K.offer.userMax : ([6, 7, 12, 1].includes(+date.slice(5, 7)) ? K.offer.aiMaxWindow : K.offer.aiMax);
  if (pendingOf(S, clubId).filter((o) => o.role !== DIRECTOR_ROLE).length >= maxPend) return 'pending';
  const L = limitInfo(game, clubId);
  const R = L.roles[p.role];
  if (!R.max) return 'role';
  if (L.used >= L.limit) return 'limit';
  if (R.n + R.pending >= R.max) return 'roleFull';
  const cool = S.cool[`${clubId}:${p.id}`];
  if (cool && cool > date) return 'cool';
  if (wage > budgetRoomFor(game, clubId, p.role)) return 'budget';
  return null;
}

/**
 * Sprawdzenie oferty bez jej składania (formularz w UI): te same warunki co makeOffer, w tej samej kolejności.
 * args: { pid, wage, years, clubId = game.clubId, date = game.date }. Zwraca { ok, reason, text }.
 */
export function checkOffer(game, args = {}) {
  const S = ensureStaff(game);
  const clubId = args.clubId ?? game.clubId;
  const date = args.date ?? game.date;
  const p = S?.people?.[args.pid];
  const reason = !p ? 'none' : offerBlocker(game, S, p, clubId, date, Math.round(args.years ?? 2), r100(args.wage ?? expectedWage(p, date, { club: clubId }))) ?? 'ok';
  return { ok: reason === 'ok', reason, text: STAFF_REASONS[reason] ?? reason };
}

/** Klub AI blokuje odejście ważnej osoby (lider bez zastępcy w roli) częściej niż pomocnika. */
function aiBlocks(game, p, date) {
  const others = rosterOf(game, p.club).filter((x) => x.id !== p.id && x.role === p.role);
  const important = rankIn(game, p.club, p) === 1 && !others.some((x) => x.q >= p.q - 2);
  return new Rng(`sztab-blok:${game.seed}:${p.id}:${date}`).chance(important ? K.poach.blockImportant : K.poach.blockOther);
}

function poachMessage(game, p, offer, date) {
  const decideOn = game.staff.decide[p.id];
  return createMessage({
    date, key: `sztab-podbieranie:${p.id}:${decideOn}`, category: 'staff', from: 'Kierownik drużyny', priority: 'important', optional: true,
    subject: `${nameOf(offer.club)} chce zatrudnić: ${p.name}`,
    body: `${nameOf(offer.club)} złożył ofertę naszemu członkowi sztabu (${lower(roleName(p.role))}, ${p.name}). Decyzję podejmie do ${fmtDate(decideOn)}.\n\nZgoda: jeśli przyjmie ofertę, odejdzie, a klub dostanie rekompensatę ${fmtZlM(poachCompensation(p))}.\nBlokada: zwykle zostanie, ale może zerwać umowę; wtedy ${nameOf(offer.club)} zapłaci karę (co najmniej ${fmtZlM(poachCompensation(p))}). Bez odpowiedzi klub blokuje odejście.`,
    actions: [{ id: 'agree', label: 'Zgoda na odejście' }, { id: 'block', label: 'Blokuję odejście' }],
    refs: { kind: 'staffPoach', pid: p.id },
  });
}

registerDecision('staffPoach', (game, m, action) => {
  const S = game.staff; const pid = m.refs?.pid;
  const b = S?.block?.[pid];
  if (!b || b.club !== game.clubId) return [];
  b.blocked = action !== 'agree'; b.asked = false;
  return [];
});

/** Oferty w toku klubu: [{ offer, person, decideOn, offers }]. */
export function pendingOffers(game, clubId = game.clubId) {
  const S = ensureStaff(game);
  if (!S) return [];
  return pendingOf(S, clubId).map((o) => ({ offer: o, person: S.people[o.pid], decideOn: S.decide[o.pid] ?? null, offers: S.offers.filter((x) => x.pid === o.pid).length }));
}

// ------------------------------------------------------------ Zatrudnienie, zwolnienie, przedłużenie

function joinClub(game, p, clubId, { wage, until, date, why = 'zatrudnienie', coach = null, lead = true }) {
  const S = game.staff; const st = seasonStats(S, game);
  if (p.club) closeHist(p, date, why);
  S.pool = S.pool.filter((id) => id !== p.id);
  if (isDirector(p)) {
    // Dyrektor sportowy: nowy zastępuje obecnego (odprawa jak przy zwolnieniu, poprzedni na listę wolnych)
    S.dirPool = (S.dirPool ?? []).filter((id) => id !== p.id);
    const old = directorOf(game, clubId);
    if (old && old !== p) {
      const cost = severanceOf(old, date);
      if (game.finance?.clubs?.[clubId] && cost) book(game.finance, clubId, date, 'out', 'release', cost, `Odprawa dla dyrektora sportowego (${old.name})`);
      st.fires++;
      toPool(game, old, date, 'zmiana dyrektora');
    }
    Object.assign(p, { club: clubId, wage, until, since: date, free: null, signed: date, coach: null, lead: true, demoted: null });
    const pen = p.pl ? 0 : adaptPenalty(p.nat);
    p.adapt = pen ? { to: addDays(date, K.adapt.days), pen } : null;
    p.pl = true;
    (S.dir ??= {})[clubId] = p.id;
    st.hires++;
    updatePay(game, clubId);
    return;
  }
  // Obietnica roli lidera: dotychczasowy lider słabszy od nowej osoby zostaje pomocnikiem (niezadowolony)
  if (lead) {
    for (const x of rosterOf(game, clubId)) {
      if (x.role !== p.role || x.q >= p.q || !x.lead) continue;
      x.lead = false; x.demoted = date; st.demoted++;
    }
  }
  Object.assign(p, { club: clubId, wage, until, since: date, free: null, signed: date, coach, lead: !!lead, demoted: null });
  const pen = p.pl ? 0 : adaptPenalty(p.nat);
  p.adapt = pen ? { to: addDays(date, K.adapt.days), pen } : null;
  p.pl = true; // kolejna praca w Polsce bez ponownej adaptacji
  (S.clubs[clubId] ??= []).push(p.id);
  st.hires++; st.byTier[tierOf(clubId)]++;
  if (isForeign(p)) st.foreign++;
  syncStaff(game, clubId, date); updatePay(game, clubId);
}

/**
 * Zwolnienie członka sztabu: odprawa (pozostałe pełne miesiące, od 2 do 6 pensji), osoba wraca na listę wolnych.
 * Zwraca { ok, reason, text, cost }.
 */
export function fireStaff(game, pid, { date = game.date, clubId = game.clubId, why = 'zwolnienie' } = {}) {
  const S = ensureStaff(game);
  const p = S?.people?.[pid];
  if (!p) return { ok: false, reason: 'none', text: STAFF_REASONS.none, cost: 0 };
  if (p.club !== clubId) return { ok: false, reason: 'notMine', text: STAFF_REASONS.notMine, cost: 0 };
  // Dyrektor sportowy klubu gracza: decyduje zarząd (prośba w Klub, Zarząd), trener go nie zwalnia
  if (isDirector(p) && clubId === game.clubId) return { ok: false, reason: 'dirOwner', text: STAFF_REASONS.dirOwner, cost: 0 };
  const cost = severanceOf(p, date);
  if (game.finance?.clubs?.[clubId] && cost) book(game.finance, clubId, date, 'out', 'release', cost, `Odprawa dla członka sztabu (${p.name})`);
  seasonStats(S, game).fires++;
  toPool(game, p, date, why);
  return { ok: true, reason: 'ok', text: `${p.name} odchodzi ze sztabu. Odprawa: ${fmtZlM(cost)}.`, cost };
}

/** Czy można już przedłużyć umowę (od 1 stycznia ostatniego roku kontraktu). */
export function canRenew(p, date) {
  return !!p?.club && !!p.until && date >= `${+p.until.slice(0, 4)}-01-01` && date <= p.until;
}

/**
 * Przedłużenie umowy członka sztabu klubu: osoba zgadza się, gdy oferta daje co najmniej próg (bez okresu bez pracy).
 * Zdegradowany lider zgadza się trudniej. args: { pid, wage, years, clubId = game.clubId, date = game.date }.
 * Zwraca { ok, reason, text }.
 */
export function renewStaff(game, args = {}) {
  const S = ensureStaff(game);
  const clubId = args.clubId ?? game.clubId;
  const date = args.date ?? game.date;
  const p = S?.people?.[args.pid];
  const res = (reason, text = STAFF_REASONS[reason]) => ({ ok: reason === 'ok', reason, text });
  if (!p) return res('none');
  if (p.club !== clubId) return res('notMine');
  if (isDirector(p) && clubId === game.clubId) return res('dirOwner'); // umowę dyrektora przedłuża zarząd (1 lipca)
  if (!canRenew(p, date)) return res('early');
  const cool = S.cool[`${clubId}:${p.id}:renew`];
  if (cool && cool > date) return res('cool');
  const years = clamp(Math.round(args.years ?? 1), 1, 3);
  const wage = r100(args.wage ?? expectedWage(p, date, { club: clubId }));
  if (wage - p.wage > staffBudget(game, clubId).room) return res('budget');
  if (p.age >= K.pool.noRenewAge) return res('refused', `${p.name} kończy pracę w zawodzie po sezonie.`);
  const rng = new Rng(`sztab-przedluz:${game.seed}:${p.id}:${date}`);
  const { u } = offerUtility(game, p, { club: clubId, wage, years }, date, rng);
  if (u + K.util.stay < K.util.u0) {
    S.cool[`${clubId}:${p.id}:renew`] = addDays(date, K.offer.cool);
    return res('refused');
  }
  p.wage = wage; p.until = `${+p.until.slice(0, 4) + years}-06-30`;
  seasonStats(S, game).renewed++;
  updatePay(game, clubId);
  return res('ok', `${p.name} przedłuża umowę do ${fmtDate(p.until)} (${fmtZlM(wage)} miesięcznie).`);
}

// ------------------------------------------------------------ Decyzje osób (dzień decyzji)

/** Dzień decyzji: każda osoba z datą decyzji wybiera najlepszą ofertę albo zostaje (w klubie albo na liście wolnych). */
export function decideDay(game, date) {
  const S = game.staff;
  const messages = [];
  const due = Object.entries(S.decide).filter(([, d]) => d <= date).map(([pid]) => pid).sort();
  for (const pid of due) {
    const p = S.people[pid];
    const offers = S.offers.filter((o) => o.pid === pid);
    delete S.decide[pid];
    S.offers = S.offers.filter((o) => o.pid !== pid);
    const block = S.block[pid]; delete S.block[pid];
    if (!p || !offers.length) continue;
    const st = seasonStats(S, game);
    const scored = offers.filter((o) => game.world.clubs[o.club] && o.club !== p.club).map((o) => {
      const rng = new Rng(`sztab-wybor:${game.seed}:${pid}:${date}:${o.club}`);
      return { o, ...offerUtility(game, p, o, date, rng) };
    }).sort((a, b) => b.u - a.u || b.o.wage - a.o.wage || a.o.club.localeCompare(b.o.club));
    const from = p.club;
    const ref = referenceU(game, p, date, from ? new Rng(`sztab-wybor:${game.seed}:${pid}:${date}:${from}`) : null);
    const best = scored[0];
    const userOffer = offers.find((o) => o.club === game.clubId);
    const wants = !!best && best.u >= ref;
    let moved = false;
    if (wants && from) {
      const o = best.o;
      const kind = poachKind(game, from, o.club);
      const blocked = block?.club === from ? block.blocked : false;
      let money = poachCompensation(p); let broke = false;
      if (blocked) {
        // Blokada: osoba zrywa umowę zależnie od motywacji i losu; klub, który podbiera, płaci karę
        st.blocked++;
        const rng = new Rng(`sztab-zerwanie:${game.seed}:${pid}:${date}`);
        const pBreak = clamp(K.poach.breakBase + K.poach.breakPerU * (best.u - ref), K.poach.breakMin, K.poach.breakMax);
        broke = rng.chance(pBreak);
        if (broke) money = Math.round(poachCompensation(p) * (1 + rng.next() * K.poach.penaltyExtra));
      }
      if (!blocked || broke) {
        const why = broke ? 'zerwanie umowy' : `przejście do ${nameOf(o.club)}`;
        const label = broke ? `Kara za zerwanie umowy przez członka sztabu (${p.name})` : `Rekompensata za członka sztabu (${p.name})`;
        if (game.finance?.clubs?.[o.club]) book(game.finance, o.club, date, 'out', 'staffComp', money, label);
        if (game.finance?.clubs?.[from]) book(game.finance, from, date, 'in', 'staffComp', money, label);
        st.poached[kind]++; if (broke) st.broke++;
        detach(S, p, from);
        joinClub(game, p, o.club, { wage: o.wage, until: o.until, date, why, lead: o.lead });
        syncStaff(game, from, date); updatePay(game, from);
        moved = true;
        if (from === game.clubId) {
          messages.push(msg(date, `sztab-odchodzi:${pid}:${date}`, 'important', `${p.name} odchodzi do ${nameOf(o.club)}`,
            broke ? `${p.name} (${lower(roleName(p.role))}) zerwał umowę mimo naszej blokady i przechodzi do ${nameOf(o.club)}. Klub otrzymuje karę ${fmtZlM(money)}.`
              : `${p.name} (${lower(roleName(p.role))}) przyjął ofertę klubu ${nameOf(o.club)}. Klub otrzymuje rekompensatę ${fmtZlM(money)}.`));
        }
        if (o.club === game.clubId) {
          messages.push(msg(date, `sztab-decyzja:${pid}:${date}`, 'important', `${p.name} przyjmuje ofertę`,
            `${p.name} przyjmuje ofertę: ${lower(roleName(p.role))} do ${fmtDate(o.until)}, ${fmtZlM(o.wage)} miesięcznie. ${broke ? `Zerwał umowę z klubem ${nameOf(from)}: płacimy karę ${fmtZlM(money)}.` : `Rekompensata dla klubu ${nameOf(from)}: ${fmtZlM(money)}.`}${p.adapt ? ' Przez pierwsze 3 miesiące będzie się aklimatyzował i pracował nieco słabiej.' : ''}`));
        }
      } else {
        S.poach.ban[`${o.club}:${pid}`] = addDays(date, K.poach.ban);
        if (from === game.clubId) messages.push(msg(date, `sztab-zostaje:${pid}:${date}`, 'info', `${p.name} zostaje w klubie`, `${p.name} chciał przejść do ${nameOf(o.club)}, ale po naszej blokadzie zostaje w sztabie.`));
        if (o.club === game.clubId) messages.push(msg(date, `sztab-decyzja:${pid}:${date}`, 'info', `${p.name} zostaje w obecnym klubie`, `${p.name} chciał przyjąć naszą ofertę, ale ${nameOf(from)} zablokował odejście, a on nie zerwał umowy. Kolejna próba możliwa za 12 miesięcy.`));
      }
    } else if (wants) {
      const o = best.o;
      joinClub(game, p, o.club, { wage: o.wage, until: o.until, date, lead: o.lead });
      moved = true;
      if (o.club === game.clubId) messages.push(msg(date, `sztab-decyzja:${pid}:${date}`, 'important', `${p.name} przyjmuje ofertę`, `${p.name} przyjmuje ofertę: ${lower(roleName(p.role))}${isDirector(p) ? '' :` (${o.lead ? 'lider w roli' : 'pomocnik'})`} do ${fmtDate(o.until)}, ${fmtZlM(o.wage)} miesięcznie.${p.adapt ? ' Przez pierwsze 3 miesiące będzie się aklimatyzował i pracował nieco słabiej.' : ''}`));
    }
    if (moved) {
      if (userOffer && best.o.club !== game.clubId) messages.push(msg(date, `sztab-decyzja:${pid}:${date}`, 'info', `${p.name} wybrał inny klub`, `${p.name} wybrał ofertę klubu ${nameOf(best.o.club)}.`));
      for (const x of offers) if (x.club !== best.o.club) S.cool[`${x.club}:${pid}`] = addDays(date, K.offer.cool);
    } else {
      for (const x of offers) {
        S.cool[`${x.club}:${pid}`] = addDays(date, K.offer.cool);
        if (from) S.poach.ban[`${x.club}:${pid}`] = addDays(date, K.poach.ban); // nieudana próba podebrania
      }
      if (userOffer && !wants) {
        const mine = scored.find((x) => x.o === userOffer);
        const hint = mine && mine.parts.money < mine.parts.prestige ? 'oczekiwał wyższej pensji' : 'chce pracować w klubie wyżej w hierarchii';
        messages.push(msg(date, `sztab-decyzja:${pid}:${date}`, 'info', `${p.name} odrzuca ofertę`, from ? `${p.name} zostaje w klubie ${nameOf(from)}. Kolejna próba możliwa za 12 miesięcy.` : `${p.name} nie przyjął żadnej oferty (${hint}). Ponowna oferta możliwa za ${K.offer.cool} dni.`));
      }
      if (from === game.clubId && !wants) messages.push(msg(date, `sztab-zostaje:${pid}:${date}`, 'info', `${p.name} zostaje w klubie`, `${p.name} odrzucił ofertę innego klubu i zostaje w naszym sztabie.`));
    }
    if (from === game.clubId) game.inbox = (game.inbox ?? []).map((m) => (m.refs?.kind === 'staffPoach' && m.refs.pid === pid && !m.resolved ? { ...m, resolved: true } : m));
  }
  // Porządki: przerwy po odmowie i blokady prób, które minęły
  for (const [k, d] of Object.entries(S.cool)) if (d <= date) delete S.cool[k];
  for (const [k, d] of Object.entries(S.poach.ban)) if (d <= date) delete S.poach.ban[k];
  return messages;
}

const msg = (date, key, priority, subject, body) => createMessage({ date, key, category: 'staff', from: 'Kierownik drużyny', priority, subject, body });

// ------------------------------------------------------------ Kluby AI

/** Docelowa jakość sztabu klubu AI (poziom klubu, ambicja właściciela). */
function aiTarget(game, clubId) {
  return typicalQ(clubId) + 0.1 * ((ownerOf(game, clubId)?.ambicja ?? 10) - 10);
}

/** Pensja oferty klubu AI: oczekiwania, płacowość i zasobność właściciela. */
function aiWage(game, clubId, p, date) {
  const w0 = expectedWage(p, date, { club: clubId });
  const pay = Number(payLevel(clubById(clubId) ?? clubId)) || 1;
  const z = ownerOf(game, clubId)?.zasobnosc ?? 10;
  return r100(clamp(w0 * (0.9 + 0.1 * pay) * (1 + 0.01 * (z - 10)), 0.85 * w0, 1.3 * w0));
}

/** Indeks kandydatów na tydzień: wolni i zatrudnieni według roli. */
function buildIndex(game, date) {
  const S = game.staff;
  const free = {}; const employed = {};
  const nOff = {};
  for (const o of S.offers) nOff[o.pid] = (nOff[o.pid] ?? 0) + 1;
  for (const p of Object.values(S.people)) {
    if (isDirector(p) || (nOff[p.id] ?? 0) >= K.offer.perPerson) continue; // dyrektorzy: aiDirectorWeek
    if (p.signed && daysBetween(p.signed, date) < K.offer.lockDays) continue;
    (p.club ? employed : free)[p.role] ??= [];
    (p.club ? employed : free)[p.role].push(p);
  }
  return { free, employed };
}

/** Potrzeba klubu AI: { role, minQ } albo null. */
function aiNeed(game, clubId, target) {
  const L = limitInfo(game, clubId);
  if (L.used >= L.limit) return null;
  const view = game.training?.staff?.[clubId] ?? {};
  // Słaby lider w roli rdzenia: lepszy kandydat zostaje liderem, dotychczasowy pomaga (jeśli rola ma miejsce)
  for (const role of ['asystent', 'fizyczny', 'bramkarze', 'kierownik']) {
    const R = L.roles[role];
    if (R.n && R.n + R.pending < R.max && (view[role]?.q ?? 10) < target - K.ai.weak) return { role, minQ: Math.round(view[role].q) + 2 };
  }
  for (const { role, k } of staffPlan(clubId, L.limit)) {
    const R = L.roles[role];
    if (R.n + R.pending >= k || R.n + R.pending >= R.max) continue;
    return { role, minQ: k > 1 ? K.ai.helperMinQ : 1, helper: k > 1 };
  }
  return null;
}

const CORE = ['asystent', 'fizyczny', 'bramkarze', 'kierownik'];

/**
 * Klub AI z wakatem w roli rdzenia i pełnym sztabem robi miejsce: zwalnia osobę najmniej potrzebną (pomocnika albo rolę
 * spoza rdzenia, najdalej w planie sztabu), z odprawą. Gracz robi to sam (fireStaff).
 */
function aiMakeRoom(game, clubId, date) {
  const L = limitInfo(game, clubId);
  if (L.used < L.limit || !CORE.some((r) => !L.roles[r].n && !L.roles[r].pending && L.roles[r].max)) return;
  const ppl = rosterOf(game, clubId);
  const pos = new Map();
  const byRole = {};
  for (const p of [...ppl].sort((a, b) => b.q - a.q)) (byRole[p.role] ??= []).push(p);
  staffPlan(clubId, 99).forEach(({ role, k }, i) => { const x = byRole[role]?.[k - 1]; if (x) pos.set(x.id, i); });
  // Ofiara: osoba poza planem w limicie (dalekie miejsce), rola spoza rdzenia albo pomocnik; najpierw najdalej w planie
  const planned = new Map(staffPlan(clubId, L.limit).map(({ role, k }) => [`${role}:${k}`, true]));
  const victim = ppl.filter((p) => !CORE.includes(p.role) || byRole[p.role]?.[0] !== p || !planned.has(`${p.role}:1`))
    .sort((a, b) => (pos.get(b.id) ?? 99) - (pos.get(a.id) ?? 99) || a.q - b.q)[0];
  if (!victim) return;
  const cost = severanceOf(victim, date);
  if (game.finance?.clubs?.[clubId] && cost) book(game.finance, clubId, date, 'out', 'release', cost, `Odprawa dla członka sztabu (${victim.name})`);
  seasonStats(game.staff, game).fires++;
  toPool(game, victim, date, 'zmiany w sztabie');
}

/** Przegląd sztabu klubu AI: najwyżej jedna oferta. */
function aiReview(game, clubId, date, index) {
  const S = game.staff; const P = K.poach;
  aiMakeRoom(game, clubId, date);
  const target = aiTarget(game, clubId);
  const need = aiNeed(game, clubId, target);
  if (!need) return null;
  const room = budgetRoomFor(game, clubId, need.role);
  const repMe = clubReputation(clubById(clubId));
  const leadQ = game.training?.staff?.[clubId]?.[need.role]?.vacant ? 0 : rosterOf(game, clubId).filter((x) => x.role === need.role).reduce((m, x) => Math.max(m, x.q), 0);
  const cands = [];
  for (const p of index.free[need.role] ?? []) cands.push({ p, poach: false });
  // Podbieranie: rzadko, tylko z wyraźnym zyskiem (dużo większy klub, rola lidera, wyższa pensja) i w okolicach okien
  const st = seasonStats(S, game);
  if (P.months.includes(+date.slice(5, 7)) && !need.helper && st.poached.aiai < P.aiSeason) {
    for (const p of index.employed[need.role] ?? []) {
      if (p.club === clubId || !p.club) continue;
      const c = clubById(p.club);
      if (!c || clubReputation(c) > repMe - P.aiRepGap) continue;
      if (poachBlocker(game, S, clubId, p, date)) continue;
      cands.push({ p, poach: true });
    }
  }
  let best = null; let bestScore = -Infinity;
  for (const { p, poach } of cands) {
    if (S.cool[`${clubId}:${p.id}`] > date) continue;
    if (p.role === 'kierownik' && isForeign(p)) continue;
    const seen = seenQuality(game, p, clubId).v;
    if (seen < need.minQ) continue;
    let wage = aiWage(game, clubId, p, date);
    if (poach) {
      if (seen < target || seen <= leadQ) continue; // podbiera się tylko na lidera i na poziomie klubu
      wage = Math.max(wage, r100(p.wage * P.aiWageGain));
    }
    if (wage > room) continue;
    const score = seen - K.ai.over * Math.max(0, seen - target) - (poach ? 1 : 0) + (isForeign(p) && !p.pl && tierOf(clubId) >= 3 ? -1 : 0);
    if (score > bestScore) { bestScore = score; best = { p, wage }; }
  }
  if (!best) return null;
  const years = tierOf(clubId) === 1 ? 2 : new Rng(`sztab-ai-lata:${game.seed}:${clubId}:${date}`).int(1, 2);
  return makeOffer(game, { pid: best.p.id, wage: best.wage, years, clubId, date });
}

/** Poniedziałek: przegląd części klubów AI (każdy klub raz na 4 tygodnie, w okresach zmian co tydzień). */
export function aiStaffWeek(game, date) {
  const S = game.staff;
  const m = +date.slice(5, 7);
  const n = K.ai.windowMonths.includes(m) ? K.ai.windowBuckets : K.ai.buckets;
  const week = Math.floor(daysBetween('2026-06-29', date) / 7);
  let index = null;
  for (const clubId of Object.keys(S.clubs)) {
    if (clubId === game.clubId || !game.world.clubs[clubId]) continue;
    if ((hashString(clubId) + week) % n !== 0) continue;
    index ??= buildIndex(game, date);
    const r = aiReview(game, clubId, date, index);
    if (r?.ok) {
      // Osoba znika z indeksu, gdy rozważa już najwięcej ofert albo jest zatrudniona (limit prób na pół sezonu)
      const p = S.people[r.offer.pid];
      if (p.club || S.offers.filter((o) => o.pid === p.id).length >= K.offer.perPerson) {
        const list = (p.club ? index.employed : index.free)[p.role];
        const i = list ? list.indexOf(p) : -1;
        if (i >= 0) list.splice(i, 1);
      }
    }
  }
  return [];
}

/** 1 czerwca: przedłużenia w klubach AI (bez słabych pomocników, ponad limitem i w wieku 65+). */
export function aiRenewals(game, date) {
  const S = game.staff;
  const end = `${date.slice(0, 4)}-06-30`;
  for (const clubId of Object.keys(S.clubs)) {
    if (clubId === game.clubId || !game.world.clubs[clubId]) continue;
    const ppl = rosterOf(game, clubId);
    const limit = S.limit[clubId] ?? computeLimit(game, clubId);
    const target = aiTarget(game, clubId);
    // Kolejność ważności: miejsca planu (lider roli przed pomocnikiem, lepszy przed słabszym)
    const order = [];
    const byRole = {};
    for (const p of [...ppl].sort((a, b) => b.q - a.q)) (byRole[p.role] ??= []).push(p);
    const seen = {};
    for (const { role, k } of staffPlan(clubId, 99)) { const x = byRole[role]?.[k - 1]; if (x) { order.push(x); seen[x.id] = true; } }
    for (const p of ppl) if (!seen[p.id]) order.push(p);
    const renew = (p) => {
      const wage = aiWage(game, clubId, p, date);
      const years = tierOf(clubId) === 1 ? 2 : 1;
      const rng = new Rng(`sztab-przedluz:${game.seed}:${p.id}:${date}`);
      const { u } = offerUtility(game, p, { club: clubId, wage, years }, date, rng);
      if (u + K.util.stay < K.util.u0) return false;
      p.wage = wage; p.until = `${+end.slice(0, 4) + years}-06-30`;
      seasonStats(S, game).renewed++;
      return true;
    };
    order.forEach((p, i) => {
      if (p.until !== end) return;
      const helper = rankIn(game, clubId, p) > 1;
      if (i >= limit || p.age >= K.pool.noRenewAge || (helper && p.q < K.ai.helperMinQ) || !roleCap(clubId, p.role)) return;
      if (!helper && p.q < target - K.ai.weak && CORE.includes(p.role)) return; // słaby lider: klub szuka lepszego
      renew(p);
    });
    // Minimum ligi (III liga od 4 osób): gdy po wygaśnięciu umów zostałoby mniej osób, klub przedłuża kolejne
    // (w kolejności planu, także słabszych), żeby od 1 lipca nie zejść poniżej minimum bez zastępstwa
    const min = K.limit.MIN[tierOf(clubId)];
    let left = ppl.filter((p) => p.until && p.until > end).length;
    for (const p of order) {
      if (left >= min) break;
      if (p.until !== end || p.age >= K.pool.noRenewAge || !roleCap(clubId, p.role)) continue;
      if (renew(p)) left++;
    }
    updatePay(game, clubId);
  }
}

/**
 * Nowy trener klubu AI: asystenci poprzedniego trenera (z nim przyszli) odchodzą z szansą 60 %, a nowy trener
 * przywozi swojego asystenta z szansą zależną od ligi (z listy wolnych albo spoza niej).
 */
export function staffOnCoachHire(game, clubId, coach, date) {
  const S = game.staff;
  if (!S?.clubs?.[clubId] || clubId === game.clubId || !coach) return;
  const A = K.ai;
  const rng = new Rng(`sztab-przywoz:${game.seed}:${clubId}:${date}`);
  const ck = coachKey(coach);
  for (const p of rosterOf(game, clubId)) {
    if (!p.coach || p.coach === ck || !rng.chance(A.coachLeave)) continue;
    const cost = severanceOf(p, date);
    if (game.finance?.clubs?.[clubId] && cost) book(game.finance, clubId, date, 'out', 'release', cost, `Odprawa dla członka sztabu (${p.name})`);
    seasonStats(S, game).fires++;
    toPool(game, p, date, 'odejście z trenerem');
  }
  if (!rng.chance(A.coachBring[tierOf(clubId)] ?? 0)) return;
  const target = aiTarget(game, clubId);
  const nat = coach.nat && coach.nat !== 'POL' ? coach.nat : null;
  const pool = S.pool.map((id) => S.people[id]).filter((p) => p && p.role === 'asystent' && p.q >= target - 1 && p.q <= target + 2 && !S.decide[p.id]);
  const byQ = (a, b) => b.q - a.q || a.id.localeCompare(b.id);
  let p = pool.filter((x) => !nat || x.nat === nat).sort(byQ)[0] ?? (nat ? null : pool.sort(byQ)[0]);
  if (!p) {
    p = makePerson(game, S, `przywoz:${clubId}:${date}`, { role: 'asystent', mean: target, nat: nat ?? 'POL' });
    S.people[p.id] = p;
  }
  // Miejsce w roli i limicie: najsłabszy asystent odchodzi, gdy brak miejsca
  const L = limitInfo(game, clubId);
  if (L.roles.asystent.n >= L.roles.asystent.max || L.staff >= L.limit) {
    const weakest = rosterOf(game, clubId).filter((x) => x.role === 'asystent').sort((a, b) => a.q - b.q)[0];
    if (weakest) {
      const cost = severanceOf(weakest, date);
      if (game.finance?.clubs?.[clubId] && cost) book(game.finance, clubId, date, 'out', 'release', cost, `Odprawa dla członka sztabu (${weakest.name})`);
      seasonStats(S, game).fires++;
      toPool(game, weakest, date, 'zmiana trenera');
    }
  }
  S.offers = S.offers.filter((o) => o.pid !== p.id); delete S.decide[p.id];
  const wage = aiWage(game, clubId, p, date);
  seasonStats(S, game).brought++;
  joinClub(game, p, clubId, { wage, until: contractUntil(date, tierOf(clubId) === 1 ? 2 : 1), date, coach: ck, lead: true });
}

// ------------------------------------------------------------ Lista wolnych: odświeżanie i nowy sezon

/** 1 lipca i 1 stycznia: część wolnych od 60+ dni odchodzi (25 %), lista wraca do ok. 100 osób. */
export function refreshPool(game, date) {
  const S = game.staff; const P = K.pool;
  const st = seasonStats(S, game);
  const keep = [];
  for (const id of S.pool) {
    const p = S.people[id];
    if (!p) continue;
    const idle = p.free ? daysBetween(p.free, date) : 999;
    if (idle >= P.idleDays && !S.decide[id]) {
      const chance = P.leave + (idle > 365 ? P.leaveLong : 0) + (p.age >= P.oldAge ? P.leaveOld : 0);
      if (new Rng(`sztab-odswiez:${game.seed}:${date}:${id}`).chance(chance)) { st.gone++; delete S.people[id]; continue; }
    }
    keep.push(id);
  }
  S.pool = keep;
  // Twardy limit: nadwyżka odchodzi od najdłużej wolnych i najstarszych (świeżo wolni i rozważający oferty zostają)
  if (S.pool.length > P.cap) {
    const order = S.pool.map((id) => S.people[id]).filter((p) => !S.decide[p.id] && (!p.free || daysBetween(p.free, date) >= P.idleDays)).sort((a, b) => (a.free ?? '').localeCompare(b.free ?? '') || b.age - a.age);
    const drop = new Set(order.slice(0, S.pool.length - P.cap).map((p) => p.id));
    for (const id of drop) { delete S.people[id]; st.gone++; }
    S.pool = S.pool.filter((id) => !drop.has(id));
  }
  let i = 0;
  while (S.pool.length < P.size) addPoolPerson(game, S, `${date}:${i++}`, date);
  S.last.refresh = date;
}

/** Nowy sezon (pierwsze wywołanie po rollover): wygasłe kontrakty do puli, wiek, rozwój, emerytury, limity. */
export function staffNewSeason(game, date) {
  const S = game.staff; const P = K.pool; const D = K.dev;
  const y = seasonYear(game);
  S.year = y;
  const st = seasonStats(S, game);
  for (const p of Object.values(S.people)) {
    p.age = (p.age ?? 45) + 1;
    const rng = new Rng(`sztab-rozwoj:${game.seed}:${p.id}:${y}`);
    // Rozwój i spadek: zmiana atrybutów (razem 3 punkty, czyli jakość o 1 jak dotąd): jeden obszar o 2, drugi o 1
    const step = p.age <= D.upAge && rng.chance(D.up) ? 1 : p.age >= D.downAge && rng.chance(D.down) ? -1 : 0;
    if (step) {
      ensurePersonAttrs(p, `${game.seed}:${p.id}`);
      const keys = roleAttrKeys(p.role).filter((k) => (step > 0 ? p.a[k] < 20 : p.a[k] > 1));
      const order = keys.map((k) => [k, rng.next()]).sort((x, y) => x[1] - y[1]).map((x) => x[0]);
      if (order[0]) p.a[order[0]] = clamp(p.a[order[0]] + 2 * step, 1, 20);
      if (order[1]) p.a[order[1]] = clamp(p.a[order[1]] + step, 1, 20);
      p.q = order.length ? qFromAttrs(p.a) : clamp(p.q + step, 1, 20);
    }
    if (p.club && p.until && p.until < date) { st.expired++; toPool(game, p, date, 'koniec umowy'); }
    if (p.age >= P.retire && !p.club) { st.retired++; removePerson(S, p); }
  }
  for (const id of Object.keys(S.clubs)) {
    if (!game.world.clubs[id]) continue;
    S.limit[id] = computeLimit(game, id);
    syncStaff(game, id, date); updatePay(game, id);
  }
  S.poach.tried = {};
  // Statystyki: najwyżej 10 sezonów
  const ys = Object.keys(S.stats).sort();
  for (const k of ys.slice(0, Math.max(0, ys.length - 10))) delete S.stats[k];
  for (const k of Object.keys(S.poach.userHalf)) if (+k.slice(0, 4) < y - 1) delete S.poach.userHalf[k];
}

/** Koniec adaptacji obcokrajowców: widok klubów z adaptującymi się osobami liczony codziennie (kilka klubów). */
function adaptationDay(game, date) {
  const S = game.staff;
  for (const id of [...S.adapting]) {
    if (!S.clubs[id]) { S.adapting = S.adapting.filter((x) => x !== id); continue; }
    for (const p of rosterOf(game, id)) if (p.adapt && date >= p.adapt.to) p.adapt = null;
    syncStaff(game, id, date);
  }
}

/** 1 maja: kończące się kontrakty sztabu gracza (akcje w poczcie, nie zatrzymują dni). */
function expiringNotice(game, date) {
  const end = `${date.slice(0, 4)}-06-30`;
  return rosterOf(game, game.clubId).filter((p) => p.until === end).map((p) => { // dyrektor sportowy: umowę przedłuża zarząd
    const w = expectedWage(p, date, { club: game.clubId });
    return createMessage({
      date, key: `sztab-koniec:${p.id}:${end}`, category: 'staff', from: 'Kierownik drużyny', priority: 'info', optional: true,
      subject: `Kończy się umowa: ${p.name}`,
      body: `Umowa ${p.name} (${lower(roleName(p.role))}, jakość ${p.q}) kończy się ${fmtDate(end)}. Oczekuje ok. ${fmtZlM(w)} miesięcznie (teraz ${fmtZlM(p.wage)}). Bez przedłużenia odejdzie 1 lipca.`,
      actions: [{ id: 'y1', label: 'Przedłuż o rok' }, { id: 'y2', label: 'Przedłuż o 2 lata' }, { id: 'no', label: 'Nie przedłużaj' }],
      refs: { kind: 'staffRenew', pid: p.id },
    });
  });
}

registerDecision('staffRenew', (game, m, action) => {
  if (action === 'no') return [];
  const r = renewStaff(game, { pid: m.refs?.pid, years: action === 'y2' ? 2 : 1 });
  return [createMessage({ date: game.date, category: 'staff', from: 'Kierownik drużyny', subject: r.ok ? 'Umowa przedłużona' : 'Bez przedłużenia', body: r.text })];
});

// ------------------------------------------------------------ Dane dla UI

/**
 * Lista wolnych osób dla klubu gracza. filters: { role, foreign: true|false, minQ, maxWage, noOffers }.
 * Wiersze: { id, name, nat, age, role, roleName, q: { v, lo, hi, prec, label }, wage: { lo, mid, hi }, idleDays,
 * offers, decideOn, mine }. Jakość widziana przez asystenta klubu gracza (ta sama precyzja co u AI).
 */
export function listFreeStaff(game, filters = {}) {
  const S = ensureStaff(game);
  if (!S) return [];
  const date = game.date;
  const rows = [];
  for (const id of [...S.pool, ...(S.dirPool ?? [])]) {
    const p = S.people[id];
    if (!p || p.club) continue;
    if (filters.role && p.role !== filters.role) continue;
    if (filters.foreign === true && !isForeign(p)) continue;
    if (filters.foreign === false && isForeign(p)) continue;
    const q = seenQuality(game, p, game.clubId);
    if (filters.minQ != null && q.v < filters.minQ) continue;
    const w = expectedWage(p, date, { club: game.clubId });
    if (filters.maxWage != null && w * 0.9 > filters.maxWage) continue;
    const offers = S.offers.filter((o) => o.pid === id);
    if (filters.noOffers && offers.length) continue;
    rows.push({
      id, name: p.name, nat: p.nat, age: p.age, role: p.role, roleName: roleName(p.role), q,
      wage: { lo: r100(w * 0.9), mid: w, hi: r100(w * 1.1) }, idleDays: p.free ? daysBetween(p.free, date) : 0,
      offers: offers.length, decideOn: S.decide[id] ?? null, mine: offers.some((o) => o.club === game.clubId),
    });
  }
  return rows.sort((a, b) => b.q.v - a.q.v || a.name.localeCompare(b.name));
}

/**
 * Osoby pracujące w innych klubach (podbieranie) dla klubu gracza, te same filtry co listFreeStaff.
 * Wiersze jak w listFreeStaff oraz { club, until, comp (rekompensata 3 pensje), blocked (klucz STAFF_REASONS albo null) }.
 * Pensja obecna osoby nie jest pokazywana dokładnie (tylko przez oczekiwania).
 */
export function listClubStaff(game, filters = {}) {
  const S = ensureStaff(game);
  if (!S) return [];
  const date = game.date;
  const rows = [];
  for (const [clubId, ids0] of Object.entries(S.clubs)) {
    if (clubId === game.clubId || !game.world.clubs[clubId]) continue;
    const ids = S.dir?.[clubId] ? [...ids0, S.dir[clubId]] : ids0; // dyrektor sportowy klubu też do podebrania
    for (const id of ids) {
      const p = S.people[id];
      if (!p) continue;
      if (filters.role && p.role !== filters.role) continue;
      if (filters.foreign === true && !isForeign(p)) continue;
      if (filters.foreign === false && isForeign(p)) continue;
      const q = seenQuality(game, p, game.clubId);
      if (filters.minQ != null && q.v < filters.minQ) continue;
      const w = expectedWage(p, date, { club: game.clubId });
      if (filters.maxWage != null && w * 0.9 > filters.maxWage) continue;
      const offers = S.offers.filter((o) => o.pid === id);
      if (filters.noOffers && offers.length) continue;
      rows.push({
        id, name: p.name, nat: p.nat, age: p.age, role: p.role, roleName: roleName(p.role), q,
        wage: { lo: r100(w * 0.9), mid: w, hi: r100(w * 1.1) }, idleDays: 0,
        offers: offers.length, decideOn: S.decide[id] ?? null, mine: offers.some((o) => o.club === game.clubId),
        club: clubId, until: p.until, comp: poachCompensation(p), blocked: poachBlocker(game, S, game.clubId, p, date),
      });
    }
  }
  return rows.sort((a, b) => b.q.v - a.q.v || a.name.localeCompare(b.name));
}

/**
 * Podsumowanie sztabu klubu: { limit, used, staff, pending, pay, budget, room, roles: { rola: { name, q, vacant, max,
 * people: [{ ...osoba, qNow, canRenew, severance }] } } }. Role z max 0 (skaut w III lidze) są niedostępne.
 */
export function staffSummary(game, clubId = game.clubId) {
  ensureStaff(game);
  const L = limitInfo(game, clubId);
  const B = staffBudget(game, clubId);
  const view = game.training?.staff?.[clubId] ?? {};
  const roles = {};
  for (const role of STAFF_ROLE_IDS) {
    const people = rosterOf(game, clubId).filter((p) => p.role === role).sort((a, b) => b.q - a.q).map((p) => ({ ...p, qNow: r1(personQ(p, game.date)), canRenew: canRenew(p, game.date), severance: severanceOf(p, game.date) }));
    roles[role] = { name: roleName(role), q: view[role]?.q ?? K.vacantQ[role], vacant: !people.length, max: L.roles[role].max, people };
  }
  // Dyrektor sportowy: osobny slot (max 1, poza limitem osób); wakat: zarząd (jakość wakatu)
  const d = directorOf(game, clubId);
  const dp = d ? [{ ...d, qNow: r1(personQ(d, game.date)), canRenew: canRenew(d, game.date), severance: severanceOf(d, game.date) }] : [];
  roles[DIRECTOR_ROLE] = { name: DIRECTOR_NAME, q: d ? d.q : K.vacantQ[DIRECTOR_ROLE], vacant: !d, max: 1, people: dp, outside: true };
  return { limit: L.limit, used: L.used, staff: L.staff, pending: L.pending, pay: B.pay, budget: B.budget, room: B.room, roles };
}

/** Wakaty w rolach rdzenia (asystent, fizyczny, bramkarze, kierownik), które mieszczą się w planie sztabu klubu. */
export function coreVacancies(game, clubId = game.clubId) {
  const v = game.training?.staff?.[clubId];
  if (!v || !game.staff) return [];
  const plan = new Set(staffPlan(clubId, game.staff.limit[clubId] ?? computeLimit(game, clubId)).map((x) => x.role));
  return CORE.filter((r) => v[r]?.vacant && plan.has(r));
}

// ------------------------------------------------------------ System dnia

export function staffMarketDay(game, date) {
  const S = ensureStaff(game);
  if (!S) return [];
  const messages = [];
  if ((date.endsWith('-07-01') || date.endsWith('-01-01')) && S.createdAt !== date && S.last.refresh !== date) refreshPool(game, date);
  if (Object.keys(S.decide).length) messages.push(...decideDay(game, date));
  if (S.adapting.length) adaptationDay(game, date);
  if (isMonday(date)) messages.push(...aiStaffWeek(game, date));
  if (date.endsWith('-06-01')) aiRenewals(game, date);
  if (date.endsWith('-05-01') && game.world.clubs[game.clubId]) messages.push(...expiringNotice(game, date));
  // Dyrektorzy sportowi: lista wolnych (1 czerwca, 1 stycznia), wakaty w klubach AI (poniedziałek), list do gracza
  if ((date.endsWith('-06-01') || date.endsWith('-01-01')) && S.last.dirRefresh !== date) refreshDirectorPool(game, date);
  if (isMonday(date)) messages.push(...aiDirectorWeek(game, date));
  if (game.clubId && game.world.clubs[game.clubId] && S.dirIntro !== game.clubId) messages.push(...directorIntro(game, date));
  if (S.outbox?.length) { messages.push(...S.outbox); S.outbox = []; }
  return messages;
}

registerDailySystem({
  id: 'staffMarket', order: 58,
  run(game, date) {
    if (!game.world || !game.season) return {};
    return { messages: staffMarketDay(game, date) };
  },
});
