// Trening > Sztab (src/ui/staffView.js): trzy widoki (Mój sztab, Rynek sztabu, Oferty w toku), karta osoby i oferta,
// podbieranie, zwolnienie z potwierdzeniem, przedłużenie, filtry przez pola (change), bez pauzy em i bez wielkich liter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { processDay, addDays } from '../src/core/gameLoop.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { applySeasonState } from '../src/season/rollover.js';
import { ensureTraining } from '../src/training/index.js';
import '../src/season/dailySystems.js';
import { renderTraining } from '../src/ui/trainingView.js';
import { renderStaff, handleStaffAction, handleStaffField, isStaffAction, marketRows, offerPreview } from '../src/ui/staffView.js';
import { rosterOf, pendingOffers, decideDay, staffLimit, fireStaff, listFreeStaff } from '../src/career/staffMarket.js';

const CLUB = 'widzew';
const BAD_TEXT = new RegExp(`undefined|NaN|\\bnull\\b|\\[object|${String.fromCharCode(8212)}`);
let shared = null;
function base() {
  if (shared) return shared;
  applySeasonState({});
  const g = { seed: 21, clubId: CLUB, date: '2026-07-01', season: '2026/27', inbox: [], manager: { profile: { firstName: 'A', lastName: 'B' } } };
  g.world = generateWorld(21); g.season = createSeason(21, { playerClub: CLUB }); g.fixtures = g.season.fixtures;
  g.tactics = createTactics(squadOf(g.world, CLUB), { benchSize: 12 });
  ensureTraining(g); ensureCareer(g); processDay(g);
  return (shared = g);
}
const fresh = () => structuredClone(base());
const visible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
function clean(html, label) {
  assert.ok(!BAD_TEXT.test(html.replace(/data-[a-z-]+="[^"]*"/g, '')), `bez śmieci i pauzy em: ${label}`);
  const caps = visible(html.slice(Math.max(0, html.indexOf('class="st-view"')))).match(/\b[A-ZĄĆĘŁŃÓŚŹŻ]{4,}\b/g);
  assert.ok(!caps, `bez etykiet wielkimi literami (${label}): ${caps}`);
}
const step = (g, ui, act, ds = {}) => { const r = handleStaffAction(g, act, ds, ui); Object.assign(ui, r.ui); return r; };
const field = (g, ui, f, v) => { const r = handleStaffField(g, f, v, ui); Object.assign(ui, r.ui); return r; };
const ACTS = [...readFileSync(new URL('../src/ui/staffView.js', import.meta.url), 'utf8').matchAll(/case '(st-[a-z-]+)'/g)].map((m) => m[1]);
const actsIn = (html) => [...html.matchAll(/data-act="(st-[a-z-]+)"/g)].map((m) => m[1]);

test('Sztab: trzy widoki, pasek stanu z limitem i pensjami, karty ról z osobami, bez śmieci i wielkich liter', () => {
  const g = fresh();
  const ui = { trTab: 'sztab' };
  const moj = renderTraining(g, ui);
  assert.ok(moj.includes('class="st-view" data-sub="moj"'));
  assert.match(moj, /class="st-bar"/);
  assert.match(moj, /Sztab <b>\d+\/\d+<\/b>/);
  assert.match(moj, /Pensje <b>/);
  for (const t of ['Mój sztab', 'Rynek sztabu', 'Oferty w toku', 'Asystent trenera', 'Fizjoterapeuta', 'Skaut', 'Kierownik drużyny', 'Raport asystenta o drużynie', 'Limit i budżet', 'Najbliższe umowy']) assert.ok(moj.includes(t), t);
  assert.ok((moj.match(/class="st-person"/g) ?? []).length === rosterOf(g, CLUB).length + (g.staff.dir?.[CLUB] ? 1 : 0), 'każda osoba sztabu (i dyrektor sportowy) ma wiersz');
  assert.match(moj, /data-act="st-fire-ask"/);
  assert.match(moj, /<span class="st-share" data-k="good"[^>]*>lider<\/span>/);
  assert.match(moj, /role="tablist" aria-label="Sztab"/);
  assert.ok(!moj.includes('tr-st-'), 'robocze przyciski usunięte');
  clean(moj, 'mój sztab');
  step(g, ui, 'st-sub', { sub: 'rynek' });
  const rynek = renderTraining(g, ui);
  assert.ok(rynek.includes('data-sub="rynek"') && rynek.includes('class="xl-wrap st-xl"') && rynek.includes('class="st-cards"'));
  assert.match(rynek, /Po filtrach \d+ z \d+ wolnych osób/);
  clean(rynek, 'rynek');
  step(g, ui, 'st-sub', { sub: 'oferty' });
  const oferty = renderTraining(g, ui);
  assert.ok(oferty.includes('Nie masz ofert w toku') && oferty.includes('data-act="st-sub" data-sub="rynek"'));
  clean(oferty, 'oferty puste');
  // Każde data-act st-* na ekranie ma obsługę w handleStaffAction
  for (const a of new Set([...actsIn(moj), ...actsIn(rynek), ...actsIn(oferty)])) assert.ok(ACTS.includes(a), `obsługa ${a}`);
  assert.ok(isStaffAction('st-offer') && !isStaffAction('tr-tab'));
});

test('Rynek: filtry (rola, kraj, jakość, pensja, bez ofert, podbieranie), sortowanie, czyszczenie, strony', () => {
  const g = fresh();
  const ui = { trTab: 'sztab' };
  step(g, ui, 'st-find', { role: 'analityk' });
  assert.equal(ui.trStaff, 'rynek');
  assert.ok(marketRows(g, ui).length > 0 && marketRows(g, ui).every((r) => r.role === 'analityk'));
  step(g, ui, 'st-role', { v: '' });
  const all = marketRows(g, ui).length;
  field(g, ui, 'nat', 'pol');
  assert.ok(marketRows(g, ui).every((r) => r.nat === 'POL'));
  field(g, ui, 'nat', 'obcy');
  assert.ok(marketRows(g, ui).every((r) => r.nat !== 'POL'));
  field(g, ui, 'nat', '');
  field(g, ui, 'qmin', '12');
  assert.ok(marketRows(g, ui).every((r) => r.q.v >= 12));
  field(g, ui, 'qmax', '14');
  assert.ok(marketRows(g, ui).every((r) => r.q.v <= 14));
  field(g, ui, 'wmax', '9000');
  assert.ok(marketRows(g, ui).every((r) => r.wage.lo <= 9000));
  field(g, ui, 'noOffers', true);
  assert.ok(marketRows(g, ui).every((r) => !r.offers));
  const html = renderTraining(g, ui);
  assert.match(html, /Filtry \(4\)/);
  clean(html, 'filtry');
  step(g, ui, 'st-clear');
  assert.equal(marketRows(g, ui).length, all);
  // Sortowanie: jakość malejąco domyślnie, drugie kliknięcie odwraca
  step(g, ui, 'st-sort', { k: 'age' });
  const ages = marketRows(g, ui).map((r) => r.age);
  assert.deepEqual(ages, [...ages].sort((a, b) => b - a));
  step(g, ui, 'st-sort', { k: 'age' });
  assert.match(renderTraining(g, ui), /aria-sort="ascending"/);
  // Podbieranie: osoby z innych klubów, z klubem i rekompensatą; strony po 50
  field(g, ui, 'poach', true);
  const rows = marketRows(g, ui);
  assert.ok(rows.some((r) => r.club && r.club !== CLUB && r.comp > 0));
  assert.ok(!rows.some((r) => r.club === CLUB), 'bez własnego sztabu');
  const ph = renderTraining(g, ui);
  assert.match(ph, /data-act="st-page"/);
  assert.match(ph, />Podbij</);
  clean(ph, 'podbieranie');
  step(g, ui, 'st-page', { p: 1 });
  assert.match(renderTraining(g, ui), /data-act="st-page" data-p="1" aria-pressed="true"/);
});

test('Karta osoby i oferta: podgląd, podpowiedź słowem, oferta w toku z odliczaniem, decyzja po 2-3 dniach', () => {
  const g = fresh();
  const ui = { trTab: 'sztab', trStaff: 'rynek' };
  // Miejsce w sztabie: zwolnienie pomocnika albo osoby spoza rdzenia
  const out = rosterOf(g, CLUB).sort((a, b) => a.q - b.q).find((x) => x.role !== 'kierownik');
  step(g, ui, 'st-fire-ask', { id: out.id });
  step(g, ui, 'st-fire-yes', { id: out.id });
  assert.match(ui.trNotice, /zwolniony\. Odprawa .* zapłacona\./);
  const role = out.role;
  const cand = listFreeStaff(g, { role, noOffers: true }).sort((a, b) => a.wage.mid - b.wage.mid)[0];
  step(g, ui, 'st-open', { id: cand.id });
  assert.equal(ui.trStaffPerson, cand.id);
  let html = renderTraining(g, ui);
  for (const t of ['Wróć do listy', 'Atrybuty', 'Co się zmieni w twoim sztabie', 'Zainteresowanie naszym klubem', 'Złóż ofertę', 'Pozycja w sztabie', 'Roczny koszt', 'Sztab po zatrudnieniu']) assert.ok(html.includes(t), t);
  assert.match(html, /class="st-hint" data-k="(good|info|warn|bad)"/);
  assert.match(html, /data-st-field="wage"/);
  clean(html, 'karta osoby');
  // Pensja ze szybkiego wyboru, długość umowy, pozycja; zmiana pensji odświeża tylko podgląd
  step(g, ui, 'st-wage', { v: 'high' });
  step(g, ui, 'st-years', { v: '1' });
  assert.equal(ui.trStaffOffer.years, 1);
  const r = field(g, ui, 'wage', String(Math.round(cand.wage.mid * 0.3)));
  assert.ok(r.preview);
  assert.match(offerPreview(g, ui), /Poniżej jego oczekiwań, odrzuci od razu/);
  assert.match(offerPreview(g, ui), /data-act="st-offer"[^>]* disabled/);
  step(g, ui, 'st-wage', { v: 'mid' });
  const res = step(g, ui, 'st-offer', { id: cand.id });
  assert.ok(res.save, ui.trNotice);
  assert.equal(ui.trStaff, 'oferty');
  const pend = pendingOffers(g);
  assert.equal(pend.length, 1);
  html = renderTraining(g, ui);
  assert.match(html, /Oferty w toku \(1 z 3 możliwych\)/);
  assert.match(html, /Zostało \d dni|Decyzja jutro/);
  assert.match(html, /class="st-badge"/);
  clean(html, 'oferty w toku');
  // Oferta wlicza się do limitu, po dniu decyzji znika z listy
  assert.equal(staffLimit(g).pending, 1);
  let d = g.date;
  for (let i = 0; i < 4; i++) { d = addDays(d, 1); decideDay(g, d); }
  g.date = d;
  assert.equal(pendingOffers(g).length, 0);
  assert.ok(rosterOf(g, CLUB).some((p) => p.id === cand.id) || g.staff.people[cand.id]?.club !== CLUB);
});

test('Zwolnienie: okno z odprawą i skutkiem, Nie zwalniaj zamyka; przedłużenie od 1 stycznia; wakat i limit', () => {
  const g = fresh();
  const ui = { trTab: 'sztab' };
  const p = rosterOf(g, CLUB).find((x) => x.role === 'kierownik');
  let r = step(g, ui, 'st-fire-ask', { id: p.id });
  assert.equal(r.focus, '#st-ask-no');
  let html = renderTraining(g, ui);
  assert.match(html, /role="alertdialog"/);
  assert.match(html, new RegExp(`Zwolnić ${p.name}\\?`));
  assert.match(html, /Odprawa: \d \w+ = /);
  assert.match(html, /Rola zostanie bez człowieka/);
  assert.match(html, /Zwolnij i zapłać/);
  clean(html, 'okno zwolnienia');
  r = step(g, ui, 'st-fire-no', { id: p.id });
  assert.equal(ui.trStaffAsk, null);
  assert.equal(r.focus, `[data-act="st-fire-ask"][data-id="${p.id}"]`);
  assert.ok(rosterOf(g, CLUB).some((x) => x.id === p.id), 'bez zwolnienia');
  step(g, ui, 'st-fire-ask', { id: p.id });
  step(g, ui, 'st-fire-yes', { id: p.id });
  html = renderTraining(g, ui);
  assert.match(html, /Wakat: obowiązki przejmuje trener/);
  assert.match(html, /data-act="st-find" data-role="kierownik"/);
  // Przedłużenie: przed 1 stycznia przycisk nieaktywny, potem formularz
  const q = rosterOf(g, CLUB).find((x) => x.role === 'asystent');
  assert.match(html, new RegExp(`data-act="st-renew" data-id="${q.id}"[^>]*disabled title="Od `));
  q.until = '2027-06-30';
  g.date = '2027-01-10';
  step(g, ui, 'st-renew', { id: q.id });
  assert.ok(ui.trStaffOffer?.renew);
  field(g, ui, 'rwage', String(q.wage + 500));
  step(g, ui, 'st-ryears', { v: '2' });
  html = renderTraining(g, ui);
  assert.match(html, /Zaproponuj przedłużenie/);
  assert.match(html, /Nowa umowa do 30 cze 2029/);
  clean(html, 'przedłużenie');
  step(g, ui, 'st-renew-go', { id: q.id });
  assert.ok(ui.trNotice);
  // Sztab pełny: Zatrudnij nieaktywny z powodem
  const g2 = fresh();
  const full = renderStaff(g2, {});
  if (staffLimit(g2).used >= staffLimit(g2).limit) assert.match(full, /data-act="st-sub" data-sub="rynek" disabled title="Sztab pełny/);
});

test('Podbieranie: karta osoby z innego klubu pokazuje klub, umowę i rekompensatę; osoba bez klubu też działa', () => {
  const g = fresh();
  const ui = { trTab: 'sztab', trStaff: 'rynek', trStaffF: { poach: true } };
  const row = marketRows(g, ui).find((r) => r.club && !r.blocked && r.role !== 'dyrektor'); // dyrektora wybiera zarząd (tylko podgląd)
  step(g, ui, 'st-open', { id: row.id });
  const html = renderTraining(g, ui);
  assert.match(html, /class="tr-card st-poach"/);
  assert.match(html, /Rekompensata dla klubu: 3 pensje/);
  assert.match(html, /zablokować odejście/);
  assert.match(html, /Rekompensata \(jeśli przyjmie\)/);
  clean(html, 'podbieranie karta');
  // Osoba bez klubu: bez herbu i panelu podbierania
  const free = listFreeStaff(g)[0];
  step(g, ui, 'st-open', { id: free.id });
  const h2 = renderTraining(g, ui);
  assert.ok(!h2.includes('st-poach') && h2.includes('Wolny od'));
  // Osoba, której już nie ma: komunikat zamiast karty
  step(g, ui, 'st-back');
  const r = handleStaffAction(g, 'st-open', { id: 'st:999999' }, ui);
  assert.match(r.ui.trNotice, /nie ma już/);
  void fireStaff;
});

test('Pliki: staff.css podpięty i w sw.js, bez wielkich liter w stylach, app.js obsługuje st-* i pola data-st-field', () => {
  const css = readFileSync(new URL('../src/styles/staff.css', import.meta.url), 'utf8');
  assert.ok(!/text-transform:\s*uppercase/.test(css));
  assert.ok(!css.includes(String.fromCharCode(8212)));
  assert.match(css, /prefers-reduced-motion/);
  assert.ok(readFileSync(new URL('../index.html', import.meta.url), 'utf8').includes('src/styles/staff.css'));
  assert.ok(readFileSync(new URL('../sw.js', import.meta.url), 'utf8').includes('src/styles/staff.css'));
  assert.ok(readFileSync(new URL('../sw.js', import.meta.url), 'utf8').includes('src/ui/staffView.js'));
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /isStaffAction\(act\)/);
  assert.match(app, /\[data-st-field\]/);
  const view = readFileSync(new URL('../src/ui/staffView.js', import.meta.url), 'utf8');
  assert.ok(!view.includes(String.fromCharCode(8212)));
});
