// Infrastruktura klubów: stadion, baza treningowa i akademia (poziomy 1-10). Model, źródła i wzory: docs/infrastruktura.md
// (skrót w docs/finanse.md, „Infrastruktura”). Wszystkie liczby oznaczone [SZAC] to założenia balansowe.
//
// Zasada: efekty liczą się względem poziomu startowego klubu, więc pierwszego dnia gry nic się nie zmienia
// (przychód z widza = naKibica x M(L) / M(L_start), rozwój x f(L) / f(L_start) itd.). Utrzymanie obiektów zastępuje
// część dotychczasowych kosztów klubu (ops): w dniu startu ops - kredyt + utrzymanie = ops.
//
// Stan gry: game.infra = { v, clubs: { [id]: { stadium, training, academy, start: {...}, seats, fans, fund,
//   proj: { stadium, training, academy }, fillSum, fillN, fill, licence } }, july }.

import { clamp } from '../core/rng.js';
import { registerDailySystem } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { clubById } from '../data/clubs_pl.js';
import { clubFinanceData } from '../data/finanse_klubow.js';
import { FIN, book } from './finance.js';

const M = 1e6;
export const TRACKS = ['stadium', 'training', 'academy'];
export const TRACK_NAMES = { stadium: 'Stadion', training: 'Baza treningowa', academy: 'Akademia' };

// Poziomy (indeks = poziom - 1). cost: koszt kroku z poprzedniego poziomu (mln zł), months: czas budowy,
// upkeep: utrzymanie rocznie (mln zł). Odniesienia: realne obiekty jako skala, nie dane klubów w grze. [SZAC]
const lv = (name, cost, months, upkeep, extra = {}) => ({ name, cost, months, upkeep, ...extra });
export const LEVELS = {
  stadium: [
    lv('Boisko z trybunką', 0, 0, 0.05, { M: 0.5, max: 1000 }),
    lv('Stadion gminny', 1.5, 3, 0.2, { M: 0.6, max: 3000 }),
    lv('Stadion z oświetleniem', 4, 6, 0.5, { M: 0.7, max: 6000 }),
    lv('Stadion licencyjny (podgrzewana murawa, oświetlenie TV)', 12, 10, 1.2, { M: 0.8, max: 12000 }),
    lv('Nowoczesny stadion miejski', 35, 18, 3, { M: 0.9, max: 20000, ref: 'np. stadion w Opolu (11 600 miejsc, 208,7 mln zł)' }),
    lv('Arena z lożami (UEFA kat. 4)', 80, 24, 6, { M: 1.0, max: 35000, ref: 'np. Arena Zabrze (31 871), stadion w Szczecinie (261 mln zł)' }),
    lv('Arena premium (szczyt w Polsce)', 150, 30, 10, { M: 1.15, max: 45000, ref: 'np. stadion Legii (31 103), stadion w Poznaniu (42 837)' }),
    lv('Stadion europejski', 400, 36, 20, { M: 1.35, max: 60000, ref: 'np. PGE Narodowy (58 580), Stadion Śląski (55 211)' }),
    lv('Stadion światowy', 1200, 42, 40, { M: 1.65, max: 75000, ref: 'np. Signal Iduna Park (81 tys.), Santiago Bernabéu (ok. 83 tys.)' }),
    lv('Ikona (klasa Wembley, Camp Nou)', 3000, 48, 80, { M: 2.0, max: 100000, ref: 'np. Wembley (90 tys.), Camp Nou (ok. 99 tys., docelowo 105 tys.)' }),
  ],
  training: [
    lv('Boisko gminne', 0, 0, 0.05),
    lv('Boisko klubowe z szatnią', 0.2, 2, 0.15),
    lv('Dwa boiska i siłownia', 0.6, 3, 0.4),
    lv('Ośrodek treningowy', 2, 6, 1),
    lv('Ośrodek z odnową biologiczną', 6, 9, 2),
    lv('Nowoczesny ośrodek', 15, 12, 4, { ref: 'np. planowany ośrodek Widzewa (ok. 30 mln zł)' }),
    lv('Centrum treningowe (poziom Wronek)', 35, 15, 6, { ref: 'rozbudowa akademii we Wronkach: 55 mln zł' }),
    lv('Centrum premium (poziom Legia Training Center)', 70, 18, 10, { ref: 'Legia Training Center: ok. 80 mln zł' }),
    lv('Ośrodek europejski', 140, 24, 18, { ref: 'ośrodki czołowych klubów Europy' }),
    lv('Kampus światowy', 500, 30, 30, { ref: 'kampusy największych klubów świata' }),
  ],
  academy: [
    lv('Brak akademii', 0, 0, 0.1),
    lv('Szkółka miejska', 0.1, 2, 0.3),
    lv('Grupy młodzieżowe', 0.3, 3, 0.7),
    lv('Akademia z certyfikatem brązowym', 1, 6, 1.2, { ref: 'certyfikat PZPN: brązowy' }),
    lv('Akademia z certyfikatem srebrnym', 3, 9, 2, { ref: 'certyfikat PZPN: srebrny' }),
    lv('Akademia z certyfikatem złotym', 6, 12, 4, { ref: 'certyfikat PZPN: złoty (najwyższy)' }),
    lv('Akademia czołowa w Polsce', 12, 15, 7),
    lv('Akademia międzynarodowa', 25, 18, 14),
    lv('Akademia europejska', 60, 24, 25, { ref: 'akademie czołowych klubów Europy' }),
    lv('Akademia światowa', 150, 30, 50, { ref: 'akademie największych klubów świata' }),
  ],
};
export const MAX_LEVEL = 10;
/** Najwyższy poziom spotykany w Polsce (oznaczenie na drabinie poziomów). [SZAC] */
export const PL_CEILING = { stadium: 7, training: 8, academy: 8 };
/** Kluby AI nie budują ponad ten poziom (polskie realia). [SZAC] */
export const AI_MAX = 8;

export const INFRA = {
  SEAT_COST: 10000, // zł za miejsce x M(L); realnie ok. 12-18 tys. zł (Opole 208,7 mln / 11 600) [SZAC]
  SEATS_MAX_SHARE: 0.5, // rozbudowa trybun najwyżej +50 % pojemności w jednym projekcie [SZAC]
  SEATS_FILL: 0.85, // rozbudowa trybun tylko przy średnim zapełnieniu sezonu od 85 % [SZAC]
  SEATS_DEMAND: 0.6, // część nowych miejsc, którą zapełnia ukryty popyt [SZAC]
  AI_STADIUM_FILL: 0.92, // klub AI buduje stadion tylko przy zapełnieniu od 92 % [SZAC]
  AI_FUND_SHARE: 0.5, // część corocznych „inwestycji” klubu AI (finance.js, invest) idzie na obiekty [SZAC]
  UPFRONT: 0.2, // 20 % udziału klubu na start, reszta w ratach miesięcznych [SZAC]
  UPKEEP_CREDIT_MAX: 0.5, // utrzymanie na starcie zastępuje najwyżej połowę kosztów klubu [SZAC]
  DISRUPT: { level: 0.1, levelBig: 0.2, seats: 0.25 }, // spadek pojemności w czasie budowy (od poziomu 6: levelBig) [SZAC]
  LICENCE_FINE: 1 * M, // kara za niespełnienie wymogów licencyjnych po sezonie karencji [SZAC]
};

/** Wymogi licencyjne PZPN (uproszczone [SZAC]) według poziomu ligi. */
export const LICENCE = {
  1: { stadium: 4, cap: 4500, training: 3, academy: 3 },
  2: { stadium: 3, academy: 2 },
  3: { stadium: 2 },
  4: { stadium: 1 }, // III liga: licencja PZPN bez wymogów poziomu w grze [SZAC]
};

const r1000 = (x) => Math.round(x / 1000) * 1000;
const lvl = (track, L) => LEVELS[track][clamp(L, 1, MAX_LEVEL) - 1];

// ------------------------------------------------------------ Poziomy startowe [SZAC]
const START = {
  stadium: { legia: 7, lech: 7, 'gornik-zabrze': 6, 'pogon-szczecin': 6, 'wisla-krakow': 6, slask: 6, 'lechia-gdansk': 6, jagiellonia: 6, widzew: 6, cracovia: 6, ruch: 6 },
  training: { legia: 8, lech: 7, rakow: 6 },
  academy: { lech: 7, legia: 7, 'zaglebie-lubin': 6, 'pogon-szczecin': 6 },
};

/** Poziomy startowe klubu (z ligi, prestiżu i danych stadionu). */
export function startLevels(club) {
  const id = club?.id;
  const d = clubFinanceData(club);
  const tier = club?.tier ?? d.liga ?? 3;
  const pr = club?.prestige ?? 4;
  const guess = clamp(Math.round(2 + (d.pojemnosc ?? 2000) / 6000 + ((d.naKibica ?? 15) - 40) / 25), 2, 7);
  let stadium = START.stadium[id];
  if (stadium == null) {
    if (tier === 1) stadium = (d.pojemnosc ?? 0) < 9000 ? 4 : 5;
    else if (tier === 2) stadium = clamp(guess, 3, 5);
    else if (tier === 3) stadium = clamp(guess, 2, 3);
    else if (tier === 4) stadium = clamp(guess - 1, 1, 3); // III liga: zwykle stadion miejski bez zadaszenia [SZAC]
    else stadium = guess;
  }
  let training = START.training[id];
  if (training == null) training = tier === 1 ? clamp(Math.round(1 + 0.6 * pr), 4, 6) : tier === 2 ? (pr >= 6 ? 4 : 3) : tier >= 4 ? (pr >= 4 ? 2 : 1) : (pr >= 5 ? 3 : 2);
  let academy = START.academy[id];
  if (academy == null) academy = tier === 1 ? (pr >= 7 ? 5 : 4) : tier === 2 ? (pr >= 6 ? 4 : 3) : tier >= 4 ? (pr >= 4 ? 2 : 1) : (pr >= 5 ? 3 : 2);
  if (club?.parent) { training = Math.min(training, 3); academy = 2; }
  return { stadium, training, academy };
}

function newEntry(club) {
  const s = startLevels(club);
  return { ...s, start: { ...s }, seats: 0, fans: 0, fund: 0, proj: {}, fillSum: 0, fillN: 0, fill: null, licence: null };
}

/** Stan infrastruktury klubu (tworzony przy pierwszym użyciu; null, gdy klub nieznany albo brak game.infra). */
export function infraOf(game, id) {
  if (!game?.infra) return null;
  const club = clubById(id);
  if (!club) return null;
  return game.infra.clubs[id] ?? (game.infra.clubs[id] = newEntry(club));
}

// ------------------------------------------------------------ Efekty
const devF = (L) => 0.94 + 0.018 * (L - 1);
const injF = (L) => 1.1 - 0.02 * L;
const youthF = (L) => 0.92 + 0.016 * L;
const juniors = (L) => 2 + Math.round(L / 3);
export const stadiumMul = (L) => lvl('stadium', L).M;

/** Baza treningowa: mnożniki rozwoju i urazów na treningu, dodatek do regeneracji (względem startu). */
export function trainingMods(game, id) {
  const I = game?.infra?.clubs?.[id];
  if (!I) return { dev: 1, inj: 1, rec: 0 };
  const L = I.training; const L0 = I.start.training;
  return { dev: devF(L) / devF(L0), inj: injF(L) / injF(L0), rec: 0.4 * (L - L0) };
}

/** Akademia: liczba juniorów, ich jakość, szansa na talent, rozwój do 21 lat (względem startu). */
export function academyMods(game, id) {
  const I = game?.infra?.clubs?.[id];
  if (!I) return { extra: 0, offset: 0, talent: 0, youth: 1 };
  const L = I.academy; const L0 = I.start.academy;
  return { extra: juniors(L) - juniors(L0), offset: 0.12 * (L - L0), talent: Math.max(0, 0.02 * (L - L0)), youth: youthF(L) / youthF(L0) };
}

/** Mnożniki rozwoju dla monthlyDevelopment: { dev, youth } (baza treningowa i akademia). */
export function developmentMods(game, id) {
  const t = trainingMods(game, id); const a = academyMods(game, id);
  return { dev: t.dev, youth: a.youth };
}

/** Roczne utrzymanie obiektów przy danych poziomach (zł). */
export const upkeepAt = (L) => TRACKS.reduce((s, k) => s + lvl(k, L[k]).upkeep * M, 0);

/** Spadek pojemności w czasie budowy na stadionie (0-1). */
function disruption(I) {
  const p = I.proj?.stadium;
  if (!p) return 0;
  if (p.kind === 'seats') return INFRA.DISRUPT.seats;
  return p.to >= 6 ? INFRA.DISRUPT.levelBig : INFRA.DISRUPT.level;
}

/** Pełna pojemność (bez utrudnień budowy) i maksimum dla obecnego poziomu stadionu. */
export function capacityOf(game, id) {
  const I = infraOf(game, id); const club = clubById(id);
  const d = clubFinanceData(club);
  const full = (d.pojemnosc ?? 0) + (I?.seats ?? 0);
  return { full, now: Math.round(full * (1 - (I ? disruption(I) : 0))), max: lvl('stadium', I?.stadium ?? 1).max };
}

/**
 * Nakłada infrastrukturę na plan sezonu klubu (finance.js): pojemność, frekwencja, przychód z widza, utrzymanie.
 * Zmienia tylko te pola (i domestic, ops, net o różnicę), więc zmiany innych modułów w planie zostają.
 */
export function applyPlan(game, id) {
  const c = game.finance?.clubs?.[id]; const club = clubById(id); const I = infraOf(game, id);
  if (!c?.plan || !club || !I) return;
  const p = c.plan;
  const d = clubFinanceData(club);
  const t = p.tier ?? club.tier; const t0 = d.liga ?? t;
  const attR = (FIN.K_ATT[t] ?? FIN.K_ATT[4]) / (FIN.K_ATT[t0] ?? FIN.K_ATT[4]);
  const base = p.infraBase ?? (p.infraBase = { perFan: p.perFan, tickets: p.tickets });
  const capFull = d.pojemnosc + I.seats;
  const attFull = Math.min(capFull, Math.round((d.frekwencja + I.fans) * attR));
  const perFan = Math.round(base.perFan * stadiumMul(I.stadium) / stadiumMul(I.start.stadium));
  const dis = disruption(I);
  const cap = Math.round(capFull * (1 - dis)); const att = Math.round(attFull * (1 - dis));
  const tickets = r1000(att * perFan * FIN.HOME_GAMES);
  // Koszty dnia meczowego rosną z pełnym przychodem z biletów (utrudnienia budowy ich nie zmniejszają)
  const opsAdd = r1000((r1000(attFull * perFan * FIN.HOME_GAMES) - base.tickets) * (FIN.OTHER_COSTS[t] ?? 0.25));
  p.domestic += tickets - p.tickets;
  p.ops += opsAdd - (p.infraOps ?? 0);
  p.infraOps = opsAdd;
  Object.assign(p, { cap, att, perFan, tickets });
  const up0 = upkeepAt(I.start);
  p.upkeepBase = r1000(Math.min(up0, p.ops * INFRA.UPKEEP_CREDIT_MAX));
  p.upkeep = r1000(Math.max(0, p.upkeepBase + upkeepAt(I) - up0));
  p.net = p.domestic + p.owner - p.wages - p.ops;
  p.infra = true;
}

/** Leniwe tworzenie stanu (stare zapisy) i nałożenie infrastruktury na nowe plany sezonu. Wywoływane codziennie. */
export function ensureInfra(game) {
  if (!game?.finance) return;
  if (!game.infra) game.infra = { v: 1, clubs: {}, july: null };
  for (const [id, c] of Object.entries(game.finance.clubs)) {
    if (!c.plan || c.plan.infra) continue;
    if (infraOf(game, id)) applyPlan(game, id);
  }
}

// ------------------------------------------------------------ Licencja
/** Braki licencyjne klubu dla jego obecnej ligi: [{ track, need, have, text }]. */
export function licenceNeeds(game, id) {
  const club = clubById(id); const I = infraOf(game, id);
  const req = club && I ? LICENCE[club.tier] : null;
  if (!req) return [];
  const out = [];
  for (const k of TRACKS) if (req[k] && I[k] < req[k]) out.push({ track: k, need: req[k], have: I[k], text: `${TRACK_NAMES[k]}: wymagany poziom ${req[k]}, jest ${I[k]}` });
  if (req.cap) {
    const cap = capacityOf(game, id).full;
    if (cap < req.cap) out.push({ track: 'stadium', seats: true, need: req.cap, have: cap, text: `Pojemność: wymagane ${fmtN(req.cap)} miejsc, jest ${fmtN(cap)}` });
  }
  return out;
}
const fmtN = (n) => Math.round(n).toLocaleString('pl-PL').replace(/\s/g, ' ');

// ------------------------------------------------------------ Finansowanie
/** Udział właściciela albo miasta w projekcie (0-1), deterministycznie z typu właściciela. [SZAC] */
export function ownerShare(game, id, track, kind, to) {
  const d = clubFinanceData(clubById(id) ?? id);
  const w = d.wlasciciel ?? {};
  if (w.typ === 'miasto') {
    if (track === 'stadium') return kind === 'seats' ? 0.7 : to <= 5 ? 1 : to === 6 ? 0.85 : to === 7 ? 0.7 : 0.3;
    if (track === 'training') return to <= 5 ? 0.5 : 0.3;
    return 0;
  }
  if (w.typ === 'miliarder') return 0.5;
  if ((w.skarbiec ?? 0) > 0) return 0.25; // właściciel z pieniędzmi na klub (skarbiec)
  return 0;
}
/** Kto dokłada do inwestycji (opis bez nazwisk). */
export function ownerLabel(id) {
  const t = clubFinanceData(clubById(id) ?? id).wlasciciel?.typ;
  return t === 'miasto' ? 'Miasto' : t === 'klub' ? 'Pierwsza drużyna' : t === 'spolka' ? 'Spółka właściciela' : 'Właściciel';
}

/** Średnie zapełnienie stadionu w meczach ligowych: bieżący sezon (od 3 meczów), poprzedni albo z danych. */
export function seasonFill(game, id) {
  const I = infraOf(game, id); const p = game.finance?.clubs?.[id]?.plan;
  if (I?.fillN >= 3) return I.fillSum / I.fillN;
  if (I?.fill != null) return I.fill;
  return p ? p.att / Math.max(1, p.cap) : 0;
}

/** Ile miejsc można dobudować w jednym projekcie: +50 % pojemności (albo do wymogu licencji), do maksimum poziomu. */
export function seatRoom(game, id) {
  const cap = capacityOf(game, id);
  const need = licenceNeeds(game, id).find((n) => n.seats);
  const share = Math.max(Math.round(cap.full * INFRA.SEATS_MAX_SHARE), need ? need.need - cap.full : 0);
  return Math.max(0, Math.min(share, cap.max - cap.full));
}

/**
 * Wycena projektu. track: 'stadium' | 'training' | 'academy'; opts.seats: rozbudowa trybun (tor stadionu).
 * Zwraca { ok, why, track, kind, to, seats, cost, share, owner, club, upfront, monthly, months, upkeep, upkeepDelta, disrupt }.
 */
export function quote(game, id, track, opts = {}) {
  const I = infraOf(game, id);
  if (!I || !TRACKS.includes(track)) return { ok: false, why: 'Nieznany obiekt.' };
  const seats = opts.seats ? Math.round(opts.seats) : 0;
  const kind = seats ? 'seats' : 'level';
  if (seats && track !== 'stadium') return { ok: false, why: 'Trybuny dotyczą tylko stadionu.' };
  const L = I[track];
  const q = { ok: true, why: '', track, kind, seats, to: kind === 'level' ? L + 1 : L };
  if (kind === 'level') {
    if (L >= MAX_LEVEL) return { ...q, ok: false, why: 'Najwyższy poziom osiągnięty.' };
    const next = lvl(track, L + 1);
    q.cost = next.cost * M; q.months = next.months;
    q.upkeepDelta = (next.upkeep - lvl(track, L).upkeep) * M;
    q.disrupt = track === 'stadium' ? (L + 1 >= 6 ? INFRA.DISRUPT.levelBig : INFRA.DISRUPT.level) : 0;
  } else {
    const cap = capacityOf(game, id);
    const need = licenceNeeds(game, id).find((n) => n.seats);
    const room = seatRoom(game, id);
    if (seats <= 0 || seats > room) return { ...q, ok: false, why: room < 500 ? 'Na tym poziomie stadionu nie ma miejsca na nowe trybuny. Najpierw podnieś standard.' : `Można dobudować najwyżej ${fmtN(room)} miejsc.` };
    if (!need && seasonFill(game, id) < INFRA.SEATS_FILL) return { ...q, ok: false, why: `Rozbudowa trybun wymaga średniego zapełnienia od ${Math.round(INFRA.SEATS_FILL * 100)} %.` };
    q.cost = r1000(seats * INFRA.SEAT_COST * stadiumMul(L)); q.months = clamp(Math.round(6 + seats / 1500), 6, 24);
    q.upkeepDelta = 0; q.disrupt = INFRA.DISRUPT.seats;
  }
  if (I.proj?.[track]) return { ...q, ok: false, why: 'Na tym obiekcie trwa już inwestycja.' };
  q.share = ownerShare(game, id, track, kind, q.to);
  q.owner = r1000(q.cost * q.share);
  q.club = q.cost - q.owner;
  q.upfront = r1000(q.club * INFRA.UPFRONT);
  q.monthly = q.months ? r1000((q.club - q.upfront) / q.months) : 0;
  return q;
}

const msgOf = (date, key, subject, body, priority = 'info') => createMessage({ date, key, category: 'club', from: 'Dyrektor ds. infrastruktury', priority, subject, body });

/**
 * Start projektu. Klub gracza płaci 20 % udziału od razu (wpis 'infra'), resztę w ratach 1. dnia miesiąca.
 * opts.ai: klub AI płaci cały udział z funduszu inwestycyjnego (pieniądze zeszły już jako 'invest').
 * Zwraca { ok, text, quote }.
 */
export function startProject(game, id, track, opts = {}) {
  const q = quote(game, id, track, opts);
  if (!q.ok) return { ok: false, text: q.why, quote: q };
  const I = infraOf(game, id); const F = game.finance; const c = F.clubs[id];
  const date = game.date;
  let fromFund = 0; let fromBalance = 0;
  if (opts.ai) {
    fromFund = Math.min(I.fund, q.club);
    const rest = q.club - fromFund;
    if (rest > 0 && (!opts.allowBalance || !c)) return { ok: false, text: 'Brak pieniędzy.', quote: q };
    // Wymogi licencji: reszta z salda ponad miesięczne koszty, a czego brakuje, dokłada właściciel albo miasto
    // (jak pokrywanie długów klubów AI w careerSystem.js), więc saldo nie spada pod zero
    if (rest > 0) {
      fromBalance = Math.min(rest, Math.max(0, r1000(c.balance - (c.plan.wages + c.plan.ops) / 12)));
      q.owner += rest - fromBalance; q.club -= rest - fromBalance;
    }
  } else if (!c || c.balance < q.upfront) {
    return { ok: false, text: `Za mało pieniędzy na pierwszą wpłatę (${fmtZl(q.upfront)}).`, quote: q };
  }
  const label = q.kind === 'seats' ? `rozbudowa trybun (+${fmtN(q.seats)} miejsc)` : `${TRACK_NAMES[track].toLowerCase()}, poziom ${q.to}`;
  if (opts.ai) {
    I.fund -= fromFund;
    if (fromBalance > 0) book(F, id, date, 'out', 'infra', fromBalance, `Inwestycja: ${label}`);
  } else if (q.upfront) book(F, id, date, 'out', 'infra', q.upfront, `Inwestycja: ${label}, pierwsza wpłata`);
  I.proj[track] = {
    kind: q.kind, to: q.to, seats: q.seats, cost: q.cost, owner: q.owner, club: q.club,
    paid: opts.ai ? q.club : q.upfront, months: q.months, m: 0, start: date, ai: !!opts.ai, label,
  };
  if (track === 'stadium') applyPlan(game, id);
  return { ok: true, text: `Ruszyła inwestycja: ${label}. Koszt ${fmtZl(q.cost)}, klub płaci ${fmtZl(q.club)}.`, quote: q };
}
function fmtZl(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace('.', ',')} mln zł`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} tys. zł`;
  return `${Math.round(n)} zł`;
}

/** Zakończenie projektu: poziom +1 albo nowe miejsca, nowe efekty od razu. */
function complete(game, id, track) {
  const I = infraOf(game, id); const p = I.proj[track];
  if (p.kind === 'seats') {
    const club = clubById(id); const d = clubFinanceData(club);
    const t = club.tier; const t0 = d.liga ?? t;
    const attR = (FIN.K_ATT[t] ?? FIN.K_ATT[4]) / (FIN.K_ATT[t0] ?? FIN.K_ATT[4]);
    I.seats += p.seats;
    I.fans += Math.round(p.seats * INFRA.SEATS_DEMAND / Math.max(0.1, attR));
  } else I[track] = Math.min(MAX_LEVEL, I[track] + 1);
  delete I.proj[track];
  applyPlan(game, id);
  return p;
}

/** 1. dnia miesiąca: raty, postęp, zakończenia. Zwraca wiadomości dla klubu gracza. */
export function infraMonth(game, date) {
  const out = [];
  for (const [id, I] of Object.entries(game.infra.clubs)) {
    for (const track of TRACKS) {
      const p = I.proj?.[track];
      if (!p) continue;
      p.m += 1;
      if (!p.ai && p.paid < p.club) {
        const amt = p.m >= p.months ? p.club - p.paid : Math.min(p.club - p.paid, r1000((p.club - INFRA.UPFRONT * p.club) / p.months));
        if (amt > 0 && game.finance.clubs[id]) { book(game.finance, id, date, 'out', 'infra', amt, `Rata inwestycji: ${p.label}`); p.paid += amt; }
      }
      if (p.m >= p.months) {
        complete(game, id, track);
        if (id === game.clubId) {
          const L = I[track];
          out.push(msgOf(date, `infra-gotowe:${id}:${track}:${date}`, p.kind === 'seats' ? `Nowe trybuny gotowe: ${fmtN(capacityOf(game, id).full)} miejsc` : `${TRACK_NAMES[track]}: poziom ${L} gotowy`,
            `Zakończyliśmy inwestycję (${p.label}). ${effectLine(game, id, track)} Roczne utrzymanie obiektów: ${fmtZl(game.finance.clubs[id]?.plan?.upkeep ?? 0)}.`, 'important'));
        }
      }
    }
  }
  return out;
}

/** Jedno zdanie o efekcie toru (do wiadomości). */
function effectLine(game, id, track) {
  const I = infraOf(game, id);
  if (track === 'stadium') return `Przychód z widza x${num(stadiumMul(I.stadium) / stadiumMul(I.start.stadium))} względem startu, pojemność ${fmtN(capacityOf(game, id).full)}.`;
  if (track === 'training') { const t = trainingMods(game, id); return `Rozwój zawodników x${num(t.dev)}, ryzyko urazu na treningu x${num(t.inj)}.`; }
  const a = academyMods(game, id); return `Co roku ${juniors(I.academy)} juniorów na start (średnio), rozwój do 21 lat x${num(a.youth)}.`;
}
const num = (x) => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');

/** Mecze ligowe na własnym stadionie: zapełnienie do średniej sezonu. */
function trackFill(game) {
  for (const f of game.fixtures ?? []) {
    if (!f.played || f.infF || !f.attendance || f.neutral || !(['ekstraklasa', 'liga1', 'liga2'].includes(f.comp) || f.comp.startsWith('liga3-'))) continue;
    f.infF = 1;
    const I = infraOf(game, f.home); const cap = game.finance?.clubs?.[f.home]?.plan?.cap;
    if (!I || !cap) continue;
    I.fillSum += Math.min(1, f.attendance / cap); I.fillN += 1;
  }
}

/** 1 lipca: średnie zapełnienie, fundusz AI, licencje, decyzje klubów AI. */
export function infraSeason(game, date) {
  const out = [];
  const F = game.finance;
  for (const id of Object.keys(F.clubs)) {
    const I = infraOf(game, id); const club = clubById(id);
    if (!I || !club) continue;
    if (I.fillN >= 3) I.fill = I.fillSum / I.fillN;
    I.fillSum = 0; I.fillN = 0;
    const mine = id === game.clubId;
    if (!mine) I.fund += Math.round((F.clubs[id].ledger?.[date.slice(0, 7)]?.out?.invest ?? 0) * INFRA.AI_FUND_SHARE);
    // Licencja: sezon na rozpoczęcie inwestycji, potem kara
    const needs = licenceNeeds(game, id);
    if (!needs.length) I.licence = null;
    else if (!I.licence || (I.licence.tier != null && I.licence.tier !== club.tier)) {
      // Nowa liga (awans, także dwa awanse z rzędu z III ligi): znowu sezon na rozpoczęcie inwestycji
      I.licence = { since: date, tier: club.tier };
      if (mine) out.push(msgOf(date, `licencja:${id}:${date}`, 'Licencja: obiekty poniżej wymogów ligi', `${needs.map((n) => n.text).join('. ')}.\n\nMamy sezon na rozpoczęcie inwestycji (zakładka Klub, Infrastruktura). Bez niej PZPN nałoży karę ${fmtZl(INFRA.LICENCE_FINE)}.`, 'important'));
    } else if (needs.some((n) => !I.proj?.[n.track])) {
      book(F, id, date, 'out', 'fines', INFRA.LICENCE_FINE, 'Kara licencyjna PZPN: obiekty poniżej wymogów');
      I.licence = { since: date, fined: (I.licence.fined ?? 0) + 1, tier: club.tier };
      if (mine) out.push(msgOf(date, `licencja-kara:${id}:${date}`, `Kara licencyjna: ${fmtZl(INFRA.LICENCE_FINE)}`, `Nie rozpoczęliśmy inwestycji wymaganych przez licencję. ${needs.map((n) => n.text).join('. ')}.\n\nKolejna kara za rok, jeśli inwestycja nie ruszy.`, 'urgent'));
    }
    if (!mine && !club.parent) aiInvest(game, id, needs);
  }
  return out;
}

/** Klub AI: najpierw wymogi licencji, potem baza, akademia, stadion (tylko przy zapełnieniu od 92 %). */
function aiInvest(game, id, needs) {
  const I = infraOf(game, id);
  for (const n of needs) {
    if (I.proj[n.track]) continue;
    const seats = n.seats && I.stadium >= LICENCE[1].stadium ? Math.min(seatRoom(game, id), Math.max(500, n.need - capacityOf(game, id).full)) : 0;
    startProject(game, id, n.track, { ai: true, allowBalance: true, seats });
  }
  for (const track of ['training', 'academy', 'stadium']) {
    if (I.proj[track]) continue;
    let opts = { ai: true };
    if (track === 'stadium') {
      if (I.fill == null || I.fill < INFRA.AI_STADIUM_FILL) continue; // decyzja dopiero po pełnym sezonie
      const room = seatRoom(game, id);
      if (room >= 1000) opts = { ai: true, seats: Math.floor(room / 500) * 500 };
    }
    if (!opts.seats && I[track] >= AI_MAX) continue;
    const q = quote(game, id, track, opts);
    if (!q.ok || q.club > I.fund) continue;
    if (startProject(game, id, track, opts).ok) break; // jeden nowy projekt na sezon (poza licencją)
  }
}

registerDailySystem({
  id: 'infra', order: 55,
  run(game, date) {
    if (!game.world || !game.finance) return {};
    ensureInfra(game);
    trackFill(game);
    const messages = [];
    if (date.endsWith('-01')) messages.push(...infraMonth(game, date));
    if (date.endsWith('-07-01') && game.infra.july !== date) { game.infra.july = date; messages.push(...infraSeason(game, date)); }
    return { messages };
  },
});
