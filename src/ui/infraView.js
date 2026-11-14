// Infrastruktura klubu (zakładka Klub > Infrastruktura): stadion, baza treningowa, akademia.
// Model: src/career/infrastructure.js, opis i źródła: docs/infrastruktura.md.
// Akcje (prefiks inf-): inf-start (pokazuje potwierdzenie), inf-confirm (start inwestycji), inf-cancel.
// Układ: telefon jedna kolumna; PC karty torów po lewej, po prawej trwające inwestycje i wymogi licencyjne.
import { esc, fmtDate } from './dom.js';
import { kpi, panel, meter } from './transfersView.js';
import { fmtZl } from '../career/transfers.js';
import { clubById, LEAGUE_NAMES } from '../data/clubs_pl.js';
import {
  TRACKS, TRACK_NAMES, LEVELS, MAX_LEVEL, PL_CEILING, LICENCE, INFRA,
  infraOf, ensureInfra, quote, startProject, capacityOf, seatRoom, seasonFill, licenceNeeds,
  trainingMods, academyMods, stadiumMul, ownerLabel, upkeepAt,
} from '../career/infrastructure.js';

const n0 = (x) => Math.round(x).toLocaleString('pl-PL'); // tysiące ze spacją nierozdzielającą
const x2 = (x) => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');
const pct = (x) => `${Math.round(x * 100)}\u00a0%`;
const mln = (x) => (x >= 1 ? `${String(x).replace('.', ',')} mln zł` : `${Math.round(x * 1000)} tys. zł`);
const TONE = { stadium: 'good', training: 'info', academy: 'misc' };

function addMonths(iso, n) {
  const d = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Efekty toru prostymi słowami (względem poziomu startowego klubu). */
function effects(game, id, track) {
  const I = infraOf(game, id);
  if (track === 'stadium') {
    const cap = capacityOf(game, id);
    return [
      `Przychód z jednego widza x${x2(stadiumMul(I.stadium) / stadiumMul(I.start.stadium))} względem startu gry`,
      `Pojemność ${n0(cap.full)} miejsc, na tym poziomie najwyżej ${n0(cap.max)}`,
      `Średnie zapełnienie ${pct(seasonFill(game, id))}`,
    ];
  }
  if (track === 'training') {
    const t = trainingMods(game, id);
    return [
      `Rozwój zawodników x${x2(t.dev)}`,
      `Ryzyko urazu na treningu x${x2(t.inj)}`,
      `Regeneracja ${t.rec >= 0 ? '+' : ''}${x2(t.rec)} pkt świeżości na zajęciach odnowy`,
    ];
  }
  const a = academyMods(game, id);
  return [
    `Juniorów co roku: ${3 + a.extra}-${5 + a.extra}`,
    `Jakość juniorów ${a.offset >= 0 ? '+' : ''}${x2(a.offset)} pkt`,
    `Szansa na wyjątkowy talent: ${Math.round(a.talent * 100)} % na juniora`,
    `Rozwój do 21 lat x${x2(a.youth)}`,
  ];
}

/** Drabina 10 poziomów: obecny wyróżniony, polski szczyt zaznaczony, lista nazw w rozwijanym bloku. */
function ladder(track, L) {
  const ceil = PL_CEILING[track];
  const cells = LEVELS[track].map((_, i) => {
    const n = i + 1;
    const s = n < L ? 'done' : n === L ? 'cur' : 'far';
    return `<li data-s="${s}"${n === ceil ? ' data-pl="1"' : ''}${n > ceil ? ' data-world="1"' : ''} title="${esc(LEVELS[track][i].name)}"><span>${n}</span></li>`;
  }).join('');
  const rows = LEVELS[track].map((lv, i) => {
    const n = i + 1;
    return `<li${n === L ? ' aria-current="true"' : ''}><b>${n}</b><span>${esc(lv.name)}${lv.ref ? `<small>${esc(lv.ref)}</small>` : ''}${n === ceil ? '<small class="inf-tag">szczyt w Polsce</small>' : ''}</span><em>${n === 1 ? '' : `${mln(lv.cost)}`}</em></li>`;
  }).join('');
  return `<ol class="inf-steps" aria-label="Poziomy 1-${MAX_LEVEL}">${cells}</ol>
    <p class="inf-steps__key"><span>Poziom ${L} z ${MAX_LEVEL}</span><span>szczyt w Polsce: ${ceil}</span></p>
    <details class="inf-levels"><summary>Wszystkie poziomy</summary><ol>${rows}</ol></details>`;
}

/** Projekt w toku: pasek postępu i wpływ na pojemność. */
function progress(game, id, track) {
  const I = infraOf(game, id); const p = I.proj[track];
  const done = Math.min(1, p.m / Math.max(1, p.months));
  const left = Math.max(0, p.months - p.m);
  const cap = capacityOf(game, id);
  const capLine = track === 'stadium' ? `<p class="inf-note">W czasie budowy pojemność ${n0(cap.now)} zamiast ${n0(cap.full)} (${p.kind === 'seats' ? '-25 %' : `-${Math.round((p.to >= 6 ? INFRA.DISRUPT.levelBig : INFRA.DISRUPT.level) * 100)} %`}).</p>` : '';
  return `<div class="inf-run">
      <p class="inf-run__head"><b>${esc(p.kind === 'seats' ? `Rozbudowa trybun: +${n0(p.seats)} miejsc` : `Budowa poziomu ${p.to}: ${LEVELS[track][p.to - 1].name}`)}</b><span>${pct(done)}</span></p>
      ${meter(done * 100, TONE[track])}
      <p class="inf-note">Zostało ${left} mies., koniec ok. ${esc(fmtDate(addMonths(p.start, p.months)))}. Zapłacono ${fmtZl(p.paid)} z ${fmtZl(p.club)}.</p>
      ${capLine}
    </div>`;
}

/** Wycena kolejnego kroku: koszt, czas, utrzymanie, podział finansowania, przycisk z potwierdzeniem. */
function offer(game, id, q, ask, label) {
  const key = q.kind === 'seats' ? `seats:${q.seats}` : q.track;
  const data = `data-track="${q.kind === 'seats' ? 'seats' : q.track}"${q.kind === 'seats' ? ` data-seats="${q.seats}"` : ''}`;
  const who = ownerLabel(id);
  const rows = [
    ['Koszt', fmtZl(q.cost)],
    ['Czas budowy', `${q.months} mies.`],
    ...(q.kind === 'level' ? [['Utrzymanie', `+${fmtZl(q.upkeepDelta)} rocznie`]] : [['Nowi widzowie', `ok. ${n0(q.seats * INFRA.SEATS_DEMAND)} na mecz przy pełnym stadionie`]]),
    ['Finansowanie', q.owner ? `klub ${fmtZl(q.club)}, ${who.toLowerCase()} ${fmtZl(q.owner)} (${pct(q.share)})` : `klub ${fmtZl(q.club)}`],
    ['Płatność', q.club ? `${fmtZl(q.upfront)} na start, potem ${fmtZl(q.monthly)} miesięcznie` : 'bez kosztów dla klubu'],
  ];
  const confirm = ask === key
    ? `<div class="inf-ask" role="group" aria-label="Potwierdzenie"><p>${esc(label)}: ${q.club ? `pierwsza wpłata ${fmtZl(q.upfront)}` : 'bez kosztów dla klubu'}${q.disrupt ? `, w czasie budowy pojemność -${Math.round(q.disrupt * 100)} %` : ''}. Rozpocząć?</p>
        <div class="inf-ask__btns"><button class="btn btn--primary btn--sm" data-act="inf-confirm" ${data}>Rozpocznij</button><button class="btn btn--quiet btn--sm" data-act="inf-cancel">Anuluj</button></div></div>`
    : `<button class="btn btn--quiet btn--sm" data-act="inf-start" ${data}>${esc(label)}</button>`;
  return `<dl class="tf-dl inf-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${confirm}`;
}

function trackCard(game, id, track, ask) {
  const I = infraOf(game, id); const L = I[track];
  const fx = `<ul class="inf-fx">${effects(game, id, track).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  let next;
  if (I.proj[track]) next = progress(game, id, track);
  else {
    const q = quote(game, id, track);
    next = q.ok ? `<h4 class="inf-h">Następny poziom: ${q.to}. ${esc(LEVELS[track][q.to - 1].name)}</h4>${offer(game, id, q, ask, `Rozbuduj do poziomu ${q.to}`)}`
      : `<p class="inf-note">${esc(q.why)}</p>`;
  }
  const seats = track === 'stadium' && !I.proj.stadium ? seatsBlock(game, id, ask) : '';
  const body = `<p class="inf-now">${esc(LEVELS[track][L - 1].name)}</p>${ladder(track, L)}${fx}${next}${seats}`;
  return panel(TRACK_NAMES[track], TONE[track], body, { count: `poziom ${L}`, cls: 'inf-card', attrs: `data-track="${track}"` });
}

/** Rozbudowa trybun: +25 % albo +50 % (do maksimum poziomu), tylko przy zapełnieniu od 85 % albo dla licencji. */
function seatsBlock(game, id, ask) {
  const cap = capacityOf(game, id);
  const room = seatRoom(game, id);
  const fill = seasonFill(game, id);
  const opts = [...new Set([Math.round(cap.full * 0.25 / 100) * 100, Math.floor(room / 100) * 100])].filter((s) => s >= 500 && s <= room).sort((a, b) => a - b);
  let body;
  if (room < 500) body = `<p class="inf-note">Stadion ma ${n0(cap.full)} miejsc, a na tym poziomie można mieć najwyżej ${n0(cap.max)}. Więcej trybun po podniesieniu standardu.</p>`;
  else {
    const qs = opts.map((s) => quote(game, id, 'stadium', { seats: s }));
    const okQ = qs.filter((q) => q.ok);
    if (!okQ.length) body = `<p class="inf-note">${esc(qs[0]?.why ?? '')} Teraz: ${pct(fill)}.</p>`;
    else {
      const chosen = okQ.find((q) => ask === `seats:${q.seats}`) ?? okQ[okQ.length - 1];
      const others = okQ.filter((q) => q !== chosen).map((q) => `<button class="btn btn--quiet btn--sm" data-act="inf-start" data-track="seats" data-seats="${q.seats}">+${n0(q.seats)} miejsc</button>`).join('');
      body = `<p class="inf-note">Średnie zapełnienie ${pct(fill)}. Koszt miejsca ${fmtZl(INFRA.SEAT_COST * stadiumMul(infraOf(game, id).stadium))} na tym poziomie, najwyżej +50 % w jednym projekcie.</p>
        ${offer(game, id, chosen, ask, `Dobuduj ${n0(chosen.seats)} miejsc`)}${others ? `<div class="inf-alt">${others}</div>` : ''}`;
    }
  }
  return `<h4 class="inf-h">Rozbudowa trybun</h4>${body}`;
}

/** Prawa kolumna: trwające inwestycje (oś czasu). */
function timeline(game, id) {
  const I = infraOf(game, id);
  const list = TRACKS.filter((t) => I.proj[t]).map((t) => ({ t, p: I.proj[t] }));
  if (!list.length) return panel('Trwające inwestycje', 'info', '<p class="tf-p__txt">Brak. Każdy obiekt może mieć jedną inwestycję naraz.</p>');
  return panel('Trwające inwestycje', 'info', `<ol class="inf-time">${list.map(({ t, p }) => {
    const done = Math.min(1, p.m / Math.max(1, p.months));
    return `<li data-track="${t}"><time>${esc(fmtDate(p.start))}</time><b>${esc(TRACK_NAMES[t])}: ${esc(p.kind === 'seats' ? `+${n0(p.seats)} miejsc` : `poziom ${p.to}`)}</b>${meter(done * 100, TONE[t])}<small>${p.m} z ${p.months} mies., koniec ok. ${esc(fmtDate(addMonths(p.start, p.months)))}</small></li>`;
  }).join('')}</ol>`, { count: list.length });
}

/** Prawa kolumna: wymogi licencyjne ligi klubu. */
function licencePanel(game, id) {
  const club = clubById(id); const I = infraOf(game, id);
  const req = LICENCE[club.tier];
  if (!req) return '';
  const cap = capacityOf(game, id).full;
  const rows = [
    ...TRACKS.filter((k) => req[k]).map((k) => [TRACK_NAMES[k], `poziom ${req[k]}`, `${I[k]}`, I[k] >= req[k]]),
    ...(req.cap ? [['Pojemność', `${n0(req.cap)} miejsc`, n0(cap), cap >= req.cap]] : []),
  ];
  const needs = licenceNeeds(game, id);
  const tone = needs.length ? 'warn' : 'good';
  const note = needs.length
    ? `<p class="tf-p__txt">Klub ma sezon na rozpoczęcie inwestycji. Potem PZPN nakłada karę ${fmtZl(INFRA.LICENCE_FINE)} co roku, dopóki inwestycja nie ruszy.</p>`
    : '<p class="tf-p__txt">Obiekty spełniają wymogi licencji.</p>';
  return panel(`Licencja: ${LEAGUE_NAMES[club.tier]}`, tone, `<table class="inf-lic"><thead><tr><th scope="col">Wymóg</th><th scope="col">Minimum</th><th scope="col">Klub</th></tr></thead><tbody>${rows.map(([k, need, have, ok]) => `<tr data-ok="${ok ? 1 : 0}"><th scope="row">${esc(k)}</th><td>${esc(need)}</td><td>${esc(have)} <span>${ok ? 'spełnia' : 'brak'}</span></td></tr>`).join('')}</tbody></table>${note}`);
}

export function infraView(game, ui = {}) {
  ensureInfra(game);
  const id = game.clubId;
  const I = infraOf(game, id);
  const c = game.finance?.clubs?.[id];
  if (!I || !c) return panel('Infrastruktura', 'info', '<p class="tf-p__txt">Brak danych o obiektach klubu.</p>');
  const cap = capacityOf(game, id);
  const upkeep = c.plan?.upkeep ?? upkeepAt(I);
  const kpis = `<div class="tf-kpis">
      ${kpi('Stadion', `${I.stadium}<em> / 10</em>`, `${esc(LEVELS.stadium[I.stadium - 1].name)}, ${n0(cap.full)} miejsc`, 'good')}
      ${kpi('Baza treningowa', `${I.training}<em> / 10</em>`, esc(LEVELS.training[I.training - 1].name), 'info')}
      ${kpi('Akademia', `${I.academy}<em> / 10</em>`, esc(LEVELS.academy[I.academy - 1].name), 'misc')}
      ${kpi('Utrzymanie obiektów', fmtZl(upkeep), `rocznie, ${fmtZl(upkeep / 12)} miesięcznie`, 'warn')}
    </div>`;
  const ask = ui.infAsk ?? null;
  const cards = TRACKS.map((t) => trackCard(game, id, t, ask)).join('');
  const side = `${timeline(game, id)}${licencePanel(game, id)}${panel('Kto płaci', 'misc', `<p class="tf-p__txt">${esc(fundingText(id))}</p>`)}`;
  return `${kpis}<div class="inf-grid"><div class="inf-main">${cards}</div><aside class="inf-side" aria-label="Inwestycje i licencja">${side}</aside></div>`;
}

function fundingText(id) {
  const who = ownerLabel(id);
  const t = { Miasto: 'Miasto finansuje stadion miejski: 100 % do poziomu 5, 85 % poziom 6, 70 % poziom 7 i rozbudowę trybun, 30 % wyżej. Do bazy treningowej dokłada 50 % (do poziomu 5) albo 30 %. Akademię klub buduje sam.',
    Właściciel: 'Bogaty właściciel dokłada do każdej inwestycji (do 50 %). Właściciel bez osobnych pieniędzy na klub nie dokłada.',
    'Spółka właściciela': 'Spółka właściciela dokłada 25 %, gdy przekazuje klubowi pieniądze na sezon.',
    'Pierwsza drużyna': 'Rezerwy korzystają z obiektów pierwszej drużyny.' }[who];
  return `${t ?? ''} Klub płaci 20 % swojej części na start, resztę w miesięcznych ratach.`;
}

/** Akcje inf-: inf-start (potwierdzenie), inf-confirm (start), inf-cancel. Zwraca { ui, save }. */
export function handleInfraAction(game, act, ds = {}) {
  const track = ds.track === 'seats' ? 'stadium' : ds.track;
  const seats = ds.track === 'seats' ? Number(ds.seats) || 0 : 0;
  if (act === 'inf-cancel') return { ui: { infAsk: null, kMsg: null } };
  if (act === 'inf-start') {
    if (!TRACKS.includes(track)) return { ui: {} };
    return { ui: { infAsk: seats ? `seats:${seats}` : track, kMsg: null } };
  }
  if (act === 'inf-confirm') {
    if (!TRACKS.includes(track)) return { ui: {} };
    ensureInfra(game);
    const r = startProject(game, game.clubId, track, { seats });
    return { ui: { infAsk: null, kMsg: r.text }, save: r.ok };
  }
  return { ui: {} };
}
