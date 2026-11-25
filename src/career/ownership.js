// Zmiana właściciela klubu (Nov 26, 2026; ekspert od finansów klubów, docs/wlasciciele-i-dlugi.md). Tylko na koniec
// sezonu (rollover 1 lipca), te same zasady dla gracza i klubów AI, kolejność klubów stała (ziarno gry, klub, sezon).
// - Właściciel prywatny, bogaty i spółka odchodzą z szansą zależną od typu i cech (2-4 %, zacisk 0,5-12 %), po słabych
//   2-3 sezonach x1,15; nowy właściciel losowany z tabeli typów dla ligi i sytuacji klubu (po spadku z długami częściej
//   miasto, po awansie częściej inwestor prywatny).
// - Miasto prawie nie sprzedaje (1 %), ale może wycofać wsparcie (2-4 % na sezon, x2 po kryzysie budżetu, po 3 sezonach
//   bez awansu przy celu awansu albo po spadku do III ligi): dopłata i rezerwa 0, klub żyje z TV, biletów i sponsorów;
//   co sezon 10 % szansy na inwestora.
// - Przejęcie przez miasto: dopłata 30-60 % (mediana 45 %) dopłaty poprzednika, nie mniej niż minimum ligi, bez rezerwy.
// - Nowy prywatny właściciel: dopłata z typowej dla ligi (los lognormalny) i z dopłaty poprzednika, rezerwa wg typu,
//   pierwszy sezon ostrożnie (dopłata x0,85, 60 %) albo zastrzyk 25-60 % dopłaty (40 %), spłata długu przy przejęciu.
// Zapis: game.ownerOverride[id] = { type, name, doplata, skarbiec (mln zł), since, withdrawn?, city? } (finanse:
// clubPlan, initClub), game.owners[id] = nowy profil (ownerOf), game.ownerHist[id] = ostatnie 3 sezony,
// game.ownerLog = zmiany (wiadomości mediów, symulacja). Stary zapis bez tych pól działa jak dotąd. Liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { clubById, LEAGUE_NAMES } from '../data/clubs_pl.js';
import { clubFinanceData } from '../data/finanse_klubow.js';
import { OWNER_TYPES, ownerOf, ownerBlurb } from './owners.js';
import { seasonVerdict } from './ownerFunding.js';
import { seasonSummary } from './finance.js';
import { fireCoach, hireCoach } from './coachMarket.js';
import { createMessage } from '../core/inbox.js';
import { anyClub } from '../season/season.js';

export const OWN = {
  leave: { miliarder: 0.02, prywatny: 0.04, spolka: 0.03, miasto: 0.01, klub: 0 }, // szansa odejścia na sezon
  // Niższe ligi częściej zmieniają właściciela (realia: Ekstraklasa 5-10 %/rok, 1 Liga 12-15 %, 2 Liga 15-20 %) [SZAC]
  tierMul: { 1: 1.5, 2: 2.5, 3: 2, 4: 1.25 }, // kalibracja: symulacja 5 sezonów (docs/wlasciciele-i-dlugi.md)
  trait: { impatient: 0.015, patient: -0.01, ambitiousBelow: 0.01, temper: 0.01, poor: 0.02, rich: -0.01, costly: 0.01, tired: 0.02 },
  clamp: [0.005, 0.12],
  poorMul: 1.15, // słabe ostatnie 2-3 sezony: +15 % względnie (decyzja właściciela)
  cityWithdraw: { 1: 0.02, 2: 0.03, 3: 0.03, 4: 0.04 }, cityWithdrawX: 2,
  investor: 0.1, // klub po wycofaniu miasta: szansa na inwestora w sezonie
  newType: {
    1: { prywatny: 50, miliarder: 20, spolka: 15, miasto: 15 },
    2: { prywatny: 55, miasto: 25, spolka: 10, miliarder: 10 },
    3: { prywatny: 55, miasto: 35, spolka: 10, miliarder: 2 },
    4: { prywatny: 55, miasto: 35, spolka: 10, miliarder: 2 },
  },
  debtRelegated: { miasto: 15, miliarder: -10 }, promoted: { prywatny: 5, miliarder: 5 }, // punkty procentowe w tabeli typów
  // Typowa dopłata nowego właściciela w lidze (mln zł na sezon), los lognormalny wokół niej (mediana 1, sd 0,45)
  typical: {
    1: { miliarder: 15, prywatny: 4, spolka: 6, miasto: 5 },
    2: { miliarder: 5, prywatny: 2, spolka: 2.5, miasto: 2 },
    3: { miliarder: 2, prywatny: 0.8, spolka: 0.8, miasto: 0.9 },
    4: { miliarder: 0.8, prywatny: 0.4, spolka: 0.4, miasto: 0.45 },
  },
  lnSd: 0.45,
  afterBillionaire: 0.6, afterOther: [0.8, 1.3], // nowy względem poprzednika: po bogatym zwykle słabszy
  wealth: { miliarder: [14, 20], prywatny: [6, 14], spolka: [8, 14], miasto: [5, 10] },
  reserve: { miliarder: [1, 2], prywatny: [0.3, 1], spolka: [0.5, 0.5], miasto: [0, 0] }, // rezerwa (skarbiec) do dopłaty
  cautious: 0.6, cautiousMul: 0.85, injection: [0.25, 0.6],
  cover: { base: 0.4, perWealth: 0.06, from: 5 }, // spłata długu przy przejęciu: zasobność 5 -> 40 %, 15 -> 100 %
  city: { share: 0.45, sd: 0.08, min: 0.3, max: 0.6, floor: { 1: 4, 2: 2, 3: 1, 4: 0.3 } },
  coach: { base: 0.25, hot: 0.5, hotAmb: 14, hotTemp: 13 }, // nowy właściciel klubu AI: zmiana trenera
  risk: [0.03, 0.06], // ryzyko odejścia słownie: niskie / podwyższone / wysokie
  fresh: 2, // nowy właściciel (także miasto po przejęciu) nie odchodzi i nie wycofuje się przez 2 pierwsze sezony
};

const PRIVATE = ['prywatny', 'miliarder', 'spolka'];
const NEW_NAME = { miliarder: 'Zamożny inwestor', prywatny: 'Inwestor prywatny', spolka: 'Spółka inwestycyjna' };
const WEAK = new Set(['missed', 'disaster']);
const mln = (v) => `${(Math.round(v * 10) / 10).toLocaleString('pl-PL')} mln zł`;

/** Miasto klubu z nazwy (bez pierwszego słowa, np. „Górnik Zabrze” -> „Zabrze”); jednowyrazowa nazwa: samorząd. */
export function cityName(club) {
  const parts = String(club?.name ?? '').split(' ').filter(Boolean);
  return parts.length >= 2 ? `Miasto ${parts.slice(1).join(' ')}` : 'Samorząd miasta';
}

/** Dane właściciela do finansów: nowy właściciel z zapisu albo dane klubu. { type, name, doplata, skarbiec, withdrawn }. */
export function ownerData(game, clubOrId) {
  const id = typeof clubOrId === 'string' ? clubOrId : clubOrId?.id;
  const ov = game?.ownerOverride?.[id];
  if (ov) return ov;
  const w = clubFinanceData(clubById(id) ?? clubOrId)?.wlasciciel ?? {};
  return { type: w.typ ?? 'miasto', name: w.kto ?? '', doplata: w.doplata ?? 0, skarbiec: w.skarbiec ?? 0 };
}

/** Wynik sezonu i różnica miejsc wobec oczekiwanego (dodatnia: niżej niż oczekiwano). */
function seasonGap(clubId, table, strength) {
  const pos = table.indexOf(clubId);
  if (pos < 0) return { v: 'met', gap: 0, exp: -1 };
  const exp = [...table].sort((a, b) => (strength(b) ?? 0) - (strength(a) ?? 0)).indexOf(clubId);
  return { v: seasonVerdict(clubId, table, strength), gap: pos - exp, exp };
}

/** Nowy właściciel w pierwszych sezonach (ctx.year: sezon po zmianie; bez ctx najbliższa zmiana sezonu). */
function isFresh(game, d, ctx) {
  const year = ctx?.year ?? (game.seasonYear ?? 2026) + 1;
  return !!d?.since && !d.withdrawn && year - d.since < OWN.fresh;
}

/** Słabe ostatnie 2-3 sezony: 2 z 3 poniżej oczekiwań, spadek w 3 latach albo 3 sezony z rzędu co najmniej 4 miejsca niżej. */
export function poorSeasons(hist = []) {
  const h = hist.slice(-3);
  if (h.filter((x) => WEAK.has(x.v)).length >= 2 || h.some((x) => x.rel)) return true;
  return h.length === 3 && h.every((x) => x.gap >= 4);
}

/**
 * Szansa odejścia właściciela (nie miasta) na koniec sezonu: { p, poor, parts }. ctx: { tier, verdict, costly, tired }.
 * Bez ctx: ostatni zapisany sezon (widok Klub).
 */
export function leaveChance(game, clubId, ctx = null) {
  const o = ownerOf(game, clubId);
  const data = ownerData(game, clubId);
  const type = data.withdrawn ? 'brak' : o?.type ?? data.type;
  const hist = game.ownerHist?.[clubId] ?? [];
  const last = hist.at(-1);
  const tier = Math.min(4, ctx?.tier ?? clubById(clubId)?.tier ?? 4);
  if (!o || !PRIVATE.includes(type) || isFresh(game, data, ctx)) return { p: 0, poor: poorSeasons(hist), parts: [] };
  const T = OWN.trait; const parts = [];
  let p = OWN.leave[type] * (OWN.tierMul[tier] ?? 1);
  const add = (x, why) => { p += x; parts.push(why); };
  if (o.cierpliwosc <= 6) add(T.impatient, 'niecierpliwy'); else if (o.cierpliwosc >= 15) add(T.patient, 'cierpliwy');
  if (o.ambicja >= 14 && WEAK.has(ctx?.verdict ?? last?.v)) add(T.ambitiousBelow, 'ambitny, a wynik poniżej celu');
  if (o.temperament >= 14) add(T.temper, 'porywczy');
  if (o.zasobnosc <= 6) add(T.poor, 'kończą się pieniądze'); else if (o.zasobnosc >= 15) add(T.rich, 'bogaty');
  if (ctx?.costly ?? last?.costly) add(T.costly, 'duża strata bez sukcesu');
  if (ctx?.tired ?? !!game.debt?.bail?.[clubId]?.off) add(T.tired, 'nie chce dalej spłacać długów');
  const poor = poorSeasons(hist);
  p = clamp(p * (poor ? OWN.poorMul : 1), OWN.clamp[0], OWN.clamp[1]);
  return { p: Math.round(p * 10000) / 10000, poor, parts };
}

/** Szansa wycofania wsparcia przez miasto na koniec sezonu. ctx: { tier, crisis, relegatedToIII }. */
export function cityWithdrawChance(game, clubId, ctx = {}) {
  if (isFresh(game, ownerData(game, clubId), ctx)) return 0;
  const tier = Math.min(4, ctx.tier ?? clubById(clubId)?.tier ?? 4);
  const hist = game.ownerHist?.[clubId] ?? [];
  const h3 = hist.slice(-3);
  const stuck = h3.length === 3 && h3.every((x) => x.pg && !x.pro); // 3 sezony z celem awansu i bez awansu
  const x2 = ctx.crisis ?? hist.at(-1)?.crisis ?? false; // bez ctx (widok Klub): kryzys z budżetu bieżącego sezonu
  const p = (OWN.cityWithdraw[tier] ?? 0.04) * (x2 || stuck || ctx.relegatedToIII ? OWN.cityWithdrawX : 1);
  return Math.round(p * 10000) / 10000;
}

/** Ryzyko zmiany właściciela słownie (widok Klub): { word, p, poor, city }. */
export function leaveRisk(game, clubId) {
  const d = ownerData(game, clubId);
  if (d.type === 'klub') return { word: 'brak', p: 0, poor: false, city: false };
  if (d.type === 'miasto' && !d.withdrawn) {
    const p = cityWithdrawChance(game, clubId);
    return { word: p >= OWN.risk[1] ? 'wysokie' : p >= OWN.risk[0] ? 'podwyższone' : 'niskie', p, poor: poorSeasons(game.ownerHist?.[clubId]), city: true };
  }
  if (d.withdrawn) return { word: 'brak właściciela', p: OWN.investor, poor: false, city: true };
  const r = leaveChance(game, clubId);
  return { word: r.p >= OWN.risk[1] ? 'wysokie' : r.p >= OWN.risk[0] ? 'podwyższone' : 'niskie', p: r.p, poor: r.poor, city: false };
}

function pickType(rng, tier, { debtRelegated = false, promoted = false, noCity = false } = {}) {
  const w = { ...OWN.newType[Math.min(4, Math.max(1, tier))] };
  if (debtRelegated) for (const [k, v] of Object.entries(OWN.debtRelegated)) w[k] = (w[k] ?? 0) + v;
  if (promoted) for (const [k, v] of Object.entries(OWN.promoted)) w[k] = (w[k] ?? 0) + v;
  if (noCity) delete w.miasto;
  const keys = Object.keys(w).filter((k) => w[k] > 0);
  return rng.weighted(keys, (k) => w[k]);
}

function newProfile(game, clubId, type, name, wealth, year) {
  const rng = new Rng(`nowy-wlasciciel-cechy:${game.seed}:${clubId}:${year}`);
  const base = OWNER_TYPES[type] ?? OWNER_TYPES.prywatny;
  const t = (k) => clamp(Math.round(base[k] + rng.gauss(0, 2.6)), 1, 20);
  return { name, type, cierpliwosc: t('cierpliwosc'), ambicja: t('ambicja'), temperament: t('temperament'), media: t('media'), zasobnosc: wealth, since: year };
}

/**
 * Nowy właściciel (bez zapisu do gry). pred: dane poprzednika (ownerData), tier: liga klubu w nowym sezonie.
 * Zwraca { ov, profile, om, cover, injection (zł), kind }.
 */
export function drawNewOwner(game, clubId, { tier, pred, year, type, rng }) {
  const club = clubById(clubId) ?? { id: clubId, name: clubId };
  const t = Math.min(4, Math.max(1, tier ?? club.tier ?? 4));
  const [w0, w1] = OWN.wealth[type] ?? OWN.wealth.prywatny;
  const wealth = rng.int(w0, w1);
  const predDop = pred?.withdrawn ? 0 : pred?.doplata ?? 0;
  const cover = clamp(OWN.cover.base + OWN.cover.perWealth * (wealth - OWN.cover.from), OWN.cover.base, 1);
  if (type === 'miasto') {
    const share = clamp(OWN.city.share + rng.gauss(0, OWN.city.sd), OWN.city.min, OWN.city.max);
    const doplata = Math.round(Math.max(OWN.city.floor[t], share * predDop) * 100) / 100;
    const name = cityName(club);
    const ov = { type: 'miasto', name, doplata, skarbiec: 0, since: year, city: true, share: Math.round(share * 100) / 100 };
    return { ov, profile: newProfile(game, clubId, 'miasto', name, wealth, year), om: { mul: 1, skarbiecMul: 1, why: ['miasto przejmuje klub'] }, cover, injection: 0, kind: 'city' };
  }
  let dop = (OWN.typical[t][type] ?? 1) * Math.exp(rng.gauss(0, OWN.lnSd));
  if (predDop > 0) {
    const rel = pred.type === 'miliarder' ? OWN.afterBillionaire * Math.exp(rng.gauss(0, 0.3)) : OWN.afterOther[0] + rng.next() * (OWN.afterOther[1] - OWN.afterOther[0]);
    dop = Math.sqrt(dop * predDop * rel);
  }
  dop = Math.round(dop * 100) / 100;
  const [r0, r1] = OWN.reserve[type] ?? [0, 0];
  const skarbiec = Math.round(dop * (r0 + rng.next() * (r1 - r0)) * 100) / 100;
  const name = NEW_NAME[type] ?? 'Inwestor prywatny';
  const ov = { type, name, doplata: dop, skarbiec, since: year };
  const cautious = rng.chance(OWN.cautious);
  const injection = cautious ? 0 : Math.round(dop * 1e6 * (OWN.injection[0] + rng.next() * (OWN.injection[1] - OWN.injection[0])) / 1000) * 1000;
  const om = cautious ? { mul: OWN.cautiousMul, skarbiecMul: 1, why: ['nowy właściciel: ostrożny pierwszy sezon'] } : { mul: 1, skarbiecMul: 1, why: ['nowy właściciel: pieniądze na wejście'] };
  return { ov, profile: newProfile(game, clubId, type, name, wealth, year), om, cover, injection, kind: 'sale' };
}

/**
 * Koniec sezonu (rollover, przed planem finansów): historia sezonu każdego klubu, decyzje właścicieli, nowi właściciele.
 * ctx: { res (wyniki sezonu), oldYear, year, date }. Zwraca { [clubId]: zmiana } dla finansów i wiadomości.
 */
export function ownershipRollover(game, { res, oldYear, year, date }) {
  const changes = {};
  const H = (game.ownerHist ??= {});
  const F = game.finance;
  for (const [id, old] of Object.entries(F?.clubs ?? {})) {
    const c = clubById(id);
    // Spadek do IV ligi (bez stałej kadry): klub zaczyna od nowa ze strukturą z danych, długi i nowy właściciel przepadają
    if (!c || c.tier > 4) { if (game.ownerOverride?.[id]) { delete game.ownerOverride[id]; delete game.owners?.[id]; } if (game.debt?.clubs?.[id]) delete game.debt.clubs[id]; if (game.debt?.bail?.[id]) delete game.debt.bail[id]; delete H[id]; continue; }
    if (!game.world?.clubs?.[id]) continue;
    const oldTier = old.tier ?? c.tier;
    const table = oldTier === 4 ? Object.values(res.groupTables ?? {}).find((t) => t.includes(id)) ?? [] : res.tables?.[oldTier] ?? [];
    const { v, gap, exp } = seasonGap(id, table, (x) => anyClub(x)?.L);
    const s = seasonSummary(old);
    const costly = s.net < -0.15 * Math.max(1, s.income) && v !== 'above';
    const pro = c.tier < oldTier; const rel = c.tier > oldTier;
    const entry = { y: oldYear, v, gap, rel, pro, pg: oldTier >= 2 && exp >= 0 && exp <= 1, costly };
    const hist = (H[id] = [...(H[id] ?? []), entry].slice(-3));
    const d = ownerData(game, id);
    if (d.type === 'klub') continue;
    const rng = new Rng(`wlasciciel-zmiana:${game.seed}:${id}:${year}`);
    const tier = Math.min(4, c.tier);
    const ctx = { tier, verdict: v, costly, year };
    let kind = null; let type = null;
    if (d.withdrawn) {
      if (rng.chance(OWN.investor)) { kind = 'investor'; type = pickType(rng, tier, { noCity: true, promoted: pro }); }
    } else if (d.type === 'miasto') {
      const pW = cityWithdrawChance(game, id, { tier, year, crisis: hist.at(-2)?.crisis, relegatedToIII: rel && c.tier === 4 && oldTier === 3 });
      const pS = isFresh(game, d, ctx) ? 0 : (OWN.leave.miasto ?? 0) * (OWN.tierMul[tier] ?? 1);
      const r = rng.next();
      if (r < pW) kind = 'withdraw';
      else if (r < pW + pS) { kind = 'sale'; type = pickType(rng, tier, { noCity: true, promoted: pro }); }
    } else {
      const { p } = leaveChance(game, id, ctx);
      if (rng.chance(p)) { kind = 'sale'; type = pickType(rng, tier, { debtRelegated: rel && old.balance < 0, promoted: pro }); }
    }
    if (!kind) continue;
    const prevName = d.name || ownerOf(game, id)?.name || 'Właściciel';
    const prevType = d.withdrawn ? 'brak' : d.type;
    let ch;
    if (kind === 'withdraw') {
      const ov = { type: 'miasto', name: d.name || cityName(c), doplata: 0, skarbiec: 0, since: year, withdrawn: true };
      const prof = { ...(ownerOf(game, id) ?? newProfile(game, id, 'miasto', ov.name, 3, year)), name: ov.name, type: 'miasto', zasobnosc: 2 };
      ch = { ov, profile: prof, om: { mul: 1, skarbiecMul: 1, why: ['miasto wycofuje wsparcie'] }, cover: 0, injection: 0, kind: 'withdraw' };
    } else {
      ch = drawNewOwner(game, id, { tier, pred: d, year, type, rng: rng.fork('nowy') });
      if (kind === 'investor') ch.kind = 'investor';
    }
    (game.ownerOverride ??= {})[id] = ch.ov;
    (game.owners ??= {})[id] = ch.profile;
    if (game.ownerMood) delete game.ownerMood[id]; // nowy właściciel bez pamięci nastroju
    if (game.debt?.bail?.[id]) delete game.debt.bail[id]; // dopłaty do długów liczone od nowa
    const e = { date, y: year, season: `${oldYear}/${String(year).slice(2)}`, club: id, tier, kind: ch.kind, from: prevType, fromName: prevName, type: ch.ov.type, name: ch.ov.name, doplata: ch.ov.doplata, debt: Math.min(0, Math.round(old.balance)) };
    game.ownerLog = [e, ...(game.ownerLog ?? [])].slice(0, 120);
    changes[id] = { ...ch, prevName, prevType, event: e };
  }
  return changes;
}

/** Kryzys budżetu miasta z pieniędzy właściciela na nowy sezon (ownerSeasonMul): zapis w historii klubu. */
export function noteOwnerCrisis(game, clubId, om) {
  const last = game.ownerHist?.[clubId]?.at(-1);
  if (last && om?.crisis) last.crisis = true;
}

/** Nowy właściciel klubu AI: szansa na zmianę trenera (po finansach, odprawa z nowego budżetu). Zwraca liczbę zmian. */
export function newOwnerCoaches(game, changes, date, year) {
  let n = 0;
  for (const [id, ch] of Object.entries(changes)) {
    if (id === game.clubId || ch.kind === 'withdraw' || !game.coaches?.[id]) continue;
    const o = ch.profile;
    const C = OWN.coach;
    const p = o.ambicja >= C.hotAmb && o.temperament >= C.hotTemp ? C.hot : C.base;
    const rng = new Rng(`nowy-wlasciciel-trener:${game.seed}:${id}:${year}`);
    if (!rng.chance(p)) continue;
    const r = fireCoach(game, id, date, { why: 'po sezonie', rng, summer: true, quiet: true, direct: true });
    if (r && hireCoach(game, id, date, { rng: rng.fork('nowy'), quiet: true })) { n++; ch.coach = true; ch.event.coach = true; }
  }
  return n;
}

/** Nowy właściciel klubu gracza: zaufanie od nowa (50) i cel wg ambicji (ambitny: 1-3 miejsca wyżej). */
export function newOwnerBoard(game, B, club, ch, year, goalText) {
  if (!B || !ch || ch.kind === 'withdraw') return;
  B.trust = 50;
  const o = ch.profile;
  if (o.ambicja >= 14 && B.goal?.target) {
    const up = new Rng(`nowy-wlasciciel-cel:${game.seed}:${club.id}:${year}`).int(1, 3);
    const target = Math.max(1, B.goal.target - up);
    if (target !== B.goal.target) B.goal = { ...B.goal, target, owner: true, text: goalText(club.tier, club.tier === 4 ? target : Math.max(club.tier === 1 ? 1 : 2, target), B.goal) };
  }
}

const TYPE_WORD = { miliarder: 'bogaty inwestor', prywatny: 'inwestor prywatny', spolka: 'spółka', miasto: 'miasto' };

/** Wiadomość dla gracza o zmianie właściciela jego klubu. */
export function ownerChangeMessage(game, clubId, ch, date, fin) {
  const club = clubById(clubId);
  const plan = fin?.plan;
  const dop = plan ? plan.owner / 1e6 : ch.ov.doplata;
  if (ch.kind === 'withdraw') {
    return createMessage({ date, key: `wlasciciel-zmiana:${clubId}:${date}`, category: 'board', from: 'Zarząd', priority: 'important',
      subject: `${ch.ov.name} wycofuje wsparcie dla klubu`,
      body: `${ch.ov.name} nie przekaże w tym sezonie dotacji ani pieniędzy na rezerwę. Klub utrzymuje się z praw TV, biletów i sponsorów. Pilnuj płac: przy długu dłuższym niż miesiąc kosztów klubowi grożą zaległości wobec zawodników, zakaz transferowy i kary.\n\nKażdy sezon bez właściciela daje szansę na nowego inwestora (ok. 10 %).` });
  }
  const o = ch.profile;
  const head = ch.kind === 'city' ? `${ch.ov.name} przejmuje klub od właściciela (${ch.prevName}).` : `${ch.prevName} ${ch.prevType === 'miasto' ? 'przekazuje' : 'sprzedaje'} klub. Nowy właściciel: ${ch.ov.name} (${TYPE_WORD[ch.ov.type] ?? ch.ov.type}).`;
  const money = [
    `Dopłata na sezon: ${mln(dop)}.`,
    ch.ov.skarbiec > 0 ? `Rezerwa na start sezonu: ${mln(ch.ov.skarbiec)}.` : '',
    ch.injection > 0 ? `Na wejście dokłada jednorazowo ${mln(ch.injection / 1e6)}.` : ch.kind !== 'city' ? 'Pierwszy sezon ostrożnie: dopłata 85 % zwykłej kwoty.' : '',
    ch.event.debt < 0 ? `Przy przejęciu spłaca ${Math.round(ch.cover * 100)} % długu klubu (dług ${mln(-ch.event.debt / 1e6)}).` : '',
  ].filter(Boolean).join(' ');
  return createMessage({ date, key: `wlasciciel-zmiana:${clubId}:${date}`, category: 'board', from: 'Zarząd', priority: 'important',
    subject: ch.kind === 'city' ? `Miasto przejmuje klub: ${ch.ov.name}` : `Nowy właściciel klubu: ${ch.ov.name}`,
    body: `${head} ${ownerBlurb(o)}\n\n${money}\n\nNowy właściciel ocenia trenera od nowa: zaufanie zarządu 50 na 100.${o.ambicja >= 14 ? ' Stawia ambitny cel.' : ''} Właściciel jest postacią fikcyjną.` });
}

/** Ostrzeżenie zarządu: właściciel po 2 słabych sezonach rozważa sprzedaż klubu (bez zmiany w tym sezonie). */
export function saleWarningMessage(game, clubId, date) {
  const d = ownerData(game, clubId);
  if (!PRIVATE.includes(d.type) || d.withdrawn) return null;
  const h = (game.ownerHist?.[clubId] ?? []).slice(-2);
  if (h.length < 2 || !h.every((x) => WEAK.has(x.v) || x.rel)) return null;
  const r = leaveRisk(game, clubId);
  return createMessage({ date, key: `wlasciciel-sprzedaz:${clubId}:${date}`, category: 'board', from: 'Zarząd', priority: 'info',
    subject: 'Właściciel rozważa sprzedaż klubu',
    body: `Po dwóch słabych sezonach ${d.name || 'właściciel'} coraz częściej mówi o sprzedaży klubu. Ryzyko zmiany właściciela: ${r.word}. Nowy właściciel ocenia trenera od nowa i może zmienić budżet.` });
}

/** Liga słownie dla wiadomości mediów. */
export const leagueWord = (tier) => (tier === 4 ? 'III liga' : LEAGUE_NAMES[tier] ?? 'liga');
