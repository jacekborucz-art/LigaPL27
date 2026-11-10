// Generator bazy klubow UEFA 2026/27 dla gry managerskiej.
// Uruchom: node gen.js <katalog_wyjsciowy>
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2];

// ---------- Kraje: ranking 2025 (sezony 2020/21-2024/25), podstawa przydzialu miejsc w 2026/27 ----------
// [kod, nazwa, pozycja, wspolczynnik, pewne(1/0), biezacyNov2026 lub null, pozycjaBiezaca lub null]
const KRAJE = [
  ['ENG','Anglia',1,115.0,0,107.685,1],
  ['ITA','Włochy',2,98.0,0,null,null],
  ['ESP','Hiszpania',3,92.6,0,null,null],
  ['GER','Niemcy',4,88.5,0,null,null],
  ['FRA','Francja',5,75.0,0,null,null],
  ['NED','Holandia',6,67.150,1,56.395,8],
  ['POR','Portugalia',7,62.266,1,69.150,6],
  ['BEL','Belgia',8,56.850,1,64.050,7],
  ['CZE','Czechy',9,48.0,0,46.325,11],
  ['TUR','Turcja',10,43.900,1,53.075,9],
  ['NOR','Norwegia',11,39.687,1,41.012,13],
  ['GRE','Grecja',12,39.312,1,47.612,10],
  ['AUT','Austria',13,36.4,0,null,null],
  ['SCO','Szkocja',14,35.6,0,null,null],
  ['POL','Polska',15,35.000,1,45.725,12],
  ['DEN','Dania',16,33.981,1,40.806,14],
  ['SUI','Szwajcaria',17,31.0,0,null,null],
  ['ISR','Izrael',18,29.0,0,null,null],
  ['CYP','Cypr',19,27.537,1,null,null],
  ['SWE','Szwecja',20,27.125,1,null,null],
  ['CRO','Chorwacja',21,27.025,1,null,null],
  ['SRB','Serbia',22,25.5,0,null,null],
  ['HUN','Węgry',23,23.5,0,null,null],
  ['UKR','Ukraina',24,23.0,0,null,null],
  ['ROU','Rumunia',25,22.0,0,null,null],
  ['SVN','Słowenia',26,21.6,0,null,null],
  ['SVK','Słowacja',27,21.250,1,null,null],
  ['AZE','Azerbejdżan',28,20.5,0,null,null],
  ['BUL','Bułgaria',29,19.0,0,null,null],
  ['KAZ','Kazachstan',30,14.0,0,null,null],
  ['MDA','Mołdawia',31,13.0,0,null,null],
  ['IRL','Irlandia',32,12.8,0,null,null],
  ['ISL','Islandia',33,12.5,0,null,null],
  ['FIN','Finlandia',34,11.6,0,null,null],
  ['ARM','Armenia',35,11.0,0,null,null],
  ['BIH','Bośnia i Hercegowina',36,10.6,0,null,null],
  ['LVA','Łotwa',37,10.2,0,null,null],
  ['FRO','Wyspy Owcze',38,9.8,0,null,null],
  ['KOS','Kosowo',39,9.5,0,null,null],
  ['LTU','Litwa',40,9.0,0,null,null],
  ['MLT','Malta',41,8.4,0,null,null],
  ['LIE','Liechtenstein',42,8.0,0,null,null],
  ['BLR','Białoruś',43,7.9,0,null,null],
  ['ALB','Albania',44,7.6,0,null,null],
  ['MKD','Macedonia Północna',45,7.3,0,null,null],
  ['GEO','Gruzja',46,7.1,0,null,null],
  ['EST','Estonia',47,6.9,0,null,null],
  ['LUX','Luksemburg',48,6.6,0,null,null],
  ['NIR','Irlandia Północna',49,6.4,0,null,null],
  ['MNE','Czarnogóra',50,6.0,0,null,null],
  ['GIB','Gibraltar',51,5.9,0,null,null],
  ['WAL','Walia',52,5.4,0,null,null],
  ['AND','Andora',53,4.9,0,null,null],
  ['SMR','San Marino',54,2.9,0,null,null],
  ['RUS','Rosja (zawieszona)',55,0,0,null,null],
];
const C_OF = Object.fromEntries(KRAJE.map(k => [k[0], k[3]]));

// ---------- Wzor L ----------
// Lc: sila wynikajaca ze wspolczynnika klubowego (log-liniowo)
const Lc = c => 1.555 + 2.974 * Math.log(c + 10);
// Lb: typowa sila klubu z gornej polowy danej ligi (z rankingu krajowego), interpolacja liniowa w ln(C)
const LB_ANCHORS = [[3, 7.5], [10, 9.3], [35, 12.0], [115, 14.5]];
function Lb(C) {
  const x = Math.log(Math.max(C, 1));
  const a = LB_ANCHORS.map(([c, l]) => [Math.log(c), l]);
  let i = 0;
  if (x <= a[0][0]) i = 0; else if (x >= a[a.length - 1][0]) i = a.length - 2;
  else while (!(x >= a[i][0] && x <= a[i + 1][0])) i++;
  const [x0, y0] = a[i], [x1, y1] = a[i + 1];
  const y = y0 + (x - x0) * (y1 - y0) / (x1 - x0);
  return Math.min(14.8, Math.max(7.0, y));
}
function computeL(c, kraj) {
  const C = C_OF[kraj];
  const lc = Lc(c), lb = Lb(C);
  let L;
  if (lb > lc) L = lc + 0.85 * (lb - lc);           // mocna liga podciaga klub o niskim wspolczynniku
  else L = lc - 0.6 * Math.max(0, 1 - C / 36) * (lc - lb); // slaba liga obniza "napompowany" wspolczynnik
  L = Math.min(16.8, Math.max(7.5, L));
  return Math.round(L * 10) / 10;
}
const tierOf = L => L >= 15.5 ? 'A' : L >= 14.0 ? 'B' : L >= 12.0 ? 'C' : L >= 10.0 ? 'D' : 'E';

// Szacunkowe miejsce w rankingu klubowym UEFA (interpolacja punkt -> miejsce)
const RANK_ANCHORS = [[147.5,1],[144.5,2],[132,3],[130,4],[127,5],[125.5,6],[119,7],[113.25,8],[104.75,9],[100.75,10],
  [97.75,13],[84,16],[80,19],[75,22],[70,27],[60,38],[50,52],[40,72],[30,100],[25,118],[20,145],[15,185],[12,215],
  [10,240],[8,270],[6,310],[4,360],[2,410],[1,440]];
function rankOf(c) {
  for (let i = 0; i < RANK_ANCHORS.length - 1; i++) {
    const [c0, r0] = RANK_ANCHORS[i], [c1, r1] = RANK_ANCHORS[i + 1];
    if (c <= c0 && c >= c1) return Math.round(r0 + (c0 - c) * (r1 - r0) / (c0 - c1));
  }
  return c > 147.5 ? 1 : 450;
}

// ---------- Kluby ----------
// [id, nazwa, kraj, wspolczynnik, wspPewny(1/0), rozgrywki, prestiz, trener, narodowosc, droga/uwagi, udzialPewny(1/0)]
const K = [];
const add = (rozgr, rows) => rows.forEach(r => K.push({ r, rozgr }));

add('LM', [
  ['paris-sg','Paris Saint-Germain','FRA',132.0,1,10,'O','FRA','Obrońca trofeum (zwycięzca LM 2025/26); koszyk 1',1],
  ['bayern','Bayern Monachium','GER',147.5,1,10,'O','GER','Koszyk 1',1],
  ['real-madrid','Real Madryt','ESP',144.5,1,10,'O','ESP','Koszyk 1',1],
  ['liverpool','Liverpool','ENG',130.0,1,10,'O','ENG','Koszyk 1',1],
  ['inter','Inter Mediolan','ITA',127.0,1,9,'P','ITA','Koszyk 1',1],
  ['man-city','Manchester City','ENG',125.5,1,10,'O','ENG','Koszyk 1',1],
  ['arsenal','Arsenal','ENG',119.0,1,9,'P','ENG','Koszyk 1',1],
  ['barcelona','FC Barcelona','ESP',113.25,1,10,'O','ESP','Koszyk 1',1],
  ['atletico','Atlético Madryt','ESP',104.75,1,9,'S','ESP','Koszyk 1',1],
  ['dortmund','Borussia Dortmund','GER',100.75,1,8,'O','GER','Koszyk 2',1],
  ['roma','AS Roma','ITA',97.75,1,8,'P','ITA','Koszyk 2',1],
  ['sporting','Sporting CP','POR',84.0,1,8,'O','POR','Koszyk 2',1],
  ['aston-villa','Aston Villa','ENG',83.0,1,7,'P','ENG','Koszyk 2',1],
  ['porto','FC Porto','POR',80.75,1,8,'P','POR','Koszyk 2',1],
  ['man-utd','Manchester United','ENG',76.5,1,9,'P','ENG','Koszyk 2',1],
  ['club-brugge','Club Brugge','BEL',75.25,1,7,'O','BEL','Koszyk 2',1],
  ['real-betis','Real Betis','ESP',74.5,1,7,'O','ESP','Koszyk 2',1],
  ['psv','PSV Eindhoven','NED',71.25,1,7,'O','NED','Koszyk 2',1],
  ['feyenoord','Feyenoord','NED',71.0,1,7,'O','NED','Koszyk 3',1],
  ['lille','Lille OSC','FRA',68.75,1,7,'P','FRA','Koszyk 3',1],
  ['napoli','SSC Napoli','ITA',63.0,1,8,'P','ITA','Koszyk 3',1],
  ['bodo-glimt','Bodø/Glimt','NOR',62.0,0,6,'O','NOR','Koszyk 3',1],
  ['rb-lipsk','RB Lipsk','GER',61.0,1,7,'O','GER','Koszyk 3',1],
  ['szachtar','Szachtar Donieck','UKR',57.0,0,7,'O','UKR','Koszyk 3',1],
  ['villarreal','Villarreal','ESP',54.0,0,7,'P','ESP','Koszyk 3',1],
  ['fenerbahce','Fenerbahçe','TUR',51.0,0,8,'P','TUR','Koszyk 3; eliminacje LM ścieżka ligowa: Q2 wyelim. Górnik Zabrze, PO wyelim. Olympique Lyon 3-2',1],
  ['galatasaray','Galatasaray','TUR',49.0,0,8,'O','TUR','Koszyk 3',1],
  ['slavia-praga','Slavia Praga','CZE',46.0,0,6,'P','CZE','Koszyk 4',1],
  ['stuttgart','VfB Stuttgart','GER',36.0,0,7,'O','GER','Koszyk 4',1],
  ['aek-ateny','AEK Ateny','GRE',28.0,0,6,'P','GRE','Koszyk 4; LM PO wyelim. Lewski Sofia 4-0',1],
  ['slovan','Slovan Bratysława','SVK',27.0,0,5,'P','SVK','Koszyk 4; LM PO wyelim. NK Celje 3-2 po dogrywce',1],
  ['lask','LASK Linz','AUT',22.0,0,4,'P','AUT','Koszyk 4',1],
  ['como','Como 1907','ITA',19.6,0,5,'O','ESP','Koszyk 4; debiut w LM; kadra mocno hiszpańska',1],
  ['lens','RC Lens','FRA',17.0,0,5,'P','FRA','Koszyk 4',1],
  ['sabah','Sabah FK','AZE',12.0,0,3,'P','AZE','Koszyk 4; LM Q1 wyelim. The New Saints 4-1, potem Q2, Q3 i PO; debiut',1],
  ['viking','Viking FK','NOR',9.0,0,4,'O','NOR','Koszyk 4; LM PO wyelim. Dinamo Zagrzeb 5-3; debiut',1],
]);

add('LE', [
  ['leverkusen','Bayer Leverkusen','GER',90.0,0,8,'O','GER','Koszyk 1',1],
  ['benfica','Benfica','POR',92.0,0,9,'O','POR','Koszyk 1; LE PO wyelim. Aarhus GF 6-2 (wcześniej przegrana w eliminacjach LM)',1],
  ['juventus','Juventus','ITA',75.0,0,9,'P','ITA','Koszyk 1',1],
  ['milan','AC Milan','ITA',62.0,0,9,'P','ITA','Koszyk 1',1],
  ['lyon','Olympique Lyon','FRA',58.0,0,8,'O','FRA','Koszyk 1; przegrał LM PO z Fenerbahçe 2-3',1],
  ['olympiakos','Olympiakos Pireus','GRE',57.0,0,7,'P','GRE','Koszyk 1',1],
  ['az-alkmaar','AZ Alkmaar','NED',50.0,0,6,'O','NED','Koszyk 1',1],
  ['marsylia','Olympique Marsylia','FRA',50.0,0,8,'O','FRA','Koszyk 1',1],
  ['real-sociedad','Real Sociedad','ESP',48.0,0,7,'P','ESP','Koszyk 1',1],
  ['union-sg','Union Saint-Gilloise','BEL',46.0,0,6,'P','BEL','Koszyk 2',1],
  ['dinamo-zagrzeb','Dinamo Zagrzeb','CRO',45.0,0,6,'O','CRO','Koszyk 2; LM Q2 wyelim. FC Thun po dogrywce, przegrał LM PO z Viking 3-5',1],
  ['salzburg','Red Bull Salzburg','AUT',45.0,0,7,'O','AUT','Koszyk 2; LE PO wyelim. Mjällby 4-0',1],
  ['viktoria-pilzno','Viktoria Pilzno','CZE',44.0,0,6,'P','CZE','Koszyk 2; LE PO wyelim. Crvena zvezda 5-4 po dogrywce',1],
  ['ferencvaros','Ferencváros','HUN',42.0,0,6,'P','HUN','Koszyk 2; LE Q3 wyelim. Górnik Zabrze, LE PO wyelim. Trabzonspor 5-0',1],
  ['celtic','Celtic','SCO',40.0,0,7,'O','SCO','Koszyk 2',1],
  ['sparta-praga','Sparta Praga','CZE',38.0,0,6,'P','CZE','Koszyk 2',1],
  ['anderlecht','RSC Anderlecht','BEL',36.0,0,7,'P','BEL','Koszyk 2; w eliminacjach wyelim. Hammarby, LE PO wyelim. Kairat 6-0',1],
  ['rennes','Stade Rennes','FRA',33.0,0,6,'P','FRA','Koszyk 2',1],
  ['crystal-palace','Crystal Palace','ENG',30.0,0,6,'P','ENG','Koszyk 3; zwycięzca LK 2025/26',1],
  ['celje','NK Celje','SVN',26.5,0,4,'O','SVN','Koszyk 3; przegrał LM PO ze Slovanem 2-3 po dogrywce',1],
  ['sturm-graz','Sturm Graz','AUT',26.0,0,5,'P','AUT','Koszyk 3; LM Q2 awans, potem przegrana w eliminacjach LM',1],
  ['omonia','Omonia Nikozja','CYP',24.0,0,4,'P','CYP','Koszyk 3; LM Q2 przegrana z Kairatem (karne), LE PO wyelim. Sint-Truiden 4-3',1],
  ['bournemouth','AFC Bournemouth','ENG',23.0,0,5,'O','ENG','Koszyk 3',1],
  ['sunderland','Sunderland AFC','ENG',23.0,0,5,'S','ENG','Koszyk 3',1],
  ['celta','Celta Vigo','ESP',18.5,0,6,'O','ESP','Koszyk 3',1],
  ['hoffenheim','TSG Hoffenheim','GER',17.7,0,5,'O','GER','Koszyk 4',1],
  ['besiktas','Beşiktaş','TUR',17.5,0,7,'P','TUR','Koszyk 4; LE PO wyelim. Kauno Žalgiris 3-1',1],
  ['nec','NEC Nijmegen','NED',13.4,0,4,'O','NED','Koszyk 4',1],
  ['torreense','SCU Torreense','POR',12.5,0,2,'S','POR','Koszyk 4; pierwszy start w pucharach',1],
  ['hapoel-beer-szewa','Hapoel Beer Szewa','ISR',10.0,0,4,'P','ISR','Koszyk 4; LM Q2 awans, potem przegrana w eliminacjach LM',1],
  ['lewski-sofia','Lewski Sofia','BUL',9.5,0,5,'P','BUL','Koszyk 4; LM Q1 awans, Q2 wyelim. U Craiova 3-2, przegrał LM PO z AEK 0-4',1],
  ['ofi-kreta','OFI Kreta','GRE',7.9,0,3,'P','GRE','Koszyk 4; LE PO wyelim. CSKA Sofia 5-0',1],
  ['lillestrom','Lillestrøm SK','NOR',7.9,0,3,'O','NOR','Koszyk 4; LE PO wyelim. Egnatia 2-1 po dogrywce',1],
  ['ararat-armenia','Ararat-Armenia','ARM',6.5,0,3,'P','ARM','Koszyk 4; LM Q1 wyelim. Riga FC, Q2 wyelim. Shamrock 3-2, LE PO wyelim. U Craiova 2-1',1],
]);

add('LK', [
  ['atalanta','Atalanta','ITA',78.0,0,7,'O','ITA','Koszyk 1; LK PO wyelim. Hapoel Tel Awiw 1-0',1],
  ['ajax','Ajax Amsterdam','NED',55.0,0,8,'O','NED','Koszyk 1',1],
  ['braga','SC Braga','POR',50.0,0,6,'P','POR','Koszyk 1; LK PO wyelim. Austria Wiedeń',1],
  ['kopenhaga','FC Kopenhaga','DEN',42.0,0,6,'P','DEN','Koszyk 1; LK PO wyelim. Inter Turku 4-1',1],
  ['monaco','AS Monaco','FRA',40.0,0,7,'O','FRA','Koszyk 1; LK PO wyelim. Górnik Zabrze 7-3 (3-2, 4-1)',1],
  ['freiburg','SC Freiburg','GER',36.0,0,6,'P','GER','Koszyk 1; LK PO wyelim. Motherwell 7-2',1],
  ['crvena-zvezda','Crvena zvezda Belgrad','SRB',34.5,0,6,'O','SRB','Koszyk 2; LM Q2 wyelim. Larne 9-0, przegrał LE PO z Pilznem 4-5 po dogrywce',1],
  ['midtjylland','FC Midtjylland','DEN',34.0,0,5,'P','DEN','Koszyk 2; LK PO wyelim. Rijeka 6-1',1],
  ['gent','KAA Gent','BEL',28.0,0,5,'O','BEL','Koszyk 2; LK PO wyelim. Hibernian 3-2',1],
  ['panathinaikos','Panathinaikos','GRE',28.0,0,6,'P','GRE','Koszyk 2; LK PO wyelim. Hradec Králové 4-3',1],
  ['pafos','Pafos FC','CYP',25.0,0,3,'P','POR','Koszyk 2; kadra głównie portugalsko-brazylijska',1],
  ['brighton','Brighton & Hove Albion','ENG',23.0,0,6,'O','ENG','Koszyk 2; LK PO wyelim. Tromsø 4-0',1],
  ['getafe','Getafe CF','ESP',18.5,0,5,'S','ESP','Koszyk 3; LK PO wyelim. Partizan 4-3',1],
  ['lugano','FC Lugano','SUI',15.5,0,3,'P','SUI','Koszyk 3',1],
  ['twente','FC Twente','NED',15.0,0,5,'O','NED','Koszyk 3; LK Q3 wyelim. Dunajská Streda 9-3',1],
  ['lincoln-red-imps','Lincoln Red Imps','GIB',13.0,0,2,'S','GIB','Koszyk 3; LM Q1 wyelim. Inter Escaldes 4-2',1],
  ['borac','Borac Banja Luka','BIH',12.5,0,3,'P','BIH','Koszyk 3; LK Q3 awans po karnych, LK PO wyelim. Víkingur 6-2',1],
  ['kups','KuPS Kuopio','FIN',12.3,0,3,'P','FIN','Koszyk 3; LM Q1 wyelim. Vardar 4-3 po dogrywce, LK PO wyelim. Shamrock 2-1',1],
  ['brann','SK Brann','NOR',12.0,0,4,'O','NOR','Koszyk 4; LK PO wyelim. PAOK 4-3',1],
  ['sint-truiden','Sint-Truidense VV','BEL',11.4,0,3,'P','BEL','Koszyk 4; przegrał LE PO z Omonią 3-4',1],
  ['kairat','Kairat Ałmaty','KAZ',11.0,0,4,'P','KAZ','Koszyk 4; LM Q1 wyelim. Sutjeska 4-1, Q2 wyelim. Omonię (karne), przegrał LE PO z Anderlechtem 0-6',1],
  ['hearts','Heart of Midlothian','SCO',9.5,0,4,'P','SCO','Koszyk 4; start w LM Q2 (ścieżka ligowa)',1],
  ['trabzonspor','Trabzonspor','TUR',9.2,0,6,'P','TUR','Koszyk 4; przegrał LE PO z Ferencvárosem 0-5',1],
  ['u-craiova','Universitatea Craiova','ROU',9.0,0,4,'P','ROU','Koszyk 4; LM Q1 awans, Q2 przegrana z Lewskim 2-3, LE PO przegrana z Ararat-Armenia 1-2',1],
  ['nordsjaelland','FC Nordsjælland','DEN',8.7,0,4,'O','DEN','Koszyk 5; LK Q3 wyelim. Valur 7-0, LK PO wyelim. St. Gallen 4-2',1],
  ['jablonec','FK Jablonec','CZE',8.6,0,3,'P','CZE','Koszyk 5',1],
  ['aarhus','Aarhus GF','DEN',8.0,0,4,'P','DEN','Koszyk 5; LM Q2 wyelim. Lech Poznań (5-5, karne 4-3), przegrał LE PO z Benficą 2-6',1],
  ['hajduk','Hajduk Split','CRO',8.0,0,6,'P','CRO','Koszyk 5; LK PO wyelim. Raków (2-2 i 3-2 po dogrywce)',1],
  ['riga-fc','Riga FC','LVA',7.5,0,3,'P','LVA','Koszyk 5; LM Q1 przegrana z Ararat-Armenia, LK PO wyelim. KÍ Klaksvík 2-1',1],
  ['inter-escaldes','Inter Club d\'Escaldes','AND',6.0,0,1,'S','ESP','Koszyk 5; LM Q1 przegrana z Lincoln Red Imps, dalej ścieżka mistrzów LK',1],
  ['thun','FC Thun','SUI',6.5,0,3,'P','SUI','Koszyk 6; mistrz Szwajcarii; przegrał LE PO z Lechem 2-9',1],
  ['cska-sofia','CSKA Sofia','BUL',5.5,0,5,'P','BUL','Koszyk 6; przegrał LE PO z OFI 0-5',1],
  ['mjallby','Mjällby AIF','SWE',5.4,0,2,'S','SWE','Koszyk 6; przegrał LE PO z Salzburgiem 0-4',1],
  ['kauno-zalgiris','Kauno Žalgiris','LTU',5.0,0,2,'P','LTU','Koszyk 6; LM Q1 wyelim. Drita 4-3, przegrał LE PO z Beşiktaşem 1-3',1],
  ['iberia-1999','Iberia 1999 Tbilisi','GEO',5.0,0,2,'P','GEO','Koszyk 6; LM Q1 wyelim. Flora Tallinn, później Larne; przegrał LE PO z Jagiellonią 1-6',1],
  ['egnatia','KF Egnatia','ALB',4.0,0,2,'S','ALB','Koszyk 6; LM Q1 awans, przegrał LE PO z Lillestrøm 1-2 po dogrywce',1],
]);

// Kluby, ktore odpadly w eliminacjach 2026/27 (bez fazy ligowej)
add('ELIM', [
  ['rangers','Rangers FC','SCO',45.0,0,7,'P','SCO','LE Q3 przegrana z Jagiellonią 2-3; następnie poza fazą ligową LK',1],
  ['paok','PAOK Saloniki','GRE',40.0,0,6,'P','GRE','LK PO przegrana z Brann 3-4',1],
  ['partizan','Partizan Belgrad','SRB',12.0,0,5,'P','SRB','LK PO przegrana z Getafe 3-4',1],
  ['shamrock','Shamrock Rovers','IRL',13.0,0,3,'P','IRL','LM Q1 wyelim. Floriana, Q2 przegrana z Ararat-Armenia 2-3, LK PO przegrana z KuPS 1-2',1],
  ['ki-klaksvik','KÍ Klaksvík','FRO',11.0,0,2,'P','FRO','LM Q1 awans, LE Q3 przegrana z Lechem 0-6, LK PO przegrana z Riga FC 1-2',1],
  ['sheriff','Sheriff Tyraspol','MDA',10.0,0,4,'P','MDA','LK Q3 przegrana z St. Gallen',1],
  ['rijeka','HNK Rijeka','CRO',9.0,0,4,'P','CRO','LK PO przegrana z Midtjylland 1-6',1],
  ['hradec-kralove','FC Hradec Králové','CZE',9.0,0,3,'P','CZE','LK PO przegrana z Panathinaikosem 3-4',1],
  ['vikingur','Víkingur Reykjavík','ISL',9.0,0,3,'O','ISL','LM Q1 awans, LK PO przegrana z Borac 2-6',1],
  ['rfs','FK RFS','LVA',9.0,0,3,'P','LVA','LK Q3, para z FK Jablonec (Jablonec w fazie ligowej)',0],
  ['austria-wieden','Austria Wiedeń','AUT',8.0,0,4,'P','AUT','LK Q3 wyelim. Beitar (karne), LK PO przegrana z Bragą',1],
  ['tromso','Tromsø IL','NOR',7.9,0,3,'P','NOR','LK PO przegrana z Brighton 0-4',1],
  ['hibernian','Hibernian FC','SCO',7.0,0,4,'P','SCO','LK PO przegrana z Gent 2-3',1],
  ['motherwell','Motherwell FC','SCO',7.0,0,3,'S','SCO','LK PO przegrana z Freiburgiem 2-7',1],
  ['tns','The New Saints','WAL',7.0,0,2,'P','WAL','LM Q1 przegrana z Sabah 1-4',1],
  ['st-gallen','FC St. Gallen','SUI',6.2,0,3,'O','SUI','LK Q3 wyelim. Sheriff, LK PO przegrana z Nordsjælland 2-4',1],
  ['hapoel-tel-awiw','Hapoel Tel Awiw','ISR',6.0,0,4,'P','ISR','LK Q3 wyelim. GKS Katowice 3-2, LK PO przegrana z Atalantą 0-1',1],
  ['hammarby','Hammarby IF','SWE',6.0,0,4,'O','SWE','Eliminacje LE przegrana z Anderlechtem, LK Q3 przegrana z Rakowem',1],
  ['zilina','MŠK Žilina','SVK',6.0,0,3,'O','SVK','LK Q2 przegrana z GKS Katowice',1],
  ['drita','FC Drita','KOS',6.0,0,2,'P','KOS','LM Q1 przegrana z Kauno Žalgiris 3-4',1],
  ['zalgiris-wilno','Żalgiris Wilno','LTU',6.0,0,3,'P','LTU','LK Q3, para z Hajdukiem (Hajduk awansował)',0],
  ['beitar','Beitar Jerozolima','ISR',5.8,0,4,'P','ISR','LK Q3 przegrana z Austrią Wiedeń (karne)',1],
  ['apollon','Apollon Limassol','CYP',5.5,0,3,'P','CYP','LK Q3, para z Brann (Brann awansował)',0],
  ['larne','Larne FC','NIR',5.0,0,2,'P','NIR','LM Q1 awans, LM Q2 przegrana z Crvena zvezda 0-9, potem przegrana z Iberia 1999',1],
  ['flora','FC Flora Tallinn','EST',5.0,0,2,'P','EST','LM Q1 przegrana z Iberia 1999',1],
  ['pjunik','FC Pjunik Erywań','ARM',5.0,0,2,'P','ARM','LK Q3 (para z Debreceni VSC), odpadł',0],
  ['zira','Zirə FK','AZE',5.0,0,2,'P','AZE','LK Q3 (para z Paide), odpadł',0],
  ['debrecen','Debreceni VSC','HUN',4.7,0,3,'P','HUN','LK Q3 (para z Pjunikiem), odpadł',0],
  ['dunajska-streda','DAC Dunajská Streda','SVK',4.5,0,2,'P','SVK','LK Q3 przegrana z Twente 3-9',1],
  ['vaduz','FC Vaduz','LIE',3.0,0,2,'S','SUI','LK Q3 (para z Inter Turku), odpadł',0],
  ['inter-turku','FC Inter Turku','FIN',3.0,0,2,'P','FIN','LK PO przegrana z FC Kopenhaga 1-4',1],
  ['valur','Valur Reykjavík','ISL',3.0,0,2,'O','ISL','LK Q3 przegrana z Nordsjælland 0-7',1],
  ['shkendija','KF Shkëndija','MKD',3.0,0,2,'P','MKD','LK Q3 (para z Hibernian), odpadł',0],
  ['witebsk','FK Witebsk','BLR',3.0,0,2,'P','BLR','LM Q1 przegrana; źródła rozbieżne co do dalszej gry',0],
  ['valletta','Valletta FC','MLT',2.5,0,2,'S','MLT','LK Q2 przegrana z Rakowem 1-7',1],
  ['vardar','FK Vardar','MKD',2.5,0,2,'P','MKD','LM Q1 przegrana z KuPS 3-4 po dogrywce',1],
  ['floriana','Floriana FC','MLT',2.5,0,2,'S','MLT','LM Q1 przegrana z Shamrock Rovers',1],
  ['sutjeska','FK Sutjeska Nikšić','MNE',2.5,0,2,'S','MNE','LM Q1 przegrana z Kairatem 1-4',1],
  ['dniepr-mohylew','Dniepr Mohylew','BLR',2.5,0,1,'S','BLR','LK Q3 (para z Borac wg jednego źródła), odpadł',0],
  ['paide','Paide Linnameeskond','EST',2.0,0,1,'S','EST','LK Q3 (para z Zirə), odpadł',0],
  ['malisheva','KF Malisheva','KOS',2.0,0,1,'S','KOS','LK Q3 (para z Hibernian wg losowania), odpadł',0],
  ['atert-bissen','FC Atert Bissen','LUX',1.5,0,1,'S','LUX','LM Q1 przegrana',1],
]);

// Rezerwa: duze kluby bez pucharow 2026/27 (do losowan kolejnych sezonow)
add('BRAK', [
  ['chelsea','Chelsea','ENG',98.0,0,9,'O','ENG','Brak w pucharach 2026/27 wg list koszyków; klub rezerwowy do przyszłych sezonów',0],
  ['tottenham','Tottenham Hotspur','ENG',72.0,0,8,'O','ENG','Jak wyżej',0],
  ['eintracht','Eintracht Frankfurt','GER',60.0,0,7,'O','GER','Jak wyżej',0],
  ['lazio','Lazio','ITA',50.0,0,7,'P','ITA','Jak wyżej',0],
  ['fiorentina','Fiorentina','ITA',45.0,0,7,'P','ITA','Jak wyżej',0],
  ['athletic','Athletic Bilbao','ESP',35.0,0,7,'P','ESP','Jak wyżej',0],
  ['newcastle','Newcastle United','ENG',35.0,0,7,'P','ENG','Jak wyżej',0],
  ['nice','OGC Nice','FRA',28.0,0,6,'P','FRA','Jak wyżej',0],
]);

const kluby = K.map(({ r, rozgr }) => {
  const [id, nazwa, kraj, c, cPew, prestiz, trener, narod, uwagi, udzial] = r;
  if (!(kraj in C_OF)) throw new Error('Brak kraju ' + kraj + ' dla ' + id);
  const L = computeL(c, kraj);
  return {
    id, nazwa, kraj, wspolczynnik: c, rankingUEFA: rankOf(c), L, tier: tierOf(L), prestiz, trener,
    narodowosc: narod, rozgrywki2026: rozgr, droga2026: uwagi,
    pewnosc: cPew ? 'pewne' : 'szacunek',
    pewnoscUdzialu: udzial ? 'pewne' : 'szacunek',
  };
});
// unikalnosc id
const ids = new Set();
kluby.forEach(k => { if (ids.has(k.id)) throw new Error('dup ' + k.id); ids.add(k.id); });

// ---------- Polskie kluby ----------
const PL = [
  { id:'lech', nazwa:'Lech Poznań', miejsce2025_26:1, tytul:'Mistrz Polski 2025/26', wspolczynnik:31.0,
    start:'LM Q2 (ścieżka mistrzów)',
    przebieg:['LM Q2: Aarhus GF 4-1 (wyjazd), 1-4 po dogrywce (dom), karne 3-4; odpadł',
              'LE Q3: KÍ Klaksvík 1-0, 5-0; awans','LE PO: FC Thun 7-0, łącznie 9-2; awans',
              'LE faza ligowa (koszyk 3): Crystal Palace, Leverkusen, Sunderland, Benfica, Union SG, Ferencváros, Torreense, OFI'],
    wynik:'Faza ligowa LE', stanNov2026:'Po 4 kolejkach 3 porażki (m.in. 1-3 z Benficą 5 listopada), dolne rejony tabeli', pewnosc:'pewne (wynik dwumeczów), szacunek (współczynnik)' },
  { id:'gornik-zabrze', nazwa:'Górnik Zabrze', miejsce2025_26:2, tytul:'Wicemistrz Polski i zdobywca Pucharu Polski 2025/26', wspolczynnik:9.0,
    start:'LM Q2 (ścieżka ligowa)',
    przebieg:['LM Q2: Fenerbahçe 0-1 (wyjazd), rewanż przegrany; odpadł','LE Q3: Ferencváros 0-1 i odpadł',
              'LK PO: AS Monaco 2-3 (dom), 1-4 (wyjazd); odpadł'],
    wynik:'Odpadł w LK PO', stanNov2026:'Poza pucharami', pewnosc:'pewne (przebieg), szacunek (wynik rewanżu z Fenerbahçe nieznany)' },
  { id:'jagiellonia', nazwa:'Jagiellonia Białystok', miejsce2025_26:3, tytul:'3. miejsce 2025/26 (miejsce pucharowe po PP Górnika)', wspolczynnik:28.0,
    start:'LE Q3 (brak śladu meczów w Q2; szacunek)',
    przebieg:['LE Q3: Rangers 2-1 (dom), 1-1 (Ibrox); awans 3-2','LE PO: Iberia 1999 Tbilisi, łącznie 6-1; awans',
              'LE faza ligowa (koszyk 3): Olympiakos, Ararat-Armenia, Anderlecht, Lewski, Sunderland, Crystal Palace, Lyon, Viktoria Pilzno'],
    wynik:'Faza ligowa LE', stanNov2026:'3 pkt po 3 kolejkach; wynik z Lewskim (5 listopada) niepotwierdzony', pewnosc:'pewne (awans), szacunek (runda startowa, współczynnik)' },
  { id:'rakow', nazwa:'Raków Częstochowa', miejsce2025_26:4, tytul:'4. miejsce 2025/26', wspolczynnik:22.0,
    start:'LK Q2',
    przebieg:['LK Q2: Valletta FC 3-1, 4-0; awans','LK Q3: Hammarby IF 0-0 (dom), rewanż wygrany; awans',
              'LK PO: Hajduk Split 2-2 (wyjazd), 2-3 po dogrywce (dom); odpadł'],
    wynik:'Odpadł w LK PO', stanNov2026:'Poza pucharami', pewnosc:'pewne' },
  { id:'gks-katowice', nazwa:'GKS Katowice', miejsce2025_26:5, tytul:'5. miejsce 2025/26', wspolczynnik:9.0,
    start:'LK Q2',
    przebieg:['LK Q2: MŠK Žilina; awans po odrobieniu strat','LK Q3: Hapoel Tel Awiw 0-2 (wyjazd), 2-1 (dom); odpadł'],
    wynik:'Odpadł w LK Q3', stanNov2026:'Poza pucharami', pewnosc:'pewne (przebieg), szacunek (część wyników)' },
];
const polskie = PL.map(p => ({ ...p, Lwzor: computeL(p.wspolczynnik, 'POL'),
  uwagaL: 'W grze używaj wartości L z krajowej kalibracji Ekstraklasy; Lwzor służy tylko do porównania z klubami zagranicznymi.' }));

const WZOR = 'Lc = 1.555 + 2.974*ln(c + 10), gdzie c to współczynnik klubowy UEFA. ' +
  'Lb(C) = siła klubu z górnej połowy ligi krajowej: interpolacja liniowa w ln(C) przez punkty (C=3: 7.5), (10: 9.3), (35: 12.0), (115: 14.5), gdzie C to współczynnik krajowy UEFA 2025. ' +
  'Jeżeli Lb > Lc: L = Lc + 0.85*(Lb - Lc) (mocna liga podnosi klub o niskim współczynniku). ' +
  'W przeciwnym razie: L = Lc - 0.6*max(0, 1 - C/36)*(Lc - Lb) (słaba liga obniża współczynnik zawyżony wygranymi z rywalami z małych lig). ' +
  'Wynik obcięty do [7.5, 16.8] i zaokrąglony do 0.1. Tiery: A >= 15.5, B 14.0-15.4, C 12.0-13.9, D 10.0-11.9, E < 10.0.';

const ZRODLA = [
  'https://rsssf.org/tablesp/pol2026.html',
  'https://www.eska.pl/news/sport/ekstraklasa-przed-nowym-sezonem-kto-obroni-miejsce-na-podium-aa-8jYt-ZJVJ-UKZv.html',
  'https://wiki.krisyotam.com/content/wikipedia_en_all_nopic_2026-03/2025%E2%80%9326_in_Polish_football',
  'https://en.wikipedia.org/wiki/2025%E2%80%9326_Polish_Cup',
  'https://www.flashscore.pl/wiadomosci/pi-ka-nozna-pko-bp-ekstraklasa-gornik-zagra-o-lige-mistrzow-legia-wypchnieta-poza-puchary-w-ostatniej-chwili/G42dLxMk/',
  'https://www.eska.pl/news/sport/liga-mistrzow-lech-poznan-odpada-po-dramacie-z-aarhus-aa-SAbH-rVg7-AMqk.html',
  'https://www.latribuna.hn/2026/08/14/lech-poznan-y-luis-palma-se-acercan-a-los-europa-league/',
  'https://www.flashscore.pl/wiadomosci/pi-ka-nozna-liga-europy-lech-poznan-w-lidze-europy-mecze-przeciwnicy-i-transmisje-w-polsce/z7ldPjzS/',
  'https://www.tvp.info/96326779/benfica-lizbona-lech-poznan-31-liga-europy-mistrzowie-polski-znow-przegrali-w-lidze-europy',
  'https://prod.beinsports.com/en-us/soccer/uefa-europa-league/articles/rangers-1-1-jagiellonia-bialystok-2-3-agg-prelec-dumps-mcinnes-side-out-of-europa-league-2026-08-13',
  'https://www.flashscore.pl/wiadomosci/pi-ka-nozna-liga-europy-jagiellonia-bia-ystok-w-lidze-europy-mecze-przeciwnicy-i-transmisje-w-polsce/QN3vZHAM/',
  'https://www.flashscore.pl/wiadomosci/gornik-poleg-na-lazurowym-wybrzezu-z-monaco-druzyna-z-zabrza-nie-zagra-w-lidze-konferencji/jJtw4W4U/',
  'https://www.sportsmole.co.uk/football/as-monaco-vs-gornik-zabrze_game_255833.html',
  'https://www.11v11.com/matches/rakow-czestochowa-v-hajduk-split-27-august-2026-394414/',
  'https://www.tvp.info/94613946/eliminacje-ligi-konferencji-rakow-czestochowa-zwycieza-z-valletta-fc',
  'https://polskieradio.pl/395/7790/Artykul/3714792,football-polish-clubs-rakow-gks-reach-3rd-round-of-conference-league-qualifying',
  'https://polskieradio.pl/395/7790/Artykul/3717393,football-polish-clubs-post-mixed-results-in-european-qualifiers',
  'https://www.11v11.com/matches/gks-katowice-v-hapoel-tel-aviv-12-august-2026-394258/',
  'https://en.atalanta.it/news/2026-27-uecl-play-offs-atalanta-drawn-against-hapoel-tel-aviv-fc-or-gks-katowice',
  'https://uefa.com/uefachampionsleague/news/02a8-21717d0c6cb5-03a9a5ff1552-1000--champions-league-league-phase-draw-pots-confirmed',
  'https://gulfnews.com/sport/football/champions-league-draw-202627-uae-time-pots-new-rules-and-key-details-1.500653950',
  'https://www.si.com/soccer/2026-27-champions-league-projected-pots-man-utd-guaranteed-tough-draw',
  'https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Champions_League_league_phase',
  'https://zamin.uz/en/sport/219324-fenerbahce-aek-and-viking-in-the-champions-league-league-phase.html',
  'https://www.uefa.com/uefaeuropaleague/news/02a8-21736c090a44-d0fdd9f91599-1000--europa-league-league-phase-draw-pots-confirmed/',
  'https://fr.uefa.com/uefaeuropaleague/news/02a8-21736cc7a838-289d28316e33-1000--ligue-europa-composition-des-chapeaux-pour-le-tirage-de-la/',
  'https://www.uefa.com/uefaeuropaleague/news/02a6-20e5db0029dd-8241a8d00925-1000--europa-league-qualifying-fixtures-results-dates-how-it-works/',
  'https://www.uefa.com/uefaconferenceleague/news/02a8-21737b647a3a-5340384ad5f6-1000--conference-league-league-phase-draw-pots-confirmed/',
  'https://editorial.uefa.com/resources/02a8-21772ccfd641-9f5eb41bf586-1000/uefa_-_conference_league_-_2026-27_-_league_phase_draw_results_-_calendar_by_pot.pdf',
  'https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Conference_League_qualifying_(third_and_play-off_round_matches)',
  'https://www.sportsmole.co.uk/football/europa-conference-league/results.html',
  'https://fbref.com/en/comps/8/qual/Champions-League-Qualifying-Rounds',
  'https://terrikon.com/en/posts/577278',
  'https://www.uefa.com/uefachampionsleague/news/02a6-20e5a8be4e63-ae971c582f8c-1000--champions-league-qualifying-results-how-it-worked/',
  'https://www.meczyki.pl/newsy/pilka-nozna/losowanie-3-rundy-el-lk-gdzie-ogladac-na-kogo-trafia-rakow-i-gks-transmisja-online-i-na-zywo-20-07-2026/308256',
  'https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Europa_League',
  'https://www.sofascore.com/football/rankings/uefa',
  'https://euroranking.net/en/association-coefficient/',
  'https://www.meczyki.pl/newsy/pilka-nozna/swietna-sytuacja-polski-w-rankingu-uefa-scenariusz-marzen-coraz-bardziej-realny/308316',
];

const kraje = KRAJE.map(([kod, nazwa, pozycja, wsp, pew, biez, pozB]) => ({
  kod, nazwa, pozycja, wspolczynnik: wsp, pewnosc: pew ? 'pewne' : 'szacunek',
  biezacyNov2026: biez, pozycjaBiezacaNov2026: pozB,
  Lliga: kod === 'RUS' ? null : Math.round(Lb(wsp) * 10) / 10,
  ...(kod === 'RUS' ? { uwagi: 'Zawieszona od 2022 r.; nie uczestniczy w rozgrywkach; pomiń przy losowaniu.' } : {}),
}));

const out = {
  meta: {
    sezon: '2026/27',
    dataOpracowania: 'Nov 10, 2026',
    opis: 'Prawdziwe nazwy klubów, bez herbów i zawodników. L w skali 1-20. rozgrywki2026: LM, LE, LK (faza ligowa), ELIM (odpadł w eliminacjach), BRAK (rezerwa do przyszłych sezonów).',
    zrodla: ZRODLA,
    wzorL: WZOR,
    kalibracja: 'Polska 1 Liga L=10.0; Ekstraklasa średnio 11.5 (Lech, Legia 12.6; najsłabsi 10.9); elita UEFA 16.2-16.6.',
    rankingKrajow: 'wspolczynnik = ranking 2025 (sezony 2020/21-2024/25), podstawa przydziału miejsc w 2026/27; biezacyNov2026 = migawka Sofascore z listopada 2026 (sezony 2022/23-2026/27, w trakcie sezonu).',
    pewnosc: 'Pole pewnosc dotyczy wartości współczynnika klubowego; pewnoscUdzialu dotyczy faktu udziału i drogi w pucharach 2026/27. rankingUEFA jest zawsze szacunkiem (interpolacja z punktów).',
  },
  kraje,
  kluby,
  polskieKlubyUEFA2026: polskie,
  mistrz2025_26: 'Lech Poznań',
  wicemistrz2025_26: 'Górnik Zabrze',
  pucharPolski2025_26: 'Górnik Zabrze',
  finalPucharuPolski2025_26: 'Górnik Zabrze pokonał Raków Częstochowa (PGE Narodowy, May 2, 2026; data wg jednego źródła)',
  superpuchar2026: 'Lech Poznań (mistrz) vs Górnik Zabrze (zdobywca PP), lipiec 2026',
  tabelaEkstraklasy2025_26_top5: [
    { poz:1, klub:'Lech Poznań', pkt:60 }, { poz:2, klub:'Górnik Zabrze', pkt:56 },
    { poz:3, klub:'Jagiellonia Białystok', pkt:56 }, { poz:4, klub:'Raków Częstochowa', pkt:55 },
    { poz:5, klub:'GKS Katowice', pkt:50 },
  ],
};

fs.writeFileSync(path.join(OUT, 'kluby_uefa.json'), JSON.stringify(out, null, 2), 'utf8');

// statystyki do raportu
const cnt = {}; const tiers = {};
kluby.forEach(k => { cnt[k.rozgrywki2026] = (cnt[k.rozgrywki2026] || 0) + 1; tiers[k.tier] = (tiers[k.tier] || 0) + 1; });
console.log('kluby', kluby.length, cnt, tiers);
const med = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
for (const r of ['LM', 'LE', 'LK', 'ELIM']) {
  const Ls = kluby.filter(k => k.rozgrywki2026 === r).map(k => k.L);
  console.log(r, 'mediana L', med(Ls), 'min', Math.min(...Ls), 'max', Math.max(...Ls));
}
console.log('PL', polskie.map(p => p.nazwa + ' ' + p.Lwzor).join('; '));
fs.writeFileSync(path.join(OUT, 'gen', 'kluby_sorted.json'), JSON.stringify([...kluby].sort((a, b) => b.L - a.L || b.wspolczynnik - a.wspolczynnik), null, 1));
