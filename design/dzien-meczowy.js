// Prototyp wyglądu dnia meczowego. Dane są przykładowe i zaskryptowane;
// prawdziwy silnik i logika odpraw podłączą się w etapach 3-5.
import { crestHtml } from '../src/ui/crest.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { esc } from '../src/ui/dom.js';

const byId = new Map(CLUBS_PL.map((c) => [c.id, c]));
const HOME = byId.get('jagiellonia');
const AWAY = byId.get('lech');
const crest = (c, size) => crestHtml(c, { size, base: '../assets/crests', clubsById: byId });

// ------------------------------------------------------------ Dane przykładowe
const homeXI = [
  [1, 'Szymon Kowal', 'BR', 'Spokojny'], [2, 'Igor Bednarek', 'BO', 'Ambitny'], [4, 'Paweł Żurek', 'ŚO', 'Lider'],
  [5, 'Damian Rogala', 'ŚO', 'Spokojny'], [3, 'Oskar Lis', 'BO', 'Wrażliwy'], [6, 'Michał Kurek', 'DP', 'Narwaniec'],
  [8, 'Filip Mazur', 'DP', 'Ambitny'], [11, 'Adrian Sowa', 'SP', 'Wrażliwy'], [10, 'Tomasz Wrona', 'OP', 'Ambitny'],
  [7, 'Kamil Dudek', 'SP', 'Spokojny'], [9, 'Jakub Orzeł', 'NAP', 'Narwaniec'],
].map(([n, name, pos, persona]) => ({ n, name, pos, persona }));
const awayXI = [
  [1, 'Gajda', 'BR'], [2, 'Wolny', 'BO'], [4, 'Ptak', 'ŚO'], [5, 'Kos', 'ŚO'], [3, 'Siwiec', 'BO'], [6, 'Bąk', 'DP'],
  [8, 'Kruk', 'ŚP'], [10, 'Sroka', 'ŚP'], [11, 'Cichy', 'SN'], [9, 'Zając', 'NAP'], [7, 'Moreno', 'SN'],
].map(([n, name, pos]) => ({ n, name, pos }));

// Ustawienia (x, y w skali 0-100; gospodarz broni dołu ekranu).
const F4231 = [[50, 95], [14, 78], [37, 83], [63, 83], [86, 78], [38, 68], [62, 68], [17, 55], [50, 57], [83, 55], [50, 47]];
const F433 = [[50, 95], [14, 78], [37, 83], [63, 83], [86, 78], [50, 70], [30, 65], [70, 65], [18, 52], [50, 48], [82, 52]];
const mirror = ([x, y]) => [100 - x, 100 - y];

// Zdarzenia: t = minuta zegara (45+2 to t 47 w 1. połowie; 90+4 to t 94).
const EVENTS = [
  { half: 1, t: 1, type: 'info', text: 'Sędzia rozpoczyna mecz.' },
  { half: 1, t: 7, type: 'shot', side: 'a', text: 'Strzał Zająca z dystansu, obok bramki.' },
  { half: 1, t: 12, type: 'goal', side: 'a', text: 'GOL! Zając wykańcza podanie Sroki.', who: 'Zając' },
  { half: 1, t: 19, type: 'save', side: 'h', text: 'Orzeł uderza głową, Gajda broni.' },
  { half: 1, t: 23, type: 'yellow', side: 'h', text: 'Żółta kartka: Kurek (faul taktyczny). To jego 4. żółta, pauza w następnym meczu.' },
  { half: 1, t: 31, type: 'corner', side: 'h', text: 'Rzut rożny dla Jagiellonii, strzał Żurka nad poprzeczką.' },
  { half: 1, t: 38, type: 'goal', side: 'h', text: 'GOL! Orzeł po podaniu Wrony.', who: 'Orzeł' },
  { half: 1, t: 47, type: 'end', text: 'Koniec pierwszej połowy.' },
  { half: 2, t: 46, type: 'info', text: 'Początek drugiej połowy.' },
  { half: 2, t: 52, type: 'post', side: 'a', text: 'Słupek! Moreno trafia w obramowanie bramki.' },
  { half: 2, t: 58, type: 'sub', side: 'h', text: 'Zmiana: Horvat za Sowę (okno 1 z 3).' },
  { half: 2, t: 64, type: 'var', side: 'h', text: 'VAR sprawdza możliwy rzut karny po faulu na Orle.' },
  { half: 2, t: 66, type: 'pen', side: 'h', text: 'Rzut karny dla Jagiellonii po analizie VAR.' },
  { half: 2, t: 67, type: 'goal', side: 'h', text: 'GOL! Wrona pewnie z rzutu karnego.', who: 'Wrona' },
  { half: 2, t: 75, type: 'yellow', side: 'a', text: 'Żółta kartka: Kos (dyskusja z sędzią).' },
  { half: 2, t: 81, type: 'sub', side: 'a', text: 'Podwójna zmiana w Lechu (okno 2 z 3).' },
  { half: 2, t: 88, type: 'save', side: 'a', text: 'Groźny strzał Kruka, Kowal broni na rzut rożny.' },
  { half: 2, t: 94, type: 'end', text: 'Koniec meczu. Jagiellonia wygrywa 2:1.' },
];
const HALF_END = { 1: 47, 2: 94 };
const FINAL = {
  poss: [47, 53], shots: [13, 11], onT: [5, 4], xg: [1.62, 1.18], passes: [412, 468], acc: [79, 83],
  corners: [6, 5], fouls: [12, 14], offs: [2, 3], yellow: [1, 1], saves: [3, 3], throws: [21, 19],
};
const STAT_ROWS = [
  ['poss', 'Posiadanie %'], ['shots', 'Strzały'], ['onT', 'Celne'], ['xg', 'xG'], ['passes', 'Podania'],
  ['acc', 'Celność podań %'], ['corners', 'Rożne'], ['throws', 'Auty'], ['fouls', 'Faule'], ['offs', 'Spalone'],
  ['yellow', 'Żółte kartki'], ['saves', 'Obrony'],
];

// Momentum: deterministyczny szum + piki przy zdarzeniach.
const MOMENTUM = Array.from({ length: 95 }, (_, i) => {
  const base = Math.sin(i / 6.5) * 28 + Math.sin(i / 2.3) * 14 - 6;
  const ev = EVENTS.filter((e) => e.side && Math.abs(e.t - i) <= 2 && (i <= 47 ? e.half === 1 : e.half === 2));
  const kick = ev.reduce((s, e) => s + (e.side === 'h' ? 38 : -38) * (1 - Math.abs(e.t - i) / 3), 0);
  return Math.max(-100, Math.min(100, Math.round(base + kick)));
});

// ------------------------------------------------------------ Stan prototypu
const STEPS = [
  ['studio', 'Studio'], ['odprawa', 'Odprawa'], ['mecz1', '1. połowa'], ['przerwa', 'Przerwa'],
  ['odprawa2', 'Odprawa w przerwie'], ['mecz2', '2. połowa'], ['studio2', 'Studio pomeczowe'], ['odprawa3', 'Odprawa pomeczowa'],
];
const st = { step: 0, clock: { half: 1, t: 0, running: false, speed: 1, goalUntil: 0 }, feed: [], score: [0, 0], talkDone: {}, tab: 'stats' };

const screen = document.getElementById('screen');
const bar = document.getElementById('actionbar');
const rail = document.getElementById('rail');

function go(i) {
  stopClock();
  st.step = Math.max(0, Math.min(STEPS.length - 1, i));
  render();
  screen.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function renderRail() {
  rail.innerHTML = STEPS.map(([, label], i) => `<li><button data-go="${i}" ${i === st.step ? 'aria-current="step"' : ''} class="${i < st.step ? 'done' : ''}"><span class="n">${i + 1}</span>${esc(label)}</button></li>`).join('');
  rail.querySelector('[aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function render() {
  renderRail();
  const id = STEPS[st.step][0];
  ({ studio: studioPre, odprawa: () => talk('pre'), mecz1: () => live(1), przerwa: halftime, odprawa2: () => talk('ht'), mecz2: () => live(2), studio2: studioPost, odprawa3: () => talk('post') })[id]();
}

const action = (label, onClick, primary = true) => {
  bar.innerHTML = `<button class="btn ${primary ? 'btn--primary' : 'btn--quiet'}" id="next">${esc(label)}</button>`;
  bar.querySelector('#next').onclick = onClick;
};

// ------------------------------------------------------------ 1. Studio przedmeczowe
function fixtureHead(minuteLabel = 'Pt, 20:30') {
  return `<div class="fixture">
    <div class="fixture__team">${crest(HOME, 64)}${esc(HOME.name)}</div>
    <div class="fixture__mid"><span class="led">${esc(minuteLabel)}</span></div>
    <div class="fixture__team">${crest(AWAY, 64)}${esc(AWAY.name)}</div>
  </div>`;
}

function studioPre() {
  screen.innerHTML = `
  <h1>Studio przedmeczowe</h1>
  ${fixtureHead()}
  <p class="fixture__meta">Ekstraklasa, 2. kolejka, Jul 31, 2026. Stadion Miejski w Białymstoku.</p>
  <div class="studio-cols">
  <section class="sec">
    <h2>Szanse</h2>
    <div class="odds" role="img" aria-label="Wygrana gospodarzy 41 procent, remis 27, wygrana gości 32">
      <span class="h" style="width:41%">41%</span><span class="d" style="width:27%">27%</span><span class="a" style="width:32%">32%</span>
    </div>
    <div class="odds-legend"><span>Jagiellonia</span><span>Remis</span><span>Lech</span></div>
  </section>
  <section class="sec">
    <h2>Forma i tabela</h2>
    <div class="form-row"><span>${crest(HOME, 22)} 3. miejsce, 3 pkt</span>${form('WWRPW')}</div>
    <div class="form-row"><span>${crest(AWAY, 22)} 6. miejsce, 1 pkt</span>${form('WRWWR')}</div>
    <p class="hint">Bilans ostatnich 5 spotkań: 2 wygrane Jagiellonii, 1 remis, 2 wygrane Lecha.</p>
  </section>
  <section class="sec">
    <h2>Absencje</h2>
    <ul class="plain-list">
      <li><span class="k">Jagiellonia</span><span>Nowicki, uraz kolana, wraca za ok. 3 tygodnie</span></li>
      <li><span class="k">Lech</span><span>Moreno gra mimo lekkiego urazu. Bez pauzujących.</span></li>
    </ul>
  </section>
  <section class="sec">
    <h2>Warunki</h2>
    <ul class="plain-list">
      <li><span class="k">Pogoda</span><span>22°C, bezchmurnie, lekki wiatr</span></li>
      <li><span class="k">Murawa</span><span>Bardzo dobra</span></li>
      <li><span class="k">Sędzia</span><span>Marek Wierzbicki, surowy: średnio 4,9 żółtej kartki na mecz</span></li>
      <li><span class="k">Kibice</span><span>Ok. 18 tys., komplet na trybunie za bramką</span></li>
    </ul>
  </section>
  <section class="sec">
    <h2>Raport asystenta</h2>
    <blockquote class="assistant">Lech gra 4-3-3 i atakuje wysokim pressingiem. Długie podania na Orła omijają ich pierwszą linię. Uważaj na Kurka: ma 3 żółte kartki, kolejna oznacza pauzę.
      <footer>Asystent trenera</footer></blockquote>
  </section>
  <section class="sec">
    <h2>Oczekiwania</h2>
    <ul class="plain-list">
      <li><span class="k">Zarząd</span><span>Remis z faworytem będzie do przyjęcia.</span></li>
      <li><span class="k">Kibice</span><span>Liczą na zwycięstwo po dobrym starcie sezonu.</span></li>
    </ul>
  </section>
  </div>
  <section class="sec">
    <h2>Nagłówki dnia</h2>
    <ul class="headlines">
      <li>Jagiellonia chce zatrzymać pressing mistrza<small>Zapowiedź kolejki</small></li>
      <li>Orzeł: „U siebie nikogo się nie boimy”<small>Wywiad przedmeczowy</small></li>
      <li>Surowy sędzia na hicie kolejki<small>Obsada sędziowska</small></li>
    </ul>
  </section>`;
  action('Przejdź do odprawy', () => go(1));
}

const form = (s) => `<span class="form" aria-label="Forma: ${[...s].map((c) => ({ W: 'wygrana', R: 'remis', P: 'porażka' })[c]).join(', ')}">${[...s].map((c) => `<b class="${c}">${c}</b>`).join('')}</span>`;

// ------------------------------------------------------------ 2, 5, 8. Odprawy
const TONES = {
  pre: [
    ['spokoj', 'Trzymamy plan', 'Spokojny ton, bez dodatkowej presji.'],
    ['pochwala', 'Pochwała', 'Przypomnij dobre mecze i zbuduj pewność siebie.'],
    ['wymagam', 'Wymagam więcej', 'Postaw wysoką poprzeczkę.'],
    ['krzyk', 'Złość', 'Mocne słowa. Działa na twardych, wrażliwi mogą się spiąć.'],
    ['bezpresji', 'Nie macie nic do stracenia', 'Zdejmij presję przed meczem z faworytem.'],
    ['obrona', 'Skupienie na obronie', 'Najpierw nie stracić bramki.'],
  ],
  post: [
    ['pochwala', 'Pochwała', 'Doceń wynik i postawę zespołu.'],
    ['neutralnie', 'Neutralnie', 'Krótko, bez emocji.'],
    ['krytyka', 'Krytyka', 'Wskaż błędy mimo wyniku.'],
    ['kolejny', 'Skupienie na kolejnym meczu', 'Odetnij emocje i myśl o następnym rywalu.'],
  ],
};
TONES.ht = TONES.pre;
const ONE2ONE = {
  pre: ['Podbuduj', 'Wymagaj więcej', 'Uspokój', 'Ostrzeż przed kartką', 'Daj wolną rękę'],
  post: ['Pochwal', 'Skrytykuj', 'Porozmawiaj o roli'],
};
ONE2ONE.ht = ONE2ONE.pre;

// Przykładowa tabela reakcji (prawdziwą logikę dostarczy ekspert od odpraw).
const REACT = {
  krzyk: { Wrażliwy: 'urażony', Narwaniec: 'zmotywowany', Lider: 'zmotywowany', Ambitny: 'zdenerwowany', Spokojny: 'obojętny' },
  wymagam: { Wrażliwy: 'zdenerwowany', Ambitny: 'zmotywowany', Lider: 'zmotywowany', Narwaniec: 'zmotywowany', Spokojny: 'spokojny' },
  pochwala: { Wrażliwy: 'zmotywowany', Ambitny: 'obojętny', Lider: 'spokojny', Narwaniec: 'spokojny', Spokojny: 'zmotywowany' },
  krytyka: { Wrażliwy: 'urażony', Ambitny: 'zdenerwowany', Lider: 'spokojny', Narwaniec: 'urażony', Spokojny: 'obojętny' },
};
const reaction = (tone, persona, i) => REACT[tone]?.[persona] ?? ['spokojny', 'zmotywowany', 'obojętny'][i % 3];

function talk(kind) {
  const ctx = {
    pre: 'Mecz u siebie z mistrzem Polski. Drużyna w dobrej formie, kibice liczą na zwycięstwo.',
    ht: 'Przerwa przy 1:1. Mamy więcej strzałów, ale Lech dłużej utrzymuje się przy piłce. Zmiany w przerwie nie zużywają okna.',
    post: 'Wygrana 2:1 z mistrzem. Kurek pauzuje w następnym meczu.',
  }[kind];
  const title = { pre: 'Odprawa przedmeczowa', ht: 'Odprawa w przerwie', post: 'Odprawa pomeczowa' }[kind];
  const done = st.talkDone[kind];
  const tones = TONES[kind];
  const chosen = done?.tone ?? tones[0][0];
  screen.innerHTML = `
  <h1>${title}</h1>
  <p class="talk-ctx">${esc(ctx)}</p>
  <h2>Przemowa do drużyny</h2>
  <fieldset class="tones" ${done ? 'disabled' : ''}>
    <legend class="hint">Wybierz ton. Ta sama przemowa powtarzana mecz po meczu działa słabiej.</legend>
    ${tones.map(([id, name, desc]) => `<label class="tone"><input type="radio" name="tone" value="${id}" ${id === chosen ? 'checked' : ''}><div><strong>${esc(name)}</strong><span>${esc(desc)}</span></div></label>`).join('')}
  </fieldset>
  <h2>Rozmowy indywidualne</h2>
  <p class="hint">Maksymalnie 3 zawodników. Reakcje zobaczysz po odprawie.</p>
  <ul class="players">
    ${homeXI.map((p, i) => `<li class="prow"><span class="num">${p.n}</span>
      <span class="pname">${esc(p.name)}<small>${esc(p.pos)}, ${esc(p.persona)}${p.n === 6 && kind !== 'post' ? ', zagrożony pauzą' : ''}</small></span>
      ${done ? `<span class="react" data-r="${reaction(done.one2one[p.n] ? 'wymagam' : done.tone, p.persona, i)}">${reaction(done.one2one[p.n] ? 'wymagam' : done.tone, p.persona, i)}</span>`
    : `<select class="pick-select" data-n="${p.n}" aria-label="Rozmowa z: ${esc(p.name)}"><option value="">Bez rozmowy</option>${ONE2ONE[kind].map((o) => `<option>${esc(o)}</option>`).join('')}</select>`}
    </li>`).join('')}
  </ul>
  ${kind === 'post' ? pressConference(done) : ''}`;

  if (!done) {
    const selects = [...screen.querySelectorAll('.pick-select')];
    const sync = () => {
      const used = selects.filter((s) => s.value).length;
      selects.forEach((s) => { s.disabled = !s.value && used >= 3; });
    };
    selects.forEach((s) => s.addEventListener('change', sync));
    action('Wygłoś odprawę', () => {
      const tone = screen.querySelector('input[name="tone"]:checked').value;
      const one2one = Object.fromEntries(selects.filter((s) => s.value).map((s) => [s.dataset.n, s.value]));
      st.talkDone[kind] = { tone, one2one };
      talk(kind);
    });
  } else {
    const next = { pre: ['Wyjdź na boisko', 2], ht: ['Rozpocznij 2. połowę', 5], post: ['Zakończ dzień meczowy', 0] }[kind];
    action(next[0], () => { if (kind === 'post') resetDay(); go(next[1]); });
  }
}

function pressConference(done) {
  const qs = [
    ['Czy to zwycięstwo zmienia cele Jagiellonii?', ['Gramy o mistrzostwo', 'Krok po kroku', 'Nie zmieniamy celów']],
    ['Kurek pauzuje. Jak go zastąpicie?', ['Mamy szeroką kadrę', 'To duża strata', 'Bez komentarza']],
  ];
  return `<h2>Konferencja prasowa</h2>
    ${qs.map(([q, ans], qi) => `<fieldset class="qa" ${done ? 'disabled' : ''}><p>${esc(q)}</p>
      ${ans.map((a, ai) => `<label class="tone"><input type="radio" name="q${qi}" ${ai === 1 ? 'checked' : ''}><div><strong>${esc(a)}</strong></div></label>`).join('')}
    </fieldset>`).join('')}`;
}

function resetDay() {
  st.clock = { half: 1, t: 0, running: false, speed: 1, goalUntil: 0 };
  st.feed = []; st.score = [0, 0]; st.talkDone = {};
}

// ------------------------------------------------------------ 3, 6. Mecz na żywo
let timer = null;
let raf = null;
let canvas; let ctx2d; let dots = []; let ro;

function minuteLabel(half, t) {
  if (half === 1 && t > 45) return `45+${t - 45}'`;
  if (half === 2 && t > 90) return `90+${t - 90}'`;
  return `${t}'`;
}

function live(half) {
  if (half === 2 && !st.feed.some((e) => e.half === 1 && e.type === 'end')) {
    st.clock.half = 1;
    while (st.clock.t < HALF_END[1]) { st.clock.t += 1; applyEvents(1, st.clock.t, false); }
  }
  if (st.clock.half !== half) { st.clock.half = half; st.clock.t = half === 1 ? 0 : 45; }
  screen.innerHTML = `
  <div class="live">
    <div class="board" aria-live="off">
      <div class="board__t">${crest(HOME, 30)}<span>${HOME.short}</span></div>
      <div><div class="board__score" id="score">${st.score[0]}:${st.score[1]}</div><span class="board__min" id="min">${minuteLabel(half, st.clock.t)}</span></div>
      <div class="board__t"><span>${AWAY.short}</span>${crest(AWAY, 30)}</div>
    </div>
    <div class="mom-area">
      <svg class="momentum" id="mom" viewBox="0 0 95 56" preserveAspectRatio="none" role="img" aria-label="Momentum meczu"></svg>
      <div class="poss" style="margin-top:8px"><span id="ph">50%</span><div class="bar2"><i class="bh" id="pbh" style="width:50%"></i><i class="ba" id="pba" style="width:50%"></i></div><span id="pa">50%</span></div>
    </div>
    <div class="pitch-area pitch-wrap">
      <canvas class="pitch" id="pitch" aria-label="Boisko z ustawieniem drużyn"></canvas>
      <div class="goal" id="goal" role="status"><div><b>GOL</b><small id="goalwho"></small></div></div>
    </div>
    <div class="ctrl-area">
      <div class="controls">
        <button class="btn btn--quiet" id="pause">Start</button>
        <button class="btn btn--quiet speed" data-s="1" aria-pressed="true">x1</button>
        <button class="btn btn--quiet speed" data-s="4" aria-pressed="false">x4</button>
        <button class="btn btn--quiet" data-dlg="zmiany">Zmiany</button>
        <button class="btn btn--quiet" data-dlg="taktyka">Taktyka</button>
        <button class="btn btn--quiet" data-dlg="okrzyk">Okrzyk</button>
      </div>
    </div>
    <div class="feed-area"><h2>Relacja</h2><ul class="feed" id="feed"></ul></div>
    <div class="side-area">
      <div class="tabs2" role="tablist">
        <button role="tab" data-tab="stats" aria-selected="${st.tab === 'stats'}">Statystyki</button>
        <button role="tab" data-tab="lineups" aria-selected="${st.tab === 'lineups'}">Składy</button>
      </div>
      <div id="side"></div>
    </div>
  </div>
  <dialog id="dlg" class="panel" style="max-width:520px;width:calc(100% - 32px);border:0"></dialog>`;

  canvas = screen.querySelector('#pitch');
  ctx2d = canvas.getContext('2d');
  dots = layoutDots(true);
  ro?.disconnect();
  ro = new ResizeObserver(() => sizeCanvas());
  ro.observe(canvas);
  sizeCanvas();
  drawMomentum();
  renderFeed();
  renderSide();
  updatePossession();

  screen.querySelector('#pause').onclick = () => (st.clock.running ? stopClock() : startClock());
  screen.querySelectorAll('.speed').forEach((b) => (b.onclick = () => {
    st.clock.speed = Number(b.dataset.s);
    screen.querySelectorAll('.speed').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (st.clock.running) { stopClock(); startClock(); }
  }));
  screen.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { st.tab = b.dataset.tab; screen.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b))); renderSide(); }));
  screen.querySelectorAll('[data-dlg]').forEach((b) => (b.onclick = () => openDialog(b.dataset.dlg)));

  const end = HALF_END[half];
  if (st.clock.t >= end) finishedHalf(half);
  else action('Pokaż wynik od razu', () => skipHalf(half), false);
}

function startClock() {
  st.clock.running = true;
  screen.querySelector('#pause').textContent = 'Pauza';
  timer = setInterval(tick, 1000 / st.clock.speed);
}
function stopClock() {
  st.clock.running = false;
  clearInterval(timer); timer = null;
  const b = screen.querySelector('#pause'); if (b) b.textContent = 'Wznów';
}

function tick() {
  if (Date.now() < st.clock.goalUntil) return; // GOL zatrzymuje czas na 3 s
  const half = st.clock.half;
  st.clock.t += 1;
  applyEvents(half, st.clock.t, true);
  screen.querySelector('#min').textContent = minuteLabel(half, st.clock.t);
  dots = layoutDots(false);
  animateDots();
  drawMomentum(); renderSide(); updatePossession();
  if (st.clock.t >= HALF_END[half]) { stopClock(); finishedHalf(half); }
}

function applyEvents(half, t, show) {
  for (const e of EVENTS.filter((x) => x.half === half && x.t === t)) {
    st.feed.unshift({ ...e, label: minuteLabel(half, t) });
    if (e.type === 'goal') {
      st.score[e.side === 'h' ? 0 : 1] += 1;
      const sc = screen.querySelector('#score'); if (sc) sc.textContent = `${st.score[0]}:${st.score[1]}`;
      if (show) {
        st.clock.goalUntil = Date.now() + 3000;
        const g = screen.querySelector('#goal');
        screen.querySelector('#goalwho').textContent = `${e.who}, ${e.side === 'h' ? HOME.name : AWAY.name}`;
        g.classList.add('on');
        setTimeout(() => g.classList.remove('on'), 3000);
      }
    }
  }
  renderFeed();
}

function skipHalf(half) {
  stopClock();
  while (st.clock.t < HALF_END[half]) { st.clock.t += 1; applyEvents(half, st.clock.t, false); }
  screen.querySelector('#min').textContent = minuteLabel(half, st.clock.t);
  dots = layoutDots(true); drawPitch(); drawMomentum(); renderSide(); updatePossession();
  finishedHalf(half);
}

function finishedHalf(half) {
  action(half === 1 ? 'Przerwa' : 'Studio pomeczowe', () => go(half === 1 ? 3 : 6));
}

function renderFeed() {
  const f = screen.querySelector('#feed'); if (!f) return;
  f.innerHTML = st.feed.map((e) => `<li class="${e.type === 'goal' ? 'goalrow' : ''}"><span class="m">${e.label}</span><span>${e.type === 'yellow' ? '<i class="card-ico y" aria-hidden="true"></i>' : ''}${esc(e.text)}</span></li>`).join('') || '<li><span class="m"></span><span class="hint">Naciśnij Start. 1 minuta meczu trwa 1 sekundę.</span></li>';
}

function progress() { return Math.min(1, st.clock.t / 94); }
function statVal(key, side) {
  const v = FINAL[key][side];
  if (key === 'poss' || key === 'acc') return v;
  const goalsDone = key === 'yellow' ? st.feed.filter((e) => e.type === 'yellow' && e.side === (side ? 'a' : 'h')).length : null;
  if (goalsDone !== null) return goalsDone;
  const x = v * progress();
  return key === 'xg' ? x.toFixed(2) : Math.round(x);
}
function renderSide() {
  const el = screen.querySelector('#side'); if (!el) return;
  if (st.tab === 'stats') el.innerHTML = statsTable((k, s) => statVal(k, s));
  else el.innerHTML = `<ul class="plain-list">${homeXI.map((p, i) => `<li><span class="k">${p.n}. ${esc(p.pos)}</span><span style="flex:1">${esc(p.name)}</span><span class="hint">${esc(awayXI[i].n + '. ' + awayXI[i].name)}</span></li>`).join('')}</ul>`;
}
function statsTable(get) {
  return `<table class="vs"><tbody>${STAT_ROWS.map(([k, lbl]) => {
    const h = Number(get(k, 0)); const a = Number(get(k, 1)); const tot = h + a || 1;
    return `<tr><td>${get(k, 0)}</td><td class="lbl">${esc(lbl)}<div class="bar2"><i class="bh" style="width:${(h / tot) * 100}%"></i><i class="ba" style="width:${(a / tot) * 100}%"></i></div></td><td>${get(k, 1)}</td></tr>`;
  }).join('')}</tbody></table>`;
}
function updatePossession() {
  const t = Math.max(1, st.clock.t);
  const h = Math.round(50 + (FINAL.poss[0] - 50) * Math.min(1, t / 20) + Math.sin(t / 5) * 2);
  const set = (id, v) => { const n = screen.querySelector(id); if (n) n.textContent = `${v}%`; };
  set('#ph', h); set('#pa', 100 - h);
  const bh = screen.querySelector('#pbh'); const ba = screen.querySelector('#pba');
  if (bh) { bh.style.width = `${h}%`; ba.style.width = `${100 - h}%`; }
}

function drawMomentum() {
  const svg = screen.querySelector('#mom'); if (!svg) return;
  const upto = st.clock.half === 1 ? Math.min(st.clock.t, 47) : st.clock.t;
  let bars = '<line x1="0" y1="28" x2="95" y2="28" stroke="currentColor" stroke-opacity=".25" stroke-width=".4"/>';
  bars += '<line x1="47.5" y1="2" x2="47.5" y2="54" stroke="currentColor" stroke-opacity=".25" stroke-width=".3" stroke-dasharray="1 1"/>';
  for (let i = 1; i <= upto; i++) {
    const v = MOMENTUM[i]; const hgt = Math.abs(v) / 100 * 26;
    bars += `<rect x="${i - 0.9}" y="${v >= 0 ? 28 - hgt : 28}" width=".8" height="${Math.max(0.6, hgt)}" fill="${v >= 0 ? 'var(--home)' : 'var(--away)'}"/>`;
  }
  for (const e of st.feed.filter((x) => x.type === 'goal')) {
    const x = e.half === 1 ? Math.min(e.t, 47) : e.t;
    bars += `<rect x="${x - 1.1}" y="${e.side === 'h' ? 0 : 50}" width="1.2" height="6" fill="var(--led)"/>`;
  }
  svg.style.color = 'var(--text)';
  svg.innerHTML = bars;
}

// Boisko
function sizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawPitch();
}
function layoutDots(reset) {
  const t = st.clock.t;
  const homeHasBall = MOMENTUM[Math.min(94, t)] >= 0;
  const jitter = (i, k) => Math.sin(t * 1.7 + i * 3.1 + k) * 2.4;
  const home = F4231.map(([x, y], i) => ({ x: x + jitter(i, 0), y: y + (i === 0 ? 0 : homeHasBall ? -12 : 3) + jitter(i, 1), side: 'h', n: homeXI[i].n }));
  const away = F433.map(mirror).map(([x, y], i) => ({ x: x + jitter(i, 2), y: y + (i === 0 ? 0 : homeHasBall ? -3 : 12) + jitter(i, 3), side: 'a', n: awayXI[i].n }));
  const next = [...home, ...away];
  if (reset || !dots.length) return next.map((d) => ({ ...d, fx: d.x, fy: d.y, tx: d.x, ty: d.y }));
  return next.map((d, i) => ({ ...d, fx: dots[i].x, fy: dots[i].y, tx: d.x, ty: d.y, x: dots[i].x, y: dots[i].y }));
}
function animateDots() {
  cancelAnimationFrame(raf);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = Math.min(800, 900 / st.clock.speed);
  const t0 = performance.now();
  const step = (now) => {
    const k = reduce ? 1 : Math.min(1, (now - t0) / dur);
    const e = k * (2 - k);
    dots.forEach((d) => { d.x = d.fx + (d.tx - d.fx) * e; d.y = d.fy + (d.ty - d.fy) * e; });
    drawPitch();
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function drawPitch() {
  if (!ctx2d) return;
  const W = canvas.getBoundingClientRect().width; const H = canvas.getBoundingClientRect().height;
  const X = (x) => (x / 100) * W; const Y = (y) => (y / 100) * H;
  ctx2d.clearRect(0, 0, W, H);
  for (let i = 0; i < 12; i++) { ctx2d.fillStyle = i % 2 ? '#25793F' : '#1E6B3A'; ctx2d.fillRect(0, (i * H) / 12, W, H / 12 + 1); }
  ctx2d.strokeStyle = 'rgba(243,246,241,.85)'; ctx2d.lineWidth = 1.5;
  const m = 4;
  ctx2d.strokeRect(X(m), Y(m * 0.7), X(100 - 2 * m), Y(100 - 1.4 * m));
  ctx2d.beginPath(); ctx2d.moveTo(X(m), Y(50)); ctx2d.lineTo(X(100 - m), Y(50)); ctx2d.stroke();
  ctx2d.beginPath(); ctx2d.arc(X(50), Y(50), W * 0.13, 0, Math.PI * 2); ctx2d.stroke();
  for (const top of [true, false]) {
    const y0 = top ? Y(m * 0.7) : Y(100 - m * 0.7);
    const dir = top ? 1 : -1;
    ctx2d.strokeRect(X(21), y0, X(58), dir * H * 0.16);
    ctx2d.strokeRect(X(37), y0, X(26), dir * H * 0.055);
    ctx2d.beginPath(); ctx2d.arc(X(50), y0 + dir * H * 0.11, 1.8, 0, Math.PI * 2); ctx2d.fillStyle = 'rgba(243,246,241,.85)'; ctx2d.fill();
  }
  const r = Math.max(9, Math.min(14, W * 0.032));
  ctx2d.font = `700 ${Math.round(r * 1.05)}px "Barlow Condensed", sans-serif`;
  ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
  for (const d of dots) {
    ctx2d.beginPath(); ctx2d.arc(X(d.x), Y(d.y), r, 0, Math.PI * 2);
    ctx2d.fillStyle = d.side === 'h' ? '#FFD100' : '#0055A5'; ctx2d.fill();
    ctx2d.lineWidth = 1.5; ctx2d.strokeStyle = d.side === 'h' ? '#14211A' : '#F3F6F1'; ctx2d.stroke();
    ctx2d.fillStyle = d.side === 'h' ? '#14211A' : '#FFFFFF'; ctx2d.fillText(String(d.n), X(d.x), Y(d.y) + 1);
  }
  const ball = dots.filter((d) => d.side === (MOMENTUM[Math.min(94, st.clock.t)] >= 0 ? 'h' : 'a'))[9] || dots[0];
  ctx2d.beginPath(); ctx2d.arc(X(ball.x) + r * 0.9, Y(ball.y) - r * 0.9, r * 0.38, 0, Math.PI * 2);
  ctx2d.fillStyle = '#FFFFFF'; ctx2d.fill(); ctx2d.strokeStyle = '#14211A'; ctx2d.lineWidth = 1; ctx2d.stroke();
}

function openDialog(kind) {
  const dlg = screen.querySelector('#dlg');
  const body = {
    zmiany: `<h2>Zmiany</h2><p>Zostało: 5 zmian w 3 oknach. Zmiany w przerwie nie zużywają okna.</p>
      <ul class="plain-list"><li><span class="k">Schodzi</span><span>11. Adrian Sowa, świeżość 62%</span></li><li><span class="k">Wchodzi</span><span>17. Luka Horvat, SN</span></li></ul>`,
    taktyka: `<h2>Taktyka</h2><p class="hint">Zmiana działa w pełni po kilku minutach. Częste zmiany obniżają spójność drużyny.</p>
      <ul class="plain-list"><li><span class="k">Nastawienie</span><span>Zrównoważone</span></li><li><span class="k">Tempo</span><span>Normalne</span></li><li><span class="k">Podania</span><span>Mieszane</span></li><li><span class="k">Pressing</span><span>Średni</span></li><li><span class="k">Kontratak</span><span>Tak</span></li><li><span class="k">Spójność</span><span>92 na 100</span></li></ul>`,
    okrzyk: `<h2>Okrzyk z linii bocznej</h2><p class="hint">Kolejny okrzyk możliwy za 8 minut.</p>
      <ul class="plain-list"><li><span>Naprzód!</span></li><li><span>Uwaga z tyłu!</span></li><li><span>Spokojnie!</span></li><li><span>Więcej walki!</span></li><li><span>Brawo!</span></li><li><span>Do sędziego</span></li></ul>`,
  }[kind];
  dlg.innerHTML = `${body}<p style="margin-top:16px"><button class="btn btn--primary" id="dlgclose">Zamknij</button></p>`;
  dlg.querySelector('#dlgclose').onclick = () => dlg.close();
  dlg.showModal();
}

// ------------------------------------------------------------ 4. Przerwa
function halftime() {
  if (st.clock.t < HALF_END[1]) { st.clock.half = 1; while (st.clock.t < HALF_END[1]) { st.clock.t += 1; applyEvents(1, st.clock.t, false); } }
  const ht = (k, s) => (k === 'poss' || k === 'acc' ? FINAL[k][s] : k === 'xg' ? (FINAL[k][s] * 0.5).toFixed(2) : k === 'yellow' ? [1, 0][s] : Math.round(FINAL[k][s] * 0.48));
  screen.innerHTML = `
  <h1>Przerwa</h1>
  <div class="board" style="margin-bottom:16px">
    <div class="board__t">${crest(HOME, 30)}<span>${HOME.short}</span></div>
    <div><div class="board__score">${st.score[0]}:${st.score[1]}</div><span class="board__min">45+2' Przerwa</span></div>
    <div class="board__t"><span>${AWAY.short}</span>${crest(AWAY, 30)}</div>
  </div>
  <div class="studio-cols">
  <section class="sec"><h2>Statystyki 1. połowy</h2>${statsTable(ht)}</section>
  <section class="sec"><h2>Podpowiedzi asystenta</h2>
    <blockquote class="assistant">Wygrywamy pojedynki na skrzydłach, ale Sowa słabnie: świeżość 62%. Kurek ma żółtą kartkę i gra ostro, rozważ zmianę albo rozmowę.<footer>Asystent trenera</footer></blockquote>
    <h2 style="margin-top:24px">Oceny</h2>
    <ul class="ratings">${[['Orzeł', 7.6], ['Wrona', 7.3], ['Żurek', 7.0], ['Mazur', 6.8], ['Kowal', 6.7], ['Bednarek', 6.6], ['Dudek', 6.5], ['Rogala', 6.4], ['Lis', 6.2], ['Kurek', 6.0], ['Sowa', 5.9]].map(([n, r]) => `<li><span>${n}</span><b>${r.toFixed(1)}</b></li>`).join('')}</ul>
  </section></div>`;
  action('Odprawa w przerwie', () => go(4));
}

// ------------------------------------------------------------ 7. Studio pomeczowe
function studioPost() {
  if (st.clock.t < HALF_END[2]) {
    for (const half of [1, 2]) { st.clock.half = half; if (half === 2 && st.clock.t < 45) st.clock.t = 45; while (st.clock.t < HALF_END[half]) { st.clock.t += 1; applyEvents(half, st.clock.t, false); } if (half === 1) st.clock.t = 45; }
  }
  screen.innerHTML = `
  <h1>Studio pomeczowe</h1>
  <div class="final">
    <div class="board">
      <div class="board__t">${crest(HOME, 34)}<span>${HOME.short}</span></div>
      <div><div class="board__score">${st.score[0]}:${st.score[1]}</div><span class="board__min">Koniec</span></div>
      <div class="board__t"><span>${AWAY.short}</span>${crest(AWAY, 34)}</div>
    </div>
    <div class="scorers"><div>Orzeł 38'<br>Wrona 67' (k.)</div><div>Zając 12'</div></div>
  </div>
  <div class="mvp"><div><small style="opacity:.75">Zawodnik meczu</small><br><strong style="font:700 var(--step-2)/1.1 var(--font-display)">Tomasz Wrona</strong><br><small style="opacity:.75">Gol z karnego, asysta, 4 kluczowe podania</small></div><span class="r">8.1</span></div>
  <div class="studio-cols">
  <section class="sec"><h2>Kluczowe momenty</h2>
    <ul class="moments">${EVENTS.filter((e) => ['goal', 'var', 'post', 'yellow'].includes(e.type)).map((e) => `<li><span class="m">${minuteLabel(e.half, e.t)}</span><span>${esc(e.text)}</span></li>`).join('')}</ul>
  </section>
  <section class="sec"><h2>Statystyki</h2>${statsTable((k, s) => (k === 'xg' ? FINAL[k][s].toFixed(2) : FINAL[k][s]))}</section>
  <section class="sec"><h2>Reakcje</h2>
    <div class="mood">
      ${[['Zarząd', 82, 'Bardzo zadowolony'], ['Kibice', 90, 'Euforia'], ['Media', 74, 'Pozytywnie']].map(([k, v, t]) => `<div class="mood-row"><span>${k}</span><div class="meter" role="img" aria-label="${k}: ${t}"><i style="width:${v}%"></i></div><span>${v}</span></div>`).join('')}
    </div>
    <ul class="headlines" style="margin-top:12px"><li>Jagiellonia zatrzymuje mistrza<small>Nagłówek dnia</small></li><li>VAR pomógł gospodarzom w kluczowym momencie<small>Kontrowersja meczu</small></li></ul>
  </section>
  <section class="sec"><h2>Po meczu</h2>
    <ul class="plain-list"><li><span class="k">Pauza</span><span>Kurek: 4. żółta kartka, nie zagra w 3. kolejce.</span></li><li><span class="k">Kontuzje</span><span>Bez nowych urazów.</span></li></ul>
    <table class="mini-table" style="margin-top:12px"><thead><tr><th>#</th><th>Klub</th><th>M</th><th>Bramki</th><th>Pkt</th></tr></thead><tbody>
      <tr><td>1</td><td>Raków Częstochowa</td><td>2</td><td>5:1</td><td>6</td></tr>
      <tr class="me"><td>2</td><td>Jagiellonia Białystok</td><td>2</td><td>4:2</td><td>6</td></tr>
      <tr><td>3</td><td>Pogoń Szczecin</td><td>2</td><td>3:1</td><td>4</td></tr>
      <tr><td>8</td><td>Lech Poznań</td><td>2</td><td>2:3</td><td>1</td></tr>
    </tbody></table>
  </section></div>
  <section class="sec"><h2>Oceny</h2>
    <ul class="ratings">${[['Wrona', 8.1], ['Orzeł', 7.8], ['Żurek', 7.2], ['Kowal', 7.1], ['Mazur', 6.9], ['Horvat', 6.8], ['Bednarek', 6.7], ['Dudek', 6.6], ['Rogala', 6.5], ['Lis', 6.3], ['Kurek', 6.1], ['Sowa', 6.0]].map(([n, r]) => `<li><span>${n}</span><b>${r.toFixed(1)}</b></li>`).join('')}</ul>
  </section>`;
  action('Odprawa pomeczowa', () => go(7));
}

// ------------------------------------------------------------ Start
rail.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(Number(b.dataset.go)); });
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && STEPS[st.step][0].startsWith('mecz') && !e.target.closest('input,select,button,dialog')) { e.preventDefault(); st.clock.running ? stopClock() : startClock(); }
});
const startAt = Number(new URLSearchParams(location.search).get('krok') || 1) - 1;
go(startAt);
document.body.dataset.ready = '1';
