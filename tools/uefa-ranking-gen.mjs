// Generator danych rankingu UEFA: node tools/uefa-ranking-gen.mjs [--check]
// Wejście: tools/data/ranking_uefa_2026_27.txt (plik od właściciela: oficjalny ranking UEFA 5 sezonów
// 2022/23-2026/27, stan na Nov 5, 2026; przecinki dziesiętne). Wyjście: src/data/ranking_uefa.json.
// Kluby z rankingu łączone z klubami gry (src/data/kluby_uefa.json i polskie kluby z src/data/clubs_pl.js)
// po kraju i znormalizowanej nazwie; trudne przypadki w tabeli ALIASES. Kluby bez odpowiednika w grze
// zostają w danych z kluczem „x-...” (tylko do tabeli rankingu, nie grają). Raport dopasowań na ekranie.
// --check: tylko porównanie z istniejącym plikiem wyjściowym (kod wyjścia 1 przy różnicy).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { FICTIONAL } from '../src/data/clubNames.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'tools/data/ranking_uefa_2026_27.txt');
const OUT = join(root, 'src/data/ranking_uefa.json');
const UEFA = JSON.parse(readFileSync(join(root, 'src/data/kluby_uefa.json'), 'utf8'));

// ------------------------------------------------------------ Parser
const num = (s) => { const t = s.trim(); return t === '-' || t === '' ? null : Number(t.replace(/\s/g, '').replace(',', '.')); };

/** Wiersze tabeli z sekcji zaczynającej się od nagłówka `title` (do pustej linii po tabeli). */
function sectionRows(lines, title) {
  const start = lines.findIndex((l) => l.startsWith(title));
  if (start < 0) throw new Error(`Brak sekcji: ${title}`);
  const out = [];
  let inTable = false;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^-{4,}\+/.test(l)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!l.trim()) break;
    out.push(l.split('|').map((x) => x.trim()));
  }
  return out;
}

export function parseRanking(text) {
  const lines = text.split(/\r?\n/);
  const stan = (text.match(/Stan punktacji:\s*([^|]+)/) ?? [])[1]?.trim() ?? null;
  const countries = {};
  for (const r of sectionRows(lines, 'PEŁNY RANKING FEDERACJI')) {
    const [place, name, code, a, b, c, d, e, sum, left] = r;
    if (countries[code]) continue;
    countries[code] = { place: Number(place), name, seasons: [a, b, c, d, e].map(num), sum: num(sum), entrants: Number(String(left).split('/')[1] ?? 0) };
  }
  const clubs = [];
  const seen = new Set();
  for (const r of sectionRows(lines, 'PEŁNY RANKING KLUBÓW')) {
    const [place, name, code, a, b, c, d, e, own, thr, coef] = r;
    const key = `${name}|${code}`;
    if (seen.has(key)) continue; // w pliku źródłowym Paris Saint-Germain występuje dwa razy
    seen.add(key);
    clubs.push({ place: Number(place), name, country: code, seasons: [a, b, c, d, e].map(num), own: num(own), threshold: num(thr), coef: num(coef) });
  }
  return { stan, countries, clubs };
}

// ------------------------------------------------------------ Dopasowanie nazw
// Ranking -> id klubu w grze, gdy nazwy różnią się za bardzo (polskie egzonimy, pełne nazwy oficjalne).
export const ALIASES = {
  'FC Internazionale Milano|ITA': 'inter',
  'Sporting Clube de Portugal|POR': 'sporting',
  'Atlético de Madrid|ESP': 'atletico',
  'Real Betis Balompié|ESP': 'real-betis',
  'Bayer 04 Leverkusen|GER': 'leverkusen',
  'FC Shakhtar Donetsk|UKR': 'szachtar',
  'FK Crvena Zvezda|SRB': 'crvena-zvezda',
  'FK Crvena zvezda|SRB': 'crvena-zvezda',
  'GNK Dinamo Zagreb|CRO': 'dinamo-zagrzeb',
  'FC Salzburg|AUT': 'salzburg',
  'FC København|DEN': 'kopenhaga',
  'FC Copenhagen|DEN': 'kopenhaga',
  'Sport Lisboa e Benfica|POR': 'benfica',
  'SL Benfica|POR': 'benfica',
  'Athletic Club|ESP': 'athletic',
  'Eintracht Frankfurt|GER': 'eintracht',
  'SS Lazio|ITA': 'lazio',
  'Olympique Lyonnais|FRA': 'lyon',
  'Olympique de Marseille|FRA': 'marsylia',
  'Stade Rennais FC 1901|FRA': 'rennes',
  'Stade Rennais FC|FRA': 'rennes',
  'AFC Ajax|NED': 'ajax',
  'Feyenoord|NED': 'feyenoord',
  'AZ Alkmaar|NED': 'az-alkmaar',
  'RB Leipzig|GER': 'rb-lipsk',
  'Royale Union Saint-Gilloise|BEL': 'union-sg',
  'KAA Gent|BEL': 'gent',
  'RSC Anderlecht|BEL': 'anderlecht',
  'Sint-Truidense VV|BEL': 'sint-truiden',
  'PAOK FC|GRE': 'paok',
  'AEK Athens FC|GRE': 'aek-ateny',
  'AEK Athens|GRE': 'aek-ateny',
  'Panathinaikos FC|GRE': 'panathinaikos',
  'OFI Crete FC|GRE': 'ofi-kreta',
  'Olympiacos FC|GRE': 'olympiakos',
  'AC Sparta Praha|CZE': 'sparta-praga',
  'SK Slavia Praha|CZE': 'slavia-praga',
  'FC Viktoria Plzeň|CZE': 'viktoria-pilzno',
  'FC Hradec Králové|CZE': 'hradec-kralove',
  'ŠK Slovan Bratislava|SVK': 'slovan',
  'FC DAC 1904 Dunajská Streda|SVK': 'dunajska-streda',
  'MŠK Žilina|SVK': 'zilina',
  'FK Austria Wien|AUT': 'austria-wieden',
  'SK Sturm Graz|AUT': 'sturm-graz',
  'LASK|AUT': 'lask',
  'Galatasaray AŞ|TUR': 'galatasaray',
  'Beşiktaş JK|TUR': 'besiktas',
  'Trabzonspor AŞ|TUR': 'trabzonspor',
  'Fenerbahçe SK|TUR': 'fenerbahce',
  'Hapoel Beer-Sheva FC|ISR': 'hapoel-beer-szewa',
  "Hapoel Be'er Sheva FC|ISR": 'hapoel-beer-szewa',
  'Hapoel Tel-Aviv FC|ISR': 'hapoel-tel-awiw',
  'Beitar Jerusalem FC|ISR': 'beitar',
  'PFC Ludogorets 1945|BUL': null,
  'PFC Levski Sofia|BUL': 'lewski-sofia',
  'PFC CSKA-Sofia|BUL': 'cska-sofia',
  'PFC CSKA Sofia|BUL': 'cska-sofia',
  'FC CSKA 1948|BUL': null, // inny klub niż CSKA Sofia
  'GNK Dinamo|CRO': 'dinamo-zagrzeb',
  'F.C. Copenhagen|DEN': 'kopenhaga',
  'FK Borac|BIH': 'borac',
  'FK Žalgiris|LTU': 'zalgiris-wilno',
  'PFC Zire|AZE': 'zira',
  'FC DAC 1904|SVK': 'dunajska-streda',
  'ML Vitebsk|BLR': 'witebsk', // FK Witebsk w grze, w 2026/27 pod nazwą ML Vitebsk
  'AC Omonoia|CYP': 'omonia',
  'AC Omonia|CYP': 'omonia',
  'Apollon Limassol FC|CYP': 'apollon',
  'Pafos FC|CYP': 'pafos',
  'Celtic FC|SCO': 'celtic',
  'Rangers FC|SCO': 'rangers',
  'Heart of Midlothian FC|SCO': 'hearts',
  'Hibernian FC|SCO': 'hibernian',
  'Motherwell FC|SCO': 'motherwell',
  'FK Bodø/Glimt|NOR': 'bodo-glimt',
  'Lillestrøm SK|NOR': 'lillestrom',
  'Tromsø IL|NOR': 'tromso',
  'SK Brann|NOR': 'brann',
  'Viking FK|NOR': 'viking',
  'FC Midtjylland|DEN': 'midtjylland',
  'FC Nordsjælland|DEN': 'nordsjaelland',
  'Aarhus GF|DEN': 'aarhus',
  'AGF|DEN': 'aarhus',
  'FC Lugano|SUI': 'lugano',
  'FC St. Gallen 1879|SUI': 'st-gallen',
  'FC Thun|SUI': 'thun',
  'Ferencvárosi TC|HUN': 'ferencvaros',
  'Debreceni VSC|HUN': 'debrecen',
  'HNK Hajduk Split|CRO': 'hajduk',
  'HNK Rijeka|CRO': 'rijeka',
  'NK Celje|SVN': 'celje',
  'Hammarby IF|SWE': 'hammarby',
  'Mjällby AIF|SWE': 'mjallby',
  'FC Universitatea Craiova|ROU': 'u-craiova',
  'CS Universitatea Craiova|ROU': 'u-craiova',
  'Sabah FK|AZE': 'sabah',
  'Zira FK|AZE': 'zira',
  'Ararat-Armenia FC|ARM': 'ararat-armenia',
  'FC Ararat-Armenia|ARM': 'ararat-armenia',
  'FC Pyunik|ARM': 'pjunik',
  'FK Borac Banja Luka|BIH': 'borac',
  'Kuopion Palloseura|FIN': 'kups',
  'KuPS Kuopio|FIN': 'kups',
  'FC Inter Turku|FIN': 'inter-turku',
  'FC Kairat Almaty|KAZ': 'kairat',
  'Lincoln Red Imps FC|GIB': 'lincoln-red-imps',
  'Riga FC|LVA': 'riga-fc',
  'FK RFS|LVA': 'rfs',
  'Inter Club d\'Escaldes|AND': 'inter-escaldes',
  'FK Kauno Žalgiris|LTU': 'kauno-zalgiris',
  'FK Žalgiris Vilnius|LTU': 'zalgiris-wilno',
  'FC Iberia 1999|GEO': 'iberia-1999',
  'KF Egnatia|ALB': 'egnatia',
  'Shamrock Rovers FC|IRL': 'shamrock',
  'KÍ Klaksvík|FRO': 'ki-klaksvik',
  'FC Sheriff Tiraspol|MDA': 'sheriff',
  'Víkingur Reykjavík|ISL': 'vikingur',
  'Valur Reykjavík|ISL': 'valur',
  'The New Saints FC|WAL': 'tns',
  'FC Drita|KOS': 'drita',
  'KF Malisheva|KOS': 'malisheva',
  'Larne FC|NIR': 'larne',
  'FC Flora Tallinn|EST': 'flora',
  'Paide Linnameeskond|EST': 'paide',
  'FC Vaduz|LIE': 'vaduz',
  'KF Shkëndija|MKD': 'shkendija',
  'FK Vardar|MKD': 'vardar',
  'Valletta FC|MLT': 'valletta',
  'Floriana FC|MLT': 'floriana',
  'FK Sutjeska Nikšić|MNE': 'sutjeska',
  'FC Dnepr Mogilev|BLR': 'dniepr-mohylew',
  'FC Dnyapro Mogilev|BLR': 'dniepr-mohylew',
  'FC Atert Bissen|LUX': 'atert-bissen',
  'Newcastle United FC|ENG': 'newcastle',
  'Newcastle United|ENG': 'newcastle',
  'OGC Nice|FRA': 'nice',
  'AS Monaco|FRA': 'monaco',
  'LOSC Lille|FRA': 'lille',
  'RC Lens|FRA': 'lens',
  'Como 1907|ITA': 'como',
  'NEC Nijmegen|NED': 'nec',
  'FC Twente|NED': 'twente',
  'SC Braga|POR': 'braga',
  'SCU Torreense|POR': 'torreense',
  'Getafe CF|ESP': 'getafe',
  'RC Celta|ESP': 'celta',
  'RC Celta de Vigo|ESP': 'celta',
  'Real Sociedad de Fútbol|ESP': 'real-sociedad',
  'Villarreal CF|ESP': 'villarreal',
  'TSG 1899 Hoffenheim|GER': 'hoffenheim',
  'VfB Stuttgart|GER': 'stuttgart',
  'SC Freiburg|GER': 'freiburg',
  'Brighton & Hove Albion FC|ENG': 'brighton',
  'AFC Bournemouth|ENG': 'bournemouth',
  'Sunderland AFC|ENG': 'sunderland',
  'Crystal Palace FC|ENG': 'crystal-palace',
  'Crystal Palace|ENG': 'crystal-palace',
  // Polskie kluby (w grze pod nazwami z clubs_pl.js; w przeglądarce nazwy fikcyjne)
  'Legia Warszawa|POL': 'legia',
  'KKS Lech Poznań|POL': 'lech',
  'Jagiellonia Białystok|POL': 'jagiellonia',
  'Raków Częstochowa|POL': 'rakow',
  'Górnik Zabrze|POL': 'gornik-zabrze',
  'GKS Katowice|POL': 'gks-katowice',
  'Wisła Kraków|POL': 'wisla-krakow',
  'Śląsk Wrocław|POL': 'slask',
  'MKS Pogoń Szczecin|POL': 'pogon-szczecin',
  'KS Lechia Gdańsk|POL': 'lechia-gdansk',
};

const PREFIX = new Set(['fc', 'afc', 'cf', 'sc', 'ac', 'as', 'ss', 'ssc', 'sk', 'fk', 'nk', 'hnk', 'gnk', 'kf', 'kks', 'ks', 'mks', 'sl', 'pfc', 'rc', 'cd', 'sd', 'ud', 'kaa', 'kv', 'kvc', 'krc', 'rsc', 'vfb', 'vfl', 'tsg', 'bk', 'if', 'ff', 'aif', 'il', 'sv', 'ogc', 'cs', 'csm', 'osc', 'losc', 'jk', 'ofk', 'fsv', 'rb', 'bv', 'club', 'de', 'the', 'and', 'of', 'y', 'e', 'da', 'do', '1899', '1904', '1907', '1909', '1945', '1879', '1901', '04', '05']);
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ł/g, 'l').replace(/ß/g, 'ss').replace(/ı/g, 'i')
  .replace(/\b([a-z])\.(?=[a-z]\.)/g, '$1').replace(/\b([a-z])\.(?=\s|$)/g, '$1').replace(/[^a-z0-9]+/g, ' ').trim(); // „A.Ş.” -> „as”, „F.C.” -> „fc”
// Słowa ogólne nie wystarczą do dopasowania (Real Madryt i Real Club Celta, Inter Mediolan i FC Inter Turku)
const GENERIC = new Set(['real', 'sporting', 'united', 'city', 'athletic', 'atletico', 'olympique', 'dinamo', 'dynamo', 'inter', 'calcio', 'sport', 'football', 'futbol', 'stade', 'racing', 'union', 'royal', 'royale', 'red', 'star', 'young', 'boys', 'town', 'rovers', 'county', 'albion', 'wanderers', 'hotspur', 'borussia', 'eintracht', 'olympiacos', 'spartak', 'lokomotiv', 'slavia', 'zalgiris', 'hapoel', 'maccabi', 'partizani', 'fk', 'afc']);
const tokens = (s) => norm(s).split(' ').filter((t) => t && !PREFIX.has(t));

/** Kluby gry: zagraniczne z kluby_uefa.json i polskie (prawdziwe nazwy z clubNames.js). */
export function gameClubs() {
  const list = UEFA.kluby.map((k) => ({ id: k.id, name: k.nazwa, country: k.kraj }));
  for (const c of CLUBS_PL) if (!c.parent) list.push({ id: c.id, name: FICTIONAL[c.id]?.real ?? c.name, country: 'POL' });
  return list;
}

export function matchClubs(rankingClubs, games = gameClubs()) {
  const byCountry = new Map();
  for (const g of games) { if (!byCountry.has(g.country)) byCountry.set(g.country, []); byCountry.get(g.country).push(g); }
  const used = new Map();
  const out = [];
  const how = [];
  // Najpierw aliasy (pewne), potem dopasowanie po nazwie wśród klubów jeszcze wolnych
  const ids = new Map();
  for (const r of rankingClubs) {
    const key = `${r.name}|${r.country}`;
    if (!(key in ALIASES)) continue;
    const id = ALIASES[key];
    if (!id) { ids.set(r, null); continue; }
    if (used.has(id)) throw new Error(`Dwa kluby rankingu dla ${id}: ${used.get(id)} i ${r.name}`);
    used.set(id, r.name); ids.set(r, id); how.push(`alias: ${r.name} -> ${id}`);
  }
  for (const r of rankingClubs) {
    if (ids.has(r)) continue;
    const rt = tokens(r.name);
    let best = null; let bestScore = 0;
    for (const g of byCountry.get(r.country) ?? []) {
      if (used.has(g.id)) continue;
      const gt = tokens(g.name);
      const common = rt.filter((t) => gt.includes(t)).length;
      const distinct = rt.filter((t) => gt.includes(t) && !GENERIC.has(t)).length;
      const score = common / Math.max(rt.length, gt.length);
      if (distinct && score > bestScore) { best = g; bestScore = score; }
    }
    const id = best && bestScore >= 0.5 ? best.id : null;
    if (id) { used.set(id, r.name); how.push(`nazwa: ${r.name} -> ${id} [${best.name}] (${bestScore.toFixed(2)})`); }
    ids.set(r, id);
  }
  for (const r of rankingClubs) out.push({ ...r, id: ids.get(r) ?? null });
  return { clubs: out, how, used };
}

const slug = (s) => norm(s).replace(/ /g, '-');

/** Kontrola pliku: suma sezonów = suma z tabeli (kraje i punkty własne klubów), próg 20 % i współczynnik klubu. */
export function validate(P) {
  const err = [];
  const s5 = (a) => Math.round(a.reduce((x, y) => x + (y ?? 0), 0) * 1000) / 1000;
  for (const [k, c] of Object.entries(P.countries)) if (Math.abs(s5(c.seasons) - c.sum) > 0.0015) err.push(`${k}: suma ${s5(c.seasons)} zamiast ${c.sum}`);
  for (const c of P.clubs) {
    if (Math.abs(s5(c.seasons) - c.own) > 0.0015) err.push(`${c.name}: suma ${s5(c.seasons)} zamiast ${c.own}`);
    const thr = Math.floor(0.2 * P.countries[c.country].sum * 1000 + 1e-6) / 1000;
    if (Math.abs(thr - c.threshold) > 0.0015) err.push(`${c.name}: próg ${thr} zamiast ${c.threshold}`);
    if (Math.abs(Math.max(c.own, c.threshold) - c.coef) > 0.0015) err.push(`${c.name}: współczynnik ${c.coef}`);
  }
  return err;
}

export function buildData(text) {
  const P = parseRanking(text);
  const errors = validate(P);
  if (errors.length) console.warn(`Uwaga, niezgodności w pliku źródłowym:\n${errors.join('\n')}`);
  const { clubs, how, used } = matchClubs(P.clubs);
  const data = {
    meta: {
      opis: 'Ranking współczynników UEFA (5 sezonów), dane od właściciela: tools/data/ranking_uefa_2026_27.txt. Sezon 2026/27 częściowy (stan z pliku), w grze zastępowany wynikami z gry. Generator: tools/uefa-ranking-gen.mjs.',
      stan: P.stan, sezony: ['2022/23', '2023/24', '2024/25', '2025/26', '2026/27'],
      zrodla: [
        'https://www.uefa.com/nationalassociations/uefarankings/country/?year=2027',
        'https://www.uefa.com/nationalassociations/uefarankings/club/?year=2027',
        'https://kassiesa.net/uefa/data/method5/crank2027.html',
        'https://www.uefa.com/nationalassociations/uefarankings/club/about/',
      ],
    },
    // entrants: liczba klubów kraju w pucharach 2026/27 (kolumna „Kluby 26/27”), dzielnik współczynnika sezonowego
    countries: Object.fromEntries(Object.entries(P.countries).map(([code, c]) => [code, { name: c.name, seasons: c.seasons, place: c.place, entrants: c.entrants }])),
    clubs: {},
  };
  for (const c of clubs) {
    const key = c.id ?? `x-${c.country.toLowerCase()}-${slug(c.name)}`;
    if (data.clubs[key]) throw new Error(`Powtórzony klucz ${key}`);
    data.clubs[key] = { name: c.name, country: c.country, seasons: c.seasons, place: c.place, ...(c.id ? { game: true } : {}) };
  }
  const missing = gameClubs().filter((g) => g.country !== 'POL' && !used.has(g.id));
  return { data, P, how, missing, matched: clubs.filter((c) => c.id) };
}

// ------------------------------------------------------------ Uruchomienie
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { data, P, how, missing, matched } = buildData(readFileSync(SRC, 'utf8'));
  const json = `${JSON.stringify(data, null, 0).replace(/\],"/g, '],\n"').replace(/\},"/g, '},\n"')}\n`;
  if (process.argv.includes('--check')) {
    const same = readFileSync(OUT, 'utf8') === json;
    console.log(same ? 'ranking_uefa.json aktualny' : 'ranking_uefa.json różni się od pliku źródłowego');
    process.exit(same ? 0 : 1);
  }
  writeFileSync(OUT, json);
  console.log(`Federacje: ${Object.keys(P.countries).length}, kluby: ${P.clubs.length}, dopasowane do gry: ${matched.length} (polskie ${matched.filter((c) => c.country === 'POL').length})`);
  if (process.argv.includes('-v')) console.log(how.join('\n'));
  console.log(`Kluby gry (zagraniczne) bez wpisu w rankingu: ${missing.length}\n${missing.map((g) => `  ${g.id} (${g.name}, ${g.country})`).join('\n')}`);
  console.log(`Zapisano ${OUT}`);
}
