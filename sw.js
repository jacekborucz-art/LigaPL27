// Service worker: tryb offline i oszczędny ruch. Wszystkie pliki gry mają skrót zawartości (npm run sw).
// Gra bierze pliki z pamięci urządzenia; serwer pyta tylko o sw.js (przeglądarka robi to sama przy otwarciu gry).
// Nowa wersja: instalacja kopiuje niezmienione pliki ze starej pamięci, a z sieci pobiera tylko zmienione.
// Strona po przejęciu przez nowy service worker przeładowuje się na ekranie startowym (src/app.js).
const VERSION = 'v0.3-35abf2de63';
const CACHE = `manager-${VERSION}`;

const FILES = [
  // AUTO-FILES-START
  ['./index.html', '196f138ffe'],
  ['./manifest.webmanifest', 'f15cbe83ae'],
  ['./assets/crests/arka-48.webp', '466a65579c'],
  ['./assets/crests/arka.webp', '58f2c8f4ad'],
  ['./assets/crests/cracovia-48.webp', '5fffc08895'],
  ['./assets/crests/cracovia.webp', '231a58f698'],
  ['./assets/crests/gks-katowice-48.webp', 'b3ce39e354'],
  ['./assets/crests/gks-katowice.webp', '526f93bc36'],
  ['./assets/crests/gornik-leczna-48.webp', 'd92baad967'],
  ['./assets/crests/gornik-leczna.webp', 'a76d6e9328'],
  ['./assets/crests/gornik-zabrze-48.webp', '5582d80cd8'],
  ['./assets/crests/gornik-zabrze.webp', '6e0abfabf6'],
  ['./assets/crests/jagiellonia-48.webp', '6c707deec5'],
  ['./assets/crests/jagiellonia.webp', '36c55bdb67'],
  ['./assets/crests/korona-48.webp', '8667346ed9'],
  ['./assets/crests/korona.webp', '244e563d87'],
  ['./assets/crests/lech-48.webp', 'dd57ef17e4'],
  ['./assets/crests/lech.webp', 'fd8da05b78'],
  ['./assets/crests/lechia-gdansk-48.webp', '514263d555'],
  ['./assets/crests/lechia-gdansk.webp', 'db4d6d0080'],
  ['./assets/crests/legia-48.webp', '3a424428ca'],
  ['./assets/crests/legia.webp', 'f5329a95b9'],
  ['./assets/crests/lks-48.webp', '2d9f1cfe29'],
  ['./assets/crests/lks.webp', '87c4f4edfb'],
  ['./assets/crests/miedz-48.webp', '9d8bca740f'],
  ['./assets/crests/miedz.webp', 'c286d90920'],
  ['./assets/crests/motor-48.webp', '821ceb41c2'],
  ['./assets/crests/motor.webp', 'bcbbe20bee'],
  ['./assets/crests/piast-48.webp', '25275dc5b6'],
  ['./assets/crests/piast.webp', 'b17db49e9d'],
  ['./assets/crests/pogon-szczecin-48.webp', '1ecea9c912'],
  ['./assets/crests/pogon-szczecin.webp', '6e4893819a'],
  ['./assets/crests/puszcza-48.webp', 'f9e4fa346c'],
  ['./assets/crests/puszcza.webp', '5aa1bfb351'],
  ['./assets/crests/radomiak-48.webp', '8df4d46241'],
  ['./assets/crests/radomiak.webp', '76ba7a7b97'],
  ['./assets/crests/rakow-48.webp', 'fb8344d4e8'],
  ['./assets/crests/rakow.webp', '004778aaeb'],
  ['./assets/crests/ruch-48.webp', '8e6f84565d'],
  ['./assets/crests/ruch.webp', '23323f5967'],
  ['./assets/crests/slask-48.webp', '9aa4ce16c6'],
  ['./assets/crests/slask.webp', '57f813c3ed'],
  ['./assets/crests/stal-mielec-48.webp', '6f8ece2d01'],
  ['./assets/crests/stal-mielec.webp', 'aa7825969b'],
  ['./assets/crests/termalica-48.webp', 'd62fc5ce14'],
  ['./assets/crests/termalica.webp', 'ae7ec567e8'],
  ['./assets/crests/warta-48.webp', '0d55b45488'],
  ['./assets/crests/warta.webp', 'c7b4f05f4c'],
  ['./assets/crests/widzew-48.webp', '0583d491cd'],
  ['./assets/crests/widzew.webp', 'c1768df745'],
  ['./assets/crests/wieczysta-48.webp', 'ce759062e4'],
  ['./assets/crests/wieczysta.webp', '0c5e9d9075'],
  ['./assets/crests/wisla-krakow-48.webp', 'c9911dea67'],
  ['./assets/crests/wisla-krakow.webp', 'e4bea50078'],
  ['./assets/crests/wisla-plock-48.webp', '1720d21d0d'],
  ['./assets/crests/wisla-plock.webp', '5ce1b437aa'],
  ['./assets/crests/zaglebie-lubin-48.webp', '5bfebe4491'],
  ['./assets/crests/zaglebie-lubin.webp', '65eb52658e'],
  ['./assets/fonts/barlow-condensed-latin-500-normal.woff2', '4544df5204'],
  ['./assets/fonts/barlow-condensed-latin-700-normal.woff2', 'd639ff4a3e'],
  ['./assets/fonts/barlow-condensed-latin-ext-500-normal.woff2', '452946357d'],
  ['./assets/fonts/barlow-condensed-latin-ext-700-normal.woff2', '6cf957bb93'],
  ['./assets/fonts/barlow-latin-400-normal.woff2', '723df36580'],
  ['./assets/fonts/barlow-latin-600-normal.woff2', 'b68cdebfb4'],
  ['./assets/fonts/barlow-latin-ext-400-normal.woff2', 'd42c5510a5'],
  ['./assets/fonts/barlow-latin-ext-600-normal.woff2', '81f30e136c'],
  ['./assets/fonts/doto-latin-800-normal.woff2', '4fb0b94b7a'],
  ['./assets/icons/icon-192.png', '65aae6eed5'],
  ['./assets/icons/icon-512.png', '61fa2b9926'],
  ['./assets/icons/icon-maskable-512.png', '61fa2b9926'],
  ['./assets/icons/icon.svg', '59f03f0390'],
  ['./src/app.js', '3e6a77677d'],
  ['./src/career/academy.js', '6429b69237'],
  ['./src/career/acclimatization.js', '4c60c06da6'],
  ['./src/career/assistantReport.js', '5cc24e938e'],
  ['./src/career/attention.js', '22c71f439f'],
  ['./src/career/authority.js', '7cceeaaf58'],
  ['./src/career/board.js', '8351732e7c'],
  ['./src/career/boardRequests.js', 'c412b89b00'],
  ['./src/career/careerSystem.js', 'cd7a0226ec'],
  ['./src/career/coachMarket.js', '127756aa97'],
  ['./src/career/coaches.js', 'c381987592'],
  ['./src/career/editor.js', '50e837787b'],
  ['./src/career/fans.js', '737d9449e9'],
  ['./src/career/fansSystem.js', 'ced36b7dd1'],
  ['./src/career/finance.js', 'f6fb7c16a5'],
  ['./src/career/foreignMarket.js', '69f8495b89'],
  ['./src/career/foreignPool.js', '48d9c4bd5d'],
  ['./src/career/infrastructure.js', '687f630eb1'],
  ['./src/career/loans.js', '6b12fbe674'],
  ['./src/career/mindset.js', 'b8a1c39ce7'],
  ['./src/career/morale.js', '941048776c'],
  ['./src/career/moveWish.js', '83a156f749'],
  ['./src/career/negotiation.js', '72f58ffb29'],
  ['./src/career/negotiationLines.js', '37c64fb89e'],
  ['./src/career/owners.js', '881a7a1333'],
  ['./src/career/personality.js', 'f490724de6'],
  ['./src/career/preContracts.js', '8c71401605'],
  ['./src/career/prizes.js', 'eed7f4e394'],
  ['./src/career/referees.js', '4a2d4c8ccb'],
  ['./src/career/reputation.js', '76035a1c80'],
  ['./src/career/reputationSystem.js', '68df5d28ba'],
  ['./src/career/reserves.js', 'a4d6374243'],
  ['./src/career/shirts.js', '848f4d409c'],
  ['./src/career/sponsors.js', 'e59ba257b8'],
  ['./src/career/squad.js', 'f9b44da44d'],
  ['./src/career/squadLimit.js', '8c60ef88b2'],
  ['./src/career/squadLimitSystem.js', 'f25b8c5a64'],
  ['./src/career/staffMarket.js', 'd8bc4dde0b'],
  ['./src/career/talkDialog.js', '8751a88a9d'],
  ['./src/career/teamReport.js', 'd2cb7ef937'],
  ['./src/career/teamTalks.js', '77a6f9a15c'],
  ['./src/career/threat.js', 'bd519d5790'],
  ['./src/career/transferDeals.js', '116a88df52'],
  ['./src/career/transferSystem.js', '91a3d49d4c'],
  ['./src/career/transfers.js', 'cfee366370'],
  ['./src/career/weeklyTodo.js', '3ff6bf1fca'],
  ['./src/config/calendar2026.js', '7af3df5b12'],
  ['./src/config/competitions.js', '1ba35856b2'],
  ['./src/config/version.js', '00f6db04c0'],
  ['./src/core/decisions.js', 'b9fda961b7'],
  ['./src/core/gameLoop.js', 'd572502469'],
  ['./src/core/inbox.js', '689fd5b609'],
  ['./src/core/rng.js', '3712174b88'],
  ['./src/core/store.js', 'adb3d58f02'],
  ['./src/data/attributes.js', '892bf10066'],
  ['./src/data/clubs_l3.js', 'd3a2685877'],
  ['./src/data/clubs_l4.js', '90bd3180ad'],
  ['./src/data/clubs_pl.js', '203a873b34'],
  ['./src/data/finanse_klubow.js', '6d44dc85bb'],
  ['./src/data/formations.js', 'fdc9ab1756'],
  ['./src/data/instructions.js', 'b422ada136'],
  ['./src/data/kibice.js', '9c3baf12b0'],
  ['./src/data/kluby_uefa.json', 'e579c6760e'],
  ['./src/data/names.js', '7195dbc1a8'],
  ['./src/data/reprezentacje.json', '551a9d5bdd'],
  ['./src/data/reprezentacje_swiat.json', '29c3c96adf'],
  ['./src/engine/lineup.js', 'aab0693990'],
  ['./src/engine/match/coach.js', '2cc9ca6593'],
  ['./src/engine/match/constants.js', 'e513a78280'],
  ['./src/engine/match/control.js', 'b17907f777'],
  ['./src/engine/match/core.js', 'c3ab1fed44'],
  ['./src/engine/match/match.js', 'd1ed756f73'],
  ['./src/engine/match/rules.js', 'd5cc299ded'],
  ['./src/engine/match/teams.js', 'fc879835d3'],
  ['./src/engine/matchStats.js', '71542c9b3b'],
  ['./src/engine/modifiers.js', 'cf8f446d97'],
  ['./src/engine/positions.js', 'ee736ff7cc'],
  ['./src/engine/quickSim.js', '255a801fa3'],
  ['./src/engine/teamStrength.js', '29de64f3e1'],
  ['./src/match/aiPlan.js', '2f958da775'],
  ['./src/match/briefings.js', '259a9a1c24'],
  ['./src/match/matchday.js', '417dd2e734'],
  ['./src/match/press.js', 'a0c01d2832'],
  ['./src/match/pressSystem.js', 'f08d4d2743'],
  ['./src/match/studio.js', '13cae950dc'],
  ['./src/season/cup.js', '830ec558a6'],
  ['./src/season/dailySystems.js', '565bfaf2cc'],
  ['./src/season/europe.js', 'fb7489f63d'],
  ['./src/season/europeAccess.js', '81a4d6f9bd'],
  ['./src/season/history.js', '8fcbac8fa8'],
  ['./src/season/intl/engine.js', 'f65f4fa8bf'],
  ['./src/season/intl/hosts.js', '93583f6504'],
  ['./src/season/intl/ratings.js', '0ead6c75d4'],
  ['./src/season/intl/sim.js', '7c4a36b80a'],
  ['./src/season/intl/windows.js', '5a2ab9590f'],
  ['./src/season/leagueComps.js', 'caddb5c253'],
  ['./src/season/leagues.js', '0844dc0aba'],
  ['./src/season/matchReport.js', 'be9864d533'],
  ['./src/season/national.js', '1b51378924'],
  ['./src/season/nationalSystem.js', '56b1056ddd'],
  ['./src/season/rollover.js', 'dc0750f768'],
  ['./src/season/schedule.js', 'a608f6730f'],
  ['./src/season/season.js', '368bc32d62'],
  ['./src/season/standings.js', 'b3bdff91e2'],
  ['./src/season/superCupEU.js', 'f728d6d300'],
  ['./src/season/suspension.js', '7671748aa6'],
  ['./src/season/thirdLeague.js', 'b37f1d8a44'],
  ['./src/season/uefa.js', '4a0c9dc052'],
  ['./src/season/worldNations.js', '6003d36e12'],
  ['./src/styles/app.css', '96f38fe713'],
  ['./src/styles/assistant.css', '87577f8aa4'],
  ['./src/styles/base.css', 'f2fee58203'],
  ['./src/styles/club.css', '6615e08e49'],
  ['./src/styles/contextmenu.css', '55d14f38c2'],
  ['./src/styles/dashboard.css', 'e950cf99bc'],
  ['./src/styles/editor.css', '3037084983'],
  ['./src/styles/fonts.css', '372f3ee1fc'],
  ['./src/styles/history.css', '0565451dc5'],
  ['./src/styles/klub.css', '62ff25555a'],
  ['./src/styles/matchday.css', '4093b1727a'],
  ['./src/styles/menu.css', 'cdd4f24b98'],
  ['./src/styles/negotiation.css', '949f233adc'],
  ['./src/styles/reserves.css', '71951b8110'],
  ['./src/styles/staff.css', 'a779ca23ad'],
  ['./src/styles/todo.css', 'd7bb59a735'],
  ['./src/styles/tokens.css', 'a7865d38be'],
  ['./src/styles/training.css', 'ac4ad097d3'],
  ['./src/styles/transfers.css', '1a9fbc4bc5'],
  ['./src/training/aiClubs.js', '59effd68ac'],
  ['./src/training/camps.js', '751dd1d81f'],
  ['./src/training/cohesion.js', 'f7d022d0c3'],
  ['./src/training/config.js', '24a3d60270'],
  ['./src/training/development.js', 'edac83c475'],
  ['./src/training/friendlies.js', 'e8c68f4aa6'],
  ['./src/training/index.js', '5a1004f622'],
  ['./src/training/load.js', '029d414e92'],
  ['./src/training/plan.js', 'fa1087808c'],
  ['./src/training/scouting.js', 'a87919efba'],
  ['./src/training/sessions.js', 'b4ac111ed7'],
  ['./src/training/staff.js', 'afce57997d'],
  ['./src/training/state.js', '8577a26767'],
  ['./src/training/variety.js', '31ec815b77'],
  ['./src/ui/assistantReportView.js', 'ad1ef0c14d'],
  ['./src/ui/boardRequestsView.js', '14afde7d17'],
  ['./src/ui/clubView.js', 'c762a8d93c'],
  ['./src/ui/competitionsView.js', '6df6a9a5c1'],
  ['./src/ui/contextMenu.js', '5590f7bc7f'],
  ['./src/ui/crest.js', '2f2602adb8'],
  ['./src/ui/daySpeed.js', '73d29c5b52'],
  ['./src/ui/dom.js', '0ce16300f6'],
  ['./src/ui/editorView.js', '99219af4c4'],
  ['./src/ui/europeView.js', '3ee900afcf'],
  ['./src/ui/fixturesView.js', '8ad243c712'],
  ['./src/ui/formChart.js', '9d81bc96d3'],
  ['./src/ui/infraView.js', '8c179c1db1'],
  ['./src/ui/klubView.js', 'd55225df54'],
  ['./src/ui/loansView.js', '21eb434f9f'],
  ['./src/ui/masonry.js', 'abee5a105a'],
  ['./src/ui/matchReportView.js', 'f517b0cc08'],
  ['./src/ui/matchdayView.js', '4eef47b174'],
  ['./src/ui/menuView.js', 'f7dc955d9f'],
  ['./src/ui/nationalView.js', '92d610d773'],
  ['./src/ui/negotiationView.js', '82b6da6b0d'],
  ['./src/ui/playerCard.js', '9f75750223'],
  ['./src/ui/playerMenus.js', '90e9634c30'],
  ['./src/ui/playerStatsView.js', '00e99b6845'],
  ['./src/ui/playerTags.js', '11c84f25c9'],
  ['./src/ui/positionMap.js', 'ef2c032d52'],
  ['./src/ui/reservesView.js', '0768b9e72d'],
  ['./src/ui/sponsorsView.js', '93ea7f72b4'],
  ['./src/ui/squadView.js', '26402bd3f1'],
  ['./src/ui/staffView.js', '7682a3584c'],
  ['./src/ui/sysMenu.js', 'fc1677717f'],
  ['./src/ui/tacticsDrag.js', '1d6819c303'],
  ['./src/ui/tacticsMoves.js', '36742ffefc'],
  ['./src/ui/tacticsView.js', '76dbdf9eb6'],
  ['./src/ui/talksView.js', 'e2780aa122'],
  ['./src/ui/teamReportView.js', 'c01abc57b6'],
  ['./src/ui/todoView.js', 'bd4d7aa1c4'],
  ['./src/ui/trainingView.js', 'acaeee6ec9'],
  ['./src/ui/transferDealsView.js', 'a13fa703b3'],
  ['./src/ui/transfersView.js', '67e8f5381a'],
  ['./src/world/ephemeral.js', '216b6bcdd9'],
  ['./src/world/playerGen.js', '7033b8b243'],
  ['./src/world/worldGen.js', '494992346d'],
  // AUTO-FILES-END
];

const scope = self.registration.scope;
// index.html pod adresem './': Cloudflare Pages przekierowuje /index.html na / (308), a odpowiedź po przekierowaniu
// podana jako strona główna przeglądarka odrzuca (gra nie startowała przy drugim otwarciu).
const keyOf = (path, hash) => new URL(`${path === './index.html' ? './' : path}?v=${hash}`, scope).href;
/** Odpowiedź po przekierowaniu zamieniona na zwykłą (bez flagi redirected), żeby nadawała się dla nawigacji. */
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}
const BY_URL = new Map(FILES.map(([path, hash]) => [new URL(path, scope).href, keyOf(path, hash)]));
BY_URL.set(scope, BY_URL.get(new URL('./index.html', scope).href)); // './' to index.html

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const todo = [...BY_URL.values()].filter((k, i, a) => a.indexOf(k) === i);
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const key = todo[next++];
        if (await cache.match(key)) continue;
        const old = await caches.match(key); // ten sam plik w poprzedniej wersji: bez sieci
        if (old && !old.redirected) { await cache.put(key, old); continue; }
        const res = await clean(await fetch(key, { cache: 'no-cache' }));
        if (!res.ok) throw new Error(`${key}: ${res.status}`);
        await cache.put(key, res);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('manager-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const plain = `${url.origin}${url.pathname}`;
  const key = BY_URL.get(plain) ?? (request.mode === 'navigate' ? BY_URL.get(scope) : null);
  if (!key) return; // pliki spoza gry: zwykła sieć
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(key);
    if (hit && !hit.redirected) return hit; // stary wpis po przekierowaniu: pobierz od nowa
    const res = await clean(await fetch(key, { cache: 'no-cache' }));
    if (res.ok) cache.put(key, res.clone());
    return res;
  })());
});
