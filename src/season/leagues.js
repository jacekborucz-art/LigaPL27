// Przynależność klubów do lig w kolejnych sezonach (etap 10, PLAN 6; grywalna III liga: docs/iii-liga.md).
// Stan: game.leagueState = { year, tiers: { id: 1..6 }, groups: { id: grupa III ligi 1-4 }, extra: { id: klub z poziomu 6 } }.
// Poziom 6 (V liga albo klasa okręgowa) istnieje tylko w karierach z IV ligą (docs/iv-liga.md): kluby IV ligi po spadku
// i beniaminkowie z plików właściciela (src/data/level6.js), zapisani w extra po pierwszym awansie do IV ligi.
// Obiekty klubów (CLUBS_PL z III ligą, CLUBS_L4) są współdzielone przez całą grę, więc applyLeagueState() ustawia im
// pola tier i group zgodnie z zapisem gry (i przywraca stan początkowy dla nowej gry). Lista CLUBS_PL zawiera po
// tym kluby lig 1-4 (ze stałymi kadrami); kluby IV ligi (tier 5) są poza nią i grają tylko w Pucharze Polski.

import { Rng, clamp } from '../core/rng.js';
import { CLUBS_PL, touchClubs, clubById } from '../data/clubs_pl.js';
import { CLUBS_L4 } from '../data/clubs_l4.js';
import { RESERVES, L3_GROUPS } from '../config/competitions.js';
import { VOIVODESHIPS, VOIV, voivOfData } from '../data/voivodeships.js';
import { level6Club, level6SaveData, level6Candidates } from '../data/level6.js';

const BASE = CLUBS_PL.slice(); // 54 kluby lig 1-3 i 72 kluby III ligi (clubs_pl.js)
const BASE_IDS = new Set(BASE.map((c) => c.id));
const ALL = [...BASE, ...CLUBS_L4.filter((c) => !BASE_IDS.has(c.id))];
const KNOWN = new Map(ALL.map((c) => [c.id, c]));
for (const c of ALL) {
  if (c.tier0 == null) c.tier0 = c.tier;
  if (!('group0' in c)) c.group0 = c.group ?? null;
}
export const knownClub = (id) => KNOWN.get(id) ?? null;
// Kluby z poziomu 6 z zapisu gry (leagueState.extra): dopisane do ALL i KNOWN, usuwane przy wczytaniu innej gry
const EXTRA = new Set();
function addExtra(id, data) {
  if (KNOWN.has(id)) return KNOWN.get(id);
  const c = level6Club(id, data);
  ALL.push(c); KNOWN.set(id, c); EXTRA.add(id);
  return c;
}
function registerExtras(S) {
  if (EXTRA.size) { for (let i = ALL.length - 1; i >= 0; i--) if (EXTRA.has(ALL[i].id)) { KNOWN.delete(ALL[i].id); ALL.splice(i, 1); } EXTRA.clear(); }
  for (const [id, d] of Object.entries(S?.extra ?? {})) addExtra(id, d);
}
const NAMES = () => new Set(ALL.map((c) => c.name.toLowerCase()));

// Grupa III ligi według województwa klubu (regiony z clubs_pl.js; kluby z III i IV ligi mają grupę w danych).
const REGION_GROUP = {
  warszawa: 1, mazowsze: 1, lodz: 1, lodzkie: 1, radom: 1, plock: 1, bialystok: 1,
  trojmiasto: 2, szczecin: 2, poznan: 2, wielkopolska: 2, pomorze: 2, kujawy: 2, bydgoszcz: 2,
  slask: 3, wroclaw: 3, 'dolny-slask': 3, opole: 3, lubuskie: 3, bielsko: 3, czestochowa: 3,
  krakow: 4, malopolska: 4, lublin: 4, rzeszow: 4, podkarpacie: 4, kielce: 4,
};
/** Grupa III ligi, do której klub należy terytorialnie. */
export function l3GroupFor(club) {
  if (!club) return 1;
  if (club.l3group) return club.l3group;
  if (club.tier0 === 4 && club.group0) return club.group0;
  return REGION_GROUP[club.region] ?? 1;
}

export function applyLeagueState(game) {
  registerExtras(game?.leagueState); // kluby z poziomu 6 z zapisu (albo żadne: nowa gra, stary zapis)
  // Powrót do stanu początkowego
  for (const c of ALL) { c.tier = c.tier0; if (c.group0 == null) delete c.group; else c.group = c.group0; delete c.dyn; }
  const S = game?.leagueState;
  if (S) {
    for (const [id, t] of Object.entries(S.tiers ?? {})) { const c = KNOWN.get(id); if (c) c.tier = t; }
    for (const [id, g] of Object.entries(S.groups ?? {})) { const c = KNOWN.get(id); if (c) c.group = g; }
  }
  // Klub III ligi bez zapisanej grupy (stary zapis, beniaminek z IV ligi): grupa z województwa
  for (const c of ALL) {
    if (c.tier !== 4) continue;
    const explicit = S?.groups?.[c.id] != null;
    if (!explicit && (c.tier0 !== 4 || !(c.group >= 1 && c.group <= 4))) c.group = l3GroupFor(c);
  }
  // Klub gracza po spadku do IV ligi zostaje na liście (z kadrą) do zmiany pracy (S.keep)
  const keep = new Set(S?.keep ?? []);
  CLUBS_PL.length = 0;
  for (const c of ALL) if (c.tier <= 4 || keep.has(c.id)) CLUBS_PL.push(c);
  touchClubs();
}

/** Najwyższa liga dla rezerw: poniżej pierwszej drużyny i nie wyżej niż limit PZPN. */
export function reserveMayPlayIn(reserveTier, parentTier) {
  return reserveTier > parentTier && reserveTier >= RESERVES.reserveMaxTier;
}

/** Grupy IV ligi (województwa) w grupie III ligi; kluby spoza danych IV ligi trafiają do jednej z nich na stałe (z id). */
const VOIVS = (() => { const m = {}; for (const c of CLUBS_L4) (m[c.l3group] ??= new Set()).add(c.voiv); return Object.fromEntries(Object.entries(m).map(([g, s]) => [g, [...s].sort()])); })();
const hash = (s) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const voivOf = (c, g) => c.voiv ?? VOIVS[g][hash(c.id) % VOIVS[g].length];
/** Województwo klubu (grupa IV ligi): pole voiv, region klubu lig 1-4 (src/data/voivodeships.js), w ostateczności stałe z id. */
export function voivOfClub(c) {
  if (!c) return null;
  return voivOfData(c) ?? voivOf(c, l3GroupFor(c));
}
/** Kluby IV ligi (poziom 5) według województw: { voiv: [id...] } w kolejności danych (po applyLeagueState). */
export function fourthLeagueMembers() {
  const out = Object.fromEntries(VOIVODESHIPS.map((v) => [v.key, []]));
  for (const c of ALL) if (c.tier === 5) (out[voivOfClub(c)] ??= []).push(c.id);
  return out;
}

/**
 * Ruchy między ligami po sezonie.
 * tables: { 1: [id...], 2: [...], 3: [...] } (końcowe tabele lig 1-3), playoffWinners: { 2: id, 3: id },
 * groupTables: { 1..4: [id...] } (końcowe tabele grup III ligi), rng,
 * opts.l3Playoff: rozegrane baraże III ligi [{ keeper, challenger, winner }] albo null (wtedy symulacja z siły),
 * opts.semis: pary półfinałów do symulacji (domyślnie losowanie).
 * opts.licence: kluby bez licencji { id: o ile klas niżej (1-2) } (src/career/arrears.js): klub na końcu tabeli swojej
 * ligi (spada zamiast ostatniego sportowo, nie awansuje); 2 klasy: dalej o klasę, a najlepszy spadkowicz tej ligi zostaje.
 * opts.l4: IV liga z wynikami (kariery z IV ligą, docs/iv-liga.md) { tables: { voiv: [id...] }, playoff: { 1..4: { w, ru } }, seed }:
 * do III ligi 4 mistrzów województw na grupę, zwycięzca baraży przy wolnym miejscu, skład grup IV ligi i poziom 6.
 * Bez l4 (stare zapisy, testy): dotychczasowe uzupełnienie III ligi losowaniem z wagi.
 * Zwraca { tiers: { id: nowa liga 1-6 }, groups: { id: grupa III ligi }, promoted, relegated, l3Up, l3Runners, l3Playoff, notes }
 * oraz z l4: { l4Up, l4Playoff, l4Down, l4In, l4Short, extra }.
 */
export function computeMoves(tables, playoffWinners, groupTables, rng, { l3Playoff = null, licence = null, l4 = null } = {}) {
  const lic = Object.entries(licence ?? {}).filter(([, n]) => n > 0);
  if (lic.length) {
    tables = { ...tables };
    for (const [id] of lic) for (const t of [1, 2, 3]) if (tables[t]?.includes(id)) tables[t] = [...tables[t].filter((x) => x !== id), id];
  }
  const tier = {}; const group = {};
  for (const t of [1, 2, 3]) for (const id of tables[t] ?? []) tier[id] = t;
  const groupsIn = L3_GROUPS.filter((g) => groupTables?.[g]?.length);
  for (const g of groupsIn) for (const id of groupTables[g]) { tier[id] = 4; group[id] = g; }
  const parentOf = (id) => KNOWN.get(id)?.parent ?? null;
  const notes = [];
  const promoted = { 1: [], 2: [], 3: [], 4: [] }; // do ligi o numerze
  const relegated = { 2: [], 3: [], 4: [], 5: [] };

  const upFrom = (t, n) => {
    const eligible = tables[t].filter((id) => !parentOf(id));
    const direct = eligible.slice(0, n);
    // Zwycięzca baraży liczy się tylko, gdy grał w barażach (miejsca 3-6 wśród uprawnionych)
    const po = playoffWinners[t] && eligible.slice(n, n + 4).includes(playoffWinners[t]) ? playoffWinners[t] : eligible[n];
    return [...direct, po].filter(Boolean);
  };
  // Ekstraklasa <-> 1 Liga
  promoted[1] = upFrom(2, 2);
  relegated[2] = tables[1].slice(15, 18);
  // 1 Liga <-> 2 Liga
  promoted[2] = upFrom(3, 2);
  relegated[3] = tables[2].slice(15, 18);
  // 2 Liga -> III liga: 15-18 bezpośrednio, 13-14 w barażach z wicemistrzami grup III ligi
  relegated[4] = tables[3].slice(14, 18);
  for (const id of promoted[1]) tier[id] = 1;
  for (const id of relegated[2]) tier[id] = 2;
  for (const id of promoted[2]) tier[id] = 2;
  for (const id of relegated[3]) tier[id] = 3;
  for (const id of relegated[4]) tier[id] = 4;
  // Brak licencji drugi sezon z rzędu: o 2 klasy niżej (najniżej III liga); najlepszy spadkowicz ligi pośredniej zostaje
  for (const [id, n] of lic) {
    const t = [1, 2, 3].find((x) => tables[x]?.includes(id));
    if (!t || n < 2 || t + 2 > 4 || tier[id] !== t + 1) continue;
    tier[id] = t + 2;
    relegated[t + 1] = relegated[t + 1].filter((x) => x !== id); relegated[t + 2].push(id);
    const saved = relegated[t + 2].find((x) => x !== id && tier[x] === t + 2 && tables[t + 1]?.includes(x) && !parentOf(x));
    if (saved) { tier[saved] = t + 1; relegated[t + 2] = relegated[t + 2].filter((x) => x !== saved); notes.push({ id: saved, kind: 'reprieve', tier: t + 1 }); }
    notes.push({ id, kind: 'licence', from: t, to: t + 2 });
  }
  for (const [id, n] of lic) if (n === 1 && !notes.some((x) => x.id === id && x.kind === 'licence')) notes.push({ id, kind: 'licence', to: tier[id] });

  // III liga: zwycięzca grupy awansuje, wicemistrz gra w barażach; rezerwy tylko, gdy wolno (inaczej kolejny klub)
  const ok = (id) => { const p = parentOf(id); return !p || reserveMayPlayIn(3, tier[p] ?? KNOWN.get(p)?.tier ?? 1); };
  const winners = []; const runners = [];
  for (const g of groupsIn) {
    const eligible = groupTables[g].filter(ok);
    if (eligible[0]) winners.push(eligible[0]);
    if (eligible[1]) runners.push(eligible[1]);
  }
  for (const id of winners) { tier[id] = 3; promoted[3].push(id); }
  // Baraż: rozegrany w terminarzu (l3Playoff) albo symulowany z siły (stary zapis, brak meczów)
  const L = (id) => KNOWN.get(id)?.L ?? 8;
  const duel = (a, b, twoLegs = false) => { const p = clamp(0.5 + 0.12 * (L(a) - L(b)) + (twoLegs ? 0 : 0.04), 0.1, 0.9); return rng.chance(p) ? a : b; };
  let po = l3Playoff;
  if (!po) {
    const r = rng.shuffle([...runners]);
    const semi = [r[0] && r[1] ? duel(r[0], r[1]) : r[0], r[2] && r[3] ? duel(r[2], r[3]) : r[2]];
    po = [];
    [tables[3][12], tables[3][13]].forEach((keeper, i) => {
      const ch = semi[i];
      if (!ch || !keeper) return;
      po.push({ keeper, challenger: ch, winner: duel(keeper, ch, true), simulated: true });
    });
  }
  for (const x of po) {
    if (x.winner !== x.challenger || tier[x.keeper] !== 3 || tier[x.challenger] !== 4) continue;
    tier[x.keeper] = 4; tier[x.challenger] = 3; relegated[4].push(x.keeper); promoted[3].push(x.challenger);
  }

  // Reguły rezerw: rezerwy zawsze niżej niż pierwsza drużyna i najwyżej w 2 Lidze
  for (const [id, c] of KNOWN) {
    if (!c.parent || tier[id] == null) continue;
    const pt = tier[c.parent] ?? KNOWN.get(c.parent)?.tier;
    if (pt == null || reserveMayPlayIn(tier[id], pt) || tier[id] >= 5) continue;
    const from = tier[id];
    tier[id] = Math.min(5, Math.max(pt + 1, RESERVES.reserveMaxTier));
    notes.push({ id, kind: 'reserve', from, to: tier[id] });
    // Rezerwy przeniesione administracyjnie zastępują jeden spadek sportowy w lidze, z której spadają
    if (from <= 3 && tier[id] > from) {
      const saved = relegated[from + 1].find((x) => tier[x] === from + 1 && x !== id && !KNOWN.get(x)?.parent);
      if (saved) { tier[saved] = from; relegated[from + 1] = relegated[from + 1].filter((x) => x !== saved); notes.push({ id: saved, kind: 'reprieve', tier: from }); }
    }
    for (const k of Object.keys(relegated)) relegated[k] = relegated[k].filter((x) => x !== id);
    for (const k of Object.keys(promoted)) promoted[k] = promoted[k].filter((x) => x !== id);
    if (tier[id] > from) relegated[tier[id]].push(id);
  }

  // Skład grup III ligi na nowy sezon: spadkowicze z 2 Ligi do grupy swojego województwa, spadek do IV ligi co najmniej
  // z miejsc 15-18 i więcej, gdy grupa przyjmuje więcej spadkowiczów; uzupełnienie do 18 z IV ligi (4 województwa grupy)
  if (groupsIn.length && !l4) {
    const PROMO_IV = 4; // beniaminkowie z IV ligi na grupę (zwycięzcy grup wojewódzkich) [uproszczenie]
    const thisDown = new Set();
    for (const g of groupsIn) {
      const table = groupTables[g];
      const stay = table.filter((id) => tier[id] === 4);
      const incoming = Object.keys(tier).filter((id) => tier[id] === 4 && group[id] == null);
      const inG = incoming.filter((id) => l3GroupFor(KNOWN.get(id)) === g);
      const bottom = new Set(table.slice(14));
      const keepN = Math.max(0, 18 - inG.length - PROMO_IV);
      const kept = stay.filter((id) => !bottom.has(id)).slice(0, keepN);
      for (const id of stay) if (!kept.includes(id)) { tier[id] = 5; relegated[5].push(id); thisDown.add(id); }
      for (const id of [...kept, ...inG]) group[id] = g;
    }
    // Uzupełnienie z IV ligi (w kolejności grup), rezerwy tylko, gdy pierwsza drużyna gra wyżej
    for (const g of groupsIn) {
      const have = Object.keys(group).filter((id) => group[id] === g && tier[id] === 4).length;
      let need = 18 - have;
      if (need <= 0) continue;
      const pool = ALL.filter((c) => !thisDown.has(c.id) && tier[c.id] == null && c.tier === 5 && l3GroupFor(c) === g)
        .filter((c) => !c.parent || reserveMayPlayIn(4, tier[c.parent] ?? KNOWN.get(c.parent)?.tier ?? 1));
      const order = rng.shuffle([...VOIVS[g]]);
      for (let i = 0; need > 0 && pool.length; i++) {
        const voiv = order[i % order.length];
        const sub = i < order.length ? pool.filter((c) => voivOf(c, g) === voiv) : pool;
        if (!sub.length) continue;
        const c = rng.weighted(sub, (x) => (x.weight ?? 2) ** 2.2);
        pool.splice(pool.indexOf(c), 1);
        tier[c.id] = 4; group[c.id] = g; promoted[4].push(c.id); need--;
      }
    }
  }
  const l4out = groupsIn.length && l4 ? fourthLeagueMoves({ groupsIn, groupTables, tier, group, promoted, relegated, notes, l4, rng, parentOf }) : null;
  return { tiers: tier, groups: group, promoted, relegated, l3Up: winners, l3Runners: runners, l3Playoff: po, notes, ...(l4out ?? {}) };
}

/**
 * Kariera z IV ligą (docs/iv-liga.md, rozdz. 4): skład grup III ligi i IV ligi na nowy sezon.
 * III liga, każda grupa g: spadek co najmniej z miejsc 15-18; wolne miejsca = 18 - zostający - spadkowicze z 2 Ligi.
 * Zawsze 4 mistrzów województw (za mało miejsc: spadają też 14., potem 13.), piąte miejsce dla zwycięzcy baraży
 * makroregionu, kolejne: utrzymanie najlepszych spadkowiczów (15., potem 16.). III liga ma zawsze 72 kluby.
 * IV liga, każde województwo: spadek do poziomu 6 co najmniej minDown + nadwyżka spadkowiczów z III ligi nad awansami,
 * rezerwy niżej niż pierwsza drużyna (przeniesienie administracyjne liczy się jako spadek), beniaminkowie z poziomu 6
 * do docelowego rozmiaru grupy (losowanie z wagi); pusta pula: utrzymanie najlepszych spadkowiczów.
 */
function fourthLeagueMoves({ groupsIn, groupTables, tier, group, promoted, relegated, notes, l4, rng, parentOf }) {
  const tierNow = (id) => tier[id] ?? KNOWN.get(id)?.tier ?? 6;
  const ok4 = (id) => { const p = parentOf(id); return !p || reserveMayPlayIn(4, tierNow(p)); };
  const tables = l4.tables ?? {};
  const inL4 = new Set(Object.values(tables).flat());
  const l4Up = []; const l4Playoff = [];
  // ---- III liga
  for (const g of groupsIn) {
    const table = groupTables[g];
    const stay = table.filter((id) => tier[id] === 4);
    const inG = Object.keys(tier).filter((id) => tier[id] === 4 && group[id] == null && l3GroupFor(KNOWN.get(id)) === g);
    const bottom = new Set(table.slice(14));
    const kept = stay.filter((id) => !bottom.has(id));
    const down = stay.filter((id) => bottom.has(id)); // 15. miejsce pierwsze
    let seats = 18 - kept.length - inG.length;
    while (seats < 4 && kept.length) { down.unshift(kept.pop()); seats++; } // za mało miejsc: spadają 14., potem 13.
    const voivs = VOIVODESHIPS.filter((v) => v.l3group === g).map((v) => v.key);
    const champs = voivs.map((v) => (tables[v] ?? []).find((id) => tier[id] == null && ok4(id))).filter(Boolean);
    const ins = [];
    for (const id of champs) if (seats > 0) { ins.push(id); l4Up.push(id); seats--; }
    const P = l4.playoff?.[g];
    if (P?.w) {
      const up = seats > 0 && tier[P.w] == null && !ins.includes(P.w) && ok4(P.w);
      if (up) { ins.push(P.w); seats--; }
      l4Playoff.push({ g, id: P.w, up });
    }
    // Województwo bez uprawnionego mistrza: finalista baraży
    if (champs.length < voivs.length && seats > 0 && P?.ru && tier[P.ru] == null && !ins.includes(P.ru) && ok4(P.ru)) { ins.push(P.ru); seats--; }
    while (seats > 0 && down.length) { const id = down.shift(); kept.push(id); seats--; notes.push({ id, kind: 'reprieve', tier: 4 }); }
    // Ostatecznie (praktycznie nie występuje): kolejne uprawnione kluby z tabel województw makroregionu
    for (let k = 0; seats > 0 && k < 20; k++) {
      for (const v of voivs) {
        const id = (tables[v] ?? []).find((x) => tier[x] == null && ok4(x) && !ins.includes(x));
        if (id && seats > 0) { ins.push(id); seats--; }
      }
    }
    for (const id of down) { tier[id] = 5; relegated[5].push(id); }
    for (const id of [...kept, ...inG]) group[id] = g;
    for (const id of ins) { tier[id] = 4; group[id] = g; promoted[4].push(id); }
  }
  // ---- IV liga i poziom 6
  const l4Down = {}; const l4In = {}; const l4Short = {}; const extra = {};
  const names = NAMES();
  const down6 = new Set();
  const parentTier = (id) => { const p = parentOf(id); if (!p) return null; if (down6.has(p)) return 6; return tier[p] ?? (inL4.has(p) ? 5 : KNOWN.get(p)?.tier ?? 1); };
  const reserveOk5 = (id) => { const pt = parentTier(id); return pt == null || reserveMayPlayIn(5, pt); };
  for (const v of VOIVODESHIPS) {
    const table = tables[v.key] ?? [];
    const up = table.filter((id) => tier[id] != null && tier[id] <= 4);
    let stay = table.filter((id) => tier[id] == null || tier[id] >= 5);
    let incoming = Object.keys(tier).filter((id) => tier[id] === 5 && !inL4.has(id) && voivOfClub(KNOWN.get(id)) === v.key);
    // Rezerwy, których pierwsza drużyna gra w IV lidze albo niżej: przeniesienie administracyjne na poziom 6
    const forced = [...stay, ...incoming].filter((id) => !reserveOk5(id));
    stay = stay.filter((id) => !forced.includes(id)); incoming = incoming.filter((id) => !forced.includes(id));
    for (const id of forced) notes.push({ id, kind: 'reserve', from: 5, to: 6 });
    const need = v.minDown + Math.max(0, incoming.length - up.length);
    const sport = [];
    for (let k = Math.max(0, need - forced.length); k > 0 && stay.length; k--) sport.unshift(stay.pop()); // najwyższe miejsce pierwsze
    for (const id of [...forced, ...sport]) down6.add(id);
    let n = stay.length + incoming.length;
    while (n > v.size && stay.length) { const id = stay.pop(); sport.unshift(id); down6.add(id); n--; }
    // Beniaminkowie z poziomu 6: spadkowicze z IV ligi z wcześniejszych sezonów i kluby z pliku właściciela
    let want = v.size - n;
    const pool = ALL.filter((c) => c.tier === 6 && tier[c.id] == null && !down6.has(c.id) && voivOfClub(c) === v.key && reserveOk5(c.id))
      .map((c) => ({ id: c.id, w: c.weight ?? 1 }));
    for (const e of level6Candidates(v.key, l4.seed ?? 0, (id, nm) => KNOWN.has(id) || names.has(nm.toLowerCase()))) pool.push({ id: e.id, w: level6SaveData(e, v.key).w, e });
    const ups = [];
    while (want > 0 && pool.length) {
      const x = rng.weighted(pool, (c) => c.w ** 2.2);
      pool.splice(pool.indexOf(x), 1);
      if (x.e) { extra[x.id] = level6SaveData(x.e, v.key); addExtra(x.id, extra[x.id]); names.add(x.e.name.toLowerCase()); }
      tier[x.id] = 5; ups.push(x.id); want--;
    }
    // Pusta pula: utrzymanie najlepszych spadkowiczów sportowych tego sezonu
    while (want > 0 && sport.length) { const id = sport.shift(); down6.delete(id); stay.push(id); want--; notes.push({ id, kind: 'reprieve', tier: 5 }); }
    if (want > 0) l4Short[v.key] = v.size - want;
    const downs = [...forced, ...sport];
    for (const id of downs) tier[id] = 6;
    for (const id of [...stay, ...incoming]) tier[id] = 5;
    l4Down[v.key] = downs; l4In[v.key] = ups;
  }
  // Rezerwy, których pierwsza drużyna spadła na poziom 6 w tym samym sezonie (rzadkie): też na poziom 6
  for (const v of VOIVODESHIPS) {
    for (const id of Object.keys(tier).filter((x) => tier[x] === 5 && voivOfClub(KNOWN.get(x)) === v.key && !reserveOk5(x))) {
      tier[id] = 6; l4Down[v.key].push(id); notes.push({ id, kind: 'reserve', from: 5, to: 6 });
    }
  }
  return { l4Up, l4Playoff, l4Down, l4In, l4Short, extra };
}

/** Rozmiary grup IV ligi po zmianach (tiers: pełna mapa poziomów albo odstępstwa od danych): { voiv: liczba klubów }. */
export function fourthLeagueSizes(tiers) {
  const out = Object.fromEntries(VOIVODESHIPS.map((v) => [v.key, 0]));
  for (const c of ALL) if ((tiers[c.id] ?? c.tier0) === 5) out[voivOfClub(c)] = (out[voivOfClub(c)] ?? 0) + 1;
  return out;
}

/** Kontrola po zmianach: po 18 klubów w ligach 1-3 i w każdej grupie III ligi, rezerwy niżej niż pierwsza drużyna i najwyżej w 2 Lidze. */
export function validateTiers(tiers, groups = null) {
  const errors = [];
  for (const t of [1, 2, 3]) {
    const n = Object.values(tiers).filter((x) => x === t).length;
    if (n !== 18) errors.push(`Liga ${t}: ${n} klubów`);
  }
  if (groups) {
    for (const g of L3_GROUPS) {
      const n = Object.keys(tiers).filter((id) => tiers[id] === 4 && groups[id] === g).length;
      if (n !== 18) errors.push(`III liga, grupa ${g}: ${n} klubów`);
    }
  }
  for (const [id, t] of Object.entries(tiers)) {
    const c = KNOWN.get(id);
    if (c?.parent && t <= 4 && !reserveMayPlayIn(t, tiers[c.parent] ?? KNOWN.get(c.parent)?.tier)) errors.push(`${id}: rezerwy w lidze ${t}`);
  }
  return errors;
}

/**
 * Stary zapis (grupy spadkowiczów z 2 Ligi losowane): grupy III ligi wyrównane do 18 przez przeniesienie klubów spoza
 * danych grupy (najpierw do grupy ich województwa). Zmienia S.groups i zwraca liczbę przeniesień.
 */
export function balanceGroups(S) {
  const t4 = ALL.filter((c) => (S.tiers?.[c.id] ?? c.tier0) === 4);
  const g = (c) => S.groups?.[c.id] ?? (c.tier0 === 4 ? c.group0 : l3GroupFor(c));
  const count = () => Object.fromEntries(L3_GROUPS.map((x) => [x, t4.filter((c) => g(c) === x).length]));
  let moved = 0;
  for (let guard = 0; guard < 40; guard++) {
    const n = count();
    const over = L3_GROUPS.find((x) => n[x] > 18); const under = L3_GROUPS.find((x) => n[x] < 18);
    if (over == null || under == null) break;
    const movable = t4.filter((c) => g(c) === over && !(c.tier0 === 4 && c.group0 === over));
    const c = movable.find((x) => l3GroupFor(x) === under) ?? movable[0] ?? t4.filter((x) => g(x) === over).at(-1);
    (S.groups ??= {})[c.id] = under; moved++;
  }
  return moved;
}

/**
 * Kluby bez ligi z kadrami (IV liga, tier 5) tracą stałą kadrę: zawodnicy poniżej 33 lat z OVR od 7 trafiają do wolnych,
 * reszta znika. Klub gracza zostaje do zmiany pracy (leagueState.keep), potem też jest rozwiązywany.
 */
export function dissolveDropped(game, date) {
  const keep = new Set(game.leagueState?.keep ?? []);
  for (const id of Object.keys(game.world.clubs)) {
    if (clubById(id) && clubById(id).tier <= 4) continue;
    if (keep.has(id) && id === game.clubId) continue;
    const wc = game.world.clubs[id];
    for (const pid of wc.squad) {
      const p = game.world.players[pid];
      if (!p) continue;
      if (p.age < 33 && p.ovr >= 7) { p.askWage = p.contract?.wage ?? 1000; p.contract = null; p.wage = 0; p.clubId = null; p.free = true; p.freeSince = date; game.market.free.push(pid); } else delete game.world.players[pid];
    }
    for (const pid of wc.academy) delete game.world.players[pid];
    delete game.world.clubs[id];
    if (game.finance?.clubs) delete game.finance.clubs[id];
  }
  if (game.leagueState?.keep && !game.leagueState.keep.includes(game.clubId)) { delete game.leagueState.keep; applyLeagueState(game); }
}

export { Rng };
