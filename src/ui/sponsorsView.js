// Sponsorzy klubu (zakładka Klub > Sponsorzy): umowy, oferty w trzech wariantach, premie i historia zdarzeń.
// Model umów: src/career/sponsors.js, docs/finanse.md (rozdz. Sponsorzy). Akcje: sp-pick (wybór wariantu oferty).
import { esc, fmtDate, fmtDay } from './dom.js';
import { kpi, panel, meter } from './transfersView.js';
import { fmtZl } from '../career/transfers.js';
import { SEASON_YEAR } from '../config/calendar2026.js';
import { sponsorSummary, signOffer, SLOT_NAMES, VARIANT_NAMES, BONUS_NAMES, yearsWord, bonusText } from '../career/sponsors.js';

const pct = (x) => `${Math.round(x * 100)} %`;
const seasonsLeft = (c) => Math.max(0, Number(c.end.slice(0, 4)) - SEASON_YEAR);

function clauses(c) {
  const out = [];
  const b = Object.entries(c.bonuses ?? {}).filter(([, v]) => v);
  if (b.length) out.push(`Premie: ${b.map(([k, v]) => `${BONUS_NAMES[k]} ${fmtZl(v)}`).join(', ')}`);
  if (c.growth) out.push(`Co roku +${pct(c.growth)}`);
  if (c.slot === 'main' || c.slot === 'sleeve') out.push('Awans: +50 %');
  if (c.relegation) out.push(`Spadek: ${c.relegation.terminate ? `obniżka ${pct(c.relegation.cut)} albo zerwanie` : `obniżka ${pct(c.relegation.cut)}`}`);
  if (c.slot === 'partners') out.push('Odnawia się co lipiec');
  return out;
}

function contractRow(c, total) {
  const left = seasonsLeft(c);
  const tone = c.slot === 'partners' ? 'info' : left <= 1 ? 'warn' : 'good';
  return `<li class="sp-c" data-t="${tone}">
      <div class="sp-c__head"><span><small>${esc(SLOT_NAMES[c.slot] ?? c.slot)}</small><b>${esc(c.name)}</b><small>${esc(c.industry)}</small></span>
        <span class="sp-c__money"><b>${fmtZl(c.annual)}</b><small>rocznie</small></span></div>
      ${meter((c.annual / Math.max(1, total)) * 100, tone)}
      <p class="sp-c__meta"><span class="tf-tag" data-k="${tone}">${esc(VARIANT_NAMES[c.variant] ?? c.variant)}</span>
        <span>do ${esc(fmtDate(c.end))}${c.slot === 'partners' ? '' : `, ${left ? `${left} ${left === 1 ? 'sezon' : left <= 4 ? 'sezony' : 'sezonów'} do końca` : 'ostatni sezon'}`}</span></p>
      <p class="sp-c__cl">${clauses(c).map((x) => esc(x)).join('<br>')}</p>
    </li>`;
}

function variantCard(o, k) {
  const v = o.variants[k];
  return `<div class="sp-v" data-v="${k}">
      <h4>${esc(VARIANT_NAMES[k])}</h4>
      <b class="sp-v__sum">${fmtZl(v.annual)}</b><small>rocznie, ${v.years} ${yearsWord(v.years)}</small>
      <ul>
        <li>Premie: ${esc(bonusText(v.bonuses))}</li>
        ${v.growth ? `<li>Co roku +${pct(v.growth)}</li>` : ''}
        <li>Spadek: ${v.relegation.terminate ? `obniżka ${pct(v.relegation.cut)} albo zerwanie` : `obniżka ${pct(v.relegation.cut)}`}</li>
      </ul>
      <button class="btn ${k === 'fixed' ? 'btn--quiet' : 'btn--primary'} btn--sm" data-act="sp-pick" data-o="${esc(o.id)}" data-v="${k}">Wybierz</button>
    </div>`;
}

function offerBlock(o) {
  return `<article class="sp-o">
      <p class="sp-o__head"><small>${esc(SLOT_NAMES[o.slot] ?? o.slot)}</small><b>${esc(o.name)}</b><small>${esc(o.industry)}. ${esc(o.reason)} Ważna do ${esc(fmtDate(o.expires))}.</small></p>
      <div class="sp-vars">${['fixed', 'bonus', 'long'].map((k) => variantCard(o, k)).join('')}</div>
    </article>`;
}

export function sponsorsView(game) {
  const s = sponsorSummary(game);
  if (!s) return panel('Sponsorzy', 'info', '<p class="tf-p__txt">Umowy sponsorskie pojawią się po starcie sezonu.</p>');
  const nextLeft = s.next ? seasonsLeft(s.next) : null;
  const diff = s.total - s.pool;
  const kpis = `<div class="tf-kpis">
      ${kpi('Suma umów rocznie', fmtZl(s.total), `${diff >= 0 ? '+' : ''}${fmtZl(diff)} wobec planu ${fmtZl(s.pool)}`, diff < -s.pool * 0.1 ? 'warn' : 'good')}
      ${kpi('Główny sponsor', `<span class="tf-kpi__txt">${esc(s.main?.name ?? 'brak')}</span>`, s.main ? `${fmtZl(s.main.annual)} rocznie, do ${esc(fmtDate(s.main.end))}` : 'miejsce wolne', s.main ? 'info' : 'bad')}
      ${kpi('Premie w sezonie', fmtZl(s.bonusSeason), 'za wyniki z umów z premiami', s.bonusSeason ? 'good' : 'misc')}
      ${kpi('Najbliższe wygaśnięcie', `<span class="tf-kpi__txt">${s.next ? esc(fmtDate(s.next.end)) : 'brak'}</span>`, s.next ? esc(`${SLOT_NAMES[s.next.slot]}: ${s.next.name}`) : '', nextLeft != null && nextLeft <= 1 ? 'warn' : 'info')}
    </div>`;
  const list = s.contracts.length ? `<ul class="sp-list">${s.contracts.map((c) => contractRow(c, s.total)).join('')}</ul>` : '<p class="tf-p__txt">Brak umów.</p>';
  const offers = s.offers.length ? s.offers.map(offerBlock).join('')
    : '<p class="tf-p__txt">Brak ofert. Oferty przychodzą, gdy umowa wygasa (lipiec), po awansie, zerwaniu umowy, awansie do pucharów i po trofeum. Na wybór masz 14 dni, potem zarząd podpisuje wariant ze stałą kwotą.</p>';
  const log = `<ul class="tf-log">${s.log.slice(0, 15).map((l) => `<li><time>${esc(fmtDay(l.date))}</time><span>${esc(l.text)}</span>${l.amount != null ? `<b data-k="in">+${fmtZl(l.amount)}</b>` : '<b></b>'}</li>`).join('') || '<li><span>Brak zdarzeń.</span><b></b></li>'}</ul>`;
  return `${kpis}
    <div class="sp-grid">
      <div class="tf-stack">${panel('Umowy sponsorskie', 'good', list, { count: s.contracts.length })}</div>
      <div class="tf-stack sp-side">
        ${panel('Oferty sponsorów', s.offers.length ? 'warn' : 'info', offers, { count: s.offers.length || null })}
        ${panel('Historia', 'misc', log)}
      </div>
    </div>`;
}

/** Akcje zakładki Sponsorzy (prefiks sp-). Zwraca { ui, save }. */
export function handleSponsorAction(game, act, ds = {}) {
  if (act === 'sp-pick') {
    const c = signOffer(game, game.clubId, ds.o, ds.v, game.date);
    if (!c) return { ui: { kMsg: 'Ta oferta jest już nieaktualna.' } };
    return { ui: { kMsg: `Podpisano umowę: ${c.name}, ${fmtZl(c.annual)} rocznie do ${fmtDate(c.end)}.` }, save: true };
  }
  return { ui: {} };
}
