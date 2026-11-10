// Ekran „Skład i taktyka”: boisko z formacją, wybór zawodników dwoma dotknięciami,
// ławka, instrukcje, kapitan i stałe fragmenty, ostrzeżenia i siła składu.
import { FORMATIONS, formationById } from '../data/formations.js';
import { INSTRUCTIONS } from '../data/instructions.js';
import { proficiency } from '../engine/positions.js';
import { checkTactics } from '../engine/lineup.js';
import { GROUP, isAvailable } from '../career/squad.js';
import { esc } from './dom.js';

const band = (prof) => (prof >= 85 ? 'ok' : prof >= 60 ? 'mid' : 'bad');
const unavailableReason = (p) => (p.injuryDays > 0 ? `kontuzja, ${p.injuryDays} dni` : p.suspended > 0 ? 'zawieszony' : p.callUp ? 'reprezentacja' : '');

/**
 * sel: null | { type: 'xi'|'bench', idx } | { type: 'player', id }
 */
export function renderTactics({ squad, tactics, sel, benchSize }) {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const f = formationById(tactics.formation);
  const check = checkTactics(tactics, squad, { benchSize });
  const selXI = sel?.type === 'xi' ? sel.idx : -1;
  const selPlayer = sel?.type === 'player' ? sel.id : sel?.type === 'xi' ? tactics.xi[sel.idx] : sel?.type === 'bench' ? tactics.bench[sel.idx] : null;
  const inXI = new Set(tactics.xi.filter(Boolean));
  const onBench = new Set(tactics.bench);

  const slotsHtml = f.slots.map((s, i) => {
    const p = byId.get(tactics.xi[i]);
    const prof = p ? proficiency(p, s.pos, s.side) : 0;
    const cls = ['slot-btn', p ? `slot-btn--${band(prof)}` : 'slot-btn--empty', selXI === i ? 'is-sel' : ''].join(' ');
    return `<button class="${cls}" style="left:${s.x}%;top:${100 - s.y}%" data-act="tslot" data-idx="${i}"
      aria-label="${esc(s.pos)}: ${p ? esc(p.name) : 'puste miejsce'}${p && prof < 85 ? `, poza pozycją (${prof}%)` : ''}">
      <span class="slot-btn__dot">${p ? p.ovr.toFixed(0) : '+'}</span>
      <span class="slot-btn__name">${p ? esc(p.last) : esc(s.pos)}</span>
      ${p && tactics.captain === p.id ? '<span class="slot-btn__c" aria-hidden="true">C</span>' : ''}
    </button>`;
  }).join('');

  const row = (p, where, idx) => {
    const reason = unavailableReason(p);
    const isSel = selPlayer === p.id;
    return `<li class="tp-row ${isSel ? 'is-sel' : ''} ${reason ? 'is-off' : ''}">
      <button class="tp-row__main" data-act="tpick" data-id="${esc(p.id)}" data-where="${where}" ${idx != null ? `data-idx="${idx}"` : ''}>
        <span class="pos" data-g="${GROUP[p.pos]}">${esc(p.pos)}${p.side ? ` ${p.side}` : ''}</span>
        <span class="tp-row__name">${esc(p.name)}${reason ? `<small>${esc(reason)}</small>` : ''}</span>
        <b>${p.ovr.toFixed(1)}</b>
      </button>
      ${where === 'bench' ? `<button class="tp-row__x" data-act="tunbench" data-id="${esc(p.id)}" aria-label="Usuń ${esc(p.name)} z ławki">×</button>` : ''}
      ${where === 'out' && isAvailable(p) ? `<button class="tp-row__x" data-act="tbench" data-id="${esc(p.id)}" aria-label="Dodaj ${esc(p.name)} na ławkę">+</button>` : ''}
    </li>`;
  };
  const bench = tactics.bench.map((id, i) => byId.get(id) && row(byId.get(id), 'bench', i)).filter(Boolean).join('');
  const out = squad.filter((p) => !inXI.has(p.id) && !onBench.has(p.id))
    .sort((a, b) => Number(isAvailable(b)) - Number(isAvailable(a)) || b.ovr - a.ovr).map((p) => row(p, 'out')).join('');

  const z = check.rating.zones;
  const xiPlayers = tactics.xi.map((id) => byId.get(id)).filter(Boolean);
  const roleSelect = (role, label) => `<label class="role"><span>${label}</span>
    <select data-act="trole" data-role="${role}">${xiPlayers.map((p) => `<option value="${esc(p.id)}" ${tactics[role] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`;

  return `
  <div class="tac">
    <div class="tac__pitchcol">
      <div class="chips" role="radiogroup" aria-label="Formacja">${FORMATIONS.map((x) => `<button class="chip" data-act="tform" data-f="${x.id}" aria-pressed="${x.id === f.id}">${esc(x.name)}</button>`).join('')}</div>
      <p class="hint">${esc(f.nick)}: ${esc(f.note)}</p>
      <div class="pitch2" aria-label="Boisko, formacja ${esc(f.name)}">${slotsHtml}</div>
      <p class="hint">${sel ? 'Wybierz zawodnika z listy albo inne miejsce na boisku, żeby zamienić.' : 'Dotknij miejsca na boisku, a potem zawodnika z listy.'}</p>
      <div class="tac__actions">
        <button class="btn btn--quiet" data-act="tauto">Ustaw automatycznie</button>
        ${sel ? '<button class="btn btn--quiet" data-act="tcancel">Anuluj wybór</button>' : ''}
      </div>
    </div>
    <div class="tac__side">
      ${check.errors.length ? `<div class="notice notice--err" role="alert"><b>Skład nie przejdzie przed meczem:</b><ul class="plain">${check.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      ${check.warnings.length ? `<div class="notice"><ul class="plain">${check.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      <h3>Siła składu</h3>
      <ul class="zones">
        ${[['Bramkarz', z.GK], ['Obrona', z.DEF], ['Pomoc', z.MID], ['Atak', z.ATT]].map(([k, v]) => `<li><span>${k}</span><span class="abar"><i data-b="${v >= 13 ? 'top' : v >= 11 ? 'good' : v >= 8 ? 'mid' : 'low'}" style="width:${Math.max(0, Math.min(100, v * 5))}%"></i></span><b>${v.toFixed(1)}</b></li>`).join('')}
      </ul>
      <h3>Ławka <span class="muted">${tactics.bench.length} z ${benchSize}</span></h3>
      <ul class="tp-list">${bench || '<li class="mail-empty">Ławka jest pusta.</li>'}</ul>
      <h3>Poza kadrą meczową</h3>
      <ul class="tp-list">${out || '<li class="mail-empty">Wszyscy są w kadrze meczowej.</li>'}</ul>
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
