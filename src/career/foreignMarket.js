// Kupcy z zagranicy (docs/transfery.md, rozdz. 4): ligi z kluby_uefa.json o sile co najmniej Ekstraklasa - 0,5
// oraz rynki „pieniężne” (Arabia Saudyjska, MLS, Turcja). Kupiec to prawdziwy klub z danych, a gdy nie pasuje
// poziomem, ogólny opis („klub z ligi tureckiej”). Raz w tygodniu w oknie: oferty za zawodników klubów AI
// (sprzedaż, gdy kwota >= 0,85 ceny wywoławczej albo zawodnik prosi o transfer) i za zawodników gracza
// (oferta w poczcie i w zakładce Oferty). Liczby [SZAC].

import { Rng } from '../core/rng.js';
import { createMessage } from '../core/inbox.js';
import { addDays } from '../core/gameLoop.js';
import { CLUBS_PL } from '../data/clubs_pl.js';
import { squadOf } from '../world/worldGen.js';
import { askingPrice, notForSale, breaksMinimum, windowOf, fmtZl } from './transfers.js';
import { askingPriceMultiplier } from './reputation.js';
import { startDeal, hasOpenDeal, stat } from './transferDeals.js';
import { onOfferRejected } from './moveWish.js';
import { fmtDate } from '../ui/dom.js';
import DATA from '../data/kluby_uefa.json' with { type: 'json' };
import { applyNamesDeep } from '../data/clubNames.js';
applyNamesDeep(DATA); // nazwy do publikacji (prawdziwe w clubNames.js)

const round = (x, step = 5000) => Math.round(x / step) * step;

export const FOREIGN = {
  pBase: 0.033, // tygodniowa szansa oferty za zawodnika o reputacji 40 [SZAC] (spec 0,006; kalibracja do 25-40 sprzedaży z Ekstraklasy; 0,025 przed dynamiczną reputacją, docs/reputacja.md)
  repMin: 40, youngAge: 23, youngPot: 13,
  feeLo: 0.9, feeHi: 1.35, wageLo: 1.5, wageHi: 3.0,
  sellRatio: 0.85, // klub AI sprzedaje, gdy kwota >= 0,85 ceny wywoławczej
  lastDays: 3, // w ostatnich 3 dniach okna kluby zagraniczne nie zaczynają transakcji
  userMax: 2, // najwyżej tyle otwartych ofert z zagranicy za zawodników gracza
  leak: 0.5, // szansa, że zawodnik klubu AI dowie się o odrzuconej ofercie z zagranicy
};
// Ligi „pieniężne” spoza danych UEFA: siła ligi [SZAC], waga losowania kupca
const MONEY = [
  { kod: 'KSA', nazwa: 'Arabia Saudyjska', Lliga: 12.4, adj: 'saudyjskiej', w: 1.2 },
  { kod: 'USA', nazwa: 'USA', Lliga: 12.2, adj: null, generic: 'klub z MLS', w: 1.0 },
];
const ADJ = {
  ENG: 'angielskiej', ITA: 'włoskiej', ESP: 'hiszpańskiej', GER: 'niemieckiej', FRA: 'francuskiej', NED: 'holenderskiej',
  POR: 'portugalskiej', BEL: 'belgijskiej', CZE: 'czeskiej', TUR: 'tureckiej', NOR: 'norweskiej', GRE: 'greckiej',
  AUT: 'austriackiej', SCO: 'szkockiej', DEN: 'duńskiej', SUI: 'szwajcarskiej', ISR: 'izraelskiej', CYP: 'cypryjskiej', SWE: 'szwedzkiej',
};
const POL_L = DATA.kraje.find((k) => k.kod === 'POL')?.Lliga ?? 12;

/** Ligi kupców: { kod, nazwa, Lliga, clubs: [{ id, name, L }], w }. */
export const FOREIGN_LEAGUES = [
  ...DATA.kraje.filter((k) => k.kod !== 'POL' && k.Lliga >= POL_L - 0.5).map((k) => ({
    kod: k.kod, nazwa: k.nazwa, Lliga: k.Lliga, adj: ADJ[k.kod] ?? null,
    clubs: DATA.kluby.filter((c) => c.kraj === k.kod).map((c) => ({ id: c.id, name: c.nazwa, L: c.L, prestige: c.prestiz ?? 5 })),
    w: k.kod === 'TUR' ? 1.6 : 1, // Turcja: rynek pieniężny
  })),
  ...MONEY.map((m) => ({ ...m, clubs: [] })),
];

/** Reputacja kupca z siły ligi: 30 + 9 (L - 11). */
export const buyerRep = (L) => Math.round(30 + 9 * (L - 11));

/** Kupiec dla zawodnika: liga ważona, klub z danych o sile blisko poziomu zawodnika, inaczej opis ligi. */
export function pickBuyer(rng, p) {
  const ovr = p.ovr ?? 11;
  const leagues = FOREIGN_LEAGUES.filter((l) => l.Lliga <= ovr + 3); // zbyt mocne ligi nie kupują przeciętnych
  const lg = rng.weighted(leagues.length ? leagues : FOREIGN_LEAGUES, (l) => l.w * (l.Lliga >= ovr + 1.5 ? 0.5 : 1) * ((p.age ?? 25) >= 29 && !l.clubs.length ? 2 : 1));
  const fit = lg.clubs.filter((c) => c.L >= ovr - 0.8 && c.L <= ovr + 2.5);
  const club = fit.length && rng.chance(0.75) ? rng.pick(fit) : null;
  const name = club ? club.name : lg.generic ?? `klub z ligi ${lg.adj ?? lg.nazwa.toLowerCase()}`;
  // rep: reputacja kupca ze wzoru ligi (prośby o transfer); repU: ta sama skala co clubReputation polskich klubów (decyzje zawodnika)
  const rep = buyerRep(club ? Math.min(club.L, lg.Lliga + 1) : lg.Lliga);
  return { country: lg.kod, countryName: lg.nazwa, name, clubId: club?.id ?? null, rep, repU: club ? Math.min(100, club.prestige * 7 + 25) : rep + 25, L: club?.L ?? lg.Lliga };
}

/** Czy zawodnik interesuje zagranicę: reputacja >= 40 albo młody talent (do 23 lat, POT >= 13). */
export function foreignTarget(p) {
  return (p.rep ?? 0) >= FOREIGN.repMin || ((p.age ?? 30) <= FOREIGN.youngAge && (p.hidden?.POT ?? 0) >= FOREIGN.youngPot);
}

/** Tygodniowa szansa oferty z zagranicy. */
export function foreignChance(p) {
  const rep = p.rep ?? 30;
  const avg = (p.season?.apps ?? 0) >= 5 ? p.season.rating : 0;
  return FOREIGN.pBase * Math.max(0.3, 1 + (rep - 40) / 15) * ((p.age ?? 25) <= 25 ? 1.5 : (p.age ?? 25) >= 30 ? 0.4 : 1) * (avg >= 7.0 ? 1.5 : 1);
}

/** Oferta z zagranicy dla zawodnika (kwota i pensja). */
export function foreignOffer(rng, p) {
  const buyer = pickBuyer(rng, p);
  const fee = round((p.value ?? 0) * (FOREIGN.feeLo + rng.next() * (FOREIGN.feeHi - FOREIGN.feeLo)));
  const wage = Math.round((p.contract?.wage ?? 3000) * (FOREIGN.wageLo + rng.next() * (FOREIGN.wageHi - FOREIGN.wageLo)) / 100) * 100;
  return { ...buyer, fee, wage };
}

/**
 * Tydzień w oknie: oferty z zagranicy. Kluby AI sprzedają od razu (transakcja), gracz dostaje ofertę w poczcie.
 * Zwraca wiadomości.
 */
export function foreignWeek(game, date) {
  const w = windowOf(date);
  if (!w || date > addDays(w.to, -FOREIGN.lastDays)) return [];
  const out = [];
  const W = game.world;
  const openUser = game.market.offers.filter((o) => o.status === 'open' && o.kind === 'incoming' && o.foreign).length;
  let userOffers = 0;
  for (const c of CLUBS_PL) {
    if (!W.clubs[c.id] || c.tier > 4) continue;
    for (const p of squadOf(W, c.id)) {
      if (!foreignTarget(p) || p.loan || p.preContract || hasOpenDeal(game, p.id) || p.injuryDays > 28) continue;
      const rng = new Rng(`zagranica:${game.seed}:${p.id}:${date}`);
      if (!rng.chance(foreignChance(p))) continue;
      const o = foreignOffer(rng, p);
      if (o.fee <= 0) continue;
      if (c.id === game.clubId) {
        if (openUser + userOffers >= FOREIGN.userMax || game.market.offers.some((x) => x.status === 'open' && x.playerId === p.id)) continue;
        const offer = { id: `of-${date}-${p.id}-z`, kind: 'incoming', playerId: p.id, from: null, foreign: { country: o.country, countryName: o.countryName, name: o.name, clubId: o.clubId, rep: o.rep, wage: o.wage }, fee: o.fee, status: 'open', date, expires: addDays(date, 6) };
        game.market.offers.unshift(offer);
        out.push(foreignOfferMessage(game, offer, date));
        stat(game, 'abroadOffersUser');
        userOffers++;
        continue;
      }
      // Klub AI: sprzedaje, gdy kwota bliska ceny albo zawodnik prosi o transfer
      // Cena dla zagranicy: wartość x mnożnik reputacji (bez premii 1,45 za niewystawionego); trzech najlepszych po pełnej cenie
      const asking = notForSale(game, p) ? askingPrice(game, p) : round((p.value ?? 0) * askingPriceMultiplier(p.rep ?? 30));
      const sell = !breaksMinimum(game, p) && (p.transferRequest || o.fee >= FOREIGN.sellRatio * asking);
      // Odrzucona oferta: zawodnik dowiaduje się o niej w połowie przypadków (agent, media) [SZAC, kalibracja próśb]
      if (!sell) { if (rng.chance(FOREIGN.leak)) onOfferRejected(game, p, { buyerRep: o.rep, foreignWage: o.wage, date }); continue; }
      startDeal(game, { playerId: p.id, to: null, fee: o.fee, kind: 'abroad', foreign: { country: o.country, countryName: o.countryName, name: o.name, clubId: o.clubId, rep: o.rep, wage: o.wage }, needsTerms: true, date });
    }
  }
  return out;
}

/** List w poczcie: oferta z zagranicy za zawodnika gracza (decyzja jak przy ofercie klubu z Polski). */
export function foreignOfferMessage(game, o, date) {
  const p = game.world.players[o.playerId];
  const f = o.foreign;
  return createMessage({
    date, key: `oferta:${o.id}:${o.fee}`, category: 'transfers', from: f.name, priority: 'important',
    subject: `Oferta z zagranicy za ${p.name}: ${fmtZl(o.fee)}`,
    body: `${f.name} (${f.countryName}) chce kupić ${p.name} (${p.pos}, ${p.age} lat) za ${fmtZl(o.fee)}. Wartość rynkowa: ${fmtZl(p.value)}. Zawodnik zarobiłby ok. ${fmtZl(f.wage)} tygodniowo (teraz ${fmtZl(p.contract?.wage ?? 0)}). Oferta jest ważna do ${fmtDate(o.expires)}. Odrzucenie tak dobrej oferty może skłonić zawodnika do prośby o transfer.`,
    actions: [{ id: 'accept', label: 'Przyjmij' }, ...(o.raised ? [] : [{ id: 'more', label: 'Żądaj więcej' }]), { id: 'reject', label: 'Odrzuć' }],
    refs: { kind: 'incomingOffer', offerId: o.id }, optional: true,
  });
}

