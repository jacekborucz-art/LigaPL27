// Odnośniki w wiadomościach Poczty: przyciski, które przenoszą do ekranu, którego wiadomość dotyczy (zawodnik, rozmowy,
// kontrakty, rynek, sponsorzy, sztab, obozy, rozgrywki...). Ten sam mechanizm co w panelu „Ten tydzień” na Pulpicie
// (src/career/weeklyTodo.js, STEPS): lista kroków data-act wykonywana po kolei (runMenuItem w src/app.js).
// Przyciski tylko przenoszą, niczego nie zmieniają. Rodzaj wiadomości z klucza (m.key, np. „prosba:<id zawodnika>:...”)
// i z m.refs; zawodnik z segmentu klucza albo z refs, jeśli nadal jest w świecie gry.

const go = (label, steps, focus) => ({ label, run: { steps, ...(focus ? { focus } : {}) } });
const TO = {
  profile: (id) => go('Profil zawodnika', [{ act: 'tab', tab: 'kadra' }, { act: 'tsub', s: 'players' }, { act: 'player', id }], '[data-act="squadback"]'),
  talk: (id) => go('Porozmawiaj z zawodnikiem', [{ act: 'tab', tab: 'kadra' }, { act: 'tsub', s: 'talks' }, { act: 'tt-open', id }]),
  card: (id, own) => go(own ? 'Karta transferowa' : 'Karta zawodnika', [{ act: 'tab', tab: 'transfery', sub: own ? 'kontrakty' : 'rynek' }, { act: 'tf-open', id }], '[data-act="tf-close"]'),
  transfers: (sub, label) => go(label, [{ act: 'tab', tab: 'transfery', sub }]),
  klub: (sub, label) => go(label, [{ act: 'tab', tab: 'klub', sub }]),
  training: (tab, label) => go(label, [{ act: 'tab', tab: 'trening' }, { act: 'tr-tab', tab }]),
  squad: (s, label) => go(label, [{ act: 'tab', tab: 'kadra' }, { act: 'tsub', s }]),
  comp: (c, label) => go(label, c ? [{ act: 'tab', tab: 'rozgrywki' }, { act: 'ccomp', c }] : [{ act: 'tab', tab: 'rozgrywki' }]),
};

// Rodzaj wiadomości (początek klucza) -> odnośniki do ekranów
const BY_KIND = {
  kontrakty: () => [TO.transfers('kontrakty', 'Kontrakty')],
  'kontrakty-czerwiec': () => [TO.transfers('kontrakty', 'Kontrakty')],
  'limit-kadry': () => [TO.transfers('kontrakty', 'Kontrakty i limit kadry')],
  'limit-kadry-dzialania': () => [TO.transfers('kontrakty', 'Kontrakty i limit kadry')],
  'limit-kadry-przyp': () => [TO.transfers('kontrakty', 'Kontrakty i limit kadry')],
  'limit-kadry-lista': () => [TO.transfers('kontrakty', 'Kontrakty i limit kadry')],
  'tw-open': () => [TO.transfers('rynek', 'Rynek transferowy')],
  'tw-warn': () => [TO.transfers('rynek', 'Rynek transferowy')],
  'tw-close': () => [TO.transfers('rynek', 'Rynek transferowy')],
  okno: () => [TO.transfers('rynek', 'Rynek transferowy')],
  'okno-koniec': () => [TO.transfers('rynek', 'Rynek transferowy')],
  rynek: () => [TO.transfers('rynek', 'Rynek transferowy')],
  oferta: () => [TO.transfers('oferty', 'Oferty')],
  deal: () => [TO.transfers('wtoku', 'Transakcje w toku')],
  'pre-pyta': () => [TO.transfers('wtoku', 'W toku')],
  'pre-rozmawia': () => [TO.transfers('wtoku', 'W toku')],
  'pre-podpisal': () => [TO.transfers('wtoku', 'W toku')],
  'wyp-rynek': () => [TO.transfers('kontrakty', 'Wypożyczenia')],
  'wyp-propozycje': () => [TO.transfers('kontrakty', 'Wypożyczenia')],
  'wyp-koniec': () => [TO.transfers('kontrakty', 'Wypożyczenia')],
  'wyp-brak': () => [TO.transfers('kontrakty', 'Wypożyczenia')],
  sponsor: () => [TO.klub('sponsorzy', 'Sponsorzy')],
  'sponsor-oferta': () => [TO.klub('sponsorzy', 'Sponsorzy')],
  'sponsor-umowa': () => [TO.klub('sponsorzy', 'Sponsorzy')],
  'sponsor-awans': () => [TO.klub('sponsorzy', 'Sponsorzy')],
  'sponsor-spadek': () => [TO.klub('sponsorzy', 'Sponsorzy')],
  'sponsor-premia': () => [TO.klub('sponsorzy', 'Sponsorzy')],
  'sponsor-podwyzka': () => [TO.klub('sponsorzy', 'Sponsorzy')],
  'sponsor-partner': () => [TO.klub('sponsorzy', 'Sponsorzy')],
  'sponsor-klopoty': () => [TO.klub('sponsorzy', 'Sponsorzy')],
  'sponsor-zarzad': () => [TO.klub('sponsorzy', 'Sponsorzy')],
  zarzad: () => [TO.klub('zarzad', 'Zarząd')],
  'zarzad-lato': () => [TO.klub('zarzad', 'Zarząd')],
  komisja: () => [TO.klub('infrastruktura', 'Infrastruktura')],
  'komisja-wniosek': () => [TO.klub('infrastruktura', 'Infrastruktura')],
  licencja: () => [TO.klub('infrastruktura', 'Infrastruktura')],
  'sztab-wakat': () => [TO.training('sztab', 'Sztab')],
  'sztab-podbieranie': () => [TO.training('sztab', 'Sztab')],
  'sztab-koniec': () => [TO.training('sztab', 'Sztab')],
  'staff-intro': () => [TO.training('sztab', 'Sztab')],
  oboz: () => [TO.training('obozy', 'Obozy')],
  'sparing-odwolany': () => [TO.training('sparingi', 'Sparingi')],
  zebranie: () => [TO.squad('talks', 'Rozmowy')],
  'autorytet-niski': () => [TO.squad('talks', 'Rozmowy')],
  'autorytet-wysoki': () => [TO.squad('talks', 'Rozmowy')],
  rezerwy: () => [TO.squad('reserves', 'Rezerwy')],
  'rezerwy-awaria': () => [TO.squad('reserves', 'Rezerwy')],
  callups: () => [TO.comp('NT', 'Reprezentacje')],
  nt: () => [TO.comp('NT', 'Reprezentacje')],
  intl: () => [TO.comp('NT', 'Reprezentacje')],
  pp: () => [TO.comp('pp', 'Puchar Polski')],
  'pp-draw': () => [TO.comp('pp', 'Puchar Polski')],
  'league-start': () => [TO.comp(null, 'Rozgrywki')],
  round: () => [TO.comp(null, 'Rozgrywki')],
  'round-end': () => [TO.comp(null, 'Rozgrywki')],
  moved: () => [TO.comp(null, 'Terminarz i rozgrywki')],
};

/** Zawodnik, którego dotyczy wiadomość: segment klucza albo refs (tylko gdy nadal jest w grze). */
function playerOf(game, m) {
  const P = game.world?.players ?? {};
  const r = m.refs ?? {};
  for (const id of [r.playerId, r.pid]) if (id && P[id]) return P[id];
  for (const seg of String(m.key ?? '').split(':').slice(1)) if (P[seg]) return P[seg];
  return null;
}

/** Odnośniki wiadomości m: [{ label, run }]. Bez odnośników dla raportów, które mają własne przyciski. */
export function mailLinks(game, m) {
  if (!m || m.refs?.kind === 'teamReport' || m.refs?.kind === 'matchReport') return [];
  const kind = String(m.key ?? '').split(':')[0];
  const out = [];
  const p = playerOf(game, m);
  if (p) {
    const own = p.clubId === game.clubId;
    if (own && game.world.clubs?.[game.clubId]?.squad?.includes(p.id)) out.push(TO.profile(p.id), TO.talk(p.id));
    out.push(TO.card(p.id, own));
  }
  for (const l of BY_KIND[kind]?.() ?? []) if (!out.some((x) => x.label === l.label)) out.push(l);
  return out.slice(0, 4);
}
