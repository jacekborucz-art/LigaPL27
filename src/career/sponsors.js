// Umowy sponsorskie klubów (docs/finanse.md, rozdz. Sponsorzy). Pula sponsorów klubu to plan.sponsor z finansów
// (75 % komercji); dzieli się na umowy według miejsc na koszulce i stadionie. Umowy wygasają, odnawiają się przez
// oferty w trzech wariantach, reagują na awans, spadek, puchary i trofea. Kluby AI wybierają wariant same.
// Wpływy co miesiąc i premie sponsorów trafiają do księgi jako 'sponsor'. Wszystkie liczby tutaj to [SZAC]
// (założenia panelu ekspertów, do kalibracji).

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { registerDecision } from '../core/decisions.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { SEASON_YEAR } from '../config/calendar2026.js';
import { standings } from '../season/standings.js';
import { winnerOf } from '../season/cup.js';
import { book, stadiumCapacity } from './finance.js';
import { seasonGoalFor } from './board.js';
import { fmtZl } from './transfers.js';
import { fmtDate } from '../ui/dom.js';

import { LEAGUE_COMPS, compOfClub, compClubIds } from '../season/leagueComps.js';

// [SZAC] wszystkie
export const SP = {
  // Udział miejsca w puli sponsorów i długość umowy (lata, od-do)
  SLOTS: {
    main: { share: 0.40, years: [2, 5] },
    sleeve: { share: 0.15, years: [1, 3] },
    naming: { share: 0.10, years: [3, 10] },
    kit: { share: 0.10, years: [3, 5] },
    partners: { share: 0.25, years: [1, 1] },
  },
  NAMING_MIN_CAP: 15000, // nazwa stadionu tylko przy pojemności od 15 tys.
  NAMING_CITY: 0.5, // stadion miejski (klub miasta): połowa wartości, reszta do pakietu partnerów
  OFFER_DAYS: 14,
  VARIANTS: {
    fixed: { base: 1, years: 3, growth: 0, bonus: {}, relegation: { cut: 0.5, terminate: true } },
    bonus: { base: 0.75, years: 2, growth: 0, bonus: { title: 0.4, uefaLeague: 0.3, cup: 0.15, top3: 0.1 }, relegation: { cut: 0.4, terminate: false } },
    long: { base: 0.9, years: 5, growth: 0.03, bonus: { top3: 0.05 }, relegation: { cut: 0.3, terminate: false } },
  },
  START_BONUS: 0.25, // umowy z początku gry: kwota stała pełna (suma = plan.sponsor), więc premie tylko 1/4 zwykłych
  PROMO_RAISE: 0.5, // klauzula awansu: sponsor główny i rękaw +50 %
  TERMINATE_P: 0.35, // spadek: szansa zerwania umowy z klauzulą rozwiązania
  PARTNERS_CUT: 0.3, // spadek: pakiet partnerów traci 30 %
  TROUBLE_P: 0.03, // kłopoty sponsora: szansa na sezon dla każdej umowy (zerwanie przed czasem)
  NEW_PARTNER_P: 0.15, // nowy mały partner: szansa w miesiącu (sierpień-maj), średnio 1,5 na sezon
  NEW_PARTNER: [0.01, 0.03], // jego wartość: 1-3 % puli
  EXTRA_SHARE: [0.02, 0.04], // dodatkowy partner po awansie do pucharów albo trofeum: 2-4 % puli
  RAISE: 0.1, // albo podwyżka u sponsora głównego o 10 %
};

export const SLOT_NAMES = { main: 'Sponsor główny', sleeve: 'Rękaw i plecy', naming: 'Nazwa stadionu', kit: 'Dostawca strojów', partners: 'Pakiet partnerów', extra: 'Partner dodatkowy' };
export const VARIANT_NAMES = { fixed: 'Stała kwota', bonus: 'Z premiami', long: 'Długoterminowa' };
export const BONUS_NAMES = { title: 'mistrzostwo ligi', uefaLeague: 'faza ligowa pucharów UEFA', cup: 'Puchar Polski', top3: 'miejsce na podium' };

// Fikcyjne firmy (bez prawdziwych marek): [nazwa, branża]
const FIRMS = {
  bank: ['Bank Regionalny Północ', 'Bank Kupiecki Warta', 'Bank Inwestycyjny Horyzont', 'Bank Rodzinny Dolina', 'Bank Pomorski Kotwica'],
  ubezpieczenia: ['Towarzystwo Ubezpieczeń Tarcza', 'Ubezpieczenia Spokojna Głowa', 'Grupa Ubezpieczeniowa Opoka'],
  energetyka: ['Grupa Energetyczna Iskra', 'Zielona Moc Energia', 'Elektrownie Wschodnie', 'Ciepłownie Miejskie Żar'],
  paliwa: ['Paliwa Bałtyckie', 'Stacje Paliw Szlak', 'Rafineria Nadodrzańska'],
  telekomunikacja: ['Telekom Fala', 'Sieć Komórkowa Zasięg', 'Światłowody Puls'],
  budownictwo: ['Grupa Budowlana Fundament', 'Mosty i Drogi Granit', 'Osiedla Słoneczne Deweloper'],
  'zakłady bukmacherskie': ['Trafny Typ Zakłady', 'Złoty Strzał Bukmacher', 'Kursownik Zakłady'],
  IT: ['Kodex Systemy IT', 'Chmura Danych Nimbus', 'Programiści Północy'],
  logistyka: ['Spedycja Karawana', 'Logistyka Szeroki Tor', 'Transport Szybka Paczka'],
  handel: ['Sieć Sklepów Koszyk', 'Markety Swojskie', 'Hurtownia Spiżarnia'],
  motoryzacja: ['Salony Aut Rondo', 'Opony Przyczepność', 'Warsztaty Tłok'],
  'branża spożywcza': ['Mleczarnia Biała Łąka', 'Piekarnie Złoty Kłos', 'Wody Źródlane Kaskada'],
};
const KIT = ['Velkor Sport', 'Astrava', 'Brennix', 'Morvane Sport', 'Kordex Sport', 'Tarvo'];
const INDUSTRIES = Object.keys(FIRMS);

const r1000 = (x) => Math.round(x / 1000) * 1000;
const seasonEnd = (years) => `${SEASON_YEAR + years}-06-30`;
const rngFor = (game, ...k) => new Rng(`sponsor:${game.seed ?? 0}:${k.join(':')}`);

// ------------------------------------------------------------ Stan
/** Stan sponsorów (leniwie: stary zapis bez game.sponsors dostaje umowy przy pierwszym użyciu). */
export function ensureSponsors(game) {
  const F = game.finance;
  if (!F) return null;
  if (!game.sponsors) {
    // Puchar Polski rozstrzygnięty przed powstaniem umów (stary zapis): bez premii za ten sezon
    const done = game.fixtures?.some((f) => f.comp === 'pp' && f.round === 'F' && f.played);
    game.sponsors = { v: 1, seq: 0, clubs: {}, ...(done ? { cup: SEASON_YEAR } : {}) };
  }
  const st = game.sponsors;
  for (const id of Object.keys(F.clubs)) if (!st.clubs[id] && clubById(id)) st.clubs[id] = initClubSponsors(game, id, game.date ?? `${SEASON_YEAR}-07-01`);
  for (const id of Object.keys(st.clubs)) if (!F.clubs[id]) delete st.clubs[id];
  F.sponsorContracts = true; // financeDay nie księguje już płaskiej kwoty sponsorów
  return st;
}

/** Udziały miejsc dla klubu: nazwa stadionu tylko przy dużym stadionie, stadion miejski za połowę. */
export function slotShares(club, plan) {
  const s = Object.fromEntries(Object.entries(SP.SLOTS).map(([k, v]) => [k, v.share]));
  const cap = stadiumCapacity(club);
  const naming = cap >= SP.NAMING_MIN_CAP ? (plan?.ownerType === 'miasto' ? s.naming * SP.NAMING_CITY : s.naming) : 0;
  s.partners += s.naming - naming; s.naming = naming;
  return s;
}

function usedNames(S) { return new Set([...S.contracts, ...S.offers].map((c) => c.name)); }
function pickFirm(rng, S, slot) {
  const used = usedNames(S);
  if (slot === 'partners') return ['Pakiet partnerów lokalnych', 'różne branże'];
  if (slot === 'kit') { const n = KIT.filter((x) => !used.has(x)); return [rng.pick(n.length ? n : KIT), 'odzież sportowa']; }
  for (let i = 0; i < 6; i++) {
    const ind = rng.pick(INDUSTRIES); const n = FIRMS[ind].filter((x) => !used.has(x));
    if (n.length) return [rng.pick(n), ind];
  }
  const ind = rng.pick(INDUSTRIES); return [rng.pick(FIRMS[ind]), ind];
}

/** Wariant umowy wybierany przez klub AI (i przez zarząd, gdy trener nie wybierze): cel sezonu. */
export function aiVariant(club) {
  const t = seasonGoalFor(club).target;
  return t <= 3 ? 'bonus' : t >= 15 ? 'long' : 'fixed';
}

function draftOf(variant, value, slot, startBonus = 1) {
  const V = SP.VARIANTS[variant];
  const [y0, y1] = SP.SLOTS[slot]?.years ?? [1, 2];
  return {
    variant, annual: r1000(value * V.base), years: clamp(V.years, y0, y1), growth: V.growth,
    bonuses: Object.fromEntries(Object.entries(V.bonus).map(([k, p]) => [k, r1000(value * p * startBonus)])),
    relegation: slot === 'partners' ? { cut: SP.PARTNERS_CUT, terminate: false } : { ...V.relegation },
  };
}

function contractOf(st, slot, name, industry, d, start, end) {
  return { id: `sp${++st.seq}`, slot, name, industry, annual: d.annual, years: d.years, start, end, variant: d.variant, growth: d.growth ?? 0, bonuses: d.bonuses, relegation: d.relegation, paid: null, bonusPaid: {} };
}

function initClubSponsors(game, id, date) {
  const st = game.sponsors; const F = game.finance; const club = clubById(id);
  const plan = F.clubs[id].plan; const pool = plan?.sponsor ?? 0;
  const S = { tier: club.tier, season: SEASON_YEAR, contracts: [], offers: [], queue: [], log: [], bonus: {}, lastEvent: null, flags: {} };
  const rng = rngFor(game, id, 'start', date);
  const variant = aiVariant(club);
  const shares = slotShares(club, plan);
  const month = date.slice(0, 7);
  const paidAlready = (F.clubs[id].ledger?.[month]?.in?.sponsor ?? 0) > 0; // stary zapis: płaska kwota już w tym miesiącu
  for (const [slot, share] of Object.entries(shares)) {
    if (!share) continue;
    const [name, industry] = pickFirm(rng, S, slot);
    const v = slot === 'partners' ? 'fixed' : variant;
    // Umowa z początku gry: kwota stała równa udziałowi w puli (suma umów = plan.sponsor), premie o połowę mniejsze
    const d = { ...draftOf(v, pool * share, slot, SP.START_BONUS), annual: r1000(pool * share) };
    const left = slot === 'partners' ? 1 : rng.int(1, 3); // wygasanie rozłożone na 1-3 sezony
    d.years = Math.max(left, rng.int(...SP.SLOTS[slot].years));
    const c = contractOf(st, slot, name, industry, d, `${SEASON_YEAR + left - d.years}-07-01`, seasonEnd(left));
    if (paidAlready) c.paid = month;
    S.contracts.push(c);
  }
  // Zaokrąglenia: suma umów dokładnie jak plan.sponsor
  const diff = r1000(pool) - S.contracts.reduce((s, c) => s + c.annual, 0);
  const pk = S.contracts.find((c) => c.slot === 'partners'); if (pk) pk.annual += diff;
  return S;
}

// ------------------------------------------------------------ Atrakcyjność klubu i oferty
let tableCache = { key: null, map: new Map() };
function positionOf(game, id, club) {
  const comp = compOfClub(club);
  if (comp && game.fixtures) {
    const key = `${game.date}:${game.fixtures.length}`;
    if (tableCache.key !== key) tableCache = { key, map: new Map() };
    if (!tableCache.map.has(comp)) {
      const lf = game.fixtures.filter((f) => f.comp === comp);
      tableCache.map.set(comp, standings(lf, compClubIds(comp)));
    }
    const row = tableCache.map.get(comp).find((r) => r.id === id);
    if (row && row.played >= 5) return row.pos ?? tableCache.map.get(comp).indexOf(row) + 1;
  }
  // Początek sezonu: miejsce z poprzedniego sezonu, jeśli klub gra w tej samej lidze
  const last = game.archive?.at(-1);
  const t = club.tier === 4 ? last?.l3?.[club.group] : last?.tables?.[club.tier];
  const i = t ? t.findIndex((r) => r.id === id) : -1;
  return i >= 0 ? i + 1 : null;
}

function inUefa(game, id) {
  let any = false;
  for (const f of game.fixtures ?? []) {
    if (f.comp !== 'uefa' || (f.home !== id && f.away !== id)) continue;
    if (f.round === 'league') return 1;
    any = true;
  }
  return any || game.season?.polishEurope?.some((e) => e.club === id) ? 0.5 : 0;
}

/** Atrakcyjność klubu dla sponsorów (0,75-1,40): wynik wobec celu, puchary UEFA, trofeum, nastroje kibiców. */
export function attractiveness(game, id) {
  const club = clubById(id);
  if (!club) return 1;
  const target = id === game.clubId ? game.board?.goal?.target ?? seasonGoalFor(club).target : seasonGoalFor(club).target;
  const pos = positionOf(game, id, club);
  const last = game.archive?.at(-1);
  const trophy = last?.champion === id || last?.cup === id || game.season?.cup?.champion === id ? 1 : 0;
  const mood = id === game.clubId ? game.board?.fansMood ?? 55 : game.fans?.clubs?.[id]?.mood ?? 55;
  return clamp(1 + 0.03 * (pos ? target - pos : 0) + 0.15 * inUefa(game, id) + 0.1 * trophy + 0.003 * (mood - 55), 0.75, 1.4);
}

/** Oferta na miejsce: trzy warianty (stała kwota, z premiami, długoterminowa). */
export function makeOffer(game, id, slot, date, reason, rng) {
  const st = game.sponsors; const S = st.clubs[id]; const club = clubById(id);
  const plan = game.finance.clubs[id].plan;
  const share = slot === 'extra' ? SP.EXTRA_SHARE[0] + rng.next() * (SP.EXTRA_SHARE[1] - SP.EXTRA_SHARE[0]) : slotShares(club, plan)[slot] ?? 0;
  const value = share * (plan?.sponsor ?? 0) * attractiveness(game, id) * (0.92 + rng.next() * 0.16);
  const old = S.contracts.find((c) => c.slot === slot);
  const [name, industry] = old && slot !== 'extra' && rng.chance(0.5) ? [old.name, old.industry] : pickFirm(rng, S, slot);
  return {
    id: `spo${++st.seq}`, slot, name, industry, reason, created: date, expires: addDays(date, SP.OFFER_DAYS), value: r1000(value),
    variants: Object.fromEntries(Object.keys(SP.VARIANTS).map((v) => [v, draftOf(v, value, slot)])),
  };
}

/** Podpisanie wariantu oferty: nowa umowa zastępuje dotychczasową na tym miejscu (partner dodatkowy dochodzi). */
export function signOffer(game, id, offerId, variant, date, by = 'trener') {
  const st = game.sponsors; const S = st?.clubs[id];
  const o = S?.offers.find((x) => x.id === offerId);
  if (!o || !o.variants[variant]) return null;
  const d = o.variants[variant];
  const prev = o.slot !== 'extra' ? S.contracts.find((c) => c.slot === o.slot) : null;
  if (prev) S.contracts = S.contracts.filter((c) => c !== prev);
  const c = contractOf(st, o.slot, o.name, o.industry, d, date, seasonEnd(d.years));
  if (prev?.paid === date.slice(0, 7)) c.paid = prev.paid; // nowa umowa w miejsce opłaconej w tym miesiącu
  S.contracts.push(c);
  S.offers = S.offers.filter((x) => x.id !== offerId);
  logEvent(S, date, `${SLOT_NAMES[o.slot]}: ${o.name} (${o.industry}), ${VARIANT_NAMES[variant].toLowerCase()}, ${fmtZl(c.annual)} rocznie do ${fmtDate(c.end)}.${by === 'zarząd' ? ' Wybór zarządu.' : ''}`);
  if (game.inbox) game.inbox = game.inbox.map((m) => (m.refs?.kind === 'sponsorOffer' && m.refs.offerId === offerId && !m.resolved ? { ...m, resolved: true, read: true, chosen: variant } : m));
  return c;
}

function logEvent(S, date, text, amount = null) {
  S.log.unshift({ date, text, ...(amount != null ? { amount: Math.round(amount) } : {}) });
  if (S.log.length > 20) S.log.length = 20;
}

const msg = (date, o) => createMessage({ date, category: 'club', from: 'Dział marketingu', priority: 'info', ...o });

function offerMessage(o) {
  const v = o.variants;
  const lines = [
    `${VARIANT_NAMES.fixed}: ${fmtZl(v.fixed.annual)} rocznie przez ${v.fixed.years} ${yearsWord(v.fixed.years)}, bez premii. Po spadku obniżka o 50 % albo zerwanie umowy.`,
    `${VARIANT_NAMES.bonus}: ${fmtZl(v.bonus.annual)} rocznie przez ${v.bonus.years} ${yearsWord(v.bonus.years)} plus premie: ${bonusText(v.bonus.bonuses)}. Po spadku obniżka o 40 %.`,
    `${VARIANT_NAMES.long}: ${fmtZl(v.long.annual)} rocznie przez ${v.long.years} ${yearsWord(v.long.years)}, co roku +3 %, premia za podium ${fmtZl(v.long.bonuses.top3 ?? 0)}. Po spadku obniżka o 30 %, bez zerwania.`,
  ];
  return createMessage({
    date: o.created, key: `sponsor-oferta:${o.id}`, category: 'club', from: 'Dział marketingu', priority: 'important',
    subject: `Oferta sponsorska: ${SLOT_NAMES[o.slot].toLowerCase()}, ${o.name}`,
    body: `${o.reason} Nowa oferta: ${o.name} (${o.industry}), ${SLOT_NAMES[o.slot].toLowerCase()}, w trzech wariantach:\n\n${lines.join('\n')}\n\nWybierz wariant tutaj albo w zakładce Klub, Sponsorzy do ${fmtDate(o.expires)}. Bez decyzji zarząd podpisze wariant ze stałą kwotą.`,
    actions: Object.keys(VARIANT_NAMES).map((k) => ({ id: k, label: VARIANT_NAMES[k] })), refs: { kind: 'sponsorOffer', offerId: o.id }, optional: true,
  });
}
export const yearsWord = (n) => (n === 1 ? 'rok' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'lata' : 'lat');
export const bonusText = (b) => Object.entries(b ?? {}).map(([k, v]) => `${BONUS_NAMES[k]} ${fmtZl(v)}`).join(', ') || 'brak';

registerDecision('sponsorOffer', (game, m, action) => {
  const c = signOffer(game, game.clubId, m.refs.offerId, action, game.date);
  return c ? [msg(game.date, { key: `sponsor-umowa:${c.id}`, subject: `Umowa podpisana: ${c.name}`, body: `${SLOT_NAMES[c.slot]}: ${c.name} (${c.industry}), ${fmtZl(c.annual)} rocznie do ${fmtDate(c.end)}.` })] : [];
});

/** Nowa oferta: gracz dostaje ją w poczcie i zakładce, klub AI podpisuje od razu wariant według celu. */
function offerFor(game, id, slot, date, reason, rng, out) {
  const S = game.sponsors.clubs[id];
  if (slot !== 'extra' && S.offers.some((o) => o.slot === slot)) return;
  const o = makeOffer(game, id, slot, date, reason, rng);
  if (!o.value) return;
  S.offers.push(o);
  if (id === game.clubId) out.push(offerMessage(o));
  else signOffer(game, id, o.id, aiVariant(clubById(id)), date, 'zarząd');
}

// ------------------------------------------------------------ Zdarzenia
const canEvent = (S, date) => S.lastEvent !== date.slice(0, 7); // najwyżej jedno zdarzenie losowe w miesiącu

function seasonStart(game, id, S, date, rng, out) {
  const club = clubById(id); const user = id === game.clubId;
  const plan = game.finance.clubs[id].plan;
  const tierWas = S.tier; S.tier = club.tier;
  // Wygasłe umowy: oferty na te miejsca; pakiet partnerów odnawia się sam; partner dodatkowy odchodzi
  for (const c of S.contracts.filter((x) => x.end < date)) {
    S.contracts = S.contracts.filter((x) => x !== c);
    if (c.slot === 'extra') { logEvent(S, date, `Wygasła umowa partnera: ${c.name}.`); continue; }
    if (c.slot === 'partners') {
      const value = slotShares(club, plan).partners * (plan?.sponsor ?? 0) * attractiveness(game, id) * (0.92 + rng.next() * 0.16);
      const n = contractOf(game.sponsors, 'partners', c.name, c.industry, draftOf('fixed', value, 'partners'), date, seasonEnd(1));
      S.contracts.push(n);
      logEvent(S, date, `Pakiet partnerów odnowiony na sezon: ${fmtZl(n.annual)}.`);
      continue;
    }
    offerFor(game, id, c.slot, date, `Wygasła umowa: ${c.name}.`, rng, out);
  }
  // Wzrost umów długoterminowych (co roku +3 %)
  for (const c of S.contracts) if (c.growth && c.start < date) c.annual = r1000(c.annual * (1 + c.growth));
  if (tierWas && club.tier < tierWas) {
    // Awans: klauzula awansu dla sponsora głównego i rękawa, oferty na wolne i kończące się miejsca w ciągu 14 dni
    for (const c of S.contracts) if (c.slot === 'main' || c.slot === 'sleeve') c.annual = r1000(c.annual * (1 + SP.PROMO_RAISE));
    logEvent(S, date, 'Awans: klauzula awansu podnosi umowy sponsora głównego i rękawa o 50 %.');
    if (user) out.push(msg(date, { key: `sponsor-awans:${SEASON_YEAR}`, subject: 'Sponsorzy po awansie', body: 'Klauzula awansu podnosi umowy sponsora głównego i rękawa o 50 %. W ciągu dwóch tygodni dział marketingu przedstawi oferty na wolne i kończące się miejsca.' }));
    const shares = slotShares(club, plan);
    for (const slot of Object.keys(SP.SLOTS)) {
      if (slot === 'partners' || !shares[slot]) continue;
      const c = S.contracts.find((x) => x.slot === slot);
      if (!c || c.end <= seasonEnd(1)) S.queue.push({ date: addDays(date, rng.int(3, 14)), slot, reason: 'Po awansie sponsorzy chcą rozmawiać o nowej umowie.' });
    }
  } else if (tierWas && club.tier > tierWas) {
    // Spadek: obniżki z klauzul, zerwania umów z klauzulą rozwiązania, pakiet partnerów -30 %
    const lines = [];
    for (const c of [...S.contracts]) {
      if (c.relegation?.terminate && rng.chance(SP.TERMINATE_P)) {
        S.contracts = S.contracts.filter((x) => x !== c);
        lines.push(`Zerwana umowa: ${c.name} (${SLOT_NAMES[c.slot].toLowerCase()}).`);
        if (c.slot !== 'extra') offerFor(game, id, c.slot, date, `Po spadku sponsor zerwał umowę (${c.name}).`, rng, out);
      } else {
        c.annual = r1000(c.annual * (1 - (c.relegation?.cut ?? SP.PARTNERS_CUT)));
        lines.push(`${c.name}: obniżka o ${Math.round((c.relegation?.cut ?? SP.PARTNERS_CUT) * 100)} %.`);
      }
    }
    logEvent(S, date, `Spadek: ${lines.join(' ')}`);
    if (user) out.push(msg(date, { key: `sponsor-spadek:${SEASON_YEAR}`, priority: 'important', subject: 'Sponsorzy po spadku', body: `Klauzule spadkowe w umowach sponsorskich:\n${lines.join('\n')}` }));
  }
  // Wolne miejsca (np. większy stadion pozwala sprzedać nazwę): oferta w ciągu 14 dni
  const shares = slotShares(club, plan);
  for (const slot of Object.keys(SP.SLOTS)) {
    if (slot === 'partners' || !shares[slot] || S.contracts.some((c) => c.slot === slot) || S.offers.some((o) => o.slot === slot) || S.queue.some((q) => q.slot === slot)) continue;
    S.queue.push({ date: addDays(date, rng.int(3, 14)), slot, reason: `Wolne miejsce: ${SLOT_NAMES[slot].toLowerCase()}.` });
  }
  // Trofeum w poprzednim sezonie: dodatkowa oferta (nowy partner albo podwyżka)
  const last = game.archive?.at(-1);
  if (last && (last.champion === id || last.cup === id)) S.queue.push({ date: addDays(date, rng.int(5, 20)), slot: 'extra', kind: 'extra', reason: last.champion === id ? 'Mistrzostwo przyciąga sponsorów.' : 'Puchar Polski przyciąga sponsorów.' });
}

/** Dodatkowe zdarzenie po awansie do pucharów albo trofeum: nowy partner (oferta) albo podwyżka u sponsora głównego. */
function extraEvent(game, id, S, q, date, rng, out) {
  const main = S.contracts.find((c) => c.slot === 'main');
  if (main && rng.chance(0.5)) {
    const add = r1000(main.annual * SP.RAISE);
    main.annual += add;
    logEvent(S, date, `Podwyżka od sponsora głównego (${main.name}): ${fmtZl(add)} rocznie. ${q.reason}`);
    if (id === game.clubId) out.push(msg(date, { key: `sponsor-podwyzka:${main.id}:${date}`, subject: `Podwyżka od sponsora: ${main.name}`, body: `${q.reason} Sponsor główny (${main.name}) podnosi umowę o ${fmtZl(add)} rocznie, do ${fmtZl(main.annual)}.` }));
  } else offerFor(game, id, 'extra', date, q.reason, rng, out);
}

function monthly(game, id, S, date, rng, out, uefaLeague) {
  const month = date.slice(0, 7); const user = id === game.clubId;
  // Awans do fazy ligowej UEFA: dodatkowe zdarzenie raz w sezonie
  if (uefaLeague.has(id) && S.flags.uefa !== SEASON_YEAR) { S.flags.uefa = SEASON_YEAR; S.queue.push({ date, slot: 'extra', kind: 'extra', reason: 'Gra w fazie ligowej pucharów UEFA przyciąga sponsorów.' }); }
  if (month.endsWith('-07') || month.endsWith('-06') || !canEvent(S, date)) return;
  // Kłopoty sponsora: zerwanie umowy przed czasem
  for (const c of S.contracts) {
    if (c.slot === 'partners' || !rng.chance(SP.TROUBLE_P / 12)) continue;
    S.contracts = S.contracts.filter((x) => x !== c); S.lastEvent = month;
    logEvent(S, date, `Sponsor w kłopotach finansowych zrywa umowę: ${c.name} (${SLOT_NAMES[c.slot].toLowerCase()}).`);
    if (user) out.push(msg(date, { key: `sponsor-klopoty:${c.id}`, priority: 'important', subject: `Sponsor zrywa umowę: ${c.name}`, body: `Sponsor ${c.name} ma kłopoty finansowe i rozwiązuje umowę przed czasem (${SLOT_NAMES[c.slot].toLowerCase()}). Dział marketingu szuka nowego sponsora; oferta przyjdzie w ciągu dwóch tygodni.` }));
    if (c.slot !== 'extra') S.queue.push({ date: addDays(date, rng.int(5, 14)), slot: c.slot, reason: `Sponsor zerwał umowę przed czasem (${c.name}).` });
    return;
  }
  // Nowy mały partner (1-3 % puli, rok)
  if (rng.chance(SP.NEW_PARTNER_P)) {
    const plan = game.finance.clubs[id].plan;
    const value = (SP.NEW_PARTNER[0] + rng.next() * (SP.NEW_PARTNER[1] - SP.NEW_PARTNER[0])) * (plan?.sponsor ?? 0);
    if (value < 1000) return;
    const [name, industry] = pickFirm(rng, S, 'extra');
    const c = contractOf(game.sponsors, 'extra', name, industry, { ...draftOf('fixed', value, 'extra'), years: 1, relegation: { cut: SP.PARTNERS_CUT, terminate: true } }, date, seasonEnd(1));
    S.contracts.push(c); S.lastEvent = month;
    logEvent(S, date, `Nowy partner: ${name} (${industry}), ${fmtZl(c.annual)} rocznie.`);
    if (user) out.push(msg(date, { key: `sponsor-partner:${c.id}`, subject: `Nowy partner klubu: ${name}`, body: `Nowy partner klubu do ${fmtDate(c.end)}: ${name} (${industry}), ${fmtZl(c.annual)} rocznie.` }));
  }
}

/** Premie sponsorów: mistrzostwo i podium (koniec ligi), Puchar Polski, faza ligowa UEFA. */
function payBonus(game, id, S, key, date, out) {
  let sum = 0;
  for (const c of S.contracts) {
    const amt = c.bonuses?.[key];
    if (!amt || c.bonusPaid?.[key] === SEASON_YEAR) continue;
    (c.bonusPaid ??= {})[key] = SEASON_YEAR;
    book(game.finance, id, date, 'in', 'sponsor', amt, `Premia sponsora: ${c.name} (${BONUS_NAMES[key]})`);
    sum += amt;
  }
  if (!sum) return;
  S.bonus[SEASON_YEAR] = (S.bonus[SEASON_YEAR] ?? 0) + sum;
  logEvent(S, date, `Premie sponsorów za ${BONUS_NAMES[key]}.`, sum);
  if (id === game.clubId) out.push(msg(date, { key: `sponsor-premia:${key}:${SEASON_YEAR}`, subject: `Premie sponsorów: ${fmtZl(sum)}`, body: `Sponsorzy wypłacają premie za ${BONUS_NAMES[key]}: ${fmtZl(sum)}.` }));
}

// ------------------------------------------------------------ Dzień
export function sponsorsDay(game, date) {
  if (!game.finance || !game.world) return [];
  const st = ensureSponsors(game);
  const out = [];
  const month = date.slice(0, 7);
  const first = date.endsWith('-01');
  const F = game.finance;
  // Rozstrzygnięcia sezonu do premii
  const leagueEnd = {};
  for (const comp of LEAGUE_COMPS) {
    if (F.merit?.[comp] !== date) continue;
    standings(game.fixtures.filter((f) => f.comp === comp), compClubIds(comp)).forEach((r, i) => { leagueEnd[r.id] = i + 1; });
  }
  let cupWinner = null;
  if (st.cup !== SEASON_YEAR) {
    const fin = game.fixtures?.find((f) => f.comp === 'pp' && f.round === 'F' && f.played);
    if (fin) { st.cup = SEASON_YEAR; cupWinner = winnerOf(fin); }
  }
  const uefaLeague = new Set();
  if (first) for (const f of game.fixtures ?? []) if (f.comp === 'uefa' && f.round === 'league') { uefaLeague.add(f.home); uefaLeague.add(f.away); }

  for (const [id, S] of Object.entries(st.clubs)) {
    const club = clubById(id);
    if (!club || !F.clubs[id]) continue;
    const rng = S.season !== SEASON_YEAR || S.queue.length || first ? rngFor(game, id, date) : null; // losowanie tylko w dniu zdarzeń
    if (S.season !== SEASON_YEAR) { S.season = SEASON_YEAR; seasonStart(game, id, S, date, rng, out); }
    // Kolejka ofert i zdarzeń
    if (S.queue.length) {
      const due = S.queue.filter((q) => q.date <= date);
      S.queue = S.queue.filter((q) => q.date > date);
      for (const q of due) {
        if (q.kind === 'extra') {
          if (!canEvent(S, date)) { S.queue.push({ ...q, date: `${addDays(`${month}-28`, 7).slice(0, 7)}-01` }); continue; }
          S.lastEvent = month; extraEvent(game, id, S, q, date, rng, out);
        } else offerFor(game, id, q.slot, date, q.reason, rng, out);
      }
    }
    // Oferty: gracz ma 14 dni, potem zarząd podpisuje stałą kwotę; kluby AI (np. po zmianie pracy trenera) od razu
    for (const o of [...S.offers]) {
      if (id !== game.clubId) signOffer(game, id, o.id, aiVariant(club), date, 'zarząd');
      else if (o.expires < date) {
        const c = signOffer(game, id, o.id, 'fixed', date, 'zarząd');
        if (c) out.push(msg(date, { key: `sponsor-zarzad:${c.id}`, subject: `Zarząd podpisał umowę: ${c.name}`, body: `Oferta czekała dwa tygodnie bez decyzji, więc zarząd podpisał wariant ze stałą kwotą: ${fmtZl(c.annual)} rocznie do ${fmtDate(c.end)}.` }));
      }
    }
    if (first) monthly(game, id, S, date, rng, out, uefaLeague);
    // Wpływy: 1/12 rocznej kwoty każdej umowy raz w miesiącu (umowa podpisana w trakcie miesiąca też)
    for (const c of S.contracts) {
      if (c.paid === month || c.start > date || c.end < date) continue;
      c.paid = month;
      book(F, id, date, 'in', 'sponsor', c.annual / 12);
    }
    // Premie
    if (leagueEnd[id] === 1) payBonus(game, id, S, 'title', date, out);
    if (leagueEnd[id] && leagueEnd[id] <= 3) payBonus(game, id, S, 'top3', date, out);
    if (cupWinner === id) payBonus(game, id, S, 'cup', date, out);
    if (uefaLeague.has(id)) payBonus(game, id, S, 'uefaLeague', date, out);
  }
  return out;
}

registerDailySystem({ id: 'sponsors', order: 51, run(game, date) { return { messages: sponsorsDay(game, date) }; } });

// ------------------------------------------------------------ Dla widoku
/** Podsumowanie dla zakładki Klub > Sponsorzy. */
export function sponsorSummary(game) {
  const st = ensureSponsors(game);
  const S = st?.clubs[game.clubId];
  if (!S) return null;
  const order = Object.keys(SLOT_NAMES);
  const contracts = [...S.contracts].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot) || b.annual - a.annual);
  const total = contracts.reduce((s, c) => s + c.annual, 0);
  const main = contracts.find((c) => c.slot === 'main') ?? null;
  const next = contracts.filter((c) => c.slot !== 'partners' && c.slot !== 'extra').sort((a, b) => a.end.localeCompare(b.end))[0] ?? null;
  return { contracts, offers: S.offers, log: S.log, total, main, next, bonusSeason: S.bonus[SEASON_YEAR] ?? 0, pool: game.finance.clubs[game.clubId]?.plan?.sponsor ?? 0 };
}
