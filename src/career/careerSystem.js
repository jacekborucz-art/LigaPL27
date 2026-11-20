// Kariera w pętli dni (etap 9): finanse, rynek transferowy, oferty, zarząd, praca trenera.
import { attendanceModifier } from './fans.js';
import { ensureCoaches } from './coaches.js';
import { registerDailySystem } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { registerDecision } from '../core/decisions.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { squadOf } from '../world/worldGen.js';
import { createTactics } from '../engine/lineup.js';
import { fmtDate } from '../ui/dom.js';
import { anyClub } from '../season/season.js';
import { SEASON_START, SEASON_YEAR } from '../config/calendar2026.js';
import { winnerOf } from '../season/cup.js';
import { standings } from '../season/standings.js';
import { dissolveDropped } from '../season/leagues.js';
import { compOfClub, compClubIds, LEAGUE_COMPS } from '../season/leagueComps.js';
import { COMPETITIONS } from '../config/competitions.js';
import { createFinance, financeDay, book, matchIncome, attendanceFill, uefaPrize, stadiumCapacity, meritTv, clubPlan, FIN } from './finance.js';
import { bookCupPrize, bookUefaWinner, uefaSolidarity } from './prizes.js'; // nagrody PP, UEFA (docs/finanse.md)
import './sponsors.js'; // umowy sponsorskie (docs/finanse.md, Sponsorzy)
import { createMarket, marketWeek, answerIncoming, aiRenewals, inWindow, windowOf, fmtZl, SEASON_END } from './transfers.js';
import { ensureBoard, boardMonth, seasonGoalFor, trustLabel } from './board.js';
import './squadLimitSystem.js'; // limit kadry i nacisk zarządu (docs/limit-kadry.md)
import './boardRequests.js'; // prośby do zarządu, warunki i budżety klubów AI (docs/finanse.md)
import { ensureCoachMarket, fireCoach, hireCoach } from './coachMarket.js'; // rynek trenerów AI i właściciele (docs/trenerzy-i-wlasciciele.md)
import { ensureInfra } from './infrastructure.js'; // stadion, baza, akademia (docs/infrastruktura.md)
import { ensureLoans } from './loans.js'; // wypożyczenia: systemy dnia i stare zapisy (docs/wypozyczenia.md)
import { ensureTransferState } from './transferSystem.js'; // transakcje w toku, prekontrakty, prośby o transfer, zagranica (docs/transfery.md)
import { foreignOfferMessage } from './foreignMarket.js';
import { ensureStaff } from './staffMarket.js'; // sztab: zatrudnianie i zwalnianie, pensje sztabu (docs/sztab.md)
import { ensureCareerHistory, careerScan, careerMonth, careerPress, careerLeave, boardStartTrust } from './coachCareer.js'; // kariera trenera (docs/kariera-trenera.md)
import { ensureJob, coachFired, jobAccepted, jobDeclined, unsolicitedOffers, offerMessage as jobOfferMessage } from './jobMarket.js'; // rynek pracy trenera
import { clubReputation } from './reputation.js';
import { isUnemployed } from '../core/gameLoop.js';


export function ensureCareer(game) {
  if (!game.world) return;
  if (!game.finance) game.finance = createFinance(game.world);
  // Zapis sprzed kalibracji finansów (docs/finanse.md): plan sezonu z danych klubu
  for (const [id, c] of Object.entries(game.finance.clubs)) if (!c.plan && clubById(id)) { c.plan = clubPlan(clubById(id)); c.tier = c.plan.tier; }
  ensureInfra(game); // stary zapis: poziomy startowe; nowe plany sezonu: pojemność, przychód z widza, utrzymanie
  if (!game.market) createMarket(game);
  ensureLoans(game);
  ensureTransferState(game);
  if (game.clubId) ensureBoard(game); // trener bez klubu: zarząd ostatniego klubu nie ocenia (src/career/jobMarket.js)
  ensureCoaches(game); // trenerzy klubów AI z atrybutami (stary zapis: profile z ziarna gry, te same nazwiska)
  ensureCoachMarket(game); // pula wolnych trenerów (stary zapis: tworzona z ziarna gry)
  ensureStaff(game); // osoby sztabu, limity, pensje sztabu w planie (stary zapis: neutralnie, z dzisiejszego sztabu)
  ensureJob(game); // stan pracy trenera (stary zapis: zatrudniony)
  ensureCareerHistory(game); // historia kariery (stary zapis: odtworzenie z sezonów, archiwum i historii meczów)
}

// ------------------------------------------------------------ Mecze: bilety i nagrody
function matchMoney(game, date) {
  const F = game.finance;
  const tables = new Map();
  const rowOf = (clubId) => {
    const comp = compOfClub(clubById(clubId)); if (!comp) return null;
    if (!tables.has(comp)) tables.set(comp, standings(game.fixtures.filter((f) => f.comp === comp), compClubIds(comp)));
    return tables.get(comp).find((r) => r.id === clubId);
  };
  for (const f of game.fixtures) {
    if (!f.played || f.fin || !(F.clubs[f.home] || F.clubs[f.away])) continue;
    f.fin = true;
    // Kibice: nastroje, bojkoty, zamknięte sektory i mecze bez publiczności (src/career/fans.js)
    const fill = attendanceFill(f, rowOf(f.home), anyClub(f.away), f.neutral ? null : F.clubs[f.home]) * attendanceModifier(game, f.home, f);
    f.attendance = Math.round((f.neutral ? 58000 : F.clubs[f.home]?.plan?.cap ?? stadiumCapacity(clubById(f.home) ?? anyClub(f.home))) * fill / 100) * 100;
    const [h0, a0] = matchIncome(F, f, fill);
    const mul = f.comp === 'friendly' ? 0.12 : 1; // sparing: bilety symboliczne
    const h = h0 * mul; const a = a0 * mul;
    book(F, f.home, f.date, 'in', 'tickets', h);
    if (a) book(F, f.away, f.date, 'in', 'tickets', a);
    if (f.comp === 'pp') bookCupPrize(F, game.fixtures, f); // kwota według najdalszej rundy, także dla przegranego
    if (f.comp === 'uefa') {
      const first = f.leg === 1 || f.round === 'F' || (f.round === 'league' && f.md === 1);
      for (const [s, id] of [[0, f.home], [1, f.away]]) {
        if (!F.clubs[id]) continue;
        if (first) book(F, id, f.date, 'in', 'prize', uefaPrize(f.ucomp, f.round), `${f.label}: udział`);
        if (f.ucomp === 'SEU' && winnerOf(f) === id) book(F, id, f.date, 'in', 'prize', uefaPrize('SEU', 'W'), 'Superpuchar Europy: zwycięstwo');
        if (f.round === 'league') {
          const [g0, g1] = f.result.score; const me = s === 0 ? g0 : g1; const op = s === 0 ? g1 : g0;
          if (me > op) book(F, id, f.date, 'in', 'prize', uefaPrize(f.ucomp, 'win')); else if (me === op) book(F, id, f.date, 'in', 'prize', uefaPrize(f.ucomp, 'draw'));
        }
      }
      bookUefaWinner(F, f); // finał LM, LE, LK: premia dla zdobywcy
    }
  }
  // Premia za miejsce z centralnego podziału ligi po ostatniej kolejce (Ekstraklasa SA 2025/26: mistrz 22,6 mln zł,
  // część liniowa i premia za podium; spadkowicze z Ekstraklasy dostają rekompensatę). 1 i 2 Liga [SZAC]. Model: docs/finanse.md.
  // III liga: bez centralnego podziału (docs/iii-liga.md).
  for (const comp of LEAGUE_COMPS) {
    F.merit = F.merit ?? {};
    if (F.merit[comp]) continue;
    const lf = game.fixtures.filter((f) => f.comp === comp);
    if (!lf.length || !lf.every((f) => f.played)) continue;
    F.merit[comp] = date;
    const tier = COMPETITIONS[comp].tier;
    for (const r of standings(lf, compClubIds(comp))) {
      const c = F.clubs[r.id]; if (!c) continue;
      book(F, r.id, date, 'in', 'tv', meritTv(tier, r.pos), `Podział środków ligi: premia za ${r.pos}. miejsce`);
      if (tier === 1 && r.pos >= 16) book(F, r.id, date, 'in', 'tv', FIN.RELEGATION_COMP, 'Rekompensata za spadek z Ekstraklasy');
    }
  }
}

// ------------------------------------------------------------ Wiadomości
const msg = (date, o) => createMessage({ date, category: 'board', from: 'Zarząd', priority: 'info', ...o });

function offerMessage(game, o, date) {
  const p = game.world.players[o.playerId]; const buyer = clubById(o.from) ?? { name: o.foreign?.name ?? 'Klub zagraniczny' };
  return createMessage({
    date, key: `oferta:${o.id}:${o.fee}`, category: 'transfers', from: buyer.name, priority: 'important',
    subject: `Oferta za ${p.name}: ${fmtZl(o.fee)}`,
    body: `${buyer.name} chce kupić ${p.name} (${p.pos}, ${p.age} lat) za ${fmtZl(o.fee)}. Wartość rynkowa: ${fmtZl(p.value)}. Oferta jest ważna do ${fmtDate(o.expires)}.${game.market.userListed[p.id] ? ' Zawodnik jest na twojej liście transferowej.' : ''}`,
    actions: [{ id: 'accept', label: 'Przyjmij' }, ...(o.raised ? [] : [{ id: 'more', label: 'Żądaj więcej' }]), { id: 'reject', label: 'Odrzuć' }],
    refs: { kind: 'incomingOffer', offerId: o.id }, optional: true,
  });
}

registerDecision('incomingOffer', (game, m, action) => {
  const r = answerIncoming(game, m.refs.offerId, action);
  const o = game.market.offers.find((x) => x.id === m.refs.offerId);
  const out = [createMessage({ date: game.date, category: 'transfers', from: 'Dyrektor sportowy', priority: 'info', subject: 'Odpowiedź na ofertę', body: r.text })];
  if (r.reopen && o?.foreign) { out.push(foreignOfferMessage(game, o, game.date)); return out; }
  if (r.reopen && o) out.push(offerMessage(game, o, game.date));
  return out;
});

/**
 * Zmiana klubu (nowa praca). Trener bez klubu (src/career/jobMarket.js): ostatni klub ma już trenera AI, więc tylko
 * zatrudnienie w nowym. Zatrudniony: odejście w trakcie umowy (kariera: okres pracy, kibice starego klubu).
 */
export function switchClub(game, clubId, date) {
  const old = game.clubId;
  const wasOut = isUnemployed(game);
  ensureCareerHistory(game);
  if (!wasOut && old && old !== clubId) careerLeave(game, date, 'oferta');
  // Trener AI nowego klubu odchodzi do puli wolnych trenerów (career/coachMarket.js)
  if (game.coaches?.[clubId] && game.world?.clubs?.[clubId]) { fireCoach(game, clubId, date, { why: 'wyniki', quiet: true, direct: true }); delete game.coaches[clubId]; }
  game.manager.history = [...(game.manager.history ?? []).map((h) => (h.club === old && !h.to ? { ...h, to: date } : h)), { club: clubId, from: date }];
  const { trustShift } = jobAccepted(game, clubId, date, { midContract: !wasOut });
  game.clubId = clubId;
  // Poprzedni klub spadł do IV ligi: jego kadra rozwiązana dopiero teraz (src/season/leagues.js)
  if (!wasOut && game.leagueState?.keep?.includes(old)) dissolveDropped(game, date);
  // Poprzedni klub gracza zatrudnia trenera z rynku (bez pracy: klub ma już trenera tymczasowego albo nowego)
  if (!wasOut && old && old !== clubId && game.world?.clubs?.[old]) hireCoach(game, old, date, { quiet: true });
  game.tactics = createTactics(squadOf(game.world, clubId), { benchSize: 12 });
  delete game.tacticsSubs; delete game.tacticsLast; // zastępstwa asystenta (match/matchday.js) dotyczyły starej kadry
  // Zaufanie na start z reputacji trenera wobec reputacji klubu (docs/kariera-trenera.md)
  const trust = Math.max(0, boardStartTrust(game.manager.rep, clubReputation(clubById(clubId))) + trustShift);
  game.board = { trust, fansMood: 55, reviews: [], goal: midSeasonGoal(game, clubId), goalClub: clubId };
  game.market.userListed = {};
  if (game.squadLimit) game.squadLimit.case = null; // sprawa limitu kadry dotyczyła poprzedniego klubu
  game.market.offers = game.market.offers.filter((o) => o.kind !== 'incoming');
  if (game.summary) game.summary.clubId = clubId;
}

/**
 * Cel zarządu dla trenera zatrudnionego w trakcie sezonu: klub pod celem (od 5. kolejki) oczekuje najpierw poprawy,
 * czyli miejsca 2 wyżej niż obecne (nie niżej niż nad strefą spadkową i nie wyżej niż cel z siły kadry) [SZAC].
 */
function midSeasonGoal(game, clubId) {
  const club = clubById(clubId);
  const goal = seasonGoalFor(club);
  const comp = compOfClub(club);
  if (!comp || !game.fixtures) return goal;
  const t = standings(game.fixtures.filter((f) => f.comp === comp), compClubIds(comp));
  const row = t.find((r) => r.id === clubId);
  if (!row || row.played < 5 || row.pos <= goal.target) return goal;
  const safe = t.length - (club.tier >= 3 ? 4 : 3);
  const target = Math.max(goal.target, Math.min(safe, row.pos - 2));
  return { ...goal, target, midSeason: true, text: target >= safe ? 'utrzymanie w lidze' : `poprawa: ${target}. miejsce lub wyżej` };
}

registerDecision('jobOffer', (game, m, action) => {
  if (action === 'stay') { jobDeclined(game, m); return []; }
  const club = clubById(action);
  if (!club || !game.world?.clubs?.[action]) return [];
  switchClub(game, action, game.date);
  return [msg(game.date, { key: `nowa-praca:${action}:${game.date}`, priority: 'important', subject: `Witamy w ${club.name}`, body: `Zostałeś nowym trenerem ${club.name}. Cel zarządu: ${game.board.goal.text}. Sprawdź kadrę i ustal skład przed najbliższym meczem.` })];
});

// ------------------------------------------------------------ System dnia
registerDailySystem({
  id: 'career', order: 50,
  run(game, date) {
    if (!game.world || !game.season) return {};
    ensureCareer(game);
    const messages = [];
    // Kariera trenera: rozegrane mecze (bilans, serie, trofea w dniu finału), konferencje, miesiąc (forma, zanik)
    messages.push(...careerScan(game, date));
    careerPress(game);
    if (date.endsWith('-01') && date > SEASON_START) messages.push(...careerMonth(game, date));
    financeDay(game.finance, game.world, date);
    if (date.endsWith('-01')) {
      // Długi klubów AI pokrywa właściciel (a rezerw pierwsza drużyna) z zapasem na miesiąc pensji, żeby saldo
      // nie spadło pod zero przed kolejną wpłatą; przy długu budżet transferowy przepada
      for (const [id, c] of Object.entries(game.finance.clubs)) {
        const cushion = Math.round((c.plan?.wages ?? 0) / 12 / 1000) * 1000;
        if (id === game.clubId || c.balance >= cushion) continue;
        const need = cushion - c.balance; const inDebt = c.balance < 0;
        const parent = clubById(id)?.parent;
        if (parent && game.finance.clubs[parent]) book(game.finance, parent, date, 'out', 'ops', need, `Dopłata do rezerw (${clubById(id).name})`);
        book(game.finance, id, date, 'in', 'owner', need, parent ? 'Dopłata pierwszej drużyny' : 'Dopłata właściciela do długów');
        if (inDebt) c.transferBudget = 0;
      }
    }
    matchMoney(game, date);
    uefaSolidarity(game, date); // 15 grudnia: wypłaty solidarnościowe UEFA (src/career/prizes.js)
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const w = windowOf(date);
    // Okno transferowe: otwarcie, tygodniowy rynek, oferty
    if (w && (date === w.from || dow === 1)) {
      const { moves, offers } = marketWeek(game, date);
      for (const o of offers) messages.push(offerMessage(game, o, date));
      const mineMoves = moves.filter((x) => x.from === game.clubId);
      if (moves.length) messages.push(createMessage({ date, key: `rynek:${date}`, category: 'transfers', from: 'Rynek transferowy', priority: 'info', subject: `Transfery tygodnia (${moves.length})`, body: moves.slice(0, 12).map((x) => `${x.name} (${x.pos}): ${anyClub(x.from)?.name ?? x.origin?.name ?? 'wolny zawodnik'} -> ${anyClub(x.to).name}${x.fee ? `, ${fmtZl(x.fee)}` : ''}`).join('\n') + (mineMoves.length ? '' : '') }));
    }
    // Wygasłe oferty
    for (const o of game.market.offers) if (o.status === 'open' && o.expires < date) o.status = 'expired';
    // Nieaktualne oferty w poczcie oznaczamy jako rozstrzygnięte
    const closed = new Set(game.market.offers.filter((o) => o.status !== 'open').map((o) => o.id));
    if (closed.size) game.inbox = game.inbox.map((m) => (m.refs?.offerId && closed.has(m.refs.offerId) && !m.resolved ? { ...m, resolved: true } : m));
    // Propozycje pracy wygasają po tygodniu
    game.inbox = game.inbox.map((m) => (m.refs?.kind === 'jobOffer' && m.optional && !m.resolved && m.date < addDaysIso(date, -7) ? { ...m, resolved: true } : m));
    // Co miesiąc: zarząd, reputacja trenera, przedłużenia AI (od stycznia), przypomnienie o kontraktach
    if (date.endsWith('-01') && date > SEASON_START && game.clubId) {
      const r = boardMonth(game, date);
      const fin = game.finance.clubs[game.clubId];
      messages.push(msg(date, { key: `zarzad:${date}`, priority: r.review.delta <= -5 ? 'important' : 'info', subject: `Ocena zarządu: ${trustLabel(game.board.trust).toLowerCase()}`, body: `${r.review.notes.join(' ')}\n\nZaufanie zarządu: ${game.board.trust} na 100. Saldo klubu: ${fmtZl(fin?.balance ?? 0)}.` }));
      if (r.fired) {
        // Zwolnienie: trener bez klubu (rynek pracy, src/career/jobMarket.js), ostatni klub prowadzi AI
        messages.push(...coachFired(game, date));
      } else {
        const offers = unsolicitedOffers(game, date, 'month');
        if (offers.length) messages.push(jobOfferMessage(game, date, offers, { key: `praca:${date}`, source: 'w trakcie sezonu', subject: 'Propozycja pracy', body: `Zapytania o twoje usługi: ${offers.map((o) => `${o.name} (${o.league})`).join(', ')}. Przyjęcie oznacza odejście z obecnego klubu od razu.` }));
      }
      if (date >= `${SEASON_YEAR + 1}-01-01` && date <= `${SEASON_YEAR + 1}-06-01`) aiRenewals(game, date);
      if (date === `${SEASON_YEAR + 1}-01-01` && !isUnemployed(game)) {
        const exp = squadOf(game.world, game.clubId).filter((p) => p.contract?.until === SEASON_END && !p.loan);
        if (exp.length) messages.push(createMessage({ date, key: `kontrakty:${SEASON_YEAR + 1}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'important', subject: `Kontrakty kończące się w czerwcu (${exp.length})`, body: `${exp.map((p) => `${p.name} (${p.pos}, ${p.age} lat)`).join(', ')}.\n\nPrzedłuż ważnych zawodników w zakładce Transfery, Kontrakty. Od 1 stycznia mogą rozmawiać z innymi klubami i podpisać umowę od 1 lipca (prekontrakt). Kluby muszą nas o tym informować.` }));
      }
    }
    if (w && date === w.to) messages.push(createMessage({ date, key: `okno-koniec:${date}`, category: 'transfers', from: 'Rynek transferowy', priority: 'info', subject: 'Dziś zamyka się okno transferowe', body: 'Po dzisiejszym dniu transfery będą możliwe dopiero w kolejnym oknie. Wolnych zawodników można podpisywać zawsze.' }));
    return { messages };
  },
});

export { inWindow };
function addDaysIso(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
