// Systemy dnia oparte na kalendarzu 2026/27. Każdy jest niezależny i rejestruje się w pętli dni.
// Wiadomości od zawodników, kontuzje, finanse itd. dojdą jako kolejne systemy w następnych etapach.

import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { DOMESTIC, UEFA, FIFA_WINDOWS, POLISH_EUROPE_2026, SEASON_START, SEASON } from '../config/calendar2026.js';
import { CLUBS_PL, LEAGUE_NAMES, clubById } from '../data/clubs_pl.js';
import { fmtDate } from '../ui/dom.js';

const COMP_NAMES = { LM: 'Liga Mistrzów', LE: 'Liga Europy', LK: 'Liga Konferencji' };

/** Cel sezonu od zarządu z siły kadry na tle ligi. */
export function seasonGoal(club) {
  const rivals = CLUBS_PL.filter((c) => c.tier === club.tier && !c.parent).sort((a, b) => b.L - a.L);
  const rank = rivals.findIndex((c) => c.id === club.id) + 1;
  if (club.tier === 1) {
    if (rank <= 3) return { rank, text: 'walka o mistrzostwo Polski' };
    if (rank <= 6) return { rank, text: 'miejsce dające grę w europejskich pucharach' };
    if (rank <= 12) return { rank, text: 'spokojne miejsce w środku tabeli' };
    return { rank, text: 'utrzymanie w Ekstraklasie' };
  }
  if (rank <= 3) return { rank, text: club.tier === 2 ? 'awans do Ekstraklasy' : 'awans do 1 Ligi' };
  if (rank <= 8) return { rank, text: 'miejsce w strefie baraży o awans' };
  if (rank <= 14) return { rank, text: 'spokojny środek tabeli' };
  return { rank, text: 'utrzymanie w lidze' };
}

/** Tymczasowe mecze klubu gracza, zanim powstanie pełny terminarz (etap 7). */
export function provisionalFixtures(clubId) {
  const club = clubById(clubId);
  const out = [];
  const europe = POLISH_EUROPE_2026.find((e) => e.club === clubId);
  if (clubId === 'lech' || clubId === 'gornik-zabrze') {
    out.push({ id: 'SP-2026', date: DOMESTIC.superpuchar.date, comp: 'Superpuchar Polski', home: 'lech', away: 'gornik-zabrze' });
  }
  if (europe) {
    const first = UEFA[europe.comp][europe.entry][0];
    out.push({ id: `${europe.comp}-${europe.entry}-1`, date: first, comp: `${COMP_NAMES[europe.comp]}, ${europe.entry}`, home: clubId, away: null });
  }
  // Kluby grające w czwartek/środę w pucharach zaczynają ligę w niedzielę (harmonogram, PLAN 5.1).
  const leagueDay = europe ? addDays(DOMESTIC.ekstraklasa.start, 2) : DOMESTIC.ekstraklasa.start;
  out.push({ id: `L-${club.tier}-1`, date: leagueDay, comp: `${LEAGUE_NAMES[club.tier]}, 1. kolejka`, home: clubId, away: null });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const msg = (date, m) => createMessage({ date, ...m });

// 1. Powitanie i cele (dzień startu gry)
registerDailySystem({
  id: 'welcome', order: 10,
  run(state, date) {
    if (date !== SEASON_START || state.archive?.length) return {}; // powitanie tylko na start kariery
    const club = clubById(state.clubId);
    const goal = seasonGoal(club);
    const europe = POLISH_EUROPE_2026.find((e) => e.club === state.clubId);
    return {
      messages: [
        msg(date, {
          key: `welcome:${SEASON}`, category: 'board', from: 'Zarząd klubu', priority: 'important',
          subject: `Witamy w klubie ${club.name}`,
          body: `Cieszymy się, że poprowadzi Pan drużynę w sezonie ${SEASON}. Celem zarządu jest ${goal.text}. Będziemy rozliczać Pana z wyników, ale też z rozwoju młodych zawodników i finansów.`,
        }),
        msg(date, {
          key: `staff-intro:${SEASON}`, category: 'staff', from: 'Asystent trenera', priority: 'info',
          subject: 'Plan na pierwsze tygodnie',
          body: `Okno transferowe jest otwarte do ${fmtDate(DOMESTIC.transferWindows[0].to)}. ${europe ? `Zaczynamy od eliminacji: ${COMP_NAMES[europe.comp]}, runda ${europe.entry}.` : `Liga startuje ${fmtDate(DOMESTIC.ekstraklasa.start)}.`} Warto przejrzeć kadrę i ustalić plan treningów.`,
        }),
      ],
    };
  },
});

// 2. Okna transferowe: otwarcie, ostrzeżenie 3 dni przed końcem, zamknięcie
registerDailySystem({
  id: 'transferWindows', order: 20,
  run(state, date) {
    const out = [];
    for (const w of DOMESTIC.transferWindows) {
      if (date === w.from && date !== SEASON_START) {
        out.push(msg(date, { key: `tw-open:${w.from}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'important', subject: 'Okno transferowe otwarte', body: `Do ${fmtDate(w.to)} możemy kupować i sprzedawać zawodników.` }));
      }
      if (date === addDays(w.to, -3)) {
        out.push(msg(date, { key: `tw-warn:${w.to}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'important', subject: 'Zostały 3 dni okna transferowego', body: `Okno zamyka się ${fmtDate(w.to)}. Po tym terminie zgłosimy tylko wolnych zawodników i wychowanków.` }));
      }
      if (date === addDays(w.to, 1)) {
        out.push(msg(date, { key: `tw-close:${w.to}`, category: 'transfers', from: 'Dyrektor sportowy', priority: 'info', subject: 'Okno transferowe zamknięte', body: 'Do kolejnego okna możemy podpisywać tylko wolnych zawodników.' }));
      }
    }
    return { messages: out };
  },
});

// 3. Kalendarz rozgrywek: start lig, Puchar Polski, puchary UEFA polskich klubów, okna FIFA
registerDailySystem({
  id: 'competitionCalendar', order: 30,
  run(state, date) {
    const out = [];
    const club = clubById(state.clubId);
    const leagueStart = DOMESTIC[['ekstraklasa', 'liga1', 'liga2'][club.tier - 1]]?.start;
    if (!leagueStart) return {};
    if (date === addDays(leagueStart, -1)) {
      out.push(msg(date, { key: `league-start:${SEASON}`, category: 'competitions', from: LEAGUE_NAMES[club.tier], priority: 'info', subject: `Jutro startuje ${LEAGUE_NAMES[club.tier]}`, body: `Sezon ${SEASON} rusza ${fmtDate(leagueStart)}. 34 kolejki, mecz i rewanż.` }));
    }
    for (const r of DOMESTIC.pucharPolski.rounds) {
      if (date === addDays(r.date, -7)) {
        out.push(msg(date, { key: `pp:${r.id}`, category: 'competitions', from: 'Puchar Polski', priority: 'info', subject: `Za tydzień runda ${r.id} Pucharu Polski`, body: `Mecze rundy ${r.id} odbędą się ${fmtDate(r.date)}${r.venue ? `, ${r.venue}` : ''}.` }));
      }
    }
    for (const e of POLISH_EUROPE_2026) {
      const first = UEFA[e.comp][e.entry]?.[0];
      if (first && date === first && e.club !== state.clubId) {
        const c = clubById(e.club);
        out.push(msg(date, { key: `uefa:${e.club}:${e.entry}`, category: 'competitions', from: 'UEFA', priority: 'info', subject: `${c.name} zaczyna grę w pucharach`, body: `${COMP_NAMES[e.comp]}, runda ${e.entry}. Pierwszy mecz dzisiaj.` }));
      }
    }
    for (const w of FIFA_WINDOWS) {
      if (date === addDays(w.from, -2)) {
        out.push(msg(date, { key: `fifa:${w.from}`, category: 'national', from: 'Reprezentacja Polski', priority: 'important', subject: 'Zbliża się przerwa na mecze reprezentacji', body: `Okno reprezentacyjne trwa od ${fmtDate(w.from)} do ${fmtDate(w.to)} (${w.note}). Powołani zawodnicy opuszczą treningi klubu.` }));
      }
    }
    return { messages: out };
  },
});

// 4. Zapowiedź meczu klubu gracza dzień wcześniej
registerDailySystem({
  id: 'matchPreview', order: 40,
  run(state, date) {
    const tomorrow = addDays(date, 1);
    const f = (state.fixtures || []).find((x) => x.date === tomorrow && !x.played && (x.home === state.clubId || x.away === state.clubId));
    if (!f) return {};
    return {
      messages: [msg(date, {
        key: `preview:${f.id}`, category: 'staff', from: 'Asystent trenera', priority: 'info',
        subject: `Jutro mecz: ${f.comp}`,
        body: 'Przygotowałem raport o rywalu. Przed meczem zobaczysz go w studiu przedmeczowym.',
      })],
    };
  },
});
