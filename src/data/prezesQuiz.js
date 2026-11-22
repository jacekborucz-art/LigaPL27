// Pula pytań prezesa do rozmowy „Poproś o zmianę dyrektora sportowego” (docs/dyrektor-sportowy.md, rozdz. 4).
// Sama dana, bez logiki gry. Prezes zadaje 4-5 pytań wylosowanych z puli, trener wybiera jedną z odpowiedzi.
//
// ------------------------------------------------------------ Placeholdery w `ask` (skąd brać wartość)
// Gra podstawia {nazwa} w tekście pytania. Imiona i nazwiska tylko w mianowniku (gra ich nie odmienia). Gdy pytanie ma `needs`, a któregoś z danych brak, pytanie nie jest losowane.
export const PLACEHOLDERS = {
  miejsce: 'obecne miejsce w tabeli ligi klubu gracza: tablePos(game, game.clubId).pos',
  cel: 'cel sezonu: game.board.goal.target (miejsce), tekst gotowy: placeGoal(target) z boardRequests.js',
  punkty: 'punkty z ostatnich {mecze} meczów ligowych klubu gracza z okresu, z rzeczownikiem: „21 punktów” (historia meczów i terminarz)',
  mecze: 'liczba meczów ligowych w okresie (najwyżej 20, razem z {okres}), z tej samej puli co {punkty}',
  bilans: 'bilans zwycięstw, remisów i porażek z okresu, tekst „7 zwycięstw, 3 remisy, 4 porażki”',
  okres: 'długość okresu w miesiącach (6-12, nie dłużej niż staż trenera w klubie), w dopełniaczu: „6 miesięcy” („w ciągu ostatnich {okres}”)',
  dyrektor: 'imię i nazwisko dyrektora sportowego: directorOf(game, game.clubId).name',
  staz: 'ile dyrektor pracuje w klubie: daysBetween(directorOf(...).since, game.date), tekst „2 lata” albo „8 miesięcy”',
  przeplata: 'liczba zakupów z okresu przepłaconych mimo sprzeciwu dyrektora (wpisy game.board.requests.dirLog z kind „buy”, bez „wycofuję się” i zerwanych rozmów)',
  przeplataKwota: 'suma przepłat z {przeplata} w zł, tekst przez zl() z boardRequests.js: suma (fee - ref) po wpisach dirLog',
  sprzeciwy: 'ile razy dyrektor sprzeciwił się transakcji trenera w okresie (dirLog), tekst „raz”, „3 razy”',
  naleganie: 'ile z tych sprzeciwów trener przełamał („nalegam”), tekst „ani razu”, „raz”, „2 razy”',
  wypozyczenia: 'wypożyczenia zawodników klubu do innych klubów w okresie (game.market.history, kind „loan”), tekst „3 wypożyczenia”',
  odprawa: 'odprawa dyrektora w zł: severanceOf(directorOf(...), game.date), tekst przez zl()',
  pensjaNowego: 'oczekiwana pensja nowego dyrektora w zł miesięcznie: wzór z docs/dyrektor-sportowy.md rozdz. 4 (10 000 x 0,9 x 1,25^(q - 10) x mnożnik ligi), tekst przez zl()',
  zaufanie: 'zaufanie zarządu do trenera 0-100: game.board.trust',
  trener: 'imię i nazwisko trenera gracza (game.manager.profile)',
  klub: 'nazwa klubu gracza: clubById(game.clubId).name',
};

// ------------------------------------------------------------ Klucze `needs` (jakie dane muszą istnieć)
// Pytanie wchodzi do losowania tylko wtedy, gdy wszystkie klucze z `needs` są dostępne. Okres danych: co najmniej 6 miesięcy
// pracy trenera w klubie z rozegranymi meczami; w innym razie pytania z danymi odpadają.
export const NEEDS = {
  table: 'tabela ligi (rozegrane co najmniej 4 mecze, jak w directorScore) i miejsce klubu',
  goal: 'cel sezonu (game.board.goal)',
  form6m: 'wyniki ligowe z co najmniej 6 miesięcy pracy trenera: {punkty}, {mecze}, {bilans}, {okres}',
  overpay6m: 'co najmniej jeden zakup z przepłatą mimo sprzeciwu dyrektora w okresie (dirLog)',
  objections6m: 'co najmniej jeden sprzeciw dyrektora w okresie (dirLog)',
  loans6m: 'co najmniej jedno wypożyczenie zawodnika klubu w okresie',
  director: 'dyrektor sportowy w klubie (nie wakat)',
  trust: 'game.board.trust',
};

// ------------------------------------------------------------ Klucze `when` (kontekst: kiedy pytanie ma sens)
// Wszystkie warunki z `when` muszą być prawdziwe, inaczej pytanie nie jest losowane.
export const WHEN = {
  directorWeak: 'jakość dyrektora d.q <= 8',
  directorStrong: 'jakość dyrektora d.q >= 13',
  coachShort: 'trener w klubie krócej niż rok (od 1. dnia pracy)',
  coachLong: 'trener w klubie co najmniej 2 lata',
  hadObjections: 'był co najmniej jeden sprzeciw dyrektora w okresie',
  belowGoal: 'miejsce w tabeli gorsze od celu (pos > goal.target)',
  aboveGoal: 'miejsce w tabeli równe celowi albo lepsze (pos <= goal.target)',
  directorFresh: 'dyrektor pracuje krócej niż rok (REQ.DIR_FRESH_DAYS)',
  lowTrust: 'zaufanie zarządu poniżej 40',
  richClub: 'wolne pieniądze klubu pokrywają odprawę (parts.money >= 0)',
  poorClub: 'odprawa obciążyłaby kasę klubu (parts.money < 0)',
};

// ------------------------------------------------------------ Klucze `cond` (prawdziwość odpowiedzi)
// cond: { is: 'klucz', else: -3 }: jeśli warunek prawdziwy, obowiązuje `score` odpowiedzi; jeśli fałszywy, obowiązuje `else`
// (zwykle ujemne: prezes zna tabelę i liczby, więc kłamstwo kosztuje). Klucze te same co w WHEN oraz:
export const COND = {
  aboveGoal: 'miejsce w tabeli równe celowi albo lepsze',
  belowGoal: 'miejsce w tabeli gorsze od celu',
  farBelowGoal: 'miejsce gorsze od celu o co najmniej 4',
  goodForm: 'punkty z okresu >= 1,6 na mecz',
  badForm: 'punkty z okresu < 1,2 na mecz',
  hadObjections: 'był sprzeciw dyrektora w okresie',
  hadOverpay: 'w okresie był zakup z przepłatą (przeplata >= 1)',
  noOverpay: 'w okresie nie było przepłaty (przeplata = 0)',
  hadLoans: 'dyrektor załatwił wypożyczenia w okresie',
  directorWeak: 'jakość dyrektora <= 8',
  directorStrong: 'jakość dyrektora >= 13',
  coachShort: 'trener krócej niż rok w klubie',
  richClub: 'kasa klubu pokrywa odprawę',
};

// ------------------------------------------------------------ Zasady `traits`
// traits: { cecha: v } z cech właściciela (cierpliwosc, ambicja, temperament, media, zasobnosc, skala 1-20).
// Modyfikator odpowiedzi = suma po cechach v x clamp((cecha - 10) / 5, -1, 1). Czyli { temperament: 1 }: porywczy prezes (20)
// ceni odpowiedź o 1 więcej, spokojny (5) o 0,5 mniej, neutralny (10) o 0. Wartości v od -1 do +1.
//
// ------------------------------------------------------------ Warianty tonu `ask`
// Ton prezesa z cech: hot gdy temperament >= 13, biz gdy zasobnosc >= 13 albo typ właściciela „spolka” albo „miliarder”,
// w innych przypadkach calm. Gdy kilka pasuje, kolejność: hot, biz, calm.
export const TONE_RULE = { hot: 'temperament >= 13', biz: 'zasobnosc >= 13 lub typ spolka/miliarder', calm: 'reszta' };

export const CATEGORIES = {
  powody: 'Powody zmiany',
  wyniki: 'Wyniki sportowe',
  transfery: 'Transfery dyrektora',
  finanse: 'Finanse',
  lojalnosc: 'Lojalność i relacje',
  wizja: 'Wizja',
  haczyk: 'Pytania podchwytliwe',
};

// ------------------------------------------------------------ Pytania
// Pola: id, cat, ask { calm, hot, biz }, needs [], when [], answers [{ text, score, traits?, cond?, reaction, reactionElse? }].
// reactionElse: reakcja prezesa, gdy warunek cond jest fałszywy (trener mija się z prawdą).
export const QUESTIONS = [
  // ---------- powody zmiany (5)
  {
    id: 'powod-glowny', cat: 'powody',
    ask: {
      calm: 'Panie Trenerze, proszę powiedzieć wprost: co jest nie tak z naszym dyrektorem sportowym?',
      hot: 'Panie Trenerze, chce pan zwolnić człowieka. Niech pan powie, za co.',
      biz: 'Panie Trenerze, proszę o konkretny powód biznesowy zmiany dyrektora sportowego.',
    },
    needs: ['director'],
    answers: [
      { text: 'Decyzje transferowe nie mają pokrycia w potrzebach drużyny, mogę to pokazać na przykładach.', score: 2, traits: { cierpliwosc: -0.5 }, reaction: 'Przykłady to coś, z czym mogę pracować.' },
      { text: 'Po prostu nie mamy wspólnego języka.', score: -1, reaction: 'To za mało, żeby ruszać człowieka w klubie.' },
      { text: 'Proszę zapytać kibiców i media, oni wiedzą lepiej.', score: -2, traits: { media: 1 }, reaction: 'Klub prowadzimy my, nie komentatorzy.' },
      { text: 'Nie chcę tego rozwijać, prosiłbym o zaufanie.', score: -3, reaction: 'Zaufanie się zdobywa liczbami, Panie Trenerze.' },
    ],
  },
  {
    id: 'powod-przyklad', cat: 'powody',
    ask: {
      calm: 'Gdyby miał pan wskazać jedną decyzję dyrektora, która pana zawiodła, jaka by to była?',
      hot: 'Jedna decyzja, Panie Trenerze. Jedna, która pana wkurzyła. Słucham.',
      biz: 'Proszę o jeden przykład decyzji dyrektora, która zaszkodziła klubowi.',
    },
    needs: ['director'],
    answers: [
      { text: 'Kupno zawodnika, którego nie potrzebowaliśmy, kosztem pozycji, na której brakowało nam ludzi.', score: 2, reaction: 'To jest sensowny zarzut, zanotowałem.' },
      { text: 'Długie negocjacje, przez które straciliśmy kandydata na rzecz rywala.', score: 1, reaction: 'Rynek nie czeka, zgoda.' },
      { text: 'Trudno wskazać jedną, to raczej ogólne wrażenie.', score: -2, reaction: 'Ogólne wrażenie nie zmienia umów.' },
      { text: 'Wszystkie. Nic mu się nie udało.', score: -3, traits: { temperament: 0.5 }, reaction: 'Skoro wszystkie, to błąd popełnił też ten, kto go zatrudnił. Czyli my.' },
    ],
  },
  {
    id: 'powod-dlugo', cat: 'powody',
    ask: {
      calm: 'Od jak dawna widzi pan ten problem? Dlaczego dopiero teraz o tym rozmawiamy?',
      hot: 'Dlaczego przychodzi pan z tym teraz, a nie miesiąc temu?',
      biz: 'Proszę o oś czasu: kiedy zauważył pan problem i co pan zrobił, zanim przyszedł pan do zarządu?',
    },
    needs: ['director'],
    answers: [
      { text: 'Rozmawiałem z dyrektorem kilka razy, nie przyniosło to zmiany, dlatego przychodzę do zarządu.', score: 2, reaction: 'Najpierw rozmowa, potem zarząd. Tak powinno być.' },
      { text: 'Dawałem mu szansę, ale wolałem nie robić zamieszania.', score: 1, reaction: 'Rozumiem, choć wolałbym wiedzieć wcześniej.' },
      { text: 'To świeża sprawa, ostatni transfer przelał czarę.', score: 0, reaction: 'Jedna sprawa to cienka podstawa.' },
      { text: 'Nie rozmawiałem z nim wcale, ale to widać.', score: -2, traits: { cierpliwosc: 0.5 }, reaction: 'Z człowiekiem się rozmawia, zanim idzie się do prezesa.' },
    ],
  },
  {
    id: 'powod-nowy-dyrektor-slaby', cat: 'powody',
    ask: {
      calm: 'Dyrektor {dyrektor} nie jest, delikatnie mówiąc, rynkową gwiazdą. Czy to jest sedno problemu?',
      hot: 'Dyrektor {dyrektor} to nie jest najlepszy fachowiec, wiem o tym. Czy właśnie to pana boli?',
      biz: 'Nasza ocena pracy dyrektora jest przeciętna. Czy zgadza się pan z tą oceną?',
    },
    needs: ['director'], when: ['directorWeak'],
    answers: [
      { text: 'Tak, jego umiejętności nie wystarczają na poziom, na którym gramy, i widać to w ofertach.', score: 2, reaction: 'Zgadzamy się w ocenie.' },
      { text: 'Nie chodzi o umiejętności, tylko o współpracę.', score: 0, reaction: 'Czyli problem jest w relacji, nie w kompetencjach?' },
      { text: 'Nie wiem, nie oceniam fachowości, tylko wyniki.', score: -1, reaction: 'Wyniki to efekt wielu rzeczy.' },
      { text: 'Jest świetny, ale potrzebuję kogoś innego.', score: -2, reaction: 'Jeśli jest świetny, po co go zmieniać?' },
    ],
  },
  {
    id: 'powod-nowy-dyrektor-mocny', cat: 'powody',
    ask: {
      calm: 'Dyrektor {dyrektor} ma w środowisku dobrą opinię. Co pan wie takiego, czego my nie wiemy?',
      hot: 'Wszyscy chwalą naszego dyrektora, a pan chce go wyrzucić. Co pan ukrywa?',
      biz: 'Dyrektor {dyrektor} ma na rynku wysoką ocenę. Jaki jest pański argument za zmianą?',
    },
    needs: ['director'], when: ['directorStrong'],
    answers: [
      { text: 'Ma dobre ruchy, ale nie dopasował rynku do mojego stylu gry i to widać w kadrze.', score: 1, reaction: 'Rozumiem argument, choć jest delikatny.' },
      { text: 'Jego opinia nie przekłada się na korzyść dla naszego klubu.', score: 0, reaction: 'Brzmi jak ogólnik.' },
      { text: 'Może się mylę, ale proszę o jeszcze jedną rozmowę z nim.', score: 2, reaction: 'Cenię, że potrafi pan przyznać wątpliwość.' },
      { text: 'To tylko opinia, ja widzę kadrę codziennie.', score: -2, traits: { cierpliwosc: 0.5 }, reaction: 'Pewność siebie to nie argument.' },
    ],
  },

  // ---------- wyniki sportowe (6)
  {
    id: 'wyniki-tabela', cat: 'wyniki',
    ask: {
      calm: 'Jesteśmy na {miejsce}. miejscu, cel to {cel}. Jak pan to ocenia?',
      hot: 'Mamy {miejsce}. miejsce w tabeli, a cel to {cel}. Co pan na to?',
      biz: 'Stan na dziś: {miejsce}. miejsce przy celu {cel}. Proszę o ocenę sytuacji sportowej.',
    },
    needs: ['table', 'goal'],
    answers: [
      { text: 'Jesteśmy na dobrej drodze, wyniki są w normie.', score: 2, cond: { is: 'aboveGoal', else: -3 }, reaction: 'Zgadza się, tabela mówi to samo.', reactionElse: 'Tabela mówi coś innego, Panie Trenerze. Nie lubię, gdy ktoś koloryzuje.' },
      { text: 'Jesteśmy za nisko i biorę za to odpowiedzialność, ale kadra też ma swoje braki.', score: 2, cond: { is: 'belowGoal', else: -1 }, reaction: 'Szczerość, nawet gdy boli.', reactionElse: 'Za nisko? Jesteśmy tam, gdzie mieliśmy być. Skąd ta skromność?' },
      { text: 'Tabela nie oddaje naszej gry, mamy pecha.', score: -2, reaction: 'Pech nie jest planem.' },
      { text: 'Gdyby nie transfery, byłoby lepiej.', score: -1, traits: { temperament: 0.5 }, reaction: 'Czyli zrzuca pan to na kogoś?' },
    ],
  },
  {
    id: 'wyniki-bilans', cat: 'wyniki',
    ask: {
      calm: 'Przez ostatnie {okres} zdobyliśmy {punkty} w {mecze} meczach ligowych, bilans: {bilans}. Czy to pana zdaniem wynik na miarę klubu?',
      hot: '{punkty} w {mecze} meczach przez {okres}. {bilans}. Pan to nazywa dobrym wynikiem?',
      biz: 'Ostatnie {okres}: {punkty} w {mecze} meczach ligowych ({bilans}). Proszę o komentarz do tej średniej.',
    },
    needs: ['form6m'],
    answers: [
      { text: 'Tak, to solidna średnia i drużyna się rozwija.', score: 2, cond: { is: 'goodForm', else: -3 }, reaction: 'Liczby się zgadzają, dziękuję.', reactionElse: 'Liczby mówią co innego. Proszę nie upiększać.' },
      { text: 'Nie, to za mało. Wiemy, gdzie tracimy punkty i nad tym pracujemy.', score: 2, cond: { is: 'badForm', else: 0 }, reaction: 'Lubię, gdy trener zna swoje problemy.', reactionElse: 'Aż tak źle nie jest, ale cenię samokrytykę.' },
      { text: 'Średnia jest do przyjęcia, ale w kadrze brakuje jakości.', score: 1, reaction: 'To już rozmowa o kadrze, wrócimy do niej.' },
      { text: 'Punkty nie mówią wszystkiego, liczy się styl.', score: -2, traits: { ambicja: -0.5 }, reaction: 'Styl nie wisi w tabeli.' },
    ],
  },
  {
    id: 'wyniki-wina', cat: 'wyniki',
    ask: {
      calm: 'Kto pana zdaniem odpowiada za wyniki z ostatnich {okres}?',
      hot: 'Kto jest winny, Panie Trenerze? Tylko szczerze.',
      biz: 'Proszę o podział odpowiedzialności za wynik sportowy z ostatnich {okres}.',
    },
    needs: ['form6m'],
    answers: [
      { text: 'Ja jako trener ponoszę główną odpowiedzialność, ale dyrektor ma w tym swój udział.', score: 2, reaction: 'Odpowiedzialność nie jest dla każdego, szanuję to.' },
      { text: 'Przede wszystkim dyrektor i jego transfery.', score: -2, traits: { temperament: -0.5 }, reaction: 'Uwaga: zrzucanie winy rzadko się opłaca.' },
      { text: 'Zawodnicy, którzy nie dają z siebie wszystkiego.', score: -1, reaction: 'Szatnia też nie zostaje bez odpowiedzi.' },
      { text: 'Wszyscy po trochu, trudno wskazać.', score: 0, reaction: 'Bezpiecznie, ale mało konkretnie.' },
    ],
  },
  {
    id: 'wyniki-cel-realny', cat: 'wyniki',
    ask: {
      calm: 'Cel to {cel}. Czy uważa go pan za realny z obecną kadrą?',
      hot: 'Cel to {cel}. Zrobi go pan czy nie?',
      biz: 'Cel sezonu: {cel}. Jaka jest pańska ocena szans jego realizacji?',
    },
    needs: ['goal', 'table'],
    answers: [
      { text: 'Tak, jesteśmy w grze i jestem spokojny.', score: 2, cond: { is: 'aboveGoal', else: -3 }, reaction: 'Tabela popiera pana słowa.', reactionElse: 'Spokojny? Przy tym miejscu w tabeli ja spokojny nie jestem.' },
      { text: 'Będzie trudno, ale nadal realny, jeśli wzmocnimy konkretne pozycje.', score: 1, cond: { is: 'belowGoal', else: 0 }, reaction: 'Konkret mi się podoba.', reactionElse: 'Trudno? Idziemy zgodnie z planem. Skąd te obawy?' },
      { text: 'Szczerze: nie, cel był zawyżony.', score: -1, traits: { ambicja: -1 }, reaction: 'Ambitnemu prezesowi takich słów się nie mówi.' },
      { text: 'Cel zależy od transferów, to nie moja decyzja.', score: -2, reaction: 'Proszę nie chować się za innymi.' },
    ],
  },
  {
    id: 'wyniki-krotki-staz', cat: 'wyniki',
    ask: {
      calm: 'Jest pan w klubie od niedawna. Czy nie za wcześnie na ocenianie pracy dyrektora?',
      hot: 'Dopiero pan przyszedł, a już krytykuje pan dyrektora. Nie za szybko?',
      biz: 'Pański staż w klubie jest krótki. Na jakiej podstawie ocenia pan współpracę z dyrektorem?',
    },
    needs: ['director'], when: ['coachShort'],
    answers: [
      { text: 'Rozumiem obawę. Poproszę o jeszcze kilka miesięcy, ale chcę, żeby zarząd miał to na oku.', score: 2, traits: { cierpliwosc: 0.5 }, reaction: 'To rozsądne podejście, Panie Trenerze.' },
      { text: 'Wystarczy mi czas, żeby zobaczyć, że to nie działa.', score: -1, reaction: 'To dużo pewności jak na krótki staż.' },
      { text: 'Znam realia, pracowałem w trudniejszych klubach.', score: 0, reaction: 'Doświadczenie się liczy, ale tu jest inny klub.' },
      { text: 'Nie ma czasu do stracenia, ten dyrektor mnie blokuje.', score: -2, traits: { temperament: -0.5 }, reaction: 'Blokuje czy sprawdza? To zasadnicza różnica.' },
    ],
  },

  // ---------- transfery dyrektora (6)
  {
    id: 'transfery-przeplata', cat: 'transfery',
    ask: {
      calm: 'W ciągu ostatnich {okres} klub przepłacił za zawodników łącznie {przeplataKwota} (liczba takich transferów: {przeplata}). Czy to pański zarzut wobec dyrektora?',
      hot: 'Przepłacone transfery: {przeplata}, razem {przeplataKwota} ponad wycenę! To pan rządzi na rynku czy dyrektor?',
      biz: 'Analiza transakcji z ostatnich {okres}: przepłacone transfery {przeplata}, łączna nadwyżka {przeplataKwota}. Kto je zatwierdził?',
    },
    needs: ['overpay6m', 'director'],
    answers: [
      { text: 'Część z tych transferów to była moja prośba, dyrektor ostrzegał, ale ja nalegałem.', score: 2, cond: { is: 'hadObjections', else: -3 }, reaction: 'Rzadko słyszę takie przyznanie. Szanuję.', reactionElse: 'Dyrektor nie zgłaszał sprzeciwu, sprawdziłem. Proszę nie wymyślać.' },
      { text: 'Tak, dyrektor źle wyceniał zawodników i płacił za dużo.', score: -2, cond: { is: 'hadOverpay', else: -3 }, reaction: 'Sprawdziłem: to była pańska prośba, dyrektor ostrzegał. Proszę uważać.' },
      { text: 'Na rynku nie ma tanich zawodników, ceny rosną wszędzie.', score: -1, reaction: 'Inne kluby jakoś sobie radzą.' },
      { text: 'Na wszystko był plan, to przemyślane inwestycje.', score: 0, traits: { zasobnosc: 0.5 }, reaction: 'Zobaczymy, czy się zwrócą.' },
    ],
  },
  {
    id: 'transfery-sprzeciwy', cat: 'transfery',
    ask: {
      calm: 'W ciągu ostatnich {okres} dyrektor {dyrektor} sprzeciwił się pańskim transakcjom {sprzeciwy}, a pan postawił na swoim {naleganie}. Co pan o tym myśli?',
      hot: 'Dyrektor mówił „nie” {sprzeciwy}, a pan zrobił po swojemu {naleganie}. Dlaczego?',
      biz: 'Sprzeciwy dyrektora w ostatnich miesiącach: {sprzeciwy}. Przełamane przez pana: {naleganie}. Jak pan to uzasadnia?',
    },
    needs: ['objections6m', 'director'],
    when: ['hadObjections'],
    answers: [
      { text: 'Dyrektor patrzy na ceny, ja na potrzeby drużyny. Nalegałem tam, gdzie jakość była warta ceny.', score: 1, reaction: 'Rozsądne, choć ryzykowne.' },
      { text: 'Dyrektor miał rację w kilku sprawach, następnym razem będę go częściej słuchać.', score: 2, traits: { cierpliwosc: -0.5 }, reaction: 'Dobrze, że to pan mówi, nie ja.' },
      { text: 'Dyrektor się czepia, a ja wiem lepiej, kogo potrzebuję.', score: -2, reaction: 'Takie podejście kosztuje klub pieniądze.' },
      { text: 'Gdyby nie moje nalegania, drużyna byłaby słabsza.', score: -1, cond: { is: 'goodForm', else: -3 }, reaction: 'Wyniki są niezłe, ale to jeszcze nie dowód.', reactionElse: 'Wyniki mówią co innego.' },
    ],
  },
  {
    id: 'transfery-kontrola', cat: 'transfery',
    ask: {
      calm: 'Czy zmiana dyrektora ma panu dać więcej swobody w transferach?',
      hot: 'Chce pan więcej władzy nad transferami, tak? Niech pan powie szczerze.',
      biz: 'Czy oczekuje pan od nowego dyrektora większej dyspozycyjności wobec pańskich propozycji transferowych?',
    },
    needs: ['director'],
    answers: [
      { text: 'Nie. Transfery to zadanie dyrektora, ja wskazuję potrzeby drużyny i zostawiam decyzję rynkową jemu.', score: 3, reaction: 'To jest podział ról, jaki chcę widzieć.' },
      { text: 'Trochę tak. Chcę mieć większy wpływ na to, kto do nas przychodzi.', score: -1, traits: { zasobnosc: 0.5 }, reaction: 'Wpływ tak, władza nie.' },
      { text: 'Tak, trener powinien mieć ostatnie słowo.', score: -3, reaction: 'Ostatnie słowo ma zarząd.' },
      { text: 'To zależy od nowego dyrektora.', score: 0, reaction: 'Odpowiedź bez treści, ale bezpieczna.' },
    ],
  },
  {
    id: 'transfery-wypozyczenia', cat: 'transfery',
    ask: {
      calm: 'W ciągu ostatnich {okres} dyrektor wypożyczył naszych zawodników do innych klubów, razem {wypozyczenia}. Czy to było dla drużyny coś warte?',
      hot: 'Dyrektor załatwił {wypozyczenia} naszych zawodników. Pomogło to drużynie czy tylko zrobiło miejsce w kadrze?',
      biz: 'Ostatnie {okres}: dyrektor przeprowadził {wypozyczenia} zawodników klubu. Proszę o ocenę wartości dla zespołu.',
    },
    needs: ['loans6m', 'director'],
    answers: [
      { text: 'Tak, młodzi grają regularnie i wrócą lepsi, a w kadrze zrobiło się miejsce. To mocna strona dyrektora.', score: 1, cond: { is: 'hadLoans', else: -2 }, reaction: 'Czyli dyrektor ma też zalety.', reactionElse: 'Jakie wypożyczenia? Nikogo nie wypożyczyliśmy.' },
      { text: 'Średnio, było kilka trafionych, kilka nie.', score: 0, reaction: 'Uczciwie.' },
      { text: 'Nie, wypożyczenia to prowizorka, potrzebuję stałych wzmocnień.', score: 0, traits: { zasobnosc: 0.5 }, reaction: 'Stałe wzmocnienia kosztują.' },
      { text: 'Nie wiem, nie śledziłem tego.', score: -2, reaction: 'Trener powinien wiedzieć, co się dzieje z jego zawodnikami.' },
    ],
  },
  {
    id: 'transfery-fachowosc', cat: 'transfery',
    ask: {
      calm: 'Czy dyrektor {dyrektor} w ogóle znajduje zawodników, których pan chce?',
      hot: 'Czy dyrektor w ogóle słucha, kogo pan chce? Bo mówi się różnie.',
      biz: 'Jak ocenia pan skuteczność dyrektora w realizacji pańskich celów transferowych?',
    },
    needs: ['director'],
    answers: [
      { text: 'Przynosi dobre opcje, ale bywa, że rynek jest szybszy niż my.', score: 1, reaction: 'To problem nie tylko nasz.' },
      { text: 'Rzadko, a gdy już, to na ostatnią chwilę.', score: 1, cond: { is: 'directorWeak', else: -1 }, reaction: 'Tak to wygląda z mojej strony też.', reactionElse: 'Z mojej strony wygląda to zupełnie inaczej.' },
      { text: 'Znajduje, ale po cenach, które mnie przerażają.', score: 0, reaction: 'Ceny to osobny temat.' },
      { text: 'Nie ufam jego ocenie zawodników.', score: -1, reaction: 'Ostre słowa.' },
    ],
  },

  // ---------- finanse (4)
  {
    id: 'finanse-odprawa', cat: 'finanse',
    ask: {
      calm: 'Odprawa dla dyrektora wyniesie {odprawa}. Czy pana zdaniem warto?',
      hot: 'Mamy zapłacić {odprawa} człowiekowi, który odejdzie. Za co ten wydatek?',
      biz: 'Koszt odprawy dyrektora: {odprawa}. Proszę o uzasadnienie zwrotu z tej decyzji.',
    },
    needs: ['director'],
    answers: [
      { text: 'Tak, zmiana zwróci się w lepszych transferach, a odprawa to jednorazowy koszt.', score: 2, traits: { zasobnosc: 0.5 }, cond: { is: 'richClub', else: 0 }, reaction: 'Liczę, że ma pan rację.', reactionElse: 'Jednorazowy, ale dziś nas na niego nie stać.' },
      { text: 'Rozumiem, że to kosztuje, i nie będę nalegał, jeśli klub nie ma pieniędzy.', score: 1, traits: { zasobnosc: -0.5 }, reaction: 'Doceniam rozsądek.' },
      { text: 'To nie mój problem, pieniądze to sprawa zarządu.', score: -2, reaction: 'Panie Trenerze, to nasze wspólne pieniądze.' },
      { text: 'Możemy zapłacić z budżetu transferowego, kupię mniej zawodników.', score: -1, cond: { is: 'richClub', else: 1 }, reaction: 'Nie tego oczekuję, ale zapamiętam gotowość.' },
    ],
  },
  {
    id: 'finanse-pensja-nowego', cat: 'finanse',
    ask: {
      calm: 'Nowy dyrektor to koszt około {pensjaNowego} miesięcznie. Czy jest pan pewien, że dostaniemy za to kogoś lepszego?',
      hot: 'Nowy dyrektor za {pensjaNowego} miesięcznie. Gdzie gwarancja, że będzie lepszy?',
      biz: 'Szacunek wynagrodzenia nowego dyrektora: {pensjaNowego} miesięcznie. Jaki jest oczekiwany zwrot?',
    },
    needs: ['director'],
    answers: [
      { text: 'Nie ma gwarancji, ale proszę o to, by zarząd wybrał dobrze, według oceny, a nie ceny.', score: 2, reaction: 'Rozsądnie, tak będzie.' },
      { text: 'Każdy będzie lepszy niż obecny.', score: -2, reaction: 'To bardzo odważne zdanie.' },
      { text: 'Mogę wskazać kandydata, którego znam z rynku.', score: -1, reaction: 'Kandydata wskażemy sami, dziękuję.' },
      { text: 'Nie interesuje mnie pensja, to sprawa zarządu.', score: -1, traits: { zasobnosc: -0.5 }, reaction: 'Ta obojętność mnie nie przekonuje.' },
    ],
  },
  {
    id: 'finanse-kasa-biedna', cat: 'finanse',
    ask: {
      calm: 'Klub nie ma teraz luzu w kasie. Dlaczego akurat teraz prosi pan o zmianę dyrektora?',
      hot: 'Jest krucho z pieniędzmi, a pan chce płacić odprawę. To rozsądne?',
      biz: 'Płynność klubu jest ograniczona, a pan wnioskuje o koszt z odprawy. Jak to uzasadnić?',
    },
    needs: ['director'], when: ['poorClub'],
    answers: [
      { text: 'Rozumiem, kasa jest napięta. Jeśli trzeba, poczekam do lepszego momentu.', score: 2, traits: { zasobnosc: -0.5 }, reaction: 'Taka postawa buduje zaufanie.' },
      { text: 'Gdybym nie uważał, że to konieczne, nie przychodziłbym.', score: 0, reaction: 'Poprawnie, ale kasa zostaje ta sama.' },
      { text: 'Pieniądze zawsze się znajdą, jeśli jest wola.', score: -2, reaction: 'Nie ja wypłacam pensje z własnej kieszeni.' },
      { text: 'Wiem, że kasa jest pusta, ale to pilne.', score: 0, reaction: 'Pilne czy wygodne?' },
    ],
  },
  {
    id: 'finanse-oszczednosci', cat: 'finanse',
    ask: {
      calm: 'Gdyby nowy dyrektor miał pracować za mniejsze pieniądze niż obecny, czy to dla pana akceptowalne?',
      hot: 'A jeśli nowy będzie tańszy i gorszy? Weźmie to pan na siebie?',
      biz: 'Czy akceptuje pan scenariusz, w którym nowy dyrektor jest tańszy, ale mniej doświadczony?',
    },
    needs: ['director'],
    answers: [
      { text: 'Tak, jeśli ma plan i uczciwie pracuje. Doświadczenie to nie wszystko.', score: 1, traits: { zasobnosc: -0.5 }, reaction: 'Praktyczne podejście.' },
      { text: 'Nie, wolę zapłacić więcej za jakość.', score: 0, traits: { zasobnosc: 0.5 }, reaction: 'Jakość kosztuje, wiem.' },
      { text: 'Zależy, kogo zarząd wybierze, ufam państwa osądowi.', score: 2, reaction: 'Dobrze, że ufa pan zarządowi.' },
      { text: 'Tylko nie ktoś gorszy od obecnego.', score: -2, cond: { is: 'directorWeak', else: 1 }, reaction: 'Gorszego od obecnego trudno będzie znaleźć, Panie Trenerze.', reactionElse: 'Rozumiem, poprzeczka wisi wysoko.' },
    ],
  },

  // ---------- lojalność i relacje (4)
  {
    id: 'lojalnosc-konflikt', cat: 'lojalnosc',
    ask: {
      calm: 'Czy między panem a dyrektorem doszło do konfliktu osobistego?',
      hot: 'Pokłócił się pan z dyrektorem? Mów pan szczerze, bo wolę usłyszeć to od pana.',
      biz: 'Czy współpraca z dyrektorem jest obciążona konfliktem personalnym?',
    },
    needs: ['director'],
    answers: [
      { text: 'Mieliśmy ostre rozmowy, ale to zawodowe różnice, nie osobiste.', score: 1, reaction: 'Fachowe różnice to normalne.' },
      { text: 'Nie, nic osobistego, cenię go jako człowieka.', score: 2, traits: { temperament: -0.5 }, reaction: 'Elegancko, Panie Trenerze.' },
      { text: 'Tak, nie mogę z nim pracować.', score: -2, reaction: 'Sprawy osobiste proszę załatwiać poza klubem.' },
      { text: 'Nie chcę o tym mówić.', score: -2, reaction: 'To mi mówi więcej niż odpowiedź.' },
    ],
  },
  {
    id: 'lojalnosc-kto-ma-racje', cat: 'lojalnosc',
    ask: {
      calm: 'Gdyby dyrektor stanął tu obok pana, co by o panu powiedział?',
      hot: 'Dyrektor mówi, że to pan jest problemem. Co pan na to?',
      biz: 'Jak tę sytuację przedstawiłby sam dyrektor? Proszę przedstawić ją uczciwie.',
    },
    needs: ['director'],
    answers: [
      { text: 'Pewnie powiedziałby, że naciskam na transfery i za rzadko słucham jego rad. Część tego jest prawdą.', score: 3, reaction: 'To najuczciwsza odpowiedź, jaką dziś słyszałem.' },
      { text: 'Skłamałby, że to ja jestem problemem.', score: -2, traits: { temperament: -0.5 }, reaction: 'Takie słowa niczego nie dowodzą.' },
      { text: 'Powiedziałby, że jest ofiarą mojej niecierpliwości.', score: 1, reaction: 'Niecierpliwość bywa zaletą trenera i wadą.' },
      { text: 'Nie wiem, nie obchodzi mnie jego opinia.', score: -2, reaction: 'A powinna. To wasz wspólny interes.' },
    ],
  },
  {
    id: 'lojalnosc-pierwszy-raz', cat: 'lojalnosc',
    ask: {
      calm: 'Czy gdyby zarząd odmówił, będzie pan potrafił z nim dalej pracować?',
      hot: 'A jak powiem „nie”, to co? Obrazi się pan? Odejdzie?',
      biz: 'W razie odmowy: jaki jest pański plan dalszej współpracy z obecnym dyrektorem?',
    },
    needs: ['director'],
    answers: [
      { text: 'Oczywiście. Jeśli zarząd odmówi, uszanuję decyzję i dalej będę pracował profesjonalnie.', score: 3, traits: { temperament: 0.5 }, reaction: 'Taka postawa jest dla mnie ważna.' },
      { text: 'Będzie trudno, ale spróbuję.', score: 0, reaction: 'Próbować to za mało, ale rozumiem.' },
      { text: 'Wtedy zastanowię się nad swoją przyszłością w klubie.', score: -3, reaction: 'Nikt tu nikogo nie szantażuje, Panie Trenerze.' },
      { text: 'Nie będę mógł odpowiadać za wyniki.', score: -3, reaction: 'To brzmi jak groźba.' },
    ],
  },
  {
    id: 'lojalnosc-zaufanie-niskie', cat: 'lojalnosc',
    ask: {
      calm: 'Nasze zaufanie do pana to teraz {zaufanie} punktów na 100. Czy w tej sytuacji to dobry moment na takie prośby?',
      hot: 'Zaufanie do pana to {zaufanie} na 100, a pan jeszcze o coś prosi?',
      biz: 'Wskaźnik zaufania zarządu: {zaufanie}/100. Czy wnioskowanie w tym momencie jest uzasadnione?',
    },
    needs: ['trust'], when: ['lowTrust'],
    answers: [
      { text: 'Rozumiem. Chciałbym najpierw odbudować zaufanie, a prośba niech zostanie rozważona później.', score: 2, traits: { cierpliwosc: 0.5 }, reaction: 'To rozsądne.' },
      { text: 'Właśnie dlatego proszę, bo problem z dyrektorem pogarsza wyniki.', score: -1, reaction: 'Argument, ale słaby.' },
      { text: 'Zaufanie to nie jest powód, żeby nie naprawiać błędów klubu.', score: -2, reaction: 'Dużo pewności jak na takie zaufanie.' },
      { text: 'Rozumiem, ale zostaję przy prośbie.', score: -1, reaction: 'Przynajmniej szczerze.' },
    ],
  },

  // ---------- wizja (4)
  {
    id: 'wizja-kogo-chce', cat: 'wizja',
    ask: {
      calm: 'Jakiego dyrektora pan potrzebuje? Proszę opisać profil.',
      hot: 'Niech pan powie, kogo pan chce. Ale uczciwie, bez imion.',
      biz: 'Proszę o profil kompetencyjny idealnego dyrektora sportowego dla naszego klubu.',
    },
    needs: ['director'],
    answers: [
      { text: 'Kogoś z dobrą znajomością rynku krajowego, który umie negocjować i mówi mi, kiedy się mylę.', score: 3, reaction: 'To profil, który pasuje i do mnie.' },
      { text: 'Kogoś, kto robi to, co ja mu mówię.', score: -3, reaction: 'To nie jest dyrektor, to sekretarz.' },
      { text: 'Kogoś znanego z nazwiska, żeby przyciągnął graczy.', score: -1, traits: { media: 0.5 }, reaction: 'Nazwisko nie zastąpi pracy.' },
      { text: 'Nie mam wizji, zdaję się na zarząd.', score: 0, reaction: 'Wygodne, ale puste.' },
    ],
  },
  {
    id: 'wizja-rola', cat: 'wizja',
    ask: {
      calm: 'Jak widzi pan podział ról między trenerem a dyrektorem sportowym?',
      hot: 'Co jest pana, a co dyrektora? Gdzie pan kończy?',
      biz: 'Proszę zdefiniować zakres odpowiedzialności trenera i dyrektora sportowego.',
    },
    needs: ['director'],
    answers: [
      { text: 'Ja prowadzę drużynę i mówię, czego potrzebuję. Dyrektor szuka, wycenia i negocjuje.', score: 3, reaction: 'Doskonale, tak to widzę.' },
      { text: 'Powinniśmy decydować razem, z moim głosem rozstrzygającym przy składzie i transferach.', score: -2, reaction: 'Z głosem rozstrzygającym niech pan nie przesadza.' },
      { text: 'Dyrektor powinien tylko wykonywać.', score: -3, reaction: 'To wizja, której tu nie ma.' },
      { text: 'Role są umowne, liczy się efekt.', score: 0, reaction: 'Efekt się liczy, ale ramy też.' },
    ],
  },
  {
    id: 'wizja-poziom-klubu', cat: 'wizja',
    ask: {
      calm: 'Czego klub potrzebuje najbardziej w najbliższych dwóch latach?',
      hot: 'Czego brakuje klubowi, Panie Trenerze? Krótko.',
      biz: 'Jakie trzy priorytety klubu widzi pan na najbliższe dwa lata?',
    },
    needs: [],
    answers: [
      { text: 'Stabilnej kadry, przemyślanego rynku i spokoju w pionie sportowym.', score: 2, traits: { cierpliwosc: 0.5 }, reaction: 'Spokój to dobra waluta.' },
      { text: 'Awansu albo miejsca w górze tabeli. Resztę da się dopasować.', score: 1, traits: { ambicja: 1 }, reaction: 'Ambicja mi się podoba.' },
      { text: 'Nowych ludzi na każdej pozycji.', score: -1, reaction: 'Rewolucja to nie plan.' },
      { text: 'Większych pieniędzy.', score: -1, traits: { zasobnosc: -0.5 }, reaction: 'Pieniądze to nie jest odpowiedź, to prośba.' },
    ],
  },
  {
    id: 'wizja-zmiana-sensu', cat: 'wizja',
    ask: {
      calm: 'Czy sądzi pan, że sama zmiana dyrektora poprawi wyniki?',
      hot: 'Czy to jest panacea? Zmienimy dyrektora i nagle będziemy wygrywać?',
      biz: 'Jaki wpływ na wyniki sportowe oczekuje pan od zmiany dyrektora, w punktach lub miejscach w tabeli?',
    },
    needs: ['table'],
    answers: [
      { text: 'Nie sama zmiana. Poprawią się transfery, ale reszta zależy od mojej pracy.', score: 2, reaction: 'Zdrowy realizm.' },
      { text: 'Tak, to rozwiąże większość problemów.', score: -2, reaction: 'Za proste, żeby było prawdziwe.' },
      { text: 'Wpływ będzie mały, ale potrzebny.', score: 0, reaction: 'Skromnie.' },
      { text: 'Obiecuję awans w tabeli o trzy miejsca.', score: -2, cond: { is: 'belowGoal', else: -3 }, reaction: 'Obietnic bez pokrycia nie przyjmuję.' },
    ],
  },

  // ---------- pytania podchwytliwe (7)
  {
    id: 'haczyk-ugoda', cat: 'haczyk',
    ask: {
      calm: 'Czy gdyby dyrektor przeprosił i zapewnił, że się zmieni, wycofałby pan prośbę?',
      hot: 'A jak dyrektor przyjdzie i powie „przepraszam”, to co? Wszystko jak było?',
      biz: 'W scenariuszu, w którym dyrektor zadeklaruje poprawę, czy podtrzymuje pan wniosek?',
    },
    needs: ['director'],
    answers: [
      { text: 'Tak, wycofam prośbę. Każdy zasługuje na szansę.', score: -2, reaction: 'Czyli to tylko kaprys? To mnie zaskakuje.' },
      { text: 'Nie, nie wystarczą słowa. Potrzebuję zmiany w pracy i zobaczę ją po kilku miesiącach.', score: 2, reaction: 'Tak, czyny są ważniejsze od słów.' },
      { text: 'Zależy od jego deklaracji.', score: 0, reaction: 'Bezpieczne, ale nic nie mówi.' },
      { text: 'Nie, jestem zdecydowany na zmianę.', score: 1, traits: { temperament: 0.5, cierpliwosc: -0.5 }, reaction: 'Zdecydowanie lubię, ale pod warunkiem argumentów.' },
    ],
  },
  {
    id: 'haczyk-winny-wyniki', cat: 'haczyk',
    ask: {
      calm: 'Czy pana zdaniem wyniki drużyny od początku sezonu to wyłączna zasługa trenera?',
      hot: 'Jak są dobre wyniki, to pan, a jak złe, to dyrektor?',
      biz: 'Jak rozkłada pan zasługi i błędy między sztab trenerski a pion sportowy w wynikach z okresu {okres}?',
    },
    needs: ['form6m'],
    answers: [
      { text: 'Zasługi dzielimy po równo, błędy także. Jestem częścią tego, co się dzieje.', score: 3, reaction: 'Tak powinien mówić lider.' },
      { text: 'Dobre wyniki to moja zasługa, słabe to wina dyrektora.', score: -3, reaction: 'To bardzo wygodny rachunek.' },
      { text: 'Wyniki mają wielu ojców, nie rozdzielam tego.', score: 0, reaction: 'Dyplomatycznie.' },
      { text: 'Gdy wyniki są dobre, nie ma o czym mówić.', score: -1, cond: { is: 'goodForm', else: -3 }, reaction: 'Dobre wyniki to nie powód, żeby nie rozmawiać.', reactionElse: 'Dobre? Tabela mówi co innego.' },
    ],
  },
  {
    id: 'haczyk-mediacje', cat: 'haczyk',
    ask: {
      calm: 'Czy rozmawiał pan o tej prośbie z dziennikarzami albo kibicami?',
      hot: 'Nie wyciekło nic do mediów? Bo jak tak, to będzie awantura.',
      biz: 'Czy treść prośby została komunikowana poza zarządem, w tym mediom lub liderom kibiców?',
    },
    needs: ['director'],
    answers: [
      { text: 'Nie. Rozmawiam o tym wyłącznie tutaj.', score: 2, traits: { media: 1 }, reaction: 'Doceniam dyskrecję.' },
      { text: 'Przez przypadek coś mogło się wymknąć w szatni.', score: -1, traits: { media: 1 }, reaction: 'Szatnia ma uszy, proszę o większą ostrożność.' },
      { text: 'Tak, kibice mają prawo wiedzieć.', score: -3, traits: { media: 1 }, reaction: 'Nie tak rozwiązujemy sprawy w tym klubie.' },
      { text: 'Powiedziałem, że rozważam taką prośbę.', score: -2, reaction: 'To już za dużo.' },
    ],
  },
  {
    id: 'haczyk-wszystko-super', cat: 'haczyk',
    ask: {
      calm: 'Gdyby wszystko szło dobrze, czy w ogóle by pan o to prosił?',
      hot: 'Przyszedłby pan z tą prośbą po zwycięstwie? Szczerze.',
      biz: 'Czy wniosek o zmianę dyrektora jest niezależny od aktualnej serii wyników?',
    },
    needs: ['form6m'],
    answers: [
      { text: 'Tak, bo problemy ze współpracą mam od dawna, wyniki ich nie zmieniają.', score: 1, cond: { is: 'hadObjections', else: -1 }, reaction: 'Widzę to też w sprzeciwach dyrektora. Rozumiem.', reactionElse: 'Od dawna? Nie widzę żadnego śladu tych problemów.' },
      { text: 'Nie, wniosek jest efektem złej serii.', score: -1, reaction: 'Szczerze, ale to nie jest dobry powód.' },
      { text: 'Wyniki są tylko dodatkowym argumentem.', score: 1, reaction: 'Dobrze, że nie jedynym.' },
      { text: 'Gdybyśmy wygrywali, nie przyszedłbym.', score: -2, reaction: 'To znaczy, że decyzja zależy od nastroju tabeli.' },
    ],
  },
  {
    id: 'haczyk-konsekwencje', cat: 'haczyk',
    ask: {
      calm: 'Jeśli zgodzimy się na zmianę i nowy dyrektor okaże się słabszy, co wtedy?',
      hot: 'A jak nowy będzie gorszy? Kto za to odpowie?',
      biz: 'Jaka jest pańska odpowiedzialność za skutki, jeśli nowy dyrektor okaże się mniej skuteczny?',
    },
    needs: ['director'],
    answers: [
      { text: 'Wtedy to także moja porażka, bo to ja prosiłem. Poniosę konsekwencje.', score: 3, reaction: 'To jest postawa, której oczekuję.' },
      { text: 'Zarząd wybiera, zarząd odpowiada.', score: -3, reaction: 'Zarząd odpowie za swoją część, pan za swoją.' },
      { text: 'Nie ma takiej możliwości, każdy będzie lepszy.', score: -2, reaction: 'Pewność bez pokrycia.' },
      { text: 'Wtedy poproszę o kolejną zmianę.', score: -2, traits: { cierpliwosc: -0.5 }, reaction: 'Karuzela dyrektorów to nie strategia.' },
    ],
  },
  {
    id: 'haczyk-lojalnosc-sciema', cat: 'haczyk',
    ask: {
      calm: 'Czy jest pan zadowolony z pracy w tym klubie ogólnie?',
      hot: 'Podoba się panu tu, czy pan szuka pretekstu, żeby odejść?',
      biz: 'Jaki jest pański poziom zadowolenia ze współpracy z zarządem i pionem sportowym?',
    },
    needs: [],
    answers: [
      { text: 'Tak, lubię ten klub i dlatego zależy mi, żeby pion sportowy działał lepiej.', score: 2, reaction: 'Dobrze to słyszeć.' },
      { text: 'Są dobre i złe dni. Dziś mówię o jednym z problemów.', score: 1, reaction: 'Uczciwie.' },
      { text: 'Szukam wyzwań, ten klub nie zawsze mi je daje.', score: -2, traits: { ambicja: -0.5 }, reaction: 'Wyzwania mamy, jeśli pan chce.' },
      { text: 'Tak, wszystko jest świetne i tylko dyrektor psuje atmosferę.', score: -2, reaction: 'Brzmi nieszczerze.' },
    ],
  },
  {
    id: 'haczyk-sam-sobie', cat: 'haczyk',
    ask: {
      calm: 'Czy nie jest tak, że chce pan zmiany po to, żeby sprowadzić sobie znajomego?',
      hot: 'Ma pan kolegę na to stanowisko, prawda? Dlatego ta cała prośba.',
      biz: 'Czy wniosek ma związek z konkretnym kandydatem z pańskiego otoczenia zawodowego?',
    },
    needs: ['director'],
    answers: [
      { text: 'Nie. Nie mam nikogo na oku, proszę zarząd o wybór według oceny i budżetu.', score: 3, reaction: 'Taką odpowiedź chciałem usłyszeć.' },
      { text: 'Znam kilku fachowców z rynku, ale decyzja należy do państwa.', score: 1, reaction: 'Uczciwe, choć nie bez ryzyka.' },
      { text: 'Tak, mam kogoś zaufanego, który zna moje metody.', score: -3, reaction: 'To jest dokładnie to, czego się obawiałem.' },
      { text: 'A co to ma do rzeczy?', score: -2, traits: { temperament: 0.5 }, reaction: 'Ma sporo do rzeczy.' },
    ],
  },
];

// ------------------------------------------------------------ Zasady użycia [SZAC] (wdrożone: src/career/presidentQuiz.js)
// Liczba pytań: 4 gdy brakuje danych (krótki staż, brak sprzeciwów), 5 gdy dostępne są dane z co najmniej 6 miesięcy.
//   Pierwsze pytanie zawsze z kategorii „powody”, ostatnie zawsze z „haczyk”, reszta z puli bez powtórzeń i bez dwóch
//   pytań z tej samej kategorii pod rząd. Wybór deterministyczny z ziarna (gra, data, klub), jak w talkDialog.js.
// Wynik quizu Q = suma po pytaniach (score wybranej odpowiedzi, z `else` gdy cond nieprawdziwy)
//   + suma modyfikatorów cech (traits). Przedział: dla 4 pytań -12..+12 (praktycznie -9..+9), dla 5 pytań -15..+15.
//   Średnia losowa odpowiedzi ok. 0, dobra gra ok. +6..+9, ugodowa ok. 0, kłamstwa i zrzucanie winy poniżej -5.
// Przełożenie na szansę zgody [SZAC], wzór oparty na directorScore (boardRequests.js):
//   S_baza = directorScore(game, date, { noRand: true }).S   (zaufanie, tabela, jakość dyrektora, staż, odprawa, właściciel, bez losu)
//   S = S_baza + 0,8 x Q + los,  los ~ jednostajny na [-5, 5]  (ten sam los co w directorScore)
//   zgoda gdy S >= 10, zgoda warunkowa gdy 6 <= S < 10, odmowa gdy S < 6.
//   Przykład: S_baza = 4, Q = +8 -> 4 + 6,4 = 10,4 +- 5: zgoda ok. 55-60 % (warunkowa ok. 25 %), odmowa ok. 15-20 %.
//   Ten sam S_baza = 4 przy Q = -6 -> -0,8 +- 5: odmowa praktycznie pewna.
//   Zmiana wobec dotychczasowej punktacji: quiz zastępuje składnik „los” częścią kontroli gracza (Q), bez zmiany progu zgody 10.
// Ograniczenie: nie więcej niż +-12 punktów S z samego quizu (0,8 x 15), więc dobry quiz nie uratuje beznadziejnej prośby
//   (np. cierpliwy właściciel, świetny dyrektor), a zły nie przekreśli oczywistej zmiany (np. dyrektor 4, wyniki daleko poniżej celu).
// Zaufanie zarządu: Q <= -6 odejmuje dodatkowo 1 (jak „odmowa”), Q >= +8 nie zmienia zaufania.
// Zgoda warunkowa (wdrożenie): zarząd sam ocenia sprawę po 182 dniach (S z dnia oceny + 1,5 Q z rozmowy, zgoda od 10),
//   do tego czasu nie przyjmuje nowej prośby o zmianę dyrektora; inny dyrektor w klubie: ocena odpada.

// ------------------------------------------------------------ Teksty końcowe prezesa
export const VERDICT_TEXTS = {
  yes: {
    calm: ['Dziękuję za szczerą rozmowę, Panie Trenerze. Zarząd zgadza się na zmianę dyrektora.', 'Rozumiem pańskie argumenty. Zajmiemy się zmianą dyrektora.'],
    hot: ['Dość, wystarczy. Mam dość tych problemów, zmieniamy dyrektora.', 'Dobrze, ma pan rację. Zmieniamy go i niech pan z nowym pracuje, a nie narzeka.'],
    biz: ['Argumenty są wystarczające, decyzja pozytywna. Proces zmiany dyrektora rozpoczynamy.', 'Rachunek się zgadza. Przyjmujemy wniosek i rozpoczynamy procedurę.'],
  },
  no: {
    calm: ['Przemyślałem to, Panie Trenerze, ale nie widzę powodów do zmiany. Wrócimy do rozmowy później.', 'Nie tym razem. Proszę wzmocnić współpracę z dyrektorem i wrócić do tematu później.'],
    hot: ['Nie. Nie dam się namówić na takie rozwiązanie. Proszę wrócić do pracy.', 'Nie będzie zmiany. Jest pan trenerem, nie dyrektorem kadr.'],
    biz: ['Wniosek odrzucony. Przesłanki nie uzasadniają kosztu i ryzyka zmiany.', 'Decyzja negatywna. Do sprawy wrócimy po zakończeniu okresu rozliczeniowego.'],
  },
  cond: {
    calm: ['Za pół roku wrócimy do tematu, Panie Trenerze. Jeśli sytuacja się nie poprawi, zmienimy dyrektora.', 'Dajemy dyrektorowi jeszcze jedną szansę, ale proszę o poprawę. Wrócimy do sprawy po rundzie.'],
    hot: ['Ostatnia szansa dla dyrektora. Za pół roku rozliczymy wszystkich: jego i pana.', 'Dobra, jeszcze pół roku. Jak nie będzie postępów, nie będę pytał nikogo o zdanie.'],
    biz: ['Decyzja warunkowa: przegląd za 6 miesięcy według wskaźników wyników i zakupów. Brak poprawy oznacza zmianę.', 'Przyjmujemy plan naprawczy. Ocena po 6 miesiącach, a przy braku poprawy zwolnienie.'],
  },
};
