// Kalibracja silnika transferów (docs/transfery.md): node tools/transfery-kalibracja.mjs [klub] [ziarno] [liczba sezonów]
// Liczy na sezon: transfery między klubami AI, sprzedaże za granicę, prośby o transfer, prekontrakty,
// transakcje nieudane, długi klubów i siłę lig (średnia OVR 14 najlepszych).
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { Rng } from '../src/core/rng.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { SEASON } from '../src/config/calendar2026.js';
import { applySeasonState } from '../src/season/rollover.js';
import '../src/season/dailySystems.js';

const clubId = process.argv[2] ?? 'widzew'; const seed = Number(process.argv[3] ?? 5); const seasons = Number(process.argv[4] ?? 2);
applySeasonState({});
const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 }); ensureCareer(g); processDay(g);
const avg = (t) => { const ids = CLUBS_PL.filter((c) => c.tier === t).map((c) => c.id); const xs = ids.flatMap((id) => squadOf(g.world, id).sort((a, b) => b.ovr - a.ovr).slice(0, 14).map((p) => p.ovr)); return (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2); };
const tierAt = {}; // poziom klubu w danym sezonie (przed awansami)
const snapTiers = () => { for (const c of CLUBS_PL) tierAt[c.id] = c.tier; };
snapTiers();
console.log('start', SEASON, 'OVR top14:', avg(1), avg(2), avg(3));
const end = `${2026 + seasons}-07-02`;
let t0 = performance.now();
let acc = {};
const seen = new Set(); // wpisy historii już policzone (historia jest przycinana na koniec sezonu)
const count = () => {
  const fresh = g.market.history.filter((x) => { const k = `${x.date}:${x.playerId}:${x.kind}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const ai = (id) => id && id !== g.clubId && clubById(id);
  const ek = (id) => tierAt[id] === 1;
  return {
    aiAi: fresh.filter((x) => x.kind === 'transfer' && ai(x.from) && ai(x.to)).length,
    aiAiEk: fresh.filter((x) => x.kind === 'transfer' && ai(x.from) && ai(x.to) && (ek(x.from) || ek(x.to))).length,
    free: fresh.filter((x) => x.kind === 'free').length,
    abroadEk: fresh.filter((x) => x.kind === 'abroad' && ek(x.from)).length,
    abroadUser: fresh.filter((x) => x.kind === 'abroad' && x.from === g.clubId).length,
    preEk: fresh.filter((x) => x.kind === 'pre' && ek(x.from)).length,
  };
};
while (g.date < end) {
  for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === g.clubId || x.away === g.clubId))) { const rng = new Rng(`g${f.id}`); applyResult(g, f, playQuick(g, f, rng), rng); }
  for (const m of g.inbox.filter((x) => !x.resolved && x.actions?.length && !x.optional)) { m.resolved = true; runDecision(g, m, m.actions[0].id); }
  const before = SEASON;
  g.date = addDays(g.date, 1); processDay(g);
  const day = count();
  for (const k of Object.keys(day)) acc[k] = (acc[k] ?? 0) + day[k];
  if (SEASON !== before) {
    const c = acc; acc = {};
    const st = g.market.tstats?.[before] ?? {};
    const neg = CLUBS_PL.filter((x) => g.finance.clubs[x.id] && x.id !== g.clubId && g.finance.clubs[x.id].balance < 0).length;
    console.log(`== ${before} (${Math.round(performance.now() - t0)} ms) AI-AI: ${c.aiAi} (z udziałem EK ${c.aiAiEk}), wolni: ${c.free}, za granicę z EK: ${c.abroadEk} (z klubu gracza ${c.abroadUser}), prekontrakty z EK: ${c.preEk}`);
    console.log(`   statystyki: ${JSON.stringify(st)}`);
    console.log(`   OVR top14: ${avg(1)} ${avg(2)} ${avg(3)}, kluby AI z ujemnym saldem: ${neg}, wolnych: ${g.market.free.length}`);
    // Dyrektorzy sportowi (docs/dyrektor-sportowy.md): Negocjacje średnio wg ligi, wakaty, lista wolnych
    if (g.staff?.dir) {
      const negT = [1, 2, 3, 4].map((t) => { const xs = CLUBS_PL.filter((x) => x.tier === t && g.world.clubs[x.id]).map((x) => g.staff.people[g.staff.dir[x.id]]?.a?.NEG).filter((v) => v != null); return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '-'; });
      const vac = CLUBS_PL.filter((x) => x.tier <= 4 && g.world.clubs[x.id] && !g.staff.dir[x.id]).length;
      console.log(`   dyrektorzy: NEG wg ligi ${negT.join(' / ')}, wakaty ${vac}, wolnych dyrektorów ${g.staff.dirPool?.length ?? 0}`);
    }
    snapTiers();
    t0 = performance.now();
  }
}
