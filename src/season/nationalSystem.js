// Reprezentacje w pętli dni: powołania, mecze, losowania i wiadomości dla gracza.
// Część zapisana na sztywno (national.js: Liga Narodów 2026/27, grupy eliminacji Euro 2028) i silnik wieczny
// (intl/engine.js: kolejne edycje, turnieje, konfederacje, sparingi Polski). Powołania w oknach FIFA każdego roku
// (intl/windows.js) i na turnieje: zawodnicy drużyn grających w turnieju zostają na zgrupowaniu do odpadnięcia.
import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { GAME_START } from '../config/calendar2026.js';
import { fmtDate } from '../ui/dom.js';
import { Rng } from '../core/rng.js';
import { createNational, nationalDay, ntName, NT_COMP_NAMES, teamMatches, assignPlay, activeCallups } from './national.js';
import { windowsNear } from './intl/windows.js';
import { bindRatings } from './intl/ratings.js';
import { createIntl, intlDay, intlCamps, withTournament, teamDone, rateNt, catchUpIntl, asNt, intlName, compLabel as ntCompLabel, groupLabel } from './intl/engine.js';

const who = (game, c) => {
  const p = game.world.players[c.id];
  return `${p?.name ?? c.id} (${c.u21 ? 'U21 ' : ''}${ntName(c.team)})`;
};
const resText = (m) => `${intlName(m.home)} ${m.result.score[0]}:${m.result.score[1]} ${intlName(m.away)}${m.result.shootout ? ` (karne ${m.result.shootout[0]}:${m.result.shootout[1]})` : m.result.extraTime ? ' (po dogrywce)' : ''}`;

export function nationalMessages(game, date, ev) {
  const out = [];
  const mineIds = new Set(game.world.clubs[game.clubId]?.squad ?? []);
  for (const { window: w, list } of ev.announced) {
    const mine = list.filter((c) => mineIds.has(c.id));
    const pol = list.filter((c) => c.team === 'POL' && !c.u21);
    if (w.kind === 'cont' && !mine.length) continue;
    const tourNote = mine.some((c) => c.tour) ? ' Zawodnicy reprezentacji grających w turnieju zostają w kadrze do odpadnięcia drużyny.' : '';
    const body = [
      mine.length ? `Z naszej drużyny powołani: ${mine.map((c) => who(game, c)).join(', ')}. Opuszczą klub od ${fmtDate(w.from)}${w.kind === 'cont' ? '' : ` do ${fmtDate(w.to)}`} i nie będą trenować z zespołem.${tourNote}` : 'Nikt z naszej drużyny nie dostał powołania.',
      w.kind === 'cont' ? '' : pol.length ? `Reprezentacja Polski, zawodnicy z polskich klubów: ${pol.map((c) => game.world.players[c.id]?.name).join(', ')}.` : 'W kadrze Polski nie ma zawodników z polskich klubów.',
    ].filter(Boolean).join('\n\n');
    const subject = w.kind === 'cont' ? `Powołania na turniej: ${w.title}` : w.tour ? `Powołania przed turniejem (${fmtDate(w.from)} - ${fmtDate(w.to)})` : `Powołania na zgrupowanie (${fmtDate(w.from)} - ${fmtDate(w.to)})`;
    out.push(createMessage({ date, key: `callups:${w.key ?? w.from}`, category: 'national', from: 'Reprezentacje', priority: mine.length ? 'important' : 'info', subject, body }));
  }
  for (const { window: w, list } of ev.released) {
    const mine = list.filter((c) => mineIds.has(c.id));
    if (!mine.length) continue;
    const lines = mine.map((c) => `${who(game, c)}: ${c.minutes ? `${c.minutes} min` : 'bez gry'}${c.goals ? `, gole: ${c.goals}` : ''}${c.injury ? `, wraca z urazem (${c.injury.name}, ok. ${c.injury.days} dni)` : ''}`);
    out.push(createMessage({ date, key: `callback:${w.key ?? w.from}:${date}`, category: 'national', from: 'Sztab medyczny', priority: mine.some((c) => c.injury) ? 'important' : 'info', subject: 'Powrót reprezentantów', body: `${lines.join('\n')}\n\nZawodnicy wracają zmęczeni po zgrupowaniu.` }));
  }
  const pol = ev.played.filter((m) => m.home === 'POL' || m.away === 'POL');
  for (const m of pol) {
    const sc = (m.result.ourScorers ?? []).filter((s) => s.team === 'POL').map((s) => s.name);
    out.push(createMessage({ date, key: `nt:${m.id}`, category: 'national', from: 'Reprezentacja Polski', priority: 'info', subject: resText(m), body: `${ntCompLabel(m)}${m.group ? `, ${groupLabel(m)}` : ''}.${sc.length ? ` Gole zawodników z polskich klubów: ${sc.join(', ')}.` : ''}` }));
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

function intlMessages(game, date, iev) {
  const out = [];
  for (const n of iev.news) {
    out.push(createMessage({ date, key: `intl:${n.key}`, category: 'national', from: n.from ?? 'Reprezentacje', priority: n.priority ?? 'info', subject: n.subject, body: n.body }));
  }
  return out;
}

/** Stan silnika reprezentacji; zapis bez game.intl: utworzenie i nadrobienie od startu gry (w tle, bez powołań). */
export function ensureIntl(game, date = game.date) {
  if (game.intl) return game.intl;
  game.intlHistory = game.intlHistory ?? [];
  game.intl = createIntl(game.seed, GAME_START);
  if (date > GAME_START) catchUpIntl(game.intl, game.national, GAME_START, date, game.intlHistory);
  return game.intl;
}

/** Okna i zgrupowania turniejowe na dziś (okno sparingów przed Euro/MŚ z listą uczestników turnieju). */
export function campsFor(I, date) {
  return [...windowsNear(date).map((w) => withTournament(I, w)), ...intlCamps(I, date)];
}

function clubBusyFn(game) {
  return (club, from, to) => {
    let last = null;
    for (const f of game.fixtures ?? []) if (!f.played && (f.home === club || f.away === club) && f.date >= from && f.date <= to && (!last || f.date > last)) last = f.date;
    return last;
  };
}

/** Statystyki powołanych w meczach silnika (turnieje, eliminacje, Liga Narodów od 2028/29). */
function playIntl(game, date, iev) {
  const called = activeCallups(game.national);
  if (!called.length || !iev.played.length) return [];
  const teams = new Set(called.map((c) => c.team));
  const rng = new Rng(`kadry-intl:${game.seed}:${date}`);
  const out = [];
  for (const { c, m } of iev.played) {
    if (!teams.has(m.h) && !teams.has(m.a)) continue;
    const nm = asNt(c, m);
    assignPlay(game.national, nm, called, game.world.players, rng);
    if (nm.result.ourScorers) out.push(nm);
  }
  return out;
}

registerDailySystem({
  id: 'national', order: 3,
  run(game, date) {
    if (!game.world) return {};
    if (!game.national) game.national = createNational(game.seed);
    const I = ensureIntl(game, date);
    game.intlHistory = game.intlHistory ?? [];
    bindRatings(I.ratings);
    const ev = nationalDay(game.national, date, game.world.players, {
      windows: campsFor(I, date), teamDone: (k, t) => teamDone(I, k, t), clubBusy: clubBusyFn(game), onResult: (m) => rateNt(I, m),
    });
    const iev = intlDay(I, date, { N: game.national, history: game.intlHistory });
    const scored = new Map(playIntl(game, date, iev).map((m) => [m.id, m]));
    // Mecze Polski z silnika do wiadomości (strzelcy z polskich klubów, jeśli grali)
    for (const { c, m } of iev.played) if (m.h === 'POL' || m.a === 'POL') { const nm = asNt(c, m); ev.played.push(scored.get(nm.id) ?? nm); }
    return { messages: [...nationalMessages(game, date, ev), ...intlMessages(game, date, iev)] };
  },
});

/** Zapis sprzed etapu 8: reprezentacje nadrobione od startu gry, bez wiadomości. */
export function ensureNational(game) {
  if (game.national || !game.world) return false;
  game.national = createNational(game.seed);
  for (let d = GAME_START; d <= game.date; d = addDays(d, 1)) nationalDay(game.national, d, game.world.players);
  return true;
}
