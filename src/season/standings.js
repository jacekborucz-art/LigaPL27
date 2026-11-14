// Tabela ligowa liczona z rozegranych meczów (nie ma osobnego stanu, więc nie może się rozjechać).
// Kryteria (Ekstraklasa i niższe ligi): punkty, mecze bezpośrednie (punkty, bramki), bilans, bramki, zwycięstwa.

export function standings(fixtures, clubIds, { tieBreak = ['points', 'h2hPoints', 'h2hGoalDiff', 'goalDiff', 'goalsFor', 'wins'] } = {}) {
  const row = (id) => ({ id, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0, form: [] });
  const rows = new Map(clubIds.map((id) => [id, row(id)]));
  const played = fixtures.filter((f) => f.played && f.result).sort((a, b) => a.date.localeCompare(b.date));
  for (const f of played) {
    const h = rows.get(f.home); const a = rows.get(f.away);
    if (!h || !a) continue;
    const [gh, ga] = f.result.score;
    h.played++; a.played++; h.gf += gh; h.ga += ga; a.gf += ga; a.ga += gh;
    if (gh > ga) { h.wins++; a.losses++; h.points += 3; h.form.push('W'); a.form.push('P'); }
    else if (gh < ga) { a.wins++; h.losses++; a.points += 3; h.form.push('P'); a.form.push('W'); }
    else { h.draws++; a.draws++; h.points++; a.points++; h.form.push('R'); a.form.push('R'); }
  }
  const list = [...rows.values()].map((r) => ({ ...r, goalDiff: r.gf - r.ga, form: r.form.slice(-5) }));
  // Mecze bezpośrednie między drużynami z równą liczbą punktów
  const h2h = (group) => {
    const ids = new Set(group.map((r) => r.id));
    const m = new Map(group.map((r) => [r.id, { pts: 0, gd: 0 }]));
    for (const f of played) {
      if (!ids.has(f.home) || !ids.has(f.away)) continue;
      const [gh, ga] = f.result.score;
      const H = m.get(f.home); const A = m.get(f.away);
      H.gd += gh - ga; A.gd += ga - gh;
      if (gh > ga) H.pts += 3; else if (gh < ga) A.pts += 3; else { H.pts++; A.pts++; }
    }
    return m;
  };
  const byPoints = new Map();
  for (const r of list) {
    if (!byPoints.has(r.points)) byPoints.set(r.points, []);
    byPoints.get(r.points).push(r);
  }
  for (const group of byPoints.values()) {
    if (group.length < 2) continue;
    const m = h2h(group);
    for (const r of group) { r.h2hPoints = m.get(r.id).pts; r.h2hGoalDiff = m.get(r.id).gd; }
  }
  const key = (r, k) => (k === 'points' ? r.points : k === 'goalDiff' ? r.goalDiff : k === 'goalsFor' ? r.gf : k === 'wins' ? r.wins : r[k] ?? 0);
  list.sort((x, y) => {
    for (const k of tieBreak) { const d = key(y, k) - key(x, k); if (d) return d; }
    return x.id.localeCompare(y.id);
  });
  return list.map((r, i) => ({ ...r, pos: i + 1 }));
}

/** Strefy tabeli do kolorowania (awans, baraże, puchary, spadek). */
export function zonesFor(tier) {
  if (tier === 1) return [{ from: 1, to: 2, kind: 'europe-cl', label: 'Liga Mistrzów (eliminacje)' }, { from: 3, to: 4, kind: 'europe', label: 'Liga Konferencji (eliminacje)' }, { from: 16, to: 18, kind: 'down', label: 'Spadek' }];
  if (tier === 2) return [{ from: 1, to: 2, kind: 'up', label: 'Awans' }, { from: 3, to: 6, kind: 'playoff', label: 'Baraże o awans' }, { from: 16, to: 18, kind: 'down', label: 'Spadek' }];
  if (tier === 4) return [{ from: 1, to: 1, kind: 'up', label: 'Awans do 2 Ligi' }, { from: 2, to: 2, kind: 'playoff', label: 'Baraże o 2 Ligę' }, { from: 15, to: 18, kind: 'down', label: 'Spadek do IV ligi (co najmniej 4 drużyny)' }];
  return [{ from: 1, to: 2, kind: 'up', label: 'Awans' }, { from: 3, to: 6, kind: 'playoff', label: 'Baraże o awans' }, { from: 13, to: 14, kind: 'playoff-down', label: 'Baraż o utrzymanie' }, { from: 15, to: 18, kind: 'down', label: 'Spadek' }];
}
