// Koniec sezonu i start kolejnego (etap 10). Uruchamiany 1 lipca, przed innymi systemami dnia.
// Kolejność: wyniki sezonu -> ruchy między ligami -> zawodnicy (wypożyczenia, kontrakty, emerytury, wiek,
// akademia, statystyki) -> kadry (uzupełnienie) -> finanse i zarząd -> puchary na nowy sezon -> nowy terminarz.

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { CLUBS_PL, clubById, LEAGUE_NAMES, leagueLabel } from '../data/clubs_pl.js';
import { SQUAD_LAYOUT, squadOf, academyOf, generateClubSquad } from '../world/worldGen.js';
import { genPlayer, marketValue } from '../world/playerGen.js';
import { pickNationality } from '../data/names.js';
import { setSeasonYear, SEASON, SEASON_YEAR, SEASON_END, SEASON_START } from '../config/calendar2026.js';
import { GROUP, SQUAD_TARGETS, decideRetirement, squadDeficits } from '../career/squad.js';
import { marketWage } from '../career/negotiation.js';
import { payLevel } from '../data/finanse_klubow.js';
import { createTactics } from '../engine/lineup.js';
import { standings } from './standings.js';
import { winnerOf } from './cup.js';
import { createSeason, anyClub, thirdLeaguePlayoffResult } from './season.js';
import { applyLeagueState, computeMoves, validateTiers, knownClub, dissolveDropped } from './leagues.js';
import { L3_COMPS, compClubIds } from './leagueComps.js';
import { L3_GROUPS } from '../config/competitions.js';
import { allocateEuropeanSpots } from './europeAccess.js';
import { COUNTRY_COEF_2026, UCOMP_NAMES } from './uefa.js';
import { seasonWindows } from './intl/windows.js';
import { initClub, seasonSummary, FIN } from '../career/finance.js';
import { academyMods, academyCapOf } from '../career/infrastructure.js';
import { addFreeAgents } from '../career/transfers.js';
import { returnLoansAtRollover } from '../career/loans.js';
import { applyPreContracts } from '../career/preContracts.js'; // umowy od 1 lipca (docs/transfery.md)
import { boardGoal, jobOffers, ensureBoard } from '../career/board.js';
import { coachesNewSeason } from '../career/coaches.js';
import { coachMarketNewSeason } from '../career/coachMarket.js';
import { fmtDate } from '../ui/dom.js';
import { archivePlayerSeason, archiveSeasonMatches, syncSpell } from './history.js';
import { reputationSeasonEnd, applyClubRep } from '../career/reputationSystem.js'; // docs/reputacja.md

const TIER_COMP = { 1: 'ekstraklasa', 2: 'liga1', 3: 'liga2' };
const groupOf = (p) => GROUP[p.pos] ?? 'MID';
const name = (id) => anyClub(id)?.name ?? id;
const LEAGUE_L = { 1: 11.5, 2: 10, 3: 8.5, 4: 7.5 };

/** Ustawia kalendarz i ligi zgodnie z zapisem gry (wczytanie albo nowa gra). */
export function applySeasonState(game) {
  const y = game.seasonYear ?? 2026;
  setSeasonYear(y, { windows: seasonWindows(y), polishEurope: y === 2026 ? null : game.season?.polishEurope ?? [] });
  applyLeagueState(game);
  applyClubRep(game); // marka krajowa klubów z zapisu (club.rep), po ustaleniu lig
}

// ------------------------------------------------------------ Wyniki sezonu
export function seasonResults(game) {
  const tables = {}; const rows = {};
  for (const t of [1, 2, 3]) {
    const comp = TIER_COMP[t];
    rows[t] = standings(game.fixtures.filter((f) => f.comp === comp), CLUBS_PL.filter((c) => c.tier === t).map((c) => c.id));
    tables[t] = rows[t].map((r) => r.id);
  }
  // III liga: tabele 4 grup (pusta grupa w zapisie sprzed grywalnej III ligi: kolejność z siły)
  const groupTables = {}; const groupRows = {};
  L3_GROUPS.forEach((g, i) => {
    const comp = L3_COMPS[i];
    const ids = compClubIds(comp);
    const fx = game.fixtures.filter((f) => f.comp === comp);
    groupRows[g] = fx.length ? standings(fx, ids) : ids.map((id) => ({ id, points: 0, gf: 0, ga: 0 })).sort((a, b) => (anyClub(b.id)?.L ?? 0) - (anyClub(a.id)?.L ?? 0));
    groupTables[g] = groupRows[g].map((r) => r.id);
  });
  const pw = game.season.playoffs?.winners ?? {};
  const playoffWinners = { 2: pw['PO-liga1-F'] ?? null, 3: pw['PO-liga2-F'] ?? null };
  const l3Playoff = thirdLeaguePlayoffResult(game);
  const ppF = game.fixtures.find((f) => f.comp === 'pp' && f.round === 'F' && f.played);
  const cup = { winner: game.season.cup?.champion ?? (ppF ? winnerOf(ppF) : null), runnerUp: ppF ? [ppF.home, ppF.away].find((x) => x !== winnerOf(ppF)) : null };
  const U = game.season.uefa;
  const uefa = U ? Object.fromEntries(Object.entries(U.comps).map(([k, c]) => [k, c.champion])) : {};
  return { tables, rows, groupTables, groupRows, playoffWinners, l3Playoff, cup, uefa };
}

// ------------------------------------------------------------ Puchary na kolejny sezon
function polandNextSeason(game, res) {
  const coef = game.countryCoef ?? { ...COUNTRY_COEF_2026 };
  const U = game.season.uefa;
  if (U) {
    const clubs = {};
    for (const c of Object.values(U.comps)) for (const r of Object.values(c.rounds)) for (const id of r.entrants) {
      const cc = CLUBS_PL.some((x) => x.id === id) ? 'POL' : (anyClub(id)?.country ?? '?');
      clubs[cc] = (clubs[cc] ?? 0) + 1;
    }
    for (const cc of Object.keys(coef)) coef[cc] = Math.round((coef[cc] * 0.8 + (U.countryPts[cc] ?? 0) / (clubs[cc] || 1)) * 1000) / 1000;
  }
  game.countryCoef = coef;
  const rank = Object.entries(coef).sort((a, b) => b[1] - a[1]).findIndex(([cc]) => cc === 'POL') + 1;
  const eligible = (id) => !clubById(id)?.parent;
  const spots = allocateEuropeanSpots(res.tables[1], res.cup, Math.max(1, rank), eligible);
  return { rank, spots };
}

// ------------------------------------------------------------ Zawodnicy
function newContract(p, tier, years, date, club = null) {
  tier = Math.min(4, tier);
  return { wage: marketWage(p.ovr, tier, p.nat !== 'POL' && tier === 1, payLevel(club)), until: `${Number(date.slice(0, 4)) + years}-06-30`, clause: 0, signedOn: date };
}

function ageOn(p, date) {
  if (!p.birthDate) return (p.age ?? 25) + 1;
  const y = Number(date.slice(0, 4)) - Number(p.birthDate.slice(0, 4));
  return date.slice(5) < p.birthDate.slice(5) ? y - 1 : y;
}

function processPlayers(game, oldEnd, newStart, rng, report) {
  const W = game.world;
  // Powroty z wypożyczeń: wcześniej, przed rozwiązaniem kadr spadkowiczów do III ligi (returnLoansAtRollover)
  // Statystyki sezonu wyzerowane (historia wyżej), kartki zerowane, wiek
  for (const p of Object.values(W.players)) {
    p.season = { apps: 0, subs: 0, min: 0, g: 0, a: 0, yc: 0, rc: 0, rating: 0, motm: 0, cs: 0 };
    p.yc = {};
    p.age = ageOn(p, newStart);
    p.renewRefused = false; p.transferRequest = false;
  }
  // Emerytury (decyzja 0/1 raz w roku) i wygasłe kontrakty
  for (const [cid, club] of Object.entries(W.clubs)) {
    const c = clubById(cid);
    const leagueL = LEAGUE_L[c?.tier ?? 4];
    for (const id of [...club.squad]) {
      const p = W.players[id];
      const expiring = !p.contract || p.contract.until <= oldEnd;
      const ret = (p.age >= 31) ? decideRetirement(p, { leagueL, minutesShare: 0.5, hasContractNextSeason: !expiring, longInjuryDays: p.injuryDays }, rng) : { retire: false };
      if (ret.retire) {
        club.squad = club.squad.filter((x) => x !== id);
        if (cid === game.clubId) report.retired.push(`${p.name} (${p.age} lat)`);
        delete W.players[id];
        continue;
      }
      if (expiring) {
        club.squad = club.squad.filter((x) => x !== id);
        if (cid === game.clubId) report.expired.push(`${p.name} (${p.pos})`);
        p.askWage = p.contract?.wage ?? marketWage(p.ovr, c?.tier ?? 3); p.contract = null; p.wage = 0; p.clubId = null; p.free = true; p.freeSince = newStart;
        game.market.free.push(id);
      }
    }
  }
  // Wolni zawodnicy: starsi kończą kariery, długo bez klubu znikają
  game.market.free = game.market.free.filter((id) => {
    const p = W.players[id];
    if (!p) return false;
    if (p.age >= 34 || (p.freeSince && p.freeSince < addDays(newStart, -360))) { delete W.players[id]; return false; }
    return true;
  });
}

/** Akademia: dorośli juniorzy do kadry albo odchodzą; 3-5 nowych juniorów. */
function processAcademy(game, newStart, rng, report) {
  const W = game.world;
  for (const [cid, club] of Object.entries(W.clubs)) {
    const c = clubById(cid);
    if (!c) continue;
    const squad = squadOf(W, cid);
    const bar = [...squad].sort((a, b) => b.ovr - a.ovr)[21]?.ovr ?? 0;
    for (const id of [...club.academy]) {
      const p = W.players[id];
      if (!p || p.age < 19) continue;
      club.academy = club.academy.filter((x) => x !== id);
      if (p.ovr >= bar - 0.6 || squad.length < 22) {
        club.squad.push(id); p.squad = 'A'; p.contract = newContract(p, c.tier, 3, newStart, c); p.wage = p.contract.wage;
        if (cid === game.clubId) report.promotedYouth.push(`${p.name} (${p.pos})`);
      } else delete W.players[id];
    }
    // Akademia klubu (career/infrastructure.js): liczba i jakość juniorów, szansa na talent względem poziomu startowego
    const am = academyMods(game, cid);
    const n = Math.max(1, rng.int(3, 5) + am.extra);
    for (let i = 0; i < n; i++) {
      const [pos, side] = rng.pick(SQUAD_LAYOUT);
      const p = genPlayer(rng, { id: `${cid}-a${SEASON_YEAR}-${i + 1}`, L: c.L, pos, age: rng.int(16, 17), slotOffset: -1.0 + am.offset, nat: 'POL', tier: Math.min(4, c.tier), side: side ?? null, club: c, date: newStart, m: 0 });
      if (am.talent > 0 && p.hidden && new Rng(`talent:${game.seed}:${p.id}`).next() < am.talent) p.hidden.POT = Math.min(20, Math.round((p.hidden.POT + 1.5) * 10) / 10);
      p.squad = 'Y';
      W.players[p.id] = p; club.academy.push(p.id);
      if (cid === game.clubId) report.newYouth.push(`${p.name} (${p.pos}, ${p.age} lat)`);
    }
    // Pełna akademia (miejsca według poziomu akademii, 3-24): odchodzi junior, który najmniej rokuje (najniższy
    // potencjał POT), a przy równym starszy. Wcześniej odpadał najsłabszy dziś (najniższy OVR), czyli świeży 16-latek.
    const outlook = (p) => p.hidden?.POT ?? p.ovr;
    const cap = academyCapOf(game, cid);
    while (club.academy.length > cap) { const worst = academyOf(W, cid).sort((a, b) => outlook(a) - outlook(b) || b.age - a.age)[0]; club.academy = club.academy.filter((x) => x !== worst.id); delete W.players[worst.id]; }
  }
}

/** Uzupełnienie kadry: wolni zawodnicy pasujący poziomem, a gdy ich brak, zawodnik wygenerowany na miejscu. */
export function fillSquad(game, cid, target, date, rng, report = null) {
  const W = game.world; const c = clubById(cid);
  const tier = Math.min(4, c.tier);
  let squad = squadOf(W, cid);
  let guard = 0;
  while (guard++ < 30) {
    const needs = squadDeficits(squad).filter((n) => n.scope === 'squad');
    if (!needs.length && squad.length >= target) break;
    const g = needs.find((n) => n.group !== 'ALL')?.group ?? rng.pick(['DEF', 'MID', 'ATT', 'MID', 'DEF']);
    const fit = game.market.free.map((id) => W.players[id]).filter((p) => p && !p.transfer && groupOf(p) === g && p.ovr <= c.L + 0.8 && p.ovr >= c.L - 3)
      .sort((a, b) => Math.abs(a.ovr - (c.L + 0.2)) - Math.abs(b.ovr - (c.L + 0.2)))[0];
    let p = fit;
    if (p) {
      game.market.free = game.market.free.filter((id) => id !== p.id);
      delete p.free; delete p.askWage;
    } else {
      const pos = rng.pick(SQUAD_LAYOUT.filter(([x]) => (GROUP[x] ?? 'MID') === g));
      p = genPlayer(rng, { id: `${cid}-n${SEASON_YEAR}-${guard}-${rng.int(100, 999)}`, L: c.L, pos: pos[0], age: rng.int(19, 29), slotOffset: -0.2, nat: pickNationality(tier, rng), tier, side: pos[1] ?? null, club: c, date });
      W.players[p.id] = p;
    }
    p.clubId = cid; p.squad = 'A'; p.contract = newContract(p, tier, rng.int(1, 3), date, c); p.wage = p.contract.wage; p.lastMove = date;
    W.clubs[cid].squad.push(p.id);
    if (report) report.signed.push(`${p.name} (${p.pos})`);
    squad = squadOf(W, cid);
  }
}

// ------------------------------------------------------------ Główna funkcja
export function rolloverSeason(game) {
  const oldSeason = SEASON; const oldYear = SEASON_YEAR; const oldEnd = SEASON_END;
  const rng = new Rng(`koniec-sezonu:${game.seed}:${oldYear}`);
  const res = seasonResults(game);
  const userClub = clubById(game.clubId);
  const userTier = userClub.tier; const userGroup = userClub.group;
  const userTable = userTier === 4 ? res.groupTables[userGroup] ?? [] : res.tables[userTier] ?? [];
  const userPos = userTable.indexOf(game.clubId) + 1;
  // Ruchy między ligami (III liga z tabel grup i baraży, IV liga: uzupełnienie grup, docs/iii-liga.md)
  const moves = computeMoves(res.tables, res.playoffWinners, res.groupTables, rng.fork('ligi'), { l3Playoff: res.l3Playoff });
  const tiers4 = Object.fromEntries(Object.entries(moves.tiers).filter(([, t]) => t <= 4));
  const errors = validateTiers(tiers4, moves.groups);
  const europe = polandNextSeason(game, res);
  // Reputacja: punkty UEFA klubów, marka krajowa, trofea i zdarzenia zawodników (przed archiwizacją statystyk i zmianą lig)
  reputationSeasonEnd(game, res, moves);
  archiveSeasonMatches(game, oldSeason); // historia meczów drużyny gracza: sezon zamknięty przed nowym terminarzem
  // Statystyki zawodników do p.history przed ruchami końca sezonu (spadki do IV ligi, powroty z wypożyczeń),
  // więc wiersz należy do klubu, w którym zawodnik kończył sezon
  for (const p of Object.values(game.world.players)) archivePlayerSeason(p, oldSeason);
  // Archiwum sezonu
  game.archive = [...(game.archive ?? []), {
    season: oldSeason, champion: res.tables[1][0], cup: res.cup.winner, uefa: res.uefa, superCupEU: game.season.superCupEU?.winner ?? null,
    tables: Object.fromEntries([1, 2, 3].map((t) => [t, res.rows[t].map((r) => ({ id: r.id, pts: r.points, gd: r.gf - r.ga }))])),
    l3: Object.fromEntries(L3_GROUPS.map((g) => [g, res.groupRows[g].map((r) => ({ id: r.id, pts: r.points, gd: r.gf - r.ga }))])),
    l3Playoff: (moves.l3Playoff ?? []).map((x) => ({ keeper: x.keeper, challenger: x.challenger, winner: x.winner })),
    user: { club: game.clubId, tier: userTier, pos: userPos, ...(userTier === 4 ? { group: userGroup } : {}) }, promoted: moves.promoted, relegated: moves.relegated, polandRank: europe.rank,
  }].slice(-15);

  // Nowy sezon: kalendarz, ligi. Zapis tylko odstępstw od danych (kluby w innej lidze lub grupie niż na start gry)
  const year = oldYear + 1;
  const newStart = `${year}-07-01`;
  const prev = game.leagueState ?? { tiers: {}, groups: {} };
  const merged = { ...prev.tiers, ...moves.tiers };
  const userDown = merged[game.clubId] > 4; // klub gracza spada do IV ligi: kadra zostaje do zmiany pracy
  game.leagueState = {
    year,
    tiers: Object.fromEntries(Object.entries(merged).filter(([id, t]) => knownClub(id) && knownClub(id).tier0 !== t)),
    groups: Object.fromEntries(Object.entries(moves.groups).filter(([id]) => merged[id] === 4 && (knownClub(id)?.tier0 !== 4 || knownClub(id)?.group0 !== moves.groups[id]))),
    ...(userDown ? { keep: [game.clubId] } : {}),
  };
  game.seasonYear = year;
  coachesNewSeason(game, year); // trenerzy AI: rok starsi, doświadczenie albo spadek formy (career/coaches.js)
  coachMarketNewSeason(game, year); // pula wolnych trenerów: starsi, część odchodzi z zawodu, nowi (career/coachMarket.js)
  const polishEurope = europe.spots.map(({ club, comp, entry, path, via }) => ({ club, comp, entry, ...(path ? { path } : {}), via }));
  setSeasonYear(year, { windows: seasonWindows(year), polishEurope });
  applyLeagueState(game);
  applyClubRep(game);
  // Powroty z wypożyczeń kończących się 30 czerwca i z udziałem klubów spadających do IV ligi; obowiązek albo opcja
  // wykupu zamienia wypożyczenie w transfer (src/career/loans.js). Wypożyczenia na rok trwają dalej.
  const loansBack = returnLoansAtRollover(game, oldEnd, newStart);
  // Prekontrakty: zawodnicy przechodzą do nowych klubów, zanim wygasną ich kontrakty (src/career/preContracts.js)
  const pre = applyPreContracts(game, newStart);
  // Spadkowicze do IV ligi (bez stałych kadr) tracą kadrę: lepsi zawodnicy trafiają do wolnych.
  // Spadkowicze z 2 Ligi do III ligi zachowują kadry (III liga jest grywalna).
  dissolveDropped(game, newStart);
  // Beniaminkowie z IV ligi (albo wracający) dostają kadry, spadkowicze do III ligi mają wagę siły
  for (const c of CLUBS_PL) {
    const id = c.id;
    if (c.tier > 4 || game.world.clubs[id]) continue;
    const { players, academy } = generateClubSquad(c, new Rng(`awans:${game.seed}:${id}:${year}`), newStart);
    for (const p of [...players, ...academy]) { if (game.world.players[p.id]) p.id = `${p.id}-s${year}`; p.clubId = id; game.world.players[p.id] = p; }
    game.world.clubs[id] = { squad: players.map((p) => p.id), academy: academy.map((p) => p.id) };
  }
  for (const c of CLUBS_PL) if (c.tier === 4 && c.weight == null) c.weight = 5;

  // Zawodnicy i kadry
  const report = { expired: [], retired: [], loansBack, promotedYouth: [], newYouth: [], signed: [] };
  processPlayers(game, oldEnd, newStart, rng.fork('zawodnicy'), report);
  processAcademy(game, newStart, rng.fork('akademia'), report);
  for (const p of Object.values(game.world.players)) if (p.clubId) p.value = marketValue(p, { tier: Math.min(4, clubById(p.clubId)?.tier ?? 4), date: newStart });
  addFreeAgents(game, 45, newStart, `lato-${year}`); // 126 klubów z kadrami (było 30 przy 54)
  addFreeAgents(game, 8, newStart, `import-${year}`, { imports: true }); // było 22: wolni z zagranicy przychodzą też z puli (career/foreignPool.js)
  for (const cid of Object.keys(game.world.clubs)) {
    if (!clubById(cid)) continue;
    if (cid === game.clubId) fillSquad(game, cid, 18, newStart, rng.fork(`uzup:${cid}`), report);
    else fillSquad(game, cid, 23, newStart, rng.fork(`uzup:${cid}`));
  }
  // Historia klubowa: powroty z wypożyczeń, wygasłe kontrakty, nowi zawodnicy (src/season/history.js)
  for (const p of Object.values(game.world.players)) {
    if (p.cl) syncSpell(p, newStart);
    else if (p.clubId && p.lastMove === newStart) p.cl = [{ c: p.clubId, f: newStart, m: 0, g: 0 }];
  }

  // Finanse: plan sezonu z danych klubu dla nowej ligi (docs/finanse.md), saldo przechodzi, bogaty właściciel
  // uzupełnia saldo do skarbca, budżet transferowy z wolnego salda
  const F = game.finance;
  for (const c of CLUBS_PL) {
    if (!game.world.clubs[c.id]) continue;
    const old = F.clubs[c.id];
    // Spadek: pensje obniżone o klauzulę spadkową z kontraktu (domyślnie 30 %) [SZAC]
    if (old?.tier && c.tier > old.tier) {
      for (const p of squadOf(game.world, c.id)) {
        if (p.loan || !p.contract) continue;
        p.contract.wage = Math.round(p.contract.wage * (1 - (p.contract.relegationCut || FIN.RELEGATION_WAGE_CUT)) / 100) * 100; p.wage = p.contract.wage;
      }
    }
    const fresh = old ? initClub(game.world, c, { balance: old.balance, date: newStart, ai: c.id !== game.clubId }) : initClub(game.world, c);
    if (old) fresh.history = [...(old.history ?? []), { season: oldSeason, ...seasonSummary(old) }].slice(-10);
    F.clubs[c.id] = fresh;
  }
  F.merit = {};

  // Zarząd: ocena sezonu, nowy cel
  const B = ensureBoard(game);
  const goal = B.goal; const target = goal?.target ?? 10;
  let delta = clamp((target - userPos) * 1.5, -15, 12);
  if (moves.promoted[userTier - 1]?.includes(game.clubId)) delta += 15;
  if ((moves.relegated[userTier + 1] ?? []).includes(game.clubId)) delta -= 25;
  if (res.tables[1][0] === game.clubId) delta += 15;
  if (res.cup.winner === game.clubId) delta += 8;
  B.trust = Math.round(clamp(50 + (B.trust - 50) * 0.5 + delta, 0, 100));
  B.reviews = [{ date: newStart, trust: B.trust, delta: Math.round(delta * 10) / 10, pos: userPos, notes: [`Sezon ${oldSeason} zakończony na ${userPos}. miejscu.`] }, ...(B.reviews ?? [])].slice(0, 12);
  game.manager.seasons = [...(game.manager.seasons ?? []), { season: oldSeason, club: game.clubId, tier: userTier, pos: userPos, target }];
  B.goal = boardGoal(game, clubById(game.clubId)); B.goalClub = game.clubId;
  const droppedOut = clubById(game.clubId).tier > 4; // IV liga nie jest prowadzona: trener szuka nowego klubu
  const fired = B.trust < 18 || droppedOut;

  // Rynek i nowy terminarz
  Object.assign(game.market, { listed: {}, talks: {}, offers: [], userListed: {}, history: game.market.history.slice(0, 150) });
  const champion = res.tables[1][0];
  const cupWinner = res.cup.winner && res.cup.winner !== champion ? res.cup.winner : res.tables[1][1];
  game.season = createSeason(`${game.seed}:${year}`, { playerClub: game.clubId, superCup: [champion, cupWinner], holder: res.uefa.LM ?? undefined, uefaHolders: res.uefa });
  game.season.polishEurope = polishEurope;
  game.fixtures = game.season.fixtures;
  game.tactics = createTactics(squadOf(game.world, game.clubId), { benchSize: 12, formation: game.tactics?.formation, instructions: game.tactics?.instructions });
  if (game.summary) game.summary.season = SEASON;

  // Wiadomości
  const list = (ids) => ids.map(name).join(', ') || 'brak';
  const msgs = [];
  msgs.push(createMessage({
    date: newStart, key: `koniec:${oldSeason}`, category: 'competitions', from: 'Rozgrywki', priority: 'important',
    subject: `Koniec sezonu ${oldSeason}: ${name(champion)} mistrzem Polski`,
    body: [
      `Twoja drużyna: ${userPos}. miejsce (${userTier === 4 ? `III liga, grupa ${['', 'I', 'II', 'III', 'IV'][userGroup] ?? userGroup}` : LEAGUE_NAMES[userTier]}).`,
      `Puchar Polski: ${res.cup.winner ? name(res.cup.winner) : 'brak rozstrzygnięcia'}.`,
      `Awans do Ekstraklasy: ${list(moves.promoted[1])}. Spadek: ${list(moves.relegated[2])}.`,
      `Awans do 1 Ligi: ${list(moves.promoted[2])}. Spadek z 1 Ligi: ${list(moves.relegated[3])}.`,
      `Awans do 2 Ligi z III ligi: ${list(moves.promoted[3])}. Spadek do III ligi: ${list(moves.relegated[4])}.`,
      ...(moves.l3Playoff ?? []).map((x) => `Baraż o 2 Ligę: ${name(x.keeper)} - ${name(x.challenger)}, wygrywa ${name(x.winner)}.`),
      `Awans do III ligi z IV ligi: ${list(moves.promoted[4])}. Spadek do IV ligi: ${list(moves.relegated[5])}.`,
      ...moves.notes.filter((n) => n.kind === 'reserve').map((n) => `${name(n.id)}: przeniesienie administracyjne (rezerwy muszą grać niżej niż pierwsza drużyna).`),
      `Puchary europejskie: ${Object.entries(res.uefa).map(([k, v]) => `${UCOMP_NAMES[k]}: ${name(v)}`).join(', ')}.`,
      ...(errors.length ? [`Uwaga techniczna: ${errors.join('; ')}`] : []),
    ].join('\n'),
  }));
  msgs.push(createMessage({ date: newStart, key: `europa:${year}`, category: 'competitions', from: 'UEFA', priority: 'info', subject: `Europejskie puchary ${SEASON}`, body: `Polska w rankingu krajów UEFA: ${europe.rank}. miejsce.\n\n${europe.spots.map((s) => `${name(s.club)}: ${UCOMP_NAMES[s.comp]}, ${s.entry === 'LP' ? 'faza ligowa' : `runda ${s.entry}`} (${s.via})`).join('\n')}` }));
  const squadLines = [
    pre.in.length ? `Dołączyli na podstawie umów od 1 lipca: ${pre.in.join(', ')}.` : '',
    pre.out.length ? `Odeszli na podstawie umów od 1 lipca: ${pre.out.join(', ')}.` : '',
    report.expired.length ? `Odeszli po wygaśnięciu kontraktu: ${report.expired.join(', ')}.` : '',
    report.retired.length ? `Zakończyli kariery: ${report.retired.join(', ')}.` : '',
    report.loansBack.length ? `Wrócili do klubów po wypożyczeniu: ${report.loansBack.join(', ')}.` : '',
    report.promotedYouth.length ? `Z akademii do pierwszej drużyny: ${report.promotedYouth.join(', ')}.` : '',
    report.newYouth.length ? `Nowi juniorzy w akademii: ${report.newYouth.join(', ')}.` : '',
    report.signed.length ? `Asystent uzupełnił kadrę do minimum: ${report.signed.join(', ')}.` : '',
  ].filter(Boolean);
  const sq = squadOf(game.world, game.clubId).length;
  msgs.push(createMessage({ date: newStart, key: `kadra-lato:${year}`, category: 'staff', from: 'Dyrektor sportowy', priority: 'important', subject: `Kadra przed sezonem ${SEASON}: ${sq} zawodników`, body: `${squadLines.join('\n\n') || 'Bez zmian w kadrze.'}${sq < 22 ? '\n\nKadra liczy mniej niż 22 zawodników. Uzupełnij ją w zakładce Transfery (wolni zawodnicy są dostępni od razu).' : ''}` }));
  const fin = F.clubs[game.clubId];
  if (fired) {
    game.manager.fired = (game.manager.fired ?? 0) + 1;
    const offers = jobOffers(game, newStart, true);
    msgs.push(createMessage({ date: newStart, key: `zwolnienie-lato:${year}`, category: 'board', from: 'Zarząd', priority: 'urgent', subject: `${name(game.clubId)}: zarząd rozwiązuje umowę`, body: droppedOut ? `${name(game.clubId)} spada do IV ligi, której gra nie prowadzi. Wybierz nowy klub, żeby kontynuować karierę.` : `Po sezonie ${oldSeason} zarząd nie widzi cię na stanowisku trenera. Wybierz nowy klub.`, actions: offers.map((o) => ({ id: o.clubId, label: `${o.name} (${o.league})` })), refs: { kind: 'jobOffer' } }));
  } else {
    msgs.push(createMessage({ date: newStart, key: `zarzad-lato:${year}`, category: 'board', from: 'Zarząd', priority: 'important', subject: `Cel na sezon ${SEASON}: ${B.goal.text}`, body: `Ocena sezonu ${oldSeason}: ${userPos}. miejsce. Zaufanie zarządu: ${B.trust} na 100.\n\nBudżet transferowy: ${Math.round(fin.transferBudget / 1000)} tys. zł. Budżet płac: ${Math.round(fin.wageBudget / 100) * 100} zł tygodniowo. Saldo: ${Math.round(fin.balance / 1000)} tys. zł.` }));
  }
  return { messages: msgs, moves, errors, europe, res };
}

registerDailySystem({
  id: 'rollover', order: 0,
  run(game, date) {
    if (!game.season || !game.world || date <= SEASON_END) return {};
    const r = rolloverSeason(game);
    return { messages: r.messages };
  },
});

export { SEASON_START, FIN, fmtDate };
