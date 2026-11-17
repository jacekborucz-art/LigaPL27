// Raport meczu (docs/raport-meczu.md): okrojone zdarzenia meczu zapisane w terminarzu (f.result.ev, pl, rt, pk).
// Mecze w tle (playQuick) nie mają minut: minuty losujemy deterministycznie przy zapisie wyniku, ze spójnością
// (zawodnik po zejściu nie ma już zdarzeń, strzelec i asystent są na boisku, pierwsza żółta przed czerwoną).
// Mecze gracza (pełny silnik): zdarzenia z dziennika silnika z jego minutami, także zmiany i VAR.
//
// Format zdarzenia: [minuta, kod, strona, zawodnik, ...dodatki]; minuta jako liczba, doliczony czas po przecinku
// (45.02 = 45+2', 90.05 = 90+5'), więc sortowanie liczbowe jest chronologiczne. Kody:
//   g gol [asystent], p gol z karnego, o samobój (strona = drużyna, której liczy się gol; zawodnik z drużyny rywala),
//   y żółta [ławka], r czerwona [ławka], r2 druga żółta i czerwona [ławka],
//   i kontuzja z zejściem [kat., dni, nazwa], k kontuzja bez zejścia (gra dalej) [kat., dni, nazwa],
//   s zmiana (zawodnik = wchodzący) [schodzący], mp niewykorzystany karny,
//   vg gol nieuznany po VAR [powód], vc kartka zmieniona po VAR [decyzja], vp rzut karny po VAR.
// Zawodnik zapisany względem klubu swojej drużyny: liczba n = `${klub}-${n}`, '~x' = `${klub}-x`, inaczej pełne id.

import { Rng } from '../core/rng.js';
import { INJURY_TYPES } from '../engine/match/constants.js';

/** Kody zdarzeń z zawodnikiem drużyny rywala (samobój). */
const OPP_PLAYER = new Set(['o']);
/** Kody z drugim zawodnikiem w dodatku (indeks 4): asystent, schodzący. */
const SECOND_PLAYER = new Set(['g', 's']);
/** Kolejność zdarzeń w tej samej minucie: gol przed kartką, kartka przed zejściem z boiska. */
export const EV_ORDER = { g: 0, p: 0, o: 0, vg: 0, vp: 0, mp: 0, vc: 1, y: 1, k: 2, s: 3, r: 3, r2: 3, i: 4 };
/** Zdarzenia, po których zawodnik nie jest już na boisku (zmiana: schodzący w dodatku). */
export const LEAVE = new Set(['r', 'r2', 'i']);

const PLAYABLE = new Map(Object.values(INJURY_TYPES).flat().map(([name, , , playable]) => [name, !!playable]));

// ------------------------------------------------------------ Minuty
const round2 = (x) => Math.round(x * 100) / 100;
/** Minuta z etykiety silnika („45+2'” -> 45.02). */
export function parseMinute(label) {
  const m = /^(\d+)(?:\+(\d+))?/.exec(String(label ?? ''));
  if (!m) return 0;
  return round2(Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0));
}
/** Etykieta minuty (45.02 -> „45+2'”). */
export function minuteLabel(v) {
  const base = Math.floor(v + 1e-9);
  const add = Math.round((v - base) * 100);
  return add ? `${base}+${add}'` : `${base}'`;
}

/** Oś czasu meczu w tle: 1-45, doliczony czas, 46-90, doliczony czas, dogrywka 91-120. */
function timeline(rng, extraTime) {
  const a1 = rng.int(1, 4); const a2 = rng.int(2, 6);
  const t = [];
  for (let m = 1; m <= 45; m++) t.push(m);
  for (let k = 1; k <= a1; k++) t.push(round2(45 + k / 100));
  for (let m = 46; m <= 90; m++) t.push(m);
  for (let k = 1; k <= a2; k++) t.push(round2(90 + k / 100));
  const reg = t.length;
  if (extraTime) for (let m = 91; m <= 120; m++) t.push(m);
  return { t, reg };
}

// ------------------------------------------------------------ Mecz w tle
/**
 * Zdarzenia meczu w tle. goals: [[[strzelec, asystent|null], ...] gospodarze, ... goście] w kolejności z symulacji
 * (gole dogrywki na końcu listy, regScore: wynik po 90 minutach), players: [[{ id, yc, rc, injury }], [...]]
 * (jedenastki, bez zmian). Losowanie z osobnego ziarna (wynik meczu i skutki bez zmian).
 */
export function quickEvents({ goals, players, extraTime = false, regScore = null }, seed) {
  const rng = new Rng(`raport:${seed}`);
  const { t, reg } = timeline(rng, extraTime);
  const last = t.length - 1;
  const raw = []; // [indeks na osi, kod, strona, zawodnik, ...]
  const inv = [new Map(), new Map()]; // ostatni udział zawodnika (gol, asysta)
  const note = (s, id, i) => { if (id) inv[s].set(id, Math.max(inv[s].get(id) ?? -1, i)); };
  [0, 1].forEach((s) => {
    const list = goals[s] ?? [];
    const nReg = extraTime && regScore ? Math.min(list.length, regScore[s]) : list.length;
    list.forEach(([id, aid], j) => {
      const i = j < nReg ? rng.int(0, reg - 1) : rng.int(reg, last);
      raw.push(aid ? [i, 'g', s, id, aid] : [i, 'g', s, id]);
      note(s, id, i); note(s, aid, i);
    });
  });
  [0, 1].forEach((s) => {
    for (const x of players[s] ?? []) {
      const lo = inv[s].get(x.id) ?? 0; // zejście najwcześniej w minucie ostatniego gola lub asysty
      const yc = (x.yc ?? 0) > 0; // druga żółta bez czerwonej z modelu w tle liczy się w grze jako jedna (applyResult)
      const inj = x.injury ?? null;
      const injCode = inj ? (PLAYABLE.get(inj.name) ? 'k' : 'i') : null;
      const injEv = (i, code) => [i, code, s, x.id, inj.cat ?? 'light', inj.days ?? 0, inj.name ?? ''];
      if (x.rc) {
        // Czerwona po żółtej: kartka bezpośrednia w późniejszej minucie (model w tle nie ma drugich żółtych)
        const ri = rng.int(Math.min(last, Math.max(lo, yc ? 1 : 0)), last);
        raw.push([ri, 'r', s, x.id]);
        if (yc) raw.push([rng.int(0, Math.max(0, ri - 1)), 'y', s, x.id]);
        if (inj) raw.push(injEv(rng.int(0, ri), 'k')); // uraz przed wykluczeniem: zawodnik dograł do czerwonej
        continue;
      }
      if (injCode === 'i') {
        const ii = rng.int(lo, last);
        raw.push(injEv(ii, 'i'));
        if (yc) raw.push([rng.int(0, ii), 'y', s, x.id]);
        continue;
      }
      if (yc) raw.push([rng.int(0, last), 'y', s, x.id]);
      if (inj) raw.push(injEv(rng.int(0, last), 'k'));
    }
  });
  raw.forEach((e, n) => { e.n = n; });
  raw.sort((a, b) => a[0] - b[0] || EV_ORDER[a[1]] - EV_ORDER[b[1]] || a.n - b.n);
  return raw.map((e) => { const out = e.slice(); out[0] = t[e[0]]; return out; });
}

// ------------------------------------------------------------ Mecz gracza (pełny silnik)
/** Zdarzenia raportu z dziennika silnika (r.events z result(M)). */
export function engineEvents(events) {
  const out = [];
  for (const e of events ?? []) {
    const m = parseMinute(e.min);
    const s = e.side;
    switch (e.type) {
      case 'goal':
        if (e.provisional) break; // gol anulowany przez VAR: zdarzenie varOverturn
        if (e.ownGoal || e.how === 'OG') out.push([m, 'o', s, e.ogId ?? null]);
        else if (e.how === 'PEN') out.push([m, 'p', s, e.pid]);
        else out.push(e.aid ? [m, 'g', s, e.pid, e.aid] : [m, 'g', s, e.pid]);
        break;
      case 'yellow': out.push(e.bench ? [m, 'y', s, e.pid, 1] : [m, 'y', s, e.pid]); break;
      case 'red': { const c = e.second ? 'r2' : 'r'; out.push(e.bench ? [m, c, s, e.pid, 1] : [m, c, s, e.pid]); break; }
      case 'injury': out.push([m, e.canContinue ? 'k' : 'i', s, e.pid, e.injury?.cat ?? e.severity ?? 'light', e.injury?.days ?? e.days ?? 0, e.injury?.name ?? '']); break;
      case 'sub': out.push([m, 's', s, e.inId ?? e.pid, e.outId]); break;
      case 'shotOn': case 'shotOff': if (e.penalty) out.push([m, 'mp', s, e.pid]); break;
      case 'varOverturn':
        if (e.cancelGoal) out.push([m, 'vg', s, e.pid, e.varReason ?? '']);
        else if (e.decision === 'penaltyAwarded') out.push([m, 'vp', s, e.pid]);
        else if (e.decision === 'secondYellowCancelled' || e.decision === 'redCancelled') out.push([m, 'vc', s, e.pid, e.decision]);
        break;
      default: break;
    }
  }
  return out;
}

// ------------------------------------------------------------ Zapis w terminarzu
export function encodeId(id, clubId) {
  if (id == null) return null;
  const pre = `${clubId}-`;
  if (clubId && typeof id === 'string' && id.startsWith(pre)) {
    const rest = id.slice(pre.length);
    return /^[1-9]\d{0,5}$/.test(rest) ? Number(rest) : `~${rest}`;
  }
  return id;
}
export function decodeId(v, clubId) {
  if (v == null) return null;
  if (typeof v === 'number') return `${clubId}-${v}`;
  if (typeof v === 'string' && v.startsWith('~')) return `${clubId}-${v.slice(1)}`;
  return v;
}

function mapEvent(e, clubs, fn) {
  const out = e.slice();
  const s = e[2];
  out[3] = fn(e[3], clubs[OPP_PLAYER.has(e[1]) ? 1 - s : s]);
  if (SECOND_PLAYER.has(e[1]) && e.length > 4) out[4] = fn(e[4], clubs[s]);
  while (out.length > 4 && (out[out.length - 1] == null || out[out.length - 1] === 0) && e[1] !== 'i' && e[1] !== 'k') out.pop();
  return out;
}

/**
 * Pola raportu do f.result: ev (zdarzenia), pl i rt (zawodnicy, którzy zagrali, i oceny x10), pk (seria karnych:
 * [strona, zawodnik, gol 0/1]), fe (pełny silnik: zmiany i VAR), ab (mecz przerwany).
 */
export function packReport(res, f) {
  const clubs = [f.home, f.away];
  const out = {};
  if (res.ev) out.ev = res.ev.map((e) => mapEvent(e, clubs, encodeId));
  if (res.players) {
    out.pl = [0, 1].map((s) => (res.players[s] ?? []).map((x) => encodeId(x.id, clubs[s])));
    out.rt = [0, 1].map((s) => (res.players[s] ?? []).map((x) => Math.round((x.rating ?? 0) * 10)));
  }
  if (res.pk?.length) out.pk = res.pk.map(([s, id, g]) => [s, encodeId(id, clubs[s]), g ? 1 : 0]);
  if (res.quick === false) out.fe = 1;
  if (res.abandoned) out.ab = 1;
  return out;
}

/** Odczyt raportu z f.result (pełne id zawodników). Stary zapis bez zdarzeń: null. */
export function unpackReport(f) {
  const r = f?.result;
  if (!r?.ev) return null;
  const clubs = [f.home, f.away];
  return {
    ev: r.ev.map((e) => mapEvent(e, clubs, decodeId)),
    players: [0, 1].map((s) => (r.pl?.[s] ?? []).map((v, i) => ({ id: decodeId(v, clubs[s]), rating: (r.rt?.[s]?.[i] ?? 0) / 10 }))),
    pk: (r.pk ?? []).map(([s, v, g]) => ({ side: s, id: decodeId(v, clubs[s]), scored: !!g })),
    full: !!r.fe, abandoned: !!r.ab,
  };
}
