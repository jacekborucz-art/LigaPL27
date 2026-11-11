// Menu kontekstowe zawodnika (prawy przycisk, przytrzymanie palcem, klawisz menu albo Shift+F10).
// Zestaw opcji zależy od widoku i od tego, czyj to zawodnik. Czyste funkcje bez DOM (tests/contextMenu.test.mjs).
// Opcje nie mają własnej logiki gry: run.steps to lista akcji { act, ...dataset }, które app.js wykonuje
// tak samo jak kliknięcia przycisków z data-act (np. tf-renew, tt-talk, tr-focus, tbench, tmove).
//
// Model menu: { title, pos, meta, note, items }. Pozycja: { label, hint?, disabled?: powód, danger?, primary?,
// checked? (opcja wyboru), run?: { steps, focus?: selektor po akcji, toast?: true (komunikat akcji) | tekst },
// items?: podmenu } albo { sep: true } albo { heading: tekst }.
import { ATTRS, ATTR_GROUPS } from '../data/attributes.js';
import { formationById } from '../data/formations.js';
import { clubById } from '../data/clubs_pl.js';
import { DOMESTIC } from '../config/calendar2026.js';
import { proficiency, POSITIONS } from '../engine/positions.js';
import { GROUP, isAvailable } from '../career/squad.js';
import { RENEW_WINDOW_MONTHS } from '../career/negotiation.js';
import { canSign, KEEP_MAX } from '../career/squadLimit.js';
import { limitStatus } from '../career/squadLimitSystem.js';
import { askingPrice, notForSale, playerWillingness, inWindow, releaseCost, fmtZl } from '../career/transfers.js';
import { PLAYER_TALKS, TALKS_PER_WEEK, talksThisWeek, talkSuggestions } from '../career/teamTalks.js';
import { PROGRAMS, MODES } from '../training/config.js';
import { locKey, playerAt, resolveMove, resolveTap, sameLoc } from './tacticsMoves.js';
import { monthsLeft, compareText } from './transfersView.js';
import { fmtDate } from './dom.js';

export const MENU_VIEWS = ['squad', 'profile', 'tactics', 'talks', 'transfers', 'training', 'dashboard'];
const ROLES = [['captain', 'Kapitan'], ['penalty', 'Rzuty karne'], ['freeKick', 'Rzuty wolne'], ['corner', 'Rzuty rożne']];

// ------------------------------------------------------------ Budowanie pozycji
const SEP = { sep: true };
function item(label, run, { hint = null, disabled = null, danger = false, primary = false, checked } = {}) {
  return { label, hint, disabled: disabled || null, danger, primary, ...(checked === undefined ? {} : { checked }), run };
}
function sub(label, list, { hint = null, disabled = null } = {}) {
  const items = tidy(list);
  return { label, hint, disabled: disabled || (items.length ? null : 'Brak opcji'), items };
}
/** Usuwa puste pozycje i zbędne separatory (na początku, na końcu, podwójne). */
function tidy(list) {
  const out = [];
  for (const x of list.filter(Boolean)) {
    if (x.sep && (!out.length || out[out.length - 1].sep)) continue;
    out.push(x);
  }
  while (out.length && out[out.length - 1].sep) out.pop();
  return out;
}

const q = (v) => String(v).replace(/["\\]/g, '\\$&');
const shortName = (p) => p.last ?? p.name;

// ------------------------------------------------------------ Nawigacja (sekwencje istniejących akcji)
export const NAV = {
  profile: (id) => ({ steps: [{ act: 'tab', tab: 'kadra' }, { act: 'tsub', s: 'players' }, { act: 'player', id }], focus: '[data-act="squadback"]' }),
  // Profil przewinięty do statystyk (src/ui/playerStatsView.js, nagłówek #pst-h)
  stats: (id) => ({ steps: [{ act: 'tab', tab: 'kadra' }, { act: 'tsub', s: 'players' }, { act: 'player', id }], focus: '#pst-h' }),
  lineup: (loc) => ({ steps: [{ act: 'tab', tab: 'kadra' }, { act: 'tsub', s: 'tactics' }, { act: 'tpick', loc }], focus: `[data-act="tpick"][data-loc="${q(loc)}"]` }),
  training: (id) => ({ steps: [{ act: 'tab', tab: 'trening' }, { act: 'tr-tab', tab: 'zawodnicy' }, { act: 'tr-player', id }], focus: '[data-act="tr-pback"]' }),
  report: () => ({ steps: [{ act: 'tab', tab: 'trening' }, { act: 'tr-tab', tab: 'rozwoj' }], focus: '[data-act="tr-tab"][data-tab="rozwoj"]' }),
  card: (id, own) => ({ steps: [{ act: 'tab', tab: 'transfery', sub: own ? 'kontrakty' : 'rynek' }, { act: 'tf-open', id }], focus: '[data-act="tf-close"]' }),
};
const withSteps = (nav, extra, more = {}) => ({ ...nav, steps: [...nav.steps, ...extra], ...more });

// ------------------------------------------------------------ Stan zawodnika
function offText(p) {
  if (p.injuryDays > 0) return `Kontuzja, ${p.injuryDays} ${p.injuryDays === 1 ? 'dzień' : 'dni'}`;
  if (p.suspended > 0) return 'Zawieszony';
  if (p.callUp) return 'Zgrupowanie reprezentacji';
  if (p.onLoanOut) return 'Wypożyczony do innego klubu';
  return isAvailable(p) ? null : 'Niedostępny';
}

function locOf(t, pid) {
  const i = t.xi.indexOf(pid);
  if (i >= 0) return { zone: 'xi', idx: i };
  const j = t.bench.indexOf(pid);
  if (j >= 0) return { zone: 'bench', idx: j };
  return { zone: 'out', id: pid };
}

function closedWindowText(date) {
  const next = DOMESTIC.transferWindows.filter((w) => w.from > date).sort((a, b) => a.from.localeCompare(b.from))[0];
  return next ? `Okno transferowe zamknięte, otwarcie ${fmtDate(next.from)}` : 'Okno transferowe zamknięte';
}

function renewFrom(until) {
  const [y, m] = until.split('-').map(Number);
  const k = y * 12 + (m - 1) - RENEW_WINDOW_MONTHS;
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-01`;
}

// ------------------------------------------------------------ Skład i taktyka
/** Opcje składu meczowego. L: { tactics, byId, benchSize }. inTactics: menu otwarte na ekranie składu. */
function lineupItems(p, L, { inTactics = false, ui = {} } = {}) {
  const t = L.tactics;
  const lp = L.byId.get(p.id);
  if (!t || !lp) return [];
  const ctx = { byId: L.byId, benchSize: L.benchSize };
  const f = formationById(t.formation);
  const src = locOf(t, p.id);
  const off = offText(lp);
  const toast = !inTactics;
  const name = (id) => { const x = L.byId.get(id); return x ? shortName(x) : 'zawodnik'; };
  const slotName = (i) => `${f.slots[i].pos}${f.slots[i].side ? ` ${f.slots[i].side}` : ''}`;
  const move = (dst, label, hint) => {
    const r = resolveMove(t, src, dst, ctx);
    return item(label, { steps: [{ act: 'tmove', src: locKey(src), dst: locKey(dst) }], toast }, { hint, disabled: r.ok ? null : (r.reason || 'Ten ruch nic nie zmienia') });
  };
  // Bramkarz tylko na bramkę, zawodnik z pola tylko na miejsca w polu
  const slots = (skip) => f.slots.map((s, i) => ({ i, prof: proficiency(lp, s.pos, s.side) }))
    .filter((x) => x.i !== skip && (f.slots[x.i].pos === 'BR') === (lp.pos === 'BR'))
    .sort((a, b) => b.prof - a.prof || a.i - b.i)
    .map(({ i, prof }) => move({ zone: 'xi', idx: i }, `${slotName(i)}: ${t.xi[i] ? name(t.xi[i]) : 'wolne miejsce'}`, `${prof}% na tej pozycji`));
  const benchList = (hintFor) => t.bench.map((id, j) => {
    const b = L.byId.get(id);
    return b ? move({ zone: 'bench', idx: j }, `${b.name} (${b.pos})`, hintFor(b)) : null;
  }).filter(Boolean);

  const out = [];
  if (src.zone === 'xi') {
    const s = f.slots[src.idx];
    out.push(sub('Przesuń na inną pozycję', slots(src.idx), { hint: `Teraz: ${slotName(src.idx)}, zamiana miejscami` }));
    out.push(sub('Zamień z rezerwowym', benchList((b) => `${offText(b) ?? `${proficiency(b, s.pos, s.side)}% na pozycji ${slotName(src.idx)}`}`), { disabled: t.bench.length ? null : 'Ławka jest pusta' }));
  } else {
    out.push(sub('Do pierwszego składu', slots(-1), { disabled: off, hint: 'Wybierz pozycję' }));
    if (src.zone === 'bench') out.push(item('Poza kadrę meczową', { steps: [{ act: 'tunbench', id: p.id }], toast }));
    else if (t.bench.length < L.benchSize) out.push(item('Na ławkę rezerwowych', { steps: [{ act: 'tbench', id: p.id }], toast }, { disabled: off, hint: off ? null : `Ławka: ${t.bench.length} z ${L.benchSize}` }));
    else out.push(sub('Na ławkę zamiast…', benchList((b) => (offText(b) ?? `OVR ${Math.round(b.ovr)}`)), { disabled: off, hint: `Ławka pełna (${L.benchSize} z ${L.benchSize})` }));
  }

  if (inTactics) {
    const sel = ui.tSel ?? null;
    const loc = locKey(src);
    if (sel && sameLoc(sel, src)) out.push(item('Anuluj wybór', { steps: [{ act: 'tcancel' }] }));
    else if (sel) {
      const r = resolveTap(t, sel, src, ctx);
      const selId = playerAt(t, sel);
      const label = selId ? `Zamień z: ${name(selId)}` : `Wstaw na wybrane miejsce (${sel.zone === 'xi' ? slotName(sel.idx) : 'ławka'})`;
      out.push(item(label, { steps: [{ act: 'tpick', loc }] }, { primary: true, disabled: r.ok ? null : (r.reason || 'Ten ruch nic nie zmienia') }));
    } else out.push(item('Zamień z…', { steps: [{ act: 'tpick', loc }] }, { primary: true, hint: 'Potem wskaż drugiego zawodnika albo miejsce' }));

    const roles = ROLES.map(([r, l]) => item(l, { steps: [{ act: 'trole', role: r, id: p.id }], toast: `${p.name}: ${l.toLowerCase()}.` }, {
      checked: t[r] === p.id, hint: t[r] && t[r] !== p.id ? `Teraz: ${name(t[r])}` : null,
    }));
    out.push(sub('Kapitan i stałe fragmenty', roles, { disabled: src.zone === 'xi' ? null : 'Tylko zawodnik z pierwszego składu' }));
  }
  return out;
}

// ------------------------------------------------------------ Rozmowy
function talkMenu(game, p, label = 'Rozmowa indywidualna') {
  const left = TALKS_PER_WEEK - talksThisWeek(game);
  const why = new Map();
  for (const [k, text] of talkSuggestions(game).find((x) => x.p.id === p.id)?.reasons ?? []) if (!why.has(k)) why.set(k, text);
  const items = Object.entries(PLAYER_TALKS).map(([k, t]) => item(t.label, { steps: [{ act: 'tt-talk', id: p.id, kind: k }], toast: true }, {
    hint: why.has(k) ? `Sugestia asystenta: ${why.get(k).toLowerCase()}` : null,
  }));
  return sub(label, items, {
    disabled: left <= 0 ? `Limit rozmów w tym tygodniu (${TALKS_PER_WEEK} z ${TALKS_PER_WEEK})` : null,
    hint: left > 0 ? `Pozostało: ${left} z ${TALKS_PER_WEEK} w tym tygodniu` : null,
  });
}

// ------------------------------------------------------------ Trening indywidualny
function focusItems(p) {
  const t = p.training;
  const gk = p.pos === 'BR';
  const who = shortName(p);
  const groups = Object.entries(ATTR_GROUPS).filter(([k]) => gk || k !== 'gk');
  return [...groups, ['', 'Bez akcentu']].map(([k, v]) => item(v, { steps: [{ act: 'tr-focus', id: p.id, v: k }], toast: `${who}: ${k ? `akcent ${v.toLowerCase()}` : 'bez akcentu'}.` }, { checked: (t.focus ?? '') === k }));
}

function modeItems(p) {
  const who = shortName(p);
  return Object.entries(MODES).map(([k, m]) => item(m.name, { steps: [{ act: 'tr-mode', id: p.id, v: k }], toast: `${who}: ${m.name.toLowerCase()}.` }, { checked: (p.training.mode ?? 'normal') === k }));
}

function posItems(p) {
  const t = p.training;
  const who = shortName(p);
  const list = POSITIONS.filter((x) => x !== 'BR' && x !== p.pos).map((x) => {
    const prof = Math.round(proficiency(p, x));
    return item(x, { steps: [{ act: 'tr-pos', id: p.id, v: x }], toast: `${who}: nauka pozycji ${x}.` }, { checked: t.pos === x, hint: `Teraz ${prof}%`, disabled: prof >= 90 ? `Gra tu już na ${prof}%` : null });
  });
  return [...list, item('Bez nauki', { steps: [{ act: 'tr-pos', id: p.id, v: '' }], toast: `${who}: bez nauki pozycji.` }, { checked: !t.pos })];
}

function progItems(p) {
  const t = p.training;
  const who = shortName(p);
  return [
    ...Object.entries(PROGRAMS).filter(([, v]) => !v.maxAge || p.age <= v.maxAge)
      .map(([k, v]) => item(v.name, { steps: [{ act: 'tr-prog', id: p.id, v: k }], toast: `${who}: ${v.name.toLowerCase()}.` }, { checked: t.prog === k })),
    item('Bez programu', { steps: [{ act: 'tr-prog', id: p.id, v: '' }], toast: `${who}: bez programu.` }, { checked: !t.prog }),
  ];
}

/** Opcje treningu indywidualnego. inEditor: otwarty edytor tego zawodnika (bez „Ustawienia treningu”). */
function trainingItems(p, { inEditor = false } = {}) {
  if (!p.training) return [item('Trening indywidualny', null, { disabled: 'Brak danych treningu' })];
  const t = p.training;
  const cur = t.focus ? (ATTR_GROUPS[t.focus] ?? ATTRS[t.focus]?.name ?? t.focus) : null;
  return [
    sub('Akcent indywidualny', focusItems(p), { hint: cur ? `Teraz: ${cur}` : 'Teraz: brak' }),
    sub('Obciążenie', modeItems(p), { hint: `Teraz: ${(MODES[t.mode ?? 'normal'] ?? MODES.normal).name.toLowerCase()}` }),
    p.pos === 'BR' ? item('Nauka pozycji', null, { disabled: 'Bramkarz nie uczy się gry w polu' })
      : sub('Nauka pozycji', posItems(p), { hint: t.pos ? `Teraz: ${t.pos}` : 'Teraz: brak' }),
    sub('Program', progItems(p), { hint: t.prog ? `Teraz: ${PROGRAMS[t.prog]?.name ?? t.prog}` : null }),
    inEditor ? null : item('Ustawienia treningu', NAV.training(p.id), { hint: 'Akcent na atrybut, ACWR, historia OVR' }),
  ].filter(Boolean);
}

// ------------------------------------------------------------ Kontrakt
function contractItems(game, p, { view, ui = {} } = {}) {
  const loanFrom = p.loan ? `Wypożyczony z ${clubById(p.loan.from)?.name ?? 'innego klubu'}` : null;
  const items = [];
  const until = p.contract?.until;
  const ml = monthsLeft(game, p);
  const renewSteps = { steps: [{ act: 'tab', tab: 'transfery', sub: 'kontrakty' }, { act: 'tf-renew', id: p.id }] };
  items.push(item('Przedłuż kontrakt', renewSteps, {
    hint: until ? `Kontrakt do ${fmtDate(until)}` : null,
    disabled: loanFrom ?? (until && ml > RENEW_WINDOW_MONTHS ? `Rozmowy możliwe od ${fmtDate(renewFrom(until))}` : null),
  }));
  const listed = game.market?.userListed?.[p.id];
  const cardOpen = view === 'transfers' && ui.tfPlayer === p.id;
  if (listed) items.push(item('Zdejmij z listy transferowej', { steps: [{ act: 'tf-unlist', id: p.id }], toast: !cardOpen }, { hint: `Na liście za ${fmtZl(listed)}` }));
  else {
    const price = Math.round((p.value ?? 0) * 1.2 / 10000) * 10000;
    items.push(item('Wystaw na listę transferową', { steps: [{ act: 'tf-list-own', id: p.id, price }], toast: !cardOpen }, { hint: loanFrom ? null : `Za ${fmtZl(price)}, cenę zmienisz w karcie`, disabled: loanFrom }));
  }
  const L = limitStatus(game);
  if (L.case) {
    const kept = L.case.keep.includes(p.id);
    const target = L.targets.some((x) => x.id === p.id);
    if (kept || target) {
      items.push(item(kept ? 'Zdejmij osłonę przed zarządem' : 'Osłoń przed decyzją zarządu', { steps: [{ act: 'tf-keep', id: p.id }], toast: true }, {
        hint: `Osłonięci: ${L.case.keep.length} z ${KEEP_MAX}, kadra ${L.counted}/${L.soft}`,
        disabled: !kept && L.case.keep.length >= KEEP_MAX ? `Osłonięci już ${KEEP_MAX} z ${KEEP_MAX}` : null,
      }));
    }
  }
  items.push(item('Rozwiąż kontrakt…', withSteps(NAV.card(p.id, true), [{ act: 'tf-release', id: p.id }], { focus: '[data-act="tf-release-ok"]' }), {
    danger: true, disabled: loanFrom, hint: loanFrom ? null : `Koszt ok. ${fmtZl(releaseCost(game, p))}, potwierdzisz w karcie`,
  }));
  return items;
}

// ------------------------------------------------------------ Zawodnik innego klubu (rynek)
function otherItems(game, p, { view, ui = {} } = {}) {
  const cardOpen = view === 'transfers' && ui.tfPlayer === p.id;
  const card = NAV.card(p.id, false);
  const items = [];
  if (!cardOpen) items.push(item('Karta zawodnika', card, { primary: true, hint: 'Cena, kontrakt, nastawienie' }));
  const cap = canSign(game);
  const capTxt = cap.ok ? null : `Limit kadry ${cap.count.counted}/${cap.count.hard}`;
  const refuse = playerWillingness(game, p).verdict === 'odmowa' ? 'Nie chce przejść do twojego klubu' : null;
  const winTxt = inWindow(game.date) ? null : closedWindowText(game.date);
  if (!p.clubId) {
    items.push(item('Rozmawiaj o kontrakcie', withSteps(card, [{ act: 'tf-negotiate', id: p.id }], { focus: null }), {
      hint: `Wolny zawodnik, oczekuje ok. ${fmtZl(p.askWage ?? 0)} tygodniowo`, disabled: capTxt ?? refuse,
    }));
    return items;
  }
  const talk = game.market?.talks?.[p.id];
  const nfs = notForSale(game, p) && !p.contract?.clause;
  if (talk?.accepted) {
    items.push(item('Rozmawiaj z zawodnikiem', withSteps(card, [{ act: 'tf-negotiate', id: p.id }], { focus: null }), {
      hint: `Klub przyjął ofertę ${fmtZl(talk.accepted)}`, disabled: winTxt ?? capTxt ?? refuse,
    }));
  } else {
    items.push(item('Złóż ofertę…', { ...card, focus: '#tfFee' }, {
      hint: nfs ? null : `Cena klubu ok. ${fmtZl(askingPrice(game, p))}`,
      disabled: nfs ? 'Klub go nie sprzedaje (czołowy zawodnik)' : winTxt ?? capTxt ?? refuse,
    }));
  }
  const loanable = game.market?.listed?.[p.id]?.kind === 'loan' || (p.age <= 21 && !nfs);
  items.push(item('Wypożycz…', { ...card, focus: '#tfShare' }, {
    hint: loanable ? 'Do końca sezonu, część pensji' : null,
    disabled: loanable ? (winTxt ?? capTxt ?? refuse) : 'Klub go nie wypożycza (tylko do 21 lat albo z listy)',
  }));
  return items;
}

// ------------------------------------------------------------ Nagłówek
function header(game, p, own, L) {
  const club = p.clubId ? clubById(p.clubId)?.name : null;
  const meta = [`${p.age} lat`, `OVR ${Math.round(p.ovr)}`, own ? null : (club ?? 'wolny zawodnik')].filter(Boolean).join(', ');
  let note = null;
  if (own) {
    const lp = L?.byId?.get(p.id) ?? p;
    const off = offText(lp);
    const t = L?.tactics;
    const where = t && L.byId?.has(p.id) ? (() => {
      const loc = locOf(t, p.id);
      if (loc.zone === 'xi') { const s = formationById(t.formation).slots[loc.idx]; return `Pierwszy skład (${s.pos}${s.side ? ` ${s.side}` : ''})`; }
      return loc.zone === 'bench' ? 'Ławka rezerwowych' : 'Poza kadrą meczową';
    })() : null;
    const listed = game.market?.userListed?.[p.id];
    note = [off, where, listed ? `na liście za ${fmtZl(listed)}` : null, p.loan ? 'wypożyczony do klubu' : null].filter(Boolean).join(', ') || null;
  } else note = compareText(game, p);
  return { title: p.name, pos: p.pos, group: GROUP[p.pos] ?? 'MID', meta, note };
}

// ------------------------------------------------------------ Wejście
/**
 * Menu zawodnika pid w widoku view.
 * opts: { view, ui: stan ekranu (tSel, tfPlayer, trPlayer, trTab...), why: powód z wiersza pulpitu
 * ('inj' | 'susp' | 'call' | 'contract' | 'move'), lineup: { tactics, byId, benchSize } }.
 * Zwraca { title, pos, meta, note, items } albo null (nieznany zawodnik lub widok).
 */
export function playerMenu(game, pid, { view, ui = {}, why = null, lineup = null } = {}) {
  const p = game?.world?.players?.[pid];
  if (!p || !MENU_VIEWS.includes(view)) return null;
  const own = p.clubId === game.clubId;
  const L = lineup?.tactics && lineup?.byId ? lineup : null;
  const head = header(game, p, own, L);
  if (!own) return { ...head, items: tidy(otherItems(game, p, { view, ui })) };

  const academy = !!game.world.clubs?.[game.clubId]?.academy?.includes(p.id);
  const profile = item('Profil zawodnika', NAV.profile(p.id), { primary: view === 'squad', hint: 'Atrybuty, stan, kontrakt, charakter' });
  const stats = item('Statystyki i historia', NAV.stats(p.id), { hint: 'Mecze, gole, asysty i oceny w rozgrywkach, kluby' });
  if (academy) {
    return { ...head, note: 'Akademia', items: tidy([view === 'profile' ? null : profile, SEP, ...trainingItems(p, { inEditor: view === 'training' && ui.trPlayer === p.id })]) };
  }
  const inLineup = !!L?.byId?.has(p.id);
  const lineupNav = inLineup ? item('Pokaż w składzie', NAV.lineup(locKey(locOf(L.tactics, p.id))), { hint: 'Skład i taktyka, zawodnik wybrany' }) : null;
  const contract = contractItems(game, p, { view, ui });
  const contractSub = sub('Kontrakt i transfer', contract);
  const training = sub('Trening indywidualny', trainingItems(p));
  const talk = talkMenu(game, p);

  let items;
  switch (view) {
    case 'tactics':
      items = [
        ...lineupItems(p, L ?? { tactics: null, byId: new Map() }, { inTactics: true, ui }),
        ui.tInfo === p.id ? null : item('Atrybuty', { steps: [{ act: 'tinfo', id: p.id }] }, { hint: 'Panel atrybutów i stanu' }),
        SEP, profile, talk, training, contractSub,
      ];
      break;
    case 'talks':
      items = [talkMenu(game, p, 'Porozmawiaj'), SEP, profile, training, lineupNav, contractSub];
      break;
    case 'training': {
      const inEditor = ui.trPlayer === p.id;
      const tr = trainingItems(p, { inEditor }).map((x) => (x.label === 'Ustawienia treningu' ? { ...x, primary: true } : x));
      items = [...tr, ui.trTab === 'rozwoj' ? null : item('Raport rozwoju', NAV.report(), { hint: 'Kto rośnie, a kto spada' }), SEP, profile, talk, contractSub];
      break;
    }
    case 'transfers': {
      const cardOpen = ui.tfPlayer === p.id;
      items = [cardOpen ? null : item('Karta transferowa', NAV.card(p.id, true), { primary: true, hint: 'Kontrakt, lista, rozwiązanie' }), profile, SEP, ...contract, SEP, talk, training];
      break;
    }
    case 'dashboard': {
      const lp = L?.byId?.get(p.id) ?? p;
      const ret = p.training ? item('Program powrotu po kontuzji', { steps: [{ act: 'tr-prog', id: p.id, v: 'powrot' }], toast: `${p.name}: program powrotu po kontuzji.` }, {
        primary: true, disabled: p.training.prog === 'powrot' ? 'Już w programie powrotu' : null, hint: '10 dni stopniowego powrotu, mniejsze ryzyko urazu',
      }) : null;
      const future = item('Rozmowa o przyszłości', { steps: [{ act: 'tt-talk', id: p.id, kind: 'future' }], toast: true }, {
        disabled: TALKS_PER_WEEK - talksThisWeek(game) <= 0 ? `Limit rozmów w tym tygodniu (${TALKS_PER_WEEK} z ${TALKS_PER_WEEK})` : null,
      });
      if (why === 'inj' || (!why && lp.injuryDays > 0)) items = [ret, profile, training, lineupNav, SEP, talk];
      else if (why === 'susp' || why === 'call') items = [lineupNav && { ...lineupNav, primary: true, hint: 'Znajdź zastępcę na najbliższy mecz' }, profile, SEP, talk];
      else if (why === 'contract') items = [{ ...contract[0], primary: true }, future, SEP, profile, ...contract.slice(1)];
      else items = [profile, stats, lineupNav, talk, training, contractSub];
      break;
    }
    case 'profile':
      items = [stats, lineupNav, inLineup ? sub('Skład meczowy', lineupItems(p, L)) : null, talk, training, SEP, ...contract];
      break;
    default: // squad
      items = [profile, stats, inLineup ? sub('Skład meczowy', [...lineupItems(p, L), SEP, lineupNav]) : null, talk, training, SEP, ...contract];
  }
  return { ...head, items: tidy(items) };
}

/** Płaska lista pozycji z podmenu (do testów i wyszukiwania): [{ path, ...pozycja }]. */
export function flattenMenu(items, path = []) {
  return items.flatMap((x) => (x.sep || x.heading ? [] : [{ ...x, path: [...path, x.label] }, ...(x.items ? flattenMenu(x.items, [...path, x.label]) : [])]));
}
