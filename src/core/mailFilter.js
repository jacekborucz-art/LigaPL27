// Filtr skrzynki: wiadomości o rozgrywkach przychodzą tylko z ligi, w której gra klub gracza. Z innych lig i pucharów
// tylko bardzo ważne wydarzenia (np. polski klub w ćwierćfinale albo z trofeum w Europie, półfinał i finał Pucharu
// Polski). Wiadomości dotyczące klubu gracza (priorytet ważne lub pilne, z decyzją) przechodzą zawsze.
// Rodzaj wiadomości z początku klucza (m.key). Wołane w pętli dnia (src/core/gameLoop.js) przed dodaniem do skrzynki.
import { COMPETITIONS } from '../config/competitions.js';
import { clubById } from '../data/clubs_pl.js';

const userTier = (game) => game.leagueState?.tiers?.[game.clubId] ?? clubById(game.clubId)?.tier ?? 4;
const UEFA_BIG = /wygrywa|ćwierćfinał|półfinał|, finał\./; // trofeum albo awans od ćwierćfinału w górę

/** Klub z tej samej ligi co klub gracza (III liga: ta sama grupa). Trener bez klubu: nie. */
function sameLeague(game, id) {
  const c = clubById(id); const u = clubById(game.clubId);
  if (!c || !u || id === game.clubId) return false;
  return userTier(game) === c.tier && (c.tier !== 4 || c.group === u.group);
}

/** Czy wiadomość m ma trafić do skrzynki gracza. */
export function mailRelevant(game, m) {
  if (m && String(m.key ?? '').startsWith('dyrektor:')) return sameLeague(game, String(m.key).split(':')[1]); // nowy dyrektor sportowy (clubNegotiation.js)
  if (!m || m.category !== 'competitions') return true;
  if (m.priority !== 'info' || m.actions?.length) return true; // dotyczy klubu gracza albo czeka na decyzję
  const [kind, a, b] = String(m.key ?? '').split(':');
  const tier = userTier(game);
  switch (kind) {
    case 'po': { // koniec sezonu zasadniczego, baraże
      const comp = a === 'liga3' ? 'liga3' : a;
      const t = comp === 'liga3' ? 4 : COMPETITIONS[comp]?.tier;
      return t == null || t === tier;
    }
    case 'pp-draw': return a === 'SF' || a === 'F' || game.fixtures?.some((f) => f.comp === 'pp' && f.round === a && (f.home === game.clubId || f.away === game.clubId));
    case 'pp': return (game.fixtures ?? []).some((f) => f.comp === 'pp' && f.round === a && (f.home === game.clubId || f.away === game.clubId));
    case 'uefa': case 'uefa-draw': case 'uefa-results': case 'uefa-league-end': case 'europa':
      return tier === 1;
    case 'uefa-tie': return tier === 1 || UEFA_BIG.test(m.body ?? '');
    default: return true; // wyniki własnej ligi, przełożone mecze, koniec sezonu, Superpuchar Europy i inne
  }
}
