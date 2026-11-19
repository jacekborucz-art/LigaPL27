// Kibice (etap 11): nastroje, presja na trenera i zarząd, protesty oraz kary dyscyplinarne za zachowanie kibiców.
// Moduł czysty: stan w game.fans, bez DOM. Pętla dni wywołuje go przez src/career/fansSystem.js.
//
// Model w skrócie (szczegóły, źródła i tabele: docs/kibice.md):
// - Profil kibiców klubu (src/data/kibice.js): wielkość bazy, siła ultras, skłonność do incydentów, rywalizacje.
// - heat 0-100: presja kibiców. Rośnie po wynikach poniżej oczekiwań (siła rywala, renoma klubu, derby, odpadnięcie
//   z pucharu, miejsce w tabeli, sprzedaż gwiazdy), opada po dobrych wynikach i z czasem.
// - Drabina protestów: progi heat, najwyższy możliwy szczebel zależy od wielkości klubu i siły ultras.
//   Wielki klub z silnym młynem dochodzi do bojkotu i protestu przeciw zarządowi, mały kończy na narzekaniu.
// - Incydenty po meczu (rzadkie): pirotechnika, rzucanie przedmiotów, transparent, wtargnięcie, rasizm, burdy.
//   Kara finansowa (finance.book, kind 'fines'), zamknięcie sektora, zakaz wyjazdów, mecz bez publiczności.
// - attendanceModifier: mnożnik frekwencji meczu (nastrój, bojkot, zamknięte sektory, zakaz wyjazdów gości).
// Wszystkie liczby oznaczone [SZAC] to wartości balansowe.

import { Rng, clamp } from '../core/rng.js';
import { createMessage } from '../core/inbox.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { KIBICE, RIVALRIES, rivalOverride, listedRivalsOf } from '../data/kibice.js';
import { anyClub } from '../season/season.js';
import { isDecider, tieWinner } from '../season/cup.js';
import { standings } from '../season/standings.js';
import { LEAGUE_COMPS, compClubIds } from '../season/leagueComps.js';
import { COMPETITIONS } from '../config/competitions.js';
import { book, FIN } from './finance.js';
import { applyMorale } from './morale.js';
import { fansSackCoach, fansSackP } from './coachMarket.js';

const COMP_TIER = { ekstraklasa: 1, liga1: 2, liga2: 3, 'liga3-1': 3, 'liga3-2': 3, 'liga3-3': 3, 'liga3-4': 3 }; // kary III ligi jak w 2 Lidze [SZAC]

export const FANS = {
  T: [0, 22, 34, 44, 54, 64, 72, 80, 88], // progi heat dla szczebli 1-8 [SZAC]
  HYST: 12, // histereza: szczebel spada, gdy heat < próg - 12
  DECAY: 0.92, // wygasanie presji po każdym meczu [SZAC]
  LOSS_K: 5.5, // przyrost heat za 1 punkt poniżej oczekiwań (razy wrażliwość klubu) [SZAC]
  WIN_K: 5, // spadek heat za 1 punkt powyżej oczekiwań [SZAC]
  COOLDOWN_DAYS: 45, // ten sam szczebel nie wraca w wiadomościach częściej [SZAC]
  BOARD_PROTEST_DAYS: 28, // protest przeciw zarządowi dopiero po dłuższym kryzysie [SZAC]
  INCIDENT_P: 0.024, // bazowe prawdopodobieństwo incydentu karanego na mecz (gospodarze, ultras 5 = 1,9) [SZAC]
  RARITY: 1, // globalny mnożnik częstości kar (1 = wartości z docs/kibice.md)
};

/** Szczeble protestu. trust/mood: zmiana zaufania zarządu i nastroju kibiców (klub gracza), morale: kadra. [SZAC] */
export const LEVELS = [
  { id: 'calm', label: 'Spokój' },
  { id: 'grumbling', label: 'Pomruki niezadowolenia', trust: 0, mood: -1, morale: 0 },
  { id: 'banners', label: 'Transparenty przeciwko trenerowi', trust: -1, mood: -1, morale: -0.3 },
  { id: 'chants', label: 'Przyśpiewki przeciwko trenerowi', trust: -1, mood: -2, morale: -0.5 },
  { id: 'boycott15', label: 'Bojkot dopingu przez 15 minut', trust: -1, mood: -2, morale: -0.5 },
  { id: 'boycott', label: 'Bojkot meczów', trust: -2, mood: -3, morale: -0.8 },
  { id: 'meeting', label: 'Spotkanie kibiców z zarządem', trust: -1, mood: 1, morale: -0.5 },
  { id: 'sackDemand', label: 'Żądanie zwolnienia trenera', trust: -3, mood: -2, morale: -1 },
  { id: 'boardProtest', label: 'Protest przeciwko zarządowi', trust: -1, mood: -3, morale: -0.5 },
];

export const INCIDENTS = {
  pyro: { label: 'Pirotechnika', w: 58 },
  objects: { label: 'Rzucanie przedmiotów', w: 14 },
  banner: { label: 'Obraźliwy transparent', w: 12 },
  pitch: { label: 'Wtargnięcie na murawę', w: 5 },
  racism: { label: 'Zachowania rasistowskie', w: 3 },
  fight: { label: 'Burdy kibiców', w: 8 },
};

// Widełki kar w realnych złotych według ligi (1 EK, 2 1 Liga, 3 2 Liga i niżej). docs/kibice.md, rozdz. 2. [SZAC na bazie źródeł]
export const FINES_PLN = {
  pyro: { 1: [10000, 60000], 2: [4000, 25000], 3: [1500, 8000] },
  objects: { 1: [10000, 50000], 2: [4000, 20000], 3: [1500, 6000] },
  banner: { 1: [10000, 50000], 2: [5000, 20000], 3: [2000, 8000] },
  pitch: { 1: [20000, 100000], 2: [8000, 40000], 3: [3000, 12000] },
  racism: { 1: [25000, 100000], 2: [10000, 50000], 3: [4000, 15000] },
  fight: { 1: [30000, 200000], 2: [10000, 80000], 3: [5000, 20000] },
};
// Kary UEFA w euro (decyzje CEDB wobec polskich klubów 2016-2025). [SZAC na bazie źródeł]
export const FINES_EUR = {
  pyro: [10000, 50000], objects: [10000, 30000], banner: [10000, 40000], pitch: [15000, 40000], racism: [30000, 80000], fight: [40000, 120000],
};

const ULTRAS_F = [0, 0.15, 0.4, 0.8, 1.3, 1.9];
const COMP_F = { ekstraklasa: 1, liga1: 0.8, liga2: 0.55, 'liga3-1': 0.4, 'liga3-2': 0.4, 'liga3-3': 0.4, 'liga3-4': 0.4, pp: 0.8, uefa: 1.3, super: 1 }; // III liga [SZAC]

// ------------------------------------------------------------ Profil kibiców

const profileCache = new Map();

/** Profil kibiców klubu: dane z kibice.js albo szacunek z prestiżu (kluby spoza listy, rezerwy). */
export function fanProfile(clubId) {
  if (profileCache.has(clubId)) return profileCache.get(clubId);
  const club = anyClub(clubId) ?? clubById(clubId);
  const d = KIBICE[clubId];
  const pr = club?.prestige ?? 3;
  let size; let ultras; let temper;
  if (d) ({ size, ultras, temper } = d);
  else if (club?.parent) { size = 1; ultras = 1; temper = 1; }
  else { size = clamp(Math.round(pr / 2.2), 1, 4); ultras = clamp(Math.round(pr / 2.5), 1, 4); temper = 2; } // [SZAC]
  const p = {
    id: clubId, size, ultras, temper,
    sens: 0.4 + 0.07 * (size + ultras), // wrażliwość na złe wyniki: 0,54 (mały klub) do 1,1 (Legia) [SZAC]
    tScale: clamp(0.55 + 0.05 * (size + ultras), 0.65, 1), // niższe progi pierwszych szczebli w małych klubach [SZAC]
    maxLevel: club?.parent ? 1 : clamp(Math.round(0.5 + 0.75 * (size + ultras)), 1, 8),
    expBias: (pr - 6) * 0.05, // renoma podnosi oczekiwania ponad siłę kadry (punkty na mecz) [SZAC]
    tolerance: size >= 4 ? 1 : size >= 2 ? 2 : 3, // ile miejsc poniżej oczekiwań kibice „wybaczą”
    boardMult: 0.5 + 0.08 * (size + ultras), // jak mocno zarząd słucha kibiców
    stand: d?.stand ?? null,
    big: size >= 4 || ultras >= 4,
  };
  profileCache.set(clubId, p);
  return p;
}

const SIZE_LABELS = ['', 'Garstka wiernych', 'Mała', 'Średnia', 'Duża', 'Ogromna'];
const ULTRAS_LABELS = ['', 'Brak zorganizowanego młyna', 'Mała grupa', 'Zorganizowany młyn', 'Silne grupy ultras', 'Jedne z najsilniejszych w Polsce'];

let rivalMap = null;
/** Intensywność rywalizacji 0-3: lista z kibice.js, inaczej derby lokalne z regionu (1). */
export function rivalry(a, b) {
  const ov = rivalOverride(a, b); // edytor: rywale ustawieni przez gracza (także 0 = brak rywalizacji)
  if (ov !== undefined) return ov;
  if (!rivalMap) {
    rivalMap = new Map();
    for (const [x, y, v] of RIVALRIES) { rivalMap.set(`${x}|${y}`, v); rivalMap.set(`${y}|${x}`, v); }
  }
  const v = rivalMap.get(`${a}|${b}`);
  if (v) return v;
  const A = anyClub(a); const B = anyClub(b);
  if (!A || !B || A.foreign || B.foreign || A.parent || B.parent) return 0;
  return A.region && A.region === B.region ? 1 : 0;
}

export const fanMoodLabel = (v) => (v >= 80 ? 'Euforia' : v >= 65 ? 'Zadowoleni' : v >= 50 ? 'Spokojni' : v >= 35 ? 'Niezadowoleni' : v >= 20 ? 'Wściekli' : 'Bunt na trybunach');
export const heatLabel = (h) => (h >= 72 ? 'Otwarty konflikt' : h >= 54 ? 'Protest' : h >= 34 ? 'Narastająca presja' : h >= 22 ? 'Pierwsze pomruki' : 'Spokój');

// ------------------------------------------------------------ Stan

function newClubState() {
  return { mood: 55, heat: 0, level: 0, crisisPeak: 0, crisisFrom: null, lastAt: {}, form: [], sanctions: [], stars: null, season: newSeasonStats(), history: [] };
}
function newSeasonStats() {
  return { incidents: 0, fines: 0, amount: 0, closures: 0, noFans: 0, awayBans: 0, protests: 0, maxLevel: 0, coachChanges: 0, byKind: {} };
}

/** Tworzy lub uzupełnia game.fans. Pierwsze wywołanie oznacza rozegrane mecze jako przetworzone (bez zaległych protestów). */
export function ensureFans(game) {
  const seasonId = game.season?.seasonId ?? null;
  if (!game.fans) {
    game.fans = { v: 1, seasonId, userClub: game.clubId, clubs: {}, log: [] };
    for (const f of game.fixtures ?? []) if (f.played && f.date < (game.date ?? '0000')) f.fans = true;
  }
  const S = game.fans;
  for (const c of CLUBS_PL) if (!S.clubs[c.id]) S.clubs[c.id] = newClubState();
  if (S.seasonId !== seasonId) {
    // Nowy sezon: podsumowanie, presja wygasa o połowę, kary PZPN przechodzą na kolejny sezon
    for (const [id, C] of Object.entries(S.clubs)) {
      C.history = [{ season: S.seasonId, ...C.season }, ...(C.history ?? [])].slice(0, 5);
      C.season = newSeasonStats();
      C.heat = Math.round(C.heat * 0.5 * 10) / 10;
      C.level = levelFor(C.heat, fanProfile(id));
      C.mood = Math.round(C.mood + (55 - C.mood) * 0.3);
      C.sanctions = C.sanctions.filter((s) => s.scope !== 'uefa');
    }
    S.seasonId = seasonId;
  }
  if (S.userClub !== game.clubId) {
    // Nowy trener: kredyt zaufania w nowym klubie, a stary klub też zmienia trenera
    for (const id of [S.userClub, game.clubId]) {
      const C = S.clubs[id];
      if (!C) continue;
      C.heat = Math.round(C.heat * 0.4); C.level = 0; C.crisisPeak = 0; C.crisisFrom = null; C.stars = null;
    }
    S.userClub = game.clubId;
  }
  return S;
}

/** Próg heat dla szczebla: pierwsze dwa szczeble w małych klubach niżej (narzekanie przychodzi szybciej, ale cicho). */
export const threshold = (level, P) => (level <= 2 ? FANS.T[level] * P.tScale : FANS.T[level]);
const levelFor = (heat, P) => { let l = 0; while (l < P.maxLevel && heat >= threshold(l + 1, P)) l++; return l; };
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
const fineScale = () => FIN.FINE_SCALE ?? FIN.ECON ?? 0.08; // realne zł -> gospodarka gry (jak nagrody UEFA)
const tierOfClub = (id) => anyClub(id)?.tier ?? 5;

function moodOf(game, clubId) {
  if (clubId === game.clubId && game.board?.fansMood != null) return game.board.fansMood;
  return game.fans?.clubs?.[clubId]?.mood ?? 55;
}
function addMood(game, C, clubId, d) {
  if (clubId === game.clubId && game.board) game.board.fansMood = Math.round(clamp((game.board.fansMood ?? 55) + d, 0, 100));
  else C.mood = Math.round(clamp(C.mood + d, 0, 100) * 10) / 10;
}

export function fmtZl(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2).replace('.', ',')} mln zł`;
  if (n >= 1e4) return `${Math.round(n / 1e3)} tys. zł`;
  return `${Math.round(n / 10) * 10} zł`;
}

function log(game, entry) {
  const S = game.fans;
  S.log.unshift(entry);
  if (S.log.length > 80) S.log.length = 80;
}

// ------------------------------------------------------------ Oczekiwania

/** Oczekiwane punkty w meczu z różnicy siły L (z przewagą własnego boiska). */
export function expectedPoints(meId, oppId, home, neutral = false) {
  const me = anyClub(meId); const op = anyClub(oppId);
  const d = (me?.L ?? 10) - (op?.L ?? 10) + (neutral ? 0 : home ? 0.3 : -0.3);
  return clamp(1.35 + 0.6 * d, 0.3, 2.6);
}

/** Oczekiwane przez kibiców miejsce w lidze: średnia z rankingu siły kadry i rankingu renomy w lidze. */
export function expectedPosition(clubId, tier = tierOfClub(clubId)) {
  const me = anyClub(clubId);
  const clubs = CLUBS_PL.filter((c) => c.tier === tier && (tier !== 4 || c.group === me?.group)); // III liga: w grupie
  const byL = [...clubs].sort((a, b) => b.L - a.L || b.prestige - a.prestige);
  const byP = [...clubs].sort((a, b) => b.prestige - a.prestige || b.L - a.L);
  const r1 = byL.findIndex((c) => c.id === clubId) + 1;
  const r2 = byP.findIndex((c) => c.id === clubId) + 1;
  if (!r1) return null;
  return Math.round((r1 + r2) / 2);
}

// ------------------------------------------------------------ Teksty

const TEXTS = {
  grumbling: {
    big: [
      ['Kibice tracą cierpliwość', 'Po ostatnich wynikach z trybun słychać gwizdy, a w sieci kibice coraz głośniej krytykują grę drużyny. Na razie to tylko pomruki niezadowolenia, ale atmosfera wokół zespołu gęstnieje.'],
      ['Gwizdy po końcowym gwizdku', 'Piłkarze schodzili do szatni przy gwizdach. Kibice oczekują od zespołu znacznie więcej i nie kryją rozczarowania.'],
    ],
    small: [
      ['Na trybunach coraz luźniej', 'Po słabszych wynikach frekwencja spada, a nieliczni kibice po meczu nie kryli rozczarowania. Nikt jednak nie mówi jeszcze o proteście.'],
      ['Kibice narzekają', 'Na forum klubu i pod stadionem słychać narzekania na grę drużyny. To głos garstki najwierniejszych kibiców.'],
    ],
  },
  banners: {
    big: [
      ['Transparenty przeciwko trenerowi', 'W młynie{stand} zawisły transparenty wymierzone w ciebie: „Gdzie jest plan, trenerze?” oraz „Wymagamy walki!”. Kibice dają jasny sygnał, że tracą wiarę w obecny projekt.'],
      ['Kibice wywiesili transparenty', 'Na stadionie pojawiły się transparenty „Ten klub zasługuje na więcej” i „Trenerze, czas na wyniki”. Media piszą o pierwszym otwartym sygnale niezadowolenia trybun.'],
    ],
    small: [
      ['Transparent na płocie', 'Grupa kibiców wywiesiła na ogrodzeniu transparent z pytaniem o ambicje drużyny. Lokalne media odnotowały protest.'],
    ],
  },
  chants: {
    big: [
      ['Przyśpiewki przeciwko trenerowi', 'Podczas meczu z trybun niosły się okrzyki „Trener, odejdź!”. Zarząd odnotował nastroje kibiców, a dziennikarze pytają o twoją przyszłość.'],
      ['Trybuny skandują przeciwko trenerowi', 'Młyn{stand} przez kilka minut skandował przeciwko tobie. Piłkarze przyznają po meczu, że taka atmosfera nie pomaga.'],
    ],
    small: [
      ['Okrzyki przeciwko trenerowi', 'Kilkudziesięciu kibiców po meczu skandowało przeciwko tobie. W małym klubie takie głosy słychać jednak także w gabinecie prezesa.'],
    ],
  },
  boycott15: {
    big: [
      ['Kibice zapowiadają 15 minut ciszy', 'Stowarzyszenie kibiców ogłosiło protest: przez pierwsze 15 minut najbliższego meczu domowego doping zamilknie, a flagi zostaną zwinięte. To sygnał ostrzegawczy dla drużyny, trenera i zarządu.'],
    ],
    small: [
      ['Cichy protest kibiców', 'Najwierniejsi kibice zapowiedzieli, że przez pierwszy kwadrans najbliższego meczu nie będą dopingować drużyny.'],
    ],
  },
  boycott: {
    big: [
      ['Bojkot meczów', 'Grupy kibicowskie ogłosiły bojkot: młyn{stand} pozostanie pusty, dopóki drużyna nie zacznie grać na miarę klubu. Dział biletowy notuje zwroty i wyraźny spadek sprzedaży.'],
      ['Puste trybuny w proteście', 'Kibice zapowiedzieli, że nie przyjdą na kolejne mecze domowe. Klub traci wpływy z biletów, a piłkarze zagrają w ciszy.'],
    ],
    small: [
      ['Kibice nie przyjdą na mecz', 'Najwierniejsi kibice zapowiedzieli, że zostaną w domu, dopóki drużyna nie zacznie wygrywać. Kasy biletowe odczują to od razu.'],
    ],
  },
  meeting: {
    big: [
      ['Kibice rozmawiali z zarządem i piłkarzami', 'Przedstawiciele kibiców spotkali się z zarządem, a potem przyszli pod ośrodek treningowy porozmawiać z piłkarzami. Rozmowa była ostra, ale bez incydentów. Zarząd zapewnia, że sytuacja jest monitorowana.'],
    ],
    small: [
      ['Spotkanie kibiców z prezesem', 'Przedstawiciele kibiców spotkali się z prezesem klubu. Chcą usłyszeć, jaki jest plan na wyjście z kryzysu.'],
    ],
  },
  sackDemand: {
    big: [
      ['Kibice żądają zmiany trenera', 'Stowarzyszenie kibiców opublikowało oświadczenie: domaga się natychmiastowej zmiany trenera. Zarząd jest pod ogromną presją, a media odliczają dni do decyzji.'],
    ],
    small: [
      ['Kibice chcą nowego trenera', 'Kibice w oficjalnym piśmie do zarządu domagają się zmiany trenera.'],
    ],
  },
  boardProtest: {
    big: [
      ['Protest przeciwko zarządowi', 'Pod siedzibą klubu odbyła się demonstracja kibiców. Na transparentach hasła „Zarząd won!” i „Oddajcie nam klub!”. Kibice obwiniają właściciela i zarząd za kryzys, a zarząd szuka winnych w sztabie.'],
    ],
    small: [
      ['Kibice krytykują zarząd', 'Kibice opublikowali list otwarty do właściciela klubu. Domagają się zmian w zarządzie i jasnego planu.'],
    ],
  },
};

const INCIDENT_TEXT = {
  pyro: (sev) => (sev ? 'odpalenie środków pirotechnicznych, przez które sędzia musiał przerwać mecz' : 'użycie środków pirotechnicznych przez kibiców'),
  objects: () => 'rzucanie przedmiotów na boisko',
  banner: () => 'obraźliwy transparent i wulgarne przyśpiewki',
  pitch: () => 'wtargnięcie kibiców na murawę',
  racism: () => 'rasistowskie zachowania części kibiców',
  fight: (sev, away) => (away ? 'burdy i zniszczenia wywołane przez kibiców w sektorze gości' : 'burdy i zniszczenia na stadionie'),
};

const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);

// ------------------------------------------------------------ Protesty

function protestEvent(game, C, clubId, levelIdx, date, rng, msgs) {
  const L = LEVELS[levelIdx];
  const P = fanProfile(clubId);
  const club = anyClub(clubId);
  C.season.protests++;
  C.season.maxLevel = Math.max(C.season.maxLevel, levelIdx);
  log(game, { date, club: clubId, kind: 'protest', level: levelIdx, text: `${club?.name ?? clubId}: ${L.label.toLowerCase()}` });
  if (clubId !== game.clubId) { C.mood = clamp(C.mood + L.mood, 0, 100); return; }
  // Klub gracza: zaufanie zarządu, nastrój, morale kadry
  const trust = Math.round(L.trust * P.boardMult);
  if (game.board) game.board.trust = Math.round(clamp((game.board.trust ?? 60) + trust, 0, 100));
  addMood(game, C, clubId, Math.round(L.mood * (0.7 + 0.06 * (P.size + P.ultras))));
  if (L.morale && game.world?.clubs?.[clubId]) {
    for (const id of game.world.clubs[clubId].squad) {
      const p = game.world.players[id];
      if (p) p.morale = applyMorale(p.morale ?? 12, L.morale);
    }
  }
  const variants = TEXTS[L.id][P.big ? 'big' : 'small'];
  const [subject, body] = rng.pick(variants);
  const standTxt = P.stand ? ` (${P.stand})` : '';
  msgs.push(createMessage({
    date, key: `kibice:${clubId}:${L.id}:${date}`, category: levelIdx <= 3 ? 'media' : 'club', from: levelIdx <= 3 ? 'Media' : 'Rzecznik klubu',
    priority: levelIdx >= 6 ? 'important' : 'info', subject, body: `${body.replace('{stand}', standTxt)}${trust ? `\n\nZaufanie zarządu: ${trust}.` : ''}`,
    refs: { kind: 'fans', level: L.id },
  }));
}

/** Aktualizacja szczebla protestu po zmianie heat (najwyżej jeden szczebel w górę naraz; po wygranej bez eskalacji). */
function escalate(game, C, clubId, date, rng, msgs, rise = true) {
  const P = fanProfile(clubId);
  while (C.level > 0 && C.heat < threshold(C.level, P) - FANS.HYST * (C.level <= 2 ? P.tScale : 1)) C.level--;
  if (C.level === 0) {
    if ((C.crisisPeak ?? 0) >= 3 && clubId === game.clubId) {
      addMood(game, C, clubId, 3);
      msgs.push(createMessage({ date, key: `kibice:${clubId}:koniec:${date}`, category: 'club', from: 'Rzecznik klubu', priority: 'info', subject: 'Kibice zawieszają protest', body: 'Po lepszych wynikach grupy kibicowskie zawieszają protest. Doping wraca na trybuny, ale kibice zapowiadają, że będą uważnie patrzeć na kolejne mecze.' }));
    }
    C.crisisPeak = 0;
    if (C.heat < threshold(1, P) - FANS.HYST * P.tScale) C.crisisFrom = null;
  }
  const next = C.level + 1;
  if (!rise) return;
  if (next > P.maxLevel || C.heat < threshold(next, P)) return;
  if (!C.crisisFrom) C.crisisFrom = date;
  if (LEVELS[next].id === 'boardProtest' && daysBetween(C.crisisFrom, date) < FANS.BOARD_PROTEST_DAYS) return;
  C.level = next;
  C.crisisPeak = Math.max(C.crisisPeak ?? 0, next);
  const last = C.lastAt[next];
  if (last && daysBetween(last, date) < FANS.COOLDOWN_DAYS) return;
  C.lastAt[next] = date;
  protestEvent(game, C, clubId, next, date, rng, msgs);
  // Klub AI: przy żądaniu zwolnienia zarząd często zmienia trenera i presja spada [SZAC]
  // Szansa rośnie z wrażliwością właściciela na kibiców i media (career/owners.js; media 10: 0,45)
  if (clubId !== game.clubId && next >= 7 && rng.chance(fansSackP(game, clubId))) {
    C.heat = Math.round(C.heat * 0.3); C.level = levelFor(C.heat, P); C.season.coachChanges++;
    // Zwolnienie przez rynek trenerów (career/coachMarket.js): trener do puli, asystent tymczasowo, potem nowy trener
    const r = fansSackCoach(game, clubId, date);
    msgs.push(...(r?.messages ?? []));
    log(game, { date, club: clubId, kind: 'coachChange', text: `${anyClub(clubId)?.name ?? clubId}: zmiana trenera po presji kibiców${r?.caretaker ? `, tymczasowo prowadzi ${r.caretaker.name}` : ''}` });
  }
}

// ------------------------------------------------------------ Kary

function activeSanctions(C, f, kinds) {
  const scope = f.comp === 'uefa' ? 'uefa' : 'domestic';
  return C.sanctions.filter((s) => s.left > 0 && s.scope === scope && f.date > s.after && kinds.includes(s.kind));
}

/** Zużycie kar na tym meczu (sektor/bez publiczności u gospodarza, zakaz wyjazdów u gości). */
function consumeSanctions(C, f, side) {
  if (f.neutral) return;
  const kinds = side === 0 ? ['sector', 'noFans'] : ['awayBan'];
  for (const s of activeSanctions(C, f, kinds)) s.left--;
  C.sanctions = C.sanctions.filter((s) => s.left > 0);
}

function incidentChance(game, f, side, riv, P, C, res, margin) {
  let p = FANS.INCIDENT_P * FANS.RARITY * (COMP_F[f.comp] ?? 0.8) * ULTRAS_F[P.ultras] * (0.7 + 0.15 * P.temper);
  if (side === 1) {
    if (activeSanctions(C, f, ['awayBan']).length) return 0;
    p *= 0.45 * (riv ? 1.5 : 1);
  } else if (!f.neutral) {
    const s = activeSanctions(C, f, ['sector', 'noFans']);
    if (s.some((x) => x.kind === 'noFans')) return 0;
    if (s.length) p *= 0.4;
  }
  p *= [1, 1.3, 2, 3][riv] ?? 1;
  const opp = anyClub(side === 0 ? f.away : f.home);
  if ((opp?.prestige ?? 0) >= 8 && P.size >= 3) p *= 1.3;
  if (res === 'L') p *= margin >= 3 ? 1.6 : 1.3;
  p *= 1 + C.heat / 200;
  return clamp(p, 0, 0.6);
}

function rollFine(rng, range, P) {
  const sev = rng.next() ** 1.6; // częściej niższe kary
  return range[0] + (range[1] - range[0]) * sev * (0.75 + 0.06 * P.size);
}

function incident(game, f, side, riv, rng, date, msgs) {
  const clubId = side === 0 ? f.home : f.away;
  const C = game.fans.clubs[clubId];
  const P = fanProfile(clubId);
  const [g0, g1] = f.result.score;
  const gf = side === 0 ? g0 : g1; const ga = side === 0 ? g1 : g0;
  const res = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  const p = incidentChance(game, f, side, riv, P, C, res, ga - gf);
  if (!p || !rng.chance(p)) return;
  const kinds = Object.keys(INCIDENTS);
  const kind = rng.weighted(kinds, (k) => INCIDENTS[k].w * (k === 'fight' ? (riv >= 2 ? 3 : 1) * (side === 1 ? 1.5 : 1) : 1) * (k === 'pitch' && side === 1 ? 0.5 : 1));
  const uefa = f.comp === 'uefa';
  const tier = uefa ? 1 : COMP_TIER[f.comp] ?? Math.min(3, tierOfClub(clubId));
  const severe = kind === 'pyro' ? rng.chance(0.12) : false;
  let real = uefa ? rollFine(rng, FINES_EUR[kind], P) * FIN.EUR : rollFine(rng, FINES_PLN[kind][Math.min(3, tier)], P);
  if (severe) real *= 2.5;
  const away = side === 1;
  // Sankcje dodatkowe [SZAC na bazie źródeł, docs/kibice.md 2.3]
  const extra = [];
  const add = (s) => { C.sanctions.push({ ...s, scope: uefa ? 'uefa' : 'domestic', after: f.date, reason: kind }); extra.push(s); };
  const share = Math.round((0.08 + 0.03 * P.ultras) * 100) / 100;
  if (away) {
    const ban = kind === 'fight' ? rng.int(1, 5) : (kind === 'pitch' || severe || kind === 'racism') ? rng.int(1, 2) : kind === 'objects' && rng.chance(0.3) ? 1 : 0;
    if (ban) add({ kind: 'awayBan', left: ban });
  } else if (!f.neutral) {
    if (kind === 'fight' && rng.chance(0.2)) add({ kind: 'noFans', left: 1 });
    else if (kind === 'racism' && rng.chance(0.2)) add({ kind: 'noFans', left: 1 });
    else if (severe || (kind === 'objects' && rng.chance(0.25)) || (kind === 'banner' && rng.chance(0.15))
      || (kind === 'pitch' && rng.chance(0.6)) || (kind === 'racism' && rng.chance(0.7)) || (kind === 'fight' && rng.chance(0.6))) {
      add({ kind: 'sector', left: (kind === 'pitch' || kind === 'racism' || kind === 'fight') ? rng.int(1, 2) : 1, share: uefa ? Math.max(share, 0.25) : share });
    }
  }
  const amount = Math.max(100, Math.round((real * fineScale()) / 100) * 100);
  if (game.finance?.clubs?.[clubId]) book(game.finance, clubId, date, 'out', 'fines', amount, `Kara: ${INCIDENTS[kind].label.toLowerCase()}`);
  const st = C.season;
  st.incidents++; st.fines++; st.amount += amount; st.byKind[kind] = (st.byKind[kind] ?? 0) + 1;
  for (const s of extra) { if (s.kind === 'sector') st.closures++; if (s.kind === 'noFans') st.noFans++; if (s.kind === 'awayBan') st.awayBans++; }
  const club = anyClub(clubId);
  const body = uefa ? 'Organ Kontroli, Etyki i Dyscypliny UEFA' : f.comp === 'ekstraklasa' ? 'Komisja Ligi Ekstraklasy' : 'Komisja Dyscyplinarna PZPN';
  const extraTxt = extra.map((s) => (s.kind === 'noFans'
    ? 'Wojewoda, na wniosek policji, zdecydował, że najbliższy mecz domowy odbędzie się bez udziału publiczności.'
    : s.kind === 'sector'
      ? `Zamknięty zostaje ${P.stand ? `sektor najzagorzalszych kibiców (${P.stand})` : 'sektor najzagorzalszych kibiców'} na ${s.left} ${plural(s.left, 'mecz domowy', 'mecze domowe', 'meczów domowych')}${uefa ? ' w pucharach' : ''}.`
      : `Zorganizowane grupy kibiców nie mogą jeździć na mecze wyjazdowe przez ${s.left} ${plural(s.left, 'mecz', 'mecze', 'meczów')}.`));
  log(game, { date, club: clubId, kind: 'fine', incident: kind, amount, sanctions: extra.map((s) => s.kind), comp: f.comp, text: `${club?.name ?? clubId}: ${INCIDENTS[kind].label.toLowerCase()}, kara ${fmtZl(amount)}` });
  if (clubId !== game.clubId) return;
  const heavy = extra.length > 0 || real >= 50000;
  if (game.board) game.board.trust = Math.round(clamp((game.board.trust ?? 60) - (extra.some((s) => s.kind === 'noFans') ? 4 : heavy ? 2 : 0), 0, 100));
  const h = anyClub(f.home)?.name ?? f.home; const a = anyClub(f.away)?.name ?? f.away;
  msgs.push(createMessage({
    date, key: `kara-kibice:${f.id}:${f.date}:${clubId}`, category: 'club', from: body, priority: heavy ? 'important' : 'info',
    subject: `Kara za zachowanie kibiców: ${fmtZl(amount)}`,
    body: `${body} ukarała klub za ${INCIDENT_TEXT[kind](severe, away)} podczas meczu ${h} ${g0}:${g1} ${a}. Kara finansowa: ${fmtZl(amount)}.${extraTxt.length ? `\n\n${extraTxt.join(' ')}` : ''}\n\nKoszt obciąża budżet klubu.`,
    refs: { kind: 'fansFine', incident: kind },
  }));
}

// ------------------------------------------------------------ Po meczu

export { tieWinner };

function reaction(game, C, f, side, riv, rng, date, msgs) {
  const me = side === 0 ? f.home : f.away;
  const opp = side === 0 ? f.away : f.home;
  const P = fanProfile(me);
  const [g0, g1] = f.result.score;
  const gf = side === 0 ? g0 : g1; const ga = side === 0 ? g1 : g0;
  // Mecz rozstrzygający (puchar, Superpuchar, baraż, rewanż w pucharach UEFA): liczy się awans albo trofeum,
  // także po serii rzutów karnych i w dwumeczu, a nie sam wynik tego meczu
  const w = isDecider(f) ? tieWinner(f) : null;
  const res = w ? (w === me ? 'W' : 'L') : gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  const pts = res === 'W' ? 3 : res === 'D' ? 1 : 0;
  let s = pts - (expectedPoints(me, opp, side === 0, !!f.neutral) + P.expBias);
  if (riv) s += (res === 'W' ? 0.6 : res === 'L' ? -0.6 : 0) * riv;
  if (ga - gf >= 3) s -= 0.5;
  if (w && w !== me) {
    const gap = tierOfClub(opp) - tierOfClub(me); // rywal z niższej ligi = kompromitacja (zagraniczny ma tier 0)
    s -= gap > 0 ? 0.8 * Math.min(gap, 3) : 0.3;
  }
  if (w === me && (f.round === 'F' || f.comp === 'super')) s += 1; // trofeum albo awans w finale baraży [SZAC]
  if (me !== game.clubId) C.mood = Math.round(clamp(C.mood + clamp(s * 2.5, -7, 6) + (55 - C.mood) * 0.04, 0, 100) * 10) / 10;
  C.heat = s < 0 ? C.heat - s * FANS.LOSS_K * P.sens : C.heat - Math.max(s * FANS.WIN_K, res === 'W' ? 3 : 0); // każda wygrana trochę uspokaja
  C.heat = Math.round(clamp(C.heat * FANS.DECAY, 0, 100) * 10) / 10;
  C.form = [...C.form, res].slice(-6);
  escalate(game, C, me, date, rng, msgs, s < 0);
}

/**
 * Skutki rozegranego meczu dla kibiców obu klubów (tylko kluby z CLUBS_PL). Zwraca wiadomości dla gracza.
 * Tani dla klubów AI: kilka działań arytmetycznych, bez tabel. Mecz oznaczany f.fans = true.
 */
export function fansAfterMatch(game, f, date = f.date) {
  ensureFans(game);
  const msgs = [];
  if (!f.played || !f.result || f.fans) return msgs;
  f.fans = true;
  if (f.comp === 'friendly') return msgs; // sparingi nie budzą emocji kibiców ani kar
  const S = game.fans;
  const rng = new Rng(`kibice:${game.seed}:${f.id}:${f.date}`);
  const riv = rivalry(f.home, f.away);
  const sides = [0, 1].filter((s) => S.clubs[s === 0 ? f.home : f.away]);
  for (const side of sides) consumeSanctions(S.clubs[side === 0 ? f.home : f.away], f, side);
  for (const side of sides) reaction(game, S.clubs[side === 0 ? f.home : f.away], f, side, riv, rng, date, msgs);
  for (const side of sides) incident(game, f, side, riv, rng, date, msgs);
  return msgs;
}

// ------------------------------------------------------------ Miesiąc

/** Comiesięczna ocena kibiców: miejsce w tabeli wobec oczekiwań, dryf nastroju. Zwraca wiadomości dla gracza. */
export function fansMonth(game, date) {
  const S = ensureFans(game);
  const msgs = [];
  const rng = new Rng(`kibice-miesiac:${game.seed}:${date}`);
  for (const comp of LEAGUE_COMPS) {
    const tier = COMPETITIONS[comp].tier;
    const ids = compClubIds(comp);
    const lf = (game.fixtures ?? []).filter((f) => f.comp === comp);
    if (!lf.some((f) => f.played)) continue;
    const table = standings(lf, ids);
    for (const row of table) {
      const C = S.clubs[row.id];
      if (!C || row.played < 4) continue;
      const P = fanProfile(row.id);
      const exp = expectedPosition(row.id, tier);
      const diff = row.pos - exp - P.tolerance;
      if (diff > 0) C.heat += Math.min(diff, 6) * 0.8 * P.sens;
      else if (diff < -1) C.heat -= Math.min(-diff, 6) * 0.8 + 1;
      if (row.pos >= table.length - 2 && exp < table.length - 3) C.heat += 3 * P.sens; // strefa spadkowa wbrew oczekiwaniom
      if (row.id === game.clubId && (game.board?.fansMood ?? 55) < 35) C.heat += (35 - game.board.fansMood) * 0.2 * P.sens;
      C.heat = Math.round(clamp(C.heat, 0, 100) * 10) / 10;
      const target = 62 - C.heat * 0.5;
      if (row.id === game.clubId) addMood(game, C, row.id, Math.round(0.2 * (target - moodOf(game, row.id))));
      else C.mood = Math.round(clamp(C.mood + 0.25 * (target - C.mood), 0, 100) * 10) / 10;
      escalate(game, C, row.id, date, rng, msgs);
    }
  }
  return msgs;
}

// ------------------------------------------------------------ Odejście gwiazdy (klub gracza)

function topPlayers(game, clubId) {
  return (game.world?.clubs?.[clubId]?.squad ?? []).map((id) => game.world.players[id]).filter(Boolean)
    .sort((a, b) => (b.rep ?? b.ovr ?? 0) - (a.rep ?? a.ovr ?? 0)).slice(0, 3).map((p) => p.id);
}

/** Sprawdza, czy z klubu gracza odeszła jedna z trzech gwiazd (sprzedaż, wolny transfer). */
export function checkStars(game, date) {
  const S = ensureFans(game);
  const clubId = game.clubId;
  const C = S.clubs[clubId];
  const msgs = [];
  if (!C || !game.world?.clubs?.[clubId]) return msgs;
  const squad = new Set(game.world.clubs[clubId].squad);
  const gone = (C.stars ?? []).filter((id) => !squad.has(id) && game.world.players[id]);
  if (gone.length) {
    const P = fanProfile(clubId);
    const p = game.world.players[gone[0]];
    C.heat = Math.round(clamp(C.heat + 7 * P.sens * gone.length, 0, 100) * 10) / 10;
    addMood(game, C, clubId, -Math.round(3 * P.sens * 2));
    log(game, { date, club: clubId, kind: 'starSale', text: `${anyClub(clubId)?.name}: odejście ${p.name}` });
    msgs.push(createMessage({
      date, key: `kibice:gwiazda:${p.id}:${date}`, category: 'media', from: 'Media', priority: 'info',
      subject: `Kibice krytykują odejście: ${p.name}`,
      body: P.big
        ? `Odejście ${p.name} wywołało falę krytyki. Kibice pytają, czy klub ma jeszcze ambicje, i zapowiadają, że rozliczą zarząd z wyników.`
        : `Kibice żałują odejścia ${p.name}. W lokalnych mediach pojawiły się pytania o siłę drużyny.`,
    }));
    escalate(game, C, clubId, date, new Rng(`kibice-gwiazda:${game.seed}:${date}`), msgs);
  }
  C.stars = topPlayers(game, clubId);
  return msgs;
}

// ------------------------------------------------------------ Dzień (wywołuje fansSystem.js)

/** Przetwarza rozegrane, jeszcze nieprzetworzone mecze, a 1. dnia miesiąca ocenę miesięczną. */
export function fansDay(game, date) {
  ensureFans(game);
  const msgs = [];
  for (const f of game.fixtures ?? []) {
    if (!f.played || f.fans || !f.result || f.date > date) continue;
    if (!game.fans.clubs[f.home] && !game.fans.clubs[f.away]) { f.fans = true; continue; }
    msgs.push(...fansAfterMatch(game, f, date));
  }
  msgs.push(...checkStars(game, date));
  if (date.endsWith('-01')) msgs.push(...fansMonth(game, date));
  return msgs;
}

// ------------------------------------------------------------ Frekwencja

/**
 * Mnożnik frekwencji (0-1,08) dla meczu gospodarza clubId: nastrój kibiców, protest/bojkot, zamknięte sektory,
 * mecz bez publiczności, zakaz wyjazdów kibiców gości. Używać w matchMoney po attendanceFill (po jego clampie).
 */
export function attendanceModifier(game, clubId, f) {
  const S = game.fans;
  if (!S || !f || f.comp === 'friendly') return 1;
  const C = S.clubs[clubId];
  if (!C) return 1;
  let m = 1 + clamp((moodOf(game, clubId) - 58) * 0.004, -0.1, 0.08);
  if (f.neutral) return Math.round(m * 1000) / 1000;
  const P = fanProfile(clubId);
  if (C.level >= 5) m *= 1 - 0.055 * P.ultras - (C.level >= 8 ? 0.06 : 0);
  else m *= 1 - 0.01 * C.level;
  const own = activeSanctions(C, f, ['sector', 'noFans']);
  if (own.some((s) => s.kind === 'noFans')) return 0;
  const closed = Math.max(0, ...own.map((s) => s.share ?? 0.15));
  m *= 1 - closed;
  const otherId = f.home === clubId ? f.away : f.home;
  const A = S.clubs[otherId];
  if (A && f.home === clubId && activeSanctions(A, f, ['awayBan']).length) {
    m *= 1 - (0.03 + 0.01 * fanProfile(otherId).size) * (rivalry(clubId, otherId) >= 2 ? 2 : 1); // pusty sektor gości [SZAC]
  }
  return Math.round(clamp(m, 0, 1.08) * 1000) / 1000;
}

// ------------------------------------------------------------ Podsumowanie do UI (panel „Kibice”)

export function fansSummary(game, clubId = game.clubId) {
  const S = ensureFans(game);
  const C = S.clubs[clubId] ?? newClubState();
  const P = fanProfile(clubId);
  const club = anyClub(clubId);
  const mood = Math.round(moodOf(game, clubId));
  const rivals = listedRivalsOf(clubId).map(({ id, v }) => ({ id, name: anyClub(id)?.name ?? id, intensity: v }));
  const sanctions = C.sanctions.filter((s) => s.left > 0).map((s) => ({
    ...s,
    text: s.kind === 'noFans' ? 'Najbliższy mecz domowy bez publiczności'
      : s.kind === 'sector' ? `Zamknięty sektor kibiców: ${s.left} ${plural(s.left, 'mecz domowy', 'mecze domowe', 'meczów domowych')}${s.scope === 'uefa' ? ' w pucharach' : ''}`
        : `Zakaz wyjazdów kibiców: ${s.left} ${plural(s.left, 'mecz', 'mecze', 'meczów')}`,
  }));
  const tier = club?.tier;
  return {
    clubId, name: club?.name ?? clubId,
    profile: { size: P.size, sizeLabel: SIZE_LABELS[P.size], ultras: P.ultras, ultrasLabel: ULTRAS_LABELS[P.ultras], temper: P.temper, stand: P.stand, maxLevel: P.maxLevel, maxLevelLabel: LEVELS[P.maxLevel].label },
    mood, moodLabel: fanMoodLabel(mood),
    heat: Math.round(C.heat), heatLabel: heatLabel(C.heat),
    level: C.level, levelLabel: LEVELS[C.level].label,
    expectedPosition: tier >= 1 && tier <= 4 ? expectedPosition(clubId, tier) : null,
    rivals, sanctions,
    season: { ...C.season },
    recent: S.log.filter((e) => e.club === clubId).slice(0, 8),
    league: S.log.filter((e) => e.kind === 'fine' && anyClub(e.club)?.tier === tier && (tier !== 4 || anyClub(e.club)?.group === club?.group)).slice(0, 8),
  };
}
