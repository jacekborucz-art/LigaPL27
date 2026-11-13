// Generator src/data/reprezentacje_swiat.json: reprezentacje CONMEBOL, CONCACAF i OFC (stan wiedzy: Nov 13, 2026).
// Siła L tym samym wzorem co reprezentacje.json (docs/reprezentacje.md, rozdz. 2). Elo to szacunki (eloratings.net
// niedostępne w tej sesji); dla krajów obecnych już w reprezentacje.json brane są tamtejsze Elo, żeby dane były spójne.
// Uruchom: node tools/federacje_gen.cjs
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '../src/data/reprezentacje_swiat.json');
const BASE = require('../src/data/reprezentacje.json').reprezentacje;
const baseElo = new Map(BASE.map((t) => [t.kod, t]));

function liczL(elo) {
  const raw = 7 + (elo - 860) / 125;
  const soft = raw > 16.5 ? 16.5 + (raw - 16.5) * 0.25 : raw;
  return Math.round(Math.max(6.5, soft) * 10) / 10;
}

// [kod, nazwa, strefa, elo (szacunek), czlonekFIFA]
const CONMEBOL = [
  ['ARG', 'Argentyna', null, 0, true], ['BRA', 'Brazylia', null, 0, true], ['URU', 'Urugwaj', null, 0, true],
  ['COL', 'Kolumbia', null, 0, true], ['ECU', 'Ekwador', null, 0, true], ['PAR', 'Paragwaj', null, 0, true],
  ['VEN', 'Wenezuela', null, 0, true], ['CHI', 'Chile', null, 0, true], ['PER', 'Peru', null, 1700, true],
  ['BOL', 'Boliwia', null, 1580, true],
];
const CONCACAF = [
  // Strefa północnoamerykańska (NAFU)
  ['MEX', 'Meksyk', 'NAFU', 0, true], ['USA', 'USA', 'NAFU', 0, true], ['CAN', 'Kanada', 'NAFU', 0, true],
  // Strefa środkowoamerykańska (UNCAF)
  ['PAN', 'Panama', 'UNCAF', 0, true], ['CRC', 'Kostaryka', 'UNCAF', 1660, true], ['HON', 'Honduras', 'UNCAF', 1600, true],
  ['GUA', 'Gwatemala', 'UNCAF', 1540, true], ['SLV', 'Salwador', 'UNCAF', 1500, true], ['NCA', 'Nikaragua', 'UNCAF', 1400, true],
  ['BLZ', 'Belize', 'UNCAF', 1190, true],
  // Strefa karaibska (CFU)
  ['JAM', 'Jamajka', 'CFU', 1650, true], ['HAI', 'Haiti', 'CFU', 1600, true], ['CUW', 'Curaçao', 'CFU', 1610, true],
  ['SUR', 'Surinam', 'CFU', 1560, true], ['TRI', 'Trynidad i Tobago', 'CFU', 1540, true], ['GLP', 'Gwadelupa', 'CFU', 1380, false],
  ['MTQ', 'Martynika', 'CFU', 1400, false], ['DOM', 'Dominikana', 'CFU', 1360, true], ['GUF', 'Gujana Francuska', 'CFU', 1260, false],
  ['CUB', 'Kuba', 'CFU', 1320, true], ['GUY', 'Gujana', 'CFU', 1330, true], ['BER', 'Bermudy', 'CFU', 1290, true],
  ['PUR', 'Portoryko', 'CFU', 1260, true], ['SKN', 'Saint Kitts i Nevis', 'CFU', 1240, true], ['GRN', 'Grenada', 'CFU', 1220, true],
  ['ATG', 'Antigua i Barbuda', 'CFU', 1200, true], ['LCA', 'Saint Lucia', 'CFU', 1190, true], ['VIN', 'Saint Vincent i Grenadyny', 'CFU', 1170, true],
  ['BRB', 'Barbados', 'CFU', 1140, true], ['ARU', 'Aruba', 'CFU', 1100, true], ['DMA', 'Dominika', 'CFU', 1080, true],
  ['SMN', 'Saint-Martin', 'CFU', 1060, false], ['CAY', 'Kajmany', 'CFU', 1040, true], ['BAH', 'Bahamy', 'CFU', 1000, true],
  ['SMA', 'Sint Maarten', 'CFU', 1000, false], ['MSR', 'Montserrat', 'CFU', 990, true], ['BOE', 'Bonaire', 'CFU', 950, false],
  ['TCA', 'Turks i Caicos', 'CFU', 900, true], ['VGB', 'Brytyjskie Wyspy Dziewicze', 'CFU', 880, true],
  ['VIR', 'Wyspy Dziewicze Stanów Zjednoczonych', 'CFU', 850, true], ['AIA', 'Anguilla', 'CFU', 800, true],
];
const OFC = [
  ['NZL', 'Nowa Zelandia', null, 1620, true], ['NCL', 'Nowa Kaledonia', null, 1260, true], ['SOL', 'Wyspy Salomona', null, 1210, true],
  ['FIJ', 'Fidżi', null, 1170, true], ['TAH', 'Tahiti', null, 1160, true], ['VAN', 'Vanuatu', null, 1110, true],
  ['PNG', 'Papua-Nowa Gwinea', null, 1060, true], ['SAM', 'Samoa', null, 900, true], ['TGA', 'Tonga', null, 860, true],
  ['COK', 'Wyspy Cooka', null, 850, true], ['ASA', 'Samoa Amerykańskie', null, 780, true],
  // Członkowie stowarzyszeni OFC (poza FIFA)
  ['KIR', 'Kiribati', null, 650, false], ['TUV', 'Tuvalu', null, 640, false],
];

const FED = {
  CONMEBOL: {
    nazwa: 'Konfederacja Południowoamerykańska (CONMEBOL)', region: 'Ameryka Południowa', siedziba: 'Luque, Paragwaj', czlonkowie: CONMEBOL,
    turnieje: [{ nazwa: 'Copa América', format: '16 drużyn (10 z CONMEBOL i 6 zaproszonych z CONCACAF), 4 grupy po 4, ćwierćfinały', cykl: 'zwykle co 4 lata [do weryfikacji terminu kolejnej edycji]' },
      { nazwa: 'Eliminacje do mistrzostw świata', format: 'jedna liga, 10 drużyn, mecz i rewanż (18 kolejek)', cykl: 'co 4 lata' }],
  },
  CONCACAF: {
    nazwa: 'Konfederacja Piłkarska Ameryki Północnej, Środkowej i Karaibów (CONCACAF)', region: 'Ameryka Północna, Środkowa i Karaiby', siedziba: 'Miami, USA', czlonkowie: CONCACAF,
    strefy: { NAFU: 'Strefa północnoamerykańska', UNCAF: 'Strefa środkowoamerykańska', CFU: 'Strefa karaibska' },
    turnieje: [{ nazwa: 'Złoty Puchar CONCACAF', format: '16 drużyn, 4 grupy po 4, faza pucharowa', cykl: 'co 2 lata (lata nieparzyste)' },
      { nazwa: 'Liga Narodów CONCACAF', format: 'dywizje A, B, C z awansami i spadkami, finały czterech najlepszych', cykl: 'co 2 lata' }],
  },
  OFC: {
    nazwa: 'Konfederacja Piłkarska Oceanii (OFC)', region: 'Oceania', siedziba: 'Auckland, Nowa Zelandia', czlonkowie: OFC,
    uwagi: 'Australia od 2006 roku gra w AFC (Azja), dlatego jej tu nie ma (jest w reprezentacje.json jako AFC).',
    turnieje: [{ nazwa: 'Puchar Narodów Oceanii (OFC Nations Cup)', format: '8 drużyn, 2 grupy po 4, półfinały i finał', cykl: 'zwykle co 4 lata [do weryfikacji]' }],
  },
};

const teams = [];
for (const [konf, F] of Object.entries(FED)) {
  for (const [kod, nazwa, strefa, elo0, fifa] of F.czlonkowie) {
    const base = baseElo.get(kod);
    const elo = base?.elo ?? elo0;
    teams.push({
      kod, nazwa: base?.nazwa ?? nazwa, konfederacja: konf, strefa: strefa ?? null, czlonekFIFA: fifa,
      rankingFIFA: base?.rankingFIFA ?? null, elo, L: base?.L ?? liczL(elo),
      eloZrodlo: base ? 'reprezentacje.json (ten sam szacunek)' : 'szacunek (eloratings.net niedostępne; do podmiany)',
    });
  }
}
const out = {
  meta: {
    stan: '2026-11-13',
    opis: 'Reprezentacje federacji CONMEBOL, CONCACAF i OFC do mistrzostw kontynentalnych w tle. Siła L jak w reprezentacje.json.',
    wzorL: 'L = 7 + (Elo - 860) / 125; powyżej 16,5 miękki sufit 16,5 + 0,25 x nadwyżka; minimum 6,5',
    liczby: Object.fromEntries(Object.entries(FED).map(([k, F]) => [k, F.czlonkowie.length])),
  },
  federacje: Object.fromEntries(Object.entries(FED).map(([k, F]) => [k, { ...F, czlonkowie: F.czlonkowie.map((x) => x[0]) }])),
  reprezentacje: teams,
};
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log('zapisano', OUT, teams.length, 'reprezentacji', out.meta.liczby);
