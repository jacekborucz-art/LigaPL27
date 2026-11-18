// Instrukcje indywidualne zawodników: okno zawodnika, okno z tabelą (PC) albo listą jednej instrukcji (telefon)
// i znacznik przy nazwisku (docs/instrukcje-indywidualne.md, rozdział 8 i 11). Czyste funkcje zwracające HTML,
// wspólne dla ekranu Skład i taktyka (src/app.js, data-act) i okna „Zmiany i taktyka” w meczu
// (src/ui/matchdayView.js, data-md). Host podaje attr(nazwa, dane) z atrybutami przycisków.
// Jakość wykonania instrukcji jest ukryta: tylko ogólne opisy zysku i ryzyka, bez prognozy dla zawodnika.
import { PLAYER_INSTRUCTIONS, PI_IDS, PI_KEYS, PI_TEAM_LABEL, piAllowed, teamLevel, playerInstruction, cleanPlayerInstr, playerInstrCount, arrowOf, arrowToInstr, arrowsFor, arrowLabel, arrowHint, ARROW_DIRS } from '../data/playerInstructions.js';
import { INSTRUCTIONS } from '../data/instructions.js';
import { formationById } from '../data/formations.js';
import { byPosition } from '../engine/positions.js';
import { GROUP } from '../career/squad.js';
import { esc } from './dom.js';

/** Filtry pozycji w oknie z tabelą: [klucz, etykieta]. */
export const PI_FILTERS = [['all', 'Wszyscy'], ['GK', 'BR'], ['DEF', 'Obrona'], ['MID', 'Pomoc'], ['ATT', 'Atak'], ['xi', 'Skład'], ['bench', 'Ławka']];
const ZONE_HEAD = { xi: 'Pierwszy skład', bench: 'Ławka rezerwowych', out: 'Poza kadrą meczową' };

const ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2.6" width="10" height="11.8" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 1.6h4v2.2H6z" fill="currentColor"/><path d="M5.6 7.6l1.6 1.6 3.2-3.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.6 11.8h4.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

/** Pozycja do wyświetlenia: miejsce w składzie albo pozycja zawodnika. */
export const piPos = (row) => row.slotPos ?? row.p.pos;
/** Czy instrukcja dotyczy zawodnika: jego pozycja albo miejsce w składzie (jak walidacja w silniku). */
export const piFor = (id, row) => piAllowed(id, row.p.pos) || (!!row.slotPos && piAllowed(id, row.slotPos));

/** Etykieta opcji, np. „Twardy”; 0: „Jak drużyna”. */
export function piOptionLabel(id, v) {
  const d = playerInstruction(id);
  return d?.options.find((o) => o.v === v)?.label ?? PI_TEAM_LABEL;
}

/** „odbiór twardy, pressing więcej, ruch skos do środka” (kolejność z katalogu) albo pusty tekst. */
export function piSummary(o) {
  if (!o) return '';
  const dir = arrowOf(o);
  return PLAYER_INSTRUCTIONS.filter((d) => (d.id === 'run' ? !!dir : o[d.id] === -1 || o[d.id] === 1))
    .map((d) => (d.id === 'run' ? `ruch ${arrowLabel(dir).toLowerCase()}` : `${d.label.toLowerCase()} ${piOptionLabel(d.id, o[d.id]).toLowerCase()}`)).join(', ');
}

/** Kierunki Ruchu dla wiersza: pozycja zawodnika albo miejsce w składzie (jak walidacja w silniku). */
export function piDirsFor(row) {
  const s = new Set([...arrowsFor(row.p.pos, row.slotX), ...(row.slotPos ? arrowsFor(row.slotPos, row.slotX) : [])]); // przy linii bocznej bez ruchu na zewnątrz
  return ARROW_DIRS.map((d) => d.id).filter((d) => s.has(d));
}
/** Nowa mapa po ustawieniu kierunku Ruchu (run i lat razem; '' albo null: jak drużyna). */
export function piWithDir(map, pid, dir) {
  const { run, lat } = arrowToInstr(dir || null);
  return piWith(piWith(map, pid, 'run', run), pid, 'lat', lat);
}
/** Opis zmiany w kolejce meczu: zmienione instrukcje, Ruch jako kierunek ze szkicu entry. */
export function piChangeText(o, entry) {
  if (o === null) return 'wszystko jak drużyna';
  const parts = Object.entries(o).filter(([k]) => k !== 'run' && k !== 'lat').map(([k, v]) => `${playerInstruction(k)?.label.toLowerCase() ?? k} ${piOptionLabel(k, v).toLowerCase()}`);
  if ('run' in o || 'lat' in o) parts.push(`ruch ${arrowLabel(arrowOf(entry)).toLowerCase()}`);
  return parts.join(', ');
}

/** Znacznik przy nazwisku: ikona (kształt, nie tylko kolor) z opisem w title i aria-label. Brak instrukcji: pusty tekst. */
export function piMarker(o, cls = '') {
  const s = piSummary(o);
  if (!s) return '';
  const t = `Instrukcje: ${s}`;
  return `<span class="pi-mark${cls ? ` ${cls}` : ''}" role="img" aria-label="${esc(t)}" title="${esc(t)}">${ICON}</span>`;
}

/** Wartość instrukcji drużyny pokazywana przy „Jak drużyna”, np. „Mieszane”; bez odpowiednika: „normalnie”. */
export function teamValueLabel(id, instructions) {
  const d = playerInstruction(id);
  if (!d?.team) return 'normalnie';
  const ins = INSTRUCTIONS.find((i) => i.id === d.team.id);
  const cur = instructions?.[d.team.id] ?? ins?.default;
  return ins?.options.find((o) => o.id === cur)?.label ?? 'normalnie';
}

/** Nowa mapa nadpisań po ustawieniu instrukcji k zawodnika pid na v (-1, 0, 1). Wejście bez zmian. */
export function piWith(map, pid, k, v) {
  const out = { ...(map ?? {}) };
  const cur = { ...(out[pid] ?? {}) };
  if (v === -1 || v === 1) cur[k] = v; else delete cur[k];
  const c = cleanPlayerInstr(cur);
  if (c) out[pid] = c; else delete out[pid];
  return out;
}
/** Nowa mapa bez nadpisań zawodnika pid (wszystko jak drużyna). */
export function piWithout(map, pid) {
  const out = { ...(map ?? {}) };
  delete out[pid];
  return out;
}

/**
 * Zmiana w meczu dla changeTactics: szkic draft wobec obecnych nadpisań cur, tylko zawodnicy z ids (kadra meczowa
 * bez wykluczonych). Zwraca { [id]: { k: -1|0|1 } (tylko zmienione instrukcje) | null (wszystkie jak drużyna) }.
 */
export function piPatch(cur = {}, draft = {}, ids = null) {
  const ok = ids ? new Set([...ids].map(String)) : null;
  const out = {};
  for (const id of new Set([...Object.keys(cur ?? {}), ...Object.keys(draft ?? {})])) {
    if (ok && !ok.has(String(id))) continue;
    const a = cur?.[id] ?? {}; const b = draft?.[id] ?? {};
    const ch = {};
    for (const k of PI_KEYS) if ((a[k] ?? 0) !== (b[k] ?? 0)) ch[k] = b[k] ?? 0;
    if (Object.keys(ch).length) out[id] = Object.keys(b).length ? ch : null;
  }
  return out;
}

/**
 * Wiersze okna z tabelą przed meczem: pierwszy skład (pozycja slotu), ławka i reszta kadry (według pozycji).
 * Zwraca [{ id, p, slotPos, zone: 'xi'|'bench'|'out' }].
 */
export function piRowsFromTactics(squad, tactics) {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const f = formationById(tactics.formation);
  const rows = [];
  const seen = new Set();
  tactics.xi.forEach((id, i) => { const p = byId.get(id); if (p && !seen.has(id)) { seen.add(id); rows.push({ id, p, slotPos: f.slots[i]?.pos ?? null, slotX: f.slots[i]?.x ?? null, zone: 'xi' }); } });
  tactics.bench.map((id) => byId.get(id)).filter((p) => p && !seen.has(p.id)).sort(byPosition)
    .forEach((p) => { seen.add(p.id); rows.push({ id: p.id, p, slotPos: null, zone: 'bench' }); });
  squad.filter((p) => !seen.has(p.id)).sort(byPosition).forEach((p) => rows.push({ id: p.id, p, slotPos: null, zone: 'out' }));
  return rows;
}

const passes = (f, row) => (f === 'all' ? true : f === 'xi' || f === 'bench' ? row.zone === f : (GROUP[piPos(row)] ?? 'MID') === f);
const nWord = (n) => (n === 1 ? 'zawodnika' : 'zawodników');

/** Przyciski Mniej / Jak drużyna / Więcej jednej instrukcji. */
function segHtml(d, row, val, instructions, attr, { short = false, label = d.label } = {}) {
  const tl = teamLevel(d.id, instructions);
  const team = teamValueLabel(d.id, instructions);
  const [minus, plus] = [d.options.find((o) => o.v === -1), d.options.find((o) => o.v === 1)];
  // Opcja równa instrukcji drużyny niczego nie zmienia (tak gra już cała drużyna)
  const b = (o) => {
    const same = o.v === tl && val !== o.v;
    return `<button type="button" ${attr('set', { id: row.id, k: d.id, v: o.v })} aria-pressed="${val === o.v}"${same ? ' disabled' : ''} title="${esc(same ? `Tak gra już cała drużyna (${team.toLowerCase()})` : o.hint)}">${esc(o.label)}</button>`;
  };
  const mid = `<button type="button" ${attr('set', { id: row.id, k: d.id, v: 0 })} aria-pressed="${!val}" title="${esc(`Jak reszta drużyny: ${team.toLowerCase()}`)}">${esc(short ? 'Jak drużyna' : PI_TEAM_LABEL)}${short ? '' : `<small>teraz: ${esc(team.toLowerCase())}</small>`}</button>`;
  return `<div class="pi-seg" role="group" aria-label="${esc(label)}">${b(minus)}${mid}${b(plus)}</div>`;
}

/** Przyciski kierunków Ruchu w oknie zawodnika: jak drużyna i kierunki dozwolone na jego pozycji albo miejscu. */
function dirSegHtml(row, entry, attr) {
  const cur = arrowOf(entry) ?? '';
  const b = (d, text) => `<button type="button" ${attr('dir', { id: row.id, d })} aria-pressed="${cur === d}" title="${esc(d ? arrowHint(d, piPos(row)) : 'Bez osobnego ruchu, jak reszta drużyny')}">${esc(text)}</button>`;
  return `<div class="pi-seg pi-seg--dirs" role="group" aria-label="Ruch">${b('', PI_TEAM_LABEL)}${piDirsFor(row).map((d) => b(d, arrowLabel(d))).join('')}</div>`;
}
/** Lista wyboru kierunku Ruchu (tabela na PC i lista na telefonie; listener change jak przy innych instrukcjach). */
function dirSelectHtml(r, entry, label) {
  const cur = arrowOf(entry) ?? '';
  const opts = [['', PI_TEAM_LABEL], ...piDirsFor(r).map((x) => [x, arrowLabel(x)])].map(([ov, l]) => `<option value="${ov}"${ov === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
  return `<select class="pit-sel" data-id="${esc(r.id)}" data-k="run" aria-label="${esc(label)}">${opts}</select>`;
}

/**
 * Okno instrukcji jednego zawodnika. row: { id, p, slotPos }, entry: jego nadpisania albo null,
 * instructions: instrukcje drużyny, attr(nazwa, dane): atrybuty przycisków hosta
 * (set, reset, table, done, close), note: tekst stopki (zapis albo koszt zgrania w meczu), back: tekst przycisku Gotowe.
 */
export function piPlayerHtml({ row, entry = null, instructions = {}, attr, note = '', done = 'Gotowe' }) {
  const p = row.p;
  const pos = piPos(row);
  const list = PLAYER_INSTRUCTIONS.filter((d) => piFor(d.id, row));
  const skipped = PLAYER_INSTRUCTIONS.length - list.length;
  const rows = list.map((d) => {
    if (d.id === 'run') {
      // Ruch: kierunek strzałki (do przodu, skosy, do środka, szeroko, cofnięcie), ten sam zapis co na boisku
      const dir = arrowOf(entry);
      return `<div class="pi-row${dir ? ' is-set' : ''}" data-k="run">
      <span class="pi-row__lbl" id="pi-l-run">${esc(d.label)}</span>
      ${dirSegHtml(row, entry, attr)}
      <p class="pi-row__hint">${esc(dir ? arrowHint(dir, pos) : 'Gra jak reszta drużyny (bez osobnego ruchu). Kierunek możesz też narysować strzałką na boisku.')}</p>
    </div>`;
    }
    const val = entry?.[d.id] === -1 || entry?.[d.id] === 1 ? entry[d.id] : 0;
    const opt = d.options.find((o) => o.v === val);
    const hint = opt ? opt.hint : `Gra jak reszta drużyny (${d.team ? `${INSTRUCTIONS.find((i) => i.id === d.team.id)?.label.toLowerCase() ?? d.label.toLowerCase()}: ${teamValueLabel(d.id, instructions).toLowerCase()}` : 'bez osobnego polecenia'}).`;
    return `<div class="pi-row${val ? ' is-set' : ''}" data-k="${d.id}">
      <span class="pi-row__lbl" id="pi-l-${d.id}">${esc(d.label)}</span>
      ${segHtml(d, row, val, instructions, attr)}
      <p class="pi-row__hint">${esc(hint)}</p>
    </div>`;
  }).join('');
  const where = row.slotPos && row.slotPos !== p.pos ? `W składzie na pozycji ${row.slotPos}, nominalnie ${p.pos}` : row.zone === 'bench' ? 'Ławka rezerwowych' : row.zone === 'out' ? 'Poza kadrą meczową' : `W składzie na pozycji ${pos}`;
  const has = !!cleanPlayerInstr(entry);
  return `<div class="pi pi--player">
    <header class="pi__head">
      <span class="pos" data-g="${GROUP[pos] ?? 'MID'}">${esc(pos)}</span>
      <span class="pi__who"><b class="pi__title" id="piTitle" tabindex="-1">${esc(p.name)}</b><small>${esc(where)}</small></span>
      <button type="button" class="pi__x" ${attr('close', {})} aria-label="Zamknij">×</button>
    </header>
    <div class="pi__body">
      <p class="pi__lead">Instrukcja zawodnika zastępuje instrukcję drużyny tylko dla niego. Jeden zawodnik zmienia grę drużyny w niewielkim stopniu.</p>
      <div class="pi-rows">${rows}</div>
      ${skipped ? `<p class="hint pi__skip">${esc(skipped === PLAYER_INSTRUCTIONS.length - 1 ? 'Na tej pozycji działa tylko ta instrukcja.' : 'Pozostałe instrukcje nie dotyczą tej pozycji.')}</p>` : ''}
    </div>
    <footer class="pi__foot">
      ${note ? `<p class="pi__note" role="status">${esc(note)}</p>` : ''}
      <div class="pi__btns">
        <button type="button" class="btn btn--quiet" ${attr('reset', { id: row.id })}${has ? '' : ' disabled'}>Przywróć jak drużyna</button>
        <button type="button" class="btn btn--quiet" ${attr('table', {})}>Wszyscy zawodnicy</button>
        <button type="button" class="btn btn--primary" ${attr('done', {})}>${esc(done)}</button>
      </div>
    </footer>
  </div>`;
}

/**
 * Okno „Instrukcje indywidualne”: PC tabela (zawodnicy w wierszach, 7 instrukcji w kolumnach, listy wyboru),
 * telefon jedna instrukcja naraz i lista zawodników z przełącznikami (przełączanie widoku w CSS).
 * rows: [{ id, p, slotPos, zone }], map: nadpisania, filter: klucz z PI_FILTERS, pick: instrukcja na telefonie,
 * attr(nazwa, dane): set, open, filter, pick, resetAll, done, close.
 */
export function piTableHtml({ rows, map = {}, instructions = {}, filter = 'all', pick = 'pass', attr, note = '' }) {
  const f = PI_FILTERS.some(([k]) => k === filter) ? filter : 'all';
  const k1 = PI_IDS.includes(pick) ? pick : 'pass';
  const shown = rows.filter((r) => passes(f, r));
  const n = playerInstrCount(map);
  const valOf = (r, id) => (map[r.id]?.[id] === -1 || map[r.id]?.[id] === 1 ? map[r.id][id] : 0);
  const nameBtn = (r) => `<button type="button" class="pit-name" ${attr('open', { id: r.id })} title="Instrukcje zawodnika">${esc(r.p.name)}</button>`;
  const chips = `<div class="chips pi-chips" role="group" aria-label="Pozycje">${PI_FILTERS.map(([k, l]) => `<button type="button" class="chip" ${attr('filter', { f: k })} aria-pressed="${k === f}">${esc(l)}</button>`).join('')}</div>`;

  // PC: tabela z przyklejonym nagłówkiem i kolumną nazwisk
  const head = `<tr><th scope="col" class="pit-c0">Zawodnik</th>${PLAYER_INSTRUCTIONS.map((d) => `<th scope="col"><span>${esc(d.label)}</span>${d.team ? `<small>drużyna: ${esc(teamValueLabel(d.id, instructions).toLowerCase())}</small>` : ''}</th>`).join('')}</tr>`;
  const cell = (r, d) => {
    if (!piFor(d.id, r)) return '<td class="pit-na"><span>nie dotyczy</span></td>';
    if (d.id === 'run') {
      const dir = arrowOf(map[r.id]); const ok = !!dir && piDirsFor(r).includes(dir);
      // Pierwszy skład: ruch ustawia strzałka na boisku (prawy przycisk), tu tylko podgląd; ławka i reszta: lista wyboru
      if (r.zone === 'xi') return `<td class="pit-pitch${ok ? ' is-set' : ''}"><span title="Strzałkę ruchu rysuje się na boisku: prawy przycisk przytrzymany i przeciągnięty od zawodnika">${esc(ok ? arrowLabel(dir) : 'strzałka na boisku')}</span></td>`;
      return `<td class="${ok ? 'is-set' : ''}">${dirSelectHtml(r, map[r.id], `${r.p.name}: ${d.label}`)}</td>`;
    }
    const v = valOf(r, d.id);
    const tl = teamLevel(d.id, instructions);
    const opts = [[0, PI_TEAM_LABEL], ...d.options.map((o) => [o.v, o.label])]
      .map(([ov, l]) => `<option value="${ov}"${ov === v ? ' selected' : ''}${ov !== 0 && ov === tl && ov !== v ? ' disabled' : ''}>${esc(l)}</option>`).join('');
    return `<td class="${v ? 'is-set' : ''}"><select class="pit-sel" data-id="${esc(r.id)}" data-k="${d.id}" aria-label="${esc(`${r.p.name}: ${d.label}`)}">${opts}</select></td>`;
  };
  let zone = null;
  const body = shown.map((r) => {
    const grp = r.zone !== zone ? `<tr class="pit-grp"><th colspan="${PLAYER_INSTRUCTIONS.length + 1}" scope="colgroup">${esc(ZONE_HEAD[r.zone] ?? '')}</th></tr>` : '';
    zone = r.zone;
    const pos = piPos(r);
    return `${grp}<tr class="pit-row${map[r.id] ? ' has-pi' : ''}"><th scope="row" class="pit-c0"><span class="pos" data-g="${GROUP[pos] ?? 'MID'}">${esc(pos)}</span>${nameBtn(r)}${piMarker(map[r.id])}</th>${PLAYER_INSTRUCTIONS.map((d) => cell(r, d)).join('')}</tr>`;
  }).join('');
  const table = `<div class="pit-wrap"><table class="pit"><thead>${head}</thead><tbody>${body || `<tr><td colspan="${PLAYER_INSTRUCTIONS.length + 1}" class="hint">Brak zawodników w tym filtrze.</td></tr>`}</tbody></table></div>`;

  // Telefon: jedna instrukcja naraz
  const d1 = playerInstruction(k1);
  const fit = shown.filter((r) => piFor(k1, r));
  const other = shown.length - fit.length;
  const pickChips = `<div class="chips pi-chips pi-pick" role="group" aria-label="Instrukcja">${PLAYER_INSTRUCTIONS.map((d) => `<button type="button" class="chip" ${attr('pick', { k: d.id })} aria-pressed="${d.id === k1}">${esc(d.label)}</button>`).join('')}</div>`;
  const one = `<div class="pit-one">
      ${pickChips}
      <p class="hint pit-one__team">${esc(k1 === 'run' ? 'Ruch: kierunek w ataku (do przodu, skosy, do środka, szeroko, cofnięcie), jak strzałka na boisku.' : `${d1.label}: ${d1.options.map((o) => o.label.toLowerCase()).join(' albo ')}. Drużyna teraz: ${teamValueLabel(k1, instructions).toLowerCase()}.`)}</p>
      <ul class="pit-list">${fit.map((r) => {
        const v = valOf(r, k1);
        const pos = piPos(r);
        const ctl = k1 === 'run' ? `<span class="pi-seg pi-seg--sel">${dirSelectHtml(r, map[r.id], `${r.p.name}: ${d1.label}`)}</span>` : segHtml(d1, r, v, instructions, attr, { short: true, label: `${r.p.name}: ${d1.label}` });
        return `<li class="pit-item${v || (k1 === 'run' && arrowOf(map[r.id])) ? ' is-set' : ''}"><span class="pit-item__who"><span class="pos" data-g="${GROUP[pos] ?? 'MID'}">${esc(pos)}</span>${nameBtn(r)}${piMarker(map[r.id])}</span>${ctl}</li>`;
      }).join('') || '<li class="hint">Brak zawodników, których dotyczy ta instrukcja.</li>'}</ul>
      ${other ? `<p class="hint">${esc(`Ta instrukcja nie dotyczy ${other} ${nWord(other)} z tej listy (pozycja).`)}</p>` : ''}
    </div>`;

  return `<div class="pi pi--table">
    <header class="pi__head">
      <span class="pi__who"><b class="pi__title" id="piTitle" tabindex="-1">Instrukcje indywidualne</b><small>${esc(n ? `Zawodnicy z instrukcjami: ${n}` : 'Wszyscy grają jak drużyna')}</small></span>
      <button type="button" class="pi__x" ${attr('close', {})} aria-label="Zamknij">×</button>
    </header>
    <div class="pi__body">
      <p class="pi__lead">Instrukcja zawodnika zastępuje instrukcję drużyny tylko dla niego. Nazwisko otwiera okno zawodnika z opisem zysku i ryzyka.</p>
      ${chips}
      ${table}
      ${one}
    </div>
    <footer class="pi__foot">
      ${note ? `<p class="pi__note" role="status">${esc(note)}</p>` : ''}
      <div class="pi__btns">
        <button type="button" class="btn btn--quiet" ${attr('resetAll', {})}${n ? '' : ' disabled'}>Przywróć wszystkim jak drużyna</button>
        <button type="button" class="btn btn--primary" ${attr('done', {})}>Gotowe</button>
      </div>
    </footer>
  </div>`;
}
