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
  // Mecze pucharowe (panel psycholog + trener) [SZAC]: mecz o wszystko, stan dwumeczu przed rewanżem, finał, pułapka
  singleKO: { calm: 0.5, demand: 1, noPressure: -1, defend: -1 },
  aggLead1: { calm: 1, demand: 0.5, shout: -1, noPressure: -1, defend: 0.5 },
  aggLead2plus: { calm: 1, praise: -1, demand: 1, shout: -1, noPressure: -1, defend: -0.5 },
  aggLevel: { calm: 1, demand: 0.5, shout: -0.5 },
  aggBehind1: { calm: 1, demand: 1, shout: -1, noPressure: 0.5, defend: -2 },
  aggBehind2plus: { demand: 1, noPressure: 2, defend: -3 },
  final: { calm: 1, praise: 0.5, shout: -1.5, noPressure: -1 },
  trap: { calm: -0.5, praise: -1, demand: 1.5, noPressure: -1 },
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
  // ko: { decider, agg (bilans 1. meczu z naszej strony, rewanż), single, final, playoff, trap } z koBrief (matchday.js)
  const ko = ctx.ko;
  if (ko) {
    if (ko.final) flags.push('final');
    else if (ko.agg != null) flags.push(ko.agg >= 2 ? 'aggLead2plus' : ko.agg === 1 ? 'aggLead1' : ko.agg === 0 ? 'aggLevel' : ko.agg === -1 ? 'aggBehind1' : 'aggBehind2plus');
    else if (ko.single) flags.push('singleKO');
    if (ko.playoff && !flags.includes('highStakes')) flags.push('highStakes');
    if (ko.trap) flags.push('trap');
  }
  return { phase: 'pre', stateIdx: 1, behindBy: 0, rank: ctx.rank ?? 0, flags, pWin, clubId: ctx.clubId };
}

/** Ocena sytuacji w przerwie. ctx: { score:{for, against}, xgFor, xgAgainst, possession, momentum (-100..100, z naszej strony), rank } */
export function halfSituation(ctx = {}) {
  const gf = ctx.score?.for ?? 0;
  const ga = ctx.score?.against ?? 0;
  const diff = gf - ga;
  // Rewanż: stan (prowadzimy, remis, przegrywamy) liczy się z dwumeczu, opis gry (klucz) z tego meczu [SZAC]
  const agg = ctx.ko?.agg ?? null;
  const aggDiff = agg != null ? diff + agg : diff;
  const xgd = (ctx.xgFor ?? 0) - (ctx.xgAgainst ?? 0);
  let key = 'wyrownany';
  if ((diff < 0 && xgd >= 0.5) || (diff === 0 && xgd >= 0.8)) key = 'pechowo';
  else if (diff <= 0 && xgd <= -0.6) key = 'zdominowani';
  else if (diff > 0 && xgd <= -0.5) key = 'szczesliwePrzod';
  else if (diff > 0 && xgd >= 0.5) key = 'pewnePrzod';
  return {
    phase: 'half',
    stateIdx: aggDiff > 0 ? 0 : aggDiff === 0 ? 1 : 2,
    behindBy: Math.max(0, -aggDiff),
    diff,
    aggDiff,
    etLooming: !!ctx.ko?.decider && aggDiff === 0, // remis w meczu rozstrzygającym: w perspektywie dogrywka
    calmGame: !!ctx.ko?.decider && Math.abs(aggDiff) >= 3, // dwumecz rozstrzygnięty: emocje słabsze
    xgd: r2(xgd),
    key,
    label: HALF_SITUATIONS[key],
    momentum: ctx.momentum ?? 0,
    possession: ctx.possession ?? 50,
    rank: ctx.ko?.decider && Math.abs(aggDiff) >= 3 ? 0 : ctx.rank ?? 0,
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
  if (sit.phase === 'pre') {
    for (const f of sit.flags) parts.push(PRE_CTX[f]?.[tone] || 0);
    const ko = sit.flags.includes('singleKO') || sit.flags.includes('final');
    if (ko && tone === 'noPressure' && sit.flags.includes('underdog')) parts.push(2); // słabszy w meczu o wszystko: „nie macie nic do stracenia”
    if (sit.flags.includes('final') && tone === 'calm' && tr.persona === 'Wrażliwy') parts.push(1);
  }
  if (sit.phase === 'half') {
    parts.push(HALF_CTX[sit.key]?.[tone] || 0);
    if (sit.momentum <= -30) parts.push({ calm: 1, defend: 1 }[tone] || 0);
    if (sit.momentum >= 30) parts.push({ praise: 1, demand: 0.5 }[tone] || 0);
    if (sit.etLooming) parts.push({ calm: 1, shout: -1, demand: 0.5, defend: (sit.pWin ?? 0.4) < 0.5 ? 0.5 : 0 }[tone] || 0); // „nie wszystko naraz”
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
  if (sit.calmGame) { pos *= 0.5; neg *= 0.5; }
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
// Po meczu bez „gotowy do gry” i poprawiania ochraniaczy (mecz już się skończył)
const REACTION_TEXT_POST = {
  zmotywowany: ['Zaciska pięści i kiwa głową.', 'Wstaje i klaszcze, dodając otuchy kolegom.', 'W jego oczach widać ogień.', 'Klepie kolegów po plecach.'],
  spokojny: ['Słucha uważnie i kiwa głową.', 'Spokojnie zdejmuje ochraniacze.', 'Kiwa głową bez słowa.', 'Oddycha głęboko i analizuje mecz w myślach.'],
  obojetny: REACTION_TEXT.obojetny,
  zdenerwowany: ['Nerwowo zdejmuje getry.', 'Unika wzroku, wyraźnie się spiął.', 'Chodzi po szatni w tę i z powrotem.', 'Siedzi z głową w dłoniach.'],
  urazony: REACTION_TEXT.urazony,
};

export function classifyReaction(z, trustDelta = 0, nerves = 0) {
  if (trustDelta <= -1 || z <= -3) return 'urazony';
  if (nerves >= 2 || z < -1) return 'zdenerwowany';
  if (z >= 3) return 'zmotywowany';
  if (z >= 1) return 'spokojny';
  if (nerves >= 1) return 'zdenerwowany';
  return 'obojetny';
}

function reactionView(kind, rng, extra, texts = REACTION_TEXT) {
  const list = texts[kind];
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

// Dodatkowe odpowiedzi przed meczem i w przerwie, gdy pasują do meczu (sparing, finał, derby, puchar)
const TALK_REPLY_CTX = {
  friendly: { zmotywowany: ['„Pokażę, że zasługuję na miejsce w składzie.”'], spokojny: ['„Jasne, potraktuję to jak dobry trening.”'], zdenerwowany: ['„Postaram się, choć jeszcze nie czuję się pewnie.”'] },
  final: { zmotywowany: ['„To trofeum będzie nasze, trenerze.”'], zdenerwowany: ['„Wiem, ile to znaczy. Trochę mnie to przytłacza.”'] },
  derby: { zmotywowany: ['„Wiem, ile te derby znaczą dla kibiców.”'], spokojny: ['„Spokojnie, nie dam się sprowokować.”'] },
  knockout: { zmotywowany: ['„Nie odpadniemy, trenerze.”'] },
};
function replyPool(kind, context) {
  const base = TALK_REPLY[kind];
  if (!context) return base;
  const g = context.kind === 'friendly' ? 'friendly' : context.final && context.kind !== 'playoffFinal' ? 'final'
    : context.rival === 'derby' ? 'derby' : context.knockout && context.leg?.n !== 1 ? 'knockout' : null;
  return g && TALK_REPLY_CTX[g][kind] ? [...base, ...TALK_REPLY_CTX[g][kind]] : base;
}

// Odpowiedzi po meczu: osobno na pochwałę i krytykę (wcześniej „Nie zawiodę, trenerze.” padało po końcowym gwizdku)
const TALK_REPLY_POST = {
  praise: {
    zmotywowany: ['„Dziękuję, trenerze. To dla mnie ważne.”', '„Dziękuję. Następnym razem będzie jeszcze lepiej.”', '„Cieszę się, że pan to docenia.”'],
    spokojny: ['„Dziękuję, trenerze.”', '„Miło to słyszeć.”', '„Dziękuję, robię swoje.”'],
    obojetny: TALK_REPLY.obojetny,
    zdenerwowany: ['„Dziękuję, ale wiem, że mogłem więcej.”', '„Nie wiem, czy zasłużyłem.”', '„Dobrze, dziękuję…”'],
    urazony: ['„Pochwała? Po takim meczu?”', '„Nie potrzebuję litości.”', '„Proszę sobie darować.”'],
  },
  criticize: {
    zmotywowany: ['„Ma pan rację. Poprawię to.”', '„Będę pracował jeszcze ciężej.”', '„Zrozumiałem, to się nie powtórzy.”'],
    spokojny: ['„Rozumiem, trenerze.”', '„Przemyślę to.”', '„Dobrze, popracuję nad tym.”'],
    obojetny: TALK_REPLY.obojetny,
    zdenerwowany: ['„Wiem, wiem…”', '„Wiem, że to nie był mój dzień.”', '„Dobrze, rozumiem…”'],
    urazony: TALK_REPLY.urazony,
  },
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
function runBriefing(phase, { players, tone, talks = [], memory, seed = 'odprawa', ratings = {}, sit, cardInfo = {}, rel = {}, context = null, score = null }) {
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
      const replies = replyPool(tk, context);
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
    quote: toneQuote(tone, context, { phase, seed, score }),
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
 *         ctx:{ rank, pWin, last5, boardExpectation, boardTrust, atRisk:[id], context (briefingContext, tylko teksty) }, seed }
 * Zwraca widok dla gracza (reakcje bez liczb) i `engine` (Z na start, ryzyko kartek, nerwowość, premia obrony).
 */
export function preMatchBriefing({ players, tone, talks = [], memory, ctx = {}, seed }) {
  const sit = preSituation(ctx);
  return runBriefing('pre', {
    players, tone, talks, memory, seed, sit, cardInfo: { atRisk: ctx.atRisk || [] }, rel: { clubId: ctx.clubId, date: ctx.date }, context: ctx.context ?? null,
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
    rel: { clubId: ctx.clubId, date: ctx.date }, context: ctx.context ?? null, score: ctx.score ?? null,
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

/** Uzasadnienie zalecanej przemowy zgodne z meczem (sparing, faworyt, dwumecz). Bez kontekstu: tekst ogólny. */
function adviceReason(tone, phase, c, sit) {
  if (!c) return ADVICE_REASON[tone];
  const pre = phase === 'pre';
  const under = c.gap === 'muchStronger' || c.gap === 'stronger';
  const fav = c.gap === 'muchWeaker' || c.gap === 'weaker';
  const friendly = c.kind === 'friendly';
  switch (tone) {
    case 'calm':
      if (friendly) return 'To sparing; spokój pomoże zrealizować założenia bez ryzyka urazów.';
      if (pre && (c.final || c.stake === 'title' || c.stake === 'relegation' || c.rival)) return 'Przy takiej stawce spokój zdejmie nerwy, zwłaszcza z wrażliwych.';
      return ADVICE_REASON.calm;
    case 'praise':
      return pre ? 'Drużyna dobrze pracuje; pochwała doda zawodnikom pewności.' : ADVICE_REASON.praise;
    case 'demand':
      if (friendly) return 'Nawet w sparingu jasne wymagania pomogą utrzymać tempo.';
      if (pre && c.gap === 'muchWeaker') return 'Z wyraźnie słabszym rywalem największym zagrożeniem jest lekceważenie; jasne wymagania utrzymają koncentrację.';
      return ADVICE_REASON.demand;
    case 'shout':
      if (c.rival === 'derby' && !friendly) return 'Potrzebny jest wstrząs, ale uważaj na wrażliwych i na kartki: w derbach emocje i tak są wysokie.';
      return ADVICE_REASON.shout;
    case 'noPressure':
      if (friendly) return 'To sparing; luz pomoże sprawdzić nowe rozwiązania.';
      if (!pre) return sit?.stateIdx === 2 ? ADVICE_REASON.noPressure : 'Zdejmij z nich ciężar; w drugiej połowie zagrają swobodniej.';
      if (c.leg?.state === 'behind') return 'Musimy odrabiać stratę z pierwszego meczu; bez presji łatwiej zaryzykować.';
      if (under) return 'Rywal jest faworytem; bez presji zagrają odważniej.';
      if (fav) return 'Presja faworyta może ich usztywnić; zdejmij z nich ciężar.';
      return 'Zdejmij z nich ciężar; zagrają swobodniej.';
    case 'defend':
      if (pre && c.leg?.state === 'ahead') return 'Mamy zaliczkę z pierwszego meczu; czyste konto da awans.';
      return pre ? 'Najważniejsze to nie stracić gola.' : ADVICE_REASON.defend;
    default:
      return ADVICE_REASON[tone];
  }
}

/** Jedna uwaga asystenta o meczu (derby, finał, różnica sił, sparing). */
function adviceNote(c, best) {
  if (!c) return null;
  if (best === 'demand' && c.gap === 'muchWeaker' && c.kind !== 'friendly' && c.rival !== 'derby' && !c.final) return null; // uzasadnienie już o tym mówi
  if (c.kind === 'friendly') return 'To sparing: ważniejsze od wyniku są minuty, sprawdzenie założeń i zdrowie zawodników.';
  if (c.rival === 'derby') return 'W derbach uważaj na porywczych: jedna kartka może zmienić mecz.';
  if (c.final) return 'Finał: część zawodników może czuć presję wielkiego meczu.';
  if (c.gap === 'muchWeaker') return 'Rywal jest wyraźnie słabszy, ale lekceważenie to największe zagrożenie.';
  if (c.gap === 'muchStronger') return 'Rywal jest wyraźnie silniejszy; dyscyplina będzie ważniejsza niż fantazja.';
  return null;
}

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
  const c = ctx.context ?? null;
  if (phase === 'half') lines.push(sit.label + '.');
  lines.push(adviceReason(best, phase, c, sit));
  const note = phase === 'pre' ? adviceNote(c, best) : null;
  if (note) lines.push(note);
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
 * Odprawa pomeczowa. ctx: { score:{for, against}, xgFor, xgAgainst, ratings:{id}, rank, clubId, date, context (z outcome, tylko teksty) }
 * talks: [{id, kind:'praise'|'criticize'}] maks. 3.
 * Zwraca reakcje, `morale` ({delta, value} przez morale.js applyMorale; działa na najbliższy tydzień, potem
 * wraca dryfem weeklyDrift), nowe relacje (zaufanie wspólne z negocjacjami) i konflikty.
 */
export function postMatchBriefing({ players, tone, talks = [], memory, ctx = {}, seed = 'po-meczu' }) {
  if (!POST_TONES[tone]) throw new RangeError(`Nieznana przemowa pomeczowa: ${tone}`);
  validateTalks(talks, 'post', players);
  const gf = ctx.score?.for ?? 0;
  const ga = ctx.score?.against ?? 0;
  // ctx.decided ('W'|'D'|'L'): mecz rozstrzygający (awans, trofeum, odpadnięcie, także po karnych i w dwumeczu) liczy się wg rozstrzygnięcia
  const res = ctx.decided ? { W: 0, D: 1, L: 2 }[ctx.decided] : gf > ga ? 0 : gf === ga ? 1 : 2;
  const xgd = (ctx.xgFor ?? 0) - (ctx.xgAgainst ?? 0);
  const playedWell = xgd >= 0.5;
  const playedBadly = xgd <= -0.5;
  const rank = ctx.rank ?? 0;
  // derby, puchary i finały: emocje mocniejsze; pierwszy mecz dwumeczu niczego nie rozstrzyga [SZAC, panel psycholog + trener]
  const rankMul = [1, 1.15, 1.4, 1.6][Math.min(3, Math.max(0, rank))] * (ctx.firstLeg ? 0.8 : 1);
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
    const row = { id: p.id, name: p.name, ...reactionView(kind, rng, null, REACTION_TEXT_POST) };
    // rozmowa indywidualna
    const talk = talkById[p.id];
    if (talk) {
      const ind = postTalk(p, talk, r, ctx.clubId);
      m += ind.morale;
      td += ind.trust;
      const tk = classifyReaction(ind.morale * 2, ind.trust);
      const replies = TALK_REPLY_POST[talk]?.[tk] ?? TALK_REPLY[tk];
      row.talk = { kind: talk, talkLabel: TALKS[talk].label, ...reactionView(tk, rng, null, REACTION_TEXT_POST), quote: replies[Math.floor(rng.next() * replies.length)] };
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
    quote: toneQuote(tone, ctx.context ?? null, { phase: 'post', seed, result: ['W', 'D', 'L'][res] }),
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

// ================================================================ Kontekst odprawy: rodzaj meczu, stawka, rywal
//
// Teksty przemów zależą od kontekstu meczu (docs/odprawy-kontekst.md). Wcześniej każda przemowa miała jeden
// cytat, więc w Pucharze Polski trener mówił o lidze, a w sparingu o punktach. Kontekst zmienia TYLKO teksty
// (cytat przemowy, podpowiedź asystenta, odpowiedzi zawodników); efekty i balans przemów są te same.

// Progi różnicy sił z szans 1X2 (z perspektywy klubu gracza) [SZAC]
export const GAP = { muchStronger: 0.58, stronger: 0.45, muchWeaker: 0.62, weaker: 0.5, minWin: 0.15 };

const GAP_LABEL = { muchStronger: 'Rywal wyraźnie silniejszy', stronger: 'Rywal faworytem', even: 'Wyrównane siły', weaker: 'Jesteśmy faworytem', muchWeaker: 'Rywal wyraźnie słabszy' };
const STAKE_LABEL = {
  title: 'Mecz, który może rozstrzygnąć o mistrzostwie', relegation: 'Walka o utrzymanie', six: 'Bezpośredni rywal w walce o utrzymanie',
  promotion: 'Walka o awans', deadRubber: 'W tabeli niewiele już się zmieni',
};

/**
 * Klasyfikator kontekstu odprawy (czysta funkcja). Wejście to zwykłe dane z dnia meczowego (matchday.js talkContext):
 * { type:'league'|'cup'|'supercup'|'uefa'|'friendly', title (nazwa rozgrywek i rundy), round, ucomp, leg, playoff,
 *   stage:'final'|'main', firstLeg:[nasze gole, gole rywala] z 1. meczu albo null, venue:'home'|'away'|'neutral',
 *   pWin, pLose, derby, rivalry (0-3), last5, tags (z matchRank),
 *   table:{ tier, pos, points, oppPos, oppPoints, played, total, leaderPts, secondPts, relFrom, dropPts, targetTo, targetPts } }
 * Zwraca: { kind, key, stake, six, last, gap, rival, venue, leg, points, et, final, knockout, form, label, title }.
 */
export function briefingContext(input = {}) {
  const type = input.type || 'league';
  const round = input.round ?? null;
  const pWin = input.pWin ?? 0.4;
  const pLose = input.pLose ?? Math.max(0, 1 - pWin - 0.27);
  // rodzaj meczu
  let kind = 'league';
  if (type === 'friendly') kind = 'friendly';
  else if (input.playoff) kind = round === 'F' ? 'playoffFinal' : 'playoffSemi';
  else if (type === 'supercup') kind = 'supercup';
  else if (type === 'cup') kind = round === 'F' || input.stage === 'final' ? 'cupFinal' : round === 'SF' ? 'cupSemi' : round === 'QF' ? 'cupQF' : 'cupEarly';
  else if (type === 'uefa') {
    if (input.ucomp === 'SEU') kind = 'uefaSuper';
    else if (round === 'F') kind = 'uefaFinal';
    else if (round === 'league') kind = 'uefaLeague';
    else if (['Q1', 'Q2', 'Q3', 'PO'].includes(round)) kind = 'uefaQual';
    else if (round === 'SF') kind = 'uefaSemi';
    else kind = 'uefaKO';
  }
  const final = ['cupFinal', 'supercup', 'uefaSuper', 'uefaFinal', 'playoffFinal'].includes(kind);
  const points = kind === 'league' || kind === 'uefaLeague';
  const knockout = !points && kind !== 'friendly';
  // dwumecz: 1. mecz albo rewanż z wynikiem 1. meczu
  let leg = null;
  if (type === 'uefa' && (input.leg === 1 || input.leg === 2)) {
    leg = { n: input.leg };
    if (input.leg === 2 && Array.isArray(input.firstLeg)) {
      const [f, a] = input.firstLeg;
      leg.first = [f, a];
      leg.state = f > a ? 'ahead' : f === a ? 'level' : 'behind';
    }
  }
  // dogrywka czy od razu karne (Superpuchar Polski i Superpuchar Europy: od razu karne)
  const et = !knockout ? null : (kind === 'supercup' || kind === 'uefaSuper') ? 'pens' : (leg?.n === 1 ? null : 'et');
  // różnica sił
  let gap = 'even';
  if (pLose >= GAP.muchStronger || pWin <= GAP.minWin) gap = 'muchStronger';
  else if (pWin >= GAP.muchWeaker) gap = 'muchWeaker';
  else if (pLose >= GAP.stronger) gap = 'stronger';
  else if (pWin >= GAP.weaker) gap = 'weaker';
  // rywal: derby (to samo miasto albo region z listy derbów) albo wielki rywal (lista rywalizacji, klasyk)
  const tags = input.tags || [];
  const derby = !!(input.derby || tags.includes('derby'));
  const rival = derby ? 'derby' : ((input.rivalry ?? 0) >= 2 || tags.includes('klasyk')) ? 'rival' : null;
  // stawka w lidze
  let stake = null; let six = false; let last = false;
  const t = input.table;
  if (kind === 'league' && t && t.pos) {
    const total = t.total ?? 34;
    const left = Math.max(0, total - (t.played ?? 0));
    const late = (t.played ?? 0) >= total / 2;
    last = left === 1;
    const pts = t.points ?? 0;
    const relFrom = t.relFrom ?? 16;
    const tier = t.tier ?? 1;
    const reach = 3 * left;
    if (late && left > 0) {
      const topGap = t.pos === 1 ? (pts - (t.secondPts ?? pts)) : ((t.leaderPts ?? pts) - pts);
      const titleRace = tier === 1 && (tags.includes('title') || (left <= 8 && t.pos <= 3 && topGap <= Math.min(6, reach)));
      const promoRace = tier >= 2 && left <= 10 && (t.pos <= (t.targetTo ?? 6) || (t.targetPts ?? 0) - pts <= 3) && (t.targetPts ?? 0) - pts <= reach;
      const dropRace = left <= 12 && (t.pos >= relFrom || (t.pos >= relFrom - 3 && pts - (t.dropPts ?? 0) <= 4)) || tags.includes('relegation');
      if (titleRace) stake = 'title';
      else if (promoRace) stake = 'promotion';
      else if (dropRace) stake = 'relegation';
      else if (left <= 5 && pts - (t.dropPts ?? 0) > reach && (t.targetPts ?? t.leaderPts ?? pts) - pts > reach) stake = 'deadRubber';
      if (stake === 'relegation' && t.oppPos && t.oppPos >= relFrom - 3 && Math.abs((t.oppPoints ?? 0) - pts) <= 4) six = true;
    }
  }
  // forma (z 5 ostatnich meczów)
  const r5 = (input.last5 || []).map((x) => ({ W: 'W', D: 'R', R: 'R', L: 'P', P: 'P' }[x] || x));
  const f5 = r5.reduce((s, x) => s + (x === 'W' ? 3 : x === 'R' ? 1 : 0), 0);
  const form = (r5.length >= 4 && f5 <= 3) || (r5.length >= 2 && r5.slice(-2).every((x) => x === 'P')) ? 'crisis' : (r5.length >= 3 && f5 >= 10) ? 'run' : null;
  const venue = input.venue || 'home';
  const c = { kind, stake, six, last, gap, rival, venue, leg, points, et, final, knockout, form, playoff: !!input.playoff, title: input.title || null };
  c.key = primaryKey(c);
  c.label = contextLabel(c);
  return c;
}

/** Główny klucz tekstów (najbardziej szczegółowa sytuacja wygrywa). */
function primaryKey(c) {
  if (c.kind === 'friendly') return 'friendly';
  if (c.final) return c.kind;
  if (c.leg?.n === 2 && c.leg.state) return `leg2${c.leg.state[0].toUpperCase()}${c.leg.state.slice(1)}`;
  if (c.kind !== 'league') return c.kind;
  if (c.stake) return c.stake;
  if (c.rival) return c.rival;
  return 'league';
}

function contextLabel(c) {
  const parts = [];
  if (c.title) parts.push(c.title);
  if (c.leg?.n === 2 && c.leg.first) {
    const [f, a] = c.leg.first;
    parts.push(f === a ? `Po pierwszym meczu remis ${f}:${a}` : f > a ? `Po pierwszym meczu prowadzimy ${f}:${a}` : `Po pierwszym meczu przegrywamy ${f}:${a}`);
  }
  if (c.stake) parts.push(c.six ? STAKE_LABEL.six : STAKE_LABEL[c.stake]);
  if (c.last && c.kind === 'league') parts.push('Ostatnia kolejka');
  if (c.rival === 'derby' && c.kind !== 'friendly') parts.push('Derby');
  if (c.rival === 'rival' && c.kind !== 'friendly') parts.push('Mecz z wielkim rywalem');
  if (c.gap === 'muchStronger' || c.gap === 'muchWeaker') parts.push(GAP_LABEL[c.gap]);
  return parts.join('. ');
}

// ---------------------------------------------------------------- teksty przemów
// Linie mogą mieć znaczniki warunków na początku, np. „[home]” albo „[under,leg1]”: linia pasuje tylko wtedy,
// gdy spełnione są wszystkie. Znaczniki nie trafiają do tekstu.
const TAG_TEST = {
  home: (c) => c.venue === 'home',
  away: (c) => c.venue === 'away',
  neutral: (c) => c.venue === 'neutral',
  under: (c) => c.gap === 'muchStronger' || c.gap === 'stronger',
  fav: (c) => c.gap === 'muchWeaker' || c.gap === 'weaker',
  run: (c) => c.form === 'run',
  crisis: (c) => c.form === 'crisis',
  six: (c) => c.six,
  last: (c) => c.last,
  notlast: (c) => !c.last,
  leg1: (c) => c.leg?.n === 1,
  et: (c) => c.et === 'et',
  pens: (c) => c.et === 'pens',
  b1: (c, x) => x.behindBy === 1,
  b2: (c, x) => x.behindBy >= 2,
  l1: (c, x) => x.leadBy === 1,
};
const TAG_RE = /^\[([a-z0-9,]+)\]\s*/;
function lineFits(line, c, x) {
  const m = TAG_RE.exec(line);
  if (!m) return true;
  return m[1].split(',').every((t) => TAG_TEST[t]?.(c, x) ?? false);
}
const lineText = (line) => line.replace(TAG_RE, '');
const lineTagged = (line, tags) => { const m = TAG_RE.exec(line); return !!m && m[1].split(',').some((t) => tags.includes(t)); };

// Kolejność szukania tekstów dla klucza (pierwszy klucz z pasującą linią wygrywa). Klucz 'any' jest neutralny:
// bez punktów, ligi, pucharu, trofeum i rywala, więc pasuje do każdego meczu o stawkę. Sparing ma własne teksty.
const PRE_CHAIN = {
  friendly: ['friendly'],
  league: ['league', 'any'], title: ['title', 'league', 'any'], relegation: ['relegation', 'league', 'any'],
  promotion: ['promotion', 'league', 'any'], deadRubber: ['deadRubber', 'league', 'any'],
  derby: ['derby', 'league', 'any'], rival: ['rival', 'league', 'any'],
  cupEarly: ['cupEarly', 'cup', 'any'], cupQF: ['cupQF', 'cup', 'any'], cupSemi: ['cupSemi', 'cup', 'any'],
  cupFinal: ['cupFinal', 'final', 'any'], supercup: ['supercup', 'final', 'any'],
  uefaSuper: ['uefaSuper', 'final', 'europe', 'any'], uefaFinal: ['uefaFinal', 'final', 'europe', 'any'],
  uefaQual: ['uefaQual', 'europe', 'any'], uefaLeague: ['uefaLeague', 'europe', 'any'], uefaKO: ['uefaKO', 'europe', 'any'],
  uefaSemi: ['uefaSemi', 'uefaKO', 'europe', 'any'],
  leg2Ahead: ['leg2Ahead', 'europe', 'any'], leg2Level: ['leg2Level', 'europe', 'any'], leg2Behind: ['leg2Behind', 'europe', 'any'],
  playoffSemi: ['playoffSemi', 'playoff', 'any'], playoffFinal: ['playoffFinal', 'playoff', 'any'],
};

const PRE_LINES = {
  calm: {
    any: ['Trzymamy plan. Róbcie swoje, a wynik przyjdzie.', 'Spokojnie. Każdy zna swoje zadanie, reszta przyjdzie sama.', 'Bez nerwów. Wiemy, jak chcemy grać, i tego się trzymamy do końca.'],
    friendly: ['To sparing. Spokojnie wprowadzamy to, co ćwiczyliśmy w tygodniu, i nikt nie ryzykuje zdrowia.', 'Traktujcie ten mecz jak trening z rywalem. Spokojnie, z głową, bez niepotrzebnych starć.', 'Wynik dziś nie jest najważniejszy. Chcę zobaczyć, jak realizujecie założenia.', 'Najważniejsze, żeby każdy złapał minuty w nogach i zszedł z boiska zdrowy.'],
    league: ['Spokojnie. Do tego meczu przygotowaliśmy się jak zawsze, wiemy, co robić.', 'W lidze liczy się regularność. Grajmy swoje, a punkty przyjdą.'],
    title: ['Wiem, o co gramy. Nie myślcie o tabeli, myślcie o następnej akcji.', 'Mistrzostwo nie rozstrzyga się w pierwszej minucie. Spokojnie, cierpliwie, swoją piłką.', '[last] Ostatnia kolejka. Spokojnie, gramy to, co trenowaliśmy cały sezon.'],
    relegation: ['Wiem, że ciąży na was tabela. Zostawcie ją w szatni i grajcie prosto, bez paniki.', 'Strach to zły doradca. Robimy to, co umiemy, krok po kroku.', '[six] Rywal jest w tej samej sytuacji co my. Wygra ten, kto zachowa zimną głowę.'],
    promotion: ['Awans jest blisko, ale nie wolno go wyprzedzać myślami. Ten mecz, ta akcja, nic więcej.', 'Nie liczcie punktów w tabeli. Liczy się tylko ten mecz.'],
    deadRubber: ['W tabeli niewiele się już zmieni, ale gramy dla siebie i dla kibiców. Spokojnie, porządnie, do końca.', 'Niech nikt nie gra na pół gwizdka. Spokojnie, ale profesjonalnie, jak w każdym meczu.'],
    derby: ['Wiem, ile znaczą derby. Emocje zostawcie kibicom, wy grajcie głową.', 'Chłodna głowa wygrywa derby. Nie dajcie się sprowokować.'],
    rival: ['Kibice czekają na ten mecz od dawna. Spokojnie, nasza piłka, nasz plan.', 'Z tym rywalem zawsze jest gorąco. Tym bardziej grajmy spokojnie i mądrze.'],
    cup: ['Puchar wybacza brzydką grę, ale nie wybacza nerwów. Spokojnie i do przodu.', 'W pucharze liczy się awans. Spokojnie, cierpliwie, nawet jeśli trzeba będzie grać dogrywkę.'],
    cupQF: ['Ćwierćfinał. Nie myślimy o półfinale, myślimy o tym meczu.'],
    cupSemi: ['Półfinał. Nie myślcie o finale, myślcie o pierwszym podaniu.', 'Jeden mecz od finału. Spokojnie, nasz plan wystarczy, jeśli go zrealizujemy.'],
    final: ['Finał gra się głową. Świętować będziemy po ostatnim gwizdku.', 'Wiem, że serce bije szybciej. Oddychajcie i grajcie swoje. Trofeum zdobywa ten, kto pierwszy się uspokoi.'],
    supercup: ['Superpuchar to pierwsze trofeum sezonu. Spokojnie, gramy swoje od pierwszej minuty.', 'Pamiętajcie: przy remisie od razu rzuty karne, bez dogrywki. Spokojnie, liczy się każda minuta.'],
    uefaSuper: ['Superpuchar Europy. Gramy z najlepszymi, ale spokojnie: to wciąż ta sama piłka.'],
    europe: ['Europejski wieczór. Spokojnie, piłka jest tak samo okrągła jak w lidze.', 'Wiem, że to wielka scena. Spokojnie, grajmy to, co umiemy.'],
    uefaQual: ['[leg1] Pierwszy mecz dwumeczu. Spokojnie, nie wszystko rozstrzygnie się dziś.'],
    uefaLeague: ['Faza ligowa to długi dystans. Spokojnie, każdy punkt przybliża nas do awansu.'],
    uefaKO: ['[leg1] Faza pucharowa, pierwszy mecz. Nie wszystko rozstrzygnie się dziś, spokojnie i z głową.'],
    uefaSemi: ['[leg1] Półfinał w Europie. Spokojnie, to dopiero pierwsza połowa dwumeczu.'],
    leg2Ahead: ['Mamy zaliczkę z pierwszego meczu. Spokojnie, nie bronimy jej nerwowo, gramy swoje.'],
    leg2Level: ['Po pierwszym meczu jest remis. Wszystko zaczyna się od nowa, spokojnie i z głową.'],
    leg2Behind: ['Musimy odrobić stratę, ale mamy na to cały mecz. Bez paniki, krok po kroku.'],
    playoff: ['Baraże to jeden mecz. Spokojnie, nasz plan, nasza cierpliwość.'],
    playoffFinal: ['Jeden mecz od awansu. Spokojnie, nie myślcie o fecie, myślcie o boisku.'],
  },
  praise: {
    any: ['Widzę, jak pracujecie na treningach. Jestem z was dumny, pokażcie to dziś.', 'Ufam wam. Pokażcie na boisku to, co widzę w tygodniu.', '[run] Jestem z was dumny. Tak trzymać.'],
    friendly: ['Dobrze pracowaliście w tym tygodniu. Ten sparing to okazja, żeby to pokazać.', 'Każdy, kto dziś dostanie minuty, ma szansę mnie przekonać. Jestem zadowolony z waszej pracy.'],
    league: ['[run] Ostatnie mecze to dobra robota. Dopiszmy dziś kolejne punkty.', 'Jestem zadowolony z tego, jak pracujecie. W lidze to procentuje.'],
    title: ['Zapracowaliście na to, żeby grać o mistrzostwo. Teraz po nie sięgnijcie.', 'Cały sezon pokazujecie charakter. Dziś pokażcie go jeszcze raz.'],
    relegation: ['Wierzę w tę szatnię. Charakter, który pokazujecie na treningach, utrzyma nas w lidze.'],
    promotion: ['Zapracowaliście na to, żeby walczyć o awans. Dokończmy to.'],
    deadRubber: ['To był długi sezon i dużo z siebie daliście. Zagrajmy dziś tak, żeby kibice wyszli zadowoleni.'],
    derby: ['Jestem dumny, że to wy zagracie w tych derbach. Kibice wiedzą, że mogą na was liczyć.'],
    rival: ['Ufam wam. Ten mecz pokaże, kto jest lepszą drużyną, i wierzę, że to będziemy my.'],
    cup: ['Wierzę w was. W pucharze każdy mecz to szansa, żeby pokazać się szerzej.', 'Pracujecie świetnie. Pokażmy w tym pucharze, ile jesteśmy warci.'],
    cupQF: ['Dotarliście do ćwierćfinału ciężką pracą. Teraz krok dalej.'],
    cupSemi: ['Zasłużyliście na ten półfinał. Teraz idźmy dalej.'],
    final: ['Zasłużyliście, żeby tu być. Jestem z was dumny, a teraz idźmy po trofeum.'],
    cupFinal: ['Przeszliście całą drogę do finału. Jestem z was dumny, dokończmy to.'],
    europe: ['Ciężka praca dała nam grę w Europie. Pokażmy, że tu pasujemy.'],
    uefaLeague: ['Zasłużyliście na fazę ligową. Pokażmy, że to nie przypadek.'],
    leg2Ahead: ['Pierwszy mecz był dobry. Pokażcie, że to nie był przypadek.'],
    leg2Level: ['W pierwszym meczu byliśmy równorzędnym rywalem. Dziś pokażcie, że jesteśmy lepsi.'],
    leg2Behind: ['Wierzę w was. Stratę z pierwszego meczu da się odrobić, jeśli zagramy, jak potrafimy.'],
    playoff: ['Zapracowaliście na baraże. Teraz pokażmy, że zasługujemy na awans.'],
  },
  demand: {
    any: ['Stać was na dużo więcej. Chcę to zobaczyć na boisku.', 'Od pierwszej minuty chcę intensywności. Każdy pojedynek jest nasz.'],
    friendly: ['Sparing to też sprawdzian. Kto chce grać w meczach o stawkę, niech pokaże to dziś.', 'Chcę zobaczyć intensywność z treningów. Miejsce w składzie wywalcza się także w sparingach.'],
    league: ['Dziś chcę trzech punktów i pełnego zaangażowania. Mniej nie przyjmuję.', 'Każdy punkt w lidze trzeba wyszarpać. Chcę walki od pierwszej do ostatniej minuty.'],
    title: ['Mistrzostwo nie spadnie z nieba. Każdy pojedynek, każdy metr, wszystko na sto procent.', 'Takie mecze decydują o tytule. Chcę widzieć, że rozumiecie, o co gramy.'],
    relegation: ['W tym meczu nie ma miejsca na półśrodki. Każda piłka to walka o utrzymanie.', '[six] To mecz o sześć punktów. Wygrana pozwala odskoczyć, porażka wciąga nas głębiej.'],
    promotion: ['Awans trzeba wyszarpać. Chcę widzieć głód w każdej akcji.'],
    deadRubber: ['Nie ma meczów o nic. Kto dziś odpuści, ten sam sobie wystawi ocenę przed następnym sezonem.'],
    derby: ['Derbów się nie przegrywa. Chcę widzieć walkę o każdy metr, ale z głową.', 'W derbach liczy się charakter. Pokażcie, kto tu rządzi, ale bez głupich fauli.'],
    rival: ['Z tym rywalem gra się o prestiż. Chcę pełnego zaangażowania od pierwszej minuty.'],
    cup: ['W pucharze nie ma drugiej szansy. Kto przegrywa, odpada, więc chcę maksimum od pierwszej minuty.'],
    cupQF: ['Ćwierćfinał. Chcę widzieć drużynę, która chce iść dalej, a nie taką, która cieszy się, że tu jest.'],
    cupSemi: ['Półfinał to nie miejsce na oszczędzanie sił. Chcę zobaczyć głód finału.', 'Jeden mecz dzieli nas od finału. Chcę zobaczyć, że naprawdę tego chcecie.'],
    final: ['Finału się nie gra, finał się wygrywa. Wszystko, co macie, zostawcie dziś na boisku.', 'Do trofeum jeden mecz. Chcę pełnej koncentracji od pierwszego gwizdka.'],
    supercup: ['Superpuchar to trofeum, a nie mecz pokazowy. Chcę go zdobyć.'],
    uefaSuper: ['Superpuchar Europy to trofeum, a nie mecz pokazowy. Chcę go zdobyć.'],
    europe: ['W Europie każdy błąd kosztuje podwójnie. Chcę koncentracji przez cały mecz.'],
    uefaQual: ['[leg1] Chcę dobrego wyniku przed rewanżem. Gol strzelony dziś może zdecydować o awansie.'],
    uefaLeague: ['[home] U siebie w fazie ligowej trzeba punktować. Chcę wygranej.', '[away] Nie przyjechaliśmy tu na wycieczkę. W fazie ligowej każdy punkt ma wagę.'],
    uefaKO: ['[leg1] Faza pucharowa. Chcę wyniku, który da nam przewagę przed rewanżem.'],
    leg2Ahead: ['Mamy zaliczkę, ale nie po to, żeby się cofać. Chcę gola, który zamknie dwumecz.'],
    leg2Level: ['Wszystko do rozstrzygnięcia. Kto bardziej chce, ten awansuje.'],
    leg2Behind: ['Musimy strzelać. Chcę odwagi i agresji od pierwszej minuty.'],
    playoff: ['Baraże wygrywa ten, kto bardziej chce. Chcę to zobaczyć od pierwszej minuty.'],
    playoffFinal: ['Jeden mecz dzieli nas od awansu. Nie zostawiajcie niczego w szatni.'],
  },
  shout: {
    any: ['Obudźcie się! Od pierwszej minuty chcę ognia, a nie spaceru!', '[crisis] Dość tego! Ostatnie wyniki to wstyd i dziś to zmieniamy!'],
    friendly: ['Sparing to nie wakacje! Kto będzie dziś człapał, nie zagra w następnym meczu!', 'Nie obchodzi mnie, że to mecz kontrolny! Chcę tempa i koncentracji!'],
    league: ['[crisis] Dość gubienia punktów! Dziś wychodzicie i walczycie, jasne?!', 'Każdy mecz w lidze traktujemy jak najważniejszy! Do roboty!'],
    title: ['To jest mecz o mistrzostwo, a nie towarzyski! Chcę widzieć furię!'],
    relegation: ['Chcecie spaść?! Bo ja nie! Dziś walczycie o każdą piłkę!', 'Kibice nie zasłużyli na spadek! Dziś każdy zostawia serce na boisku!'],
    promotion: ['Nie po to harowaliśmy cały sezon, żeby teraz odpuścić awans!'],
    deadRubber: ['Nie obchodzi mnie, że w tabeli nic się nie zmieni! Gracie w koszulce tego klubu, więc ją szanujcie!'],
    derby: ['To są derby! Chcę ognia w sercu i lodu w głowie, żadnych głupich kartek!'],
    rival: ['Ten rywal tylko czeka, żeby się z nas pośmiać! Nie dajcie mu tej satysfakcji!'],
    cup: ['W pucharze odpada się raz! Kto nie chce grać dalej, niech zostanie w szatni!'],
    cupSemi: ['Jesteście o krok od finału i chcecie to zmarnować?! Do boju!'],
    final: ['Trofeum leży na stole! Kto chce je zabrać, niech pokaże to od pierwszej minuty!'],
    cupFinal: ['Do tego finału szliśmy przez wszystkie rundy! Nie oddamy go bez walki!'],
    europe: ['Cała Polska patrzy! Pokażcie, że zasługujemy na Europę!'],
    leg2Ahead: ['Zaliczka nic nie znaczy, jeśli zaśniecie! Gramy tak, jakby dwumecz zaczynał się od zera!'],
    leg2Level: ['Wszystko rozstrzyga się dziś! Kto nie jest gotowy, niech powie to teraz!'],
    leg2Behind: ['Przegrywamy dwumecz, ale to jeszcze nie koniec! Atak od pierwszej minuty!'],
    playoff: ['Cały sezon na jeden mecz! Nie zmarnujcie tego!'],
  },
  noPressure: {
    any: ['[under] Nie macie nic do stracenia. Wyjdźcie i cieszcie się grą.', 'Bez spinania się. Grajcie odważnie, błędy biorę na siebie.', '[fav] Wiemy, że jesteśmy mocniejsi. Bez nerwów, wystarczy grać swoje.'],
    friendly: ['To tylko sparing. Bawcie się piłką i próbujcie odważnych zagrań.', 'Nikt was nie rozliczy z wyniku. Liczy się to, co dziś sprawdzimy.'],
    league: ['[notlast] To jeden z wielu meczów w sezonie. Grajcie swobodnie, bez patrzenia na tabelę.', 'Grajcie swobodnie i nie patrzcie na tabelę. Liczy się nasza gra.'],
    title: ['Presja jest po obu stronach. Wy grajcie z uśmiechem, niech ciężar poczują inni.'],
    relegation: ['Wiem, że tabela ciąży. Odłóżcie ją i grajcie tak, jakbyśmy byli w środku stawki.'],
    promotion: ['Awans to nagroda, a nie obowiązek. Grajcie z radością, a reszta przyjdzie.'],
    deadRubber: ['Nic nie musimy, wszystko możemy. Pokażcie kibicom ładną piłkę.'],
    derby: ['Wiem, ile mówi się o tych derbach. Zostawcie gadanie innym i bawcie się tym meczem.'],
    rival: ['Niech oni się denerwują. My gramy swoje, z luzem.'],
    cup: ['[under] Puchar to święto. Nikt na nas nie stawia, więc grajcie odważnie.', '[fav] Wszyscy oczekują naszego awansu. Zapomnijcie o tym i grajcie swobodnie.', 'Puchar rządzi się swoimi prawami. Grajcie odważnie, bez strachu przed błędem.'],
    final: ['Finał to święto. Cieszcie się nim, takie mecze pamięta się całe życie.', '[under] W finale faworytem jest rywal. My nie mamy nic do stracenia.'],
    supercup: ['Superpuchar to święto. Cieszcie się nim, takie mecze pamięta się długo.', '[under] Faworytem jest rywal. My nie mamy nic do stracenia, grajcie odważnie.'],
    uefaSuper: ['Superpuchar Europy to święto. Cieszcie się nim, takie mecze pamięta się całe życie.'],
    europe: ['Gramy w Europie, o tym marzy każdy piłkarz. Cieszcie się tym meczem.', '[under] Nikt w Europie na nas nie stawia. Grajcie odważnie, bez kompleksów.'],
    leg2Ahead: ['Mamy zaliczkę, ale nie myślcie o niej. Grajcie swobodnie.'],
    leg2Level: ['Wszystko zaczyna się od zera. Bez kalkulacji, grajcie swoje.'],
    leg2Behind: ['Musimy gonić, więc nie mamy nic do stracenia. Grajcie odważnie.'],
    playoff: ['Baraże to nagroda za dobry sezon. Grajcie bez strachu.'],
  },
  defend: {
    any: ['Najpierw zero z tyłu. Każdy pilnuje swojego.', 'Zaczynamy od solidnej obrony. Gole z przodu przyjdą, jeśli z tyłu będzie spokój.'],
    friendly: ['Dziś sprawdzamy ustawienie w obronie. Każdy pilnuje swojej strefy, bez ryzykownych wślizgów.', 'Ćwiczymy organizację w obronie. Zwarte linie, komunikacja i żadnych niepotrzebnych fauli.'],
    league: ['Zero z tyłu da nam co najmniej punkt. Od tego zaczynamy.'],
    title: ['Mistrzów buduje obrona. Zero z tyłu i cierpliwie czekamy na swoją szansę.'],
    relegation: ['Każdy punkt jest na wagę złota. Najpierw zero z tyłu, nie dajmy się zaskoczyć.'],
    cup: ['W pucharze jeden błąd kończy przygodę. Najpierw zero z tyłu.'],
    final: ['Finały wygrywa obrona. Nikt nie odpuszcza krycia przez cały mecz.'],
    supercup: ['Przy remisie od razu karne, więc nie dajmy się zaskoczyć. Najpierw zero z tyłu.'],
    uefaSuper: ['Przy remisie od razu karne. Zwarte linie i cierpliwość przez cały mecz.'],
    europe: ['W Europie rywal ukarze każdy błąd. Zwarte linie, zero z tyłu.'],
    uefaQual: ['[home,leg1] Czyste konto u siebie to dobra podstawa przed rewanżem. Najpierw zero z tyłu.', '[away,leg1] Na wyjeździe najpierw obrona. Wynik bez straty gola da nam spokój przed rewanżem.'],
    uefaKO: ['[home,leg1] Czyste konto u siebie to dobra podstawa przed rewanżem. Najpierw zero z tyłu.', '[away,leg1] Na wyjeździe najpierw obrona. Wynik bez straty gola da nam spokój przed rewanżem.'],
    uefaLeague: ['W fazie ligowej punkt też się liczy. Najpierw solidna obrona.'],
    leg2Ahead: ['Mamy przewagę z pierwszego meczu. Zero z tyłu i awans jest nasz.'],
    leg2Level: ['Nie możemy stracić gola, który ustawi rywalowi dwumecz. Obrona przede wszystkim.'],
    leg2Behind: ['Musimy odrobić stratę, ale bez straty kolejnego gola. Najpierw zero z tyłu, potem atak.'],
    playoff: ['W barażu jeden błąd może kosztować cały sezon. Najpierw zero z tyłu.'],
  },
};

// Drugie zdanie przemowy: rywal (derby, wielki rywal) albo duża różnica sił. Teksty bez nazwy rozgrywek.
const PRE_MOD = {
  calm: {
    derby: ['To derby, więc trzymajcie emocje na wodzy. Głupia kartka to prezent dla rywala.'],
    rival: ['Wiem, jak kibice czekają na mecz z tym rywalem. Nie dajmy się ponieść.'],
    muchStronger: ['Rywal jest faworytem, ale faworyci też się mylą.'],
    muchWeaker: ['Jesteśmy faworytem. Rywal w końcu się otworzy, wystarczy zmęczyć go posiadaniem piłki.'],
    fStrong: ['Rywal jest mocniejszy, to dobry test dla naszej obrony.'],
    fWeak: ['Rywal jest słabszy, więc ćwiczymy atak pozycyjny. Cierpliwie.'],
  },
  praise: {
    derby: ['Kibice czekali na te derby. Wiem, że ich nie zawiedziecie.'],
    rival: ['Kibice długo czekali na mecz z tym rywalem. Wiem, że ich nie zawiedziecie.'],
    muchStronger: ['Nikt na nas nie stawia, a ja wiem, ile jesteście warci.'],
    muchWeaker: ['Jesteście lepszą drużyną, ale to trzeba pokazać na boisku, a nie na papierze.'],
    fStrong: ['Sprawdzian z mocnym rywalem pokaże, jak daleko zaszliście.'],
    fWeak: ['Pokażcie jakość, a nie tylko wynik.'],
  },
  demand: {
    derby: ['To derby. Chcę walki o każdy metr, ale z głową.'],
    rival: ['Z tym rywalem gra się o prestiż. Nie oddamy mu ani metra.'],
    muchStronger: ['Rywal jest silniejszy na papierze, więc musimy przebiec więcej niż on.'],
    muchWeaker: ['Nie ma słabych rywali. Kto zlekceważy przeciwnika, usiądzie na ławce.'],
    fStrong: ['Mocny sparingpartner to szansa. Chcę zobaczyć, jak radzicie sobie pod presją.'],
    fWeak: ['Słabszy rywal to nie wymówka do grania na pół gwizdka.'],
  },
  shout: {
    derby: ['To są derby! Ogień w sercu, lód w głowie!'],
    rival: ['Nie dajcie temu rywalowi powodu do świętowania!'],
    muchStronger: ['Mają lepszy skład, ale nie mają naszego serca!'],
    muchWeaker: ['Jeśli ktoś myśli, że ten mecz wygra się sam, to grubo się myli!'],
    fStrong: ['Mocny rywal to nie powód, żeby się chować!'],
    fWeak: ['Nie chcę widzieć lekceważenia rywala, nawet w sparingu!'],
  },
  noPressure: {
    derby: ['Wokół derbów zawsze jest dużo hałasu. Zostawcie go kibicom.'],
    rival: ['Niech rywal się denerwuje. My zachowajmy luz.'],
    muchStronger: ['Faworytem są oni, presja jest po ich stronie.'],
    muchWeaker: ['Jesteśmy faworytem, ale niech to was nie usztywnia.'],
    fStrong: ['Silny rywal, zero presji. Uczcie się z każdej akcji.'],
    fWeak: ['Bawcie się grą, ale z szacunkiem dla rywala.'],
  },
  defend: {
    derby: ['W derbach rywal będzie szukał prowokacji. Nie dajcie się wyciągnąć z ustawienia.'],
    rival: ['Ten rywal zna nasze słabe strony. Zwarte linie i pełna koncentracja.'],
    muchStronger: ['Na mocniejszego rywala potrzebujemy zwartych linii i cierpliwości.'],
    muchWeaker: ['Nie dajmy rywalowi nadziei. Cierpliwie rozbijamy jego obronę, bez otwierania się.'],
    fStrong: ['Na mocnym rywalu sprawdzimy organizację w obronie.'],
    fWeak: ['Nawet ze słabszym rywalem pilnujemy ustawienia. Tego się uczymy.'],
  },
};

function modKey(c) {
  if (c.kind === 'friendly') return c.gap === 'muchStronger' ? 'fStrong' : c.gap === 'muchWeaker' ? 'fWeak' : null;
  if (c.rival && c.key !== c.rival) return c.rival;
  if (c.gap === 'muchStronger' || c.gap === 'muchWeaker') return c.gap;
  return null;
}

// Przerwa: grupa meczu i stan wyniku (dwumecz: stan dwumeczu). Klucz 'grupa.stan' albo 'grupa.all'.
const HALF_LINES = {
  calm: {
    'any.lead': ['Prowadzimy, ale to dopiero połowa. Spokojnie, trzymamy plan.', 'Dobra połowa. Bez euforii, gramy dalej to samo.'],
    'any.level': ['Remis, nic się nie stało. Trzymamy plan, szansa przyjdzie.', 'Spokojnie. Jeszcze czterdzieści pięć minut, wystarczy jedna dobra akcja.'],
    'any.behind': ['Mamy czterdzieści pięć minut, żeby to odwrócić. Bez paniki.', '[b1] Jeden gol i wszystko zaczyna się od nowa. Spokojnie, krok po kroku.'],
    'friendly.all': ['Druga połowa to czas dla zmienników. Spokojnie realizujemy założenia, wynik jest drugorzędny.', 'Spokojnie. Sprawdzamy to, co ćwiczyliśmy, i dbamy o zdrowie.'],
    'points.lead': ['Prowadzimy. Spokojnie dowieźmy te punkty do końca.'],
    'points.level': ['Remis to też punkt, ale stać nas na więcej. Spokojnie, cierpliwie.'],
    'points.behind': ['Mamy czas, żeby uratować punkty. Bez paniki.'],
    'ko.lead': ['Jesteśmy czterdzieści pięć minut od awansu. Spokojnie, nie myślcie o wyniku.'],
    'ko.level': ['Na razie remis, a w razie potrzeby jest dogrywka. Spokojnie, mamy czas.'],
    'ko.behind': ['Na odrobienie straty mamy całą drugą połowę. Bez paniki, gramy swoje.'],
    'final.lead': ['Czterdzieści pięć minut od trofeum. Nie myślcie o pucharze, myślcie o następnej akcji.'],
    'final.level': ['[et] Remis w finale to na razie dogrywka. Spokojnie, cierpliwie.', '[pens] Przy remisie od razu karne. Spokojnie, ale spróbujmy rozstrzygnąć to wcześniej.'],
    'pfinal.lead': ['Czterdzieści pięć minut od awansu. Spokojnie, nie myślcie jeszcze o fecie.'],
    'leg1.lead': ['Prowadzimy, ale to dopiero pierwsza połowa dwumeczu. Spokojnie.'],
    'leg1.level': ['Remis, a przed nami jeszcze rewanż. Bez nerwów.'],
    'leg1.behind': ['Do rewanżu wszystko jest otwarte, ale spróbujmy zmniejszyć stratę.'],
    'leg2.ahead': ['W dwumeczu jesteśmy z przodu. Spokojnie, kontrolujemy to.'],
    'leg2.level': ['W dwumeczu remis. Mamy czterdzieści pięć minut, a w razie potrzeby dogrywkę.'],
    'leg2.behind': ['W dwumeczu przegrywamy, ale mamy czterdzieści pięć minut. Bez paniki.'],
  },
  praise: {
    'any.lead': ['Świetna połowa. Tak trzymać.', 'Dokładnie tak to sobie wyobrażałem. Jeszcze jedna taka połowa.'],
    'any.level': ['Dobrze gracie, wynik jeszcze przyjdzie.'],
    'any.behind': ['Mimo wyniku jestem z was zadowolony. Grajcie dalej tak samo, a gole przyjdą.'],
    'friendly.lead': ['Dobrze to wygląda. Ci, którzy wejdą, niech grają dalej w tym stylu.'],
    'friendly.level': ['Dobrze to wygląda. Ci, którzy wejdą, niech grają dalej w tym stylu.'],
    'friendly.behind': ['Wynik nie jest ważny. Podobało mi się kilka akcji, pokażcie ich więcej.'],
    'final.lead': ['Gracie wielki finał. Jeszcze jedna taka połowa.'],
    'leg2.ahead': ['Dobra robota. Jesteśmy blisko awansu, tak trzymać.'],
    'leg2.level': ['Dobrze gracie. Dwumecz jest w naszych rękach.'],
    'leg2.behind': ['Gracie dobrze. Jeszcze trochę, a gole przyjdą.'],
  },
  demand: {
    'any.lead': ['Prowadzimy, ale stać was na więcej. Chcę kolejnego gola, a nie cofania się.'],
    'any.level': ['Remis mnie nie interesuje. Chcę więcej odwagi z przodu.'],
    'any.behind': ['Tak się nie gra. Chcę więcej biegania i więcej odwagi.'],
    'friendly.all': ['To nadal sparing, ale chcę więcej tempa. Kto wchodzi, niech pokaże się z dobrej strony.'],
    'points.level': ['Jeden punkt to za mało. Chcę zwycięstwa.'],
    'points.behind': ['Tracimy punkty na własne życzenie. Chcę reakcji.'],
    'ko.level': ['Nie chcę dogrywki. Rozstrzygnijmy to w drugiej połowie.'],
    'ko.lead': ['[l1] Jedna bramka przewagi to za mało, żeby być spokojnym. Chcę gola, który zamknie mecz.'],
    'final.lead': ['Trofeum jest blisko, ale jeszcze nie nasze. Chcę kolejnego gola.'],
    'final.level': ['Chcę zobaczyć, kto bardziej chce tego trofeum. Więcej odwagi z przodu.'],
    'leg1.lead': ['Każdy gol więcej przyda się w rewanżu. Chcę jeszcze jednego.'],
    'leg1.level': ['Chcę gola przed rewanżem. Więcej odwagi z przodu.'],
    'leg2.ahead': ['Jesteśmy z przodu w dwumeczu, ale chcę gola, który zamknie sprawę.'],
    'leg2.level': ['Jeden gol może dać nam awans. Chcę go zobaczyć.'],
    'leg2.behind': ['Potrzebujemy goli. Więcej odwagi, więcej ludzi w polu karnym.'],
  },
  shout: {
    'any.lead': ['Prowadzimy, a gracie, jakby było po meczu! Obudźcie się!'],
    'any.level': ['Co to ma być?! Tak się nie gra w tym klubie!'],
    'any.behind': ['Co to ma być?! W tym klubie tak się nie gra!', '[b2] To jest kompromitacja! Wyjdźcie i pokażcie, że macie charakter!'],
    'friendly.all': ['Za wolno i za łatwo tracicie piłkę! W drugiej połowie chcę tempa!'],
    'ko.behind': ['Przegrywamy i odpadamy! Tego chcecie?!'],
    'pfinal.behind': ['Awans ucieka nam sprzed nosa! Tego chcecie?!'],
    'final.behind': ['W finale nie ma jutra! Wyjdźcie i walczcie!'],
    'leg1.behind': ['Nie oddamy dwumeczu w pierwszej połowie pierwszego meczu! Do roboty!'],
    'leg2.ahead': ['Jesteśmy z przodu, a gracie, jakbyśmy już awansowali! Obudźcie się!'],
    'leg2.level': ['Wszystko się waży, a wy gracie bez energii!'],
    'leg2.behind': ['Odpadamy! Tego chcecie?! Atak od pierwszej minuty drugiej połowy!'],
  },
  noPressure: {
    'any.lead': ['Prowadzimy. Grajcie swobodnie, bez strachu przed błędem.'],
    'any.level': ['Wszystko jest otwarte. Grajcie odważnie, bez strachu przed błędem.'],
    'any.behind': ['Nie mamy nic do stracenia. Wyjdźcie i grajcie odważnie.', '[b2] Wynik już jest zły, więc grajcie bez strachu. Każdy gol coś da.'],
    'friendly.all': ['Wynik sparingu nie ma znaczenia. Próbujcie, ryzykujcie, uczcie się.'],
    'ko.behind': ['Albo zaryzykujemy, albo odpadamy. Grajcie odważnie.'],
    'final.behind': ['Nikt nie zapamięta tej połowy, jeśli ją odwrócimy. Grajcie odważnie.'],
    'leg1.behind': ['Nawet przy tym wyniku dwumecz jest otwarty. Grajcie odważnie.'],
    'leg2.ahead': ['Mamy przewagę. Grajcie swobodnie, bez strachu.'],
    'leg2.level': ['Wszystko jest otwarte. Grajcie odważnie.'],
    'leg2.behind': ['Nie mamy nic do stracenia. Ryzykujemy i atakujemy.'],
  },
  defend: {
    'any.lead': ['Prowadzimy. Zwarte linie, rywal nie może dostać ani metra.', 'Teraz najważniejsza jest obrona. Utrzymajmy to prowadzenie.'],
    'any.level': ['Najpierw nie stracić gola. Okazja z przodu przyjdzie.'],
    'any.behind': ['Nie możemy stracić kolejnego gola. Najpierw obrona, potem gonimy.'],
    'friendly.all': ['W drugiej połowie ćwiczymy ustawienie w obronie. Każdy pilnuje swojej strefy.'],
    'points.lead': ['Punkty są na wyciągnięcie ręki. Zwarte linie do końca.'],
    'ko.lead': ['Czterdzieści pięć minut do awansu. Zwarte linie, żadnych prezentów.'],
    'final.lead': ['Czterdzieści pięć minut obrony i trofeum jest nasze.'],
    'pfinal.lead': ['Czterdzieści pięć minut do awansu. Zwarte linie, żadnych prezentów.'],
    'leg1.lead': ['[home] Nie traćmy gola u siebie. Zwarte linie.', 'Utrzymajmy tę zaliczkę przed rewanżem. Zwarte linie.'],
    'leg2.ahead': ['Czterdzieści pięć minut do awansu. Nie dajmy rywalowi gola, który da mu nadzieję.'],
    'leg2.level': ['Nie możemy dać rywalowi gola. Zwarte linie, cierpliwie.'],
    'leg2.behind': ['Nie możemy stracić gola, ale musimy też strzelać. Najpierw spokój z tyłu, potem atak.'],
  },
};

const HALF_PARENT = { pfinal: 'ko' };

function halfGroup(c) {
  if (c.kind === 'friendly') return 'friendly';
  if (c.leg?.n === 1) return 'leg1';
  if (c.leg?.n === 2 && c.leg.first) return 'leg2';
  if (c.kind === 'playoffFinal') return 'pfinal';
  if (c.final) return 'final';
  if (c.points) return 'points';
  if (c.knockout) return 'ko';
  return 'any';
}

// Po meczu: grupa (rodzaj meczu i rozstrzygnięcie) i wynik W, D, L albo 'all'.
const POST_LINES = {
  praise: {
    'any.W': ['Dziękuję za ten mecz. Tak się gra.', 'Świetna robota, wszyscy zasłużyliście na pochwałę.'],
    'any.D': ['Za zaangażowanie należą wam się słowa uznania.'],
    'any.L': ['Przegraliśmy, ale za walkę należy się wam szacunek.'],
    'friendly.W': ['Dobry sprawdzian. Zrealizowaliście sporo z tego, co ćwiczyliśmy.', 'Dobra praca. Widać, że trening przynosi efekty.'],
    'friendly.D': ['Wynik sparingu nie jest ważny. Podobało mi się wasze zaangażowanie.'],
    'friendly.L': ['Wynik sparingu nie jest ważny. Podobało mi się wasze zaangażowanie.'],
    'points.W': ['Zasłużone zwycięstwo. Dziękuję za ten mecz.', 'Komplet punktów zasłużony. Tak się gra.'],
    'points.D': ['Punkt to nie jest zły wynik, a za walkę należy się wam uznanie.'],
    'adv.all': ['Awans wywalczony. Zasłużyliście na to.', 'Jesteśmy dalej i to wasza zasługa. Dziękuję za ten mecz.'],
    'padv.all': ['Jesteśmy w finale baraży. Zasłużyliście na to, został jeszcze jeden krok.'],
    'out.all': ['Odpadamy, ale za walkę jestem wam wdzięczny.', 'To boli, ale nie mam do was pretensji o zaangażowanie.'],
    'pout.all': ['Zabrakło niewiele. Za ten sezon i za walkę jestem wam wdzięczny.'],
    'trophy.all': ['Zdobyliście trofeum. Zapamiętajcie ten dzień, zasłużyliście na niego.', 'To trofeum jest wasze. Jestem z was ogromnie dumny.'],
    'lostFinal.all': ['Przegraliśmy finał, ale za walkę jestem z was dumny.', 'Dziś boli, ale samo dojście do tego meczu to wasza zasługa.'],
    'promoted.all': ['Awans! Zasłużyliście na to każdym treningiem tego sezonu.'],
    'leg1.W': ['Dobry wynik przed rewanżem. Dziękuję.'],
    'leg1.D': ['Wszystko otwarte przed rewanżem, a wasza postawa daje nadzieję.'],
    'leg1.L': ['Przegraliśmy pierwszy mecz, ale dwumecz trwa. Za walkę dziękuję.'],
  },
  criticize: {
    'any.W': ['Wygraliśmy, ale nie podobała mi się nasza gra. Wiem, że stać was na więcej.'],
    'any.D': ['Nie tak się umawialiśmy. To było za mało.'],
    'any.L': ['Nie tak się umawialiśmy. To było za mało.', 'Za mało biegania, za mało jakości. Tak się nie wygrywa.'],
    'friendly.W': ['Wygraliśmy, ale w sparingu chodzi o realizację założeń, a z tym było słabo.'],
    'friendly.D': ['Sparing czy nie, tak się nie gra. Za dużo prostych strat.'],
    'friendly.L': ['Sparing czy nie, tak się nie gra. Za dużo prostych strat.'],
    'points.D': ['Oddaliśmy punkty, które powinny być nasze. To było za mało.'],
    'points.L': ['Oddaliśmy te punkty za łatwo. To było za mało.'],
    'adv.all': ['Awansowaliśmy, ale gra była daleka od tego, czego chcę.'],
    'padv.all': ['Jesteśmy w finale baraży, ale z taką grą nie wywalczymy awansu.'],
    'out.all': ['Odpadliśmy na własne życzenie. To boli i powinno boleć.', 'Odpadliśmy, bo zabrakło konsekwencji. Każdy musi spojrzeć w lustro.'],
    'pout.all': ['Mieliśmy awans w zasięgu i go oddaliśmy. Tak się nie gra w barażach.'],
    'trophy.all': ['Trofeum jest nasze, ale o grze porozmawiamy po świętowaniu.'],
    'lostFinal.all': ['Finału się nie gra, finał się wygrywa. Dziś zabrakło nam odwagi.'],
    'promoted.all': ['Awans jest, ale z taką grą w wyższej lidze będzie bardzo ciężko.'],
    'leg1.W': ['Wygraliśmy, ale mogliśmy zbudować większą zaliczkę.'],
    'leg1.D': ['Ten wynik nic nam nie daje przed rewanżem. Stać nas na więcej.'],
    'leg1.L': ['Ten wynik utrudnia nam rewanż. Stać nas na więcej.'],
  },
  neutral: {
    'any.all': ['Przeanalizujemy to na spokojnie.', 'Na gorąco nie będę oceniał. Jutro siądziemy do wideo.'],
    'friendly.all': ['Mamy sporo materiału do analizy. Wnioski omówimy na treningu.'],
    'adv.all': ['Awans jest, resztę przeanalizujemy na spokojnie.'],
    'padv.all': ['Finał baraży jest nasz. Resztę przeanalizujemy na spokojnie.'],
    'out.all': ['Odpadliśmy. Przeanalizujemy, co poszło nie tak.'],
    'pout.all': ['To boli. Na spokojnie przeanalizujemy, czego zabrakło.'],
    'trophy.all': ['Gratuluję. Analizy zostawmy na później, dziś świętujcie.'],
    'lostFinal.all': ['To boli. Na spokojnie przeanalizujemy, czego zabrakło.'],
    'promoted.all': ['Gratuluję awansu. Analizy zostawmy na później.'],
    'leg1.all': ['Przeanalizujemy ten mecz przed rewanżem.'],
  },
  focusNext: {
    'any.W': ['Cieszymy się dziś, a od jutra myślimy o następnym meczu.'],
    'any.D': ['Zamykamy temat. Od jutra myślimy o następnym rywalu.'],
    'any.L': ['Zamykamy temat. Od jutra myślimy o następnym rywalu.'],
    'friendly.all': ['Sparing za nami. Wnioski przenosimy na trening i na mecze o stawkę.'],
    'points.W': ['Zwycięstwo dopisane. Od jutra myślimy o kolejnym meczu.'],
    'adv.all': ['Awans to tylko krok. Od jutra myślimy o kolejnym meczu.'],
    'padv.all': ['Cieszymy się krótko. Od jutra myślimy tylko o finale baraży.'],
    'out.all': ['Przygoda w tych rozgrywkach się skończyła. Teraz cała energia na kolejne mecze.'],
    'pout.all': ['Sezon się skończył. Odpocznijcie, a potem wracamy silniejsi.'],
    'trophy.all': ['Świętujcie dziś, bo od jutra znów pracujemy.', 'Trofeum mamy. Jutro wracamy do pracy, bo sezon trwa.'],
    'lostFinal.all': ['Ten finał zostanie z nami, ale od jutra myślimy o kolejnych meczach.'],
    'promoted.all': ['Świętujcie, a potem przygotowujemy się do gry ligę wyżej.'],
    'leg1.all': ['Pierwsza połowa dwumeczu za nami. Od jutra myślimy o rewanżu.'],
  },
};

function postGroup(c) {
  if (c.kind === 'friendly') return 'friendly';
  if (c.outcome) return c.outcome;
  if (c.leg?.n === 1) return 'leg1';
  if (c.points) return 'points';
  return 'any';
}

const wrapQuote = (s) => `„${s}”`;

/**
 * Cytat przemowy dopasowany do kontekstu (czysta funkcja, deterministyczny z ziarna).
 * phase: 'pre' | 'half' (opts.score: {for, against}) | 'post' (opts.result: 'W'|'D'|'L', kontekst z outcome).
 * Bez kontekstu zwraca stały cytat z TONES albo POST_TONES.
 */
export function toneQuote(tone, context, { phase = 'pre', seed = 'odprawa', score, result } = {}) {
  const base = phase === 'post' ? POST_TONES[tone] : TONES[tone];
  if (!base) throw new RangeError(`Nieznana przemowa: ${tone}`);
  if (!context) return base.quote;
  const c = context;
  const rng = new Rng(`${seed}|cytat|${phase}|${tone}|${c.key ?? c.kind}`);
  const pick = (pool, x = {}) => {
    const ok = (pool || []).filter((l) => lineFits(l, c, x));
    return ok.length ? ok[Math.floor(rng.next() * ok.length)] : null;
  };
  if (phase === 'pre') {
    let line = null;
    for (const k of PRE_CHAIN[c.key] || ['any']) { line = pick(PRE_LINES[tone][k]); if (line) break; }
    if (!line) return base.quote;
    let text = lineText(line);
    const mk = modKey(c);
    const gapMod = mk === 'muchStronger' || mk === 'muchWeaker' || mk === 'fStrong' || mk === 'fWeak';
    if (mk && !(gapMod && lineTagged(line, ['under', 'fav']))) {
      const mod = pick(PRE_MOD[tone][mk]);
      if (mod) text = `${text} ${lineText(mod)}`;
    }
    return wrapQuote(text);
  }
  if (phase === 'half') {
    const gf = score?.for ?? 0; const ga = score?.against ?? 0;
    const x = { behindBy: Math.max(0, ga - gf), leadBy: Math.max(0, gf - ga) };
    const g = halfGroup(c);
    let state = gf > ga ? 'lead' : gf === ga ? 'level' : 'behind';
    if (g === 'leg2') {
      const d = gf + c.leg.first[0] - (ga + c.leg.first[1]);
      state = d > 0 ? 'ahead' : d === 0 ? 'level' : 'behind';
    }
    const anyState = g === 'leg2' ? { ahead: 'lead', level: 'level', behind: 'behind' }[state] : state;
    const parent = HALF_PARENT[g];
    const keys = [`${g}.${state}`, `${g}.all`, ...(parent ? [`${parent}.${state}`] : []), `any.${anyState}`];
    for (const k of keys) { const line = pick(HALF_LINES[tone][k], x); if (line) return wrapQuote(lineText(line)); }
    return base.quote;
  }
  const g = postGroup(c);
  const r = result || 'D';
  for (const k of [`${g}.${r}`, `${g}.all`, `any.${r}`, 'any.all']) { const line = pick(POST_LINES[tone][k]); if (line) return wrapQuote(lineText(line)); }
  return base.quote;
}

/** Wszystkie przemowy fazy z cytatami dla kontekstu: { ton: { label, quote } } (ekran odprawy). */
export function toneQuotes(phase, context, opts = {}) {
  const tones = phase === 'post' ? POST_TONES : TONES;
  return Object.fromEntries(Object.entries(tones).map(([k, t]) => [k, { label: t.label, quote: toneQuote(k, context, { ...opts, phase }) }]));
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
  // rewanż: trener AI wybiera ton wg stanu dwumeczu, jak szatnia gracza
  let tone = aiChooseSpeech(team.coach || 'P', phase === 'half' && ctx.ko?.agg != null ? { ...ctx, diff: (ctx.diff ?? 0) + ctx.ko.agg } : ctx);
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
