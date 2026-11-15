// Plan przedmeczowy trenera AI (atrybut SKL, docs/trener-ai-atrybuty.md): jedenastka, ustawienie i instrukcje
// na start meczu. Średni trener (s = 0) wybiera jak dotąd: najlepsza jedenastka wg dopasowania do slotów
// i instrukcje domyślne. Dobry trener częściej dobiera plan pod rywala i własną kadrę (w silniku: krótkie podania
// przy dobrej technice, wysoki pressing na słabsze rozegranie). Słaby trener myli się w ocenie zawodników
// (losowy błąd oceny) i czasem wybiera plan, który w silniku kosztuje punkty (długie piłki, wolne tempo,
// ustawienie niepasujące do kadry). Wartości planów: pomiary [SYM] w dokumencie.

import { createTactics } from '../engine/lineup.js';
import { formationById } from '../data/formations.js';
import { proficiency, posEff } from '../engine/positions.js';
import { COACH } from '../career/coaches.js';

/** Średnia atrybutu zawodników z pola w jedenastce. */
function xiAvg(squad, xi, key) {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const xs = xi.map((id) => byId.get(id)).filter((p) => p && p.pos !== 'BR');
  return xs.length ? xs.reduce((s, p) => s + (p.attr?.[key] ?? p.ovr ?? 10), 0) / xs.length : 10;
}

/** Suma dopasowania jedenastki do slotów formacji (OVR z karą pozycji). */
function fitOf(squad, tactics) {
  const f = formationById(tactics.formation);
  const byId = new Map(squad.map((p) => [p.id, p]));
  return tactics.xi.reduce((s, id, i) => { const p = byId.get(id); return s + (p ? p.ovr * posEff(proficiency(p, f.slots[i].pos, f.slots[i].side)) : 0); }, 0);
}

/**
 * Taktyka AI na mecz. opts: { formation, benchSize, benchGk (rezerwowi bramkarze), cq (matchCoach: skl), rng (ziarno planu), oppSquad }.
 * Zwraca { tactics, plan: { kind: 'good'|'bad'|'xi'|null, text } }. Bez profilu albo przy s = 0: createTactics.
 */
export function aiPlanTactics(squad, { formation = '4231', benchSize = 12, benchGk = 1, cq = null, rng = null, oppSquad = null } = {}) {
  const s = cq?.skl ?? 0;
  const base = () => createTactics(squad, { formation, benchSize, benchGk });
  if (!s || !rng || !squad?.length) return { tactics: base(), plan: null };
  const P = COACH.plan;
  if (s < 0) {
    // Błąd w ocenie zawodników: odchylenie oceny każdego zawodnika (stałe w tym meczu), więc czasem gra słabszy
    const sd = P.xiNoise * -s;
    const seen = squad.map((p) => ({ ...p, ovr: p.ovr + rng.gauss(0, sd) }));
    let tactics = createTactics(seen, { formation, benchSize, benchGk });
    let text = 'trener postawił na zawodników w słabszej dyspozycji';
    let kind = 'xi';
    if (rng.chance(P.bad * -s)) {
      const opts = ['long', 'slow', '343'];
      const pick = opts[rng.int(0, opts.length - 1)];
      if (pick === '343') {
        const t = createTactics(seen, { formation: '343', benchSize, benchGk });
        if (fitOf(squad, t) < fitOf(squad, tactics)) { tactics = t; text = 'trener upiera się przy ustawieniu 3-4-3, choć kadra do niego nie pasuje'; kind = 'bad'; }
      } else if (pick === 'long') {
        tactics = { ...tactics, instructions: { ...tactics.instructions, passing: 'long' } }; text = 'gramy długimi piłkami do napastnika'; kind = 'bad';
      } else {
        tactics = { ...tactics, instructions: { ...tactics.instructions, tempo: 'slow' } }; text = 'gramy wolno i czekamy na błąd rywala'; kind = 'bad';
      }
    }
    return { tactics, plan: { kind, text } };
  }
  const tactics = base();
  if (!rng.chance(P.good * s)) return { tactics, plan: null };
  // Plan pod rywala: przy dobrej technice krótkie rozegranie, w innym razie wysoki pressing na rozegranie rywala
  const tec = xiAvg(squad, tactics.xi, 'TEC');
  const oppTec = oppSquad?.length ? xiAvg(oppSquad, createTactics(oppSquad, { benchSize: 0 }).xi, 'TEC') : 12;
  if (tec >= 11.8) return { tactics: { ...tactics, instructions: { ...tactics.instructions, passing: 'short' } }, plan: { kind: 'good', text: 'rozgrywamy krótkimi podaniami' } };
  if (oppTec <= tec + 0.5) return { tactics: { ...tactics, instructions: { ...tactics.instructions, pressing: 'high' } }, plan: { kind: 'good', text: 'wysoki pressing na rozegranie rywala' } };
  return { tactics, plan: null };
}
