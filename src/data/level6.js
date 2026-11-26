// Poziom 6 (V liga albo klasa okręgowa, docs/iv-liga.md): pula beniaminków IV ligi z plików właściciela
// w src/data/V liga PL (jeden plik na województwo, nazwy w src/data/voivodeships.js). Nazwy nie są kopiowane do kodu:
// loadLevel6() czyta pliki raz (przeglądarka: fetch z tego samego adresu, Node i testy: fs), wynik zostaje w pamięci.
// Gra bierze z pliku tylko to, czego potrzebuje: kilka klubów na województwo jako pula awansu (level6Candidates);
// klub, który awansuje do IV ligi, trafia do zapisu gry (leagueState.extra: nazwa, waga, województwo, znane barwy
// i stadion) i od tej chwili nie zależy od pliku. Brak pliku albo błąd odczytu: pusta pula (utrzymania przy zielonym stoliku).
// Format pliku: nagłówek, potem grupy („GRUPA ...”) i wiersze „nazwa | barwy | stadion | pojemność”. Wartości
// „bialo-czerwono-czarne”, „stadion miejski” i 1200 oznaczają według właściciela brak danych (nie są zapisywane).

import { Rng, hashString } from '../core/rng.js';
import { VOIVODESHIPS, VOIV } from './voivodeships.js';

const DIR = 'V liga PL';
const UNKNOWN = { colors: 'bialo-czerwono-czarne', stadium: 'stadion miejski', cap: 1200 };
/** Klubów z pliku w puli awansu jednego województwa (oprócz spadkowiczów z IV ligi) [SZAC, właściciel: 4-6]. */
export const LEVEL6_POOL = 6;

export const slugify = (s) => s.toLowerCase()
  .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l').replace(/ń/g, 'n')
  .replace(/ó/g, 'o').replace(/ś/g, 's').replace(/[źż]/g, 'z')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Wiersze pliku: [{ name, colors?, stadium?, cap?, group }] (tylko wartości różne od „brak danych”). */
export function parseLevel6(text) {
  const out = [];
  let group = null;
  for (const raw of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    const g = line.match(/^GRUPA\s+(.+)$/i);
    if (g) { group = g[1].trim(); continue; }
    if (!line.includes('|') || /^FORMAT:/i.test(line)) continue;
    const [name, colors = '', stadium = '', cap = ''] = line.split('|').map((x) => x.trim());
    if (!name) continue;
    const e = { name, group };
    if (colors && colors.toLowerCase() !== UNKNOWN.colors) e.colors = colors;
    if (stadium && stadium.toLowerCase() !== UNKNOWN.stadium) e.stadium = stadium;
    const n = Number(cap.replace(/\D/g, ''));
    if (n > 0 && n !== UNKNOWN.cap) e.cap = n;
    out.push(e);
  }
  return out;
}

let CACHE = null; let PENDING = null;
/** Czy pliki poziomu 6 są już w pamięci. */
export const level6Loaded = () => !!CACHE;
/** Wiersze województwa (pusta lista, gdy pliki nie są wczytane albo pliku brak). */
export const level6Entries = (voiv) => CACHE?.[voiv] ?? [];

async function readText(file) {
  const url = new URL(`./${DIR}/${file}`, import.meta.url); // URL koduje spacje w nazwie folderu (%20)
  if (url.protocol === 'file:') { const fs = await import('node:fs/promises'); return fs.readFile(url, 'utf8'); }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  return res.text();
}

/** Wczytuje pliki wszystkich województw raz (kolejne wywołania zwracają ten sam wynik). */
export function loadLevel6() {
  if (CACHE) return Promise.resolve(CACHE);
  PENDING ??= (async () => {
    const out = {};
    await Promise.all(VOIVODESHIPS.map(async (v) => {
      let list = [];
      try { list = parseLevel6(await readText(v.file)); } catch { list = []; } // brak pliku: pusta pula
      out[v.key] = list;
    }));
    // Identyfikatory unikalne w całym kraju (ta sama nazwa w dwóch województwach: przyrostek z województwa)
    const seen = new Set();
    for (const v of VOIVODESHIPS) {
      for (const e of out[v.key]) {
        let id = slugify(e.name);
        if (seen.has(id)) id = `${id}-${v.key}`;
        seen.add(id); e.id = id;
      }
    }
    CACHE = out;
    return out;
  })();
  return PENDING;
}
/** Tylko testy: dane z tekstu zamiast plików ({ voiv: tekst }) albo null (wyczyszczenie pamięci). */
export function setLevel6ForTests(texts) {
  PENDING = null;
  CACHE = texts ? Object.fromEntries(VOIVODESHIPS.map((v) => [v.key, parseLevel6(texts[v.key] ?? '').map((e) => ({ ...e, id: slugify(e.name) }))])) : null;
}

const ABBR = new Set(['KS', 'MKS', 'GKS', 'LKS', 'KKS', 'AKS', 'JKS', 'CRS', 'WKS', 'II', 'UKS', 'MLKS', 'GLKS', 'LZS', 'ŁKS', 'MUKS', 'KP', 'CKS', 'GKP', 'TS', 'SKS', 'LUKS']);
const shortOf = (name) => {
  const tok = name.split(/\s+/)[0];
  if (/^[A-ZĄĆĘŁŃÓŚŹŻ]{3,4}$/.test(tok)) return tok;
  const first = name.split(/\s+/).find((w) => !ABBR.has(w)) ?? name;
  return first.slice(0, 3).toUpperCase();
};
const cityOf = (name) => {
  const words = name.replace(/\(.*?\)/g, ' ').replace(/\//g, ' ').split(/\s+/).filter((w) => w && !ABBR.has(w) && !/^\d{4}$/.test(w));
  return (words.length > 1 ? words.slice(1) : words).join(' ');
};
const COLOR = [
  [/^bia/, '#FFFFFF'], [/^czerw/, '#C8102E'], [/^(żół|zol)/, '#FFD100'], [/^ziel/, '#00843D'], [/^niebiesk/, '#0057B8'],
  [/^granat/, '#0C2340'], [/^czarn/, '#111111'], [/^(błęk|blek)/, '#5BC2E7'], [/^bord/, '#7A1F2B'], [/^(pomarańcz|pomarancz)/, '#F47920'],
];
const colorsOf = (words) => {
  const hex = String(words ?? '').split('-').map((w) => COLOR.find(([re]) => re.test(w.toLowerCase()))?.[1]).filter(Boolean);
  if (hex.length >= 2) return hex.slice(0, 2);
  return hex.length ? [hex[0], hex[0] === '#FFFFFF' ? '#111111' : '#FFFFFF'] : ['#2E8A4E', '#FFFFFF'];
};
/** Waga siły klubu z poziomu 6: 1 albo 2 (L 6,15 albo 6,4, najsłabsze kluby IV ligi) [SZAC]. */
const weightOf = (id) => (hashString(`v-liga:${id}`) % 10 < 6 ? 1 : 2);

/** Dane klubu z poziomu 6 do zapisu gry (leagueState.extra): tylko to, czego nie da się odtworzyć. */
export function level6SaveData(e, voiv) {
  return { name: e.name, voiv, w: weightOf(e.id), ...(e.colors ? { col: e.colors } : {}), ...(e.stadium ? { stadium: e.stadium } : {}), ...(e.cap ? { cap: e.cap } : {}) };
}
/** Pełny obiekt klubu (jak w src/data/clubs_l4.js) z danych zapisu; tier0 = 6. */
export function level6Club(id, d) {
  const city = cityOf(d.name);
  const w = d.w ?? 1;
  return {
    id, name: d.name, short: shortOf(d.name), tier: 6, tier0: 6, group0: null, weight: w,
    L: Math.round((5.9 + 0.25 * w) * 100) / 100, prestige: 1, coach: 'P', colors: colorsOf(d.col), region: slugify(city) || d.voiv, city,
    voiv: d.voiv, l3group: VOIV[d.voiv]?.l3group ?? 1, l6: true,
    ...(d.stadium ? { stadium: d.stadium } : {}), ...(d.cap ? { cap: d.cap } : {}),
  };
}

/**
 * Pula awansu z pliku dla województwa: kolejność losowana raz z ziarna gry, pierwsze `n` klubów, których nie ma
 * jeszcze w grze (known(id, name) -> true). Bez drużyn rezerw (II, III): ich pierwsze drużyny zwykle nie grają w grze.
 */
export function level6Candidates(voiv, seed, known, n = LEVEL6_POOL) {
  const list = level6Entries(voiv).filter((e) => !/\sI{2,3}(\s|$)/.test(e.name));
  const order = new Rng(`v-liga:${seed}:${voiv}`).shuffle(list);
  const out = [];
  for (const e of order) {
    if (out.length >= n) break;
    if (known(e.id, e.name)) continue;
    out.push(e);
  }
  return out;
}
