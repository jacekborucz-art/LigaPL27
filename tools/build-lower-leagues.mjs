// Generuje src/data/clubs_l3.js i src/data/clubs_l4.js z list od użytkownika (tools/data/*.txt).
// Uruchom: node tools/build-lower-leagues.mjs
// Siła L z miejsca w tabeli z Nov 10, 2026 (waga 1-5) [SZAC]; w III lidze łączona z wagą eksperta (D6).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { CLUBS_L3 as OLD_L3 } from '../src/data/clubs_l3.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, 'tools/data', f), 'utf8').replace(/^﻿/, '');

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

const weightFromPos = (pos, n) => { const q = (pos - 1) / Math.max(1, n - 1); return q < 0.17 ? 5 : q < 0.34 ? 4 : q < 0.67 ? 3 : q < 0.84 ? 2 : 1; };
const byName = new Map([...CLUBS_PL, ...OLD_L3].map((c) => [c.name.toLowerCase(), c]));
const oldL3 = new Map(OLD_L3.map((c) => [c.name.toLowerCase(), c]));
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
const PARENT_ALIAS = { 'termalica-nieciecza': 'termalica', 'pogon-szczecin': 'pogon-szczecin' };

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
      out.push({
        id, name: c.name, short: short(c.name), tier, group: gi + 1, groupName: g.name, weight,
        L: Math.round((baseL + step * weight) * 10) / 10, prestige: 1 + Math.round(weight / 2), coach: 'P',
        colors: ['#2E8A4E', '#FFFFFF'], region: slug(g.name.split(/[ /]/)[0]),
      });
    }
  });
  for (const c of out) { const p = parentOf(c.name, out); if (p) c.parent = p; }
  return { out, groups: groups.length };
}

const l3 = build('3_liga_2026_2027.txt', 4, 7.0, 0.3);
const l4 = build('4_liga_2026_2027.txt', 5, 5.9, 0.25);
const header = (t, n, g) => `// WYGENEROWANO: node tools/build-lower-leagues.mjs (źródło: tools/data). Nie edytuj ręcznie.\n// ${t}: ${n} drużyn w ${g} grupach. Kadry losowane na mecz (src/world/ephemeral.js). Siła L [SZAC].\n`;
fs.writeFileSync(path.join(root, 'src/data/clubs_l3.js'), `${header('III liga 2026/27', l3.out.length, l3.groups)}\nexport const CLUBS_L3 = [\n${l3.out.map((c) => `  ${JSON.stringify(c)},`).join('\n')}\n];\n`);
fs.writeFileSync(path.join(root, 'src/data/clubs_l4.js'), `${header('IV liga 2026/27', l4.out.length, l4.groups)}\nexport const CLUBS_L4 = [\n${l4.out.map((c) => `  ${JSON.stringify(c)},`).join('\n')}\n];\n`);
console.log(`III liga: ${l3.out.length} drużyn (${l3.out.filter((c) => c.parent).length} rezerw), IV liga: ${l4.out.length} drużyn (${l4.out.filter((c) => c.parent).length} rezerw)`);
