// Widok innego klubu (z tabeli i terminarzy): podstawowe informacje bez budżetu, trener i sztab, terminarz
// klubu w sezonie oraz kadra ze statystykami sezonu. Kliknięcie zawodnika otwiera jego profil (podgląd).
// Trener klubu AI: profil z atrybutami (career/coaches.js, docs/trener-ai-atrybuty.md); dokładność ocen jak
// w raportach sztabu zależy od analityka klubu gracza.

import { CLUBS_PL, LEAGUE_NAMES, clubById } from '../data/clubs_pl.js';
import { squadOf } from '../world/worldGen.js';
import { coachOf, headCoachName, coachBlurb, coachSeen, coachBand, COACH_ATTRS, COACH_KEYS, COACH_STYLES } from '../career/coaches.js';
import { GROUP } from '../career/squad.js';
import { shirtNumbers, kitColors } from '../career/shirts.js';
import { staffOf, staffQ } from '../training/staff.js';
import { STAFF_ROLES } from '../training/config.js';
import { standings } from '../season/standings.js';
import { clubFixtures, recordOf, statObj, sumStats, CLUB_GROUPS } from '../season/history.js';
import { clubFacts } from './menuView.js';
import { fixtureRowHtml } from './fixturesView.js';
import { crestHtml } from './crest.js';
import { esc, fmtDate } from './dom.js';

const clubsById = Object.fromEntries(CLUBS_PL.map((c) => [c.id, c]));
const crest = (club, size) => crestHtml(club, { size, clubsById });
const LEAGUE_COMP = { 1: 'ekstraklasa', 2: 'liga1', 3: 'liga2' };
const POS_ORDER = ['BR', 'BO', 'ŚO', 'WB', 'DP', 'ŚP', 'OP', 'SP', 'SN', 'NAP'];

/** Czy klub ma widok (polski klub z kadrą w świecie gry). */
export const hasClubView = (game, id) => !!(clubById(id) && game?.world?.clubs?.[id]);

export { headCoachName };

const plYears = (n) => `${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'lata' : 'lat'}`;

/**
 * Karta trenera: imię, styl, wiek, jedno zdanie o mocnych i słabych stronach, atrybuty z paskami. Dokładność jak
 * w raportach sztabu: analityk od 14 pokazuje liczby, 8-13 przedziały, poniżej 8 tylko słowa.
 */
export function coachCardHtml(game, clubId) {
  if (clubId === game.clubId) {
    return `<div class="clv-coach"><p class="clv-coach__name"><b>${esc(headCoachName(game, clubId))}</b><small>To ty prowadzisz drużynę.</small></p></div>`;
  }
  const c = coachOf(game, clubId);
  if (!c) return '';
  const q = staffQ(game, game.clubId, 'analityk');
  const prec = q >= 14 ? 'exact' : q >= 8 ? 'approx' : 'vague';
  const rows = COACH_KEYS.map((k) => {
    const v = c.a[k];
    const seen = coachSeen(v, q);
    const band = v >= 14 ? 'hi' : v >= 8 ? 'mid' : 'lo';
    const lo = ((seen.lo - 1) / 19) * 100; const hi = ((seen.hi - 1) / 19) * 100; const mid = ((seen.mid - 1) / 19) * 100;
    const bar = prec === 'approx'
      ? `<b style="width:${lo.toFixed(1)}%"></b><s style="left:${lo.toFixed(1)}%;width:${Math.max(4, hi - lo).toFixed(1)}%"></s>`
      : `<b style="width:${Math.max(4, mid).toFixed(1)}%"></b>`;
    return `<li class="is-${band}" title="${esc(COACH_ATTRS[k].text)}"><span>${esc(COACH_ATTRS[k].short)}</span>
      <i class="clv-bar" role="img" aria-label="${esc(`${COACH_ATTRS[k].name}: ${prec === 'vague' ? coachBand(v) : `${seen.text} na 20`}`)}">${bar}</i><em>${esc(seen.text)}</em></li>`;
  }).join('');
  const since = c.since && c.n ? `, w klubie od ${fmtDate(c.since)}` : '';
  const note = prec === 'exact' ? 'Oceny od analityka wideo (skala 1-20).' : prec === 'approx' ? 'Oceny przybliżone: lepszy analityk wideo poda dokładne liczby.' : 'Analityk wideo ocenia trenera tylko ogólnie.';
  return `<div class="clv-coach">
    <p class="clv-coach__name"><b>${esc(c.name)}</b><small>styl: ${esc(COACH_STYLES[c.style] ?? 'pragmatyczny')}, ${esc(plYears(c.age))}${esc(since)}</small></p>
    <p class="clv-coach__blurb">${esc(coachBlurb(c))}</p>
    <ul class="clv-attrs clv-attrs--${prec}">${rows}</ul>
    <p class="hint clv-coach__note">${esc(note)}</p>
  </div>`;
}

const RES_WORD = { W: 'wygrana', R: 'remis', P: 'porażka' };
const plural = (n, a, b, c) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

/** Seria z ostatnich meczów, np. „3 mecze bez porażki” albo „2 porażki z rzędu”. */
function streakText(played) {
  if (!played.length) return 'Drużyna nie rozegrała jeszcze meczu w tym sezonie.';
  const rev = [...played].reverse();
  const run = (ok) => { let n = 0; for (const r of rev) { if (!ok(r)) break; n++; } return n; };
  const w = run((r) => r.res === 'W'); const unbeaten = run((r) => r.res !== 'P'); const l = run((r) => r.res === 'P'); const nowin = run((r) => r.res !== 'W');
  if (w >= 2) return `${w} ${plural(w, 'wygrana', 'wygrane', 'wygranych')} z rzędu.`;
  if (unbeaten >= 3) return `${unbeaten} ${plural(unbeaten, 'mecz', 'mecze', 'meczów')} bez porażki.`;
  if (l >= 2) return `${l} ${plural(l, 'porażka', 'porażki', 'porażek')} z rzędu.`;
  if (nowin >= 3) return `${nowin} ${plural(nowin, 'mecz', 'mecze', 'meczów')} bez zwycięstwa.`;
  return `Ostatni mecz: ${RES_WORD[rev[0].res]}.`;
}

/** Kluczowi zawodnicy (do 3): najlepszy strzelec, najwyższa średnia ocen, najwyższa ocena ogólna. */
function keyPlayers(squad) {
  const withS = squad.map((p) => ({ p, s: seasonLine(p) }));
  const picks = [];
  const add = (x, why) => { if (x && !picks.some((y) => y.p.id === x.p.id)) picks.push({ ...x, why }); };
  const scorer = withS.filter((x) => x.s.g > 0).sort((a, b) => b.s.g - a.s.g || b.p.ovr - a.p.ovr)[0];
  add(scorer, scorer ? `${scorer.s.g} ${plural(scorer.s.g, 'gol', 'gole', 'goli')} w sezonie` : '');
  const rated = withS.filter((x) => x.s.apps >= 3 && x.s.avg != null).sort((a, b) => b.s.avg - a.s.avg)[0];
  add(rated, rated ? `średnia ocen ${rated.s.avg.toFixed(2)}` : '');
  for (const x of [...withS].sort((a, b) => b.p.ovr - a.p.ovr)) { if (picks.length >= 3) break; add(x, `ocena ogólna ${Math.round(x.p.ovr)}`); }
  return picks.slice(0, 3);
}

/** Absencje: kontuzje (z liczbą dni) i pauzy za kartki. */
function absences(squad) {
  const out = [];
  for (const p of squad) {
    if (p.injuryDays > 0) out.push({ p, kind: 'inj', text: `${p.injury?.name ?? 'uraz'}, ok. ${p.injuryDays} ${plural(p.injuryDays, 'dzień', 'dni', 'dni')}` });
    const games = Math.max(p.suspended ?? 0, ...Object.values(p.susp ?? {}).map(Number).filter(Number.isFinite), 0);
    if (games > 0) out.push({ p, kind: 'sus', text: `pauza za kartki, ${games} ${plural(games, 'mecz', 'mecze', 'meczów')}` });
  }
  return out;
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
      <div><dt>Siła kadry</dt><dd>${esc(facts.strength)}</dd></div>
      ${facts.europe ? `<div><dt>Puchary</dt><dd>${esc(facts.europe.comp)}</dd></div>` : ''}
      <div><dt>Stadion</dt><dd>${facts.cap ? `${facts.cap.toLocaleString('pl-PL')} miejsc${facts.capEst ? ' (szacunek)' : ''}` : 'brak danych'}</dd></div>
      <div><dt>Frekwencja</dt><dd>${facts.att ? `średnio ${Math.round(facts.att).toLocaleString('pl-PL')}${facts.attEst ? ' (szacunek)' : ''}` : 'brak danych'}</dd></div>
      ${facts.owner ? `<div><dt>Właściciel</dt><dd>${esc(facts.owner)}${facts.ownerType ? `<small>${esc(facts.ownerType)}</small>` : ''}</dd></div>` : ''}
      ${facts.rivals?.length ? `<div><dt>Rywale</dt><dd>${facts.rivals.map((r) => esc(r.c.name)).join(', ')}</dd></div>` : ''}
    </dl>
    <h3>Trener</h3>
    ${coachCardHtml(game, clubId)}
    <h3>Sztab szkoleniowy</h3>
    <ul class="clv-staff">${Object.keys(STAFF_ROLES).map((role) => staff[role]?.name ? `<li><span>${esc(STAFF_ROLES[role].name)}</span><b>${esc(staff[role].name)}</b></li>` : '').join('') || '<li class="hint">Brak danych o sztabie.</li>'}</ul>
  </section>`;

  const played = rows.filter((r) => r.played);
  const last = played.slice(-5);
  const lr = recordOf(last);
  const formP = `<section class="clv-p clv-p--form"><h3>Forma</h3>
    <p class="clv-streak">${esc(streakText(played))}</p>
    ${last.length ? `<p class="clv-sum">Ostatnie ${last.length} ${plural(last.length, 'mecz', 'mecze', 'meczów')}: ${lr.w}W ${lr.d}R ${lr.l}P, bramki ${lr.gf}:${lr.ga}</p>
    <ol class="clv-last">${[...last].reverse().map((r) => `<li><b class="fchip fchip--${r.res}">${r.res}</b><span>${r.home ? 'u siebie' : r.venue === 'N' ? 'neutralnie' : 'wyjazd'}: ${esc(clubById(r.opp)?.name ?? r.opp)}</span><b class="clv-sc">${r.gf}:${r.ga}</b></li>`).join('')}</ol>` : ''}
  </section>`;
  const keys = keyPlayers(squad);
  const keyP = `<section class="clv-p clv-p--key"><h3>Kluczowi zawodnicy</h3>
    <ol class="clv-keys">${keys.map(({ p, s, why }) => `<li data-pid="${esc(p.id)}"><span class="pos" data-g="${GROUP[p.pos] ?? 'MID'}">${esc(p.pos)}</span>
      <span class="clv-keys__n"><button class="clv-pl" data-act="extplayer" data-id="${esc(p.id)}">${esc(p.name)}</button><small>${esc(why)}${s.apps ? `, ${s.apps} ${plural(s.apps, 'mecz', 'mecze', 'meczów')}` : ''}${p.injuryDays > 0 ? `. <span class="clv-out">Kontuzja, ok. ${p.injuryDays} ${plural(p.injuryDays, 'dzień', 'dni', 'dni')}</span>` : (p.suspended > 0 || Object.values(p.susp ?? {}).some((v) => v > 0)) ? '. <span class="clv-out">Pauza za kartki</span>' : ''}</small></span>
      <b class="clv-keys__o" title="Ocena ogólna 1-20">${Math.round(p.ovr)}</b></li>`).join('')}</ol>
  </section>`;
  const abs = absences(squad);
  const absP = `<section class="clv-p clv-p--abs"><h3>Absencje <small>${abs.length ? `${abs.length} ${plural(abs.length, 'zawodnik', 'zawodników', 'zawodników')}` : ''}</small></h3>
    ${abs.length ? `<ul class="clv-abs">${abs.map(({ p, kind, text }) => `<li class="is-${kind}" data-pid="${esc(p.id)}"><i class="clv-${kind === 'inj' ? 'inj' : 'sus'}" aria-hidden="true">${kind === 'inj' ? '+' : ''}</i><button class="clv-pl" data-act="extplayer" data-id="${esc(p.id)}">${esc(p.name)}</button><small>${esc(p.pos)}, ${esc(text)}</small></li>`).join('')}</ul>` : '<p class="hint">Wszyscy zawodnicy są do dyspozycji.</p>'}
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
    <div class="clv__top">${formP}${keyP}${absP}</div>
    <div class="clv__grid">${sq}${fx}${info}</div>
  </div>`;
}
