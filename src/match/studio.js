// Studio przedmeczowe i pomeczowe: dane do ekranów dnia meczowego (zapowiedź, absencje, warunki, sędzia,
// szanse 1X2 z modelu Poissona, raport asystenta, oczekiwania, nagłówki mediów; po meczu: kluczowe momenty,
// zawodnik meczu, oceny, kontrowersje, reakcje, tabela, nowe kontuzje i pauzy).
//
// Czyste funkcje: wejście to dane przygotowane przez kalendarz, kadrę i silnik, wynik to obiekt JSON.
// Studio nie przegląda świata: dostaje tylko dwie drużyny, ich kadry, tabelę i listę zdarzeń meczu.
// Wartości balansowe oznaczone [SZAC]. Opis: docs/odprawy-studio.md.

import { Rng, clamp } from '../core/rng.js';
import { proficiency, posEff, assessLineup } from '../engine/positions.js';

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// ================================================================ Pomocnicze

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-11-14' -> 'Nov 14, 2026' (format MMM D, YYYY). */
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const injuryDaysOf = (p) => p.injury?.days ?? p.injuryDays ?? 0;
const injuryPlayable = (p) => !!p.injury?.playable;
function suspOf(p, comp = 'league') {
  if (p.susp && typeof p.susp === 'object') return p.susp[comp] ?? 0;
  return p.suspended ?? 0;
}
function ycOf(p, comp = 'league') {
  if (p.yc && typeof p.yc === 'object') return p.yc[comp] ?? 0;
  return typeof p.yc === 'number' ? p.yc : 0;
}
const isAvailable = (p, comp) => !(injuryDaysOf(p) > 0 && !injuryPlayable(p)) && !(suspOf(p, comp) > 0) && !p.callUp && !p.onLoanOut;
const nameOf = (p) => p.name ?? String(p.id);
/** Polska odmiana liczebników: 1 gol, 2 gole, 5 goli, 22 gole. */
export function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10; const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}
const normResult = (x) => ({ W: 'W', D: 'R', R: 'R', L: 'P', P: 'P' }[x] || x);

// ================================================================ Ranga meczu

// Klasyki spoza jednego regionu (ranga 2). [SZAC]
export const KLASYKI = [['legia', 'lech'], ['legia', 'widzew'], ['lech', 'wisla-krakow'], ['legia', 'wisla-krakow'], ['gornik-zabrze', 'legia']];

/** Derby: jawna flaga albo ten sam region (bez par pierwsza drużyna i jej rezerwy). */
export function isDerby(home, away) {
  if (!home || !away) return false;
  if (home.parent === away.id || away.parent === home.id) return false;
  return !!home.region && home.region === away.region;
}
function isKlasyk(home, away) {
  return KLASYKI.some(([a, b]) => (home.id === a && away.id === b) || (home.id === b && away.id === a));
}

/**
 * Ranga 0-3 i etykieta. ctx: { competition:{type:'league'|'cup'|'uefa'|'supercup', stage, name}, home, away,
 *   table:{size, relegationFrom (pierwsze miejsce spadkowe), roundsPlayed, roundsTotal}, derby }
 */
export function matchRank(ctx) {
  const { home, away } = ctx;
  const comp = ctx.competition || { type: 'league' };
  const tags = [];
  let level = 0;
  const bump = (lv, tag) => { level = Math.max(level, lv); tags.push(tag); };
  if (comp.stage === 'final' || comp.type === 'supercup') bump(3, 'final');
  if (comp.type === 'cup') bump(1, 'cup');
  if (comp.type === 'uefa') bump(2, 'uefa');
  if (ctx.derby ?? isDerby(home, away)) bump(2, 'derby');
  else if (isKlasyk(home, away)) bump(2, 'klasyk');
  const t = ctx.table;
  if (comp.type === 'league' && t && home.position && away.position) {
    const late = (t.roundsPlayed ?? 0) >= 0.5 * (t.roundsTotal ?? 34);
    const relFrom = t.relegationFrom ?? (t.size ?? 18) - 2;
    const nearDrop = (pos, pts) => pos >= relFrom - 3 && Math.abs((pts ?? 0) - (t.safetyPoints ?? pts ?? 0)) <= 4;
    if (late && nearDrop(home.position, home.points) && nearDrop(away.position, away.points)) bump(2, 'relegation');
    if (late && home.position <= 2 && away.position <= 2 && Math.abs((home.points ?? 0) - (away.points ?? 0)) <= 4) bump(2, 'title');
  }
  const LABELS = { final: 'Finał', uefa: 'Mecz w pucharach UEFA', derby: 'Derby', klasyk: 'Klasyk', relegation: 'Mecz o utrzymanie', title: 'Mecz o mistrzostwo', cup: 'Mecz pucharowy' };
  const label = tags.length ? tags.map((x) => LABELS[x]).join(', ') : 'Mecz ligowy';
  return { level, label, tags };
}

// ================================================================ Forma i bilans

export function formSummary(last5 = []) {
  const r = last5.map(normResult);
  const pts = r.reduce((s, x) => s + (x === 'W' ? 3 : x === 'R' ? 1 : 0), 0);
  const label = pts >= 12 ? 'Znakomita forma' : pts >= 9 ? 'Dobra forma' : pts >= 6 ? 'Przeciętna forma' : pts >= 3 ? 'Słaba forma' : 'Kryzys';
  return { results: r, points: pts, label };
}

/** h2h: [{date, homeId, awayId, gH, gA}] (najnowsze na końcu). Bilans z perspektywy gospodarza. */
export function h2hSummary(h2h = [], homeId, awayId, names = {}) {
  let w = 0; let d = 0; let l = 0; let gf = 0; let ga = 0;
  for (const m of h2h) {
    const our = m.homeId === homeId ? m.gH : m.gA;
    const their = m.homeId === homeId ? m.gA : m.gH;
    gf += our; ga += their;
    if (our > their) w++; else if (our === their) d++; else l++;
  }
  const last = h2h.slice(-5).map((m) => ({ date: formatDate(m.date), text: `${m.homeName ?? names[m.homeId] ?? m.homeId} ${m.gH}:${m.gA} ${m.awayName ?? names[m.awayId] ?? m.awayId}` }));
  const leader = w > l + 1 ? homeId : l > w + 1 ? awayId : null;
  return { played: h2h.length, homeWins: w, draws: d, awayWins: l, goalsHome: gf, goalsAway: ga, last, leader };
}

// ================================================================ Absencje, składy, kluczowi zawodnicy

// 10 formacji z ekspert_futbol.md 3 (kolejność slotów: BR, obrona, pomoc, atak; strona L/P). W = szerokość.
export const FORMATIONS = {
  '4-4-2': { nick: 'Dwie Linie', W: 1.0, slots: 'BR BO:L ŚO ŚO BO:P SP:L ŚP ŚP SP:P NAP NAP' },
  '4-3-3': { nick: 'Trójząb', W: 1.0, slots: 'BR BO:L ŚO ŚO BO:P DP ŚP ŚP SN:L NAP SN:P' },
  '4-2-3-1': { nick: 'Parasol', W: 0.9, slots: 'BR BO:L ŚO ŚO BO:P DP DP SP:L OP SP:P NAP' },
  '4-1-4-1': { nick: 'Kurtyna', W: 0.9, slots: 'BR BO:L ŚO ŚO BO:P DP SP:L ŚP ŚP SP:P NAP' },
  '4-4-2D': { nick: 'Diament', W: 0.6, slots: 'BR BO:L ŚO ŚO BO:P DP ŚP ŚP OP NAP NAP' },
  '3-5-2': { nick: 'Wahadło', W: 0.9, slots: 'BR ŚO ŚO ŚO WB:L DP ŚP ŚP WB:P NAP NAP' },
  '3-4-3': { nick: 'Wysoki Trójkąt', W: 1.2, slots: 'BR ŚO ŚO ŚO WB:L ŚP ŚP WB:P SN:L NAP SN:P' },
  '5-3-2': { nick: 'Bunkier', W: 0.8, slots: 'BR WB:L ŚO ŚO ŚO WB:P ŚP DP ŚP NAP NAP' },
  '5-4-1': { nick: 'Mur', W: 0.9, slots: 'BR WB:L ŚO ŚO ŚO WB:P SP:L ŚP ŚP SP:P NAP' },
  '4-3-2-1': { nick: 'Choinka', W: 0.5, slots: 'BR BO:L ŚO ŚO BO:P DP ŚP ŚP OP OP NAP' },
};
export function formationSlots(name) {
  const f = FORMATIONS[name] || FORMATIONS['4-4-2'];
  return f.slots.split(' ').map((s) => { const [pos, side] = s.split(':'); return { pos, side: side || null }; });
}
const centralMids = (name) => formationSlots(name).filter((s) => ['DP', 'ŚP', 'OP'].includes(s.pos)).length;

/** Kontuzjowani i zawieszeni (w danych rozgrywkach). */
export function absences(squad = [], comp = 'league') {
  const injured = [];
  const suspended = [];
  for (const p of squad) {
    const days = injuryDaysOf(p);
    if (days > 0) injured.push({ id: p.id, name: nameOf(p), pos: p.pos, days, type: p.injury?.type ?? null, playable: injuryPlayable(p) });
    const s = suspOf(p, comp);
    if (s > 0) suspended.push({ id: p.id, name: nameOf(p), pos: p.pos, matches: s });
  }
  injured.sort((a, b) => b.days - a.days);
  return { injured, suspended };
}

/** Przewidywany skład: zachłannie, najpierw bramkarz, potem slot po slocie najlepszy dostępny (OVR x biegłość). */
export function predictLineup(squad = [], formation = '4-4-2', comp = 'league') {
  const slots = formationSlots(formation);
  const pool = squad.filter((p) => isAvailable(p, comp));
  const used = new Set();
  const lineup = [];
  for (const slot of slots) {
    let best = null;
    let bestV = -Infinity;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const v = (p.ovr ?? 10) * posEff(proficiency(p, slot.pos, slot.side)) - (p.fresh != null && p.fresh < 70 ? 0.5 : 0);
      if (v > bestV) { bestV = v; best = p; }
    }
    if (!best) break;
    used.add(best.id);
    lineup.push({ player: best, slot });
  }
  return lineup;
}

/** Kluczowi zawodnicy: OVR + forma + liczby w sezonie. */
export function keyPlayers(squad = [], n = 3, comp = 'league') {
  const score = (p) => {
    const f = Array.isArray(p.form) && p.form.length ? p.form.reduce((s, v) => s + v, 0) / p.form.length : 6.6;
    const s = p.season || {};
    return (p.ovr ?? 10) + 0.8 * (f - 6.6) + 0.15 * (s.g ?? 0) + 0.1 * (s.a ?? 0);
  };
  return squad.filter((p) => isAvailable(p, comp)).map((p) => ({ p, v: score(p) })).sort((a, b) => b.v - a.v).slice(0, n)
    .map(({ p }) => {
      const s = p.season || {};
      const bits = [];
      if (s.g) bits.push(`${s.g} ${plural(s.g, 'gol', 'gole', 'goli')}`);
      if (s.a) bits.push(`${s.a} ${plural(s.a, 'asysta', 'asysty', 'asyst')}`);
      if (s.rating) bits.push(`średnia ocen ${s.rating.toFixed(2).replace('.', ',')}`);
      return { id: p.id, name: nameOf(p), pos: p.pos, note: bits.join(', ') || 'kluczowa postać zespołu' };
    });
}

// ================================================================ Kartki: zagrożeni pauzą

/**
 * Czy kolejna żółta oznacza pauzę. compType: league | cup | uefa. stage (UEFA): 'q' eliminacje, 'main' od fazy ligowej, 'final'.
 * Polska: pauza po 4., 8., 12., 16. ... żółtej (ekspert_sedzia A2). UEFA: eliminacje 3., 5., 7.; od fazy ligowej 4., 6., 8.
 */
export function nextYellowSuspends(yc, compType = 'league', stage = 'main') {
  const n = yc + 1;
  if (compType === 'uefa') {
    if (stage === 'final') return false;
    if (stage === 'q') return n >= 3 && n % 2 === 1;
    return n >= 4 && n % 2 === 0;
  }
  return n % 4 === 0; // [ZAŁOŻENIE: Puchar Polski z tym samym progiem, osobny licznik]
}

export function suspensionRisk(squad = [], compType = 'league', stage = 'main') {
  return squad.filter((p) => isAvailable(p, compType) && nextYellowSuspends(ycOf(p, compType), compType, stage))
    .map((p) => ({ id: p.id, name: nameOf(p), pos: p.pos, yellows: ycOf(p, compType), text: `${nameOf(p)}: kolejna żółta kartka oznacza pauzę` }));
}

// ================================================================ Warunki: pogoda, murawa, sędzia, frekwencja

const WEATHER = {
  slonce: { label: 'Słonecznie', note: null },
  pochmurno: { label: 'Pochmurno', note: null },
  deszcz: { label: 'Deszcz', note: 'Śliska piłka: więcej strzałów z dystansu, trudniej o krótkie podania.' },
  snieg: { label: 'Śnieg', note: 'Mniej akcji, szybsze zmęczenie, większe ryzyko urazów.' },
  wiatr: { label: 'Silny wiatr', note: 'Długie podania i strzały z dystansu tracą celność.' },
};
const PITCH = {
  doskonala: { label: 'Doskonała', note: 'Sprzyja grze krótkimi podaniami.' },
  dobra: { label: 'Dobra', note: null },
  zla: { label: 'Zła, grząska', note: 'Krótkie podania tracą sens, zawodnicy szybciej się męczą.' },
  sztuczna: { label: 'Sztuczna', note: 'Goście są bardziej narażeni na urazy.' },
};

export function weatherInfo(w = {}) {
  const base = WEATHER[w.type] || WEATHER.pochmurno;
  const notes = base.note ? [base.note] : [];
  if (w.tempC != null && w.tempC > 28) notes.push('Upał: zawodnicy zmęczą się dużo szybciej.');
  if (w.tempC != null && w.tempC < -5) notes.push('Mróz: większe ryzyko urazów mięśniowych.');
  return { label: base.label, tempC: w.tempC ?? null, notes };
}

/** Sędzia (ekspert_sedzia B8): surowość, oczekiwane kartki i karne w tym meczu. */
export function refereeInfo(ref = {}, { rankLevel = 0, var: hasVar = true, stake = false, deadRubber = false } = {}) {
  const s = ref.strictness ?? 1;
  const heat = rankLevel >= 2 ? 1.15 : stake ? 1.1 : deadRubber ? 0.9 : 1;
  const label = s < 0.9 ? 'Łagodny' : s <= 1.1 ? 'Przeciętny' : 'Surowy';
  const season = ref.season && ref.season.matches > 0 ? {
    matches: ref.season.matches,
    ycPerMatch: r2(ref.season.yc / ref.season.matches),
    rcPerMatch: r2(ref.season.rc / ref.season.matches),
  } : null;
  return {
    name: ref.name ?? 'Sędzia nieznany',
    label,
    strictness: r2(s),
    expectedYellows: r2(4.4 * s * heat), // średnia Ekstraklasy ok. 4,4 [ŹRÓDŁO ekspert_sedzia]
    expectedReds: r2(0.18 * (ref.redTendency ?? 1) * heat),
    expectedPenalties: r2(0.3 * (ref.penaltyTendency ?? 1) * (hasVar ? 1 : 0.85)),
    var: hasVar,
    season,
  };
}

/** Frekwencja: zapełnienie stadionu z nastroju kibiców, rangi, pozycji, prestiżu i pogody. [SZAC] */
export function attendance(ctx) {
  const cap = ctx.stadium?.capacity ?? 15000;
  const mood = ctx.fans?.mood ?? 50;
  const rank = ctx.rankLevel ?? 0;
  let fill = 0.5 + 0.005 * (mood - 50) + [0, 0.05, 0.2, 0.35][rank] + 0.02 * ((ctx.home?.prestige ?? 5) - 5);
  if (ctx.home?.position && ctx.home.position <= 3) fill += 0.05;
  const w = ctx.weather?.type;
  if (w === 'deszcz') fill -= 0.05;
  if (w === 'snieg') fill -= 0.1;
  if (ctx.weather?.tempC != null && ctx.weather.tempC < -5) fill -= 0.08;
  fill = clamp(fill, 0.2, 1);
  return { expected: Math.round((cap * fill) / 100) * 100, capacity: cap, fill: r2(fill), homeAdvantage: r2(0.7 + 0.3 * fill) };
}

// ================================================================ Szanse 1X2 (Poisson, ekspert 6.1 e)

const POIS_MAX = 10;
function poissonPmf(lambda) {
  const out = [Math.exp(-lambda)];
  for (let k = 1; k <= POIS_MAX; k++) out.push((out[k - 1] * lambda) / k);
  return out;
}

/**
 * Szanse 1X2 z modelu Poissona z korektą Dixona-Colesa (rho -0.10).
 * home/away: { strength:{ATT, MID, DEF, GK, FIN}, qsMul } albo { ovr11 } (albo { L }).
 * Zwraca prawdopodobieństwa sumujące się do 1, procenty całkowite sumujące się do 100 i najbardziej prawdopodobny wynik.
 */
export function odds1X2(home, away, { neutral = false, rho = -0.10 } = {}) {
  const BETA = 0.225; const MU_H = 1.5; const MU_A = 1.19; const MU_N = 1.34;
  let dH; let dA;
  const sH = home.strength; const sA = away.strength;
  if (sH && sA) {
    const att = (T) => 0.55 * T.ATT + 0.45 * T.MID;
    const def = (T) => 0.65 * T.DEF + 0.35 * T.MID;
    dH = 0.75 * (att(sH) - def(sA)) + 0.15 * (sH.MID - sA.MID) + 0.1 * ((sH.FIN ?? sH.ATT) - (sA.GK ?? sA.DEF));
    dA = 0.75 * (att(sA) - def(sH)) + 0.15 * (sA.MID - sH.MID) + 0.1 * ((sA.FIN ?? sA.ATT) - (sH.GK ?? sH.DEF));
  } else {
    const d = (home.ovr11 ?? home.L ?? 11) - (away.ovr11 ?? away.L ?? 11);
    dH = d; dA = -d;
  }
  const lH = (neutral ? MU_N : MU_H) * Math.exp(BETA * dH) * (home.qsMul ?? 1);
  const lA = (neutral ? MU_N : MU_A) * Math.exp(BETA * dA) * (away.qsMul ?? 1);
  const pH = poissonPmf(lH); const pA = poissonPmf(lA);
  let w = 0; let d = 0; let l = 0; let best = { p: -1 };
  for (let i = 0; i <= POIS_MAX; i++) {
    for (let j = 0; j <= POIS_MAX; j++) {
      let tau = 1;
      if (i === 0 && j === 0) tau = 1 - lH * lA * rho;
      else if (i === 0 && j === 1) tau = 1 + lH * rho;
      else if (i === 1 && j === 0) tau = 1 + lA * rho;
      else if (i === 1 && j === 1) tau = 1 - rho;
      const p = pH[i] * pA[j] * tau;
      if (i > j) w += p; else if (i === j) d += p; else l += p;
      if (p > best.p) best = { p, i, j };
    }
  }
  const tot = w + d + l;
  const probs = { home: w / tot, draw: d / tot, away: l / tot };
  // procenty metodą największych reszt (zawsze 100)
  const raw = [probs.home * 100, probs.draw * 100, probs.away * 100];
  const fl = raw.map(Math.floor);
  let rest = 100 - fl.reduce((s, v) => s + v, 0);
  raw.map((v, i) => ({ i, r: v - fl[i] })).sort((a, b) => b.r - a.r).forEach(({ i }) => { if (rest > 0) { fl[i]++; rest--; } });
  return {
    ...probs,
    pct: { home: fl[0], draw: fl[1], away: fl[2] },
    lambdaHome: r3(lH),
    lambdaAway: r3(lA),
    likelyScore: `${best.i}:${best.j}`,
    expectedPoints: { home: r2(3 * probs.home + probs.draw), away: r2(3 * probs.away + probs.draw) },
  };
}

// ================================================================ Raport asystenta

const ATT_LABEL = { '-2': 'zamurowuje bramkę', '-1': 'gra ostrożnie', 0: 'gra w równowadze', 1: 'gra do przodu', 2: 'rzuca wszystko do ataku' };
const COACH_LABEL = { O: 'ofensywny', S: 'ostrożny', P: 'pragmatyczny' };

/**
 * Raport asystenta. user/opp: { name, formation, tactics:{passing, pressing, line, attitude, counter, tempo, aggression},
 *   coach, avg:{TEC, SZY_att, SZY_def, GLO_cb, GLO_fw, DRY}, squad, lineup? }
 */
export function assistantReport({ user, opp, comp = 'league', stage = 'main' }) {
  const t = opp.tactics || {};
  const oppF = FORMATIONS[opp.formation] ? opp.formation : '4-4-2';
  const style = [];
  style.push(`${opp.name} gra ustawieniem ${oppF.replace('D', '')} „${FORMATIONS[oppF].nick}” i ${ATT_LABEL[String(t.attitude ?? 0)]}.`);
  const bits = [];
  if (t.pressing === 'wysoki') bits.push('wysoko pressuje');
  if (t.pressing === 'niski') bits.push('cofa się po stracie');
  if (t.passing === 'krotkie') bits.push('rozgrywa krótkimi podaniami');
  if (t.passing === 'dlugie') bits.push('gra długimi piłkami');
  if (t.line === 'wysoka') bits.push('ustawia linię obrony wysoko');
  if (t.line === 'niska') bits.push('broni nisko');
  if (t.counter) bits.push('czeka na kontry');
  if (t.aggression === 'twarda') bits.push('gra twardo w odbiorze');
  if (bits.length) style.push(`Rywal ${bits.join(', ')}.`);
  if (opp.coach) style.push(`Trener rywala jest ${COACH_LABEL[opp.coach] || 'pragmatyczny'}.`);

  // Kontry taktyczne (ekspert 4.2, 3.1)
  const ua = user.avg || {}; const oa = opp.avg || {};
  const counters = [];
  if (t.pressing === 'wysoki') {
    if ((ua.TEC ?? 11) >= 12) counters.push('Krótkie podania: nasza technika pozwoli wyjść spod ich pressingu.');
    else counters.push('Długie podania: ominiemy ich pressing i zagramy za plecy obrońców.');
  }
  if (t.passing === 'krotkie' && (oa.TEC ?? 12) < 12) counters.push('Wysoki pressing: rywal słabo radzi sobie technicznie pod presją.');
  if (t.passing === 'dlugie' && (ua.GLO_cb ?? 12) >= (oa.GLO_fw ?? 12) - 1) counters.push('Niska linia i krycie strefowe: nasi stoperzy wygrają walkę w powietrzu.');
  if ((t.line === 'wysoka' || (t.attitude ?? 0) >= 1) && (ua.SZY_att ?? 12) >= (oa.SZY_def ?? 12) - 1) counters.push('Kontratak: za ich wysoko ustawioną obroną jest dużo miejsca.');
  if (t.counter) counters.push('Niska linia i wolniejsze tempo odbiorą im kontrataki.');
  if ((oa.DRY ?? 11) >= 13) counters.push('Twardsza gra w odbiorze ograniczy ich drybling, ale grozi kartkami.');
  // formacja
  let formation = null;
  const oppW = FORMATIONS[oppF].W;
  if (oppW <= 0.6) formation = { name: '4-4-2', why: 'Rywal gra wąsko. Szeroka formacja da przewagę na skrzydłach.' };
  else if (centralMids(oppF) === 2) formation = { name: '4-3-3', why: 'Rywal ma tylko dwóch środkowych pomocników. Trzech w środku da nam kontrolę nad piłką.' };
  else if ((t.attitude ?? 0) >= 1) formation = { name: '4-2-3-1', why: 'Rywal atakuje. Dwóch defensywnych pomocników zabezpieczy środek i da kontry.' };
  else if ((t.attitude ?? 0) <= -1) formation = { name: '3-4-3', why: 'Rywal się broni. Szerokie ustawienie rozciągnie jego obronę.' };
  if (formation && user.formation === formation.name) formation = { ...formation, why: `${formation.why} To już nasze ustawienie.` };

  // Ostrzeżenia
  const warnings = [];
  const lineup = user.lineup || predictLineup(user.squad || [], user.formation || '4-4-2', comp);
  if (lineup.length) for (const w of assessLineup(lineup).warnings) warnings.push(w);
  for (const { player: p } of lineup) {
    if (p.fresh != null && p.fresh < 80) warnings.push(`${nameOf(p)} jest zmęczony (świeżość ${Math.round(p.fresh)} %).`);
    else if ((p.load14 ?? 0) > 810) warnings.push(`${nameOf(p)} dużo grał w ostatnich 14 dniach: rośnie ryzyko urazu.`);
    if (injuryDaysOf(p) > 0 && injuryPlayable(p)) warnings.push(`${nameOf(p)} gra z urazem: słabsza fizyczność i ryzyko pogłębienia kontuzji.`);
  }
  for (const r of suspensionRisk(user.squad || [], comp, stage)) warnings.push(r.text + '.');
  return { style: style.join(' '), counters, formation, warnings };
}

// ================================================================ Oczekiwania zarządu i kibiców

export function expectations({ pWin, pDraw, rank, board = {}, fans = {}, userForm, comp = 'league' }) {
  const lines = [];
  let boardText;
  if (comp === 'cup') boardText = pWin >= 0.5 ? 'Zarząd oczekuje awansu do kolejnej rundy.' : 'Zarząd liczy na walkę o awans.';
  else if (pWin >= 0.6) boardText = 'Zarząd oczekuje pewnego zwycięstwa.';
  else if (pWin >= 0.45) boardText = 'Zarząd liczy na trzy punkty.';
  else if (pWin >= 0.3) boardText = 'Zarząd przyjmie remis, ale liczy na więcej.';
  else boardText = 'Zarząd nie wymaga punktów, chce zobaczyć walkę.';
  if (rank?.tags?.includes('derby')) lines.push('Derbów się nie przegrywa. Zarząd i kibice mówią to jednym głosem.');
  if ((board.trust ?? 60) < 25) lines.push('Twoja posada jest zagrożona. Porażka może zakończyć pracę w klubie.');
  else if ((board.trust ?? 60) < 40) lines.push('Zarząd traci cierpliwość. Potrzebny jest dobry wynik.');
  const mood = fans.mood ?? 50;
  let fansText = mood >= 70 ? 'Kibice wierzą w zwycięstwo i szykują oprawę.'
    : mood >= 45 ? 'Kibice czekają na dobry mecz.'
      : mood >= 25 ? 'Kibice są zaniepokojeni i oczekują reakcji.' : 'Kibice są wściekli. Na trybunach mogą pojawić się transparenty przeciwko zespołowi.';
  if (userForm && userForm.points <= 3 && userForm.results.length >= 4) fansText += ' Seria słabych wyników ciąży nad drużyną.';
  const expectedPoints = r2(3 * pWin + (pDraw ?? 0));
  return { board: boardText, fans: fansText, notes: lines, expectedPoints };
}

// ================================================================ Nagłówki mediów

// [id, faza, flaga, tekst]. Flaga 'any' pasuje zawsze. Teksty bez myślników.
const HEADLINES = [
  // ---- przed meczem
  ['pre-derby-1', 'pre', 'derby', 'Derby! {home} i {away} grają o coś więcej niż trzy punkty'],
  ['pre-derby-2', 'pre', 'derby', 'Miasto żyje jednym meczem: {home} kontra {away}'],
  ['pre-derby-3', 'pre', 'derby', 'Przed derbami: kto będzie rządził w mieście?'],
  ['pre-klasyk-1', 'pre', 'klasyk', 'Klasyk polskiej piłki: {home} kontra {away}'],
  ['pre-final-1', 'pre', 'final', 'Finał {comp}: {home} i {away} o krok od trofeum'],
  ['pre-final-2', 'pre', 'final', 'Jeden mecz, jedno trofeum. {home} i {away} gotowe na finał'],
  ['pre-cup-1', 'pre', 'cup', 'Puchar rządzi się swoimi prawami: {home} kontra {away}'],
  ['pre-cup-2', 'pre', 'cup', 'Gra o awans: {home} i {away} bez prawa do pomyłki'],
  ['pre-uefa-1', 'pre', 'uefa', 'Europejski wieczór: {home} kontra {away}'],
  ['pre-uefa-2', 'pre', 'uefa', 'Cała Polska trzyma kciuki. {user} gra w Europie'],
  ['pre-rel-1', 'pre', 'relegation', 'Mecz o życie: {home} i {away} walczą o utrzymanie'],
  ['pre-rel-2', 'pre', 'relegation', 'Sześciopunktowy mecz na dole tabeli'],
  ['pre-rel-3', 'pre', 'relegation', 'Strach przed spadkiem. {home} i {away} nie mogą przegrać'],
  ['pre-title-1', 'pre', 'title', 'Hit na szczycie: {home} kontra {away}'],
  ['pre-title-2', 'pre', 'title', 'Starcie o mistrzostwo. Lider pod presją'],
  ['pre-favh-1', 'pre', 'favHome', '{home} faworytem, {away} szuka niespodzianki'],
  ['pre-favh-2', 'pre', 'favHome', 'Eksperci nie mają wątpliwości: {home} ma wygrać'],
  ['pre-fava-1', 'pre', 'favAway', '{away} przyjeżdża po trzy punkty'],
  ['pre-fava-2', 'pre', 'favAway', 'Czy {home} zatrzyma faworyta?'],
  ['pre-even-1', 'pre', 'even', 'Mecz bez faworyta: {home} kontra {away}'],
  ['pre-even-2', 'pre', 'even', 'Wyrównane siły, otwarty wynik'],
  ['pre-hform-1', 'pre', 'homeGoodForm', '{home} na fali. Czy seria potrwa?'],
  ['pre-aform-1', 'pre', 'awayGoodForm', '{away} w formie, gospodarze muszą uważać'],
  ['pre-hbad-1', 'pre', 'homeBadForm', '{home} w dołku. Potrzebne przełamanie'],
  ['pre-abad-1', 'pre', 'awayBadForm', '{away} szuka przełamania po słabych wynikach'],
  ['pre-h2h-1', 'pre', 'h2h', 'Bilans bezpośredni: {h2hLeader} wygrywa te mecze najczęściej'],
  ['pre-h2h-2', 'pre', 'h2h', 'Historia ostatnich starć przemawia na korzyść: {h2hLeader}'],
  ['pre-inj-1', 'pre', 'injuryCrisis', 'Plaga kontuzji: {user} bez kilku podstawowych zawodników'],
  ['pre-inj-2', 'pre', 'injuryCrisis', 'Szpital zamiast szatni? {user} z dużymi brakami'],
  ['pre-star-1', 'pre', 'oppStar', '{oppStar} groźny jak nigdy. Rywal ma swoją broń'],
  ['pre-star-2', 'pre', 'oppStar', 'Kto zatrzyma gwiazdę rywala? {oppStar} w wysokiej formie'],
  ['pre-ref-1', 'pre', 'strictRef', 'Sędzia {ref} nie oszczędza kartek. Zapowiada się nerwowo'],
  ['pre-weather-1', 'pre', 'badWeather', 'Pogoda zagra swoją rolę: trudne warunki na boisku'],
  ['pre-board-1', 'pre', 'boardPressure', 'Gorący stołek: zarząd klubu {user} czeka na wyniki'],
  ['pre-board-2', 'pre', 'boardPressure', 'Ostatnia szansa trenera? Zarząd patrzy na wynik'],
  ['pre-any-1', 'pre', 'any', '{home} kontra {away}: zapowiedź meczu'],
  ['pre-any-2', 'pre', 'any', 'Trzy punkty w grze. {home} i {away} gotowe'],
  ['pre-any-3', 'pre', 'any', 'Dzień meczowy! {home} kontra {away}'],
  ['pre-any-4', 'pre', 'any', '{home} podejmuje gości, {away} chce zaskoczyć'],
  ['pre-any-5', 'pre', 'any', 'Szatnie gotowe, murawa przygotowana. Czas na mecz'],
  ['pre-any-6', 'pre', 'any', 'Trenerzy zapowiadają walkę do ostatniej minuty'],
  ['pre-any-7', 'pre', 'any', 'Kibice czekają na emocje: {home} kontra {away}'],
  ['pre-any-8', 'pre', 'any', '{home} i {away} przed ważnym sprawdzianem'],
  ['pre-any-9', 'pre', 'any', 'Taktyczna szachownica: kto kogo zaskoczy?'],
  ['pre-any-10', 'pre', 'any', 'Sprawdzian charakteru dla obu drużyn'],
  ['pre-any-11', 'pre', 'any', 'Bez kalkulacji: {home} i {away} chcą wygrać'],
  ['pre-any-12', 'pre', 'any', 'Na papierze ciekawie. Jak będzie na boisku?'],
  ['pre-any-13', 'pre', 'any', 'Godzina prawdy: {home} kontra {away}'],
  ['pre-any-14', 'pre', 'any', 'Zapowiedź kolejki: {home} i {away} w centrum uwagi'],
  // ---- po meczu (perspektywa klubu gracza: {user}, {opp}, wynik {uScore})
  ['post-win-1', 'post', 'userWin', '{user} wygrywa {uScore} i dopisuje trzy punkty'],
  ['post-win-2', 'post', 'userWin', 'Trzy punkty zostają u nas. {user} górą'],
  ['post-win-3', 'post', 'userWin', 'Plan wykonany: {user} wygrywa {uScore}'],
  ['post-win-4', 'post', 'userWin', '{scorer} daje zwycięstwo drużynie {user}'],
  ['post-big-1', 'post', 'bigWin', 'Pogrom! {user} rozbija rywala {uScore}'],
  ['post-big-2', 'post', 'bigWin', 'Lekcja futbolu: {user} bez litości dla rywala'],
  ['post-draw-1', 'post', 'userDraw', 'Podział punktów: {home} {score} {away}'],
  ['post-draw-2', 'post', 'userDraw', 'Remis, który nikogo nie cieszy'],
  ['post-draw-3', 'post', 'userDraw', 'Po punkcie dla każdego'],
  ['post-nil-1', 'post', 'goalless', 'Bezbramkowy remis. Kibice ziewali'],
  ['post-nil-2', 'post', 'goalless', 'Zero z przodu, zero z tyłu'],
  ['post-loss-1', 'post', 'userLoss', '{user} przegrywa {uScore}'],
  ['post-loss-2', 'post', 'userLoss', 'Bolesna porażka. {user} bez punktów'],
  ['post-loss-3', 'post', 'userLoss', 'Zimny prysznic dla drużyny {user}'],
  ['post-loss-4', 'post', 'userLoss', '{opp} zabiera punkty i wraca do domu z uśmiechem'],
  ['post-heavy-1', 'post', 'heavyLoss', 'Kompromitacja! {user} przegrywa aż {uScore}'],
  ['post-heavy-2', 'post', 'heavyLoss', 'Czarny dzień: {user} bez szans'],
  ['post-goals-1', 'post', 'highScoring', 'Festiwal goli: {home} {score} {away}'],
  ['post-comeback-1', 'post', 'comeback', 'Niesamowity powrót! {winner} odwraca losy meczu'],
  ['post-comeback-2', 'post', 'comeback', 'Od straty do zwycięstwa: {winner} pokazuje charakter'],
  ['post-late-1', 'post', 'lateWinner', 'Gol w końcówce! {scorer} bohaterem'],
  ['post-late-2', 'post', 'lateWinner', 'Rozstrzygnięcie w ostatnich minutach'],
  ['post-red-1', 'post', 'redCard', 'Czerwona kartka zmieniła mecz'],
  ['post-red-2', 'post', 'redCard', 'Nerwy puściły: {redPlayer} z czerwoną kartką'],
  ['post-var-1', 'post', 'varControversy', 'VAR w roli głównej. Kibice wściekli'],
  ['post-var-2', 'post', 'varControversy', 'Kontrowersje wokół decyzji sędziego {ref}'],
  ['post-pen-1', 'post', 'penalty', 'Rzut karny przesądził o losach meczu'],
  ['post-hat-1', 'post', 'hatTrick', 'Hat-trick! {hatTrick} rozbija rywala w pojedynkę'],
  ['post-upw-1', 'post', 'upsetWin', 'Sensacja! {user} pokonuje faworyta'],
  ['post-upw-2', 'post', 'upsetWin', 'Niespodzianka kolejki: {user} górą'],
  ['post-upl-1', 'post', 'upsetLoss', 'Wpadka faworyta. {user} traci punkty'],
  ['post-upl-2', 'post', 'upsetLoss', 'Blamaż! {opp} ogrywa faworyta'],
  ['post-dw-1', 'post', 'derbyWin', 'Derby wygrane! {user} rządzi w mieście'],
  ['post-dw-2', 'post', 'derbyWin', 'Święto na trybunach: derby dla drużyny {user}'],
  ['post-dl-1', 'post', 'derbyLoss', 'Porażka w derbach boli podwójnie'],
  ['post-dl-2', 'post', 'derbyLoss', 'Derby dla rywala. {user} musi przełknąć gorycz'],
  ['post-cs-1', 'post', 'cleanSheet', 'Mur z tyłu: {user} bez straconego gola'],
  ['post-unl-1', 'post', 'unluckyLoss', 'Lepsi, ale bez punktów. {user} przegrywa mimo przewagi'],
  ['post-unl-2', 'post', 'unluckyLoss', 'Futbol bywa okrutny: {user} gra dobrze i przegrywa'],
  ['post-board-1', 'post', 'boardPressureLoss', 'Posada trenera wisi na włosku'],
  ['post-board-2', 'post', 'boardPressureLoss', 'Zarząd traci cierpliwość po kolejnej porażce'],
  ['post-motm-1', 'post', 'motm', '{motm} zawodnikiem meczu'],
  ['post-motm-2', 'post', 'motm', '{motm} błyszczy na boisku'],
  ['post-any-1', 'post', 'any', '{home} {score} {away}: relacja i oceny'],
  ['post-any-2', 'post', 'any', 'Po meczu: {home} {score} {away}'],
  ['post-any-3', 'post', 'any', 'Mecz za nami: {home} {score} {away}'],
  ['post-any-4', 'post', 'any', 'Wynik i kluczowe momenty: {home} {score} {away}'],
  ['post-any-5', 'post', 'any', 'Analiza: co zadecydowało o wyniku?'],
  ['post-any-6', 'post', 'any', 'Trener po meczu: wnioski na kolejny tydzień'],
  ['post-any-7', 'post', 'any', 'Kibice ocenili mecz. Oceny zawodników w środku'],
  ['post-any-8', 'post', 'any', 'Liczby meczu: xG, posiadanie i strzały'],
  ['post-any-9', 'post', 'any', 'Szatnia po meczu: emocje powoli opadają'],
  ['post-any-10', 'post', 'any', 'Oceny po meczu: kto zawiódł, kto zachwycił?'],
].map(([id, phase, flag, text]) => ({ id, phase, flag, text }));

export const HEADLINE_TEMPLATES = HEADLINES;

// Waga dopasowania: im ważniejsza sytuacja, tym większa szansa na nagłówek dnia. 'any' = 1, reszta domyślnie 3. [SZAC]
const HEADLINE_PRIORITY = {
  final: 6, derby: 6, derbyWin: 6, derbyLoss: 6, hatTrick: 6,
  uefa: 5, relegation: 5, title: 5, klasyk: 5, comeback: 5, upsetWin: 5, upsetLoss: 5, heavyLoss: 5, bigWin: 5, lateWinner: 5,
  unluckyLoss: 4, varControversy: 4, redCard: 4, boardPressureLoss: 4, boardPressure: 4, injuryCrisis: 4,
  any: 1,
};
const prio = (h) => HEADLINE_PRIORITY[h.flag] ?? 3;
export const HEADLINE_MEMORY = 5; // nagłówek nie wraca przez 5 meczów

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
}
function canFill(text, vars) {
  return [...text.matchAll(/\{(\w+)\}/g)].every((m) => vars[m[1]] != null && vars[m[1]] !== '');
}

/**
 * Wybór nagłówków bez powtórzeń. history: tablica tablic id (ostatnie mecze), exclude: id użyte w tym meczu.
 * Najpierw nagłówki dopasowane do sytuacji (waga 3), potem ogólne (waga 1).
 */
export function pickHeadlines(phase, flags, vars, { history = [], exclude = [], seed = 'media', n = 3 } = {}) {
  const recent = new Set([...history.slice(-HEADLINE_MEMORY).flat(), ...exclude]);
  const rng = new Rng(`${seed}|naglowki|${phase}`);
  const flagSet = new Set([...flags, 'any']);
  let pool = HEADLINES.filter((h) => h.phase === phase && flagSet.has(h.flag) && !recent.has(h.id) && canFill(h.text, vars));
  const out = [];
  while (out.length < n && pool.length) {
    // nagłówek dnia: z najważniejszej dostępnej sytuacji; kolejne losowane z wagą ważności
    let from = pool;
    if (out.length === 0) {
      const top = Math.max(...pool.map(prio));
      from = pool.filter((h) => prio(h) === top);
    }
    const h = rng.weighted(from, prio);
    out.push(h);
    // w jednym meczu jeden nagłówek na sytuację (chyba że zostały tylko takie)
    const rest = pool.filter((x) => x.id !== h.id && (x.flag === 'any' || x.flag !== h.flag));
    pool = rest.length ? rest : pool.filter((x) => x.id !== h.id);
  }
  // awaryjnie: najdawniej użyte (gdy pula się wyczerpie)
  if (out.length < n) {
    const old = history.flat().filter((id, i, a) => a.indexOf(id) === i);
    for (const id of old) {
      const h = HEADLINES.find((x) => x.id === id && x.phase === phase && canFill(x.text, vars) && !exclude.includes(x.id));
      if (h && !out.includes(h)) out.push(h);
      if (out.length >= n) break;
    }
  }
  return out.map((h) => ({ id: h.id, text: fill(h.text, vars) }));
}

/** Dopisuje id nagłówków meczu do historii i trzyma 5 ostatnich meczów. */
export function pushHeadlineHistory(history = [], ids = []) {
  return [...history, ids].slice(-HEADLINE_MEMORY);
}

// ================================================================ STUDIO PRZEDMECZOWE

/**
 * ctx: {
 *   date, competition:{type:'league'|'cup'|'uefa'|'supercup', stage, name}, userClubId,
 *   home, away: { id, name, region, parent, prestige, position, points, last5, ovr11 | strength, qsMul,
 *                 squad:[zawodnicy], formation, lineup?, tactics, coach, avg },
 *   table:{size, relegationFrom, roundsPlayed, roundsTotal, safetyPoints}, h2h:[...], derby?,
 *   weather:{type, tempC}, pitch, referee:{name, strictness, redTendency, penaltyTendency, season}, stadium:{capacity},
 *   board:{trust}, fans:{mood}, neutral, var, headlineHistory, seed
 * }
 */
export function preMatchStudio(ctx) {
  const { home, away } = ctx;
  const compType = ctx.competition?.type === 'supercup' ? 'cup' : (ctx.competition?.type || 'league');
  const stage = ctx.competition?.stage || 'main';
  const userIsHome = ctx.userClubId ? ctx.userClubId === home.id : true;
  const user = userIsHome ? home : away;
  const opp = userIsHome ? away : home;
  const rank = matchRank(ctx);
  const odds = odds1X2(home, away, { neutral: !!ctx.neutral });
  const pWin = userIsHome ? odds.home : odds.away;
  const formH = formSummary(home.last5);
  const formA = formSummary(away.last5);
  const h2h = h2hSummary(ctx.h2h, home.id, away.id, { [home.id]: home.name, [away.id]: away.name });
  const absH = absences(home.squad, compType);
  const absA = absences(away.squad, compType);
  const lineupH = predictLineup(home.squad || [], home.formation, compType);
  const lineupA = predictLineup(away.squad || [], away.formation, compType);
  const ref = refereeInfo(ctx.referee, { rankLevel: rank.level, var: ctx.var ?? true, stake: rank.tags.includes('relegation') || rank.tags.includes('title') });
  const att = attendance({ ...ctx, rankLevel: rank.level });
  const weather = weatherInfo(ctx.weather);
  const pitch = PITCH[ctx.pitch] || PITCH.dobra;
  const oppKey = keyPlayers(opp.squad, 3, compType);
  const report = assistantReport({ user: { ...user, lineup: user.lineup }, opp, comp: compType, stage });
  const exp = expectations({
    pWin, pDraw: odds.draw, rank, board: ctx.board, fans: ctx.fans, userForm: userIsHome ? formH : formA, comp: compType,
  });

  // flagi nagłówków
  const flags = [...rank.tags];
  if (odds.home >= 0.55) flags.push('favHome');
  else if (odds.away >= 0.45) flags.push('favAway');
  else flags.push('even');
  if (formH.points >= 10) flags.push('homeGoodForm');
  if (formH.points <= 3 && formH.results.length >= 4) flags.push('homeBadForm');
  if (formA.points >= 10) flags.push('awayGoodForm');
  if (formA.points <= 3 && formA.results.length >= 4) flags.push('awayBadForm');
  if (h2h.leader && h2h.played >= 3) flags.push('h2h');
  const userAbs = userIsHome ? absH : absA;
  if (userAbs.injured.filter((x) => !x.playable).length + userAbs.suspended.length >= 4) flags.push('injuryCrisis');
  if (oppKey.length) flags.push('oppStar');
  if (ref.label === 'Surowy') flags.push('strictRef');
  if (['deszcz', 'snieg', 'wiatr'].includes(ctx.weather?.type) || ctx.pitch === 'zla') flags.push('badWeather');
  if ((ctx.board?.trust ?? 60) < 30) flags.push('boardPressure');
  const vars = {
    home: home.name, away: away.name, user: user.name, opp: opp.name, comp: ctx.competition?.name ?? 'Pucharu',
    ref: ctx.referee?.name, oppStar: oppKey[0]?.name, h2hLeader: h2h.leader === home.id ? home.name : h2h.leader === away.id ? away.name : null,
  };
  const headlines = pickHeadlines('pre', flags, vars, { history: ctx.headlineHistory || [], seed: `${ctx.seed ?? 'studio'}|${home.id}|${away.id}|${ctx.date}`, n: 2 });

  const lineupView = (lu) => lu.map(({ player, slot }) => ({ id: player.id, name: nameOf(player), pos: slot.pos }));
  return {
    date: formatDate(ctx.date),
    preview: {
      rank,
      competition: ctx.competition?.name ?? null,
      home: { id: home.id, name: home.name, position: home.position ?? null, points: home.points ?? null, form: formH },
      away: { id: away.id, name: away.name, position: away.position ?? null, points: away.points ?? null, form: formA },
      h2h,
    },
    absences: { home: absH, away: absA },
    lineups: { home: lineupView(lineupH), away: lineupView(lineupA) },
    keyPlayers: { opponent: oppKey },
    suspensionRisk: { user: suspensionRisk(user.squad, compType, stage), opponent: suspensionRisk(opp.squad, compType, stage) },
    conditions: { weather, pitch: { label: pitch.label, note: pitch.note }, referee: ref, attendance: att },
    odds,
    assistant: report,
    expectations: exp,
    headlines,
    // dane dla odpraw (briefings.js) i studia pomeczowego
    forBriefing: { rank: rank.level, pWin: r3(pWin), last5: user.last5 || [], boardTrust: ctx.board?.trust ?? 60, boardExpectation: pWin >= 0.55 ? 'win' : 'any', atRisk: suspensionRisk(user.squad, compType, stage).map((x) => x.id) },
    forPost: { pWin: r3(pWin), pDraw: r3(odds.draw), rank, headlineIds: headlines.map((h) => h.id) },
  };
}

// ================================================================ STUDIO POMECZOWE

/** Zdarzenie silnika w postaci znormalizowanej. Akceptuje side 'home'/'away' albo team = id klubu. */
function normEvent(e, homeId) {
  const side = e.side ?? (e.team === 'home' || e.team === 'away' ? e.team : e.team === homeId ? 'home' : 'away');
  return { ...e, side, name: e.name ?? e.playerName ?? (e.player != null ? String(e.player) : '') };
}

const VAR_TEXT = {
  goalDisallowed: 'VAR anuluje gola',
  goalConfirmed: 'VAR potwierdza gola',
  penaltyAwarded: 'Po analizie VAR sędzia dyktuje rzut karny',
  penaltyCancelled: 'VAR odwołuje rzut karny',
  redCard: 'Po analizie VAR czerwona kartka',
  redCancelled: 'VAR zamienia czerwoną kartkę na żółtą',
};

/** Kluczowe momenty z listy zdarzeń: gole, czerwone, karne, VAR, wielkie okazje. Maks. 8, w kolejności minut. */
export function keyMoments(events, names) {
  let h = 0; let a = 0;
  const out = [];
  for (const e of events) {
    const team = names[e.side];
    const min = `${e.min}${e.added ? `+${e.added}` : ''}'`;
    if (e.type === 'goal' || e.type === 'ownGoal') {
      const scoring = e.type === 'ownGoal' ? (e.side === 'home' ? 'away' : 'home') : e.side;
      if (scoring === 'home') h++; else a++;
      const lead = h - a;
      const imp = 3 + (lead === 0 || Math.abs(lead) === 1 ? 1 : 0);
      const how = e.type === 'ownGoal' ? ' (samobójczy)' : e.penalty ? ' z rzutu karnego' : '';
      const assist = e.assistName ? `, asysta: ${e.assistName}` : '';
      out.push({ min: e.min, imp, type: 'goal', side: scoring, text: `${min} GOL! ${e.name}${how} (${names[scoring]})${assist}. ${h}:${a}` });
    } else if (e.type === 'red' || e.type === 'secondYellow') {
      out.push({ min: e.min, imp: 3, type: 'red', side: e.side, text: `${min} Czerwona kartka: ${e.name} (${team})${e.type === 'secondYellow' ? ', druga żółta' : ''}` });
    } else if (e.type === 'penMiss') {
      out.push({ min: e.min, imp: 3, type: 'penMiss', side: e.side, text: `${min} ${e.name} (${team}) nie wykorzystuje rzutu karnego` });
    } else if (e.type === 'var') {
      out.push({ min: e.min, imp: 3, type: 'var', side: e.side, text: `${min} ${VAR_TEXT[e.decision] || 'Analiza VAR'} (${team})` });
    } else if ((e.type === 'chance' || e.type === 'shot') && !e.goal && (e.xg ?? 0) >= 0.35) {
      out.push({ min: e.min, imp: 1.5 + e.xg, type: 'chance', side: e.side, text: `${min} Wielka szansa: ${e.name} (${team}) nie trafia` });
    } else if (e.type === 'post') {
      out.push({ min: e.min, imp: 1.2, type: 'post', side: e.side, text: `${min} ${e.name} (${team}) trafia w słupek` });
    } else if (e.type === 'injury' && (e.days ?? 0) >= 7) {
      out.push({ min: e.min, imp: 1.5, type: 'injury', side: e.side, text: `${min} ${e.name} (${team}) schodzi z urazem` });
    }
  }
  return out.sort((x, y) => y.imp - x.imp).slice(0, 8).sort((x, y) => x.min - y.min).map(({ imp, ...m }) => m);
}

/** Tabela po meczu: aktualizuje dwa wiersze i sortuje (punkty, różnica bramek, gole, nazwa). */
export function applyResultToTable(rows, homeId, awayId, gH, gA) {
  const next = rows.map((r) => {
    if (r.id !== homeId && r.id !== awayId) return { ...r };
    const isH = r.id === homeId;
    const f = isH ? gH : gA; const ag = isH ? gA : gH;
    const w = f > ag ? 1 : 0; const d = f === ag ? 1 : 0; const l = f < ag ? 1 : 0;
    return { ...r, p: (r.p ?? 0) + 1, w: (r.w ?? 0) + w, d: (r.d ?? 0) + d, l: (r.l ?? 0) + l, gf: (r.gf ?? 0) + f, ga: (r.ga ?? 0) + ag, pts: (r.pts ?? 0) + 3 * w + d };
  });
  next.sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || String(x.name).localeCompare(String(y.name), 'pl'));
  return next.map((r, i) => ({ ...r, pos: i + 1 }));
}

/**
 * ctx: { date, competition, userClubId, home, away (z kadrami: yc przed meczem), score:{home, away}, events:[...],
 *   stats:{home:{xg, possession, shots, ...}, away:{...}}, ratings:[{id, name, side, rating, pos}],
 *   pre: wynik preMatchStudio(...).forPost, board:{trust}, fans:{mood}, tableBefore:[...], newInjuries:[{id,name,side,days,type}],
 *   referee, headlineHistory, seed }
 */
export function postMatchStudio(ctx) {
  const { home, away } = ctx;
  const compType = ctx.competition?.type === 'supercup' ? 'cup' : (ctx.competition?.type || 'league');
  const stage = ctx.competition?.stage || 'main';
  const userIsHome = ctx.userClubId ? ctx.userClubId === home.id : true;
  const us = userIsHome ? 'home' : 'away';
  const them = userIsHome ? 'away' : 'home';
  const names = { home: home.name, away: away.name };
  const gH = ctx.score?.home ?? 0; const gA = ctx.score?.away ?? 0;
  const gU = userIsHome ? gH : gA; const gO = userIsHome ? gA : gH;
  const res = gU > gO ? 'W' : gU === gO ? 'R' : 'P';
  const events = (ctx.events || []).map((e) => normEvent(e, home.id)).sort((x, y) => x.min - y.min || (x.added ?? 0) - (y.added ?? 0));
  const rank = ctx.pre?.rank || matchRank(ctx);

  // przebieg wyniku: do przerwy, powrót, gol na wagę zwycięstwa
  let h = 0; let a = 0; let ht = null; let userTrailed = false; let decisive = null; let lastLeadChange = null;
  const goalsBy = {};
  for (const e of events) {
    if (ht === null && (e.half === 2 || (e.half == null && e.min > 45))) ht = `${h}:${a}`;
    if (e.type !== 'goal' && e.type !== 'ownGoal') continue;
    const scoring = e.type === 'ownGoal' ? (e.side === 'home' ? 'away' : 'home') : e.side;
    if (scoring === 'home') h++; else a++;
    if (e.type === 'goal') goalsBy[e.name] = (goalsBy[e.name] || 0) + 1;
    const uLead = us === 'home' ? h - a : a - h;
    if (uLead < 0) userTrailed = true;
    if (Math.abs(h - a) === 1 && ((h > a && gH > gA) || (a > h && gA > gH))) { lastLeadChange = e; }
  }
  if (ht === null) ht = `${h}:${a}`;
  if (gH !== gA) decisive = lastLeadChange;
  const scorerName = decisive?.type === 'goal' ? decisive.name : Object.entries(goalsBy).sort((x, y) => y[1] - x[1])[0]?.[0];
  const hatTrick = Object.entries(goalsBy).find(([, n]) => n >= 3)?.[0] ?? null;

  // oceny i zawodnik meczu
  const ratings = (ctx.ratings || []).map((r) => ({ ...r, side: r.side ?? (r.team === home.id ? 'home' : r.team === away.id ? 'away' : r.team) }));
  const winnerSide = gH > gA ? 'home' : gA > gH ? 'away' : null;
  const motm = ratings.slice().sort((x, y) => y.rating - x.rating || (y.side === winnerSide) - (x.side === winnerSide))[0] || null;
  const ratingsView = {
    home: ratings.filter((r) => r.side === 'home').sort((x, y) => y.rating - x.rating),
    away: ratings.filter((r) => r.side === 'away').sort((x, y) => y.rating - x.rating),
  };

  // statystyki i werdykt xG
  const st = ctx.stats || {};
  const xgU = st[us]?.xg ?? 0; const xgO = st[them]?.xg ?? 0;
  const xgd = xgU - xgO;
  let verdict = 'Wynik oddaje przebieg meczu.';
  if (res === 'P' && xgd >= 0.7) verdict = 'Byliśmy lepsi, ale zabrakło skuteczności.';
  else if (res === 'W' && xgd <= -0.7) verdict = 'Zwycięstwo szczęśliwe: rywal stworzył więcej sytuacji.';
  else if (res === 'R' && Math.abs(xgd) >= 0.8) verdict = xgd > 0 ? 'Powinniśmy wygrać ten mecz.' : 'Remis to dla nas dobry wynik.';

  // kontrowersje
  const controversies = [];
  for (const e of events) {
    if (e.type === 'var') controversies.push({ min: e.min, kind: 'var', text: `${e.min}' ${VAR_TEXT[e.decision] || 'Analiza VAR'}${e.wrong ? '. Powtórki sugerują błąd' : ''}.` });
    if (e.type === 'red' || e.type === 'secondYellow') controversies.push({ min: e.min, kind: 'red', text: `${e.min}' ${e.name} wyrzucony z boiska${e.reason === 'przemoc' ? ' za brutalny faul' : ''}.` });
    if ((e.type === 'goal' && e.penalty) || e.type === 'penMiss' || e.type === 'penalty') {
      controversies.push({ min: e.min, kind: 'penalty', text: `${e.min}' Rzut karny dla drużyny ${names[e.side]}${e.wrong ? ', decyzja mocno dyskusyjna' : ''}.` });
    }
  }

  // reakcje zarządu, kibiców i mediów (ekspert 9.7) [SZAC]
  const pts = res === 'W' ? 3 : res === 'R' ? 1 : 0;
  const pWin = ctx.pre?.pWin ?? 0.4; const pDraw = ctx.pre?.pDraw ?? 0.27;
  const expPts = 3 * pWin + pDraw;
  const derby = rank.tags?.includes('derby');
  let boardDelta = 3 * (pts - expPts);
  if (derby) boardDelta += res === 'W' ? 2 : res === 'P' ? -2 : 0;
  boardDelta = Math.round(clamp(boardDelta, -10, 10));
  const margin = gU - gO;
  let fansDelta = 4 * (pts - expPts) + (derby ? (res === 'W' ? 4 : res === 'P' ? -4 : 0) : 0) + (margin >= 3 ? 2 : margin <= -3 ? -3 : 0);
  fansDelta = Math.round(clamp(fansDelta, -15, 15));
  const boardText = boardDelta >= 4 ? 'Zarząd jest zachwycony wynikiem.' : boardDelta >= 1 ? 'Zarząd jest zadowolony.'
    : boardDelta > -2 ? 'Zarząd przyjmuje wynik bez emocji.' : boardDelta > -5 ? 'Zarząd jest rozczarowany.' : 'Zarząd jest wściekły i oczekuje wyjaśnień.';
  const fansText = fansDelta >= 5 ? 'Kibice świętują i śpiewają nazwisko trenera.' : fansDelta >= 1 ? 'Kibice są zadowoleni.'
    : fansDelta > -2 ? 'Kibice rozchodzą się bez większych emocji.' : fansDelta > -6 ? 'Z trybun słychać gwizdy.' : 'Kibice żądają zmian. Na trybunach pojawiły się obraźliwe transparenty.';
  const mediaTone = pts - expPts >= 1.5 || margin >= 3 ? 'entuzjazm' : pts - expPts >= 0.3 ? 'uznanie' : pts - expPts > -1 ? 'neutralnie' : margin <= -3 ? 'drwina' : 'krytyka';
  const MEDIA = {
    entuzjazm: 'Media rozpisują się o świetnym występie.', uznanie: 'Media chwalą zespół.', neutralnie: 'Media komentują mecz spokojnie.',
    krytyka: 'Media krytykują drużynę i trenera.', drwina: 'Media nie zostawiają na drużynie suchej nitki.',
  };

  // tabela
  let table = null;
  if (Array.isArray(ctx.tableBefore) && ctx.tableBefore.length) {
    const before = ctx.tableBefore.slice().sort((x, y) => (x.pos ?? 99) - (y.pos ?? 99));
    const posBefore = (id) => (before.find((r) => r.id === id)?.pos ?? before.findIndex((r) => r.id === id) + 1);
    const rows = applyResultToTable(ctx.tableBefore, home.id, away.id, gH, gA);
    const posAfter = (id) => rows.find((r) => r.id === id)?.pos;
    const uid = userIsHome ? home.id : away.id;
    table = { rows, user: { before: posBefore(uid), after: posAfter(uid) } };
  }

  // nowe kontuzje i pauzy
  const injuries = (ctx.newInjuries || events.filter((e) => e.type === 'injury').map((e) => ({ id: e.player, name: e.name, side: e.side, days: e.days ?? null, type: e.injuryType ?? null })))
    .map((x) => ({ ...x, team: names[x.side] ?? null, text: `${x.name}: ${x.type ? `${x.type}, ` : ''}${x.days ? `przerwa ok. ${Math.max(1, Math.round(x.days / 7))} tyg.` : 'czas przerwy nieznany'}` }));
  const suspensions = [];
  const yellowsIn = {};
  for (const e of events) {
    if (e.type === 'yellow') yellowsIn[e.player] = (yellowsIn[e.player] || 0) + 1;
    if (e.type === 'red' || e.type === 'secondYellow') {
      const games = e.reason === 'przemoc' ? 3 : e.reason === 'rażący' ? 2 : 1; // [ZAŁOŻENIE ekspert_sedzia A2]
      suspensions.push({ id: e.player, name: e.name, team: names[e.side], matches: games, reason: e.type === 'secondYellow' ? 'druga żółta kartka' : 'czerwona kartka' });
    }
  }
  for (const side of ['home', 'away']) {
    for (const p of (side === 'home' ? home.squad : away.squad) || []) {
      const y = yellowsIn[p.id];
      if (!y || suspensions.some((s) => s.id === p.id)) continue;
      const before = ycOf(p, compType);
      let crossed = false;
      for (let k = 0; k < y; k++) if (nextYellowSuspends(before + k, compType, stage)) crossed = true;
      if (crossed) suspensions.push({ id: p.id, name: nameOf(p), team: names[side], matches: (before + y) >= 12 && compType !== 'uefa' ? 2 : 1, reason: 'nadmiar żółtych kartek' });
    }
  }

  // nagłówki
  const flags = [];
  flags.push(res === 'W' ? 'userWin' : res === 'R' ? 'userDraw' : 'userLoss');
  if (margin >= 3) flags.push('bigWin');
  if (margin <= -3) flags.push('heavyLoss');
  if (gH + gA === 0) flags.push('goalless');
  if (gH + gA >= 5) flags.push('highScoring');
  if (res === 'W' && userTrailed) flags.push('comeback');
  if (decisive && decisive.min >= 85) flags.push('lateWinner');
  if (controversies.some((c) => c.kind === 'red')) flags.push('redCard');
  if (controversies.some((c) => c.kind === 'var')) flags.push('varControversy');
  if (controversies.some((c) => c.kind === 'penalty')) flags.push('penalty');
  if (hatTrick) flags.push('hatTrick');
  if (res === 'W' && pWin <= 0.25) flags.push('upsetWin');
  if (res === 'P' && pWin >= 0.6) flags.push('upsetLoss');
  if (derby && res === 'W') flags.push('derbyWin');
  if (derby && res === 'P') flags.push('derbyLoss');
  if (gO === 0) flags.push('cleanSheet');
  if (res === 'P' && xgd >= 0.7) flags.push('unluckyLoss');
  if (res === 'P' && (ctx.board?.trust ?? 60) + boardDelta < 30) flags.push('boardPressureLoss');
  if (motm && motm.rating >= 8) flags.push('motm');
  const redE = events.find((e) => e.type === 'red' || e.type === 'secondYellow');
  const comebackWinner = res === 'W' ? names[us] : null;
  const vars = {
    home: home.name, away: away.name, user: names[us], opp: names[them], score: `${gH}:${gA}`, uScore: `${gU}:${gO}`,
    scorer: scorerName, motm: motm?.name, redPlayer: redE?.name, ref: ctx.referee?.name, hatTrick, winner: comebackWinner,
  };
  const headlines = pickHeadlines('post', flags, vars, {
    history: ctx.headlineHistory || [], exclude: ctx.pre?.headlineIds || [], seed: `${ctx.seed ?? 'studio'}|${home.id}|${away.id}|${ctx.date}`, n: 3,
  });
  const matchIds = [...(ctx.pre?.headlineIds || []), ...headlines.map((x) => x.id)];

  return {
    date: formatDate(ctx.date),
    result: { home: home.name, away: away.name, score: `${gH}:${gA}`, halftime: ht, forUser: res, label: res === 'W' ? 'Zwycięstwo' : res === 'R' ? 'Remis' : 'Porażka' },
    keyMoments: keyMoments(events, names),
    motm: motm ? { id: motm.id, name: motm.name, team: names[motm.side], rating: motm.rating } : null,
    ratings: ratingsView,
    stats: { home: st.home || {}, away: st.away || {}, verdict },
    controversies,
    reactions: {
      board: { delta: boardDelta, text: boardText },
      fans: { delta: fansDelta, text: fansText },
      media: { tone: mediaTone, text: MEDIA[mediaTone] },
    },
    table,
    injuries,
    suspensions,
    headline: headlines[0] || null,
    headlines,
    headlineHistory: pushHeadlineHistory(ctx.headlineHistory || [], matchIds),
    // dane dla odprawy pomeczowej (briefings.js)
    forBriefing: {
      score: { for: gU, against: gO },
      xgFor: xgU,
      xgAgainst: xgO,
      rank: rank.level ?? 0,
      ratings: Object.fromEntries(ratings.filter((r) => r.side === us).map((r) => [r.id, r.rating])),
      press: { score: { for: gU, against: gO }, derby, controversy: controversies.length > 0, star: motm?.side === us ? motm.name : null, boardTrust: (ctx.board?.trust ?? 60) + boardDelta },
    },
  };
}
