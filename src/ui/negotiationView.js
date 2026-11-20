// Ekran „Rozmowy kontraktowe”: podpisanie zawodnika (transfer albo wolny zawodnik) i przedłużenie kontraktu.
// Silnik negocjacji jest w src/career/negotiation.js (spec: docs/negocjacje.md, rozdz. 13 opisuje ten ekran).
//
// startNegotiation(game, opts) otwiera rozmowy i zwraca obiekt `ng` (tylko w pamięci, nie trafia do zapisu gry).
// renderNegotiation(game, ng) zwraca HTML ekranu.
// handleNegotiationAction(game, ng, act, dataset, form) obsługuje kliknięcia (data-act z prefiksem „ng-”)
// i zwraca { ng, done, save }. Po zakończeniu rozmów skutki trafiają do zawodnika przez applyOutcome.
// Przy podpisaniu zawodnik NIE zmienia klubu: przenosi go moduł transferów na podstawie done.contract.

import {
  openNegotiation, applyOutcome, normalizeOffer, marketWage, seasonEndOf,
  ROLES, ROLE_LABELS, MAX_YEARS, formatZl, yearsLabel,
} from '../career/negotiation.js';
import { anyClub } from '../season/season.js';
import { DOMESTIC } from '../config/calendar2026.js';
import { POS_NAMES } from '../data/attributes.js';
import { Rng, clamp } from '../core/rng.js';
import { contractIssues, recordVeto, appealStatus, appealVeto, boardCaps } from '../career/boardRequests.js';
import { esc, fmtDate } from './dom.js';
import { scoutHidden } from '../career/scoutOps.js'; // kandydat skauta: bez OVR (ocenę zna skaut)

export const isNegotiationAction = (act) => typeof act === 'string' && act.startsWith('ng-');

const MIN_MATCHES_FOR_SHARE = 3; // przed 3. meczem klubu udział w minutach jest za mało wiarygodny
const roundTo = (x, step) => Math.round(x / step) * step;
const floorTo = (x, step) => Math.floor(x / step) * step;
/** 1 rok, 22 lata, 25 lat. */
export function ageLabel(n) {
  if (n == null) return '? lat';
  if (n === 1) return '1 rok';
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && !(t >= 12 && t <= 14) ? `${n} lata` : `${n} lat`;
}

const MOOD_TONE = { zadowolony: 'ok', spokojny: 'ok', zniecierpliwiony: 'mid', zirytowany: 'bad', obrażony: 'bad' };
const PATIENCE_TONE = { Cierpliwy: 'ok', 'Cierpliwość się kończy': 'mid', 'Cierpliwość na wyczerpaniu': 'bad' };
const BREAK_REASONS = {
  ultimatum: 'Odrzucone ultimatum',
  mood: 'Zawodnik stracił cierpliwość',
  insult: 'Zawodnik poczuł się obrażony',
  patience: 'Koniec cierpliwości',
  walkaway: 'Klub zakończył rozmowy',
  ai: 'Brak porozumienia',
};
const DEMAND_LABELS = {
  role: 'rola w zespole', years: 'długość kontraktu', clause: 'klauzula odstępnego',
  agentFee: 'prowizja agenta', relegationCut: 'obniżka po spadku', signOn: 'premia za podpis',
};

// ------------------------------------------------------------ Kontekst z gry
function resolveClub(c) {
  if (!c) return null;
  if (typeof c === 'string') return anyClub(c);
  const base = c.id ? anyClub(c.id) : null;
  return base ? { ...base, ...c } : c;
}

/** Liczba rozegranych meczów klubu w terminarzu gry. */
export function clubMatchesPlayed(game, clubId) {
  return (game.fixtures || []).filter((f) => f.played && (f.home === clubId || f.away === clubId)).length;
}

/** Udział zawodnika w minutach klubu w tym sezonie (0-1); 0,5 na początku sezonu albo bez klubu. */
export function minutesShareOf(game, player, clubId) {
  const n = clubId ? clubMatchesPlayed(game, clubId) : 0;
  if (n < MIN_MATCHES_FOR_SHARE) return 0.5;
  return clamp((player.season?.min ?? 0) / (n * 90), 0, 1);
}

/** Czy klub gra w tym sezonie w pucharach UEFA (ma mecz z comp 'uefa' w terminarzu). */
export function clubInEurope(game, clubId) {
  return !!clubId && (game.fixtures || []).some((f) => f.comp === 'uefa' && (f.home === clubId || f.away === clubId));
}

/** Koniec okna transferowego, w którym jest data; poza oknem koniec sezonu. */
export function windowEndFor(dateIso) {
  const w = (DOMESTIC.transferWindows || []).find((x) => dateIso >= x.from && dateIso <= x.to);
  return w ? w.to : seasonEndOf(dateIso);
}

/** Kontekst rozmów dla openNegotiation z danych gry (czysta funkcja). */
export function negotiationContext(game, { kind, player, club, fromClub, rival = null, relegationRisk } = {}) {
  const ownClubId = kind === 'renew' ? club.id : (fromClub?.id ?? null);
  const ss = player.season || {};
  const ctx = {
    minutesShare: minutesShareOf(game, player, ownClubId),
    avgRating: ss.apps > 0 && ss.rating > 0 ? ss.rating : undefined,
    seasonEnd: seasonEndOf(game.date),
    windowEnd: windowEndFor(game.date),
    inEurope: clubInEurope(game, club.id),
    toEurope: clubInEurope(game, club.id),
    fromEurope: clubInEurope(game, fromClub?.id),
  };
  if (rival) ctx.rival = rival;
  if (relegationRisk != null) ctx.relegationRisk = relegationRisk;
  return ctx;
}

// ------------------------------------------------------------ Oferta (szkic w formularzu)
function emptyLimits(limits = {}) {
  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : Infinity);
  return { maxWage: num(limits.maxWage), maxSignOn: num(limits.maxSignOn), board: limits.board ?? null };
}

function defaultDraft(player, view, limits, hasAgent, club) {
  const age = player.age ?? 25;
  let wage = player.contract?.wage || player.wage || marketWage(player.ovr ?? 10, club.tier ?? 1);
  if (wage > limits.maxWage) wage = floorTo(limits.maxWage, 100);
  if (limits.board && wage > limits.board.wage) wage = floorTo(limits.board.wage, 100); // próg zarządu (weto)
  wage = roundTo(wage, 100);
  return normalizeOffer({
    wage,
    years: Math.min(age <= 23 ? 4 : age <= 29 ? 3 : age <= 32 ? 2 : 1, limits.board?.years ?? MAX_YEARS),
    role: view.expectedRole,
    agentFee: hasAgent ? roundTo(0.07 * wage * 52, 1000) : 0, // rynkowy standard prowizji
  });
}

const cloneOffer = (o) => normalizeOffer(JSON.parse(JSON.stringify(o)));

/** Łączy wartości z formularza (readNegotiationForm) ze szkicem oferty. Brakujące pola zostają bez zmian. */
export function mergeDraft(draft, form) {
  const d = cloneOffer(draft);
  if (!form) return d;
  const n = (v) => {
    if (v === '' || v == null) return null;
    const x = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(x) ? x : null;
  };
  const set = (key, v) => { const x = n(v); if (x != null) d[key] = x; };
  set('wage', form.wage);
  set('years', form.years);
  set('signOn', form.signOn);
  set('agentFee', form.agentFee);
  const g = n(form.bonusGoal);
  if (g != null) d.bonus.goal = g;
  const a = n(form.bonusApp);
  if (a != null) d.bonus.app = a;
  if (form.role && ROLES.includes(form.role)) d.role = form.role;
  if ('clause' in form) {
    const c = n(form.clause);
    d.clause = c && c > 0 ? { amount: c, foreignOnly: !!form.clauseForeign } : null;
  }
  return normalizeOffer(d);
}

/** Problemy szkicu oferty względem limitów klubu (lista tekstów; pusta = ofertę można wysłać). */
export function offerIssues(ng, draft = ng.draft) {
  const out = [];
  const L = ng.limits;
  if (draft.wage <= 0) out.push('Podaj pensję tygodniową.');
  if (draft.wage > L.maxWage) out.push(`Pensja przekracza limit klubu (${formatZl(L.maxWage)} tygodniowo).`);
  if (draft.signOn > L.maxSignOn) out.push(`Premia za podpis przekracza limit klubu (${formatZl(L.maxSignOn)}).`);
  return out;
}

/** Naruszenia progów zarządu (weto): ofertę można wysłać, ale zarząd jej nie zatwierdzi. Lista { code, text }. */
export function boardIssues(ng, draft = ng.draft) {
  return ng.limits?.board ? contractIssues(ng.limits.board, draft) : [];
}

/** Opis progów zarządu w formularzu. */
function boardLine(B) {
  if (!B) return '';
  const parts = [`pensja do ${formatZl(B.wage)} tygodniowo`, `kontrakt najwyżej na ${yearsLabel(B.years)}`, `łączny koszt do ${formatZl(B.total)}`];
  return B.override ? `Zarząd po odwołaniu zgodził się na te warunki (do ${fmtDate(B.override.until)}).` : `Zarząd zatwierdzi: ${parts.join(', ')}.`;
}

/** Oferta słowami (kwestia gracza w rozmowie i podsumowanie kontroferty). */
export function offerSummary(o) {
  const parts = [`${formatZl(o.wage)} tygodniowo`, yearsLabel(o.years), `rola: ${ROLE_LABELS[o.role]}`];
  if (o.signOn) parts.push(`premia za podpis ${formatZl(o.signOn)}`);
  if (o.bonus?.goal) parts.push(`premia za gola ${formatZl(o.bonus.goal)}`);
  if (o.bonus?.assist) parts.push(`premia za asystę ${formatZl(o.bonus.assist)}`);
  if (o.bonus?.cleanSheet) parts.push(`premia za czyste konto ${formatZl(o.bonus.cleanSheet)}`);
  if (o.bonus?.app) parts.push(`premia za występ ${formatZl(o.bonus.app)}`);
  if (o.raise) parts.push(`coroczna podwyżka ${Math.round(o.raise * 100)} %`);
  if (o.relegationCut) parts.push(`obniżka po spadku ${Math.round(o.relegationCut * 100)} %`);
  if (o.clause) parts.push(`klauzula odstępnego ${formatZl(o.clause.amount)}${o.clause.foreignOnly ? ' (tylko kluby zagraniczne)' : ''}`);
  if (o.agentFee) parts.push(`prowizja agenta ${formatZl(o.agentFee)}`);
  return parts.join(', ');
}

// ------------------------------------------------------------ Start rozmów
/**
 * Otwiera rozmowy z danych gry.
 * opts: { kind: 'sign'|'renew', playerId, fromClub = null (id albo obiekt klubu; null = wolny zawodnik),
 *         limits = { maxWage, maxSignOn }, fee = 0 (kwota transferu, tylko do wyświetlenia),
 *         rival = null ({ club, wage }, prawdziwa oferta konkurencji), relegationRisk }
 * Zwraca { ok: true, ng } albo { ok: false, reason, text, speaker?, until?, save }.
 * save: true, gdy odmowa zmieniła zawodnika (odmowa przedłużenia zapisuje renewRefused).
 */
export function startNegotiation(game, opts = {}) {
  const { kind = 'sign', playerId, limits = {}, fee = 0, rival = null, relegationRisk, pre = false, stayBonus = 0 } = opts;
  const player = game.world?.players?.[playerId];
  if (!player) return { ok: false, reason: 'noPlayer', text: 'Nie ma takiego zawodnika.', save: false };
  const club = resolveClub(game.clubId);
  if (!club) return { ok: false, reason: 'noClub', text: 'Nie znaleziono klubu.', save: false };
  const own = (game.world.clubs?.[game.clubId]?.squad ?? []).includes(playerId) || player.clubId === game.clubId;
  if (kind === 'renew' && !own) return { ok: false, reason: 'notOwn', text: 'Przedłużyć można tylko kontrakt zawodnika z własnej kadry.', save: false };
  if (kind === 'renew' && player.loan && player.loan.from !== game.clubId) return { ok: false, reason: 'loanee', text: 'Zawodnik jest u nas na wypożyczeniu: jego kontrakt należy do klubu macierzystego. Możesz go wykupić (opcja wykupu albo oferta transferowa).', save: false };
  if (kind === 'sign' && own) return { ok: false, reason: 'ownPlayer', text: 'Ten zawodnik już gra w Twoim klubie. Wybierz przedłużenie kontraktu.', save: false };

  const fromClub = kind === 'sign' ? resolveClub(opts.fromClub ?? null) : null;
  const ctx = negotiationContext(game, { kind, player, club, fromClub, rival, relegationRisk });
  if (stayBonus) { ctx.stayBonus = stayBonus; ctx.forceRenew = true; } // podwyżka przy prośbie o transfer (career/moveWish.js)
  const rng = new Rng(`${game.seed}:ng:${playerId}:${game.date}`);
  const r = openNegotiation({ kind, player, club, fromClub, date: game.date, rng, mode: 'player', ctx });
  if (!r.ok) {
    let save = false;
    if (r.outcome) { applyOutcome(player, r.outcome); save = true; }
    return { ok: false, reason: r.reason, text: r.text, speaker: r.speaker, until: r.until ?? null, save };
  }
  const s = r.session;
  const view = s.view();
  const L = emptyLimits(limits);
  const hasAgent = s.d.agentType !== 'brak';
  const ng = {
    kind, playerId, fromClub: fromClub?.id ?? null, fromClubName: fromClub?.name ?? null, fee: pre ? 0 : Math.max(0, fee || 0), pre: !!pre,
    clubId: club.id, clubName: club.name, date: game.date,
    session: s, limits: L, hasAgent,
    draft: defaultDraft(player, view, L, hasAgent, club),
    log: [],
    counter: null, counterType: null, demand: null,
    error: null, notice: null, done: null, veto: null,
  };
  pushLine(ng, r.opening);
  return { ok: true, ng };
}

function pushLine(ng, line) {
  if (!line?.text) return;
  const who = line.speaker === ng.session.d.name ? 'player' : 'agent';
  ng.log.push({ who, speaker: line.speaker, text: line.text });
}

const pushMe = (ng, text) => ng.log.push({ who: 'me', speaker: ng.clubName, text });

// ------------------------------------------------------------ Akcje
/**
 * Obsługa kliknięć z prefiksem „ng-”. form: wynik readNegotiationForm(root) (albo null).
 * Zwraca { ng, done, save }: ng === null oznacza wyjście z ekranu; done (tylko w akcji, która zakończyła
 * rozmowy) = { accepted, outcome, contract, kind, playerId, fromClub, fee }.
 */
export function handleNegotiationAction(game, ng, act, dataset = {}, form = null) {
  const stay = (save = false) => ({ ng, done: null, save });
  if (!ng) return { ng: null, done: null, save: false };
  if (act === 'ng-close') return { ng: null, done: null, save: false };
  if (ng.done) return stay();
  if (form) ng.draft = mergeDraft(ng.draft, form);
  ng.error = null;
  ng.notice = null;
  const s = ng.session;

  switch (act) {
    case 'ng-wage': {
      const delta = Number(dataset.d) || 0;
      ng.draft = normalizeOffer({ ...ng.draft, wage: Math.max(0, roundTo(ng.draft.wage + delta, 100)) });
      return stay();
    }
    case 'ng-fill':
      if (ng.counter) ng.draft = cloneOffer(ng.counter);
      return stay();
    case 'ng-take':
      if (!ng.counter) return stay();
      ng.draft = cloneOffer(ng.counter);
      return propose(game, ng, 'Przyjmuję te warunki.');
    case 'ng-propose':
      return propose(game, ng, null);
    case 'ng-appeal': {
      // Odwołanie od weta zarządu (raz na zawodnika w oknie, najwyżej dwa w sezonie)
      const r = appealVeto(game, ng.playerId, game.date);
      if (r.approved) ng.limits.board = boardCaps(game, game.clubId, game.world.players[ng.playerId], ng.kind);
      ng.veto = null;
      if (r.approved) ng.notice = r.text; else ng.error = r.text;
      return { ng, done: null, save: r.ok };
    }
    case 'ng-bluff': {
      if (!s.view().canCallBluff) return stay();
      pushMe(ng, 'Proszę pokazać tę ofertę. Nie wierzę, że istnieje.');
      const r = s.callBluff();
      if (!r.ok) return stay();
      pushLine(ng, r);
      ng.notice = r.truth
        ? 'Oferta innego klubu jest prawdziwa. Brak zaufania zepsuł atmosferę rozmów.'
        : 'Blef zdemaskowany. Żądania spadły, a ustępstwa będą szybsze.';
      return stay();
    }
    case 'ng-walk': {
      pushMe(ng, 'Dziękuję za rozmowę. Na tym kończymy.');
      if (s.round === 0) {
        // Bez żadnej oferty nic się nie wydarzyło: brak skutków w zawodniku.
        s.d.st.status = 'failed';
        ng.done = { accepted: false, outcome: null, contract: null, kind: ng.kind, playerId: ng.playerId, fromClub: ng.fromClub, fee: ng.fee };
        ng.counter = null;
        return { ng, done: ng.done, save: false };
      }
      // Zerwanie przez klub po złożonych ofertach: te same skutki co zerwanie przez zawodnika (blokada, uraza).
      // Silnik nie ma publicznej metody na odejście od stołu, więc kończymy sesję jego własnym rozliczeniem.
      s.d.st.status = 'failed';
      s._finish(false, 'walkaway');
      s.d.log.push({ round: s.round, action: 'walkAway', mood: s.mood });
      return finish(game, ng);
    }
    default:
      return stay();
  }
}

function propose(game, ng, meText) {
  const issues = offerIssues(ng);
  if (issues.length) {
    ng.error = `${issues.join(' ')} Oferty nie można wysłać.`;
    return { ng, done: null, save: false };
  }
  // Weto zarządu: oferta ponad progi nie trafia do zawodnika, zarząd pisze list (można się odwołać)
  const veto = boardIssues(ng);
  if (veto.length) {
    const v = recordVeto(game, { playerId: ng.playerId, kind: 'contract', issues: veto, offer: ng.draft, date: game.date });
    ng.error = v.text;
    ng.veto = { appeal: appealStatus(game, ng.playerId, game.date).ok };
    return { ng, done: null, save: true };
  }
  ng.veto = null;
  const s = ng.session;
  pushMe(ng, meText ? `${meText} ${offerSummary(ng.draft)}.` : `Proponuję: ${offerSummary(ng.draft)}.`);
  const res = s.propose(ng.draft);
  for (const l of res.lines || []) pushLine(ng, l);
  ng.counter = res.counter ? cloneOffer(res.counter) : null;
  ng.counterType = res.counter ? res.type : null;
  ng.demand = res.demand ?? null;
  if (s.status !== 'open') return finish(game, ng);
  return { ng, done: null, save: false };
}

function finish(game, ng) {
  const s = ng.session;
  const outcome = s.outcome();
  const player = game.world.players[ng.playerId];
  if (outcome && player) applyOutcome(player, outcome);
  ng.counter = null;
  ng.counterType = null;
  ng.demand = null;
  ng.done = {
    accepted: !!outcome?.accepted, outcome, contract: outcome?.contract ?? null,
    kind: ng.kind, playerId: ng.playerId, fromClub: ng.fromClub, fee: ng.fee, pre: !!ng.pre,
  };
  return { ng, done: ng.done, save: true };
}

// ------------------------------------------------------------ Formularz w DOM
const FIELDS = ['wage', 'years', 'role', 'signOn', 'bonusGoal', 'bonusApp', 'clause', 'agentFee'];

/** Czyta pola formularza oferty spod korzenia DOM (np. #app). Zwraca null, gdy formularza nie ma. */
export function readNegotiationForm(root) {
  const box = root?.querySelector?.('[data-ng-form]');
  if (!box) return null;
  const out = {};
  for (const k of FIELDS) {
    const el = box.querySelector(`[name="ng-${k}"]`);
    if (el) out[k] = el.value;
  }
  const cb = box.querySelector('[name="ng-clauseForeign"]');
  if (cb) out.clauseForeign = !!cb.checked;
  return out;
}

/**
 * Odświeża ostrzeżenia o limitach bez przerysowania ekranu (do wywołania w zdarzeniu 'input').
 * Nie zmienia ng.
 */
export function refreshNegotiationHints(root, ng) {
  if (!ng || ng.done) return;
  const form = readNegotiationForm(root);
  if (!form) return;
  const draft = mergeDraft(ng.draft, form);
  const issues = offerIssues(ng, draft);
  const box = root.querySelector('[data-ng-warn]');
  if (box) box.innerHTML = warnHtml(issues) + boardWarnHtml(boardIssues(ng, draft));
  const btn = root.querySelector('[data-act="ng-propose"]');
  if (btn) btn.disabled = issues.length > 0;
}

// ------------------------------------------------------------ Widok
const warnHtml = (issues) => (issues.length
  ? `<p class="notice notice--err ng-warn">${esc(issues.join(' '))} Oferty nie można wysłać.</p>`
  : '');

const boardWarnHtml = (issues) => (issues.length
  ? `<p class="notice ng-board" data-veto>Zarząd zawetuje tę ofertę: ${esc(issues.map((x) => x.text).join(' '))}</p>`
  : '');

function fact(label, value, tone = '') {
  return `<div class="ng-fact"><dt>${esc(label)}</dt><dd${tone ? ` data-tone="${tone}"` : ''}>${esc(value)}</dd></div>`;
}

function header(game, ng, player, view) {
  const pos = POS_NAMES[player.pos] ?? player.pos ?? '';
  const curClub = player.clubId ? anyClub(player.clubId)?.name : null;
  const where = ng.kind === 'renew' ? ng.clubName : (ng.fromClubName ?? curClub ?? 'wolny zawodnik');
  const c = player.contract;
  const contractLine = ng.kind === 'renew'
    ? (c ? `Obecny kontrakt: ${formatZl(c.wage)} tygodniowo do ${fmtDate(c.until)}` : 'Bez kontraktu')
    : ng.pre && c ? `Kontrakt w obecnym klubie kończy się ${fmtDate(c.until)}. Nowa umowa od ${fmtDate(`${c.until.slice(0, 4)}-07-01`)}, bez kwoty odstępnego.`
      : ng.fromClub && c ? `Kontrakt w obecnym klubie: ${formatZl(c.wage)} tygodniowo do ${fmtDate(c.until)}` : 'Wolny zawodnik: bez kwoty odstępnego';
  const title = ng.kind === 'renew' ? 'Przedłużenie kontraktu' : ng.pre ? 'Umowa od 1 lipca (prekontrakt)' : 'Rozmowy o transferze';
  return `
  <header class="panel ng-head">
    <div class="ng-who">
      <p class="ng-kicker">${esc(title)}</p>
      <h2>${esc(player.name)}</h2>
      <p class="muted">${esc(`${ageLabel(player.age)}, ${pos}, ${scoutHidden(game, player) ? 'ocenę zna skaut' : `OVR ${Math.round(player.ovr ?? 0)}`}, ${where}`)}</p>
      <p class="ng-contract">${esc(contractLine)}</p>
      ${ng.kind === 'sign' && ng.fee > 0 ? `<p class="ng-contract">Kwota transferu: <b>${esc(formatZl(ng.fee))}</b></p>` : ''}
    </div>
    <dl class="ng-facts">
      ${fact(ng.hasAgent ? 'Agent' : 'Rozmowa', view.agent)}
      ${fact('Nastawienie', view.mindset)}
      ${fact('Nastrój', view.mood, MOOD_TONE[view.mood])}
      ${fact('Cierpliwość', view.patience, PATIENCE_TONE[view.patience])}
      ${fact('Oczekiwana rola', ROLE_LABELS[view.expectedRole] ?? view.expectedRole)}
      ${fact('Żądanie rynkowe', `ok. ${view.marketDemand} tygodniowo`)}
      ${fact('Runda', String(view.round))}
    </dl>
  </header>`;
}

function chat(ng) {
  const items = ng.log.map((m) => `<li class="ng-msg ng-msg--${m.who === 'me' ? 'me' : 'them'}" data-who="${esc(m.who)}">
      <span class="ng-msg__who">${esc(m.who === 'me' ? 'Ty' : m.speaker)}</span>
      <p>${esc(m.text)}</p></li>`).join('');
  return `<section class="panel ng-chat" aria-label="Przebieg rozmowy">
    <h3>Rozmowa</h3>
    <ol class="ng-log" role="log">${items}</ol>
    ${counterCard(ng)}
  </section>`;
}

function counterCard(ng) {
  if (!ng.counter || ng.done) return '';
  const c = ng.counter;
  const over = offerIssues(ng, c);
  const veto = boardIssues(ng, c);
  const title = ng.counterType === 'ultimatum' ? 'Ultimatum' : ng.counterType === 'demand' ? 'Żądanie' : 'Kontroferta';
  const dem = ng.demand ? `<p class="muted">Chodzi o: ${esc(DEMAND_LABELS[ng.demand.element] ?? ng.demand.element)}.</p>` : '';
  return `<div class="ng-counter" data-type="${esc(ng.counterType ?? '')}">
    <h4>${esc(title)}</h4>${dem}
    <p>${esc(offerSummary(c))}</p>
    ${over.length ? `<p class="notice notice--err">${esc(over.join(' '))} Tych warunków nie można przyjąć.</p>` : ''}
    ${!over.length && veto.length ? `<p class="notice ng-board">Zarząd nie zatwierdzi tych warunków: ${esc(veto.map((x) => x.text).join(' '))}</p>` : ''}
    <div class="ng-actions">
      <button class="btn btn--primary" data-act="ng-take" ${over.length ? 'disabled' : ''}>Przyjmij te warunki</button>
      <button class="btn btn--quiet" data-act="ng-fill">Wpisz do formularza</button>
    </div>
  </div>`;
}

function numField(name, label, value, { step = 100, hint = '' } = {}) {
  const id = `ng-f-${name}`;
  return `<div class="ng-field">
    <label for="${id}">${esc(label)}</label>
    <input id="${id}" name="ng-${name}" type="number" inputmode="numeric" min="0" step="${step}" value="${esc(value)}">
    ${hint ? `<small class="muted">${esc(hint)}</small>` : ''}
  </div>`;
}

function offerForm(ng, view) {
  const d = ng.draft;
  const L = ng.limits;
  const issues = offerIssues(ng);
  const years = Array.from({ length: MAX_YEARS }, (_, i) => i + 1)
    .map((y) => `<option value="${y}" ${d.years === y ? 'selected' : ''}>${esc(yearsLabel(y))}</option>`).join('');
  const roles = ROLES.map((r) => `<option value="${r}" ${d.role === r ? 'selected' : ''}>${esc(ROLE_LABELS[r])}${r === view.expectedRole ? ' (oczekuje)' : ''}</option>`).join('');
  const lim = [
    `pensja do ${Number.isFinite(L.maxWage) ? `${formatZl(L.maxWage)} tygodniowo` : 'bez limitu'}`,
    `premia za podpis do ${Number.isFinite(L.maxSignOn) ? formatZl(L.maxSignOn) : 'bez limitu'}`,
  ].join(', ');
  const steps = [-1000, -100, 100, 1000].map((x) => `<button class="btn btn--quiet ng-step" data-act="ng-wage" data-d="${x}" aria-label="${x > 0 ? 'Podnieś' : 'Obniż'} pensję o ${formatZl(Math.abs(x))}">${x > 0 ? '+' : '-'}${Math.abs(x) >= 1000 ? `${Math.abs(x) / 1000} tys.` : Math.abs(x)}</button>`).join('');
  return `<section class="panel ng-offer" aria-label="Twoja oferta">
    <h3>Twoja oferta</h3>
    <p class="ng-limits">Limit klubu: ${esc(lim)}.</p>
    ${L.board ? `<p class="ng-limits ng-limits--board">${esc(boardLine(L.board))}</p>` : ''}
    <div class="ng-form" data-ng-form role="group" aria-label="Warunki oferty">
      <div class="ng-field ng-field--wage">
        <label for="ng-f-wage">Pensja tygodniowa (zł)</label>
        <input id="ng-f-wage" name="ng-wage" type="number" inputmode="numeric" min="0" step="100" value="${esc(d.wage)}">
        <div class="ng-steps">${steps}</div>
      </div>
      <div class="ng-field">
        <label for="ng-f-years">Długość kontraktu</label>
        <select id="ng-f-years" name="ng-years">${years}</select>
      </div>
      <div class="ng-field">
        <label for="ng-f-role">Obiecana rola</label>
        <select id="ng-f-role" name="ng-role">${roles}</select>
      </div>
      ${numField('signOn', 'Premia za podpis (zł)', d.signOn, { step: 1000 })}
      ${numField('bonusGoal', 'Premia za gola (zł)', d.bonus.goal)}
      ${numField('bonusApp', 'Premia za występ (zł)', d.bonus.app, { step: 50 })}
      <div class="ng-field">
        <label for="ng-f-clause">Klauzula odstępnego (zł, opcjonalnie)</label>
        <input id="ng-f-clause" name="ng-clause" type="number" inputmode="numeric" min="0" step="10000" value="${d.clause ? esc(d.clause.amount) : ''}" placeholder="brak">
        <label class="ng-check"><input type="checkbox" name="ng-clauseForeign" ${d.clause?.foreignOnly ? 'checked' : ''}> Tylko dla klubów zagranicznych</label>
      </div>
      ${ng.hasAgent ? numField('agentFee', 'Prowizja agenta (zł)', d.agentFee, { step: 1000 }) : ''}
    </div>
    <div data-ng-warn aria-live="polite">${warnHtml(issues)}${boardWarnHtml(boardIssues(ng))}</div>
    <div class="ng-actions">
      <button class="btn btn--primary" data-act="ng-propose" ${issues.length ? 'disabled' : ''}>Złóż ofertę</button>
      ${ng.veto?.appeal ? '<button class="btn btn--quiet" data-act="ng-appeal">Odwołaj się od weta zarządu</button>' : ''}
      ${view.canCallBluff ? '<button class="btn btn--quiet" data-act="ng-bluff">Sprawdź blef</button>' : ''}
      <button class="btn btn--quiet" data-act="ng-walk">Zakończ rozmowy</button>
    </div>
  </section>`;
}

function contractRows(c, ng) {
  const rows = [
    ['Pensja', `${formatZl(c.wage)} tygodniowo`],
    ['Kontrakt do', fmtDate(c.until)],
    ['Obiecana rola', ROLE_LABELS[c.promise?.role] ?? ''],
  ];
  if (c.signOn) rows.push(['Premia za podpis', formatZl(c.signOn)]);
  if (c.bonus?.goal) rows.push(['Premia za gola', formatZl(c.bonus.goal)]);
  if (c.bonus?.app) rows.push(['Premia za występ', formatZl(c.bonus.app)]);
  if (c.clause) rows.push(['Klauzula odstępnego', `${formatZl(c.clause)}${c.clauseForeignOnly ? ' (tylko kluby zagraniczne)' : ''}`]);
  if (c.agentFee) rows.push(['Prowizja agenta', formatZl(c.agentFee)]);
  if (ng.kind === 'sign' && ng.fee > 0) rows.push(['Kwota transferu', formatZl(ng.fee)]);
  return `<dl class="ng-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function outcomePanel(ng) {
  const { outcome, accepted, contract } = ng.done;
  if (accepted && contract) {
    const note = ng.kind === 'renew'
      ? 'Nowy kontrakt obowiązuje od dziś. Zawodnik pamięta obietnicę roli.'
      : ng.pre ? 'Zawodnik zgodził się na warunki. Umowa zacznie obowiązywać 1 lipca, do tego czasu gra w swoim klubie.'
        : 'Zawodnik zgodził się na warunki. Transfer domyka klub.';
    return `<section class="panel ng-result" data-result="ok" aria-label="Wynik rozmów">
      <h3>Porozumienie</h3>
      <p>${esc(note)}</p>
      ${contractRows(contract, ng)}
      <div class="ng-actions"><button class="btn btn--primary" data-act="ng-close">Podpisz kontrakt</button></div>
    </section>`;
  }
  const lines = [];
  if (!outcome) lines.push('Rozmowy zakończone przed złożeniem oferty. Zawodnik nie ma pretensji.');
  else {
    lines.push(`${BREAK_REASONS[outcome.reason] ?? 'Brak porozumienia'}.`);
    if (outcome.lock) lines.push(`Zawodnik nie chce rozmawiać z klubem do ${fmtDate(outcome.lock.until)}.`);
    if (outcome.moraleDelta < 0) lines.push(`Morale zawodnika spadło (${outcome.moraleDelta}).`);
    if (outcome.transferRequest) lines.push('Zawodnik poprosił o wystawienie na listę transferową.');
    else if (outcome.renewRefused) lines.push('Zawodnik nie przedłuży kontraktu.');
  }
  return `<section class="panel ng-result" data-result="fail" aria-label="Wynik rozmów">
    <h3>Rozmowy zakończone</h3>
    ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    <div class="ng-actions"><button class="btn btn--primary" data-act="ng-close">Wróć</button></div>
  </section>`;
}

/** HTML ekranu rozmów. */
export function renderNegotiation(game, ng) {
  if (!ng) return '';
  const player = game.world.players[ng.playerId];
  const view = ng.session.view();
  const notices = [];
  if (view.ultimatum && !ng.done) notices.push('<p class="notice notice--err">Ostatnia szansa: zawodnik postawił ultimatum. Oferta słabsza od jego warunków zerwie rozmowy.</p>');
  if (ng.error) notices.push(`<p class="notice notice--err" role="alert">${esc(ng.error)}</p>`);
  if (ng.notice) notices.push(`<p class="notice">${esc(ng.notice)}</p>`);
  return `<div class="ng">
    ${header(game, ng, player, view)}
    ${notices.join('')}
    <div class="ng-body">
      ${chat(ng)}
      ${ng.done ? outcomePanel(ng) : offerForm(ng, view)}
    </div>
  </div>`;
}
