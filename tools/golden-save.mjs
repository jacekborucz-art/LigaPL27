// Zapis złotych skrótów silnika (tests/enginePipeline.golden.json) po ŚWIADOMEJ zmianie liczb silnika
// (balans, nowy czynnik, scalenie zmian). Użycie: node tools/golden-save.mjs "opis zmiany". Opisz zmianę w docs/dziennik.md.
import fs from 'node:fs';
import { goldenMatch, matchDigest, ratingDigests, quickDigests, seasonDigest, h32, N_MATCHES } from '../tests/pipelineGolden.mjs';

const file = new URL('../tests/enginePipeline.golden.json', import.meta.url);
const old = JSON.parse(fs.readFileSync(file, 'utf8'));
const matches = [];
for (let i = 0; i < N_MATCHES; i++) { const d = matchDigest(goldenMatch(i)); matches.push(`${h32(d)} ${d.split('|')[2]}`); }
// Kolejność jak w tests/enginePipeline.test.mjs: mecze, siła i mecze w tle, na końcu sezon (sezon ustawia aktywną grę,
// która zmienia modyfikatory siły drużyn)
const ratings = h32(ratingDigests().join('|'));
const quick = h32(quickDigests().join('|'));
const s = seasonDigest();
const out = {
  note: process.argv[2] ?? old.note,
  matches, ratings, quick,
  season: { hash: h32(JSON.stringify(s)), played: s.played, date: s.date },
};
const changed = ['ratings', 'quick'].filter((k) => out[k] !== old[k]);
const nm = matches.filter((m, i) => m !== old.matches[i]).length;
fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
console.log(`Zapisano. Zmienione mecze: ${nm}/${N_MATCHES}; ${changed.join(', ') || 'siła i mecze w tle bez zmian'}; sezon ${old.season.hash} -> ${out.season.hash}`);
