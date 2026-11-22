// Trening > Sztab: Mój sztab, Rynek sztabu, Oferty w toku (projekt ekranu: docs/sztab.md, logika: src/career/staffMarket.js).
// Widok czyta tylko API rynku sztabu (bez ukrytych liczb: użyteczność oferty, próg, los). Kliknięcia: data-act „st-*”
// (handleStaffAction, wołane z dispatchAct w src/app.js); pola INPUT i SELECT: data-st-field w listenerze „change”
// (handleStaffField). Stan ekranu w ui (state aplikacji): trStaff, trStaffPerson, trStaffAsk, trStaffF, trStaffSort,
// trStaffPage, trStaffOffer. Osoba bez klubu (lista wolnych) i osoba z innego klubu (podbieranie) obsłużone osobno.

import { esc, fmtDate } from './dom.js';
import { crestHtml } from './crest.js';
import { formatZl } from '../career/negotiation.js';
import { clubById } from '../data/clubs_pl.js';
import { NAT_NAMES } from '../data/names.js';
import { clamp } from '../core/rng.js';
import { daysBetween } from '../training/state.js';
import { staffLabel, roleAttrKeys } from '../training/staff.js';
import { ROLE_ATTRS, DIRECTOR_ROLE, staffCap, isCappedRole, STAFF_EFF } from '../training/config.js';
import { hintHalfWidth, sieStep, DIR } from '../career/director.js';
import {
  STAFF_MARKET as K, STAFF_ROLE_ORDER, staffSummary, staffBudget, budgetRoomFor, listFreeStaff, listClubStaff, seenQuality,
  expectedWage, offerHint, clubAppeal, makeOffer, checkOffer, pendingOffers, fireStaff, renewStaff, canRenew, combineQ,
  contractUntil, rosterOf, directorOf, helperShare, tooWeakHelper,
} from '../career/staffMarket.js';

export const isStaffAction = (act) => typeof act === 'string' && act.startsWith('st-');

const SUBS = ['moj', 'rynek', 'oferty'];
const PAGE = 50;
const TIP_KEY = 'ligapl27.staffTip';
// Rola w bierniku („Dodaj asystenta”) i krótka nazwa w tabeli
const ROLE_ACC = { asystent: 'asystenta', fizyczny: 'trenera przygotowania fizycznego', bramkarze: 'trenera bramkarzy', mlodziez: 'trenera młodzieży', analityk: 'analityka', fizjoterapeuta: 'fizjoterapeutę', skaut: 'skauta', kierownik: 'kierownika drużyny', dyrektor: 'dyrektora sportowego' };
const ROLE_SHORT = { asystent: 'asystent', fizyczny: 'trener fizyczny', bramkarze: 'trener bramkarzy', mlodziez: 'trener młodzieży', analityk: 'analityk', fizjoterapeuta: 'fizjoterapeuta', skaut: 'skaut', kierownik: 'kierownik', dyrektor: 'dyrektor sportowy' };
const ROLE_PLURAL = { asystent: 'asystenci', fizyczny: 'przygotowanie fizyczne', bramkarze: 'bramkarze', mlodziez: 'młodzież', analityk: 'analitycy', fizjoterapeuta: 'fizjoterapeuci', skaut: 'skauci', kierownik: 'kierownik', dyrektor: 'dyrektor sportowy' };
/** Role na rynku i w filtrach: sztab i dyrektor sportowy (osobny slot poza limitem osób, docs/dyrektor-sportowy.md). */
const MARKET_ROLES = [...STAFF_ROLE_ORDER, DIRECTOR_ROLE];
const isDir = (role) => role === DIRECTOR_ROLE;

const num = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
// Jakość i atrybuty w liczbach całkowitych (skala roli: 1-12, fizjoterapeuta i dyrektor 1-20)
const qTxt = (q) => String(Math.round(q));
/** Kwota w tysiącach: „17,5 tys. zł”. */
const kzl = (v) => `${(Math.round(v / 100) / 10).toLocaleString('pl-PL')} tys. zł`;
const kNum = (v) => (Math.round(v / 100) / 10).toLocaleString('pl-PL');
// Kolor jakości na skali roli: 1-12 od 10 dobry, od 6 średni (dawne 14 i 8 na skali 1-20)
const tone = (q, role = null) => (isCappedRole(role ?? 'asystent') ? (q >= 10 ? 'good' : q >= 6 ? 'info' : 'warn') : (q >= 14 ? 'good' : q >= 8 ? 'info' : 'warn'));
const natName = (nat) => NAT_NAMES[nat] ?? nat ?? '';
const clubName = (id) => clubById(id)?.name ?? id ?? '';
const crest = (id, size = 20) => { const c = clubById(id); return c ? crestHtml(c, { size }) : ''; };
const dayWord = (n) => (n === 1 ? 'dzień' : 'dni');
const monthWord = (n) => (n === 1 ? 'miesiąc' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'miesiące' : 'miesięcy');
const wagesWord = (n) => (n === 1 ? 'pensja' : n >= 2 && n <= 4 ? 'pensje' : 'pensji');
const yearsTxt = (n) => (n === 0 ? 'do końca sezonu' : n === 1 ? '1 rok' : `${n} lata`);
const pct = (v, max) => clamp(max > 0 ? (v / max) * 100 : 0, 0, 100).toFixed(1);
const nextRefresh = (date) => (+date.slice(5, 7) >= 7 ? `${+date.slice(0, 4) + 1}-01-01` : `${date.slice(0, 4)}-07-01`);
/** Jakość widziana (precyzja asystenta): liczba, przedział albo słowo. */
const seenTxt = (q) => (q.prec === 'exact' ? String(q.lo) : q.prec === 'approx' ? `${q.lo}-${q.hi}` : q.label.toLowerCase());
const wageRange = (w) => `${kNum(w.lo)}-${kNum(w.hi)} tys. zł`;
const monthsLeftOf = (date, until) => {
  if (!until || until <= date) return 0;
  const [y1, m1, d1] = date.split('-').map(Number); const [y2, m2, d2] = until.split('-').map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
};

function readTip() { try { return globalThis.localStorage?.getItem(TIP_KEY) === '1'; } catch { return false; } }
function writeTip() { try { globalThis.localStorage?.setItem(TIP_KEY, '1'); } catch { /* bez pamięci: podpowiedź wróci */ } }
const wide = (q) => { try { return !!globalThis.matchMedia?.(q).matches; } catch { return false; } };

// ------------------------------------------------------------ Filtry i stan
const defaultFilters = () => ({ role: '', nat: '', qmin: '', qmax: '', wmax: '', noOffers: false, poach: false });
const filtersOf = (ui) => ({ ...defaultFilters(), ...(ui.trStaffF ?? {}) });
const activeFilters = (f) => ['role', 'nat', 'qmin', 'qmax', 'wmax'].filter((k) => f[k] !== '' && f[k] != null).length + (f.noOffers ? 1 : 0) + (f.poach ? 1 : 0);

/** Wiersze rynku po filtrach (wolni, opcjonalnie pracujący w innych klubach) i sortowaniu. */
export function marketRows(game, ui = {}) {
  const f = filtersOf(ui);
  const api = { role: f.role || undefined, minQ: f.qmin !== '' ? Number(f.qmin) : undefined, maxWage: f.wmax !== '' ? Number(f.wmax) : undefined, noOffers: !!f.noOffers };
  if (f.nat === 'pol') api.foreign = false; else if (f.nat === 'obcy') api.foreign = true;
  let rows = listFreeStaff(game, api);
  if (f.poach) rows = rows.concat(listClubStaff(game, api));
  if (f.nat && f.nat !== 'pol' && f.nat !== 'obcy') rows = rows.filter((r) => r.nat === f.nat);
  if (f.qmax !== '') rows = rows.filter((r) => r.q.v <= Number(f.qmax));
  const s = ui.trStaffSort ?? { k: 'q', dir: -1 };
  const key = {
    name: (r) => r.name, role: (r) => ROLE_SHORT[r.role], nat: (r) => natName(r.nat), age: (r) => r.age, q: (r) => r.q.v,
    wage: (r) => r.wage.mid, status: (r) => (r.club ? 2 : r.offers ? 1 : 0) * 1e4 + (r.idleDays ?? 0),
  }[s.k] ?? ((r) => r.q.v);
  rows.sort((a, b) => { const x = key(a); const y = key(b); return (typeof x === 'string' ? x.localeCompare(y, 'pl') : x - y) * s.dir || a.name.localeCompare(b.name, 'pl'); });
  return rows;
}

// ------------------------------------------------------------ Pasek stanu i zakładki
function limitBar(sum) {
  const max = Math.max(sum.limit, sum.used, 1);
  return `<span class="st-limit__bar" aria-hidden="true"><i style="width:${pct(sum.staff, max)}%"></i>${sum.pending ? `<s style="left:${pct(sum.staff, max)}%;width:${pct(sum.pending, max)}%"></s>` : ''}<b style="left:${pct(sum.limit, max)}%"></b></span>`;
}
function payBar(B) {
  const max = Math.max(B.budget, B.pay + B.pending, 1);
  return `<span class="st-limit__bar st-pay__bar" aria-hidden="true"><i style="width:${pct(B.pay, max)}%"></i>${B.pending ? `<s style="left:${pct(B.pay, max)}%;width:${pct(B.pending, max)}%"></s>` : ''}<b style="left:${pct(B.budget, max)}%"></b></span>`;
}
const limitState = (sum) => (sum.staff > sum.limit ? 'over' : sum.used >= sum.limit ? 'full' : sum.used >= sum.limit - 1 ? 'near' : 'ok');
const payState = (B) => (B.pay + B.pending > B.budget ? 'over' : B.budget - B.pay - B.pending < B.budget * 0.08 ? 'near' : 'ok');
const offersWord = (n) => (n === 1 ? '1 oferta w toku' : `${n} oferty w toku`);

function statusBar(game, sum, B) {
  const ls = limitState(sum); const ps = payState(B);
  const full = ls === 'full' || ls === 'over';
  const note = ls === 'over' ? `Sztab ponad limitem: ${sum.staff} z ${sum.limit}. Nikt nie zostanie zwolniony sam, nadmiar wygasa z umowami. Nowe oferty zablokowane.`
    : ls === 'full' ? `Sztab pełny: ${sum.used} z ${sum.limit}. Zwolnij kogoś albo poczekaj, aż skończy się czyjaś umowa.` : '';
  return `<div class="st-bar" data-state="${ls}">
    <div class="st-bar__limit" role="img" aria-label="${esc(`${sum.staff} z ${sum.limit} miejsc w sztabie${sum.pending ? `, ${offersWord(sum.pending)}` : ''}`)}">
      <span class="st-bar__k">Sztab <b>${sum.staff}/${sum.limit}</b></span>${limitBar(sum)}</div>
    <div class="st-bar__pay" data-state="${ps}" role="img" aria-label="${esc(`Pensje sztabu ${kzl(B.pay)} miesięcznie z budżetu ${kzl(B.budget)}`)}">
      <span class="st-bar__k">Pensje <b>${esc(kNum(B.pay))}</b> z ${esc(kzl(B.budget))} / mies.</span>${payBar(B)}</div>
    ${sum.pending ? `<span class="st-bar__pend">${esc(offersWord(sum.pending))}</span>` : ''}
    <button class="btn btn--primary st-bar__go" data-act="st-sub" data-sub="rynek"${full ? ` disabled title="${esc(note)}"` : ''}>Zatrudnij</button>
    ${note ? `<p class="st-bar__note">${esc(note)}</p>` : ''}
  </div>`;
}

function subTabs(sub, sum, free, pend, date) {
  const soon = pend.some((x) => x.decideOn && daysBetween(date, x.decideOn) <= 1);
  const tabs = [
    ['moj', `Mój sztab ${sum.staff}/${sum.limit}`, `<span class="st-long">Mój sztab</span><span class="st-short">Mój sztab</span> <small>${sum.staff}/${sum.limit}</small>`],
    ['rynek', `Rynek sztabu, ${free} wolnych`, `<span class="st-long">Rynek sztabu</span><span class="st-short">Rynek</span> <small>${free}</small>`],
    ['oferty', `Oferty w toku: ${pend.length}`, `<span class="st-long">Oferty w toku</span><span class="st-short">Oferty</span>${pend.length ? ` <span class="st-badge"${soon ? ' data-k="warn"' : ''}>${pend.length}</span>` : ''}`],
  ];
  return `<div class="subtabs subtabs--3 st-subs" role="tablist" aria-label="Sztab">${tabs.map(([k, label, html]) => `<button role="tab" id="st-tab-${k}" aria-controls="st-panel" aria-selected="${sub === k}" tabindex="${sub === k ? 0 : -1}" data-act="st-sub" data-sub="${k}" aria-label="${esc(label)}">${html}</button>`).join('')}</div>`;
}

// ------------------------------------------------------------ Mój sztab
/** Atrybuty osoby z własnego sztabu (klub zna je dokładnie): nazwa i wartość, podpowiedź z wpływem na grę. */
function ownAttrs(p) {
  const keys = roleAttrKeys(p.role);
  if (!keys.length || !p.a) return '';
  return `<ul class="st-oattr" aria-label="Atrybuty">${keys.map((k) => `<li data-t="${tone(p.a[k], p.role)}" title="${esc(ROLE_ATTRS[p.role][k].text)}"><span>${esc(ROLE_ATTRS[p.role][k].name)}</span><b>${p.a[k]}</b></li>`).join('')}</ul>`;
}

function personRow(game, p, i, role, ui) {
  const date = game.date;
  const adapting = p.adapt && date < p.adapt.to;
  const share = i === 0 ? { k: 'good', t: 'lider' } : tooWeakHelper(p.role, p.q) ? { k: 'warn', t: 'nic nie daje' } : { k: 'info', t: `pomaga +${num(helperShare(p.role, p.qNow, i), 1)}` };
  const left = p.until ? daysBetween(date, p.until) : 999;
  const untilK = left < 30 ? 'bad' : left < 90 ? 'warn' : '';
  const renewFrom = p.until ? `${+p.until.slice(0, 4)}-01-01` : null;
  const adaptHtml = adapting ? (() => {
    const d = daysBetween(date, p.adapt.to);
    return `<div class="st-adapt"><span class="tr-meter st-adapt__bar" data-t="misc" aria-hidden="true"><i style="width:${pct(K.adapt.days - d, K.adapt.days)}%"></i></span>
      <p>Adaptacja: jeszcze ${d} ${dayWord(d)} (do ${esc(fmtDate(p.adapt.to))}). Do tego czasu pracuje jak jakość ${esc(qTxt(p.qNow))} zamiast ${p.q}.</p></div>`;
  })() : '';
  const ask = ui.trStaffAsk === p.id ? fireAsk(game, p, role) : '';
  const renewForm = ui.trStaffOffer?.renew && ui.trStaffOffer.pid === p.id ? renewPanel(game, p, ui.trStaffOffer) : '';
  return `<li class="st-person" data-id="${esc(p.id)}">
    <span class="st-q" data-t="${tone(p.qNow, p.role)}" title="Jakość ${esc(staffLabel(p.qNow, p.role).toLowerCase())}">${esc(qTxt(adapting ? Math.round(p.qNow) : p.q))}${adapting ? `<small>(${p.q})</small>` : ''}</span>
    <div class="st-who">
      <p class="st-who__nm"><b>${esc(p.name)}</b> <span class="st-nat" title="${esc(natName(p.nat))}">${esc(p.nat ?? '')}</span>
        ${isDir(p.role) ? '' : `<span class="st-share" data-k="${share.k}"${share.k === 'warn' ? ` title="Pomocnik słabszy niż ${isCappedRole(p.role) ? 5 : 7} nie podnosi jakości roli. Warto rozważyć zwolnienie."` : ''}>${esc(share.t)}</span>`}${p.demoted ? ' <span class="st-share" data-k="warn" title="Stracił rolę lidera i chętniej odejdzie">niezadowolony</span>' : ''}</p>
      <p class="st-meta">${p.age} l., ${esc(kzl(p.wage))} / mies., <span class="st-until"${untilK ? ` data-k="${untilK}"` : ''}>umowa do ${esc(fmtDate(p.until))}</span></p>
      ${ownAttrs(p)}
      ${adaptHtml}
    </div>
    ${isDir(p.role) ? '' : `<div class="st-person__acts">
      <button class="btn btn--quiet btn--sm" data-act="st-renew" data-id="${esc(p.id)}" aria-label="${esc(`Przedłuż umowę: ${p.name}`)}"${p.canRenew ? '' : ` disabled title="${esc(renewFrom ? `Od ${fmtDate(renewFrom)}` : 'Bez umowy')}"`}>Przedłuż</button>
      <button class="btn btn--quiet btn--sm" data-act="st-fire-ask" data-id="${esc(p.id)}" aria-label="${esc(`Zwolnij ${p.name}`)}">Zwolnij</button>
    </div>`}
    ${renewForm}${ask}
  </li>`;
}

function fireAsk(game, p, role) {
  const date = game.date;
  const cost = p.severance;
  const n = p.wage ? Math.round(cost / p.wage) : 0;
  const ml = monthsLeftOf(date, p.until);
  const after = combineQ(role.people.filter((x) => x.id !== p.id).map((x) => x.qNow), p.role);
  const vacant = role.people.length === 1;
  const bal = game.finance?.clubs?.[game.clubId]?.balance;
  const matchToday = (game.fixtures ?? []).some((f) => f.date === date && !f.played && (f.home === game.clubId || f.away === game.clubId));
  const endsNow = p.until && ml <= 2;
  return `<div class="st-scrim" data-act="st-fire-no" data-id="${esc(p.id)}" aria-hidden="true"></div>
  <div class="st-ask" role="alertdialog" aria-modal="false" aria-labelledby="st-ask-t" aria-describedby="st-ask-d">
    <h4 id="st-ask-t">Zwolnić ${esc(p.name)}?</h4>
    <p>${esc(role.name)}, umowa do ${esc(fmtDate(p.until))}</p>
    <p id="st-ask-d" class="st-ask__cost">Odprawa: ${n} ${wagesWord(n)} = ${esc(formatZl(cost))} (jednorazowo). Zostało ${ml} ${monthWord(ml)} umowy, odprawa od ${K.severance.min} do ${K.severance.max} pensji.</p>
    ${endsNow ? `<p class="st-note">Umowa wygasa ${esc(fmtDate(p.until))}: bez przedłużenia odejdzie 1 lipca bez odprawy.</p>` : ''}
    ${isDir(p.role) ? `<p>Pensje spadną o ${esc(kzl(p.wage))} / mies.</p>` : `<p>Po zwolnieniu: ${esc(ROLE_PLURAL[p.role])} ${esc(num(role.q, 1))} -> ${esc(num(after, 1))}. Pensje spadną o ${esc(kzl(p.wage))} / mies.</p>`}
    <p>Wraca na rynek i inny klub może go zatrudnić.</p>
    ${vacant ? `<p class="st-warn">${isDir(p.role) ? `Bez dyrektora obowiązki przejmie zarząd (jakość ${K.vacantQ[p.role]}): szersze widełki w rozmowach, wolniejsze szukanie klubów na wypożyczenie.` : `Rola zostanie bez człowieka: obowiązki przejmie trener (jakość ${K.vacantQ[p.role] ?? 3}).`}</p>` : ''}
    ${bal != null && bal < cost ? `<p class="st-bad">Na koncie klubu jest ${esc(formatZl(bal))}, mniej niż odprawa: saldo spadnie poniżej zera.</p>` : ''}
    ${matchToday ? '<p class="st-note">Mecz dziś: zwolnienie od razu zmieni jakość sztabu.</p>' : ''}
    <div class="st-ask__btns">
      <button class="btn st-btn-bad" data-act="st-fire-yes" data-id="${esc(p.id)}">Zwolnij i zapłać ${esc(kzl(cost))}</button>
      <button class="btn btn--quiet" data-act="st-fire-no" data-id="${esc(p.id)}" id="st-ask-no">Nie zwalniaj</button>
    </div>
  </div>`;
}

function renewPanel(game, p, o) {
  const w0 = expectedWage(p, game.date);
  const years = [1, 2, 3].includes(o.years) ? o.years : 1;
  const until = `${+p.until.slice(0, 4) + years}-06-30`;
  const room = staffBudget(game).room;
  const over = (o.wage ?? w0) - p.wage > room;
  return `<div class="st-renew" role="group" aria-label="${esc(`Przedłużenie umowy: ${p.name}`)}">
    <label class="st-field"><span>Pensja zł / mies.</span><input type="number" inputmode="numeric" step="500" min="${K.wage.min}" value="${o.wage ?? w0}" data-st-field="rwage" id="st-rwage"></label>
    <p class="st-note">Teraz ${esc(kzl(p.wage))}, oczekuje ok. ${esc(kzl(w0))}.</p>
    <div class="seg2" role="group" aria-label="Długość przedłużenia">${[1, 2, 3].map((y) => `<button data-act="st-ryears" data-v="${y}" aria-pressed="${years === y}">${esc(yearsTxt(y))}</button>`).join('')}</div>
    <p class="st-note">Nowa umowa do ${esc(fmtDate(until))}.${over ? ' Podwyżka przekracza budżet sztabu.' : ''}</p>
    <div class="st-ask__btns"><button class="btn btn--primary" data-act="st-renew-go" data-id="${esc(p.id)}"${over ? ' disabled' : ''}>Zaproponuj przedłużenie</button><button class="btn btn--quiet" data-act="st-renew-no" data-id="${esc(p.id)}">Anuluj</button></div>
  </div>`;
}

/** Wpływ atrybutów dyrektora sportowego na grę (dla gracza), z bieżących wartości albo wakatu. */
function directorEffects(a) {
  const x = Math.round(hintHalfWidth(a.RYN) * 100);
  const st = sieStep(a.SIE);
  const esc_ = Math.round(DIR.kad.esc * (a.KAD - 10) * 1000) / 10;
  return [
    ['Znajomość rynku', `widełki pensji w rozmowach: ok. ±${x} %`],
    ['Sieć kontaktów', st > 0 ? 'kluby na wypożyczenie szybciej i więcej propozycji' : st < 0 ? 'kluby na wypożyczenie wolniej i mniej propozycji' : 'kluby na wypożyczenie w zwykłym tempie'],
    ['Zarządzanie kadrą', esc_ ? `spór z trenerem rezerw: ${esc_ > 0 ? '+' : ''}${num(esc_, 1)} pp szansy` : 'spór z trenerem rezerw: szansa bez zmian'],
    ['Negocjacje', 'rozmowy prowadzisz sam; atrybut działa w klubach AI'],
  ];
}

/** Karta dyrektora sportowego: osobny slot poza limitem osób, pensja z budżetu sztabu (docs/dyrektor-sportowy.md). */
function directorCard(game, role, ui) {
  if (!role) return '';
  const p = role.people[0];
  const a = p?.a ?? { NEG: role.q, RYN: role.q, SIE: role.q, KAD: role.q };
  const eff = `<dl class="st-sum st-dir__eff">${directorEffects(a).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  const people = p
    ? `<ul class="st-people">${personRow(game, p, 0, role, ui)}</ul>`
    : `<p class="st-vacant">Wakat: zarząd szuka nowego dyrektora, do tego czasu obowiązki przejmuje sam (jakość ${esc(qTxt(role.q))}). Widełki w rozmowach są szersze, a kluby na wypożyczenie szuka się wolniej.</p>`;
  // O dyrektorze decyduje zarząd: gracz może tylko poprosić o zmianę (Klub, Zarząd) i obejrzeć listę wolnych dyrektorów
  const btn = `${p ? '<button class="btn btn--sm st-find" data-act="tab" data-tab="klub" data-sub="zarzad">Poproś zarząd o zmianę dyrektora</button>' : ''}<button class="btn btn--quiet btn--sm" data-act="st-find" data-role="${DIRECTOR_ROLE}">Wolni dyrektorzy (podgląd)</button>`;
  return `<section class="tr-card tr-staffcard st-role st-dir" data-t="${p ? tone(role.q, DIRECTOR_ROLE) : 'warn'}" id="st-role-${DIRECTOR_ROLE}" aria-labelledby="st-role-${DIRECTOR_ROLE}-h" data-wide>
    <header class="st-role__head"><h3 class="st-h" id="st-role-${DIRECTOR_ROLE}-h">${esc(role.name)}</h3>
      <span class="st-role__q"><b>${esc(qTxt(role.q))}</b><small>${p ? esc(staffLabel(role.q, DIRECTOR_ROLE).toLowerCase()) : 'wakat'}</small></span></header>
    <p class="st-role__seats">Zatrudnia i zwalnia zarząd klubu. Poza limitem osób sztabu, pensja z budżetu sztabu.</p>
    ${people}
    ${eff}
    <div class="tr-card__foot">${btn}</div>
  </section>`;
}

function roleCard(game, k, role, sum, opts, ui) {
  const L = { n: role.people.length, max: role.max };
  const pendRole = (game.staff?.offers ?? []).filter((o) => o.club === game.clubId && o.role === k).length;
  const roleFull = L.n + pendRole >= L.max;
  const staffFull = sum.used >= sum.limit;
  const q = role.q;
  const t = role.vacant ? 'warn' : tone(q, k);
  const seats = `${L.n} z ${L.max} ${L.max === 1 ? 'miejsca' : 'miejsc'}${pendRole ? `, oferty: ${pendRole}` : ''}`;
  const why = roleFull ? `Rola pełna: ${L.n + pendRole} z ${L.max} w tej lidze` : staffFull ? `Sztab pełny: ${sum.used} z ${sum.limit} osób` : '';
  const people = role.vacant
    ? `<p class="st-vacant">Wakat: obowiązki przejmuje trener (jakość ${esc(qTxt(q))}).${k === 'kierownik' ? ' Sprawy organizacyjne zauważasz słabiej.' : ''}</p>`
    : `<ul class="st-people">${role.people.map((p, i) => personRow(game, p, i, role, ui)).join('')}</ul>`;
  const btn = role.vacant
    ? `<button class="btn btn--sm st-find" data-act="st-find" data-role="${k}"${staffFull ? ` disabled title="${esc(why)}"` : ''}>Szukaj: ${esc(ROLE_ACC[k])}</button>`
    : `<button class="btn btn--quiet btn--sm" data-act="st-find" data-role="${k}"${why ? ` disabled title="${esc(why)}"` : ''}>Dodaj ${esc(ROLE_ACC[k])}</button>`;
  return `<section class="tr-card tr-staffcard st-role" data-t="${t}" id="st-role-${k}" aria-labelledby="st-role-${k}-h"${role.people.length >= 3 ? ' data-wide' : ''}>
    <header class="st-role__head"><h3 class="st-h" id="st-role-${k}-h">${esc(role.name)}</h3>
      <span class="st-role__q"><b>${esc(qTxt(q))}</b><small>${role.vacant ? 'wakat' : esc(staffLabel(q, k).toLowerCase())}</small></span></header>
    <p class="st-role__seats">${esc(seats)}</p>
    <p class="st-eff">${esc(opts.effect?.(k, q) ?? '')}</p>
    ${!role.vacant && opts.attrs ? opts.attrs(k) : ''}
    ${people}
    <div class="tr-card__foot">${btn}${why && !role.vacant ? `<span class="st-note">${esc(why)}</span>` : ''}</div>
  </section>`;
}

function sideMine(game, sum, B, roles) {
  const dir = directorOf(game, game.clubId);
  const ppl = [...rosterOf(game, game.clubId), ...(dir ? [dir] : [])].filter((p) => p.until).sort((a, b) => a.until.localeCompare(b.until)).slice(0, 4);
  const byRole = MARKET_ROLES.map((k) => [k, (roles[k]?.people ?? []).reduce((s, p) => s + (p.wage ?? 0), 0)]).filter(([, v]) => v > 0);
  return `<section class="tr-card st-limit" data-t="${limitState(sum) === 'ok' ? 'good' : limitState(sum) === 'near' ? 'warn' : 'bad'}">
      <h3 class="st-h">Limit i budżet</h3>
      <p class="st-limit__nums"><b>${sum.staff}</b> z ${sum.limit} osób${sum.pending ? `, ${esc(offersWord(sum.pending))} zajmuje miejsce` : ''}</p>
      ${limitBar(sum)}
      <p class="st-note">Limit sztabu zależy od ligi, renomy i przychodów klubu. Liczony na start sezonu.</p>
      <p class="st-limit__nums st-pay" data-state="${payState(B)}"><b>${esc(kNum(B.pay + B.pending))}</b> z ${esc(kzl(B.budget))} / mies.</p>
      ${payBar(B)}
      <p class="st-note">${B.room >= 0 ? `Zostało ${esc(kzl(B.room))} / mies.` : `Ponad budżet o ${esc(kzl(-B.room))} / mies.`}${B.pending ? ` W tym oferty w toku: ${esc(kzl(B.pending))}.` : ''}</p>
    </section>
    <section class="tr-card" data-t="info"><h3 class="st-h">Za co płacimy</h3>
      <dl class="st-sum">${byRole.map(([k, v]) => `<div><dt>${esc(ROLE_PLURAL[k])}</dt><dd>${esc(kzl(v))}</dd></div>`).join('') || '<div><dt>Brak pensji</dt><dd>0 zł</dd></div>'}</dl></section>
    <section class="tr-card" data-t="info"><h3 class="st-h">Najbliższe umowy</h3>
      <ul class="st-plain">${ppl.map((p) => `<li><span>${esc(p.name)}, ${esc(ROLE_SHORT[p.role])}</span><span>do ${esc(fmtDate(p.until))}</span></li>`).join('') || '<li>Brak umów.</li>'}</ul></section>
    ${howItWorks()}`;
}

const howItWorks = () => `<details class="st-how"><summary>Jak to działa</summary>
  <p>W roli może pracować kilka osób. Najlepszy prowadzi, pomocnicy z jakością 5 i więcej (fizjoterapeuci: 7 i więcej) podnoszą łączny wynik, najwyżej do 12. Skala jakości: 1-12, 12 to najlepsi w Polsce; fizjoterapeuci i dyrektorzy sportowi 1-20.</p>
  <p>Oferta wiąże do decyzji kandydata (2-3 dni). Kandydat wybiera najkorzystniejszą ofertę, a po decyzji nie przyjmuje kolejnych.</p>
  <p>Obcokrajowiec przez pierwsze 3 miesiące pracuje nieco słabiej. Zwolnienie kosztuje od 2 do 6 pensji odprawy.</p>
  <p>Osobę z innego klubu można podebrać: jej klub zgadza się (rekompensata 3 pensje) albo blokuje. Przy blokadzie osoba może zerwać umowę, a wtedy płacisz karę: 3 pensje i do połowy więcej.</p>
</details>`;

function aside(inner) {
  const open = wide('(min-width: 1100px)');
  return `<aside class="st-side"><details class="st-fold"${open ? ' open' : ''}><summary>Limit i budżet, najbliższe umowy</summary><div class="st-fold__body">${inner}</div></details></aside>`;
}

function mineView(game, sum, B, opts, ui) {
  const tip = readTip() ? '' : `<p class="notice st-tip" role="status">Sztab to nie tylko jeden człowiek na rolę. Dodatkowi pomocnicy z jakością 5 i więcej podnoszą łączny wynik. <button class="btn btn--quiet btn--sm" data-act="st-tip-close">Rozumiem</button></p>`;
  const cards = directorCard(game, sum.roles[DIRECTOR_ROLE], ui) + STAFF_ROLE_ORDER.filter((k) => sum.roles[k]?.max).map((k) => roleCard(game, k, sum.roles[k], sum, opts, ui)).join('');
  return `<div class="st-grid"><div class="st-main">${tip}<div class="st-roles">${cards}</div></div>${aside(sideMine(game, sum, B, sum.roles))}</div>`;
}

// ------------------------------------------------------------ Rynek
function statusTag(game, r) {
  if (r.club) {
    const t = `${clubName(r.club)}, umowa do ${r.until ? r.until.slice(0, 4) : ''}`;
    return `<span class="st-tag" data-k="info">${esc(t)}</span>${r.blocked ? ` <span class="st-tag" data-k="mute" title="${esc(blockedText(r.blocked))}">teraz nie do podebrania</span>` : ''}`;
  }
  const tags = [];
  if (r.mine) tags.push('<span class="st-tag" data-k="good">twoja oferta w toku</span>');
  if (r.offers) tags.push(`<span class="st-tag" data-k="warn">rozważa oferty: ${r.offers}${r.decideOn ? `, decyzja ${esc(fmtDate(r.decideOn))}` : ''}</span>`);
  if (!r.offers) tags.push(`<span class="st-tag">${r.idleDays >= 30 ? `wolny od ${Math.floor(r.idleDays / 30)} mies.` : 'wolny od niedawna'}</span>`);
  if (r.nat !== 'POL') tags.push('<span class="st-tag" data-k="misc">adaptacja 3 mies.</span>');
  return tags.join(' ');
}
const blockedText = (k) => ({ locked: 'Pracuje tam od niedawna: klub nie odda go tak szybko.', poachBan: 'Niedawno próbowano go zatrudnić. Kolejna próba za kilka miesięcy.', poachCap: 'W tej rundzie było już dość prób zatrudnienia tej osoby.' }[k] ?? 'Teraz nie przyjmie oferty.');

function th(label, k, s, title = '') {
  const sorted = s.k === k;
  return `<th scope="col"${sorted ? ` aria-sort="${s.dir > 0 ? 'ascending' : 'descending'}"` : ''}${title ? ` title="${esc(title)}"` : ''}${k === 'name' ? ' class="xl__nm st-nm"' : ''}><button data-act="st-sort" data-k="${k}">${esc(label)}${sorted ? `<i aria-hidden="true">${s.dir > 0 ? '▲' : '▼'}</i>` : ''}</button></th>`;
}

function marketTable(game, rows, s) {
  const body = rows.map((r) => `<tr${r.blocked ? ' class="st-busy"' : ''}>
    <th scope="row" class="xl__nm st-nm"><button class="st-link" data-act="st-open" data-id="${esc(r.id)}">${esc(r.name)}</button></th>
    <td class="st-l">${esc(ROLE_SHORT[r.role])}</td><td class="st-l">${esc(natName(r.nat))}</td><td>${r.age}</td>
    <td><b class="st-qv" data-t="${tone(r.q.v, r.role)}">${esc(seenTxt(r.q))}</b></td><td>${esc(wageRange(r.wage))}</td>
    <td class="st-l">${statusTag(game, r)}</td>
    <td><button class="btn btn--quiet btn--sm" data-act="st-open" data-id="${esc(r.id)}" aria-label="${esc(`${isDir(r.role) ? 'Podgląd' : r.club ? 'Podbij' : 'Oferta'}: ${r.name}`)}"${r.blocked ? ' disabled' : ''}>${isDir(r.role) ? 'Podgląd' : r.club ? 'Podbij' : 'Oferta'}</button></td></tr>`).join('');
  const precTitle = 'Jakość widziana przez twojego asystenta: liczba, przedział albo słowo, zależnie od jego klasy.';
  return `<div class="xl-wrap st-xl" tabindex="0" role="region" aria-label="Wolni członkowie sztabu, tabela przewijana w poziomie"><table class="xl">
    <thead><tr>${th('Imię i nazwisko', 'name', s)}${th('Rola', 'role', s)}${th('Kraj', 'nat', s)}${th('Wiek', 'age', s)}${th('Jakość', 'q', s, precTitle)}${th('Oczekuje / mies.', 'wage', s)}${th('Status', 'status', s)}<th scope="col"><span class="st-sr">Akcja</span></th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function marketCards(game, rows) {
  return `<ul class="st-cards">${rows.map((r) => `<li><button class="st-pcard${r.blocked ? ' st-busy' : ''}" data-act="st-open" data-id="${esc(r.id)}" aria-label="${esc(`${r.name}, ${ROLE_SHORT[r.role]}`)}">
    <span class="st-q" data-t="${tone(r.q.v, r.role)}">${esc(seenTxt(r.q))}</span>
    <span class="st-pcard__body"><span class="st-pcard__top"><b>${esc(r.name)}</b><small>${esc(ROLE_SHORT[r.role])}</small></span>
      <span class="st-meta">${esc(r.nat ?? '')}, ${r.age} l., oczekuje ${esc(wageRange(r.wage))}</span>
      <span class="st-pcard__tags">${statusTag(game, r)}</span></span></button></li>`).join('')}</ul>`;
}

function filtersHtml(game, f) {
  const pool = listFreeStaff(game);
  const nats = {};
  for (const r of pool) if (r.nat !== 'POL') nats[r.nat] = (nats[r.nat] ?? 0) + 1;
  const natOpts = [['', 'Wszyscy'], ['pol', 'Polska'], ['obcy', 'Zagranica'], ...Object.entries(nats).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, `${natName(k)} ${n}`])];
  const roles = [['', 'Wszystkie'], ...MARKET_ROLES.map((k) => [k, ROLE_SHORT[k]])];
  const aq = game.training?.staff?.[game.clubId]?.asystent?.q ?? 10;
  const n = activeFilters(f);
  const open = wide('(min-width: 760px)') || n > 0;
  return `<details class="st-filters"${open ? ' open' : ''}><summary>Filtry${n ? ` (${n})` : ''}</summary>
    <div class="st-filters__body">
      <div class="chips chips--wrap st-filters__roles" role="group" aria-label="Rola">${roles.map(([k, l]) => `<button class="chip" data-act="st-role" data-v="${k}" aria-pressed="${(f.role || '') === k}">${esc(l)}</button>`).join('')}</div>
      <div class="st-filters__row">
        <label class="st-field"><span>Kraj</span><select data-st-field="nat" id="st-f-nat">${natOpts.map(([k, l]) => `<option value="${esc(k)}"${f.nat === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="st-field st-field--s"><span>Jakość od</span><input type="number" inputmode="numeric" min="1" max="20" value="${esc(f.qmin)}" data-st-field="qmin" id="st-f-qmin" aria-label="Jakość od"></label>
        <label class="st-field st-field--s"><span>do</span><input type="number" inputmode="numeric" min="1" max="20" value="${esc(f.qmax)}" data-st-field="qmax" id="st-f-qmax" aria-label="Jakość do"></label>
        <label class="st-field"><span>Pensja do (zł / mies.)</span><input type="number" inputmode="numeric" step="1000" min="0" value="${esc(f.wmax)}" data-st-field="wmax" id="st-f-wmax"></label>
      </div>
      <div class="st-filters__row st-filters__row--checks">
        <label class="st-check"><input type="checkbox" data-st-field="noOffers" id="st-f-free"${f.noOffers ? ' checked' : ''}> Tylko bez ofert</label>
        <label class="st-check"><input type="checkbox" data-st-field="poach" id="st-f-poach"${f.poach ? ' checked' : ''}> Pracują w klubach</label>
        <span class="st-note">Podbieranie kosztuje rekompensatę 3 pensji.</span>
      </div>
      ${aq < 14 ? `<p class="st-note">Twój asystent ocenia kandydatów ${aq >= 8 ? 'z dokładnością do 1 punktu (fizjoterapeutów i dyrektorów do 2)' : 'tylko ogólnie'}, więc filtr jakości może kogoś pominąć.</p>` : ''}
      <p class="st-note">Skala jakości: 1-12 (12 to najlepsi w Polsce), fizjoterapeuci i dyrektorzy sportowi 1-20.</p>
    </div></details>`;
}

function marketView(game, sum, B, ui) {
  if (ui.trStaffPerson) {
    const card = personCard(game, ui.trStaffPerson, sum, B, ui);
    if (card) return card;
  }
  const f = filtersOf(ui);
  const s = ui.trStaffSort ?? { k: 'q', dir: -1 };
  const all = listFreeStaff(game).length;
  const rows = marketRows(game, ui);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = clamp(Number(ui.trStaffPage) || 0, 0, pages - 1);
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const note = `<p class="xl-note st-count-note">${f.poach ? `Po filtrach ${rows.length} osób (wolni i pracujący w klubach).` : `Po filtrach ${rows.length} z ${all} wolnych osób.`} Lista odświeży się ${esc(fmtDate(nextRefresh(game.date)))}. ${activeFilters(f) ? '<button class="btn btn--quiet btn--sm" data-act="st-clear">Wyczyść filtry</button>' : ''}</p>`;
  const empty = !all && !f.poach ? '<p class="st-empty">Lista wolnych jest teraz pusta. Nowi pojawią się po odświeżeniu listy.</p>'
    : !rows.length ? '<p class="st-empty">Nikt nie pasuje do filtrów. Poluzuj jakość albo pensję. <button class="btn btn--quiet btn--sm" data-act="st-clear">Wyczyść filtry</button></p>' : '';
  const pager = pages > 1 ? `<div class="st-pager" role="group" aria-label="Strony listy">${Array.from({ length: pages }, (_, i) => `<button class="chip" data-act="st-page" data-p="${i}" aria-pressed="${i === page}">${i * PAGE + 1}-${Math.min(rows.length, (i + 1) * PAGE)}</button>`).join('')}</div>` : '';
  const vac = STAFF_ROLE_ORDER.filter((k) => sum.roles[k]?.vacant);
  const side = `<section class="tr-card st-limit" data-t="${limitState(sum) === 'ok' ? 'good' : 'warn'}"><h3 class="st-h">Twój sztab ${sum.staff}/${sum.limit}</h3>${limitBar(sum)}
      <p class="st-limit__nums st-pay" data-state="${payState(B)}">Pensje ${esc(kNum(B.pay + B.pending))} z ${esc(kzl(B.budget))} / mies.</p>${payBar(B)}</section>
    <section class="tr-card" data-t="${vac.length ? 'warn' : 'good'}"><h3 class="st-h">Wakaty w twoim sztabie</h3>
      ${vac.length ? `<ul class="st-plain">${vac.map((k) => `<li><span>${esc(sum.roles[k].name)}</span><button class="btn btn--quiet btn--sm" data-act="st-find" data-role="${k}">Szukaj</button></li>`).join('')}</ul>` : '<p>Każda rola ma człowieka.</p>'}</section>
    ${howItWorks()}`;
  return `<div class="st-grid"><div class="st-main">${filtersHtml(game, f)}${note}${empty}${shown.length ? marketTable(game, shown, s) + marketCards(game, shown) : ''}${pager}</div>${aside(side)}</div>`;
}

// ------------------------------------------------------------ Karta osoby i oferta
/**
 * Atrybuty osoby (docs/sztab-atrybuty.md) tak, jak widzi je klub: prawdziwy profil osoby przesunięty o błąd oceny
 * jakości (seenQuality), więc mocne i słabe strony widać, a dokładność zależy od tego, jak dobrze klub zna osobę.
 */
function personAttrs(game, p, v) {
  const keys = roleAttrKeys(p.role);
  if (!keys.length) return null;
  const shift = v - (p.q ?? v);
  return keys.map((k) => [ROLE_ATTRS[p.role][k].name, clamp(Math.round((p.a?.[k] ?? p.q ?? v) + shift), 1, staffCap(p.role)), ROLE_ATTRS[p.role][k].text]);
}

function offerState(game, p, ui, seen) {
  const o = ui.trStaffOffer?.pid === p.id && !ui.trStaffOffer.renew ? ui.trStaffOffer : null;
  const lead0 = rosterOf(game, game.clubId).filter((x) => x.role === p.role).reduce((m, x) => Math.max(m, x.q), 0);
  return { pid: p.id, wage: o?.wage ?? expectedWage(p, game.date), years: o?.years ?? 2, lead: o?.lead ?? seen.v > lead0, leadQ: lead0 };
}

/** Podgląd oferty (koszt, limit, budżet, podpowiedź, przycisk): odświeżany po zmianie pensji bez renderu całego ekranu. */
export function offerPreview(game, ui = {}) {
  const pid = ui.trStaffPerson;
  const p = game.staff?.people?.[pid];
  if (!p) return '';
  const sum = staffSummary(game);
  const seen = seenQuality(game, p);
  const o = offerState(game, p, ui, seen);
  const B = staffBudget(game);
  const room = budgetRoomFor(game, game.clubId, p.role);
  const chk = checkOffer(game, { pid, wage: o.wage, years: o.years });
  const hint = offerHint(game, { pid, wage: o.wage, years: o.years, lead: o.lead });
  const comp = p.club ? Math.round(K.poach.comp * (p.wage ?? 0)) : 0;
  const dirNow = isDir(p.role) ? directorOf(game, game.clubId) : null;
  const after = isDir(p.role) ? sum.used : sum.used + 1;
  const payAfter = B.pay + B.pending + o.wage - (dirNow?.wage ?? 0); // nowy dyrektor zastępuje obecnego
  const over = payAfter > B.budget;
  const why = chk.ok ? '' : ({
    limit: `Sztab pełny: ${sum.used} z ${sum.limit} (z ofertami w toku). Zwolnij kogoś albo poczekaj na koniec czyjejś umowy.`,
    roleFull: 'Rola pełna w tej lidze.',
    pending: `Masz ${K.offer.userMax} oferty w toku. Zaczekaj na decyzje.`,
    budget: `Ponad budżet sztabu o ${kzl(o.wage - room)} / mies. Zarząd się nie zgodzi: obniż pensję albo zwolnij kogoś.`,
    low: 'Poniżej jego oczekiwań, odrzuci od razu.',
    cool: `Odrzucił cię niedawno: spróbuj ${game.staff?.cool?.[`${game.clubId}:${pid}`] ? `od ${fmtDate(game.staff.cool[`${game.clubId}:${pid}`])}` : 'za kilka dni'}.`,
    locked: p.club ? blockedText('locked') : 'Podpisał niedawno umowę i nie przyjmuje ofert.',
    dup: 'Twoja oferta już czeka na jego decyzję.',
    dirPending: 'Twoja oferta dla innego dyrektora sportowego już czeka na decyzję.',
  }[chk.reason] ?? chk.text);
  return `<dl class="st-sum">
      <div><dt>Roczny koszt</dt><dd>${esc(formatZl(o.wage * 12))}</dd></div>
      ${isDir(p.role) ? '<div><dt>Limit sztabu</dt><dd>bez zmian (dyrektor poza limitem)</dd></div>' : `<div${after > sum.limit ? ' data-k="bad"' : ''}><dt>Sztab po zatrudnieniu</dt><dd>${after} z ${sum.limit} osób</dd></div>`}
      <div${over ? ' data-k="bad"' : ''}><dt>Pensje sztabu</dt><dd>${esc(kNum(payAfter))} z ${esc(kzl(B.budget))} / mies.</dd></div>
      ${comp ? `<div${comp > Math.max(0, game.finance?.clubs?.[game.clubId]?.balance ?? Infinity) ? ' data-k="warn"' : ''}><dt>Rekompensata (jeśli przyjmie)</dt><dd>${esc(formatZl(comp))}</dd></div>` : ''}
    </dl>
    ${over && room > B.room ? `<p class="st-board" data-k="info">Wakat w ważnej roli: zarząd zgadza się przekroczyć budżet o ${Math.round(K.budget.coreVacancy * 100)} %.</p>` : ''}
    ${hint ? `<div class="st-hint" data-k="${hint.k}"><p class="st-hint__word"><span aria-hidden="true">${{ good: '✓', info: '•', warn: '?', bad: '✗' }[hint.k] ?? '•'}</span> ${esc(hint.word)}</p>
      ${hint.reasons.length ? `<p class="st-hint__why">${esc(hint.reasons.join(', '))}.</p>` : ''}
      ${hint.weak ? '<p class="st-note">Twój asystent słabo ocenia kandydatów.</p>' : ''}
      <p class="st-note">To szacunek. Kandydat decyduje po 2-3 dniach, a w grze jest też trochę przypadku.</p></div>` : ''}
    <button class="btn btn--primary st-offer__go" data-act="st-offer" data-id="${esc(pid)}"${chk.ok ? '' : ' disabled'} aria-label="${esc(`Złóż ofertę: ${p.name}`)}">Złóż ofertę</button>
    ${why ? `<p class="notice notice--err st-why" role="alert">${esc(why)}</p>` : ''}
    <p class="st-note">Oferta wiąże do decyzji kandydata (2-3 dni). Po jego decyzji nie złożysz mu kolejnej.</p>`;
}

function personCard(game, pid, sum, B, ui) {
  const p = game.staff?.people?.[pid];
  if (!p || p.club === game.clubId) return null;
  const date = game.date;
  const seen = seenQuality(game, p);
  const w = expectedWage(p, date);
  const range = { lo: Math.round(w * 0.009) * 100, hi: Math.round(w * 0.011) * 100 };
  const o = offerState(game, p, ui, seen);
  const role = sum.roles[p.role];
  const offers = (game.staff.offers ?? []).filter((x) => x.pid === p.id).length;
  const decideOn = game.staff.decide?.[p.id];
  const appeal = clubAppeal(game, p.id);
  const foreign = p.nat && p.nat !== 'POL' && !p.pl;
  const v = seen.prec === 'vague' ? Math.round(seen.v) : seen.lo + (seen.hi - seen.lo) / 2;
  const cur = role ? role.q : 3;
  const qs = role ? role.people.map((x) => x.qNow) : [];
  const next = combineQ([...qs, v], p.role);
  const isLead = !qs.length || v > Math.max(...qs);
  const curDir = isDir(p.role) ? directorOf(game, game.clubId) : null;
  const delta = isDir(p.role) ? `O zatrudnieniu dyrektora sportowego decyduje zarząd klubu${curDir ? ` (dziś: ${curDir.name})` : ''}. Możesz wskazać tę osobę jako kandydata w prośbie o zmianę dyrektora (Klub, Zarząd).`
    : !role?.max ? 'Ta rola nie jest dostępna w twojej lidze.'
    : isLead ? `${role.name}: ${qTxt(cur)} -> ${qTxt(next)}${qs.length ? ' (nowy lider, obecny zostaje pomocnikiem)' : ''}.`
      : tooWeakHelper(p.role, v) ? `${role.name}: nic nie doda (jakość poniżej ${isCappedRole(p.role) ? 5 : 7}).` : `${role.name}: ${qTxt(cur)} -> ${qTxt(next)} (zostanie pomocnikiem, +${num(next - cur, 1)}).`;
  const attrs = personAttrs(game, p, v);
  const cap = staffCap(p.role); const aw = isCappedRole(p.role) ? 1 : 2; // skala roli i szerokość przedziału
  const precWord = { exact: 'dokładnie', approx: 'w przybliżeniu', vague: 'ogólnie' }[seen.prec];
  const attrHtml = attrs
    ? attrs.map(([l, x, tip]) => `<div class="st-attr" title="${esc(tip)}"><span>${esc(l)}</span><b>${seen.prec === 'exact' ? x : seen.prec === 'approx' ? `${Math.max(1, x - aw)}-${Math.min(cap, x + aw)}` : esc(staffLabel(x, p.role).toLowerCase())}</b><span class="tr-meter" aria-hidden="true"><i style="width:${pct(x, cap)}%"></i></span></div>`).join('')
    : `<div class="st-attr"><span>Mocne strony</span><b>${esc(staffLabel(Math.round(v), p.role).toLowerCase())}</b><span class="tr-meter" aria-hidden="true"><i style="width:${pct(v, cap)}%"></i></span></div>`;
  const hist = (p.hist ?? []).slice(0, 4).map((h) => `${clubName(h.club)} (${h.from ? h.from.slice(0, 4) : '?'}-${h.to ? h.to.slice(0, 4) : '?'})`).join(', ');
  const winter = +date.slice(5, 7) < 7;
  const yearsOpts = [...(winter ? [0] : []), 1, 2, 3];
  const ageHint = p.age >= K.util.oldAge ? 'Starsi cenią dłuższą umowę.' : p.age <= K.util.youngAge ? 'Młodsi wolą krótszą umowę.' : '';
  const leadBlocked = o.leadQ && seen.v <= o.leadQ;
  const leader = role?.people?.[0];
  const poach = p.club ? `<section class="tr-card st-poach" data-t="info"><h3 class="st-h">${crest(p.club, 24)} Pracuje w: ${esc(clubName(p.club))}</h3>
      <p>Umowa do ${esc(fmtDate(p.until))}, pensja około ${esc(kzl(p.wage))} / mies.</p>
      <p>Rekompensata dla klubu: 3 pensje, ${esc(formatZl(Math.round(K.poach.comp * p.wage)))}. Płacisz tylko, jeśli przyjmie ofertę.</p>
      <p>Klub może się zgodzić albo zablokować odejście. Przy blokadzie osoba może zerwać umowę: wtedy płacisz karę, 3 pensje i do połowy więcej.</p>
    </section>` : '';
  return `<div class="st-card">
    <p><button class="btn btn--quiet btn--sm" data-act="st-back">Wróć do listy</button></p>
    <div class="st-grid"><div class="st-main">
      <section class="tr-card st-ch" data-t="${tone(seen.v, p.role)}">
        <div class="st-ch__top"><span class="st-q" data-t="${tone(seen.v, p.role)}" title="Jakość widziana przez asystenta">${esc(seenTxt(seen))}</span>
          <div><h3 class="st-h st-ch__nm">${p.club ? `${crest(p.club, 24)} ` : ''}${esc(p.name)}</h3>
          <p class="st-meta">${esc(MARKET_ROLES.includes(p.role) ? (role?.name ?? ROLE_SHORT[p.role]) : p.role)}, ${esc(natName(p.nat))}, ${p.age} lat${foreign ? ' <span class="st-tag" data-k="misc">adaptacja 3 mies.</span>' : ''}</p></div></div>
        <dl class="st-facts">
          ${p.club ? `<div><dt>Umowa do</dt><dd>${esc(fmtDate(p.until))}</dd></div>` : `<div><dt>Wolny od</dt><dd>${p.free ? esc(fmtDate(p.free)) : 'niedawna'}</dd></div>`}
          <div><dt>Oczekuje</dt><dd>${esc(`${kNum(range.lo)}-${kNum(range.hi)} tys. zł / mies.`)}</dd></div>
          <div><dt>Poprzednie kluby</dt><dd>${hist ? esc(hist) : 'brak w Polsce'}</dd></div>
          ${foreign ? '<div><dt>Obcokrajowiec</dt><dd>oczekuje o 20 % wyższej pensji (już w przedziale)</dd></div>' : ''}
        </dl>
      </section>
      <section class="tr-card" data-t="info"><h3 class="st-h">Atrybuty <small>(twój asystent ocenia ${esc(precWord)})</small></h3><div class="st-attrs">${attrHtml}</div></section>
      <section class="tr-card st-delta" data-t="good"><h3 class="st-h">Co się zmieni w twoim sztabie</h3><p>${esc(delta)}</p></section>
      ${foreign ? `<section class="tr-card st-adapt" data-t="misc"><h3 class="st-h">Adaptacja</h3><p>Pierwsze 3 miesiące (do ${esc(fmtDate(addDaysIso(date, K.adapt.days + 3)))}) pracuje jak jakość ${esc(qTxt(Math.max(1, Math.round(v) - (isCappedRole(p.role) ? Math.round(K.adapt.pen / STAFF_EFF) : K.adapt.pen))))} zamiast ${esc(qTxt(Math.round(v)))}, potem pełna jakość.</p></section>` : ''}
      <section class="tr-card st-interest" data-t="${appeal?.k ?? 'info'}"><h3 class="st-h">Zainteresowanie naszym klubem</h3>
        <p>Klub jest dla niego: <b>${esc(appeal?.word ?? 'w porządku')}</b> (${esc(appeal?.reason ?? '')}).</p>
        <p>${offers ? `Rozważa oferty: ${offers}${decideOn ? `, decyzja ${esc(fmtDate(decideOn))}. Możesz dołączyć do dnia decyzji.` : '.'}` : 'Nie rozważa teraz żadnej oferty. Decyzja 2-3 dni po pierwszej ofercie.'}</p></section>
    </div>
    <div class="st-side st-side--offer">
      ${poach}
      ${isDir(p.role) ? `<section class="tr-card st-offer" data-t="info"><h3 class="st-h">Tylko podgląd</h3><p>Dyrektora sportowego zatrudnia zarząd klubu. Poproś zarząd o zmianę dyrektora i wskaż tę osobę jako kandydata.</p><p><button class="btn btn--primary btn--sm" data-act="tab" data-tab="klub" data-sub="zarzad">Prośby do zarządu</button></p></section>` : `<section class="tr-card st-offer" data-t="info" aria-labelledby="st-offer-t">
        <h3 class="st-h" id="st-offer-t">Oferta</h3>
        <label class="st-field"><span>Pensja zł / mies.</span><input type="number" inputmode="numeric" step="500" min="${K.wage.min}" value="${o.wage}" data-st-field="wage" id="st-wage"></label>
        <p class="st-note">Oczekuje ${esc(`${kNum(range.lo)}-${kNum(range.hi)} tys. zł`)}</p>
        <div class="seg2" role="group" aria-label="Szybki wybór pensji"><button data-act="st-wage" data-v="low">Poniżej</button><button data-act="st-wage" data-v="mid">Środek</button><button data-act="st-wage" data-v="high">Powyżej</button></div>
        <p class="st-lbl">Umowa</p>
        <div class="seg2" role="group" aria-label="Długość umowy">${yearsOpts.map((y) => `<button data-act="st-years" data-v="${y}" aria-pressed="${o.years === y}">${esc(yearsTxt(y))}</button>`).join('')}</div>
        <p class="st-note">Do ${esc(fmtDate(contractUntil(date, o.years)))}.${ageHint ? ` ${esc(ageHint)}` : ''}</p>
        ${isDir(p.role) ? '' : `<p class="st-lbl">Pozycja w sztabie</p>
        <div class="seg2" role="group" aria-label="Pozycja w sztabie"><button data-act="st-seat" data-v="lead" aria-pressed="${o.lead && !leadBlocked}"${leadBlocked ? ' disabled' : ''}>Lider w roli</button><button data-act="st-seat" data-v="help" aria-pressed="${!o.lead || !!leadBlocked}">Pomocnik</button></div>
        ${leadBlocked && leader ? `<p class="st-note">${esc(leader.name)} (${leader.q}) pozostanie liderem. Kandydat zostanie pomocnikiem.</p>` : '<p class="st-note">Obietnica roli lidera wiąże: dotychczasowy lider zostanie pomocnikiem i będzie niezadowolony.</p>'}`}
        <div id="st-preview" class="st-preview" aria-live="polite">${offerPreview(game, ui)}</div>
      </section>`}
    </div></div>
  </div>`;
}

const addDaysIso = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ------------------------------------------------------------ Oferty w toku
function offersView(game) {
  const pend = pendingOffers(game);
  const date = game.date;
  const rows = pend.map(({ offer: o, person: p, decideOn, offers }) => {
    if (!p) return '';
    const left = decideOn ? daysBetween(date, decideOn) : 0;
    const total = Math.max(1, decideOn ? daysBetween(o.date, decideOn) : 1);
    const when = left <= 0 ? 'Decyzja dziś' : left === 1 ? 'Decyzja jutro' : `Zostało ${left} dni`;
    const comp = p.club ? Math.round(K.poach.comp * (p.wage ?? 0)) : 0;
    return `<li class="st-offer-row">
      <div class="st-offer-row__who">${p.club ? crest(p.club, 20) : ''}<button class="st-link" data-act="st-open" data-id="${esc(p.id)}">${esc(p.name)}</button><span class="st-meta">${esc(ROLE_SHORT[p.role])}${p.club ? `, ${esc(clubName(p.club))}` : ''}</span></div>
      <div class="st-offer-row__terms">${esc(kzl(o.wage))} / mies., ${esc(yearsTxt(o.years))}, do ${esc(fmtDate(o.until))}${o.lead ? ', lider w roli' : ', pomocnik'}${comp ? `, rekompensata ${esc(kzl(comp))}` : ''}</div>
      <div class="st-count" data-k="${left <= 1 ? 'warn' : 'info'}"><span>${esc(when)}</span><span class="tr-meter" aria-hidden="true"><i style="width:${pct(total - left, total)}%"></i></span><small>decyzja ${esc(fmtDate(decideOn))}</small></div>
      <p class="st-note">Rozważa oferty: ${offers}${offers > 1 ? ' (twoja i inne)' : ' (twoja)'}. Oferta wiąże do decyzji, nie można jej wycofać.</p>
    </li>`;
  }).join('');
  const from = addDaysIso(date, -7);
  const done = (game.inbox ?? []).filter((m) => m.category === 'staff' && /^sztab-decyzja:/.test(m.key ?? '') && m.date >= from).slice(0, 5);
  const doneHtml = done.length ? `<section class="tr-card st-done" data-t="misc"><h3 class="st-h">Zakończone (7 dni)</h3><ul class="st-plain">${done.map((m) => {
    const ok = /przyjmuje/.test(m.subject);
    const pid = m.key.split(':')[1];
    const role = game.staff?.people?.[pid]?.role;
    return `<li data-k="${ok ? 'good' : /inny/.test(m.subject) ? 'mute' : 'warn'}"><span>${esc(m.subject)}</span>${ok ? '<button class="btn btn--quiet btn--sm" data-act="st-sub" data-sub="moj">Zobacz w sztabie</button>' : `<button class="btn btn--quiet btn--sm" data-act="st-find" data-role="${esc(role ?? '')}">Szukaj kogoś innego</button>`}</li>`;
  }).join('')}</ul></section>` : '';
  if (!pend.length) {
    return `<section class="tr-card st-offers" data-t="info"><h3 class="st-h">Oferty w toku</h3>
      <p class="st-empty">Nie masz ofert w toku. Otwórz Rynek sztabu i wybierz kandydata.</p>
      <p><button class="btn" data-act="st-sub" data-sub="rynek">Przejdź do rynku</button></p></section>${doneHtml}`;
  }
  return `<section class="tr-card st-offers" data-t="info"><h3 class="st-h">Oferty w toku (${pend.length} z ${K.offer.userMax} możliwych)</h3><ul class="st-offer-list">${rows}</ul>
    ${pend.length >= K.offer.userMax ? `<p class="st-note">Masz ${K.offer.userMax} oferty w toku. Zaczekaj na decyzje.</p>` : ''}</section>${doneHtml}`;
}

// ------------------------------------------------------------ Ekran
/**
 * Zakładka Sztab (HTML). opts: { effect(role, q) -> tekst efektu, attrs(role) -> HTML raportu atrybutów, footer: HTML pod
 * „Mój sztab” (raport asystenta) }.
 */
export function renderStaff(game, ui = {}, opts = {}) {
  const sum = staffSummary(game);
  const B = staffBudget(game);
  const sub = SUBS.includes(ui.trStaff) ? ui.trStaff : 'moj';
  const pend = pendingOffers(game);
  const free = listFreeStaff(game).length;
  const body = sub === 'rynek' ? marketView(game, sum, B, ui) : sub === 'oferty' ? offersView(game) : mineView(game, sum, B, opts, ui) + (opts.footer ?? '');
  return `<div class="st-view" data-sub="${sub}">${statusBar(game, sum, B)}${subTabs(sub, sum, free, pend, game.date)}<div id="st-panel" role="tabpanel" aria-labelledby="st-tab-${sub}">${body}</div></div>`;
}

/**
 * Kliknięcie „st-*”. Zwraca { ui, save, focus? }. Pola formularzy czytane ze stanu (zmiany przez handleStaffField).
 */
export function handleStaffAction(game, act, ds = {}, ui = {}) {
  const pid = ds.id;
  const p = pid ? game.staff?.people?.[pid] : null;
  const offer = ui.trStaffOffer ?? null;
  switch (act) {
    case 'st-sub': {
      const sub = SUBS.includes(ds.sub) ? ds.sub : 'moj';
      return { ui: { trStaff: sub, trStaffPerson: null, trStaffAsk: null, trNotice: null, ...(ds.role ? { trStaffF: { ...filtersOf(ui), role: ds.role }, trStaffPage: 0 } : {}) }, save: false, focus: `#st-tab-${sub}` };
    }
    case 'st-find': return { ui: { trStaff: 'rynek', trStaffPerson: null, trStaffAsk: null, trNotice: null, trStaffF: { ...filtersOf(ui), role: MARKET_ROLES.includes(ds.role) ? ds.role : '' }, trStaffPage: 0 }, save: false, focus: '#st-tab-rynek' };
    case 'st-open': {
      if (!p) return { ui: { trNotice: 'Tej osoby nie ma już na liście.' }, save: false };
      if (p.club === game.clubId) return { ui: { trStaff: 'moj', trStaffPerson: null }, save: false };
      return { ui: { trStaff: 'rynek', trStaffPerson: pid, trStaffAsk: null, trNotice: null, trStaffOffer: null }, save: false, focus: '[data-act="st-back"]', top: true };
    }
    case 'st-back': return { ui: { trStaffPerson: null, trStaffOffer: null }, save: false, focus: ui.trStaffPerson ? `[data-act="st-open"][data-id="${ui.trStaffPerson}"]` : null };
    case 'st-sort': {
      const s = ui.trStaffSort ?? { k: 'q', dir: -1 };
      const dir = s.k === ds.k ? -s.dir : (['name', 'role', 'nat'].includes(ds.k) ? 1 : -1);
      return { ui: { trStaffSort: { k: ds.k, dir }, trStaffPage: 0 }, save: false, focus: `[data-act="st-sort"][data-k="${ds.k}"]` };
    }
    case 'st-role': return { ui: { trStaffF: { ...filtersOf(ui), role: MARKET_ROLES.includes(ds.v) ? ds.v : '' }, trStaffPage: 0 }, save: false, focus: `[data-act="st-role"][data-v="${ds.v ?? ''}"]` };
    case 'st-clear': return { ui: { trStaffF: defaultFilters(), trStaffPage: 0 }, save: false };
    case 'st-page': return { ui: { trStaffPage: Math.max(0, Number(ds.p) || 0) }, save: false, top: true };
    case 'st-tip-close': writeTip(); return { ui: {}, save: false };
    case 'st-wage': case 'st-years': case 'st-seat': {
      const q = game.staff?.people?.[ui.trStaffPerson];
      if (!q) return { ui: {}, save: false };
      const seen = seenQuality(game, q);
      const o = offerState(game, q, ui, seen);
      const w = expectedWage(q, game.date);
      if (act === 'st-wage') o.wage = Math.round((ds.v === 'low' ? w * 0.9 : ds.v === 'high' ? w * 1.1 * 1.1 : w) / 100) * 100;
      if (act === 'st-years') o.years = clamp(Number(ds.v) || 0, 0, 3);
      if (act === 'st-seat') o.lead = ds.v === 'lead';
      return { ui: { trStaffOffer: { pid: o.pid, wage: o.wage, years: o.years, lead: o.lead } }, save: false, focus: `[data-act="${act}"][data-v="${ds.v}"]` };
    }
    case 'st-offer': {
      const q = game.staff?.people?.[pid];
      if (!q) return { ui: { trNotice: 'Tej osoby nie ma już na liście.' }, save: false };
      const o = offerState(game, q, ui, seenQuality(game, q));
      const r = makeOffer(game, { pid, wage: o.wage, years: o.years, lead: o.lead });
      if (!r.ok) return { ui: { trNotice: r.text }, save: r.reason === 'low' };
      return { ui: { trNotice: `Oferta dla ${q.name} złożona. Decyzja do ${fmtDate(r.decideOn)}.`, trStaff: 'oferty', trStaffPerson: null, trStaffOffer: null }, save: true, focus: '#st-tab-oferty' };
    }
    case 'st-fire-ask': return { ui: { trStaffAsk: pid, trStaffOffer: null, trNotice: null }, save: false, focus: '#st-ask-no' };
    case 'st-fire-no': return { ui: { trStaffAsk: null }, save: false, focus: pid ? `[data-act="st-fire-ask"][data-id="${pid}"]` : null };
    case 'st-fire-yes': {
      if (!p) return { ui: { trStaffAsk: null }, save: false };
      const name = p.name;
      const r = fireStaff(game, pid);
      return { ui: { trStaffAsk: null, trNotice: r.ok ? `${name} zwolniony. Odprawa ${formatZl(r.cost)} zapłacona.` : r.text }, save: r.ok };
    }
    case 'st-renew': {
      if (!p || !canRenew(p, game.date)) return { ui: { trNotice: 'Przedłużenie możliwe od 1 stycznia ostatniego roku umowy.' }, save: false };
      return { ui: { trStaffOffer: { pid, renew: true, wage: expectedWage(p, game.date), years: 1 }, trStaffAsk: null, trNotice: null }, save: false, focus: '#st-rwage' };
    }
    case 'st-ryears': return { ui: { trStaffOffer: offer?.renew ? { ...offer, years: clamp(Number(ds.v) || 1, 1, 3) } : offer }, save: false, focus: `[data-act="st-ryears"][data-v="${ds.v}"]` };
    case 'st-renew-no': return { ui: { trStaffOffer: null }, save: false, focus: pid ? `[data-act="st-renew"][data-id="${pid}"]` : null };
    case 'st-renew-go': {
      if (!p || !offer?.renew) return { ui: {}, save: false };
      const r = renewStaff(game, { pid, wage: offer.wage, years: offer.years });
      return { ui: { trNotice: r.text, trStaffOffer: r.ok ? null : offer }, save: r.ok || r.reason === 'refused' };
    }
    default: return { ui: {}, save: false };
  }
}

/**
 * Zmiana pola (listener „change”): field z data-st-field, value (checkbox: true/false).
 * Zwraca { ui, preview: true } (tylko podgląd oferty) albo { ui, focus } (pełny render).
 */
export function handleStaffField(game, field, value, ui = {}) {
  const f = filtersOf(ui);
  const numOrEmpty = (v, lo, hi) => (v === '' || v == null || !Number.isFinite(Number(v)) ? '' : String(clamp(Math.round(Number(v)), lo, hi)));
  switch (field) {
    case 'wage': {
      const q = game.staff?.people?.[ui.trStaffPerson];
      if (!q) return { ui: {} };
      const o = offerState(game, q, ui, seenQuality(game, q));
      o.wage = Math.max(K.wage.min, Math.round((Number(value) || 0) / 100) * 100);
      return { ui: { trStaffOffer: { pid: o.pid, wage: o.wage, years: o.years, lead: o.lead } }, preview: true };
    }
    case 'rwage': {
      const o = ui.trStaffOffer;
      if (!o?.renew) return { ui: {} };
      return { ui: { trStaffOffer: { ...o, wage: Math.max(K.wage.min, Math.round((Number(value) || 0) / 100) * 100) } }, focus: '#st-rwage' };
    }
    case 'nat': return { ui: { trStaffF: { ...f, nat: String(value ?? '') }, trStaffPage: 0 }, focus: '#st-f-nat' };
    case 'qmin': return { ui: { trStaffF: { ...f, qmin: numOrEmpty(value, 1, 20) }, trStaffPage: 0 }, focus: '#st-f-qmin' };
    case 'qmax': return { ui: { trStaffF: { ...f, qmax: numOrEmpty(value, 1, 20) }, trStaffPage: 0 }, focus: '#st-f-qmax' };
    case 'wmax': return { ui: { trStaffF: { ...f, wmax: numOrEmpty(value, 0, 1e7) }, trStaffPage: 0 }, focus: '#st-f-wmax' };
    case 'noOffers': return { ui: { trStaffF: { ...f, noOffers: !!value }, trStaffPage: 0 }, focus: '#st-f-free' };
    case 'poach': return { ui: { trStaffF: { ...f, poach: !!value }, trStaffPage: 0 }, focus: '#st-f-poach' };
    default: return { ui: {} };
  }
}

