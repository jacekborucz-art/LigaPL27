// Polskie kluby sezonu 2026/27 (lista od użytkownika, Nov 10, 2026).
// L: średnia atrybutów kadry (1-20), z docs/ekspert_futbol.md, rozdz. 11.1. Wartości balansowe [SZAC].
// prestige: 1-10, coach: O ofensywny, S ostrożny, P pragmatyczny.
// colors: barwy do ikon zawodników [przybliżone, do edycji]. region: do wykrywania derbów.
// parent: id pierwszej drużyny (tylko rezerwy).
// Lista CLUBS_PL to kluby ze stałą kadrą (ligi 1-4). Na start: 54 kluby z tego pliku i 72 kluby III ligi
// (src/data/clubs_l3.js, 4 grupy po 18). Skład lig w kolejnych sezonach ustawia src/season/leagues.js
// (applyLeagueState): kluby spadające do IV ligi wypadają z listy, beniaminkowie z IV ligi do niej trafiają.

import { CLUBS_L3 } from './clubs_l3.js';
import { applyClubNames } from './clubNames.js';

export const TIERS = { EK: 1, L1: 2, L2: 3, L3: 4 };

export const LEAGUE_NAMES = {
  1: 'Ekstraklasa',
  2: '1 Liga',
  3: '2 Liga',
  4: 'III liga',
};
/** Numery grup III ligi (PZPN): I-IV. */
export const L3_GROUP_NAMES = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
/** Nazwa ligi klubu, w III lidze z grupą („III liga, grupa II”). */
export const leagueLabel = (club) => (club?.tier === 4 && club.group ? `III liga, grupa ${L3_GROUP_NAMES[club.group] ?? club.group}` : LEAGUE_NAMES[club?.tier] ?? 'IV liga');

const c = (id, name, short, tier, L, prestige, coach, colors, region, extra = {}) => ({
  id, name, short, tier, L, prestige, coach, colors, region, ...extra,
});

export const CLUBS_PL = [
  // Ekstraklasa
  c('legia', 'Legia Warszawa', 'LEG', 1, 12.6, 10, 'O', ['#FFFFFF', '#00843D'], 'warszawa'),
  c('lech', 'Lech Poznań', 'LPO', 1, 12.6, 10, 'O', ['#0055A5', '#FFFFFF'], 'poznan'),
  c('rakow', 'Raków Częstochowa', 'RCZ', 1, 12.4, 8, 'P', ['#C8102E', '#003DA5'], 'czestochowa'),
  c('jagiellonia', 'Jagiellonia Białystok', 'JAG', 1, 12.0, 8, 'O', ['#FFD100', '#D50032'], 'bialystok'),
  c('widzew', 'Widzew Łódź', 'WID', 1, 11.8, 8, 'P', ['#C8102E', '#FFFFFF'], 'lodz'),
  c('pogon-szczecin', 'Pogoń Szczecin', 'POG', 1, 11.7, 7, 'O', ['#0C2340', '#8A1538'], 'szczecin'),
  c('wieczysta', 'Wieczysta Kraków', 'WIE', 1, 11.6, 5, 'P', ['#FFD100', '#111111'], 'krakow'),
  c('gornik-zabrze', 'Górnik Zabrze', 'GZA', 1, 11.5, 8, 'O', ['#0047AB', '#FFFFFF'], 'slask'),
  c('wisla-krakow', 'Wisła Kraków', 'WKR', 1, 11.4, 9, 'O', ['#D50032', '#FFFFFF'], 'krakow'),
  c('cracovia', 'Cracovia', 'CRA', 1, 11.4, 7, 'P', ['#E30613', '#FFFFFF'], 'krakow'),
  c('piast', 'Piast Gliwice', 'PIA', 1, 11.2, 6, 'S', ['#C8102E', '#002F6C'], 'slask'),
  c('slask', 'Śląsk Wrocław', 'SLA', 1, 11.2, 7, 'P', ['#007A33', '#FFFFFF'], 'wroclaw'),
  c('zaglebie-lubin', 'Zagłębie Lubin', 'ZAG', 1, 11.1, 6, 'P', ['#F47920', '#00703C'], 'dolny-slask'),
  c('motor', 'Motor Lublin', 'MOT', 1, 11.0, 6, 'O', ['#FFD100', '#003DA5'], 'lublin'),
  c('korona', 'Korona Kielce', 'KOR', 1, 11.0, 6, 'S', ['#FFD100', '#E30613'], 'kielce'),
  c('gks-katowice', 'GKS Katowice', 'GKS', 1, 11.0, 6, 'P', ['#007A33', '#FFD100'], 'slask'),
  c('radomiak', 'Radomiak Radom', 'RAD', 1, 10.9, 5, 'P', ['#00843D', '#FFFFFF'], 'radom'),
  c('wisla-plock', 'Wisła Płock', 'WPL', 1, 10.9, 6, 'S', ['#0057B8', '#FFFFFF'], 'plock'),

  // 1 Liga
  c('lechia-gdansk', 'Lechia Gdańsk', 'LGD', 2, 10.8, 8, 'O', ['#00843D', '#FFFFFF'], 'trojmiasto'),
  c('arka', 'Arka Gdynia', 'ARK', 2, 10.5, 7, 'P', ['#FFD100', '#003DA5'], 'trojmiasto'),
  c('stal-mielec', 'Stal Mielec', 'SMI', 2, 10.4, 6, 'S', ['#0057B8', '#FFFFFF'], 'podkarpacie'),
  c('puszcza', 'Puszcza Niepołomice', 'PUS', 2, 10.4, 4, 'S', ['#00703C', '#C8102E'], 'krakow'),
  c('termalica', 'Bruk-Bet Termalica Nieciecza', 'TER', 2, 10.4, 5, 'P', ['#F47920', '#003DA5'], 'malopolska'),
  c('ruch', 'Ruch Chorzów', 'RUC', 2, 10.3, 8, 'P', ['#0057B8', '#FFFFFF'], 'slask'),
  c('lks', 'ŁKS Łódź', 'LKS', 2, 10.2, 7, 'O', ['#C8102E', '#FFFFFF'], 'lodz'),
  c('miedz', 'Miedź Legnica', 'MIE', 2, 10.2, 6, 'P', ['#00843D', '#C8102E'], 'dolny-slask'),
  c('polonia-warszawa', 'Polonia Warszawa', 'PWA', 2, 10.1, 7, 'O', ['#111111', '#C8102E'], 'warszawa'),
  c('stal-rzeszow', 'Stal Rzeszów', 'SRZ', 2, 9.8, 5, 'P', ['#0057B8', '#FFFFFF'], 'rzeszow'),
  c('podbeskidzie', 'Podbeskidzie Bielsko-Biała', 'POD', 2, 9.7, 6, 'S', ['#C8102E', '#003DA5'], 'bielsko'),
  c('odra-opole', 'Odra Opole', 'ODR', 2, 9.7, 5, 'P', ['#003DA5', '#C8102E'], 'opole'),
  c('warta', 'Warta Poznań', 'WAR', 2, 9.7, 5, 'S', ['#00703C', '#FFFFFF'], 'poznan'),
  c('polonia-bytom', 'Polonia Bytom', 'PBY', 2, 9.7, 6, 'O', ['#003DA5', '#C8102E'], 'slask'),
  c('chrobry', 'Chrobry Głogów', 'CHR', 2, 9.6, 4, 'S', ['#F47920', '#111111'], 'dolny-slask'),
  c('pogon-grodzisk', 'Pogoń Grodzisk Mazowiecki', 'PGR', 2, 9.6, 3, 'P', ['#0057B8', '#FFD100'], 'mazowsze'),
  c('pogon-siedlce', 'Pogoń Siedlce', 'PSI', 2, 9.6, 4, 'P', ['#C8102E', '#0057B8'], 'mazowsze'),
  c('unia-skierniewice', 'Unia Skierniewice', 'UNI', 2, 9.3, 3, 'S', ['#0057B8', '#FFFFFF'], 'lodzkie'),

  // 2 Liga
  c('gks-tychy', 'GKS Tychy', 'TYC', 3, 9.2, 6, 'P', ['#00843D', '#C8102E'], 'slask'),
  c('gornik-leczna', 'Górnik Łęczna', 'GLE', 3, 9.1, 5, 'P', ['#00843D', '#111111'], 'lublin'),
  c('zawisza', 'Zawisza Bydgoszcz', 'ZAW', 3, 8.8, 6, 'O', ['#003DA5', '#111111'], 'bydgoszcz'),
  c('sandecja', 'Sandecja Nowy Sącz', 'SAN', 3, 8.8, 5, 'S', ['#111111', '#FFFFFF'], 'malopolska'),
  c('znicz', 'Znicz Pruszków', 'ZNI', 3, 8.8, 4, 'O', ['#C8102E', '#FFFFFF'], 'mazowsze'),
  c('chojniczanka', 'Chojniczanka Chojnice', 'CHO', 3, 8.7, 4, 'P', ['#C8102E', '#FFFFFF'], 'pomorze'),
  c('stal-stalowa-wola', 'Stal Stalowa Wola', 'SSW', 3, 8.6, 5, 'P', ['#00843D', '#111111'], 'podkarpacie'),
  c('resovia', 'Resovia Rzeszów', 'RES', 3, 8.6, 4, 'P', ['#C8102E', '#FFFFFF'], 'rzeszow'),
  c('olimpia-grudziadz', 'Olimpia Grudziądz', 'OLI', 3, 8.5, 4, 'S', ['#00843D', '#FFFFFF'], 'kujawy'),
  c('hutnik', 'Hutnik Kraków', 'HUT', 3, 8.5, 4, 'O', ['#0057B8', '#FFFFFF'], 'krakow'),
  c('legia-ii', 'Legia II Warszawa', 'LE2', 3, 8.4, 3, 'O', ['#FFFFFF', '#00843D'], 'warszawa', { parent: 'legia' }),
  c('podhale', 'NKP Podhale Nowy Targ', 'NKP', 3, 8.2, 2, 'S', ['#0057B8', '#FFFFFF'], 'malopolska'),
  c('avia', 'Avia Świdnik', 'AVI', 3, 8.2, 3, 'S', ['#0057B8', '#FFD100'], 'lublin'),
  c('swit', 'Świt Szczecin', 'SWI', 3, 8.2, 2, 'P', ['#FFD100', '#0057B8'], 'szczecin'),
  c('slask-ii', 'Śląsk Wrocław II', 'SL2', 3, 8.1, 2, 'O', ['#007A33', '#FFFFFF'], 'wroclaw', { parent: 'slask' }),
  c('lechia-zg', 'Lechia Zielona Góra', 'LZG', 3, 8.1, 2, 'P', ['#00843D', '#FFFFFF'], 'lubuskie'),
  c('rekord', 'Rekord Bielsko-Biała', 'REK', 3, 8.1, 2, 'P', ['#00843D', '#FFFFFF'], 'bielsko'),
  c('sokol-kleczew', 'Sokół Kleczew', 'SOK', 3, 8.0, 2, 'S', ['#0057B8', '#FFFFFF'], 'wielkopolska'),
];
// Nazwy do publikacji (fikcyjne; prawdziwe w clubNames.js), także rezerwy w 2 Lidze i III lidze: tylko w przeglądarce
applyClubNames(CLUBS_PL);
applyClubNames(CLUBS_L3);

for (const c of CLUBS_L3) CLUBS_PL.push(c);

export function clubsInTier(tier, clubs = CLUBS_PL) {
  return clubs.filter((cl) => cl.tier === tier);
}

// Indeks klubów po id (126 klubów i więcej: liniowe szukanie było zbyt wolne w pętlach po zawodnikach).
// Przebudowa, gdy zmieni się skład listy (touchClubs() z src/season/leagues.js albo inna długość).
let INDEX = null; let INDEX_LEN = -1;
export function touchClubs() { INDEX = null; }
export function clubById(id, clubs = CLUBS_PL) {
  if (clubs !== CLUBS_PL) return clubs.find((cl) => cl.id === id) || null;
  if (!INDEX || INDEX_LEN !== CLUBS_PL.length) { INDEX = new Map(CLUBS_PL.map((c) => [c.id, c])); INDEX_LEN = CLUBS_PL.length; }
  return INDEX.get(id) ?? null;
}
