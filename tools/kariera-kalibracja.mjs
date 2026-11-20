// Kalibracja kariery trenera (docs/kariera-trenera.md rozdz. 9): autopilot gracza od klubu III ligi (ranking siły
// w grupie 1-3), decyzje automatyczne (oferta z wyższej ligi: przyjęcie; bez pracy: aplikacje do wakatów z najlepszą
// szansą, pierwsza oferta przyjęta). Raport: sezony do pierwszej oferty z 1 Ligi i z Ekstraklasy, reputacja gracza,
// reputacja trenerów AI per liga, długość bezrobocia, oferty gwarantowane, odznaki i trofea.
// Uruchomienie: node tools/kariera-kalibracja.mjs [ziarna, np. 1,2,3] [sezony] [premia trenera gracza w punktach atrybutu] [klub]
// Premia 0: gracz jak przeciętny trener AI tego klubu; 2-3: aktywny, dobry gracz [SZAC].
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason, applyResult, playQuick } from '../src/season/season.js';
import { processDay, addDays, isUnemployed } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { Rng } from '../src/core/rng.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { runDecision } from '../src/core/decisions.js';
import { seasonGoalFor } from '../src/career/board.js';
import { jobState, applyJob } from '../src/career/jobMarket.js';
import { careerSummary, aiCoachRep } from '../src/career/coachCareer.js';
import { applySeasonState } from '../src/season/rollover.js';
import { generateCoach } from '../src/career/coaches.js';
import '../src/season/dailySystems.js';

const seeds = String(process.argv[2] ?? '1,2,3').split(',').map(Number);
const seasons = Number(process.argv[3] ?? 10);
const skill = Number(process.argv[4] ?? 0);
const want = process.argv[5] ?? null;
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null; };
const out = [];

for (const seed of seeds) {
  applySeasonState({});
  const start = want ?? (() => {
    const xs = CLUBS_PL.filter((c) => c.tier === 4 && !c.parent && seasonGoalFor(c).rank <= 3);
    return new Rng(`kal:${seed}`).pick(xs).id;
  })();
  const g = { seed, clubId: start, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'Jan', lastName: 'Testowy', age: 40, birthYear: 1986 } } };
  g.world = generateWorld(seed); g.season = createSeason(seed, { playerClub: start }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, start), { benchSize: 12 }); ensureCareer(g); processDay(g);
  const end = `${2026 + seasons}-07-02`;
  const R = { seed, start, firstL1: null, firstEK: null, jobs: [], out: [], fallback: 0, repBySeason: [], aiRep: [] };
  let outFrom = null; let season = 0;
  const t0 = performance.now();
  const offerSeen = (ids) => {
    for (const id of ids) {
      const t = clubById(id)?.tier;
      if (t === 2 && !R.firstL1) R.firstL1 = { season, date: g.date, id };
      if (t === 1 && !R.firstEK) R.firstEK = { season, date: g.date, id };
    }
  };
  while (g.date < end) {
    for (const f of g.fixtures.filter((x) => x.date === g.date && !x.played && (x.home === g.clubId || x.away === g.clubId))) {
      if (isUnemployed(g)) break;
      const rng = new Rng('g' + f.id);
      if (!f.home || !f.away) { f.played = true; f.result = { score: [1, 1] }; continue; }
      // Gracz jak przeciętny trener klubu: mecz w tle z profilem trenera AI tego klubu (bez kar za bierną grę autopilota)
      const me = g.clubId; g.coaches ??= {}; g.coaches[me] = generateCoach(g.seed, me, { n: 0, boost: skill }); g.clubId = null;
      try { applyResult(g, f, playQuick(g, f, rng), rng); } finally { g.clubId = me; delete g.coaches[me]; }
    }
    for (const m of g.inbox.filter((x) => !x.resolved && x.actions?.length)) {
      if (m.refs?.kind === 'jobOffer') {
        const ids = m.refs.jobClubs ?? m.actions.map((a) => a.id).filter((id) => clubById(id));
        offerSeen(ids);
        if (m.refs.source === 'gwarantowana') R.fallback++;
        const cur = clubById(g.clubId)?.tier ?? 5;
        const best = ids.map((id) => clubById(id)).filter(Boolean).sort((a, b) => a.tier - b.tier)[0];
        const take = best && (isUnemployed(g) || best.tier < cur);
        m.resolved = true;
        runDecision(g, m, take ? best.id : 'stay');
        if (take) { R.jobs.push({ date: g.date, club: best.id, tier: best.tier, from: outFrom }); if (outFrom) { R.out.push(Math.round((Date.parse(g.date) - Date.parse(outFrom)) / 864e5)); outFrom = null; } }
      } else if (!m.optional) { m.resolved = true; runDecision(g, m, m.actions[0].id); }
    }
    if (isUnemployed(g)) {
      if (!outFrom) outFrom = g.date;
      const js = jobState(g);
      const rank = { wysoka: 0, 'średnia': 1, niska: 2 };
      const v = js.vacancies.filter((x) => !x.applied && !x.cooldownUntil).sort((a, b) => rank[a.chance] - rank[b.chance] || b.clubRep - a.clubRep)[0];
      const outDays = Math.round((Date.parse(g.date) - Date.parse(outFrom)) / 864e5);
      if (v && (rank[v.chance] <= 1 || outDays >= 20)) applyJob(g, v.clubId);
    }
    const before = g.seasonYear ?? 2026;
    g.date = addDays(g.date, 1); processDay(g);
    if ((g.seasonYear ?? 2026) !== before) {
      season++;
      const s = careerSummary(g);
      R.repBySeason.push(Math.round(s.rep.value));
      const ai = {};
      for (const [id, p] of Object.entries(g.coaches ?? {})) { const c = clubById(id); if (!c || c.parent || p.caretaker || c.tier > 4) continue; (ai[c.tier] ??= []).push(aiCoachRep(p, c.tier)); }
      R.aiRep.push(Object.fromEntries(Object.entries(ai).map(([t, xs]) => [t, Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)])));
      console.log(`ziarno ${seed} sezon ${season} (${Math.round(performance.now() - t0)} ms): ${isUnemployed(g) ? 'bez pracy' : `${g.clubId} (liga ${clubById(g.clubId)?.tier})`}, rep ${s.rep.value} (zasięg ${s.rep.reach}), kibice ${s.pop.fans}, media ${s.pop.media}, odznaki ${Object.entries(s.badges).map(([k, v]) => `${k}x${v.count}`).join(' ')}; AI rep ${JSON.stringify(R.aiRep.at(-1))}`);
    }
  }
  const s = careerSummary(g);
  R.badges = Object.fromEntries(Object.entries(s.badges).map(([k, v]) => [k, v.count]));
  R.trophies = s.trophies.length;
  R.scars = s.scars.length;
  out.push(R);
  console.log(`\nziarno ${seed}: start ${start}, 1 Liga oferta: ${R.firstL1 ? `sezon ${R.firstL1.season + 1}` : 'brak'}, Ekstraklasa oferta: ${R.firstEK ? `sezon ${R.firstEK.season + 1}` : 'brak'}, prace: ${R.jobs.map((j) => `${j.club}(${j.tier})`).join(' ')}, bezrobocie dni: ${R.out.join(',') || '-'}, oferty gwarantowane ${R.fallback}, blizny ${R.scars}\n`);
}
const l1 = out.map((r) => (r.firstL1 ? r.firstL1.season + 1 : 99));
const ek = out.map((r) => (r.firstEK ? r.firstEK.season + 1 : 99));
const outs = out.flatMap((r) => r.out);
console.log('PODSUMOWANIE');
console.log(`  sezony do 1. oferty z 1 Ligi: mediana ${q(l1, 0.5)} (99 = brak), wartości ${l1.join(',')}`);
console.log(`  sezony do 1. oferty z Ekstraklasy: mediana ${q(ek, 0.5)}, wartości ${ek.join(',')}`);
console.log(`  bezrobocie: ${outs.length} okresów, średnio ${outs.length ? Math.round(outs.reduce((a, b) => a + b, 0) / outs.length) : '-'} dni, mediana ${q(outs, 0.5) ?? '-'}; oferty gwarantowane ${out.reduce((a, r) => a + r.fallback, 0)}`);
const lastAi = out.map((r) => r.aiRep.at(-1) ?? {}); const firstAi = out.map((r) => r.aiRep[0] ?? {});
for (const t of [1, 2, 3, 4]) console.log(`  AI rep liga ${t}: po 1. sezonie ${q(firstAi.map((x) => x[t]).filter((x) => x != null), 0.5)}, na końcu ${q(lastAi.map((x) => x[t]).filter((x) => x != null), 0.5)}`);
console.log(`  reputacja gracza na koniec: ${out.map((r) => r.repBySeason.at(-1)).join(',')}`);
