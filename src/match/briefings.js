// Odprawy dnia meczowego: przemowa przedmeczowa, odprawa w przerwie, odprawa pomeczowa,
// rozmowy indywidualne, relacja trener-zawodnik (zaufanie) oraz uproszczona wersja dla trenerów AI.
//
// Zasady:
// - czyste funkcje: wejście to zwykłe obiekty, wynik to nowe obiekty (JSON), nic nie jest mutowane;
// - losowość tylko z ziarna (seed + faza + id zawodnika), więc ten sam stan daje tę samą odprawę;
// - gracz widzi reakcje (ikona i krótki tekst), liczby trafiają tylko do silnika (pole `engine`);
// - koszt: kilkanaście działań arytmetycznych na zawodnika, bez pętli po świecie.
// Wartości balansowe oznaczone [SZAC]. Źródło tabel: docs/ekspert_futbol.md, rozdz. 5, opis: docs/odprawy-studio.md.

import { Rng, clamp } from '../core/rng.js';
import { personalityOf } from '../career/personality.js';
import { relationWith, currentGrudge } from '../career/negotiation.js';
import { applyMorale, EVENT_DELTA, MORALE } from '../career/morale.js';
import { COACH } from '../career/coaches.js';

const AI_TALK = { best: COACH.talkBest, miss: COACH.talkMiss, fx: COACH.talkFx };

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// ================================================================ Adaptery (jedyne miejsca styku z innymi modułami)

export const PERSONAS = ['Spokojny', 'Ambitny', 'Wrażliwy', 'Lider', 'Narwaniec'];

/**
 * Adapter osobowości. Jedyne miejsce, które czyta src/career/personality.js.
 * Zwraca: persona (etykieta z ekspert_futbol.md 1.2), ukryte PRF/WAZ/TMP, LID oraz cechy charakteru 1-20
 * (ego, temper, professionalism, ambition, patience) z personality.js. Brakujące pola mają wartość 10.
 */
export function traitsOf(p) {
  const h = p.hidden || {};
  let t = p.traits;
  if (!t && p.id != null && p.persona) {
    try { t = personalityOf(p).traits; } catch { t = null; }
  }
  t = t || {};
  return {
    persona: PERSONAS.includes(p.persona) ? p.persona : 'Spokojny',
    prf: h.PRF ?? 10,
    waz: h.WAZ ?? 10,
    tmp: h.TMP ?? 10,
    lid: p.attr?.LID ?? h.LID ?? 10,
    ego: t.ego ?? 10,
    temper: t.temper ?? h.TMP ?? 10,
    professionalism: t.professionalism ?? h.PRF ?? 10,
    ambition: t.ambition ?? 10,
    patience: t.patience ?? 10,
  };
}

/**
 * Zaufanie trener-zawodnik: JEDNO pole wspólne z negocjacjami, `player.relations[clubId].trust`
 * (skala 0-100, 50 neutralnie, src/career/negotiation.js relationWith). Odprawy widzą je w skali -10..+10:
 * trustOdpraw = (trust - 50) / 5. Zmiana o 1 w skali odpraw = 5 punktów zaufania relacji.
 * W tej samej relacji odprawy dopisują `briefMem` (pamięć zdarzeń, nie drugie zaufanie) i, przy urazie,
 * `grudge` (ta sama uraza, którą czytają negocjacje; wygasa o połowę co 90 dni).
 */
export const TRUST_MIN = -10;
export const TRUST_MAX = 10;
export const TRUST_SCALE = 5; // [SZAC]
const GRUDGE_PER_POINT = 2; // uraza (skala negocjacji) za 1 pkt utraconego zaufania przy urazie [SZAC]
const clubOf = (p, clubId) => clubId ?? p.clubId ?? 'klub';
export function getTrust(p, clubId) {
  const rel = relationWith(p, clubOf(p, clubId));
  return clamp((rel.trust - 50) / TRUST_SCALE, TRUST_MIN, TRUST_MAX);
}

function avgForm(p) {
  if (Array.isArray(p.form) && p.form.length) return p.form.reduce((s, v) => s + v, 0) / p.form.length;
  return typeof p.form === 'number' ? p.form : 6.6;
}
const moraleOf = (p) => p.morale ?? MORALE.START;

// ================================================================ Przemowy do drużyny (tabela 5.2)

export const TONES = {
  calm: { label: 'Spokój', quote: '„Trzymamy plan. Róbcie swoje, a wynik przyjdzie.”' },
  praise: { label: 'Pochwała', quote: '„Jestem z was dumny. Tak trzymać.”' },
  demand: { label: 'Wymagam więcej', quote: '„Stać was na dużo więcej. Chcę to zobaczyć na boisku.”' },
  shout: { label: 'Krzyk', quote: '„Co to ma być?! W tym klubie tak się nie gra!”' },
  noPressure: { label: 'Bez presji', quote: '„Nie macie nic do stracenia. Wyjdźcie i cieszcie się grą.”' },
  defend: { label: 'Skupienie na obronie', quote: '„Najpierw zero z tyłu. Każdy pilnuje swojego.”' },
};
export const TONE_KEYS = Object.keys(TONES);

// Bazowy efekt Z: [prowadzimy, remis, przegrywamy]. noPressure przy stracie 2+ goli: +3 (osobno).
const BASE = {
  calm: [2, 2, 0],
  praise: [4, 1, -2],
  demand: [1, 4, 4],
  shout: [-2, 2, 6],
  noPressure: [-1, 1, 1.5], // [SZAC] przy stracie 1 gola; 2+ goli: 3 (tabela 5.2)
  defend: [3, 1, -2],
};

const PERSONA_MOD = {
  calm: { Wrażliwy: 2, Narwaniec: -1 },
  praise: { Ambitny: -1, Wrażliwy: 2 },
  demand: { Ambitny: 2, Wrażliwy: -3 },
  shout: { Narwaniec: 2, Wrażliwy: -5, Lider: 1 },
  noPressure: {},
  defend: { Spokojny: 1 },
};

// Premia za rangę meczu do efektów pozytywnych: 0 liga, 1 puchar, 2 derby/UEFA/o tytuł/o utrzymanie, 3 finał. [SZAC]
export const RANK_BONUS = [0, 0.5, 2, 2.5];

// Kontekst przedmeczowy (rozszerzenie tabeli 5.2) [SZAC]
const PRE_CTX = {
  favourite: { praise: -1, noPressure: -2, demand: 1 },
  underdog: { noPressure: 2, demand: -1, shout: -1, defend: 1 },
  crisis: { shout: 2, praise: -2, calm: 1, demand: 1 },
  goodRun: { praise: 1, shout: -1 },
  highStakes: { demand: 1, calm: -1, noPressure: -1 },
};

// Sytuacja w przerwie (wynik kontra xG) [SZAC]
const HALF_CTX = {
  pechowo: { praise: 5, calm: 2, demand: -2, shout: -5 },
  zdominowani: { shout: 1, demand: 1, praise: -2, calm: -1, defend: 1 },
  szczesliwePrzod: { praise: -2, demand: 2, defend: 1 },
  pewnePrzod: { praise: 1, calm: 1, shout: -3 },
  wyrownany: {},
};

export const HALF_SITUATIONS = {
  pechowo: 'Gramy lepiej, ale wynik tego nie pokazuje',
  zdominowani: 'Rywal przeważa i stwarza więcej sytuacji',
  szczesliwePrzod: 'Prowadzimy, choć rywal gra lepiej',
  pewnePrzod: 'Prowadzimy i kontrolujemy mecz',
  wyrownany: 'Mecz jest wyrównany',
};

const REPEAT_MUL = 0.8; // za każde powtórzenie w pamięci 3 meczów [SZAC, tabela 5.2]
const NOISE_SD = 1.5; // Z_final = Z + gauss()*1.5

/** Ocena sytuacji przed meczem. ctx: { rank, pWin, last5:['W','R','P'] lub ['W','D','L'], boardExpectation, boardTrust } */
export function preSituation(ctx = {}) {
  const last5 = (ctx.last5 || []).map((x) => ({ W: 'W', D: 'R', R: 'R', L: 'P', P: 'P' }[x] || x));
  const pts = last5.reduce((s, x) => s + (x === 'W' ? 3 : x === 'R' ? 1 : 0), 0);
  const lastTwo = last5.slice(-2);
  const flags = [];
  const pWin = ctx.pWin ?? 0.4;
  if (pWin >= 0.55) flags.push('favourite');
  if (pWin <= 0.25) flags.push('underdog');
  if ((lastTwo.length === 2 && lastTwo.every((x) => x === 'P')) || (last5.length >= 4 && pts <= 3)) flags.push('crisis');
  else if (last5.length >= 3 && pts >= 10) flags.push('goodRun');
  if (ctx.boardExpectation === 'win' || (ctx.boardTrust ?? 60) < 30) flags.push('highStakes');
  return { phase: 'pre', stateIdx: 1, behindBy: 0, rank: ctx.rank ?? 0, flags, pWin, clubId: ctx.clubId };
}

/** Ocena sytuacji w przerwie. ctx: { score:{for, against}, xgFor, xgAgainst, possession, momentum (-100..100, z naszej strony), rank } */
export function halfSituation(ctx = {}) {
  const gf = ctx.score?.for ?? 0;
  const ga = ctx.score?.against ?? 0;
  const diff = gf - ga;
  const xgd = (ctx.xgFor ?? 0) - (ctx.xgAgainst ?? 0);
  let key = 'wyrownany';
  if ((diff < 0 && xgd >= 0.5) || (diff === 0 && xgd >= 0.8)) key = 'pechowo';
  else if (diff <= 0 && xgd <= -0.6) key = 'zdominowani';
  else if (diff > 0 && xgd <= -0.5) key = 'szczesliwePrzod';
  else if (diff > 0 && xgd >= 0.5) key = 'pewnePrzod';
  return {
    phase: 'half',
    stateIdx: diff > 0 ? 0 : diff === 0 ? 1 : 2,
    behindBy: Math.max(0, -diff),
    diff,
    xgd: r2(xgd),
    key,
    label: HALF_SITUATIONS[key],
    momentum: ctx.momentum ?? 0,
    possession: ctx.possession ?? 50,
    rank: ctx.rank ?? 0,
    flags: [],
    pWin: ctx.pWin ?? 0.4,
    clubId: ctx.clubId,
  };
}

// ---------------------------------------------------------------- pamięć powtórzeń
/** Pamięć przemów: last = tony z 3 ostatnich meczów, current = tony z bieżącego meczu. */
export function newSpeechMemory() {
  return { last: [], current: [] };
}
function repeatCount(memory, tone) {
  if (!memory) return 0;
  let n = 0;
  for (const m of memory.last || []) if (m.includes(tone)) n++;
  if ((memory.current || []).includes(tone)) n++;
  return n;
}
function remember(memory, tone) {
  const m = memory || newSpeechMemory();
  return { last: (m.last || []).slice(-3), current: [...(m.current || []), tone] };
}
/** Po meczu: tony bieżącego meczu przechodzą do pamięci (ostatnie 3 mecze). */
export function closeMatchMemory(memory) {
  const m = memory || newSpeechMemory();
  return { last: [...(m.last || []), [...(m.current || [])]].slice(-3), current: [] };
}

// ---------------------------------------------------------------- rdzeń: efekt przemowy na jednego zawodnika
/**
 * Efekt przemowy do drużyny na jednego zawodnika (bez szumu). sit: z preSituation albo halfSituation.
 * Zwraca { pos, neg, nerves, cardMul, backfire, trustDelta }; z = pos + neg (+ szum osobno).
 */
function speechParts(p, tone, sit, memory, rating) {
  const tr = traitsOf(p);
  const parts = [];
  // 1. tabela bazowa
  let base = BASE[tone][sit.stateIdx];
  if (tone === 'noPressure' && sit.behindBy >= 2) base = 3;
  parts.push(base);
  parts.push(PERSONA_MOD[tone][tr.persona] || 0);
  if (tone === 'noPressure' && (sit.pWin ?? 0.4) <= 0.25) parts.push(sit.phase === 'pre' ? 0 : 2); // wobec faworyta rywala
  // 2. kontekst fazy
  if (sit.phase === 'pre') for (const f of sit.flags) parts.push(PRE_CTX[f]?.[tone] || 0);
  if (sit.phase === 'half') {
    parts.push(HALF_CTX[sit.key]?.[tone] || 0);
    if (sit.momentum <= -30) parts.push({ calm: 1, defend: 1 }[tone] || 0);
    if (sit.momentum >= 30) parts.push({ praise: 1, demand: 0.5 }[tone] || 0);
  }
  // 3. cechy indywidualne [SZAC]
  const form = avgForm(p);
  const mor = moraleOf(p);
  if (mor <= 7) parts.push({ shout: -2, demand: -1, praise: 1, calm: 1, noPressure: 1 }[tone] || 0);
  if (mor >= 16) parts.push({ praise: -0.5, demand: 0.5 }[tone] || 0);
  if (form >= 7.0) parts.push({ shout: -1, praise: 0.5 }[tone] || 0);
  if (form <= 6.3) parts.push({ demand: tr.professionalism >= 12 ? 1 : 0, praise: -0.5 }[tone] || 0);
  if (tone === 'shout') parts.push(0.08 * (tr.temper - 10) - 0.08 * (tr.ego - 10));
  if (tone === 'demand') parts.push(0.08 * (tr.professionalism - 10) + 0.06 * (tr.ambition - 10) - 0.06 * (tr.ego - 10));
  if (tone === 'praise') parts.push(0.05 * (tr.ego - 10));
  if (tone === 'calm' || tone === 'defend') parts.push(0.05 * (tr.patience - 10));
  // ocena z pierwszej połowy
  if (rating != null) {
    if ((tone === 'shout' || tone === 'demand') && rating >= 7.2) parts.push(tr.persona === 'Wrażliwy' ? -3 : -2);
    if (tone === 'demand' && rating <= 6.0 && (tr.persona === 'Ambitny' || tr.persona === 'Lider' || tr.prf >= 13)) parts.push(1);
    if (tone === 'praise' && rating >= 7.0) parts.push(1);
    if (tone === 'praise' && rating <= 5.8 && tr.persona === 'Ambitny') parts.push(-1);
  }
  // 4. ranga meczu: premia do efektów pozytywnych; presja dla Wrażliwych (chyba że WAZ >= 14)
  let pos = 0;
  let neg = 0;
  for (const v of parts) { if (v > 0) pos += v; else neg += v; }
  const rank = sit.rank ?? 0;
  if (rank >= 1) {
    if (tr.persona === 'Wrażliwy' && rank >= 2 && tr.waz < 14) neg -= 2;
    else if (pos > 0) pos += RANK_BONUS[rank] + (rank >= 2 ? 0.1 * (tr.waz - 10) : 0);
  }
  // 5. zaufanie mnoży część pozytywną; niskie zaufanie buntuje przy krzyku i wymaganiach
  const trust = getTrust(p, sit.clubId);
  pos *= 1 + 0.04 * trust;
  if (trust <= -4 && (tone === 'shout' || tone === 'demand')) neg -= 2;
  // 6. pamięć powtórzeń
  const reps = repeatCount(memory, tone);
  pos *= REPEAT_MUL ** reps;
  // 7. krzyk, który obraca się przeciwko trenerowi
  let backfire = false;
  if (tone === 'shout') {
    const badMoment = sit.stateIdx === 0 || sit.key === 'pechowo' || sit.key === 'pewnePrzod';
    const overuse = reps >= 2;
    if (badMoment || overuse || trust <= -4) {
      backfire = true;
      neg -= 1;
    }
  }
  // efekty uboczne
  let nerves = 0;
  let cardMul = 1;
  if (rank >= 2 && tr.persona === 'Wrażliwy' && tr.waz < 14) nerves++;
  if (tone === 'shout' && tr.persona === 'Wrażliwy') nerves++;
  if (tone === 'calm') nerves = Math.max(0, nerves - 1);
  if (tone === 'shout' && (tr.persona === 'Narwaniec' || tr.tmp >= 14 || tr.temper >= 15)) cardMul = 1.3;
  if (tone === 'demand' && tr.persona === 'Narwaniec') cardMul = 1.1;
  const trustDelta = backfire ? -0.5 : 0;
  return { pos, neg, nerves, cardMul, backfire, trustDelta, reps };
}

// ---------------------------------------------------------------- reakcje widoczne dla gracza
export const REACTIONS = {
  zmotywowany: { label: 'Zmotywowany', icon: 'fire' },
  spokojny: { label: 'Spokojny', icon: 'calm' },
  obojetny: { label: 'Obojętny', icon: 'neutral' },
  zdenerwowany: { label: 'Zdenerwowany', icon: 'nervous' },
  urazony: { label: 'Urażony', icon: 'hurt' },
};

const REACTION_TEXT = {
  zmotywowany: ['Zaciska pięści i kiwa głową.', 'Wstaje pierwszy, gotowy do gry.', 'W jego oczach widać ogień.', 'Klepie kolegów po plecach i dopinguje.'],
  spokojny: ['Słucha uważnie i wygląda na skupionego.', 'Spokojnie poprawia ochraniacze.', 'Kiwa głową bez słowa.', 'Oddycha głęboko i koncentruje się.'],
  obojetny: ['Wzrusza ramionami.', 'Słucha jednym uchem.', 'Patrzy w telefon, zanim go odłoży.', 'Nie widać po nim żadnej reakcji.'],
  zdenerwowany: ['Nerwowo poprawia getry.', 'Unika wzroku, wyraźnie się spiął.', 'Chodzi po szatni w tę i z powrotem.', 'Kręci się na ławce i przygryza wargę.'],
  urazony: ['Odwraca się z grymasem.', 'Mruczy coś pod nosem.', 'Trzaska drzwiczkami szafki.', 'Patrzy na trenera z wyrzutem.'],
};

export function classifyReaction(z, trustDelta = 0, nerves = 0) {
  if (trustDelta <= -1 || z <= -3) return 'urazony';
  if (nerves >= 2 || z < -1) return 'zdenerwowany';
  if (z >= 3) return 'zmotywowany';
  if (z >= 1) return 'spokojny';
  if (nerves >= 1) return 'zdenerwowany';
  return 'obojetny';
}

function reactionView(kind, rng, extra) {
  const list = REACTION_TEXT[kind];
  return { reaction: kind, label: REACTIONS[kind].label, icon: REACTIONS[kind].icon, text: extra || list[Math.floor(rng.next() * list.length)] };
}

// ================================================================ Rozmowy indywidualne

export const MAX_TALKS = 3;

export const TALKS = {
  encourage: { label: 'Podbuduj', quote: '„Wierzę w ciebie. Dziś jest twój dzień.”', phases: ['pre', 'half'] },
  demand: { label: 'Wymagaj', quote: '„Oczekuję od ciebie więcej.”', phases: ['pre', 'half'] },
  calm: { label: 'Uspokój', quote: '„Spokojnie, rób swoje. Nikt nie wymaga cudów.”', phases: ['pre', 'half'] },
  freedom: { label: 'Daj wolną rękę', quote: '„Graj po swojemu, ufam twoim decyzjom.”', phases: ['pre', 'half'] },
  cardWarning: { label: 'Ostrzeż przed kartką', quote: '„Uważaj na kartki, potrzebuję cię na boisku.”', phases: ['pre', 'half'] },
  praise: { label: 'Pochwal', quote: '„Świetna robota. Tak dalej.”', phases: ['half', 'post'] },
  criticize: { label: 'Skrytykuj', quote: '„To było za mało. Wiesz o tym.”', phases: ['half', 'post'] },
};

// Odpowiedzi zawodnika na rozmowę indywidualną (cytat zależny od reakcji). Bez liczb.
const TALK_REPLY = {
  zmotywowany: ['„Nie zawiodę, trenerze.”', '„Zobaczy pan, co potrafię.”', '„Dam z siebie wszystko.”'],
  spokojny: ['„Jasne, trenerze.”', '„Rozumiem. Zrobię swoje.”', '„Dobrze, skupiam się.”'],
  obojetny: ['„Mhm.”', '„Okej.”', '„Jak pan uważa.”'],
  zdenerwowany: ['„Wiem, wiem…”', '„Postaram się, ale to nie jest łatwe.”', '„Dobrze, tylko proszę nie dokładać presji.”'],
  urazony: ['„Serio? To nie moja wina.”', '„Nie zgadzam się z panem.”', '„Zapamiętam to.”'],
};

/** Efekt rozmowy indywidualnej (bez szumu). ctx: { phase, rank, rating, atRisk, onYellow } */
function talkParts(p, kind, ctx) {
  const tr = traitsOf(p);
  const form = avgForm(p);
  const mor = moraleOf(p);
  const trust = getTrust(p, ctx.clubId);
  const rating = ctx.rating;
  const goodGame = rating != null ? rating >= 6.8 : form >= 7.0;
  const badGame = rating != null ? rating <= 6.2 : form <= 6.3;
  let z = 0;
  let trustDelta = 0;
  let cardMul = 1;
  let nervesSet = null;
  switch (kind) {
    case 'encourage':
      z = 2 + ({ Ambitny: -1, Wrażliwy: 2 }[tr.persona] || 0);
      if (badGame || mor <= 8) z += 1.5;
      if (goodGame) z -= 1;
      break;
    case 'demand':
      z = 2 + ({ Ambitny: 2, Wrażliwy: -3, Lider: 1, Narwaniec: 1 }[tr.persona] || 0);
      if (badGame && tr.professionalism >= 12) z += 1;
      if (goodGame) { z -= 3; trustDelta -= 1; }
      z -= 0.06 * (tr.ego - 10);
      if (tr.persona === 'Narwaniec') cardMul = 1.1;
      break;
    case 'calm':
      z = 1 + ({ Wrażliwy: 2, Narwaniec: 1, Ambitny: -1 }[tr.persona] || 0);
      if ((ctx.rank ?? 0) >= 2) z += 1;
      nervesSet = 0;
      if (tr.persona === 'Narwaniec' || tr.tmp >= 13) cardMul = 0.8;
      break;
    case 'freedom':
      z = 1 + ({ Lider: 2, Ambitny: 2, Wrażliwy: -1, Narwaniec: -1, Spokojny: 1 }[tr.persona] || 0);
      if (trust < 0) z -= 1;
      if (goodGame) z += 1;
      if (tr.persona === 'Narwaniec') cardMul = 1.1;
      break;
    case 'cardWarning': {
      const relevant = ctx.atRisk || ctx.onYellow || tr.tmp >= 13 || tr.persona === 'Narwaniec';
      if (!relevant) { z = -1; break; } // zbędna uwaga
      if (tr.persona === 'Narwaniec' && trust < 0) { z = -2; trustDelta -= 1; cardMul = 1.1; break; }
      z = -0.5;
      cardMul = ctx.onYellow ? 0.6 : tr.persona === 'Narwaniec' ? 0.8 : 0.7;
      break;
    }
    case 'praise':
      if (rating != null && rating <= 6.0) { z = tr.persona === 'Ambitny' ? -1 : 0; break; } // nieszczera pochwała
      z = 2 + ({ Wrażliwy: 2 }[tr.persona] || 0) + (tr.persona === 'Ambitny' ? (goodGame ? 1 : -1) : 0);
      break;
    case 'criticize':
      if (badGame) {
        z = { Ambitny: 2, Lider: 1, Spokojny: 1, Wrażliwy: -4, Narwaniec: 1 }[tr.persona] ?? 0;
        if (tr.persona === 'Narwaniec') cardMul = 1.15;
        if (tr.persona === 'Wrażliwy') trustDelta -= 1;
      } else if (goodGame) {
        z = tr.persona === 'Wrażliwy' ? -4 : -2;
        trustDelta -= 1.5;
      } else {
        z = tr.persona === 'Wrażliwy' ? -2 : 0;
        trustDelta -= 0.5;
      }
      z -= 0.06 * (tr.ego - 10);
      break;
    default:
      throw new RangeError(`Nieznana rozmowa: ${kind}`);
  }
  // zaufanie wzmacnia albo osłabia pozytywny efekt rozmowy w cztery oczy
  if (z > 0) z *= 1 + 0.05 * trust;
  return { z, trustDelta, cardMul, nervesSet };
}

function validateTalks(talks, phase, players) {
  if (talks.length > MAX_TALKS) throw new RangeError(`Maksymalnie ${MAX_TALKS} rozmowy indywidualne`);
  const seen = new Set();
  for (const t of talks) {
    if (seen.has(t.id)) throw new RangeError('Z jednym zawodnikiem można porozmawiać tylko raz');
    seen.add(t.id);
    if (!TALKS[t.kind] || !TALKS[t.kind].phases.includes(phase)) throw new RangeError(`Rozmowa ${t.kind} niedostępna w tej fazie`);
    if (!players.some((p) => p.id === t.id)) throw new RangeError(`Brak zawodnika ${t.id}`);
  }
}

const rngFor = (seed, phase, id) => new Rng(`${seed}|${phase}|${id}`);

/** Wspólna ścieżka odprawy przed meczem i w przerwie. */
function runBriefing(phase, { players, tone, talks = [], memory, seed = 'odprawa', ratings = {}, sit, cardInfo = {}, rel = {} }) {
  if (!TONES[tone]) throw new RangeError(`Nieznana przemowa: ${tone}`);
  validateTalks(talks, phase, players);
  const talkById = Object.fromEntries(talks.map((t) => [t.id, t.kind]));
  const out = [];
  const engine = { zStart: {}, cardRisk: {}, nerves: {}, defBonus: null };
  const relations = {};
  let backfire = false;
  for (const p of players) {
    const rng = rngFor(seed, phase, p.id);
    const sp = speechParts(p, tone, sit, memory, ratings[p.id]);
    const noise = rng.gauss(0, NOISE_SD);
    const zSpeech = sp.pos + sp.neg + noise;
    let trustDelta = sp.trustDelta;
    let nerves = sp.nerves;
    let cardMul = sp.cardMul;
    if (sp.backfire) backfire = true;
    const speechKind = classifyReaction(zSpeech, sp.trustDelta, sp.nerves);
    if (speechKind === 'urazony') trustDelta -= 0.5;
    if (speechKind === 'zmotywowany') trustDelta += 0.2;
    const row = { id: p.id, name: p.name, ...reactionView(speechKind, rng) };
    let z = zSpeech;
    const kind = talkById[p.id];
    if (kind) {
      const tp = talkParts(p, kind, {
        phase, rank: sit.rank, clubId: rel.clubId, rating: ratings[p.id], atRisk: cardInfo.atRisk?.includes(p.id), onYellow: cardInfo.onYellow?.includes(p.id),
      });
      const tz = tp.z + rng.gauss(0, 0.7);
      z += tz;
      cardMul *= tp.cardMul;
      if (tp.nervesSet != null) nerves = tp.nervesSet;
      const tk = classifyReaction(tz, tp.trustDelta, kind === 'calm' ? 0 : nerves);
      let td = tp.trustDelta;
      if (tk === 'zmotywowany' || tk === 'spokojny') td += 0.5;
      if (tk === 'urazony') td -= traitsOf(p).persona === 'Wrażliwy' ? 1 : 0.5;
      trustDelta += td;
      const replies = TALK_REPLY[tk];
      row.talk = { kind, talkLabel: TALKS[kind].label, ...reactionView(tk, rng), quote: replies[Math.floor(rng.next() * replies.length)] };
    }
    z = r1(clamp(z, -10, 10));
    nerves = clamp(nerves, 0, 3);
    cardMul = r2(cardMul);
    out.push(row);
    engine.zStart[p.id] = z;
    if (cardMul !== 1) engine.cardRisk[p.id] = { mul: cardMul, untilMin: phase === 'pre' ? 60 : 75 };
    if (nerves > 0) engine.nerves[p.id] = nerves;
    if (trustDelta !== 0) relations[p.id] = applyTrust(p, trustDelta, `${phase}:${kind || tone}`, rel);
  }
  if (tone === 'defend' && sit.stateIdx === 0) engine.defBonus = { D: 0.1, minutes: 15 };
  const counts = {};
  for (const k of Object.keys(REACTIONS)) counts[k] = 0;
  for (const r of out) counts[r.reaction]++;
  return {
    phase,
    tone,
    toneLabel: TONES[tone].label,
    quote: TONES[tone].quote,
    players: out,
    team: { counts, summary: teamSummary(counts, out.length), backfire, backfireText: backfire ? BACKFIRE_TEXT : null },
    relations,
    clubId: rel.clubId ?? null,
    memory: remember(memory, tone),
    engine,
  };
}

const BACKFIRE_TEXT = 'Krzyk obrócił się przeciwko tobie: zawodnicy uznali, że to nie oni zawinili.';

function teamSummary(counts, n) {
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!n) return 'Brak zawodników.';
  const share = top[1] / n;
  const lead = share >= 0.6 ? 'Większość drużyny' : share >= 0.4 ? 'Spora część drużyny' : 'Drużyna jest podzielona; największa grupa';
  const word = { zmotywowany: 'jest zmotywowana', spokojny: 'jest spokojna', obojetny: 'reaguje obojętnie', zdenerwowany: 'jest zdenerwowana', urazony: 'czuje się urażona' }[top[0]];
  return `${lead} ${word}.`;
}

// ================================================================ API: odprawa przedmeczowa

/**
 * Odprawa przedmeczowa.
 * args: { players:[zawodnicy z kadry meczowej], tone, talks:[{id, kind}] (maks. 3), memory,
 *         ctx:{ rank, pWin, last5, boardExpectation, boardTrust, atRisk:[id], }, seed }
 * Zwraca widok dla gracza (reakcje bez liczb) i `engine` (Z na start, ryzyko kartek, nerwowość, premia obrony).
 */
export function preMatchBriefing({ players, tone, talks = [], memory, ctx = {}, seed }) {
  const sit = preSituation(ctx);
  return runBriefing('pre', {
    players, tone, talks, memory, seed, sit, cardInfo: { atRisk: ctx.atRisk || [] }, rel: { clubId: ctx.clubId, date: ctx.date },
  });
}

// ================================================================ API: odprawa w przerwie

/**
 * Odprawa w przerwie. Z z przemowy ustawia nowy poziom zaangażowania (ekspert 5.1).
 * ctx: { score:{for, against}, xgFor, xgAgainst, possession, momentum, ratings:{id:ocena}, onYellow:[id], rank, pWin }
 */
export function halftimeBriefing({ players, tone, talks = [], memory, ctx = {}, seed }) {
  const sit = halfSituation(ctx);
  const res = runBriefing('half', {
    players, tone, talks, memory, seed, sit, ratings: ctx.ratings || {}, cardInfo: { onYellow: ctx.onYellow || [], atRisk: ctx.atRisk || [] },
    rel: { clubId: ctx.clubId, date: ctx.date },
  });
  res.situation = { key: sit.key, label: sit.label };
  return res;
}

// ================================================================ Asystent: podpowiedź przemowy i rozmów

/** Oczekiwany średni efekt przemowy (bez szumu) dla listy zawodników. */
export function expectedTeamZ(players, tone, sit, memory, ratings = {}) {
  if (!players.length) return 0;
  let s = 0;
  for (const p of players) {
    const sp = speechParts(p, tone, sit, memory, ratings[p.id]);
    s += sp.pos + sp.neg;
  }
  return s / players.length;
}

const ADVICE_REASON = {
  calm: 'Drużyna potrzebuje spokoju i trzymania planu.',
  praise: 'Zawodnicy grają dobrze; pochwała doda im pewności.',
  demand: 'Stać ich na więcej; jasne wymagania powinny zadziałać.',
  shout: 'Potrzebny jest wstrząs, ale uważaj na wrażliwych.',
  noPressure: 'Zdejmij z nich ciężar; nie mają nic do stracenia.',
  defend: 'Najważniejsze teraz to nie stracić gola.',
};

/**
 * Podpowiedź asystenta. phase 'pre' albo 'half'. Liczy oczekiwany efekt wszystkich 6 przemów na tych samych
 * zawodnikach i wskazuje najlepszą; dorzuca maks. 3 propozycje rozmów indywidualnych.
 */
export function assistantAdvice(phase, players, ctx = {}, memory) {
  const sit = phase === 'pre' ? preSituation(ctx) : halfSituation(ctx);
  const ratings = ctx.ratings || {};
  const scored = TONE_KEYS.map((t) => ({ tone: t, v: expectedTeamZ(players, t, sit, memory, ratings) }))
    .sort((a, b) => b.v - a.v);
  const best = scored[0].tone;
  const avoid = scored[scored.length - 1].tone;
  const lines = [];
  if (phase === 'half') lines.push(sit.label + '.');
  lines.push(ADVICE_REASON[best]);
  if (repeatCount(memory, best) >= 1) lines.push('Używałeś jej niedawno, więc zadziała słabiej.');
  const sensitive = players.filter((p) => traitsOf(p).persona === 'Wrażliwy').length;
  if (best === 'shout' && sensitive) lines.push('Kilku zawodników źle znosi krzyk.');
  // propozycje rozmów
  const suggestions = [];
  const onYellow = new Set(ctx.onYellow || []);
  const atRisk = new Set(ctx.atRisk || []);
  for (const p of players) {
    const tr = traitsOf(p);
    const r = ratings[p.id];
    if ((onYellow.has(p.id) || atRisk.has(p.id)) && (tr.persona === 'Narwaniec' || tr.tmp >= 13)) {
      suggestions.push({ id: p.id, kind: 'cardWarning', weight: 3, reason: `${p.name ?? p.id} gra na krawędzi kartki.` });
    } else if (r != null && r <= 6.0 && tr.persona === 'Wrażliwy') {
      suggestions.push({ id: p.id, kind: 'encourage', weight: 2.5, reason: `${p.name ?? p.id} słabo wszedł w mecz i potrzebuje wsparcia.` });
    } else if (r != null && r <= 6.0 && (tr.persona === 'Ambitny' || tr.persona === 'Lider')) {
      suggestions.push({ id: p.id, kind: 'demand', weight: 2, reason: `${p.name ?? p.id} zareaguje na wymagania.` });
    } else if (r != null && r >= 7.3) {
      suggestions.push({ id: p.id, kind: 'praise', weight: 1.5, reason: `${p.name ?? p.id} jest najlepszy na boisku.` });
    } else if (phase === 'pre' && (sit.rank ?? 0) >= 2 && tr.persona === 'Wrażliwy' && tr.waz < 14) {
      suggestions.push({ id: p.id, kind: 'calm', weight: 2, reason: `${p.name ?? p.id} może nie udźwignąć presji tego meczu.` });
    } else if (phase === 'pre' && moraleOf(p) <= 8) {
      suggestions.push({ id: p.id, kind: 'encourage', weight: 1.8, reason: `${p.name ?? p.id} ma niskie morale.` });
    }
  }
  suggestions.sort((a, b) => b.weight - a.weight);
  return {
    tone: best,
    toneLabel: TONES[best].label,
    avoid,
    avoidLabel: TONES[avoid].label,
    text: lines.join(' '),
    talks: suggestions.slice(0, MAX_TALKS).map(({ weight, ...s }) => s),
  };
}

// ================================================================ API: odprawa pomeczowa

export const POST_TONES = {
  praise: { label: 'Pochwała', quote: '„Dziękuję za ten mecz. Tak się gra.”' },
  criticize: { label: 'Krytyka', quote: '„Nie tak się umawialiśmy. To było za mało.”' },
  neutral: { label: 'Neutralnie', quote: '„Przeanalizujemy to na spokojnie.”' },
  focusNext: { label: 'Skupienie na kolejnym meczu', quote: '„Zamykamy temat. Od jutra myślimy o następnym rywalu.”' },
};

// Morale (skala 1-20) na najbliższy tydzień: [wygrana, remis, porażka] [SZAC]
const POST_BASE = {
  praise: [1.0, 0.5, -0.5],
  criticize: [-1.0, -0.3, 0.3],
  neutral: [0, 0, 0],
  focusNext: [0.3, 0.3, 0.6],
};
const POST_PERSONA = {
  praise: { Wrażliwy: 0.5 },
  criticize: { Wrażliwy: -1, Ambitny: 0.5, Lider: 0.3, Narwaniec: -0.3 },
  neutral: {},
  focusNext: { Spokojny: 0.2, Lider: 0.2 },
};

/**
 * Odprawa pomeczowa. ctx: { score:{for, against}, xgFor, xgAgainst, ratings:{id}, rank, clubId, date }
 * talks: [{id, kind:'praise'|'criticize'}] maks. 3.
 * Zwraca reakcje, `morale` ({delta, value} przez morale.js applyMorale; działa na najbliższy tydzień, potem
 * wraca dryfem weeklyDrift), nowe relacje (zaufanie wspólne z negocjacjami) i konflikty.
 */
export function postMatchBriefing({ players, tone, talks = [], memory, ctx = {}, seed = 'po-meczu' }) {
  if (!POST_TONES[tone]) throw new RangeError(`Nieznana przemowa pomeczowa: ${tone}`);
  validateTalks(talks, 'post', players);
  const gf = ctx.score?.for ?? 0;
  const ga = ctx.score?.against ?? 0;
  const res = gf > ga ? 0 : gf === ga ? 1 : 2;
  const xgd = (ctx.xgFor ?? 0) - (ctx.xgAgainst ?? 0);
  const playedWell = xgd >= 0.5;
  const playedBadly = xgd <= -0.5;
  const rank = ctx.rank ?? 0;
  const rankMul = rank >= 2 ? 1.5 : 1; // derby i wielkie mecze: emocje mocniejsze [SZAC]
  const ratings = ctx.ratings || {};
  const memKey = `post:${tone}`;
  const reps = repeatCount(memory, memKey);
  const talkById = Object.fromEntries(talks.map((t) => [t.id, t.kind]));
  const out = [];
  const morale = {};
  const relations = {};
  const rel = { clubId: ctx.clubId, date: ctx.date };
  const conflicts = [];
  for (const p of players) {
    const tr = traitsOf(p);
    const rng = rngFor(seed, 'post', p.id);
    const r = ratings[p.id];
    let m = POST_BASE[tone][res] + (POST_PERSONA[tone][tr.persona] || 0);
    let td = 0;
    if (tone === 'praise' && res === 2 && playedWell) m += 1;
    if (tone === 'praise' && res === 0 && playedBadly) m -= 0.7;
    if (tone === 'praise' && res === 2 && tr.persona === 'Ambitny') m -= 0.5;
    if (tone === 'criticize' && res === 2 && playedBadly) m += 0.2;
    if (tone === 'criticize' && res === 2 && playedWell) { m -= 1; td -= 0.5; }
    if (tone === 'criticize' && res === 0) td -= 0.3;
    if (tone === 'criticize' && r != null && r >= 7) { m -= 1; td -= tr.persona === 'Wrażliwy' ? 2 : 1; }
    if (tone === 'praise' && r != null && r <= 5.8) m -= 0.3;
    if (m > 0) m *= REPEAT_MUL ** reps;
    m *= rankMul;
    m += rng.gauss(0, 0.2);
    let kind = classifyReaction(m * 2, td);
    const row = { id: p.id, name: p.name, ...reactionView(kind, rng) };
    // rozmowa indywidualna
    const talk = talkById[p.id];
    if (talk) {
      const ind = postTalk(p, talk, r, ctx.clubId);
      m += ind.morale;
      td += ind.trust;
      const tk = classifyReaction(ind.morale * 2, ind.trust);
      const replies = TALK_REPLY[tk];
      row.talk = { kind: talk, talkLabel: TALKS[talk].label, ...reactionView(tk, rng), quote: replies[Math.floor(rng.next() * replies.length)] };
      if (ind.conflictP > 0 && rng.chance(ind.conflictP)) {
        conflicts.push({ id: p.id, text: `${p.name ?? p.id} nie zgadza się z oceną trenera i chce o tym porozmawiać.` });
        row.talk.conflict = true;
      }
    }
    morale[p.id] = { delta: r1(m), value: applyMorale(moraleOf(p), r1(m)), days: 7 };
    if (td !== 0) relations[p.id] = applyTrust(p, td, `post:${talk || tone}`, rel);
    out.push(row);
  }
  const counts = {};
  for (const k of Object.keys(REACTIONS)) counts[k] = 0;
  for (const r of out) counts[r.reaction]++;
  const avg = players.length ? out.reduce((s, r) => s + morale[r.id].delta, 0) / players.length : 0;
  return {
    phase: 'post',
    tone,
    toneLabel: POST_TONES[tone].label,
    quote: POST_TONES[tone].quote,
    players: out,
    team: { counts, summary: teamSummary(counts, out.length), moraleTrend: avg > 0.3 ? 'up' : avg < -0.3 ? 'down' : 'flat' },
    morale,
    relations,
    clubId: ctx.clubId ?? null,
    conflicts,
    memory: remember(memory, memKey),
  };
}

/** Rozmowa indywidualna po meczu: pochwała albo krytyka konkretnego zawodnika. [SZAC] */
function postTalk(p, kind, rating, clubId) {
  const tr = traitsOf(p);
  const trust = getTrust(p, clubId);
  const played = rating != null;
  if (kind === 'praise') {
    if (!played) return { morale: 0.5, trust: 0.3, conflictP: 0 };
    const mul = tr.persona === 'Wrażliwy' ? 1.3 : 1;
    if (rating >= 7) return { morale: (EVENT_DELTA.publicPraise + 0.5) * mul, trust: 1, conflictP: 0 };
    if (rating >= 6.2) return { morale: 0.8 * mul, trust: 0.5, conflictP: 0 };
    return { morale: tr.persona === 'Ambitny' ? 0 : 0.3, trust: 0, conflictP: 0 };
  }
  // krytyka
  const sensitive = tr.persona === 'Wrażliwy' || tr.persona === 'Narwaniec';
  if (played && rating >= 6.8) {
    // krytyka po dobrym meczu: niesprawiedliwa
    const t = tr.persona === 'Wrażliwy' ? -3 : tr.ego >= 14 ? -2.5 : -2;
    const cp = clamp(0.25 + (sensitive ? 0.15 : 0) + 0.02 * Math.max(0, -trust) + 0.02 * (tr.ego - 10), 0, 0.8);
    return { morale: EVENT_DELTA.publicCriticism, trust: t, conflictP: cp };
  }
  if (!played || rating > 6.2) return { morale: -0.8, trust: -0.5, conflictP: 0.05 };
  // krytyka po słabym meczu: zasłużona
  if (tr.persona === 'Ambitny' || tr.persona === 'Lider' || tr.professionalism >= 13) return { morale: -0.3, trust: 0.3, conflictP: 0 };
  if (tr.persona === 'Wrażliwy') return { morale: -1.5, trust: -1, conflictP: 0.1 };
  if (tr.persona === 'Narwaniec') return { morale: -1, trust: -0.5, conflictP: 0.1 };
  return { morale: -0.5, trust: 0, conflictP: 0 };
}

// Konferencja prasowa: src/match/press.js (osobny moduł, docs/konferencja-prasowa.md).

// ================================================================ Relacja trener-zawodnik

/**
 * Zmiana zaufania z pamięcią (czysta funkcja). delta w skali odpraw (-10..+10), zapis w relacji negocjacyjnej.
 * - ujemne zdarzenie z tym samym tagiem, które jest jeszcze w pamięci, działa x1.5 ("pamięta");
 * - ujemne zdarzenia pamiętane są dłużej (3 + 2*|d| tygodni; Wrażliwy x1.5, Spokojny x0.7);
 * - uraza (d <= -1) dopisuje `grudge`, który wygasa o połowę co 90 dni i obniża nastrój w negocjacjach. [SZAC]
 * opts: { clubId, date }. Zwraca NOWY obiekt relacji dla klubu (do zapisania w player.relations[clubId]).
 */
export function applyTrust(p, delta, tag = 'inne', opts = {}) {
  const clubId = clubOf(p, opts.clubId);
  const rel = relationWith(p, clubId);
  const mem = Array.isArray(rel.briefMem) ? rel.briefMem : [];
  const tr = traitsOf(p);
  let d = delta;
  const baseTag = tag.split(':').pop();
  if (d < 0 && mem.some((m) => m.d < 0 && m.tag.split(':').pop() === baseTag)) d *= 1.5;
  const pMul = tr.persona === 'Wrażliwy' ? 1.5 : tr.persona === 'Spokojny' ? 0.7 : 1;
  const weeks = d < 0 ? Math.max(1, Math.round((3 + 2 * Math.abs(d)) * pMul)) : 2;
  const next = {
    ...rel,
    trust: r1(clamp(rel.trust + d * TRUST_SCALE, 0, 100)),
    briefMem: [...mem, { tag, d: r1(d), w: weeks, date: opts.date ?? null }].slice(-6),
  };
  if (d <= -1) {
    const now = opts.date ?? rel.grudgeDate;
    next.grudge = r1((now ? currentGrudge(rel, now) : rel.grudge) + GRUDGE_PER_POINT * Math.abs(d) * pMul);
    next.grudgeDate = now ?? null;
  }
  return next;
}

/**
 * Wygaszanie raz w tygodniu: zaufanie dryfuje do 50 o 10 % różnicy (cierpliwi i profesjonalni 15 %).
 * Dopóki w pamięci odpraw jest świeży ujemny wpis albo uraza (grudge >= 5 na dzień `date`), niskie zaufanie nie rośnie.
 * opts: { clubId, date, weeks }. Zwraca nowy obiekt relacji. [SZAC]
 */
export function decayTrust(p, opts = {}) {
  const clubId = clubOf(p, opts.clubId);
  const rel = relationWith(p, clubId);
  let trust = rel.trust;
  let mem = Array.isArray(rel.briefMem) ? rel.briefMem.map((m) => ({ ...m })) : [];
  const tr = traitsOf(p);
  const rate = tr.patience >= 13 || tr.prf >= 14 ? 0.15 : 0.1;
  const grudgeNow = opts.date ? currentGrudge(rel, opts.date) : rel.grudge;
  for (let i = 0; i < (opts.weeks ?? 1); i++) {
    const holds = mem.some((m) => m.d < 0) || grudgeNow >= 5;
    if (trust > 50 || !holds) trust -= rate * (trust - 50);
    mem = mem.map((m) => ({ ...m, w: m.w - 1 })).filter((m) => m.w > 0);
  }
  return { ...rel, trust: r1(trust), briefMem: mem };
}

/**
 * Zapisuje wynik odprawy w zawodniku (czysta funkcja: zwraca nowego zawodnika).
 * Relacja trafia do player.relations[clubId] (wspólne z negocjacjami), morale (odprawa pomeczowa) przez applyMorale.
 */
export function applyBriefing(player, result) {
  let out = player;
  const rel = result.relations?.[player.id];
  if (rel) out = { ...out, relations: { ...(out.relations || {}), [clubOf(player, result.clubId ?? undefined)]: rel } };
  const m = result.morale?.[player.id];
  if (m) out = { ...out, morale: applyMorale(moraleOf(player), m.delta) };
  return out;
}

/** Opis relacji dla ekranu zawodnika (bez liczb). */
export function trustLabel(trust) {
  if (trust >= 6) return 'Pełne zaufanie';
  if (trust >= 2) return 'Dobra relacja';
  if (trust > -2) return 'Relacja neutralna';
  if (trust > -6) return 'Chłodna relacja';
  return 'Konflikt z trenerem';
}

// ================================================================ AI: wybór przemowy (osobowość O/S/P)

/**
 * Wybór przemowy przez trenera AI. coach: 'O' ofensywny, 'S' ostrożny, 'P' pragmatyczny.
 * ctx: { phase:'pre'|'half'|'post', diff (gole za - przeciw), xgDiff, pWin, rank, memory }
 * Unika tonu użytego w 2 z 3 ostatnich meczów (pamięć powtórzeń działa też na AI).
 */
export function aiChooseSpeech(coach, ctx = {}) {
  const phase = ctx.phase || 'pre';
  const diff = ctx.diff ?? 0;
  const xgd = ctx.xgDiff ?? 0;
  const pWin = ctx.pWin ?? 0.4;
  let order;
  if (phase === 'pre') {
    if (pWin <= 0.25) order = coach === 'O' ? ['demand', 'noPressure'] : coach === 'S' ? ['noPressure', 'defend'] : ['noPressure', 'calm'];
    else if (pWin >= 0.55) order = coach === 'S' ? ['calm', 'demand'] : ['demand', 'calm'];
    else order = coach === 'O' ? ['demand', 'praise'] : coach === 'S' ? ['calm', 'defend'] : ['calm', 'demand'];
    if ((ctx.rank ?? 0) >= 2 && coach !== 'S') order = ['demand', ...order];
  } else if (phase === 'half') {
    const unlucky = diff < 0 && xgd >= 0.5;
    if (diff <= -2) order = coach === 'S' ? ['noPressure', 'shout'] : coach === 'O' ? ['shout', 'demand'] : (unlucky ? ['praise', 'noPressure'] : ['shout', 'noPressure']);
    else if (diff === -1) order = coach === 'P' ? (unlucky ? ['praise', 'calm'] : ['demand', 'shout']) : coach === 'O' ? ['shout', 'demand'] : ['demand', 'calm'];
    else if (diff === 0) order = coach === 'O' ? ['demand', 'praise'] : coach === 'S' ? ['calm', 'defend'] : (pWin >= 0.5 ? ['demand', 'calm'] : ['calm', 'demand']);
    else if (diff === 1) order = coach === 'S' ? ['defend', 'calm'] : coach === 'O' ? ['praise', 'demand'] : (xgd <= -0.5 ? ['defend', 'demand'] : ['calm', 'praise']);
    else order = coach === 'S' ? ['defend', 'praise'] : ['praise', 'calm'];
  } else {
    if (diff > 0) order = coach === 'S' ? ['focusNext', 'praise'] : ['praise', 'focusNext'];
    else if (diff === 0) order = ['focusNext', coach === 'O' ? 'criticize' : 'neutral'];
    else order = coach === 'O' ? ['criticize', 'focusNext'] : coach === 'S' ? ['focusNext', 'neutral'] : (xgd <= -0.5 ? ['criticize', 'focusNext'] : ['neutral', 'focusNext']);
  }
  const key = (t) => (phase === 'post' ? `post:${t}` : t);
  const tone = order.find((t) => repeatCount(ctx.memory, key(t)) < 2) || order[order.length - 1];
  return tone;
}

/**
 * Uproszczona odprawa AI: zamiast 18 zawodników liczy efekt dla 5 typów osobowości i waży ich udziałem w kadrze.
 * team: { coach:'O'|'S'|'P', personaMix:{Spokojny:n,...}, mot?: motywacja trenera s (od -1 do 1) }.
 * Zwraca { tone, zByPersona, teamZ, memory }.
 */
export function aiBriefing(team, ctx = {}, seed = 'ai') {
  const phase = ctx.phase || 'pre';
  let tone = aiChooseSpeech(team.coach || 'P', ctx);
  if (phase === 'post') return { tone, memory: remember(ctx.memory, `post:${tone}`) };
  const sit = phase === 'pre'
    ? preSituation(ctx)
    : halfSituation({ ...ctx, score: { for: Math.max(0, ctx.diff ?? 0), against: Math.max(0, -(ctx.diff ?? 0)) }, xgFor: Math.max(0, ctx.xgDiff ?? 0), xgAgainst: Math.max(0, -(ctx.xgDiff ?? 0)) });
  const mix = team.personaMix || { Spokojny: 1 };
  // Motywacja trenera (team.mot, s od -1 do 1, docs/trener-ai-atrybuty.md): dobry trener częściej wybiera ton
  // najlepszy dla tej szatni (ta sama ocena co podpowiedź asystenta gracza), słaby czasem źle czyta szatnię i mówi
  // coś gorszego niż zwykle; siła odprawy x(1 + 0,2 s) dla pozytywnej reakcji, negatywna słabnie u dobrego
  // i rośnie u słabego trenera
  const mot = team.mot ?? 0;
  if (mot) {
    const pick = new Rng(`${seed}|ai|ton|${phase}`);
    const val = (t) => PERSONAS.reduce((a, persona) => { const sp = speechParts({ id: `ai-${persona}`, persona, traits: {} }, t, sit, ctx.memory); return a + (sp.pos + sp.neg) * (mix[persona] || 0); }, 0);
    if (mot > 0 && pick.chance(AI_TALK.best * mot)) {
      let best = -Infinity;
      for (const t of TONE_KEYS) { const v = val(t); if (v > best) { best = v; tone = t; } }
    } else if (mot < 0 && pick.chance(AI_TALK.miss * -mot)) {
      const v0 = val(tone);
      const worse = TONE_KEYS.filter((t) => val(t) < v0);
      if (worse.length) tone = pick.pick(worse);
    }
  }
  const zFx = (z) => (!mot ? z : z > 0 ? z * (1 + AI_TALK.fx * mot) : z * (1 - AI_TALK.fx * mot));
  const zByPersona = {};
  let sum = 0;
  let n = 0;
  const rng = new Rng(`${seed}|ai|${phase}`);
  for (const persona of PERSONAS) {
    const p = { id: `ai-${persona}`, persona, traits: {} };
    const sp = speechParts(p, tone, sit, ctx.memory);
    const z = r1(clamp(zFx(sp.pos + sp.neg + rng.gauss(0, 0.5)), -10, 10));
    zByPersona[persona] = z;
    const w = mix[persona] || 0;
    sum += z * w;
    n += w;
  }
  return { tone, zByPersona, teamZ: r1(n ? sum / n : 0), memory: remember(ctx.memory, tone) };
}
