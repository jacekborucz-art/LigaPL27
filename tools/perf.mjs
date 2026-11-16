// Pomiar wydajności: czas pełnego sezonu i czas każdego systemu dnia (globalThis.__systemTimes w core/gameLoop.js).
// Uruchomienie: npm run perf [-- klub ziarno do] , np. npm run perf -- widzew 5 2027-06-30
//   --save   zapisuje wynik jako punkt odniesienia (tools/perf-baseline.json)
// Bez --save porównuje z punktem odniesienia i pokazuje różnice. Nie jest częścią npm test (czasy zależą od komputera).
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Rng } from '../src/core/rng.js';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, playQuick, applyResult } from '../src/season/season.js';
import { processDay, continueUntilStop, primaryAction } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import '../src/season/dailySystems.js';
import * as TR from '../src/training/index.js';
import * as CS from '../src/career/careerSystem.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const save = process.argv.includes('--save');
const [club = 'widzew', seedArg = '5', until = '2027-06-30'] = args;
const BASE = new URL('./perf-baseline.json', import.meta.url);

const t0 = performance.now();
const g = { seed: Number(seedArg), clubId: club, date: '2026-07-01', season: '2026/27', inbox: [] };
g.world = generateWorld(g.seed);
g.season = createSeason(g.seed, { playerClub: club });
g.fixtures = g.season.fixtures;
g.tactics = createTactics(squadOf(g.world, club));
TR.ensureTraining?.(g); CS.ensureCareer?.(g);
const tSetup = performance.now() - t0;

globalThis.__systemTimes = {};
const rng = new Rng(`perf:${g.seed}`);
let userMatchMs = 0; let days = 0; let guard = 0;
const t1 = performance.now();
processDay(g);
while (g.date < until && guard++ < 20000) {
  const a = primaryAction(g);
  if (a.kind === 'play') {
    const f = a.match; const m0 = performance.now();
    if (f.comp === 'friendly' || !f.away || !f.home) { f.played = true; f.result = { score: [1, 1] }; } else applyResult(g, f, playQuick(g, f, rng), rng);
    userMatchMs += performance.now() - m0; continue;
  }
  if (a.kind === 'decide') { g.inbox = g.inbox.map((m) => ({ ...m, resolved: true })); continue; }
  const r = continueUntilStop(g, { maxDays: 1 }); days += r.days.length;
}
const tSeason = performance.now() - t1;

const systems = Object.entries(globalThis.__systemTimes).sort((a, b) => b[1] - a[1]);
const result = { date: new Date().toISOString().slice(0, 10), club, seed: g.seed, until, days, setupMs: Math.round(tSetup), seasonMs: Math.round(tSeason), userMatchesMs: Math.round(userMatchMs), systems: Object.fromEntries(systems.map(([k, v]) => [k, Math.round(v)])) };

let base = null;
try { base = JSON.parse(fs.readFileSync(BASE, 'utf8')); } catch { /* brak punktu odniesienia */ }
const diff = (now, was) => (was ? ` (${now >= was ? '+' : ''}${Math.round(((now - was) / was) * 100)} % wobec ${was} ms)` : '');
console.log(`Sezon ${club}, ziarno ${g.seed}, do ${until}: ${days} dni`);
console.log(`Świat i start: ${result.setupMs} ms${diff(result.setupMs, base?.setupMs)}`);
console.log(`Sezon razem:   ${result.seasonMs} ms${diff(result.seasonMs, base?.seasonMs)}`);
console.log(`Mecze gracza:  ${result.userMatchesMs} ms`);
console.log('Systemy dnia (najdroższe):');
for (const [k, v] of systems.slice(0, 15)) console.log(`  ${k.padEnd(20)} ${String(Math.round(v)).padStart(6)} ms${diff(Math.round(v), base?.systems?.[k])}`);
if (save) { fs.writeFileSync(BASE, `${JSON.stringify(result, null, 2)}\n`); console.log(`Zapisano punkt odniesienia: ${BASE.pathname}`); }
