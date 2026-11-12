// Widok innego klubu (z tabeli i terminarzy): podstawowe informacje bez budżetu, trener i sztab, terminarz
// klubu w sezonie oraz kadra ze statystykami sezonu. Kliknięcie zawodnika otwiera jego profil (podgląd).

import { Rng } from '../core/rng.js';
import { CLUBS_PL, LEAGUE_NAMES, clubById } from '../data/clubs_pl.js';
import { randomName } from '../data/names.js';
import { squadOf } from '../world/worldGen.js';
import { GROUP } from '../career/squad.js';
import { shirtNumbers, kitColors } from '../career/shirts.js';
import { staffOf } from '../training/staff.js';
import { STAFF_ROLES } from '../training/config.js';
import { standings } from '../season/standings.js';
import { clubFixtures, recordOf, statObj, sumStats, CLUB_GROUPS } from '../season/history.js';
import { clubFacts } from './menuView.js';
import { fixtureRowHtml } from './fixturesView.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate } from './dom.js';

const clubsById = Object.fromEntries(CLUBS_PL.map((c) => [c.id, c]));
const crest = (club, size) => crestHtml(club, { size, clubsById });
const COACH_TYPE = { O: 'ofensywny', S: 'ostrożny', P: 'pragmatyczny' };
const LEAGUE_COMP = { 1: 'ekstraklasa', 2: 'liga1', 3: 'liga2' };
const POS_ORDER = ['BR', 'BO', 'ŚO', 'WB', 'DP', 'ŚP', 'OP', 'SP', 'SN', 'NAP'];

/** Czy klub ma widok (polski klub z kadrą w świecie gry). */
export const hasClubView = (game, id) => !!(clubById(id) && game?.world?.clubs?.[id]);

/** Trener prowadzący klubu AI: stałe imię i nazwisko z ziarna gry (w klubie gracza: profil gracza). */
export function headCoachName(game, clubId) {
  if (clubId === game.clubId) {
    const pr = game.manager?.profile;
    return pr ? `${pr.firstName} ${pr.lastName}` : 'Ty';
  }
  const n = randomName('POL', new Rng(`trener-glowny:${game.seed}:${clubId}`));
  return `${n.first} ${n.last}`;
}

function seasonLine(p) {
  const st = sumStats(CLUB_GROUPS.map((g) => p.st?.[g]).filter(Boolean));
  return statObj(st);
}

export function renderClubView(game, clubId) {
  const club = clubById(clubId);
  if (!club) return '<p>Brak danych o klubie.</p>';
  const facts = clubFacts(club);
  const kit = kitColors(club);
  const comp = LEAGUE_COMP[club.tier];
  const ids = CLUBS_PL.filter((c) => c.tier === club.tier && !c.parent).map((c) => c.id);
  const table = comp ? standings((game.fixtures ?? []).filter((f) => f.comp === comp), ids) : [];
  const row = table.find((r) => r.id === clubId);
  const rows = clubFixtures(game, clubId);
  const rec = recordOf(rows);
  const form = rows.filter((r) => r.played).slice(-5);
  const squad = [...squadOf(game.world, clubId)].sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || b.ovr - a.ovr);
  const nums = shirtNumbers(game, clubId, squad);
  const staff = staffOf(game, clubId);
  const mine = clubId === game.clubId;

  const head = `<header class="clv__head" style="--kit:${kit.shirt};--kit-ink:${kit.ink}">
    ${crest(club, 72)}
    <div class="clv__title">
      <h2>${esc(club.name)}</h2>
      <p>${esc(LEAGUE_NAMES[club.tier] ?? '')}${row ? `, ${row.pos}. miejsce, ${row.points} pkt` : ''}${rec.n ? `. Bilans: ${rec.w}W ${rec.d}R ${rec.l}P, bramki ${rec.gf}:${rec.ga}` : ''}</p>
      ${form.length ? `<p class="clv__form" aria-label="Forma: ostatnie mecze">${form.map((r) => `<b class="fchip fchip--${r.res}" title="${esc(`${fmtDate(r.d)}, ${r.gf}:${r.ga}`)}">${r.res}</b>`).join('')}</p>` : ''}
    </div>
  </header>`;

  const info = `<section class="clv-p clv-p--info"><h3>O klubie</h3>
    <dl class="clv-dl">
      <div><dt>Trener</dt><dd>${esc(headCoachName(game, clubId))}${mine ? '' : `<small>styl: ${esc(COACH_TYPE[club.coach] ?? 'zrównoważony')}</small>`}</dd></div>
      <div><dt>Siła kadry</dt><dd>${esc(facts.strength)}</dd></div>
      ${facts.europe ? `<div><dt>Puchary</dt><dd>${esc(facts.europe.comp)}</dd></div>` : ''}
      <div><dt>Stadion</dt><dd>${facts.cap ? `${facts.cap.toLocaleString('pl-PL')} miejsc${facts.capEst ? ' (szacunek)' : ''}` : 'brak danych'}</dd></div>
      <div><dt>Frekwencja</dt><dd>${facts.att ? `średnio ${Math.round(facts.att).toLocaleString('pl-PL')}${facts.attEst ? ' (szacunek)' : ''}` : 'brak danych'}</dd></div>
      ${facts.owner ? `<div><dt>Właściciel</dt><dd>${esc(facts.owner)}${facts.ownerType ? `<small>${esc(facts.ownerType)}</small>` : ''}</dd></div>` : ''}
      ${facts.rivals?.length ? `<div><dt>Rywale</dt><dd>${facts.rivals.map((r) => esc(r.c.name)).join(', ')}</dd></div>` : ''}
    </dl>
    <h3>Sztab szkoleniowy</h3>
    <ul class="clv-staff">${Object.keys(STAFF_ROLES).map((role) => staff[role]?.name ? `<li><span>${esc(STAFF_ROLES[role].name)}</span><b>${esc(staff[role].name)}</b></li>` : '').join('') || '<li class="hint">Brak danych o sztabie.</li>'}</ul>
  </section>`;

  const fx = `<section class="clv-p clv-p--fx"><h3>Terminarz sezonu <small>${rows.length} ${rows.length === 1 ? 'mecz' : 'meczów'}</small></h3>
    <ol class="fxc fxc--clv">${rows.map((r) => fixtureRowHtml(r, { today: game.date })).join('') || '<li class="hint">Brak meczów w terminarzu.</li>'}</ol>
  </section>`;

  const sq = `<section class="clv-p clv-p--squad"><h3>Kadra <small>${squad.length} zawodników, statystyki sezonu (mecze o punkty)</small></h3>
    <table class="clv-sq">
      <thead><tr><th>#</th><th>Poz.</th><th class="l">Zawodnik</th><th title="Wiek">Wiek</th><th title="Ocena ogólna 1-20">Ocena</th><th title="Mecze">M</th><th title="Gole">G</th><th title="Asysty">A</th><th title="Średnia ocena w meczach">Śr.</th></tr></thead>
      <tbody>${squad.map((p) => {
        const s = seasonLine(p);
        const out = p.injuryDays > 0 ? ' <i class="clv-inj" title="Kontuzja">+</i>' : p.suspended > 0 ? ' <i class="clv-sus" title="Pauza za kartki"></i>' : '';
        return `<tr data-pid="${esc(p.id)}">
          <td class="n">${nums.get(p.id) ?? ''}</td>
          <td><span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span></td>
          <td class="l"><button class="clv-pl" data-act="extplayer" data-id="${esc(p.id)}">${esc(p.name)}</button>${out}</td>
          <td>${p.age}</td><td><b>${Math.round(p.ovr)}</b></td>
          <td>${s.apps}</td><td>${s.g}</td><td>${s.a}</td><td>${s.avg != null ? s.avg.toFixed(2) : '-'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </section>`;

  return `<div class="clv">
    <button class="btn btn--quiet" data-act="clubback">Wróć</button>
    ${head}
    <div class="clv__grid">${sq}${fx}${info}</div>
  </div>`;
}
