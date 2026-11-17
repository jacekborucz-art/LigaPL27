// Rezerwy: delegowanie zawodników pierwszej drużyny na mecze rezerw i powołania zawodników rezerw na mecze pierwszej
// drużyny (model A „delegowanie na mecz”, decyzje właściciela z Nov 16, 2026, docs/rezerwy.md).
// Zawodnik zostaje w kadrze, kontrakcie, limicie, finansach i treningu swojego klubu; dostaje tylko przydział na
// konkretny mecz drugiej drużyny klubu (wzór loanBlock). squadFor (src/season/season.js) dokłada go do kadry
// meczowej, applyResult zapisuje mu minuty, kartki i urazy. Przepisy PZPN (uchwała IX/140 par. 4, Regulamin PP pkt 3)
// i zasady właściciela: jedna drużyna klubu na weekend (piątek 00:00 - poniedziałek 23:59), 48 h po grze ponad połowę
// meczu (bramkarze bez limitu), 23+ po 5 (lipiec-grudzień) albo 3 (od stycznia) meczach pierwszej drużyny nie gra w
// rezerwach, po końcu ligi pierwszej drużyny tylko przy ponad 50 % meczów rezerw. Gracz i kluby AI mają te same zasady.
// Decyzje z Nov 17, 2026: odpowiedź trenera rezerw od razu; awaria (system: w ciągu 48 h przed meczem pierwsza drużyna
// ma mniej niż 2 zdrowych bramkarzy albo mniej niż 18 dostępnych) daje powołanie bez odmowy (bramkarz rezerw, potem
// bramkarz akademii; z pola do 5 z rezerw, potem do 2 juniorów akademii), bramkarz w awarii bez zasady weekendu;
// wymuszenie = eskalacja do dyrektora sportowego (szansa z autorytetu i zaufania zarządu, koszt zaufania).

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage, addMessages } from '../core/inbox.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { CLUBS_L3 } from '../data/clubs_l3.js';
import { CLUBS_L4 } from '../data/clubs_l4.js';
import { SEASON, SEASON_YEAR } from '../config/calendar2026.js';
import { squadOf } from '../world/worldGen.js';
import { ephemeralSquad } from '../world/ephemeral.js';
import { GROUP, MATCH_MIN, planDeficitFill, isAvailable } from './squad.js';
import { LEAGUE_COMPS, compOfClub, compClubIds, classKeyOfComp, classKeyOfTier, LEAGUE_CLASS_KEYS } from '../season/leagueComps.js';
import { knownClub } from '../season/leagues.js';
import { standings } from '../season/standings.js';
import { winnerOf } from '../season/cup.js';
import { marketWage } from './negotiation.js';
import { payLevel } from '../data/finanse_klubow.js';
import { fmtDate } from '../ui/dom.js';
import { clearSuspWhy, moveSuspWhy } from '../season/suspension.js';

/** Liczby zasad (docs/rezerwy.md). [SZAC] przy wartościach bez przepisu. */
export const RSV = {
  maxDown: 5, // zawodnicy pierwszej drużyny w kadrze meczowej rezerw (decyzja właściciela 3)
  maxSeniorXI: 3, // w tym 23+ w pierwszej jedenastce rezerw
  maxUp: 3, // zawodnicy rezerw w kadrze meczowej pierwszej drużyny naraz
  firstMin: { total: 18, GK: 2, DEF: 5, MID: 5, ATT: 2 }, // pierwsza drużyna po delegowaniu [SZAC]
  resMin: { total: 14, GK: 2 }, // rezerwy: własni dostępni po powołaniu [SZAC]
  seniorAge: 23, autumnApps: 5, springApps: 3, // PZPN par. 4 ust. 2
  halfMin: 45, restH: 48, matchMin: 115, // PZPN par. 4 ust. 1; koniec meczu = start + 115 min [SZAC]
  deadlineH: 24, lateH: 48, // termin decyzji; prośba „późna” dla trenera rezerw [SZAC]
  refuseImportant: 0.6, refuseLate: 0.3, forcePenalty: 0.2, forceEveryDays: 30, forcePenaltyDays: 14, refuseCap: 0.95, // [SZAC]
  // Awaria (decyzja właściciela z Nov 17, 2026): próg i limity powołań bez zgody trenera rezerw
  emergencyH: 48, emergencyGk: 2, emergencyTotal: 18, emFieldMax: 5, emAcadField: 2, academyAge: 17,
  // Eskalacja do dyrektora sportowego: szansa 35 + 0,4 x autorytet + 0,2 x zaufanie zarządu (10-90 %)
  escBase: 35, escAuth: 0.4, escTrust: 0.2, escMin: 10, escMax: 90, escCostOk: 2, escCostNo: 4,
  // Nastrój trenera rezerw 0-100 (start 50): awaria -3, zatwierdzona eskalacja -5, +1 co poniedziałek do 50;
  // poniżej 50 każdy punkt to +0,5 pp szansy odmowy [SZAC]
  moodStart: 50, moodEmergency: 3, moodForce: 5, moodPerPt: 0.005,
  aiDownMax: 3, aiSharpBelow: 60, aiTop: 18, // przegląd AI w poniedziałek [SZAC]
  ppAfterOut: 3, // Regulamin PP pkt 3 b
  promoteMax: 3, // przeniesienia na stałe z rezerw na sezon [SZAC]
  nowTime: '09:00', // pora decyzji w dniu gry
};

const H = 3600000;
const MIN = 60000;

// ------------------------------------------------------------ Kluby i rodziny
// Rezerwy z danych (pole parent). Indeks budowany przy wczytaniu modułu z pełnych list (kluby IV ligi też).
const RES_INDEX = new Map();
for (const c of [...CLUBS_PL, ...CLUBS_L3, ...CLUBS_L4]) if (c.parent && !RES_INDEX.has(c.parent)) RES_INDEX.set(c.parent, c.id);
const clubOf = (id) => clubById(id) ?? knownClub(id);
const tierOfClub = (id) => clubOf(id)?.tier ?? null;

/** Rezerwy klubu z kadrą w grze (liga 1-4) albo null. */
export function reserveTeamOf(game, clubId) {
  const rid = RES_INDEX.get(clubId);
  if (!rid || !game?.world?.clubs?.[rid] || !game.world.clubs[clubId]) return null;
  return (tierOfClub(rid) ?? 9) <= 4 ? rid : null;
}

/** Pierwsza drużyna dla grywalnych rezerw albo null. */
export function parentTeamOf(game, clubId) {
  const pid = clubOf(clubId)?.parent;
  return pid && reserveTeamOf(game, pid) === clubId ? pid : null;
}

/** Rodzina klubu z grywalnymi rezerwami: { parent, reserve } (dla pierwszej drużyny i dla rezerw), inaczej null. */
export function familyOf(game, clubId) {
  if (!clubId) return null;
  const r = reserveTeamOf(game, clubId);
  if (r) return { parent: clubId, reserve: r };
  const p = parentTeamOf(game, clubId);
  return p ? { parent: p, reserve: clubId } : null;
}

/**
 * Rezerwy klubu dla UI: { ok, id, name, tier, comp, reason }. ok = false: klub nie ma grywalnych rezerw (powód po polsku).
 */
export function reservesOf(game, clubId) {
  const c = clubOf(clubId);
  if (!c) return { ok: false, id: null, name: null, tier: null, comp: null, reason: 'Nieznany klub.' };
  if (c.parent) return { ok: false, id: null, name: null, tier: null, comp: null, reason: 'To jest drużyna rezerw: zawodników przesuwa pierwsza drużyna.' };
  const rid = RES_INDEX.get(clubId);
  if (!rid) return { ok: false, id: null, name: null, tier: null, comp: null, reason: `${c.name} nie ma drużyny rezerw.` };
  const r = clubOf(rid);
  const base = { id: rid, name: r?.name ?? rid, tier: r?.tier ?? null, comp: r && r.tier <= 4 ? compOfClub(r) : null };
  if (!reserveTeamOf(game, clubId)) return { ok: false, ...base, reason: `${base.name} gra w IV lidze lub niżej (bez kadry w grze), więc delegowanie i powołania nie są dostępne.` };
  return { ok: true, ...base, reason: null };
}

// ------------------------------------------------------------ Czas
const kickoff = (f) => Date.parse(`${f.date}T${f.time ?? '18:00'}:00Z`);
const nowMs = (game) => Date.parse(`${game.date}T${RSV.nowTime}:00Z`);
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/** Weekend meczu: piątek (klucz) dla dni piątek-poniedziałek, null dla wtorku-czwartku. */
export function weekendKey(date) {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  const back = { 5: 0, 6: 1, 0: 2, 1: 3 }[d];
  return back == null ? null : addDays(date, -back);
}

/** Wiek wg PZPN: rok końca sezonu minus rok urodzenia (bez daty urodzenia: wiek z 1 lipca + 1) [SZAC]. */
export function ruleAge(p) {
  if (p?.birthDate) return SEASON_YEAR + 1 - Number(p.birthDate.slice(0, 4));
  return (p?.age ?? 25) + 1;
}

// ------------------------------------------------------------ Stan
/** Stan rezerw w grze (stare zapisy: migracja kartek 'league' do klasy obecnego klubu). */
export function ensureReserves(game) {
  const R = (game.reserves ??= { v: 0, list: [], refused: {}, force: {}, forceOk: {}, mood: {}, stats: {}, promoted: {} });
  R.list ??= []; R.refused ??= {}; R.force ??= {}; R.forceOk ??= {}; R.mood ??= {}; R.stats ??= {}; R.promoted ??= {};
  if (!(R.v >= 1)) { migrateCards(game); R.v = 1; }
  return R;
}

/** Stare zapisy: liczniki p.yc.league i pauzy p.susp.league do klucza klasy obecnego klubu zawodnika. */
export function migrateCards(game) {
  for (const p of Object.values(game.world?.players ?? {})) {
    const t = tierOfClub(p.clubId);
    const key = t != null && t <= 4 ? classKeyOfTier(t) : null;
    for (const o of [p.yc, p.susp]) {
      if (!o || typeof o !== 'object' || !('league' in o)) continue;
      const v = o.league;
      delete o.league;
      if (key && v) o[key] = (o[key] ?? 0) + v;
    }
  }
}

const listOf = (game) => game.reserves?.list ?? [];
export function statsOf(game) {
  const R = ensureReserves(game);
  return (R.stats[SEASON] ??= { down: 0, up: 0, acad: 0, refused: 0, forced: 0, escNo: 0, emergency: 0, aiDown: 0, aiUp: 0, used: 0, voided: 0, viol: 0, viol48: 0 });
}
/** Nastrój trenera rezerw (0-100). */
export const coachMood = (game, rid) => game.reserves?.mood?.[rid] ?? RSV.moodStart;
function moodDrop(game, rid, n) { const R = ensureReserves(game); R.mood[rid] = clamp(coachMood(game, rid) - n, 0, 100); }
/** Liczniki zawodnika w sezonie: h1/h2 mecze pierwszej drużyny (lipiec-grudzień / od stycznia), lo mecze ligowe rezerw. */
function rs(p) {
  const s = p.rsv;
  if (s && s.s === SEASON) return s;
  return (p.rsv = { s: SEASON, h1: 0, h2: 0, lo: 0, ...(s?.wk ? { wk: s.wk } : {}), ...(s?.last ? { last: s.last } : {}) });
}
const counts = (p) => (p.rsv?.s === SEASON ? p.rsv : { h1: 0, h2: 0, lo: 0 });

// Indeks meczów po id i po klubie (szybkie zapytania w systemie dnia i w squadFor); odświeżany przy zmianie listy
const FX = new WeakMap();
function fxIndex(game) {
  const arr = game.fixtures ?? [];
  let ix = FX.get(arr);
  if (!ix || ix.n !== arr.length) {
    ix = { n: arr.length, byId: new Map(), byClub: new Map() };
    for (const f of arr) {
      ix.byId.set(f.id, f);
      for (const c of [f.home, f.away]) { if (!c) continue; let l = ix.byClub.get(c); if (!l) ix.byClub.set(c, (l = [])); l.push(f); }
    }
    FX.set(arr, ix);
  }
  return ix;
}
const fixtureById = (game, id) => fxIndex(game).byId.get(id) ?? null;
/** Mecze drużyny (bez kolejności). */
const clubFixtures = (game, id) => fxIndex(game).byClub.get(id) ?? [];
/** Najwcześniejszy mecz drużyny spełniający warunek. */
function firstOf(game, team, ok) {
  let best = null;
  for (const f of clubFixtures(game, team)) if (ok(f) && (!best || f.date + (f.time ?? '') < best.date + (best.time ?? ''))) best = f;
  return best;
}
const involves = (f, id) => f.home === id || f.away === id;
const classKey = (f, teamId) => classKeyOfComp(f.comp, tierOfClub(teamId));
function teamFixtureInWeekend(game, team, wk, { unplayed = true } = {}) {
  if (!wk) return null;
  const to = addDays(wk, 3);
  return firstOf(game, team, (f) => f.date >= wk && f.date <= to && f.comp !== 'friendly' && (!unplayed || !f.played));
}

// ------------------------------------------------------------ Uprawnienia
const TEXT = {
  noPlayer: 'Nie ma takiego zawodnika.',
  noFixture: 'Nie ma takiego meczu.',
  played: 'Mecz już się odbył albo trwa.',
  friendly: 'Sparingi nie wymagają delegowania.',
  noReserves: 'Klub nie ma grywalnych rezerw.',
  notInSquad: 'Zawodnik nie jest w kadrze klubu.',
  notFirstTeam: 'Delegować do rezerw można tylko zawodnika pierwszej drużyny.',
  notReserve: 'Powołać można tylko zawodnika rezerw tego klubu.',
  wrongFixture: 'To nie jest mecz drużyny docelowej.',
  already: 'Zawodnik ma już przydział na ten mecz.',
  deadline: 'Za późno: decyzja najpóźniej 24 godziny przed meczem (później tylko w nagłym braku zawodników).',
  limitDown: `W kadrze meczowej rezerw może być najwyżej ${RSV.maxDown} zawodników pierwszej drużyny.`,
  limitUp: `W kadrze meczowej pierwszej drużyny może być najwyżej ${RSV.maxUp} zawodników rezerw.`,
  injured: 'Zawodnik będzie kontuzjowany w dniu meczu.',
  suspended: 'Zawodnik pauzuje za kartki w rozgrywkach tego meczu.',
  callUp: 'Zawodnik jest na zgrupowaniu reprezentacji.',
  hold: 'Zawodnik jest w trakcie transferu.',
  weekend: 'W ten weekend był już w kadrze meczowej drugiej drużyny klubu (jedna drużyna na weekend).',
  weekendPlanned: 'W ten weekend ma już przydział do drugiej drużyny klubu (jedna drużyna na weekend).',
  rest48: 'Zagrał ponad połowę meczu drugiej drużyny klubu mniej niż 48 godzin przed tym meczem (PZPN).',
  senior5: `Ma 23 lata lub więcej i zagrał już ${RSV.autumnApps} meczów pierwszej drużyny od 1 lipca: do końca roku nie gra w rezerwach (PZPN).`,
  senior3: `Ma 23 lata lub więcej i zagrał już ${RSV.springApps} mecze pierwszej drużyny od 1 stycznia: do końca sezonu nie gra w rezerwach (PZPN).`,
  seniorEnd: 'Liga pierwszej drużyny się skończyła: w rezerwach mogą grać tylko zawodnicy z ponad połową meczów rezerw (PZPN).',
  ppOther: 'Zagrał już w Pucharze Polski w drugiej drużynie klubu.',
  ppLimit: `Po odpadnięciu drużyny z Pucharu Polski najwyżej ${RSV.ppAfterOut} jej zawodników może grać w pucharze drugiej drużyny.`,
  firstMin: `Pierwszej drużynie zostałoby mniej niż ${RSV.firstMin.total} dostępnych (w tym 2 bramkarzy, 5 obrońców, 5 pomocników, 2 napastników).`,
  resMin: `Rezerwom zostałoby mniej niż ${RSV.resMin.total} własnych dostępnych zawodników (w tym 2 bramkarzy).`,
  important: 'Trener rezerw: ten mecz jest dla nas bardzo ważny, a to jeden z naszych kluczowych zawodników.',
  late: 'Trener rezerw: prośba przyszła za późno, skład był już ustalony.',
  afterForce: 'Trener rezerw pamięta ostatnie wymuszenie.',
  forceCooldown: `Eskalacja do dyrektora sportowego możliwa najwyżej raz na ${RSV.forceEveryDays} dni.`,
  missesFirstTeam: 'Nie zagra w meczu pierwszej drużyny w ten weekend (jedna drużyna na weekend).',
  missesReserves: 'Nie zagra w meczu rezerw w ten weekend (jedna drużyna na weekend).',
  risk48: 'Jeśli w meczu pierwszej drużyny zagra ponad 45 minut, nie zagra w tym meczu rezerw (48 godzin).',
  emergency: 'Awaria (za mało zdrowych bramkarzy albo dostępnych zawodników): trener rezerw nie może odmówić.',
  started: 'Mecz już się zaczął.',
  promoteLimit: `W tym sezonie przeniesiono już ${RSV.promoteMax} zawodników z rezerw na stałe.`,
  squadFull: 'Kadra pierwszej drużyny jest pełna (40 zawodników).',
  notRefused: 'Eskalacja do dyrektora sportowego jest możliwa tylko po odmowie trenera rezerw.',
  escalationRejected: 'Dyrektor sportowy podtrzymał decyzję trenera rezerw.',
  academyEmergency: 'Junior z akademii może zagrać w pierwszej drużynie tylko w nagłym braku zawodników (awaria).',
  academyAge: `Junior z akademii w pierwszej drużynie od ${RSV.academyAge} lat.`,
  academyOrder: 'Najpierw powołuje się zawodników rezerw, junior z akademii tylko, gdy ich zabraknie.',
  limitGk: 'W awarii można powołać najwyżej jednego bramkarza na mecz.',
  limitAcad: `W awarii najwyżej ${RSV.emAcadField} juniorów akademii z pola na mecz.`,
  limitUpEmergency: `W awarii najwyżej ${RSV.emFieldMax} zawodników rezerw z pola na mecz.`,
  gkException: 'Bramkarz w awarii: wyjątek od zasady jednej drużyny na weekend.',
};

/** Powody po polsku (kody z can..., request... i eligibility) w jednym tekście. */
export function reasonsText(reasons) {
  return [...new Set(reasons ?? [])].map((r) => TEXT[r] ?? r).join(' ');
}

const cupOut = (game, team) => clubFixtures(game, team).some((f) => f.comp === 'pp' && f.played && winnerOf(f) && winnerOf(f) !== team);
function higherLeagueEnded(game, parent) {
  const comp = compOfClub(clubOf(parent));
  const fx = clubFixtures(game, parent).filter((f) => f.comp === comp);
  return fx.length > 0 && fx.every((f) => f.played);
}
const lowerLeaguePlayed = (game, reserve) => clubFixtures(game, reserve).filter((f) => f.played && LEAGUE_COMPS.includes(f.comp)).length;

/**
 * Czy zawodnik p może zagrać w drużynie teamId w meczu f (zasady klubu z rezerwami). Zwraca kody powodów (pusto = może).
 * mode 'plan': przy decyzji (uraz liczony na dzień meczu, pauza, zgrupowanie); 'runtime': w dniu meczu (bez urazu i
 * pauzy, które squadFor obsługuje osobno).
 */
export function eligibility(game, p, teamId, f, mode = 'plan', { gkEmergency = false, ctx = null } = {}) {
  const r = eligibilityRaw(game, p, teamId, f, mode, ctx);
  // Bramkarz powołany w awarii: wyjątek od zasady weekendu (decyzja właściciela 3, PZPN par. 4 ust. 1 bez 48 h)
  return gkEmergency && p?.pos === 'BR' ? r.filter((x) => x !== 'weekend' && x !== 'weekendPlanned') : r;
}
/** Przydział bramkarza w awarii (nie blokuje go w drugiej drużynie w ten weekend). */
const gkEmergencyOf = (d, p) => !!d?.emergency && p?.pos === 'BR';

/** Wspólne dane meczu do sprawdzania wielu zawodników (squadFor): rodzina, weekend, zawodnicy z przydziałami. */
function eligCtx(game, teamId, f) {
  return { fam: familyOf(game, teamId), wk: weekendKey(f.date), pids: new Set(listOf(game).map((d) => d.pid)) };
}

function eligibilityRaw(game, p, teamId, f, mode, ctx = null) {
  const r = [];
  if (!p || !f) return ['noPlayer'];
  if (mode === 'plan') {
    if ((p.injuryDays ?? 0) > Math.max(0, dayDiff(game.date, f.date))) r.push('injured');
    if ((p.susp?.[classKey(f, teamId)] ?? 0) > 0) r.push('suspended');
    if (p.callUp) r.push('callUp');
    if (p.transfer?.hold) r.push('hold');
  }
  const c0 = ctx ?? eligCtx(game, teamId, f);
  const fam = c0.fam;
  if (!fam || f.comp === 'friendly') return r;
  if (!p.rsv && !c0.pids.has(p.id)) return r; // bez meczów w rodzinie i bez przydziałów: nic do sprawdzenia
  const s = p.rsv ?? {};
  const wk = c0.wk;
  if (wk && s.wk?.k === wk && s.wk.t !== teamId) r.push('weekend');
  if (wk && c0.pids.has(p.id)) {
    for (const d of listOf(game)) {
      if (d.pid !== p.id || d.to === teamId || d.fixtureId === f.id || gkEmergencyOf(d, p)) continue;
      if (weekendKey(d.date) === wk) { r.push('weekendPlanned'); break; }
    }
  }
  const last = s.last;
  if (last && last.t !== teamId && p.pos !== 'BR' && last.min > RSV.halfMin) {
    const gap = kickoff(f) - Date.parse(`${last.end}:00Z`);
    if (gap >= 0 && gap < RSV.restH * H) r.push('rest48');
  }
  if (teamId === fam.reserve && ruleAge(p) >= RSV.seniorAge) {
    const c = counts(p);
    const autumn = f.date.slice(5, 7) >= '07';
    if (autumn && c.h1 >= RSV.autumnApps) r.push('senior5');
    if (!autumn && c.h2 >= RSV.springApps) r.push('senior3');
    if (c.h1 + c.h2 > 0 && LEAGUE_COMPS.includes(f.comp) && higherLeagueEnded(game, fam.parent) && !(c.lo > lowerLeaguePlayed(game, fam.reserve) / 2)) r.push('seniorEnd');
  }
  if (f.comp === 'pp') {
    const pt = p.rsv?.s === SEASON ? p.rsv.pp : null;
    if (pt && pt !== teamId) {
      const moved = game.reserves?.ppMoved?.[teamId] ?? [];
      if (!cupOut(game, pt)) r.push('ppOther');
      else if (!moved.includes(p.id) && moved.length >= RSV.ppAfterOut) r.push('ppLimit');
    }
  }
  return r;
}

/** Dostępność zawodnika drużyny team na mecz f (do minimów): uraz w dniu meczu, pauza w klasie, zgrupowanie, transfer. */
function availableBy(game, p, f, team, key = null, days = null) {
  if ((p.injuryDays ?? 0) > (days ?? Math.max(0, dayDiff(game.date, f.date)))) return false;
  if ((p.susp?.[key ?? classKey(f, team)] ?? 0) > 0) return false;
  return !p.callUp && !p.transfer?.hold;
}

/**
 * Dostępni zawodnicy drużyny team (własna kadra) na mecz w oknie meczu f: bez zawodników oddanych drugiej drużynie w ten
 * weekend (albo w ciągu 2 dni od meczu w tygodniu) i bez extraOut; guests = przydzieleni na mecz tf (dostępni).
 * Zwraca { total, GK, DEF, MID, ATT, fixture }.
 */
function availCount(game, team, f, extraOut = [], { guests = false } = {}) {
  const wk = weekendKey(f.date);
  // Mecz drużyny team, na który liczymy dostępnych: w tym weekendzie, inaczej najbliższy od dnia meczu f
  const tf = (wk && teamFixtureInWeekend(game, team, wk)) || (involves(f, team) ? f : null)
    || firstOf(game, team, (x) => !x.played && x.date >= f.date && x.comp !== 'friendly')
    || { date: f.date, comp: compOfClub(clubOf(team)) };
  const out = new Set(extraOut);
  for (const d of listOf(game)) {
    if (d.from !== team || d.to === team) continue;
    if (wk ? weekendKey(d.date) === wk : Math.abs(dayDiff(d.date, f.date)) <= 2) out.add(d.pid);
  }
  const c = { total: 0, GK: 0, DEF: 0, MID: 0, ATT: 0, fixture: tf };
  const add = (p) => { c.total++; c[GROUP[p.pos] ?? 'MID']++; };
  const key = classKey(tf, team); const days = Math.max(0, dayDiff(game.date, tf.date));
  for (const p of squadOf(game.world, team)) if (p && !out.has(p.id) && availableBy(game, p, tf, team, key, days)) add(p);
  if (guests && tf.id) for (const p of matchGuests(game, tf, team)) if (availableBy(game, p, tf, team)) add(p);
  return c;
}
function minimumOk(game, team, f, extraOut, min) {
  const c = availCount(game, team, f, extraOut);
  return c.total >= min.total && ['GK', 'DEF', 'MID', 'ATT'].every((g) => min[g] == null || c[g] >= min[g]);
}

/**
 * Awaria pierwszej drużyny (wykrywa system, decyzja właściciela z Nov 17, 2026): w ciągu 48 h przed meczem mniej niż
 * 2 zdrowych bramkarzy albo mniej niż 18 dostępnych (z przydzielonymi już na ten mecz). Zwraca
 * { emergency, gk, squad, fixture, available: { total, GK, DEF, MID, ATT } }.
 */
export function emergencyFor(game, clubId, fixtureId = null) {
  const none = { emergency: false, gk: false, squad: false, fixture: null, available: null };
  const fam = familyOf(game, clubId);
  if (!fam || fam.parent !== clubId) return none;
  let f = fixtureId ? fixtureById(game, fixtureId) : null;
  if (!fixtureId) f = firstOf(game, clubId, (x) => !x.played && x.comp !== 'friendly' && x.date >= game.date);
  if (!f || f.played || f.comp === 'friendly' || !involves(f, clubId)) return { ...none, fixture: f ?? null };
  const left = kickoff(f) - nowMs(game);
  if (left <= 0 || left > RSV.emergencyH * H) return { ...none, fixture: f };
  const c = availCount(game, clubId, f, [], { guests: true });
  const gk = c.GK < RSV.emergencyGk;
  const squad = c.total < RSV.emergencyTotal;
  const { fixture, ...available } = c;
  return { emergency: gk || squad, gk, squad, fixture: f, available };
}

const isAcademy = (game, p) => !!game.world.clubs[p.clubId]?.academy?.includes(p.id);
/** Zawodnicy rezerw, których można powołać na mecz f (bramkarze albo z pola), od najlepszego. */
function reserveCandidates(game, fam, f, gk) {
  return squadOf(game.world, fam.reserve).filter((p) => p && (p.pos === 'BR') === gk && availableBy(game, p, f, fam.parent)
    && !listOf(game).some((d) => d.pid === p.id && d.fixtureId === f.id) && !eligibility(game, p, fam.parent, f, 'plan', { gkEmergency: gk }).length)
    .sort((a, b) => b.ovr - a.ovr);
}
/** Juniorzy akademii (17+) pierwszej drużyny, potem rezerw, do awaryjnego powołania. */
function academyCandidates(game, fam, f, gk) {
  const acad = [...(game.world.clubs[fam.parent]?.academy ?? []), ...(game.world.clubs[fam.reserve]?.academy ?? [])].map((id) => game.world.players[id]);
  return acad.filter((p) => p && (p.pos === 'BR') === gk && (p.age ?? 16) >= RSV.academyAge && availableBy(game, p, f, fam.parent)
    && !listOf(game).some((d) => d.pid === p.id && d.fixtureId === f.id) && !eligibility(game, p, fam.parent, f, 'plan', { gkEmergency: gk }).length);
}

function checkMove(game, pid, fixtureId, kind) {
  const warnings = [];
  const W = game.world;
  const p = W?.players?.[pid];
  const f = fixtureById(game, fixtureId);
  const fail = (code) => ({ ok: false, reasons: [code], warnings, kind });
  if (!p) return fail('noPlayer');
  if (!f) return fail('noFixture');
  if (f.played) return fail('played');
  if (f.comp === 'friendly') return fail('friendly');
  const fam = familyOf(game, p.clubId);
  if (!fam) return fail('noReserves');
  const acad = isAcademy(game, p);
  if (!acad && !W.clubs[p.clubId]?.squad.includes(pid)) return fail('notInSquad');
  const from = p.clubId;
  const to = kind === 'down' ? fam.reserve : fam.parent;
  if (kind === 'down' && (acad || from !== fam.parent)) return fail('notFirstTeam');
  if (kind === 'up' && !acad && from !== fam.reserve) return fail('notReserve');
  if (!involves(f, to)) return fail('wrongFixture');
  if (listOf(game).some((d) => d.pid === pid && d.fixtureId === f.id)) return fail('already');
  const left = kickoff(f) - nowMs(game);
  if (left <= 0) return fail('started');
  const gk = p.pos === 'BR';
  // Awaria pasująca do zawodnika: bramkarz przy braku bramkarzy, zawodnik z pola przy braku 18 dostępnych
  const em = kind === 'up' ? emergencyFor(game, fam.parent, f.id) : null;
  const emergency = !!em?.emergency && (gk ? em.gk : em.squad);
  if (acad && !emergency) return fail('academyEmergency');
  if (acad && (p.age ?? 16) < RSV.academyAge) return fail('academyAge');
  const reasons = [];
  if (emergency) warnings.push('emergency');
  else if (left < RSV.deadlineH * H) reasons.push('deadline');
  const ds = listOf(game).filter((d) => d.fixtureId === f.id && d.to === to);
  if (kind === 'down') {
    if (ds.filter((d) => d.kind === 'down').length >= RSV.maxDown) reasons.push('limitDown');
  } else if (emergency) {
    if (gk) {
      if (ds.some((d) => d.emergency && d.gk)) reasons.push('limitGk');
      if (acad && reserveCandidates(game, fam, f, true).length) reasons.push('academyOrder');
    } else if (acad) {
      if (ds.filter((d) => d.acad && !d.gk).length >= RSV.emAcadField) reasons.push('limitAcad');
      // kolejność w grupie pozycji: junior dopiero, gdy w rezerwach brak dostępnego zawodnika tej grupy (albo limit 5)
      if (ds.filter((d) => !d.acad && !d.gk).length < RSV.emFieldMax && reserveCandidates(game, fam, f, false).some((x) => GROUP[x.pos] === GROUP[p.pos])) reasons.push('academyOrder');
    } else if (ds.filter((d) => !d.acad && !d.gk).length >= RSV.emFieldMax) reasons.push('limitUpEmergency');
  } else if (ds.filter((d) => d.kind === 'up').length >= RSV.maxUp) reasons.push('limitUp');
  reasons.push(...eligibility(game, p, to, f, 'plan', { gkEmergency: emergency && gk }));
  if (emergency && gk && (p.rsv?.wk?.k === weekendKey(f.date) || listOf(game).some((d) => d.pid === p.id && weekendKey(d.date) === weekendKey(f.date)))) warnings.push('gkException');
  const wk = weekendKey(f.date);
  if (kind === 'down') {
    if (!minimumOk(game, fam.parent, f, [pid], RSV.firstMin)) reasons.push('firstMin');
    if (teamFixtureInWeekend(game, fam.parent, wk)) warnings.push('missesFirstTeam');
    const pf = clubFixtures(game, fam.parent).find((x) => !x.played && x.comp !== 'friendly' && kickoff(x) < kickoff(f) && kickoff(f) - kickoff(x) - RSV.matchMin * MIN < RSV.restH * H);
    if (pf && p.pos !== 'BR' && weekendKey(pf.date) !== wk) warnings.push('risk48');
  } else if (!acad) {
    const rf = wk ? teamFixtureInWeekend(game, fam.reserve, wk) : null;
    // Minimum rezerw (14 własnych, 2 bramkarzy) nie obowiązuje w awarii: trener rezerw nie może odmówić
    if (rf && !emergency && !minimumOk(game, fam.reserve, rf, [pid], RSV.resMin)) reasons.push('resMin');
    if (rf && !(emergency && gk)) warnings.push('missesReserves');
  }
  return { ok: !reasons.length, reasons: [...new Set(reasons)], warnings, kind, from, to, emergency, acad, gk, fixture: f, player: p, family: fam };
}

/** Czy zawodnika pierwszej drużyny pid można delegować na mecz rezerw fixtureId: { ok, reasons[], warnings[] }. */
export function canDelegate(game, pid, fixtureId) {
  const c = checkMove(game, pid, fixtureId, 'down');
  return { ok: c.ok, reasons: c.reasons, warnings: c.warnings };
}

/**
 * Czy zawodnika rezerw (albo w awarii juniora akademii 17+) pid można powołać na mecz pierwszej drużyny fixtureId:
 * { ok, reasons[], warnings[], emergency }.
 */
export function canCallUp(game, pid, fixtureId) {
  const c = checkMove(game, pid, fixtureId, 'up');
  return { ok: c.ok, reasons: c.reasons, warnings: c.warnings, emergency: !!c.emergency };
}

// ------------------------------------------------------------ Zgoda trenera rezerw
const isDerbyFix = (f) => { const H0 = clubOf(f.home); const A0 = clubOf(f.away); return !!(H0?.region && H0.region === A0?.region && H0.parent !== A0.id && A0.parent !== H0.id); };
/** Ważny mecz rezerw: derby albo ostatnie 10 kolejek w strefie spadkowej lub do 3 pkt nad nią [SZAC]. */
export function importantReserveMatch(game, rid, rf) {
  if (!rf) return false;
  if (isDerbyFix(rf)) return true;
  if (!LEAGUE_COMPS.includes(rf.comp) || !(rf.round >= 25)) return false;
  const t = standings((game.fixtures ?? []).filter((x) => x.comp === rf.comp), compClubIds(rf.comp));
  const i = t.findIndex((r) => r.id === rid);
  const zone = t.length - 4;
  if (i < 0 || zone < 1) return false;
  return i >= zone || t[i].points - t[zone].points <= 3;
}
const top3 = (game, rid) => squadOf(game.world, rid).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 3).map((p) => p.id);

/** Szansa odmowy zwykłej prośby: { p, codes }. W awarii zawsze 0. */
function refusal(game, chk) {
  const { kind, player: p, fixture: f, family: fam } = chk;
  if (chk.emergency) return { p: 0, codes: [] };
  const codes = [];
  let keep = 1;
  // Mecz rezerw, którego dotyczy prośba: przy delegowaniu ten mecz, przy powołaniu mecz rezerw do 3 dni od meczu
  const rf = kind === 'down' ? f : firstOf(game, fam.reserve, (x) => !x.played && x.comp !== 'friendly' && Math.abs(dayDiff(x.date, f.date)) <= 3);
  if (kind === 'up' && rf && (p.pos === 'BR' || top3(game, fam.reserve).includes(p.id)) && importantReserveMatch(game, fam.reserve, rf)) { keep *= 1 - RSV.refuseImportant; codes.push('important'); }
  if (rf && kickoff(rf) - nowMs(game) < RSV.lateH * H) { keep *= 1 - RSV.refuseLate; codes.push('late'); }
  let pr = 1 - keep;
  const fd = game.reserves?.forceOk?.[fam.parent];
  if (fd && dayDiff(fd, game.date) < RSV.forcePenaltyDays) { pr += RSV.forcePenalty; codes.push('afterForce'); }
  const mood = coachMood(game, fam.reserve);
  if (pr > 0 && mood < RSV.moodStart) pr += (RSV.moodStart - mood) * RSV.moodPerPt;
  return { p: Math.min(RSV.refuseCap, pr), codes };
}

// ------------------------------------------------------------ Prośby
function addDelegation(game, chk, by, forced) {
  const R = ensureReserves(game);
  const { kind, player: p, fixture: f } = chk;
  const d = { id: `${p.id}@${f.id}`, pid: p.id, from: chk.from, to: chk.to, fixtureId: f.id, date: f.date, kind, by, at: game.date,
    ...(forced ? { forced: true } : {}), ...(chk.emergency ? { emergency: true } : {}), ...(chk.acad ? { acad: true } : {}), ...(chk.gk ? { gk: true } : {}) };
  R.list.push(d);
  delete R.refused[`${p.id}:${f.id}`];
  const st = statsOf(game);
  st[chk.acad ? 'acad' : kind]++;
  if (chk.emergency) st.emergency++;
  if (by === 'ai') st[kind === 'down' ? 'aiDown' : 'aiUp']++;
  return d;
}

/**
 * Rezerwy, którym zabrano bramkarza, dostają bramkarza akademii (rezerw, potem pierwszej drużyny) na swój mecz w tym
 * weekendzie (albo do 3 dni), gdy zostaje im mniej niż 2 dostępnych bramkarzy.
 */
function refillReserveGk(game, fam, f) {
  const wk = weekendKey(f.date);
  const rf = (wk && teamFixtureInWeekend(game, fam.reserve, wk)) || firstOf(game, fam.reserve, (x) => !x.played && x.comp !== 'friendly' && Math.abs(dayDiff(x.date, f.date)) <= 3);
  if (!rf) return null;
  const have = availCount(game, fam.reserve, rf, [], { guests: true });
  if (have.GK >= RSV.resMin.GK) return null;
  const ids = [...(game.world.clubs[fam.reserve]?.academy ?? []), ...(game.world.clubs[fam.parent]?.academy ?? [])];
  const gk = ids.map((id) => game.world.players[id]).filter((p) => p && p.pos === 'BR' && availableBy(game, p, rf, fam.reserve) && !listOf(game).some((d) => d.pid === p.id && weekendKey(d.date) === weekendKey(rf.date)))
    .sort((a, b) => b.ovr - a.ovr)[0];
  if (!gk) return null;
  const d = { id: `${gk.id}@${rf.id}`, pid: gk.id, from: gk.clubId, to: fam.reserve, fixtureId: rf.id, date: rf.date, kind: 'acad', acad: true, gk: true, by: 'auto', at: game.date };
  ensureReserves(game).list.push(d);
  statsOf(game).acad++;
  return d;
}

function inform(game, chk, out) {
  const p = chk.player ?? game.world?.players?.[chk.pid];
  const f = chk.fixture ?? null;
  if (!p) return;
  const name = (id) => clubOf(id)?.name ?? id;
  const what = chk.kind === 'up' ? (chk.emergency ? 'Awaryjne powołanie' : 'Powołanie z rezerw') : 'Delegowanie do rezerw';
  const match = f ? `${name(f.home)} - ${name(f.away)} (${fmtDate(f.date)})` : 'mecz';
  const ok = out.status === 'accepted';
  const body = ok
    ? `${p.name} ${chk.kind === 'up' ? 'jest do twojej dyspozycji' : 'zagra w rezerwach'} w meczu ${match}.${out.warnings?.length ? `\n\n${reasonsText(out.warnings)}` : ''}${out.refill ? `\n\nRezerwy dostają bramkarza z akademii: ${game.world.players[out.refill]?.name ?? ''}.` : ''}`
    : `${p.name}, mecz ${match}: ${out.reason}${out.hard ? '' : '\n\nMożesz poprosić dyrektora sportowego o rozstrzygnięcie (najwyżej raz na 30 dni).'}`;
  const msg = createMessage({ date: game.date, key: `rezerwy:${p.id}:${f?.id ?? ''}:${out.status}:${game.date}:${out.forced ? 'esk' : ''}`, category: 'staff', from: out.forced || out.escalation ? 'Dyrektor sportowy' : 'Trener rezerw', priority: 'info', subject: `${what}: ${ok ? 'zgoda' : 'odmowa'} (${p.name})`, body });
  game.inbox = addMessages(game.inbox ?? [], [msg]).inbox;
}

/** Prośba: odpowiedź od razu (decyzja właściciela z Nov 17, 2026). W awarii bez odmowy, nastrój trenera rezerw -3. */
function request(game, { pid, fixtureId, by = 'user' } = {}, kind) {
  ensureReserves(game);
  const chk = checkMove(game, pid, fixtureId, kind);
  chk.pid = pid;
  if (!chk.ok) {
    statsOf(game).refused++;
    const out = { status: 'refused', reason: reasonsText(chk.reasons), reasons: chk.reasons, warnings: chk.warnings, hard: true };
    if (by === 'user') inform(game, chk, out);
    return out;
  }
  const rf = refusal(game, chk);
  if (rf.p > 0 && new Rng(`rezerwy:${game.seed}:${pid}:${fixtureId}`).next() < rf.p) {
    game.reserves.refused[`${pid}:${fixtureId}`] = { date: game.date, kind, by };
    statsOf(game).refused++;
    const out = { status: 'refused', reason: reasonsText(rf.codes), reasons: rf.codes, warnings: chk.warnings, hard: false, chance: Math.round(rf.p * 100) / 100 };
    if (by === 'user') inform(game, chk, out);
    return out;
  }
  const d = addDelegation(game, chk, by, false);
  if (chk.emergency) moodDrop(game, chk.family.reserve, RSV.moodEmergency);
  const refill = chk.kind === 'up' && chk.gk && !chk.acad ? refillReserveGk(game, chk.family, chk.fixture) : null;
  const out = { status: 'accepted', reason: null, reasons: [], warnings: chk.warnings, id: d.id, ...(chk.emergency ? { emergency: true } : {}), ...(refill ? { refill: refill.pid } : {}) };
  if (by === 'user') inform(game, chk, out);
  return out;
}

/** Prośba o delegowanie zawodnika pierwszej drużyny na mecz rezerw: { status: 'accepted'|'refused'|'pending', reason, ... }. */
export function requestDelegation(game, args) { return request(game, args, 'down'); }
/** Prośba o powołanie zawodnika rezerw (w awarii też juniora akademii) na mecz pierwszej drużyny: { status, reason, ... }. */
export function requestCallUp(game, args) { return request(game, args, 'up'); }

/** Szansa zatwierdzenia eskalacji (0-1): 35 + 0,4 x autorytet trenera + 0,2 x zaufanie zarządu, 10-90 %. Kluby AI 50/50 [SZAC]. */
export function escalationChance(game, parent) {
  const user = parent === game.clubId;
  const auth = user ? Math.round(100 * (game.authority?.club === game.clubId ? game.authority.v ?? 0.5 : 0.5)) : 50;
  const trust = user ? (game.board?.trust ?? 60) : 50;
  return clamp(RSV.escBase + RSV.escAuth * auth + RSV.escTrust * trust, RSV.escMin, RSV.escMax) / 100;
}

/**
 * Wymuszenie mimo odmowy = eskalacja do dyrektora sportowego (decyzja właściciela z Nov 17, 2026): tylko po odmowie
 * trenera rezerw (nie przy twardej odmowie: przepisy, minima, limity), najwyżej 1 na 30 dni na klub. Szansa:
 * escalationChance. Koszt dla gracza: zaufanie zarządu -2 przy zatwierdzeniu, -4 przy odrzuceniu; przy zatwierdzeniu
 * nastrój trenera rezerw -5 i przez 14 dni +20 pp szansy odmowy kolejnych próśb.
 */
export function forceRequest(game, { pid, fixtureId, by = 'user' } = {}) {
  const R = ensureReserves(game);
  const p = game.world?.players?.[pid];
  const fam = p ? familyOf(game, p.clubId) : null;
  const kind = fam && (p.clubId === fam.reserve || isAcademy(game, p)) ? 'up' : 'down';
  const chk = checkMove(game, pid, fixtureId, kind);
  chk.pid = pid;
  if (!chk.ok) return { status: 'refused', reason: reasonsText(chk.reasons), reasons: chk.reasons, warnings: chk.warnings, hard: true };
  if (chk.emergency) return request(game, { pid, fixtureId, by }, kind);
  if (!R.refused[`${pid}:${fixtureId}`]) return { status: 'refused', reason: TEXT.notRefused, reasons: ['notRefused'], warnings: chk.warnings, hard: true };
  const last = R.force[fam.parent];
  if (last && dayDiff(last, game.date) < RSV.forceEveryDays) return { status: 'refused', reason: `${TEXT.forceCooldown} Ostatnie: ${fmtDate(last)}.`, reasons: ['forceCooldown'], warnings: chk.warnings, hard: true };
  R.force[fam.parent] = game.date;
  const chance = escalationChance(game, fam.parent);
  const ok = new Rng(`eskalacja:${game.seed}:${pid}:${fixtureId}`).next() < chance;
  if (fam.parent === game.clubId && game.board) game.board.trust = clamp((game.board.trust ?? 60) - (ok ? RSV.escCostOk : RSV.escCostNo), 0, 100);
  if (!ok) {
    statsOf(game).escNo++;
    const out = { status: 'refused', reason: TEXT.escalationRejected, reasons: ['escalationRejected'], warnings: chk.warnings, hard: true, chance, escalation: true };
    if (by === 'user') inform(game, chk, out);
    return out;
  }
  R.forceOk[fam.parent] = game.date;
  moodDrop(game, fam.reserve, RSV.moodForce);
  statsOf(game).forced++;
  const d = addDelegation(game, chk, by, true);
  const refill = chk.kind === 'up' && chk.gk ? refillReserveGk(game, fam, chk.fixture) : null;
  const out = { status: 'accepted', reason: null, reasons: [], warnings: chk.warnings, id: d.id, forced: true, chance, ...(refill ? { refill: refill.pid } : {}) };
  if (by === 'user') inform(game, chk, out);
  return out;
}

/**
 * Awaryjne uzupełnienie kadry pierwszej drużyny na najbliższy mecz (gracz przyciskiem, kluby AI same): bramkarz rezerw
 * (najwyżej 1), bez niego bramkarz akademii; z pola zawodnicy rezerw (do 5, kolejność potrzeb z planDeficitFill),
 * potem juniorzy akademii (do 2). Zwraca listę wyników próśb.
 */
export function emergencyFill(game, clubId, { by = 'user' } = {}) {
  const out = [];
  let em = emergencyFor(game, clubId);
  if (!em.emergency) return out;
  const fam = familyOf(game, clubId);
  const f = em.fixture;
  if (em.gk) {
    const cand = [...reserveCandidates(game, fam, f, true), ...academyCandidates(game, fam, f, true).sort((a, b) => b.ovr - a.ovr)];
    for (const p of cand) { const r = requestCallUp(game, { pid: p.id, fixtureId: f.id, by }); out.push({ pid: p.id, ...r }); if (r.status === 'accepted') break; }
    em = emergencyFor(game, clubId, f.id);
  }
  if (em.squad) {
    const a = em.available;
    const needs = ['DEF', 'MID', 'ATT'].filter((g) => a[g] < MATCH_MIN[g]).map((g) => ({ scope: 'match', group: g, missing: MATCH_MIN[g] - a[g] }));
    const rest = RSV.emergencyTotal - a.total - needs.reduce((s, n) => s + n.missing, 0);
    if (rest > 0) needs.push({ scope: 'match', group: 'ALL', missing: rest });
    const plan = planDeficitFill(needs, { reserves: reserveCandidates(game, fam, f, false), academy: academyCandidates(game, fam, f, false), freeAgents: [], inWindow: false });
    for (const act of plan) {
      if (act.type !== 'promoteReserve' && act.type !== 'promoteAcademy') continue;
      const r = requestCallUp(game, { pid: act.id, fixtureId: f.id, by });
      out.push({ pid: act.id, ...r });
    }
  }
  return out;
}

/**
 * Stan PZPN „23+” zawodnika do plakietki (tylko ostrzeżenie, bez blokady gry w pierwszej drużynie; blokada dotyczy gry
 * w rezerwach po osiągnięciu progu): { senior, apps, limit, blocked, text }.
 */
export function seniorStatus(game, pid, date = game.date) {
  const p = game.world?.players?.[pid];
  if (!p) return null;
  const senior = ruleAge(p) >= RSV.seniorAge;
  const autumn = date.slice(5, 7) >= '07';
  const c = counts(p);
  const apps = autumn ? c.h1 : c.h2;
  const limit = autumn ? RSV.autumnApps : RSV.springApps;
  return { senior, apps, limit, blocked: senior && apps >= limit, text: senior ? `23+: ${Math.min(apps, limit)}/${limit} meczów` : null, family: !!familyOf(game, p.clubId) };
}

/** Odwołanie przydziału przed meczem: id przydziału albo { pid, fixtureId }. Zwraca { ok, reason }. */
export function cancelDelegation(game, arg) {
  const R = ensureReserves(game);
  const id = typeof arg === 'string' ? arg : `${arg?.pid}@${arg?.fixtureId}`;
  const d = R.list.find((x) => x.id === id);
  if (!d) return { ok: false, reason: 'Nie ma takiego przydziału.' };
  const f = fixtureById(game, d.fixtureId);
  if (f && (f.played || kickoff(f) <= nowMs(game))) return { ok: false, reason: TEXT.started };
  R.list = R.list.filter((x) => x !== d);
  return { ok: true, reason: null };
}

/** Przydziały na mecz: [{ id, pid, name, from, to, kind: 'down'|'up', by, forced, emergency }]. */
export function delegationsFor(game, fixtureId) {
  return listOf(game).filter((d) => d.fixtureId === fixtureId).map((d) => ({ ...d, name: game.world?.players?.[d.pid]?.name ?? d.pid }));
}

/**
 * Drużyna zawodnika w weekendzie daty date (domyślnie bieżący albo najbliższy weekend):
 * { team, source: 'played' (był w kadrze meczowej) | 'planned' (przydział) | 'own' (mecz własnej drużyny) | null, weekend }.
 */
export function playerTeamThisWeekend(game, pid, date = game.date) {
  const p = game.world?.players?.[pid];
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const wk = weekendKey(date) ?? addDays(date, (5 - day + 7) % 7);
  if (!p) return { team: null, source: null, weekend: wk };
  if (p.rsv?.wk?.k === wk) return { team: p.rsv.wk.t, source: 'played', weekend: wk };
  const d = listOf(game).find((x) => x.pid === pid && weekendKey(x.date) === wk);
  if (d) return { team: d.to, source: 'planned', weekend: wk };
  if (p.clubId && teamFixtureInWeekend(game, p.clubId, wk)) return { team: p.clubId, source: 'own', weekend: wk };
  return { team: null, source: null, weekend: wk };
}

// ------------------------------------------------------------ Kadra meczowa (squadFor) i zapis meczu (applyResult)
/** Zawodnicy przydzieleni do drużyny clubId na mecz f (obiekty świata; tylko nadal w kadrze klubu kontraktu). */
export function matchGuests(game, f, clubId) {
  const out = [];
  if (!f || !game.reserves?.list?.length) return out;
  for (const d of game.reserves.list) {
    if (d.fixtureId !== f.id || d.to !== clubId) continue;
    const p = game.world.players[d.pid];
    const wc = game.world.clubs[d.from];
    if (p && p.clubId === d.from && (wc?.squad.includes(p.id) || wc?.academy?.includes(p.id))) out.push(p);
  }
  return out;
}

/** Najbliższy nierozegrany mecz drużyny w rozgrywkach comp od dnia gry (kadra bez podanego meczu). */
function nextTeamFixture(game, clubId, comp) {
  return firstOf(game, clubId, (f) => !f.played && f.comp === comp && f.date >= (game.date ?? ''));
}

/**
 * Kadra drużyny na mecz w klubie z rezerwami: własni zawodnicy niedostępni z zasad klubu (weekend, 48 h, PZPN 23+,
 * Puchar Polski) dostają teamBlock, dochodzą przydzieleni (guest); 23+ z pierwszej drużyny ponad 3 tylko na ławkę
 * (benchOnly). Kluby bez rezerw: kadra bez zmian.
 */
export function familySquad(game, clubId, comp, base, f = null) {
  if (!game?.world || comp === 'friendly') return base;
  const fam = familyOf(game, clubId);
  if (!fam) return base;
  const fx = f ?? nextTeamFixture(game, clubId, comp);
  if (!fx || fx.comp === 'friendly') return base;
  const ctx = eligCtx(game, clubId, fx);
  const out = base.map((p) => {
    const why = eligibilityRaw(game, p, clubId, fx, 'runtime', ctx);
    return why.length ? { ...p, teamBlock: why[0] } : p;
  });
  const gkEm = new Set(listOf(game).filter((d) => d.fixtureId === fx.id && d.to === clubId && d.emergency && d.gk).map((d) => d.pid));
  const guests = matchGuests(game, fx, clubId).filter((p) => !eligibility(game, p, clubId, fx, 'runtime', { gkEmergency: gkEm.has(p.id), ctx }).length);
  const seniors = clubId === fam.reserve ? guests.filter((p) => ruleAge(p) >= RSV.seniorAge && isAvailable(p)).sort((a, b) => b.ovr - a.ovr) : [];
  const bench = new Set(seniors.slice(RSV.maxSeniorXI).map((p) => p.id));
  for (const p of guests) out.push({ ...p, guest: true, ...(bench.has(p.id) ? { benchOnly: true } : {}) });
  if (clubId === fam.reserve) out.push(...tempFill(clubId, out));
  return out;
}

/**
 * Zabezpieczenie rezerw: gdy po powołaniach do pierwszej drużyny, kontuzjach i pauzach nie ma 11 dostępnych
 * z bramkarzem, na ten jeden mecz dochodzą zawodnicy tymczasowi (najsłabsi z wygenerowanej kadry klubu, juniorzy
 * i testowani). Nie ma ich w świecie gry (game.world), więc po meczu znikają: bez statystyk, kontraktów i zapisu.
 */
export function tempFill(clubId, squad) {
  const ok = squad.filter((p) => isAvailable(p) && !p.benchOnly);
  const needGk = !ok.some((p) => GROUP[p.pos] === 'GK');
  const needField = Math.max(0, 11 - ok.length - (needGk ? 1 : 0));
  if (!needGk && !needField) return [];
  const club = knownClub(clubId);
  if (!club) return [];
  const pool = ephemeralSquad(club, SEASON).slice().reverse(); // od najsłabszych (koniec ławki); te same nazwiska w raporcie meczu
  const out = [];
  if (needGk) { const gk = pool.find((p) => GROUP[p.pos] === 'GK'); if (gk) out.push(gk); }
  for (const p of pool) {
    if (out.length >= needField + (needGk ? 1 : 0)) break;
    if (GROUP[p.pos] !== 'GK' && !out.includes(p)) out.push(p);
  }
  return out.map((p) => ({ ...p, clubId, temp: true }));
}

/**
 * Po meczu drużyny z rodziny: weekend i ostatni mecz (48 h) zawodników kadry meczowej (grający, przydzieleni, ławka
 * gracza), liczniki PZPN (mecze pierwszej drużyny, mecze ligowe rezerw), Puchar Polski, kontrola naruszeń.
 */
export function noteFamilyMatch(game, f, clubId, played, guests) {
  const fam = familyOf(game, clubId);
  if (!fam || f.comp === 'friendly') return;
  const st = statsOf(game);
  const wk = weekendKey(f.date);
  const ids = new Set(played.keys());
  for (const g of guests) ids.add(g.id);
  if (clubId === game.clubId) for (const id of game.tactics?.bench ?? []) ids.add(id);
  const end = new Date(kickoff(f) + RSV.matchMin * MIN).toISOString().slice(0, 16);
  for (const id of ids) {
    const p = game.world.players[id];
    if (!p || (p.clubId !== fam.parent && p.clubId !== fam.reserve)) continue;
    const s = rs(p);
    if (wk) {
      // bramkarz w awarii: dozwolony wyjątek od zasady weekendu (nie jest naruszeniem)
      if (s.wk?.k === wk && s.wk.t !== clubId && !listOf(game).some((d) => d.pid === id && d.fixtureId === f.id && gkEmergencyOf(d, p))) st.viol++;
      s.wk = { k: wk, t: clubId };
    }
    const x = played.get(id);
    if (!x) continue;
    if (s.last && s.last.t !== clubId && p.pos !== 'BR' && s.last.min > RSV.halfMin) {
      const gap = kickoff(f) - Date.parse(`${s.last.end}:00Z`);
      if (gap >= 0 && gap < RSV.restH * H) st.viol48++;
    }
    s.last = { t: clubId, end, min: x.minutes ?? 90 };
    if (clubId === fam.parent) { if (f.date.slice(5, 7) >= '07') s.h1++; else s.h2++; } else if (LEAGUE_COMPS.includes(f.comp)) s.lo++;
    if (f.comp === 'pp') {
      if (!s.pp) s.pp = clubId;
      else if (s.pp !== clubId) { const m = ((game.reserves.ppMoved ??= {})[clubId] ??= []); if (!m.includes(id)) m.push(id); }
    }
  }
}

/** Pauzy odbywane przez zawodników drugiej drużyny rodziny: mecz w klasie (albo pucharze pierwszej drużyny). */
export function serveFamilySuspensions(game, f, clubId, key, played) {
  const fam = familyOf(game, clubId);
  if (!fam || f.comp === 'friendly') return;
  if (!LEAGUE_CLASS_KEYS.includes(key) && clubId !== fam.parent) return;
  const other = clubId === fam.parent ? fam.reserve : fam.parent;
  for (const p of squadOf(game.world, other)) if (p && p.susp?.[key] > 0 && !played.has(p.id)) { p.susp[key]--; if (p.susp[key] === 0) clearSuspWhy(p, key); }
}

/** Po meczu: przydziały na ten mecz wykorzystane albo przepadłe (zawodnik niedostępny w dniu meczu). */
export function closeFixture(game, f, inSquad) {
  const R = game.reserves;
  if (!R?.list?.length) return;
  const mine = R.list.filter((d) => d.fixtureId === f.id);
  if (!mine.length) return;
  const st = statsOf(game);
  for (const d of mine) { if (inSquad.has(d.pid)) st.used++; else st.voided++; }
  R.list = R.list.filter((d) => d.fixtureId !== f.id);
}

// ------------------------------------------------------------ Przeniesienie na stałe w górę
/** Czy zawodnika rezerw można przenieść na stałe do pierwszej drużyny: { ok, reasons[] }. */
export function canPromoteReserve(game, pid) {
  const p = game.world?.players?.[pid];
  if (!p) return { ok: false, reasons: ['noPlayer'] };
  const fam = familyOf(game, p.clubId);
  if (!fam || p.clubId !== fam.reserve) return { ok: false, reasons: ['notReserve'] };
  if (!game.world.clubs[p.clubId].squad.includes(pid)) return { ok: false, reasons: ['notInSquad'] };
  const R = ensureReserves(game);
  const reasons = [];
  if ((R.promoted[`${SEASON}:${fam.parent}`] ?? 0) >= RSV.promoteMax) reasons.push('promoteLimit');
  if (game.world.clubs[fam.parent].squad.length >= 40) reasons.push('squadFull');
  const f = nextTeamFixture(game, fam.reserve, compOfClub(clubOf(fam.reserve))) ?? { date: game.date, comp: compOfClub(clubOf(fam.reserve)) };
  if (!minimumOk(game, fam.reserve, f, [pid], RSV.resMin)) reasons.push('resMin');
  return { ok: !reasons.length, reasons };
}

/**
 * Przeniesienie zawodnika rezerw na stałe do pierwszej drużyny (jak awans z akademii: nowy kontrakt pierwszej drużyny
 * na 3 lata, bez lastMove, więc wychowanek do 21 lat dalej nie liczy się do limitu kadry). Zwraca { ok, text, reasons }.
 */
export function promoteReserve(game, pid) {
  const chk = canPromoteReserve(game, pid);
  if (!chk.ok) return { ok: false, text: reasonsText(chk.reasons), reasons: chk.reasons };
  const W = game.world;
  const p = W.players[pid];
  const fam = familyOf(game, p.clubId);
  const R = ensureReserves(game);
  W.clubs[fam.reserve].squad = W.clubs[fam.reserve].squad.filter((x) => x !== pid);
  W.clubs[fam.parent].squad.push(pid);
  p.clubId = fam.parent;
  p.squad = 'A';
  const c = clubOf(fam.parent);
  const y = Number(game.date.slice(0, 4)) + (game.date.slice(5) > '06-30' ? 1 : 0) + 2;
  const wage = Math.max(p.contract?.wage ?? 0, marketWage(p.ovr, Math.min(4, c?.tier ?? 3), false, payLevel(c)));
  p.contract = { ...(p.contract ?? {}), wage, until: `${y}-06-30`, clause: 0, signedOn: game.date };
  p.wage = wage;
  if (game.market?.listed) delete game.market.listed[pid];
  R.list = R.list.filter((d) => d.pid !== pid);
  R.promoted[`${SEASON}:${fam.parent}`] = (R.promoted[`${SEASON}:${fam.parent}`] ?? 0) + 1;
  return { ok: true, text: `${p.name} przechodzi z rezerw do pierwszej drużyny. Kontrakt do 30 czerwca ${y}.`, reasons: [] };
}

// ------------------------------------------------------------ Nowy sezon
/**
 * Koniec sezonu (src/season/rollover.js): przydziały i odmowy wygasają; pauzy z klas zostają w klasie drugiej drużyny
 * rodziny, a pozostałe przechodzą do klasy drużyny zawodnika w nowym sezonie (awans, spadek, zmiana klubu).
 */
export function reservesNewSeason(game) {
  const R = ensureReserves(game);
  R.list = []; R.refused = {}; R.ppMoved = {};
  for (const p of Object.values(game.world.players)) {
    if (!p.susp || !p.clubId) continue;
    const t = tierOfClub(p.clubId);
    const own = t != null && t <= 4 ? classKeyOfTier(t) : null;
    if (!own) continue;
    const fam = familyOf(game, p.clubId);
    const other = fam ? classKeyOfTier(tierOfClub(p.clubId === fam.parent ? fam.reserve : fam.parent)) : null;
    for (const k of LEAGUE_CLASS_KEYS) {
      if (k === own || k === other || !(p.susp[k] > 0)) continue;
      p.susp[own] = (p.susp[own] ?? 0) + p.susp[k];
      delete p.susp[k];
      moveSuspWhy(p, k, own);
    }
  }
}

// ------------------------------------------------------------ Kluby AI
/** Poniedziałek: do 3 zawodników spoza 18 najlepszych z ostrością poniżej 60 na mecz rezerw w tym tygodniu. */
function aiWeeklyDown(game, parent, rid, date, soon) {
  const rf = soon.find((f) => involves(f, rid) && f.date > date);
  if (!rf) return;
  const have = listOf(game).filter((d) => d.fixtureId === rf.id && d.kind === 'down').length;
  let room = Math.min(RSV.aiDownMax, RSV.maxDown) - have;
  if (room <= 0) return;
  const sq = squadOf(game.world, parent).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const cands = sq.slice(RSV.aiTop).filter((p) => (p.sharp ?? 70) < RSV.aiSharpBelow && !(p.injuryDays > 0) && !p.loan).sort((a, b) => (a.sharp ?? 70) - (b.sharp ?? 70));
  for (const p of cands) {
    if (room <= 0) break;
    const r = requestDelegation(game, { pid: p.id, fixtureId: rf.id, by: 'ai' });
    if (r.status === 'accepted') room--;
    else if (r.reasons?.includes('firstMin') || r.reasons?.includes('limitDown')) break;
  }
}

/**
 * Codziennie: awaria pierwszej drużyny klubu AI na mecz w ciągu 48 h (mniej niż 2 zdrowych bramkarzy albo mniej niż 18
 * dostępnych): powołania jak u gracza (emergencyFill: bramkarz rezerw, potem akademii; z pola rezerwy, potem juniorzy).
 */
function aiEmergency(game, parent, date, soon) {
  const f = soon.find((x) => involves(x, parent));
  if (!f) return;
  if (emergencyFor(game, parent, f.id).emergency) emergencyFill(game, parent, { by: 'ai' });
}

/** Wiadomość dla gracza o awarii przed jego meczem (raz na mecz); powołania robi gracz (emergencyFill albo requestCallUp). */
function userEmergencyNote(game, date, soon) {
  const fam = familyOf(game, game.clubId);
  if (!fam || fam.parent !== game.clubId) return [];
  const f = soon.find((x) => involves(x, game.clubId));
  if (!f) return [];
  const em = emergencyFor(game, game.clubId, f.id);
  if (!em.emergency) return [];
  const why = [em.gk ? `zdrowych bramkarzy: ${em.available.GK}` : null, em.squad ? `dostępnych zawodników: ${em.available.total}` : null].filter(Boolean).join(', ');
  const name = clubOf(fam.reserve)?.name ?? fam.reserve;
  return [createMessage({ date, key: `rezerwy-awaria:${f.id}`, category: 'staff', from: 'Asystent', priority: 'important', subject: 'Awaria przed meczem: możesz powołać zawodników z rezerw',
    body: `Przed meczem ${clubOf(f.home)?.name ?? f.home} - ${clubOf(f.away)?.name ?? f.away} (${fmtDate(f.date)}) mamy za mało zawodników (${why}).\n\nTrener ${name} nie może teraz odmówić: bramkarz rezerw (najwyżej 1, potem junior z akademii), z pola do ${RSV.emFieldMax} zawodników rezerw, potem do ${RSV.emAcadField} juniorów akademii.` })];
}

/** Porządki (przydziały na rozegrane, usunięte albo przełożone mecze) i decyzje klubów AI. Przed meczami dnia. */
registerDailySystem({
  id: 'reserves', order: 4,
  run(game, date) {
    if (!game.world || !game.fixtures || !game.season) return {};
    const R = ensureReserves(game);
    if (R.list.length) {
      const byId = new Map();
      for (const d of R.list) byId.set(d.fixtureId, null);
      for (const f of game.fixtures) if (byId.has(f.id)) byId.set(f.id, f);
      R.list = R.list.filter((d) => {
        const f = byId.get(d.fixtureId);
        if (!f || f.played || f.date < date || !game.world.clubs[d.to] || !familyOf(game, d.from)) return false;
        d.date = f.date;
        return true;
      });
    }
    const monday = new Date(`${date}T12:00:00Z`).getUTCDay() === 1;
    const to7 = addDays(date, 7); const to2 = addDays(date, 2);
    const soon = game.fixtures.filter((f) => !f.played && f.date >= date && f.date <= to7 && f.comp !== 'friendly');
    const soon2 = soon.filter((f) => f.date <= to2);
    for (const [parent] of RES_INDEX) {
      if (parent === game.clubId) continue; // gracz decyduje sam
      const rid = reserveTeamOf(game, parent);
      if (!rid) continue;
      if (monday) aiWeeklyDown(game, parent, rid, date, soon);
      aiEmergency(game, parent, date, soon2);
    }
    // Nastrój trenerów rezerw wraca co poniedziałek o 1 do 50
    if (monday) for (const [rid, v] of Object.entries(R.mood)) R.mood[rid] = v < RSV.moodStart ? v + 1 : v > RSV.moodStart ? v - 1 : v;
    return { messages: userEmergencyNote(game, date, soon2) };
  },
});
