// Pule imion i nazwisk według narodowości. Zawodnicy są fikcyjni: imię i nazwisko losowane osobno.
// Format: kod kraju -> { first, last } jako napisy rozdzielone spacją (oszczędność miejsca).

const POOLS = {
  POL: {
    first: 'Adam Adrian Aleksander Antoni Arkadiusz Artur Bartłomiej Bartosz Błażej Damian Daniel Dariusz Dawid Dominik Filip Grzegorz Hubert Igor Jakub Jan Jarosław Jędrzej Kacper Kamil Karol Konrad Krystian Krzysztof Łukasz Maciej Marcel Marcin Marek Mariusz Mateusz Michał Mikołaj Miłosz Nikodem Norbert Oliwer Oskar Patryk Paweł Piotr Przemysław Radosław Rafał Robert Sebastian Szymon Tobiasz Tomasz Wiktor Wojciech Zbigniew',
    last: 'Adamczyk Bąk Bednarek Bielecki Błaszczyk Borowiec Brzozowski Chmiel Cichocki Czarnecki Dąbek Dudziak Dziedzic Fijałkowski Gajewski Gołąb Grabowski Grzelak Jabłoński Jagiełło Jakubiak Janik Jaros Kaczmarek Kalinowski Kamiński Kępa Kłos Kmieć Kołodziej Kowalczyk Kozieł Krajewski Kruk Kubiak Kurek Lasota Leśniak Lis Majewski Malinowski Marciniak Mazurek Michalak Mikulski Mróz Nawrocki Nowicki Olszewski Orzeł Ostrowski Pawlak Pietrzak Piątek Pluta Polak Radomski Rogalski Rutkowski Sadowski Sawicki Sikora Skiba Sobczak Sowa Stępień Szczepański Szewczyk Szulc Szymczak Tomczyk Urban Walczak Wawrzyniak Wieczorek Wilk Witkowski Wójcik Wróbel Zając Zawadzki Zieliński Żak Żurek',
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
  NED: { first: 'Bram Daan Jesse Lars Milan Niels Ruben Sem Thijs', last: 'Bakker de Boer de Vries Janssen Meijer Smit van Dijk Visser' },
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
};

export const NATIONALITIES = Object.keys(POOLS);

const cache = {};
function pool(code) {
  if (!cache[code]) {
    const p = POOLS[code] || POOLS.POL;
    cache[code] = { first: p.first.split(' '), last: p.last.split(' ') };
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
};

export const EU = new Set(['POL', 'ESP', 'POR', 'CRO', 'SVN', 'SVK', 'CZE', 'LTU', 'LVA', 'NED', 'BEL', 'GER', 'AUT', 'FRA', 'SWE', 'DEN', 'FIN']);
