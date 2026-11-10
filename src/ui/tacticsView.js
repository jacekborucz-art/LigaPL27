// Ekran „Skład i taktyka”: boisko z formacją, lista „Na boisku”, ławka i zawodnicy spoza kadry.
// Zmiany składu: przeciąganie (src/ui/tacticsDrag.js) albo wybór dwoma dotknięciami; obie drogi
// korzystają z reguł w src/ui/tacticsMoves.js. Panel atrybutów: dwuklik albo przycisk „i”.
import { FORMATIONS, formationById } from '../data/formations.js';
import { INSTRUCTIONS } from '../data/instructions.js';
import { POS_NAMES } from '../data/attributes.js';
import { NAT_NAMES } from '../data/names.js';
import { proficiency } from '../engine/positions.js';
import { checkTactics } from '../engine/lineup.js';
import { GROUP, isAvailable } from '../career/squad.js';
import { moraleLabel } from '../career/morale.js';
import { attrGroupsHtml } from './squadView.js';
import { locKey, playerAt } from './tacticsMoves.js';
import { esc } from './dom.js';

const band = (prof) => (prof >= 85 ? 'ok' : prof >= 60 ? 'mid' : 'bad');
const few = (n) => n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
const freeText = (n) => (n === 1 ? 'Zostało 1 miejsce' : few(n) ? `Zostały ${n} miejsca` : `Zostało ${n} miejsc`);
const matchesWord = (n) => (n === 1 ? 'mecz' : few(n) ? 'mecze' : 'meczów');
const unavailableReason = (p) => (p.injuryDays > 0 ? `kontuzja, ${p.injuryDays} dni` : p.suspended > 0 ? 'zawieszony' : p.callUp ? 'reprezentacja' : '');
const freshBand = (f) => (f >= 80 ? 'good' : f >= 65 ? 'mid' : 'low');
/** Świeżość (pionowy pasek) i morale (kropka) obok nazwiska. */
function condHtml(p) {
  const f = Math.round(p.fresh ?? 95);
  const m = p.morale ?? 12;
  return `<span class="tp-cond" role="img" aria-label="Świeżość ${f}%, morale: ${esc(moraleLabel(m).toLowerCase())}" title="Świeżość ${f}%, morale: ${esc(moraleLabel(m).toLowerCase())}">
    <i class="tp-fresh" data-b="${freshBand(f)}" style="--f:${f}%"></i><span class="mdot" data-m="${m >= 14 ? 'hi' : m >= 10 ? 'mid' : 'lo'}"></span></span>`;
}
const posText = (p) => `${p.pos}${p.side ? ` ${p.side}` : ''}`;

/** Atrybuty wspólne dla elementów, które da się przeciągnąć (dane do „ducha” pod palcem). */
const dragAttrs = (loc, p) => `data-drag="${esc(locKey(loc))}" data-gname="${esc(p.name)}" data-gpos="${esc(p.pos)}" data-gg="${GROUP[p.pos]}"`;

/**
 * sel: null | loc ({ zone: 'xi'|'bench'|'out', idx?, id? }), zob. tacticsMoves.js.
 * info: id zawodnika z otwartym panelem atrybutów. msg: komunikat po ostatnim ruchu.
 */
export function renderTactics({ squad, tactics, sel, benchSize, info = null, msg = '' }) {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const f = formationById(tactics.formation);
  const check = checkTactics(tactics, squad, { benchSize });
  const selKey = locKey(sel);
  const selId = sel ? playerAt(tactics, sel) : null;
  const selPlayer = selId ? byId.get(selId) : null;
  const inXI = new Set(tactics.xi.filter(Boolean));
  const onBench = new Set(tactics.bench);
  const infoPlayer = info ? byId.get(info) : null;

  // ---------- Boisko
  const slotsHtml = f.slots.map((s, i) => {
    const loc = { zone: 'xi', idx: i };
    const key = locKey(loc);
    const p = byId.get(tactics.xi[i]);
    const prof = p ? proficiency(p, s.pos, s.side) : 0;
    const isSel = selKey === key;
    const cls = ['slot-btn', p ? `slot-btn--${band(prof)}` : 'slot-btn--empty', s.pos === 'BR' ? 'slot-btn--gk' : '', isSel ? 'is-sel' : ''].filter(Boolean).join(' ');
    return `<button class="${cls}" style="left:${s.x}%;top:${100 - s.y}%" data-act="tslot" data-loc="${key}" data-drop="${key}" data-handle ${p ? dragAttrs(loc, p) : ''}
      aria-pressed="${isSel}" aria-label="${esc(s.pos)}: ${p ? esc(p.name) : 'puste miejsce'}${p && prof < 85 ? `, poza pozycją (${prof}%)` : ''}">
      <span class="slot-btn__dot">${p ? p.ovr.toFixed(0) : '+'}</span>
      <span class="slot-btn__name">${p ? esc(p.last) : esc(s.pos)}</span>
      ${p && tactics.captain === p.id ? '<span class="slot-btn__c" aria-hidden="true">C</span>' : ''}
    </button>`;
  }).join('');

  // ---------- Listy
  const infoBtn = (p) => `<button class="tp-row__i" data-act="tinfo" data-id="${esc(p.id)}" aria-label="Atrybuty: ${esc(p.name)}" aria-expanded="${info === p.id}">i</button>`;
  // Uchwyt (kropki i plakietka pozycji): za niego przeciąga się palcem, reszta wiersza przewija listę.
  const handle = (pos, g) => `<span class="tp-handle" data-handle><span class="tp-grip" aria-hidden="true"></span><span class="pos" data-g="${g}">${esc(pos)}</span></span>`;

  const xiRows = f.slots.map((s, i) => {
    const loc = { zone: 'xi', idx: i };
    const key = locKey(loc);
    const p = byId.get(tactics.xi[i]);
    const isSel = selKey === key;
    if (!p) {
      return `<li class="tp-row tp-row--empty ${isSel ? 'is-sel' : ''}" data-drop="${key}">
        <button class="tp-row__main" data-act="tpick" data-loc="${key}" aria-pressed="${isSel}">
          <span class="tp-handle tp-handle--none"><span class="tp-grip" aria-hidden="true"></span><span class="pos" data-g="${GROUP[s.pos]}">${esc(s.pos)}</span></span>
          <span class="tp-row__name">Puste miejsce</span><b></b>
        </button>
      </li>`;
    }
    const prof = proficiency(p, s.pos, s.side);
    const reason = unavailableReason(p);
    const fit = prof < 100 ? `<small class="tp-fit" data-fit="${band(prof)}">${esc(posText(p))}, ${prof}% na tej pozycji</small>` : '';
    return `<li class="tp-row ${isSel ? 'is-sel' : ''} ${reason ? 'is-off' : ''}" data-drop="${key}">
      <button class="tp-row__main" data-act="tpick" data-loc="${key}" ${dragAttrs(loc, p)} aria-pressed="${isSel}">
        ${handle(s.pos, GROUP[s.pos])}
        <span class="tp-row__name">${esc(p.name)}${tactics.captain === p.id ? ' <abbr class="tp-c" title="Kapitan">C</abbr>' : ''}${reason ? `<small class="tp-off">${esc(reason)}</small>` : fit}</span>
        ${condHtml(p)}<b>${p.ovr.toFixed(1)}</b>
      </button>
      ${infoBtn(p)}
    </li>`;
  }).join('');

  const row = (p, loc) => {
    const key = locKey(loc);
    const reason = unavailableReason(p);
    const isSel = selKey === key;
    const where = loc.zone;
    return `<li class="tp-row ${isSel ? 'is-sel' : ''} ${reason ? 'is-off' : ''}" data-drop="${esc(key)}">
      <button class="tp-row__main" data-act="tpick" data-loc="${esc(key)}" ${dragAttrs(loc, p)} aria-pressed="${isSel}">
        ${handle(posText(p), GROUP[p.pos])}
        <span class="tp-row__name">${esc(p.name)}${reason ? `<small class="tp-off">${esc(reason)}</small>` : ''}</span>
        ${condHtml(p)}<b>${p.ovr.toFixed(1)}</b>
      </button>
      ${infoBtn(p)}
      ${where === 'bench' ? `<button class="tp-row__x" data-act="tunbench" data-id="${esc(p.id)}" aria-label="Usuń ${esc(p.name)} z ławki">×</button>` : ''}
      ${where === 'out' ? (isAvailable(p) ? `<button class="tp-row__x" data-act="tbench" data-id="${esc(p.id)}" aria-label="Dodaj ${esc(p.name)} na ławkę">+</button>` : '<span class="tp-row__x tp-row__x--none" aria-hidden="true"></span>') : ''}
    </li>`;
  };
  const free = Math.max(0, benchSize - tactics.bench.length);
  const bench = tactics.bench.map((id, i) => byId.get(id) && row(byId.get(id), { zone: 'bench', idx: i })).filter(Boolean).join('');
  const benchAdd = free ? `<li class="tp-row tp-add" data-drop="benchAdd">
      <button class="tp-row__main" data-act="tpick" data-loc="benchAdd">
        <span class="tp-add__plus" aria-hidden="true">+</span>
        <span class="tp-row__name">Wolne miejsce na ławce<small>${freeText(free)}</small></span>
      </button>
    </li>` : '';
  const out = squad.filter((p) => !inXI.has(p.id) && !onBench.has(p.id))
    .sort((a, b) => Number(isAvailable(b)) - Number(isAvailable(a)) || b.ovr - a.ovr).map((p) => row(p, { zone: 'out', id: p.id })).join('');

  const status = msg || (selPlayer
    ? `Wybrano: ${selPlayer.name}. Wskaż miejsce, na które ma przejść, albo zawodnika do zamiany.`
    : sel?.zone === 'xi' ? `Wybrano puste miejsce (${f.slots[sel.idx]?.pos}). Wskaż zawodnika z listy.`
      : 'Przeciągnij zawodnika na inne miejsce albo dotknij dwóch miejsc po kolei. Dwuklik na nazwisku pokazuje atrybuty.');

  // ---------- Siła składu
  const z = check.rating.zones;
  const xiPlayers = tactics.xi.map((id) => byId.get(id)).filter(Boolean);
  const roleSelect = (role, label) => `<label class="role"><span>${label}</span>
    <select data-act="trole" data-role="${role}">${xiPlayers.map((p) => `<option value="${esc(p.id)}" ${tactics[role] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`;

  return `
  <div class="tac${sel ? ' has-sel' : ''}">
    <div class="tac__form">
      <div class="chips chips--wrap" role="group" aria-label="Formacja">${FORMATIONS.map((x) => `<button class="chip" data-act="tform" data-f="${x.id}" aria-pressed="${x.id === f.id}">${esc(x.name)}</button>`).join('')}</div>
      <p class="hint">${esc(f.nick)}: ${esc(f.note)}</p>
    </div>
    <div class="tac__pitch">
      <div class="pitch2" role="group" aria-label="Boisko, formacja ${esc(f.name)}">${slotsHtml}</div>
      <p class="tac__msg${msg ? ' is-msg' : ''}" role="status">${esc(status)}</p>
      <div class="tac__actions">
        <button class="btn btn--quiet" data-act="tauto">Ustaw automatycznie</button>
        ${sel ? '<button class="btn btn--quiet" data-act="tcancel">Anuluj wybór</button>' : ''}
      </div>
    </div>
    <div class="tac__lists">
      <section class="tp-sec" aria-labelledby="tp-h-xi">
        <h3 id="tp-h-xi">Na boisku <span class="muted">${inXI.size} z ${f.slots.length}</span></h3>
        <ul class="tp-list">${xiRows}</ul>
      </section>
      <section class="tp-sec" aria-labelledby="tp-h-bench">
        <h3 id="tp-h-bench">Ławka <span class="muted">${tactics.bench.length} z ${benchSize}</span></h3>
        <ul class="tp-list">${bench || (free ? '' : '<li class="mail-empty">Ławka jest pusta.</li>')}${benchAdd}</ul>
      </section>
      <section class="tp-sec tp-out" data-drop="outZone" aria-labelledby="tp-h-out">
        <h3 id="tp-h-out">Poza kadrą meczową</h3>
        <p class="tp-dropnote" aria-hidden="true">Upuść tutaj, żeby zdjąć zawodnika z ławki</p>
        <ul class="tp-list">${out || '<li class="mail-empty">Wszyscy są w kadrze meczowej.</li>'}</ul>
      </section>
    </div>
    <div class="tac__aside">
      <div class="tac__strength">
        ${check.errors.length ? `<div class="notice notice--err" role="alert"><b>Skład nie przejdzie przed meczem:</b><ul class="plain">${check.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
        ${check.warnings.length ? `<div class="notice"><ul class="plain">${check.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
        <h3>Siła składu</h3>
        <ul class="zones">
          ${[['Bramkarz', z.GK], ['Obrona', z.DEF], ['Pomoc', z.MID], ['Atak', z.ATT]].map(([k, v]) => `<li><span>${k}</span><span class="abar"><i data-b="${v >= 13 ? 'top' : v >= 11 ? 'good' : v >= 8 ? 'mid' : 'low'}" style="width:${Math.max(0, Math.min(100, v * 5))}%"></i></span><b>${v.toFixed(1)}</b></li>`).join('')}
        </ul>
      </div>
      ${infoPlayer ? renderPlayerInfo(infoPlayer, tactics, f) : '<p class="tdet-empty">Kliknij dwukrotnie nazwisko zawodnika albo przycisk „i”, żeby zobaczyć tu jego atrybuty.</p>'}
    </div>
  </div>
  <h3>Instrukcje</h3>
  <div class="instr">
    ${INSTRUCTIONS.map((ins) => {
      const cur = tactics.instructions[ins.id];
      const opt = ins.options.find((o) => o.id === cur);
      return `<div class="instr__row"><span class="instr__label">${esc(ins.label)}</span>
        <div class="seg2" role="radiogroup" aria-label="${esc(ins.label)}">${ins.options.map((o) => `<button data-act="tinstr" data-i="${ins.id}" data-v="${o.id}" aria-pressed="${o.id === cur}">${esc(o.label)}</button>`).join('')}</div>
        <p class="hint">${esc(opt?.text ?? '')}</p></div>`;
    }).join('')}
  </div>
  <h3>Kapitan i stałe fragmenty</h3>
  <div class="roles">${roleSelect('captain', 'Kapitan')}${roleSelect('penalty', 'Rzuty karne')}${roleSelect('freeKick', 'Rzuty wolne')}${roleSelect('corner', 'Rzuty rożne')}</div>`;
}

/**
 * Panel atrybutów. Renderowany jako otwarty <dialog> (obok listy na szerokim ekranie);
 * na węższych ekranach app.js przełącza go w okno modalne (arkusz od dołu na telefonie).
 */
function renderPlayerInfo(p, tactics, f) {
  const slotIdx = tactics.xi.indexOf(p.id);
  const benchIdx = tactics.bench.indexOf(p.id);
  const slot = slotIdx >= 0 ? f.slots[slotIdx] : null;
  const prof = slot ? proficiency(p, slot.pos, slot.side) : null;
  const where = slot ? `Na boisku: ${slot.pos}, ${prof}% na tej pozycji` : benchIdx >= 0 ? 'Na ławce' : 'Poza kadrą meczową';
  const health = p.injuryDays > 0 ? `Kontuzja, ok. ${p.injuryDays} dni`
    : p.suspended > 0 ? `Zawieszony, ${p.suspended} ${matchesWord(p.suspended)}`
      : p.callUp ? 'Na zgrupowaniu reprezentacji' : 'Do dyspozycji';
  const fact = (k, v, attr = '') => `<div${attr}><dt>${k}</dt><dd>${v}</dd></div>`;
  const fresh = Math.round(p.fresh ?? 95);
  return `<dialog class="tdet" open aria-labelledby="tdet-h">
    <div class="tdet__in">
      <header class="tdet__head">
        <span class="led tdet__ovr" aria-label="OVR ${p.ovr.toFixed(1)}">${p.ovr.toFixed(1)}</span>
        <span class="pos" data-g="${GROUP[p.pos]}">${esc(posText(p))}</span>
        <button class="tdet__x" data-act="tinfoclose" aria-label="Zamknij atrybuty">×</button>
        <div class="tdet__title">
          <h3 id="tdet-h">${esc(p.name)}</h3>
          <p>${esc(POS_NAMES[p.pos])}, ${p.age} lat, ${esc(NAT_NAMES[p.nat] ?? p.nat)}</p>
        </div>
      </header>
      <dl class="tdet__facts">
        ${fact('Gdzie', esc(where))}
        ${fact('Stan', esc(health), p.injuryDays > 0 || p.suspended > 0 || p.callUp ? ' class="is-bad"' : '')}
        ${fact('Świeżość', `<span class="abar" aria-hidden="true"><i data-b="${freshBand(fresh)}" style="width:${fresh}%"></i></span>${fresh}%`)}
        ${fact('Ostrość', `${Math.round(p.sharp ?? 70)}%`)}
        ${fact('Morale', esc(moraleLabel(p.morale ?? 12)))}
      </dl>
      <div class="tdet__groups">${attrGroupsHtml(p, { heading: 'h4' })}</div>
    </div>
  </dialog>`;
}
