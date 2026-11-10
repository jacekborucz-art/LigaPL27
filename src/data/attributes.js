// Atrybuty zawodnika i profile pozycji (docs/ekspert_futbol.md 1.1, 1.5).
// Atrybuty to słownik: nowy atrybut = nowy wpis tutaj (+ ewentualnie profil i modyfikator).

export const ATTRS = {
  // Techniczne
  POD: { name: 'Podania', group: 'tech' },
  DRY: { name: 'Drybling', group: 'tech' },
  WYK: { name: 'Wykończenie', group: 'tech' },
  DYS: { name: 'Strzał z dystansu', group: 'tech' },
  DOS: { name: 'Dośrodkowania', group: 'tech' },
  GLO: { name: 'Gra głową', group: 'tech' },
  ODB: { name: 'Odbiór', group: 'tech' },
  TEC: { name: 'Technika', group: 'tech' },
  SFR: { name: 'Stałe fragmenty', group: 'tech' },
  // Mentalne
  WIZ: { name: 'Wizja', group: 'mental' },
  UST: { name: 'Ustawianie się', group: 'mental' },
  DEC: { name: 'Decyzje', group: 'mental' },
  OPA: { name: 'Opanowanie', group: 'mental' },
  PRA: { name: 'Pracowitość', group: 'mental' },
  AGR: { name: 'Agresja', group: 'mental' },
  LID: { name: 'Przywództwo', group: 'mental' },
  RUC: { name: 'Gra bez piłki', group: 'mental' },
  // Fizyczne
  SZY: { name: 'Szybkość', group: 'phys' },
  WYT: { name: 'Wytrzymałość', group: 'phys' },
  SIL: { name: 'Siła', group: 'phys' },
  ZWI: { name: 'Zwinność', group: 'phys' },
  SKO: { name: 'Skoczność', group: 'phys' },
  // Bramkarskie
  REF: { name: 'Refleks', group: 'gk' },
  CHW: { name: 'Chwytanie', group: 'gk' },
  WYJ: { name: 'Gra na przedpolu', group: 'gk' },
  JNJ: { name: 'Sam na sam', group: 'gk' },
  NOG: { name: 'Gra nogami', group: 'gk' },
};

export const ATTR_GROUPS = { tech: 'Techniczne', mental: 'Mentalne', phys: 'Fizyczne', gk: 'Bramkarskie' };
export const OUTFIELD_ATTRS = Object.keys(ATTRS).filter((k) => ATTRS[k].group !== 'gk');
export const GK_ATTRS = Object.keys(ATTRS).filter((k) => ATTRS[k].group === 'gk');

export const POS_NAMES = {
  BR: 'Bramkarz', ŚO: 'Środkowy obrońca', BO: 'Boczny obrońca', WB: 'Wahadłowy', DP: 'Defensywny pomocnik',
  ŚP: 'Środkowy pomocnik', OP: 'Ofensywny pomocnik', SP: 'Boczny pomocnik', SN: 'Skrzydłowy', NAP: 'Napastnik',
};

const P = 3; const p = 1.5; const m = -1.5; const M = -3;
const prof = (pp, pl, mi, mm) => {
  const o = {};
  for (const a of pp) o[a] = P;
  for (const a of pl) o[a] = p;
  for (const a of mi) o[a] = m;
  for (const a of mm) o[a] = M;
  return o;
};
const s = (x) => x.split(' ').filter(Boolean);

// Offsety atrybutów względem jakości zawodnika q (tabela 1.5 eksperta).
export const OFF = {
  BR: prof(s('REF UST JNJ'), s('CHW WYJ OPA DEC NOG'), s('POD TEC'), s('WYK DRY DYS DOS ODB SFR RUC')),
  ŚO: prof(s('ODB UST GLO'), s('SIL SKO DEC OPA AGR'), s('DRY DOS SFR WIZ DYS'), s('WYK RUC')),
  BO: prof(s('ODB SZY WYT'), s('DOS UST PRA POD'), s('GLO SFR WIZ'), s('WYK')),
  WB: prof(s('WYT SZY DOS'), s('PRA ODB DRY POD'), s('GLO SIL UST'), s('WYK')),
  DP: prof(s('ODB UST POD'), s('DEC PRA WYT SIL AGR'), s('DRY SZY RUC'), s('WYK')),
  ŚP: prof(s('POD DEC TEC'), s('WIZ PRA WYT OPA'), s('GLO SKO SIL'), []),
  OP: prof(s('WIZ TEC POD'), s('DRY DYS RUC DEC OPA SFR'), s('ODB SIL SKO UST'), []),
  SP: prof(s('DOS SZY DRY'), s('WYT TEC POD PRA'), s('GLO SIL UST'), []),
  SN: prof(s('DRY SZY RUC'), s('WYK TEC ZWI OPA'), s('ODB GLO UST'), []),
  NAP: prof(s('WYK RUC OPA'), s('GLO SIL TEC SZY SKO'), s('ODB WIZ DOS UST'), []),
};

// Warianty (25 % szans): zastępują część profilu.
export const VARIANTS = {
  NAP: [{ name: 'wieżowiec', set: { GLO: P, SIL: P, SZY: m } }, { name: 'lis pola karnego', set: { RUC: P, OPA: P, SIL: m } }],
  ŚO: [{ name: 'rozgrywający obrońca', set: { POD: P, SIL: 0 } }],
  BR: [{ name: 'libero', set: { NOG: P, WYJ: P } }],
  OP: [{ name: 'strzelec', set: { DYS: P } }],
};

/** Atrybuty liczone do OVR na danej pozycji. Bramkarz: bramkarskie + UST, DEC, OPA. */
export function attrsFor(pos) {
  return pos === 'BR' ? [...GK_ATTRS, 'UST', 'DEC', 'OPA'] : OUTFIELD_ATTRS;
}

/** OVR na pozycji: średnia ważona (++ 4, + 2, 0 1, - i -- 0) minus średni offset, więc OVR ~ jakość q. */
export function ovrAt(attr, pos, offsets = OFF[pos]) {
  let sw = 0; let sv = 0; let so = 0;
  for (const a of attrsFor(pos)) {
    const off = offsets[a] ?? 0;
    const w = off >= 3 ? 4 : off > 0 ? 2 : off === 0 ? 1 : 0;
    sw += w; sv += w * attr[a]; so += w * off;
  }
  return Math.round((sv / sw - so / sw) * 10) / 10;
}

// Pozycje pokrewne do losowania alternatyw (ekspert 2.5).
export const RELATED = {
  BR: [], ŚO: ['DP', 'BO'], BO: ['WB', 'SP', 'ŚO'], WB: ['BO', 'SP'], DP: ['ŚP', 'ŚO'],
  ŚP: ['DP', 'OP'], OP: ['ŚP', 'SN', 'NAP'], SP: ['SN', 'WB', 'OP'], SN: ['SP', 'NAP', 'OP'], NAP: ['SN', 'OP'],
};
