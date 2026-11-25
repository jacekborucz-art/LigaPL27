// Klub, Finanse: panel „Właściciel i zaległości” (docs/wlasciciele-i-dlugi.md). Właściciel (typ, jedno zdanie),
// dopłata i rezerwa w tym sezonie, pieniądze od właściciela w 3 sezonach, ryzyko zmiany właściciela słownie,
// stan zaległości wobec zawodników (pasek miesięcy, termin wezwań, zakaz transferowy, kary punktowe).
// Pomocnicze panel i meter przychodzą z widoku finansów (bez importu cyklicznego).

import { esc, fmtDate } from './dom.js';
import { ownerOf, ownerBlurb, OWNER_TYPES } from '../career/owners.js';
import { ownerData, leaveRisk } from '../career/ownership.js';
import { arrearsOf, monthlyCost, DEBT } from '../career/arrears.js';
import { compOfClub } from '../season/leagueComps.js';
import { clubById } from '../data/clubs_pl.js';
import { SEASON } from '../config/calendar2026.js';

const mln = (v) => `${(Math.round((v ?? 0) / 100000) / 10).toLocaleString('pl-PL')} mln zł`;
const monthsWord = (n) => `${n} ${n === 1 ? 'miesiąc' : n >= 2 && n <= 4 ? 'miesiące' : 'miesięcy'}`;
const RISK_TONE = { niskie: 'good', podwyższone: 'warn', wysokie: 'bad' };

/** Panel właściciela i zaległości klubu gracza. h: { panel, meter } z transfersView.js. */
export function ownerDebtPanel(game, c, h) {
  const id = game.clubId;
  if (!id || !c) return '';
  const o = game.world?.clubs?.[id] ? ownerOf(game, id) : null;
  const d = ownerData(game, id);
  const plan = c.plan ?? {};
  const type = d.withdrawn ? 'miasto bez dotacji' : OWNER_TYPES[o?.type ?? d.type]?.label ?? '';
  const pct = plan.ownerMul ? Math.round((plan.ownerMul - 1) * 100) : 0;
  const hist = (c.history ?? []).slice(-2).map((x) => [x.season, x.in?.owner ?? 0]);
  const trend = [...hist.map(([s, v]) => `${s}: ${mln(v)}`), `${SEASON}: ${mln(plan.owner ?? 0)} (plan)`].join(', ');
  const risk = leaveRisk(game, id);
  const riskLabel = risk.city && !d.withdrawn ? 'Ryzyko wycofania wsparcia' : d.withdrawn ? 'Szansa na inwestora' : 'Ryzyko zmiany właściciela';
  const riskText = d.withdrawn ? `ok. ${Math.round(risk.p * 100)} % na sezon` : risk.word === 'brak' ? 'brak (pierwsza drużyna)' : `${risk.word}${risk.poor ? ', po słabych sezonach' : ''}`;
  const rows = [
    ['Dopłata w sezonie', `${mln(plan.owner)}${pct ? ` (${pct > 0 ? '+' : ''}${pct} % zwykłej kwoty)` : ''}`],
    ['Rezerwa na start', plan.skarbiec ? mln(plan.skarbiec) : 'brak'],
    ['Pieniądze od właściciela', trend],
    [riskLabel, riskText],
  ];
  const s = arrearsOf(game, id);
  const cost = monthlyCost(game, id);
  const pts = game.season?.deductions?.[compOfClub(clubById(id))]?.[id] ?? 0;
  let debt;
  let tone = 'info';
  if (s?.months > 0) {
    tone = 'bad';
    const lines = [
      `Zaległości w pensjach: ${monthsWord(s.months)}.`,
      s.deadline ? (game.date <= s.deadline ? `Zawodnicy wezwali klub do zapłaty: termin ${fmtDate(s.deadline)}.` : 'Termin wezwań minął: zawodnicy mogą rozwiązywać kontrakty (16. dnia miesiąca).') : 'Od 2. miesiąca: wezwania zawodników i zakaz transferowy.',
      s.ban ? 'Zakaz transferowy do spłaty zaległości.' : '',
      `Spłata: saldo co najmniej zero (teraz ${mln(c.balance)}).`,
    ].filter(Boolean);
    debt = `<div class="tf-arrears" role="status"><p class="tf-p__txt"><b>${esc(lines[0])}</b></p>${h.meter(Math.min(100, (s.months / DEBT.pointsFrom) * 100), 'bad')}<p class="tf-p__txt">${esc(lines.slice(1).join(' '))}</p></div>`;
  } else if (c.balance < 0) {
    tone = c.balance < -DEBT.warn * cost ? 'warn' : 'info';
    debt = `<p class="tf-p__txt">${esc(`Saldo ujemne (${mln(c.balance)}). Zaległości wobec zawodników zaczną się, gdy dług przekroczy miesięczne koszty (${mln(cost)}) przez 2 miesiące z rzędu.`)}</p>`;
  } else debt = '<p class="tf-p__txt">Pensje wypłacane w terminie, bez zaległości.</p>';
  const ptsLine = pts ? `<p class="tf-p__txt">${esc(`Kara w tabeli w sezonie ${SEASON}: minus ${pts} pkt.`)}</p>` : '';
  return h.panel('Właściciel i zaległości', tone, `<p class="tf-p__txt"><b>${esc(d.name || o?.name || 'Właściciel')}</b>${type ? `, ${esc(type)}` : ''}</p>
    ${o && !d.withdrawn ? `<p class="tf-p__txt">${esc(ownerBlurb(o))}</p>` : ''}
    <dl class="tf-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd${k === riskLabel && RISK_TONE[risk.word] ? ` data-t="${RISK_TONE[risk.word]}"` : ''}>${esc(v)}</dd></div>`).join('')}</dl>
    ${debt}${ptsLine}`, { cls: 'tf-owner' });
}
