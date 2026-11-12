// Uwaga trenera dla zawodników, którzy jej potrzebują (docs/bierna-gra.md, rozdz. rozmowy). Wrażliwi, zawodnicy
// z niskim morale, nowi w klubie i ambitni rezerwowi źle znoszą długi brak rozmowy: ich morale powoli spada,
// a po dłuższym czasie słabnie zaufanie do trenera, ambitny rezerwowy staje się niezadowolony. Rozmowa
// (Kadra -> Rozmowy, rozmowa indywidualna na odprawie) zeruje licznik, zebranie drużyny liczy się w połowie.
// Kluby AI: ta sama reguła, rozmowy prowadzi trener (szansa w tygodniu z atrybutu motywacji, career/coaches.js).
// Spadek jest ograniczony (nie niżej niż ATTN.floor) i powolny. Wartości [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { applyMorale } from './morale.js';
import { applyTrust } from '../match/briefings.js';
import { personalityOf } from './personality.js';
import { coachOf, coachSkill } from './coaches.js';
import { PASSIVE } from '../training/scouting.js';

export const ATTN = {
  grace: 21, // tyle dni bez rozmowy zawodnik znosi bez skutków
  ramp: 28, // potem w ciągu 4 tygodni skutek rośnie do pełnego
  week: 0.45, // spadek morale w tygodniu przy pełnej potrzebie (dryf tygodniowy +0,3 znosi większość)
  floor: 9, // samo zaniedbanie nie obniża morale poniżej 9
  trustEvery: 4, trustD: -0.5, // co 4 tygodnie pełnego zaniedbania: mniejsze zaufanie do trenera
  unhappyAfter: 10, unhappyP: 0.2, // ambitny rezerwowy po 10 tygodniach: szansa na niezadowolenie w tygodniu
  meetingFactor: 2, // zebranie drużyny liczy się jak rozmowa sprzed dwa razy dłuższego czasu
  newcomerDays: 60, benchShare: 0.35, benchMinGames: 6,
  ai: { base: 0.3, mot: 0.2, min: 0.1, max: 0.5 }, // szansa, że trener AI porozmawia z zawodnikiem w tygodniu
  hintEvery: 42, // przypomnienie asystenta o tym samym zawodniku najwyżej co 6 tygodni
};

const DAY = 86400000;
const days = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

/**
 * Potrzeba rozmowy (0-1) i powód. share: udział minut zawodnika wobec najczęściej grającego w klubie,
 * games: mecze klubu w sezonie.
 */
export function attentionNeed(p, date, { share = 1, games = 0 } = {}) {
  if (!p || p.injuryDays > 0 && p.injuryDays > 60) return { need: 0, why: null }; // długi uraz: opiekuje się sztab medyczny
  const out = [];
  if (p.persona === 'Wrażliwy') out.push([1, 'sensitive']);
  if (p.acclim || (p.lastMove && days(p.lastMove, date) <= ATTN.newcomerDays)) out.push([0.8, 'new']);
  if (games >= ATTN.benchMinGames && share < ATTN.benchShare && (p.age ?? 25) >= 20) {
    const t = personalityOf(p).traits;
    if (p.persona === 'Ambitny' || t.ambition >= 14 || t.playTime >= 14) out.push([1, 'bench']);
  }
  if (!out.length) return { need: 0, why: null };
  out.sort((a, b) => b[0] - a[0]);
  return { need: out[0][0], why: out[0][1], all: out.map((x) => x[1]) };
}

/** Rozmowa z zawodnikiem (dowolna) albo rozmowa indywidualna na odprawie: zeruje licznik zaniedbania. */
export function noteAttention(p, date, kind = 'talk') {
  if (!p) return;
  const a = p.att ?? {};
  p.att = kind === 'meeting' ? { ...a, m: date } : { ...a, t: date, w: 0 };
}

/** Dni od ostatniej uwagi trenera (rozmowa; zebranie liczy się podwójnie). Brak zapisu: od startDate. */
export function daysSinceAttention(p, date, startDate) {
  const a = p.att ?? {};
  const t = a.t ? days(a.t, date) : days(startDate ?? date, date);
  const m = a.m ? days(a.m, date) * ATTN.meetingFactor : Infinity;
  return Math.max(0, Math.min(t, m));
}

/** Siła zaniedbania 0-1 (potrzeba x narastanie po okresie karencji). */
export function neglectLevel(p, date, ctx, startDate) {
  const { need } = attentionNeed(p, date, ctx);
  if (!need) return 0;
  const gap = daysSinceAttention(p, date, startDate);
  return Math.round(need * clamp((gap - ATTN.grace) / ATTN.ramp, 0, 1) * 1000) / 1000;
}

/** Zaniedbany zawodnik w tygodniu: morale, zaufanie, niezadowolenie. Zwraca opis zmian. */
export function neglectWeek(p, level, { clubId, date, rng, need } = {}) {
  if (!(level > 0)) { if (p.att?.w) p.att = { ...p.att, w: 0 }; return null; }
  const out = { morale: 0, trust: 0, unhappy: false };
  const mor = p.morale ?? 12;
  if (mor > ATTN.floor) {
    const next = Math.max(ATTN.floor, applyMorale(mor, -ATTN.week * level));
    out.morale = Math.round((next - mor) * 100) / 100;
    p.morale = next;
  }
  const w = (p.att?.w ?? 0) + (level >= 0.99 ? 1 : 0);
  p.att = { ...(p.att ?? {}), w };
  if (level >= 0.99 && w % ATTN.trustEvery === 0) {
    p.relations = { ...(p.relations ?? {}), [clubId]: applyTrust(p, ATTN.trustD, 'zaniedbanie', { clubId, date }) };
    out.trust = ATTN.trustD;
  }
  if (need === 'bench' && w >= ATTN.unhappyAfter && !p.unhappy && rng?.chance(ATTN.unhappyP)) { p.unhappy = true; out.unhappy = true; }
  return out;
}

/** Szansa rozmowy trenera AI z zawodnikiem w tygodniu (motywacja trenera). */
export function aiTalkChance(game, clubId) {
  const c = coachOf(game, clubId);
  const A = ATTN.ai;
  return clamp(A.base + A.mot * (c ? coachSkill(c.a.MOT) : 0), A.min, A.max);
}

function clubContext(game, ids) {
  let maxMin = 0;
  for (const id of ids) maxMin = Math.max(maxMin, game.world.players[id]?.season?.min ?? 0);
  const games = maxMin / 90;
  return { maxMin, games };
}

const WHY = {
  sensitive: 'jest wrażliwy i od dawna nie rozmawiał z trenerem',
  low: 'ma niskie morale i czeka na rozmowę',
  new: 'jest nowy w klubie i potrzebuje rozmowy o swojej roli',
  bench: 'mało gra i jest coraz bardziej sfrustrowany',
};

/** Tydzień w klubie: kluby AI (rozmowy trenera z szansą) i klub gracza (licznik i przypomnienia asystenta). */
export function attentionWeek(game, date) {
  if (!PASSIVE.enabled || !PASSIVE.attention || !game?.world?.clubs) return [];
  const start = game.attStart ?? (game.attStart = date);
  const messages = [];
  const hints = [];
  for (const [clubId, club] of Object.entries(game.world.clubs)) {
    const ids = club.squad ?? [];
    if (!ids.length) continue;
    const user = clubId === game.clubId;
    const { maxMin, games } = clubContext(game, ids);
    const rng = new Rng(`uwaga:${game.seed}:${clubId}:${date}`);
    const pTalk = user ? 0 : aiTalkChance(game, clubId);
    for (const id of ids) {
      const p = game.world.players[id];
      if (!p || p.squad === 'Y') continue;
      const ctx = { share: maxMin > 0 ? (p.season?.min ?? 0) / maxMin : 1, games };
      const n = attentionNeed(p, date, ctx);
      if (!n.need) { if (p.att?.w) p.att = { ...p.att, w: 0 }; continue; }
      if (!user && rng.chance(pTalk)) { noteAttention(p, date); continue; }
      const level = neglectLevel(p, date, ctx, start);
      neglectWeek(p, level, { clubId, date, rng, need: n.why });
      if (user && daysSinceAttention(p, date, start) >= ATTN.grace) {
        const last = p.att?.h;
        if (!last || days(last, date) >= ATTN.hintEvery) hints.push({ p, why: n.why });
      }
    }
  }
  if (hints.length) {
    const top = hints.slice(0, 3);
    for (const h of top) h.p.att = { ...(h.p.att ?? {}), h: date };
    messages.push(createMessage({
      date, category: 'staff', from: 'Asystent trenera', key: `uwaga:${date}`,
      subject: top.length === 1 ? `${top[0].p.name} potrzebuje rozmowy` : 'Zawodnicy czekają na rozmowę',
      body: `${top.map((h) => `${h.p.name} ${WHY[h.why] ?? 'potrzebuje rozmowy'}.`).join(' ')} `
        + 'Bez rozmowy ich morale będzie powoli spadać, a zaufanie do trenera słabnąć. Rozmowę przeprowadzisz w zakładce Kadra, Rozmowy, albo na odprawie przed meczem.',
    }));
  }
  return messages;
}

registerDailySystem({
  id: 'attention', order: 91, // po dryfie morale (season.js, order 90)
  run(game, date) {
    if (!game?.world || new Date(`${date}T12:00:00Z`).getUTCDay() !== 1) return {};
    if (game.attWeek === date) return {};
    game.attWeek = date;
    return { messages: attentionWeek(game, date) };
  },
});
