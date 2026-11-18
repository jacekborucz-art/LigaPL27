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

const SHORT_ALIASES = [['Raków', 'Stalowy'], ['Legia', 'Legat'], ['Lech', 'Żelazny'], ['Jagiellonia', 'Dynastia'], ['Widzew', 'Robotniczy'], ['Radomiak', 'Zieloni'], ['Wieczysta', 'Wieczność'], ['Cracovia', 'Szachownica']];
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
