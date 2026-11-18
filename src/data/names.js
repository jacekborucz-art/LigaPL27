// Pule imion i nazwisk według narodowości. Zawodnicy są fikcyjni: imię i nazwisko losowane osobno.
// Format: kod kraju -> { first, last } jako napisy rozdzielone spacją (oszczędność miejsca).

const POOLS = {
  POL: {
    first: 'Adam Adrian Aleksander Antoni Arkadiusz Artur Bartłomiej Bartosz Błażej Damian Daniel Dariusz Dawid Dominik Filip Grzegorz Hubert Igor Jakub Jan Jarosław Jędrzej Kacper Kamil Karol Konrad Krystian Krzysztof Łukasz Maciej Marcel Marcin Marek Mariusz Mateusz Michał Mikołaj Miłosz Nikodem Norbert Oliwer Oskar Patryk Paweł Piotr Przemysław Radosław Rafał Robert Sebastian Szymon Tobiasz Tomasz Wiktor Wojciech Zbigniew',
    last: 'Adamczyk Bąk Bednarek Bielecki Błaszczyk Borowiec Brzozowski Chmiel Cichocki Czarnecki Dąbek Dudziak Dziedzic Fijałkowski Gajewski Gołąb Grabowski Grzelak Jabłoński Jagiełło Jakubiak Janik Jaros Kaczmarek Kalinowski Kamiński Kępa Kłos Kmieć Kołodziej Kowalczyk Kozieł Krajewski Kruk Kubiak Kurek Lasota Leśniak Lis Majewski Malinowski Marciniak Mazurek Michalak Mikulski Mróz Nowicki Olszewski Orzeł Ostrowski Pawlak Pietrzak Piątek Pluta Polak Radomski Rogalski Rutkowski Sadowski Sawicki Sikora Skiba Sobczak Sowa Stępień Szczepański Szewczyk Szulc Szymczak Tomczyk Urban Walczak Wawrzyniak Wieczorek Wilk Witkowski Wójcik Wróbel Zając Zawadzki Zieliński Żak Żurek',
  },
  ESP: { first: 'Alejandro Álvaro Carlos Daniel David Diego Hugo Iker Javier Jorge Mario Miguel Pablo Raúl Rubén Sergio', last: 'Aguilar Blanco Castillo Delgado Domínguez Gallego Garrido Herrera Iglesias León Molina Morales Navarro Ortega Ramos Rubio Santos Serrano Torres Vidal' },
  POR: { first: 'André Bruno Diogo Duarte Gonçalo João Miguel Nuno Pedro Rafael Rodrigo Tiago Vasco', last: 'Almeida Barbosa Carvalho Costa Correia Fernandes Lopes Machado Moreira Pinto Rocha Sousa Teixeira Vieira' },
  CRO: { first: 'Ante Ivan Josip Luka Marko Mateo Mislav Nikola Petar Tomislav', last: 'Babić Barišić Grgić Horvat Jurić Knežević Kovačić Marić Perić Vuković' },
  SRB: { first: 'Aleksa Dušan Lazar Marko Miloš Nemanja Stefan Uroš Vuk Željko', last: 'Đorđević Ilić Jovanović Marković Milošević Nikolić Pavlović Petrović Stanković Živković' },
  SVN: { first: 'Aljaž Blaž Jan Luka Matic Nejc Rok Žan Žiga', last: 'Kavčič Kos Mlakar Novak Potočnik Vidmar Zupan Žagar' },
  BIH: { first: 'Adnan Amar Armin Edin Haris Kenan Mirza Tarik', last: 'Begić Delić Hadžić Hodžić Mehić Kovač Salihović Zukić' },
  MKD: { first: 'Aleksandar Bojan Darko Goran Stefan Viktor', last: 'Angelovski Ristovski Stojanovski Trajkovski Velkovski' },
  MNE: { first: 'Andrija Balša Luka Marko Vuk', last: 'Bošković Đukanović Raičević Vujović Vukčević' },
  SVK: { first: 'Adam Dávid Erik Filip Jakub Lukáš Marek Martin Matúš Michal Patrik Samuel Tomáš', last: 'Baláž Holub Hudák Kollár Kováč Lukáč Mikuš Nagy Oravec Šimko Tóth Varga' },
  CZE: { first: 'Adam Jakub Jan Lukáš Matěj Ondřej Petr Tomáš Vojtěch', last: 'Beneš Doležal Dvořák Horák Kratochvíl Novotný Procházka Svoboda Veselý' },
  UKR: { first: 'Andrij Bohdan Denys Dmytro Ihor Maksym Mykola Oleh Oleksandr Roman Serhij Taras Vitalij Wołodymyr', last: 'Bondarenko Hnatiuk Kowalenko Kravchenko Melnyk Moroz Ozerko Petrenko Shevchuk Sydorenko Tkachenko Zinchenko' },
  BLR: { first: 'Artsiom Dzmitry Ivan Kiryl Mikita Pavel Uladzislau', last: 'Hrytsuk Kavaleu Lisouski Novik Shapavalau Zhukau' },
  LTU: { first: 'Domantas Ignas Justas Lukas Mantas Rokas Tomas', last: 'Kazlauskas Petrauskas Stankevičius Vaitkus Žukauskas' },
  LVA: { first: 'Artūrs Dāvis Kristaps Mārtiņš Roberts', last: 'Bērziņš Kalniņš Ozols Liepiņš Zariņš' },
  GEO: { first: 'Davit Giorgi Irakli Levan Luka Nika Saba Zurab', last: 'Beridze Chikhladze Gelashvili Kapanadze Lomidze Maisuradze Tsiklauri' },
  NED: { first: 'Bram Daan Jesse Lars Milan Niels Ruben Sem Thijs', last: 'Bakker de_Boer de_Vries Janssen Meijer Smit van_Dijk Visser' },
  BEL: { first: 'Arne Jonas Lucas Maxime Robbe Wout', last: 'Claes Goossens Lambert Mertens Peeters Wouters' },
  GER: { first: 'Felix Jonas Leon Lukas Maximilian Niklas Paul Tim', last: 'Becker Fischer Hoffmann Koch Richter Schäfer Wagner Weber' },
  AUT: { first: 'Dominik Florian Julian Matthias Stefan', last: 'Gruber Huber Pichler Steiner Wimmer' },
  FRA: { first: 'Antoine Clément Hugo Lucas Mathis Théo Yanis', last: 'Bernard Dubois Fournier Girard Lefebvre Martin Moreau' },
  NGA: { first: 'Chidi Emeka Ifeanyi Kelechi Samuel Tunde Victor', last: 'Adeyemi Babatunde Eze Nwosu Okafor Okonkwo Uche' },
  GHA: { first: 'Abdul Emmanuel Kwabena Kwame Kofi Yaw', last: 'Agyei Asante Boateng Mensah Owusu Osei' },
  CMR: { first: 'Arnaud Christian Junior Patrick Serge', last: 'Ekambi Mbarga Nkoulou Onana Tchami' },
  SEN: { first: 'Abdou Cheikh Ibrahima Moussa Pape', last: 'Diallo Diop Faye Ndiaye Sarr' },
  CIV: { first: 'Didier Franck Jean Serge Yannick', last: 'Bamba Kone Kouassi Traoré Yao' },
  BRA: { first: 'Bruno Caio Felipe Gabriel Gustavo Lucas Matheus Rafael Thiago', last: 'Alves Barbosa Cardoso Ferreira Gomes Martins Oliveira Ribeiro Silva' },
  ARG: { first: 'Facundo Franco Joaquín Lautaro Matías Nicolás Tomás', last: 'Acosta Benítez Fernández Gómez Medina Romero Sosa' },
  COL: { first: 'Andrés Camilo Juan Santiago Sebastián', last: 'Cardona Gutiérrez Mosquera Ospina Restrepo' },
  SWE: { first: 'Anton Elias Erik Gustav Isak Oscar Viktor', last: 'Andersson Berg Johansson Karlsson Lindberg Nilsson' },
  NOR: { first: 'Andreas Eirik Kristian Magnus Sander', last: 'Berg Dahl Hansen Johansen Larsen' },
  DEN: { first: 'Frederik Jonas Magnus Mikkel Rasmus', last: 'Christensen Jensen Madsen Nielsen Poulsen' },
  FIN: { first: 'Aleksi Eetu Juho Mikko Onni', last: 'Heikkinen Korhonen Laine Mäkinen Virtanen' },
  ISL: { first: 'Arnór Gunnar Jón Sverrir', last: 'Gunnarsson Jónsson Magnússon Sigurðsson' },
  ENG: { first: 'Harry Jack James Oliver George Charlie Jacob Thomas Ben Luke Callum Jordan Kieran Mason Reece Tyler Lewis Ryan', last: "Smith Jones Taylor Brown Walker Wright Robinson Thompson Hughes Edwards Green Hall Wood Clarke Turner Hill Cooper Ward Morris Bennett" },
  SCO: { first: 'Callum Ross Ewan Fraser Lewis Calum Scott Craig Jamie Kyle Liam Euan', last: "Campbell Stewart MacDonald Murray Reid Robertson Fraser McLean Ferguson Ross Paterson Hamilton Kerr Grant" },
  WAL: { first: 'Rhys Dylan Owen Gareth Aaron Ethan Iwan Joe Tom Morgan', last: "Jones Davies Williams Evans Thomas Roberts Lewis Hughes Morgan Griffiths Price Powell" },
  NIR: { first: 'Conor Shane Niall Paddy Ciaran Gavin Jamie Liam Ryan Dale', last: "McAuley Doherty Kelly Murphy Quinn Gallagher McCann Boyle Devlin Lafferty Magennis Brown" },
  IRL: { first: 'Seán Cian Darragh Conor Evan Aidan Jamie Shane Adam Killian', last: "Murphy Kelly Byrne Ryan O'Brien Walsh O'Sullivan Doyle McCarthy Kavanagh Brady Duffy" },
  ITA: { first: 'Alessandro Andrea Davide Federico Francesco Giacomo Lorenzo Luca Marco Matteo Nicolò Riccardo Simone Stefano Tommaso', last: "Bianchi Colombo Conti Costa De Luca Esposito Ferrari Fontana Galli Greco Lombardi Marino Moretti Ricci Romano Rossi Russo Mancini Rizzo Bruno" },
  TUR: { first: 'Ahmet Arda Burak Can Emre Enes Furkan Hakan Kerem Mert Oğuz Okan Ozan Yusuf', last: "Aydın Çelik Demir Doğan Kaya Kılıç Koç Kurt Öztürk Şahin Yıldız Yılmaz Arslan Aksoy" },
  GRE: { first: 'Giorgos Dimitris Nikos Kostas Giannis Panagiotis Christos Vasilis Andreas Thanasis', last: "Papadopoulos Pappas Georgiou Nikolaidis Karagiannis Oikonomou Vlachos Konstantinidis Alexiou Makris Antoniou Dimitriou" },
  AZE: { first: 'Elvin Rashad Orkhan Murad Ramil Emin Tural Anar Kamran Namik', last: "Aliyev Mammadov Huseynov Hasanov Ismayilov Guliyev Abdullayev Jafarov Rzayev Babayev" },
  HUN: { first: 'Ádám Bence Dániel Dominik Gergő Kristóf Levente Márk Máté Milán Péter Zsolt', last: "Nagy Kovács Tóth Szabó Horváth Varga Kiss Molnár Németh Farkas Balogh Papp Takács Juhász" },
  CYP: { first: 'Andreas Christos Giorgos Marios Nikolas Konstantinos Michalis Stelios Panagiotis Loizos', last: "Charalambous Georgiou Ioannou Christodoulou Constantinou Kyriakou Panayiotou Neofytou Efthymiou Savva" },
  ISR: { first: 'Itay Omer Eran Dor Yonatan Liel Shon Ido Gadi Tomer Roy Eli', last: "Cohen Levi Mizrahi Peretz Biton Dahan Friedman Azoulay Katz Avraham Gabay Shalom" },
  BUL: { first: 'Georgi Ivan Dimitar Nikolay Martin Petar Stoyan Kristiyan Aleksandar Todor', last: "Ivanov Georgiev Dimitrov Petrov Nikolov Hristov Stoyanov Todorov Iliev Atanasov Kolev Popov" },
  ARM: { first: 'Aram Davit Gor Hovhannes Narek Tigran Artur Vahe Karen Edgar', last: "Hovhannisyan Harutyunyan Grigoryan Petrosyan Sargsyan Khachatryan Ghazaryan Avetisyan Karapetyan Mkrtchyan" },
  SUI: { first: 'Luca Noah Nico Fabian Silvan Joel Remo Dario Yannick Cédric Michel Kevin', last: "Müller Meier Schmid Keller Weber Huber Steiner Fischer Gerber Brunner Baumann Frei Zürcher Moser" },
  GIB: { first: 'Liam Kyle Jayce Ethan Tjay Lee Roy Aaron', last: "Santos Garcia Olivero Chipolina Lopez Bosio Torrilla Pons" },
  KAZ: { first: 'Arman Askhat Daniyar Islam Nurbol Ruslan Timur Yerlan Bauyrzhan Abzal', last: "Abdrakhmanov Akhmetov Bekov Dzhumabekov Iskakov Kenzhebekov Nurlanov Sadykov Tulegenov Zhaksylykov" },
  ROU: { first: 'Alexandru Andrei Bogdan Cristian Denis Florin Ionuț Mihai Răzvan Ștefan Vlad Darius', last: "Popescu Ionescu Dumitru Stan Stoica Gheorghe Matei Ciobanu Constantin Moldovan Rusu Marin Lazăr Munteanu" },
  AND: { first: 'Marc Jordi Pau Albert Èric Joan Aleix Ricard', last: "Vilà Martínez Rebés Llovera Clemente Pujol García Cervós" },
  ALB: { first: 'Arbër Elseid Ermir Kristjan Myrto Armando Endri Klaus Ledian Nedim', last: "Hoxha Shala Krasniqi Gashi Berisha Dervishi Kola Hysaj Leka Muçi" },
  FRO: { first: 'Brandur Gunnar Jóannes Hallur Sølvi Rógvi Heini Árni', last: "Hansen Joensen Olsen Jacobsen Petersen Poulsen Danielsen Mortensen" },
  MDA: { first: 'Ion Vadim Artur Victor Sergiu Mihail Nicolae Dan Andrei Alexandru', last: "Rusu Ceban Cebotari Ciobanu Roșca Lungu Munteanu Bodiu Postolachi Ionița" },
  KOS: { first: 'Arbnor Bersant Edon Florent Leart Vedat Mërgim Amir Fidan Lirim', last: "Krasniqi Berisha Gashi Hasani Shala Muriqi Rashica Zeneli Bytyqi Hadergjonaj" },
  EST: { first: 'Karl Martin Rasmus Markus Mattias Henri Joonas Kristjan Rauno Ragnar', last: "Tamm Saar Sepp Mägi Kask Kukk Rebane Ilves Pärn Koppel" },
  LIE: { first: 'Marco Nicolas Jens Andreas Simon Livio Fabio Martin', last: "Frick Büchel Hasler Kaiser Wolfinger Marxer Ospelt Beck" },
  MLT: { first: 'Luke Jean Kurt Zach Ryan Jake Matthew Paul', last: "Borg Camilleri Vella Farrugia Zammit Galea Micallef Grech Attard Mifsud" },
  LUX: { first: 'Laurent Gerson Leandro Vincent Dirk Olivier Mathias Danel', last: "Schmit Muller Weber Hoffmann Wagner Thill Reuter Kremer Barreiro Jans" },
  // Ameryka Południowa, Afryka, Bliski Wschód: pula zawodników z zagranicy na rynku (src/career/foreignPool.js)
  URU: { first: 'Agustín Diego Facundo Federico Gastón Joaquín Mathías Nicolás Rodrigo Santiago Sebastián Valentín', last: 'Acosta Álvarez Cabrera Cardozo Correa Díaz Fernández Ferreira Martínez Méndez Olivera Pereira Rodríguez Silva Sosa Suárez' },
  ECU: { first: 'Anderson Bryan Byron Carlos Cristian Jefferson Jhon José Kevin Pervis Romario Wilmer', last: 'Arboleda Caicedo Cortez Estupiñán Hurtado Mina Montaño Preciado Quiñónez Valencia Vera Zambrano' },
  PAR: { first: 'Alexis Ángel Antonio Blas Derlis Diego Gustavo Hernán Julio Óscar Ramón Richard', last: 'Alderete Almirón Benítez Cáceres Duarte Giménez González Ortiz Riveros Romero Samudio Villalba' },
  VEN: { first: 'Alexander Daniel Eduardo Jefferson Josef Luis Miguel Rafael Ronald Salomón Tomás Yangel', last: 'Aristeguieta Casseres Herrera Machís Martínez Moreno Osorio Rincón Rondón Savarino Soteldo Villanueva' },
  CHI: { first: 'Alexis Benjamín Bruno Claudio Diego Felipe Ignacio Marcelo Matías Nicolás Rodrigo Vicente', last: 'Aránguiz Araya Bravo Castillo Contreras Fuenzalida Muñoz Pavez Reyes Rojas Soto Vargas' },
  PER: { first: 'André Christian Edison Gianluca Jesús Luis Marcos Miguel Paolo Piero Renato Yoshimar', last: 'Advíncula Aquino Cartagena Flores Guerrero López Peña Quispe Ramos Tapia Trauco Zambrano' },
  MAR: { first: 'Achraf Adam Amine Anas Ayoub Bilal Hakim Ilias Mehdi Nayef Oussama Yassine Youssef', last: 'Aguerd Amrabat Benali Boufal Bounou El_Idrissi El_Khannouss Ezzalzouli Hakimi Mazraoui Ounahi Saiss Zouhair' },
  ALG: { first: 'Adam Amine Farès Houssem Ismaël Karim Mehdi Mohamed Nabil Rafik Ramy Riyad Yacine', last: 'Atal Belaïli Bennacer Bensebaini Benrahma Boudaoui Brahimi Chaïbi Feghouli Gouiri Mahrez Mandi Zerrouki' },
  TUN: { first: 'Ali Aïssa Anis Ellyes Hannibal Mohamed Montassar Naïm Seifeddine Wahbi Yassine Youssef', last: 'Ben_Romdhane Ben_Slimane Dahmen Drager Jaziri Khazri Laïdouni Maaloul Mejbri Msakni Skhiri Talbi' },
  MLI: { first: 'Abdoulaye Amadou Boubacar Cheick Djibril Hamari Ibrahima Kalifa Mamadou Moussa Yves', last: 'Bissouma Camara Coulibaly Diaby Diarra Doucouré Haïdara Koné Samassékou Sangaré Touré Traoré' },
  GUI: { first: 'Abdoulaye Alhassane Amadou Ibrahima Ilaix Mohamed Morlaye Naby Serhou Seydouba', last: 'Bah Bangoura Camara Cissé Conté Diallo Guirassy Keïta Kouyaté Soumah Sylla Touré' },
  COD: { first: 'Arthur Cédric Chancel Dieumerci Gaël Jonathan Meschack Samuel Silas Théo Yoane', last: 'Bakambu Bolasie Elia Kakuta Kayembe Masuaku Mbemba Mbuku Moutoussamy Tuanzebe Wissa Mukau' },
  LBN: { first: 'Ali Bassel Hassan Hussein Joan Karim Mohamad Nader Rabih Soony Walid', last: 'Atwi Ayass Daher El_Helwe Haidar Hammoud Kdouh Maatouk Melki Saad Tneich Zein' },
  JOR: { first: 'Ahmad Anas Baha Ehsan Ibrahim Musa Mahmoud Nizar Saleem Yazan Yousef', last: 'Al-Arab Al-Mardi Al-Naimat Al-Rawabdeh Al-Taamari Haddad Nasib Olwan Saadeh Samir Sharara' },
  IRQ: { first: 'Aimar Ali Amjad Bashar Hussein Ibrahim Mohanad Osama Saad Zidane', last: 'Adnan Al-Hamadi Attwan Bayesh Hadi Jassim Natiq Rashid Resan Tariq Yousif' },
  SYR: { first: 'Ahmad Amro Fahd Ibrahim Mahmoud Mardik Mohammad Omar Pablo Simon', last: 'Al-Khatib Al-Mawas Al-Somah Hamdan Kharbin Midani Oussou Sabbagh Shibli Youssef' },
};

export const NATIONALITIES = Object.keys(POOLS);

const cache = {};
function pool(code) {
  if (!cache[code]) {
    const p = POOLS[code] || POOLS.POL;
    // Nazwiska wielowyrazowe zapisane z podkreśleniem (np. van_Dijk), żeby nie rozpadły się przy podziale
    const words = (str) => str.split(' ').map((w) => w.replace(/_/g, ' '));
    cache[code] = { first: words(p.first), last: words(p.last) };
  }
  return cache[code];
}

/** Fikcyjne imię i nazwisko dla narodowości. */
export function randomName(code, rng) {
  const p = pool(code);
  return { first: rng.pick(p.first), last: rng.pick(p.last) };
}

// Rozkład narodowości obcokrajowców w lidze (ekspert 2.2), regiony rozbite na kraje. [SZAC]
const REGIONS = {
  balkany: ['CRO', 'SRB', 'SVN', 'BIH', 'MKD', 'MNE'],
  zachod: ['NED', 'BEL', 'GER', 'AUT', 'FRA'],
  afryka: ['NGA', 'GHA', 'CMR', 'SEN', 'CIV'],
  amerykaPd: ['BRA', 'ARG', 'COL'],
  skandynawia: ['SWE', 'NOR', 'DEN', 'FIN', 'ISL'],
  baltyk: ['LTU', 'LVA', 'BLR'],
};

export const FOREIGN_MIX = {
  1: { POL: 0.52, balkany: 0.096, ESP: 0.048, POR: 0.043, SVK: 0.038, zachod: 0.043, afryka: 0.043, amerykaPd: 0.034, UKR: 0.029, skandynawia: 0.029, CZE: 0.019, GEO: 0.019, baltyk: 0.019, inne: 0.02 },
  2: { POL: 0.78, UKR: 0.044, SVK: 0.033, ESP: 0.033, balkany: 0.033, afryka: 0.026, CZE: 0.018, baltyk: 0.018, inne: 0.015 },
  3: { POL: 0.92, UKR: 0.032, baltyk: 0.016, SVK: 0.008, CZE: 0.008, inne: 0.016 },
  4: { POL: 0.96, UKR: 0.025, baltyk: 0.008, inne: 0.007 }, // III liga [SZAC]
};

/** Losuje narodowość zawodnika polskiego klubu wg ligi. */
export function pickNationality(tier, rng) {
  const mix = FOREIGN_MIX[tier] || FOREIGN_MIX[1];
  const key = rng.weighted(Object.keys(mix), (k) => mix[k]);
  if (REGIONS[key]) return rng.pick(REGIONS[key]);
  if (key === 'inne') return rng.pick(['GEO', 'POR', 'BRA', 'SWE', 'LTU', 'NED']);
  return key;
}

export const NAT_NAMES = {
  POL: 'Polska', ESP: 'Hiszpania', POR: 'Portugalia', CRO: 'Chorwacja', SRB: 'Serbia', SVN: 'Słowenia', BIH: 'Bośnia i Hercegowina',
  MKD: 'Macedonia Północna', MNE: 'Czarnogóra', SVK: 'Słowacja', CZE: 'Czechy', UKR: 'Ukraina', BLR: 'Białoruś', LTU: 'Litwa',
  LVA: 'Łotwa', GEO: 'Gruzja', NED: 'Holandia', BEL: 'Belgia', GER: 'Niemcy', AUT: 'Austria', FRA: 'Francja', NGA: 'Nigeria',
  GHA: 'Ghana', CMR: 'Kamerun', SEN: 'Senegal', CIV: 'Wybrzeże Kości Słoniowej', BRA: 'Brazylia', ARG: 'Argentyna',
  COL: 'Kolumbia', SWE: 'Szwecja', NOR: 'Norwegia', DEN: 'Dania', FIN: 'Finlandia', ISL: 'Islandia',
  ENG: 'Anglia', SCO: 'Szkocja', WAL: 'Walia', NIR: 'Irlandia Północna', IRL: 'Irlandia', ITA: 'Włochy', TUR: 'Turcja', GRE: 'Grecja', AZE: 'Azerbejdżan', HUN: 'Węgry', CYP: 'Cypr', ISR: 'Izrael', BUL: 'Bułgaria', ARM: 'Armenia', SUI: 'Szwajcaria', GIB: 'Gibraltar', KAZ: 'Kazachstan', ROU: 'Rumunia', AND: 'Andora', ALB: 'Albania', FRO: 'Wyspy Owcze', MDA: 'Mołdawia', KOS: 'Kosowo', EST: 'Estonia', LIE: 'Liechtenstein', MLT: 'Malta', LUX: 'Luksemburg',
  URU: 'Urugwaj', ECU: 'Ekwador', PAR: 'Paragwaj', VEN: 'Wenezuela', CHI: 'Chile', PER: 'Peru', MAR: 'Maroko', ALG: 'Algieria', TUN: 'Tunezja', MLI: 'Mali', GUI: 'Gwinea', COD: 'DR Konga', LBN: 'Liban', JOR: 'Jordania', IRQ: 'Irak', SYR: 'Syria',
};

// Pozostałe reprezentacje FIFA (Nov 18, 2026): edytor tworzy zawodników z całego świata. Kraje bez puli imion
// losują imiona z puli polskiej (randomName), a gracz wpisuje imię i nazwisko sam.
const NAT_MORE = {
  RUS: 'Rosja', SMR: 'San Marino',
  // AFC
  AFG: 'Afganistan', AUS: 'Australia', BHR: 'Bahrajn', BAN: 'Bangladesz', BHU: 'Bhutan', BRU: 'Brunei', CAM: 'Kambodża', CHN: 'Chiny',
  TPE: 'Chińskie Tajpej', GUM: 'Guam', HKG: 'Hongkong', IND: 'Indie', IDN: 'Indonezja', IRN: 'Iran', JPN: 'Japonia', KUW: 'Kuwejt',
  KGZ: 'Kirgistan', LAO: 'Laos', MAC: 'Makau', MAS: 'Malezja', MDV: 'Malediwy', MNG: 'Mongolia', MYA: 'Mjanma', NEP: 'Nepal',
  PRK: 'Korea Północna', OMA: 'Oman', PAK: 'Pakistan', PLE: 'Palestyna', PHI: 'Filipiny', QAT: 'Katar', KSA: 'Arabia Saudyjska',
  SIN: 'Singapur', KOR: 'Korea Południowa', SRI: 'Sri Lanka', TJK: 'Tadżykistan', THA: 'Tajlandia', TLS: 'Timor Wschodni',
  TKM: 'Turkmenistan', UAE: 'Zjednoczone Emiraty Arabskie', UZB: 'Uzbekistan', VIE: 'Wietnam', YEM: 'Jemen',
  // CAF
  ANG: 'Angola', BEN: 'Benin', BOT: 'Botswana', BFA: 'Burkina Faso', BDI: 'Burundi', CPV: 'Republika Zielonego Przylądka',
  CTA: 'Republika Środkowoafrykańska', CHA: 'Czad', COM: 'Komory', CGO: 'Kongo', DJI: 'Dżibuti', EGY: 'Egipt', EQG: 'Gwinea Równikowa',
  ERI: 'Erytrea', SWZ: 'Eswatini', ETH: 'Etiopia', GAB: 'Gabon', GAM: 'Gambia', GNB: 'Gwinea Bissau', KEN: 'Kenia', LES: 'Lesotho',
  LBR: 'Liberia', LBY: 'Libia', MAD: 'Madagaskar', MWI: 'Malawi', MTN: 'Mauretania', MRI: 'Mauritius', MOZ: 'Mozambik', NAM: 'Namibia',
  NIG: 'Niger', RWA: 'Rwanda', STP: 'Wyspy Świętego Tomasza i Książęca', SEY: 'Seszele', SLE: 'Sierra Leone', SOM: 'Somalia',
  RSA: 'Republika Południowej Afryki', SSD: 'Sudan Południowy', SDN: 'Sudan', TAN: 'Tanzania', TOG: 'Togo', UGA: 'Uganda',
  ZAM: 'Zambia', ZIM: 'Zimbabwe',
  // CONCACAF
  AIA: 'Anguilla', ATG: 'Antigua i Barbuda', ARU: 'Aruba', BAH: 'Bahamy', BRB: 'Barbados', BLZ: 'Belize', BER: 'Bermudy',
  VGB: 'Brytyjskie Wyspy Dziewicze', CAN: 'Kanada', CAY: 'Kajmany', CRC: 'Kostaryka', CUB: 'Kuba', CUW: 'Curaçao', DMA: 'Dominika',
  DOM: 'Dominikana', SLV: 'Salwador', GRN: 'Grenada', GUA: 'Gwatemala', GUY: 'Gujana', HAI: 'Haiti', HON: 'Honduras', JAM: 'Jamajka',
  MEX: 'Meksyk', MSR: 'Montserrat', NCA: 'Nikaragua', PAN: 'Panama', PUR: 'Portoryko', SKN: 'Saint Kitts i Nevis', LCA: 'Saint Lucia',
  VIN: 'Saint Vincent i Grenadyny', SUR: 'Surinam', TRI: 'Trynidad i Tobago', TCA: 'Turks i Caicos', USA: 'Stany Zjednoczone',
  VIR: 'Wyspy Dziewicze Stanów Zjednoczonych',
  // CONMEBOL
  BOL: 'Boliwia',
  // OFC
  ASA: 'Samoa Amerykańskie', COK: 'Wyspy Cooka', FIJ: 'Fidżi', NZL: 'Nowa Zelandia', PNG: 'Papua-Nowa Gwinea', SAM: 'Samoa',
  SOL: 'Wyspy Salomona', TAH: 'Tahiti', TGA: 'Tonga', VAN: 'Vanuatu',
};
for (const [k, v] of Object.entries(NAT_MORE)) if (!NAT_NAMES[k]) NAT_NAMES[k] = v;

/** Federacje UEFA (Europa); pozostałe kody z NAT_NAMES to reszta świata. */
export const UEFA = new Set(['ALB', 'AND', 'ARM', 'AUT', 'AZE', 'BLR', 'BEL', 'BIH', 'BUL', 'CRO', 'CYP', 'CZE', 'DEN', 'ENG', 'EST', 'FRO',
  'FIN', 'FRA', 'GEO', 'GER', 'GIB', 'GRE', 'HUN', 'ISL', 'ISR', 'IRL', 'ITA', 'KAZ', 'KOS', 'LVA', 'LIE', 'LTU', 'LUX', 'MLT', 'MDA',
  'MNE', 'NED', 'MKD', 'NIR', 'NOR', 'POL', 'POR', 'ROU', 'RUS', 'SMR', 'SCO', 'SRB', 'SVK', 'SVN', 'ESP', 'SWE', 'SUI', 'TUR', 'UKR', 'WAL']);

export const EU = new Set(['POL', 'ESP', 'POR', 'CRO', 'SVN', 'SVK', 'CZE', 'LTU', 'LVA', 'NED', 'BEL', 'GER', 'AUT', 'FRA', 'SWE', 'DEN', 'FIN']);
