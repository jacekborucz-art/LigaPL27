// Reprezentacje w pętli dni: powołania, mecze, losowania i wiadomości dla gracza.
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { GAME_START } from '../config/calendar2026.js';
import { fmtDate } from '../ui/dom.js';
import { createNational, nationalDay, ntName, NT_COMP_NAMES, teamMatches } from './national.js';

const who = (game, c) => {
  const p = game.world.players[c.id];
  return `${p?.name ?? c.id} (${c.u21 ? 'U21 ' : ''}${ntName(c.team)})`;
};
const resText = (m) => `${ntName(m.home)} ${m.result.score[0]}:${m.result.score[1]} ${ntName(m.away)}${m.result.shootout ? ` (karne ${m.result.shootout[0]}:${m.result.shootout[1]})` : m.result.extraTime ? ' (po dogrywce)' : ''}`;

export function nationalMessages(game, date, ev) {
  const out = [];
  const mineIds = new Set(game.world.clubs[game.clubId]?.squad ?? []);
  for (const { window: w, list } of ev.announced) {
    const mine = list.filter((c) => mineIds.has(c.id));
    const pol = list.filter((c) => c.team === 'POL' && !c.u21);
    const body = [
      mine.length ? `Z naszej drużyny powołani: ${mine.map((c) => who(game, c)).join(', ')}. Opuszczą klub od ${fmtDate(w.from)} do ${fmtDate(w.to)} i nie będą trenować z zespołem.` : 'Nikt z naszej drużyny nie dostał powołania.',
      pol.length ? `Reprezentacja Polski, zawodnicy z polskich klubów: ${pol.map((c) => game.world.players[c.id]?.name).join(', ')}.` : 'W kadrze Polski nie ma zawodników z polskich klubów.',
    ].join('\n\n');
    out.push(createMessage({ date, key: `callups:${w.from}`, category: 'national', from: 'Reprezentacje', priority: mine.length ? 'important' : 'info', subject: `Powołania na zgrupowanie (${fmtDate(w.from)} - ${fmtDate(w.to)})`, body }));
  }
  for (const { window: w, list } of ev.released) {
    const mine = list.filter((c) => mineIds.has(c.id));
    if (!mine.length) continue;
    const lines = mine.map((c) => `${who(game, c)}: ${c.minutes ? `${c.minutes} min` : 'bez gry'}${c.goals ? `, gole: ${c.goals}` : ''}${c.injury ? `, wraca z urazem (${c.injury.name}, ok. ${c.injury.days} dni)` : ''}`);
    out.push(createMessage({ date, key: `callback:${w.from}`, category: 'national', from: 'Sztab medyczny', priority: mine.some((c) => c.injury) ? 'important' : 'info', subject: 'Powrót reprezentantów', body: `${lines.join('\n')}\n\nZawodnicy wracają zmęczeni po zgrupowaniu.` }));
  }
  const pol = ev.played.filter((m) => m.home === 'POL' || m.away === 'POL');
  for (const m of pol) {
    const sc = (m.result.ourScorers ?? []).filter((s) => s.team === 'POL').map((s) => s.name);
    out.push(createMessage({ date, key: `nt:${m.id}`, category: 'national', from: 'Reprezentacja Polski', priority: 'info', subject: resText(m), body: `${NT_COMP_NAMES[m.comp]}${m.group ? `, grupa ${m.group}` : ''}.${sc.length ? ` Gole zawodników z polskich klubów: ${sc.join(', ')}.` : ''}` }));
  }
  if (ev.draws.includes('LNKO')) {
    const next = teamMatches(game.national, 'POL').find((m) => !m.played && m.comp !== 'LN');
    out.push(createMessage({ date, key: 'nt-draw:LNKO', category: 'national', from: 'UEFA', priority: 'info', subject: 'Liga Narodów: pary ćwierćfinałów i baraży', body: next ? `Polska zagra w marcu: ${NT_COMP_NAMES[next.comp]}, rywal: ${ntName(next.home === 'POL' ? next.away : next.home)}.` : 'Polska nie gra w marcowych meczach Ligi Narodów.' }));
  }
  if (ev.draws.includes('EURO')) {
    const g = Object.entries(game.national.euro.groups).find(([, t]) => t.includes('POL'));
    out.push(createMessage({ date, key: 'nt-draw:EURO', category: 'national', from: 'UEFA', priority: 'info', subject: 'Losowanie eliminacji Euro 2028', body: g ? `Polska trafiła do grupy ${g[0]}: ${g[1].map(ntName).join(', ')}.` : 'Losowanie grup eliminacji zakończone.' }));
  }
  return out;
}

registerDailySystem({
  id: 'national', order: 3,
  run(game, date) {
    if (!game.world) return {};
    if (!game.national) game.national = createNational(game.seed);
    const ev = nationalDay(game.national, date, game.world.players);
    return { messages: nationalMessages(game, date, ev) };
  },
});

/** Zapis sprzed etapu 8: reprezentacje nadrobione od startu gry, bez wiadomości. */
export function ensureNational(game) {
  if (game.national || !game.world) return false;
  game.national = createNational(game.seed);
  for (let d = GAME_START; d <= game.date; d = addDays(d, 1)) nationalDay(game.national, d, game.world.players);
  return true;
}
