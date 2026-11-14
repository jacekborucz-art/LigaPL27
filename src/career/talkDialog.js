// Rozmowa indywidualna jako dialog: zawodnik odpowiada według charakteru i sytuacji, trener wybiera podejście
// (ze wsparciem, rzeczowo, stanowczo). Podejście dopasowane do charakteru i tematu wzmacnia rozmowę, źle dobrane
// osłabia (approachMod, w punktach tej samej skali co efekt tematu w teamTalks.js, ograniczone do +-1).
// Teksty z wieloma wariantami, wybór stały dla dnia i zawodnika (ziarno), więc ta sama rozmowa nie zmienia się po odświeżeniu.
import { Rng } from '../core/rng.js';

export const APPROACHES = {
  wsparcie: { label: 'Ze wsparciem', hint: 'Ciepło, z troską o zawodnika' },
  rzeczowo: { label: 'Rzeczowo', hint: 'Spokojnie, fakty i plan' },
  stanowczo: { label: 'Stanowczo', hint: 'Twardo, z wymaganiami' },
};

// Jak charakter przyjmuje podejście (punkty efektu rozmowy)
const PERSONA_FIT = {
  Spokojny: { wsparcie: 0.1, rzeczowo: 0.3, stanowczo: -0.1 },
  Ambitny: { wsparcie: -0.1, rzeczowo: 0.2, stanowczo: 0.4 },
  Wrażliwy: { wsparcie: 0.6, rzeczowo: 0, stanowczo: -0.8 },
  Lider: { wsparcie: 0, rzeczowo: 0.4, stanowczo: 0.1 },
  Narwaniec: { wsparcie: 0.2, rzeczowo: 0.1, stanowczo: -0.5 },
};
// Czy podejście pasuje do tematu
const TOPIC_FIT = {
  praise: { wsparcie: 0.2, rzeczowo: 0.1, stanowczo: -0.3 },
  encourage: { wsparcie: 0.3, rzeczowo: 0, stanowczo: -0.4 },
  demand: { wsparcie: -0.2, rzeczowo: 0.1, stanowczo: 0.2 },
  role: { wsparcie: 0, rzeczowo: 0.2, stanowczo: -0.1 },
  future: { wsparcie: 0.1, rzeczowo: 0.2, stanowczo: -0.2 },
  warn: { wsparcie: -0.2, rzeczowo: 0.1, stanowczo: 0.3 },
};

/** Wpływ podejścia na rozmowę (0, gdy brak podejścia: szybka rozmowa z menu). */
export function approachMod(persona, kind, approach) {
  if (!approach || !APPROACHES[approach]) return 0;
  const v = (PERSONA_FIT[persona]?.[approach] ?? 0) + (TOPIC_FIT[kind]?.[approach] ?? 0);
  return Math.max(-1, Math.min(1, Math.round(v * 100) / 100));
}

const pick = (rng, list) => list[Math.floor(rng.next() * list.length)];
const seedOf = (game, p, kind, part) => `dialog:${game?.seed ?? 0}:${game?.date ?? ''}:${p.id}:${kind}:${part}`;

/** Sytuacja zawodnika do tekstów: nastrój, forma, minuty. */
export function situationOf(p, { share = 1, form = null } = {}) {
  const m = p.morale ?? 12;
  return {
    mood: m <= 8 ? 'low' : m >= 15 ? 'high' : 'mid',
    form: form == null ? 'none' : form >= 7 ? 'good' : form < 6.4 ? 'poor' : 'ok',
    bench: share < 0.35,
    unhappy: !!(p.unhappy || p.transferRequest),
  };
}

// Pierwsza odpowiedź zawodnika (zanim trener powie, o co chodzi): charakter i nastrój
const OPEN = {
  Spokojny: {
    low: ['Siada i patrzy w podłogę. „Trenerze, wiem, że ostatnio nie jest dobrze.”', '„Słucham, trenerze. Domyślam się, o czym chce pan rozmawiać.”'],
    mid: ['„Dzień dobry, trenerze. Coś się stało?”', 'Siada spokojnie. „Jestem, słucham.”', '„Mam chwilę. O czym chce pan porozmawiać?”'],
    high: ['Uśmiecha się. „Dobry dzień na rozmowę, trenerze.”', '„Słucham. Dobrze się teraz czuję w zespole.”'],
  },
  Ambitny: {
    low: ['Wchodzi bez uśmiechu. „Chcę grać więcej, trenerze. To chyba jasne.”', '„Mam nadzieję, że to rozmowa o tym, jak wrócić do składu.”'],
    mid: ['„Trenerze, czekałem na tę rozmowę. Chcę wiedzieć, na czym stoję.”', 'Siada wyprostowany. „Słucham. Jestem gotów na więcej.”', '„Proszę mówić wprost, trenerze. Tak wolę.”'],
    high: ['„Czuję, że to mój czas, trenerze. Chcę iść dalej.”', '„Dobrze, że pan wezwał. Mam ambitne plany na ten sezon.”'],
  },
  Wrażliwy: {
    low: ['Wchodzi niepewnie i długo milczy. „Zrobiłem coś nie tak?”', '„Ostatnio dużo myślę o tym, czy pan mi jeszcze ufa.”'],
    mid: ['Siada na brzegu krzesła. „Trochę się denerwuję, trenerze.”', '„Wszystko w porządku? Pierwszy raz pan mnie wzywa.”', 'Ściska butelkę wody. „Słucham, trenerze.”'],
    high: ['Uśmiecha się nieśmiało. „Dziękuję, że pan znalazł czas.”', '„Jest mi tu dobrze, trenerze. Dziękuję za zaufanie.”'],
  },
  Lider: {
    low: ['„Trenerze, szatnia też to czuje. Musimy coś zmienić.”', 'Siada naprzeciwko i patrzy w oczy. „Wiem, że jest źle. Słucham.”'],
    mid: ['„Dobrze, że rozmawiamy. Chłopaki też mają pytania.”', '„Słucham, trenerze. Jak mogę pomóc drużynie?”', 'Kiwa głową na powitanie. „Mów pan, trenerze.”'],
    high: ['„Atmosfera jest dobra, trenerze. Trzeba ją utrzymać.”', '„Jestem gotów wziąć więcej odpowiedzialności.”'],
  },
  Narwaniec: {
    low: ['Wpada do gabinetu. „Jeśli chodzi o ostatni mecz, to nie była moja wina!”', '„Znowu ja? Co tym razem, trenerze?”'],
    mid: ['Siada bokiem do biurka. „No, słucham.”', '„Byle szybko, trenerze, zaraz mam siłownię.”', 'Bębni palcami po stole. „Tak?”'],
    high: ['„Trenerze! Widział pan tamten wślizg? To było coś!”', 'Śmieje się w drzwiach. „Dobry humor dzisiaj, trenerze.”'],
  },
};
// Dopiski sytuacyjne (ławka, forma, niezadowolenie)
const OPEN_EXTRA = {
  bench: ['Wspomina, że od kilku tygodni głównie siedzi na ławce.', 'Mówi, że nie wie, czego jeszcze od niego trener oczekuje, żeby zagrać.'],
  good: ['Widać, że jest pewny siebie po ostatnich meczach.', 'Ostatnie dobre występy dodały mu pewności.'],
  poor: ['Sam przyznaje, że ostatnie mecze mu nie wyszły.', 'Unika tematu ostatnich słabszych występów.'],
  unhappy: ['Nie ukrywa, że jest niezadowolony ze swojej sytuacji.', 'Daje do zrozumienia, że myśli o zmianie klubu.'],
};

// Zdania trenera: temat x podejście, po kilka wariantów
const COACH = {
  praise: {
    wsparcie: ['„Chcę ci powiedzieć, że jestem z ciebie dumny. Widać ogromną pracę.”', '„Świetnie grasz. Cieszę się, że mamy cię w drużynie.”', '„To, co pokazujesz na boisku, buduje cały zespół. Dziękuję.”'],
    rzeczowo: ['„Twoje liczby z ostatnich meczów są bardzo dobre. Tak trzymaj.”', '„Analiza wideo pokazuje, że grasz najlepiej od dawna. Utrzymajmy to.”', '„Dobra forma. Chcę, żebyś pracował dokładnie tak samo.”'],
    stanowczo: ['„Dobrze grasz, ale nie wolno ci teraz spuścić z tonu. Ani trochę.”', '„Forma jest. Teraz oczekuję, że utrzymasz ją przez cały sezon.”'],
  },
  encourage: {
    wsparcie: ['„Wierzę w ciebie. Każdy ma gorszy okres, przejdziemy przez to razem.”', '„Głowa do góry. Wiem, ile potrafisz, i pomogę ci to pokazać.”', '„Jesteś ważny dla tej drużyny. Nie zapominaj o tym.”'],
    rzeczowo: ['„Przygotowaliśmy plan, który pomoże ci wrócić do formy. Zrobimy to krok po kroku.”', '„Popatrzmy na konkrety: dwie rzeczy do poprawy i wracasz do gry na swoim poziomie.”'],
    stanowczo: ['„Koniec użalania się. Bierzesz się w garść i pokazujesz, że stać cię na więcej.”', '„Masz jakość, ale nikt za ciebie tego nie zrobi. Od jutra więcej energii.”'],
  },
  demand: {
    wsparcie: ['„Wiem, że stać cię na więcej, i chcę ci w tym pomóc. Popracujmy razem.”', '„Oczekuję więcej, bo wierzę w twoje możliwości.”'],
    rzeczowo: ['„Na treningach brakuje intensywności, w meczach decyzji. To trzeba poprawić.”', '„Statystyki pokazują spadek. Ustalmy cele na najbliższe tygodnie.”', '„Twoja rola wymaga więcej biegania i pracy w obronie. Tego oczekuję.”'],
    stanowczo: ['„Tak dalej być nie może. Albo poprawa, albo ławka.”', '„Oczekuję od ciebie zdecydowanie więcej. Od dziś, nie od jutra.”', '„Nikt tu nie ma miejsca na stałe. Udowodnij, że zasługujesz na skład.”'],
  },
  role: {
    wsparcie: ['„Rozumiem, że to trudne siedzieć na ławce. Chcę, żebyś wiedział, że na ciebie liczę.”', '„Twoja szansa przyjdzie. Bądź gotowy, bo bardzo cię potrzebuję.”'],
    rzeczowo: ['„Wyjaśnię ci, jak widzę twoją rolę: wchodzisz w drugiej połowie i zmieniasz tempo gry.”', '„Na razie przed tobą są inni na tej pozycji. Oto, co musisz poprawić, żeby to zmienić.”', '„Plan na najbliższe mecze jest taki: rotacja i szansa w pucharze.”'],
    stanowczo: ['„W składzie gra ten, kto daje więcej na treningu. Na razie to nie ty.”', '„Rola zależy od ciebie. Zapracuj na nią, zamiast czekać.”'],
  },
  future: {
    wsparcie: ['„Bardzo chcę, żebyś został z nami na dłużej. Jesteś częścią tego projektu.”', '„Widzę cię w tej drużynie przez następne lata.”'],
    rzeczowo: ['„Twój kontrakt kończy się niedługo. Porozmawiajmy, jak widzisz swoją przyszłość.”', '„Klub chce przedłużyć współpracę. Jakie masz oczekiwania?”', '„Przedstawię ci plan rozwoju na kolejne sezony.”'],
    stanowczo: ['„Musisz się zdecydować. Klub nie będzie czekał w nieskończoność.”', '„Chcę jasnej odpowiedzi: zostajesz czy szukasz innego klubu?”'],
  },
  warn: {
    wsparcie: ['„Martwię się o ciebie. Kartki i nerwy nie pomagają ani tobie, ani drużynie.”', '„Wiem, że grasz z sercem, ale musisz nad sobą panować.”'],
    rzeczowo: ['„Masz już sporo kartek. Kolejna oznacza pauzę w ważnym meczu.”', '„Przejrzeliśmy twoje faule. Większości można było uniknąć.”'],
    stanowczo: ['„Dość. Jeszcze jedna głupia kartka i siadasz na ławce.”', '„Dyscyplina to nie prośba. Takie zachowanie kosztuje drużynę punkty.”', '„Ostatni raz rozmawiamy o tym spokojnie.”'],
  },
};

// Ostatnie słowo zawodnika według reakcji i charakteru
const CLOSE = {
  zmotywowany: {
    _: ['Wstaje z błyskiem w oku. „Nie zawiodę pana, trenerze.”', 'Ściska rękę trenera. „Zobaczy pan na treningu.”', '„Dziękuję. Właśnie tego potrzebowałem.”', 'Wychodzi wyraźnie podbudowany.', '„Dam z siebie wszystko w najbliższym meczu.”'],
    Ambitny: ['„To mi wystarczy. Od jutra daję z siebie wszystko.”'],
    Wrażliwy: ['Widać ulgę na jego twarzy. „Dziękuję, że pan we mnie wierzy.”'],
    Lider: ['„Przekażę chłopakom, że idziemy w dobrym kierunku.”'],
    Narwaniec: ['Uderza dłonią w stół. „No to jedziemy, trenerze!”'],
  },
  spokojny: {
    _: ['Kiwa głową. „Rozumiem. Zrobię, co trzeba.”', '„Dobrze, trenerze. Dziękuję za rozmowę.”', 'Spokojnie przytakuje. „Jasne.”', '„Przemyślę to, trenerze.”', 'Uśmiecha się lekko. „Rozumiem, o co panu chodzi.”'],
    Wrażliwy: ['„Dobrze. Spróbuję, naprawdę.”'],
    Lider: ['„W porządku. Możemy na mnie liczyć.”'],
  },
  obojetny: {
    _: ['Wzrusza ramionami. „Okej.”', '„Rozumiem.” Nie wygląda na przekonanego.', 'Patrzy w telefon. „Mogę już iść?”', '„Jak pan uważa.”', 'Kiwa głową bez przekonania i wychodzi.'],
    Ambitny: ['„Słowa słowami. Wolałbym minuty na boisku.”'],
    Narwaniec: ['„No dobra, dobra.” Wychodzi, zanim trener skończy.'],
  },
  zdenerwowany: {
    _: ['Zaciska szczęki. „Nie zgadzam się z tym, trenerze.”', '„To niesprawiedliwe.” Wychodzi poirytowany.', 'Podnosi głos. „Zawsze ja, prawda?”', '„Pogadamy jeszcze o tym, trenerze.” Wychodzi zły.'],
    Wrażliwy: ['Ma łzy w oczach. „Myślałem, że pan mnie rozumie.”'],
    Narwaniec: ['Trzaska drzwiami przy wyjściu.'],
  },
  urazony: {
    _: ['Wstaje bez słowa i wychodzi.', '„Zapamiętam tę rozmowę, trenerze.” Ton jest lodowaty.', '„Skoro tak pan uważa, to chyba nie mamy o czym rozmawiać.”', 'Długo milczy, potem bez słowa wstaje od stołu.'],
    Lider: ['„Tak się nie rozmawia z zawodnikiem, który daje z siebie wszystko.”'],
    Ambitny: ['„W takim razie muszę pomyśleć o swojej przyszłości.”'],
  },
};

/** Pierwsza wypowiedź zawodnika i dopisek sytuacyjny. */
export function openingLines(game, p, sit) {
  const rng = new Rng(seedOf(game, p, 'open', 'a'));
  const bank = OPEN[p.persona] ?? OPEN.Spokojny;
  const line = pick(rng, bank[sit.mood] ?? bank.mid);
  const extraKey = sit.unhappy ? 'unhappy' : sit.bench ? 'bench' : sit.form === 'good' ? 'good' : sit.form === 'poor' ? 'poor' : null;
  return { line, note: extraKey ? pick(rng, OPEN_EXTRA[extraKey]) : null };
}

/** Trzy propozycje zdań trenera do tematu (po jednej na podejście). */
export function coachOptions(game, p, kind) {
  const rng = new Rng(seedOf(game, p, kind, 'coach'));
  return Object.keys(APPROACHES).map((a) => ({ approach: a, ...APPROACHES[a], line: pick(rng, COACH[kind]?.[a] ?? ['„Porozmawiajmy.”']) }));
}

/** Ostatnie słowo zawodnika po rozmowie. */
export function closingLine(game, p, kind, reaction) {
  const rng = new Rng(seedOf(game, p, kind, `close:${reaction}`));
  const bank = CLOSE[reaction] ?? CLOSE.obojetny;
  const own = bank[p.persona] ?? [];
  return pick(rng, own.length && rng.chance(0.5) ? own : bank._);
}

/** Liczba wariantów tekstów (do testu „dużo wariantów”). */
export function variantCount() {
  const n = (o) => Object.values(o).reduce((s, v) => s + (Array.isArray(v) ? v.length : n(v)), 0);
  return { open: n(OPEN) + n(OPEN_EXTRA), coach: n(COACH), close: n(CLOSE) };
}
