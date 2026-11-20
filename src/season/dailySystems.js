// Systemy dnia oparte na kalendarzu 2026/27. Każdy jest niezależny i rejestruje się w pętli dni.
// Wiadomości od zawodników, kontuzje, finanse itd. dojdą jako kolejne systemy w następnych etapach.

import { registerDailySystem, addDays } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { DOMESTIC, UEFA, FIFA_WINDOWS, POLISH_EUROPE_2026, SEASON_START, SEASON, SEASON_YEAR } from '../config/calendar2026.js';
import { LEAGUE_NAMES, clubById, leagueLabel } from '../data/clubs_pl.js';
import { seasonGoalFor } from '../career/board.js';
import { fmtDate } from '../ui/dom.js';

const COMP_NAMES = { LM: 'Liga Mistrzów', LE: 'Liga Europy', LK: 'Liga Konferencji' };

/** Cel sezonu od zarządu z siły kadry na tle ligi (ten sam model co zarząd, src/career/board.js). */
export function seasonGoal(club) {
  const { rank, text } = seasonGoalFor(club);
  return { rank, text };
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
  const leagueDay = club.tier === 4 ? DOMESTIC.liga3.start : europe ? addDays(DOMESTIC.ekstraklasa.start, 2) : DOMESTIC.ekstraklasa.start;
  out.push({ id: `L-${club.tier}-1`, date: leagueDay, comp: `${leagueLabel(club)}, 1. kolejka`, home: clubId, away: null });
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
          body: `Okno transferowe jest otwarte do ${fmtDate(DOMESTIC.transferWindows[0].to)}. ${europe ? `Zaczynamy od eliminacji: ${COMP_NAMES[europe.comp]}, runda ${europe.entry}.` : `Liga startuje ${fmtDate(clubById(state.clubId)?.tier === 4 ? DOMESTIC.liga3.start : DOMESTIC.ekstraklasa.start)}.`} Warto przejrzeć kadrę i ustalić plan treningów.`,
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
    if (!club) return {}; // trener bez klubu (src/career/jobMarket.js): brak wiadomości o lidze klubu
    const leagueStart = DOMESTIC[['ekstraklasa', 'liga1', 'liga2', 'liga3'][club.tier - 1]]?.start;
    if (!leagueStart) return {};
    if (date === addDays(leagueStart, -1)) {
      out.push(msg(date, { key: `league-start:${SEASON}`, category: 'competitions', from: LEAGUE_NAMES[club.tier], priority: 'info', subject: `Jutro startuje ${LEAGUE_NAMES[club.tier]}`, body: `Sezon ${SEASON} rusza ${fmtDate(leagueStart)}. 34 kolejki, mecz i rewanż${club.tier === 4 ? `, ${leagueLabel(club)}` : ''}.` }));
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

// 4. Koniec rundy (przystanek „Dalej”): dzień po ostatnim meczu o punkty jesieni i po ostatniej kolejce ligi wiosną
const isLeagueComp = (c) => c === 'ekstraklasa' || c === 'liga1' || c === 'liga2' || c?.startsWith('liga3-');
registerDailySystem({
  id: 'roundEnd', order: 41,
  run(state, date) {
    const mine = (state.fixtures || []).filter((f) => f.comp !== 'friendly' && f.date && (f.home === state.clubId || f.away === state.clubId));
    if (!mine.length) return {};
    const ny = `${SEASON_YEAR + 1}-01-01`;
    const winter = DOMESTIC.transferWindows?.[1];
    const lastAutumn = mine.filter((f) => f.date < ny).map((f) => f.date).sort().at(-1);
    if (lastAutumn && date === addDays(lastAutumn, 1)) {
      const spring = mine.map((f) => f.date).filter((d) => d >= ny).sort()[0];
      return { messages: [msg(date, {
        key: `round-end:${SEASON}:jesien`, category: 'staff', from: 'Asystent trenera', priority: 'important',
        subject: 'Koniec rundy jesiennej',
        body: `Runda jesienna za nami. ${spring ? `Wiosną gramy od ${fmtDate(spring)}. ` : ''}${winter ? `Zimowe okno transferowe: ${fmtDate(winter.from)} - ${fmtDate(winter.to)}. ` : ''}W przerwie warto zarezerwować obóz zimowy (Trening, zakładka Obozy) i przejrzeć kadrę.`,
      })] };
    }
    const lastLeague = mine.filter((f) => isLeagueComp(f.comp)).map((f) => f.date).sort().at(-1);
    if (lastLeague && lastLeague >= ny && date === addDays(lastLeague, 1)) {
      const more = mine.some((f) => !f.played && f.date >= date);
      return { messages: [msg(date, {
        key: `round-end:${SEASON}:wiosna`, category: 'staff', from: 'Asystent trenera', priority: 'important',
        subject: 'Koniec sezonu ligowego',
        body: `Ostatnia kolejka ligi za nami.${more ? ' Przed nami jeszcze mecze o stawkę (puchar albo baraże).' : ''} Nowy sezon zaczyna się 1 lipca: warto już planować kadrę, kontrakty i letnie okno transferowe.`,
      })] };
    }
    return {};
  },
});

// 5. Zapowiedź meczu klubu gracza dzień wcześniej
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
