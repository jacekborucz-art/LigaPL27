// Nazwy klubów do publikacji gry (decyzja właściciela, Nov 18, 2026): fikcyjne nazwy klubów Ekstraklasy zamiast
// prawdziwych. Prawdziwe nazwy zostają w tym pliku (pole real) do testów: ukryty skrót na ekranie wyboru klubu przełącza
// zapamiętane ustawienie w przeglądarce (klucz NAMES_KEY = 'real') i przeładowuje stronę z prawdziwymi nazwami.
// Rezerwy (parent: id pierwszej drużyny, np. „Legia II Warszawa” w 2 Lidze i III lidze) dostają nazwę od nowej nazwy
// pierwszej drużyny, żeby dane się nie rozjechały. Testy (Node, bez przeglądarki) widzą prawdziwe nazwy.

export const FICTIONAL = {
  lech: { real: 'Lech Poznań', name: 'Żelazny Poznań', short: 'ŻEL' },
  'gornik-zabrze': { real: 'Górnik Zabrze', name: 'Karbon Zabrze', short: 'KAR' },
  jagiellonia: { real: 'Jagiellonia Białystok', name: 'Dynastia Białystok', short: 'DYN' },
  rakow: { real: 'Raków Częstochowa', name: 'Stalowy Częstochowa', short: 'STC' },
  'gks-katowice': { real: 'GKS Katowice', name: 'Górniczy Katowice', short: 'GÓR' },
  legia: { real: 'Legia Warszawa', name: 'Legat Warszawa', short: 'LGT' },
  'zaglebie-lubin': { real: 'Zagłębie Lubin', name: 'Miedzianka Lubin', short: 'MIE' },
  'wisla-plock': { real: 'Wisła Płock', name: 'Nurt Płock', short: 'NUR' },
  'pogon-szczecin': { real: 'Pogoń Szczecin', name: 'Flota Szczecin', short: 'FLO' },
  radomiak: { real: 'Radomiak Radom', name: 'Zieloni Radom', short: 'ZIE' },
  korona: { real: 'Korona Kielce', name: 'Regalia Kielce', short: 'REG' },
  motor: { real: 'Motor Lublin', name: 'Napęd Lublin', short: 'NPĘ' },
  cracovia: { real: 'Cracovia', name: 'Szachownica Kraków', short: 'SZA' },
  widzew: { real: 'Widzew Łódź', name: 'Robotniczy Łódź', short: 'ROB' },
  piast: { real: 'Piast Gliwice', name: 'Książęcy Gliwice', short: 'KSI' },
  'wisla-krakow': { real: 'Wisła Kraków', name: 'Błękit Kraków', short: 'BŁĘ' },
  slask: { real: 'Śląsk Wrocław', name: 'Silesia Wrocław', short: 'SIL' },
  wieczysta: { real: 'Wieczysta Kraków', name: 'Wieczność Kraków', short: 'WIE' },
  // 1 Liga (Nov 18, 2026)
  arka: { real: 'Arka Gdynia', name: 'Armada Gdynia', short: 'ARM' },
  termalica: { real: 'Bruk-Bet Termalica Nieciecza', name: 'Słonie Nieciecza', short: 'SŁO' },
  'lechia-gdansk': { real: 'Lechia Gdańsk', name: 'Bursztyn Gdańsk', short: 'BUR' },
  chrobry: { real: 'Chrobry Głogów', name: 'Monarcha Głogów', short: 'MON' },
  lks: { real: 'ŁKS Łódź', name: 'Włókniarze Łódź', short: 'WŁÓ' },
  miedz: { real: 'Miedź Legnica', name: 'Kuźnia Legnica', short: 'KUŹ' },
  'odra-opole': { real: 'Odra Opole', name: 'Rzeczni Opole', short: 'RZE' },
  'pogon-grodzisk': { real: 'Pogoń Grodzisk Mazowiecki', name: 'Grodzianie Grodzisk', short: 'GRO' },
  'pogon-siedlce': { real: 'Pogoń Siedlce', name: 'Pościg Siedlce', short: 'POŚ' },
  'polonia-bytom': { real: 'Polonia Bytom', name: 'Czarni Bytom', short: 'CZA' },
  'polonia-warszawa': { real: 'Polonia Warszawa', name: 'Stołeczni Warszawa', short: 'STO' },
  puszcza: { real: 'Puszcza Niepołomice', name: 'Bór Niepołomice', short: 'BÓR' },
  ruch: { real: 'Ruch Chorzów', name: 'Dynamika Chorzów', short: 'DNM' },
  'stal-mielec': { real: 'Stal Mielec', name: 'Metalurg Mielec', short: 'MET' },
  'stal-rzeszow': { real: 'Stal Rzeszów', name: 'Hutniczy Rzeszów', short: 'HUT' },
  'unia-skierniewice': { real: 'Unia Skierniewice', name: 'Zjednoczeni Skierniewice', short: 'ZJE' },
  warta: { real: 'Warta Poznań', name: 'Strażnica Poznań', short: 'STR' },
  podbeskidzie: { real: 'Podbeskidzie Bielsko-Biała', name: 'Górale Bielsko-Biała', short: 'GRL' },
  // 2 Liga (Nov 18, 2026); rezerwy z własnymi nazwami i herbami: Legat II, Silesia II
  avia: { real: 'Avia Świdnik', name: 'Lotnik Świdnik', short: 'LOT' },
  chojniczanka: { real: 'Chojniczanka Chojnice', name: 'Gryf Chojnice', short: 'GRY' },
  'gks-tychy': { real: 'GKS Tychy', name: 'Tyski Sport Tychy', short: 'TYS' },
  'gornik-leczna': { real: 'Górnik Łęczna', name: 'Karbon Łęczna', short: 'KŁĘ' },
  hutnik: { real: 'Hutnik Kraków', name: 'Kuźnia Kraków', short: 'KKR' },
  'lechia-zg': { real: 'Lechia Zielona Góra', name: 'Zielonogórski Zielona Góra', short: 'ZGÓ' },
  'legia-ii': { real: 'Legia II Warszawa', name: 'Legat II Warszawa', short: 'LG2' },
  'olimpia-grudziadz': { real: 'Olimpia Grudziądz', name: 'Olimp Grudziądz', short: 'OLI' },
  podhale: { real: 'NKP Podhale Nowy Targ', name: 'Tatrzański Nowy Targ', short: 'TAT' },
  rekord: { real: 'Rekord Bielsko-Biała', name: 'Champion Bielsko-Biała', short: 'CHA' },
  resovia: { real: 'Resovia Rzeszów', name: 'Biało-Czerwoni Rzeszów', short: 'BCZ' },
  sandecja: { real: 'Sandecja Nowy Sącz', name: 'Dunajec Nowy Sącz', short: 'DUN' },
  'sokol-kleczew': { real: 'Sokół Kleczew', name: 'Jastrząb Kleczew', short: 'JAS' },
  'stal-stalowa-wola': { real: 'Stal Stalowa Wola', name: 'Metal Stalowa Wola', short: 'MTL' },
  'slask-ii': { real: 'Śląsk Wrocław II', name: 'Silesia II Wrocław', short: 'SI2' },
  swit: { real: 'Świt Szczecin', name: 'Jutrzenka Szczecin', short: 'JUT' },
  zawisza: { real: 'Zawisza Bydgoszcz', name: 'Rycerz Bydgoszcz', short: 'RYC' },
  znicz: { real: 'Znicz Pruszków', name: 'Płomień Pruszków', short: 'PŁO' },
};

export const NAMES_KEY = 'ligapl27-names';
/** Prawdziwe nazwy włączone (tylko przeglądarka, ustawienie zapamiętane po skrócie na ekranie wyboru klubu). */
export function realNamesOn() {
  try { return globalThis.localStorage?.getItem(NAMES_KEY) === 'real'; } catch { return false; }
}
const inBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const first = (s) => String(s).split(' ')[0];
/** Nazwa rezerw od nazwy pierwszej drużyny: „Legia II Warszawa” -> „Legat II Warszawa”, „Śląsk Wrocław II” -> „Silesia Wrocław II”. */
export function reserveName(name, parentId) {
  const f = FICTIONAL[parentId];
  if (!f) return name;
  if (name.startsWith(f.real)) return f.name + name.slice(f.real.length);
  const rf = first(f.real);
  if (name.startsWith(`${rf} `) || name === rf) return first(f.name) + name.slice(rf.length);
  // Rezerwy nazwane innym członem prawdziwej nazwy, np. „Termalica II Nieciecza” (Bruk-Bet Termalica Nieciecza)
  const w = String(f.real).split(' ').find((x) => x.length >= 4 && name.startsWith(`${x} `));
  if (w) return first(f.name) + name.slice(w.length);
  return name;
}

/** Nakłada nazwy fikcyjne na listę klubów (w miejscu). Bez przeglądarki albo z prawdziwymi nazwami: bez zmian. */
export function applyClubNames(list) {
  if (!inBrowser() || realNamesOn()) return list;
  for (const c of list) {
    const f = FICTIONAL[c.id];
    if (f) { c.name = f.name; c.short = f.short; continue; }
    if (c.parent && FICTIONAL[c.parent]) {
      c.name = reserveName(c.name, c.parent);
      c.short = `${FICTIONAL[c.parent].short.slice(0, 2)}2`;
    }
  }
  return list;
}

const SHORT_ALIASES = [['Bruk-Bet Termalica', 'Słonie'], ['Termalica', 'Słonie'], ['Raków', 'Stalowy'], ['Legia', 'Legat'], ['Lech', 'Żelazny'], ['Jagiellonia', 'Dynastia'], ['Widzew', 'Robotniczy'], ['Radomiak', 'Zieloni'], ['Wieczysta', 'Wieczność'], ['Cracovia', 'Szachownica']];
/** Zamienia prawdziwe nazwy klubów w tekście (pełna nazwa, a dla rezerw i skrótów pierwszy człon: „Raków” -> „Stalowy”). */
export function fictionalText(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  for (const f of Object.values(FICTIONAL)) out = out.split(f.real).join(f.name);
  // Krótkie formy tylko jednoznaczne (np. „Górnik” albo „Wisła” to też inne kluby)
  for (const [a, b] of SHORT_ALIASES) out = out.replace(new RegExp(`(^|[^\\p{L}])${a}(?![\\p{L}])`, 'gu'), `$1${b}`);
  return out;
}
/** Nakłada fikcyjne nazwy na wszystkie teksty obiektu danych (w miejscu), np. kluby_uefa.json. */
export function applyNamesDeep(obj) {
  if (!inBrowser() || realNamesOn() || !obj || typeof obj !== 'object') return obj;
  const walk = (o) => {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'string') o[k] = fictionalText(v);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(obj);
  return obj;
}
