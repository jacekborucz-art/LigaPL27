// Ekran „Skład i taktyka”: boisko z formacją, lista „Pierwszy skład”, ławka rezerwowych i zawodnicy spoza kadry.
// Zmiany składu: przeciąganie (src/ui/tacticsDrag.js) albo wybór dwoma dotknięciami; obie drogi
// korzystają z reguł w src/ui/tacticsMoves.js. Panel atrybutów: dwuklik albo przycisk „i”.
import { FORMATIONS, formationById } from '../data/formations.js';
import { INSTRUCTIONS } from '../data/instructions.js';
import { proficiency, byPosition } from '../engine/positions.js';
import { checkTactics } from '../engine/lineup.js';
import { GROUP, isAvailable } from '../career/squad.js';
import { moraleLabel } from '../career/morale.js';
import { locKey, playerAt } from './tacticsMoves.js';
import { esc } from './dom.js';
import { profBand } from './positionMap.js';
import { renderPlayerCard, cardFact, barFactHtml } from './playerCard.js'; // karta wspólna z oknem zmian w meczu

const band = (prof) => (prof >= 85 ? 'ok' : prof >= 60 ? 'mid' : 'bad');
const few = (n) => n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
const freeText = (n) => (n === 1 ? 'Zostało 1 miejsce' : few(n) ? `Zostały ${n} miejsca` : `Zostało ${n} miejsc`);
const matchesWord = (n) => (n === 1 ? 'mecz' : few(n) ? 'mecze' : 'meczów');
const unavailableReason = (p) => (p.injuryDays > 0 ? `kontuzja, ${p.injuryDays} dni` : p.suspended > 0 ? 'zawieszony' : p.callUp ? 'reprezentacja' : p.loanBlock ? 'mecz z klubem macierzystym' : p.teamBlock ? 'druga drużyna klubu' : '');
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
 * Zmiennik na miejscu s (pozycja i strona slotu): pasmo biegłości jak w mapie pozycji karty
 * (opt od 85, ok od 70, weak od 50, niżej albo niedostępny: no). Tylko obliczenie do widoku, zasady gry bez zmian.
 */
export function repLevel(p, s) {
  if (!isAvailable(p)) return { b: 'no', v: 0, nat: false };
  const v = Math.round(proficiency(p, s.pos, s.side));
  return { b: profBand(v), v, nat: p.pos === s.pos && (!s.side || !p.side || p.side === 'LP' || p.side === s.side) };
}
const REP_WORD = { ok: 'da radę', weak: 'słabo' };
const repWord = (r) => (r.b === 'opt' ? (r.nat ? 'naturalny' : 'pasuje') : REP_WORD[r.b] ?? '');
const repAttr = (r) => (r ? ` data-rep="${r.b}"` : '');
const repAria = (r) => (r && r.b !== 'no' ? `, zmiennik: ${repWord(r)}` : '');
const repBadge = (r) => (r && r.b !== 'no'
  ? `<span class="tp-rep">${esc(r.b === 'opt' ? (r.nat ? 'Naturalny' : 'Pasuje') : r.b === 'ok' ? `Da radę ${r.v}%` : `Słabo ${r.v}%`)}</span>` : '');
const hitsWord = (n) => (n !== 1 && few(n) ? 'pasują' : 'pasuje');

/**
 * sel: null | loc ({ zone: 'xi'|'bench'|'out', idx?, id? }), zob. tacticsMoves.js.
 * info: id zawodnika z otwartym panelem atrybutów. msg: komunikat po ostatnim ruchu.
 * cards: otwarte karty zawodników [{ id, pinned, slot, extra }] (PC: do dwóch pływających okien; brak: jedna karta z info).
 * wide: szeroki ekran (PC od 1100 px): zwijana siła składu w kolumnie boiska, karta jako pływające okno.
 * strengthOpen: rozwinięta siła składu (tylko wide).
 * rzChips: plakietki rezerw (src/ui/reservesView.js, rzChipFn), rzStrip: pasek rezerw nad ławką (klub bez rezerw: brak).
 */
export function renderTactics({ squad, tactics, sel, benchSize, info = null, msg = '', numbers = null, kit = null, infoExtra = '', rzChips = null, rzStrip = '', cards = null, wide = false, strengthOpen = true, assistant = true }) {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const f = formationById(tactics.formation);
  const check = checkTactics(tactics, squad, { benchSize });
  const selKey = locKey(sel);
  const selId = sel ? playerAt(tactics, sel) : null;
  const selPlayer = selId ? byId.get(selId) : null;
  const inXI = new Set(tactics.xi.filter(Boolean));
  const onBench = new Set(tactics.bench);
  const openCards = (cards ?? (info ? [{ id: info, pinned: false, slot: 0, extra: infoExtra }] : [])).filter((c) => byId.has(c.id));
  const openIds = new Set(openCards.map((c) => c.id));

  // ---------- Zmiennicy po wyborze: wybrane miejsce w XI -> kandydaci na to miejsce;
  // wybrany zawodnik z ławki albo spoza kadry -> miejsca w XI, na których zagra.
  const selSlot = sel?.zone === 'xi' ? f.slots[sel.idx] ?? null : null;
  const repAt = (p, slotIdx = null) => {
    if (selSlot) return p && slotIdx !== sel.idx ? repLevel(p, selSlot) : null;
    if (selPlayer && slotIdx != null) return repLevel(selPlayer, f.slots[slotIdx]);
    return null;
  };
  const tally = { opt: 0, ok: 0, weak: 0 };
  const hits = { xi: 0, bench: 0, out: 0 };
  const count = (r, zone) => { if (r && r.b in tally) { tally[r.b] += 1; if (r.b === 'opt') hits[zone] += 1; } };
  const hitsHtml = (zone) => (hits[zone] ? ` <span class="tp-sec__hits">${hits[zone]} ${hitsWord(hits[zone])}</span>` : '');

  // ---------- Boisko
  const slotsHtml = f.slots.map((s, i) => {
    const loc = { zone: 'xi', idx: i };
    const key = locKey(loc);
    const p = byId.get(tactics.xi[i]);
    const prof = p ? proficiency(p, s.pos, s.side) : 0;
    const isSel = selKey === key;
    const r = repAt(p, i);
    const cls = ['slot-btn', p ? `slot-btn--${band(prof)}` : 'slot-btn--empty', s.pos === 'BR' ? 'slot-btn--gk' : '', isSel ? 'is-sel' : ''].filter(Boolean).join(' ');
    return `<button class="${cls}" style="left:${s.x}%;top:${100 - s.y}%" data-act="tslot" data-loc="${key}" data-drop="${key}" data-handle ${p ? `${dragAttrs(loc, p)} data-pid="${esc(p.id)}"` : ''}${repAttr(r)}
      aria-pressed="${isSel}" aria-label="${esc(s.pos)}: ${p ? esc(p.name) : 'puste miejsce'}${p && prof < 85 ? `, poza pozycją (${prof}%)` : ''}${esc(repAria(r))}">
      ${r && r.b !== 'no' ? `<span class="slot-btn__rep" aria-hidden="true">${r.v}%</span>` : ''}
      <span class="slot-btn__dot">${p ? (numbers?.get(p.id) ?? Math.round(p.ovr)) : '+'}</span>
      <span class="slot-btn__name">${p ? esc(p.last) : esc(s.pos)}</span>
      ${p && tactics.captain === p.id ? '<span class="slot-btn__c" aria-hidden="true">C</span>' : ''}
    </button>`;
  }).join('');

  // ---------- Listy
  const infoBtn = (p) => `<button class="tp-row__i" data-act="tinfo" data-id="${esc(p.id)}" aria-label="Atrybuty: ${esc(p.name)}" aria-expanded="${openIds.has(p.id)}">i</button>`;
  // Uchwyt (kropki i plakietka pozycji): za niego przeciąga się palcem, reszta wiersza przewija listę.
  const handle = (pos, g) => `<span class="tp-handle" data-handle><span class="tp-grip" aria-hidden="true"></span><span class="pos" data-g="${g}">${esc(pos)}</span></span>`;

  const xiRows = f.slots.map((s, i) => {
    const loc = { zone: 'xi', idx: i };
    const key = locKey(loc);
    const p = byId.get(tactics.xi[i]);
    const isSel = selKey === key;
    const r = repAt(p, i);
    count(r, 'xi');
    if (!p) {
      return `<li class="tp-row tp-row--empty ${isSel ? 'is-sel' : ''}" data-drop="${key}"${repAttr(r)}>
        <button class="tp-row__main" data-act="tpick" data-loc="${key}" aria-pressed="${isSel}">
          <span class="tp-handle tp-handle--none"><span class="tp-grip" aria-hidden="true"></span><span class="pos" data-g="${GROUP[s.pos]}">${esc(s.pos)}</span></span>
          <span class="tp-row__name">Puste miejsce${repBadge(r)}</span><b></b>
        </button>
      </li>`;
    }
    const prof = proficiency(p, s.pos, s.side);
    const reason = unavailableReason(p);
    const fit = prof < 100 ? `<small class="tp-fit" data-fit="${band(prof)}">${esc(posText(p))}, ${prof}% na tej pozycji</small>` : '';
    return `<li class="tp-row ${isSel ? 'is-sel' : ''} ${reason ? 'is-off' : ''}" data-drop="${key}" data-pid="${esc(p.id)}"${repAttr(r)}>
      <button class="tp-row__main" data-act="tpick" data-loc="${key}" ${dragAttrs(loc, p)} aria-pressed="${isSel}">
        ${handle(s.pos, GROUP[s.pos])}
        <span class="tp-row__name"><span class="tp-row__nm">${esc(p.name)}</span>${tactics.captain === p.id ? ' <abbr class="tp-c" title="Kapitan">C</abbr>' : ''}${reason ? `<small class="tp-off">${esc(reason)}</small>` : fit}${repBadge(r)}${rzChips ? rzChips(p, { short: true }) : ''}</span>
        ${condHtml(p)}<b class="tp-ovr" title="Ocena ogólna w skali 1-20">${Math.round(p.ovr)}</b>
      </button>
      ${infoBtn(p)}
    </li>`;
  }).join('');

  const row = (p, loc) => {
    const key = locKey(loc);
    const reason = unavailableReason(p);
    const isSel = selKey === key;
    const where = loc.zone;
    const r = repAt(p);
    count(r, where);
    return `<li class="tp-row ${isSel ? 'is-sel' : ''} ${reason ? 'is-off' : ''}" data-drop="${esc(key)}" data-pid="${esc(p.id)}"${repAttr(r)}>
      <button class="tp-row__main" data-act="tpick" data-loc="${esc(key)}" ${dragAttrs(loc, p)} aria-pressed="${isSel}">
        ${handle(posText(p), GROUP[p.pos])}
        <span class="tp-row__name"><span class="tp-row__nm">${esc(p.name)}</span>${reason ? `<small class="tp-off">${esc(reason)}</small>` : ''}${repBadge(r)}${rzChips ? rzChips(p, { short: true }) : ''}</span>
        ${condHtml(p)}<b class="tp-ovr" title="Ocena ogólna w skali 1-20">${Math.round(p.ovr)}</b>
      </button>
      ${infoBtn(p)}
      ${where === 'bench' ? `<button class="tp-row__x" data-act="tunbench" data-id="${esc(p.id)}" aria-label="Usuń ${esc(p.name)} z ławki">×</button>` : ''}
      ${where === 'out' ? (isAvailable(p) ? `<button class="tp-row__x" data-act="tbench" data-id="${esc(p.id)}" aria-label="Dodaj ${esc(p.name)} na ławkę">+</button>` : '<span class="tp-row__x tp-row__x--none" aria-hidden="true"></span>') : ''}
    </li>`;
  };
  const free = Math.max(0, benchSize - tactics.bench.length);
  // Ławka według pozycji (od bramkarza), indeksy miejsc bez zmian (przenoszenie i zamiany działają jak dotąd)
  const bench = tactics.bench.map((id, i) => [byId.get(id), i]).filter(([p]) => p).sort(([a], [b]) => byPosition(a, b))
    .map(([p, i]) => row(p, { zone: 'bench', idx: i })).join('');
  const benchAdd = free ? `<li class="tp-row tp-add" data-drop="benchAdd">
      <button class="tp-row__main" data-act="tpick" data-loc="benchAdd">
        <span class="tp-add__plus" aria-hidden="true">+</span>
        <span class="tp-row__name">Wolne miejsce na ławce<small>${freeText(free)}</small></span>
      </button>
    </li>` : '';
  const out = squad.filter((p) => !inXI.has(p.id) && !onBench.has(p.id))
    .sort((a, b) => Number(isAvailable(b)) - Number(isAvailable(a)) || byPosition(a, b)).map((p) => row(p, { zone: 'out', id: p.id })).join('');

  const repSum = sel && (tally.opt || tally.ok || tally.weak) ? ` Pasuje: ${tally.opt}, da radę: ${tally.ok}, słabo: ${tally.weak}.` : '';
  const status = msg || (selPlayer
    ? `Wybrano: ${selPlayer.name}. Wskaż miejsce, na które ma przejść, albo zawodnika do zamiany.${repSum}`
    : sel?.zone === 'xi' ? `Wybrano puste miejsce (${f.slots[sel.idx]?.pos}). Wskaż zawodnika z listy.${repSum}`
      : 'Przeciągnij zawodnika na inne miejsce albo dotknij dwóch miejsc po kolei. Dwuklik na nazwisku pokazuje atrybuty, prawy przycisk albo przytrzymanie nazwiska: więcej opcji.');

  // ---------- Siła składu (PC: zwijana w kolumnie boiska, błędy składu zawsze widoczne nad zwijaną częścią)
  const z = check.rating.zones;
  const zoneList = [['Bramkarz', z.GK], ['Obrona', z.DEF], ['Pomoc', z.MID], ['Atak', z.ATT]];
  const notesHtml = `${check.errors.length ? `<div class="notice notice--err" role="alert"><b>Skład nie przejdzie przed meczem:</b><ul class="plain">${check.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
        ${check.warnings.length ? `<div class="notice"><ul class="plain">${check.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}`;
  // PC: panel „Siła składu” usunięty (decyzja właściciela Nov 17, 2026), zostają tylko błędy i ostrzeżenia składu.
  // Telefon bez zmian. strengthOpen i zoneList zostają dla telefonu.
  void strengthOpen;
  const strengthHtml = wide
    ? (notesHtml.trim() ? `<div class="tac__strength tac__notes">${notesHtml}</div>` : '')
    : `<div class="tac__strength">
        ${notesHtml}
        <h3>Siła składu</h3>
        <ul class="zones">
          ${zoneList.map(([k, v]) => `<li><span>${k}</span><span class="abar"><i data-b="${v >= 13 ? 'top' : v >= 11 ? 'good' : v >= 8 ? 'mid' : 'low'}" style="width:${Math.max(0, Math.min(100, v * 5))}%"></i></span><b>${Math.round(v)}</b></li>`).join('')}
        </ul>
      </div>`;
  const xiPlayers = tactics.xi.map((id) => byId.get(id)).filter(Boolean);
  const roleSelect = (role, label) => `<label class="role"><span>${label}</span>
    <select data-act="trole" data-role="${role}">${xiPlayers.map((p) => `<option value="${esc(p.id)}" ${tactics[role] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`;
  // Karty zawodników: na PC pływające okna (do dwóch, w kolejności miejsc), na telefonie jedna karta jako arkusz.
  const cardsHtml = openCards.slice().sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
    .map((c) => renderPlayerInfo(byId.get(c.id), tactics, f, c.extra ?? '', { wide, pinned: !!c.pinned, slot: c.slot ?? 0 })).join('');

  return `
  <div class="tac${sel ? ' has-sel' : ''}">
    <div class="tac__form">
      <div class="chips chips--wrap" role="group" aria-label="Formacja">${FORMATIONS.map((x) => `<button class="chip" data-act="tform" data-f="${x.id}" aria-pressed="${x.id === f.id}">${esc(x.name)}</button>`).join('')}</div>
      <p class="hint">${esc(f.nick)}: ${esc(f.note)}</p>
    </div>
    <div class="tac__pitch">
      <div class="pitch2" ${kit ? `style="--kit:${kit.shirt};--kit-ink:${kit.ink};--kit-trim:${kit.trim}"` : ''} role="group" aria-label="Boisko, formacja ${esc(f.name)}">${slotsHtml}</div>
      <p class="tac__msg${msg ? ' is-msg' : ''}" role="status">${esc(status)}</p>
      <div class="tac__actions">
        <button class="btn btn--quiet" data-act="tauto"${assistant ? '' : ' disabled title="W sztabie nie ma asystenta trenera"'}>Poproś asystenta</button>${assistant ? '' : '<p class="hint">Brak asystenta trenera w sztabie (zatrudnisz go w Trening, Sztab).</p>'}
        ${sel ? '<button class="btn btn--quiet" data-act="tcancel">Anuluj wybór</button>' : ''}
      </div>
      ${wide ? strengthHtml : ''}
    </div>
    <div class="tac__lists">
      <p class="tp-legend"><span><i class="tp-fresh" data-b="good" style="--f:80%"></i> świeżość</span><span><span class="mdot" data-m="hi"></span> morale</span><span><b>12</b> ocena ogólna (1-20)</span>${wide ? '<span>Dwuklik albo przycisk „i” otwiera kartę zawodnika</span>' : ''}</p>
      <section class="tp-sec tp-sec--xi" aria-labelledby="tp-h-xi">
        <h3 id="tp-h-xi">Pierwszy skład <span class="muted">${inXI.size} z ${f.slots.length}</span>${hitsHtml('xi')}</h3>
        <ul class="tp-list">${xiRows}</ul>
      </section>
      ${rzStrip && wide ? `<div class="tac__rz">${rzStrip}</div>` : rzStrip}
      <section class="tp-sec tp-sec--bench" aria-labelledby="tp-h-bench">
        <h3 id="tp-h-bench">Ławka rezerwowych <span class="muted">${tactics.bench.length} z ${benchSize}</span>${hitsHtml('bench')}</h3>
        <ul class="tp-list">${bench || (free ? '' : '<li class="mail-empty">Ławka jest pusta.</li>')}${benchAdd}</ul>
      </section>
      <section class="tp-sec tp-out" data-drop="outZone" aria-labelledby="tp-h-out">
        <h3 id="tp-h-out">Poza kadrą meczową${hitsHtml('out')}</h3>
        <p class="tp-dropnote" aria-hidden="true">Upuść tutaj, żeby zdjąć zawodnika z ławki</p>
        <ul class="tp-list">${out || '<li class="mail-empty">Wszyscy są w kadrze meczowej.</li>'}</ul>
      </section>
    </div>
    ${wide ? '' : strengthHtml}
    ${cardsHtml}
  </div>
  <section class="tpanel3 tpanel3--instr" aria-labelledby="tp-h-instr">
  <h3 id="tp-h-instr">Instrukcje</h3>
  <div class="instr">
    ${INSTRUCTIONS.map((ins) => {
      const cur = tactics.instructions[ins.id];
      const opt = ins.options.find((o) => o.id === cur);
      return `<div class="instr__row"><span class="instr__label">${esc(ins.label)}</span>
        <div class="seg2" role="radiogroup" aria-label="${esc(ins.label)}">${ins.options.map((o) => `<button data-act="tinstr" data-i="${ins.id}" data-v="${o.id}" aria-pressed="${o.id === cur}">${esc(o.label)}</button>`).join('')}</div>
        <p class="hint">${esc(opt?.text ?? '')}</p></div>`;
    }).join('')}
  </div>
  </section>
  <section class="tpanel3 tpanel3--roles" aria-labelledby="tp-h-roles">
  <h3 id="tp-h-roles">Kapitan i stałe fragmenty</h3>
  <div class="roles">${roleSelect('captain', 'Kapitan')}${roleSelect('penalty', 'Rzuty karne')}${roleSelect('freeKick', 'Rzuty wolne')}${roleSelect('corner', 'Rzuty rożne')}</div>
  </section>`;
}

/**
 * Panel atrybutów. Renderowany jako otwarty <dialog>: na szerokim ekranie (wide) pływające okno niemodalne
 * z paskiem (przeciąganie, przypięcie, zamknięcie); na węższych ekranach app.js przełącza go w okno modalne
 * (arkusz od dołu na telefonie). Wygląd karty: src/ui/playerCard.js (ten sam w oknie zmian w meczu).
 */
function renderPlayerInfo(p, tactics, f, extra = '', { wide = false, pinned = false, slot: cardSlot = 0 } = {}) {
  const slotIdx = tactics.xi.indexOf(p.id);
  const benchIdx = tactics.bench.indexOf(p.id);
  const slot = slotIdx >= 0 ? f.slots[slotIdx] : null;
  const prof = slot ? proficiency(p, slot.pos, slot.side) : null;
  const where = slot ? `Pierwszy skład: ${slot.pos}, ${prof}% na tej pozycji` : benchIdx >= 0 ? 'Ławka rezerwowych' : 'Poza kadrą meczową';
  const health = p.injuryDays > 0 ? `Kontuzja, ok. ${p.injuryDays} dni`
    : p.suspended > 0 ? `Zawieszony, ${p.suspended} ${matchesWord(p.suspended)}`
      : p.callUp ? 'Na zgrupowaniu reprezentacji' : p.loanBlock ? 'Nie zagra z klubem macierzystym (umowa wypożyczenia)' : p.teamBlock ? 'Gra w drugiej drużynie klubu (rezerwy)' : 'Do dyspozycji';
  const id = esc(p.id);
  return renderPlayerCard(p, {
    wide, slot: cardSlot, pinned: !!pinned, extra,
    closeAttrs: `data-act="tinfoclose" data-id="${id}"`, pinAttrs: `data-act="tcardpin" data-id="${id}"`,
    facts: [
      cardFact('Gdzie', esc(where)),
      cardFact('Stan', esc(health), !!(p.injuryDays > 0 || p.suspended > 0 || p.callUp || p.loanBlock)),
      cardFact('Świeżość', barFactHtml(p.fresh ?? 95)),
      cardFact('Ostrość', `${Math.round(p.sharp ?? 70)}%`),
      cardFact('Morale', esc(moraleLabel(p.morale ?? 12))),
    ],
  });
}
