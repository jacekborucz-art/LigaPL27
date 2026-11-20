// Znaczniki stanu zawodnika: małe kolorowe kwadraty tuż za nazwiskiem (Kadra > Zawodnicy, docs/tagi-zawodnika.md).
// Kolejność według ważności: pauza za kartki, kontuzja, powołanie, transfer w toku i przedkontrakt, oferty, chęć
// odejścia, jedna żółta od pauzy (i pauza tylko w innej klasie), lista transferowa i wypożyczeń, kończący się kontrakt,
// wypożyczenie, zmęczenie. Pełny kwadrat: sprawa pilna, obrys: drugorzędna. Telefon pokazuje 2 znaczniki, PC 4,
// resztę jeden znacznik „+N” z listą w podpowiedzi. Zawodnicy innych klubów: bez kondycji, cichej prośby o odejście,
// listy transferowej gracza i ofert. Style: src/styles/app.css (.tg).
import { esc, fmtDate } from './dom.js';
import { classKeyOfTier, LEAGUE_CLASS_KEYS, rulesCompOfClass } from '../season/leagueComps.js';
import { anyClub, yellowSuspension } from '../season/season.js';
import { ntName } from '../season/national.js';
import { familyOf } from '../career/reserves.js';
import { dealOf, buyerName, STAGE_LABELS } from '../career/transferDeals.js';
import { thinkingUntil } from '../career/proposals.js'; // namysł zawodnika nad propozycjami klubów
import { openLoanOffers } from '../career/loans.js';
import { isLoanedOut } from '../career/squad.js';
import { formatZl } from '../career/negotiation.js';
import { SEASON_END } from '../config/calendar2026.js';

const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
const clubName = (id) => (id ? anyClub(id)?.name ?? 'inny klub' : 'bez klubu');

// ------------------------------------------------------------ Pauzy (wspólne z widokiem Kadry)
const SUSP_IN = { ekstraklasa: 'Ekstraklasie', liga1: '1 Lidze', liga2: '2 Lidze', liga3: 'III lidze', cup: 'Pucharze Polski', uefa: 'pucharach europejskich' };
/**
 * Pauzy zawodnika z podziałem (kartki per klasa, docs/rezerwy.md): rel = w rozgrywkach jego drużyny (klasa ligi klubu,
 * Puchar Polski, UEFA), other = tylko w innej klasie ligowej (np. 2 Liga po meczu w rezerwach: w meczach swojej drużyny
 * może grać). Bez znanego poziomu klubu wszystkie pauzy są w rel. Zwraca { rel: [[klucz, mecze]], other: [...] }.
 */
export function suspSplit(p, tier = null) {
  const own = classKeyOfTier(tier);
  const rel = []; const other = [];
  for (const [k, v] of Object.entries(p?.susp ?? {})) if (v > 0) (own && LEAGUE_CLASS_KEYS.includes(k) && k !== own ? other : rel).push([k, v]);
  if (p?.suspended > 0 && !rel.length && !other.length) rel.push(['', p.suspended]);
  return { rel, other };
}
export const suspText = (list) => list.map(([k, v]) => `${v} ${plural(v, 'mecz', 'mecze', 'meczów')}${SUSP_IN[k] ? ` w ${SUSP_IN[k]}` : ''}`).join(', ');
// Powód pauzy w kluczu (p.suspWhy, src/season/suspension.js); stary zapis bez powodu: bez dopisku
const WHY_TEXT = { y: 'żółte kartki', r: 'czerwona kartka' };
const suspWhyText = (p, list) => list.map(([k, v]) => {
  const w = WHY_TEXT[p?.suspWhy?.[k]];
  return `${suspText([[k, v]])}${w ? ` (${w})` : ''}`;
}).join(', ');

// ------------------------------------------------------------ Zasady kartek: jedna żółta od pauzy
const YC_NAMES = { cup: 'Puchar Polski', uefa: 'puchary europejskie' };
const rulesOfKey = (key) => (key === 'cup' ? 'pucharPolski' : key === 'uefa' ? 'uefa' : rulesCompOfClass(key));
/** Rozgrywki drużyny zawodnika, w których kolejna żółta kartka oznacza pauzę: [[klucz, żółte]]. */
export function oneYellowAway(p, tier = null) {
  if (!p?.yc || typeof p.yc !== 'object') return [];
  const out = [];
  for (const key of [classKeyOfTier(tier), 'cup', 'uefa']) {
    const n = p.yc[key] ?? 0;
    const comp = key && rulesOfKey(key);
    if (n > 0 && comp && yellowSuspension(comp, n + 1) > 0) out.push([key, n]);
  }
  return out;
}

// ------------------------------------------------------------ Lista znaczników
/** Zawodnik klubu gracza (także drugiej drużyny rodziny klubu, src/career/reserves.js). */
function isUserSide(game, p) {
  if (!game?.clubId || !p?.clubId) return false;
  if (p.clubId === game.clubId) return true;
  const fam = game.world ? familyOf(game, game.clubId) : null;
  return !!fam && (fam.parent === p.clubId || fam.reserve === p.clubId);
}

/**
 * Znaczniki zawodnika według ważności: [{ k, label, title, o }] (k: rodzaj do stylu, o: obrys zamiast wypełnienia).
 * opts: own (zawodnik gracza: pełna wiedza; domyślnie klub gracza i jego druga drużyna), clubId (klub, którego kadrę
 * oglądamy: wypożyczenia do i z klubu; domyślnie klub zawodnika), tier (poziom ligi tego klubu: pauzy i żółte w klasie).
 */
export function playerTagList(game, p, opts = {}) {
  if (!p) return [];
  const own = opts.own ?? isUserSide(game, p);
  const view = opts.clubId ?? p.clubId ?? null;
  const tier = opts.tier !== undefined ? opts.tier : (view ? anyClub(view)?.tier ?? null : null);
  const M = game?.market ?? null;
  const date = game?.date ?? '';
  const out = [];
  const add = (k, label, title, o = false) => out.push({ k, label, title, o });

  // 1. Pauza za kartki (żółta: nagromadzone żółte, czerwona: czerwona kartka)
  const s = suspSplit(p, tier);
  if (s.rel.length) {
    const red = s.rel.some(([k]) => p.suspWhy?.[k] === 'r');
    const n = Math.max(...s.rel.map(([, v]) => v));
    const more = s.other.length ? `. Tylko w innej klasie: ${suspText(s.other)}` : '';
    add(red ? 'sr' : 'sy', `P${n}`, `Pauza za kartki: ${suspWhyText(p, s.rel)}${more}`);
  }
  // 2. Kontuzja
  if (p.injuryDays > 0) {
    const d = Math.round(p.injuryDays);
    add('inj', d > 99 ? '99+' : `+${d}`, `${p.injury?.name ? `Kontuzja: ${p.injury.name}` : 'Kontuzja'}, ok. ${d} ${plural(d, 'dzień', 'dni', 'dni')} przerwy`);
  }
  // 3. Powołanie do reprezentacji
  if (p.callUp) {
    const c = p.callUp;
    add('nt', 'K', `Powołanie do reprezentacji: ${ntName(c.team)}${c.u21 ? ' U21' : ''}${c.to ? `, wraca po ${fmtDate(c.to)}` : ''}`);
  }
  // 4. Transfer w toku i przedkontrakt (src/career/transferDeals.js, src/career/preContracts.js)
  const d = game?.market ? dealOf(game, p.id) : null;
  if (d || p.transfer?.hold) {
    const stage = d ? (STAGE_LABELS[d.stage] ?? '').toLowerCase() : '';
    const head = d && d.from === p.clubId && d.to !== view ? `Odchodzi do ${buyerName(d)}` : 'Transfer w toku';
    add('tr', 'TR', `${head}${stage ? `: ${stage}` : ''}${p.transfer?.hold ? '. Po testach medycznych nie gra' : ''}`);
  } else if (M?.pending?.length) {
    const until = thinkingUntil(game, p.id); // propozycja w toku: obrys, wynik nieznany
    if (until) add('tr', 'TR', `Rozważa oferty, odpowie do ${fmtDate(until)}`, true);
  }
  if (p.preContract) {
    const pc = p.preContract;
    const to = pc.foreign ? pc.foreign.name : clubName(pc.club);
    const start = pc.start ? ` od ${fmtDate(pc.start)}` : '';
    add('pk', 'PK', pc.club && pc.club === game?.clubId && p.clubId !== game?.clubId ? `Przedkontrakt: dołączy do nas${start}` : `Przedkontrakt: odchodzi do ${to}${start}`);
  }
  // 5. Oferty do decyzji gracza (kupno, wypożyczenie, prawo pierwokupu)
  if (M?.offers?.length) {
    const open = M.offers.filter((o) => o.playerId === p.id && o.status === 'open' && !(o.expires < date));
    const buy = own ? open.filter((o) => o.kind === 'incoming').length : 0;
    const loan = own ? open.filter((o) => o.kind === 'loanOut').length : 0;
    const rofr = open.filter((o) => o.kind === 'rofr').length;
    const n = buy + loan + rofr;
    if (n) add('of', `O${n}`, `Oferty do decyzji: ${[buy && `kupno ${buy}`, loan && `wypożyczenie ${loan}`, rofr && `prawo pierwokupu ${rofr}`].filter(Boolean).join(', ')}`);
  }
  // 6. Chce odejść (src/career/moveWish.js): u innych klubów tylko oficjalna prośba
  const official = p.moveWish?.stage === 'oficjalna' || (!p.moveWish && p.transferRequest);
  if (official || (own && p.moveWish)) add('mw', '!', `Chce odejść (${official ? 'oficjalna prośba o transfer' : 'cicha prośba przez agenta'})`, true);
  // 7. Jedna żółta kartka od pauzy; pauza tylko w innej klasie (rezerwy: w meczach drużyny może grać)
  const ya = oneYellowAway(p, tier);
  if (ya.length) add('y1', 'Ż', `Jedna żółta kartka od pauzy: ${ya.map(([k, n]) => `${LEAGUE_CLASS_KEYS.includes(k) ? 'liga' : YC_NAMES[k]} (${n} ${plural(n, 'żółta', 'żółte', 'żółtych')})`).join(', ')}`, true);
  if (!s.rel.length && s.other.length) add('s2', `P${Math.max(...s.other.map(([, v]) => v))}`, `Pauza tylko w innej klasie (${suspText(s.other)}), w meczach drużyny może grać`, true);
  // 8. Lista transferowa i lista wypożyczeń
  if (own && M?.userListed?.[p.id]) add('tl', 'T', `Na liście transferowej za ${formatZl(M.userListed[p.id])}`);
  else if (!own && M?.listed?.[p.id]?.kind === 'sale') add('tl', 'T', 'Na liście transferowej klubu');
  if (own && M) {
    const n = game.world && Array.isArray(M.offers) ? openLoanOffers(game, p.id).length : 0;
    if (n) add('ll', 'W', `Do wypożyczenia: ${n} ${plural(n, 'propozycja', 'propozycje', 'propozycji')} klubów`);
    else if (M.loanAsks?.[p.id]) add('ll', 'W', 'Do wypożyczenia: dyrektor sportowy szuka klubu');
  } else if (!own && M?.listed?.[p.id]?.kind === 'loan') add('ll', 'W', 'Klub chce go wypożyczyć');
  // 9. Kontrakt wygasa z końcem sezonu
  const until = p.contract?.until;
  if (until && until <= SEASON_END) add('kw', 'KW', `Kontrakt wygasa ${fmtDate(until)}${own && p.renewRefused ? ', odmówił przedłużenia' : ''}`, true);
  // 10. Wypożyczenie: do oglądanego klubu albo z niego
  if (p.loan && view && p.clubId === view) add('li', 'W+', `Wypożyczony z ${clubName(p.loan.from)}${p.loan.until ? ` do ${fmtDate(p.loan.until)}` : ''}`, true);
  else if (view && isLoanedOut(p, view)) add('lo', 'W−', `Wypożyczony do ${clubName(p.clubId)}${p.loan.until ? ` do ${fmtDate(p.loan.until)}` : ''}`, true);
  // 11. Zmęczony (tylko zawodnicy gracza)
  const fr = Math.round(p.fresh ?? 95);
  if (own && fr < 75) add('z', 'Z', `Zmęczony: kondycja ${fr}%`, true);
  return out;
}

export const TAG_LIMIT = { phone: 2, pc: 4 };
const tagHtml = (t, cls = '') => `<span class="tg${t.o ? ' tg--o' : ''}${cls}" data-k="${t.k}" role="img" title="${esc(t.title)}" aria-label="${esc(t.title)}">${esc(t.label)}</span>`;
const moreHtml = (rest, cls) => {
  const title = `Więcej: ${rest.map((t) => t.title).join('; ')}`;
  return `<span class="tg tg-more ${cls}" data-k="more" role="img" title="${esc(title)}" aria-label="${esc(title)}">+${rest.length}</span>`;
};

/**
 * Znaczniki jako HTML (pusty napis bez znaczników). Telefon (poniżej 760 px): pierwsze 2, PC: pierwsze 4; reszta jako
 * „+N” osobno dla każdego progu (dwa warianty, CSS pokazuje właściwy). opts jak playerTagList.
 */
export function playerTags(game, p, opts = {}) {
  const list = playerTagList(game, p, opts);
  if (!list.length) return '';
  const { phone, pc } = TAG_LIMIT;
  const shown = list.slice(0, pc).map((t, i) => tagHtml(t, i >= phone ? ' tg--pc' : ''));
  const morePh = list.length > phone ? moreHtml(list.slice(phone), 'tg-more--ph') : '';
  const morePc = list.length > pc ? moreHtml(list.slice(pc), 'tg-more--pc') : '';
  return `<span class="tg-row">${shown.join('')}${morePh}${morePc}</span>`;
}
