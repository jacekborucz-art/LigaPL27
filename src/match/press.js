// Konferencja prasowa po meczu: klimat w mediach (agresywna, neutralna, pozytywna), sala z nazwanymi
// dziennikarzami fikcyjnych redakcji, słowo wstępne, pytania zależne od sytuacji, dopytania, tony odpowiedzi,
// pamięć prasy (obietnice, unikanie mediów) i presja na morale drużyny, także gdy trener pominie konferencję.
//
// Zasady (jak w briefings.js): czyste funkcje, wynik to nowe obiekty, losowość tylko z ziarna.
// Gracz nie widzi liczb: skutki opisuje effectWords(). Opis i uzasadnienie: docs/konferencja-prasowa.md.
// Wartości balansowe oznaczone [SZAC].

import { Rng, clamp } from '../core/rng.js';
import { PASSIVE } from '../training/scouting.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// ================================================================ Klimat

export const CLIMATES = {
  agresywna: {
    label: 'Prasa agresywna', short: 'Agresywna',
    mood: 'Na sali gorąco. Dziennikarze szukają winnych i mocnych słów.',
    skip: 'Jeśli pominiesz konferencję, krytyka trafi do szatni bez twojej odpowiedzi, a media napiszą, że unikasz pytań.',
    base: -0.8, // [SZAC] bazowa presja na morale kadry (skala 1-20)
  },
  neutralna: {
    label: 'Prasa neutralna', short: 'Neutralna',
    mood: 'Spokojna sala. Pytania o mecz, skład i kolejne cele.',
    skip: 'Jeśli pominiesz konferencję, na salę pójdzie asystent. Media odnotują twoją nieobecność.',
    base: 0,
  },
  pozytywna: {
    label: 'Prasa pozytywna', short: 'Pozytywna',
    mood: 'Życzliwa atmosfera. Media kibicują drużynie i chcą usłyszeć trenera.',
    skip: 'Jeśli pominiesz konferencję, dobre artykuły i tak się ukażą, ale bez twoich słów podbudują szatnię słabiej.',
    base: 0.4, // [SZAC]
  },
};
export const CLIMATE_IDS = Object.keys(CLIMATES);

// Limity łącznych skutków jednej konferencji [SZAC]
export const PRESS_LIMITS = { teamMorale: [-1.5, 0.7], board: [-5, 4], fans: [-6, 6], media: [-10, 8], player: [-2, 1.5] };
// Konferencja przedmeczowa: mniejszy wpływ (zapowiedź, nie recenzja meczu) [SZAC]
export const PRESS_LIMITS_PRE = { teamMorale: [-0.8, 0.4], board: [-3, 3], fans: [-4, 4], media: [-8, 6] };

/** Stan prasy w grze (leniwie: stare zapisy nie mają tego pola). */
export function pressState(game) {
  const p = game.press && typeof game.press === 'object' ? game.press : {};
  game.press = {
    v: 1,
    climate: CLIMATES[p.climate] ? p.climate : 'neutralna',
    left: Number.isFinite(p.left) ? p.left : 0,
    streak: Number.isFinite(p.streak) ? p.streak : 0,
    relation: Number.isFinite(p.relation) ? p.relation : 50,
    promises: Array.isArray(p.promises) ? p.promises : [],
    last: p.last ?? null,
    log: Array.isArray(p.log) ? p.log : [],
    pre: p.pre ?? null,
    preLog: Array.isArray(p.preLog) ? p.preLog : [],
    cases: Array.isArray(p.cases) ? p.cases : [], // sprawy dyscyplinarne czekające na decyzję
    discipline: Array.isArray(p.discipline) ? p.discipline : [], // decyzje (upomnienia, kary) do recydywy
  };
  return game.press;
}

/**
 * Wynik meczu i kontekst klubu w liczbach (bez losowania). Zwraca listę składników z opisem.
 * ctx: patrz pressCtx w matchday.js.
 */
export function climateFactors(ctx, state = {}) {
  const f = [];
  const add = (v, text) => { if (Math.abs(v) >= 0.05) f.push({ v: r2(v), text }); };
  const d = ctx.pts == null ? 0 : ctx.pts - (ctx.expPts ?? 1.2); // przed meczem: bez wyniku
  if (ctx.pts != null) add(1.6 * d, d >= 0.8 ? 'Wynik ponad oczekiwania' : d > 0 ? 'Wynik zgodny z oczekiwaniami' : d <= -1.5 ? 'Porażka z teoretycznie słabszym rywalem' : 'Wynik poniżej oczekiwań');
  const l5 = ctx.last5 ?? [];
  const w = l5.filter((x) => x === 'W').length; const l = l5.filter((x) => x === 'P').length;
  add(0.5 * (w - l), w - l >= 2 ? `${w} ${plural(w, 'zwycięstwo', 'zwycięstwa', 'zwycięstw')} w ostatnich ${l5.length} meczach` : l - w >= 2 ? `${l} ${plural(l, 'porażka', 'porażki', 'porażek')} w ostatnich ${l5.length} meczach`
    : w > l ? 'Więcej zwycięstw niż porażek w ostatnich meczach' : 'Więcej porażek niż zwycięstw w ostatnich meczach');
  if (ctx.position && ctx.goalTarget && (ctx.roundsPlayed ?? 0) >= 5) {
    const gap = ctx.goalTarget - ctx.position;
    add(clamp(gap * 0.25, -2, 1.5), gap >= 0 ? 'Drużyna realizuje cel zarządu' : 'Drużyna poniżej celu zarządu');
  }
  const pr = ctx.prestige ?? 5;
  if (pr > 6) add(-(pr - 6) * 0.3, 'Wielki klub, wielkie oczekiwania');
  else if (pr <= 4) add(0.3, 'Media lubią mniejsze kluby');
  if (ctx.redUser) add(-0.5, `Czerwona kartka: ${ctx.redUser.name}`);
  if ((ctx.boardTrust ?? 60) < 35) add(-1, 'Zarząd traci cierpliwość');
  if ((ctx.fansMood ?? 55) < 35) add(-0.8, 'Kibice są wściekli');
  const rel = state.relation ?? 50;
  add((rel - 50) / 15, rel >= 50 ? 'Dobre relacje trenera z dziennikarzami' : 'Napięte relacje trenera z dziennikarzami');
  if (state.last?.mode === 'skipped') add(-1, 'Media pamiętają, że ominąłeś ostatnią konferencję');
  if (state.last?.mode === 'walkout') add(-1.5, 'Media pamiętają, że wyszedłeś z ostatniej konferencji');
  const sum = f.reduce((s, x) => s + x.v, 0);
  return { factors: f, score: r2(ctx.derby ? sum * 1.3 : sum) };
}

/**
 * Klimat prasy po meczu: kontekst daje wagi, ziarno wybiera (deterministycznie).
 * Narracja: dopóki state.left > 0, obecny klimat dostaje +0,3 do wagi. [SZAC]
 */
export function pickClimate(ctx, state = {}, seed = 'prasa') {
  const { factors, score } = climateFactors(ctx, state);
  const pAgr = clamp(0.28 - 0.09 * score, 0.04, 0.88);
  const pPos = clamp(0.28 + 0.09 * score, 0.04, 0.88);
  const weights = { agresywna: pAgr, pozytywna: pPos, neutralna: Math.max(0.12, 1 - pAgr - pPos) };
  const inertia = (state.left ?? 0) > 0 && CLIMATES[state.climate];
  if (inertia) weights[state.climate] += 0.3;
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  const probs = Object.fromEntries(CLIMATE_IDS.map((k) => [k, r2(weights[k] / total)]));
  const climate = new Rng(`${seed}|klimat`).weighted(CLIMATE_IDS, (k) => weights[k]);
  const sign = climate === 'agresywna' ? -1 : climate === 'pozytywna' ? 1 : 0;
  let reasons = sign ? factors.filter((x) => Math.sign(x.v) === sign).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 2).map((x) => x.text)
    : [score <= -1 ? 'Wynik dał powody do krytyki, ale media wstrzymują się z oceną' : score >= 1 ? 'Dobry wynik, ale media nie dają się porwać' : 'Bez wielkich emocji wokół klubu'];
  if (ctx.derby) reasons = ['Derby podgrzały atmosferę', ...reasons].slice(0, 3);
  if (inertia && state.climate === climate && (state.streak ?? 0) >= 1) reasons.push(`Ta narracja trwa od ${state.streak + 1} ${plural(state.streak + 1, 'meczu', 'meczów', 'meczów')}`);
  if (!reasons.length) reasons.push(sign < 0 ? 'Media zawsze znajdą temat' : sign > 0 ? 'Media są w dobrym nastroju' : 'Bez wielkich emocji wokół klubu');
  return { climate, score, probs, reasons, factors };
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10; const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

// ================================================================ Sala: redakcje i dziennikarze (fikcyjne)

export const OUTLETS = {
  dziennik: { name: 'Przegląd Ligowy', kind: 'dziennik ogólnopolski' },
  portal: { name: 'PoGwizdku.pl', kind: 'portal' },
  tabloid: { name: 'Sensacje Dnia', kind: 'tabloid' },
  kanal: { name: 'Kanał Trybuna', kind: 'kanał internetowy' },
  tygodnik: { name: 'Tygodnik Futbol', kind: 'tygodnik' },
  lokalne: { name: 'Kurier Sportowy', kind: 'media lokalne' },
  klubowa: { name: 'Klubowa telewizja', kind: 'telewizja klubu' },
};
const ROOMS = {
  agresywna: ['tabloid', 'kanal', 'portal', 'dziennik', 'lokalne'],
  neutralna: ['dziennik', 'lokalne', 'portal', 'tygodnik'],
  pozytywna: ['lokalne', 'klubowa', 'dziennik', 'portal'],
};
const CITY = {
  warszawa: 'Warszawa', poznan: 'Poznań', czestochowa: 'Częstochowa', bialystok: 'Białystok', lodz: 'Łódź', szczecin: 'Szczecin',
  krakow: 'Kraków', slask: 'Śląsk', wroclaw: 'Wrocław', 'dolny-slask': 'Dolny Śląsk', lublin: 'Lublin', kielce: 'Kielce', radom: 'Radom',
  plock: 'Płock', trojmiasto: 'Trójmiasto', podkarpacie: 'Podkarpacie', malopolska: 'Małopolska', rzeszow: 'Rzeszów', bielsko: 'Podbeskidzie',
  opole: 'Opole', mazowsze: 'Mazowsze', lodzkie: 'Ziemia Łódzka', bydgoszcz: 'Bydgoszcz', pomorze: 'Pomorze', kujawy: 'Kujawy',
  lubuskie: 'Lubuskie', wielkopolska: 'Wielkopolska',
};
// Imiona i nazwiska do losowania fikcyjnych dziennikarzy (nazwiska nieodmienne przez rodzaj)
const FIRST_F = ['Anna', 'Katarzyna', 'Marta', 'Agnieszka', 'Joanna', 'Dorota', 'Ewa', 'Karolina', 'Magdalena', 'Natalia', 'Monika', 'Aleksandra'];
const FIRST_M = ['Paweł', 'Tomasz', 'Michał', 'Piotr', 'Krzysztof', 'Łukasz', 'Jakub', 'Bartosz', 'Grzegorz', 'Marcin', 'Wojciech', 'Rafał', 'Adrian', 'Dariusz'];
const LAST = ['Wrona', 'Sikora', 'Kubiak', 'Pawlak', 'Sobczak', 'Zając', 'Krawczyk', 'Wilk', 'Kowal', 'Stelmach', 'Gil', 'Kasprzak', 'Michalak', 'Szulc', 'Kłos', 'Mazur', 'Ryba', 'Socha', 'Grzelak', 'Tomczyk', 'Olejnik', 'Wójcik', 'Kaczmarek', 'Jasiak', 'Bartczak', 'Domagała', 'Furman', 'Rosiak'];

function personFrom(rng) {
  const female = rng.chance(0.4);
  return { name: `${rng.pick(female ? FIRST_F : FIRST_M)} ${rng.pick(LAST)}`, female };
}

/** Dziennikarz redakcji: losowany raz na grę (lokalny i klubowy raz na klub), więc wraca co mecz. */
export function journalist(outletId, { gameSeed = 'gra', clubId = '', region = '' } = {}, salt = 0) {
  const local = outletId === 'lokalne' || outletId === 'klubowa';
  const p = personFrom(new Rng(`dziennikarz:${gameSeed}:${outletId}:${local ? clubId : ''}${salt ? `:${salt}` : ''}`));
  const o = OUTLETS[outletId];
  const outlet = outletId === 'lokalne' ? `${o.name} ${CITY[region] ?? 'Region'}` : o.name;
  return { id: outletId, name: p.name, female: p.female, outlet, kind: o.kind };
}

// ================================================================ Tony odpowiedzi

export const TONES = {
  spokojny: { label: 'Spokojnie', base: { media: 1, board: 1, fans: 0, morale: 0.1 }, loud: 0.5 },
  pewny: { label: 'Pewny siebie', base: { media: 0, board: 0, fans: 1, morale: 0.2 }, loud: 1.2 },
  dyplomatyczny: { label: 'Dyplomatycznie', base: { media: 1, board: 1, fans: 0, morale: 0 }, loud: 0.4 },
  konfrontacyjny: { label: 'Konfrontacyjnie', base: { media: -3, board: -1, fans: 1, morale: 0.1 }, loud: 3 },
  humor: { label: 'Z humorem', base: { media: 2, board: 0, fans: 0, morale: 0.1 }, loud: 1.5 },
  bezkomentarza: { label: 'Bez komentarza', base: { media: -2, board: 0, fans: 0, morale: 0 }, loud: 0.8 },
};
const NO_COMMENT = { tone: 'bezkomentarza', text: 'Bez komentarza.' };

// ================================================================ Pytania
// q: tekst neutralny albo { neu, agr, pos } (wariant wg klimatu). w(c): waga wyboru (0 = nie pasuje).
// by: preferowane redakcje. a(c): odpowiedzi { tone, text, fans, board, media, morale, player:{who, d},
// fine, promise, drop, follow, h:{agr, neu, pos} (nagłówek) }. sensitive: dodaje "Bez komentarza".
// Efekty odpowiedzi DOKŁADAJĄ się do bazy tonu. morale: cała drużyna (skala 1-20). [SZAC]

const ambition = (c) => (c.tier === 1 ? { text: 'mistrzostwo', target: 1 } : { text: 'awans', target: 2 });

const OPENING = {
  id: 'opening', officer: true,
  q: { neu: 'Panie trenerze, prosimy o krótki komentarz do meczu.' },
  a: (c) => (c.res === 'W' ? [
    { tone: 'spokojny', text: 'Gratuluję drużynie i dziękuję kibicom. Zrobiliśmy swoje, ale jutro wracamy do pracy.', morale: 0.2 },
    { tone: 'pewny', text: 'Byliśmy lepsi od pierwszej do ostatniej minuty i tak to wyglądało.', fans: 1, morale: 0.2, media: c.xgFor < c.xgAgainst ? -1 : 0 },
    { tone: 'dyplomatyczny', text: `Szacunek dla drużyny ${c.oppName}, postawiła trudne warunki. Cieszą trzy punkty.` },
  ] : c.res === 'R' ? [
    { tone: 'spokojny', text: 'Punkt szanujemy, ale wiemy, że stać nas na więcej.' },
    { tone: 'pewny', text: 'Mieliśmy ten mecz pod kontrolą. Zabrakło kropki nad i.', fans: 1 },
    { tone: 'dyplomatyczny', text: 'Remis jest sprawiedliwy. Obie drużyny miały swoje momenty.', fans: -1 },
  ] : [
    { tone: 'spokojny', text: 'Gratuluję rywalowi. Przeanalizujemy ten mecz na chłodno.' },
    { tone: 'pewny', text: 'Wynik nie oddaje tego, co działo się na boisku.', media: c.xgFor >= c.xgAgainst ? 0 : -2, morale: 0.3 },
    { tone: 'dyplomatyczny', text: 'Nie szukam wymówek. Zagraliśmy słabo i biorę to na siebie.', fans: 1, morale: 0.3 },
  ]),
};

const BANK = [
  {
    id: 'win-key', w: (c) => (c.res === 'W' && c.margin < 3 ? 4 : 0), by: ['dziennik', 'tygodnik', 'portal'],
    q: { neu: 'Co zadecydowało o zwycięstwie?', agr: 'Wygraliście, ale czy to była gra na miarę ambicji tego klubu?', pos: 'Kolejny dobry występ. Co zadecydowało o zwycięstwie?' },
    a: () => [
      { tone: 'spokojny', text: 'Cała drużyna wykonała plan. To zwycięstwo zespołu, nie jednego zawodnika.', morale: 0.2 },
      { tone: 'pewny', text: 'Taktyka zadziałała dokładnie tak, jak zakładaliśmy w tygodniu.', board: 1, morale: -0.2 },
      { tone: 'humor', text: 'Chyba kawa przed meczem była mocniejsza niż zwykle.' },
    ],
  },
  {
    id: 'win-big', w: (c) => (c.res === 'W' && c.margin >= 3 ? 6 : 0), by: ['portal', 'dziennik', 'lokalne'],
    q: { neu: 'Rozbiliście rywala. Czy to najlepszy mecz pod pana wodzą?', agr: 'Wysoka wygrana, tylko z kim? Czy to coś mówi o sile drużyny?' },
    a: (c) => [
      { tone: 'pewny', text: `Tak. I to dopiero początek. Gramy o ${ambition(c).text}.`, fans: 2, morale: 0.2, promise: 'season', h: { agr: '{coach} już mówi o: {ambition}', neu: '{coach}: „Gramy o {ambition}”' } },
      { tone: 'spokojny', text: 'Cieszymy się dziś wieczorem, a jutro wracamy do pracy.', board: 1 },
      { tone: 'humor', text: 'Nie mówcie tego głośno, bo zawodnicy zażądają podwyżek.' },
    ],
  },
  {
    id: 'win-lucky', w: (c) => (c.res === 'W' && c.xgFor < c.xgAgainst - 0.6 ? 5 : 0), by: ['tabloid', 'kanal', 'dziennik'],
    q: { neu: 'Rywal miał więcej sytuacji. Czy to zwycięstwo było szczęśliwe?', agr: 'Czy nie wstyd wygrać w takim stylu?', pos: 'Nie zawsze pięknie, ale skutecznie. Tak wygrywają mistrzowie?' },
    sensitive: true,
    a: () => [
      { tone: 'spokojny', text: 'Szczęściu trzeba pomóc. Punkty zostają u nas.' },
      { tone: 'konfrontacyjny', text: 'Tabela nie pyta o styl. Następne pytanie.', fans: 1, h: { agr: '{coach} zirytowany pytaniem o styl' } },
      { tone: 'dyplomatyczny', text: 'Mamy nad czym pracować i wiem o tym najlepiej.', board: 1 },
    ],
  },
  {
    id: 'draw', w: (c) => (c.res === 'R' ? 4 : 0), by: ['dziennik', 'lokalne', 'portal'],
    q: { neu: 'Remis to dobry czy zły wynik?', agr: 'Kolejne punkty uciekają. Kibice mają prawo być zaniepokojeni?', pos: 'Punkt w trudnym meczu. Jest pan zadowolony?' },
    a: () => [
      { tone: 'spokojny', text: 'Szanujemy ten punkt. W lidze każdy się liczy.', fans: -1 },
      { tone: 'pewny', text: 'Chcieliśmy więcej. Nie jestem zadowolony i drużyna też nie.', fans: 1, morale: -0.1 },
      { tone: 'humor', text: 'Remis to jak kawa bez cukru. Da się wypić, ale bez przyjemności.' },
    ],
  },
  {
    id: 'loss-why', w: (c) => (c.res === 'P' && c.margin > -3 ? 4 : 0), by: ['dziennik', 'portal', 'kanal'],
    q: { neu: 'Dlaczego drużyna przegrała?', agr: 'Czy ta drużyna ma w ogóle pomysł na grę?', pos: 'Mimo porażki gra momentami wyglądała dobrze. Czego zabrakło?' },
    a: () => [
      { tone: 'spokojny', text: 'Zabrakło skuteczności. Pracujemy dalej, nie panikujemy.', morale: 0.2 },
      { tone: 'dyplomatyczny', text: 'Zawiedliśmy wszyscy, zaczynając ode mnie.', fans: 2, morale: 0.4 },
      { tone: 'konfrontacyjny', text: 'Niektórzy zawodnicy nie dali dziś z siebie wszystkiego.', media: 2, morale: -0.8, follow: 'who-blame', h: { agr: '{coach} grzmi: nie wszyscy dali z siebie wszystko', neu: '{coach}: „Niektórzy nie dali z siebie wszystkiego”' } },
    ],
  },
  {
    id: 'who-blame', follow: true, by: [],
    q: { neu: 'Kogo konkretnie ma pan na myśli?' },
    a: (c) => [
      ...(c.worst ? [{ tone: 'konfrontacyjny', text: `${c.worst.name} wie, o kogo chodzi.`, media: 4, fans: 1, morale: -0.3, player: { who: 'worst', d: -1.5 }, h: { agr: '{coach} wskazał winnego: {worst}', neu: '{coach} krytykuje publicznie: {worst}', pos: '{coach} nie oszczędza: {worst}' } }] : []),
      { tone: 'dyplomatyczny', text: 'To zostanie w szatni.', media: -1, morale: 0.4 },
      { tone: 'spokojny', text: 'Nie wskazuję nazwisk. Odpowiadamy jako zespół.', morale: 0.5 },
    ],
  },
  {
    id: 'loss-heavy', w: (c) => (c.res === 'P' && c.margin <= -3 ? 8 : 0), by: ['tabloid', 'kanal', 'lokalne'],
    q: { neu: 'Taka porażka boli. Co powie pan kibicom?', agr: 'Drużyna {opp} ośmieszyła pana zespół. Czy przeprasza pan kibiców?', pos: 'Trudny wieczór. Jak podnieść drużynę po takim meczu?' },
    a: () => [
      { tone: 'spokojny', text: 'Przepraszam kibiców. To było poniżej naszego poziomu.', fans: 3, board: 1, morale: 0.2 },
      { tone: 'pewny', text: 'Jeden mecz nie przekreśla tego zespołu. Wrócimy silniejsi.', fans: -1, morale: 0.5 },
      { tone: 'konfrontacyjny', text: 'Nie będę się nikomu tłumaczył po jednym meczu.', fans: -2, h: { agr: '{coach} nie przeprasza. Kibice wściekli', neu: '{coach}: „Nie będę się tłumaczył”' } },
    ],
  },
  {
    id: 'loss-unlucky', w: (c) => (c.res === 'P' && c.xgFor >= c.xgAgainst + 0.7 ? 4 : 0), by: ['dziennik', 'tygodnik', 'lokalne'],
    q: { neu: 'Stworzyliście więcej sytuacji. To był pech?', agr: 'Znowu dużo sytuacji i zero punktów. To już nie pech, tylko problem?' },
    a: () => [
      { tone: 'spokojny', text: 'Tak wygląda piłka. Jeśli będziemy tak grać, punkty przyjdą.', morale: 0.3 },
      { tone: 'pewny', text: 'Byliśmy lepsi. Zawodnicy zasłużyli dziś na więcej.', morale: 0.4, fans: 1 },
      { tone: 'humor', text: 'Poproszę bramkarza rywala o numer do jego trenera.' },
    ],
  },
  {
    id: 'streak-loss', w: (c) => (c.lossStreak >= 3 ? 7 : 0), by: ['tabloid', 'dziennik', 'kanal'],
    q: { neu: 'To już {lossStreak}. porażka z rzędu. Jak przerwać tę serię?', agr: 'To już {lossStreak}. porażka z rzędu. Czy szatnia jeszcze pana słucha?' },
    sensitive: true,
    a: () => [
      { tone: 'pewny', text: 'Ta drużyna się podniesie. Ręczę za nią.', morale: 0.5 },
      { tone: 'spokojny', text: 'Ciężką pracą na treningach. Nie ma innej drogi.' },
      { tone: 'konfrontacyjny', text: 'Potrzebujemy wzmocnień. Mówię to od dawna.', board: -2, morale: -0.4, h: { agr: '{coach} uderza w zarząd: potrzebujemy wzmocnień', neu: '{coach} domaga się wzmocnień' } },
    ],
  },
  {
    id: 'streak-win', w: (c) => (c.winStreak >= 3 ? 5 : 0), by: ['portal', 'dziennik', 'lokalne', 'klubowa'],
    q: { neu: '{winStreak} zwycięstw z rzędu. Gdzie jest sufit tej drużyny?', agr: '{winStreak} zwycięstw z rzędu. Nie boi się pan, że drużyna odleci?' },
    a: (c) => [
      { tone: 'pewny', text: `Gramy o ${ambition(c).text}. Nie będę udawał, że jest inaczej.`, fans: 3, board: 1, promise: 'season', h: { neu: '{coach}: „Gramy o {ambition}”', agr: '{coach} zapowiada {ambition}. Odważnie' } },
      { tone: 'spokojny', text: 'Nie patrzę na serie. Myślę tylko o kolejnym meczu.', morale: 0.2 },
      { tone: 'humor', text: 'Sufit? Na razie nie widzę nawet żyrandola.' },
    ],
  },
  {
    id: 'derby', w: (c) => (c.derby ? 8 : 0), by: ['lokalne', 'tabloid', 'portal'],
    q: (c) => (c.res === 'W' ? { neu: 'Co dla pana znaczy wygranie derbów?', pos: 'Miasto świętuje. Co pan powie kibicom po derbach?' }
      : c.res === 'P' ? { neu: 'Przegrane derby. Jak spojrzy pan kibicom w oczy?', agr: 'Przegrane derby. Czy po takim meczu można jeszcze wyjść na miasto?' }
        : { neu: 'Remis w derbach: niedosyt czy ulga?' }),
    a: (c) => (c.res === 'W' ? [
      { tone: 'pewny', text: 'Miasto ma jednego gospodarza.', fans: 4, board: -1, morale: 0.3, h: { neu: '{coach}: „Miasto ma jednego gospodarza”', agr: '{coach} prowokuje rywala zza miedzy' } },
      { tone: 'spokojny', text: 'To mecz dla kibiców. Zostawiliśmy na boisku wszystko.', fans: 2 },
      { tone: 'dyplomatyczny', text: 'To tylko trzy punkty, jak w każdym meczu.', fans: -3 },
    ] : [
      { tone: 'spokojny', text: 'Przepraszamy kibiców. Wiemy, ile znaczą derby.', fans: 2 },
      { tone: 'pewny', text: 'Rewanż będzie nasz. Mówię to kibicom wprost.', fans: 2, morale: 0.2 },
      { tone: 'dyplomatyczny', text: 'Derby to nie wszystko. Sezon trwa.', fans: -3 },
    ]),
  },
  {
    id: 'referee', w: (c) => (c.controversy ? (c.againstUs ? 6 : 3) : 0), by: ['kanal', 'portal', 'tabloid'],
    q: { neu: 'Jak ocenia pan pracę sędziego {ref}?', agr: 'Czy sędzia {ref} skrzywdził dziś pana drużynę?', pos: 'Sędziowie mieli dziś dużo pracy. Jak ocenia pan ich decyzje?' },
    sensitive: true,
    a: (c) => [
      { tone: 'dyplomatyczny', text: 'Nie komentuję pracy sędziów.' },
      ...(c.res !== 'W' ? [{ tone: 'konfrontacyjny', text: 'Te decyzje kosztowały nas punkty.', fans: 3, board: -1, morale: 0.3, ref: 1, follow: 'ref-bias', h: { agr: '{coach} atakuje sędziego!', neu: '{coach}: „Decyzje sędziego kosztowały nas punkty”', pos: '{coach} rozczarowany sędziowaniem' } }]
        : [{ tone: 'konfrontacyjny', text: 'Wygraliśmy mimo sędziego. To mówi wszystko.', fans: 2, board: -1, ref: 1, h: { agr: '{coach} drwi z sędziego', neu: '{coach}: „Wygraliśmy mimo sędziego”' } }]),
      { tone: 'humor', text: 'Może sędzia też miał dziś słabszy dzień. Jak my wszyscy.' },
    ],
  },
  {
    id: 'ref-bias', follow: true, by: [],
    q: { neu: 'Czyli uważa pan, że sędzia był stronniczy?' },
    a: () => [
      { tone: 'dyplomatyczny', text: 'Tego nie powiedziałem. Mówię o konkretnych decyzjach.', media: 1, board: 1, ref: -0.5 },
      { tone: 'konfrontacyjny', text: 'Niech każdy obejrzy powtórki i oceni sam.', fans: 2, board: -1, ref: 1, h: { agr: '{coach} nie odpuszcza sędziemu. Będzie kara?', neu: '{coach}: „Niech każdy obejrzy powtórki”' } },
      { tone: 'bezkomentarza', text: 'Powiedziałem, co miałem do powiedzenia.', media: 1 },
    ],
  },
  {
    id: 'red', w: (c) => (c.redUser ? 6 : 0), by: ['tabloid', 'dziennik', 'kanal'],
    q: { neu: '{red} osłabił drużynę czerwoną kartką. Rozmawiał pan z nim?', agr: '{red} zawalił mecz czerwoną kartką. Będą konsekwencje?' },
    sensitive: true,
    a: () => [
      { tone: 'spokojny', text: 'To się zdarza. Stoimy za nim, jest częścią zespołu.', morale: 0.2, player: { who: 'redUser', d: 0.6 } },
      { tone: 'konfrontacyjny', text: 'Zachował się nieodpowiedzialnie. Wyciągnę konsekwencje.', board: 2, fans: 1, media: 4, player: { who: 'redUser', d: -1.5 }, h: { agr: '{coach} zapowiada kary dla: {red}', neu: '{coach} krytykuje zachowanie: {red}' } },
      { tone: 'dyplomatyczny', text: 'Porozmawiamy w cztery oczy. To sprawa wewnętrzna.', media: -1, player: { who: 'redUser', d: 0.2 } },
    ],
  },
  {
    id: 'star', w: (c) => (c.star ? 3 : 0), by: ['lokalne', 'dziennik', 'klubowa', 'tygodnik'],
    q: { neu: 'Jak ocenia pan występ, jaki dał dziś {star}?', pos: '{star} był dziś najlepszy na boisku. To materiał na reprezentację?', agr: '{star} ciągnął grę sam. Gdzie byli pozostali?' },
    a: () => [
      { tone: 'pewny', text: 'Wybitny mecz. Selekcjoner powinien to oglądać.', fans: 1, player: { who: 'star', d: 1 }, h: { neu: '{coach}: „{star} zasłużył na kadrę”', pos: '{coach}: „{star} zasłużył na kadrę”' } },
      { tone: 'dyplomatyczny', text: 'Dobry mecz, ale nie wyróżniam pojedynczych zawodników.', morale: 0.2 },
      { tone: 'spokojny', text: 'Może grać jeszcze lepiej i dobrze o tym wie.', player: { who: 'star', d: -0.4 } },
    ],
  },
  {
    id: 'rumour', w: (c) => (c.rumour && c.rumourRoll ? 3 : 0), by: ['kanal', 'portal', 'tabloid'],
    q: { neu: 'Mówi się o zainteresowaniu, jakim kluby z zagranicy darzą zawodnika {rumour}. Odejdzie zimą?' },
    sensitive: true,
    a: () => [
      { tone: 'pewny', text: 'Nie jest na sprzedaż. Koniec tematu.', fans: 2, board: -1, player: { who: 'rumour', d: 0.4 }, h: { neu: '{coach}: „{rumour} nie jest na sprzedaż”', agr: '{coach} zamyka temat transferu, ale na jak długo?' } },
      { tone: 'dyplomatyczny', text: 'Każdy zawodnik ma swoją cenę. Decyzja należy do zarządu.', board: 1, fans: -1, player: { who: 'rumour', d: -0.8 } },
      { tone: 'humor', text: 'Jeśli ktoś zapłaci sto milionów, sam go zawiozę na lotnisko.', player: { who: 'rumour', d: -0.3 } },
    ],
  },
  {
    id: 'injury', w: (c) => (c.injured ? 3 : 0), by: ['lokalne', 'portal', 'klubowa'],
    q: { neu: '{inj} zszedł z urazem. Wiadomo już coś więcej?' },
    a: () => [
      { tone: 'spokojny', text: 'Czekamy na badania. Nie chcę spekulować.' },
      { tone: 'pewny', text: 'To twardy zawodnik. Szybko wróci.', player: { who: 'injured', d: 0.4 } },
      { tone: 'dyplomatyczny', text: 'Mamy szeroką kadrę. Ktoś go zastąpi.', board: 1, player: { who: 'injured', d: -0.4 } },
    ],
  },
  {
    id: 'job', w: (c) => ((c.boardTrust ?? 60) < 40 && c.res !== 'W' ? 7 : (c.boardTrust ?? 60) < 30 ? 4 : 0), by: ['tabloid', 'kanal', 'dziennik'],
    q: { neu: 'Czy pana posada jest zagrożona?', agr: 'Czy to pana ostatnie dni w tym klubie?', pos: 'Zarząd mówi o spokoju wokół drużyny. Czuje pan zaufanie?' },
    sensitive: true,
    a: () => [
      { tone: 'spokojny', text: 'Biorę pełną odpowiedzialność i wierzę w ten zespół.', board: 1, morale: 0.3 },
      { tone: 'pewny', text: 'W następnym meczu wygramy. Zobaczycie.', fans: 1, morale: 0.3, promise: 'winNext', h: { neu: '{coach} obiecuje zwycięstwo w kolejnym meczu', agr: '{coach} gra va banque: „Wygramy następny mecz”' } },
      { tone: 'konfrontacyjny', text: 'Nie przyszedłem tu rozmawiać o swojej posadzie.', h: { agr: '{coach} ucina pytanie o posadę' } },
    ],
  },
  {
    id: 'board-goal', w: (c) => (c.goalText && c.position && (c.roundsPlayed ?? 0) >= 6 && c.position > (c.goalTarget ?? 99) ? 4 : 0), by: ['dziennik', 'tygodnik', 'tabloid'],
    q: { neu: 'Celem jest {goal}. Jesteście na {pos}. miejscu. Czy ten cel jest nadal realny?', agr: 'Celem jest {goal}, a jesteście na {pos}. miejscu. Kto tu się pomylił: pan czy zarząd?' },
    a: () => [
      { tone: 'pewny', text: 'Cel jest realny i go zrealizujemy.', fans: 1, promise: 'goal', h: { neu: '{coach}: „Zrealizujemy cel”' } },
      { tone: 'dyplomatyczny', text: 'Cele są ambitne, ale mamy pełne porozumienie z zarządem.', board: 1 },
      { tone: 'konfrontacyjny', text: 'Cele zarządu są oderwane od rzeczywistości.', board: -3, fans: 1, h: { agr: '{coach} kontra zarząd! Mocne słowa o celach', neu: '{coach} podważa cele zarządu' } },
    ],
  },
  {
    id: 'fans', w: (c) => ((c.fansMood ?? 55) < 32 ? 5 : 0), by: ['lokalne', 'tabloid'],
    q: { neu: 'Kibice wywiesili transparent przeciwko panu. Co pan na to?' },
    sensitive: true,
    a: () => [
      { tone: 'spokojny', text: 'Rozumiem ich frustrację. Odpowiemy na boisku.', fans: 2 },
      { tone: 'dyplomatyczny', text: 'Zapraszam przedstawicieli kibiców na rozmowę.', fans: 3, board: 1 },
      { tone: 'konfrontacyjny', text: 'Kibice mają prawo do opinii, a ja mam swoją pracę.', fans: -3, h: { agr: '{coach} odpowiada kibicom. Będzie wojna?' } },
    ],
  },
  {
    id: 'table-top', w: (c) => (c.position && c.position <= 3 && (c.roundsPlayed ?? 0) >= 8 && !c.promises?.some((p) => p.kind === 'season') ? 3 : 0), by: ['dziennik', 'portal', 'lokalne'],
    q: { neu: 'Jesteście na podium. Czas mówić o: {ambition}?', agr: 'Podium, ale czy ta drużyna wytrzyma presję do końca sezonu?' },
    a: (c) => [
      { tone: 'pewny', text: `Tak. Gramy o ${ambition(c).text}.`, fans: 2, promise: 'season', h: { neu: '{coach}: „Gramy o {ambition}”', agr: '{coach} rzuca wyzwanie: {ambition}' } },
      { tone: 'spokojny', text: 'Za wcześnie. Tabelę ocenimy w maju.', board: 1 },
      { tone: 'humor', text: 'Proszę zapytać mnie w maju. Albo jeszcze lepiej, w czerwcu.' },
    ],
  },
  {
    id: 'table-bottom', w: (c) => (c.position && c.relegationFrom && c.position >= c.relegationFrom && (c.roundsPlayed ?? 0) >= 6 ? 5 : 0), by: ['tabloid', 'dziennik', 'lokalne'],
    q: { neu: 'Jesteście w strefie spadkowej. Czy ta drużyna się utrzyma?', agr: 'Strefa spadkowa. Czy pan w ogóle wierzy w utrzymanie?' },
    a: () => [
      { tone: 'pewny', text: 'Utrzymamy się. Nie mam co do tego wątpliwości.', morale: 0.3, promise: 'goal' },
      { tone: 'spokojny', text: 'Mecz po meczu. Panika nikomu nie pomoże.', morale: 0.2 },
      { tone: 'konfrontacyjny', text: 'Z tą kadrą trudno o cuda.', morale: -0.6, board: -2, h: { agr: '{coach}: „Z tą kadrą trudno o cuda”', neu: '{coach} narzeka na kadrę' } },
    ],
  },
  {
    id: 'promise-broken', w: (c) => (c.promises?.some((p) => p.kind === 'winNext') && c.res !== 'W' ? 12 : 0), by: ['tabloid', 'dziennik', 'kanal'],
    q: { neu: 'Na poprzedniej konferencji obiecał pan zwycięstwo. Co się stało?', agr: 'Obiecał pan zwycięstwo i słowa nie dotrzymał. Jak kibice mają panu teraz wierzyć?' },
    a: () => [
      { tone: 'spokojny', text: 'Pomyliłem się. Biorę to na siebie.', fans: 1, media: 1 },
      { tone: 'konfrontacyjny', text: 'Obiecałem walkę i walka była.', fans: -1, h: { agr: '{coach} wykręca się od obietnicy', neu: '{coach}: „Obiecałem walkę”' } },
      { tone: 'humor', text: 'Następnym razem nie będę niczego obiecywał.', fans: -1 },
    ],
  },
  {
    id: 'promise-kept', w: (c) => (c.promises?.some((p) => p.kind === 'winNext') && c.res === 'W' ? 9 : 0), by: ['portal', 'lokalne', 'klubowa'],
    q: { neu: 'Obiecał pan zwycięstwo i słowa dotrzymał. To była ryzykowna deklaracja?' },
    a: () => [
      { tone: 'pewny', text: 'Znam tę drużynę. Wiedziałem, na co ją stać.', fans: 2, morale: 0.3, h: { neu: '{coach} dotrzymał słowa', pos: '{coach} dotrzymał słowa' } },
      { tone: 'humor', text: 'Gdybyśmy przegrali, nie byłoby mnie tu tak szybko.' },
      { tone: 'spokojny', text: 'To zasługa zawodników. Ja tylko powiedziałem to głośno.', morale: 0.4 },
    ],
  },
  {
    id: 'promise-season', w: (c) => (seasonPromiseBroken(c) ? 8 : 0), by: ['tabloid', 'dziennik', 'tygodnik'],
    q: { neu: 'Mówił pan, że celem jest {promise}. Dziś jesteście na {pos}. miejscu. Podtrzymuje pan te słowa?', agr: 'Gdzie jest {promise}, które pan zapowiadał? {pos}. miejsce to kpina?' },
    a: () => [
      { tone: 'pewny', text: 'Tak. Sezon jest długi.', fans: 1, media: -1 },
      { tone: 'dyplomatyczny', text: 'Najważniejsze, żeby drużyna się rozwijała. Tabela przyjdzie.', fans: -2, media: 1, drop: 'season' },
      { tone: 'konfrontacyjny', text: 'Nie łapcie mnie za słówka.', h: { agr: '{coach}: „Nie łapcie mnie za słówka”' } },
    ],
  },
  {
    id: 'skipped', w: (c) => (c.lastMode === 'skipped' || c.lastMode === 'walkout' ? 9 : 0), by: ['tabloid', 'kanal', 'dziennik'],
    q: (c) => (c.lastMode === 'walkout' ? { neu: 'Ostatnio wyszedł pan z konferencji przed czasem. Dziś zostanie pan do końca?' }
      : { neu: 'Ostatnio nie przyszedł pan na konferencję. Unika pan trudnych pytań?' }),
    a: () => [
      { tone: 'spokojny', text: 'Dziś jestem i odpowiadam na wszystko.', media: 2 },
      { tone: 'konfrontacyjny', text: 'Przychodzę wtedy, kiedy uważam to za stosowne.', h: { agr: '{coach}: „Przychodzę, kiedy uważam to za stosowne”' } },
      { tone: 'humor', text: 'Tęskniliście?', media: 1 },
    ],
  },
  {
    id: 'fans-thanks', w: (c) => (c.climate === 'pozytywna' && c.res !== 'P' ? 4 : 0), by: ['klubowa'],
    q: { neu: 'Co chce pan przekazać kibicom, którzy dziś przyszli na stadion?' },
    a: () => [
      { tone: 'spokojny', text: 'Dziękuję za doping. Czuliśmy was przez cały mecz.', fans: 2 },
      { tone: 'pewny', text: 'Do zobaczenia za tydzień. Będzie jeszcze lepiej.', fans: 1, morale: 0.2 },
      { tone: 'humor', text: 'Niech oszczędzają gardła. Przydadzą się w następnym meczu.', fans: 1 },
    ],
  },
  {
    id: 'opp', w: () => 2, by: ['tygodnik', 'dziennik', 'portal'],
    q: { neu: 'Co zaskoczyło pana w grze drużyny {opp}?', agr: 'Drużyna {opp} wyglądała na lepiej przygotowaną. Czego zabrakło w analizie?' },
    a: () => [
      { tone: 'spokojny', text: 'Wiedzieliśmy, czego się spodziewać. Analiza była dokładna.' },
      { tone: 'dyplomatyczny', text: 'To dobrze poukładana drużyna. Należą się jej słowa uznania.', fans: -1 },
      { tone: 'humor', text: 'Zaskoczyło mnie, ile biegali. Zapytam, co jedzą na śniadanie.' },
    ],
  },
  {
    id: 'lineup', w: () => 2, by: ['kanal', 'portal', 'lokalne'],
    q: { neu: 'Skąd takie decyzje personalne w wyjściowym składzie?', agr: 'Kibice nie rozumieją pana decyzji personalnych. Wytłumaczy je pan?' },
    sensitive: true,
    a: () => [
      { tone: 'spokojny', text: 'Skład wybieram na podstawie treningów. Każdy dostaje swoją szansę.', morale: 0.1 },
      { tone: 'pewny', text: 'Za skład odpowiadam ja i biorę to na siebie.', morale: 0.2 },
      { tone: 'konfrontacyjny', text: 'Skład ustalam ja, a nie komentarze w internecie.', fans: -2, h: { agr: '{coach} do kibiców: skład ustalam ja', neu: '{coach}: „Skład ustalam ja”' } },
    ],
  },
  {
    id: 'form', w: () => 2, by: ['tygodnik', 'dziennik', 'lokalne'],
    q: { neu: 'Jak ocenia pan formę drużyny w ostatnich tygodniach?', agr: 'Forma drużyny budzi niepokój. Co nie działa?', pos: 'Drużyna jest w dobrej formie. Co jest jej największą siłą?' },
    a: () => [
      { tone: 'spokojny', text: 'Idziemy krok po kroku. Widzę postęp na treningach.', morale: 0.1 },
      { tone: 'pewny', text: 'Ta drużyna dopiero się rozkręca.', fans: 1, morale: 0.2 },
      { tone: 'dyplomatyczny', text: 'Są lepsze i gorsze momenty. Pracujemy nad stabilnością.' },
    ],
  },
  {
    id: 'next', w: () => 1, by: ['tygodnik', 'dziennik', 'lokalne', 'portal'],
    q: { neu: 'Czego spodziewa się pan w kolejnym meczu?', agr: 'Kolejny mecz to już mecz o wszystko?' },
    a: () => [
      { tone: 'pewny', text: 'Wygramy. Mówię to wprost.', fans: 1, morale: 0.2, promise: 'winNext', h: { neu: '{coach} zapowiada zwycięstwo w kolejnym meczu', agr: '{coach} obiecuje wygraną. Trzymamy za słowo' } },
      { tone: 'spokojny', text: 'Najpierw odpoczynek, potem analiza rywala.', morale: 0.1 },
      { tone: 'humor', text: 'Spodziewam się, że znowu się tu spotkamy.' },
    ],
  },
];
// Pytania przed meczem (konferencja przedmeczowa, dzień przed meczem w prawdziwym kalendarzu)
const PRE_BANK = [
  {
    id: 'pre-expect', phase: 'pre', first: true, w: () => 5, by: ['dziennik', 'lokalne', 'portal'],
    q: (c) => (c.favourite ? { neu: 'Jesteście faworytem meczu z drużyną {opp}. Czego się pan spodziewa?', agr: 'Wszyscy oczekują zwycięstwa z drużyną {opp}. Udźwigniecie tę presję?' }
      : c.underdog ? { neu: 'Drużyna {opp} jest faworytem. Na co stać pana zespół?', agr: 'Czy z drużyną {opp} macie w ogóle szanse?', pos: 'Ostatnio gracie dobrze. Stać was na niespodziankę z drużyną {opp}?' }
        : { neu: 'Czego spodziewa się pan po meczu z drużyną {opp}?', agr: 'Kolejny mecz, który trzeba wygrać. Czuje pan presję?' }),
    a: () => [
      { tone: 'pewny', text: 'Gramy o trzy punkty i wygramy ten mecz.', fans: 1, morale: 0.2, promise: 'winNext', h: { neu: '{coach} przed meczem: wygramy', agr: '{coach} zapowiada zwycięstwo. Trzymamy za słowo' } },
      { tone: 'spokojny', text: 'Szanujemy rywala, ale skupiamy się na sobie.', morale: 0.1 },
      { tone: 'dyplomatyczny', text: 'To będzie wyrównany mecz. Zdecydują detale.', fans: -1 },
    ],
  },
  {
    id: 'pre-opp', phase: 'pre', w: () => 3, by: ['tygodnik', 'portal', 'kanal'],
    q: (c) => (c.oppStar ? { neu: '{oppStar} jest w świetnej formie. Jak go zatrzymać?', agr: '{oppStar} rozbija każdą obronę. Ma pan na niego sposób?' } : { neu: 'Czym może was zaskoczyć drużyna {opp}?' }),
    a: () => [
      { tone: 'spokojny', text: 'Mamy plan. Szczegóły zostaną w szatni.' },
      { tone: 'pewny', text: 'Nikogo się nie boimy. To rywal powinien martwić się o nas.', fans: 1, media: -1, morale: 0.2, h: { neu: '{coach}: „Nikogo się nie boimy”', agr: '{coach} lekceważy rywala?' } },
      { tone: 'humor', text: 'Najbardziej obawiam się ich kucharza. Podobno świetnie gotuje.' },
    ],
  },
  {
    id: 'pre-lineup', phase: 'pre', w: () => 3, by: ['kanal', 'lokalne', 'portal'],
    q: (c) => (c.absent ? { neu: 'Jak drużyna poradzi sobie bez zawodnika, którym jest {absent}?', agr: 'Bez zawodnika, którym jest {absent}, ta drużyna gra o połowę słabiej. Ma pan plan B?' } : { neu: 'Czy szykuje pan zmiany w składzie?' }),
    sensitive: true,
    a: (c) => [
      { tone: 'spokojny', text: c.absent ? 'Mamy szeroką kadrę. Ktoś dostanie swoją szansę.' : 'Skład poznacie godzinę przed meczem.', morale: 0.1 },
      { tone: 'pewny', text: 'Kto wyjdzie na boisko, będzie gotowy. Ufam każdemu.', morale: 0.3 },
      { tone: 'humor', text: 'Skład podam państwu w zaklejonej kopercie. Otwarcie po meczu.' },
    ],
  },
  {
    id: 'pre-derby', phase: 'pre', w: (c) => (c.derby ? 9 : 0), by: ['lokalne', 'tabloid', 'portal'],
    q: { neu: 'Derby. Co powie pan kibicom przed tym meczem?', agr: 'W mieście mówi się tylko o derbach. Czy drużyna wytrzyma tę atmosferę?' },
    a: () => [
      { tone: 'pewny', text: 'Miasto będzie nasze. Obiecuję to kibicom.', fans: 3, media: -1, morale: 0.3, promise: 'winNext', h: { neu: '{coach} przed derbami: miasto będzie nasze', agr: '{coach} podgrzewa atmosferę przed derbami' } },
      { tone: 'spokojny', text: 'To wyjątkowy mecz, ale trzeba zachować chłodną głowę.', board: 1, morale: 0.1 },
      { tone: 'konfrontacyjny', text: 'Oni bardziej potrzebują tego meczu niż my.', fans: 2, h: { agr: '{coach} prowokuje przed derbami' } },
    ],
  },
  {
    id: 'pre-job', phase: 'pre', w: (c) => ((c.boardTrust ?? 60) < 40 ? 7 : 0), by: ['tabloid', 'kanal', 'dziennik'],
    q: { neu: 'Mówi się, że to mecz o pana posadę. Czuje pan presję?', agr: 'Podobno zarząd ma już następcę. To pana ostatni mecz?' },
    sensitive: true,
    a: () => [
      { tone: 'spokojny', text: 'Presja to część tej pracy. Myślę tylko o meczu.', board: 1, morale: 0.2 },
      { tone: 'pewny', text: 'Wygramy i temat się skończy.', fans: 1, morale: 0.3, promise: 'winNext', h: { neu: '{coach} odpowiada na pytania o posadę: wygramy', agr: '{coach} gra o posadę i obiecuje zwycięstwo' } },
      { tone: 'konfrontacyjny', text: 'Nie będę komentował plotek. Następne pytanie.', h: { agr: '{coach} nerwowy przed meczem o posadę' } },
    ],
  },
  {
    id: 'pre-crisis', phase: 'pre', w: (c) => (c.lossStreak >= 2 ? 6 : 0), by: ['dziennik', 'tabloid', 'lokalne'],
    q: { neu: 'Seria porażek. Co zmieni się w tym meczu?', agr: 'Kolejna porażka i robi się kryzys. Co pan zmienił w tygodniu?' },
    a: () => [
      { tone: 'spokojny', text: 'Przepracowaliśmy dobry tydzień. Wierzę w przełamanie.', morale: 0.3 },
      { tone: 'pewny', text: 'Ta seria skończy się jutro.', fans: 1, morale: 0.3, promise: 'winNext' },
      { tone: 'dyplomatyczny', text: 'Szukamy rozwiązań. Nie ma jednej przyczyny.' },
    ],
  },
  {
    id: 'pre-streak', phase: 'pre', w: (c) => (c.winStreak >= 3 ? 4 : 0), by: ['portal', 'lokalne', 'klubowa'],
    q: { neu: 'Seria zwycięstw. Nie boi się pan zadyszki?', pos: 'Drużyna jest na fali. Co jest jej siłą?' },
    a: () => [
      { tone: 'spokojny', text: 'Każdy mecz zaczyna się od zera. Tak to tłumaczę zawodnikom.', morale: 0.2 },
      { tone: 'pewny', text: 'Ta drużyna jest głodna. Seria będzie trwać.', fans: 1, morale: 0.2 },
      { tone: 'humor', text: 'Zadyszkę to mam ja, po każdej konferencji.' },
    ],
  },
  {
    id: 'pre-referee', phase: 'pre', w: (c) => (c.refName ? 2 : 0), by: ['kanal', 'portal', 'tabloid'],
    q: { neu: 'Sędzią meczu będzie {ref}. Ma pan jakieś obawy?', agr: 'Sędzia {ref} nie miał ostatnio dobrej prasy. Boi się pan jego decyzji?' },
    sensitive: true,
    a: () => [
      { tone: 'dyplomatyczny', text: 'Nie oceniam sędziów przed meczem.', board: 1 },
      { tone: 'konfrontacyjny', text: 'Mam nadzieję, że tym razem gwizdek nie zdecyduje o wyniku.', fans: 2, board: -1, ref: 1, h: { agr: '{coach} uderza w sędziów jeszcze przed meczem', neu: '{coach} ostrzega przed sędzią' } },
      { tone: 'humor', text: 'Życzę mu nudnego wieczoru. To będzie znaczyło, że wszystko poszło dobrze.' },
    ],
  },
  {
    id: 'pre-tip', phase: 'pre', w: () => 2, by: ['kanal', 'portal', 'lokalne'],
    q: { neu: 'Na koniec poproszę o typ na mecz.' },
    a: () => [
      { tone: 'pewny', text: 'Wygramy 2:0.', fans: 1, promise: 'winNext', h: { neu: '{coach} typuje: 2:0 dla nas' } },
      { tone: 'spokojny', text: 'Nie typuję. Zostawiam to bukmacherom.' },
      { tone: 'humor', text: 'Typuję, że ktoś strzeli gola. Albo i nie.' },
    ],
  },
];
// Pytania z banku pomeczowego, które pasują też przed meczem
const BOTH = new Set(['form', 'skipped', 'promise-season', 'board-goal', 'fans', 'rumour', 'table-top', 'table-bottom']);
const BY_ID = new Map([OPENING, ...BANK, ...PRE_BANK].map((q) => [q.id, q]));

function seasonPromiseBroken(c) {
  const p = c.promises?.find((x) => x.kind === 'season' || x.kind === 'goal');
  if (!p || !c.position || (c.roundsPlayed ?? 0) < 10) return false;
  return c.position > (p.target ?? 1) + (p.kind === 'season' ? 3 : 2);
}

// ================================================================ Konferencja

function fill(text, c, extra = {}) {
  const promise = c.promises?.find((x) => x.kind === 'season' || x.kind === 'goal');
  const vars = {
    star: c.star?.name, worst: c.worst?.name, red: c.redUser?.name, inj: c.injured?.name, rumour: c.rumour?.name,
    opp: c.oppName, ref: c.refName ?? '', lossStreak: c.lossStreak, winStreak: c.winStreak, pos: c.position, goal: c.goalText,
    ambition: ambition(c).text, promise: promise?.text, coach: c.coach ?? 'Trener', ...extra,
  };
  return String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

function questionText(def, c) {
  const v = typeof def.q === 'function' ? def.q(c) : def.q;
  const key = c.climate === 'agresywna' ? 'agr' : c.climate === 'pozytywna' ? 'pos' : 'neu';
  return fill(v[key] ?? v.neu, c);
}

function answersOf(def, c) {
  const list = def.a(c).map((a) => ({ ...a, text: fill(a.text, c) }));
  if (def.sensitive && !list.some((a) => a.tone === 'bezkomentarza')) list.push({ ...NO_COMMENT });
  return list.map((a, i) => ({ i, tone: a.tone, toneLabel: TONES[a.tone].label, text: a.text }));
}

function makeQuestion(def, c, j) {
  return { id: def.id, by: j, text: questionText(def, c), answers: answersOf(def, c), follow: !!def.follow };
}

/**
 * Otwiera konferencję. ctx: kontekst meczu (pressCtx w matchday.js), state: game.press, climateRes: pickClimate(...).
 * Zwraca obiekt sesji (JSON): klimat, rzecznik, sala, kolejka pytań, odpowiedzi.
 */
export function openConference(ctx, state = {}, climateRes = null, seed = 'konferencja', phase = 'post') {
  const cr = climateRes ?? pickClimate(ctx, state, seed);
  const climate = cr.climate;
  const rng = new Rng(`${seed}|sala`);
  const c = { ...ctx, climate, promises: state.promises ?? [], lastMode: state.last?.mode ?? null, rumourRoll: rng.chance(0.3) };
  const room = roomPreview(climate, ctx);
  const officer = pressOfficer(ctx);
  const pre = phase === 'pre';
  const n = climate === 'agresywna' ? 4 : 3; // [SZAC]
  // Wybór pytań: ważony, bez powtórzeń; klimat wzmacnia tematy trudne albo przyjazne
  const harsh = new Set(['job', 'board-goal', 'fans', 'rumour', 'red', 'promise-broken', 'promise-season', 'skipped', 'streak-loss', 'loss-heavy', 'win-lucky', 'referee']);
  harsh.add('pre-job'); harsh.add('pre-crisis'); harsh.add('pre-referee');
  const soft = new Set(['star', 'win-big', 'win-key', 'streak-win', 'promise-kept', 'fans-thanks', 'table-top', 'injury', 'pre-streak', 'pre-tip']);
  const weight = (d) => {
    let w = d.w(c);
    if (!w) return 0;
    if (climate === 'agresywna' && harsh.has(d.id)) w *= 1.5;
    if (climate === 'pozytywna' && soft.has(d.id)) w *= 1.5;
    return w;
  };
  const bank = pre ? [...PRE_BANK, ...BANK.filter((d) => BOTH.has(d.id))] : BANK;
  let pool = bank.filter((d) => !d.follow && weight(d) > 0);
  const picked = [];
  while (picked.length < n && pool.length) {
    const d = rng.weighted(pool, weight);
    picked.push(d);
    pool = pool.filter((x) => x !== d);
  }
  // Pytanie o wynik pada zawsze i jako pierwsze (tak jest w prawdziwej sali), reszta wg wagi
  const RESULT = pre ? new Set(['pre-expect', 'pre-derby']) : new Set(['win-key', 'win-big', 'win-lucky', 'draw', 'loss-why', 'loss-heavy', 'loss-unlucky', 'derby']);
  if (!picked.some((d) => RESULT.has(d.id))) {
    const best = bank.filter((d) => RESULT.has(d.id) && weight(d) > 0).sort((a, b) => weight(b) - weight(a))[0];
    if (best) picked.splice(Math.max(0, picked.length - 1), 1, best);
  }
  picked.sort((a, b) => (RESULT.has(b.id) - RESULT.has(a.id)) || weight(b) - weight(a));
  const used = new Set();
  const queue = picked.map((d) => {
    const j = room.find((r) => d.by.includes(r.id) && !used.has(r.id)) ?? room.find((r) => !used.has(r.id)) ?? room[0];
    used.add(j.id);
    return makeQuestion(d, c, j);
  });
  const opening = pre ? [] : [{ ...makeQuestion(OPENING, c, null), officer: true }];
  const intro = pre ? `Dzień dobry, zapraszamy na konferencję przed meczem z drużyną ${ctx.oppName ?? 'rywala'}.`
    : ctx.neutral ? 'Dzień dobry, zaczynamy. Zapraszam, panie trenerze.'
      : ctx.userHome ? 'Trener gości już za nami. Teraz trener gospodarzy, zapraszam.'
        : 'Dzień dobry. Zgodnie ze zwyczajem zaczynamy od trenera gości.';
  return {
    v: 1, phase, climate, climateRes: { climate, probs: cr.probs, reasons: cr.reasons },
    officer, room, intro: `${intro} Mamy czas na ${queue.length} ${plural(queue.length, 'pytanie', 'pytania', 'pytań')}.`,
    ctx: c, queue: [...opening, ...queue], idx: 0, answers: [], followUps: 0, maxJournalist: 5, done: false, walkedOut: false,
  };
}

/** Bieżące pytanie (albo null po zakończeniu). */
export function currentQuestion(conf) {
  return conf && !conf.done ? conf.queue[conf.idx] ?? null : null;
}

/** Liczba pytań dziennikarzy (bez słowa wstępnego) i numer bieżącego. */
export function progress(conf) {
  const total = conf.queue.filter((q) => !q.officer).length;
  const asked = conf.queue.slice(0, conf.idx + 1).filter((q) => !q.officer).length;
  return { total, current: Math.min(asked, total), last: conf.idx === conf.queue.length - 1 };
}

/**
 * Odpowiedź na bieżące pytanie (indeks odpowiedzi). Zwraca NOWĄ sesję. Mocna odpowiedź może wywołać dopytanie
 * tego samego dziennikarza (najwyżej 2 dopytania i 5 pytań od dziennikarzy łącznie).
 */
export function answerQuestion(conf, answerIdx) {
  const q = currentQuestion(conf);
  if (!q) return conf;
  const def = BY_ID.get(q.id);
  const all = def.a(conf.ctx);
  const raw = all[answerIdx] ?? (def.sensitive && answerIdx === all.length ? NO_COMMENT : all[0]);
  const rec = { q: q.id, by: q.by?.id ?? null, i: answerIdx, tone: raw.tone, text: fill(raw.text, conf.ctx), question: q.text };
  const queue = [...conf.queue];
  let followUps = conf.followUps;
  const journalistQs = queue.filter((x) => !x.officer).length;
  if (raw.follow && followUps < 2 && journalistQs < conf.maxJournalist && BY_ID.has(raw.follow)) {
    const fq = BY_ID.get(raw.follow);
    const nextQ = makeQuestion(fq, conf.ctx, q.by);
    if (nextQ.answers.length >= 2) { queue.splice(conf.idx + 1, 0, nextQ); followUps++; }
  }
  const idx = conf.idx + 1;
  return { ...conf, queue, idx, followUps, answers: [...conf.answers, rec], done: idx >= queue.length };
}

/** Trener wychodzi z sali przed końcem. */
export function walkOut(conf) {
  if (!conf || conf.done) return conf;
  return { ...conf, done: true, walkedOut: true };
}

/** Morale jednego zawodnika z presji prasy: mnożnik osobowości. [SZAC] */
export function pressMoraleDelta(teamDelta, persona, morale = null) {
  const neg = { Wrażliwy: 1.5, Narwaniec: 1.2, Ambitny: 1, Lider: 0.6, Spokojny: 0.6 };
  const pos = { Wrażliwy: 1.2 };
  const mul = teamDelta < 0 ? (neg[persona] ?? 1) : (pos[persona] ?? 1);
  // Dobra prasa podbudowuje, ale nie bez końca: im wyższe morale, tym mniej daje (docs/bierna-gra.md) [SZAC]
  const head = teamDelta > 0 && morale != null && PASSIVE.enabled ? clamp((PRESS_HEADROOM.top - morale) / PRESS_HEADROOM.span, 0, 1) : 1;
  return r2(teamDelta * mul * head);
}

/** Nasycenie dodatniego wpływu prasy na morale: pełny do morale 12, zero przy 19. */
export const PRESS_HEADROOM = { top: 19, span: 7 };

function playerRef(c, who) {
  return { worst: c.worst, star: c.star, redUser: c.redUser, rumour: c.rumour, injured: c.injured }[who] ?? null;
}

function headlineFor(text, c) { return fill(text, c); }

/**
 * Skutki konferencji (po zakończeniu albo wyjściu z sali).
 * Zwraca: { mode, climate, fans, board, media, teamMorale, players:[{id,name,d}], fine, promisesAdd, promisesDrop,
 *           headline:{ text, outlet }, quotes }. Wartości obcięte do PRESS_LIMITS.
 */
export function conferenceEffects(conf) {
  const c = conf.ctx;
  const climate = conf.climate;
  const eff = { fans: 0, board: 0, media: 0, morale: 0 };
  const players = new Map();
  let ref = 0;
  const pre = conf.phase === 'pre';
  const promisesAdd = []; const promisesDrop = [];
  let loud = null;
  const heavyLoss = c.res === 'P' && c.margin <= -2;
  for (const rec of conf.answers) {
    const def = BY_ID.get(rec.q);
    const all = def.a(c);
    const a = all[rec.i] ?? (rec.tone === 'bezkomentarza' ? NO_COMMENT : all[0]);
    const t = TONES[a.tone];
    let fans = t.base.fans + (a.fans ?? 0);
    let board = t.base.board + (a.board ?? 0);
    let media = t.base.media + (a.media ?? 0);
    const morale = t.base.morale + (a.morale ?? 0);
    if (a.tone === 'humor' && heavyLoss) { fans -= 2; board -= 1; } // żart po blamażu drażni
    if (a.tone === 'konfrontacyjny' && climate === 'agresywna') { media -= 1; fans += 1; } // kibice lubią, gdy trener się stawia
    if (a.tone === 'bezkomentarza' && climate === 'agresywna') media -= 1;
    eff.fans += fans; eff.board += board; eff.media += media; eff.morale += morale;
    ref += a.ref ?? 0;
    if (a.promise) {
      const amb = ambition(c);
      promisesAdd.push(a.promise === 'winNext' ? { kind: 'winNext', text: pre ? `zwycięstwo z drużyną ${c.oppName ?? 'rywala'}` : 'zwycięstwo w kolejnym meczu', date: c.date, pre }
        : a.promise === 'season' ? { kind: 'season', text: amb.text, target: amb.target, season: c.season, date: c.date }
          : { kind: 'goal', text: c.goalText ?? 'cel zarządu', target: c.goalTarget ?? 12, season: c.season, date: c.date });
    }
    if (a.drop) promisesDrop.push(a.drop);
    if (a.player) {
      const p = playerRef(c, a.player.who);
      if (p) players.set(p.id, { id: p.id, name: p.name, d: r2((players.get(p.id)?.d ?? 0) + a.player.d) });
    }
    const score = t.loud + (a.player && a.player.d < 0 ? 2 : 0) + (a.promise ? 1.5 : 0) + (a.h ? 1 : 0);
    if (!loud || score > loud.score) loud = { score, a, rec };
  }
  const key = climate === 'agresywna' ? 'agr' : climate === 'pozytywna' ? 'pos' : 'neu';
  let headline;
  if (conf.walkedOut) {
    eff.media -= 5; eff.board -= 1; // [SZAC]
    headline = { text: headlineFor(pre ? '{coach} przerwał konferencję przed meczem' : climate === 'agresywna' ? '{coach} wyszedł z konferencji. Pytania bez odpowiedzi' : '{coach} przerwał konferencję prasową', c), outlet: OUTLETS[climate === 'agresywna' ? 'tabloid' : 'portal'].name };
  } else if (loud) {
    const h = loud.a.h?.[key] ?? loud.a.h?.neu;
    const quote = loud.a.text.split(/(?<=[.!?])\s/)[0].replace(/\.$/, '');
    const outletId = climate === 'agresywna' && loud.score >= 3 ? 'tabloid' : loud.rec.by ?? 'dziennik';
    const outlet = conf.room.find((r) => r.id === outletId)?.outlet ?? OUTLETS[outletId]?.name ?? OUTLETS.dziennik.name;
    headline = { text: h ? headlineFor(h, c) : `${c.coach ?? 'Trener'}: „${quote}”`, outlet };
  }
  // Presja klimatu plus osłona albo dociążenie z odpowiedzi; wyjście z sali: osłona tylko do tej pory
  // Przed meczem presja jest o połowę mniejsza (zapowiedzi, nie recenzje), limity węższe [SZAC]
  const L = pre ? PRESS_LIMITS_PRE : PRESS_LIMITS;
  let base = conf.walkedOut && climate === 'pozytywna' ? CLIMATES.pozytywna.base / 2 : CLIMATES[climate].base; // po wyjściu dobra prasa działa słabiej
  if (pre) base /= 2;
  const teamMorale = r2(clamp(base + (pre ? eff.morale * 0.6 : eff.morale), ...L.teamMorale));
  const refSeverity = r1(Math.max(0, ref));
  return {
    phase: pre ? 'pre' : 'post', mode: conf.walkedOut ? 'walkout' : 'answered', climate,
    fans: Math.round(clamp(eff.fans, ...L.fans)),
    board: Math.round(clamp(eff.board, ...L.board)),
    media: r1(clamp(eff.media, ...L.media)),
    teamMorale,
    players: [...players.values()].map((p) => ({ ...p, d: r2(clamp(p.d, ...PRESS_LIMITS.player)) })),
    ref: refSeverity, fine: refSeverity >= 1, promisesAdd, promisesDrop, headline,
    quotes: conf.answers.map((r) => ({ by: r.by, text: r.text })),
  };
}

/** Skutki pominięcia konferencji (przycisk Dalej). Presja działa, ale bez osłony trenera. [SZAC] */
export function skipEffects(ctx, climate = 'neutralna', state = {}, phase = 'post') {
  const c = ctx;
  const coachPre = c.coach ?? 'Trener';
  if (phase === 'pre') {
    const pre = {
      agresywna: { media: -2, morale: r2(CLIMATES.agresywna.base / 2), h: `${coachPre} odwołał konferencję przed meczem. Co ukrywa?`, outlet: OUTLETS.tabloid.name },
      neutralna: { media: -1, morale: 0, h: 'Przed meczem bez konferencji trenera', outlet: OUTLETS.dziennik.name },
      pozytywna: { media: -0.5, morale: r2(CLIMATES.pozytywna.base / 4), h: 'Trener w ciszy szykuje drużynę do meczu', outlet: OUTLETS.dziennik.name },
    }[climate];
    return {
      phase: 'pre', mode: 'skipped', climate, fans: 0, board: 0, media: pre.media, teamMorale: pre.morale, players: [], ref: 0, fine: false,
      promisesAdd: [], promisesDrop: [], headline: { text: pre.h, outlet: pre.outlet }, quotes: [],
    };
  }
  const broken = (state.promises ?? []).some((p) => p.kind === 'winNext') && c.res !== 'W';
  const coach = c.coach ?? 'Trener';
  const by = {
    agresywna: { media: -4, fans: -1, board: 0, morale: CLIMATES.agresywna.base, h: `${coach} unika mediów. Gdzie był trener?`, outlet: OUTLETS.tabloid.name },
    neutralna: { media: -2, fans: 0, board: 0, morale: 0, h: 'Na konferencję zamiast trenera przyszedł asystent', outlet: OUTLETS.dziennik.name },
    pozytywna: { media: -1, fans: 0, board: 0, morale: r2(CLIMATES.pozytywna.base / 2), h: 'Asystent zastąpił trenera na konferencji. Nastroje dobre', outlet: OUTLETS.dziennik.name },
  }[climate];
  return {
    phase: 'post', mode: 'skipped', climate,
    fans: by.fans + (broken ? -1 : 0), board: by.board, media: by.media + (broken ? -1 : 0),
    teamMorale: r2(clamp(by.morale, ...PRESS_LIMITS.teamMorale)), players: [], ref: 0, fine: false,
    promisesAdd: [], promisesDrop: [], headline: { text: broken ? `${coach} obiecał zwycięstwo, a potem nie przyszedł na konferencję` : by.h, outlet: by.outlet }, quotes: [],
  };
}

/**
 * Nowy stan prasy po meczu: narracja (klimat trwa 2-4 mecze), relacje z mediami (zbliżają się do 50 o 10%
 * na mecz), obietnice (zwycięstwo w kolejnym meczu wygasa po tym meczu, cele sezonu z końcem sezonu).
 */
export function nextPressState(state, eff, { climate, date, season, matchId, seed = 'prasa' } = {}) {
  const s = state ?? {};
  const same = s.climate === climate;
  const left = same ? Math.max(0, (s.left ?? 0) - 1) : new Rng(`${seed}|narracja`).int(2, 4);
  let relation = clamp((s.relation ?? 50) + (eff.media ?? 0), 0, 100);
  relation = r1(relation + (50 - relation) * 0.1);
  let promises = (s.promises ?? []).filter((p) => p.kind !== 'winNext' && (!p.season || p.season === season));
  if (eff.promisesDrop?.includes('season')) promises = promises.filter((p) => p.kind !== 'season' && p.kind !== 'goal');
  for (const p of eff.promisesAdd ?? []) promises = [...promises.filter((x) => x.kind !== p.kind), p];
  return {
    ...s, v: 1, climate, left, streak: same ? (s.streak ?? 0) + 1 : 1, relation, promises: promises.slice(-4),
    last: { mode: eff.mode, date, matchId },
    log: [...(s.log ?? []), { date, climate, mode: eff.mode, headline: eff.headline?.text ?? null }].slice(-6),
  };
}

/**
 * Stan prasy po konferencji PRZEDMECZOWEJ: relacje i obietnice. Narracji (klimatu) nie zmienia, a obietnica
 * zwycięstwa zostaje do rozliczenia na konferencji po tym meczu.
 */
export function nextPressStatePre(state, eff, { date, matchId } = {}) {
  const s = state ?? {};
  let relation = clamp((s.relation ?? 50) + (eff.media ?? 0), 0, 100);
  relation = r1(relation);
  let promises = [...(s.promises ?? [])];
  for (const p of eff.promisesAdd ?? []) promises = [...promises.filter((x) => x.kind !== p.kind), p];
  return {
    ...s, relation, promises: promises.slice(-4), pre: { mode: eff.mode, date, matchId },
    preLog: [...(s.preLog ?? []), { date, climate: eff.climate, mode: eff.mode, headline: eff.headline?.text ?? null }].slice(-6),
  };
}

/** Skutki słowami (UI nie pokazuje liczb). dir: 1 w górę, -1 w dół, 0 bez zmian. */
export function effectWords(eff) {
  const out = [];
  const m = eff.teamMorale;
  out.push({ k: 'Szatnia', dir: Math.sign(m >= 0.25 ? 1 : m <= -0.25 ? -1 : 0),
    t: m <= -1 ? 'Zawodnicy czują nagonkę mediów. Morale wyraźnie w dół.' : m <= -0.25 ? 'Zawodnicy czytają krytykę. Morale lekko w dół.'
      : m < 0.25 ? 'Prasa nie robi wrażenia na szatni.' : m < 0.7 ? 'Drużyna czuje wsparcie. Morale lekko w górę.' : 'Szatnia jest podbudowana tym, co pisze się o drużynie.' });
  for (const p of eff.players ?? []) {
    if (Math.abs(p.d) < 0.2) continue;
    out.push({ k: p.name, dir: Math.sign(p.d), t: p.d <= -1 ? 'Publiczna krytyka zabolała. Morale w dół.' : p.d < 0 ? 'Słowa trenera trochę go ubodły.' : p.d >= 0.8 ? 'Publiczna pochwała go podbudowała.' : 'Docenia wsparcie trenera.' });
  }
  const b = eff.board;
  out.push({ k: 'Zarząd', dir: Math.sign(b), t: b >= 2 ? 'Zarząd docenił twoją postawę.' : b > 0 ? 'Zarząd przyjął twoje słowa dobrze.' : b === 0 ? 'Zarząd bez reakcji.' : b > -3 ? 'Zarządowi nie spodobały się niektóre słowa.' : 'Zarząd jest niezadowolony z twoich wypowiedzi.' });
  const f = eff.fans;
  out.push({ k: 'Kibice', dir: Math.sign(f), t: f >= 3 ? 'Kibice kupili twoje słowa.' : f > 0 ? 'Kibicom spodobały się twoje słowa.' : f === 0 ? 'Kibice bez większych emocji.' : f > -3 ? 'Część kibiców jest rozczarowana.' : 'Kibice są wściekli na twoje słowa.' });
  const md = eff.media;
  out.push({ k: 'Media', dir: Math.sign(md >= 1 ? 1 : md <= -1 ? -1 : 0), t: md >= 3 ? 'Dziennikarze cię polubili. Następnym razem będzie łagodniej.' : md >= 1 ? 'Relacje z mediami lekko się poprawiły.' : md > -1 ? 'Relacje z mediami bez zmian.' : md > -4 ? 'Dziennikarze zapamiętają ten dzień.' : 'Media mają z tobą na pieńku. Następna sala będzie gorąca.' });
  if (eff.fine) out.push({ k: 'Liga', dir: -1, t: eff.ref >= 2 ? 'Rzecznik dyscyplinarny kieruje wniosek o ukaranie za słowa o sędziach. Decyzja za kilka dni, grozi kara finansowa.' : 'Rzecznik dyscyplinarny przyjrzy się twoim słowom o sędziach. Decyzja za kilka dni.' });
  for (const p of eff.promisesAdd ?? []) out.push({ k: 'Obietnica', dir: 0, t: `Media zapamiętały: ${p.text}. Wrócą do tego.` });
  return out;
}

/** Rzecznik klubu (stały dla klubu w danej grze). */
export function pressOfficer(ctx) {
  const p = personFrom(new Rng(`rzecznik:${ctx.gameSeed}:${ctx.clubId}`));
  return { name: p.name, role: p.female ? 'Rzeczniczka prasowa' : 'Rzecznik prasowy', female: p.female };
}

/** Sala: dziennikarze redakcji obecnych przy danym klimacie, bez powtórzonych nazwisk (także z rzecznikiem). */
export function roomPreview(climate, ctx) {
  const opts = { gameSeed: ctx.gameSeed, clubId: ctx.clubId, region: ctx.region };
  const used = new Set([pressOfficer(ctx).name.split(' ').pop(), ctx.coach].filter(Boolean)); // bez nazwiska rzecznika i trenera
  return (ROOMS[climate] ?? ROOMS.neutralna).map((id) => {
    let j = journalist(id, opts);
    for (let salt = 1; used.has(j.name.split(' ').pop()) && salt < 8; salt++) j = journalist(id, opts, salt);
    used.add(j.name.split(' ').pop());
    return j;
  });
}

// ================================================================ Dyscyplina: słowa o sędziach
// Ekstraklasa: Komisja Ligi Ekstraklasy; 1 i 2 Liga oraz Puchar Polski: Komisja Dyscyplinarna PZPN.
// Punkt odniesienia: 50 tys. zł dla trenera Legii za wulgarne słowa wobec sędziego technicznego (Komisja Ligi),
// 100 tys. zł i dyskwalifikacja za niedozwolony kontakt z sędzią (sprawa poważniejsza niż wypowiedź).
// Zwykła krytyka sędziów kończy się zwykle upomnieniem, naganą albo karą kilku do kilkunastu tysięcy złotych.
// Kwoty dla 1 i 2 Ligi skalowane do budżetów tych lig. Wszystko [SZAC], źródła: docs/konferencja-prasowa.md, rozdz. 5.

export const DISCIPLINE = {
  body: { 1: 'Komisja Ligi Ekstraklasy', 2: 'Komisja Dyscyplinarna PZPN', 3: 'Komisja Dyscyplinarna PZPN' },
  fine: { 1: [5000, 20000], 2: [2000, 8000], 3: [1000, 4000] }, // zł, pierwsze przewinienie, zwykła krytyka [SZAC]
  cap: { 1: 50000, 2: 20000, 3: 10000 }, // [SZAC] górna granica (Ekstraklasa: poziom kary za wulgaryzmy)
  repeatMul: 1.5, // za każde przewinienie w ostatnich 365 dniach, najwyżej 3 [SZAC]
  days: [3, 6], // decyzja po kilku dniach (posiedzenie komisji) [SZAC]
  trust: { umorzenie: 0, upomnienie: -1, kara: -2, karaRecydywa: -3 }, // zaufanie zarządu [SZAC]
};

const COMP_TIER = { ekstraklasa: 1, liga1: 2, liga2: 3, l1: 1, l2: 2, l3: 3 };

/** Poziom rozgrywek dla dyscypliny (null: puchary UEFA i sparingi bez sprawy krajowej). */
export function disciplineTier(comp, clubTier = 1) {
  if (!comp || comp === 'friendly' || comp === 'uefa') return null;
  if (COMP_TIER[comp]) return COMP_TIER[comp];
  if (comp === 'pp' || comp === 'super') return Math.min(3, clubTier ?? 1);
  return Math.min(3, clubTier ?? 1);
}

/** Sprawa po konferencji (albo null). ctx: kontekst konferencji, eff: skutki z ref >= 1. */
export function openCase(eff, ctx, seed = 'sprawa') {
  if (!eff?.fine) return null;
  const tier = disciplineTier(ctx.comp, ctx.tier);
  if (!tier) return null;
  const days = new Rng(`${seed}|termin`).int(...DISCIPLINE.days);
  const quote = (eff.quotes ?? []).find((q) => /sędzi|gwizd|powtórk|decyzje/i.test(q.text))?.text ?? null;
  return { id: `${ctx.matchId}:${eff.phase ?? 'post'}`, matchId: ctx.matchId, date: ctx.date, days, severity: eff.ref, tier, body: DISCIPLINE.body[tier], quote, phase: eff.phase ?? 'post', opp: ctx.oppName ?? null };
}

/** Data decyzji (YYYY-MM-DD). */
export function caseDue(c) {
  const [y, m, d] = c.date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + c.days)).toISOString().slice(0, 10);
}

/** Liczba upomnień i kar w ostatnich 365 dniach przed datą. */
export function priorOffences(history, date) {
  const t = Date.parse(`${date}T00:00:00Z`);
  return (history ?? []).filter((h) => h.outcome !== 'umorzenie' && t - Date.parse(`${h.date}T00:00:00Z`) <= 365 * 864e5).length;
}

/** Decyzja komisji (deterministycznie z ziarna). Zwraca { outcome, amount, trust, priors }. [SZAC] */
export function decideCase(c, history = [], date = c.date, seed = 'komisja') {
  const rng = new Rng(`${seed}|${c.id}`);
  const priors = priorOffences(history, date);
  const sev = c.severity ?? 1;
  let p;
  if (sev >= 2) p = priors ? { umorzenie: 0.03, upomnienie: 0, kara: 0.97 } : { umorzenie: 0.05, upomnienie: 0.2, kara: 0.75 };
  else p = priors >= 2 ? { umorzenie: 0.05, upomnienie: 0.05, kara: 0.9 } : priors === 1 ? { umorzenie: 0.1, upomnienie: 0.25, kara: 0.65 } : { umorzenie: 0.25, upomnienie: 0.45, kara: 0.3 };
  const outcome = rng.weighted(['umorzenie', 'upomnienie', 'kara'], (k) => p[k]);
  let amount = 0;
  if (outcome === 'kara') {
    const [lo, hi] = DISCIPLINE.fine[c.tier] ?? DISCIPLINE.fine[3];
    const raw = (lo + rng.next() * (hi - lo)) * (1 + 0.5 * (Math.min(3, sev) - 1)) * DISCIPLINE.repeatMul ** Math.min(3, priors);
    amount = Math.min(DISCIPLINE.cap[c.tier] ?? DISCIPLINE.cap[3], Math.round(raw / 500) * 500);
  }
  const trust = outcome === 'kara' ? (priors ? DISCIPLINE.trust.karaRecydywa : DISCIPLINE.trust.kara) : DISCIPLINE.trust[outcome];
  return { outcome, amount, trust, priors };
}

// ================================================================ Prasa w ocenie zarządu

/**
 * Składnik miesięcznej oceny zarządu z klimatu prasy (ostatnie 31 dni) i relacji z mediami.
 * Zwraca { delta, notes }. Limit od -2,5 do +1,5 punktu zaufania [SZAC].
 */
/** Składnik oceny zarządu za pomijanie konferencji: najwyżej -1,2 w miesiącu (docs/bierna-gra.md). */
export const PRESS_BOARD = { skipMax: 1.2 };

export function pressBoardTerm(state, date) {
  if (!state || !date) return { delta: 0, notes: [] };
  const t = Date.parse(`${date}T00:00:00Z`);
  const recent = (list) => (list ?? []).filter((e) => e.date && t - Date.parse(`${e.date}T00:00:00Z`) <= 31 * 864e5 && t >= Date.parse(`${e.date}T00:00:00Z`));
  const post = recent(state.log); const pre = recent(state.preLog);
  if (!post.length && !pre.length) return { delta: 0, notes: [] };
  let v = 0;
  for (const e of post) v += e.climate === 'agresywna' ? -0.8 : e.climate === 'pozytywna' ? 0.6 : 0;
  const skips = [...post, ...pre].filter((e) => e.mode === 'skipped' || e.mode === 'walkout').length;
  v -= PASSIVE.enabled ? Math.min(PRESS_BOARD.skipMax, 0.3 * skips) : 0.3 * skips; // unikanie mediów: odczuwalne, ale nie zwalnia trenera grającego na miarę celu
  v += ((state.relation ?? 50) - 50) * 0.02;
  const delta = r1(clamp(v, -2.5, 1.5));
  const notes = [];
  const agr = post.filter((e) => e.climate === 'agresywna').length; const pos = post.filter((e) => e.climate === 'pozytywna').length;
  if (delta <= -1) notes.push(agr >= 2 ? 'Media nie zostawiają na nas suchej nitki. Zarząd nie lubi czytać takich nagłówków.' : 'Prasa jest krytyczna wobec klubu.');
  else if (delta <= -0.4) notes.push('Wizerunek klubu w mediach słabnie.');
  else if (delta >= 0.8) notes.push(pos >= 2 ? 'Dobra prasa wokół klubu. Zarząd to docenia.' : 'Media piszą o klubie przychylnie.');
  else if (delta >= 0.3) notes.push('Media piszą o klubie przychylnie.');
  if (skips >= 2) notes.push('Zarząd zauważył, że trener unika konferencji prasowych.');
  return { delta, notes };
}
