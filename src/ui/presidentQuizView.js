// Okno rozmowy z prezesem (prośba „Poproś o zmianę dyrektora”, Klub > Zarząd). Logika: src/career/presidentQuiz.js.
// Okno <dialog id="pqDlg"> otwiera i zamyka app.js (showQuiz); Esc albo „Anuluj” przed decyzją = prośba niezłożona.
// Kliknięcia: data-act „pq-ans” (odpowiedź, data-k), „pq-finish” (decyzja zarządu), „pq-close”. Teksty przez esc().

import { esc } from './dom.js';
import { quizQuestion, quizContext } from '../career/presidentQuiz.js';
import { VERDICT_LABELS } from '../career/boardRequests.js';

export const isQuizAction = (act) => typeof act === 'string' && act.startsWith('pq-');
const TONE_NOTE = { calm: 'spokojny, rzeczowy', hot: 'porywczy, mówi wprost', biz: 'biznesowy, liczy koszty' };
const VERDICT_TONE = { yes: 'good', cond: 'warn', no: 'bad' };

const bubble = (who, name, text, cls = '') => `<div class="pq-msg pq-msg--${who}${cls ? ` ${cls}` : ''}"><span class="pq-msg__who">${esc(name)}</span><p>${esc(text)}</p></div>`;

/** Zawartość okna rozmowy (HTML do <dialog>). */
export function quizHtml(game, quiz) {
  if (!quiz) return '';
  const ctx = quizContext(game, quiz.date);
  const boss = quiz.owner ?? ctx.o?.name ?? 'Prezes';
  const total = quiz.qs.length;
  const done = quiz.picks.length;
  const steps = `<ol class="pq-steps" aria-label="Postęp rozmowy">${quiz.qs.map((_, i) => `<li data-s="${i < done ? 'done' : i === done && quiz.step === 'ask' ? 'now' : 'next'}"></li>`).join('')}</ol>`;
  let body = '';
  for (const p of quiz.picks) body += bubble('boss', 'Prezes', p.ask) + bubble('me', 'Ty', p.text) + bubble('boss', 'Prezes', p.reaction, 'pq-msg--react');
  let foot = '';
  if (quiz.step === 'ask') {
    const q = quizQuestion(game, quiz, ctx);
    body += bubble('boss', 'Prezes', q.ask, 'pq-msg--q');
    body += `<h3 class="pq-h" id="pq-q">Twoja odpowiedź</h3><div class="pq-answers" role="group" aria-labelledby="pq-q">${q.answers.map((a, i) => `<button class="pq-ans" data-act="pq-ans" data-k="${a.k}"><span class="pq-ans__n" aria-hidden="true">${i + 1}</span><span>${esc(a.text)}</span></button>`).join('')}</div>`;
    foot = '<button class="btn btn--quiet btn--sm" data-act="pq-close">Anuluj prośbę</button>';
  } else if (quiz.step === 'end') {
    body += '<p class="pq-note">Prezes zamyka notes. Zarząd podejmie decyzję od razu.</p>';
    foot = '<button class="btn btn--quiet btn--sm" data-act="pq-close">Anuluj prośbę</button><button class="btn btn--primary btn--sm pq-go" data-act="pq-finish">Poznaj decyzję zarządu</button>';
  } else if (quiz.result) {
    const r = quiz.result;
    if (r.say) body += bubble('boss', 'Prezes', r.say, 'pq-msg--verdict');
    body += `<div class="pq-out" data-k="${VERDICT_TONE[r.verdict] ?? 'info'}"><b>${esc(r.failed ? 'Prośba niezłożona' : VERDICT_LABELS[r.verdict] ?? '')}</b><p>${esc(r.text)}</p>${r.failed ? '' : '<small>Szczegóły w liście zarządu w Poczcie.</small>'}</div>`;
    foot = '<button class="btn btn--primary btn--sm pq-go" data-act="pq-close">Zamknij</button>';
  }
  return `<div class="pq">
    <header class="pq-head"><div><h2 id="pqTitle" tabindex="-1">Rozmowa z prezesem</h2><p>${esc(boss)}, ${esc(TONE_NOTE[quiz.tone] ?? '')}. Temat: zmiana dyrektora sportowego.</p></div>
      <button class="pq-x" data-act="pq-close" aria-label="Zamknij rozmowę">×</button></header>
    ${steps}
    <div class="pq-body" aria-live="polite">${body}</div>
    <footer class="pq-foot">${quiz.step === 'ask' ? `<span class="pq-count">Pytanie ${Math.min(done + 1, total)} z ${total}</span>` : ''}${foot}</footer>
  </div>`;
}
