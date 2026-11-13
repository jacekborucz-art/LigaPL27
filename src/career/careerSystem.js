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
import { createFinance, financeDay, book, matchIncome, attendanceFill, uefaPrize, PP_PRIZE, stadiumCapacity, meritTv, clubPlan, FIN } from './finance.js';
import { createMarket, marketWeek, answerIncoming, aiRenewals, inWindow, windowOf, fmtZl, SEASON_END } from './transfers.js';
import { ensureBoard, boardMonth, seasonGoalFor, trustLabel } from './board.js';
import './squadLimitSystem.js'; // limit kadry i nacisk zarządu (docs/limit-kadry.md)
import './boardRequests.js'; // prośby do zarządu, warunki i budżety klubów AI (docs/finanse.md)
import { ensureCoachMarket, fireCoach, hireCoach } from './coachMarket.js'; // rynek trenerów AI i właściciele (docs/trenerzy-i-wlasciciele.md)

const TIER_COMP = { 1: 'ekstraklasa', 2: 'liga1', 3: 'liga2' };

export function ensureCareer(game) {
  if (!game.world) return;
  if (!game.finance) game.finance = createFinance(game.world);
  // Zapis sprzed kalibracji finansów (docs/finanse.md): plan sezonu z danych klubu
  for (const [id, c] of Object.entries(game.finance.clubs)) if (!c.plan && clubById(id)) { c.plan = clubPlan(clubById(id)); c.tier = c.plan.tier; }
  if (!game.market) createMarket(game);
  ensureBoard(game);
  ensureCoaches(game); // trenerzy klubów AI z atrybutami (stary zapis: profile z ziarna gry, te same nazwiska)
  ensureCoachMarket(game); // pula wolnych trenerów (stary zapis: tworzona z ziarna gry)
}

// ------------------------------------------------------------ Mecze: bilety i nagrody
function matchMoney(game, date) {
  const F = game.finance;
  const tables = new Map();
  const rowOf = (clubId) => {
    const club = clubById(clubId); if (!club) return null;
    const comp = TIER_COMP[club.tier];
    if (!tables.has(comp)) tables.set(comp, standings(game.fixtures.filter((f) => f.comp === comp), CLUBS_PL.filter((c) => c.tier === club.tier).map((c) => c.id)));
    return tables.get(comp).find((r) => r.id === clubId);
  };
  for (const f of game.fixtures) {
    if (!f.played || f.fin || !(F.clubs[f.home] || F.clubs[f.away])) continue;
    f.fin = true;
    // Kibice: nastroje, bojkoty, zamknięte sektory i mecze bez publiczności (src/career/fans.js)
    const fill = attendanceFill(f, rowOf(f.home), anyClub(f.away), f.neutral ? null : F.clubs[f.home]) * attendanceModifier(game, f.home, f);
    f.attendance = Math.round((f.neutral ? 58000 : stadiumCapacity(clubById(f.home) ?? anyClub(f.home))) * fill / 100) * 100;
    const [h0, a0] = matchIncome(F, f, fill);
    const mul = f.comp === 'friendly' ? 0.12 : 1; // sparing: bilety symboliczne
    const h = h0 * mul; const a = a0 * mul;
    book(F, f.home, f.date, 'in', 'tickets', h);
    if (a) book(F, f.away, f.date, 'in', 'tickets', a);
    if (f.comp === 'pp') {
      const w = winnerOf(f);
      book(F, w, f.date, 'in', 'prize', f.round === 'F' ? PP_PRIZE.W : PP_PRIZE[f.round] ?? 20000, `Puchar Polski: ${f.round === 'F' ? 'zwycięstwo' : 'awans'}`);
    }
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
    }
  }
  // Premia za miejsce z centralnego podziału ligi po ostatniej kolejce (Ekstraklasa SA 2025/26: mistrz 22,6 mln zł,
  // dalej coraz mniej; spadkowicze z Ekstraklasy dostają rekompensatę). 1 i 2 Liga [SZAC]. Model: docs/finanse.md.
  for (const comp of Object.values(TIER_COMP)) {
    F.merit = F.merit ?? {};
    if (F.merit[comp]) continue;
    const lf = game.fixtures.filter((f) => f.comp === comp);
    if (!lf.length || !lf.every((f) => f.played)) continue;
    F.merit[comp] = date;
    const tier = Number(Object.keys(TIER_COMP).find((k) => TIER_COMP[k] === comp));
    for (const r of standings(lf, CLUBS_PL.filter((c) => c.tier === tier).map((c) => c.id))) {
      const c = F.clubs[r.id]; if (!c) continue;
      book(F, r.id, date, 'in', 'tv', meritTv(tier, r.pos), `Podział środków ligi: premia za ${r.pos}. miejsce`);
      if (tier === 1 && r.pos >= 16) book(F, r.id, date, 'in', 'tv', FIN.RELEGATION_COMP, 'Rekompensata za spadek z Ekstraklasy');
    }
  }
}

// ------------------------------------------------------------ Wiadomości
const msg = (date, o) => createMessage({ date, category: 'board', from: 'Zarząd', priority: 'info', ...o });

function offerMessage(game, o, date) {
  const p = game.world.players[o.playerId]; const buyer = clubById(o.from);
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
  if (r.reopen && o) out.push(offerMessage(game, o, game.date));
  return out;
});

/** Zmiana klubu (nowa praca). */
export function switchClub(game, clubId, date) {
  const old = game.clubId;
  // Trener AI nowego klubu odchodzi do puli wolnych trenerów (career/coachMarket.js)
  if (game.coaches?.[clubId] && game.world?.clubs?.[clubId]) { fireCoach(game, clubId, date, { why: 'wyniki', quiet: true, direct: true }); delete game.coaches[clubId]; }
  game.manager.history = [...(game.manager.history ?? []).map((h) => (h.club === old && !h.to ? { ...h, to: date } : h)), { club: clubId, from: date }];
  game.clubId = clubId;
  // Poprzedni klub gracza zatrudnia trenera z rynku
  if (old && old !== clubId && game.world?.clubs?.[old]) hireCoach(game, old, date, { quiet: true });
  game.tactics = createTactics(squadOf(game.world, clubId), { benchSize: 12 });
  delete game.tacticsSubs; delete game.tacticsLast; // zastępstwa asystenta (match/matchday.js) dotyczyły starej kadry
  game.board = { trust: 55, fansMood: 55, reviews: [], goal: seasonGoalFor(clubById(clubId)), goalClub: clubId };
  game.market.userListed = {};
  if (game.squadLimit) game.squadLimit.case = null; // sprawa limitu kadry dotyczyła poprzedniego klubu
  game.market.offers = game.market.offers.filter((o) => o.kind !== 'incoming');
  if (game.summary) game.summary.clubId = clubId;
}

registerDecision('jobOffer', (game, m, action) => {
  if (action === 'stay') return [];
  const club = clubById(action);
  if (!club) return [];
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
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const w = windowOf(date);
    // Okno transferowe: otwarcie, tygodniowy rynek, oferty
    if (w && (date === w.from || dow === 1)) {
      const { moves, offers } = marketWeek(game, date);
      for (const o of offers) messages.push(offerMessage(game, o, date));
      const mineMoves = moves.filter((x) => x.from === game.clubId);
      if (moves.length) messages.push(createMessage({ date, key: `rynek:${date}`, category: 'transfers', from: 'Rynek transferowy', priority: 'info', subject: `Transfery tygodnia (${moves.length})`, body: moves.slice(0, 12).map((x) => `${x.name} (${x.pos}): ${anyClub(x.from)?.name ?? 'wolny zawodnik'} -> ${anyClub(x.to).name}${x.fee ? `, ${fmtZl(x.fee)}` : ''}`).join('\n') + (mineMoves.length ? '' : '') }));
    }
    // Wygasłe oferty
    for (const o of game.market.offers) if (o.status === 'open' && o.expires < date) o.status = 'expired';
    // Nieaktualne oferty w poczcie oznaczamy jako rozstrzygnięte
    const closed = new Set(game.market.offers.filter((o) => o.status !== 'open').map((o) => o.id));
    if (closed.size) game.inbox = game.inbox.map((m) => (m.refs?.offerId && closed.has(m.refs.offerId) && !m.resolved ? { ...m, resolved: true } : m));
    // Propozycje pracy wygasają po tygodniu
    game.inbox = game.inbox.map((m) => (m.refs?.kind === 'jobOffer' && m.optional && !m.resolved && m.date < addDaysIso(date, -7) ? { ...m, resolved: true } : m));
    // Co miesiąc: zarząd, reputacja trenera, przedłużenia AI (od stycznia), przypomnienie o kontraktach
    if (date.endsWith('-01') && date > SEASON_START) {
      const r = boardMonth(game, date);
      const fin = game.finance.clubs[game.clubId];
      messages.push(msg(date, { key: `zarzad:${date}`, priority: r.review.delta <= -5 ? 'important' : 'info', subject: `Ocena zarządu: ${trustLabel(game.board.trust).toLowerCase()}`, body: `${r.review.notes.join(' ')}\n\nZaufanie zarządu: ${game.board.trust} na 100. Saldo klubu: ${fmtZl(fin?.balance ?? 0)}.` }));
      if (r.fired) {
        messages.push(createMessage({ date, key: `zwolnienie:${date}`, category: 'board', from: 'Zarząd', priority: 'urgent', subject: `${r.club}: zarząd rozwiązuje umowę`, body: `Zarząd stracił zaufanie i zwalnia cię z funkcji trenera. Kilka klubów chce z tobą rozmawiać. Wybierz nowy klub, żeby kontynuować karierę.`, actions: r.offers.map((o) => ({ id: o.clubId, label: `${o.name} (${o.league})` })), refs: { kind: 'jobOffer' } }));
      } else if (r.offers.length) {
        messages.push(createMessage({ date, key: `praca:${date}`, category: 'board', from: 'Agent trenera', priority: 'important', subject: 'Propozycja pracy', body: `Zapytania o twoje usługi: ${r.offers.map((o) => `${o.name} (${o.league})`).join(', ')}. Przyjęcie oznacza odejście z obecnego klubu od razu.`, actions: [...r.offers.map((o) => ({ id: o.clubId, label: `Przejdź: ${o.name}` })), { id: 'stay', label: 'Zostaję' }], refs: { kind: 'jobOffer' }, optional: true }));
      }
      if (date >= `${SEASON_YEAR + 1}-01-01` && date <= `${SEASON_YEAR + 1}-06-01`) aiRenewals(game, date);
      if (date === `${SEASON_YEAR + 1}-01-01`) {
        const exp = squadOf(game.world, game.clubId).filter((p) => p.contract?.until === SEASON_END && !p.loan);
        if (exp.length) messages.push(createMessage({ date, key: `kontrakty:${SEASON_YEAR + 1}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'important', subject: `Kontrakty kończące się w czerwcu (${exp.length})`, body: `${exp.map((p) => `${p.name} (${p.pos}, ${p.age} lat)`).join(', ')}.\n\nPrzedłuż ważnych zawodników w zakładce Transfery, Kontrakty. Od 1 stycznia mogą rozmawiać z innymi klubami.` }));
      }
    }
    if (w && date === w.to) messages.push(createMessage({ date, key: `okno-koniec:${date}`, category: 'transfers', from: 'Rynek transferowy', priority: 'info', subject: 'Dziś zamyka się okno transferowe', body: 'Po dzisiejszym dniu transfery będą możliwe dopiero w kolejnym oknie. Wolnych zawodników można podpisywać zawsze.' }));
    return { messages };
  },
});

export { inWindow };
function addDaysIso(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
