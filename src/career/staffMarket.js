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
import { clubById } from '../data/clubs_pl.js';
import { NATIONALITIES, randomName } from '../data/names.js';
import { payLevel } from '../data/finanse_klubow.js';
import { STAFF_ROLES } from '../training/config.js';
import { generateStaffFor, staffLabel } from '../training/staff.js';
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
    R: { asystent: 1, fizyczny: 0.7, bramkarze: 0.7, analityk: 0.55, mlodziez: 0.5, kierownik: 0.45, fizjoterapeuta: 0.6, skaut: 0.4 },
  },
  // Wakat: obowiązki przejmuje trener i reszta sztabu (jakość roli)
  vacantQ: { asystent: 4, fizyczny: 3, bramkarze: 3, mlodziez: 3, analityk: 2, kierownik: 2, fizjoterapeuta: 3, skaut: 2 },
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
    MIN: { 1: 7, 2: 5, 3: 4, 4: 3 }, MAX: { 1: 18, 2: 9, 3: 7, 4: 5 }, repDiv: 12, fK: 1.5, fMin: -1.5, fMax: 2.5,
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
};

const K = STAFF_MARKET;
const r1 = (v) => Math.round(v * 10) / 10;
const r100 = (v) => Math.round(v / 100) * 100;
const tierOf = (clubId) => clamp(clubById(clubId)?.tier ?? 4, 1, 4);
const nameOf = (clubId) => clubById(clubId)?.name ?? clubId;
const seasonYear = (game) => game.seasonYear ?? 2026;
const isMonday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay() === 1;
const roleName = (role) => STAFF_ROLES[role]?.name ?? role;
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const fmtZlM = (v) => `${(Math.round(v / 100) / 10).toLocaleString('pl-PL')} tys. zł`;
const coachKey = (c) => (c ? c.id ?? c.name ?? null : null);
const isForeign = (p) => !!p.nat && p.nat !== 'POL';
/** Pół sezonu (lipiec-grudzień, styczeń-czerwiec): klucz limitów podbierania. */
export const halfKeyOf = (date) => { const y = +date.slice(0, 4); return +date.slice(5, 7) >= 7 ? `${y}a` : `${y - 1}b`; };

// ------------------------------------------------------------ Wzory (czyste)

/** Oczekiwana pensja (zł / mies.): jakość, rola, narodowość, okres bez pracy (opcjonalnie). */
export function expectedWage(p, date = null, { idle = true } = {}) {
  const W = K.wage;
  let w = W.base * (W.R[p.role] ?? 0.5) * W.growth ** ((p.q ?? 10) - 10) * (isForeign(p) ? W.foreign : 1);
  if (idle && p.free && date && !p.club) {
    const d = daysBetween(p.free, date);
    if (d > W.idleFree) w *= Math.max(W.idleMin, 1 - W.idlePerMonth * (d - W.idleFree) / 30);
  }
  return Math.max(W.min, r100(w));
}

/** Jakość osoby w danym dniu (adaptacja obcokrajowca obniża ją przez 3 miesiące, liniowo do zera). */
export function personQ(p, date = null) {
  if (!p.adapt || !date || date >= p.adapt.to) return p.q;
  const left = daysBetween(date, p.adapt.to);
  return Math.max(1, p.q - p.adapt.pen * Math.min(1, left / K.adapt.days));
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
  return { id: newPersonId(S), name: `${nm.first} ${nm.last}`, nat, age, role, q, wage: 0, until: null, since: null, club: null, free: opts.free ?? game.date ?? null, coach: null, adapt: null, pl: nat === 'POL', lead: false, demoted: null, hist: [] };
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
  const ppl = rosterOf(game, clubId);
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
    if (list.length > 1) o.n = list.length;
    view[role] = o;
  }
  T.staff[clubId] = view;
  if (adapting) { if (!S.adapting.includes(clubId)) S.adapting.push(clubId); } else if (S.adapting.includes(clubId)) S.adapting = S.adapting.filter((x) => x !== clubId);
}

/** Pensje sztabu klubu (miesięcznie) do finansów. */
function updatePay(game, clubId) {
  const c = game.finance?.clubs?.[clubId];
  if (c) c.staffPay = rosterOf(game, clubId).reduce((s, p) => s + (p.wage ?? 0), 0);
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
  // Kluby rozwiązane (spadek do IV ligi): sztab do puli
  for (const id of Object.keys(S.clubs)) if (!game.world.clubs[id]) dissolveClub(game, S, id, date);
  // Nowe kluby (stary zapis, awans z IV ligi): sztab z widoku i ziarna
  const added = [];
  for (const id of Object.keys(game.world.clubs)) if (!S.clubs[id]) { buildClub(game, S, id, date); added.push(id); }
  if (fresh) for (let i = 0; i < K.pool.size; i++) addPoolPerson(game, S, `start:${i}`, date);
  for (const id of added) syncStaff(game, id, date);
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
    let actual = rosterOf(game, id).reduce((s, p) => s + (p.wage ?? 0), 0);
    // Migracja: sztab droższy niż 60 % kosztów klubu (rezerwy, małe kluby) pracuje za mniej (część etatu), żeby
    // pierwszy dzień był neutralny finansowo
    const cap0 = (c.plan.ops ?? 0) * K.migrateCap / 12;
    if (S.based[id] == null && actual > cap0 && actual > 0) {
      for (const p of rosterOf(game, id)) p.wage = Math.max(K.wage.min, r100(p.wage * cap0 / actual));
      actual = rosterOf(game, id).reduce((s, p) => s + (p.wage ?? 0), 0);
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
function toPool(game, p, date, why) {
  const S = game.staff;
  const from = p.club;
  closeHist(p, date, why);
  if (from) S.clubs[from] = (S.clubs[from] ?? []).filter((id) => id !== p.id);
  Object.assign(p, { club: null, wage: 0, until: null, free: date, coach: null, adapt: null, signed: null, lead: false, demoted: null });
  delete S.block[p.id];
  if (!S.pool.includes(p.id)) S.pool.push(p.id);
  if (from && S.clubs[from]) { syncStaff(game, from, date); updatePay(game, from); }
}

function removePerson(S, p) {
  if (p.club) S.clubs[p.club] = (S.clubs[p.club] ?? []).filter((id) => id !== p.id);
  S.pool = S.pool.filter((id) => id !== p.id);
  S.offers = S.offers.filter((o) => o.pid !== p.id);
  delete S.decide[p.id]; delete S.block[p.id];
  delete S.people[p.id];
}

function dissolveClub(game, S, clubId, date) {
  for (const p of rosterOf(game, clubId)) {
    closeHist(p, date, 'rozwiązanie klubu');
    Object.assign(p, { club: null, wage: 0, until: null, free: date, coach: null, adapt: null, signed: null, lead: false, demoted: null });
    S.pool.push(p.id);
  }
  delete S.clubs[clubId]; delete S.limit[clubId];
  S.offers = S.offers.filter((o) => o.club !== clubId);
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
  const pend = S ? pendingOf(S, clubId) : [];
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
  const core = CORE.includes(role) && !rosterOf(game, clubId).some((p) => p.role === role);
  return B.room + (core ? Math.round(B.budget * K.budget.coreVacancy) : 0);
}

/** Budżet sztabu (zł / mies.): { budget, pay, pending, room }. */
export function staffBudget(game, clubId = game.clubId) {
  const S = game.staff;
  const c = game.finance?.clubs?.[clubId];
  const pay = rosterOf(game, clubId).reduce((s, p) => s + (p.wage ?? 0), 0);
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
  const w0 = expectedWage(p, date);
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
  const w0 = expectedWage(p, date);
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
  if (!game.world.clubs[clubId] || !clubById(clubId)) return res('club');
  if (p.club === clubId) return res('own');
  if (p.signed && daysBetween(p.signed, date) < K.offer.lockDays) return res('locked');
  if (p.club) { const b = poachBlocker(game, S, clubId, p, date); if (b) return res(b); }
  const years = Math.round(args.years ?? 2);
  if (!(years >= 1 && years <= 3) && !(years === 0 && +date.slice(5, 7) < 7)) return res('years');
  const wage = r100(args.wage ?? expectedWage(p, date));
  if (wage < K.offer.minShare * expectedWage(p, date)) { seasonStats(S, game).rejected++; return res('low'); }
  const mine = S.offers.filter((o) => o.pid === p.id);
  if (mine.some((o) => o.club === clubId)) return res('dup');
  if (mine.length >= K.offer.perPerson) return res('many');
  const user = clubId === game.clubId;
  const maxPend = user ? K.offer.userMax : ([6, 7, 12, 1].includes(+date.slice(5, 7)) ? K.offer.aiMaxWindow : K.offer.aiMax);
  if (pendingOf(S, clubId).length >= maxPend) return res('pending');
  const L = limitInfo(game, clubId);
  const R = L.roles[p.role];
  if (!R.max) return res('role');
  if (L.used >= L.limit) return res('limit');
  if (R.n + R.pending >= R.max) return res('roleFull');
  const cool = S.cool[`${clubId}:${p.id}`];
  if (cool && cool > date) return res('cool');
  if (wage > budgetRoomFor(game, clubId, p.role)) return res('budget');
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
  if (!canRenew(p, date)) return res('early');
  const cool = S.cool[`${clubId}:${p.id}:renew`];
  if (cool && cool > date) return res('cool');
  const years = clamp(Math.round(args.years ?? 1), 1, 3);
  const wage = r100(args.wage ?? expectedWage(p, date));
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
        S.clubs[from] = (S.clubs[from] ?? []).filter((id) => id !== p.id);
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
      if (o.club === game.clubId) messages.push(msg(date, `sztab-decyzja:${pid}:${date}`, 'important', `${p.name} przyjmuje ofertę`, `${p.name} przyjmuje ofertę: ${lower(roleName(p.role))} (${o.lead ? 'lider w roli' : 'pomocnik'}) do ${fmtDate(o.until)}, ${fmtZlM(o.wage)} miesięcznie.${p.adapt ? ' Przez pierwsze 3 miesiące będzie się aklimatyzował i pracował nieco słabiej.' : ''}`));
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
  const w0 = expectedWage(p, date);
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
    if ((nOff[p.id] ?? 0) >= K.offer.perPerson) continue;
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
    order.forEach((p, i) => {
      if (p.until !== end) return;
      const helper = rankIn(game, clubId, p) > 1;
      if (i >= limit || p.age >= K.pool.noRenewAge || (helper && p.q < K.ai.helperMinQ) || !roleCap(clubId, p.role)) return;
      if (!helper && p.q < target - K.ai.weak && CORE.includes(p.role)) return; // słaby lider: klub szuka lepszego
      const wage = aiWage(game, clubId, p, date);
      const years = tierOf(clubId) === 1 ? 2 : 1;
      const rng = new Rng(`sztab-przedluz:${game.seed}:${p.id}:${date}`);
      const { u } = offerUtility(game, p, { club: clubId, wage, years }, date, rng);
      if (u + K.util.stay < K.util.u0) return;
      p.wage = wage; p.until = `${+end.slice(0, 4) + years}-06-30`;
      seasonStats(S, game).renewed++;
    });
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
    if (p.age <= D.upAge && rng.chance(D.up)) p.q = Math.min(20, p.q + 1);
    else if (p.age >= D.downAge && rng.chance(D.down)) p.q = Math.max(1, p.q - 1);
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
  return rosterOf(game, game.clubId).filter((p) => p.until === end).map((p) => {
    const w = expectedWage(p, date);
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
  for (const id of S.pool) {
    const p = S.people[id];
    if (!p || p.club) continue;
    if (filters.role && p.role !== filters.role) continue;
    if (filters.foreign === true && !isForeign(p)) continue;
    if (filters.foreign === false && isForeign(p)) continue;
    const q = seenQuality(game, p, game.clubId);
    if (filters.minQ != null && q.v < filters.minQ) continue;
    const w = expectedWage(p, date);
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
