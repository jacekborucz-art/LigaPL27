// Kapitan klubu poza meczem (docs/kapitan.md). Kto nosi opaskę: w klubie gracza jego wybór w składzie (setRole),
// w klubach AI najwyższe C (siła x forma psychiczna, src/engine/captain.js) spośród podstawowych zawodników, z histerezą.
// Skutki tygodniowe (poniedziałek, przed dryfem morale): pominięty naturalny lider, młody kapitan, częste zmiany opaski.
// Te same zasady dla gracza i klubów AI. Stan: game.captainLog = { [clubId]: { id, since, ch: [daty zmian opaski] } };
// stare zapisy: brak wpisu = kapitan z taktyki (gracz) albo wybór AI od dziś, bez kary. Wartości [SZAC].

import { captainPower, captainBase, baseStakes, CAPTAIN } from '../engine/captain.js';
import { squadOf } from '../world/worldGen.js';
import { anyClub } from '../season/season.js';
import { isDerby } from '../match/studio.js';
import { rivalry } from './fans.js';
import { isAvailable } from './squad.js';
import { applyMorale } from './morale.js';

export const CAPT = {
  core: 16, // podstawowi zawodnicy: najwięcej minut w sezonie (na starcie sezonu najwyższa ocena ogólna)
  keep: 0.85, // klub AI zmienia kapitana, gdy obecny ma C poniżej 0,85 najlepszego
  snubRatio: 0.8, snubLid: 15, snub: -0.3, snubWeeks: 6, // naturalny lider bez opaski: -0,3 morale na tydzień, po 6 tyg. niezadowolony
  vetAge: 30, youngVets: -0.1, // kapitan poniżej 21 lat: zawodnicy 30+ tracą 0,1 morale raz w miesiącu
  changeDays: 42, change: -0.1, // opaska zmieniana częściej niż co 6 tygodni: -0,1 morale drużyny na tydzień
};

const DAY = 864e5;
const days = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

/** Podstawowi zawodnicy klubu (bez akademii): najwięcej minut w sezonie, przy równych minutach wyższa ocena. */
export function coreOf(game, clubId) {
  return squadOf(game.world, clubId).filter((p) => p && p.clubId === clubId && p.squad !== 'Y')
    .sort((a, b) => (b.season?.min ?? 0) - (a.season?.min ?? 0) || (b.ovr ?? 0) - (a.ovr ?? 0)).slice(0, CAPT.core);
}

/** Zawodnik z najwyższym C (siła x forma psychiczna) albo null. */
function bestCaptain(ps, date, except = null) {
  let best = null; let bc = -1;
  for (const p of ps) {
    if (p === except) continue;
    const c = captainPower(p, date).C;
    if (c > bc) { bc = c; best = p; }
  }
  return best;
}

/** Kapitan klubu (obiekt zawodnika) albo null: gracz z wyboru w składzie, klub AI z dziennika albo najlepsze C. */
export function clubCaptain(game, clubId, date = game.date) {
  const W = game.world?.players ?? {};
  const own = (id) => { const p = id ? W[id] : null; return p && p.clubId === clubId ? p : null; };
  const id = game.captainLog?.[clubId]?.id;
  if (clubId === game.clubId) return own(id) ?? own(game.tactics?.captain);
  return own(id) ?? bestCaptain(coreOf(game, clubId), date);
}

/** Id kapitana klubu do meczu (silnik: cfg.captainId) albo null. */
export const clubCaptainId = (game, clubId) => clubCaptain(game, clubId)?.id ?? null;

/**
 * Efekt E kapitana klubu (-0,5..1). playing: mecz w tle, a kapitan nie może zagrać (uraz, pauza, kadra):
 * wicekapitan (najwyższe C z dostępnych podstawowych) x0,6 jak w pełnym silniku.
 */
export function clubCaptainE(game, clubId, date = game.date, { playing = false } = {}) {
  if (!game.world?.clubs?.[clubId]) return 0;
  const c = clubCaptain(game, clubId, date);
  if (c && (!playing || isAvailable(c))) return captainPower(c, date).E;
  const dep = bestCaptain(coreOf(game, clubId).filter(isAvailable), date, c);
  return dep ? CAPTAIN.deputy * captainPower(dep, date).E : 0;
}

/** Stawka meczu S dla kapitana (derby, rywal, ranga 0-3, puchar), ta sama dla meczu w tle i pełnego silnika. */
export function fixtureStakes(f, rank = 0, tags = []) {
  if (f.comp === 'friendly') return 0;
  const rv = rivalry(f.home, f.away);
  const derby = tags.includes('derby') || rv >= 2 || (rv === 1 && isDerby(anyClub(f.home), anyClub(f.away)));
  return baseStakes({ derby, rival: rv >= 1 || tags.includes('klasyk'), rank, knockout: !!f.knockout });
}

/** Mecz z rywalem (derby z regionu albo rywalizacja z listy kibiców i edytora), bez sparingów. */
export const rivalMatch = (f) => f.comp !== 'friendly' && (rivalry(f.home, f.away) >= 1 || isDerby(anyClub(f.home), anyClub(f.away)));

/** Zapis zmiany opaski. counted: zmiana z wyboru (liczy się do kary za częste zmiany), nie wymuszona odejściem. */
function setCaptain(game, clubId, id, date, counted) {
  const L = (game.captainLog ??= {});
  const e = L[clubId];
  if (!e) { L[clubId] = { id, since: date, ch: [] }; return; }
  if (e.id === id) return;
  if (counted) e.ch = [...(e.ch ?? []), date].slice(-3);
  e.id = id; e.since = date;
}

/** Gracz zmienia kapitana w składzie (app.js setRole): pierwsza decyzja w zapisie bez kary, kolejne liczą się do stabilności. */
export function noteCaptain(game, id, date = game.date) {
  if (!id || !game?.clubId) return;
  const e = game.captainLog?.[game.clubId];
  const W = game.world?.players ?? {};
  // Poprzedni kapitan odszedł z klubu: wybór następcy nie jest zmianą z wyboru
  setCaptain(game, game.clubId, id, date, !!e && W[e.id]?.clubId === game.clubId);
}

/** Kapitan klubu gracza w składzie meczowym: wybrany kapitan wraca z opaską, gdy jest w jedenastce (asystent dał ją zastępcy). */
export function withClubCaptain(game, tactics) {
  const id = game.captainLog?.[game.clubId]?.id;
  if (id && tactics.xi.includes(id) && tactics.captain !== id) tactics.captain = id;
  return tactics;
}

/**
 * Poniedziałek: opaska w klubach AI (z histerezą), wpisy dla starych zapisów, skutki dla morale:
 * naturalny lider bez opaski (kapitan ma B < 0,8 B lidera): -0,3 na tydzień, po 6 tygodniach niezadowolenie (p.capSnub);
 * kapitan poniżej 21 lat: zawodnicy 30+ -0,1 raz w miesiącu; dwie zmiany opaski w odstępie poniżej 6 tygodni: -0,1 dla kadry
 * przez 6 tygodni od ostatniej zmiany.
 */
export function captainWeek(game, date) {
  const L = (game.captainLog ??= {});
  const W = game.world.players;
  const monthStart = Number(date.slice(8, 10)) <= 7; // pierwszy poniedziałek miesiąca
  for (const clubId of Object.keys(game.world.clubs)) {
    const core = coreOf(game, clubId);
    if (!core.length) continue;
    const mine = clubId === game.clubId;
    const cur = L[clubId]?.id && W[L[clubId].id]?.clubId === clubId ? W[L[clubId].id] : null;
    if (mine) {
      if (!cur) { const t = W[game.tactics?.captain]; if (t?.clubId === clubId) setCaptain(game, clubId, t.id, date, false); }
    } else {
      const best = bestCaptain(core, date);
      if (!cur) { if (best) setCaptain(game, clubId, best.id, date, false); }
      else if (best && best !== cur && captainPower(cur, date).C < CAPT.keep * captainPower(best, date).C) setCaptain(game, clubId, best.id, date, true);
    }
    const capId = L[clubId]?.id;
    const cap = capId ? W[capId] : null;
    if (!cap || cap.clubId !== clubId) continue;
    const squad = squadOf(game.world, clubId).filter((p) => p && p.clubId === clubId);
    // Naturalny lider bez opaski
    let leader = null; let lb = -1;
    for (const p of core) {
      if (p.persona !== 'Lider' && (p.attr?.LID ?? 0) < CAPT.snubLid) continue;
      if (p.injuryDays > 0) continue; // kontuzjowany nie oczekuje opaski (Nov 26, 2026): licznik i niezadowolenie znikają
      const b = captainBase(p);
      if (b > lb) { lb = b; leader = p; }
    }
    const snubbed = leader && leader !== cap && captainBase(cap) < CAPT.snubRatio * lb ? leader : null;
    for (const p of squad) {
      if (p === snubbed) {
        p.capSnub = (p.capSnub ?? 0) + 1;
        p.morale = applyMorale(p.morale ?? 12, CAPT.snub);
        if (p.capSnub >= CAPT.snubWeeks && !p.unhappy) { p.unhappy = true; p.capSnubU = true; }
      } else if (p.capSnub) {
        delete p.capSnub;
        if (p.capSnubU) { if (!p.moveWish && !p.transferRequest) p.unhappy = false; delete p.capSnubU; }
      }
    }
    // Młody kapitan: starsi zawodnicy nie przyjmują jego autorytetu
    if (monthStart && (cap.age ?? 25) < CAPTAIN.young) for (const p of squad) if ((p.age ?? 25) >= CAPT.vetAge && p !== cap) p.morale = applyMorale(p.morale ?? 12, CAPT.youngVets);
    // Częste zmiany opaski
    const ch = L[clubId].ch ?? [];
    if (ch.length >= 2 && days(ch[ch.length - 2], ch[ch.length - 1]) < CAPT.changeDays && days(ch[ch.length - 1], date) < CAPT.changeDays) {
      for (const p of squad) p.morale = applyMorale(p.morale ?? 12, CAPT.change);
    }
  }
}

/** Kapitan klubu gracza dla raportów i odpraw: { p, B, M, C, E, young, snubbed } albo null. */
export function captainInfo(game, date = game.date) {
  const p = clubCaptain(game, game.clubId, date);
  if (!p) return null;
  const snubbed = squadOf(game.world, game.clubId).find((x) => x && x.clubId === game.clubId && (x.capSnub ?? 0) >= 2) ?? null;
  return { p, ...captainPower(p, date), young: (p.age ?? 25) < CAPTAIN.young, snubbed };
}
