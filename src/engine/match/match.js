// Przebieg meczu: minuty, przerwy, doliczony czas (z wydarzeń), dogrywka, seria rzutów karnych,
// oceny zawodników i wynik. Interfejs dla UI: createMatch, step, resume, runToEnd, result.
// Sparingi (M.rules, rules.js): rozstrzygnięcie remisu wg umowy, zmiany bez limitu lub rotacyjne, zmiany zaplanowane.
// Seria rzutów karnych: kolejność strzelców i bramkarz do wyboru (setShootoutOrder), pauza 'shootoutPrep' na życzenie UI.

import { createMatch, emit, runPhases, minuteLabel } from './core.js';
import { substitute, changeTactics, shout, canSubstitute, canShout, subsAvailable } from './control.js';
import { DECIDERS, SUB_RULES, ROTATIONS, FRIENDLY_DEFAULTS, matchRules } from './rules.js';
import { aiDecide, assistantSuggest, applySuggestion, matchState } from './coach.js';
import { goalkeeper, fieldPlayers, planShape, validateTacticPatch, knockEligible, slotIndex } from './teams.js';
import { statsFromEvents } from '../matchStats.js';
import { RATING, K, KNOCK } from './constants.js';
import { clamp } from '../../core/rng.js';

export { createMatch, substitute, changeTactics, shout, canSubstitute, canShout, minuteLabel, subsAvailable, assistantSuggest, applySuggestion, matchState };
export { knockEligible };
export { DECIDERS, SUB_RULES, ROTATIONS, FRIENDLY_DEFAULTS, matchRules };

const HALVES = { 1: 45, 2: 45, 3: 15, 4: 15 };

/** Doliczony czas z tego, co się wydarzyło w połowie (sędzia, A5). */
function addedTime(M) {
  const c = M.halfCounts;
  const twMul = M.teams.some((T) => T.P.timewasting && M.score[T.side] > M.score[1 - T.side]) ? 1.5 : 0;
  const ev = 0.4 * c.goals + 0.4 * c.windows + 0.5 * c.injuries + 1.0 * c.var + 0.15 * c.cards + c.tw + twMul;
  const r = M.rng.int(0, 1);
  if (M.half === 1) return clamp(Math.round(1 + ev + r), 1, 8);
  if (M.half === 2) return clamp(Math.round(2.5 + ev + r), 2, 10);
  return clamp(Math.round(ev * 0.5 + r), 0, 3);
}

/** Remis, który trzeba rozstrzygnąć (M.rules.decider): mecz pucharowy, dwumecz albo sparing z umówioną serią. */
function isLevel(M) {
  if (M.rules.decider === 'none') return false;
  const fl = M.ctx.knockout?.firstLeg;
  // Dwumecz: obecny gospodarz był gościem w pierwszym meczu; suma bramek, bez bramek wyjazdowych
  if (fl) return M.score[0] + fl[0] === M.score[1] + fl[1];
  return M.score[0] === M.score[1];
}

/**
 * Jedna minuta. Zwraca { events (nowe), pause: sekundy (GOL 3 s, VAR 2 s), state: 'play'|'break'|'ended' }.
 * W przerwie (po połowie) trzeba wywołać resume(M), żeby grać dalej (odprawa w przerwie).
 */
export function step(M) {
  if (M.ended) return { events: [], state: 'ended' };
  if (M.phase === 'break') return { events: [], state: 'break' };
  if (M.phase === 'shootoutPrep') {
    // Zgodność wstecz: kolejny krok po pauzie rozgrywa serię (kolejność ustawiona albo automatyczna)
    const from0 = M.events.length;
    startShootout(M);
    return { events: M.events.slice(from0), pause: 0, state: 'ended' };
  }
  const from = M.events.length;
  M.tick++; M.elapsed++;
  const base = { 1: 0, 2: 45, 3: 90, 4: 105 }[M.half];
  M.minute = base + Math.min(M.elapsed, M.length);
  if (M.rules.plannedSubs && M.elapsed <= M.length) plannedSubs(M, M.minute);
  const prevEvents = M.events.length;
  runPhases(M);
  coolingBreak(M);
  for (const T of M.teams) if (T.ai) aiDecide(M, T.side);
  if (M.abandoned) { finish(M); const ev = M.events.slice(from); return { events: ev, pause: 0, state: 'ended' }; }
  // Zdarzenia w doliczonym czasie (gol, VAR, poważna kontuzja) wydłużają go o minutę, najwyżej o K.addedExtraMax
  if (M.added !== null && M.elapsed > M.length && (M.addedExtra ?? 0) < K.addedExtraMax
    && M.events.slice(prevEvents).some((e) => (e.type === 'goal' && !e.provisional) || e.type === 'varOverturn' || (e.type === 'injury' && !e.canContinue))) {
    M.added++; M.addedExtra = (M.addedExtra ?? 0) + 1;
  }
  if (M.elapsed === M.length) {
    M.added = addedTime(M);
    M.addedTimes.push(M.added);
    if (M.added > 0) emit(M, 'addedTime', null, null, { added: M.added, text: `Sędzia dolicza ${M.added} min.` });
  }
  if (M.added !== null && M.elapsed >= M.length + M.added) { M.addedExtra = 0; endHalf(M); }
  const events = M.events.slice(from);
  const pause = Math.max(0, ...events.map((e) => e.pause ?? 0));
  return { events, pause, state: M.ended ? 'ended' : M.phase };
}

/** Przerwa na schłodzenie w upale (ok. 30. min każdej połowy) [SZAC: próg ctx.weather.tempC >= 32 albo cooling]. */
function coolingBreak(M) {
  const w = M.ctx.weather ?? {};
  if (!(w.cooling || (w.tempC ?? 0) >= K.coolingTempC) || M.half > 2 || M.elapsed !== 30) return;
  M.halfCounts.tw += K.coolingAdded;
  for (const T of M.teams) for (const x of fieldPlayers(T)) x.cond = Math.min(100, x.cond + 2);
  emit(M, 'coolingBreak', null, null, { text: 'Przerwa na schłodzenie: zawodnicy piją, trenerzy przekazują uwagi.', pause: 2 });
}

function endHalf(M) {
  const h = M.half;
  if (h === 1) {
    M.halfTimeScore = [...M.score];
    emit(M, 'half', null, null, { text: 'Koniec pierwszej połowy.' });
    M.phase = 'break'; return;
  }
  if (h === 2 && isLevel(M) && M.rules.decider === 'penalties') {
    emit(M, 'half', null, null, { text: 'Koniec meczu. Remis, od razu rzuty karne!' });
    toShootout(M); return;
  }
  if (h === 2 && isLevel(M)) {
    emit(M, 'half', null, null, { text: 'Koniec regulaminowego czasu gry. Będzie dogrywka.' });
    M.extraTime = true;
    for (const T of M.teams) { T.subsLimit += 1; T.windowsLimit += 1; }
    M.phase = 'break'; return;
  }
  if (h === 3) { emit(M, 'half', null, null, { text: 'Koniec pierwszej połowy dogrywki.' }); M.phase = 'break'; return; }
  if (h === 4 && isLevel(M)) { emit(M, 'half', null, null, { text: 'Koniec dogrywki. Rzuty karne!' }); toShootout(M); return; }
  finish(M);
}

/** Do serii rzutów karnych: od razu (domyślnie) albo pauza 'shootoutPrep', gdy UI chce zapytać gracza o kolejność. */
function toShootout(M) {
  if (M.ctx.shootoutPrep) {
    M.phase = 'shootoutPrep';
    const n = Math.min(fieldPlayers(M.teams[0]).length, fieldPlayers(M.teams[1]).length);
    emit(M, 'shootoutPrep', null, null, { takers: n, text: 'Przed serią rzutów karnych: trenerzy ustalają kolejność strzelających.' });
    return;
  }
  shootout(M);
  finish(M);
}

/**
 * Rozpoczęcie serii po pauzie 'shootoutPrep' (po wyborze kolejności w UI). Kolejność nieustawiona: automatyczna.
 * Zwraca { ok, error? }. Po wywołaniu mecz jest zakończony (M.ended), wynik w result(M).shootout.
 */
export function startShootout(M) {
  if (M.phase !== 'shootoutPrep' || M.ended) return { ok: false, error: 'Seria rzutów karnych nie czeka na rozpoczęcie.' };
  shootout(M);
  finish(M);
  return { ok: true };
}

/** Wznowienie po przerwie (po odprawie). */
export function resume(M) {
  if (M.phase !== 'break' || M.ended) return;
  if (M.rules.plannedSubs && M.half === 1) plannedSubs(M, 'HT');
  for (const T of M.teams) if (T.ai) aiDecide(M, T.side);
  M.half++; M.elapsed = 0; M.added = null; M.length = HALVES[M.half];
  M.halfCounts = { goals: 0, windows: 0, injuries: 0, var: 0, cards: 0, tw: 0 };
  M.phase = 'play';
  emit(M, 'kickoff', null, null, { text: M.half === 2 ? 'Początek drugiej połowy.' : M.half === 3 ? 'Początek dogrywki.' : 'Początek drugiej połowy dogrywki.' });
}

/**
 * Do końca meczu bez oglądania („Pokaż wynik od razu”).
 * Drużyna gracza przechodzi pod asystenta (te same reguły co AI).
 */
export function runToEnd(M, { assistantFor = [] } = {}) {
  for (const s of assistantFor) handOver(M.teams[s]);
  for (const s of assistantFor) if (M.phase !== 'break' && !M.ended) aiDecide(M, s);
  let guard = 0;
  while (!M.ended && guard++ < 400) {
    if (M.phase === 'break') resume(M);
    else if (M.phase === 'shootoutPrep') startShootout(M);
    else step(M);
  }
  return result(M);
}

/** Do końca bieżącej połowy (pomija minuty, zatrzymuje się w przerwie). */
export function runToBreak(M, { assistantFor = [] } = {}) {
  const prev = assistantFor.map((s) => [M.teams[s].ai, M.teams[s].assistant]);
  for (const s of assistantFor) handOver(M.teams[s]);
  // Zaległe reakcje (np. czerwona kartka obejrzana na żywo, na którą gracz nie zareagował) asystent obsługuje od razu
  for (const s of assistantFor) if (M.phase !== 'break' && !M.ended) aiDecide(M, s);
  let guard = 0;
  while (!M.ended && M.phase !== 'break' && guard++ < 200) step(M);
  assistantFor.forEach((s, i) => { [M.teams[s].ai, M.teams[s].assistant] = prev[i]; });
}

/** Drużyna gracza przechodzi pod asystenta: jego punktem wyjścia są obecne instrukcje gracza. */
function handOver(T) {
  if (!T.ai) { T.ai = true; T.assistant = true; T.baseInstr = { ...T.tactics.instructions }; T.cq = T.assistantCq ?? null; }
}

// ------------------------------------------------------------ Zmiany zaplanowane przed sparingiem
/**
 * Zmiany zaplanowane przed meczem (M.rules.plannedSubs: { 0: [{ at: 'HT' | minuta, outId, inId }], 1: [...] }), np.
 * „druga jedenastka” po przerwie. Wykonywane przez substitute (te same reguły), by: 'plan'. Nie da się wykonać
 * (kontuzja, czerwona kartka, zawodnik już zszedł): zdarzenie 'plannedSubSkipped' z powodem, mecz toczy się dalej.
 */
function plannedSubs(M, when) {
  const plan = M.rules.plannedSubs;
  M.plannedDone = M.plannedDone ?? new Set();
  for (const side of [0, 1]) {
    const list = plan[side] ?? plan[String(side)] ?? [];
    list.forEach((ps, i) => {
      const key = `${side}:${i}`;
      if (M.plannedDone.has(key)) return;
      const at = ps.at === 'HT' || ps.at === 46 ? 'HT' : Number(ps.at);
      if (when === 'HT' ? at !== 'HT' : (at === 'HT' || !(M.minute >= at))) return;
      M.plannedDone.add(key);
      const r = substitute(M, side, ps.outId, ps.inId, 'zmiana zaplanowana przed meczem', { by: 'plan', why: 'planned' });
      if (!r.ok) emit(M, 'plannedSubSkipped', side, null, { outId: ps.outId, inId: ps.inId, error: r.error, text: `Zaplanowana zmiana niemożliwa: ${r.error}` });
    });
  }
}

// ------------------------------------------------------------ Rzuty karne (A6, IFAB Law 10)
const kickSkill = (x) => (x.p.attr?.WYK ?? 10) + (x.p.attr?.OPA ?? 10) + (x.p.attr?.SFR ?? 10);

/** Szansa gola w serii: strzelec (WYK, OPA, SFR) przeciw bramkarzowi (REF, JNJ); nagła śmierć: opanowanie. */
function kickProb(x, G, suddenDeath) {
  const skill = ((x.p.attr?.WYK ?? 10) + (x.p.attr?.OPA ?? 10) + (x.p.attr?.SFR ?? 10)) / 3;
  const keep = G ? ((G.p.attr?.REF ?? 4) + (G.p.attr?.JNJ ?? 4)) / 2 : 3;
  const pressure = suddenDeath ? 0.02 * ((x.p.attr?.OPA ?? 10) - 10) : 0;
  return clamp(0.72 * Math.exp(0.03 * (skill - keep)) + pressure, 0.4, 0.95);
}

/** Bramkarz drużyny w serii: wybrany przez trenera (T.shootoutKeeperId, każdy uprawniony) albo ten, który stoi w bramce. */
function shootoutKeeper(T) {
  const chosen = T.shootoutKeeperId != null ? fieldPlayers(T).find((x) => x.id === T.shootoutKeeperId) : null;
  return chosen ?? goalkeeper(T);
}

/**
 * Kolejność strzelających po wyrównaniu liczebności do n. Najpierw zawodnicy z listy trenera (T.shootoutOrder, tylko
 * uprawnieni), potem pozostali wg umiejętności, bramkarz na końcu. Bramkarz serii zawsze strzela: gdy nie mieści się
 * w pierwszych n, wypada ostatni zawodnik z pola. Bez listy trenera: dokładnie dawna kolejność automatyczna.
 */
function takersOrder(T, n, order = T.shootoutOrder) {
  const elig = fieldPlayers(T);
  let gk = shootoutKeeper(T);
  const auto = elig.filter((x) => x !== gk).sort((a, b) => kickSkill(b) - kickSkill(a)).concat(gk ? [gk] : []);
  if (!gk) gk = auto[auto.length - 1];
  const byId = new Map(elig.map((x) => [x.id, x]));
  const chosen = [];
  for (const id of order ?? []) { const x = byId.get(id); if (x && !chosen.includes(x)) chosen.push(x); }
  const full = chosen.concat(auto.filter((x) => !chosen.includes(x)));
  if (full.indexOf(gk) < n) return full.slice(0, n);
  return full.filter((x) => x !== gk).slice(0, n - 1).concat(gk);
}

const shootoutSize = (M) => Math.min(fieldPlayers(M.teams[0]).length, fieldPlayers(M.teams[1]).length);

function shootout(M) {
  // Uprawnieni: zawodnicy na boisku na koniec meczu (dogrywki), także chwilowo opatrywani (Law 10). Wyrównanie
  // liczebności, potem kolejność trenera albo automatyczna (wg umiejętności, bramkarz na końcu).
  const n = shootoutSize(M);
  const takers = M.teams.map((T) => takersOrder(T, n));
  const keepers = M.teams.map((T) => shootoutKeeper(T));
  const goals = [0, 0];
  const kicks = [];
  let round = 0;
  const kick = (side) => {
    const G = keepers[1 - side];
    const x = takers[side][round % n];
    const p = kickProb(x, G, round >= 5);
    const scored = M.rng.next() < p;
    if (scored) goals[side]++;
    const outcome = scored ? 'goal' : G && M.rng.next() < 0.65 ? 'saved' : 'missed';
    kicks.push({ side, pid: x.id, scored, outcome, gkId: G?.id ?? null, round: round + 1, suddenDeath: round >= 5 });
    const how = scored ? 'gol' : outcome === 'saved' ? `obronił ${G.p.last ?? G.p.name}` : 'pudło';
    emit(M, 'shootoutKick', side, x, { scored, outcome, gkId: G?.id ?? null, round: round + 1, suddenDeath: round >= 5, text: `${x.p.last ?? x.p.name}: ${how} (${goals[0]}:${goals[1]}).` });
  };
  // 5 serii ABAB z wcześniejszym rozstrzygnięciem, potem nagła śmierć
  for (round = 0; round < 5; round++) {
    kick(0);
    if (goals[0] > goals[1] + (5 - round)) break;
    if (goals[1] > goals[0] + (5 - round - 1)) break;
    kick(1);
    if (goals[0] > goals[1] + (5 - round - 1) || goals[1] > goals[0] + (5 - round - 1)) break;
  }
  if (goals[0] === goals[1]) {
    for (round = 5; round < 60; round++) {
      kick(0); kick(1);
      if (goals[0] !== goals[1]) break;
    }
  }
  M.shootout = {
    goals, kicks, suddenDeath: kicks.length > 10,
    order: takers.map((t) => t.map((x) => x.id)), keepers: keepers.map((G) => G?.id ?? null),
    custom: M.teams.map((T) => !!(T.shootoutOrder || T.shootoutKeeperId != null)),
  };
}

/** Czy w tym meczu może dojść do serii i czy jeszcze się nie odbyła; komunikat błędu albo null. */
function shootoutOpen(M) {
  if (M.rules.decider === 'none') return 'W tym meczu nie ma serii rzutów karnych.';
  if (M.shootout) return 'Seria rzutów karnych już się odbyła.';
  if (M.ended) return 'Mecz się zakończył.';
  return null;
}

/**
 * Kandydaci do serii rzutów karnych (UI: okno kolejności, także przed końcem dogrywki). Nic nie zmienia.
 * Zwraca { available, error, n (strzelających po wyrównaniu liczebności przy obecnych składach), excluded
 * (ilu zawodników z pola wypadnie), keeperId (bramkarz serii), order (lista trenera albo null), suggested (kolejność
 * automatyczna, ids n strzelających, to samo co silnik zrobi bez wyboru), final (kolejność z obecnymi ustawieniami),
 * players: [{ id, name, last, pos, natPos, keeper, kick (umiejętność 1-20: średnia WYK, OPA, SFR), opa, pct (szansa
 * gola w %, przeciw bramkarzowi rywala), cond, knock, treated, autoRank (miejsce w kolejności automatycznej od 1, null:
 * wypadłby przy wyrównaniu) }] w kolejności automatycznej }.
 */
export function shootoutCandidates(M, side) {
  const T = M.teams[side]; const O = M.teams[1 - side];
  const err = shootoutOpen(M);
  const n = shootoutSize(M);
  const gk = shootoutKeeper(T); const oppGk = shootoutKeeper(O);
  const suggested = takersOrder(T, n, null);
  const final = takersOrder(T, n);
  const elig = fieldPlayers(T);
  const auto = elig.filter((x) => x !== gk).sort((a, b) => kickSkill(b) - kickSkill(a)).concat(gk ? [gk] : []);
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    available: !err, error: err, n, excluded: elig.length - n, keeperId: gk?.id ?? null,
    order: T.shootoutOrder ? [...T.shootoutOrder] : null,
    suggested: suggested.map((x) => x.id), final: final.map((x) => x.id),
    players: auto.map((x) => ({
      id: x.id, name: x.p.name, last: x.p.last ?? x.p.name, pos: x.slot?.pos ?? x.p.pos, natPos: x.p.pos, keeper: x === gk,
      kick: r1(kickSkill(x) / 3), opa: x.p.attr?.OPA ?? 10, pct: Math.round(100 * kickProb(x, oppGk, false)),
      cond: Math.round(x.cond), knock: !!(x.knock && !x.knock.aggravated), treated: x.treatedUntil >= M.minute,
      autoRank: suggested.includes(x) ? suggested.indexOf(x) + 1 : null,
    })),
  };
}

/**
 * Kolejność strzelających w serii (gracz albo AI), przed końcem meczu albo w pauzie 'shootoutPrep'.
 * ids: lista id zawodników z boiska w kolejności strzałów (może być krótsza: resztę uzupełnia kolejność automatyczna;
 * zawodnicy spoza pierwszych n wypadają przy wyrównaniu liczebności), null: powrót do kolejności automatycznej.
 * opts.keeperId: zawodnik z boiska, który stanie w bramce w serii (Law 10: każdy uprawniony może zamienić się
 * z bramkarzem), null: bramkarz z boiska. Lista sprawdzana teraz i ponownie na starcie serii (zawodnik zmieniony
 * albo wykluczony po ustawieniu kolejności wypada z listy).
 * Zwraca { ok: true, final: [ids], excluded: [ids] } albo { ok: false, error } (nic się nie zmienia).
 */
export function setShootoutOrder(M, side, ids, opts = {}) {
  const T = M.teams[side];
  const err = shootoutOpen(M);
  if (err) return { ok: false, error: err };
  const elig = new Set(fieldPlayers(T).map((x) => x.id));
  if (ids != null) {
    if (!Array.isArray(ids)) return { ok: false, error: 'Podaj listę zawodników w kolejności strzałów.' };
    const seen = new Set();
    for (const id of ids) {
      if (!elig.has(id)) return { ok: false, error: 'Strzelać mogą tylko zawodnicy, którzy są na boisku (rezerwowi i zmienieni nie strzelają).' };
      if (seen.has(id)) return { ok: false, error: 'Ten sam zawodnik dwa razy na liście: każdy strzela raz, zanim ktokolwiek strzeli drugi raz.' };
      seen.add(id);
    }
  }
  if (opts.keeperId != null && !elig.has(opts.keeperId)) return { ok: false, error: 'W bramce w serii może stanąć tylko zawodnik z boiska.' };
  T.shootoutOrder = ids == null ? null : [...ids];
  if ('keeperId' in opts) T.shootoutKeeperId = opts.keeperId ?? null;
  const n = shootoutSize(M);
  const final = takersOrder(T, n).map((x) => x.id);
  return { ok: true, final, excluded: [...elig].filter((id) => !final.includes(id)) };
}

// ------------------------------------------------------------ Koniec i oceny
/** Zwycięzca (strona) według bieżącego wyniku, po serii karnych według serii; null przy remisie. */
function leader(M) {
  if (M.score[0] !== M.score[1]) return M.score[0] > M.score[1] ? 0 : 1;
  return M.shootout ? (M.shootout.goals[0] > M.shootout.goals[1] ? 0 : 1) : null;
}

/** Minuty zawodnika do minuty `end` (wykluczony gra do końca w statystyce minut, jak w ocenach). */
const minutesOf = (x, end) => (x.prevMins ?? 0) + (x.minOff ?? end) - x.minOn;

/** Ocena bez szumu: ta sama skala i te same składniki co ocena końcowa (6.1 d). */
function ratingNoNoise(x, T, M, end, winner) {
  const mins = minutesOf(x, end);
  let ev = x.ev;
  if (M.score[1 - T.side] === 0 && mins >= 60) ev += RATING.cleanSheet[x.slot?.pos] ?? 0;
  if (winner !== null) ev += winner === T.side ? RATING.win : RATING.loss;
  return { ev, mins };
}

/**
 * Oceny na żywo { [idZawodnika]: ocena 3.0-10.0 } dla wszystkich, którzy weszli na boisko (obie drużyny).
 * Skala i składniki jak w result(): zdarzenia, czyste konto od 60 min, premia za bieżące prowadzenie, krótki
 * występ (< 20 min) x0,6. Bez losowego szumu (result() dodaje N(0, 0,2)), bez zużycia RNG, koszt O(liczba zawodników):
 * można wołać po każdej minucie.
 */
export function liveRatings(M) {
  const out = {};
  const winner = leader(M);
  for (const T of M.teams) {
    for (const x of withBench(T)) {
      if (x.minOn === null) continue;
      const { ev, mins } = ratingNoNoise(x, T, M, M.minute, winner);
      out[x.id] = Math.round(clamp(mins < 20 ? 6 + 0.6 * ev : 6 + ev, 3, 10) * 10) / 10;
    }
  }
  return out;
}

/** Wszyscy, którzy mogli zagrać: na boisku i zmienieni, potem ławka (przy zmianach rotacyjnych także z minutami). */
const withBench = (T) => (T.bench.some((x) => x.minOn !== null) ? [...T.players, ...T.bench] : T.players);

/** Podsumowanie lekkiego urazu zawodnika do minuty `end` (minuty gry z bólem). */
function knockInfo(x, end) {
  const k = x.knock;
  if (!k) return null;
  const from = Math.max(k.since, x.minOn ?? k.since);
  const to = k.aggravatedAt ?? x.minOff ?? end;
  return { name: k.name, type: k.type, since: k.since, pre: k.pre, aggravated: k.aggravated, aggravatedAt: k.aggravatedAt, minutes: x.minOn === null ? 0 : Math.max(0, to - from) };
}

/**
 * Uraz po meczu: lekki uraz grany z bólem wydłuża przerwę o KNOCK.types[typ].ext dni za każde pełne 30 min
 * (najwyżej KNOCK.maxDays). Uraz sprzed meczu bez pogłębienia: nowy wpis tylko wtedy, gdy przerwa się wydłuża.
 */
function injuryAfter(x, end) {
  const k = x.knock;
  if (!k || k.aggravated || (x.injury && !x.injury.playable)) return x.injury;
  const info = knockInfo(x, end);
  const ext = (KNOCK.types[k.type]?.ext ?? 0) * Math.floor(info.minutes / 30);
  if (!k.pre) return { ...x.injury, days: Math.min(KNOCK.maxDays, Math.max(x.injury.days, x.injury.days + ext)) };
  if (!ext || info.minutes === 0) return null;
  return { cat: 'light', name: k.name, days: Math.min(KNOCK.maxDays, k.days + ext), playable: true, pre: true };
}

/** Kartka zawodnika dla UI: null | 'yellow' | 'secondYellow' | 'red'. */
function cardOf(x) {
  if (x.sentOff) return x.redCode === 'second' ? 'secondYellow' : 'red';
  return x.yc ? 'yellow' : null;
}

/**
 * Stan zawodników drużyny dla UI meczu (boisko, ławka, zmienieni), tani do wołania co minutę.
 * Każdy wpis: { id, name, pos (rola na slocie albo pozycja naturalna), slotIdx (indeks slotu formacji, -1 poza boiskiem),
 * x, y (współrzędne slotu), on (gra teraz, także opatrywany), treated, bench, subbedOff, sentOff,
 * card: null|'yellow'|'secondYellow'|'red', yc: 0|1, rc: 0|1, knock: null | { name, type, since, pre, minutes }
 * (biały krzyżyk: knock !== null i on), injured: uraz bez możliwości gry, cond, rating (liveRatings) }.
 */
export function playerStates(M, side) {
  const T = M.teams[side];
  const rt = liveRatings(M);
  const row = (x, bench) => {
    const on = !!x.on && !x.sentOff && !x.subbedOff;
    const k = x.knock && !x.knock.aggravated ? knockInfo(x, M.minute) : null;
    return {
      id: x.id, name: x.p.name, pos: (on ? x.slot?.pos : null) ?? x.p.pos, slotIdx: on ? slotIndex(T, x) : -1,
      x: on ? x.slot?.x ?? null : null, y: on ? x.slot?.y ?? null : null,
      on, treated: on && x.treatedUntil >= M.minute, bench, subbedOff: !!x.subbedOff, sentOff: !!x.sentOff,
      card: cardOf(x), yc: x.yc ? 1 : 0, rc: x.sentOff ? 1 : 0,
      knock: k, injured: !!x.injury && !x.injury.playable, cond: Math.round(x.cond), rating: rt[x.id] ?? null,
      minutes: x.minOn === null ? 0 : Math.max(0, minutesOf(x, M.minute)), rolledOff: x.rolledOff ?? 0,
    };
  };
  return [...T.players.map((x) => row(x, false)), ...T.bench.map((x) => row(x, true))];
}

/**
 * Podgląd ustawienia przed zmianą (gracz w oknie „Zmiany i taktyka”, także w osłabieniu): formationId,
 * opts { assign: { [id]: indeksSlotu }, empty: [indeksSlotu] }. Zwraca { ok, error?, assign, empty, shape,
 * need (ile miejsc musi zostać pustych), slots: [{ i, pos, side, x, y, playerId|null }] }. Nic nie zmienia.
 */
export function previewShape(M, side, formationId, opts = {}) {
  const T = M.teams[side];
  const need = 11 - fieldPlayers(T).length;
  const r = planShape(T, formationId, opts);
  if (!r.ok) return { ok: false, error: r.error, need };
  const who = new Map([...r.at].map(([x, i]) => [i, x.id]));
  return {
    ok: true, assign: r.assign, empty: r.empty, shape: r.shape, need,
    slots: r.formation.slots.map((s, i) => ({ i, pos: s.pos, side: s.side, x: s.x, y: s.y, playerId: who.get(i) ?? null })),
  };
}

/** Sprawdzenie zmiany taktyki bez wykonywania: komunikat błędu albo null. */
export function checkTacticPatch(M, side, patch) {
  return validateTacticPatch(M.teams[side], patch);
}

function finish(M) {
  M.ended = true;
  M.phase = 'ended';
  emit(M, 'end', null, null, { text: `Koniec meczu. ${M.score[0]}:${M.score[1]}${M.shootout ? `, karne ${M.shootout.goals[0]}:${M.shootout.goals[1]}` : ''}.` });
}

/** Wynik meczu: wszystko liczone z dziennika zdarzeń i stanu zawodników. */
export function result(M) {
  const stats = statsFromEvents(M.events);
  const end = M.minute;
  const winner = leader(M);
  const ratings = [];
  for (const T of M.teams) {
    for (const x of withBench(T)) {
      if (x.minOn === null) continue;
      const r0 = ratingNoNoise(x, T, M, end, winner);
      const mins = r0.mins;
      let ev = r0.ev;
      ev += M.rng.gauss(0, RATING.noise);
      const rating = mins < 20 ? 6 + 0.6 * ev : 6 + ev;
      ratings.push({
        id: x.id, side: T.side, name: x.p.name, pos: x.slot?.pos ?? x.p.pos, minutes: Math.max(0, mins),
        rating: Math.round(clamp(rating, 3, 10) * 10) / 10, g: x.g, a: x.ast, sh: x.sh, sot: x.sot, kp: x.kp, tk: x.tk,
        saves: x.saves, fouls: x.fouls, yc: x.yc, rc: x.sentOff ? 1 : 0, cond: Math.round(x.cond), injury: injuryAfter(x, end), Z: Math.round(x.Z * 10) / 10,
        knock: knockInfo(x, end), card: cardOf(x),
      });
    }
  }
  const sorted = ratings.slice().sort((a, b) => b.rating - a.rating || (b.side === winner) - (a.side === winner));
  return {
    score: [...M.score],
    halfTimeScore: M.halfTimeScore,
    extraTime: M.extraTime,
    shootout: M.shootout ? { goals: [...M.shootout.goals], kicks: M.shootout.kicks, order: M.shootout.order, keepers: M.shootout.keepers } : null,
    winner,
    abandoned: M.abandoned ? { ...M.abandoned } : null,
    addedTimes: M.addedTimes,
    stats,
    ratings,
    motm: sorted[0]?.id ?? null,
    injuries: ratings.filter((r) => r.injury).map((r) => ({ id: r.id, side: r.side, ...r.injury })),
    cards: M.events.filter((e) => e.type === 'yellow' || e.type === 'red').map((e) => ({ id: e.pid, side: e.side, type: e.type, min: e.min })),
    momentum: M.momentum,
    events: M.events.filter((e) => !['pass', 'passFail', 'possessionMinute', 'throwIn', 'goalKick', 'freeKick'].includes(e.type)),
  };
}
