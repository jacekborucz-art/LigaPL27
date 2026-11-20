// Rynek pracy trenera (docs/kariera-trenera.md rozdz. 6): stan bez pracy, wakaty z rynku trenerów AI (trener
// tymczasowy w klubie), aplikacje (najwyżej 3 aktywne, nowa co 3 dni, 90 dni karencji po odmowie), rozmowa i decyzja
// klubu w dniu wyboru trenera (deterministycznie z ziarna gry, klubu i daty aplikacji), gwarantowane oferty po 60
// i 120 dniach, oferty niezamówione po udanym sezonie i w trakcie sezonu, rezygnacja, kara za masowe aplikowanie.
// Oferty to te same decyzje w poczcie co dawniej (refs.kind 'jobOffer', obsługa w careerSystem.js). Liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { CLUBS_PL, clubById, leagueLabel } from '../data/clubs_pl.js';
import { SEASON_YEAR } from '../config/calendar2026.js';
import { clubReputation } from './reputation.js';
import { ownerOf, OWNER_TYPES } from './owners.js';
import { seasonGoalFor, tablePos } from './board.js';
import { fanProfile } from './fans.js';
import { coachAvg } from './coaches.js';
import { ensureCoachMarket, hireLevel, userLeftClub, holdVacancy, MARKET } from './coachMarket.js';
import { ensureCareerHistory, careerLeave, careerJoin, careerMassApply, reachOf, CAREER } from './coachCareer.js';
import { playQuick, applyResult } from '../season/season.js';
import { fmtDate } from '../ui/dom.js';

export const JOB = {
  maxApps: 3, gapDays: 3, cooldown: 90, ownClubCooldown: 365, massN: 6, massDays: 30,
  interviewAfter: 1, minDecide: 3, noDateDecide: 14, offerDays: 7,
  fallback1: 60, fallback2: 120, outOfReach: 15, resignDays: 182, summerBids: 2, summerReach: 5,
  // Kalibracja (docs/kariera-trenera.md rozdz. 11): klub ocenia trenera wobec połowy swojej reputacji (projekt: 0,6),
  // bazy 0,6 i 0,55 (projekt: 0,5 i 0,45), inaczej trener z III ligi prawie zawsze czekał na ofertę gwarantowaną
  need: 0.5,
  int: { base: 0.6, w: 0.035, media: 0.004, min: 0.03, max: 0.9 },
  off: { base: 0.55, w: 0.03, min: 0.02, max: 0.85, ambition: 0.015, wealth: 0.01, rivalW: 0.033, rivalMax: 6 },
  summer: { base: 0.35, perAchievement: 0.04, max: 0.8 },
  month: { base: 0.04, w: 0.01, max: 0.2 },
  mediaW: 150, mediaBlock: 25,
  chance: { high: 0.3, mid: 0.12 },
};

const nameOf = (id) => clubById(id)?.name ?? id;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const seasonYear = (game) => game.seasonYear ?? SEASON_YEAR;
const msg = (date, o) => createMessage({ date, category: 'board', from: 'Agent trenera', priority: 'info', ...o });
const ACTIVE = new Set(['czeka', 'rozmowa', 'oferta']);

/** Stan pracy trenera (stary zapis: zatrudniony). */
export function ensureJob(game) {
  const M = (game.manager ??= {});
  const J = (M.job ??= { status: 'employed', since: null, lastClub: null });
  J.apps ??= []; J.refused ??= {}; J.applyLog ??= []; J.fallback ??= {};
  return J;
}
const isOut = (game) => game?.manager?.job?.status === 'unemployed';
/** Klub, w którym trener pracował ostatnio (bez pracy: game.clubId poza pętlą dnia, w pętli job.lastClub). */
const lastClubOf = (game) => game.manager?.job?.lastClub ?? game.clubId;

// ------------------------------------------------------------ Szanse
function rivals(game, clubId) {
  const L = hireLevel(game, clubId);
  const n = (ensureCoachMarket(game).pool ?? []).filter((c) => { const a = coachAvg(c); return a > L && a <= L + MARKET.hire.reach; }).length;
  return 1 - JOB.off.rivalW * Math.min(n, JOB.off.rivalMax); // konkurencja: lepsi wolni trenerzy w zasięgu klubu (0,7-1)
}

/** Szanse na rozmowę i ofertę (bez losowania): { pInt, pOff, p, label, reach, out }. */
export function jobChances(game, clubId) {
  const club = clubById(clubId);
  const rep = game.manager?.rep ?? 15;
  const media = game.manager?.career?.pop?.media ?? 50;
  const LC = clubReputation(club);
  const reach = reachOf(rep);
  const gap = rep - JOB.need * LC;
  const out = LC > reach + JOB.outOfReach;
  const I = JOB.int; const O = JOB.off;
  const o = ownerOf(game, clubId);
  const owner = (LC > reach ? -O.ambition * (o.ambicja - 10) : 0) + (gap >= 10 ? O.wealth * (o.zasobnosc - 10) : 0);
  const pInt = out ? 0 : clamp(I.base + I.w * gap + I.media * (media - 50), I.min, I.max);
  const pOff = out ? 0 : clamp(O.base + O.w * gap + owner, O.min, O.max) * rivals(game, clubId);
  const p = pInt * pOff;
  return { pInt, pOff, p, reach, out, label: p >= JOB.chance.high ? 'wysoka' : p >= JOB.chance.mid ? 'średnia' : 'niska' };
}

// ------------------------------------------------------------ Wakaty
/** Kluby z trenerem tymczasowym (po zwolnieniu trenera AI albo po odejściu gracza). */
export function vacancyList(game) {
  const out = [];
  const y = seasonYear(game);
  for (const [id, p] of Object.entries(game.coaches ?? {})) {
    const c = clubById(id);
    if (!p?.caretaker || !c || c.parent || c.tier > 4 || !game.world?.clubs?.[id]) continue;
    if (!isOut(game) && id === game.clubId) continue;
    out.push({ clubId: id, club: c, closes: p.until ?? `${y + 1}-06-02` });
  }
  return out.sort((a, b) => a.club.tier - b.club.tier || clubReputation(b.club) - clubReputation(a.club));
}

const OWNER_LABEL = (t) => OWNER_TYPES[t]?.label ?? 'właściciel';

/** Stan rynku pracy dla widoku (kontrakt API: docs/kariera-trenera.md rozdz. 8). */
export function jobState(game) {
  const J = ensureJob(game);
  const out = isOut(game);
  const date = game.date;
  const last = J.lastClub ?? (out ? game.clubId : null);
  const appBy = new Map(J.apps.filter((a) => ACTIVE.has(a.state)).map((a) => [a.clubId, a]));
  const vacancies = vacancyList(game).map((v) => {
    const ch = jobChances(game, v.clubId);
    const cd = J.refused[v.clubId] && J.refused[v.clubId] > date ? J.refused[v.clubId] : null;
    return { clubId: v.clubId, name: v.club.name, league: leagueLabel(v.club), clubRep: Math.round(clubReputation(v.club)), owner: OWNER_LABEL(ownerOf(game, v.clubId).type), goal: seasonGoalFor(v.club).text, chance: ch.label, closes: v.closes, applied: appBy.has(v.clubId), cooldownUntil: cd };
  });
  const lastApply = J.applyLog.at(-1);
  const canApplyFrom = lastApply && addDays(lastApply, JOB.gapDays) > date ? addDays(lastApply, JOB.gapDays) : null;
  return {
    status: out ? 'unemployed' : 'employed', since: out ? J.since : null, days: out && J.since ? Math.max(0, daysBetween(J.since, date)) : 0,
    lastClub: last ? { id: last, name: nameOf(last) } : null,
    vacancies,
    apps: J.apps.slice(-10).map((a) => ({ clubId: a.clubId, name: nameOf(a.clubId), date: a.date, state: a.state })),
    canApplyFrom,
    canResign: canResign(game),
  };
}

// ------------------------------------------------------------ Aplikacje
/** Wysłanie aplikacji do wakatu (tylko bez pracy). Zwraca { ok, text }. */
export function applyJob(game, clubId) {
  const J = ensureJob(game);
  const date = game.date;
  if (!isOut(game)) return { ok: false, text: 'Prowadzisz klub. O pracę w innym klubie możesz się starać po odejściu.' };
  const v = vacancyList(game).find((x) => x.clubId === clubId);
  if (!v) return { ok: false, text: 'Ten klub nie szuka teraz trenera.' };
  if (J.apps.some((a) => a.clubId === clubId && ACTIVE.has(a.state))) return { ok: false, text: 'Aplikacja do tego klubu już czeka na odpowiedź.' };
  if (J.refused[clubId] && J.refused[clubId] > date) return { ok: false, text: `Ten klub nie rozpatrzy twojej aplikacji przed ${fmtDate(J.refused[clubId])}.` };
  if (J.apps.filter((a) => ACTIVE.has(a.state)).length >= JOB.maxApps) return { ok: false, text: `Możesz mieć najwyżej ${JOB.maxApps} aktywne aplikacje. Poczekaj na odpowiedź albo wycofaj jedną.` };
  const lastApply = J.applyLog.at(-1);
  if (lastApply && addDays(lastApply, JOB.gapDays) > date) return { ok: false, text: `Kolejną aplikację wyślesz od ${fmtDate(addDays(lastApply, JOB.gapDays))}.` };
  const p = game.coaches[clubId];
  let decideOn = p.until ?? addDays(date, JOB.noDateDecide);
  if (decideOn < addDays(date, JOB.minDecide)) decideOn = addDays(date, JOB.minDecide);
  if (p.until && p.until < decideOn) p.until = decideOn; // klub czeka z wyborem do dnia decyzji
  J.apps.push({ clubId, date, state: 'czeka', interviewOn: addDays(date, JOB.interviewAfter), decideOn });
  J.applyLog.push(date); J.applyLog = J.applyLog.slice(-20);
  // Masowe aplikowanie: 6 aplikacji w 30 dni (raz na 30 dni)
  const recent = J.applyLog.filter((d) => daysBetween(d, date) < JOB.massDays).length;
  let extra = '';
  if (recent >= JOB.massN && !(J.massAt && daysBetween(J.massAt, date) < JOB.massDays)) { J.massAt = date; careerMassApply(game, date); extra = ' Media piszą, że rozsyłasz aplikacje do wielu klubów.'; }
  return { ok: true, text: `Aplikacja wysłana do ${nameOf(clubId)}. Klub wybierze trenera do ${fmtDate(decideOn)}.${extra}` };
}

export function withdrawApplication(game, clubId) {
  const J = ensureJob(game);
  const a = J.apps.find((x) => x.clubId === clubId && ACTIVE.has(x.state));
  if (!a) return { ok: false, text: 'Brak aktywnej aplikacji do tego klubu.' };
  J.apps = J.apps.filter((x) => x !== a);
  if (a.state === 'oferta') {
    releaseHold(game, clubId, game.date);
    // Tylko oferta z tej aplikacji (jeden klub); oferta agenta z kilkoma klubami zostaje w poczcie
    game.inbox = (game.inbox ?? []).map((m) => (m.refs?.kind === 'jobOffer' && m.refs?.jobClubs?.length === 1 && m.refs.jobClubs[0] === clubId && !m.resolved ? { ...m, resolved: true } : m));
  }
  return { ok: true, text: `Wycofano aplikację do ${nameOf(clubId)}.` };
}

/** Klub przestaje czekać na odpowiedź gracza: trener AI wybrany następnego dnia. */
function releaseHold(game, clubId, date) {
  const p = game.coaches?.[clubId];
  if (p?.caretaker && p.until && p.until > date) p.until = addDays(date, 1);
}

function refuse(game, a, date, text) {
  const J = ensureJob(game);
  a.state = 'odmowa';
  J.refused[a.clubId] = addDays(date, JOB.cooldown);
  return msg(date, { key: `aplikacja-odmowa:${a.clubId}:${a.date}`, from: nameOf(a.clubId), priority: 'important', subject: `${nameOf(a.clubId)}: odpowiedź na aplikację`, body: `${text} Kolejną aplikację do tego klubu możesz wysłać od ${fmtDate(J.refused[a.clubId])}.` });
}

/** Wiadomość z ofertą pracy (decyzja jak dawniej: refs.kind 'jobOffer'). clubs: [{ clubId, why }]. */
export function offerMessage(game, date, clubs, { subject, body, key, source }) {
  const out = isOut(game);
  return createMessage({
    date, key, category: 'board', from: 'Agent trenera', priority: 'important', subject, body,
    actions: [...clubs.map((c) => ({ id: c.clubId, label: `Przyjmij: ${nameOf(c.clubId)} (${leagueLabel(clubById(c.clubId))})` })), { id: 'stay', label: out ? 'Odrzuć' : 'Zostaję' }],
    refs: { kind: 'jobOffer', jobClubs: clubs.map((c) => c.clubId), source }, optional: true,
  });
}

function processApps(game, date) {
  const J = ensureJob(game);
  const msgs = [];
  for (const a of J.apps) {
    if (!ACTIVE.has(a.state)) continue;
    const p = game.coaches?.[a.clubId];
    if (a.state === 'oferta') {
      if (date > a.offerUntil) { a.state = 'odmowa'; a.expired = true; releaseHold(game, a.clubId, date); }
      continue;
    }
    if (!p?.caretaker) { a.state = 'odmowa'; msgs.push(msg(date, { key: `aplikacja-zajete:${a.clubId}:${a.date}`, subject: `${nameOf(a.clubId)}: klub ma już trenera`, body: `${nameOf(a.clubId)} zatrudnił trenera, zanim rozpatrzył twoją aplikację.` })); continue; }
    const rng = new Rng(`aplikacja:${game.seed}:${a.clubId}:${a.date}`);
    const ch = jobChances(game, a.clubId);
    const rInt = rng.next(); const rOff = rng.next();
    if (a.state === 'czeka' && date >= a.interviewOn) {
      if (rInt < ch.pInt) {
        a.state = 'rozmowa';
        msgs.push(msg(date, { key: `aplikacja-rozmowa:${a.clubId}:${a.date}`, from: nameOf(a.clubId), priority: 'important', subject: `${nameOf(a.clubId)}: zaproszenie na rozmowę`, body: `Zarząd ${nameOf(a.clubId)} chce porozmawiać o pracy trenera. Decyzja zapadnie do ${fmtDate(a.decideOn)}.` }));
      } else { msgs.push(refuse(game, a, date, ch.out ? `${nameOf(a.clubId)} szuka trenera o większym nazwisku.` : `Zarząd ${nameOf(a.clubId)} dziękuje za zgłoszenie, ale nie zaprasza na rozmowę.`)); continue; }
    }
    if (a.state === 'rozmowa' && date >= a.decideOn) {
      if (rOff < ch.pOff) {
        a.state = 'oferta'; a.offerUntil = addDays(date, JOB.offerDays);
        if (p.until && p.until < a.offerUntil) p.until = a.offerUntil; // klub czeka na odpowiedź
        msgs.push(offerMessage(game, date, [{ clubId: a.clubId }], { key: `aplikacja-oferta:${a.clubId}:${a.date}`, source: 'aplikacja', subject: `${nameOf(a.clubId)}: oferta pracy`, body: `Po rozmowie zarząd ${nameOf(a.clubId)} proponuje ci pracę. Cel: ${seasonGoalFor(clubById(a.clubId)).text}. Oferta jest ważna do ${fmtDate(a.offerUntil)}.` }));
      } else msgs.push(refuse(game, a, date, `Po rozmowie zarząd ${nameOf(a.clubId)} wybrał innego kandydata.`));
    }
  }
  J.apps = J.apps.filter((a) => ACTIVE.has(a.state) || daysBetween(a.date, date) <= 120).slice(-12);
  return msgs;
}

// ------------------------------------------------------------ Oferty: gwarantowane i niezamówione
function candidates(game, { maxRep = Infinity, minRep = -Infinity, tier = null } = {}) {
  const last = lastClubOf(game);
  return CLUBS_PL.filter((c) => !c.parent && c.tier <= 4 && game.world?.clubs?.[c.id] && c.id !== game.clubId && c.id !== last && (tier == null || c.tier === tier))
    .map((c) => {
      const g = seasonGoalFor(c); const t = tablePos(game, c.id);
      return { c, rep: clubReputation(c), under: t.pos ? t.pos - g.target : 0, vac: !!game.coaches?.[c.id]?.caretaker };
    }).filter((x) => x.rep <= maxRep && x.rep > minRep);
}

/** Gwarantowane oferty bez pracy: po 60 dniach 2 kluby w zasięgu, po 120 dniach klub III ligi. */
function fallbackOffers(game, date) {
  const J = ensureJob(game);
  if (!J.since) return [];
  const d = daysBetween(J.since, date);
  const reach = reachOf(game.manager.rep);
  const rng = new Rng(`oferty-gwarantowane:${game.seed}:${J.since}:${d}`);
  if (d >= JOB.fallback2 && !J.fallback[120]) {
    J.fallback[120] = date;
    const xs = candidates(game, { tier: 4 }).sort((a, b) => Number(b.vac) - Number(a.vac) || b.under - a.under || a.rep - b.rep);
    const pick = xs[0] ?? rng.pick(candidates(game, {}));
    if (!pick) return [];
    return [offerMessage(game, date, [{ clubId: pick.c.id }], { key: `oferta-120:${J.since}`, source: 'gwarantowana', subject: `Oferta pracy: ${pick.c.name}`, body: `Agent znalazł pracę po ${d} dniach bez klubu: ${pick.c.name} (${leagueLabel(pick.c)}). Cel: ${seasonGoalFor(pick.c).text}.` })];
  }
  if (d >= JOB.fallback1 && !J.fallback[60]) {
    J.fallback[60] = date;
    // Najpierw wakaty w zasięgu, potem kluby poniżej celu (zarząd szuka zmiany), najbliżsi poziomem trenera
    let xs = candidates(game, { maxRep: Math.max(reach, 20) });
    xs = [...rng.shuffle(xs.filter((x) => x.vac)), ...rng.shuffle(xs.filter((x) => !x.vac && x.under > 0)).sort((a, b) => b.rep - a.rep).slice(0, 6), ...xs.filter((x) => !x.vac && x.under <= 0)].slice(0, 2);
    if (!xs.length) return [];
    return [offerMessage(game, date, xs.map((x) => ({ clubId: x.c.id })), { key: `oferta-60:${J.since}`, source: 'gwarantowana', subject: 'Agent: kluby gotowe cię zatrudnić', body: `Po ${d} dniach bez pracy agent ma propozycje: ${xs.map((x) => `${x.c.name} (${leagueLabel(x.c)})`).join(', ')}.` })];
  }
  return [];
}

/** Waga oferty od klubu: popularność w mediach, wymagający kibice nie chcą trenera bez nazwiska. */
function mediaOk(game, c) { return !((game.manager?.career?.pop?.media ?? 50) < JOB.mediaBlock && fanProfile(c.id).big); }
const mediaMul = (game) => 1 + (game.manager?.career?.pop?.media ?? 50) / JOB.mediaW;

/** Osiągnięcia sezonu do ofert po sezonie: awans (miejsce premiowane), trofea, cel wyprzedzony. */
function seasonAchievements(game) {
  const club = clubById(game.clubId);
  const t = tablePos(game, game.clubId);
  const C = game.manager.career; const key = game.season?.seasonId;
  let n = 0;
  if (t.pos && ((club.tier === 4 && t.pos === 1) || (club.tier > 1 && t.pos <= 2))) n++;
  n += (C?.awards ?? []).filter((a) => a.season === key && a.clubId === game.clubId && ['puchar_polski', 'superpuchar_polski', 'mp_ekstraklasa', 'liga_mistrzow', 'liga_europy', 'liga_konferencji', 'superpuchar_europy'].includes(a.badgeId)).length;
  const g = game.board?.goal;
  if (t.pos && g?.target && g.target - t.pos >= 1) n += g.target - t.pos >= 3 ? 2 : 1;
  return n;
}

/**
 * Oferty niezamówione dla zatrudnionego trenera. kind 'summer' (3 czerwca, po udanym sezonie) albo 'month'
 * (pierwszy dzień miesiąca, po serii udanych miesięcy). Zwraca listę klubów [{ clubId, name, league }].
 */
export function unsolicitedOffers(game, date, kind) {
  if (isOut(game) || !game.clubId) return [];
  const rep = game.manager.rep;
  const reach = reachOf(rep);
  const cur = clubReputation(clubById(game.clubId));
  const rng = new Rng(`oferty-pracy:${kind}:${game.seed}:${date}`);
  let p;
  if (kind === 'summer') {
    const n = seasonAchievements(game);
    if (!n) return [];
    p = Math.min(JOB.summer.max, JOB.summer.base + JOB.summer.perAchievement * n);
  } else {
    const rv = game.board?.reviews ?? [];
    const t = tablePos(game, game.clubId);
    const good = (rv.length >= 2 && rv[0].delta > 0 && rv[1].delta > 0) || (t.pos && game.board?.goal?.target && t.played >= 8 && t.pos <= game.board.goal.target - 2);
    if (!good) return [];
    p = Math.min(JOB.month.max, JOB.month.base + JOB.month.w * Math.max(0, rep - 0.6 * cur));
  }
  if (!rng.chance(Math.min(0.9, p * mediaMul(game)))) return [];
  const pool = candidates(game, { minRep: cur + 4, maxRep: reach + 6 }).filter((x) => x.under >= (kind === 'summer' ? 1 : 3) && mediaOk(game, x.c));
  const n = kind === 'summer' ? rng.int(1, 2) : 1;
  return rng.shuffle(pool).sort((a, b) => b.under - a.under).slice(0, n).map((x) => ({ clubId: x.c.id, name: x.c.name, league: leagueLabel(x.c) }));
}

/**
 * Przegląd po sezonie (coachMarket.summerReview): klub zmieniający trenera rozważa trenera gracza bez klubu (ta sama
 * szansa co aplikacja: rozmowa x oferta). Przy sukcesie klub czeka na odpowiedź (trener tymczasowy), oferta trafia do
 * poczty następnego dnia. Najwyżej 2 takie oferty na lato. Zwraca true, gdy klub złożył ofertę.
 */
export function summerUserBid(game, clubId, date) {
  if (!isOut(game) || !game.manager) return false;
  const J = ensureJob(game);
  const y = date.slice(0, 4);
  if ((J.summerBids?.[y] ?? 0) >= JOB.summerBids || (J.refused[clubId] && J.refused[clubId] > date)) return false;
  const c = clubById(clubId);
  const ch = jobChances(game, clubId);
  if (!c || ch.out || clubReputation(c) > ch.reach + JOB.summerReach) return false;
  if (!new Rng(`lato-kandydat:${game.seed}:${clubId}:${date}`).chance(ch.p)) return false;
  J.summerBids = { ...(J.summerBids ?? {}), [y]: (J.summerBids?.[y] ?? 0) + 1 };
  const until = addDays(date, JOB.offerDays + 1);
  holdVacancy(game, clubId, date, until);
  J.apps.push({ clubId, date, state: 'oferta', interviewOn: date, decideOn: date, offerUntil: until, agent: true });
  (J.outbox ??= []).push(offerMessage(game, addDays(date, 1), [{ clubId }], { key: `lato-oferta:${clubId}:${date}`, source: 'po sezonie', subject: `${c.name}: oferta pracy`, body: `${c.name} zmienia trenera po sezonie i chce cię zatrudnić. Cel: ${seasonGoalFor(c).text}. Oferta jest ważna do ${fmtDate(until)}.` }));
  return true;
}

/** Nowe wakaty z rozsądną szansą (bez pracy): krótka wiadomość od agenta. */
function vacancyNews(game, date) {
  const J = ensureJob(game);
  const seen = new Set(J.seenVac ?? []);
  const fresh = vacancyList(game).filter((v) => !seen.has(`${v.clubId}:${game.coaches[v.clubId]?.from}`));
  for (const v of fresh) seen.add(`${v.clubId}:${game.coaches[v.clubId]?.from}`);
  J.seenVac = [...seen].slice(-60);
  const good = fresh.filter((v) => jobChances(game, v.clubId).label !== 'niska' && !(J.refused[v.clubId] > date));
  if (!good.length) return [];
  return [msg(date, { key: `wakaty:${date}`, subject: good.length === 1 ? `Wakat: ${good[0].club.name}` : `Nowe wakaty (${good.length})`, body: `${good.map((v) => `${v.club.name} (${leagueLabel(v.club)}) szuka trenera, decyzja do ${fmtDate(v.closes)}.`).join('\n')}\n\nAplikację wyślesz w zakładce Klub, Kariera.` })];
}

// ------------------------------------------------------------ Odejście i zatrudnienie
/** Mecze ostatniego klubu z datą do dziś, nierozegrane: rozgrywa je AI (zmiana pracy w dniu meczu). */
function playPending(game, clubId, date) {
  const todo = (game.fixtures ?? []).filter((f) => !f.played && f.home && f.away && f.date <= date && (f.home === clubId || f.away === clubId));
  if (!todo.length) return;
  const keep = game.clubId; game.clubId = null;
  try {
    for (const f of todo) { const rng = new Rng(`po-odejsciu:${game.seed}:${f.id}`); applyResult(game, f, playQuick(game, f, rng), rng); }
  } finally { if (game.clubId == null) game.clubId = keep; }
}

/**
 * Trener traci pracę: why 'zwolnienie' | 'rezygnacja'. Zapis kariery (kary, blizny, okres pracy), stan bez pracy,
 * trener tymczasowy w ostatnim klubie (klub szuka trenera jak każdy klub AI). Zwraca wiadomości.
 */
export function enterUnemployment(game, date, why, { inSeason = true, dropped = false } = {}) {
  const J = ensureJob(game);
  const clubId = game.clubId;
  if (!clubId || isOut(game)) return [];
  ensureCareerHistory(game);
  const repBefore = game.manager.rep;
  const out = careerLeave(game, date, why, { inSeason });
  game.manager.history = (game.manager.history ?? []).map((h) => (h.club === clubId && !h.to ? { ...h, to: date } : h));
  if (why === 'zwolnienie') game.manager.fired = (game.manager.fired ?? 0) + 1;
  Object.assign(J, { status: 'unemployed', since: date, lastClub: clubId, apps: [], fallback: {} });
  J.refused[clubId] = addDays(date, JOB.ownClubCooldown);
  game.market && (game.market.userListed = {});
  if (game.squadLimit) game.squadLimit.case = null;
  // Decyzje dawnego klubu (oferty za zawodników, sponsorzy, wypożyczenia, sztab) przestają dotyczyć trenera:
  // bez tego blokowały Dalej albo pozwalały decydować za klub prowadzony już przez AI (jak przy switchClub)
  for (const o of game.market?.offers ?? []) if (o.kind === 'incoming' && o.status === 'open') o.status = 'expired'; // wiadomości zamknie przegląd dnia
  game.inbox = (game.inbox ?? []).map((m) => (!m.resolved && m.actions?.length && m.refs?.kind !== 'jobOffer' ? { ...m, resolved: true } : m));
  playPending(game, clubId, date);
  userLeftClub(game, clubId, date, why);
  const d = Math.round((game.manager.rep - repBefore) * 10) / 10;
  const name = nameOf(clubId);
  out.push(createMessage({
    date, key: `bez-pracy:${clubId}:${date}`, category: 'board', from: why === 'zwolnienie' ? 'Zarząd' : 'Agent trenera', priority: 'important',
    subject: why === 'zwolnienie' ? `${name}: zarząd rozwiązuje umowę` : `Odchodzisz z ${name}`,
    body: `${why === 'zwolnienie' ? (dropped ? `${name} spada do IV ligi, której gra nie prowadzi. ` : 'Zarząd stracił zaufanie i zwalnia cię z funkcji trenera. ') : 'Rozwiązałeś umowę z klubem. '}Jesteś trenerem bez klubu${d ? ` (reputacja ${d > 0 ? '+' : ''}${String(d).replace('.', ',')})` : ''}.\n\nWakaty i aplikacje znajdziesz w zakładce Klub, Kariera. Dni mijają przyciskiem Dalej. Jeśli nic nie znajdziesz, po ${JOB.fallback1} dniach agent przyniesie oferty.`,
  }));
  return out;
}

/** Zwolnienie przez zarząd (miesięczna ocena albo koniec sezonu). */
export function coachFired(game, date, opts = {}) {
  return enterUnemployment(game, date, 'zwolnienie', opts);
}

/** Rezygnacja: po 6 miesiącach w klubie albo po sezonie (czerwiec). */
export function canResign(game) {
  if (isOut(game) || !game.clubId) return { ok: false, text: 'Nie prowadzisz teraz klubu.' };
  const C = ensureCareerHistory(game);
  const st = C.stints.filter((s) => !s.to).at(-1);
  const from = st?.from ?? game.manager.history?.at(-1)?.from ?? game.date;
  const days = daysBetween(from, game.date);
  const y = seasonYear(game);
  const after = game.date >= `${y + 1}-06-01`;
  if (after) return { ok: true, text: 'Sezon zakończony: rezygnacja bez kary dla reputacji.', inSeason: false };
  if (days >= JOB.resignDays) return { ok: true, text: `Rezygnacja w trakcie sezonu kosztuje reputację (ok. -${CAREER.pen.resign}).`, inSeason: true };
  return { ok: false, text: `Zrezygnować możesz po 6 miesiącach pracy (od ${fmtDate(addDays(from, JOB.resignDays))}) albo po sezonie.` };
}

export function resign(game) {
  const c = canResign(game);
  if (!c.ok) return { ok: false, text: c.text };
  const name = nameOf(game.clubId);
  const msgs = enterUnemployment(game, game.date, 'rezygnacja', { inSeason: c.inSeason });
  game.inbox = [...msgs, ...(game.inbox ?? [])];
  return { ok: true, text: `Odchodzisz z ${name}. Jesteś trenerem bez klubu.` };
}

/**
 * Nowa praca (switchClub): stan zatrudniony, aplikacje zamknięte, okres pracy w karierze, zaufanie na start.
 * Zwraca { trustShift } (odejście w trakcie umowy obniża zaufanie w nowym klubie).
 */
export function jobAccepted(game, clubId, date, { midContract = false } = {}) {
  const J = ensureJob(game);
  for (const a of J.apps) if (ACTIVE.has(a.state) && a.clubId !== clubId) { if (a.state === 'oferta') releaseHold(game, a.clubId, date); a.state = 'odmowa'; a.withdrawn = true; }
  J.apps = J.apps.filter((a) => a.clubId !== clubId);
  Object.assign(J, { status: 'employed', since: null, lastClub: null, fallback: {} });
  careerJoin(game, clubId, date, midContract ? 'oferta w trakcie umowy' : 'oferta');
  game.inbox = (game.inbox ?? []).map((m) => (m.refs?.kind === 'jobOffer' && !m.resolved ? { ...m, resolved: true } : m));
  return { trustShift: midContract ? -5 : 0 };
}

/** Odrzucenie oferty z poczty (bez pracy: klub wybiera trenera AI). */
export function jobDeclined(game, m) {
  const J = ensureJob(game);
  for (const id of m?.refs?.jobClubs ?? []) {
    const a = J.apps.find((x) => x.clubId === id && x.state === 'oferta');
    if (a) { a.state = 'odmowa'; a.declined = true; }
    releaseHold(game, id, game.date);
  }
}

// ------------------------------------------------------------ System dnia
/**
 * Rynek pracy dnia (order 56, przed rynkiem trenerów AI): aplikacje, oferty gwarantowane, oferty po sezonie.
 * W pętli dnia trener bez klubu ma game.clubId = null (src/core/gameLoop.js).
 */
export function jobMarketDay(game, date) {
  if (!game.world || !game.fixtures || !game.manager) return [];
  ensureJob(game);
  const msgs = [];
  if (isOut(game)) {
    const J = game.manager.job;
    if (J.outbox?.length) { msgs.push(...J.outbox.map((m) => ({ ...m, date }))); J.outbox = []; }
    msgs.push(...processApps(game, date));
    msgs.push(...vacancyNews(game, date));
    msgs.push(...fallbackOffers(game, date));
    return msgs;
  }
  const y = seasonYear(game);
  if (date === `${y + 1}-06-03`) {
    const offers = unsolicitedOffers(game, date, 'summer');
    if (offers.length) msgs.push(offerMessage(game, date, offers, { key: `praca-lato:${y}`, source: 'po sezonie', subject: 'Propozycje pracy po sezonie', body: `Po udanym sezonie odzywają się kluby: ${offers.map((o) => `${o.name} (${o.league})`).join(', ')}. Przyjęcie oznacza odejście z obecnego klubu od razu.` }));
  }
  return msgs;
}

registerDailySystem({
  id: 'jobMarket', order: 56,
  run(game, date) {
    if (!game.season || !game.world) return {};
    return { messages: jobMarketDay(game, date) };
  },
});
