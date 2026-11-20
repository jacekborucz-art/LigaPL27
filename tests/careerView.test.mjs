// Klub > Kariera: odznaki (SVG, opisy, dostępność), widok z pustymi i bogatymi danymi, rynek pracy, ucieczka tekstów.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BADGES, BADGE_IDS, BADGE_GROUPS, badgeSvg, badgeAria, badgeSprite, times } from '../src/ui/badges.js';
import { renderCareer, mountUnlocks } from '../src/ui/careerView.js';
import { renderClubHub, handleClubAction, KLUB_TABS } from '../src/ui/klubView.js';

const IDS = ['mp_ekstraklasa', 'mp_1liga', 'mp_2liga', 'mp_3liga', 'puchar_polski', 'superpuchar_polski', 'liga_mistrzow', 'liga_europy', 'liga_konferencji', 'superpuchar_europy', 'awans', 'utrzymanie_beniaminek', 'cel_ponad_plan', 'mecze_100', 'mecze_250', 'mecze_500', 'seria_bez_porazki', 'sensacja', 'trener_miesiaca', 'trener_sezonu'];

const EVIL = 'Klub <script>alert(1)</script> & "Co"';

function game() {
  return { clubId: 'widzew', date: '2026-10-20', season: '2026/27', manager: { rep: 40, history: [{ club: 'widzew', from: '2026-07-01' }], fired: 0, seasons: [] }, board: { fansMood: 55 }, inbox: [] };
}

const emptySummary = () => ({
  name: 'Jan Testowy', age: 45, club: { id: 'widzew', name: 'Widzew Łódź', tier: 1, league: 'Ekstraklasa' }, unemployed: false,
  rep: { value: 20, label: 'Początkujący', trend: 0, reach: null, peak: 20, history: [] },
  pop: { fans: 50, media: 40, fansLabel: 'Obojętny', mediaLabel: 'Obojętny', trendFans: 0, trendMedia: 0, history: [] },
  matches: { n: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, ppm: 0 },
  seasons: [], trophies: [], badges: {}, records: [], stints: [], scars: [], repLog: [],
});
const emptyJobs = () => ({ status: 'employed', since: null, days: 0, lastClub: null, vacancies: [], apps: [], canApplyFrom: null, canResign: { ok: false, text: 'Rezygnacja po sezonie.' } });

function richSummary() {
  const s = emptySummary();
  s.rep = { value: 72, label: 'Wpływowy', trend: 4, reach: 'Ekstraklasa', peak: 72, history: [{ season: '2024/25', value: 50 }, { season: '2025/26', value: 68 }, { season: '2026/27', value: 72 }] };
  s.pop = { fans: 64, media: 58, fansLabel: 'Lubiany', mediaLabel: 'Znany', trendFans: -2, trendMedia: 3, history: [{ season: 'a', fans: 50, media: 40 }, { season: 'b', fans: 64, media: 58 }] };
  s.matches = { n: 301, w: 148, d: 68, l: 85, gf: 430, ga: 330, ppm: 1.7 };
  s.badges = { mp_ekstraklasa: { count: 1, last: { season: '2025/26', clubId: 'x', clubName: EVIL } }, awans: { count: 3, last: { season: '2023/24', clubId: 'x', clubName: 'X' } } };
  s.trophies = [{ badgeId: 'mp_ekstraklasa', comp: 'ekstraklasa', season: '2025/26', clubId: 'x', clubName: EVIL, date: '2026-05-30' }, { badgeId: 'awans', comp: 'awans', season: '2023/24', clubId: 'x', clubName: 'X', date: '2024-05-30' }];
  s.seasons = [
    { season: '2025/26', clubId: 'x', clubName: EVIL, league: 'Ekstraklasa', pos: 1, round: null, goal: 'czołowa czwórka', achieved: 'exceeded', trophies: ['mp_ekstraklasa'], promoted: false, relegated: false, fired: false, reconstructed: false },
    { season: '2026/27', clubId: 'x', clubName: EVIL, league: 'Ekstraklasa', pos: 3, round: 14, goal: 'czołowa czwórka', achieved: 'running', trophies: [], promoted: false, relegated: false, fired: false, reconstructed: true },
  ];
  s.records = [{ key: 'a', label: 'Najwyższa wygrana', value: '6:0', detail: 'z <b>Resovią</b>' }];
  s.stints = [{ clubId: 'x', clubName: EVIL, from: '2025-07-01', to: null, league: 'Ekstraklasa', why: '', matches: 41, trophies: ['mp_ekstraklasa'] }];
  s.scars = [{ date: '2020-05-30', season: '2020/21', clubName: EVIL, text: 'Spadek z <i>ligi</i>.' }];
  return s;
}

test('Odznaki: 20 identyfikatorów, nazwa, grupa, metal, opis i grafika', () => {
  assert.deepEqual([...BADGE_IDS].sort(), [...IDS].sort());
  const groups = new Set(BADGE_GROUPS.map(([g]) => g));
  for (const id of IDS) {
    const b = BADGES[id];
    assert.ok(b.name && b.metal && b.how && b.svg.length > 50, id);
    assert.ok(groups.has(b.group), `${id}: grupa`);
    for (const t of [b.name, b.metal, b.how, badgeAria(id, null), badgeAria(id, { count: 2, last: { season: '2025/26' } })]) assert.ok(!t.includes('—'), `${id}: bez pauzy em`);
  }
});

test('Odznaki: etykiety dostępności i formy liczby', () => {
  assert.equal(times(1), '1 raz');
  assert.equal(times(2), '2 razy');
  assert.equal(times(5), '5 razy');
  assert.equal(times(22), '22 razy');
  assert.equal(badgeAria('mp_ekstraklasa', { count: 1, last: { season: '2025/26' } }), 'Mistrzostwo Polski, zdobyte 1 raz, ostatnio w sezonie 2025/26');
  assert.equal(badgeAria('awans', { count: 3, last: { season: '2023/24' } }), 'Awans, zdobyte 3 razy, ostatnio w sezonie 2023/24');
  assert.equal(badgeAria('liga_mistrzow', null), 'Liga Mistrzów, jeszcze nie zdobyte. Wygraj Ligę Mistrzów.');
});

test('Odznaki: badgeSvg (etykieta, zablokowana, licznik) i sprite z gradientami', () => {
  const on = badgeSvg('awans', { size: 32, count: 3 });
  assert.ok(on.includes('role="img"') && on.includes('aria-label="Awans, zdobyte 3 razy"') && on.includes('×3') && on.includes('--bs:32px'));
  const lock = badgeSvg('liga_mistrzow', { locked: true });
  assert.ok(lock.includes('is-lock') && lock.includes('jeszcze nie zdobyte') && !lock.includes('×'));
  assert.ok(badgeSvg('awans', { decorative: true }).includes('aria-hidden="true"') && !badgeSvg('awans', { decorative: true }).includes('role="img"'));
  assert.equal(badgeSvg('nie_ma'), '');
  const sprite = badgeSprite();
  for (const g of ['gGold', 'gSilver', 'gBronze', 'gIron', 'gGreen', 'gDeep', 'gBlue', 'gOrange', 'gRed', 'gFlame', 'gSlate', 'cpPP']) assert.ok(sprite.includes(`id="${g}"`), g);
  // każdy gradient użyty przez odznaki jest w sprite
  const used = new Set(Object.values(BADGES).flatMap((b) => [...b.svg.matchAll(/url\(#(\w+)\)/g)].map((m) => m[1])));
  for (const u of used) assert.ok(sprite.includes(`id="${u}"`), `brak ${u} w sprite`);
});

test('Kariera: nowa kariera, puste listy z zachętą, bez pauzy em', () => {
  const html = renderCareer(game(), {}, { summary: emptySummary(), jobs: emptyJobs() });
  assert.ok(html.includes('Gablota trofeów') && html.includes('0/20'));
  assert.equal((html.match(/class="kr-slot is-lock/g) ?? []).length, 20, 'wszystkie odznaki zablokowane');
  assert.ok(html.includes('Pierwszy wpis powstanie po zakończeniu sezonu'));
  assert.ok(html.includes('Wykres pojawi się po kolejnym sezonie'));
  assert.ok(!html.includes('Trudne chwile'), 'bez trudnych chwil nie ma sekcji');
  assert.ok(!html.includes('—'));
  assert.ok(!html.includes('NaN') && !html.includes('undefined') && !html.includes('[object'));
  // filtr Zdobyte przy pustej gablocie
  const won = renderCareer(game(), { crFilter: 'won' }, { summary: emptySummary(), jobs: emptyJobs() });
  assert.ok(won.includes('Gablota czeka na pierwsze trofeum') && !won.includes('kr-slot'));
});

test('Kariera: działa na danych z logiki albo stubu (zapis bez kariery)', () => {
  const html = renderCareer(game(), {});
  assert.ok(html.includes('kr-hero') && html.includes('Gablota trofeów'));
  assert.ok(!html.includes('—') && !html.includes('undefined') && !html.includes('NaN'));
});

test('Kariera: bogate dane, etykiety odznak, ×N, tabela, rekordy, ścieżka, trudne chwile', () => {
  const html = renderCareer(game(), { crSel: 'awans' }, { summary: richSummary(), jobs: emptyJobs() });
  assert.ok(html.includes('2/20'));
  assert.ok(html.includes('aria-label="Awans, zdobyte 3 razy, ostatnio w sezonie 2023/24"'));
  assert.ok(html.includes('aria-label="Liga Mistrzów, jeszcze nie zdobyte. Wygraj Ligę Mistrzów."'));
  assert.ok(html.includes('×3'));
  assert.ok(html.includes('aria-pressed="true"') && /data-id="awans"[^>]*aria-pressed="true"/.test(html), 'wybrana odznaka');
  assert.ok(html.includes('▲ Ponad plan') && html.includes('W toku') && html.includes('po 14 kol.') && html.includes('odtworzone'));
  assert.ok(html.includes('Do odznaki 500 meczów brakuje 199') && html.includes('148 zwycięstw'));
  assert.ok(html.includes('Najwyższa wygrana') && html.includes('Obecny klub'));
  assert.ok(html.includes('Trudne chwile') && html.includes('30 maj 2020'), 'daty po polsku (fmtDate)');
  assert.ok(html.includes('role="meter"') && html.includes('aria-valuenow="72"') && html.includes('+4'));
  assert.ok(!html.includes('—') && !html.includes('undefined') && !html.includes('NaN') && !html.includes('[object'));
  // negatywne zdarzenia tylko jako tekst: tabela sezonów nie ma ikon spadku ani zwolnienia
  assert.ok(!/spadek|zwolnienie/i.test(html.split('Trudne chwile')[0].replace(/<[^>]+>/g, ' ').replace('Spadek', '')));
});

test('Kariera: teksty z nazw klubów i opisów przechodzą przez esc()', () => {
  const html = renderCareer(game(), {}, { summary: richSummary(), jobs: emptyJobs() });
  assert.ok(!html.includes('<script>alert(1)</script>'), 'klub w tabeli, rekordach, ścieżce, szczegółach');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<b>Resovią</b>') && !html.includes('<i>ligi</i>'));
});

test('Kariera: rynek pracy bezrobotnego, szanse słowami, przyciski i stany aplikacji', () => {
  const S = { ...emptySummary(), unemployed: true, club: null };
  const J = {
    status: 'unemployed', since: '2026-10-02', days: 18, lastClub: 'widzew',
    vacancies: [
      { clubId: 'legia', name: 'Legia Warszawa', league: 'Ekstraklasa', clubRep: 78, owner: 'ambitny', goal: 'miejsce w czwórce', chance: 'niska', closes: '2026-11-03', applied: false, cooldownUntil: null },
      { clubId: 'lech', name: EVIL, league: 'Ekstraklasa', clubRep: 74, owner: 'bogaty', goal: 'szóstka', chance: 'średnia', closes: '2026-11-05', applied: true, cooldownUntil: null },
      { clubId: 'sandecja', name: 'Sandecja', league: '2 Liga', clubRep: 35, owner: 'lokalny', goal: 'awans', chance: 'wysoka', closes: '2026-11-06', applied: false, cooldownUntil: '2027-01-10' },
    ],
    apps: [{ clubId: 'lech', name: EVIL, date: '2026-10-18', state: 'rozmowa' }, { clubId: 'hutnik', name: 'Hutnik', date: '2026-10-05', state: 'odmowa' }, { clubId: 'x1', name: 'Oferta FC', date: '2026-10-07', state: 'oferta' }, { clubId: 'x2', name: 'Czeka FC', date: '2026-10-08', state: 'czeka' }],
    canApplyFrom: null, canResign: { ok: false, text: '' },
  };
  const html = renderCareer(game(), {}, { summary: S, jobs: J });
  assert.ok(html.includes('Rynek pracy') && html.includes('Bez klubu') && html.includes('Jesteś bez klubu od 2 paź 2026'));
  assert.ok(html.indexOf('Rynek pracy') < html.indexOf('Gablota trofeów'), 'dla bezrobotnego rynek jest nad gablotą');
  for (const w of ['Szansa: niska', 'Szansa: średnia', 'Szansa: wysoka']) assert.ok(html.includes(w), w);
  assert.ok(html.includes('data-act="job-apply" data-id="legia"'));
  assert.ok(html.includes('data-act="job-withdraw" data-id="lech"') && html.includes('data-act="job-withdraw" data-id="x2"'));
  assert.ok(!html.includes('data-act="job-withdraw" data-id="hutnik"') && !html.includes('data-act="job-withdraw" data-id="x1"'), 'odmowa i oferta bez wycofania');
  assert.ok(html.includes('Karencja do 10 sty 2027') && html.includes('Klub odmówił') && html.includes('Jest oferta'));
  assert.ok(!html.includes('job-resign') && !html.includes('<script>alert'));
  // brak wakatów: zachęta
  const none = renderCareer(game(), {}, { summary: S, jobs: { ...J, vacancies: [], apps: [] } });
  assert.ok(none.includes('Na razie żaden klub nie szuka trenera'));
  // blokada globalna aplikacji
  const blocked = renderCareer(game(), {}, { summary: S, jobs: { ...J, canApplyFrom: '2026-10-25' } });
  assert.ok(blocked.includes('Aplikuj od 25 paź 2026') && !blocked.includes('data-act="job-apply"'));
});

test('Kariera: rezygnacja z potwierdzeniem w stanie widoku', () => {
  const J = { ...emptyJobs(), canResign: { ok: true, text: 'Odejdziesz z klubu, bez kary po sezonie.' } };
  const ask = renderCareer(game(), {}, { summary: emptySummary(), jobs: J });
  assert.ok(ask.includes('data-act="k-resign-ask"') && !ask.includes('data-act="job-resign"'));
  const confirm = renderCareer(game(), { crResign: true }, { summary: emptySummary(), jobs: J });
  assert.ok(confirm.includes('data-act="job-resign"') && confirm.includes('data-act="k-resign-no"') && confirm.includes('Na pewno zrezygnować?'));
  const no = renderCareer(game(), {}, { summary: emptySummary(), jobs: emptyJobs() });
  assert.ok(!no.includes('k-resign-ask') && no.includes('Rezygnacja po sezonie.'));
});

test('Klub: podzakładka Kariera po Zarządzie, akcje stanu widoku', () => {
  assert.deepEqual(KLUB_TABS.at(-1), ['kariera', 'Kariera']);
  assert.equal(KLUB_TABS.findIndex(([k]) => k === 'kariera'), KLUB_TABS.findIndex(([k]) => k === 'zarzad') + 1);
  const g = game();
  assert.deepEqual(handleClubAction(g, 'k-badge', { id: 'awans' }).ui, { crSel: 'awans', crFresh: null });
  assert.deepEqual(handleClubAction(g, 'k-bfilter', { f: 'won' }).ui, { crFilter: 'won' });
  assert.deepEqual(handleClubAction(g, 'k-resign-ask', {}).ui, { crResign: true });
  assert.deepEqual(handleClubAction(g, 'k-resign-no', {}).ui, { crResign: false });
  assert.equal(handleClubAction(g, 'k-tab', { t: 'kariera' }).ui.kTab, 'kariera');
});

test('Okno odblokowania: bez przeglądarki i bez nowych odznak nic nie pokazuje', () => {
  assert.equal(mountUnlocks(game(), { doc: null }), false);
  const doc = { getElementById: () => null };
  assert.equal(mountUnlocks(game(), { doc }), false, 'brak pendingUnlocks');
});
