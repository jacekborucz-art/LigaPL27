// Generuje src/data/clubs_l3.js i src/data/clubs_l4.js z list od użytkownika (tools/data/*.txt).
// Uruchom: node tools/build-lower-leagues.mjs
// Siła L z miejsca w tabeli z Nov 10, 2026 (waga 1-5) [SZAC]; w III lidze łączona z wagą eksperta (D6).
// III liga: oficjalne nazwy, barwy, stadiony i pojemności z pliku właściciela (tools/data/iii_liga_kluby_stadiony.txt).
// Identyfikatory klubów zostają stałe (dopasowanie po nazwie z listy tabel albo po nazwie oficjalnej).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLUBS_PL as PL_ALL } from '../src/data/clubs_pl.js';
import { CLUBS_L3 as OLD_L3 } from '../src/data/clubs_l3.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, 'tools/data', f), 'utf8').replace(/^﻿/, '');
// Kluby z kadrami z clubs_pl.js (bez III ligi, którą clubs_pl.js dołącza do listy klubów z kadrą)
const OLD_IDS = new Set(OLD_L3.map((c) => c.id));
const CLUBS_PL = PL_ALL.filter((c) => !OLD_IDS.has(c.id));

const slug = (s) => s.toLowerCase()
  .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l').replace(/ń/g, 'n')
  .replace(/ó/g, 'o').replace(/ś/g, 's').replace(/[źż]/g, 'z')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function parse(text) {
  const groups = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const g = line.match(/GRUPA\s+(.+?)(?:\s+\(\d+ drużyn\))?$/i);
    if (g) { cur = { name: g[1].replace(/^\d+\s*[–-]\s*/, '').trim(), clubs: [] }; groups.push(cur); continue; }
    const c = line.match(/^\s*(\d+)\.\s+(.+?)\s*$/);
    if (c && cur) cur.clubs.push({ pos: Number(c[1]), name: c[2] });
  }
  return groups;
}

// ------------------------------------------------------------ Plik właściciela: nazwy, barwy, stadiony
const COLOR = [
  [/^bia/, '#FFFFFF'], [/^czerw/, '#C8102E'], [/^(żół|zol)/, '#FFD100'], [/^ziel/, '#00843D'], [/^niebiesk/, '#0057B8'],
  [/^granat/, '#0C2340'], [/^czarn/, '#111111'], [/^błęk/, '#5BC2E7'], [/^bord/, '#7A1F2B'], [/^pomarańcz/, '#F47920'],
];
function colorsOf(words) {
  const hex = words.split('-').map((w) => COLOR.find(([re]) => re.test(w.toLowerCase()))?.[1]).filter(Boolean);
  if (hex.length >= 2) return hex.slice(0, 2);
  return hex.length ? [hex[0], hex[0] === '#FFFFFF' ? '#111111' : '#FFFFFF'] : ['#2E8A4E', '#FFFFFF'];
}
function parseOwner(text) {
  const out = [];
  let group = 0;
  for (const line of text.split(/\r?\n/)) {
    if (/^Grupa\s+[IVX]+/i.test(line)) { group++; continue; }
    if (/^Uwagi/i.test(line)) break;
    const m = line.match(/^(.+?)\s+\(([^)]+)\)\s+[–-]\s+(.+?)\s+\(([\d\s ]+)\s+miejsc\)\s*$/);
    if (!m || !group) continue;
    out.push({ group, name: m[1].trim(), colors: colorsOf(m[2].trim()), colorWords: m[2].trim(), stadium: m[3].trim(), cap: Number(m[4].replace(/\D/g, '')) });
  }
  return out;
}
// Klucz dopasowania: bez skrótów organizacyjnych, roku założenia i nazwy sponsora
const DROP = new Set(['ks', 'ck', 'kts', 'aks', 'jks', 'kks', 'mks', 'lks', 'panattoni']);
const key = (name) => slug(name).split('-').filter((t) => t && !DROP.has(t) && !/^\d{4}$/.test(t)).join('-');

const weightFromPos = (pos, n) => { const q = (pos - 1) / Math.max(1, n - 1); return q < 0.17 ? 5 : q < 0.34 ? 4 : q < 0.67 ? 3 : q < 0.84 ? 2 : 1; };
const byName = new Map(CLUBS_PL.map((c) => [c.name.toLowerCase(), c]));
const oldL3 = new Map(OLD_L3.flatMap((c) => [[c.name.toLowerCase(), c], ...(c.aka ? [[c.aka.toLowerCase(), c]] : [])]));
const used = new Set(CLUBS_PL.map((c) => c.id));

function parentOf(name, all) {
  if (!/\sII(\s|$)/.test(name)) return null;
  const base = name.replace(/\sII(\s|$)/, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const hit = byName.get(base) ?? all.find((c) => c.name.toLowerCase() === base);
  return hit?.id ?? PARENT_ALIAS[slug(base)] ?? slug(base);
}

const ABBR = new Set(['KS', 'MKS', 'GKS', 'LKS', 'KKS', 'AKS', 'JKS', 'CRS', 'WKS', 'II', 'UKS', 'MLKS', 'GLKS', 'LZS']);
function short(name) {
  const words = name.split(/\s+/).filter((w) => !ABBR.has(w));
  const first = words[0] ?? name;
  // Skróty klubowe (ŁKS, ROW, KSZO) zostają w całości, gdy są pierwszym słowem nazwy
  const tok = name.split(/\s+/)[0];
  if (/^[A-ZĄĆĘŁŃÓŚŹŻ]{3,4}$/.test(tok) && !['II'].includes(tok)) return tok;
  return first.slice(0, 3).toUpperCase();
}
// Miejscowość z nazwy (do derbów i prasy lokalnej): bez skrótów, „II”, roku i pierwszego słowa (nazwy klubu)
function cityOf(name) {
  const words = name.replace(/\//g, ' ').split(/\s+/).filter((w) => !ABBR.has(w) && !/^\d{4}$/.test(w) && !['CK', 'KTS', 'Panattoni'].includes(w));
  const rest = words.length > 1 ? words.slice(1) : words;
  return rest.join(' ');
}
const PARENT_ALIAS = { 'termalica-nieciecza': 'termalica', 'pogon-szczecin': 'pogon-szczecin' };
// Grupy IV ligi (województwa) w grupach III ligi (PZPN 2026/27)
const L3_GROUP_OF_REGION = {
  lodzka: 1, mazowiecka: 1, podlaska: 1, 'warminsko-mazurska': 1,
  'kujawsko-pomorska': 2, pomorska: 2, wielkopolska: 2, zachodniopomorska: 2,
  dolnoslaska: 3, lubuska: 3, opolska: 3, slaska: 3,
  lubelska: 4, malopolska: 4, podkarpacka: 4, swietokrzyska: 4,
};
const COACH = ['P', 'O', 'S'];
const hash = (s) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

function build(file, tier, baseL, step) {
  const groups = parse(read(file));
  const out = [];
  groups.forEach((g, gi) => {
    for (const c of g.clubs) {
      const old = oldL3.get(c.name.toLowerCase());
      let id = old?.id ?? slug(c.name);
      if (!old) { let k = 2; const b = id; while (used.has(id)) id = `${b}-${k++}`; }
      used.add(id);
      const wPos = weightFromPos(c.pos, g.clubs.length);
      const weight = old ? Math.max(old.weight, wPos) : wPos;
      const region = slug(g.name.split(/[ /]/)[0]);
      const city = cityOf(c.name);
      out.push({
        id, name: c.name, short: short(c.name), tier, group: gi + 1, groupName: g.name, weight,
        L: Math.round((baseL + step * weight) * 100) / 100, prestige: 1 + Math.round(weight / 2), coach: tier === 4 ? COACH[hash(id) % 3] : 'P',
        colors: ['#2E8A4E', '#FFFFFF'], region: slug(city) || region, city,
        ...(tier === 5 ? { voiv: region, l3group: L3_GROUP_OF_REGION[region] ?? 1 } : {}),
      });
    }
  });
  for (const c of out) { const p = parentOf(c.name, out); if (p) c.parent = p; }
  return { out, groups: groups.length };
}

// III liga: siła skalibrowana tak, żeby najlepsze drużyny były słabsze od średniej 2 Ligi (L ok. 8,5) [SZAC]
const l3 = build('3_liga_2026_2027.txt', 4, 6.75, 0.23);
const l4 = build('4_liga_2026_2027.txt', 5, 5.9, 0.25);

// Dane właściciela: nazwa oficjalna (wyświetlana), barwy, stadion, pojemność
const owner = parseOwner(read('iii_liga_kluby_stadiony.txt'));
const missing = [];
for (const c of l3.out) {
  const hit = owner.find((o) => o.group === c.group && key(o.name) === key(c.name));
  if (!hit) { missing.push(c.name); continue; }
  hit.used = true;
  if (hit.name !== c.name) c.aka = c.name; // nazwa z listy tabel (do dopasowań przy kolejnych generacjach)
  c.name = hit.name; c.colors = hit.colors; c.stadium = hit.stadium; c.cap = hit.cap;
  c.city = cityOf(c.name); c.region = slug(c.city) || c.region;
}
const unused = owner.filter((o) => !o.used).map((o) => o.name);
if (missing.length || unused.length || owner.length !== 72) {
  console.error('Niedopasowane kluby III ligi:', { missing, unused, owner: owner.length });
  process.exit(1);
}

// IV liga (docs/iv-liga.md, decyzja właściciela D11): plik właściciela tools/data/iv_liga_kluby_stadiony.txt (tekst z docx
// „Kluby IV ligi polskiej 2026 2027”). Nazwy i identyfikatory bez zmian. Barwy dla każdego dopasowanego klubu; stadion
// i pojemność tylko dla wpisów konkretnych (nazwa obiektu, nie „Boisko w X” / „Stadion Miejski w X”, i pojemność
// niezaokrąglona do setek): 57 wpisów. Niedopasowane wpisy (inna nazwa w liście tabel) zostają bez zmian i są wypisane.
const DROP4 = new Set([...DROP, 'gks', 'uks', 'lzs', 'mlks', 'glks', 'wks', 'crs']);
const key4 = (name) => slug(name).split('-').filter((t) => t && !DROP4.has(t) && !/^\d{4}$/.test(t)).join('-');
const genericStadium = (s) => /^(Boisko|Stadion( Gminny| Miejski| Leśny| Miejsko-Gminny)?|Kompleks Sportowy|Gminny Kompleks Sportowy) w(e)? [^,]+$/.test(s);
const owner4 = parseOwner(read('iv_liga_kluby_stadiony.txt'));
// Nazwy potwierdzone przez właściciela (Nov 26, 2026); identyfikatory bez zmian (zapisy gry)
const RENAME4 = { 'piast-ilowa': 'KP Piast Iłowa', 'radomyslanka-radomysl': 'Radomyślanka Radomyśl Wielki', 'iskierka-szczecin': 'Iskierka Śmierdnica', 'gks-manowo': 'GKS Leśnik Manowo' };
for (const c of l4.out) if (RENAME4[c.id]) c.name = RENAME4[c.id];
// Ten sam klub pod inną nazwą w pliku właściciela
const ALIAS4 = { 'GKS Raciborowice': 'Cement Raciborowice', 'Bruk-Bet Termalica II Nieciecza': 'Termalica II Nieciecza' };
const unmatched4 = []; let stadiums4 = 0; let colors4 = 0;
for (const o of owner4) {
  const c = l4.out.find((x) => x.group === o.group && key4(x.name) === key4(ALIAS4[o.name] ?? o.name));
  if (!c) { unmatched4.push(`grupa ${o.group}: ${o.name}`); continue; }
  c.colors = o.colors; colors4++;
  if (!genericStadium(o.stadium) && o.cap % 100 !== 0) { c.stadium = o.stadium; c.cap = o.cap; stadiums4++; }
}
console.log(`IV liga, plik właściciela: ${owner4.length} wpisów, barwy ${colors4}, stadiony ${stadiums4}, bez dopasowania ${unmatched4.length}:\n  ${unmatched4.join('\n  ')}`);

const header = (t, n, g, extra) => `// WYGENEROWANO: node tools/build-lower-leagues.mjs (źródło: tools/data). Nie edytuj ręcznie.\n// ${t}: ${n} drużyn w ${g} grupach. ${extra} Siła L [SZAC].\n`;
fs.writeFileSync(path.join(root, 'src/data/clubs_l3.js'), `${header('III liga 2026/27', l3.out.length, l3.groups, 'Stałe kadry (od wersji z grywalną III ligą); nazwy, barwy, stadiony i pojemności z tools/data/iii_liga_kluby_stadiony.txt.')}\nexport const CLUBS_L3 = [\n${l3.out.map((c) => `  ${JSON.stringify(c)},`).join('\n')}\n];\n`);
fs.writeFileSync(path.join(root, 'src/data/clubs_l4.js'), `${header('IV liga 2026/27', l4.out.length, l4.groups, 'Kadry losowane na mecz (src/world/ephemeral.js); l3group: grupa III ligi województwa; barwy i część stadionów z tools/data/iv_liga_kluby_stadiony.txt.')}\nexport const CLUBS_L4 = [\n${l4.out.map((c) => `  ${JSON.stringify(c)},`).join('\n')}\n];\n`);
console.log(`III liga: ${l3.out.length} drużyn (${l3.out.filter((c) => c.parent).length} rezerw), IV liga: ${l4.out.length} drużyn (${l4.out.filter((c) => c.parent).length} rezerw)`);
