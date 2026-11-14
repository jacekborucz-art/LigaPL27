// Gospodarze turniejów reprezentacji (docs/kalendarz-reprezentacji.md, rozdz. Gospodarze).
// Znane z decyzji federacji: Euro 2028 (Anglia, Irlandia, Szkocja, Walia), Euro 2032 (Włochy, Turcja),
// MŚ 2030 (Hiszpania, Portugalia, Maroko), MŚ 2034 (Arabia Saudyjska), Puchar Azji 2027 (Arabia Saudyjska),
// Puchar Narodów Afryki 2027 (Kenia, Uganda, Tanzania). Dalej: losowanie z ziarna gry spośród kandydatów
// konfederacji [SZAC], bez kraju, który był gospodarzem w ostatnich 20 latach.

import { Rng } from '../../core/rng.js';

export const KNOWN_HOSTS = {
  'EURO-2028': ['ENG', 'IRL', 'SCO', 'WAL'],
  'EURO-2032': ['ITA', 'TUR'],
  'WC-2030': ['ESP', 'POR', 'MAR'],
  'WC-2034': ['KSA'],
  'ASIA-2027': ['KSA'],
  'AFCON-2027': ['KEN', 'UGA', 'TAN'],
};

// Kandydaci (pojedynczo albo wspólnie) [SZAC]: kraje z infrastrukturą i historią organizacji
const EURO_BIDS = [['GER'], ['FRA'], ['ESP', 'POR'], ['NED', 'BEL'], ['POL'], ['ENG'], ['ITA'], ['TUR'], ['DEN', 'SWE', 'NOR'], ['AUT', 'SUI'],
  ['CZE', 'SVK'], ['HUN', 'ROU'], ['SCO', 'IRL'], ['GRE'], ['UKR'], ['CRO', 'SVN'], ['FIN', 'EST'], ['SRB', 'BIH']];
const WC_BIDS = {
  UEFA: [['ENG'], ['GER'], ['FRA'], ['ITA'], ['NED', 'BEL'], ['DEN', 'SWE', 'NOR', 'FIN'], ['POL', 'CZE'], ['ESP']],
  CONMEBOL: [['ARG', 'URU', 'CHI', 'PAR'], ['BRA'], ['COL', 'ECU', 'PER'], ['ARG'], ['CHI', 'PER', 'BOL']],
  CONCACAF: [['USA'], ['MEX'], ['USA', 'CAN'], ['MEX', 'USA', 'CAN'], ['CAN']],
  CAF: [['MAR'], ['RSA'], ['EGY'], ['NGA', 'GHA'], ['ALG', 'TUN'], ['SEN', 'CIV']],
  AFC: [['JPN', 'KOR'], ['CHN'], ['AUS', 'NZL'], ['QAT'], ['IND'], ['IDN'], ['UAE'], ['JPN']],
};
const CONT_BIDS = {
  ASIA: [['AUS'], ['KOR'], ['JPN'], ['QAT'], ['UAE'], ['CHN'], ['IDN'], ['IRN'], ['UZB'], ['KUW'], ['IND'], ['THA', 'VIE']],
  AFCON: [['MAR'], ['EGY'], ['CIV'], ['CMR'], ['NGA'], ['SEN'], ['ALG'], ['RSA'], ['GHA'], ['TUN'], ['ZAM'], ['ANG'], ['GUI'], ['COD']],
  COPA: [['ARG'], ['BRA'], ['CHI'], ['COL'], ['ECU'], ['PAR'], ['PER'], ['URU'], ['VEN'], ['BOL']],
  GOLD: [['USA'], ['USA', 'CAN'], ['MEX', 'USA'], ['USA'], ['CAN', 'USA'], ['USA', 'MEX']],
  OFC: [['NZL'], ['FIJ'], ['VAN'], ['SOL'], ['NCL'], ['TAH'], ['PNG'], ['SAM']],
};
const FIRST = { EURO: 2028, WC: 2030, ASIA: 2027, AFCON: 2027, COPA: 2028, GOLD: 2027, OFC: 2028 };
const STEP = { GOLD: 2 };

/** Rotacja konfederacji gospodarzy MŚ: bez konfederacji gospodarzy dwóch poprzednich turniejów (zasada FIFA). */
const WC_CONFS = ['CONMEBOL', 'UEFA', 'CAF', 'CONCACAF', 'AFC'];

function prevHosts(memo, prefix, year, span) {
  const out = new Set();
  for (const [k, v] of Object.entries(memo)) {
    const [p, y] = k.split('-');
    if (p === prefix && Number(y) < year && Number(y) >= year - span) for (const c of v) out.add(c);
  }
  return out;
}

/**
 * Gospodarze edycji key ('EURO-2036', 'WC-2038', 'COPA-2028'...). memo: zapis gry (game.intl.hosts) z wcześniej
 * wybranymi gospodarzami, uzupełniany w kolejności lat. Wynik zależy tylko od ziarna i roku.
 */
export function hostsFor(memo, seed, key, confOf) {
  if (memo[key]) return memo[key];
  if (KNOWN_HOSTS[key]) return (memo[key] = KNOWN_HOSTS[key]);
  const [type, ys] = key.split('-'); const year = Number(ys);
  // Poprzednie edycje najpierw (wynik niezależny od kolejności wywołań)
  const step = STEP[type] ?? 4;
  if (year - step >= (FIRST[type] ?? year)) hostsFor(memo, seed, `${type}-${year - step}`, confOf);
  const rng = new Rng(`gospodarz:${seed}:${key}`);
  let bids;
  if (type === 'WC') {
    // Konfederacje dwóch poprzednich MŚ wykluczone; 2026: CONCACAF, 2030: UEFA i CAF, 2034: AFC
    const past = [year - 4, year - 8].flatMap((y) => (y === 2026 ? ['CONCACAF'] : (hostsFor(memo, seed, `WC-${y}`, confOf) ?? []).map(confOf)));
    const conf = rng.pick(WC_CONFS.filter((c) => !past.includes(c)));
    bids = WC_BIDS[conf];
  } else bids = type === 'EURO' ? EURO_BIDS : CONT_BIDS[type];
  const recent = prevHosts(memo, type, year, type === 'WC' ? 40 : 20);
  const fresh = bids.filter((b) => !b.some((c) => recent.has(c)));
  return (memo[key] = [...rng.pick(fresh.length ? fresh : bids)]);
}
