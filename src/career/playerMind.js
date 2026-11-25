// Decyzja zawodnika przy transferze (docs/negocjacje.md, rozdz. „Decyzja zawodnika przy transferze (Nov 25, 2026)”).
// 1. Bramka „czy chce rozmawiać” po porozumieniu klubów (także wolny zawodnik i umowa od 1 lipca):
//    S = s z willingnessToJoin (przed sigmoidą, bez dublowania) + korekty (rola i minuty, rozwój młodych, morale i prośba
//    o transfer, lojalność, wychowanek, wiek, dom i zagranica, aklimatyzacja, zadowolenie z długiego kontraktu, uraza,
//    agent, termin przejścia) + N(0; 0,35) raz na parę zawodnik-klub w oknie (ziarno). Progi: >= 0,6 chętny,
//    0..0,6 otwarty, -0,7..0 do przekonania, -1,4..-0,7 niechętny, < -1,4 odmawia rozmów. Gracz widzi tylko słowa.
// 2. Termin przejścia (timingValue): mało gra albo prosi o transfer, woli szybko; podstawowy z długim kontraktem albo
//    w walce o cel woli później; kończy mu się kontrakt, woli lato. Czynnik „timing” w offerFactors.js i korekta bramki.
// 3. Blokada po fiasku (rel.lockUntil, MIND.lock w negotiation.js), wcześniejsze otwarcie przy zmianie sytuacji
//    (przestał grać, nowy trener, spadek, prośba o transfer, kontrakt do 6 mies., nasz klub +20 reputacji), uraza do klubu.
// 4. Zawodnik, któremu klub odrzucił uczciwą ofertę (clubOffers.js maybeUpset): S +0,5, ryzyko prośby x1,5 przez 3 mies.
// Kluby AI: ta sama bramka (pamięć na parę i okno). Namysł ze zdarzeniami i kontrakcją klubu: proposals.js. [SZAC]

import { Rng, clamp } from '../core/rng.js';
import { clubById } from '../data/clubs_pl.js';
import { GROUP } from './squad.js';
import { squadOf } from '../world/worldGen.js';
import { personalityOf } from './personality.js';
import { clubReputation } from './reputation.js';
import { relationWith, currentGrudge, expectedRole, ROLE_EXP_SHARE, lockEnd, lockWords } from './negotiation.js';
import { inAcclim, settleFactor, nextWindowOpen, windowAt, addMonths } from './wishMemory.js';
import { homeRegionOf, abroadWish } from './offerFactors.js';
import { playerWillingness } from './transfers.js';
import { slotOf, monthsLeftOf } from './clubOffers.js';
import { directorAttr } from './director.js'; // ocena nastawienia przez dyrektora sportowego (Znajomość rynku)

export const PM = {
  noise: 0.35, hard: -3, // twarda odmowa z willingnessToJoin (klub dużo poniżej poziomu zawodnika)
  thr: { keen: 0.6, open: 0, convince: -0.7, reluctant: -1.4 },
  role: 1.2, roleCap: [-0.6, 0.8], // +1,2 x (udział minut w nowej roli - obecny udział)
  young: { age: 23, gap: 3, slot: 0.35, bench: -0.3 },
  morale: { low: 8, lowS: 0.4, high: 16, highS: -0.3 }, wish: 0.7,
  loyalty: -0.06, homegrown: -0.25, captain: -0.2,
  old: { age: 32, s: 0.2 }, kid: { age: 20, share: 0.35, s: 0.2 },
  home: -0.05, homeBack: 0.1, abroad: 0.25, abroadTies: 15, abroadTiesS: -0.2,
  acclim: -0.5, acclimSettle: -0.8, settleHigh: 0.5,
  months12: 0.1,
  // Zadowolony z długiego kontraktu (bez niezadowolenia i prośby): -contract x (kontrakt 12 -> 36 mies.) - share x (minuty);
  // kalibracja: zawodnik zadowolony z kontraktem na 3+ lata odmawia rozmów w 55-70 % (tests/playerMind.test.mjs)
  stay: { contract: 1.8, share: 0.4, from: 12, span: 24, shareFrom: 0.3, shareSpan: 0.5, moraleMin: 9 },
  grudge: -0.03, sour: -0.3,
  agent: { rekin: 0.15, rodzinny: -0.1 },
  spurned: { s: 0.5, months: 3, hazard: 1.5 },
  refuseLock: { base: 3, loyal: 6, loyalty: 15 }, // odmowa rozmów: 3 mies. (6 przy lojalności >= 15 i walce klubu o cel)
};

export const VERDICT_LABELS = { keen: 'chętny', open: 'otwarty', convince: 'do przekonania', reluctant: 'niechętny', refuse: 'odmawia rozmów' };

/**
 * Nastawienie widziane przez dyrektora sportowego gracza (kafelek „Nastawienie” i kolumny list w Transferach, Nov 25, 2026):
 * wynik bramki rozmów (talkGate) z błędem dyrektora: sd = 0,15 + 0,55 (1 - q), q z Znajomości rynku (RYN 1-20).
 * Błąd stały dla zawodnika w danym oknie, więc ocena się nie zmienia przy każdym otwarciu karty. [SZAC]
 */
export const DIR_VIEW = { sd0: 0.15, sd1: 0.55 };
export const DIR_VIEW_LABELS = { keen: 'chętny', open: 'otwarty', convince: 'do przekonania', reluctant: 'niechętny', refuse: 'odmówi rozmów' };
export function directorTalkView(game, p, date = game.date) {
  const g = talkGate(game, p, game.clubId, { date });
  const q = (clamp(directorAttr(game, game.clubId, 'RYN'), 1, 20) - 1) / 19;
  const e = new Rng(`mind-dyrektor:${game.seed}:${p.id}:${game.clubId}:${periodKey(date)}`).gauss(0, DIR_VIEW.sd0 + DIR_VIEW.sd1 * (1 - q));
  const verdict = g.S <= PM.hard ? 'refuse' : verdictOf(g.S + e);
  return { verdict, label: DIR_VIEW_LABELS[verdict] };
}

/** Werdykt z wyniku S. */
export function verdictOf(S) {
  const T = PM.thr;
  return S >= T.keen ? 'keen' : S >= T.open ? 'open' : S >= T.convince ? 'convince' : S >= T.reluctant ? 'reluctant' : 'refuse';
}

const periodKey = (date) => windowAt(date)?.from ?? `po-${nextWindowOpen(date)}`;
const groupOf = (p) => GROUP[p.pos] ?? 'MID';

// ------------------------------------------------------------ Termin przejścia
/**
 * Jak zawodnikowi pasuje termin przejścia: -0,3..+0,4. mode: 'now' | 'window' | 'season' (clubOffers.js WHEN_LABELS),
 * null: bez terminu (wolny zawodnik). „Szybko” to teraz albo najbliższe okno, gdy okno jest zamknięte.
 */
export function timingValue(game, p, mode, date = game.date, slot = undefined) {
  if (!p?.clubId || !mode) return 0;
  const sl = slot === undefined ? slotOf(game, p, date) : slot;
  const soon = mode === 'now' || (mode === 'window' && !windowAt(date));
  const ml = monthsLeftOf(p, date);
  const wish = !!(p.moveWish || p.transferRequest);
  if (wish || p.unhappy || (sl && sl.share < 0.35)) return soon ? (wish ? 0.4 : 0.25) : -0.3;
  if (ml > 0 && ml <= 6) return soon ? 0 : 0.3;
  if (sl?.starter && (ml >= 24 || sl.fight)) return soon ? (sl.fight && sl.mid ? -0.3 : -0.2) : 0.1;
  return 0;
}

// ------------------------------------------------------------ Bramka „czy chce rozmawiać”
/**
 * Bramka (bez skutków). opts: { date, mode (termin przejścia) }. Zwraca { S, verdict, base, noise, parts, reason }.
 * reason: najmocniejsza korekta ujemna (do słów przy odmowie). Ziarno szumu: gra, zawodnik, klub, okno.
 */
export function talkGate(game, p, toClubId = game.clubId, { date = game.date, mode = null } = {}) {
  const parts = {};
  const noise = new Rng(`mind-bramka:${game.seed}:${p.id}:${toClubId}:${periodKey(date)}`).gauss(0, PM.noise);
  const w = playerWillingness(game, p, toClubId);
  if (!Number.isFinite(w.s)) return { S: PM.hard, verdict: 'refuse', base: PM.hard, noise: 0, parts: { level: PM.hard }, reason: 'level' };
  const { traits: t, agent } = personalityOf(p);
  const to = clubById(toClubId) ?? { prestige: 3, tier: 1 };
  const sl = p.clubId ? slotOf(game, p, date) : null;
  const age = p.age ?? 25;
  const ml = p.clubId ? monthsLeftOf(p, date) : 0;
  const wish = !!(p.moveWish || p.transferRequest);
  if (sl) {
    const exp = ROLE_EXP_SHARE[expectedRole(p, to, t)] ?? 0.45;
    parts.role = clamp(PM.role * (exp - sl.share), PM.roleCap[0], PM.roleCap[1]);
  }
  if (age <= PM.young.age && (p.hidden?.POT ?? p.ovr ?? 10) - (p.ovr ?? 10) >= PM.young.gap) {
    const better = squadOf(game.world, toClubId).filter((x) => x.id !== p.id && groupOf(x) === groupOf(p) && x.ovr > p.ovr).length;
    parts.young = better < ({ GK: 1, DEF: 4, MID: 4, ATT: 2 })[groupOf(p)] ? PM.young.slot : PM.young.bench;
  }
  if (p.clubId) {
    const mor = p.morale ?? 12;
    if (mor <= PM.morale.low) parts.morale = PM.morale.lowS; else if (mor >= PM.morale.high) parts.morale = PM.morale.highS;
    if (wish) parts.wish = PM.wish;
    parts.loyalty = PM.loyalty * (t.loyalty - 10);
    if (sl?.homegrown) parts.homegrown = PM.homegrown;
    if (p.clubId === game.clubId && game.tactics?.captain === p.id) parts.captain = PM.captain;
    if (ml > 6 && ml <= 12) parts.contract = PM.months12;
    if (inAcclim(p, date) && !p.unhappy && !wish) parts.acclim = settleFactor(p, date) <= PM.settleHigh ? PM.acclimSettle : PM.acclim;
    // Zadowolony: długi kontrakt i regularna gra, bez niezadowolenia i prośby o transfer
    const S = PM.stay;
    if (!p.unhappy && !wish && (p.morale ?? 12) >= S.moraleMin) {
      parts.stay = -S.contract * clamp((ml - S.from) / S.span, 0, 1) - S.share * clamp(((sl?.share ?? 0.5) - S.shareFrom) / S.shareSpan, 0, 1);
    }
  }
  if (age >= PM.old.age) parts.age = PM.old.s;
  else if (age <= PM.kid.age && sl && sl.share < PM.kid.share) parts.age = PM.kid.s;
  const home = homeRegionOf(p);
  if (to.region && home) {
    if (to.region === home) parts.home = PM.homeBack;
    else if (clubById(p.clubId)?.region === home || !p.clubId) parts.home = PM.home * (t.homeTies - 10);
  }
  if (to.foreign || String(toClubId).startsWith('zagranica')) parts.abroad = t.homeTies >= PM.abroadTies ? PM.abroadTiesS : PM.abroad * abroadWish(p);
  const rel = relationWith(p, toClubId);
  const g = currentGrudge(rel, date);
  if (g) parts.grudge = PM.grudge * g;
  if (rel.sour && rel.sour.until > date) parts.sour = rel.sour.s ?? PM.sour;
  if (PM.agent[agent]) parts.agent = PM.agent[agent];
  if (p.coSpurned && p.coSpurned.until > date) parts.spurned = PM.spurned.s;
  const tv = timingValue(game, p, mode, date, sl);
  if (tv) parts.timing = tv;
  let S = w.s + noise;
  let reason = null; let worst = 0;
  for (const [k, v] of Object.entries(parts)) { S += v; if (v < worst) { worst = v; reason = k; } }
  if (w.s < worst) reason = 'level';
  return { S: Math.round(S * 1000) / 1000, verdict: verdictOf(S), base: w.s, noise, parts, reason };
}

// Pamięć bramki klubów AI: jedna ocena na parę zawodnik-klub w oknie (tylko w pamięci, wynik i tak jest z ziarna)
const CACHE = new WeakMap();
/** Bramka dla klubu AI (z pamięcią na parę i okno). */
export function aiGate(game, p, clubId, date = game.date, mode = 'now') {
  let c = CACHE.get(game);
  if (!c) { c = new Map(); CACHE.set(game, c); }
  const key = `${p.id}:${clubId}:${periodKey(date)}`;
  let r = c.get(key);
  if (!r) {
    if (c.size > 20000) c.clear();
    r = talkGate(game, p, clubId, { date, mode });
    c.set(key, r);
  }
  return r;
}
/** Kasuje pamięć bramki (testy, edytor). */
export function clearGateCache(game) { CACHE.delete(game); }

// ------------------------------------------------------------ Słowa (bez liczb oczekiwań)
const REASON_WORDS = {
  stay: 'Jest zadowolony w obecnym klubie.', loyalty: 'Czuje się związany z klubem.', homegrown: 'To jego klub od zawsze.',
  home: 'Rodzina nie chce zmieniać miasta.', acclim: 'Dopiero się zadomowił.', level: 'Wasz klub to nie jest jego kierunek.',
  grudge: 'Pamięta ostatnie rozmowy z wami.', sour: 'Pamięta ostatnie rozmowy z wami.', role: 'Boi się, że u was nie będzie grał.',
  timing: 'Termin przejścia mu nie odpowiada.', morale: 'Dobrze się czuje w zespole.', captain: 'Jest kapitanem i nie chce zostawiać drużyny.',
  young: 'Boi się, że u was nie będzie grał.', abroad: 'Rodzina nie chce zmieniać kraju.',
};

/** Powód odmowy rozmów słowami (najmocniejsza korekta ujemna) albo pusty tekst. */
export const reasonWords = (gate) => REASON_WORDS[gate?.reason] ?? '';

/** Odpowiedź zawodnika (albo agenta) na zaproszenie do rozmów: zdanie bez liczb. */
export function gateWords(p, gate) {
  const ag = personalityOf(p).agent !== 'brak';
  switch (gate.verdict) {
    case 'keen': return 'Zawodnik jest zainteresowany i gotów usiąść do rozmów.';
    case 'open': return 'Zawodnik wysłucha propozycji, nic nie obiecuje.';
    case 'convince': return ag ? 'Agent zastrzega: zawodnik ma wątpliwości, oferta musi być naprawdę dobra.' : 'Zawodnik ma wątpliwości, oferta musi być naprawdę dobra.';
    case 'reluctant': return 'Zawodnik jest zadowolony tam, gdzie jest. Zgodzi się na jedną rozmowę.';
    default: return `Zawodnik nie widzi sensu rozmów z waszym klubem. ${REASON_WORDS[gate.reason] ?? ''} Wróćcie do tematu za kilka miesięcy.`.replace(/\s+/g, ' ').trim();
  }
}

// ------------------------------------------------------------ Blokada, wcześniejsze otwarcie, uraza
const clubRep = (id) => (clubById(id) ? clubReputation(clubById(id)) : 35);

/** Kontekst blokady (do wcześniejszego otwarcia): klub zawodnika, jego liga, reputacja naszego klubu. */
function lockCtxOf(game, p, clubId, date) {
  const sl = p.clubId ? slotOf(game, p, date) : null;
  return { date, club: p.clubId ?? null, tier: p.clubId ? clubById(p.clubId)?.tier ?? null : null, rep: clubRep(clubId), share: sl ? Math.round(sl.share * 100) / 100 : null };
}

/** Zapis blokady rozmów zawodnika z klubem (bez skracania dłuższej) i urazy na czas blokady. */
export function setLock(game, p, clubId, { date = game.date, until, reason = 'fiasko' }) {
  const rel = relationWith(p, clubId);
  if (!rel.lockUntil || rel.lockUntil < until) { rel.lockUntil = until; rel.lockReason = reason; }
  rel.lockCtx = lockCtxOf(game, p, clubId, date);
  rel.sour = { until: rel.lockUntil, s: PM.sour };
  p.relations = { ...(p.relations ?? {}), [clubId]: rel };
  return rel.lockUntil;
}

/** Po zapisie skutków rozmów (applyOutcome): kontekst blokady i uraza, gdy rozmowy skończyły się blokadą. */
export function noteLock(game, p, clubId, date = game.date) {
  const rel = p.relations?.[clubId];
  if (!rel?.lockUntil || rel.lockUntil <= date || rel.lockCtx?.date === date) return;
  setLock(game, p, clubId, { date, until: rel.lockUntil, reason: rel.lockReason ?? 'fiasko' });
}

/** Odmowa rozmów w bramce: blokada 3 mies. (6 przy lojalności >= 15 i walce obecnego klubu o cel), do okna. */
export function refuseLock(game, p, clubId, date = game.date) {
  const R = PM.refuseLock;
  const sl = p.clubId ? slotOf(game, p, date) : null;
  const months = (personalityOf(p).traits.loyalty >= R.loyalty && sl?.fight) ? R.loyal : R.base;
  return setLock(game, p, clubId, { date, until: lockEnd(addMonths(date, months)), reason: 'nie rozmawia' });
}

/**
 * Stan blokady z wcześniejszym otwarciem (zmienia relację, gdy sytuacja się zmieniła): przestał grać (połowa blokady),
 * nowy trener w jego klubie, spadek klubu, prośba o transfer (po obrazie połowa), kontrakt do 6 miesięcy, nasz klub
 * +20 reputacji, zmiana klubu. Zwraca { locked, until, words, reopened }.
 */
export function lockState(game, p, clubId, date = game.date) {
  const rel = p.relations?.[clubId];
  if (!rel?.lockUntil || date >= rel.lockUntil) return { locked: false, until: null, words: null, reopened: false };
  const c = rel.lockCtx;
  if (c) {
    const insult = rel.lockReason === 'insult';
    let lift = false;
    if ((p.clubId ?? null) !== c.club) lift = true;
    else if (p.clubId && monthsLeftOf(p, date) <= 6) lift = true;
    else if (p.clubId && c.tier != null && (clubById(p.clubId)?.tier ?? c.tier) > c.tier) lift = true;
    else if (clubRep(clubId) >= c.rep + 20) lift = true;
    else if (p.clubId && (game.coachLog ?? []).some((e) => e.club === p.clubId && e.date > c.date && e.date <= date && !e.outCt && e.why !== 'na stałe')) lift = true;
    else if (p.moveWish && !insult) lift = true;
    let half = !lift && !c.halved && (p.moveWish && insult);
    if (!lift && !half && !c.halved && p.clubId && (c.share ?? 0) >= 0.5 && personalityOf(p).traits.playTime >= 12) {
      const sl = slotOf(game, p, date); // przestał grać: grał regularnie, teraz poniżej 35 % minut
      if (sl && sl.share < 0.35) half = true;
    }
    if (half) {
      c.halved = true;
      const days = Math.round((Date.parse(rel.lockUntil) - Date.parse(c.date)) / 864e5 / 2);
      const end = new Date(Date.parse(`${c.date}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
      if (end <= date) lift = true; else rel.lockUntil = end;
    }
    if (lift) {
      rel.lockUntil = date; rel.reopened = date;
      return { locked: false, until: null, words: null, reopened: true };
    }
  }
  return { locked: true, until: rel.lockUntil, words: lockWords(date, rel.lockUntil), reopened: false };
}

/** Tekst blokady dla gracza (bez daty). */
export const lockText = (st) => `Zawodnik nie chce teraz rozmawiać, wróć za ${st.words ?? 'kilka miesięcy'}.`;

// ------------------------------------------------------------ Gracz: bramka przed rozmowami
/**
 * Bramka przed rozmowami gracza (tf-negotiate, umowa od 1 lipca). mode: termin przejścia. Skutki: odmowa zapisuje
 * blokadę. Zwraca { ok, gate, text, words, reopened }.
 */
export function userGate(game, p, { mode = null, date = game.date } = {}) {
  const st = lockState(game, p, game.clubId, date);
  if (st.locked) return { ok: false, gate: null, text: lockText(st), locked: true };
  const gate = talkGate(game, p, game.clubId, { date, mode });
  const words = gateWords(p, gate);
  if (gate.verdict === 'refuse') {
    refuseLock(game, p, game.clubId, date);
    return { ok: false, gate, words, text: words, refused: true, reopened: st.reopened };
  }
  return { ok: true, gate, words, reopened: st.reopened, text: st.reopened ? `Sytuacja zawodnika zmieniła się. Jest gotów porozmawiać ponownie. ${words}` : words };
}

// ------------------------------------------------------------ Odrzucona uczciwa oferta (clubOffers.js maybeUpset)
/** Zawodnik chciał odejść, a klub odrzucił uczciwą ofertę: S +0,5 i ryzyko prośby o transfer x1,5 przez 3 miesiące. */
export function noteSpurned(p, date) {
  p.coSpurned = { since: date, until: addMonths(date, PM.spurned.months) };
}
