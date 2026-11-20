// Prawdziwe kluby zagraniczne średniego i niższego poziomu (uzupełnienie kluby_uefa.json, które ma tylko czołówkę
// Europy): nazwy klubu kupującego zawodnika sprzedanego za granicę (src/career/foreignMarket.js) i klubu zawodnika
// z puli obcokrajowców i skautingu (src/career/foreignPool.js).
// UWAGA: nazwy pochodzą z ogólnej wiedzy, nie z zweryfikowanego źródła. Siła L (skala jak w kluby_uefa.json,
// Ekstraklasa średnio ok. 11,5, podstawowy skład ok. 11) i prestiż 1-10 to szacunki [SZAC], ułożone względem
// polskich lig: nie zawyżamy słabych lig (Nigeria 8-9,5, Litwa 9-10). Brak herbów i zawodników.
// Format wpisu: [id, nazwa, L, prestiż]. Id z prefiksem „sw-”, żeby nie kolidowały z kluby_uefa.json.

const RAW = {
  // ---- Ligi kupców (kluby_uefa.json ma tylko ich czołówkę)
  ENG: [
    ['everton', 'Everton', 13.6, 7], ['fulham', 'Fulham', 13.8, 6], ['brentford', 'Brentford', 13.9, 6], ['wolves', 'Wolverhampton Wanderers', 13.1, 6],
    ['west-ham', 'West Ham United', 13.7, 7], ['nottm-forest', 'Nottingham Forest', 13.9, 6], ['leeds', 'Leeds United', 13.6, 7], ['burnley', 'Burnley FC', 13.0, 5],
    ['leicester', 'Leicester City', 12.8, 6], ['southampton', 'Southampton FC', 12.7, 6], ['ipswich', 'Ipswich Town', 12.6, 5], ['norwich', 'Norwich City', 12.5, 5],
    ['west-brom', 'West Bromwich Albion', 12.4, 5], ['middlesbrough', 'Middlesbrough FC', 12.5, 5], ['sheffield-utd', 'Sheffield United', 12.4, 5], ['coventry', 'Coventry City', 12.6, 5],
    ['watford', 'Watford FC', 12.2, 5], ['stoke', 'Stoke City', 12.3, 5], ['swansea', 'Swansea City', 12.0, 4], ['bristol-city', 'Bristol City', 12.0, 4],
    ['hull', 'Hull City', 12.0, 4], ['preston', 'Preston North End', 11.9, 4], ['millwall', 'Millwall FC', 12.0, 4], ['blackburn', 'Blackburn Rovers', 12.0, 5],
    ['qpr', 'Queens Park Rangers', 11.8, 4], ['derby', 'Derby County', 11.8, 5], ['wrexham', 'Wrexham AFC', 12.0, 4], ['birmingham', 'Birmingham City', 12.3, 5],
    ['portsmouth', 'Portsmouth FC', 11.8, 4], ['charlton', 'Charlton Athletic', 11.8, 4], ['oxford-utd', 'Oxford United', 11.8, 3], ['bolton', 'Bolton Wanderers', 11.3, 4],
    ['huddersfield', 'Huddersfield Town', 11.2, 3], ['reading', 'Reading FC', 11.2, 3],
  ],
  ITA: [
    ['torino', 'Torino FC', 13.4, 6], ['bologna', 'Bologna FC', 13.9, 7], ['udinese', 'Udinese Calcio', 13.0, 5], ['genoa', 'Genoa CFC', 12.9, 6],
    ['cagliari', 'Cagliari Calcio', 12.6, 5], ['parma', 'Parma Calcio', 12.7, 5], ['lecce', 'US Lecce', 12.4, 4], ['verona', 'Hellas Werona', 12.3, 5],
    ['sassuolo', 'US Sassuolo', 12.7, 5], ['cremonese', 'US Cremonese', 12.2, 4], ['pisa', 'Pisa SC', 12.2, 4], ['palermo', 'Palermo FC', 12.4, 5],
    ['sampdoria', 'UC Sampdoria', 12.0, 5], ['venezia', 'Venezia FC', 12.2, 4], ['bari', 'SSC Bari', 11.8, 4], ['spezia', 'Spezia Calcio', 11.6, 3],
    ['cesena', 'Cesena FC', 11.6, 3], ['modena', 'Modena FC', 11.5, 3], ['frosinone', 'Frosinone Calcio', 11.6, 3], ['empoli', 'Empoli FC', 12.0, 4],
    ['monza', 'AC Monza', 12.2, 4], ['catanzaro', 'US Catanzaro', 11.5, 3],
  ],
  ESP: [
    ['valencia', 'Valencia CF', 13.9, 7], ['sevilla', 'Sevilla FC', 14.0, 8], ['osasuna', 'CA Osasuna', 13.2, 5], ['mallorca', 'RCD Mallorca', 13.0, 5],
    ['girona', 'Girona FC', 13.4, 5], ['rayo', 'Rayo Vallecano', 13.1, 5], ['alaves', 'Deportivo Alavés', 12.9, 4], ['espanyol', 'RCD Espanyol', 12.9, 5],
    ['levante', 'Levante UD', 12.6, 4], ['elche', 'Elche CF', 12.5, 4], ['las-palmas', 'UD Las Palmas', 12.5, 4], ['real-oviedo', 'Real Oviedo', 12.3, 4],
    ['valladolid', 'Real Valladolid', 12.2, 4], ['leganes', 'CD Leganés', 12.2, 3], ['sporting-gijon', 'Sporting Gijón', 12.0, 4], ['racing-santander', 'Racing Santander', 11.9, 4],
    ['zaragoza', 'Real Saragossa', 11.8, 4], ['granada', 'Granada CF', 12.0, 4], ['almeria', 'UD Almería', 12.0, 3], ['malaga', 'Málaga CF', 11.9, 4],
    ['deportivo', 'Deportivo La Coruña', 11.8, 4], ['cadiz', 'Cádiz CF', 11.9, 3],
  ],
  GER: [
    ['werder', 'Werder Brema', 13.4, 7], ['wolfsburg', 'VfL Wolfsburg', 13.3, 6], ['gladbach', 'Borussia Mönchengladbach', 13.3, 7], ['mainz', 'FSV Mainz 05', 13.1, 5],
    ['augsburg', 'FC Augsburg', 12.9, 5], ['union-berlin', 'Union Berlin', 13.2, 5], ['heidenheim', '1. FC Heidenheim', 12.8, 4], ['st-pauli', 'FC St. Pauli', 12.9, 6],
    ['koln', '1. FC Köln', 13.0, 6], ['hsv', 'Hamburger SV', 13.0, 7], ['schalke', 'FC Schalke 04', 12.6, 7], ['hertha', 'Hertha BSC', 12.4, 6],
    ['hannover', 'Hannover 96', 12.2, 5], ['nurnberg', '1. FC Nürnberg', 12.0, 5], ['dusseldorf', 'Fortuna Düsseldorf', 12.2, 5], ['karlsruhe', 'Karlsruher SC', 12.0, 4],
    ['kaiserslautern', '1. FC Kaiserslautern', 12.0, 5], ['paderborn', 'SC Paderborn 07', 12.0, 4], ['magdeburg', '1. FC Magdeburg', 11.8, 4], ['elversberg', 'SV Elversberg', 12.0, 3],
    ['bochum', 'VfL Bochum', 12.2, 4], ['holstein-kiel', 'Holstein Kiel', 11.8, 3],
  ],
  FRA: [
    ['toulouse', 'Toulouse FC', 13.0, 5], ['strasbourg', 'RC Strasbourg', 13.2, 5], ['nantes', 'FC Nantes', 12.8, 5], ['brest', 'Stade Brestois', 12.9, 4],
    ['angers', 'Angers SCO', 12.4, 4], ['auxerre', 'AJ Auxerre', 12.4, 4], ['lorient', 'FC Lorient', 12.5, 4], ['le-havre', 'Le Havre AC', 12.3, 4],
    ['metz', 'FC Metz', 12.4, 4], ['paris-fc', 'Paris FC', 12.4, 4], ['reims', 'Stade de Reims', 12.6, 5], ['montpellier', 'Montpellier HSC', 12.2, 4],
    ['saint-etienne', 'AS Saint-Étienne', 12.2, 6], ['lorient-b', 'Stade Lavallois', 11.5, 3], ['bordeaux', 'Girondins Bordeaux', 11.8, 6], ['guingamp', 'EA Guingamp', 11.6, 3],
    ['rodez', 'Rodez AF', 11.3, 2], ['troyes', 'ES Troyes', 11.6, 3],
  ],
  NED: [
    ['utrecht', 'FC Utrecht', 13.1, 5], ['sparta-rotterdam', 'Sparta Rotterdam', 12.8, 5], ['heerenveen', 'SC Heerenveen', 12.6, 5], ['go-ahead', 'Go Ahead Eagles', 12.6, 4],
    ['fortuna-sittard', 'Fortuna Sittard', 12.1, 3], ['groningen', 'FC Groningen', 12.3, 4], ['pec-zwolle', 'PEC Zwolle', 12.0, 3], ['heracles', 'Heracles Almelo', 12.0, 3],
    ['nac-breda', 'NAC Breda', 12.2, 4], ['willem-ii', 'Willem II', 11.9, 4], ['rkc', 'RKC Waalwijk', 11.6, 3], ['excelsior', 'Excelsior Rotterdam', 11.8, 3],
    ['telstar', 'Telstar', 11.4, 2], ['fc-volendam', 'FC Volendam', 11.6, 3], ['almere', 'Almere City', 11.4, 2],
  ],
  POR: [
    ['vitoria-guimaraes', 'Vitória Guimarães', 13.0, 6], ['famalicao', 'FC Famalicão', 12.7, 4], ['casa-pia', 'Casa Pia AC', 12.2, 3], ['estoril', 'GD Estoril Praia', 12.4, 4],
    ['rio-ave', 'Rio Ave FC', 12.2, 4], ['arouca', 'FC Arouca', 12.0, 3], ['gil-vicente', 'Gil Vicente FC', 12.3, 4], ['moreirense', 'Moreirense FC', 12.1, 3],
    ['boavista', 'Boavista FC', 12.0, 5], ['nacional', 'CD Nacional', 12.0, 4], ['santa-clara', 'CD Santa Clara', 12.0, 3], ['farense', 'SC Farense', 11.8, 3],
    ['maritimo', 'CS Marítimo', 11.8, 4], ['vizela', 'FC Vizela', 11.4, 2], ['tondela', 'CD Tondela', 11.6, 3], ['alverca', 'FC Alverca', 11.6, 2],
  ],
  BEL: [
    ['genk', 'KRC Genk', 13.2, 6], ['standard', 'Standard Liège', 12.7, 7], ['antwerp', 'Royal Antwerp', 13.0, 6], ['cercle-brugge', 'Cercle Brugge', 12.4, 4],
    ['kv-mechelen', 'KV Mechelen', 12.4, 4], ['westerlo', 'KVC Westerlo', 12.2, 3], ['charleroi', 'Sporting Charleroi', 12.4, 4], ['zulte-waregem', 'Zulte Waregem', 11.8, 3],
    ['oh-leuven', 'OH Leuven', 12.0, 3], ['kv-kortrijk', 'KV Kortrijk', 11.8, 3], ['la-louviere', 'RAAL La Louvière', 11.6, 2], ['beerschot', 'Beerschot', 11.6, 3],
    ['lommel', 'Lommel SK', 11.2, 2], ['lokeren', 'Lierse Kempenzonen', 11.0, 2],
  ],
  CZE: [
    ['plzen-b', 'Slovan Liberec', 12.2, 4], ['banik-ostrava', 'Baník Ostrawa', 12.2, 5], ['mlada-boleslav', 'FK Mladá Boleslav', 12.0, 4], ['sigma-olomouc', 'Sigma Ołomuniec', 12.0, 4],
    ['teplice', 'FK Teplice', 11.8, 3], ['dukla-praga', 'Dukla Praga', 11.6, 3], ['karvina', 'MFK Karviná', 11.6, 3], ['slovacko', '1. FC Slovácko', 11.8, 3],
    ['bohemians', 'Bohemians 1905', 11.6, 3], ['zlin', 'FC Fastav Zlín', 11.4, 3], ['pardubice', 'FK Pardubice', 11.4, 3], ['ceske-budejovice', 'Dynamo Czeskie Budziejowice', 11.4, 3],
  ],
  TUR: [
    ['basaksehir', 'İstanbul Başakşehir', 12.3, 5], ['konyaspor', 'Konyaspor', 11.8, 4], ['alanyaspor', 'Alanyaspor', 11.9, 4], ['samsunspor', 'Samsunspor', 12.2, 5],
    ['kasimpasa', 'Kasımpaşa', 11.8, 4], ['antalyaspor', 'Antalyaspor', 11.7, 4], ['kayserispor', 'Kayserispor', 11.8, 4], ['goztepe', 'Göztepe', 12.0, 4],
    ['gaziantep', 'Gaziantep FK', 11.6, 3], ['rizespor', 'Çaykur Rizespor', 11.6, 4], ['eyupspor', 'Eyüpspor', 11.6, 3], ['genclerbirligi', 'Gençlerbirliği', 11.5, 4],
    ['sivasspor', 'Sivasspor', 11.6, 4], ['bodrum', 'Bodrum FK', 11.2, 2], ['hatayspor', 'Hatayspor', 11.2, 3], ['kocaelispor', 'Kocaelispor', 11.5, 3],
  ],
  NOR: [
    ['molde', 'Molde FK', 12.3, 6], ['rosenborg', 'Rosenborg BK', 12.2, 7], ['valerenga', 'Vålerenga IF', 11.9, 5], ['sarpsborg', 'Sarpsborg 08', 11.6, 4],
    ['kristiansund', 'Kristiansund BK', 11.2, 3], ['fredrikstad', 'Fredrikstad FK', 11.6, 4], ['sandefjord', 'Sandefjord Fotball', 11.2, 3], ['hamkam', 'HamKam', 11.3, 3],
    ['odd', 'Odds BK', 11.3, 4], ['stromsgodset', 'Strømsgodset IF', 11.4, 4], ['aalesund', 'Aalesunds FK', 11.2, 3], ['haugesund', 'FK Haugesund', 11.3, 3],
  ],
  GRE: [
    ['aris-saloniki', 'Aris Saloniki', 12.0, 5], ['volos', 'Volos NFC', 11.4, 3], ['asteras-tripolis', 'Asteras Tripolis', 11.6, 3], ['atromitos', 'Atromitos Ateny', 11.5, 3],
    ['lamia', 'PAS Lamia', 11.2, 2], ['levadiakos', 'Levadiakos', 11.2, 2], ['panetolikos', 'Panetolikos', 11.3, 3], ['panserraikos', 'Panserraikos', 11.2, 2],
    ['ae-larisa', 'AE Larisa', 11.2, 3], ['iraklis', 'Iraklis Saloniki', 10.8, 3], ['apo-kifisia', 'AE Kifisia', 11.2, 2],
  ],
  AUT: [
    ['rapid-wieden', 'Rapid Wiedeń', 12.4, 7], ['wolfsberger', 'Wolfsberger AC', 12.0, 4], ['wac-b', 'Hartberg', 11.6, 3], ['ried', 'SV Ried', 11.4, 3],
    ['altach', 'SCR Altach', 11.4, 3], ['blau-weiss-linz', 'Blau-Weiß Linz', 11.3, 2], ['gak', 'Grazer AK', 11.6, 4], ['wsg-tirol', 'WSG Tirol', 11.3, 3],
    ['austria-klagenfurt', 'Austria Klagenfurt', 11.3, 3], ['lustenau', 'SC Austria Lustenau', 11.0, 2], ['sk-sturm-b', 'FC Admira Wacker', 10.8, 3],
  ],
  SCO: [
    ['aberdeen', 'Aberdeen FC', 11.8, 6], ['dundee-utd', 'Dundee United', 11.6, 5], ['st-mirren', 'St Mirren', 11.5, 4], ['kilmarnock', 'Kilmarnock FC', 11.4, 4],
    ['dundee', 'Dundee FC', 11.5, 4], ['livingston', 'Livingston FC', 11.2, 3], ['st-johnstone', 'St Johnstone', 11.2, 4], ['ross-county', 'Ross County', 11.1, 3],
    ['falkirk', 'Falkirk FC', 11.0, 3], ['partick', 'Partick Thistle', 10.8, 3], ['raith', 'Raith Rovers', 10.6, 2],
  ],
  DEN: [
    ['brondby', 'Brøndby IF', 12.3, 7], ['agf-b', 'Silkeborg IF', 11.6, 4], ['randers', 'Randers FC', 11.6, 4], ['viborg', 'Viborg FF', 11.6, 4],
    ['odense', 'Odense Boldklub', 11.6, 5], ['sonderjyske', 'SønderjyskE', 11.3, 3], ['vejle', 'Vejle Boldklub', 11.3, 3], ['aab', 'AaB Aalborg', 11.5, 5],
    ['lyngby', 'Lyngby BK', 11.0, 3], ['hobro', 'Hvidovre IF', 11.0, 3], ['fredericia', 'FC Fredericia', 11.0, 2],
  ],
  SUI: [
    ['young-boys', 'BSC Young Boys', 12.4, 7], ['basel', 'FC Basel', 12.3, 7], ['servette', 'Servette FC', 11.6, 5], ['zurich', 'FC Zürich', 11.6, 5],
    ['lausanne', 'FC Lausanne-Sport', 11.5, 4], ['sion', 'FC Sion', 11.4, 5], ['luzern', 'FC Luzern', 11.4, 5], ['winterthur', 'FC Winterthur', 11.0, 3],
    ['grasshoppers', 'Grasshopper Club Zürich', 11.3, 5], ['yverdon', 'Yverdon-Sport', 10.8, 2], ['aarau', 'FC Aarau', 10.8, 3],
  ],
  ISR: [
    ['maccabi-tel-aviv', 'Maccabi Tel Awiw', 11.9, 7], ['maccabi-haifa', 'Maccabi Hajfa', 11.7, 6], ['hapoel-haifa', 'Hapoel Hajfa', 11.0, 3], ['bnei-sakhnin', 'Bnei Sachnin', 10.8, 3],
    ['maccabi-netanya', 'Maccabi Netanja', 10.9, 3], ['hapoel-jerusalem', 'Hapoel Jerozolima', 10.6, 3], ['ashdod', 'FC Aszdod', 10.8, 3], ['hapoel-hadera', 'Hapoel Hadera', 10.5, 2],
  ],
  CYP: [
    ['aek-larnaca', 'AEK Larnaka', 11.5, 5], ['aris-limassol', 'Aris Limassol', 11.3, 4], ['apoel', 'APOEL Nikozja', 11.8, 6], ['anorthosis', 'Anorthosis Famagusta', 11.4, 5],
    ['ael-limassol', 'AEL Limassol', 11.0, 4], ['nea-salamina', 'Nea Salamis', 10.4, 3], ['enosis-paralimni', 'Enosis Paralimni', 10.3, 2], ['doxa-katokopias', 'Doxa Katokopia', 10.2, 2],
  ],
  SWE: [
    ['malmo', 'Malmö FF', 12.2, 7], ['aik', 'AIK Sztokholm', 11.6, 6], ['djurgarden', 'Djurgårdens IF', 11.8, 6], ['goteborg', 'IFK Göteborg', 11.5, 6],
    ['elfsborg', 'IF Elfsborg', 11.7, 5], ['hacken', 'BK Häcken', 11.8, 5], ['norrkoping', 'IFK Norrköping', 11.3, 4], ['sirius', 'IK Sirius', 11.3, 4],
    ['kalmar', 'Kalmar FF', 11.0, 3], ['halmstad', 'Halmstads BK', 10.8, 3], ['degerfors', 'Degerfors IF', 10.6, 2], ['vasteras', 'Västerås SK', 10.7, 2],
    ['brommapojkarna', 'IF Brommapojkarna', 10.9, 3], ['varbergs', 'Varbergs BoIS', 10.5, 2],
  ],
  KSA: [
    ['al-hilal', 'Al-Hilal', 13.0, 8], ['al-nassr', 'Al-Nassr', 12.9, 8], ['al-ittihad', 'Al-Ittihad', 12.6, 8], ['al-ahli-saudi', 'Al-Ahli Dżudda', 12.6, 7],
    ['al-shabab', 'Al-Shabab Rijad', 11.8, 5], ['al-ettifaq', 'Al-Ettifaq', 11.8, 5], ['al-fateh', 'Al-Fateh', 11.2, 3], ['al-taawoun', 'Al-Taawoun', 11.3, 4],
    ['al-fayha', 'Al-Fayha', 11.2, 3], ['al-raed', 'Al-Raed', 11.0, 3], ['damac', 'Damac FC', 11.0, 3], ['al-khaleej', 'Al-Khaleej', 11.0, 3],
    ['al-okhdood', 'Al-Okhdood', 10.8, 2], ['al-riyadh', 'Al-Riyadh SC', 10.8, 2], ['al-kholood', 'Al-Kholood', 10.8, 2], ['al-qadsiah', 'Al-Qadsiah', 12.0, 5],
  ],
  USA: [
    ['inter-miami', 'Inter Miami', 12.6, 8], ['lafc', 'Los Angeles FC', 12.5, 7], ['la-galaxy', 'LA Galaxy', 12.0, 7], ['seattle-sounders', 'Seattle Sounders', 12.2, 6],
    ['atlanta-united', 'Atlanta United', 11.8, 6], ['columbus-crew', 'Columbus Crew', 12.0, 5], ['nycfc', 'New York City FC', 11.8, 6], ['red-bulls-ny', 'New York Red Bulls', 11.6, 5],
    ['philadelphia-union', 'Philadelphia Union', 11.8, 5], ['fc-cincinnati', 'FC Cincinnati', 12.0, 5], ['portland-timbers', 'Portland Timbers', 11.5, 5], ['orlando-city', 'Orlando City', 11.6, 5],
    ['nashville-sc', 'Nashville SC', 11.5, 4], ['austin-fc', 'Austin FC', 11.3, 4], ['real-salt-lake', 'Real Salt Lake', 11.3, 4], ['sporting-kc', 'Sporting Kansas City', 11.2, 5],
    ['toronto-fc', 'Toronto FC', 11.0, 5], ['dc-united', 'D.C. United', 11.0, 5], ['chicago-fire', 'Chicago Fire', 11.2, 5], ['houston-dynamo', 'Houston Dynamo', 11.2, 4],
    ['san-diego-fc', 'San Diego FC', 11.6, 4], ['charlotte-fc', 'Charlotte FC', 11.2, 4], ['minnesota-united', 'Minnesota United', 11.3, 4], ['new-england-rev', 'New England Revolution', 11.2, 5],
  ],
  // ---- Regiony puli i skautingu: Bałkany
  CRO: [
    ['osijek', 'NK Osijek', 10.8, 4], ['lokomotiva', 'NK Lokomotiva Zagrzeb', 10.6, 3], ['istra', 'NK Istra 1961', 10.4, 3], ['slaven-belupo', 'Slaven Belupo', 10.3, 3],
    ['gorica', 'HNK Gorica', 10.2, 2], ['varazdin', 'NK Varaždin', 10.2, 2], ['rudes', 'NK Rudeš', 9.6, 2],
  ],
  SRB: [
    ['vojvodina', 'FK Vojvodina', 10.8, 5], ['tsc', 'TSC Bačka Topola', 10.6, 3], ['cukaricki', 'FK Čukarički', 10.4, 3], ['radnicki-nis', 'Radnički Niš', 10.2, 3],
    ['novi-pazar', 'FK Novi Pazar', 10.2, 3], ['spartak-subotica', 'FK Spartak Subotica', 10.2, 3], ['mladost-lucani', 'FK Mladost Lučani', 10.0, 2], ['napredak', 'FK Napredak Kruševac', 10.0, 3],
    ['javor', 'FK Javor Ivanjica', 9.8, 2], ['radnik-surdulica', 'Radnik Surdulica', 10.0, 2], ['iskra-danilovgrad-b', 'FK Železničar Pančevo', 9.8, 2],
  ],
  SVN: [
    ['olimpija', 'NK Olimpija Lublana', 10.6, 5], ['maribor', 'NK Maribor', 10.8, 6], ['koper', 'FC Koper', 10.0, 3], ['mura', 'NS Mura', 10.0, 3],
    ['bravo', 'NK Bravo', 9.6, 2], ['domzale', 'NK Domžale', 9.8, 3], ['radomlje', 'NK Radomlje', 9.2, 2],
  ],
  BIH: [
    ['zrinjski', 'HŠK Zrinjski Mostar', 10.0, 4], ['sarajevo', 'FK Sarajevo', 10.0, 5], ['zeljeznicar', 'FK Željezničar', 9.8, 5], ['velez-mostar', 'FK Velež Mostar', 9.4, 3],
    ['tuzla-city', 'FK Tuzla City', 9.2, 2], ['siroki-brijeg', 'NK Široki Brijeg', 9.4, 3], ['radnik-bijeljina', 'FK Radnik Bijeljina', 9.0, 2],
  ],
  MKD: [
    ['struga', 'KF Struga', 8.8, 2], ['pelister', 'FK Pelister', 8.8, 3], ['rabotnicki', 'FK Rabotnički', 8.8, 3], ['makedonija-gp', 'FK Makedonija Gjorče Petrov', 8.6, 2],
    ['sileks', 'FK Sileks', 8.5, 2], ['akademija-pandev', 'FK Akademija Pandev', 8.4, 2],
  ],
  MNE: [
    ['buducnost', 'FK Budućnost Podgorica', 8.8, 4], ['decic', 'FK Decić Tuzi', 8.4, 2], ['arsenal-tivat', 'FK Arsenal Tivat', 8.2, 2], ['iskra', 'FK Iskra Danilovgrad', 8.2, 2],
    ['mornar', 'FK Mornar Bar', 8.3, 2], ['rudar-pljevlja', 'FK Rudar Pljevlja', 8.4, 2],
  ],
  ALB: [
    ['partizani', 'KF Partizani Tirana', 9.0, 4], ['tirana', 'KF Tirana', 9.0, 5], ['vllaznia', 'KF Vllaznia Szkodra', 8.8, 3], ['dinamo-tirana', 'FK Dinamo Tirana', 8.8, 3],
    ['teuta', 'KF Teuta Durrës', 8.6, 3], ['laci', 'KF Laçi', 8.4, 2], ['elbasani', 'KF Elbasani', 8.4, 2],
  ],
  KOS: [
    ['ballkani', 'KF Ballkani', 9.2, 3], ['llapi', 'KF Llapi', 8.8, 2], ['prishtina', 'FC Prishtina', 8.8, 3], ['gjilani', 'KF Gjilani', 8.6, 2],
    ['dukagjini', 'KF Dukagjini', 8.6, 2], ['drenica', 'KF Drenica', 8.4, 2],
  ],
  BUL: [
    ['ludogorets', 'Łudogorec Razgrad', 11.4, 6], ['levski-b', 'Botev Płowdiw', 10.0, 4], ['cherno-more', 'Czerno More Warna', 10.0, 3], ['lokomotiv-plovdiv', 'Lokomotiw Płowdiw', 10.0, 4],
    ['slavia-sofia', 'Sławia Sofia', 9.8, 3], ['arda', 'Arda Kyrdżali', 10.0, 3], ['cska-1948', 'CSKA 1948 Sofia', 10.2, 3], ['beroe', 'Beroe Stara Zagora', 9.6, 3],
    ['spartak-varna', 'Spartak Warna', 9.2, 2], ['botev-vratsa', 'Botew Wraca', 9.2, 2],
  ],
  // ---- Europa Środkowa, Wschodnia, Kaukaz
  SVK: [
    ['spartak-trnava', 'Spartak Trnawa', 10.6, 5], ['zemplin', 'Zemplín Michalovce', 10.0, 3], ['ruzomberok', 'MFK Ružomberok', 10.2, 4], ['trencin', 'AS Trenčín', 10.2, 4],
    ['banska-bystrica', 'MFK Dukla Bańska Bystrzyca', 10.0, 3], ['komarno', 'KFC Komárno', 9.6, 2], ['skalica', 'MFK Skalica', 9.6, 2], ['podbrezova', 'FK Železiarne Podbrezová', 10.0, 3],
  ],
  HUN: [
    ['pakse', 'Paksi FC', 10.6, 3], ['ujpest', 'Újpest FC', 10.4, 5], ['mtk', 'MTK Budapeszt', 10.4, 4], ['fehervar', 'Fehérvár FC', 10.4, 4],
    ['zalaegerszeg', 'Zalaegerszegi TE', 10.4, 3], ['kisvarda', 'Kisvárda FC', 10.2, 3], ['nyiregyhaza', 'Nyíregyháza Spartacus', 10.0, 3], ['diosgyor', 'Diósgyőri VTK', 10.0, 4],
    ['puskas-akademia', 'Puskás Akadémia', 10.2, 3], ['kecskemet', 'Kecskeméti TE', 9.8, 3],
  ],
  ROU: [
    ['fcsb', 'FCSB Bukareszt', 11.0, 7], ['cfr-cluj', 'CFR Kluż', 10.8, 6], ['rapid-bucuresti', 'Rapid Bukareszt', 10.4, 6], ['dinamo-bucuresti', 'Dinamo Bukareszt', 10.2, 6],
    ['universitatea-cluj', 'Universitatea Kluż', 10.4, 4], ['sepsi', 'Sepsi OSK', 10.0, 3], ['uta-arad', 'UTA Arad', 10.2, 3], ['farul', 'Farul Konstanca', 10.4, 4],
    ['petrolul', 'Petrolul Ploeszti', 10.0, 4], ['otelul', 'Oţelul Gałacz', 9.8, 3], ['botosani', 'FC Botoșani', 10.0, 3], ['hermannstadt', 'FC Hermannstadt', 9.8, 3],
  ],
  EST: [
    ['levadia', 'FCI Levadia Tallinn', 9.2, 4], ['nomme-kalju', 'Nõmme Kalju', 9.0, 3], ['tammeka', 'JK Tammeka Tartu', 8.6, 2], ['trans-narva', 'JK Narva Trans', 9.0, 3],
    ['kuressaare', 'FC Kuressaare', 8.4, 2], ['parnu-vaprus', 'Pärnu JK Vaprus', 8.2, 2],
  ],
  LVA: [
    ['valmiera', 'Valmiera FC', 9.2, 3], ['liepaja', 'FK Liepāja', 9.0, 3], ['auda', 'FK Auda', 8.6, 2], ['daugavpils', 'FK Daugavpils', 8.6, 2],
    ['metta', 'FK Metta', 8.6, 2], ['super-nova', 'JDFS Alberts', 8.2, 2],
  ],
  LTU: [
    ['hegelmann', 'FA Hegelmann', 9.6, 3], ['suduva', 'FK Sūduva', 9.4, 3], ['panevezys', 'FK Panevėžys', 9.6, 3], ['banga', 'FK Banga Gargždai', 9.0, 2],
    ['riteriai', 'FK Riteriai', 9.0, 2], ['dainava', 'FK Džiugas', 8.6, 2],
  ],
  FRO: [
    ['hb-torshavn', 'HB Tórshavn', 8.8, 3], ['b36', 'B36 Tórshavn', 8.6, 2], ['nsi', 'NSÍ Runavík', 8.6, 2], ['vikingur-gota', 'Víkingur Gøta', 8.4, 2], ['havnar', 'Argja Bóltfelag', 8.0, 1],
  ],
  AND: [
    ['fc-santa-coloma', 'FC Santa Coloma', 8.0, 2], ['ud-sant-julia', 'UE Sant Julià', 7.8, 1], ['fc-lusitans', 'FC Lusitanos', 7.8, 1], ['fc-ordino', 'FC Ordino', 7.6, 1],
  ],
  UKR: [
    ['dynamo-kijow', 'Dynamo Kijów', 12.4, 7], ['zorya', 'Zoria Ługańsk', 10.8, 4], ['kryvbas', 'Krywbas Krzywy Róg', 10.6, 3], ['oleksandria', 'Oleksandria', 10.4, 3],
    ['polissya', 'Polissia Żytomierz', 10.6, 3], ['lnz', 'LNZ Czerkasy', 10.2, 2], ['veres', 'Weres Równe', 10.2, 3], ['obolon', 'Obołoń Kijów', 10.2, 3],
    ['rukh', 'Ruch Lwów', 10.2, 3], ['karpaty', 'Karpaty Lwów', 10.2, 4], ['shakhtar-b', 'Metalist 1925 Charków', 10.4, 3],
  ],
  GEO: [
    ['dinamo-tbilisi', 'Dinamo Tbilisi', 9.2, 5], ['dila', 'Dila Gori', 9.0, 3], ['torpedo-kutaisi', 'Torpedo Kutaisi', 9.0, 4], ['gagra', 'FC Gagra', 8.8, 2],
    ['saburtalo', 'Saburtalo Tbilisi', 8.8, 3], ['dinamo-batumi', 'Dinamo Batumi', 9.0, 3], ['telavi', 'FC Telavi', 8.6, 2],
  ],
  BLR: [
    ['bate', 'BATE Borysów', 9.4, 5], ['dinamo-minsk', 'Dynamo Mińsk', 9.2, 5], ['shakhtyor-soligorsk', 'Szachcior Soligorsk', 9.2, 4], ['neman-grodno', 'Njoman Grodno', 9.0, 3],
    ['slutsk', 'FK Słuck', 8.8, 2], ['gomel', 'FK Homel', 8.8, 3], ['torpedo-zhodino', 'Torpedo Żodzino', 8.6, 2],
  ],
  ARM: [
    ['noah', 'FC Noah', 9.6, 3], ['urartu', 'FC Urartu', 9.2, 3], ['alashkert', 'FC Alaszkert', 9.2, 3], ['shirak', 'FC Shirak', 8.8, 3],
    ['van', 'FC Van', 8.6, 2], ['bkma', 'BKMA Erywań', 8.4, 2],
  ],
  AZE: [
    ['qarabag', 'Karabach Agdam', 11.4, 6], ['neftci', 'Neftçi Baku', 10.2, 4], ['zira-b', 'Sumgayit FK', 9.8, 3], ['turan-tovuz', 'Turan Tovuz', 9.6, 3],
    ['kapaz', 'Kapaz Gandża', 9.4, 3], ['araz', 'Araz-Naxçıvan', 9.6, 3],
  ],
  KAZ: [
    ['astana', 'FK Astana', 10.8, 5], ['aktobe', 'FK Aktobe', 9.8, 4], ['tobol', 'Tobol Kostanaj', 10.0, 4], ['ordabasy', 'Ordabasy Szymkent', 9.8, 3],
    ['zhetysu', 'Żetysu Taldykorgan', 9.4, 3], ['kaisar', 'Kajsar Kyzyłorda', 9.4, 3], ['elimai', 'Elimaj Semej', 9.2, 2], ['okzhetpes', 'Okżetpes Kokczetaw', 9.2, 2],
  ],
  MDA: [
    ['petrocub', 'Petrocub Hîncești', 9.2, 3], ['zimbru', 'Zimbru Kiszyniów', 8.8, 3], ['milsami', 'Milsami Orgiejów', 9.0, 3], ['dacia-buiucani', 'Dacia Buiucani', 8.6, 2],
    ['balti', 'FC Bălți', 8.4, 2], ['sfintul-gheorghe', 'Sfîntul Gheorghe Suruceni', 8.6, 2],
  ],
  IRL: [
    ['shelbourne', 'Shelbourne FC', 9.6, 4], ['bohemians-dublin', 'Bohemian FC', 9.2, 4], ['derry-city', 'Derry City', 9.4, 4], ['st-patricks', "St Patrick's Athletic", 9.4, 4],
    ['dundalk', 'Dundalk FC', 9.0, 4], ['sligo-rovers', 'Sligo Rovers', 8.6, 3], ['cork-city', 'Cork City', 8.6, 3], ['galway-united', 'Galway United', 8.6, 3],
  ],
  WAL: [
    ['connahs-quay', "Connah's Quay Nomads", 8.4, 2], ['bala-town', 'Bala Town', 8.2, 2], ['penybont', 'Penybont FC', 8.4, 2], ['cardiff-met', 'Cardiff Metropolitan University', 8.0, 1],
    ['aberystwyth', 'Aberystwyth Town', 8.0, 1],
  ],
  NIR: [
    ['linfield', 'Linfield FC', 8.8, 4], ['glentoran', 'Glentoran FC', 8.6, 3], ['cliftonville', 'Cliftonville FC', 8.6, 3], ['crusaders', 'Crusaders FC', 8.4, 3],
    ['coleraine', 'Coleraine FC', 8.4, 3], ['glenavon', 'Glenavon FC', 8.2, 2],
  ],
  LUX: [
    ['f91-dudelange', 'F91 Dudelange', 8.8, 3], ['swift-hesperange', 'Swift Hesperange', 8.6, 2], ['differdange', 'FC Differdange 03', 8.6, 2], ['racing-luxembourg', 'Racing FC Union Luxembourg', 8.4, 2],
    ['fola-esch', 'Fola Esch', 8.4, 2],
  ],
  // ---- Skandynawia
  FIN: [
    ['hjk', 'HJK Helsinki', 10.2, 5], ['ilves', 'Ilves Tampere', 9.6, 3], ['sjk', 'SJK Seinäjoki', 9.2, 3], ['vps', 'VPS Vaasa', 9.2, 3],
    ['kups-b', 'FC Lahti', 9.2, 3], ['ifk-mariehamn', 'IFK Mariehamn', 9.0, 2], ['haka', 'FC Haka', 9.0, 3], ['oulu', 'AC Oulu', 9.0, 2],
    ['gnistan', 'Gnistan Helsinki', 9.0, 2],
  ],
  ISL: [
    ['breidablik', 'Breiðablik', 10.0, 4], ['stjarnan', 'Stjarnan', 9.4, 3], ['kr-reykjavik', 'KR Reykjavík', 9.4, 4], ['fh', 'FH Hafnarfjörður', 9.4, 4],
    ['ka-akureyri', 'KA Akureyri', 9.2, 3], ['vestri', 'Vestri', 8.8, 2], ['fram', 'Fram Reykjavík', 9.0, 3],
  ],
  // ---- Ameryka Południowa
  BRA: [
    ['flamengo', 'Flamengo', 14.0, 9], ['palmeiras', 'Palmeiras', 14.0, 9], ['botafogo', 'Botafogo', 13.4, 7], ['fluminense', 'Fluminense', 13.2, 7],
    ['atletico-mineiro', 'Atlético Mineiro', 13.3, 7], ['sao-paulo', 'São Paulo FC', 13.0, 8], ['corinthians', 'Corinthians', 13.0, 8], ['internacional', 'Internacional Porto Alegre', 13.0, 7],
    ['gremio', 'Grêmio', 12.9, 7], ['cruzeiro', 'Cruzeiro EC', 13.0, 7], ['santos', 'Santos FC', 12.6, 8], ['vasco', 'Vasco da Gama', 12.5, 7],
    ['bahia', 'EC Bahia', 12.7, 6], ['fortaleza', 'Fortaleza EC', 12.7, 5], ['athletico-pr', 'Athletico Paranaense', 12.7, 6], ['bragantino', 'Red Bull Bragantino', 12.6, 5],
    ['vitoria', 'EC Vitória', 12.2, 5], ['juventude', 'EC Juventude', 12.0, 4], ['mirassol', 'Mirassol FC', 12.0, 3], ['sport-recife', 'Sport Recife', 12.0, 5],
    ['coritiba', 'Coritiba FC', 11.8, 5], ['goias', 'Goiás EC', 11.8, 4], ['ceara', 'Ceará SC', 11.8, 4], ['chapecoense', 'Chapecoense', 11.4, 4],
  ],
  ARG: [
    ['river-plate', 'River Plate', 13.8, 9], ['boca-juniors', 'Boca Juniors', 13.6, 9], ['racing-club', 'Racing Club', 12.8, 7], ['independiente', 'Independiente', 12.4, 7],
    ['san-lorenzo', 'San Lorenzo', 12.2, 7], ['estudiantes', 'Estudiantes La Plata', 12.8, 6], ['velez', 'Vélez Sarsfield', 12.6, 6], ['talleres', 'Talleres Córdoba', 12.5, 6],
    ['lanus', 'Club Atlético Lanús', 12.4, 5], ['argentinos-juniors', 'Argentinos Juniors', 12.3, 5], ['rosario-central', 'Rosario Central', 12.4, 6], ['newells', "Newell's Old Boys", 12.0, 6],
    ['huracan', 'Huracán', 12.0, 5], ['banfield', 'Banfield', 11.8, 4], ['godoy-cruz', 'Godoy Cruz', 11.8, 4], ['defensa-y-justicia', 'Defensa y Justicia', 11.8, 4],
    ['central-cordoba', 'Central Córdoba', 11.6, 3], ['instituto', 'Instituto Córdoba', 11.6, 4], ['belgrano', 'Belgrano Córdoba', 12.0, 5], ['tigre', 'Club Atlético Tigre', 11.6, 3],
  ],
  COL: [
    ['atletico-nacional', 'Atlético Nacional', 11.6, 7], ['millonarios', 'Millonarios FC', 11.2, 6], ['america-cali', 'América de Cali', 11.0, 5], ['junior', 'Atlético Junior', 11.2, 6],
    ['independiente-santa-fe', 'Independiente Santa Fe', 10.8, 5], ['deportivo-cali', 'Deportivo Cali', 10.8, 5], ['once-caldas', 'Once Caldas', 10.4, 4], ['tolima', 'Deportes Tolima', 10.8, 5],
    ['medellin', 'Independiente Medellín', 11.0, 5], ['bucaramanga', 'Atlético Bucaramanga', 10.6, 3], ['aguilas-doradas', 'Águilas Doradas', 10.0, 3], ['la-equidad', 'La Equidad', 9.8, 2],
  ],
  URU: [
    ['penarol', 'Peñarol', 11.6, 7], ['nacional-uy', 'Club Nacional de Football', 11.6, 7], ['defensor-sporting', 'Defensor Sporting', 10.6, 4], ['liverpool-uy', 'Liverpool Montevideo', 10.4, 3],
    ['danubio', 'Danubio FC', 10.2, 4], ['wanderers-uy', 'Montevideo Wanderers', 10.0, 3], ['river-plate-uy', 'River Plate Montevideo', 10.0, 3], ['cerro-largo', 'Cerro Largo FC', 9.8, 2],
    ['racing-montevideo', 'Racing Club Montevideo', 9.6, 2], ['boston-river', 'Boston River', 9.6, 2],
  ],
  ECU: [
    ['liga-de-quito', 'LDU Quito', 11.6, 6], ['barcelona-sc', 'Barcelona SC', 11.4, 6], ['independiente-del-valle', 'Independiente del Valle', 12.0, 6], ['emelec', 'Emelec', 10.8, 5],
    ['aucas', 'SD Aucas', 10.2, 3], ['deportivo-cuenca', 'Deportivo Cuenca', 9.8, 3], ['universidad-catolica-ec', 'Universidad Católica Quito', 10.2, 3], ['orense', 'Orense SC', 9.8, 2],
    ['macara', 'Macará', 10.0, 3], ['mushuc-runa', 'Mushuc Runa', 9.6, 2],
  ],
  PAR: [
    ['olimpia', 'Club Olimpia', 11.2, 7], ['cerro-porteno', 'Cerro Porteño', 11.2, 7], ['libertad', 'Club Libertad', 10.8, 5], ['guarani-py', 'Club Guaraní', 10.0, 4],
    ['nacional-py', 'Club Nacional Asunción', 9.8, 3], ['sol-de-america', 'Sol de América', 9.4, 3], ['general-caballero', 'General Caballero JLM', 9.4, 2], ['sportivo-luqueno', 'Sportivo Luqueño', 9.4, 3],
    ['tacuary', 'Club Tacuary', 9.0, 2],
  ],
  VEN: [
    ['caracas-fc', 'Caracas FC', 9.8, 5], ['deportivo-tachira', 'Deportivo Táchira', 9.8, 5], ['monagas', 'Monagas SC', 9.4, 3], ['metropolitanos', 'Metropolitanos FC', 9.2, 2],
    ['carabobo', 'Carabobo FC', 9.2, 3], ['academia-puerto-cabello', 'Academia Puerto Cabello', 9.2, 2], ['portuguesa', 'Portuguesa FC', 9.0, 3], ['zamora-fc', 'Zamora FC', 9.4, 3],
  ],
  CHI: [
    ['colo-colo', 'Colo-Colo', 11.2, 7], ['universidad-de-chile', 'Universidad de Chile', 10.8, 7], ['universidad-catolica', 'Universidad Católica', 10.8, 6], ['huachipato', 'CD Huachipato', 10.0, 3],
    ['palestino', 'Palestino', 9.8, 3], ['cobresal', 'Cobresal', 9.8, 3], ['union-espanola', 'Unión Española', 9.8, 4], ['o-higgins', "O'Higgins", 9.8, 4],
    ['audax-italiano', 'Audax Italiano', 9.6, 3], ['everton-vina', 'Everton de Viña del Mar', 9.6, 3], ['coquimbo-unido', 'Coquimbo Unido', 10.0, 3],
  ],
  PER: [
    ['alianza-lima', 'Alianza Lima', 10.4, 6], ['universitario', 'Universitario de Deportes', 10.6, 6], ['sporting-cristal', 'Sporting Cristal', 10.2, 5], ['melgar', 'FBC Melgar', 10.0, 4],
    ['cienciano', 'Cienciano', 9.4, 4], ['cusco-fc', 'Cusco FC', 9.2, 2], ['sport-boys', 'Sport Boys', 9.0, 3], ['binacional', 'Deportivo Binacional', 8.8, 2],
  ],
  BOL: [
    ['bolivar', 'Club Bolívar', 9.8, 5], ['the-strongest', 'The Strongest', 9.8, 5], ['oriente-petrolero', 'Oriente Petrolero', 9.0, 4], ['blooming', 'Blooming', 9.0, 3],
    ['always-ready', 'Always Ready', 9.4, 3], ['jorge-wilstermann', 'Jorge Wilstermann', 9.2, 4], ['aurora', 'Club Aurora', 9.0, 3], ['nacional-potosi', 'Nacional Potosí', 8.8, 2],
  ],
  // ---- Afryka
  NGA: [
    ['enyimba', 'Enyimba FC', 9.4, 5], ['remo-stars', 'Remo Stars', 9.2, 3], ['rivers-united', 'Rivers United', 9.2, 4], ['kano-pillars', 'Kano Pillars', 8.8, 4],
    ['plateau-united', 'Plateau United', 8.8, 3], ['shooting-stars', 'Shooting Stars SC', 8.6, 3], ['akwa-united', 'Akwa United', 8.8, 3], ['bendel-insurance', 'Bendel Insurance', 8.6, 3],
    ['heartland', 'Heartland FC', 8.4, 3], ['lobi-stars', 'Lobi Stars', 8.4, 3], ['abia-warriors', 'Abia Warriors', 8.2, 2],
  ],
  GHA: [
    ['asante-kotoko', 'Asante Kotoko', 9.4, 6], ['hearts-of-oak', 'Hearts of Oak', 9.2, 6], ['medeama', 'Medeama SC', 9.0, 3], ['aduana-stars', 'Aduana Stars', 8.6, 3],
    ['bechem-united', 'Bechem United', 8.6, 2], ['dreams-fc', 'Dreams FC', 8.6, 3], ['samartex', 'Samartex FC', 8.4, 2], ['berekum-chelsea', 'Berekum Chelsea', 8.4, 2],
    ['legon-cities', 'Legon Cities', 8.2, 2],
  ],
  CMR: [
    ['coton-sport', 'Coton Sport Garoua', 9.0, 5], ['canon-yaounde', 'Canon Jaunde', 8.6, 4], ['union-douala', 'Union Duala', 8.4, 3], ['fovu-baham', 'Fovu Baham', 8.6, 3],
    ['bamboutos', 'Bamboutos FC', 8.4, 3], ['colombe-sangmelima', 'Colombe Sangmélima', 8.2, 2], ['apejes', 'Apejes Academy', 8.2, 2], ['stade-renard', 'Stade Renard', 8.0, 2],
  ],
  SEN: [
    ['generation-foot', 'Génération Foot', 9.6, 4], ['jaraaf', 'ASC Jaraaf', 9.2, 4], ['teungueth', 'Teungueth FC', 9.0, 3], ['us-goree', 'US Gorée', 8.8, 3],
    ['casa-sports', 'Casa Sports', 8.6, 3], ['diambars', 'Diambars FC', 9.2, 3], ['guediawaye', 'Guédiawaye FC', 8.8, 3], ['as-pikine', 'AS Pikine', 8.6, 3],
  ],
  CIV: [
    ['asec-mimosas', 'ASEC Mimosas', 9.6, 6], ['africa-sports', 'Africa Sports', 9.0, 4], ['sc-gagnoa', 'SC Gagnoa', 8.8, 3],
    ['san-pedro', 'San Pédro FC', 9.0, 3], ['stella-abidjan', 'Stella Club d\'Adjamé', 8.8, 3], ['stade-abidjan', 'Stade d\'Abidjan', 8.4, 3],
  ],
  MAR: [
    ['wydad', 'Wydad Casablanca', 11.2, 7], ['raja', 'Raja Casablanca', 11.0, 7], ['rs-berkane', 'RS Berkane', 10.8, 5], ['far-rabat', 'AS FAR Rabat', 10.8, 6],
    ['ma-tetouan', 'Maghreb Tétouan', 10.0, 4], ['hassania-agadir', 'Hassania Agadir', 9.8, 4], ['fus-rabat', 'FUS Rabat', 10.0, 4], ['difaa-el-jadida', 'Difaâ El Jadida', 9.8, 4],
    ['olympic-safi', 'Olympic Safi', 9.6, 3], ['renaissance-zemamra', 'Renaissance Zemamra', 9.4, 2], ['ittihad-tanger', 'Ittihad Tanger', 10.0, 4],
  ],
  ALG: [
    ['jsk-kabylie', 'JS Kabylie', 9.8, 6], ['usm-alger', 'USM Alger', 10.2, 6], ['mc-alger', 'MC Alger', 10.4, 6], ['cr-belouizdad', 'CR Belouizdad', 10.4, 6],
    ['es-setif', 'ES Sétif', 10.0, 5], ['cs-constantine', 'CS Constantine', 9.8, 5], ['jsm-skikda', 'JS Saoura', 9.4, 3], ['paradou-ac', 'Paradou AC', 9.4, 3],
    ['mc-oran', 'MC Oran', 9.6, 5], ['usm-khenchela', 'USM Khenchela', 9.0, 2],
  ],
  TUN: [
    ['esperance-tunis', 'Espérance Tunis', 10.8, 7], ['club-africain', 'Club Africain', 10.2, 6], ['etoile-du-sahel', 'Étoile du Sahel', 10.2, 6], ['cs-sfaxien', 'CS Sfaxien', 10.0, 6],
    ['us-monastir', 'US Monastir', 9.6, 4], ['cs-hammam-lif', 'CS Hammam-Lif', 9.2, 3], ['us-ben-guerdane', 'US Ben Guerdane', 9.4, 3], ['es-zarzis', 'ES Zarzis', 9.2, 3],
    ['jsk-kairouan', 'JS Kairouan', 9.0, 3], ['stade-tunisien', 'Stade Tunisien', 9.2, 4],
  ],
  EGY: [
    ['al-ahly', 'Al-Ahly Kair', 11.6, 9], ['zamalek', 'Zamalek SC', 11.2, 8], ['pyramids', 'Pyramids FC', 11.0, 5], ['al-masry', 'Al-Masry', 10.2, 4],
    ['ceramica-cleopatra', 'Ceramica Cleopatra', 10.0, 3], ['modern-sport', 'Modern Sport FC', 10.0, 3], ['enppi', 'ENPPI Club', 9.8, 3], ['ismaily', 'Ismaily SC', 9.8, 4],
    ['zed-fc', 'ZED FC', 9.8, 3], ['al-ittihad-alexandria', 'Al-Ittihad Aleksandria', 9.6, 4],
  ],
  MLI: [
    ['djoliba', 'Djoliba AC', 8.8, 5], ['stade-malien', 'Stade Malien', 9.0, 5], ['real-bamako', 'Real Bamako', 8.6, 4], ['as-bakaridjan', 'AS Bakaridjan', 8.2, 2],
    ['usc-kita', 'USC Kita', 8.2, 2], ['as-onze-createurs', 'AS Onze Créateurs', 8.2, 2],
  ],
  GUI: [
    ['horoya', 'Horoya AC', 8.8, 4], ['hafia-fc', 'Hafia FC', 8.4, 4], ['ashanti-golden-boys', 'Ashanti Golden Boys', 8.0, 2], ['milo-fc', 'Milo FC', 7.8, 2],
    ['fc-fello-star', 'Fello Star', 7.8, 2], ['wakriya', 'Wakriya AC', 7.8, 2],
  ],
  COD: [
    ['tp-mazembe', 'TP Mazembe', 9.8, 7], ['as-vita-club', 'AS Vita Club', 9.2, 6], ['dcmp', 'DC Motema Pembe', 8.8, 4], ['as-maniema-union', 'Maniema Union', 8.4, 3],
    ['v-club', 'FC Saint Éloi Lupopo', 8.6, 4], ['us-tshinkunku', 'US Tshinkunku', 8.2, 2], ['as-otoho', 'AS Otoho', 8.0, 2],
  ],
  BFA: [
    ['asfa-yennenga', 'ASFA Yennenga', 7.8, 3], ['rail-club-kadiogo', 'Rail Club du Kadiogo', 8.0, 3], ['usfa', 'USFA Ouagadougou', 7.8, 2], ['salitas-fc', 'Salitas FC', 7.8, 2],
    ['etoile-filante', 'Étoile Filante Ouagadougou', 8.0, 3],
  ],
  GAM: [
    ['real-de-banjul', 'Real de Banjul', 7.6, 2], ['gambia-ports', 'Gambia Ports Authority', 7.4, 2], ['gamtel', 'Gamtel FC', 7.4, 2], ['samger', 'Samger FC', 7.4, 2],
  ],
  ZAM: [
    ['zesco-united', 'ZESCO United', 8.6, 4], ['power-dynamos', 'Power Dynamos', 8.4, 4], ['nkana', 'Nkana FC', 8.4, 4], ['red-arrows', 'Red Arrows FC', 8.2, 3],
    ['zanaco', 'Zanaco FC', 8.2, 3], ['forest-rangers', 'Forest Rangers', 8.0, 2],
  ],
  RSA: [
    ['mamelodi-sundowns', 'Mamelodi Sundowns', 10.2, 7], ['orlando-pirates', 'Orlando Pirates', 9.8, 7], ['kaizer-chiefs', 'Kaizer Chiefs', 9.6, 7], ['supersport-united', 'SuperSport United', 9.2, 4],
    ['stellenbosch', 'Stellenbosch FC', 9.2, 3], ['cape-town-city', 'Cape Town City', 9.0, 3], ['amazulu', 'AmaZulu FC', 9.0, 4], ['sekhukhune', 'Sekhukhune United', 8.8, 3],
    ['golden-arrows', 'Golden Arrows', 8.8, 3], ['polokwane-city', 'Polokwane City', 8.6, 2],
  ],
  KEN: [
    ['gor-mahia', 'Gor Mahia', 8.4, 5], ['afc-leopards', 'AFC Leopards', 8.0, 4], ['tusker', 'Tusker FC', 8.2, 4], ['kcb', 'KCB FC', 8.0, 3],
    ['kakamega-homeboyz', 'Kakamega Homeboyz', 7.8, 2], ['bandari', 'Bandari FC', 7.8, 3],
  ],
  // ---- Ameryka Północna i Środkowa
  MEX: [
    ['club-america', 'Club América', 13.0, 9], ['chivas', 'CD Guadalajara', 12.4, 8], ['cruz-azul', 'Cruz Azul', 12.6, 8], ['pumas', 'Pumas UNAM', 12.0, 7],
    ['tigres', 'Tigres UANL', 12.8, 8], ['monterrey', 'CF Monterrey', 12.8, 8], ['toluca', 'Deportivo Toluca', 12.6, 7], ['santos-laguna', 'Santos Laguna', 11.6, 6],
    ['leon', 'Club León', 11.8, 6], ['pachuca', 'CF Pachuca', 12.0, 6], ['atlas', 'Atlas FC', 11.4, 5], ['necaxa', 'Club Necaxa', 11.0, 4],
    ['tijuana', 'Club Tijuana', 11.2, 4], ['queretaro', 'Querétaro FC', 10.8, 4], ['puebla', 'Club Puebla', 10.8, 4], ['mazatlan', 'Mazatlán FC', 10.6, 3],
    ['san-luis', 'Atlético San Luis', 10.8, 4], ['juarez', 'FC Juárez', 10.6, 3],
  ],
  CAN: [
    ['cf-montreal', 'CF Montréal', 10.8, 4], ['vancouver-whitecaps', 'Vancouver Whitecaps', 11.2, 4], ['forge-fc', 'Forge FC', 9.4, 3], ['cavalry-fc', 'Cavalry FC', 9.2, 3],
    ['pacific-fc', 'Pacific FC', 8.8, 2], ['atletico-ottawa', 'Atlético Ottawa', 9.0, 2], ['hfx-wanderers', 'HFX Wanderers', 8.6, 2], ['valour-fc', 'Valour FC', 8.6, 2],
  ],
  CRC: [
    ['saprissa', 'Deportivo Saprissa', 9.8, 6], ['alajuelense', 'LD Alajuelense', 9.8, 6], ['herediano', 'CS Herediano', 9.6, 6], ['cartagines', 'CS Cartaginés', 9.0, 4],
    ['perez-zeledon', 'Pérez Zeledón', 8.8, 3], ['guadalupe-fc', 'Guadalupe FC', 8.6, 2], ['sporting-fc-cr', 'Sporting FC', 8.6, 2], ['santos-guapiles', 'Santos de Guápiles', 8.6, 3],
  ],
  HON: [
    ['olimpia-hon', 'CD Olimpia', 9.4, 6], ['motagua', 'FC Motagua', 9.2, 5], ['real-espana', 'Real España', 9.0, 5], ['marathon', 'CD Marathón', 8.8, 4],
    ['vida', 'CD Vida', 8.4, 3], ['olancho-fc', 'Olancho FC', 8.4, 2], ['real-sociedad-hon', 'Real Sociedad Tocoa', 8.2, 2],
  ],
  JAM: [
    ['cavalier', 'Cavalier SC', 8.0, 3], ['mount-pleasant', 'Mount Pleasant Football Academy', 8.2, 3], ['harbour-view', 'Harbour View FC', 8.2, 4], ['portmore-united', 'Portmore United', 8.2, 3],
    ['waterhouse', 'Waterhouse FC', 8.0, 3], ['humble-lions', 'Humble Lions', 7.6, 2], ['arnett-gardens', 'Arnett Gardens', 7.8, 2],
  ],
  PAN: [
    ['tauro-fc', 'Tauro FC', 8.8, 4], ['plaza-amador', 'Plaza Amador', 8.6, 3], ['cd-universitario-pan', 'CD Universitario Panama', 8.4, 3], ['sporting-san-miguelito', 'Sporting San Miguelito', 8.4, 3],
    ['independiente-pan', 'CD Independiente', 8.6, 3], ['alianza-fc-pan', 'Alianza FC', 8.4, 3], ['cd-plaza-amador-b', 'Costa del Este FC', 8.2, 2],
  ],
  // ---- Azja
  JPN: [
    ['vissel-kobe', 'Vissel Kobe', 12.4, 6], ['kawasaki-frontale', 'Kawasaki Frontale', 12.2, 6], ['yokohama-fm', 'Yokohama F. Marinos', 12.0, 6], ['urawa-reds', 'Urawa Red Diamonds', 12.0, 7],
    ['kashima-antlers', 'Kashima Antlers', 11.8, 6], ['gamba-osaka', 'Gamba Osaka', 11.6, 6], ['cerezo-osaka', 'Cerezo Osaka', 11.6, 5], ['sanfrecce', 'Sanfrecce Hiroshima', 11.8, 5],
    ['fc-tokyo', 'FC Tokyo', 11.4, 5], ['nagoya-grampus', 'Nagoya Grampus', 11.4, 5], ['kyoto-sanga', 'Kyoto Sanga', 11.2, 4], ['avispa-fukuoka', 'Avispa Fukuoka', 11.0, 3],
    ['machida-zelvia', 'FC Machida Zelvia', 11.4, 3], ['shimizu', 'Shimizu S-Pulse', 11.0, 4], ['consadole', 'Hokkaido Consadole Sapporo', 10.8, 4], ['vegalta', 'Vegalta Sendai', 10.4, 4],
  ],
  KOR: [
    ['ulsan-hd', 'Ulsan HD', 11.2, 6], ['jeonbuk', 'Jeonbuk Hyundai Motors', 11.2, 6], ['pohang-steelers', 'Pohang Steelers', 10.8, 5], ['fc-seoul', 'FC Seoul', 10.8, 6],
    ['suwon-bluewings', 'Suwon Samsung Bluewings', 10.4, 5], ['daegu-fc', 'Daegu FC', 10.2, 3], ['gangwon-fc', 'Gangwon FC', 10.2, 3], ['incheon-united', 'Incheon United', 10.0, 4],
    ['jeju-united', 'Jeju SK', 10.0, 4], ['gwangju-fc', 'Gwangju FC', 10.2, 3], ['daejeon-hana', 'Daejeon Hana Citizen', 10.2, 3], ['suwon-fc', 'Suwon FC', 10.0, 3],
  ],
  AUS: [
    ['melbourne-victory', 'Melbourne Victory', 9.8, 5], ['sydney-fc', 'Sydney FC', 10.0, 5], ['melbourne-city', 'Melbourne City', 10.0, 4], ['central-coast-mariners', 'Central Coast Mariners', 9.6, 4],
    ['western-sydney', 'Western Sydney Wanderers', 9.6, 4], ['brisbane-roar', 'Brisbane Roar', 9.4, 4], ['adelaide-united', 'Adelaide United', 9.6, 4], ['perth-glory', 'Perth Glory', 9.2, 4],
    ['wellington-phoenix', 'Wellington Phoenix', 9.2, 3], ['macarthur-fc', 'Macarthur FC', 9.2, 3], ['newcastle-jets', 'Newcastle Jets', 9.2, 3],
  ],
  UZB: [
    ['pakhtakor', 'Pakhtakor Taszkent', 10.0, 6], ['bunyodkor', 'Bunyodkor', 9.6, 5], ['nasaf', 'Nasaf Karszi', 9.8, 4], ['navbahor', 'Navbahor Namangan', 9.4, 3],
    ['lokomotiv-tashkent', 'Lokomotiv Taszkent', 9.2, 4], ['andijon', 'FK Andijan', 9.2, 3], ['neftchi-fergana', 'Neftchi Fergana', 9.0, 3], ['sogdiana', 'Sogdiana Dżyzak', 9.0, 3],
  ],
  IRN: [
    ['persepolis', 'Persepolis Teheran', 10.8, 8], ['esteghlal', 'Esteghlal Teheran', 10.6, 8], ['sepahan', 'Sepahan Isfahan', 10.6, 6], ['tractor', 'Tractor Tebriz', 10.4, 6],
    ['foolad', 'Foolad Chuzestan', 9.8, 4], ['gol-gohar', 'Gol Gohar Sirjan', 9.8, 3], ['malavan', 'Malavan Bandar-e Anzali', 9.2, 3], ['nassaji', 'Nassaji Mazandaran', 9.4, 3],
    ['zob-ahan', 'Zob Ahan Isfahan', 9.8, 5], ['shams-azar', 'Shams Azar Qazvin', 9.0, 2],
  ],
  CHN: [
    ['shanghai-port', 'Shanghai Port', 10.4, 6], ['shandong-taishan', 'Shandong Taishan', 10.2, 6], ['beijing-guoan', 'Beijing Guoan', 10.2, 6], ['shanghai-shenhua', 'Shanghai Shenhua', 10.0, 6],
    ['chengdu-rongcheng', 'Chengdu Rongcheng', 10.0, 4], ['zhejiang-fc', 'Zhejiang FC', 9.8, 4], ['tianjin-jinmen-tiger', 'Tianjin Jinmen Tiger', 9.6, 4], ['henan-fc', 'Henan FC', 9.4, 3],
    ['guangzhou-fc', 'Guangzhou FC', 9.0, 5], ['wuhan-three-towns', 'Wuhan Three Towns', 9.4, 3], ['dalian-yingbo', 'Dalian Yingbo', 9.2, 3],
  ],
  THA: [
    ['buriram-united', 'Buriram United', 9.6, 5], ['bangkok-united', 'Bangkok United', 9.2, 4], ['port-fc', 'Port FC', 9.0, 4], ['muangthong-united', 'Muangthong United', 9.0, 4],
    ['bg-pathum', 'BG Pathum United', 9.0, 4], ['chiangrai-united', 'Chiangrai United', 8.8, 3], ['ratchaburi', 'Ratchaburi FC', 8.8, 3], ['lamphun-warriors', 'Lamphun Warriors', 8.4, 2],
  ],
  // ---- Bliski Wschód
  LBN: [
    ['al-ahed', 'Al-Ahed Bejrut', 8.6, 4], ['al-ansar', 'Al-Ansar Bejrut', 8.4, 4], ['nejmeh', 'Nejmeh SC', 8.4, 4], ['safa-sc', 'Safa SC', 8.0, 3],
    ['racing-beirut', 'Racing Beirut', 7.8, 2], ['salam-zgharta', 'Salam Zgharta', 7.8, 2],
  ],
  JOR: [
    ['al-wehdat', 'Al-Wehdat', 8.8, 5], ['al-faisaly', 'Al-Faisaly Amman', 8.8, 5], ['al-hussein-irbid', 'Al-Hussein Irbid', 8.6, 4], ['al-ramtha', 'Al-Ramtha', 8.2, 3],
    ['al-jazeera-amman', 'Al-Jazeera Amman', 8.2, 3], ['shabab-al-ordon', 'Shabab Al-Ordon', 8.2, 3],
  ],
  IRQ: [
    ['al-shorta', 'Al-Shorta Bagdad', 9.0, 5], ['al-quwa-al-jawiya', 'Al-Quwa Al-Jawiya', 9.0, 5], ['al-zawraa', 'Al-Zawraa SC', 8.8, 5], ['duhok', 'Duhok SC', 8.6, 3],
    ['erbil-sc', 'Erbil SC', 8.6, 3], ['al-talaba', 'Al-Talaba SC', 8.6, 4], ['al-najaf', 'Al-Najaf FC', 8.2, 3],
  ],
  SYR: [
    ['al-jaish', 'Al-Jaish Damaszek', 8.0, 4], ['al-karamah', 'Al-Karamah Homs', 8.0, 4], ['al-wahda-syr', 'Al-Wahda Damaszek', 7.8, 3], ['tishreen', 'Tishreen SC', 7.8, 3],
    ['al-futuwa', 'Al-Futuwa Dajr az-Zaur', 7.6, 2],
  ],
};

const slug = (s) => `sw-${s}`;

/** Mapa: kod kraju -> kluby { id, name, L, prestiz }. */
export const KLUBY_SWIAT = Object.fromEntries(
  Object.entries(RAW).map(([kod, list]) => [kod, list.map(([id, name, L, prestiz]) => ({ id: slug(`${kod.toLowerCase()}-${id}`), name, L, prestiz }))]),
);

/** Kluby wybrane do poziomu zawodnika: okna [dół, góra] względem ovr, po kolei od wąskiego; bez trafienia: najbliższe pod względem L. */
export function fitClubs(clubs, ovr, windows) {
  if (!clubs.length) return [];
  for (const [lo, hi] of windows) {
    const fit = clubs.filter((c) => c.L >= ovr - lo && c.L <= ovr + hi);
    if (fit.length) return fit;
  }
  let best = Infinity;
  for (const c of clubs) best = Math.min(best, Math.abs(c.L - ovr));
  return clubs.filter((c) => Math.abs(c.L - ovr) <= best + 0.5);
}

/** Kluby kraju: najpierw podane (kluby_uefa.json), potem kluby z tego pliku bez powtórzeń nazw. */
export function mergeClubs(kod, base = []) {
  const names = new Set(base.map((c) => c.name));
  return [...base, ...(KLUBY_SWIAT[kod] ?? []).filter((c) => !names.has(c.name)).map((c) => ({ id: c.id, name: c.name, L: c.L, prestige: c.prestiz }))];
}
