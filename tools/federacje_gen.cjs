// Generator src/data/reprezentacje_swiat.json: reprezentacje CONMEBOL, CONCACAF, OFC, CAF i AFC (stan wiedzy: Nov 13, 2026).
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
const CAF = [
  // Afryka Północna (UNAF)
  ['MAR', 'Maroko', 'UNAF', 0, true], ['EGY', 'Egipt', 'UNAF', 0, true], ['ALG', 'Algieria', 'UNAF', 0, true],
  ['TUN', 'Tunezja', 'UNAF', 0, true], ['LBY', 'Libia', 'UNAF', 1450, true],
  // Afryka Zachodnia, strefa A (WAFU A)
  ['SEN', 'Senegal', 'WAFU-A', 0, true], ['MLI', 'Mali', 'WAFU-A', 0, true], ['CPV', 'Republika Zielonego Przylądka', 'WAFU-A', 1600, true],
  ['GUI', 'Gwinea', 'WAFU-A', 1560, true], ['MTN', 'Mauretania', 'WAFU-A', 1460, true], ['GAM', 'Gambia', 'WAFU-A', 1430, true],
  ['GNB', 'Gwinea Bissau', 'WAFU-A', 1430, true], ['SLE', 'Sierra Leone', 'WAFU-A', 1400, true], ['LBR', 'Liberia', 'WAFU-A', 1330, true],
  // Afryka Zachodnia, strefa B (WAFU B)
  ['NGA', 'Nigeria', 'WAFU-B', 0, true], ['CIV', 'Wybrzeże Kości Słoniowej', 'WAFU-B', 0, true], ['GHA', 'Ghana', 'WAFU-B', 1620, true],
  ['BFA', 'Burkina Faso', 'WAFU-B', 1600, true], ['BEN', 'Benin', 'WAFU-B', 1480, true], ['TOG', 'Togo', 'WAFU-B', 1420, true],
  ['NIG', 'Niger', 'WAFU-B', 1380, true],
  // Afryka Środkowa (UNIFFAC)
  ['CMR', 'Kamerun', 'UNIFFAC', 0, true], ['COD', 'Demokratyczna Republika Konga', 'UNIFFAC', 1650, true], ['GAB', 'Gabon', 'UNIFFAC', 1520, true],
  ['EQG', 'Gwinea Równikowa', 'UNIFFAC', 1460, true], ['CGO', 'Kongo', 'UNIFFAC', 1400, true], ['CTA', 'Republika Środkowoafrykańska', 'UNIFFAC', 1350, true],
  ['CHA', 'Czad', 'UNIFFAC', 1150, true], ['STP', 'Wyspy Świętego Tomasza i Książęca', 'UNIFFAC', 1050, true],
  // Afryka Wschodnia (CECAFA)
  ['UGA', 'Uganda', 'CECAFA', 1480, true], ['KEN', 'Kenia', 'CECAFA', 1440, true], ['TAN', 'Tanzania', 'CECAFA', 1420, true],
  ['SDN', 'Sudan', 'CECAFA', 1400, true], ['BDI', 'Burundi', 'CECAFA', 1340, true], ['RWA', 'Rwanda', 'CECAFA', 1330, true],
  ['ETH', 'Etiopia', 'CECAFA', 1290, true], ['SSD', 'Sudan Południowy', 'CECAFA', 1150, true], ['ZAN', 'Zanzibar', 'CECAFA', 1100, false],
  ['DJI', 'Dżibuti', 'CECAFA', 950, true], ['ERI', 'Erytrea', 'CECAFA', 950, true], ['SOM', 'Somalia', 'CECAFA', 900, true],
  // Afryka Południowa (COSAFA)
  ['RSA', 'RPA', 'COSAFA', 0, true], ['ANG', 'Angola', 'COSAFA', 1520, true], ['ZAM', 'Zambia', 'COSAFA', 1500, true],
  ['MAD', 'Madagaskar', 'COSAFA', 1450, true], ['NAM', 'Namibia', 'COSAFA', 1440, true], ['MOZ', 'Mozambik', 'COSAFA', 1420, true],
  ['ZIM', 'Zimbabwe', 'COSAFA', 1420, true], ['COM', 'Komory', 'COSAFA', 1370, true], ['MWI', 'Malawi', 'COSAFA', 1350, true],
  ['BOT', 'Botswana', 'COSAFA', 1320, true], ['LES', 'Lesotho', 'COSAFA', 1270, true], ['SWZ', 'Eswatini', 'COSAFA', 1250, true],
  ['REU', 'Reunion', 'COSAFA', 1150, false], ['MRI', 'Mauritius', 'COSAFA', 1100, true], ['SEY', 'Seszele', 'COSAFA', 950, true],
];
const AFC = [
  // Azja Zachodnia, Bliski Wschód (WAFF)
  ['JOR', 'Jordania', 'WAFF', 1640, true], ['KSA', 'Arabia Saudyjska', 'WAFF', 1650, true], ['IRQ', 'Irak', 'WAFF', 1620, true],
  ['QAT', 'Katar', 'WAFF', 1600, true], ['UAE', 'Zjednoczone Emiraty Arabskie', 'WAFF', 1590, true], ['OMA', 'Oman', 'WAFF', 1550, true],
  ['SYR', 'Syria', 'WAFF', 1520, true], ['BHR', 'Bahrajn', 'WAFF', 1500, true], ['PLE', 'Palestyna', 'WAFF', 1480, true],
  ['LBN', 'Liban', 'WAFF', 1450, true], ['KUW', 'Kuwejt', 'WAFF', 1420, true], ['YEM', 'Jemen', 'WAFF', 1300, true],
  // Azja Środkowa (CAFA)
  ['IRN', 'Iran', 'CAFA', 0, true], ['UZB', 'Uzbekistan', 'CAFA', 1680, true], ['TJK', 'Tadżykistan', 'CAFA', 1450, true],
  ['KGZ', 'Kirgistan', 'CAFA', 1430, true], ['TKM', 'Turkmenistan', 'CAFA', 1330, true], ['AFG', 'Afganistan', 'CAFA', 1180, true],
  // Azja Południowa (SAFF)
  ['IND', 'Indie', 'SAFF', 1340, true], ['BAN', 'Bangladesz', 'SAFF', 1120, true], ['NEP', 'Nepal', 'SAFF', 1050, true],
  ['MDV', 'Malediwy', 'SAFF', 1050, true], ['PAK', 'Pakistan', 'SAFF', 870, true], ['BHU', 'Bhutan', 'SAFF', 850, true],
  ['SRI', 'Sri Lanka', 'SAFF', 820, true],
  // Azja Wschodnia (EAFF)
  ['JPN', 'Japonia', 'EAFF', 0, true], ['KOR', 'Korea Płd.', 'EAFF', 0, true], ['CHN', 'Chiny', 'EAFF', 1520, true],
  ['PRK', 'Korea Płn.', 'EAFF', 1460, true], ['HKG', 'Hongkong', 'EAFF', 1300, true], ['TPE', 'Tajwan', 'EAFF', 1180, true],
  ['MNG', 'Mongolia', 'EAFF', 950, true], ['GUM', 'Guam', 'EAFF', 850, true], ['MAC', 'Makau', 'EAFF', 760, true],
  ['NMI', 'Mariany Północne', 'EAFF', 650, false],
  // Azja Południowo-Wschodnia (AFF, z Australią)
  ['AUS', 'Australia', 'AFF', 0, true], ['THA', 'Tajlandia', 'AFF', 1480, true], ['VIE', 'Wietnam', 'AFF', 1470, true],
  ['IDN', 'Indonezja', 'AFF', 1430, true], ['MAS', 'Malezja', 'AFF', 1380, true], ['PHI', 'Filipiny', 'AFF', 1250, true],
  ['MYA', 'Mjanma', 'AFF', 1200, true], ['SGP', 'Singapur', 'AFF', 1180, true], ['CAM', 'Kambodża', 'AFF', 1000, true],
  ['LAO', 'Laos', 'AFF', 950, true], ['BRU', 'Brunei', 'AFF', 850, true], ['TLS', 'Timor Wschodni', 'AFF', 800, true],
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
  CAF: {
    nazwa: 'Afrykańska Konfederacja Piłkarska (CAF)', region: 'Afryka', siedziba: 'Kair, Egipt', czlonkowie: CAF,
    strefy: { UNAF: 'Afryka Północna', 'WAFU-A': 'Afryka Zachodnia, strefa A', 'WAFU-B': 'Afryka Zachodnia, strefa B', UNIFFAC: 'Afryka Środkowa', CECAFA: 'Afryka Wschodnia', COSAFA: 'Afryka Południowa' },
    uwagi: 'Reunion i Zanzibar są członkami stowarzyszonymi CAF spoza FIFA.',
    turnieje: [{ nazwa: 'Puchar Narodów Afryki', format: '24 drużyny, 6 grup po 4, 1/8 finału', cykl: 'co 2 lata [do weryfikacji: plan przejścia na cykl 4-letni]' },
      { nazwa: 'Mistrzostwa Narodów Afryki (CHAN)', format: 'reprezentacje złożone z zawodników lig krajowych', cykl: 'co 2 lata' }],
  },
  AFC: {
    nazwa: 'Azjatycka Konfederacja Piłkarska (AFC)', region: 'Azja i Australia', siedziba: 'Kuala Lumpur, Malezja', czlonkowie: AFC,
    strefy: { WAFF: 'Azja Zachodnia (Bliski Wschód)', CAFA: 'Azja Środkowa', SAFF: 'Azja Południowa', EAFF: 'Azja Wschodnia', AFF: 'Azja Południowo-Wschodnia (z Australią)' },
    uwagi: 'Turcja (Azja Mniejsza), Izrael, Kazachstan, Gruzja, Armenia i Azerbejdżan grają w UEFA (są w reprezentacje.json). Mariany Północne to członek AFC spoza FIFA.',
    turnieje: [{ nazwa: 'Puchar Azji', format: '24 drużyny, 6 grup po 4, 1/8 finału', cykl: 'co 4 lata (następny 2027, Arabia Saudyjska) [do weryfikacji]' }],
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
