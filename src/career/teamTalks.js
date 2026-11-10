// Motywacja drużyny poza dniem meczowym (Kadra -> Rozmowy): zebranie drużyny raz w tygodniu i rozmowy
// indywidualne (do 3 w tygodniu). Efekt zależy od sytuacji (forma zespołu wobec oczekiwań), charakteru
// zawodnika, jego formy, roli i zaufania do trenera. Powtarzanie tego samego słabnie, a nietrafiona
// rozmowa potrafi urazić. Zaufanie zapisuje ta sama mechanika co odprawy (applyTrust z pamięcią urazy).
// Wartości [SZAC]; skala morale 1-20 (src/career/morale.js).

import { Rng, clamp } from '../core/rng.js';
import { squadOf } from '../world/worldGen.js';
import { applyMorale } from './morale.js';
import { applyTrust, classifyReaction, REACTIONS } from '../match/briefings.js';

export const MEETING_TONES = {
  praise: { label: 'Pochwała', quote: '„Dobra robota w ostatnich tygodniach. Tak trzymać.”', hint: 'Działa po dobrej serii. Przy słabych wynikach brzmi fałszywie.' },
  demand: { label: 'Wymagam więcej', quote: '„Stać nas na dużo więcej. Od jutra podnosimy poprzeczkę.”', hint: 'Mobilizuje ambitnych po słabszych meczach. Wrażliwych może zdołować.' },
  calm: { label: 'Spokój i cierpliwość', quote: '„Bez paniki. Trzymamy się planu, wyniki przyjdą.”', hint: 'Uspokaja po serii porażek, szczególnie wrażliwych i młodych.' },
  unity: { label: 'Jedność zespołu', quote: '„Wygrywamy i przegrywamy razem. Nikt nie zostaje sam.”', hint: 'Bezpieczny wybór. Pomaga, gdy w szatni są niezadowoleni.' },
  criticize: { label: 'Ostra krytyka', quote: '„To, co pokazujemy, jest nie do przyjęcia.”', hint: 'Ryzykowna. Czasem budzi ambitnych, częściej psuje atmosferę.' },
};

export const PLAYER_TALKS = {
  praise: { label: 'Pochwała za formę', quote: '„Świetnie wyglądasz na boisku. Tak dalej.”' },
  encourage: { label: 'Podbuduj', quote: '„Wierzę w ciebie. Głowa do góry.”' },
  demand: { label: 'Wymagaj więcej', quote: '„Oczekuję od ciebie więcej na treningach i w meczach.”' },
  role: { label: 'Rozmowa o roli', quote: '„Wyjaśnię ci, jak widzę twoją rolę i kiedy dostaniesz szansę.”' },
  future: { label: 'Rozmowa o przyszłości', quote: '„Chcę, żebyś został w klubie. Porozmawiajmy o planach.”' },
  warn: { label: 'Ostrzeżenie (dyscyplina)', quote: '„Za dużo kartek i nerwów. Musisz się kontrolować.”' },
};

export const TALKS_PER_WEEK = 3;
const DAY = 86400000;
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / DAY);
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function state(game) {
  game.talks = game.talks ?? { lastMeeting: null, tones: [], log: [], perPlayer: {} };
  return game.talks;
}

/** Sytuacja drużyny: ostatnie 5 meczów ligi i pucharów gracza. */
export function teamSituation(game) {
  const last = (game.fixtures ?? []).filter((f) => f.played && f.result && (f.home === game.clubId || f.away === game.clubId))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-5)
    .map((f) => { const s = f.home === game.clubId ? 0 : 1; const [a, b] = f.result.score; const me = s ? b : a; const op = s ? a : b; return me > op ? 'W' : me < op ? 'L' : 'D'; });
  const w = last.filter((x) => x === 'W').length; const l = last.filter((x) => x === 'L').length;
  const key = last.length < 2 ? 'neutral' : w >= 3 ? 'good' : l >= 3 ? 'bad' : 'neutral';
  return { key, last, label: { good: 'Dobra seria', bad: 'Słaba seria', neutral: 'Wyniki w normie' }[key] };
}

const trustOf = (p, clubId) => p.relations?.[clubId]?.trust ?? 50;
const minutesShare = (game, p) => {
  const played = (game.fixtures ?? []).filter((f) => f.played && (f.home === game.clubId || f.away === game.clubId)).length;
  return played ? clamp((p.season?.min ?? 0) / (played * 90), 0, 1) : 0.5;
};

// ------------------------------------------------------------ Zebranie drużyny
const MEET_BASE = {
  praise: { good: 1.6, neutral: 0.5, bad: -0.8 },
  demand: { good: -0.4, neutral: 0.6, bad: 1.0 },
  calm: { good: 0, neutral: 0.3, bad: 0.8 },
  unity: { good: 0.5, neutral: 0.6, bad: 0.6 },
  criticize: { good: -1.6, neutral: -0.6, bad: 0.2 },
};
const PERSONA = {
  praise: { Wrażliwy: 0.3, Ambitny: -0.2 },
  demand: { Ambitny: 0.6, Lider: 0.4, Wrażliwy: -1.2, Narwaniec: 0.2 },
  calm: { Wrażliwy: 0.6, Spokojny: 0.3, Narwaniec: -0.2 },
  unity: { Lider: 0.3 },
  criticize: { Ambitny: 0.5, Lider: 0.2, Wrażliwy: -1.8, Narwaniec: -0.6 },
};

export function canHoldMeeting(game) {
  const T = state(game);
  return !T.lastMeeting || daysBetween(T.lastMeeting, game.date) >= 7;
}

/** Zebranie drużyny: zwraca reakcje zawodników (bez liczb) i ogólny odbiór. Zmienia morale i zaufanie. */
export function holdMeeting(game, tone) {
  const T = state(game);
  if (!MEETING_TONES[tone]) throw new Error(`Nieznany ton: ${tone}`);
  if (!canHoldMeeting(game)) return { ok: false, text: 'Zebranie odbyło się w tym tygodniu. Kolejne za kilka dni.' };
  const sit = teamSituation(game);
  const rng = new Rng(`zebranie:${game.seed}:${game.date}:${tone}`);
  const repeats = T.tones.slice(-3).filter((t) => t === tone).length;
  const unhappy = squadOf(game.world, game.clubId).filter((p) => p.unhappy || (p.morale ?? 12) <= 8).length;
  const out = [];
  for (const p of squadOf(game.world, game.clubId)) {
    let z = MEET_BASE[tone][sit.key] + (PERSONA[tone][p.persona] ?? 0);
    if (tone === 'unity' && unhappy >= 3) z += 0.5;
    z += (trustOf(p, game.clubId) - 50) / 50; // szacunek do trenera wzmacnia przekaz
    z -= repeats * 0.6; // ta sama przemowa po raz kolejny działa słabiej
    z += rng.gauss(0, 0.5);
    const trustD = z >= 1.6 ? 0.5 : z <= -1.2 ? -1 : 0;
    if (trustD) p.relations = { ...(p.relations ?? {}), [game.clubId]: applyTrust(p, trustD, `zebranie:${tone}`, { clubId: game.clubId, date: game.date }) };
    p.morale = applyMorale(p.morale ?? 12, clamp(z * 0.7, -2, 2));
    const kind = classifyReaction(z * 1.6, trustD);
    out.push({ id: p.id, name: p.name, reaction: kind, label: REACTIONS[kind].label });
  }
  T.lastMeeting = game.date; T.tones = [...T.tones, tone].slice(-6);
  const pos = out.filter((r) => r.reaction === 'zmotywowany' || r.reaction === 'spokojny').length;
  const neg = out.filter((r) => r.reaction === 'urazony' || r.reaction === 'zdenerwowany').length;
  const summary = pos >= out.length * 0.6 ? 'Drużyna dobrze przyjęła twoje słowa.' : neg >= out.length * 0.35 ? 'Część drużyny źle przyjęła zebranie. Atmosfera jest napięta.' : 'Reakcje są mieszane.';
  T.log = [{ date: game.date, kind: 'meeting', tone, summary }, ...T.log].slice(0, 20);
  return { ok: true, situation: sit, players: out, summary, repeated: repeats > 0 };
}

// ------------------------------------------------------------ Rozmowy indywidualne
export function talksThisWeek(game) {
  const T = state(game);
  return T.log.filter((x) => x.kind === 'talk' && daysBetween(x.date, game.date) < 7).length;
}

/** Kto potrzebuje rozmowy: niskie morale, niezadowolenie, ławka, kończący się kontrakt, dobra forma. */
export function talkSuggestions(game) {
  const out = [];
  for (const p of squadOf(game.world, game.clubId)) {
    const form = avg(p.form ?? []);
    const share = minutesShare(game, p);
    const months = p.contract?.until ? daysBetween(game.date, p.contract.until) / 30 : 99;
    const reasons = [];
    if ((p.morale ?? 12) <= 8) reasons.push(['encourage', 'Niskie morale']);
    if (p.unhappy || p.transferRequest) reasons.push(['role', 'Jest niezadowolony']);
    if (share < 0.3 && (p.age ?? 25) >= 21 && (p.season?.apps ?? 0) + 3 < (game.fixtures ?? []).filter((f) => f.played && (f.home === game.clubId || f.away === game.clubId)).length) reasons.push(['role', 'Mało gra']);
    if (months <= 12) reasons.push(['future', 'Kontrakt kończy się w ciągu roku']);
    if (form != null && form >= 7.2) reasons.push(['praise', 'Bardzo dobra forma']);
    if (form != null && form < 6.2 && (p.season?.apps ?? 0) >= 3) reasons.push(['demand', 'Słaba forma']);
    if ((p.season?.yc ?? 0) >= 4) reasons.push(['warn', 'Dużo kartek']);
    if (reasons.length) out.push({ p, reasons });
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length);
}

/** Rozmowa z zawodnikiem. kind z PLAYER_TALKS. Zwraca reakcję i tekst odpowiedzi. */
export function talkToPlayer(game, playerId, kind) {
  const T = state(game);
  const p = game.world.players[playerId];
  if (!p || p.clubId !== game.clubId) return { ok: false, text: 'To nie jest zawodnik twojej drużyny.' };
  if (!PLAYER_TALKS[kind]) throw new Error(`Nieznana rozmowa: ${kind}`);
  if (talksThisWeek(game) >= TALKS_PER_WEEK) return { ok: false, text: `W tym tygodniu odbyłeś już ${TALKS_PER_WEEK} rozmowy. Kolejne za kilka dni.` };
  const rng = new Rng(`rozmowa:${game.seed}:${game.date}:${playerId}:${kind}`);
  const hist = (T.perPlayer[playerId] ?? []).filter((x) => daysBetween(x.date, game.date) < 21);
  const same = hist.filter((x) => x.kind === kind).length;
  const form = avg(p.form ?? []) ?? 6.6;
  const share = minutesShare(game, p);
  const persona = p.persona ?? 'Spokojny';
  const trust = trustOf(p, game.clubId);
  let z = 0; let reply = '';
  switch (kind) {
    case 'praise':
      z = form >= 7 ? 1.8 : form >= 6.6 ? 0.8 : -0.4;
      reply = form >= 7 ? 'Dziękuje i obiecuje, że utrzyma formę.' : 'Wygląda na zaskoczonego. Wie, że ostatnio nie grał najlepiej.';
      break;
    case 'encourage':
      z = (p.morale ?? 12) <= 10 || form < 6.5 ? 1.6 + (persona === 'Wrażliwy' ? 0.8 : 0) : 0.4;
      reply = z >= 1.5 ? 'Uśmiecha się. Widać, że tego potrzebował.' : 'Kiwa głową. Nie bardzo wie, po co ta rozmowa.';
      break;
    case 'demand':
      z = (form < 6.6 ? 0.8 : -0.6) + ({ Ambitny: 0.8, Lider: 0.5, Wrażliwy: -1.6, Narwaniec: -0.4 }[persona] ?? 0);
      reply = z >= 0.8 ? 'Odpowiada, że weźmie się do roboty.' : z <= -0.8 ? 'Czuje się niesprawiedliwie oceniony.' : 'Przyjmuje uwagi bez entuzjazmu.';
      break;
    case 'role':
      z = share < 0.4 || p.unhappy ? 1.2 : 0.2;
      if (p.unhappy && (p.rep ?? 30) >= 50 && share < 0.3) z = -0.3; // znany zawodnik na ławce nie da się zbyć słowami
      if (z > 0.8) { p.unhappy = false; if (p.transferRequest && rng.chance(0.5)) p.transferRequest = false; }
      reply = z > 0.8 ? 'Rozumie swoją sytuację i zapowiada walkę o skład.' : z < 0 ? 'Oczekuje gry, a nie słów. Nadal jest niezadowolony.' : 'Przyjmuje wyjaśnienia.';
      break;
    case 'future': {
      const months = p.contract?.until ? daysBetween(game.date, p.contract.until) / 30 : 99;
      z = months <= 12 ? 1.0 + (trust - 50) / 40 : 0.3;
      if (months <= 12 && z > 0.8) p.renewMood = Math.min(3, (p.renewMood ?? 0) + 1);
      reply = z > 0.8 ? 'Mówi, że chętnie zostanie, jeśli warunki będą dobre.' : months <= 12 ? 'Odpowiada wymijająco. Czeka na oferty.' : 'Cieszy się, że klub o nim myśli.';
      break;
    }
    case 'warn':
      z = (p.season?.yc ?? 0) >= 3 ? 0.4 + (persona === 'Narwaniec' ? -0.8 : 0) : -0.6;
      if (z >= 0) p.warnedUntil = new Date(new Date(`${game.date}T12:00:00Z`).getTime() + 21 * DAY).toISOString().slice(0, 10);
      reply = z >= 0 ? 'Obiecuje więcej spokoju na boisku.' : 'Nie rozumie, o co chodzi trenerowi.';
      break;
    default: break;
  }
  z += (trust - 50) / 60 - same * 0.9 + rng.gauss(0, 0.4);
  const trustD = z >= 1.4 ? 1 : z <= -0.8 ? -1.5 : 0;
  if (trustD) p.relations = { ...(p.relations ?? {}), [game.clubId]: applyTrust(p, trustD, `rozmowa:${kind}`, { clubId: game.clubId, date: game.date }) };
  p.morale = applyMorale(p.morale ?? 12, clamp(z, -2.5, 2.5));
  const reaction = classifyReaction(z * 1.8, trustD);
  T.perPlayer[playerId] = [...hist, { date: game.date, kind }];
  T.log = [{ date: game.date, kind: 'talk', playerId, talk: kind, reaction, reply }, ...T.log].slice(0, 20);
  return { ok: true, reaction, label: REACTIONS[reaction].label, reply: same ? `${reply} Słyszał to już niedawno.` : reply };
}
