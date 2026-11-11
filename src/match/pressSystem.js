// System dnia: decyzje komisji dyscyplinarnych w sprawie słów trenera o sędziach (konferencje prasowe).
// Sprawa otwiera się po konferencji (src/match/matchday.js), decyzja przychodzi po kilku dniach:
// umorzenie, upomnienie albo kara finansowa (księga finansów, rodzaj 'fines'), lekko w dół zaufanie zarządu.
// Model i kwoty: src/match/press.js (DISCIPLINE), opis: docs/konferencja-prasowa.md, rozdz. 5.

import { registerDailySystem } from '../core/gameLoop.js';
import { createMessage } from '../core/inbox.js';
import { book } from '../career/finance.js';
import { pressState, caseDue, decideCase } from './press.js';

const zl = (n) => `${Math.round(n).toLocaleString('pl-PL')} zł`;
const fmt = (iso) => { const [y, m, d] = iso.split('-'); return `${Number(d)}.${m}.${y}`; };

/** Rozstrzyga sprawy, których termin minął. Zwraca wiadomości do poczty. Mutuje game (finanse, zarząd, prasa). */
export function resolvePressCases(game, date) {
  if (!game.press?.cases?.length) return [];
  const st = pressState(game);
  const due = st.cases.filter((c) => caseDue(c) <= date);
  if (!due.length) return [];
  const msgs = [];
  for (const c of due) {
    const d = decideCase(c, st.discipline, date, `komisja:${game.seed}`);
    if (d.amount && game.finance?.clubs?.[game.clubId]) book(game.finance, game.clubId, date, 'out', 'fines', d.amount, 'Kara: wypowiedź trenera o sędziach');
    if (game.board && d.trust) game.board.trust = Math.max(0, Math.min(100, Math.round((game.board.trust ?? 60) + d.trust)));
    st.discipline = [...st.discipline, { date, id: c.id, outcome: d.outcome, amount: d.amount, tier: c.tier }].slice(-10);
    const after = c.phase === 'pre' ? `przed meczem${c.opp ? ` z drużyną ${c.opp}` : ''}` : `po meczu${c.opp ? ` z drużyną ${c.opp}` : ''}`;
    const quote = c.quote ? ` („${c.quote}”)` : '';
    const subject = d.outcome === 'kara' ? `Kara za wypowiedź o sędziach: ${zl(d.amount)}`
      : d.outcome === 'upomnienie' ? 'Upomnienie za wypowiedź o sędziach' : 'Postępowanie w sprawie wypowiedzi umorzone';
    const body = d.outcome === 'kara'
      ? `${c.body} ukarała cię karą finansową w wysokości ${zl(d.amount)} za wypowiedź na konferencji ${after}${quote}. ${d.priors ? 'Komisja wzięła pod uwagę wcześniejsze przewinienia. ' : ''}Kwotę pokrywa klub, zapis trafił do finansów (Kary PZPN). Zarząd przyjął decyzję z niezadowoleniem.`
      : d.outcome === 'upomnienie'
        ? `${c.body} udzieliła ci upomnienia za wypowiedź na konferencji ${after}${quote}. Przy kolejnym takim przewinieniu skończy się na karze finansowej.`
        : `${c.body} uznała, że twoja wypowiedź na konferencji ${after}${quote} mieściła się w granicach dopuszczalnej krytyki. Sprawa zamknięta.`;
    msgs.push(createMessage({
      date, category: 'club', from: c.body, key: `komisja:${c.id}`, priority: d.outcome === 'kara' ? 'important' : 'info',
      subject, body: `${body}\n\nWniosek złożono ${fmt(c.date)}.`, refs: { kind: 'pressFine', outcome: d.outcome, amount: d.amount },
    }));
  }
  st.cases = st.cases.filter((c) => !due.includes(c));
  return msgs;
}

registerDailySystem({
  id: 'press-discipline', order: 62,
  run(state, date) {
    const messages = resolvePressCases(state, date);
    return messages.length ? { messages } : {};
  },
});
