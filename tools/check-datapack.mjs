// Kontrola datapacku przed wczytaniem do gry (docs/datapack/agenci.md).
// Użycie: node tools/check-datapack.mjs <plik.json> [--json raport.json]
// Sprawdza plik tym samym kodem co gra (parsePack, importPack na świecie z ziarna pliku, start kariery 2026-07-01),
// a do tego rzeczy, które gra po cichu pomija: literówki w nazwach pól, wpisy nieznanych klubów, zawodników i sędziów,
// zmiany kadry odrzucone przez limit 21-32, nadmiarowe osoby sztabu, duplikaty w JSON i możliwe duplikaty osób.
// Kod wyjścia: 0 = plik poprawny (mogą być ostrzeżenia), 1 = błędy (gra odrzuci plik albo pominie dane).
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld, squadOf } from '../src/world/worldGen.js';
import { createSeason } from '../src/season/season.js';
import { createTactics } from '../src/engine/lineup.js';
import { ensureTraining } from '../src/training/index.js';
import { ensureCareer } from '../src/career/careerSystem.js';
import { ensureReferees } from '../src/career/referees.js';
import { rosterOf, directorOf } from '../src/career/staffMarket.js';
import { roleAttrKeys } from '../src/training/staff.js';
import { CLUBS_PL } from '../src/data/clubs_pl.js';
import { CLUBS_L3 } from '../src/data/clubs_l3.js';
import { GAME_START, SEASON } from '../src/config/calendar2026.js';
import { ATTRS } from '../src/data/attributes.js';
import { ageAt } from '../src/training/state.js';
import { parsePack, importPack, restoreOriginals, CLUB_FIELDS, PLAYER_FIELDS, EDIT_SQUAD } from '../src/career/editor.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
if (!file) { console.log('Użycie: node tools/check-datapack.mjs <plik.json> [--json raport.json]'); process.exit(2); }

const errors = []; const warnings = []; const info = [];
const ATTR_SET = new Set(Object.keys(ATTRS));
const raw = readFileSync(file);
let text = raw.toString('utf8');
if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); info.push('Plik ma znacznik BOM (gra go pomija, ale lepiej zapisywać UTF-8 bez BOM).'); }
if (raw.length > 40e6) errors.push(`Plik ma ${(raw.length / 1e6).toFixed(1)} MB, a gra przyjmuje najwyżej 40 MB.`);

// 1. Format pliku dokładnie jak w grze
let pack;
try { pack = parsePack(text); } catch (e) { errors.push(`Gra odrzuci plik: ${e.message}`); finish(); }
const d = JSON.parse(text);

// 2. Duplikaty kluczy w JSON (JSON.parse po cichu zostawia ostatni wpis)
for (const sec of ['clubs', 'players', 'newPlayers', 'refs']) {
  const keys = sectionKeys(text, sec);
  const seen = new Set(); const dup = new Set();
  for (const k of keys) (seen.has(k) ? dup : seen).add(k);
  if (dup.size) errors.push(`Sekcja ${sec}: identyfikator występuje kilka razy (zostaje tylko ostatni wpis): ${[...dup].slice(0, 20).join(', ')}${dup.size > 20 ? ' ...' : ''}.`);
}

// 3. Literówki: nieznane pola są pomijane bez błędu
const okHead = new Set(['type', 'v', 'game', 'seed', 'created', 'full', 'clubs', 'players', 'newPlayers', 'refs']);
const unknown = (where, obj, allowed) => {
  const bad = Object.keys(obj ?? {}).filter((k) => !allowed.has(k));
  if (bad.length) warnings.push(`${where}: nieznane pola (gra je pominie): ${bad.join(', ')}.`);
};
unknown('Nagłówek', d, okHead);
const clubKeys = new Set([...CLUB_FIELDS, 'coach', 'owner', 'staff']);
const playerKeys = new Set([...PLAYER_FIELDS, 'club', 'ovr']);
const typo = { clubs: 0, players: 0 };
for (const [id, o] of Object.entries(d.clubs ?? {})) {
  const bad = Object.keys(o).filter((k) => !clubKeys.has(k));
  if (bad.length && typo.clubs++ < 10) warnings.push(`Klub ${id}: nieznane pola: ${bad.join(', ')}.`);
  if (o.coach) unknown(`Klub ${id}, trener`, o.coach, new Set(['name', 'age', 'style', 'a']));
  if (o.owner) unknown(`Klub ${id}, właściciel`, o.owner, new Set(['name', 'cierpliwosc', 'ambicja', 'temperament', 'media', 'zasobnosc']));
  for (const [role, list] of Object.entries(o.staff ?? {})) {
    for (const [i, x] of (Array.isArray(list) ? list : []).entries()) {
      unknown(`Klub ${id}, sztab ${role} ${i + 1}`, x, new Set(['name', 'age', 'q', 'a']));
      if (d.v >= 3 && !x.a) warnings.push(`Klub ${id}, sztab ${role} ${i + 1}: brak atrybutów (a), gra użyje samej jakości q.`);
      else if (x.a && roleAttrKeys(role).some((k) => x.a[k] === undefined)) warnings.push(`Klub ${id}, sztab ${role} ${i + 1}: niepełne atrybuty (potrzebne: ${roleAttrKeys(role).join(', ')}).`);
    }
  }
}
for (const sec of ['players', 'newPlayers']) {
  for (const [id, o] of Object.entries(d[sec] ?? {})) {
    const bad = Object.keys(o).filter((k) => !playerKeys.has(k));
    if (bad.length && typo.players++ < 10) warnings.push(`Zawodnik ${id}: nieznane pola: ${bad.join(', ')}.`);
    if (o.attrs) {
      const badA = Object.keys(o.attrs).filter((k) => !ATTR_SET.has(k));
      if (badA.length) warnings.push(`Zawodnik ${id}: nieznane atrybuty (pominięte): ${badA.join(', ')}.`);
    }
  }
}

// 4. Wczytanie do nowej kariery tak jak w grze (świat z ziarna pliku)
if (pack.seed == null && Object.keys(pack.players).length) errors.push('Brak ziarna świata (seed): sekcja players nie zadziała w żadnej grze.');
const clubId = 'widzew';
const seed = pack.seed ?? 1;
const game = { seed, clubId, date: GAME_START, season: SEASON, inbox: [] };
game.season = createSeason(seed, { playerClub: clubId });
game.fixtures = game.season.fixtures;
game.world = generateWorld(seed);
game.tactics = createTactics(squadOf(game.world, clubId), { benchSize: 9 });
ensureTraining(game); ensureCareer(game); ensureReferees(game);
const base = structuredClone(game.world.players);
const baseStaff = Object.fromEntries(Object.keys(game.world.clubs).map((id) => [id, countRoles([...rosterOf(game, id), ...(directorOf(game, id) ? [directorOf(game, id)] : [])])]));  // z dyrektorem sportowym (datapack v6)
const r = importPack(game, pack);
restoreOriginals();
if (r.clubsSkipped) errors.push(`Nieznane identyfikatory klubów (pominięte przez grę): ${r.clubsSkipped}.`);
if (r.otherWorld) errors.push('Ziarno pliku nie pasuje do zawodników.');
if (r.playersSkipped && !r.otherWorld) errors.push(`Zawodnicy, których nie ma w świecie z tego ziarna (pominięci): ${r.playersSkipped}. Identyfikatory muszą pochodzić z pełnego eksportu bazowego.`);
const refIds = Object.keys(pack.refs); if (refIds.length !== (r.refs ?? 0)) errors.push(`Sędziowie spoza puli gry (pominięci): ${refIds.length - (r.refs ?? 0)}.`);
if (r.squadSkipped) errors.push(`Zmiany kadry odrzucone przez limit ${EDIT_SQUAD.min}-${EDIT_SQUAD.max} zawodników: ${r.squadSkipped}.`);
const newIds = Object.keys(pack.created); const newIn = newIds.filter((id) => game.world.players[id]).length;
if (newIn !== newIds.length) errors.push(`Nowi zawodnicy niewczytani: ${newIds.length - newIn}.`);

// Sztab: nadmiarowe osoby roli są pomijane (liczba osób jak w klubie)
for (const [id, c] of Object.entries(pack.clubs)) {
  if (!c.staff || !baseStaff[id]) continue;
  for (const [role, list] of Object.entries(c.staff)) {
    const have = baseStaff[id][role] ?? 0;
    if (list.length > have) warnings.push(`Klub ${id}, sztab ${role}: ${list.length} osób w pliku, a klub ma ${have} (nadmiar pominięty).`);
  }
}

// 5. Kadry po wczytaniu
const sizes = Object.entries(game.world.clubs).map(([id, c]) => [id, c.squad.length]);
const bad = sizes.filter(([, n]) => n < EDIT_SQUAD.min || n > EDIT_SQUAD.max);
if (bad.length) errors.push(`Kadry poza limitem ${EDIT_SQUAD.min}-${EDIT_SQUAD.max}: ${bad.map(([id, n]) => `${id} ${n}`).join(', ')}.`);
const gk = sizes.map(([id]) => [id, squadOf(game.world, id).filter((p) => p.pos === 'BR').length]).filter(([, n]) => n < 2);
if (gk.length) warnings.push(`Kluby z mniej niż 2 bramkarzami w kadrze: ${gk.map(([id, n]) => `${id} ${n}`).join(', ')}.`);

// 6. Realia: skala ocen ligi i klubu w porównaniu ze światem bazowym gry
const tierOf = new Map([...CLUBS_PL, ...CLUBS_L3].map((c) => [c.id, c.tier]));
const LEAGUE = { 1: 'Ekstraklasa', 2: '1 Liga', 3: '2 Liga', 4: 'III liga' };
const top16 = (ids, P) => { const o = ids.map((i) => P[i]?.ovr ?? 0).sort((a, b) => b - a).slice(0, 16); return o.reduce((s, x) => s + x, 0) / (o.length || 1); };
const perTier = {};
for (const [id, c] of Object.entries(game.world.clubs)) {
  const t = tierOf.get(id); if (!t) continue;
  const now = top16(c.squad, game.world.players);
  const was = top16(c.squad.filter((i) => base[i]), base);
  (perTier[t] ??= []).push(now);
  if (Math.abs(now - was) > 1.5) warnings.push(`Klub ${id}: średnia OVR 16 najlepszych ${now.toFixed(1)}, w świecie bazowym ${was.toFixed(1)} (różnica ponad 1,5: sprawdź skalę ocen).`);
}
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
for (const [t, a] of Object.entries(perTier)) info.push(`${LEAGUE[t]}: średnia OVR 16 najlepszych w klubie ${avg(a).toFixed(1)} (od ${Math.min(...a).toFixed(1)} do ${Math.max(...a).toFixed(1)}).`);
const GK = ['REF', 'CHW', 'WYJ', 'JNJ', 'NOG'];
let notes = 0;
for (const id of [...Object.keys(pack.players), ...newIds]) {
  const p = game.world.players[id]; if (!p) continue;
  const t = tierOf.get(p.clubId);
  const why = [];
  if (t === 1 && p.ovr > 15) why.push(`OVR ${p.ovr} (w Ekstraklasie powyżej 15 to poziom czołowych lig Europy)`);
  if (t >= 2 && p.ovr > 14) why.push(`OVR ${p.ovr} (za wysoko jak na ${LEAGUE[t]})`);
  if ((p.hidden?.POT ?? p.ovr) + 1 < p.ovr) why.push(`potencjał ${p.hidden?.POT} niższy niż OVR ${p.ovr}`);
  if (p.pos !== 'BR' && GK.some((k) => (p.attr[k] ?? 0) > 9)) why.push('zawodnik z pola z atrybutami bramkarskimi powyżej 9');
  if (p.pos === 'BR' && ['WYK', 'DRY'].some((k) => (p.attr[k] ?? 0) > 12)) why.push('bramkarz z wykończeniem albo dryblingiem powyżej 12');
  const age = ageAt(p, GAME_START);
  if (age < 15 || age > 45) why.push(`wiek ${age} poza zakresem 15-45 na ${GAME_START}`);
  if (/-a\d+$/.test(id) && age >= 19) why.push(`miejsce akademii, a wiek ${age} (juniorzy do 18 lat; gra przeniesie go do pierwszej drużyny albo do wolnych)`);
  if (why.length && notes++ < 60) warnings.push(`Zawodnik ${id} (${p.name}): ${why.join('; ')}.`);
}
if (notes > 60) warnings.push(`... i jeszcze ${notes - 60} zawodników z uwagami.`);

// 7. Możliwe duplikaty osób: to samo imię i nazwisko w świecie gry po wczytaniu
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
const touched = new Set([...Object.keys(pack.players).filter((id) => pack.players[id].first !== undefined || pack.players[id].last !== undefined), ...newIds]);
const byName = new Map();
for (const p of Object.values(game.world.players)) {
  if (!p.name) continue;
  const k = norm(p.name);
  (byName.get(k) ?? byName.set(k, []).get(k)).push(p);
}
const dupes = [];
for (const [, list] of byName) {
  if (list.length < 2 || !list.some((p) => touched.has(p.id))) continue;
  const sameBirth = new Set(list.map((p) => p.birthDate)).size < list.length;
  dupes.push({ pewny: sameBirth, osoby: list.map((p) => ({ id: p.id, imie: p.name, urodzony: p.birthDate, klub: p.clubId ?? 'wolny', nat: p.nat, pos: p.pos })) });
}
for (const x of dupes.filter((x) => x.pewny)) errors.push(`Duplikat (to samo imię, nazwisko i data urodzenia): ${x.osoby.map((o) => `${o.id} ${o.klub}`).join(' i ')} (${x.osoby[0].imie}, ${x.osoby[0].urodzony}).`);
const maybe = dupes.filter((x) => !x.pewny);
if (maybe.length) warnings.push(`Możliwe duplikaty (to samo imię i nazwisko, różne daty urodzenia): ${maybe.length}. Lista w raporcie poniżej.`);

info.push(`Wczytano: kluby ${r.clubs}, zawodnicy ${r.players}, nowi zawodnicy ${r.created ?? 0}, sędziowie ${r.refs ?? 0}.`);
finish(maybe);

function finish(maybeList = []) {
  const out = { plik: file, ok: !errors.length, bledy: errors, ostrzezenia: warnings, informacje: info, mozliweDuplikaty: maybeList };
  console.log(errors.length ? `BŁĘDY (${errors.length}):` : 'Plik poprawny: gra go wczyta.');
  for (const e of errors) console.log(`  x ${e}`);
  if (warnings.length) console.log(`Ostrzeżenia (${warnings.length}):`);
  for (const w of warnings) console.log(`  ! ${w}`);
  for (const i of info) console.log(`  i ${i}`);
  for (const x of maybeList.slice(0, 40)) console.log(`  ? ${x.osoby.map((o) => `${o.id} ${o.imie} ur. ${o.urodzony} (${o.klub}, ${o.nat}, ${o.pos})`).join(' | ')}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 2));
  process.exit(errors.length ? 1 : 0);
}

/** Klucze najwyższego poziomu sekcji, w kolejności z pliku (z powtórzeniami). */
function sectionKeys(src, name) {
  const m = new RegExp(`"${name}"\\s*:\\s*\\{`).exec(src);
  if (!m) return [];
  const keys = []; let depth = 0; let i = m.index + m[0].length - 1; let expectKey = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      let j = i + 1; while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      if (depth === 1 && expectKey) { keys.push(src.slice(i + 1, j)); expectKey = false; }
      i = j; continue;
    }
    if (ch === '{' || ch === '[') { depth++; if (depth === 1) expectKey = true; continue; }
    if (ch === '}' || ch === ']') { depth--; if (depth === 0) break; continue; }
    if (ch === ',' && depth === 1) expectKey = true;
  }
  return keys;
}
function countRoles(list) { const o = {}; for (const p of list) o[p.role] = (o[p.role] ?? 0) + 1; return o; }
