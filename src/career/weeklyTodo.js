// Lista „Do zrobienia w tym tygodniu” (docs/do-zrobienia.md). Liczona na żądanie tylko dla klubu gracza, bez systemu
// dnia: czyta stan gry i zwraca sprawy na bieżący tydzień kalendarzowy (poniedziałek-niedziela).
// Dwa rodzaje spraw:
// - fakty (decyzje z poczty, oferty z terminem, zamknięcie okna, limit kadry, ostatnie dni na obóz): zawsze widoczne
//   i dokładne;
// - obserwacje sztabu (rozmowy, zebranie, przeciążeni, kończące się kontrakty, wczesne przypomnienia kierownika
//   drużyny): przechodzą przez „soczewkę sztabu”. Słabszy sztab tylko zapomina, przypomina później albo źle ocenia
//   pilność; nigdy nie zgłasza sprawy, której nie ma (decyzja właściciela, Nov 16, 2026).
// Losowanie z ziarna gry, tygodnia i klucza sprawy: lista jest stała w tygodniu i po wczytaniu zapisu.
// W zapisie tylko game.todo (odłożone sprawy, pokazane w tym tygodniu, początek spraw). Wartości [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { addDays } from '../core/gameLoop.js';
import { DOMESTIC } from '../config/calendar2026.js';
import { squadOf } from '../world/worldGen.js';
import { staffOf, staffQ } from '../training/staff.js';
import { daysBetween, mondayOf } from '../training/state.js';
import { loadSummary } from '../training/load.js';
import { CAMP } from '../training/config.js';
import { campWindow, bookingFor, halfOf, HALF_NAMES } from '../training/camps.js';
import { talkSuggestions, teamSituation, TALK_COOLDOWN } from './teamTalks.js';
import { canApproach } from './preContracts.js';
import { limitStatus } from './squadLimitSystem.js';
import { licenceNeeds } from './infrastructure.js';
import { staffAttrs } from './teamReport.js';
import { estimateSd, precisionOf, AREP } from './assistantReport.js';
import { fmtDate, fmtDay } from '../ui/dom.js';

export const TODO = {
  version: 1,
  detect: { base: 0.40, perQ: 0.03, severe: 0.20, min: 0.45, max: 0.97 }, // szansa zauważenia sprawy
  shiftA: 0.38, shiftB: 0.017, shiftMin: 0.04, shiftMax: 0.40, shiftDown: 0.6, // zła ocena pilności
  delayK: 0.25, // spóźnione przypomnienie: |N(0; 0,25 x (20 - q))| dni
  hardFrom: 3, // sprawa z terminem jest faktem, gdy do terminu zostały 3 dni lub mniej
  pilne: 2, // termin do 2 dni: pilne
  okno: 7, // przypomnienie o zamknięciu okna od 7 dni przed końcem
  campEarly: 14, // wczesne przypomnienie o obozie od 14 dni przed otwarciem okresu przygotowawczego
  contractDays: 365, renewDays: 183, // kontrakt kończy się w ciągu roku; ważne do pół roku przed końcem
  seenMax: 60, sinceMax: 200, hideMax: 80,
};

export const PRIO_RANK = { pilne: 0, wazne: 1, rozw: 2 };
export const PRIO_WORD = { pilne: 'pilne', wazne: 'ważne', rozw: 'do rozważenia' };
export const PREC_WORD = { exact: 'wysoka', approx: 'średnia', vague: 'niska' };
const ROLE_TITLE = { kierownik: 'Kierownik drużyny', asystent: 'Asystent trenera', fizyczny: 'Trener przygotowania fizycznego', analityk: 'Główny analityk' };

// ------------------------------------------------------------ Stan w zapisie
/** Stan listy w zapisie (stare zapisy: pusty stan; zmiana klubu: reset). Migracja w miejscu, idempotentna. */
export function ensureWeeklyTodo(game) {
  if (!game) return null;
  let S = game.todo;
  if (!S || S.v !== TODO.version || S.club !== game.clubId) S = game.todo = { v: TODO.version, club: game.clubId, rev: 0, hide: {}, seen: { week: null, items: {} }, since: {} };
  S.hide ??= {}; S.seen ??= { week: null, items: {} }; S.since ??= {}; S.rev ??= 0;
  const date = game.date;
  if (date) for (const [k, h] of Object.entries(S.hide)) if (h.mode !== 'case' && h.until && h.until <= date) delete S.hide[k];
  const hk = Object.keys(S.hide);
  if (hk.length > TODO.hideMax) for (const k of hk.slice(0, hk.length - TODO.hideMax)) delete S.hide[k];
  return S;
}

// Odczyt bez zmian w grze (lista liczona w widoku nie może zmieniać zapisu)
const stateOf = (game) => (game.todo && game.todo.club === game.clubId && game.todo.v === TODO.version ? game.todo : { rev: 0, hide: {}, seen: { week: null, items: {} }, since: {} });

// ------------------------------------------------------------ Pomocnicze
const dueIn = (date, due) => (due ? daysBetween(date, due) : null);
const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
const dniWord = (n) => (n === 1 ? 'dzień' : 'dni');
const STEPS = {
  mail: (id) => ({ steps: [{ act: 'mail', id }], focus: '#mail-h' }),
  talk: (id) => ({ steps: [{ act: 'tab', tab: 'kadra' }, { act: 'tsub', s: 'talks' }, { act: 'tt-open', id }] }),
  meeting: () => ({ steps: [{ act: 'tab', tab: 'kadra' }, { act: 'tsub', s: 'talks' }], focus: '.tt-tone' }),
  load: (id) => ({ steps: [{ act: 'tab', tab: 'trening' }, { act: 'tr-tab', tab: 'zawodnicy' }, { act: 'tr-player', id }], focus: '[data-act="tr-pback"]' }),
  card: (id) => ({ steps: [{ act: 'tab', tab: 'transfery', sub: 'kontrakty' }, { act: 'tf-open', id }], focus: '[data-act="tf-close"]' }),
  transfers: (sub) => ({ steps: [{ act: 'tab', tab: 'transfery', sub }] }),
  camp: () => ({ steps: [{ act: 'tab', tab: 'trening' }, { act: 'tr-tab', tab: 'obozy' }] }),
  klub: (sub) => ({ steps: [{ act: 'tab', tab: 'klub', sub }] }),
};

function nextMatch(game, date) {
  let best = null;
  for (const f of game.fixtures ?? []) {
    if (f.played || !f.date || f.date < date || (f.home !== game.clubId && f.away !== game.clubId)) continue;
    if (!best || f.date < best.date) best = f;
  }
  return best;
}

/** Jakość sztabu użyta przez soczewkę (1-20): kierownik drużyny dla spraw organizacyjnych, atrybuty asystenta itd. */
export function todoSkills(game, clubId = game.clubId) {
  const a = staffAttrs(game, clubId, 'asystent');
  const q = (r) => staffQ(game, clubId, r);
  const OCE = a.OCE ?? q('asystent'); const TAK = a.TAK ?? q('asystent');
  return {
    kierownik: q('kierownik'), asystent: q('asystent'), OCE, TAK,
    meeting: 0.5 * TAK + 0.5 * OCE,
    talk: OCE,
    sensitive: 0.7 * OCE + 0.3 * q('asystent'),
    load: 0.7 * q('fizyczny') + 0.3 * OCE,
  };
}

// ------------------------------------------------------------ Kandydaci (stan prawdziwy)
/**
 * Sprawy prawdziwe na dziś: [{ key, type, hard, since, due, prio, sev, role, qe, from, area, pid, title, why, act }].
 * Obserwacje mają role (kto zgłasza) i jakość qe; fakty mają nadawcę (from). Bez losowania.
 */
export function collectTodo(game, date = game.date) {
  const out = [];
  const clubId = game.clubId;
  const W = game.world;
  const S = stateOf(game);
  const sk = todoSkills(game, clubId);
  const staff = staffOf(game, clubId);
  const kName = staff.kierownik?.name ?? null;
  const sinceOf = (key, fallback = date) => S.since[key] ?? fallback;
  const squad = W ? squadOf(W, clubId) : [];
  const fact = (o) => out.push({ hard: true, sev: true, role: null, qe: 20, since: date, ...o });
  const obs = (o) => out.push({ hard: false, ...o });
  const pPrio = (due, pilneAt = TODO.pilne, rest = 'wazne') => (due && dueIn(date, due) <= pilneAt ? 'pilne' : rest);

  // 1. Poczta: decyzje (fakty). Wiadomość bez terminu, która zatrzymuje dni: pilna na dziś.
  const offers = game.market?.offers ?? [];
  const sponsorOffers = game.sponsors?.clubs?.[clubId]?.offers ?? [];
  for (const m of game.inbox ?? []) {
    if (m.resolved || !m.actions?.length) continue;
    const r = m.refs ?? {};
    const base = { key: `decyzja:${m.id}`, type: 'mail', from: m.from, area: 'mail', title: m.subject, act: STEPS.mail(m.id), mailId: m.id };
    if (!m.optional) { fact({ ...base, prio: 'pilne', due: date, why: 'Wiadomość czeka na twoją decyzję. Gra ruszy dalej po odpowiedzi.' }); continue; }
    if (r.kind === 'incomingOffer' || r.kind === 'loanOffers' || r.kind === 'loanRofr') {
      const o = offers.find((x) => x.id === r.offerId);
      if (!o || o.status !== 'open' || !o.expires || o.expires < date) continue;
      fact({ ...base, key: `oferta:${o.id}`, area: 'transfer', due: o.expires, prio: pPrio(o.expires), why: `Oferta jest ważna do ${fmtDate(o.expires)}. Potem wygaśnie.` });
    } else if (r.kind === 'sponsorOffer') {
      const o = sponsorOffers.find((x) => x.id === r.offerId);
      if (!o || !o.expires || o.expires < date) continue;
      fact({ ...base, key: `sponsor:${o.id}`, area: 'club', due: o.expires, prio: pPrio(o.expires), why: `Wybierz wariant do ${fmtDate(o.expires)}. Bez decyzji zarząd podpisze stałą kwotę.`, act: STEPS.mail(m.id) });
    } else if (r.kind === 'moveWish') {
      const p = W?.players[r.pid];
      if (!p || p.clubId !== clubId || p.moveWish?.stage !== 'cicha' || p.moveWish.reacted) continue;
      const due = addDays(p.moveWish.since, 28);
      fact({ ...base, key: `prosba:${p.id}:${p.moveWish.since}`, area: 'contract', pid: p.id, due, prio: pPrio(due, 3), since: p.moveWish.since, why: `Agent zawodnika czeka na reakcję. Bez niej ${p.name} poprosi oficjalnie o transfer po ${fmtDate(due)}.` });
    } else if (r.kind === 'loanOption') {
      const p = W?.players[r.playerId];
      const until = p?.loan?.until;
      if (!p || p.clubId !== clubId || !until || until < date) continue;
      fact({ ...base, key: `wyp-opcja:${p.id}`, area: 'transfer', pid: p.id, due: until, prio: pPrio(until, 3), why: `Opcja wykupu jest ważna do końca wypożyczenia, ${fmtDate(until)}.` });
    } else if (r.kind === 'loanBreach') {
      const p = W?.players[r.playerId];
      if (!p || !p.loan || p.clubId === clubId) continue;
      fact({ ...base, key: `wyp-minuty:${p.id}`, area: 'transfer', pid: p.id, due: null, prio: 'wazne', why: 'Wypożyczony zawodnik gra mniej, niż obiecano. Możesz przerwać wypożyczenie bez kosztów.' });
    } else if (r.kind === 'jobOffer') {
      const due = addDays(m.date, 7);
      if (due < date) continue;
      fact({ ...base, key: `praca:${m.id}`, area: 'club', due, prio: 'rozw', why: `Propozycja pracy jest aktualna do ${fmtDate(due)}.` });
    } else fact({ ...base, due: null, prio: 'rozw', why: 'Odpowiedź nie zatrzymuje gry, ale czeka w poczcie.' });
  }

  // 2. Oficjalna prośba o transfer bez reakcji (fakt)
  for (const p of squad) {
    const Wsh = p.moveWish;
    if (Wsh?.stage !== 'oficjalna' || Wsh.reacted || Wsh.club !== clubId) continue;
    fact({ key: `prosba-oficjalna:${p.id}`, type: 'wish', from: 'Dyrektor sportowy', area: 'contract', pid: p.id, due: null, prio: 'wazne', title: `${p.name} oficjalnie prosi o transfer`,
      why: 'Wystaw go na listę, obiecaj zgodę na dobrą ofertę albo spróbuj go przekonać rozmową lub podwyżką.', act: STEPS.card(p.id) });
  }

  // 3. Limit kadry (fakt, zarząd)
  const L = W && game.squadLimit?.case?.clubId === clubId ? limitStatus(game) : null;
  if (L?.case) {
    const due = L.case.deadline;
    fact({ key: `limit-kadry:${L.case.id}`, type: 'limit', from: 'Zarząd', area: 'transfer', due, prio: pPrio(due, 3), title: `Zmniejsz kadrę: ${L.counted} przy limicie ${L.soft}`,
      why: `Zarząd czeka na redukcję kadry do ${fmtDate(due)}. Potem sam wskaże zawodników.`, act: STEPS.transfers('rynek') });
  }

  // 4. Okno transferowe: ostatnie 3 dni to fakt, wcześniejsze przypomnienie (do 7 dni) daje kierownik drużyny
  const tw = (DOMESTIC.transferWindows ?? []).find((w) => date >= w.from && date <= w.to);
  if (tw && dueIn(date, tw.to) <= TODO.okno) {
    const left = dueIn(date, tw.to);
    const o = { key: `okno:${tw.to}`, type: 'window', area: 'transfer', due: tw.to, title: 'Okno transferowe się zamyka',
      why: left === 0 ? 'Dziś ostatni dzień okna. Potem tylko wolni zawodnicy i przedłużenia kontraktów.' : `Okno zamyka się ${fmtDate(tw.to)}, za ${left} ${dniWord(left)}. Potem tylko wolni zawodnicy i przedłużenia kontraktów.`, act: STEPS.transfers('rynek') };
    if (left <= TODO.hardFrom) fact({ ...o, from: kName ? `${kName}, kierownik drużyny` : 'Kierownik drużyny', prio: pPrio(tw.to) });
    else obs({ ...o, role: 'kierownik', qe: sk.kierownik, sev: false, prio: 'wazne', since: sinceOf(o.key, addDays(tw.to, -TODO.okno)) });
  }

  // 5. Obóz: rezerwacja przed ostatnim terminem (ostatnie dni: fakt, wcześniej: kierownik drużyny)
  if (game.training) {
    const half = halfOf(date);
    const w = campWindow(game, half);
    const lastCall = addDays(w.to, -(CAMP.minDays + 2));
    if (w.length >= CAMP.minDays && !bookingFor(game, w.key) && date >= addDays(w.open, -TODO.campEarly) && date <= lastCall) {
      const name = HALF_NAMES[half];
      const left = dueIn(date, lastCall);
      const o = { key: `oboz:${w.key}`, type: 'camp', area: 'train', due: lastCall, title: `Zarezerwuj: ${name.toLowerCase()}`,
        why: `Obóz musi zmieścić się między ${fmtDate(w.from)} a ${fmtDate(w.to)}. Ostatni dzień na rezerwację najkrótszego obozu: ${fmtDate(lastCall)}.`, act: STEPS.camp() };
      if (left <= TODO.hardFrom) fact({ ...o, from: kName ? `${kName}, kierownik drużyny` : 'Kierownik drużyny', prio: pPrio(lastCall) });
      else obs({ ...o, role: 'kierownik', qe: sk.kierownik, sev: false, prio: date >= w.open ? 'wazne' : 'rozw', since: sinceOf(o.key, addDays(w.open, -TODO.campEarly)) });
    }
  }

  // 6. Kontrakty: zawodnicy, z którymi inne kluby mogą już rozmawiać (fakt), kończące się kontrakty (kierownik drużyny)
  const open = squad.filter((p) => !p.preContract && canApproach(p, date));
  if (open.length) {
    const first = open.map((p) => p.contract.until).sort()[0];
    fact({ key: `kontrakty-czerwiec:${first}`, type: 'contracts', from: kName ? `${kName}, kierownik drużyny` : 'Kierownik drużyny', area: 'contract', due: null, prio: 'wazne',
      title: `${open.length} ${plural(open.length, 'zawodnik może', 'zawodników może', 'zawodników może')} już rozmawiać z innymi klubami`,
      why: `Kontrakt kończy się ${fmtDate(first)}${open.length > 1 ? ' lub wcześniej' : ''}. Inny klub może podpisać umowę od 1 lipca bez odstępnego.`, act: STEPS.transfers('kontrakty') });
  }
  const top = new Set([...squad].filter((p) => !p.loan).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0)).slice(0, 11).map((p) => p.id));
  for (const p of squad) {
    const until = p.contract?.until;
    if (!until || p.loan || p.preContract || until < date) continue;
    const left = dueIn(date, until);
    if (left > TODO.contractDays) continue;
    const key = `kontrakt:${p.id}:${until}`;
    const sev = top.has(p.id) && left <= TODO.renewDays;
    obs({ key, type: 'contract', role: 'kierownik', qe: sk.kierownik, sev, escalate: true, from: kName ? `${kName}, kierownik drużyny` : 'Kierownik drużyny', area: 'contract', pid: p.id, due: until, prio: sev ? 'wazne' : 'rozw', since: addDays(until, -TODO.contractDays),
      title: `Przedłuż kontrakt: ${p.name}`, act: STEPS.card(p.id), data: { until, top: top.has(p.id) } });
  }

  // 7. Licencja: braki w infrastrukturze (kierownik drużyny, bez terminu w grze)
  const lic = game.infra ? licenceNeeds(game, clubId) : [];
  if (lic.length) {
    obs({ key: `licencja:${lic.map((x) => x.track).join('-')}`, type: 'licence', role: 'kierownik', qe: sk.kierownik, sev: false, area: 'club', due: null, prio: 'rozw', since: sinceOf(`licencja:${lic.map((x) => x.track).join('-')}`),
      title: 'Uzupełnij wymogi licencyjne', act: STEPS.klub('infrastruktura'), data: { lines: lic.map((x) => x.text) } });
  }

  // 8. Zebranie drużyny (asystent): od ostatniego minęło 7 dni
  const T = game.talks;
  const meetOk = !T?.lastMeeting || daysBetween(T.lastMeeting, date) >= 7;
  if (meetOk && squad.length) {
    const sit = teamSituation(game);
    const unhappy = squad.filter((p) => p.unhappy || (p.morale ?? 12) <= 8).length;
    const sev = sit.key === 'bad' || unhappy >= 3;
    obs({ key: `zebranie:${mondayOf(date)}`, type: 'meeting', role: 'asystent', qe: sk.meeting, sev, area: 'talk', due: addDays(mondayOf(date), 6), prio: sev ? 'wazne' : 'rozw',
      since: T?.lastMeeting && addDays(T.lastMeeting, 7) > mondayOf(date) ? addDays(T.lastMeeting, 7) : mondayOf(date), title: 'Zwołaj zebranie drużyny', act: STEPS.meeting(), data: { bad: sit.key === 'bad', good: sit.key === 'good', unhappy } });
  }

  // 9. Rozmowy indywidualne (asystent): powody poza pochwałą, kontraktem i kartkami
  const per = T?.perPlayer ?? {};
  const cooldown = (id) => { const h = per[id] ?? []; const last = h.length ? h[h.length - 1].date : null; return last ? Math.max(0, TALK_COOLDOWN - daysBetween(last, date)) : 0; };
  for (const { p, reasons } of W ? talkSuggestions(game) : []) {
    const rs = reasons.filter(([k]) => k !== 'praise' && k !== 'future' && k !== 'warn');
    if (!rs.length || cooldown(p.id) > 0 || p.injuryDays > 0) continue;
    const labels = rs.map((r) => r[1]);
    const attention = labels.some((l) => /bez rozmowy|czeka na rozmowę|mało gra/i.test(l) && /Wrażliwy|Długo|Nowy|Ambitny/.test(l));
    const sev = !!(p.transferRequest || p.unhappy || (p.morale ?? 12) <= 5 || attention);
    const key = `rozmowa:${p.id}`;
    obs({ key, type: 'talk', role: 'asystent', qe: labels.some((l) => l.startsWith('Wrażliwy')) ? sk.sensitive : sk.talk, sev, area: 'talk', pid: p.id, due: null, prio: sev ? 'wazne' : 'rozw',
      since: sinceOf(key), title: `Porozmawiaj z: ${p.name}`, act: STEPS.talk(p.id), data: { labels, morale: p.morale ?? 12 } });
  }

  // 10. Przeciążeni (trener przygotowania fizycznego): ten sam test co raport asystenta
  const nm = nextMatch(game, date);
  const toMatch = nm ? dueIn(date, nm.date) : null;
  const xi = new Set(game.tactics?.xi ?? []);
  for (const p of squad) {
    if (p.injuryDays > 0 || !p.training) continue;
    const acwr = loadSummary(p.training).acwr;
    const fresh = p.fresh ?? 100;
    const tired = acwr > 1.5 || fresh < 60 || (fresh < 70 && !((p.matchDebt ?? 0) > 0));
    if (!tired) continue;
    const sev = xi.has(p.id) && toMatch != null && toMatch <= 3;
    const key = `przeciazenie:${p.id}`;
    obs({ key, type: 'load', role: 'fizyczny', qe: sk.load, sev, area: 'health', pid: p.id, due: nm && toMatch >= 1 ? addDays(nm.date, -1) : null, prio: sev ? 'wazne' : 'rozw',
      since: sinceOf(key), title: `Odciąż: ${p.name}`, act: STEPS.load(p.id), data: { acwr, fresh: Math.round(fresh), inXi: xi.has(p.id) } });
  }
  return out;
}

// ------------------------------------------------------------ Soczewka sztabu
export const detectChance = (q, severe = false) => clamp(TODO.detect.base + TODO.detect.perQ * q + (severe ? TODO.detect.severe : 0), TODO.detect.min, TODO.detect.max);
export const shiftChance = (q) => clamp(TODO.shiftA - TODO.shiftB * q, TODO.shiftMin, TODO.shiftMax);
export const delaySd = (q) => Math.max(0, TODO.delayK * (20 - q));

/**
 * Obserwacje sztabu: przeoczenie (szansa maleje z każdym tygodniem, gdy sprawa wisi), spóźnione przypomnienie,
 * zła ocena pilności (nigdy do „pilne”), limit pozycji na członka sztabu. Fakty bez zmian. Brak fałszywych alarmów:
 * wynik to zawsze podzbiór kandydatów. Sprawy pokazane już w tym tygodniu zostają (sztab nie „odwołuje” zgłoszenia).
 */
export function staffLens(game, cands, date = game.date) {
  const S = stateOf(game);
  const week = mondayOf(date);
  const shown = S.seen?.week === week ? S.seen.items ?? {} : {};
  const out = [];
  const obs = [];
  for (const c of cands) {
    const left = c.due ? dueIn(date, c.due) : null;
    if (c.hard) { out.push({ ...c, prec: 'exact' }); continue; }
    if (c.escalate && left != null && left <= TODO.hardFrom) { out.push({ ...c, hard: true, prec: 'exact', esc: true, from: c.from ?? ROLE_TITLE[c.role] }); continue; } // eskalacja: termin tuż-tuż
    const q = c.qe ?? 10;
    const rng = new Rng(`do-zrobienia:${game.seed}:${week}:${c.key}`);
    const rMiss = rng.next(); const rShift = rng.next(); const rDir = rng.next();
    let late = false;
    if (!shown[c.key]) {
      const n = Math.max(0, Math.floor(daysBetween(c.since ?? date, week) / 7));
      if (rMiss < (1 - detectChance(q, c.sev)) * 0.5 ** n) continue; // sztab o tym zapomniał w tym tygodniu
      const delay = Math.round(Math.abs(new Rng(`do-zrobienia:${game.seed}:${c.key}:${c.since}:opoznienie`).gauss(0, delaySd(q))));
      const from = addDays(c.since ?? date, delay);
      if (date < from) continue; // przypomni później
      late = delay > 0 && from >= week && from > (c.since ?? date);
    } else late = !!shown[c.key].late;
    let prio = c.prio; let shifted = null;
    if (rShift < shiftChance(q)) {
      const down = rDir < TODO.shiftDown;
      if (down && prio === 'wazne') { prio = 'rozw'; shifted = 'down'; }
      else if (!down && prio === 'rozw') { prio = 'wazne'; shifted = 'up'; }
    }
    obs.push({ ...c, prio, truePrio: c.prio, shifted, late, prec: precisionOf(estimateSd(q, 1)), kept: !!shown[c.key] });
  }
  // Limit pozycji na członka sztabu (słaby sztab zgłasza mniej): najpierw już zgłoszone, potem według pilności w jego ocenie
  const byRole = {};
  for (const c of obs) (byRole[c.role] ??= []).push(c);
  const qRole = { kierownik: staffQ(game, game.clubId, 'kierownik'), asystent: staffQ(game, game.clubId, 'asystent'), fizyczny: staffQ(game, game.clubId, 'fizyczny') };
  for (const [role, list] of Object.entries(byRole)) {
    list.sort((a, b) => (b.kept - a.kept) || PRIO_RANK[a.prio] - PRIO_RANK[b.prio] || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.key.localeCompare(b.key));
    const max = Math.max(AREP.items(qRole[role] ?? 10), list.filter((x) => x.kept).length);
    out.push(...list.slice(0, max));
  }
  return out;
}

// ------------------------------------------------------------ Teksty obserwacji
function obsText(c) {
  const d = c.data ?? {};
  const v = c.prec;
  if (c.type === 'talk') {
    const why = [...new Set(d.labels.join(', ').toLowerCase().split(', '))].join(', ');
    return v === 'exact' ? `Powód: ${why}. Lepiej porozmawiać w tym tygodniu, zanim sprawa urośnie.` : v === 'approx' ? `Wygląda na to, że coś go gryzie (${why}). Warto z nim pogadać.` : 'Coś mi mówi, że przydałaby mu się rozmowa. Nie wiem dokładnie, o co chodzi.';
  }
  if (c.type === 'meeting') {
    const lead = d.bad ? 'Po słabszych wynikach w szatni zrobiło się cicho.' : d.unhappy >= 3 ? `W szatni jest kilku niezadowolonych (${d.unhappy}).` : d.good ? 'Seria idzie dobrze, krótkie zebranie może to podtrzymać.' : 'Od ostatniego zebrania minął tydzień.';
    return v === 'vague' ? `${lead} Chyba warto zebrać chłopaków.` : `${lead} Zebranie można zwołać do niedzieli.`;
  }
  if (c.type === 'load') {
    return v === 'exact' ? `ACWR ${d.acwr.toFixed(2).replace('.', ',')}, świeżość ${d.fresh} %. ${d.inXi ? 'Jest w wyjściowym składzie, a mecz blisko.' : 'Lżejszy trening albo odpoczynek przez dzień, dwa.'}` : v === 'approx' ? `Mocno zmęczony po ostatnich dniach. ${d.inXi ? 'Gra w pierwszym składzie, dałbym mu lżejszy trening.' : 'Dałbym mu lżejszy trening.'}` : 'Wygląda na zmęczonego. Może warto go oszczędzić.';
  }
  if (c.type === 'contract') {
    return `Umowa kończy się ${fmtDate(d.until)}.${d.top ? ' To jeden z podstawowych zawodników.' : ''}${v === 'vague' ? ' Chyba warto zacząć rozmowy.' : ' Warto zacząć rozmowy, zanim zrobią to inne kluby.'}`;
  }
  if (c.type === 'licence') return `Do licencji brakuje: ${d.lines.join('; ').toLowerCase()}.`;
  return c.why ?? '';
}

// ------------------------------------------------------------ Lista tygodnia
const cache = new WeakMap();

function signature(game, date) {
  const S = stateOf(game);
  const W = game.world;
  const sq = W ? squadOf(W, game.clubId).map((p) => `${p.id}${p.contract?.until ?? ''}${p.moveWish?.stage ?? ''}${p.moveWish?.reacted ?? ''}${p.unhappy ? 1 : 0}${p.preContract?.club ?? ''}${p.loan ? 1 : 0}${p.training?.mode ?? ''}`).join() : '';
  const inbox = game.inbox ?? [];
  const open = inbox.filter((m) => !m.resolved && m.actions?.length).length;
  const st = staffOf(game, game.clubId);
  return [date, game.clubId, S.rev, inbox.length, open, game.talks?.lastMeeting ?? '', game.talks?.log?.length ?? 0, game.talks?.log?.[0]?.date ?? '',
    (game.training?.camps ?? []).length, (game.market?.offers ?? []).filter((o) => o.status === 'open').map((o) => `${o.id}${o.expires}`).join(), (game.sponsors?.clubs?.[game.clubId]?.offers ?? []).map((o) => o.id).join(), game.squadLimit?.case?.id ?? '',
    (game.tactics?.xi ?? []).join(), Object.values(st).map((s) => s?.q).join(), sq].join('|');
}

/**
 * Lista na tydzień: { week, sunday, items, hidden, done, counts, signers, match }. Wynik w pamięci podręcznej
 * (ten sam obiekt, dopóki stan gry się nie zmieni). Nie zmienia gry.
 */
export function buildWeeklyTodo(game, date = game.date) {
  const sig = signature(game, date);
  const hit = cache.get(game);
  if (hit && hit.sig === sig) return hit.res;
  const S = stateOf(game);
  const week = mondayOf(date);
  const cands = collectTodo(game, date);
  const lensed = staffLens(game, cands, date);
  const items = []; const hidden = [];
  for (const c of lensed) {
    const it = { ...c, why: c.hard && !c.esc ? c.why : obsText(c) || c.why };
    const h = S.hide[c.key];
    const active = h && it.prio !== 'pilne' && (h.mode === 'case' ? h.since === c.since : h.until > date);
    (active ? hidden : items).push(active ? { ...it, hide: h } : it);
  }
  items.sort((a, b) => PRIO_RANK[a.prio] - PRIO_RANK[b.prio] || (b.hard - a.hard) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.key.localeCompare(b.key));
  const keys = new Set(cands.map((c) => c.key));
  const done = S.seen?.week === week ? Object.entries(S.seen.items ?? {}).filter(([k]) => !keys.has(k)).map(([k, v]) => ({ key: k, title: v.t, over: !!(v.due && v.due < date) })) : [];
  const counts = { pilne: 0, wazne: 0, rozw: 0 };
  for (const it of items) counts[it.prio]++;
  const st = staffOf(game, game.clubId);
  const signers = ['kierownik', 'asystent', 'fizyczny'].map((r) => ({ role: r, title: ROLE_TITLE[r], name: st[r]?.name ?? ROLE_TITLE[r], q: st[r]?.q ?? 10, prec: precisionOf(estimateSd(st[r]?.q ?? 10, 1)), n: items.filter((x) => x.role === r && !x.esc).length }));
  const res = { week, sunday: addDays(week, 6), date, clubId: game.clubId, items, hidden, done, counts, signers, match: nextMatch(game, date), sinceKeys: cands.filter((c) => !c.hard).map((c) => c.key) };
  cache.set(game, { sig, res });
  return res;
}

/** Odznaka na przycisku Pulpit: liczba spraw pilnych. */
export function todoBadge(game) {
  const r = buildWeeklyTodo(game);
  return { n: r.counts.pilne, urgent: r.counts.pilne > 0 };
}

/** Zapamiętanie pokazanych spraw i początku obserwacji (jedyna zmiana stanu, wołana z widoku). */
export function noteTodoSeen(game, res = buildWeeklyTodo(game)) {
  const S = ensureWeeklyTodo(game);
  let changed = false;
  if (S.seen.week !== res.week) { S.seen = { week: res.week, items: {} }; changed = true; }
  for (const it of res.items) {
    if (S.seen.items[it.key] || Object.keys(S.seen.items).length >= TODO.seenMax) continue;
    S.seen.items[it.key] = { t: it.title, d: res.date, due: it.due ?? null, late: !!it.late };
    changed = true;
  }
  const since = {};
  for (const k of res.sinceKeys) since[k] = S.since[k] ?? res.date;
  const ks = Object.keys(since);
  if (ks.length > TODO.sinceMax) for (const k of ks.slice(TODO.sinceMax)) delete since[k];
  if (JSON.stringify(since) !== JSON.stringify(S.since)) { S.since = since; changed = true; }
  if (changed) S.rev++;
  return changed;
}

/** Sposoby odłożenia dostępne dla sprawy (pilnych nie można odkładać, faktów najwyżej do 3 dni przed terminem). */
export function snoozeModes(it, date) {
  if (!it || it.prio === 'pilne') return [];
  if (it.due && addDays(it.due, -TODO.hardFrom) <= date) return [];
  return it.hard ? ['day', 'week'] : ['day', 'week', 'case'];
}

/** Odłożenie sprawy: 'day' (do jutra), 'week' (do poniedziałku), 'case' (nie przypominaj w tej sprawie, tylko obserwacje). */
export function snoozeTodo(game, key, mode, date = game.date) {
  const r = buildWeeklyTodo(game, date);
  const it = r.items.find((x) => x.key === key);
  if (!it) return { ok: false, text: 'Tej sprawy nie ma już na liście.' };
  if (it.prio === 'pilne') return { ok: false, text: 'Pilnej sprawy nie można odłożyć.' };
  if (!['day', 'week', 'case'].includes(mode)) return { ok: false, text: 'Nieznany sposób odłożenia.' };
  if (mode === 'case' && it.hard) return { ok: false, text: 'Sprawy z terminem nie można pominąć. Możesz ją odłożyć najwyżej do 3 dni przed terminem.' };
  if (!snoozeModes(it, date).includes(mode)) return { ok: false, text: 'Do terminu zostało za mało czasu, żeby odłożyć tę sprawę.' };
  let until = mode === 'day' ? addDays(date, 1) : mode === 'week' ? addDays(mondayOf(date), 7) : null;
  if (until && it.due) {
    const cap = addDays(it.due, -TODO.hardFrom);
    if (until > cap) until = cap;
    if (until <= date) return { ok: false, text: 'Do terminu zostało za mało czasu, żeby odłożyć tę sprawę.' };
  }
  const S = ensureWeeklyTodo(game);
  S.hide[key] = mode === 'case' ? { mode, since: it.since ?? null, t: it.title } : { mode, until, t: it.title };
  S.rev++;
  return { ok: true, text: mode === 'case' ? `Sztab nie będzie przypominał: ${it.title}.` : `Odłożone do ${fmtDay(until)}: ${it.title}.` };
}

export function unhideTodo(game, key) {
  const S = ensureWeeklyTodo(game);
  if (!S.hide[key]) return { ok: false, text: 'Ta sprawa nie jest odłożona.' };
  const t = S.hide[key].t;
  delete S.hide[key];
  S.rev++;
  return { ok: true, text: `Przywrócone: ${t}.` };
}
