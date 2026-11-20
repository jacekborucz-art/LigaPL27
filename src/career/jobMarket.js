// TYMCZASOWY STUB: ZASTĄPI logika z gałęzi kariery (src/career/jobMarket.js).
// Kontrakt API rynku pracy używany przez widok Kariera. Stub trzyma tylko listę aplikacji w zapisie
// i nie tworzy wakatów (lista ofert zawsze pusta).

export function jobState(game) {
  const J = game.manager?.job ?? {};
  const unemployed = J.status === 'unemployed';
  return {
    status: unemployed ? 'unemployed' : 'employed', since: J.since ?? null, days: 0, lastClub: J.lastClub ?? null,
    vacancies: J.vacancies ?? [], apps: J.apps ?? [], canApplyFrom: null,
    canResign: { ok: false, text: 'Rezygnacja będzie dostępna po wdrożeniu rynku pracy.' },
  };
}

export function applyJob(game, clubId) {
  const J = (game.manager.job ??= { status: 'employed', apps: [], vacancies: [] });
  J.apps ??= [];
  const v = (J.vacancies ?? []).find((x) => x.clubId === clubId);
  if (!v || J.apps.some((a) => a.clubId === clubId)) return { ok: false, text: 'Nie można wysłać aplikacji.' };
  J.apps.push({ clubId, name: v.name, date: game.date, state: 'czeka' });
  return { ok: true, text: `Aplikacja wysłana: ${v.name}.` };
}

export function withdrawApplication(game, clubId) {
  const J = game.manager?.job;
  if (!J) return { ok: false, text: 'Brak aplikacji.' };
  J.apps = (J.apps ?? []).filter((a) => a.clubId !== clubId);
  return { ok: true, text: 'Aplikacja wycofana.' };
}

export function resign(game) {
  return { ok: false, text: jobState(game).canResign.text };
}
