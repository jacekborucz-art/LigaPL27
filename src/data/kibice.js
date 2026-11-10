// Kibice polskich klubów (etap 11): wielkość bazy kibiców, siła grup ultras, skłonność do incydentów, rywalizacje.
// Skale 1-5. size: baza kibiców (frekwencja, zasięg), ultras: siła i organizacja grup kibicowskich (doping, oprawy,
// zdolność do bojkotu i protestu), temper: skłonność do incydentów karanych przez Komisję Ligi, PZPN i UEFA.
// Wartości to oceny eksperckie [SZAC] na podstawie frekwencji i głośnych spraw dyscyplinarnych, chyba że opisano źródło.
// Źródła i uzasadnienie: docs/kibice.md (Nov 10, 2026). Klub spoza listy dostaje profil z prestiżu (src/career/fans.js).
// stand: nazwa trybuny lub sektora najzagorzalszych kibiców, tylko gdy potwierdzona w źródłach; inaczej „młyn”.

const k = (size, ultras, temper, extra = {}) => ({ size, ultras, temper, ...extra });

export const KIBICE = {
  // Ekstraklasa
  legia: k(5, 5, 5, { stand: 'Żyleta' }), // Żyleta: decyzje UEFA i Komisji Ligi, bojkot 2025 (docs/kibice.md, źródła 3, 6, 14, 17)
  lech: k(5, 5, 4),
  rakow: k(3, 2, 2),
  jagiellonia: k(4, 4, 3),
  widzew: k(5, 5, 4),
  'pogon-szczecin': k(4, 4, 3),
  wieczysta: k(1, 1, 1),
  'gornik-zabrze': k(4, 4, 4),
  'wisla-krakow': k(5, 5, 5, { stand: 'sektor C' }), // sektor C: decyzje Komisji Ligi i KD PZPN (źródła 1, 2)
  cracovia: k(3, 4, 5), // kary za rasizm, burdy, zakazy wyjazdów (źródła 7, 8)
  piast: k(2, 2, 3),
  slask: k(4, 4, 4), // kary 40-50 tys. zł i zakazy wyjazdów (źródła 9, 11)
  'zaglebie-lubin': k(2, 3, 3),
  motor: k(4, 4, 3),
  korona: k(3, 3, 3), // kara 25 tys. zł za pirotechnikę (źródło 4)
  'gks-katowice': k(4, 4, 4),
  radomiak: k(3, 3, 3),
  'wisla-plock': k(2, 3, 3),

  // 1 Liga
  'lechia-gdansk': k(4, 4, 4), // kara za race w oprawie (źródło 10)
  arka: k(3, 4, 4),
  'stal-mielec': k(2, 3, 3),
  puszcza: k(1, 1, 1),
  termalica: k(1, 1, 1),
  ruch: k(4, 5, 4), // kary po oskarżeniach o rasizm (źródło 13)
  lks: k(3, 3, 3),
  miedz: k(2, 2, 2),
  'polonia-warszawa': k(2, 3, 3),
  'stal-rzeszow': k(2, 2, 2),
  podbeskidzie: k(2, 3, 3),
  'odra-opole': k(2, 3, 3),
  warta: k(1, 1, 1),
  'polonia-bytom': k(2, 3, 3),
  chrobry: k(1, 2, 2),
  'pogon-grodzisk': k(1, 1, 1),
  'pogon-siedlce': k(1, 2, 2),
  'unia-skierniewice': k(1, 1, 1),

  // 2 Liga
  'gks-tychy': k(2, 3, 3),
  'gornik-leczna': k(2, 2, 2),
  zawisza: k(2, 3, 4),
  sandecja: k(2, 2, 2),
  znicz: k(1, 1, 1),
  chojniczanka: k(1, 2, 2),
  'stal-stalowa-wola': k(2, 3, 3),
  resovia: k(1, 2, 2),
  'olimpia-grudziadz': k(1, 2, 2),
  hutnik: k(2, 3, 3),
  'legia-ii': k(1, 1, 1),
  podhale: k(1, 2, 2),
  avia: k(1, 1, 1),
  swit: k(1, 1, 1),
  'slask-ii': k(1, 1, 1),
  'lechia-zg': k(1, 2, 2),
  rekord: k(1, 1, 1),
  'sokol-kleczew': k(1, 1, 1),
};

// Rywalizacje: [klub A, klub B, intensywność 1-3]. 3 = wielkie derby (najwyższe ryzyko incydentów i emocji).
// Derby lokalne bez wpisu wykrywa fans.js po regionie z clubs_pl.js (intensywność 1).
export const RIVALRIES = [
  ['wisla-krakow', 'cracovia', 3], // derby Krakowa, „Święta Wojna” (źródła 7, 8)
  ['lechia-gdansk', 'arka', 3], // derby Trójmiasta
  ['widzew', 'lks', 3], // derby Łodzi
  ['ruch', 'gornik-zabrze', 3], // Wielkie Derby Śląska
  ['legia', 'lech', 2], // klasyk [SZAC]
  ['legia', 'widzew', 2], // [SZAC]
  ['legia', 'polonia-warszawa', 2], // derby Warszawy
  ['legia', 'wisla-krakow', 2], // [SZAC]
  ['ruch', 'gks-katowice', 2], // [SZAC]
  ['gornik-zabrze', 'gks-katowice', 2], // [SZAC]
  ['ruch', 'polonia-bytom', 2], // [SZAC]
  ['gornik-zabrze', 'polonia-bytom', 2], // [SZAC]
  ['gks-katowice', 'gks-tychy', 2], // [SZAC]
  ['slask', 'zaglebie-lubin', 2], // derby Dolnego Śląska [SZAC]
  ['zaglebie-lubin', 'miedz', 2], // derby Zagłębia Miedziowego [SZAC]
  ['motor', 'gornik-leczna', 2], // derby Lubelszczyzny [SZAC]
  ['stal-rzeszow', 'resovia', 2], // derby Rzeszowa
  ['stal-mielec', 'stal-rzeszow', 2], // derby Podkarpacia [SZAC]
  ['stal-mielec', 'stal-stalowa-wola', 1], // [SZAC]
  ['korona', 'radomiak', 2], // [SZAC] napięcia potwierdza kara dla Korony za słowa pod adresem kibiców Radomiaka (źródło 4)
  ['lech', 'pogon-szczecin', 2], // [SZAC]
  ['lech', 'warta', 1], // derby Poznania
  ['legia', 'jagiellonia', 1], // [SZAC]
  ['cracovia', 'hutnik', 1], // [SZAC]
  ['wisla-krakow', 'hutnik', 1], // [SZAC]
  ['podbeskidzie', 'rekord', 1], // derby Bielska-Białej
  ['slask', 'lech', 1], // [SZAC]
];
