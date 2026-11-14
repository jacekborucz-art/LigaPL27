// Generator świata: kadry 54 polskich klubów (z rezerwami) i akademie.
// Każdy klub ma własny strumień losowy (rng.fork), więc zmiana jednego klubu nie zmienia innych.
// Kluby zagraniczne nie mają stałych kadr: kadra powstaje na mecz (PLAN 1, etap 8).

import { Rng } from '../core/rng.js';
import { CLUBS_PL } from '../data/clubs_pl.js';
import { pickNationality } from '../data/names.js';
import { genPlayer } from './playerGen.js';
import { GAME_START } from '../config/calendar2026.js';

// Kadra 25 zawodników: [pozycja, strona]. Gwarancje: 3 BR, 8 obrońców (w tym 2 lewych), 9 pomocników, 5 napastników.
export const SQUAD_LAYOUT = [
  ['BR'], ['BR'], ['BR'],
  ['ŚO'], ['ŚO'], ['ŚO'], ['ŚO'],
  ['BO', 'L'], ['BO', 'P'], ['BO', 'L'], ['BO', 'P'],
  ['DP'], ['DP'], ['ŚP'], ['ŚP'], ['ŚP'], ['OP'], ['OP'],
  ['BP', 'L'], ['BP', 'P'],
  ['SN', 'L'], ['SN', 'P'],
  ['NAP'], ['NAP'], ['NAP'],
];

// Podstawowa jedenastka domyślnej formacji 4-2-3-1 i ławka (offsety jakości z ekspert 1.3).
const XI = { BR: 1, ŚO: 2, BO: 2, DP: 2, OP: 1, SN: 2, NAP: 1 };
const BENCH = { BR: 1, ŚO: 1, BO: 1, ŚP: 2, BP: 1, NAP: 1 };
const ACADEMY_SIZE = 7;

function ageFor(role, rng) {
  if (role === 'xi') return rng.weighted([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32], (a) => (a >= 24 && a <= 29 ? 3 : 1.2));
  if (role === 'bench') return rng.int(20, 33);
  if (role === 'youth') return rng.int(17, 19);
  return rng.weighted([19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34], (a) => (a <= 22 ? 1.5 : a >= 32 ? 0.6 : 1));
}

export function generateClubSquad(club, rootRng, date) {
  const rng = rootRng.fork(`klub:${club.id}`);
  const used = {};
  const players = [];
  let youthLeft = 2;
  const reserves = !!club.parent;
  SQUAD_LAYOUT.forEach(([pos, side], i) => {
    used[pos] = (used[pos] ?? 0) + 1;
    const n = used[pos];
    let role = 'rest';
    if (!reserves) {
      if (n <= (XI[pos] ?? 0)) role = 'xi';
      else if (n <= (XI[pos] ?? 0) + (BENCH[pos] ?? 0)) role = 'bench';
      else if (youthLeft > 0 && pos !== 'BR') { role = 'youth'; youthLeft--; }
    }
    // Rezerwy: 75 % zawodników 17-21 lat, kilku starszych dla doświadczenia (PLAN 6).
    const age = reserves ? (rng.chance(0.75) ? rng.int(17, 21) : rng.int(23, 30)) : ageFor(role, rng);
    // Offsety ekspert 1.3 przesunięte o -0.4: najlepsza jedenastka z 25 zawodników wypada wtedy ok. L+0.3.
    const slotOffset = reserves ? (age <= 21 ? -0.4 : 0) : { xi: -0.1, bench: -0.9, rest: -1.4, youth: -1.0 }[role];
    const nat = reserves && rng.chance(0.85) ? 'POL' : pickNationality(club.tier, rng);
    players.push(genPlayer(rng, {
      id: `${club.id}-${i + 1}`, L: club.L, pos, age, slotOffset, nat, tier: club.tier, side: side ?? null, club, date,
    }));
  });
  const academy = [];
  for (let i = 0; i < ACADEMY_SIZE; i++) {
    const [pos, side] = rng.pick(SQUAD_LAYOUT);
    const age = rng.int(16, 18);
    const p = genPlayer(rng, { id: `${club.id}-a${i + 1}`, L: club.L, pos, age, slotOffset: -1.0, nat: 'POL', tier: club.tier, side: side ?? null, club, date });
    p.squad = 'Y';
    academy.push(p);
  }
  return { players, academy };
}

/** Cały świat na start gry. Zwraca { players: {id: p}, clubs: {id: { squad: [ids], academy: [ids] }} }. */
export function generateWorld(seed, { date = GAME_START, clubs = CLUBS_PL } = {}) {
  const root = new Rng(seed);
  const world = { generatedAt: date, players: {}, clubs: {} };
  for (const club of clubs) {
    const { players, academy } = generateClubSquad(club, root, date);
    for (const p of [...players, ...academy]) world.players[p.id] = p;
    world.clubs[club.id] = { squad: players.map((p) => p.id), academy: academy.map((p) => p.id) };
  }
  return world;
}

export function squadOf(world, clubId) {
  return (world.clubs[clubId]?.squad ?? []).map((id) => world.players[id]);
}

export function academyOf(world, clubId) {
  return (world.clubs[clubId]?.academy ?? []).map((id) => world.players[id]);
}
