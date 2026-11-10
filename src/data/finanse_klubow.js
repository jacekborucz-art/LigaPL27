// Finanse polskich klubów na start gry (sezon 2026/27). Kwoty w mln zł za sezon, chyba że opisano inaczej.
// Opis modelu, tabele i pełna lista źródeł: docs/finanse.md. Stan danych: Nov 10, 2026.
//
// Pola klubu:
//   liga        poziom, którego dotyczą kwoty (liga klubu w sezonie 2026/27 w grze)
//   komercja    sponsorzy, sprzedaż koszulek, catering, reklama, inne przychody komercyjne (mln zł / sezon)
//   place       wynagrodzenia I drużyny: zawodnicy i sztab (mln zł / sezon, definicja Grant Thornton)
//   pojemnosc   pojemność stadionu (miejsca)
//   frekwencja  średnia frekwencja w meczu ligowym
//   naKibica    przychód z dnia meczowego na jednego widza w zł (bilety, karnety, loże, catering)
//   sponsor     siła sponsorów 1-5 (opisowa, do wiadomości i UI)
//   wlasciciel  { typ: 'miliarder' | 'prywatny' | 'miasto' | 'spolka' | 'klub', kto, doplata (mln zł / sezon,
//               regularne dopłaty albo dotacje), skarbiec (mln zł: do tylu właściciel uzupełnia saldo
//               na start sezonu, czyli realna gotówka na transfery; 0 = brak) }
//   szac        lista pól oszacowanych [SZAC]; pozostałe pola mają źródło w docs/finanse.md
//   pay         płacowość: mnożnik pensji klubu względem rynku (kalibracja: tools/kalibracja-finansow.mjs)
//
// Najważniejsze źródła (szczegóły i cytaty w docs/finanse.md):
//   Grant Thornton i Ekstraklasa SA, "Finansowa Ekstraklasa 2025/2026" (wrzesień 2026), przez:
//     https://legionisci.com/news/106369/290-mln-zl-przychodow-236-mln-zl-za-punkt-17-mln-straty
//     https://igol.pl/zarobki-pilkarzy-w-ekstraklasie/
//     https://x.com/GrantThorntonPL/status/2102327039823098250
//     https://roosevelta81.pl/raport-grant-thornton-wynagrodzenia-gornik-zabrze-liderem-efektywnosci-budzetowej/
//     https://lodzkisport.pl/pilka-nozna/widzew-na-kosztownej-sciezce-co-pokazuje-raport-grant-thorntona/WZzOCDlbc7RpPiMFoNcZ
//   Grant Thornton, "Finansowa pierwsza liga 2025/2026" (listopad 2026):
//     https://pzpn.pl/federacja/aktualnosci/2026-11-03/pierwszoligowe-kluby-zamykaja-sezon-z-kolejnym-rekordem-przychodow
//   Ekstraklasa SA, podział 301,1 mln zł za sezon 2025/26:
//     https://wzabrzu.info/ekstraklasa-podzielila-ponad-301-mln-zl-gornik-zabrze-z-drugim-najwyzszym-przelewem/
//   Budżety przedsezonowe 2025/26: https://x.com/football_inf0/status/1954796809433321903
//   Frekwencja 2025/26: https://stadiony.net/aktualnosci/2026/06/polska_podsumowanie_frekwencyjne_sezonu_202526_pko_bp_ekstraklasa_z_kolejnymi_rekordami
//   Majątek właścicieli: https://x.com/football_inf0/status/2040082897953300870

export const EUR_PLN = 4.25; // [SZAC] kurs średni 2025-2026, do nagród UEFA i wartości rynkowej

const k = (liga, komercja, place, pojemnosc, frekwencja, naKibica, sponsor, wlasciciel, szac = [], pay = 1) => ({
  liga, komercja, place, pojemnosc, frekwencja, naKibica, sponsor, wlasciciel, szac, pay,
});
const own = (typ, kto, doplata = 0, skarbiec = 0) => ({ typ, kto, doplata, skarbiec });
const ALL = ['komercja', 'place', 'frekwencja', 'naKibica'];

export const FINANSE_KLUBOW = {
  // ------------------------------------------------------------ Ekstraklasa
  // Legia: komercja 88,9 i dzień meczowy 61,6 mln zł, płace I drużyny 77,0 (GT 2025/26); 112 zł na kibica
  legia: k(1, 88.9, 77.0, 31103, 23490, 112, 5, own('prywatny', 'Dariusz Mioduski'), [], 1.75),
  // Lech: dzień meczowy 61,9 mln zł, 78 zł na kibica, płace I drużyny 57,3; komercja oszacowana z różnicy
  lech: k(1, 72, 57.3, 42837, 31065, 78, 5, own('prywatny', 'rodzina Rutkowskich', 0, 10), ['komercja'], 1.25),
  // Raków: płace I drużyny 58,6; mały stadion, klub żyje z transferów i pieniędzy właściciela (x-kom)
  rakow: k(1, 38, 58.6, 5500, 5000, 60, 4, own('miliarder', 'Michał Świerczewski (x-kom)', 32, 25), ['komercja', 'pojemnosc', 'frekwencja', 'naKibica', 'doplata'], 1.5),
  jagiellonia: k(1, 26, 35.4, 22372, 16000, 50, 3, own('miasto', 'Miasto Białystok', 4, 0), ['komercja', 'frekwencja', 'naKibica', 'doplata'], 1),
  // Widzew: przychody 67,3, płace I drużyny 68,3, 143,6 mln zł dokapitalizowania od Roberta Dobrzyckiego w 2025/26
  widzew: k(1, 24, 68.3, 18018, 17243, 71, 4, own('miliarder', 'Robert Dobrzycki (Panattoni)', 50, 45), ['komercja', 'doplata', 'skarbiec'], 2.2),
  // Pogoń: płace I drużyny 30,7, dokapitalizowanie 13,1 mln zł (Alex Haditaghi), dzień meczowy netto 16,2
  'pogon-szczecin': k(1, 22, 30.7, 21163, 15000, 55, 3, own('miliarder', 'Alex Haditaghi', 13.1, 15), ['komercja', 'frekwencja', 'naKibica', 'skarbiec'], 1.05),
  // Wieczysta: 49,1 mln zł przychodu w 1 Lidze 2025/26; właściciel Wojciech Kwiecień
  wieczysta: k(1, 30, 32, 5000, 3500, 45, 4, own('miliarder', 'Wojciech Kwiecień', 10, 20), [...ALL, 'pojemnosc', 'doplata', 'skarbiec'], 1.1),
  // Górnik: przychody 111 mln zł (35,6 z transferów), płace I drużyny 32,4, średnio 23 888 widzów
  'gornik-zabrze': k(1, 22, 32.4, 26500, 23888, 50, 3, own('miasto', 'Miasto Zabrze', 4, 0), ['komercja', 'naKibica', 'doplata'], 1.1),
  // Wisła Kraków: 56 mln zł przychodu w 1 Lidze 2025/26 przy wskaźniku płac 37 %, awans do Ekstraklasy
  'wisla-krakow': k(1, 24, 26, 33130, 22000, 50, 4, own('prywatny', 'Jarosław Królewski i wspólnicy', 0, 5), ALL, 0.95),
  // Cracovia: płace I drużyny 25,2; od sierpnia 2025 większość ma Robert Platek (szacunek majątku 7,4 mld zł)
  cracovia: k(1, 20, 25.2, 15016, 9500, 45, 3, own('miliarder', 'Robert Platek', 5, 20), ['komercja', 'frekwencja', 'naKibica', 'doplata', 'skarbiec'], 1),
  piast: k(1, 14, 22.7, 9913, 5500, 35, 2, own('miasto', 'Miasto Gliwice', 6, 0), ['komercja', 'frekwencja', 'naKibica', 'doplata'], 0.9),
  // Śląsk: w 1 Lidze 2025/26 przychody 34,4, wskaźnik płac 119 % (72 % po podwyższeniu kapitału przez miasto)
  slask: k(1, 24, 28, 42771, 13000, 45, 3, own('miasto', 'Miasto Wrocław', 8, 0), [...ALL, 'doplata'], 1.15),
  // Zagłębie: płace I drużyny 35,4, właścicielem jest KGHM
  'zaglebie-lubin': k(1, 34, 35.4, 16068, 6500, 35, 5, own('spolka', 'KGHM Polska Miedź', 8, 5), ['komercja', 'frekwencja', 'naKibica', 'doplata'], 1.55),
  // Motor: płace I drużyny 20,8; Zbigniew Jakubas (szacunek majątku 5,94 mld zł, ok. 72 mln zł włożone w klub)
  motor: k(1, 18, 20.8, 15247, 12000, 45, 3, own('miliarder', 'Zbigniew Jakubas', 4, 15), ['komercja', 'frekwencja', 'naKibica', 'doplata', 'skarbiec'], 0.9),
  korona: k(1, 14, 21.1, 15550, 9000, 40, 2, own('miasto', 'Miasto Kielce', 5, 0), ['komercja', 'frekwencja', 'naKibica', 'doplata'], 0.95),
  // GKS Katowice: nowa Arena Katowice (komplet 14 279 widzów w 21. kolejce 2025/26)
  'gks-katowice': k(1, 12, 28.4, 15000, 11500, 45, 2, own('miasto', 'Miasto Katowice', 10, 0), ['komercja', 'pojemnosc', 'frekwencja', 'naKibica', 'doplata'], 1.35),
  // Radomiak: płace I drużyny 23,4, wskaźnik płac 93 % w 2024/25
  radomiak: k(1, 10, 23.4, 8840, 5000, 35, 2, own('prywatny', 'właściciel prywatny', 7, 0), ['komercja', 'pojemnosc', 'frekwencja', 'naKibica', 'doplata'], 1.05),
  'wisla-plock': k(1, 16, 20, 15004, 7500, 35, 4, own('miasto', 'Miasto Płock (sponsor Orlen)', 5, 0), [...ALL, 'doplata'], 1),

  // ------------------------------------------------------------ 1 Liga
  // 1 Liga 2025/26: przychody klubów 360,2 mln zł, wynagrodzenia ponad 298 mln zł, 7 klubów z płacami ponad przychody
  'lechia-gdansk': k(2, 15, 14, 41620, 11500, 35, 3, own('prywatny', 'właściciel prywatny', 3, 0), [...ALL, 'doplata'], 1.25),
  arka: k(2, 10, 11, 15139, 7000, 30, 2, own('miasto', 'Miasto Gdynia', 4, 0), [...ALL, 'doplata'], 1.35),
  'stal-mielec': k(2, 8, 7, 6864, 3500, 25, 2, own('miasto', 'Miasto Mielec', 3, 0), [...ALL, 'doplata'], 0.8),
  puszcza: k(2, 6, 7, 2118, 1500, 20, 2, own('miasto', 'Gmina Niepołomice', 2, 0), [...ALL, 'pojemnosc', 'doplata'], 0.75),
  termalica: k(2, 12, 11, 4666, 2500, 25, 4, own('spolka', 'Bruk-Bet', 3, 3), [...ALL, 'doplata'], 1.3),
  // Ruch: 26,4 mln zł przychodu w 1 Lidze 2025/26 (5. miejsce); mecze na Stadionie Śląskim
  ruch: k(2, 12, 11, 54378, 9000, 30, 2, own('miasto', 'Miasto Chorzów', 5, 0), [...ALL, 'doplata'], 1.35),
  // ŁKS: 21,0 mln zł przychodu w 1 Lidze 2025/26 (7. miejsce)
  lks: k(2, 10, 10, 18008, 6000, 30, 2, own('prywatny', 'Tomasz Salski', 2, 0), [...ALL, 'doplata'], 1.25),
  miedz: k(2, 8, 8, 6244, 2500, 25, 2, own('prywatny', 'właściciel prywatny', 2, 0), [...ALL, 'pojemnosc', 'doplata'], 1),
  // Polonia Warszawa: 11,5 mln zł przychodu i wskaźnik płac 164 % w 2025/26
  'polonia-warszawa': k(2, 6, 13, 7150, 3000, 30, 2, own('prywatny', 'właściciel prywatny', 9, 0), ['komercja', 'pojemnosc', 'frekwencja', 'naKibica', 'doplata'], 1.6),
  'stal-rzeszow': k(2, 7, 6, 11547, 3000, 20, 2, own('miasto', 'Miasto Rzeszów', 2, 0), [...ALL, 'pojemnosc', 'doplata'], 0.95),
  podbeskidzie: k(2, 6, 6, 15316, 3000, 20, 2, own('miasto', 'Miasto Bielsko-Biała', 2, 0), [...ALL, 'doplata'], 0.9),
  'odra-opole': k(2, 6, 6, 11600, 4500, 20, 2, own('miasto', 'Miasto Opole', 2.5, 0), [...ALL, 'pojemnosc', 'doplata'], 0.9),
  warta: k(2, 4, 5, 5383, 1200, 20, 1, own('prywatny', 'właściciel prywatny', 1.5, 0), [...ALL, 'pojemnosc', 'doplata'], 0.7),
  'polonia-bytom': k(2, 5, 5, 5500, 2500, 20, 2, own('prywatny', 'właściciel prywatny', 1.5, 0), [...ALL, 'pojemnosc', 'doplata'], 0.85),
  chrobry: k(2, 4, 4.5, 2817, 1300, 20, 1, own('miasto', 'Miasto Głogów', 1.5, 0), [...ALL, 'pojemnosc', 'doplata'], 0.75),
  'pogon-grodzisk': k(2, 5, 5, 2000, 1000, 20, 2, own('prywatny', 'właściciel prywatny', 1.5, 0), [...ALL, 'pojemnosc', 'doplata'], 0.8),
  'pogon-siedlce': k(2, 4, 4, 2900, 1300, 20, 1, own('miasto', 'Miasto Siedlce', 1, 0), [...ALL, 'pojemnosc', 'doplata'], 0.65),
  'unia-skierniewice': k(2, 3.5, 3.5, 2000, 1000, 20, 1, own('miasto', 'Miasto Skierniewice', 1, 0), [...ALL, 'pojemnosc', 'doplata'], 0.6),

  // ------------------------------------------------------------ 2 Liga (bez raportów finansowych: wszystko [SZAC])
  'gks-tychy': k(3, 4, 3.5, 15150, 2500, 20, 2, own('miasto', 'Miasto Tychy', 1.5, 0), [...ALL, 'doplata'], 1.3),
  'gornik-leczna': k(3, 3, 3, 7464, 1500, 18, 2, own('miasto', 'Miasto Łęczna (sponsor Bogdanka)', 1, 0), [...ALL, 'doplata'], 1.15),
  zawisza: k(3, 2.5, 2.5, 20247, 2500, 18, 1, own('prywatny', 'właściciel prywatny', 0.8, 0), [...ALL, 'doplata'], 0.95),
  sandecja: k(3, 2.5, 2.5, 2000, 1200, 15, 1, own('miasto', 'Miasto Nowy Sącz', 1, 0), [...ALL, 'pojemnosc', 'doplata'], 1),
  znicz: k(3, 2.2, 2.2, 1977, 600, 15, 1, own('miasto', 'Miasto Pruszków', 0.8, 0), [...ALL, 'doplata'], 0.9),
  chojniczanka: k(3, 2.2, 2.2, 3500, 1200, 15, 1, own('miasto', 'Miasto Chojnice', 0.8, 0), [...ALL, 'pojemnosc', 'doplata'], 0.95),
  'stal-stalowa-wola': k(3, 2.5, 2.3, 3764, 2000, 15, 1, own('miasto', 'Miasto Stalowa Wola', 1, 0), [...ALL, 'pojemnosc', 'doplata'], 1.1),
  resovia: k(3, 2, 2, 3000, 1000, 15, 1, own('prywatny', 'właściciel prywatny', 0.8, 0), [...ALL, 'pojemnosc', 'doplata'], 0.95),
  'olimpia-grudziadz': k(3, 2, 2, 5323, 900, 15, 1, own('miasto', 'Miasto Grudziądz', 0.8, 0), [...ALL, 'doplata'], 0.9),
  hutnik: k(3, 2.2, 2.2, 6000, 1500, 15, 1, own('miasto', 'Miasto Kraków', 0.8, 0), [...ALL, 'pojemnosc', 'doplata'], 1.05),
  'legia-ii': k(3, 0.3, 2.0, 2000, 300, 10, 1, own('klub', 'Legia Warszawa', 2.0, 0), [...ALL, 'pojemnosc', 'doplata'], 1.25),
  podhale: k(3, 1.5, 1.6, 3000, 800, 15, 1, own('miasto', 'Miasto Nowy Targ', 0.7, 0), [...ALL, 'pojemnosc', 'doplata'], 0.8),
  avia: k(3, 1.5, 1.6, 3000, 700, 15, 1, own('miasto', 'Miasto Świdnik', 0.7, 0), [...ALL, 'pojemnosc', 'doplata'], 0.85),
  swit: k(3, 1.3, 1.4, 1000, 400, 12, 1, own('prywatny', 'właściciel prywatny', 0.6, 0), [...ALL, 'pojemnosc', 'doplata'], 0.75),
  'slask-ii': k(3, 0.2, 1.5, 2000, 300, 10, 1, own('klub', 'Śląsk Wrocław', 1.5, 0), [...ALL, 'pojemnosc', 'doplata'], 1),
  'lechia-zg': k(3, 1.4, 1.5, 3000, 700, 12, 1, own('miasto', 'Miasto Zielona Góra', 0.6, 0), [...ALL, 'pojemnosc', 'doplata'], 0.85),
  rekord: k(3, 1.8, 1.6, 1000, 400, 12, 2, own('spolka', 'Rekord SI', 0.5, 0), [...ALL, 'pojemnosc', 'doplata'], 0.95),
  'sokol-kleczew': k(3, 1.6, 1.5, 1500, 500, 12, 1, own('miasto', 'Gmina Kleczew', 0.6, 0), [...ALL, 'pojemnosc', 'doplata'], 0.95),
};

/** Wartości domyślne dla klubów bez danych (beniaminkowie z III ligi, nowe kluby). Wszystko [SZAC]. */
export const DOMYSLNE = {
  1: k(1, 12, 18, 10000, 5000, 35, 2, own('miasto', 'samorząd', 3, 0), [...ALL, 'pojemnosc', 'doplata']),
  2: k(2, 5, 5, 5000, 1500, 20, 1, own('miasto', 'samorząd', 1.5, 0), [...ALL, 'pojemnosc', 'doplata']),
  3: k(3, 1.6, 1.6, 2500, 700, 13, 1, own('miasto', 'samorząd', 0.6, 0), [...ALL, 'pojemnosc', 'doplata']),
  4: k(4, 0.8, 0.8, 1500, 300, 10, 1, own('miasto', 'samorząd', 0.3, 0), [...ALL, 'pojemnosc', 'doplata']),
};

/** Dane klubu (z domyślnymi dla nieznanych). */
export function clubFinanceData(club) {
  const id = typeof club === 'string' ? club : club?.id;
  return FINANSE_KLUBOW[id] ?? DOMYSLNE[Math.min(4, Math.max(1, club?.tier ?? 3))];
}

/** Płacowość klubu: mnożnik rynkowej pensji (bogaci właściciele płacą więcej). Wolni zawodnicy i nieznane kluby: 1. */
export function payLevel(club) {
  const id = typeof club === 'string' ? club : club?.id;
  return FINANSE_KLUBOW[id]?.pay ?? 1;
}
