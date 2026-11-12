// Właściciele klubów: profil osobowości (docs/trenerzy-i-wlasciciele.md). Nazwa i typ właściciela pochodzą
// z modelu finansów (src/data/finanse_klubow.js, plan.ownerName i plan.ownerType), cechy 1-20 losowane
// deterministycznie z ziarna gry, klubu i właściciela, ze średnimi zależnymi od typu właściciela.
//   cierpliwosc  ile czasu daje trenerowi przy słabych wynikach (wysoka: później zwalnia)
//   ambicja      jak wysoko stawia cel (wysoka: oczekuje miejsca wyżej, mocniej przeżywa odpadnięcie z pucharów)
//   temperament  porywczość: krótkie serie porażek ważą więcej, decyzje mniej przewidywalne
//   media        wrażliwość na kibiców i media (miasto: także polityka)
//   zasobnosc    pieniądze właściciela (z dopłat i skarbca w finansach): lepszy trener na rynku, łatwiejsza odprawa
// Klub gracza: profil tylko do wiadomości (decyzje o graczu podejmuje zarząd, src/career/board.js).
// Wszystkie liczby [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { clubById } from '../data/clubs_pl.js';
import { clubFinanceData } from '../data/finanse_klubow.js';

export const OWNER_KEYS = ['cierpliwosc', 'ambicja', 'temperament', 'media', 'zasobnosc'];

/** Średnie cech według typu właściciela [SZAC] (docs/trenerzy-i-wlasciciele.md, rozdz. 3). */
export const OWNER_TYPES = {
  miliarder: { cierpliwosc: 7, ambicja: 16, temperament: 13, media: 10, label: 'bogaty właściciel' },
  prywatny: { cierpliwosc: 10, ambicja: 11, temperament: 11, media: 10, label: 'właściciel prywatny' },
  miasto: { cierpliwosc: 10, ambicja: 9, temperament: 9, media: 14, label: 'miasto' },
  spolka: { cierpliwosc: 11, ambicja: 10, temperament: 8, media: 12, label: 'spółka' },
  klub: { cierpliwosc: 16, ambicja: 5, temperament: 5, media: 4, label: 'pierwsza drużyna (rezerwy)' },
};

/**
 * Korekty dla właścicieli, których zachowanie wobec trenerów jest dobrze opisane publicznie (liczba zmian trenerów
 * w ostatnich sezonach, docs/trenerzy-i-wlasciciele.md, rozdz. 3.3). To interpretacja na potrzeby gry, nie ocena osób.
 */
const KNOWN = {
  legia: { cierpliwosc: 5, ambicja: 17, temperament: 13 }, // 11 zmian trenera w 7 lat (meczyki.pl)
  widzew: { cierpliwosc: 5, ambicja: 18, temperament: 14 }, // 2025/26: dwie zmiany jesienią
  rakow: { cierpliwosc: 8, ambicja: 18 }, // długo z jednym trenerem, potem kilka zmian w krótkim czasie
  wieczysta: { cierpliwosc: 4, ambicja: 18, temperament: 15 }, // zmiana trenera przy 2. miejscu w 1 Lidze (2025)
  'pogon-szczecin': { cierpliwosc: 7, temperament: 13 },
  jagiellonia: { cierpliwosc: 15, temperament: 7 }, // stabilny pion sportowy, mistrzostwo 2024
  lech: { cierpliwosc: 12, temperament: 8 },
};

/** Zasobność 1-20 z pieniędzy właściciela w finansach (dopłata na sezon + skarbiec, mln zł). */
export function ownerWealth(data) {
  const money = (data?.wlasciciel?.doplata ?? 0) + (data?.wlasciciel?.skarbiec ?? 0);
  return clamp(Math.round(5 + 4 * Math.log2(1 + money / 2)), 1, 20);
}

/** Nowy profil właściciela (deterministycznie). */
export function generateOwner(seed, clubId) {
  const club = clubById(clubId);
  const data = clubFinanceData(club ?? clubId);
  const w = data?.wlasciciel ?? {};
  const type = OWNER_TYPES[w.typ] ? w.typ : 'miasto';
  const name = w.kto || OWNER_TYPES[type].label;
  const base = { ...OWNER_TYPES[type], ...(KNOWN[clubId] ?? {}) };
  const rng = new Rng(`wlasciciel:${seed}:${clubId}:${name}`);
  const sd = KNOWN[clubId] ? 1.2 : 2.6;
  const t = (k) => clamp(Math.round(base[k] + rng.gauss(0, sd)), 1, 20);
  return { name, type, cierpliwosc: t('cierpliwosc'), ambicja: t('ambicja'), temperament: t('temperament'), media: t('media'), zasobnosc: ownerWealth(data) };
}

/** Profil właściciela klubu ze stałą kadrą (zapis w game.owners, tworzony przy pierwszym użyciu). */
export function ownerOf(game, clubId) {
  if (!game) return null;
  if (!game.world?.clubs?.[clubId]) return generateOwner(game.seed, clubId);
  const all = (game.owners ??= {});
  return all[clubId] ?? (all[clubId] = generateOwner(game.seed, clubId));
}

/** Jedno zdanie o właścicielu bez liczb, np. „Ambitny i niecierpliwy, wrażliwy na nastroje kibiców”. */
export function ownerBlurb(o) {
  if (!o) return '';
  if (o.type === 'klub') return 'Rezerwy: liczy się rozwój młodych zawodników, wynik jest mniej ważny.';
  const parts = [];
  if (o.ambicja >= 15) parts.push('ambitny'); else if (o.ambicja <= 6) parts.push('stawia skromne cele');
  if (o.cierpliwosc <= 6) parts.push('niecierpliwy'); else if (o.cierpliwosc >= 14) parts.push('cierpliwy wobec trenerów');
  if (o.temperament >= 14) parts.push('porywczy'); else if (o.temperament <= 6 && parts.length < 2) parts.push('spokojny');
  const tail = [];
  if (o.media >= 14) tail.push(o.type === 'miasto' ? 'wrażliwy na głos kibiców i lokalnej polityki' : 'wrażliwy na głos kibiców i mediów');
  if (o.zasobnosc >= 15) tail.push('ma pieniądze na drogiego trenera');
  else if (o.zasobnosc <= 6) tail.push('nie dokłada dużych pieniędzy z własnej kieszeni');
  if (!parts.length && !tail.length) return 'Rozważny: ocenia trenera po całym sezonie, a nie po kilku meczach.';
  const head = parts.length ? parts.join(' i ').replace(/^./, (c) => c.toUpperCase()) : '';
  const s = head ? `${head}${tail.length ? `, ${tail.join(', ')}` : ''}.` : `${tail.join(', ').replace(/^./, (c) => c.toUpperCase())}.`;
  return s.replace(/ i ([^ ]+) i /, ', $1 i ');
}
