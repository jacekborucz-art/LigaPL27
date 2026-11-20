// Zawodnicy z zagranicy na rynku (docs/transfery.md, rozdz. 9): pula ok. 100 obcokrajowców zainteresowanych grą
// w Polsce. Ameryka Południowa, Afryka i Bałkany po 24 %, rzadziej Bliski Wschód, Ukraina z Gruzją, Hiszpanie,
// Portugalczycy i Skandynawowie. Ok. 45 % to wolni zawodnicy (zwykła mechanika wolnych: game.market.free),
// reszta ma kontrakt w klubie zagranicznym (p.abroad, p.foreignPool) i kosztuje odstępne.
// Lista: game.market.foreign. Nowa gra: 100 zawodników; stary zapis: raz, leniwie (game.market.foreignPoolV1).
// Przed każdym oknem (7 dni wcześniej albo pierwszego dnia okna) pula wraca do 100: odchodzą ci, którzy trafili do
// polskiego klubu albo zniknęli z rynku, a ok. 15 % zawodników z kontraktem zostaje za granicą (rotacja).
// Wszystkie liczby [SZAC]. Moduł nie wywołuje innych modułów przy ładowaniu (cykl importów z transfers.js).

import { Rng, clamp } from '../core/rng.js';
import { addDays } from '../core/gameLoop.js';
import { DOMESTIC } from '../config/calendar2026.js';
import { genPlayer, marketValue } from '../world/playerGen.js';
import { SQUAD_LAYOUT } from '../world/worldGen.js';
import { NAT_NAMES } from '../data/names.js';
import { marketWage } from './negotiation.js';
import { spendable } from './finance.js';
import { canSign } from './squadLimit.js';
import { checkUserFee } from './boardRequests.js';
import { hasOpenDeal, pendingFees, stat } from './transferDeals.js';
import { inWindow, fmtZl } from './transfers.js';
import DATA from '../data/kluby_uefa.json' with { type: 'json' };
import { applyNamesDeep } from '../data/clubNames.js';
applyNamesDeep(DATA); // nazwy do publikacji (prawdziwe w clubNames.js)

const round = (x, step = 5000) => Math.round(x / step) * step;

export const POOL = {
  size: 100, // tyle zawodników po każdym uzupełnieniu [SZAC]
  free: 0.45, // udział wolnych (wynik szans poziomów w BANDS) [SZAC]
  churn: 0.15, // część zawodników z kontraktem, która przy uzupełnieniu zostaje za granicą [SZAC]
  leadDays: 7, // uzupełnienie 7 dni przed otwarciem okna [SZAC]
  aiChance: 0.1, // szansa, że klub AI przy zakupie w ogóle patrzy na zawodników z kontraktem za granicą [SZAC]
  aiMoney: 0.5, // klub AI płaci za granicę najwyżej połowę wolnych środków [SZAC]
  counter: 0.82, // od tej części ceny klub zagraniczny składa kontrofertę (jak kluby AI)
};

// Poziomy jakości: L dla genPlayer (siła „ligi” zawodnika) i wiek [SZAC]
export const BANDS = [
// free: szansa, że zawodnik jest wolny; najlepsi częściej mają kontrakt (razem ok. 45 % wolnych, stabilna siła lig)
  { key: 'czolowka', w: 0.25, L: [12.0, 12.8], age: [23, 30], free: 0.1 }, // poziom czołówki Ekstraklasy
  { key: 'srodek', w: 0.45, L: [10.6, 11.8], age: [21, 31], free: 0.55 }, // Ekstraklasa i 1 Liga
  { key: 'mlodzi', w: 0.30, L: [9.5, 10.5], age: [18, 21], pot: [2, 4.5], free: 0.6 }, // perspektywiczni, wyższy potencjał
];

// Regiony i narodowości z wagami wewnątrz regionu [SZAC]
export const POOL_REGIONS = {
  amerykaPd: { w: 0.24, label: 'Ameryka Południowa', nats: { BRA: 3, ARG: 2, COL: 1.5, URU: 1, ECU: 1, PAR: 0.8, VEN: 0.6, CHI: 0.6, PER: 0.5 } },
  afryka: { w: 0.24, label: 'Afryka', nats: { NGA: 1.5, GHA: 1.2, CMR: 1, SEN: 1.2, CIV: 1.2, MAR: 0.8, ALG: 0.6, TUN: 0.6, MLI: 0.6, GUI: 0.6, COD: 0.6 } },
  balkany: { w: 0.24, label: 'Bałkany', nats: { CRO: 1.2, SRB: 1.5, SVN: 1, BIH: 1, MKD: 0.8, MNE: 0.8, ALB: 0.8, KOS: 0.6, BUL: 0.8 } },
  bliskiWschod: { w: 0.07, label: 'Bliski Wschód', nats: { LBN: 1, JOR: 1, IRQ: 1, SYR: 0.8, ISR: 1.2 } },
  wschod: { w: 0.07, label: 'Europa Wschodnia', nats: { UKR: 2, GEO: 1 } },
  hiszpania: { w: 0.04, label: 'Hiszpania', nats: { ESP: 1 } },
  portugalia: { w: 0.04, label: 'Portugalia', nats: { POR: 1 } },
  skandynawia: { w: 0.06, label: 'Skandynawia', nats: { SWE: 1.2, NOR: 1.2, DEN: 1.2, FIN: 0.8, ISL: 0.6 } },
};
/** Filtry listy w interfejsie: cztery główne regiony i „inne”. */
export const REGION_FILTERS = [['all', 'Wszyscy'], ['amerykaPd', 'Ameryka Południowa'], ['afryka', 'Afryka'], ['balkany', 'Bałkany'], ['bliskiWschod', 'Bliski Wschód'], ['inne', 'Inne']];
const MAIN_REGIONS = new Set(['amerykaPd', 'afryka', 'balkany', 'bliskiWschod']);
const REGION_OF = Object.fromEntries(Object.entries(POOL_REGIONS).flatMap(([r, x]) => Object.keys(x.nats).map((n) => [n, r])));
/** Region zawodnika do filtrów: amerykaPd | afryka | balkany | bliskiWschod | inne. */
export const regionOf = (nat) => (MAIN_REGIONS.has(REGION_OF[nat]) ? REGION_OF[nat] : 'inne');

// Siła ligi krajów spoza danych UEFA (kluby_uefa.json ma tylko Europę) [SZAC]
const LEAGUE_L = {
  BRA: 12.8, ARG: 12.4, COL: 11.0, URU: 10.8, ECU: 10.8, PAR: 10.4, CHI: 10.4, PER: 9.8, VEN: 9.6,
  NGA: 8.6, GHA: 8.6, CMR: 8.4, SEN: 8.8, CIV: 9.0, MAR: 10.6, ALG: 10.0, TUN: 10.2, MLI: 8.2, GUI: 8.0, COD: 9.2,
  LBN: 8.0, JOR: 8.6, IRQ: 8.8, SYR: 7.8,
  // Regiony skautingu (src/career/scoutRegions.js): kraje spoza puli
  BOL: 9.0, EGY: 10.2, BFA: 8.0, GAM: 7.8, ZAM: 8.2, RSA: 9.4, KEN: 7.8,
  USA: 10.8, MEX: 11.2, CAN: 9.8, CRC: 9.4, HON: 9.0, JAM: 8.6, PAN: 8.8,
  JPN: 11.2, KOR: 10.8, AUS: 9.8, UZB: 9.2, IRN: 9.8, CHN: 9.4, THA: 8.6, KSA: 11.0,
};
// Przymiotnik do opisu „klub z ligi brazylijskiej”
const ADJ = {
  BRA: 'brazylijskiej', ARG: 'argentyńskiej', COL: 'kolumbijskiej', URU: 'urugwajskiej', ECU: 'ekwadorskiej', PAR: 'paragwajskiej',
  VEN: 'wenezuelskiej', CHI: 'chilijskiej', PER: 'peruwiańskiej', NGA: 'nigeryjskiej', GHA: 'ghańskiej', CMR: 'kameruńskiej',
  SEN: 'senegalskiej', CIV: 'iworyjskiej', MAR: 'marokańskiej', ALG: 'algierskiej', TUN: 'tunezyjskiej', MLI: 'malijskiej',
  GUI: 'gwinejskiej', COD: 'kongijskiej', CRO: 'chorwackiej', SRB: 'serbskiej', SVN: 'słoweńskiej', BIH: 'bośniackiej',
  MKD: 'macedońskiej', MNE: 'czarnogórskiej', ALB: 'albańskiej', KOS: 'kosowskiej', BUL: 'bułgarskiej', LBN: 'libańskiej',
  JOR: 'jordańskiej', IRQ: 'irackiej', SYR: 'syryjskiej', ISR: 'izraelskiej', UKR: 'ukraińskiej', GEO: 'gruzińskiej',
  ESP: 'hiszpańskiej', POR: 'portugalskiej', SWE: 'szwedzkiej', NOR: 'norweskiej', DEN: 'duńskiej', FIN: 'fińskiej', ISL: 'islandzkiej',
  BOL: 'boliwijskiej', EGY: 'egipskiej', BFA: 'burkińskiej', GAM: 'gambijskiej', ZAM: 'zambijskiej', RSA: 'południowoafrykańskiej',
  KEN: 'kenijskiej', USA: 'amerykańskiej', MEX: 'meksykańskiej', CAN: 'kanadyjskiej', CRC: 'kostarykańskiej', HON: 'honduraskiej',
  JAM: 'jamajskiej', PAN: 'panamskiej', JPN: 'japońskiej', KOR: 'koreańskiej', AUS: 'australijskiej', UZB: 'uzbeckiej', IRN: 'irańskiej',
  CHN: 'chińskiej', THA: 'tajskiej', KSA: 'saudyjskiej', TUR: 'tureckiej', GRE: 'greckiej', CYP: 'cypryjskiej', CZE: 'czeskiej',
  SVK: 'słowackiej', HUN: 'węgierskiej', ROU: 'rumuńskiej', EST: 'estońskiej', LVA: 'łotewskiej', LTU: 'litewskiej', FRO: 'farerskiej',
  AND: 'andorskiej', BLR: 'białoruskiej', ARM: 'ormiańskiej', AZE: 'azerskiej', KAZ: 'kazachskiej', MDA: 'mołdawskiej',
};
const KRAJ = Object.fromEntries(DATA.kraje.map((k) => [k.kod, k]));
const CLUBS_OF = {};
for (const c of DATA.kluby) (CLUBS_OF[c.kraj] ??= []).push({ id: c.id, name: c.nazwa, L: c.L, prestige: c.prestiz ?? 5 });

/** Siła ligi kraju (dane UEFA albo szacunek). */
export const leagueL = (nat) => KRAJ[nat]?.Lliga ?? LEAGUE_L[nat] ?? 9.5;
/** Opis klubu bez nazwy: „klub z ligi brazylijskiej”. */
export const genericClub = (nat) => `klub z ligi ${ADJ[nat] ?? (NAT_NAMES[nat] ?? nat).toLowerCase()}`;
/** Reputacja z siły ligi, ten sam wzór co kupcy z zagranicy (foreignMarket.buyerRep): 30 + 9 (L - 11). */
const repFromL = (L) => Math.round(30 + 9 * (L - 11));
const tierFromL = (L) => (L >= 11 ? 1 : L >= 9.5 ? 2 : 3);

// ------------------------------------------------------------ Stan
/** Zawodnik z puli z kontraktem w klubie zagranicznym (kupno za odstępne). */
export function isPoolContracted(p) {
  return !!p && !p.clubId && !p.free && !!p.foreignPool && !!p.abroad && !!p.contract;
}

/** Klub sprzedający jako obiekt dla rozmów (fromClub w openNegotiation, willingnessToJoin): reputacja z ligi. */
export function poolSellerClub(p) {
  const a = p.abroad;
  return { id: `zagranica:${a.country}`, name: a.club, rep: a.rep ?? repFromL(a.league ?? 10) + 25, tier: tierFromL(a.league ?? 10), prestige: 3, foreign: true, country: a.country };
}

/** Opis klubu zawodnika: „Hajduk Split (Chorwacja)”; opis ligi bez kraju („klub z ligi brazylijskiej”). */
export const poolClubLabel = (p) => (!p.abroad ? '' : p.abroad.clubId || !/^klub z ligi /.test(p.abroad.club) ? `${p.abroad.club} (${p.abroad.countryName ?? NAT_NAMES[p.abroad.country] ?? p.abroad.country})` : p.abroad.club);

/** Gdzie gra zawodnik (tekst): polski klub, klub zagraniczny (także sprzedany za granicę, p.abroad) albo „wolny zawodnik”. */
export const whereLabel = (p, nameOfClub) => (p?.clubId ? nameOfClub(p.clubId) ?? '' : p?.abroad ? poolClubLabel(p) : 'wolny zawodnik');
/** Zawodnik sprzedany za granicę (poza pulą obcokrajowców): nie jest wolny i nie jest na naszym rynku. */
export const playsAbroad = (p) => !!p && !p.clubId && !!p.abroad && !p.free;

/** Cena wywoławcza klubu zagranicznego: wartość rynkowa (poziom ligi) x mnożnik ligi (słabe ligi 1,0-1,15, mocne 1,3-1,5). */
export function foreignAskingPrice(game, p) {
  const a = p.abroad;
  const value = marketValue(p, { tier: a.vt ?? 1, date: game.date });
  return Math.max(25000, round(value * (a.priceMul ?? 1.2)));
}

/** Okno, które trwa albo zaczyna się w ciągu POOL.leadDays dni. */
export function upcomingWindow(date) {
  return (DOMESTIC.transferWindows ?? []).find((w) => date <= w.to && date >= addDays(w.from, -POOL.leadDays)) ?? null;
}

/** Leniwa inicjalizacja: stary zapis dostaje pulę raz (flaga foreignPoolV1). */
export function ensureForeignPool(game) {
  const M = game.market;
  if (!M || !game.world) return;
  if (!Array.isArray(M.foreign)) M.foreign = [];
  if (M.foreignPoolV1) return;
  const date = game.date ?? '2026-07-01';
  addPoolPlayers(game, POOL.size, date, date);
  M.foreignPoolV1 = true;
  M.foreignTop = upcomingWindow(date)?.from ?? null;
}

// ------------------------------------------------------------ Generowanie
function pickNat(rng) {
  const r = rng.weighted(Object.keys(POOL_REGIONS), (k) => POOL_REGIONS[k].w);
  const nats = POOL_REGIONS[r].nats;
  return rng.weighted(Object.keys(nats), (k) => nats[k]);
}

/** Klub zagraniczny: prawdziwy klub z danych UEFA o sile blisko poziomu zawodnika, inaczej opis ligi. */
function pickClub(rng, nat, ovr) {
  const lgL = leagueL(nat);
  const fit = (CLUBS_OF[nat] ?? []).filter((c) => c.L >= ovr - 1.2 && c.L <= ovr + 1.8);
  const club = fit.length ? rng.pick(fit) : null;
  const L = club ? club.L : Math.min(lgL, ovr + 0.8); // bez klubu w danych: poziom ligi, ale nie dużo ponad zawodnika
  const rep = club ? Math.min(100, club.prestige * 7 + 25) : repFromL(L) + 25; // skala clubReputation polskich klubów
  return { name: club?.name ?? genericClub(nat), clubId: club?.id ?? null, L, rep };
}

/** Mnożnik ceny: słabsze ligi sprzedają chętnie, mocniejsze (oraz Hiszpania i Portugalia) drożej [SZAC]. */
function priceMulFor(nat, rng) {
  const lgL = leagueL(nat);
  const u = rng.next();
  if (nat === 'ESP' || nat === 'POR' || lgL >= 12) return 1.3 + 0.2 * u;
  if (lgL < 10.5) return 1.0 + 0.15 * u;
  return 1.15 + 0.15 * u;
}

/** Jeden zawodnik puli: poziom, potem status (wolny albo kontrakt za granicą) z szansy poziomu. */
function genPoolPlayer(rng, id, date, { free = null } = {}) {
  const band = rng.weighted(BANDS, (b) => b.w);
  const status = free === true || (free == null && rng.chance(band.free)) ? 'free' : 'contract'; // free: wymuszony wolny (zastępstwo za wolnego, mindset.js)
  const L = band.L[0] + rng.next() * (band.L[1] - band.L[0]);
  const age = rng.int(band.age[0], band.age[1]);
  const [pos, side] = rng.pick(SQUAD_LAYOUT);
  const nat = pickNat(rng);
  return genPoolPlayerFor(rng, id, date, { L, age, pos, side: side ?? null, nat, status, pot: band.pot ?? null, band: band.key });
}

/**
 * Zawodnik z zagranicy o zadanym profilu (pula i skauting, src/career/scoutOps.js): spec { L, age, pos, side, nat,
 * status: 'free'|'contract', pot: [od, do] premii potencjału albo null, band }. Kolejność losowań jak w dawnym
 * genPoolPlayer, więc pula z tego samego ziarna jest identyczna.
 */
export function genPoolPlayerFor(rng, id, date, spec) {
  const { L, age, pos, side = null, nat, status, pot = null, band = null } = spec;
  const club = { id: 'zagranica', tier: 1, prestige: 2, L };
  const p = genPlayer(rng, { id, L, pos, age, slotOffset: -0.4, nat, tier: 1, side, club, date });
  if (pot && p.hidden) p.hidden.POT = clamp(Math.round(Math.max(p.hidden.POT ?? 0, p.ovr + pot[0] + rng.next() * (pot[1] - pot[0])) * 10) / 10, 1, 18);
  p.clubId = null; p.squad = null; p.foreignPool = true; p.poolSince = date; p.poolBand = band;
  const [y, m] = date.split('-').map(Number);
  const startYear = m >= 7 ? y : y - 1;
  if (status === 'free') {
    // Wolny: oczekuje pensji obcokrajowca w Ekstraklasie (rynek x1,5, jak importy w addFreeAgents) [SZAC]
    p.askWage = Math.round(marketWage(p.ovr, 1, true, 1) * (0.85 + 0.25 * rng.next()) / 100) * 100;
    p.contract = null; p.wage = 0; p.free = true; p.freeSince = date;
    p.value = marketValue(p, { tier: 1, date });
    return p;
  }
  const c = pickClub(rng, nat, p.ovr);
  const vt = tierFromL(c.L);
  // Pensja w klubie zagranicznym: rynek Ekstraklasy x poziom ligi [SZAC]
  const wMul = c.L >= 12 ? 0.95 : c.L >= 11 ? 0.8 : c.L >= 10 ? 0.65 : 0.5;
  const wage = Math.max(500, Math.round(marketWage(p.ovr, 1, false, 1) * wMul * (0.9 + 0.2 * rng.next()) / 100) * 100);
  p.contract = { wage, until: `${startYear + rng.int(1, 3)}-06-30`, clause: 0, signedOn: date };
  p.wage = wage; p.free = false;
  p.abroad = { country: nat, countryName: NAT_NAMES[nat] ?? nat, club: c.name, clubId: c.clubId, league: Math.round(c.L * 10) / 10, rep: c.rep, vt, priceMul: Math.round(priceMulFor(nat, rng) * 100) / 100, since: date };
  p.value = marketValue(p, { tier: vt, date });
  return p;
}

/** Dodaje n zawodników do puli (deterministycznie z ziarna gry i znacznika). Zwraca dodanych. */
export function addPoolPlayers(game, n, date, tag, { free = null } = {}) {
  const M = game.market; const W = game.world;
  if (!Array.isArray(M.foreign)) M.foreign = [];
  const rng = new Rng(`zagranica:${game.seed}:${tag}`);
  const out = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    let id;
    do id = `zag-${tag}-${++k}`; while (W.players[id] && k < 10000);
    const p = genPoolPlayer(rng, id, date, { free });
    W.players[id] = p;
    M.foreign.push(id);
    if (p.free) M.free.push(id);
    out.push(p);
  }
  return out;
}

// ------------------------------------------------------------ Kandydaci skautów (src/career/scoutOps.js)
/** Kandydat ze skautingu z ważnym raportem (p.scout.until): poza rotacją puli i poza liczeniem do 100. */
export const scoutHeld = (p, date) => !!p?.scout && !p.scout.released && (p.scout.until ?? '') >= date;

/**
 * Prowizja skauta na zlecenie przy podpisaniu kandydata: c % kwoty transferu, przy wolnym ryczałt 3 tygodniówki x c / 5 %.
 * Wołana z completeTransfer (transfers.js); zero dla skauta klubu.
 */
export function scoutCommission(p, fee, wage) {
  const pct = p?.scout?.pct;
  if (!pct) return 0;
  return Math.round(fee ? fee * pct / 100 : 3 * (wage ?? 0) * pct / 5);
}

/** Grupa pozycji kandydata z misji klubu AI (zakup w tym tygodniu celuje w tę grupę), albo null. */
export function scoutedGroup(game, clubId, date, groupOf) {
  const C = game.scoutOps?.cands;
  for (const id of game.scoutOps?.aiIdx?.[clubId] ?? []) {
    const c = C?.[id]; const p = game.world.players[id];
    if (c && p && !p.clubId && (c.excl ?? '') >= date) return groupOf(p);
  }
  return null;
}

/** Wyłączność zlecającego: przez 14 dni od raportu inny klub nie bierze kandydata skauta pod uwagę. */
export const scoutBlocked = (p, clubId, date) => !!p?.scout && p.scout.club !== clubId && (p.scout.excl ?? '') >= date;

// ------------------------------------------------------------ Uzupełnienie przed oknem
const busy = (game, id) => {
  const p = game.world.players[id];
  return !!(p?.transfer || hasOpenDeal(game, id) || game.market.talks?.[id]?.accepted);
};

/**
 * Uzupełnia pulę do POOL.size: usuwa tych, którzy trafili do polskiego klubu albo zniknęli z rynku wolnych,
 * zamienia wygasłe kontrakty w wolnych, ok. 15 % zawodników z kontraktem zostaje za granicą. Zwraca liczbę dodanych.
 */
export function topUpPool(game, date, tag) {
  ensureForeignPool(game);
  const M = game.market; const W = game.world;
  const freeSet = new Set(M.free);
  M.foreign = M.foreign.filter((id) => {
    const p = W.players[id];
    if (!p || p.clubId) return false;
    return p.free ? freeSet.has(id) : isPoolContracted(p);
  });
  const rng = new Rng(`zagranica:${game.seed}:odplyw-${tag}`);
  M.foreign = M.foreign.filter((id) => {
    const p = W.players[id];
    if (p.free || scoutHeld(p, date)) return true; // kandydat skauta (scoutOps.js): ważny raport, bez rotacji
    if (p.contract.until < date && !busy(game, id) && p.poolBand === 'czolowka') { // najlepsi przedłużają kontrakt za granicą
      const y = Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) >= 7 ? 0 : -1);
      p.contract = { ...p.contract, until: `${y + rng.int(1, 2)}-06-30`, signedOn: date };
    }
    if (p.contract.until < date && !busy(game, id)) { // koniec kontraktu za granicą: zostaje na rynku jako wolny
      p.askWage = p.contract.wage; p.contract = null; p.wage = 0; p.free = true; p.freeSince = date; delete p.abroad;
      M.free.push(id);
      return true;
    }
    if (busy(game, id) || !rng.chance(POOL.churn)) {
      p.value = marketValue(p, { tier: p.abroad.vt ?? 1, date });
      return true;
    }
    delete W.players[id]; delete M.talks[id]; // zostaje za granicą: znika z gry (nigdy nie grał w Polsce)
    return false;
  });
  // Kandydaci skautów z ważnym raportem nie liczą się do 100 (lista skautingu, nie zwykła pula)
  const need = Math.max(0, POOL.size - M.foreign.filter((id) => !scoutHeld(W.players[id], date)).length);
  if (need) addPoolPlayers(game, need, date, tag);
  stat(game, 'poolAdded', need);
  return need;
}

/** Dzień: uzupełnienie puli raz na okno (7 dni przed otwarciem albo w pierwszym dniu okna). */
export function foreignPoolDay(game, date) {
  ensureForeignPool(game);
  const w = upcomingWindow(date);
  if (!w || game.market.foreignTop === w.from) return 0;
  game.market.foreignTop = w.from;
  return topUpPool(game, date, w.from);
}

// ------------------------------------------------------------ Lista i zakupy
/** Zawodnicy puli na rynku (wolni i z kontraktem), z ceną i pensją. region: filtr regionOf albo 'all'. */
export function poolList(game, region = 'all') {
  const W = game.world;
  return (game.market.foreign ?? []).map((id) => W.players[id]).filter((p) => p && !p.clubId && (p.free || isPoolContracted(p)))
    .filter((p) => region === 'all' || regionOf(p.nat) === region);
}

/** Kandydaci dla klubu AI: zawodnicy z kontraktem za granicą w grupie pozycji, lepsi od progu, w zasięgu pieniędzy. */
export function poolCandidates(game, club, date, { group, bar, money, groupOf }) {
  const out = scoutedFor(game, club, date, { group, bar, money, groupOf }); // kandydaci własnych misji skautów
  if (!new Rng(`zagranica-ai:${game.seed}:${club.id}:${date}`).chance(POOL.aiChance)) return out;
  for (const p of poolList(game)) {
    if (p.free || groupOf(p) !== group || p.ovr <= bar + 0.3 || p.transfer || hasOpenDeal(game, p.id) || scoutBlocked(p, club.id, date)) continue;
    const fee = foreignAskingPrice(game, p);
    if (fee <= money * POOL.aiMoney) out.push({ p, fee });
  }
  return out;
}

/**
 * Kandydaci z misji skautów klubu AI (wyłączność 14 dni, poza listami rynku): ocena z raportu skauta (AI też bierze
 * wydmuszki), wolni i z kontraktem, za co najwyżej POOL.aiMoney wolnych środków. Bez losu aiChance: klub sam ich szukał.
 */
function scoutedFor(game, club, date, { group, bar, money, groupOf }) {
  const C = game.scoutOps?.cands;
  if (!C) return [];
  const out = [];
  for (const id of game.scoutOps.aiIdx?.[club.id] ?? []) {
    const c = C[id]; const p = game.world.players[id];
    if (!c || !p || p.clubId || c.club !== club.id || (c.excl ?? '') < date || groupOf(p) !== group || (c.seenOvr ?? p.ovr) <= bar) continue;
    if (p.transfer || hasOpenDeal(game, p.id)) continue;
    const fee = p.free ? 0 : foreignAskingPrice(game, p);
    if (fee <= money * POOL.aiMoney) out.push({ p, fee });
  }
  return out;
}

/**
 * Oferta gracza za zawodnika z kontraktem za granicą (jak offerForPlayer): okno, budżet, weto zarządu, limit kadry,
 * trzy rundy i przerwa 14 dni. Zwraca { result: 'accept'|'counter'|'reject', price?, counter?, text, veto? }.
 */
export function offerForForeign(game, playerId, fee) {
  const p = game.world.players[playerId];
  const date = game.date;
  if (!isPoolContracted(p)) return { result: 'reject', text: 'Tego zawodnika nie można kupić.' };
  const seller = p.abroad.club;
  if (!inWindow(date)) return { result: 'reject', text: 'Okno transferowe jest zamknięte. Transfer możliwy w następnym oknie.' };
  const t = game.market.talks[playerId] ?? { rounds: 0, until: null };
  if (t.until && date < t.until) return { result: 'reject', text: `Klub nie chce rozmawiać do ${t.until}.` };
  if (hasOpenDeal(game, p.id)) return { result: 'reject', text: 'Zawodnik jest w trakcie transferu do innego klubu.' };
  const cap = canSign(game);
  if (!cap.ok) return { result: 'reject', text: cap.text };
  if (spendable(game.finance, game.clubId) - pendingFees(game, game.clubId) < fee) return { result: 'reject', text: 'Kwota przekracza budżet transferowy albo saldo klubu.' };
  const board = checkUserFee(game, p, fee); // weto zarządu: odstępne ponad progi
  if (board.veto) return { result: 'reject', veto: true, text: board.text };
  const price = foreignAskingPrice(game, p);
  t.rounds++; t.date = date;
  game.market.talks[playerId] = t;
  const name = seller.charAt(0).toUpperCase() + seller.slice(1);
  if (fee >= price) { t.accepted = fee; return { result: 'accept', price, text: `${name} przyjmuje ofertę ${fmtZl(fee)}. Możesz rozmawiać z zawodnikiem o kontrakcie.${board.warn ? ` ${board.warn}` : ''}` }; }
  if (t.rounds >= 3) { t.until = addDays(date, 14); t.rounds = 0; return { result: 'reject', text: `${name} kończy rozmowy. Trzy oferty były za niskie. Spróbuj za 2 tygodnie.` }; }
  if (fee >= price * POOL.counter) { t.counter = price; return { result: 'counter', price, counter: price, text: `${name} chce ${fmtZl(price)}.` }; }
  return { result: 'reject', price, text: `${name} odrzuca ofertę jako zbyt niską.` };
}
