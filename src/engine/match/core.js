// Pełny silnik meczowy minuta po minucie (docs/ekspert_futbol.md 6.1, PLAN 3, 3.1, 3.2, 4.1, 4.2).
// Każda minuta to lista faz (PHASES). Każde zdarzenie trafia do dziennika (M.events);
// wynik, statystyki, oceny, relacja i momentum liczą się tylko z dziennika.

import { Rng, clamp } from '../../core/rng.js';
import { K, SHOOT_W, FOUL_W, INJURY_TYPES, RED_REASONS, KNOCK, FATIGUE } from './constants.js';
import { buildTeam, updateZones, updateCondition, onPitch, goalkeeper, fieldPlayers, slotFit, makeKnock, errFactor } from './teams.js';
import { matchRules, unlimitedSubs, UNLIMITED } from './rules.js';

// Haki trenera (src/engine/match/coach.js rejestruje się przy imporcie). Silnik nie zna AI,
// ale gdy drużyna prowadzona przez AI lub asystenta traci bramkarza, trener decyduje od razu.
const HOOKS = {};
export function setCoachHooks(h) { Object.assign(HOOKS, h); }

const sig = (x) => 1 / (1 + Math.exp(-x));
const attr = (x, k) => x.p.attr?.[k] ?? x.p.ovr ?? 10;
const last = (x) => x.p.last ?? x.p.name;

// ------------------------------------------------------------ Tworzenie meczu
/**
 * cfg: { seed, home: {club, squad, tactics, ai, coach, zStart}, away: {...},
 *        ctx: { neutral, rank 0-3, var, weather: {conv, foul, fat, inj, name}, refStrict, attendance 0-1,
 *               knockout: false | 'single' | 'penaltiesOnly' | { firstLeg: [g dla obecnego gospodarza, g dla gościa] },
 *               friendly, friendlyRules: { decider, subs, rotation, period, plannedSubs } (sparing, rules.js),
 *               shootoutPrep: true = pauza przed serią rzutów karnych (faza 'shootoutPrep', UI pyta o kolejność) } }
 * M.rules: zasady meczu z matchRules(ctx) (rozstrzygnięcie remisu, reguła zmian).
 */
export function createMatch(cfg) {
  const ctx = { neutral: false, rank: 0, var: true, refStrict: 1, attendance: 0.8, knockout: false, weather: {}, ...cfg.ctx };
  const rng = new Rng(cfg.seed ?? 'mecz');
  const M = {
    ctx, rng, tick: 0, half: 1, phase: 'play', minute: 0, elapsed: 0, length: 45, added: null,
    score: [0, 0], events: [], momentum: [], possession: [], halfTimeScore: null,
    halfCounts: freshCounts(), addedTimes: [], extraTime: false, shootout: null, ended: false,
    ai: 0, emptyNet: false, addedExtra: 0, abandoned: null,
    hfa: ctx.neutral ? 0 : 0.7 + 0.3 * ctx.attendance,
    rules: matchRules(ctx),
  };
  M.teams = [buildTeam(0, cfg.home, rng, ctx), buildTeam(1, cfg.away, rng, ctx)];
  if (unlimitedSubs(M)) for (const T of M.teams) { T.subsLimit = UNLIMITED; T.windowsLimit = UNLIMITED; }
  for (const T of M.teams) {
    updateZones(T, M); ensureGoalkeeper(M, T);
    T.str0 = (T.zones.ATT + T.zones.MID + T.zones.DEF) / 3 + 0.15 * T.zones.GK;
    T.baseInstr = { ...T.tactics.instructions };
    T.plannedSubs = rng.weighted([3, 4, 5], (n) => ({ 3: 0.25, 4: 0.4, 5: 0.35 })[n]);
  }
  for (const T of M.teams) T.strDiff = T.str0 - M.teams[1 - T.side].str0 + (ctx.neutral ? 0 : T.side === 0 ? 0.3 : -0.3);
  emit(M, 'kickoff', null, null, { text: 'Sędzia rozpoczyna mecz.' });
  return M;
}

function freshCounts() { return { goals: 0, windows: 0, injuries: 0, var: 0, cards: 0, tw: 0 }; }

// ------------------------------------------------------------ Dziennik zdarzeń
export function minuteLabel(M) {
  const base = { 1: 0, 2: 45, 3: 90, 4: 105 }[M.half];
  if (M.elapsed > M.length) return `${base + M.length}+${M.elapsed - M.length}'`;
  return `${base + M.elapsed}'`;
}

export function emit(M, type, side, x, data = {}) {
  const e = { t: M.tick, half: M.half, min: minuteLabel(M), type, side, pid: x?.id ?? null, ...data };
  M.events.push(e);
  return e;
}

// ------------------------------------------------------------ Pomocnicze
function pickWeighted(M, list, w) { return M.rng.weighted(list, w); }
const centralMid = new Set(['DP', 'ŚP', 'OP']);

function gameState(M, side) {
  if (M.minute < K.gsFrom || M.score[0] === M.score[1]) return { act: 1, D: 0 };
  const leading = M.score[side] > M.score[1 - side];
  return leading ? { act: K.gsLeadAct, D: K.gsLeadD } : { act: K.gsTrailAct, D: K.gsTrailD };
}

function shoutMods(T, M) {
  return T.shout && M.minute < T.shout.until ? T.shout : {};
}

function rateEv(x, v) { if (x) x.ev += v; }

// ------------------------------------------------------------ Fazy minuty
function phaseTeams(M) {
  for (const T of M.teams) { updateCondition(T, M); updateZones(T, M); T.threat = 0; }
}

function phasePossession(M) {
  const [H, A] = M.teams;
  const logit = K.posK * (H.zones.MID - A.zones.MID) + K.posHome * M.hfa + H.P.pos - A.P.pos + A.P.oppPos - H.P.oppPos
    + 0.08 * (H.central - A.central);
  const pH = clamp(sig(logit), K.posClamp[0], K.posClamp[1]);
  emit(M, 'possessionMinute', null, null, { share: Math.round(pH * 1000) / 1000 });
  M.possession.push(pH);
  M.ai = M.rng.next() < pH ? 0 : 1;
  // Podania obu drużyn wg udziału w posiadaniu, stylu i presji rywala
  for (const T of M.teams) {
    const share = T.side === 0 ? pH : 1 - pH;
    const style = T.P.passing === 'short' ? 1.25 : T.P.passing === 'long' ? 0.8 : 1;
    const n = M.rng.poisson(K.passesPerMinute * share * style);
    if (!n) continue;
    const O = M.teams[1 - T.side];
    const acc = clamp(K.passAcc + 0.012 * (T.avg('POD') - 11) + 0.006 * (T.avg('TEC') - 11)
      + (T.P.passing === 'short' ? 0.03 : T.P.passing === 'long' ? -0.06 : 0) - (O.P.pressing === 'high' ? 0.03 : 0), 0.6, 0.93);
    let ok = 0;
    for (let i = 0; i < n; i++) if (M.rng.next() < acc) ok++;
    if (ok) emit(M, 'pass', T.side, null, { count: ok });
    if (n - ok) emit(M, 'passFail', T.side, null, { count: n - ok });
  }
}

function phaseOffside(M) {
  const at = M.teams[M.ai]; const df = M.teams[1 - M.ai];
  if (M.rng.next() < K.offsideTick * df.P.oppOffsideMul) offside(M, at);
}

function offside(M, at) {
  const xs = onPitch(at, M.minute).filter((x) => ['NAP', 'SN', 'OP', 'BP'].includes(x.slot.pos));
  const x = xs.length ? pickWeighted(M, xs, (y) => attr(y, 'RUC')) : null;
  if (x) { x.offs++; rateEv(x, -0.05); }
  emit(M, 'offside', at.side, x, { text: x ? `Spalony: ${last(x)}.` : 'Spalony.' });
  emit(M, 'freeKick', 1 - at.side, null);
}

function phaseFoul(M) {
  const ai = M.ai;
  const r = M.ctx.refStrict;
  const rankFoul = M.ctx.rank >= 2 ? 1.1 : 1;
  const tw = M.teams.map((T) => (T.P.timewasting && M.score[T.side] > M.score[1 - T.side]));
  const baseFoul = K.foulTick * (M.ctx.weather.foul ?? 1) * rankFoul * (1.1 - 0.1 * r);
  if (M.rng.next() < baseFoul * avgFoulMul(M) * tiredFoulRate(M)) {
    const fi = M.rng.next() < K.foulDefShare ? 1 - ai : ai;
    const ft = M.teams[fi];
    const xs = onPitch(ft, M.minute);
    const x = pickWeighted(M, xs, (y) => (FOUL_W[y.slot.pos] ?? 1) * (attr(y, 'AGR') / 10) * (y.yc ? K.bookedFoulMul : 1) * tiredFoul(y));
    x.fouls++;
    emit(M, 'foul', fi, x);
    emit(M, 'freeKick', 1 - fi, null);
    const sm = shoutMods(ft, M);
    const cm = (fi === 0 ? K.homeCardMul : K.awayCardMul) ** (M.hfa ? 1 : 0) * r * (0.7 + 0.03 * (x.p.hidden?.TMP ?? 10))
      * (M.ctx.rank >= 2 ? 1.15 : 1) * (M.minute > 80 ? 1.15 : 1) * (sm.yellowMul ?? 1) * (1 + 0.03 * Math.max(0, x.Z));
    let carded = false;
    if (M.rng.next() < K.redPerFoul * cm * Math.sqrt(r) * ft.P.redPerFoul * ft.P.redMul) {
      straightRed(M, ft, x, M.rng.weighted(['sfp', 'violent', 'dogso'], (k) => ({ sfp: 0.6, violent: 0.15, dogso: 0.25 })[k]));
      carded = true;
    } else if (M.rng.next() < K.yellowPerFoul * cm * ft.P.yellowPerFoul * (x.yc ? K.bookedYellowMul : 1)) {
      // VAR: rażący faul przeoczony przez sędziego (tylko przy żółtej, analiza przy monitorze)
      if (M.ctx.var && !x.yc && M.rng.next() < K.varRedAdd) {
        varReview(M, fi, x, 'redCard', 'Po analizie VAR sędzia zmienia żółtą kartkę na czerwoną.');
        sendOff(M, ft, x, 'sfp');
      } else card(M, ft, x);
      carded = true;
    }
    // Ofiara faulu: ryzyko kontuzji kontaktowej; po faulu z kartką opatrywany nie musi schodzić (Law 5)
    const victimTeam = M.teams[1 - fi];
    if (M.rng.next() < K.injContact * ft.P.oppInjuryMul) {
      const vs = onPitch(victimTeam, M.minute);
      if (vs.length) injure(M, victimTeam, M.rng.pick(vs), true, { cardedFoul: carded });
    }
    if (fi !== ai && M.rng.next() < K.dangerFK) { at(M).threat += 2; setPiece(M, ai); }
  }
  for (const T of M.teams) {
    if (M.rng.next() < K.otherYellowTick / 2 + (tw[T.side] ? T.P.yellowPerMin : 0)) {
      const xs = onPitch(T, M.minute);
      if (xs.length) {
        const x = M.rng.pick(xs);
        if (tw[T.side]) M.halfCounts.tw += 0.5;
        card(M, T, x, tw[T.side] ? 'gra na czas' : 'niesportowe zachowanie');
      }
    }
    // Rezerwowi i zmienieni zawodnicy też mogą dostać kartkę (Law 12); drużyna nie traci zawodnika na boisku
    if (M.rng.next() < K.benchCardTick) benchCard(M, T);
    // Trener i sztab (Law 5): częściej przy niekorzystnym wyniku pod koniec meczu
    const trailing = M.score[T.side] < M.score[1 - T.side] && M.minute >= 70;
    if (M.rng.next() < K.staffCardTick * (trailing ? 2 : 1)) staffCard(M, T);
  }
}

function benchCard(M, T) {
  const xs = [...T.bench, ...T.players.filter((y) => y.subbedOff)].filter((y) => !y.sentOff);
  if (!xs.length) return;
  const x = M.rng.pick(xs);
  const where = x.subbedOff ? 'zmieniony zawodnik' : 'rezerwowy';
  M.halfCounts.cards++;
  if (x.yc || M.rng.next() < K.benchRedShare) {
    x.sentOff = true;
    const second = !!x.yc;
    emit(M, 'red', T.side, x, { reason: second ? 'druga żółta' : 'przemoc', reasonCode: second ? 'second' : 'violent', reasonText: second ? 'druga żółta kartka' : 'niesportowe zachowanie poza boiskiem', second, bench: true, text: `Czerwona kartka: ${last(x)} (${where}, ${second ? 'druga żółta' : 'niesportowe zachowanie'}). Drużyna nadal gra w ${fieldPlayers(T).length}.` });
    return;
  }
  x.yc = 1;
  emit(M, 'yellow', T.side, x, { bench: true, reason: 'protest z ławki', text: `Żółta kartka: ${last(x)} (${where}, protest).` });
}

function staffCard(M, T) {
  if (T.coachBanned) return;
  const red = (T.staffYellow && M.rng.next() < 0.3) || M.rng.next() < K.staffRedShare;
  if (red) {
    T.coachBanned = true;
    emit(M, 'staffCard', T.side, null, { card: 'red', text: 'Trener odesłany na trybuny. Drużynę prowadzi asystent, okrzyki z linii bocznej niemożliwe.' });
  } else {
    T.staffYellow = (T.staffYellow ?? 0) + 1;
    emit(M, 'staffCard', T.side, null, { card: 'yellow', text: 'Żółta kartka dla trenera za protesty.' });
  }
}

const at = (M) => M.teams[M.ai];
function avgFoulMul(M) { return (M.teams[0].P.foulMul + M.teams[1].P.foulMul) / 2 * ((shoutMods(M.teams[0], M).foulMul ?? 1) + (shoutMods(M.teams[1], M).foulMul ?? 1)) / 2; }

/** Widoczna analiza VAR zakończona zmianą decyzji (decision: kod dla studia, src/match/studio.js). */
function varReview(M, side, x, decision, text, extra = {}) {
  M.halfCounts.var++;
  emit(M, 'varCheck', side, x, { decision, text: 'VAR sprawdza sytuację, sędzia podchodzi do monitora.', pause: 2 });
  return emit(M, 'varOverturn', side, x, { decision, text, ...extra });
}

export function card(M, T, x, reason = 'faul') {
  M.halfCounts.cards++;
  if (x.yc) {
    // IFAB 2026/27: VAR może cofnąć ewidentnie błędną drugą żółtą
    if (M.ctx.var && M.rng.next() < K.varSecondYellowCancel) {
      varReview(M, T.side, x, 'secondYellowCancelled', `VAR cofa drugą żółtą kartkę dla ${last(x)}: błąd sędziego.`);
      return;
    }
    sendOff(M, T, x, 'second', reason);
    return;
  }
  x.yc = 1;
  rateEv(x, -0.3);
  emit(M, 'yellow', T.side, x, { reason, gk: x.slot?.pos === 'BR', text: `Żółta kartka: ${last(x)} (${reason}).` });
}

/** Bezpośrednia czerwona po faulu, z możliwą korektą VAR na żółtą. */
function straightRed(M, T, x, code) {
  if (M.ctx.var && M.rng.next() < K.varRedCancel) {
    varReview(M, T.side, x, 'redCancelled', `VAR: czerwona kartka dla ${last(x)} zamieniona na żółtą.`);
    card(M, T, x, 'faul, kartka zmieniona po VAR');
    return;
  }
  sendOff(M, T, x, code);
  if (M.ctx.var && M.rng.next() < K.varRedCheck) {
    M.halfCounts.var += 0.5;
    emit(M, 'varCheck', T.side, x, { decision: 'redCheck', text: `VAR sprawdza czerwoną kartkę dla ${last(x)}.`, pause: 2 });
    emit(M, 'varCheck', T.side, x, { confirmed: true, decision: 'redConfirmed', text: 'Po analizie VAR: czerwona kartka utrzymana.' });
  }
}

/**
 * Wykluczenie zawodnika. code: second | dogso | handball | sfp | violent (RED_REASONS).
 * Zdarzenie 'red': { reason (kod studia: długość kary), reasonCode, reasonText, second, gk, playersLeft }.
 */
export function sendOff(M, T, x, code = 'sfp', detail = '') {
  M.halfCounts.cards++;
  const wasGk = x.on && x.slot?.pos === 'BR';
  x.sentOff = true;
  x.redCode = code;
  rateEv(x, -1.5);
  const [reason, reasonText] = RED_REASONS[code] ?? RED_REASONS.sfp;
  const left = fieldPlayers(T).length;
  const why = code === 'second' ? `druga żółta kartka${detail ? `, ${detail}` : ''}` : reasonText;
  emit(M, 'red', T.side, x, {
    reason, reasonCode: code, reasonText: why, second: code === 'second', gk: wasGk, playersLeft: left,
    text: `Czerwona kartka: ${last(x)} (${why}).${wasGk ? ' Drużyna bez bramkarza!' : ''}`,
  });
  // Reakcja drużyny: lider tłumi, bez lidera spadek zaangażowania
  const leader = onPitch(T, M.minute).some((y) => y.p.persona === 'Lider');
  for (const y of onPitch(T, M.minute)) y.Z += leader ? 2 : -1;
  // Trenerzy obu drużyn reagują jeszcze w tej samej przerwie w grze (coach.js)
  T.react.push({ kind: 'ownRed', tick: M.tick, pos: x.slot?.pos ?? null, gk: wasGk });
  M.teams[1 - T.side].react.push({ kind: 'oppRed', tick: M.tick });
  if (wasGk) goalkeeperLost(M, T, 'red');
  checkMinPlayers(M, T);
}

/** Drużyna straciła bramkarza (czerwona, kontuzja): AI zmienia od razu, w innym razie zawodnik z pola do bramki. */
function goalkeeperLost(M, T, cause) {
  if (goalkeeper(T)) return;
  if (T.ai && HOOKS.onGoalkeeperLost && HOOKS.onGoalkeeperLost(M, T, cause)) return;
  ensureGoalkeeper(M, T, cause);
}

/**
 * Najlepszy kandydat do bramki z pola: atrybuty bramkarskie, skoczność i opanowanie, z karą za wartość
 * zawodnika w polu (najlepszy zawodnik z pola idzie do bramki tylko wtedy, gdy nie ma innego wyjścia).
 */
export function emergencyKeeper(T, xs = fieldPlayers(T).filter((y) => y.slot?.pos !== 'BR')) {
  if (!xs.length) return null;
  const val = (y) => (y.slot ? slotFit(y, y.slot) : y.p.ovr ?? 10);
  const best = xs.length > 1 ? xs.reduce((b, y) => (val(y) > val(b) ? y : b)) : null;
  const score = (y) => y.R.GK + 0.15 * attr(y, 'SKO') + 0.1 * attr(y, 'OPA') - 0.25 * val(y) - (y === best ? 100 : 0) - (y.injury ? 2 : 0);
  return xs.reduce((b, y) => (score(y) > score(b) ? y : b));
}

/** Bez bramkarza na boisku do bramki idzie zawodnik z pola (emergencyKeeper). */
export function ensureGoalkeeper(M, T, cause = null) {
  if (goalkeeper(T)) return null;
  const x = emergencyKeeper(T);
  if (!x) return null;
  x.prevSlot = x.slot;
  x.slot = { pos: 'BR', side: null, x: 50, y: 5 };
  emit(M, 'gkSwitch', T.side, x, {
    emergency: true, cause, fromPos: x.prevSlot?.pos ?? null,
    text: `${last(x)} staje w bramce${cause === 'red' ? ' po czerwonej kartce bramkarza' : cause === 'injury' ? ' po kontuzji bramkarza' : ''}.`,
  });
  return x;
}

/** Poniżej 7 zawodników mecz zostaje przerwany (Law 3); skutek regulaminowy ustala organizator. */
function checkMinPlayers(M, T) {
  if (M.abandoned || fieldPlayers(T).length >= K.minPlayers) return;
  M.abandoned = { side: T.side, minute: M.minute };
  emit(M, 'abandoned', T.side, null, { text: `Mecz przerwany: drużyna ma mniej niż ${K.minPlayers} zawodników.` });
}

function phaseAction(M) {
  const ai = M.ai; const A = M.teams[ai]; const D = M.teams[1 - ai];
  const gsA = gameState(M, ai); const gsD = gameState(M, 1 - ai);
  const smA = shoutMods(A, M); const smD = shoutMods(D, M);
  // Obrona broniącej drużyny: instrukcje (nastawienie, agresja), stan meczu od 65', okrzyk
  const dD = D.P.D + gsD.D + (smD.D ?? 0);
  const delta = (0.55 * A.zones.ATT + 0.45 * A.zones.MID) - (0.65 * D.zones.DEF + 0.35 * D.zones.MID) - dD + paceTerm(M, ai, A, D);
  const mom = momentumAvg(M, ai);
  const pAct = K.pAction * (M.hfa ? (ai === 0 ? K.homeCreate : K.awayCreate) ** M.hfa : 1) * A.P.pActMul * D.P.oppPActMul
    * gsA.act * (smA.actMul ?? 1) * (1 + K.lateRamp * Math.max(0, M.minute - 55)) * Math.exp(K.kCreate * delta)
    * (1 + K.momentumAct * mom) * (M.ctx.weather.act ?? 1);
  if (M.rng.next() >= pAct) return;
  A.threat += 1;
  const type = pickType(M, A, D);
  // Rzut karny
  // Karny podyktowany przez sędziego zostaje (VAR sprawdza tylko sytuacje, w których sędzia nie gwizdał)
  if (M.rng.next() < K.penPerAction * D.P.penMul * (0.85 + 0.15 * M.ctx.refStrict) * dribblePen(A)) {
    awardPenalty(M, ai);
    return;
  }
  const brk = K.brkBase[type] + K.kBreak * delta + A.P.brk + counterBonus(M, A, D, type);
  if (M.rng.next() < sig(brk)) {
    if (type === 'KON' && tacticalFoul(M, A, D)) return;
    A.threat += 3;
    const header = type === 'SKR' && M.rng.next() < 0.45;
    shot(M, ai, drawXg(M, K.xg[type]) * (type === 'DYS' ? (M.ctx.weather.dys ?? 1) : 1), type, header);
  } else if (M.rng.next() < K.failCorner[type]) {
    corner(M, ai);
  } else if (M.rng.next() < K.failOffside[type]) {
    offside(M, A);
  } else {
    if (defError(M, ai, A, D)) return;
    const xs = onPitch(D, M.minute).filter((y) => y.slot.pos !== 'BR');
    const x = pickWeighted(M, xs, (y) => attr(y, 'ODB') + attr(y, 'UST'));
    x.tk++; rateEv(x, 0.08);
    const kind = type === 'SKR' && M.rng.next() < 0.5 ? 'clearance' : M.rng.next() < 0.55 ? 'tackle' : 'interception';
    emit(M, kind, 1 - ai, x);
    // Sytuacja w polu karnym bez gwizdka (faul albo ręka): zawodnicy protestują, sędzia gra dalej
    // albo VAR analizuje i dyktuje karnego lub potwierdza, że przewinienia nie było
    if (type !== 'DYS' && M.rng.next() < K.penClaim) {
      const fouled = pickWeighted(M, onPitch(A, M.minute), (y) => SHOOT_W[y.slot.pos] ?? 1);
      const hand = M.rng.next() < 0.4;
      emit(M, 'penaltyClaim', ai, fouled, { hand, culpritId: x.id, text: `Protest w polu karnym: ${hand ? `zagranie ręką (${last(x)})?` : `faul na ${last(fouled)}?`} Sędzia nie przerywa gry.` });
      if (M.ctx.var && M.rng.next() < K.penClaimReview) {
        M.halfCounts.var++;
        emit(M, 'varCheck', ai, fouled, { decision: hand ? 'handCheck' : 'penaltyCheck', text: `VAR analizuje sytuację w polu karnym: ${hand ? 'zagranie ręką' : 'faul'}.`, pause: 2 });
        if (M.rng.next() < K.penClaimAward) {
          emit(M, 'varOverturn', ai, fouled, { decision: 'penaltyAwarded', text: `Po analizie VAR sędzia dyktuje rzut karny${hand ? ' za zagranie ręką' : ''}.` });
          awardPenalty(M, ai, { culprit: x, fouled, byVar: true, hand });
          return;
        }
        emit(M, 'varCheck', ai, fouled, { confirmed: true, decision: 'noPenalty', text: 'Po analizie VAR: przewinienia nie było, gra toczy się dalej.' });
      }
    }
    if (M.rng.next() < K.goalKickOnFail) emit(M, 'goalKick', 1 - ai, null);
  }
}

/** Rzut karny: faul obrońcy (czasem z kartką), wykonanie (z powtórką i dobitką). */
function awardPenalty(M, ai, { culprit = null, fouled = null, byVar = false, hand = false } = {}) {
  const A = M.teams[ai]; const D = M.teams[1 - ai];
  const fouler = culprit ?? pickWeighted(M, onPitch(D, M.minute).filter((y) => y.slot.pos !== 'BR'), (y) => FOUL_W[y.slot.pos] ?? 1);
  const victim = fouled ?? pickWeighted(M, onPitch(A, M.minute), (y) => SHOOT_W[y.slot.pos] ?? 1);
  rateEv(fouler, -0.6); rateEv(victim, 0.3);
  fouler.fouls++;
  emit(M, 'foul', 1 - ai, fouler);
  emit(M, 'penalty', ai, victim, { byVar, hand, foulerId: fouler.id, pause: 3, text: hand ? `Rzut karny! Zagranie ręką: ${last(fouler)}.` : `Rzut karny! Faul: ${last(fouler)}, poszkodowany: ${last(victim)}.` });
  if (M.rng.next() < 0.1 * M.ctx.refStrict) card(M, D, fouler, 'faul w polu karnym');
  penaltyKick(M, ai);
}

/**
 * Faul taktyczny przy groźnej kontrze (przerwanie korzystnego ataku, Law 12: żółta; ostatni obrońca: czerwona).
 * Te same reguły dla obu drużyn: częściej przy twardej grze i przy prowadzeniu pod koniec, rzadko przez ukaranych.
 */
function tacticalFoul(M, A, D) {
  const xs = onPitch(D, M.minute).filter((y) => ['ŚO', 'DP', 'ŚP', 'BO', 'WB'].includes(y.slot.pos));
  if (!xs.length) return false;
  const clean = xs.filter((y) => !y.yc);
  const pool = clean.length ? clean : xs;
  const leadingLate = M.score[D.side] > M.score[A.side] && M.minute >= 70;
  const p = K.tacFoul * (D.P.tackling === 'hard' ? 1.3 : D.P.tackling === 'soft' ? 0.5 : 1) * (leadingLate ? 1.5 : 1) * (clean.length ? 1 : 0.25)
    * (1 + FATIGUE.tacFoulTired * (D.defTired ?? 0)); // zmęczona obrona nie nadąża i częściej przerywa faulem
  if (M.rng.next() >= p) return false;
  const x = pickWeighted(M, pool, (y) => attr(y, 'AGR') * (y.slot.pos === 'DP' ? 1.5 : 1));
  x.fouls++;
  emit(M, 'foul', D.side, x, { tactical: true });
  emit(M, 'freeKick', A.side, null);
  if (M.rng.next() < K.tacFoulDogso) straightRed(M, D, x, 'dogso');
  else if (M.rng.next() < K.tacFoulYellow * Math.sqrt(M.ctx.refStrict)) card(M, D, x, 'faul taktyczny, przerwanie kontry');
  return true;
}

// ------------------------------------------------------------ Zmęczenie (FATIGUE w constants.js)
/** Waga zawodnika przy losowaniu faulującego: zmęczony częściej się spóźnia. */
function tiredFoul(y) { return y.cond < FATIGUE.foulFrom ? 1 + FATIGUE.foulPerPt * (FATIGUE.foulFrom - y.cond) : 1; }
/** Częstość fauli: średnie zmęczenie obu drużyn (przy świeżych składach 1). */
function tiredFoulRate(M) {
  let s = 0; let n = 0;
  for (const T of M.teams) for (const y of onPitch(T, M.minute)) { s += tiredFoul(y); n++; }
  return n ? 1 + 0.5 * (s / n - 1) : 1;
}
/**
 * Szybkość ataku wobec obrony, tylko część wynikająca ze zmęczenia: zmęczeni obrońcy nie nadążają
 * za świeżym napastnikiem (także świeżym zmiennikiem), zmęczeni napastnicy tracą przewagę.
 * Świeże składy: 0 (różnica szybkości z samych atrybutów działa jak dotąd w kontrach).
 */
function paceTerm(M, ai, A, D) {
  if (!A.pace || !D.pace) return 0;
  const lost = (D.pace.defRaw - D.pace.def) - (A.pace.attRaw - A.pace.att); // przewaga ataku z samego zmęczenia
  return FATIGUE.paceK * clamp(lost, -FATIGUE.paceCap, FATIGUE.paceCap);
}
/** Błąd obrony przy wyprowadzeniu piłki (zmęczenie, gra poza pozycją): strata i dobra sytuacja rywala. */
function defError(M, ai, A, D) {
  const p = FATIGUE.errBase * Math.max(0, (D.errF ?? 1) - 1);
  if (p <= 0 || M.rng.next() >= p) return false;
  const xs = onPitch(D, M.minute).filter((y) => ['ŚO', 'BO', 'WB', 'DP'].includes(y.slot.pos));
  if (!xs.length) return false;
  const x = pickWeighted(M, xs, (y) => Math.max(0.01, errFactor(y) - 1));
  rateEv(x, -0.3);
  emit(M, 'defError', D.side, x, { text: `Błąd w obronie: ${last(x)} traci piłkę${x.cond < FATIGUE.errFrom ? ', widać zmęczenie' : ''}.` });
  A.threat += 3;
  const [lo, hi] = FATIGUE.errXg;
  shot(M, ai, lo + M.rng.next() * (hi - lo), 'POZ', false);
  return true;
}

function dribblePen(A) { return 1 + 0.04 * (A.avg('DRY') - 11); }

function pickType(M, A, D) {
  const w = {};
  for (const t of Object.keys(K.typeW)) {
    let v = K.typeW[t] * (A.P.act[t] ?? 1) * (D.P.oppAct[t] ?? 1);
    if (t === 'KON') {
      v *= D.P.counterVulnMul;
      if (A.P.konVsAttack > 1 && (D.P.mentality >= 1 || D.P.line === 'high')) v *= A.P.konVsAttack / 1.2;
    }
    w[t] = v;
  }
  return M.rng.weighted(Object.keys(w), (k) => w[k]);
}

/** Kontry taktyczne (4.2): bonus do przełamania, maks. +-0.5. */
function counterBonus(M, A, D, type) {
  let b = 0;
  const tecA = A.avg('TEC');
  if (D.P.pressing === 'high' && A.P.passing === 'short') b += tecA >= 12 ? 0.35 * Math.min(1, (tecA - 12) / 3) : -0.3 * Math.min(1, (12 - tecA) / 3);
  if (type === 'SKR') b += 0.25 * (A.P.W - D.P.W);
  if (type === 'KON' && A.P.konVsAttack > 1 && (D.P.line === 'high' || D.P.mentality >= 1)) {
    b += 0.4 * clamp(((A.pace?.team ?? A.avg('SZY')) - (D.pace?.team ?? D.avg('SZY')) + 3) / 6, 0, 1); // szybkość z kondycją
  }
  if (D.P.tackling === 'hard' && A.avg('DRY') >= 13) b -= 0.2;
  if (D.P.tackling === 'soft') b += 0.2 * clamp((A.avg('DRY') - 11) / 4, 0, 1);
  if (type === 'POZ' && D.P.DvsPOZ) b -= D.P.DvsPOZ;
  if (type === 'KON' && D.P.DvsKON) b -= D.P.DvsKON;
  if (A.P.brkPerTec) b += A.P.brkPerTec * (tecA - 11);
  if (A.P.brkPerAerial) b += A.P.brkPerAerial * ((A.avg('GLO') + A.avg('SIL')) / 2 - 11);
  return clamp(b, -0.5, 0.5);
}

function drawXg(M, table) {
  let x = M.rng.next();
  for (const [p, lo, hi] of table) { x -= p; if (x <= 0) return lo + M.rng.next() * (hi - lo); }
  const l = table[table.length - 1];
  return l[1] + M.rng.next() * (l[2] - l[1]);
}

function finishing(x, type, header) {
  const main = header ? attr(x, 'GLO') : type === 'DYS' ? attr(x, 'DYS') : attr(x, 'WYK');
  const condPen = x.cond < 85 ? -0.04 * (85 - x.cond) : 0;
  return 0.6 * main + 0.25 * attr(x, 'OPA') + 0.15 * attr(x, 'TEC') + x.base + 0.035 * x.Z + condPen;
}

// kind w zdarzeniach strzałów: typ akcji (POZ, SKR, KON, DYS, SP, FK, PEN), widoczny dla trenera na ławce (coach.js)
/** Udział pozycji w asystach przy akcjach z gry (cel: skrzydłowi i ofensywni pomocnicy najwięcej, środkowi obrońcy mało). */
const ASSIST_POS_W = { ŚO: 0.3, BO: 0.9, WB: 1.1, DP: 0.6, ŚP: 1.1, OP: 1.9, BP: 1.5, SN: 1.7, NAP: 1.3 };
/** Waga bramkarza przy asyście (cel: ok. 0,3-0,5% asyst, częściej po kontrze z długiego wybicia). */
const GK_ASSIST = { KON: 0.07, other: 0.012 };
function shot(M, ai, xg, type, header, forced = null) {
  const A = M.teams[ai]; const D = M.teams[1 - ai];
  const field = onPitch(A, M.minute).filter((y) => y.slot.pos !== 'BR');
  if (!field.length) return;
  const s = forced ?? pickWeighted(M, field, (y) => (SHOOT_W[y.slot.pos] ?? 1) * (header && y.slot.pos === 'ŚO' ? 3 : 1)
    * (header ? attr(y, 'GLO') : type === 'DYS' ? attr(y, 'DYS') : attr(y, 'RUC')) / 10);
  let assister = null;
  if (type !== 'DYS' && type !== 'FK' && field.length > 1) {
    // Bramkarz z bardzo małą wagą: rzadka asysta po długim wybiciu, najczęściej przy kontrze (gra nogami NOG)
    const gkA = type === 'SKR' || type === 'SP' ? null : goalkeeper(A);
    const others = [...field.filter((y) => y !== s), ...(gkA && gkA.p.pos === 'BR' ? [gkA] : [])];
    assister = pickWeighted(M, others, (y) => (y === gkA
      ? (attr(y, 'NOG') + attr(y, 'WIZ')) * (type === 'KON' ? GK_ASSIST.KON : GK_ASSIST.other)
      : type === 'SKR' || type === 'SP'
        ? attr(y, 'DOS') * (['BO', 'WB', 'BP', 'SN'].includes(y.slot.pos) ? 2 : y.slot.pos === 'ŚO' ? 0.2 : 0.5)
        : (attr(y, 'POD') + attr(y, 'WIZ')) * (ASSIST_POS_W[y.slot.pos] ?? 1)));
  }
  s.sh++;
  A.threat += 6 * xg;
  const gk = M.emptyNet ? null : goalkeeper(D);
  const F = finishing(s, type, header);
  const pg = M.emptyNet ? Math.min(0.95, xg * 1.25)
    : Math.min(0.95, xg * Math.exp(K.kFin * (F - D.zones.GK + K.finOffset)) * (M.ctx.weather.conv ?? 1) * D.gkMods.goalMul);
  if (assister) { assister.kp++; rateEv(assister, 0.15); emit(M, 'keyPass', ai, assister); }
  if (M.rng.next() < pg) { goal(M, ai, s, assister, xg, type === 'PEN' ? 'PEN' : header ? 'HEAD' : type); return; }
  if (xg >= 0.3) rateEv(s, -0.3);
  const r = M.rng.next();
  if (r < 0.28 && gk) {
    s.sot++; rateEv(s, 0.1);
    gk.saves++; rateEv(gk, 0.1 + 0.6 * xg);
    emit(M, 'shotOn', ai, s, { xg: round2(xg), kind: type, text: `${last(s)} strzela${header ? ' głową' : ''}, ${last(gk)} broni.` });
    emit(M, 'save', 1 - ai, gk);
    if (M.rng.next() < K.saveCorner * (1.3 - attr(gk, 'CHW') / 20)) corner(M, ai);
  } else if (r < 0.55 && !header) {
    emit(M, 'shotBlocked', ai, s, { xg: round2(xg), kind: type, text: `Strzał zablokowany, uderzał ${last(s)}.` });
    if (M.rng.next() < K.blockCorner) corner(M, ai);
  } else if (xg >= 0.12 && M.rng.next() < K.postShare * 4) {
    emit(M, 'post', ai, s, { xg: round2(xg), kind: type, text: `${M.rng.chance(0.5) ? 'Słupek' : 'Poprzeczka'}! ${last(s)} był bardzo blisko.` });
    emit(M, 'goalKick', 1 - ai, null);
  } else {
    emit(M, 'shotOff', ai, s, { xg: round2(xg), kind: type, text: `${last(s)} strzela${header ? ' głową' : ''} obok bramki.` });
    if (M.rng.next() < K.goalKickPerMiss) emit(M, 'goalKick', 1 - ai, null);
  }
}

const round2 = (v) => Math.round(v * 100) / 100;

function corner(M, ai) {
  const A = M.teams[ai]; const D = M.teams[1 - ai];
  A.threat += 2;
  emit(M, 'corner', ai, null);
  const gkUp = desperate(M, A);
  if (gkUp) emit(M, 'gkUp', ai, goalkeeper(A), { text: `${last(goalkeeper(A))} biegnie w pole karne rywala!` });
  if (M.rng.next() < K.cornerShot * Math.exp(0.08 * (A.zones.SPA - D.zones.SPD)) * (gkUp ? K.gkUp.shotMul : 1)) {
    shot(M, ai, K.cornerXg[0] + M.rng.next() * (K.cornerXg[1] - K.cornerXg[0]), 'SP', true);
  } else if (gkUp && M.rng.next() < K.gkUp.counter) {
    // Kontra na pustą bramkę
    M.emptyNet = true;
    shot(M, 1 - ai, K.gkUp.counterXg[0] + M.rng.next() * (K.gkUp.counterXg[1] - K.gkUp.counterXg[0]), 'KON', false);
    M.emptyNet = false;
  }
}

/** Ostatnie sekundy, przegrana jednym golem (w dwumeczu: suma), naturalny bramkarz idzie na rożny. */
function desperate(M, A) {
  if (M.half < 2 || M.elapsed <= M.length || (M.extraTime && M.half === 2)) return false;
  const gk = goalkeeper(A);
  if (!gk || gk.p.pos !== 'BR') return false;
  const fl = M.ctx.knockout?.firstLeg;
  const diff = M.score[A.side] - M.score[1 - A.side] + (fl ? fl[A.side] - fl[1 - A.side] : 0);
  return diff === -1 && M.elapsed >= M.length + (M.added ?? 0) - 1;
}

function setPiece(M, ai) {
  const A = M.teams[ai];
  const taker = onPitch(A, M.minute).find((y) => y.id === A.takers.freeKick);
  if (M.rng.next() < K.fkDirect) {
    const xg = (K.fkXgD[0] + M.rng.next() * (K.fkXgD[1] - K.fkXgD[0])) * (1 + 0.04 * ((taker ? attr(taker, 'SFR') : 10) - 12));
    shot(M, ai, Math.max(0.01, xg), 'FK', false, taker ?? null);
  } else if (M.rng.next() < K.fkCrossShot) {
    shot(M, ai, K.fkXgC[0] + M.rng.next() * (K.fkXgC[1] - K.fkXgC[0]), 'SP', true);
  }
}

function penaltyKick(M, ai, retake = false) {
  const A = M.teams[ai]; const D = M.teams[1 - ai];
  const xs = onPitch(A, M.minute).filter((y) => y.slot.pos !== 'BR');
  if (!xs.length) return;
  // Wyznaczony strzelec; po pudle w tym meczu do piłki podchodzi następny w kolejce
  const ranked = xs.slice().sort((p, q) => (attr(q, 'WYK') + attr(q, 'OPA')) - (attr(p, 'WYK') + attr(p, 'OPA')));
  const desig = xs.find((y) => y.id === A.takers.penalty);
  const t = desig && !A.penMissed?.includes(desig.id) ? desig : ranked.find((y) => !A.penMissed?.includes(y.id)) ?? ranked[0];
  const gk = goalkeeper(D);
  const skill = (attr(t, 'WYK') + attr(t, 'OPA') + attr(t, 'SFR')) / 3;
  const keep = gk ? (attr(gk, 'REF') + attr(gk, 'JNJ')) / 2 : 3;
  const p = Math.min(0.97, K.penConv * Math.exp(0.03 * (skill - keep)) * D.gkMods.goalMul ** 0.3);
  t.sh++;
  if (M.rng.next() < p) { goal(M, ai, t, null, 0.78, 'PEN'); return; }
  const saved = gk && M.rng.next() < 0.6;
  // Law 14: bramkarz zszedł z linii przed strzałem, karny niestrzelony -> powtórka (raz)
  if (!retake && gk && M.rng.next() < K.penRetake) {
    emit(M, 'penaltyRetake', ai, t, { reason: 'bramkarz przed linią', text: `Powtórka rzutu karnego: ${last(gk)} wyszedł przed linię bramkową.` });
    penaltyKick(M, ai, true);
    return;
  }
  if (saved) {
    t.sot++; gk.saves++; rateEv(gk, 0.6);
    emit(M, 'shotOn', ai, t, { xg: 0.78, penalty: true, text: `${last(gk)} broni rzut karny! Strzelał ${last(t)}.` });
    emit(M, 'save', 1 - ai, gk);
  } else {
    emit(M, 'shotOff', ai, t, { xg: 0.78, penalty: true, text: `${last(t)} nie trafia z rzutu karnego!` });
  }
  A.penMissed = [...(A.penMissed ?? []), t.id];
  rateEv(t, -0.5);
  // Dobitka po obronie (strzelający nie może dotknąć piłki drugi raz)
  if (saved && M.rng.next() < K.penRebound) {
    const others = xs.filter((y) => y !== t);
    if (others.length) {
      const r = pickWeighted(M, others, (y) => (SHOOT_W[y.slot.pos] ?? 1) * attr(y, 'RUC'));
      shot(M, ai, K.penReboundXg[0] + M.rng.next() * (K.penReboundXg[1] - K.penReboundXg[0]), 'POZ', false, r);
    }
  }
}

function goal(M, ai, s, assister, xg, how) {
  const A = M.teams[ai]; const D = M.teams[1 - ai];
  // VAR może anulować gola (spalony, faul, ręka)
  if (M.ctx.var && how !== 'OG' && how !== 'PEN' && M.rng.next() < K.varGoalCancel) {
    M.halfCounts.var++;
    const varReason = M.rng.weighted(['spalony', 'faul w ataku', 'ręka'], (k) => ({ spalony: 0.6, 'faul w ataku': 0.25, ręka: 0.15 })[k]);
    emit(M, 'goal', ai, s, { xg: round2(xg ?? 0), how, aid: assister?.id ?? null, text: `GOL! ${s ? last(s) : ''}`, provisional: true, pause: 3 });
    emit(M, 'varCheck', ai, s, { decision: 'goalDisallowed', text: 'VAR sprawdza bramkę.', pause: 2 });
    emit(M, 'varOverturn', ai, s, { cancelGoal: true, decision: 'goalDisallowed', varReason, xg: round2(xg ?? 0), text: `Gol nieuznany po analizie VAR (${varReason}).` });
    if (varReason === 'spalony' && s) s.offs++;
    return;
  }
  M.score[ai]++;
  M.halfCounts.goals++;
  if (s) {
    s.g++; s.sot++;
    const def = ['ŚO', 'BO', 'WB'].includes(s.slot.pos);
    rateEv(s, s.slot.pos === 'NAP' ? 0.9 : def ? 1.2 : 1.0);
  }
  if (assister) { assister.ast++; rateEv(assister, 0.6); }
  for (const y of onPitch(D, M.minute)) {
    const c = { BR: -0.3, ŚO: -0.2, BO: -0.2, WB: -0.2, DP: -0.1 }[y.slot.pos];
    if (c) rateEv(y, c);
  }
  if (M.rng.next() < 0.08) {
    const ds = onPitch(D, M.minute).filter((y) => ['BR', 'ŚO', 'BO', 'WB', 'DP'].includes(y.slot.pos));
    if (ds.length) rateEv(pickWeighted(M, ds, (y) => 20 - attr(y, 'DEC')), -1.0);
  }
  for (const y of onPitch(A, M.minute)) y.Z += 1;
  for (const y of onPitch(D, M.minute)) y.Z += y.p.persona === 'Wrażliwy' ? -3 : y.p.persona === 'Lider' ? 0 : y.p.persona === 'Narwaniec' ? 1 : -1;
  // Samobój: pechowiec z obrony rywala (bez gola w statystykach strzelców)
  const ogBy = how === 'OG' ? pickWeighted(M, onPitch(D, M.minute), (y) => ({ ŚO: 4, BO: 2.5, WB: 2, DP: 2, BR: 1 }[y.slot.pos] ?? 0.5)) : null;
  const text = how === 'OG' ? `GOL! Samobójcze trafienie${ogBy ? `: ${last(ogBy)}` : ''}.`
    : how === 'PEN' ? `GOL! ${last(s)} pewnie z rzutu karnego.`
      : `GOL! ${last(s)}${how === 'HEAD' ? ' strzałem głową' : how === 'DYS' ? ' strzałem z dystansu' : how === 'FK' ? ' z rzutu wolnego' : ''}${assister ? `, asysta: ${last(assister)}` : ''}.`;
  emit(M, 'goal', ai, s, { xg: round2(xg ?? 0), how, aid: assister?.id ?? null, ownGoal: how === 'OG', ogId: ogBy?.id ?? null, text, pause: 3, score: [...M.score] });
  if (M.ctx.var && how !== 'PEN' && M.rng.next() < K.varGoalConfirm) {
    M.halfCounts.var += 0.3;
    emit(M, 'varCheck', ai, s, { decision: 'goalCheck', text: 'VAR sprawdza bramkę.', pause: 2 });
    emit(M, 'varCheck', ai, s, { confirmed: true, decision: 'goalConfirmed', text: 'Po analizie VAR: gol uznany.' });
  }
  for (const T of M.teams) T.react.push({ kind: 'goal', tick: M.tick });
}

function phaseOwnGoal(M) {
  if (M.rng.next() < K.ogPerMatch / 95) goal(M, M.ai, null, null, 0, 'OG');
}

function phaseThrowIns(M) {
  if (M.rng.next() < K.throwInTick) emit(M, 'throwIn', M.rng.next() < 0.55 ? M.ai : 1 - M.ai, null);
}

// ------------------------------------------------------------ Kontuzje
function pickInjury(M, x) {
  let light = 0.62; let severe = 0.10;
  if ((x.p.hidden?.ODP ?? 10) >= 15) { light += 0.05; severe -= 0.05; }
  const r = M.rng.next();
  const cat = r < light ? 'light' : r < 1 - severe ? 'medium' : 'severe';
  const [name, lo, hi, playable] = M.rng.pick(INJURY_TYPES[cat]);
  return { cat, name, days: M.rng.int(lo, hi), playable };
}

/**
 * Uraz w meczu. Zdarzenie 'injury': { injury, severity, canContinue, days, gk, treated, concussion, contact }.
 * opts.cardedFoul: rywal ukarany kartką za ten faul, więc opatrywany nie musi schodzić (Law 5).
 * opts.injury: wymuszony uraz { cat, name, days, playable } (scenariusze testowe, przyszłe zdarzenia).
 */
export function injure(M, T, x, contact = false, opts = {}) {
  if (x.injury && !(x.knock && !x.knock.aggravated)) return; // zawodnik grający z bólem może doznać kolejnego urazu
  const inj = opts.injury ?? pickInjury(M, x);
  // Kolejny uraz grywalny u zawodnika, który już gra z bólem: uraz się pogłębia i zawodnik schodzi
  if (inj.playable && x.knock && !x.knock.aggravated) { aggravate(M, T, x, contact); return; }
  x.injury = inj;
  M.halfCounts.injuries++;
  const gk = x.slot?.pos === 'BR';
  // IFAB 2026/27: opatrywany zawodnik schodzi na 1 minutę (bez bramkarza i faulu ukaranego kartką)
  const treated = !gk && !opts.cardedFoul;
  if (treated) x.treatedUntil = M.minute + 1;
  if (inj.playable) {
    // Lekki uraz (gra z bólem): kara do formy wg typu, stan widoczny w x.knock (biały krzyżyk w UI)
    x.knock = makeKnock(inj.name, M.minute, { days: inj.days });
    x.base -= (KNOCK.types[x.knock.type]?.pen ?? 0.045) * x.p.ovr;
  } else { x.on = false; if (!gk) T.injuredOff.push(x); } // musi zejść; drużyna gra w osłabieniu do zmiany
  const concussion = /wstrząśnienie/.test(inj.name);
  emit(M, 'injury', T.side, x, {
    injury: inj, severity: inj.cat, canContinue: inj.playable, days: inj.days, gk, treated, concussion, contact,
    knock: !!inj.playable, knockType: x.knock && inj.playable ? x.knock.type : null, aggravated: false, knocked: inj.playable ? countKnocks(T) : 0,
    text: inj.playable ? `${last(x)} jest opatrywany (${inj.name}), może grać dalej z bólem.` : `${last(x)} doznaje kontuzji (${inj.name}) i nie może kontynuować gry.`,
  });
  if (!inj.playable) {
    T.react.push({ kind: 'injury', tick: M.tick, pos: x.slot?.pos ?? null, gk });
    if (gk) { T.injuredGk = x; goalkeeperLost(M, T, 'injury'); }
    checkMinPlayers(M, T);
  } else T.react.push({ kind: 'knock', tick: M.tick, pos: x.slot?.pos ?? null, gk, type: x.knock.type });
}

const countKnocks = (T) => fieldPlayers(T).filter((y) => y.knock && !y.knock.aggravated).length;

/**
 * Pogłębienie lekkiego urazu (zawodnik grał z bólem): uraz średni, zejście z boiska.
 * Zdarzenie 'injury' z aggravated: true, canContinue: false, from: nazwa lekkiego urazu.
 */
export function aggravate(M, T, x, contact = false) {
  const k = x.knock;
  const t = KNOCK.types[k.type] ?? KNOCK.types.contusion;
  const [name, lo, hi] = t.worse;
  const inj = { cat: 'medium', name, days: M.rng.int(lo, hi), playable: false, aggravated: true, from: k.name };
  k.aggravated = true; k.aggravatedAt = M.minute;
  x.injury = inj;
  M.halfCounts.injuries++;
  const gk = x.slot?.pos === 'BR';
  x.on = false;
  if (!gk) T.injuredOff.push(x);
  emit(M, 'injury', T.side, x, {
    injury: inj, severity: 'medium', canContinue: false, days: inj.days, gk, treated: false, concussion: false, contact,
    knock: false, knockType: k.type, aggravated: true, from: k.name, knocked: countKnocks(T),
    text: `${last(x)} nie wytrzymał gry z bólem: uraz się pogłębił (${name}). Musi zejść.`,
  });
  T.react.push({ kind: 'injury', tick: M.tick, pos: x.slot?.pos ?? null, gk });
  if (gk) { T.injuredGk = x; goalkeeperLost(M, T, 'injury'); }
  checkMinPlayers(M, T);
}

function phaseInjuries(M) {
  for (const T of M.teams) {
    for (const x of onPitch(T, M.minute)) {
      const m = (1.5 - 0.05 * (x.p.hidden?.ODP ?? 10)) * (x.cond < 50 ? 2 : x.cond < 70 ? 1.4 : 1)
        * ((x.p.age ?? 25) >= 33 ? 1.3 : (x.p.age ?? 25) >= 30 ? 1.15 : 1) * (M.ctx.weather.inj ?? 1);
      if (M.rng.next() < K.injTick * m * 0.4) injure(M, T, x, false); // 40 % urazów widocznych w meczu
    }
    if (T.knocked) knockRisk(M, T);
  }
}

/**
 * Ryzyko pogłębienia lekkiego urazu w każdej minucie gry z bólem: typ urazu, zmęczenie, wiek, intensywność gry
 * (fatMul: pressing, tempo) i liczba lekko kontuzjowanych w drużynie [SZAC, docs/taktyka-i-urazy.md].
 */
function knockRisk(M, T) {
  const extra = 1 + KNOCK.aggTeam * Math.max(0, T.knocked - 1);
  for (const x of onPitch(T, M.minute)) {
    const k = x.knock;
    if (!k || k.aggravated || k.since === M.minute) continue;
    const t = KNOCK.types[k.type] ?? KNOCK.types.contusion;
    const p = t.agg * extra * (x.cond < 70 ? KNOCK.aggTired : 1) * ((x.p.age ?? 25) >= 30 ? KNOCK.aggAge : 1) * (T.P.fatMul ?? 1) * (M.ctx.weather.inj ?? 1);
    if (M.rng.next() < p) aggravate(M, T, x);
  }
}

// ------------------------------------------------------------ Momentum
function phaseMomentum(M) {
  const [H, A] = M.teams;
  const raw = clamp((H.threat - A.threat) * K.momentumScale, -100, 100);
  const prev = M.momentum.slice(-2);
  const v = Math.round((raw + prev.reduce((s, x) => s + x, 0)) / (1 + prev.length));
  M.momentum.push(v);
}

/** Średnie momentum ostatnich 5 minut z perspektywy strony (-1..1). */
function momentumAvg(M, side) {
  const lastFive = M.momentum.slice(-5);
  if (!lastFive.length) return 0;
  const avg = lastFive.reduce((s, x) => s + x, 0) / lastFive.length / 100;
  return side === 0 ? avg : -avg;
}

// ------------------------------------------------------------ Lista faz (rozszerzalna)
export const PHASES = [
  ['teams', phaseTeams],
  ['possession', phasePossession],
  ['offside', phaseOffside],
  ['foul', phaseFoul],
  ['action', phaseAction],
  ['ownGoal', phaseOwnGoal],
  ['throwIns', phaseThrowIns],
  ['injuries', phaseInjuries],
  ['momentum', phaseMomentum],
];

/** Dodanie nowej fazy (np. pogoda zmieniająca się w trakcie) przed albo po istniejącej. */
export function registerPhase(id, fn, { before = null, after = null } = {}) {
  const i = PHASES.findIndex(([k]) => k === id);
  if (i >= 0) PHASES.splice(i, 1);
  let at2 = PHASES.length;
  if (before) at2 = PHASES.findIndex(([k]) => k === before);
  if (after) at2 = PHASES.findIndex(([k]) => k === after) + 1;
  PHASES.splice(at2 < 0 ? PHASES.length : at2, 0, [id, fn]);
}

export function runPhases(M) {
  for (const [, fn] of PHASES) fn(M);
}
