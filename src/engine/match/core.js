// Pełny silnik meczowy minuta po minucie (docs/ekspert_futbol.md 6.1, PLAN 3, 3.1, 3.2, 4.1, 4.2).
// Każda minuta to lista faz (PHASES). Każde zdarzenie trafia do dziennika (M.events);
// wynik, statystyki, oceny, relacja i momentum liczą się tylko z dziennika.

import { Rng, clamp } from '../../core/rng.js';
import { K, SHOOT_W, FOUL_W, INJURY_TYPES } from './constants.js';
import { buildTeam, updateZones, updateCondition, onPitch, goalkeeper } from './teams.js';

const sig = (x) => 1 / (1 + Math.exp(-x));
const attr = (x, k) => x.p.attr?.[k] ?? x.p.ovr ?? 10;
const last = (x) => x.p.last ?? x.p.name;

// ------------------------------------------------------------ Tworzenie meczu
/**
 * cfg: { seed, home: {club, squad, tactics, ai, coach, zStart}, away: {...},
 *        ctx: { neutral, rank 0-3, var, weather: {conv, foul, fat, inj, name}, refStrict, attendance 0-1,
 *               knockout: false | 'single' | { firstLeg: [g dla obecnego gospodarza, g dla gościa] } } }
 */
export function createMatch(cfg) {
  const ctx = { neutral: false, rank: 0, var: true, refStrict: 1, attendance: 0.8, knockout: false, weather: {}, ...cfg.ctx };
  const rng = new Rng(cfg.seed ?? 'mecz');
  const M = {
    ctx, rng, tick: 0, half: 1, phase: 'play', minute: 0, elapsed: 0, length: 45, added: null,
    score: [0, 0], events: [], momentum: [], possession: [], halfTimeScore: null,
    halfCounts: freshCounts(), addedTimes: [], extraTime: false, shootout: null, ended: false,
    hfa: ctx.neutral ? 0 : 0.7 + 0.3 * ctx.attendance,
  };
  M.teams = [buildTeam(0, cfg.home, rng, ctx), buildTeam(1, cfg.away, rng, ctx)];
  for (const T of M.teams) { updateZones(T, M); ensureGoalkeeper(M, T); }
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
  const xs = onPitch(at, M.minute).filter((x) => ['NAP', 'SN', 'OP', 'SP'].includes(x.slot.pos));
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
  if (M.rng.next() < baseFoul * avgFoulMul(M)) {
    const fi = M.rng.next() < K.foulDefShare ? 1 - ai : ai;
    const ft = M.teams[fi];
    const xs = onPitch(ft, M.minute);
    const x = pickWeighted(M, xs, (y) => (FOUL_W[y.slot.pos] ?? 1) * (attr(y, 'AGR') / 10) * (y.yc ? K.bookedFoulMul : 1));
    x.fouls++;
    emit(M, 'foul', fi, x);
    emit(M, 'freeKick', 1 - fi, null);
    const sm = shoutMods(ft, M);
    const cm = (fi === 0 ? K.homeCardMul : K.awayCardMul) ** (M.hfa ? 1 : 0) * r * (0.7 + 0.03 * (x.p.hidden?.TMP ?? 10))
      * (M.ctx.rank >= 2 ? 1.15 : 1) * (M.minute > 80 ? 1.15 : 1) * (sm.yellowMul ?? 1) * (1 + 0.03 * Math.max(0, x.Z));
    if (M.rng.next() < K.redPerFoul * cm * Math.sqrt(r) * ft.P.redPerFoul * ft.P.redMul) sendOff(M, ft, x, 'czerwona kartka za brutalny faul');
    else if (M.rng.next() < K.yellowPerFoul * cm * ft.P.yellowPerFoul * (x.yc ? K.bookedYellowMul : 1)) card(M, ft, x);
    // Ofiara faulu: ryzyko kontuzji kontaktowej
    const victimTeam = M.teams[1 - fi];
    if (M.rng.next() < K.injContact * ft.P.oppInjuryMul) {
      const vs = onPitch(victimTeam, M.minute);
      if (vs.length) injure(M, victimTeam, M.rng.pick(vs), true);
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
  }
}

const at = (M) => M.teams[M.ai];
function avgFoulMul(M) { return (M.teams[0].P.foulMul + M.teams[1].P.foulMul) / 2 * ((shoutMods(M.teams[0], M).foulMul ?? 1) + (shoutMods(M.teams[1], M).foulMul ?? 1)) / 2; }

function card(M, T, x, reason = 'faul') {
  M.halfCounts.cards++;
  if (x.yc) { sendOff(M, T, x, 'druga żółta kartka'); return; }
  x.yc = 1;
  rateEv(x, -0.3);
  emit(M, 'yellow', T.side, x, { text: `Żółta kartka: ${last(x)} (${reason}).` });
}

function sendOff(M, T, x, reason) {
  M.halfCounts.cards++;
  x.sentOff = true;
  rateEv(x, -1.5);
  emit(M, 'red', T.side, x, { text: `Czerwona kartka: ${last(x)} (${reason}).` });
  // Reakcja drużyny: lider tłumi, bez lidera spadek zaangażowania
  const leader = onPitch(T, M.minute).some((y) => y.p.persona === 'Lider');
  for (const y of onPitch(T, M.minute)) y.Z += leader ? 2 : -1;
  ensureGoalkeeper(M, T);
}

/** Bez bramkarza na boisku do bramki idzie zawodnik z pola (najlepszy w bramce). */
export function ensureGoalkeeper(M, T) {
  if (goalkeeper(T)) return;
  const xs = onPitch(T, M.minute);
  if (!xs.length) return;
  const x = xs.slice().sort((p, q) => (q.R.GK + attr(q, 'SKO') * 0.1) - (p.R.GK + attr(p, 'SKO') * 0.1))[0];
  x.slot = { pos: 'BR', side: null, x: 50, y: 5 };
  emit(M, 'gkSwitch', T.side, x, { text: `${last(x)} staje w bramce.` });
}

function phaseAction(M) {
  const ai = M.ai; const A = M.teams[ai]; const D = M.teams[1 - ai];
  const gsA = gameState(M, ai); const gsD = gameState(M, 1 - ai);
  const smA = shoutMods(A, M); const smD = shoutMods(D, M);
  // Obrona broniącej drużyny: instrukcje (nastawienie, agresja), stan meczu od 65', okrzyk
  const dD = D.P.D + gsD.D + (smD.D ?? 0);
  const delta = (0.55 * A.zones.ATT + 0.45 * A.zones.MID) - (0.65 * D.zones.DEF + 0.35 * D.zones.MID) - dD;
  const mom = momentumAvg(M, ai);
  const pAct = K.pAction * (M.hfa ? (ai === 0 ? K.homeCreate : K.awayCreate) ** M.hfa : 1) * A.P.pActMul * D.P.oppPActMul
    * gsA.act * (smA.actMul ?? 1) * (1 + K.lateRamp * Math.max(0, M.minute - 55)) * Math.exp(K.kCreate * delta)
    * (1 + K.momentumAct * mom) * (M.ctx.weather.act ?? 1);
  if (M.rng.next() >= pAct) return;
  A.threat += 1;
  const type = pickType(M, A, D);
  // Rzut karny
  if (M.rng.next() < K.penPerAction * D.P.penMul * (0.85 + 0.15 * M.ctx.refStrict) * dribblePen(A)) {
    const fouler = pickWeighted(M, onPitch(D, M.minute).filter((y) => y.slot.pos !== 'BR'), (y) => FOUL_W[y.slot.pos] ?? 1);
    const fouled = pickWeighted(M, onPitch(A, M.minute), (y) => SHOOT_W[y.slot.pos] ?? 1);
    if (M.ctx.var && M.rng.next() < K.varPenCancel) {
      M.halfCounts.var++;
      emit(M, 'varCheck', ai, fouled, { text: 'VAR sprawdza rzut karny.', pause: 2 });
      emit(M, 'varOverturn', ai, fouled, { text: 'Po analizie VAR sędzia odwołuje rzut karny.' });
      return;
    }
    rateEv(fouler, -0.6); rateEv(fouled, 0.3);
    emit(M, 'foul', 1 - ai, fouler);
    emit(M, 'penalty', ai, fouled, { text: `Rzut karny! Faul: ${last(fouler)}, poszkodowany: ${last(fouled)}.` });
    if (M.rng.next() < 0.1 * M.ctx.refStrict) card(M, D, fouler, 'faul w polu karnym');
    penaltyKick(M, ai);
    return;
  }
  const brk = K.brkBase[type] + K.kBreak * delta + A.P.brk + counterBonus(M, A, D, type);
  if (M.rng.next() < sig(brk)) {
    A.threat += 3;
    const header = type === 'SKR' && M.rng.next() < 0.45;
    shot(M, ai, drawXg(M, K.xg[type]) * (type === 'DYS' ? (M.ctx.weather.dys ?? 1) : 1), type, header);
  } else if (M.rng.next() < K.failCorner[type]) {
    corner(M, ai);
  } else if (M.rng.next() < K.failOffside[type]) {
    offside(M, A);
  } else {
    const xs = onPitch(D, M.minute).filter((y) => y.slot.pos !== 'BR');
    const x = pickWeighted(M, xs, (y) => attr(y, 'ODB') + attr(y, 'UST'));
    x.tk++; rateEv(x, 0.08);
    const kind = type === 'SKR' && M.rng.next() < 0.5 ? 'clearance' : M.rng.next() < 0.55 ? 'tackle' : 'interception';
    emit(M, kind, 1 - ai, x);
    if (M.rng.next() < K.goalKickOnFail) emit(M, 'goalKick', 1 - ai, null);
  }
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
    b += 0.4 * clamp((A.avg('SZY') - D.avg('SZY') + 3) / 6, 0, 1);
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

function shot(M, ai, xg, type, header, forced = null) {
  const A = M.teams[ai]; const D = M.teams[1 - ai];
  const field = onPitch(A, M.minute).filter((y) => y.slot.pos !== 'BR');
  if (!field.length) return;
  const s = forced ?? pickWeighted(M, field, (y) => (SHOOT_W[y.slot.pos] ?? 1) * (header && y.slot.pos === 'ŚO' ? 3 : 1)
    * (header ? attr(y, 'GLO') : type === 'DYS' ? attr(y, 'DYS') : attr(y, 'RUC')) / 10);
  let assister = null;
  if (type !== 'DYS' && type !== 'FK' && field.length > 1) {
    const others = field.filter((y) => y !== s);
    assister = pickWeighted(M, others, (y) => (type === 'SKR' || type === 'SP'
      ? attr(y, 'DOS') * (['BO', 'WB', 'SP', 'SN'].includes(y.slot.pos) ? 2 : 0.5)
      : attr(y, 'POD') + attr(y, 'WIZ')));
  }
  s.sh++;
  A.threat += 6 * xg;
  const gk = goalkeeper(D);
  const F = finishing(s, type, header);
  const pg = Math.min(0.95, xg * Math.exp(K.kFin * (F - D.zones.GK + K.finOffset)) * (M.ctx.weather.conv ?? 1) * D.gkMods.goalMul);
  if (assister) { assister.kp++; rateEv(assister, 0.15); emit(M, 'keyPass', ai, assister); }
  if (M.rng.next() < pg) { goal(M, ai, s, assister, xg, type === 'PEN' ? 'PEN' : header ? 'HEAD' : type); return; }
  if (xg >= 0.3) rateEv(s, -0.3);
  const r = M.rng.next();
  if (r < 0.28 && gk) {
    s.sot++; rateEv(s, 0.1);
    gk.saves++; rateEv(gk, 0.1 + 0.6 * xg);
    emit(M, 'shotOn', ai, s, { xg: round2(xg), text: `${last(s)} strzela${header ? ' głową' : ''}, ${last(gk)} broni.` });
    emit(M, 'save', 1 - ai, gk);
    if (M.rng.next() < K.saveCorner * (1.3 - attr(gk, 'CHW') / 20)) corner(M, ai);
  } else if (r < 0.55 && !header) {
    emit(M, 'shotBlocked', ai, s, { xg: round2(xg), text: `Strzał zablokowany, uderzał ${last(s)}.` });
    if (M.rng.next() < K.blockCorner) corner(M, ai);
  } else if (xg >= 0.12 && M.rng.next() < K.postShare * 4) {
    emit(M, 'post', ai, s, { xg: round2(xg), text: `${M.rng.chance(0.5) ? 'Słupek' : 'Poprzeczka'}! ${last(s)} był bardzo blisko.` });
    emit(M, 'goalKick', 1 - ai, null);
  } else {
    emit(M, 'shotOff', ai, s, { xg: round2(xg), text: `${last(s)} strzela${header ? ' głową' : ''} obok bramki.` });
    if (M.rng.next() < K.goalKickPerMiss) emit(M, 'goalKick', 1 - ai, null);
  }
}

const round2 = (v) => Math.round(v * 100) / 100;

function corner(M, ai) {
  const A = M.teams[ai]; const D = M.teams[1 - ai];
  A.threat += 2;
  emit(M, 'corner', ai, null);
  if (M.rng.next() < K.cornerShot * Math.exp(0.08 * (A.zones.SPA - D.zones.SPD))) {
    shot(M, ai, K.cornerXg[0] + M.rng.next() * (K.cornerXg[1] - K.cornerXg[0]), 'SP', true);
  }
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

function penaltyKick(M, ai) {
  const A = M.teams[ai]; const D = M.teams[1 - ai];
  const xs = onPitch(A, M.minute).filter((y) => y.slot.pos !== 'BR');
  const t = xs.find((y) => y.id === A.takers.penalty) ?? xs.sort((p, q) => (attr(q, 'WYK') + attr(q, 'OPA')) - (attr(p, 'WYK') + attr(p, 'OPA')))[0];
  const gk = goalkeeper(D);
  const skill = (attr(t, 'WYK') + attr(t, 'OPA') + attr(t, 'SFR')) / 3;
  const keep = gk ? (attr(gk, 'REF') + attr(gk, 'JNJ')) / 2 : 3;
  const p = Math.min(0.97, K.penConv * Math.exp(0.03 * (skill - keep)) * D.gkMods.goalMul ** 0.3);
  t.sh++;
  if (M.rng.next() < p) { goal(M, ai, t, null, 0.78, 'PEN'); return; }
  if (gk && M.rng.next() < 0.6) {
    t.sot++; gk.saves++; rateEv(gk, 0.6);
    emit(M, 'shotOn', ai, t, { xg: 0.78, text: `${last(gk)} broni rzut karny! Strzelał ${last(t)}.` });
    emit(M, 'save', 1 - ai, gk);
  } else {
    emit(M, 'shotOff', ai, t, { xg: 0.78, text: `${last(t)} nie trafia z rzutu karnego!` });
  }
  rateEv(t, -0.5);
}

function goal(M, ai, s, assister, xg, how) {
  const A = M.teams[ai]; const D = M.teams[1 - ai];
  // VAR może anulować gola (spalony, faul, ręka)
  if (M.ctx.var && how !== 'OG' && M.rng.next() < K.varGoalCancel) {
    M.halfCounts.var++;
    emit(M, 'goal', ai, s, { xg: round2(xg ?? 0), how, aid: assister?.id ?? null, text: `GOL! ${s ? last(s) : ''}`, provisional: true, pause: 3 });
    emit(M, 'varCheck', ai, s, { text: 'VAR sprawdza bramkę.', pause: 2 });
    emit(M, 'varOverturn', ai, s, { cancelGoal: true, xg: round2(xg ?? 0), text: 'Gol nieuznany po analizie VAR.' });
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

export function injure(M, T, x, contact = false) {
  if (x.injury) return;
  const inj = pickInjury(M, x);
  x.injury = inj;
  M.halfCounts.injuries++;
  // IFAB 2026/27: opatrywany zawodnik schodzi na 1 minutę (bez bramkarza i faulu ukaranego kartką)
  if (x.slot?.pos !== 'BR') x.treatedUntil = M.minute + 1;
  if (inj.playable) x.base -= 0.045 * x.p.ovr;
  else x.on = false; // musi zejść; drużyna gra w osłabieniu do zmiany
  emit(M, 'injury', T.side, x, {
    injury: inj, contact,
    text: inj.playable ? `${last(x)} jest opatrywany (${inj.name}), może grać dalej.` : `${last(x)} doznaje kontuzji (${inj.name}) i nie może kontynuować gry.`,
  });
  if (!inj.playable) ensureGoalkeeper(M, T);
}

function phaseInjuries(M) {
  for (const T of M.teams) {
    for (const x of onPitch(T, M.minute)) {
      const m = (1.5 - 0.05 * (x.p.hidden?.ODP ?? 10)) * (x.cond < 50 ? 2 : x.cond < 70 ? 1.4 : 1)
        * ((x.p.age ?? 25) >= 33 ? 1.3 : (x.p.age ?? 25) >= 30 ? 1.15 : 1) * (M.ctx.weather.inj ?? 1);
      if (M.rng.next() < K.injTick * m * 0.4) injure(M, T, x, false); // 40 % urazów widocznych w meczu
    }
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
