// Raport obserwatora (docs/raport-obserwatora.md): zlecenie obserwacji zawodnika innej drużyny (menu zawodnika,
// „Raport obserwatora…”). Skaut klubu (wolny, z najlepszą oceną w regionie zawodnika) albo asystent trenera, gdy żaden
// skaut nie jest wolny, ogląda kolejne mecze zawodnika: 1 mecz, 2-5 meczów albo okres 2-6 tygodni. Mecze z kontuzją,
// pauzą albo ławką bez minut się nie liczą. Po zakończeniu raport w Poczcie: przedziały atrybutów (błąd zależny od
// sztabu i liczby meczów, jeden wspólny błąd całego raportu), forma z obejrzanych meczów, zdrowie, charakter (dopiero
// po dłuższej obserwacji), rola u nas (porównanie z naszym najlepszym na pozycji, z wartości widzianych przez
// obserwatora), potencjał, rynek (dyrektor sportowy) i rekomendacja. Raport nigdy nie pokazuje swojej dokładności.
// Stan w zapisie: game.observe = { v, seq, orders: [zlecenie], reports: { pid: [raport] } } (stary zapis: puste).
// Kluby AI (parytet): przy zakupie oceniają kandydata OVR widzianym z błędem z tego samego wzoru (aiSeenOvr,
// src/career/transfers.js aiBuy). Wszystkie liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { clubById, LEAGUE_NAMES } from '../data/clubs_pl.js';
import { ATTRS, OFF, POS_NAMES, ovrAt, attrsFor } from '../data/attributes.js';
import { NAT_NAMES } from '../data/names.js';
import { proficiency } from '../engine/positions.js';
import { squadOf } from '../world/worldGen.js';
import { staffA } from '../training/staff.js';
import { staffEff } from '../training/config.js';
import { daysBetween } from '../training/state.js';
import { scoutRegionOf } from './scoutRegions.js';
import { scoutIndex, clubScouts } from './scoutOps.js';
import { rosterOf, directorOf, personAttr } from './staffMarket.js';
import { book, spendable } from './finance.js';
import { askingPrice, playerWillingness, notForSale, fmtZl } from './transfers.js';
import { isPoolContracted, poolClubLabel, foreignAskingPrice } from './foreignPool.js';
import { hintHalfWidth } from './director.js';
import { inAcclim } from './wishMemory.js';
import { fmtDate } from '../ui/dom.js';

/** Liczby raportu obserwatora [SZAC] (docs/raport-obserwatora.md). */
export const OBS = {
  // Dokładność A = (0,45 OCE + 0,30 R + 0,15 DOS + 0,10 DAN) / 20; asystent zamiast skauta x0,75
  w: { oce: 0.45, reg: 0.30, dos: 0.15, dan: 0.10 },
  assistMul: 0.75, homeR: 15, assistAbroadR: 5, lowerPen: 0.5, aMin: 0.05, aMax: 0.95,
  // Błąd atrybutu: sd = 4,5 (1 - A) + 0,7 (skala 1-20); wspólny błąd raportu ~ N(0; 1,0 (1 - A))
  sdK: 4.5, sdBase: 0.7, bias: 1.0,
  // Liczba meczów: sd x 1 / pierwiastek(mecze), najmniej 0,45; okres: tygodnie -> mnożnik
  sampleFloor: 0.45, period: { 2: 0.85, 3: 0.70, 4: 0.55, 5: 0.50, 6: 0.45 },
  reveal: { min: 4, max: 10, aLo: 0.35, aHi: 0.85 }, // ujawnione cechy: 4 (słaby) do 10 (dobry)
  persona: { matches: 3, weeks: 4, cha: 8 }, // charakter: od 3 meczów albo 4 tygodni i ocena charakteru skauta od 8
  matches: { min: 2, max: 5 }, weeks: { min: 2, max: 6 },
  expiry: 60, valid: 60, benchRun: 3,
  cost: { match: 3000, week: 8000 }, // zagranica: za mecz albo za tydzień okresu (koszty skautów w Finansach)
  slots: 2, slotsDos: 16, slotsHigh: 3, assistSlots: 1,
  price: { noDir: 0.35, listed: 0.10, wageUp: 1.1 },
  keepPerPlayer: 6, keepPlayers: 40,
  // Kluby AI: OVR kandydata widziany z błędem (jak raport po ok. 4 tygodniach obserwacji). on: false wyłącza parytet
  ai: { on: true, sample: 0.55 },
};

export const OBS_MODES = { match: 'Jeden mecz', matches: 'Kilka meczów', period: 'Okres' };
export const REC = { take: 'bierzemy', watch: 'obserwować dalej', skip: 'odpuścić' };
export const VERDICTS = { up: 'Wzmocnienie', rot: 'Zmiennik', dev: 'Do rozwoju', no: 'Nie' };
// Profil w sześciu grupach cech (wykres wycinków)
export const OBS_GROUPS = [
  ['tech', 'Technika', ['POD', 'DRY', 'TEC', 'DOS', 'SFR']],
  ['phys', 'Fizyczność', ['SZY', 'WYT', 'SIL', 'ZWI', 'SKO']],
  ['mental', 'Mentalność', ['WIZ', 'DEC', 'OPA', 'PRA', 'LID']],
  ['def', 'Obrona', ['ODB', 'UST', 'GLO', 'AGR']],
  ['att', 'Atak', ['WYK', 'DYS', 'RUC']],
  ['gk', 'Bramkarz', ['REF', 'CHW', 'WYJ', 'JNJ', 'NOG']],
];

const r10k = (v) => Math.max(0, Math.round(v / 10000) * 10000);
const r100 = (v) => Math.max(0, Math.round(v / 100) * 100);
const seasonKey = (date) => { const y = +date.slice(0, 4); return String(+date.slice(5, 7) >= 7 ? y : y - 1); };
const tierOf = (game, id) => game?.leagueState?.tiers?.[id] ?? clubById(id)?.tier ?? null;
const scoutEff = (person, k, date) => staffEff('skaut', personAttr(person, k, date) ?? 10);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m));
const plMatches = (n) => `${n} ${n === 1 ? 'mecz' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'mecze' : 'meczów'}`;
const plWeeks = (n) => `${n} ${n === 1 ? 'tydzień' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'tygodnie' : 'tygodni'}`;
const plCount = (n, one, few, many) => `${n} ${n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
const plDays = (n) => `${n} ${n === 1 ? 'dzień' : 'dni'}`;
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// ------------------------------------------------------------ Stan

/** Leniwa inicjalizacja game.observe (stary zapis: puste zlecenia i raporty). */
export function ensureObserve(game) {
  if (!game) return null;
  let S = game.observe;
  if (!S || typeof S !== 'object' || S.v !== 1) S = game.observe = { v: 1, seq: 0, orders: [], reports: {} };
  S.orders ??= []; S.reports ??= {};
  return S;
}

/** Gdzie gra zawodnik: 'domestic' (polski klub), 'abroad' (klub zagraniczny) albo 'free' (bez klubu). */
export function whereKind(p) {
  if (p?.clubId) return 'domestic';
  if (isPoolContracted(p) || (p?.abroad && !p.free)) return 'abroad';
  return 'free';
}
const regionKey = (p) => scoutRegionOf(p.abroad?.country ?? p.nat);
const countryName = (p) => p.abroad?.countryName ?? NAT_NAMES[p.abroad?.country] ?? NAT_NAMES[p.nat] ?? '';

/** Opis klubu i ligi zawodnika: { club, league }. */
export function clubAndLeague(game, p) {
  const k = whereKind(p);
  if (k === 'domestic') { const c = clubById(p.clubId); const t = tierOf(game, p.clubId); return { club: c?.name ?? '', league: LEAGUE_NAMES[t] ?? 'IV liga' }; }
  if (k === 'abroad') return { club: poolClubLabel(p), league: `liga zagraniczna (${countryName(p)})` };
  return { club: 'bez klubu', league: 'bez klubu' };
}

// ------------------------------------------------------------ Dokładność (czyste wzory)

/**
 * Dokładność obserwatora A (0-1): 0,45 OCE + 0,30 R + 0,15 DOS + 0,10 DAN (skala efektów 1-20, podzielone przez 20).
 * Skaut: jego OCE i DOS, R z regionu zawodnika (scoutOps.scoutIndex); polski klub: znajomość ligi OBS.homeR.
 * Asystent: OCE asystenta zamiast OCE i DOS, x0,75. Bramkarz: OCE trenera bramkarzy zamiast OCE; do 21 lat średnia
 * z OCE i wyławiania talentów trenera młodzieży. Niższa liga niż klub: OCE -0,5 na każdy poziom. DAN: analityk.
 * who: { kind: 'scout', person } albo { kind: 'assistant' }.
 */
export function accuracy(game, clubId, p, who, date = game?.date) {
  const kind = whereKind(p);
  const scout = who?.kind === 'scout' ? who.person : null;
  let oce; let dos; let R;
  if (scout) {
    oce = scoutEff(scout, 'OCE', date); dos = scoutEff(scout, 'DOS', date);
    R = kind === 'abroad' ? scoutIndex(scout, regionKey(p)).R : OBS.homeR;
  } else {
    oce = staffA(game, clubId, 'asystent', 'OCE'); dos = oce;
    R = kind === 'abroad' ? OBS.assistAbroadR : OBS.homeR;
  }
  if (p.pos === 'BR') oce = staffA(game, clubId, 'bramkarze', 'OCE');
  if ((p.age ?? 25) <= 21) oce = (oce + staffA(game, clubId, 'mlodziez', 'TAL')) / 2;
  if (kind === 'domestic') {
    const pt = tierOf(game, p.clubId); const ct = tierOf(game, clubId);
    if (pt && ct && pt > ct) oce -= OBS.lowerPen * (pt - ct);
  }
  const dan = staffA(game, clubId, 'analityk', 'DAN');
  const w = OBS.w;
  const A = (w.oce * oce + w.reg * R + w.dos * dos + w.dan * dan) / 20 * (scout ? 1 : OBS.assistMul);
  return clamp(A, OBS.aMin, OBS.aMax);
}

/** Odchylenie błędu atrybutu: 4,5 (1 - A) + 0,7. */
export const attrSd = (A) => OBS.sdK * (1 - A) + OBS.sdBase;
/** Liczba ujawnionych cech: 4 (A do 0,35) do 10 (A od 0,85). */
export const revealCount = (A) => Math.round(OBS.reveal.min + (OBS.reveal.max - OBS.reveal.min) * clamp((A - OBS.reveal.aLo) / (OBS.reveal.aHi - OBS.reveal.aLo), 0, 1));
/** Mnożnik liczby obserwacji: mecze 1 / pierwiastek(n), najmniej 0,45; okres z tabeli tygodni. */
export function sampleFactor(mode, { watched = 0, weeks = 0 } = {}) {
  if (mode === 'period') return OBS.period[weeks] ?? OBS.sampleFloor;
  return watched > 0 ? Math.max(OBS.sampleFloor, 1 / Math.sqrt(watched)) : 1;
}

/**
 * Zakres cechy widziany przez obserwatora: estymata = prawda + wspólny błąd + szum (sd x mnożnik), zakres to
 * estymata ±1 sd zaokrąglona, w skali 1-20 (zawsze co najmniej 2 punkty szerokości).
 */
export function seenRange(trueV, { bias, sd, z }) {
  const est = clamp(trueV + bias + sd * z, 1, 20);
  let lo = clamp(Math.round(est - sd), 1, 20); let hi = clamp(Math.round(est + sd), 1, 20);
  if (hi <= lo) { if (hi < 20) hi = lo + 1; else lo = hi - 1; }
  return { est, lo, hi };
}

/**
 * Parytet klubów AI: funkcja OVR widzianego przez klub clubId przy zakupie (ten sam wzór co raport obserwatora,
 * sztab klubu z widoku game.training.staff, stały błąd dla pary klub-zawodnik w sezonie). OBS.ai.on = false: prawda.
 */
export function aiSeenOvr(game, clubId, date = game?.date ?? '2026-07-01') {
  if (!OBS.ai.on || !game?.seed) return (p) => p.ovr;
  const oce0 = staffA(game, clubId, 'skaut', 'OCE'); const dos = staffA(game, clubId, 'skaut', 'DOS');
  const sie = staffA(game, clubId, 'skaut', 'SIE'); const dan = staffA(game, clubId, 'analityk', 'DAN');
  const ct = tierOf(game, clubId); const season = seasonKey(date); const w = OBS.w;
  const memo = new Map();
  return (p) => {
    if (memo.has(p.id)) return memo.get(p.id);
    let oce = oce0;
    if (p.clubId) { const pt = tierOf(game, p.clubId); if (pt && ct && pt > ct) oce -= OBS.lowerPen * (pt - ct); }
    const R = p.clubId ? OBS.homeR : 0.65 * sie;
    const A = clamp((w.oce * oce + w.reg * R + w.dos * dos + w.dan * dan) / 20, OBS.aMin, OBS.aMax);
    const rng = new Rng(`obserwator-ai:${game.seed}:${clubId}:${p.id}:${season}`);
    const v = p.ovr + rng.gauss(0, OBS.bias * (1 - A)) + rng.gauss(0, attrSd(A) * OBS.ai.sample / Math.sqrt(revealCount(A)));
    memo.set(p.id, v);
    return v;
  };
}

// ------------------------------------------------------------ Obserwatorzy

const activeOrders = (game) => (game.observe?.orders ?? []).filter((o) => o.status === 'active');
/** Ile obserwacji naraz prowadzi skaut: 2, z doświadczeniem od 16 (skala efektów): 3. */
export const scoutSlots = (person, date) => (scoutEff(person, 'DOS', date) >= OBS.slotsDos ? OBS.slotsHigh : OBS.slots);
const assistantOf = (game, clubId) => rosterOf(game, clubId).find((x) => x.role === 'asystent') ?? null;
const analystOf = (game, clubId) => rosterOf(game, clubId).find((x) => x.role === 'analityk') ?? null;
/** Dyrektor sportowy klubu: { name, ryn } albo null (wakat). Gra bez stanu sztabu: neutralny dyrektor. */
function directorInfo(game, clubId) {
  if (!game.staff?.dirInit?.[clubId]) return { name: null, ryn: 10 };
  const d = directorOf(game, clubId);
  return d ? { name: d.name, ryn: personAttr(d, 'RYN', game.date) ?? 10 } : null;
}

/**
 * Kto może obserwować zawodnika p: skauci klubu (powód, gdy zajęty: wyjazd za granicę albo pełne sloty) i asystent.
 * best: domyślny obserwator (kandydat z misji: jego skaut, potem wolny skaut z najlepszą dokładnością, potem asystent).
 */
export function observerOptions(game, p) {
  const clubId = game.clubId; const date = game.date;
  const act = activeOrders(game);
  const used = (id) => act.filter((o) => o.observer.id === id).length;
  const scouts = (game.staff ? clubScouts(game, clubId) : []).map((s) => {
    const n = used(s.id); const slots = scoutSlots(s, date);
    const why = s.mission ? `${s.name} jest na wyjeździe za granicą` : n >= slots ? `${s.name} prowadzi już ${n} ${n === 1 ? 'obserwację' : 'obserwacje'}` : null;
    return { kind: 'scout', id: s.id, name: s.name, person: s, why, a: accuracy(game, clubId, p, { kind: 'scout', person: s }, date) };
  });
  const asst = assistantOf(game, clubId);
  const hasAsst = !game.staff || !!asst;
  const asstBusy = act.filter((o) => o.observer.kind === 'assistant').length >= OBS.assistSlots;
  const assistant = { kind: 'assistant', id: 'asystent', name: asst?.name ?? 'Asystent trenera', why: !hasAsst ? 'W sztabie nie ma asystenta trenera' : asstBusy ? 'Asystent obserwuje już innego zawodnika' : null };
  const free = scouts.filter((x) => !x.why).sort((a, b) => b.a - a.a || a.id.localeCompare(b.id));
  const mission = p.scout?.club === clubId ? free.find((x) => x.name === p.scout.scout) : null; // kandydat z wyjazdu: ten sam skaut pogłębia raport
  const best = mission ?? free[0] ?? (assistant.why ? null : assistant);
  return { scouts, assistant, best, noScouts: !scouts.length };
}

// ------------------------------------------------------------ Zlecenie

const normMode = (mode) => (OBS_MODES[mode] ? mode : 'match');
/**
 * Zawodnik bez polskiego klubu (za granicą albo wolny): tylko obserwacja przez okres. Ligi zagraniczne i wolni nie mają
 * w grze meczów, więc raport nie pokazuje meczów, ocen ani goli, tylko cechy, zdrowie, charakter i rynek (Nov 25, 2026).
 */
export const periodOnly = (p) => whereKind(p) !== 'domestic';
function normOrder(o = {}, onlyPeriod = false) {
  const mode = onlyPeriod ? 'period' : normMode(o.mode);
  const n = mode === 'match' ? 1 : mode === 'matches' ? clamp(Math.round(Number(o.n) || 3), OBS.matches.min, OBS.matches.max) : 0;
  const weeks = mode === 'period' ? clamp(Math.round(Number(o.weeks) || 4), OBS.weeks.min, OBS.weeks.max) : 0;
  return { mode, n, weeks, who: o.who ?? null };
}

/** Najbliższe mecze klubu (o stawkę, nierozegrane) od daty. */
const nextFixtures = (game, clubId, date) => (game.fixtures ?? []).filter((f) => !f.played && f.comp !== 'friendly' && f.date > date && (f.home === clubId || f.away === clubId)).sort((a, b) => a.date.localeCompare(b.date));

/** Koszt zlecenia: zagranica 3 000 zł za mecz albo 8 000 zł za tydzień okresu, w Polsce bez kosztów. */
export function orderCost(p, o) {
  if (whereKind(p) !== 'abroad') return 0;
  return o.mode === 'period' ? OBS.cost.week * o.weeks : OBS.cost.match * (o.mode === 'match' ? 1 : o.n);
}

/** Ostatni raport o zawodniku (albo null) i czy jest nieaktualny. */
export function lastReport(game, pid) {
  const list = game.observe?.reports?.[pid] ?? [];
  const r = list[list.length - 1] ?? null;
  return r ? { r, idx: list.length - 1, stale: game.date > r.until } : null;
}
/** Zlecenie w toku dla zawodnika (albo null). */
export const activeOrderFor = (game, pid) => (game.observe?.orders ?? []).find((o) => o.pid === pid && o.status === 'active') ?? null;

/**
 * Wycena zlecenia (okno zlecenia): { ok, errors, warnings, observer, options, cost, costText, ready, order }.
 * Błędy i ostrzeżenia to gotowe zdania (docs/raport-obserwatora.md, teksty rozdz. 7).
 */
export function orderQuote(game, pid, raw = {}) {
  ensureObserve(game);
  const p = game.world?.players?.[pid];
  const o = normOrder(raw, !!p && periodOnly(p));
  const errors = []; const warnings = [];
  if (!p) return { ok: false, errors: ['Nie ma takiego zawodnika.'], warnings, observer: null, options: null, cost: 0, costText: '', ready: null, order: o };
  if (!game.clubId) errors.push('Bez klubu nie zlecisz obserwacji.');
  if (p.clubId && p.clubId === game.clubId) errors.push('Własnych zawodników opisuje Raport asystenta.');
  if (activeOrderFor(game, pid)) errors.push('Ten zawodnik jest już na zleceniu.');
  const options = game.clubId ? observerOptions(game, p) : { scouts: [], assistant: null, best: null, noScouts: true };
  let observer = options.best;
  if (o.who) {
    const pick = o.who === 'asystent' ? options.assistant : options.scouts.find((x) => x.id === o.who);
    if (pick && !pick.why) observer = pick;
    else if (pick?.why) errors.push(`${pick.why}.`);
  }
  if (!observer) errors.push('Wszyscy skauci są w drodze. Spróbuj później albo zmień skauta.');
  const kind = whereKind(p);
  const cost = orderCost(p, o);
  const bal = game.finance?.clubs?.[game.clubId]?.balance;
  if (cost > 0 && bal != null && bal < cost) errors.push('Na raport nie starcza budżetu.');
  if (kind === 'abroad') warnings.push('Zawodnik gra za granicą, więc wyjazd kosztuje więcej, a skaut może tam mniej widzieć. Z ligi zagranicznej nie mamy statystyk meczów, raport opisze to, co skaut zobaczy w czasie okresu.');
  if (kind === 'free') warnings.push('Zawodnik nie ma klubu i nie gra meczów o stawkę. Skaut obejrzy go na treningach w czasie okresu.');
  if (kind === 'domestic' && tierOf(game, p.clubId) > tierOf(game, game.clubId)) warnings.push('Zawodnik gra w niższej lidze, jego liczby mogą być zawyżone.');
  if (p.injuryDays > 0) warnings.push('Zawodnik jest kontuzjowany. Mecze liczą się od jego powrotu.');
  if (observer?.kind === 'assistant') warnings.push(options.noScouts ? 'Nie mamy skauta, raport napisze asystent, ogólniej i bez opisu charakteru.' : 'Bez wolnego skauta raport napisze asystent, bez opisu charakteru.');
  const costText = cost ? `Koszt z podróżą: ${fmtZl(cost)}${o.mode === 'matches' ? ` (${fmtZl(OBS.cost.match)} za mecz)` : ''}` : 'Koszt: 0 zł (bez wyjazdu za granicę)';
  // Termin: n-ty najbliższy mecz klubu (dzień po nim), zawodnik bez polskiego klubu: mecz co tydzień, okres: koniec
  let ready;
  const date = game.date;
  if (o.mode === 'period') ready = addDays(date, 7 * o.weeks);
  else { const fx = nextFixtures(game, p.clubId, date)[o.n - 1]; ready = fx ? addDays(fx.date, 1) : null; }
  return { ok: !errors.length, errors, warnings, observer: observer ? { kind: observer.kind, id: observer.id, name: observer.name } : null, options, cost, costText, ready, order: o };
}

/** Zleca obserwację: { ok, text, order }. Okres za granicą płacony z góry, mecze za granicą po każdym wyjeździe. */
export function createOrder(game, pid, raw = {}) {
  const q = orderQuote(game, pid, raw);
  if (!q.ok) return { ok: false, text: q.errors[0], order: null };
  const S = ensureObserve(game);
  const p = game.world.players[pid];
  const date = game.date; const o = q.order;
  S.seq += 1;
  const order = {
    id: `obs${S.seq}`, pid, club: game.clubId, mode: o.mode, n: o.n, weeks: o.weeks, start: date,
    end: o.mode === 'period' ? addDays(date, 7 * o.weeks) : null, until: addDays(date, OBS.expiry),
    observer: q.observer, kind: whereKind(p), cost: 0, games: [], seen: [], scanFrom: addDays(date, 1), lastMin: p.season?.min ?? 0,
    status: 'active', name: p.name, deepen: !!(p.scout?.club === game.clubId),
  };
  if (order.kind === 'abroad' && o.mode === 'period') {
    order.cost = q.cost;
    book(game.finance, game.clubId, date, 'out', 'scouts', q.cost, `Obserwacja: ${p.name} (${q.observer.name})`);
  }
  S.orders.push(order);
  const what = o.mode === 'period' ? `przez ${plWeeks(o.weeks)}` : o.mode === 'match' ? 'w najbliższym meczu' : `w ${o.n} kolejnych meczach`;
  return { ok: true, text: `${q.observer.name} obejrzy ${p.name} ${what}.${q.ready ? ` Raport około ${fmtDate(q.ready)}.` : ''}`, order };
}

/** Odwołanie zlecenia (bez zwrotu kosztów już poniesionych). */
export function cancelOrder(game, orderId) {
  const o = game.observe?.orders?.find((x) => x.id === orderId && x.status === 'active');
  if (!o) return { ok: false, text: 'Nie ma takiego zlecenia.' };
  o.status = 'cancelled'; o.closed = game.date;
  return { ok: true, text: `Obserwacja ${o.name} odwołana.` };
}

const watchedOf = (o) => o.games.filter((g) => g.k === 'seen').length;

/** Stan zlecenia słowami (lista „Obserwacje”, podpowiedź menu, karta zawodnika). */
export function orderStatusText(game, o) {
  const p = game.world?.players?.[o.pid];
  const w = watchedOf(o);
  if (p?.injuryDays > 0) return 'wstrzymano na czas kontuzji';
  const last = o.games[o.games.length - 1];
  if (o.mode === 'period') return `trwa obserwacja, jeszcze ${plDays(Math.max(0, daysBetween(game.date, o.end)))}${w ? `, obejrzano ${plMatches(w)}` : ''}`;
  if (!o.games.length) return 'czeka na pierwszy mecz';
  if (last && last.k === 'bench' && w < o.n) return `zawodnik nie gra, mecz się nie liczy (obejrzano ${w} z ${plMatches(o.n)})`;
  return `obejrzano ${w} z ${plMatches(o.n)}`;
}

// ------------------------------------------------------------ System dnia

/** Mecze zawodnika z polskim klubem od ostatniego przeglądu: obejrzany (z oceną z p.fh), kontuzja, pauza albo ławka. */
function realGames(game, o, p, date) {
  const club = p.clubId;
  const list = (game.fixtures ?? []).filter((f) => f.played && f.comp !== 'friendly' && f.date >= o.scanFrom && f.date <= date && (f.home === club || f.away === club)
    && !o.seen.includes(f.id ?? `${f.date}:${f.home}:${f.away}`)).sort((a, b) => a.date.localeCompare(b.date));
  const out = [];
  const curMin = p.season?.min ?? 0;
  const played = list.filter((f) => (p.fh ?? []).some((e) => e[1] === f.date)).length;
  for (const f of list) {
    o.seen.push(f.id ?? `${f.date}:${f.home}:${f.away}`);
    if (o.mode === 'period' && f.date > o.end) continue;
    const home = f.home === club ? 1 : 0;
    const opp = home ? f.away : f.home;
    const base = { d: f.date, opp, home, comp: f.comp };
    const fh = (p.fh ?? []).find((e) => e[1] === f.date && e[2] === opp);
    if (fh) {
      const delta = curMin - (o.lastMin ?? 0);
      const min = played === 1 && delta > 0 && delta <= 130 ? delta : 90;
      out.push({ ...base, k: 'seen', r: fh[0], g: fh[4] ?? 0, a: fh[5] ?? 0, min });
    } else if (p.injuryDays > 0) out.push({ ...base, k: 'injury' });
    else if (p.suspended > 0 || Object.values(p.susp ?? {}).some((v) => v > 0)) out.push({ ...base, k: 'susp' });
    else out.push({ ...base, k: 'bench' });
  }
  o.lastMin = curMin;
  o.scanFrom = addDays(date, -1); // mecz klubu gracza gra się po systemach dnia: sprawdzamy go jeszcze następnego dnia
  if (o.seen.length > 40) o.seen = o.seen.slice(-40);
  return out;
}

/** Jeden dzień zlecenia: nowe mecze, koszty wyjazdów, koniec (raport) albo wygaśnięcie. Zwraca wiadomości. */
function orderDay(game, o, date) {
  const p = game.world.players[o.pid];
  if (!p) { o.status = 'cancelled'; o.closed = date; return []; }
  if (p.clubId === game.clubId) { o.status = 'cancelled'; o.closed = date; return []; } // zawodnik jest już u nas
  const fresh = p.clubId && o.kind === 'domestic' ? realGames(game, o, p, date) : []; // za granicą i wolny: bez meczów (periodOnly)
  for (const g of fresh) {
    if (o.mode === 'matches' || o.mode === 'match') { if (watchedOf(o) >= o.n) break; }
    o.games.push(g);
    if (o.kind === 'abroad' && o.mode !== 'period' && (g.k === 'seen' || g.k === 'bench')) {
      o.cost += OBS.cost.match;
      book(game.finance, o.club, date, 'out', 'scouts', OBS.cost.match, `Obserwacja: ${o.name} (${o.observer.name})`);
    }
  }
  const w = watchedOf(o);
  const done = o.mode === 'period' ? date >= o.end : w >= o.n;
  if (done || date >= o.until) {
    if (w > 0 || (o.kind !== 'domestic' && o.mode === 'period' && done)) return [finishOrder(game, o, date)];
    o.status = 'expired'; o.closed = date;
    return [createMessage({ date, key: `obs-expired:${o.pid}:${o.id}`, category: 'transfers', from: o.observer.name, priority: 'info', subject: `Obserwacja bez raportu: ${o.name}`, body: `${o.name} nie zagrał w żadnym meczu w czasie zlecenia (kontuzja, pauza albo ławka). Zlecenie wygasło bez raportu. Możesz zlecić nową obserwację, gdy zacznie grać.`, refs: { kind: 'obsExpired', pid: o.pid } })];
  }
  return [];
}

/** Dzień systemu obserwacji (po meczach dnia, przed transferami). */
export function observeDay(game, date) {
  const S = game.observe;
  if (!S?.orders?.length || !game.world) return [];
  const out = [];
  for (const o of S.orders) if (o.status === 'active') out.push(...orderDay(game, o, date));
  // Historia zleceń: aktywne i 20 ostatnich zamkniętych
  const closed = S.orders.filter((o) => o.status !== 'active');
  if (closed.length > 20) { const drop = new Set(closed.slice(0, closed.length - 20).map((o) => o.id)); S.orders = S.orders.filter((o) => !drop.has(o.id)); }
  return out;
}

registerDailySystem({
  id: 'observe', order: 52.6,
  run(game, date) {
    if (!game.world || !game.observe?.orders?.length) return {};
    return { messages: observeDay(game, date) };
  },
});

// ------------------------------------------------------------ Teksty (warianty z ziarna raportu)

const T = {
  head: ['Raport napisał {autor}, {data}. Obejrzane mecze: {mecze}, rozgrywki: {liga}.', '{data}, autor: {autor}. Widziałem {mecze} w rozgrywkach: {liga}.', 'Obserwował {autor}. Obejrzane mecze: {mecze} ({liga}), raport z dnia {data}.'],
  period: ['Obserwacja trwała {tygodnie} tyg.', 'Zlecenie obejmowało {tygodnie} tyg. meczów {klub}.'],
  noScout: ['Raport napisał asystent trenera ({autor}). Skauta w klubie nie mamy, więc obraz jest ogólny.', 'Nie mamy skauta, więc zawodnika ocenił asystent ({autor}) na podstawie meczów i danych.'],
  busyScout: ['Raport napisał asystent trenera ({autor}), bo żaden skaut nie był wolny. Obraz jest ogólny.'],
  profile: ['{imie} {nazwisko}, {wiek} lat, {pozycja}. Gra w klubie {klub} ({liga}), umowa do {kontrakt_do}.', '{wiek}-letni {pozycja} z klubu {klub}. Kontrakt do {kontrakt_do}.', '{imie} {nazwisko} ({wiek}) występuje jako {pozycja} w {klub}. Umowę ma do {kontrakt_do}.'],
  profileFree: ['{imie} {nazwisko}, {wiek} lat, {pozycja}. Bez klubu i bez kontraktu.'],
  alt: ['Może też zagrać jako {pozycje_dodatkowe}.', 'W razie potrzeby gra także: {pozycje_dodatkowe}.'],
  noAlt: ['Bez innych pozycji, to zawodnik jednej roli.'],
  abroad: ['Gra za granicą ({kraj}), więc oceniałem go na tle tamtejszej ligi.', 'Klub z kraju {kraj}. Poziom ligi trzeba brać pod uwagę.', 'Liga zagraniczna ({kraj}): do porównania z naszą potrzeba ostrożności.'],
  lower: ['Gra w niższej lidze, więc liczby mogą wyglądać lepiej niż przy naszym poziomie.', 'Rywale są słabsi niż u nas, dlatego jego dobre liczby oceniam ostrożnie.', 'Niższy poziom rozgrywek: nie wszystko, co mu wychodzi tam, wyjdzie u nas.'],
  strongTop: ['Bardzo dobry: {cechy}.', 'Wyróżnia się: {cechy}. To jego najmocniejsza część gry.', 'Na wysokim poziomie ma {cechy}.'],
  strong: ['Dobry: {cechy}.', 'Solidnie wypadają: {cechy}.', 'Na plus: {cechy}.'],
  weak: ['Słaby: {cechy}.', 'Braki: {cechy}. W meczach było to widać.', 'Do poprawy: {cechy}.'],
  flat: ['Nic nie wyróżnia się na plus ani na minus.', 'Nie ma mocnych ani słabych stron, które rzucałyby się w oczy.'],
  noData: ['Nie ocenię: {cechy}, za mało okazji.', 'Brak danych o: {cechy}.'],
  stats: ['W obejrzanych meczach: {minuty} minut, {gole_txt}, {asysty_txt}, średnia ocena {ocena}.', 'Przy mnie zagrał {minuty} minut. Gole: {gole}, asysty: {asysty}, ocena meczów: {ocena}.', 'Obejrzane mecze: {minuty} minut na boisku, {gole_txt} i {asysty_txt}, ocena {ocena}.'],
  up: ['Forma rośnie, z meczu na mecz gra lepiej.', 'Ostatnie mecze były wyraźnie lepsze od pierwszych.', 'Idzie w górę, widać wzrost pewności.'],
  flatForm: ['Forma stabilna, gra na podobnym poziomie.', 'Mecze podobne do siebie, bez dużych wahań.', 'Trzyma równy poziom.'],
  down: ['Forma spada, ostatnie mecze były słabsze.', 'Z meczu na mecz gra gorzej.', 'Widać spadek, ostatni występ był najsłabszy.'],
  oneForm: ['Co do formy, jeden mecz nic nie mówi.', 'Trendu nie widzę, bo nie ma z czym porównać.'],
  fewMin: ['Grał mało minut, więc o formie wiem niewiele.', 'Rzadko schodził z ławki, ocena opiera się na krótkich fragmentach.', 'Prawie nie grał w obejrzanych meczach. Warto zobaczyć go jeszcze raz.'],
  noRegular: ['W klubie nie ma regularnej gry, w kolejnych meczach siedział na ławce.', 'Trzy razy nie wyszedł na boisko, to zawodnik rezerwowy.'],
  healthy: ['Bez kontuzji, nic niepokojącego w tym sezonie.', 'Zdrowy, urazów nie widziałem.', 'Zdrowy i w pełni dostępny.'],
  injNow: ['Jest kontuzjowany, przerwa potrwa jeszcze około {dni} dni.', 'Teraz leczy uraz, wróci za około {dni} dni.'],
  injDuring: ['W czasie obserwacji nie grał z powodu urazu, mecze liczone są od powrotu.', 'Przerwa przez kontuzję wstrzymała zlecenie.'],
  fragile: ['Urazy wracają, trzeba liczyć się z kolejnymi przerwami.', 'Często pauzuje, trzeba liczyć się z kolejnymi przerwami.', 'To zawodnik podatny na urazy.'],
  riskHi: ['Przy naszym grafiku meczów to ryzyko byłoby większe niż zwykle.'],
  riskLo: ['Nie widzę powodów do obaw o zdrowie.'],
  oneHealth: ['Podczas meczu nie zauważyłem urazu, historii zdrowia mogę nie znać.'],
  short: ['Za krótko go obserwowałem, by pisać o charakterze.', 'Charakteru nie oceniam, widziałem zbyt mało.', 'Osobowość pozostaje nieznana: za krótka obserwacja.'],
  noChar: ['Charakteru nie oceniam, to nie moja specjalność.'],
  lider: ['Widać lidera: wskazuje kolegom, gdzie stać, i bierze odpowiedzialność.', 'Prowadzi drużynę głosem i przykładem.', 'Ma cechy lidera, koledzy go słuchają.'],
  prof: ['Profesjonalista, solidny w pracy i w zachowaniu.', 'Podchodzi do gry poważnie, bez wybryków.', 'Dobrze przygotowany, można na nim polegać.'],
  hot: ['Porywczy, łatwo traci nerwy, a to kosztuje kartki.', 'Łapie kartki i dyskutuje z sędzią.', 'Ma gorącą głowę, trzeba go pilnować.'],
  moody: ['Zmienny: raz gra świetnie, raz słabo.', 'Mecze lepsze i gorsze, trudno przewidzieć, jaki będzie.', 'Nierówny, wiele zależy od dnia.'],
  ambit: ['Zależy mu na grze, nie zadowoli się ławką.', 'Chce być pierwszoplanową postacią.'],
  calm: ['Spokojny charakter, bez konfliktów w drużynie.'],
  acclim: ['Po przeprowadzce przez pierwsze tygodnie może grać poniżej swojego poziomu. Nie traktowałbym tego jako wady.', 'Zmiana klubu wymaga adaptacji. To zwykła sprawa, nie jego słabość.'],
  potYoung: ['Młody, z dużym zapasem rozwoju. Może urosnąć do mocnego zawodnika.', 'W jego wieku to duży talent, jest jeszcze sporo do poprawy.', 'Przed nim kilka lat rozwoju, warto go zabezpieczyć wcześnie.'],
  potYoungFlat: ['Młody, ale wiele więcej już nie wykrzesze.', 'Nie widzę dużego zapasu rozwoju.'],
  peak: ['W szczytowym wieku, to, co widać teraz, to jego poziom na kolejne lata.', 'Ma {wiek} lat i gra na maksimum możliwości.', 'Dojrzały, bez dużego miejsca na dalszy rozwój.'],
  late: ['Zbliża się do końca kariery, z każdym rokiem będzie słabszy.', 'Wiek zaczyna ciążyć, na dłużej bym na nim nie opierał.', 'Doświadczony, ale kilka lat i będzie gorzej.'],
  loan: ['Jest wypożyczony z klubu {wlasciciel}. Rozmawiamy też z właścicielem, a umowa może mieć opcję wykupu.', 'Należy do {wlasciciel}, w {klub} jest na wypożyczeniu.', 'Wypożyczenie od {wlasciciel}: decyzję o jego losie podejmuje właściciel.'],
  free: ['Wolny zawodnik, nie ma klubu, więc nie płacimy za transfer.', 'Bez klubu. Wystarczy dogadać pensję i podpis.', 'Jest wolny, kwota transferowa nie istnieje.'],
  listed: ['Klub wystawił go na listę transferową, cena jest znana.', 'Jest na liście transferowej, więc klub chętnie go sprzeda.', 'Klub chce go sprzedać, kwota jest z góry podana.'],
  abroadDeal: ['Zagraniczny klub, więc procedura przejścia może potrwać dłużej.'],
  up1: ['Od razu poprawiłby pierwszy skład. Jest lepszy niż nasz obecny zawodnik ({nasz}).', 'Wszedłby do wyjściowej jedenastki, a {nasz} usiadłby na ławce.', 'Podniesie poziom na pozycji: {nasz} musiałby rywalizować o miejsce.'],
  rot: ['Byłby dobrym zmiennikiem, ale {nasz} zostaje w składzie.', 'Poziom zbliżony, ale na dziś {nasz} jest o krok przed nim. Dobry do rotacji.', 'Pomoże w rotacji, ławkę wzmocni, pierwszego składu raczej nie.'],
  dev: ['Dziś słabszy, {nasz} jest przed nim, ale z czasem może go dogonić.', 'To inwestycja na przyszłość. Teraz usiądzie na ławce albo w rezerwach.', 'Potrzebuje czasu i minut. Za dwa, trzy lata może być ważny.'],
  no: ['Nie poprawi naszej kadry, {nasz} jest lepszy.', 'Nie widzę dla niego miejsca u nas, jest słabszy niż nasz zawodnik ({nasz}).', 'Do naszego poziomu mu brakuje i nie pomoże nam ani w składzie, ani na ławce.'],
  gap: ['Na tej pozycji nie mamy nikogo, więc od razu wszedłby do składu.', 'Zapełnia lukę na pozycji {nasz_pozycja}.'],
  price: ['Cena orientacyjna: od {cena_od} do {cena_do}.', 'Klub może oczekiwać kwoty między {cena_od} a {cena_do}.', 'Za takiego zawodnika płaci się zwykle {cena_od} do {cena_do}.'],
  wage: ['Pensja: od {pensja_od} do {pensja_do} tygodniowo.', 'Po przejściu może zarabiać {pensja_od} do {pensja_do} na tydzień.', 'Oczekiwania płacowe: {pensja_od} do {pensja_do} tygodniowo.'],
  contract: ['Umowa do {kontrakt_do}. Im bliżej końca, tym tańszy.', 'Kontrakt obowiązuje do {kontrakt_do}.', 'Zostało mu czasu do {kontrakt_do}.'],
  contractShort: ['Umowa niedługo wygasa, w tym czasie można pytać o przyszłość.', 'Zostało mało czasu, klub raczej nie będzie żądał dużo.'],
  nfs: ['Klub nie chce go sprzedać, to jeden z jego najlepszych zawodników.'],
  noDir: ['Nie mamy dyrektora sportowego, cena w bardzo szerokim przedziale: od {cena_od} do {cena_do}. Szansy na przejście nie oceniam.', 'Bez dyrektora sportowego podaję tylko widełki: {cena_od} do {cena_do}. Pensji i kontraktu nie opisuję szczegółowo.'],
  will: {
    'chętny': ['Zawodnik chętnie by przeszedł, nie widzę przeszkód.', 'Rozmowy powinny pójść łatwo, jest zainteresowany.', 'Chce zmienić klub, nasza oferta będzie dla niego atrakcyjna.'],
    'do przekonania': ['Da się go przekonać, ale trzeba mu dać argumenty (rola, pensja, projekt).', 'Nie odmówi od razu, wymaga rozmowy i dobrej oferty.', 'Szanse są, o ile pokażemy mu miejsce w składzie.'],
    'raczej nie': ['Raczej nie przejdzie, jest związany z klubem.', 'Rozmowa będzie trudna, wyraźnie woli zostać.', 'Mała szansa, potrzeba mocnego argumentu.'],
    odmowa: ['Zawodnik nie jest zainteresowany, odmówi.', 'Nie widzę szansy na zgodę, lepiej odpuścić.', 'Klub albo zawodnik zamykają temat.'],
  },
  take: ['Bierzemy. {imie} {nazwisko} wzmocni nas na pozycji {pozycja}.', 'Bierzemy. Dobra jakość i realna szansa na transfer.', 'Bierzemy. To ruch, który się opłaci.'],
  watch: ['Obserwować dalej. Widziałem za mało, żeby zdecydować.', 'Obserwować dalej. Dobry zawodnik, ale warto zobaczyć go w kolejnych meczach.', 'Obserwować dalej. Rośnie, daj mu jeszcze kilka tygodni.', 'Obserwować dalej. Są plusy i minusy, bez pośpiechu.'],
  watchOne: ['Obserwować dalej. Jeden mecz to za mało, żeby ruszyć z ofertą.'],
  skip: ['Odpuścić. Nie podniesie nam poziomu.', 'Odpuścić. Cena i ryzyko są za duże wobec tego, co daje.', 'Odpuścić. Lepsze opcje są dostępne.', 'Odpuścić. Zawodnik nie chce przyjść albo jest kontuzjowany na długo.'],
  introOne: ['Widziałem go tylko raz, więc to pierwsze wrażenie.', 'Jeden mecz to niewiele, piszę ostrożnie.', 'Obejrzałem jeden występ, wnioski trzeba traktować jako wstępne.'],
  introMid: ['Po kilku meczach obraz się układa, ale zostawiam otwarte pytania.', 'Widziałem go kilka razy, to, co powtarza się, uznaję za jego cechy.', 'Pierwsze wnioski się potwierdzają.'],
  introLong: ['Widziałem go w wielu meczach, więc piszę wprost.', 'Obserwowałem go dłużej, ocena jest pełniejsza.', 'Przyjrzałem się całemu okresowi, a nie jednemu występowi.'],
  deepen: ['Pogłębiam raport z wyjazdu: tym razem widziałem go w meczach na miejscu.'],
};

// Słowa cech 1-20 i opisy ukrytych cech
const attrWord = (v) => (v >= 15 ? 'bardzo dobry' : v >= 12 ? 'dobry' : v >= 9 ? 'przeciętny' : 'słaby');
const band5 = (v) => (v >= 15.5 ? 0 : v >= 12.5 ? 1 : v >= 8.5 ? 2 : v >= 5.5 ? 3 : 4);
const W5 = {
  PRF: ['wzorowy profesjonalista', 'solidny profesjonalista', 'przeciętne podejście', 'bywa niedbały', 'niedbały, trzeba go pilnować'],
  TMP: ['porywczy, często traci głowę', 'nerwowy, łapie kartki', 'normalny temperament', 'spokojny', 'bardzo opanowany'],
  KON: ['bardzo równa forma', 'równa forma', 'forma jak u większości', 'chimeryczny, mecze lepsze i gorsze', 'bardzo chimeryczny'],
  WAZ: ['rośnie w ważnych meczach', 'dobrze znosi presję', 'w ważnych meczach gra jak zwykle', 'presja mu ciąży', 'spina się w ważnych meczach'],
};
const WILL_MAP = { 'chętny': 'chętny', otwarty: 'do przekonania', 'niechętny': 'raczej nie', odmowa: 'odmowa' };
const WILL_ORDER = ['odmowa', 'raczej nie', 'do przekonania', 'chętny'];
const posWord = (pos) => lower(POS_NAMES[pos] ?? pos);
const attrName = (k) => lower(ATTRS[k]?.name ?? k);
const joinPl = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} i ${xs[xs.length - 1]}`);
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

// ------------------------------------------------------------ Raport

/** Nasz najlepszy zawodnik na pozycji (i drugi): z kadry gracza, biegłość od 85 %, wartość ovrAt na tej pozycji. */
export function ourBestAt(game, pos) {
  if (!game.clubId || !game.world?.clubs?.[game.clubId]) return [];
  return squadOf(game.world, game.clubId).filter((q) => proficiency(q, pos) >= 85)
    .map((q) => ({ id: q.id, name: q.name, pos: q.pos, age: q.age, v: q.pos === pos ? q.ovr : ovrAt(q.attr, pos), attr: q.attr }))
    .sort((a, b) => b.v - a.v).slice(0, 2);
}

/** Kto pisze raport w dniu zakończenia: skaut (jeśli nadal w klubie) albo asystent. */
function authorOf(game, o) {
  if (o.observer.kind === 'scout') {
    const person = game.staff?.people?.[o.observer.id];
    if (person && person.club === o.club) return { kind: 'scout', person, name: person.name };
  }
  return { kind: 'assistant', person: null, name: assistantOf(game, o.club)?.name ?? 'Asystent trenera' };
}

/**
 * Raport z zakończonego zlecenia (dane widziane przez obserwatora: przedziały i słowa, bez prawdziwych liczb).
 * Ziarno: gra, zlecenie, zawodnik; jeden wspólny błąd na cały raport (słaby obserwator przecenia albo nie docenia
 * całego zawodnika, łącznie z werdyktem i rekomendacją).
 */
export function buildReport(game, o, date = game.date) {
  const p = game.world.players[o.pid];
  const rng = new Rng(`obserwator:${game.seed}:${o.id}:${o.pid}`);
  const pick = (list) => list[Math.floor(rng.next() * list.length)];
  const clubId = o.club;
  const who = authorOf(game, o);
  const A = accuracy(game, clubId, p, who, date);
  const watched = watchedOf(o);
  const f = sampleFactor(o.mode, { watched, weeks: o.weeks });
  const sd = attrSd(A) * f;
  const bias = rng.gauss(0, OBS.bias * (1 - A));
  const pos = p.pos;
  const keys = attrsFor(pos);
  const off = OFF[pos] ?? {};
  // Wszystkie cechy z błędem (do oceny ogólnej i roli); ujawnione najważniejsze na pozycji (4-10)
  const est = {}; const ranges = {};
  for (const k of keys) { const r = seenRange(p.attr?.[k] ?? 10, { bias, sd, z: rng.gauss(0, 1) }); est[k] = r.est; ranges[k] = r; }
  const order = keys.map((k) => ({ k, w: (off[k] ?? 0) + rng.next() * 0.1 })).sort((a, b) => b.w - a.w).map((x) => x.k);
  const shown = new Set(order.slice(0, revealCount(A)));
  const attrs = order.map((k) => (shown.has(k) ? { k, lo: ranges[k].lo, hi: ranges[k].hi } : { k, none: true }));
  const seenOvr = Math.round(ovrAt(est, pos) * 10) / 10;
  // Mocne i słabe strony słowami (względem poziomu zawodnika)
  const mid = (k) => (ranges[k].lo + ranges[k].hi) / 2;
  const vis = [...shown];
  const strong = vis.filter((k) => mid(k) >= seenOvr + 1).sort((a, b) => mid(b) - mid(a)).slice(0, 3);
  const weak = vis.filter((k) => mid(k) <= seenOvr - 1).sort((a, b) => mid(a) - mid(b)).slice(0, 3);
  const words = { strong: strong.map((k) => ({ k, word: attrWord(mid(k)) })), weak: weak.map((k) => ({ k, word: attrWord(mid(k)) })) };
  // Grupy cech: średnie zakresów ujawnionych cech
  const groups = OBS_GROUPS.map(([key, label, ks]) => {
    const inG = ks.filter((k) => shown.has(k));
    if (!inG.length) return { key, label, none: true };
    return { key, label, lo: Math.round(avg(inG.map((k) => ranges[k].lo))), hi: Math.round(avg(inG.map((k) => ranges[k].hi))) };
  });
  // Potencjał (młodsi: szerszy opis i przedział)
  const age = p.age ?? 25;
  const youngMul = age <= 21 ? 1.3 : 1;
  const potSeen = clamp(Math.max(seenOvr, (p.hidden?.POT ?? p.ovr) + bias + rng.gauss(0, sd * youngMul)), 1, 20);
  const phw = sd * youngMul + 0.3;
  const potential = { lo: clamp(Math.round(potSeen - phw), Math.floor(seenOvr), 20), hi: clamp(Math.round(potSeen + phw), 1, 20), young: age <= 23 };
  if (potential.hi < potential.lo) potential.hi = potential.lo;
  const head = potSeen - seenOvr;
  potential.kind = age <= 23 ? (head >= 1.5 ? 'young' : 'youngFlat') : age <= 29 ? 'peak' : 'late';
  potential.text = fill(pick(T[{ young: 'potYoung', youngFlat: 'potYoungFlat', peak: 'peak', late: 'late' }[potential.kind]]), { wiek: age });
  // Forma
  const seen = o.games.filter((g) => g.k === 'seen');
  const minutes = seen.reduce((s, g) => s + (g.min ?? 0), 0);
  const rating = avg(seen.map((g) => g.r));
  const bench = o.games.filter((g) => g.k === 'bench').length;
  const injured = o.games.filter((g) => g.k === 'injury').length;
  let trend = 0;
  if (seen.length >= 2) { const half = Math.floor(seen.length / 2); const d = avg(seen.slice(-half).map((g) => g.r)) - avg(seen.slice(0, seen.length - half).map((g) => g.r)); trend = d >= 0.3 ? 1 : d <= -0.3 ? -1 : 0; }
  const stage = watched <= 1 && o.mode !== 'period' ? 'one' : (watched >= 5 || (o.mode === 'period' && o.weeks >= 6)) ? 'long' : 'mid';
  const form = { games: o.games.map((g) => ({ ...g })), minutes, rating: rating == null ? null : Math.round(rating * 100) / 100, goals: seen.reduce((s, g) => s + (g.g ?? 0), 0), assists: seen.reduce((s, g) => s + (g.a ?? 0), 0), trend, bench, injured, noRegular: bench >= OBS.benchRun };
  const fv = { minuty: minutes, gole: form.goals, asysty: form.assists, gole_txt: plCount(form.goals, 'gol', 'gole', 'goli'), asysty_txt: plCount(form.assists, 'asysta', 'asysty', 'asyst'), ocena: rating == null ? '-' : rating.toFixed(1).replace('.', ',') };
  form.lines = [fill(pick(T.stats), fv), stage === 'one' ? pick(T.oneForm) : seen.length && minutes / seen.length < 35 ? pick(T.fewMin) : pick(trend > 0 ? T.up : trend < 0 ? T.down : T.flatForm)];
  if (form.noRegular) form.lines.push(pick(T.noRegular));
  if (o.kind !== 'domestic') { // za granicą i wolny: bez meczów i liczb (periodOnly), forma jednym zdaniem
    form.noMatches = true;
    form.lines = [o.kind === 'free'
      ? `Nie ma klubu i nie gra meczów o stawkę. Oglądałem go przez ${plWeeks(o.weeks)} na treningach, więc o formie meczowej nic pewnego nie powiem.`
      : `Oglądałem go przez ${plWeeks(o.weeks)} w lidze zagranicznej (${countryName(p) || 'za granicą'}). Statystyk z tej ligi nie mamy, opis opiera się na tym, co zobaczyłem.`];
  }
  // Zdrowie: odporność na urazy widziana z błędem (ocena zawodnika)
  const odp = clamp((p.hidden?.ODP ?? 10) + bias + rng.gauss(0, sd), 1, 20);
  const health = { now: p.injuryDays > 0 ? p.injuryDays : 0, during: injured, risk: odp <= 6 ? 'wysokie' : odp <= 9.5 ? 'umiarkowane' : 'niskie' };
  health.lines = [health.now ? fill(pick(T.injNow), { dni: health.now }) : stage === 'one' ? pick(T.oneHealth) : pick(T.healthy)];
  if (injured) health.lines.push(pick(T.injDuring));
  if (health.risk === 'wysokie') health.lines.push(pick(T.fragile), pick(T.riskHi));
  else if (health.risk === 'niskie' && !health.now) health.lines.push(pick(T.riskLo));
  // Charakter: tylko skaut, od 3 meczów albo 4 tygodni, ocena charakteru od 8
  const cha = who.kind === 'scout' ? scoutEff(who.person, 'CHA', date) : 0;
  const longEnough = watched >= OBS.persona.matches || (o.mode === 'period' && o.weeks >= OBS.persona.weeks);
  let character;
  if (who.kind !== 'scout') character = { open: false, lines: [pick(T.noChar)] };
  else if (!longEnough || cha < OBS.persona.cha) character = { open: false, lines: [pick(T.short)] };
  else {
    const sdC = (OBS.sdK * (1 - cha / 20) + OBS.sdBase) * f;
    const seenH = (k) => clamp((p.hidden?.[k] ?? 10) + rng.gauss(0, sdC), 1, 20);
    const prf = seenH('PRF'); const tmp = seenH('TMP'); const kon = seenH('KON'); const waz = seenH('WAZ');
    const lines = [];
    if (p.persona === 'Lider') lines.push(pick(T.lider));
    if (p.persona === 'Narwaniec' || tmp >= 14) lines.push(pick(T.hot));
    else if (kon <= 7) lines.push(pick(T.moody));
    else if (prf >= 13) lines.push(pick(T.prof));
    if (p.persona === 'Ambitny' || (p.traits?.ambition ?? 0) >= 15) lines.push(pick(T.ambit));
    if (!lines.length) lines.push(pick(T.calm));
    character = { open: true, lines, rows: [['Profesjonalizm', W5.PRF[band5(prf)]], ['Temperament', W5.TMP[band5(tmp)]], ['Regularność', W5.KON[band5(kon)]], ['Ważne mecze', W5.WAZ[band5(waz)]]] };
  }
  const acclim = inAcclim(p, date);
  if (acclim) character.lines.push(pick(T.acclim));
  // Rola u nas: porównanie z naszym najlepszym na pozycji (wartości widziane przez obserwatora)
  const ours = ourBestAt(game, pos);
  const best = ours[0] ?? null;
  const cmpKeys = Object.keys(off).filter((k) => off[k] >= 1.5 && keys.includes(k)).sort((a, b) => off[b] - off[a]).slice(0, 5);
  const role = { our: best ? { id: best.id, name: best.name, pos: best.pos, age: best.age, v: Math.round(best.v * 10) / 10 } : null, our2: ours[1] ? { name: ours[1].name } : null };
  role.cmp = best ? cmpKeys.map((k) => (shown.has(k) ? { k, our: best.attr?.[k] ?? null, lo: ranges[k].lo, hi: ranges[k].hi } : { k, our: best.attr?.[k] ?? null, none: true })) : [];
  if (!best) role.verdict = 'up';
  else {
    const d = seenOvr - best.v;
    if (d >= 0.5) role.verdict = 'up';
    else if (d >= -1 || (ours[1] && seenOvr >= ours[1].v - 0.3)) role.verdict = 'rot';
    else if (age <= 21 && potential.hi >= best.v) role.verdict = 'dev';
    else role.verdict = 'no';
  }
  role.text = best ? fill(pick(T[{ up: 'up1', rot: 'rot', dev: 'dev', no: 'no' }[role.verdict]]), { nasz: best.name }) : fill(pick(T.gap), { nasz_pozycja: pos });
  // Rynek (dyrektor sportowy)
  const kind = whereKind(p);
  const dir = directorInfo(game, clubId);
  const listed = game.market?.listed?.[p.id] && game.market.listed[p.id].kind !== 'loan' ? game.market.listed[p.id] : null;
  const nfs = kind === 'domestic' && game.market ? notForSale(game, p) && !p.contract?.clause : false;
  let price = null;
  if (kind !== 'free' && game.market) { try { price = kind === 'abroad' ? foreignAskingPrice(game, p) : askingPrice(game, p); } catch { price = null; } }
  const width = listed ? OBS.price.listed : dir ? hintHalfWidth(dir.ryn) : OBS.price.noDir;
  const center = (v) => (dir && !listed ? v * (1 + clamp(rng.gauss(0, width / 2), -width, width)) : v);
  const pc = price ? center(price) : 0;
  const wageBase = (p.contract?.wage ?? p.askWage ?? 0) * (kind === 'free' ? 1 : OBS.price.wageUp);
  const wc = wageBase ? center(wageBase) : 0;
  const market = {
    dir: dir?.name ?? (dir ? 'Dyrektor sportowy' : null), kind, listed: !!listed, nfs, free: kind === 'free',
    price: price && !nfs ? [r10k(pc * (1 - width)), r10k(pc * (1 + width))] : null,
    wage: wc ? [r100(wc * (1 - width)), r100(wc * (1 + width))] : null,
    until: p.contract?.until ?? null, loan: p.loan ? { from: clubById(p.loan.from)?.name ?? '', until: p.loan.until ?? null, option: p.loan.option?.fee ?? null } : null,
  };
  let will = null;
  if (dir) {
    try { will = WILL_MAP[playerWillingness(game, p).verdict] ?? 'do przekonania'; } catch { will = 'do przekonania'; }
    if (rng.chance(0.5 * (1 - clamp(dir.ryn, 1, 20) / 20))) will = WILL_ORDER[clamp(WILL_ORDER.indexOf(will) + (rng.chance(0.5) ? 1 : -1), 0, 3)];
  }
  market.will = will;
  const until = market.until ? fmtDate(market.until) : '';
  const monthsLeft = market.until ? (Number(market.until.slice(0, 4)) - Number(date.slice(0, 4))) * 12 + Number(market.until.slice(5, 7)) - Number(date.slice(5, 7)) : null;
  const mv = { cena_od: market.price ? fmtZl(market.price[0]) : '', cena_do: market.price ? fmtZl(market.price[1]) : '', pensja_od: market.wage ? fmtZl(market.wage[0]) : '', pensja_do: market.wage ? fmtZl(market.wage[1]) : '', kontrakt_do: until };
  market.lines = [];
  if (market.free) market.lines.push(pick(T.free));
  if (market.loan) market.lines.push(fill(pick(T.loan), { wlasciciel: market.loan.from, klub: clubAndLeague(game, p).club }));
  if (listed) market.lines.push(pick(T.listed));
  if (nfs) market.lines.push(pick(T.nfs));
  if (!dir && market.price) market.lines.push(fill(pick(T.noDir), mv));
  else if (market.price) market.lines.push(fill(pick(T.price), mv));
  if (dir && market.wage) market.lines.push(fill(pick(T.wage), mv));
  if (dir && until) market.lines.push(fill(pick(T.contract), mv));
  if (dir && monthsLeft != null && monthsLeft <= 6 && monthsLeft >= 0) market.lines.push(pick(T.contractShort));
  if (will) market.lines.push(pick(T.will[will]));
  if (kind === 'abroad') market.lines.push(pick(T.abroadDeal));
  market.monthsLeft = monthsLeft;
  // Rekomendacja (z wartości widzianych przez obserwatora)
  const money = game.finance?.clubs?.[clubId] ? spendable(game.finance, clubId) : Infinity;
  const tooDear = market.price && market.price[0] > money;
  const cheap = market.free || (market.price && market.price[1] <= money * 0.3);
  let rec;
  let why = null;
  if (will === 'odmowa' || health.now > 60) { rec = 'skip'; why = 3; }
  else if (role.verdict === 'no') { rec = 'skip'; why = 0; }
  else if (stage === 'one') rec = role.verdict === 'no' ? 'skip' : 'watch';
  else if (role.verdict === 'up') { if (tooDear || nfs) { rec = 'skip'; why = 1; } else rec = 'take'; }
  else if (role.verdict === 'rot') rec = cheap && age < 30 ? 'take' : 'watch';
  else rec = cheap ? 'take' : 'watch';
  let recText;
  if (rec === 'take') recText = fill(pick(T.take), { imie: p.first ?? p.name, nazwisko: p.last ?? '', pozycja: posWord(pos) });
  else if (rec === 'skip') recText = T.skip[why ?? 0];
  else if (stage === 'one') recText = pick(T.watchOne);
  else recText = role.verdict === 'dev' ? T.watch[2] : pick(T.watch);
  // Nagłówek, profil, wstęp
  const { club, league } = clubAndLeague(game, p);
  const lines = {};
  const authorName = who.name;
  const meczeTxt = plMatches(watched);
  const hasScouts = !!game.staff && clubScouts(game, clubId).length > 0;
  lines.head = [who.kind === 'scout' ? fill(pick(T.head), { autor: authorName, data: fmtDate(date), mecze: meczeTxt, liga: league }) : fill(pick(hasScouts ? T.busyScout : T.noScout), { autor: authorName })];
  if (o.mode === 'period') lines.head.push(fill(pick(T.period), { tygodnie: o.weeks, klub: club }));
  if (o.deepen && who.kind === 'scout') lines.head.push(pick(T.deepen));
  lines.intro = pick(stage === 'one' ? T.introOne : stage === 'long' ? T.introLong : T.introMid);
  const alts = Object.entries(p.alt ?? {}).filter(([, v]) => v >= 75).map(([k]) => k);
  lines.profile = [kind === 'free' ? fill(pick(T.profileFree), { imie: p.first ?? p.name, nazwisko: p.last ?? '', wiek: age, pozycja: posWord(pos) })
    : fill(pick(T.profile), { imie: p.first ?? p.name, nazwisko: p.last ?? '', wiek: age, pozycja: posWord(pos), klub: club, liga: league, kontrakt_do: until || 'brak danych' })];
  lines.profile.push(alts.length ? fill(pick(T.alt), { pozycje_dodatkowe: joinPl(alts.map(posWord)) }) : pick(T.noAlt));
  if (kind === 'abroad') lines.profile.push(fill(pick(T.abroad), { kraj: countryName(p) }));
  if (kind === 'domestic' && tierOf(game, p.clubId) > tierOf(game, clubId)) lines.profile.push(pick(T.lower));
  const strongTop = words.strong.filter((x) => x.word === 'bardzo dobry').map((x) => attrName(x.k));
  const strongOk = words.strong.filter((x) => x.word !== 'bardzo dobry').map((x) => attrName(x.k));
  lines.sides = [];
  if (strongTop.length) lines.sides.push(fill(pick(T.strongTop), { cechy: joinPl(strongTop) }));
  if (strongOk.length) lines.sides.push(fill(pick(T.strong), { cechy: joinPl(strongOk) }));
  if (weak.length) lines.sides.push(fill(pick(T.weak), { cechy: joinPl(weak.map(attrName)) }));
  if (!strong.length && !weak.length) lines.sides.push(pick(T.flat));
  const hiddenKeys = order.filter((k) => !shown.has(k) && (off[k] ?? 0) > 0).slice(0, 3);
  if (hiddenKeys.length) lines.sides.push(fill(pick(T.noData), { cechy: joinPl(hiddenKeys.map(attrName)) }));
  const ast = assistantOf(game, clubId); const an = analystOf(game, clubId);
  return {
    id: o.id, date, until: addDays(date, OBS.valid), pid: p.id, mode: o.mode, n: o.n, weeks: o.weeks, start: o.start, watched, stage,
    snap: { name: p.name, first: p.first ?? null, last: p.last ?? null, pos, alt: alts, age, nat: p.nat, foot: p.foot ?? null, club, league, kind, until: market.until },
    authors: { scout: who.kind === 'scout' ? authorName : null, observer: authorName, observerKind: who.kind, assistant: ast?.name ?? 'Asystent trenera', analyst: an?.name ?? null, director: market.dir },
    attrs, groups, words, seenOvr, potential, form, health, character, acclim, role, market, rec, recText, lines,
    flags: { abroad: kind === 'abroad', free: kind === 'free', loan: !!market.loan, listed: !!listed, lower: kind === 'domestic' && tierOf(game, p.clubId) > tierOf(game, clubId), deepen: !!o.deepen, cost: o.cost },
  };
}

/** Koniec zlecenia: raport do historii zawodnika i list w Poczcie. */
function finishOrder(game, o, date) {
  const S = ensureObserve(game);
  const rep = buildReport(game, o, date);
  const list = (S.reports[o.pid] ??= []);
  list.push(rep);
  if (list.length > OBS.keepPerPlayer) list.splice(0, list.length - OBS.keepPerPlayer);
  const pids = Object.keys(S.reports);
  if (pids.length > OBS.keepPlayers) {
    const old = pids.map((id) => [id, S.reports[id].at(-1)?.date ?? '']).sort((a, b) => a[1].localeCompare(b[1])).slice(0, pids.length - OBS.keepPlayers);
    for (const [id] of old) if (id !== o.pid) delete S.reports[id];
  }
  o.status = 'done'; o.closed = date;
  const rng = new Rng(`obserwator-list:${game.seed}:${o.id}`);
  const body = rng.chance(0.5)
    ? `Raport o zawodniku ${rep.snap.name} (${rep.snap.club}) jest gotowy. Zobaczysz go w jego karcie lub tutaj.`
    : `Skaut skończył obserwację: ${rep.snap.name}. Raport gotowy do przeczytania.`;
  return createMessage({
    date, key: `obs-report:${o.pid}:${o.id}`, category: 'transfers', from: rep.authors.observer, priority: 'important',
    subject: `Raport obserwatora: ${rep.snap.name}`, body: `${body}\n\nRekomendacja: ${REC[rep.rec]}.`, refs: { kind: 'obsReport', pid: o.pid, rid: rep.id },
  });
}

// ------------------------------------------------------------ Dane dla menu i list

/** Dane do menu zawodnika: { order, statusText, last, stale, hint }. */
export function observeMenuInfo(game, p) {
  const order = activeOrderFor(game, p.id);
  const L = lastReport(game, p.id);
  const noScout = !(game.staff ? clubScouts(game, game.clubId) : []).length;
  const rng = new Rng(`obserwator-menu:${game.seed ?? 0}:${p.id}`);
  const hint = noScout ? 'Nie mamy skauta, raport napisze asystent, ogólniej.' : rng.chance(0.5) ? 'Zleć skautowi obejrzenie zawodnika i napisanie raportu.' : 'Skaut obejrzy zawodnika w meczach i opisze go, a dyrektor oceni rynek.';
  return { order, statusText: order ? orderStatusText(game, order) : null, last: L?.r ?? null, idx: L?.idx ?? null, stale: !!L?.stale, hint };
}

/** Lista „Obserwacje” (Transfery, Skauting): zlecenia w toku i ostatnie raporty. */
export function observeList(game) {
  const S = game.observe;
  if (!S) return { active: [], done: [] };
  const active = S.orders.filter((o) => o.status === 'active').map((o) => ({ id: o.id, pid: o.pid, name: o.name, observer: o.observer.name, mode: o.mode, status: orderStatusText(game, o), cost: o.cost }));
  const done = Object.entries(S.reports).map(([pid, list]) => { const r = list[list.length - 1]; return { pid, name: r.snap.name, pos: r.snap.pos, club: r.snap.club, date: r.date, rec: r.rec, verdict: r.role.verdict, stale: game.date > r.until, count: list.length }; })
    .sort((a, b) => b.date.localeCompare(a.date) || a.pid.localeCompare(b.pid));
  return { active, done };
}
