// Symulacja wielu sezonów (etap 10): node tools/multiseason.mjs [klub] [ziarno] [liczba sezonów]
// Raport: siła lig (średnia OVR 14 najlepszych), awanse i spadki, kadry, finanse, puchary.
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { Rng } from '../src/core/rng.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { SEASON } from '../src/config/calendar2026.js';
import '../src/season/dailySystems.js';
const clubId = process.argv[2] ?? 'widzew'; const seed = Number(process.argv[3] ?? 5); const seasons = Number(process.argv[4] ?? 3);
const g = { seed, clubId, date: '2026-07-01', season: '2026/27', inbox: [] };
g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: clubId }); g.fixtures = g.season.fixtures;
g.tactics = createTactics(squadOf(g.world, clubId), { benchSize: 12 }); ensureCareer(g); processDay(g);
const avg = (t) => { const ids = CLUBS_PL.filter((c) => c.tier === t).map((c) => c.id); const xs = ids.flatMap((id) => squadOf(g.world, id).sort((a, b) => b.ovr - a.ovr).slice(0, 14).map((p) => p.ovr)); return (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2); };
console.log('start', SEASON, 'OVR top14:', avg(1), avg(2), avg(3), 'zawodników', Object.keys(g.world.players).length);
// Reputacja (docs/reputacja.md): rozkład u regularnych (>= 1800 min w lidze) per liga, zawodnicy EK z rep >= 70,
// regularni EK 22+ z rep < 25, najwyżsi, renoma europejska polskich klubów (P5)
const qt = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(f * s.length))]) : '-'; };
function repReport(label) {
  const out = [];
  for (const t of [1, 2, 3, 4]) {
    const reg = []; const all = [];
    for (const c of CLUBS_PL.filter((x) => x.tier === t)) for (const p of squadOf(g.world, c.id)) { all.push(p.rep); if ((p.st?.L?.[1] ?? 0) >= 1800) reg.push(p.rep); }
    out.push(`L${t} reg n=${reg.length} p10/50/90 ${qt(reg, 0.1)}/${qt(reg, 0.5)}/${qt(reg, 0.9)} (wszyscy p50 ${qt(all, 0.5)})`);
  }
  const ek = CLUBS_PL.filter((c) => c.tier === 1).flatMap((c) => squadOf(g.world, c.id));
  const hi = ek.filter((p) => p.rep >= 70).length;
  const low = ek.filter((p) => (p.st?.L?.[1] ?? 0) >= 1800 && p.age >= 22 && p.rep < 25).length;
  const top = Object.values(g.world.players).filter((p) => p.clubId).sort((a, b) => b.rep - a.rep).slice(0, 5).map((p) => `${p.last} ${p.clubId} ${Math.round(p.rep)}`).join(', ');
  const P5 = g.repState?.clubPts ? CLUBS_PL.filter((c) => c.tier === 1).map((c) => [c.id, Math.round((g.repState.clubPts[c.id] ?? []).reduce((a, b) => a + b, 0))]).sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x.join(':')).join(' ') : '-';
  console.log(`  REP ${label}: ${out.join(' | ')}\n      EK rep>=70: ${hi}, EK regularni 22+ rep<25: ${low}, top: ${top}\n      P5: ${P5}`);
}
repReport('start');
const end = `${2026 + seasons}-07-02`;
let t0 = performance.now();
while (g.date < end) {
  if (g.date.endsWith('-06-30')) repReport(`koniec ${SEASON}`);
  for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === g.clubId || x.away === g.clubId))) { const rng = new Rng('g' + f.id); applyResult(g, f, playQuick(g, f, rng), rng); }
  // decyzje blokujące (zwolnienie): wybierz pierwszą ofertę
  for (const m of g.inbox.filter((m) => !m.resolved && m.actions?.length && !m.optional)) { m.resolved = true; console.log('  DECYZJA', g.date, m.subject, m.actions.map((a) => a.id).join(',')); runDecision(g, m, m.actions[0].id); }
  const before = SEASON;
  g.date = addDays(g.date, 1); processDay(g);
  if (SEASON !== before) {
    const a = g.archive.at(-1);
    console.log(`\n== ${a.season} (${Math.round(performance.now() - t0)} ms) mistrz ${a.champion}, PP ${a.cup}, user ${g.clubId} ${a.user.pos}. w lidze ${a.user.tier}, Polska ranking ${a.polandRank}`);
    console.log('  awans EK:', a.promoted[1].join(','), '| spadek:', a.relegated[2].join(','), '| z III ligi:', a.promoted[3].join(','), '| do III ligi:', a.relegated[4].join(','));
    console.log('  OVR top14:', avg(1), avg(2), avg(3), 'zawodników', Object.keys(g.world.players).length, 'wolnych', g.market.free.length);
    const sizes = CLUBS_PL.filter((c) => c.tier <= 3).map((c) => squadOf(g.world, c.id).length);
    console.log('  kadry min/max', Math.min(...sizes), Math.max(...sizes), 'ligi', [1, 2, 3, 4].map((t) => CLUBS_PL.filter((c) => c.tier === t).length).join('/'), 'Europa:', g.season.polishEurope.map((e) => `${e.club}:${e.comp}${e.entry}`).join(' '));
    console.log('  wiadomości:', g.inbox.slice(0, 5).map((m) => m.subject).join(' | '));
    console.log('  gracz:', g.clubId, 'liga', CLUBS_PL.find((c) => c.id === g.clubId)?.tier, 'historia', JSON.stringify(g.manager.history));
    t0 = performance.now();
  }
}
const neg = CLUBS_PL.filter((c) => g.finance.clubs[c.id]?.balance < 0).map((c) => `${c.id}:${Math.round(g.finance.clubs[c.id].balance / 1e3)}k`);
const top = (id) => (squadOf(g.world, id).sort((a, b) => b.ovr - a.ovr).slice(0, 14).reduce((x, p) => x + p.ovr, 0) / 14).toFixed(2);
console.log('top14 klubów EK:', CLUBS_PL.filter((c) => c.tier === 1).map((c) => [c.id, top(c.id), Math.round(g.finance.clubs[c.id].balance / 1e6)]).sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x.join(':')).join(' '));
console.log('ujemne saldo:', neg.join(' ') || 'brak');
