// Wiadomości z mediów o innych klubach (prośba właściciela Nov 20, 2026): tylko z ligi gracza i lig wyższych,
// tylko ważne sprawy. Bez klubu gracza (o nim przychodzą osobne wiadomości).
// - duże transfery: odstępne od progu ligi, z wyższych lig od podwójnego progu [SZAC];
// - koszmarne kontuzje: przerwa od 120 dni [SZAC]; z wyższych lig tylko znani zawodnicy (reputacja od 60);
// - kłopoty finansowe: saldo klubu poniżej zera, a poniżej progu ligi ostrzeżenie o zagrożeniu licencji
//   (w grze nie ma mechanizmu bankructwa; to tylko wiadomość, raz na sezon).
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
  for (const p of Object.values(game.world?.players ?? {})) {
    const inj = p.injury;
    if (!inj || !p.clubId || p.clubId === me || (p.injuryDays ?? 0) < NEWS.injuryDays || !inj.since || inj.since < since) continue;
    const t = tierOf(p.clubId);
    if (!inScope(t, my, p.clubId, me) || (t < my && (p.rep ?? 0) < NEWS.injuryRepHigher)) continue;
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
  return out;
}

registerDailySystem({
  id: 'leagueNews', order: 95,
  run(game, date) {
    if (!game.world || !game.market || !game.finance) return {};
    return { messages: leagueNewsDay(game, date) };
  },
});
