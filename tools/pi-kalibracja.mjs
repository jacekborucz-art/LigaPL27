// Kalibracja instrukcji indywidualnych (docs/instrukcje-indywidualne.md): pomiar A/B na tych samych ziarnach.
// Wariant: instrukcja dla wszystkich uprawnionych zawodników jedenastki gospodarzy (drużyna: ustawienia domyślne),
// odniesienie: ten sam mecz bez instrukcji. Obie drużyny bez AI (bez zmian trenera), Ekstraklasa.
// Uruchom: node tools/pi-kalibracja.mjs [mecze=400] [instrukcja:poziom ...]

import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createTactics } from '../src/engine/lineup.js';
import { CLUBS_PL, clubById } from '../src/data/clubs_pl.js';
import { formationById } from '../src/data/formations.js';
import { createMatch, runToEnd } from '../src/engine/match/match.js';
import { PLAYER_INSTRUCTIONS } from '../src/data/playerInstructions.js';

const N = Number(process.argv[2] ?? 400);
const only = process.argv.slice(3);
const world = generateWorld(42);
const EK = CLUBS_PL.filter((c) => c.tier === 1);
const sq = Object.fromEntries(EK.map((c) => [c.id, squadOf(world, c.id)]));
const tac = Object.fromEntries(EK.map((c) => [c.id, createTactics(sq[c.id])]));

/** Instrukcja dla wszystkich zawodników jedenastki, których pozycja na to pozwala. */
export function allEligible(t, id, lv) {
  const def = PLAYER_INSTRUCTIONS.find((d) => d.id === id);
  const f = formationById(t.formation);
  const out = {};
  t.xi.forEach((pid, i) => { if (pid && def.pos.includes(f.slots[i].pos)) out[pid] = { [id]: lv }; });
  return out;
}

function measure(pi, teamInstr = null) {
  const s = { gf: 0, ga: 0, sh: 0, xg: 0, shA: 0, xgA: 0, dys: 0, skr: 0, head: 0, konA: 0, fouls: 0, yc: 0, rc: 0, pens: 0, poss: 0, acc: 0, off: 0, tk: 0, cond: 0, ast: 0, pts: 0 };
  for (let i = 0; i < N; i++) {
    const h = EK[i % 18].id; const a = EK[(i * 7 + 3) % 18 === i % 18 ? (i + 1) % 18 : (i * 7 + 3) % 18].id;
    let th = pi ? { ...tac[h], playerInstr: pi(tac[h]) } : tac[h];
    if (teamInstr) th = { ...th, instructions: { ...th.instructions, ...teamInstr } };
    const M = createMatch({ seed: `piab${i}`, home: { club: clubById(h), squad: sq[h], tactics: th, ai: false }, away: { club: clubById(a), squad: sq[a], tactics: tac[a], ai: false }, ctx: {} });
    const r = runToEnd(M);
    const t = r.stats;
    s.gf += r.score[0]; s.ga += r.score[1]; s.sh += t[0].shots; s.xg += t[0].xg; s.shA += t[1].shots; s.xgA += t[1].xg;
    s.fouls += t[0].fouls; s.yc += t[0].yellow; s.rc += t[0].red; s.pens += t[1].penalties; s.poss += t[0].possession; s.acc += t[0].passAccuracy;
    s.off += t[0].offsides; s.tk += t[0].tackles + t[0].interceptions + t[0].clearances;
    s.pts += r.score[0] > r.score[1] ? 3 : r.score[0] === r.score[1] ? 1 : 0;
    for (const e of M.events) {
      // Rodzaj akcji: strzały mają kind, gole how (HEAD: główka, zwykle po wrzutce)
      const k = ['shotOn', 'shotOff', 'shotBlocked', 'post'].includes(e.type) ? e.kind : e.type === 'goal' && !e.ownGoal && !e.provisional ? e.how : null;
      if (!k) continue;
      if (e.side === 0 && k === 'DYS') s.dys++;
      if (e.side === 0 && (k === 'SKR' || k === 'HEAD')) s.skr++;
      if (e.side === 1 && k === 'KON') s.konA++;
    }
    const xs = M.teams[0].players.filter((x) => x.on && !x.sentOff && x.slot?.pos !== 'BR');
    s.cond += xs.reduce((v, x) => v + x.cond, 0) / Math.max(1, xs.length);
  }
  for (const k of Object.keys(s)) s[k] /= N;
  return s;
}

const fmt = (v) => (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3));
const base = measure(null);
console.log(`Mecze: ${N} na wariant. Odniesienie (gospodarze):`, Object.entries(base).map(([k, v]) => `${k} ${fmt(v)}`).join(', '));
const variants = [];
for (const d of PLAYER_INSTRUCTIONS) for (const o of d.options) variants.push([d.id, o.v]);
const show = (label, s) => {
  const diff = Object.entries(s).map(([k, v]) => [k, v - base[k]]).filter(([, d]) => Math.abs(d) > 1e-9);
  console.log(label, diff.map(([k, d]) => `${k} ${d > 0 ? '+' : ''}${fmt(d)}`).join(', '));
};
for (const [id, lv] of variants) {
  if (only.length && !only.includes(`${id}:${lv}`)) continue;
  show(`${id}:${lv > 0 ? '+1' : '-1'}`, measure((t) => allEligible(t, id, lv)));
}
// Porównanie z instrukcją drużyny: argument team:passing:short (instrukcja drużyny zamiast indywidualnych)
for (const a of only.filter((x) => x.startsWith('team:'))) {
  const [, k, v] = a.split(':');
  show(`drużyna ${k}=${v}`, measure(null, { [k]: v }));
}
