// Wiadomości z mediów o innych klubach (prośba właściciela Nov 20, 2026): tylko z ligi gracza i lig wyższych,
// tylko ważne sprawy. Bez klubu gracza (o nim przychodzą osobne wiadomości).
// - duże transfery: odstępne od progu ligi, z wyższych lig od podwójnego progu [SZAC];
// - koszmarne kontuzje: przerwa od 120 dni [SZAC]; z wyższych lig tylko znani zawodnicy (reputacja od 60);
// - kłopoty finansowe: saldo klubu poniżej zera, a poniżej progu ligi ostrzeżenie o zagrożeniu licencji (raz na sezon);
// - zmiany właścicieli (src/career/ownership.js), zaległości, zakazy transferowe, kary punktowe, odejścia zawodników
//   i brak licencji (src/career/arrears.js).
// Zwolnienia trenerów: src/career/coachMarket.js (Media, ta sama zasada ligi). Reprezentacja: kategoria national.
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { knownClub } from '../season/leagues.js';
import { SEASON } from '../config/calendar2026.js';
import { fmtZl } from './transfers.js';

export const NEWS = {
  fee: { 1: 4e6, 2: 1e6, 3: 4e5, 4: 1.5e5 }, // próg „dużego” transferu w lidze [SZAC]
  injuryDays: 120,
  injuryRepHigher: 60,
  higherFeeMul: 2, // z wyższej ligi tylko transfery od podwójnego progu tej ligi [SZAC]
  debt: { 1: -10e6, 2: -3e6, 3: -1e6, 4: -3e5 }, // saldo, przy którym media piszą o zagrożeniu licencji [SZAC]
};

const media = (date, key, subject, body) => createMessage({ date, key, category: 'media', from: 'Media', priority: 'info', subject, body });
const tierOf = (id) => knownClub(id)?.tier ?? null;
const nameOf = (id) => knownClub(id)?.name ?? id;

/** Czy sprawa klubu o poziomie t ma trafić do gracza z poziomu my (ta sama liga albo wyższa; w III lidze ta sama grupa). */
const inScope = (t, my, id, me) => t != null && (t < my || (t === my && (t !== 4 || knownClub(id)?.group === knownClub(me)?.group)));

export function leagueNewsDay(game, date) {
  const me = game.clubId;
  const my = tierOf(me) ?? 4;
  const out = [];
  // Duże transfery z ostatnich dni (klucz wiadomości chroni przed powtórką)
  const since = addDays(date, -3);
  for (const e of game.market?.history ?? []) {
    if (e.date < since || e.date > date) continue;
    if (!e.fee || e.from === me || e.to === me || !['transfer', 'abroad'].includes(e.kind)) continue;
    const ts = [tierOf(e.from), tierOf(e.to)].filter((t) => t != null);
    if (!ts.length) continue;
    const t = Math.min(...ts);
    const tid = tierOf(e.from) === t ? e.from : e.to;
    if (!inScope(t, my, tid, me) || e.fee < NEWS.fee[t] * (t < my ? NEWS.higherFeeMul : 1)) continue;
    const to = e.to && knownClub(e.to) ? nameOf(e.to) : e.toName ?? 'klub zagraniczny';
    const from = e.from && knownClub(e.from) ? nameOf(e.from) : e.fromName ?? 'z zagranicy';
    out.push(media(date, `news-transfer:${e.playerId}:${e.date}`, `Duży transfer: ${e.name} do ${to}`,
      `${e.name} (${e.pos}) przechodzi z ${from} do ${to}. Kwota odstępnego: ${fmtZl(e.fee)}.`));
  }
  // Koszmarne kontuzje u rywali
  const W = game.world?.players ?? {};
  // Szybkie sprawdzenie przez kadry i akademie (każdy zawodnik z klubem jest w jednej z nich): pełny przegląd
  // wszystkich zawodników (kolejność wiadomości jak dotąd) tylko w dni, w których jest świeża długa kontuzja
  const news = (p) => {
    const inj = p?.injury;
    if (!inj || !p.clubId || p.clubId === me || (p.injuryDays ?? 0) < NEWS.injuryDays || !inj.since || inj.since < since) return false;
    const t = tierOf(p.clubId);
    return inScope(t, my, p.clubId, me) && !(t < my && (p.rep ?? 0) < NEWS.injuryRepHigher);
  };
  let any = false;
  for (const [cid, c] of Object.entries(game.world?.clubs ?? {})) {
    if (cid === me || !inScope(tierOf(cid), my, cid, me)) continue;
    if (c.squad?.some((id) => news(W[id])) || c.academy?.some((id) => news(W[id]))) { any = true; break; }
  }
  if (any) for (const id in W) { // for-in: ta sama kolejność co Object.values, bez kopii wszystkich zawodników
    const p = W[id];
    if ((p.injuryDays ?? 0) < NEWS.injuryDays || !news(p)) continue;
    const inj = p.injury;
    const months = Math.round(p.injuryDays / 30);
    out.push(media(date, `news-uraz:${p.id}:${inj.since}`, `${nameOf(p.clubId)}: ${p.name} wypada na długo`,
      `${p.name} (${p.pos}) doznał poważnej kontuzji${inj.name ? ` (${inj.name})` : ''}. Przerwa potrwa około ${months} ${months === 1 ? 'miesiąca' : 'miesięcy'}.`));
  }
  // Kłopoty finansowe klubów
  for (const [id, F] of Object.entries(game.finance?.clubs ?? {})) {
    if (id === me || F?.balance == null || F.balance >= 0) continue;
    const t = tierOf(id);
    if (!inScope(t, my, id, me) || knownClub(id)?.parent) continue;
    if (F.balance <= NEWS.debt[t]) {
      out.push(media(date, `news-licencja:${id}:${SEASON}`, `${nameOf(id)}: poważne kłopoty finansowe`,
        `Dług klubu sięga ${fmtZl(-F.balance)}. Media piszą o zagrożeniu licencji na grę i możliwych sprzedażach zawodników.`));
    } else {
      out.push(media(date, `news-finanse:${id}:${SEASON}`, `${nameOf(id)} ma problemy finansowe`,
        `Klub jest na minusie (${fmtZl(F.balance)}). Media donoszą o opóźnieniach w wypłatach i szukaniu oszczędności.`));
    }
  }
  // Właściciele i zaległości wobec zawodników w innych klubach (zdarzenia z ostatnich dni)
  for (const e of game.ownerLog ?? []) {
    if (e.date < since || e.date > date || e.club === me || !inScope(tierOf(e.club), my, e.club, me)) continue;
    const n = nameOf(e.club);
    const t = OWNER_NEWS[e.kind];
    if (t) out.push(media(date, `news-wlasciciel:${e.club}:${e.date}`, t.s(n, e), `${t.b(n, e)}${e.coach ? ' Nowy właściciel zmienia też trenera.' : ''}`));
  }
  for (const e of game.debt?.events ?? []) {
    if (e.date < since || e.date > date || e.club === me || !inScope(tierOf(e.club), my, e.club, me)) continue;
    const t = DEBT_NEWS[e.kind];
    if (t) out.push(media(date, `news-dlug:${e.kind}:${e.club}:${e.date}`, t.s(nameOf(e.club), e), t.b(nameOf(e.club), e)));
  }
  return out;
}

const OWNER_NEWS = {
  sale: { s: (n) => `${n} ma nowego właściciela`, b: (n, e) => `Klub przejmuje ${e.name.toLowerCase()} (wcześniej: ${e.fromName}). Media spekulują o nowym budżecie na kolejny sezon.` },
  city: { s: (n) => `${n}: miasto przejmuje klub`, b: (n, e) => `${e.name} przejmuje klub od dotychczasowego właściciela (${e.fromName}). Budżet będzie skromniejszy niż za poprzednich rządów.` },
  withdraw: { s: (n) => `Miasto wycofuje wsparcie dla klubu ${n}`, b: (n, e) => `${e.name} nie przekaże w nowym sezonie dotacji. Klub musi utrzymać się z biletów, praw TV i sponsorów.` },
  investor: { s: (n) => `${n}: inwestor ratuje klub`, b: (n, e) => `Po wycofaniu się miasta klub przejmuje ${e.name.toLowerCase()}.` },
};
const DEBT_NEWS = {
  arrears: { s: (n) => `Zaległości w płacach w klubie ${n}`, b: () => 'Zawodnicy nie dostali pensji na czas. Jeśli zaległości potrwają, mogą wezwać klub do zapłaty i odejść za darmo.' },
  ban: { s: (n) => `${n} z zakazem transferowym`, b: () => 'Klub zalega z pensjami od 2 miesięcy. Do spłaty zaległości nie może zgłaszać nowych zawodników, a zawodnicy wysłali wezwania do zapłaty.' },
  points: { s: (n, e) => `${n} ukarany: minus ${e.n} punkty`, b: () => 'Kara za zaległości wobec zawodników. Kolejne kary co 2 miesiące do spłaty długu.' },
  term: { s: (n, e) => `Zawodnicy odchodzą z ${n} (${e.n})`, b: (n, e) => `${e.n} ${e.n === 1 ? 'zawodnik rozwiązał' : 'zawodników rozwiązało'} kontrakty z winy klubu po niewypłaconych pensjach. Są wolni i mogą podpisać umowy także poza oknem.` },
  licFail: { s: (n) => `${n} bez licencji`, b: (n, e) => `Komisja licencyjna odmówiła licencji${e.repeat ? ' drugi sezon z rzędu' : ''} z powodu zaległości wobec zawodników.` },
};

registerDailySystem({
  id: 'leagueNews', order: 95,
  run(game, date) {
    if (!game.world || !game.market || !game.finance) return {};
    return { messages: leagueNewsDay(game, date) };
  },
});
