// Rotacja dyrektorów sportowych poza 1 lipca (docs/dyrektor-sportowy.md, rozdz. 10), bardzo rzadko, gracz i AI te same
// zasady: kluby AI podbierają dyrektorów innym klubom (oferta jak przy sztabie: zgoda osoby, rekompensata albo
// blokada zarządu, limity prób), dyrektor sam rezygnuje (lepsza oferta, konflikt, rodzina, emerytura), właściciel
// zwalnia dyrektora bez prośby trenera (konflikt, oszczędności, słaby rynek transferowy). Klub gracza dostaje list;
// wakat obsadza zarząd jak dotąd (staffMarket.js aiDirectorWeek, poniedziałek). Przegląd raz w tygodniu (poniedziałek).
// Wszystkie liczby [SZAC], kalibracja: tools/transfery-kalibracja.mjs.

import { Rng, clamp } from '../core/rng.js';
import { registerDailySystem } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { CLUBS_PL, clubById } from '../data/clubs_pl.js';
import { DIRECTOR_ROLE } from '../training/config.js';
import { clubReputation } from './reputation.js';
import { negMean } from './clubNegotiation.js';
import { fmtDate } from '../ui/dom.js';
import {
  STAFF_MARKET as K, directorOf, personAttr, seenQuality, budgetRoomFor, makeOffer, aiWage, poachBlocker, poachCompensation,
  dropDirector, ownerReplaceDirector, ownerLetter, toPool, removePerson, closeHist, logDirectorMove,
} from './staffMarket.js';

export const ROT = {
  // Rezygnacja 2,5 % na sezon na klub, zwolnienie przez właściciela 2 % (na tydzień: 1 - (1 - p)^(1/52))
  resign: 0.025, fire: 0.02,
  fresh: { resign: 90, fire: 180 }, // dni od zatrudnienia bez rezygnacji i bez zwolnienia
  // Podebranie: w tygodniach w okolicach okien (miesiące jak przy sztabie) z szansą 30 % jeden klub AI ze słabszym niż
  // przeciętny w lidze dyrektorem szuka dyrektora w klubie o co najmniej 15 punktów reputacji niższym; kandydat lepszy
  // od obecnego o 2 i nie słabszy od średniej ligi, najbliżej poziomu ligi (bez dryfu Negocjacji w górę).
  // Zarząd obecnego klubu blokuje odejście z szansą 50 % (wtedy dyrektor może zerwać umowę jak sztab).
  poachWeek: 0.3, gain: 2, block: 0.5, maxTiers: 3,
  // Powody rezygnacji (wagi; emerytura od 60 lat) i zwolnienia (oszczędności częściej przy ujemnym saldzie,
  // słaby rynek częściej przy niskiej Znajomości rynku)
  resignWhy: { oferta: 1.2, konflikt: 1, rodzina: 0.8, emerytura: 3 }, retireAge: 60,
  fireWhy: { konflikt: 1, oszczednosci: 0.8, rynek: 1 },
};

const weekly = (p) => 1 - (1 - p) ** (1 / 52);
const isMonday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay() === 1;
const daysSince = (a, b) => (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000;
const nameOf = (id) => clubById(id)?.name ?? id;
const fmtZl = (v) => `${Math.round(v).toLocaleString('pl-PL')} zł`;

function pick(rng, weights) {
  const e = Object.entries(weights).filter(([, w]) => w > 0);
  let r = rng.next() * e.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of e) { r -= w; if (r <= 0) return k; }
  return e.at(-1)[0];
}

/** Wiadomość w Mediach o zmianie dyrektora w klubie AI (mailFilter: tylko liga gracza, klucz „dyrektor:”). */
const media = (date, id, subject, body) => createMessage({ date, key: `dyrektor:${id}:rot:${date}`, category: 'media', from: 'Media', priority: 'info', subject, body });

// ------------------------------------------------------------ Rezygnacja

const RESIGN_TXT = {
  oferta: 'przyjąłem propozycję pracy poza polską ligą (federacja i zagraniczny klub)',
  konflikt: 'nie widzę dalej wspólnej drogi z zarządem klubu',
  rodzina: 'muszę zająć się sprawami rodzinnymi',
  emerytura: 'po latach pracy przechodzę na emeryturę',
};

/** Dyrektor rezygnuje: konflikt = lista wolnych dyrektorów, pozostałe powody = odchodzi z polskiej piłki. Bez odprawy. */
export function directorResigns(game, clubId, date, why) {
  const S = game.staff;
  const p = directorOf(game, clubId);
  if (!p) return [];
  logDirectorMove(game, { date, kind: 'resign', pid: p.id, name: p.name, from: clubId, why });
  if (why === 'konflikt') toPool(game, p, date, 'rezygnacja');
  else { closeHist(p, date, 'rezygnacja'); removePerson(S, p); }
  if (clubId === game.clubId) {
    return [createMessage({
      date, key: `dyrektor-rezygnacja:${clubId}:${date}`, category: 'board', from: `${p.name}, dyrektor sportowy`, priority: 'important',
      subject: `Dyrektor sportowy rezygnuje: ${p.name}`,
      body: `Panie Trenerze, z dniem dzisiejszym rezygnuję z funkcji dyrektora sportowego: ${RESIGN_TXT[why] ?? 'takie są moje powody'}. Dziękuję za współpracę.\n\nDo wyboru następcy obowiązki dyrektora przejmuje zarząd. Nowego dyrektora zarząd wybierze w ciągu tygodnia.`,
    })];
  }
  const n = nameOf(clubId);
  return [media(date, clubId, `${n}: dyrektor sportowy rezygnuje`, `${p.name} nie jest już dyrektorem sportowym klubu ${n} (${why === 'emerytura' ? 'emerytura' : why === 'rodzina' ? 'sprawy rodzinne' : why === 'oferta' ? 'praca poza polską ligą' : 'konflikt z zarządem'}).`)];
}

// ------------------------------------------------------------ Zwolnienie przez właściciela

const FIRE_TXT = {
  konflikt: 'doszło do konfliktu między dyrektorem a właścicielem klubu',
  oszczednosci: 'klub szuka oszczędności, a właściciel uznał, że ta funkcja kosztuje za dużo',
  rynek: 'właściciel jest niezadowolony z pracy dyrektora na rynku transferowym',
};

/** Właściciel zwalnia dyrektora (odprawa z kasy klubu). Klub gracza: zarząd od razu wybiera następcę, list do gracza. */
export function ownerFiresDirector(game, clubId, date, why) {
  const S = game.staff;
  const p = directorOf(game, clubId);
  if (!p) return [];
  logDirectorMove(game, { date, kind: 'fire', pid: p.id, name: p.name, from: clubId, why });
  if (clubId === game.clubId) {
    const r = ownerReplaceDirector(game, clubId, date, { why: 'zwolnienie przez właściciela' });
    return [ownerLetter(game, date, `dyrektor-zwolnienie:${clubId}:${date}`, `Zarząd zwalnia dyrektora sportowego: ${p.name}`,
      `właściciel klubu postanowił rozstać się z dyrektorem sportowym ${p.name}: ${FIRE_TXT[why]}. Decyzja nie wynika z Pańskiej prośby. Odprawa: ${fmtZl(r.cost)} z kasy klubu. Nowym dyrektorem sportowym jest ${r.fresh.name} (umowa do ${fmtDate(r.fresh.until)}). Atrybuty: Trening, Sztab.`)];
  }
  dropDirector(game, S, clubId, date, { why: 'zwolnienie przez właściciela' });
  const n = nameOf(clubId);
  return [media(date, clubId, `${n}: dyrektor sportowy zwolniony`, `Właściciel klubu ${n} zwolnił dyrektora sportowego ${p.name} (${why === 'oszczednosci' ? 'oszczędności' : why === 'rynek' ? 'słabe ruchy transferowe' : 'konflikt'}). Następcę klub wybierze w najbliższych dniach.`)];
}

// ------------------------------------------------------------ Podebranie przez klub AI

/**
 * Klub AI próbuje zatrudnić dyrektora innego klubu (także klubu gracza): kandydat z klubu o niższej reputacji, lepszy
 * od obecnego dyrektora, pensja o 15 % wyższa. Zarząd obecnego klubu zgadza się (rekompensata 3 pensje) albo blokuje
 * (50 %); decyzję podejmuje osoba po 2-3 dniach (staffMarket.js decideDay, te same zasady co sztab).
 */
export function aiPoachDirector(game, date, rng) {
  const S = game.staff;
  const ids = Object.keys(S.dirInit ?? {}).filter((id) => game.world.clubs[id] && clubById(id));
  const buyers = rng.shuffle(ids.filter((id) => id !== game.clubId && (clubById(id).tier ?? 4) <= ROT.maxTiers && directorOf(game, id)));
  for (const buyer of buyers) {
    if (S.offers.some((o) => o.club === buyer && o.role === DIRECTOR_ROLE)) continue;
    const own = directorOf(game, buyer);
    const target = negMean(buyer);
    if (own.q >= target) continue; // szuka tylko klub ze słabszym dyrektorem niż przeciętny w jego lidze
    const rep = clubReputation(clubById(buyer));
    const need = Math.max(own.q + ROT.gain, target);
    const room = budgetRoomFor(game, buyer, DIRECTOR_ROLE) + own.wage;
    let best = null;
    for (const id of ids) {
      if (id === buyer) continue;
      const p = directorOf(game, id);
      if (!p || S.decide[p.id] || p.age + 1 >= K.pool.noRenewAge) continue;
      if (clubReputation(clubById(id)) > rep - K.poach.aiRepGap) continue;
      if (poachBlocker(game, S, buyer, p, date)) continue;
      const seen = seenQuality(game, p, buyer).v;
      if (seen < need) continue;
      const wage = Math.max(aiWage(game, buyer, p, date), Math.round(p.wage * K.poach.aiWageGain / 100) * 100);
      if (wage > room) continue;
      const score = seen - K.ai.over * Math.max(0, seen - target - 1); // jak przy sztabie: bez przepłacania za klasę ponad potrzebę
      if (!best || score > best.score) best = { p, wage, seen, score };
    }
    if (!best) continue;
    const { p } = best;
    const from = p.club;
    const blocked = new Rng(`dyrektor-blokada:${game.seed}:${p.id}:${date}`).chance(ROT.block);
    const prevBlock = S.block[p.id];
    if (!prevBlock) S.block[p.id] = { club: from, blocked }; // zarząd obecnego klubu (także klubu gracza) decyduje sam
    const r = makeOffer(game, { pid: p.id, wage: best.wage, years: (clubById(buyer).tier ?? 4) === 1 ? 2 : 1, clubId: buyer, date });
    if (!r.ok) { if (!prevBlock) delete S.block[p.id]; continue; }
    logDirectorMove(game, { date, kind: 'poachTry' });
    if (from !== game.clubId) return [];
    const b = S.block[p.id]?.blocked;
    return [ownerLetter(game, date, `dyrektor-podbieranie:${p.id}:${date}`, `${nameOf(buyer)} chce zatrudnić naszego dyrektora sportowego`,
      `${nameOf(buyer)} złożył ofertę naszemu dyrektorowi sportowemu ${p.name}. ${b
        ? `Zarząd nie zgadza się na odejście. ${p.name} zwykle zostaje, ale może zerwać umowę; wtedy ${nameOf(buyer)} zapłaci karę.`
        : `Zarząd zgadza się na odejście, jeśli ${p.name} przyjmie ofertę (rekompensata ${fmtZl(poachCompensation(p))}).`} Decyzja do ${fmtDate(S.decide[p.id])}. Gdy odejdzie, zarząd wybierze następcę.`)];
  }
  return [];
}

// ------------------------------------------------------------ Tydzień

/** Poniedziałek: rezygnacje, zwolnienia przez właściciela i próba podebrania (kluby z kadrą, gracz i AI). */
export function directorRotationWeek(game, date) {
  const S = game.staff;
  if (!S?.dirInit || !game.world?.clubs) return [];
  const out = [];
  const pr = weekly(ROT.resign); const pf = weekly(ROT.fire);
  for (const id of Object.keys(S.dirInit)) {
    if (!game.world.clubs[id] || !clubById(id)) continue;
    const p = directorOf(game, id);
    if (!p || S.decide[p.id]) continue;
    const since = p.since ? daysSince(p.since, date) : 999;
    const rng = new Rng(`dyrektor-rotacja:${game.seed}:${id}:${p.id}:${date}`);
    if (since >= ROT.fresh.resign && rng.chance(pr)) {
      const why = pick(rng, { ...ROT.resignWhy, emerytura: p.age >= ROT.retireAge ? ROT.resignWhy.emerytura : 0 });
      out.push(...directorResigns(game, id, date, why));
      continue;
    }
    if (since >= ROT.fresh.fire && rng.chance(pf)) {
      const bal = game.finance?.clubs?.[id]?.balance ?? 0;
      const ryn = personAttr(p, 'RYN', date);
      const why = pick(rng, { konflikt: ROT.fireWhy.konflikt, oszczednosci: ROT.fireWhy.oszczednosci * (bal < 0 ? 2 : 1), rynek: ROT.fireWhy.rynek * clamp(1 + (10 - ryn) / 5, 0.4, 2.8) });
      out.push(...ownerFiresDirector(game, id, date, why));
    }
  }
  const m = +date.slice(5, 7);
  const rng = new Rng(`dyrektor-podbieranie:${game.seed}:${date}`);
  if (K.poach.months.includes(m) && rng.chance(ROT.poachWeek)) out.push(...aiPoachDirector(game, date, rng));
  return out;
}

/** Liczniki zmian dyrektorów poza 1 lipca w sezonie (rok startu sezonu): { poachTry, poach, resign, fire }. */
export const rotationStats = (game, year) => game.staff?.dirRot?.[year] ?? { poachTry: 0, poach: 0, resign: 0, fire: 0 };

registerDailySystem({
  id: 'directorRotation', order: 59, // po rynku sztabu (58): wakaty po rotacji obsadza aiDirectorWeek w kolejny poniedziałek
  run(game, date) {
    if (!game.world || !game.season || !game.staff || !isMonday(date)) return {};
    return { messages: directorRotationWeek(game, date) };
  },
});

